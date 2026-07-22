import {
    buildAutocompleteInsertionEdit,
    buildRelatedTagInsertionEdit
} from '../../web/js/tag-insertion.js';

function applyEdit(text, edit) {
    return text.substring(0, edit.start) + edit.replacement + text.substring(edit.end);
}

describe('autocomplete tag insertion formatting', () => {
    test('replaces a partial tag after an existing comma with one space', () => {
        const text = '1girl,blu';
        const edit = buildAutocompleteInsertionEdit(text, text.length, 'blue hair', true);

        expect(applyEdit(text, edit)).toBe('1girl, blue hair, ');
    });

    test('reuses an existing separator instead of adding another comma', () => {
        const text = '1g   , long hair';
        const edit = buildAutocompleteInsertionEdit(text, 2, '1girl', true);

        expect(applyEdit(text, edit)).toBe('1girl, long hair');
    });

    test('does not append a trailing separator when automatic comma insertion is disabled', () => {
        const text = '1g';
        const edit = buildAutocompleteInsertionEdit(text, text.length, '1girl', false);

        expect(applyEdit(text, edit)).toBe('1girl');
    });
});

describe('related tag insertion formatting', () => {
    test('inserts between two tags without creating an empty tag', () => {
        const text = '1girl, looking at viewer, long hair';
        const cursorPos = text.indexOf('viewer');
        const edit = buildRelatedTagInsertionEdit(text, cursorPos, 'smile', true);

        expect(applyEdit(text, edit)).toBe('1girl, looking at viewer, smile, long hair');
    });

    test('uses the existing trailing comma as the separator before the related tag', () => {
        const text = '1girl, looking at viewer, ';
        const edit = buildRelatedTagInsertionEdit(text, text.length, 'long hair', true);

        expect(applyEdit(text, edit)).toBe('1girl, looking at viewer, long hair, ');
    });

    test('repairs repeated comma slots while inserting a related tag', () => {
        const text = '1girl, looking at viewer, , long hair';
        const cursorPos = text.indexOf('viewer');
        const edit = buildRelatedTagInsertionEdit(text, cursorPos, 'smile', true);

        expect(applyEdit(text, edit)).toBe('1girl, looking at viewer, smile, long hair');
    });

    test('does not leave a trailing comma when automatic comma insertion is disabled', () => {
        const text = '1girl';
        const edit = buildRelatedTagInsertionEdit(text, text.length, 'smile', false);

        expect(applyEdit(text, edit)).toBe('1girl, smile');
    });

    test('keeps related tag insertion on the current line', () => {
        const text = '1girl\nlong hair';
        const edit = buildRelatedTagInsertionEdit(text, 3, 'smile', true);

        expect(applyEdit(text, edit)).toBe('1girl, smile,\nlong hair');
    });

    test('preserves prompt weights around the source tag', () => {
        const text = '(looking at viewer:1.2), long hair';
        const edit = buildRelatedTagInsertionEdit(text, 8, 'smile', true);

        expect(applyEdit(text, edit)).toBe('(looking at viewer:1.2), smile, long hair');
    });
});
