import { TagCategory, TagData, TagSource, autoCompleteData, getEnabledTagSourceInPriorityOrder } from './data.js';
import { settingValues } from './settings.js';
import { getTagCategoryLabel, renderTagNameWithCategoryIcon } from './tag-presentation.js';
import { applyTextInsertionEdit, buildRelatedTagInsertionEdit } from './tag-insertion.js';
import { filterAliasesForLocale, getCurrentInterfaceLocale, getInterfaceText } from './localization.js';
import { resolveCandidateTranslations } from './integrations/translation-provider.js';
import {
    extractTagsFromTextArea,
    findAllTagPositions,
    getTagRangeForRelatedTags,
    getScrollbarWidth,
    getViewportMargin,
    isLongText,
    isValidTag,
    normalizeTagToInsert,
    normalizeTagToSearch,
    openTagWikiUrl
} from './utils.js';

// --- RelatedTags Logic ---

const relatedTagsCache = new WeakMap();

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

    if (!tag || !autoCompleteData[tagSource].initialized || !autoCompleteData[tagSource].cooccurrenceMap.has(tag)) {
        return [];
    }

    const cooccurrences = autoCompleteData[tagSource].cooccurrenceMap.get(tag);
    let cache = relatedTagsCache.get(cooccurrences);
    if (!cache) {
        cache = new Map();
        relatedTagsCache.set(cooccurrences, cache);
    }
    if (cache.has(resultLimit)) {
        return cache.get(resultLimit);
    }

    const relatedTags = [];
    const evaluationLimit = Math.max(resultLimit * 20, 100);
    let evaluated = 0;

    // Co-occurrence CSV rows are loaded in descending frequency order. Evaluating
    // a bounded head avoids scanning tens of thousands of pairs on every click.
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
            hasWikiPage: tagData.hasWikiPage
        });
        evaluated++;
        if (evaluated >= evaluationLimit) break;
    }

    // Sort by similarity (highest first)
    relatedTags.sort((a, b) => b.similarity - a.similarity);

    // Limit to max number of suggestions
    const result = relatedTags.slice(0, resultLimit);
    cache.set(resultLimit, result);

    if (settingValues._logprocessingTime) {
        const endTime = performance.now();
        const duration = endTime - startTime;
        console.debug(`[Autocomplete-Plus] Find tags to related "${tag}" took ${duration.toFixed(2)}ms.`);
    }

    return result;
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

    // First check if the tag exists anywhere in the textarea and select it if found
    const tagPositions = findAllTagPositions(text);
    for (const { start, end, tag } of tagPositions) {
        const existingTag = tag.trim();
        if (existingTag === normalizeTagToInsert(tagToInsert)) {
            // Tag already exists, select it and exit
            inputElement.focus();
            inputElement.setSelectionRange(start, end);
            return;
        }
    }

    const normalizedTag = normalizeTagToInsert(tagToInsert);
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
        this.header = document.createElement('div');
        this.header.id = 'related-tags-header';

        this.headerTextContainer = document.createElement('div');
        this.headerTextContainer.className = 'related-tags-header-text-container';
        this.header.appendChild(this.headerTextContainer);

        // Create header text div for the left side
        this.headerText = document.createElement('div');
        this.headerText.className = 'related-tags-header-tag-text';
        this.headerText.textContent = getInterfaceText('relatedTags');
        this.headerTextContainer.appendChild(this.headerText);

        // Create header alias div for the 2nd line
        this.headerAlias = document.createElement('div');
        this.headerAlias.className = 'related-tags-header-tag-alias';
        this.headerTextContainer.appendChild(this.headerAlias);

        // Create header controls for the right side
        this.headerControls = document.createElement('div');
        this.headerControls.className = 'related-tags-header-controls';

        // Create layout toggle button
        this.toggleLayoutBtn = document.createElement('button');
        this.toggleLayoutBtn.className = 'related-tags-layout-toggle';
        this.toggleLayoutBtn.title = getInterfaceText('toggleRelatedTagsLayout');
        this.toggleLayoutBtn.ariaLabel = this.toggleLayoutBtn.title;

        // Add click handler for layout toggle
        this.toggleLayoutBtn.addEventListener('click', (e) => {
            // Toggle the layout setting
            settingValues.relatedTagsDisplayPosition =
                settingValues.relatedTagsDisplayPosition === 'vertical'
                    ? 'horizontal'
                    : 'vertical';

            this.#updateHeader();
            this.#updatePosition();
            this.root.style.display = 'block';

            // Prevent default behavior
            e.preventDefault();
            e.stopPropagation();
        });
        this.headerControls.appendChild(this.toggleLayoutBtn);

        // Create pin button
        this.isPinned = false;
        this.pinBtn = document.createElement('button');
        this.pinBtn.className = 'related-tags-pin-toggle';

        this.pinBtn.addEventListener('click', (e) => {
            this.isPinned = !this.isPinned;
            this.pinBtn.classList.toggle('active', this.isPinned); // For styling
            this.#updateHeader();

            // Prevent default behavior
            e.preventDefault();
            e.stopPropagation();
        });
        this.headerControls.appendChild(this.pinBtn);

        this.header.appendChild(this.headerControls);

        this.root.appendChild(this.header);

        // Create a tbody for the tags
        this.tagsContainer = document.createElement('div');
        this.tagsContainer.id = 'related-tags-list';
        this.root.appendChild(this.tagsContainer);

        // Add to DOM
        document.body.appendChild(this.root);

        this.target = null;
        this.selectedIndex = -1;
        this.relatedTags = [];
        this.translationRequestId = 0;
        this._pageCount = 1;
        this._hasMorePages = false;
        this._loadingNextPage = false;

        // Timer ID for auto-refresh
        this.autoRefreshTimerId = null;

        // Add click handler for wiki link in header tag name
        this.headerText.addEventListener('mousedown', (e) => {
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
            const remaining = this.tagsContainer.scrollHeight
                - this.tagsContainer.scrollTop
                - this.tagsContainer.clientHeight;
            if (remaining <= 48) this.#loadNextPage();
        }, { passive: true });
        this.tagsContainer.addEventListener('wheel', (event) => {
            const remaining = this.tagsContainer.scrollHeight
                - this.tagsContainer.scrollTop
                - this.tagsContainer.clientHeight;
            if (event.deltaY > 0 && remaining <= 48) this.#loadNextPage();
        }, { passive: true });
    }

    /**
     * Checks if the related tags UI is currently visible.
     * @returns {boolean}
     */
    isVisible() {
        return this.root.style.display !== 'none';
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

        this._pageCount = 1;
        const pageSize = Math.max(Number(settingValues.maxRelatedTags) || 15, 1);
        this.relatedTags = searchRelatedTags(this.currentTag, pageSize);
        this._hasMorePages = this.relatedTags.length >= pageSize;

        // Click-triggered related tags should not replace useful autocomplete
        // suggestions with an empty panel. Manual triggers keep the empty-state
        // feedback so the user can tell that the command was handled.
        if (!showEmptyState && autoCompleteData[TagSource.Danbooru].initialized && this.relatedTags.length === 0) {
            this.hide();
            return false;
        }

        this.#updateHeader();
        this.#updateContent();
        this.#updatePosition();

        // Make visible
        this.root.style.display = 'block';

        // This function must be called after the content is updated and the root is displayed.
        this.#highlightItem();

        const translationRequestId = ++this.translationRequestId;
        const translationCandidates = [this.getCurrentTagData(), ...this.relatedTags].filter(Boolean);
        resolveCandidateTranslations(translationCandidates, getCurrentInterfaceLocale()).then(() => {
            if (translationRequestId !== this.translationRequestId || textareaElement !== this.target) return;
            const preserveScrollTop = this.tagsContainer.scrollTop;
            this.#updateHeader();
            this.#updateContent();
            this.#highlightItem();
            this.tagsContainer.scrollTop = preserveScrollTop;
        });

        // Update initialization status if not already done
        if (!autoCompleteData[TagSource.Danbooru].initialized) {
            if (this.autoRefreshTimerId) {
                clearTimeout(this.autoRefreshTimerId);
            }
            this.autoRefreshTimerId = setTimeout(() => {
                this.#refresh();
            }, 500);
        }

        return true;
    }

    #loadNextPage() {
        if (this._loadingNextPage || !this._hasMorePages || !this.target || !this.relatedTags) return;
        const textareaElement = this.target;
        const currentTag = this.currentTag;
        const preserveScrollTop = this.tagsContainer.scrollTop;
        this._loadingNextPage = true;

        setTimeout(() => {
            try {
                if (textareaElement !== this.target || currentTag !== this.currentTag) return;
                const previousLength = this.relatedTags.length;
                const pageSize = Math.max(Number(settingValues.maxRelatedTags) || 15, 1);
                const requestedLimit = (this._pageCount + 1) * pageSize;
                const nextTags = searchRelatedTags(currentTag, requestedLimit);
                this._hasMorePages = nextTags.length >= requestedLimit;
                if (nextTags.length <= previousLength) return;

                this._pageCount++;
                this.relatedTags = nextTags;
                this.#updateContent();
                this.#highlightItem();
                this.tagsContainer.scrollTop = preserveScrollTop;

                const translationRequestId = ++this.translationRequestId;
                resolveCandidateTranslations(
                    nextTags.slice(previousLength),
                    getCurrentInterfaceLocale(),
                ).then(() => {
                    if (translationRequestId !== this.translationRequestId || textareaElement !== this.target) return;
                    const scrollTop = this.tagsContainer.scrollTop;
                    this.#updateContent();
                    this.#highlightItem();
                    this.tagsContainer.scrollTop = scrollTop;
                });
            } finally {
                this._loadingNextPage = false;
            }
        }, 0);
    }

    /**
     * Hides the related tags UI.
     */
    hide() {
        this.translationRequestId++;
        if (this.autoRefreshTimerId) {
            clearTimeout(this.autoRefreshTimerId);
        }

        this.root.style.display = 'none';
        this.selectedIndex = -1;
        this.relatedTags = null;
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

        if (direction > 0 && this.selectedIndex >= this.relatedTags.length - 1 && this._hasMorePages) {
            this.#loadNextPage();
            return;
        }

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

    /**
     * Refresh the displayed content
     */
    #refresh() {
        if (this.target) {
            this.show(this.target, this.showEmptyState);
        }
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
        const aliasText = filterAliasesForLocale(tagData.alias).join(', ');

        // Update header text with current tag
        this.headerText.innerHTML = ''; // Clear previous content
        this.headerText.textContent = `${getInterfaceText('tagsRelatedTo')} `;

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
        renderTagNameWithCategoryIcon(tagName, tagData, settingValues.tagSourceIconPosition);

        if (!tagData.hasWikiPage) {
            tagName.classList.add('disabled');
        }

        this.headerText.appendChild(tagName);

        // Clear previous alias
        this.headerAlias.style.display = 'none';
        this.headerAlias.innerHTML = '';

        // Add alias if available
        if (aliasText.length > 0 && !settingValues.hideAlias) {
            this.headerAlias.textContent = aliasText;
            this.headerAlias.style.display = 'block';
        }

        // Update pin button
        this.pinBtn.textContent = this.isPinned ? '🎯' : '📌';
        this.pinBtn.title = getInterfaceText(this.isPinned ? 'unpinRelatedTags' : 'pinRelatedTags');
        this.pinBtn.ariaLabel = this.pinBtn.title;
        this.toggleLayoutBtn.title = getInterfaceText('toggleRelatedTagsLayout');
        this.toggleLayoutBtn.ariaLabel = this.toggleLayoutBtn.title;

        // Update the button icon
        this.toggleLayoutBtn.innerHTML = settingValues.relatedTagsDisplayPosition === 'vertical'
            ? '↔️' // Click to change display horizontally
            : '↕️'; // Click to change display vertically
    }

    /**
     * Updates the content of the related tags panel with the provided tags.
     */
    #updateContent() {
        this.tagsContainer.innerHTML = '';

        if (!autoCompleteData[TagSource.Danbooru].initialized) {
            // Show loading message
            const messageDiv = document.createElement('div');
            messageDiv.className = 'related-tags-message';
            messageDiv.textContent = getInterfaceText('initializingCooccurrence', {
                progress: autoCompleteData[TagSource.Danbooru].baseLoadingProgress.cooccurrence,
            });
            this.tagsContainer.appendChild(messageDiv);
            return;
        }

        if (!this.relatedTags || this.relatedTags.length === 0) {
            // Show no related tags message
            const messageDiv = document.createElement('div');
            messageDiv.className = 'related-tags-message';
            messageDiv.textContent = getInterfaceText('noRelatedTags');
            this.tagsContainer.appendChild(messageDiv);
            return;
        }

        // Toggle column class based on settings
        this.tagsContainer.classList.toggle('no-alias', settingValues.hideAlias);

        const existingTags = extractTagsFromTextArea(this.target);

        // Create tag rows
        this.relatedTags.forEach(tagData => {
            const isExisting = existingTags.includes(tagData.tag);
            const tagRow = this.#createTagElement(tagData, isExisting);
            this.tagsContainer.appendChild(tagRow);
        });
    }

    /**
     * Creates an HTML table row for a related tag.
     * @param {TagData} tagData The tag data to display
     * @param {boolean} isExisting Whether the tag already exists in the textarea
     * @returns {HTMLTableRowElement} The tag row element
     */
    #createTagElement(tagData, isExisting) {
        const categoryText = tagData.categoryText;
        const aliasText = filterAliasesForLocale(tagData.alias).join(', ');

        const tagRow = document.createElement('div');
        tagRow.classList.add('related-tag-item', tagData.source);
        tagRow.dataset.tagName = tagData.tag;
        tagRow.dataset.tagCategory = categoryText;

        // Tag name
        const tagName = document.createElement('span');
        tagName.className = 'related-tag-name';
        renderTagNameWithCategoryIcon(tagName, tagData, settingValues.tagSourceIconPosition);

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
        if (aliasText.length > 0) {
            alias.textContent = `${aliasText}`;
            alias.title = aliasText; // Full alias on hover
        }

        // Similarity
        const similarity = document.createElement('span');
        similarity.className = 'related-tag-similarity';
        similarity.textContent = `${(tagData.similarity * 100).toFixed(2)}%`;

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

        return tagRow;
    }

    /**
     * Updates the position of the related tags panel.
     * Position is calculated based on the input element, available space,
     * and the setting `relatedTagsDisplayPosition`.
     * @param {HTMLElement} inputElement The input element to position
     */
    #updatePosition() {
        // Measure the element size without causing reflow
        this.root.style.visibility = 'hidden';
        this.root.style.display = 'block';
        this.root.style.maxWidth = '';
        this.tagsContainer.style.maxHeight = '';
        const rootRect = this.root.getBoundingClientRect();

        // Get the optimal placement area
        const placementArea = this.#getOptimalPlacementArea(rootRect.width, rootRect.height);

        // Apply position and size
        this.root.style.left = `${placementArea.x}px`;
        this.root.style.top = `${placementArea.y}px`;
        this.root.style.maxWidth = `${placementArea.width}px`;

        const newHeaderRect = this.header.getBoundingClientRect();

        if (this.relatedTags.length > 0) {
            this.tagsContainer.style.maxHeight = `${placementArea.height - newHeaderRect.height}px`;
        }

        // Hide it again after measurement
        this.root.style.display = 'none';
        this.root.style.visibility = 'visible';
    }

    /** Highlights the item (row) at the given index */
    #highlightItem() {
        if (this.getSelectedTagData() === null) return; // No valid selection

        const items = this.tagsContainer.children; // Get rows
        for (let i = 0; i < items.length; i++) {
            if (i === this.selectedIndex) {
                items[i].classList.add('selected'); // Use CSS class for selection
                items[i].scrollIntoView({ block: 'nearest' });
            } else {
                items[i].classList.remove('selected');
            }
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

    /**
     * Calculates the optimal placement area for the panel based on available space.
     * @param {number} elemWidth - Width of the panel element.
     * @param {number} elemHeight - Height of the panel element.
     * @returns {{ x: number, y: number, width: number, height: number }} The calculated placement area.
     */
    #getOptimalPlacementArea(elemWidth, elemHeight) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const margin = getViewportMargin();
        const targetRect = this.target.getBoundingClientRect();

        // Find optimal max width baesd on viewport and textarea element
        const maxWidth = Math.max(
            Math.min(targetRect.right, viewportWidth - margin.right) - targetRect.left,
            (viewportWidth - margin.left - margin.right) / 2
        );

        const area = {
            x: Math.max(targetRect.x, margin.left),
            y: Math.max(targetRect.y, margin.top),
            width: Math.min(elemWidth, maxWidth),
            height: Math.min(elemHeight, viewportHeight - margin.top - margin.bottom)
        };

        if (settingValues.relatedTagsDisplayPosition === 'vertical') {
            // Vertical placement
            const topSpace = targetRect.top - margin.top;
            const bottomSpace = viewportHeight - targetRect.bottom - margin.bottom;
            if (topSpace > bottomSpace) {
                // Place above
                area.height = Math.min(area.height, topSpace);
                area.y = Math.max(targetRect.y - area.height, margin.top);
            } else {
                // Place below
                area.height = Math.min(area.height, bottomSpace);
                area.y = targetRect.bottom;
            }

            // Calculate width considering scrollbar width if vertical scrolling is needed
            const scrollbarWidth = area.height < elemHeight ? getScrollbarWidth() : 0;
            area.width = Math.min(elemWidth + scrollbarWidth, maxWidth);

            // Adjust x position to avoid overflow
            area.x = Math.min(area.x, viewportWidth - area.width - margin.right);
        } else {
            // Horizontal placement
            const leftSpace = targetRect.x - margin.left;
            const rightSpace = viewportWidth - targetRect.right - margin.right;
            if (leftSpace > rightSpace) {
                // Place left
                area.width = Math.min(area.width, leftSpace);
                area.x = Math.max(targetRect.x - area.width, margin.left);
            } else {
                // Place right
                area.width = Math.min(area.width, rightSpace);
                area.x = targetRect.right;
            }

            // Calculate width considering scrollbar width if vertical scrolling is needed
            const scrollbarWidth = area.height < elemHeight ? getScrollbarWidth() : 0;
            area.width = Math.min(area.width + scrollbarWidth, viewportWidth - margin.left - margin.right);

            // Adjust y position to avoid overflow
            area.y = Math.min(area.y, viewportHeight - area.height - margin.bottom);
        }

        return area;
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
