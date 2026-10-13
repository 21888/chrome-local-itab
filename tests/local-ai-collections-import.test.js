const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-ai-collections-store.js');
const { setup, add, tick, settle } = require('./helpers/collections-harness.js');
const { createDocument } = require('./helpers/task-dom-model.js');
const text = node => [node.textContent || '', ...node.children.map(text)].join(' ');
async function mount() {
    const h = setup(), doc = createDocument({ blurUnavailableFocus: true }), events = new Map();
    const host = doc.createElement('div'); doc.body.append(host);
    const root = { document: doc, LocalItabAICollections: Core, addEventListener: (key, fn) => events.set(key, fn), removeEventListener() {} };
    const context = vm.createContext({ window: root, Intl, Date, Object, Array, Boolean, String, Promise, Map });
    for (const name of ['dialog-focus', 'local-ai-collections-view']) vm.runInContext(fs.readFileSync(`shared/${name}.js`, 'utf8'), context);
    const view = new root.LocalItabCollectionsView.View({ host, controller: h.controller });
    await h.controller.start(); return { ...h, h, view, doc, events };
}
function dialog(h) { return h.doc.body.querySelector('.prompt-dialog-overlay'); }
function button(h, label) { return dialog(h).querySelectorAll('button').find(node => node.textContent === label); }
async function file(h, source, properties = {}) {
    const input = dialog(h).querySelector('input'); input.files = [{ size: Buffer.byteLength(source), text: async () => source, ...properties }]; input.dispatch('change'); await tick(); await tick();
}
async function seed(h) {
    const c = h.controller; await add(c, 'Original', '<script>literal</script>\r\n  original');
    const source = await h.store.export(); await add(c, 'Later', 'second'); return source;
}
test('standalone import reviews global counts, waits for explicit acceptance, and recovers old library', async () => {
    const h = await mount(), source = await seed(h), writes = h.h.writes;
    h.controller.filter({ query: 'not shown' }); h.view.importButton.focus(); h.view.importFile(); await file(h, source);
    assert.match(text(dialog(h)), /not a merge/); assert.match(text(dialog(h)), /Saved: 2/); assert.match(text(dialog(h)), /Saved: 1/);
    assert.match(text(dialog(h)), /Matching record IDs \/ changed records: 1 \/ 0/);
    assert.equal(h.h.writes, writes); assert.equal(button(h, 'Replace global collection').disabled, false);
    button(h, 'Replace global collection').dispatch('click'); await settle(h.controller);
    assert.equal(h.controller.state.records.length, 1); assert.equal(h.controller.state.recovery.length, 1); assert.match(text(h.view.status), /verified/);
    h.view.importFile(); const select = dialog(h).querySelector('select'); select.value = h.controller.state.recovery[0].id; select.dispatch('change'); await tick();
    assert.equal(button(h, 'Replace global collection').disabled, false); button(h, 'Replace global collection').dispatch('click'); await settle(h.controller);
    assert.equal(h.controller.state.records.length, 2); assert.equal(h.controller.state.records[0].body, '<script>literal</script>\r\n  original');
    assert.equal(h.controller.state.recovery.length, 1); h.controller.dispose();
});
test('cancel and IME escape preserve zero writes and return focus', async () => {
    const h = await mount(), source = await seed(h), writes = h.h.writes;
    h.view.importButton.focus(); h.view.importFile(); await file(h, source);
    button(h, 'Cancel').dispatch('click'); assert.equal(dialog(h), null); assert.equal(h.doc.activeElement, h.view.importButton); assert.equal(h.h.writes, writes); h.controller.dispose();
});
for (const bad of ['duplicate', 'schema', 'identity', 'version', 'malicious', 'size', 'bytes', 'read']) test(`strict import rejects ${bad} without writes`, async () => {
    const h = await mount(); let source = await seed(h), properties = {};
    if (bad === 'duplicate') source = source.replace('"format":', '"format":"wrong","format":');
    if (bad === 'schema') { const obj = JSON.parse(source); obj.content.extra = 'no'; source = JSON.stringify(obj); }
    if (bad === 'identity') { const obj = JSON.parse(source); obj.content.records.push(obj.content.records[0]); source = JSON.stringify(obj); }
    if (bad === 'version') source = source.replace('"schemaVersion":1', '"schemaVersion":2');
    if (bad === 'malicious') source = '{"__proto__":{"polluted":true}}';
    if (bad === 'size') properties.size = Core.LIMITS.bytes + 1;
    if (bad === 'bytes') { source = '界'.repeat(Core.LIMITS.bytes / 2); properties.size = 1; }
    if (bad === 'read') properties.text = async () => { throw Error('read failed'); };
    const writes = h.h.writes; h.view.importFile(); await file(h, source, properties);
    assert.equal(button(h, 'Replace global collection').disabled, true); assert.match(text(dialog(h)), /could not be reviewed/); assert.equal(h.h.writes, writes); assert.equal({}.polluted, undefined); h.controller.dispose();
});
for (const ending of ['close', 'new-file', 'recovery', 'pagehide', 'dispose']) test(`late file read cannot revive review after ${ending}`, async () => {
    const h = await mount(), source = await seed(h), writes = h.h.writes; let resolve;
    h.view.importFile(); await file(h, source, { text: () => new Promise(done => { resolve = done; }) });
    if (ending === 'close') button(h, 'Cancel').dispatch('click');
    if (ending === 'new-file') await file(h, 'invalid');
    if (ending === 'recovery') { const select = dialog(h).querySelector('select'); select.value = ''; select.dispatch('change'); }
    if (ending === 'pagehide') h.events.get('pagehide')({ persisted: true });
    if (ending === 'dispose') h.controller.dispose();
    resolve(source); await tick(); await tick();
    if (dialog(h)) assert.equal(button(h, 'Replace global collection').disabled, true);
    assert.equal(h.h.writes, writes); h.controller.dispose();
});
for (const changed of ['collection', 'prompt']) test(`review invalidates immediately after ${changed} changes and can be re-reviewed`, async () => {
    const h = await mount(), source = await seed(h); h.view.importFile(); await file(h, source);
    if (changed === 'collection') { const record = h.controller.state.records[0]; await h.store.mutate(h.store.request('edit', { id: record.id, version: record.version, notes: 'external' })); await tick(); }
    else { h.controller.promptGeneration++; h.controller.notify('prompts'); }
    assert.equal(button(h, 'Replace global collection').disabled, true); assert.match(text(dialog(h)), /Review again/);
    button(h, 'Review again').dispatch('click'); await tick(); assert.equal(button(h, 'Replace global collection').disabled, false); h.controller.dispose();
});
test('drafts and proposed revisions block import entry without discarding anything', async () => {
    const h = await mount(); await seed(h); h.controller.create(); h.view.importFile(); assert.equal(dialog(h), null);
    h.controller.discard(); h.view.proposals.set('record', 'proposal'); h.view.importFile(); assert.equal(dialog(h), null); h.controller.dispose();
});
for (const kind of ['replace', 'recover']) test(`${kind} acknowledgement loss retains exact operation and verifies without extra writes`, async () => {
    const h = setup(), c = h.controller; await c.start(); const source = await seed(h);
    if (kind === 'recover') { const review = await c.reviewReplacement(source); assert.equal(await c.applyReplacement(review), true); await tick(); }
    const review = await c.reviewReplacement(source, kind === 'recover' ? c.state.recovery[0].id : null);
    h.failOnce(); assert.equal(await c.applyReplacement(review), false); await tick(); const operation = c.pendingCommand; assert.ok(operation); const writes = h.writes;
    assert.equal(c.replacementReady(), false); assert.equal(await c.reviewReplacement(source), null);
    assert.equal(await c.verify(), true); await tick(); assert.equal(h.writes, writes); assert.equal(c.pendingCommand, null); assert.equal(c.notice, 'reconciled'); c.dispose();
});
test('recovery failure preserves state and allows a fresh review after definite rejection', async () => {
    const h = setup(), c = h.controller; await c.start(); const source = await seed(h);
    await c.applyReplacement(await c.reviewReplacement(source)); await tick();
    const review = await c.reviewReplacement(null, c.state.recovery[0].id);
    const mutate = h.store.mutate.bind(h.store); h.store.mutate = async () => { throw Core.fault('CONFLICT'); };
    const before = JSON.stringify(h.raw), writes = h.writes; assert.equal(await c.applyReplacement(review), false); await tick();
    assert.equal(JSON.stringify(h.raw), before); assert.equal(h.writes, writes); assert.equal(c.pendingCommand, null);
    h.store.mutate = mutate; const next = await c.reviewReplacement(null, c.state.recovery[0].id); assert.ok(next); assert.equal(await c.applyReplacement(next), true); c.dispose();
});
test('stale controller review and forged recovery plan cannot write', async () => {
    const h = setup(), c = h.controller; await c.start(); const source = await seed(h), review = await c.reviewReplacement(source), writes = h.writes;
    assert.equal(await c.applyReplacement({ ...review }), false); await c.refresh();
    assert.equal(await c.applyReplacement(review), false); assert.equal(h.writes, writes); c.dispose();
});
test('prompt reads in flight block review until settled, then completion invalidates earlier association preview', async () => {
    const h = setup(), c = h.controller; await c.start(); const source = await seed(h);
    c.promptLoading = true; assert.equal(await c.reviewReplacement(source), null);
    c.promptLoading = false; const review = await c.reviewReplacement(source); assert.ok(review);
    c.promptGeneration++; c.promptLoading = true; assert.equal(c.replacementCurrent(review), false);
    c.promptLoading = false; assert.equal(c.replacementCurrent(review), false); c.dispose();
});
test('linked records are reviewed as exact unavailable references without interpreting file text', async () => {
    const h = await mount(); await seed(h); const c = h.controller;
    c.edit(); c.update('promptId', 'prompt_0001'); c.update('bodyVersionId', 'version_0001'); await c.save(); await tick();
    const source = await h.store.export(); h.view.importFile(); await file(h, source);
    assert.equal(button(h, 'Replace global collection').disabled, false); assert.match(text(dialog(h)), /prompt_0001 \/ version_0001/); assert.match(text(dialog(h)), /Unavailable or still loading/); c.dispose();
});
test('stale review moves disabled-button focus inside the dialog so Escape remains usable', async () => {
    const h = await mount(), source = await seed(h); h.view.importButton.focus(); h.view.importFile(); await file(h, source);
    button(h, 'Replace global collection').focus(); await h.controller.refresh();
    assert.equal(h.doc.activeElement, button(h, 'Cancel'));
    h.doc.activeElement.dispatch('keydown', { key: 'Escape', isComposing: true }); assert.ok(dialog(h));
    h.doc.activeElement.dispatch('keydown', { key: 'Escape' }); assert.equal(dialog(h), null); assert.equal(h.doc.activeElement, h.view.importButton); h.controller.dispose();
});
test('prompt-only loading updates re-enable import entry after initial reads finish', async () => {
    const h = await mount(), c = h.controller;
    c.promptLoading = true; c.notify('prompts'); assert.equal(h.view.importButton.disabled, true);
    c.promptLoading = false; c.notify('prompts'); assert.equal(h.view.importButton.disabled, false); c.dispose();
});
