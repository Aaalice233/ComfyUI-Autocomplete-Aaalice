import { TagData, TagSource, autoCompleteData } from "../data.js";
import { filterAliasesForLocale, normalizeInterfaceLocale } from "../localization.js";
import { createTranslationSearchDocument } from "../searchengine.js";
import { isDanbooruCompletionEnabled, isTranslationEnabled } from "../online-service-state.js";

const translationCache = new Map();
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
                translationCache.set(cacheKey(locale, item.tag_name), item.text);
                applyCatalogItem(item, locale);
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

export function getCandidateTranslationState(candidate, locale) {
    if (!candidate?.tag) return "idle";
    return translationStates.get(cacheKey(locale, candidate.tag)) || "idle";
}

function setCandidateTranslationState(candidate, locale, state) {
    if (!candidate?.tag) return;
    translationStates.set(cacheKey(locale, candidate.tag), state);
}

function addTranslationToCandidate(candidate, locale, translation) {
    if (!candidate || !translation) return;
    const localizedAliases = new Set(filterAliasesForLocale(candidate.alias, locale));
    candidate.alias = candidate.alias.filter(alias => !localizedAliases.has(alias));
    candidate.alias.unshift(translation);
    translationCache.set(cacheKey(locale, candidate.tag), translation);
    setCandidateTranslationState(candidate, locale, "translated");

    const sourceData = autoCompleteData[candidate.source];
    if (!sourceData) return;
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
    }
    sourceData.aliasMap.set(translation.toLowerCase(), candidate.tag);
    const indexedCandidate = canonical || candidate;
    const index = sourceData.tagIndexMap?.get(indexedCandidate.tag)
        ?? sourceData.sortedTags.indexOf(indexedCandidate);
    indexTranslation(sourceData, indexedCandidate, index, normalizeInterfaceLocale(locale), translation);
}

function applyCatalogItem(item, locale) {
    if (!item?.tag_name || !item?.text) return;
    if (item.origin === "danbooru_api" && Number(item.post_count) <= 0) return;
    let applied = false;
    for (const source of Object.values(TagSource)) {
        const sourceData = autoCompleteData[source];
        const candidate = sourceData?.tagMap.get(item.tag_name);
        if (candidate) {
            addTranslationToCandidate(candidate, locale, item.text);
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
    addTranslationToCandidate(candidate, locale, item.text);
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

export async function resolveCandidateTranslations(candidates, locale, options = {}) {
    if (!isTranslationEnabled()) return {};
    const normalizedLocale = normalizeInterfaceLocale(locale);
    if (normalizedLocale === "en") return {};
    const { fetchImpl = fetch, onStateChange = () => {} } = options;
    const eligible = [];
    const seen = new Set();
    for (const candidate of candidates) {
        if (!Object.values(TagSource).includes(candidate?.source)) continue;
        if (String(candidate.categoryText).toLowerCase() === "artist") continue;
        const key = `${candidate.source}\0${cacheKey(normalizedLocale, candidate.tag)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        eligible.push(candidate);
    }
    if (!eligible.length) return {};

    for (const candidate of eligible) {
        const cached = translationCache.get(cacheKey(normalizedLocale, candidate.tag));
        if (cached) addTranslationToCandidate(candidate, normalizedLocale, cached);
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
                if (translation) addTranslationToCandidate(candidate, normalizedLocale, translation);
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
        candidate => filterAliasesForLocale(candidate.alias, normalizedLocale).length === 0,
    );
    const queue = [...priority, ...backfill].filter(candidate => {
        const state = getCandidateTranslationState(candidate, normalizedLocale);
        return state !== "translated"
            || filterAliasesForLocale(candidate.alias, normalizedLocale).length === 0;
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
    indexTranslation,
    readTranslationPayloads,
    loadedLocales,
    pendingIndexOperations,
    translationCache,
    translationStates,
};
