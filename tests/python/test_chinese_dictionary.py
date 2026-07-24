import asyncio
import json
import os
import shutil
import sqlite3
import tempfile
import time
import unittest

from modules.chinese_dictionary_service import ChineseDictionaryService, git_blob_sha
from modules.danbooru_service import AsyncReadRateLimiter
from modules.translation_config import OnlineServiceConfig
from modules.translation_service import TranslationManager
from modules.translation_store import TranslationStore


def create_dictionary(path, rows=None, valid_schema=True):
    connection = sqlite3.connect(path)
    if valid_schema:
        connection.execute(
            """
            CREATE TABLE tags (
                name TEXT PRIMARY KEY,
                category INTEGER,
                cn_name TEXT,
                post_count INTEGER
            )
            """
        )
        connection.executemany(
            "INSERT INTO tags(name, category, cn_name, post_count) VALUES (?, ?, ?, ?)",
            rows
            or [
                ("1girl", 0, "1个女孩", 8_000_000),
                ("magical_girl", 0, "魔法少女", 100_000),
                ("identity", 1, "identity", 10),
            ],
        )
    else:
        connection.execute("CREATE TABLE wrong(name TEXT)")
    connection.commit()
    connection.close()


class LocalDownloadDictionaryService(ChineseDictionaryService):
    def __init__(self, directory, remote_path):
        super().__init__(directory)
        self.remote_path = remote_path
        self.download_count = 0

    async def _fetch_remote_metadata(self):
        return {
            "sha": git_blob_sha(self.remote_path),
            "download_url": "https://raw.githubusercontent.com/example/tag.sqlite",
            "size": os.path.getsize(self.remote_path),
        }

    async def _download_file(self, _url, path):
        self.download_count += 1
        await asyncio.sleep(0)
        shutil.copyfile(self.remote_path, path)
        self._runtime["downloaded_bytes"] = os.path.getsize(path)
        self._runtime["total_bytes"] = os.path.getsize(path)


class ChineseDictionaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.remote_path = os.path.join(self.temp.name, "remote.sqlite")
        self.install_dir = os.path.join(self.temp.name, "installed")
        create_dictionary(self.remote_path)

    def tearDown(self):
        self.temp.cleanup()

    def test_validates_and_queries_dictionary_without_loading_full_catalog(self):
        service = ChineseDictionaryService(self.install_dir)
        create_dictionary(service.database_path)
        rows = service.lookup(["1girl", "identity", "missing"])
        self.assertEqual(rows["1girl"]["text"], "1个女孩")
        self.assertNotIn("identity", rows)
        self.assertEqual(service.search("少女", 10)[0]["name"], "magical_girl")

    def test_rejects_wrong_schema(self):
        wrong_path = os.path.join(self.temp.name, "wrong.sqlite")
        create_dictionary(wrong_path, valid_schema=False)
        with self.assertRaisesRegex(RuntimeError, "required tags columns"):
            ChineseDictionaryService._validate_database(wrong_path)


class ChineseDictionaryUpdateTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.remote_path = os.path.join(self.temp.name, "remote.sqlite")
        self.install_dir = os.path.join(self.temp.name, "installed")
        create_dictionary(self.remote_path)

    async def asyncTearDown(self):
        self.temp.cleanup()

    async def test_ensure_only_downloads_once_for_simplified_chinese(self):
        service = LocalDownloadDictionaryService(self.install_dir, self.remote_path)
        await service.ensure("en")
        self.assertEqual(service.status()["state"], "missing")
        await service.ensure("zh-CN")
        first_task = service._task
        await service.ensure("zh")
        self.assertIs(service._task, first_task)
        await service.wait_for_update()
        self.assertEqual(service.download_count, 1)
        self.assertEqual(service.status()["state"], "ready")

    async def test_invalid_update_keeps_installed_database(self):
        service = LocalDownloadDictionaryService(self.install_dir, self.remote_path)
        await service.ensure("zh")
        await service.wait_for_update()
        installed_sha = service.status()["installed_sha"]

        wrong_path = os.path.join(self.temp.name, "wrong.sqlite")
        create_dictionary(wrong_path, valid_schema=False)
        service.remote_path = wrong_path
        service.start_update(force=True)
        await service.wait_for_update()

        self.assertEqual(service.status()["state"], "error")
        with open(service.metadata_path, encoding="utf-8") as metadata_file:
            self.assertEqual(json.load(metadata_file)["installed_sha"], installed_sha)
        self.assertEqual(service.lookup(["1girl"])["1girl"]["text"], "1个女孩")

    async def test_check_update_records_changed_remote_sha_without_downloading(self):
        service = LocalDownloadDictionaryService(self.install_dir, self.remote_path)
        await service.ensure("zh")
        await service.wait_for_update()
        installed_sha = service.status()["installed_sha"]

        os.remove(self.remote_path)
        create_dictionary(
            self.remote_path,
            rows=[("new_tag", 0, "新标签", 123)],
        )
        status = await service.check_update()

        self.assertNotEqual(status["remote_sha"], installed_sha)
        self.assertTrue(status["update_available"])
        self.assertEqual(service.download_count, 1)


class PrimaryTranslationStore:
    def lookup(self, names):
        return {
            name: {
                "tag_name": name,
                "text": "数据库译名",
                "category": 0,
                "post_count": 100,
                "origin": "ffdkj",
            }
            for name in names
            if name == "known_tag"
        }

    @staticmethod
    def status():
        return {"state": "ready"}


class DictionaryTranslationPrecedenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_primary_dictionary_wins_before_cached_or_new_llm_translation(self):
        with tempfile.TemporaryDirectory() as directory:
            store = TranslationStore(os.path.join(directory, "translations.sqlite3"))
            store.save_many(
                "zh",
                [{"name": "known_tag", "category": 0, "post_count": 1, "origin": "local"}],
                {"known_tag": "旧的LLM译名"},
                "model",
                "prompt",
            )
            config_path = os.path.join(directory, "config.json")
            config_store = OnlineServiceConfig(config_path)
            config_store.save({"deepseek": {"api_key": "not-used"}})
            manager = TranslationManager(
                config_path,
                store,
                config_store=config_store,
                primary_store=PrimaryTranslationStore(),
            )

            chunks = [
                chunk
                async for chunk in manager.resolve_stream(
                    "zh",
                    [{"name": "known_tag", "category": 0, "post_count": 1}],
                )
            ]
            self.assertEqual(chunks[0]["translations"], {"known_tag": "数据库译名"})
            self.assertEqual(len(chunks), 1)


class DanbooruReadRateLimiterTests(unittest.IsolatedAsyncioTestCase):
    async def test_limits_anonymous_reads_across_one_shared_window(self):
        limiter = AsyncReadRateLimiter(limit=2, window_seconds=0.02)
        started = time.monotonic()
        await asyncio.gather(*(limiter.acquire() for _ in range(3)))
        self.assertGreaterEqual(time.monotonic() - started, 0.015)
