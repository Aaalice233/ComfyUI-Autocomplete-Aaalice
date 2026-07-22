export const settingValues = {
    // Tag source settings
    tagSource: 'all', // 'danbooru', 'e621', 'all'
    primaryTagSource: 'danbooru', // 'danbooru', 'e621'
    tagSourceIconPosition: 'left', // Legacy key retained for category icon position: 'left', 'right', 'hidden'

    // Autocomplete feature settings
    enabled: true,
    maxSuggestions: 15,
    enableModels: true, // Enable Lora and Embedding suggestions
    useFastSearch: true,
    replaceUnderscoreWithSpace: true, // Replace underscores with spaces in tag insertion
    prefixArtist: '', // Prefix to be attached before artist tags
    autoInsertComma: true,
    searchDebounceTime: 100, // Sequential search debounce time in milliseconds
    loraManagerIntegration: 'auto', // 'auto', 'enabled', 'disabled'
    excludedNodeTypes: '', // Comma or newline-separated node types owned by other extensions

    // Related tags feature settings
    enableRelatedTags: true,
    maxRelatedTags: 15,
    relatedTagsDisplayPosition: 'horizontal', // 'horizontal' or 'vertical'
    relatedTagsTriggerMode: 'click', // Options: 'click', 'ctrl+Click'

    // Display settings
    hideAlias: false, // Hide alias in the autocomplete and related tags display

    // Auto format settings
    enableAutoFormat: true,
    autoFormatTrigger: 'auto', // Options: 'auto' (format on blur + shortcut), 'manual' (shortcut only)
    useTrailingComma: false, // Whether to add comma at the end of each line
    trimSurroundingSpaces: false, // Trim spaces around each tag


    // Internal logic settings
    _useFallbackAttachmentForEventListener: false, // Fallback to attach event listener when somthing goes wrong
    _maxTagLength: 100, // Maximum tag length to prevent performance issues with long text input

    // Debugging settings (use internally)
    _hideWhenOutofFocus: true, // Hide UI when the input is out of focus
    _logprocessingTime: false, // Log processing time for debugging
}

/**
 * Update the maximum tag length setting value.
 * This function ensures that the maximum tag length is always at least as long as the new length provided.
 * @param {number} newLength 
 */
export function updateMaxTagLength(newLength) {
    if(isNaN(newLength)) return;
    settingValues._maxTagLength = Math.max(settingValues._maxTagLength, newLength);
}
