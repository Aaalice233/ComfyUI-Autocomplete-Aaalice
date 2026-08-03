import { getChineseDictionaryStatus } from './integrations/chinese-dictionary-provider.js';
import { getTranslationServiceStatus } from './integrations/translation-provider.js';
import {
    getCurrentInterfaceLocale,
    getInterfaceText,
    normalizeInterfaceLocale,
} from './localization.js';
import {
    ONLINE_SERVICES_UPDATED_EVENT,
    openOnlineServicesPanel,
} from './online-settings.js';

const STATUS_REFRESH_INTERVAL_MS = 5_000;
const DICTIONARY_REFRESH_INTERVAL_MS = 750;

const ICON_EMOJIS = {
    database: '🗃️',
    globe: '🌐',
    key: '🔑',
};

const DICTIONARY_STATES = new Set(['downloading', 'checking']);

function createIcon(name) {
    const icon = document.createElement('span');
    icon.className = 'autocomplete-plus-footer-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = ICON_EMOJIS[name];
    return icon;
}

function createStatusItem(iconName, labelKey) {
    const item = document.createElement('span');
    item.className = 'autocomplete-plus-footer-status';

    const label = document.createElement('span');
    label.className = 'autocomplete-plus-footer-status-label';

    const value = document.createElement('span');
    value.className = 'autocomplete-plus-footer-status-value';
    value.setAttribute('aria-live', 'polite');

    item.append(createIcon(iconName), label, value);
    return { item, label, value, labelKey };
}

function getDictionaryDisplay(status) {
    const dictionaryState = status?.state || 'unknown';
    if (dictionaryState === 'ready' && status?.update_available) {
        return { state: 'update', textKey: 'autocompleteDictionaryUpdate' };
    }
    const textKey = {
        ready: 'autocompleteDictionaryReady',
        downloading: 'autocompleteDictionaryDownloading',
        checking: 'autocompleteDictionaryChecking',
        missing: 'autocompleteDictionaryMissing',
        error: 'autocompleteDictionaryError',
    }[dictionaryState] || 'autocompleteStatusChecking';
    return { state: dictionaryState, textKey };
}

function getKeyDisplay(status) {
    if (status?.configured === true) {
        return { state: 'configured', textKey: 'autocompleteKeyConfigured' };
    }
    if (status?.configured === false) {
        return { state: 'not-configured', textKey: 'autocompleteKeyNotConfigured' };
    }
    return {
        state: status?.state === 'error' ? 'error' : 'unknown',
        textKey: status?.state === 'error'
            ? 'autocompleteStatusError'
            : 'autocompleteStatusChecking',
    };
}

function getDanbooruDisplay(status) {
    const state = status?.state || 'unknown';
    const textKey = {
        success: 'autocompleteDanbooruReady',
        error: 'autocompleteDanbooruError',
        idle: 'autocompleteDanbooruWaiting',
    }[state] || 'autocompleteStatusChecking';
    return { state, textKey };
}

function getCooccurrenceDisplay(status) {
    const state = status?.state || 'unknown';
    if (state === 'loading') {
        return {
            state,
            textKey: 'autocompleteCooccurrenceLoading',
            parameters: { progress: Number(status?.progress) || 0 },
        };
    }
    const textKey = {
        ready: 'autocompleteCooccurrenceReady',
        waiting: 'autocompleteCooccurrenceWaiting',
        error: 'autocompleteCooccurrenceError',
    }[state] || 'autocompleteStatusChecking';
    return { state, textKey };
}

function isChineseInterface(locale) {
    const normalized = normalizeInterfaceLocale(locale);
    return normalized === 'zh' || normalized === 'zh-TW';
}

export function createAutocompleteFooter({
    id = 'autocomplete-plus-footer',
    includeCooccurrence = false,
} = {}) {
    const footer = document.createElement('footer');
    footer.id = id;
    footer.className = 'autocomplete-plus-footer';
    footer.hidden = true;

    const statuses = document.createElement('div');
    statuses.className = 'autocomplete-plus-footer-statuses';
    const cooccurrence = includeCooccurrence
        ? createStatusItem('database', 'autocompleteCooccurrenceLabel')
        : null;
    const dictionary = createStatusItem('database', 'autocompleteDictionaryLabel');
    const key = createStatusItem('key', 'autocompleteKeyLabel');
    const danbooru = createStatusItem('globe', 'autocompleteDanbooruLabel');
    statuses.append(
        ...(cooccurrence ? [cooccurrence.item] : []),
        dictionary.item,
        key.item,
        danbooru.item,
    );

    const settingsButton = document.createElement('button');
    settingsButton.type = 'button';
    settingsButton.className = 'autocomplete-plus-footer-settings';
    settingsButton.textContent = '⚙️';
    settingsButton.addEventListener('mousedown', event => {
        event.preventDefault();
        event.stopPropagation();
    });
    settingsButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        void openOnlineServicesPanel(globalThis.window?.app);
    });

    footer.append(statuses, settingsButton);

    let visible = false;
    let status = {};
    let cooccurrenceStatus = {};
    let locale = getCurrentInterfaceLocale();
    let refreshPromise = null;
    let refreshTimer = null;
    let abortController = null;
    let refreshGeneration = 0;

    const renderLabels = () => {
        locale = getCurrentInterfaceLocale();
        footer.setAttribute('aria-label', getInterfaceText('autocompleteFooterAriaLabel', {}, locale));
        settingsButton.title = getInterfaceText('autocompleteOpenOnlineSettings', {}, locale);
        settingsButton.setAttribute('aria-label', settingsButton.title);
        for (const entry of [cooccurrence, dictionary, key, danbooru].filter(Boolean)) {
            entry.label.textContent = getInterfaceText(entry.labelKey, {}, locale);
        }
    };

    const renderStatus = nextStatus => {
        status = nextStatus || {};
        const entries = [
            ...(cooccurrence
                ? [[cooccurrence, getCooccurrenceDisplay(cooccurrenceStatus), cooccurrenceStatus]]
                : []),
            [dictionary, getDictionaryDisplay(status.dictionary), status.dictionary],
            [key, getKeyDisplay(status), status],
            [danbooru, getDanbooruDisplay(status.danbooru), status.danbooru],
        ];
        for (const [entry, display, details] of entries) {
            const text = getInterfaceText(display.textKey, display.parameters || {}, locale);
            entry.value.textContent = text;
            entry.item.dataset.state = display.state;
            entry.item.title = `${entry.label.textContent}: ${text}`
                + (details?.error || details?.message ? `\n${details.error || details.message}` : '');
        }
    };

    const clearRefreshTimer = () => {
        if (refreshTimer !== null) {
            window.clearTimeout(refreshTimer);
            refreshTimer = null;
        }
    };

    const scheduleRefresh = () => {
        clearRefreshTimer();
        if (!visible) return;
        const dictionaryState = status.dictionary?.state;
        const delay = DICTIONARY_STATES.has(dictionaryState)
            ? DICTIONARY_REFRESH_INTERVAL_MS
            : STATUS_REFRESH_INTERVAL_MS;
        refreshTimer = window.setTimeout(() => {
            refreshTimer = null;
            void refreshStatus();
        }, delay);
    };

    const refreshStatus = async (force = false) => {
        if (!visible) return;
        if (refreshPromise && !force) return refreshPromise;
        if (force) {
            refreshGeneration++;
            abortController?.abort();
        }

        const generation = refreshGeneration;
        const controller = new AbortController();
        abortController = controller;
        const request = Promise.allSettled([
            getChineseDictionaryStatus({ signal: controller.signal }),
            getTranslationServiceStatus({ signal: controller.signal }),
        ]).then(results => {
            if (!visible || generation !== refreshGeneration) return;
            const [dictionaryResult, onlineResult] = results;
            const nextStatus = {
                dictionary: dictionaryResult.status === 'fulfilled'
                    ? dictionaryResult.value
                    : { state: 'error', error: dictionaryResult.reason?.message || '' },
                ...(onlineResult.status === 'fulfilled'
                    ? onlineResult.value
                    : {
                        state: 'error',
                        configured: null,
                        danbooru: { state: 'error', message: onlineResult.reason?.message || '' },
                        error: onlineResult.reason?.message || '',
                    }),
            };
            renderStatus(nextStatus);
        });
        let currentPromise;
        currentPromise = request.finally(() => {
            if (refreshPromise !== currentPromise) return;
            refreshPromise = null;
            if (abortController === controller) abortController = null;
            if (visible && generation === refreshGeneration) scheduleRefresh();
        });
        refreshPromise = currentPromise;
        return currentPromise;
    };

    const setCooccurrenceStatus = nextStatus => {
        cooccurrenceStatus = nextStatus || {};
        renderStatus(status);
    };

    const handleExternalUpdate = () => {
        void refreshStatus(true);
    };

    const stop = () => {
        visible = false;
        refreshGeneration++;
        clearRefreshTimer();
        abortController?.abort();
        abortController = null;
        window.removeEventListener(ONLINE_SERVICES_UPDATED_EVENT, handleExternalUpdate);
    };

    const setVisible = nextVisible => {
        const wasVisible = visible && !footer.hidden;
        const previousLocale = locale;
        visible = Boolean(nextVisible);
        renderLabels();
        if (!visible || !isChineseInterface(locale)) {
            footer.hidden = true;
            stop();
            return;
        }
        footer.hidden = false;
        renderStatus(status);
        if (!wasVisible || previousLocale !== locale) {
            window.addEventListener(ONLINE_SERVICES_UPDATED_EVENT, handleExternalUpdate);
            void refreshStatus();
        }
    };

    renderLabels();
    renderStatus(status);

    return {
        element: footer,
        setVisible,
        setCooccurrenceStatus,
        getHeight: () => footer.hidden ? 0 : footer.getBoundingClientRect().height,
        destroy: stop,
    };
}

export const __test__ = {
    getDictionaryDisplay,
    getKeyDisplay,
    getDanbooruDisplay,
    getCooccurrenceDisplay,
    isChineseInterface,
};
