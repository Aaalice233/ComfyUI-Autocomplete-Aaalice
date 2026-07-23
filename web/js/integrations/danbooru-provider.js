import { TagData, TagSource } from "../data.js";
import { isDanbooruCompletionEnabled } from "../online-service-state.js";

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const cache = new Map();
const relatedCache = new Map();
const emptyPage = (state = "skipped") => ({ candidates: [], hasMore: false, cacheState: state });

function getCached(key, targetCache = cache) {
    const entry = targetCache.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
        targetCache.delete(key);
        return null;
    }
    targetCache.delete(key);
    targetCache.set(key, entry);
    return entry.results;
}

function setCached(key, results, targetCache = cache) {
    targetCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, results });
    while (targetCache.size > MAX_CACHE_ENTRIES) targetCache.delete(targetCache.keys().next().value);
}

export async function searchDanbooruCandidates(partialTag, options = {}) {
    if (!isDanbooruCompletionEnabled()) return emptyPage("disabled");
    const { limit = 10, page = 1, fetchImpl = fetch, signal } = options;
    const normalized = String(partialTag || "").trim().toLowerCase().replaceAll(" ", "_");
    if ((normalized.match(/[a-z0-9]/gi) || []).length < 2 || limit <= 0) return emptyPage();
    const safeLimit = Math.min(Math.max(Number(limit) || 1, 1), 200);
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
        if (!response.ok) return emptyPage("error");
        const payload = await response.json();
        const candidates = (Array.isArray(payload.results) ? payload.results : []).flatMap(item => {
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
        const resultPage = {
            candidates,
            hasMore: payload.page_info?.has_more ?? candidates.length >= safeLimit,
            cacheState: payload.cache?.state || "unknown",
        };
        setCached(key, resultPage);
        return resultPage;
    } catch (error) {
        return emptyPage("error");
    }
}

export async function searchDanbooruRelatedTags(tag, options = {}) {
    if (!isDanbooruCompletionEnabled()) return emptyPage("disabled");
    const { limit = 500, fetchImpl = fetch, signal } = options;
    const normalized = String(tag || "").trim().toLowerCase().replaceAll(" ", "_").replaceAll("*", "");
    if ((normalized.match(/[a-z0-9]/gi) || []).length < 2 || limit <= 0) return emptyPage();
    const safeLimit = Math.min(Math.max(Number(limit) || 1, 1), 500);
    const key = `${normalized}\0${safeLimit}`;
    const cached = getCached(key, relatedCache);
    if (cached) return cached;

    try {
        const params = new URLSearchParams({ q: normalized, limit: String(safeLimit) });
        const response = await fetchImpl(`/autocomplete-plus/danbooru/related?${params}`, {
            cache: "no-store",
            signal,
        });
        if (!response.ok) return emptyPage("error");
        const payload = await response.json();
        const candidates = (Array.isArray(payload.results) ? payload.results : []).flatMap(item => {
            const category = Number(item?.category);
            const postCount = Number(item?.post_count) || 0;
            const similarity = Number(item?.similarity);
            if (
                !item?.name
                || !Number.isInteger(category)
                || postCount <= 0
                || !Number.isFinite(similarity)
                || similarity < 0
                || similarity > 1
            ) {
                return [];
            }
            const candidate = new TagData(
                item.name,
                category,
                postCount,
                [],
                TagSource.Danbooru,
                "danbooru_api",
            );
            candidate.similarity = similarity;
            return [candidate];
        });
        const resultPage = {
            candidates,
            hasMore: false,
            cacheState: payload.cache?.state || "unknown",
        };
        setCached(key, resultPage, relatedCache);
        return resultPage;
    } catch {
        return emptyPage("error");
    }
}

export function clearDanbooruSessionCache() {
    cache.clear();
    relatedCache.clear();
}

export const __test__ = { cache, relatedCache, getCached, setCached };
