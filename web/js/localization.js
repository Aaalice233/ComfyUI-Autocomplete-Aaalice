const UI_TEXT = {
    en: {
        formatPromptCommand: 'Format prompt',
        relatedTags: 'Related tags',
        tagsRelatedTo: 'Tags related to:',
        toggleRelatedTagsLayout: 'Switch between vertical and horizontal layout',
        pinRelatedTags: 'Pin related tags',
        unpinRelatedTags: 'Unpin related tags',
        initializingCooccurrence: 'Initializing co-occurrence data… [{progress}%]',
        noRelatedTags: 'No related tags found',
        openWikiPage: 'Open Wiki page',
        count: 'Post count',
        category: 'Category',
        alias: 'Alias',
        danbooruOnlineFallback: 'Provided by Danbooru online fallback',
        similarity: 'Similarity',
    },
    zh: {
        formatPromptCommand: '格式化提示词',
        relatedTags: '共现标签',
        tagsRelatedTo: '共现标签：',
        toggleRelatedTagsLayout: '切换横向或纵向布局',
        pinRelatedTags: '固定共现标签',
        unpinRelatedTags: '取消固定共现标签',
        initializingCooccurrence: '正在初始化共现数据… [{progress}%]',
        noRelatedTags: '未找到共现标签',
        openWikiPage: '打开 Wiki 页面',
        count: '投稿数',
        category: '类别',
        alias: '别名',
        danbooruOnlineFallback: '由 Danbooru 在线兜底补充',
        similarity: '相似度',
    },
    'zh-TW': {
        formatPromptCommand: '格式化提示詞',
        relatedTags: '共現標籤',
        tagsRelatedTo: '共現標籤：',
        toggleRelatedTagsLayout: '切換橫向或縱向版面',
        pinRelatedTags: '固定共現標籤',
        unpinRelatedTags: '取消固定共現標籤',
        initializingCooccurrence: '正在初始化共現資料… [{progress}%]',
        noRelatedTags: '找不到共現標籤',
        openWikiPage: '開啟 Wiki 頁面',
        count: '投稿數',
        category: '類別',
        alias: '別名',
        danbooruOnlineFallback: '由 Danbooru 線上備援補充',
        similarity: '相似度',
    },
    ja: {
        formatPromptCommand: 'プロンプトを整形',
        relatedTags: '関連タグ',
        tagsRelatedTo: '関連タグ：',
        toggleRelatedTagsLayout: '縦横レイアウトを切り替え',
        pinRelatedTags: '関連タグを固定',
        unpinRelatedTags: '関連タグの固定を解除',
        initializingCooccurrence: '共起データを初期化中… [{progress}%]',
        noRelatedTags: '関連タグが見つかりません',
        openWikiPage: 'Wiki ページを開く',
        count: '投稿数',
        category: 'カテゴリ',
        alias: '別名',
        danbooruOnlineFallback: 'Danbooru オンライン補完から取得',
        similarity: '類似度',
    },
};

let interfaceApp = null;

export function setInterfaceLocalizationApp(app) {
    interfaceApp = app;
}

export function normalizeInterfaceLocale(locale) {
    const normalized = String(locale || 'en').replaceAll('_', '-').toLowerCase();
    if (['zh-tw', 'zh-hant', 'zh-hk'].includes(normalized)) return 'zh-TW';
    if (normalized.startsWith('zh')) return 'zh';
    if (normalized.startsWith('ja')) return 'ja';
    return 'en';
}

export function getCurrentInterfaceLocale() {
    const app = interfaceApp ?? globalThis.window?.app;
    const locale = app?.extensionManager?.setting?.get?.('Comfy.Locale')
        ?? app?.ui?.settings?.getSettingValue?.('Comfy.Locale')
        ?? globalThis.document?.documentElement?.lang
        ?? globalThis.navigator?.language
        ?? 'en';
    return normalizeInterfaceLocale(locale);
}

export function filterAliasesForLocale(aliases, locale = getCurrentInterfaceLocale()) {
    if (!Array.isArray(aliases)) return [];

    const normalizedLocale = normalizeInterfaceLocale(locale);
    const normalizedAliases = [...new Set(aliases.map(alias => String(alias).trim()).filter(Boolean))];
    const hasLatin = value => /[A-Za-z]/u.test(value);
    const hasHan = value => /\p{Script=Han}/u.test(value);
    const hasKana = value => /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value);
    const hasHangul = value => /\p{Script=Hangul}/u.test(value);
    if (normalizedLocale === 'en') {
        return normalizedAliases.filter(value => hasLatin(value) && !hasHan(value) && !hasKana(value) && !hasHangul(value));
    }
    if (normalizedLocale === 'ja') {
        const kanaAliases = normalizedAliases.filter(hasKana);
        return kanaAliases.length > 0
            ? kanaAliases
            : normalizedAliases.filter(value => hasHan(value) && !hasLatin(value) && !hasHangul(value));
    }
    return normalizedAliases.filter(value => hasHan(value) && !hasKana(value) && !hasHangul(value));
}

export function getInterfaceText(key, parameters = {}, locale = getCurrentInterfaceLocale()) {
    const normalizedLocale = normalizeInterfaceLocale(locale);
    const template = UI_TEXT[normalizedLocale]?.[key] ?? UI_TEXT.en[key] ?? key;
    return String(template).replace(/\{(\w+)\}/g, (match, name) =>
        Object.hasOwn(parameters, name) ? String(parameters[name]) : match);
}
