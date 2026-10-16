(function initAppearance(global) {
    'use strict';

    const same = (a, b) => a?.template === b?.template && a?.colorMode === b?.colorMode && JSON.stringify(a?.customization) === JSON.stringify(b?.customization);
    const translate = (key, fallback) => (() => { const value = global.i18n?.t(key); return value && value !== key ? value : fallback; })();

    function apply(value) {
        const root = global.document.documentElement;
        root.dataset.dashboardTemplate = value.template;
        root.dataset.colorMode = value.colorMode;
        global.LocalItabCustomization?.apply(value.customization);
    }

    // Pages serialize local intents; StorageManager merges the owned axes under
    // the shared write lock. Other settings/positions never travel in this save.
    class Controller {
        constructor({ storage = global.storageManager, initial, baseline, render = () => {}, onBeforeApply = () => {}, onApply = () => {}, onError = () => {}, previewEnabled = false, onPreviewStart = () => true, onPreviewEnd = () => {}, isPreviewCurrent = () => true }) {
            this.storage = storage;
            this.previewEnabled = previewEnabled;
            this.onPreviewStart = onPreviewStart;
            this.onPreviewEnd = onPreviewEnd;
            this.isPreviewCurrent = isPreviewCurrent;
            this.preview = null;
            this.previewRevision = 0;
            this.previewGuard = false;
            this.previewBusy = false;
            this.closed = false;
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

        async previewTemplate(template) {
            if (!this.previewEnabled || this.closed || this.pending || this.refreshing || this.previewBusy ||
                !global.LocalItabTemplates?.ids.includes(template)) return false;
            if (!this.isPreviewCurrent()) { await this.cancelTemplatePreview({ error: this.storage.appearanceError() }); return false; }
            if (this.preview) {
                this.preview.template = template;
                this.paint({ ...this.confirmed, template });
                this.render(this.applied, 'preview');
                return true;
            }
            if (!this.baseline || !this.onPreviewStart()) {
                this.render(this.confirmed, 'preview-blocked'); return false;
            }
            this.previewGuard = true;
            this.previewBusy = true;
            const revision = ++this.previewRevision;
            this.render(this.confirmed, 'preview-loading');
            try {
                const snapshot = await this.storage.getTemplatePreviewSnapshot();
                if (revision !== this.previewRevision || this.closed) return false;
                if (!this.isPreviewCurrent()) throw this.storage.appearanceError();
                this.confirmed = snapshot.appearance;
                if (snapshot.generation !== this.baseline.generation) throw this.storage.appearanceError();
                this.preview = { template, snapshot };
                this.saveError = null;
                this.paint({ ...this.confirmed, template });
                this.render(this.applied, 'preview');
                return true;
            } catch (error) {
                if (revision === this.previewRevision && !this.closed) {
                    this.paint(this.confirmed);
                    this.render(this.confirmed, 'error', error);
                    this.releasePreview();
                    this.onError(error);
                }
                return false;
            } finally { if (revision === this.previewRevision) this.previewBusy = false; }
        }

        releasePreview() {
            if (!this.previewGuard) return;
            this.previewGuard = false;
            this.onPreviewEnd();
        }

        async cancelTemplatePreview({ error = null, close = false } = {}) {
            if (!this.previewGuard && !this.previewBusy) { if (close) this.closed = true; return false; }
            const revision = ++this.previewRevision;
            this.preview = null;
            this.previewBusy = !close;
            if (close) {
                this.closed = true;
                // pagehide must not depend on an async read or save. A bfcache
                // return starts from the last confirmed view, never the draft.
                this.paint(this.confirmed);
                this.render(this.confirmed, '');
                this.releasePreview();
                return true;
            }
            this.render(this.confirmed, 'preview-restoring');
            try {
                const snapshot = await this.storage.getTemplatePreviewSnapshot();
                if (revision !== this.previewRevision || this.closed) return false;
                this.confirmed = snapshot.appearance;
            } catch (failure) { error ||= failure; }
            if (revision !== this.previewRevision || this.closed) return false;
            this.paint(this.confirmed);
            this.saveError = error;
            this.render(this.confirmed, error ? 'error' : '', error);
            this.previewBusy = false;
            this.releasePreview();
            return true;
        }

        async applyTemplatePreview() {
            if (this.closed || this.pending || this.previewBusy || !this.preview) return false;
            const preview = this.preview, revision = this.previewRevision;
            this.previewBusy = true;
            this.pending++;
            this.previewWriting = true;
            this.previewSubmitted = null;
            this.render(this.applied, 'preview-saving');
            const task = (async () => {
                try {
                    const candidate = await this.storage.applyTemplatePreview(preview.template, preview.snapshot, {
                        isCurrent: () => !this.closed && this.preview === preview && this.previewRevision === revision && this.isPreviewCurrent(),
                        onSubmit: appearance => { this.previewSubmitted = appearance; }
                    });
                    if (this.closed || this.preview !== preview || revision !== this.previewRevision) return false;
                    this.confirmed = candidate;
                    this.preview = null;
                    this.saveError = null;
                    this.paint(candidate);
                    this.render(candidate, 'preview-saved');
                    this.releasePreview();
                    return true;
                } catch (error) {
                    if (!this.closed && revision === this.previewRevision) {
                        // Retire every failed attempt, including an unknown write
                        // outcome. A new preview always requires a new read/ticket.
                        await this.cancelTemplatePreview({ error });
                        this.onError(error);
                    }
                    return false;
                } finally {
                    this.pending--;
                    this.previewWriting = false;
                    this.previewSubmitted = null;
                    if (revision === this.previewRevision) this.previewBusy = false;
                    if (!this.pending && this.externalChange && !this.closed) {
                        this.externalChange = false;
                        await this.refresh();
                    }
                }
            })();
            this.queue = task;
            return task;
        }

        sourceChanged(changes) {
            if (!this.previewGuard) return false;
            // The write's own appearance event arrives before its readback.
            // The locked CAS/readback still owns validation. Only this exact
            // event is consumed, so it cannot immediately erase confirmed status.
            if (this.previewWriting && this.previewSubmitted && Object.keys(changes).every(key => key === 'appearance') &&
                JSON.stringify(changes.appearance?.newValue) === JSON.stringify(this.previewSubmitted)) {
                return true;
            }
            void this.cancelTemplatePreview({ error: this.storage.appearanceError() });
            return true;
        }

        select(field, value) {
            if (this.closed || this.previewGuard || this.previewBusy) return Promise.resolve(false);
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
            if (this.closed) return;
            if (this.previewGuard) { await this.cancelTemplatePreview({ error: this.storage.appearanceError() }); return; }
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
        const gallery = global.LocalItabTemplateGallery?.mount(host, id => options.previewEnabled
            ? controller.previewTemplate(id) : controller.select('template', id), options.previewEnabled ? {
                apply: () => controller.applyTemplatePreview(), cancel: () => controller.cancelTemplatePreview()
            } : null);
        const controller = new Controller({ ...options, render(value, state, error) {
            gallery?.render(value, state);
            const previewing = ['preview', 'preview-loading', 'preview-saving', 'preview-restoring'].includes(state);
            for (const select of Object.values(controls)) select.disabled = previewing;
            const customize = host.querySelector('.customize-launch');
            if (customize) customize.disabled = previewing;
            controls.template.value = value.template;
            controls.colorMode.value = value.colorMode;
            host.setAttribute('aria-busy', String(['saving', 'preview-saving', 'preview-loading', 'preview-restoring'].includes(state)));
            host.dataset.saveState = state;
            status.textContent = state === 'preview-saved' ? translate('templatePreviewSaved', 'Template saved locally. Enabled Chrome Sync follows its existing settings.') :
                state === 'preview' ? translate('templatePreviewActive', 'Temporary preview with your content. Apply saves locally; enabled Chrome Sync follows its existing settings. Cancel discards the preview.') :
                state === 'preview-blocked' ? translate('templatePreviewBlocked', 'Finish the current layout or appearance edit before previewing.') :
                state === 'preview-loading' || state === 'preview-restoring' ? translate('templatePreviewReading', 'Reading saved appearance…') :
                state === 'saving' || state === 'preview-saving' ? translate('appearanceSaving', 'Saving…') :
                state === 'saved' ? translate('appearanceSaved', 'Saved') :
                    state === 'error' ? (error?.code === 'APPEARANCE_SAVE_UNCONFIRMED' ? translate('templatePreviewUnconfirmed', 'The save could not be confirmed and may have completed. No rollback was attempted. Open the gallery again to read the saved appearance.') : error?.code?.startsWith('APPEARANCE_') ? translate('dashboardPreferenceConflict', 'Saved preferences changed or could not be safely read. Keep any draft and open a new tab before retrying.') : translate('appearanceSaveFailed', 'Could not save. Please try again.')) : '';
        } });
        for (const [field, select] of Object.entries(controls)) {
            select.addEventListener('change', () => controller.select(field, select.value));
        }
        if (controller.storage?.onLocalChanged) {
            controller.storage.onLocalChanged((changes, area) => {
                if (area !== 'local' || controller.closed) return;
                if (controller.sourceChanged(changes)) return;
                if (changes.appearance || changes.themePreset) controller.refresh();
            });
        }
        if (options.previewEnabled) {
            const session = controller.storage.workspace;
            session?.manager?.subscribe(() => {
                if (session.invalidated || session._suspended || controller.storage.workspace !== session)
                    void controller.cancelTemplatePreview({ error: controller.storage.appearanceError() });
            });
            global.addEventListener?.('pagehide', () => void controller.cancelTemplatePreview({ close: true }));
            global.addEventListener?.('pageshow', () => { if (controller.closed) { controller.closed = false; void controller.refresh(); } });
            global.addEventListener?.('keydown', event => {
                // An inner control or IME owns its Escape before this window
                // listener. The gallery's own handler also prevents default.
                if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing &&
                    event.keyCode !== 229 && controller.previewGuard) {
                    event.preventDefault(); gallery?.close();
                }
            });
        }
        global.LocalItabCustomization?.mount(host, { storage: controller.storage, baseline: controller.baseline, refresh: () => controller.refresh(), canOpen: () => !controller.previewGuard && !controller.previewBusy });
        return controller;
    }

    global.LocalItabAppearance = { apply, Controller, mount };
})(window);
