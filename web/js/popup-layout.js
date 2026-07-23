const VIEWPORT_INSET = 8;
const ANCHOR_GAP = 8;
const MIN_HORIZONTAL_PANEL_WIDTH = 280;

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
}

function getViewportBounds(viewportWidth, viewportHeight, margin = {}) {
    return {
        left: (margin.left || 0) + VIEWPORT_INSET,
        right: viewportWidth - (margin.right || 0) - VIEWPORT_INSET,
        top: (margin.top || 0) + VIEWPORT_INSET,
        bottom: viewportHeight - (margin.bottom || 0) - VIEWPORT_INSET,
    };
}

/**
 * Place autocomplete near the caret while keeping a small amount of text
 * context visible before it.
 */
export function calculateAutocompletePlacement({
    caretLeft,
    caretTop,
    caretBottom,
    preferredWidth,
    preferredHeight,
    viewportWidth,
    viewportHeight,
    margin,
}) {
    const bounds = getViewportBounds(viewportWidth, viewportHeight, margin);
    const availableWidth = Math.max(bounds.right - bounds.left, 0);
    const responsiveWidth = Math.max(360, availableWidth * 0.62);
    const width = Math.min(preferredWidth, availableWidth, responsiveWidth);
    const leadingContext = Math.min(width * 0.12, 72);
    const x = clamp(caretLeft - leadingContext, bounds.left, bounds.right - width);
    const belowTop = caretBottom + ANCHOR_GAP;
    const belowSpace = Math.max(bounds.bottom - belowTop, 0);
    const aboveSpace = Math.max(caretTop - ANCHOR_GAP - bounds.top, 0);
    const placeBelow = preferredHeight <= belowSpace || belowSpace >= aboveSpace;
    const height = Math.min(preferredHeight, placeBelow ? belowSpace : aboveSpace);
    const y = placeBelow
        ? belowTop
        : Math.max(caretTop - ANCHOR_GAP - height, bounds.top);

    return { x, y, width, height, side: placeBelow ? 'below' : 'above' };
}

/**
 * Place the related-tags panel beside or above/below its textarea without
 * covering the anchor. The larger side wins when the preferred size cannot fit.
 */
export function calculateRelatedTagsPlacement({
    anchorRect,
    preferredWidth,
    preferredHeight,
    viewportWidth,
    viewportHeight,
    margin,
    orientation,
}) {
    const bounds = getViewportBounds(viewportWidth, viewportHeight, margin);
    const viewportPanelWidth = Math.max(bounds.right - bounds.left, 0);
    const viewportPanelHeight = Math.max(bounds.bottom - bounds.top, 0);

    if (orientation === 'vertical') {
        const belowTop = anchorRect.bottom + ANCHOR_GAP;
        const belowSpace = Math.max(bounds.bottom - belowTop, 0);
        const aboveSpace = Math.max(anchorRect.top - ANCHOR_GAP - bounds.top, 0);
        const placeBelow = preferredHeight <= belowSpace || belowSpace >= aboveSpace;
        const height = Math.min(preferredHeight, placeBelow ? belowSpace : aboveSpace);
        const width = Math.min(preferredWidth, viewportPanelWidth);
        return {
            x: clamp(anchorRect.left, bounds.left, bounds.right - width),
            y: placeBelow
                ? belowTop
                : Math.max(anchorRect.top - ANCHOR_GAP - height, bounds.top),
            width,
            height,
            side: placeBelow ? 'below' : 'above',
        };
    }

    const leftSpace = Math.max(anchorRect.left - ANCHOR_GAP - bounds.left, 0);
    const rightSpace = Math.max(bounds.right - anchorRect.right - ANCHOR_GAP, 0);
    if (Math.max(leftSpace, rightSpace) < Math.min(MIN_HORIZONTAL_PANEL_WIDTH, viewportPanelWidth)) {
        return calculateRelatedTagsPlacement({
            anchorRect,
            preferredWidth,
            preferredHeight,
            viewportWidth,
            viewportHeight,
            margin,
            orientation: 'vertical',
        });
    }
    const placeLeft = leftSpace >= rightSpace;
    const sideSpace = placeLeft ? leftSpace : rightSpace;
    const width = Math.min(preferredWidth, sideSpace, viewportPanelWidth);
    const height = Math.min(preferredHeight, viewportPanelHeight);

    return {
        x: placeLeft
            ? anchorRect.left - ANCHOR_GAP - width
            : anchorRect.right + ANCHOR_GAP,
        y: clamp(anchorRect.top, bounds.top, bounds.bottom - height),
        width,
        height,
        side: placeLeft ? 'left' : 'right',
    };
}
