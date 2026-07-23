/** @jest-environment jsdom */

import {
    createTagCategoryIcon,
    createTagOriginMarker,
    createTagOriginMarkers,
    getTagCategoryEmoji,
    getTagCategoryIconKey,
    getTagCategoryLabel,
    normalizeInterfaceLocale,
    renderTagNameWithCategoryIcon,
} from '../../web/js/tag-presentation.js';

describe('tag category presentation', () => {
    test.each([
        ['general', 'general'],
        ['artist', 'artist'],
        ['unused', 'unused'],
        ['copyright', 'copyright'],
        ['character', 'character'],
        ['meta', 'meta'],
        ['species', 'species'],
        ['invalid', 'invalid'],
        ['lore', 'lore'],
        ['lora', 'lora'],
        ['embeddings', 'embeddings'],
        ['wildcard', 'wildcard'],
    ])('uses a distinct icon for %s', (categoryText, expectedIcon) => {
        expect(getTagCategoryIconKey({ categoryText })).toBe(expectedIcon);
    });

    test('falls back to the unknown icon for an unsupported category', () => {
        expect(getTagCategoryIconKey({ categoryText: 'future-category' })).toBe('unknown');
        expect(getTagCategoryEmoji({ categoryText: 'future-category' })).toBe('❔');
    });

    test.each([
        ['general', '🏷️'],
        ['artist', '🎨'],
        ['copyright', '🎞️'],
        ['character', '👤'],
        ['meta', '⚙️'],
        ['lora', '🧩'],
    ])('renders the %s category as an emoji with an accessible tooltip', (categoryText, emoji) => {
        const icon = createTagCategoryIcon({ categoryText, source: 'danbooru' });
        expect(icon.textContent).toBe(emoji);
        expect(icon.title).toContain('danbooru');
        expect(icon.getAttribute('aria-label')).toBe(icon.title);
    });

    test('keeps the English category and appends a localized note', () => {
        expect(getTagCategoryLabel('general', 'zh-CN')).toBe('general（通用）');
        expect(getTagCategoryLabel('copyright', 'zh-TW')).toBe('copyright（版權作品）');
        expect(getTagCategoryLabel('character', 'ja-JP')).toBe('character（キャラクター）');
        expect(getTagCategoryLabel('artist', 'en-US')).toBe('artist');
    });

    test('uses accessible markers for API, LoRA Manager, and CSV origins', () => {
        const marker = createTagOriginMarker({ origin: 'danbooru_api' });
        expect(marker.dataset.tagOrigin).toBe('danbooru_api');
        expect(marker.className).toBe('autocomplete-plus-origin-marker');
        expect(marker.textContent).toBe('API');
        expect(marker.getAttribute('aria-label')).toContain('Danbooru');

        const markers = createTagOriginMarkers({
            origin: 'csv',
            origins: ['csv', 'lora_manager', 'danbooru_api'],
        });
        expect(markers.map(item => item.textContent)).toEqual(['CSV', 'LM', 'API']);
        expect(markers.map(item => item.dataset.tagOrigin)).toEqual([
            'csv',
            'lora_manager',
            'danbooru_api',
        ]);
        expect(createTagOriginMarker({ origin: 'local' })).toBeNull();
    });

    test('can render a tag name without inline origin badges for dedicated source columns', () => {
        const element = document.createElement('span');
        renderTagNameWithCategoryIcon(element, {
            tag: 'aemeath_(wuthering_waves)',
            categoryText: 'character',
            source: 'danbooru',
            origins: ['csv', 'lora_manager', 'danbooru_api'],
        }, 'left', false);

        expect(element.querySelector('.autocomplete-plus-tag-text').textContent)
            .toBe('aemeath_(wuthering_waves)');
        expect(element.querySelectorAll('.autocomplete-plus-origin-marker')).toHaveLength(0);
    });

    test('normalizes supported ComfyUI locale variants', () => {
        expect(normalizeInterfaceLocale('zh_Hant')).toBe('zh-TW');
        expect(normalizeInterfaceLocale('zh-CN')).toBe('zh');
        expect(normalizeInterfaceLocale('ja-JP')).toBe('ja');
        expect(normalizeInterfaceLocale('ko-KR')).toBe('en');
    });
});
