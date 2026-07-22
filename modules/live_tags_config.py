import copy
import json
import os
import tempfile


DEFAULT_SYSTEM_PROMPT = (
    "You are a Danbooru tag translation expert. Translate every supplied tag into the requested language. "
    "Preserve names and established terminology accurately. Return JSON only in the requested schema."
)

CATEGORY_IDS = {
    "general": 0,
    "artist": 1,
    "unused": 2,
    "copyright": 3,
    "character": 4,
    "meta": 5,
}

DEFAULT_CONFIG = {
    "version": 1,
    "categories": {
        "general": {"mode": "threshold", "threshold": 20},
        "artist": {"mode": "threshold", "threshold": 20},
        "unused": {"mode": "threshold", "threshold": 20},
        "copyright": {"mode": "threshold", "threshold": 20},
        "character": {"mode": "threshold", "threshold": 20},
        "meta": {"mode": "threshold", "threshold": 20},
    },
    "danbooru": {"login": "", "api_key": "", "scan_concurrency": 8},
    "deepseek": {
        "api_key": "",
        "model": "deepseek-v4-flash",
        "system_prompt": DEFAULT_SYSTEM_PROMPT,
        "concurrency": 300,
        "batch_size": 100,
        "max_retries": 3,
        "timeout_seconds": 180,
    },
}

SECRET_MASK = "********"


def validate_config(raw_config, current_config=None):
    """Validate a complete or partial configuration and return a normalized copy."""
    if raw_config is None:
        raw_config = {}
    if not isinstance(raw_config, dict):
        raise ValueError("Configuration must be an object")

    config = copy.deepcopy(current_config or DEFAULT_CONFIG)
    config["version"] = DEFAULT_CONFIG["version"]

    raw_categories = raw_config.get("categories", {})
    if not isinstance(raw_categories, dict):
        raise ValueError("categories must be an object")
    for name in CATEGORY_IDS:
        if name not in raw_categories:
            continue
        raw_policy = raw_categories[name]
        if not isinstance(raw_policy, dict):
            raise ValueError(f"Category policy for {name} must be an object")
        mode = raw_policy.get("mode", config["categories"][name]["mode"])
        if mode not in {"disabled", "all", "threshold"}:
            raise ValueError(f"Invalid category mode for {name}: {mode}")
        threshold = raw_policy.get("threshold", config["categories"][name]["threshold"])
        if isinstance(threshold, bool) or not isinstance(threshold, int) or threshold < 0:
            raise ValueError(f"Threshold for {name} must be a non-negative integer")
        config["categories"][name] = {"mode": mode, "threshold": threshold}

    raw_danbooru = raw_config.get("danbooru", {})
    if not isinstance(raw_danbooru, dict):
        raise ValueError("danbooru must be an object")
    if "login" in raw_danbooru:
        config["danbooru"]["login"] = _validate_string(raw_danbooru["login"], "danbooru.login", 200)
    _apply_secret(config["danbooru"], raw_danbooru, "api_key")
    if "scan_concurrency" in raw_danbooru:
        scan_concurrency = raw_danbooru["scan_concurrency"]
        if isinstance(scan_concurrency, bool) or not isinstance(scan_concurrency, int) or not 1 <= scan_concurrency <= 16:
            raise ValueError("danbooru.scan_concurrency must be between 1 and 16")
        config["danbooru"]["scan_concurrency"] = scan_concurrency

    raw_deepseek = raw_config.get("deepseek", {})
    if not isinstance(raw_deepseek, dict):
        raise ValueError("deepseek must be an object")
    _apply_secret(config["deepseek"], raw_deepseek, "api_key")
    if "model" in raw_deepseek:
        model = _validate_string(raw_deepseek["model"], "deepseek.model", 200).strip()
        if not model:
            raise ValueError("deepseek.model cannot be empty")
        config["deepseek"]["model"] = model
    if "system_prompt" in raw_deepseek:
        prompt = _validate_string(raw_deepseek["system_prompt"], "deepseek.system_prompt", 20_000).strip()
        if not prompt:
            raise ValueError("deepseek.system_prompt cannot be empty")
        config["deepseek"]["system_prompt"] = prompt

    numeric_limits = {
        "concurrency": (1, 300),
        "batch_size": (1, 200),
        "max_retries": (0, 10),
        "timeout_seconds": (10, 600),
    }
    for key, (minimum, maximum) in numeric_limits.items():
        if key not in raw_deepseek:
            continue
        value = raw_deepseek[key]
        if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
            raise ValueError(f"deepseek.{key} must be between {minimum} and {maximum}")
        config["deepseek"][key] = value

    return config


def mask_config(config):
    masked = copy.deepcopy(config)
    for section in ("danbooru", "deepseek"):
        configured = bool(masked[section].get("api_key"))
        masked[section]["api_key"] = SECRET_MASK if configured else ""
        masked[section]["api_key_configured"] = configured
    return masked


class LiveTagsConfig:
    def __init__(self, path):
        self.path = path

    def load(self):
        if not os.path.exists(self.path):
            return copy.deepcopy(DEFAULT_CONFIG)
        try:
            with open(self.path, encoding="utf-8") as config_file:
                return validate_config(json.load(config_file))
        except (OSError, json.JSONDecodeError, ValueError) as error:
            raise RuntimeError(f"Unable to load live tags configuration: {error}") from error

    def save(self, raw_config):
        current = self.load()
        config = validate_config(raw_config, current)
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        file_descriptor, temp_path = tempfile.mkstemp(
            prefix="config-",
            suffix=".json.tmp",
            dir=os.path.dirname(self.path),
        )
        try:
            with os.fdopen(file_descriptor, "w", encoding="utf-8", newline="\n") as config_file:
                json.dump(config, config_file, ensure_ascii=False, indent=2)
                config_file.write("\n")
            os.replace(temp_path, self.path)
            os.chmod(self.path, 0o600)
        except Exception:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            raise
        return config


def _validate_string(value, name, maximum_length):
    if not isinstance(value, str):
        raise ValueError(f"{name} must be a string")
    if len(value) > maximum_length:
        raise ValueError(f"{name} is too long")
    return value


def _apply_secret(target, raw_section, key):
    if key not in raw_section:
        return
    value = _validate_string(raw_section[key], key, 1000)
    if value != SECRET_MASK:
        target[key] = value.strip()
