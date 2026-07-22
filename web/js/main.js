import { app } from "/scripts/app.js";
import { ComfyWidgets } from "/scripts/widgets.js";
import { settingValues } from "./settings.js";
import { loadCSS } from "./utils.js";
import { TagSource, loadDataAsync } from "./data.js";
import { AUTOCOMPLETE_TAG_INSERTED_EVENT, AutocompleteEventHandler } from "./autocomplete.js";
import { RelatedTagsEventHandler } from "./related-tags.js";
import { AutoFormatterEventHandler } from "./auto-formatter.js";
import { NodeInfo, VUE_NODE_TEXTAREA_SELECTOR, getVueTextareaNodeInfo } from "./node-info.js";
import { createOnlineServicesSetting } from "./online-settings.js";
import { isInputOwnedByAnotherExtension } from "./integrations/input-compatibility.js";
import { getCurrentInterfaceLocale, getInterfaceText, setInterfaceLocalizationApp } from "./localization.js";
import { loadTranslationCatalog } from "./integrations/translation-provider.js";

// --- Constants ---
const id = "AutocompletePlus";
const name = "Autocomplete Plus";
setInterfaceLocalizationApp(app);

// --- Module-level variables ---
const autocompleteEventHandler = new AutocompleteEventHandler();
const relatedTagsEventHandler = new RelatedTagsEventHandler();
const autoFormatterEventHandler = new AutoFormatterEventHandler();
const attachedElementNodeInfoMap = new WeakMap(); // Map to track attached elements and their node info

// --- Functions ---
/**
 * Initialize event handlers for the autocomplete and related tags features.
 */
function initializeEventHandlers() {
    // Function to attach listeners
    function attachListeners(element, nodeInfo) {
        if (element.tagName !== 'TEXTAREA' || element.readOnly) return;
        if (isInputOwnedByAnotherExtension({
            element,
            nodeInfo,
            excludedNodeTypes: settingValues.excludedNodeTypes,
        })) return;
        if (attachedElementNodeInfoMap.has(element)) {
            if (nodeInfo) attachedElementNodeInfoMap.set(element, nodeInfo);
            return;
        }

        element.addEventListener('input', handleInput);
        element.addEventListener('focus', handleFocus);
        element.addEventListener('blur', handleBlur);
        element.addEventListener('keydown', handleKeyDown);
        element.addEventListener('keyup', handleKeyUp);
        element.addEventListener(AUTOCOMPLETE_TAG_INSERTED_EVENT, handleAutocompleteTagInserted);
        // element.addEventListener('keypress', handleKeyPress); // keypress is deprecated

        // Add new event listeners for related tags feature
        element.addEventListener('mousemove', handleMouseMove);
        element.addEventListener('click', handleClick);

        attachedElementNodeInfoMap.set(element, nodeInfo); // Mark as attached and store node info
    }

    // Attempt Widget Override as the primary method
    // The original ComfyWidgets.STRING arguments are (node, inputName, inputData, app)
    // inputData is often an array like [type, config]
    if (ComfyWidgets && ComfyWidgets.STRING) {
        const originalStringWidget = ComfyWidgets.STRING;
        ComfyWidgets.STRING = function (node, inputName, inputData, appInstance) { // Use appInstance to avoid conflict with global app
            const result = originalStringWidget.apply(this, arguments);

            // Check if the widget has an element and if it's a TEXTAREA
            // This is to ensure we are targeting multiline text inputs, related to '.comfy-multiline-input'
            if (result && result.widget) {
                // fallback for older Comfyui frontend versions
                const inputEl = result.widget.element ?? result.widget.inputEl;
                if (inputEl && inputEl.tagName === 'TEXTAREA' && !inputEl.readOnly) {
                    const widgetConfig = inputData && inputData[1] ? inputData[1] : {};
                    // Future: Add checks for Autocomplete Plus specific configurations if needed
                    // e.g., if (widgetConfig["AutocompletePlus.enabled"] === false) return result;

                    const nodeInfo = new NodeInfo(node.comfyClass || node.constructor.name, inputName);
                    attachListeners(inputEl, nodeInfo);
                }
            }
            return result;
        };
    }

    const targetSelectors = [VUE_NODE_TEXTAREA_SELECTOR];
    if (settingValues._useFallbackAttachmentForEventListener) {
        targetSelectors.push('.comfy-multiline-input');
    }

    function attachDiscoveredTextarea(element) {
        const nodeInfo = getVueTextareaNodeInfo(element, app.canvas?.graph)
            ?? new NodeInfo('Fallback', 'unknown');
        attachListeners(element, nodeInfo);
    }

    // Nodes 2.0 renders a separate Vue textarea instead of the widget's DOM element.
    // Observe those elements so regular and promoted subgraph inputs use the same handlers.
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    targetSelectors.forEach(selector => {
                        // Check if the added node itself matches or contains matching elements
                        if (node.matches(selector)) {
                            attachDiscoveredTextarea(node);
                        } else {
                            node.querySelectorAll(selector).forEach(attachDiscoveredTextarea);
                        }
                    });
                }
            });
        });
    });

    // Initial scan for existing elements
    targetSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(attachDiscoveredTextarea);
    });

    // Start observing the document body for changes
    observer.observe(document.body, { childList: true, subtree: true });

    /**
     * Get NodeInfo for the event target element
     * @param {Event} event - The DOM event
     * @returns {Object|null} NodeInfo object or undefined if not found
     */
    function getNodeInfo(event) {
        const nodeInfo = resolveNodeInfo(event.target);
        if (!nodeInfo) {
            console.warn('[Autocomplete-Plus] Node info not found for element in ', event.target);
            return null;
        }

        return nodeInfo;
    }

    function resolveNodeInfo(element) {
        return attachedElementNodeInfoMap.get(element)
            ?? getVueTextareaNodeInfo(element, app.canvas?.graph);
    }

    function skipOwnedInput(event) {
        const owned = isInputOwnedByAnotherExtension({
            element: event.target,
            nodeInfo: resolveNodeInfo(event.target),
            excludedNodeTypes: settingValues.excludedNodeTypes,
        });
        if (owned) {
            autocompleteEventHandler.hide();
            relatedTagsEventHandler.hide();
        }
        return owned;
    }

    function handleInput(event) {
        if (skipOwnedInput(event)) return;
        autocompleteEventHandler.handleInput(event);
        relatedTagsEventHandler.handleInput(event);
        autoFormatterEventHandler.handleInput(event);
    }

    function handleFocus(event) {
        if (skipOwnedInput(event)) return;
        autocompleteEventHandler.handleFocus(event);
        relatedTagsEventHandler.handleFocus(event);
        autoFormatterEventHandler.handleFocus(event);
    }

    function handleBlur(event) {
        if (skipOwnedInput(event)) return;
        const nodeInfo = getNodeInfo(event); // Get node info to pass to auto formatter

        autocompleteEventHandler.handleBlur(event);
        relatedTagsEventHandler.handleBlur(event);
        autoFormatterEventHandler.handleBlur(event, nodeInfo);
    }

    function handleKeyDown(event) {
        if (skipOwnedInput(event)) return;
        autocompleteEventHandler.handleKeyDown(event);
        const relatedTagsShown = relatedTagsEventHandler.handleKeyDown(event);
        if (relatedTagsShown) {
            autocompleteEventHandler.hide();
        }
        autoFormatterEventHandler.handleKeyDown(event);
    }

    function handleKeyUp(event) {
        if (skipOwnedInput(event)) return;
        autocompleteEventHandler.handleKeyUp(event);
        relatedTagsEventHandler.handleKeyUp(event);
        autoFormatterEventHandler.handleKeyUp(event);
    }

    function handleMouseMove(event) {
        if (skipOwnedInput(event)) return;
        autocompleteEventHandler.handleMouseMove(event);
        relatedTagsEventHandler.handleMouseMove(event);
        autoFormatterEventHandler.handleMouseMove(event);
    }

    function handleClick(event) {
        if (skipOwnedInput(event)) return;
        const relatedTagsShown = relatedTagsEventHandler.handleClick(event);
        if (relatedTagsShown) {
            autocompleteEventHandler.hide();
        } else {
            autocompleteEventHandler.handleClick(event);
        }
        autoFormatterEventHandler.handleClick(event);
    }

    function handleAutocompleteTagInserted(event) {
        if (skipOwnedInput(event)) return;
        autocompleteEventHandler.hide();
        relatedTagsEventHandler.handleAutocompleteTagInserted(event);
    }
}

/**
 * Add Miscellaneous settings to the settings screen
 */
async function addExtraSettings() {
    app.ui.settings.addSetting(createOnlineServicesSetting(app, name, id));
}

/**
 * Registration of the extension
 */
app.registerExtension({
    id: id,
    name: name,
    async setup() {
        initializeEventHandlers();

        addExtraSettings();

        let rootPath = import.meta.url.replace("js/main.js", "");
        loadCSS(rootPath + "css/autocomplete-plus.css"); // Load CSS for autocomplete

        await loadDataAsync();
        void loadTranslationCatalog(getCurrentInterfaceLocale());
    },

    // --- Commands ---
    commands: [
        {
            id: id + ".formatPrompt",
            label: `${name}: ${getInterfaceText('formatPromptCommand')}`,
            function: () => {
                const activeEl = document.activeElement;

                if (!activeEl || activeEl.tagName !== 'TEXTAREA') {
                    // console.debug('[Autocomplete-Plus] Format command: No textarea is currently focused');
                    return;
                }

                const nodeInfo = getVueTextareaNodeInfo(activeEl, app.canvas?.graph)
                    ?? attachedElementNodeInfoMap.get(activeEl);
                if (!nodeInfo) {
                    console.warn('[Autocomplete-Plus] Format command: Node info not found for focused textarea');
                    // Use fallback NodeInfo
                    const fallbackNodeInfo = new NodeInfo('Unknown', 'unknown');
                    autoFormatterEventHandler.applyFormatTextarea(activeEl, fallbackNodeInfo);
                    return;
                }

                const formatted = autoFormatterEventHandler.applyFormatTextarea(activeEl, nodeInfo);
                if (formatted) {
                    // console.debug('[Autocomplete-Plus] Format command: Formatting applied');
                } else {
                    // console.debug('[Autocomplete-Plus] Format command: Formatting skipped (blocklisted or not applicable)');
                }
            }
        }
    ],

    // --- Keybindings ---
    keybindings: [
        {
            combo: { key: "f", alt: true, shift: true },
            commandId: id + ".formatPrompt"
        }
    ],

    // One the Settings Screen, displays reverse order in same category
    settings: [
        // --- Tag source Settings ---
        {
            id: id + ".TagSource.IconPosition",
            name: "Tag category icon position",
            tooltip: "Show a category-specific icon for each suggestion. Hover the icon to see its category.",
            type: "combo",
            options: ["left", "right", "hidden"],
            defaultValue: "left",
            category: [name, "Tag Source", "Tag category icon position"],
            onChange: (newVal, oldVal) => {
                settingValues.tagSourceIconPosition = newVal;
            }
        },
        {
            id: id + ".TagSource.PrimaryTagSource",
            name: "Primary source for 'all' Source",
            tooltip: "When 'Autocomplete Tag Source' is 'all', this determines which source's tags appear first in suggestions.",
            type: "combo",
            options: Object.values(TagSource),
            defaultValue: TagSource.Danbooru,
            category: [name, "Tag Source", "Prioritize Tag Source"],
            onChange: (newVal, oldVal) => {
                settingValues.primaryTagSource = newVal;
            }
        },
        {
            id: id + ".TagSource",
            name: "Autocomplete Tag Source",
            tooltip: "Select the tag source for autocomplete suggestions. 'all' includes tags from all loaded sources.",
            type: "combo",
            options: [...Object.values(TagSource), "all"],
            defaultValue: "all",
            category: [name, "Tag Source", "Tag Source"],
            onChange: (newVal, oldVal) => {
                settingValues.tagSource = newVal;
            }
        },

        // --- Autocomplete Settings ---
        {
            id: id + ".Autocompletion.UseFastSearch",
            name: "Use Fast Search",
            tooltip: "Tag search processing during text input operates faster, improving responsiveness.",
            type: "boolean",
            defaultValue: true,
            category: [name, "Autocompletion", "Use Fast Search"],
            onChange: (newVal, oldVal) => {
                settingValues.useFastSearch = newVal;
            }
        },
        {
            id: id + ".Autocompletion.EnableModels",
            name: "Enable Loras and Embeddings",
            type: "boolean",
            defaultValue: true,
            category: [name, "Autocompletion", "Enable Loras and Embeddings"],
            onChange: (newVal, oldVal) => {
                settingValues.enableModels = newVal;
            }
        },
        {
            id: id + ".Integration.LoRAManager",
            name: "LoRA Manager integration",
            tooltip: "Use LoRA Manager's local tag, LoRA, Embedding, and Wildcard APIs as supplemental autocomplete sources.",
            type: "combo",
            options: ["auto", "enabled", "disabled"],
            defaultValue: "auto",
            category: [name, "Integration", "LoRA Manager"],
            onChange: (newVal, oldVal) => {
                settingValues.loraManagerIntegration = newVal;
            }
        },
        {
            id: id + ".Integration.ExcludedNodeTypes",
            name: "Excluded node types",
            tooltip: "Comma-separated node type names whose text inputs must be left to another extension.",
            type: "text",
            defaultValue: "",
            category: [name, "Integration", "Excluded node types"],
            onChange: (newVal, oldVal) => {
                settingValues.excludedNodeTypes = newVal;
            }
        },
        {
            id: id + ".Autocompletion.PrefixArtist",
            name: "String to add before artist tags",
            tooltip: "Text to prepend when inserting an artist tag via autocomplete.\ne.g. '@' -> '@artist_name'.",
            type: "text",
            defaultValue: '',
            category: [name, "Autocompletion", "String to add before artist tags"],
            onChange: (newVal, oldVal) => {
                settingValues.prefixArtist = newVal;
            }
        },
        {
            id: id + ".Autocompletion.ReplaceUnderscoreWithSpace",
            name: "Replace '_' with 'Space'",
            tooltip: "This setting also affects related tags display.",
            type: "boolean",
            defaultValue: true,
            category: [name, "Autocompletion", "Replace Underscore with Space"],
            onChange: (newVal, oldVal) => {
                settingValues.replaceUnderscoreWithSpace = newVal;
            }
        },
        {
            id: id + ".Autocompletion.AutoInsertComma",
            name: "Auto-Insert Comma",
            tooltip: "Automatically insert a comma after tags when inserting from autocomplete.",
            type: "boolean",
            defaultValue: true,
            category: [name, "Autocompletion", "Auto-Insert Comma"],
            onChange: (newVal, oldVal) => {
                settingValues.autoInsertComma = newVal;
            }
        },
        {
            id: id + ".Autocompletion.MaxSuggestions",
            name: "Suggestions per page",
            tooltip: "Number of autocomplete rows loaded at a time while scrolling.",
            type: "slider",
            attrs: {
                min: 5,
                max: 50,
                step: 5,
            },
            defaultValue: 15,
            category: [name, "Autocompletion", "Max suggestions"],
            onChange: (newVal, oldVal) => {
                settingValues.maxSuggestions = newVal;
            }
        },
        {
            id: id + ".Autocompletion.Enable",
            name: "Enable Autocomplete",
            type: "boolean",
            defaultValue: true,
            category: [name, "Autocompletion", "Enable Autocomplete"],
            onChange: (newVal, oldVal) => {
                settingValues.enabled = newVal;
            }
        },

        // --- Related Tags Settings ---
        {
            id: id + ".RelatedTags.RelatedTagsTriggerMode",
            name: "Related Tags Trigger Mode",
            tooltip: "Which action will trigger displaying related tags for the entered tag (click only, Ctrl+click).",
            type: "combo",
            options: ["click", "ctrl+Click"],
            defaultValue: "click",
            category: [name, "Related Tags", "Trigger Mode"],
            onChange: (newVal, oldVal) => {
                settingValues.relatedTagsTriggerMode = newVal;
            }
        },
        {
            id: id + ".RelatedTags.DisplayPosition",
            name: "Default Display Position",
            tooltip: "Display position (relative to Textarea).",
            type: "combo",
            options: ["horizontal", "vertical"],
            defaultValue: "horizontal",
            category: [name, "Related Tags", "Display Position"],
            onChange: (newVal, oldVal) => {
                settingValues.relatedTagsDisplayPosition = newVal;
            }
        },
        {
            id: id + ".RelatedTags.MaxRelatedTags",
            name: "Co-occurrence tags per page",
            tooltip: "Number of co-occurrence rows loaded at a time while scrolling.",
            type: "slider",
            attrs: {
                min: 5,
                max: 100,
                step: 5,
            },
            defaultValue: 15,
            category: [name, "Related Tags", "Max related tags"],
            onChange: (newVal, oldVal) => {
                settingValues.maxRelatedTags = newVal;
            }
        },
        {
            id: id + ".RelatedTags.Enable",
            name: "Enable Related Tags",
            type: "boolean",
            defaultValue: true,
            category: [name, "Related Tags", "Enable Related Tags"],
            onChange: (newVal, oldVal) => {
                settingValues.enableRelatedTags = newVal;
            }
        },

        // --- Display settings ---
        {
            id: id + ".Display.HideAlias",
            name: "Hide Alias",
            tooltip: "Hide alias column in the autocomplete and related tags display.",
            type: "boolean",
            defaultValue: false,
            category: [name, "Display", "Hide Alias"],
            onChange: (newVal, oldVal) => {
                settingValues.hideAlias = newVal;
            }
        },

        // --- Auto format settings ---
        {
            id: id + '.AutoFormatter.TrimSurroundingSpaces',
            name: 'Trim Surrounding Spaces',
            tooltip: 'When enabled, trim any blank lines from the beginning and end of the prompt.',
            type: 'boolean',
            defaultValue: false,
            category: [name, 'AutoFormatter', 'Trim Surrounding Spaces'],
            onChange: (newVal, oldVal) => {
                settingValues.trimSurroundingSpaces = newVal;
            },
        },
        {
            id: id + '.AutoFormatter.UseTrailingComma',
            name: 'Use Trailing Comma',
            tooltip: 'When enabled, ensures all lines end with a trailing comma.\nWhen disabled, removes trailing commas.',
            type: 'boolean',
            defaultValue: false,
            category: [name, 'AutoFormatter', 'Use Trailing Comma'],
            onChange: (newVal, oldVal) => {
                settingValues.useTrailingComma = newVal;
            },
        },
        {
            id: id + '.AutoFormatter.Trigger',
            name: 'Auto Format Trigger',
            tooltip: 'Auto: Format automatically when leaving text field.\nManual: Format only via keyboard shortcut. default keybind: (Alt+Shift+F)',
            type: 'combo',
            options: ['auto', 'manual'],
            defaultValue: 'auto',
            category: [name, 'AutoFormatter', 'Auto Format Trigger'],
            onChange: (newVal, oldVal) => {
                settingValues.autoFormatTrigger = newVal;
            },
        },
        {
            id: id + '.AutoFormatter.EnableAutoFormat',
            name: 'Enable Auto Format',
            type: 'boolean',
            defaultValue: true,
            category: [name, 'AutoFormatter', 'Enable Auto Format'],
            onChange: (newVal, oldVal) => {
                settingValues.enableAutoFormat = newVal;
            },
        },
    ]
});
