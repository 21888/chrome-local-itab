/* Collection bootstrap: fenced local content only; no auto-save or providers. */
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
        const host = root.document.getElementById('collection-library');
        let store, promptStore;
        try {
            store = new root.LocalItabAICollections.Store(root.LocalItabWorkspaces.manager.createCollectionBackend(root.LocalItabAICollections));
        } catch (error) {
            // Still render a recoverable error state; never fall back to a writer
            // that bypasses a complete-backup restore fence.
            store = { subscribe: () => () => {}, read: async () => { throw error; } };
        }
        try {
            const prompts = new root.LocalItabPrompts.Store(root.LocalItabWorkspaces.manager.createPromptBackend(root.LocalItabPrompts));
            promptStore = { read: () => prompts.read(), subscribe: listener => prompts.subscribe(listener) };
        } catch (error) { promptStore = { subscribe: () => () => {}, read: async () => { throw error; } }; }
        const controller = new root.LocalItabCollectionsController.Controller({ store, promptStore });
        root.LocalItabAISearch.prepareTarget(controller, root.location.search);
        const view = new root.LocalItabCollectionsView.View({ host, controller });
        root.localCollectionsView = view; view.attachDepartureGuard(); view.render();
        root.addEventListener?.('pagehide', event => { if (!event.persisted) controller.dispose(); });
        const capture = new root.LocalItabCapturePage.Handoff({
            controller, search: root.location.search,
            send: message => root.chrome.runtime.sendMessage(message),
            clearURL: () => root.history.replaceState(null, '', root.location.pathname),
            blocked: () => view.openDialog || view.revisionDraft !== null || view.proposals.size > 0
        });
        void applyAppearance(); await controller.start(); await capture.run();
        root.chrome?.storage?.onChanged?.addListener((changes, area) => {
            if (area === 'local' && Object.keys(changes).some(key => key === 'appearance' || key.startsWith('__localItabWorkspace'))) void applyAppearance();
        });
    }
    void boot();
})(window);
