(function (root) {
    'use strict';
    const text = (key, fallback) => {
        const translated = root.i18n?.t(key);
        return translated && translated !== key ? translated : fallback;
    };
    const pending = () => Boolean(root.dashboardPreferenceView?.pending || root.localCalculatorView?.pending || root.settingsFormView?.pending || root.localCountdownView?.controller.pending || root.localCountdownSettingsView?.controller.pending || root.worldClockSettingsView?.pending || root.bookmarkImportView?.pending || root.workspacePresetsView?.pending || root.shortcutsComponentInstance?._pendingSave || root.localScratchpadView?.controller.pending || root.localScratchpadSettingsView?.controller.pending || root.localFocusView?.controller.pending || root.localFocusSettingsView?.controller.pending || root.localTasksView?.controller.pending || root.localTasksSettingsController?.pending || root.shortcutsComponentInstance?.finderView?.pending);
    const hasUncommittedWork = () => Boolean(root.settingsFormView?.hasUncommittedWork()) || Boolean(root.localCountdownView?.hasUncommittedWork()) || Boolean(root.localCountdownSettingsView?.hasUncommittedWork()) || Boolean(root.worldClockSettingsView?.hasUncommittedWork()) || Boolean(root.localScratchpadView?.hasUncommittedWork()) || Boolean(root.localScratchpadSettingsView?.hasUncommittedWork()) || Boolean(root.bookmarkImportView?.hasUncommittedWork()) || Boolean(root.localCalculatorView?.hasUncommittedWork()) || pending() || Boolean(root.workspacePresetsView?.hasUncommittedWork()) || Boolean(root.shortcutsComponentInstance?.modal?.classList.contains('active')) || Boolean(root.localTasksView?.hasUncommittedWork()) || Boolean(root.shortcutsComponentInstance?.finderView?.hasUncommittedWork());
    function reload() {
        // Recheck at the time a delayed configuration reload actually runs.
        // Content notifications never call this helper or initialize providers.
        if (!hasUncommittedWork()) { root.location.reload(); return true; }
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
                if (pending()) {
                    message.textContent = text('workspaceReloadPending', 'An action is still running. Wait for it to finish, then reload.');
                    return;
                }
                if (hasUncommittedWork() && !root.confirm(text('workspaceReloadConfirm', 'Reload and discard unsaved drafts, open reviews, saved-site searches and calculator input? Saved data stays on this device.'))) return;
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
        if (!root.dashboardPreferenceView?.pending && !root.localCalculatorView?.pending && !root.settingsFormView?.hasUncommittedWork() && !root.localCountdownSettingsView?.hasUncommittedWork() && !root.localScratchpadSettingsView?.hasUncommittedWork() && !root.worldClockSettingsView?.hasUncommittedWork() && !root.localTasksView?.hasUncommittedWork() && !root.localTasksSettingsController?.pending) return;
        event.preventDefault(); event.returnValue = '';
    });
    root.LocalItabContentLifecycle = { hasUncommittedWork, reload };
})(window);
