import asyncio
import hashlib
import json
import math
import random
from dataclasses import dataclass
from datetime import datetime, timezone

import aiohttp

from .translation_config import OnlineServiceConfig, mask_config


DEEPSEEK_CHAT_URL = "https://api.deepseek.com/chat/completions"
DEEPSEEK_MODELS_URL = "https://api.deepseek.com/models"
USER_AGENT = "Autocomplete-Plus/1.12"
SUPPORTED_LOCALES = {
    "zh": "Simplified Chinese",
    "zh-TW": "Traditional Chinese",
    "ja": "Japanese",
    "en": "English",
}


class TranslationError(RuntimeError):
    def __init__(self, message, code="translation_error"):
        super().__init__(message)
        self.code = code


class RetryableTranslationError(TranslationError):
    def __init__(self, message, retry_after=None):
        super().__init__(message, "deepseek_request_failed")
        self.retry_after = retry_after


@dataclass
class TranslationResult:
    translations: dict
    failures: list


class DeepSeekClient:
    def __init__(self, session, config):
        self.session = session
        self.config = config

    async def translate(self, items, locale):
        translations, failures = await self._translate_items(items, locale, self.config["max_retries"])
        return TranslationResult(translations, failures)

    async def _translate_items(self, items, locale, retries_left):
        if not items:
            return {}, []
        try:
            response_payload = await self._request(items, locale)
        except (RetryableTranslationError, aiohttp.ClientError, asyncio.TimeoutError) as error:
            if retries_left <= 0:
                return {}, [item["name"] for item in items]
            await self._retry_delay(self.config["max_retries"] - retries_left, getattr(error, "retry_after", None))
            return await self._translate_items(items, locale, retries_left - 1)

        if response_payload.get("finish_reason") == "length" and len(items) > 1:
            midpoint = math.ceil(len(items) / 2)
            left, right = await asyncio.gather(
                self._translate_items(items[:midpoint], locale, retries_left),
                self._translate_items(items[midpoint:], locale, retries_left),
            )
            return {**left[0], **right[0]}, left[1] + right[1]

        valid, missing = validate_translation_response(response_payload.get("content"), items)
        if not missing or retries_left <= 0:
            return valid, missing
        missing_set = set(missing)
        missing_items = [item for item in items if item["name"] in missing_set]
        await self._retry_delay(self.config["max_retries"] - retries_left)
        retried, failures = await self._translate_items(missing_items, locale, retries_left - 1)
        valid.update(retried)
        return valid, failures

    async def _request(self, items, locale):
        schema_instruction = (
            "Return valid JSON only, using exactly this schema: "
            '{"translations":[{"tag":"original_tag","translation":"translated text"}]}. '
            "Return every input tag exactly once and do not add unknown tags."
        )
        reasoning_effort = self.config.get("reasoning_effort", "disabled")
        payload = {
            "model": self.config["model"],
            "messages": [
                {"role": "system", "content": f"{self.config['system_prompt']}\n\n{schema_instruction}"},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "target_language": SUPPORTED_LOCALES[locale],
                            "tags": [{"tag": item["name"], "category": item["category"]} for item in items],
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
            "response_format": {"type": "json_object"},
            "thinking": {"type": "disabled" if reasoning_effort == "disabled" else "enabled"},
            "max_tokens": 4096,
        }
        if reasoning_effort == "disabled":
            payload["temperature"] = 0.1
        else:
            payload["reasoning_effort"] = reasoning_effort
        headers = {
            "Authorization": f"Bearer {self.config['api_key']}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        }
        async with self.session.post(DEEPSEEK_CHAT_URL, json=payload, headers=headers) as response:
            body = await response.text()
            if response.status == 401:
                raise TranslationError("DeepSeek rejected the API key", "deepseek_auth_failed")
            if response.status == 429 or 500 <= response.status < 600:
                raise RetryableTranslationError(
                    f"DeepSeek returned retryable HTTP {response.status}", response.headers.get("Retry-After")
                )
            if response.status != 200:
                raise TranslationError(f"DeepSeek returned HTTP {response.status}", "deepseek_request_failed")
            try:
                result = json.loads(body)
                choice = result["choices"][0]
                return {
                    "content": choice["message"]["content"],
                    "finish_reason": choice.get("finish_reason"),
                }
            except (json.JSONDecodeError, KeyError, IndexError, TypeError) as error:
                raise TranslationError(
                    "DeepSeek returned an invalid response envelope", "deepseek_invalid_response"
                ) from error

    async def _retry_delay(self, attempt, retry_after=None):
        try:
            delay = float(retry_after) if retry_after is not None else 2**attempt + random.random()
        except ValueError:
            delay = 2**attempt + random.random()
        await asyncio.sleep(min(max(delay, 0), 60))


class TranslationManager:
    def __init__(self, config_path, store, session_factory=None, config_store=None):
        self.config_store = config_store or OnlineServiceConfig(config_path)
        self.store = store
        self.session_factory = session_factory or aiohttp.ClientSession
        self._inflight = {}
        self._inflight_lock = asyncio.Lock()
        self._last_status = {"state": "idle", "message": "", "updated_at": None}

    def get_config(self):
        return mask_config(self.config_store.load())

    def save_config(self, raw_config):
        return mask_config(self.config_store.save(raw_config))

    def status(self):
        return {
            "cache_count": self.store.count(),
            "deepseek": self._last_status.copy(),
            "configured": bool(self.config_store.load()["deepseek"]["api_key"]),
        }

    def catalog(self, locale):
        return self.store.catalog(normalize_locale(locale))

    async def list_models(self, supplied_key=None):
        config = self.config_store.load()["deepseek"]
        api_key = self._resolve_api_key(supplied_key, config["api_key"])
        if not api_key:
            raise TranslationError("Configure a DeepSeek API key first", "deepseek_key_missing")
        timeout = aiohttp.ClientTimeout(total=min(config["timeout_seconds"], 30))
        headers = {"Authorization": f"Bearer {api_key}", "Accept": "application/json", "User-Agent": USER_AGENT}
        try:
            async with self.session_factory(timeout=timeout) as session:
                async with session.get(DEEPSEEK_MODELS_URL, headers=headers) as response:
                    body = await response.text()
                    if response.status == 401:
                        raise TranslationError("DeepSeek rejected the API key", "deepseek_auth_failed")
                    if response.status != 200:
                        raise TranslationError(f"DeepSeek returned HTTP {response.status}", "deepseek_request_failed")
            payload = json.loads(body)
            models = sorted({str(item.get("id")) for item in payload.get("data", []) if item.get("id")})
            self._set_status("success", f"Loaded {len(models)} model(s)")
            return models
        except Exception as error:
            self._set_status("error", str(error)[:500])
            raise

    async def test_model(self, supplied_key, model, reasoning_effort="disabled"):
        config = self.config_store.load()["deepseek"].copy()
        config["api_key"] = self._resolve_api_key(supplied_key, config["api_key"])
        config["model"] = str(model or config["model"]).strip()
        config["reasoning_effort"] = reasoning_effort if reasoning_effort in {"disabled", "high", "max"} else "disabled"
        if not config["api_key"]:
            raise TranslationError("Configure a DeepSeek API key first", "deepseek_key_missing")
        timeout = aiohttp.ClientTimeout(total=min(config["timeout_seconds"], 30))
        headers = {
            "Authorization": f"Bearer {config['api_key']}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        }
        payload = {
            "model": config["model"],
            "messages": [{"role": "user", "content": "Reply with OK only."}],
            "thinking": {"type": "disabled" if config["reasoning_effort"] == "disabled" else "enabled"},
            "max_tokens": 8,
        }
        if config["reasoning_effort"] != "disabled":
            payload["reasoning_effort"] = config["reasoning_effort"]
        try:
            async with self.session_factory(timeout=timeout) as session:
                async with session.post(DEEPSEEK_CHAT_URL, json=payload, headers=headers) as response:
                    body = await response.text()
                    if response.status == 401:
                        raise TranslationError("DeepSeek rejected the API key", "deepseek_auth_failed")
                    if response.status != 200:
                        raise TranslationError(f"DeepSeek returned HTTP {response.status}", "deepseek_request_failed")
            result = json.loads(body)
            result["choices"][0]["message"]
            self._set_status("success", f"Model {config['model']} is available")
            return {"ok": True, "model": config["model"]}
        except Exception as error:
            self._set_status("error", str(error)[:500])
            raise

    async def resolve(self, locale, raw_items):
        locale = normalize_locale(locale)
        items = normalize_items(raw_items)
        tag_names = [item["name"] for item in items]
        cached = await asyncio.to_thread(self.store.get_many, locale, tag_names)
        if locale == "en" or not items:
            return cached

        full_config = self.config_store.load()
        if not full_config["features"]["translation"]:
            return cached
        config = full_config["deepseek"]
        missing = [item for item in items if item["name"] not in cached]
        if not config["api_key"] or not missing:
            return cached

        owned = []
        futures = {}
        loop = asyncio.get_running_loop()
        async with self._inflight_lock:
            # Another request can finish between the first SQLite lookup and
            # acquiring this lock. Refresh here so a just-persisted translation
            # is not purchased again after its in-flight entry was removed.
            refreshed = await asyncio.to_thread(
                self.store.get_many,
                locale,
                [item["name"] for item in missing],
            )
            cached.update(refreshed)
            for item in missing:
                if item["name"] in cached:
                    continue
                key = (locale, item["name"])
                future = self._inflight.get(key)
                if future is None:
                    future = loop.create_future()
                    self._inflight[key] = future
                    owned.append(item)
                futures[item["name"]] = future

        if owned:
            worker = asyncio.create_task(self._translate_owned(locale, owned, config))
            await asyncio.shield(worker)

        if futures:
            await asyncio.gather(*futures.values())
        return await asyncio.to_thread(self.store.get_many, locale, tag_names)

    async def _translate_owned(self, locale, items, config):
        translations = {}
        error = None
        try:
            timeout = aiohttp.ClientTimeout(total=config["timeout_seconds"])
            connector = aiohttp.TCPConnector(limit=config["concurrency"])
            async with self.session_factory(timeout=timeout, connector=connector) as session:
                client = DeepSeekClient(session, config)
                batches = [
                    items[index : index + config["batch_size"]]
                    for index in range(0, len(items), config["batch_size"])
                ]
                semaphore = asyncio.Semaphore(config["concurrency"])

                async def translate_batch(batch):
                    async with semaphore:
                        return batch, await client.translate(batch, locale)

                for batch, result in await asyncio.gather(*(translate_batch(batch) for batch in batches)):
                    translations.update(result.translations)
                    if result.translations:
                        prompt_hash = hashlib.sha256(config["system_prompt"].encode("utf-8")).hexdigest()
                        await asyncio.to_thread(
                            self.store.save_many,
                            locale,
                            batch,
                            result.translations,
                            config["model"],
                            prompt_hash,
                        )
            self._set_status("success", f"Translated {len(translations)} tag(s)")
        except Exception as caught:
            error = caught
            self._set_status("error", str(caught)[:500])
        finally:
            async with self._inflight_lock:
                for item in items:
                    key = (locale, item["name"])
                    future = self._inflight.pop(key, None)
                    if future is not None and not future.done():
                        future.set_result(translations.get(item["name"]))
        if error:
            return

    def _set_status(self, state, message):
        self._last_status = {
            "state": state,
            "message": message,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def _resolve_api_key(supplied_key, saved_key):
        value = str(supplied_key or "").strip()
        return saved_key if value in {"", "********"} else value


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


def normalize_items(raw_items):
    if not isinstance(raw_items, list):
        raise ValueError("tags must be an array")
    normalized = []
    seen = set()
    for raw_item in raw_items[:50]:
        if not isinstance(raw_item, dict):
            continue
        name = str(raw_item.get("name") or "").strip()
        if not name or len(name) > 200 or name in seen:
            continue
        seen.add(name)
        try:
            category = int(raw_item.get("category") or 0)
            post_count = max(int(raw_item.get("post_count") or 0), 0)
        except (TypeError, ValueError):
            continue
        origin = "danbooru_api" if raw_item.get("origin") == "danbooru_api" else "local"
        normalized.append(
            {"name": name, "category": category, "post_count": post_count, "origin": origin}
        )
    return normalized


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
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        tag = entry.get("tag")
        translation = entry.get("translation")
        if tag not in expected:
            return {}, sorted(expected)
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
    for tag in invalid:
        valid.pop(tag, None)
    return valid, sorted(expected - valid.keys())
