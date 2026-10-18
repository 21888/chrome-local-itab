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
            text: i < 2 ? '  duplicate 中文 😀\ntext  ' : `Synthetic task ${i}`, state: i === 5 ? 'done' : i === 6 ? 'removed' : 'active',
            removedFrom: i === 6 ? 'done' : null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' })),
        recovery: [{ id: 'recovery_1', createdAt: '2026-10-03T00:00:00.000Z', content: { records: [], pinnedId: null } }] });
}
// Real Store/Controller/View; independent sources; unchanged shared DOM helper.
// A dispatched backend read/write captures its own destination at invocation.
// The Store itself still dereferences its backend between awaited operations.
function model({ workspaceMode = 'identified', workspace: suppliedWorkspace, sessionMode = 'matching', state = initial() } = {}) {
    const identities = new WeakMap(), sources = new Map(), listeners = new Set(), windowListeners = new Map();
    let identity = 0, queue = Promise.resolve(), operation = 0;
    const backend = {
        workspace: suppliedWorkspace || (workspaceMode === 'null' ? null : workspaceMode === 'undefined' ? undefined :
            workspaceMode === 'anonymous' ? { invalidated: false, _suspended: false } : { id: 'workspace_0001', generation: 'generation_0001' }),
        requests: 0, reads: 0, writes: 0, mode: null, nextReadFails: false, readGate: null, writeGate: null,
        lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() {
            backend.reads++; const snapshot = clone(source().raw), gate = backend.readGate; backend.readGate = null;
            if (gate) await gate.promise;
            if (backend.nextReadFails) { backend.nextReadFails = false; throw Error('synthetic read failure'); }
            return snapshot;
        },
        async write(value) {
            backend.writes++; const target = source(), gate = backend.writeGate; backend.writeGate = null;
            if (gate) await gate.promise;
            const mode = backend.mode; backend.mode = null;
            if (mode === 'false') return false;
            if (mode === 'drop') return;
            target.raw = clone(value);
            if (mode === 'ack') throw Error('synthetic acknowledgement failure');
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        raw: () => clone(source().raw)
    };
    function source() {
        const workspace = backend.workspace;
        if (workspace && !identities.has(workspace)) identities.set(workspace, ++identity);
        const key = workspace ? `${identities.get(workspace)}:${workspace.id}:${workspace.generation}` : 'legacy';
        if (!sources.has(key)) sources.set(key, { raw: clone(state) });
        return sources.get(key);
    }
    const store = new tasks.Store(backend, { id: () => `operation_${++operation}`, now: () => '2026-10-18T03:00:00.000Z' });
    const request = store.request.bind(store);
    store.request = (...args) => { backend.requests++; return request(...args); };
    const remote = new tasks.Store(backend), controller = new Controller(store), api = { ...tasks, Controller };
    const document = createDocument({ blurUnavailableFocus: true }), host = document.createElement('article'), search = document.createElement('input');
    document.body.append(search, host); search.focus();
    const window = { LocalItabTasks: api, LocalItabContentLifecycle: { departing: false },
        addEventListener(type, fn) { windowListeners.set(type, fn); },
        removeEventListener(type, fn) { if (windowListeners.get(type) === fn) windowListeners.delete(type); } };
    if (workspaceMode !== 'anonymous' && sessionMode !== 'absent') window.LocalItabWorkspaces = { session: sessionMode === 'missing' ? undefined : sessionMode === 'wrong' ? {} : backend.workspace };
    const context = vm.createContext({ window, document, crypto: webcrypto, URL, Blob, setTimeout, console });
    for (const name of ['dialog-focus.js', 'local-tasks-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared', name), 'utf8'), context);
    const view = api.mount(host, { controller });
    return { backend, store, remote, controller, document, host, search, window, windowListeners, view };
}
const record = (h, id = 'task_0000') => h.backend.raw().records.find(task => task.id === id);
const row = (h, id = 'task_0000') => h.host.querySelectorAll('[data-task-id]').find(node => node.dataset.taskId === id);
const button = (parent, label) => parent?.querySelectorAll('button').find(node => node.textContent === label);
const modal = h => h.document.querySelector('.tasks-dialog');
const editor = h => h.document.querySelector('.tasks-editor');
const input = (node, value) => { node.value = value; node.dispatch('input'); };
const focus = (h, node) => { node.focus(); h.document.listeners.get('focusin')?.({ target: h.document.activeElement }); };
function openRow(h, id = 'task_0000') {
    const item = row(h, id); assert(item); item.querySelector('.tasks-row-menu').open = true;
    const origin = button(item, 'Edit'); assert(origin?.getClientRects().length); focus(h, origin); origin.dispatch('click');
    assert(editor(h)); return editor(h);
}
function save(h, value) {
    if (value !== undefined) input(editor(h), value);
    const action = button(modal(h), 'Save task'); assert(action); focus(h, action); action.dispatch('click');
}
const io = h => ({ requests: h.backend.requests, reads: h.backend.reads, writes: h.backend.writes });
const delta = (before, after) => Object.fromEntries(Object.keys(before).map(key => [key, after[key] - before[key]]));
function restore(h, owner) {
    h.view.controller = h.controller; h.controller.store = h.store; h.store.backend = h.backend; h.view.host = h.host;
    h.backend.workspace = owner.workspace;
    if (owner.workspace) { owner.workspace.id = owner.id; owner.workspace.generation = owner.generation; }
    if (h.window.LocalItabWorkspaces) h.window.LocalItabWorkspaces.session = owner.session;
}
function capture(h) { return { workspace: h.backend.workspace, id: h.backend.workspace?.id, generation: h.backend.workspace?.generation, session: h.window.LocalItabWorkspaces?.session }; }
function change(h, source, foreign) {
    if (source === 'controller') h.view.controller = foreign.controller;
    else if (source === 'store') h.controller.store = foreign.store;
    else if (source === 'backend') h.store.backend = foreign.backend;
    else if (source === 'workspace') { h.backend.workspace = { ...h.backend.workspace }; h.window.LocalItabWorkspaces.session = h.backend.workspace; }
    else if (source === 'id') h.backend.workspace.id = 'workspace_0002';
    else if (source === 'generation') h.backend.workspace.generation = 'generation_0002';
    else if (source === 'session') h.window.LocalItabWorkspaces.session = { ...h.backend.workspace };
    else if (source === 'host') { const replacement = h.document.createElement('article'); h.document.body.append(replacement); h.view.host = replacement; }
}
function failNext(h, mode) { if (mode === 'READ') h.backend.nextReadFails = true; else h.backend.mode = mode; }
const errorCode = mode => mode === 'READ' ? 'READ' : mode === 'drop' ? 'VERIFY' : 'WRITE';
async function remoteEdit(h, id, text) {
    const target = record(h, id); await h.remote.mutate(h.remote.request('edit', { id, version: target.version, text })); await h.controller.refresh(); await settle();
}
function assertOtherData(before, after, id = 'task_0000') {
    assert.deepEqual(after.records.filter(task => task.id !== id), before.records.filter(task => task.id !== id));
    assert.deepEqual(after.recovery, before.recovery); assert.equal(after.pinnedId, before.pinnedId); assert.equal(after.enabled, before.enabled);
    const old = before.records.find(task => task.id === id), saved = after.records.find(task => task.id === id);
    assert.equal(saved.id, old.id); assert.equal(saved.createdAt, old.createdAt); assert.equal(saved.state, old.state); assert.equal(saved.removedFrom, old.removedFrom);
}

// First bounded RED suite; original source and log are retained before production.
test('original visible editor saves the exact duplicate identity and preserves real Remove Undo', async t => {
    const h = model(); await settle();
    try {
        row(h, 'task_0002').querySelector('.tasks-row-menu').open = true; button(row(h, 'task_0002'), 'Remove').dispatch('click'); await settle();
        const undo = h.view.undo; assert.equal(undo.id, 'task_0002'); const before = h.backend.raw(), counts = io(h);
        openRow(h); input(h.view.input, 'independent quick draft'); save(h, 'Exact edited duplicate'); await settle();
        t.diagnostic(JSON.stringify({ label: 'valid visible editor', delta: delta(counts, io(h)) }));
        assert.ok(modal(h) === null, 'the owned editor closes'); assert.equal(record(h).text, 'Exact edited duplicate'); assertOtherData(before, h.backend.raw());
        assert.strictEqual(h.view.undo, undo); assert.equal(h.view.input.value, 'independent quick draft');
        h.view.undoButton.dispatch('click'); await settle(); assert.equal(record(h, 'task_0002').state, 'active');
    } finally { h.view.destroy(); }
});
for (const workspaceMode of ['undefined', 'null', 'anonymous']) test(`original programmatic edit remains valid: ${workspaceMode}`, async () => {
    const h = model({ workspaceMode }); await settle();
    try { h.view.edit(h.controller.state.records[0]); save(h, 'legacy direct edit'); await settle(); assert.equal(record(h).text, 'legacy direct edit'); assert.ok(modal(h) === null, 'the owned editor closes'); }
    finally { h.view.destroy(); }
});
test('an open editor survives row redraw, filter, collapse, unrelated edit and pin', async () => {
    const h = model(); await settle();
    try {
        h.view.more.dispatch('click'); const draft = openRow(h); input(draft, 'still my draft');
        input(h.view.filterInput, 'not present'); h.view.expanded = false; h.view.render();
        await remoteEdit(h, 'task_0003', 'Unrelated saved edit');
        await h.remote.mutate(h.remote.request('pin', { id: 'task_0004', version: record(h, 'task_0004').version, expectedPin: 'task_0001' })); await h.controller.refresh();
        assert.ok(editor(h) === draft, 'the original opening retains its draft'); const counts = io(h); save(h); await settle();
        assert.equal(record(h).text, 'still my draft'); assert.equal(h.backend.raw().pinnedId, 'task_0004'); assert.equal(h.backend.requests, counts.requests + 1);
    } finally { h.view.destroy(); }
});
for (const source of ['controller', 'store', 'backend', 'workspace', 'id', 'generation', 'session', 'host']) test(`RED: new Save cannot adopt replacement ${source}`, async t => {
    const h = model(), foreign = model({ workspace: h.backend.workspace }); await settle(); const owner = capture(h);
    try {
        const draft = openRow(h); input(draft, 'original unsaved draft'); change(h, source, foreign);
        const own = io(h), other = io(foreign), before = h.backend.raw(), foreignBefore = foreign.backend.raw(); save(h); await settle();
        t.diagnostic(JSON.stringify({ source, own: delta(own, io(h)), foreign: delta(other, io(foreign)), draftOpen: editor(h) === draft }));
        assert.deepEqual({ own: io(h), foreign: io(foreign) }, { own, foreign: other }, 'source rejection precedes requests and all storage I/O');
        assert.deepEqual(h.backend.raw(), before); assert.deepEqual(foreign.backend.raw(), foreignBefore); assert.ok(editor(h) === draft, 'the original opening retains its draft'); assert.equal(draft.value, 'original unsaved draft');
        restore(h, owner); save(h); await settle(); assert.equal(record(h).text, 'original unsaved draft');
    } finally { restore(h, owner); h.view.destroy(); foreign.view.destroy(); }
});
test('RED: construction source is retained before first asynchronous render and before opening', async t => {
    const h = model(), owner = capture(h); change(h, 'workspace'); await settle();
    try {
        const origin = row(h).querySelector('.tasks-row-menu'); origin.open = true;
        const counts = io(h), before = h.backend.raw(); button(row(h), 'Edit').dispatch('click');
        if (editor(h)) save(h, 'must stay on original source'); await settle();
        t.diagnostic(JSON.stringify({ label: 'before-first-render', delta: delta(counts, io(h)) }));
        assert.deepEqual(io(h), counts); assert.deepEqual(h.backend.raw(), before);
    } finally { restore(h, owner); h.view.destroy(); }
});
for (const mode of ['READ', 'false', 'drop', 'ack']) test(`RED: exact ${mode} failure Retry cannot cross independent backend, and remains recoverable on original`, async t => {
    const h = model(), foreign = model({ workspace: h.backend.workspace }); await settle(); const owner = capture(h);
    try {
        const draft = openRow(h); failNext(h, mode); save(h, 'exact failed draft'); await settle();
        const original = h.controller.retryCommand; assert.equal(h.controller.error.code, errorCode(mode)); assert.equal(original.kind, 'edit');
        change(h, 'backend', foreign); const own = io(h), other = io(foreign), raw = foreign.backend.raw(); save(h); await settle();
        t.diagnostic(JSON.stringify({ mode, own: delta(own, io(h)), foreign: delta(other, io(foreign)), originalCommandRetained: h.controller.retryCommand === original, draftOpen: editor(h) === draft }));
        assert.deepEqual({ own: io(h), foreign: io(foreign) }, { own, foreign: other }); assert.deepEqual(foreign.backend.raw(), raw);
        assert.ok(editor(h) === draft, 'the original opening retains its draft'); assert.strictEqual(h.controller.retryCommand, original);
        restore(h, owner); const counts = io(h); save(h); await settle();
        assert.ok(modal(h) === null, 'the owned editor closes'); assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + (mode === 'ack' ? 0 : 1));
        assert.equal(h.backend.raw().receipts.filter(id => id === original.operationId).length, 1);
    } finally { restore(h, owner); h.view.destroy(); foreign.view.destroy(); }
});
for (const mode of ['READ', 'false', 'drop', 'ack']) test(`original ${mode} Retry recovers after temporary foreign source without permanent disable`, async t => {
    const h = model(), foreign = model({ workspace: h.backend.workspace }); await settle(); const owner = capture(h);
    try {
        openRow(h); failNext(h, mode); save(h, 'returning original draft'); await settle(); const original = h.controller.retryCommand;
        assert.equal(h.controller.error.code, errorCode(mode)); change(h, 'controller', foreign); await settle(); restore(h, owner);
        assert.equal(button(modal(h), 'Save task').disabled, false); const counts = io(h); save(h); await settle();
        t.diagnostic(JSON.stringify({ mode, delta: delta(counts, io(h)), receiptCount: h.backend.raw().receipts.filter(id => id === original.operationId).length }));
        assert.ok(modal(h) === null, 'the owned editor closes'); assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + (mode === 'ack' ? 0 : 1));
        assert.equal(h.backend.raw().receipts.filter(id => id === original.operationId).length, 1);
    } finally { restore(h, owner); h.view.destroy(); foreign.view.destroy(); }
});
for (const newer of ['input', 'IME']) test(`newer ${newer} generation after real failed write never retries the older command`, async () => {
    const h = model(); await settle();
    try {
        const draft = openRow(h), gate = deferred(); h.backend.writeGate = gate; failNext(h, 'false'); save(h, 'older submitted text'); await settle();
        assert.equal(h.backend.writes, 1); if (newer === 'input') input(draft, 'newer draft'); else draft.dispatch('compositionstart');
        gate.resolve(); await settle(); const old = h.controller.retryCommand; assert.equal(h.controller.error.code, 'WRITE');
        if (newer === 'IME') { draft.dispatch('keydown', { key: 'Escape' }); assert.ok(editor(h) === draft, 'the original opening retains its draft'); draft.dispatch('compositionend'); }
        const counts = io(h); save(h); await settle(); assert.equal(h.backend.requests, counts.requests + 1);
        assert.notEqual(h.backend.raw().receipts.at(-1), old.operationId); assert.equal(record(h).text, newer === 'input' ? 'newer draft' : 'older submitted text');
    } finally { h.view.destroy(); }
});
test('reviewed overwrite uses the exact displayed conflict version through a second real conflict', async () => {
    const h = model(); await settle();
    try {
        openRow(h); input(editor(h), 'my replacement'); await remoteEdit(h, 'task_0000', 'Remote A'); save(h); await settle();
        assert.equal(h.controller.error.code, 'CONFLICT'); assert.match(modal(h).querySelector('.tasks-latest').textContent, /Remote A/);
        await remoteEdit(h, 'task_0000', 'Remote B'); button(modal(h), 'Replace latest with my edit').dispatch('click'); await settle();
        assert.equal(record(h).text, 'Remote B'); assert.match(modal(h).querySelector('.tasks-latest').textContent, /Remote B/);
        const before = h.backend.raw(); button(modal(h), 'Replace latest with my edit').dispatch('click'); await settle();
        assert.equal(record(h).text, 'my replacement'); assertOtherData(before, h.backend.raw()); assert.ok(modal(h) === null, 'the owned editor closes');
    } finally { h.view.destroy(); }
});
test('RED: reviewed overwrite cannot use the original displayed version in independent foreign storage', async t => {
    const h = model(); await settle(); const owner = capture(h); let foreign;
    try {
        const draft = openRow(h); input(draft, 'my replacement'); await remoteEdit(h, 'task_0000', 'Reviewed original latest'); save(h); await settle();
        assert.equal(h.controller.error.code, 'CONFLICT'); const reviewed = modal(h).querySelector('.tasks-latest').textContent;
        foreign = model({ workspace: h.backend.workspace, state: h.backend.raw() }); await settle(); change(h, 'store', foreign);
        const own = io(h), other = io(foreign); button(modal(h), 'Replace latest with my edit').dispatch('click'); await settle();
        t.diagnostic(JSON.stringify({ label: 'foreign overwrite', own: delta(own, io(h)), foreign: delta(other, io(foreign)), draftOpen: editor(h) === draft }));
        assert.deepEqual({ own: io(h), foreign: io(foreign) }, { own, foreign: other }); assert.ok(editor(h) === draft, 'the original opening retains its draft'); assert.equal(modal(h).querySelector('.tasks-latest').textContent, reviewed);
    } finally { restore(h, owner); h.view.destroy(); foreign?.view.destroy(); }
});
for (const target of ['textarea', 'Save control']) test(`RED: opening cannot retain authority after its ${target} leaves the original dialog`, async t => {
    const h = model(); await settle();
    try {
        const draft = openRow(h); input(draft, 'retained unsaved text'); const action = button(modal(h), 'Save task');
        const moved = target === 'textarea' ? draft : action; moved.remove(); h.document.body.append(moved);
        const counts = io(h); action.dispatch('click'); await settle(); t.diagnostic(JSON.stringify({ target, delta: delta(counts, io(h)) }));
        assert.deepEqual(io(h), counts); assert.equal(draft.value, 'retained unsaved text');
    } finally { h.view.destroy(); }
});
test('RED: Cancel dismisses only its original Controller operation even when foreign operation IDs coincide', async t => {
    const h = model(), foreign = model({ workspace: h.backend.workspace }); await settle(); const owner = capture(h);
    try {
        openRow(h); failNext(h, 'false'); save(h, 'original failed draft'); await settle(); const original = h.controller.retryCommand;
        failNext(foreign, 'false'); const other = foreign.store.request('edit', { id: 'task_0001', version: record(foreign, 'task_0001').version, text: 'independent failed command' });
        await assert.rejects(foreign.controller.run(other), error => error.code === 'WRITE'); assert.equal(other.operationId, original.operationId); assert.notStrictEqual(other, original);
        change(h, 'controller', foreign); const own = io(h), otherIO = io(foreign); button(modal(h), 'Cancel').dispatch('click'); await settle();
        t.diagnostic(JSON.stringify({ originalRetryRetained: h.controller.retryCommand === original, foreignRetryRetained: foreign.controller.retryCommand === other, own: delta(own, io(h)), foreign: delta(otherIO, io(foreign)) }));
        assert.equal(h.controller.retryCommand, null); assert.strictEqual(foreign.controller.retryCommand, other); assert.equal(foreign.controller.error.code, 'WRITE');
    } finally { restore(h, owner); h.view.destroy(); foreign.view.destroy(); }
});
test('RED: already-dispatched successful write is not cancelled, but a foreign source cannot close its draft', async t => {
    const h = model(), foreign = model({ workspace: h.backend.workspace }); await settle(); const owner = capture(h);
    try {
        const draft = openRow(h), gate = deferred(); h.backend.writeGate = gate; save(h, 'already dispatched original save'); await settle();
        assert.equal(h.backend.writes, 1); const counts = io(h), other = io(foreign); change(h, 'controller', foreign); gate.resolve(); await settle();
        t.diagnostic(JSON.stringify({ label: 'dispatched-write success', own: delta(counts, io(h)), foreign: delta(other, io(foreign)), originalSaved: record(h).text, draftOpen: editor(h) === draft }));
        assert.equal(record(h).text, 'already dispatched original save'); assert.deepEqual(io(foreign), other); assert.ok(editor(h) === draft, 'the original opening retains its draft');
        assert.equal(draft.value, 'already dispatched original save'); assert.equal(button(modal(h), 'Save task').disabled, false);
        restore(h, owner); const resumed = io(h); save(h); await settle(); assert.ok(modal(h) === null, 'the owned editor closes');
        assert.equal(h.backend.requests, resumed.requests); assert.equal(h.backend.writes, resumed.writes);
    } finally { restore(h, owner); h.view.destroy(); foreign.view.destroy(); }
});
test('in-flight verification failure retains exact retry and acknowledges original committed write after source returns', async t => {
    const h = model(), foreign = model({ workspace: h.backend.workspace }); await settle(); const owner = capture(h);
    try {
        const draft = openRow(h), gate = deferred(); h.backend.writeGate = gate; save(h, 'committed before source returns'); await settle();
        const original = h.controller.retryCommand, own = io(h), other = io(foreign); change(h, 'backend', foreign); gate.resolve(); await settle();
        t.diagnostic(JSON.stringify({ label: 'dispatched-write verify', own: delta(own, io(h)), foreign: delta(other, io(foreign)), code: h.controller.error?.code }));
        assert.equal(h.controller.error.code, 'VERIFY'); assert.ok(editor(h) === draft, 'the original opening retains its draft'); assert.equal(button(modal(h), 'Save task').disabled, false);
        restore(h, owner); const counts = io(h); save(h); await settle(); assert.ok(modal(h) === null, 'the owned editor closes'); assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes);
        assert.equal(h.backend.raw().receipts.filter(id => id === original.operationId).length, 1);
    } finally { restore(h, owner); h.view.destroy(); foreign.view.destroy(); }
});
test('RED boundary: already-dispatched read can still reach replacement backend; its late result must retain the original draft', async t => {
    const h = model(), foreign = model({ workspace: h.backend.workspace }); await settle(); const owner = capture(h);
    try {
        const draft = openRow(h), gate = deferred(); h.backend.readGate = gate; save(h, 'dispatched read draft'); await settle();
        assert.equal(h.backend.writes, 0); const own = io(h), other = io(foreign); change(h, 'backend', foreign); gate.resolve(); await settle();
        t.diagnostic(JSON.stringify({ label: 'dispatched-read boundary', own: delta(own, io(h)), foreign: delta(other, io(foreign)), foreignText: record(foreign).text, draftOpen: editor(h) === draft }));
        // This documents a Store-level limit of the proposed UI-only change, not a
        // zero-I/O expectation or permission to redirect an already-started write.
        assert.equal(foreign.backend.writes, other.writes + 1); assert.equal(record(foreign).text, 'dispatched read draft');
        assert.ok(editor(h) === draft, 'the original opening retains its draft'); assert.equal(draft.value, 'dispatched read draft'); assert.equal(button(modal(h), 'Save task').disabled, false);
    } finally { restore(h, owner); h.view.destroy(); foreign.view.destroy(); }
});
test('RED: late real conflict cannot display a foreign Controller record as reviewed latest', async t => {
    const h = model(); await settle(); const owner = capture(h), foreignState = initial(); foreignState.records[0].text = 'FOREIGN unreviewed text';
    const foreign = model({ workspace: h.backend.workspace, state: foreignState }); await settle();
    try {
        const draft = openRow(h); input(draft, 'original conflict draft'); await remoteEdit(h, 'task_0000', 'Original source latest');
        const gate = deferred(); h.backend.readGate = gate; save(h); await settle(); change(h, 'controller', foreign); const other = io(foreign); gate.resolve(); await settle();
        const displayed = modal(h)?.querySelector('.tasks-latest').textContent; t.diagnostic(JSON.stringify({ label: 'late conflict', displayed, foreign: delta(other, io(foreign)) }));
        assert.equal(h.controller.error.code, 'CONFLICT'); assert.ok(editor(h) === draft, 'the original opening retains its draft'); assert.doesNotMatch(displayed || '', /FOREIGN/); assert.equal(button(modal(h), 'Save task').disabled, false);
        restore(h, owner); save(h); await settle(); assert.match(modal(h).querySelector('.tasks-latest').textContent, /Original source latest/);
    } finally { restore(h, owner); h.view.destroy(); foreign.view.destroy(); }
});

// Scope-approved static expansion. These additions require a separate authorized
// verification window; they do not change the retained pre-production evidence.
for (const source of ['controller', 'store', 'backend', 'workspace', 'id', 'generation', 'session', 'host']) test(`construction owner rejects ${source} replacement before a later visible Edit opening`, async t => {
    const h = model(), foreign = model({ workspace: h.backend.workspace }); await settle(); const owner = capture(h);
    try {
        row(h).querySelector('.tasks-row-menu').open = true; const action = button(row(h), 'Edit'); change(h, source, foreign);
        const own = io(h), other = io(foreign); action.dispatch('click'); await settle();
        t.diagnostic(JSON.stringify({ source, phase: 'before-opening', own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert.ok(modal(h) === null, 'a foreign source cannot acquire an editor'); assert.deepEqual({ own: io(h), foreign: io(foreign) }, { own, foreign: other });
        restore(h, owner); openRow(h); save(h, 'returned original source'); await settle(); assert.equal(record(h).text, 'returned original source');
    } finally { restore(h, owner); h.view.destroy(); foreign.view.destroy(); }
});
for (const source of ['controller', 'store', 'workspace', 'id', 'generation', 'session', 'host']) test(`same-draft acknowledgement Retry preserves original receipt across ${source} refusal and return`, async t => {
    const h = model(), foreign = model({ workspace: h.backend.workspace }); await settle(); const owner = capture(h);
    try {
        const draft = openRow(h); failNext(h, 'ack'); save(h, 'committed exact draft'); await settle();
        const original = h.controller.retryCommand, error = h.controller.error, state = h.controller.state; assert.equal(error.code, 'WRITE');
        change(h, source, foreign); const own = io(h), other = io(foreign); save(h); await settle();
        t.diagnostic(JSON.stringify({ source, phase: 'ack-retry-refusal', own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert.deepEqual({ own: io(h), foreign: io(foreign) }, { own, foreign: other }); assert.ok(editor(h) === draft);
        assert.strictEqual(h.controller.retryCommand, original); assert.strictEqual(h.controller.error, error); assert.strictEqual(h.controller.state, state);
        restore(h, owner); const resumed = io(h); save(h); await settle(); assert.ok(modal(h) === null);
        assert.equal(h.backend.requests, resumed.requests); assert.equal(h.backend.writes, resumed.writes); assert.equal(h.backend.raw().receipts.filter(id => id === original.operationId).length, 1);
    } finally { restore(h, owner); h.view.destroy(); foreign.view.destroy(); }
});
for (const source of ['controller', 'backend', 'workspace', 'id', 'generation', 'session', 'host']) test(`reviewed overwrite keeps its exact original version across ${source} refusal and return`, async t => {
    const h = model(); await settle(); const owner = capture(h); let foreign;
    try {
        const draft = openRow(h); input(draft, 'reviewed original replacement'); await remoteEdit(h, 'task_0000', 'Original reviewed A'); save(h); await settle();
        const reviewed = modal(h).querySelector('.tasks-latest').textContent; assert.match(reviewed, /Original reviewed A/);
        foreign = model({ workspace: h.backend.workspace, state: h.backend.raw() }); await settle(); change(h, source, foreign);
        const own = io(h), other = io(foreign); button(modal(h), 'Replace latest with my edit').dispatch('click'); await settle();
        t.diagnostic(JSON.stringify({ source, phase: 'overwrite-refusal', own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert.deepEqual({ own: io(h), foreign: io(foreign) }, { own, foreign: other }); assert.ok(editor(h) === draft); assert.equal(modal(h).querySelector('.tasks-latest').textContent, reviewed);
        restore(h, owner); await remoteEdit(h, 'task_0000', 'Original unreviewed B'); button(modal(h), 'Replace latest with my edit').dispatch('click'); await settle();
        assert.equal(record(h).text, 'Original unreviewed B'); assert.match(modal(h).querySelector('.tasks-latest').textContent, /Original unreviewed B/);
        button(modal(h), 'Replace latest with my edit').dispatch('click'); await settle(); assert.equal(record(h).text, 'reviewed original replacement');
    } finally { restore(h, owner); h.view.destroy(); foreign?.view.destroy(); }
});
for (const source of ['controller', 'store', 'workspace']) for (const mode of ['success', 'false', 'ack']) test(`already-dispatched ${mode} write retains draft and exact original-source retry after ${source} switch`, async t => {
    const h = model(), foreign = model({ workspace: h.backend.workspace }); await settle(); const owner = capture(h);
    try {
        const draft = openRow(h), gate = deferred(); h.backend.writeGate = gate; if (mode !== 'success') failNext(h, mode);
        save(h, 'pending original draft'); await settle(); assert.equal(h.backend.writes, 1); const command = h.controller.retryCommand;
        change(h, source, foreign); const own = io(h), other = io(foreign); gate.resolve(); await settle();
        t.diagnostic(JSON.stringify({ mode, source, phase: 'pending-settlement', own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert.ok(editor(h) === draft); assert.equal(draft.value, 'pending original draft'); assert.equal(button(modal(h), 'Save task').disabled, false);
        assert.deepEqual(io(foreign), other); restore(h, owner); const resumed = io(h); save(h); await settle();
        assert.ok(modal(h) === null); assert.equal(h.backend.requests, resumed.requests); assert.equal(h.backend.writes, resumed.writes + (mode === 'false' ? 1 : 0));
        assert.equal(h.backend.raw().receipts.filter(id => id === command.operationId).length, 1);
    } finally { restore(h, owner); h.view.destroy(); foreign.view.destroy(); }
});
for (const newer of ['input', 'IME']) for (const mode of ['success', 'false']) test(`late ${mode} during foreign Controller interval preserves newer ${newer} generation`, async () => {
    const h = model(), foreign = model({ workspace: h.backend.workspace }); await settle(); const owner = capture(h);
    try {
        const draft = openRow(h), gate = deferred(); h.backend.writeGate = gate; if (mode === 'false') failNext(h, mode);
        save(h, 'older submitted text'); await settle(); const original = h.controller.retryCommand; change(h, 'controller', foreign);
        if (newer === 'input') input(draft, 'newer source-owned draft'); else draft.dispatch('compositionstart');
        gate.resolve(); await settle(); assert.ok(editor(h) === draft); assert.equal(button(modal(h), 'Save task').disabled, false);
        if (newer === 'IME') { draft.dispatch('keydown', { key: 'Escape' }); assert.ok(editor(h) === draft); draft.dispatch('compositionend'); }
        restore(h, owner); const resumed = io(h); save(h); await settle(); assert.equal(h.backend.requests, resumed.requests + 1);
        if (mode === 'success') {
            // The old baseline was not adopted while source authority was absent.
            // A new generation must review the real original-source version.
            assert.equal(h.controller.error.code, 'CONFLICT'); assert.ok(editor(h) === draft);
            button(modal(h), 'Replace latest with my edit').dispatch('click'); await settle();
        }
        assert.equal(record(h).text, newer === 'input' ? 'newer source-owned draft' : 'older submitted text');
        assert.notEqual(h.backend.raw().receipts.at(-1), original.operationId);
    } finally { restore(h, owner); h.view.destroy(); foreign.view.destroy(); }
});
for (const sessionMode of ['absent', 'missing', 'wrong']) test(`identified construction source requires a matching session: ${sessionMode}`, async t => {
    const h = model({ sessionMode }); await settle();
    try {
        const counts = io(h); h.view.edit(h.controller.state.records[0]); await settle();
        t.diagnostic(JSON.stringify({ sessionMode, delta: delta(counts, io(h)) })); assert.ok(modal(h) === null); assert.deepEqual(io(h), counts);
    } finally { h.view.destroy(); }
});
for (const workspace of [{ id: 'workspace_0001' }, { generation: 'generation_0001' }, {}]) test(`matching partial or anonymous workspace supports original editor: ${JSON.stringify(workspace)}`, async () => {
    const h = model({ workspace }); await settle();
    try { openRow(h); save(h, 'matching partial source'); await settle(); assert.equal(record(h).text, 'matching partial source'); }
    finally { h.view.destroy(); }
});
test('legacy null and undefined workspace/session normalization preserves original editor', async () => {
    const h = model({ workspaceMode: 'null' }); await settle();
    try { openRow(h); h.backend.workspace = undefined; h.window.LocalItabWorkspaces.session = undefined; save(h, 'legacy normalized'); await settle(); assert.equal(record(h).text, 'legacy normalized'); }
    finally { h.view.destroy(); }
});
for (const flag of ['invalidated', '_suspended']) test(`original editor rejects unavailable workspace ${flag} and resumes after restoration`, async () => {
    const h = model(); await settle();
    try {
        const draft = openRow(h); input(draft, 'paused original draft'); h.backend.workspace[flag] = true; const counts = io(h); save(h); await settle();
        assert.deepEqual(io(h), counts); assert.ok(editor(h) === draft); h.backend.workspace[flag] = false; save(h); await settle(); assert.equal(record(h).text, 'paused original draft');
    } finally { h.backend.workspace[flag] = false; h.view.destroy(); }
});
for (const target of ['actions', 'panel', 'Cancel', 'Replace latest with my edit']) test(`original opening rejects moved ${target} identity without new I/O`, async () => {
    const h = model(); await settle();
    try {
        const draft = openRow(h); input(draft, 'unmoved draft value'); const saveButton = button(modal(h), 'Save task');
        const node = target === 'actions' ? modal(h).querySelector('.tasks-dialog-actions') : target === 'panel' ? modal(h) : button(modal(h), target);
        node.remove(); h.document.body.append(node); const counts = io(h); saveButton.dispatch('click'); await settle();
        assert.deepEqual(io(h), counts); assert.equal(draft.value, 'unmoved draft value');
    } finally { h.view.destroy(); }
});
test('synthetic final draft getter source change is observed and rejected before request construction', async t => {
    const h = model(), foreign = model({ workspace: h.backend.workspace }); await settle(); const owner = capture(h);
    try {
        const draft = openRow(h); input(draft, 'getter-owned draft'); let value = draft.value, observed = 0;
        Object.defineProperty(draft, 'value', { configurable: true, get() { observed++; change(h, 'controller', foreign); return value; }, set(next) { value = next; } });
        const own = io(h), other = io(foreign); button(modal(h), 'Save task').dispatch('click'); await settle();
        t.diagnostic(JSON.stringify({ boundary: 'draft-value-getter', observed, own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert.ok(observed > 0, 'the synthetic hook actually executed'); assert.deepEqual({ own: io(h), foreign: io(foreign) }, { own, foreign: other }); assert.ok(editor(h) === draft);
        Object.defineProperty(draft, 'value', { configurable: true, writable: true, value }); restore(h, owner); save(h); await settle(); assert.equal(record(h).text, value);
    } finally { restore(h, owner); h.view.destroy(); foreign.view.destroy(); }
});
test('synthetic disabling-control source change is observed before Controller dispatch and remains retryable', async t => {
    const h = model(), foreign = model({ workspace: h.backend.workspace }); await settle(); const owner = capture(h);
    try {
        openRow(h); input(editor(h), 'control-owned draft'); const action = button(modal(h), 'Save task'), descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(action), 'disabled'); let observed = 0;
        Object.defineProperty(action, 'disabled', { configurable: true, get() { return descriptor.get.call(this); }, set(value) { descriptor.set.call(this, value); if (value) { observed++; change(h, 'controller', foreign); } } });
        const own = io(h), other = io(foreign); focus(h, action); action.dispatch('click'); await settle();
        t.diagnostic(JSON.stringify({ boundary: 'disabled-control-setter', observed, own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert.ok(observed > 0, 'the synthetic hook actually executed'); assert.deepEqual(delta(own, io(h)), { requests: 1, reads: 0, writes: 0 }); assert.deepEqual(io(foreign), other);
        assert.equal(h.controller.pending, null); assert.equal(action.disabled, false); delete action.disabled; restore(h, owner);
        const resumed = io(h); save(h); await settle(); assert.equal(h.backend.requests, resumed.requests); assert.equal(record(h).text, 'control-owned draft');
    } finally { restore(h, owner); h.view.destroy(); foreign.view.destroy(); }
});
test('source-refused Save preserves real Remove Undo, Controller failure and original focused draft', async () => {
    const h = model(), foreign = model({ workspace: h.backend.workspace }); await settle(); const owner = capture(h);
    try {
        row(h, 'task_0002').querySelector('.tasks-row-menu').open = true; button(row(h, 'task_0002'), 'Remove').dispatch('click'); await settle(); const undo = h.view.undo;
        const draft = openRow(h); failNext(h, 'false'); save(h, 'owned pending retry'); await settle(); const retry = h.controller.retryCommand, error = h.controller.error, state = h.controller.state;
        change(h, 'controller', foreign); const own = io(h), other = io(foreign); focus(h, draft); button(modal(h), 'Save task').dispatch('click'); await settle();
        assert.deepEqual({ own: io(h), foreign: io(foreign) }, { own, foreign: other }); assert.strictEqual(h.controller.retryCommand, retry); assert.strictEqual(h.controller.error, error); assert.strictEqual(h.controller.state, state);
        assert.strictEqual(h.view.undo, undo); assert.ok(h.document.activeElement === draft); assert.equal(draft.value, 'owned pending retry');
        restore(h, owner); save(h); await settle(); assert.strictEqual(h.view.undo, undo); h.view.undoButton.dispatch('click'); await settle(); assert.equal(record(h, 'task_0002').state, 'active');
    } finally { restore(h, owner); h.view.destroy(); foreign.view.destroy(); }
});

test('original host detached after dispatched Save does not orphan its editor or regain focus', async t => {
    const h = model(); await settle();
    try {
        const before = h.backend.raw(), draft = openRow(h), gate = deferred(); h.backend.writeGate = gate;
        save(h, 'saved while original host detached'); await settle();
        assert.equal(h.backend.writes, 1, 'the real original backend write is already dispatched'); assert.ok(h.controller.pending);
        h.host.remove(); assert.equal(h.host.isConnected, false); assert.ok(editor(h) === draft); assert.ok(h.document.activeElement === draft);
        const counts = io(h); gate.resolve(); await settle();
        t.diagnostic(JSON.stringify({ boundary: 'original-host-detached-after-dispatch', delta: delta(counts, io(h)), closed: modal(h) === null, focusIsBody: h.document.activeElement === h.document.body }));
        assert.ok(modal(h) === null, 'same-source confirmed Save still closes its own editor'); assert.equal(h.controller.status, 'saved');
        assert.equal(record(h).text, 'saved while original host detached'); assertOtherData(before, h.backend.raw()); assert.equal(h.backend.writes, 1);
        assert.ok(h.document.activeElement === h.document.body, 'no detached row or quick entry receives focus');
    } finally { h.view.destroy(); }
});
