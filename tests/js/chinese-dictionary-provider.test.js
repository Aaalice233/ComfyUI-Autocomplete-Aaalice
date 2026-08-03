import { jest } from '@jest/globals';
import {
    __test__,
    ensureChineseDictionary,
    getChineseDictionaryStatus,
    invalidateChineseDictionarySearchCache,
    isChineseCompletionQuery,
    searchChineseDictionaryCandidates,
} from '../../web/js/integrations/chinese-dictionary-provider.js';

describe('Simplified Chinese dictionary provider', () => {
    beforeEach(() => {
        __test__.reset();
    });

    test('automatically ensures the dictionary only for Simplified Chinese', async () => {
        const fetchImpl = jest.fn(async () => ({
            ok: true,
            json: async () => ({ state: 'downloading' }),
        }));

        await ensureChineseDictionary('en', { fetchImpl });
        await ensureChineseDictionary('zh-TW', { fetchImpl });
        expect(fetchImpl).not.toHaveBeenCalled();

        await ensureChineseDictionary('zh-CN', { fetchImpl });
        await ensureChineseDictionary('zh', { fetchImpl });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl).toHaveBeenCalledWith(
            '/autocomplete-plus/chinese-dictionary/ensure',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    test('loads dictionary status with an abort signal', async () => {
        const fetchImpl = jest.fn(async () => ({
            ok: true,
            json: async () => ({ state: 'ready', installed: true }),
        }));
        const controller = new AbortController();

        await expect(getChineseDictionaryStatus({ fetchImpl, signal: controller.signal }))
            .resolves.toEqual({ state: 'ready', installed: true });
        expect(fetchImpl).toHaveBeenCalledWith(
            '/autocomplete-plus/chinese-dictionary/status',
            expect.objectContaining({ signal: controller.signal }),
        );
    });

    test('searches only Han queries in Simplified Chinese and maps tag metadata', async () => {
        const fetchImpl = jest.fn(async () => ({
            ok: true,
            json: async () => ({
                results: [{
                    name: 'magical_girl',
                    category: 0,
                    cn_name: '魔法少女',
                    post_count: 100000,
                    match_type: 'exact',
                    source: 'ffdkj',
                }],
            }),
        }));

        expect(await searchChineseDictionaryCandidates('girl', {
            locale: 'zh',
            fetchImpl,
            debounceMs: 0,
        })).toEqual([]);
        const results = await searchChineseDictionaryCandidates('少女', {
            locale: 'zh',
            fetchImpl,
            debounceMs: 0,
        });

        expect(results[0]).toMatchObject({
            tag: 'magical_girl',
            alias: ['魔法少女'],
            origin: 'chinese_dictionary',
            count: 100000,
            chineseMatchType: 'exact',
            matchedChineseText: '魔法少女',
        });
        expect(results[0].resolvedTranslationSources.get('zh')).toBe('ffdkj');
    });

    test('keeps Chinese autocomplete independent from translation and locale settings', async () => {
        expect(isChineseCompletionQuery('无职转生', 'zh-CN', true)).toBe(true);
        expect(isChineseCompletionQuery('无职转生', 'zh-CN', false)).toBe(false);
        expect(isChineseCompletionQuery('mushoku_tensei', 'zh-CN', true)).toBe(false);
        expect(isChineseCompletionQuery('无职转生', 'en', true)).toBe(false);
    });

    test('normalizes and caches searches without sharing mutable candidates', async () => {
        const fetchImpl = jest.fn(async () => ({
            ok: true,
            json: async () => ({
                results: [{
                    name: 'mushoku_tensei',
                    category: 3,
                    cn_name: '无职转生',
                    post_count: 8284,
                    match_type: 'exact',
                    source: 'ffdkj',
                }],
            }),
        }));

        const first = await searchChineseDictionaryCandidates('  无职转生  ', {
            locale: 'zh',
            fetchImpl,
            debounceMs: 0,
        });
        first[0].alias.push('mutated');
        const second = await searchChineseDictionaryCandidates('无职转生', {
            locale: 'zh',
            fetchImpl,
            debounceMs: 0,
        });

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(second[0].alias).toEqual(['无职转生']);
        invalidateChineseDictionarySearchCache();
        await searchChineseDictionaryCandidates('无职转生', {
            locale: 'zh',
            fetchImpl,
            debounceMs: 0,
        });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    test('does not start a delayed search after its request is aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        const fetchImpl = jest.fn();

        await expect(searchChineseDictionaryCandidates('无职转生', {
            locale: 'zh',
            fetchImpl,
            signal: controller.signal,
        })).resolves.toEqual([]);
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
