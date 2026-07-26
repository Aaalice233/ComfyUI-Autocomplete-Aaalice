const inputOwnershipRules = [];
let cachedExcludedNodeTypes = {
    value: null,
    nodeTypes: new Set(),
};

export function registerInputOwnershipRule(rule) {
    if (typeof rule !== "function") throw new TypeError("Input ownership rule must be a function");
    inputOwnershipRules.push(rule);
    return () => {
        const index = inputOwnershipRules.indexOf(rule);
        if (index !== -1) inputOwnershipRules.splice(index, 1);
    };
}

export function parseExcludedNodeTypes(value) {
    const normalizedValue = String(value || "");
    if (cachedExcludedNodeTypes.value === normalizedValue) return cachedExcludedNodeTypes.nodeTypes;

    cachedExcludedNodeTypes = {
        value: normalizedValue,
        nodeTypes: new Set(normalizedValue
            .split(/[\n,]/)
            .map(item => item.trim().toLowerCase())
            .filter(Boolean)),
    };
    return cachedExcludedNodeTypes.nodeTypes;
}

export function isInputOwnedByAnotherExtension({ element, nodeInfo, excludedNodeTypes = "" }) {
    const nodeType = String(nodeInfo?.nodeType || "").trim().toLowerCase();
    if (nodeType && parseExcludedNodeTypes(excludedNodeTypes).has(nodeType)) return true;
    return inputOwnershipRules.some(rule => rule({ element, nodeInfo }));
}

registerInputOwnershipRule(({ element, nodeInfo }) => {
    if (element?._autocompleteHostWidget) return true;
    if (element?.closest?.(".autocomplete-text-widget")) return true;
    return String(nodeInfo?.nodeType || "").toLowerCase().endsWith("(loramanager)");
});


/**
 * Opt-in selector for inputs owned by other extensions. Elements carrying
 * `data-autocomplete-plus` are discovered like node textareas and receive the
 * same completion, Chinese completion, and related-tag handlers.
 */
export const EXTERNAL_INPUT_SELECTOR = 'input[data-autocomplete-plus], textarea[data-autocomplete-plus]';

/**
 * Whether the element may receive autocomplete listeners: node textareas always
 * qualify, other elements only through the explicit opt-in attribute.
 */
export function isAttachableTextInput(element) {
    if (!element || element.readOnly) return false;
    if (element.tagName === 'TEXTAREA') return true;
    return Boolean(element.matches?.(EXTERNAL_INPUT_SELECTOR));
}
