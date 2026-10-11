/* Bootstrap read-only capabilities only; no unfenced fallback backend. */
(function (root) {
    'use strict';
    const host = root.document.querySelector('.settings-nav');
    if (!host) return;
    const stores = {};
    for (const [type, api, method] of [['prompt', root.LocalItabPrompts, 'createPromptBackend'], ['collection', root.LocalItabAICollections, 'createCollectionBackend']]) {
        try {
            const store = new api.Store(root.LocalItabWorkspaces.manager[method](api));
            stores[type] = { read: () => store.read(), subscribe: listener => store.subscribe(listener) };
        } catch (error) { stores[type] = { read: async () => { throw error; }, subscribe: () => () => {} }; }
    }
    const view = root.LocalItabAISearchView.mount(host, stores);
    root.addEventListener('pagehide', () => view.close());
})(window);
