const CARET_STYLE_PROPERTIES = [
    'direction',
    'boxSizing',
    'width',
    'height',
    'overflowX',
    'overflowY',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'borderStyle',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'fontStyle',
    'fontVariant',
    'fontWeight',
    'fontStretch',
    'fontSize',
    'fontSizeAdjust',
    'lineHeight',
    'fontFamily',
    'textAlign',
    'textTransform',
    'textIndent',
    'textDecoration',
    'letterSpacing',
    'wordSpacing',
    'tabSize',
    'MozTabSize',
];

function getDocument(element) {
    const ownerDocument = element?.ownerDocument;
    return ownerDocument?.createElement ? ownerDocument : document;
}

function getLineHeightPx(nodeName, computedStyle, ownerDocument) {
    const tempNode = ownerDocument.createElement(nodeName);
    tempNode.innerHTML = '&nbsp;';
    Object.assign(tempNode.style, {
        fontSize: computedStyle.fontSize,
        fontFamily: computedStyle.fontFamily,
        padding: '0',
        position: 'absolute',
    });
    ownerDocument.body.appendChild(tempNode);

    if (typeof HTMLTextAreaElement !== 'undefined' && tempNode instanceof HTMLTextAreaElement) {
        tempNode.rows = 1;
    }

    const height = tempNode.offsetHeight;
    ownerDocument.body.removeChild(tempNode);
    return height;
}

/**
 * Gets the viewport-relative pixel coordinates of the caret in an input.
 * The mirror element must copy the input's wrapping and typography so a
 * multiline prompt anchors to the active line instead of the textarea box.
 */
export function getCaretCoordinates(element) {
    const ownerDocument = getDocument(element);
    const view = ownerDocument.defaultView || globalThis.window;
    const isInput = element.nodeName === 'INPUT';
    const isFirefox = view?.mozInnerScreenX != null;
    const mirror = ownerDocument.createElement('div');
    const computed = view.getComputedStyle(element);

    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    if (!isInput) mirror.style.wordWrap = 'break-word';

    CARET_STYLE_PROPERTIES.forEach(property => {
        if (isInput && property === 'lineHeight') {
            if (computed.boxSizing === 'border-box') {
                const height = parseInt(computed.height, 10);
                const outerHeight = parseInt(computed.paddingTop, 10)
                    + parseInt(computed.paddingBottom, 10)
                    + parseInt(computed.borderTopWidth, 10)
                    + parseInt(computed.borderBottomWidth, 10);
                const targetHeight = outerHeight + parseInt(computed.lineHeight, 10);
                mirror.style.lineHeight = height > targetHeight
                    ? `${height - outerHeight}px`
                    : height === targetHeight ? computed.lineHeight : '0';
            } else {
                mirror.style.lineHeight = computed.height;
            }
        } else {
            mirror.style[property] = computed[property];
        }
    });

    const computedLineHeight = computed.lineHeight;
    const lineHeight = computedLineHeight === 'normal'
        ? getLineHeightPx(element.nodeName, computed, ownerDocument)
        : parseFloat(computedLineHeight);

    if (isFirefox) {
        if (element.scrollHeight > parseInt(computed.height, 10)) mirror.style.overflowY = 'scroll';
    } else {
        mirror.style.overflow = 'hidden';
    }

    mirror.textContent = element.value.substring(0, element.selectionStart);
    const marker = ownerDocument.createElement('span');
    marker.textContent = element.value.substring(element.selectionStart) || '.';
    mirror.appendChild(marker);
    ownerDocument.body.appendChild(mirror);

    const coordinates = {
        top: marker.offsetTop + (parseInt(computed.borderTopWidth, 10) || 0),
        left: marker.offsetLeft + (parseInt(computed.borderLeftWidth, 10) || 0),
        lineHeight,
    };
    const rect = element.getBoundingClientRect();
    // The mirror describes the full unscrolled content, so convert it back to
    // the visible viewport position before the popup layout uses it.
    coordinates.top = rect.top - element.scrollTop + coordinates.top;
    coordinates.left = rect.left - element.scrollLeft + coordinates.left;
    ownerDocument.body.removeChild(mirror);
    return coordinates;
}

function getRenderedScale(element, fallbackScale = 1) {
    const rect = element.getBoundingClientRect();
    const fallback = Number.isFinite(Number(fallbackScale)) && Number(fallbackScale) > 0
        ? Number(fallbackScale)
        : 1;
    const layoutWidth = Number(element.offsetWidth) || Number(element.clientWidth);
    const layoutHeight = Number(element.offsetHeight) || Number(element.clientHeight);
    const renderedWidth = Number.isFinite(rect.width) ? rect.width : rect.right - rect.left;
    const renderedHeight = Number.isFinite(rect.height) ? rect.height : rect.bottom - rect.top;

    return {
        x: layoutWidth > 0 && renderedWidth > 0 ? renderedWidth / layoutWidth : fallback,
        y: layoutHeight > 0 && renderedHeight > 0 ? renderedHeight / layoutHeight : fallback,
    };
}

/**
 * Returns a viewport-relative, scaled rectangle for the active caret.
 * `right` equals `left` because the caret has no layout width.
 */
export function getScaledCaretAnchor(element, scale = 1) {
    const rect = element.getBoundingClientRect();
    const caret = getCaretCoordinates(element);
    const renderedScale = getRenderedScale(element, scale);
    const left = rect.left + (caret.left - rect.left) * renderedScale.x;
    const top = rect.top + (caret.top - rect.top) * renderedScale.y;
    const lineHeight = caret.lineHeight * renderedScale.y;

    return {
        left,
        top,
        right: left,
        bottom: top + lineHeight,
        lineHeight,
    };
}
