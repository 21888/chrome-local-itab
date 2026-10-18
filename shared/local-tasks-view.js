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
    // Private render identity prevents retired Remove rows from regaining authority
    // when old nodes and mutable View references are restored.
    const rowRemoveLifecycles = new WeakMap();
    // Removed-row Restore has its own private, non-revivable render identity.
    const rowRestoreLifecycles = new WeakMap();
    // An editor keeps its construction source independently of mutable View fields
    // and of the rows that may be rebuilt while its draft remains open.
    const editSources = new WeakMap();
    // Rendering and cleanup retain their construction source independently of
    // public fields. Availability is separate: original storage errors still
    // belong on this View, including suspended or invalidated workspaces.
    const viewLifecycles = new WeakMap();
    // Undo records and exact attempts stay private to the source that confirmed them.
    const undoRecords = new WeakMap(), undoAttempts = new WeakMap();
    // Quick entry owns only its exact Add attempt, never a reuse dialog's Add.
    const quickAddAttempts = new WeakMap();
    // Reviewed transitions retain exact commands after their selection popup closes.
    const transitionAttempts = new WeakMap();
    // Removed selection restoration owns its exact reviewed command after close.
    const restorationAttempts = new WeakMap();
    // Ordinary actions retain their exact command and effects on the construction source.
    const genericAttempts = new WeakMap();
    function viewSourceCurrent(view, lifecycle) {
        if (!lifecycle || lifecycle.retired || view.destroyed) return false;
        const source = lifecycle.source;
        if (view.host !== source.host || source.host.ownerDocument !== document) return false;
        const controller = source.controller, workspace = source.backend?.workspace ?? null;
        return view.controller === controller && controller.store === source.store && source.store.backend === source.backend &&
            workspace === source.workspace && workspace?.id === source.workspaceId && workspace?.generation === source.workspaceGeneration &&
            (root.LocalItabWorkspaces?.session ?? null) === source.session;
    }
    class View {
        constructor(host, { controller = new api.Controller(), onVisibility = () => {}, alwaysVisible = false, clipboard = root.navigator?.clipboard } = {}) {
            this.host = host; this.controller = controller; this.clipboard = clipboard; this.copyAttempt = null; this.onVisibility = onVisibility; this.alwaysVisible = alwaysVisible;
            const editWorkspace = controller.store.backend?.workspace ?? null;
            editSources.set(this, Object.freeze({ host, controller, store: controller.store, backend: controller.store.backend,
                workspace: editWorkspace, workspaceId: editWorkspace?.id, workspaceGeneration: editWorkspace?.generation,
                session: root.LocalItabWorkspaces?.session ?? null,
                legacyAvailability: !!editWorkspace && typeof editWorkspace === 'object' && editWorkspace.id == null && editWorkspace.generation == null && root.LocalItabWorkspaces == null }));
            const lifecycle = { source: editSources.get(this), unsubscribe: null, retired: false }; viewLifecycles.set(this, lifecycle);
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
                if (this.controller.retryCommand?.kind === 'completePinned' && (event.defaultPrevented || event.detail > 1 ||
                    event.repeat || event.isComposing || event.keyCode === 229 || event.target !== this.retry ||
                    (event.currentTarget && event.currentTarget !== this.retry))) return;
                this.retryLast();
            });
            this.retry.addEventListener('keydown', event => {
                if (this.controller.retryCommand?.kind === 'completePinned' && ['Enter', ' '].includes(event.key) &&
                    (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault();
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
            // Move-to-end independently owns its construction source before any async row load.
            const lastWorkspace = controller.store.backend?.workspace ?? null, lastChain = [];
            for (let node = this.list; node; node = node.parentElement) lastChain.push([node, node.parentElement]);
            this.moveLastOwner = Object.freeze({ host, list: this.list, filterInput: this.filterInput, controller, store: controller.store, backend: controller.store.backend,
                workspace: lastWorkspace, workspaceId: lastWorkspace?.id, workspaceGeneration: lastWorkspace?.generation,
                legacyAvailability: !!lastWorkspace && typeof lastWorkspace === 'object' && lastWorkspace.id == null && lastWorkspace.generation == null && root.LocalItabWorkspaces == null,
                session: root.LocalItabWorkspaces?.session ?? null, chain: lastChain });
            // One-step movement owns its construction source independently of the end actions.
            const stepWorkspace = controller.store.backend?.workspace ?? null, stepChain = [];
            for (let node = this.list; node; node = node.parentElement) stepChain.push([node, node.parentElement]);
            this.stepMoveOwner = Object.freeze({ host, list: this.list, filterInput: this.filterInput, controller, store: controller.store, backend: controller.store.backend,
                workspace: stepWorkspace, workspaceId: stepWorkspace?.id, workspaceGeneration: stepWorkspace?.generation,
                legacyAvailability: !!stepWorkspace && typeof stepWorkspace === 'object' && stepWorkspace.id == null && stepWorkspace.generation == null && root.LocalItabWorkspaces == null,
                session: root.LocalItabWorkspaces?.session ?? null, chain: stepChain });
            // Pin choices own their mounted source before the first asynchronous row load.
            const pinWorkspace = controller.store.backend?.workspace ?? null, pinChain = [];
            for (let node = this.list; node; node = node.parentElement) pinChain.push([node, node.parentElement]);
            this.pinOwner = Object.freeze({ host, list: this.list, filterInput: this.filterInput, feedback: this.feedback, status: this.status,
                controller, store: controller.store, backend: controller.store.backend,
                workspace: pinWorkspace, workspaceId: pinWorkspace?.id, workspaceGeneration: pinWorkspace?.generation,
                legacyAvailability: !!pinWorkspace && typeof pinWorkspace === 'object' && pinWorkspace.id == null && pinWorkspace.generation == null && root.LocalItabWorkspaces == null,
                session: root.LocalItabWorkspaces?.session ?? null, chain: pinChain });
            // Ordinary completion owns its original mounted source before any asynchronous read.
            const completeWorkspace = controller.store.backend?.workspace ?? null, completeChain = [];
            for (let node = this.list; node; node = node.parentElement) completeChain.push([node, node.parentElement]);
            completeChain.push([this.filterInput, this.filter], [this.filter, host]);
            this.completeOwner = Object.freeze({ host, list: this.list, filter: this.filter, filterInput: this.filterInput,
                controller, store: controller.store, backend: controller.store.backend,
                workspace: completeWorkspace, workspaceId: completeWorkspace?.id, workspaceGeneration: completeWorkspace?.generation,
                legacyAvailability: !!completeWorkspace && typeof completeWorkspace === 'object' && completeWorkspace.id == null && completeWorkspace.generation == null && root.LocalItabWorkspaces == null,
                session: root.LocalItabWorkspaces?.session ?? null, chain: completeChain });
            // Only a DONE row's Reopen selection owns this source; completion Undo is independent.
            const reopenWorkspace = controller.store.backend?.workspace ?? null, reopenChain = [];
            for (let node = this.completed.list; node; node = node.parentElement) reopenChain.push([node, node.parentElement]);
            reopenChain.push([this.completed.summary, this.completed.box], [this.filterInput, this.filter], [this.filter, host]);
            this.rowReopenOwner = Object.freeze({ host, completed: this.completed, box: this.completed.box, summary: this.completed.summary,
                list: this.completed.list, filter: this.filter, filterInput: this.filterInput, controller, store: controller.store, backend: controller.store.backend,
                workspace: reopenWorkspace, workspaceId: reopenWorkspace?.id, workspaceGeneration: reopenWorkspace?.generation,
                legacyAvailability: !!reopenWorkspace && typeof reopenWorkspace === 'object' && reopenWorkspace.id == null && reopenWorkspace.generation == null && root.LocalItabWorkspaces == null,
                session: root.LocalItabWorkspaces?.session ?? null, chain: reopenChain });
            // Both ACTIVE and DONE Remove menus belong to the original mounted source.
            const removeWorkspace = controller.store.backend?.workspace ?? null, removeChain = [];
            for (const list of [this.list, this.completed.list]) for (let node = list; node; node = node.parentElement) removeChain.push([node, node.parentElement]);
            removeChain.push([this.completed.summary, this.completed.box], [this.filterInput, this.filter], [this.filter, host]);
            this.rowRemoveOwner = Object.freeze({ host, activeList: this.list, completed: this.completed, box: this.completed.box,
                summary: this.completed.summary, doneList: this.completed.list, filter: this.filter, filterInput: this.filterInput,
                controller, store: controller.store, backend: controller.store.backend,
                workspace: removeWorkspace, workspaceId: removeWorkspace?.id, workspaceGeneration: removeWorkspace?.generation,
                legacyAvailability: !!removeWorkspace && typeof removeWorkspace === 'object' && removeWorkspace.id == null && removeWorkspace.generation == null && root.LocalItabWorkspaces == null,
                session: root.LocalItabWorkspaces?.session ?? null, chain: removeChain });
            // A direct Removed-row Restore owns its construction source, independently of Remove Undo.
            const restoreWorkspace = controller.store.backend?.workspace ?? null, restoreChain = [];
            for (let node = this.removed.list; node; node = node.parentElement) restoreChain.push([node, node.parentElement]);
            restoreChain.push([this.removed.summary, this.removed.box], [this.filterInput, this.filter], [this.filter, host]);
            this.rowRestoreOwner = Object.freeze({ host, removed: this.removed, box: this.removed.box, summary: this.removed.summary,
                list: this.removed.list, filter: this.filter, filterInput: this.filterInput, controller, store: controller.store, backend: controller.store.backend,
                workspace: restoreWorkspace, workspaceId: restoreWorkspace?.id, workspaceGeneration: restoreWorkspace?.generation,
                legacyAvailability: !!restoreWorkspace && typeof restoreWorkspace === 'object' && restoreWorkspace.id == null && restoreWorkspace.generation == null && root.LocalItabWorkspaces == null,
                session: root.LocalItabWorkspaces?.session ?? null, chain: restoreChain });
            // Next up owns its construction source before any asynchronous read. Its
            // own lifecycle is independent of row redraws, filters and unrelated edits.
            const nextWorkspace = controller.store.backend?.workspace ?? null, nextChain = [];
            for (let node = this.next; node; node = node.parentElement) nextChain.push([node, node.parentElement]);
            this.nextOwner = Object.freeze({ host, next: this.next, controller, store: controller.store, backend: controller.store.backend,
                workspace: nextWorkspace, workspaceId: nextWorkspace?.id, workspaceGeneration: nextWorkspace?.generation,
                legacyAvailability: !!nextWorkspace && typeof nextWorkspace === 'object' && nextWorkspace.id == null && nextWorkspace.generation == null && root.LocalItabWorkspaces == null,
                session: root.LocalItabWorkspaces?.session ?? null, chain: nextChain });
            this.unsubscribe = lifecycle.unsubscribe = controller.subscribe(() => { if (viewSourceCurrent(this, lifecycle)) this.render(); });
            this.render(); controller.refresh().catch(() => {});
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
            const restorationAttempt = restorationAttempts.get(this);
            if (restorationAttempt?.command === command) return this.performRestoration(restorationAttempt);
            const transitionAttempt = transitionAttempts.get(this);
            if (transitionAttempt?.command === command) return this.performTransition(transitionAttempt);
            const quickAttempt = quickAddAttempts.get(this);
            if (quickAttempt?.command === command) return this.performQuickAdd(quickAttempt);
            const undoAttempt = undoAttempts.get(this);
            if (undoAttempt?.command === command) return this.performUndo(undoAttempt);
            const lifecycle = viewLifecycles.get(this), controller = lifecycle?.source.controller;
            if (!viewSourceCurrent(this, lifecycle) || controller.pending) return;
            const attempt = { lifecycle, command, success, failure }; genericAttempts.set(this, attempt);
            const generation = ++this.actionGeneration;
            const owns = () => genericAttempts.get(this) === attempt && generation === this.actionGeneration && viewSourceCurrent(this, lifecycle);
            this.localError = null;
            if (!owns() || controller.pending) return;
            this.retryEffect = success;
            if (!owns() || controller.pending) return;
            this.retryFailure = failure;
            if (!owns() || controller.pending) return;
            this.retryEffectOperationId = command.operationId;
            // Request/effect hooks cannot redirect the captured source. Availability
            // remains the Controller's concern, separate from source identity.
            if (!owns() || controller.pending) return;
            try {
                const state = await controller.run(command);
                // Final notifications or effect hooks may start a newer action.
                const current = () => owns() && !controller.pending && !controller.error && (!controller.retryCommand || controller.retryCommand === command);
                if (!current()) return;
                this.rememberUndo(command, state);
                if (!current()) return;
                this.retryEffect = null;
                if (!current()) return;
                this.retryFailure = null;
                if (!current()) return;
                success?.(state);
                if (current()) this.render();
            }
            catch (error) {
                if (owns() && !controller.pending && controller.retryCommand === command && controller.error === error) failure?.(error);
                // Only the captured Controller's exact failure owns this effect.
            }
        }
        async performRestoration(attempt) {
            const { owner, lifecycle, command } = attempt, controller = owner.controller;
            const owns = () => restorationAttempts.get(this) === attempt &&
                viewSourceCurrent(this, lifecycle) && this.editSourceCurrent(owner);
            if (!owns() || controller.pending || (controller.retryCommand && controller.retryCommand !== command)) return;
            const generation = ++this.actionGeneration;
            this.localError = null; this.retryEffect = attempt.success; this.retryFailure = attempt.failure; this.retryEffectOperationId = command.operationId;
            // Control/effect hooks must not redirect the original reviewed command.
            if (!owns() || controller.pending || (controller.retryCommand && controller.retryCommand !== command)) return;
            try {
                const state = await controller.run(command);
                if (restorationAttempts.get(this) !== attempt || generation !== this.actionGeneration || controller.pending ||
                    (controller.retryCommand && controller.retryCommand !== command)) return;
                // Keep private receipt acknowledgement for an open original modal;
                // a saved/null closed attempt must still permit genuine READ Retry.
                if (!owns()) { attempt.defer(); return; }
                this.rememberUndo(command, state);
                this.retryEffect = null; this.retryFailure = null; attempt.success(state); this.render();
            } catch (error) {
                if (restorationAttempts.get(this) !== attempt || generation !== this.actionGeneration || controller.pending ||
                    controller.retryCommand !== command) return;
                if (!owns()) { attempt.defer(); return; }
                attempt.failure(error);
            }
        }
        async performTransition(attempt) {
            const { owner, lifecycle, command } = attempt, controller = owner.controller;
            const owns = () => transitionAttempts.get(this) === attempt &&
                viewSourceCurrent(this, lifecycle) && this.editSourceCurrent(owner);
            if (!owns() || controller.pending || (controller.retryCommand && controller.retryCommand !== command)) return;
            const generation = ++this.actionGeneration;
            this.localError = null; this.retryEffect = attempt.success; this.retryFailure = attempt.failure; this.retryEffectOperationId = command.operationId;
            // Local effect/control hooks cannot redirect this captured dispatch.
            if (!owns() || controller.pending || (controller.retryCommand && controller.retryCommand !== command)) return;
            try {
                const state = await controller.run(command);
                if (transitionAttempts.get(this) !== attempt || generation !== this.actionGeneration || controller.pending ||
                    (controller.retryCommand && controller.retryCommand !== command)) return;
                // Retain only private acknowledgement data during a source gap.
                // A deliberately closed popup still permits a source-valid Undo.
                if (!owns()) { attempt.defer(); return; }
                this.rememberUndo(command, state);
                this.retryEffect = null; this.retryFailure = null; attempt.success(state); this.render();
            } catch (error) {
                if (transitionAttempts.get(this) !== attempt || generation !== this.actionGeneration || controller.pending ||
                    controller.retryCommand !== command) return;
                if (!owns()) { attempt.defer(); return; }
                attempt.failure(error);
            }
        }
        async performUndo(attempt) {
            const { owner, command, record } = attempt, controller = owner.controller;
            const owns = () => undoAttempts.get(this) === attempt && this.undo === record &&
                viewSourceCurrent(this, viewLifecycles.get(this)) && this.editSourceCurrent(owner);
            if (!owns() || controller.pending) return;
            const generation = ++this.actionGeneration;
            this.localError = null; this.retryEffect = null; this.retryFailure = null; this.retryEffectOperationId = command.operationId;
            // Recheck after local effect setup, immediately before captured dispatch.
            if (!owns() || controller.pending) return;
            attempt.dispatched = true;
            try {
                const state = await controller.run(command); attempt.saved = state;
                if (!owns() || generation !== this.actionGeneration || controller.pending ||
                    (controller.retryCommand && controller.retryCommand !== command)) return;
                this.undo = null; undoRecords.delete(this); undoAttempts.delete(this);
                this.retryEffect = null; this.retryFailure = null; this.render();
            } catch (_) {
                // The captured Controller retains its real result and exact Retry.
                // A source gap never grants this continuation another View effect.
            }
        }
        async performQuickAdd(attempt) {
            const { owner, command, success } = attempt, controller = owner.controller;
            const owns = () => quickAddAttempts.get(this) === attempt &&
                viewSourceCurrent(this, viewLifecycles.get(this)) && this.editSourceCurrent(owner);
            if (!owns() || controller.pending) return;
            const generation = ++this.actionGeneration;
            this.localError = null; this.retryEffect = success; this.retryFailure = null; this.retryEffectOperationId = command.operationId;
            if (!owns() || controller.pending) return;
            try {
                const state = await controller.run(command);
                // Issued work keeps its real result. Only this original attempt
                // may clear its draft/effects after final Controller notifications.
                if (!owns() || generation !== this.actionGeneration || controller.pending ||
                    (controller.retryCommand && controller.retryCommand !== command)) return;
                this.retryEffect = null; this.retryFailure = null; success(state); this.render();
            } catch (_) {
                // The captured Controller retains its error and exact Retry.
            }
        }
        async retryLast() {
            const restorationAttempt = restorationAttempts.get(this);
            if (restorationAttempt) {
                if (!viewSourceCurrent(this, restorationAttempt.lifecycle) || !this.editSourceCurrent(restorationAttempt.owner)) return;
                if (restorationAttempt.owner.controller.retryCommand === restorationAttempt.command) {
                    // Retain this path's historical workspace/page availability
                    // without imposing its original row snapshot on receipt Retry.
                    if (!this.restorationWorkspaceCurrent(restorationAttempt.source) || root.LocalItabContentLifecycle?.departing ||
                        document.hidden || document.visibilityState === 'hidden') return;
                    return this.perform(restorationAttempt.command);
                }
            }
            const transitionAttempt = transitionAttempts.get(this);
            if (transitionAttempt) {
                if (!viewSourceCurrent(this, transitionAttempt.lifecycle) || !this.editSourceCurrent(transitionAttempt.owner)) return;
                // A saved/null attempt cannot capture genuine READ refresh. Undo's
                // revision-free reopenBatch is a distinct exact command too.
                if (transitionAttempt.owner.controller.retryCommand === transitionAttempt.command) return this.perform(transitionAttempt.command);
            }
            const quickAttempt = quickAddAttempts.get(this);
            if (quickAttempt) {
                if (!viewSourceCurrent(this, viewLifecycles.get(this)) || !this.editSourceCurrent(quickAttempt.owner)) return;
                if (quickAttempt.owner.controller.retryCommand === quickAttempt.command) return this.perform(quickAttempt.command);
            }
            const undoAttempt = undoAttempts.get(this);
            if (undoAttempt) {
                if (!viewSourceCurrent(this, viewLifecycles.get(this)) || !this.editSourceCurrent(undoAttempt.owner)) return;
                if (undoAttempt.owner.controller.retryCommand === undoAttempt.command) return this.perform(undoAttempt.command);
            }
            const lifecycle = viewLifecycles.get(this), controller = lifecycle?.source.controller;
            if (!viewSourceCurrent(this, lifecycle) || controller.pending) return;
            const command = controller.retryCommand, attempt = genericAttempts.get(this);
            // An operation ID alone cannot authorize another command or its effects.
            if (command && (attempt?.command !== command || attempt.lifecycle !== lifecycle)) return;
            // Retry must stay with the mounted moveFirst source, but its original
            // receipt remains authoritative after rows/order change or an unknown save.
            if (command?.kind === 'moveFirst' && !this.moveFirstSourceCurrent(this.moveFirstOwner)) return;
            // Move-to-end keeps the exact command and receipt, but never changes its mounted source.
            if (command?.kind === 'moveLast' && !this.moveLastSourceCurrent(this.moveLastOwner)) return;
            // The original step-move receipt can outlive its row, but never its construction source.
            if (command?.kind === 'move' && !this.stepMoveSourceCurrent(this.stepMoveOwner)) return;
            // Original pin receipts survive redraw and changed pins, but never change source.
            if (command?.kind === 'pin' && !this.pinSourceCurrent(this.pinOwner)) return;
            // Original ordinary-completion Retry keeps its receipt/CAS, independently of rebuilt rows.
            if (command?.kind === 'complete' && !this.completeSourceCurrent(this.completeOwner)) return;
            // Gate only the exact command created by a DONE row, never Undo's same-kind reopen.
            // Its original receipt survives collapsed/filtered/redrawn rows and is never reconstructed.
            if (command && command === this.rowReopenAttempt?.command && !this.rowReopenSourceCurrent(this.rowReopenAttempt.owner)) return;
            // Only this exact single-row attempt owns Remove Retry; removal Undo is restore.
            // Its original command/receipt and success effect survive legitimate row changes.
            if (command && command === this.rowRemoveAttempt?.command && !this.rowRemoveSourceCurrent(this.rowRemoveAttempt.owner)) return;
            // Only the exact row Restore command is gated; Remove Undo also uses restore.
            // Retry keeps its original receipt and task CAS after filtering, collapse or redraw.
            if (command && command === this.rowRestoreAttempt?.command && !this.rowRestoreSourceCurrent(this.rowRestoreAttempt.owner)) return;
            if (command?.kind === 'restoreBatch' && (!this.restorationAttempt || this.restorationAttempt.command !== command ||
                !this.restorationWorkspaceCurrent(this.restorationAttempt.source) || root.LocalItabContentLifecycle?.departing ||
                document.hidden || document.visibilityState === 'hidden')) return;
            if (command?.kind === 'completePinned') {
                // The original receipt may outlive its Next up button, but cannot
                // become another command or cross its construction source.
                if (command !== this.nextAttempt?.command || !this.nextSourceCurrent(this.nextAttempt.owner) ||
                    command.operationId !== this.retryEffectOperationId) return;
                return this.performPinned(command, this.retry);
            }
            if (command) {
                if (command.operationId !== this.retryEffectOperationId) return;
                return this.perform(command, attempt.success, attempt.failure);
            }
            const generation = this.actionGeneration;
            this.localError = null;
            if (!viewSourceCurrent(this, lifecycle) || generation !== this.actionGeneration || controller.pending || controller.retryCommand) return;
            try {
                await controller.retry();
                if (viewSourceCurrent(this, lifecycle) && generation === this.actionGeneration && !controller.pending && !controller.retryCommand) this.render();
            } catch (_) {}
        }
        add() {
            const owner = editSources.get(this);
            if (!viewSourceCurrent(this, viewLifecycles.get(this)) || !this.editSourceCurrent(owner) ||
                this.quickEntryComposing || owner.controller.pending) return;
            const text = this.input.value, generation = this.draftGeneration;
            const command = owner.store.request('add', { text });
            if (!viewSourceCurrent(this, viewLifecycles.get(this)) || !this.editSourceCurrent(owner) || owner.controller.pending) return;
            const success = () => {
                // A late success must not clear newer text or focus another element.
                if (!this.quickEntryComposing && this.draftGeneration === generation && this.input.value === text) this.input.value = '';
            };
            quickAddAttempts.set(this, { owner, command, success });
            // Add remains a deliberate new request. Only Retry replays this command.
            this.perform(command);
        }
        addBatch() {
            const owner = editSources.get(this), lifecycle = viewLifecycles.get(this);
            const sourceCurrent = () => viewSourceCurrent(this, lifecycle) && this.editSourceCurrent(owner);
            if (!sourceCurrent() || this.dialogs.size) return;
            const controller = owner.controller, store = owner.store, subscribe = controller.subscribe.bind(controller);
            const returnFocus = document.activeElement;
            // Closing owns only this exact command on the construction Controller.
            // In particular, no-attempt Cancel must not dismiss a READ error.
            const dismiss = command => { if (command && controller.retryCommand === command) controller.dismissRetry(command.operationId); };
            let unsubscribe = () => {}, epoch = 0, generation = 0, reviewing = false, saving = false;
            let review = null, attempt = null, retryCommand = null, composing = false;
            const modal = this.createDialog(t('tasksBatch'), () => {
                epoch++; unsubscribe();
                if (this.batchSession === modal) this.batchSession = null;
                if (attempt) dismiss(attempt.command); this.render();
            });
            if (!modal) return;
            if (!sourceCurrent()) { modal.close(false); return; }
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
            const owns = () => viewLifecycles.get(this) === lifecycle && !lifecycle.retired && !this.destroyed &&
                modal.isOpen && this.dialogs.has(modal) && this.batchSession === modal && input.isConnected;
            const originalClose = modal.close;
            modal.close = (restoreFocus = true) => {
                const restore = restoreFocus && owns() && sourceCurrent() &&
                    (modal.panel.contains(document.activeElement) || document.activeElement === document.body);
                originalClose(false);
                // Cleanup can synchronously start newer work or change the source.
                if (!restore || !sourceCurrent() || this.dialogs.size || document.activeElement !== document.body) return;
                if (returnFocus?.isConnected && !returnFocus.closest('[inert]') && sourceCurrent()) returnFocus.focus();
                if (sourceCurrent() && document.activeElement === document.body && !owner.host.hidden) this.input.focus();
            };
            const setControl = (node, disabled, hidden = false) => {
                // Chrome drops focus when its active control becomes disabled/hidden.
                // Transfer only that control's focus before the transition, keeping
                // Escape/Tab inside this opening without reclaiming newer focus.
                if (!owns() || !sourceCurrent()) return false;
                if (document.activeElement === node && (disabled || hidden)) input.focus();
                if (!owns() || !sourceCurrent()) return false;
                node.disabled = disabled; node.hidden = hidden;
                return owns() && sourceCurrent();
            };
            const showReview = value => {
                preview.hidden = !value; title.textContent = `${t('tasksBatchPreview')}${value ? ` (${value.count})` : ''}`;
                list.replaceChildren(...(value ? value.texts.map(text => el('li', '', text)) : []));
            };
            const update = () => {
                if (!owns()) return;
                // Explain a gap only in this opening; do not move focus or publish
                // controls/preview from another source while the original is away.
                if (!sourceCurrent()) { setFeedback(t('tasksConflict'), true); return; }
                if (retryCommand && attempt) showReview(attempt.review);
                const state = controller.state;
                const total = review && (!state || review.revision >= state.revision) ? review.currentTotal : state?.records.length;
                const lines = input.value.split(/\r\n|\r|\n/).filter(line => line.trim().length > 0).length;
                count.textContent = `${t('tasksBatchCount')}: ${lines} · ${t('tasksBatchCapacity')}: ${total ?? '—'}/${api.LIMITS.records} · ${t('tasksBatchRemaining')}: ${total === undefined ? '—' : api.LIMITS.records - total}`;
                if (review && !saving && !retryCommand && controller.state?.revision > review.revision) {
                    epoch++; review = null; showReview(null); setFeedback(t('tasksBatchChanged'));
                }
                const busy = saving || !!controller.pending;
                if (!setControl(reviewButton, busy || reviewing || !!retryCommand || composing)) return;
                if (!setControl(confirm, busy || !review || composing, !review || !!retryCommand)) return;
                confirm.textContent = `${t('tasksBatchConfirm')}${review ? ` (${review.count})` : ''}`;
                if (!setControl(retry, busy || composing, !retryCommand)) return;
                retry.textContent = `${t('tasksBatchRetry')}${attempt && retryCommand ? ` (${attempt.review.count})` : ''}`;
            };
            const prepare = async () => {
                if (!owns() || !sourceCurrent() || saving || controller.pending || retryCommand || composing) return;
                const source = input.value, submittedGeneration = generation, ticket = ++epoch;
                reviewing = true; review = null; showReview(null); setFeedback(t('tasksLoading')); update();
                // Disabling a focused control may run focus hooks before review.
                if (!owns() || !sourceCurrent() || controller.pending) { reviewing = false; if (owns()) update(); return; }
                try {
                    const value = await store.reviewBatch(source);
                    if (!owns() || ticket !== epoch || generation !== submittedGeneration || input.value !== source) return;
                    if (!sourceCurrent()) { setFeedback(t('tasksConflict'), true); return; }
                    if (controller.state?.revision > value.revision) { setFeedback(t('tasksBatchChanged')); return; }
                    review = { ...value, source, generation: submittedGeneration };
                    showReview(review); setFeedback(t('tasksBatchReady'));
                } catch (error) {
                    if (owns() && ticket === epoch) setFeedback(sourceCurrent() ? errorText(error) : t('tasksConflict'), true);
                } finally {
                    if (owns() && ticket === epoch) { reviewing = false; update(); }
                }
            };
            const submit = async (retryPrevious = false) => {
                if (!owns() || !sourceCurrent() || saving || controller.pending || composing) return;
                if (retryPrevious) {
                    if (!retryCommand || !attempt || retryCommand !== attempt.command ||
                        (controller.retryCommand && controller.retryCommand !== retryCommand)) return;
                }
                else {
                    if (!review || retryCommand || review.generation !== generation || review.source !== input.value) return;
                    // An observed remote update always gets another numbered review.
                    if (controller.state?.revision > review.revision) { update(); return; }
                    attempt = { command: review.command, review };
                }
                const submitted = attempt, command = submitted.command;
                saving = true; setFeedback(t('tasksSaving')); update();
                if (!owns() || !sourceCurrent() || controller.pending) { saving = false; if (owns()) update(); return; }
                this.batchOperationId = command.operationId;
                try {
                    const state = await controller.run(command);
                    if (!owns() || attempt !== submitted) return;
                    // Even a real saved receipt needs explicit acknowledgement if
                    // this opening could not safely receive its result.
                    if (!sourceCurrent()) { retryCommand = command; setFeedback(t('tasksConflict'), true); return; }
                    retryCommand = null; review = null; attempt = null;
                    // A confirmed old batch must not dismiss a newer draft or another dialog.
                    // If a later state was already observed, leave the draft for review too.
                    if (generation === submitted.review.generation && input.value === submitted.review.source &&
                        controller.state?.revision === state.revision && !controller.pending &&
                        (!controller.retryCommand || controller.retryCommand.operationId === command.operationId) &&
                        state.receipts.at(-1) === command.operationId) modal.close();
                    else { showReview(null); setFeedback(t('tasksBatchDraftRemains')); }
                } catch (error) {
                    if (!owns()) { dismiss(command); return; }
                    if (attempt !== submitted) return;
                    if (!sourceCurrent()) { retryCommand = command; setFeedback(t('tasksConflict'), true); return; }
                    review = null;
                    if (['READ', 'WRITE', 'VERIFY'].includes(error.code)) {
                        retryCommand = command; showReview(submitted.review);
                        setFeedback(`${errorText(error)} ${t('tasksBatchUncertain')}`, true);
                    } else {
                        retryCommand = null; attempt = null; showReview(null);
                        dismiss(command); setFeedback(errorText(error), true);
                    }
                } finally {
                    saving = false;
                    if (!owns()) dismiss(command);
                    if (sourceCurrent() && (!this.batchSession || this.batchSession === modal) &&
                        this.batchOperationId === command.operationId) this.batchOperationId = null;
                    if (owns()) update();
                    if (sourceCurrent()) this.render();
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
            unsubscribe = subscribe(update); modal.open(input); update(); this.render();
        }
        completeBatch() { return this.transitionBatch(false); }
        reopenBatch() { return this.transitionBatch(true); }
        transitionBatch(reopening) {
            const owner = editSources.get(this), lifecycle = viewLifecycles.get(this);
            const sourceCurrent = () => viewSourceCurrent(this, lifecycle) && this.editSourceCurrent(owner);
            if (!sourceCurrent()) return;
            const controller = owner.controller, store = owner.store, subscribe = controller.subscribe.bind(controller);
            const source = reopening ? this.visibleCompletedTasks : this.visibleTasks;
            const origin = reopening ? this.reopenBatchButton : this.completeBatchButton;
            if (!(reopening ? this.completedVisibleCurrent(source, origin) : this.copyVisibleCurrent(source, origin))) return;
            const message = suffix => t(`tasks${reopening ? 'Reopen' : 'Complete'}${suffix}`);
            const css = suffix => `tasks-${reopening ? 'reopen' : 'complete'}-${suffix}`;
            const records = Object.freeze(source.map(task => Object.freeze({ ...task })));
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
            if (!sourceCurrent()) { modal.close(false); return; }
            this.completionSession = modal;
            const owns = () => viewLifecycles.get(this) === lifecycle && !lifecycle.retired && !this.destroyed &&
                modal.isOpen && this.dialogs.has(modal) && this.completionSession === modal && modal.panel.isConnected && owner.host.isConnected;
            const available = () => !!controller.state && !document.hidden && document.visibilityState !== 'hidden' &&
                !modal.panel.closest('[hidden], [inert]') && !!modal.panel.getClientRects().length &&
                !['hidden', 'collapse'].includes(root.getComputedStyle?.(modal.panel).visibility) &&
                !root.LocalItabContentLifecycle?.departing && sourceCurrent();
            const originalClose = modal.close;
            modal.close = (restoreFocus = true) => {
                const restore = restoreFocus && owns() && !focusDeparted && available() && !document.hidden && document.visibilityState !== 'hidden' &&
                    (modal.panel.contains(document.activeElement) || document.activeElement === document.body);
                originalClose(false);
                if (!restore || !sourceCurrent() || this.dialogs.size || document.activeElement !== document.body) return;
                const visible = node => {
                    if (!node?.isConnected || node.disabled || node.closest('[hidden], [inert]') || !node.getClientRects().length) return false;
                    for (let parent = node.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS' && !parent.open) return false;
                    return true;
                };
                if (visible(origin) && sourceCurrent()) origin.focus(); else if (visible(this.input) && sourceCurrent()) this.input.focus();
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
                if (!owns() || !sourceCurrent()) return false;
                if (document.activeElement === node && (disabled || hidden)) cancel.focus();
                if (!owns() || !sourceCurrent()) return false;
                node.disabled = disabled; node.hidden = hidden;
                return owns() && sourceCurrent();
            };
            const showReview = value => {
                preview.hidden = !value; title.textContent = value ? `${t('tasksBatchPreview')} (${value.count})` : '';
                list.replaceChildren(...(value ? value.records.map(task => el('li', '', task.text)) : []));
                pin.textContent = value ? (reopening ? message('KeepsPin') : t(value.clearsPin ? 'tasksCompleteClearsPin' : 'tasksCompleteKeepsPin')) : '';
            };
            const update = () => {
                if (!owns()) return;
                // A source-gap notification may explain the conflict, but cannot
                // replace this selection/preview or take a current control's focus.
                if (!sourceCurrent()) { setFeedback(t('tasksConflict'), true); return; }
                if (retryCommand && attempt) showReview(attempt.review);
                count.textContent = message('Selected').replace('{count}', selected.size).replace('{total}', records.length);
                if (review && !saving && !retryCommand && controller.state?.revision > review.revision) {
                    epoch++; review = null; showReview(null); setFeedback(message('Changed'));
                }
                const blocked = saving || !!controller.pending || !available();
                for (const checkbox of choices) if (!setControl(checkbox, blocked)) return;
                if (!setControl(all, blocked) || !setControl(clear, blocked || !selected.size)) return;
                if (!setControl(reviewButton, blocked || reviewing || !!retryCommand || !selected.size)) return;
                if (!setControl(confirm, blocked || !review, !review || !!retryCommand)) return;
                confirm.textContent = message('Confirm').replace('{count}', review?.count ?? 0);
                if (!setControl(retry, blocked, !retryCommand)) return;
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
                    if (!owns() || !available() || saving || controller.pending) { checkbox.checked = selected.has(task.id); return; }
                    if (checkbox.checked) selected.add(task.id); else selected.delete(task.id); changed();
                });
                choices.push(checkbox); label.append(checkbox, el('span', 'tasks-recovery-text', task.text)); row.append(label); selection.append(row);
            }
            const select = value => {
                if (!owns() || !available() || saving || controller.pending) return;
                selected.clear(); records.forEach((task, index) => { choices[index].checked = value; if (value) selected.add(task.id); }); changed();
            };
            const all = button(`tasks${reopening ? 'Reopen' : 'Complete'}SelectAll`, () => select(true), css('select-all'));
            const clear = button(`tasks${reopening ? 'Reopen' : 'Complete'}Clear`, () => select(false), css('clear'));
            const prepare = async () => {
                if (!owns() || !available() || saving || controller.pending || retryCommand || !selected.size) return;
                const ticket = ++epoch, submittedGeneration = generation;
                const targets = records.filter(task => selected.has(task.id)).map(({ id, version }) => ({ id, version }));
                reviewing = true; review = null; showReview(null); setFeedback(t('tasksLoading')); update();
                if (!owns() || !available() || controller.pending) { reviewing = false; if (owns()) update(); return; }
                try {
                    const value = await store[reopening ? 'reviewReopening' : 'reviewCompletion'](targets);
                    if (!owns() || !available() || ticket !== epoch || generation !== submittedGeneration) return;
                    if (controller.state?.revision > value.revision) { setFeedback(message('Changed')); return; }
                    review = value; showReview(value); setFeedback(message('Ready'));
                } catch (error) { if (owns() && ticket === epoch) setFeedback(sourceCurrent() ? errorText(error) : t('tasksConflict'), true); }
                finally { if (owns() && ticket === epoch) { reviewing = false; update(); } }
            };
            const submit = async (retryPrevious = false) => {
                if (!owns() || !available() || saving || controller.pending) return;
                if (retryPrevious) {
                    if (!retryCommand || !attempt || retryCommand !== attempt.command ||
                        transitionAttempts.get(this) !== attempt || (controller.retryCommand && controller.retryCommand !== retryCommand)) return;
                }
                else {
                    if (!review || retryCommand) return;
                    if (controller.state?.revision > review.revision) { update(); return; }
                    attempt = { owner, lifecycle, command: review.command, review, generation };
                    const submitted = attempt, command = submitted.command;
                    // These closures own this exact opening; close does not revoke
                    // the captured command or its independent real completion Undo.
                    attempt.defer = () => { retryCommand = command; };
                    attempt.success = state => {
                        if (!owns() || attempt !== submitted || !sourceCurrent()) return;
                        retryCommand = null; attempt = null; review = null; showReview(null);
                        if (available() && generation === submitted.generation && controller.state?.revision === state.revision &&
                            controller.state?.receipts.at(-1) === command.operationId) modal.close();
                        else setFeedback(message('Saved'));
                    };
                    attempt.failure = error => {
                        if (!owns() || attempt !== submitted || !sourceCurrent()) return;
                        review = null;
                        if (['READ', 'WRITE', 'VERIFY'].includes(error.code)) {
                            retryCommand = command; showReview(submitted.review);
                            setFeedback(`${errorText(error)} ${message('Uncertain')}`, true);
                        } else {
                            retryCommand = null; attempt = null; showReview(null);
                            if (controller.retryCommand === command) controller.dismissRetry(command.operationId);
                            if (owns() && sourceCurrent()) setFeedback(errorText(error), true);
                        }
                    };
                    transitionAttempts.set(this, attempt);
                }
                const submitted = attempt;
                saving = true; setFeedback(t('tasksSaving')); update();
                if (!owns() || !available() || controller.pending) { saving = false; if (owns()) update(); return; }
                await this.perform(submitted.command);
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
            unsubscribe = subscribe(update); modal.open(all);
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
            const owner = editSources.get(this), lifecycle = viewLifecycles.get(this);
            const constructionCurrent = () => viewSourceCurrent(this, lifecycle) && this.editSourceCurrent(owner);
            if (!constructionCurrent()) return;
            const controller = owner.controller, store = owner.store, subscribe = controller.subscribe.bind(controller);
            let source = this.removedRestoreSource;
            const initialSource = source;
            if (!this.removedRestorationCurrent(source, origin)) return;
            const message = suffix => t(`tasksRestore${suffix}`);
            const css = suffix => `tasks-restore-${suffix}`;
            const records = Object.freeze(source.snapshot.map(task => Object.freeze({ ...task })));
            const workspace = owner.workspace;
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
            if (!constructionCurrent()) { modal.close(false); return; }
            this.restorationSession = modal;
            const dialogOwner = { panel: modal.panel, overlay: modal.panel.parentElement, valid: true, opened: false, closing: false };
            this.restorationDialogOwner = dialogOwner;
            const owns = () => viewLifecycles.get(this) === lifecycle && !lifecycle.retired && !this.destroyed &&
                modal.isOpen && this.dialogs.has(modal) && this.restorationSession === modal && modal.panel.isConnected && owner.host.isConnected;
            const available = () => {
                this.removedRestoreSource?.drain?.();
                return constructionCurrent() && dialogOwner.valid && this.removedRestoreOwner.valid && this.host === this.removedRestoreOwner.host &&
                modal.panel.parentElement === dialogOwner.overlay && dialogOwner.overlay.parentElement === document.body && !controller.closed && !!controller.state && !document.hidden && document.visibilityState !== 'hidden' &&
                !modal.panel.closest('[hidden], [inert]') && !!modal.panel.getClientRects().length &&
                !['hidden', 'collapse'].includes(root.getComputedStyle?.(modal.panel).visibility) &&
                !root.LocalItabContentLifecycle?.departing && controller.store.backend?.workspace === workspace &&
                !workspace?.invalidated && !workspace?._suspended && this.restorationWorkspaceCurrent(source) &&
                modal.panel.ownerDocument === document && constructionCurrent();
            };
            const originalClose = modal.close;
            modal.close = (restoreFocus = true) => {
                const restore = restoreFocus && owns() && !focusDeparted && available() && !document.hidden && document.visibilityState !== 'hidden' &&
                    (modal.panel.contains(document.activeElement) || document.activeElement === document.body);
                this.removedRestoreSource?.drain?.();
                const background = this.restorationBackground;
                if (background?.modal === modal) background.expected = background.initialInert;
                dialogOwner.closing = true; originalClose(false);
                this.removedRestoreSource?.drain?.();
                if (background?.modal === modal) { background.expected = null; if (this.restorationBackground === background) this.restorationBackground = null; }
                if (!restore || !constructionCurrent() || this.dialogs.size || document.activeElement !== document.body) return;
                const visible = node => {
                    if (!this.restorationNodeVisible(node) || node.disabled) return false;
                    for (let parent = node.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS' && !parent.open) return false;
                    return true;
                };
                if (this.removedRestoreOwner.valid && this.restoreBatchButton === origin && visible(origin) && constructionCurrent()) origin.focus(); else if (visible(this.input) && constructionCurrent()) this.input.focus();
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
                if (!owns() || !constructionCurrent()) return false;
                if (document.activeElement === node && (disabled || hidden)) cancel.focus();
                if (!owns() || !constructionCurrent()) return false;
                node.disabled = disabled; node.hidden = hidden;
                return owns() && constructionCurrent();
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
                // A source-gap notification can explain the conflict but cannot
                // alter the reviewed selection, controls, preview or focus.
                if (!constructionCurrent()) { setFeedback(t('tasksConflict'), true); return; }
                if (retryCommand && attempt) showReview(attempt.review);
                count.textContent = message('Selected').replace('{count}', selected.size).replace('{total}', records.length);
                if (review && !saving && !retryCommand) {
                    const current = controller.state?.revision === review.revision && sourceCurrent();
                    if (!constructionCurrent()) { setFeedback(t('tasksConflict'), true); return; }
                    if (!current) { epoch++; review = null; showReview(null); setFeedback(message('Changed')); }
                }
                const blocked = saving || !!controller.pending || !available() || composing;
                for (const checkbox of choices) if (!setControl(checkbox, blocked)) return;
                if (!setControl(all, blocked) || !setControl(clear, blocked || !selected.size)) return;
                if (!setControl(reviewButton, blocked || reviewing || !!retryCommand || !selected.size || !sourceCurrent())) return;
                if (!setControl(confirm, blocked || !review, !review || !!retryCommand)) return;
                confirm.textContent = message('Confirm').replace('{count}', review?.count ?? 0);
                if (!setControl(retry, blocked, !retryCommand)) return;
                retry.textContent = message('Retry').replace('{count}', retryCommand?.targets.length ?? 0);
                const stillAvailable = available();
                if (!constructionCurrent()) { setFeedback(t('tasksConflict'), true); return; }
                if (!stillAvailable) { review = null; if (!retryCommand && !saving) showReview(null); setControl(confirm, true, true); setFeedback(t('tasksErrorUnavailable'), true); }
            };
            const changed = () => {
                generation++; epoch++; reviewing = false; review = null;
                if (!retryCommand) { showReview(null); if (!saving) setFeedback(''); }
                update();
            };
            for (const task of records) {
                const row = el('li'), label = el('label'), checkbox = el('input', css('checkbox')); checkbox.type = 'checkbox'; checkbox.checked = false;
                checkbox.addEventListener('change', event => {
                    if (!owns() || !available() || composing || saving || controller.pending) { checkbox.checked = selected.has(task.id); return; }
                    if (event.isComposing || event.keyCode === 229) { checkbox.checked = selected.has(task.id); return; }
                    if (checkbox.checked) selected.add(task.id); else selected.delete(task.id); changed();
                });
                choices.push(checkbox); label.append(checkbox, el('span', 'tasks-recovery-text', task.text));
                label.append(el('p', 'tasks-help tasks-restore-destination', message(task.removedFrom === 'active' ? 'ToActive' : 'ToDone'))); row.append(label); selection.append(row);
            }
            const select = value => {
                if (!owns() || !available() || composing || saving || controller.pending) return;
                selected.clear(); records.forEach((task, index) => { choices[index].checked = value; if (value) selected.add(task.id); }); changed();
            };
            const all = button('tasksRestoreSelectAll', event => { if (activation(event)) select(true); }, css('select-all'));
            const clear = button('tasksRestoreClear', event => { if (activation(event)) select(false); }, css('clear'));
            const prepare = async () => {
                if (!owns() || !available() || composing || saving || controller.pending || retryCommand || !selected.size) return;
                if (reviewing || !sourceCurrent()) { setFeedback(message('Changed')); return; }
                const ticket = ++epoch, submittedGeneration = generation;
                const targets = records.filter(task => selected.has(task.id)).map(({ id, version, removedFrom }) => ({ id, version, removedFrom }));
                reviewing = true; review = null; showReview(null); setFeedback(t('tasksLoading')); update();
                if (!owns() || !available() || controller.pending) { reviewing = false; if (owns()) update(); return; }
                try {
                    const value = await store.reviewRestoration(targets);
                    if (!owns() || !available() || ticket !== epoch || generation !== submittedGeneration) return;
                    if ((controller.state?.revision !== value.revision || !sourceCurrent())) { setFeedback(message('Changed')); return; }
                    review = value; showReview(value); setFeedback(message('Ready'));
                } catch (error) { if (owns() && ticket === epoch) setFeedback(constructionCurrent() ? errorText(error) : t('tasksConflict'), true); }
                finally { if (owns() && ticket === epoch) { reviewing = false; update(); } }
            };
            const submit = async (retryPrevious = false) => {
                if (!owns() || !available() || composing || saving || controller.pending) return;
                if (retryPrevious) {
                    if (!retryCommand || !attempt || retryCommand !== attempt.command ||
                        restorationAttempts.get(this) !== attempt || (controller.retryCommand && controller.retryCommand !== retryCommand)) return;
                }
                else {
                    if (!review || retryCommand) return;
                    if ((controller.state?.revision !== review.revision || !sourceCurrent())) { update(); return; }
                    attempt = { owner, lifecycle, command: review.command, review, generation, source };
                    this.restorationAttempt = Object.freeze({ command: review.command, review, source });
                    const submitted = attempt, command = submitted.command;
                    attempt.defer = () => { retryCommand = command; };
                    attempt.success = state => {
                        if (!constructionCurrent()) return;
                        if (this.restorationAttempt?.command === command) this.restorationAttempt = null;
                        if (!owns() || attempt !== submitted) return;
                        retryCommand = null; attempt = null; review = null; showReview(null);
                        if (available() && generation === submitted.generation && controller.state?.revision === state.revision &&
                            controller.state?.receipts.at(-1) === command.operationId) modal.close();
                        else setFeedback(message('Saved'));
                    };
                    attempt.failure = error => {
                        if (!owns() || attempt !== submitted || !constructionCurrent()) return;
                        review = null;
                        if (['READ', 'WRITE', 'VERIFY'].includes(error.code)) {
                            retryCommand = command; showReview(submitted.review);
                            setFeedback(`${errorText(error)} ${message('Uncertain')}`, true);
                        } else {
                            retryCommand = null; attempt = null; showReview(null);
                            if (this.restorationAttempt?.command === command) this.restorationAttempt = null;
                            if (controller.retryCommand === command) controller.dismissRetry(command.operationId);
                            if (owns() && constructionCurrent()) setFeedback(errorText(error), true);
                        }
                    };
                    restorationAttempts.set(this, attempt);
                }
                const submitted = attempt;
                saving = true; setFeedback(t('tasksSaving')); update();
                if (!owns() || !available() || controller.pending) { saving = false; if (owns()) update(); return; }
                await this.perform(submitted.command);
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
            modal.panel.addEventListener('compositionstart', () => { if (!owns() || !constructionCurrent()) return; composing = true; changed(); });
            modal.panel.addEventListener('compositionend', () => { if (!owns()) return; composing = false; update(); });
            const sourceCurrent = () => {
                if (!constructionCurrent()) return false;
                const latest = this.removedRestoreSource;
                // Unrelated writes may replace DOM rows without changing these
                // originals. Require an explicit new review, never substitute text,
                // destinations, membership, order, filter or workspace ownership.
                if (source !== latest && latest?.valid && latest.filter === initialSource.filter &&
                    this.restorationWorkspaceCurrent(initialSource) && latest.snapshot.length === records.length &&
                    records.every((task, index) => ['id', 'version', 'text', 'state', 'removedFrom'].every(key => latest.snapshot[index][key] === task[key]))) {
                    const notify = source.changed; source.changed = null; source = latest; source.changed = notify;
                }
                const current = this.removedRestorationCurrent(source, origin, modal);
                return constructionCurrent() && current;
            };
            const activation = event => !event.defaultPrevented && !(event.detail > 1) && !event.repeat && !event.isComposing && event.keyCode !== 229;
            source.changed = () => { if (owns() && constructionCurrent() && !saving && !retryCommand) { epoch++; reviewing = false; review = null; showReview(null); setFeedback(message('Changed')); update(); } };
            unsubscribe = subscribe(update);
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
        nextSourceCurrent(owner) {
            const c = owner.controller, workspace = owner.backend?.workspace ?? null;
            return this.nextOwner === owner && this.host === owner.host && this.next === owner.next &&
                this.controller === c && c.store === owner.store && c.store.backend === owner.backend && !c.closed &&
                workspace === owner.workspace && workspace?.id === owner.workspaceId && workspace?.generation === owner.workspaceGeneration &&
                !workspace?.invalidated && !workspace?._suspended && (root.LocalItabWorkspaces?.session ?? null) === owner.session &&
                (!workspace || owner.session === workspace || (owner.legacyAvailability && root.LocalItabWorkspaces == null)) &&
                owner.chain.every(([node, parent]) => node.ownerDocument === document && node.parentElement === parent);
        }
        nextCurrent(source) {
            const { owner, action, title, snapshot } = source;
            // No layout reads here. Repeat all source/text/state checks after the
            // final visibility observation, before constructing the exact command.
            if (this.nextSelection !== source || this.nextComplete !== action || this.nextTask?.id !== snapshot.id || this.nextTask?.version !== snapshot.version ||
                document.hidden || document.visibilityState === 'hidden' || !action.isConnected ||
                action.disabled || action.getAttribute('disabled') != null || action.getAttribute('aria-disabled') !== 'false' ||
                action.tagName !== 'BUTTON' || action.type !== 'button' || action.textContent !== source.label || action.children.length ||
                action.title !== source.actionTitle || action.getAttribute('aria-label') !== `${source.label}: ${snapshot.text}` ||
                !action.classList.contains('tasks-next-complete') || !title.classList.contains('tasks-next-text') ||
                title.textContent !== source.text || title.children.length || !owner.next.classList.contains('has-pin') ||
                owner.next.children.length !== 2 || owner.next.children[0] !== title || owner.next.children[1] !== action ||
                action.parentElement !== owner.next || title.parentElement !== owner.next ||
                action.ownerDocument !== document || title.ownerDocument !== document || !this.nextSourceCurrent(owner)) return false;
            for (const displayed of [action, title]) for (let node = displayed; node; node = node.parentElement) {
                if (node.hidden || node.inert || node.disabled || node.getAttribute('aria-hidden') === 'true' ||
                    node.style.display === 'none' || ['hidden', 'collapse'].includes(node.style.visibility) ||
                    (node.tagName === 'DETAILS' && !node.open)) return false;
            }
            const c = owner.controller;
            const reviewedConflict = c.error?.code === 'CONFLICT' && !!c.retryCommand && source.conflictCommand === c.retryCommand;
            if (this.destroyed || c.pending || (c.error && !reviewedConflict) || (c.retryCommand && !reviewedConflict) || this.localError ||
                ['loading', 'saving'].includes(c.status) || (c.status === 'error' && !reviewedConflict) ||
                this.dialogs.size || this.pendingReview || this.batchSession || this.reuseSession || this.completionSession || this.restorationSession ||
                root.LocalItabContentLifecycle?.departing) return false;
            const current = c.state?.records.find(record => record.id === snapshot.id);
            // Pin-only changes do not touch task.version. Keep both identities;
            // the Store rechecks expectedPin with the active/version CAS in its lock.
            return c.state?.pinnedId === source.expectedPin && !!current && current.state === 'active' &&
                Object.keys(snapshot).every(key => current[key] === snapshot[key]);
        }
        nextVisible(source) {
            for (const displayed of [source.action, source.title]) {
                if (!displayed.getClientRects().length) return false;
                for (let node = displayed; node; node = node.parentElement) {
                    const style = root.getComputedStyle?.(node);
                    if (style?.display === 'none' || ['hidden', 'collapse'].includes(style?.visibility)) return false;
                }
            }
            return true;
        }
        renderNext(task) {
            // Keep ordinary unchanged redraws stable. A newly observed genuine CAS
            // conflict alone renews the deliberate choice; clearing it for saving
            // must not replace the focused control or interrupt its focus lease.
            const conflictCommand = this.controller.error?.code === 'CONFLICT' ? this.controller.retryCommand : null;
            if (this.nextTask?.id === task?.id && this.nextTask?.version === task?.version && this.next.children.length &&
                (!task || !conflictCommand || this.nextSelection?.conflictCommand === conflictCommand)) return;
            this.nextTask = task; this.nextComplete = null; this.nextSelection = null;
            const text = el('span', 'tasks-next-text', task ? `${t('tasksNext')}: ${task.text}` : t('tasksNoPin'));
            this.next.replaceChildren(text); this.next.classList.toggle('has-pin', !!task);
            if (!task) return;
            const source = { owner: this.nextOwner, title: text, text: text.textContent, label: t('tasksComplete'),
                snapshot: Object.freeze({ ...task }), expectedPin: task.id, conflictCommand };
            const complete = button('tasksComplete', event => {
                if (event.defaultPrevented || event.detail > 1 || event.repeat || event.isComposing || event.keyCode === 229 ||
                    event.target !== complete || (event.currentTarget && event.currentTarget !== complete)) return;
                if (!this.nextCurrent(source) || !this.nextVisible(source) || !this.nextCurrent(source)) return;
                const command = source.owner.store.request('completePinned', { id: source.snapshot.id, version: source.snapshot.version, expectedPin: source.expectedPin });
                this.nextAttempt = Object.freeze({ command, owner: source.owner });
                this.performPinned(command, complete);
            }, 'tasks-next-complete');
            complete.setAttribute('aria-label', `${source.label}: ${source.snapshot.text}`);
            // Leave ordinary Enter/Space activation to the native button.
            complete.addEventListener('keydown', event => {
                if (['Enter', ' '].includes(event.key) && (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault();
            });
            source.action = complete; source.actionTitle = complete.title;
            this.nextSelection = source; this.nextComplete = complete; this.next.append(complete);
        }
        performPinned(command, origin) {
            const lifecycle = viewLifecycles.get(this), controller = lifecycle?.source.controller;
            if (!viewSourceCurrent(this, lifecycle) || controller.pending) return;
            this.pinnedFocus?.cancel();
            const intent = { command, revision: controller.state?.revision, valid: document.activeElement === origin };
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
                    controller.state?.revision === saved.revision && saved.receipts.at(-1) === command.operationId &&
                    (saved.revision === intent.revision + 1 || saved.revision === intent.revision) &&
                    (document.activeElement === origin || document.activeElement === document.body) &&
                    viewSourceCurrent(this, lifecycle)) this.input.focus();
            }).finally(() => {
                cancel(); if (this.pinnedFocus === intent) this.pinnedFocus = null;
                document.removeEventListener('focusin', moved, true); document.removeEventListener('pointerdown', cancel, true);
                document.removeEventListener('keydown', keyed, true); document.removeEventListener('visibilitychange', cancel, true);
                root.removeEventListener?.('blur', cancel);
            });
        }
        copyReady() {
            const lifecycle = viewLifecycles.get(this);
            if (!viewSourceCurrent(this, lifecycle)) return false;
            const c = lifecycle.source.controller, workspace = lifecycle.source.backend?.workspace;
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
            const lifecycle = viewLifecycles.get(this);
            if (!viewSourceCurrent(this, lifecycle)) return;
            const host = lifecycle.source.host, controller = lifecycle.source.controller;
            const attempt = lifecycle.copyAttempt, publicAttempt = this.copyAttempt;
            const current = () => viewSourceCurrent(this, lifecycle) && lifecycle.copyAttempt === attempt && this.copyAttempt === publicAttempt;
            const disabled = !!attempt || !!publicAttempt || !this.copyReady();
            // Keep the focused native button in place; the click guard enforces this state.
            host.querySelectorAll('.tasks-copy-text').forEach(node => { if (current()) node.setAttribute('aria-disabled', String(disabled)); });
            if (!current()) return;
            this.copyVisibleButton.textContent = t('tasksCopyVisible').replace('{count}', this.visibleTasks.length);
            if (!current()) return;
            this.copyVisibleButton.disabled = !this.visibleTasks.length;
            if (!current()) return;
            this.copyVisibleButton.setAttribute('aria-disabled', String(disabled || this.copyVisibleButton.disabled));
            if (!current()) return;
            this.copyCompletedButton.textContent = t('tasksCopyCompleted').replace('{count}', this.visibleCompletedTasks.length);
            if (!current()) return;
            this.copyCompletedButton.disabled = !this.visibleCompletedTasks.length;
            if (!current()) return;
            this.copyCompletedButton.setAttribute('aria-disabled', String(disabled || !this.completed.box.open || this.copyCompletedButton.disabled));
            if (!current()) return;
            this.copyRemovedButton.textContent = t('tasksCopyRemoved').replace('{count}', this.visibleRemovedTasks.length);
            if (!current()) return;
            this.copyRemovedButton.disabled = !this.visibleRemovedTasks.length;
            if (!current()) return;
            this.copyRemovedButton.setAttribute('aria-disabled', String(disabled || !this.removed.box.open || this.copyRemovedButton.disabled));
            // Match existing focus-preserving row actions while unavailable.
            if (!current()) return;
            this.completeBatchButton.setAttribute('aria-disabled', String(!this.copyReady() || !this.visibleTasks.length));
            if (!current()) return;
            this.reopenBatchButton.setAttribute('aria-disabled', String(!this.copyReady() || !this.completed.box.open || !this.visibleCompletedTasks.length));
            if (!current()) return;
            if (this.restoreBatchButton.disabled !== !this.visibleRemovedTasks.length) this.restoreBatchButton.disabled = !this.visibleRemovedTasks.length;
            if (!current()) return;
            this.restoreBatchButton.setAttribute('aria-disabled', String(!this.copyReady() || !!this.localError || !!controller.retryCommand || !this.removed.box.open || this.restoreBatchButton.disabled));
            if (!current()) return;
            host.querySelectorAll('.tasks-reuse-text').forEach(node => { if (current()) node.setAttribute('aria-disabled', String(!this.copyReady() || !!this.localError)); });
        }
        invalidateCopy() {
            // The private slot owns the unresolved write, even if public fields
            // have changed. Each cancel closure retains only its exact attempt.
            viewLifecycles.get(this)?.copyAttempt?.cancel();
        }
        copyTask(task, item, title, origin, status) {
            return this.copyText(task.text, origin, status, () => this.copyCurrent(task, item, title, origin));
        }
        async copyText(text, origin, status, isCurrent, messages = ['tasksCopying', 'tasksCopySuccess', 'tasksCopyFailure'], content = null) {
            const lifecycle = viewLifecycles.get(this);
            const sourceCurrent = () => viewSourceCurrent(this, lifecycle);
            if (!sourceCurrent() || lifecycle.copyAttempt || this.copyAttempt || !isCurrent() || !sourceCurrent()) return;
            const controller = lifecycle.source.controller, host = lifecycle.source.host, state = controller.state;
            const attempt = { valid: true, status }; lifecycle.copyAttempt = attempt; this.copyAttempt = attempt;
            const parent = status.parentElement, statusChain = [];
            for (let node = parent; node && node !== host; node = node.parentElement) statusChain.push([node, node.parentElement]);
            let observer = null, cleaned = false, statusText = null;
            const cleanup = () => {
                if (cleaned) return; cleaned = true;
                observer?.disconnect(); document.removeEventListener('visibilitychange', cancel, true);
                root.removeEventListener?.('blur', cancel); root.removeEventListener?.('pagehide', cancel);
            };
            const statusOwned = () => {
                if (lifecycle.copyAttempt !== attempt || this.copyAttempt !== attempt ||
                    status.ownerDocument !== document || status.parentElement !== parent) return false;
                // A detached original subtree remains ours. Adopting that same
                // subtree into any foreign parent, even a detached one, does not.
                for (const [node, originalParent] of statusChain) {
                    if (node.ownerDocument !== document) return false;
                    if (node.parentElement !== originalParent) return node.parentElement === null;
                }
                return true;
            };
            const cancel = () => {
                attempt.valid = false; cleanup();
                // A retired callback cannot erase a newer copy's feedback or a
                // status node that has been adopted by a different host.
                if (statusText !== null && statusOwned() && status.textContent === statusText) {
                    status.textContent = '';
                    if (statusOwned() && status.textContent === '') status.hidden = true;
                }
                // An issued clipboard write cannot be cancelled. Keep its lock.
            };
            attempt.cancel = cancel; attempt.cleanup = cleanup;
            // Remember even a brief hide/detach/closed menu before settlement.
            const targets = content ? [origin, content] : [origin];
            const invalidating = records => records.some(record => content?.contains(record.target) || (record.type === 'attributes'
                ? targets.some(target => record.target.contains(target))
                : Array.from(record.removedNodes || []).some(node => targets.some(target => node === target || node.contains?.(target)))));
            const owns = () => attempt.valid && lifecycle.copyAttempt === attempt && this.copyAttempt === attempt && sourceCurrent() && controller.state === state;
            const current = () => {
                if (observer && invalidating(observer.takeRecords())) cancel();
                // The route's DOM/layout checks may themselves run hooks. Check
                // source and exact-attempt identity again after the final one.
                return owns() && isCurrent() && owns();
            };
            try {
                if (!current()) return;
                // Capture both once before status/control hooks can replace them.
                // Preserve the receiver; no storage or permission work is awaited.
                let clipboard, writeText, clipboardError;
                try { clipboard = this.clipboard; writeText = clipboard?.writeText; } catch (error) { clipboardError = error; }
                if (!current()) return;
                observer = root.MutationObserver ? new root.MutationObserver(records => { if (invalidating(records)) cancel(); }) : null;
                if (!current()) return;
                document.addEventListener('visibilitychange', cancel, true);
                if (!current()) return;
                root.addEventListener?.('blur', cancel);
                if (!current()) return;
                root.addEventListener?.('pagehide', cancel);
                if (!current()) return;
                observer?.observe(document.documentElement, { subtree: true, childList: true, characterData: !!content, attributes: true, attributeFilter: ['hidden', 'inert', 'style', 'class', 'open'] });
                if (!current()) return;
                statusText = t(messages[0]); status.textContent = statusText;
                if (!current()) return;
                status.hidden = false;
                if (!current()) return;
                status.classList.remove('is-error');
                if (!current()) return;
                this.refreshCopyControls();
                if (!current()) return;
                if (clipboardError) throw clipboardError;
                if (typeof writeText !== 'function') throw new Error('Clipboard unavailable');
                await Reflect.apply(writeText, clipboard, [text]);
                if (current()) { statusText = t(messages[1]); status.textContent = statusText; }
            } catch (_) {
                if (current()) {
                    statusText = t(messages[2]); status.textContent = statusText;
                    if (current()) status.classList.add('is-error');
                }
            } finally {
                if (!current()) cancel();
                cleanup();
                const owned = lifecycle.copyAttempt === attempt;
                if (owned) lifecycle.copyAttempt = null;
                if (this.copyAttempt === attempt) this.copyAttempt = null;
                if (owned && sourceCurrent() && !lifecycle.copyAttempt && !this.copyAttempt) this.refreshCopyControls();
            }
        }
        reuseTask(task, item, title, origin) {
            const owner = editSources.get(this), lifecycle = viewLifecycles.get(this);
            const sourceCurrent = () => viewSourceCurrent(this, lifecycle) && this.editSourceCurrent(owner);
            if (!sourceCurrent() || this.localError || !this.copyCurrent(task, item, title, origin) || !sourceCurrent()) return;
            const sourceText = task.text, controller = owner.controller, store = owner.store;
            const subscribe = controller.subscribe.bind(controller);
            // Only this opening's exact command may dismiss its original feedback.
            const dismiss = command => { if (command && controller.retryCommand === command) controller.dismissRetry(command.operationId); };
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
                if (attempt) dismiss(attempt.command); this.render();
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
            const owns = () => viewLifecycles.get(this) === lifecycle && !lifecycle.retired && !this.destroyed &&
                modal.isOpen && this.dialogs.has(modal) && this.reuseSession === modal && input.isConnected;
            const available = () => sourceCurrent() && !!controller.state && !root.LocalItabContentLifecycle?.departing;
            // Native textarea.value normalizes CRLF/CR to LF. Until an actual
            // input event, submit the saved snapshot, including its original breaks.
            const currentText = () => edited ? input.value : sourceText;
            const originalClose = modal.close;
            modal.close = () => {
                const restore = owns() && !focusDeparted && available() && !document.hidden && document.visibilityState !== 'hidden' &&
                    (modal.panel.contains(document.activeElement) || document.activeElement === document.body);
                originalClose(false);
                if (!restore || !available() || this.dialogs.size || document.activeElement !== document.body) return;
                const current = Array.from(this.host.querySelectorAll('[data-task-id]')).find(node => node.dataset.taskId === task.id);
                const target = current?.querySelector('.tasks-reuse-text');
                const visible = node => {
                    if (!node?.isConnected || node.disabled || node.closest('[hidden], [inert]') || !node.getClientRects().length ||
                        ['hidden', 'collapse'].includes(root.getComputedStyle?.(node).visibility)) return false;
                    for (let parent = node.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS' && !parent.open) return false;
                    return true;
                };
                if (visible(target) && available()) target.focus(); else if (visible(this.input) && available()) this.input.focus();
            };
            const setControl = (node, disabled, hidden = false) => {
                if (document.activeElement === node && (disabled || hidden)) input.focus();
                node.disabled = disabled; node.hidden = hidden;
            };
            const update = () => {
                if (!owns()) return;
                // A source gap can explain the conflict in this old opening, but
                // cannot disable a newly focused control or transfer its focus.
                if (!available()) { setFeedback(t(sourceCurrent() ? 'tasksErrorUnavailable' : 'tasksConflict'), true); return; }
                const blocked = saving || !!controller.pending || composing;
                setControl(add, blocked || !!retryCommand);
                setControl(retry, blocked, !retryCommand);
                previous.hidden = !retryCommand;
                previousText.textContent = retryCommand ? retryCommand.text : '';
            };
            const submit = async (retryPrevious = false) => {
                if (!owns() || !available() || saving || controller.pending || composing) return;
                if (retryPrevious) {
                    if (!retryCommand || !attempt || retryCommand !== attempt.command ||
                        (controller.retryCommand && controller.retryCommand !== retryCommand)) return;
                } else {
                    if (retryCommand) return;
                    // Request hooks cannot give an old snapshot a newer IME/ABA generation.
                    const text = currentText(), submittedGeneration = generation;
                    const command = store.request('add', { text });
                    if (!owns() || !available() || controller.pending) return;
                    attempt = { command, generation: submittedGeneration, text };
                }
                const submitted = attempt, command = submitted.command;
                saving = true; this.reuseOperationId = command.operationId; setFeedback(t('tasksSaving')); update();
                // Focus/disabled-control work can also invalidate the captured source.
                if (!owns() || !available() || controller.pending) {
                    saving = false; if (owns()) update(); return;
                }
                try {
                    const state = await controller.run(command);
                    if (!owns() || attempt !== submitted) return;
                    // A completed receipt still needs an explicit acknowledgement
                    // after a source gap; never turn it silently into another Add.
                    if (!available()) { retryCommand = command; setFeedback(t('tasksConflict'), true); return; }
                    retryCommand = null; attempt = null;
                    // Only this opening's unchanged draft and current confirmed
                    // receipt may close. A new IME, ABA edit or later state owns itself.
                    if (!composing && generation === submitted.generation && currentText() === submitted.text &&
                        controller.state?.revision === state.revision && !controller.pending &&
                        (!controller.retryCommand || controller.retryCommand === command) &&
                        state.receipts.at(-1) === command.operationId) modal.close();
                    else setFeedback(t('tasksReuseDraftRemains'));
                } catch (error) {
                    if (!owns()) { dismiss(command); return; }
                    if (attempt !== submitted) return;
                    if (!available()) { retryCommand = command; setFeedback(t('tasksConflict'), true); return; }
                    if (['READ', 'WRITE', 'VERIFY'].includes(error.code)) {
                        // Input changes never abandon an uncertain operation or
                        // change its text. Retry is a separate explicit action.
                        retryCommand = command; setFeedback(`${errorText(error)} ${t('tasksReuseUncertain')}`, true);
                    } else {
                        retryCommand = null; attempt = null;
                        dismiss(command); setFeedback(errorText(error), true);
                    }
                } finally {
                    saving = false;
                    if (!owns()) dismiss(command);
                    if (sourceCurrent() && (!this.reuseSession || this.reuseSession === modal) &&
                        this.reuseOperationId === command.operationId) this.reuseOperationId = null;
                    if (owns()) update();
                    if (sourceCurrent()) this.render();
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
            unsubscribe = subscribe(update); modal.open(input);
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
        moveLastSourceCurrent(owner) {
            const c = owner.controller, workspace = owner.backend?.workspace ?? null;
            return this.moveLastOwner === owner && this.host === owner.host && this.list === owner.list &&
                this.controller === c && c.store === owner.store && c.store.backend === owner.backend && !c.closed &&
                workspace === owner.workspace && workspace?.id === owner.workspaceId && workspace?.generation === owner.workspaceGeneration &&
                !workspace?.invalidated && !workspace?._suspended && (root.LocalItabWorkspaces?.session ?? null) === owner.session &&
                // Older backends may expose only an availability object, without
                // a workspace service. Its original identity still cannot change.
                (!workspace || owner.session === workspace || (owner.legacyAvailability && root.LocalItabWorkspaces == null));
        }
        moveLastCurrent(source) {
            const owner = source.owner;
            // Recheck page/filter DOM state before the final non-layout source checks.
            if (document.hidden || document.visibilityState === 'hidden' || owner.filterInput.value.trim() || this.filterInput !== owner.filterInput) return false;
            if (!this.moveLastSourceCurrent(owner)) return false;
            const c = owner.controller;
            const reviewedConflict = c.error?.code === 'CONFLICT' && !!c.retryCommand && source.conflictCommand === c.retryCommand;
            if (this.destroyed || c.pending || (c.error && !reviewedConflict) || (c.retryCommand && !reviewedConflict) || this.localError ||
                ['loading', 'saving'].includes(c.status) || (c.status === 'error' && !reviewedConflict) ||
                this.filterQuery || this.filterComposing || this.dialogs.size || this.pendingReview ||
                this.batchSession || this.reuseSession || this.completionSession || this.restorationSession ||
                root.LocalItabContentLifecycle?.departing || this.moveLastGeneration !== source.generation) return false;
            // Read the current saved state after page/filter and any layout inspection.
            const state = c.state, current = state?.records.find(record => record.id === source.snapshot.id);
            return !!current && current.state === 'active' && source.order.at(-1) !== source.snapshot.id &&
                Object.keys(source.snapshot).every(key => current[key] === source.snapshot[key]) &&
                JSON.stringify(state.records.filter(record => record.state === 'active').map(record => record.id)) === JSON.stringify(source.order);
        }
        moveLastVisible(source) {
            const { owner, item, title, actions, menu, summary, last } = source;
            if (this.filterInput.value.trim() || document.hidden || document.visibilityState === 'hidden' ||
                last.disabled || last.getAttribute('disabled') != null || last.getAttribute('aria-disabled') === 'true' ||
                !last.isConnected || item.dataset.taskId !== source.snapshot.id || item.parentElement !== owner.list ||
                Array.from(owner.list.children).find(node => node.dataset.taskId === source.snapshot.id) !== item ||
                item.querySelector('.tasks-text') !== title || title.textContent !== source.snapshot.text || title.children.length ||
                item.querySelector('.tasks-row-actions') !== actions || item.querySelector('.tasks-row-menu') !== menu ||
                menu.querySelector('summary') !== summary || actions.querySelector('.tasks-move-last') !== last ||
                [...owner.chain, ...source.chain].some(([node, parent]) => node.ownerDocument !== document || node.parentElement !== parent)) return false;
            for (const displayed of [last, title]) {
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
        stepMoveSourceCurrent(owner) {
            const c = owner.controller, workspace = owner.backend?.workspace ?? null;
            return this.stepMoveOwner === owner && this.host === owner.host && this.list === owner.list &&
                this.controller === c && c.store === owner.store && c.store.backend === owner.backend && !c.closed &&
                workspace === owner.workspace && workspace?.id === owner.workspaceId && workspace?.generation === owner.workspaceGeneration &&
                !workspace?.invalidated && !workspace?._suspended && (root.LocalItabWorkspaces?.session ?? null) === owner.session &&
                // Older backends may expose only an availability object, without
                // a workspace service. Its original identity still cannot change.
                (!workspace || owner.session === workspace || (owner.legacyAvailability && root.LocalItabWorkspaces == null));
        }
        stepMoveCurrent(source) {
            const owner = source.owner;
            // Recheck page/filter DOM state before the final non-layout source checks.
            if (document.hidden || document.visibilityState === 'hidden' || owner.filterInput.value.trim() || this.filterInput !== owner.filterInput) return false;
            if (!this.stepMoveSourceCurrent(owner)) return false;
            const c = owner.controller;
            const reviewedConflict = c.error?.code === 'CONFLICT' && !!c.retryCommand && source.conflictCommand === c.retryCommand;
            if (this.destroyed || c.pending || (c.error && !reviewedConflict) || (c.retryCommand && !reviewedConflict) || this.localError ||
                ['loading', 'saving'].includes(c.status) || (c.status === 'error' && !reviewedConflict) ||
                this.filterQuery || this.filterComposing || this.dialogs.size || this.pendingReview ||
                this.batchSession || this.reuseSession || this.completionSession || this.restorationSession ||
                root.LocalItabContentLifecycle?.departing || this.moveLastGeneration !== source.generation) return false;
            // Read the current saved state after page/filter and any layout inspection.
            const state = c.state, current = state?.records.find(record => record.id === source.snapshot.id);
            const index = source.order.indexOf(source.snapshot.id), neighbor = source.order[index + source.direction];
            return !!current && current.state === 'active' && index >= 0 && !!neighbor &&
                (source.direction === -1 || source.direction === 1) &&
                Object.keys(source.snapshot).every(key => current[key] === source.snapshot[key]) &&
                JSON.stringify(state.records.filter(record => record.state === 'active').map(record => record.id)) === JSON.stringify(source.order);
        }
        stepMoveVisible(source) {
            const { owner, item, title, actions, menu, summary, action } = source;
            if (this.filterInput.value.trim() || document.hidden || document.visibilityState === 'hidden' ||
                action.disabled || action.getAttribute('disabled') != null || action.getAttribute('aria-disabled') === 'true' ||
                !action.isConnected || item.dataset.taskId !== source.snapshot.id || item.parentElement !== owner.list ||
                Array.from(owner.list.children).find(node => node.dataset.taskId === source.snapshot.id) !== item ||
                item.querySelector('.tasks-text') !== title || title.textContent !== source.snapshot.text || title.children.length ||
                item.querySelector('.tasks-row-actions') !== actions || item.querySelector('.tasks-row-menu') !== menu ||
                menu.querySelector('summary') !== summary || !actions.contains(action) ||
                [...owner.chain, ...source.chain].some(([node, parent]) => node.ownerDocument !== document || node.parentElement !== parent)) return false;
            for (const displayed of [action, title]) {
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
        pinSourceCurrent(owner) {
            const c = owner.controller, workspace = owner.backend?.workspace ?? null;
            return this.pinOwner === owner && this.host === owner.host && this.list === owner.list &&
                this.controller === c && c.store === owner.store && c.store.backend === owner.backend && !c.closed &&
                workspace === owner.workspace && workspace?.id === owner.workspaceId && workspace?.generation === owner.workspaceGeneration &&
                !workspace?.invalidated && !workspace?._suspended && (root.LocalItabWorkspaces?.session ?? null) === owner.session &&
                (!workspace || owner.session === workspace || (owner.legacyAvailability && root.LocalItabWorkspaces == null));
        }
        pinCurrent(source) {
            const owner = source.owner;
            // A current filtered row is a valid choice; only an obsolete filter result is rejected.
            if (document.hidden || document.visibilityState === 'hidden' || this.filterInput !== owner.filterInput ||
                owner.filterInput.value.trim().toLowerCase() !== source.filter || source.pin.textContent !== source.label ||
                source.pin.children.length || source.pin.dataset.taskAction !== source.label || source.pin.getAttribute('aria-label') != null ||
                source.pin.getAttribute('aria-pressed') !== String(source.pinned) || source.item.classList.contains('is-pinned') !== source.pinned) return false;
            if (!this.pinSourceCurrent(owner)) return false;
            const c = owner.controller;
            const reviewedConflict = c.error?.code === 'CONFLICT' && !!c.retryCommand && source.conflictCommand === c.retryCommand;
            if (this.destroyed || c.pending || (c.error && !reviewedConflict) || (c.retryCommand && !reviewedConflict) || this.localError ||
                ['loading', 'saving'].includes(c.status) || (c.status === 'error' && !reviewedConflict) ||
                this.filterQuery !== source.filter || this.filterComposing || this.dialogs.size || this.pendingReview ||
                this.batchSession || this.reuseSession || this.completionSession || this.restorationSession ||
                root.LocalItabContentLifecycle?.departing || this.pinGeneration !== source.generation) return false;
            const state = c.state, current = state?.records.find(record => record.id === source.snapshot.id);
            return !!current && current.state === 'active' && state.pinnedId === source.expectedPin &&
                Object.keys(source.snapshot).every(key => current[key] === source.snapshot[key]);
        }
        pinVisible(source) {
            const { owner, item, title, actions, menu, summary, pin } = source;
            if (document.hidden || document.visibilityState === 'hidden' || owner.filterInput.value.trim().toLowerCase() !== source.filter ||
                pin.disabled || pin.getAttribute('disabled') != null || pin.getAttribute('aria-disabled') === 'true' ||
                !pin.isConnected || item.dataset.taskId !== source.snapshot.id || item.parentElement !== owner.list ||
                Array.from(owner.list.children).find(node => node.dataset.taskId === source.snapshot.id) !== item ||
                item.querySelector('.tasks-text') !== title || title.textContent !== source.snapshot.text || title.children.length ||
                item.querySelector('.tasks-row-actions') !== actions || item.querySelector('.tasks-row-menu') !== menu ||
                menu.querySelector('summary') !== summary || !actions.contains(pin) ||
                pin.textContent !== source.label || pin.children.length || pin.dataset.taskAction !== source.label ||
                pin.getAttribute('aria-pressed') !== String(source.pinned) || pin.getAttribute('aria-label') != null ||
                item.classList.contains('is-pinned') !== source.pinned ||
                [...owner.chain, ...source.chain].some(([node, parent]) => node.ownerDocument !== document || node.parentElement !== parent)) return false;
            for (const displayed of [pin, title]) {
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
        pinStaleFeedback(source) {
            const owner = source.owner, c = owner.controller, feedback = owner.feedback, status = owner.status;
            const available = () => !this.destroyed && !c.pending && !c.error && !c.retryCommand && !this.localError &&
                !['loading', 'saving', 'error'].includes(c.status) && !this.dialogs.size && !this.pendingReview &&
                !this.batchSession && !this.reuseSession && !this.completionSession && !this.restorationSession &&
                !root.LocalItabContentLifecycle?.departing;
            if (!available() || !this.pinSourceCurrent(owner) || !c.state || c.state.pinnedId === source.expectedPin ||
                document.hidden || document.visibilityState === 'hidden' || this.feedback !== feedback || this.status !== status || feedback.parentElement !== owner.host || status.parentElement !== feedback ||
                status.getAttribute('role') !== 'status' || status.getAttribute('aria-live') !== 'polite' ||
                owner.chain.some(([node, parent]) => node.ownerDocument !== document || node.parentElement !== parent) ||
                feedback.ownerDocument !== document || status.ownerDocument !== document || !status.isConnected || !status.getClientRects().length) return;
            for (let node = status; node; node = node.parentElement) {
                const style = root.getComputedStyle?.(node);
                if (node.hidden || node.inert || node.disabled || node.getAttribute('aria-hidden') === 'true' ||
                    node.style.display === 'none' || ['hidden', 'collapse'].includes(node.style.visibility) ||
                    style?.display === 'none' || ['hidden', 'collapse'].includes(style?.visibility) ||
                    (node.tagName === 'DETAILS' && !node.open)) return;
            }
            // This is local visible feedback, never a simulated Controller/Store failure or receipt.
            // Recheck source and state after layout; a normal render or new choice clears the notice.
            if (document.hidden || document.visibilityState === 'hidden' || this.feedback !== feedback || this.status !== status ||
                feedback.parentElement !== owner.host || status.parentElement !== feedback || !status.isConnected ||
                owner.chain.some(([node, parent]) => node.ownerDocument !== document || node.parentElement !== parent) ||
                !available() || !this.pinSourceCurrent(owner) || !c.state || c.state.pinnedId === source.expectedPin) return;
            status.textContent = errorText({ code: 'CONFLICT' }); feedback.classList.add('is-error');
        }
        completeSourceCurrent(owner) {
            const c = owner.controller, workspace = owner.backend?.workspace ?? null;
            return this.completeOwner === owner && this.host === owner.host && this.list === owner.list &&
                this.controller === c && c.store === owner.store && c.store.backend === owner.backend && !c.closed &&
                workspace === owner.workspace && workspace?.id === owner.workspaceId && workspace?.generation === owner.workspaceGeneration &&
                !workspace?.invalidated && !workspace?._suspended && (root.LocalItabWorkspaces?.session ?? null) === owner.session &&
                (!workspace || owner.session === workspace || (owner.legacyAvailability && root.LocalItabWorkspaces == null));
        }
        completeCurrent(source) {
            const { owner, item, top, title, action } = source;
            // These checks perform no layout reads. Repeat them after the last visibility lookup,
            // so a changed visible original, DOM source or saved task cannot create a command.
            if (document.hidden || document.visibilityState === 'hidden' || this.filter !== owner.filter || this.filterInput !== owner.filterInput ||
                owner.filterInput.value.trim().toLowerCase() !== source.filter || this.filterQuery !== source.filter || this.renderedFilter !== source.filter ||
                action.disabled || action.getAttribute('disabled') != null || action.getAttribute('aria-disabled') === 'true' ||
                !action.isConnected || action.textContent !== '○' || action.children.length || action.dataset.taskAction !== '○' ||
                action.title !== source.label || action.getAttribute('aria-label') !== `${source.label}: ${source.snapshot.text}` ||
                item.dataset.taskId !== source.snapshot.id || item.parentElement !== owner.list ||
                Array.from(owner.list.children).find(node => node.dataset.taskId === source.snapshot.id) !== item ||
                item.querySelector('.tasks-row-main') !== top || item.querySelector('.tasks-check') !== action ||
                item.querySelector('.tasks-text') !== title || title.textContent !== source.snapshot.text || title.children.length || title.classList.contains('is-done') ||
                top.children.length !== 2 || top.children[0] !== action || top.children[1] !== title ||
                [...owner.chain, ...source.chain].some(([node, parent]) => node.ownerDocument !== document || node.parentElement !== parent)) return false;
            for (const displayed of [action, title]) for (let node = displayed; node; node = node.parentElement) {
                if (node.hidden || node.inert || node.disabled || node.getAttribute('aria-hidden') === 'true' ||
                    node.style.display === 'none' || ['hidden', 'collapse'].includes(node.style.visibility) ||
                    (node.tagName === 'DETAILS' && !node.open)) return false;
            }
            if (!this.completeSourceCurrent(owner)) return false;
            const c = owner.controller;
            const reviewedConflict = c.error?.code === 'CONFLICT' && !!c.retryCommand && source.conflictCommand === c.retryCommand;
            if (this.destroyed || c.pending || (c.error && !reviewedConflict) || (c.retryCommand && !reviewedConflict) || this.localError ||
                ['loading', 'saving'].includes(c.status) || (c.status === 'error' && !reviewedConflict) ||
                this.filterComposing || this.dialogs.size || this.pendingReview ||
                this.batchSession || this.reuseSession || this.completionSession || this.restorationSession ||
                root.LocalItabContentLifecycle?.departing || this.completeGeneration !== source.generation) return false;
            // Ordinary complete is task-version/active CAS only: unrelated order and pin are independent.
            const current = c.state?.records.find(record => record.id === source.snapshot.id);
            return !!current && current.state === 'active' && Object.keys(source.snapshot).every(key => current[key] === source.snapshot[key]);
        }
        completeVisible(source) {
            for (const displayed of [source.action, source.title]) {
                if (!displayed.getClientRects().length) return false;
                for (let node = displayed; node; node = node.parentElement) {
                    const style = root.getComputedStyle?.(node);
                    if (style?.display === 'none' || ['hidden', 'collapse'].includes(style?.visibility)) return false;
                }
            }
            return true;
        }
        rowReopenSourceCurrent(owner) {
            const c = owner.controller, workspace = owner.backend?.workspace ?? null;
            return this.rowReopenOwner === owner && this.host === owner.host && this.completed === owner.completed &&
                this.completed.box === owner.box && this.completed.summary === owner.summary && this.completed.list === owner.list &&
                this.filter === owner.filter && this.filterInput === owner.filterInput &&
                this.controller === c && c.store === owner.store && c.store.backend === owner.backend && !c.closed &&
                workspace === owner.workspace && workspace?.id === owner.workspaceId && workspace?.generation === owner.workspaceGeneration &&
                !workspace?.invalidated && !workspace?._suspended && (root.LocalItabWorkspaces?.session ?? null) === owner.session &&
                (!workspace || owner.session === workspace || (owner.legacyAvailability && root.LocalItabWorkspaces == null));
        }
        rowReopenCurrent(source) {
            const { owner, item, top, title, action } = source;
            // Repeat non-layout checks after the final visibility lookup, including exact DONE text and source.
            if (document.hidden || document.visibilityState === 'hidden' || !owner.box.open ||
                owner.filterInput.value.trim().toLowerCase() !== source.filter || this.filterQuery !== source.filter || this.renderedFilter !== source.filter ||
                action.disabled || action.getAttribute('disabled') != null || action.getAttribute('aria-disabled') === 'true' ||
                !action.isConnected || action.textContent !== '↶' || action.children.length || action.dataset.taskAction !== '↶' ||
                action.title !== source.label || action.getAttribute('aria-label') !== `${source.label}: ${source.snapshot.text}` ||
                item.dataset.taskId !== source.snapshot.id || item.parentElement !== owner.list ||
                Array.from(owner.list.children).find(node => node.dataset.taskId === source.snapshot.id) !== item ||
                item.querySelector('.tasks-row-main') !== top || item.querySelector('.tasks-check') !== action ||
                item.querySelector('.tasks-text') !== title || title.textContent !== source.snapshot.text || title.children.length || !title.classList.contains('is-done') ||
                top.children.length !== 2 || top.children[0] !== action || top.children[1] !== title ||
                [...owner.chain, ...source.chain].some(([node, parent]) => node.ownerDocument !== document || node.parentElement !== parent)) return false;
            for (const displayed of [action, title]) for (let node = displayed; node; node = node.parentElement) {
                if (node.hidden || node.inert || node.disabled || node.getAttribute('aria-hidden') === 'true' ||
                    node.style.display === 'none' || ['hidden', 'collapse'].includes(node.style.visibility) ||
                    (node.tagName === 'DETAILS' && !node.open)) return false;
            }
            if (!this.rowReopenSourceCurrent(owner)) return false;
            const c = owner.controller;
            const reviewedConflict = c.error?.code === 'CONFLICT' && !!c.retryCommand && source.conflictCommand === c.retryCommand;
            if (this.destroyed || c.pending || (c.error && !reviewedConflict) || (c.retryCommand && !reviewedConflict) || this.localError ||
                ['loading', 'saving'].includes(c.status) || (c.status === 'error' && !reviewedConflict) ||
                this.filterComposing || this.dialogs.size || this.pendingReview ||
                this.batchSession || this.reuseSession || this.completionSession || this.restorationSession ||
                root.LocalItabContentLifecycle?.departing || this.rowReopenGeneration !== source.generation) return false;
            // Reopen keeps task-version/DONE CAS only; unrelated revisions, order and pin remain independent.
            const current = c.state?.records.find(record => record.id === source.snapshot.id);
            return !!current && current.state === 'done' && Object.keys(source.snapshot).every(key => current[key] === source.snapshot[key]);
        }
        rowReopenVisible(source) {
            for (const displayed of [source.action, source.title]) {
                if (!displayed.getClientRects().length) return false;
                for (let node = displayed; node; node = node.parentElement) {
                    const style = root.getComputedStyle?.(node);
                    if (style?.display === 'none' || ['hidden', 'collapse'].includes(style?.visibility)) return false;
                }
            }
            return true;
        }
        rowRemoveSourceCurrent(owner) {
            const c = owner.controller, workspace = owner.backend?.workspace ?? null;
            return this.rowRemoveOwner === owner && this.host === owner.host && this.list === owner.activeList &&
                this.completed === owner.completed && this.completed.box === owner.box && this.completed.summary === owner.summary &&
                this.completed.list === owner.doneList && this.filter === owner.filter && this.filterInput === owner.filterInput &&
                this.controller === c && c.store === owner.store && c.store.backend === owner.backend && !c.closed &&
                workspace === owner.workspace && workspace?.id === owner.workspaceId && workspace?.generation === owner.workspaceGeneration &&
                !workspace?.invalidated && !workspace?._suspended && (root.LocalItabWorkspaces?.session ?? null) === owner.session &&
                owner.chain.every(([node, parent]) => node.ownerDocument === document && node.parentElement === parent) &&
                (!workspace || owner.session === workspace || (owner.legacyAvailability && root.LocalItabWorkspaces == null));
        }
        rowRemoveCurrent(source) {
            const { owner, list, item, top, title, check, action, actions, menu, summary } = source;
            // All non-layout checks repeat after the last computed-style lookup.
            if (document.hidden || document.visibilityState === 'hidden' ||
                (source.snapshot.state === 'done' && !owner.box.open) || !menu.open ||
                owner.filterInput.value.trim().toLowerCase() !== source.filter || this.filterQuery !== source.filter || this.renderedFilter !== source.filter ||
                action.disabled || action.getAttribute('disabled') != null || action.getAttribute('aria-disabled') === 'true' ||
                !action.isConnected || action.textContent !== source.label || action.children.length || action.dataset.taskAction !== source.label ||
                action.type !== 'button' || action.title !== source.actionTitle || action.getAttribute('aria-label') !== source.actionAria ||
                item.dataset.taskId !== source.snapshot.id || item.parentElement !== list ||
                Array.from(list.children).find(node => node.dataset.taskId === source.snapshot.id) !== item ||
                item.querySelector('.tasks-row-main') !== top || item.querySelector('.tasks-check') !== check ||
                item.querySelector('.tasks-text') !== title || title.textContent !== source.snapshot.text || title.children.length ||
                title.classList.contains('is-done') !== (source.snapshot.state === 'done') ||
                top.children.length !== 2 || top.children[0] !== check || top.children[1] !== title ||
                item.querySelector('.tasks-row-actions') !== actions || item.querySelector('.tasks-row-menu') !== menu ||
                menu.querySelector('summary') !== summary || summary.textContent !== source.menuLabel || summary.children.length || summary.dataset.taskAction !== 'menu' ||
                [...owner.chain, ...source.chain].some(([node, parent]) => node.ownerDocument !== document || node.parentElement !== parent)) return false;
            for (const displayed of [action, title]) for (let node = displayed; node; node = node.parentElement) {
                if (node.hidden || node.inert || node.disabled || node.getAttribute('aria-hidden') === 'true' ||
                    node.style.display === 'none' || ['hidden', 'collapse'].includes(node.style.visibility) ||
                    (node.tagName === 'DETAILS' && !node.open)) return false;
            }
            if (!this.rowRemoveSourceCurrent(owner)) return false;
            const c = owner.controller;
            const reviewedConflict = c.error?.code === 'CONFLICT' && !!c.retryCommand && source.conflictCommand === c.retryCommand;
            if (this.destroyed || c.pending || (c.error && !reviewedConflict) || (c.retryCommand && !reviewedConflict) || this.localError ||
                ['loading', 'saving'].includes(c.status) || (c.status === 'error' && !reviewedConflict) ||
                this.filterComposing || this.dialogs.size || this.pendingReview ||
                this.batchSession || this.reuseSession || this.completionSession || this.restorationSession ||
                root.LocalItabContentLifecycle?.departing || rowRemoveLifecycles.get(this) !== source.lifecycle) return false;
            // Store alone owns removedFrom/unpin and task-version/non-removed CAS.
            // No unrelated revision, active-order or pin is added to this command.
            const current = c.state?.records.find(record => record.id === source.snapshot.id);
            return !!current && ['active', 'done'].includes(current.state) && Object.keys(source.snapshot).every(key => current[key] === source.snapshot[key]);
        }
        rowRemoveVisible(source) {
            for (const displayed of [source.action, source.title]) {
                if (!displayed.getClientRects().length) return false;
                for (let node = displayed; node; node = node.parentElement) {
                    const style = root.getComputedStyle?.(node);
                    if (style?.display === 'none' || ['hidden', 'collapse'].includes(style?.visibility)) return false;
                }
            }
            return true;
        }
        rowRestoreSourceCurrent(owner) {
            const c = owner.controller, workspace = owner.backend?.workspace ?? null;
            return this.rowRestoreOwner === owner && this.host === owner.host && this.removed === owner.removed &&
                this.removed.box === owner.box && this.removed.summary === owner.summary && this.removed.list === owner.list &&
                this.filter === owner.filter && this.filterInput === owner.filterInput &&
                this.controller === c && c.store === owner.store && c.store.backend === owner.backend && !c.closed &&
                workspace === owner.workspace && workspace?.id === owner.workspaceId && workspace?.generation === owner.workspaceGeneration &&
                !workspace?.invalidated && !workspace?._suspended && (root.LocalItabWorkspaces?.session ?? null) === owner.session &&
                owner.chain.every(([node, parent]) => node.ownerDocument === document && node.parentElement === parent) &&
                (!workspace || owner.session === workspace || (owner.legacyAvailability && root.LocalItabWorkspaces == null));
        }
        rowRestoreCurrent(source) {
            const { owner, item, top, title, action, actions, copy, reuse } = source;
            // Repeat every non-layout check after the final visibility lookup.
            if (document.hidden || document.visibilityState === 'hidden' || !owner.box.open ||
                owner.filterInput.value.trim().toLowerCase() !== source.filter || this.filterQuery !== source.filter || this.renderedFilter !== source.filter ||
                action.disabled || action.getAttribute('disabled') != null || action.getAttribute('aria-disabled') === 'true' ||
                !action.isConnected || action.textContent !== source.label || action.children.length || action.dataset.taskAction !== source.label ||
                action.type !== 'button' || action.title !== source.actionTitle || action.getAttribute('aria-label') !== source.actionAria ||
                item.dataset.taskId !== source.snapshot.id || item.parentElement !== owner.list ||
                Array.from(owner.list.children).find(node => node.dataset.taskId === source.snapshot.id) !== item ||
                item.querySelector('.tasks-row-main') !== top || item.querySelector('.tasks-check') || item.querySelector('.tasks-row-menu') ||
                item.querySelector('.tasks-text') !== title || title.textContent !== source.snapshot.text || title.children.length || title.classList.contains('is-done') ||
                top.children.length !== 1 || top.children[0] !== title || item.querySelector('.tasks-row-actions') !== actions ||
                actions.children.length !== 3 || actions.children[0] !== copy || actions.children[1] !== reuse || actions.children[2] !== action ||
                [...owner.chain, ...source.chain].some(([node, parent]) => node.ownerDocument !== document || node.parentElement !== parent)) return false;
            for (const displayed of [action, title]) for (let node = displayed; node; node = node.parentElement) {
                if (node.hidden || node.inert || node.disabled || node.getAttribute('aria-hidden') === 'true' ||
                    node.style.display === 'none' || ['hidden', 'collapse'].includes(node.style.visibility) ||
                    (node.tagName === 'DETAILS' && !node.open)) return false;
            }
            if (!this.rowRestoreSourceCurrent(owner)) return false;
            const c = owner.controller;
            const reviewedConflict = c.error?.code === 'CONFLICT' && !!c.retryCommand && source.conflictCommand === c.retryCommand;
            if (this.destroyed || c.pending || (c.error && !reviewedConflict) || (c.retryCommand && !reviewedConflict) || this.localError ||
                ['loading', 'saving'].includes(c.status) || (c.status === 'error' && !reviewedConflict) ||
                this.filterComposing || this.dialogs.size || this.pendingReview ||
                this.batchSession || this.reuseSession || this.completionSession || this.restorationSession ||
                root.LocalItabContentLifecycle?.departing || rowRestoreLifecycles.get(this) !== source.lifecycle) return false;
            // Store alone owns removedFrom restoration and removed-state/task-version CAS.
            // Unrelated revisions, active order and pin remain independent; Restore never repins.
            const current = c.state?.records.find(record => record.id === source.snapshot.id);
            return !!current && current.state === 'removed' && Object.keys(source.snapshot).every(key => current[key] === source.snapshot[key]);
        }
        rowRestoreVisible(source) {
            for (const displayed of [source.action, source.title]) {
                if (!displayed.getClientRects().length) return false;
                for (let node = displayed; node; node = node.parentElement) {
                    const style = root.getComputedStyle?.(node);
                    if (style?.display === 'none' || ['hidden', 'collapse'].includes(style?.visibility)) return false;
                }
            }
            return true;
        }
        row(task, index, active) {
            const item = el('li', 'tasks-row'); item.dataset.taskId = task.id;
            let firstSource = null, lastSource = null;
            let pinSource = null, removeSource = null;
            const stepSources = [];
            const top = el('div', 'tasks-row-main');
            const title = el('span', 'tasks-text', task.text); if (task.state === 'done') title.classList.add('is-done');
            if (task.state === 'active') {
                const source = { owner: this.completeOwner, generation: this.completeGeneration, item, top, title,
                    filter: this.filterQuery, snapshot: Object.freeze({ ...task }), label: t('tasksComplete'),
                    conflictCommand: this.controller.error?.code === 'CONFLICT' ? this.controller.retryCommand : null, chain: [] };
                const complete = button('tasksComplete', event => {
                    if (event.defaultPrevented || event.detail > 1 || event.repeat || event.isComposing || event.keyCode === 229 ||
                        event.target !== complete || (event.currentTarget && event.currentTarget !== complete)) return;
                    if (!this.completeCurrent(source) || !this.completeVisible(source) || !this.completeCurrent(source)) return;
                    this.perform(source.owner.store.request('complete', { id: source.snapshot.id, version: source.snapshot.version }));
                }, 'tasks-check');
                complete.textContent = '○'; complete.title = source.label;
                complete.setAttribute('aria-label', `${source.label}: ${source.snapshot.text}`);
                complete.addEventListener('keydown', event => {
                    if (['Enter', ' '].includes(event.key) && (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault();
                });
                source.action = complete;
                source.chain.push([complete, top], [title, top], [top, item], [item, source.owner.list]);
                top.append(complete);
            } else if (task.state === 'done') {
                const source = { owner: this.rowReopenOwner, generation: this.rowReopenGeneration, item, top, title,
                    filter: this.filterQuery, snapshot: Object.freeze({ ...task }), label: t('tasksReopen'),
                    conflictCommand: this.controller.error?.code === 'CONFLICT' ? this.controller.retryCommand : null, chain: [] };
                const reopen = button('tasksReopen', event => {
                    if (event.defaultPrevented || event.detail > 1 || event.repeat || event.isComposing || event.keyCode === 229 ||
                        event.target !== reopen || (event.currentTarget && event.currentTarget !== reopen)) return;
                    if (!this.rowReopenCurrent(source) || !this.rowReopenVisible(source) || !this.rowReopenCurrent(source)) return;
                    const command = source.owner.store.request('reopen', { id: source.snapshot.id, version: source.snapshot.version });
                    this.rowReopenAttempt = Object.freeze({ command, owner: source.owner });
                    this.perform(command);
                }, 'tasks-check');
                reopen.textContent = '↶'; reopen.title = source.label;
                reopen.setAttribute('aria-label', `${source.label}: ${source.snapshot.text}`);
                reopen.addEventListener('keydown', event => {
                    if (['Enter', ' '].includes(event.key) && (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault();
                });
                source.action = reopen;
                source.chain.push([reopen, top], [title, top], [top, item], [item, source.owner.list]);
                top.append(reopen);
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
            if (task.state === 'removed') {
                const source = { owner: this.rowRestoreOwner, lifecycle: rowRestoreLifecycles.get(this), item, top, title, actions, copy, reuse,
                    filter: this.filterQuery, snapshot: Object.freeze({ ...task }), label: t('tasksRestore'),
                    conflictCommand: this.controller.error?.code === 'CONFLICT' ? this.controller.retryCommand : null, chain: [] };
                const restore = button('tasksRestore', event => {
                    if (event.defaultPrevented || event.detail > 1 || event.repeat || event.isComposing || event.keyCode === 229 ||
                        event.target !== restore || (event.currentTarget && event.currentTarget !== restore)) return;
                    if (!this.rowRestoreCurrent(source) || !this.rowRestoreVisible(source) || !this.rowRestoreCurrent(source)) return;
                    const command = source.owner.store.request('restore', { id: source.snapshot.id, version: source.snapshot.version });
                    this.rowRestoreAttempt = Object.freeze({ command, owner: source.owner });
                    this.perform(command);
                });
                restore.addEventListener('keydown', event => {
                    if (['Enter', ' '].includes(event.key) && (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault();
                });
                source.action = restore; source.actionTitle = restore.title; source.actionAria = restore.getAttribute('aria-label');
                source.chain.push([restore, actions], [copy, actions], [reuse, actions], [actions, item], [title, top], [top, item], [item, source.owner.list]);
                actions.append(restore);
            }
            else {
                if (task.state === 'active') {
                    const expectedPin = this.controller.state.pinnedId; const pinned = expectedPin === task.id; item.classList.toggle('is-pinned', pinned);
                    const choice = { owner: this.pinOwner, generation: this.pinGeneration, item, title, actions, expectedPin, pinned,
                        filter: this.filterQuery, snapshot: Object.freeze({ ...task }), label: t(pinned ? 'tasksUnpin' : 'tasksPin'),
                        conflictCommand: this.controller.error?.code === 'CONFLICT' ? this.controller.retryCommand : null, chain: [] };
                    const pin = button(pinned ? 'tasksUnpin' : 'tasksPin', event => {
                        if (event.defaultPrevented || event.detail > 1 || event.repeat || event.isComposing || event.keyCode === 229 ||
                            event.target !== pin || (event.currentTarget && event.currentTarget !== pin)) return;
                        if (!this.pinCurrent(choice) || !this.pinVisible(choice) || !this.pinCurrent(choice)) { this.pinStaleFeedback(choice); return; }
                        // The original expectedPin is the CAS condition; unrelated ordering is independent.
                        this.perform(choice.owner.store.request('pin', { id: choice.snapshot.id, version: choice.snapshot.version, expectedPin: choice.expectedPin }));
                    });
                    pin.addEventListener('keydown', event => {
                        if (['Enter', ' '].includes(event.key) && (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault();
                    });
                    choice.pin = pin; pinSource = choice;
                    pin.setAttribute('aria-pressed', String(pinned)); actions.append(pin);
                    const stepButton = (key, direction) => {
                        const source = { owner: this.stepMoveOwner, generation: this.moveLastGeneration, item, title, actions, direction,
                            snapshot: Object.freeze({ ...task }), order: Object.freeze(active.slice()),
                            conflictCommand: this.controller.error?.code === 'CONFLICT' ? this.controller.retryCommand : null, chain: [] };
                        const action = button(key, event => {
                            if (event.defaultPrevented || event.detail > 1 || event.repeat || event.isComposing || event.keyCode === 229 ||
                                event.target !== action || (event.currentTarget && event.currentTarget !== action)) return;
                            if (!this.stepMoveCurrent(source) || !this.stepMoveVisible(source) || !this.stepMoveCurrent(source)) return;
                            // No DOM reads follow this final source/state/order/neighbor check.
                            this.perform(source.owner.store.request('move', { id: source.snapshot.id, version: source.snapshot.version,
                                order: source.order, direction: source.direction }));
                        });
                        action.addEventListener('keydown', event => {
                            if (['Enter', ' '].includes(event.key) && (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault();
                        });
                        source.action = action; stepSources.push(source); return action;
                    };
                    const up = stepButton('tasksUp', -1);
                    const down = stepButton('tasksDown', 1);
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
                    const endSource = { owner: this.moveLastOwner, generation: this.moveLastGeneration, item, title, actions,
                        snapshot: Object.freeze({ ...task }), order: Object.freeze(active.slice()),
                        conflictCommand: this.controller.error?.code === 'CONFLICT' ? this.controller.retryCommand : null, chain: [] };
                    const last = button('tasksMoveLast', event => {
                        if (event.defaultPrevented || event.detail > 1 || event.repeat || event.isComposing || event.keyCode === 229 ||
                            event.target !== last || (event.currentTarget && event.currentTarget !== last)) return;
                        if (!this.moveLastCurrent(endSource) || !this.moveLastVisible(endSource) || !this.moveLastCurrent(endSource)) return;
                        // Reacquire source/context/state after the final DOM read. An unresolved save
                        // keeps its exact Retry, while a refreshed conflict row remains a new choice.
                        this.perform(endSource.owner.store.request('moveLast', { id: endSource.snapshot.id, version: endSource.snapshot.version, order: endSource.order }));
                    }, 'tasks-move-last');
                    last.addEventListener('keydown', event => {
                        if (['Enter', ' '].includes(event.key) && (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault();
                    });
                    last.disabled = !!this.filterQuery || index === active.length - 1;
                    last.title = t(this.filterQuery ? 'tasksFilterReorder' : 'tasksMoveLastHelp');
                    endSource.last = last; lastSource = endSource;
                    actions.append(up, down, first, last);
                }
                const edit = button('tasksEdit', () => this.edit(task, edit));
                const source = { owner: this.rowRemoveOwner, lifecycle: rowRemoveLifecycles.get(this),
                    list: task.state === 'active' ? this.rowRemoveOwner.activeList : this.rowRemoveOwner.doneList,
                    item, top, title, check: top.querySelector('.tasks-check'), actions, filter: this.filterQuery,
                    snapshot: Object.freeze({ ...task }), label: t('tasksRemove'), menuLabel: t('tasksActions'),
                    conflictCommand: this.controller.error?.code === 'CONFLICT' ? this.controller.retryCommand : null, chain: [] };
                const remove = button('tasksRemove', event => {
                    if (event.defaultPrevented || event.detail > 1 || event.repeat || event.isComposing || event.keyCode === 229 ||
                        event.target !== remove || (event.currentTarget && event.currentTarget !== remove)) return;
                    if (!this.rowRemoveCurrent(source) || !this.rowRemoveVisible(source) || !this.rowRemoveCurrent(source)) return;
                    const hadFocus = item.contains(document.activeElement);
                    const command = source.owner.store.request('remove', { id: source.snapshot.id, version: source.snapshot.version });
                    this.rowRemoveAttempt = Object.freeze({ command, owner: source.owner });
                    this.perform(command, () => {
                        this.render();
                        if (hadFocus && document.activeElement === document.body) this.undoButton.focus();
                    });
                });
                remove.addEventListener('keydown', event => {
                    if (['Enter', ' '].includes(event.key) && (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault();
                });
                source.action = remove; source.actionTitle = remove.title; source.actionAria = remove.getAttribute('aria-label'); removeSource = source;
                actions.append(edit, remove);
            }
            actions.querySelectorAll('button').forEach(node => { node.dataset.taskAction = node.textContent; node.setAttribute('aria-disabled', String(!!this.controller.pending)); });
            if (task.state === 'removed') item.append(actions);
            else {
                const menu = el('details', 'tasks-row-menu'), summary = el('summary', '', t('tasksActions'));
                summary.dataset.taskAction = 'menu';
                menu.append(summary, actions); item.append(menu);
                if (removeSource) {
                    removeSource.menu = menu; removeSource.summary = summary;
                    removeSource.chain.push([removeSource.action, actions], [actions, menu], [menu, item], [summary, menu],
                        [removeSource.check, top], [title, top], [top, item], [item, removeSource.list]);
                }
                if (pinSource) {
                    pinSource.menu = menu; pinSource.summary = summary;
                    pinSource.chain.push([pinSource.pin, actions], [actions, menu], [menu, item], [summary, menu],
                        [title, top], [top, item], [item, pinSource.owner.list]);
                }
                for (const source of stepSources) {
                    source.menu = menu; source.summary = summary;
                    source.chain.push([source.action, actions], [actions, menu], [menu, item], [summary, menu],
                        [title, top], [top, item], [item, source.owner.list]);
                }
                if (firstSource) {
                    firstSource.menu = menu; firstSource.summary = summary;
                    firstSource.chain.push([firstSource.first, actions], [actions, menu], [menu, item], [summary, menu],
                        [title, top], [top, item], [item, firstSource.owner.list]);
                }
                if (lastSource) {
                    lastSource.menu = menu; lastSource.summary = summary;
                    lastSource.chain.push([lastSource.last, actions], [actions, menu], [menu, item], [summary, menu],
                        [title, top], [top, item], [item, lastSource.owner.list]);
                }
            }
            top.querySelectorAll('button').forEach(node => { node.setAttribute('aria-disabled', String(!!this.controller.pending)); node.dataset.taskAction = node.textContent; });
            item.append(copyStatus); return item;
        }
        render() {
            const lifecycle = viewLifecycles.get(this);
            if (!viewSourceCurrent(this, lifecycle)) return;
            const controller = lifecycle.source.controller;
            this.invalidateCopy();
            const state = controller.state, busy = !!controller.pending;
            if (this.pinnedFocus && state?.revision !== this.pinnedFocus.revision &&
                state?.receipts.at(-1) !== this.pinnedFocus.command.operationId) this.pinnedFocus.cancel();
            // An unreadable initial store must expose its safe retry without changing visibility preferences.
            const showReadError = !state && !!controller.error;
            // A remote hide preference must not strand this page's quick-entry draft or save.
            // Keep the preference unchanged, then honor it when the owner finishes or clears the draft.
            const ownsPendingAdd = busy && controller.retryCommand?.kind === 'add' &&
                controller.retryCommand.operationId === this.retryEffectOperationId;
            const ownsPendingBatch = busy && controller.retryCommand?.kind === 'addBatch' &&
                controller.retryCommand.operationId === this.batchOperationId;
            const ownsPendingReuse = busy && controller.retryCommand?.kind === 'add' &&
                controller.retryCommand.operationId === this.reuseOperationId;
            const ownsCompletionAttempt = ['completeBatch', 'reopenBatch', 'restoreBatch'].includes(controller.retryCommand?.kind) &&
                controller.retryCommand.operationId === this.retryEffectOperationId &&
                (busy || ['READ', 'WRITE', 'VERIFY'].includes(controller.error?.code));
            const visible = !!this.completionSession || !!this.restorationSession || ownsCompletionAttempt || this.alwaysVisible || state?.enabled === true || showReadError || !!this.reuseSession || ownsPendingReuse || this.quickEntryComposing || this.quickEntryCompositionSettling || this.input.value.length > 0 || ownsPendingAdd || !!this.batchSession || ownsPendingBatch;
            this.host.hidden = !visible;
            this.onVisibility(visible);
            // The host callback may synchronously retire or replace this View's
            // source. Nothing after that callback may adopt the replacement.
            if (!viewSourceCurrent(this, lifecycle)) return;
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
                this.pinGeneration = (this.pinGeneration || 0) + 1;
                this.completeGeneration = (this.completeGeneration || 0) + 1;
                this.rowReopenGeneration = (this.rowReopenGeneration || 0) + 1;
                rowRemoveLifecycles.set(this, Object.freeze({}));
                rowRestoreLifecycles.set(this, Object.freeze({}));
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
            const error = this.localError || controller.error;
            this.status.textContent = error ? errorText(error) : controller.status === 'saved' && this.input.value ? t('tasksDraftRemains') : t({ loading: 'tasksLoading', saving: 'tasksSaving', saved: 'tasksSaved', ready: 'tasksReady' }[controller.status] || 'tasksReady');
            this.feedback.classList.toggle('is-error', !!error); this.retry.hidden = !error || !['READ', 'WRITE', 'VERIFY'].includes(error.code) || !!this.localError || (!!controller.retryCommand && controller.retryCommand.operationId !== this.retryEffectOperationId);
            this.retry.disabled = busy;
        }
        rememberUndo(command, saved) {
            const owner = editSources.get(this);
            if (!viewSourceCurrent(this, viewLifecycles.get(this)) || !this.editSourceCurrent(owner)) return;
            if (command.kind === 'completeBatch') {
                const current = this.controller.state;
                if (saved.receipts.at(-1) !== command.operationId || current?.revision !== saved.revision || current.receipts.at(-1) !== command.operationId) return;
                const records = command.targets.map(target => saved.records.find(task => task.id === target.id && task.version === target.nextVersion && task.state === 'done' && task.updatedAt === command.updatedAt));
                if (records.every(record => record && current.records.some(task => Object.keys(record).every(key => task[key] === record[key])))) {
                    this.undo = Object.freeze({ kind: 'completeBatch', records: Object.freeze(records.map(record => Object.freeze({ ...record }))) });
                    undoRecords.set(this, { owner, record: this.undo }); undoAttempts.delete(this);
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
            if (this.undo) undoRecords.set(this, { owner, record: this.undo }); else undoRecords.delete(this);
            undoAttempts.delete(this);
        }
        undoLast() {
            const slot = undoRecords.get(this), record = this.undo;
            if (!slot || slot.record !== record || !viewSourceCurrent(this, viewLifecycles.get(this)) || !this.editSourceCurrent(slot.owner)) return;
            const { owner } = slot, controller = owner.controller, previous = undoAttempts.get(this);
            if (controller.pending) return;
            // A saved result delivered during a source gap still owns its exact
            // receipt. Explicit return acknowledges it without a new request.
            if (previous?.record === record && previous.dispatched) return this.perform(previous.command);
            if (this.undoButton.hidden) return;
            const command = owner.store.request(record.kind === 'completeBatch' ? 'reopenBatch' : record.state === 'done' ? 'reopen' : 'restore',
                record.kind === 'completeBatch' ? { targets: record.records.map(({ id, version }) => ({ id, version })) } : { id: record.id, version: record.version });
            if (undoRecords.get(this) !== slot || this.undo !== record || !viewSourceCurrent(this, viewLifecycles.get(this)) ||
                !this.editSourceCurrent(owner) || controller.pending) return;
            const attempt = { owner, record, command, dispatched: false, saved: null }; undoAttempts.set(this, attempt);
            return this.perform(command);
        }
        editSourceCurrent(owner) {
            if (!owner || editSources.get(this) !== owner || this.destroyed || this.host !== owner.host ||
                owner.host.ownerDocument !== document) return false;
            // Read source identities after the final host DOM check too.
            const controller = owner.controller, workspace = owner.backend?.workspace ?? null;
            return this.controller === controller && !controller.closed &&
                controller.store === owner.store && owner.store.backend === owner.backend && workspace === owner.workspace &&
                workspace?.id === owner.workspaceId && workspace?.generation === owner.workspaceGeneration &&
                !workspace?.invalidated && !workspace?._suspended && (root.LocalItabWorkspaces?.session ?? null) === owner.session &&
                (!workspace || owner.session === workspace || (owner.legacyAvailability && root.LocalItabWorkspaces == null));
        }
        edit(task, origin = null) {
            const owner = editSources.get(this);
            if (!this.editSourceCurrent(owner)) return;
            const { controller, store } = owner;
            let ownedOperationId = null, focusDeparted = false;
            const moved = event => { focusDeparted = !modal.panel.contains(event.target); };
            const departed = () => { focusDeparted = true; };
            const modal = this.createDialog(t('tasksEditTitle'), () => {
                document.removeEventListener('focusin', moved, true);
                document.removeEventListener('visibilitychange', departed, true); root.removeEventListener?.('blur', departed);
                controller.dismissRetry(ownedOperationId);
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
            let opening = null;
            // Modal ownership deliberately ignores row redraw/filter/collapse and
            // the host's inert state, which this dialog itself owns while open.
            const owns = () => !!opening && !this.destroyed && open && modal.isOpen && this.dialogs.has(modal) &&
                modal.panel === opening.panel && opening.panel.parentElement === opening.overlay && opening.overlay.parentElement === document.body &&
                [opening.overlay, opening.panel, input, feedback, latest, buttons, cancel, saveButton, overwrite].every(node => node.ownerDocument === document && node.isConnected) &&
                input.parentElement === opening.panel && feedback.parentElement === opening.panel && latest.parentElement === opening.panel &&
                buttons.parentElement === opening.panel && [cancel, saveButton, overwrite].every(node => node.parentElement === buttons);
            const close = () => {
                // A revision rebuilds the row. Resolve its current Edit by task identity,
                // but only while this opening still owns focus (including native blur).
                const restore = owns() && this.editSourceCurrent(owner) && !focusDeparted && !document.hidden &&
                    (modal.panel.contains(document.activeElement) || document.activeElement === document.body);
                open = false; originalClose(origin ? false : restore);
                if (!origin || !restore || !this.editSourceCurrent(owner) || this.dialogs.size || document.activeElement !== document.body) return;
                const item = Array.from(owner.host.querySelectorAll('[data-task-id]')).find(node => node.dataset.taskId === task.id);
                const target = item && Array.from(item.querySelectorAll('[data-task-action]')).find(node => node.dataset.taskAction === t('tasksEdit'));
                const visible = node => {
                    if (!node?.isConnected || node.disabled || node.closest('[hidden], [inert]') || !node.getClientRects().length) return false;
                    // Chromium can report layout boxes for closed details descendants.
                    for (let parent = node.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS' && !parent.open) return false;
                    return true;
                };
                if (visible(target) && this.editSourceCurrent(owner)) target.focus(); else if (visible(this.input) && this.editSourceCurrent(owner)) this.input.focus();
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
                if (!owns() || pending) return;
                if (!this.editSourceCurrent(owner)) { feedback.textContent = t('tasksConflict'); return; }
                if (controller.pending) return;
                if (replaceLatest) {
                    if (!reviewedLatest) { feedback.textContent = t('tasksConflict'); return; }
                }
                const text = input.value, submittedGeneration = generation;
                const submittedBaseline = replaceLatest ? reviewedLatest : baseline;
                const values = { id: submittedBaseline.id, version: submittedBaseline.version, text };
                if (!owns() || !this.editSourceCurrent(owner)) return;
                const command = (!replaceLatest && failedCommand) || store.request('edit', values);
                if (!owns() || !this.editSourceCurrent(owner)) return;
                if (replaceLatest) { baseline = submittedBaseline; failedCommand = null; }
                ownedOperationId = command.operationId; pending = true; setControl(saveButton, true); setControl(overwrite, true); feedback.textContent = t('tasksSaving');
                const retainCommand = () => { failedCommand = generation === submittedGeneration && input.value === text ? command : null; };
                try {
                    // Focus/disabled-control DOM work above must not silently
                    // change the source between admission and dispatch.
                    if (!owns()) return;
                    if (!this.editSourceCurrent(owner)) { retainCommand(); feedback.textContent = t('tasksConflict'); return; }
                    const state = await controller.run(command);
                    if (!owns()) return;
                    // Admission cannot cancel or source-bind an already-dispatched
                    // Store transaction. Keep its exact command for a deliberate
                    // original-source receipt retry; never adopt a foreign result.
                    if (!this.editSourceCurrent(owner)) { retainCommand(); feedback.textContent = t('tasksConflict'); return; }
                    baseline = state.records.find(t => t.id === task.id); failedCommand = null;
                    if (generation === submittedGeneration && input.value === text) close(); else feedback.textContent = t('tasksDraftRemains');
                } catch (error) {
                    if (!owns()) { controller.dismissRetry(command.operationId); return; }
                    retainCommand();
                    if (!this.editSourceCurrent(owner)) { feedback.textContent = t('tasksConflict'); return; }
                    feedback.textContent = errorText(error);
                    if (error.code === 'CONFLICT') {
                        failedCommand = null;
                        const fresh = controller.state?.records.find(t => t.id === task.id && t.state !== 'removed');
                        reviewedLatest = fresh || null; latest.hidden = !fresh; latest.textContent = fresh ? `${t('tasksLatest')}: ${fresh.text}` : '';
                        setControl(overwrite, pending, !fresh);
                    }
                } finally { pending = false; setControl(saveButton, false); setControl(overwrite, false); }
            };
            const buttons = el('div', 'tasks-dialog-actions');
            const cancel = button('tasksCancel', () => close()), saveButton = button('tasksSave', () => save(), 'tasks-primary'), overwrite = button('tasksOverwrite', () => save(true)); overwrite.hidden = true;
            buttons.append(cancel, overwrite, saveButton); modal.panel.append(input, hint, latest, feedback, buttons);
            opening = Object.freeze({ panel: modal.panel, overlay: modal.panel.parentElement }); modal.open(input);
            document.addEventListener('focusin', moved, true);
            document.addEventListener('visibilitychange', departed, true); root.addEventListener?.('blur', departed);
        }
        async export() {
            const lifecycle = viewLifecycles.get(this), current = () => viewSourceCurrent(this, lifecycle);
            if (!current()) return;
            const previousError = this.localError;
            // Feedback belongs to the error state at invocation. A later file
            // operation may report its own result without cancelling this export.
            const report = error => {
                if (current() && this.localError === previousError) { this.localError = error; this.render(); }
            };
            let source;
            try { source = await lifecycle.source.store.export(); }
            catch (error) { report(typeof error?.code === 'string' ? error : api.fault('FILE')); return; }
            if (!current()) return;
            let url, link, scheduled = false, error = null;
            try {
                const blob = new Blob([source], { type: 'application/json' });
                if (!current()) return;
                url = URL.createObjectURL(blob);
                if (!current()) return;
                link = el('a');
                if (!current()) return;
                link.href = url;
                if (!current()) return;
                link.download = `local-itab-tasks-${new Date().toISOString().slice(0, 10)}.json`;
                if (!current()) return;
                document.body.append(link);
                if (!current()) return;
                const click = link.click;
                if (!current()) return;
                click.call(link);
                setTimeout(() => URL.revokeObjectURL(url), 60000); scheduled = true;
            } catch (_) { error = api.fault('FILE'); }
            finally {
                // These exact resources belong to this call, even after a source
                // gap. Successful downloads keep the existing delayed URL release.
                try { link?.remove(); } finally { if (url && !scheduled) URL.revokeObjectURL(url); }
            }
            report(error);
        }
        async importFile() {
            const owner = editSources.get(this);
            if (!this.editSourceCurrent(owner)) return;
            const { store } = owner;
            const generation = ++this.reviewGeneration;
            const file = this.fileInput.files?.[0]; this.fileInput.value = ''; if (!file) return;
            this.pendingReview = true; this.invalidateCopy(); this.refreshCopyControls();
            try {
                if (file.size > api.LIMITS.bytes) throw api.fault('SIZE_LIMIT');
                if (!this.editSourceCurrent(owner)) return;
                const source = await file.text();
                if (!this.editSourceCurrent(owner) || generation !== this.reviewGeneration) return;
                const review = await store.review(source);
                if (!this.editSourceCurrent(owner) || generation !== this.reviewGeneration || this.dialogs.size) return;
                this.localError = null; this.render();
                if (!this.editSourceCurrent(owner) || generation !== this.reviewGeneration || this.dialogs.size) return;
                this.reviewReplacement(review, () => store.request('replace', { source: review.source, revision: review.revision }), 'tasksReviewTitle', owner);
            } catch (error) {
                if (this.editSourceCurrent(owner) && generation === this.reviewGeneration) { this.localError = error.code ? error : api.fault('FILE'); this.render(); }
            } finally { if (generation === this.reviewGeneration) { this.pendingReview = false; this.refreshCopyControls(); } }
        }
        async reviewRecovery(id) {
            const owner = editSources.get(this);
            if (!this.editSourceCurrent(owner)) return;
            const { store } = owner;
            const generation = ++this.reviewGeneration, previousError = this.localError; this.pendingReview = true; this.invalidateCopy(); this.refreshCopyControls();
            try {
                if (!this.editSourceCurrent(owner)) return;
                const state = await store.read(), copy = state.recovery.find(item => item.id === id);
                if (!this.editSourceCurrent(owner) || generation !== this.reviewGeneration || this.dialogs.size) return;
                if (!copy) throw api.fault('CONFLICT');
                // Retire only feedback that predates this valid preview. A file
                // operation may have reported a newer error while the read waited.
                if (this.localError === previousError) { this.localError = null; this.render(); }
                if (!this.editSourceCurrent(owner) || generation !== this.reviewGeneration || this.dialogs.size) return;
                // Capture the same successful read for both review and confirmation.
                // Later page updates (or a retained read result) cannot rewrite it.
                const revision = state.revision;
                const recoveryPreview = Object.freeze({ pinnedId: copy.content.pinnedId,
                    records: Object.freeze(copy.content.records.map(task => Object.freeze({ ...task }))) });
                this.reviewReplacement({ current: api.counts(state), incoming: api.counts(recoveryPreview), recoveryPreview },
                    () => store.request('recover', { id, revision }), 'tasksRestoreTitle', owner);
            } catch (error) {
                if (this.editSourceCurrent(owner) && generation === this.reviewGeneration) { this.localError = error; this.render(); }
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
        reviewReplacement(review, makeCommand, title = 'tasksReviewTitle', owner = editSources.get(this)) {
            if (!this.editSourceCurrent(owner)) return;
            const { controller } = owner;
            let command = null, pending = false, opening = null;
            const modal = this.createDialog(t(title), () => { if (command) controller.dismissRetry(command.operationId); }); if (!modal) return;
            const feedback = el('p', 'tasks-dialog-feedback'); feedback.setAttribute('role', 'status');
            // The shared modal owns an inert host; only its own original DOM
            // chain grants review authority. Rows and host layout may change.
            const owns = () => !!opening && !this.destroyed && modal.isOpen && this.dialogs.has(modal) &&
                modal.panel === opening.panel && opening.panel.parentElement === opening.overlay && opening.overlay.parentElement === document.body &&
                [opening.overlay, opening.panel, feedback, actions, cancel, confirm].every(node => node.ownerDocument === document && node.isConnected) &&
                feedback.parentElement === opening.panel && actions.parentElement === opening.panel && cancel.parentElement === actions && confirm.parentElement === actions;
            const usable = () => !document.hidden && (!document.visibilityState || document.visibilityState === 'visible') &&
                !root.LocalItabContentLifecycle?.departing && !confirm.disabled && !confirm.closest('[hidden], [inert]') && !!confirm.getClientRects().length;
            const sourceCurrent = () => this.editSourceCurrent(owner);
            const conflict = () => { if (owns()) feedback.textContent = t('tasksConflict'); };
            const originalClose = modal.close;
            modal.close = (restoreFocus = true) => originalClose(restoreFocus && owns() && sourceCurrent());
            const cancel = button('tasksCancel', () => modal.close());
            const confirm = button('tasksReplace', async () => {
                if (!owns() || pending || !usable()) return;
                if (!sourceCurrent()) { conflict(); return; }
                if (controller.pending) return;
                pending = true;
                try {
                    command ||= makeCommand();
                    if (!owns() || !usable()) return;
                    if (!sourceCurrent()) { conflict(); return; }
                    // Request construction and focus/disabled-control DOM work
                    // cannot redirect dispatch to a replacement source.
                    if (document.activeElement === confirm) cancel.focus();
                    if (!owns() || !usable()) return;
                    if (!sourceCurrent()) { conflict(); return; }
                    confirm.disabled = true; feedback.textContent = t('tasksSaving');
                    if (!owns()) return;
                    if (!sourceCurrent()) { conflict(); return; }
                    await controller.run(command);
                    if (!owns()) return;
                    // Already-dispatched work completes on its original Store.
                    // Keep its exact command for a deliberate original receipt
                    // retry rather than closing a review under another source.
                    if (!sourceCurrent()) { conflict(); return; }
                    modal.close();
                } catch (error) {
                    if (!owns()) { if (command) controller.dismissRetry(command.operationId); return; }
                    if (!sourceCurrent()) { conflict(); return; }
                    feedback.textContent = errorText(error); if (error.code === 'CONFLICT') confirm.hidden = true;
                } finally { pending = false; if (owns()) confirm.disabled = false; }
            }, 'tasks-primary');
            const actions = el('div', 'tasks-dialog-actions'); actions.append(cancel, confirm);
            modal.panel.append(el('p', 'tasks-help', t('tasksReviewHelp')), el('p', '', `${t('tasksCurrent')}: ${summarize(review.current)}`),
                el('p', '', `${t('tasksIncoming')}: ${summarize(review.incoming)}`));
            if (review.recoveryPreview) modal.panel.append(this.recoveryPreview(review.recoveryPreview));
            modal.panel.append(feedback, actions);
            opening = Object.freeze({ panel: modal.panel, overlay: modal.panel.parentElement }); modal.open(cancel);
        }
        destroy() {
            const lifecycle = viewLifecycles.get(this); if (!lifecycle || lifecycle.retired) return;
            // Retire before callbacks: public fields and retained notifications
            // cannot revive rendering or transfer cleanup to another source.
            lifecycle.retired = true;
            this.destroyed = true;
            let failed = false, failure;
            const cleanup = action => { try { action(); } catch (error) { if (!failed) { failed = true; failure = error; } } };
            try {
                const dialogs = Array.from(this.dialogs);
                cleanup(() => this.removedRestoreSource?.observer?.disconnect()); cleanup(() => this.invalidateCopy());
                this.quickEntryCompositionEpoch++; this.quickEntryComposing = false; this.quickEntryCompositionSettling = false;
                cleanup(() => this.pinnedFocus?.cancel()); this.reviewGeneration++; this.pendingReview = false;
                // Every original resource gets its cleanup even if an earlier
                // callback throws. Preserve the first exception for the caller.
                dialogs.forEach(modal => cleanup(() => modal.close()));
            } finally { cleanup(() => lifecycle.unsubscribe()); cleanup(() => lifecycle.source.controller.destroy()); }
            if (failed) throw failure;
        }
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
