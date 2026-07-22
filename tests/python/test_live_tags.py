import asyncio
import csv
import json
import os
import tempfile
import unittest
from unittest.mock import patch

from modules.live_tags_config import DEFAULT_CONFIG, LiveTagsConfig, mask_config, validate_config
from modules.live_tags_service import DeepSeekClient, LiveTagsManager, normalize_locale, validate_translation_response
from modules.live_tags_store import LiveTagsStore


class LiveTagsConfigTests(unittest.TestCase):
    def test_defaults_include_three_category_modes(self):
        config = validate_config({})
        self.assertEqual(config["categories"]["character"]["mode"], "all")
        self.assertEqual(config["categories"]["general"], {"mode": "threshold", "threshold": 1000})
        self.assertEqual(config["categories"]["unused"]["mode"], "disabled")

    def test_rejects_out_of_range_translation_settings(self):
        with self.assertRaisesRegex(ValueError, "concurrency"):
            validate_config({"deepseek": {"concurrency": 301}})
        with self.assertRaisesRegex(ValueError, "batch_size"):
            validate_config({"deepseek": {"batch_size": 0}})

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

    def test_base_tags_missing_current_locale_enter_translation_work(self):
        self.store.sync_base_tags(
            [
                {"name": "already_zh", "category": 0, "post_count": 100, "aliases": ["已有翻译"]},
                {"name": "missing_zh", "category": 4, "post_count": 80, "aliases": ["English alias"]},
                {"name": "japanese_only", "category": 0, "post_count": 60, "aliases": ["ロングヘアー"]},
            ]
        )

        pending, cached = self.store.translation_work("zh", "missing")

        self.assertEqual([row["name"] for row in pending], ["missing_zh", "japanese_only"])
        self.assertEqual(cached, 0)
        self.assertEqual(self.store.statistics("zh")["base_missing"], 2)

    def test_export_preserves_base_row_when_adding_cached_translation(self):
        self.store.sync_base_tags(
            [{"name": "base_tag", "category": 3, "post_count": 123, "aliases": ["existing alias"]}]
        )
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
    def test_base_csv_names_are_loaded_for_deduplication(self):
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
            self.assertEqual(manager.status("zh")["statistics"]["base_missing"], 2)

    def test_locale_mapping(self):
        self.assertEqual(normalize_locale("zh_CN"), "zh")
        self.assertEqual(normalize_locale("zh-Hant"), "zh-TW")
        self.assertEqual(normalize_locale("ja-JP"), "ja")
        self.assertEqual(normalize_locale("fr"), "en")


class LiveTagsManagerAsyncTests(unittest.IsolatedAsyncioTestCase):
    async def test_scan_filters_base_tags_and_exports_only_new_candidates(self):
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
            self.assertEqual(store.candidate_count(), 1)
            with open(store.csv_path, encoding="utf-8", newline="") as csv_file:
                rows = list(csv.DictReader(csv_file))
            self.assertEqual([row["tag"] for row in rows], ["new_tag"])


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
    def __init__(self, session, config, cancel_event):
        self.cancel_event = cancel_event

    async def iter_category(self, category_name, policy):
        yield [
            _tag(1, "existing_tag", 0, 100),
            _tag(2, "new_tag", 0, 50),
        ]


def _tag(tag_id, name, category, post_count):
    return {"id": tag_id, "name": name, "category": category, "post_count": post_count}


if __name__ == "__main__":
    unittest.main()
