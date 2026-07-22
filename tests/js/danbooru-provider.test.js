import { jest } from '@jest/globals';
import { searchDanbooruCandidates, __test__ } from '../../web/js/integrations/danbooru-provider.js';

describe('Danbooru fallback provider', () => {
    beforeEach(() => __test__.cache.clear());

    test('maps valid backend results and marks them as online-only candidates', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                results: [
                    { name: 'blue_hair', category: 0, post_count: 100 },
                    { name: 'blue_hair-', category: 0, post_count: 0 },
                ],
            }),
        });
        const results = await searchDanbooruCandidates('blue_ha', { fetchImpl, limit: 4, page: 2 });
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
            tag: 'blue_hair',
            category: 0,
            count: 100,
            source: 'danbooru',
            origin: 'danbooru_api',
        });
        expect(fetchImpl.mock.calls[0][0]).toContain('limit=4');
        expect(fetchImpl.mock.calls[0][0]).toContain('page=2');
    });

    test('uses the five-minute session cache for an identical query', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
        await searchDanbooruCandidates('silver', { fetchImpl, limit: 3 });
        await searchDanbooruCandidates('silver', { fetchImpl, limit: 3 });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    test('caches different result pages independently', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
        await searchDanbooruCandidates('silver', { fetchImpl, limit: 3, page: 1 });
        await searchDanbooruCandidates('silver', { fetchImpl, limit: 3, page: 2 });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    test('skips short queries and keeps failures silent', async () => {
        const fetchImpl = jest.fn().mockRejectedValue(new Error('offline'));
        await expect(searchDanbooruCandidates('a', { fetchImpl })).resolves.toEqual([]);
        await expect(searchDanbooruCandidates('ab', { fetchImpl })).resolves.toEqual([]);
    });
});
