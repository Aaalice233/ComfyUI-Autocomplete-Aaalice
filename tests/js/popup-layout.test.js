import { calculatePopupPlacement } from '../../web/js/popup-layout.js';

const viewport = {
    viewportWidth: 800,
    viewportHeight: 600,
    margin: { top: 0, right: 0, bottom: 0, left: 40 },
};

describe('popup layout', () => {
    test('keeps a popup inside the viewport and places it above a low caret', () => {
        const placement = calculatePopupPlacement({
            ...viewport,
            anchorRect: { left: 770, top: 540, bottom: 560 },
            preferredWidth: 672,
            preferredHeight: 320,
        });

        expect(placement.side).toBe('above');
        expect(placement.x).toBeGreaterThanOrEqual(48);
        expect(placement.x + placement.width).toBeLessThanOrEqual(792);
        expect(placement.y).toBeGreaterThanOrEqual(8);
        expect(placement.y + placement.height).toBeLessThanOrEqual(532);
    });

    test('uses all available popup width on a small viewport without overflowing', () => {
        const placement = calculatePopupPlacement({
            viewportWidth: 360,
            viewportHeight: 480,
            margin: {},
            anchorRect: { left: 330, top: 100, bottom: 120 },
            preferredWidth: 672,
            preferredHeight: 320,
        });

        expect(placement.width).toBe(344);
        expect(placement.x).toBe(8);
    });

    test('uses only the available side height when neither side fits the preferred height', () => {
        const placement = calculatePopupPlacement({
            viewportWidth: 800,
            viewportHeight: 340,
            margin: {},
            anchorRect: { left: 160, top: 92, bottom: 112 },
            preferredWidth: 672,
            preferredHeight: 320,
        });

        expect(placement.height).toBe(212);
        expect(placement.y).toBe(120);
        expect(placement.y + placement.height).toBeLessThanOrEqual(332);
    });

    test('keeps the popup clear of the caret in a genuinely tiny viewport', () => {
        const placement = calculatePopupPlacement({
            viewportWidth: 360,
            viewportHeight: 180,
            margin: {},
            anchorRect: { left: 120, top: 76, bottom: 96 },
            preferredWidth: 672,
            preferredHeight: 320,
        });

        expect(placement.height).toBe(68);
        expect(placement.y).toBe(104);
    });

    test('anchors the shared popup placement below a caret when there is room', () => {
        const placement = calculatePopupPlacement({
            ...viewport,
            anchorRect: { left: 300, top: 80, bottom: 180 },
            preferredWidth: 672,
            preferredHeight: 300,
        });

        expect(placement.side).toBe('below');
        expect(placement.y).toBe(188);
    });

    test('keeps the shared popup inside a small viewport', () => {
        const placement = calculatePopupPlacement({
            viewportWidth: 480,
            viewportHeight: 600,
            margin: {},
            anchorRect: { left: 80, top: 220, bottom: 380 },
            preferredWidth: 672,
            preferredHeight: 320,
        });

        expect(['above', 'below']).toContain(placement.side);
        expect(placement.width).toBe(360);
        expect(placement.x).toBeGreaterThanOrEqual(8);
        expect(placement.x + placement.width).toBeLessThanOrEqual(472);
    });
});
