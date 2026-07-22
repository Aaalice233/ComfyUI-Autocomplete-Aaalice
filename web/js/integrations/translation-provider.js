import { TagData, TagSource, autoCompleteData } from "../data.js";
import { filterAliasesForLocale, normalizeInterfaceLocale } from "../localization.js";
import { createTranslationSearchDocument } from "../searchengine.js";

const translationCache = new Map();
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

function addTranslationToCandidate(candidate, locale, translation) {
    if (!candidate || !translation) return;
    const localizedAliases = new Set(filterAliasesForLocale(candidate.alias, locale));
    candidate.alias = candidate.alias.filter(alias => !localizedAliases.has(alias));
    candidate.alias.unshift(translation);
    translationCache.set(cacheKey(locale, candidate.tag), translation);

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
    if (applied || item.origin !== "danbooru_api") return;

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
    const normalizedLocale = normalizeInterfaceLocale(locale);
    if (normalizedLocale === "en") return {};
    const { fetchImpl = fetch } = options;
    const eligible = candidates.filter(candidate => Object.values(TagSource).includes(candidate?.source));
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

    try {
        const response = await fetchImpl("/autocomplete-plus/translation/resolve", {
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
        if (!response.ok) return {};
        const payload = await response.json();
        const translations = payload.translations || {};
        for (const candidate of missing) {
            const translation = translations[candidate.tag];
            if (translation) addTranslationToCandidate(candidate, normalizedLocale, translation);
        }
        return translations;
    } catch (error) {
        return {};
    }
}

export const __test__ = {
    addTranslationToCandidate,
    applyCatalogItem,
    cacheKey,
    flushIndexOperations,
    getTranslationIndex,
    indexTranslation,
    loadedLocales,
    pendingIndexOperations,
    translationCache,
};
