const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-ai-collections-store.js');
const { setup, add, tick, settle } = require('./helpers/collections-harness.js');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');

async function mount(language = 'en') {
    const h = setup(), doc = createDocument({ blurUnavailableFocus: true, aggregateTextContent: true });
    const host = doc.createElement('div'); doc.body.append(host);
    const root = { document: doc, LocalItabAICollections: Core, addEventListener() {}, removeEventListener() {} };
    const context = vm.createContext({ window: root, Intl, Date, Object, Array, Boolean, String, Promise, Map });
    for (const name of ['dialog-focus', 'local-ai-collections-view']) vm.runInContext(fs.readFileSync(`${__dirname}/../shared/${name}.js`, 'utf8'), context);
    const messages = JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${language}/messages.json`, 'utf8'));
    const label = (key, fallback) => messages[`collections${key}`]?.message || fallback;
    const c = h.controller, view = new root.LocalItabCollectionsView.View({ host, controller: c, translate: label });
    // Match .prompt-status:empty { display: none }, including native text replacement.
    const rects = view.status.getClientRects.bind(view.status), replace = view.status.replaceChildren.bind(view.status);
    let ownText = '';
    view.status.replaceChildren = (...nodes) => { ownText = ''; replace(...nodes); };
    Object.defineProperty(view.status, 'textContent', {
        get() { return ownText + view.status.children.map(node => node.textContent || '').join(''); },
        set(value) { view.status.replaceChildren(); ownText = value; }
    });
    view.status.getClientRects = () => view.status.textContent || view.status.children.length ? rects() : [];
    await c.start(); await settle(c);
    const button = key => view.status.querySelectorAll('button').find(node => node.textContent === label(key));
    const edit = () => view.main.querySelectorAll('button').find(node => node.textContent === label('Edit')).dispatch('click');
    return { h, c, doc, host, view, label, button, edit };
}
async function uncertainMetadata(language) {
    const f = await mount(language), { h, c, view } = f;
    const a = await add(c, 'Synthetic original', '  Exact saved body\r\n中文 🧪  ');
    const b = await add(c, 'Synthetic second', 'Other saved body'); c.select(a.id); f.edit();
    for (const [key, value] of [['title', 'Synthetic edited title'], ['notes', '  Exact annotation\r\n中文 🧪 <b>literal</b>  '], ['tagsText', 'research, 中文']]) {
        const input = view.editor.fields[key]; input.focus(); input.value = value; input.dispatch('input');
    }
    assert.equal(view.status.getClientRects().length, 0, 'idle status is CSS-hidden');
    const draft = c.draft(), input = JSON.stringify(draft.input), writes = h.writes;
    h.failOnce(); let saving; const save = view.save.bind(view); view.save = (...args) => (saving = save(...args));
    view.editor.save.focus(); view.editor.save.dispatch('click'); await saving; await settle(c);
    const operation = c.pendingCommand;
    assert.equal(operation.action, 'save'); assert.equal(operation.command.kind, 'edit');
    assert.equal(operation.draftKey, a.id); assert.equal(operation.command.id, a.id);
    assert.equal(c.draft(), draft); assert.equal(JSON.stringify(draft.input), input); assert.equal(h.writes, writes + 1);
    assert.deepEqual(c.record().history, a.history); assert.equal(c.record().body, a.body);
    return { ...f, a, b, draft, input, operation };
}
async function beginCheck(f, method, outcome = 'confirmed', focus = true, afterStart) {
    const { h, c, view, operation } = f;
    if (outcome === 'newer save') {
        const current = c.record(operation.command.id);
        await h.store.mutate(h.store.request('edit', { id: current.id, version: current.version, notes: 'Synthetic newer saved annotation' }));
        await settle(c);
    }
    if (outcome === 'missing proof') {
        const state = h.raw; state.receipts = []; await h.backend.write(state); await settle(c);
    }
    const read = h.backend.read.bind(h.backend);
    if (outcome === 'read error') h.backend.read = async () => { throw Core.fault('READ'); };
    const api = method === 'retry' ? 'mutate' : 'inspectOperation', call = h.store[api].bind(h.store);
    const gate = deferred(), entered = deferred(); let calls = 0;
    h.store[api] = async command => { calls++; assert.equal(command, operation.command); entered.resolve(); await gate.promise; return call(command); };
    let running; const action = c[method].bind(c); c[method] = () => { const result = action(); if (!running) running = result; afterStart?.(); return result; };
    const trigger = f.button(method === 'retry' ? 'Retry' : 'InspectSave'); assert.ok(trigger); assert.equal(trigger.disabled, false);
    const writes = h.writes, raw = JSON.stringify(h.raw);
    if (focus) trigger.focus(); trigger.dispatch('click'); await entered.promise;
    assert.equal(c.busy, true); assert.equal(trigger.isConnected, false, 'the actual clicked status button is replaced');
    assert.equal(c.pendingCommand, operation); assert.equal(c.drafts.get(operation.draftKey), f.draft);
    if (f.draft) assert.equal(JSON.stringify(f.draft.input), f.input);
    return { trigger, writes, raw, get calls() { return calls; }, async finish() { gate.resolve(); const result = await running; await settle(c); return result; },
        restoreRead() { h.backend.read = read; }, checkNoWrites() { assert.equal(h.writes, writes); assert.equal(JSON.stringify(h.raw), raw); } };
}
function assertFeedbackFocus(f, message) {
    assert.ok(f.doc.activeElement === f.view.status, message);
    assert.equal(f.view.status.getClientRects().length, 1, 'focused status is visible after synchronous busy render');
    assert.equal(f.view.status.getAttribute('role'), 'status'); assert.equal(f.view.status.tabIndex, -1);
}
function checkConfirmed(f, method, newer = false) {
    assert.equal(f.c.pendingCommand, null); assert.equal(f.c.drafts.has(f.a.id), false);
    assert.equal(f.c.record().id, f.a.id); assert.equal(f.c.record().body, f.a.body); assert.deepEqual(f.c.record().history, f.a.history);
    assert.equal(f.c.record().notes, newer ? 'Synthetic newer saved annotation' : JSON.parse(f.input).notes);
    assert.deepEqual(f.c.record().tags, ['research', '中文']);
    assert.equal(f.c.notice, method === 'verify' ? 'reconciled' : 'saved');
}

for (const language of ['en', 'zh_CN']) for (const method of ['retry', 'verify']) for (const outcome of ['confirmed', 'read error']) {
    test(`${language}: metadata ${method} ${outcome} keeps visible status focus with no write`, async () => {
        const f = await uncertainMetadata(language), focusCalls = [], focus = f.view.status.focus.bind(f.view.status);
        f.view.status.focus = () => { focusCalls.push({ busy: f.c.busy, text: f.view.status.textContent, visible: f.view.status.getClientRects().length }); focus(); };
        const check = await beginCheck(f, method, outcome);
        assert.equal(focusCalls.length, 1); assert.equal(focusCalls[0].busy, true); assert.equal(focusCalls[0].visible, 1);
        assert.ok(focusCalls[0].text.includes(f.label('Saving')));
        assertFeedbackFocus(f, 'the clicked metadata check must hand focus to its stable status');
        assert.equal(f.view.editor.fields.notes.disabled, true);
        const before = f.c.selected; assert.equal(f.c.select(f.b.id), false); assert.equal(f.c.selected, before);
        assert.equal(await f.c.retry(), false); assert.equal(await f.c.verify(), false); assert.equal(check.calls, 1);
        const result = await check.finish(); check.checkNoWrites(); assert.equal(focusCalls.length, 1); assertFeedbackFocus(f, 'completion keeps the same feedback node');
        if (outcome === 'confirmed') { assert.equal(result, true); checkConfirmed(f, method); }
        else {
            assert.equal(result, false); assert.equal(f.c.pendingCommand, f.operation);
            assert.equal(f.c.drafts.get(f.a.id), f.draft); assert.equal(JSON.stringify(f.draft.input), f.input);
            assert.equal(f.view.editor.fields.notes.disabled, true); check.restoreRead();
        }
        f.c.dispose();
    });
}
for (const method of ['retry', 'verify']) for (const target of ['search', 'type', 'tool', 'tag', 'archived']) {
    test(`metadata ${method} completion respects newer ${target} focus`, async () => {
        const f = await uncertainMetadata(), check = await beginCheck(f, method);
        assertFeedbackFocus(f, 'pending check has stable feedback focus');
        const control = target === 'search' ? f.view.search : target === 'archived' ? f.view.nav.trash : f.view.filters[target];
        control.focus();
        if (target === 'search') { control.value = 'Synthetic'; control.dispatch('input'); }
        else if (target === 'archived') control.dispatch('click');
        else { control.value = target === 'type' ? 'code' : 'Synthetic'; control.dispatch('change'); }
        await check.finish(); check.checkNoWrites(); checkConfirmed(f, method);
        assert.ok(f.doc.activeElement === control, 'no post-await focus restoration');
        await f.c.refresh(); assert.ok(f.doc.activeElement === control); f.c.dispose();
    });
}
for (const method of ['retry', 'verify']) for (const outcome of ['read error', 'missing proof']) {
    test(`metadata ${method} ${outcome} retains draft and newer search focus`, async () => {
        const f = await uncertainMetadata(), check = await beginCheck(f, method, outcome);
        assertFeedbackFocus(f, 'pending check has stable feedback focus');
        f.view.search.focus(); f.view.search.value = 'Synthetic'; f.view.search.dispatch('input');
        assert.equal(await check.finish(), false); check.checkNoWrites();
        assert.ok(f.doc.activeElement === f.view.search); assert.equal(f.c.pendingCommand, f.operation);
        assert.equal(JSON.stringify(f.draft.input), f.input); assert.equal(f.c.drafts.get(f.a.id), f.draft);
        assert.equal(f.c.hasUncommittedWork(), true); assert.equal(f.c.discard(), false);
        if (outcome === 'read error') check.restoreRead(); f.c.dispose();
    });
}
for (const method of ['retry', 'verify']) for (const change of ['body', 'hidden', 'persisted pagehide', 'dispose', 'host removal']) {
    test(`metadata ${method} never restores focus after ${change}`, async () => {
        const f = await uncertainMetadata(), check = await beginCheck(f, method);
        assertFeedbackFocus(f, 'pending check has stable feedback focus');
        if (change === 'hidden') { f.doc.visibilityState = 'hidden'; await f.doc.listeners.get('visibilitychange')({}); }
        if (change === 'persisted pagehide') f.view.pageHide({ persisted: true });
        if (change === 'dispose') f.c.dispose();
        if (change === 'host removal') f.host.remove();
        f.doc.body.focus(); await check.finish(); check.checkNoWrites(); assert.ok(f.doc.activeElement === f.doc.body); f.c.dispose();
    });
}
for (const method of ['retry', 'verify']) test(`unfocused metadata ${method} button does not take existing search focus`, async () => {
    const f = await uncertainMetadata(); f.view.search.focus();
    const check = await beginCheck(f, method, 'confirmed', false);
    assert.ok(f.doc.activeElement === f.view.search); await check.finish(); check.checkNoWrites();
    assert.ok(f.doc.activeElement === f.view.search); checkConfirmed(f, method); f.c.dispose();
});
for (const method of ['retry', 'verify']) test(`metadata ${method} checks original draft after selection and reopening`, async () => {
    const f = await uncertainMetadata();
    f.c.select(f.b.id); assert.equal(f.c.draft(), undefined); f.c.select(f.a.id);
    assert.equal(f.c.draft(), f.draft); assert.equal(f.view.editor.fields.notes.value, JSON.parse(f.input).notes);
    f.c.select(f.b.id); const check = await beginCheck(f, method);
    assertFeedbackFocus(f, 'the globally pending metadata operation keeps status focus away from its draft');
    await check.finish(); check.checkNoWrites(); checkConfirmed(f, method);
    f.edit(); assert.equal(f.view.editor.fields.notes.value, JSON.parse(f.input).notes);
    const writes = f.h.writes; f.c.update('notes', 'Synthetic new unsaved annotation');
    const discard = f.view.main.querySelectorAll('button').find(node => node.textContent === f.label('Discard'));
    discard.focus(); const cancelled = f.view.discard();
    f.doc.body.querySelector('.prompt-dialog-overlay').querySelector('button').dispatch('click'); await cancelled;
    assert.equal(f.c.draft().input.notes, 'Synthetic new unsaved annotation'); assert.ok(f.doc.activeElement === discard);
    const accepted = f.view.discard(); f.doc.body.querySelector('.prompt-dialog-overlay').querySelector('.prompt-primary').dispatch('click'); await accepted;
    assert.equal(f.c.draft(), undefined); f.edit(); assert.equal(f.view.editor.fields.notes.value, JSON.parse(f.input).notes);
    assert.equal(f.h.writes, writes); f.c.dispose();
});
test('metadata retry conflict switches to read-only verification without changing focus or immutable draft', async () => {
    const f = await uncertainMetadata(), retry = await beginCheck(f, 'retry', 'newer save');
    assertFeedbackFocus(f, 'conflicting retry starts on status'); assert.equal(await retry.finish(), false); retry.checkNoWrites();
    assertFeedbackFocus(f, 'conflicting retry retains status'); assert.equal(f.c.pendingInspection, true);
    assert.equal(f.c.pendingCommand, f.operation); assert.equal(JSON.stringify(f.draft.input), f.input); assert.equal(f.button('Retry'), undefined);
    const verify = await beginCheck(f, 'verify'); assertFeedbackFocus(f, 'read-only verification starts on status');
    assert.equal(await verify.finish(), true); verify.checkNoWrites(); assertFeedbackFocus(f, 'read-only confirmation retains status');
    checkConfirmed(f, 'verify', true); f.c.dispose();
});
for (const method of ['retry', 'verify']) test(`metadata ${method} read failure can be explicitly checked again with the same operation`, async () => {
    const f = await uncertainMetadata(), failed = await beginCheck(f, method, 'read error');
    assertFeedbackFocus(f, 'read failure starts on status'); assert.equal(await failed.finish(), false); failed.checkNoWrites(); failed.restoreRead();
    const recovered = await beginCheck(f, 'verify'); assertFeedbackFocus(f, 'explicit read-only recheck starts on status');
    assert.equal(await recovered.finish(), true); recovered.checkNoWrites(); checkConfirmed(f, 'verify'); f.c.dispose();
});
for (const kind of ['add', 'copy', 'revise', 'remove']) for (const method of ['retry', 'verify']) {
    test(`${kind} ${method} keeps the existing non-metadata focus behavior`, async () => {
        const f = await mount(), { h, c, view } = f; const original = await add(c, 'Synthetic original', 'Exact original body');
        let plan;
        if (kind === 'revise') plan = await c.reviewBody('Synthetic revised body');
        if (kind === 'copy') { c.edit(); c.update('notes', 'Synthetic copy note'); }
        if (kind === 'add') { c.create(); c.update('title', 'Synthetic new item'); c.update('body', 'Synthetic new body'); }
        h.failOnce();
        assert.equal(await (kind === 'revise' ? c.acceptRevision(plan) : kind === 'remove' ? c.action('remove') : c.save(kind === 'copy')), false);
        await settle(c);
        const operation = c.pendingCommand, draft = c.draft(), input = draft && JSON.stringify(draft.input);
        const check = await beginCheck({ ...f, operation, draft, input }, method);
        assert.ok(f.doc.activeElement === f.doc.body, 'non-metadata focus handling is deliberately unchanged');
        await check.finish(); check.checkNoWrites(); assert.ok(f.doc.activeElement === f.doc.body);
        if (kind === 'revise') { assert.equal(c.record().body, 'Synthetic revised body'); assert.equal(c.record().history.length, 2); }
        else if (kind === 'remove') assert.ok(c.record().deletedAt);
        else { assert.equal(h.raw.records.length, 2); assert.equal(h.raw.records.find(record => record.id === original.id).body, original.body); }
        assert.equal(view.status.getClientRects().length, 1); c.dispose();
    });
}

for (const method of ['retry', 'verify']) test(`metadata ${method} keeps a newer synchronous search focus`, async () => {
    const f = await uncertainMetadata();
    const check = await beginCheck(f, method, 'confirmed', true, () => f.view.search.focus());
    assert.ok(f.doc.activeElement === f.view.search, 'the synchronous action callback can already have a newer focus owner');
    await check.finish(); check.checkNoWrites(); assert.ok(f.doc.activeElement === f.view.search); checkConfirmed(f, method); f.c.dispose();
});
