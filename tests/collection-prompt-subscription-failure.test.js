const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-ai-collections-store.js');
const Search = require('../shared/local-ai-search.js');
const { createDocument } = require('./helpers/task-dom-model.js');
const { Controller } = require('../shared/local-ai-collections-controller.js');
const prompts = require('./helpers/prompts-harness.js');
const collections = require('./helpers/collections-harness.js');

test('unavailable auxiliary prompt subscription does not abort collection startup or admit stale prompt links', async t => {
    const p = prompts.setup(), c = collections.setup();
    await p.store.mutate(p.store.request('add', { title: 'Synthetic prompt', body: 'Keep {{topic}}' }));
    const prompt = p.raw.records[0], ref = { promptId: prompt.id, bodyVersionId: prompt.currentVersionId };
    await c.store.mutate(c.store.request('add', { title: 'Saved result', body: 'Retained answer', promptRef: ref }));
    const before = c.raw, promptBefore = p.raw, writes = c.writes, promptWrites = p.writes;
    let reads = 0;
    const read = p.backend.read; p.backend.read = async () => { reads++; return read(); };
    p.backend.subscribe = () => { throw new Error('Synthetic event registration unavailable'); };
    const controller = new Controller({ store: c.store, promptStore: p.store });
    const document = createDocument({ aggregateTextContent: true }), host = document.createElement('div'); document.body.append(host);
    const root = { document, LocalItabAICollections: Core, LocalItabAISearch: Search, addEventListener() {}, removeEventListener() {} };
    for (const file of ['dialog-focus', 'local-ai-collections-view']) {
        vm.runInThisContext('(function(window) {\n' + fs.readFileSync(`${__dirname}/../shared/${file}.js`, 'utf8') + '\n})')(root);
    }
    const view = new root.LocalItabCollectionsView.View({ host, controller }); view.render();
    t.after(() => controller.dispose());
    await controller.start();
    assert.equal(controller.record().body, 'Retained answer');
    assert.equal(controller.error, null);
    assert.ok(view.main.textContent.includes('Retained answer'));
    assert.ok(view.main.textContent.includes('reopen this page to retry'));
    assert.equal(view.main.querySelector('a.collection-open-prompt'), null);
    assert.equal(view.main.textContent.includes('Refresh to retry.'), false);
    for (const locale of ['en', 'zh_CN']) {
        const messages = JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${locale}/messages.json`, 'utf8'));
        const message = messages.collectionsPromptSubscriptionError.message;
        assert.match(message, locale === 'en' ? /reopen this page/ : /重新打开此页面/);
    }
    assert.equal(controller.promptError, 'READ');
    assert.equal(controller.promptResolution(ref).status, 'unavailable');
    assert.deepEqual(controller.promptOptions(), []); assert.equal(reads, 0);
    await controller.refreshPrompts();
    assert.equal(controller.promptResolution(ref).status, 'unavailable'); assert.equal(reads, 0);
    assert.deepEqual(c.raw, before); assert.deepEqual(p.raw, promptBefore);
    assert.equal(c.writes, writes); assert.equal(p.writes, promptWrites);
});

test('real fenced backends isolate a failed auxiliary Chrome listener registration without bypassing storage guards', async t => {
    const { fixture, Prompts, copy } = require('./helpers/complete-backup-acceptance.js');
    const f = fixture({ extra: false, trash: false });
    let serial = 0;
    const options = { id: () => `subscription_${++serial}`, now: () => '2026-10-23T00:00:00.000Z' };
    const p = new Prompts.Store(f.workspaceManager.createPromptBackend(Prompts), options);
    const c = new Core.Store(f.workspaceManager.createCollectionBackend(Core), options);
    const state = await p.mutate(p.request('add', { title: 'Synthetic', body: 'Original prompt' }));
    const record = state.records[0];
    await c.mutate(c.request('add', { title: 'Saved fenced result', body: 'Preserved content', promptRef: { promptId: record.id, bodyVersionId: record.currentVersionId } }));
    const before = copy(f.raw); let registrations = 0, removed = 0;
    f.chrome.storage.onChanged = {
        addListener() { if (++registrations === 1) throw new Error('Synthetic one-registration failure'); },
        removeListener() { removed++; }
    };
    const controller = new Controller({ store: c, promptStore: p });
    t.after(() => controller.dispose());
    await controller.start();
    assert.equal(registrations, 2); assert.equal(controller.record().body, 'Preserved content');
    assert.equal(controller.promptError, 'READ'); assert.equal(controller.promptState, null);
    assert.deepEqual(f.raw, before);
    controller.dispose(); assert.equal(removed, 1);
});
