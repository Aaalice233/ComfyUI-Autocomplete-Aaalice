import {
    VUE_NODE_TEXTAREA_SELECTOR,
    getVueTextareaNodeInfo
} from "../../web/js/node-info.js";

function createTextarea(nodeId, label) {
    let textarea;
    const row = {
        querySelector: selector => selector === 'label'
            ? { textContent: label }
            : selector === 'textarea' ? textarea : null
    };
    const nodeElement = {
        dataset: { nodeId: String(nodeId) },
        querySelectorAll: selector => selector === '.lg-node-widget' ? [row] : []
    };
    textarea = {
        closest: selector => selector === '.lg-node-widget' ? row : nodeElement
    };
    return textarea;
}

describe('Nodes 2.0 textarea node info', () => {
    test('uses the Nodes 2.0 textarea selector', () => {
        expect(VUE_NODE_TEXTAREA_SELECTOR).toBe('.lg-node-widget textarea');
    });

    test('resolves a regular node textarea', () => {
        const textarea = createTextarea(12, 'text');
        const node = {
            id: 12,
            comfyClass: 'CLIPTextEncode',
            widgets: [{ name: 'text', type: 'customtext' }]
        };
        const graph = { getNodeById: id => Number(id) === 12 ? node : null };

        expect(getVueTextareaNodeInfo(textarea, graph)).toEqual({
            nodeType: 'CLIPTextEncode',
            inputName: 'text'
        });
    });

    test('traces a promoted subgraph textarea to its source widget', () => {
        const textarea = createTextarea(20, 'Prompt');
        const sourceNode = {
            id: 3,
            comfyClass: 'CLIPTextEncode',
            widgets: [{ name: 'text', type: 'customtext' }]
        };
        const promotedWidget = {
            name: 'Prompt',
            label: 'Prompt',
            type: 'customtext',
            sourceNodeId: '3',
            sourceWidgetName: 'text'
        };
        const subgraphNode = {
            id: 20,
            widgets: [promotedWidget],
            isSubgraphNode: () => true,
            subgraph: { getNodeById: id => String(id) === '3' ? sourceNode : null }
        };
        const graph = { getNodeById: id => Number(id) === 20 ? subgraphNode : null };

        expect(getVueTextareaNodeInfo(textarea, graph)).toEqual({
            nodeType: 'CLIPTextEncode',
            inputName: 'text'
        });
    });
});
