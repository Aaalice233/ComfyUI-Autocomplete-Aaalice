import asyncio
import re
import time
from datetime import datetime, timezone

import aiohttp


DANBOORU_TAGS_URL = "https://danbooru.donmai.us/tags.json"
USER_AGENT = "Autocomplete-Plus/1.12"
SUPPORTED_CATEGORIES = {0, 1, 3, 4, 5}


class DanbooruSearchService:
    def __init__(self, session_factory=None, timeout_seconds=3, cooldown_seconds=30):
        self.session_factory = session_factory or aiohttp.ClientSession
        self.timeout_seconds = timeout_seconds
        self.cooldown_seconds = cooldown_seconds
        self._unavailable_until = 0
        self._last_status = {"state": "idle", "message": "", "updated_at": None}

    def status(self):
        status = self._last_status.copy()
        status["cooldown"] = max(round(self._unavailable_until - time.monotonic()), 0)
        return status

    async def search(self, query, limit, page=1):
        normalized = normalize_query(query)
        limit = min(max(int(limit), 1), 50)
        page = min(max(int(page), 1), 1000)
        if len(re.sub(r"[^A-Za-z0-9]", "", normalized)) < 2:
            return []
        if time.monotonic() < self._unavailable_until:
            return []

        timeout = aiohttp.ClientTimeout(total=self.timeout_seconds)
        params = {
            "search[name_matches]": f"{normalized}*",
            "search[order]": "count",
            "search[hide_empty]": "true",
            "limit": str(limit),
            "page": str(page),
        }
        try:
            async with self.session_factory(timeout=timeout) as session:
                async with session.get(
                    DANBOORU_TAGS_URL,
                    params=params,
                    headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
                ) as response:
                    if response.status != 200:
                        raise RuntimeError(f"Danbooru returned HTTP {response.status}")
                    payload = await response.json()
            if not isinstance(payload, list):
                raise RuntimeError("Danbooru returned an invalid response")
            results = []
            for item in payload:
                try:
                    category = int(item["category"])
                    post_count = int(item.get("post_count") or 0)
                    if (
                        category not in SUPPORTED_CATEGORIES
                        or bool(item.get("is_deprecated"))
                        or post_count <= 0
                    ):
                        continue
                    results.append(
                        {
                            "name": str(item["name"]),
                            "category": category,
                            "post_count": post_count,
                        }
                    )
                except (KeyError, TypeError, ValueError):
                    continue
            self._set_status("success", f"Returned {len(results)} tag(s)")
            self._unavailable_until = 0
            return results[:limit]
        except (aiohttp.ClientError, asyncio.TimeoutError, RuntimeError, ValueError) as error:
            self._unavailable_until = time.monotonic() + self.cooldown_seconds
            self._set_status("error", str(error)[:500])
            return []

    def _set_status(self, state, message):
        self._last_status = {
            "state": state,
            "message": message,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }


def normalize_query(query):
    normalized = str(query or "").strip().lower().replace(" ", "_")
    return normalized.replace("*", "")[:100]
