import { jest } from '@jest/globals';
import { ModelTagSource, TagData, TagSource } from '../../web/js/data.js';
import {
    __test__,
    isExplicitLoraManagerQuery,
    mergeSupplementalCandidates,
    searchLoraManagerCandidates,
} from '../../web/js/integrations/lora-manager-provider.js';

function createResponse(payload) {
    return {
        ok: true,
        json: async () => ({ success: true, ...payload }),
    };
}

describe('LoRA Manager supplemental provider', () => {
    beforeEach(() => {
        __test__.resetState();
    });

    test.each([
        ['<lora:style', '/api/lm/loras/relative-paths', { relative_paths: ['folder/style.safetensors'] }, '<lora:folder/style>', ModelTagSource.Lora],
        ['embedding:easy', '/api/lm/embeddings/relative-paths', { relative_paths: ['easynegative.pt'] }, 'embedding:easynegative', ModelTagSource.Embeddings],
        ['__weather', '/api/lm/wildcards/search', { words: ['weather/rain'] }, '__weather/rain__', ModelTagSource.Wildcard],
    ])('maps %s through %s', async (partialTag, endpoint, payload, expectedTag, expectedSource) => {
        const fetchImpl = jest.fn(async () => createResponse(payload));

        const results = await searchLoraManagerCandidates(partialTag, { fetchImpl, limit: 12 });

        expect(fetchImpl.mock.calls[0][0]).toContain(endpoint);
        expect(fetchImpl.mock.calls[0][0]).toContain('limit=12');
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
            tag: expectedTag,
            source: expectedSource,
            origin: 'lora_manager',
            origins: ['lora_manager'],
        });
    });

    test('maps enriched custom words and applies the selected booru category filter', async () => {
        const fetchImpl = jest.fn(async () => createResponse({
            words: [{ tag_name: 'looking_at_viewer', category: 0, post_count: 123, matched_alias: 'viewer' }],
        }));

        const results = await searchLoraManagerCandidates('viewer', {
            fetchImpl,
            tagSource: TagSource.Danbooru,
        });

        const url = fetchImpl.mock.calls[0][0];
        expect(url).toContain('/api/lm/custom-words/search?');
        expect(url).toContain('enriched=true');
        expect(decodeURIComponent(url)).toContain('category=0,1,3,4,5');
        expect(results[0]).toMatchObject({
            tag: 'looking_at_viewer',
            category: 0,
            count: 123,
            alias: ['viewer'],
            source: TagSource.Danbooru,
            origin: 'lora_manager',
        });
    });

    test('does not query model endpoints when model completion is disabled', async () => {
        const fetchImpl = jest.fn();

        await expect(searchLoraManagerCandidates('<lora:test', {
            fetchImpl,
            includeModels: false,
        })).resolves.toEqual([]);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('does not call LoRA Manager when the integration is disabled', async () => {
        const fetchImpl = jest.fn();

        await expect(searchLoraManagerCandidates('test', {
            fetchImpl,
            mode: 'disabled',
        })).resolves.toEqual([]);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('merges supplemental candidates without duplicates and respects the limit', () => {
        const primary = [new TagData('one', 0), new TagData('two', 0)];
        const supplemental = [new TagData('TWO', 0), new TagData('three', 0)];

        expect(mergeSupplementalCandidates(primary, supplemental, 3).map(item => item.tag))
            .toEqual(['one', 'two', 'three']);
    });

    test('only treats LoRA, Embedding, and Wildcard prefixes as explicit API queries', () => {
        expect(isExplicitLoraManagerQuery('<lora:style')).toBe(true);
        expect(isExplicitLoraManagerQuery('embedding:easy')).toBe(true);
        expect(isExplicitLoraManagerQuery('emb:easy')).toBe(true);
        expect(isExplicitLoraManagerQuery('__weather')).toBe(true);
        expect(isExplicitLoraManagerQuery('blue_hair')).toBe(false);
    });
});
