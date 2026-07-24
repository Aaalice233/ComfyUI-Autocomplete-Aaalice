/** @jest-environment jsdom */

import { jest } from '@jest/globals';
import {
    createOnlineServicesSetting,
    openOnlineServicesPanel,
} from '../../web/js/online-settings.js';
import { getOnlineServiceFeatures, updateOnlineServiceFeatures } from '../../web/js/online-service-state.js';

const config = {
    features: { danbooru_completion: true, translation: true },
    deepseek: {
        api_key: '********',
        api_key_configured: true,
        model: 'deepseek-v4-flash',
        reasoning_effort: 'disabled',
        concurrency: 2,
        batch_size: 20,
        max_retries: 2,
        timeout_seconds: 60,
        system_prompt: 'Translate tags.',
    },
};

const status = {
    cache_count: 12,
    configured: true,
    huggingface: { available: true },
    danbooru: {
        state: 'idle',
        message: '',
        cache: { entries: 3, fresh_entries: 2, stale_entries: 1, size_bytes: 2048 },
    },
    deepseek: { state: 'idle', message: '' },
};

describe('online services settings panel', () => {
    beforeEach(() => {
        updateOnlineServiceFeatures(config.features);
        document.documentElement.lang = 'en';
        document.body.replaceChildren();
        HTMLDialogElement.prototype.showModal = jest.fn();
        HTMLDialogElement.prototype.close = jest.fn(function close() {
            this.dispatchEvent(new Event('close'));
        });
        global.fetch = jest.fn(async url => {
            if (String(url).endsWith('/config')) return { ok: true, json: async () => config };
            if (String(url).endsWith('/chinese-dictionary/status')) {
                return {
                    ok: true,
                    json: async () => ({
                        state: 'ready',
                        installed: true,
                        installed_sha: '1234567890abcdef',
                        remote_sha: '1234567890abcdef',
                        row_count: 318000,
                        size_bytes: 30_000_000,
                        update_available: false,
                    }),
                };
            }
            if (String(url).endsWith('/status')) return { ok: true, json: async () => status };
            if (String(url).startsWith('/api/lm/')) {
                return { ok: false, status: 404, json: async () => ({}) };
            }
            if (String(url).startsWith('/autocomplete-plus/danbooru/search')) {
                return {
                    ok: true,
                    json: async () => ({
                        results: [],
                        page_info: { has_more: false },
                        cache: { state: 'refreshed' },
                    }),
                };
            }
            if (String(url).startsWith('/autocomplete-plus/danbooru/related')) {
                return {
                    ok: true,
                    json: async () => ({
                        results: [],
                        page_info: { has_more: false },
                        cache: { state: 'refreshed' },
                    }),
                };
            }
            if (String(url).endsWith('/danbooru/cache/clear')) {
                return { ok: true, json: async () => ({ deleted: 3 }) };
            }
            if (String(url).endsWith('/config/reveal')) {
                return { ok: true, json: async () => ({ api_key: 'saved-secret' }) };
            }
            if (String(url).endsWith('/models')) {
                return { ok: true, json: async () => ({ models: ['deepseek-v4-flash', 'deepseek-v4-pro'] }) };
            }
            if (String(url).endsWith('/test')) {
                return { ok: true, json: async () => ({ ok: true, model: 'deepseek-v4-flash' }) };
            }
            throw new Error(`Unexpected request: ${url}`);
        });
    });

    test('sorts the online services category before the other extension categories', () => {
        const setting = createOnlineServicesSetting({}, 'Autocomplete Plus', 'AutocompletePlus');
        expect(setting.category).toEqual([
            'Autocomplete Plus',
            ' Online Services',
            'Online completion and translation',
        ]);

        document.documentElement.lang = 'zh-CN';
        expect(createOnlineServicesSetting({}, 'Autocomplete Plus', 'AutocompletePlus').category[1])
            .toBe(' 在线服务');
    });

    test('uses three navigation pages with collapsed advanced settings and thinking off', async () => {
        await openOnlineServicesPanel({});
        const dialog = document.querySelector('dialog');
        const details = dialog.querySelector('details');
        const thinking = [...dialog.querySelectorAll('label')]
            .find(label => label.textContent.includes('Thinking effort'))
            .querySelector('select');

        expect(dialog).not.toBeNull();
        expect(details.open).toBe(false);
        expect(thinking.value).toBe('disabled');
        expect(dialog.textContent).toContain('Waiting for first completion');
        expect(dialog.textContent).toContain('Waiting for fallback');
        expect(dialog.textContent).toContain('Persistent Danbooru result cache: 3 pages');
        expect(dialog.textContent).not.toMatch(/scan|resume/i);
        expect(dialog.querySelectorAll('[role="switch"]')).toHaveLength(2);
        expect(dialog.querySelector('.autocomplete-plus-online-content')).not.toBeNull();
        expect(dialog.querySelector('.autocomplete-plus-online-status-grid')).not.toBeNull();
        expect(dialog.querySelectorAll('[role="tab"]')).toHaveLength(3);
        expect(dialog.textContent).toContain('Simplified Chinese dictionary');
        expect(dialog.textContent).toContain('318,000');
        expect(dialog.querySelector('.autocomplete-plus-online-title p').textContent)
            .toContain('local suggestions instant');
    });

    test('switches pages and starts a manual dictionary update', async () => {
        await openOnlineServicesPanel({});
        const dialog = document.querySelector('dialog');
        const dictionaryTab = [...dialog.querySelectorAll('[role="tab"]')]
            .find(button => button.textContent.includes('Chinese dictionary'));
        dictionaryTab.click();
        expect(dictionaryTab.getAttribute('aria-selected')).toBe('true');
        expect(dialog.querySelectorAll('.autocomplete-plus-online-page:not([hidden])')).toHaveLength(1);

        const updateButton = [...dialog.querySelectorAll('button')]
            .find(button => button.textContent === 'Repair download');
        global.fetch.mockImplementationOnce(async () => ({
            ok: true,
            json: async () => ({ state: 'downloading', installed: true }),
        }));
        updateButton.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(global.fetch).toHaveBeenCalledWith(
            '/autocomplete-plus/chinese-dictionary/update',
            expect.objectContaining({ method: 'POST' }),
        );
        dialog.close();
    });

    test('offers an accessible API key visibility control', async () => {
        await openOnlineServicesPanel({});
        const dialog = document.querySelector('dialog');
        const apiKey = dialog.querySelector('input[aria-label="DeepSeek API key"]');
        const reveal = dialog.querySelector('button[aria-label="Show API key"]');

        expect(apiKey.type).toBe('password');
        reveal.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(apiKey.type).toBe('text');
        expect(apiKey.value).toBe('saved-secret');
        expect(reveal.ariaLabel).toBe('Hide API key');
        expect(global.fetch).toHaveBeenCalledWith(
            '/autocomplete-plus/translation/config/reveal',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    test('loads models and tests the selected model without saving first', async () => {
        await openOnlineServicesPanel({});
        const dialog = document.querySelector('dialog');
        const buttons = [...dialog.querySelectorAll('button')];
        buttons.find(button => button.textContent === 'Load models').click();
        await new Promise(resolve => setTimeout(resolve, 0));

        const modelSelect = [...dialog.querySelectorAll('label')]
            .find(label => label.textContent.includes('Model'))
            .querySelector('select');
        const options = [...modelSelect.options].map(option => option.value);
        expect(options).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro']);
        expect(dialog.textContent).toContain('Model list loaded（2）');

        buttons.find(button => button.textContent === 'Test model').click();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(global.fetch).toHaveBeenCalledWith(
            '/autocomplete-plus/translation/test',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    test('offers an explicit data-source check and refreshes the status cards', async () => {
        await openOnlineServicesPanel({});
        const dialog = document.querySelector('dialog');
        const checkButton = [...dialog.querySelectorAll('button')]
            .find(button => button.textContent === 'Check data sources');
        checkButton.click();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/lm/custom-words/search?'),
            expect.objectContaining({ cache: 'no-store' }),
        );
        expect(global.fetch).toHaveBeenCalledWith(
            '/autocomplete-plus/danbooru/search?q=blue&limit=1&refresh=1',
            expect.any(Object),
        );
        expect(global.fetch).toHaveBeenCalledWith(
            '/autocomplete-plus/danbooru/related?q=blue_archive&limit=1&refresh=1',
            expect.any(Object),
        );
        expect(checkButton.disabled).toBe(false);
    });

    test('saves independent Danbooru and translation switches into runtime state', async () => {
        await openOnlineServicesPanel({});
        const dialog = document.querySelector('dialog');
        const toggles = [...dialog.querySelectorAll('input[type="checkbox"]')];
        toggles[0].checked = false;
        toggles[1].checked = false;
        const saveButton = [...dialog.querySelectorAll('button')]
            .find(button => button.textContent === 'Save settings');
        global.fetch.mockImplementationOnce(async () => ({
            ok: true,
            json: async () => ({ ...config, features: { danbooru_completion: false, translation: false } }),
        }));

        saveButton.click();
        await new Promise(resolve => setTimeout(resolve, 0));

        const saveCall = global.fetch.mock.calls.find(([, options]) => options?.method === 'PUT');
        expect(JSON.parse(saveCall[1].body).features).toEqual({
            danbooru_completion: false,
            translation: false,
        });
        expect(getOnlineServiceFeatures()).toEqual({
            danbooru_completion: false,
            translation: false,
        });
    });
});
