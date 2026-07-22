/** @jest-environment jsdom */

import {
    createTagCategoryIcon,
    getTagCategoryEmoji,
    getTagCategoryIconKey,
    getTagCategoryLabel,
    normalizeInterfaceLocale,
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

    test('normalizes supported ComfyUI locale variants', () => {
        expect(normalizeInterfaceLocale('zh_Hant')).toBe('zh-TW');
        expect(normalizeInterfaceLocale('zh-CN')).toBe('zh');
        expect(normalizeInterfaceLocale('ja-JP')).toBe('ja');
        expect(normalizeInterfaceLocale('ko-KR')).toBe('en');
    });
});
