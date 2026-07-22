import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone


def utc_now():
    return datetime.now(timezone.utc).isoformat()


class TranslationStore:
    """Persistent dictionary for successful, locale-specific tag translations."""

    def __init__(self, database_path):
        self.database_path = database_path
        self._initialize()

    @contextmanager
    def _connect(self):
        connection = sqlite3.connect(self.database_path, timeout=30)
        connection.row_factory = sqlite3.Row
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def _initialize(self):
        import os

        os.makedirs(os.path.dirname(self.database_path), exist_ok=True)
        with self._connect() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS translations (
                    tag_name TEXT NOT NULL,
                    locale TEXT NOT NULL,
                    text TEXT NOT NULL,
                    category INTEGER NOT NULL DEFAULT 0,
                    post_count INTEGER NOT NULL DEFAULT 0,
                    origin TEXT NOT NULL DEFAULT 'local',
                    model TEXT,
                    prompt_hash TEXT,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY(tag_name, locale)
                )
                """
            )

    def get_many(self, locale, tag_names):
        names = list(dict.fromkeys(tag_names))
        if not names:
            return {}
        placeholders = ",".join("?" for _ in names)
        with self._connect() as connection:
            rows = connection.execute(
                f"SELECT * FROM translations WHERE locale = ? AND tag_name IN ({placeholders})",
                (locale, *names),
            ).fetchall()
        return {row["tag_name"]: dict(row) for row in rows}

    def catalog(self, locale):
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT tag_name, locale, text, category, post_count, origin, updated_at
                  FROM translations
                 WHERE locale = ?
                   AND (origin != 'danbooru_api' OR post_count > 0)
                 ORDER BY post_count DESC, tag_name ASC
                """,
                (locale,),
            ).fetchall()
        return [dict(row) for row in rows]

    def save_many(self, locale, items, translations, model, prompt_hash):
        if not translations:
            return
        metadata = {item["name"]: item for item in items}
        rows = []
        now = utc_now()
        for tag_name, text in translations.items():
            item = metadata[tag_name]
            rows.append(
                (
                    tag_name,
                    locale,
                    text,
                    item["category"],
                    item["post_count"],
                    item["origin"],
                    model,
                    prompt_hash,
                    now,
                )
            )
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO translations(
                    tag_name, locale, text, category, post_count, origin, model, prompt_hash, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(tag_name, locale) DO UPDATE SET
                    text = excluded.text,
                    category = excluded.category,
                    post_count = excluded.post_count,
                    origin = excluded.origin,
                    model = excluded.model,
                    prompt_hash = excluded.prompt_hash,
                    updated_at = excluded.updated_at
                """,
                rows,
            )

    def count(self):
        with self._connect() as connection:
            return connection.execute("SELECT COUNT(*) FROM translations").fetchone()[0]
