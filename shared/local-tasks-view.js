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
        tasksCompleteBatch: 'Select tasks to complete', tasksCompleteHelp: 'Choose from the active tasks displayed when this window opened. Nothing is selected initially. Review the exact originals before completing the selection together. Completed tasks still count toward the 500-record limit.',
        tasksCompleteSelectAll: 'Select all listed tasks', tasksCompleteClear: 'Clear selection', tasksCompleteSelected: 'Selected: {count} of {total}',
        tasksCompleteReview: 'Review selected tasks', tasksCompleteConfirm: 'Confirm completion of {count} tasks', tasksCompleteRetry: 'Retry completion of these {count} tasks',
        tasksCompleteClearsPin: 'This selection includes Next up. Completing it will clear that pin.', tasksCompleteKeepsPin: 'Next up will stay unchanged.',
        tasksCompleteReady: 'Confirm to complete every numbered task in one save. If any reviewed task or the list has changed, none will be completed.',
        tasksCompleteChanged: 'The task list changed. Review the selection again. If a selected task changed, close this window and select from the latest list.',
        tasksCompleteUncertain: 'The entire save is unconfirmed. Retry this exact numbered selection; no partial success is assumed.',
        tasksCompleteSaved: 'The reviewed tasks were completed. Review your current selection before confirming anything else.',
        tasksCompleteUndoHelp: 'After a confirmed save, one page-local Undo can reopen this whole selection. If any member has changed, the whole Undo stops. Undo does not restore the old pin.',
        tasksReopenBatch: "Select completed tasks to reopen",
        tasksReopenHelp: "Choose from the completed tasks displayed when this window opened. Nothing is selected initially. Review the exact originals before reopening the selection together.",
        tasksReopenSelectAll: "Select all listed tasks",
        tasksReopenClear: "Clear selection",
        tasksReopenSelected: "Selected: {count} of {total}",
        tasksReopenReview: "Review selected tasks",
        tasksReopenConfirm: "Confirm reopening of {count} tasks",
        tasksReopenRetry: "Retry reopening of these {count} tasks",
        tasksReopenKeepsPin: "Next up will stay unchanged. Reopened tasks keep their stored list positions.",
        tasksReopenReady: "Confirm to reopen every numbered task in one save. If any reviewed task or the list has changed, none will be reopened.",
        tasksReopenChanged: "The task list changed. Review the selection again. If a selected task changed, close this window and select from the latest list.",
        tasksReopenUncertain: "The entire save is unconfirmed. Retry this exact numbered selection; no partial success is assumed.",
        tasksReopenSaved: "The reviewed tasks were reopened. Review your current selection before confirming anything else.",
        tasksReopenHistoryHelp: "Reopening keeps the original text and record count. It does not restore an old pin or create a new Undo action.",
        "tasksRestoreBatch": "Select removed tasks to restore",
        "tasksRestoreHelp": "Choose from the removed tasks currently displayed. Nothing is selected initially. Review every exact original and its restoration destination before confirming.",
        "tasksRestoreSelectAll": "Select all listed tasks",
        "tasksRestoreClear": "Clear selection",
        "tasksRestoreSelected": "Selected: {count} of {total}",
        "tasksRestoreReview": "Review selected tasks",
        "tasksRestoreConfirm": "Confirm restoration of {count} tasks",
        "tasksRestoreRetry": "Retry restoration of these {count} tasks",
        "tasksRestoreToActive": "Restore to: Active",
        "tasksRestoreToDone": "Restore to: Completed",
        "tasksRestoreKeepsPin": "Next up will stay unchanged. Each task returns to its original state and stored list position.",
        "tasksRestoreReady": "Confirm to restore every numbered task to its shown destination in one save. If any reviewed task or the list changed, none will be restored.",
        "tasksRestoreChanged": "The displayed list changed. Review again if these originals are still current, or close and select from the latest list.",
        "tasksRestoreUncertain": "The entire save is unconfirmed. Retry this exact numbered selection and its original destinations; no partial success is assumed.",
        "tasksRestoreSaved": "The reviewed tasks were restored. Review your current selection before confirming anything else.",
        "tasksRestoreHistoryHelp": "Restoration keeps all original text and the 500-record capacity unchanged. It does not restore an old pin or add an Undo/redo action.",
        tasksUndoCompleteBatch: 'Undo completion of these {count} tasks',
        tasksComplete: 'Complete', tasksReopen: 'Reopen', tasksPin: 'Pin next', tasksUnpin: 'Unpin', tasksEdit: 'Edit', tasksRemove: 'Remove', tasksRestore: 'Restore',
        tasksCopyText: 'Copy text', tasksCopying: 'Copying task text…', tasksCopySuccess: 'Task text copied.', tasksCopyFailure: 'Could not copy. Select the task text to copy it manually.',
        tasksCopyVisible: 'Copy visible tasks ({count})', tasksCopyVisiblePending: 'Copying visible tasks…', tasksCopyVisibleSuccess: 'Visible tasks copied.', tasksCopyVisibleFailure: 'Could not copy. Select the visible task text to copy it manually.',
        tasksCopyCompleted: 'Copy visible completed tasks ({count})', tasksCopyCompletedPending: 'Copying visible completed tasks…', tasksCopyCompletedSuccess: 'Visible completed tasks copied.', tasksCopyCompletedFailure: 'Could not copy. Select the visible completed task text to copy it manually.',
        tasksCopyRemoved: 'Copy visible removed tasks ({count})', tasksCopyRemovedPending: 'Copying visible removed tasks…', tasksCopyRemovedSuccess: 'Visible removed tasks copied.', tasksCopyRemovedFailure: 'Could not copy. Select the visible removed task text to copy it manually.',
        tasksReuseText: 'New task from text', tasksReuseHelp: 'Edit this independent draft, then choose Add to create one new active task. The original task stays unchanged. Line breaks stay within one task.',
        tasksReuseRetry: 'Retry previous add', tasksReuseUncertain: 'The previous add could not be confirmed. Retry its exact text below before adding the current draft.',
        tasksReusePrevious: 'Previous text to add', tasksReuseDraftRemains: 'The previous task was saved. Your current draft is still here; choose Add only when you want another task.',
        tasksMoveLast: 'Move to list end', tasksMoveLastHelp: 'Moves this task to the end of the list without changing Next up.',
        tasksMoveFirst: 'Move to list start', tasksMoveFirstHelp: 'Moves this task to the start of the list without changing Next up.',
        tasksActions: 'Actions', tasksUp: 'Move up', tasksDown: 'Move down', tasksMore: 'Show all tasks', tasksLess: 'Show fewer', tasksCompleted: 'Completed', tasksRemoved: 'Removed',
        tasksData: 'Task data', tasksHelp: 'Tasks stay on this device. Settings exports, Chrome Sync and Drive backups do not include them. Export tasks separately. Removing the extension or browser data can delete local tasks.',
        tasksExport: 'Export tasks', tasksImport: 'Import tasks', tasksCopies: 'Previous local copies', tasksRecover: 'Review restore', tasksUndo: 'Undo removal', tasksUndoComplete: 'Undo completion',
        tasksLoading: 'Loading local tasks…', tasksDraftRemains: 'Last task saved. Your current draft is not saved yet.', tasksReady: 'Local tasks ready', tasksSaving: 'Saving on this device…', tasksSaved: 'Saved on this device', tasksRetry: 'Retry',
        tasksCancel: 'Cancel', tasksSave: 'Save task', tasksEditTitle: 'Edit task', tasksReviewTitle: 'Replace local tasks?', tasksReplace: 'Replace tasks',
        tasksReviewHelp: 'This replaces the current task list and pin on this device. A previous local copy is kept below Task data, except when a full archive is imported into an empty list with no previous copies. All imported copies are kept. Settings and cloud backups stay unchanged.',
        tasksRecoveryPreview: 'Contents of this local copy', tasksRecoveryPreviewHelp: 'These tasks and the Next up pin from the selected copy will replace the current list. Removed tasks stay removed; Removed from shows the state used when restoring an individual task.',
        tasksRecoveryRemovedFrom: 'Removed from: {state}', tasksRecoveryEmpty: 'This copy contains no tasks.',
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
        const close = (restoreFocus = true) => { if (closed) return; closed = true; cleanup?.(restoreFocus); overlay.remove(); onClose?.(restoreFocus); };
        const modal = { panel, close, get isOpen() { return !closed; }, open: focus => { cleanup = root.LocalItabDialog.open(overlay, focus, () => modal.close()); } };
        return modal;
    }
    class View {
        constructor(host, { controller = new api.Controller(), onVisibility = () => {}, alwaysVisible = false, clipboard = root.navigator?.clipboard } = {}) {
            this.host = host; this.controller = controller; this.clipboard = clipboard; this.copyAttempt = null; this.onVisibility = onVisibility; this.alwaysVisible = alwaysVisible;
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
            this.quickEntryComposing = false; this.quickEntryCompositionSettling = false; this.quickEntryCompositionEpoch = 0;
            this.input.addEventListener('compositionstart', () => {
                if (this.destroyed) return;
                this.quickEntryCompositionEpoch++; this.quickEntryComposing = true; this.quickEntryCompositionSettling = false;
                // Even an empty/new composition owns the draft while an older add settles.
                this.draftGeneration++; this.render();
            });
            this.input.addEventListener('compositionend', () => {
                if (this.destroyed) return;
                const epoch = ++this.quickEntryCompositionEpoch;
                this.quickEntryComposing = false; this.quickEntryCompositionSettling = true;
                // Keep an empty field visible through a following final input event.
                // A cancelled composition need not send input, so release next turn.
                setTimeout(() => {
                    if (this.destroyed || epoch !== this.quickEntryCompositionEpoch) return;
                    this.quickEntryCompositionSettling = false; this.render();
                }, 0);
                this.render();
            });
            this.input.addEventListener('focusout', () => this.deferQuickEntryBlur());
            this.input.addEventListener('input', event => {
                if (this.destroyed) return;
                this.draftGeneration++;
                if (event.isComposing) {
                    this.quickEntryCompositionEpoch++; this.quickEntryComposing = true;
                    if (document.activeElement !== this.input) this.deferQuickEntryBlur();
                }
                this.quickEntryCompositionSettling = false; this.render();
            });
            this.input.addEventListener('keydown', event => {
                if (event.key === 'Enter' && !event.shiftKey && !this.quickEntryComposing && !event.isComposing && event.keyCode !== 229) {
                    event.preventDefault(); if (!event.repeat) this.add();
                }
            });
            this.addButton = button('tasksAdd', () => this.add(), 'tasks-primary'); this.form.append(this.input, this.addButton);
            this.form.addEventListener('submit', event => { event.preventDefault(); this.add(); });
            this.batchButton = button('tasksBatch', () => this.addBatch(), 'tasks-batch-entry');
            const batchRow = el('div', 'tasks-batch-row'); batchRow.append(this.batchButton);
            this.list = el('ul', 'tasks-list'); this.more = button('tasksMore', () => { this.expanded = !this.expanded; this.renderedRevision = null; this.render(); });
            this.visibleTasks = []; this.copyVisibleButton = button('tasksCopyVisible', () => this.copyVisibleTasks(), 'tasks-copy-visible');
            this.copyVisibleStatus = el('p', 'tasks-row-copy-status tasks-visible-copy-status'); this.copyVisibleStatus.hidden = true;
            this.copyVisibleStatus.setAttribute('role', 'status'); this.copyVisibleStatus.setAttribute('aria-live', 'polite');
            this.completeBatchButton = button('tasksCompleteBatch', () => this.completeBatch(), 'tasks-complete-batch');
            const copyVisibleRow = el('div', 'tasks-visible-copy'); copyVisibleRow.append(this.copyVisibleButton, this.completeBatchButton, this.copyVisibleStatus);
            this.completed = this.section('tasksCompleted'); this.removed = this.section('tasksRemoved');
            this.visibleCompletedTasks = [];
            this.copyCompletedButton = button('tasksCopyCompleted', event => { if (!(event.detail > 1)) this.copyCompletedTasks(); }, 'tasks-copy-completed');
            this.copyCompletedButton.addEventListener('keydown', event => {
                if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault();
            });
            this.copyCompletedStatus = el('p', 'tasks-row-copy-status tasks-completed-copy-status'); this.copyCompletedStatus.hidden = true;
            this.copyCompletedStatus.setAttribute('role', 'status'); this.copyCompletedStatus.setAttribute('aria-live', 'polite');
            this.reopenBatchButton = button('tasksReopenBatch', () => this.reopenBatch(), 'tasks-reopen-batch');
            const copyCompletedRow = el('div', 'tasks-visible-copy tasks-completed-copy'); copyCompletedRow.append(this.copyCompletedButton, this.reopenBatchButton, this.copyCompletedStatus);
            this.completed.box.replaceChildren(this.completed.summary, copyCompletedRow, this.completed.list);
            this.completed.box.addEventListener('toggle', () => this.refreshCopyControls());
            this.visibleRemovedTasks = [];
            const copyRemoved = button('tasksCopyRemoved', event => {
                if (event.defaultPrevented || event.detail > 1 || event.repeat || event.isComposing || event.keyCode === 229) return;
                this.copyRemovedTasks(copyRemoved);
            }, 'tasks-copy-removed');
            this.copyRemovedButton = copyRemoved;
            copyRemoved.addEventListener('keydown', event => {
                if (['Enter', ' '].includes(event.key) && (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault();
            });
            this.copyRemovedStatus = el('p', 'tasks-row-copy-status tasks-removed-copy-status'); this.copyRemovedStatus.hidden = true;
            this.copyRemovedStatus.setAttribute('role', 'status'); this.copyRemovedStatus.setAttribute('aria-live', 'polite');
            const restoreRemoved = button('tasksRestoreBatch', event => {
                if (event.defaultPrevented || event.detail > 1 || event.repeat || event.isComposing || event.keyCode === 229 ||
                    event.target !== restoreRemoved || (event.currentTarget && event.currentTarget !== restoreRemoved)) return;
                this.restoreBatch(restoreRemoved);
            }, 'tasks-restore-batch');
            this.restoreBatchButton = restoreRemoved;
            restoreRemoved.addEventListener('keydown', event => {
                if (['Enter', ' '].includes(event.key) && (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault();
            });
            const copyRemovedRow = el('div', 'tasks-visible-copy tasks-removed-copy'); copyRemovedRow.append(copyRemoved, restoreRemoved, this.copyRemovedStatus);
            this.removed.box.replaceChildren(this.removed.summary, copyRemovedRow, this.removed.list);
            // Keep the original control and source ownership, independently of mutable view properties.
            this.removedCopyOwner = { section: this.removed, box: this.removed.box, summary: this.removed.summary,
                list: this.removed.list, controls: copyRemovedRow, origin: copyRemoved, status: this.copyRemovedStatus };
            this.removedRestoreOwner = { section: this.removed, box: this.removed.box, summary: this.removed.summary,
                list: this.removed.list, controls: copyRemovedRow, origin: restoreRemoved, host: this.host,
                controller: this.controller, store: this.controller.store, valid: true,
                workspace: this.controller.store.backend?.workspace, workspaceId: this.controller.store.backend?.workspace?.id,
                workspaceGeneration: this.controller.store.backend?.workspace?.generation, session: root.LocalItabWorkspaces?.session };
            this.removed.box.addEventListener('toggle', () => {
                if (!this.removed.box.open && this.copyAttempt?.status === this.copyRemovedStatus) this.invalidateCopy();
                this.refreshCopyControls();
            });
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
            host.replaceChildren(header, this.next, this.form, batchRow, this.filter, this.filterStatus, copyVisibleRow, this.list, this.more, this.completed.box, this.removed.box, this.data, this.feedback);
            // Move-to-start belongs to the mounted source, including before its first async read.
            const workspace = controller.store.backend?.workspace ?? null, chain = [];
            for (let node = this.list; node; node = node.parentElement) chain.push([node, node.parentElement]);
            this.moveFirstOwner = Object.freeze({ host, list: this.list, filterInput: this.filterInput, controller, store: controller.store, backend: controller.store.backend,
                workspace, workspaceId: workspace?.id, workspaceGeneration: workspace?.generation,
                legacyAvailability: !!workspace && typeof workspace === 'object' && workspace.id == null && workspace.generation == null && root.LocalItabWorkspaces == null,
                session: root.LocalItabWorkspaces?.session ?? null, chain });
            this.unsubscribe = controller.subscribe(() => this.render()); this.render(); controller.refresh().catch(() => {});
        }
        deferQuickEntryBlur() {
            if (!this.quickEntryComposing || this.destroyed) return;
            const epoch = this.quickEntryCompositionEpoch;
            // Blur may precede final IME input. Keep the guard this event turn,
            // then recover an inactive field if cancellation omitted compositionend.
            setTimeout(() => {
                if (this.destroyed || epoch !== this.quickEntryCompositionEpoch || document.activeElement === this.input) return;
                this.quickEntryCompositionEpoch++; this.quickEntryComposing = false; this.render();
            }, 0);
        }
        applyFilter() {
            this.filterQuery = this.filterInput.value.trim().toLowerCase();
            this.render();
        }
        hasUncommittedWork() { return !this.destroyed && (this.quickEntryComposing || this.quickEntryCompositionSettling || this.input.value.length > 0 || this.dialogs.size > 0 || this.pendingReview || !!this.controller.pending); }
        createDialog(title, onClose) {
            if (this.destroyed || this.dialogs.size) return null;
            this.invalidateCopy();
            this.reviewGeneration++; this.pendingReview = false;
            const modal = dialog(title, restoreFocus => {
                this.dialogs.delete(modal); onClose?.(); this.refreshCopyControls();
                if (restoreFocus && !this.destroyed && document.activeElement === document.body && !this.host.hidden) this.input.focus();
            });
            this.dialogs.add(modal); this.refreshCopyControls(); return modal;
        }
        section(key) {
            const box = el('details', 'tasks-section'), summary = el('summary', '', t(key)), list = el('ul', 'tasks-list');
            box.append(summary, list); return { box, summary, list, key };
        }
        async perform(command, success, failure = null) {
            if (this.destroyed || this.controller.pending) return;
            const generation = ++this.actionGeneration;
            this.localError = null;
            this.retryEffect = success; this.retryFailure = failure; this.retryEffectOperationId = command.operationId;
            try {
                const state = await this.controller.run(command);
                // Final controller notifications can start another action before this
                // continuation runs. An older result must not replace its Undo/retry.
                if (this.destroyed || generation !== this.actionGeneration || this.controller.pending ||
                    (this.controller.retryCommand && this.controller.retryCommand.operationId !== command.operationId)) return;
                this.rememberUndo(command, state); this.retryEffect = null; this.retryFailure = null; success?.(state); this.render();
            }
            catch (error) {
                if (!this.destroyed && generation === this.actionGeneration && this.controller.retryCommand?.operationId === command.operationId) failure?.(error);
                // Controller owns the card's safe, content-free feedback.
            }
        }
        async retryLast() {
            if (this.controller.pending || this.destroyed) return;
            const command = this.controller.retryCommand;
            // Retry must stay with the mounted moveFirst source, but its original
            // receipt remains authoritative after rows/order change or an unknown save.
            if (command?.kind === 'moveFirst' && !this.moveFirstSourceCurrent(this.moveFirstOwner)) return;
            if (command?.kind === 'restoreBatch' && (!this.restorationAttempt || this.restorationAttempt.command !== command ||
                !this.restorationWorkspaceCurrent(this.restorationAttempt.source) || root.LocalItabContentLifecycle?.departing ||
                document.hidden || document.visibilityState === 'hidden')) return;
            if (command?.kind === 'completePinned' && command.operationId === this.retryEffectOperationId) {
                return this.performPinned(command, this.retry);
            }
            if (command) {
                if (command.operationId !== this.retryEffectOperationId) return;
                return this.perform(command, this.retryEffect, this.retryFailure);
            }
            this.localError = null;
            try { await this.controller.retry(); if (!this.destroyed) this.render(); } catch (_) {}
        }
        add() {
            if (this.destroyed || this.quickEntryComposing || this.controller.pending) return;
            const text = this.input.value, generation = this.draftGeneration;
            const command = this.controller.store.request('add', { text });
            this.perform(command, () => {
                // A late success must not clear newer text or focus another element.
                if (!this.quickEntryComposing && this.draftGeneration === generation && this.input.value === text) this.input.value = '';
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
            const changed = () => {
                generation++; epoch++; reviewing = false; review = null;
                if (!retryCommand) { showReview(null); if (!saving) setFeedback(''); }
                update();
            };
            input.addEventListener('input', changed);
            // A new composition owns the draft before its first input event.
            // Older reviews/saves must not publish a preview or close its editor.
            input.addEventListener('compositionstart', () => { composing = true; changed(); });
            input.addEventListener('compositionend', () => { composing = false; update(); });
            input.addEventListener('focusout', () => { composing = false; update(); });
            const actions = el('div', 'tasks-dialog-actions'); actions.append(button('tasksCancel', () => modal.close()), reviewButton, retry, confirm);
            modal.panel.append(input, hint, count, preview, feedback, actions);
            unsubscribe = this.controller.subscribe(update); modal.open(input); update(); this.render();
        }
        completeBatch() { return this.transitionBatch(false); }
        reopenBatch() { return this.transitionBatch(true); }
        transitionBatch(reopening) {
            const source = reopening ? this.visibleCompletedTasks : this.visibleTasks;
            const origin = reopening ? this.reopenBatchButton : this.completeBatchButton;
            if (!(reopening ? this.completedVisibleCurrent(source, origin) : this.copyVisibleCurrent(source, origin))) return;
            const message = suffix => t(`tasks${reopening ? 'Reopen' : 'Complete'}${suffix}`);
            const css = suffix => `tasks-${reopening ? 'reopen' : 'complete'}-${suffix}`;
            const records = Object.freeze(source.map(task => Object.freeze({ ...task })));
            const workspace = this.controller.store.backend?.workspace;
            let unsubscribe = () => {}, epoch = 0, generation = 0, reviewing = false, saving = false;
            let review = null, attempt = null, retryCommand = null, focusDeparted = false;
            const moved = event => { focusDeparted = !modal.panel.contains(event.target); };
            const departed = () => { focusDeparted = true; };
            const modal = this.createDialog(message('Batch'), () => {
                epoch++; unsubscribe();
                document.removeEventListener('focusin', moved, true); document.removeEventListener('visibilitychange', departed, true);
                root.removeEventListener?.('blur', departed); root.removeEventListener?.('pagehide', departed);
                if (this.completionSession === modal) this.completionSession = null;
                // Closing cannot cancel a sent write. Keep any uncertain original
                // command reachable through the card's explicit Retry.
                this.render();
            });
            if (!modal) return;
            this.completionSession = modal;
            const owns = () => !this.destroyed && modal.isOpen && this.completionSession === modal && modal.panel.isConnected && this.host.isConnected;
            const available = () => !this.controller.closed && !!this.controller.state && !document.hidden && document.visibilityState !== 'hidden' &&
                !modal.panel.closest('[hidden], [inert]') && !!modal.panel.getClientRects().length &&
                !['hidden', 'collapse'].includes(root.getComputedStyle?.(modal.panel).visibility) &&
                !root.LocalItabContentLifecycle?.departing && this.controller.store.backend?.workspace === workspace &&
                !workspace?.invalidated && !workspace?._suspended;
            const originalClose = modal.close;
            modal.close = () => {
                const restore = owns() && !focusDeparted && available() && !document.hidden && document.visibilityState !== 'hidden' &&
                    (modal.panel.contains(document.activeElement) || document.activeElement === document.body);
                originalClose(false);
                if (!restore || this.destroyed || this.dialogs.size || document.activeElement !== document.body) return;
                const visible = node => {
                    if (!node?.isConnected || node.disabled || node.closest('[hidden], [inert]') || !node.getClientRects().length) return false;
                    for (let parent = node.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS' && !parent.open) return false;
                    return true;
                };
                if (visible(origin)) origin.focus(); else if (visible(this.input)) this.input.focus();
            };
            const selected = new Set(), choices = [];
            const selection = el('ol', `tasks-batch-list ${css('selection')}`);
            const count = el('p', 'tasks-help'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
            const preview = el('section', `tasks-batch-preview ${css('preview')}`); preview.hidden = true;
            const title = el('h3'), list = el('ol', 'tasks-batch-list'), pin = el('p', 'tasks-help'); preview.append(title, list, pin);
            const feedback = el('p', 'tasks-dialog-feedback tasks-batch-feedback'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
            const setFeedback = (text, error = false) => { feedback.textContent = text; feedback.classList.toggle('is-error', error); };
            const cancel = button('tasksCancel', () => modal.close(), css('cancel'));
            const setControl = (node, disabled, hidden = false) => {
                if (!owns()) return;
                if (document.activeElement === node && (disabled || hidden)) cancel.focus();
                node.disabled = disabled; node.hidden = hidden;
            };
            const showReview = value => {
                preview.hidden = !value; title.textContent = value ? `${t('tasksBatchPreview')} (${value.count})` : '';
                list.replaceChildren(...(value ? value.records.map(task => el('li', '', task.text)) : []));
                pin.textContent = value ? (reopening ? message('KeepsPin') : t(value.clearsPin ? 'tasksCompleteClearsPin' : 'tasksCompleteKeepsPin')) : '';
            };
            const update = () => {
                if (!owns()) return;
                count.textContent = message('Selected').replace('{count}', selected.size).replace('{total}', records.length);
                if (review && !saving && !retryCommand && this.controller.state?.revision > review.revision) {
                    epoch++; review = null; showReview(null); setFeedback(message('Changed'));
                }
                const blocked = saving || !!this.controller.pending || !available();
                for (const checkbox of choices) setControl(checkbox, blocked);
                setControl(all, blocked); setControl(clear, blocked || !selected.size);
                setControl(reviewButton, blocked || reviewing || !!retryCommand || !selected.size);
                setControl(confirm, blocked || !review, !review || !!retryCommand);
                confirm.textContent = message('Confirm').replace('{count}', review?.count ?? 0);
                setControl(retry, blocked, !retryCommand);
                retry.textContent = message('Retry').replace('{count}', retryCommand?.targets.length ?? 0);
                if (!available()) { review = null; showReview(null); setControl(confirm, true, true); setFeedback(t('tasksErrorUnavailable'), true); }
            };
            const changed = () => {
                generation++; epoch++; reviewing = false; review = null;
                if (!retryCommand) { showReview(null); if (!saving) setFeedback(''); }
                update();
            };
            for (const task of records) {
                const row = el('li'), label = el('label'), checkbox = el('input', css('checkbox')); checkbox.type = 'checkbox'; checkbox.checked = false;
                checkbox.addEventListener('change', () => {
                    if (!owns() || !available() || saving || this.controller.pending) { checkbox.checked = selected.has(task.id); return; }
                    if (checkbox.checked) selected.add(task.id); else selected.delete(task.id); changed();
                });
                choices.push(checkbox); label.append(checkbox, el('span', 'tasks-recovery-text', task.text)); row.append(label); selection.append(row);
            }
            const select = value => {
                if (!owns() || !available() || saving || this.controller.pending) return;
                selected.clear(); records.forEach((task, index) => { choices[index].checked = value; if (value) selected.add(task.id); }); changed();
            };
            const all = button(`tasks${reopening ? 'Reopen' : 'Complete'}SelectAll`, () => select(true), css('select-all'));
            const clear = button(`tasks${reopening ? 'Reopen' : 'Complete'}Clear`, () => select(false), css('clear'));
            const prepare = async () => {
                if (!owns() || !available() || saving || this.controller.pending || retryCommand || !selected.size) return;
                const ticket = ++epoch, submittedGeneration = generation;
                const targets = records.filter(task => selected.has(task.id)).map(({ id, version }) => ({ id, version }));
                reviewing = true; review = null; showReview(null); setFeedback(t('tasksLoading')); update();
                try {
                    const value = await this.controller.store[reopening ? 'reviewReopening' : 'reviewCompletion'](targets);
                    if (!owns() || !available() || ticket !== epoch || generation !== submittedGeneration) return;
                    if (this.controller.state?.revision > value.revision) { setFeedback(message('Changed')); return; }
                    review = value; showReview(value); setFeedback(message('Ready'));
                } catch (error) { if (owns() && ticket === epoch) setFeedback(errorText(error), true); }
                finally { if (owns() && ticket === epoch) { reviewing = false; update(); } }
            };
            const submit = async (retryPrevious = false) => {
                if (!owns() || !available() || saving || this.controller.pending) return;
                if (retryPrevious) { if (!retryCommand) return; }
                else {
                    if (!review || retryCommand) return;
                    if (this.controller.state?.revision > review.revision) { update(); return; }
                    attempt = { command: review.command, review, generation };
                }
                const submitted = attempt, command = submitted.command;
                saving = true; setFeedback(t('tasksSaving')); update();
                await this.perform(command, state => {
                    if (!owns()) return;
                    retryCommand = null; attempt = null; review = null; showReview(null);
                    if (available() && generation === submitted.generation && this.controller.state?.revision === state.revision &&
                        this.controller.state?.receipts.at(-1) === command.operationId) modal.close();
                    else setFeedback(message('Saved'));
                }, error => {
                    if (!owns()) return;
                    review = null;
                    if (['READ', 'WRITE', 'VERIFY'].includes(error.code)) {
                        retryCommand = command; showReview(submitted.review);
                        setFeedback(`${errorText(error)} ${message('Uncertain')}`, true);
                    } else {
                        retryCommand = null; attempt = null; showReview(null);
                        this.controller.dismissRetry(command.operationId); setFeedback(errorText(error), true);
                    }
                });
                saving = false; if (owns()) update();
            };
            const reviewButton = button(`tasks${reopening ? 'Reopen' : 'Complete'}Review`, prepare, css('review'));
            const confirm = button(`tasks${reopening ? 'Reopen' : 'Complete'}Confirm`, event => { if (!(event.detail > 1)) submit(); }, `tasks-primary ${css('confirm')}`);
            const retry = button(`tasks${reopening ? 'Reopen' : 'Complete'}Retry`, event => { if (!(event.detail > 1)) submit(true); }, `tasks-primary ${css('retry')}`);
            for (const node of [reviewButton, confirm, retry]) node.addEventListener('keydown', event => {
                if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault();
            });
            const selectionActions = el('div', 'tasks-dialog-actions'); selectionActions.append(all, clear);
            const actions = el('div', 'tasks-dialog-actions'); actions.append(cancel, reviewButton, retry, confirm);
            modal.panel.append(el('p', 'tasks-help', message('Help')), el('p', 'tasks-help', reopening ? message('HistoryHelp') : message('UndoHelp')), selectionActions, selection, count, preview, feedback, actions);
            unsubscribe = this.controller.subscribe(update); modal.open(all);
            document.addEventListener('focusin', moved, true); document.addEventListener('visibilitychange', departed, true);
            root.addEventListener?.('blur', departed); root.addEventListener?.('pagehide', departed);
            update(); this.render();
        }
        restorationNodeVisible(node, modal = null) {
            if (!node?.isConnected || node.ownerDocument !== document || !node.getClientRects().length) return false;
            for (let current = node; current; current = current.parentElement) {
                const style = root.getComputedStyle?.(current);
                const background = this.restorationBackground;
                const ownedInert = modal && this.restorationSession === modal && background?.modal === modal &&
                    background.node === current && background.initialInert === false && current.inert === true;
                if (current.ownerDocument !== document || current.hidden || (current.inert && !ownedInert) || current.disabled ||
                    current.getAttribute('aria-hidden') === 'true' || current.style.display === 'none' ||
                    ['hidden', 'collapse'].includes(current.style.visibility) || style?.display === 'none' ||
                    ['hidden', 'collapse'].includes(style?.visibility) || (current.tagName === 'DETAILS' && !current.open)) return false;
            }
            return true;
        }
        restorationWorkspaceCurrent(source) {
            const owner = this.removedRestoreOwner, workspace = source?.workspace;
            return !!source && this.controller === owner.controller && this.controller.store === owner.store &&
                workspace === owner.workspace && workspace?.id === owner.workspaceId && workspace?.generation === owner.workspaceGeneration &&
                source.session === owner.session && owner.store.backend?.workspace === workspace && workspace?.id === source.workspaceId &&
                workspace?.generation === source.workspaceGeneration && root.LocalItabWorkspaces?.session === source.session &&
                source.session === workspace && !workspace?.invalidated && !workspace?._suspended;
        }
        captureRemovedRestoration() {
            const previous = this.removedRestoreSource;
            previous?.drain?.(); previous?.observer?.disconnect();
            if (previous) previous.valid = false;
            const owner = this.removedRestoreOwner, workspace = this.controller.store.backend?.workspace;
            // Set this render's own availability before observing its source.
            // Later external disable/re-enable mutations still invalidate it.
            if (owner.origin.disabled !== !this.visibleRemovedTasks.length) owner.origin.disabled = !this.visibleRemovedTasks.length;
            const rows = Array.from(owner.list.children), titles = rows.map(item => item.querySelector('.tasks-text'));
            const fixed = [owner.host, owner.box, owner.summary, owner.controls, owner.origin, owner.list];
            const chain = fixed.map(node => [node, node.parentElement]);
            for (let node = owner.host.parentElement; node; node = node.parentElement) chain.push([node, node.parentElement]);
            for (const node of [...rows, ...titles]) {
                chain.push([node, node.parentElement]);
                if (titles.includes(node)) chain.push([node.parentElement, node.parentElement.parentElement]);
            }
            const source = { valid: true, rows, titles, chain, snapshot: this.visibleRemovedTasks,
                revision: this.renderedRevision, filter: this.filterQuery, workspace, workspaceId: workspace?.id,
                workspaceGeneration: workspace?.generation, session: root.LocalItabWorkspaces?.session };
            const inspect = mutations => {
                let changed = false;
                for (const mutation of mutations) {
                    const background = this.restorationBackground;
                    if (mutation.type === 'attributes' && mutation.attributeName === 'inert' && mutation.target === background?.node &&
                        typeof background.expected === 'boolean' && mutation.target.inert === background.expected &&
                        (background.expected ? mutation.oldValue === null : mutation.oldValue != null)) {
                        background.expected = null; continue;
                    }
                    const dialogOwner = this.restorationDialogOwner;
                    if (dialogOwner?.opened && !dialogOwner.closing &&
                        (Array.from(mutation.removedNodes || []).some(node => node === dialogOwner.panel || node.contains?.(dialogOwner.panel)) ||
                            (mutation.type === 'attributes' && (mutation.target === dialogOwner.panel || mutation.target.contains?.(dialogOwner.panel))))) dialogOwner.valid = false;
                    const removed = Array.from(mutation.removedNodes || []);
                    if (removed.some(node => fixed.some(target => node === target || node.contains?.(target)))) owner.valid = false;
                    if (removed.some(node => chain.some(([target]) => node === target || node.contains?.(target))) ||
                        ((mutation.type === 'childList' || mutation.type === 'characterData') && titles.some(title => title === mutation.target || title.contains(mutation.target))) ||
                        (mutation.type === 'attributes' && mutation.attributeName !== 'open' &&
                            [owner.origin, owner.list, ...titles].some(node => mutation.target === node || mutation.target.contains?.(node))) ||
                        (mutation.type === 'attributes' && mutation.attributeName === 'open' && source.changed && mutation.target === owner.box)) changed = true;
                }
                if (changed) source.valid = false;
                return changed;
            };
            source.observer = root.MutationObserver ? new root.MutationObserver(mutations => {
                if (inspect(mutations)) source.changed?.();
            }) : null;
            source.drain = () => { if (source.observer) inspect(source.observer.takeRecords()); };
            source.observer?.observe(document.documentElement, { subtree: true, childList: true, characterData: true,
                attributes: true, attributeFilter: ['hidden', 'inert', 'style', 'class', 'open', 'aria-hidden', 'disabled'], attributeOldValue: true });
            this.removedRestoreSource = source;
            previous?.changed?.();
        }
        removedRestorationCurrent(source, origin, modal = null) {
            source?.drain?.();
            const owner = this.removedRestoreOwner, state = this.controller.state;
            if (!source || !source.valid || !owner.valid || source !== this.removedRestoreSource || !source.snapshot.length ||
                this.destroyed || this.controller.closed || !state || this.controller.pending || this.controller.error || this.localError ||
                this.controller.retryCommand || ['loading', 'saving', 'error'].includes(this.controller.status) ||
                this.filterComposing || this.pendingReview || root.LocalItabContentLifecycle?.departing ||
                document.hidden || document.visibilityState === 'hidden' || !this.restorationWorkspaceCurrent(source) ||
                (modal ? this.restorationSession !== modal || !modal.isOpen || this.dialogs.size !== 1 ||
                    (this.restorationBackground?.modal === modal && this.restorationBackground.node.inert !== true) : this.dialogs.size > 0) ||
                this.host !== owner.host || this.removed !== owner.section || this.removed.box !== owner.box ||
                this.removed.summary !== owner.summary || this.removed.list !== owner.list || this.restoreBatchButton !== owner.origin || origin !== owner.origin ||
                owner.box.parentElement !== owner.host || owner.summary.parentElement !== owner.box || owner.controls.parentElement !== owner.box ||
                origin.parentElement !== owner.controls || owner.list.parentElement !== owner.box ||
                origin.disabled || origin.getAttribute('disabled') != null || (!modal && origin.getAttribute('aria-disabled') === 'true') ||
                source.chain.some(([node, parent]) => node.ownerDocument !== document || node.parentElement !== parent) ||
                ![origin, owner.summary, owner.list].every(node => this.restorationNodeVisible(node, modal)) ||
                this.visibleRemovedTasks !== source.snapshot || this.renderedRevision !== state.revision || source.revision !== state.revision ||
                this.renderedFilter !== this.filterQuery || source.filter !== this.filterQuery || this.filterInput.value.trim().toLowerCase() !== this.filterQuery) return false;
            const expected = state.records.filter(task => task.state === 'removed' && task.text.toLowerCase().includes(this.filterQuery));
            const rows = Array.from(owner.list.children);
            return expected.length === source.snapshot.length && rows.length === expected.length && source.snapshot.every((task, index) => {
                const row = rows[index], title = source.titles[index], current = expected[index];
                return row === source.rows[index] && row.dataset.taskId === task.id && row.querySelector('.tasks-text') === title &&
                    title.textContent === task.text && !title.children.length && this.restorationNodeVisible(title, modal) &&
                    task.state === 'removed' && current.id === task.id && current.version === task.version &&
                    current.text === task.text && current.state === task.state && current.removedFrom === task.removedFrom;
            });
        }
        restoreBatch(origin = this.restoreBatchButton) {
            let source = this.removedRestoreSource;
            const initialSource = source;
            if (!this.removedRestorationCurrent(source, origin)) return;
            const message = suffix => t(`tasksRestore${suffix}`);
            const css = suffix => `tasks-restore-${suffix}`;
            const records = Object.freeze(source.snapshot.map(task => Object.freeze({ ...task })));
            const workspace = this.controller.store.backend?.workspace;
            let unsubscribe = () => {}, epoch = 0, generation = 0, reviewing = false, saving = false;
            let review = null, attempt = null, retryCommand = null, focusDeparted = false, composing = false;
            const moved = event => { focusDeparted = !modal.panel.contains(event.target); };
            const departed = () => { focusDeparted = true; };
            const modal = this.createDialog(message('Batch'), () => {
                epoch++; unsubscribe(); source.changed = null;
                document.removeEventListener('focusin', moved, true); document.removeEventListener('visibilitychange', departed, true);
                root.removeEventListener?.('blur', departed); root.removeEventListener?.('pagehide', departed);
                if (this.restorationSession === modal) this.restorationSession = null;
                // Closing cannot cancel a sent write. Keep any uncertain original
                // command reachable through the card's explicit Retry.
                this.render();
            });
            if (!modal) return;
            this.restorationSession = modal;
            const dialogOwner = { panel: modal.panel, overlay: modal.panel.parentElement, valid: true, opened: false, closing: false };
            this.restorationDialogOwner = dialogOwner;
            const owns = () => !this.destroyed && modal.isOpen && this.restorationSession === modal && modal.panel.isConnected && this.host.isConnected;
            const available = () => {
                this.removedRestoreSource?.drain?.();
                return dialogOwner.valid && this.removedRestoreOwner.valid && this.host === this.removedRestoreOwner.host &&
                modal.panel.parentElement === dialogOwner.overlay && dialogOwner.overlay.parentElement === document.body && !this.controller.closed && !!this.controller.state && !document.hidden && document.visibilityState !== 'hidden' &&
                !modal.panel.closest('[hidden], [inert]') && !!modal.panel.getClientRects().length &&
                !['hidden', 'collapse'].includes(root.getComputedStyle?.(modal.panel).visibility) &&
                !root.LocalItabContentLifecycle?.departing && this.controller.store.backend?.workspace === workspace &&
                !workspace?.invalidated && !workspace?._suspended && this.restorationWorkspaceCurrent(source) &&
                modal.panel.ownerDocument === document;
            };
            const originalClose = modal.close;
            modal.close = () => {
                const restore = owns() && !focusDeparted && available() && !document.hidden && document.visibilityState !== 'hidden' &&
                    (modal.panel.contains(document.activeElement) || document.activeElement === document.body);
                this.removedRestoreSource?.drain?.();
                const background = this.restorationBackground;
                if (background?.modal === modal) background.expected = background.initialInert;
                dialogOwner.closing = true; originalClose(false);
                this.removedRestoreSource?.drain?.();
                if (background?.modal === modal) { background.expected = null; if (this.restorationBackground === background) this.restorationBackground = null; }
                if (!restore || this.destroyed || this.dialogs.size || document.activeElement !== document.body) return;
                const visible = node => {
                    if (!this.restorationNodeVisible(node) || node.disabled) return false;
                    for (let parent = node.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS' && !parent.open) return false;
                    return true;
                };
                if (this.removedRestoreOwner.valid && this.restoreBatchButton === origin && visible(origin)) origin.focus(); else if (visible(this.input)) this.input.focus();
            };
            const selected = new Set(), choices = [];
            const selection = el('ol', `tasks-batch-list ${css('selection')}`);
            const count = el('p', 'tasks-help'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite');
            const preview = el('section', `tasks-batch-preview ${css('preview')}`); preview.hidden = true;
            const title = el('h3'), list = el('ol', 'tasks-batch-list'), pin = el('p', 'tasks-help'); preview.append(title, list, pin);
            const feedback = el('p', 'tasks-dialog-feedback tasks-batch-feedback'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
            const setFeedback = (text, error = false) => { feedback.textContent = text; feedback.classList.toggle('is-error', error); };
            const cancel = button('tasksCancel', () => modal.close(), css('cancel'));
            const setControl = (node, disabled, hidden = false) => {
                if (!owns()) return;
                if (document.activeElement === node && (disabled || hidden)) cancel.focus();
                node.disabled = disabled; node.hidden = hidden;
            };
            const showReview = value => {
                preview.hidden = !value; title.textContent = value ? `${t('tasksBatchPreview')} (${value.count})` : '';
                list.replaceChildren(...(value ? value.records.map(task => {
                    const row = el('li'); row.append(el('span', 'tasks-recovery-text', task.text),
                        el('p', 'tasks-help tasks-restore-destination', message(task.removedFrom === 'active' ? 'ToActive' : 'ToDone'))); return row;
                }) : []));
                pin.textContent = value ? message('KeepsPin') : '';
            };
            const update = () => {
                if (!owns()) return;
                count.textContent = message('Selected').replace('{count}', selected.size).replace('{total}', records.length);
                if (review && !saving && !retryCommand && (this.controller.state?.revision !== review.revision || !sourceCurrent())) {
                    epoch++; review = null; showReview(null); setFeedback(message('Changed'));
                }
                const blocked = saving || !!this.controller.pending || !available() || composing;
                for (const checkbox of choices) setControl(checkbox, blocked);
                setControl(all, blocked); setControl(clear, blocked || !selected.size);
                setControl(reviewButton, blocked || reviewing || !!retryCommand || !selected.size || !sourceCurrent());
                setControl(confirm, blocked || !review, !review || !!retryCommand);
                confirm.textContent = message('Confirm').replace('{count}', review?.count ?? 0);
                setControl(retry, blocked, !retryCommand);
                retry.textContent = message('Retry').replace('{count}', retryCommand?.targets.length ?? 0);
                if (!available()) { review = null; if (!retryCommand && !saving) showReview(null); setControl(confirm, true, true); setFeedback(t('tasksErrorUnavailable'), true); }
            };
            const changed = () => {
                generation++; epoch++; reviewing = false; review = null;
                if (!retryCommand) { showReview(null); if (!saving) setFeedback(''); }
                update();
            };
            for (const task of records) {
                const row = el('li'), label = el('label'), checkbox = el('input', css('checkbox')); checkbox.type = 'checkbox'; checkbox.checked = false;
                checkbox.addEventListener('change', event => {
                    if (!owns() || !available() || composing || saving || this.controller.pending) { checkbox.checked = selected.has(task.id); return; }
                    if (event.isComposing || event.keyCode === 229) { checkbox.checked = selected.has(task.id); return; }
                    if (checkbox.checked) selected.add(task.id); else selected.delete(task.id); changed();
                });
                choices.push(checkbox); label.append(checkbox, el('span', 'tasks-recovery-text', task.text));
                label.append(el('p', 'tasks-help tasks-restore-destination', message(task.removedFrom === 'active' ? 'ToActive' : 'ToDone'))); row.append(label); selection.append(row);
            }
            const select = value => {
                if (!owns() || !available() || composing || saving || this.controller.pending) return;
                selected.clear(); records.forEach((task, index) => { choices[index].checked = value; if (value) selected.add(task.id); }); changed();
            };
            const all = button('tasksRestoreSelectAll', event => { if (activation(event)) select(true); }, css('select-all'));
            const clear = button('tasksRestoreClear', event => { if (activation(event)) select(false); }, css('clear'));
            const prepare = async () => {
                if (!owns() || !available() || composing || saving || this.controller.pending || retryCommand || !selected.size) return;
                if (reviewing || !sourceCurrent()) { setFeedback(message('Changed')); return; }
                const ticket = ++epoch, submittedGeneration = generation;
                const targets = records.filter(task => selected.has(task.id)).map(({ id, version, removedFrom }) => ({ id, version, removedFrom }));
                reviewing = true; review = null; showReview(null); setFeedback(t('tasksLoading')); update();
                try {
                    const value = await this.controller.store.reviewRestoration(targets);
                    if (!owns() || !available() || ticket !== epoch || generation !== submittedGeneration) return;
                    if ((this.controller.state?.revision !== value.revision || !sourceCurrent())) { setFeedback(message('Changed')); return; }
                    review = value; showReview(value); setFeedback(message('Ready'));
                } catch (error) { if (owns() && ticket === epoch) setFeedback(errorText(error), true); }
                finally { if (owns() && ticket === epoch) { reviewing = false; update(); } }
            };
            const submit = async (retryPrevious = false) => {
                if (!owns() || !available() || composing || saving || this.controller.pending) return;
                if (retryPrevious) { if (!retryCommand) return; }
                else {
                    if (!review || retryCommand) return;
                    if ((this.controller.state?.revision !== review.revision || !sourceCurrent())) { update(); return; }
                    attempt = Object.freeze({ command: review.command, review, generation });
                    this.restorationAttempt = Object.freeze({ command: review.command, review, source });
                }
                const submitted = attempt, command = submitted.command;
                saving = true; setFeedback(t('tasksSaving')); update();
                await this.perform(command, state => {
                    if (this.restorationAttempt?.command === command) this.restorationAttempt = null;
                    if (!owns()) return;
                    retryCommand = null; attempt = null; review = null; showReview(null);
                    if (available() && generation === submitted.generation && this.controller.state?.revision === state.revision &&
                        this.controller.state?.receipts.at(-1) === command.operationId) modal.close();
                    else setFeedback(message('Saved'));
                }, error => {
                    if (!owns()) return;
                    review = null;
                    if (['READ', 'WRITE', 'VERIFY'].includes(error.code)) {
                        retryCommand = command; showReview(submitted.review);
                        setFeedback(`${errorText(error)} ${message('Uncertain')}`, true);
                    } else {
                        retryCommand = null; attempt = null; showReview(null);
                        if (this.restorationAttempt?.command === command) this.restorationAttempt = null;
                        this.controller.dismissRetry(command.operationId); setFeedback(errorText(error), true);
                    }
                });
                saving = false; if (owns()) update();
            };
            const reviewButton = button('tasksRestoreReview', event => { if (activation(event)) prepare(); }, css('review'));
            const confirm = button('tasksRestoreConfirm', event => { if (activation(event)) submit(); }, `tasks-primary ${css('confirm')}`);
            const retry = button('tasksRestoreRetry', event => { if (activation(event)) submit(true); }, `tasks-primary ${css('retry')}`);
            for (const node of [all, clear, reviewButton, confirm, retry]) node.addEventListener('keydown', event => {
                if ((event.repeat || event.isComposing || event.keyCode === 229) && ['Enter', ' '].includes(event.key)) event.preventDefault();
            });
            const selectionActions = el('div', 'tasks-dialog-actions'); selectionActions.append(all, clear);
            const actions = el('div', 'tasks-dialog-actions'); actions.append(cancel, reviewButton, retry, confirm);
            modal.panel.append(el('p', 'tasks-help', message('Help')), el('p', 'tasks-help', message('HistoryHelp')), selectionActions, selection, count, preview, feedback, actions);
            modal.panel.addEventListener('compositionstart', () => { composing = true; changed(); });
            modal.panel.addEventListener('compositionend', () => { composing = false; update(); });
            const sourceCurrent = () => {
                const latest = this.removedRestoreSource;
                // Unrelated writes may replace DOM rows without changing these
                // originals. Require an explicit new review, never substitute text,
                // destinations, membership, order, filter or workspace ownership.
                if (source !== latest && latest?.valid && latest.filter === initialSource.filter &&
                    this.restorationWorkspaceCurrent(initialSource) && latest.snapshot.length === records.length &&
                    records.every((task, index) => ['id', 'version', 'text', 'state', 'removedFrom'].every(key => latest.snapshot[index][key] === task[key]))) {
                    const notify = source.changed; source.changed = null; source = latest; source.changed = notify;
                }
                return this.removedRestorationCurrent(source, origin, modal);
            };
            const activation = event => !event.defaultPrevented && !(event.detail > 1) && !event.repeat && !event.isComposing && event.keyCode !== 229;
            source.changed = () => { if (owns() && !saving && !retryCommand) { epoch++; reviewing = false; review = null; showReview(null); setFeedback(message('Changed')); update(); } };
            unsubscribe = this.controller.subscribe(update);
            source.drain();
            const backgroundNode = Array.from(document.body.children).find(node => node.contains(this.host));
            if (root.LocalItabDialog && backgroundNode && !backgroundNode.inert) {
                this.restorationBackground = { modal, node: backgroundNode, initialInert: false, expected: true };
            }
            modal.open(all); source.drain(); dialogOwner.opened = true;
            if (this.restorationBackground?.modal === modal) this.restorationBackground.expected = null;
            document.addEventListener('focusin', moved, true); document.addEventListener('visibilitychange', departed, true);
            root.addEventListener?.('blur', departed); root.addEventListener?.('pagehide', departed);
            update(); this.render();
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
        copyReady() {
            const c = this.controller, workspace = c.store.backend?.workspace;
            return !this.destroyed && !c.closed && !!c.state && !c.pending && !c.error &&
                !['loading', 'saving', 'error'].includes(c.status) && !this.dialogs.size && !this.pendingReview &&
                !root.LocalItabContentLifecycle?.departing && !workspace?.invalidated && !workspace?._suspended;
        }
        copyOriginCurrent(origin) {
            if (!this.copyReady() || !origin.isConnected || !this.host.contains(origin) ||
                document.hidden || document.visibilityState === 'hidden' || origin.closest('[hidden], [inert]') ||
                !origin.getClientRects().length || ['hidden', 'collapse'].includes(root.getComputedStyle?.(origin).visibility)) return false;
            // Closed details descendants can still report layout boxes in Chromium.
            for (let node = origin.parentElement; node; node = node.parentElement) if (node.tagName === 'DETAILS' && !node.open) return false;
            return true;
        }
        copyCurrent(task, item, title, origin) {
            if (!this.copyOriginCurrent(origin) || !item.contains(origin) || item.dataset.taskId !== task.id ||
                title.textContent !== task.text || this.renderedRevision !== this.controller.state.revision) return false;
            const current = this.controller.state.records.find(record => record.id === task.id);
            return current?.version === task.version && current.text === task.text && current.state === task.state;
        }
        copyVisibleCurrent(snapshot, origin) {
            if (!snapshot.length || this.visibleTasks !== snapshot || !this.copyOriginCurrent(origin) ||
                this.renderedFilter !== this.filterQuery || this.renderedRevision !== this.controller.state.revision) return false;
            const matched = this.controller.state.records.filter(task => task.state === 'active' && task.text.toLowerCase().includes(this.filterQuery));
            const expected = this.filterQuery || this.expanded ? matched : matched.slice(0, 4);
            const rows = Array.from(this.list.children);
            return expected.length === snapshot.length && rows.length === snapshot.length && snapshot.every((task, index) => {
                const item = rows[index], title = item.querySelector('.tasks-text');
                return task.state === 'active' && expected[index].id === task.id && title && this.copyCurrent(task, item, title, item);
            });
        }
        completedVisibleCurrent(snapshot, origin) {
            if (!this.completed.box.open || !snapshot.length || this.visibleCompletedTasks !== snapshot || !this.copyOriginCurrent(origin) ||
                this.renderedFilter !== this.filterQuery || this.renderedRevision !== this.controller.state.revision) return false;
            const expected = this.controller.state.records.filter(task => task.state === 'done' && task.text.toLowerCase().includes(this.filterQuery));
            const rows = Array.from(this.completed.list.children);
            return expected.length === snapshot.length && rows.length === snapshot.length && snapshot.every((task, index) => {
                const item = rows[index], title = item.querySelector('.tasks-text');
                return task.state === 'done' && expected[index].id === task.id && title && this.copyCurrent(task, item, title, item);
            });
        }
        removedVisibleCurrent(snapshot, origin, source) {
            const owner = this.removedCopyOwner;
            if (!source || source !== this.removedCopySource || !snapshot.length || this.visibleRemovedTasks !== snapshot ||
                this.removed !== owner.section || this.removed.box !== owner.box || this.removed.summary !== owner.summary || this.removed.list !== owner.list ||
                this.copyRemovedButton !== owner.origin || origin !== owner.origin || origin.disabled || this.copyRemovedStatus !== owner.status || !owner.box.open ||
                [owner.box, owner.summary, owner.controls, origin, owner.status, owner.list].some(node => node.ownerDocument !== document) ||
                owner.box.parentElement !== this.host || owner.summary.parentElement !== owner.box || owner.controls.parentElement !== owner.box ||
                origin.parentElement !== owner.controls || owner.status.parentElement !== owner.controls || owner.list.parentElement !== owner.box ||
                !this.copyOriginCurrent(origin) || !this.copyOriginCurrent(owner.list) ||
                this.renderedFilter !== this.filterQuery || this.renderedRevision !== this.controller.state.revision) return false;
            const expected = this.controller.state.records.filter(task => task.state === 'removed' && task.text.toLowerCase().includes(this.filterQuery));
            const rows = Array.from(owner.list.children);
            return expected.length === snapshot.length && rows.length === snapshot.length && snapshot.every((task, index) => {
                const item = rows[index], title = item.querySelector('.tasks-text');
                return item === source.rows[index] && title === source.titles[index] && item.parentElement === owner.list && item.ownerDocument === document && title?.ownerDocument === document &&
                    task.state === 'removed' && expected[index].id === task.id && expected[index].removedFrom === task.removedFrom &&
                    title && this.copyOriginCurrent(title) && this.copyCurrent(task, item, title, item);
            });
        }
        copyVisibleTasks() {
            const snapshot = this.visibleTasks, origin = this.copyVisibleButton;
            return this.copyText(snapshot.map((task, index) => `${index + 1}. ${task.text}`).join('\n'), origin, this.copyVisibleStatus,
                () => this.copyVisibleCurrent(snapshot, origin), ['tasksCopyVisiblePending', 'tasksCopyVisibleSuccess', 'tasksCopyVisibleFailure'], this.list);
        }
        copyCompletedTasks() {
            const snapshot = this.visibleCompletedTasks, origin = this.copyCompletedButton;
            return this.copyText(snapshot.map((task, index) => `${index + 1}. ${task.text}`).join('\n'), origin, this.copyCompletedStatus,
                () => this.completedVisibleCurrent(snapshot, origin), ['tasksCopyCompletedPending', 'tasksCopyCompletedSuccess', 'tasksCopyCompletedFailure'], this.completed.list);
        }
        copyRemovedTasks(origin) {
            const snapshot = this.visibleRemovedTasks, source = this.removedCopySource;
            return this.copyText(snapshot.map((task, index) => `${index + 1}. ${task.text}`).join('\n'), origin, this.copyRemovedStatus,
                () => this.removedVisibleCurrent(snapshot, origin, source), ['tasksCopyRemovedPending', 'tasksCopyRemovedSuccess', 'tasksCopyRemovedFailure'], this.removedCopyOwner.list);
        }
        refreshCopyControls() {
            const disabled = !!this.copyAttempt || !this.copyReady();
            // Keep the focused native button in place; the click guard enforces this state.
            this.host.querySelectorAll('.tasks-copy-text').forEach(node => node.setAttribute('aria-disabled', String(disabled)));
            this.copyVisibleButton.textContent = t('tasksCopyVisible').replace('{count}', this.visibleTasks.length);
            this.copyVisibleButton.disabled = !this.visibleTasks.length;
            this.copyVisibleButton.setAttribute('aria-disabled', String(disabled || this.copyVisibleButton.disabled));
            this.copyCompletedButton.textContent = t('tasksCopyCompleted').replace('{count}', this.visibleCompletedTasks.length);
            this.copyCompletedButton.disabled = !this.visibleCompletedTasks.length;
            this.copyCompletedButton.setAttribute('aria-disabled', String(disabled || !this.completed.box.open || this.copyCompletedButton.disabled));
            this.copyRemovedButton.textContent = t('tasksCopyRemoved').replace('{count}', this.visibleRemovedTasks.length);
            this.copyRemovedButton.disabled = !this.visibleRemovedTasks.length;
            this.copyRemovedButton.setAttribute('aria-disabled', String(disabled || !this.removed.box.open || this.copyRemovedButton.disabled));
            // Match existing focus-preserving row actions while unavailable.
            this.completeBatchButton.setAttribute('aria-disabled', String(!this.copyReady() || !this.visibleTasks.length));
            this.reopenBatchButton.setAttribute('aria-disabled', String(!this.copyReady() || !this.completed.box.open || !this.visibleCompletedTasks.length));
            if (this.restoreBatchButton.disabled !== !this.visibleRemovedTasks.length) this.restoreBatchButton.disabled = !this.visibleRemovedTasks.length;
            this.restoreBatchButton.setAttribute('aria-disabled', String(!this.copyReady() || !!this.localError || !!this.controller.retryCommand || !this.removed.box.open || this.restoreBatchButton.disabled));
            this.host.querySelectorAll('.tasks-reuse-text').forEach(node => node.setAttribute('aria-disabled', String(!this.copyReady() || !!this.localError)));
        }
        invalidateCopy() {
            const attempt = this.copyAttempt;
            if (!attempt) return;
            attempt.valid = false; attempt.cleanup?.();
            attempt.status.textContent = ''; attempt.status.hidden = true;
            // Do not release the lock: an already invoked system write cannot be cancelled.
        }
        copyTask(task, item, title, origin, status) {
            return this.copyText(task.text, origin, status, () => this.copyCurrent(task, item, title, origin));
        }
        async copyText(text, origin, status, isCurrent, messages = ['tasksCopying', 'tasksCopySuccess', 'tasksCopyFailure'], content = null) {
            if (this.copyAttempt || !isCurrent()) return;
            const state = this.controller.state, workspace = this.controller.store.backend?.workspace;
            const attempt = { valid: true, status }; this.copyAttempt = attempt;
            const cancel = () => this.invalidateCopy();
            // Remember even a brief hide/detach/closed menu before the promise settles.
            const targets = content ? [origin, content] : [origin];
            const invalidating = records => records.some(record => content?.contains(record.target) || (record.type === 'attributes'
                ? targets.some(target => record.target.contains(target))
                : Array.from(record.removedNodes || []).some(node => targets.some(target => node === target || node.contains?.(target)))));
            const observer = root.MutationObserver ? new root.MutationObserver(records => { if (invalidating(records)) cancel(); }) : null;
            attempt.cleanup = () => {
                observer?.disconnect(); document.removeEventListener('visibilitychange', cancel, true);
                root.removeEventListener?.('blur', cancel); root.removeEventListener?.('pagehide', cancel);
            };
            const current = () => {
                if (observer && invalidating(observer.takeRecords())) cancel();
                return attempt.valid && this.copyAttempt === attempt && this.controller.state === state &&
                    this.controller.store.backend?.workspace === workspace && isCurrent();
            };
            document.addEventListener('visibilitychange', cancel, true);
            root.addEventListener?.('blur', cancel); root.addEventListener?.('pagehide', cancel);
            observer?.observe(document.documentElement, { subtree: true, childList: true, characterData: !!content, attributes: true, attributeFilter: ['hidden', 'inert', 'style', 'class', 'open'] });
            status.textContent = t(messages[0]); status.hidden = false; status.classList.remove('is-error'); this.refreshCopyControls();
            try {
                // No awaited storage/permission work before this user-activated call.
                if (!this.clipboard?.writeText) throw new Error('Clipboard unavailable');
                await this.clipboard.writeText(text);
                if (current()) status.textContent = t(messages[1]);
            } catch (_) {
                if (current()) { status.textContent = t(messages[2]); status.classList.add('is-error'); }
            } finally {
                if (!current()) cancel();
                attempt.cleanup();
                if (this.copyAttempt === attempt) this.copyAttempt = null;
                if (!this.destroyed) this.refreshCopyControls();
            }
        }
        reuseTask(task, item, title, origin) {
            if (this.localError || !this.copyCurrent(task, item, title, origin)) return;
            const sourceText = task.text, workspace = this.controller.store.backend?.workspace;
            let unsubscribe = () => {}, generation = 0, edited = false, composing = false, compositionEpoch = 0;
            let saving = false, attempt = null, retryCommand = null, focusDeparted = false;
            const moved = event => { focusDeparted = !modal.panel.contains(event.target); };
            const departed = () => { focusDeparted = true; };
            const modal = this.createDialog(t('tasksReuseText'), () => {
                compositionEpoch++; unsubscribe();
                document.removeEventListener('focusin', moved, true);
                document.removeEventListener('visibilitychange', departed, true);
                root.removeEventListener?.('blur', departed); root.removeEventListener?.('pagehide', departed);
                if (this.reuseSession === modal) this.reuseSession = null;
                if (attempt) this.controller.dismissRetry(attempt.command.operationId); this.render();
            });
            if (!modal) return;
            this.reuseSession = modal;
            const input = el('textarea', 'tasks-editor tasks-reuse-editor'); input.rows = 4; input.value = sourceText;
            input.setAttribute('aria-label', t('tasksReuseText'));
            const hint = el('p', 'tasks-help', `${t('tasksReuseHelp')} ${t('tasksTextLimit')}`);
            hint.id = `tasks-reuse-help-${crypto.randomUUID()}`; input.setAttribute('aria-describedby', hint.id);
            const previous = el('section', 'tasks-reuse-previous'); previous.hidden = true;
            const previousText = el('p', 'tasks-latest'); previous.append(el('h3', '', t('tasksReusePrevious')), previousText);
            const feedback = el('p', 'tasks-dialog-feedback tasks-batch-feedback'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
            const setFeedback = (text, error = false) => { feedback.textContent = text; feedback.classList.toggle('is-error', error); };
            const owns = () => !this.destroyed && modal.isOpen && this.reuseSession === modal && input.isConnected;
            const available = () => !this.controller.closed && !!this.controller.state &&
                !root.LocalItabContentLifecycle?.departing && this.controller.store.backend?.workspace === workspace &&
                !workspace?.invalidated && !workspace?._suspended;
            // Native textarea.value normalizes CRLF/CR to LF. Until an actual
            // input event, submit the saved snapshot, including its original breaks.
            const currentText = () => edited ? input.value : sourceText;
            const originalClose = modal.close;
            modal.close = () => {
                const restore = owns() && !focusDeparted && available() && !document.hidden && document.visibilityState !== 'hidden' &&
                    (modal.panel.contains(document.activeElement) || document.activeElement === document.body);
                originalClose(false);
                if (!restore || this.destroyed || this.dialogs.size || document.activeElement !== document.body) return;
                const current = Array.from(this.host.querySelectorAll('[data-task-id]')).find(node => node.dataset.taskId === task.id);
                const target = current?.querySelector('.tasks-reuse-text');
                const visible = node => {
                    if (!node?.isConnected || node.disabled || node.closest('[hidden], [inert]') || !node.getClientRects().length ||
                        ['hidden', 'collapse'].includes(root.getComputedStyle?.(node).visibility)) return false;
                    for (let parent = node.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS' && !parent.open) return false;
                    return true;
                };
                if (visible(target)) target.focus(); else if (visible(this.input)) this.input.focus();
            };
            const setControl = (node, disabled, hidden = false) => {
                if (document.activeElement === node && (disabled || hidden)) input.focus();
                node.disabled = disabled; node.hidden = hidden;
            };
            const update = () => {
                if (!owns()) return;
                const blocked = saving || !!this.controller.pending || composing || !available();
                setControl(add, blocked || !!retryCommand);
                setControl(retry, blocked, !retryCommand);
                previous.hidden = !retryCommand;
                previousText.textContent = retryCommand ? retryCommand.text : '';
                if (!available()) setFeedback(t('tasksErrorUnavailable'), true);
            };
            const submit = async (retryPrevious = false) => {
                if (!owns() || !available() || saving || this.controller.pending || composing) return;
                if (retryPrevious) { if (!retryCommand) return; }
                else {
                    if (retryCommand) return;
                    attempt = { command: this.controller.store.request('add', { text: currentText() }), generation, text: currentText() };
                }
                const submitted = attempt, command = submitted.command;
                saving = true; this.reuseOperationId = command.operationId; setFeedback(t('tasksSaving')); update();
                try {
                    const state = await this.controller.run(command);
                    if (!owns()) return;
                    retryCommand = null; attempt = null;
                    // Only this opening's unchanged draft and current confirmed
                    // receipt may close. A new IME, ABA edit or later state owns itself.
                    if (available() && !composing && generation === submitted.generation && currentText() === submitted.text &&
                        this.controller.state?.revision === state.revision && !this.controller.pending &&
                        (!this.controller.retryCommand || this.controller.retryCommand.operationId === command.operationId) &&
                        state.receipts.at(-1) === command.operationId) modal.close();
                    else setFeedback(t('tasksReuseDraftRemains'));
                } catch (error) {
                    if (!owns()) { this.controller.dismissRetry(command.operationId); return; }
                    if (['READ', 'WRITE', 'VERIFY'].includes(error.code)) {
                        // Input changes never abandon an uncertain operation or
                        // change its text. Retry is a separate explicit action.
                        retryCommand = command; setFeedback(`${errorText(error)} ${t('tasksReuseUncertain')}`, true);
                    } else {
                        retryCommand = null; attempt = null;
                        this.controller.dismissRetry(command.operationId); setFeedback(errorText(error), true);
                    }
                } finally {
                    saving = false;
                    if (!owns()) this.controller.dismissRetry(command.operationId);
                    if (this.reuseOperationId === command.operationId) this.reuseOperationId = null;
                    if (owns()) update();
                    if (!this.destroyed) this.render();
                }
            };
            const add = button('tasksAdd', event => { if (!(event.detail > 1)) submit(); }, 'tasks-primary');
            const retry = button('tasksReuseRetry', event => { if (!(event.detail > 1)) submit(true); }, 'tasks-primary');
            for (const node of [add, retry]) node.addEventListener('keydown', event => {
                if (['Enter', ' '].includes(event.key) && (event.repeat || event.isComposing || event.keyCode === 229 || composing)) event.preventDefault();
            });
            const changed = event => {
                generation++; edited = true;
                if (event.isComposing) { composing = true; compositionEpoch++; }
                if (!saving && !retryCommand) setFeedback(''); update();
            };
            const blur = () => {
                if (!composing) return;
                const epoch = compositionEpoch;
                // Blur can precede the final IME input. Release a cancelled
                // composition next turn if compositionend never arrives.
                setTimeout(() => {
                    if (!owns() || epoch !== compositionEpoch || document.activeElement === input) return;
                    compositionEpoch++; composing = false; update();
                }, 0);
            };
            input.addEventListener('input', event => { changed(event); if (composing && document.activeElement !== input) blur(); });
            input.addEventListener('compositionstart', () => { generation++; compositionEpoch++; composing = true; update(); });
            input.addEventListener('compositionend', () => { compositionEpoch++; composing = false; update(); });
            input.addEventListener('focusout', blur);
            const actions = el('div', 'tasks-dialog-actions'); actions.append(button('tasksCancel', () => modal.close()), retry, add);
            modal.panel.append(input, hint, previous, feedback, actions);
            unsubscribe = this.controller.subscribe(update); modal.open(input);
            document.addEventListener('focusin', moved, true);
            document.addEventListener('visibilitychange', departed, true);
            root.addEventListener?.('blur', departed); root.addEventListener?.('pagehide', departed);
            update(); this.render();
        }
        moveFirstSourceCurrent(owner) {
            const c = owner.controller, workspace = owner.backend?.workspace ?? null;
            return this.moveFirstOwner === owner && this.host === owner.host && this.list === owner.list &&
                this.controller === c && c.store === owner.store && c.store.backend === owner.backend && !c.closed &&
                workspace === owner.workspace && workspace?.id === owner.workspaceId && workspace?.generation === owner.workspaceGeneration &&
                !workspace?.invalidated && !workspace?._suspended && (root.LocalItabWorkspaces?.session ?? null) === owner.session &&
                // Older backends may expose only an availability object, without
                // a workspace service. Its original identity still cannot change.
                (!workspace || owner.session === workspace || (owner.legacyAvailability && root.LocalItabWorkspaces == null));
        }
        moveFirstCurrent(source) {
            const owner = source.owner;
            // Recheck page/filter DOM state before the final non-layout source checks.
            if (document.hidden || document.visibilityState === 'hidden' || owner.filterInput.value.trim() || this.filterInput !== owner.filterInput) return false;
            if (!this.moveFirstSourceCurrent(owner)) return false;
            const c = owner.controller;
            const reviewedConflict = c.error?.code === 'CONFLICT' && !!c.retryCommand && source.conflictCommand === c.retryCommand;
            if (this.destroyed || c.pending || (c.error && !reviewedConflict) || (c.retryCommand && !reviewedConflict) || this.localError ||
                ['loading', 'saving'].includes(c.status) || (c.status === 'error' && !reviewedConflict) ||
                this.filterQuery || this.filterComposing || this.dialogs.size || this.pendingReview ||
                this.batchSession || this.reuseSession || this.completionSession || this.restorationSession ||
                root.LocalItabContentLifecycle?.departing || this.moveLastGeneration !== source.generation) return false;
            // Read the current saved state after page/filter and any layout inspection.
            const state = c.state, current = state?.records.find(record => record.id === source.snapshot.id);
            return !!current && current.state === 'active' && source.order[0] !== source.snapshot.id &&
                Object.keys(source.snapshot).every(key => current[key] === source.snapshot[key]) &&
                JSON.stringify(state.records.filter(record => record.state === 'active').map(record => record.id)) === JSON.stringify(source.order);
        }
        moveFirstVisible(source) {
            const { owner, item, title, actions, menu, summary, first } = source;
            if (this.filterInput.value.trim() || document.hidden || document.visibilityState === 'hidden' ||
                first.disabled || first.getAttribute('disabled') != null || first.getAttribute('aria-disabled') === 'true' ||
                !first.isConnected || item.dataset.taskId !== source.snapshot.id || item.parentElement !== owner.list ||
                Array.from(owner.list.children).find(node => node.dataset.taskId === source.snapshot.id) !== item ||
                item.querySelector('.tasks-text') !== title || title.textContent !== source.snapshot.text || title.children.length ||
                item.querySelector('.tasks-row-actions') !== actions || item.querySelector('.tasks-row-menu') !== menu ||
                menu.querySelector('summary') !== summary || !actions.contains(first) ||
                [...owner.chain, ...source.chain].some(([node, parent]) => node.ownerDocument !== document || node.parentElement !== parent)) return false;
            for (const displayed of [first, title]) {
                if (!displayed.getClientRects().length) return false;
                for (let node = displayed; node; node = node.parentElement) {
                    const style = root.getComputedStyle?.(node);
                    if (node.hidden || node.inert || node.disabled || node.getAttribute('aria-hidden') === 'true' ||
                        node.style.display === 'none' || ['hidden', 'collapse'].includes(node.style.visibility) ||
                        style?.display === 'none' || ['hidden', 'collapse'].includes(style?.visibility) ||
                        (node.tagName === 'DETAILS' && !node.open)) return false;
                }
            }
            return true;
        }
        row(task, index, active) {
            const item = el('li', 'tasks-row'); item.dataset.taskId = task.id;
            let firstSource = null, lastOwner = null;
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
            const copyStatus = el('p', 'tasks-row-copy-status'); copyStatus.hidden = true;
            copyStatus.setAttribute('role', 'status'); copyStatus.setAttribute('aria-live', 'polite');
            const saved = { id: task.id, version: task.version, text: task.text, state: task.state };
            const copy = button('tasksCopyText', () => this.copyTask(saved, item, title, copy, copyStatus), 'tasks-copy-text');
            const reuse = button('tasksReuseText', event => { if (!(event.detail > 1)) this.reuseTask(saved, item, title, reuse); }, 'tasks-reuse-text');
            reuse.addEventListener('keydown', event => { if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault(); });
            actions.append(copy, reuse);
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
                    const source = { owner: this.moveFirstOwner, generation: this.moveLastGeneration, item, title, actions,
                        snapshot: Object.freeze({ ...task }), order: Object.freeze(active.slice()),
                        conflictCommand: this.controller.error?.code === 'CONFLICT' ? this.controller.retryCommand : null, chain: [] };
                    const first = button('tasksMoveFirst', event => {
                        if (event.defaultPrevented || event.detail > 1 || event.repeat || event.isComposing || event.keyCode === 229 ||
                            event.target !== first || (event.currentTarget && event.currentTarget !== first)) return;
                        if (!this.moveFirstCurrent(source) || !this.moveFirstVisible(source) || !this.moveFirstCurrent(source)) return;
                        // No layout or ancestry reads after the final source/state check. Unknown writes
                        // retain their exact Retry; a refreshed conflict row is a new choice.
                        this.perform(source.owner.store.request('moveFirst', { id: source.snapshot.id, version: source.snapshot.version, order: source.order }));
                    });
                    first.addEventListener('keydown', event => {
                        if (['Enter', ' '].includes(event.key) && (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault();
                    });
                    source.first = first; firstSource = source;
                    first.disabled = !!this.filterQuery || index === 0;
                    first.title = t(this.filterQuery ? 'tasksFilterReorder' : 'tasksMoveFirstHelp');
                    const snapshot = Object.freeze({ ...task }), order = Object.freeze(active.slice());
                    const owner = { generation: this.moveLastGeneration, host: this.host, list: this.list,
                        controller: this.controller, store: this.controller.store, workspace: this.controller.store.backend?.workspace,
                        session: root.LocalItabWorkspaces?.session, workspaceId: this.controller.store.backend?.workspace?.id,
                        workspaceGeneration: this.controller.store.backend?.workspace?.generation,
                        conflictCommand: this.controller.error?.code === 'CONFLICT' ? this.controller.retryCommand : null, chain: [] };
                    for (let node = owner.list; node; node = node.parentElement) owner.chain.push([node, node.parentElement]);
                    const last = button('tasksMoveLast', event => {
                        if (event.defaultPrevented || event.detail > 1 || event.repeat || event.isComposing || event.keyCode === 229 ||
                            event.target !== last || (event.currentTarget && event.currentTarget !== last)) return;
                        const state = this.controller.state;
                        // A refreshed conflict row is a new explicit choice. Keep
                        // uncertain writes blocked, and never replay the old command.
                        const reviewedConflict = this.controller.error?.code === 'CONFLICT' && !!this.controller.retryCommand &&
                            owner.conflictCommand === this.controller.retryCommand;
                        if (last.disabled || last.getAttribute('disabled') != null || last.getAttribute('aria-disabled') === 'true' ||
                            this.filterQuery || this.filterInput.value.trim() || this.filterComposing || this.destroyed ||
                            this.controller !== owner.controller || this.controller.store !== owner.store || this.controller.closed ||
                            this.controller.pending || (this.controller.error && !reviewedConflict) || this.localError || (this.controller.retryCommand && !reviewedConflict) ||
                            ['loading', 'saving'].includes(this.controller.status) || (this.controller.status === 'error' && !reviewedConflict) || this.dialogs.size || this.pendingReview ||
                            this.batchSession || this.reuseSession || this.completionSession || root.LocalItabContentLifecycle?.departing ||
                            owner.store.backend?.workspace !== owner.workspace || owner.workspace?.invalidated || owner.workspace?._suspended ||
                            owner.workspace?.id !== owner.workspaceId || owner.workspace?.generation !== owner.workspaceGeneration ||
                            root.LocalItabWorkspaces?.session !== owner.session || (owner.workspace && root.LocalItabWorkspaces?.session !== owner.workspace) || document.hidden || document.visibilityState === 'hidden' ||
                            this.moveLastGeneration !== owner.generation || this.host !== owner.host || this.list !== owner.list ||
                            item.dataset.taskId !== snapshot.id || !last.isConnected || item.parentElement !== owner.list ||
                            Array.from(owner.list.children).find(node => node.dataset.taskId === snapshot.id) !== item ||
                            item.querySelector('.tasks-text') !== title || title.textContent !== snapshot.text || title.children.length ||
                            item.querySelector('.tasks-row-actions') !== actions || item.querySelector('.tasks-row-menu') !== owner.menu ||
                            owner.menu.querySelector('summary') !== owner.summary || actions.querySelector('.tasks-move-last') !== last ||
                            owner.chain.some(([node, parent]) => node.ownerDocument !== document || node.parentElement !== parent)) return;
                        // The displayed source and the control must both remain
                        // visible; hiding only the title/top cannot authorize a move.
                        for (const source of [last, title]) {
                            if (!source.getClientRects().length) return;
                            for (let node = source; node; node = node.parentElement) {
                                const style = root.getComputedStyle?.(node);
                                if (node.hidden || node.inert || node.disabled || node.getAttribute('aria-hidden') === 'true' ||
                                    node.style.display === 'none' || ['hidden', 'collapse'].includes(node.style.visibility) ||
                                    style?.display === 'none' || ['hidden', 'collapse'].includes(style?.visibility) ||
                                    (node.tagName === 'DETAILS' && !node.open)) return;
                            }
                        }
                        const current = state?.records.find(record => record.id === snapshot.id);
                        if (!current || Object.keys(snapshot).some(key => current[key] !== snapshot[key]) || current.state !== 'active' ||
                            JSON.stringify(state.records.filter(record => record.state === 'active').map(record => record.id)) !== JSON.stringify(order) ||
                            order.at(-1) === snapshot.id) return;
                        // This source is an independent saved task. Quick-entry IME
                        // state and drafts remain owned by the quick-entry field.
                        this.perform(owner.store.request('moveLast', { id: snapshot.id, version: snapshot.version, order }));
                    }, 'tasks-move-last');
                    last.addEventListener('keydown', event => {
                        if (['Enter', ' '].includes(event.key) && (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault();
                    });
                    last.disabled = !!this.filterQuery || index === active.length - 1;
                    last.title = t(this.filterQuery ? 'tasksFilterReorder' : 'tasksMoveLastHelp');
                    lastOwner = { owner, last };
                    actions.append(up, down, first, last);
                }
                const edit = button('tasksEdit', () => this.edit(task, edit));
                actions.append(edit, button('tasksRemove', () => {
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
                if (firstSource) {
                    firstSource.menu = menu; firstSource.summary = summary;
                    firstSource.chain.push([firstSource.first, actions], [actions, menu], [menu, item], [summary, menu],
                        [title, top], [top, item], [item, firstSource.owner.list]);
                }
                if (lastOwner) {
                    const { owner, last } = lastOwner; owner.menu = menu; owner.summary = summary;
                    owner.chain.push([last, actions], [actions, menu], [menu, item], [summary, menu], [title, top], [top, item], [item, owner.list]);
                }
            }
            top.querySelectorAll('button').forEach(node => { node.setAttribute('aria-disabled', String(!!this.controller.pending)); node.dataset.taskAction = node.textContent; });
            item.append(copyStatus); return item;
        }
        render() {
            if (this.destroyed) return;
            this.invalidateCopy();
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
            const ownsPendingReuse = busy && this.controller.retryCommand?.kind === 'add' &&
                this.controller.retryCommand.operationId === this.reuseOperationId;
            const ownsCompletionAttempt = ['completeBatch', 'reopenBatch', 'restoreBatch'].includes(this.controller.retryCommand?.kind) &&
                this.controller.retryCommand.operationId === this.retryEffectOperationId &&
                (busy || ['READ', 'WRITE', 'VERIFY'].includes(this.controller.error?.code));
            const visible = !!this.completionSession || !!this.restorationSession || ownsCompletionAttempt || this.alwaysVisible || state?.enabled === true || showReadError || !!this.reuseSession || ownsPendingReuse || this.quickEntryComposing || this.quickEntryCompositionSettling || this.input.value.length > 0 || ownsPendingAdd || !!this.batchSession || ownsPendingBatch;
            this.host.hidden = !visible;
            this.onVisibility(visible);
            this.addButton.disabled = busy || !state || this.quickEntryComposing; this.batchButton.disabled = busy || !state;
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
                this.visibleTasks = visible.map(({ id, version, text, state }) => ({ id, version, text, state }));
                // Move-to-start and Move-to-end share this render ownership fence;
                // old row callbacks cannot revive after their nodes are reattached.
                this.moveLastGeneration = (this.moveLastGeneration || 0) + 1;
                this.list.replaceChildren(...visible.map(task => this.row(task, ids.indexOf(task.id), ids)));
                if (!active.length && !filtering) this.list.append(el('li', 'tasks-empty', t('tasksEmpty')));
                this.more.hidden = filtering || active.length <= 4; this.more.textContent = t(this.expanded ? 'tasksLess' : 'tasksMore'); this.more.setAttribute('aria-expanded', String(this.expanded));
                for (const section of [this.completed, this.removed]) {
                    const records = state.records.filter(task => task.state === (section === this.completed ? 'done' : 'removed') && matches(task));
                    section.summary.textContent = `${t(section.key)} (${records.length})`; section.box.hidden = !records.length;
                    section.list.replaceChildren(...records.map(task => this.row(task, -1, ids)));
                    if (section === this.completed) this.visibleCompletedTasks = records.map(({ id, version, text, state }) => ({ id, version, text, state }));
                    else {
                        this.visibleRemovedTasks = records.map(({ id, version, text, state, removedFrom }) => ({ id, version, text, state, removedFrom }));
                        this.removedCopySource = { rows: Array.from(section.list.children), titles: Array.from(section.list.children, item => item.querySelector('.tasks-text')) };
                        this.captureRemovedRestoration();
                    }
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
            this.refreshCopyControls();
            this.undoButton.textContent = this.undo?.kind === 'completeBatch' ? t('tasksUndoCompleteBatch').replace('{count}', this.undo.records.length) : t(this.undo?.state === 'done' ? 'tasksUndoComplete' : 'tasksUndo');
            this.undoButton.hidden = !this.undo || (this.undo.kind === 'completeBatch'
                ? !this.undo.records.every(record => state?.records.some(task => task.id === record.id && task.version === record.version && task.state === 'done'))
                : !state?.records.some(t => t.id === this.undo.id && t.version === this.undo.version && t.state === this.undo.state));
            this.undoButton.disabled = busy;
            const error = this.localError || this.controller.error;
            this.status.textContent = error ? errorText(error) : this.controller.status === 'saved' && this.input.value ? t('tasksDraftRemains') : t({ loading: 'tasksLoading', saving: 'tasksSaving', saved: 'tasksSaved', ready: 'tasksReady' }[this.controller.status] || 'tasksReady');
            this.feedback.classList.toggle('is-error', !!error); this.retry.hidden = !error || !['READ', 'WRITE', 'VERIFY'].includes(error.code) || !!this.localError || (!!this.controller.retryCommand && this.controller.retryCommand.operationId !== this.retryEffectOperationId);
            this.retry.disabled = busy;
        }
        rememberUndo(command, saved) {
            if (command.kind === 'completeBatch') {
                const current = this.controller.state;
                if (saved.receipts.at(-1) !== command.operationId || current?.revision !== saved.revision || current.receipts.at(-1) !== command.operationId) return;
                const records = command.targets.map(target => saved.records.find(task => task.id === target.id && task.version === target.nextVersion && task.state === 'done' && task.updatedAt === command.updatedAt));
                if (records.every(record => record && current.records.some(task => Object.keys(record).every(key => task[key] === record[key])))) {
                    this.undo = Object.freeze({ kind: 'completeBatch', records: Object.freeze(records.map(record => Object.freeze({ ...record }))) });
                }
                return;
            }
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
            if (record.kind === 'completeBatch') {
                return this.perform(this.controller.store.request('reopenBatch', { targets: record.records.map(({ id, version }) => ({ id, version })) }), () => {
                    if (this.undo === record) this.undo = null;
                });
            }
            this.perform(this.controller.store.request(record.state === 'done' ? 'reopen' : 'restore', { id: record.id, version: record.version }), () => {
                if (this.undo === record) this.undo = null;
            });
        }
        edit(task, origin = null) {
            let ownedOperationId = null, focusDeparted = false;
            const moved = event => { focusDeparted = !modal.panel.contains(event.target); };
            const departed = () => { focusDeparted = true; };
            const modal = this.createDialog(t('tasksEditTitle'), () => {
                document.removeEventListener('focusin', moved, true);
                document.removeEventListener('visibilitychange', departed, true); root.removeEventListener?.('blur', departed);
                this.controller.dismissRetry(ownedOperationId);
            }); if (!modal) return;
            const input = el('textarea', 'tasks-editor', task.text), hint = el('p', 'tasks-help', t('tasksTextLimit'));
            input.value = task.text; input.setAttribute('aria-label', t('tasksEditTitle')); input.rows = 4;
            const feedback = el('p', 'tasks-dialog-feedback'); feedback.setAttribute('role', 'status');
            const latest = el('p', 'tasks-latest'); latest.hidden = true;
            let baseline = task, generation = 0, open = true, failedCommand = null, pending = false, reviewedLatest = null;
            const changed = () => { generation++; failedCommand = null; };
            input.addEventListener('input', changed);
            // Match quick-entry ownership even before an IME emits changed text.
            input.addEventListener('compositionstart', changed);
            const originalClose = modal.close;
            const owns = () => !this.destroyed && open && modal.isOpen && input.isConnected;
            const close = () => {
                // A revision rebuilds the row. Resolve its current Edit by task identity,
                // but only while this opening still owns focus (including native blur).
                const restore = owns() && !focusDeparted && !document.hidden &&
                    (modal.panel.contains(document.activeElement) || document.activeElement === document.body);
                open = false; originalClose(origin ? false : restore);
                if (!origin || !restore || this.destroyed || this.dialogs.size || !this.host.isConnected || document.activeElement !== document.body) return;
                const item = Array.from(this.host.querySelectorAll('[data-task-id]')).find(node => node.dataset.taskId === task.id);
                const target = item && Array.from(item.querySelectorAll('[data-task-action]')).find(node => node.dataset.taskAction === t('tasksEdit'));
                const visible = node => {
                    if (!node?.isConnected || node.disabled || node.closest('[hidden], [inert]') || !node.getClientRects().length) return false;
                    // Chromium can report layout boxes for closed details descendants.
                    for (let parent = node.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS' && !parent.open) return false;
                    return true;
                };
                if (visible(target)) target.focus(); else if (visible(this.input)) this.input.focus();
            };
            modal.close = close;
            const setControl = (node, disabled, hidden = node.hidden) => {
                if (!owns()) return;
                // Move only this opening's active control before Chrome blurs a
                // disabled/hidden button. Async results never reclaim focus.
                if (document.activeElement === node && (disabled || hidden)) input.focus();
                node.disabled = disabled; node.hidden = hidden;
            };
            // Escape is routed through the shared focus helper; detached input prevents late DOM/focus writes too.
            const save = async (replaceLatest = false) => {
                if (!owns() || pending || this.controller.pending) return;
                if (replaceLatest) {
                    if (!reviewedLatest) { feedback.textContent = t('tasksConflict'); return; }
                    baseline = reviewedLatest; failedCommand = null;
                }
                const text = input.value, submittedGeneration = generation;
                const command = failedCommand || this.controller.store.request('edit', { id: baseline.id, version: baseline.version, text });
                ownedOperationId = command.operationId; pending = true; setControl(saveButton, true); setControl(overwrite, true); feedback.textContent = t('tasksSaving');
                try {
                    const state = await this.controller.run(command);
                    if (!owns()) return;
                    baseline = state.records.find(t => t.id === task.id); failedCommand = null;
                    if (generation === submittedGeneration && input.value === text) close(); else feedback.textContent = t('tasksDraftRemains');
                } catch (error) {
                    if (!owns()) { this.controller.dismissRetry(command.operationId); return; }
                    failedCommand = generation === submittedGeneration && input.value === text ? command : null; feedback.textContent = errorText(error);
                    if (error.code === 'CONFLICT') {
                        failedCommand = null;
                        const fresh = this.controller.state?.records.find(t => t.id === task.id && t.state !== 'removed');
                        reviewedLatest = fresh || null; latest.hidden = !fresh; latest.textContent = fresh ? `${t('tasksLatest')}: ${fresh.text}` : '';
                        setControl(overwrite, pending, !fresh);
                    }
                } finally { pending = false; setControl(saveButton, false); setControl(overwrite, false); }
            };
            const buttons = el('div', 'tasks-dialog-actions');
            const saveButton = button('tasksSave', () => save(), 'tasks-primary'), overwrite = button('tasksOverwrite', () => save(true)); overwrite.hidden = true;
            buttons.append(button('tasksCancel', () => close()), overwrite, saveButton); modal.panel.append(input, hint, latest, feedback, buttons); modal.open(input);
            document.addEventListener('focusin', moved, true);
            document.addEventListener('visibilitychange', departed, true); root.addEventListener?.('blur', departed);
        }
        async export() {
            let source;
            try { source = await this.controller.store.export(); }
            catch (error) {
                this.localError = typeof error?.code === 'string' ? error : api.fault('FILE');
                this.render(); return;
            }
            let url, link;
            try {
                url = URL.createObjectURL(new Blob([source], { type: 'application/json' }));
                link = el('a'); link.href = url; link.download = `local-itab-tasks-${new Date().toISOString().slice(0, 10)}.json`;
                document.body.append(link); link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
                this.localError = null;
            } catch (_) {
                this.localError = api.fault('FILE');
                if (url) URL.revokeObjectURL(url);
            } finally { link?.remove(); }
            this.render();
        }
        async importFile() {
            const generation = ++this.reviewGeneration;
            const file = this.fileInput.files?.[0]; this.fileInput.value = ''; if (!file) return;
            this.pendingReview = true; this.invalidateCopy(); this.refreshCopyControls();
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
            } finally { if (generation === this.reviewGeneration) { this.pendingReview = false; this.refreshCopyControls(); } }
        }
        async reviewRecovery(id) {
            const generation = ++this.reviewGeneration, previousError = this.localError; this.pendingReview = true; this.invalidateCopy(); this.refreshCopyControls();
            try {
                const state = await this.controller.store.read(), copy = state.recovery.find(item => item.id === id);
                if (this.destroyed || generation !== this.reviewGeneration || this.dialogs.size) return;
                if (!copy) throw api.fault('CONFLICT');
                // Retire only feedback that predates this valid preview. A file
                // operation may have reported a newer error while the read waited.
                if (this.localError === previousError) { this.localError = null; this.render(); }
                // Capture the same successful read for both review and confirmation.
                // Later page updates (or a retained read result) cannot rewrite it.
                const revision = state.revision;
                const recoveryPreview = Object.freeze({ pinnedId: copy.content.pinnedId,
                    records: Object.freeze(copy.content.records.map(task => Object.freeze({ ...task }))) });
                this.reviewReplacement({ current: api.counts(state), incoming: api.counts(recoveryPreview), recoveryPreview },
                    () => this.controller.store.request('recover', { id, revision }), 'tasksRestoreTitle');
            } catch (error) {
                if (!this.destroyed && generation === this.reviewGeneration) { this.localError = error; this.render(); }
            } finally { if (generation === this.reviewGeneration) { this.pendingReview = false; this.refreshCopyControls(); } }
        }
        recoveryPreview(content) {
            const details = el('details', 'tasks-recovery-preview'), summary = el('summary', '', t('tasksRecoveryPreview'));
            // Include native disclosure in the shared modal's keyboard focus loop.
            summary.setAttribute('tabindex', '0');
            details.append(summary, el('p', 'tasks-help', t('tasksRecoveryPreviewHelp')));
            if (!content.records.length) { details.append(el('p', 'tasks-empty', t('tasksRecoveryEmpty'))); return details; }
            const list = el('ol', 'tasks-recovery-list');
            list.setAttribute('tabindex', '0'); list.setAttribute('aria-label', t('tasksRecoveryPreview'));
            for (const task of content.records) {
                const row = el('li'), labels = [t({ active: 'tasksActive', done: 'tasksDone', removed: 'tasksDeleted' }[task.state])];
                if (task.state === 'removed') labels.push(t('tasksRecoveryRemovedFrom').replace('{state}', t(task.removedFrom === 'done' ? 'tasksDone' : 'tasksActive')));
                if (task.id === content.pinnedId) labels.push(t('tasksNext'));
                // These are read-only snapshot rows, never live task action rows.
                row.append(el('span', 'tasks-recovery-state', labels.join(' · ')), el('div', 'tasks-recovery-text', task.text)); list.append(row);
            }
            details.append(list); return details;
        }
        reviewReplacement(review, makeCommand, title = 'tasksReviewTitle') {
            let command = null;
            const modal = this.createDialog(t(title), () => this.controller.dismissRetry(command?.operationId)); if (!modal) return;
            const feedback = el('p', 'tasks-dialog-feedback'); feedback.setAttribute('role', 'status');
            const cancel = button('tasksCancel', () => modal.close());
            const confirm = button('tasksReplace', async () => {
                if (this.destroyed || !modal.isOpen || !confirm.isConnected || this.controller.pending) return;
                command ||= makeCommand();
                // Keep keyboard events in this review before disabling its focused
                // confirmation. Async results never reclaim newer focus.
                if (document.activeElement === confirm) cancel.focus();
                confirm.disabled = true; feedback.textContent = t('tasksSaving');
                try { await this.controller.run(command); modal.close(); }
                catch (error) { if (!modal.isOpen) { this.controller.dismissRetry(command.operationId); return; } feedback.textContent = errorText(error); if (error.code === 'CONFLICT') confirm.hidden = true; }
                finally { confirm.disabled = false; }
            }, 'tasks-primary');
            const actions = el('div', 'tasks-dialog-actions'); actions.append(cancel, confirm);
            modal.panel.append(el('p', 'tasks-help', t('tasksReviewHelp')), el('p', '', `${t('tasksCurrent')}: ${summarize(review.current)}`),
                el('p', '', `${t('tasksIncoming')}: ${summarize(review.incoming)}`));
            if (review.recoveryPreview) modal.panel.append(this.recoveryPreview(review.recoveryPreview));
            modal.panel.append(feedback, actions); modal.open(cancel);
        }
        destroy() { this.destroyed = true; this.removedRestoreSource?.observer?.disconnect(); this.invalidateCopy(); this.quickEntryCompositionEpoch++; this.quickEntryComposing = false; this.quickEntryCompositionSettling = false; this.pinnedFocus?.cancel(); this.reviewGeneration++; this.pendingReview = false; this.dialogs.forEach(modal => modal.close()); this.unsubscribe(); this.controller.destroy(); }
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
