import { jest } from '@jest/globals';
import { TagData, TagSource, autoCompleteData } from '../../web/js/data.js';
import {
    loadTranslationCatalog,
    resolveCandidateTranslations,
    __test__,
} from '../../web/js/integrations/translation-provider.js';
import { updateOnlineServiceFeatures } from '../../web/js/online-service-state.js';

function resetData() {
    updateOnlineServiceFeatures({ danbooru_completion: true, translation: true });
    __test__.flushIndexOperations();
    for (const key of Object.keys(autoCompleteData)) delete autoCompleteData[key];
    __test__.translationCache.clear();
    __test__.loadedLocales.clear();
    autoCompleteData.danbooru = {
        sortedTags: [],
        tagMap: new Map(),
        aliasMap: new Map(),
        tagIndexMap: new Map(),
        flexSearchDocument: { add: jest.fn(), update: jest.fn() },
        translationSearchDocuments: new Map(),
        translationIndexTexts: new Map(),
    };
}

function waitForDeferredIndexing() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

describe('on-demand translation provider', () => {
    beforeEach(resetData);

    test('applies an in-memory translation before asynchronous enrichment settles', async () => {
        const candidate = new TagData('blue_hair', 0, 100, [], TagSource.Danbooru);
        __test__.translationCache.set(__test__.cacheKey('zh', candidate.tag), '蓝发');
        const fetchImpl = jest.fn();

        const pending = resolveCandidateTranslations([candidate], 'zh', { fetchImpl });

        expect(candidate.alias).toContain('蓝发');
        expect(fetchImpl).not.toHaveBeenCalled();
        await pending;
    });

    test('replaces a CSV locale alias when online translation is available', async () => {
        const candidate = new TagData('blue_hair', 0, 1, ['蓝发'], TagSource.Danbooru);
        autoCompleteData.danbooru.sortedTags.push(candidate);
        autoCompleteData.danbooru.tagMap.set(candidate.tag, candidate);
        autoCompleteData.danbooru.tagIndexMap.set(candidate.tag, 0);
        autoCompleteData.danbooru.aliasMap.set('蓝发', candidate.tag);
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ translations: { blue_hair: '蓝色头发' } }),
        });

        await resolveCandidateTranslations([candidate], 'zh', { fetchImpl });

        expect(candidate.alias).toContain('蓝色头发');
        expect(candidate.alias).not.toContain('蓝发');
        expect(autoCompleteData.danbooru.aliasMap.has('蓝发')).toBe(false);
    });

    test('adds resolved text to display aliases and the searchable index', async () => {
        const candidate = new TagData('blue_hair', 0, 100, [], TagSource.Danbooru);
        autoCompleteData.danbooru.sortedTags.push(candidate);
        autoCompleteData.danbooru.tagMap.set(candidate.tag, candidate);
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ translations: { blue_hair: '蓝发' } }),
        });
        await resolveCandidateTranslations([candidate], 'zh', { fetchImpl });
        await waitForDeferredIndexing();
        expect(candidate.alias).toContain('蓝发');
        expect(autoCompleteData.danbooru.aliasMap.get('蓝发')).toBe('blue_hair');
        expect(autoCompleteData.danbooru.flexSearchDocument.update).not.toHaveBeenCalled();
        const translatedIds = autoCompleteData.danbooru.translationSearchDocuments.get('zh').search('蓝发', {
            field: ['alias'],
            merge: true,
        }).map(result => result.id);
        expect(translatedIds).toContain(0);
    });

    test('does not reindex an unchanged cached translation', async () => {
        const candidate = new TagData('blue_hair', 0, 100, [], TagSource.Danbooru);
        autoCompleteData.danbooru.sortedTags.push(candidate);
        autoCompleteData.danbooru.tagMap.set(candidate.tag, candidate);
        autoCompleteData.danbooru.tagIndexMap.set(candidate.tag, 0);
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ translations: { blue_hair: '蓝发' } }),
        });

        await resolveCandidateTranslations([candidate], 'zh', { fetchImpl });
        await waitForDeferredIndexing();
        const translationIndex = autoCompleteData.danbooru.translationSearchDocuments.get('zh');
        const addSpy = jest.spyOn(translationIndex, 'add');

        await resolveCandidateTranslations([candidate], 'zh', { fetchImpl });
        __test__.flushIndexOperations();

        expect(addSpy).not.toHaveBeenCalled();
        expect(autoCompleteData.danbooru.flexSearchDocument.update).not.toHaveBeenCalled();
    });

    test('restores a translated online tag from the persistent catalog', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                items: [{
                    tag_name: 'new_online_tag',
                    text: '在线标签',
                    category: 4,
                    post_count: 12,
                    origin: 'danbooru_api',
                }],
            }),
        });
        await loadTranslationCatalog('zh', { fetchImpl });
        await waitForDeferredIndexing();
        const restored = autoCompleteData.danbooru.tagMap.get('new_online_tag');
        expect(restored).toMatchObject({ origin: 'danbooru_api', count: 12 });
        expect(restored.alias).toContain('在线标签');
        expect(autoCompleteData.danbooru.flexSearchDocument.add).toHaveBeenCalled();
    });

    test('does not restore legacy zero-count online tags from the persistent catalog', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                items: [{
                    tag_name: '1gir-',
                    text: '无效标签',
                    category: 0,
                    post_count: 0,
                    origin: 'danbooru_api',
                }],
            }),
        });

        await loadTranslationCatalog('zh', { fetchImpl });

        expect(autoCompleteData.danbooru.tagMap.has('1gir-')).toBe(false);
        expect(__test__.translationCache.has(__test__.cacheKey('zh', '1gir-'))).toBe(false);
    });

    test('does not restore online-only catalog tags when Danbooru completion is disabled', async () => {
        updateOnlineServiceFeatures({ danbooru_completion: false, translation: true });
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                items: [{
                    tag_name: 'online_only_tag',
                    text: '在线标签',
                    category: 0,
                    post_count: 10,
                    origin: 'danbooru_api',
                }],
            }),
        });

        await loadTranslationCatalog('zh', { fetchImpl });

        expect(autoCompleteData.danbooru.tagMap.has('online_only_tag')).toBe(false);
    });

    test('never sends model candidates to translation', async () => {
        const fetchImpl = jest.fn();
        const candidate = new TagData('<lora:test>', 0, 0, [], 'lora');
        await resolveCandidateTranslations([candidate], 'zh', { fetchImpl });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('translates ordinary e621 candidates too', async () => {
        const candidate = new TagData('female', 0, 100, [], TagSource.E621);
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ translations: { female: '女性' } }),
        });

        await resolveCandidateTranslations([candidate], 'zh', { fetchImpl });

        expect(candidate.alias).toContain('女性');
        expect(JSON.parse(fetchImpl.mock.calls[0][1].body).tags[0].source).toBe('e621');
    });

    test('restores a cached translation into every matching booru index', async () => {
        const danbooru = new TagData('shared_tag', 0, 100, [], TagSource.Danbooru);
        const e621 = new TagData('shared_tag', 0, 80, [], TagSource.E621);
        autoCompleteData.danbooru.sortedTags.push(danbooru);
        autoCompleteData.danbooru.tagMap.set(danbooru.tag, danbooru);
        autoCompleteData.e621 = {
            sortedTags: [e621],
            tagMap: new Map([[e621.tag, e621]]),
            aliasMap: new Map(),
            tagIndexMap: new Map([[e621.tag, 0]]),
            flexSearchDocument: { add: jest.fn(), update: jest.fn() },
            translationSearchDocuments: new Map(),
            translationIndexTexts: new Map(),
        };
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                items: [{ tag_name: 'shared_tag', text: '共享标签', origin: 'local' }],
            }),
        });

        await loadTranslationCatalog('zh', { fetchImpl });

        expect(danbooru.alias).toContain('共享标签');
        expect(e621.alias).toContain('共享标签');
    });

    test('does not resolve candidates when automatic translation is disabled', async () => {
        updateOnlineServiceFeatures({ danbooru_completion: true, translation: false });
        const fetchImpl = jest.fn();
        const candidate = new TagData('blue_hair', 0, 100, [], TagSource.Danbooru);

        await resolveCandidateTranslations([candidate], 'zh', { fetchImpl });

        expect(fetchImpl).not.toHaveBeenCalled();
        expect(candidate.alias).toEqual([]);
    });

    test('applies one resolved tag translation to candidates from every booru source', async () => {
        const danbooru = new TagData('shared_tag', 0, 100, [], TagSource.Danbooru);
        const e621 = new TagData('shared_tag', 0, 80, [], TagSource.E621);
        autoCompleteData.e621 = {
            sortedTags: [e621],
            tagMap: new Map([[e621.tag, e621]]),
            aliasMap: new Map(),
            tagIndexMap: new Map([[e621.tag, 0]]),
            flexSearchDocument: { add: jest.fn(), update: jest.fn() },
            translationSearchDocuments: new Map(),
            translationIndexTexts: new Map(),
        };
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ translations: { shared_tag: '共享标签' } }),
        });

        await resolveCandidateTranslations([danbooru, e621], 'zh', { fetchImpl });

        expect(danbooru.alias).toContain('共享标签');
        expect(e621.alias).toContain('共享标签');
    });

    test('translates large preloaded lists in bounded concurrent batches', async () => {
        const candidates = Array.from({ length: 120 }, (_, index) =>
            new TagData(`tag_${index}`, 0, 120 - index, [], TagSource.Danbooru));
        let activeRequests = 0;
        let maxActiveRequests = 0;
        const fetchImpl = jest.fn().mockImplementation(async (_url, options) => {
            activeRequests++;
            maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
            const tags = JSON.parse(options.body).tags;
            await Promise.resolve();
            activeRequests--;
            return {
                ok: true,
                json: async () => ({
                    translations: Object.fromEntries(tags.map(item => [item.name, `translated_${item.name}`])),
                }),
            };
        });

        await resolveCandidateTranslations(candidates, 'zh', { fetchImpl });

        expect(fetchImpl).toHaveBeenCalledTimes(3);
        expect(maxActiveRequests).toBe(3);
        expect(candidates[119].alias).toContain('translated_tag_119');
    });
});
