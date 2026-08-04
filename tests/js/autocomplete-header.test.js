/** @jest-environment jsdom */

import { jest } from '@jest/globals';
import {
    createAutocompleteHeader,
    createPopupCloseButton,
} from '../../web/js/autocomplete-header.js';
import { setInterfaceLocalizationApp } from '../../web/js/localization.js';

describe('autocomplete header', () => {
    let header;

    beforeEach(() => {
        setInterfaceLocalizationApp({
            extensionManager: { setting: { get: () => 'zh-CN' } },
        });
    });

    afterEach(() => {
        setInterfaceLocalizationApp(null);
        header = null;
    });

    test('shows the current query, result count, and keyboard guidance', () => {
        header = createAutocompleteHeader();
        header.setState({ queryText: 'red_', resultCount: 12 });

        expect(header.element.querySelector('.autocomplete-plus-header-title').textContent)
            .toBe('标签补全');
        expect(header.element.querySelector('.autocomplete-plus-header-query').textContent)
            .toBe('red_');
        expect(header.element.querySelector('.autocomplete-plus-header-count').textContent)
            .toBe('12 个结果');
        expect(header.element.querySelector('.autocomplete-plus-header-hint').textContent)
            .toContain('Enter/Tab 插入');
        expect(header.element.querySelector('.autocomplete-plus-header-close').ariaLabel)
            .toBe('关闭补全菜单');
    });

    test('formats large result counts while keeping the exact count in the tooltip', () => {
        header = createAutocompleteHeader();
        header.setState({ queryText: 'hair', resultCount: 1250 });

        const resultCount = header.element.querySelector('.autocomplete-plus-header-count');
        expect(resultCount.textContent).toBe('1.3k 个结果');
        expect(resultCount.title).toBe('1250 个结果');
    });

    test('refreshes labels when the interface locale changes', () => {
        header = createAutocompleteHeader();
        header.setState({ queryText: 'red_', resultCount: 2 });
        setInterfaceLocalizationApp({
            extensionManager: { setting: { get: () => 'en-US' } },
        });
        header.setState({ queryText: 'red_', resultCount: 2 });

        expect(header.element.querySelector('.autocomplete-plus-header-title').textContent)
            .toBe('Tag autocomplete');
        expect(header.element.querySelector('.autocomplete-plus-header-count').textContent)
            .toBe('2 results');
        expect(header.element.querySelector('.autocomplete-plus-header-close').ariaLabel)
            .toBe('Close autocomplete');
    });

    test('uses a domain-specific close label for the related-tags header', () => {
        const closeButton = createPopupCloseButton({ labelKey: 'relatedTagsClose' });

        expect(closeButton.element.ariaLabel).toBe('关闭共现菜单');
    });

    test('closes without stealing focus from the editor', () => {
        const onClose = jest.fn();
        header = createAutocompleteHeader({ onClose });
        const closeButton = header.element.querySelector('.autocomplete-plus-header-close');
        const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        const click = new MouseEvent('click', { bubbles: true, cancelable: true });

        closeButton.dispatchEvent(mouseDown);
        closeButton.dispatchEvent(click);

        expect(mouseDown.defaultPrevented).toBe(true);
        expect(click.defaultPrevented).toBe(true);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
