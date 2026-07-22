/** @jest-environment jsdom */

import {
    getInterfaceText,
    normalizeInterfaceLocale,
    setInterfaceLocalizationApp,
} from '../../web/js/localization.js';

describe('runtime UI localization', () => {
    test.each([
        ['zh_CN', 'zh'],
        ['zh-Hant', 'zh-TW'],
        ['zh-TW', 'zh-TW'],
        ['ja-JP', 'ja'],
        ['fr-FR', 'en'],
    ])('normalizes %s to %s', (input, expected) => {
        expect(normalizeInterfaceLocale(input)).toBe(expected);
    });

    test.each([
        ['en', 'Initializing co-occurrence data… [91%]'],
        ['zh', '正在初始化共现数据… [91%]'],
        ['zh-TW', '正在初始化共現資料… [91%]'],
        ['ja', '共起データを初期化中… [91%]'],
    ])('localizes parameterized loading text for %s', (locale, expected) => {
        expect(getInterfaceText('initializingCooccurrence', { progress: 91 }, locale)).toBe(expected);
    });

    test('falls back to English for unsupported locales and unknown locale variants', () => {
        expect(getInterfaceText('openWikiPage', {}, 'ko-KR')).toBe('Open Wiki page');
    });

    test('uses the current ComfyUI locale when no locale is passed', () => {
        setInterfaceLocalizationApp({ extensionManager: { setting: { get: () => 'zh-CN' } } });
        expect(getInterfaceText('noRelatedTags')).toBe('未找到相关标签');
        setInterfaceLocalizationApp(null);
    });

    test.each(['en', 'zh', 'zh-TW', 'ja'])('contains every runtime key for %s', locale => {
        for (const key of [
            'formatPromptCommand',
            'relatedTags',
            'tagsRelatedTo',
            'toggleRelatedTagsLayout',
            'pinRelatedTags',
            'unpinRelatedTags',
            'initializingCooccurrence',
            'noRelatedTags',
            'openWikiPage',
            'count',
            'category',
            'alias',
            'similarity',
        ]) {
            expect(getInterfaceText(key, { progress: 0 }, locale)).not.toBe(key);
        }
    });
});
