import { TagData, TagSource, autoCompleteData } from '../../web/js/data.js';
import { searchRelatedTags } from '../../web/js/related-tags.js';

describe('co-occurrence pagination', () => {
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

    test('returns progressively larger pages without calculating them during typing', () => {
        expect(searchRelatedTags('base_tag', 15)).toHaveLength(15);
        expect(searchRelatedTags('base_tag', 30)).toHaveLength(30);
    });
});
