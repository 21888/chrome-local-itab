(function initLayout(global) {
    'use strict';

    const clone = value => JSON.parse(JSON.stringify(value));
    const mode = layout => layout?.autoArrange !== false ? 'grid' : layout.alignToGrid ? 'snap' : 'free';
    const flags = value => value === 'grid' ? { autoArrange: true } :
        value === 'free' ? { autoArrange: false, alignToGrid: false } :
            value === 'snap' ? { autoArrange: false, alignToGrid: true } : null;
    const same = (a, b) => {
        if (a === b) return true;
        if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
        const keys = Object.keys(a);
        return Array.isArray(a) === Array.isArray(b) && keys.length === Object.keys(b).length &&
            keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && same(a[key], b[key]));
    };
    const translate = (key, fallback) => global.i18n?.t(key) || fallback;

    // Page-local ownership orders intents; StorageManager atomically checks and
    // merges their captured baselines under the shared origin write lock.
    class Controller {
        constructor({ storage = global.storageManager, initial, baseline, getLinks, render = () => {}, onApply = () => {}, onError = () => {} }) {
            this.storage = storage;
            this.confirmed = clone(storage.validateLayoutConfig(initial || storage.defaultConfig.layout));
            this.generation = baseline?.generation;
            this.links = clone(baseline?.links || []);
            this.getLinks = getLinks;
            this.invalidated = !baseline;
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
            this.render(this.confirmed, this.invalidated ? 'reload' : '');
        }

        get modePending() { return this.invalidated || Object.keys(this.patch).length > 0; }

        change(patch = {}, positions = {}, { debounce = false } = {}) {
            if (this.invalidated) { this.render(this.confirmed, 'reload'); return Promise.resolve(false); }
            const links = clone(this.getLinks ? this.getLinks() : this.links);
            const hasIntent = Object.keys(this.patch).length || Object.keys(this.positions).length;
            if (hasIntent && !same(links, this.intentLinks)) {
                // Never bless pre-CRUD deltas with the initializer's newer list.
                this.invalidateContext();
                return Promise.resolve(false);
            }
            if (!hasIntent) this.intentLinks = links;
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
            if (this.invalidated) { global.location?.reload(); return Promise.resolve(false); }
            return this.failedChange ? this.change(this.failedChange.patch, this.failedChange.positions) : this.refresh();
        }

        flush() {
            clearTimeout(this.timer);
            this.timer = null;
            const version = this.version;
            const patch = clone(this.patch);
            const positions = clone(this.positions);
            const intentLinks = clone(this.intentLinks || this.links);
            if ((!Object.keys(patch).length && !Object.keys(positions).length) || this.queuedVersion === version) return this.queue;
            this.queuedVersion = version;
            this.pending++;
            const task = this.queue.then(async () => {
                if (version !== this.version) return false;
                let snapshot;
                try {
                    snapshot = await this.storage.applyLayoutPatch(patch, positions, {
                        layout: clone(this.confirmed), generation: this.generation, links: intentLinks
                    }, candidate => { this.writing = clone(candidate); });
                } finally { this.writing = null; }
                this.confirmed = clone(snapshot.layout);
                this.generation = snapshot.generation;
                this.links = clone(snapshot.links);
                const candidate = snapshot.layout;
                if (version === this.version) {
                    this.patch = {};
                    this.positions = {};
                    this.onApply(clone(candidate), 'saved');
                    // Applying a manual mode may initialize missing positions.
                    if (version === this.version) this.render(candidate, 'saved');
                }
                return true;
            }).catch(error => {
                if (error.code === 'LAYOUT_CONTEXT_CHANGED') {
                    if (error.latestLayoutSnapshot) this.adoptSnapshot(error.latestLayoutSnapshot);
                    this.invalidateContext();
                    this.onError(error);
                    return false;
                }
                if (error.code === 'LAYOUT_CONFLICT' && this.invalidated) { this.render(this.confirmed, 'reload'); return false; }
                if (error.code === 'LAYOUT_CONFLICT') {
                    // This invalidates newer queued intents too: only a deliberate
                    // Retry may rebase their combined patch onto the latest data.
                    const failedChange = { patch: clone(this.patch), positions: clone(this.positions) };
                    ++this.version;
                    clearTimeout(this.timer); this.timer = null;
                    this.patch = {}; this.positions = {};
                    this.adoptSnapshot(error.latestLayoutSnapshot);
                    this.failedChange = failedChange;
                    this.externalChange = false;
                    this.onApply(clone(this.confirmed), 'error');
                    this.render(this.confirmed, 'conflict');
                    this.onError(error);
                    return false;
                }
                if (version === this.version) {
                    this.externalChange = false;
                    this.failedChange = { patch, positions };
                    this.patch = {};
                    this.positions = {};
                    this.onApply(clone(this.confirmed), 'error');
                    this.render(this.confirmed, error.code === 'LAYOUT_LOCK_UNAVAILABLE' ? 'unavailable' : 'error');
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

        adoptSnapshot(snapshot) {
            this.confirmed = clone(snapshot.layout);
            this.generation = snapshot.generation;
            this.links = clone(snapshot.links);
        }

        invalidateContext() {
            ++this.version;
            clearTimeout(this.timer); this.timer = null;
            this.invalidated = true;
            this.patch = {}; this.positions = {}; this.failedChange = null;
            this.externalChange = false;
            this.onApply(clone(this.confirmed), 'error');
            this.render(this.confirmed, 'reload');
        }

        async refresh() {
            if (this.invalidated) return;
            if (this.pending || this.timer || this.modePending) { this.externalChange = true; return; }
            const version = this.version;
            const refreshVersion = ++this.refreshVersion;
            try {
                const snapshot = await this.storage.getLayoutSnapshotForUpdate();
                const value = snapshot.layout;
                if (this.pending || this.timer || version !== this.version || refreshVersion !== this.refreshVersion) return;
                if (snapshot.generation !== this.generation || (this.getLinks && !same(snapshot.links, this.getLinks()))) {
                    this.adoptSnapshot(snapshot);
                    this.invalidateContext();
                    return;
                }
                this.failedChange = null;
                this.adoptSnapshot(snapshot);
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
            select.disabled = state === 'reload';
            retry.hidden = !['error', 'conflict', 'reload', 'unavailable'].includes(state);
            retry.textContent = state === 'reload' ? translate('layoutReload', 'Reload page') : translate('layoutRetry', 'Retry save');
            host.setAttribute('aria-busy', String(state === 'saving'));
            host.dataset.saveState = state;
            status.textContent = state === 'saving' ? translate('layoutSaving', 'Saving…') :
                state === 'saved' ? translate('layoutSaved', 'Saved') :
                    state === 'conflict' ? translate('layoutChangedElsewhere', 'Layout changed in another page. Review it, then retry your change.') :
                        state === 'reload' ? translate('layoutContextChanged', 'Page data changed or could not be read safely. Reload before arranging shortcuts.') :
                            state === 'unavailable' ? translate('layoutSavingUnavailable', 'Safe layout saving is unavailable. Update Chrome and reload this page.') :
                                state === 'error' ? translate('layoutSaveFailed', 'Could not save layout. Please try again.') : '';
            if (columns) { columns.value = value.columns; columns.disabled = state === 'reload' || mode(value) !== 'grid'; }
            if (gridSize) { gridSize.value = value.gridSize; gridSize.disabled = state === 'reload' || mode(value) !== 'snap'; }
        };
        controller.render(controller.confirmed, controller.invalidated ? 'reload' : '');
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
            if (area === 'local' && changes[controller.storage.layoutGenerationKey]) { controller.refresh(); return; }
            if (area === 'local' && changes.layout && !(controller.writing && same(value, controller.writing)) && !same(value, controller.confirmed)) controller.refresh();
        });
    }

    global.LocalItabLayout = { mode, flags, Controller, mount };
})(window);
