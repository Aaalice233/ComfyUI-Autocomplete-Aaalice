import asyncio
import time
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True)
class CompletionCachePolicy:
    fresh_seconds: int = 7 * 24 * 60 * 60
    empty_fresh_seconds: int = 12 * 60 * 60
    stale_seconds: int = 90 * 24 * 60 * 60
    empty_stale_seconds: int = 7 * 24 * 60 * 60
    max_entries: int = 5000
    cleanup_interval_seconds: int = 24 * 60 * 60
    version: int = 1


class CompletionSearchService:
    def __init__(self, provider, store, policy=None, clock=None):
        self.provider = provider
        self.store = store
        self.policy = policy or CompletionCachePolicy()
        self.clock = clock or time.time
        self._inflight = {}
        self._inflight_lock = asyncio.Lock()
        self._last_cleanup_at = 0
        self._last_status = {"state": "idle", "message": "", "updated_at": None}

    async def search(self, query, limit, page=1, force_refresh=False):
        normalized = self.provider.normalize_query(query)
        limit = min(max(int(limit), 1), self.provider.max_page_size)
        page = min(max(int(page), 1), 1000)
        if not self.provider.is_valid_query(normalized):
            return self._empty_page("skipped")

        cache_version = getattr(self.provider, "cache_version", self.policy.version)
        key = (self.provider.name, normalized, page, limit, cache_version)
        now = self.clock()
        cached = await asyncio.to_thread(self.store.get, key, now)
        if cached and not force_refresh and cached["fresh_until"] > now:
            self._set_status("success", f"Persistent cache hit for {normalized}* page {page}")
            return self._cached_page(cached, "fresh")
        if cached and not force_refresh and cached["stale_until"] > now:
            self._start_refresh(key, normalized, limit, page, cached)
            self._set_status("success", f"Serving stale cache for {normalized}* page {page}; refresh scheduled")
            return self._cached_page(cached, "stale")
        return await self._singleflight_refresh(key, normalized, limit, page, cached)

    async def clear_cache(self):
        deleted = await asyncio.to_thread(self.store.clear)
        self._set_status("success", f"Cleared {deleted} cached Danbooru result page(s)")
        return deleted

    async def status(self):
        status = self._last_status.copy()
        status["cache"] = await asyncio.to_thread(self.store.stats, self.clock())
        return status

    def _start_refresh(self, key, normalized, limit, page, cached):
        async def schedule():
            await self._singleflight_refresh(key, normalized, limit, page, cached)

        task = asyncio.create_task(schedule())
        task.add_done_callback(self._consume_background_exception)

    async def _singleflight_refresh(self, key, normalized, limit, page, cached):
        async with self._inflight_lock:
            task = self._inflight.get(key)
            if task is None:
                task = asyncio.create_task(self._refresh(key, normalized, limit, page, cached))
                self._inflight[key] = task
                task.add_done_callback(lambda completed: asyncio.create_task(self._remove_inflight(key, completed)))
        return await asyncio.shield(task)

    async def _remove_inflight(self, key, task):
        async with self._inflight_lock:
            if self._inflight.get(key) is task:
                self._inflight.pop(key, None)

    async def _refresh(self, key, normalized, limit, page, cached):
        try:
            completion_page = await self.provider.search(normalized, limit, page)
            now = self.clock()
            is_empty = not completion_page["items"]
            fresh_seconds = self.policy.empty_fresh_seconds if is_empty else self.policy.fresh_seconds
            stale_seconds = self.policy.empty_stale_seconds if is_empty else self.policy.stale_seconds
            await asyncio.to_thread(
                self.store.put,
                key,
                completion_page,
                now,
                now + fresh_seconds,
                now + stale_seconds,
            )
            await self._cleanup_if_due(now)
            self._set_status(
                "success",
                f'{normalized}* page {page}: returned {len(completion_page["items"])} '
                f'of {completion_page["raw_count"]} raw tag(s)',
            )
            return self._page(completion_page, "refreshed", now)
        except Exception as error:
            self._set_status("error", str(error)[:500])
            now = self.clock()
            if cached and cached["stale_until"] > now:
                return self._cached_page(cached, "stale_if_error")
            return self._empty_page("error")

    async def _cleanup_if_due(self, now):
        if now - self._last_cleanup_at < self.policy.cleanup_interval_seconds:
            return
        self._last_cleanup_at = now
        await asyncio.to_thread(self.store.cleanup, now, self.policy.max_entries)

    def _cached_page(self, cached, state):
        return {
            "items": cached["items"],
            "raw_count": cached["raw_count"],
            "has_more": bool(cached["has_more"]),
            "cache": {"state": state, "fetched_at": cached["fetched_at"]},
        }

    @staticmethod
    def _page(completion_page, state, fetched_at):
        return {
            **completion_page,
            "cache": {"state": state, "fetched_at": fetched_at},
        }

    @staticmethod
    def _empty_page(state):
        return {
            "items": [],
            "raw_count": 0,
            "has_more": False,
            "cache": {"state": state, "fetched_at": None},
        }

    def _set_status(self, state, message):
        self._last_status = {
            "state": state,
            "message": message,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def _consume_background_exception(task):
        try:
            task.result()
        except asyncio.CancelledError:
            pass
        except Exception:
            pass
