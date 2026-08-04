import { TagData, TagSource } from "../data.js";
import {
    isDanbooruCompletionEnabled,
    waitForOnlineServiceFeatures,
} from "../online-service-state.js";

const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_MAX_ATTEMPTS = 2;
const REQUEST_RETRY_DELAY_MS = 250;
const MAX_CACHE_ENTRIES = 100;
const cache = new Map();
const relatedCache = new Map();
const emptyPage = (state = "skipped") => ({ candidates: [], hasMore: false, cacheState: state });

function throwIfAborted(signal) {
    if (signal?.aborted) throw signal.reason || new Error("Danbooru request was aborted");
}

function waitForRetry(signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason || new Error("Danbooru request was aborted"));
            return;
        }
        let timer;
        const onAbort = () => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            reject(signal.reason || new Error("Danbooru request was aborted"));
        };
        timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, REQUEST_RETRY_DELAY_MS);
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

async function requestDanbooruPage(path, params, fetchImpl, signal) {
    let lastError;
    for (let attempt = 0; attempt < REQUEST_MAX_ATTEMPTS; attempt++) {
        try {
            throwIfAborted(signal);
            const requestParams = new URLSearchParams(params);
            if (attempt > 0) requestParams.set("refresh", "1");
            const response = await fetchImpl(`${path}?${requestParams}`, {
                cache: "no-store",
                signal,
            });
            if (!response.ok) throw new Error(`Danbooru request failed with HTTP ${response.status}`);
            const payload = await response.json();
            if (payload?.cache?.state === "disabled") return payload;
            if (payload?.cache?.state === "error") throw new Error("Danbooru request failed");
            if (!payload || !Array.isArray(payload.results)) throw new Error("Danbooru response was invalid");
            return payload;
        } catch (error) {
            if (signal?.aborted) throw error;
            lastError = error;
            if (attempt + 1 < REQUEST_MAX_ATTEMPTS) await waitForRetry(signal);
        }
    }
    throw lastError;
}

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
    const { limit = 10, page = 1, fetchImpl = fetch, signal } = options;
    const normalized = String(partialTag || "").trim().toLowerCase().replaceAll(" ", "_");
    if ((normalized.match(/[a-z0-9]/gi) || []).length < 2 || limit <= 0) return emptyPage();
    await waitForOnlineServiceFeatures();
    if (!isDanbooruCompletionEnabled()) return emptyPage("disabled");
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
        const payload = await requestDanbooruPage(
            "/autocomplete-plus/danbooru/search",
            params,
            fetchImpl,
            signal,
        );
        if (payload?.cache?.state === "disabled") return emptyPage("disabled");
        const candidates = payload.results.flatMap(item => {
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
    const { limit = 500, fetchImpl = fetch, signal } = options;
    const normalized = String(tag || "").trim().toLowerCase().replaceAll(" ", "_").replaceAll("*", "");
    if ((normalized.match(/[a-z0-9]/gi) || []).length < 2 || limit <= 0) return emptyPage();
    await waitForOnlineServiceFeatures();
    if (!isDanbooruCompletionEnabled()) return emptyPage("disabled");
    const safeLimit = Math.min(Math.max(Number(limit) || 1, 1), 500);
    const key = `${normalized}\0${safeLimit}`;
    const cached = getCached(key, relatedCache);
    if (cached) return cached;

    try {
        const params = new URLSearchParams({ q: normalized, limit: String(safeLimit) });
        const payload = await requestDanbooruPage(
            "/autocomplete-plus/danbooru/related",
            params,
            fetchImpl,
            signal,
        );
        if (payload?.cache?.state === "disabled") return emptyPage("disabled");
        const candidates = payload.results.flatMap(item => {
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
