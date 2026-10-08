(function (root) {
    'use strict';
    const api = root.LocalItabTasks;
    const fallback = {
        tasksTitle: 'Tasks', tasksLocal: 'On this device', tasksNext: 'Next up', tasksNoPin: 'Pin one task as your next action.',
        tasksAddLabel: 'Add a task', tasksPlaceholder: 'What’s the next small thing?', tasksAdd: 'Add', tasksEmpty: 'A clear list. Add something when you need it.',
        tasksComplete: 'Complete', tasksReopen: 'Reopen', tasksPin: 'Pin next', tasksUnpin: 'Unpin', tasksEdit: 'Edit', tasksRemove: 'Remove', tasksRestore: 'Restore',
        tasksActions: 'Actions', tasksUp: 'Move up', tasksDown: 'Move down', tasksMore: 'Show all tasks', tasksLess: 'Show fewer', tasksCompleted: 'Completed', tasksRemoved: 'Removed',
        tasksData: 'Task data', tasksHelp: 'Tasks stay on this device. Settings exports, Chrome Sync and Drive backups do not include them. Export tasks separately. Removing the extension or browser data can delete local tasks.',
        tasksExport: 'Export tasks', tasksImport: 'Import tasks', tasksCopies: 'Previous local copies', tasksRecover: 'Review restore', tasksUndo: 'Undo removal',
        tasksLoading: 'Loading local tasks…', tasksDraftRemains: 'Last task saved. Your current draft is not saved yet.', tasksReady: 'Local tasks ready', tasksSaving: 'Saving on this device…', tasksSaved: 'Saved on this device', tasksRetry: 'Retry',
        tasksCancel: 'Cancel', tasksSave: 'Save task', tasksEditTitle: 'Edit task', tasksReviewTitle: 'Replace local tasks?', tasksReplace: 'Replace and keep previous copy',
        tasksReviewHelp: 'This replaces the current task list and pin on this device. A previous local copy is kept below Task data. Settings and cloud backups stay unchanged.',
        tasksCurrent: 'Current', tasksIncoming: 'Replacement', tasksActive: 'Active', tasksDone: 'Completed', tasksDeleted: 'Removed', tasksRecoveryCount: 'Previous copies',
        tasksConflict: 'This task list changed in another page. Your draft is still here. Review the latest version before retrying.', tasksLatest: 'Latest saved task', tasksOverwrite: 'Replace latest with my edit',
        tasksEnable: 'Show Tasks on the new tab page', tasksEnableHelp: 'Optional and device-local. Hiding the card keeps its tasks.',
        tasksErrorRead: 'Could not read local tasks. Nothing was replaced. Retry when storage is available.',
        tasksErrorWrite: 'Could not confirm the save. Your draft is still here. Retry safely.',
        tasksErrorText: 'Enter a nonempty plain-text task, up to 1,000 characters. Text is never silently shortened.',
        tasksErrorCapacity: 'This local list holds up to 500 tasks, including completed and removed items. No items were erased.',
        tasksErrorRecovery: 'All 8 previous local copies are retained. This replacement was not saved. You can still export tasks or restore a previous copy.',
        tasksErrorSize: 'This task file or local collection is too large (2 MB maximum). Nothing was replaced.',
        tasksErrorInvalid: 'This is not a supported, valid task backup. Nothing was replaced.', tasksErrorUnavailable: 'Safe local task storage is unavailable in this page.',
        tasksErrorFile: 'Could not read or download the task file. Please try again.', tasksTextLimit: 'Plain text · 1,000 characters maximum', tasksRestoreTitle: 'Restore this previous local copy?'
    };
    function t(key) { const message = root.i18n?.t(key); return message && message !== key ? message : fallback[key] || key; }
    function el(tag, className, text) {
        const node = document.createElement(tag); if (className) node.className = className;
        if (text !== undefined) node.textContent = text; return node;
    }
    function button(key, action, className = '') {
        const node = el('button', `tasks-button ${className}`.trim(), t(key)); node.type = 'button';
        node.addEventListener('click', action); return node;
    }
    function errorText(error) {
        const code = error?.code;
        if (code === 'CONFLICT') return t('tasksConflict');
        return t({ READ: 'tasksErrorRead', WRITE: 'tasksErrorWrite', VERIFY: 'tasksErrorWrite', TEXT: 'tasksErrorText', TEXT_LIMIT: 'tasksErrorText',
            CAPACITY: 'tasksErrorCapacity', RECOVERY_LIMIT: 'tasksErrorRecovery', SIZE_LIMIT: 'tasksErrorSize', UNAVAILABLE: 'tasksErrorUnavailable',
            INVALID: 'tasksErrorInvalid', VERSION: 'tasksErrorInvalid', FILE: 'tasksErrorFile' }[code] || 'tasksErrorWrite');
    }
    function summarize(counts) { return `${t('tasksActive')}: ${counts.active} · ${t('tasksDone')}: ${counts.done} · ${t('tasksDeleted')}: ${counts.removed} · ${t('tasksRecoveryCount')}: ${counts.recovery}`; }
    function dialog(title, onClose) {
        const overlay = el('div', 'tasks-overlay'); overlay.setAttribute('aria-hidden', 'true');
        const panel = el('section', 'tasks-dialog'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
        const heading = el('h2', '', title); heading.id = `tasks-dialog-${crypto.randomUUID()}`; panel.setAttribute('aria-labelledby', heading.id);
        panel.append(heading); overlay.append(panel); document.body.append(overlay);
        let cleanup = null, closed = false;
        const close = () => { if (closed) return; closed = true; cleanup?.(); overlay.remove(); onClose?.(); };
        return { panel, close, get isOpen() { return !closed; }, open: focus => { cleanup = root.LocalItabDialog.open(overlay, focus, close); } };
    }
    class View {
        constructor(host, { controller = new api.Controller(), onVisibility = () => {}, alwaysVisible = false } = {}) {
            this.host = host; this.controller = controller; this.onVisibility = onVisibility; this.alwaysVisible = alwaysVisible;
            this.dialogs = new Set(); this.reviewGeneration = 0; this.pendingReview = false; this.expanded = false; this.draftGeneration = 0; this.undo = null; this.destroyed = false; this.localError = null;
            host.classList.add('local-tasks-card'); host.setAttribute('aria-label', t('tasksTitle'));
            const header = el('header', 'tasks-header'); header.append(el('h2', '', t('tasksTitle')), el('span', 'tasks-local', t('tasksLocal')));
            this.next = el('p', 'tasks-next');
            this.form = el('form', 'tasks-add'); this.input = el('textarea'); this.input.rows = 1;
            this.input.setAttribute('aria-label', t('tasksAddLabel')); this.input.placeholder = t('tasksPlaceholder');
            this.input.addEventListener('input', () => { this.draftGeneration++; this.render(); });
            this.input.addEventListener('keydown', event => {
                if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
                    event.preventDefault(); if (!event.repeat) this.add();
                }
            });
            this.addButton = button('tasksAdd', () => this.add(), 'tasks-primary'); this.form.append(this.input, this.addButton);
            this.form.addEventListener('submit', event => { event.preventDefault(); this.add(); });
            this.list = el('ul', 'tasks-list'); this.more = button('tasksMore', () => { this.expanded = !this.expanded; this.renderedRevision = null; this.render(); });
            this.completed = this.section('tasksCompleted'); this.removed = this.section('tasksRemoved');
            this.data = el('details', 'tasks-data'); this.data.append(el('summary', '', t('tasksData')), el('p', 'tasks-help', t('tasksHelp')));
            const fileRow = el('div', 'tasks-data-actions');
            this.fileInput = el('input'); this.fileInput.type = 'file'; this.fileInput.accept = '.json,application/json'; this.fileInput.hidden = true;
            this.fileInput.addEventListener('change', () => this.importFile());
            fileRow.append(button('tasksExport', () => this.export()), button('tasksImport', () => this.fileInput.click()), this.fileInput);
            this.copies = el('div', 'tasks-copies'); this.data.append(fileRow, this.copies);
            this.feedback = el('div', 'tasks-feedback'); this.status = el('span'); this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
            this.retry = button('tasksRetry', () => this.retryLast()); this.undoButton = button('tasksUndo', () => this.undoRemove());
            this.feedback.append(this.status, this.retry, this.undoButton);
            host.replaceChildren(header, this.next, this.form, this.list, this.more, this.completed.box, this.removed.box, this.data, this.feedback);
            this.unsubscribe = controller.subscribe(() => this.render()); this.render(); controller.refresh().catch(() => {});
        }
        hasUncommittedWork() { return this.input.value.length > 0 || this.dialogs.size > 0 || this.pendingReview || !!this.controller.pending; }
        createDialog(title, onClose) {
            if (this.destroyed || this.dialogs.size) return null;
            this.reviewGeneration++; this.pendingReview = false;
            const modal = dialog(title, () => {
                this.dialogs.delete(modal); onClose?.();
                if (!this.destroyed && document.activeElement === document.body && !this.host.hidden) this.input.focus();
            });
            this.dialogs.add(modal); return modal;
        }
        section(key) {
            const box = el('details', 'tasks-section'), summary = el('summary', '', t(key)), list = el('ul', 'tasks-list');
            box.append(summary, list); return { box, summary, list, key };
        }
        async perform(command, success) {
            if (this.controller.pending) return;
            this.localError = null;
            this.retryEffect = success; this.retryEffectOperationId = command.operationId;
            try { const state = await this.controller.run(command); if (!this.destroyed) { success?.(state); this.retryEffect = null; this.render(); } }
            catch (_) { /* Controller owns safe, content-free feedback. */ }
        }
        async retryLast() {
            if (this.controller.pending) return;
            this.localError = null;
            const effect = this.controller.retryCommand?.operationId === this.retryEffectOperationId ? this.retryEffect : null;
            try { const state = await this.controller.retry(); effect?.(state); this.retryEffect = null; this.render(); } catch (_) {}
        }
        add() {
            const text = this.input.value, generation = this.draftGeneration;
            const command = this.controller.store.request('add', { text });
            this.perform(command, () => {
                // A late success must not clear newer text or focus another element.
                if (this.draftGeneration === generation && this.input.value === text) this.input.value = '';
            });
        }
        row(task, index, active) {
            const item = el('li', 'tasks-row'); item.dataset.taskId = task.id;
            const top = el('div', 'tasks-row-main');
            const title = el('span', 'tasks-text', task.text); if (task.state === 'done') title.classList.add('is-done');
            const run = (kind, values = {}, success) => this.perform(this.controller.store.request(kind, { id: task.id, version: task.version, ...values }), success);
            if (task.state !== 'removed') {
                const complete = button(task.state === 'active' ? 'tasksComplete' : 'tasksReopen', () => run(task.state === 'active' ? 'complete' : 'reopen'), 'tasks-check');
                complete.textContent = task.state === 'active' ? '○' : '↶';
                complete.title = t(task.state === 'active' ? 'tasksComplete' : 'tasksReopen');
                complete.setAttribute('aria-label', `${t(task.state === 'active' ? 'tasksComplete' : 'tasksReopen')}: ${task.text}`);
                top.append(complete);
            }
            top.append(title); item.append(top);
            const actions = el('div', 'tasks-row-actions');
            if (task.state === 'removed') actions.append(button('tasksRestore', () => run('restore')));
            else {
                if (task.state === 'active') {
                    const expectedPin = this.controller.state.pinnedId; const pinned = expectedPin === task.id; item.classList.toggle('is-pinned', pinned);
                    const pin = button(pinned ? 'tasksUnpin' : 'tasksPin', () => run('pin', { expectedPin }));
                    pin.setAttribute('aria-pressed', String(pinned)); actions.append(pin);
                    const up = button('tasksUp', () => run('move', { order: active, direction: -1 }));
                    const down = button('tasksDown', () => run('move', { order: active, direction: 1 }));
                    up.disabled = index === 0; down.disabled = index === active.length - 1; actions.append(up, down);
                }
                actions.append(button('tasksEdit', () => this.edit(task)), button('tasksRemove', () => {
                    const hadFocus = item.contains(document.activeElement);
                    run('remove', {}, state => {
                        this.undo = state.records.find(t => t.id === task.id); this.render();
                        if (hadFocus && document.activeElement === document.body) this.undoButton.focus();
                    });
                }));
            }
            actions.querySelectorAll('button').forEach(node => { node.dataset.taskAction = node.textContent; node.setAttribute('aria-disabled', String(!!this.controller.pending)); });
            if (task.state === 'removed') item.append(actions);
            else {
                const menu = el('details', 'tasks-row-menu'), summary = el('summary', '', t('tasksActions'));
                summary.dataset.taskAction = 'menu';
                menu.append(summary, actions); item.append(menu);
            }
            top.querySelectorAll('button').forEach(node => { node.setAttribute('aria-disabled', String(!!this.controller.pending)); node.dataset.taskAction = node.textContent; });
            return item;
        }
        render() {
            if (this.destroyed) return;
            const state = this.controller.state, busy = !!this.controller.pending;
            // An unreadable initial store must expose its safe retry without changing visibility preferences.
            const showReadError = !state && !!this.controller.error;
            this.host.hidden = !this.alwaysVisible && state?.enabled !== true && !showReadError;
            this.onVisibility(state?.enabled === true || showReadError);
            this.addButton.disabled = busy || !state;
            const focused = this.host.contains(document.activeElement) ? document.activeElement : null;
            const taskId = focused?.closest('[data-task-id]')?.dataset.taskId, action = focused?.dataset.taskAction;
            if (state && this.renderedRevision !== state.revision) {
                this.renderedRevision = state.revision;
                const openRows = Array.from(this.host.querySelectorAll('[data-task-id] .tasks-row-menu[open]')).map(node => node.closest('[data-task-id]').dataset.taskId);
                const active = state.records.filter(task => task.state === 'active'), ids = active.map(t => t.id);
                const pinned = active.find(task => task.id === state.pinnedId);
                this.next.textContent = pinned ? `${t('tasksNext')}: ${pinned.text}` : t('tasksNoPin');
                this.next.classList.toggle('has-pin', !!pinned);
                const visible = this.expanded ? active : active.slice(0, 4);
                this.list.replaceChildren(...visible.map(task => this.row(task, ids.indexOf(task.id), ids)));
                if (!active.length) this.list.append(el('li', 'tasks-empty', t('tasksEmpty')));
                this.more.hidden = active.length <= 4; this.more.textContent = t(this.expanded ? 'tasksLess' : 'tasksMore'); this.more.setAttribute('aria-expanded', String(this.expanded));
                for (const section of [this.completed, this.removed]) {
                    const records = state.records.filter(task => task.state === (section === this.completed ? 'done' : 'removed'));
                    section.summary.textContent = `${t(section.key)} (${records.length})`; section.box.hidden = !records.length;
                    section.list.replaceChildren(...records.map(task => this.row(task, -1, ids)));
                }
                this.copies.replaceChildren();
                if (state.recovery.length) {
                    this.copies.append(el('h3', '', t('tasksCopies')));
                    for (const copy of state.recovery.slice().reverse()) {
                        const row = el('div', 'tasks-copy'); row.append(el('span', '', `${new Date(copy.createdAt).toLocaleString()} · ${summarize(api.counts(copy.content))}`),
                            button('tasksRecover', () => this.reviewRecovery(copy.id))); this.copies.append(row);
                    }
                }
                this.host.querySelectorAll('[data-task-id] .tasks-row-menu').forEach(node => { node.open = openRows.includes(node.closest('[data-task-id]').dataset.taskId); });
                // Preserve a keyboard user's row action if it survived the update; never grab focus from an editor/input.
                if (taskId && action && document.activeElement === document.body) {
                    const item = Array.from(this.host.querySelectorAll('[data-task-id]')).find(node => node.dataset.taskId === taskId);
                    const target = item && Array.from(item.querySelectorAll('[data-task-action]')).find(node => node.dataset.taskAction === action && !node.disabled);
                    const visible = node => node && !node.closest('[hidden], [inert]') && node.getClientRects().length;
                    const summary = item?.querySelector('summary');
                    if (visible(target)) target.focus();
                    else if (visible(summary)) summary.focus();
                    else if (focused && !focused.isConnected) this.input.focus();
                }
            }
            this.host.querySelectorAll('button[data-task-action]').forEach(node => node.setAttribute('aria-disabled', String(busy)));
            this.undoButton.hidden = !this.undo || !state?.records.some(t => t.id === this.undo.id && t.version === this.undo.version && t.state === 'removed');
            this.undoButton.disabled = busy;
            const error = this.localError || this.controller.error;
            this.status.textContent = error ? errorText(error) : this.controller.status === 'saved' && this.input.value ? t('tasksDraftRemains') : t({ loading: 'tasksLoading', saving: 'tasksSaving', saved: 'tasksSaved', ready: 'tasksReady' }[this.controller.status] || 'tasksReady');
            this.feedback.classList.toggle('is-error', !!error); this.retry.hidden = !error || !['READ', 'WRITE', 'VERIFY'].includes(error.code) || !!this.localError || (!!this.controller.retryCommand && this.controller.retryCommand.operationId !== this.retryEffectOperationId);
            this.retry.disabled = busy;
        }
        undoRemove() {
            if (!this.undo) return;
            this.perform(this.controller.store.request('restore', { id: this.undo.id, version: this.undo.version }), () => { this.undo = null; });
        }
        edit(task) {
            let ownedOperationId = null;
            const modal = this.createDialog(t('tasksEditTitle'), () => this.controller.dismissRetry(ownedOperationId)); if (!modal) return;
            const input = el('textarea', 'tasks-editor', task.text), hint = el('p', 'tasks-help', t('tasksTextLimit'));
            input.value = task.text; input.setAttribute('aria-label', t('tasksEditTitle')); input.rows = 4;
            const feedback = el('p', 'tasks-dialog-feedback'); feedback.setAttribute('role', 'status');
            const latest = el('p', 'tasks-latest'); latest.hidden = true;
            let baseline = task, generation = 0, open = true, failedCommand = null, pending = false, reviewedLatest = null;
            input.addEventListener('input', () => { generation++; failedCommand = null; });
            const originalClose = modal.close; const close = () => { open = false; originalClose(); };
            // Escape is routed through the shared focus helper; detached input prevents late DOM/focus writes too.
            const save = async (replaceLatest = false) => {
                if (pending || this.controller.pending) return;
                if (replaceLatest) {
                    if (!reviewedLatest) { feedback.textContent = t('tasksConflict'); return; }
                    baseline = reviewedLatest; failedCommand = null;
                }
                const text = input.value, submittedGeneration = generation;
                const command = failedCommand || this.controller.store.request('edit', { id: baseline.id, version: baseline.version, text });
                ownedOperationId = command.operationId; pending = true; saveButton.disabled = true; overwrite.disabled = true; feedback.textContent = t('tasksSaving');
                try {
                    const state = await this.controller.run(command);
                    if (!open || !input.isConnected) return;
                    baseline = state.records.find(t => t.id === task.id); failedCommand = null;
                    if (generation === submittedGeneration && input.value === text) close(); else feedback.textContent = t('tasksDraftRemains');
                } catch (error) {
                    if (!open || !input.isConnected) { this.controller.dismissRetry(command.operationId); return; }
                    failedCommand = generation === submittedGeneration && input.value === text ? command : null; feedback.textContent = errorText(error);
                    if (error.code === 'CONFLICT') {
                        failedCommand = null;
                        const fresh = this.controller.state?.records.find(t => t.id === task.id && t.state !== 'removed');
                        reviewedLatest = fresh || null; latest.hidden = !fresh; latest.textContent = fresh ? `${t('tasksLatest')}: ${fresh.text}` : '';
                        overwrite.hidden = !fresh;
                    }
                } finally { pending = false; saveButton.disabled = false; overwrite.disabled = false; }
            };
            const buttons = el('div', 'tasks-dialog-actions');
            const saveButton = button('tasksSave', () => save(), 'tasks-primary'), overwrite = button('tasksOverwrite', () => save(true)); overwrite.hidden = true;
            buttons.append(button('tasksCancel', close), overwrite, saveButton); modal.panel.append(input, hint, latest, feedback, buttons); modal.open(input);
        }
        async export() {
            try {
                const source = await this.controller.store.export();
                const url = URL.createObjectURL(new Blob([source], { type: 'application/json' }));
                const link = el('a'); link.href = url; link.download = `local-itab-tasks-${new Date().toISOString().slice(0, 10)}.json`;
                document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
                this.localError = null;
            } catch (error) { this.localError = error.code ? error : api.fault('FILE'); }
            this.render();
        }
        async importFile() {
            const generation = ++this.reviewGeneration;
            const file = this.fileInput.files?.[0]; this.fileInput.value = ''; if (!file) return;
            this.pendingReview = true;
            try {
                if (file.size > api.LIMITS.bytes) throw api.fault('SIZE_LIMIT');
                const source = await file.text();
                if (this.destroyed || generation !== this.reviewGeneration) return;
                const review = await this.controller.store.review(source);
                if (this.destroyed || generation !== this.reviewGeneration || this.dialogs.size) return;
                this.localError = null; this.render();
                this.reviewReplacement(review, () => this.controller.store.request('replace', { source: review.source, revision: review.revision }));
            } catch (error) {
                if (!this.destroyed && generation === this.reviewGeneration) { this.localError = error.code ? error : api.fault('FILE'); this.render(); }
            } finally { if (generation === this.reviewGeneration) this.pendingReview = false; }
        }
        async reviewRecovery(id) {
            const generation = ++this.reviewGeneration; this.pendingReview = true;
            try {
                const state = await this.controller.store.read(), copy = state.recovery.find(item => item.id === id);
                if (this.destroyed || generation !== this.reviewGeneration || this.dialogs.size) return;
                if (!copy) throw api.fault('CONFLICT');
                this.reviewReplacement({ current: api.counts(state), incoming: api.counts(copy.content) },
                    () => this.controller.store.request('recover', { id, revision: state.revision }), 'tasksRestoreTitle');
            } catch (error) {
                if (!this.destroyed && generation === this.reviewGeneration) { this.localError = error; this.render(); }
            } finally { if (generation === this.reviewGeneration) this.pendingReview = false; }
        }
        reviewReplacement(review, makeCommand, title = 'tasksReviewTitle') {
            let command = null;
            const modal = this.createDialog(t(title), () => this.controller.dismissRetry(command?.operationId)); if (!modal) return;
            const feedback = el('p', 'tasks-dialog-feedback'); feedback.setAttribute('role', 'status');
            const cancel = button('tasksCancel', () => modal.close());
            const confirm = button('tasksReplace', async () => {
                if (this.controller.pending) return;
                command ||= makeCommand(); confirm.disabled = true; feedback.textContent = t('tasksSaving');
                try { await this.controller.run(command); modal.close(); }
                catch (error) { if (!modal.isOpen) { this.controller.dismissRetry(command.operationId); return; } feedback.textContent = errorText(error); if (error.code === 'CONFLICT') confirm.hidden = true; }
                finally { confirm.disabled = false; }
            }, 'tasks-primary');
            const actions = el('div', 'tasks-dialog-actions'); actions.append(cancel, confirm);
            modal.panel.append(el('p', 'tasks-help', t('tasksReviewHelp')), el('p', '', `${t('tasksCurrent')}: ${summarize(review.current)}`),
                el('p', '', `${t('tasksIncoming')}: ${summarize(review.incoming)}`), feedback, actions); modal.open(cancel);
        }
        destroy() { this.destroyed = true; this.reviewGeneration++; this.pendingReview = false; this.dialogs.forEach(modal => modal.close()); this.unsubscribe(); this.controller.destroy(); }
    }
    function mount(host, options) {
        if (host.localTasksView) return host.localTasksView;
        host.localTasksView = new View(host, options); return host.localTasksView;
    }
    function mountSettings(host, { controller = new api.Controller() } = {}) {
        const label = el('label', 'tasks-enable-label'), checkbox = el('input'); checkbox.type = 'checkbox';
        label.append(checkbox, el('span', '', t('tasksEnable')));
        const feedback = el('span'); feedback.setAttribute('role', 'status');
        const retry = button('tasksRetry', () => controller.retry().catch(() => {}));
        host.classList.add('local-tasks-settings'); host.replaceChildren(label, el('p', 'tasks-help', t('tasksEnableHelp')), el('p', 'tasks-help', t('tasksHelp')), feedback, retry);
        controller.subscribe(() => {
            checkbox.checked = controller.state?.enabled === true; checkbox.disabled = !controller.state || !!controller.pending;
            feedback.textContent = controller.error ? errorText(controller.error) : controller.status === 'saved' ? t('tasksSaved') : '';
            retry.hidden = !controller.error;
        });
        checkbox.disabled = true; retry.hidden = true;
        checkbox.addEventListener('change', () => controller.action('enable', { enabled: checkbox.checked }).catch(() => {}));
        controller.refresh().catch(() => {}); return controller;
    }
    Object.assign(api, { View, mount, mountSettings });
})(window);
