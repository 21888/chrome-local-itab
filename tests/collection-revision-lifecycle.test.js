const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-ai-collections-store.js');
const { setup, add, tick, settle } = require('./helpers/collections-harness.js');
const { createDocument } = require('./helpers/task-dom-model.js');

async function mount() {
    const h = setup(), doc = createDocument({ blurUnavailableFocus: true });
    const host = doc.createElement('div'); doc.body.append(host);
    const root = { document: doc, LocalItabAICollections: Core, addEventListener() {}, removeEventListener() {} };
    const context = vm.createContext({ window: root });
    for (const file of ['dialog-focus', 'local-ai-collections-view']) vm.runInContext(fs.readFileSync(`shared/${file}.js`, 'utf8'), context);
    const view = new root.LocalItabCollectionsView.View({ host, controller: h.controller });
    await h.controller.start();
    const a = await add(h.controller, 'Synthetic A', 'Saved A');
    const b = await add(h.controller, 'Synthetic B', 'Saved B');
    h.controller.select(a.id);
    return { h, c: h.controller, doc, host, view, a: h.controller.record(), b };
}
function deferReview(h, method = 'reviewRevision') {
    const original = h.store[method].bind(h.store);
    let release, fail, entered;
    const gate = new Promise((resolve, reject) => { release = resolve; fail = reject; });
    const ready = new Promise(resolve => { entered = resolve; });
    h.store[method] = async input => {
        const plan = await original(input);
        entered();
        await gate;
        return plan;
    };
    return { ready, release, fail, restore() { h.store[method] = original; } };
}
async function beginRevision(f) {
    const pending = f.view.revise(f.c.record());
    const overlay = f.doc.body.querySelector('.prompt-dialog-overlay');
    const editor = overlay.querySelector('textarea'); editor.value = 'Proposed A'; editor.dispatch('input');
    overlay.querySelector('.prompt-primary').dispatch('click');
    await tick();
    return { pending };
}

for (const outcome of ['success', 'failure']) for (const change of ['selection', 'round trip', 'editor', 'new draft', 'refresh', 'disposed']) {
    test(`controller ignores ${outcome} from a body review after ${change}`, async () => {
        const f = await mount(), { h, c, a, b } = f, gate = deferReview(h);
        const pending = c.reviewBody('Proposed A'); await gate.ready;
        if (change === 'selection') c.select(b.id);
        if (change === 'round trip') { c.select(b.id); c.select(a.id); }
        if (change === 'editor') { c.edit(); c.update('notes', 'Keep my draft'); }
        if (change === 'new draft') { c.create(); c.update('title', 'Keep my new draft'); }
        if (change === 'refresh') await c.refresh();
        if (change === 'disposed') c.dispose();
        const state = c.state, draft = c.draft(), error = c.error, notice = c.notice, writes = h.writes;
        if (outcome === 'success') gate.release(); else gate.fail(Core.fault('READ'));
        assert.equal(await pending, null);
        assert.equal(c.state, state); assert.equal(c.draft(), draft); assert.equal(c.error, error); assert.equal(c.notice, notice);
        assert.equal(h.writes, writes); c.dispose();
    });
}

for (const change of ['selection', 'round trip', 'editor', 'refresh', 'newer review', 'cloned plan', 'disposed']) {
    test(`controller refuses an obsolete body plan after ${change}`, async () => {
        const { h, c, a, b } = await mount();
        let plan = await c.reviewBody('Proposed A'); assert.ok(plan);
        if (change === 'selection') c.select(b.id);
        if (change === 'round trip') { c.select(b.id); c.select(a.id); }
        if (change === 'editor') c.edit();
        if (change === 'refresh') await c.refresh();
        if (change === 'newer review') assert.ok(await c.reviewBody('Newer A'));
        if (change === 'cloned plan') plan = { ...plan };
        if (change === 'disposed') c.dispose();
        const writes = h.writes, error = c.error;
        assert.equal(await c.acceptRevision(plan), false);
        assert.equal(h.writes, writes); assert.equal(c.error, error); c.dispose();
    });
}

for (const outcome of ['success', 'failure']) test(`late view review ${outcome} preserves newer editor, feedback and focus`, async () => {
    const f = await mount(), { h, c, a, b, view, doc } = f, gate = deferReview(h);
    const { pending } = await beginRevision(f); await gate.ready;
    c.select(b.id); c.edit(); c.update('notes', 'Newer B annotation');
    if (outcome === 'failure') { assert.equal(await c.save(), true); await settle(c); }
    else view.editor.fields.notes.focus();
    const draft = c.draft(), main = view.main.children[0], focus = doc.activeElement, status = view.status.textContent, writes = h.writes;
    if (outcome === 'success') gate.release(); else gate.fail(Core.fault('READ'));
    await tick();
    const lateDialog = doc.body.querySelector('.prompt-dialog-overlay');
    if (lateDialog) lateDialog.querySelector('button').dispatch('click');
    await pending;
    assert.equal(lateDialog, null);
    assert.equal(doc.body.querySelector('.prompt-dialog-overlay'), null);
    assert.equal(c.selected, b.id); assert.equal(c.draft(), draft); assert.equal(view.main.children[0], main);
    assert.equal(doc.activeElement, focus); assert.equal(view.status.textContent, status); assert.equal(c.error, null);
    assert.equal(view.proposals.get(a.id), 'Proposed A'); assert.equal(h.writes, writes); c.dispose();
});

for (const change of ['pagehide', 'destroy', 'dispose', 'host removal']) test(`pending review cannot reopen a modal after ${change}`, async () => {
    const f = await mount(), { h, c, view, doc, a } = f, gate = deferReview(h);
    const { pending } = await beginRevision(f); await gate.ready;
    if (change === 'pagehide') { view.pageHide({ persisted: true }); view.pageShow({ persisted: true }); }
    if (change === 'destroy') view.destroy();
    if (change === 'dispose') c.dispose();
    if (change === 'host removal') f.host.remove();
    const main = view.main.children[0], focus = doc.activeElement, writes = h.writes;
    gate.release(); await tick();
    const lateDialog = doc.body.querySelector('.prompt-dialog-overlay');
    if (lateDialog) lateDialog.querySelector('button').dispatch('click');
    await pending;
    assert.equal(lateDialog, null);
    assert.equal(doc.body.querySelector('.prompt-dialog-overlay'), null);
    assert.equal(view.main.children[0], main); assert.equal(doc.activeElement, focus);
    assert.equal(view.proposals.get(a.id), 'Proposed A'); assert.equal(view.revisionDraft, null);
    assert.equal(h.writes, writes); c.dispose();
});

for (const stage of ['editor', 'confirmation']) test(`BFCache departure closes the owned revision ${stage} without accepting stale clicks`, async () => {
    const f = await mount(), { h, c, view, doc, a } = f;
    const pending = view.revise(c.record());
    let overlay = doc.body.querySelector('.prompt-dialog-overlay');
    const editor = overlay.querySelector('textarea'); editor.value = 'Proposed A'; editor.dispatch('input');
    if (stage === 'confirmation') { overlay.querySelector('.prompt-primary').dispatch('click'); await tick(); overlay = doc.body.querySelector('.prompt-dialog-overlay'); }
    const staleProceed = overlay.querySelector('.prompt-primary'), writes = h.writes;
    view.pageHide({ persisted: true }); view.pageShow({ persisted: true });
    assert.equal(doc.body.querySelector('.prompt-dialog-overlay'), null);
    assert.equal(view.openDialog, false); assert.equal(view.revisionDraft, null);
    const later = view.dialog({ title: 'Unrelated review', body: 'Keep this dialog', accept: 'Continue' });
    const current = doc.body.querySelector('.prompt-dialog-overlay'), focus = doc.activeElement;
    editor.value = 'Stale detached input'; editor.dispatch('input');
    staleProceed.dispatch('click'); await pending;
    assert.equal(doc.body.querySelector('.prompt-dialog-overlay'), current); assert.equal(view.openDialog, true); assert.equal(doc.activeElement, focus);
    assert.equal(h.writes, writes); assert.equal(view.proposals.get(a.id), 'Proposed A');
    current.querySelector('button').dispatch('click'); assert.equal(await later, false); c.dispose();
});

test('old review finally cannot clear or redraw a newer revision flow', async () => {
    const f = await mount(), { h, c, b, view, doc } = f, gate = deferReview(h);
    const { pending } = await beginRevision(f); await gate.ready;
    c.select(b.id); gate.restore();
    const newer = view.revise(c.record());
    const overlay = doc.body.querySelector('.prompt-dialog-overlay'); assert.ok(overlay);
    const input = overlay.querySelector('textarea'); input.value = 'Proposed B'; input.dispatch('input'); input.focus();
    const main = view.main.children[0];
    gate.release(); await pending;
    assert.equal(view.revisionDraft, 'Proposed B'); assert.equal(doc.body.querySelector('.prompt-dialog-overlay'), overlay);
    assert.equal(view.main.children[0], main); assert.equal(doc.activeElement, input);
    overlay.querySelector('button').dispatch('click'); await newer;
    assert.equal(view.proposals.get(b.id), 'Proposed B'); c.dispose();
});

for (const outcome of ['success', 'failure']) test(`a newer controller review owns the plan after an older ${outcome}`, async () => {
    const { h, c } = await mount(), gate = deferReview(h);
    const old = c.reviewBody('Older proposal'); await gate.ready; gate.restore();
    const plan = await c.reviewBody('Newer proposal'); assert.ok(plan);
    if (outcome === 'success') gate.release(); else gate.fail(Core.fault('READ'));
    assert.equal(await old, null); assert.equal(c.error, null);
    const writes = h.writes;
    assert.equal(await c.acceptRevision(plan), true); await settle(c);
    assert.equal(c.record().body, 'Newer proposal'); assert.equal(h.writes, writes + 1);
    assert.equal(await c.acceptRevision(plan), false); assert.equal(h.writes, writes + 1); c.dispose();
});

for (const change of ['selection', 'round trip', 'refresh', 'editor']) test(`a visible confirmation is invalidated by ${change}`, async () => {
    const f = await mount(), { h, c, a, b, view, doc } = f;
    const { pending } = await beginRevision(f);
    const overlay = doc.body.querySelector('.prompt-dialog-overlay'); assert.ok(overlay);
    const stale = overlay.querySelector('.prompt-primary'), writes = h.writes;
    if (change === 'selection') c.select(b.id);
    if (change === 'round trip') { c.select(b.id); c.select(a.id); }
    if (change === 'refresh') await c.refresh();
    if (change === 'editor') c.edit();
    assert.equal(doc.body.querySelector('.prompt-dialog-overlay'), null); assert.equal(view.openDialog, false);
    const main = view.main.children[0]; view.search.focus(); const focus = doc.activeElement;
    stale.dispatch('click'); await pending;
    assert.equal(view.main.children[0], main); assert.equal(doc.activeElement, focus);
    assert.equal(view.proposals.get(a.id), 'Proposed A'); assert.equal(h.writes, writes); c.dispose();
});

for (const outcome of ['success', 'failure', 'uncertain write']) test(`current revision ${outcome} retains the explicit confirmation and receipt flow`, async () => {
    const f = await mount(), { h, c, a, view, doc } = f, gate = deferReview(h);
    const { pending } = await beginRevision(f); await gate.ready;
    const writes = h.writes;
    assert.equal(await view.revise(c.record()), undefined, 'a second click cannot start a parallel flow');
    if (outcome === 'failure') gate.fail(Core.fault('HISTORY_LIMIT')); else gate.release();
    await tick();
    if (outcome !== 'failure') {
        const overlay = doc.body.querySelector('.prompt-dialog-overlay'); assert.ok(overlay);
        assert.equal(h.writes, writes, 'review never writes before explicit acceptance');
        if (outcome === 'uncertain write') h.failOnce();
        overlay.querySelector('.prompt-primary').dispatch('click');
    }
    await pending; await settle(c);
    assert.equal(view.revisionDraft, null); assert.equal(view.openDialog, false);
    if (outcome === 'success') {
        assert.equal(c.record().body, 'Proposed A'); assert.equal(c.record().history.length, 2);
        assert.equal(view.proposals.has(a.id), false); assert.equal(c.notice, 'revise'); assert.equal(h.writes, writes + 1);
    } else {
        assert.equal(view.proposals.get(a.id), 'Proposed A');
        if (outcome === 'failure') { assert.equal(c.error.code, 'HISTORY_LIMIT'); assert.equal(h.writes, writes); }
        else {
            assert.ok(c.pendingCommand); const command = c.pendingCommand.command;
            assert.equal(h.writes, writes + 1); assert.equal(await c.retry(), true); await settle(c);
            assert.equal(c.record().body, command.body); assert.equal(c.record().history.length, 2);
            assert.equal(h.writes, writes + 1, 'only the already-confirmed operation is retried without a duplicate version');
        }
    }
    c.dispose();
});

for (const stale of [false, true]) test(`historical body restore ${stale ? 'ignores a delayed stale review' : 'still requires explicit current acceptance'}`, async () => {
    const f = await mount(), { h, c, b, view, doc } = f;
    assert.equal(await c.acceptRevision(await c.reviewBody('Second A')), true); await settle(c);
    const current = c.record(), historic = current.history[0], gate = deferReview(h, 'reviewVersionRestore');
    const pending = view.revise(current, historic); await gate.ready;
    if (stale) c.select(b.id);
    const writes = h.writes; gate.release(); await tick();
    const overlay = doc.body.querySelector('.prompt-dialog-overlay');
    if (overlay) overlay.querySelector(stale ? 'button' : '.prompt-primary').dispatch('click');
    await pending; await settle(c);
    if (stale) {
        assert.equal(overlay, null); assert.equal(h.writes, writes);
        assert.equal(view.proposals.get(current.id), historic.body); assert.equal(c.record(current.id).body, 'Second A');
    } else {
        assert.ok(overlay); assert.equal(h.writes, writes + 1); assert.equal(c.record().body, historic.body);
        assert.equal(c.record().history.length, 3); assert.equal(view.proposals.has(current.id), false);
    }
    c.dispose();
});

test('pending saved-data read blocks revision admission until its exact completion', async () => {
    const { h, c, view, doc } = await mount();
    const original = h.store.read.bind(h.store); let release;
    const gate = new Promise(resolve => { release = resolve; });
    h.store.read = async () => { await gate; return original(); };
    const pending = c.refresh();
    assert.equal(await c.reviewBody('Premature proposal'), null);
    await view.revise(c.record()); assert.equal(doc.body.querySelector('.prompt-dialog-overlay'), null);
    release(); await pending;
    const plan = await c.reviewBody('Current proposal'); assert.ok(plan);
    assert.equal(await c.acceptRevision(plan), true); c.dispose();
});
