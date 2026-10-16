(function (root) {
    'use strict';
    const api = root.LocalItabFocus;
    const fallback = {
        focusTitleBackground: 'Timer in background',
        focusTitleHelp: 'While this page is visible, a running timer shows its remaining time in the tab title. In the background the title shows only the interval type, without a live countdown or completion alert. Pausing or finishing restores the original title.',
        focusViewEnter: 'Temporary focus view', focusViewExit: 'Exit focus view',
        focusViewHelp: 'Hide other modules on this page until you exit or the interval ends. Your saved layout stays the same.',
        focusViewBlocked: 'Finish or save open edits and close other panels before entering focus view.',
        focusTitle: 'Focus timer', focusLocal: 'On this device', focusPhase: 'Interval', focusWork: 'Focus', focusBreak: 'Break',
        focusMinutes: 'Minutes (1–180)', focusStart: 'Start', focusPause: 'Pause', focusResume: 'Resume', focusReset: 'Stop / reset',
        focusNextBreak: 'Choose break', focusNextWork: 'Choose focus', focusRemaining: 'Remaining time', focusReady: 'Ready to start',
        focusRunning: 'Running', focusPaused: 'Paused', focusCompleted: 'Interval complete. Choose your next interval when ready.',
        focusUncertain: 'The clocks disagree. Exact remaining time is uncertain. Stop / reset, then start deliberately.',
        focusHelp: 'Each workspace shares one timer across its own new-tab pages. No sound or background alert. Closing or hiding the page keeps the saved deadline; reopening estimates elapsed time using your device clock. Clock changes while closed can affect that estimate. Each interval starts only when you press Start. Settings exports and cloud backups exclude this timer. Removing the extension or browser data can erase it.',
        focusBrief: 'One timer per workspace, shared across its new-tab pages. No sound or background alert.', focusDetails: 'How timing works',
        focusEnable: 'Show Focus timer on the new tab page', focusEnableHelp: 'Optional and device-local. Hiding it keeps the current session and deadline.',
        focusLoading: 'Loading local timer…', focusSaving: 'Saving timer…', focusError: 'Could not confirm the timer change. Read the latest state before trying again.',
        focusDraftRetained: 'Your unsaved minutes are kept on this page. Finish editing when that interval is ready.', focusSaveMinutes: 'Save minutes',
        focusWorkspaceUnavailable: 'Timer unavailable in this tab',
        focusWorkspaceReopen: 'Reopen the workspace to read its saved timer. Any unsaved minutes remain on this page.',
        focusWorkspaceError: 'The previous timer operation could not be confirmed. Reopen the workspace to check its saved state.',
        focusConflict: 'Another page changed this timer. The latest saved state is shown; choose again.', focusRetry: 'Read latest state', focusInvalidMinutes: 'Enter whole minutes from 1 to 180.'
    };
    function t(key) { const translated = root.i18n?.t(key); return translated && translated !== key ? translated : fallback[key] || key; }
    function el(tag, cls, text) { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; }
    function button(key, action) { const node = el('button', 'focus-button', t(key)); node.type = 'button'; node.addEventListener('click', action); node.addEventListener('keydown', event => { if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault(); }); return node; }
    // Presentation only: no second ticker, storage calls or background work.
    class TitlePresentation {
        constructor(view, titleNode) {
            this.view = view; this.node = titleNode; this.original = document.title;
            this.last = this.original; this.workspace = root.LocalItabWorkspaces?.session?.id;
            this.closed = false; this.yielded = false; this.suspended = false;
            this.pagehide = () => { this.restore(); this.suspended = true; };
            this.pageshow = () => { this.suspended = false; this.update(); };
            root.addEventListener?.('pagehide', this.pagehide);
            root.addEventListener?.('pageshow', this.pageshow);
        }
        owns() {
            if (this.yielded || document.querySelector('title') !== this.node ||
                document.querySelector('title[data-i18n="newTabTitle"]') !== this.node || document.title !== this.last) {
                this.yielded = true; return false;
            }
            return true;
        }
        write(value) {
            if (!this.owns()) return;
            if (document.title !== value) document.title = value;
            this.last = value;
        }
        restore() { this.write(this.original); }
        update() {
            if (this.closed || this.suspended || this.yielded) return;
            const view = this.view, state = view.controller.snapshot();
            if (view.isWorkspaceRetired() || this.workspace !== root.LocalItabWorkspaces?.session?.id || root.LocalItabContentLifecycle?.departing ||
                view.closed || !view.host.isConnected) { this.restore(); this.destroy(); return; }
            if (!state?.enabled || state.session.status !== 'running' || view.controller.error) { this.restore(); return; }
            const phase = t(state.session.phase === 'focus' ? 'focusWork' : 'focusBreak');
            // Hidden-page timers can be throttled or frozen indefinitely. Never
            // leave a stale numeric countdown or claim an interval is still running.
            this.write(document.hidden ? `${phase} · ${t('focusTitleBackground')}` : `${api.formatRemaining(state.session.remainingMs)} · ${phase}`);
        }
        destroy() {
            if (this.closed) return;
            this.restore(); this.closed = true;
            root.removeEventListener?.('pagehide', this.pagehide);
            root.removeEventListener?.('pageshow', this.pageshow);
        }
    }
    class View {
        constructor(host, { controller = new api.Controller(), onVisibility = () => {} } = {}) {
            this.host = host; this.controller = controller; this.onVisibility = onVisibility; this.timeout = null; this.closed = false; this.lastStatus = null; this.durationDrafts = new Map(); this.minutesPhase = null; this.durationInputPhase = null; this.temporaryFocus = null;
            // Pin the View to the same Session as its timer backend. An equal
            // workspace id is not ownership of a restored/replaced Session.
            this.workspaceSession = controller.store?.backend?.workspace || root.LocalItabWorkspaces?.session;
            this.workspaceIdentity = { id: this.workspaceSession?.id, generation: this.workspaceSession?.generation };
            this.workspaceRetired = false;
            host.classList.add('local-focus-card'); host.setAttribute('aria-label', t('focusTitle')); host.hidden = true;
            const header = el('header', 'focus-header'); header.append(el('h2', '', t('focusTitle')), el('span', 'focus-local', t('focusLocal')));
            this.focusViewButton = button('focusViewEnter', () => this.temporaryFocus ? this.exitTemporaryFocus() : this.enterTemporaryFocus());
            this.focusViewButton.setAttribute('aria-pressed', 'false'); this.focusViewButton.title = t('focusViewHelp');
            header.append(this.focusViewButton);
            this.focusViewNotice = el('p', 'focus-feedback'); this.focusViewNotice.setAttribute('role', 'status'); this.focusViewNotice.hidden = true;
            this.workspaceNotice = el('p', 'focus-feedback'); this.workspaceNotice.setAttribute('role', 'status'); this.workspaceNotice.hidden = true;
            this.phase = el('select'); this.phase.setAttribute('aria-label', t('focusPhase'));
            for (const [value, key] of [['focus', 'focusWork'], ['break', 'focusBreak']]) { const option = el('option', '', t(key)); option.value = value; this.phase.append(option); }
            this.phase.addEventListener('change', () => this.run('phase', this.phase.value));
            const minuteLabel = el('label', 'focus-minutes', t('focusMinutes')); this.minutes = el('input'); this.minutes.type = 'number'; this.minutes.min = '1'; this.minutes.max = '180'; this.minutes.step = '1';
            this.minutes.addEventListener('input', () => { if (this.trackDurationDraft()) { this.durationInputPhase = this.minutesPhase; this.render(); } });
            this.minutes.addEventListener('change', () => { if (this.durationInputPhase === this.minutesPhase) this.commitDurationDraft(); });
            this.saveMinutes = button('focusSaveMinutes', () => { if (!this.saveMinutes.hidden && !this.saveMinutes.disabled) this.commitDurationDraft(true); });
            minuteLabel.append(this.minutes); const inputs = el('div', 'focus-inputs'); inputs.append(this.phase, minuteLabel, this.saveMinutes);
            this.remaining = el('div', 'focus-remaining'); this.remaining.setAttribute('role', 'timer'); this.remaining.setAttribute('aria-live', 'off'); this.remaining.setAttribute('aria-label', t('focusRemaining'));
            this.status = el('p', 'focus-status'); this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
            this.start = button('focusStart', () => {
                const state = this.controller.snapshot(); if (!state || this.controller.pending || this.start.disabled) return; const status = state.session.status;
                if (status === 'completed') this.run('phase', state.session.phase === 'focus' ? 'break' : 'focus');
                else if (['ready', 'running', 'paused'].includes(status)) this.run({ ready: 'start', running: 'pause', paused: 'resume' }[status]);
            });
            this.reset = button('focusReset', () => this.run('reset'));
            const controls = el('div', 'focus-controls'); controls.append(this.start, this.reset);
            this.feedback = el('p', 'focus-feedback'); this.feedback.setAttribute('role', 'status'); this.retry = button('focusRetry', () => {
                if (this.closed || this.isWorkspaceRetired()) { this.render(); return; }
                controller.refresh().catch(() => {});
            });
            const details = el('details', 'focus-help');
            details.append(el('summary', '', t('focusDetails')), el('p', '', t('focusHelp')), el('p', '', t('focusTitleHelp')));
            host.replaceChildren(header, this.focusViewNotice, inputs, this.remaining, this.status, this.workspaceNotice, controls, el('p', 'focus-help', t('focusBrief')), details, this.feedback, this.retry);
            this.visibility = () => { this.cancelTick(); if (this.closed) return; if (!document.hidden && !this.isWorkspaceRetired()) { controller.tick(); controller.refresh().catch(() => {}); } this.render(); };
            document.addEventListener('visibilitychange', this.visibility);
            // Window bubbling lets nested dialogs, menus and disclosures own Escape first.
            this.focusViewKey = event => {
                if (!this.temporaryFocus || event.key !== 'Escape' || event.defaultPrevented || event.repeat ||
                    event.isComposing || event.keyCode === 229 || this.hasFocusViewOverlay()) return;
                if (event.target?.closest('select')) return;
                const details = event.target?.closest('details[open]');
                if (details && this.host.contains(details)) {
                    event.preventDefault(); details.open = false; details.querySelector('summary')?.focus(); return;
                }
                event.preventDefault(); this.exitTemporaryFocus();
            };
            this.focusViewPageHide = () => this.exitTemporaryFocus(false);
            root.addEventListener?.('keydown', this.focusViewKey);
            root.addEventListener?.('pagehide', this.focusViewPageHide);
            this.workspaceChanged = () => this.render();
            this.unsubscribeWorkspace = this.workspaceSession?.manager?.subscribe(this.workspaceChanged);
            root.addEventListener?.('pageshow', this.workspaceChanged);
            this.unsubscribe = controller.subscribe(() => this.render()); this.render();
            if (!this.isWorkspaceRetired()) controller.refresh().catch(() => {});
        }
        isWorkspaceRetired() {
            const session = this.workspaceSession;
            if (!session || this.workspaceRetired) return this.workspaceRetired;
            const identity = this.workspaceIdentity;
            this.workspaceRetired = Boolean(session.invalidated || session !== root.LocalItabWorkspaces?.session ||
                (identity.id && identity.id !== session.id) || (identity.generation && identity.generation !== session.generation));
            // Capture may still be settling when mounted. A first identity is
            // allowed; once retired this View never adopts any newer identity.
            if (!this.workspaceRetired && !identity.id && session.id) this.workspaceIdentity = { id: session.id, generation: session.generation };
            return this.workspaceRetired;
        }
        attachDocumentTitle() {
            // Called only after newtab's final static-shell localization. Options
            // and standalone component hosts never opt in implicitly.
            if (this.closed || this.isWorkspaceRetired() || this.titlePresentation || !this.host.isConnected || !this.host.closest('#dashboard')) return false;
            const node = document.querySelector('title[data-i18n="newTabTitle"]');
            const expected = root.i18n?.t('newTabTitle') || 'New Tab';
            if (!node || document.querySelector('title') !== node || document.title !== expected) return false;
            this.titlePresentation = new TitlePresentation(this, node); this.titlePresentation.update(); return true;
        }
        hasFocusViewOverlay() {
            return Boolean(this.host.closest('[inert]')) || Array.from(document.querySelectorAll(
                '[role="dialog"], [role="alertdialog"], dialog[open], .modal-overlay.active, [role="menu"]'
            )).some(node => node.getClientRects().length && !node.closest('[hidden], [inert], [aria-hidden="true"]'));
        }
        enterTemporaryFocus() {
            const state = this.controller.snapshot();
            if (this.closed || this.isWorkspaceRetired() || this.temporaryFocus || !this.host.isConnected || this.host.hidden ||
                !this.host.closest('#dashboard') || root.dashboardHiddenState || document.body.classList.contains('dashboard-hidden') ||
                !state?.enabled || !['ready', 'running', 'paused'].includes(state.session.status)) return false;
            if (this.hasUncommittedWork() || root.localScratchpadView?.hasUncommittedWork() ||
                root.LocalItabContentLifecycle?.hasUncommittedWork() || root.LocalItabContentLifecycle?.departing ||
                root.appearanceController?.previewGuard || root.appearanceController?.previewBusy ||
                this.hasFocusViewOverlay()) {
                this.focusViewNotice.textContent = t('focusViewBlocked'); this.focusViewNotice.hidden = false; return false;
            }
            this.focusViewNotice.hidden = true;
            this.temporaryFocus = { workspace: root.LocalItabWorkspaces?.session?.id,
                run: state.session.status === 'ready' ? null : state.session.id, x: root.scrollX || 0, y: root.scrollY || 0 };
            document.body.classList.add('temporary-focus-view');
            this.focusViewButton.textContent = t('focusViewExit'); this.focusViewButton.setAttribute('aria-pressed', 'true');
            this.focusViewButton.focus({ preventScroll: true }); root.scrollTo?.({ top: 0, left: 0, behavior: 'instant' });
            return true;
        }
        exitTemporaryFocus(restoreScroll = true) {
            const session = this.temporaryFocus;
            if (!session) return false;
            this.temporaryFocus = null;
            document.body.classList.remove('temporary-focus-view');
            this.focusViewButton.textContent = t('focusViewEnter'); this.focusViewButton.setAttribute('aria-pressed', 'false');
            // The same button stays mounted, so no focus restoration can steal
            // a newer target. Restore the old scroll only while this card owns it.
            if (restoreScroll && !document.hidden && this.host.isConnected && this.host.contains(document.activeElement) &&
                !this.hasFocusViewOverlay()) root.scrollTo?.({ top: session.y, left: session.x, behavior: 'instant' });
            return true;
        }
        trackDurationDraft() {
            const state = this.controller.snapshot();
            // A refresh may disable or repurpose the input before its native
            // change event. Never apply that event to another phase or run.
            if (this.closed || this.isWorkspaceRetired() || this.minutes.disabled || this.controller.pending || !state ||
                state.session.status !== 'ready' || this.minutesPhase !== state.session.phase) return false;
            if (this.minutes.value === String(state.durations[this.minutesPhase])) this.durationDrafts.delete(this.minutesPhase);
            else this.durationDrafts.set(this.minutesPhase, this.minutes.value);
            return true;
        }
        commitDurationDraft(explicit = false) {
            if (!this.trackDurationDraft()) return;
            this.durationInputPhase = null;
            const phase = this.minutesPhase, draft = this.minutes.value, value = Number(draft);
            if (!Number.isInteger(value) || value < 1 || value > 180) {
                this.durationDrafts.delete(phase); this.render();
                this.feedback.textContent = t('focusInvalidMinutes'); return;
            }
            this.run('duration', value, explicit ? this.saveMinutes : null);
        }
        run(kind, value, focusSource = this.start) {
            if (this.closed || this.isWorkspaceRetired()) { this.render(); return Promise.resolve(); }
            // Native disabled buttons lose focus. Restore only this user-owned
            // primary action (or explicit Save → Start), never a completion,
            // blur autosave, remote update or newer intent.
            const token = {}; this.focusIntent = token;
            const ownsFocus = document.activeElement === focusSource && !this.controller.pending;
            const cancel = () => { if (this.focusIntent === token) this.focusIntent = null; };
            const moved = event => { if (event.target !== this.start && event.target !== document.body) cancel(); };
            const key = event => { if (!(event.repeat && (event.key === 'Enter' || event.key === ' '))) cancel(); };
            if (ownsFocus) {
                document.addEventListener('pointerdown', cancel, true);
                document.addEventListener('keydown', key, true);
                document.addEventListener('focusin', moved, true);
                document.addEventListener('visibilitychange', cancel, true);
                root.addEventListener?.('blur', cancel);
            }
            return this.controller.action(kind, value).then(saved => {
                if (ownsFocus && this.focusIntent === token && !this.closed && !this.isWorkspaceRetired() && !document.hidden &&
                    !this.host.hidden && this.host.isConnected && !this.start.disabled &&
                    this.controller.snapshot()?.revision === saved.revision &&
                    (document.activeElement === document.body || document.activeElement === this.start)) {
                    this.start.focus({ preventScroll: true });
                }
                return saved;
            }).catch(() => {}).finally(() => {
                if (this.focusIntent === token) this.focusIntent = null;
                if (ownsFocus) {
                    document.removeEventListener('pointerdown', cancel, true);
                    document.removeEventListener('keydown', key, true);
                    document.removeEventListener('focusin', moved, true);
                    document.removeEventListener('visibilitychange', cancel, true);
                    root.removeEventListener?.('blur', cancel);
                }
            });
        }
        cancelTick() { if (this.timeout !== null) { root.clearTimeout(this.timeout); this.timeout = null; } }
        render() {
            if (this.closed) return;
            if (this.isWorkspaceRetired()) {
                this.cancelTick(); this.focusIntent = null; this.exitTemporaryFocus(false); this.titlePresentation?.destroy();
                this.focusViewNotice.hidden = true;
                const visible = this.controller.snapshot()?.enabled !== false;
                this.host.hidden = !visible;
                if (this.visible !== visible) { this.visible = visible; this.onVisibility(visible); }
                this.remaining.textContent = '—:—'; this.status.textContent = t('focusWorkspaceUnavailable');
                this.workspaceNotice.textContent = t('focusWorkspaceReopen'); this.workspaceNotice.hidden = false;
                for (const control of [this.start, this.reset, this.phase, this.minutes, this.saveMinutes, this.retry, this.focusViewButton]) control.disabled = true;
                this.saveMinutes.hidden = !this.durationDrafts.has(this.minutesPhase);
                // Keep drafts and pending/uncertain-write evidence. Presentation
                // retirement neither refreshes nor mutates the timer or Session.
                this.feedback.textContent = this.controller.error ? t('focusWorkspaceError') : this.controller.pending ? t('focusSaving') : '';
                this.retry.hidden = !this.controller.error;
                return;
            }
            this.titlePresentation?.update();
            this.cancelTick(); const state = this.controller.snapshot(), pending = Boolean(this.controller.pending);
            if (!state) { this.exitTemporaryFocus(); this.focusViewButton.disabled = true; this.saveMinutes.hidden = true; this.saveMinutes.disabled = true; this.start.disabled = true; this.reset.disabled = true; this.phase.disabled = true; this.minutes.disabled = true; if (this.controller.error) { this.host.hidden = false; if (this.visible !== true) { this.visible = true; this.onVisibility(true); } } this.feedback.textContent = t(this.controller.error ? 'focusError' : 'focusLoading'); this.retry.hidden = !this.controller.error; return; }
            const s = state.session;
            if (this.temporaryFocus) {
                if (!state.enabled || !this.host.isConnected || root.dashboardHiddenState || document.body.classList.contains('dashboard-hidden') ||
                    this.temporaryFocus.workspace !== root.LocalItabWorkspaces?.session?.id ||
                    !['ready', 'running', 'paused'].includes(s.status) ||
                    (this.temporaryFocus.run && (s.status === 'ready' || this.temporaryFocus.run !== s.id))) this.exitTemporaryFocus();
                else if (s.status !== 'ready' && s.id) this.temporaryFocus.run = s.id;
            }
            this.focusViewButton.disabled = !this.temporaryFocus && (pending || !['ready', 'running', 'paused'].includes(s.status));
            this.host.hidden = !state.enabled; if (this.host.hidden) this.focusIntent = null;
            if (this.visible !== state.enabled) { this.visible = state.enabled; this.onVisibility(state.enabled); }
            this.phase.value = s.phase; this.phase.disabled = pending || !['ready', 'completed'].includes(s.status);
            for (const [phase, value] of this.durationDrafts) {
                // A submitted value confirmed in saved state is clean even
                // when its typed form was noncanonical (e.g. 030 → 30).
                if (value === String(state.durations[phase]) || (this.durationInputPhase === null && Number(value) === state.durations[phase])) this.durationDrafts.delete(phase);
            }
            if (this.minutesPhase !== s.phase || s.status !== 'ready') this.durationInputPhase = null;
            this.minutesPhase = s.phase;
            // Keep raw input (including empty/invalid typing) across renders.
            // An active timer always displays its committed duration; drafts
            // stay phase-bound until that interval is ready to edit again.
            const minutes = s.status === 'ready' && this.durationDrafts.has(s.phase) ? this.durationDrafts.get(s.phase) : String(state.durations[s.phase]);
            if (this.minutes.value !== minutes) this.minutes.value = minutes;
            this.minutes.disabled = pending || s.status !== 'ready';
            this.remaining.textContent = s.status === 'uncertain' ? '—:—' : api.formatRemaining(s.remainingMs);
            const statusKey = { ready: 'focusReady', running: 'focusRunning', paused: 'focusPaused', completed: 'focusCompleted', uncertain: 'focusUncertain' }[s.status];
            if (this.lastStatus !== statusKey) { this.status.textContent = t(statusKey); this.lastStatus = statusKey; }
            this.start.textContent = t({ ready: 'focusStart', running: 'focusPause', paused: 'focusResume', completed: s.phase === 'focus' ? 'focusNextBreak' : 'focusNextWork', uncertain: 'focusStart' }[s.status]);
            const editableDraft = s.status === 'ready' && this.durationDrafts.has(s.phase);
            this.saveMinutes.hidden = !editableDraft; this.saveMinutes.disabled = pending;
            this.start.disabled = pending || s.status === 'uncertain' || editableDraft; this.reset.disabled = pending || s.status === 'ready';
            const hiddenDraft = this.durationDrafts.size > (editableDraft ? 1 : 0);
            this.feedback.textContent = this.controller.error ? t(this.controller.error.code === 'CONFLICT' ? 'focusConflict' : 'focusError') : pending ? t('focusSaving') : hiddenDraft ? t('focusDraftRetained') : '';
            this.retry.hidden = !this.controller.error; this.retry.disabled = pending;
            if (!document.hidden && state.enabled && s.status === 'running') {
                const revision = state.revision, timeout = root.setTimeout(() => {
                    if (this.closed || this.timeout !== timeout) return;
                    this.timeout = null;
                    if (this.isWorkspaceRetired()) this.render(); else this.controller.tick(revision);
                }, 250); this.timeout = timeout;
            }
        }
        hasUncommittedWork() { return this.durationDrafts.size > 0 || this.controller.hasUncommittedWork(); }
        destroy() { this.titlePresentation?.destroy(); this.exitTemporaryFocus(false); root.removeEventListener?.('keydown', this.focusViewKey); root.removeEventListener?.('pagehide', this.focusViewPageHide); root.removeEventListener?.('pageshow', this.workspaceChanged); this.closed = true; this.unsubscribeWorkspace?.(); this.durationDrafts.clear(); this.cancelTick(); this.unsubscribe(); document.removeEventListener('visibilitychange', this.visibility); this.controller.destroy(); }
    }
    function mountSettings(host, { controller = new api.Controller() } = {}) {
        host.classList.add('local-focus-settings'); const label = el('label', 'focus-enable-label'), input = el('input'); input.type = 'checkbox'; input.disabled = true;
        label.append(input, el('span', '', t('focusEnable'))); const status = el('p', 'focus-feedback'); status.setAttribute('role', 'status');
        const retry = button('focusRetry', () => controller.refresh().catch(() => {}));
        host.replaceChildren(label, el('p', 'focus-help', t('focusEnableHelp')), el('p', 'focus-help', t('focusHelp')), status, retry);
        input.addEventListener('change', () => controller.action('visibility', input.checked).catch(() => {}));
        const render = () => { const state = controller.snapshot(); input.disabled = !state || Boolean(controller.pending); input.checked = state?.enabled === true;
            status.textContent = t(controller.error ? 'focusError' : controller.pending ? 'focusSaving' : !state ? 'focusLoading' : 'focusEnableHelp'); retry.hidden = !controller.error; retry.disabled = Boolean(controller.pending); };
        const unsubscribe = controller.subscribe(render); render(); controller.refresh().catch(() => {});
        return { controller, destroy() { unsubscribe(); controller.destroy(); } };
    }
    Object.assign(api, { View, mount: (host, options) => new View(host, options), mountSettings });
})(window);
