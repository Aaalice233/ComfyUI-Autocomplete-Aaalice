import {
    ModelTagSource,
    TagData,
    autoCompleteData,
    getEnabledTagSourceInPriorityOrder
} from './data.js';
import {
    isLongText,
    hiraToKata,
    kataToHira,
    formatCountHumanReadable,
    isContainsLetterOrNumber,
    normalizeTagToInsert,
    normalizeTagToSearch,
    extractTagsFromTextArea,
    getCurrentTagRange,
    getViewportMargin,
    IconSvgHtmlString,
    addWeightToLora,
    openTagWikiUrl
} from './utils.js';
import { calculateAutocompletePlacement } from './popup-layout.js';
import { settingValues } from './settings.js';
import {
    isExplicitLoraManagerQuery,
    searchLoraManagerCandidates,
} from './integrations/lora-manager-provider.js';
import { searchDanbooruCandidates } from './integrations/danbooru-provider.js';
import {
    getCandidateTranslationState,
    resolveCandidateTranslationsProgressively,
} from './integrations/translation-provider.js';
import {
    createTagOriginMarkers,
    createTranslationLoadingIndicator,
    getCandidateAliasText,
    getTagCategoryLabel,
    renderTagNameWithCategoryIcon,
} from './tag-presentation.js';
import { rankCompletionCandidates } from './candidate-ranking.js';
import { applyTextInsertionEdit, buildAutocompleteInsertionEdit } from './tag-insertion.js';
import { VirtualKeyedList } from './list-utils.js';
import { getCurrentInterfaceLocale, getInterfaceText, normalizeInterfaceLocale } from './localization.js';

export const AUTOCOMPLETE_TAG_INSERTED_EVENT = 'autocomplete-plus:tag-inserted';
const TRANSLATION_PREFETCH_LIMIT = 200;
const TRANSLATION_PREFETCH_DELAY_MS = 300;

// --- Autocomplete Logic ---

/**
 * Checks if a target string matches any of the query variations based on several rules.
 * @param {string} target - The target word to match.
 * @param {Set<string>} queries - Set of query variations.
 * @returns {{matched: boolean, isExactMatch: boolean}}
 */
function matchWord(target, queries) {
    let matched = false;
    let isExactMatch = false;
    for (const variation of queries) {
        if (target === variation) {
            isExactMatch = true;
            matched = true;
            break;
        }
    }

    if (!isExactMatch) {
        for (const variation of queries) {
            const hasWildcardPrefix = variation.startsWith('__');
            if (hasWildcardPrefix) {
                // If variation has wildcard prefix, only attempt a direct partial match. (e.g. "__wildcard__")
                if (target.includes(variation)) {
                    matched = true;
                    break;
                }
            } else if (!isContainsLetterOrNumber(variation)) {
                // If the query variation contains only symbols,
                // match if the target also contains only symbols and includes the variation. (e.g. "^_^", "^^^")
                if (!isContainsLetterOrNumber(target) && target.includes(variation)) {
                    matched = true;
                    break;
                }
            } else {
                // If the query variation contains letters or numbers, attempt a partial match.
                if (target.includes(variation)) {
                    matched = true;
                    break;
                }
                // If direct partial match fails, try matching after removing
                // common symbols from both target and variation.
                else if (target.replace(/[-_\s']/g, '').includes(variation.replace(/[-_\s']/g, ''))) {
                    matched = true;
                    break;
                }
            }
        }
    }

    return { matched, isExactMatch };
}

/**
 * Search tag completion candidates based on the current input and cursor position in the textarea.
 * @param {HTMLTextAreaElement} textareaElement The partial tag input.
 * @returns {Array<TagData>} The list of matching candidates.
 */
function searchCompletionCandidates(textareaElement, resultLimit = settingValues.maxSuggestions) {

    const ESCAPE_SEQUENCE = ["#", "/"]; // If the first string is that character, autocomplete will not be displayed.
    const partialTag = getCurrentPartialTag(textareaElement);
    if (!partialTag || partialTag.length <= 0 ||
        ESCAPE_SEQUENCE.some(seq => partialTag.startsWith(seq)) ||
        isLongText(partialTag)) {
        return []; // No valid input for autocomplete
    }

    const queryVariations = createQueryVariations(partialTag);

    if (shouldUseFastSearch()) {
        return searchWithFlexSearch(partialTag, queryVariations, resultLimit);
    } else {
        return sequentialSearch(partialTag, queryVariations, resultLimit);
    }
}

function createQueryVariations(partialTag) {
    // Generate Hiragana/Katakana variations if applicable
    const queryVariations = new Set([partialTag.toLowerCase(), normalizeTagToSearch(partialTag).toLowerCase()]);
    const kataQuery = hiraToKata(partialTag);
    if (kataQuery !== partialTag) {
        queryVariations.add(kataQuery);
    }
    const hiraQuery = kataToHira(partialTag);
    if (hiraQuery !== partialTag) {
        queryVariations.add(hiraQuery);
    }
    return queryVariations;
}

function rankCandidates(candidates, queryVariations, sources, limit = settingValues.maxSuggestions) {
    return rankCompletionCandidates(candidates, queryVariations, {
        limit,
        sourcePriority: sources,
    });
}

function shouldUseFastSearch() {
    if (settingValues.useFastSearch) return true;
    return getEnabledTagSourceInPriorityOrder().some(source => {
        const sourceData = autoCompleteData[source];
        return sourceData?.sortedTags.length >= 50_000;
    });
}

function getSearchCandidateLimit(resultLimit = settingValues.maxSuggestions) {
    return Math.max(resultLimit * 4, 40);
}

function addCandidate(candidate, candidates, addedTags) {
    if (!candidate) return false;
    const key = `${candidate.source}\0${String(candidate.tag).toLowerCase()}`;
    if (addedTags.has(key)) return false;
    addedTags.add(key);
    candidates.push(candidate);
    return true;
}

function addExactCandidates(source, queryVariations, candidates, addedTags) {
    const sourceData = autoCompleteData[source];
    for (const query of queryVariations) {
        addCandidate(sourceData.tagMap.get(query), candidates, addedTags);
        const aliasTarget = sourceData.aliasMap.get(query);
        if (aliasTarget) addCandidate(sourceData.tagMap.get(aliasTarget), candidates, addedTags);
    }
}

/**
 * Search completion candidates using sequential search.
 * @param {string} partialTag 
 * @param {Set<string>} queryVariations 
 * @returns 
 */
function sequentialSearch(partialTag, queryVariations, resultLimit = settingValues.maxSuggestions) {
    const startTime = performance.now();

    const candidates = [];
    const addedTags = new Set();

    const sources = getEnabledTagSourceInPriorityOrder();
    for (const source of sources) {
        if (!autoCompleteData[source]) continue;
        addExactCandidates(source, queryVariations, candidates, addedTags);
        let sourceMatchCount = 0;
        const sourceResultLimit = getSearchCandidateLimit(resultLimit);

        // Search in sortedTags (already sorted by count)
        for (const tagData of autoCompleteData[source].sortedTags) {
            // Check primary tag against all variations for exact/partial match
            const tagMatch = matchWord(tagData.tag.toLowerCase(), queryVariations);
            let matched = tagMatch.matched;

            // If primary tag didn't match, check aliases against all variations
            if (!matched && tagData.alias && Array.isArray(tagData.alias) && tagData.alias.length > 0) {
                for (const alias of tagData.alias) {
                    const aliasMatch = matchWord(alias.toLowerCase(), queryVariations);
                    if (aliasMatch.matched) {
                        matched = true;
                        break;
                    }
                }
            }

            // Add candidate if matched and not already added
            if (matched && addCandidate(tagData, candidates, addedTags)) {
                sourceMatchCount++;
                if (sourceMatchCount >= sourceResultLimit) break;
            }
        }
    }

    const rankedCandidates = rankCandidates(candidates, queryVariations, sources, resultLimit);

    if (settingValues._logprocessingTime) {
        const endTime = performance.now();
        const duration = endTime - startTime;
        console.debug(`[Autocomplete-Plus] Search for "${partialTag}" took ${duration.toFixed(2)}ms. Ranked ${rankedCandidates.length} candidates from ${candidates.length} matches.`);
    }

    return rankedCandidates;
}

/**
 * Search completion candidates using FlexSearch for fast matching.
 * @param {string} partialTag 
 * @param {Set<string>} queryVariations 
 * @returns 
 */
function searchWithFlexSearch(partialTag, queryVariations, resultLimit = settingValues.maxSuggestions) {
    const startTime = performance.now();

    const collectedResults = [];
    let totalSearchCount = 0;

    const sources = getEnabledTagSourceInPriorityOrder();
    for (const source of sources) {
        const sourceData = autoCompleteData[source];
        const locale = normalizeInterfaceLocale(getCurrentInterfaceLocale());
        const indexes = [
            { document: sourceData.flexSearchDocument, fields: ["tag", "alias"] },
            { document: sourceData.translationSearchDocuments?.get(locale), fields: ["alias"] },
        ];

        for (const index of indexes) {
            if (!index.document) continue;
            const searchResult = index.document.search(partialTag, {
                field: index.fields,
                limit: getSearchCandidateLimit(resultLimit),
                merge: true,
                suggest: false,
                cache: true,
            });
            if (!searchResult?.length) continue;
            collectedResults.push(...searchResult.map(result => sourceData.sortedTags[result.id]));
            totalSearchCount += searchResult.length;
        }
    }

    // The immutable base index can still contain a CSV alias that an online
    // translation replaced. Validate against current candidate data so stale
    // aliases never surface in the result list.
    const currentMatches = collectedResults.filter(candidate => {
        if (!candidate) return false;
        const tagMatch = matchWord(candidate.tag.toLowerCase(), queryVariations).matched;
        return tagMatch || candidate.alias?.some(alias =>
            matchWord(alias.toLowerCase(), queryVariations).matched);
    });
    const rankedCandidates = rankCandidates(currentMatches, queryVariations, sources, resultLimit);

    if (settingValues._logprocessingTime) {
        const endTime = performance.now();
        const duration = endTime - startTime;
        console.debug(`[Autocomplete-Plus] Fast Search for "${partialTag}" took ${duration.toFixed(2)}ms. Ranked ${rankedCandidates.length} candidates within ${totalSearchCount} FlexSearch matches.`);
    }

    return rankedCandidates;
}

/**
 * Extracts the current tag being typed before the cursor.
 * @param {HTMLTextAreaElement} inputElement
 * @returns {string} The current partial tag.
 */
function getCurrentPartialTag(inputElement) {
    if (!inputElement) {
        return "";
    }

    const text = inputElement.value;
    const cursorPos = inputElement.selectionStart;

    // Find the last newline or comma before the cursor
    const lastNewLine = text.lastIndexOf('\n', cursorPos - 1);
    const lastComma = text.lastIndexOf(',', cursorPos - 1);

    // Get the position of the last separator (newline or comma) before cursor
    const lastSeparator = Math.max(lastNewLine, lastComma);
    const start = lastSeparator === -1 ? 0 : lastSeparator + 1;

    // Check if the cursor is inside a prompt weight modifier (e.g., :1.2, :.5, :1.)
    const segmentBeforeCursor = text.substring(start, cursorPos);
    const lastColon = segmentBeforeCursor.lastIndexOf(':');
    if (lastColon !== -1) {
        const partAfterColon = segmentBeforeCursor.substring(lastColon + 1);
        const weight = parseFloat(partAfterColon);

        // If weight is a valid number and less than 10, return empty string
        if (weight !== NaN && weight <= 9.9) {
            return "";
        }
    }

    // Get the tag range at the cursor position
    const tagRange = getCurrentTagRange(text, cursorPos);

    // If no tag is found or the cursor is before the start of the tag, return empty string
    if (!tagRange || cursorPos <= tagRange.start) {
        return "";
    }

    // Extract the part of the tag up to the cursor position
    const partial = text.substring(tagRange.start, cursorPos).trimStart();

    return normalizeTagToSearch(partial);
}

/**
 * Inserts the selected tag into the textarea, replacing the partial tag,
 * making the change undoable.
 * @param {HTMLTextAreaElement} inputElement
 * @param {TagData} tagDataToInsert
 */
function insertTagToTextArea(inputElement, tagDataToInsert) {
    if (!inputElement || !tagDataToInsert) {
        return;
    }

    const text = inputElement.value;
    const cursorPos = inputElement.selectionStart;

    let normalizedTag;
    if (tagDataToInsert.source === ModelTagSource.Lora) {
        // If the tag is from a LoRA source, add weight to it
        normalizedTag = addWeightToLora(tagDataToInsert.tag);
    } else if (Object.values(ModelTagSource).includes(tagDataToInsert.source)) {
        // If the tag is from other model tag sources (e.g., Embeddings), don't normalize it
        normalizedTag = tagDataToInsert.tag;
    } else {
        normalizedTag = normalizeTagToInsert(tagDataToInsert.tag);
    }

    const prefixArtist = tagDataToInsert.categoryText == 'artist' ? settingValues.prefixArtist : '';
    const edit = buildAutocompleteInsertionEdit(
        text,
        cursorPos,
        prefixArtist + normalizedTag,
        settingValues.autoInsertComma
    );
    applyTextInsertionEdit(inputElement, text, edit);

    // Let the related-tags handler display co-occurrences for the completed
    // tag regardless of whether it was accepted by keyboard or mouse.
    queueMicrotask(() => {
        inputElement.dispatchEvent(new Event(AUTOCOMPLETE_TAG_INSERTED_EVENT));
    });
}

// --- Autocomplete UI Class ---

class AutocompleteUI {
    constructor() {
        this.root = document.createElement('div'); // Use table instead of div
        this.root.id = 'autocomplete-plus-root';

        // Create svg icon element as definition
        this.iconSvgDef = document.createElement('div');
        this.iconSvgDef.style.position = 'absolute';
        this.iconSvgDef.style.display = 'none';
        this.iconSvgDef.innerHTML = IconSvgHtmlString;
        this.root.appendChild(this.iconSvgDef);

        this.tagsList = document.createElement('div');
        this.tagsList.id = 'autocomplete-plus-list';
        this.root.appendChild(this.tagsList);
        this.virtualList = new VirtualKeyedList(this.tagsList, {
            getKey: tagData => `${tagData.source}\0${tagData.tag}`,
            getSignature: () => '',
            createElement: (tagData, index) => this.#createTagElement(tagData, index, false),
            updateElement: (row, _tagData, index) => {
                row.dataset.index = index;
                row.classList.toggle('autocomplete-plus-row-even', index % 2 === 0);
                row.classList.toggle('autocomplete-plus-row-odd', index % 2 !== 0);
            },
        });

        // Add to DOM
        document.body.appendChild(this.root);

        this.target = null;
        this.selectedIndex = -1;
        this.candidates = [];
        this._requestId = 0;
        this._abortController = null;
        this._translationTimer = null;
        this._scrollFrame = null;
        this._resizeFrame = null;

        this.tagsList.addEventListener('scroll', () => {
            if (this._scrollFrame !== null) return;
            this._scrollFrame = requestAnimationFrame(() => {
                this._scrollFrame = null;
                this.virtualList.render();
                this.#highlightItem(false);
            });
        }, { passive: true });

        window.addEventListener('resize', () => {
            if (!this.target || this.root.style.display === 'none' || this._resizeFrame !== null) return;
            this._resizeFrame = requestAnimationFrame(() => {
                this._resizeFrame = null;
                this.#updatePosition();
                this.root.style.display = 'block';
            });
        }, { passive: true });

        // Add event listener for clicks on items
        this.tagsList.addEventListener('mousedown', (e) => {
            // Check if wiki icon was clicked first
            const wikiIcon = e.target.closest('.autocomplete-plus-wiki-icon');
            if (wikiIcon && !wikiIcon.classList.contains('disabled')) {
                openTagWikiUrl(wikiIcon.dataset.tagSource, wikiIcon.dataset.tagName);
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            // Check if row was clicked (existing behavior)
            const row = e.target.closest('.autocomplete-plus-item');
            if (row && row.dataset.index !== undefined) {
                const tagData = this.candidates[parseInt(row.dataset.index, 10)];
                if (tagData) {
                    this.#insertTag(tagData);
                }
                e.preventDefault(); // Prevent focus loss from input
                e.stopPropagation();
            }
        });
    }

    /** Checks if the autocomplete list is visible */
    isVisible() {
        return this.root.style.display !== 'none';
    }

    /**
     * Displays the autocomplete list under the given textarea element if there are candidates.
     * @param {HTMLTextAreaElement} textareaElement 
     * @returns 
     */
    async updateDisplay(textareaElement) {
        this.tagsList.scrollTop = 0;
        this.selectedIndex = -1;
        clearTimeout(this._translationTimer);
        this._translationTimer = null;
        return this.#updateDisplaySnapshot(textareaElement);
    }

    async #updateDisplaySnapshot(textareaElement) {
        const requestId = ++this._requestId;
        this._abortController?.abort();
        this._abortController = new AbortController();
        const resultLimit = Math.max(Number(settingValues.maxSuggestions) || 1000, 1);

        const localCandidates = searchCompletionCandidates(textareaElement, resultLimit);
        this.target = textareaElement;
        const partialTag = getCurrentPartialTag(textareaElement);
        const isModelQuery = isExplicitLoraManagerQuery(partialTag);
        const sources = getEnabledTagSourceInPriorityOrder();
        const queryVariations = createQueryVariations(partialTag);
        this.candidates = localCandidates;

        if (!isModelQuery) {
            this.#scheduleTranslationPrefetch(localCandidates, requestId, textareaElement);
        }

        if (this.candidates.length > 0) {
            this.#displayCandidates(true);
        } else {
            this.#hideDisplay();
        }

        const invalidPrefix = ["#", "/"].some(prefix => partialTag.startsWith(prefix));
        if (!partialTag || invalidPrefix || isLongText(partialTag)) return;

        const allowsDanbooru = ["all", "danbooru"].includes(settingValues.tagSource);
        const shouldQueryDanbooru = !isModelQuery && allowsDanbooru;
        const [supplemental, onlinePage] = await Promise.all([
            searchLoraManagerCandidates(partialTag, {
                limit: Math.min(resultLimit, 100),
                mode: settingValues.loraManagerIntegration,
                tagSource: settingValues.tagSource,
                includeModels: settingValues.enableModels,
                signal: this._abortController.signal,
            }),
            shouldQueryDanbooru
                ? searchDanbooruCandidates(partialTag, {
                    limit: Math.min(resultLimit, 200),
                    page: 1,
                    signal: this._abortController.signal,
                })
                : Promise.resolve({ candidates: [], hasMore: false, cacheState: "skipped" }),
        ]);
        if (requestId !== this._requestId || textareaElement !== this.target) return;

        const online = onlinePage.candidates;
        const combined = [...localCandidates, ...supplemental, ...online];
        this.candidates = rankCandidates(combined, queryVariations, sources, resultLimit);
        if (!isModelQuery) {
            this.#scheduleTranslationPrefetch(
                this.candidates,
                requestId,
                textareaElement,
            );
        }
        if (this.candidates.length > 0) this.#displayCandidates(false);
    }

    #scheduleTranslationPrefetch(candidates, requestId, textareaElement) {
        if (candidates.length <= 0) return;
        clearTimeout(this._translationTimer);
        this._translationTimer = setTimeout(() => {
            this._translationTimer = null;
            const isCurrentRequest = () => (
                requestId === this._requestId && textareaElement === this.target
            );
            void resolveCandidateTranslationsProgressively(
                candidates,
                getCurrentInterfaceLocale(),
                {
                    priorityLimit: TRANSLATION_PREFETCH_LIMIT,
                    shouldContinue: isCurrentRequest,
                    onStateChange: () => {
                        if (isCurrentRequest() && this.candidates.length > 0) {
                            this.#displayCandidates(false);
                        }
                    },
                },
            ).catch(() => {
                // Translation enrichment is optional and must not interrupt typing.
            });
        }, TRANSLATION_PREFETCH_DELAY_MS);
    }

    #displayCandidates(updatePosition = false) {
        if (!this.target || this.candidates.length <= 0) {
            this.#hideDisplay();
            return;
        }

        if (this.selectedIndex == -1) {
            this.selectedIndex = 0; // Reset selection to the first item
        }

        this.#updateContent();

        // Calculate caret position using the helper function (returns viewport-relative coordinates)
        if (updatePosition) this.#updatePosition();

        this.root.style.display = 'block'; // Make it visible
        this.virtualList.render();

        // Highlight the selected item
        // This function must be called after the route has been displayed, in order to scroll the highlighted item into view.
        this.#highlightItem(updatePosition);
    }

    #hideDisplay() {
        this.root.style.display = 'none';
        this.selectedIndex = -1;
        this.candidates = [];
        this.virtualList.clear();
    }

    /**
     * hides the autocomplete list.
     */
    hide() {
        this._requestId++;
        this._abortController?.abort();
        this._abortController = null;
        clearTimeout(this._translationTimer);
        this._translationTimer = null;
        this.#hideDisplay();
        this.target = null;
    }

    /** Moves the selection up or down */
    navigate(direction) {
        if (this.candidates.length === 0) return;
        this.selectedIndex += direction;

        if (this.selectedIndex < 0) {
            this.selectedIndex = this.candidates.length - 1; // Wrap around to bottom
        } else if (this.selectedIndex >= this.candidates.length) {
            this.selectedIndex = 0; // Wrap around to top
        }
        this.#highlightItem();
    }

    /** Selects the currently highlighted item
     * @returns {TagData|null} The selected tag data.
     */
    getSelectedTagData() {
        if (this.selectedIndex >= 0 && this.selectedIndex < this.candidates.length) {
            return this.candidates[this.selectedIndex];
        }

        return null; // No valid selection
    }

    /**
     * Updates the list from the current candidates.
     */
    #updateContent() {
        if (this.candidates.length === 0) {
            this.hide();
            return;
        }

        this.tagsList.classList.toggle('no-alias', settingValues.hideAlias);

        const existingTags = extractTagsFromTextArea(this.target);
        const currentTag = getCurrentPartialTag(this.target);

        const existingTagSet = new Set(existingTags);
        const currentTagOccurrences = existingTags.filter(item => item === currentTag).length;
        this.virtualList.options.getSignature = tagData => [
            tagData.source,
            tagData.tag,
            tagData.category,
            tagData.count,
            tagData.origin,
            tagData.origins?.join(','),
            getCandidateAliasText(tagData),
            getCandidateTranslationState(tagData, getCurrentInterfaceLocale()),
            settingValues.hideAlias,
            settingValues.tagSourceIconPosition,
            existingTagSet.has(tagData.tag),
        ].join('\0');
        this.virtualList.options.createElement = (tagData, index) => {
            const isExactMatch = tagData.tag === currentTag && currentTagOccurrences === 1;
            const isExistingTag = !isExactMatch && existingTagSet.has(tagData.tag);
            return this.#createTagElement(tagData, index, isExistingTag);
        };
        this.virtualList.setItems(this.candidates);
    }

    /**
     * Creates a tag element for the autocomplete list.
     * @param {TagData} tagData
     * @param {number} tagDataIndex
     * @param {boolean} isExisting
     */
    #createTagElement(tagData, tagDataIndex, isExisting) {
        const categoryText = tagData.categoryText;
        const aliasText = getCandidateAliasText(tagData);

        const tagRow = document.createElement('div');
        tagRow.classList.add('autocomplete-plus-item', tagData.source);
        tagRow.dataset.index = tagDataIndex;
        tagRow.dataset.tagCategory = categoryText; // Used to color by CSS

        // Category icon and tag name
        const tagName = document.createElement('span');
        tagName.className = 'autocomplete-plus-tag-name';
        tagName.title = tagData.tag;
        renderTagNameWithCategoryIcon(tagName, tagData, settingValues.tagSourceIconPosition, false);

        // grayout tag name if it already exists
        if (isExisting) {
            tagName.classList.add('autocomplete-plus-already-exists');
        }

        // Wiki icon
        const wikiIcon = document.createElement('span');
        wikiIcon.className = 'autocomplete-plus-wiki-icon';
        if (tagData.hasWikiPage) {
            wikiIcon.dataset.tagName = tagData.tag;
            wikiIcon.dataset.tagSource = tagData.source;
            wikiIcon.textContent = '📖'
            wikiIcon.title = getInterfaceText('openWikiPage');
            wikiIcon.ariaLabel = wikiIcon.title;
        } else {
            wikiIcon.classList.add('disabled');
        }

        // Alias
        const alias = document.createElement('span');
        alias.className = 'autocomplete-plus-alias';

        // Display alias if available
        if (getCandidateTranslationState(tagData, getCurrentInterfaceLocale()) === 'pending') {
            alias.appendChild(createTranslationLoadingIndicator());
        }
        if (aliasText.length > 0) {
            const aliasValue = document.createElement('span');
            aliasValue.className = 'autocomplete-plus-alias-value';
            aliasValue.textContent = aliasText;
            alias.appendChild(aliasValue);
            alias.title = aliasText; // Full alias on hover
        }

        // Count
        const tagCount = document.createElement('span');
        tagCount.className = `autocomplete-plus-tag-count`;
        tagCount.textContent = formatCountHumanReadable(tagData.count);

        // The final data source has its own trailing track so the badge never steals space
        // from long English tag names.
        const origins = document.createElement('span');
        origins.className = 'autocomplete-plus-origin-cell';
        origins.append(...createTagOriginMarkers(tagData));

        // Create tooltip with more info
        const localizedCategory = getTagCategoryLabel(categoryText);
        let tooltipText = `${getInterfaceText('count')}: ${tagData.count}\n${getInterfaceText('category')}: ${localizedCategory}`;
        if (aliasText.length > 0) {
            tooltipText += `\n${getInterfaceText('alias')}: ${aliasText}`;
        }
        tagRow.title = tooltipText;

        tagRow.appendChild(tagName);
        tagRow.appendChild(wikiIcon);

        if (!settingValues.hideAlias) {
            tagRow.appendChild(alias);
        }

        tagRow.appendChild(tagCount);
        tagRow.appendChild(origins);
        return tagRow;
    }

    /**
     * Calculates the position of the autocomplete list based on the caret position in the input element.
     * Position calculation logic inspired by:
     * https://github.com/pythongosssss/ComfyUI-Custom-Scripts/blob/main/web/js/common/autocomplete.js
     * License: MIT License (assumed based on repository root LICENSE file)
     * Considers ComfyUI canvas scale.
     */
    #updatePosition() {
        // Measure the element size without causing reflow
        this.root.style.visibility = 'hidden';
        this.root.style.display = 'block';
        this.root.style.width = '';
        this.root.style.maxWidth = '';
        this.tagsList.style.maxHeight = 'min(320px, calc(100vh - 24px))';
        const rootRect = this.root.getBoundingClientRect();
        // Hide it again after measurement
        this.root.style.display = 'none';
        this.root.style.visibility = 'visible';

        // Get ComfyUI canvas scale if available, otherwise default to 1
        const scale = window.app?.canvas?.ds?.scale ?? 1.0;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const margin = getViewportMargin();

        const targetElmOffset = this.#calculateElementOffset(this.target);

        const { top: caretTop, left: caretLeft, lineHeight: caretLineHeight } = this.#getCaretCoordinates(this.target);

        const scaledCaretLeft = targetElmOffset.left + (caretLeft - targetElmOffset.left) * scale;
        const scaledCaretTop = targetElmOffset.top + (caretTop - targetElmOffset.top) * scale;
        const placement = calculateAutocompletePlacement({
            caretLeft: scaledCaretLeft,
            caretTop: scaledCaretTop,
            caretBottom: scaledCaretTop + caretLineHeight * scale,
            preferredWidth: rootRect.width,
            preferredHeight: rootRect.height,
            viewportWidth,
            viewportHeight,
            margin,
        });

        // Apply the calculated position and display the element
        this.root.style.left = `${placement.x}px`;
        this.root.style.top = `${placement.y}px`;
        this.root.style.width = `${placement.width}px`;
        this.root.style.maxWidth = `${placement.width}px`;
        this.tagsList.style.maxHeight = `${placement.height}px`;
    }

    /** Highlights the item (row) at the given index */
    #highlightItem(ensureVisible = true) {
        if (!this.getSelectedTagData()) return; // No valid selection

        if (ensureVisible) this.virtualList.scrollToIndex(this.selectedIndex);
        for (const item of this.tagsList.querySelectorAll('.autocomplete-plus-item')) {
            item.classList.toggle('selected', Number(item.dataset.index) === this.selectedIndex);
        }
    }

    /**
     * Handles the selection of an item
     * @param {TagData} selectedTag The tag to insert.
     */
    #insertTag(selectedTag) {
        if (!this.target || !selectedTag) {
            this.hide();
            return;
        }

        // Insert the selected tag
        insertTagToTextArea(this.target, selectedTag);

        this.hide();
    }

    /**
     * Gets the pixel coordinates of the caret in the input element.
     * Uses a temporary div to calculate the position accurately.
     * Based on https://github.com/component/textarea-caret-position
     * @param {HTMLTextAreaElement} element The textarea element.
     * @returns {{ top: number, left: number, lineHeight: number }}
     */
    #getCaretCoordinates(element) {
        const properties = [
            'direction', // RTL support
            'boxSizing',
            'width', // on Chrome and IE, exclude the scrollbar, so the mirror div wraps exactly as the textarea does
            'height',
            'overflowX',
            'overflowY', // copy the scrollbar for IE

            'borderTopWidth',
            'borderRightWidth',
            'borderBottomWidth',
            'borderLeftWidth',
            'borderStyle',

            'paddingTop',
            'paddingRight',
            'paddingBottom',
            'paddingLeft',

            // https://developer.mozilla.org/en-US/docs/Web/CSS/font
            'fontStyle',
            'fontVariant',
            'fontWeight',
            'fontStretch',
            'fontSize',
            'fontSizeAdjust',
            'lineHeight',
            'fontFamily',

            'textAlign',
            'textTransform',
            'textIndent',
            'textDecoration', // might not make a difference, but better be safe

            'letterSpacing',
            'wordSpacing',

            'tabSize',
            'MozTabSize' // Firefox
        ];

        const isBrowser = typeof window !== 'undefined';
        const isFirefox = isBrowser && window.mozInnerScreenX != null;

        var debug = false;
        if (debug) {
            var el = document.querySelector("#input-textarea-caret-position-mirror-div");
            if (el) el.parentNode.removeChild(el);
        }

        // The mirror div will replicate the textarea's style
        const div = document.createElement('div');
        div.id = 'input-textarea-caret-position-mirror-div';
        document.body.appendChild(div);

        const style = div.style;
        const computed = window.getComputedStyle(element);
        const isInput = element.nodeName === 'INPUT';

        // Default textarea styles
        style.whiteSpace = 'pre-wrap';
        if (!isInput) style.wordWrap = 'break-word'; // only for textarea-s

        // Position off-screen
        style.position = 'absolute'; // required to return coordinates properly
        if (!debug) style.visibility = 'hidden'; // not 'display: none' because we want rendering

        // Transfer the element's properties to the div
        properties.forEach(prop => {
            if (isInput && prop === "lineHeight") {
                // Special case for <input>s because text is rendered centered and line height may be != height
                if (computed.boxSizing === "border-box") {
                    var height = parseInt(computed.height);
                    var outerHeight =
                        parseInt(computed.paddingTop) +
                        parseInt(computed.paddingBottom) +
                        parseInt(computed.borderTopWidth) +
                        parseInt(computed.borderBottomWidth);
                    var targetHeight = outerHeight + parseInt(computed.lineHeight);
                    if (height > targetHeight) {
                        style.lineHeight = height - outerHeight + "px";
                    } else if (height === targetHeight) {
                        style.lineHeight = computed.lineHeight;
                    } else {
                        style.lineHeight = 0;
                    }
                } else {
                    style.lineHeight = computed.height;
                }
            } else {
                style[prop] = computed[prop];
            }
        });

        // Calculate lineHeight more robustly
        let computedLineHeight = computed.lineHeight;
        let numericLineHeight;
        if (computedLineHeight === 'normal') {
            // Calculate fallback based on font size
            // const fontSize = parseFloat(computed.fontSize);
            // numericLineHeight = Math.round(fontSize * 1.2); // Common approximation
            numericLineHeight = this.#calculateLineHeightPx(element.nodeName, computed);
        } else {
            numericLineHeight = parseFloat(computedLineHeight); // Use parseFloat for pixel values like "16px"
        }

        if (isFirefox) {
            // Firefox lies about the overflow property for textareas: https://bugzilla.mozilla.org/show_bug.cgi?id=984275
            if (element.scrollHeight > parseInt(computed.height)) style.overflowY = 'scroll';
        } else {
            style.overflow = 'hidden'; // for Chrome to not render a scrollbar; IE keeps overflowY = 'scroll'
        }

        div.textContent = element.value.substring(0, element.selectionStart);
        // The second special handling for input type=text doesn't need to be copied:
        // If isInput then usage is https://github.com/component/textarea-caret-position#usage-input-typetext

        const span = document.createElement('span');
        // Wrapping must be replicated *exactly*, including whitespace spaces and carriage returns
        span.textContent = element.value.substring(element.selectionStart) || '.'; // || '.' because a completely empty faux span doesn't render at all
        div.appendChild(span);

        const coordinates = {
            top: span.offsetTop + (parseInt(computed['borderTopWidth']) || 0),
            left: span.offsetLeft + (parseInt(computed['borderLeftWidth']) || 0),
            lineHeight: numericLineHeight // Use the calculated numeric lineHeight
        };

        // Calculate the bounding rect of the input element relative to the viewport
        const rect = element.getBoundingClientRect();

        // Adjust the coordinates to be relative to the viewport
        coordinates.top = rect.top + element.scrollTop + coordinates.top;
        coordinates.left = rect.left + element.scrollLeft + coordinates.left;

        if (debug) {
            span.style.backgroundColor = "#aaa";
        } else {
            document.body.removeChild(div);
        }

        return coordinates;
    }

    /**
     * Returns calculated line-height of the given node in pixels.
     */
    #calculateLineHeightPx(nodeName, computedStyle) {
        const body = document.body;
        if (!body) return 0;

        const tempNode = document.createElement(nodeName);
        tempNode.innerHTML = "&nbsp;";
        Object.assign(tempNode.style, {
            fontSize: computedStyle.fontSize,
            fontFamily: computedStyle.fontFamily,
            padding: "0",
            position: "absolute",
        });
        body.appendChild(tempNode);

        // Make sure textarea has only 1 row
        if (tempNode instanceof HTMLTextAreaElement) {
            tempNode.rows = 1;
        }

        // Assume the height of the element is the line-height
        const height = tempNode.offsetHeight;
        body.removeChild(tempNode);

        return height;
    }

    /**
     * calculates the offset of the given element relative to the viewport.
     * @param {HTMLElement} element
     * @returns {{ top: number, left: number }}
     */
    #calculateElementOffset(element) {
        const rect = element.getBoundingClientRect();
        const owner = element.ownerDocument;
        if (owner == null) {
            throw new Error("Given element does not belong to document");
        }

        const { defaultView, documentElement } = owner;
        if (defaultView == null) {
            throw new Error("Given element does not belong to window");
        }

        const offset = {
            top: rect.top + defaultView.pageYOffset,
            left: rect.left + defaultView.pageXOffset,
        };
        if (documentElement) {
            offset.top -= documentElement.clientTop;
            offset.left -= documentElement.clientLeft;
        }
        return offset;
    }
}

// --- Autocomplete Event Handling Class ---
export class AutocompleteEventHandler {
    constructor() {
        this.autocompleteUI = new AutocompleteUI();
        this.keyDownWithModifier = new Map(); // Keep track of keydown events with modifiers
        this._debounceTimer = null; // Timer ID for debounced search
    }

    /**
     * Coalesces key events before searching so synchronous index work never runs inside the keyup handler.
     * @param {HTMLTextAreaElement} target
     */
    _triggerUpdateDisplay(target) {
        clearTimeout(this._debounceTimer);
        const delay = shouldUseFastSearch()
            ? 16
            : Math.max(settingValues.searchDebounceTime, 0);
        this._debounceTimer = setTimeout(() => {
            this.autocompleteUI.updateDisplay(target);
            this._debounceTimer = null;
        }, delay);
    }

    /**
     * 
     * @param {InputEvent} event 
     * @returns 
     */
    handleInput(event) {
        if (!settingValues.enabled) return;
        if (!event.isTrusted) return; // ignore synthetic events

        const partialTag = getCurrentPartialTag(event.target);
        if (partialTag.length <= 0) {
            clearTimeout(this._debounceTimer); // Cancel pending debounced search
            this.autocompleteUI.hide();
        }
    }

    handleFocus(event) {

    }

    handleBlur(event) {
        if (!settingValues._hideWhenOutofFocus) return;

        // Need a slight delay because clicking the autocomplete list causes blur
        setTimeout(() => {
            if (!this.autocompleteUI.root.contains(document.activeElement)) {
                this.autocompleteUI.hide();
            }
        }, 150);
    }

    /**
     * 
     * @param {KeyboardEvent} event 
     * @returns 
     */
    handleKeyDown(event) {
        if (!settingValues.enabled) return;

        // Save modifier key (without shiftKey) state when a key is pressed
        this.keyDownWithModifier.set(event.key.toLowerCase(), event.ctrlKey || event.altKey || event.metaKey);

        // Handle autocomplete navigation
        if (this.autocompleteUI.isVisible()) {
            switch (event.key) {
                case 'ArrowDown':
                    event.preventDefault();
                    this.autocompleteUI.navigate(1);
                    break;
                case 'ArrowUp':
                    event.preventDefault();
                    this.autocompleteUI.navigate(-1);
                    break;
                case 'Enter':
                case 'Tab':
                    const modifierKeyPressed = event.shiftKey || event.ctrlKey || event.altKey || event.metaKey;
                    if (!modifierKeyPressed && this.autocompleteUI.getSelectedTagData() !== null) {
                        event.preventDefault();
                        insertTagToTextArea(event.target, this.autocompleteUI.getSelectedTagData());
                    }
                    this.autocompleteUI.hide();
                    break;
                case 'F1':
                    event.preventDefault();
                    const tagData = this.autocompleteUI.getSelectedTagData();
                    if (tagData && tagData.hasWikiPage) {
                        openTagWikiUrl(tagData.source, tagData.tag);
                    }
                    break;
                case 'Escape':
                    event.preventDefault();
                    this.autocompleteUI.hide();
                    break;
            }
        }
    }

    /**
     * 
     * @param {KeyboardEvent} event 
     * @returns 
     */
    handleKeyUp(event) {
        if (!settingValues.enabled) return;

        const key = event.key.toLowerCase();

        // Check if the key was pressed with a modifier
        if (this.keyDownWithModifier.get(key)) {
            this.keyDownWithModifier.delete(key); // Remove the pressed key from the map
            return;
        }

        // Do not process keyup events if Ctrl, Alt, or Meta keys are pressed.
        // This prevents autocomplete from appearing for shortcuts like Ctrl+C, Ctrl+Z, etc.
        // It also handles the release of a modifier key itself if it wasn't part of a character-producing combination.
        if (event.ctrlKey || event.altKey || event.metaKey) {
            return;
        }

        if (this.autocompleteUI.isVisible()) {
            switch (event.key) {
                case 'ArrowDown':
                case 'ArrowUp':
                    event.preventDefault();
                    return; // Prevent redundant display updates

                // For other character keys, Backspace, Delete, we fall through to updateDisplay.
            }
        } else {
            // If UI is not visible, and the key is a non-character key (length > 1)
            // and not Delete or Backspace, then do nothing.
            // This prevents UI from appearing on ArrowUp, F1, Shift (alone), etc.
            if (event.key.length > 1 && !["Delete", "Backspace", "Process"].includes(event.key)) {
                return;
            }
        }

        // If the event was not handled by the above (e.g. Arrow keys, or ignored special keys)
        // and default action is not prevented, update the display.
        // This will typically be for character inputs, Delete, Backspace or IME composition.
        if (!event.defaultPrevented) {
            this._triggerUpdateDisplay(event.target);
        }
    }

    /**
     * 
     * @param {MouseEvent} event 
     * @returns 
     */
    handleMouseMove(event) {
    }

    /**
     * 
     * @param {MouseEvent} event 
     * @returns 
     */
    handleClick(event) {
        if (!settingValues.enabled) {
            this.autocompleteUI.hide();
            return false;
        }

        this.autocompleteUI.updateDisplay(event.target);
        return this.autocompleteUI.isVisible();
    }

    hide() {
        clearTimeout(this._debounceTimer);
        this._debounceTimer = null;
        this.autocompleteUI.hide();
    }
}

// Export functions for testing
const isTestEnvironment = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
export const __test__ = isTestEnvironment
    ? {
        searchCompletionCandidates,
        sequentialSearch,
        searchWithFlexSearch,
        shouldUseFastSearch,
        getSearchCandidateLimit,
        matchWord,
        getCurrentPartialTag,
        insertTagToTextArea
    }
    : undefined;
