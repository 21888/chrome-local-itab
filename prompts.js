/* Standalone library bootstrap: no providers, workspace writes or auto-save. */
(function (root) {
    'use strict';
    async function applyAppearance() {
        try {
            const workspaces = root.LocalItabWorkspaces;
            let appearance;
            const raw = await root.chrome.storage.local.get(['appearance', workspaces.REGISTRY_KEY]);
            if (raw[workspaces.REGISTRY_KEY]) {
                const registry = workspaces.validateRegistry(raw[workspaces.REGISTRY_KEY]);
                const entry = registry.workspaces.find(item => item.id === registry.lastUsedId);
                const values = await workspaces.manager.readBundle(entry); appearance = values.appearance;
            } else appearance = raw.appearance;
            if (appearance && ['light', 'dark'].includes(appearance.colorMode)) root.document.documentElement.dataset.colorMode = appearance.colorMode;
            if (appearance && /^[a-z][a-z0-9-]*$/.test(appearance.template)) root.document.documentElement.dataset.dashboardTemplate = appearance.template;
        } catch (_) { /* Appearance failure never changes or blocks personal content. */ }
    }
    async function boot() {
        root.i18n?.localizeDocument();
        const host = root.document.getElementById('prompt-library');
        let store;
        try {
            store = new root.LocalItabPrompts.Store(root.LocalItabWorkspaces.manager.createPromptBackend(root.LocalItabPrompts));
        } catch (error) {
            // Still render a recoverable error state; never fall back to a writer
            // that bypasses a complete-backup restore fence.
            store = { subscribe: () => () => {}, read: async () => { throw error; } };
        }
        const controller = new root.LocalItabPromptsController.Controller({ store });
        const view = new root.LocalItabPromptsView.View({ host, controller });
        root.localPromptsView = view; view.attachDepartureGuard(); view.render();
        void applyAppearance(); await controller.start();
        root.chrome?.storage?.onChanged?.addListener((changes, area) => {
            if (area === 'local' && Object.keys(changes).some(key => key === 'appearance' || key.startsWith('__localItabWorkspace'))) void applyAppearance();
        });
        root.addEventListener?.('pagehide', event => { if (!event.persisted) controller.dispose(); });
    }
    void boot();
})(window);
