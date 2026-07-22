import asyncio
import json
import os

import folder_paths
import server
from aiohttp import web

from . import downloader as dl
from .danbooru_service import DanbooruSearchService
from .translation_service import TranslationManager
from .translation_store import TranslationStore


DATA_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "data"))
DANBOORU_PREFIX = "danbooru"
E621_PREFIX = "e621"
TAGS_SUFFIX = "tags"
COOCCURRENCE_SUFFIX = "tags_cooccurrence"
RETIRED_LIVE_TAGS_FILE = "danbooru_tags_live.csv"

USER_DATA_DIR = os.path.join(folder_paths.get_user_directory(), "autocomplete-plus")
TRANSLATION_CONFIG_FILE = os.path.join(USER_DATA_DIR, "config.json")
TRANSLATION_DATABASE_FILE = os.path.join(USER_DATA_DIR, "translations.sqlite3")

translation_store = TranslationStore(TRANSLATION_DATABASE_FILE)
translation_manager = TranslationManager(TRANSLATION_CONFIG_FILE, translation_store)
danbooru_search = DanbooruSearchService()


def get_csv_file_status():
    data = {}
    for prefix in (DANBOORU_PREFIX, E621_PREFIX):
        base_tags_file = f"{prefix}_{TAGS_SUFFIX}.csv"
        base_cooccurrence_file = f"{prefix}_{COOCCURRENCE_SUFFIX}.csv"
        all_csv_files = [
            filename
            for filename in os.listdir(DATA_DIR)
            if filename.startswith(prefix)
            and filename.endswith(".csv")
            and filename != RETIRED_LIVE_TAGS_FILE
        ]
        extra_tags = []
        extra_cooccurrence = []
        for filename in all_csv_files:
            if filename in {base_tags_file, base_cooccurrence_file}:
                continue
            if COOCCURRENCE_SUFFIX in filename.lower():
                extra_cooccurrence.append(filename)
            elif TAGS_SUFFIX in filename.lower():
                extra_tags.append(filename)
        data[prefix] = {
            "base_tags": os.path.exists(os.path.join(DATA_DIR, base_tags_file)),
            "extra_tags": sorted(extra_tags),
            "base_cooccurrence": os.path.exists(os.path.join(DATA_DIR, base_cooccurrence_file)),
            "extra_cooccurrence": sorted(extra_cooccurrence),
        }
    return data


def get_last_check_time_from_metadata():
    try:
        if not os.path.exists(dl.CSV_META_FILE):
            return None
        with open(dl.CSV_META_FILE, encoding="utf-8") as metadata_file:
            datasets = json.load(metadata_file).get("hf_datasets", [])
        return datasets[0].get("last_remote_check_timestamp") if datasets else None
    except (OSError, json.JSONDecodeError):
        return None


@server.PromptServer.instance.routes.get("/autocomplete-plus/csv")
async def get_csv_list(_request):
    response = get_csv_file_status()
    print(
        f"""[Autocomplete-Plus] CSV file status:
  * Danbooru -> base: {response[DANBOORU_PREFIX]["base_tags"]}, extra: [{", ".join(response[DANBOORU_PREFIX]["extra_tags"])}]
  * E621     -> base: {response[E621_PREFIX]["base_tags"]}, extra: [{", ".join(response[E621_PREFIX]["extra_tags"])}]"""
    )
    return web.json_response(response)


@server.PromptServer.instance.routes.get("/autocomplete-plus/csv/{source}/{suffix}/base")
async def get_base_tags_file(request):
    source = str(request.match_info["source"])
    suffix = str(request.match_info["suffix"])
    if source not in {DANBOORU_PREFIX, E621_PREFIX} or suffix not in {TAGS_SUFFIX, COOCCURRENCE_SUFFIX}:
        return web.json_response({"error": "Invalid tag source or suffix"}, status=400)
    file_path = os.path.join(DATA_DIR, f"{source}_{suffix}.csv")
    if not os.path.exists(file_path):
        return web.json_response({"error": "Base tags file not found"}, status=404)
    return web.FileResponse(file_path)


@server.PromptServer.instance.routes.get("/autocomplete-plus/csv/{source}/{suffix}/extra/{index}")
async def get_extra_tags_file(request):
    try:
        source = str(request.match_info["source"])
        suffix = str(request.match_info["suffix"])
        if source not in {DANBOORU_PREFIX, E621_PREFIX} or suffix not in {TAGS_SUFFIX, COOCCURRENCE_SUFFIX}:
            return web.json_response({"error": "Invalid tag source or suffix"}, status=400)
        files = get_csv_file_status()[source][f"extra_{suffix}"]
        index = int(request.match_info["index"])
        if index < 0 or index >= len(files):
            return web.json_response({"error": "Invalid index"}, status=404)
        return web.FileResponse(os.path.join(DATA_DIR, files[index]))
    except ValueError:
        return web.json_response({"error": "Invalid index format"}, status=400)


@server.PromptServer.instance.routes.post("/autocomplete-plus/csv/force-check-updates")
async def force_check_csv_updates(_request):
    try:
        downloader = dl.Downloader()
        downloader.run_check_and_download(force_check=True)
        return web.json_response({"success": True, "last_check_time": get_last_check_time_from_metadata()})
    except Exception as error:
        return web.json_response({"success": False, "error": str(error)}, status=500)


@server.PromptServer.instance.routes.get("/autocomplete-plus/csv/last-check-time")
async def get_last_check_time(_request):
    return web.json_response({"last_check_time": get_last_check_time_from_metadata()})


@server.PromptServer.instance.routes.get("/autocomplete-plus/translation/config")
async def get_translation_config(_request):
    try:
        return web.json_response(translation_manager.get_config())
    except Exception as error:
        return web.json_response({"error": str(error)}, status=500)


@server.PromptServer.instance.routes.put("/autocomplete-plus/translation/config")
async def save_translation_config(request):
    try:
        return web.json_response(translation_manager.save_config(await request.json()))
    except (ValueError, json.JSONDecodeError) as error:
        return web.json_response({"error": str(error)}, status=400)
    except Exception as error:
        return web.json_response({"error": str(error)}, status=500)


@server.PromptServer.instance.routes.get("/autocomplete-plus/translation/status")
async def get_translation_status(_request):
    try:
        csv_status = get_csv_file_status()
        return web.json_response(
            {
                **translation_manager.status(),
                "danbooru": danbooru_search.status(),
                "huggingface": {
                    "available": csv_status[DANBOORU_PREFIX]["base_tags"],
                },
            }
        )
    except Exception as error:
        return web.json_response({"error": str(error)}, status=500)


@server.PromptServer.instance.routes.get("/autocomplete-plus/translation/catalog")
async def get_translation_catalog(request):
    try:
        items = await asyncio.to_thread(translation_manager.catalog, request.query.get("locale"))
        return web.json_response({"items": items})
    except Exception as error:
        return web.json_response({"error": str(error)}, status=500)


@server.PromptServer.instance.routes.post("/autocomplete-plus/translation/models")
async def get_translation_models(request):
    try:
        payload = await request.json()
        return web.json_response({"models": await translation_manager.list_models(payload.get("api_key"))})
    except Exception as error:
        return web.json_response({"error": str(error)}, status=400)


@server.PromptServer.instance.routes.post("/autocomplete-plus/translation/test")
async def test_translation_model(request):
    try:
        payload = await request.json()
        return web.json_response(
            await translation_manager.test_model(
                payload.get("api_key"),
                payload.get("model"),
                payload.get("reasoning_effort", "disabled"),
            )
        )
    except Exception as error:
        return web.json_response({"error": str(error)}, status=400)


@server.PromptServer.instance.routes.post("/autocomplete-plus/translation/resolve")
async def resolve_translations(request):
    try:
        payload = await request.json()
        rows = await translation_manager.resolve(payload.get("locale"), payload.get("tags"))
        return web.json_response(
            {"translations": {tag_name: row["text"] for tag_name, row in rows.items()}}
        )
    except (ValueError, json.JSONDecodeError) as error:
        return web.json_response({"error": str(error)}, status=400)
    except Exception as error:
        # Typing must remain usable even if translation fails unexpectedly.
        return web.json_response({"translations": {}, "error": str(error)}, status=200)


@server.PromptServer.instance.routes.get("/autocomplete-plus/danbooru/search")
async def search_danbooru(request):
    try:
        results = await danbooru_search.search(
            request.query.get("q", ""),
            request.query.get("limit", 10),
            request.query.get("page", 1),
        )
    except (TypeError, ValueError):
        results = []
    return web.json_response({"results": results})


@server.PromptServer.instance.routes.get("/autocomplete-plus/embeddings")
async def get_embeddings(_request):
    embeddings = folder_paths.get_filename_list("embeddings")
    return web.json_response([os.path.splitext(name)[0] for name in embeddings])


@server.PromptServer.instance.routes.get("/autocomplete-plus/loras")
async def get_loras(_request):
    loras = folder_paths.get_filename_list("loras")
    return web.json_response([os.path.splitext(name)[0] for name in loras])
