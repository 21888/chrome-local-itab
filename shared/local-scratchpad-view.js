(function (root) {
    'use strict';
    const api = root.LocalItabScratchpad;
    const fallback = {
        scratchpadTitle: 'Scratchpad', scratchpadLocal: 'On this device',
        scratchpadLabel: 'Scratchpad text', scratchpadEnable: 'Show Scratchpad on the new tab page',
        scratchpadEnableHelp: 'Optional and device-local. Hiding Scratchpad keeps your saved text.',
        scratchpadHelp: 'Plain text saved only in this browser profile on this device. Excluded from settings exports, browser Sync and Google Drive backups. Removing the extension or clearing browser data can erase it. Export a text copy to keep your own backup.',
        scratchpadLoading: 'Loading local Scratchpad…', scratchpadSaving: 'Saving…',
        scratchpadSaved: 'Saved on this device', scratchpadUnsaved: 'Unsaved changes',
        scratchpadLoadError: 'Could not load Scratchpad. Retry before editing.',
        scratchpadSaveError: 'Could not confirm the save. Your draft is still here. Retry or export a text copy before leaving.',
        scratchpadConflict: 'Another page changed the saved text. Your draft is still here. Use saved text to discard this draft, or replace saved text with this draft.',
        scratchpadRetry: 'Retry', scratchpadUseSaved: 'Use saved text', scratchpadReplace: 'Replace with my draft',
        scratchpadImport: 'Import text', scratchpadImportReplace: 'Replace Scratchpad text',
        scratchpadImportCancel: 'Cancel', scratchpadImportPreview: 'Text to import',
        scratchpadImportHelp: 'Preview only. Replace will overwrite the saved Scratchpad text. Export a copy first if you want to keep it.',
        scratchpadImportReading: 'Reading local text file…',
        scratchpadImportError: 'Could not read this file. Choose one UTF-8 .txt file, up to 32,000 Unicode characters and 128 KiB. Scratchpad was not changed.',
        scratchpadExport: 'Export text', scratchpadDetails: 'Storage and backups',
        scratchpadSavedPreview: 'Latest saved text', scratchpadSettingsConflict: 'Scratchpad changed on another page. Read the latest saved state before changing visibility.', scratchpadReadLatest: 'Read latest saved state',
        scratchpadLimits: 'Up to 32,000 Unicode characters and 128 KiB of UTF-8 text. Longer drafts stay here until shortened; export a copy before leaving.',
        scratchpadTooLong: 'This draft is too long to save. It is still here. Shorten it or export a text copy before leaving.',
        scratchpadInvalidText: 'This draft contains invalid Unicode text and cannot be saved or exported exactly. Your text is still here. Correct it before saving or exporting.',
        scratchpadExportError: 'Could not export a text copy. Your draft is still here.'
    };
    function t(key) { const translated = root.i18n?.t(key); return translated && translated !== key ? translated : fallback[key] || key; }
    function el(tag, cls, text) { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; }
    function button(key, action) { const node = el('button', 'scratchpad-button', t(key)); node.type = 'button'; node.addEventListener('click', action); return node; }
    function run(action) { try { Promise.resolve(action()).catch(() => {}); } catch (_) {} }
    function statusText(controller) {
        if (controller.readError) return t('scratchpadLoadError');
        if (controller.conflict) return t('scratchpadConflict');
        if (controller.loaded && ['TEXT_LIMIT', 'SIZE_LIMIT'].includes(controller.error?.code)) return t('scratchpadTooLong');
        if (controller.loaded && controller.error?.code === 'TEXT') return t('scratchpadInvalidText');
        if (controller.error) return t(controller.loaded ? 'scratchpadSaveError' : 'scratchpadLoadError');
        if (!controller.loaded) return t('scratchpadLoading');
        if (controller.pending) return t('scratchpadSaving');
        return t(controller.hasUncommittedWork() ? 'scratchpadUnsaved' : 'scratchpadSaved');
    }
    class View {
        constructor(host, { controller = new api.Controller(), onVisibility = () => {} } = {}) {
            this.host = host; this.controller = controller; this.onVisibility = onVisibility; this.closed = false;
            host.classList.add('local-scratchpad-card'); host.setAttribute('aria-label', t('scratchpadTitle')); host.hidden = true;
            const header = el('header', 'scratchpad-header'); header.append(el('h2', '', t('scratchpadTitle')), el('span', 'scratchpad-local', t('scratchpadLocal')));
            this.textarea = el('textarea', 'scratchpad-text'); this.textarea.setAttribute('aria-label', t('scratchpadLabel')); this.textarea.spellcheck = false; this.textarea.setAttribute('autocomplete', 'off');
            this.textarea.addEventListener('input', () => { if (controller.loaded) controller.setDraft(this.textarea.value); });
            this.textarea.addEventListener('compositionstart', () => controller.setComposing(true));
            this.textarea.addEventListener('compositionend', () => { if (controller.loaded) controller.setDraft(this.textarea.value); controller.setComposing(false); });
            this.savedPreview = el('textarea', 'scratchpad-text scratchpad-saved-preview'); this.savedPreview.readOnly = true; this.savedPreview.spellcheck = false; this.savedPreview.setAttribute('aria-label', t('scratchpadSavedPreview'));
            this.savedLabel = el('p', 'scratchpad-help', t('scratchpadSavedPreview'));
            this.status = el('p', 'scratchpad-status'); this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
            this.retry = button('scratchpadRetry', () => run(() => controller.retry()));
            this.useSaved = button('scratchpadUseSaved', () => run(() => controller.useSaved()));
            this.replace = button('scratchpadReplace', () => run(() => controller.replaceWithDraft()));
            this.exportButton = button('scratchpadExport', () => this.exportText());
            this.importButton = button('scratchpadImport', () => this.chooseImport());
            this.importFile = el('input'); this.importFile.type = 'file'; this.importFile.accept = '.txt,text/plain'; this.importFile.hidden = true;
            this.importFile.addEventListener('change', () => run(() => this.readImport()));
            this.importFile.addEventListener('cancel', () => this.cancelImport(true));
            this.importPanel = el('section', 'scratchpad-import'); this.importPanel.hidden = true;
            this.importInfo = el('p', 'scratchpad-help'); this.importInfo.setAttribute('role', 'status');
            this.importPreview = el('pre', 'scratchpad-import-preview'); this.importPreview.tabIndex = 0; this.importPreview.setAttribute('aria-label', t('scratchpadImportPreview'));
            this.importApply = button('scratchpadImportReplace', () => this.applyImport());
            this.importCancel = button('scratchpadImportCancel', () => this.cancelImport(true));
            const importControls = el('div', 'scratchpad-controls'); importControls.append(this.importApply, this.importCancel);
            this.importPanel.append(this.importInfo, this.importPreview, el('p', 'scratchpad-help', t('scratchpadImportHelp')), importControls);
            this.importPanel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); this.cancelImport(true); } });
            const controls = el('div', 'scratchpad-controls'); controls.append(this.retry, this.useSaved, this.replace, this.exportButton, this.importButton);
            this.count = el('p', 'scratchpad-help scratchpad-count');
            const details = el('details', 'scratchpad-help'); details.append(el('summary', '', t('scratchpadDetails')), el('p', '', t('scratchpadHelp')));
            host.replaceChildren(header, this.textarea, this.count, el('p', 'scratchpad-help', t('scratchpadLimits')), this.status, this.savedLabel, this.savedPreview, controls, this.importFile, this.importPanel, details);
            this.beforeUnload = event => { if (root.LocalItabContentLifecycle?.departing || !this.hasUncommittedWork()) return; event.preventDefault(); event.returnValue = ''; };
            root.addEventListener?.('beforeunload', this.beforeUnload);
            this.unsubscribe = controller.subscribe(() => this.render()); this.render(); run(() => controller.init());
        }
        render() {
            if (this.closed) return;
            const c = this.controller;
            if (this.importSession && !this.importCurrent(this.importSession)) this.cancelImport();
            this.importButton.disabled = !this.canImport();
            const visible = c.state?.enabled === true || c.hasUncommittedWork() || Boolean(!c.loaded && c.error);
            this.host.hidden = !visible;
            if (this.visible !== visible) { this.visible = visible; this.onVisibility(visible); }
            this.textarea.readOnly = !c.loaded || c.readError;
            this.savedPreview.hidden = this.savedLabel.hidden = !c.conflict;
            if (this.savedPreview.value !== (c.state?.content || '')) this.savedPreview.value = c.state?.content || '';
            // Do not replace the DOM value during IME composition or on each
            // keystroke: that would reset the caret and the native undo stack.
            if (!c.composing && this.textarea.value !== c.draft) this.textarea.value = c.draft;
            this.count.textContent = `${Array.from(this.textarea.value || '').length.toLocaleString()} / 32,000`;
            const text = statusText(c); if (this.status.textContent !== text) this.status.textContent = text;
            this.status.classList.toggle('scratchpad-error', Boolean(c.error || c.conflict));
            this.retry.hidden = (!c.error || Boolean(c.conflict)) && !c.readError || (c.loaded && ['TEXT', 'TEXT_LIMIT', 'SIZE_LIMIT'].includes(c.error?.code)); this.retry.disabled = Boolean(c.pending);
            this.useSaved.hidden = this.replace.hidden = !c.conflict;
            this.useSaved.disabled = Boolean(c.pending || c.composing);
            this.replace.disabled = Boolean(c.pending || c.composing || c.readError);
            this.exportButton.disabled = !c.loaded && !c.draft;
        }
        canImport() {
            const c = this.controller;
            return !this.closed && c.loaded && c.state?.enabled === true && !c.pending && !c.error && !c.readError && !c.hasUncommittedWork();
        }
        importCurrent(session) {
            return this.importSession === session && this.canImport() && this.controller.state === session.state && this.controller.generation === session.generation;
        }
        cancelImport(focus = false) {
            const focused = document.activeElement, restore = this.importPanel.contains(focused);
            this.importSession = null; this.importPanel.hidden = true; this.importPreview.textContent = ''; this.importInfo.textContent = ''; this.importFile.value = '';
            if (focus && this.canImport()) this.importButton.focus();
            else if (restore && !this.closed) {
                if (this.controller.state?.enabled) this.textarea.focus();
                else focused?.blur?.();
            }
        }
        chooseImport() {
            this.cancelImport();
            if (!this.canImport()) return;
            this.importSession = { state: this.controller.state, generation: this.controller.generation };
            this.importFile.click();
        }
        async readImport() {
            const session = this.importSession;
            if (!session || !this.importCurrent(session)) { this.cancelImport(); return; }
            // Each selection owns its own completion, even if another chooser opens.
            const files = Array.from(this.importFile.files || []);
            this.importFile.value = '';
            if (!files.length) { this.cancelImport(true); return; }
            this.importSession = { ...session }; const owned = this.importSession;
            this.importPanel.hidden = false; this.importApply.disabled = true;
            this.importPreview.textContent = ''; this.importInfo.textContent = t('scratchpadImportReading');
            this.importCancel.focus();
            try {
                const file = files[0];
                if (files.length !== 1 || !/\.txt$/i.test(file.name) || file.size > api.LIMITS.bytes) throw api.fault('SIZE_LIMIT');
                const bytes = await file.arrayBuffer();
                if (!this.importCurrent(owned)) return;
                if (bytes.byteLength > api.LIMITS.bytes) throw api.fault('SIZE_LIMIT');
                // Preserve a literal leading BOM as text, like our own UTF-8 export.
                const text = api.content(new root.TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
                owned.text = text;
                this.importInfo.textContent = `${file.name} · ${Array.from(text).length.toLocaleString()} / 32,000 · ${bytes.byteLength.toLocaleString()} B`;
                this.importPreview.textContent = text; this.importApply.disabled = false;
            } catch (_) {
                if (this.importCurrent(owned)) this.importInfo.textContent = t('scratchpadImportError');
            }
        }
        applyImport() {
            const session = this.importSession;
            if (!session || !this.importCurrent(session) || typeof session.text !== 'string') { this.cancelImport(); return; }
            const text = session.text; this.cancelImport();
            // The controller owns the draft from here: existing CAS, Retry, conflict
            // recovery, export and verified-save status apply without new storage.
            this.controller.setDraft(text); this.textarea.focus();
            run(() => this.controller.save());
        }
        exportText() {
            // Export the current visible draft, including unsaved/conflicted text.
            let url, link;
            try {
                const draft = this.controller.composing ? this.textarea.value : this.controller.draft;
                if (!api.isUnicode(draft)) { this.status.textContent = t('scratchpadInvalidText'); return; }
                const blob = new root.Blob([draft], { type: 'text/plain;charset=utf-8' });
                url = root.URL.createObjectURL(blob); link = el('a'); link.href = url; link.download = 'local-itab-scratchpad.txt';
                document.body.append(link); link.click(); link.remove();
                root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);
            } catch (_) { link?.remove(); if (url) root.URL.revokeObjectURL(url); this.status.textContent = t('scratchpadExportError'); }
        }
        hasUncommittedWork() { return this.controller.hasUncommittedWork(); }
        destroy() { this.cancelImport(); this.closed = true; root.removeEventListener?.('beforeunload', this.beforeUnload); this.unsubscribe(); this.controller.destroy(); }
    }
    function mountSettings(host, { controller = new api.Controller() } = {}) {
        host.classList.add('local-scratchpad-settings');
        const label = el('label', 'scratchpad-enable-label'), input = el('input'); input.type = 'checkbox'; input.disabled = true;
        label.append(input, el('span', '', t('scratchpadEnable')));
        const status = el('p', 'scratchpad-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        const retry = button('scratchpadRetry', () => run(() => controller.retry()));
        const readLatest = button('scratchpadReadLatest', () => run(() => controller.useSaved()));
        host.replaceChildren(label, el('p', 'scratchpad-help', t('scratchpadEnableHelp')), el('p', 'scratchpad-help', t('scratchpadHelp')), status, retry, readLatest);
        const render = () => {
            input.checked = controller.state?.enabled === true; input.disabled = !controller.loaded || Boolean(controller.pending || controller.error || controller.conflict);
            const text = controller.conflict && !controller.readError ? t('scratchpadSettingsConflict') : statusText(controller); if (status.textContent !== text) status.textContent = text;
            retry.hidden = !controller.readError && (!controller.error || Boolean(controller.conflict)); retry.disabled = Boolean(controller.pending);
            readLatest.hidden = !controller.conflict; readLatest.disabled = Boolean(controller.pending);
        };
        input.addEventListener('change', () => run(() => controller.setEnabled(input.checked)));
        const unsubscribe = controller.subscribe(render); render(); run(() => controller.init());
        return { controller, hasUncommittedWork: () => controller.hasUncommittedWork(), destroy() { unsubscribe(); controller.destroy(); } };
    }
    Object.assign(api, { View, mount: (host, options) => new View(host, options), mountSettings });
})(window);
