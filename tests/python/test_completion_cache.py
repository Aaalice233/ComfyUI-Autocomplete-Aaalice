import asyncio
import os
import tempfile
import unittest

from modules.completion_cache_store import CompletionCacheStore
from modules.completion_service import CompletionCachePolicy, CompletionSearchService


class StubProvider:
    name = "stub"
    max_page_size = 50

    def __init__(self, response=None, error=None, gate=None):
        self.response = response or {
            "items": [{"name": "blue_hair", "category": 0, "post_count": 100}],
            "raw_count": 1,
            "has_more": False,
        }
        self.error = error
        self.gate = gate
        self.calls = 0

    @staticmethod
    def normalize_query(query):
        return str(query).strip().lower().replace(" ", "_")

    @staticmethod
    def is_valid_query(query):
        return len(query) >= 2

    async def search(self, query, limit, page):
        self.calls += 1
        if self.gate:
            await self.gate.wait()
        if self.error:
            raise self.error
        return self.response


class CompletionCacheStoreTests(unittest.TestCase):
    def test_persists_pages_and_clears_them_independently(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "completion_cache.sqlite3")
            store = CompletionCacheStore(path)
            key = ("danbooru", "blue", 1, 15, 1)
            page = {"items": [{"name": "blue_hair"}], "raw_count": 1, "has_more": False}
            store.put(key, page, 100, 200, 300)

            reopened = CompletionCacheStore(path)
            self.assertEqual(reopened.get(key, 150)["items"], page["items"])
            self.assertEqual(reopened.stats(150)["entries"], 1)
            self.assertEqual(reopened.clear(), 1)
            self.assertEqual(reopened.stats(150)["entries"], 0)

    def test_cleanup_removes_expired_and_oldest_excess_pages(self):
        with tempfile.TemporaryDirectory() as directory:
            store = CompletionCacheStore(os.path.join(directory, "completion_cache.sqlite3"))
            page = {"items": [{"name": "tag"}], "raw_count": 1, "has_more": False}
            store.put(("stub", "expired", 1, 10, 1), page, 1, 2, 3)
            store.put(("stub", "old", 1, 10, 1), page, 4, 20, 30)
            store.put(("stub", "new", 1, 10, 1), page, 5, 20, 30)

            store.cleanup(10, 1)

            self.assertIsNone(store.get(("stub", "expired", 1, 10, 1), 10))
            self.assertIsNone(store.get(("stub", "old", 1, 10, 1), 10))
            self.assertIsNotNone(store.get(("stub", "new", 1, 10, 1), 10))


class CompletionSearchServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = os.path.join(self.directory.name, "completion_cache.sqlite3")
        self.now = 1_000.0
        self.policy = CompletionCachePolicy(
            fresh_seconds=100,
            empty_fresh_seconds=10,
            stale_seconds=500,
            empty_stale_seconds=50,
            cleanup_interval_seconds=10_000,
        )

    def service(self, provider):
        return CompletionSearchService(
            provider,
            CompletionCacheStore(self.path),
            self.policy,
            clock=lambda: self.now,
        )

    async def test_fresh_cache_survives_service_restart(self):
        first_provider = StubProvider()
        first = await self.service(first_provider).search("Blue", 15)
        second_provider = StubProvider()
        second = await self.service(second_provider).search("blue", 15)

        self.assertEqual(first["cache"]["state"], "refreshed")
        self.assertEqual(second["cache"]["state"], "fresh")
        self.assertEqual(first_provider.calls, 1)
        self.assertEqual(second_provider.calls, 0)

    async def test_related_tag_snapshot_and_similarity_survive_restart(self):
        response = {
            "items": [{
                "name": "sensei_(blue_archive)",
                "category": 4,
                "post_count": 9000,
                "similarity": 0.42,
            }],
            "raw_count": 1,
            "has_more": False,
        }
        first_provider = StubProvider(response=response)
        first_provider.name = "danbooru_related"
        await self.service(first_provider).search("blue_archive", 50)

        second_provider = StubProvider(response=response)
        second_provider.name = "danbooru_related"
        result = await self.service(second_provider).search("blue_archive", 50)

        self.assertEqual(result["cache"]["state"], "fresh")
        self.assertEqual(result["items"][0]["similarity"], 0.42)
        self.assertEqual(second_provider.calls, 0)

    async def test_provider_cache_version_invalidates_an_old_query_strategy(self):
        first_provider = StubProvider()
        await self.service(first_provider).search("blue", 15)

        second_provider = StubProvider()
        second_provider.cache_version = 2
        result = await self.service(second_provider).search("blue", 15)

        self.assertEqual(result["cache"]["state"], "refreshed")
        self.assertEqual(second_provider.calls, 1)

    async def test_stale_cache_returns_immediately_and_refreshes_in_background(self):
        provider = StubProvider()
        service = self.service(provider)
        await service.search("blue", 15)
        self.now += 101
        provider.response = {
            "items": [{"name": "blue_eyes", "category": 0, "post_count": 90}],
            "raw_count": 1,
            "has_more": False,
        }

        stale = await service.search("blue", 15)
        await asyncio.sleep(0.05)
        refreshed = await service.search("blue", 15)

        self.assertEqual(stale["cache"]["state"], "stale")
        self.assertEqual(stale["items"][0]["name"], "blue_hair")
        self.assertEqual(refreshed["items"][0]["name"], "blue_eyes")
        self.assertEqual(provider.calls, 2)

    async def test_concurrent_misses_share_one_provider_request(self):
        gate = asyncio.Event()
        provider = StubProvider(gate=gate)
        service = self.service(provider)
        first = asyncio.create_task(service.search("blue", 15))
        second = asyncio.create_task(service.search("blue", 15))
        await asyncio.sleep(0)
        gate.set()
        first_result, second_result = await asyncio.gather(first, second)

        self.assertEqual(provider.calls, 1)
        self.assertEqual(first_result["items"], second_result["items"])

    async def test_force_refresh_failure_uses_existing_stale_page(self):
        provider = StubProvider()
        service = self.service(provider)
        await service.search("blue", 15)
        provider.error = RuntimeError("offline")

        result = await service.search("blue", 15, force_refresh=True)

        self.assertEqual(result["cache"]["state"], "stale_if_error")
        self.assertEqual(result["items"][0]["name"], "blue_hair")


if __name__ == "__main__":
    unittest.main()
