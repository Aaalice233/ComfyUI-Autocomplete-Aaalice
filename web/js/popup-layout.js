const VIEWPORT_INSET = 8;
const ANCHOR_GAP = 8;
const MIN_AUTOCOMPLETE_PANEL_HEIGHT = 256;

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
    const availableHeight = Math.max(bounds.bottom - bounds.top, 0);
    const sideSpace = placeBelow ? belowSpace : aboveSpace;
    const minimumUsefulHeight = Math.min(MIN_AUTOCOMPLETE_PANEL_HEIGHT, availableHeight);
    const height = Math.min(preferredHeight, Math.max(sideSpace, minimumUsefulHeight), availableHeight);
    const y = placeBelow
        ? clamp(belowTop, bounds.top, bounds.bottom - height)
        : clamp(caretTop - ANCHOR_GAP - height, bounds.top, bounds.bottom - height);

    return { x, y, width, height, side: placeBelow ? 'below' : 'above' };
}

/**
 * Place the related-tags panel using the same caret placement as autocomplete.
 */
export function calculateRelatedTagsPlacement({
    anchorRect,
    preferredWidth,
    preferredHeight,
    viewportWidth,
    viewportHeight,
    margin,
}) {
    return calculateAutocompletePlacement({
        caretLeft: anchorRect.left,
        caretTop: anchorRect.top,
        caretBottom: anchorRect.bottom,
        preferredWidth,
        preferredHeight,
        viewportWidth,
        viewportHeight,
        margin,
    });
}
