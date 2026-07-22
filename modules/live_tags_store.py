import csv
import hashlib
import os
import sqlite3
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone


LOCALE_ORDER = ("zh", "zh-TW", "ja")


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
                    locale TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )
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

    def create_job(self, kind, locale=None):
        now = utc_now()
        with self._connect() as connection:
            cursor = connection.execute(
                """
                INSERT INTO jobs(kind, status, phase, locale, created_at, updated_at)
                VALUES (?, 'queued', 'queued', ?, ?, ?)
                """,
                (kind, locale, now, now),
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

    def clear_staging(self, job_id):
        with self._connect() as connection:
            connection.execute("DELETE FROM scan_staging WHERE job_id = ?", (job_id,))

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

    def translation_work(self, locale, mode):
        if mode not in {"missing", "failed", "all"}:
            raise ValueError(f"Invalid translation mode: {mode}")
        conditions = {
            "missing": "COALESCE(tr.status, '') != 'success'",
            "failed": "tr.status = 'failed'",
            "all": "1 = 1",
        }
        query = f"""
            SELECT t.name, t.category, t.post_count, tr.status
              FROM tags t
         LEFT JOIN translations tr ON tr.tag_name = t.name AND tr.locale = ?
             WHERE t.active = 1 AND {conditions[mode]}
          ORDER BY t.post_count DESC, t.name ASC
        """
        with self._connect() as connection:
            rows = connection.execute(query, (locale,)).fetchall()
            cached = connection.execute(
                """
                SELECT COUNT(*)
                  FROM tags t
                  JOIN translations tr ON tr.tag_name = t.name
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
                    status = 'failed',
                    attempts = excluded.attempts,
                    model = excluded.model,
                    prompt_hash = excluded.prompt_hash,
                    error = excluded.error,
                    updated_at = excluded.updated_at
                """,
                rows,
            )

    def statistics(self, locale=None, batch_size=100):
        with self._connect() as connection:
            base = connection.execute("SELECT COUNT(*) FROM tags WHERE active = 1").fetchone()[0]
            translated = 0
            failed = 0
            if locale:
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
        untranslated = max(base - translated, 0)
        return {
            "candidates": base,
            "translated": translated,
            "untranslated": untranslated,
            "failed": failed,
            "estimated_requests": (untranslated + batch_size - 1) // batch_size,
        }

    def export_csv(self):
        rows = self._export_rows()
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

    def _export_rows(self):
        with self._connect() as connection:
            tag_rows = connection.execute(
                """
                SELECT name, category, post_count
                  FROM tags
                 WHERE active = 1
              ORDER BY post_count DESC, name ASC
                """
            ).fetchall()
            translation_rows = connection.execute(
                """
                SELECT tr.tag_name, tr.locale, tr.text
                  FROM translations tr
                  JOIN tags t ON t.name = tr.tag_name
                 WHERE t.active = 1 AND tr.status = 'success' AND tr.text IS NOT NULL
                """
            ).fetchall()

        translations = {}
        for row in translation_rows:
            translations.setdefault(row["tag_name"], {})[row["locale"]] = row["text"]

        result = []
        for row in tag_rows:
            aliases = []
            seen = {row["name"]}
            localized = translations.get(row["name"], {})
            for locale in LOCALE_ORDER:
                translation = localized.get(locale, "").strip()
                if translation and translation not in seen:
                    aliases.append(translation)
                    seen.add(translation)
            result.append((row["name"], row["category"], row["post_count"], ",".join(aliases)))
        return result
