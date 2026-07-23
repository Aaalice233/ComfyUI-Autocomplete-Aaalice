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

    test('places horizontal related tags on the larger side with an anchor gap', () => {
        const placement = calculateRelatedTagsPlacement({
            ...viewport,
            anchorRect: { left: 500, right: 760, top: 180, bottom: 380 },
            preferredWidth: 672,
            preferredHeight: 360,
            orientation: 'horizontal',
        });

        expect(placement.side).toBe('left');
        expect(placement.x + placement.width).toBe(492);
        expect(placement.width).toBe(444);
    });

    test('places vertical related tags below when it has more room', () => {
        const placement = calculateRelatedTagsPlacement({
            ...viewport,
            anchorRect: { left: 300, right: 600, top: 80, bottom: 180 },
            preferredWidth: 672,
            preferredHeight: 300,
            orientation: 'vertical',
        });

        expect(placement.side).toBe('below');
        expect(placement.y).toBe(188);
        expect(placement.x + placement.width).toBeLessThanOrEqual(792);
    });

    test('falls back above or below when neither side is usable', () => {
        const placement = calculateRelatedTagsPlacement({
            viewportWidth: 480,
            viewportHeight: 600,
            margin: {},
            anchorRect: { left: 80, right: 440, top: 220, bottom: 380 },
            preferredWidth: 672,
            preferredHeight: 320,
            orientation: 'horizontal',
        });

        expect(['above', 'below']).toContain(placement.side);
        expect(placement.width).toBe(464);
        expect(placement.x).toBe(8);
    });
});
