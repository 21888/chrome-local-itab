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
function initial(label = 'Original') {
    const records = ['active', 'active', 'done', 'removed'].map((state, i) => ({ id: `task_000${i}`, version: `version_${i}`,
        text: i < 2 ? `${label} duplicate 中文 😀\n exact ` : `${label} task ${i}`, state, removedFrom: state === 'removed' ? 'done' : null,
        createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' }));
    return tasks.validate({ schemaVersion: 1, revision: 4, enabled: true, pinnedId: records[1].id, records, receipts: ['prior_operation'],
        recovery: [{ id: 'recovery_1', createdAt: '2026-10-03T00:00:00.000Z', content: { records: records.map(record => ({ ...record, text: `Recovered ${record.text}` })), pinnedId: records[0].id } },
            { id: 'recovery_2', createdAt: '2026-10-04T00:00:00.000Z', content: { records: [], pinnedId: null } }] });
}
// The only source changes in this suite are deliberate boundary probes. Normal
// workspace switching flushes/suspends/navigates; it does not hot-swap this View.
// All errors, states, retries and receipts below come from real Store/Controller.
function model({ state = initial(), workspace = { id: 'workspace_0001', generation: 'generation_0001' } } = {}) {
    let raw = clone(state), queue = Promise.resolve(), identity = 0;
    const listeners = new Set(), calls = { requests: 0, reads: 0, writes: 0 }, runs = [], dismissals = [];
    const backend = { workspace, mode: null, readGate: null, writeGate: null,
        lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() { calls.reads++; const snapshot = clone(raw), gate = backend.readGate; backend.readGate = null; if (gate) await gate.promise; return snapshot; },
        async write(value) {
            calls.writes++; const mode = backend.mode, gate = backend.writeGate; backend.mode = null; backend.writeGate = null;
            if (gate) await gate.promise;
            if (mode === 'false') return false;
            raw = clone(value); if (mode === 'ack') throw Error('Synthetic acknowledgement failure');
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, raw: () => clone(raw)
    };
    const store = new tasks.Store(backend, { id: () => `operation_${++identity}`, now: () => '2026-10-18T04:00:00.000Z' });
    const request = store.request.bind(store); store.request = (...args) => { calls.requests++; return request(...args); };
    const controller = new Controller(store), run = controller.run.bind(controller), dismiss = controller.dismissRetry.bind(controller);
    controller.run = command => { runs.push(command); return run(command); };
    controller.dismissRetry = operationId => { dismissals.push(operationId); return dismiss(operationId); };
    const document = createDocument({ blurUnavailableFocus: true }), host = document.createElement('article'), search = document.createElement('input');
    document.body.append(search, host); search.focus();
    const api = { ...tasks, Controller }, window = { LocalItabTasks: api, LocalItabWorkspaces: { session: workspace } };
    const context = vm.createContext({ window, document, crypto: webcrypto, URL, Blob, setTimeout, console });
    for (const name of ['dialog-focus.js', 'local-tasks-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared', name), 'utf8'), context);
    const view = api.mount(host, { controller, alwaysVisible: true });
    return { backend, store, controller, document, host, search, window, view, calls, runs, dismissals };
}
const modal = h => h.document.querySelector('.tasks-dialog');
const button = (parent, label) => parent?.querySelectorAll('button').find(node => node.textContent === label);
const confirm = h => button(modal(h), 'Replace tasks');
const cancel = h => button(modal(h), 'Cancel');
const io = h => ({ ...h.calls });
const delta = (before, after) => Object.fromEntries(Object.keys(before).map(key => [key, after[key] - before[key]]));
function dispose(...models) { for (const h of models) if (h) { h.view.controller = h.controller; h.view.destroy(); } }
async function incoming() {
    const state = initial('Imported'); state.recovery = [];
    return new tasks.Store({ lock: fn => Promise.resolve().then(fn), read: async () => clone(state) }).export();
}
async function open(h, route) {
    if (route === 'import') {
        const source = await incoming(); h.view.fileInput.files = [{ size: source.length, text: async () => source }]; await h.view.importFile();
        return JSON.parse(source).content;
    }
    const copy = h.backend.raw().recovery[0]; await h.view.reviewRecovery(copy.id); return copy.content;
}
function activate(h) { const action = confirm(h); assert(action); action.focus(); action.dispatch('click'); return action; }
async function failForeign(h) {
    h.backend.mode = 'false'; const command = h.store.request('add', { text: 'Independent foreign retry' });
    await assert.rejects(h.controller.run(command), { code: 'WRITE' }); return command;
}
const withoutVersion = ({ version, ...record }) => record;
function assertReplacement(before, after, target, route) {
    assert.deepEqual(after.records.map(withoutVersion), target.records.map(withoutVersion));
    assert(after.records.every((record, i) => record.version !== target.records[i].version));
    assert.equal(after.pinnedId, target.pinnedId); assert.equal(after.enabled, before.enabled);
    assert.deepEqual(after.recovery.slice(0, -1), route === 'import' ? before.recovery : before.recovery.slice(1));
    assert.deepEqual(after.recovery.at(-1).content, { records: before.records, pinnedId: before.pinnedId });
}

for (const route of ['import', 'recover']) for (const outcome of ['success', 'false', 'ack']) test(`original ${route} ${outcome} keeps replacement, recovery and exact receipt semantics`, async t => {
    const h = model(); await settle();
    try {
        const before = h.backend.raw(), target = await open(h, route); h.view.input.value = 'Independent quick draft';
        const counts = io(h); h.backend.mode = outcome === 'success' ? null : outcome; activate(h); await settle();
        const command = h.runs.at(-1); assert.equal(command.kind, route === 'import' ? 'replace' : 'recover');
        if (outcome !== 'success') {
            assert.equal(h.controller.error.code, 'WRITE'); assert.strictEqual(h.controller.retryCommand, command);
            assert(modal(h)); assert.equal(h.document.activeElement, cancel(h));
            if (outcome === 'false') assert.deepEqual(h.backend.raw(), before);
            else assertReplacement(before, h.backend.raw(), target, route);
            activate(h); await settle(); assert.strictEqual(h.runs.at(-1), command);
        }
        assert.ok(modal(h) === null, 'owned success closes its review'); assertReplacement(before, h.backend.raw(), target, route);
        assert.equal(h.calls.requests, counts.requests + 1); assert.equal(h.calls.writes, counts.writes + (outcome === 'false' ? 2 : 1));
        assert.equal(h.backend.raw().receipts.filter(id => id === command.operationId).length, 1);
        assert.equal(h.controller.status, 'saved'); assert.equal(h.controller.error, null); assert.equal(h.view.input.value, 'Independent quick draft');
        t.diagnostic(JSON.stringify({ route, outcome, io: delta(counts, io(h)), receipt: command.operationId }));
    } finally { dispose(h); }
});

for (const route of ['import', 'recover']) test(`RED: ${route} confirmation cannot adopt another complete legal Controller`, async t => {
    const h = model(), foreign = model({ state: initial('Foreign'), workspace: h.backend.workspace }); await settle();
    try {
        await open(h, route); const panel = modal(h), before = h.backend.raw(), foreignBefore = foreign.backend.raw(); h.view.controller = foreign.controller;
        const own = io(h), other = io(foreign); activate(h); await settle();
        t.diagnostic(JSON.stringify({ route, own: delta(own, io(h)), foreign: delta(other, io(foreign)), reviewOpen: modal(h) === panel }));
        assert.deepEqual({ own: io(h), foreign: io(foreign) }, { own, foreign: other }, 'reject before request or storage I/O');
        assert.deepEqual(h.backend.raw(), before); assert.deepEqual(foreign.backend.raw(), foreignBefore); assert.ok(modal(h) === panel, 'the original review remains open');
        h.view.controller = h.controller; activate(h); await settle(); assert.ok(modal(h) === null);
    } finally { dispose(h, foreign); }
});

test('RED: delayed file.text cannot acquire a foreign Store review', async t => {
    const h = model(), foreign = model({ state: initial('Foreign'), workspace: h.backend.workspace }); await settle();
    try {
        const source = await incoming(), gate = deferred(); h.view.fileInput.files = [{ size: source.length, text: () => gate.promise }];
        const loading = h.view.importFile(), own = io(h), other = io(foreign); h.view.controller = foreign.controller; gate.resolve(source); await loading;
        t.diagnostic(JSON.stringify({ phase: 'file.text', own: delta(own, io(h)), foreign: delta(other, io(foreign)), opened: !!modal(h) }));
        assert.deepEqual({ own: io(h), foreign: io(foreign) }, { own, foreign: other }); assert.ok(modal(h) === null); assert.equal(h.view.pendingReview, false);
    } finally { dispose(h, foreign); }
});
for (const route of ['import', 'recover']) test(`RED: late ${route} read cannot publish its preview under a foreign Controller`, async t => {
    const h = model(), foreign = model({ state: initial('Foreign'), workspace: h.backend.workspace }); await settle();
    try {
        const gate = deferred(); h.backend.readGate = gate; const loading = open(h, route); await settle();
        const own = io(h), other = io(foreign); h.view.controller = foreign.controller; gate.resolve(); await loading;
        t.diagnostic(JSON.stringify({ route, phase: 'read', own: delta(own, io(h)), foreign: delta(other, io(foreign)), opened: !!modal(h) }));
        assert.ok(modal(h) === null, 'late original read must not become a foreign-source review');
        assert.deepEqual({ own: io(h), foreign: io(foreign) }, { own, foreign: other }); assert.equal(h.view.pendingReview, false);
    } finally { dispose(h, foreign); }
});

for (const route of ['import', 'recover']) test(`RED: ${route} Cancel dismisses only its original real failed operation`, async t => {
    const h = model(), foreign = model({ workspace: h.backend.workspace }); await settle();
    try {
        await open(h, route); h.backend.mode = 'false'; activate(h); await settle(); const original = h.controller.retryCommand;
        assert.equal(h.controller.error.code, 'WRITE'); const otherCommand = await failForeign(foreign); assert.equal(original.operationId, otherCommand.operationId);
        const own = io(h), other = io(foreign); h.view.controller = foreign.controller; cancel(h).dispatch('click'); await settle();
        t.diagnostic(JSON.stringify({ route, originalRetryRetained: h.controller.retryCommand === original, foreignRetryRetained: foreign.controller.retryCommand === otherCommand }));
        assert.equal(h.controller.retryCommand, null); assert.strictEqual(foreign.controller.retryCommand, otherCommand); assert.equal(foreign.controller.error.code, 'WRITE');
        assert.deepEqual({ own: io(h), foreign: io(foreign) }, { own, foreign: other });
    } finally { dispose(h, foreign); }
});
for (const route of ['import', 'recover']) test(`RED: cancelled late ${route} failure dismisses its original retry and preserves equal-ID foreign failure`, async t => {
    const h = model(), foreign = model({ workspace: h.backend.workspace }); await settle();
    try {
        await open(h, route); const otherCommand = await failForeign(foreign), gate = deferred(); h.backend.mode = 'false'; h.backend.writeGate = gate;
        activate(h); await settle(); const original = h.controller.retryCommand; assert.equal(original.operationId, otherCommand.operationId); assert(h.controller.pending);
        cancel(h).dispatch('click'); h.view.controller = foreign.controller; const other = io(foreign); gate.resolve(); await settle();
        t.diagnostic(JSON.stringify({ route, originalRetryRetained: h.controller.retryCommand === original, foreignRetryRetained: foreign.controller.retryCommand === otherCommand }));
        assert.equal(h.controller.retryCommand, null); assert.strictEqual(foreign.controller.retryCommand, otherCommand); assert.equal(foreign.controller.error.code, 'WRITE');
        assert.deepEqual(io(foreign), other); assert.ok(modal(h) === null);
    } finally { dispose(h, foreign); }
});
for (const route of ['import', 'recover']) test(`RED: admitted ${route} success remains original and cannot close a review under a foreign source`, async t => {
    const h = model(), foreign = model({ workspace: h.backend.workspace }); await settle();
    try {
        const before = h.backend.raw(), target = await open(h, route), panel = modal(h), gate = deferred(); h.backend.writeGate = gate; activate(h); await settle();
        const command = h.controller.retryCommand, other = io(foreign); assert(h.controller.pending); h.view.controller = foreign.controller; gate.resolve(); await settle();
        t.diagnostic(JSON.stringify({ route, reviewOpen: modal(h) === panel, foreign: delta(other, io(foreign)) }));
        assertReplacement(before, h.backend.raw(), target, route); assert.deepEqual(io(foreign), other); assert.ok(modal(h) === panel, 'the original review remains open');
        h.view.controller = h.controller; const counts = io(h); activate(h); await settle();
        assert.ok(modal(h) === null); assert.strictEqual(h.runs.at(-1), command); assert.equal(h.calls.requests, counts.requests); assert.equal(h.calls.writes, counts.writes);
    } finally { dispose(h, foreign); }
});

for (const route of ['import', 'recover']) for (const lost of ['moved', 'hidden', 'inert']) test(`RED: ${route} ${lost} confirmation has no request or storage authority`, async t => {
    const h = model(); await settle();
    try {
        await open(h, route); const panel = modal(h), action = confirm(h), before = h.backend.raw();
        if (lost === 'moved') { action.remove(); h.document.body.append(action); }
        else if (lost === 'hidden') action.hidden = true;
        else action.parentElement.inert = true;
        const counts = io(h); action.dispatch('click'); await settle();
        t.diagnostic(JSON.stringify({ route, lost, io: delta(counts, io(h)), reviewOpen: modal(h) === panel }));
        assert.deepEqual(io(h), counts); assert.deepEqual(h.backend.raw(), before); assert.ok(modal(h) === panel, 'the original review remains open');
    } finally { dispose(h); }
});
for (const route of ['import', 'recover']) test(`RED: ${route} focus transfer cannot redirect dispatch to another legal Controller`, async t => {
    const h = model(), foreign = model({ workspace: h.backend.workspace }); await settle();
    try {
        await open(h, route); const panel = modal(h), action = confirm(h), cancelAction = cancel(h), focus = cancelAction.focus.bind(cancelAction);
        cancelAction.focus = () => { focus(); h.view.controller = foreign.controller; };
        const own = io(h), other = io(foreign), before = h.backend.raw(), foreignBefore = foreign.backend.raw(); action.focus(); action.dispatch('click'); await settle();
        t.diagnostic(JSON.stringify({ route, phase: 'focus transfer', own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert.equal(h.calls.writes, own.writes); assert.deepEqual(io(foreign), other); assert.deepEqual(h.backend.raw(), before); assert.deepEqual(foreign.backend.raw(), foreignBefore);
        assert.ok(modal(h) === panel, 'the original review remains open');
    } finally { dispose(h, foreign); }
});

for (const route of ['import', 'recover']) for (const phase of ['background', 'departing']) test(`${route} ${phase} confirmation has no request or storage authority`, async () => {
    const h = model(); await settle();
    try {
        await open(h, route); const panel = modal(h), action = confirm(h), before = h.backend.raw(), counts = io(h);
        if (phase === 'background') { h.document.hidden = true; h.document.visibilityState = 'hidden'; }
        else h.window.LocalItabContentLifecycle = { departing: true };
        action.dispatch('click'); await settle(); assert.deepEqual(io(h), counts); assert.deepEqual(h.backend.raw(), before); assert.ok(modal(h) === panel);
        h.document.hidden = false; h.document.visibilityState = 'visible'; h.window.LocalItabContentLifecycle = { departing: false };
        activate(h); await settle(); assert.ok(modal(h) === null, 'the original visible review becomes usable again');
    } finally { dispose(h); }
});

for (const route of ['import', 'recover']) test(`RED: cancelling an unconfirmed ${route} review cannot dismiss an unrelated real READ failure`, async t => {
    const h = model(); await settle();
    try {
        await open(h, route); const read = h.backend.read.bind(h.backend);
        h.backend.read = async (...args) => { await read(...args); throw Error('Synthetic independent refresh failure'); };
        await assert.rejects(h.controller.refresh(), { code: 'READ' }); h.backend.read = read;
        assert.equal(h.controller.retryCommand, null); const error = h.controller.error, status = h.controller.status, state = h.controller.state, counts = io(h);
        assert.equal(error.code, 'READ'); assert.equal(status, 'error'); assert.equal(h.runs.length, 0);
        cancel(h).dispatch('click'); await settle();
        t.diagnostic(JSON.stringify({ route, errorCode: h.controller.error?.code || null, status: h.controller.status, dismissals: h.dismissals.length }));
        assert.strictEqual(h.controller.error, error, 'an unconfirmed review owns no operation to dismiss'); assert.equal(h.controller.status, status);
        assert.strictEqual(h.controller.state, state); assert.equal(h.controller.retryCommand, null); assert.deepEqual(io(h), counts); assert.ok(modal(h) === null);
    } finally { dispose(h); }
});
