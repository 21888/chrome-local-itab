(function initLayout(global) {
    'use strict';

    const clone = value => JSON.parse(JSON.stringify(value));
    const mode = layout => layout?.autoArrange !== false ? 'grid' : layout.alignToGrid ? 'snap' : 'free';
    const flags = value => value === 'grid' ? { autoArrange: true } :
        value === 'free' ? { autoArrange: false, alignToGrid: false } :
            value === 'snap' ? { autoArrange: false, alignToGrid: true } : null;
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const translate = (key, fallback) => global.i18n?.t(key) || fallback;

    // One page's layout intents are ordered here. Strict reads merge only changed
    // fields/position keys; this is not an atomic cross-tab layout transaction.
    class Controller {
        constructor({ storage = global.storageManager, initial, render = () => {}, onApply = () => {}, onError = () => {} }) {
            this.storage = storage;
            this.confirmed = clone(storage.validateLayoutConfig(initial || storage.defaultConfig.layout));
            this.patch = {};
            this.positions = {};
            this.version = 0;
            this.pending = 0;
            this.refreshVersion = 0;
            this.queue = Promise.resolve();
            this.timer = null;
            this.render = render;
            this.onApply = onApply;
            this.onError = onError;
            this.render(this.confirmed, '');
        }

        get modePending() { return Object.keys(this.patch).length > 0; }

        change(patch = {}, positions = {}, { debounce = false } = {}) {
            // Inputs are copied before yielding: callers can keep dragging safely.
            this.failedChange = null;
            this.patch = { ...this.patch, ...clone(patch) };
            this.positions = { ...this.positions, ...clone(positions) };
            ++this.version;
            clearTimeout(this.timer);
            this.timer = null;
            this.render({ ...this.confirmed, ...this.patch }, 'saving');
            if (debounce && !this.modePending) {
                this.timer = setTimeout(() => { this.timer = null; this.flush(); }, 250);
                return Promise.resolve(true);
            }
            return this.flush();
        }

        select(value) {
            const patch = flags(value);
            return patch ? this.change(patch) : Promise.resolve(false);
        }

        retry() {
            return this.failedChange ? this.change(this.failedChange.patch, this.failedChange.positions) : this.refresh();
        }

        flush() {
            clearTimeout(this.timer);
            this.timer = null;
            const version = this.version;
            const patch = clone(this.patch);
            const positions = clone(this.positions);
            if ((!Object.keys(patch).length && !Object.keys(positions).length) || this.queuedVersion === version) return this.queue;
            this.queuedVersion = version;
            this.pending++;
            const task = this.queue.then(async () => {
                if (version !== this.version) return false;
                const previous = await this.storage.getLayoutForUpdate();
                this.confirmed = clone(previous);
                if (version !== this.version) return false;
                const candidate = this.storage.validateLayoutConfig({ ...previous, ...patch, positions: { ...previous.positions, ...positions } });
                this.writing = clone(candidate);
                try {
                    if (!(await this.storage.set('layout', clone(candidate)))) throw new Error('Layout save failed');
                } finally {
                    this.writing = null;
                }
                this.confirmed = clone(candidate);
                if (version === this.version) {
                    this.patch = {};
                    this.positions = {};
                    this.onApply(clone(candidate), 'saved');
                    // Applying a manual mode may initialize missing positions.
                    if (version === this.version) this.render(candidate, 'saved');
                }
                return true;
            }).catch(error => {
                if (version === this.version) {
                    this.failedChange = { patch, positions };
                    this.patch = {};
                    this.positions = {};
                    this.onApply(clone(this.confirmed), 'error');
                    this.render(this.confirmed, 'error');
                    this.onError(error);
                }
                return false;
            }).finally(() => {
                this.pending--;
                if (!this.pending && !this.timer && this.externalChange) {
                    this.externalChange = false;
                    this.refresh();
                }
            });
            this.queue = task;
            return task;
        }

        async refresh() {
            if (this.pending || this.timer || this.modePending) { this.externalChange = true; return; }
            const version = this.version;
            const refreshVersion = ++this.refreshVersion;
            try {
                const value = await this.storage.getLayoutForUpdate();
                if (this.pending || this.timer || version !== this.version || refreshVersion !== this.refreshVersion) return;
                this.failedChange = null;
                this.confirmed = clone(value);
                this.onApply(clone(value), '');
                if (version === this.version) this.render(value, '');
            } catch (error) {
                if (version === this.version && refreshVersion === this.refreshVersion) {
                    this.failedChange = null;
                    this.render(this.confirmed, 'error');
                    this.onError(error);
                }
            }
        }
    }

    function mount(host, controller, { columns, gridSize, onSelect, onRetry } = {}) {
        if (!host) return;
        const doc = host.ownerDocument;
        const label = doc.createElement('label');
        label.className = 'layout-field';
        const text = doc.createElement('span');
        text.textContent = translate('placementMode', 'Placement');
        const select = doc.createElement('select');
        select.dataset.layoutField = 'mode';
        for (const [value, key, fallback] of [['grid', 'placementGrid', 'Grid (default)'], ['free', 'placementFree', 'Free placement'], ['snap', 'placementSnap', 'Manual · snap to grid']]) {
            const option = doc.createElement('option');
            option.value = value;
            option.textContent = translate(key, fallback);
            select.appendChild(option);
        }
        label.append(text, select);
        const status = doc.createElement('span');
        status.className = 'layout-status';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        const retry = doc.createElement('button');
        retry.type = 'button';
        retry.className = 'layout-retry';
        retry.textContent = translate('layoutRetry', 'Retry save');
        retry.hidden = true;
        retry.addEventListener('click', () => onRetry ? onRetry() : controller.retry());
        host.append(label, status, retry);
        controller.render = (value, state) => {
            select.value = mode(value);
            retry.hidden = state !== 'error';
            host.setAttribute('aria-busy', String(state === 'saving'));
            host.dataset.saveState = state;
            status.textContent = state === 'saving' ? translate('layoutSaving', 'Saving…') :
                state === 'saved' ? translate('layoutSaved', 'Saved') :
                    state === 'error' ? translate('layoutSaveFailed', 'Could not save layout. Please try again.') : '';
            if (columns) { columns.value = value.columns; columns.disabled = mode(value) !== 'grid'; }
            if (gridSize) { gridSize.value = value.gridSize; gridSize.disabled = mode(value) !== 'snap'; }
        };
        controller.render(controller.confirmed, '');
        select.addEventListener('change', () => onSelect ? onSelect(select.value) : controller.select(select.value));
        for (const [field, input] of [['columns', columns], ['gridSize', gridSize]]) {
            input?.addEventListener('change', () => {
                const value = Number(input.value);
                if (!input.value.trim() || !Number.isFinite(value)) { controller.render(controller.confirmed, 'error'); return; }
                controller.change({ [field]: value });
            });
        }
        global.addEventListener?.('pagehide', () => controller.flush());
        doc.addEventListener('visibilitychange', () => {
            if (doc.visibilityState === 'hidden') controller.flush();
        });
        global.chrome?.storage?.onChanged?.addListener((changes, area) => {
            // Own notifications can arrive before set() resolves or after it.
            // Do not let them erase a later failure or reinitialize failed keys.
            const value = changes.layout?.newValue;
            if (area === 'local' && changes.layout && !(controller.writing && same(value, controller.writing)) && !same(value, controller.confirmed)) controller.refresh();
        });
    }

    global.LocalItabLayout = { mode, flags, Controller, mount };
})(window);
