/** @jest-environment jsdom */

import { readFileSync } from 'node:fs';

import {
    filterAliasesForLocale,
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
        expect(getInterfaceText('noRelatedTags')).toBe('未找到共现标签');
        setInterfaceLocalizationApp(null);
    });

    test.each([
        ['en', ['long hair', 'blue_eyes']],
        ['zh', ['长发', '藍眼睛', '長髪']],
        ['zh-TW', ['长发', '藍眼睛', '長髪']],
        ['ja', ['ロングヘアー']],
    ])('filters displayed aliases for %s without changing the source list', (locale, expected) => {
        const aliases = ['long hair', '长发', '藍眼睛', 'ロングヘアー', '長髪', '긴 머리', 'blue_eyes'];
        expect(filterAliasesForLocale(aliases, locale)).toEqual(expected);
        expect(aliases).toHaveLength(7);
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
            'danbooruOnlineFallback',
            'loraManagerOrigin',
            'csvOrigin',
            'translatingTag',
            'similarity',
        ]) {
            expect(getInterfaceText(key, { progress: 0 }, locale)).not.toBe(key);
        }
    });

    test.each(['en', 'zh', 'zh-TW', 'ja'])('contains every registered setting for %s', locale => {
        const mainSource = readFileSync(new URL('../../web/js/main.js', import.meta.url), 'utf8');
        const settingsSource = mainSource.slice(mainSource.indexOf('settings: ['));
        const registeredKeys = [...settingsSource.matchAll(/id:\s*id\s*\+\s*["']([^"']+)["']/g)]
            .map(([, suffix]) => `AutocompletePlus${suffix.replaceAll('.', '_')}`);
        registeredKeys.push('AutocompletePlus_OnlineServices_Manager');

        const settings = JSON.parse(
            readFileSync(new URL(`../../locales/${locale}/settings.json`, import.meta.url), 'utf8'),
        );
        for (const key of registeredKeys) {
            expect(settings).toHaveProperty(key);
            expect(settings[key].name).toBeTruthy();
        }

        const main = JSON.parse(
            readFileSync(new URL(`../../locales/${locale}/main.json`, import.meta.url), 'utf8'),
        );
        expect(main.settingsCategories['Online Services']).toBeTruthy();
    });
});
