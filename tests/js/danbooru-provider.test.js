import { jest } from '@jest/globals';
import {
    clearDanbooruSessionCache,
    searchDanbooruCandidates,
    searchDanbooruRelatedTags,
    __test__,
} from '../../web/js/integrations/danbooru-provider.js';
import { updateOnlineServiceFeatures } from '../../web/js/online-service-state.js';

describe('Danbooru fallback provider', () => {
    beforeEach(() => {
        __test__.cache.clear();
        __test__.relatedCache.clear();
        updateOnlineServiceFeatures({ danbooru_completion: true, translation: true });
    });

    test('maps valid backend results and marks them as online-only candidates', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                results: [
                    { name: 'blue_hair', category: 0, post_count: 100 },
                    { name: 'blue_hair-', category: 0, post_count: 0 },
                ],
                page_info: { has_more: true },
                cache: { state: 'fresh' },
            }),
        });
        const resultPage = await searchDanbooruCandidates('blue_ha', { fetchImpl, limit: 4, page: 2 });
        expect(resultPage.candidates).toHaveLength(1);
        expect(resultPage.candidates[0]).toMatchObject({
            tag: 'blue_hair',
            category: 0,
            count: 100,
            source: 'danbooru',
            origin: 'danbooru_api',
        });
        expect(fetchImpl.mock.calls[0][0]).toContain('limit=4');
        expect(fetchImpl.mock.calls[0][0]).toContain('page=2');
        expect(resultPage.hasMore).toBe(true);
        expect(resultPage.cacheState).toBe('fresh');
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

    test('loads a large online snapshot with one bounded request', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });

        await searchDanbooruCandidates('blue', { fetchImpl, limit: 500 });

        expect(fetchImpl.mock.calls[0][0]).toContain('limit=200');
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    test('can clear the browser-level completion cache independently', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
        await searchDanbooruCandidates('silver', { fetchImpl, limit: 3 });
        clearDanbooruSessionCache();
        await searchDanbooruCandidates('silver', { fetchImpl, limit: 3 });

        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    test('skips short queries and keeps failures silent', async () => {
        const fetchImpl = jest.fn().mockRejectedValue(new Error('offline'));
        await expect(searchDanbooruCandidates('a', { fetchImpl }))
            .resolves.toMatchObject({ candidates: [] });
        await expect(searchDanbooruCandidates('ab', { fetchImpl }))
            .resolves.toMatchObject({ candidates: [] });
    });

    test('does not call the backend when Danbooru completion is disabled', async () => {
        updateOnlineServiceFeatures({ danbooru_completion: false, translation: true });
        const fetchImpl = jest.fn();

        const result = await searchDanbooruCandidates('blue', { fetchImpl });

        expect(result).toMatchObject({ candidates: [], hasMore: false, cacheState: 'disabled' });
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('returns an empty page object when the backend request fails', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({ ok: false });

        await expect(searchDanbooruCandidates('blue', { fetchImpl })).resolves.toEqual({
            candidates: [],
            hasMore: false,
            cacheState: 'error',
        });
    });

    test('maps one complete related-tag snapshot and preserves Jaccard scores', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                results: [
                    { name: 'sensei_(blue_archive)', category: 4, post_count: 9000, similarity: 0.42 },
                    { name: 'invalid', category: 0, post_count: 0, similarity: 0.2 },
                ],
                cache: { state: 'refreshed' },
            }),
        });

        const resultPage = await searchDanbooruRelatedTags('blue_archive', { fetchImpl });

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl.mock.calls[0][0]).toContain('limit=500');
        expect(resultPage.cacheState).toBe('refreshed');
        expect(resultPage.candidates).toHaveLength(1);
        expect(resultPage.candidates[0]).toMatchObject({
            tag: 'sensei_(blue_archive)',
            category: 4,
            count: 9000,
            similarity: 0.42,
            origin: 'danbooru_api',
        });
    });

    test('caches related-tag snapshots separately from completion pages', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ results: [] }),
        });

        await searchDanbooruCandidates('blue_archive', { fetchImpl, limit: 10 });
        await searchDanbooruRelatedTags('blue_archive', { fetchImpl, limit: 10 });
        await searchDanbooruRelatedTags('blue_archive', { fetchImpl, limit: 10 });

        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    test('does not request related tags when Danbooru supplementation is disabled', async () => {
        updateOnlineServiceFeatures({ danbooru_completion: false, translation: true });
        const fetchImpl = jest.fn();

        const result = await searchDanbooruRelatedTags('blue_archive', { fetchImpl });

        expect(result.cacheState).toBe('disabled');
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});
