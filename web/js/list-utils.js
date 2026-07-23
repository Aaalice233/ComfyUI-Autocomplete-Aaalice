export const VIRTUAL_ROW_HEIGHT = 32;
export const VIRTUAL_OVERSCAN_ROWS = 6;

export function getVirtualRange(itemCount, scrollTop, clientHeight, options = {}) {
    const rowHeight = options.rowHeight || VIRTUAL_ROW_HEIGHT;
    const overscan = options.overscan ?? VIRTUAL_OVERSCAN_ROWS;
    const fallbackVisibleRows = options.fallbackVisibleRows || 20;
    const visibleRows = clientHeight > 0
        ? Math.ceil(clientHeight / rowHeight)
        : fallbackVisibleRows;
    const firstVisible = Math.floor(Math.max(scrollTop, 0) / rowHeight);
    const start = Math.max(firstVisible - overscan, 0);
    const end = Math.min(firstVisible + visibleRows + overscan, itemCount);
    return { start, end };
}

export class VirtualKeyedList {
    constructor(container, options) {
        this.container = container;
        this.options = options;
        this.items = [];
        this.topSpacer = document.createElement('div');
        this.topSpacer.className = 'autocomplete-plus-virtual-spacer';
        this.topSpacer.dataset.virtualSpacer = 'top';
        this.bottomSpacer = document.createElement('div');
        this.bottomSpacer.className = 'autocomplete-plus-virtual-spacer';
        this.bottomSpacer.dataset.virtualSpacer = 'bottom';
    }

    setItems(items) {
        this.items = Array.isArray(items) ? items : [];
        this.render();
    }

    clear() {
        this.items = [];
        this.container.replaceChildren();
    }

    render() {
        const rowHeight = this.options.rowHeight || VIRTUAL_ROW_HEIGHT;
        const { start, end } = getVirtualRange(
            this.items.length,
            this.container.scrollTop,
            this.container.clientHeight,
            this.options,
        );
        this.topSpacer.style.blockSize = `${start * rowHeight}px`;
        this.bottomSpacer.style.blockSize = `${(this.items.length - end) * rowHeight}px`;
        if (this.topSpacer.parentNode !== this.container) this.container.prepend(this.topSpacer);
        if (this.bottomSpacer.parentNode !== this.container) this.container.append(this.bottomSpacer);

        const existing = new Map(
            Array.from(this.container.children)
                .filter(child => child.dataset.listKey)
                .map(child => [child.dataset.listKey, child]),
        );
        let insertionPoint = this.topSpacer.nextElementSibling;
        for (let index = start; index < end; index++) {
            const item = this.items[index];
            const key = this.options.getKey(item, index);
            const signature = this.options.getSignature(item, index);
            let row = existing.get(key);
            if (!row || row.dataset.renderSignature !== signature) {
                const replacement = this.options.createElement(item, index);
                if (row) row.replaceWith(replacement);
                row = replacement;
            }
            row.dataset.listKey = key;
            row.dataset.renderSignature = signature;
            this.options.updateElement?.(row, item, index);
            if (row !== insertionPoint) this.container.insertBefore(row, insertionPoint || this.bottomSpacer);
            insertionPoint = row.nextElementSibling;
            existing.delete(key);
        }
        for (const row of existing.values()) row.remove();
        if (this.bottomSpacer !== this.container.lastElementChild) this.container.append(this.bottomSpacer);
    }

    scrollToIndex(index) {
        if (index < 0 || index >= this.items.length) return;
        const rowHeight = this.options.rowHeight || VIRTUAL_ROW_HEIGHT;
        const rowTop = index * rowHeight;
        const rowBottom = rowTop + rowHeight;
        if (rowTop < this.container.scrollTop) {
            this.container.scrollTop = rowTop;
        } else if (rowBottom > this.container.scrollTop + this.container.clientHeight) {
            this.container.scrollTop = rowBottom - this.container.clientHeight;
        }
        this.render();
    }
}
