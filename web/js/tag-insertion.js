import { getCurrentTagRange, getTagRangeForRelatedTags } from './utils.js';

function skipHorizontalWhitespace(text, index) {
    let nextIndex = index;
    while (nextIndex < text.length && (text[nextIndex] === ' ' || text[nextIndex] === '\t')) {
        nextIndex++;
    }
    return nextIndex;
}

/**
 * Builds the edit used when accepting an autocomplete candidate.
 * The candidate is already normalized by the caller because model tags and
 * ordinary tags intentionally use different normalization rules.
 */
export function buildAutocompleteInsertionEdit(text, cursorPos, tagToInsert, autoInsertComma) {
    const safeText = typeof text === 'string' ? text : '';
    const safeCursorPos = Math.min(Math.max(cursorPos, 0), safeText.length);
    const tagRange = getCurrentTagRange(safeText, safeCursorPos);

    const replaceStart = tagRange ? Math.min(safeCursorPos, tagRange.start) : safeCursorPos;
    let replaceEnd = safeCursorPos;

    if (tagRange) {
        const remainder = safeText.substring(safeCursorPos, tagRange.end).trimEnd();
        if (remainder && tagToInsert.includes(remainder)) {
            replaceEnd = safeCursorPos + remainder.length;
        }
    }

    const needsLeadingSpace = safeText[replaceStart - 1] === ',';
    const nextNonWhitespace = skipHorizontalWhitespace(safeText, replaceEnd);
    const nextCharacter = safeText[nextNonWhitespace];
    const hasExistingSeparator = nextCharacter === ',' || nextCharacter === ':';

    // Whitespace immediately before an existing separator belongs to the
    // replaced fragment. This prevents output such as "tag , next".
    if (nextNonWhitespace > replaceEnd && hasExistingSeparator) {
        replaceEnd = nextNonWhitespace;
    }

    const prefix = needsLeadingSpace ? ' ' : '';
    const suffix = autoInsertComma && !hasExistingSeparator ? ', ' : '';

    return {
        start: replaceStart,
        end: replaceEnd,
        replacement: prefix + tagToInsert + suffix
    };
}

/**
 * Builds an edit that inserts a related tag after the tag at the cursor.
 * Existing separators are replaced as one unit so a trailing comma cannot
 * become an empty tag between the source tag and the inserted tag.
 */
export function buildRelatedTagInsertionEdit(text, cursorPos, tagToInsert, autoInsertComma) {
    const safeText = typeof text === 'string' ? text : '';
    const safeCursorPos = Math.min(Math.max(cursorPos, 0), safeText.length);
    const tagRange = getTagRangeForRelatedTags(safeText, safeCursorPos);

    if (!tagRange) {
        return buildAutocompleteInsertionEdit(safeText, safeCursorPos, tagToInsert, autoInsertComma);
    }

    // getTagRangeForRelatedTags may exclude weights or wrapping parentheses.
    // Walk to the real segment boundary before inserting, keeping that syntax intact.
    let segmentEnd = tagRange.end;
    while (segmentEnd < safeText.length && safeText[segmentEnd] !== ',' && safeText[segmentEnd] !== '\n') {
        segmentEnd++;
    }

    let replaceEnd = segmentEnd;
    if (safeText[segmentEnd] === ',') {
        // Consume adjacent empty comma slots as well as their spaces. Besides
        // preventing new duplicates, this repairs already malformed gaps.
        while (replaceEnd < safeText.length &&
            (safeText[replaceEnd] === ',' || safeText[replaceEnd] === ' ' || safeText[replaceEnd] === '\t')) {
            replaceEnd++;
        }
    }

    const hasFollowingTag = replaceEnd < safeText.length && safeText[replaceEnd] !== '\n';
    const shouldKeepTrailingSeparator = hasFollowingTag || autoInsertComma;
    const trailingSeparator = shouldKeepTrailingSeparator
        ? (safeText[replaceEnd] === '\n' ? ',' : ', ')
        : '';

    return {
        start: segmentEnd,
        end: replaceEnd,
        replacement: `, ${tagToInsert}${trailingSeparator}`
    };
}

/**
 * Applies a text edit through insertText so browser undo keeps working.
 */
export function applyTextInsertionEdit(inputElement, originalText, edit) {
    inputElement.focus();
    inputElement.setSelectionRange(edit.start, edit.end);

    const insertTextSuccess = document.execCommand('insertText', false, edit.replacement);
    if (insertTextSuccess) {
        return;
    }

    console.warn('[Autocomplete-Plus] execCommand("insertText") failed. Falling back to direct value manipulation (Undo might not work).');
    inputElement.value = originalText.substring(0, edit.start) + edit.replacement + originalText.substring(edit.end);
    const newCursorPos = edit.start + edit.replacement.length;
    inputElement.selectionStart = inputElement.selectionEnd = newCursorPos;
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
}
