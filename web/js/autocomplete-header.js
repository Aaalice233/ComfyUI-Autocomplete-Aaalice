import { formatCountHumanReadable } from './utils.js';
import { getCurrentInterfaceLocale, getInterfaceText } from './localization.js';

export function createPopupCloseButton({ labelKey = 'autocompleteClose', onClose } = {}) {
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'autocomplete-plus-header-close';
    closeButton.addEventListener('mousedown', event => {
        event.preventDefault();
        event.stopPropagation();
    });
    closeButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        onClose?.();
    });

    const updateLabel = () => {
        const closeLabel = getInterfaceText(labelKey, {}, getCurrentInterfaceLocale());
        closeButton.textContent = '×';
        closeButton.title = closeLabel;
        closeButton.setAttribute('aria-label', closeLabel);
    };
    updateLabel();

    return { element: closeButton, updateLabel };
}

export function createAutocompleteHeader({ onClose } = {}) {
    const header = document.createElement('header');
    header.id = 'autocomplete-plus-header';
    header.className = 'autocomplete-plus-popup-header autocomplete-plus-header';

    const context = document.createElement('div');
    context.className = 'autocomplete-plus-header-context';

    const title = document.createElement('span');
    title.className = 'autocomplete-plus-header-title';

    const query = document.createElement('code');
    query.className = 'autocomplete-plus-header-query';

    const resultCount = document.createElement('span');
    resultCount.className = 'autocomplete-plus-header-count';
    resultCount.setAttribute('aria-live', 'polite');

    const hint = document.createElement('span');
    hint.className = 'autocomplete-plus-header-hint';

    context.append(title, query, resultCount, hint);

    const closeButton = createPopupCloseButton({ onClose });
    header.append(context, closeButton.element);

    const renderLabels = () => {
        const locale = getCurrentInterfaceLocale();
        const headerTitle = getInterfaceText('autocompleteHeaderTitle', {}, locale);
        const queryLabel = getInterfaceText('autocompleteHeaderQueryLabel', {}, locale);
        const hintText = getInterfaceText('autocompleteHeaderHint', {}, locale);

        header.setAttribute('aria-label', headerTitle);
        title.textContent = headerTitle;
        query.setAttribute('aria-label', queryLabel);
        hint.textContent = hintText;
        closeButton.updateLabel();
    };

    const setState = ({ queryText = '', resultCount: count = 0 } = {}) => {
        renderLabels();
        query.textContent = queryText;
        query.title = queryText;
        const normalizedCount = Math.max(Number(count) || 0, 0);
        const formattedCount = formatCountHumanReadable(normalizedCount);
        const resultLabel = getInterfaceText(
            'autocompleteHeaderResultCount',
            { count: formattedCount },
        );
        if (resultCount.textContent !== resultLabel) {
            resultCount.textContent = resultLabel;
            resultCount.setAttribute('aria-label', resultLabel);
        }
        resultCount.title = getInterfaceText(
            'autocompleteHeaderResultCount',
            { count: String(normalizedCount) },
        );
    };

    renderLabels();
    setState();

    return {
        element: header,
        setState,
    };
}
