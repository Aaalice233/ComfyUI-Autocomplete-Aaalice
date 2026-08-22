import { TagData, TagSource } from "../data.js";
import { normalizeInterfaceLocale } from "../localization.js";

const API_ROOT = "/autocomplete-plus/chinese-dictionary";
const SEARCH_CACHE_TTL_MS = 5 * 60_000;
const SEARCH_CACHE_MAX_ENTRIES = 200;
const SEARCH_DEBOUNCE_MS = 120;
const searchCache = new Map();
let ensurePromise = null;

function isSimplifiedChinese(locale) {
    return normalizeInterfaceLocale(locale) === "zh";
}

function isChineseInterface(locale) {
    return ["zh", "zh-TW"].includes(normalizeInterfaceLocale(locale));
}

function normalizeSearchQuery(query) {
    return String(query || "").normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function isChineseCompletionQuery(query, locale, enabled = true) {
    return enabled
        && isSimplifiedChinese(locale)
        && /[\u3400-\u9fff]/u.test(normalizeSearchQuery(query));
}

function createAbortError() {
    const error = new Error("Chinese completion search aborted");
    error.name = "AbortError";
    return error;
}

function waitForSearchDelay(delay, signal) {
    if (delay <= 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const finish = () => {
            signal?.removeEventListener("abort", abort);
            resolve();
        };
        const timer = setTimeout(finish, delay);
        const abort = () => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", abort);
            reject(createAbortError());
        };
        if (signal?.aborted) {
            abort();
        } else {
            signal?.addEventListener("abort", abort, { once: true });
        }
    });
}

function mapSearchResults(items) {
    return items.map(item => {
        const candidate = new TagData(
            item.name,
            Number(item.category) || 0,
            Number(item.post_count) || 0,
            item.cn_name ? [item.cn_name] : [],
            TagSource.Danbooru,
            "chinese_dictionary",
        );
        candidate.chineseMatchType = item.match_type || "contains";
        candidate.matchedChineseText = item.cn_name || "";
        if (item.cn_name) {
            candidate.resolvedTranslationLocales.add("zh");
            candidate.resolvedTranslations.set("zh", item.cn_name);
            candidate.resolvedTranslationSources.set("zh", item.source || "ffdkj");
        }
        return candidate;
    });
}

function getCachedSearch(cacheKey) {
    const cached = searchCache.get(cacheKey);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
        searchCache.delete(cacheKey);
        return null;
    }
    searchCache.delete(cacheKey);
    searchCache.set(cacheKey, cached);
    return mapSearchResults(cached.items);
}

function cacheSearch(cacheKey, items) {
    searchCache.set(cacheKey, {
        items,
        expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
    });
    while (searchCache.size > SEARCH_CACHE_MAX_ENTRIES) {
        searchCache.delete(searchCache.keys().next().value);
    }
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
    const normalizedLocale = normalizeInterfaceLocale(locale);
    if (!isChineseInterface(normalizedLocale)) return null;
    if (ensurePromise) return ensurePromise;
    const { fetchImpl = fetch } = options;
    ensurePromise = requestJson("/ensure", {
        method: "POST",
        body: JSON.stringify({ locale: normalizedLocale }),
    }, fetchImpl).catch(() => null);
    return ensurePromise;
}

export async function getChineseDictionaryStatus(options = {}) {
    return requestJson(
        "/status",
        { signal: options.signal },
        options.fetchImpl || fetch,
    );
}

export async function searchChineseDictionaryCandidates(query, options = {}) {
    const {
        enabled = true,
        locale,
        limit = 100,
        fetchImpl = fetch,
        signal,
        debounceMs = SEARCH_DEBOUNCE_MS,
    } = options;
    const normalizedQuery = normalizeSearchQuery(query);
    if (!isChineseCompletionQuery(normalizedQuery, locale, enabled)) return [];
    const boundedLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const cacheKey = `${normalizedQuery}\0${boundedLimit}`;
    const cached = getCachedSearch(cacheKey);
    if (cached) return cached;
    try {
        await waitForSearchDelay(debounceMs, signal);
        const payload = await requestJson(
            `/search?q=${encodeURIComponent(normalizedQuery)}&limit=${boundedLimit}`,
            { signal },
            fetchImpl,
        );
        const items = Array.isArray(payload.results) ? payload.results : [];
        cacheSearch(cacheKey, items);
        return mapSearchResults(items);
    } catch (error) {
        if (error?.name !== "AbortError") {
            console.debug("[Autocomplete-Plus] Simplified Chinese dictionary search unavailable:", error.message);
        }
        return [];
    }
}

export function invalidateChineseDictionarySearchCache() {
    searchCache.clear();
}

export const __test__ = {
    isSimplifiedChinese,
    mapSearchResults,
    normalizeSearchQuery,
    searchCache,
    reset() {
        invalidateChineseDictionarySearchCache();
        ensurePromise = null;
    },
};
