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
        similarity: 'Similarity',
    },
    zh: {
        formatPromptCommand: '格式化提示词',
        relatedTags: '相关标签',
        tagsRelatedTo: '相关标签：',
        toggleRelatedTagsLayout: '切换横向或纵向布局',
        pinRelatedTags: '固定相关标签',
        unpinRelatedTags: '取消固定相关标签',
        initializingCooccurrence: '正在初始化共现数据… [{progress}%]',
        noRelatedTags: '未找到相关标签',
        openWikiPage: '打开 Wiki 页面',
        count: '投稿数',
        category: '类别',
        alias: '别名',
        similarity: '相似度',
    },
    'zh-TW': {
        formatPromptCommand: '格式化提示詞',
        relatedTags: '相關標籤',
        tagsRelatedTo: '相關標籤：',
        toggleRelatedTagsLayout: '切換橫向或縱向版面',
        pinRelatedTags: '固定相關標籤',
        unpinRelatedTags: '取消固定相關標籤',
        initializingCooccurrence: '正在初始化共現資料… [{progress}%]',
        noRelatedTags: '找不到相關標籤',
        openWikiPage: '開啟 Wiki 頁面',
        count: '投稿數',
        category: '類別',
        alias: '別名',
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

export function getInterfaceText(key, parameters = {}, locale = getCurrentInterfaceLocale()) {
    const normalizedLocale = normalizeInterfaceLocale(locale);
    const template = UI_TEXT[normalizedLocale]?.[key] ?? UI_TEXT.en[key] ?? key;
    return String(template).replace(/\{(\w+)\}/g, (match, name) =>
        Object.hasOwn(parameters, name) ? String(parameters[name]) : match);
}
