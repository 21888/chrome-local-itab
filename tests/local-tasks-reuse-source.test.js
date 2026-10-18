const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');
const tasks = require('../shared/local-tasks-store.js');
const { Controller } = require('../shared/local-tasks-controller.js');
const clone = value => structuredClone(value);
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { await tick(); await tick(); await tick(); }
function initial() {
    return tasks.validate({ schemaVersion: 1, revision: 4, enabled: true, pinnedId: 'task_0001', receipts: ['prior_operation'],
        records: Array.from({ length: 7 }, (_, i) => ({ id: `task_000${i}`, version: `version_${i}`,
            text: i < 2 ? '  duplicate 中文 😀\r\ntext\r  ' : `Synthetic task ${i}`, state: i === 5 ? 'done' : i === 6 ? 'removed' : 'active',
            removedFrom: i === 6 ? 'done' : null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' })),
        recovery: [{ id: 'recovery_1', createdAt: '2026-10-03T00:00:00.000Z', content: { records: [], pinnedId: null } }] });
}
// These are deliberate mutable-public-field boundary probes, not a model of
// normal workspace navigation. Every Controller result comes from real I/O.
// The synthetic backend captures a fixed target for each lock callback, so
// workspace-field injection cannot reroute that transaction's verification.
function model({ state = initial(), workspace = { id: 'workspace_0001', generation: 'generation_0001' }, prefix = 'original', normalizeTextarea = false } = {}) {
    const identities = new WeakMap(), sources = new Map(), listeners = new Set();
    let identity = 0, queue = Promise.resolve(), operation = 0, seed = clone(state), activeTarget = null;
    const backend = {
        workspace, requests: 0, reads: 0, writes: 0, mode: null, writeGate: null, nextReadFails: false,
        lock(fn) { const target = source(); const next = queue.then(async () => { activeTarget = target; try { return await fn(); } finally { activeTarget = null; } }); queue = next.catch(() => {}); return next; },
        async read() { backend.reads++; if (backend.nextReadFails) { backend.nextReadFails = false; throw Error('synthetic read failure'); } return clone((activeTarget || source()).raw); },
        async write(value) {
            backend.writes++; const target = activeTarget || source(), gate = backend.writeGate, mode = backend.mode;
            backend.writeGate = null; backend.mode = null; if (gate) await gate.promise;
            if (mode === 'false') return false; if (mode === 'drop') return;
            target.raw = clone(value); if (mode === 'ack') throw Error('synthetic lost acknowledgement');
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        raw: () => clone(source().raw), allRaw: () => clone([...sources.entries()]),
        seedNewSources(value) { seed = clone(value); }
    };
    function source() {
        const current = backend.workspace;
        if (current && !identities.has(current)) identities.set(current, ++identity);
        const key = current ? `${identities.get(current)}:${current.id}:${current.generation}` : 'legacy';
        if (!sources.has(key)) sources.set(key, { raw: clone(seed) });
        return sources.get(key);
    }
    const store = new tasks.Store(backend, { id: () => `${prefix}_operation_${++operation}`, now: () => '2026-10-18T04:00:00.000Z' });
    const request = store.request.bind(store); store.request = (...args) => { backend.requests++; return request(...args); };
    const controller = new Controller(store), remote = new tasks.Store(backend), api = { ...tasks, Controller };
    const subscriptions = { adds: 0, removes: 0 };
    const subscribe = controller.subscribe.bind(controller); controller.subscribe = listener => { subscriptions.adds++; const off = subscribe(listener); return () => { subscriptions.removes++; off(); }; };
    const document = createDocument({ blurUnavailableFocus: true });
    if (normalizeTextarea) { const create = document.createElement; document.createElement = tag => { const node = create(tag); if (tag === 'textarea') { let value = ''; Object.defineProperty(node, 'value', { get: () => value, set: next => { value = String(next).replace(/\r\n|\r/g, '\n'); } }); } return node; }; }
    const host = document.createElement('article'), search = document.createElement('input');
    document.body.append(search, host); search.focus();
    const window = { LocalItabTasks: api, LocalItabWorkspaces: { session: workspace }, LocalItabContentLifecycle: { departing: false } };
    const context = vm.createContext({ window, document, crypto: webcrypto, URL, Blob, setTimeout, console });
    for (const file of ['dialog-focus.js', 'local-tasks-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared', file), 'utf8'), context);
    const view = api.mount(host, { controller });
    return { backend, store, remote, controller, document, host, search, window, view, subscriptions };
}
const record = (h, id = 'task_0000') => h.backend.raw().records.find(task => task.id === id);
const row = (h, id = 'task_0000') => h.host.querySelectorAll('[data-task-id]').find(node => node.dataset.taskId === id);
const button = (parent, label) => parent?.querySelectorAll('button').find(node => node.textContent === label);
const modal = h => h.document.querySelector('.tasks-dialog');
const input = (node, value) => { node.value = value; node.dispatch('input'); };
const io = h => ({ requests: h.backend.requests, reads: h.backend.reads, writes: h.backend.writes });
const delta = (before, after) => Object.fromEntries(Object.keys(before).map(key => [key, after[key] - before[key]]));
const feedback = h => ({ state: h.controller.state, error: h.controller.error, retry: h.controller.retryCommand, status: h.controller.status });
function sameFeedback(h, before) {
    assert.strictEqual(h.controller.state, before.state); assert.strictEqual(h.controller.error, before.error);
    assert.strictEqual(h.controller.retryCommand, before.retry); assert.equal(h.controller.status, before.status);
}
function capture(h) { return { workspace: h.backend.workspace, id: h.backend.workspace?.id, generation: h.backend.workspace?.generation, session: h.window.LocalItabWorkspaces.session }; }
function restore(h, owner) {
    h.view.controller = h.controller; h.controller.store = h.store; h.store.backend = h.backend; h.view.host = h.host;
    h.backend.workspace = owner.workspace;
    if (owner.workspace) { owner.workspace.id = owner.id; owner.workspace.generation = owner.generation; }
    h.window.LocalItabWorkspaces.session = owner.session;
}
function change(h, kind, foreign) {
    if (kind === 'controller') h.view.controller = foreign.controller;
    else if (kind === 'store') h.controller.store = foreign.store;
    else if (kind === 'backend') h.store.backend = foreign.backend;
    else if (kind === 'workspace') { h.backend.workspace = { ...h.backend.workspace }; h.window.LocalItabWorkspaces.session = h.backend.workspace; }
    else if (kind === 'id') h.backend.workspace.id = 'workspace_0002';
    else if (kind === 'generation') h.backend.workspace.generation = 'generation_0002';
    else if (kind === 'session') h.window.LocalItabWorkspaces.session = { ...h.backend.workspace };
    else if (kind === 'host') { const replacement = h.document.createElement('article'); h.document.body.append(replacement); h.view.host = replacement; }
}
const sources = ['controller', 'store', 'backend', 'workspace', 'id', 'generation', 'session', 'host'];
const text = initial().records[0].text;
const routes = ['button', 'form', 'Enter'];
function add(h, route = 'button') {
    return route === 'button' ? h.view.addButton.dispatch('click') : route === 'form' ? h.view.form.dispatch('submit') : h.view.input.dispatch('keydown', { key: 'Enter' });
}
async function pair() {
    const h = model(); await settle(); const owner = capture(h);
    const foreign = model({ state: h.backend.raw(), workspace: owner.workspace, prefix: 'foreign' }); await settle();
    return { h, owner, foreign };
}
function cleanup(h, owner, foreign) { restore(h, owner); h.view.destroy(); foreign?.view.destroy(); }
function draft(h) { return { value: h.view.input.value, generation: h.view.draftGeneration, composing: h.view.quickEntryComposing,
    settling: h.view.quickEntryCompositionSettling, epoch: h.view.quickEntryCompositionEpoch, focus: h.document.activeElement,
    effect: h.view.retryEffect, failure: h.view.retryFailure, operationId: h.view.retryEffectOperationId, undo: h.view.undo, action: h.view.actionGeneration }; }
function sameDraft(h, before) { for (const [key, value] of Object.entries(before)) assert.strictEqual(draft(h)[key], value, `draft/effect ${key}`); }
function added(h, command, value = text) {
    const raw = h.backend.raw(); assert.equal(raw.records.filter(task => task.id === command.operationId).length, 1);
    assert.equal(raw.records.find(task => task.id === command.operationId).text, value);
    assert.equal(raw.receipts.filter(id => id === command.operationId).length, 1);
    assert.deepEqual(raw.records.slice(0, initial().records.length), initial().records);
    assert.deepEqual(raw.recovery, initial().recovery); assert.equal(raw.pinnedId, initial().pinnedId);
}

const editor = h => modal(h)?.querySelector('.tasks-reuse-editor');
function reuseButton(h) { const item = row(h); item.querySelector('.tasks-row-menu').open = true; return button(item, 'New task from text'); }
function open(h) { const origin = reuseButton(h); origin.focus(); origin.dispatch('click'); assert(editor(h), 'real reuse entry opens draft'); return { panel: modal(h), editor: editor(h), session: h.view.reuseSession, origin }; }
function click(h, label) { const node = button(modal(h), label); assert(node, label); node.dispatch('click'); return node; }
function resume(h, owner) { restore(h, owner); h.controller.emit(); }
const ui = h => ({ editor: editor(h), value: editor(h)?.value, session: h.view.reuseSession, operation: h.view.reuseOperationId,
    quick: h.view.input.value, quickGeneration: h.view.draftGeneration, effect: h.view.retryEffect, failure: h.view.retryFailure,
    effectOperation: h.view.retryEffectOperationId, action: h.view.actionGeneration, undo: h.view.undo, focus: h.document.activeElement });
function sameUI(h, before) { for (const [key, value] of Object.entries(before)) assert(Object.is(ui(h)[key], value), `unchanged ${key}`); }
function ownOutcome(h, command, mode) { assert.equal(h.controller.status, mode === 'success' ? 'saved' : 'error'); assert.equal(h.controller.error?.code, mode === 'success' ? undefined : mode === 'drop' ? 'VERIFY' : 'WRITE'); assert.strictEqual(h.controller.retryCommand, mode === 'success' ? null : command); }

for (const source of sources) test(`reuse initial entry refuses construction ${source} substitution despite identical saved snapshot`, async t => {
    const { h, owner, foreign } = await pair();
    try { const origin = reuseButton(h); change(h, source, foreign); const own = io(h), other = io(foreign), a = feedback(h), b = feedback(foreign), subscriptions = foreign.subscriptions.adds;
        origin.dispatch('click'); await settle(); t.diagnostic(JSON.stringify({ source, own: delta(own, io(h)), foreign: delta(other, io(foreign)), opened: !!modal(h) }));
        assert(!modal(h), 'no reuse modal remains'); assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); sameFeedback(h, a); sameFeedback(foreign, b); assert.equal(foreign.subscriptions.adds, subscriptions);
        resume(h, owner); open(h); click(h, 'Add'); const command = h.controller.retryCommand; await settle(); added(h, command); assert(!modal(h), 'no reuse modal remains');
    } finally { cleanup(h, owner, foreign); }
});
for (const source of sources) test(`open reuse refuses ${source} before request and preserves current draft and foreign feedback`, async t => {
    const { h, owner, foreign } = await pair();
    try { open(h); change(h, source, foreign); const own = io(h), other = io(foreign), before = ui(h), a = feedback(h), b = feedback(foreign);
        click(h, 'Add'); await settle(); t.diagnostic(JSON.stringify({ source, own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); sameFeedback(h, a); sameFeedback(foreign, b); sameUI(h, before);
        resume(h, owner); assert.equal(button(modal(h), 'Add').disabled, false); click(h, 'Add'); const command = h.controller.retryCommand; await settle(); added(h, command);
    } finally { cleanup(h, owner, foreign); }
});
for (const source of sources) test(`reuse rechecks ${source} after request return before dispatch or operation metadata`, async t => {
    const { h, owner, foreign } = await pair(), request = h.store.request;
    try { open(h); const before = ui(h), own = io(h), other = io(foreign), a = feedback(h), b = feedback(foreign); let observed = 0;
        h.store.request = (...args) => { const command = request(...args); observed++; change(h, source, foreign); return command; };
        click(h, 'Add'); await settle(); t.diagnostic(JSON.stringify({ source, observed, own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert.equal(observed, 1); assert.deepEqual(delta(own, io(h)), { requests: 1, reads: 0, writes: 0 }); assert.deepEqual(io(foreign), other); sameFeedback(h, a); sameFeedback(foreign, b); sameUI(h, before);
        h.store.request = request; resume(h, owner); click(h, 'Add'); const command = h.controller.retryCommand; await settle(); added(h, command);
    } finally { h.store.request = request; cleanup(h, owner, foreign); }
});
for (const mode of ['false', 'drop', 'ack']) for (const source of sources) test(`exact modal Retry refuses ${source} after ${mode}, then returns to original command with no new request`, async t => {
    const { h, owner, foreign } = await pair();
    try { open(h); h.backend.mode = mode; click(h, 'Add'); await settle(); const command = h.controller.retryCommand; assert(command); ownOutcome(h, command, mode);
        foreign.backend.mode = 'false'; await assert.rejects(foreign.controller.run(command)); change(h, source, foreign);
        const own = io(h), other = io(foreign), before = ui(h), a = feedback(h), b = feedback(foreign); click(h, 'Retry previous add'); await settle();
        t.diagnostic(JSON.stringify({ mode, source, own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); sameFeedback(h, a); sameFeedback(foreign, b); sameUI(h, before);
        resume(h, owner); const resumed = io(h); assert.equal(button(modal(h), 'Retry previous add').disabled, false); click(h, 'Retry previous add'); await settle();
        added(h, command); assert.equal(h.backend.requests, resumed.requests); assert.equal(h.backend.writes, resumed.writes + (mode === 'ack' ? 0 : 1)); assert(!modal(h), 'no reuse modal remains'); sameFeedback(foreign, b);
    } finally { cleanup(h, owner, foreign); }
});
for (const mode of ['success', 'false', 'drop', 'ack']) for (const source of sources) test(`issued reuse ${mode} keeps original outcome and modal during ${source} gap; exact receipt retry resumes`, async t => {
    const { h, owner, foreign } = await pair(), gate = deferred();
    try { open(h); h.backend.writeGate = gate; if (mode !== 'success') h.backend.mode = mode; click(h, 'Add'); await settle(); const command = h.controller.retryCommand; assert(command); assert(h.controller.pending);
        foreign.backend.mode = 'false'; await assert.rejects(foreign.controller.run(command)); const other = io(foreign), b = feedback(foreign), raw = foreign.backend.allRaw(); change(h, source, foreign); const before = ui(h);
        gate.resolve(); await settle(); t.diagnostic(JSON.stringify({ mode, source, status: h.controller.status, error: h.controller.error?.code || null, foreign: delta(other, io(foreign)) }));
        ownOutcome(h, command, mode); assert.deepEqual(io(foreign), other); sameFeedback(foreign, b); assert.deepEqual(foreign.backend.allRaw(), raw); sameUI(h, before);
        resume(h, owner); const resumed = io(h); assert.equal(button(modal(h), 'Retry previous add').hidden, false, 'retained exact attempt is explicitly recoverable');
        click(h, 'Retry previous add'); await settle(); added(h, command); assert.equal(h.backend.requests, resumed.requests); assert.equal(h.backend.writes, resumed.writes + (['false', 'drop'].includes(mode) ? 1 : 0)); assert(!modal(h), 'no reuse modal remains'); sameFeedback(foreign, b);
    } finally { gate.resolve(); cleanup(h, owner, foreign); }
});
for (const mode of ['false', 'drop', 'ack']) for (const source of sources) test(`Cancel during ${source} gap dismisses only original ${mode} command, never same foreign command`, async () => {
    const { h, owner, foreign } = await pair();
    try { open(h); h.backend.mode = mode; click(h, 'Add'); await settle(); const command = h.controller.retryCommand;
        foreign.backend.mode = 'false'; await assert.rejects(foreign.controller.run(command)); const other = io(foreign), b = feedback(foreign), subscriptions = { ...foreign.subscriptions }; change(h, source, foreign);
        click(h, 'Cancel'); await settle(); assert(!modal(h), 'no reuse modal remains'); assert(h.document.activeElement === h.document.body, 'source gap cannot restore row/quick focus');
        sameFeedback(foreign, b); assert.deepEqual(io(foreign), other); assert.deepEqual(foreign.subscriptions, subscriptions); assert.equal(h.subscriptions.removes, 1, 'original modal unsubscribe only'); assert.equal(h.controller.retryCommand, null);
    } finally { cleanup(h, owner, foreign); }
});
for (const newer of ['same-text', 'ABA', 'composition', 'new-text']) for (const mode of ['success', 'false', 'drop', 'ack']) test(`source-gap ${mode} reuse preserves newer ${newer} draft and IME until deliberate exact Retry`, async () => {
    const { h, owner, foreign } = await pair(), gate = deferred();
    try { open(h); h.backend.writeGate = gate; if (mode !== 'success') h.backend.mode = mode; click(h, 'Add'); await settle(); const command = h.controller.retryCommand; change(h, 'controller', foreign);
        if (newer === 'composition') editor(h).dispatch('compositionstart'); else { if (newer === 'ABA') input(editor(h), 'temporary'); input(editor(h), newer === 'new-text' ? 'new draft' : text); }
        const before = ui(h); gate.resolve(); await settle(); sameUI(h, before); ownOutcome(h, command, mode);
        resume(h, owner); if (newer === 'composition') { click(h, 'Retry previous add'); assert.equal(h.backend.requests, 1); editor(h).dispatch('compositionend'); }
        click(h, 'Retry previous add'); await settle(); added(h, command); assert.equal(editor(h).value, before.value); assert.equal(h.backend.requests, 1); assert.match(modal(h).querySelector('.tasks-dialog-feedback').textContent, /current draft is still here/);
    } finally { gate.resolve(); cleanup(h, owner, foreign); }
});
for (const newer of ['same-text', 'ABA', 'composition', 'new-text']) test(`request-return ${newer} cannot claim the older reuse snapshot generation`, async () => {
    const h = model(); await settle(); const owner = capture(h), request = h.store.request;
    try { open(h); h.store.request = (...args) => { const command = request(...args); if (newer === 'composition') editor(h).dispatch('compositionstart'); else { if (newer === 'ABA') input(editor(h), 'temporary'); input(editor(h), newer === 'new-text' ? 'new draft' : text); } return command; };
        click(h, 'Add'); const command = h.controller.retryCommand; await settle(); added(h, command); assert(editor(h), 'request-return edits retain their draft'); assert.equal(editor(h).value, newer === 'new-text' ? 'new draft' : text);
    } finally { h.store.request = request; cleanup(h, owner); }
});
for (const stage of ['entry', 'open']) for (const unavailable of ['suspended', 'invalidated', 'closed', 'retired']) test(`reuse ${stage} checks ${unavailable} source availability and private retirement`, async () => {
    const h = model(); await settle(); const owner = capture(h); let origin;
    try { if (stage === 'open') open(h); else origin = reuseButton(h);
        if (unavailable === 'suspended') h.backend.workspace._suspended = true;
        else if (unavailable === 'invalidated') h.backend.workspace.invalidated = true;
        else if (unavailable === 'closed') h.controller.destroy();
        else { h.view.destroy(); h.view.destroyed = false; h.controller.closed = false; }
        const before = io(h), a = feedback(h); if (stage === 'entry') origin.dispatch('click'); else if (modal(h)) click(h, 'Add');
        await settle(); assert.deepEqual(io(h), before); sameFeedback(h, a); if (stage === 'entry' || unavailable === 'retired') assert(!modal(h), 'no reuse modal remains');
    } finally { delete owner.workspace._suspended; delete owner.workspace.invalidated; cleanup(h, owner); }
});
test('Cancel without an attempt preserves a genuine READ failure and its global refresh Retry', async () => {
    const h = model(); await settle(); const owner = capture(h);
    try { open(h); h.backend.nextReadFails = true; await assert.rejects(h.controller.refresh()); const before = feedback(h); assert.equal(before.error.code, 'READ'); assert.equal(before.retry, null);
        click(h, 'Cancel'); sameFeedback(h, before); const counts = io(h); h.view.retry.dispatch('click'); await settle(); assert.equal(h.backend.reads, counts.reads + 1); assert.equal(h.backend.writes, counts.writes); assert.equal(h.controller.error, null);
    } finally { cleanup(h, owner); }
});
for (const kind of ['edit', 'remove']) test(`deliberate reuse remains snapshot-copy after source task ${kind}`, async () => {
    const h = model(); await settle(); const owner = capture(h);
    try { open(h); const original = record(h); await h.remote.mutate(h.remote.request(kind, { id: original.id, version: original.version, ...(kind === 'edit' ? { text: 'changed source' } : {}) })); await h.controller.refresh(); const before = h.backend.raw(); click(h, 'Add'); const command = h.controller.retryCommand; await settle();
        assert.equal(h.backend.raw().records.at(-1).text, text); assert.deepEqual(h.backend.raw().records.slice(0, before.records.length), before.records); assert.equal(h.backend.raw().receipts.at(-1), command.operationId);
    } finally { cleanup(h, owner); }
});
for (const edited of [false, true]) test(`reuse original CRLF/CR is preserved until actual input, edited=${edited}`, async () => {
    const h = model({ normalizeTextarea: true }); await settle(); const owner = capture(h);
    try { open(h); assert.equal(editor(h).value, text.replace(/\r\n|\r/g, '\n')); if (edited) input(editor(h), editor(h).value); const expected = edited ? editor(h).value : text;
        click(h, 'Add'); await settle(); assert.equal(h.backend.raw().records.at(-1).text, expected);
    } finally { cleanup(h, owner); }
});
test('legacy no-workspace reuse remains available with a real independent draft and exact Retry', async () => {
    const h = model({ workspace: null }); await settle(); const owner = capture(h);
    try { open(h); h.backend.mode = 'ack'; click(h, 'Add'); await settle(); const command = h.controller.retryCommand, before = io(h); click(h, 'Retry previous add'); await settle(); added(h, command); assert.equal(h.backend.requests, before.requests); assert.equal(h.backend.writes, before.writes); assert(!modal(h), 'no reuse modal remains');
    } finally { cleanup(h, owner); }
});
test('issued reuse may complete after original host detachment without adding a connected-host condition', async () => {
    const h = model(); await settle(); const owner = capture(h), gate = deferred();
    try { open(h); h.backend.writeGate = gate; click(h, 'Add'); await settle(); const command = h.controller.retryCommand; h.host.remove(); gate.resolve(); await settle(); added(h, command); assert(!modal(h), 'no reuse modal remains'); assert(h.document.activeElement === h.document.body);
    } finally { gate.resolve(); cleanup(h, owner); }
});
for (const mode of ['success', 'false']) test(`closed reuse late ${mode} preserves a newer real batch dialog and foreign focus`, async () => {
    const h = model(); await settle(); const owner = capture(h), gate = deferred();
    try { open(h); h.backend.writeGate = gate; if (mode !== 'success') h.backend.mode = mode; click(h, 'Add'); await settle(); click(h, 'Cancel'); h.view.addBatch(); const batch = modal(h), area = batch.querySelector('.tasks-batch-editor'); input(area, 'new batch draft');
        const outside = h.document.createElement('input'); h.document.body.append(outside); outside.focus(); await h.document.listeners.get('focusin')?.({ target: outside });
        const before = ui(h), batchFeedback = batch.querySelector('.tasks-dialog-feedback').textContent; gate.resolve(); await settle();
        assert(modal(h) === batch); assert.equal(area.value, 'new batch draft'); assert.equal(batch.querySelector('.tasks-dialog-feedback').textContent, batchFeedback); assert(h.document.activeElement === outside); assert.equal(h.view.actionGeneration, before.action); assert.equal(h.controller.retryCommand, null);
    } finally { gate.resolve(); cleanup(h, owner); }
});
for (const newer of ['quick-add', 'remove-undo', 'batch']) test(`newer ${newer} failure begun at reuse final notification keeps real error, exact Retry and operation metadata`, async () => {
    const h = model(); await settle(); const owner = capture(h);
    try { open(h); const off = h.controller.subscribe(() => {
            if (h.controller.status !== 'saved' || h.controller.pending) return; off(); click(h, 'Cancel');
            if (newer === 'quick-add') { input(h.view.input, 'new quick draft'); h.backend.mode = 'false'; add(h); }
            else if (newer === 'remove-undo') { row(h).querySelector('.tasks-row-menu').open = true; button(row(h), 'Remove').dispatch('click'); }
            else { h.view.addBatch(); input(modal(h).querySelector('.tasks-batch-editor'), 'new batch draft'); click(h, 'Review tasks'); }
        });
        click(h, 'Add'); await settle();
        if (newer === 'batch') { h.backend.mode = 'false'; const confirm = modal(h).querySelectorAll('button').find(node => node.textContent.startsWith('Add reviewed tasks')); assert(confirm && !confirm.disabled && !confirm.hidden); confirm.dispatch('click'); await settle(); }
        if (newer === 'remove-undo') { assert.equal(h.view.undo.id, 'task_0000'); h.backend.mode = 'false'; h.view.undoButton.dispatch('click'); await settle(); }
        const command = h.controller.retryCommand; assert(command); assert.equal(h.controller.error.code, 'WRITE'); const counts = io(h), effect = h.view.retryEffect, op = h.view.retryEffectOperationId;
        if (newer === 'batch') { const retry = modal(h).querySelectorAll('button').find(node => node.textContent.startsWith('Retry previous add')); assert(retry && !retry.disabled && !retry.hidden); retry.dispatch('click'); } else h.view.retry.dispatch('click'); await settle();
        assert.equal(h.controller.error, null); assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + 1);
        if (newer === 'quick-add') { assert.equal(command.text, 'new quick draft'); assert.equal(h.view.input.value, ''); assert.equal(op, command.operationId); assert.equal(typeof effect, 'function'); }
        if (newer === 'remove-undo') { assert.equal(record(h).state, 'active'); assert.equal(h.view.undo, null); }
    } finally { cleanup(h, owner); }
});

for (const source of sources) test(`source-gap subscription update does not move a newly focused modal Add (${source})`, async () => {
    const { h, owner, foreign } = await pair();
    try { open(h); const addButton = button(modal(h), 'Add'); addButton.focus(); change(h, source, foreign); const before = ui(h), disabled = addButton.disabled; h.controller.emit();
        sameUI(h, before); assert.equal(addButton.disabled, disabled); assert.match(modal(h).querySelector('.tasks-dialog-feedback').textContent, /changed in another page|unavailable/);
    } finally { cleanup(h, owner, foreign); }
});
test('reuse entry rechecks captured source after row-layout inspection', async () => {
    const { h, owner, foreign } = await pair();
    try { const origin = reuseButton(h), rects = origin.getClientRects.bind(origin); origin.getClientRects = () => { change(h, 'controller', foreign); return rects(); };
        origin.dispatch('click'); assert(!modal(h)); assert.equal(foreign.subscriptions.adds, 1);
    } finally { cleanup(h, owner, foreign); }
});
test('reuse dispatch rechecks source after owned Add focus moves to editor', async () => {
    const { h, owner, foreign } = await pair();
    try { open(h); const area = editor(h), focus = area.focus.bind(area); area.focus = () => { focus(); change(h, 'controller', foreign); }; const addButton = button(modal(h), 'Add'); addButton.focus(); const own = io(h), other = io(foreign);
        addButton.dispatch('click'); await settle(); assert.deepEqual(delta(own, io(h)), { requests: 1, reads: 0, writes: 0 }); assert.deepEqual(io(foreign), other); assert.equal(h.controller.retryCommand, null);
    } finally { cleanup(h, owner, foreign); }
});
test('Cancel rechecks focus authority after original dismissal changes public source', async () => {
    const { h, owner, foreign } = await pair(); const dismiss = h.controller.dismissRetry.bind(h.controller);
    try { open(h); h.backend.mode = 'false'; click(h, 'Add'); await settle(); h.controller.dismissRetry = id => { dismiss(id); change(h, 'controller', foreign); };
        click(h, 'Cancel'); assert(!modal(h)); assert(h.document.activeElement === h.document.body, 'cleanup source change cannot grant focus restoration');
    } finally { h.controller.dismissRetry = dismiss; cleanup(h, owner, foreign); }
});
test('source-gap Cancel without an attempt leaves foreign genuine READ and subscriptions intact', async () => {
    const { h, owner, foreign } = await pair();
    try { open(h); foreign.backend.nextReadFails = true; await assert.rejects(foreign.controller.refresh()); const before = feedback(foreign), subscriptions = { ...foreign.subscriptions }; change(h, 'controller', foreign); click(h, 'Cancel'); sameFeedback(foreign, before); assert.deepEqual(foreign.subscriptions, subscriptions); assert.equal(h.subscriptions.removes, 1);
    } finally { cleanup(h, owner, foreign); }
});
