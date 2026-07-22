import {
    getCurrentInterfaceLocale,
    normalizeInterfaceLocale,
} from './localization.js';

export { getCurrentInterfaceLocale, normalizeInterfaceLocale } from './localization.js';

const CATEGORY_ICON_KEYS = new Set([
    'general',
    'artist',
    'unused',
    'copyright',
    'character',
    'meta',
    'species',
    'invalid',
    'lore',
    'lora',
    'embeddings',
    'wildcard',
]);

const ENGLISH_CATEGORY_LABELS = {
    general: 'general',
    artist: 'artist',
    unused: 'unused',
    copyright: 'copyright',
    character: 'character',
    meta: 'meta',
    species: 'species',
    invalid: 'invalid',
    lore: 'lore',
    lora: 'LoRA model',
    embeddings: 'Embedding',
    wildcard: 'Wildcard',
    unknown: 'unknown',
};

const CATEGORY_TRANSLATIONS = {
    zh: {
        general: '通用', artist: '艺术家', unused: '未使用', copyright: '版权作品', character: '角色',
        meta: '元标签', species: '物种', invalid: '无效', lore: '设定', lora: 'LoRA 模型',
        embeddings: '嵌入模型', wildcard: '通配符', unknown: '未知',
    },
    'zh-TW': {
        general: '一般', artist: '繪師', unused: '未使用', copyright: '版權作品', character: '角色',
        meta: '元標籤', species: '物種', invalid: '無效', lore: '設定', lora: 'LoRA 模型',
        embeddings: '嵌入模型', wildcard: '萬用字元', unknown: '未知',
    },
    ja: {
        general: '一般', artist: 'アーティスト', unused: '未使用', copyright: '作品', character: 'キャラクター',
        meta: 'メタ', species: '種族', invalid: '無効', lore: '設定', lora: 'LoRA モデル',
        embeddings: '埋め込み', wildcard: 'ワイルドカード', unknown: '不明',
    },
};

export function getTagCategoryLabel(category, locale = getCurrentInterfaceLocale()) {
    const key = String(category || 'unknown').toLowerCase();
    const english = ENGLISH_CATEGORY_LABELS[key] || ENGLISH_CATEGORY_LABELS.unknown;
    const normalizedLocale = normalizeInterfaceLocale(locale);
    if (normalizedLocale === 'en') return english;
    const translation = CATEGORY_TRANSLATIONS[normalizedLocale]?.[key]
        || CATEGORY_TRANSLATIONS[normalizedLocale].unknown;
    return `${english}（${translation}）`;
}

export function getTagCategoryIconKey(tagData) {
    const category = String(tagData?.categoryText || 'unknown').toLowerCase();
    return CATEGORY_ICON_KEYS.has(category) ? category : 'unknown';
}

export function createTagCategoryIcon(tagData, className = '') {
    const category = String(tagData?.categoryText || 'unknown').toLowerCase();
    const iconKey = getTagCategoryIconKey(tagData);
    const label = getTagCategoryLabel(category);
    const source = String(tagData?.source || '').trim();
    const tooltip = source ? `${label} · ${source}` : label;

    const container = document.createElement('span');
    container.className = `autocomplete-plus-category-icon ${className}`.trim();
    container.dataset.tagCategory = category;
    container.title = tooltip;
    container.setAttribute('role', 'img');
    container.setAttribute('aria-label', tooltip);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#autocomplete-plus-category-icon-${iconKey}`);
    svg.appendChild(use);
    container.appendChild(svg);
    return container;
}

export function renderTagNameWithCategoryIcon(element, tagData, position = 'left') {
    element.textContent = '';
    const tagName = String(tagData?.tag || '');
    if (!['left', 'right'].includes(position)) {
        element.textContent = tagName;
        return;
    }

    const icon = createTagCategoryIcon(tagData);
    const text = document.createTextNode(tagName);
    if (position === 'left') {
        element.append(icon, text);
    } else {
        element.append(text, icon);
    }
}
