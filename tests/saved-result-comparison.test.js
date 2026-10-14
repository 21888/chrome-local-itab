const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-ai-collections-store.js');
const { comparisonCandidates } = require('../shared/local-ai-collections-controller.js');
const { setup, add, tick } = require('./helpers/collections-harness.js');
const { createDocument } = require('./helpers/task-dom-model.js');
const text = node => [node.textContent || '', ...node.children.map(text)].join(' ');
const ref = { promptId: 'prompt_0001', bodyVersionId: 'version_0001' };
async function mount() {
    const h = setup(), c = h.controller, doc = createDocument({ blurUnavailableFocus: true }), host = doc.createElement('div'); doc.body.append(host);
    const root = { document: doc, LocalItabAICollections: Core, addEventListener() {} };
    const context = vm.createContext({ window: root });
    for (const file of ['dialog-focus.js', 'local-ai-collections-view.js']) vm.runInContext(fs.readFileSync(`shared/${file}`, 'utf8'), context);
    const view = new root.LocalItabCollectionsView.View({ host, controller: c }); view.render(); await c.start();
    async function linked(title, body) { await add(c, title, body); c.edit(); c.update('promptId', ref.promptId); c.update('bodyVersionId', ref.bodyVersionId); await c.save(); await tick(); return c.record(); }
    const a = await linked('First', '<script>literal</script>\r\n  same 🧪'), b = await linked('Second', '<script>literal</script>\r\n  same 🧪'); c.select(a.id);
    return { ...h, c, doc, host, view, a, b };
}
test('pure candidates are active, saved, exact IDs; no self, other versions or recovery', () => {
    const source = { id: 'a', promptRef: ref }, valid = { id: 'b', promptRef: { ...ref } };
    const state = { records: [source, valid, { id: 'c', deletedAt: 'now', promptRef: ref }, { id: 'd', promptRef: { ...ref, bodyVersionId: 'other' } }, { id: 'e', promptRef: { ...ref, promptId: 'other' } }, { id: 'f' }], recovery: [{ content: { records: [{ id: 'recovery', promptRef: ref }] } }] };
    assert.deepEqual(comparisonCandidates(state, 'a'), [valid]);
    assert.deepEqual(comparisonCandidates(state, 'missing'), []);
    source.deletedAt = 'now'; assert.deepEqual(comparisonCandidates(state, 'a'), []);
});
test('literal equal bodies, explicit chooser, Escape and unrelated drafts preserved without writes', async () => {
    const h = await mount(), { c, view, doc, a, b } = h;
    c.create(); c.update('title', 'Unsaved'); c.update('body', 'private draft'); const draft = c.draft(); c.select(a.id);
    const before = JSON.stringify(c.state), writes = h.writes, main = view.main.children.slice();
    const trigger = view.main.querySelectorAll('button').find(node => node.textContent === 'Compare saved results'); trigger.focus(); trigger.dispatch('click');
    const overlay = doc.body.querySelector('.prompt-dialog-overlay'), chooser = overlay.querySelector('select');
    assert.equal(overlay.querySelectorAll('pre').length, 1); assert.equal(doc.activeElement, chooser);
    assert.deepEqual(chooser.children.map(node => node.value), ['', b.id]);
    chooser.value = b.id; chooser.dispatch('change');
    assert.equal(overlay.querySelectorAll('pre').length, 2); assert.match(text(overlay), /exactly identical/);
    assert.equal(overlay.querySelectorAll('pre')[1].textContent, b.body.replace(/\r\n?/g, '\n')); assert.equal(overlay.querySelectorAll('script, img, iframe').length, 0);
    chooser.dispatch('keydown', { key: 'Escape', isComposing: true }); assert.equal(view.openDialog, true);
    chooser.dispatch('keydown', { key: 'Escape' }); assert.equal(view.openDialog, false); assert.equal(doc.activeElement, trigger);
    assert.deepEqual(view.main.children, main); assert.equal(c.drafts.get('new'), draft); assert.equal(draft.input.body, 'private draft');
    assert.equal(JSON.stringify(c.state), before); assert.equal(h.writes, writes); c.dispose();
});
test('refresh clears bodies immediately, keeps close focus and never substitutes a candidate', async () => {
    const h = await mount(), { c, view, doc, a, b } = h;
    view.compareSaved(a.id); const overlay = doc.body.querySelector('.prompt-dialog-overlay'), chooser = overlay.querySelector('select'); chooser.value = b.id; chooser.dispatch('change');
    let reject; const read = h.store.read.bind(h.store); h.store.read = () => new Promise((_, no) => { reject = no; });
    const pending = c.refresh(); assert.equal(overlay.querySelectorAll('pre').length, 0); assert.equal(chooser.disabled, true); assert.match(text(overlay), /comparison has been cleared/);
    assert.equal(doc.activeElement.textContent, 'Close comparison'); reject(new Error('read failed')); await pending;
    assert.equal(overlay.querySelectorAll('pre').length, 0); chooser.dispatch('change'); assert.equal(overlay.querySelectorAll('pre').length, 0);
    view.closeComparison(); view.compareSaved(a.id); assert.equal(view.openDialog, false);
    h.store.read = read; await c.refresh(); view.compareSaved(a.id); assert.equal(view.openDialog, true); view.closeComparison(); c.dispose();
});
for (const kind of ['archive', 'relink', 'body']) test(`${kind} notification invalidates the chosen saved result`, async () => {
    const h = await mount(), { c, view, doc, a, b } = h; view.compareSaved(a.id);
    const overlay = doc.body.querySelector('.prompt-dialog-overlay'), chooser = overlay.querySelector('select'); chooser.value = b.id; chooser.dispatch('change');
    if (kind === 'archive') await h.store.mutate(h.store.request('remove', { id: b.id, version: b.version }));
    if (kind === 'relink') await h.store.mutate(h.store.request('edit', { id: b.id, version: b.version, promptRef: { ...ref, bodyVersionId: 'version_0002' } }));
    if (kind === 'body') await h.store.mutate(h.store.request('revise', await h.store.reviewRevision({ id: b.id, version: b.version, body: 'new saved body' })));
    await tick(); assert.equal(overlay.querySelectorAll('pre').length, 0); assert.equal(chooser.value, b.id); assert.equal(chooser.disabled, true);
    view.closeComparison(); view.compareSaved(a.id); const next = doc.body.querySelector('.prompt-dialog-overlay').querySelector('select'); assert.equal(next.value, '');
    if (kind !== 'body') { assert.equal(next.disabled, true); assert.match(text(doc.body), /No other active saved result/); }
    view.closeComparison(); c.dispose();
});
test('stale read completion cannot restore invalidated bodies; keyboard remains contained', async () => {
    const h = await mount(), { c, view, doc, a } = h; view.compareSaved(a.id); const overlay = doc.body.querySelector('.prompt-dialog-overlay');
    let resolve; const read = h.store.read.bind(h.store), old = c.state; h.store.read = () => new Promise(done => { resolve = done; });
    const pending = c.refresh(); h.store.read = read; await c.refresh(); resolve(old); await pending;
    assert.equal(overlay.querySelectorAll('pre').length, 0); const close = doc.activeElement;
    close.dispatch('keydown', { key: 'Tab' }); assert.equal(doc.activeElement, close);
    close.dispatch('keydown', { key: 'Escape' }); assert.equal(view.openDialog, false); c.dispose();
});
test('disposal closes comparison and restores background interactivity; unavailable prompt is disclosed', async () => {
    const { c, view, doc, host, a } = await mount(); view.compareSaved(a.id);
    assert.match(text(doc.body), /Matching uses saved link IDs only/); assert.equal(host.inert, true);
    c.dispose(); assert.equal(view.openDialog, false); assert.equal(host.inert, false); assert.equal(doc.body.querySelector('.prompt-dialog-overlay'), null);
});
