import re
import time

import aiohttp


DANBOORU_TAGS_URL = "https://danbooru.donmai.us/tags.json"
DANBOORU_RELATED_TAG_URL = "https://danbooru.donmai.us/related_tag.json"
USER_AGENT = "Autocomplete-Plus/1.12"
SUPPORTED_CATEGORIES = {0, 1, 3, 4, 5}


class DanbooruHttpProvider:
    def __init__(self, session_factory=None, timeout_seconds=3, cooldown_seconds=30):
        self.session_factory = session_factory or aiohttp.ClientSession
        self.timeout_seconds = timeout_seconds
        self.cooldown_seconds = cooldown_seconds
        self._unavailable_until = 0

    async def request_json(self, url, params):
        if time.monotonic() < self._unavailable_until:
            raise RuntimeError("Danbooru requests are cooling down after a recent failure")

        timeout = aiohttp.ClientTimeout(total=self.timeout_seconds)
        try:
            async with self.session_factory(timeout=timeout) as session:
                async with session.get(
                    url,
                    params=params,
                    headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
                ) as response:
                    if response.status != 200:
                        raise RuntimeError(f"Danbooru returned HTTP {response.status}")
                    payload = await response.json()
            self._unavailable_until = 0
            return payload
        except (aiohttp.ClientError, TimeoutError, RuntimeError, ValueError) as error:
            self._unavailable_until = time.monotonic() + self.cooldown_seconds
            raise RuntimeError(str(error)) from error


class DanbooruProvider(DanbooruHttpProvider):
    name = "danbooru"
    max_page_size = 200
    cache_version = 2

    @staticmethod
    def normalize_query(query):
        return normalize_query(query)

    @staticmethod
    def is_valid_query(query):
        return len(re.sub(r"[^A-Za-z0-9]", "", query)) >= 2

    async def search(self, normalized, limit, page=1):
        if len(re.sub(r"[^A-Za-z0-9]", "", normalized)) < 2:
            return {"items": [], "raw_count": 0, "has_more": False}

        # Leading-wildcard searches recover franchise suffixes such as
        # character_(copyright), but are needlessly broad for very short input.
        alphanumeric_length = len(re.sub(r"[^A-Za-z0-9]", "", normalized))
        name_pattern = f"*{normalized}*" if alphanumeric_length >= 4 else f"{normalized}*"
        params = {
            "search[name_matches]": name_pattern,
            "search[order]": "count",
            "search[hide_empty]": "true",
            "limit": str(limit),
            "page": str(page),
        }
        payload = await self.request_json(DANBOORU_TAGS_URL, params)
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
            except (AttributeError, KeyError, TypeError, ValueError):
                continue
        return {
            "items": results[:limit],
            "raw_count": len(payload),
            "has_more": len(payload) >= limit,
        }


class DanbooruRelatedTagProvider(DanbooruHttpProvider):
    name = "danbooru_related"
    max_page_size = 500

    @staticmethod
    def normalize_query(query):
        return normalize_query(query)

    @staticmethod
    def is_valid_query(query):
        return len(re.sub(r"[^A-Za-z0-9]", "", query)) >= 2

    async def search(self, normalized, limit, page=1):
        if not self.is_valid_query(normalized):
            return {"items": [], "raw_count": 0, "has_more": False}

        payload = await self.request_json(
            DANBOORU_RELATED_TAG_URL,
            {
                "query": normalized,
                "order": "jaccard",
                "limit": str(limit),
            },
        )
        if not isinstance(payload, dict) or not isinstance(payload.get("related_tags"), list):
            raise RuntimeError("Danbooru returned an invalid related-tag response")

        related_tags = payload["related_tags"]
        results = []
        for item in related_tags:
            try:
                tag = item.get("tag") if isinstance(item, dict) else None
                # The official serializer nests the tag object. Accept a flat
                # object too so minor upstream serializer changes stay harmless.
                tag = tag if isinstance(tag, dict) else item
                name = str(tag["name"])
                category = int(tag["category"])
                post_count = int(tag.get("post_count") or 0)
                similarity = float(item.get("jaccard_similarity") or 0)
                if (
                    name == normalized
                    or category not in SUPPORTED_CATEGORIES
                    or bool(tag.get("is_deprecated"))
                    or post_count <= 0
                    or not 0 <= similarity <= 1
                ):
                    continue
                results.append(
                    {
                        "name": name,
                        "category": category,
                        "post_count": post_count,
                        "similarity": similarity,
                    }
                )
            except (AttributeError, KeyError, TypeError, ValueError):
                continue
        return {
            "items": results[:limit],
            "raw_count": len(related_tags),
            # related_tag is a single bounded snapshot, not a paginated API.
            "has_more": False,
        }


def normalize_query(query):
    normalized = str(query or "").strip().lower().replace(" ", "_")
    return normalized.replace("*", "")[:100]
