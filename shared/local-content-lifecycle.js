(function (root) {
    'use strict';
    const text = (key, fallback) => {
        const translated = root.i18n?.t(key);
        return translated && translated !== key ? translated : fallback;
    };
    let departing = false, autosavePaused = false;
    const pending = () => Boolean(root.appearanceController?.pending || root.layoutController?.pending || root.shortcutsComponentInstance?.layoutController?.pending || root.completeBackupView?.pending || root.dashboardPreferenceView?.pending || root.localCalculatorView?.pending || root.settingsFormView?.pending || root.localCountdownView?.controller.pending || root.localCountdownSettingsView?.controller.pending || root.worldClockSettingsView?.pending || root.bookmarkImportView?.pending || root.workspacePresetsView?.pending || root.shortcutsComponentInstance?._pendingSave || root.localScratchpadView?.controller.pending || root.localScratchpadSettingsView?.controller.pending || root.localFocusView?.controller.pending || root.localFocusSettingsView?.controller.pending || root.localTasksView?.controller.pending || root.localTasksSettingsController?.pending || root.shortcutsComponentInstance?.finderView?.pending);
    const hasUncommittedWork = () => Boolean(root.appearanceController?.saveError || root.layoutController?.failedChange || root.shortcutsComponentInstance?.layoutController?.failedChange) || Boolean(root.completeBackupView?.hasUncommittedWork()) || Boolean(root.settingsFormView?.hasUncommittedWork()) || Boolean(root.localCountdownView?.hasUncommittedWork()) || Boolean(root.localCountdownSettingsView?.hasUncommittedWork()) || Boolean(root.worldClockSettingsView?.hasUncommittedWork()) || Boolean(root.localScratchpadView?.hasUncommittedWork()) || Boolean(root.localScratchpadSettingsView?.hasUncommittedWork()) || Boolean(root.bookmarkImportView?.hasUncommittedWork()) || Boolean(root.localCalculatorView?.hasUncommittedWork()) || pending() || Boolean(root.workspacePresetsView?.hasUncommittedWork()) || Boolean(root.shortcutsComponentInstance?.modal?.classList.contains('active')) || Boolean(root.localFocusView?.hasUncommittedWork?.()) || Boolean(root.localTasksView?.hasUncommittedWork()) || Boolean(root.shortcutsComponentInstance?.finderView?.hasUncommittedWork());
    function reload() {
        // Recheck at the time a delayed configuration reload actually runs.
        // Content notifications never call this helper or initialize providers.
        if (!hasUncommittedWork() && !root.workspacesView?.hasUncommittedWork?.()) { root.location.reload(); return true; }
        let notice = document.getElementById('local-content-reload-notice');
        if (!notice) {
            notice = document.createElement('div');
            notice.id = 'local-content-reload-notice'; notice.className = 'local-content-reload-notice';
            notice.setAttribute('role', 'status');
            const message = document.createElement('span');
            message.textContent = text('workspaceReloadDeferred', 'Settings changed. Your open work is still here. Finish it before reloading.');
            const button = document.createElement('button'); button.type = 'button'; button.className = 'tasks-button';
            button.textContent = text('tasksReloadPage', 'Reload page');
            button.addEventListener('click', () => {
                if (pending() || root.workspacesView?.pending) {
                    message.textContent = text('workspaceReloadPending', 'An action is still running. Wait for it to finish, then reload.');
                    return;
                }
                if ((hasUncommittedWork() || root.workspacesView?.hasUncommittedWork?.()) && !root.confirm(text('workspaceReloadConfirm', 'Reload and discard unsaved drafts, open reviews, saved-site searches and calculator input? Saved data stays on this device.'))) return;
                root.location.reload();
            });
            notice.append(message, button);
            (document.querySelector('.dashboard-main') || document.querySelector('.options-content') || document.body).prepend(notice);
        }
        return false;
    }
    // Browsers decide whether to show their native departure warning. Never
    // depend on an unload-time async save to preserve a draft or pending write.
    root.addEventListener?.('beforeunload', event => {
        if (departing) return;
        if (root.workspacesView?.hasUncommittedWork?.()) { event.preventDefault(); event.returnValue = ''; return; }
        if (!root.completeBackupView?.hasUncommittedWork() && !root.shortcutsComponentInstance?.hasUncommittedShortcutWork?.() && !root.dashboardPreferenceView?.pending && !root.localCalculatorView?.pending && !root.settingsFormView?.hasUncommittedWork() && !root.localCountdownSettingsView?.hasUncommittedWork() && !root.localScratchpadSettingsView?.hasUncommittedWork() && !root.worldClockSettingsView?.hasUncommittedWork() && !root.localFocusView?.hasUncommittedWork?.() && !root.localFocusView?.controller.pending && !root.localFocusSettingsView?.controller.pending && !root.localTasksView?.hasUncommittedWork() && !root.localTasksSettingsController?.pending) return;
        event.preventDefault(); event.returnValue = '';
    });
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function waitForPending({ timeout = 15000 } = {}) {
        // Flush queued layout/settings writes while their original session owns them.
        const begun = Date.now();
        const queues = [root.layoutController?.flush?.(), root.shortcutsComponentInstance?.layoutController?.flush?.(),
            root.settingsFormView?.flush?.(), root.appearanceController?.queue].filter(Boolean);
        if (queues.length) await Promise.all(queues);
        while (pending()) {
            if (Date.now() - begun > timeout) { const error = new Error('An action is still running'); error.code = 'WORKSPACE_BUSY'; throw error; }
            await sleep(30);
        }
    }
    function pauseAutosave() {
        autosavePaused = true;
        root.localScratchpadView?.controller.cancelTimer?.();
        root.localScratchpadSettingsView?.controller.cancelTimer?.();
        root.settingsFormView?.pauseAutosave?.();
    }
    function resumeAutosave() {
        autosavePaused = false;
        root.localScratchpadView?.controller.schedule?.();
        root.localScratchpadSettingsView?.controller.schedule?.();
    }
    async function saveDrafts() {
        await waitForPending();
        // Save means ordinary validated saves only. Never auto-apply an import,
        // overwrite a conflict, start a timer, or accept a destructive review.
        if (root.settingsFormView?.hasUncommittedWork?.() || root.worldClockSettingsView?.hasUncommittedWork?.())
            await root.settingsFormView?.saveDrafts?.();
        for (const view of [root.localScratchpadView, root.localScratchpadSettingsView, root.localCountdownSettingsView]) {
            const controller = view?.controller;
            if (controller?.hasUncommittedWork?.()) await controller.save?.();
        }
        const tasks = root.localTasksView;
        if (tasks?.input?.value && !tasks.dialogs?.size && !tasks.pendingReview) {
            tasks.add(); await waitForPending();
        }
        const shortcuts = root.shortcutsComponentInstance;
        if (shortcuts?.modal?.classList.contains('active')) await shortcuts.handleFormSubmit?.({preventDefault() {}});
        const focus = root.localFocusView;
        if (focus?.durationDrafts?.size) {
            // Validate before invoking the view's blur-style action, which may
            // otherwise normalize an invalid input and make it appear clean.
            const value = Number(focus.minutes?.value), state = focus.controller.snapshot?.();
            if (focus.durationDrafts.size === 1 && state?.session?.status === 'ready' &&
                Number.isInteger(value) && value >= 1 && value <= 180) {
                focus.commitDurationDraft?.(); await waitForPending();
            }
        }
        await waitForPending();
        return !hasUncommittedWork();
    }
    root.LocalItabContentLifecycle = { hasUncommittedWork, pending, reload, waitForPending, saveDrafts,
        pauseAutosave, resumeAutosave, allowDeparture() { departing = true; }, cancelDeparture() { departing = false; },
        get departing() { return departing; }, get autosavePaused() { return autosavePaused; } };
})(window);
