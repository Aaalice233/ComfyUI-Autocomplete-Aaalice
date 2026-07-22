import asyncio
import csv
import json
import os
import tempfile
import unittest
from unittest.mock import patch

from modules.live_tags_config import CATEGORY_IDS, DEFAULT_CONFIG, LiveTagsConfig, mask_config, validate_config
from modules.live_tags_service import (
    AdaptiveRequestLimiter,
    DanbooruClient,
    DeepSeekClient,
    LiveTagsManager,
    LiveTagsError,
    USER_AGENT,
    normalize_locale,
    split_id_ranges,
    validate_translation_response,
)
from modules.live_tags_store import LiveTagsStore


class LiveTagsConfigTests(unittest.TestCase):
    def test_defaults_use_a_threshold_of_twenty_for_every_category(self):
        config = validate_config({})
        self.assertEqual(
            config["categories"],
            {name: {"mode": "threshold", "threshold": 20} for name in CATEGORY_IDS},
        )

    def test_rejects_out_of_range_translation_settings(self):
        with self.assertRaisesRegex(ValueError, "concurrency"):
            validate_config({"deepseek": {"concurrency": 301}})
        with self.assertRaisesRegex(ValueError, "batch_size"):
            validate_config({"deepseek": {"batch_size": 0}})

    def test_scan_concurrency_defaults_to_eight_and_is_bounded(self):
        self.assertEqual(validate_config({})["danbooru"]["scan_concurrency"], 8)
        for value in (0, 17):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "scan_concurrency"):
                validate_config({"danbooru": {"scan_concurrency": value}})

    def test_masked_secret_is_preserved_when_saving(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "config.json")
            config_store = LiveTagsConfig(path)
            config_store.save({"deepseek": {"api_key": "secret"}})
            config_store.save({"deepseek": {"api_key": "********", "model": "custom-model"}})
            saved = config_store.load()
            self.assertEqual(saved["deepseek"]["api_key"], "secret")
            self.assertEqual(saved["deepseek"]["model"], "custom-model")
            masked = mask_config(saved)
            self.assertEqual(masked["deepseek"]["api_key"], "********")
            self.assertTrue(masked["deepseek"]["api_key_configured"])


class LiveTagsStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp_directory = tempfile.TemporaryDirectory()
        self.database_path = os.path.join(self.temp_directory.name, "live.sqlite3")
        self.csv_path = os.path.join(self.temp_directory.name, "danbooru_tags_live.csv")
        self.store = LiveTagsStore(self.database_path, self.csv_path)

    def tearDown(self):
        self.temp_directory.cleanup()

    def test_successful_scan_replaces_active_snapshot(self):
        first_job = self.store.create_job("scan")
        self.store.stage_tags(first_job, [_tag(1, "first", 0, 100), _tag(2, "second", 4, 10)])
        self.store.commit_scan(first_job)
        self.assertEqual(self.store.candidate_count(), 2)

        second_job = self.store.create_job("scan")
        self.store.stage_tags(second_job, [_tag(2, "second", 4, 20)])
        self.store.commit_scan(second_job)
        self.assertEqual(self.store.candidate_count(), 1)
        work, _cached = self.store.translation_work("zh", "missing")
        self.assertEqual([row["name"] for row in work], ["second"])

    def test_staging_does_not_change_active_snapshot_until_commit(self):
        first_job = self.store.create_job("scan")
        self.store.stage_tags(first_job, [_tag(1, "stable", 0, 100)])
        self.store.commit_scan(first_job)

        failed_job = self.store.create_job("scan")
        self.store.stage_tags(failed_job, [_tag(2, "uncommitted", 0, 200)])
        self.store.clear_staging(failed_job)
        work, _cached = self.store.translation_work("zh", "missing")
        self.assertEqual([row["name"] for row in work], ["stable"])

    def test_translation_cache_and_multilingual_csv_export(self):
        job_id = self.store.create_job("scan")
        self.store.stage_tags(job_id, [_tag(1, "new_tag", 4, 50), _tag(2, "other", 0, 100)])
        self.store.commit_scan(job_id)
        self.store.save_translation_successes("zh", {"new_tag": "新标签"}, "model", "prompt", 1)
        self.store.save_translation_successes("zh-TW", {"new_tag": "新標籤"}, "model", "prompt", 1)
        self.store.save_translation_successes("ja", {"new_tag": "新しいタグ"}, "model", "prompt", 1)

        rows_written = self.store.export_csv()
        self.assertEqual(rows_written, 2)
        with open(self.csv_path, encoding="utf-8", newline="") as csv_file:
            rows = list(csv.DictReader(csv_file))
        self.assertEqual([row["tag"] for row in rows], ["other", "new_tag"])
        self.assertEqual(rows[1]["alias"], "新标签,新標籤,新しいタグ")

        pending, cached = self.store.translation_work("zh", "missing")
        self.assertEqual(cached, 1)
        self.assertEqual([row["name"] for row in pending], ["other"])

    def test_failed_translations_can_be_selected_separately(self):
        job_id = self.store.create_job("scan")
        self.store.stage_tags(job_id, [_tag(1, "failed_tag", 0, 10)])
        self.store.commit_scan(job_id)
        self.store.save_translation_failures("ja", ["failed_tag"], "model", "prompt", 4, "bad JSON")
        failed, _cached = self.store.translation_work("ja", "failed")
        self.assertEqual([row["name"] for row in failed], ["failed_tag"])

    def test_cancelled_scan_keeps_checkpoint_and_partial_csv_for_resume(self):
        job_id = self.store.create_job("scan", options={"categories": DEFAULT_CONFIG["categories"]})
        self.store.initialize_scan_partitions(job_id, ["general"], [(1, 100)])
        self.store.stage_tags(job_id, [_tag(10, "partial_tag", 0, 50)])
        self.store.checkpoint_scan_partition(job_id, "general", 1, 10, 1, 1)
        self.store.update_job(job_id, status="cancelled", phase="cancelled")

        self.assertEqual(self.store.latest_resumable_job()["id"], job_id)
        self.assertEqual(self.store.pending_scan_partitions(job_id)[0]["cursor"], 10)
        self.store.export_csv(job_id)
        with open(self.csv_path, encoding="utf-8", newline="") as csv_file:
            self.assertEqual(next(csv.DictReader(csv_file))["tag"], "partial_tag")

    def test_translation_queue_preserves_unfinished_items_after_cancel(self):
        job_id = self.store.create_job("translate", "zh", mode="all")
        work = [
            {"name": "one", "category": 0, "post_count": 20},
            {"name": "two", "category": 4, "post_count": 10},
        ]
        self.store.initialize_translation_queue(job_id, work)
        self.store.complete_translation_items(job_id, ["one"])
        self.store.update_job(job_id, status="cancelled", phase="cancelled")

        self.assertEqual([item["name"] for item in self.store.pending_translation_work(job_id)], ["two"])
        self.assertEqual(self.store.translation_queue_progress(job_id), {"total": 2, "completed": 1})

    def test_statistics_and_dictionary_are_queryable(self):
        self.store.sync_base_tags([{"name": "base", "category": 0, "post_count": 10, "aliases": []}])
        job_id = self.store.create_job("scan")
        self.store.stage_tags(job_id, [_tag(2, "live", 4, 20)])
        self.store.commit_scan(job_id)
        self.store.save_translation_successes("zh", {"live": "实时"}, "model", "prompt", 1)

        summary = self.store.tag_statistics()
        self.assertEqual(summary["base_count"], 1)
        self.assertEqual(summary["live_count"], 1)
        self.assertEqual(self.store.tag_list(source="live")["items"][0]["name"], "live")
        self.assertEqual(self.store.translation_dictionary("zh")["items"][0]["text"], "实时")

    def test_tag_browser_includes_cached_and_base_translations(self):
        self.store.sync_base_tags(
            [
                {"name": "base_translation", "category": 0, "post_count": 30, "aliases": ["基础译文"]},
                {"name": "cached_translation", "category": 4, "post_count": 20, "aliases": []},
            ]
        )
        job_id = self.store.create_job("scan")
        self.store.stage_tags(
            job_id,
            [_tag(1, "base_translation", 0, 30), _tag(2, "cached_translation", 4, 20)],
        )
        self.store.commit_scan(job_id)
        self.store.save_translation_successes(
            "zh",
            {"cached_translation": "缓存译文"},
            "model",
            "prompt",
            1,
        )

        items = self.store.tag_list(source="live", locale="zh")["items"]

        self.assertEqual(
            {item["name"]: item["translation"] for item in items},
            {"base_translation": "基础译文", "cached_translation": "缓存译文"},
        )

    def test_base_tags_missing_current_locale_enter_translation_work(self):
        self.store.sync_base_tags(
            [
                {"name": "already_zh", "category": 0, "post_count": 100, "aliases": ["已有翻译"]},
                {"name": "missing_zh", "category": 4, "post_count": 80, "aliases": ["English alias"]},
                {"name": "japanese_only", "category": 0, "post_count": 60, "aliases": ["ロングヘアー"]},
            ]
        )
        job_id = self.store.create_job("scan")
        self.store.stage_tags(
            job_id,
            [
                _tag(1, "already_zh", 0, 100),
                _tag(2, "missing_zh", 4, 80),
                _tag(3, "japanese_only", 0, 60),
            ],
        )
        self.store.commit_scan(job_id)

        pending, cached = self.store.translation_work("zh", "missing")

        self.assertEqual([row["name"] for row in pending], ["missing_zh", "japanese_only"])
        self.assertEqual(cached, 0)
        self.assertEqual(self.store.statistics("zh")["base_missing"], 2)

    def test_statistics_include_partial_scan_staging(self):
        self.store.sync_base_tags(
            [
                {"name": "translated_base", "category": 0, "post_count": 100, "aliases": ["已有翻译"]},
                {"name": "missing_base", "category": 4, "post_count": 80, "aliases": []},
            ]
        )
        job_id = self.store.create_job("scan")
        self.store.stage_tags(
            job_id,
            [_tag(1, "translated_base", 0, 100), _tag(2, "missing_base", 4, 80)],
        )

        statistics = self.store.statistics("zh", staging_job_id=job_id)

        self.assertEqual(statistics["candidates"], 2)
        self.assertEqual(statistics["base_missing"], 1)
        self.assertEqual(statistics["untranslated"], 1)

    def test_export_preserves_base_row_when_adding_cached_translation(self):
        self.store.sync_base_tags(
            [{"name": "base_tag", "category": 3, "post_count": 123, "aliases": ["existing alias"]}]
        )
        job_id = self.store.create_job("scan")
        self.store.stage_tags(job_id, [_tag(1, "base_tag", 3, 123)])
        self.store.commit_scan(job_id)
        self.store.save_translation_successes("zh", {"base_tag": "基础标签"}, "model", "prompt", 1)

        self.assertEqual(self.store.export_csv(), 1)
        with open(self.csv_path, encoding="utf-8", newline="") as csv_file:
            row = next(csv.DictReader(csv_file))
        self.assertEqual(row, {"tag": "base_tag", "category": "3", "count": "123", "alias": "existing alias,基础标签"})


class TranslationValidationTests(unittest.TestCase):
    def test_accepts_valid_subset_and_returns_missing_tags(self):
        items = [{"name": "one", "category": 0}, {"name": "two", "category": 4}]
        content = json.dumps({"translations": [{"tag": "one", "translation": "一"}]})
        valid, missing = validate_translation_response(content, items)
        self.assertEqual(valid, {"one": "一"})
        self.assertEqual(missing, ["two"])

    def test_rejects_duplicates_unknown_tags_and_empty_output(self):
        items = [{"name": "one", "category": 0}]
        content = json.dumps(
            {
                "translations": [
                    {"tag": "one", "translation": "一"},
                    {"tag": "one", "translation": "壹"},
                    {"tag": "unknown", "translation": "未知"},
                ]
            }
        )
        valid, missing = validate_translation_response(content, items)
        self.assertEqual(valid, {})
        self.assertEqual(missing, ["one"])

    def test_rejects_translation_with_a_newline_that_would_break_csv_loading(self):
        items = [{"name": "one", "category": 0}]
        content = json.dumps({"translations": [{"tag": "one", "translation": "line one\nline two"}]})
        valid, missing = validate_translation_response(content, items)
        self.assertEqual(valid, {})
        self.assertEqual(missing, ["one"])


class LiveTagsManagerTests(unittest.TestCase):
    def test_danbooru_user_agent_avoids_cloudflare_blocked_product_token(self):
        self.assertNotIn("ComfyUI", USER_AGENT)

    def test_scan_id_ranges_cover_every_id_once(self):
        ranges = split_id_ranges(10, 4)
        flattened = [tag_id for start, end in ranges for tag_id in range(start, end + 1)]
        self.assertEqual(flattened, list(range(1, 11)))
        self.assertEqual(len(ranges), 4)

    def test_danbooru_auth_is_applied_to_scan_metadata_requests(self):
        client = DanbooruClient(None, {"login": "user", "api_key": "secret"}, asyncio.Event())
        params = client._with_auth({"limit": "1"})
        self.assertEqual(params, {"limit": "1", "login": "user", "api_key": "secret"})

    def test_base_csv_is_loaded_as_translation_fallback_only(self):
        with tempfile.TemporaryDirectory() as directory:
            base_csv = os.path.join(directory, "danbooru_tags.csv")
            with open(base_csv, "w", encoding="utf-8", newline="") as csv_file:
                writer = csv.writer(csv_file)
                writer.writerow(("tag", "category", "count", "alias"))
                writer.writerow(("existing_tag", 0, 100, ""))
                writer.writerow(("another_tag", 4, 20, ""))
            store = LiveTagsStore(os.path.join(directory, "live.sqlite3"), os.path.join(directory, "live.csv"))
            manager = LiveTagsManager(os.path.join(directory, "config.json"), store, base_csv)
            self.assertEqual(manager._load_base_names(), {"existing_tag", "another_tag"})
            self.assertEqual(manager.status("zh")["statistics"]["base_tags"], 2)
            self.assertEqual(manager.status("zh")["statistics"]["base_missing"], 0)

    def test_locale_mapping(self):
        self.assertEqual(normalize_locale("zh_CN"), "zh")
        self.assertEqual(normalize_locale("zh-Hant"), "zh-TW")
        self.assertEqual(normalize_locale("ja-JP"), "ja")
        self.assertEqual(normalize_locale("fr"), "en")

    def test_changed_category_settings_prevent_resuming_mixed_scan(self):
        with tempfile.TemporaryDirectory() as directory:
            base_csv = os.path.join(directory, "danbooru_tags.csv")
            with open(base_csv, "w", encoding="utf-8", newline="") as csv_file:
                csv.writer(csv_file).writerow(("tag", "category", "count", "alias"))
            store = LiveTagsStore(os.path.join(directory, "live.sqlite3"), os.path.join(directory, "live.csv"))
            manager = LiveTagsManager(os.path.join(directory, "config.json"), store, base_csv)
            old_categories = json.loads(json.dumps(DEFAULT_CONFIG["categories"]))
            old_categories["general"]["threshold"] = 1000
            job_id = store.create_job("scan", options={"categories": old_categories})
            store.initialize_scan_partitions(job_id, ["general"], [(1, 100)])
            store.update_job(job_id, status="cancelled", phase="cancelled")

            status = manager.status("zh")
            self.assertTrue(status["resumable_config_changed"])
            with self.assertRaises(LiveTagsError) as raised:
                manager.resume_latest()
            self.assertEqual(raised.exception.code, "scan_config_changed")


class LiveTagsManagerAsyncTests(unittest.IsolatedAsyncioTestCase):
    async def test_scan_limiter_reduces_on_rate_limit_and_recovers_gradually(self):
        limiter = AdaptiveRequestLimiter(8, recovery_successes=2)
        await limiter.acquire()
        await limiter.release(rate_limited=True)
        self.assertEqual(limiter.current_limit, 4)

        for _ in range(2):
            await limiter.acquire()
            await limiter.release(successful=True)
        self.assertEqual(limiter.current_limit, 5)

    async def test_scan_replaces_base_source_with_complete_api_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            base_csv = os.path.join(directory, "danbooru_tags.csv")
            with open(base_csv, "w", encoding="utf-8", newline="") as csv_file:
                writer = csv.writer(csv_file)
                writer.writerow(("tag", "category", "count", "alias"))
                writer.writerow(("existing_tag", 0, 100, ""))
            store = LiveTagsStore(os.path.join(directory, "live.sqlite3"), os.path.join(directory, "live.csv"))
            manager = LiveTagsManager(
                os.path.join(directory, "config.json"),
                store,
                base_csv,
                session_factory=StubSession,
            )
            categories = {
                name: {"mode": "disabled", "threshold": 0}
                for name in DEFAULT_CONFIG["categories"]
            }
            categories["general"] = {"mode": "threshold", "threshold": 10}
            manager.save_config({"categories": categories})

            with patch("modules.live_tags_service.DanbooruClient", StubDanbooruClient):
                manager.start_scan()
                await manager._task

            self.assertEqual(store.latest_job()["status"], "completed")
            self.assertEqual(store.candidate_count(), 2)
            with open(store.csv_path, encoding="utf-8", newline="") as csv_file:
                rows = list(csv.DictReader(csv_file))
            self.assertEqual([row["tag"] for row in rows], ["existing_tag", "new_tag"])


class DeepSeekRetryTests(unittest.IsolatedAsyncioTestCase):
    async def test_invalid_partial_response_retries_only_missing_items(self):
        config = DEFAULT_CONFIG["deepseek"].copy()
        config.update({"api_key": "test", "max_retries": 1})
        client = StubDeepSeekClient(config)
        items = [{"name": "one", "category": 0}, {"name": "two", "category": 4}]
        client.responses = [
            {
                "content": json.dumps({"translations": [{"tag": "one", "translation": "一"}]}),
                "finish_reason": "stop",
            },
            {
                "content": json.dumps({"translations": [{"tag": "two", "translation": "二"}]}),
                "finish_reason": "stop",
            },
        ]
        result = await client.translate(items, "zh")
        self.assertEqual(result.translations, {"one": "一", "two": "二"})
        self.assertEqual(client.requested_tags, [["one", "two"], ["two"]])
        self.assertEqual(result.retries, 1)

    async def test_length_response_splits_batch(self):
        config = DEFAULT_CONFIG["deepseek"].copy()
        config.update({"api_key": "test", "max_retries": 0})
        client = StubDeepSeekClient(config)
        items = [{"name": "one", "category": 0}, {"name": "two", "category": 4}]
        client.responses = [
            {"content": "", "finish_reason": "length"},
            {
                "content": json.dumps({"translations": [{"tag": "one", "translation": "一"}]}),
                "finish_reason": "stop",
            },
            {
                "content": json.dumps({"translations": [{"tag": "two", "translation": "二"}]}),
                "finish_reason": "stop",
            },
        ]
        result = await client.translate(items, "zh")
        self.assertEqual(result.translations, {"one": "一", "two": "二"})
        self.assertEqual(client.requested_tags, [["one", "two"], ["one"], ["two"]])


class StubDeepSeekClient(DeepSeekClient):
    def __init__(self, config):
        super().__init__(None, config, asyncio.Event())
        self.responses = []
        self.requested_tags = []

    async def _request(self, items, locale):
        self.requested_tags.append([item["name"] for item in items])
        return self.responses.pop(0)

    async def _retry_delay(self, attempt, retry_after=None):
        return None


class StubSession:
    def __init__(self, **kwargs):
        self.kwargs = kwargs

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_value, traceback):
        return False


class StubDanbooruClient:
    def __init__(self, session, config, cancel_event, **_kwargs):
        self.cancel_event = cancel_event

    async def get_max_tag_id(self):
        return 100

    async def iter_category(self, category_name, policy, id_range=None, cursor=None):
        if id_range[0] != 1:
            return
        yield [
            _tag(1, "existing_tag", 0, 100),
            _tag(2, "new_tag", 0, 50),
        ]


def _tag(tag_id, name, category, post_count):
    return {"id": tag_id, "name": name, "category": category, "post_count": post_count}


if __name__ == "__main__":
    unittest.main()
