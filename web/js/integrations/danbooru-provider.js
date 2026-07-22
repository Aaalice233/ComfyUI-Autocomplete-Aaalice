import { TagData, TagSource } from "../data.js";

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const cache = new Map();

function getCached(key) {
    const entry = cache.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
        cache.delete(key);
        return null;
    }
    cache.delete(key);
    cache.set(key, entry);
    return entry.results;
}

function setCached(key, results) {
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, results });
    while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
}

export async function searchDanbooruCandidates(partialTag, options = {}) {
    const { limit = 10, page = 1, fetchImpl = fetch, signal } = options;
    const normalized = String(partialTag || "").trim().toLowerCase().replaceAll(" ", "_");
    if ((normalized.match(/[a-z0-9]/gi) || []).length < 2 || limit <= 0) return [];
    const safeLimit = Math.min(Math.max(Number(limit) || 1, 1), 50);
    const safePage = Math.min(Math.max(Number(page) || 1, 1), 1000);
    const key = `${normalized}\0${safeLimit}\0${safePage}`;
    const cached = getCached(key);
    if (cached) return cached;

    try {
        const params = new URLSearchParams({
            q: normalized,
            limit: String(safeLimit),
            page: String(safePage),
        });
        const response = await fetchImpl(`/autocomplete-plus/danbooru/search?${params}`, {
            cache: "no-store",
            signal,
        });
        if (!response.ok) return [];
        const payload = await response.json();
        const results = (Array.isArray(payload.results) ? payload.results : []).flatMap(item => {
            const postCount = Number(item?.post_count) || 0;
            if (!item?.name || !Number.isInteger(Number(item.category)) || postCount <= 0) return [];
            return [new TagData(
                item.name,
                Number(item.category),
                postCount,
                [],
                TagSource.Danbooru,
                "danbooru_api",
            )];
        });
        setCached(key, results);
        return results;
    } catch (error) {
        return [];
    }
}

export const __test__ = { cache, getCached, setCached };
