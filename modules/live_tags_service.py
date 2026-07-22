import asyncio
import csv
import json
import math
import os
import random
import time
from dataclasses import dataclass
from urllib.parse import urlencode

import aiohttp

from .live_tags_config import CATEGORY_IDS, LiveTagsConfig, mask_config


DANBOORU_TAGS_URL = "https://danbooru.donmai.us/tags.json"
DEEPSEEK_CHAT_URL = "https://api.deepseek.com/chat/completions"
USER_AGENT = "Autocomplete-Plus/1.11"
DANBOORU_SCAN_SHARDS = 16
ADAPTIVE_CONCURRENCY_RECOVERY_SUCCESSES = 20
SUPPORTED_LOCALES = {
    "zh": "Simplified Chinese",
    "zh-TW": "Traditional Chinese",
    "ja": "Japanese",
    "en": "English",
}


class LiveTagsError(RuntimeError):
    code = "live_tags_error"

    def __init__(self, message, code=None):
        super().__init__(message)
        self.code = code or self.code


class JobConflictError(LiveTagsError):
    code = "job_conflict"


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


class AdaptiveRequestLimiter:
    """Limit Danbooru traffic and recover gradually after a rate-limit response."""

    def __init__(self, max_concurrency, recovery_successes=ADAPTIVE_CONCURRENCY_RECOVERY_SUCCESSES):
        self.max_concurrency = max(1, int(max_concurrency))
        self.current_limit = self.max_concurrency
        self.recovery_successes = max(1, int(recovery_successes))
        self._active = 0
        self._success_streak = 0
        self._condition = asyncio.Condition()

    async def acquire(self):
        async with self._condition:
            await self._condition.wait_for(lambda: self._active < self.current_limit)
            self._active += 1

    async def release(self, *, rate_limited=False, successful=False):
        async with self._condition:
            self._active -= 1
            if rate_limited:
                self.current_limit = max(1, math.ceil(self.current_limit / 2))
                self._success_streak = 0
            elif successful and self.current_limit < self.max_concurrency:
                self._success_streak += 1
                if self._success_streak >= self.recovery_successes:
                    self.current_limit += 1
                    self._success_streak = 0
            self._condition.notify_all()


class DanbooruClient:
    def __init__(self, session, config, cancel_event, max_retries=3, request_limiter=None):
        self.session = session
        self.config = config
        self.cancel_event = cancel_event
        self.max_retries = max_retries
        self.request_limiter = request_limiter or AdaptiveRequestLimiter(config.get("scan_concurrency", 8))

    async def get_max_tag_id(self):
        payload = await self._request_json(self._with_auth({"limit": "1", "search[order]": "date"}))
        if not isinstance(payload, list) or not payload:
            raise LiveTagsError("Danbooru returned no tags", "danbooru_invalid_response")
        try:
            return int(payload[0]["id"])
        except (KeyError, TypeError, ValueError) as error:
            raise LiveTagsError("Danbooru returned an invalid tag ID", "danbooru_invalid_response") from error

    async def iter_category(self, category_name, policy, id_range=None, cursor=None):
        category_id = CATEGORY_IDS[category_name]
        while True:
            self._raise_if_cancelled()
            params = {
                "limit": "200",
                "search[category]": str(category_id),
                "search[order]": "date",
            }
            if policy["mode"] == "threshold":
                params["search[post_count]"] = f"{policy['threshold']}.."
            if id_range is not None:
                params["search[id]"] = f"{id_range[0]}..{id_range[1]}"
            if cursor is not None:
                params["page"] = f"b{cursor}"
            payload = await self._request_json(self._with_auth(params))
            if not isinstance(payload, list):
                raise LiveTagsError(
                    "Danbooru returned an unexpected response instead of a tag list",
                    "danbooru_invalid_response",
                )
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
                raise LiveTagsError("Danbooru returned a page without valid tag records", "danbooru_invalid_response")
            yield parsed

            next_cursor = min(tag["id"] for tag in parsed)
            if cursor is not None and next_cursor >= cursor:
                raise LiveTagsError("Danbooru pagination cursor did not advance", "danbooru_pagination_failed")
            cursor = next_cursor
            if len(payload) < 200:
                return

    def _with_auth(self, params):
        login = self.config.get("login", "").strip()
        api_key = self.config.get("api_key", "").strip()
        if login and api_key:
            return {**params, "login": login, "api_key": api_key}
        return params

    async def _request_json(self, params):
        for attempt in range(self.max_retries + 1):
            self._raise_if_cancelled()
            try:
                status = None
                await self.request_limiter.acquire()
                try:
                    async with self.session.get(
                        DANBOORU_TAGS_URL,
                        params=params,
                        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
                    ) as response:
                        status = response.status
                        body = await response.text()
                        retry_after = response.headers.get("Retry-After")
                finally:
                    await self.request_limiter.release(
                        rate_limited=status == 429,
                        successful=status == 200,
                    )
                if status == 403:
                    if "cloudflare" in body.lower() or "just a moment" in body.lower():
                        raise LiveTagsError(
                            "Danbooru access was blocked by Cloudflare. Configure a Danbooru login and API key, "
                            "or try another network.",
                            "danbooru_cloudflare_blocked",
                        )
                    raise LiveTagsError(
                        "Danbooru returned HTTP 403. Check the configured login and API key.",
                        "danbooru_auth_failed",
                    )
                if status == 429 or 500 <= status < 600:
                    if attempt >= self.max_retries:
                        raise LiveTagsError(
                            f"Danbooru returned HTTP {status} after retries",
                            "danbooru_request_failed",
                        )
                    await self._backoff(attempt, retry_after)
                    continue
                if status != 200:
                    safe_url = f"{DANBOORU_TAGS_URL}?{urlencode(_without_secrets(params))}"
                    raise LiveTagsError(
                        f"Danbooru returned HTTP {status} for {safe_url}",
                        "danbooru_request_failed",
                    )
                try:
                    return json.loads(body)
                except json.JSONDecodeError as error:
                    raise LiveTagsError("Danbooru returned invalid JSON", "danbooru_invalid_response") from error
            except (aiohttp.ClientError, asyncio.TimeoutError) as error:
                if attempt >= self.max_retries:
                    raise LiveTagsError(
                        f"Danbooru request failed after retries ({type(error).__name__})",
                        "danbooru_request_failed",
                    ) from error
                await self._backoff(attempt, None)
        raise LiveTagsError("Danbooru request failed", "danbooru_request_failed")

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
                raise LiveTagsError("DeepSeek rejected the API key", "deepseek_auth_failed")
            if response.status == 429 or 500 <= response.status < 600:
                raise RetryableDeepSeekError(
                    f"DeepSeek returned retryable HTTP {response.status}",
                    response.headers.get("Retry-After"),
                )
            if response.status != 200:
                raise LiveTagsError(f"DeepSeek returned HTTP {response.status}", "deepseek_request_failed")
            try:
                result = json.loads(body)
                choice = result["choices"][0]
                return {
                    "content": choice["message"]["content"],
                    "finish_reason": choice.get("finish_reason"),
                }
            except (json.JSONDecodeError, KeyError, IndexError, TypeError) as error:
                raise LiveTagsError(
                    "DeepSeek returned an invalid response envelope",
                    "deepseek_invalid_response",
                ) from error

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
        self._base_mtime_ns = None
        self._runtime_progress = None
        self._statistics_cache = None
        self._statistics_task = None
        try:
            self._load_base_names()
        except LiveTagsError:
            pass
        self._rebuild_csv_if_stale()

    def get_config(self):
        return mask_config(self.config_store.load())

    def save_config(self, raw_config):
        return mask_config(self.config_store.save(raw_config))

    def tag_statistics(self, category=None, source="all", query="", limit=100, offset=0, locale=None):
        category_id = CATEGORY_IDS.get(category) if category else None
        if category and category_id is None:
            raise LiveTagsError("Unknown tag category", "statistics_filter_invalid")
        limit = min(max(int(limit), 1), 200)
        offset = max(int(offset), 0)
        return {
            "summary": self.store.tag_statistics(),
            "list": self.store.tag_list(
                category_id,
                source,
                query.strip(),
                limit,
                offset,
                normalize_locale(locale),
            ),
        }

    def translation_dictionary(self, locale=None, query="", limit=100, offset=0):
        normalized_locale = normalize_locale(locale) if locale else None
        return self.store.translation_dictionary(
            normalized_locale,
            query.strip(),
            min(max(int(limit), 1), 200),
            max(int(offset), 0),
        )

    def status(self, locale=None):
        config = self.config_store.load()
        normalized_locale = normalize_locale(locale)
        self._load_base_names_count()
        job = self.store.latest_job()
        resumable = self.store.latest_resumable_job()
        active = bool(self._task and not self._task.done())
        staging_job_id = None
        if job and job["kind"] == "scan" and job["status"] != "completed":
            staging_job_id = job["id"]
        details = None
        if job:
            if job["kind"] == "scan":
                details = self.store.scan_progress(job["id"])
            elif job["kind"] == "translate":
                details = self.store.translation_queue_progress(job["id"])
        if self._runtime_progress and job and self._runtime_progress["job_id"] == job["id"]:
            elapsed = max(time.monotonic() - self._runtime_progress["started_at"], 0.001)
            details = details or {}
            details["rate"] = max(job["completed"] - self._runtime_progress["baseline"], 0) / elapsed
        batch_size = config["deepseek"]["batch_size"]
        if staging_job_id is not None and active:
            statistics = self.store.statistics(normalized_locale, batch_size)
            cache_key = (staging_job_id, normalized_locale, batch_size)
            if self._statistics_cache and self._statistics_cache["key"] == cache_key:
                statistics = self._statistics_cache["value"].copy()
            if details:
                statistics["candidates"] = details["candidates"]
            self._schedule_statistics_refresh(cache_key)
        else:
            statistics = self.store.statistics(
                normalized_locale,
                batch_size,
                staging_job_id=staging_job_id,
            )
        statistics["base_tags"] = self._base_count
        resumable_config_changed = bool(
            resumable
            and resumable["kind"] == "scan"
            and self._scan_config_changed(resumable, config)
        )
        return {
            "active": active,
            "job": job,
            "statistics": statistics,
            "locale": normalized_locale,
            "csv_path": self.store.csv_path,
            "details": details,
            "resumable": resumable,
            "resumable_config_changed": resumable_config_changed,
        }

    def _schedule_statistics_refresh(self, cache_key):
        if self._statistics_task and not self._statistics_task.done():
            return
        if (
            self._statistics_cache
            and self._statistics_cache["key"] == cache_key
            and time.monotonic() - self._statistics_cache["updated_at"] < 5
        ):
            return
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return

        async def refresh():
            try:
                job_id, locale, batch_size = cache_key
                value = await asyncio.to_thread(
                    self.store.statistics,
                    locale,
                    batch_size,
                    staging_job_id=job_id,
                )
                self._statistics_cache = {
                    "key": cache_key,
                    "value": value,
                    "updated_at": time.monotonic(),
                }
            finally:
                self._statistics_task = None

        self._statistics_task = asyncio.create_task(refresh())

    def start_scan(self):
        self._ensure_idle()
        self.store.discard_resumable_jobs("scan")
        config = self.config_store.load()
        job_id = self.store.create_job("scan", options={"categories": config["categories"]})
        self._cancel_event = asyncio.Event()
        self._task = asyncio.create_task(self._run_scan(job_id))
        return job_id

    def start_translation(self, locale, mode="missing"):
        self._ensure_idle()
        locale = normalize_locale(locale)
        if locale == "en":
            raise LiveTagsError("English does not require translation", "english_translation_not_required")
        if mode not in {"missing", "failed", "all"}:
            raise LiveTagsError("Translation mode must be missing, failed, or all", "translation_mode_invalid")
        self._load_base_names()
        config = self.config_store.load()
        if not config["deepseek"]["api_key"]:
            raise LiveTagsError(
                "Configure a DeepSeek API key before starting translation",
                "deepseek_key_missing",
            )
        self.store.discard_resumable_jobs("translate")
        job_id = self.store.create_job("translate", locale, mode=mode)
        self._cancel_event = asyncio.Event()
        self._task = asyncio.create_task(self._run_translation(job_id, locale, mode))
        return job_id

    def resume_latest(self):
        self._ensure_idle()
        job = self.store.latest_resumable_job()
        if not job:
            raise LiveTagsError("No interrupted task can be resumed", "resume_not_available")
        if job["kind"] == "scan" and self._scan_config_changed(job, self.config_store.load()):
            raise LiveTagsError(
                "Category settings changed after this scan started. Start a new scan to apply the new settings.",
                "scan_config_changed",
            )
        self._cancel_event = asyncio.Event()
        self.store.update_job(job["id"], status="queued", phase="queued", error=None, error_code=None)
        if job["kind"] == "scan":
            self._task = asyncio.create_task(self._run_scan(job["id"], resume=True))
        else:
            self._task = asyncio.create_task(
                self._run_translation(job["id"], job["locale"], job.get("mode") or "missing", resume=True)
            )
        return job["id"]

    @staticmethod
    def _scan_config_changed(job, config):
        options = json.loads(job.get("options_json") or "{}")
        saved_categories = options.get("categories")
        return saved_categories is not None and saved_categories != config["categories"]

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

    async def _run_scan(self, job_id, resume=False):
        self.store.update_job(job_id, status="running", phase="loading_base", message="Loading base CSV")
        if not resume:
            self.store.clear_staging(job_id)
        try:
            await asyncio.to_thread(self._load_base_names)
            config = self.config_store.load()
            job = self.store.job(job_id)
            options = json.loads(job["options_json"] or "{}")
            categories = options.get("categories", config["categories"])
            timeout = aiohttp.ClientTimeout(total=60)
            initial_progress = self.store.scan_progress(job_id)
            scanned = initial_progress["scanned"]
            candidates = initial_progress["candidates"]
            self._runtime_progress = {"job_id": job_id, "started_at": time.monotonic(), "baseline": scanned}
            async with self.session_factory(timeout=timeout) as session:
                scan_concurrency = config["danbooru"]["scan_concurrency"]
                request_limiter = AdaptiveRequestLimiter(scan_concurrency)
                client = DanbooruClient(
                    session,
                    config["danbooru"],
                    self._cancel_event,
                    request_limiter=request_limiter,
                )
                if not self.store.pending_scan_partitions(job_id):
                    max_tag_id = await client.get_max_tag_id()
                    id_ranges = split_id_ranges(max_tag_id, DANBOORU_SCAN_SHARDS)
                    enabled_categories = [name for name, policy in categories.items() if policy["mode"] != "disabled"]
                    self.store.initialize_scan_partitions(job_id, enabled_categories, id_ranges)
                partitions = self.store.pending_scan_partitions(job_id)
                queue = asyncio.Queue()
                for partition in partitions:
                    queue.put_nowait(partition)
                counter_lock = asyncio.Lock()
                stage_lock = asyncio.Lock()
                last_live_export = 0.0

                async def scan_worker():
                    nonlocal scanned, candidates, last_live_export
                    while not self._cancel_event.is_set():
                        try:
                            partition = queue.get_nowait()
                        except asyncio.QueueEmpty:
                            return
                        category_name = partition["category"]
                        policy = categories[category_name]
                        id_range = (partition["range_start"], partition["range_end"])
                        last_cursor = partition["cursor"]
                        async for page in client.iter_category(category_name, policy, id_range, last_cursor):
                            fetched_tags = page
                            # SQLite remains a single writer while network requests run concurrently.
                            async with stage_lock:
                                await asyncio.to_thread(self.store.stage_tags, job_id, fetched_tags)
                                last_cursor = min(tag["id"] for tag in page)
                                self.store.checkpoint_scan_partition(
                                    job_id,
                                    category_name,
                                    partition["range_start"],
                                    last_cursor,
                                    len(page),
                                    len(fetched_tags),
                                )
                                now = time.monotonic()
                                if now - last_live_export >= 2:
                                    await asyncio.to_thread(self.store.export_csv, job_id)
                                    last_live_export = now
                            async with counter_lock:
                                scanned += len(page)
                                candidates += len(fetched_tags)
                                self.store.update_job(
                                    job_id,
                                    phase="scanning",
                                    completed=scanned,
                                    message=f"Scanning {category_name}: {scanned} tags, {candidates} new",
                                )
                        self.store.checkpoint_scan_partition(
                            job_id,
                            category_name,
                            partition["range_start"],
                            last_cursor,
                            0,
                            0,
                            done=True,
                        )
                        queue.task_done()

                workers = [
                    asyncio.create_task(scan_worker())
                    for _ in range(min(scan_concurrency, len(partitions)))
                ]
                try:
                    await asyncio.gather(*workers)
                finally:
                    for worker in workers:
                        if not worker.done():
                            worker.cancel()
                    await asyncio.gather(*workers, return_exceptions=True)

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
            await asyncio.to_thread(self.store.export_csv, job_id)
            self.store.update_job(job_id, status="cancelled", phase="cancelled", message="Scan paused; progress was saved")
        except Exception as error:
            await asyncio.to_thread(self.store.export_csv, job_id)
            self.store.update_job(
                job_id,
                status="failed",
                phase="failed",
                message="Scan failed; the previous CSV was preserved",
                error=str(error)[:2000],
                error_code=getattr(error, "code", "live_tags_error"),
            )
        finally:
            self._runtime_progress = None

    async def _run_translation(self, job_id, locale, mode, resume=False):
        config = self.config_store.load()
        deepseek_config = config["deepseek"]
        if resume:
            work = self.store.pending_translation_work(job_id)
            queue_progress = self.store.translation_queue_progress(job_id)
            total = queue_progress["total"]
            completed = queue_progress["completed"]
            cached = 0
        else:
            work, cached = self.store.translation_work(locale, mode)
            if mode == "all":
                cached = 0
            self.store.initialize_translation_queue(job_id, work)
            total = len(work)
            completed = 0
        self.store.update_job(
            job_id,
            status="running",
            phase="translating",
            total=total,
            completed=completed,
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

        failed = 0
        retries = 0
        export_checkpoint = 0
        counter_lock = asyncio.Lock()
        timeout = aiohttp.ClientTimeout(total=deepseek_config["timeout_seconds"])
        connector = aiohttp.TCPConnector(limit=deepseek_config["concurrency"])
        self._runtime_progress = {"job_id": job_id, "started_at": time.monotonic(), "baseline": completed}

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
                                self.store.complete_translation_items(job_id, translations)

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
                            self.store.complete_translation_items(
                                job_id,
                                [*result.translations, *result.failures],
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
                error_code=getattr(error, "code", "live_tags_error"),
            )
        finally:
            self._runtime_progress = None

    def _load_base_names(self):
        try:
            mtime_ns = os.stat(self.base_csv_path).st_mtime_ns
        except OSError as error:
            raise LiveTagsError(
                f"Unable to read the base Danbooru CSV: {error}",
                "base_csv_read_failed",
            ) from error
        if self._base_names is not None and self._base_mtime_ns == mtime_ns:
            return self._base_names

        names = set()
        tags = []
        try:
            with open(self.base_csv_path, encoding="utf-8-sig", newline="") as csv_file:
                reader = csv.DictReader(csv_file)
                for row in reader:
                    name = (row.get("tag") or "").strip()
                    if name:
                        names.add(name)
                        try:
                            category = int(row.get("category") or 0)
                            post_count = int(row.get("count") or 0)
                        except ValueError as error:
                            raise LiveTagsError(
                                f"Invalid base Danbooru CSV row for {name}: {error}",
                                "base_csv_invalid",
                            ) from error
                        aliases = [alias.strip() for alias in (row.get("alias") or "").split(",") if alias.strip()]
                        tags.append(
                            {
                                "name": name,
                                "category": category,
                                "post_count": post_count,
                                "aliases": aliases,
                            }
                        )
        except OSError as error:
            raise LiveTagsError(
                f"Unable to read the base Danbooru CSV: {error}",
                "base_csv_read_failed",
            ) from error
        self.store.sync_base_tags(tags)
        self._base_names = names
        self._base_count = len(names)
        self._base_mtime_ns = mtime_ns
        return names

    def _load_base_names_count(self):
        if self._base_names is None:
            try:
                self._load_base_names()
            except LiveTagsError:
                return 0
        return self._base_count

    def _rebuild_csv_if_stale(self):
        if self.store.exportable_count() <= 0:
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


def split_id_ranges(max_id, shard_count):
    if max_id < 1 or shard_count < 1:
        return []
    width = math.ceil(max_id / shard_count)
    return [
        (start, min(start + width - 1, max_id))
        for start in range(1, max_id + 1, width)
    ]


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
