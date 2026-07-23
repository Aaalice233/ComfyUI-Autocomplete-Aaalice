/** @jest-environment jsdom */

import {
    getVirtualRange,
    VirtualKeyedList,
    VIRTUAL_ROW_HEIGHT,
} from '../../web/js/list-utils.js';

describe('virtual list utilities', () => {
    test('calculates a bounded visible range with overscan', () => {
        expect(getVirtualRange(1000, 320, 320)).toEqual({ start: 4, end: 26 });
        expect(getVirtualRange(5, 0, 0)).toEqual({ start: 0, end: 5 });
    });

    test('keeps the complete logical height while rendering only visible rows', () => {
        const container = document.createElement('div');
        Object.defineProperty(container, 'clientHeight', { value: 320 });
        const list = new VirtualKeyedList(container, {
            getKey: item => item.id,
            getSignature: item => item.label,
            createElement: item => {
                const row = document.createElement('div');
                row.textContent = item.label;
                return row;
            },
        });
        const items = Array.from({ length: 1000 }, (_, index) => ({
            id: `row-${index}`,
            label: `Row ${index}`,
        }));

        list.setItems(items);

        expect(container.querySelectorAll('[data-list-key]').length).toBeLessThan(30);
        expect(list.bottomSpacer.style.blockSize).toBe(`${(1000 - 16) * VIRTUAL_ROW_HEIGHT}px`);
    });

    test('reuses unchanged visible rows and swaps the window on scroll', () => {
        const container = document.createElement('div');
        Object.defineProperty(container, 'clientHeight', { value: 96 });
        const list = new VirtualKeyedList(container, {
            overscan: 0,
            getKey: item => item.id,
            getSignature: item => item.label,
            createElement: item => {
                const row = document.createElement('div');
                row.textContent = item.label;
                return row;
            },
        });
        const items = Array.from({ length: 20 }, (_, index) => ({
            id: `row-${index}`,
            label: `Row ${index}`,
        }));
        list.setItems(items);
        const firstRow = container.querySelector('[data-list-key="row-0"]');

        list.render();
        expect(container.querySelector('[data-list-key="row-0"]')).toBe(firstRow);

        container.scrollTop = 320;
        list.render();
        expect(container.querySelector('[data-list-key="row-0"]')).toBeNull();
        expect(container.querySelector('[data-list-key="row-10"]')).not.toBeNull();
    });

    test('scrolls directly to an off-screen logical row', () => {
        const container = document.createElement('div');
        Object.defineProperty(container, 'clientHeight', { value: 96 });
        const list = new VirtualKeyedList(container, {
            overscan: 0,
            getKey: item => item.id,
            getSignature: item => item.id,
            createElement: () => document.createElement('div'),
        });
        list.setItems(Array.from({ length: 100 }, (_, index) => ({ id: `row-${index}` })));

        list.scrollToIndex(50);

        expect(container.scrollTop).toBe(50 * VIRTUAL_ROW_HEIGHT + VIRTUAL_ROW_HEIGHT - 96);
        expect(container.querySelector('[data-list-key="row-50"]')).not.toBeNull();
    });
});
