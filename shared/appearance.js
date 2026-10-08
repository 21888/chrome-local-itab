(function initAppearance(global) {
    'use strict';

    const same = (a, b) => a?.template === b?.template && a?.colorMode === b?.colorMode;
    const translate = (key, fallback) => global.i18n?.t(key) || fallback;

    function apply(value) {
        const root = global.document.documentElement;
        root.dataset.dashboardTemplate = value.template;
        root.dataset.colorMode = value.colorMode;
    }

    // Only the appearance key is written. Each page serializes its own requests;
    // other settings and manual positions never travel in this save operation.
    class Controller {
        constructor({ storage = global.storageManager, initial, render = () => {}, onBeforeApply = () => {}, onApply = () => {}, onError = () => {} }) {
            this.storage = storage;
            this.confirmed = storage.validateAppearanceConfig(initial);
            this.applied = { ...this.confirmed };
            this.patch = {};
            this.pending = 0;
            this.version = 0;
            this.refreshVersion = 0;
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
            const choices = field === 'template' ? ['clarity', 'graphite', 'folio'] : field === 'colorMode' ? ['light', 'dark'] : [];
            if (!choices.includes(value)) return Promise.resolve(false);
            const version = ++this.version;
            this.patch = { ...this.patch, [field]: value };
            const patch = { ...this.patch };
            this.pending++;
            this.render({ ...this.confirmed, ...patch }, 'saving');
            const task = this.queue.then(async () => {
                if (version !== this.version) return false;
                const previous = await this.storage.getAppearanceForUpdate();
                this.confirmed = previous;
                if (version !== this.version) return false;
                const candidate = { ...previous, ...patch };
                if (!(await this.storage.set('appearance', candidate))) throw new Error('Appearance save failed');
                this.confirmed = candidate;
                if (version === this.version) {
                    this.patch = {};
                    this.paint(candidate);
                    this.render(candidate, 'saved');
                }
                return true;
            }).catch(error => {
                if (version === this.version) {
                    this.patch = {};
                    this.paint(this.confirmed);
                    this.render(this.confirmed, 'error');
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
            try {
                const value = await this.storage.getAppearanceForUpdate();
                if (this.pending || version !== this.version || refreshVersion !== this.refreshVersion) return;
                this.confirmed = value;
                this.paint(value);
                this.render(value, '');
            } catch (error) {
                if (!this.pending && version === this.version && refreshVersion === this.refreshVersion) {
                    this.render(this.confirmed, 'error');
                    this.onError(error);
                }
            }
        }
    }

    function mount(host, options) {
        if (!host) return null;
        const doc = host.ownerDocument;
        const controls = {};
        for (const [field, labelKey, fallback, values] of [
            ['template', 'dashboardTemplate', 'Template', [['clarity', 'templateClarity', 'A · Clarity'], ['graphite', 'templateGraphite', 'B · Graphite'], ['folio', 'templateFolio', 'C · Folio']]],
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
        const controller = new Controller({ ...options, render(value, state) {
            controls.template.value = value.template;
            controls.colorMode.value = value.colorMode;
            host.setAttribute('aria-busy', String(state === 'saving'));
            host.dataset.saveState = state;
            status.textContent = state === 'saving' ? translate('appearanceSaving', 'Saving…') :
                state === 'saved' ? translate('appearanceSaved', 'Saved') :
                    state === 'error' ? translate('appearanceSaveFailed', 'Could not save. Please try again.') : '';
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
