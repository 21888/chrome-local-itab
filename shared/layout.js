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
            this.identityPositions = {};
            this.version = 0;
            this.pending = 0;
            this.refreshVersion = 0;
            // Raw Settings inputs have not submitted a layout intent yet.
            this.inputDrafts = new Map();
            this.inputExpectations = {};
            // In-memory read fence only; BigInt never wraps or enters saved data.
            this.shortcutMutationEpoch = 0n;
            this.queue = Promise.resolve();
            this.timer = null;
            this.render = render;
            this.onApply = onApply;
            this.onError = onError;
            this.render(this.confirmed, this.invalidated ? 'reload' : '');
        }

        hasUncommittedWork() { return Boolean(this.inputDrafts.size || this.failedChange || this.pending || this.timer); }

        get modePending() { return this.invalidated || this.externalHold > 0 || this.identityPending || Object.keys(this.patch).length > 0; }

        change(patch = {}, positions = {}, { debounce = false, identityPositions = {}, inputBaseline = null } = {}) {
            if (this.externalHold > 0 || this.identityPending) return Promise.resolve(false);
            if (this.invalidated) { this.render(this.confirmed, 'reload'); return Promise.resolve(false); }
            const links = clone(this.getLinks ? this.getLinks() : this.links);
            const hasIntent = Object.keys(this.patch).length || Object.keys(this.positions).length || Object.keys(this.identityPositions).length;
            if (hasIntent && !same(links, this.intentLinks)) {
                // Never bless pre-CRUD deltas with the initializer's newer list.
                this.invalidateContext();
                return Promise.resolve(false);
            }
            if (!hasIntent) this.intentLinks = links;
            for (const field of ['columns', 'gridSize']) {
                if (!(field in patch)) continue;
                if (inputBaseline) this.inputExpectations[field] = clone(inputBaseline);
                else delete this.inputExpectations[field];
            }
            // Inputs are copied before yielding: callers can keep dragging safely.
            this.failedChange = null;
            this.patch = { ...this.patch, ...clone(patch) };
            this.positions = { ...this.positions, ...clone(positions) };
            this.identityPositions = { ...this.identityPositions, ...clone(identityPositions) };
            this.identityPending = global.LocalItabIdentity?.needs(links) && ({ ...this.confirmed, ...this.patch }).autoArrange === false;
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
            if (this.invalidated) {
                // Use the same pending-write/draft choice as other page reloads.
                // Browser beforeunload alone is not a reliable save boundary.
                if (global.LocalItabContentLifecycle?.reload) global.LocalItabContentLifecycle.reload();
                else global.location?.reload();
                return Promise.resolve(false);
            }
            return this.failedChange ? this.change(this.failedChange.patch, this.failedChange.positions, { identityPositions: this.failedChange.identityPositions }) : this.refresh();
        }

        flush() {
            clearTimeout(this.timer);
            this.timer = null;
            const version = this.version;
            const patch = clone(this.patch);
            const positions = clone(this.positions);
            const identityPositions = clone(this.identityPositions);
            const intentLinks = clone(this.intentLinks || this.links);
            if ((!Object.keys(patch).length && !Object.keys(positions).length && !Object.keys(identityPositions).length) || this.queuedVersion === version) return this.queue;
            this.queuedVersion = version;
            this.pending++;
            const task = this.queue.then(async () => {
                if (version !== this.version) return false;
                let snapshot;
                try {
                    const expected = { layout: clone(this.confirmed), generation: this.generation, links: intentLinks };
                    for (const field of ['columns', 'gridSize']) {
                        const baseline = field in patch && this.inputExpectations[field];
                        if (!baseline) continue;
                        if (baseline.generation !== expected.generation || !same(baseline.links, expected.links)) {
                            const error = new Error('Page data changed. Reload before arranging shortcuts.');
                            error.code = 'LAYOUT_CONTEXT_CHANGED'; throw error;
                        }
                        expected.layout[field] = baseline.value;
                    }
                    snapshot = await this.storage.applyLayoutPatch(patch, positions, expected,
                        candidate => { this.writing = clone(candidate); }, identityPositions);
                } finally { this.writing = null; }
                // Advance later typing only for this page's successful write to
                // the same field. An unrelated mode save must not bless a newer
                // external numeric value as an existing draft's baseline.
                for (const field of ['columns', 'gridSize']) {
                    if (!(field in patch)) continue;
                    for (const baseline of [this.inputExpectations[field], this.inputDrafts.get(field)?.baseline]) {
                        if (baseline) Object.assign(baseline, { value: snapshot.layout[field], generation: snapshot.generation, links: clone(snapshot.links) });
                    }
                }
                this.confirmed = clone(snapshot.layout);
                this.generation = snapshot.generation;
                this.links = clone(snapshot.links);
                this.identityPending = false;
                const candidate = snapshot.layout;
                if (version === this.version) {
                    this.patch = {};
                    this.positions = {}; this.identityPositions = {};
                    this.onApply(clone(candidate), 'saved', clone(snapshot));
                    // Applying a manual mode may initialize missing positions.
                    if (version === this.version) this.render(candidate, 'saved');
                }
                return true;
            }).catch(error => {
                this.identityPending = false;
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
                    const failedChange = { patch: clone(this.patch), positions: clone(this.positions), identityPositions: clone(this.identityPositions) };
                    ++this.version;
                    clearTimeout(this.timer); this.timer = null;
                    this.patch = {}; this.positions = {}; this.identityPositions = {};
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
                    this.failedChange = { patch, positions, identityPositions };
                    this.patch = {};
                    this.positions = {}; this.identityPositions = {};
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

        holdShortcutMutation() {
            this.shortcutMutationEpoch += 1n;
            if (!this.externalHold) this.shortcutMutationSaved = false;
            this.externalHold = (this.externalHold || 0) + 1;
            this.render(this.confirmed, 'saving');
        }

        adoptOwnShortcutSnapshot(snapshot) {
            this.shortcutMutationSaved = true;
            this.adoptSnapshot(snapshot);
            this.invalidated = false;
            this.failedChange = null;
            this.render(this.confirmed, 'saved');
        }

        releaseShortcutMutation() {
            this.externalHold = Math.max(0, (this.externalHold || 0) - 1);
            if (this.externalHold) return;
            // A successful CRUD snapshot was rendered while the hold still
            // disabled the selector. Repaint after the final owner releases it,
            // including failed/cancelled operations that adopted no snapshot.
            const state = this.invalidated ? 'reload' : this.failedChange ? 'error' :
                this.pending || this.timer ? 'saving' : this.shortcutMutationSaved ? 'saved' : '';
            this.render(this.confirmed, state);
            if (this.externalChange) { this.externalChange = false; this.refresh(); }
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
            this.patch = {}; this.positions = {}; this.identityPositions = {}; this.failedChange = null;
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
        const inputs = [['columns', columns], ['gridSize', gridSize]];
        let renderedState = '';
        const renderStatus = state => {
            status.textContent = state === 'saving' ? translate('layoutSaving', 'Saving…') :
                state === 'conflict' ? (controller.inputDrafts.size
                    ? translate('layoutInputConflict', 'Layout changed in another page. Your input is kept. Open a new Settings tab to review the saved numbers before retrying.')
                    : translate('layoutChangedElsewhere', 'Layout changed in another page. Review it, then retry your change.')) :
                    state === 'reload' ? translate('layoutContextChanged', 'Page data changed or could not be read safely. Reload before arranging shortcuts.') :
                        state === 'unavailable' ? translate('layoutSavingUnavailable', 'Safe layout saving is unavailable. Update Chrome and reload this page.') :
                            state === 'error' ? translate('layoutSaveFailed', 'Could not save layout. Please try again.') :
                                controller.inputDrafts.size ? translate('layoutInputUnsaved', 'Unsaved layout input. Finish editing the number to save.') :
                                    state === 'saved' ? translate('layoutSaved', 'Saved') : '';
        };
        controller.render = (value, state) => {
            renderedState = state;
            select.value = mode(value);
            select.disabled = state === 'reload' || controller.identityPending || controller.externalHold > 0;
            retry.hidden = !['error', 'conflict', 'reload', 'unavailable'].includes(state);
            retry.textContent = state === 'reload' ? translate('layoutReload', 'Reload page') : translate('layoutRetry', 'Retry save');
            host.setAttribute('aria-busy', String(state === 'saving'));
            host.dataset.saveState = state;
            for (const [field, input] of inputs) {
                if (!input) continue;
                const draft = controller.inputDrafts.get(field);
                // Only a submitted draft acknowledged by this successful render
                // becomes clean. Later input creates a new, unsubmitted owner.
                if (state === 'saved' && draft?.submittedValue === value[field]) controller.inputDrafts.delete(field);
                if (!controller.inputDrafts.has(field)) input.value = value[field];
                input.disabled = state === 'reload' || mode(value) !== (field === 'columns' ? 'grid' : 'snap');
            }
            renderStatus(state);
        };
        controller.render(controller.confirmed, controller.invalidated ? 'reload' : '');
        select.addEventListener('change', () => onSelect ? onSelect(select.value) : controller.select(select.value));
        for (const [field, input] of inputs) {
            input?.addEventListener('input', () => {
                if (input.disabled || controller.invalidated) return;
                if (!controller.pending && input.value === String(controller.confirmed[field])) controller.inputDrafts.delete(field);
                else controller.inputDrafts.set(field, { raw: input.value, baseline: controller.inputDrafts.get(field)?.baseline ||
                    { value: controller.confirmed[field], generation: controller.generation, links: clone(controller.links) } });
                renderStatus(renderedState);
            });
            input?.addEventListener('change', () => {
                // A delayed blur after an external invalidation/mode change must
                // never submit this field to another layout context.
                if (input.disabled || controller.invalidated) return;
                const value = Number(input.value);
                if (!input.value.trim() || !Number.isFinite(value)) {
                    controller.inputDrafts.delete(field);
                    controller.render(controller.confirmed, 'error');
                        return;
                }
                const baseline = controller.inputDrafts.get(field)?.baseline || { value: controller.confirmed[field], generation: controller.generation, links: clone(controller.links) };
                const draft = { raw: input.value, baseline, submittedValue: controller.storage.validateLayoutConfig({ ...controller.confirmed, [field]: value })[field] };
                controller.inputDrafts.set(field, draft);
                controller.change({ [field]: value }, {}, { inputBaseline: baseline });
            });
        }
        global.addEventListener?.('pagehide', () => controller.flush());
        doc.addEventListener('visibilitychange', () => {
            if (doc.visibilityState === 'hidden') controller.flush();
        });
        global.storageManager?.onLocalChanged((changes, area) => {
            // Own notifications can arrive before set() resolves or after it.
            // Do not let them erase a later failure or reinitialize failed keys.
            const value = changes.layout?.newValue;
            if (area === 'local' && changes[controller.storage.layoutGenerationKey]) { controller.refresh(); return; }
            if (area === 'local' && changes.layout && !(controller.writing && same(value, controller.writing)) && !same(value, controller.confirmed)) controller.refresh();
        });
    }

    global.LocalItabLayout = { mode, flags, Controller, mount };
})(window);
