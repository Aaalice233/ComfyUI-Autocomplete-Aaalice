import { jest } from '@jest/globals';
import {
    __test__,
    ensureChineseDictionary,
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

    test('searches only Han queries in Simplified Chinese and maps tag metadata', async () => {
        const fetchImpl = jest.fn(async () => ({
            ok: true,
            json: async () => ({
                results: [{
                    name: 'magical_girl',
                    category: 0,
                    cn_name: '魔法少女',
                    post_count: 100000,
                }],
            }),
        }));

        expect(await searchChineseDictionaryCandidates('girl', {
            locale: 'zh',
            fetchImpl,
        })).toEqual([]);
        const results = await searchChineseDictionaryCandidates('少女', {
            locale: 'zh',
            fetchImpl,
        });

        expect(results[0]).toMatchObject({
            tag: 'magical_girl',
            alias: ['魔法少女'],
            origin: 'chinese_dictionary',
            count: 100000,
        });
    });
});
