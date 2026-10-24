const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { fixture, withGlobals, seed, boot, clone, values } = require('./helpers/complete-import-receipt-fixture');
const Prompts = require('../shared/local-prompts-store');
const Collections = require('../shared/local-ai-collections-store');
const Search = require('../shared/local-ai-search');
const { Controller: PromptController } = require('../shared/local-prompts-controller');
const { Controller: CollectionController } = require('../shared/local-ai-collections-controller');
const { createDocument } = require('./helpers/task-dom-model');
const tick = () => new Promise(resolve => setImmediate(resolve));
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


test('complete dual-library restore propagates through real workspace subscriptions and preserves open drafts', async t => {
    const f = fixture(seed());
    await withGlobals(f, async () => {
        const b = await boot(f);
        const options = { id: f.nextId, now: () => '2026-10-15T00:00:00.000Z' };
        const p = new Prompts.Store(b.manager.createPromptBackend(Prompts), options);
        const c = new Collections.Store(b.manager.createCollectionBackend(Collections), options);
        let ps = await p.mutate(p.request('add', { title: 'Original prompt', body: 'Original {{topic}}' }));
        const original = ps.records[0], ref = { promptId: original.id, bodyVersionId: original.currentVersionId };
        let cs = await c.mutate(c.request('add', { title: 'Original answer', body: 'Original saved answer', promptRef: ref }));
        const resultId = cs.records[0].id;
        const archive = await b.store.export(['prompts', 'collections']);
        ps = await p.mutate(p.request('edit', { id: original.id, version: original.version, title: 'Later prompt', body: 'Later {{topic}}' }));
        const revision = await c.reviewRevision({ id: resultId, version: cs.records[0].version, body: 'Later saved answer' });
        cs = await c.mutate(c.request('revise', revision));
        const currentP = clone(f.raw[Prompts.KEY]), currentC = clone(f.raw[Collections.KEY]);
        const pc = new PromptController({ store: p, collectionStore: c }), cc = new CollectionController({ store: c, promptStore: p });
        t.after(() => { pc.dispose(); cc.dispose(); });
        const pp = mount(pc, 'prompt'), cp = mount(cc, 'collection');
        await Promise.all([pc.start(), cc.start()]);
        pc.create(); pc.update('title', 'Unsaved prompt'); pc.update('body', 'Keep prompt draft'); const pd = pc.draft(); pc.select(original.id);
        cc.create(); cc.update('title', 'Unsaved answer'); cc.update('body', 'Keep answer draft'); const cd = cc.draft(); cc.select(resultId);
        const oldBack = cp.view.main.querySelector('a.collection-open-prompt'); assert.ok(oldBack);
        const editor = new CollectionController({ store: c, promptStore: p }); mount(editor, 'collection'); await editor.start();
        t.after(() => editor.dispose()); editor.select(resultId); editor.edit(); editor.update('body', 'Unsaved replacement of later answer'); const changedDraft = editor.draft();
        const unchangedWorkspace = clone(values(f));
        const reviewedRaw = clone(f.raw), reviewedWrites = f.writes.length;
        const preview = await b.store.review(archive, null, { promptTarget: 'global-library', collectionTarget: 'global-collections' });
        assert.deepEqual(f.raw, reviewedRaw); assert.equal(f.writes.length, reviewedWrites);
        await b.store.restore(preview, { confirmed: true }); await tick(); await tick();
        assert.equal(pc.record().body, 'Original {{topic}}'); assert.equal(cc.record().body, 'Original saved answer');
        assert.equal(oldBack.dispatch('click').prevented, true); assert.equal(oldBack.dispatch('auxclick', { button: 1 }).prevented, true);
        const restoredBack = cp.view.main.querySelector('a.collection-open-prompt'); assert.ok(restoredBack); assert.notEqual(restoredBack, oldBack);
        assert.equal(restoredBack.dispatch('click').prevented, false);
        assert.equal(pc.drafts.get('new'), pd); assert.equal(pd.input.body, 'Keep prompt draft');
        assert.equal(cc.drafts.get('new'), cd); assert.equal(cd.input.body, 'Keep answer draft');
        assert.deepEqual(f.raw[Prompts.KEY].recovery[0].content.records, Prompts.content(currentP).records);
        assert.deepEqual(f.raw[Collections.KEY].recovery[0].content.records, Collections.content(currentC).records);
        assert.equal(editor.draft(), changedDraft); assert.equal(changedDraft.input.body, 'Unsaved replacement of later answer');
        assert.equal(changedDraft.conflict, true); const afterRestore = clone(f.raw), afterWrites = f.writes.length;
        assert.equal(await editor.save(), false); assert.deepEqual(f.raw, afterRestore); assert.equal(f.writes.length, afterWrites);
        assert.deepEqual(values(f), unchangedWorkspace);
        assert.deepEqual(f.providers, []);
    });
});
