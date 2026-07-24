import { TagData, TagSource } from "../data.js";
import { normalizeInterfaceLocale } from "../localization.js";

const API_ROOT = "/autocomplete-plus/chinese-dictionary";
const SEARCH_CACHE_TTL_MS = 30_000;
const searchCache = new Map();
let ensurePromise = null;

function isSimplifiedChinese(locale) {
    return normalizeInterfaceLocale(locale) === "zh";
}

async function requestJson(path, options = {}, fetchImpl = fetch) {
    const response = await fetchImpl(`${API_ROOT}${path}`, {
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload;
}

export async function ensureChineseDictionary(locale, options = {}) {
    if (!isSimplifiedChinese(locale)) return null;
    if (ensurePromise) return ensurePromise;
    const { fetchImpl = fetch } = options;
    ensurePromise = requestJson("/ensure", {
        method: "POST",
        body: JSON.stringify({ locale: "zh" }),
    }, fetchImpl).catch(() => null);
    return ensurePromise;
}

export async function getChineseDictionaryStatus(options = {}) {
    return requestJson("/status", {}, options.fetchImpl || fetch);
}

export async function searchChineseDictionaryCandidates(query, options = {}) {
    const {
        locale,
        limit = 100,
        fetchImpl = fetch,
        signal,
    } = options;
    if (!isSimplifiedChinese(locale) || !/[\u3400-\u9fff]/u.test(query)) return [];
    const cacheKey = `${query}\0${limit}`;
    const cached = searchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.results;
    try {
        const payload = await requestJson(
            `/search?q=${encodeURIComponent(query)}&limit=${Math.min(Math.max(limit, 1), 200)}`,
            { signal },
            fetchImpl,
        );
        const results = (Array.isArray(payload.results) ? payload.results : []).map(item => new TagData(
            item.name,
            Number(item.category) || 0,
            Number(item.post_count) || 0,
            item.cn_name ? [item.cn_name] : [],
            TagSource.Danbooru,
            "chinese_dictionary",
        ));
        searchCache.set(cacheKey, { results, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
        return results;
    } catch (error) {
        if (error?.name !== "AbortError") {
            console.debug("[Autocomplete-Plus] Simplified Chinese dictionary search unavailable:", error.message);
        }
        return [];
    }
}

export const __test__ = {
    isSimplifiedChinese,
    reset() {
        searchCache.clear();
        ensurePromise = null;
    },
};
