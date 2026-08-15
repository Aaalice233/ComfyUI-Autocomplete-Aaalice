/** @jest-environment jsdom */

import {
    CLASSIC_TEXTAREA_SELECTOR,
    TEXTAREA_SELECTORS,
    VUE_NODE_TEXTAREA_SELECTOR,
    VUE_PARAMETER_TEXTAREA_SELECTOR,
    VUE_TEXTAREA_SELECTORS,
    getTextareaNodeInfo,
    getVueTextareaNodeInfo
} from "../../web/js/node-info.js";

function createNodeTextarea(nodeId, label) {
    const nodeElement = document.createElement('div');
    nodeElement.className = 'lg-node';
    nodeElement.dataset.nodeId = String(nodeId);

    const row = document.createElement('div');
    row.className = 'lg-node-widget';
    const labelElement = document.createElement('label');
    labelElement.textContent = label;
    const textarea = document.createElement('textarea');
    row.append(labelElement, textarea);
    nodeElement.appendChild(row);
    document.body.appendChild(nodeElement);
    return textarea;
}

function createParameterTextarea(nodeId, nodeType, label) {
    const section = document.createElement('div');
    section.dataset.testid = 'section-widgets-list';
    const row = document.createElement('div');
    row.className = 'widget-item';
    const editableLabel = document.createElement('div');
    editableLabel.className = 'editable-text';
    editableLabel.textContent = label;
    const widgetElement = document.createElement('div');
    widgetElement.setAttribute('node-id', String(nodeId));
    widgetElement.setAttribute('node-type', nodeType);
    const textarea = document.createElement('textarea');
    widgetElement.appendChild(textarea);
    row.append(editableLabel, widgetElement);
    section.appendChild(row);
    document.body.appendChild(section);
    return textarea;
}

function createStoreBackedSubgraph(nodeId = 20) {
    const sourceWidget = { name: 'text', type: 'customtext' };
    const sourceInput = { name: 'text', link: 10, widget: { name: 'text' } };
    const sourceNode = {
        id: 3,
        comfyClass: 'CLIPTextEncode',
        inputs: [sourceInput],
        widgets: [sourceWidget],
        getWidgetFromSlot: input => input === sourceInput ? sourceWidget : null
    };
    const promotedWidget = {
        name: 'Prompt',
        label: 'Prompt',
        type: 'customtext'
    };
    const promotedInput = {
        name: 'Prompt',
        widgetId: 'subgraph:20:Prompt',
        widget: { name: 'Prompt' }
    };
    const subgraphNode = {
        id: nodeId,
        type: 'subgraph-type-id',
        inputs: [promotedInput],
        widgets: [promotedWidget],
        isSubgraphNode: () => true,
        getSlotFromWidget: widget => widget === promotedWidget ? promotedInput : null,
        subgraph: {
            inputNode: { slots: [{ name: 'Prompt', linkIds: [10] }] },
            getLink: linkId => linkId === 10 ? {
                resolve: () => ({ inputNode: sourceNode, input: sourceInput })
            } : null,
            getNodeById: id => String(id) === '3' ? sourceNode : null
        }
    };
    const graph = {
        nodes: [subgraphNode],
        getNodeById: id => Number(id) === Number(nodeId) ? subgraphNode : null
    };
    return graph;
}

afterEach(() => {
    document.body.replaceChildren();
});

describe('textarea node info', () => {
    test('includes classic, Nodes 2.0, and parameter-panel textareas', () => {
        expect(VUE_TEXTAREA_SELECTORS).toEqual([
            VUE_NODE_TEXTAREA_SELECTOR,
            VUE_PARAMETER_TEXTAREA_SELECTOR
        ]);
        expect(TEXTAREA_SELECTORS).toEqual([
            CLASSIC_TEXTAREA_SELECTOR,
            ...VUE_TEXTAREA_SELECTORS
        ]);
        expect(getVueTextareaNodeInfo).toBe(getTextareaNodeInfo);
        expect(CLASSIC_TEXTAREA_SELECTOR).toBe('.comfy-multiline-input');
        expect(VUE_NODE_TEXTAREA_SELECTOR).toBe('.lg-node-widget textarea');
        expect(VUE_PARAMETER_TEXTAREA_SELECTOR).toBe('[data-testid="section-widgets-list"] textarea');
    });

    test('resolves a regular node textarea', () => {
        const textarea = createNodeTextarea(12, 'text');
        const node = {
            id: 12,
            comfyClass: 'CLIPTextEncode',
            widgets: [{ name: 'text', type: 'customtext' }]
        };
        const graph = { getNodeById: id => Number(id) === 12 ? node : null };

        expect(getTextareaNodeInfo(textarea, graph)).toEqual({
            nodeType: 'CLIPTextEncode',
            inputName: 'text'
        });
    });

    test('traces a legacy promoted subgraph textarea to its source widget', () => {
        const textarea = createNodeTextarea(20, 'Prompt');
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

        expect(getTextareaNodeInfo(textarea, graph)).toEqual({
            nodeType: 'CLIPTextEncode',
            inputName: 'text'
        });
    });

    test('traces a store-backed promoted subgraph textarea to its linked source widget', () => {
        const textarea = createNodeTextarea(20, 'Prompt');

        expect(getTextareaNodeInfo(textarea, createStoreBackedSubgraph())).toEqual({
            nodeType: 'CLIPTextEncode',
            inputName: 'text'
        });
    });

    test('resolves a promoted textarea rendered in the parameter panel', () => {
        const textarea = createParameterTextarea(20, 'subgraph-type-id', 'Prompt');

        expect(textarea.matches(VUE_PARAMETER_TEXTAREA_SELECTOR)).toBe(true);
        expect(getTextareaNodeInfo(textarea, createStoreBackedSubgraph())).toEqual({
            nodeType: 'CLIPTextEncode',
            inputName: 'text'
        });
    });

    test('traces a classic promoted subgraph textarea by its widget element', () => {
        const textarea = document.createElement('textarea');
        textarea.className = 'comfy-multiline-input';
        document.body.appendChild(textarea);
        const graph = createStoreBackedSubgraph();
        graph.nodes[0].widgets[0].element = textarea;

        expect(textarea.matches(CLASSIC_TEXTAREA_SELECTOR)).toBe(true);
        expect(getTextareaNodeInfo(textarea, graph)).toEqual({
            nodeType: 'CLIPTextEncode',
            inputName: 'text'
        });
    });
});
