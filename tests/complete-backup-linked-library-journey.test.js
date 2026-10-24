const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { fixture, withGlobals, seed, boot, clone, values, Workspaces, DEFER } = require('./helpers/complete-import-receipt-fixture');
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


for (const interrupted of [false, true]) test(`complete dual-library restore ${interrupted ? 'partially commits then explicitly recovers' : 'succeeds'} through real subscriptions and preserves open drafts`, async t => {
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
        if (interrupted) {
            // Model only the collection-key part of the combined Chrome write
            // reaching RAM. Keep the real transaction journal and readback gates.
            f.hooks.set = (written, raw, apply) => {
                if (Object.hasOwn(written, Workspaces.REGISTRY_KEY)) {
                    apply({ [Collections.KEY]: written[Collections.KEY] }); return;
                }
                return DEFER;
            };
            await assert.rejects(b.store.restore(preview, { confirmed: true }), error => error.code === 'UNCONFIRMED');
            f.hooks.set = null; await tick(); await tick();
            assert.equal(f.raw[Collections.KEY].records[0].body, 'Original saved answer', 'collection replacement actually committed');
            assert.deepEqual(f.raw[Prompts.KEY], currentP, 'prompt replacement did not commit');
            assert.equal(f.raw[Workspaces.RESTORE_TRANSACTION_KEY].status, 'prepared');
            assert.equal(pc.collectionError, 'READ'); assert.equal(cc.error.scope, 'read');
            assert.equal(cp.view.main.querySelector('a.collection-open-prompt'), null);
            assert.equal(oldBack.dispatch('click').prevented, true); assert.equal(oldBack.dispatch('auxclick', { button: 1 }).prevented, true);
            const uncertainRaw = clone(f.raw), uncertainWrites = f.writes.length;
            assert.equal(await editor.save(), false);
            assert.deepEqual(f.raw, uncertainRaw); assert.equal(f.writes.length, uncertainWrites);
            assert.equal(editor.draft(), changedDraft); assert.equal(changedDraft.input.body, 'Unsaved replacement of later answer');
            const recovery = await b.store.inspectInterruptedRestore(); assert.equal(recovery.canRecover, true);
            assert.deepEqual(f.raw, uncertainRaw); assert.equal(f.writes.length, uncertainWrites);
            await b.store.recoverInterruptedRestore(recovery, { confirmed: true }); await tick(); await tick();
            assert.deepEqual(f.raw[Prompts.KEY], currentP); assert.deepEqual(f.raw[Collections.KEY], currentC);
            assert.equal(f.raw[Workspaces.RESTORE_TRANSACTION_KEY].status, 'recovered');
            assert.equal(pc.record().body, 'Later {{topic}}'); assert.equal(cc.record().body, 'Later saved answer');
            assert.equal(pc.drafts.get('new'), pd); assert.equal(pd.input.body, 'Keep prompt draft');
            assert.equal(cc.drafts.get('new'), cd); assert.equal(cd.input.body, 'Keep answer draft');
            assert.equal(editor.draft(), changedDraft); assert.equal(changedDraft.input.body, 'Unsaved replacement of later answer');
            const recoveredBack = cp.view.main.querySelector('a.collection-open-prompt'); assert.ok(recoveredBack);
            assert.equal(recoveredBack.dispatch('click').prevented, false);
            assert.equal(oldBack.dispatch('click').prevented, true);
            assert.deepEqual(values(f), unchangedWorkspace); assert.deepEqual(f.providers, []);
            return;
        }
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
