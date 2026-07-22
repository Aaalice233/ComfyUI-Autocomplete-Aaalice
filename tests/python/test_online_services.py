import asyncio
import json
import os
import tempfile
import unittest

from modules.danbooru_service import DanbooruSearchService, normalize_query
from modules.translation_config import TranslationConfig, mask_config, validate_config
from modules.translation_service import (
    DeepSeekClient,
    TranslationManager,
    normalize_items,
    normalize_locale,
    validate_translation_response,
)
from modules.translation_store import TranslationStore


class TranslationConfigTests(unittest.TestCase):
    def test_thinking_is_disabled_by_default(self):
        config = validate_config({})
        self.assertEqual(config["deepseek"]["reasoning_effort"], "disabled")

    def test_legacy_scan_fields_are_discarded(self):
        config = validate_config(
            {
                "version": 1,
                "categories": {"general": {"mode": "all"}},
                "danbooru": {"api_key": "retired"},
                "deepseek": {"api_key": "secret", "model": "custom"},
            }
        )
        self.assertEqual(set(config), {"version", "deepseek"})
        self.assertEqual(config["version"], 2)
        self.assertEqual(config["deepseek"]["api_key"], "secret")

    def test_masked_secret_preserves_saved_key(self):
        with tempfile.TemporaryDirectory() as directory:
            store = TranslationConfig(os.path.join(directory, "config.json"))
            store.save({"deepseek": {"api_key": "secret"}})
            store.save({"deepseek": {"api_key": "********", "model": "updated"}})
            config = store.load()
            self.assertEqual(config["deepseek"]["api_key"], "secret")
            self.assertTrue(mask_config(config)["deepseek"]["api_key_configured"])


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

    def test_invalid_or_unknown_translation_is_rejected(self):
        items = [{"name": "one", "category": 0}]
        content = json.dumps({"translations": [{"tag": "unknown", "translation": "未知"}]})
        self.assertEqual(validate_translation_response(content, items), ({}, ["one"]))


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
        service = DanbooruSearchService(session_factory=session_factory)
        self.assertEqual(
            await service.search("blue_ha", 10),
            [{"name": "blue_hair", "category": 0, "post_count": 100}],
        )
        self.assertEqual(session_factory.params["search[name_matches]"], "blue_ha*")
        self.assertEqual(session_factory.params["search[hide_empty]"], "true")
        self.assertEqual(session_factory.params["page"], "1")

    async def test_search_forwards_a_bounded_result_page(self):
        session_factory = StubSessionFactory([])
        service = DanbooruSearchService(session_factory=session_factory)

        await service.search("blue", 10, 2)

        self.assertEqual(session_factory.params["page"], "2")

    async def test_failure_enters_silent_cooldown(self):
        service = DanbooruSearchService(session_factory=StubSessionFactory([], status=429))
        self.assertEqual(await service.search("blue", 10), [])
        self.assertEqual(await service.search("blue", 10), [])
        self.assertEqual(service.status()["state"], "error")
        self.assertGreater(service.status()["cooldown"], 0)

    def test_query_removes_remote_wildcards(self):
        self.assertEqual(normalize_query(" Blue Hair* "), "blue_hair")


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
