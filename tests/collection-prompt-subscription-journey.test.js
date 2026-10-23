const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Prompts = require('../shared/local-prompts-store.js');
const Collections = require('../shared/local-ai-collections-store.js');
const Search = require('../shared/local-ai-search.js');
const { Controller: PromptController } = require('../shared/local-prompts-controller.js');
const { Controller: CollectionController } = require('../shared/local-ai-collections-controller.js');
const prompts = require('./helpers/prompts-harness.js');
const collections = require('./helpers/collections-harness.js');
const { createDocument } = require('./helpers/task-dom-model.js');

// Real stores/controllers/views, synthetic RAM backend and DOM. No browser-tab claim.
function mount(controller, kind) {
    const document = createDocument({ blurUnavailableFocus: true, aggregateTextContent: true });
    const host = document.createElement('div'); document.body.append(host);
    const root = { document, LocalItabPrompts: Prompts, LocalItabAICollections: Collections, LocalItabAISearch: Search,
        addEventListener() {}, removeEventListener() {} };
    for (const file of ['dialog-focus', kind === 'prompt' ? 'local-prompts-view' : 'local-ai-collections-view']) {
        vm.runInThisContext('(function(window) {\n' + fs.readFileSync(`${__dirname}/../shared/${file}.js`, 'utf8') + '\n})')(root);
    }
    const View = kind === 'prompt' ? root.LocalItabPromptsView.View : root.LocalItabCollectionsView.View;
    const view = new View({ host, controller }); view.render(); return { view, document, host };
}

test('old-version return resolves current details; real archive/restore subscriptions preserve exact result and another draft', async t => {
    const p = prompts.setup(), c = collections.setup();
    const first = await p.store.mutate(p.store.request('add', { title: 'Original prompt', body: 'OLD {{topic}}' }));
    const original = first.records[0], ref = { promptId: original.id, bodyVersionId: original.currentVersionId };
    await p.store.mutate(p.store.request('edit', { id: original.id, version: original.version, title: 'Current prompt', body: 'CURRENT {{topic}}' }));
    const add = c.store.request('add', { title: 'Historical result', body: 'Retained exact answer', promptRef: ref });
    await c.store.mutate(add);
    const source = new CollectionController({ store: c.store, promptStore: p.store });
    const sourcePage = mount(source, 'collection'); await source.start(); source.select(add.operationId);
    t.after(() => source.dispose());
    source.create(); source.update('body', 'UNSAVED other result');
    const draft = source.draft(); source.select(add.operationId);
    const anchor = () => sourcePage.view.main.querySelector('a.collection-open-prompt');
    const oldAnchor = anchor(); assert.ok(oldAnchor);
    assert.equal(oldAnchor.dispatch('click').prevented, false);
    const before = c.raw, writes = c.writes, promptWrites = p.writes;
    const target = new PromptController({ store: p.store, collectionStore: c.store });
    Search.prepareTarget(target, new URL(oldAnchor.href, 'https://synthetic.invalid/').search);
    const targetPage = mount(target, 'prompt'); await target.start();
    t.after(() => target.dispose());
    assert.equal(target.selected, original.id); assert.equal(target.record().body, 'CURRENT {{topic}}');
    assert.equal(target.session().versionId, target.record().currentVersionId);
    assert.notEqual(target.session().versionId, ref.bodyVersionId);
    assert.ok(targetPage.view.main.textContent.includes('CURRENT'));
    assert.deepEqual(source.record().promptRef, ref);
    assert.equal(source.promptResolution(ref).version.body, 'OLD {{topic}}');
    assert.equal(p.writes, promptWrites); assert.equal(c.writes, writes);
    // Invoke the production controller action, not a successful mutation stub.
    assert.equal(await target.action('remove'), true); await prompts.tick();
    assert.ok(target.record().deletedAt); assert.equal(anchor(), null);
    assert.equal(oldAnchor.dispatch('click').prevented, true);
    assert.equal(oldAnchor.dispatch('auxclick', { button: 1 }).prevented, true);
    assert.deepEqual(c.raw, before); assert.equal(c.writes, writes);
    assert.equal(source.drafts.get('new'), draft); assert.equal(draft.input.body, 'UNSAVED other result');
    assert.equal(source.promptResolution(ref).version.body, 'OLD {{topic}}');
    assert.equal(await target.action('restore'), true); await prompts.tick();
    const restored = anchor(); assert.ok(restored); assert.notEqual(restored, oldAnchor);
    assert.equal(restored.dispatch('click').prevented, false);
    assert.equal(oldAnchor.dispatch('click').prevented, true);
    assert.deepEqual(c.raw, before); assert.equal(c.writes, writes); assert.equal(p.writes, promptWrites + 2);
    source.select('new'); assert.equal(source.draft(), draft); assert.equal(source.draft().input.body, 'UNSAVED other result');
});
