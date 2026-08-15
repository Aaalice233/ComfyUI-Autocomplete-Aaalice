/**
 * Class to hold information about the node attached to an input element.
 * Used to control behavior based on node information.
 */
export class NodeInfo {
    /**
     * @param {string} nodeType - The type/class name of the node
     * @param {string} inputName - The name of the input widget
     */
    constructor(nodeType, inputName) {
        this.nodeType = nodeType;
        this.inputName = inputName;
    }
}

export const CLASSIC_TEXTAREA_SELECTOR = '.comfy-multiline-input';
export const VUE_NODE_TEXTAREA_SELECTOR = '.lg-node-widget textarea';
export const VUE_PARAMETER_TEXTAREA_SELECTOR = '[data-testid="section-widgets-list"] textarea';
export const VUE_TEXTAREA_SELECTORS = [
    VUE_NODE_TEXTAREA_SELECTOR,
    VUE_PARAMETER_TEXTAREA_SELECTOR,
];
export const TEXTAREA_SELECTORS = [
    CLASSIC_TEXTAREA_SELECTOR,
    ...VUE_TEXTAREA_SELECTORS,
];

const textareaWidgetTypes = new Set(['customtext', 'multiline', 'textarea']);

function getNodeById(graph, id) {
    const node = graph?.getNodeById?.(id);
    if (node || !/^\d+$/.test(id)) return node;
    return graph.getNodeById(Number(id));
}

function getTextareaWidgets(node) {
    return (node?.widgets ?? []).filter(widget =>
        textareaWidgetTypes.has(String(widget.type).toLowerCase())
    );
}

function getRenderedWidgetRow(element) {
    return element?.closest?.('.lg-node-widget, .widget-item');
}

function getRenderedWidgetLabel(row) {
    return row?.querySelector('label')?.textContent?.trim()
        || row?.querySelector('.editable-text')?.textContent?.trim()
        || '';
}

function findWidget(element, nodeElement, node) {
    const row = getRenderedWidgetRow(element);
    const widgets = getTextareaWidgets(node);
    if (!row || widgets.length === 0) return null;

    const label = getRenderedWidgetLabel(row);
    if (label) {
        const matchedWidget = widgets.find(widget =>
            String(widget.label ?? widget.name).trim() === label
        );
        if (matchedWidget) return matchedWidget;
    }

    const textareaRows = Array.from(nodeElement.querySelectorAll('.lg-node-widget'))
        .filter(widgetRow => widgetRow.querySelector('textarea'));
    return widgets[textareaRows.indexOf(row)] ?? null;
}

function findWidgetByElement(element, graph) {
    for (const node of graph?.nodes ?? graph?._nodes ?? []) {
        const widget = getTextareaWidgets(node).find(candidate =>
            (candidate.element ?? candidate.inputEl) === element
        );
        if (widget) return { node, widget };
    }
    return null;
}

function resolveLegacyPromotedWidget(node, widget) {
    if (!('sourceNodeId' in widget) || !('sourceWidgetName' in widget)) return null;

    const sourceNode = getNodeById(node.subgraph, String(widget.sourceNodeId));
    const sourceWidget = sourceNode?.widgets?.find(candidate =>
        candidate.name === widget.sourceWidgetName
    );
    return sourceNode && sourceWidget ? { node: sourceNode, widget: sourceWidget } : null;
}

function resolveLinkedPromotedWidget(node, widget) {
    const input = node.getSlotFromWidget?.(widget);
    const subgraph = node.subgraph;
    const inputSlot = subgraph?.inputNode?.slots?.find(candidate => candidate.name === input?.name);

    for (const linkId of inputSlot?.linkIds ?? []) {
        const target = subgraph.getLink?.(linkId)?.resolve?.(subgraph);
        const sourceWidget = target?.inputNode?.getWidgetFromSlot?.(target.input);
        if (sourceWidget) return { node: target.inputNode, widget: sourceWidget };
    }

    return null;
}

function resolvePromotedWidget(node, widget) {
    const visited = new Set();

    while (node?.isSubgraphNode?.() && widget) {
        if (visited.has(node)) break;
        visited.add(node);

        const source = resolveLegacyPromotedWidget(node, widget)
            ?? resolveLinkedPromotedWidget(node, widget);
        if (!source) break;

        node = source.node;
        widget = source.widget;
    }

    return { node, widget };
}

/**
 * Resolve a rendered textarea back to its LiteGraph node and widget.
 * Promoted subgraph widgets are traced to their original inner node.
 */
export function getTextareaNodeInfo(element, graph) {
    const canvasNodeElement = element?.closest?.('.lg-node[data-node-id]');
    const widgetElement = element?.closest?.('[node-id][node-type]');
    const nodeElement = canvasNodeElement ?? widgetElement;
    const nodeId = canvasNodeElement?.dataset.nodeId ?? widgetElement?.getAttribute('node-id');
    let node;
    let widget;

    if (nodeElement && nodeId) {
        node = getNodeById(graph, nodeId);
        widget = findWidget(element, nodeElement, node);
        if (!node || !widget) {
            const nodeType = widgetElement?.getAttribute('node-type');
            const inputName = getRenderedWidgetLabel(getRenderedWidgetRow(element));
            return nodeType && inputName ? new NodeInfo(nodeType, inputName) : null;
        }
    } else {
        const matched = findWidgetByElement(element, graph);
        if (!matched) return null;
        node = matched.node;
        widget = matched.widget;
    }

    const resolved = resolvePromotedWidget(node, widget);
    const nodeType = resolved.node.comfyClass || resolved.node.type || resolved.node.constructor?.name;
    if (!nodeType || !resolved.widget?.name) return null;

    return new NodeInfo(nodeType, resolved.widget.name);
}

export const getVueTextareaNodeInfo = getTextareaNodeInfo;
