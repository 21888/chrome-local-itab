(function initAppearance(global) {
    'use strict';

    const same = (a, b) => a?.template === b?.template && a?.colorMode === b?.colorMode;
    const translate = (key, fallback) => (() => { const value = global.i18n?.t(key); return value && value !== key ? value : fallback; })();

    function apply(value) {
        const root = global.document.documentElement;
        root.dataset.dashboardTemplate = value.template;
        root.dataset.colorMode = value.colorMode;
    }

    // Pages serialize local intents; StorageManager merges the owned axes under
    // the shared write lock. Other settings/positions never travel in this save.
    class Controller {
        constructor({ storage = global.storageManager, initial, baseline, render = () => {}, onBeforeApply = () => {}, onApply = () => {}, onError = () => {} }) {
            this.storage = storage;
            this.baseline = baseline ? { generation: baseline.generation } : null;
            this.patchVersions = {};
            this.saveError = null;
            this.confirmed = storage.validateAppearanceConfig(initial);
            this.applied = { ...this.confirmed };
            this.patch = {};
            this.pending = 0;
            this.version = 0;
            this.refreshVersion = 0;
            this.refreshing = 0;
            this.queue = Promise.resolve();
            this.render = render;
            this.onBeforeApply = onBeforeApply;
            this.onApply = onApply;
            this.onError = onError;
            apply(this.confirmed);
            this.render(this.confirmed, '');
        }

        paint(value) {
            if (same(value, this.applied)) return;
            const previous = this.applied;
            this.onBeforeApply(value, previous);
            apply(value);
            this.applied = { ...value };
            this.onApply(value, previous);
        }

        select(field, value) {
            const choices = field === 'template' ? (global.LocalItabTemplates?.ids || ['clarity', 'graphite', 'folio']) : field === 'colorMode' ? ['light', 'dark'] : [];
            if (!choices.includes(value)) return Promise.resolve(false);
            const version = ++this.version;
            this.patch = { ...this.patch, [field]: value };
            this.patchVersions[field] = version;
            this.saveError = null;
            const patch = { ...this.patch };
            this.pending++;
            this.render({ ...this.confirmed, ...patch }, 'saving');
            const task = this.queue.then(async () => {
                if (version !== this.version) return false;
                const requested = { ...this.patch }, requestedVersions = { ...this.patchVersions };
                const candidate = await this.storage.patchAppearance(requested, this.baseline);
                if (!candidate) throw new Error('Appearance save failed');
                this.confirmed = candidate;
                // A completed field must not be replayed by a later queued
                // selection of the other axis. Keep any newer same-field intent.
                for (const key of Object.keys(requested)) {
                    if (this.patchVersions[key] !== requestedVersions[key]) continue;
                    delete this.patch[key]; delete this.patchVersions[key];
                }
                if (version === this.version) {
                    this.paint(candidate);
                    this.render(candidate, 'saved');
                }
                return true;
            }).catch(error => {
                if (version === this.version) {
                    this.patch = {};
                    this.patchVersions = {};
                    this.saveError = error;
                    this.paint(this.confirmed);
                    this.render(this.confirmed, 'error', error);
                    this.onError(error);
                }
                return false;
            }).finally(() => {
                this.pending--;
                if (!this.pending && this.externalChange) {
                    this.externalChange = false;
                    this.refresh();
                }
            });
            this.queue = task;
            return task;
        }

        async refresh() {
            if (this.pending) { this.externalChange = true; return; }
            const version = this.version;
            const refreshVersion = ++this.refreshVersion;
            this.refreshing++;
            try {
                const value = await this.storage.getAppearanceForUpdate();
                if (this.pending || version !== this.version || refreshVersion !== this.refreshVersion) return;
                this.confirmed = value;
                this.paint(value);
                this.render(value, this.saveError ? 'error' : '', this.saveError);
            } catch (error) {
                if (!this.pending && version === this.version && refreshVersion === this.refreshVersion) {
                    this.render(this.confirmed, 'error', this.saveError || error);
                    this.onError(error);
                }
            } finally { this.refreshing--; }
        }
    }

    function mount(host, options) {
        if (!host) return null;
        const doc = host.ownerDocument;
        const controls = {};
        for (const [field, labelKey, fallback, values] of [
            ['template', 'dashboardTemplate', 'Template', (global.LocalItabTemplates ? global.LocalItabTemplates.all.map((entry, index) => [entry.id, entry.labelKey, `${String.fromCharCode(65 + index)} · ${global.LocalItabTemplates.localize(entry.id).name}`]) : [['clarity', 'templateClarity', 'A · Clarity'], ['graphite', 'templateGraphite', 'B · Graphite'], ['folio', 'templateFolio', 'C · Folio']])],
            ['colorMode', 'colorMode', 'Appearance', [['light', 'colorModeLight', 'Light'], ['dark', 'colorModeDark', 'Dark']]]
        ]) {
            const label = doc.createElement('label');
            label.className = 'appearance-field';
            const text = doc.createElement('span');
            text.textContent = translate(labelKey, fallback);
            const select = doc.createElement('select');
            select.dataset.appearanceField = field;
            for (const [value, key, name] of values) {
                const option = doc.createElement('option');
                option.value = value;
                option.textContent = translate(key, name);
                select.appendChild(option);
            }
            label.append(text, select);
            host.appendChild(label);
            controls[field] = select;
        }
        const status = doc.createElement('span');
        status.className = 'appearance-status';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        host.appendChild(status);
        const controller = new Controller({ ...options, render(value, state, error) {
            controls.template.value = value.template;
            controls.colorMode.value = value.colorMode;
            host.setAttribute('aria-busy', String(state === 'saving'));
            host.dataset.saveState = state;
            status.textContent = state === 'saving' ? translate('appearanceSaving', 'Saving…') :
                state === 'saved' ? translate('appearanceSaved', 'Saved') :
                    state === 'error' ? (error?.code?.startsWith('APPEARANCE_') ? translate('dashboardPreferenceConflict', 'Saved preferences changed or could not be safely read. Keep any draft and open a new tab before retrying.') : translate('appearanceSaveFailed', 'Could not save. Please try again.')) : '';
        } });
        for (const [field, select] of Object.entries(controls)) {
            select.addEventListener('change', () => controller.select(field, select.value));
        }
        if (global.chrome?.storage?.onChanged) {
            global.chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && (changes.appearance || changes.themePreset)) controller.refresh();
            });
        }
        return controller;
    }

    global.LocalItabAppearance = { apply, Controller, mount };
})(window);
