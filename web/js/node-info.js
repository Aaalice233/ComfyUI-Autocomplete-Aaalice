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

export const VUE_NODE_TEXTAREA_SELECTOR = '.lg-node-widget textarea';

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

function findWidget(element, nodeElement, node) {
    const row = element.closest('.lg-node-widget');
    const widgets = getTextareaWidgets(node);
    if (!row || widgets.length === 0) return null;

    const label = row.querySelector('label')?.textContent?.trim();
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

function resolvePromotedWidget(node, widget) {
    const visited = new Set();

    while (node?.isSubgraphNode?.() && widget && 'sourceNodeId' in widget && 'sourceWidgetName' in widget) {
        const key = `${node.id}:${widget.sourceNodeId}:${widget.sourceWidgetName}`;
        if (visited.has(key)) break;
        visited.add(key);

        const sourceNode = node.subgraph?.getNodeById?.(widget.sourceNodeId);
        const sourceWidget = sourceNode?.widgets?.find(candidate =>
            candidate.name === widget.sourceWidgetName
        );
        if (!sourceNode || !sourceWidget) break;

        node = sourceNode;
        widget = sourceWidget;
    }

    return { node, widget };
}

/**
 * Resolve Nodes 2.0's rendered textarea back to its LiteGraph node and widget.
 * Promoted subgraph widgets are traced to their original inner node.
 */
export function getVueTextareaNodeInfo(element, graph) {
    const nodeElement = element?.closest?.('.lg-node[data-node-id]');
    if (!nodeElement?.dataset.nodeId) return null;

    const node = getNodeById(graph, nodeElement.dataset.nodeId);
    const widget = findWidget(element, nodeElement, node);
    if (!node || !widget) return null;

    const resolved = resolvePromotedWidget(node, widget);
    const nodeType = resolved.node.comfyClass || resolved.node.type || resolved.node.constructor?.name;
    if (!nodeType) return null;

    return new NodeInfo(nodeType, resolved.widget.name);
}
