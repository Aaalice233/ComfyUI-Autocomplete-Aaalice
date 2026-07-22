import {
    isInputOwnedByAnotherExtension,
    parseExcludedNodeTypes,
    registerInputOwnershipRule,
} from '../../web/js/integrations/input-compatibility.js';

describe('input ownership compatibility', () => {
    test('parses comma and newline separated node types case-insensitively', () => {
        expect(parseExcludedNodeTypes('Foo, BAR\nBaz')).toEqual(new Set(['foo', 'bar', 'baz']));
    });

    test('leaves LoRA Manager autocomplete widgets to LoRA Manager', () => {
        const textarea = {
            closest: selector => selector === '.autocomplete-text-widget' ? {} : null,
        };

        expect(isInputOwnedByAnotherExtension({ element: textarea })).toBe(true);
        expect(isInputOwnedByAnotherExtension({
            element: { closest: () => null },
            nodeInfo: { nodeType: 'Prompt Text (LoraManager)' },
        })).toBe(true);
    });

    test('recognizes LoRA Manager private ownership marker', () => {
        const element = { _autocompleteHostWidget: {}, closest: () => null };

        expect(isInputOwnedByAnotherExtension({ element })).toBe(true);
    });

    test('supports a user-defined node type blacklist', () => {
        expect(isInputOwnedByAnotherExtension({
            element: { closest: () => null },
            nodeInfo: { nodeType: 'ThirdPartyPrompt' },
            excludedNodeTypes: 'OtherNode, thirdpartyprompt',
        })).toBe(true);
    });

    test('allows integrations to register additional ownership rules', () => {
        const unregister = registerInputOwnershipRule(({ nodeInfo }) => nodeInfo?.nodeType === 'OwnedNode');
        const args = {
            element: { closest: () => null },
            nodeInfo: { nodeType: 'OwnedNode' },
        };

        expect(isInputOwnedByAnotherExtension(args)).toBe(true);
        unregister();
        expect(isInputOwnedByAnotherExtension(args)).toBe(false);
    });
});
