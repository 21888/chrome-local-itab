(function (root) {
    'use strict';
    const api = root.LocalItabFocus;
    const fallback = {
        focusTitle: 'Focus timer', focusLocal: 'On this device', focusPhase: 'Interval', focusWork: 'Focus', focusBreak: 'Break',
        focusMinutes: 'Minutes (1–180)', focusStart: 'Start', focusPause: 'Pause', focusResume: 'Resume', focusReset: 'Stop / reset',
        focusNextBreak: 'Choose break', focusNextWork: 'Choose focus', focusRemaining: 'Remaining time', focusReady: 'Ready to start',
        focusRunning: 'Running', focusPaused: 'Paused', focusCompleted: 'Interval complete. Choose your next interval when ready.',
        focusUncertain: 'The clocks disagree. Exact remaining time is uncertain. Stop / reset, then start deliberately.',
        focusHelp: 'Each workspace shares one timer across its own new-tab pages. No sound or background alert. Closing or hiding the page keeps the saved deadline; reopening estimates elapsed time using your device clock. Clock changes while closed can affect that estimate. Each interval starts only when you press Start. Settings exports and cloud backups exclude this timer. Removing the extension or browser data can erase it.',
        focusBrief: 'One timer shared on this device. No sound or background alert.', focusDetails: 'How timing works',
        focusEnable: 'Show Focus timer on the new tab page', focusEnableHelp: 'Optional and device-local. Hiding it keeps the current session and deadline.',
        focusLoading: 'Loading local timer…', focusSaving: 'Saving timer…', focusError: 'Could not confirm the timer change. Read the latest state before trying again.',
        focusDraftRetained: 'Your unsaved minutes are kept on this page. Finish editing when that interval is ready.', focusSaveMinutes: 'Save minutes',
        focusConflict: 'Another page changed this timer. The latest saved state is shown; choose again.', focusRetry: 'Read latest state', focusInvalidMinutes: 'Enter whole minutes from 1 to 180.'
    };
    function t(key) { const translated = root.i18n?.t(key); return translated && translated !== key ? translated : fallback[key] || key; }
    function el(tag, cls, text) { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; }
    function button(key, action) { const node = el('button', 'focus-button', t(key)); node.type = 'button'; node.addEventListener('click', action); node.addEventListener('keydown', event => { if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault(); }); return node; }
    class View {
        constructor(host, { controller = new api.Controller(), onVisibility = () => {} } = {}) {
            this.host = host; this.controller = controller; this.onVisibility = onVisibility; this.timeout = null; this.closed = false; this.lastStatus = null; this.durationDrafts = new Map(); this.minutesPhase = null; this.durationInputPhase = null;
            host.classList.add('local-focus-card'); host.setAttribute('aria-label', t('focusTitle')); host.hidden = true;
            const header = el('header', 'focus-header'); header.append(el('h2', '', t('focusTitle')), el('span', 'focus-local', t('focusLocal')));
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
            this.feedback = el('p', 'focus-feedback'); this.feedback.setAttribute('role', 'status'); this.retry = button('focusRetry', () => controller.refresh().catch(() => {}));
            const details = el('details', 'focus-help');
            details.append(el('summary', '', t('focusDetails')), el('p', '', t('focusHelp')));
            host.replaceChildren(header, inputs, this.remaining, this.status, controls, el('p', 'focus-help', t('focusBrief')), details, this.feedback, this.retry);
            this.visibility = () => { this.cancelTick(); if (!document.hidden) { controller.tick(); controller.refresh().catch(() => {}); } this.render(); };
            document.addEventListener('visibilitychange', this.visibility);
            this.unsubscribe = controller.subscribe(() => this.render()); this.render(); controller.refresh().catch(() => {});
        }
        trackDurationDraft() {
            const state = this.controller.snapshot();
            // A refresh may disable or repurpose the input before its native
            // change event. Never apply that event to another phase or run.
            if (this.closed || this.minutes.disabled || this.controller.pending || !state ||
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
                if (ownsFocus && this.focusIntent === token && !this.closed && !document.hidden &&
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
            this.cancelTick(); const state = this.controller.snapshot(), pending = Boolean(this.controller.pending);
            if (!state) { this.saveMinutes.hidden = true; this.saveMinutes.disabled = true; this.start.disabled = true; this.reset.disabled = true; this.phase.disabled = true; this.minutes.disabled = true; if (this.controller.error) { this.host.hidden = false; if (this.visible !== true) { this.visible = true; this.onVisibility(true); } } this.feedback.textContent = t(this.controller.error ? 'focusError' : 'focusLoading'); this.retry.hidden = !this.controller.error; return; }
            const s = state.session; this.host.hidden = !state.enabled; if (this.host.hidden) this.focusIntent = null;
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
                const revision = state.revision; this.timeout = root.setTimeout(() => { this.timeout = null; this.controller.tick(revision); }, 250);
            }
        }
        hasUncommittedWork() { return this.durationDrafts.size > 0 || this.controller.hasUncommittedWork(); }
        destroy() { this.closed = true; this.durationDrafts.clear(); this.cancelTick(); this.unsubscribe(); document.removeEventListener('visibilitychange', this.visibility); this.controller.destroy(); }
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
