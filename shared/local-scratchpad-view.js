(function (root) {
    'use strict';
    const api = root.LocalItabScratchpad;
    // Ownership only; clipboard single-flight remains local to each View.
    const selectionOwners = new WeakMap();
    const savedOwners = new WeakMap();
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
        scratchpadImportAppend: 'Append to Scratchpad', scratchpadImportAppendMode: 'Keep saved text and append this file',
        scratchpadImportAppendLimit: 'The combined text exceeds the Scratchpad limit. Export your saved text and shorten the file, or turn off append to preview replacement.',
        scratchpadImportCancel: 'Cancel', scratchpadImportPreview: 'Resulting Scratchpad text',
        scratchpadImportHelp: 'Preview of the resulting note. Append keeps saved text and adds a line break if needed. Replace overwrites it. Nothing changes until you confirm; export a copy first to keep a backup.',
        scratchpadImportReading: 'Reading local text file…',
        scratchpadImportError: 'Could not read this file. Choose one UTF-8 .txt file, up to 32,000 Unicode characters and 128 KiB. Scratchpad was not changed.',
        scratchpadExport: 'Export text', scratchpadDetails: 'Storage and backups',
        scratchpadCopyText: 'Copy current text', scratchpadCopying: 'Copying current text…',
        scratchpadCopySuccess: 'Current text copied.', scratchpadCopyFailure: 'Could not copy. Select the text to copy it manually, or export a text copy.',
        scratchpadCopyEmpty: 'There is no text to copy. Your clipboard was not changed.',
        scratchpadCopyInvalid: 'This draft contains incomplete Unicode characters. Correct them before copying. Your clipboard was not changed.',
        scratchpadCopySelection: 'Copy selected text', scratchpadCopySelectionCopying: 'Copying selected text…',
        scratchpadCopySelectionSuccess: 'Selected text copied.',
        scratchpadCopySelectionFailure: 'Could not copy selected text. Your selection is still here. Choose Copy selected text to retry, or copy it manually.',
        scratchpadCopySelectionHelp: 'Select nonempty text with complete Unicode characters in the main editor, then choose Copy selected text. Your clipboard was not changed.',
        scratchpadCopySaved: 'Copy saved text', scratchpadCopySavedCopying: 'Copying saved text…',
        scratchpadCopySavedSuccess: 'Saved text copied.',
        scratchpadCopySavedFailure: 'Could not copy saved text. Both versions are still here. Choose Copy saved text to retry, or copy the saved preview manually.',
        scratchpadCopySavedEmpty: 'The saved text is empty. Your clipboard was not changed.',
        scratchpadCopySavedInvalid: 'The saved text contains incomplete Unicode characters. Your clipboard was not changed.',
        scratchpadCopySavedHelp: 'Copy the “Latest saved text” preview shown above without replacing either version.',
        scratchpadSavedPreview: 'Latest saved text', scratchpadSettingsConflict: 'Scratchpad changed on another page. Read the latest saved state before changing visibility.', scratchpadReadLatest: 'Read latest saved state',
        scratchpadLines: 'Lines: {count}',
        scratchpadLimits: 'Up to 32,000 Unicode characters and 128 KiB of UTF-8 text. Longer drafts stay here until shortened; export a copy before leaving.',
        scratchpadTooLong: 'This draft is too long to save. It is still here. Shorten it or export a text copy before leaving.',
        scratchpadInvalidText: 'This draft contains invalid Unicode text and cannot be saved or exported exactly. Your text is still here. Correct it before saving or exporting.',
        scratchpadExportError: 'Could not export a text copy. Your draft is still here.',
        scratchpadFind: 'Find text', scratchpadFindLabel: 'Text to find',
        scratchpadFindSelection: 'Find selected text',
        scratchpadFindSelectionHelp: 'Select complete, single-line text in the editor first. This only fills the find field; use Next or Previous to find matches.',
        scratchpadFindSelectionFailed: 'Could not use the selection. Select text and try again.',
        scratchpadFindHelp: 'Case-sensitive, exact single-line text in this editor only. Spaces count. Enter selects the next match.',
        scratchpadFindPrevious: 'Previous match', scratchpadFindNext: 'Next match', scratchpadFindClose: 'Close find',
        scratchpadFindSelected: 'Match {current} of {total}.', scratchpadFindWrappedNext: 'Wrapped to the beginning. Match {current} of {total}.',
        scratchpadFindWrappedPrevious: 'Wrapped to the end. Match {current} of {total}.', scratchpadFindNoMatch: 'No matching text in this editor.',
        scratchpadFindInvalid: 'Enter complete Unicode characters to find text.',
        scratchpadFindFailed: 'Could not select the matching text. Try again.'
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
        constructor(host, { controller = new api.Controller(), onVisibility = () => {}, clipboard = root.navigator?.clipboard } = {}) {
            this.host = host; this.controller = controller; this.onVisibility = onVisibility; this.closed = false;
            this.clipboard = clipboard; this.copyAttempt = null; this.copyReceipt = null;
            host.classList.add('local-scratchpad-card'); host.setAttribute('aria-label', t('scratchpadTitle')); host.hidden = true;
            const header = el('header', 'scratchpad-header'); header.append(el('h2', '', t('scratchpadTitle')), el('span', 'scratchpad-local', t('scratchpadLocal')));
            this.textarea = el('textarea', 'scratchpad-text'); this.textarea.setAttribute('aria-label', t('scratchpadLabel')); this.textarea.spellcheck = false; this.textarea.setAttribute('autocomplete', 'off');
            this.textarea.addEventListener('input', () => { if (!this.copyReceipt?.saved) this.invalidateCopy(); this.resetFindResult(); if (controller.loaded) controller.setDraft(this.textarea.value); });
            this.textarea.addEventListener('compositionstart', () => { this.findHeldEnter = null; controller.setComposing(true); });
            this.textarea.addEventListener('compositionend', () => { if (controller.loaded) controller.setDraft(this.textarea.value); controller.setComposing(false); });
            this.savedPreview = el('textarea', 'scratchpad-text scratchpad-saved-preview'); this.savedPreview.readOnly = true; this.savedPreview.spellcheck = false; this.savedPreview.setAttribute('aria-label', t('scratchpadSavedPreview'));
            this.savedLabel = el('p', 'scratchpad-help', t('scratchpadSavedPreview'));
            this.status = el('p', 'scratchpad-status'); this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
            this.retry = button('scratchpadRetry', () => run(() => controller.retry()));
            this.useSaved = button('scratchpadUseSaved', () => run(() => controller.useSaved()));
            this.replace = button('scratchpadReplace', () => run(() => controller.replaceWithDraft()));
            this.exportButton = button('scratchpadExport', () => this.exportText());
            const copyButton = this.copyButton = button('scratchpadCopyText', event => run(() => this.copyText(event, copyButton)));
            const copySelectionButton = this.copySelectionButton = button('scratchpadCopySelection', event => run(() => this.copySelectedText(event, selectionOwner)));
            copySelectionButton.title = t('scratchpadCopySelectionHelp');
            copySelectionButton.addEventListener('keydown', event => {
                if (!['Enter', ' '].includes(event.key)) return;
                if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 ||
                    this.copySelectionKey?.key === event.key) { event.preventDefault(); return; }
                this.copySelectionKey = { key: event.key, used: false };
            });
            const clearCopySelectionKey = () => { this.copySelectionKey = null; };
            copySelectionButton.addEventListener('keyup', clearCopySelectionKey);
            copySelectionButton.addEventListener('blur', clearCopySelectionKey);
            copySelectionButton.addEventListener('pointerdown', clearCopySelectionKey);
            const copySavedButton = this.copySavedButton = button('scratchpadCopySaved', event => run(() => this.copySavedText(event, savedOwner)));
            copySavedButton.title = t('scratchpadCopySavedHelp');
            copySavedButton.addEventListener('keydown', event => {
                if (!['Enter', ' '].includes(event.key)) return;
                if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 ||
                    this.copySavedKey?.key === event.key) { event.preventDefault(); return; }
                this.copySavedKey = { key: event.key, used: false };
            });
            const clearCopySavedKey = () => { this.copySavedKey = null; };
            copySavedButton.addEventListener('keyup', clearCopySavedKey);
            copySavedButton.addEventListener('blur', clearCopySavedKey);
            copySavedButton.addEventListener('pointerdown', clearCopySavedKey);
            this.copyStatus = el('p', 'scratchpad-help'); this.copyStatus.hidden = true;
            this.copyStatus.setAttribute('role', 'status'); this.copyStatus.setAttribute('aria-live', 'polite'); this.copyStatus.setAttribute('aria-atomic', 'true');
            this.importButton = button('scratchpadImport', () => this.chooseImport());
            this.findButton = button('scratchpadFind', event => {
                if (!this.canFind(this.findButton, event)) return;
                if (!this.findPanel.hidden) { this.closeFind(true); return; }
                this.findPanel.hidden = false; this.findButton.setAttribute('aria-expanded', 'true'); this.renderFind();
                try { this.findInput.focus(); } catch (_) {}
            });
            this.findButton.setAttribute('aria-expanded', 'false');
            this.findSelectionButton = button('scratchpadFindSelection', event => this.findSelectedText(event));
            this.findSelectionButton.title = t('scratchpadFindSelectionHelp');
            this.findPanel = el('section', 'scratchpad-find'); this.findPanel.hidden = true;
            this.findPanel.setAttribute('aria-label', t('scratchpadFind'));
            this.findInput = el('input', 'scratchpad-find-input'); this.findInput.type = 'text';
            this.findInput.spellcheck = false; this.findInput.setAttribute('autocomplete', 'off');
            const findLabel = el('label', 'scratchpad-find-label'); findLabel.append(el('span', '', t('scratchpadFindLabel')), this.findInput);
            this.findPrevious = button('scratchpadFindPrevious', event => this.findText(-1, this.findPrevious, event));
            this.findNext = button('scratchpadFindNext', event => this.findText(1, this.findNext, event));
            this.findClose = button('scratchpadFindClose', event => { if (this.canFind(this.findClose, event)) this.closeFind(true); });
            this.findStatus = el('p', 'scratchpad-help scratchpad-find-status');
            this.findStatus.setAttribute('role', 'status'); this.findStatus.setAttribute('aria-live', 'polite'); this.findStatus.setAttribute('aria-atomic', 'true');
            const findControls = el('div', 'scratchpad-controls'); findControls.append(this.findPrevious, this.findNext, this.findClose);
            this.findPanel.append(findLabel, el('p', 'scratchpad-help', t('scratchpadFindHelp')), findControls, this.findStatus);
            this.findInput.addEventListener('input', () => { this.resetFindResult(); this.renderFind(); });
            this.findInput.addEventListener('compositionstart', () => { if (this.canFind(this.findInput)) { this.findComposing = true; this.resetFindResult(); this.renderFind(); } });
            // Finish this input's IME bookkeeping even if the tab/card became
            // hidden. Neither completion nor blur selects text or edits a draft.
            const finishFindComposition = () => { if (!this.closed) { this.findComposing = false; this.renderFind(); } };
            this.findInput.addEventListener('compositionend', finishFindComposition);
            this.findInput.addEventListener('focusout', finishFindComposition);
            this.findInput.addEventListener('keydown', event => this.findEnter(1, this.findInput, event));
            this.findPrevious.addEventListener('keydown', event => this.findEnter(-1, this.findPrevious, event));
            this.findNext.addEventListener('keydown', event => this.findEnter(1, this.findNext, event));
            // A held Find Enter follows focus into the editor. Suppress only
            // repeats from that successful navigation, never a fresh edit key.
            this.textarea.addEventListener('keydown', event => {
                if (this.findHeldEnter && event.key === 'Enter' && event.repeat && this.canFind(this.findInput, event)) event.preventDefault();
                else this.findHeldEnter = null;
            });
            this.textarea.addEventListener('blur', () => { this.findHeldEnter = null; });
            this.findKeyup = () => { this.findHeldEnter = null; };
            this.findPointerdown = () => { this.findHeldEnter = null; };
            this.findKeydown = event => {
                // Preserve the same successful event as it bubbles; every new
                // non-repeat key retires the old ownership token locally.
                if (!event.repeat && this.findHeldEnter !== event) this.findHeldEnter = null;
            };
            this.findVisibilityChange = () => { if (document.hidden) { this.findHeldEnter = null; this.resetFindResult(); } };
            document.addEventListener('visibilitychange', this.findVisibilityChange);
            host.addEventListener('keyup', this.findKeyup); host.addEventListener('pointerdown', this.findPointerdown); host.addEventListener('keydown', this.findKeydown);
            this.findPanel.addEventListener('keydown', event => {
                if (event.key !== 'Escape' || !this.canFind(event.target, event)) return;
                event.preventDefault(); this.closeFind(true);
            });
            this.importFile = el('input'); this.importFile.type = 'file'; this.importFile.accept = '.txt,text/plain'; this.importFile.hidden = true;
            this.importFile.addEventListener('change', () => run(() => this.readImport()));
            this.importFile.addEventListener('cancel', () => this.cancelImport(true));
            this.importPanel = el('section', 'scratchpad-import'); this.importPanel.hidden = true;
            this.importInfo = el('p', 'scratchpad-help'); this.importInfo.setAttribute('role', 'status');
            this.importPreview = el('pre', 'scratchpad-import-preview'); this.importPreview.tabIndex = 0; this.importPreview.setAttribute('aria-label', t('scratchpadImportPreview'));
            this.importAppend = el('input'); this.importAppend.type = 'checkbox';
            this.importAppend.addEventListener('change', () => this.renderImportPreview());
            const appendLabel = el('label', 'scratchpad-enable-label scratchpad-help');
            appendLabel.append(this.importAppend, el('span', '', t('scratchpadImportAppendMode')));
            this.importApply = button('scratchpadImportReplace', () => this.applyImport());
            this.importCancel = button('scratchpadImportCancel', () => this.cancelImport(true));
            const importControls = el('div', 'scratchpad-controls'); importControls.append(this.importApply, this.importCancel);
            this.importPanel.append(appendLabel, this.importInfo, this.importPreview, el('p', 'scratchpad-help', t('scratchpadImportHelp')), importControls);
            this.importPanel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); this.cancelImport(true); } });
            const controls = el('div', 'scratchpad-controls'); controls.append(this.retry, this.useSaved, this.replace, this.copySavedButton, this.exportButton, this.copyButton, this.copySelectionButton, this.importButton, this.findButton, this.findSelectionButton);
            this.count = el('p', 'scratchpad-help scratchpad-count');
            const details = el('details', 'scratchpad-help'); details.append(el('summary', '', t('scratchpadDetails')), el('p', '', t('scratchpadHelp')));
            host.replaceChildren(header, this.textarea, this.count, el('p', 'scratchpad-help', t('scratchpadLimits')), this.status, this.savedLabel, this.savedPreview, controls, this.copyStatus, this.importFile, this.importPanel, this.findPanel, details);
            // Pin the original controls before callbacks can run. Receipts also
            // observe removal so a pending reparent/restore cannot revive them.
            const selectionOwner = this.copySelectionOwner = { host, editor: this.textarea, origin: copySelectionButton,
                controls, status: this.copyStatus, controller, document, parent: host.parentElement, valid: true };
            const previousSelectionOwner = selectionOwners.get(host);
            selectionOwners.set(host, selectionOwner);
            previousSelectionOwner?.invalidate();
            selectionOwner.invalidate = () => this.invalidateSelectionCopy();
            const store = controller.store, backend = store?.backend, workspace = backend?.workspace;
            const chain = []; for (let node = host; node; node = node.parentElement) chain.push(node);
            const savedOwner = this.copySavedOwner = { host, controller, store, backend, workspace,
                workspaceId: workspace?.id, workspaceGeneration: workspace?.generation, session: root.LocalItabWorkspaces?.session,
                preview: this.savedPreview, label: this.savedLabel, origin: copySavedButton, controls, status: this.copyStatus,
                labelText: this.savedLabel.textContent, buttonText: copySavedButton.textContent, document, chain, valid: true };
            const previousSavedOwner = savedOwners.get(host);
            savedOwners.set(host, savedOwner); previousSavedOwner?.invalidate();
            savedOwner.invalidate = () => { savedOwner.valid = false; if (this.copyReceipt?.saved) this.invalidateCopy(); };
            this.copyCompositionStart = () => { this.copySelectionKey = null; this.copySavedKey = null; this.invalidateCopy(); this.refreshCopyControl(); };
            this.copyCompositionEnd = () => this.refreshCopyControl();
            host.addEventListener('compositionstart', this.copyCompositionStart); host.addEventListener('compositionend', this.copyCompositionEnd);
            this.beforeUnload = event => { if (root.LocalItabContentLifecycle?.departing || !this.hasUncommittedWork()) return; event.preventDefault(); event.returnValue = ''; };
            root.addEventListener?.('beforeunload', this.beforeUnload);
            this.unsubscribe = controller.subscribe(() => this.render()); this.render(); run(() => controller.init());
        }
        render() {
            if (this.closed) return;
            // Check the displayed saved snapshot before a render can overwrite it.
            if (this.copyReceipt?.saved && !this.copyCurrent(this.copyReceipt)) this.invalidateCopy();
            const c = this.controller;
            if (this.importSession && !this.importCurrent(this.importSession)) this.cancelImport();
            this.importButton.disabled = !this.canImport();
            const visible = c.state?.enabled === true || c.hasUncommittedWork() || Boolean(!c.loaded && c.error);
            this.host.hidden = !visible;
            if (this.visible !== visible) { this.visible = visible; this.onVisibility(visible); }
            this.textarea.readOnly = !c.loaded || c.readError;
            this.savedPreview.hidden = this.savedLabel.hidden = this.copySavedButton.hidden = !c.conflict;
            if (this.savedPreview.value !== (c.state?.content || '')) this.savedPreview.value = c.state?.content || '';
            // Do not replace the DOM value during IME composition or on each
            // keystroke: that would reset the caret and the native undo stack.
            if (!c.composing && this.textarea.value !== c.draft) this.textarea.value = c.draft;
            // Count the same current DOM snapshot for both metrics. CRLF is one
            // break; a final CR/LF leaves an empty line. Soft wrapping is not a break.
            const editorText = this.textarea.value || '';
            let characterCount = 0, lineCount = editorText ? 1 : 0, previousCharacter = '';
            for (const character of editorText) {
                characterCount++;
                if (character === '\r' || (character === '\n' && previousCharacter !== '\r')) lineCount++;
                previousCharacter = character;
            }
            this.count.textContent = `${characterCount.toLocaleString()} / 32,000 · ${t('scratchpadLines').replace('{count}', lineCount.toLocaleString())}`;
            const text = statusText(c); if (this.status.textContent !== text) this.status.textContent = text;
            this.status.classList.toggle('scratchpad-error', Boolean(c.error || c.conflict));
            this.retry.hidden = (!c.error || Boolean(c.conflict)) && !c.readError || (c.loaded && ['TEXT', 'TEXT_LIMIT', 'SIZE_LIMIT'].includes(c.error?.code)); this.retry.disabled = Boolean(c.pending);
            this.useSaved.hidden = this.replace.hidden = !c.conflict;
            this.useSaved.disabled = Boolean(c.pending || c.composing);
            this.replace.disabled = Boolean(c.pending || c.composing || c.readError);
            this.exportButton.disabled = !c.loaded && !c.draft;
            this.renderFind();
            if (this.copyReceipt && !this.copyCurrent(this.copyReceipt)) this.invalidateCopy();
            this.refreshCopyControl();
        }
        findVisible(node) {
            return !this.closed && !this.controller.closed && this.host.isConnected && node?.isConnected && this.host.contains(node) &&
                !node.closest('[hidden], [inert], [aria-hidden="true"]') && node.getClientRects().length > 0 &&
                !['hidden', 'collapse'].includes(root.getComputedStyle?.(node)?.visibility);
        }
        canFind(node, event) {
            return this.controller.loaded && !document.hidden && !this.controller.composing && !this.findComposing &&
                !event?.isComposing && event?.keyCode !== 229 && !node?.disabled && this.findVisible(node) && this.findVisible(this.textarea);
        }
        resetFindResult() { this.findResult = null; if (this.findStatus) this.findStatus.textContent = ''; }
        closeFind(focus = false) {
            const restore = focus && this.findPanel.contains(document.activeElement);
            this.findHeldEnter = null; this.findComposing = false; this.findInput.value = ''; this.resetFindResult();
            this.findPanel.hidden = true; this.findButton.setAttribute('aria-expanded', 'false');
            this.findPrevious.disabled = this.findNext.disabled = true;
            if (restore && this.canFind(this.findButton)) { try { this.findButton.focus(); } catch (_) {} }
        }
        renderFind() {
            if (!this.findVisible(this.textarea)) this.closeFind();
            const match = this.findResult;
            if (match && (match.query !== this.findInput.value || match.text !== this.textarea.value)) this.resetFindResult();
            this.findButton.disabled = this.findSelectionButton.disabled = !this.controller.loaded;
            // Visibility/IME are checked at action time; disabling for a hidden
            // tab could strand controls after it returns without a new render.
            const disabled = !this.findInput.value || !this.controller.loaded || this.findPanel.hidden;
            this.findPrevious.disabled = this.findNext.disabled = disabled;
        }
        findSelectedText(event) {
            if (!this.canFind(this.findSelectionButton, event)) return;
            // Read the main DOM editor at activation, including after its blur.
            // Selection offsets are UTF-16; only the selected text needs to be
            // complete Unicode. The save limit does not limit this local query.
            const text = this.textarea.value, start = this.textarea.selectionStart, end = this.textarea.selectionEnd;
            const query = Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= text.length ? text.slice(start, end) : '';
            this.findHeldEnter = null; this.resetFindResult();
            this.findPanel.hidden = false; this.findButton.setAttribute('aria-expanded', 'true'); this.renderFind();
            if (!query || /[\r\n]/.test(query) || !api.isUnicode(query)) {
                this.findStatus.textContent = t('scratchpadFindSelectionHelp'); return;
            }
            const previousQuery = this.findInput.value;
            try { this.findInput.focus(); } catch (_) {}
            // Focus can synchronously change the draft, query, selection or view.
            // Never overwrite those newer changes with the activation snapshot.
            if (!this.canFind(this.findSelectionButton) || !this.canFind(this.findInput) ||
                this.textarea.value !== text || this.textarea.selectionStart !== start || this.textarea.selectionEnd !== end ||
                this.findInput.value !== previousQuery) return;
            if (document.activeElement !== this.findInput) {
                this.findStatus.textContent = t('scratchpadFindSelectionFailed'); return;
            }
            this.findInput.value = query; this.renderFind();
        }
        findEnter(direction, source, event) {
            if (event.key !== 'Enter' || !this.canFind(source, event)) return;
            // Also prevent native button activation, including key repeats, so
            // one keyboard gesture cannot run both keydown and default click.
            event.preventDefault();
            if (!event.repeat && this.findText(direction, source, event)) this.findHeldEnter = event;
        }
        findText(direction, source, event) {
            this.findHeldEnter = null;
            if (!this.findVisible(this.textarea)) { this.closeFind(); return; }
            if (!this.canFind(source, event) || !this.canFind(this.findInput)) return;
            // Read the actual editor each time: native textareas normalize CRLF,
            // and unsaved/conflicted/over-limit drafts are all searchable as-is.
            const query = this.findInput.value, text = this.textarea.value;
            if (!query) { this.resetFindResult(); return; }
            if (!api.isUnicode(query)) { this.resetFindResult(); this.findResult = { query, text }; this.findStatus.textContent = t('scratchpadFindInvalid'); return; }
            let previous = this.findResult;
            if (previous && (previous.query !== query || previous.text !== text || !Number.isInteger(previous.start))) previous = null;
            let start, wrapped = false;
            if (direction > 0) start = text.indexOf(query, previous ? previous.start + 1 : 0);
            // lastIndexOf(query, -1) still checks offset zero; explicitly stop
            // before zero so Previous can wrap and overlapping matches work.
            else start = previous ? (previous.start > 0 ? text.lastIndexOf(query, previous.start - 1) : -1) : text.lastIndexOf(query);
            if (start < 0 && previous) { wrapped = true; start = direction > 0 ? text.indexOf(query) : text.lastIndexOf(query); }
            this.resetFindResult(); this.findResult = { query, text };
            if (start < 0) { this.findStatus.textContent = t('scratchpadFindNoMatch'); return; }
            // Count the same literal, overlapping matches in this snapshot,
            // retaining only counters rather than a list or background index.
            let current = 0, total = 0;
            for (let offset = text.indexOf(query); offset >= 0; offset = text.indexOf(query, offset + 1)) {
                total++; if (offset === start) current = total;
            }
            const end = start + query.length;
            try {
                this.textarea.focus();
                // Focus handlers may hide/detach the card or change its text.
                if (document.activeElement !== this.textarea || !this.canFind(this.findInput) ||
                    this.findInput.value !== query || this.textarea.value !== text) throw new Error('stale find');
                this.textarea.setSelectionRange(start, end);
                if (!this.canFind(this.findInput) || this.findInput.value !== query || this.textarea.value !== text ||
                    this.textarea.selectionStart !== start || this.textarea.selectionEnd !== end) throw new Error('selection failed');
                this.findResult = { query, text, start, end, current, total };
                this.findStatus.textContent = t(wrapped ? (direction > 0 ? 'scratchpadFindWrappedNext' : 'scratchpadFindWrappedPrevious') : 'scratchpadFindSelected')
                    .replace('{current}', String(current)).replace('{total}', String(total));
                return true;
            } catch (_) {
                if (!this.findVisible(this.findInput)) this.closeFind();
                else this.findStatus.textContent = t('scratchpadFindFailed');
            }
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
            this.importSession = null; this.importApply.textContent = t('scratchpadImportReplace'); this.importAppend.checked = false; this.importAppend.disabled = true; this.importPanel.hidden = true; this.importPreview.textContent = ''; this.importInfo.textContent = ''; this.importFile.value = '';
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
            this.importSession = { state: session.state, generation: session.generation }; const owned = this.importSession;
            this.importPanel.hidden = false; this.importApply.disabled = true; this.importAppend.disabled = true;
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
                owned.text = text; owned.name = file.name;
                this.importAppend.disabled = false; this.renderImportPreview();
            } catch (_) {
                if (this.importCurrent(owned)) this.importInfo.textContent = t('scratchpadImportError');
            }
        }
        importResult(session) {
            const before = session.state.content, after = session.text;
            // Preserve both inputs exactly; separate adjacent non-empty lines only.
            const separator = before && after && !/[\r\n]$/.test(before) && !/^[\r\n]/.test(after) ? '\n' : '';
            return api.content(this.importAppend.checked ? before + separator + after : after);
        }
        renderImportPreview() {
            const session = this.importSession;
            if (!session || !this.importCurrent(session) || typeof session.text !== 'string') return;
            this.importApply.textContent = t(this.importAppend.checked ? 'scratchpadImportAppend' : 'scratchpadImportReplace');
            try {
                const text = this.importResult(session);
                this.importInfo.textContent = `${session.name} · ${Array.from(text).length.toLocaleString()} / 32,000 · ${new root.Blob([text]).size.toLocaleString()} B`;
                this.importPreview.textContent = text; this.importApply.disabled = false;
            } catch (_) {
                this.importPreview.textContent = ''; this.importApply.disabled = true;
                this.importInfo.textContent = t('scratchpadImportAppendLimit');
            }
        }
        applyImport() {
            const session = this.importSession;
            if (!session || !this.importCurrent(session) || typeof session.text !== 'string') { this.cancelImport(); return; }
            let text;
            try { text = this.importResult(session); } catch (_) { this.renderImportPreview(); return; }
            this.cancelImport();
            // The controller owns the draft from here: existing CAS, Retry, conflict
            // recovery, export and verified-save status apply without new storage.
            this.controller.setDraft(text); this.textarea.focus();
            run(() => this.controller.save());
        }
        canCopy(event) { return this.canCopyFrom(this.copyButton, event); }
        canCopyFrom(origin, event) {
            const c = this.controller, workspace = c.store?.backend?.workspace, session = root.LocalItabWorkspaces?.session;
            if (!c.loaded || c.composing || this.findComposing || event?.isComposing || event?.keyCode === 229 ||
                origin?.disabled || document.hidden || document.visibilityState === 'hidden' ||
                root.LocalItabContentLifecycle?.departing || workspace?.invalidated || workspace?._suspended ||
                (workspace && session && workspace !== session) || !this.findVisible(origin) || !this.findVisible(this.textarea)) return false;
            for (let node = origin.parentElement; node; node = node.parentElement) if (node.tagName === 'DETAILS' && !node.open) return false;
            return true;
        }
        selectionOwned(owner) {
            const workspace = owner?.controller.store?.backend?.workspace;
            return Boolean(owner?.controller === this.controller && (!workspace || root.LocalItabWorkspaces?.session === workspace) && owner?.valid && owner === this.copySelectionOwner && selectionOwners.get(owner.host) === owner && owner.host === this.host &&
                owner.editor === this.textarea && owner.origin === this.copySelectionButton && owner.status === this.copyStatus && owner.document === document &&
                owner.host.ownerDocument === document && owner.editor.ownerDocument === document && owner.origin.ownerDocument === document &&
                owner.controls.ownerDocument === document && owner.status.ownerDocument === document && owner.status.parentElement === owner.host &&
                owner.host.parentElement === owner.parent && owner.editor.parentElement === owner.host &&
                owner.origin.parentElement === owner.controls && owner.controls.parentElement === owner.host);
        }
        refreshCopyControl() {
            // Keep native focused buttons in place; every click rechecks readiness.
            this.copyButton.setAttribute('aria-disabled', String(Boolean(this.copyAttempt) || !this.canCopy()));
            this.copySelectionButton.setAttribute('aria-disabled', String(Boolean(this.copyAttempt) ||
                !this.selectionOwned(this.copySelectionOwner) || !this.canCopyFrom(this.copySelectionButton)));
            this.copySavedButton.setAttribute('aria-disabled', String(Boolean(this.copyAttempt) || !this.canCopySaved(this.copySavedOwner)));
        }
        invalidateSelectionCopy() { if (this.copyReceipt?.selection) this.invalidateCopy(); }
        invalidateCopy() {
            const receipt = this.copyReceipt;
            if (!receipt) return;
            receipt.valid = false; receipt.cleanup?.(); this.copyReceipt = null;
            const status = receipt.selection || receipt.saved ? receipt.owner.status : this.copyStatus;
            status.textContent = ''; status.hidden = true;
            // A system write already sent cannot be cancelled. Its single-flight
            // lock stays held until settlement, even after its feedback expires.
            this.refreshCopyControl();
        }
        copyCurrent(receipt) {
            try {
                if (this.copyReceipt !== receipt || !receipt.valid) return false;
                receipt.drain?.();
                if (receipt.saved) return this.savedCopyCurrent(receipt);
                const c = this.controller, workspace = c.store?.backend?.workspace;
                if (!this.canCopyFrom(receipt.origin)) return false;
                if (receipt.selection && (!this.selectionOwned(receipt.owner) ||
                    !Object.is(receipt.owner.editor.selectionStart, receipt.start) || !Object.is(receipt.owner.editor.selectionEnd, receipt.end) ||
                    !Object.is(receipt.owner.editor.selectionDirection, receipt.direction))) return false;
                // Recheck after DOM getters: a getter may synchronously edit or
                // retire this receipt. Only its pinned source can acknowledge it.
                const editorText = (receipt.selection ? receipt.owner.editor : this.textarea).value;
                return receipt.valid && this.copyReceipt === receipt && c.generation === receipt.generation &&
                    c.draft === receipt.draft && editorText === receipt.editorText && workspace === receipt.workspace &&
                    c.store?.backend?.workspace === workspace && workspace?.id === receipt.workspaceId &&
                    workspace?.generation === receipt.workspaceGeneration && root.LocalItabWorkspaces?.session === receipt.session &&
                    (!receipt.selection || this.selectionOwned(receipt.owner)) && this.canCopyFrom(receipt.origin);
            } catch (_) { return false; }
        }
        savedContext(owner) {
            if (!owner?.valid || owner !== this.copySavedOwner || savedOwners.get(owner.host) !== owner) return false;
            const c = owner.controller, workspace = owner.backend?.workspace;
            // A View belongs to its construction-time workspace. A later render
            // cannot authorize an old card against a replacement session/store.
            if (c !== this.controller || c.store !== owner.store || owner.store?.backend !== owner.backend ||
                workspace !== owner.workspace || workspace?.id !== owner.workspaceId || workspace?.generation !== owner.workspaceGeneration ||
                root.LocalItabWorkspaces?.session !== owner.session || (workspace && owner.session !== workspace)) {
                owner.valid = false; return false;
            }
            return owner.host === this.host && owner.preview === this.savedPreview && owner.label === this.savedLabel &&
                owner.origin === this.copySavedButton && owner.status === this.copyStatus && owner.document === document;
        }
        savedOwned(owner) {
            return this.savedContext(owner) &&
                [owner.host, owner.preview, owner.label, owner.origin, owner.controls, owner.status].every(node => node.ownerDocument === document) &&
                owner.preview.parentElement === owner.host && owner.label.parentElement === owner.host && owner.status.parentElement === owner.host &&
                owner.origin.parentElement === owner.controls && owner.controls.parentElement === owner.host &&
                owner.chain.every((node, index) => node.ownerDocument === document && (node.parentElement || null) === (owner.chain[index + 1] || null));
        }
        savedAvailable(owner, event) {
            // Controller/context eligibility only: no layout or ancestry reads.
            // Document visibility is checked again after the visual checks.
            if (!this.savedContext(owner)) return false;
            const c = owner.controller, workspace = owner.workspace;
            return !(this.closed || c.closed || !c.loaded || !c.conflict || c.pending || c.pendingWrite || c.readError ||
                (c.error && !['CONFLICT', 'TEXT', 'TEXT_LIMIT', 'SIZE_LIMIT'].includes(c.error.code)) ||
                c.composing || this.findComposing || event?.isComposing || event?.keyCode === 229 || event?.defaultPrevented || event?.repeat ||
                document.hidden || document.visibilityState === 'hidden' || root.LocalItabContentLifecycle?.departing ||
                workspace?.invalidated || workspace?._suspended);
        }
        canCopySaved(owner, event) {
            try {
                if (!this.savedOwned(owner) || !this.savedAvailable(owner, event)) return false;
                for (const source of [owner.preview, owner.label, owner.origin, owner.controls]) {
                    if (source.disabled || !this.findVisible(source)) return false;
                    for (let node = source; node; node = node.parentElement) {
                        if (node.tagName === 'DETAILS' && !node.open) return false;
                        const style = root.getComputedStyle?.(node);
                        if (style?.display === 'none' || ['hidden', 'collapse'].includes(style?.visibility)) return false;
                    }
                }
                return this.savedOwned(owner);
            } catch (_) { return false; }
        }
        savedState(owner) {
            // Store returns plain, validated data. Do not invoke a stale or
            // malformed state's accessors while deriving clipboard content.
            const state = Object.getOwnPropertyDescriptor(owner.controller, 'state')?.value;
            if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
            const fields = Object.getOwnPropertyDescriptors(state);
            if (!['schemaVersion', 'revision', 'content', 'enabled'].every(key => fields[key] && Object.hasOwn(fields[key], 'value')) || fields.schemaVersion.value !== 1) return null;
            const revision = fields.revision.value, content = fields.content.value, enabled = fields.enabled.value;
            if (!Number.isSafeInteger(revision) || revision < 0 || typeof content !== 'string' || typeof enabled !== 'boolean') return null;
            return { revision, content, enabled };
        }
        savedSnapshot(owner) {
            const state = this.savedState(owner);
            if (!state) return null;
            const display = owner.preview.value;
            if (typeof display !== 'string' || (display !== state.content && display !== state.content.replace(/\r\n?/g, '\n'))) return null;
            if (owner.label.textContent !== owner.labelText || owner.origin.textContent !== owner.buttonText) return null;
            return { ...state, display };
        }
        savedCopyCurrent(receipt) {
            const owner = receipt.owner;
            if (!this.canCopySaved(owner)) return false;
            const snapshot = this.savedSnapshot(owner);
            if (!snapshot || !receipt.snapshot || !['revision', 'content', 'enabled', 'display'].every(key => snapshot[key] === receipt.snapshot[key]) ||
                !this.canCopySaved(owner)) return false;
            // Recheck data after the last DOM/currentness getter can reenter.
            // Same revision/content refreshes may create a new state object.
            if (!this.savedAvailable(owner)) return false;
            const latest = this.savedState(owner);
            return receipt.valid && this.copyReceipt === receipt && latest &&
                ['revision', 'content', 'enabled'].every(key => latest[key] === receipt.snapshot[key]);
        }
        copySavedText(event, owner = this.copySavedOwner) { return this.executeSavedCopy(event, owner); }
        async executeSavedCopy(event, owner) {
            if (this.copyAttempt || event?.defaultPrevented || event?.detail > 1 || event?.repeat || this.copySavedKey?.used ||
                !owner || (event?.currentTarget && event.currentTarget !== owner.origin) ||
                (event?.target && !owner.origin.contains(event.target))) return;
            const receipt = { valid: true, saved: true, owner, origin: owner.origin };
            // Reserve before any DOM/state/clipboard getter can reenter another
            // copy route. Invalidating feedback never releases an issued write.
            this.copyAttempt = receipt;
            const cancel = () => { if (this.copyReceipt === receipt) this.invalidateCopy(); };
            try {
                if (this.copyReceipt && !this.copyCurrent(this.copyReceipt)) this.invalidateCopy();
                if (!this.canCopySaved(owner, event)) return;
                this.invalidateCopy(); this.copyReceipt = receipt;
                if (this.copySavedKey) this.copySavedKey.used = true;
                const sources = [owner.origin, owner.preview, owner.label, owner.controls, owner.status, ...owner.chain];
                const displays = [owner.origin, owner.preview, owner.label];
                const attributes = new Set([owner.origin, owner.preview, owner.label, owner.controls, ...owner.chain]);
                const invalidating = records => records.some(record => record.type === 'attributes' ? attributes.has(record.target) :
                    displays.some(node => node === record.target || node.contains?.(record.target)) ||
                    Array.from(record.removedNodes || []).some(node => sources.some(source => node === source || node.contains?.(source))));
                const observer = root.MutationObserver ? new root.MutationObserver(records => { if (invalidating(records)) cancel(); }) : null;
                receipt.drain = () => { if (observer && invalidating(observer.takeRecords())) cancel(); };
                receipt.cleanup = () => {
                    observer?.disconnect(); document.removeEventListener('visibilitychange', cancel, true);
                    root.removeEventListener?.('blur', cancel); root.removeEventListener?.('pagehide', cancel);
                    owner.preview.removeEventListener('input', cancel); owner.preview.removeEventListener('change', cancel);
                };
                const attributeFilter = ['hidden', 'inert', 'aria-hidden', 'style', 'class', 'open', 'disabled'];
                // Observe only original source nodes and their ancestor chain.
                // The status's own hidden/text updates must not cancel itself.
                for (const node of [...owner.chain, owner.controls]) observer?.observe(node, { childList: true, attributes: true, attributeFilter });
                for (const node of displays) observer?.observe(node, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter });
                document.addEventListener('visibilitychange', cancel, true);
                root.addEventListener?.('blur', cancel); root.addEventListener?.('pagehide', cancel);
                owner.preview.addEventListener('input', cancel); owner.preview.addEventListener('change', cancel);
                receipt.snapshot = this.savedSnapshot(owner);
                if (!this.copyCurrent(receipt)) { cancel(); return; }
                const payload = receipt.snapshot.content, status = owner.status;
                status.hidden = false;
                if (!payload) { status.textContent = t('scratchpadCopySavedEmpty'); return; }
                if (!api.isUnicode(payload)) { status.textContent = t('scratchpadCopySavedInvalid'); return; }
                status.textContent = t('scratchpadCopySavedCopying'); this.refreshCopyControl();
                const clipboard = this.clipboard, writeText = clipboard?.writeText;
                if (!this.copyCurrent(receipt)) { cancel(); return; }
                if (typeof writeText !== 'function') throw new Error('Clipboard unavailable');
                // Keep raw saved CRLF/CR. The DOM preview may display LF, but it
                // is only a currentness check and never the clipboard payload.
                const result = writeText.call(clipboard, payload);
                if (!this.copyCurrent(receipt)) cancel();
                await result;
                if (this.copyCurrent(receipt)) status.textContent = t('scratchpadCopySavedSuccess');
            } catch (_) {
                if (this.copyCurrent(receipt)) owner.status.textContent = t('scratchpadCopySavedFailure');
            } finally {
                if (!this.copyCurrent(receipt)) cancel();
                if (this.copyAttempt === receipt) this.copyAttempt = null;
                if (!this.closed) this.refreshCopyControl();
            }
        }
        copyText(event, origin = this.copyButton) { return this.executeCopy(event, origin); }
        copySelectedText(event, owner = this.copySelectionOwner) {
            if (event?.defaultPrevented || event?.detail > 1 || event?.repeat || this.copySelectionKey?.used ||
                !this.selectionOwned(owner) || (event?.currentTarget && event.currentTarget !== owner.origin) ||
                (event?.target && !owner.origin.contains(event.target))) return;
            if (this.copyAttempt || !this.canCopyFrom(owner.origin, event)) return;
            if (this.copySelectionKey) this.copySelectionKey.used = true;
            return this.executeCopy(event, owner.origin, owner);
        }
        async executeCopy(event, origin, owner = null) {
            if (this.copyAttempt || !this.canCopyFrom(origin, event) || (owner && !this.selectionOwned(owner))) return;
            this.invalidateCopy();
            const c = this.controller, workspace = c.store?.backend?.workspace, editor = owner ? owner.editor : this.textarea;
            const copyStatus = owner ? owner.status : this.copyStatus;
            const receipt = { valid: true, selection: Boolean(owner), origin, owner, draft: c.draft, generation: c.generation,
                workspace, workspaceId: workspace?.id, workspaceGeneration: workspace?.generation, session: root.LocalItabWorkspaces?.session };
            this.copyReceipt = receipt; this.copyAttempt = receipt;
            const cancel = () => { if (this.copyReceipt === receipt) this.invalidateCopy(); };
            // Record brief hide/show or detach/reattach cycles, even when the DOM
            // looks unchanged again by the time the clipboard promise settles.
            const sources = owner ? [origin, editor, owner.status] : [origin, editor];
            const invalidating = records => records.some(record => record.type === 'attributes' ?
                record.target.contains(origin) || record.target.contains(editor) :
                Array.from(record.removedNodes || []).some(node => sources.some(source => node === source || node.contains?.(source))));
            const observer = root.MutationObserver ? new root.MutationObserver(records => { if (invalidating(records)) cancel(); }) : null;
            const selectionChanged = event => {
                // Ignore unrelated document selections. Editor events also retire
                // A→B→A changes whose offsets already look unchanged again.
                if (event.target === editor || document.activeElement === editor ||
                    editor.value !== receipt.editorText || editor.selectionStart !== receipt.start ||
                    editor.selectionEnd !== receipt.end || editor.selectionDirection !== receipt.direction) cancel();
            };
            receipt.drain = () => { if (observer && invalidating(observer.takeRecords())) cancel(); };
            receipt.cleanup = () => {
                observer?.disconnect(); document.removeEventListener('visibilitychange', cancel, true);
                root.removeEventListener?.('blur', cancel); root.removeEventListener?.('pagehide', cancel);
                if (owner) {
                    editor.removeEventListener('select', selectionChanged); editor.removeEventListener('selectionchange', selectionChanged);
                    document.removeEventListener('selectionchange', selectionChanged);
                }
            };
            document.addEventListener('visibilitychange', cancel, true);
            root.addEventListener?.('blur', cancel); root.addEventListener?.('pagehide', cancel);
            const attributeFilter = ['hidden', 'inert', 'aria-hidden', 'style', 'class', 'open'];
            if (owner) attributeFilter.push('disabled');
            observer?.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter });
            if (owner) {
                editor.addEventListener('select', selectionChanged); editor.addEventListener('selectionchange', selectionChanged);
                document.addEventListener('selectionchange', selectionChanged);
            }
            try {
                receipt.editorText = editor.value;
                if (owner) { receipt.start = editor.selectionStart; receipt.end = editor.selectionEnd; receipt.direction = editor.selectionDirection; }
                if (!this.copyCurrent(receipt)) { cancel(); return; }
                copyStatus.hidden = false;
                let payload = receipt.draft;
                if (owner) {
                    const { start, end, editorText } = receipt;
                    payload = Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= editorText.length ? editorText.slice(start, end) : '';
                    if (!payload || !api.isUnicode(payload)) { copyStatus.textContent = t('scratchpadCopySelectionHelp'); return; }
                } else {
                    if (!payload) { copyStatus.textContent = t('scratchpadCopyEmpty'); return; }
                    if (!api.isUnicode(payload)) { copyStatus.textContent = t('scratchpadCopyInvalid'); return; }
                }
                this.copyAttempt = receipt;
                copyStatus.textContent = t(owner ? 'scratchpadCopySelectionCopying' : 'scratchpadCopying'); this.refreshCopyControl();
                // The full route retains the exact controller draft (including
                // CRLF). The selection route slices the native DOM value only.
                // No awaited work precedes this user-activated system call.
                const clipboard = this.clipboard, writeText = clipboard?.writeText;
                if (!this.copyCurrent(receipt)) { cancel(); return; }
                if (typeof writeText !== 'function') throw new Error('Clipboard unavailable');
                const result = writeText.call(clipboard, payload);
                if (!this.copyCurrent(receipt)) cancel();
                await result;
                if (this.copyCurrent(receipt)) copyStatus.textContent = t(owner ? 'scratchpadCopySelectionSuccess' : 'scratchpadCopySuccess');
            } catch (_) {
                if (this.copyCurrent(receipt)) copyStatus.textContent = t(owner ? 'scratchpadCopySelectionFailure' : 'scratchpadCopyFailure');
            } finally {
                if (!this.copyCurrent(receipt)) cancel();
                if (this.copyAttempt === receipt) this.copyAttempt = null;
                if (!this.closed) this.refreshCopyControl();
            }
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
        destroy() {
            this.copySavedOwner.valid = false;
            if (savedOwners.get(this.host) === this.copySavedOwner) savedOwners.delete(this.host);
            this.copySelectionOwner.valid = false;
            if (selectionOwners.get(this.host) === this.copySelectionOwner) selectionOwners.delete(this.host);
            this.invalidateCopy(); this.closeFind(); this.cancelImport(); this.closed = true;
            this.host.removeEventListener('compositionstart', this.copyCompositionStart); this.host.removeEventListener('compositionend', this.copyCompositionEnd);
            this.host.removeEventListener('keyup', this.findKeyup); this.host.removeEventListener('pointerdown', this.findPointerdown); this.host.removeEventListener('keydown', this.findKeydown);
            document.removeEventListener('visibilitychange', this.findVisibilityChange);
            root.removeEventListener?.('beforeunload', this.beforeUnload); this.unsubscribe(); this.controller.destroy();
        }
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
