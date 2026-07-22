import csv
import hashlib
import json
import os
import re
import sqlite3
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone


LOCALE_ORDER = ("zh", "zh-TW", "ja")
LOCALE_ALIAS_COLUMNS = {
    "zh": "has_zh_alias",
    "zh-TW": "has_zh_tw_alias",
    "ja": "has_ja_alias",
}

HAN_PATTERN = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
KANA_PATTERN = re.compile(r"[\u3040-\u30ff\u31f0-\u31ff]")
HANGUL_PATTERN = re.compile(r"[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]")


def has_alias_for_locale(aliases, locale):
    for alias in aliases:
        value = str(alias).strip()
        has_han = bool(HAN_PATTERN.search(value))
        has_kana = bool(KANA_PATTERN.search(value))
        has_hangul = bool(HANGUL_PATTERN.search(value))
        if locale in {"zh", "zh-TW"} and has_han and not has_kana and not has_hangul:
            return True
        if locale == "ja" and has_kana:
            return True
    return False


def utc_now():
    return datetime.now(timezone.utc).isoformat()


class LiveTagsStore:
    def __init__(self, database_path, csv_path):
        self.database_path = database_path
        self.csv_path = csv_path
        os.makedirs(os.path.dirname(database_path), exist_ok=True)
        self._initialize()

    @contextmanager
    def _connect(self):
        connection = sqlite3.connect(self.database_path, timeout=30)
        try:
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA foreign_keys = ON")
            connection.execute("PRAGMA busy_timeout = 30000")
            with connection:
                yield connection
        finally:
            connection.close()

    def _initialize(self):
        with self._connect() as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS tags (
                    danbooru_id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL UNIQUE,
                    category INTEGER NOT NULL,
                    post_count INTEGER NOT NULL,
                    active INTEGER NOT NULL DEFAULT 0,
                    last_seen TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS tags_active_count_idx
                    ON tags(active, post_count DESC, name ASC);

                CREATE TABLE IF NOT EXISTS base_tags (
                    name TEXT PRIMARY KEY,
                    category INTEGER NOT NULL,
                    post_count INTEGER NOT NULL,
                    aliases_json TEXT NOT NULL,
                    has_zh_alias INTEGER NOT NULL DEFAULT 0,
                    has_zh_tw_alias INTEGER NOT NULL DEFAULT 0,
                    has_ja_alias INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS scan_staging (
                    job_id INTEGER NOT NULL,
                    danbooru_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    category INTEGER NOT NULL,
                    post_count INTEGER NOT NULL,
                    PRIMARY KEY(job_id, danbooru_id)
                );

                CREATE TABLE IF NOT EXISTS translations (
                    tag_name TEXT NOT NULL,
                    locale TEXT NOT NULL,
                    text TEXT,
                    status TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    model TEXT,
                    prompt_hash TEXT,
                    error TEXT,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY(tag_name, locale)
                );

                CREATE TABLE IF NOT EXISTS jobs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    kind TEXT NOT NULL,
                    status TEXT NOT NULL,
                    phase TEXT NOT NULL,
                    total INTEGER NOT NULL DEFAULT 0,
                    completed INTEGER NOT NULL DEFAULT 0,
                    cached INTEGER NOT NULL DEFAULT 0,
                    failed INTEGER NOT NULL DEFAULT 0,
                    retrying INTEGER NOT NULL DEFAULT 0,
                    message TEXT,
                    error TEXT,
                    error_code TEXT,
                    locale TEXT,
                    mode TEXT,
                    options_json TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS scan_partitions (
                    job_id INTEGER NOT NULL,
                    category TEXT NOT NULL,
                    range_start INTEGER NOT NULL,
                    range_end INTEGER NOT NULL,
                    cursor INTEGER,
                    scanned INTEGER NOT NULL DEFAULT 0,
                    candidates INTEGER NOT NULL DEFAULT 0,
                    done INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY(job_id, category, range_start),
                    FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS translation_queue (
                    job_id INTEGER NOT NULL,
                    tag_name TEXT NOT NULL,
                    category INTEGER NOT NULL,
                    post_count INTEGER NOT NULL,
                    state TEXT NOT NULL DEFAULT 'pending',
                    PRIMARY KEY(job_id, tag_name),
                    FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
                );
                """
            )
            job_columns = {row["name"] for row in connection.execute("PRAGMA table_info(jobs)")}
            if "error_code" not in job_columns:
                connection.execute("ALTER TABLE jobs ADD COLUMN error_code TEXT")
            if "mode" not in job_columns:
                connection.execute("ALTER TABLE jobs ADD COLUMN mode TEXT")
            if "options_json" not in job_columns:
                connection.execute("ALTER TABLE jobs ADD COLUMN options_json TEXT")
            now = utc_now()
            connection.execute(
                """
                UPDATE jobs
                   SET status = 'interrupted', phase = 'interrupted',
                       message = 'ComfyUI stopped before the task completed', updated_at = ?
                 WHERE status IN ('queued', 'running', 'cancelling')
                """,
                (now,),
            )

    def create_job(self, kind, locale=None, mode=None, options=None):
        now = utc_now()
        with self._connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO jobs(kind, status, phase, locale, mode, options_json, created_at, updated_at)
                VALUES (?, 'queued', 'queued', ?, ?, ?, ?, ?)
                """,
                (kind, locale, mode, json.dumps(options, ensure_ascii=False) if options is not None else None, now, now),
            )
            return cursor.lastrowid

    def update_job(self, job_id, **values):
        allowed = {
            "status",
            "phase",
            "total",
            "completed",
            "cached",
            "failed",
            "retrying",
            "message",
            "error",
            "error_code",
        }
        updates = {key: value for key, value in values.items() if key in allowed}
        if not updates:
            return
        updates["updated_at"] = utc_now()
        assignments = ", ".join(f"{key} = ?" for key in updates)
        with self._connect() as connection:
            connection.execute(
                f"UPDATE jobs SET {assignments} WHERE id = ?",  # noqa: S608 - column names come from an allowlist
                (*updates.values(), job_id),
            )

    def latest_job(self):
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM jobs ORDER BY id DESC LIMIT 1").fetchone()
        return dict(row) if row else None

    def latest_resumable_job(self):
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT * FROM jobs
                 WHERE status IN ('interrupted', 'cancelled', 'failed')
                   AND ((kind = 'scan' AND EXISTS (SELECT 1 FROM scan_partitions p WHERE p.job_id = jobs.id AND p.done = 0))
                     OR (kind = 'translate' AND EXISTS (SELECT 1 FROM translation_queue q WHERE q.job_id = jobs.id AND q.state = 'pending')))
                 ORDER BY id DESC LIMIT 1
                """
            ).fetchone()
        return dict(row) if row else None

    def job(self, job_id):
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        return dict(row) if row else None

    def discard_resumable_jobs(self, kind):
        with self._connect() as connection:
            job_ids = [
                row[0]
                for row in connection.execute(
                    "SELECT id FROM jobs WHERE kind = ? AND status IN ('interrupted', 'cancelled', 'failed')",
                    (kind,),
                )
            ]
            for job_id in job_ids:
                connection.execute("DELETE FROM scan_staging WHERE job_id = ?", (job_id,))
                connection.execute("DELETE FROM scan_partitions WHERE job_id = ?", (job_id,))
                connection.execute("DELETE FROM translation_queue WHERE job_id = ?", (job_id,))

    def initialize_scan_partitions(self, job_id, categories, id_ranges):
        rows = [
            (job_id, category, range_start, range_end)
            for category in categories
            for range_start, range_end in id_ranges
        ]
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT OR IGNORE INTO scan_partitions(job_id, category, range_start, range_end)
                VALUES (?, ?, ?, ?)
                """,
                rows,
            )

    def pending_scan_partitions(self, job_id):
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT category, range_start, range_end, cursor, scanned, candidates
                  FROM scan_partitions WHERE job_id = ? AND done = 0
                 ORDER BY category, range_start
                """,
                (job_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def checkpoint_scan_partition(self, job_id, category, range_start, cursor, scanned, candidates, done=False):
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE scan_partitions
                   SET cursor = ?, scanned = scanned + ?, candidates = candidates + ?, done = ?
                 WHERE job_id = ? AND category = ? AND range_start = ?
                """,
                (cursor, scanned, candidates, int(done), job_id, category, range_start),
            )

    def scan_progress(self, job_id):
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT category, SUM(scanned) AS scanned, SUM(candidates) AS candidates,
                       SUM(done) AS completed_partitions, COUNT(*) AS total_partitions
                  FROM scan_partitions WHERE job_id = ? GROUP BY category ORDER BY category
                """,
                (job_id,),
            ).fetchall()
        categories = [dict(row) for row in rows]
        return {
            "categories": categories,
            "scanned": sum(row["scanned"] or 0 for row in categories),
            "candidates": sum(row["candidates"] or 0 for row in categories),
            "completed_partitions": sum(row["completed_partitions"] or 0 for row in categories),
            "total_partitions": sum(row["total_partitions"] or 0 for row in categories),
        }

    def initialize_translation_queue(self, job_id, work):
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT OR IGNORE INTO translation_queue(job_id, tag_name, category, post_count)
                VALUES (?, ?, ?, ?)
                """,
                [(job_id, item["name"], item["category"], item["post_count"]) for item in work],
            )

    def pending_translation_work(self, job_id):
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT tag_name AS name, category, post_count FROM translation_queue
                 WHERE job_id = ? AND state = 'pending' ORDER BY post_count DESC, tag_name
                """,
                (job_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def complete_translation_items(self, job_id, tag_names):
        if not tag_names:
            return
        with self._connect() as connection:
            connection.executemany(
                "UPDATE translation_queue SET state = 'done' WHERE job_id = ? AND tag_name = ?",
                [(job_id, tag_name) for tag_name in tag_names],
            )

    def translation_queue_progress(self, job_id):
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT COUNT(*) AS total, SUM(state = 'done') AS completed
                  FROM translation_queue WHERE job_id = ?
                """,
                (job_id,),
            ).fetchone()
        return {"total": row["total"] or 0, "completed": row["completed"] or 0}

    def clear_staging(self, job_id):
        with self._connect() as connection:
            connection.execute("DELETE FROM scan_staging WHERE job_id = ?", (job_id,))
            connection.execute("DELETE FROM scan_partitions WHERE job_id = ?", (job_id,))

    def stage_tags(self, job_id, tags):
        rows = [
            (job_id, tag["id"], tag["name"], tag["category"], tag["post_count"])
            for tag in tags
        ]
        if not rows:
            return
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO scan_staging(job_id, danbooru_id, name, category, post_count)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(job_id, danbooru_id) DO UPDATE SET
                    name = excluded.name,
                    category = excluded.category,
                    post_count = excluded.post_count
                """,
                rows,
            )

    def commit_scan(self, job_id):
        now = utc_now()
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute("UPDATE tags SET active = 0")
            connection.execute(
                """
                INSERT INTO tags(danbooru_id, name, category, post_count, active, last_seen)
                SELECT danbooru_id, name, category, post_count, 1, ?
                  FROM scan_staging
                 WHERE job_id = ?
                ON CONFLICT(danbooru_id) DO UPDATE SET
                    name = excluded.name,
                    category = excluded.category,
                    post_count = excluded.post_count,
                    active = 1,
                    last_seen = excluded.last_seen
                """,
                (now, job_id),
            )
            connection.execute("DELETE FROM scan_staging WHERE job_id = ?", (job_id,))

    def candidate_count(self):
        with self._connect() as connection:
            return connection.execute("SELECT COUNT(*) FROM tags WHERE active = 1").fetchone()[0]

    def exportable_count(self):
        with self._connect() as connection:
            return connection.execute(
                """
                SELECT
                    (SELECT COUNT(*) FROM tags WHERE active = 1)
                    +
                    (SELECT COUNT(*) FROM base_tags b
                      WHERE EXISTS (
                          SELECT 1 FROM translations tr
                           WHERE tr.tag_name = b.name AND tr.status = 'success' AND tr.text IS NOT NULL
                      )
                        AND NOT EXISTS (SELECT 1 FROM tags t WHERE t.active = 1 AND t.name = b.name))
                """
            ).fetchone()[0]

    def sync_base_tags(self, tags):
        rows = []
        for tag in tags:
            aliases = list(dict.fromkeys(alias for alias in tag["aliases"] if alias))
            rows.append(
                (
                    tag["name"],
                    tag["category"],
                    tag["post_count"],
                    json.dumps(aliases, ensure_ascii=False),
                    int(has_alias_for_locale(aliases, "zh")),
                    int(has_alias_for_locale(aliases, "zh-TW")),
                    int(has_alias_for_locale(aliases, "ja")),
                )
            )
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute("DELETE FROM base_tags")
            connection.executemany(
                """
                INSERT INTO base_tags(
                    name, category, post_count, aliases_json,
                    has_zh_alias, has_zh_tw_alias, has_ja_alias
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                rows,
            )

    def translation_work(self, locale, mode):
        if mode not in {"missing", "failed", "all"}:
            raise ValueError(f"Invalid translation mode: {mode}")
        conditions = {
            "missing": f"COALESCE(tr.status, '') != 'success' AND COALESCE(b.{LOCALE_ALIAS_COLUMNS.get(locale, 'has_zh_alias')}, 0) = 0",
            "failed": "tr.status = 'failed'",
            "all": "1 = 1",
        }
        locale_column = LOCALE_ALIAS_COLUMNS.get(locale)
        if not locale_column:
            return [], 0
        query = f"""
            SELECT t.name, t.category, t.post_count, tr.status
              FROM tags t
         LEFT JOIN base_tags b ON b.name = t.name
         LEFT JOIN translations tr ON tr.tag_name = t.name AND tr.locale = ?
             WHERE t.active = 1 AND {conditions[mode]}
          ORDER BY t.post_count DESC, t.name ASC
        """
        with self._connect() as connection:
            rows = connection.execute(query, (locale,)).fetchall()
            cached = connection.execute(
                """
                SELECT COUNT(*) FROM tags t JOIN translations tr ON tr.tag_name = t.name
                 WHERE t.active = 1 AND tr.locale = ? AND tr.status = 'success'
                """,
                (locale,),
            ).fetchone()[0]
        return [dict(row) for row in rows], cached

    def save_translation_successes(self, locale, translations, model, prompt, attempts):
        if not translations:
            return
        now = utc_now()
        prompt_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
        rows = [
            (tag, locale, text, attempts, model, prompt_hash, now)
            for tag, text in translations.items()
        ]
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO translations(
                    tag_name, locale, text, status, attempts, model, prompt_hash, error, updated_at
                ) VALUES (?, ?, ?, 'success', ?, ?, ?, NULL, ?)
                ON CONFLICT(tag_name, locale) DO UPDATE SET
                    text = excluded.text,
                    status = 'success',
                    attempts = excluded.attempts,
                    model = excluded.model,
                    prompt_hash = excluded.prompt_hash,
                    error = NULL,
                    updated_at = excluded.updated_at
                """,
                rows,
            )

    def save_translation_failures(self, locale, tag_names, model, prompt, attempts, error):
        if not tag_names:
            return
        now = utc_now()
        prompt_hash = hashlib.sha256(prompt.encode("utf-8")).hexdigest()
        safe_error = str(error)[:1000]
        rows = [(tag, locale, attempts, model, prompt_hash, safe_error, now) for tag in tag_names]
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO translations(
                    tag_name, locale, text, status, attempts, model, prompt_hash, error, updated_at
                ) VALUES (?, ?, NULL, 'failed', ?, ?, ?, ?, ?)
                ON CONFLICT(tag_name, locale) DO UPDATE SET
                    status = CASE WHEN translations.status = 'success' THEN 'success' ELSE 'failed' END,
                    attempts = excluded.attempts,
                    model = excluded.model,
                    prompt_hash = excluded.prompt_hash,
                    error = CASE WHEN translations.status = 'success' THEN translations.error ELSE excluded.error END,
                    updated_at = excluded.updated_at
                """,
                rows,
            )

    def statistics(self, locale=None, batch_size=100):
        with self._connect() as connection:
            candidates = connection.execute("SELECT COUNT(*) FROM tags WHERE active = 1").fetchone()[0]
            base_missing = 0
            translated = 0
            failed = 0
            locale_column = LOCALE_ALIAS_COLUMNS.get(locale)
            if locale_column:
                base_missing = connection.execute(
                    f"""
                    SELECT COUNT(*) FROM tags t
                 LEFT JOIN base_tags b ON b.name = t.name
                 LEFT JOIN translations tr ON tr.tag_name = t.name AND tr.locale = ?
                     WHERE t.active = 1
                       AND COALESCE(b.{locale_column}, 0) = 0
                       AND COALESCE(tr.status, '') != 'success'
                    """,
                    (locale,),
                ).fetchone()[0]
                translated = connection.execute(
                    """
                    SELECT COUNT(*) FROM tags t JOIN translations tr ON tr.tag_name = t.name
                     WHERE t.active = 1 AND tr.locale = ? AND tr.status = 'success'
                    """,
                    (locale,),
                ).fetchone()[0]
                failed = connection.execute(
                    """
                    SELECT COUNT(*) FROM tags t JOIN translations tr ON tr.tag_name = t.name
                     WHERE t.active = 1 AND tr.locale = ? AND tr.status = 'failed'
                    """,
                    (locale,),
                ).fetchone()[0]
        untranslated = base_missing
        return {
            "candidates": candidates,
            "base_missing": base_missing,
            "translated": translated,
            "untranslated": untranslated,
            "failed": failed,
            "estimated_requests": (untranslated + batch_size - 1) // batch_size,
        }

    def tag_statistics(self):
        with self._connect() as connection:
            rows = connection.execute(
                """
                WITH counts AS (
                    SELECT category, 'base' AS source, COUNT(*) AS count FROM base_tags GROUP BY category
                    UNION ALL
                    SELECT category, 'live' AS source, COUNT(*) AS count FROM tags WHERE active = 1 GROUP BY category
                )
                SELECT category,
                       SUM(CASE WHEN source = 'base' THEN count ELSE 0 END) AS base_count,
                       SUM(CASE WHEN source = 'live' THEN count ELSE 0 END) AS live_count
                  FROM counts GROUP BY category ORDER BY category
                """
            ).fetchall()
            last_scan = connection.execute(
                "SELECT updated_at FROM jobs WHERE kind = 'scan' AND status = 'completed' ORDER BY id DESC LIMIT 1"
            ).fetchone()
        categories = [dict(row) for row in rows]
        live_count = sum(row["live_count"] or 0 for row in categories)
        for row in categories:
            row["total_count"] = (row["live_count"] or 0) if live_count else (row["base_count"] or 0)
        return {
            "categories": categories,
            "base_count": sum(row["base_count"] or 0 for row in categories),
            "live_count": live_count,
            "total_count": sum(row["total_count"] or 0 for row in categories),
            "last_scan_at": last_scan["updated_at"] if last_scan else None,
        }

    def tag_list(self, category=None, source="all", query="", limit=100, offset=0):
        if source not in {"all", "base", "live"}:
            raise ValueError("Invalid tag source")
        parts = []
        params = []
        if source in {"all", "base"}:
            parts.append("SELECT name, category, post_count, 'base' AS source FROM base_tags")
        if source in {"all", "live"}:
            parts.append("SELECT name, category, post_count, 'live' AS source FROM tags WHERE active = 1")
        filters = []
        if category is not None:
            filters.append("category = ?")
            params.append(category)
        if query:
            filters.append("name LIKE ? ESCAPE '\\'")
            escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            params.append(f"%{escaped}%")
        where = f"WHERE {' AND '.join(filters)}" if filters else ""
        union = " UNION ALL ".join(parts)
        with self._connect() as connection:
            total = connection.execute(f"SELECT COUNT(*) FROM ({union}) {where}", params).fetchone()[0]
            rows = connection.execute(
                f"""
                SELECT name, category, post_count, source FROM ({union}) {where}
                 ORDER BY post_count DESC, name ASC LIMIT ? OFFSET ?
                """,
                (*params, limit, offset),
            ).fetchall()
        return {"total": total, "items": [dict(row) for row in rows]}

    def translation_dictionary(self, locale=None, query="", limit=100, offset=0):
        filters = []
        params = []
        if locale:
            filters.append("locale = ?")
            params.append(locale)
        if query:
            filters.append("(tag_name LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\')")
            escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            params.extend((f"%{escaped}%", f"%{escaped}%"))
        where = f"WHERE {' AND '.join(filters)}" if filters else ""
        with self._connect() as connection:
            summary_rows = connection.execute(
                """
                SELECT locale, status, COUNT(*) AS count FROM translations
                 GROUP BY locale, status ORDER BY locale, status
                """
            ).fetchall()
            total = connection.execute(f"SELECT COUNT(*) FROM translations {where}", params).fetchone()[0]
            rows = connection.execute(
                f"""
                SELECT tag_name, locale, text, status, attempts, model, updated_at
                  FROM translations {where}
                 ORDER BY updated_at DESC, tag_name LIMIT ? OFFSET ?
                """,
                (*params, limit, offset),
            ).fetchall()
        return {
            "summary": [dict(row) for row in summary_rows],
            "total": total,
            "items": [dict(row) for row in rows],
        }

    def export_csv(self, staging_job_id=None):
        rows = self._export_rows(staging_job_id)
        os.makedirs(os.path.dirname(self.csv_path), exist_ok=True)
        file_descriptor, temp_path = tempfile.mkstemp(
            prefix="danbooru-tags-live-",
            suffix=".csv.tmp",
            dir=os.path.dirname(self.csv_path),
        )
        try:
            with os.fdopen(file_descriptor, "w", encoding="utf-8", newline="") as csv_file:
                writer = csv.writer(csv_file, lineterminator="\n")
                writer.writerow(("tag", "category", "count", "alias"))
                writer.writerows(rows)
            os.replace(temp_path, self.csv_path)
        except Exception:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            raise
        return len(rows)

    def _export_rows(self, staging_job_id=None):
        with self._connect() as connection:
            if staging_job_id is None:
                live_tags = "SELECT name, category, post_count FROM tags WHERE active = 1"
                live_params = ()
            else:
                live_tags = """
                    SELECT name, category, post_count FROM scan_staging WHERE job_id = ?
                    UNION ALL
                    SELECT t.name, t.category, t.post_count FROM tags t
                     WHERE t.active = 1
                       AND NOT EXISTS (
                           SELECT 1 FROM scan_staging s WHERE s.job_id = ? AND s.name = t.name
                       )
                """
                live_params = (staging_job_id, staging_job_id)
            tag_rows = connection.execute(
                f"""
                WITH live AS ({live_tags})
                SELECT live.name, live.category, live.post_count,
                       COALESCE(b.aliases_json, '[]') AS aliases_json, 0 AS is_base
                  FROM live LEFT JOIN base_tags b ON b.name = live.name
                """,
                live_params,
            ).fetchall()
            translation_rows = connection.execute(
                f"""
                WITH live AS ({live_tags})
                SELECT tr.tag_name, tr.locale, tr.text
                  FROM translations tr
                 WHERE tr.status = 'success' AND tr.text IS NOT NULL
                   AND (
                       EXISTS (SELECT 1 FROM live WHERE live.name = tr.tag_name)
                    )
                """,
                live_params,
            ).fetchall()

        translations = {}
        for row in translation_rows:
            translations.setdefault(row["tag_name"], {})[row["locale"]] = row["text"]

        result = []
        for row in tag_rows:
            aliases = json.loads(row["aliases_json"])
            seen = {row["name"], *aliases}
            added_translation = False
            localized = translations.get(row["name"], {})
            for locale in LOCALE_ORDER:
                translation = localized.get(locale, "").strip()
                if translation and translation not in seen:
                    aliases.append(translation)
                    seen.add(translation)
                    added_translation = True
            if not row["is_base"] or added_translation:
                result.append((row["name"], row["category"], row["post_count"], ",".join(aliases)))
        return sorted(result, key=lambda row: (-row[2], row[0]))
