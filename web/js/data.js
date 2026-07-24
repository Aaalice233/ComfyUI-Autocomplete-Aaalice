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
        this.initialized = false;

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

// CSV Header for tags
const TAGS_CSV_HEADER = 'tag,category,count,alias';
const TAGS_CSV_HEADER_COLUMNS = TAGS_CSV_HEADER.split(',');
const TAG_INDEX = TAGS_CSV_HEADER_COLUMNS.indexOf('tag');
const CATEGORY_INDEX = TAGS_CSV_HEADER_COLUMNS.indexOf('category');
const COUNT_INDEX = TAGS_CSV_HEADER_COLUMNS.indexOf('count');
const ALIAS_INDEX = TAGS_CSV_HEADER_COLUMNS.indexOf('alias');
const TAG_PARSE_CHUNK_SIZE = 2000;
const COOCCURRENCE_PARSE_CHUNK_SIZE = 3000;
const MAX_COOCCURRENCES_PER_TAG = 2000;

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
    try {
        const response = await fetch(csvUrl, { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const csvText = await response.text();
        const lines = csvText.split('\n');

        const startIndex = lines[0].toLowerCase().startsWith(TAGS_CSV_HEADER) ? 1 : 0;

        await processTagLinesInChunks(lines, startIndex, csvUrl, siteName);

    } catch (error) {
        console.error(`[Autocomplete-Plus] Failed to fetch or process tags from ${csvUrl}:`, error);
    }
}

function processTagLinesInChunks(lines, startIndex, csvUrl, siteName) {
    return new Promise((resolve) => {
        let i = startIndex;

        function processChunk() {
            const endIndex = Math.min(i + TAG_PARSE_CHUNK_SIZE, lines.length);
            for (; i < endIndex; i++) {
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
                setTimeout(processChunk, 0);
            } else {
                resolve();
            }
        }

        processChunk();
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
                for (; startIdx < end; startIdx++) {
                    const tagData = autoCompleteData[siteName].sortedTags[startIdx];
                    autoCompleteData[siteName].tagIndexMap.set(tagData.tag, startIdx);
                    document.add(startIdx, tagData);
                }

                if (startIdx < autoCompleteData[siteName].sortedTags.length) {
                    setTimeout(processChunkTasks, 0);
                } else {
                    autoCompleteData[siteName].flexSearchDocument = document;
                    const endTime = performance.now();
                    const duration = endTime - startTime;
                    console.info(`[Autocomplete-Plus] Building ${autoCompleteData[siteName].sortedTags.length} index for ${siteName} took ${duration.toFixed(2)}ms.`);
                    resolve();
                }
            }
            processChunkTasks();
        });
    } catch (error) {
        console.error(`[Autocomplete-Plus] Failed to building flexSearch index`, error);
    }
}

/**
 * Loads co-occurrence data from a single CSV file.
 * @param {string} csvUrl - The URL of the CSV file to load.
 * @param {string} siteName - The site name (e.g., 'danbooru', 'e621').
 * @returns {Promise<void>}
 */
async function loadCooccurrence(csvUrl, siteName) {
    try {
        const response = await fetch(csvUrl, { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const csvText = await response.text();
        const lines = csvText.split('\n');

        const startIndex = lines[0].startsWith('tag_a,tag_b,count') ? 1 : 0;

        await processInChunks(lines, startIndex, autoCompleteData[siteName].cooccurrenceMap, csvUrl, siteName);
    } catch (error) {
        console.error(`[Autocomplete-Plus] Failed to fetch or process cooccurrence data from ${csvUrl}:`, error);
    }
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

            for (; i < endIndex; i++) {
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
                setTimeout(processChunk, 0);
            } else {
                resolve();
            }
        }

        processChunk();
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
 * @returns {Promise<void>}
 */
async function fetchCsvList() {
    try {
        const response = await fetch('/autocomplete-plus/csv');
        if (!response.ok) {
            throw new Error(`[Autocomplete-Plus] Failed to fetch CSV list: ${response.status} ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error("[Autocomplete-Plus] Error fetch csv data:", error);
    }

    return null;
}

/**
 * Initializes the autocomplete data by fetching the list of CSV files and loading them.
 */
async function initializeDataFromCSV(csvListData, source) {
    if (autoCompleteData.hasOwnProperty(source) === false) {
        autoCompleteData[source] = new AutocompleteData();
    }

    if (autoCompleteData[source].isInitializing || autoCompleteData[source].initialized) {
        return;
    }

    const startTime = performance.now();
    autoCompleteData[source].isInitializing = true;

    try {
        // Store functions that return Promises (Promise Factories)
        // These factories will be called later to start the actual loading.
        const tagsLoadPromiseFactories = [];
        const cooccurrenceLoadPromiseFactories = [];

        // Check if siteName exists in csvListData to prevent errors if a sourte is removed or misconfigured
        if (!csvListData[source]) {
            console.warn(`[Autocomplete-Plus] CSV list data not found for sourte: ${source}. Skipping.`);
            return;
        }

        const extraTagsFileList = csvListData[source].extra_tags || [];
        const extraCooccurrenceFileList = csvListData[source].extra_cooccurrence || [];

        const tagsUrl = `/autocomplete-plus/csv/${source}/tags`;
        const cooccurrenceUrl = `/autocomplete-plus/csv/${source}/tags_cooccurrence`;

        // Factory for loading tags for the current sourte
        const siteTagsLoaderFactory = async () => {
            let promiseChain = Promise.resolve();
            for (let i = 0; i < extraTagsFileList.length; i++) {
                promiseChain = promiseChain.then(() => loadTags(`${tagsUrl}/extra/${i}`, source));
            }
            if (csvListData[source].base_tags) {
                promiseChain = promiseChain.then(() => loadTags(`${tagsUrl}/base`, source));
            }
            return promiseChain;
        };
        tagsLoadPromiseFactories.push(siteTagsLoaderFactory);

        // Factory for loading cooccurrence data for the current sourte
        const siteCooccurrenceLoaderFactory = async () => {
            let promiseChain = Promise.resolve();
            for (let i = 0; i < extraCooccurrenceFileList.length; i++) {
                promiseChain = promiseChain.then(() => loadCooccurrence(`${cooccurrenceUrl}/extra/${i}`, source));
            }
            if (csvListData[source].base_cooccurrence) {
                promiseChain = promiseChain.then(() => loadCooccurrence(`${cooccurrenceUrl}/base`, source));
            }
            return promiseChain;
        };
        cooccurrenceLoadPromiseFactories.push(siteCooccurrenceLoaderFactory);

        // Now, execute all promise factories and wait for their completion.
        // The actual loading (fetch calls) will start when the factories are invoked here.
        await Promise.all([
            Promise.all(tagsLoadPromiseFactories.map(factory => factory()))
                .then(() => {
                    // Sort by count in descending order
                    autoCompleteData[source].sortedTags.sort((a, b) => b.count - a.count);

                    // Build FlexSearch index after tags are loaded
                    return buildFlexSearchIndex(source);
                })
                .then(() => {
                    const endTime = performance.now();
                    if (csvListData[source].base_tags) {
                        console.log(`[Autocomplete-Plus] "${source}" Tags loading complete in ${(endTime - startTime).toFixed(2)}ms`);
                    }
                }),
            Promise.all(cooccurrenceLoadPromiseFactories.map(factory => factory())).then(() => {
                const endTime = performance.now();
                if (csvListData[source].base_cooccurrence) {
                    console.log(`[Autocomplete-Plus] "${source}" Co-occurrence loading complete in ${(endTime - startTime).toFixed(2)}ms.`);
                }
            })
        ]);

        autoCompleteData[source].initialized = true;
    } catch (error) {
        console.error("[Autocomplete-Plus] Error initializing autocomplete data:", error);
    } finally {
        autoCompleteData[source].isInitializing = false;
    }
}

/**
 * Load Embeddings data from the API endpoint
 * @returns {Promise<void>}
 */
async function loadEmbeddings() {
    try {
        const response = await fetch('/autocomplete-plus/embeddings', { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const embeddings = await response.json();
        const source = ModelTagSource.Embeddings;

        if (autoCompleteData.hasOwnProperty(source) === false) {
            autoCompleteData[source] = new AutocompleteData();
        }

        embeddings.forEach(embedding => {
            if (!autoCompleteData[source].tagMap.has(embedding)) {
                const tagData = new TagData(`embedding:${embedding}`, 0, 0, [], source);
                autoCompleteData[source].sortedTags.push(tagData);
                autoCompleteData[source].tagMap.set(embedding, tagData);

                updateMaxTagLength(embedding.length);
            }
        });

        await buildFlexSearchIndex(ModelTagSource.Embeddings);

        console.log(`[Autocomplete-Plus] Loaded ${embeddings.length} Embeddings`);
    } catch (error) {
        console.error(`[Autocomplete-Plus] Failed to fetch Embeddings data:`, error);
    }
}

/**
 * Load LoRA data from the API endpoint
 * @returns {Promise<void>}
 */
async function loadLoras() {
    try {
        const response = await fetch('/autocomplete-plus/loras', { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const loraNames = await response.json();
        const source = ModelTagSource.Lora;

        if (autoCompleteData.hasOwnProperty(source) === false) {
            autoCompleteData[source] = new AutocompleteData();
        }

        loraNames.forEach(loraName => {
            if (!autoCompleteData[source].tagMap.has(loraName)) {
                const tagData = new TagData(`<lora:${loraName}>`, 0, 0, [], source);
                autoCompleteData[source].sortedTags.push(tagData);
                autoCompleteData[source].tagMap.set(loraName, tagData);

                updateMaxTagLength(loraName.length);
            }
        });

        await buildFlexSearchIndex(ModelTagSource.Lora);

        console.log(`[Autocomplete-Plus] Loaded ${loraNames.length} LoRA models`);
    } catch (error) {
        console.error(`[Autocomplete-Plus] Failed to fetch LoRA data:`, error);
    }
}

/**
 * Load all data sources asynchronously.
 */
export async function loadDataAsync() {
    if (!autoCompleteData[ModelTagSource.Wildcard]) {
        autoCompleteData[ModelTagSource.Wildcard] = new AutocompleteData();
        autoCompleteData[ModelTagSource.Wildcard].initialized = true;
    }
    return Promise.all([
        fetchCsvList().then((csvList) => {
            return Promise.all(Object.values(TagSource).map((source) =>
                initializeDataFromCSV(csvList, source)));
        }),
        loadEmbeddings(),
        loadLoras(),
    ]);
}
