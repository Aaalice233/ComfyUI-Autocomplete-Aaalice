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

    test('applies ComfyUI canvas scale to the caret offset and line height', () => {
        const anchor = getScaledCaretAnchor(textarea, 1.5);

        expect(anchor.lineHeight).toBe(30);
        expect(anchor.left).toBeGreaterThanOrEqual(50);
        expect(anchor.top).toBeGreaterThanOrEqual(100);
    });
});
