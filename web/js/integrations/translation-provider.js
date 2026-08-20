import { TagData, TagSource, autoCompleteData } from "../data.js";
import { filterAliasesForLocale, normalizeInterfaceLocale } from "../localization.js";
import { createTranslationSearchDocument } from "../searchengine.js";
import { hasTranslatableText } from "../tag-presentation.js";
import { isDanbooruCompletionEnabled, isTranslationEnabled } from "../online-service-state.js";

const translationCache = new Map();
const translationSources = new Map();
const translationStates = new Map();
const loadedLocales = new Set();
const pendingIndexOperations = new Map();
let indexFlushTimer = null;

function scheduleIndexAdd(document, key, index, candidate) {
    if (index < 0 || !document?.add) return;
    pendingIndexOperations.set(key, {
        document,
        index,
        candidate,
    });
    if (indexFlushTimer !== null) return;
    indexFlushTimer = setTimeout(flushIndexOperations, 0);
}

function flushIndexOperations() {
    if (indexFlushTimer !== null) clearTimeout(indexFlushTimer);
    indexFlushTimer = null;
    let processed = 0;
    for (const [key, item] of pendingIndexOperations) {
        pendingIndexOperations.delete(key);
        try {
            item.document.add(item.index, item.candidate);
        } catch {
            // Search enrichment must never interrupt typing or catalog loading.
        }
        processed++;
        if (processed >= 25) break;
    }
    if (pendingIndexOperations.size > 0) {
        indexFlushTimer = setTimeout(flushIndexOperations, 0);
    }
}

function getTranslationIndex(sourceData, locale) {
    sourceData.translationSearchDocuments ??= new Map();
    sourceData.translationIndexTexts ??= new Map();
    if (!sourceData.translationSearchDocuments.has(locale)) {
        sourceData.translationSearchDocuments.set(locale, createTranslationSearchDocument());
    }
    if (!sourceData.translationIndexTexts.has(locale)) {
        sourceData.translationIndexTexts.set(locale, new Map());
    }
    return {
        document: sourceData.translationSearchDocuments.get(locale),
        texts: sourceData.translationIndexTexts.get(locale),
    };
}

function indexTranslation(sourceData, candidate, index, locale, translation) {
    if (index < 0) return;
    const translationIndex = getTranslationIndex(sourceData, locale);
    if (translationIndex.texts.get(index) === translation) return;
    translationIndex.texts.set(index, translation);
    scheduleIndexAdd(
        translationIndex.document,
        `translation\0${candidate.source}\0${locale}\0${index}`,
        index,
        { tag: candidate.tag, alias: [translation] },
    );
}

function processCatalogInChunks(items, locale) {
    return new Promise((resolve) => {
        let index = 0;
        function processChunk() {
            const end = Math.min(index + 200, items.length);
            for (; index < end; index++) {
                const item = items[index];
                if (item?.origin === "danbooru_api" && Number(item.post_count) <= 0) continue;
                const source = item?.origin === "ffdkj" ? "ffdkj" : "ai_cache";
                if (!isUsableTranslation(item?.tag_name, item?.text, locale, source)) continue;
                translationCache.set(cacheKey(locale, item.tag_name), item.text);
                translationSources.set(cacheKey(locale, item.tag_name), source);
                applyCatalogItem(item, locale, source);
            }
            if (index < items.length) {
                setTimeout(processChunk, 0);
            } else {
                resolve();
            }
        }
        processChunk();
    });
}

function cacheKey(locale, tag) {
    return `${normalizeInterfaceLocale(locale)}\0${String(tag).toLowerCase()}`;
}

function isAuthoritativeTranslationSource(source) {
    return source === "ffdkj";
}

function isUsableTranslation(tag, translation, locale, source = "ai_cache") {
    const value = String(translation || "").trim();
    if (!value || value.toLocaleLowerCase() === String(tag || "").trim().toLocaleLowerCase()) {
        return false;
    }
    if (isAuthoritativeTranslationSource(source)) return true;
    const normalizedLocale = normalizeInterfaceLocale(locale);
    if (["zh", "zh-TW"].includes(normalizedLocale)) {
        return /\p{Script=Han}/u.test(value)
            && !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(value);
    }
    if (normalizedLocale === "ja") {
        return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value);
    }
    return true;
}

function hasUsableResolvedTranslation(candidate, locale) {
    const normalizedLocale = normalizeInterfaceLocale(locale);
    if (!candidate?.resolvedTranslationLocales?.has(normalizedLocale)) return false;
    const translation = candidate.resolvedTranslations?.get(normalizedLocale);
    const source = candidate.resolvedTranslationSources?.get(normalizedLocale);
    return isUsableTranslation(candidate.tag, translation, normalizedLocale, source);
}

export function getCandidateTranslationState(candidate, locale) {
    if (!candidate?.tag) return "idle";
    return translationStates.get(cacheKey(locale, candidate.tag)) || "idle";
}

function setCandidateTranslationState(candidate, locale, state) {
    if (!candidate?.tag) return;
    translationStates.set(cacheKey(locale, candidate.tag), state);
    // Remember definitive failures on the candidate so the list can echo the
    // original text instead of leaving the alias column blank.
    if (state === "failed") {
        candidate.translationFailedLocales ??= new Set();
        candidate.translationFailedLocales.add(normalizeInterfaceLocale(locale));
    }
}

function addTranslationToCandidate(candidate, locale, translation, source = "ai_cache") {
    if (!candidate || !isUsableTranslation(candidate.tag, translation, locale, source)) return false;
    const normalizedLocale = normalizeInterfaceLocale(locale);
    const localizedAliases = new Set(filterAliasesForLocale(candidate.alias, locale));
    candidate.alias = candidate.alias.filter(alias => !localizedAliases.has(alias));
    candidate.alias.unshift(translation);
    candidate.resolvedTranslationLocales ??= new Set();
    candidate.resolvedTranslations ??= new Map();
    candidate.resolvedTranslationSources ??= new Map();
    candidate.resolvedTranslationLocales.add(normalizedLocale);
    candidate.resolvedTranslations.set(normalizedLocale, translation);
    candidate.resolvedTranslationSources.set(normalizedLocale, source);
    translationCache.set(cacheKey(normalizedLocale, candidate.tag), translation);
    translationSources.set(cacheKey(normalizedLocale, candidate.tag), source);
    setCandidateTranslationState(candidate, locale, "translated");

    const sourceData = autoCompleteData[candidate.source];
    if (!sourceData) return true;
    for (const alias of localizedAliases) {
        for (const key of [alias, alias.toLowerCase()]) {
            if (sourceData.aliasMap.get(key) === candidate.tag) sourceData.aliasMap.delete(key);
        }
    }
    let canonical = sourceData.tagMap.get(candidate.tag);
    if (!canonical && candidate.origin === "danbooru_api") {
        canonical = candidate;
        sourceData.tagMap.set(candidate.tag, candidate);
        sourceData.sortedTags.push(candidate);
        const onlineIndex = sourceData.sortedTags.length - 1;
        sourceData.tagIndexMap?.set(candidate.tag, onlineIndex);
        scheduleIndexAdd(
            sourceData.flexSearchDocument,
            `source\0${candidate.source}\0${onlineIndex}`,
            onlineIndex,
            candidate,
        );
    }
    if (canonical && canonical !== candidate) {
        const canonicalLocalized = new Set(filterAliasesForLocale(canonical.alias, locale));
        canonical.alias = canonical.alias.filter(alias => !canonicalLocalized.has(alias));
        canonical.alias.unshift(translation);
        canonical.resolvedTranslationLocales ??= new Set();
        canonical.resolvedTranslations ??= new Map();
        canonical.resolvedTranslationSources ??= new Map();
        canonical.resolvedTranslationLocales.add(normalizedLocale);
        canonical.resolvedTranslations.set(normalizedLocale, translation);
        canonical.resolvedTranslationSources.set(normalizedLocale, source);
    }
    sourceData.aliasMap.set(translation.toLowerCase(), candidate.tag);
    const indexedCandidate = canonical || candidate;
    const index = sourceData.tagIndexMap?.get(indexedCandidate.tag)
        ?? sourceData.sortedTags.indexOf(indexedCandidate);
    indexTranslation(sourceData, indexedCandidate, index, normalizeInterfaceLocale(locale), translation);
    return true;
}

function applyCatalogItem(item, locale, source = item?.origin === "ffdkj" ? "ffdkj" : "ai_cache") {
    if (!item?.tag_name || !isUsableTranslation(item.tag_name, item.text, locale, source)) return;
    if (item.origin === "danbooru_api" && Number(item.post_count) <= 0) return;
    let applied = false;
    for (const tagSource of Object.values(TagSource)) {
        const sourceData = autoCompleteData[tagSource];
        const candidate = sourceData?.tagMap.get(item.tag_name);
        if (candidate) {
            addTranslationToCandidate(candidate, locale, item.text, source);
            applied = true;
        }
    }
    if (applied || item.origin !== "danbooru_api" || !isDanbooruCompletionEnabled()) return;

    const sourceData = autoCompleteData[TagSource.Danbooru];
    if (!sourceData) return;
    const candidate = new TagData(
        item.tag_name,
        Number(item.category) || 0,
        Number(item.post_count) || 0,
        [],
        TagSource.Danbooru,
        "danbooru_api",
    );
    sourceData.tagMap.set(item.tag_name, candidate);
    sourceData.sortedTags.push(candidate);
    const index = sourceData.sortedTags.length - 1;
    sourceData.tagIndexMap?.set(item.tag_name, index);
    scheduleIndexAdd(
        sourceData.flexSearchDocument,
        `source\0${candidate.source}\0${index}`,
        index,
        candidate,
    );
    addTranslationToCandidate(candidate, locale, item.text, source);
}

export async function loadTranslationCatalog(locale, options = {}) {
    if (!isTranslationEnabled()) return;
    const normalizedLocale = normalizeInterfaceLocale(locale);
    if (normalizedLocale === "en" || loadedLocales.has(normalizedLocale)) return;
    const { fetchImpl = fetch } = options;
    try {
        const response = await fetchImpl(
            `/autocomplete-plus/translation/catalog?locale=${encodeURIComponent(normalizedLocale)}`,
            { cache: "no-store" },
        );
        if (!response.ok) return;
        const payload = await response.json();
        await processCatalogInChunks(Array.isArray(payload.items) ? payload.items : [], normalizedLocale);
        loadedLocales.add(normalizedLocale);
    } catch (error) {
        // Translation enrichment is deliberately silent while typing.
    }
}

export async function getTranslationServiceStatus(options = {}) {
    const { fetchImpl = fetch, signal } = options;
    const response = await fetchImpl('/autocomplete-plus/translation/status', {
        cache: 'no-store',
        signal,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload;
}

export function invalidateTranslationCatalog(locale) {
    const normalizedLocale = normalizeInterfaceLocale(locale);
    const prefix = `${normalizedLocale}\0`;
    for (const key of translationCache.keys()) {
        if (key.startsWith(prefix)) translationCache.delete(key);
    }
    for (const key of translationSources.keys()) {
        if (key.startsWith(prefix)) translationSources.delete(key);
    }
    for (const key of translationStates.keys()) {
        if (key.startsWith(prefix)) translationStates.delete(key);
    }
    loadedLocales.delete(normalizedLocale);
}

export async function resolveCandidateTranslations(candidates, locale, options = {}) {
    if (!isTranslationEnabled()) return {};
    const normalizedLocale = normalizeInterfaceLocale(locale);
    if (normalizedLocale === "en") return {};
    const { fetchImpl = fetch, onStateChange = () => {} } = options;
    const eligible = [];
    const seen = new Set();
    for (const candidate of candidates) {
        if (!Object.values(TagSource).includes(candidate?.source)) continue;
        if (
            String(candidate.categoryText).toLowerCase() === "artist"
        ) continue;
        // Tags without letters (aspect ratios, kaomoji) have nothing to
        // translate; requesting them only leaves the indicator spinning.
        if (!hasTranslatableText(candidate.tag)) continue;
        const key = `${candidate.source}\0${cacheKey(normalizedLocale, candidate.tag)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        eligible.push(candidate);
    }
    if (!eligible.length) return {};

    for (const candidate of eligible) {
        const key = cacheKey(normalizedLocale, candidate.tag);
        const cached = translationCache.get(key);
        if (cached) {
            addTranslationToCandidate(
                candidate,
                normalizedLocale,
                cached,
                translationSources.get(key) || "ai_cache",
            );
        }
    }
    const missing = eligible.filter(candidate => !translationCache.has(cacheKey(normalizedLocale, candidate.tag)));
    if (!missing.length) return Object.fromEntries(eligible.map(candidate => [
        candidate.tag,
        translationCache.get(cacheKey(normalizedLocale, candidate.tag)),
    ]));
    for (const candidate of missing) {
        setCandidateTranslationState(candidate, normalizedLocale, "pending");
    }

    try {
        const response = await fetchImpl("/autocomplete-plus/translation/resolve-stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                locale: normalizedLocale,
                tags: missing.map(candidate => ({
                    name: candidate.tag,
                    category: candidate.category,
                    post_count: candidate.count,
                    origin: candidate.origin,
                    source: candidate.source,
                })),
            }),
        });
        if (!response.ok) {
            for (const candidate of missing) {
                setCandidateTranslationState(candidate, normalizedLocale, "failed");
            }
            onStateChange();
            return {};
        }
        const translations = {};
        await readTranslationPayloads(response, payload => {
            if (payload.error) throw new Error(payload.error);
            Object.assign(translations, payload.translations || {});
            const completed = new Set(payload.completed || []);
            for (const candidate of missing) {
                const translation = payload.translations?.[candidate.tag];
                if (translation) {
                    addTranslationToCandidate(
                        candidate,
                        normalizedLocale,
                        translation,
                        payload.sources?.[candidate.tag] || "ai_cache",
                    );
                }
                if (completed.has(candidate.tag)) {
                    setCandidateTranslationState(
                        candidate,
                        normalizedLocale,
                        translationCache.has(cacheKey(normalizedLocale, candidate.tag))
                            ? "translated"
                            : "failed",
                    );
                }
            }
            onStateChange();
        });
        for (const candidate of missing) {
            setCandidateTranslationState(
                candidate,
                normalizedLocale,
                translationCache.has(cacheKey(normalizedLocale, candidate.tag)) ? "translated" : "failed",
            );
        }
        onStateChange();
        return translations;
    } catch (error) {
        for (const candidate of missing) {
            setCandidateTranslationState(
                candidate,
                normalizedLocale,
                translationCache.has(cacheKey(normalizedLocale, candidate.tag)) ? "translated" : "failed",
            );
        }
        onStateChange();
        return {};
    }
}

async function readTranslationPayloads(response, onPayload) {
    if (!response.body?.getReader) {
        onPayload(await response.json());
        return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const consumeLines = flush => {
        const lines = buffer.split("\n");
        if (!flush) buffer = lines.pop();
        for (const line of lines) {
            if (line.trim()) onPayload(JSON.parse(line));
        }
        if (flush) buffer = "";
    };
    try {
        while (true) {
            const { value, done } = await reader.read();
            buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
            consumeLines(done);
            if (done) break;
        }
    } finally {
        reader.releaseLock?.();
    }
}

export async function resolveCandidateTranslationsProgressively(candidates, locale, options = {}) {
    const {
        priorityLimit = 200,
        onStateChange = () => {},
        shouldContinue = () => true,
        fetchImpl = fetch,
    } = options;
    const normalizedLocale = normalizeInterfaceLocale(locale);
    if (!isTranslationEnabled() || normalizedLocale === "en") return;

    const unique = [];
    const seen = new Set();
    for (const candidate of candidates) {
        if (!Object.values(TagSource).includes(candidate?.source)) continue;
        if (String(candidate.categoryText).toLowerCase() === "artist") continue;
        const key = `${candidate.source}\0${cacheKey(normalizedLocale, candidate.tag)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(candidate);
    }

    const priority = unique.slice(0, priorityLimit);
    const backfill = unique.slice(priorityLimit).filter(
        candidate => !hasUsableResolvedTranslation(candidate, normalizedLocale),
    );
    const queue = [...priority, ...backfill].filter(candidate => {
        const state = getCandidateTranslationState(candidate, normalizedLocale);
        return state !== "translated"
            || !hasUsableResolvedTranslation(candidate, normalizedLocale);
    });

    if (!queue.length || !shouldContinue()) return;
    const pending = resolveCandidateTranslations(queue, normalizedLocale, {
        fetchImpl,
        onStateChange: () => {
            if (shouldContinue()) onStateChange();
        },
    });
    onStateChange();
    await pending;
    if (shouldContinue()) onStateChange();
}

export const __test__ = {
    addTranslationToCandidate,
    applyCatalogItem,
    cacheKey,
    flushIndexOperations,
    getTranslationIndex,
    hasUsableResolvedTranslation,
    indexTranslation,
    isUsableTranslation,
    readTranslationPayloads,
    loadedLocales,
    pendingIndexOperations,
    translationCache,
    translationSources,
    translationStates,
};
