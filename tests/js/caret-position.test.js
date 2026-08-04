/** @jest-environment jsdom */

import { getCaretCoordinates, getScaledCaretAnchor } from '../../web/js/caret-position.js';

describe('caret position helpers', () => {
    let textarea;

    beforeEach(() => {
        textarea = document.createElement('textarea');
        textarea.value = 'first tag\nsecond tag';
        textarea.selectionStart = 12;
        textarea.selectionEnd = 12;
        textarea.style.cssText = 'box-sizing: border-box; width: 320px; height: 100px; line-height: 20px;';
        Object.defineProperty(textarea, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ top: 100, left: 50, right: 370, bottom: 200 }),
        });
        document.body.append(textarea);
    });

    afterEach(() => textarea.remove());

    test('returns a caret line position instead of the textarea box position', () => {
        const caret = getCaretCoordinates(textarea);

        expect(caret).toEqual(expect.objectContaining({
            top: expect.any(Number),
            left: expect.any(Number),
            lineHeight: 20,
        }));
        expect(Number.isFinite(caret.top)).toBe(true);
        expect(Number.isFinite(caret.left)).toBe(true);
    });

    test('subtracts the textarea scroll offsets from the visible caret position', () => {
        const unscrolled = getCaretCoordinates(textarea);
        textarea.scrollTop = 40;
        textarea.scrollLeft = 12;

        const scrolled = getCaretCoordinates(textarea);

        expect(scrolled.top).toBe(unscrolled.top - 40);
        expect(scrolled.left).toBe(unscrolled.left - 12);
    });

    test('returns a complete viewport-relative caret anchor', () => {
        const anchor = getScaledCaretAnchor(textarea, 1.5);

        expect(anchor.right).toBe(anchor.left);
        expect(anchor.bottom).toBe(anchor.top + anchor.lineHeight);
    });

    test('applies ComfyUI canvas scale to the caret offset and line height', () => {
        const anchor = getScaledCaretAnchor(textarea, 1.5);

        expect(anchor.lineHeight).toBe(30);
        expect(anchor.left).toBeGreaterThanOrEqual(50);
        expect(anchor.top).toBeGreaterThanOrEqual(100);
    });

    test('does not apply the canvas scale to an untransformed sidebar input', () => {
        Object.defineProperties(textarea, {
            offsetWidth: { configurable: true, value: 320 },
            offsetHeight: { configurable: true, value: 100 },
        });
        Object.defineProperty(textarea, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({
                top: 100,
                left: 50,
                right: 370,
                bottom: 200,
                width: 320,
                height: 100,
            }),
        });

        const anchor = getScaledCaretAnchor(textarea, 1.5);

        expect(anchor.lineHeight).toBe(20);
    });

    test('uses the rendered scale of a transformed canvas input', () => {
        Object.defineProperties(textarea, {
            offsetWidth: { configurable: true, value: 320 },
            offsetHeight: { configurable: true, value: 100 },
        });
        Object.defineProperty(textarea, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({
                top: 100,
                left: 50,
                right: 530,
                bottom: 250,
                width: 480,
                height: 150,
            }),
        });

        const anchor = getScaledCaretAnchor(textarea);

        expect(anchor.lineHeight).toBe(30);
    });
});
