import { jest } from '@jest/globals';
import { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { TextEncoder as NodeTextEncoder } from 'node:util';
import { TagData, TagSource, autoCompleteData } from '../../web/js/data.js';
import {
    getCandidateTranslationState,
    loadTranslationCatalog,
    resolveCandidateTranslations,
    resolveCandidateTranslationsProgressively,
    __test__,
} from '../../web/js/integrations/translation-provider.js';
import { updateOnlineServiceFeatures } from '../../web/js/online-service-state.js';

function resetData() {
    updateOnlineServiceFeatures({ danbooru_completion: true, translation: true });
    __test__.flushIndexOperations();
    for (const key of Object.keys(autoCompleteData)) delete autoCompleteData[key];
    __test__.translationCache.clear();
    __test__.translationStates.clear();
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

    test('exposes pending and translated states while a request is in flight', async () => {
        const candidate = new TagData('long_character_tag', 4, 100, [], TagSource.Danbooru);
        let release;
        const fetchImpl = jest.fn(() => new Promise(resolve => {
            release = () => resolve({
                ok: true,
                json: async () => ({ translations: { long_character_tag: '长角色标签' } }),
            });
        }));

        const pending = resolveCandidateTranslations([candidate], 'zh', { fetchImpl });
        expect(getCandidateTranslationState(candidate, 'zh')).toBe('pending');

        release();
        await pending;
        expect(getCandidateTranslationState(candidate, 'zh')).toBe('translated');
    });

    test('renders each streamed translation batch without waiting for scrolling or job completion', async () => {
        const first = new TagData('first_tag', 0, 100, [], TagSource.Danbooru);
        const second = new TagData('second_tag', 0, 90, [], TagSource.Danbooru);
        const encoder = new NodeTextEncoder();
        let controller;
        const response = {
            ok: true,
            body: new NodeReadableStream({
                start(streamController) {
                    controller = streamController;
                },
            }),
        };
        const onStateChange = jest.fn();
        const pending = resolveCandidateTranslations(
            [first, second],
            'zh',
            { fetchImpl: jest.fn().mockResolvedValue(response), onStateChange },
        );

        controller.enqueue(encoder.encode('{"translations":{"first_tag":"第一项"}}\n'));
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(first.alias).toContain('第一项');
        expect(getCandidateTranslationState(first, 'zh')).toBe('translated');
        expect(getCandidateTranslationState(second, 'zh')).toBe('pending');

        controller.enqueue(encoder.encode('{"translations":{"second_tag":"第二项"}}\n{"done":true}\n'));
        controller.close();
        await pending;

        expect(second.alias).toContain('第二项');
        expect(getCandidateTranslationState(second, 'zh')).toBe('translated');
        expect(onStateChange).toHaveBeenCalled();
    });

    test('keeps completed streamed rows translated when a later stream chunk fails', async () => {
        const first = new TagData('first_tag', 0, 100, [], TagSource.Danbooru);
        const second = new TagData('second_tag', 0, 90, [], TagSource.Danbooru);
        const encoder = new NodeTextEncoder();
        const response = {
            ok: true,
            body: new NodeReadableStream({
                start(controller) {
                    controller.enqueue(encoder.encode(
                        '{"translations":{"first_tag":"第一项"}}\ninvalid-json\n',
                    ));
                    controller.close();
                },
            }),
        };

        await resolveCandidateTranslations(
            [first, second],
            'zh',
            { fetchImpl: jest.fn().mockResolvedValue(response) },
        );

        expect(getCandidateTranslationState(first, 'zh')).toBe('translated');
        expect(getCandidateTranslationState(second, 'zh')).toBe('failed');
    });

    test('stops the loading indicator for a failed batch while later batches continue', async () => {
        const failed = new TagData('failed_tag', 0, 100, [], TagSource.Danbooru);
        const slower = new TagData('slower_tag', 0, 90, [], TagSource.Danbooru);
        const encoder = new NodeTextEncoder();
        let controller;
        const response = {
            ok: true,
            body: new NodeReadableStream({
                start(streamController) {
                    controller = streamController;
                },
            }),
        };
        const pending = resolveCandidateTranslations(
            [failed, slower],
            'zh',
            { fetchImpl: jest.fn().mockResolvedValue(response) },
        );

        controller.enqueue(encoder.encode(
            '{"translations":{},"completed":["failed_tag"]}\n',
        ));
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(getCandidateTranslationState(failed, 'zh')).toBe('failed');
        expect(getCandidateTranslationState(slower, 'zh')).toBe('pending');

        controller.enqueue(encoder.encode(
            '{"translations":{"slower_tag":"较慢项"},"completed":["slower_tag"]}\n{"done":true}\n',
        ));
        controller.close();
        await pending;
        expect(getCandidateTranslationState(slower, 'zh')).toBe('translated');
    });

    test('lets a current view subscribe to tags already pending for an older view', async () => {
        const candidate = new TagData('shared_pending_tag', 0, 100, [], TagSource.Danbooru);
        let releaseOlderRequest;
        const olderFetch = jest.fn(() => new Promise(resolve => {
            releaseOlderRequest = () => resolve({
                ok: true,
                json: async () => ({ translations: { shared_pending_tag: '旧视图结果' } }),
            });
        }));
        const olderRequest = resolveCandidateTranslations([candidate], 'zh', { fetchImpl: olderFetch });
        expect(getCandidateTranslationState(candidate, 'zh')).toBe('pending');

        const currentFetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ translations: { shared_pending_tag: '当前视图结果' } }),
        });
        await resolveCandidateTranslationsProgressively(
            [candidate],
            'zh',
            { fetchImpl: currentFetch },
        );

        expect(currentFetch).toHaveBeenCalledTimes(1);
        expect(candidate.alias).toContain('当前视图结果');
        releaseOlderRequest();
        await olderRequest;
    });

    test('progressively backfills untranslated rows beyond the priority window', async () => {
        const priority = new TagData('priority_tag', 0, 30, ['优先旧译'], TagSource.Danbooru);
        const localized = new TagData('localized_tag', 0, 20, ['已有译文'], TagSource.Danbooru);
        const missing = new TagData('missing_tag', 0, 10, [], TagSource.Danbooru);
        const fetchImpl = jest.fn(async (_url, options) => {
            const tags = JSON.parse(options.body).tags;
            return {
                ok: true,
                json: async () => ({
                    translations: Object.fromEntries(tags.map(item => [item.name, `译_${item.name}`])),
                }),
            };
        });

        await resolveCandidateTranslationsProgressively(
            [priority, localized, missing],
            'zh',
            { fetchImpl, priorityLimit: 1 },
        );

        const requested = fetchImpl.mock.calls.flatMap(([, options]) =>
            JSON.parse(options.body).tags.map(item => item.name));
        expect(requested).toEqual(['priority_tag', 'missing_tag']);
        expect(missing.alias).toContain('译_missing_tag');
        expect(getCandidateTranslationState(localized, 'zh')).toBe('idle');
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

    test('submits the complete prioritized queue for backend-controlled concurrency', async () => {
        const candidates = Array.from({ length: 320 }, (_, index) =>
            new TagData(`tag_${index}`, 0, 320 - index, [], TagSource.Danbooru));
        const fetchImpl = jest.fn().mockImplementation(async (_url, options) => {
            const tags = JSON.parse(options.body).tags;
            return {
                ok: true,
                json: async () => ({
                    translations: Object.fromEntries(tags.map(item => [item.name, `translated_${item.name}`])),
                }),
            };
        });

        await resolveCandidateTranslationsProgressively(
            candidates,
            'zh',
            { fetchImpl, priorityLimit: 200 },
        );

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(JSON.parse(fetchImpl.mock.calls[0][1].body).tags).toHaveLength(320);
        expect(candidates[319].alias).toContain('translated_tag_319');
    });
});
