import {
    calculateAutocompletePlacement,
    calculateRelatedTagsPlacement,
} from '../../web/js/popup-layout.js';

const viewport = {
    viewportWidth: 800,
    viewportHeight: 600,
    margin: { top: 0, right: 0, bottom: 0, left: 40 },
};

describe('popup layout', () => {
    test('keeps autocomplete inside the viewport and places it above a low caret', () => {
        const placement = calculateAutocompletePlacement({
            ...viewport,
            caretLeft: 770,
            caretTop: 540,
            caretBottom: 560,
            preferredWidth: 672,
            preferredHeight: 320,
        });

        expect(placement.side).toBe('above');
        expect(placement.x).toBeGreaterThanOrEqual(48);
        expect(placement.x + placement.width).toBeLessThanOrEqual(792);
        expect(placement.y).toBeGreaterThanOrEqual(8);
        expect(placement.y + placement.height).toBeLessThanOrEqual(532);
    });

    test('uses all available width on a small viewport without overflowing', () => {
        const placement = calculateAutocompletePlacement({
            viewportWidth: 360,
            viewportHeight: 480,
            margin: {},
            caretLeft: 330,
            caretTop: 100,
            caretBottom: 120,
            preferredWidth: 672,
            preferredHeight: 320,
        });

        expect(placement.width).toBe(344);
        expect(placement.x).toBe(8);
    });

    test('keeps a useful list height when neither side of the caret fits the preferred height', () => {
        const placement = calculateAutocompletePlacement({
            viewportWidth: 800,
            viewportHeight: 340,
            margin: {},
            caretLeft: 160,
            caretTop: 92,
            caretBottom: 112,
            preferredWidth: 672,
            preferredHeight: 320,
        });

        expect(placement.height).toBe(256);
        expect(placement.y).toBeGreaterThanOrEqual(8);
        expect(placement.y + placement.height).toBeLessThanOrEqual(332);
    });

    test('still caps autocomplete height to a genuinely tiny viewport', () => {
        const placement = calculateAutocompletePlacement({
            viewportWidth: 360,
            viewportHeight: 180,
            margin: {},
            caretLeft: 120,
            caretTop: 76,
            caretBottom: 96,
            preferredWidth: 672,
            preferredHeight: 320,
        });

        expect(placement.height).toBe(164);
        expect(placement.y).toBe(8);
    });

    test('uses the same caret placement for related tags and autocomplete', () => {
        const placement = calculateRelatedTagsPlacement({
            ...viewport,
            anchorRect: { left: 500, right: 760, top: 180, bottom: 380 },
            preferredWidth: 672,
            preferredHeight: 360,
        });
        const autocompletePlacement = calculateAutocompletePlacement({
            ...viewport,
            caretLeft: 500,
            caretTop: 180,
            caretBottom: 380,
            preferredWidth: 672,
            preferredHeight: 360,
        });

        expect(placement).toEqual(autocompletePlacement);
    });

    test('uses the same caret placement for vertical related tags and autocomplete', () => {
        const placement = calculateRelatedTagsPlacement({
            ...viewport,
            anchorRect: { left: 300, right: 600, top: 80, bottom: 180 },
            preferredWidth: 672,
            preferredHeight: 300,
        });
        const autocompletePlacement = calculateAutocompletePlacement({
            ...viewport,
            caretLeft: 300,
            caretTop: 80,
            caretBottom: 180,
            preferredWidth: 672,
            preferredHeight: 300,
        });

        expect(placement).toEqual(autocompletePlacement);
        expect(placement.side).toBe('below');
        expect(placement.y).toBe(188);
    });

    test('falls back above or below when neither side is usable', () => {
        const placement = calculateRelatedTagsPlacement({
            viewportWidth: 480,
            viewportHeight: 600,
            margin: {},
            anchorRect: { left: 80, right: 440, top: 220, bottom: 380 },
            preferredWidth: 672,
            preferredHeight: 320,
        });

        expect(['above', 'below']).toContain(placement.side);
        expect(placement.width).toBe(360);
        expect(placement.x).toBeGreaterThanOrEqual(8);
        expect(placement.x + placement.width).toBeLessThanOrEqual(472);
    });
});
