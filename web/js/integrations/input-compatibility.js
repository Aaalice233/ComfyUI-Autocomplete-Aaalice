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
