import { settingValues, updateMaxTagLength } from "./settings.js";
import { createFlexSearchDocument, createFlexSearchDocumentForModel } from "./searchengine.js";

// --- Constants ---

// Tag sources for booru-like tag data.
export const TagSource = {
    Danbooru: 'danbooru',
    E621: 'e621',
}

// Tag sources for model based tag data.
export const ModelTagSource = {
    Embeddings: 'embeddings',
    Lora: 'lora',
    Wildcard: 'wildcard'
}

export const TagCategory = {
    'danbooru': [
        'general',
        'artist',
        'unused',
        'copyright',
        'character',
        'meta',
    ],
    'e621': [
        'general',
        'artist',
        'unused',
        'copyright',
        'character',
        'species',
        'invalid',
        'meta',
        'lore',
    ],
    'embeddings': [
        'embeddings'
    ],
    'lora': [
        'lora'
    ],
    'wildcard': [
        'wildcard'
    ]
}

// --- Data Structures ---

/**
 * Class representing a tag and its metadata
 */
export class TagData {
    /**
     * Create a tag data object
     * @param {string} tag - The tag name
     * @param {number} [category] - Category index of the tag
     * @param {number} [count=0] - Frequency count/popularity of the tag
     * @param {string[]} [alias=[]] - Array of aliases for the tag
     * @param {string} [source=TagSource.Danbooru] - The source of the tag data
     */
    constructor(tag, category, count = 0, alias = [], source = TagSource.Danbooru, origin = 'local') {
        /** @type {string} */
        this.tag = tag;

        /** @type {string[]} */
        this.alias = alias;

        /** @type {string[]} */
        this.asciiAlias = alias.filter(value => /^[\x00-\x7f]*$/u.test(value));

        /** @type {number} */
        this.category = category;

        /** @type {number} */
        this.count = count;

        this.source = source;

        /** @type {'local'|'csv'|'lora_manager'|'danbooru_api'|'chinese_dictionary'} */
        this.origin = origin;

        /** @type {string[]} */
        this.origins = origin ? [origin] : [];

        /** @type {Set<string>} */
        this.resolvedTranslationLocales = new Set();

        /** @type {Map<string, string>} */
        this.resolvedTranslations = new Map();

        /** @type {Map<string, string>} */
        this.resolvedTranslationSources = new Map();

        /** @type {'exact'|'prefix'|'contains'|null} */
        this.chineseMatchType = null;

        /** @type {string} */
        this.matchedChineseText = '';
    }

    /**
     * Get the category text
     * @returns {string}
     */
    get categoryText() {
        return TagCategory[this.source][this.category] || "unknown";
    }

    /**
     * Check if the tag has a wiki page
     * @returns {boolean}
     */
    get hasWikiPage() {
        return Object.values(TagSource).includes(this.source)
            && ['general', 'artist', 'copyright', 'character', 'species', 'lore'].includes(this.categoryText);
    }
}

class AutocompleteData {
    constructor() {
        /** @type {Document} */
        this.flexSearchDocument = null;

        /** @type {TagData[]} */
        this.sortedTags = [];

        /** @type {Map<string, TagData>} */
        this.tagMap = new Map();

        /** @type {Map<string, TagData>} */
        this.aliasMap = new Map();

        /** @type {Map<string, number>} */
        this.tagIndexMap = new Map();

        /** @type {Map<string, Document>} */
        this.translationSearchDocuments = new Map();

        /** @type {Map<string, Map<number, string>>} */
        this.translationIndexTexts = new Map();

        /** @type {Map<string, Map<string, number>>} */
        this.cooccurrenceMap = new Map();

        this.isInitializing = false;
        this.tagsInitialized = false;
        this.cooccurrenceInitialized = false;
        this.initialized = false;
        this.error = null;
        this.tagsLoadingPromise = null;
        this.loadingPromise = null;

        // Progress of "base" csv loading
        this.baseLoadingProgress = {
            cooccurrence: 0
        };
    }
}

/**
 * @type {Object<string, AutocompleteData>}
 */
export const autoCompleteData = {};

export const DATA_TAGS_READY_EVENT = 'autocomplete-plus:data-tags-ready';
export const DATA_TAGS_COMPLETE_EVENT = 'autocomplete-plus:data-tags-complete';
export const DATA_READY_EVENT = 'autocomplete-plus:data-ready';
export const DATA_STATUS_CHANGED_EVENT = 'autocomplete-plus:data-status-changed';

let dataLoadPromise = null;
let dataLoadState = 'idle';
let dataLoadError = null;

function dispatchDataEvent(eventName) {
    if (typeof globalThis.window?.dispatchEvent !== 'function' || typeof Event !== 'function') return;
    globalThis.window.dispatchEvent(new Event(eventName));
}

export function ensureDataSources() {
    for (const source of [...Object.values(TagSource), ...Object.values(ModelTagSource)]) {
        if (!autoCompleteData[source]) {
            autoCompleteData[source] = new AutocompleteData();
        }
    }

    autoCompleteData[ModelTagSource.Wildcard].tagsInitialized = true;
    autoCompleteData[ModelTagSource.Wildcard].cooccurrenceInitialized = true;
    autoCompleteData[ModelTagSource.Wildcard].initialized = true;
    return autoCompleteData;
}

export function getDataSourceStatus(source) {
    const data = autoCompleteData[source];
    if (!data) return { state: 'waiting', progress: 0 };
    const isTagSource = Object.values(TagSource).includes(source);
    const isReady = isTagSource
        ? (data.initialized || (data.tagsInitialized && data.cooccurrenceInitialized))
        : data.initialized;
    if (isReady) return { state: 'ready', progress: 100 };
    if (data.error) {
        return {
            state: 'error',
            progress: data.baseLoadingProgress?.cooccurrence ?? 0,
            error: data.error?.message || String(data.error),
        };
    }
    if (data.isInitializing) {
        return {
            state: 'loading',
            progress: data.baseLoadingProgress?.cooccurrence ?? 0,
        };
    }
    return { state: 'waiting', progress: 0 };
}

export function getDataLoadStatus() {
    return {
        state: dataLoadState,
        error: dataLoadError?.message || (dataLoadError ? String(dataLoadError) : null),
    };
}

// CSV Header for tags
const TAGS_CSV_HEADER = 'tag,category,count,alias';
const TAGS_CSV_HEADER_COLUMNS = TAGS_CSV_HEADER.split(',');
const TAG_INDEX = TAGS_CSV_HEADER_COLUMNS.indexOf('tag');
const CATEGORY_INDEX = TAGS_CSV_HEADER_COLUMNS.indexOf('category');
const COUNT_INDEX = TAGS_CSV_HEADER_COLUMNS.indexOf('count');
const ALIAS_INDEX = TAGS_CSV_HEADER_COLUMNS.indexOf('alias');
const TAG_PARSE_CHUNK_SIZE = 2000;
const COOCCURRENCE_PARSE_CHUNK_SIZE = 3000;
const CHUNK_TIME_BUDGET_MS = 8;
const MAX_COOCCURRENCES_PER_TAG = 2000;

function scheduleChunk(callback) {
    if (typeof globalThis.requestIdleCallback === 'function') {
        globalThis.requestIdleCallback(callback, { timeout: 100 });
    } else {
        setTimeout(callback, 0);
    }
}

function shouldYieldChunk(startTime, processedCount) {
    return processedCount >= 100
        && processedCount % 100 === 0
        && performance.now() - startTime >= CHUNK_TIME_BUDGET_MS;
}

// --- Helder Functions ---


/**
 * Get the available tag sources in priority order based on the current settings.
 * @returns {string[]} Array of available tag sources in priority order
 */
export function getEnabledTagSourceInPriorityOrder() {
    let enabledTagSources = Object.values(TagSource)
        .filter((s) => {
            return settingValues.tagSource === s || settingValues.tagSource === 'all';
        })
        .toSorted((a, b) => {
            return a === settingValues.primaryTagSource ? -1 : 1;
        });

    // Append Loras and Embeddings if enabled
    if (settingValues.enableModels) {
        enabledTagSources = [...enabledTagSources, ...Object.values(ModelTagSource)];
    }

    return enabledTagSources;
}

// --- Data Loading Functions ---

/**
 * Loads tag data from a single CSV file.
 * @param {string} csvUrl - The URL of the CSV file to load.
 * @param {string} siteName - The site name (e.g., 'danbooru', 'e621').
 * @returns {Promise<void>}
 */
async function loadTags(csvUrl, siteName) {
    const response = await fetch(csvUrl, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const csvText = await response.text();
    const lines = csvText.split('\n');

    const startIndex = lines[0].toLowerCase().startsWith(TAGS_CSV_HEADER) ? 1 : 0;

    await processTagLinesInChunks(lines, startIndex, csvUrl, siteName);
}

function processTagLinesInChunks(lines, startIndex, csvUrl, siteName) {
    return new Promise((resolve) => {
        let i = startIndex;

        function processChunk() {
            const endIndex = Math.min(i + TAG_PARSE_CHUNK_SIZE, lines.length);
            const chunkStart = i;
            const chunkStartTime = performance.now();
            for (; i < endIndex; i++) {
                if (shouldYieldChunk(chunkStartTime, i - chunkStart)) break;
                const line = lines[i];
                if (!line.trim()) continue;
                const columns = parseCSVLine(line);
                if (columns.length !== TAGS_CSV_HEADER_COLUMNS.length) {
                    console.warn(`[Autocomplete-Plus] Invalid CSV format in line ${i + 1} of ${csvUrl}: ${line}. Expected ${TAGS_CSV_HEADER_COLUMNS.length} columns, but got ${columns.length}.`);
                    continue;
                }

                const tag = columns[TAG_INDEX].trim();
                const aliasStr = columns[ALIAS_INDEX].trim();
                const category = columns[CATEGORY_INDEX].trim();
                const count = parseInt(columns[COUNT_INDEX].trim(), 10);
                if (!tag || isNaN(count) || autoCompleteData[siteName].tagMap.has(tag)) continue;

                const aliases = aliasStr ? aliasStr.split(',').map(a => a.trim()).filter(Boolean) : [];
                const tagData = new TagData(tag, category, count, aliases, siteName, 'csv');
                updateMaxTagLength(tag.length);
                autoCompleteData[siteName].sortedTags.push(tagData);
                autoCompleteData[siteName].tagMap.set(tagData.tag, tagData);
                for (const alias of tagData.alias) {
                    if (!autoCompleteData[siteName].aliasMap.has(alias)) {
                        autoCompleteData[siteName].aliasMap.set(alias, tagData.tag);
                    }
                }
            }

            if (i < lines.length) {
                scheduleChunk(processChunk);
            } else {
                resolve();
            }
        }

        scheduleChunk(processChunk);
    });
}

/**
 * Build FlexSearch index for the given site name.
 * @param {string} siteName 
 */
async function buildFlexSearchIndex(siteName) {
    try {
        if (autoCompleteData[siteName].sortedTags.length === 0) {
            return;
        }

        let document = null;
        if (Object.values(TagSource).includes(siteName)) {
            document = createFlexSearchDocument();
        } else if (Object.values(ModelTagSource).includes(siteName)) {
            document = createFlexSearchDocumentForModel();
        } else {
            throw new Error(`[Autocomplete-Plus] Invalid site name: ${siteName}`);
        }

        let startIdx = 0;
        const startTime = performance.now();
        await new Promise((resolve) => {
            function processChunkTasks() {
                const chunkSize = 1000;
                const end = Math.min(startIdx + chunkSize, autoCompleteData[siteName].sortedTags.length);
                const chunkStart = startIdx;
                const chunkStartTime = performance.now();
                for (; startIdx < end; startIdx++) {
                    if (shouldYieldChunk(chunkStartTime, startIdx - chunkStart)) break;
                    const tagData = autoCompleteData[siteName].sortedTags[startIdx];
                    autoCompleteData[siteName].tagIndexMap.set(tagData.tag, startIdx);
                    document.add(startIdx, tagData);
                }

                if (startIdx < autoCompleteData[siteName].sortedTags.length) {
                    scheduleChunk(processChunkTasks);
                } else {
                    autoCompleteData[siteName].flexSearchDocument = document;
                    const endTime = performance.now();
                    const duration = endTime - startTime;
                    console.info(`[Autocomplete-Plus] Building ${autoCompleteData[siteName].sortedTags.length} index for ${siteName} took ${duration.toFixed(2)}ms.`);
                    resolve();
                }
            }
            scheduleChunk(processChunkTasks);
        });
    } catch (error) {
        console.error(`[Autocomplete-Plus] Failed to building flexSearch index`, error);
        throw error;
    }
}

/**
 * Loads co-occurrence data from a single CSV file.
 * @param {string} csvUrl - The URL of the CSV file to load.
 * @param {string} siteName - The site name (e.g., 'danbooru', 'e621').
 * @returns {Promise<void>}
 */
async function loadCooccurrence(csvUrl, siteName) {
    const response = await fetch(csvUrl, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const csvText = await response.text();
    const lines = csvText.split('\n');

    const startIndex = lines[0].startsWith('tag_a,tag_b,count') ? 1 : 0;

    await processInChunks(lines, startIndex, autoCompleteData[siteName].cooccurrenceMap, csvUrl, siteName);
}

/**
 * Process CSV data in chunks to avoid blocking the UI.
 * Modifies the targetMap directly.
 */
function processInChunks(lines, startIndex, targetMap, csvUrl, siteName) {
    return new Promise((resolve) => {
        let i = startIndex;

        function processChunk() {
            const endIndex = Math.min(i + COOCCURRENCE_PARSE_CHUNK_SIZE, lines.length);
            const chunkStart = i;
            const chunkStartTime = performance.now();

            for (; i < endIndex; i++) {
                if (shouldYieldChunk(chunkStartTime, i - chunkStart)) break;
                const line = lines[i];
                if (!line.trim()) continue;
                const columns = parseCSVLine(line);

                if (columns.length >= 3) {
                    const tagA = columns[0].trim();
                    const tagB = columns[1].trim();
                    const count = parseInt(columns[2].trim(), 10);

                    if (!tagA || !tagB || isNaN(count)) continue;

                    addCooccurrence(targetMap, tagA, tagB, count);
                    addCooccurrence(targetMap, tagB, tagA, count);

                }
            }

            if (i < lines.length) {
                autoCompleteData[siteName].baseLoadingProgress.cooccurrence = Math.round((i / lines.length) * 100);
                scheduleChunk(processChunk);
            } else {
                autoCompleteData[siteName].baseLoadingProgress.cooccurrence = 100;
                resolve();
            }
        }

        scheduleChunk(processChunk);
    });
}

function addCooccurrence(targetMap, tag, relatedTag, count) {
    let related = targetMap.get(tag);
    if (!related) {
        related = new Map();
        targetMap.set(tag, related);
    }
    if (related.has(relatedTag) || related.size < MAX_COOCCURRENCES_PER_TAG) {
        related.set(relatedTag, count);
    }
}

/**
 * Parse a CSV line properly, handling quoted values that may contain commas.
 * @param {string} line A single CSV line
 * @returns {string[]} Array of column values
 */
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    result.push(current);

    return result;
}

/**
 * Fetch the list of CSV files from the API endpoint
 * @returns {Promise<Object>}
 */
async function fetchCsvList() {
    const response = await fetch('/autocomplete-plus/csv');
    if (!response.ok) {
        throw new Error(`[Autocomplete-Plus] Failed to fetch CSV list: ${response.status} ${response.statusText}`);
    }
    const csvList = await response.json();
    if (!csvList || typeof csvList !== 'object') {
        throw new Error('[Autocomplete-Plus] CSV list response was invalid.');
    }
    return csvList;
}

/**
 * Initializes the autocomplete data by fetching the list of CSV files and loading them.
 */
function initializeDataFromCSV(csvListData, source) {
    ensureDataSources();
    const data = autoCompleteData[source];
    if (data.initialized) return data.loadingPromise ?? Promise.resolve();
    if (data.loadingPromise) return data.loadingPromise;

    const startTime = performance.now();
    data.isInitializing = true;
    data.error = null;
    data.baseLoadingProgress.cooccurrence = 0;

    const loadingPromise = (async () => {
        const sourceData = csvListData?.[source];
        if (!sourceData) {
            console.warn(`[Autocomplete-Plus] CSV list data not found for source: ${source}. Treating it as empty.`);
            data.tagsLoadingPromise = Promise.resolve();
            data.tagsInitialized = true;
            data.cooccurrenceInitialized = true;
            data.initialized = true;
            dispatchDataEvent(DATA_STATUS_CHANGED_EVENT);
            dispatchDataEvent(DATA_TAGS_READY_EVENT);
            return;
        }

        const extraTagsFileList = sourceData.extra_tags || [];
        const extraCooccurrenceFileList = sourceData.extra_cooccurrence || [];
        const tagsUrl = `/autocomplete-plus/csv/${source}/tags`;
        const cooccurrenceUrl = `/autocomplete-plus/csv/${source}/tags_cooccurrence`;

        const loadTagsData = async () => {
            for (let i = 0; i < extraTagsFileList.length; i++) {
                await loadTags(`${tagsUrl}/extra/${i}`, source);
            }
            if (sourceData.base_tags) {
                await loadTags(`${tagsUrl}/base`, source);
            }
        };

        const loadCooccurrenceData = async () => {
            for (let i = 0; i < extraCooccurrenceFileList.length; i++) {
                await loadCooccurrence(`${cooccurrenceUrl}/extra/${i}`, source);
            }
            if (sourceData.base_cooccurrence) {
                await loadCooccurrence(`${cooccurrenceUrl}/base`, source);
            }
        };

        // Co-occurrence data is much larger; autocomplete and translations must not wait for it.
        const tagsLoadingPromise = loadTagsData()
            .then(() => {
                data.sortedTags.sort((a, b) => b.count - a.count);
                return buildFlexSearchIndex(source);
            })
            .then(() => {
                data.tagsInitialized = true;
                dispatchDataEvent(DATA_STATUS_CHANGED_EVENT);
                dispatchDataEvent(DATA_TAGS_READY_EVENT);
                const endTime = performance.now();
                if (sourceData.base_tags) {
                    console.log(`[Autocomplete-Plus] "${source}" Tags loading complete in ${(endTime - startTime).toFixed(2)}ms`);
                }
            });
        data.tagsLoadingPromise = tagsLoadingPromise;

        const cooccurrenceLoadingPromise = loadCooccurrenceData().then(() => {
            data.cooccurrenceInitialized = true;
            dispatchDataEvent(DATA_STATUS_CHANGED_EVENT);
            const endTime = performance.now();
            if (sourceData.base_cooccurrence) {
                console.log(`[Autocomplete-Plus] "${source}" Co-occurrence loading complete in ${(endTime - startTime).toFixed(2)}ms.`);
            }
        });

        await Promise.all([tagsLoadingPromise, cooccurrenceLoadingPromise]);
        data.initialized = data.tagsInitialized && data.cooccurrenceInitialized;
    })()
        .catch(error => {
            data.error = error;
            console.error(`[Autocomplete-Plus] Error initializing ${source} data:`, error);
            throw error;
        })
        .finally(() => {
            data.isInitializing = false;
            if (data.loadingPromise === loadingPromise) data.loadingPromise = null;
            dispatchDataEvent(DATA_STATUS_CHANGED_EVENT);
        });

    data.loadingPromise = loadingPromise;
    return loadingPromise;
}

/**
 * Load Embeddings data from the API endpoint
 * @returns {Promise<void>}
 */
function loadEmbeddings() {
    ensureDataSources();
    const source = ModelTagSource.Embeddings;
    const data = autoCompleteData[source];
    if (data.initialized) return;
    if (data.loadingPromise) return data.loadingPromise;

    data.isInitializing = true;
    data.error = null;
    const loadingPromise = (async () => {
        const response = await fetch('/autocomplete-plus/embeddings', { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const embeddings = await response.json();

        embeddings.forEach(embedding => {
            if (!data.tagMap.has(embedding)) {
                const tagData = new TagData(`embedding:${embedding}`, 0, 0, [], source);
                data.sortedTags.push(tagData);
                data.tagMap.set(embedding, tagData);
                updateMaxTagLength(embedding.length);
            }
        });

        await buildFlexSearchIndex(source);
        data.tagsInitialized = true;
        data.cooccurrenceInitialized = true;
        data.initialized = true;
        dispatchDataEvent(DATA_TAGS_READY_EVENT);
        console.log(`[Autocomplete-Plus] Loaded ${embeddings.length} Embeddings`);
    })()
        .catch(error => {
            data.error = error;
            console.error(`[Autocomplete-Plus] Failed to fetch Embeddings data:`, error);
        })
        .finally(() => {
            data.isInitializing = false;
            if (data.loadingPromise === loadingPromise) data.loadingPromise = null;
            dispatchDataEvent(DATA_STATUS_CHANGED_EVENT);
        });

    data.loadingPromise = loadingPromise;
    return loadingPromise;
}

/**
 * Load LoRA data from the API endpoint
 * @returns {Promise<void>}
 */
function loadLoras() {
    ensureDataSources();
    const source = ModelTagSource.Lora;
    const data = autoCompleteData[source];
    if (data.initialized) return;
    if (data.loadingPromise) return data.loadingPromise;

    data.isInitializing = true;
    data.error = null;
    const loadingPromise = (async () => {
        const response = await fetch('/autocomplete-plus/loras', { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const loraNames = await response.json();

        loraNames.forEach(loraName => {
            if (!data.tagMap.has(loraName)) {
                const tagData = new TagData(`<lora:${loraName}>`, 0, 0, [], source);
                data.sortedTags.push(tagData);
                data.tagMap.set(loraName, tagData);
                updateMaxTagLength(loraName.length);
            }
        });

        await buildFlexSearchIndex(source);
        data.tagsInitialized = true;
        data.cooccurrenceInitialized = true;
        data.initialized = true;
        dispatchDataEvent(DATA_TAGS_READY_EVENT);
        console.log(`[Autocomplete-Plus] Loaded ${loraNames.length} LoRA models`);
    })()
        .catch(error => {
            data.error = error;
            console.error(`[Autocomplete-Plus] Failed to fetch LoRA data:`, error);
        })
        .finally(() => {
            data.isInitializing = false;
            if (data.loadingPromise === loadingPromise) data.loadingPromise = null;
            dispatchDataEvent(DATA_STATUS_CHANGED_EVENT);
        });

    data.loadingPromise = loadingPromise;
    return loadingPromise;
}

function resetDataSources() {
    for (const source of [...Object.values(TagSource), ...Object.values(ModelTagSource)]) {
        if (source !== ModelTagSource.Wildcard) {
            autoCompleteData[source] = new AutocompleteData();
        }
    }
    ensureDataSources();
}

function throwFirstRejected(results) {
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
}

/**
 * Load all data sources asynchronously.
 *
 * The returned promise represents background preparation only. Callers that
 * initialize the host application must not await it during startup.
 * @returns {Promise<void>}
 */
export function loadDataAsync({ retry = false } = {}) {
    ensureDataSources();
    if (dataLoadPromise) return dataLoadPromise;
    if (dataLoadState === 'ready') return Promise.resolve();
    if (dataLoadState === 'error') {
        if (!retry) return Promise.reject(dataLoadError);
        resetDataSources();
    }

    dataLoadState = 'loading';
    dataLoadError = null;
    for (const source of Object.values(TagSource)) {
        const data = autoCompleteData[source];
        if (!data.initialized) {
            data.isInitializing = true;
            data.error = null;
        }
    }
    dispatchDataEvent(DATA_STATUS_CHANGED_EVENT);

    const tagLoadingPromise = fetchCsvList().then(csvList => {
        const sourceLoadingPromises = Object.values(TagSource).map(source =>
            initializeDataFromCSV(csvList, source),
        );
        const tagsReadyPromise = Promise.all(
            Object.values(TagSource).map(source =>
                autoCompleteData[source].tagsLoadingPromise ?? Promise.resolve(),
            ),
        ).then(() => {
            dispatchDataEvent(DATA_TAGS_COMPLETE_EVENT);
        });
        const sourcesCompletePromise = Promise.allSettled(sourceLoadingPromises).then(results => {
            throwFirstRejected(results);
        });
        return Promise.allSettled([tagsReadyPromise, sourcesCompletePromise]).then(results => {
            throwFirstRejected(results);
        });
    });
    const loadingPromise = Promise.allSettled([
        tagLoadingPromise,
        loadEmbeddings(),
        loadLoras(),
    ])
        .then(results => {
            throwFirstRejected(results);
            dataLoadState = 'ready';
            dispatchDataEvent(DATA_STATUS_CHANGED_EVENT);
            dispatchDataEvent(DATA_READY_EVENT);
        })
        .catch(error => {
            dataLoadState = 'error';
            dataLoadError = error;
            for (const source of Object.values(TagSource)) {
                const data = autoCompleteData[source];
                if (!data.initialized) {
                    data.isInitializing = false;
                    data.error ??= error;
                }
            }
            dispatchDataEvent(DATA_STATUS_CHANGED_EVENT);
            throw error;
        })
        .finally(() => {
            if (dataLoadPromise === loadingPromise) dataLoadPromise = null;
        });

    dataLoadPromise = loadingPromise;
    return loadingPromise;
}

const isTestEnvironment = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
export const __test__ = isTestEnvironment
    ? {
        resetDataLoadingState() {
            dataLoadPromise = null;
            dataLoadState = 'idle';
            dataLoadError = null;
            for (const source of Object.keys(autoCompleteData)) {
                delete autoCompleteData[source];
            }
            ensureDataSources();
        },
    }
    : undefined;
