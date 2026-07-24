import {
    getCandidateMatchTier,
    getNormalizedPopularity,
    mergeDuplicateCandidates,
    rankCompletionCandidates,
} from '../../web/js/candidate-ranking.js';
import { updateOnlineServiceFeatures } from '../../web/js/online-service-state.js';

function candidate(tag, source, count, alias = []) {
    return { tag, source, count, alias };
}

describe('unified autocomplete candidate ranking', () => {
    beforeEach(() => updateOnlineServiceFeatures({ danbooru_completion: true, translation: true }));

    test('orders matching tags by match precision before raw popularity', () => {
        const query = new Set(['blue']);
        const candidates = [
            candidate('ocean', 'e621', 10_000_000, ['deep_blue']),
            candidate('dark_blue_hair', 'danbooru', 5_000_000),
            candidate('azure', 'e621', 10_000_000, ['blue']),
            candidate('blue_hair', 'danbooru', 100),
            candidate('blue', 'danbooru', 1),
        ];

        expect(rankCompletionCandidates(candidates, query, {
            limit: 10,
            sourcePriority: ['danbooru', 'e621'],
            sourceMaxCounts: { danbooru: 10_000_000, e621: 10_000_000 },
        }).map(item => item.tag)).toEqual([
            'blue',
            'blue_hair',
            'azure',
            'dark_blue_hair',
            'ocean',
        ]);
    });

    test('removes persisted Danbooru API candidates when online completion is disabled', () => {
        updateOnlineServiceFeatures({ danbooru_completion: false, translation: true });
        const local = { ...candidate('blue_hair', 'danbooru', 100), origin: 'local' };
        const online = { ...candidate('blue_archive', 'danbooru', 90), origin: 'danbooru_api' };

        expect(rankCompletionCandidates([local, online], new Set(['blue']), { limit: 10 }))
            .toEqual([local]);
    });

    test('compares raw heat across sources', () => {
        const danbooru = candidate('1boy', 'danbooru', 1_000_000);
        const e621 = candidate('1girl', 'e621', 2_000_000);
        const ranked = rankCompletionCandidates([danbooru, e621], new Set(['1']), {
            limit: 10,
            sourcePriority: ['danbooru', 'e621'],
            sourceMaxCounts: { danbooru: 10_000_000, e621: 2_000_000 },
        });

        expect(ranked.map(item => item.tag)).toEqual(['1girl', '1boy']);
        expect(getNormalizedPopularity(e621, { e621: 2_000_000 })).toBe(1);
        expect(getNormalizedPopularity(danbooru, { danbooru: 10_000_000 })).toBeLessThan(1);
    });

    test('uses source priority only after heat and match quality tie', () => {
        const ranked = rankCompletionCandidates([
            candidate('test_e621', 'e621', 100),
            candidate('test_danbooru', 'danbooru', 100),
        ], new Set(['test']), {
            limit: 10,
            sourcePriority: ['danbooru', 'e621'],
            sourceMaxCounts: { danbooru: 100, e621: 100 },
        });

        expect(ranked.map(item => item.source)).toEqual(['danbooru', 'e621']);
    });

    test('filters legacy zero-count candidates restored from the Danbooru API', () => {
        const invalidOnline = {
            ...candidate('1gir-', 'danbooru', 0),
            origin: 'danbooru_api',
        };
        const localZeroCount = candidate('<lora:test>', 'lora', 0);

        expect(rankCompletionCandidates(
            [invalidOnline, localZeroCount],
            new Set(['1gir']),
            { limit: 10, sourcePriority: ['danbooru', 'lora'] },
        )).toEqual([localZeroCount]);
    });

    test('merges duplicate aliases without letting supplemental metadata replace CSV', () => {
        const merged = mergeDuplicateCandidates([
            { ...candidate('same_tag', 'danbooru', 100, ['first']), origin: 'csv', origins: ['csv'] },
            { ...candidate('SAME_TAG', 'danbooru', 150, ['second']), origin: 'lora_manager', origins: ['lora_manager'] },
            { ...candidate('same_tag', 'e621', 999, ['third']), origin: 'danbooru_api', origins: ['danbooru_api'] },
        ]);

        expect(merged).toHaveLength(1);
        expect(merged[0]).toMatchObject({
            tag: 'same_tag',
            source: 'danbooru',
            count: 100,
            alias: ['first', 'second', 'third'],
            origins: ['csv', 'lora_manager', 'danbooru_api'],
        });
    });

    test('does not merge API count or provenance when Danbooru supplementation is disabled', () => {
        updateOnlineServiceFeatures({ danbooru_completion: false, translation: true });
        const csv = {
            ...candidate('same_tag', 'danbooru', 100),
            origin: 'csv',
            origins: ['csv'],
        };
        const api = {
            ...candidate('same_tag', 'danbooru', 999),
            origin: 'danbooru_api',
            origins: ['danbooru_api'],
        };

        expect(rankCompletionCandidates([csv, api], new Set(['same']), { limit: 10 })[0])
            .toMatchObject({ count: 100, origins: ['csv'] });
    });

    test('selects CSV metadata even when supplemental duplicates arrive first', () => {
        const merged = mergeDuplicateCandidates([
            { ...candidate('same_tag', 'danbooru', 999, ['lm']), origin: 'lora_manager' },
            { ...candidate('same_tag', 'danbooru', 100, ['csv']), origin: 'csv' },
            { ...candidate('same_tag', 'danbooru', 5000, ['api']), origin: 'danbooru_api' },
        ]);
        expect(merged[0]).toMatchObject({
            origin: 'csv',
            count: 100,
            alias: ['csv', 'lm', 'api'],
        });
    });

    test('classifies direct and alias matches consistently', () => {
        const query = new Set(['1girl']);
        expect(getCandidateMatchTier(candidate('1girl', 'danbooru', 1), query)).toBe(5);
        expect(getCandidateMatchTier(candidate('1girl_solo', 'danbooru', 1), query)).toBe(4);
        expect(getCandidateMatchTier(candidate('female', 'e621', 1, ['1girl']), query)).toBe(3);
        expect(getCandidateMatchTier(candidate('solo_1girl', 'danbooru', 1), query)).toBe(2);
        expect(getCandidateMatchTier(candidate('woman', 'e621', 1, ['solo_1girl']), query)).toBe(1);
    });

    test('ranks model paths by the text after their notation prefix', () => {
        const ranked = rankCompletionCandidates([
            candidate('<lora:folder/style_extra>', 'lora', 0),
            candidate('<lora:style_main>', 'lora', 0),
        ], new Set(['<lora:style']), {
            limit: 10,
            sourcePriority: ['lora'],
        });

        expect(ranked.map(item => item.tag)).toEqual([
            '<lora:style_main>',
            '<lora:folder/style_extra>',
        ]);
    });
});
