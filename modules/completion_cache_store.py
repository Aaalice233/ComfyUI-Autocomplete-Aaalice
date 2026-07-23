import json
import os
import sqlite3
from contextlib import contextmanager

SCHEMA_VERSION = 1


class CompletionCacheStore:
    """Disposable persistent snapshots of remote completion result pages."""

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
        os.makedirs(os.path.dirname(self.database_path), exist_ok=True)
        with self._connect() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("PRAGMA busy_timeout=30000")
            database_version = connection.execute("PRAGMA user_version").fetchone()[0]
            if database_version > SCHEMA_VERSION:
                raise RuntimeError(
                    f"Completion cache schema {database_version} is newer than supported version {SCHEMA_VERSION}"
                )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS completion_cache (
                    provider TEXT NOT NULL,
                    normalized_query TEXT NOT NULL,
                    page INTEGER NOT NULL,
                    page_size INTEGER NOT NULL,
                    policy_version INTEGER NOT NULL,
                    payload_json TEXT NOT NULL,
                    raw_count INTEGER NOT NULL,
                    result_count INTEGER NOT NULL,
                    has_more INTEGER NOT NULL,
                    fetched_at REAL NOT NULL,
                    fresh_until REAL NOT NULL,
                    stale_until REAL NOT NULL,
                    last_accessed_at REAL NOT NULL,
                    PRIMARY KEY(provider, normalized_query, page, page_size, policy_version)
                )
                """
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS completion_cache_accessed ON completion_cache(last_accessed_at)"
            )
            connection.execute(f"PRAGMA user_version={SCHEMA_VERSION}")

    def get(self, key, now):
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT * FROM completion_cache
                 WHERE provider = ? AND normalized_query = ? AND page = ?
                   AND page_size = ? AND policy_version = ?
                """,
                key,
            ).fetchone()
            if row is None:
                return None
            try:
                items = json.loads(row["payload_json"])
                if not isinstance(items, list):
                    raise ValueError("Cached payload must be a list")
            except (json.JSONDecodeError, TypeError, ValueError):
                connection.execute(
                    """
                    DELETE FROM completion_cache
                     WHERE provider = ? AND normalized_query = ? AND page = ?
                       AND page_size = ? AND policy_version = ?
                    """,
                    key,
                )
                return None
            if now - row["last_accessed_at"] >= 3600:
                connection.execute(
                    """
                    UPDATE completion_cache SET last_accessed_at = ?
                     WHERE provider = ? AND normalized_query = ? AND page = ?
                       AND page_size = ? AND policy_version = ?
                    """,
                    (now, *key),
                )
        result = dict(row)
        result["items"] = items
        return result

    def put(self, key, completion_page, now, fresh_until, stale_until):
        items = completion_page["items"]
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO completion_cache(
                    provider, normalized_query, page, page_size, policy_version,
                    payload_json, raw_count, result_count, has_more,
                    fetched_at, fresh_until, stale_until, last_accessed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(provider, normalized_query, page, page_size, policy_version) DO UPDATE SET
                    payload_json = excluded.payload_json,
                    raw_count = excluded.raw_count,
                    result_count = excluded.result_count,
                    has_more = excluded.has_more,
                    fetched_at = excluded.fetched_at,
                    fresh_until = excluded.fresh_until,
                    stale_until = excluded.stale_until,
                    last_accessed_at = excluded.last_accessed_at
                """,
                (
                    *key,
                    json.dumps(items, ensure_ascii=False, separators=(",", ":")),
                    completion_page["raw_count"],
                    len(items),
                    int(completion_page["has_more"]),
                    now,
                    fresh_until,
                    stale_until,
                    now,
                ),
            )

    def cleanup(self, now, max_entries):
        with self._connect() as connection:
            connection.execute("DELETE FROM completion_cache WHERE stale_until <= ?", (now,))
            count = connection.execute("SELECT COUNT(*) FROM completion_cache").fetchone()[0]
            excess = max(count - max_entries, 0)
            if excess:
                connection.execute(
                    """
                    DELETE FROM completion_cache WHERE rowid IN (
                        SELECT rowid FROM completion_cache ORDER BY last_accessed_at ASC LIMIT ?
                    )
                    """,
                    (excess,),
                )

    def clear(self):
        with self._connect() as connection:
            deleted = connection.execute("DELETE FROM completion_cache").rowcount
        return deleted

    def stats(self, now):
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT COUNT(*) AS entries,
                       SUM(CASE WHEN fresh_until > ? THEN 1 ELSE 0 END) AS fresh_entries,
                       SUM(CASE WHEN fresh_until <= ? AND stale_until > ? THEN 1 ELSE 0 END) AS stale_entries
                  FROM completion_cache
                """,
                (now, now, now),
            ).fetchone()
        size_bytes = sum(
            os.path.getsize(path)
            for path in (self.database_path, f"{self.database_path}-wal", f"{self.database_path}-shm")
            if os.path.exists(path)
        )
        return {
            "entries": row["entries"] or 0,
            "fresh_entries": row["fresh_entries"] or 0,
            "stale_entries": row["stale_entries"] or 0,
            "size_bytes": size_bytes,
        }
