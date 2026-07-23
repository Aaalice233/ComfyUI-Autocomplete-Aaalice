import {
    filterAliasesForLocale,
    getCurrentInterfaceLocale,
    getInterfaceText,
    normalizeInterfaceLocale,
} from './localization.js';
import { getCandidateOrigins } from './candidate-ranking.js';

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

const CATEGORY_EMOJIS = {
    general: '🏷️',
    artist: '🎨',
    unused: '🗃️',
    copyright: '🎞️',
    character: '👤',
    meta: '⚙️',
    species: '🐾',
    invalid: '⛔',
    lore: '📖',
    lora: '🧩',
    embeddings: '🧠',
    wildcard: '🎲',
    unknown: '❔',
};

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

export function getTagCategoryEmoji(tagData) {
    return CATEGORY_EMOJIS[getTagCategoryIconKey(tagData)];
}

export function createTagCategoryIcon(tagData, className = '') {
    const category = String(tagData?.categoryText || 'unknown').toLowerCase();
    const label = getTagCategoryLabel(category);
    const source = String(tagData?.source || '').trim();
    const tooltip = source ? `${label} · ${source}` : label;

    const container = document.createElement('span');
    container.className = `autocomplete-plus-category-icon ${className}`.trim();
    container.dataset.tagCategory = category;
    container.title = tooltip;
    container.setAttribute('role', 'img');
    container.setAttribute('aria-label', tooltip);
    container.textContent = getTagCategoryEmoji(tagData);
    return container;
}

const ORIGIN_MARKERS = {
    csv: { label: 'CSV', tooltipKey: 'csvOrigin' },
    lora_manager: { label: 'LM', tooltipKey: 'loraManagerOrigin' },
    danbooru_api: { label: 'API', tooltipKey: 'danbooruOnlineFallback' },
};
const ORIGIN_PRIORITY = ['csv', 'lora_manager', 'danbooru_api'];

function createOriginMarker(origin) {
    const markerConfig = ORIGIN_MARKERS[origin];
    if (!markerConfig) return null;
    const tooltip = getInterfaceText(markerConfig.tooltipKey);
    const marker = document.createElement('span');
    marker.className = 'autocomplete-plus-origin-marker';
    marker.dataset.tagOrigin = origin;
    marker.title = tooltip;
    marker.setAttribute('role', 'img');
    marker.setAttribute('aria-label', tooltip);
    marker.textContent = markerConfig.label;
    return marker;
}

export function createTagOriginMarkers(tagData) {
    const origins = getCandidateOrigins(tagData);
    const finalOrigin = ORIGIN_MARKERS[tagData?.origin]
        ? tagData.origin
        : ORIGIN_PRIORITY.find(origin => origins.includes(origin));
    const marker = createOriginMarker(finalOrigin);
    return marker ? [marker] : [];
}

export function createTagOriginMarker(tagData) {
    return createTagOriginMarkers(tagData)[0] || null;
}

export function createTranslationLoadingIndicator() {
    const indicator = document.createElement('span');
    indicator.className = 'autocomplete-plus-translation-loading';
    indicator.title = getInterfaceText('translatingTag');
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-label', indicator.title);
    for (let index = 0; index < 3; index++) {
        const dot = document.createElement('span');
        dot.className = 'autocomplete-plus-translation-loading-dot';
        dot.setAttribute('aria-hidden', 'true');
        indicator.appendChild(dot);
    }
    return indicator;
}

export function getCandidateAliasText(tagData, locale = getCurrentInterfaceLocale()) {
    if (
        String(tagData?.categoryText || "").toLowerCase() === "artist"
        && normalizeInterfaceLocale(locale) !== "en"
    ) {
        return String(tagData?.tag || "");
    }
    return filterAliasesForLocale(tagData?.alias, locale).join(", ");
}

export function renderTagNameWithCategoryIcon(element, tagData, position = 'left', includeOrigins = true) {
    element.textContent = '';
    const tagName = String(tagData?.tag || '');
    const text = document.createElement('span');
    text.className = 'autocomplete-plus-tag-text';
    text.textContent = tagName;
    if (!['left', 'right'].includes(position)) {
        element.append(text);
        if (includeOrigins) element.append(...createTagOriginMarkers(tagData));
        return;
    }

    const icon = createTagCategoryIcon(tagData);
    if (position === 'left') {
        element.append(icon, text);
    } else {
        element.append(text, icon);
    }
    if (includeOrigins) element.append(...createTagOriginMarkers(tagData));
}
