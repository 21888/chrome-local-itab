(function (root) {
    'use strict';
    const api = root.LocalItabCountdown;
    // An issued system write outlives its card. Keep the lock across remounts.
    let copyFlight = null;
    const copyOwners = new WeakMap(), copyViews = new Set();
    const fallback = {
        countdownTitle: 'Countdown', countdownLocal: 'On this device',
        countdownEventLabel: 'Milestone title (up to 80 characters)', countdownDateLabel: 'Target date (YYYY-MM-DD)',
        countdownDateHelp: 'Use a real calendar date from 0001-01-01 to 9999-12-31. Days are counted by your device’s local calendar, not 24-hour periods.',
        countdownDatePreview: 'Date preview (current draft): $1',
        countdownRelativeDaysLabel: 'Days from today',
        countdownRelativeDirectionLabel: 'Direction from today',
        countdownRelativeAfter: 'After today', countdownRelativeBefore: 'Before today',
        countdownRelativeDaysHelp: 'Choose After today or Before today and enter digits 0–9 only; 0 means today in either direction. Fill date uses your device’s local calendar when clicked, within 0001-01-01 to 9999-12-31, and changes only the draft date. The day count and direction are not saved. Choose Save separately.',
        countdownRelativeApply: 'Fill date',
        countdownRelativeError: 'Choose After today or Before today and enter a non-negative whole number using digits 0–9 only, with a resulting date from 0001-01-01 to 9999-12-31. Your draft is unchanged.',
        countdownRelativeFilled: 'Draft date filled: $1. Choose Save separately.',
        countdownEnable: 'Show Countdown on the new tab page',
        countdownEnableHelp: 'Optional and device-local. Hiding Countdown keeps its saved title and date.',
        countdownHelp: 'Saved only in this browser profile on this device. Excluded from settings exports, browser Sync and Google Drive backups. No notifications or network requests. Removing the extension or clearing browser data can erase it. Export a text copy to keep your own backup.',
        countdownLoading: 'Loading local Countdown…', countdownSaving: 'Saving…',
        countdownSaved: 'Saved on this device', countdownUnsaved: 'Unsaved changes',
        countdownLoadError: 'Could not load Countdown. Retry to read the saved state. Your draft is still here.',
        countdownSaveError: 'Could not confirm the save. Your draft is still here. Retry or export a text copy before leaving.',
        countdownConflict: 'Another page changed this Countdown. Your draft is still here. Load saved to discard this draft, or replace the saved Countdown with this draft.',
        countdownCardConflict: 'Another page changed this Countdown. Load saved before choosing Hide again.',
        countdownInvalidDate: 'Enter a real date in YYYY-MM-DD format, from 0001-01-01 to 9999-12-31.',
        countdownInvalidTitle: 'Use a plain-text title without control characters or invalid Unicode.',
        countdownTitleTooLong: 'This title is too long to save. Shorten it or export a text copy before leaving.',
        countdownUnconfigured: 'Add a title and target date before showing Countdown.',
        countdownRetry: 'Retry', countdownUseSaved: 'Load saved', countdownReplace: 'Replace with my draft',
        countdownSave: 'Save', countdownCancel: 'Cancel', countdownHide: 'Hide', countdownEdit: 'Edit',
        countdownCopyDate: 'Copy date', countdownCopying: 'Copying date…', countdownCopySuccess: 'Date copied.',
        countdownCopyFailure: 'Could not copy. Try Copy date again, or select the date to copy it manually.',
        countdownImport: 'Import text', countdownImportPreview: 'Countdown text preview',
        countdownImportApply: 'Use title and date in draft', countdownImportCancel: 'Cancel import',
        countdownImportReading: 'Reading text…',
        countdownImportReady: 'Review the title and date below. Applying replaces those draft fields only; visibility stays unchanged. Choose Save separately to keep them.',
        countdownImportHelp: 'Choose a UTF-8 .txt exported by Countdown (up to 32,000 characters and 128 KiB). A complete title and real date are required. Multiline or long recovery titles are preserved in the draft, but must be edited to a single line of up to 80 characters before saving.',
        countdownImportError: 'Could not read this Countdown export. Choose a complete UTF-8 .txt with a title, a real YYYY-MM-DD date on its last content line, and a final newline. Incomplete recovery exports cannot be imported. Your draft is unchanged.',
        countdownExport: 'Export text', countdownExportError: 'Could not export a text copy. Your draft is still here.',
        countdownExportTooLarge: 'This draft is too large to export. Keep the full copy within 32,000 characters and 128 KiB of UTF-8 text. Your draft is still here.',
        countdownDiscardConfirm: 'Discard this unsaved Countdown draft and load the latest saved title, date and visibility?',
        countdownReplaceConfirm: 'Replace the latest saved Countdown with this draft? Other open pages will receive this change.',
        countdownSavedPreview: 'Latest saved Countdown', countdownNotConfigured: 'Not configured', countdownShown: 'Shown', countdownHidden: 'Hidden',
        countdownToday: 'Today', countdownDayLeft: '1 day left', countdownDaysLeft: '$1 days left',
        countdownDayAgo: '1 day ago', countdownDaysAgo: '$1 days ago'
    };
    function t(key, value) {
        const translated = root.i18n?.t(key, value === undefined ? [] : [String(value)]);
        return (translated && translated !== key ? translated : fallback[key] || key).replace(/\$1/g, String(value ?? ''));
    }
    function el(tag, cls, text) { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; }
    function button(key, action) { const node = el('button', 'countdown-button', t(key)); node.type = 'button'; node.addEventListener('click', action); return node; }
    function run(action) { try { Promise.resolve(action()).catch(() => {}); } catch (_) {} }
    function setText(node, value) { if (node.textContent !== value) node.textContent = value; }
    function validationKey(error) {
        return { DATE: 'countdownInvalidDate', TEXT: 'countdownInvalidTitle', TEXT_LIMIT: 'countdownTitleTooLong', SIZE_LIMIT: 'countdownTitleTooLong', UNCONFIGURED: 'countdownUnconfigured' }[error?.code];
    }
    function canRetry(c) {
        return Boolean(c.readError || (c.error && !validationKey(c.error) &&
            (!c.conflict || (c.lastAttempt && c.error.code !== 'CONFLICT'))));
    }
    function statusText(c) {
        if (c.readError) return t('countdownLoadError');
        if (c.conflict) return t('countdownConflict');
        if (c.error) return t(validationKey(c.error) || (c.loaded ? 'countdownSaveError' : 'countdownLoadError'));
        if (!c.loaded) return t('countdownLoading');
        if (c.pending) return t('countdownSaving');
        return t(c.hasUncommittedWork() ? 'countdownUnsaved' : 'countdownSaved');
    }
    function exportText(fields, status) {
        let url, link;
        try {
            const blob = new root.Blob([api.exportText(fields)], { type: 'text/plain;charset=utf-8' });
            url = root.URL.createObjectURL(blob); link = el('a'); link.href = url; link.download = 'local-itab-countdown.txt';
            document.body.append(link); link.click(); link.remove();
            root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);
        } catch (error) { link?.remove(); if (url) root.URL.revokeObjectURL(url); setText(status, t(error?.code === 'SIZE_LIMIT' ? 'countdownExportTooLarge' : validationKey(error) || 'countdownExportError')); }
    }
    function daysText(days) {
        if (days === 0) return t('countdownToday');
        if (days === 1) return t('countdownDayLeft');
        if (days === -1) return t('countdownDayAgo');
        return t(days > 0 ? 'countdownDaysLeft' : 'countdownDaysAgo', Math.abs(days).toLocaleString());
    }
    class View {
        constructor(host, { controller = new api.Controller(), onVisibility = () => {}, now = () => new Date() } = {}) {
            this.host = host; this.controller = controller; this.onVisibility = onVisibility; this.now = now;
            this.closed = false; this.suspended = false; this.timeout = null;
            const previous = copyOwners.get(host);
            if (previous) { previous.invalidateCopy(); previous.cancelTick(); previous.copyObserver?.disconnect(); copyViews.delete(previous); }
            copyOwners.set(host, this); copyViews.add(this);
            this.copyWorkspace = controller.store?.backend?.workspace; this.copyWorkspaceId = this.copyWorkspace?.id;
            this.copySession = root.LocalItabWorkspaces?.session; this.copySessionId = this.copySession?.id;
            host.classList.add('local-countdown-card'); host.setAttribute('aria-label', t('countdownTitle')); host.hidden = true;
            const header = el('header', 'countdown-header'); header.append(el('h2', '', t('countdownTitle')), el('span', 'countdown-local', t('countdownLocal')));
            this.title = el('h3', 'countdown-event'); this.date = el('time', 'countdown-date');
            this.remaining = el('p', 'countdown-remaining');
            // Calendar-day updates are deliberately not a live region.
            this.remaining.setAttribute('aria-live', 'off');
            this.status = el('p', 'countdown-status'); this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
            this.hideButton = button('countdownHide', () => { this.invalidateCopy(); run(() => controller.setEnabled(false)); });
            this.copyButton = button('countdownCopyDate', event => this.copyDate(event));
            this.copyStatus = el('p', 'countdown-status countdown-copy-status', '');
            this.copyStatus.setAttribute('role', 'status'); this.copyStatus.setAttribute('aria-live', 'polite');
            this.edit = el('a', 'countdown-button', t('countdownEdit'));
            // Dashboard startup captures this tab's session before mounting cards.
            const workspaceId = root.LocalItabWorkspaces?.session?.id;
            const settingsPath = 'options.html' + (workspaceId ? '?workspace=' + encodeURIComponent(workspaceId) : '') + '#countdown-settings';
            this.edit.href = root.LocalItabWorkspacesView?.settingsUrl?.(workspaceId, 'countdown-settings') ||
                root.chrome?.runtime?.getURL?.(settingsPath) || settingsPath;
            this.edit.target = '_blank'; this.edit.rel = 'noopener';
            this.exportButton = button('countdownExport', () => exportText(controller.state, this.status));
            this.retry = button('countdownRetry', () => run(() => controller.retry()));
            this.useSaved = button('countdownUseSaved', () => run(() => controller.useSaved()));
            const controls = el('div', 'countdown-controls'); controls.append(this.edit, this.copyButton, this.hideButton, this.exportButton, this.retry, this.useSaved);
            host.replaceChildren(header, this.title, this.date, this.remaining, controls, this.copyStatus, this.status);
            this.visibility = () => {
                if (document.hidden || document.visibilityState === 'hidden') this.invalidateCopy();
                if (!this.closed) this.render();
            };
            this.pagehide = () => { this.suspended = true; this.invalidateCopy(); this.refreshCopyControl(); this.cancelTick(); };
            this.copyBlur = () => this.invalidateCopy();
            root.addEventListener?.('blur', this.copyBlur);
            this.pageshow = () => { this.suspended = false; this.render(); };
            document.addEventListener('visibilitychange', this.visibility);
            root.addEventListener?.('focus', this.visibility); root.addEventListener?.('pagehide', this.pagehide); root.addEventListener?.('pageshow', this.pageshow);
            // Dashboard visibility can change without a document visibility event.
            // Watch only ancestor visibility attributes; never observe our own render.
            if (root.MutationObserver) {
                this.observer = new root.MutationObserver(this.visibility);
                for (let node = host.parentElement; node; node = node.parentElement) this.observer.observe(node, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
            }
            if (root.MutationObserver) {
                this.copyObserver = new root.MutationObserver(records => this.checkCopyMutations(records));
                this.copyObserver.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'inert', 'style', 'class', 'open'] });
            }
            this.unsubscribe = controller.subscribe(() => this.render()); this.render(); run(() => controller.init());
        }
        cancelTick() { if (this.timeout !== null) { root.clearTimeout(this.timeout); this.timeout = null; } }
        render() {
            if (this.closed || copyOwners.get(this.host) !== this) return;
            this.cancelTick();
            const c = this.controller, state = c.state;
            let days;
            try { if (state?.title && state.targetDate) days = api.calendarDifference(state.targetDate, this.now()); } catch (_) {}
            // Only this card's unresolved Hide owns a temporary recovery surface.
            // A background read failure must never reveal an intentionally hidden milestone.
            const attempt = c.lastAttempt;
            const recoveringHide = attempt?.kind === 'visibility' && attempt.value === false &&
                attempt.baseline?.enabled === true && Boolean(c.pending || c.error || c.readError || c.conflict);
            // Another page may clear the saved title/date while this Hide is unresolved.
            // Keep its recovery controls reachable without inventing a day count.
            const hasDays = Number.isInteger(days);
            const visible = recoveringHide || (hasDays && Boolean(state?.enabled));
            // Do not enqueue an unchanged hidden attribute on each calendar tick.
            if (this.host.hidden !== !visible) this.host.hidden = !visible;
            if (this.visible !== visible) { this.visible = visible; this.onVisibility(visible); }
            setText(this.title, state?.title || ''); setText(this.date, state?.targetDate || ''); this.date.dateTime = state?.targetDate || '';
            setText(this.remaining, visible && hasDays ? daysText(days) : '');
            setText(this.status, c.conflict && !c.readError ? t('countdownCardConflict') : c.error || c.readError || c.pending ? statusText(c) : '');
            this.status.classList.toggle('countdown-error', Boolean(c.error || c.readError || c.conflict));
            this.hideButton.disabled = !c.loaded || Boolean(c.pending || c.readError || c.conflict || c.error);
            this.exportButton.disabled = !state?.title || !state?.targetDate;
            this.retry.hidden = !canRetry(c); this.retry.disabled = Boolean(c.pending);
            this.useSaved.hidden = !c.conflict; this.useSaved.disabled = Boolean(c.pending);
            this.copySnapshot = null;
            try {
                api.validate(state);
                this.copySnapshot = { state, ...state };
            } catch (_) {}
            if (this.copyReceipt && !this.copyCurrent(this.copyReceipt)) this.invalidateCopy();
            this.refreshCopyControl();
            if (visible && hasDays && state.enabled && !document.hidden && !this.suspended && this.host.getClientRects().length) {
                this.timeout = root.setTimeout(() => { this.timeout = null; this.render(); }, 60000);
            }
        }
        canCopyDate(event) {
            const c = this.controller, snapshot = this.copySnapshot, state = c.state;
            const workspace = c.store?.backend?.workspace, session = root.LocalItabWorkspaces?.session;
            if (this.closed || this.suspended || copyOwners.get(this.host) !== this || c.closed || !c.loaded ||
                c.pending || c.error || c.readError || c.conflict || c.composing || event?.isComposing || event?.keyCode === 229 ||
                ['loading', 'saving', 'error'].includes(c.status) || !snapshot || state !== snapshot.state || !state.enabled ||
                ['schemaVersion', 'revision', 'title', 'targetDate', 'enabled'].some(key => state[key] !== snapshot[key]) ||
                document.hidden || document.visibilityState === 'hidden' || root.LocalItabContentLifecycle?.departing ||
                workspace !== this.copyWorkspace || workspace?.id !== this.copyWorkspaceId || workspace?.invalidated || workspace?._suspended ||
                session !== this.copySession || session?.id !== this.copySessionId || session?.invalidated || session?._suspended ||
                (workspace && session && workspace !== session)) return false;
            for (const node of [this.host, this.copyButton, this.date, this.title, this.copyStatus]) {
                if (node.ownerDocument !== document || !node.isConnected || !this.host.contains(node) || node.closest('[hidden], [inert]')) return false;
                // An empty status is intentionally display:none; the date and native button must be visible.
                if (node !== this.copyStatus && (!node.getClientRects().length || ['hidden', 'collapse'].includes(root.getComputedStyle?.(node)?.visibility))) return false;
                for (let parent = node.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS' && !parent.open) return false;
            }
            return this.date.textContent === snapshot.targetDate && this.date.dateTime === snapshot.targetDate && this.title.textContent === snapshot.title;
        }
        refreshCopyControl() {
            if (!this.closed && copyOwners.get(this.host) === this && this.host.contains(this.copyButton)) {
                // aria-disabled preserves native button focus; the click guard enforces it.
                this.copyButton.setAttribute('aria-disabled', String(Boolean(copyFlight) || !this.canCopyDate()));
            }
        }
        invalidateCopy() {
            if (this.copyReceipt) this.copyReceipt.valid = false;
            this.copyReceipt = null;
            if (this.copyStatus) { setText(this.copyStatus, ''); this.copyStatus.classList.remove('countdown-error'); }
            // Never unlock an already invoked system clipboard write here.
        }
        checkCopyMutations(records = []) {
            const targets = [this.host, this.copyButton, this.date, this.title];
            const invalid = records.some(record => record.type === 'attributes'
                ? targets.some(node => record.target === node || record.target.contains?.(node))
                : record.target === this.date || record.target === this.title ||
                    Array.from(record.removedNodes || []).some(removed => targets.some(node => removed === node || removed.contains?.(node))));
            if (invalid) { this.invalidateCopy(); this.refreshCopyControl(); }
        }
        copyCurrent(receipt) {
            return receipt.valid && this.copyReceipt === receipt && receipt.state === this.controller.state &&
                receipt.readGeneration === this.controller.readGeneration &&
                ['schemaVersion', 'revision', 'title', 'targetDate', 'enabled'].every(key => this.controller.state[key] === receipt[key]) && this.canCopyDate();
        }
        async copyDate(event) {
            this.checkCopyMutations(this.copyObserver?.takeRecords?.() || []);
            if (copyFlight || !this.canCopyDate(event)) return;
            const receipt = { ...this.copySnapshot, valid: true, readGeneration: this.controller.readGeneration };
            this.copyReceipt = receipt;
            const flight = { receipt }; copyFlight = flight;
            setText(this.copyStatus, t('countdownCopying')); this.copyStatus.classList.remove('countdown-error');
            for (const view of copyViews) view.refreshCopyControl();
            const current = () => {
                this.checkCopyMutations(this.copyObserver?.takeRecords?.() || []);
                return this.copyCurrent(receipt);
            };
            try {
                // Synchronous user-gesture call. No storage read, permission query or fallback write.
                const clipboard = root.navigator?.clipboard;
                if (typeof clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
                await clipboard.writeText(receipt.targetDate);
                if (current()) setText(this.copyStatus, t('countdownCopySuccess'));
            } catch (_) {
                if (current()) { setText(this.copyStatus, t('countdownCopyFailure')); this.copyStatus.classList.add('countdown-error'); }
            } finally {
                if (!current()) this.invalidateCopy();
                if (copyFlight === flight) copyFlight = null;
                // Only present owners receive the unlock, including a replacement card.
                for (const view of copyViews) view.refreshCopyControl();
            }
        }
        hasUncommittedWork() { return this.controller.hasUncommittedWork(); }
        destroy() {
            this.invalidateCopy(); copyViews.delete(this); this.copyObserver?.disconnect();
            if (copyOwners.get(this.host) === this) copyOwners.delete(this.host);
            root.removeEventListener?.('blur', this.copyBlur);
            this.closed = true; this.cancelTick(); this.observer?.disconnect(); this.unsubscribe(); this.controller.destroy();
            document.removeEventListener('visibilitychange', this.visibility); root.removeEventListener?.('focus', this.visibility);
            root.removeEventListener?.('pagehide', this.pagehide); root.removeEventListener?.('pageshow', this.pageshow);
        }
    }
    class SettingsView {
        constructor(host, { controller = new api.Controller(), now = () => new Date() } = {}) {
            this.host = host; this.controller = controller; this.now = now;
            this.closed = false; this.suspended = false; this.timeout = null;
            host.classList.add('local-countdown-settings');
            const titleLabel = el('label', 'countdown-field', t('countdownEventLabel'));
            this.title = el('textarea', 'countdown-input'); this.title.rows = 2; this.title.setAttribute('aria-label', t('countdownEventLabel')); this.title.autocomplete = 'off';
            titleLabel.append(this.title);
            const dateLabel = el('label', 'countdown-field', t('countdownDateLabel'));
            this.date = el('input', 'countdown-input'); this.date.type = 'text'; this.date.placeholder = 'YYYY-MM-DD'; this.date.setAttribute('aria-label', t('countdownDateLabel'));
            this.date.autocomplete = 'off'; this.date.spellcheck = false;
            dateLabel.append(this.date);
            this.datePreview = el('p', 'countdown-help countdown-date-preview');
            this.datePreview.setAttribute('aria-live', 'off');
            const dateField = el('div', 'countdown-field'); dateField.append(dateLabel, this.datePreview);
            const relativeLabel = el('label', 'countdown-field', t('countdownRelativeDaysLabel'));
            this.relativeDays = el('input', 'countdown-input'); this.relativeDays.type = 'text'; this.relativeDays.inputMode = 'numeric';
            this.relativeDays.setAttribute('aria-label', t('countdownRelativeDaysLabel')); this.relativeDays.autocomplete = 'off'; this.relativeDays.spellcheck = false;
            relativeLabel.append(this.relativeDays);
            const directionLabel = el('label', 'countdown-field', t('countdownRelativeDirectionLabel'));
            this.relativeDirection = el('select', 'countdown-input');
            this.relativeDirection.setAttribute('aria-label', t('countdownRelativeDirectionLabel'));
            for (const [value, key] of [['after', 'countdownRelativeAfter'], ['before', 'countdownRelativeBefore']]) {
                const option = el('option', '', t(key)); option.value = value; this.relativeDirection.append(option);
            }
            this.relativeDirection.value = 'after'; directionLabel.append(this.relativeDirection);
            this.relativeApply = button('countdownRelativeApply', event => this.fillRelativeDate(event));
            // Suppress native held-key repeats without adding an input/global shortcut.
            this.relativeApply.addEventListener('keydown', event => {
                if ((event.key === 'Enter' || event.key === ' ') && (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault();
            });
            const relativeControls = el('div', 'countdown-controls'); relativeControls.append(this.relativeApply);
            this.relativeStatus = el('p', 'countdown-status'); this.relativeStatus.setAttribute('role', 'status'); this.relativeStatus.setAttribute('aria-live', 'polite');
            dateField.append(relativeLabel, directionLabel, el('p', 'countdown-help', t('countdownRelativeDaysHelp')), relativeControls, this.relativeStatus);
            // Count and direction are temporary calculation parameters, not draft fields.
            // Their edits and parameter IME must not invalidate a reviewed TXT import.
            this.relativeDays.addEventListener('input', () => this.clearRelativeStatus());
            this.relativeDirection.addEventListener('change', () => this.clearRelativeStatus());
            this.relativeDays.addEventListener('compositionstart', () => { this.relativeComposing = true; this.clearRelativeStatus(); this.renderRelativeControl(); });
            this.relativeDays.addEventListener('compositionend', () => { this.relativeComposing = false; this.renderRelativeControl(); });
            this.enabled = el('input'); this.enabled.type = 'checkbox';
            const enableLabel = el('label', 'countdown-enable-label'); enableLabel.append(this.enabled, el('span', '', t('countdownEnable')));
            this.status = el('p', 'countdown-status'); this.status.tabIndex = -1; this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
            const inputs = el('div', 'countdown-fields'); inputs.append(titleLabel, dateField);
            this.saveButton = button('countdownSave', () => this.runAction(this.saveButton, () => controller.save()));
            this.cancelButton = button('countdownCancel', () => this.loadSaved(this.cancelButton));
            this.retry = button('countdownRetry', () => this.runAction(this.retry, () => controller.retry()));
            this.useSaved = button('countdownUseSaved', () => this.loadSaved(this.useSaved));
            this.replace = button('countdownReplace', () => {
                if (controller.pending || controller.composing || controller.readError || !controller.conflict) return;
                if (root.confirm(t('countdownReplaceConfirm'))) this.runAction(this.replace, () => controller.replaceWithDraft());
            });
            this.exportButton = button('countdownExport', () => this.exportText());
            this.importButton = button('countdownImport', () => this.chooseImport());
            this.importFile = el('input'); this.importFile.type = 'file'; this.importFile.accept = '.txt,text/plain'; this.importFile.hidden = true;
            this.importFile.addEventListener('change', () => run(() => this.readImport()));
            this.importFile.addEventListener('cancel', () => this.cancelImport(true));
            this.importPanel = el('section', 'countdown-import'); this.importPanel.hidden = true;
            this.importInfo = el('p', 'countdown-help'); this.importInfo.setAttribute('role', 'status');
            this.importPreview = el('pre', 'countdown-saved-preview countdown-import-preview'); this.importPreview.tabIndex = 0;
            this.importPreview.setAttribute('aria-label', t('countdownImportPreview'));
            this.importApply = button('countdownImportApply', () => this.applyImport());
            this.importCancel = button('countdownImportCancel', () => this.cancelImport(true));
            const importControls = el('div', 'countdown-controls'); importControls.append(this.importApply, this.importCancel);
            this.importPanel.append(this.importInfo, this.importPreview, el('p', 'countdown-help', t('countdownImportHelp')), importControls);
            this.importPanel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); this.cancelImport(true); } });
            this.visibility = () => { this.renderRelativeControl(); this.renderDatePreview(); };
            this.pagehide = () => { this.suspended = true; this.renderRelativeControl(); this.cancelTick(); this.cancelImport(); };
            this.pageshow = () => { this.suspended = false; this.renderRelativeControl(); this.renderDatePreview(); };
            document.addEventListener('visibilitychange', this.visibility);
            root.addEventListener?.('focus', this.visibility); root.addEventListener?.('pagehide', this.pagehide); root.addEventListener?.('pageshow', this.pageshow);
            const controls = el('div', 'countdown-controls'); controls.append(this.saveButton, this.cancelButton, this.exportButton, this.importButton, this.retry, this.useSaved, this.replace);
            this.savedLabel = el('p', 'countdown-help', t('countdownSavedPreview'));
            this.savedPreview = el('pre', 'countdown-saved-preview'); this.savedPreview.setAttribute('aria-label', t('countdownSavedPreview'));
            host.replaceChildren(inputs, el('p', 'countdown-help', t('countdownDateHelp')), enableLabel, el('p', 'countdown-help', t('countdownEnableHelp')), controls, this.importFile, this.importPanel, this.status, this.savedLabel, this.savedPreview, el('p', 'countdown-help', t('countdownHelp')));
            this.title.addEventListener('input', () => { if (controller.loaded) controller.setDraft({ title: this.title.value }); });
            this.date.addEventListener('input', () => { if (controller.loaded) controller.setDraft({ targetDate: this.date.value }); });
            this.enabled.addEventListener('change', () => { if (controller.loaded) controller.setDraft({ enabled: this.enabled.checked }); });
            for (const [field, key] of [[this.title, 'title'], [this.date, 'targetDate']]) {
                field.addEventListener('compositionstart', () => controller.setComposing(true));
                field.addEventListener('compositionend', () => { if (controller.loaded) controller.setDraft({ [key]: field.value }); controller.setComposing(false); });
            }
            // Settings sections can be hidden directly or by an ancestor. Do not
            // observe descendants: preview text/hidden writes must not loop back.
            if (root.MutationObserver) {
                this.observer = new root.MutationObserver(this.visibility);
                for (let node = host; node; node = node.parentElement) this.observer.observe(node, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
            }
            this.unsubscribe = controller.subscribe(() => this.render()); this.render(); run(() => controller.init());
        }
        cancelTick() { if (this.timeout !== null) { root.clearTimeout(this.timeout); this.timeout = null; } }
        renderDatePreview() {
            if (this.closed) return;
            this.cancelTick();
            const c = this.controller, targetDate = c.draft?.targetDate;
            let days;
            try { if (!c.composing && targetDate) days = api.calendarDifference(targetDate, this.now()); } catch (_) {}
            const valid = Number.isInteger(days);
            this.datePreview.hidden = !valid;
            setText(this.datePreview, valid ? t('countdownDatePreview', `${targetDate} · ${daysText(days)}`) : '');
            // This clock only reads the draft and updates this non-live preview.
            // Never re-render status/import controls or read storage on a tick.
            if (valid && !document.hidden && document.visibilityState !== 'hidden' && !this.suspended &&
                this.host.getClientRects().length && !['hidden', 'collapse'].includes(root.getComputedStyle?.(this.host)?.visibility)) {
                this.timeout = root.setTimeout(() => { this.timeout = null; this.renderDatePreview(); }, 60000);
            }
        }
        canFillRelativeDate(event) {
            const c = this.controller, workspace = c.store?.backend?.workspace, session = root.LocalItabWorkspaces?.session;
            if (this.closed || this.suspended || c.closed || !c.loaded || c.pending || c.composing || this.relativeComposing ||
                event?.defaultPrevented || event?.repeat || event?.detail > 1 || event?.isComposing || event?.keyCode === 229 || c.readError || c.conflict ||
                (c.error && !['INVALID', 'TEXT', 'TEXT_LIMIT', 'SIZE_LIMIT', 'DATE', 'UNCONFIGURED'].includes(c.error.code)) ||
                document.hidden || document.visibilityState === 'hidden' || root.LocalItabContentLifecycle?.departing ||
                workspace?.invalidated || workspace?._suspended || (workspace && session && workspace !== session)) return false;
            for (const node of [this.relativeDays, this.relativeDirection, this.relativeApply, this.date]) {
                if (!node.isConnected || !this.host.contains(node) || node.closest('[hidden], [inert]') ||
                    !node.getClientRects().length || ['hidden', 'collapse'].includes(root.getComputedStyle?.(node)?.visibility)) return false;
                for (let parent = node.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS' && !parent.open) return false;
            }
            return true;
        }
        renderRelativeControl() {
            if (!this.closed) this.relativeApply.disabled = !this.canFillRelativeDate();
        }
        clearRelativeStatus() {
            this.relativeReceipt = null; setText(this.relativeStatus, ''); this.relativeStatus.classList.remove('countdown-error');
        }
        fillRelativeDate(event) {
            if (!this.canFillRelativeDate(event)) return;
            const c = this.controller;
            let targetDate;
            try {
                // Number alone would accept empty strings, signs, fractions or exponents.
                if (!/^[0-9]+$/.test(this.relativeDays.value)) throw api.fault('DAYS');
                targetDate = api.dateFromToday(Number(this.relativeDays.value), this.now(), this.relativeDirection.value);
            } catch (_) {
                this.relativeReceipt = { generation: c.generation, state: c.state };
                setText(this.relativeStatus, t('countdownRelativeError')); this.relativeStatus.classList.add('countdown-error'); return;
            }
            // An unchanged result is a no-op, so existing import review/read ownership survives.
            // A real change uses the existing generation and validation-error recovery rules.
            if (targetDate !== c.draft.targetDate) c.setDraft({ targetDate });
            this.relativeReceipt = { generation: c.generation, state: c.state };
            setText(this.relativeStatus, t('countdownRelativeFilled', targetDate)); this.relativeStatus.classList.remove('countdown-error');
        }
        canImport() {
            const c = this.controller;
            return !this.closed && this.host.isConnected && c.loaded && !c.pending && !c.composing && !c.readError && !c.conflict && !c.error;
        }
        importCurrent(session) {
            return this.importSession === session && this.canImport() && this.controller.state === session.state && this.controller.generation === session.generation;
        }
        cancelImport(focus = false) {
            const restore = this.importPanel.contains(document.activeElement);
            this.importSession = null; this.importPanel.hidden = true; this.importPreview.textContent = ''; this.importInfo.textContent = '';
            this.importApply.disabled = true; this.importFile.value = '';
            if (focus && this.canImport()) this.importButton.focus();
            else if (restore && !this.closed) this.title.focus();
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
            const files = Array.from(this.importFile.files || []); this.importFile.value = '';
            if (!files.length) { this.cancelImport(true); return; }
            const owned = this.importSession = { state: session.state, generation: session.generation };
            this.importPanel.hidden = false; this.importApply.disabled = true; this.importPreview.textContent = '';
            this.importInfo.textContent = t('countdownImportReading'); this.importCancel.focus();
            try {
                const file = files[0];
                if (files.length !== 1 || !/\.txt$/i.test(file.name) || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > api.LIMITS.exportBytes) throw api.fault('SIZE_LIMIT');
                const bytes = await file.arrayBuffer();
                if (!this.importCurrent(owned)) return;
                if (bytes.byteLength !== file.size || bytes.byteLength > api.LIMITS.exportBytes) throw api.fault('SIZE_LIMIT');
                owned.fields = api.parseText(new root.TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
                this.importPreview.textContent = api.exportText(owned.fields);
                this.importInfo.textContent = t('countdownImportReady'); this.importApply.disabled = false;
            } catch (_) {
                if (this.importCurrent(owned)) this.importInfo.textContent = t('countdownImportError');
            }
        }
        applyImport() {
            const session = this.importSession;
            if (!session || !this.importCurrent(session) || !session.fields) { this.cancelImport(); return; }
            const fields = session.fields; this.cancelImport();
            // Import never saves, changes visibility, or bypasses existing conflict handling.
            this.controller.setDraft({ title: fields.title, targetDate: fields.targetDate }); this.title.focus();
        }
        runAction(origin, action) {
            const visible = node => node?.isConnected && this.host.contains(node) && !node.closest('[inert]') &&
                node.getClientRects().length && !['hidden', 'collapse'].includes(root.getComputedStyle?.(node)?.visibility);
            const owned = !this.closed && !document.hidden && document.visibilityState !== 'hidden' &&
                visible(origin) && !origin.disabled && document.activeElement === origin;
            // Let the real synchronous busy/error render finish first. Only repair
            // the initiating control's lost focus; never reclaim it after an await.
            run(action);
            if (owned && !this.closed && !document.hidden && document.visibilityState !== 'hidden' &&
                origin.isConnected && this.host.contains(origin) && document.activeElement === document.body &&
                (origin.disabled || !origin.getClientRects().length) && visible(this.status)) this.status.focus();
        }
        loadSaved(origin) {
            const c = this.controller;
            if (c.pending || c.composing) return;
            if (c.dirty() && !root.confirm(t('countdownDiscardConfirm'))) return;
            this.runAction(origin, () => c.useSaved());
        }
        exportText() {
            const draft = this.controller.composing ? { ...this.controller.draft, title: this.title.value, targetDate: this.date.value } : this.controller.draft;
            exportText(draft, this.status);
        }
        render() {
            if (this.closed) return;
            const c = this.controller, draft = c.draft || {};
            if (this.relativeReceipt && (c.pending || c.generation !== this.relativeReceipt.generation || c.state !== this.relativeReceipt.state)) this.clearRelativeStatus();
            this.relativeDays.disabled = this.relativeDirection.disabled = !c.loaded;
            this.renderRelativeControl();
            if (this.importSession && !this.importCurrent(this.importSession)) this.cancelImport();
            this.importButton.disabled = !this.canImport();
            // The controller owns input generations. Never replace values during
            // composition or rewrite an unchanged value (caret/undo preservation).
            if (!c.composing) {
                if (this.title.value !== (draft.title || '')) this.title.value = draft.title || '';
                if (this.date.value !== (draft.targetDate || '')) this.date.value = draft.targetDate || '';
            }
            this.enabled.checked = draft.enabled === true;
            this.title.disabled = this.date.disabled = this.enabled.disabled = !c.loaded;
            this.saveButton.disabled = !c.loaded || Boolean(c.pending || c.composing || c.readError || c.conflict || c.error) || !c.dirty();
            this.cancelButton.disabled = !c.loaded || Boolean(c.pending || c.composing) || !c.hasUncommittedWork();
            this.exportButton.disabled = !c.loaded && !draft.title && !draft.targetDate;
            this.retry.hidden = !canRetry(c); this.retry.disabled = Boolean(c.pending || c.composing);
            this.useSaved.hidden = this.replace.hidden = !c.conflict;
            this.useSaved.disabled = Boolean(c.pending || c.composing);
            this.replace.disabled = Boolean(c.pending || c.composing || c.readError);
            this.savedLabel.hidden = this.savedPreview.hidden = !c.conflict;
            const saved = c.state;
            setText(this.savedPreview, saved ? `${saved.title || t('countdownNotConfigured')}\n${saved.targetDate || ''}\n${t(saved.enabled ? 'countdownShown' : 'countdownHidden')}` : t('countdownNotConfigured'));
            setText(this.status, statusText(c)); this.status.classList.toggle('countdown-error', Boolean(c.error || c.readError || c.conflict));
            this.renderDatePreview();
        }
        hasUncommittedWork() { return this.controller.hasUncommittedWork(); }
        destroy() {
            this.closed = true; this.cancelTick(); this.observer?.disconnect(); this.cancelImport();
            document.removeEventListener('visibilitychange', this.visibility); root.removeEventListener?.('focus', this.visibility);
            root.removeEventListener?.('pagehide', this.pagehide); root.removeEventListener?.('pageshow', this.pageshow);
            this.unsubscribe(); this.controller.destroy();
        }
    }
    Object.assign(api, { View, SettingsView, mount: (host, options) => new View(host, options), mountSettings: (host, options) => new SettingsView(host, options) });
})(window);
