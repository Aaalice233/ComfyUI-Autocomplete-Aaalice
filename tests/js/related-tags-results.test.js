import { TagData, TagSource, autoCompleteData } from '../../web/js/data.js';
import { mergeRelatedTagCandidates, searchRelatedTags } from '../../web/js/related-tags.js';

describe('co-occurrence result snapshots', () => {
    beforeEach(() => {
        const tagMap = new Map();
        const cooccurrences = new Map();
        tagMap.set('base_tag', new TagData('base_tag', 0, 100_000, [], TagSource.Danbooru));

        for (let index = 0; index < 40; index++) {
            const tag = `related_${index}`;
            tagMap.set(tag, new TagData(tag, 0, 10_000 - index, [], TagSource.Danbooru));
            cooccurrences.set(tag, 1_000 - index);
        }

        autoCompleteData[TagSource.Danbooru] = {
            initialized: true,
            tagMap,
            cooccurrenceMap: new Map([['base_tag', cooccurrences]]),
        };
    });

    test('returns the complete bounded snapshot in one calculation', () => {
        expect(searchRelatedTags('base_tag', 40)).toHaveLength(40);
    });

    test('reuses the ranked co-occurrence cache across safety limits', () => {
        const limited = searchRelatedTags('base_tag', 15);
        const complete = searchRelatedTags('base_tag', 40);

        expect(complete[0]).toBe(limited[0]);
        expect(complete.slice(0, 15)).toEqual(limited);
    });

    test('appends API-only candidates without reordering or replacing local rows', () => {
        const local = searchRelatedTags('base_tag', 3);
        const online = [
            {
                ...local[1],
                similarity: 0.99,
                origin: 'danbooru_api',
                origins: ['danbooru_api'],
            },
            new TagData('online_only', 4, 500, [], TagSource.Danbooru, 'danbooru_api'),
        ];
        online[1].similarity = 0.25;

        const merged = mergeRelatedTagCandidates(local, online, 10);

        expect(merged.slice(0, 3).map(candidate => candidate.tag))
            .toEqual(local.map(candidate => candidate.tag));
        expect(merged[1].origins).toEqual(['local', 'danbooru_api']);
        expect(merged.map(candidate => candidate.tag)).toEqual([
            ...local.map(candidate => candidate.tag),
            'online_only',
        ]);
    });

    test('applies the safety limit after local-first de-duplication', () => {
        const local = searchRelatedTags('base_tag', 3);
        const online = [
            new TagData('online_a', 0, 100, [], TagSource.Danbooru, 'danbooru_api'),
            new TagData('online_b', 0, 100, [], TagSource.Danbooru, 'danbooru_api'),
        ];

        expect(mergeRelatedTagCandidates(local, online, 4).map(candidate => candidate.tag)).toEqual([
            ...local.map(candidate => candidate.tag),
            'online_a',
        ]);
    });
});
