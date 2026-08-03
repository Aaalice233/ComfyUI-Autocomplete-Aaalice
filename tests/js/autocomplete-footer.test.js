/** @jest-environment jsdom */

import { jest } from '@jest/globals';
import { createAutocompleteFooter, __test__ } from '../../web/js/autocomplete-footer.js';
import { setInterfaceLocalizationApp } from '../../web/js/localization.js';

describe('autocomplete footer', () => {
    let footer;

    beforeEach(() => {
        document.body.replaceChildren();
        setInterfaceLocalizationApp({
            extensionManager: { setting: { get: () => 'zh-CN' } },
        });
        global.fetch = jest.fn(async url => {
            if (String(url).endsWith('/chinese-dictionary/status')) {
                return {
                    ok: true,
                    json: async () => ({ state: 'ready', installed: true, update_available: false }),
                };
            }
            if (String(url).endsWith('/translation/status')) {
                return {
                    ok: true,
                    json: async () => ({
                        configured: false,
                        danbooru: { state: 'success' },
                    }),
                };
            }
            throw new Error(`Unexpected request: ${url}`);
        });
    });

    afterEach(() => {
        footer?.destroy();
        footer = null;
        setInterfaceLocalizationApp(null);
    });

    test('shows all service states for a Chinese interface', async () => {
        footer = createAutocompleteFooter();
        footer.setVisible(true);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(footer.element.id).toBe('autocomplete-plus-footer');
        expect(footer.element.hidden).toBe(false);
        expect(footer.element.querySelectorAll('.autocomplete-plus-footer-status')).toHaveLength(3);
        expect([...footer.element.querySelectorAll('.autocomplete-plus-footer-icon')]
            .map(icon => icon.textContent)).toEqual(['🗃️', '🔑', '🌐']);
        expect(footer.element.textContent).toContain('汉化库可用');
        expect(footer.element.textContent).toContain('Key未配置');
        expect(footer.element.textContent).toContain('Danbooru可用');
        const settingsButton = footer.element.querySelector('.autocomplete-plus-footer-settings');
        expect(settingsButton.textContent).toBe('⚙️');
        expect(settingsButton.ariaLabel).toBe('打开在线补全与翻译设置');
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('adds co-occurrence loading state to the shared footer', async () => {
        footer = createAutocompleteFooter({
            id: 'related-tags-footer',
            includeCooccurrence: true,
        });
        footer.setCooccurrenceStatus({ state: 'loading', progress: 42 });
        footer.setVisible(true);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(footer.element.id).toBe('related-tags-footer');
        expect(footer.element.querySelectorAll('.autocomplete-plus-footer-status')).toHaveLength(4);
        expect(footer.element.textContent).toContain('本地共现加载中 42%');

        footer.setCooccurrenceStatus({ state: 'ready' });
        expect(footer.element.textContent).toContain('本地共现已就绪');
    });

    test('does not request or display the footer outside Chinese interfaces', async () => {
        setInterfaceLocalizationApp({
            extensionManager: { setting: { get: () => 'en-US' } },
        });
        footer = createAutocompleteFooter();
        footer.setVisible(true);
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(footer.element.hidden).toBe(true);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('prevents the settings button from stealing input focus', () => {
        footer = createAutocompleteFooter();
        const button = footer.element.querySelector('.autocomplete-plus-footer-settings');
        const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });

        button.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
    });

    test('keeps request failures distinct from an unconfigured key', () => {
        expect(__test__.getKeyDisplay({ configured: null, state: 'error' })).toEqual({
            state: 'error',
            textKey: 'autocompleteStatusError',
        });
        expect(__test__.getKeyDisplay({ configured: false, state: 'idle' })).toEqual({
            state: 'not-configured',
            textKey: 'autocompleteKeyNotConfigured',
        });
    });
});
