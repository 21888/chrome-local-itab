const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');
const tasks = require('../shared/local-tasks-store.js');
const { Controller } = require('../shared/local-tasks-controller.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { await tick(); await tick(); await tick(); }
const clone = value => structuredClone(value);
function initial() {
    return tasks.validate({ schemaVersion: 1, revision: 4, enabled: true, pinnedId: 'task_0005', receipts: ['previous_1'],
        records: Array.from({ length: 7 }, (_, i) => ({ id: `task_000${i}`, version: `version_${i}`,
            text: [0, 5].includes(i) ? '  duplicate 中文 😀\ntext  ' : `Synthetic task ${i}`, state: 'active', removedFrom: null,
            createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' })),
        recovery: [{ id: 'recovery_1', createdAt: '2026-10-03T00:00:00.000Z', content: { records: [], pinnedId: null } }] });
}
// This synthetic ownership model uses the real Store, Controller and View.
// Different workspace object/ID/generation and independent backends have distinct data.
// It is not native Chrome, keyboard, MutationObserver or visual-layout evidence.
function model({ workspaceMode = 'identified', sessionMode = 'matching', locale = 'en' } = {}) {
    const sources = new Map(), identities = new WeakMap(), listeners = new Set();
    let identity = 0, queue = Promise.resolve(), operation = 0;
    const backend = {
        workspace: workspaceMode === 'undefined' ? undefined : workspaceMode === 'null' ? null :
            workspaceMode === 'anonymous' ? { invalidated: false, _suspended: false } : { ...(workspaceMode !== 'generation-only' ? { id: 'workspace_0001' } : {}), ...(workspaceMode !== 'id-only' ? { generation: 'generation_0001' } : {}) },
        reads: 0, writes: 0, requests: 0, mode: null, delay: null, notifications: true, nextReadFails: false,
        lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() {
            backend.reads++;
            if (backend.nextReadFails) { backend.nextReadFails = false; throw Error('synthetic read failure'); }
            return clone(source().raw);
        },
        async write(value) {
            backend.writes++;
            if (backend.delay) await backend.delay;
            if (backend.mode === 'false') return false;
            if (backend.mode === 'drop') return;
            source().raw = clone(value);
            if (backend.notifications) listeners.forEach(fn => fn());
            if (backend.mode === 'ack') throw Error('synthetic acknowledgement failure');
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        raw: () => clone(source().raw)
    };
    function source() {
        const workspace = backend.workspace;
        if (workspace && !identities.has(workspace)) identities.set(workspace, ++identity);
        const key = workspace ? `${identities.get(workspace)}:${workspace.id}:${workspace.generation}` : 'legacy';
        if (!sources.has(key)) sources.set(key, { raw: initial() });
        return sources.get(key);
    }
    const store = new tasks.Store(backend, { id: () => `operation_${++operation}`, now: () => '2026-10-18T02:00:00.000Z' });
    const request = store.request.bind(store);
    store.request = (...args) => { backend.requests++; return request(...args); };
    const remote = new tasks.Store(backend), controller = new Controller(store);
    const document = createDocument({ blurUnavailableFocus: true }), host = document.createElement('article'), search = document.createElement('input');
    document.body.append(search, host); search.focus();
    const catalog = locale === 'fallback' ? {} : JSON.parse(fs.readFileSync(path.join(__dirname, '../_locales', locale, 'messages.json'), 'utf8'));
    const api = { ...tasks, Controller }, window = { LocalItabTasks: api, LocalItabContentLifecycle: { departing: false },
        LocalItabWorkspaces: { session: sessionMode === 'missing' ? undefined : sessionMode === 'wrong' ? {} : backend.workspace },
        i18n: { t: key => catalog[key]?.message || key },
        getComputedStyle(node) { return { display: node.style.display || 'block', visibility: node.style.visibility || 'visible' }; } };
    if (workspaceMode === 'anonymous' || sessionMode === 'absent') delete window.LocalItabWorkspaces;
    const context = vm.createContext({ window, document, crypto: webcrypto, URL, Blob, setTimeout, console });
    for (const name of ['dialog-focus.js', 'local-tasks-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared', name), 'utf8'), context);
    const view = api.mount(host, { controller });
    return { backend, store, remote, controller, document, host, search, window, view };
}
const command = (store, kind, task, values = {}) => store.request(kind, { id: task.id, version: task.version, ...values });
const record = (h, id = 'task_0005') => h.backend.raw().records.find(task => task.id === id);
const io = h => ({ requests: h.backend.requests, reads: h.backend.reads, writes: h.backend.writes });
const delta = (before, after) => Object.fromEntries(Object.keys(before).map(key => [key, after[key] - before[key]]));
const input = (node, value) => { node.value = value; node.dispatch('input'); };
const redraw = h => { h.view.renderedRevision = -1; h.view.render(); };
function sourceRestore(h, workspace) {
    h.view.controller = h.controller; h.controller.store = h.store; h.store.backend = h.backend;
    h.backend.workspace = workspace; h.window.LocalItabWorkspaces.session = workspace;
}
const changes = {
    object(h) { h.backend.workspace = { ...h.backend.workspace }; h.window.LocalItabWorkspaces.session = h.backend.workspace; },
    id(h) { h.backend.workspace.id = 'workspace_0002'; },
    generation(h) { h.backend.workspace.generation = 'generation_0002'; },
    session(h) { h.window.LocalItabWorkspaces.session = { ...h.backend.workspace }; }
};
function failNext(h, mode) { if (mode === 'READ') h.backend.nextReadFails = true; else h.backend.mode = mode; }
const errorCode = mode => mode === 'READ' ? 'READ' : mode === 'drop' ? 'VERIFY' : 'WRITE';
async function zeroIO(t, h, action, label, fields = {}) {
    const before = h.backend.raw(), counts = io(h);
    assert.ok(action, `${label}: a modeled action exists`);
    action.dispatch('click', fields); await settle();
    t.diagnostic(JSON.stringify({ label, delta: delta(counts, io(h)), unchanged: JSON.stringify(h.backend.raw()) === JSON.stringify(before) }));
    assert.deepEqual(io(h), counts, `${label}: rejected Next up must have zero requests/reads/writes`);
    assert.deepEqual(h.backend.raw(), before);
}

// FIRST bounded RED: keep this original source/log in evidence before production changes.
test('RED: current Next up completes exact duplicate-text task outside collapsed rows and Undo reopens it', async t => {
    const h = model(); await settle();
    try {
        const action = h.view.nextComplete, before = h.backend.raw(), counts = io(h);
        assert.equal(h.view.list.children.length, 4); assert.equal(h.view.list.querySelectorAll('[data-task-id]').some(row => row.dataset.taskId === 'task_0005'), false);
        assert.equal(action.textContent, 'Complete'); assert.equal(action.getAttribute('aria-label'), `Complete: ${record(h).text}`);
        input(h.view.input, 'Independent draft'); action.focus(); action.dispatch('click'); await settle();
        const saved = h.backend.raw(); t.diagnostic(JSON.stringify({ label: 'current', delta: delta(counts, io(h)) }));
        assert.equal(saved.records[5].state, 'done'); assert.equal(saved.records[0].state, 'active'); assert.equal(saved.pinnedId, null);
        assert.deepEqual(saved.records.filter(r => r.id !== 'task_0005'), before.records.filter(r => r.id !== 'task_0005'));
        assert.deepEqual(saved.recovery, before.recovery); assert.equal(saved.records[5].text, before.records[5].text);
        assert.equal(h.view.input.value, 'Independent draft'); assert.equal(h.document.activeElement, h.view.input); assert.equal(h.view.undo.id, 'task_0005');
        h.view.undoButton.dispatch('click'); await settle(); assert.equal(record(h).state, 'active'); assert.equal(h.backend.raw().pinnedId, null);
    } finally { h.view.destroy(); }
});
test('RED: unchanged Next up control remains valid through filtering and an unrelated remote update', async () => {
    const h = model(); await settle();
    try {
        const action = h.view.nextComplete; input(h.view.filterInput, 'Synthetic task 1'); assert.strictEqual(h.view.nextComplete, action);
        await h.remote.mutate(command(h.remote, 'edit', record(h, 'task_0002'), { text: 'Unrelated saved edit' })); await settle();
        assert.strictEqual(h.view.nextComplete, action); h.search.focus(); action.dispatch('click'); await settle();
        assert.equal(record(h).state, 'done'); assert.equal(record(h, 'task_0002').text, 'Unrelated saved edit');
        assert.equal(h.view.filterQuery, 'synthetic task 1'); assert.equal(h.document.activeElement, h.search);
    } finally { h.view.destroy(); }
});
test('RED: construction source cannot change before the first asynchronous Next up render', async t => {
    const h = model();
    try { changes.object(h); await settle(); await zeroIO(t, h, h.view.nextComplete, 'before-first-render source object'); }
    finally { h.view.destroy(); }
});
for (const [name, change] of Object.entries(changes)) test(`RED: fresh Next up cannot adopt replacement workspace ${name}`, async t => {
    const h = model(); await settle();
    try { change(h); h.view.next.replaceChildren(); redraw(h); await zeroIO(t, h, h.view.nextComplete, `fresh workspace ${name}`); }
    finally { h.view.destroy(); }
});
for (const source of ['backend', 'store']) for (const fresh of [false, true]) test(`RED: independent ${source} data with same workspace rejects ${fresh ? 'fresh' : 'old'} Next up`, async t => {
    const h = model(), foreign = model(); await settle(); const workspace = h.backend.workspace;
    try {
        foreign.backend.workspace = workspace; foreign.window.LocalItabWorkspaces.session = workspace;
        assert.deepEqual(foreign.backend.raw(), h.backend.raw()); let action = h.view.nextComplete;
        if (source === 'store') h.controller.store = foreign.store; else h.store.backend = foreign.backend;
        if (fresh) { h.view.next.replaceChildren(); redraw(h); action = h.view.nextComplete; }
        const own = io(h), other = io(foreign), raw = foreign.backend.raw(); action.dispatch('click'); await settle();
        t.diagnostic(JSON.stringify({ source, fresh, own: delta(own, io(h)), foreign: delta(other, io(foreign)), foreignChanged: JSON.stringify(raw) !== JSON.stringify(foreign.backend.raw()) }));
        assert.deepEqual({ own: io(h), foreign: io(foreign) }, { own, foreign: other }); assert.deepEqual(foreign.backend.raw(), raw);
    } finally { sourceRestore(h, workspace); h.view.destroy(); foreign.view.destroy(); }
});
test('RED: replacement Controller cannot own a fresh Next up control', async t => {
    const h = model(); await settle(); const other = new Controller(h.store); await other.refresh();
    try { h.view.controller = other; h.view.next.replaceChildren(); redraw(h); await zeroIO(t, h, h.view.nextComplete, 'fresh Controller'); }
    finally { h.view.controller = h.controller; other.destroy(); h.view.destroy(); }
});
test('RED: whole old Next up subtree cannot revive after a replacement subtree lifecycle', async t => {
    const h = model(); await settle();
    try {
        const oldBlock = h.view.next, oldAction = h.view.nextComplete, oldTask = h.view.nextTask;
        const replacement = h.document.createElement('div'); replacement.className = oldBlock.className;
        oldBlock.replaceWith(replacement); h.view.next = replacement; redraw(h); assert.notStrictEqual(h.view.nextComplete, oldAction);
        replacement.replaceWith(oldBlock); h.view.next = oldBlock; h.view.nextComplete = oldAction; h.view.nextTask = oldTask;
        assert.equal(oldAction.isConnected, true); await zeroIO(t, h, oldAction, 'reinserted entire old Next up subtree');
    } finally { h.view.destroy(); }
});
for (const [mode, source] of [['READ', 'workspace'], ['false', 'workspace'], ['drop', 'workspace'], ['ack', 'workspace'], ['ack', 'backend'], ['ack', 'store']]) test(`RED: original ${mode} Retry rejects ${source} replacement`, async t => {
    const h = model(), foreign = model(); await settle(); const workspace = h.backend.workspace; h.backend.notifications = false;
    try {
        failNext(h, mode); h.view.nextComplete.dispatch('click'); await settle(); const request = h.controller.retryCommand;
        assert.equal(request.kind, 'completePinned'); assert.equal(request.id, 'task_0005'); assert.equal(request.expectedPin, 'task_0005');
        assert.equal(h.controller.error.code, errorCode(mode)); h.backend.mode = null;
        foreign.backend.workspace = workspace; foreign.window.LocalItabWorkspaces.session = workspace;
        if (source === 'workspace') changes.object(h); else if (source === 'backend') h.store.backend = foreign.backend; else h.controller.store = foreign.store;
        const own = io(h), other = io(foreign), destination = source === 'workspace' ? h : foreign, raw = destination.backend.raw();
        h.view.retry.dispatch('click'); await settle();
        t.diagnostic(JSON.stringify({ mode, source, own: delta(own, io(h)), foreign: delta(other, io(foreign)), originalCommandRetained: h.controller.retryCommand === request, destinationChanged: JSON.stringify(raw) !== JSON.stringify(destination.backend.raw()) }));
        assert.deepEqual({ own: io(h), foreign: io(foreign) }, { own, foreign: other }); assert.strictEqual(h.controller.retryCommand, request); assert.deepEqual(destination.backend.raw(), raw);
        sourceRestore(h, workspace); const writes = h.backend.writes, requests = h.backend.requests;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.requests, requests);
        assert.equal(h.backend.writes, writes + (mode === 'ack' ? 0 : 1)); assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
    } finally { sourceRestore(h, workspace); h.view.destroy(); foreign.view.destroy(); }
});
for (const mode of ['READ', 'false', 'drop', 'ack']) test(`RED: unknown ${mode} keeps original command against old and new pinned controls`, async t => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        const old = h.view.nextComplete; failNext(h, mode); old.dispatch('click'); await settle();
        const request = h.controller.retryCommand, error = h.controller.error; assert.equal(error.code, errorCode(mode)); h.backend.mode = null;
        const oldCounts = io(h); old.dispatch('click'); await settle();
        const afterOld = io(h), retainedOld = h.controller.retryCommand === request, oldErrorRetained = h.controller.error === error;
        await h.remote.mutate(command(h.remote, 'pin', record(h, 'task_0004'), { expectedPin: h.backend.raw().pinnedId })); await h.controller.refresh();
        const newAction = h.view.nextComplete, newCounts = io(h), raw = h.backend.raw(); assert.notStrictEqual(newAction, old);
        newAction.dispatch('click'); await settle();
        t.diagnostic(JSON.stringify({ mode, old: delta(oldCounts, afterOld), oldCommandRetained: retainedOld, oldErrorRetained,
            new: delta(newCounts, io(h)), finalCommandRetained: h.controller.retryCommand === request, newTargetChanged: JSON.stringify(raw) !== JSON.stringify(h.backend.raw()) }));
        assert.deepEqual(afterOld, oldCounts); assert.equal(retainedOld, true); assert.equal(oldErrorRetained, true);
        assert.deepEqual(io(h), newCounts); assert.strictEqual(h.controller.retryCommand, request); assert.deepEqual(h.backend.raw(), raw);
    } finally { h.view.destroy(); }
});
test('RED: latest committed original receipt confirms after Next up disappeared with zero new writes', async t => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        failNext(h, 'ack'); h.view.nextComplete.dispatch('click'); await settle(); const request = h.controller.retryCommand; h.backend.mode = null;
        await h.controller.refresh(); assert.equal(h.view.nextComplete, null); const counts = io(h), raw = h.backend.raw();
        h.view.retry.focus(); h.view.retry.dispatch('click'); await settle();
        t.diagnostic(JSON.stringify({ label: 'latest original receipt', delta: delta(counts, io(h)) }));
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, counts.writes); assert.equal(h.backend.requests, counts.requests);
        assert.deepEqual(h.backend.raw(), raw); assert.equal(raw.receipts.at(-1), request.operationId); assert.equal(h.view.undo.id, 'task_0005');
        assert.equal(h.document.activeElement, h.view.input);
    } finally { h.view.destroy(); }
});
test('RED: later receipt makes exact original Retry conflict without another write', async t => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        failNext(h, 'ack'); h.view.nextComplete.dispatch('click'); await settle(); const request = h.controller.retryCommand; h.backend.mode = null;
        await h.remote.mutate(command(h.remote, 'edit', record(h, 'task_0002'), { text: 'Unrelated later receipt' }));
        const raw = h.backend.raw(), counts = io(h); h.view.retry.dispatch('click'); await settle();
        t.diagnostic(JSON.stringify({ label: 'later receipt', delta: delta(counts, io(h)) }));
        assert.equal(h.controller.error.code, 'CONFLICT'); assert.strictEqual(h.controller.retryCommand, request);
        assert.equal(h.backend.writes, counts.writes); assert.equal(h.backend.requests, counts.requests); assert.deepEqual(h.backend.raw(), raw);
    } finally { h.view.destroy(); }
});
test('RED: uncommitted exact Retry merges unrelated text and order changes while retaining original pin CAS', async t => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        failNext(h, 'false'); h.view.nextComplete.dispatch('click'); await settle(); const request = h.controller.retryCommand; h.backend.mode = null;
        await h.remote.mutate(command(h.remote, 'edit', record(h, 'task_0002'), { text: 'Independent edit' }));
        await h.remote.mutate(command(h.remote, 'moveLast', record(h, 'task_0001'), { order: h.backend.raw().records.map(r => r.id) }));
        const before = h.backend.raw(), counts = io(h); h.view.retry.dispatch('click'); await settle();
        t.diagnostic(JSON.stringify({ label: 'uncommitted merge', delta: delta(counts, io(h)) }));
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, counts.writes + 1); assert.equal(h.backend.requests, counts.requests);
        assert.equal(h.backend.raw().receipts.at(-1), request.operationId); assert.equal(record(h).state, 'done'); assert.equal(record(h, 'task_0002').text, 'Independent edit');
        assert.deepEqual(h.backend.raw().records.map(r => r.id), before.records.map(r => r.id));
    } finally { h.view.destroy(); }
});
test('RED: uncommitted exact Retry rejects changed pin although original task version is unchanged', async t => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        failNext(h, 'false'); h.view.nextComplete.dispatch('click'); await settle(); const request = h.controller.retryCommand; h.backend.mode = null;
        await h.remote.mutate(command(h.remote, 'pin', record(h, 'task_0004'), { expectedPin: request.expectedPin }));
        assert.equal(record(h).version, request.version); const raw = h.backend.raw(), counts = io(h);
        h.view.retry.dispatch('click'); await settle(); t.diagnostic(JSON.stringify({ label: 'changed pin CAS', delta: delta(counts, io(h)) }));
        assert.equal(h.controller.error.code, 'CONFLICT'); assert.strictEqual(h.controller.retryCommand, request);
        assert.equal(h.backend.writes, counts.writes); assert.equal(h.backend.requests, counts.requests); assert.deepEqual(h.backend.raw(), raw);
    } finally { h.view.destroy(); }
});
test('RED: null undefined and anonymous legacy availability remain legitimate Next up sources', async () => {
    for (const workspaceMode of ['null', 'undefined', 'anonymous']) {
        const h = model({ workspaceMode }); await settle();
        try { h.view.nextComplete.dispatch('click'); await settle(); assert.equal(record(h).state, 'done', workspaceMode); assert.equal(h.backend.writes, 1); }
        finally { h.view.destroy(); }
    }
});
test('RED: identified workspace with missing session cannot authorize Next up', async t => {
    const h = model({ sessionMode: 'missing' }); await settle();
    try { await zeroIO(t, h, h.view.nextComplete, 'identified missing session'); }
    finally { h.view.destroy(); }
});
test('RED: an already-started pinned save preserves a newer editor draft focus and completion Undo', async () => {
    const h = model(); await settle(); const gate = deferred(); h.backend.delay = gate.promise;
    try {
        const action = h.view.nextComplete; action.focus(); action.dispatch('click'); await tick();
        assert.equal(h.backend.writes, 1); assert.equal(h.controller.status, 'saving'); assert.ok(h.controller.pending);
        h.view.edit(record(h, 'task_0002')); const editor = h.document.querySelector('.tasks-editor'); input(editor, 'Newer editor draft'); editor.focus();
        h.document.listeners.get('focusin')?.({ target: editor }); gate.resolve(); h.backend.delay = null; await settle();
        assert.equal(record(h).state, 'done'); assert.equal(h.view.undo.id, 'task_0005'); assert.equal(editor.value, 'Newer editor draft'); assert.equal(h.document.activeElement, editor);
        h.view.undoButton.dispatch('click'); await settle(); assert.equal(record(h).state, 'active'); assert.equal(editor.value, 'Newer editor draft'); assert.equal(h.document.activeElement, editor);
    } finally { gate.resolve(); h.view.destroy(); }
});

// Independent new-pin fixtures never click the stale callback first. They isolate
// a different visible choice while the original unknown command is still intact.
for (const mode of ['READ', 'false', 'drop', 'ack']) for (const notifications of [false, true]) test(`isolated unknown ${mode} rejects new pin with original Retry intact, notifications=${notifications}`, async t => {
    const h = model(); await settle(); h.backend.notifications = notifications;
    try {
        failNext(h, mode); h.view.nextComplete.dispatch('click'); await settle();
        const original = h.controller.retryCommand, error = h.controller.error; assert.equal(error.code, errorCode(mode)); h.backend.mode = null;
        await h.remote.mutate(command(h.remote, 'pin', record(h, 'task_0004'), { expectedPin: h.backend.raw().pinnedId })); await h.controller.refresh();
        assert.strictEqual(h.controller.retryCommand, original); assert.strictEqual(h.controller.error, error); assert.equal(h.view.nextTask.id, 'task_0004');
        await zeroIO(t, h, h.view.nextComplete, 'isolated fresh pin during intact unknown Retry');
        assert.strictEqual(h.controller.retryCommand, original); assert.strictEqual(h.controller.error, error);
        const counts = io(h), before = h.backend.raw(); h.view.retry.dispatch('click'); await settle();
        assert.equal(h.controller.error.code, 'CONFLICT'); assert.strictEqual(h.controller.retryCommand, original);
        assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes); assert.deepEqual(h.backend.raw(), before);
    } finally { h.view.destroy(); }
});
for (const mode of ['READ', 'false', 'drop', 'ack']) test(`unknown ${mode} rejects recreated same Next up without replacing original command`, async t => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        failNext(h, mode); h.view.nextComplete.dispatch('click'); await settle(); const original = h.controller.retryCommand; h.backend.mode = null;
        h.view.next.replaceChildren(); redraw(h); await zeroIO(t, h, h.view.nextComplete, `recreated ${mode} choice`);
        assert.strictEqual(h.controller.retryCommand, original); const counts = io(h); h.view.retry.dispatch('click'); await settle();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + (mode === 'ack' ? 0 : 1));
    } finally { h.view.destroy(); }
});
for (const workspaceMode of ['identified', 'id-only', 'generation-only']) for (const sessionMode of ['missing', 'wrong', 'absent']) test(`identified ${workspaceMode} source refuses ${sessionMode} session`, async t => {
    const h = model({ workspaceMode, sessionMode }); await settle();
    try { await zeroIO(t, h, h.view.nextComplete, 'identified session mismatch'); }
    finally { h.view.destroy(); }
});
for (const workspaceMode of ['id-only', 'generation-only']) test(`matching partially identified ${workspaceMode} source remains usable`, async () => {
    const h = model({ workspaceMode }); await settle();
    try { h.view.nextComplete.dispatch('click'); await settle(); assert.equal(record(h).state, 'done'); }
    finally { h.view.destroy(); }
});
for (const locale of ['zh_CN', 'fallback']) test(`current Next up preserves exact localized saved text and label: ${locale}`, async () => {
    const h = model({ locale }); await settle();
    try {
        const action = h.view.nextComplete, label = locale === 'zh_CN' ? '完成' : 'Complete', text = record(h).text;
        assert.equal(action.textContent, label); assert.equal(action.getAttribute('aria-label'), `${label}: ${text}`);
        action.dispatch('click'); await settle(); assert.equal(record(h).state, 'done'); assert.equal(record(h).text, text);
    } finally { h.view.destroy(); }
});
for (const name of ['id', 'generation', 'session']) test(`construction ${name} is fixed before the initial asynchronous read`, async t => {
    const h = model();
    try { changes[name](h); await settle(); await zeroIO(t, h, h.view.nextComplete, `before initial read ${name}`); }
    finally { h.view.destroy(); }
});
for (const kind of ['backend', 'store', 'controller']) test(`construction ${kind} cannot change before the initial asynchronous read`, async t => {
    const h = model(), foreign = model(), workspace = h.backend.workspace;
    try {
        foreign.backend.workspace = workspace; foreign.window.LocalItabWorkspaces.session = workspace;
        if (kind === 'backend') h.store.backend = foreign.backend;
        else if (kind === 'store') h.controller.store = foreign.store;
        else h.view.controller = foreign.controller;
        await settle(); redraw(h); const own = io(h), other = io(foreign), before = foreign.backend.raw();
        h.view.nextComplete.dispatch('click'); await settle();
        t.diagnostic(JSON.stringify({ label: `first-read ${kind}`, own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert.deepEqual({ own: io(h), foreign: io(foreign) }, { own, foreign: other }); assert.deepEqual(foreign.backend.raw(), before);
    } finally { sourceRestore(h, workspace); h.view.destroy(); foreign.view.destroy(); }
});
const retryChanges = {
    ...changes,
    suspended(h) { h.backend.workspace._suspended = true; },
    invalidated(h) { h.backend.workspace.invalidated = true; },
    next(h) { const next = h.document.createElement('div'); h.view.next.replaceWith(next); h.view.next = next; },
    ancestry(h) { h.view.next.remove(); h.view.list.append(h.view.next); },
    host(h) { h.view.host = h.document.createElement('article'); }
};
for (const mode of ['READ', 'false', 'drop', 'ack']) for (const [name, change] of Object.entries(retryChanges)) test(`exact ${mode} Retry rejects changed original ${name}`, async t => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        failNext(h, mode); h.view.nextComplete.dispatch('click'); await settle(); const original = h.controller.retryCommand; h.backend.mode = null;
        change(h); await zeroIO(t, h, h.view.retry, `exact ${mode} Retry ${name}`); assert.strictEqual(h.controller.retryCommand, original);
    } finally { h.view.destroy(); }
});
for (const mode of ['READ', 'false', 'drop', 'ack']) test(`Retry rejects a clone with the same operation ID: ${mode}`, async t => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        failNext(h, mode); h.view.nextComplete.dispatch('click'); await settle(); const original = h.controller.retryCommand; h.backend.mode = null;
        const clone = { ...original }; h.controller.retryCommand = clone; await zeroIO(t, h, h.view.retry, 'cloned command');
        assert.strictEqual(h.controller.retryCommand, clone); h.controller.retryCommand = original; const counts = io(h);
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.requests, counts.requests);
        assert.equal(h.backend.writes, counts.writes + (mode === 'ack' ? 0 : 1));
    } finally { h.view.destroy(); }
});
const eventCases = {
    double: { detail: 2 }, repeated: { repeat: true }, prevented: { defaultPrevented: true },
    composing: { isComposing: true }, compositionTail: { keyCode: 229 }, foreignTarget: { target: {} }, foreignCurrentTarget: { currentTarget: {} }
};
for (const [name, fields] of Object.entries(eventCases)) for (const retry of [false, true]) test(`${retry ? 'original Retry' : 'current Next up'} rejects ${name} event`, async t => {
    const h = model(); await settle();
    try {
        if (retry) { failNext(h, 'false'); h.view.nextComplete.dispatch('click'); await settle(); h.backend.mode = null; }
        const original = h.controller.retryCommand; await zeroIO(t, h, retry ? h.view.retry : h.view.nextComplete, name, fields); assert.strictEqual(h.controller.retryCommand, original);
    } finally { h.view.destroy(); }
});
for (const key of ['Enter', ' ']) for (const fields of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) for (const retry of [false, true]) test(`${retry ? 'Retry' : 'Next up'} prevents held/composition default ${key} ${JSON.stringify(fields)}`, async () => {
    const h = model(); await settle();
    try {
        if (retry) { failNext(h, 'false'); h.view.nextComplete.dispatch('click'); await settle(); h.backend.mode = null; }
        const action = retry ? h.view.retry : h.view.nextComplete, counts = io(h); assert.equal(action.dispatch('keydown', { key, ...fields }).prevented, true); await settle(); assert.deepEqual(io(h), counts);
    } finally { h.view.destroy(); }
});
const domChanges = {
    actionText(h, a) { a.textContent = 'Reopen'; }, actionChild(h, a) { a.append(h.document.createElement('span')); },
    actionType(h, a) { a.type = 'submit'; }, actionTitle(h, a) { a.title = 'Other task'; }, actionClass(h, a) { a.classList.remove('tasks-next-complete'); },
    actionLabel(h, a) { a.setAttribute('aria-label', 'Complete: Other task'); }, actionDisabled(h, a) { a.disabled = true; },
    actionDisabledAttribute(h, a) { a.setAttribute('disabled', ''); }, actionAriaDisabled(h, a) { a.setAttribute('aria-disabled', 'true'); },
    actionHidden(h, a) { a.hidden = true; }, actionInert(h, a) { a.inert = true; }, actionAriaHidden(h, a) { a.setAttribute('aria-hidden', 'true'); },
    actionDisplay(h, a) { a.style.display = 'none'; }, actionVisibility(h, a) { a.style.visibility = 'hidden'; },
    text(h) { h.view.next.querySelector('.tasks-next-text').textContent = 'Next up: Other task'; },
    textChild(h) { h.view.next.querySelector('.tasks-next-text').append(h.document.createElement('span')); },
    textHidden(h) { h.view.next.querySelector('.tasks-next-text').hidden = true; },
    textReplacement(h) { const old = h.view.next.querySelector('.tasks-next-text'), replacement = h.document.createElement('span'); replacement.className = old.className; replacement.textContent = old.textContent; old.replaceWith(replacement); },
    actionReplacement(h, a) { const replacement = h.document.createElement('button'); replacement.className = a.className; replacement.textContent = a.textContent; a.replaceWith(replacement); },
    nextHidden(h) { h.view.next.hidden = true; }, nextInert(h) { h.view.next.inert = true; }, nextPinClass(h) { h.view.next.classList.remove('has-pin'); },
    nextReparent(h) { h.view.next.remove(); h.view.list.append(h.view.next); }, nextExtraChild(h) { h.view.next.append(h.document.createElement('span')); },
    hostHidden(h) { h.host.hidden = true; }, hostInert(h) { h.host.inert = true; }, hostDetached(h) { h.host.remove(); },
    documentHidden(h) { h.document.hidden = true; }, documentVisibility(h) { h.document.visibilityState = 'hidden'; },
    workspaceSuspended(h) { h.backend.workspace._suspended = true; }, workspaceInvalidated(h) { h.backend.workspace.invalidated = true; },
    departing(h) { h.window.LocalItabContentLifecycle.departing = true; }
};
for (const [name, change] of Object.entries(domChanges)) test(`changed original Next up ${name} rejects before request creation`, async t => {
    const h = model(); await settle();
    try { const action = h.view.nextComplete; change(h, action); await zeroIO(t, h, action, name); }
    finally { h.view.destroy(); }
});
const lateChanges = {
    ...domChanges,
    ...changes,
    sourceBackend(h) { h.store.backend = { ...h.backend }; },
    sourceStore(h) { h.controller.store = new tasks.Store(h.backend); },
    sourceController(h) { h.view.controller = { ...h.controller }; },
    sourceLifecycle(h) { h.view.next.replaceChildren(); redraw(h); },
    savedText(h) { h.controller.state = clone(h.controller.state); h.controller.state.records[5].text = 'Changed during layout'; },
    savedVersion(h) { h.controller.state = clone(h.controller.state); h.controller.state.records[5].version = 'version_changed'; },
    savedState(h) { h.controller.state = clone(h.controller.state); h.controller.state.records[5].state = 'done'; },
    savedPin(h) { h.controller.state = clone(h.controller.state); h.controller.state.pinnedId = 'task_0004'; }
};
for (const [name, change] of Object.entries(lateChanges)) test(`final layout observation is followed by current ${name} verification`, async t => {
    const h = model(); await settle(); const workspace = h.backend.workspace;
    try {
        const action = h.view.nextComplete, original = h.window.getComputedStyle; let roots = 0, fired = false;
        h.window.getComputedStyle = node => {
            const value = original(node);
            if (node === h.document.documentElement && ++roots === 2) { fired = true; change(h, action); }
            return value;
        };
        const before = io(h); action.dispatch('click'); await settle();
        assert.equal(fired, true, 'the final modeled layout getter must actually run');
        t.diagnostic(JSON.stringify({ label: `final-layout ${name}`, fired, delta: delta(before, io(h)) })); assert.deepEqual(io(h), before);
    } finally { sourceRestore(h, workspace); h.view.destroy(); }
});
test('actual open editor makes new background Next up inert and preserves all original state', async t => {
    const h = model(); await settle();
    try {
        h.view.edit(record(h, 'task_0002')); const editor = h.document.querySelector('.tasks-editor'); input(editor, 'Current editor draft'); editor.focus();
        assert.equal(h.host.inert, true); const state = h.controller.state, status = h.controller.status, error = h.controller.error, retry = h.controller.retryCommand, undo = h.view.undo;
        await zeroIO(t, h, h.view.nextComplete, 'actual editor inert background');
        assert.strictEqual(h.controller.state, state); assert.equal(h.controller.status, status); assert.strictEqual(h.controller.error, error);
        assert.strictEqual(h.controller.retryCommand, retry); assert.strictEqual(h.view.undo, undo); assert.equal(editor.value, 'Current editor draft'); assert.equal(h.document.activeElement, editor);
    } finally { h.view.destroy(); }
});
test('independent quick-entry and filter composition do not invalidate unchanged Next up', async () => {
    const h = model(); await settle();
    try {
        const action = h.view.nextComplete; input(h.view.input, '独立中文草稿'); h.view.input.focus(); h.view.input.dispatch('compositionstart');
        h.view.filterInput.dispatch('compositionstart'); input(h.view.filterInput, 'Uncommitted filter');
        assert.strictEqual(h.view.nextComplete, action); action.dispatch('click'); await settle();
        assert.equal(record(h).state, 'done'); assert.equal(h.view.input.value, '独立中文草稿'); assert.equal(h.view.quickEntryComposing, true);
        assert.equal(h.view.filterInput.value, 'Uncommitted filter'); assert.equal(h.view.filterComposing, true); assert.equal(h.document.activeElement, h.view.input);
    } finally { h.view.destroy(); }
});
test('pin lifecycle retires old whole subtree even after visible nodes and mutable references are restored', async t => {
    const h = model(); await settle();
    try {
        const oldAction = h.view.nextComplete, oldText = h.view.next.querySelector('.tasks-next-text'), oldTask = h.view.nextTask;
        await h.remote.mutate(command(h.remote, 'pin', record(h, 'task_0004'), { expectedPin: 'task_0005' })); await settle();
        await h.remote.mutate(command(h.remote, 'pin', record(h), { expectedPin: 'task_0004' })); await settle();
        assert.notStrictEqual(h.view.nextComplete, oldAction); assert.equal(record(h).version, oldTask.version);
        h.view.next.replaceChildren(oldText, oldAction); h.view.nextComplete = oldAction; h.view.nextTask = oldTask;
        await zeroIO(t, h, oldAction, 'old pin lifecycle restored nodes');
    } finally { h.view.destroy(); }
});
test('visible current request still lets the locked expectedPin CAS reject an unobserved queued repin', async () => {
    const h = model(); await settle(); h.backend.notifications = false; const gate = deferred();
    try {
        const held = h.backend.lock(() => gate.promise);
        const remote = h.remote.mutate(command(h.remote, 'pin', record(h, 'task_0004'), { expectedPin: 'task_0005' }));
        h.view.nextComplete.dispatch('click'); assert.ok(h.controller.pending); gate.resolve(); await held; await remote; await settle();
        assert.equal(h.controller.error.code, 'CONFLICT'); assert.equal(record(h).state, 'active'); assert.equal(h.backend.raw().pinnedId, 'task_0004');
        assert.equal(h.backend.writes, 1, 'only the remote pin wrote'); assert.equal(h.controller.retryCommand.expectedPin, 'task_0005');
    } finally { gate.resolve(); h.view.destroy(); }
});

test('a genuine unrelated row CAS conflict renews Next up once and keeps the new choice through saving', async t => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        h.view.more.dispatch('click'); const old = h.view.nextComplete;
        const item = h.view.list.querySelectorAll('[data-task-id]').find(row => row.dataset.taskId === 'task_0006');
        item.querySelector('.tasks-row-menu').open = true;
        const move = item.querySelectorAll('button').find(button => button.textContent === 'Move to list start'); assert.ok(move);
        await h.remote.mutate(command(h.remote, 'edit', record(h, 'task_0006'), { text: 'Remote edit causes genuine stale-version conflict' }));
        const before = h.backend.raw(), writes = h.backend.writes; move.dispatch('click'); await settle();
        assert.equal(h.controller.error.code, 'CONFLICT'); assert.equal(h.controller.retryCommand.kind, 'moveFirst');
        assert.equal(h.backend.writes, writes); assert.deepEqual(h.backend.raw(), before);
        const current = h.view.nextComplete; assert.notStrictEqual(current, old, 'a new real conflict creates a deliberate current choice');
        await zeroIO(t, h, old, 'retired pre-conflict Next up');
        input(h.view.filterInput, 'Synthetic task'); assert.strictEqual(h.view.nextComplete, current, 'ordinary filter remains stable after review');
        await h.remote.mutate(command(h.remote, 'edit', record(h, 'task_0002'), { text: 'Unrelated after conflict' })); await h.controller.refresh();
        assert.strictEqual(h.view.nextComplete, current, 'same conflict identity does not renew again');
        current.focus(); const gate = deferred(); h.backend.delay = gate.promise; current.dispatch('click'); await tick();
        assert.strictEqual(h.view.nextComplete, current, 'clearing old conflict for saving preserves the original focus lease'); assert.ok(h.controller.pending);
        gate.resolve(); h.backend.delay = null; await settle();
        assert.equal(record(h).state, 'done'); assert.equal(h.controller.status, 'saved'); assert.equal(h.document.activeElement, h.view.input);
    } finally { h.view.destroy(); }
});
