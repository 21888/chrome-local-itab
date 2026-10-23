const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model.js');
const Prompts = require('../shared/local-prompts-store.js');
const Collections = require('../shared/local-ai-collections-store.js');
const Search = require('../shared/local-ai-search.js');

for (const kind of ['prompts', 'collections']) for (const locale of ['en', 'zh_CN']) test(`${kind}/${locale}: failed main subscription is visible, cannot bypass through Refresh/save, and a fresh page can recover`, async t => {
    const h = require(`./helpers/${kind}-harness.js`).setup();
    const Controller = require(kind === 'prompts' ? '../shared/local-prompts-controller.js' : '../shared/local-ai-collections-controller.js').Controller;
    await h.store.mutate(h.store.request('add', { title: 'Retained saved item', body: 'Original synthetic content' }));
    const before = h.raw, writes = h.writes;
    const originalSubscribe = h.backend.subscribe, originalRead = h.backend.read; let reads = 0;
    h.backend.read = async () => { reads++; return originalRead(); };
    h.backend.subscribe = () => { throw new Error('Synthetic main listener registration unavailable'); };
    const controller = new Controller({ store: h.store });
    const document = createDocument({ aggregateTextContent: true }), host = document.createElement('div'); document.body.append(host);
    const root = { document, LocalItabPrompts: Prompts, LocalItabAICollections: Collections, LocalItabAISearch: Search, addEventListener() {}, removeEventListener() {} };
    for (const file of ['dialog-focus', kind === 'prompts' ? 'local-prompts-view' : 'local-ai-collections-view']) {
        vm.runInThisContext('(function(window) {\n' + fs.readFileSync(`${__dirname}/../shared/${file}.js`, 'utf8') + '\n})')(root);
    }
    const View = kind === 'prompts' ? root.LocalItabPromptsView.View : root.LocalItabCollectionsView.View;
    const messages = JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${locale}/messages.json`, 'utf8'));
    const prefix = kind === 'prompts' ? 'prompts' : 'collections';
    const view = new View({ host, controller, translate: (key, fallback) => messages[prefix + key]?.message || fallback }); view.render(); t.after(() => controller.dispose());
    await controller.start();
    assert.equal(controller.state, null); assert.equal(controller.error.scope, 'read'); assert.equal(reads, 0);
    assert.equal(view.newButton.disabled, true);
    assert.equal(view.status.textContent, messages[prefix + 'SubscriptionUnavailable'].message);
    assert.doesNotMatch(view.main.textContent, /Opening your library|Loading your collection/);
    assert.equal(view.status.querySelectorAll('button').length, 0, 'no ineffective read retry is offered');
    // The backend becomes healthy, but the old page has no successful subscription.
    h.backend.subscribe = originalSubscribe; await controller.refresh();
    assert.equal(controller.state, null); assert.equal(reads, 0);
    const operation = { command: h.store.request('add', { title: 'Must not save', body: 'No listener' }), action: 'save', draftKey: 'new' };
    assert.equal(await controller.execute(operation), false);
    assert.deepEqual(h.raw, before); assert.equal(h.writes, writes);
    // A genuinely new controller must register, read the unchanged original and work normally.
    const reopened = new Controller({ store: h.store }); t.after(() => reopened.dispose());
    await reopened.start(); assert.equal(reopened.error, null); assert.equal(reopened.record().body, 'Original synthetic content');
    assert.equal(reads, 1); assert.deepEqual(h.raw, before); assert.equal(h.writes, writes);
});

for (const [page, search] of [['prompts', ''], ['collections', '?capture=' + 'a'.repeat(32)], ['collections', '?promptId=prompt_123&bodyVersionId=version_123']]) {
    test(`${page}${search}: real page bootstrap stops before post-start handoff when main subscription fails`, async t => {
        const h = require(`./helpers/${page}-harness.js`).setup();
        const auxiliary = require(`./helpers/${page === 'prompts' ? 'collections' : 'prompts'}-harness.js`).setup();
        let mainReads = 0, auxiliaryReads = 0, sends = 0, lateListeners = 0, historyChanges = 0;
        h.backend.subscribe = () => { throw new Error('Synthetic main event failure'); };
        h.backend.read = async () => { mainReads++; return h.raw; };
        auxiliary.backend.read = async () => { auxiliaryReads++; return auxiliary.raw; };
        const document = createDocument({ aggregateTextContent: true }), host = document.createElement('div');
        host.id = page === 'prompts' ? 'prompt-library' : 'collection-library'; document.body.append(host);
        const root = { document, LocalItabPrompts: Prompts, LocalItabAICollections: Collections, LocalItabAISearch: Search,
            LocalItabPromptsController: require('../shared/local-prompts-controller.js'),
            LocalItabCollectionsController: require('../shared/local-ai-collections-controller.js'),
            LocalItabPromptDraft: require('../shared/collection-prompt-draft.js'),
            LocalItabCapturePage: require('../shared/collection-capture-page.js'),
            LocalItabWorkspaces: { manager: { createPromptBackend: () => page === 'prompts' ? h.backend : auxiliary.backend,
                createCollectionBackend: () => page === 'collections' ? h.backend : auxiliary.backend } },
            chrome: { storage: { local: { get: async () => ({}) }, onChanged: { addListener() { lateListeners++; } } },
                runtime: { sendMessage() { sends++; throw new Error('Handoff must not run'); } } },
            location: { search, pathname: page + '.html' }, history: { replaceState() { historyChanges++; } },
            addEventListener() {}, removeEventListener() {} };
        for (const file of ['shared/dialog-focus.js', page === 'prompts' ? 'shared/local-prompts-view.js' : 'shared/local-ai-collections-view.js', page + '.js']) {
            vm.runInThisContext('(function(window) {\n' + fs.readFileSync(`${__dirname}/../${file}`, 'utf8') + '\n})')(root);
        }
        await new Promise(resolve => setImmediate(resolve));
        const view = page === 'prompts' ? root.localPromptsView : root.localCollectionsView;
        t.after(() => view.controller.dispose());
        assert.equal(view.controller.subscriptionError, true); assert.equal(view.controller.error.scope, 'read');
        assert.match(view.status.textContent, /reopen this page/);
        assert.deepEqual({ mainReads, auxiliaryReads, sends, lateListeners, historyChanges },
            { mainReads: 0, auxiliaryReads: 0, sends: 0, lateListeners: 0, historyChanges: 0 });
        assert.equal(h.writes, 0); assert.equal(auxiliary.writes, 0);
    });
}
