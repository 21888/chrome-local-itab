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
// These are deliberate mutable-public-field boundary probes, not a model of
// normal workspace navigation. Every Controller result comes from real I/O.
// The synthetic backend captures a fixed target for each lock callback, so
// workspace-field injection cannot reroute that transaction's verification.
function model({ state = initial(), workspace = { id: 'workspace_0001', generation: 'generation_0001' }, prefix = 'original' } = {}) {
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
    const document = createDocument({ blurUnavailableFocus: true }), host = document.createElement('article'), search = document.createElement('input');
    document.body.append(search, host); search.focus();
    const window = { LocalItabTasks: api, LocalItabWorkspaces: { session: workspace }, LocalItabContentLifecycle: { departing: false } };
    const context = vm.createContext({ window, document, crypto: webcrypto, URL, Blob, setTimeout, console });
    for (const file of ['dialog-focus.js', 'local-tasks-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared', file), 'utf8'), context);
    const view = api.mount(host, { controller });
    return { backend, store, remote, controller, document, host, search, window, view };
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
const actions = ['complete', 'completePinned', 'remove-active', 'remove-done', 'completeBatch'];
function ordinary(h, action, id) {
    const item = row(h, id); assert(item);
    item.querySelector('.tasks-row-menu').open = true;
    const control = button(item, action); assert(control?.getClientRects().length, `${action} is visible`); control.dispatch('click');
}
async function createUndo(h, action = 'complete') {
    await settle();
    if (action === 'complete') row(h).querySelector('.tasks-check').dispatch('click');
    else if (action === 'completePinned') h.view.nextComplete.dispatch('click');
    else if (action === 'remove-active') ordinary(h, 'Remove', 'task_0000');
    else if (action === 'remove-done') { h.view.completed.box.open = true; ordinary(h, 'Remove', 'task_0005'); }
    else {
        h.view.completeBatchButton.dispatch('click'); assert(modal(h));
        const checks = modal(h).querySelectorAll('.tasks-complete-checkbox');
        for (const checkbox of checks.slice(0, 2)) { checkbox.checked = true; checkbox.dispatch('change'); }
        modal(h).querySelector('.tasks-complete-review').dispatch('click'); await settle();
        modal(h).querySelector('.tasks-complete-confirm').dispatch('click');
    }
    await settle(); assert(h.view.undo, `real ${action} creates Undo`); assert.equal(h.view.undoButton.hidden, false);
    h.backend.seedNewSources(h.backend.raw()); return h.view.undo;
}
function assertUndone(h, action) {
    if (action === 'completeBatch') assert(h.backend.raw().records.slice(0, 2).every(task => task.state === 'active'));
    else assert.equal(record(h, action === 'completePinned' ? 'task_0001' : action === 'remove-done' ? 'task_0005' : 'task_0000').state,
        action === 'remove-done' ? 'done' : 'active');
}
async function pair(action) {
    const h = model(), undo = await createUndo(h, action), owner = capture(h);
    const foreign = model({ state: h.backend.raw(), workspace: owner.workspace, prefix: 'foreign' }); await settle();
    return { h, undo, owner, foreign };
}
function cleanup(h, owner, foreign) { restore(h, owner); h.view.destroy(); foreign?.view.destroy(); }

for (const action of actions) for (const source of sources) test(`original ${action} Undo refuses ${source} substitution before request and resumes explicitly`, async t => {
    const { h, undo, owner, foreign } = await pair(action);
    try {
        input(h.view.input, 'newer quick draft'); change(h, source, foreign); h.backend.raw();
        const own = io(h), other = io(foreign), ownRaw = h.backend.allRaw(), otherRaw = foreign.backend.allRaw(), ownFeedback = feedback(h), otherFeedback = feedback(foreign);
        h.view.undoButton.dispatch('click'); await settle();
        t.diagnostic(JSON.stringify({ action, source, own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert.deepEqual(io(h), own, 'refused Undo must not construct or dispatch an original command'); assert.deepEqual(io(foreign), other);
        assert.deepEqual(h.backend.allRaw(), ownRaw); assert.deepEqual(foreign.backend.allRaw(), otherRaw); sameFeedback(h, ownFeedback); sameFeedback(foreign, otherFeedback);
        assert.strictEqual(h.view.undo, undo); assert.equal(h.view.input.value, 'newer quick draft');
        restore(h, owner); h.view.render(); const resumed = io(h); h.view.undoButton.dispatch('click'); await settle();
        assertUndone(h, action); assert.equal(h.backend.writes, resumed.writes + 1); assert.equal(h.view.undo, null);
    } finally { cleanup(h, owner, foreign); }
});

for (const source of sources) test(`source change while Undo request returns is refused before dispatch (${source})`, async t => {
    const { h, undo, owner, foreign } = await pair('completeBatch'), request = h.store.request;
    try {
        let observed = 0; h.store.request = (...args) => { const command = request(...args); observed++; change(h, source, foreign); return command; };
        const own = io(h), other = io(foreign), foreignBefore = feedback(foreign);
        h.view.undoButton.dispatch('click'); await settle();
        t.diagnostic(JSON.stringify({ source, observed, own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert.equal(observed, 1); assert.deepEqual(delta(own, io(h)), { requests: 1, reads: 0, writes: 0 }); assert.deepEqual(io(foreign), other);
        sameFeedback(foreign, foreignBefore); assert.strictEqual(h.view.undo, undo); assert.equal(h.controller.pending, null);
        h.store.request = request; restore(h, owner); h.view.render(); h.view.undoButton.dispatch('click'); await settle(); assertUndone(h, 'completeBatch');
    } finally { h.store.request = request; cleanup(h, owner, foreign); }
});

for (const action of actions) for (const mode of ['false', 'drop', 'ack']) test(`same-source ${action} Undo retries exact ${mode} command and receipt without duplication`, async () => {
    const h = model(), owner = capture(h); await createUndo(h, action);
    try {
        h.backend.mode = mode; h.view.undoButton.dispatch('click'); await settle(); const command = h.controller.retryCommand, counts = io(h);
        assert(command); assert.equal(h.controller.error.code, mode === 'drop' ? 'VERIFY' : 'WRITE');
        await h.view.retryLast(); await settle(); assertUndone(h, action); assert.equal(h.backend.requests, counts.requests);
        assert.equal(h.backend.writes, counts.writes + (mode === 'ack' ? 0 : 1)); assert.equal(h.backend.raw().receipts.filter(id => id === command.operationId).length, 1);
        assert.equal(h.controller.retryCommand, null); assert.equal(h.view.undo, null);
    } finally { cleanup(h, owner); }
});

for (const mode of ['false', 'drop', 'ack']) for (const source of sources) test(`exact Undo Retry refuses ${source} substitution after ${mode} and resumes original receipt`, async t => {
    const { h, owner, foreign } = await pair('complete');
    try {
        h.backend.mode = mode; h.view.undoButton.dispatch('click'); await settle(); const command = h.controller.retryCommand;
        assert(command); h.backend.seedNewSources(h.backend.raw()); change(h, source, foreign); h.backend.raw();
        const own = io(h), other = io(foreign), ownFeedback = feedback(h), foreignFeedback = feedback(foreign), ownRaw = h.backend.allRaw(), otherRaw = foreign.backend.allRaw();
        await h.view.retryLast(); await settle();
        t.diagnostic(JSON.stringify({ mode, source, own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); sameFeedback(h, ownFeedback); sameFeedback(foreign, foreignFeedback);
        assert.deepEqual(h.backend.allRaw(), ownRaw); assert.deepEqual(foreign.backend.allRaw(), otherRaw);
        restore(h, owner); h.view.render(); const resumed = io(h); await h.view.retryLast(); await settle(); assertUndone(h, 'complete');
        assert.equal(h.backend.requests, resumed.requests); assert.equal(h.backend.writes, resumed.writes + (mode === 'ack' ? 0 : 1));
        assert.equal(h.backend.raw().receipts.filter(id => id === command.operationId).length, 1); assert.equal(h.view.undo, null);
    } finally { cleanup(h, owner, foreign); }
});

for (const mode of ['success', 'false', 'ack']) for (const source of sources) test(`issued Undo keeps original ${mode} outcome during ${source} gap without late View cleanup`, async t => {
    const { h, undo, owner, foreign } = await pair('complete'), gate = deferred();
    try {
        h.backend.writeGate = gate; if (mode !== 'success') h.backend.mode = mode;
        h.view.undoButton.dispatch('click'); await settle(); const command = h.controller.retryCommand; assert(command); assert(h.controller.pending);
        // A real foreign failure with the very same command is not ours to clear.
        foreign.backend.mode = 'false'; await assert.rejects(foreign.controller.run(command));
        const otherFeedback = feedback(foreign), other = io(foreign), otherRaw = foreign.backend.allRaw();
        change(h, source, foreign); input(h.view.input, 'newer draft while Undo saves');
        gate.resolve(); await settle();
        t.diagnostic(JSON.stringify({ source, mode, originalStatus: h.controller.status, originalError: h.controller.error?.code || null, foreign: delta(other, io(foreign)) }));
        assert.equal(h.controller.status, mode === 'success' ? 'saved' : 'error'); assert.equal(h.controller.error?.code, mode === 'success' ? undefined : 'WRITE');
        assert.strictEqual(h.controller.retryCommand, mode === 'success' ? null : command); sameFeedback(foreign, otherFeedback);
        assert.deepEqual(io(foreign), other); assert.deepEqual(foreign.backend.allRaw(), otherRaw); assert.strictEqual(h.view.undo, undo, 'a source-gap callback may not clear the original Undo slot');
        assert.equal(h.view.input.value, 'newer draft while Undo saves');
        restore(h, owner); const resumed = io(h);
        // Success also needs explicit acknowledgement of the issued attempt,
        // although the Controller has already cleared its normal retry command.
        if (mode === 'success') h.view.undoLast(); else await h.view.retryLast();
        await settle(); assertUndone(h, 'complete'); assert.equal(h.backend.requests, resumed.requests);
        assert.equal(h.backend.writes, resumed.writes + (mode === 'false' ? 1 : 0)); assert.equal(h.backend.raw().receipts.filter(id => id === command.operationId).length, 1);
    } finally { gate.resolve(); cleanup(h, owner, foreign); }
});

for (const action of actions) test(`original ${action} Undo remains revision-free after unrelated edit and pin`, async () => {
    const h = model(), owner = capture(h); await createUndo(h, action);
    try {
        const other = record(h, 'task_0003');
        await h.remote.mutate(h.remote.request('edit', { id: other.id, version: other.version, text: 'unrelated edited task' }));
        const edited = record(h, other.id); await h.remote.mutate(h.remote.request('pin', { id: edited.id, version: edited.version, expectedPin: h.backend.raw().pinnedId }));
        await h.controller.refresh(); await settle(); const before = h.backend.raw(), counts = io(h), requests = [], request = h.store.request;
        h.store.request = (...args) => { const command = request(...args); requests.push(command); return command; };
        h.view.undoButton.dispatch('click'); await settle();
        assertUndone(h, action); assert.equal(h.backend.writes, counts.writes + 1); assert.equal(requests.length, 1);
        assert.equal(Object.hasOwn(requests[0], 'revision'), false); assert.equal(h.backend.raw().pinnedId, other.id);
        assert.deepEqual(record(h, other.id), before.records.find(task => task.id === other.id)); assert.deepEqual(h.backend.raw().recovery, before.recovery);
    } finally { cleanup(h, owner); }
});

for (const action of ['reopen', 'restore']) test(`ordinary row ${action} exact Retry is not gated by a different previous Undo attempt`, async () => {
    const h = model(), owner = capture(h); await createUndo(h, 'complete');
    try {
        h.backend.mode = 'false'; h.view.undoButton.dispatch('click'); await settle(); const undoCommand = h.controller.retryCommand;
        h.controller.dismissRetry(undoCommand.operationId); h.view.render();
        if (action === 'reopen') h.view.completed.box.open = true; else h.view.removed.box.open = true;
        h.backend.mode = 'false';
        const control = action === 'reopen' ? row(h, 'task_0005').querySelector('.tasks-check') : button(row(h, 'task_0006'), 'Restore');
        assert(control?.getClientRects().length); control.dispatch('click'); await settle();
        const rowCommand = h.controller.retryCommand; assert.equal(rowCommand.kind, action); assert.notStrictEqual(rowCommand, undoCommand);
        const counts = io(h); await h.view.retryLast(); await settle(); assert.equal(h.controller.error, null); assert.equal(h.backend.requests, counts.requests);
        assert.equal(h.backend.writes, counts.writes + 1); assert.equal(record(h, action === 'reopen' ? 'task_0005' : 'task_0006').state, action === 'reopen' ? 'active' : 'done');
    } finally { cleanup(h, owner); }
});

test('batch Undo preserves all-or-none member CAS without adding a revision fence', async () => {
    const h = model(), owner = capture(h); await createUndo(h, 'completeBatch');
    try {
        const member = record(h, 'task_0001'); await h.remote.mutate(h.remote.request('edit', { id: member.id, version: member.version, text: 'remotely changed member' }));
        const before = h.backend.raw(), counts = io(h); h.view.undoButton.dispatch('click'); await settle();
        assert.equal(h.backend.writes, counts.writes); assert.deepEqual(h.backend.raw(), before); assert.equal(h.controller.error.code, 'CONFLICT');
    } finally { cleanup(h, owner); }
});

for (const mode of ['success', 'false', 'ack']) test(`original host detachment never cancels issued Undo ${mode}`, async () => {
    const h = model(), owner = capture(h); await createUndo(h, 'complete'); const gate = deferred();
    try {
        h.backend.writeGate = gate; if (mode !== 'success') h.backend.mode = mode;
        h.view.undoButton.dispatch('click'); await settle(); const command = h.controller.retryCommand; assert(h.controller.pending);
        h.host.remove(); gate.resolve(); await settle();
        assert.equal(h.controller.status, mode === 'success' ? 'saved' : 'error');
        if (mode !== 'success') { const counts = io(h); await h.view.retryLast(); await settle(); assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + (mode === 'false' ? 1 : 0)); }
        assertUndone(h, 'complete'); assert.equal(h.backend.raw().receipts.filter(id => id === command.operationId).length, 1); assert.equal(h.view.undo, null);
    } finally { gate.resolve(); cleanup(h, owner); }
});

test('newer real Remove Undo created in final notification survives older Undo continuation', async () => {
    const h = model(), owner = capture(h); await createUndo(h, 'complete');
    try {
        const off = h.controller.subscribe(() => {
            if (h.controller.status !== 'saved' || h.controller.pending) return;
            off(); const other = record(h, 'task_0003'); h.view.perform(h.store.request('remove', { id: other.id, version: other.version }));
        });
        h.view.undoButton.dispatch('click'); await settle();
        assert.equal(h.view.undo.id, 'task_0003'); assert.equal(h.view.undo.state, 'removed');
        h.view.undoButton.dispatch('click'); await settle(); assert.equal(record(h, 'task_0003').state, 'active'); assert.equal(h.view.undo, null);
    } finally { cleanup(h, owner); }
});

for (const gap of [false, true]) test(`saved Undo attempt never replaces genuine READ Retry (source gap=${gap})`, async () => {
    const { h, undo, owner, foreign } = await pair('complete'), gate = deferred();
    try {
        h.backend.writeGate = gate; h.view.undoButton.dispatch('click'); await settle();
        change(h, 'controller', foreign); gate.resolve(); await settle(); assert.equal(h.controller.status, 'saved'); assert.strictEqual(h.view.undo, undo);
        h.backend.nextReadFails = true; await assert.rejects(h.controller.refresh()); assert.equal(h.controller.error.code, 'READ'); assert.equal(h.controller.retryCommand, null);
        const ownFeedback = feedback(h), otherFeedback = feedback(foreign), own = io(h), other = io(foreign);
        if (gap) {
            await h.view.retryLast(); await settle(); assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); sameFeedback(h, ownFeedback); sameFeedback(foreign, otherFeedback);
        }
        restore(h, owner); h.view.render(); const counts = io(h), originalRun = h.controller.run.bind(h.controller); let runs = 0;
        h.controller.run = command => { runs++; return originalRun(command); };
        await h.view.retryLast(); await settle();
        assert.equal(runs, 0, 'READ Retry must refresh, not run the previously saved Undo command');
        assert.equal(h.controller.status, 'ready'); assert.equal(h.controller.error, null); assert.equal(h.controller.retryCommand, null);
        assert.deepEqual(delta(counts, io(h)), { requests: 0, reads: 1, writes: 0 }); assert.strictEqual(h.view.undo, undo);
        h.view.undoLast(); await settle(); assert.equal(h.view.undo, null); assert.equal(h.backend.writes, counts.writes);
    } finally { gate.resolve(); cleanup(h, owner, foreign); }
});

for (const backgroundReadFailure of [false, true]) test(`failed Undo attempt cannot replace newer real add Retry (background READ=${backgroundReadFailure})`, async () => {
    const h = model(), owner = capture(h), undo = await createUndo(h, 'complete');
    try {
        h.backend.mode = 'false'; h.view.undoButton.dispatch('click'); await settle(); const failedUndo = h.controller.retryCommand;
        h.controller.dismissRetry(failedUndo.operationId); h.backend.mode = 'false'; input(h.view.input, 'newer exact add draft'); h.view.add(); await settle();
        const add = h.controller.retryCommand; assert.equal(add.kind, 'add'); assert.notStrictEqual(add, failedUndo);
        if (backgroundReadFailure) { h.backend.nextReadFails = true; await assert.rejects(h.controller.refresh()); assert.equal(h.controller.error.code, 'READ'); }
        const counts = io(h); await h.view.retryLast(); await settle();
        assert.equal(h.controller.error, null); assert.equal(h.controller.retryCommand, null); assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + 1);
        assert.equal(h.backend.raw().receipts.at(-1), add.operationId); assert.equal(h.backend.raw().records.at(-1).text, 'newer exact add draft');
        assert.equal(record(h).state, 'done'); assert.strictEqual(h.view.undo, undo); assert.equal(h.view.input.value, '');
    } finally { cleanup(h, owner); }
});
