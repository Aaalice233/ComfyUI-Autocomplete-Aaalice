import {
    TagCategory,
    TagData,
    TagSource,
    autoCompleteData,
    getDataSourceStatus,
    getEnabledTagSourceInPriorityOrder,
    loadDataAsync,
} from './data.js';
import { settingValues } from './settings.js';
import {
    createTagOriginMarkers,
    createTranslationLoadingIndicator,
    getCandidateAliasText,
    getTagCategoryLabel,
    renderTagNameWithCategoryIcon,
} from './tag-presentation.js';
import { applyTextInsertionEdit, buildRelatedTagInsertionEdit } from './tag-insertion.js';
import { getCurrentInterfaceLocale, getInterfaceText } from './localization.js';
import { searchDanbooruRelatedTags } from './integrations/danbooru-provider.js';
import {
    getCandidateTranslationState,
    invalidateTranslationCatalog,
    resolveCandidateTranslationsProgressively,
} from './integrations/translation-provider.js';
import { VirtualKeyedList } from './list-utils.js';
import { mergeDuplicateCandidate } from './candidate-ranking.js';
import {
    extractTagsFromTextArea,
    findAllTagPositions,
    formatCountHumanReadable,
    getTagRangeForRelatedTags,
    getViewportMargin,
    isLongText,
    isValidTag,
    normalizeTagToInsert,
    normalizeTagToSearch,
    openTagWikiUrl
} from './utils.js';
import { calculatePopupPlacement } from './popup-layout.js';
import { getScaledCaretAnchor } from './caret-position.js';
import { createAutocompleteFooter } from './autocomplete-footer.js';
import { createPopupCloseButton } from './autocomplete-header.js';
import { isRawTagInput } from './integrations/input-compatibility.js';

// --- RelatedTags Logic ---

const relatedTagsCache = new WeakMap();
const TRANSLATION_PREFETCH_LIMIT = 300;
const DANBOORU_RELATED_LIMIT = 500;

/**
 * Calculates the Jaccard similarity between two tags.
 * Jaccard similarity = (A ∩ B) / (A ∪ B) = (A ∩ B) / (|A| + |B| - |A ∩ B|)
 * @param {string} tagSource The name of the site (e.g., 'danbooru', 'e621')
 * @param {string} tagA The first tag
 * @param {string} tagB The second tag
 * @returns {number} Similarity score between 0 and 1
 */
function calculateJaccardSimilarity(tagSource, tagA, tagB) {
    // Get the count of tagA and tagB individually
    const countA = autoCompleteData[tagSource].tagMap.get(tagA)?.count || 0;
    const countB = autoCompleteData[tagSource].tagMap.get(tagB)?.count || 0;

    if (countA === 0 || countB === 0) return 0;

    // Get the cooccurrence count
    const cooccurrenceAB = autoCompleteData[tagSource].cooccurrenceMap.get(tagA)?.get(tagB) || 0;

    // Calculate Jaccard similarity
    // (A ∩ B) / (A ∪ B) = (A ∩ B) / (|A| + |B| - |A ∩ B|)
    const intersection = cooccurrenceAB;
    const union = countA + countB - cooccurrenceAB;

    return union > 0 ? intersection / union : 0;
}

/**
 * Extracts the tag at the current cursor position.
 * Utilizes getCurrentTagRange to properly handle tags with weights and parentheses.
 * @param {HTMLTextAreaElement} inputElement The textarea element
 * @returns {string|null} The tag at cursor or null
 */
export function getTagFromCursorPosition(inputElement) {
    const text = inputElement.value;
    const cursorPos = inputElement.selectionStart;

    // Treat a trailing comma and its following horizontal whitespace as part
    // of the completed tag before it.
    const tagRange = getTagRangeForRelatedTags(text, cursorPos);

    // If no tag was found at the cursor position
    if (!tagRange) return null;

    // Return the normalized tag for searching
    return normalizeTagToSearch(tagRange.tag);
}

/**
 * Finds related tags for a given tag.
 * @param {string} tag The tag to find related tags for
 */
export function searchRelatedTags(tag, resultLimit = settingValues.maxRelatedTags) {
    const startTime = performance.now(); // Record start time for performance measurement

    const tagSource = TagSource.Danbooru; // TODO: Leave the tag source as Danbooru until e621_tags_cooccurrence.csv is ready
    const data = autoCompleteData[tagSource];

    if (!tag || !data?.initialized || !data.cooccurrenceMap.has(tag)) {
        return [];
    }

    const cooccurrences = data.cooccurrenceMap.get(tag);
    const cached = relatedTagsCache.get(cooccurrences);
    if (cached) return cached.slice(0, resultLimit);

    const relatedTags = [];
    for (const [coTag] of cooccurrences) {
        // Skip the tag itself
        if (coTag === tag) continue;

        // Get tag data
        const tagData = autoCompleteData[tagSource].tagMap.get(coTag);
        if (!tagData) continue;

        // Calculate similarity
        const similarity = calculateJaccardSimilarity(tagSource, tag, coTag);

        relatedTags.push({
            tag: coTag,
            similarity: similarity,
            alias: tagData.alias,
            category: tagData.category,
            source: tagData.source,
            count: tagData.count,
            categoryText: tagData.categoryText,
            hasWikiPage: tagData.hasWikiPage,
            origin: tagData.origin,
            origins: tagData.origins,
        });
    }

    // Sort by similarity (highest first)
    relatedTags.sort((a, b) => b.similarity - a.similarity);

    // Limit to max number of suggestions
    relatedTagsCache.set(cooccurrences, relatedTags);
    const result = relatedTags.slice(0, resultLimit);

    if (settingValues._logprocessingTime) {
        const endTime = performance.now();
        const duration = endTime - startTime;
        console.debug(`[Autocomplete-Plus] Find tags to related "${tag}" took ${duration.toFixed(2)}ms.`);
    }

    return result;
}

/**
 * Keeps the complete local ranking stable and appends API-only candidates.
 * This prevents a delayed online response from moving the user's selection or
 * scroll position while still filling gaps in an older local snapshot.
 */
export function mergeRelatedTagCandidates(localCandidates, onlineCandidates, resultLimit) {
    const safeLimit = Math.max(Number(resultLimit) || 0, 0);
    if (safeLimit === 0) return [];

    const merged = [];
    const indexByTag = new Map();
    for (const candidate of [...localCandidates, ...onlineCandidates]) {
        const key = String(candidate?.tag || "").toLowerCase();
        if (!key) continue;
        const existingIndex = indexByTag.get(key);
        if (existingIndex === undefined) {
            if (merged.length >= safeLimit) continue;
            indexByTag.set(key, merged.length);
            merged.push(candidate);
        } else {
            merged[existingIndex] = mergeDuplicateCandidate(merged[existingIndex], candidate);
        }
    }
    return merged;
}

/**
 * Function to insert a tag into the textarea.
 * Appends the selected tag after the current tag.
 * Supports undo by using document.execCommand.
 * Checks if the tag already exists in the next position.
 * If the tag already exists anywhere in the input, it selects that tag instead.
 * @param {HTMLTextAreaElement} inputElement
 * @param {string} tagToInsert
 */
function insertTagToTextArea(inputElement, tagToInsert) {
    const text = inputElement.value;
    const cursorPos = inputElement.selectionStart;
    const normalizedTag = isRawTagInput(inputElement) ? tagToInsert : normalizeTagToInsert(tagToInsert);

    // First check if the tag exists anywhere in the textarea and select it if found
    const tagPositions = findAllTagPositions(text);
    for (const { start, end, tag } of tagPositions) {
        const existingTag = tag.trim();
        if (existingTag === normalizedTag) {
            // Tag already exists, select it and exit
            inputElement.focus();
            inputElement.setSelectionRange(start, end);
            return;
        }
    }

    const edit = buildRelatedTagInsertionEdit(
        text,
        cursorPos,
        normalizedTag,
        settingValues.autoInsertComma
    );
    applyTextInsertionEdit(inputElement, text, edit);
}

// --- RelatedTags UI Class ---

/**
 * Class that manages the UI for displaying related tags.
 * Shows a panel with tags related to the current tag under cursor.
 */
class RelatedTagsUI {
    constructor() {
        // Create the main container
        this.root = document.createElement('div');
        this.root.id = 'related-tags-root';

        // Create header row
        this.header = document.createElement('header');
        this.header.id = 'related-tags-header';
        this.header.className = 'autocomplete-plus-popup-header related-tags-header';

        this.headerTextContainer = document.createElement('div');
        this.headerTextContainer.className = 'autocomplete-plus-header-context related-tags-header-text-container';
        this.header.appendChild(this.headerTextContainer);

        this.headerTitle = document.createElement('span');
        this.headerTitle.className = 'autocomplete-plus-header-title related-tags-header-title';
        this.headerTextContainer.appendChild(this.headerTitle);

        this.headerQuery = document.createElement('code');
        this.headerQuery.className = 'autocomplete-plus-header-query related-tags-header-query';
        this.headerQuery.setAttribute('aria-label', getInterfaceText('autocompleteHeaderQueryLabel'));
        this.headerTextContainer.appendChild(this.headerQuery);

        this.headerAlias = document.createElement('span');
        this.headerAlias.className = 'autocomplete-plus-header-query related-tags-header-tag-alias';
        this.headerTextContainer.appendChild(this.headerAlias);

        this.headerCount = document.createElement('span');
        this.headerCount.className = 'autocomplete-plus-header-count related-tags-header-count';
        this.headerCount.setAttribute('aria-live', 'polite');
        this.headerTextContainer.appendChild(this.headerCount);

        this.headerHint = document.createElement('span');
        this.headerHint.className = 'autocomplete-plus-header-hint related-tags-header-hint';
        this.headerTextContainer.appendChild(this.headerHint);

        this.headerControls = document.createElement('div');
        this.headerControls.className = 'related-tags-header-controls';

        this.isPinned = false;
        this.pinBtn = document.createElement('button');
        this.pinBtn.type = 'button';
        this.pinBtn.className = 'related-tags-pin-toggle';

        this.pinBtn.addEventListener('click', (e) => {
            this.isPinned = !this.isPinned;
            this.pinBtn.classList.toggle('active', this.isPinned);
            this.#updateHeader();
            e.preventDefault();
            e.stopPropagation();
        });
        this.headerControls.appendChild(this.pinBtn);

        const closeButton = createPopupCloseButton({
            labelKey: 'relatedTagsClose',
            onClose: () => {
                const target = this.target;
                this.hide();
                target?.focus?.({ preventScroll: true });
            },
        });
        this.headerControls.appendChild(closeButton.element);
        this.headerCloseButton = closeButton;

        this.root.appendChild(this.header);

        // Create a tbody for the tags
        this.tagsContainer = document.createElement('div');
        this.tagsContainer.id = 'related-tags-list';
        this.root.appendChild(this.tagsContainer);
        this.footer = createAutocompleteFooter({
            id: 'related-tags-footer',
            includeCooccurrence: true,
        });
        this.root.appendChild(this.footer.element);
        this.virtualList = new VirtualKeyedList(this.tagsContainer, {
            getKey: tagData => `${tagData.source}\0${tagData.tag}`,
            getSignature: () => '',
            createElement: tagData => this.#createTagElement(tagData, false),
            updateElement: (row, _tagData, index) => {
                row.dataset.index = index;
                row.classList.toggle('autocomplete-plus-row-even', index % 2 === 0);
                row.classList.toggle('autocomplete-plus-row-odd', index % 2 !== 0);
            },
        });

        // Add to DOM
        document.body.appendChild(this.root);

        // top layer 让面板退出与宿主浮层的 z-index 竞争；CSS z-index 仅作无 Popover API 环境的回退。
        if (typeof this.root.showPopover === 'function') this.root.popover = 'manual';

        this.target = null;
        this.selectedIndex = -1;
        this.relatedTags = [];
        this.translationRequestId = 0;
        this.relatedRequestId = 0;
        this.relatedAbortController = null;
        this._scrollFrame = null;
        this._resizeFrame = null;

        // Timer ID for auto-refresh
        this.autoRefreshTimerId = null;

        // Add click handler for wiki link in header tag name
        this.headerQuery.addEventListener('mousedown', (e) => {
            const tagNameEl = e.target.closest('.related-tags-header-tag-name');
            if (tagNameEl && !tagNameEl.classList.contains('disabled')) {
                openTagWikiUrl(tagNameEl.dataset.tagSource, tagNameEl.dataset.tagName);
                e.preventDefault();
                e.stopPropagation();
                return;
            }
        });

        // Add click handler for tag selection
        this.tagsContainer.addEventListener('mousedown', (e) => {
            // Check if wiki icon was clicked first
            const wikiIcon = e.target.closest('.related-tag-wiki-icon');
            if (wikiIcon && !wikiIcon.classList.contains('disabled')) {
                openTagWikiUrl(wikiIcon.dataset.tagSource, wikiIcon.dataset.tagName);
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            const row = e.target.closest('.related-tag-item');
            if (row && row.dataset.tagName) {
                this.#insertTag(row.dataset.tagName);
                e.preventDefault();
                e.stopPropagation();
            }
        });

        this.tagsContainer.addEventListener('scroll', () => {
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
                this.root.style.display = 'flex';
            });
        }, { passive: true });
    }

    /**
     * Checks if the related tags UI is currently visible.
     * @returns {boolean}
     */
    isVisible() {
        return this.root.style.display !== 'none';
    }

    #getCooccurrenceStatus() {
        return getDataSourceStatus(TagSource.Danbooru);
    }

    /**
     * Display
     * @param {HTMLTextAreaElement} textareaElement The textarea being used
     */
    show(textareaElement, showEmptyState = true) {
        if (!settingValues.enableRelatedTags) {
            this.hide();
            return false;
        }

        this.showEmptyState = showEmptyState;

        // Get the tag at current cursor position
        const currentTag = getTagFromCursorPosition(textareaElement);

        if (!this.isPinned) {
            if (!isLongText(currentTag) && isValidTag(currentTag)) {
                this.currentTag = currentTag
            } else {
                this.hide();
                return false;
            }
        }

        this.target = textareaElement;
        this.tagsContainer.scrollTop = 0;
        this.selectedIndex = -1;
        const relatedRequestId = ++this.relatedRequestId;
        this.relatedAbortController?.abort();
        this.relatedAbortController = new AbortController();

        const resultLimit = Math.max(Number(settingValues.maxRelatedTags) || 25_000, 1);
        this.relatedTags = searchRelatedTags(this.currentTag, resultLimit);

        // Click-triggered related tags should not replace useful autocomplete
        // suggestions with an empty panel. Manual triggers keep the empty-state
        // feedback so the user can tell that the command was handled.
        if (!showEmptyState && autoCompleteData[TagSource.Danbooru]?.initialized && this.relatedTags.length === 0) {
            this.hide();
            return false;
        }

        this.#updateHeader();
        this.#updateContent();
        this.footer.setVisible(true);
        this.#updatePosition();

        // Make visible
        this.root.style.display = 'flex';
        if (this.root.popover === 'manual' && !this.root.matches(':popover-open')) this.root.showPopover();
        this.virtualList.render();

        // This function must be called after the content is updated and the root is displayed.
        this.#highlightItem();

        const translationRequestId = ++this.translationRequestId;
        const translationCandidates = [
            this.getCurrentTagData(),
            ...this.relatedTags,
        ].filter(Boolean);
        const isCurrentTranslation = () => (
            translationRequestId === this.translationRequestId && textareaElement === this.target
        );
        void resolveCandidateTranslationsProgressively(
            translationCandidates,
            getCurrentInterfaceLocale(),
            {
                priorityLimit: TRANSLATION_PREFETCH_LIMIT,
                shouldContinue: isCurrentTranslation,
                onStateChange: () => {
                    if (!isCurrentTranslation()) return;
                    this.#updateHeader();
                    this.#updateContent();
                    this.#highlightItem(false);
                },
            },
        );
        void this.#appendDanbooruRelatedTags(
            this.currentTag,
            resultLimit,
            relatedRequestId,
            textareaElement,
            this.relatedAbortController.signal,
        );

        // Keep the open panel current while the local co-occurrence index is building.
        if (this.#getCooccurrenceStatus().state === 'loading' || this.#getCooccurrenceStatus().state === 'waiting') {
            if (this.autoRefreshTimerId) {
                clearTimeout(this.autoRefreshTimerId);
            }
            this.autoRefreshTimerId = setTimeout(() => {
                this.autoRefreshTimerId = null;
                this.#refresh();
            }, 500);
        }

        return true;
    }

    /**
     * Hides the related tags UI.
     */
    hide() {
        this.translationRequestId++;
        this.relatedRequestId++;
        this.relatedAbortController?.abort();
        this.relatedAbortController = null;
        this.footer.setVisible(false);
        if (this.autoRefreshTimerId) {
            clearTimeout(this.autoRefreshTimerId);
        }

        if (this.root.popover === 'manual' && this.root.matches(':popover-open')) this.root.hidePopover();
        this.root.style.display = 'none';
        this.selectedIndex = -1;
        this.relatedTags = null;
        this.virtualList.clear();
        this.target = null;
        // Reset pinned state when hiding, unless hide was called by escape key while pinned
        if (document.activeElement !== this.pinBtn) { // Avoid unpinning if pin button was just clicked to hide
            this.isPinned = false;
            this.pinBtn.classList.remove('active');
        }
    }

    /** Moves the selection up or down
     * @param {direction} 1 for down, -1 for up
     */
    navigate(direction) {
        if (this.relatedTags.length === 0) return;

        if (this.selectedIndex == -1) {
            // Initialize selection based on navigation direction
            this.selectedIndex = direction == 1 ? 0 : this.relatedTags.length - 1;
        } else {
            this.selectedIndex += direction;
        }

        if (this.selectedIndex < 0) {
            this.selectedIndex = this.relatedTags.length - 1; // Wrap around to bottom
        } else if (this.selectedIndex >= this.relatedTags.length) {
            this.selectedIndex = 0; // Wrap around to top
        }
        this.#highlightItem();
    }

    /**
     * Get TagData of the current tag
     * @returns {TagData|null}
     */
    getCurrentTagData() {
        for (const source of getEnabledTagSourceInPriorityOrder()) {
            if (source in autoCompleteData && autoCompleteData[source].tagMap.has(this.currentTag)) {
                return autoCompleteData[source].tagMap.get(this.currentTag);
            }
        }

        return null;
    }

    /** 
     * Selects the currently highlighted item
     * @return {TagData|null}
     */
    getSelectedTagData() {
        if (this.selectedIndex >= 0 && this.selectedIndex < this.relatedTags.length) {
            return this.relatedTags[this.selectedIndex];
        }

        return null; // No valid selection
    }

    async #appendDanbooruRelatedTags(tag, resultLimit, requestId, textareaElement, signal) {
        const resultPage = await searchDanbooruRelatedTags(tag, {
            limit: Math.min(DANBOORU_RELATED_LIMIT, resultLimit),
            signal,
        });
        if (
            signal.aborted
            || requestId !== this.relatedRequestId
            || textareaElement !== this.target
            || tag !== this.currentTag
            || resultPage.candidates.length === 0
        ) {
            return;
        }

        const merged = mergeRelatedTagCandidates(this.relatedTags, resultPage.candidates, resultLimit);
        const changed = merged.length !== this.relatedTags.length
            || merged.some((candidate, index) => candidate !== this.relatedTags[index]);
        if (!changed) return;

        const previousTags = new Set(this.relatedTags.map(candidate => candidate.tag));
        const appended = merged.filter(candidate => !previousTags.has(candidate.tag));
        this.relatedTags = merged;
        this.#updateContent();
        this.virtualList.render();
        this.#highlightItem(false);

        const translationRequestId = this.translationRequestId;
        await resolveCandidateTranslationsProgressively(
            appended,
            getCurrentInterfaceLocale(),
            {
                priorityLimit: TRANSLATION_PREFETCH_LIMIT,
                shouldContinue: () => (
                    !signal.aborted
                    && requestId === this.relatedRequestId
                    && translationRequestId === this.translationRequestId
                    && textareaElement === this.target
                ),
                onStateChange: () => {
                    if (
                        signal.aborted
                        || requestId !== this.relatedRequestId
                        || translationRequestId !== this.translationRequestId
                        || textareaElement !== this.target
                    ) {
                        return;
                    }
                    this.#updateContent();
                    this.#highlightItem(false);
                },
            },
        );
        if (
            signal.aborted
            || requestId !== this.relatedRequestId
            || translationRequestId !== this.translationRequestId
            || textareaElement !== this.target
        ) {
            return;
        }
        this.#updateContent();
        this.#highlightItem(false);
    }

    /**
     * Refresh the displayed content
     */
    #refresh() {
        if (this.target) {
            this.show(this.target, this.showEmptyState);
        }
    }

    refresh() {
        if (this.target) this.#refresh();
    }

    refreshStatus() {
        if (!this.target) return;
        if (this.#getCooccurrenceStatus().state === 'error' && this.autoRefreshTimerId) {
            clearTimeout(this.autoRefreshTimerId);
            this.autoRefreshTimerId = null;
        }
        this.#updateContent();
    }

    /**
     * Updates header content
     */
    #updateHeader() {
        let tagData = this.getCurrentTagData();

        if (!tagData) {
            // Create a dummy TagData if not found
            tagData = new TagData(this.currentTag, null, 0, [], TagSource.Danbooru);
        }

        const categoryText = TagCategory[tagData.source][tagData.category] || "unknown";
        const aliasText = getCandidateAliasText(tagData);

        // Keep the related-tag context compact while preserving its wiki affordance.
        const locale = getCurrentInterfaceLocale();
        this.header.setAttribute('aria-label', getInterfaceText('relatedTags', {}, locale));
        this.headerTitle.textContent = getInterfaceText('relatedTags', {}, locale);
        this.headerQuery.replaceChildren();

        const tagName = document.createElement('span');
        tagName.classList.add('related-tags-header-tag-name', tagData.source);
        const localizedCategory = getTagCategoryLabel(categoryText);
        const detailLines = [
            `${getInterfaceText('count')}: ${tagData.count}`,
            `${getInterfaceText('category')}: ${localizedCategory}`,
        ];
        if (aliasText) detailLines.push(`${getInterfaceText('alias')}: ${aliasText}`);
        tagName.title = detailLines.join('\n');
        tagName.dataset.tagCategory = categoryText;
        tagName.dataset.tagSource = tagData.source;
        tagName.dataset.tagName = tagData.tag;
        renderTagNameWithCategoryIcon(tagName, tagData, settingValues.tagSourceIconPosition, false);

        if (!tagData.hasWikiPage) {
            tagName.classList.add('disabled');
        }

        this.headerQuery.appendChild(tagName);
        this.headerQuery.title = tagData.tag;

        this.headerAlias.style.display = 'none';
        this.headerAlias.textContent = '';
        if (aliasText.length > 0 && !settingValues.hideAlias) {
            this.headerAlias.textContent = aliasText;
            this.headerAlias.style.display = 'inline-block';
            this.headerAlias.title = aliasText;
        }

        const relatedCount = Math.max(this.relatedTags?.length || 0, 0);
        const resultLabel = getInterfaceText(
            'autocompleteHeaderResultCount',
            { count: formatCountHumanReadable(relatedCount) },
            locale,
        );
        this.headerCount.textContent = resultLabel;
        this.headerCount.title = getInterfaceText(
            'autocompleteHeaderResultCount',
            { count: String(relatedCount) },
            locale,
        );
        this.headerCount.setAttribute('aria-label', resultLabel);
        this.headerHint.textContent = getInterfaceText('autocompleteHeaderHint', {}, locale);
        this.headerCloseButton.updateLabel();

        this.pinBtn.textContent = this.isPinned ? '🎯' : '📌';
        this.pinBtn.title = getInterfaceText(this.isPinned ? 'unpinRelatedTags' : 'pinRelatedTags', {}, locale);
        this.pinBtn.ariaLabel = this.pinBtn.title;
    }

    /**
     * Updates the content of the related tags panel with the provided tags.
     */
    #updateContent() {
        const cooccurrenceStatus = this.#getCooccurrenceStatus();
        this.footer.setCooccurrenceStatus(cooccurrenceStatus);
        if (cooccurrenceStatus.state !== 'ready') {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'related-tags-message';

            const messageText = document.createElement('span');
            messageText.textContent = cooccurrenceStatus.state === 'error'
                ? getInterfaceText('cooccurrenceLoadFailed')
                : getInterfaceText('initializingCooccurrence', {
                    progress: cooccurrenceStatus.progress ?? 0,
                });
            messageDiv.append(messageText);

            if (cooccurrenceStatus.state === 'error') {
                const retryButton = document.createElement('button');
                retryButton.type = 'button';
                retryButton.className = 'related-tags-retry';
                retryButton.textContent = getInterfaceText('retry');
                retryButton.addEventListener('click', () => {
                    retryButton.disabled = true;
                    retryButton.setAttribute('aria-busy', 'true');
                    invalidateTranslationCatalog(getCurrentInterfaceLocale());
                    void loadDataAsync({ retry: true }).catch(error => {
                        console.error('[Autocomplete-Plus] Failed to retry data initialization:', error);
                    });
                });
                messageDiv.append(retryButton);
            }

            this.tagsContainer.replaceChildren(messageDiv);
            return;
        }

        if (!this.relatedTags || this.relatedTags.length === 0) {
            // Show no related tags message
            const messageDiv = document.createElement('div');
            messageDiv.className = 'related-tags-message';
            messageDiv.textContent = getInterfaceText('noRelatedTags');
            this.tagsContainer.replaceChildren(messageDiv);
            return;
        }

        // Toggle column class based on settings
        this.tagsContainer.classList.toggle('no-alias', settingValues.hideAlias);

        const existingTags = new Set(extractTagsFromTextArea(this.target));

        this.virtualList.options.getSignature = tagData => [
            tagData.source,
            tagData.tag,
            tagData.category,
            tagData.count,
            tagData.similarity,
            tagData.origins?.join(','),
            getCandidateAliasText(tagData),
            getCandidateTranslationState(tagData, getCurrentInterfaceLocale()),
            settingValues.hideAlias,
            settingValues.tagSourceIconPosition,
            existingTags.has(tagData.tag),
        ].join('\0');
        this.virtualList.options.createElement = tagData => (
            this.#createTagElement(tagData, existingTags.has(tagData.tag))
        );
        this.virtualList.setItems(this.relatedTags);
    }

    /**
     * Creates an HTML table row for a related tag.
     * @param {TagData} tagData The tag data to display
     * @param {boolean} isExisting Whether the tag already exists in the textarea
     * @returns {HTMLTableRowElement} The tag row element
     */
    #createTagElement(tagData, isExisting) {
        const categoryText = tagData.categoryText;
        const aliasText = getCandidateAliasText(tagData);

        const tagRow = document.createElement('div');
        tagRow.classList.add('related-tag-item', tagData.source);
        tagRow.dataset.tagName = tagData.tag;
        tagRow.dataset.tagCategory = categoryText;

        // Tag name
        const tagName = document.createElement('span');
        tagName.className = 'related-tag-name';
        tagName.title = tagData.tag;
        renderTagNameWithCategoryIcon(tagName, tagData, settingValues.tagSourceIconPosition, false);

        // grayout tag name if it already exists
        if (isExisting) {
            tagName.classList.add('related-tag-already-exists');
        }

        // Wiki icon
        const wikiIcon = document.createElement('span');
        wikiIcon.className = 'related-tag-wiki-icon';
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
        alias.className = 'related-tag-alias';

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

        // Similarity
        const similarity = document.createElement('span');
        similarity.className = 'related-tag-similarity';
        similarity.textContent = `${(tagData.similarity * 100).toFixed(2)}%`;

        const origins = document.createElement('span');
        origins.className = 'autocomplete-plus-origin-cell';
        origins.append(...createTagOriginMarkers(tagData));

        // Create tooltip with more info
        const localizedCategory = getTagCategoryLabel(categoryText);
        let tooltipText = `${getInterfaceText('similarity')}: ${(tagData.similarity * 100).toFixed(2)}%\n` +
            `${getInterfaceText('count')}: ${tagData.count}\n${getInterfaceText('category')}: ${localizedCategory}`;
        if (aliasText.length > 0) {
            tooltipText += `\n${getInterfaceText('alias')}: ${aliasText}`;
        }
        tagRow.title = tooltipText;

        // Add cells to row
        tagRow.appendChild(tagName);
        tagRow.appendChild(wikiIcon);

        if (!settingValues.hideAlias) {
            tagRow.appendChild(alias);
        }

        tagRow.appendChild(similarity);
        tagRow.appendChild(origins);

        return tagRow;
    }

    /**
     * Updates the position of the related tags panel from the active caret.
     */
    #updatePosition() {
        // Measure the element size without causing reflow
        this.root.style.visibility = 'hidden';
        this.root.style.display = 'flex';
        this.root.style.width = '';
        this.root.style.maxWidth = '';
        this.root.style.height = '';
        this.root.style.maxHeight = '';
        this.tagsContainer.style.maxHeight = 'min(320px, calc(100vh - 24px))';
        const rootRect = this.root.getBoundingClientRect();

        const placementArea = calculatePopupPlacement({
            anchorRect: getScaledCaretAnchor(this.target),
            preferredWidth: rootRect.width,
            preferredHeight: rootRect.height,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            margin: getViewportMargin(),
        });

        // Apply position and size
        this.root.style.left = `${placementArea.x}px`;
        this.root.style.top = `${placementArea.y}px`;
        this.root.style.width = `${placementArea.width}px`;
        this.root.style.maxWidth = `${placementArea.width}px`;
        // Keep virtualized rows from expanding beyond the measured placement.
        this.root.style.height = `${placementArea.height}px`;
        this.root.style.maxHeight = `${placementArea.height}px`;

        const newHeaderRect = this.header.getBoundingClientRect();

        const footerHeight = this.footer.getHeight();
        this.tagsContainer.style.maxHeight = `${Math.max(
            0,
            placementArea.height - newHeaderRect.height - footerHeight,
        )}px`;

        // Hide it again after measurement
        this.root.style.display = 'none';
        this.root.style.visibility = 'visible';
    }

    /** Highlights the item (row) at the given index */
    #highlightItem(ensureVisible = true) {
        if (this.getSelectedTagData() === null) return; // No valid selection

        if (ensureVisible) this.virtualList.scrollToIndex(this.selectedIndex);
        for (const item of this.tagsContainer.querySelectorAll('.related-tag-item')) {
            item.classList.toggle('selected', Number(item.dataset.index) === this.selectedIndex);
        }
    }

    /**
     * Handles the selection of a related tag.
     * Inserts the tag into the active input.
     * @param {string} tag
     */
    #insertTag(tag) {
        if (!this.target) return;

        // The input event fired by insertText may hide the current panel and
        // clear this.target, so retain the active textarea before editing.
        const target = this.target;
        const wasPinned = this.isPinned;
        insertTagToTextArea(target, tag);

        if (!wasPinned) {
            // The caret now sits after the inserted tag (and optional trailing
            // comma). Re-resolve it immediately to enable continuous chains.
            this.selectedIndex = -1;
            this.show(target, false);
        } else {
            this.#highlightItem();
        }
    }

    insertSelectedTag() {
        const selectedTag = this.getSelectedTagData();
        if (selectedTag) {
            this.#insertTag(selectedTag.tag);
        }
    }

}

// --- RelatedTags Event Handling Class ---
export class RelatedTagsEventHandler {
    constructor() {
        // Singleton instance of RelatedTagsUI
        this.relatedTagsUI = new RelatedTagsUI();
    }

    hide() {
        this.relatedTagsUI.hide();
    }

    refresh() {
        this.relatedTagsUI.refresh();
    }

    refreshStatus() {
        this.relatedTagsUI.refreshStatus();
    }

    /**
     * 
     * @param {KeyboardEvent} event 
     */
    handleInput(event) {
        if (settingValues.enableRelatedTags) {
            if (this.relatedTagsUI.isVisible() && !this.relatedTagsUI.isPinned) {
                this.relatedTagsUI.hide();
            }
        }
    }

    /**
     * 
     * @param {KeyboardEvent} event 
     */
    handleFocus(event) {
        // Handle focus event
    }

    /**
     * 
     * @param {KeyboardEvent} event 
     */
    handleBlur(event) {
        if (!settingValues._hideWhenOutofFocus) {
            return;
        }

        // Need a slight delay because clicking the related tags list causes blur
        setTimeout(() => {
            if (!this.relatedTagsUI.root.contains(document.activeElement) && !this.relatedTagsUI.isPinned) {
                this.relatedTagsUI.hide();
            }
        }, 150);
    }

    /**
     * 
     * @param {KeyboardEvent} event 
     */
    handleKeyDown(event) {
        // If related tags UI is pinned, don't handle key events except for Escape
        if (this.relatedTagsUI.isPinned) {
            if (event.key === 'Escape') {
                event.preventDefault();
                this.relatedTagsUI.hide();
            }
            return false;
        }

        // Handle key events for related tags UI
        if (this.relatedTagsUI.isVisible()) {
            switch (event.key) {
                case 'ArrowDown':
                    event.preventDefault();
                    this.relatedTagsUI.navigate(1);
                    break;
                case 'ArrowUp':
                    event.preventDefault();
                    this.relatedTagsUI.navigate(-1);
                    break;
                case 'Enter':
                case 'Tab':
                    if (this.relatedTagsUI.getSelectedTagData() !== null) {
                        event.preventDefault(); // Prevent Tab from changing focus
                        this.relatedTagsUI.insertSelectedTag();
                    } else if (!this.relatedTagsUI.isPinned) { // If nothing selected and not pinned, hide the panel
                        this.relatedTagsUI.hide();
                    }
                    break;
                case 'F1':
                    event.preventDefault();
                    const tagData = this.relatedTagsUI.getSelectedTagData() || this.relatedTagsUI.getCurrentTagData();
                    if (tagData && tagData.hasWikiPage) {
                        openTagWikiUrl(tagData.source, tagData.tag);
                    }
                    break;
                case 'Escape':
                    event.preventDefault();
                    this.relatedTagsUI.hide();
                    break;
            }
        }

        // Show related tags on Ctrl+Shift+Space
        if (settingValues.enableRelatedTags) {
            if (event.key === ' ' && event.ctrlKey && event.shiftKey) {
                event.preventDefault();
                return this.relatedTagsUI.show(event.target);
            }
        }

        return false;
    }

    /**
     * 
     * @param {KeyboardEvent} event 
     */
    handleKeyUp(event) {

    }

    /**
     * 
     * @param {MouseEvent} event 
     * @returns 
     */
    handleMouseMove(event) {

    }

    /**
     * Show related tags based on the current tag under the cursor.
     * @param {MouseEvent} event 
     * @returns 
     */
    handleClick(event) {
        // Hide related tags UI if not Ctrl+Click and not pinned when trigger mode is 'ctrl+Click'
        if (settingValues.relatedTagsTriggerMode === 'ctrl+Click' && !event.ctrlKey && !this.relatedTagsUI.isPinned) {
            this.relatedTagsUI.hide();
            return false;
        }

        const textareaElement = event.target;
        return this.relatedTagsUI.show(textareaElement, false);
    }

    handleAutocompleteTagInserted(event) {
        return this.relatedTagsUI.show(event.target, false);
    }

}
