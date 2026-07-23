import asyncio
import json
import os
import sqlite3
import tempfile
import unittest

from modules.danbooru_service import DanbooruProvider, DanbooruRelatedTagProvider, normalize_query
from modules.translation_config import OnlineServiceConfig, mask_config, validate_config
from modules.translation_service import (
    DeepSeekClient,
    DynamicConcurrencyLimiter,
    TranslationManager,
    normalize_items,
    normalize_locale,
    validate_translation_response,
)
from modules.translation_store import TranslationStore


class OnlineServiceConfigTests(unittest.TestCase):
    def test_thinking_is_disabled_by_default(self):
        config = validate_config({})
        self.assertEqual(config["deepseek"]["reasoning_effort"], "disabled")

    def test_default_translation_batch_size_is_twenty(self):
        config = validate_config({})
        self.assertEqual(config["deepseek"]["batch_size"], 20)

    def test_legacy_scan_fields_are_discarded(self):
        config = validate_config(
            {
                "version": 1,
                "categories": {"general": {"mode": "all"}},
                "danbooru": {"api_key": "retired"},
                "deepseek": {"api_key": "secret", "model": "custom"},
            }
        )
        self.assertEqual(set(config), {"version", "features", "deepseek"})
        self.assertEqual(config["version"], 3)
        self.assertEqual(config["deepseek"]["api_key"], "secret")

    def test_online_features_default_on_and_validate_boolean_values(self):
        config = validate_config({"features": {"danbooru_completion": False, "translation": False}})
        self.assertFalse(config["features"]["danbooru_completion"])
        self.assertFalse(config["features"]["translation"])
        with self.assertRaises(ValueError):
            validate_config({"features": {"translation": "false"}})

    def test_masked_secret_preserves_saved_key(self):
        with tempfile.TemporaryDirectory() as directory:
            store = OnlineServiceConfig(os.path.join(directory, "config.json"))
            store.save({"deepseek": {"api_key": "secret"}})
            store.save({"deepseek": {"api_key": "********", "model": "updated"}})
            config = store.load()
            self.assertEqual(config["deepseek"]["api_key"], "secret")
            self.assertTrue(mask_config(config)["deepseek"]["api_key_configured"])

    def test_translation_manager_can_reveal_saved_api_key_on_demand(self):
        with tempfile.TemporaryDirectory() as directory:
            store = TranslationStore(os.path.join(directory, "translations.sqlite3"))
            manager = TranslationManager(os.path.join(directory, "config.json"), store)
            manager.save_config({"deepseek": {"api_key": "secret"}})

            self.assertEqual(manager.get_api_key(), "secret")
            self.assertEqual(manager.get_config()["deepseek"]["api_key"], "********")


class TranslationStoreTests(unittest.TestCase):
    def test_catalog_persists_only_successful_translation_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            store = TranslationStore(os.path.join(directory, "translations.sqlite3"))
            items = [{"name": "new_tag", "category": 4, "post_count": 12, "origin": "danbooru_api"}]
            store.save_many("zh", items, {"new_tag": "新标签"}, "model", "hash")
            self.assertEqual(store.count(), 1)
            self.assertEqual(
                store.catalog("zh")[0],
                {
                    "tag_name": "new_tag",
                    "locale": "zh",
                    "text": "新标签",
                    "category": 4,
                    "post_count": 12,
                    "origin": "danbooru_api",
                    "updated_at": store.catalog("zh")[0]["updated_at"],
                },
            )

    def test_catalog_hides_legacy_zero_count_online_tags(self):
        with tempfile.TemporaryDirectory() as directory:
            store = TranslationStore(os.path.join(directory, "translations.sqlite3"))
            items = [
                {"name": "1gir-", "category": 0, "post_count": 0, "origin": "danbooru_api"},
                {"name": "local_tag", "category": 0, "post_count": 0, "origin": "local"},
            ]
            store.save_many(
                "zh",
                items,
                {"1gir-": "无效标签", "local_tag": "本地标签"},
                "model",
                "hash",
            )

            self.assertEqual([item["tag_name"] for item in store.catalog("zh")], ["local_tag"])

    def test_large_job_cache_lookup_is_chunked_for_sqlite(self):
        with tempfile.TemporaryDirectory() as directory:
            store = TranslationStore(os.path.join(directory, "translations.sqlite3"))
            items = [
                {"name": f"tag_{index}", "category": 0, "post_count": 1, "origin": "local"}
                for index in range(1_200)
            ]
            translations = {item["name"]: f"译文_{index}" for index, item in enumerate(items)}
            store.save_many("zh", items, translations, "model", "hash")

            cached = store.get_many("zh", [item["name"] for item in items])
            self.assertEqual(len(cached), 1_200)

    def test_invalid_legacy_identity_translation_is_removed_on_open(self):
        with tempfile.TemporaryDirectory() as directory:
            database_path = os.path.join(directory, "translations.sqlite3")
            TranslationStore(database_path)
            connection = sqlite3.connect(database_path)
            try:
                connection.execute(
                    """
                    INSERT INTO translations(
                        tag_name, locale, text, category, post_count, origin, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    ("1girl", "zh", "1girl", 0, 100, "local", "2026-01-01T00:00:00+00:00"),
                )
                connection.commit()
            finally:
                connection.close()

            reopened = TranslationStore(database_path)

            self.assertEqual(reopened.get_many("zh", ["1girl"]), {})
            self.assertEqual(reopened.count(), 0)

    def test_artist_identity_text_is_allowed_but_not_required_from_deepseek(self):
        with tempfile.TemporaryDirectory() as directory:
            store = TranslationStore(os.path.join(directory, "translations.sqlite3"))
            store.save_many(
                "zh",
                [{"name": "an_artist", "category": 1, "post_count": 10, "origin": "local"}],
                {"an_artist": "an_artist"},
                "model",
                "hash",
            )

            self.assertEqual(store.get_many("zh", ["an_artist"])["an_artist"]["text"], "an_artist")


class TranslationValidationTests(unittest.TestCase):
    def test_locale_and_items_are_normalized(self):
        self.assertEqual(normalize_locale("zh_Hant"), "zh-TW")
        items = normalize_items(
            [
                {"name": "tag", "category": "4", "post_count": "8", "origin": "danbooru_api"},
                {"name": "tag", "category": 0},
            ]
        )
        self.assertEqual(
            items,
            [{"name": "tag", "category": 4, "post_count": 8, "origin": "danbooru_api"}],
        )

    def test_large_frontend_jobs_are_not_truncated_to_one_legacy_batch(self):
        items = normalize_items(
            [{"name": f"tag_{index}", "category": 0, "post_count": 1} for index in range(320)]
        )
        self.assertEqual(len(items), 320)

    def test_invalid_or_unknown_translation_is_rejected(self):
        items = [{"name": "one", "category": 0}]
        content = json.dumps({"translations": [{"tag": "unknown", "translation": "未知"}]})
        self.assertEqual(validate_translation_response(content, items, "zh"), ({}, ["one"]))

    def test_identity_and_wrong_script_translations_are_rejected(self):
        items = [
            {"name": "1girl", "category": 0},
            {"name": "blue_hair", "category": 0},
            {"name": "an_artist", "category": 1},
        ]
        content = json.dumps(
            {
                "translations": [
                    {"tag": "1girl", "translation": "1girl"},
                    {"tag": "blue_hair", "translation": "blue hair"},
                    {"tag": "an_artist", "translation": "an_artist"},
                ]
            }
        )

        self.assertEqual(
            validate_translation_response(content, items, "zh"),
            ({"an_artist": "an_artist"}, ["1girl", "blue_hair"]),
        )


class DynamicConcurrencyLimiterTests(unittest.IsolatedAsyncioTestCase):
    async def test_enforces_one_global_limit_across_many_batches(self):
        limiter = DynamicConcurrencyLimiter()
        active = 0
        maximum = 0

        async def operation():
            nonlocal active, maximum
            active += 1
            maximum = max(maximum, active)
            await asyncio.sleep(0)
            active -= 1

        await asyncio.gather(*(limiter.run(3, operation) for _ in range(12)))
        self.assertEqual(maximum, 3)


class TranslationManagerTests(unittest.IsolatedAsyncioTestCase):
    async def test_cached_translation_is_returned_without_api_key(self):
        with tempfile.TemporaryDirectory() as directory:
            store = TranslationStore(os.path.join(directory, "translations.sqlite3"))
            store.save_many(
                "zh",
                [{"name": "cached", "category": 0, "post_count": 1, "origin": "local"}],
                {"cached": "缓存"},
                "model",
                "hash",
            )
            manager = TranslationManager(os.path.join(directory, "config.json"), store)
            result = await manager.resolve("zh", [{"name": "cached", "category": 0}])
            self.assertEqual(result["cached"]["text"], "缓存")

    async def test_disabled_translation_returns_cache_without_starting_deepseek(self):
        with tempfile.TemporaryDirectory() as directory:
            store = TranslationStore(os.path.join(directory, "translations.sqlite3"))
            store.save_many(
                "zh",
                [{"name": "cached", "category": 0, "post_count": 1, "origin": "local"}],
                {"cached": "缓存"},
                "model",
                "hash",
            )
            manager = TranslationManager(os.path.join(directory, "config.json"), store)
            manager.save_config(
                {"features": {"translation": False}, "deepseek": {"api_key": "secret"}}
            )

            result = await manager.resolve(
                "zh",
                [{"name": "cached", "category": 0}, {"name": "missing", "category": 0}],
            )

            self.assertEqual(set(result), {"cached"})

    async def test_artist_tags_never_start_a_deepseek_worker(self):
        with tempfile.TemporaryDirectory() as directory:
            store = TranslationStore(os.path.join(directory, "translations.sqlite3"))
            manager = TranslationManager(os.path.join(directory, "config.json"), store)
            manager.save_config({"deepseek": {"api_key": "secret"}})

            async def unexpected_worker(*_args):
                self.fail("artist tags must not start a DeepSeek worker")

            manager._translate_owned = unexpected_worker
            chunks = [
                chunk
                async for chunk in manager.resolve_stream(
                    "zh",
                    [{"name": "an_artist", "category": 1}],
                )
            ]

            self.assertEqual(chunks, [])

    async def test_stream_publishes_completed_tags_before_the_whole_job_finishes(self):
        with tempfile.TemporaryDirectory() as directory:
            store = TranslationStore(os.path.join(directory, "translations.sqlite3"))
            manager = TranslationManager(os.path.join(directory, "config.json"), store)
            manager.save_config({"deepseek": {"api_key": "secret"}})
            release_second = asyncio.Event()

            async def translate_owned(locale, items, _config):
                await manager._finish_inflight_batch(locale, [items[0]], {items[0]["name"]: "第一项"})
                await release_second.wait()
                await manager._finish_inflight_batch(locale, [items[1]], {items[1]["name"]: "第二项"})

            manager._translate_owned = translate_owned
            stream = manager.resolve_stream(
                "zh",
                [
                    {"name": "first_tag", "category": 0},
                    {"name": "second_tag", "category": 0},
                ],
            )

            self.assertEqual(
                await stream.__anext__(),
                {"translations": {"first_tag": "第一项"}, "completed": ["first_tag"]},
            )
            second_chunk = asyncio.create_task(stream.__anext__())
            await asyncio.sleep(0)
            self.assertFalse(second_chunk.done())

            release_second.set()
            self.assertEqual(
                await second_chunk,
                {"translations": {"second_tag": "第二项"}, "completed": ["second_tag"]},
            )
            await stream.aclose()

    async def test_model_list_and_health_check_use_the_supplied_key_and_model(self):
        with tempfile.TemporaryDirectory() as directory:
            store = TranslationStore(os.path.join(directory, "translations.sqlite3"))
            session_factory = DeepSeekSessionFactory()
            manager = TranslationManager(
                os.path.join(directory, "config.json"),
                store,
                session_factory=session_factory,
            )
            models = await manager.list_models("temporary-key")
            result = await manager.test_model("temporary-key", "deepseek-v4-pro", "max")

            self.assertEqual(models, ["deepseek-v4-flash", "deepseek-v4-pro"])
            self.assertEqual(result, {"ok": True, "model": "deepseek-v4-pro"})
            self.assertEqual(session_factory.headers[0]["Authorization"], "Bearer temporary-key")
            self.assertEqual(session_factory.post_payload["model"], "deepseek-v4-pro")
            self.assertEqual(session_factory.post_payload["thinking"], {"type": "enabled"})
            self.assertEqual(session_factory.post_payload["reasoning_effort"], "max")

    async def test_concurrent_resolution_owns_each_tag_only_once(self):
        with tempfile.TemporaryDirectory() as directory:
            store = TranslationStore(os.path.join(directory, "translations.sqlite3"))
            manager = TranslationManager(os.path.join(directory, "config.json"), store)
            manager.save_config({"deepseek": {"api_key": "secret"}})
            release = asyncio.Event()
            worker_calls = 0

            async def translate_owned(locale, items, config):
                nonlocal worker_calls
                worker_calls += 1
                await release.wait()
                store.save_many(locale, items, {"shared": "共享"}, config["model"], "hash")
                async with manager._inflight_lock:
                    future = manager._inflight.pop((locale, "shared"))
                    future.set_result("共享")

            manager._translate_owned = translate_owned
            item = [{"name": "shared", "category": 0}]
            first = asyncio.create_task(manager.resolve("zh", item))
            await asyncio.sleep(0)
            second = asyncio.create_task(manager.resolve("zh", item))
            await asyncio.sleep(0)
            release.set()
            first_result, second_result = await asyncio.gather(first, second)

            self.assertEqual(worker_calls, 1)
            self.assertEqual(first_result["shared"]["text"], "共享")
            self.assertEqual(second_result["shared"]["text"], "共享")


class DeepSeekClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_translation_payload_disables_thinking_by_default(self):
        session = TranslationSession()
        config = validate_config({"deepseek": {"api_key": "secret"}})["deepseek"]
        client = DeepSeekClient(session, config)
        await client.translate([{"name": "blue_hair", "category": 0}], "zh")

        self.assertEqual(session.payload["thinking"], {"type": "disabled"})
        self.assertNotIn("reasoning_effort", session.payload)
        self.assertEqual(session.payload["temperature"], 0.1)


class DanbooruSearchTests(unittest.IsolatedAsyncioTestCase):
    async def test_search_filters_deprecated_and_unsupported_categories(self):
        payload = [
            {"name": "blue_hair", "category": 0, "post_count": 100, "is_deprecated": False},
            {"name": "old", "category": 0, "post_count": 10, "is_deprecated": True},
            {"name": "unused", "category": 2, "post_count": 5, "is_deprecated": False},
            {"name": "blue_hair-", "category": 0, "post_count": 0, "is_deprecated": False},
        ]
        session_factory = StubSessionFactory(payload)
        service = DanbooruProvider(session_factory=session_factory)
        self.assertEqual(
            await service.search("blue_ha", 10),
            {
                "items": [{"name": "blue_hair", "category": 0, "post_count": 100}],
                "raw_count": 4,
                "has_more": False,
            },
        )
        self.assertEqual(session_factory.params["search[name_matches]"], "*blue_ha*")
        self.assertEqual(session_factory.params["search[hide_empty]"], "true")
        self.assertEqual(session_factory.params["page"], "1")

    async def test_search_forwards_a_bounded_result_page(self):
        session_factory = StubSessionFactory([])
        service = DanbooruProvider(session_factory=session_factory)

        await service.search("blue", 10, 2)

        self.assertEqual(session_factory.params["page"], "2")

    async def test_short_queries_keep_the_cheaper_prefix_match(self):
        session_factory = StubSessionFactory([])
        service = DanbooruProvider(session_factory=session_factory)

        await service.search("ab", 10)

        self.assertEqual(session_factory.params["search[name_matches]"], "ab*")

    async def test_has_more_uses_raw_page_size_before_category_filtering(self):
        payload = [
            {"name": "blue_hair", "category": 0, "post_count": 100, "is_deprecated": False},
            {"name": "unsupported", "category": 2, "post_count": 50, "is_deprecated": False},
        ]
        service = DanbooruProvider(session_factory=StubSessionFactory(payload))

        result = await service.search("blue", 2)

        self.assertEqual(len(result["items"]), 1)
        self.assertTrue(result["has_more"])

    async def test_failure_enters_silent_cooldown(self):
        service = DanbooruProvider(session_factory=StubSessionFactory([], status=429))
        with self.assertRaises(RuntimeError):
            await service.search("blue", 10)
        with self.assertRaisesRegex(RuntimeError, "cooling down"):
            await service.search("blue", 10)

    def test_query_removes_remote_wildcards(self):
        self.assertEqual(normalize_query(" Blue Hair* "), "blue_hair")


class DanbooruRelatedTagTests(unittest.IsolatedAsyncioTestCase):
    async def test_maps_official_nested_related_tag_response(self):
        payload = {
            "query": "blue_archive",
            "related_tags": [
                {
                    "tag": {
                        "name": "sensei_(blue_archive)",
                        "category": 4,
                        "post_count": 9000,
                        "is_deprecated": False,
                    },
                    "jaccard_similarity": 0.42,
                },
                {
                    "tag": {
                        "name": "blue_archive",
                        "category": 3,
                        "post_count": 100000,
                        "is_deprecated": False,
                    },
                    "jaccard_similarity": 1,
                },
            ],
        }
        session_factory = StubSessionFactory(payload)
        provider = DanbooruRelatedTagProvider(session_factory=session_factory)

        result = await provider.search("blue_archive", 500)

        self.assertEqual(
            result,
            {
                "items": [{
                    "name": "sensei_(blue_archive)",
                    "category": 4,
                    "post_count": 9000,
                    "similarity": 0.42,
                }],
                "raw_count": 2,
                "has_more": False,
            },
        )
        self.assertEqual(session_factory.params["query"], "blue_archive")
        self.assertEqual(session_factory.params["order"], "jaccard")
        self.assertEqual(session_factory.params["limit"], "500")

    async def test_accepts_flat_items_and_filters_invalid_rows(self):
        payload = {
            "related_tags": [
                {"name": "valid", "category": 0, "post_count": 10, "jaccard_similarity": 0.1},
                {"name": "unused", "category": 2, "post_count": 10, "jaccard_similarity": 0.2},
                {"name": "empty", "category": 0, "post_count": 0, "jaccard_similarity": 0.2},
                {"name": "invalid_score", "category": 0, "post_count": 10, "jaccard_similarity": 2},
            ],
        }
        provider = DanbooruRelatedTagProvider(session_factory=StubSessionFactory(payload))

        result = await provider.search("source_tag", 20)

        self.assertEqual([item["name"] for item in result["items"]], ["valid"])

    async def test_rejects_non_object_payload(self):
        provider = DanbooruRelatedTagProvider(session_factory=StubSessionFactory([]))

        with self.assertRaisesRegex(RuntimeError, "invalid related-tag response"):
            await provider.search("blue_archive", 20)


class StubResponse:
    def __init__(self, payload, status):
        self.payload = payload
        self.status = status

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        return False

    async def json(self):
        return self.payload

    async def text(self):
        return json.dumps(self.payload)


class StubSessionFactory:
    def __init__(self, payload, status=200):
        self.payload = payload
        self.status = status
        self.params = None

    def __call__(self, **_kwargs):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        return False

    def get(self, _url, params, headers):
        self.params = params
        return StubResponse(self.payload, self.status)


class DeepSeekSessionFactory:
    def __init__(self):
        self.headers = []
        self.post_payload = None

    def __call__(self, **_kwargs):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        return False

    def get(self, _url, headers):
        self.headers.append(headers)
        return StubResponse(
            {"data": [{"id": "deepseek-v4-pro"}, {"id": "deepseek-v4-flash"}]},
            200,
        )

    def post(self, _url, json, headers):
        self.headers.append(headers)
        self.post_payload = json
        return StubResponse({"choices": [{"message": {"content": "OK"}}]}, 200)


class TranslationSession:
    def __init__(self):
        self.payload = None

    def post(self, _url, json, headers):
        self.payload = json
        return StubResponse(
            {
                "choices": [{
                    "message": {
                        "content": '{"translations":[{"tag":"blue_hair","translation":"蓝发"}]}'
                    },
                    "finish_reason": "stop",
                }]
            },
            200,
        )


if __name__ == "__main__":
    unittest.main()
