const VIEWPORT_INSET = 8;
const ANCHOR_GAP = 8;

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
 * Place a caret-anchored popup while keeping a small amount of text context
 * visible before it. All coordinates are viewport-relative pixels.
 */
export function calculatePopupPlacement({
    anchorRect,
    preferredWidth,
    preferredHeight,
    viewportWidth,
    viewportHeight,
    margin,
}) {
    const { left: anchorLeft, top: anchorTop, bottom: anchorBottom } = anchorRect;
    const bounds = getViewportBounds(viewportWidth, viewportHeight, margin);
    const availableWidth = Math.max(bounds.right - bounds.left, 0);
    const responsiveWidth = Math.max(360, availableWidth * 0.62);
    const width = Math.min(preferredWidth, availableWidth, responsiveWidth);
    const leadingContext = Math.min(width * 0.12, 72);
    const x = clamp(anchorLeft - leadingContext, bounds.left, bounds.right - width);
    const belowTop = anchorBottom + ANCHOR_GAP;
    const belowSpace = Math.max(bounds.bottom - belowTop, 0);
    const aboveSpace = Math.max(anchorTop - ANCHOR_GAP - bounds.top, 0);
    const placeBelow = preferredHeight <= belowSpace || belowSpace >= aboveSpace;
    const availableHeight = Math.max(bounds.bottom - bounds.top, 0);
    const sideSpace = placeBelow ? belowSpace : aboveSpace;
    // Never grow across the caret when neither side can fit the preferred
    // height; a shorter list is less disruptive than covering the text.
    const height = Math.min(preferredHeight, sideSpace, availableHeight);
    const y = placeBelow
        ? clamp(belowTop, bounds.top, bounds.bottom - height)
        : clamp(anchorTop - ANCHOR_GAP - height, bounds.top, bounds.bottom - height);

    return { x, y, width, height, side: placeBelow ? 'below' : 'above' };
}
