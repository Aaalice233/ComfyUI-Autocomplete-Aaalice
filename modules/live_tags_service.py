import asyncio
import csv
import json
import math
import os
import random
from dataclasses import dataclass
from urllib.parse import urlencode

import aiohttp

from .live_tags_config import CATEGORY_IDS, LiveTagsConfig, mask_config


DANBOORU_TAGS_URL = "https://danbooru.donmai.us/tags.json"
DEEPSEEK_CHAT_URL = "https://api.deepseek.com/chat/completions"
USER_AGENT = "ComfyUI-Autocomplete-Aaalice/1.0 (live tag sync)"
SUPPORTED_LOCALES = {
    "zh": "Simplified Chinese",
    "zh-TW": "Traditional Chinese",
    "ja": "Japanese",
    "en": "English",
}


class LiveTagsError(RuntimeError):
    pass


class JobConflictError(LiveTagsError):
    pass


class RequestCancelled(LiveTagsError):
    pass


class RetryableDeepSeekError(LiveTagsError):
    def __init__(self, message, retry_after=None):
        super().__init__(message)
        self.retry_after = retry_after


@dataclass
class TranslationResult:
    translations: dict
    failures: list
    attempts: int
    retries: int


class DanbooruClient:
    def __init__(self, session, config, cancel_event, max_retries=3):
        self.session = session
        self.config = config
        self.cancel_event = cancel_event
        self.max_retries = max_retries

    async def iter_category(self, category_name, policy):
        category_id = CATEGORY_IDS[category_name]
        cursor = None
        while True:
            self._raise_if_cancelled()
            params = {
                "limit": "200",
                "search[category]": str(category_id),
                "search[order]": "date",
            }
            if policy["mode"] == "threshold":
                params["search[post_count]"] = f"{policy['threshold']}.."
            if cursor is not None:
                params["page"] = f"b{cursor}"
            login = self.config.get("login", "").strip()
            api_key = self.config.get("api_key", "").strip()
            if login and api_key:
                params["login"] = login
                params["api_key"] = api_key

            payload = await self._request_json(params)
            if not isinstance(payload, list):
                raise LiveTagsError("Danbooru returned an unexpected response instead of a tag list")
            if not payload:
                return

            parsed = []
            for item in payload:
                if not isinstance(item, dict):
                    continue
                try:
                    parsed.append(
                        {
                            "id": int(item["id"]),
                            "name": str(item["name"]),
                            "category": int(item["category"]),
                            "post_count": int(item["post_count"]),
                        }
                    )
                except (KeyError, TypeError, ValueError):
                    continue
            if not parsed:
                raise LiveTagsError("Danbooru returned a page without valid tag records")
            yield parsed

            next_cursor = min(tag["id"] for tag in parsed)
            if cursor is not None and next_cursor >= cursor:
                raise LiveTagsError("Danbooru pagination cursor did not advance")
            cursor = next_cursor
            if len(payload) < 200:
                return

    async def _request_json(self, params):
        for attempt in range(self.max_retries + 1):
            self._raise_if_cancelled()
            try:
                async with self.session.get(
                    DANBOORU_TAGS_URL,
                    params=params,
                    headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
                ) as response:
                    body = await response.text()
                    if response.status == 403:
                        if "cloudflare" in body.lower() or "just a moment" in body.lower():
                            raise LiveTagsError(
                                "Danbooru access was blocked by Cloudflare. Configure a Danbooru login and API key, "
                                "or try another network."
                            )
                        raise LiveTagsError("Danbooru returned HTTP 403. Check the configured login and API key.")
                    if response.status == 429 or 500 <= response.status < 600:
                        if attempt >= self.max_retries:
                            raise LiveTagsError(f"Danbooru returned HTTP {response.status} after retries")
                        await self._backoff(attempt, response.headers.get("Retry-After"))
                        continue
                    if response.status != 200:
                        safe_url = f"{DANBOORU_TAGS_URL}?{urlencode(_without_secrets(params))}"
                        raise LiveTagsError(f"Danbooru returned HTTP {response.status} for {safe_url}")
                    try:
                        return json.loads(body)
                    except json.JSONDecodeError as error:
                        raise LiveTagsError("Danbooru returned invalid JSON") from error
            except (aiohttp.ClientError, asyncio.TimeoutError) as error:
                if attempt >= self.max_retries:
                    raise LiveTagsError(
                        f"Danbooru request failed after retries ({type(error).__name__})"
                    ) from error
                await self._backoff(attempt, None)
        raise LiveTagsError("Danbooru request failed")

    async def _backoff(self, attempt, retry_after):
        try:
            delay = float(retry_after) if retry_after is not None else 2**attempt + random.random()
        except ValueError:
            delay = 2**attempt + random.random()
        try:
            await asyncio.wait_for(self.cancel_event.wait(), timeout=min(max(delay, 0), 60))
            raise RequestCancelled("Task cancelled")
        except asyncio.TimeoutError:
            return

    def _raise_if_cancelled(self):
        if self.cancel_event.is_set():
            raise RequestCancelled("Task cancelled")


class DeepSeekClient:
    def __init__(self, session, config, cancel_event):
        self.session = session
        self.config = config
        self.cancel_event = cancel_event

    async def translate(self, items, locale, on_success=None):
        translations, failures, attempts, retries = await self._translate_items(
            items,
            locale,
            self.config["max_retries"],
            on_success,
        )
        return TranslationResult(translations, failures, attempts, retries)

    async def _translate_items(self, items, locale, retries_left, on_success):
        if not items:
            return {}, [], 0, 0
        if self.cancel_event.is_set():
            raise RequestCancelled("Task cancelled")

        try:
            response_payload = await self._request(items, locale)
        except RequestCancelled:
            raise
        except (RetryableDeepSeekError, aiohttp.ClientError, asyncio.TimeoutError) as error:
            if retries_left <= 0:
                return {}, [item["name"] for item in items], 1, 0
            await self._retry_delay(
                self.config["max_retries"] - retries_left,
                getattr(error, "retry_after", None),
            )
            translations, failures, attempts, retries = await self._translate_items(
                items,
                locale,
                retries_left - 1,
                on_success,
            )
            return translations, failures, attempts + 1, retries + 1

        finish_reason = response_payload.get("finish_reason")
        if finish_reason == "length" and len(items) > 1:
            midpoint = math.ceil(len(items) / 2)
            left = await self._translate_items(items[:midpoint], locale, retries_left, on_success)
            right = await self._translate_items(items[midpoint:], locale, retries_left, on_success)
            return (
                {**left[0], **right[0]},
                left[1] + right[1],
                left[2] + right[2],
                left[3] + right[3] + 1,
            )

        valid, missing = validate_translation_response(response_payload.get("content"), items)
        if valid and on_success is not None:
            await on_success(valid)
        if not missing:
            return valid, [], 1, 0
        if retries_left <= 0:
            return valid, missing, 1, 0

        missing_set = set(missing)
        missing_items = [item for item in items if item["name"] in missing_set]
        await self._retry_delay(self.config["max_retries"] - retries_left)
        retried, failures, attempts, retries = await self._translate_items(
            missing_items,
            locale,
            retries_left - 1,
            on_success,
        )
        valid.update(retried)
        return valid, failures, attempts + 1, retries + 1

    async def _request(self, items, locale):
        target_language = SUPPORTED_LOCALES[locale]
        schema_instruction = (
            "Return valid JSON only, using exactly this schema: "
            '{"translations":[{"tag":"original_tag","translation":"translated text"}]}. '
            "Return every input tag exactly once and do not add unknown tags."
        )
        user_content = json.dumps(
            {
                "target_language": target_language,
                "tags": [{"tag": item["name"], "category": item["category"]} for item in items],
            },
            ensure_ascii=False,
        )
        payload = {
            "model": self.config["model"],
            "messages": [
                {"role": "system", "content": f"{self.config['system_prompt']}\n\n{schema_instruction}"},
                {"role": "user", "content": user_content},
            ],
            "response_format": {"type": "json_object"},
            "thinking": {"type": "disabled"},
            "temperature": 0.1,
            "max_tokens": 4096,
        }
        headers = {
            "Authorization": f"Bearer {self.config['api_key']}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        }
        async with self.session.post(DEEPSEEK_CHAT_URL, json=payload, headers=headers) as response:
            body = await response.text()
            if response.status == 401:
                raise LiveTagsError("DeepSeek rejected the API key")
            if response.status == 429 or 500 <= response.status < 600:
                raise RetryableDeepSeekError(
                    f"DeepSeek returned retryable HTTP {response.status}",
                    response.headers.get("Retry-After"),
                )
            if response.status != 200:
                raise LiveTagsError(f"DeepSeek returned HTTP {response.status}")
            try:
                result = json.loads(body)
                choice = result["choices"][0]
                return {
                    "content": choice["message"]["content"],
                    "finish_reason": choice.get("finish_reason"),
                }
            except (json.JSONDecodeError, KeyError, IndexError, TypeError) as error:
                raise LiveTagsError("DeepSeek returned an invalid response envelope") from error

    async def _retry_delay(self, attempt, retry_after=None):
        try:
            delay = float(retry_after) if retry_after is not None else 2**attempt + random.random()
        except ValueError:
            delay = 2**attempt + random.random()
        delay = min(max(delay, 0), 60)
        try:
            await asyncio.wait_for(self.cancel_event.wait(), timeout=delay)
            raise RequestCancelled("Task cancelled")
        except asyncio.TimeoutError:
            return


class LiveTagsManager:
    def __init__(self, config_path, store, base_csv_path, session_factory=None):
        self.config_store = LiveTagsConfig(config_path)
        self.store = store
        self.base_csv_path = base_csv_path
        self.session_factory = session_factory or aiohttp.ClientSession
        self._task = None
        self._cancel_event = asyncio.Event()
        self._writer_lock = asyncio.Lock()
        self._base_names = None
        self._base_count = 0
        self._rebuild_csv_if_stale()

    def get_config(self):
        return mask_config(self.config_store.load())

    def save_config(self, raw_config):
        return mask_config(self.config_store.save(raw_config))

    def status(self, locale=None):
        config = self.config_store.load()
        normalized_locale = normalize_locale(locale)
        statistics = self.store.statistics(normalized_locale, config["deepseek"]["batch_size"])
        statistics["base_tags"] = self._load_base_names_count()
        job = self.store.latest_job()
        return {
            "active": bool(self._task and not self._task.done()),
            "job": job,
            "statistics": statistics,
            "locale": normalized_locale,
            "csv_path": self.store.csv_path,
        }

    def start_scan(self):
        self._ensure_idle()
        job_id = self.store.create_job("scan")
        self._cancel_event = asyncio.Event()
        self._task = asyncio.create_task(self._run_scan(job_id))
        return job_id

    def start_translation(self, locale, mode="missing"):
        self._ensure_idle()
        locale = normalize_locale(locale)
        if locale == "en":
            raise ValueError("English does not require translation")
        if mode not in {"missing", "failed", "all"}:
            raise ValueError("Translation mode must be missing, failed, or all")
        config = self.config_store.load()
        if not config["deepseek"]["api_key"]:
            raise ValueError("Configure a DeepSeek API key before starting translation")
        job_id = self.store.create_job("translate", locale)
        self._cancel_event = asyncio.Event()
        self._task = asyncio.create_task(self._run_translation(job_id, locale, mode))
        return job_id

    def cancel(self):
        if not self._task or self._task.done():
            return False
        self._cancel_event.set()
        job = self.store.latest_job()
        if job:
            self.store.update_job(job["id"], status="cancelling", phase="cancelling", message="Cancelling task")
        return True

    def _ensure_idle(self):
        if self._task and not self._task.done():
            raise JobConflictError("Another live tags task is already running")

    async def _run_scan(self, job_id):
        self.store.update_job(job_id, status="running", phase="loading_base", message="Loading base CSV")
        self.store.clear_staging(job_id)
        try:
            base_names = await asyncio.to_thread(self._load_base_names)
            config = self.config_store.load()
            timeout = aiohttp.ClientTimeout(total=60)
            scanned = 0
            candidates = 0
            async with self.session_factory(timeout=timeout) as session:
                client = DanbooruClient(session, config["danbooru"], self._cancel_event)
                for category_name, policy in config["categories"].items():
                    if policy["mode"] == "disabled":
                        continue
                    self.store.update_job(
                        job_id,
                        phase="scanning",
                        completed=scanned,
                        message=f"Scanning {category_name}",
                    )
                    async for page in client.iter_category(category_name, policy):
                        scanned += len(page)
                        new_tags = [tag for tag in page if tag["name"] not in base_names]
                        candidates += len(new_tags)
                        await asyncio.to_thread(self.store.stage_tags, job_id, new_tags)
                        self.store.update_job(
                            job_id,
                            completed=scanned,
                            message=f"Scanning {category_name}: {scanned} tags, {candidates} new",
                        )

            if self._cancel_event.is_set():
                raise RequestCancelled("Task cancelled")
            self.store.update_job(job_id, phase="committing", message="Committing scan results")
            await asyncio.to_thread(self.store.commit_scan, job_id)
            exported = await asyncio.to_thread(self.store.export_csv)
            self.store.update_job(
                job_id,
                status="completed",
                phase="completed",
                total=scanned,
                completed=scanned,
                message=f"Scan complete: {exported} new tags exported",
            )
        except RequestCancelled:
            self.store.clear_staging(job_id)
            self.store.update_job(job_id, status="cancelled", phase="cancelled", message="Scan cancelled")
        except Exception as error:
            self.store.clear_staging(job_id)
            self.store.update_job(
                job_id,
                status="failed",
                phase="failed",
                message="Scan failed; the previous CSV was preserved",
                error=str(error)[:2000],
            )

    async def _run_translation(self, job_id, locale, mode):
        config = self.config_store.load()
        deepseek_config = config["deepseek"]
        work, cached = self.store.translation_work(locale, mode)
        total = len(work)
        self.store.update_job(
            job_id,
            status="running",
            phase="translating",
            total=total,
            cached=cached,
            message=f"Preparing {total} tags",
        )
        if not work:
            self.store.update_job(
                job_id,
                status="completed",
                phase="completed",
                message="No tags need translation",
            )
            return

        batches = [work[index : index + deepseek_config["batch_size"]] for index in range(0, total, deepseek_config["batch_size"])]
        queue = asyncio.Queue()
        for batch in batches:
            queue.put_nowait(batch)

        completed = 0
        failed = 0
        retries = 0
        export_checkpoint = 0
        counter_lock = asyncio.Lock()
        timeout = aiohttp.ClientTimeout(total=deepseek_config["timeout_seconds"])
        connector = aiohttp.TCPConnector(limit=deepseek_config["concurrency"])

        try:
            async with self.session_factory(timeout=timeout, connector=connector) as session:
                client = DeepSeekClient(session, deepseek_config, self._cancel_event)

                async def worker():
                    nonlocal completed, failed, retries, export_checkpoint
                    while not self._cancel_event.is_set():
                        try:
                            batch = queue.get_nowait()
                        except asyncio.QueueEmpty:
                            return
                        async def save_partial(translations):
                            async with self._writer_lock:
                                self.store.save_translation_successes(
                                    locale,
                                    translations,
                                    deepseek_config["model"],
                                    deepseek_config["system_prompt"],
                                    1,
                                )

                        result = await client.translate(batch, locale, save_partial)
                        async with self._writer_lock:
                            self.store.save_translation_successes(
                                locale,
                                result.translations,
                                deepseek_config["model"],
                                deepseek_config["system_prompt"],
                                result.attempts,
                            )
                            self.store.save_translation_failures(
                                locale,
                                result.failures,
                                deepseek_config["model"],
                                deepseek_config["system_prompt"],
                                result.attempts,
                                "Translation failed validation or exhausted retries",
                            )
                        async with counter_lock:
                            batch_completed = len(result.translations)
                            batch_failed = len(result.failures)
                            completed += batch_completed + batch_failed
                            failed += batch_failed
                            retries += result.retries
                            self.store.update_job(
                                job_id,
                                completed=completed,
                                failed=failed,
                                retrying=retries,
                                message=f"Translated {completed - failed}/{total}; {failed} failed",
                            )
                            if completed - export_checkpoint >= 1000:
                                export_checkpoint = completed
                                await asyncio.to_thread(self.store.export_csv)
                        queue.task_done()

                worker_count = min(deepseek_config["concurrency"], len(batches))
                workers = [asyncio.create_task(worker()) for _ in range(worker_count)]
                try:
                    await asyncio.gather(*workers)
                finally:
                    for worker_task in workers:
                        if not worker_task.done():
                            worker_task.cancel()
                    await asyncio.gather(*workers, return_exceptions=True)

            if self._cancel_event.is_set():
                raise RequestCancelled("Task cancelled")
            await asyncio.to_thread(self.store.export_csv)
            self.store.update_job(
                job_id,
                status="completed",
                phase="completed",
                completed=completed,
                failed=failed,
                retrying=retries,
                message=f"Translation complete: {completed - failed} succeeded, {failed} failed",
            )
        except RequestCancelled:
            await asyncio.to_thread(self.store.export_csv)
            self.store.update_job(
                job_id,
                status="cancelled",
                phase="cancelled",
                completed=completed,
                failed=failed,
                retrying=retries,
                message="Translation cancelled; completed results were saved",
            )
        except Exception as error:
            await asyncio.to_thread(self.store.export_csv)
            self.store.update_job(
                job_id,
                status="failed",
                phase="failed",
                completed=completed,
                failed=failed,
                retrying=retries,
                message="Translation stopped; completed results were saved",
                error=str(error)[:2000],
            )

    def _load_base_names(self):
        names = set()
        try:
            with open(self.base_csv_path, encoding="utf-8-sig", newline="") as csv_file:
                reader = csv.DictReader(csv_file)
                for row in reader:
                    name = (row.get("tag") or "").strip()
                    if name:
                        names.add(name)
        except OSError as error:
            raise LiveTagsError(f"Unable to read the base Danbooru CSV: {error}") from error
        self._base_names = names
        self._base_count = len(names)
        return names

    def _load_base_names_count(self):
        if self._base_names is None:
            try:
                self._load_base_names()
            except LiveTagsError:
                return 0
        return self._base_count

    def _rebuild_csv_if_stale(self):
        if self.store.candidate_count() <= 0:
            return
        database_times = [
            os.path.getmtime(path)
            for path in (self.store.database_path, f"{self.store.database_path}-wal")
            if os.path.exists(path)
        ]
        csv_time = os.path.getmtime(self.store.csv_path) if os.path.exists(self.store.csv_path) else -1
        if not database_times or max(database_times) <= csv_time:
            return
        self.store.export_csv()


def normalize_locale(locale):
    normalized = str(locale or "en").replace("_", "-")
    lowered = normalized.lower()
    if lowered in {"zh-tw", "zh-hant", "zh-hk"}:
        return "zh-TW"
    if lowered.startswith("zh"):
        return "zh"
    if lowered.startswith("ja"):
        return "ja"
    return "en"


def validate_translation_response(content, items):
    expected = {item["name"] for item in items}
    if not isinstance(content, str) or not content.strip():
        return {}, sorted(expected)
    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        return {}, sorted(expected)
    entries = payload.get("translations") if isinstance(payload, dict) else None
    if not isinstance(entries, list):
        return {}, sorted(expected)

    valid = {}
    invalid = set()
    has_unknown_tag = False
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        tag = entry.get("tag")
        translation = entry.get("translation")
        if tag not in expected:
            has_unknown_tag = True
            continue
        invalid_translation = (
            not isinstance(translation, str)
            or not translation.strip()
            or any(character in translation for character in ("\r", "\n", "\x00"))
        )
        if tag in valid or invalid_translation:
            if tag in expected:
                invalid.add(tag)
            continue
        valid[tag] = translation.strip()
    if has_unknown_tag:
        return {}, sorted(expected)
    for tag in invalid:
        valid.pop(tag, None)
    missing = sorted(expected - valid.keys())
    return valid, missing


def _without_secrets(params):
    return {key: value for key, value in params.items() if key not in {"login", "api_key"}}
