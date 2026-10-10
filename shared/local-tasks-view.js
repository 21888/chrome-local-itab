(function (root) {
    'use strict';
    const api = root.LocalItabTasks;
    const fallback = {
        tasksTitle: 'Tasks', tasksLocal: 'On this device', tasksNext: 'Next up', tasksNoPin: 'Pin one task as your next action.',
        tasksAddLabel: 'Add a task', tasksPlaceholder: 'What’s the next small thing?', tasksAdd: 'Add', tasksEmpty: 'A clear list. Add something when you need it.',
        tasksFilterReorder: 'Clear the filter to reorder tasks.', tasksFilter: 'Filter tasks', tasksFilterPlaceholder: 'Find active, completed or removed tasks', tasksFilterClear: 'Clear filter', tasksFilterMatches: 'Matching tasks', tasksFilterEmpty: 'No matching tasks. Clear the filter to see your list.',
        tasksBatch: 'Add multiple tasks', tasksBatchLabel: 'One task per line', tasksBatchHelp: 'Each nonblank line becomes one task, in order. Spaces, bullet prefixes and duplicate lines are kept. Nothing is added until you review and confirm.',
        tasksBatchTextLimit: 'Plain text · 1,000 characters per task', tasksBatchReview: 'Review tasks', tasksBatchConfirm: 'Add reviewed tasks', tasksBatchCount: 'Tasks to add', tasksBatchCapacity: 'Stored tasks (including completed and removed)', tasksBatchRemaining: 'Available spaces',
        tasksBatchPreview: 'Numbered preview', tasksBatchChanged: 'The list changed. Review again to check the latest capacity.', tasksBatchReady: 'Review the numbered list, then confirm to add every task together.',
        tasksBatchRetry: 'Retry previous add', tasksBatchUncertain: 'The previous batch could not be confirmed. Retry that same batch safely before reviewing this draft.', tasksBatchDraftRemains: 'The previous batch was saved. Your current draft is still here; review it before adding anything else.',
        tasksComplete: 'Complete', tasksReopen: 'Reopen', tasksPin: 'Pin next', tasksUnpin: 'Unpin', tasksEdit: 'Edit', tasksRemove: 'Remove', tasksRestore: 'Restore',
        tasksActions: 'Actions', tasksUp: 'Move up', tasksDown: 'Move down', tasksMore: 'Show all tasks', tasksLess: 'Show fewer', tasksCompleted: 'Completed', tasksRemoved: 'Removed',
        tasksData: 'Task data', tasksHelp: 'Tasks stay on this device. Settings exports, Chrome Sync and Drive backups do not include them. Export tasks separately. Removing the extension or browser data can delete local tasks.',
        tasksExport: 'Export tasks', tasksImport: 'Import tasks', tasksCopies: 'Previous local copies', tasksRecover: 'Review restore', tasksUndo: 'Undo removal', tasksUndoComplete: 'Undo completion',
        tasksLoading: 'Loading local tasks…', tasksDraftRemains: 'Last task saved. Your current draft is not saved yet.', tasksReady: 'Local tasks ready', tasksSaving: 'Saving on this device…', tasksSaved: 'Saved on this device', tasksRetry: 'Retry',
        tasksCancel: 'Cancel', tasksSave: 'Save task', tasksEditTitle: 'Edit task', tasksReviewTitle: 'Replace local tasks?', tasksReplace: 'Replace tasks',
        tasksReviewHelp: 'This replaces the current task list and pin on this device. A previous local copy is kept below Task data, except when a full archive is imported into an empty list with no previous copies. All imported copies are kept. Settings and cloud backups stay unchanged.',
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
            this.dialogs = new Set(); this.reviewGeneration = 0; this.pendingReview = false; this.expanded = false; this.draftGeneration = 0; this.undo = null; this.actionGeneration = 0; this.destroyed = false; this.localError = null;
            host.classList.add('local-tasks-card'); host.setAttribute('aria-label', t('tasksTitle'));
            const header = el('header', 'tasks-header'); header.append(el('h2', '', t('tasksTitle')), el('span', 'tasks-local', t('tasksLocal')));
            this.next = el('div', 'tasks-next');
            // Filtering is disposable view state; it never enters a storage command or reload guard.
            this.filterQuery = ''; this.filterComposing = false;
            this.filter = el('div', 'tasks-filter'); this.filterInput = el('input'); this.filterInput.type = 'text';
            this.filterInput.setAttribute('aria-label', t('tasksFilter')); this.filterInput.placeholder = t('tasksFilterPlaceholder');
            this.filterInput.addEventListener('compositionstart', () => { this.filterComposing = true; });
            this.filterInput.addEventListener('compositionend', () => { this.filterComposing = false; this.applyFilter(); });
            this.filterInput.addEventListener('input', event => { if (!this.filterComposing && !event.isComposing) this.applyFilter(); });
            this.filterClear = button('tasksFilterClear', () => {
                const ownsFocus = document.activeElement === this.filterClear || document.activeElement === this.filterInput;
                this.filterInput.value = ''; this.filterComposing = false; this.applyFilter();
                if (ownsFocus) this.filterInput.focus();
            });
            this.filter.append(this.filterInput, this.filterClear);
            this.filterStatus = el('p', 'tasks-help'); this.filterStatus.hidden = true; this.filterStatus.setAttribute('role', 'status');
            this.filterStatus.setAttribute('aria-live', 'polite');
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
            this.batchButton = button('tasksBatch', () => this.addBatch(), 'tasks-batch-entry');
            const batchRow = el('div', 'tasks-batch-row'); batchRow.append(this.batchButton);
            this.list = el('ul', 'tasks-list'); this.more = button('tasksMore', () => { this.expanded = !this.expanded; this.renderedRevision = null; this.render(); });
            this.completed = this.section('tasksCompleted'); this.removed = this.section('tasksRemoved');
            this.data = el('details', 'tasks-data'); this.data.append(el('summary', '', t('tasksData')), el('p', 'tasks-help', t('tasksHelp')));
            const fileRow = el('div', 'tasks-data-actions');
            this.fileInput = el('input'); this.fileInput.type = 'file'; this.fileInput.accept = '.json,application/json'; this.fileInput.hidden = true;
            this.fileInput.addEventListener('change', () => this.importFile());
            fileRow.append(button('tasksExport', () => this.export()), button('tasksImport', () => this.fileInput.click()), this.fileInput);
            this.copies = el('div', 'tasks-copies'); this.data.append(fileRow, this.copies);
            this.feedback = el('div', 'tasks-feedback'); this.status = el('span'); this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
            this.retry = button('tasksRetry', event => {
                if (!(event.detail > 1 && this.controller.retryCommand?.kind === 'completePinned')) this.retryLast();
            });
            this.retry.addEventListener('keydown', event => {
                if (this.controller.retryCommand?.kind === 'completePinned' && event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault();
            });
            this.undoButton = button('tasksUndo', () => this.undoLast());
            this.feedback.append(this.status, this.retry, this.undoButton);
            host.replaceChildren(header, this.next, this.form, batchRow, this.filter, this.filterStatus, this.list, this.more, this.completed.box, this.removed.box, this.data, this.feedback);
            this.unsubscribe = controller.subscribe(() => this.render()); this.render(); controller.refresh().catch(() => {});
        }
        applyFilter() {
            this.filterQuery = this.filterInput.value.trim().toLowerCase();
            this.render();
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
            if (this.destroyed || this.controller.pending) return;
            const generation = ++this.actionGeneration;
            this.localError = null;
            this.retryEffect = success; this.retryEffectOperationId = command.operationId;
            try {
                const state = await this.controller.run(command);
                // Final controller notifications can start another action before this
                // continuation runs. An older result must not replace its Undo/retry.
                if (this.destroyed || generation !== this.actionGeneration || this.controller.pending ||
                    (this.controller.retryCommand && this.controller.retryCommand.operationId !== command.operationId)) return;
                this.rememberUndo(command, state); this.retryEffect = null; success?.(state); this.render();
            }
            catch (_) { /* Controller owns safe, content-free feedback. */ }
        }
        async retryLast() {
            if (this.controller.pending || this.destroyed) return;
            const command = this.controller.retryCommand;
            if (command?.kind === 'completePinned' && command.operationId === this.retryEffectOperationId) {
                return this.performPinned(command, this.retry);
            }
            if (command) {
                if (command.operationId !== this.retryEffectOperationId) return;
                return this.perform(command, this.retryEffect);
            }
            this.localError = null;
            try { await this.controller.retry(); if (!this.destroyed) this.render(); } catch (_) {}
        }
        add() {
            const text = this.input.value, generation = this.draftGeneration;
            const command = this.controller.store.request('add', { text });
            this.perform(command, () => {
                // A late success must not clear newer text or focus another element.
                if (this.draftGeneration === generation && this.input.value === text) this.input.value = '';
            });
        }
        addBatch() {
            if (this.destroyed || this.dialogs.size) return;
            let unsubscribe = () => {}, epoch = 0, generation = 0, reviewing = false, saving = false;
            let review = null, attempt = null, retryCommand = null, composing = false;
            const modal = this.createDialog(t('tasksBatch'), () => {
                epoch++; unsubscribe();
                if (this.batchSession === modal) this.batchSession = null;
                this.controller.dismissRetry(attempt?.command.operationId); this.render();
            });
            if (!modal) return;
            this.batchSession = modal;
            const input = el('textarea', 'tasks-editor tasks-batch-editor'); input.rows = 7;
            input.setAttribute('aria-label', t('tasksBatchLabel'));
            const hint = el('p', 'tasks-help', `${t('tasksBatchHelp')} ${t('tasksBatchTextLimit')}`);
            hint.id = `tasks-batch-help-${crypto.randomUUID()}`; input.setAttribute('aria-describedby', hint.id);
            const count = el('p', 'tasks-help'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
            const preview = el('section', 'tasks-batch-preview'); preview.hidden = true;
            const title = el('h3', '', t('tasksBatchPreview')), list = el('ol', 'tasks-batch-list'); preview.append(title, list);
            const feedback = el('p', 'tasks-dialog-feedback tasks-batch-feedback'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
            const setFeedback = (text, isError = false) => { feedback.textContent = text; feedback.classList.toggle('is-error', isError); };
            const owns = () => !this.destroyed && modal.isOpen && this.batchSession === modal && input.isConnected;
            const setControl = (node, disabled, hidden = false) => {
                // Chrome drops focus when its active control becomes disabled/hidden.
                // Transfer only that control's focus before the transition, keeping
                // Escape/Tab inside this opening without reclaiming newer focus.
                if (owns() && document.activeElement === node && (disabled || hidden)) input.focus();
                node.disabled = disabled; node.hidden = hidden;
            };
            const showReview = value => {
                preview.hidden = !value; title.textContent = `${t('tasksBatchPreview')}${value ? ` (${value.count})` : ''}`;
                list.replaceChildren(...(value ? value.texts.map(text => el('li', '', text)) : []));
            };
            const update = () => {
                if (!owns()) return;
                const state = this.controller.state;
                const total = review && (!state || review.revision >= state.revision) ? review.currentTotal : state?.records.length;
                const lines = input.value.split(/\r\n|\r|\n/).filter(line => line.trim().length > 0).length;
                count.textContent = `${t('tasksBatchCount')}: ${lines} · ${t('tasksBatchCapacity')}: ${total ?? '—'}/${api.LIMITS.records} · ${t('tasksBatchRemaining')}: ${total === undefined ? '—' : api.LIMITS.records - total}`;
                if (review && !saving && !retryCommand && this.controller.state?.revision > review.revision) {
                    epoch++; review = null; showReview(null); setFeedback(t('tasksBatchChanged'));
                }
                const busy = saving || !!this.controller.pending;
                setControl(reviewButton, busy || reviewing || !!retryCommand || composing);
                setControl(confirm, busy || !review || composing, !review || !!retryCommand);
                confirm.textContent = `${t('tasksBatchConfirm')}${review ? ` (${review.count})` : ''}`;
                setControl(retry, busy || composing, !retryCommand);
                retry.textContent = `${t('tasksBatchRetry')}${attempt && retryCommand ? ` (${attempt.review.count})` : ''}`;
            };
            const prepare = async () => {
                if (!owns() || saving || this.controller.pending || retryCommand || composing) return;
                const source = input.value, submittedGeneration = generation, ticket = ++epoch;
                reviewing = true; review = null; showReview(null); setFeedback(t('tasksLoading')); update();
                try {
                    const value = await this.controller.store.reviewBatch(source);
                    if (!owns() || ticket !== epoch || generation !== submittedGeneration || input.value !== source) return;
                    if (this.controller.state?.revision > value.revision) { setFeedback(t('tasksBatchChanged')); return; }
                    review = { ...value, source, generation: submittedGeneration };
                    showReview(review); setFeedback(t('tasksBatchReady'));
                } catch (error) {
                    if (owns() && ticket === epoch) setFeedback(errorText(error), true);
                } finally {
                    if (owns() && ticket === epoch) { reviewing = false; update(); }
                }
            };
            const submit = async (retryPrevious = false) => {
                if (!owns() || saving || this.controller.pending || composing) return;
                if (retryPrevious) { if (!retryCommand) return; }
                else {
                    if (!review || retryCommand || review.generation !== generation || review.source !== input.value) return;
                    // An observed remote update always gets another numbered review.
                    if (this.controller.state?.revision > review.revision) { update(); return; }
                    attempt = { command: review.command, review };
                }
                const submitted = attempt, command = submitted.command;
                saving = true; this.batchOperationId = command.operationId;
                setFeedback(t('tasksSaving')); update();
                try {
                    const state = await this.controller.run(command);
                    if (!owns()) return;
                    retryCommand = null; review = null; attempt = null;
                    // A confirmed old batch must not dismiss a newer draft or another dialog.
                    // If a later state was already observed, leave the draft for review too.
                    if (generation === submitted.review.generation && input.value === submitted.review.source &&
                        this.controller.state?.revision === state.revision && !this.controller.pending &&
                        (!this.controller.retryCommand || this.controller.retryCommand.operationId === command.operationId) &&
                        state.receipts.at(-1) === command.operationId) modal.close();
                    else { showReview(null); setFeedback(t('tasksBatchDraftRemains')); }
                } catch (error) {
                    if (!owns()) { this.controller.dismissRetry(command.operationId); return; }
                    review = null;
                    if (['READ', 'WRITE', 'VERIFY'].includes(error.code)) {
                        retryCommand = command; showReview(submitted.review);
                        setFeedback(`${errorText(error)} ${t('tasksBatchUncertain')}`, true);
                    } else {
                        retryCommand = null; attempt = null; showReview(null);
                        this.controller.dismissRetry(command.operationId); setFeedback(errorText(error), true);
                    }
                } finally {
                    saving = false;
                    if (!owns()) this.controller.dismissRetry(command.operationId);
                    else update();
                }
            };
            const reviewButton = button('tasksBatchReview', prepare);
            const confirm = button('tasksBatchConfirm', event => { if (!(event.detail > 1)) submit(); }, 'tasks-primary');
            const retry = button('tasksBatchRetry', event => { if (!(event.detail > 1)) submit(true); }, 'tasks-primary');
            for (const node of [reviewButton, confirm, retry]) node.addEventListener('keydown', event => {
                if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault();
            });
            input.addEventListener('input', () => {
                generation++; epoch++; reviewing = false; review = null;
                if (!retryCommand) { showReview(null); if (!saving) setFeedback(''); }
                update();
            });
            input.addEventListener('compositionstart', () => { composing = true; update(); });
            input.addEventListener('compositionend', () => { composing = false; update(); });
            input.addEventListener('focusout', () => { composing = false; update(); });
            const actions = el('div', 'tasks-dialog-actions'); actions.append(button('tasksCancel', () => modal.close()), reviewButton, retry, confirm);
            modal.panel.append(input, hint, count, preview, feedback, actions);
            unsubscribe = this.controller.subscribe(update); modal.open(input); update(); this.render();
        }
        renderNext(task) {
            // Keep an unchanged action mounted through filtering and unrelated row updates.
            if (this.nextTask?.id === task?.id && this.nextTask?.version === task?.version && this.next.children.length) return;
            this.nextTask = task; this.nextComplete = null;
            const text = el('span', 'tasks-next-text', task ? `${t('tasksNext')}: ${task.text}` : t('tasksNoPin'));
            this.next.replaceChildren(text); this.next.classList.toggle('has-pin', !!task);
            if (!task) return;
            const complete = button('tasksComplete', event => {
                if (event.detail > 1 || this.destroyed || this.controller.pending || this.nextComplete !== complete ||
                    !complete.isConnected || this.host.hidden) return;
                const command = this.controller.store.request('completePinned', { id: task.id, version: task.version, expectedPin: task.id });
                this.performPinned(command, complete);
            }, 'tasks-next-complete');
            complete.setAttribute('aria-label', `${t('tasksComplete')}: ${task.text}`);
            // Leave ordinary Enter/Space activation to the native button.
            complete.addEventListener('keydown', event => {
                if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault();
            });
            this.nextComplete = complete; this.next.append(complete);
        }
        performPinned(command, origin) {
            if (this.destroyed || this.controller.pending) return;
            this.pinnedFocus?.cancel();
            const intent = { command, revision: this.controller.state?.revision, valid: document.activeElement === origin };
            const cancel = () => { intent.valid = false; }; intent.cancel = cancel;
            const moved = event => { if (event.target !== origin) cancel(); };
            const keyed = event => { if (!(event.repeat && ['Enter', ' '].includes(event.key))) cancel(); };
            document.addEventListener('focusin', moved, true); document.addEventListener('pointerdown', cancel, true);
            document.addEventListener('keydown', keyed, true); document.addEventListener('visibilitychange', cancel, true);
            root.addEventListener?.('blur', cancel);
            this.pinnedFocus = intent;
            return this.perform(command, saved => {
                // A storage notification can remove the button before the write is
                // verified. Only this confirmed result may return its owner's focus.
                // A retry may confirm the same revision; a new write adds exactly one.
                // Larger jumps include an unseen remote change and relinquish focus.
                if (intent.valid && this.pinnedFocus === intent && !document.hidden && !this.host.hidden &&
                    this.host.isConnected && !this.host.closest('[inert]') && this.input.getClientRects().length &&
                    this.controller.state?.revision === saved.revision && saved.receipts.at(-1) === command.operationId &&
                    (saved.revision === intent.revision + 1 || saved.revision === intent.revision) &&
                    (document.activeElement === origin || document.activeElement === document.body)) this.input.focus();
            }).finally(() => {
                cancel(); if (this.pinnedFocus === intent) this.pinnedFocus = null;
                document.removeEventListener('focusin', moved, true); document.removeEventListener('pointerdown', cancel, true);
                document.removeEventListener('keydown', keyed, true); document.removeEventListener('visibilitychange', cancel, true);
                root.removeEventListener?.('blur', cancel);
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
                    up.disabled = !!this.filterQuery || index === 0; down.disabled = !!this.filterQuery || index === active.length - 1;
                    if (this.filterQuery) { up.title = t('tasksFilterReorder'); down.title = t('tasksFilterReorder'); }
                    actions.append(up, down);
                }
                actions.append(button('tasksEdit', () => this.edit(task)), button('tasksRemove', () => {
                    const hadFocus = item.contains(document.activeElement);
                    run('remove', {}, () => {
                        this.render();
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
            if (this.pinnedFocus && state?.revision !== this.pinnedFocus.revision &&
                state?.receipts.at(-1) !== this.pinnedFocus.command.operationId) this.pinnedFocus.cancel();
            // An unreadable initial store must expose its safe retry without changing visibility preferences.
            const showReadError = !state && !!this.controller.error;
            // A remote hide preference must not strand this page's quick-entry draft or save.
            // Keep the preference unchanged, then honor it when the owner finishes or clears the draft.
            const ownsPendingAdd = busy && this.controller.retryCommand?.kind === 'add' &&
                this.controller.retryCommand.operationId === this.retryEffectOperationId;
            const ownsPendingBatch = busy && this.controller.retryCommand?.kind === 'addBatch' &&
                this.controller.retryCommand.operationId === this.batchOperationId;
            const visible = this.alwaysVisible || state?.enabled === true || showReadError || this.input.value.length > 0 || ownsPendingAdd || !!this.batchSession || ownsPendingBatch;
            this.host.hidden = !visible;
            this.onVisibility(visible);
            this.addButton.disabled = busy || !state; this.batchButton.disabled = busy || !state;
            const focused = this.host.contains(document.activeElement) ? document.activeElement : null;
            const taskId = focused?.closest('[data-task-id]')?.dataset.taskId, action = focused?.dataset.taskAction;
            this.filterInput.disabled = !state; this.filterClear.hidden = !this.filterInput.value;
            if (state && (this.renderedRevision !== state.revision || this.renderedFilter !== this.filterQuery)) {
                const revisionChanged = this.renderedRevision !== state.revision;
                this.renderedRevision = state.revision; this.renderedFilter = this.filterQuery;
                const filtering = !!this.filterQuery;
                const matches = task => task.text.toLowerCase().includes(this.filterQuery);
                const openRows = Array.from(this.host.querySelectorAll('[data-task-id] .tasks-row-menu[open]')).map(node => node.closest('[data-task-id]').dataset.taskId);
                const active = state.records.filter(task => task.state === 'active'), ids = active.map(t => t.id);
                const pinned = active.find(task => task.id === state.pinnedId);
                this.renderNext(pinned);
                const matched = active.filter(matches);
                const visible = filtering || this.expanded ? matched : matched.slice(0, 4);
                const count = state.records.filter(matches).length;
                this.filterStatus.hidden = !filtering;
                this.filterStatus.textContent = filtering ? (count ? `${t('tasksFilterMatches')}: ${count}` : t('tasksFilterEmpty')) : '';
                this.list.replaceChildren(...visible.map(task => this.row(task, ids.indexOf(task.id), ids)));
                if (!active.length && !filtering) this.list.append(el('li', 'tasks-empty', t('tasksEmpty')));
                this.more.hidden = filtering || active.length <= 4; this.more.textContent = t(this.expanded ? 'tasksLess' : 'tasksMore'); this.more.setAttribute('aria-expanded', String(this.expanded));
                for (const section of [this.completed, this.removed]) {
                    const records = state.records.filter(task => task.state === (section === this.completed ? 'done' : 'removed') && matches(task));
                    section.summary.textContent = `${t(section.key)} (${records.length})`; section.box.hidden = !records.length;
                    section.list.replaceChildren(...records.map(task => this.row(task, -1, ids)));
                }
                if (revisionChanged) {
                    this.copies.replaceChildren();
                    if (state.recovery.length) {
                        this.copies.append(el('h3', '', t('tasksCopies')));
                        for (const copy of state.recovery.slice().reverse()) {
                            const row = el('div', 'tasks-copy'); row.append(el('span', '', `${new Date(copy.createdAt).toLocaleString()} · ${summarize(api.counts(copy.content))}`),
                                button('tasksRecover', () => this.reviewRecovery(copy.id))); this.copies.append(row);
                        }
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
            this.nextComplete?.setAttribute('aria-disabled', String(busy));
            this.undoButton.textContent = t(this.undo?.state === 'done' ? 'tasksUndoComplete' : 'tasksUndo');
            this.undoButton.hidden = !this.undo || !state?.records.some(t => t.id === this.undo.id && t.version === this.undo.version && t.state === this.undo.state);
            this.undoButton.disabled = busy;
            const error = this.localError || this.controller.error;
            this.status.textContent = error ? errorText(error) : this.controller.status === 'saved' && this.input.value ? t('tasksDraftRemains') : t({ loading: 'tasksLoading', saving: 'tasksSaving', saved: 'tasksSaved', ready: 'tasksReady' }[this.controller.status] || 'tasksReady');
            this.feedback.classList.toggle('is-error', !!error); this.retry.hidden = !error || !['READ', 'WRITE', 'VERIFY'].includes(error.code) || !!this.localError || (!!this.controller.retryCommand && this.controller.retryCommand.operationId !== this.retryEffectOperationId);
            this.retry.disabled = busy;
        }
        rememberUndo(command, saved) {
            const state = { complete: 'done', completePinned: 'done', remove: 'removed' }[command.kind];
            if (!state) return;
            const record = saved.records.find(task => task.id === command.id && task.state === state);
            // Save only the exact confirmed result, never a remotely edited version.
            this.undo = saved.receipts.at(-1) === command.operationId && record &&
                this.controller.state?.records.some(task => task.id === record.id && task.version === record.version && task.state === state)
                ? { ...record } : null;
        }
        undoLast() {
            const record = this.undo;
            if (!record || this.undoButton.hidden) return;
            this.perform(this.controller.store.request(record.state === 'done' ? 'reopen' : 'restore', { id: record.id, version: record.version }), () => {
                if (this.undo === record) this.undo = null;
            });
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
        destroy() { this.destroyed = true; this.pinnedFocus?.cancel(); this.reviewGeneration++; this.pendingReview = false; this.dialogs.forEach(modal => modal.close()); this.unsubscribe(); this.controller.destroy(); }
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
