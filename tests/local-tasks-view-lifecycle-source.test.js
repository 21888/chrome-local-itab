const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');
const tasks = require('../shared/local-tasks-store.js');
const { Controller } = require('../shared/local-tasks-controller.js');
const Workspaces = require('../shared/workspaces.js');
const clone = value => structuredClone(value);
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { await tick(); await tick(); await tick(); }
const NOW = '2026-10-18T05:00:00.000Z';
function initial(label = 'Original', revision = 4) {
    return tasks.validate({ schemaVersion: 1, revision, enabled: true, pinnedId: 'task_0001', receipts: ['receipt_prior'],
        records: ['active', 'active', 'done', 'removed'].map((state, i) => ({ id: `task_000${i}`, version: `version_${i}`,
            text: `${label} ${i} 中文 😀`, state, removedFrom: state === 'removed' ? 'done' : null, createdAt: NOW, updatedAt: NOW })),
        recovery: [{ id: 'recovery_prior', createdAt: NOW, content: { records: [], pinnedId: null } }] });
}
// Independent real Stores and Controllers. Public source substitution below is
// a deliberate boundary probe, not the product's flush/select/navigation switch.
function backend(state = initial(), workspace = { id: 'workspace_original', generation: 'generation_original' }) {
    let raw = clone(state), queue = Promise.resolve(); const listeners = new Set();
    const b = { workspace, reads: 0, writes: 0, requests: 0, unsubscribes: 0, readGate: null, writeGate: null, readError: false, mode: null,
        lock(action) { const next = queue.then(action); queue = next.catch(() => {}); return next; },
        async read() {
            b.reads++; const value = clone(raw), gate = b.readGate, error = b.readError; b.readGate = null; b.readError = false;
            if (gate) { gate.entered.resolve(); await gate.release.promise; } if (error) throw Error('Synthetic storage read failure'); return value;
        },
        async write(value) {
            b.writes++; const gate = b.writeGate, mode = b.mode; b.writeGate = null; b.mode = null;
            if (gate) { gate.entered.resolve(); await gate.release.promise; }
            if (mode === 'false') return false; raw = clone(value); if (mode === 'ack') throw Error('Synthetic lost write acknowledgement');
        },
        subscribe(fn) { listeners.add(fn); return () => { b.unsubscribes++; listeners.delete(fn); }; },
        notify() { for (const fn of [...listeners]) fn(); }, listenerCount: () => listeners.size, raw: () => clone(raw)
    }; return b;
}
function source(b = backend()) {
    let serial = 0; const store = new tasks.Store(b, { id: () => `operation_${++serial}`, now: () => NOW }), request = store.request;
    store.request = function (...args) { b.requests++; return request.apply(this, args); };
    const controller = new Controller(store), subscribe = controller.subscribe, destroy = controller.destroy;
    const subscriptions = [], stats = { viewUnsubscribes: 0, destroys: 0 };
    controller.subscribe = function (fn) { subscriptions.push(fn); const off = subscribe.call(this, fn); return () => { stats.viewUnsubscribes++; return off(); }; };
    controller.destroy = function () { stats.destroys++; return destroy.call(this); };
    return { backend: b, store, controller, subscriptions, stats };
}
function model(options = {}) {
    const h = options.source || source(options.backend), document = createDocument({ blurUnavailableFocus: true, aggregateTextContent: true });
    const host = document.createElement('article'), search = document.createElement('input'); document.body.append(search, host); search.focus();
    const api = { ...tasks, Controller }, window = { LocalItabTasks: api, LocalItabWorkspaces: { session: h.backend.workspace } };
    const context = vm.createContext({ window, document, crypto: webcrypto, setTimeout, URL, Blob, console });
    for (const name of ['dialog-focus.js', 'local-tasks-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared', name), 'utf8'), context);
    const visibility = [], view = api.mount(host, { controller: h.controller, alwaysVisible: options.alwaysVisible ?? true, onVisibility: value => visibility.push(value) });
    return { ...h, document, host, search, window, view, visibility, viewUnsubscribe: view.unsubscribe };
}
async function pair() {
    const h = model(), foreign = model({ backend: backend(initial('Foreign', 60), h.backend.workspace) }); await settle(); return { h, foreign };
}
function dispose(...models) {
    for (const h of models) if (h) {
        if (h.view) { h.view.controller = h.controller; h.view.host = h.host; h.view.unsubscribe = h.viewUnsubscribe; h.view.destroyed = false; h.view.destroy(); }
        h.controller.destroy();
    }
}
const io = h => ({ reads: h.backend.reads, writes: h.backend.writes, requests: h.backend.requests });
const ui = h => ({ revision: h.view.renderedRevision, rows: h.host.querySelectorAll('.tasks-text').map(node => node.textContent),
    status: h.view.status.textContent, error: h.view.feedback.classList.contains('is-error'), retry: h.view.retry.hidden,
    add: h.view.addButton.disabled, draft: h.view.input.value, visibility: h.visibility.length });
const gateAt = (b, stage) => { const gate = { entered: deferred(), release: deferred() }; b[`${stage}Gate`] = gate; return gate; };
const edit = h => h.store.request('edit', { id: 'task_0000', version: 'version_0', text: 'Original exact edited task' });

for (const entry of ['subscription', 'direct']) test(`${entry} cannot publish another complete legal Controller`, async t => {
    const { h, foreign } = await pair();
    try {
        foreign.backend.readError = true; await assert.rejects(foreign.controller.refresh(), { code: 'READ' });
        const before = ui(h), other = io(foreign); h.view.controller = foreign.controller;
        if (entry === 'subscription') { h.backend.notify(); await settle(); } else h.view.render();
        t.diagnostic(JSON.stringify({ entry, originalRevision: before.revision, displayedRevision: h.view.renderedRevision, foreignRevision: foreign.controller.state.revision }));
        assert.deepEqual(ui(h), before); assert.deepEqual(io(foreign), other);
        h.view.controller = h.controller; await h.controller.action('add', { text: 'Original resumed task' }); assert.equal(h.view.renderedRevision, 5);
    } finally { dispose(h, foreign); }
});

for (const outcome of ['success', 'READ']) test(`initial original ${outcome} delivery cannot render a foreign source`, async t => {
    const b = backend(), gate = gateAt(b, 'read'); b.readError = outcome === 'READ'; const h = model({ backend: b });
    const foreign = model({ backend: backend(initial('Foreign', 60), b.workspace) });
    try {
        await gate.entered.promise; await settle(); const before = ui(h); h.view.controller = foreign.controller; gate.release.resolve(); await settle();
        t.diagnostic(JSON.stringify({ outcome, displayedRevision: h.view.renderedRevision ?? null, originalError: h.controller.error?.code || null }));
        assert.deepEqual(ui(h), before); assert.equal(h.controller.error?.code, outcome === 'READ' ? 'READ' : undefined);
        h.view.controller = h.controller; h.view.render(); assert.equal(h.view.feedback.classList.contains('is-error'), outcome === 'READ');
    } finally { gate.release.resolve(); dispose(h, foreign); }
});

const substitutions = {
    store(h, foreign) { h.controller.store = foreign.store; return () => { h.controller.store = h.store; }; },
    backend(h, foreign) { h.store.backend = foreign.backend; return () => { h.store.backend = h.backend; }; },
    workspace(h) { const prior = h.backend.workspace; h.backend.workspace = { ...prior }; return () => { h.backend.workspace = prior; }; },
    workspaceId(h) { const prior = h.backend.workspace.id; h.backend.workspace.id = 'workspace_replaced'; return () => { h.backend.workspace.id = prior; }; },
    workspaceGeneration(h) { const prior = h.backend.workspace.generation; h.backend.workspace.generation = 'generation_replaced'; return () => { h.backend.workspace.generation = prior; }; },
    session(h) { const prior = h.window.LocalItabWorkspaces.session; h.window.LocalItabWorkspaces.session = { ...prior }; return () => { h.window.LocalItabWorkspaces.session = prior; }; },
    host(h) { const replacement = h.document.createElement('article'); h.document.body.append(replacement); h.view.host = replacement; return () => { h.view.host = h.host; }; }
};
for (const [name, substitute] of Object.entries(substitutions)) test(`direct render keeps its construction ${name} identity`, async () => {
    const { h, foreign } = await pair(); let restore;
    try {
        const before = ui(h), own = io(h), other = io(foreign); restore = substitute(h, foreign); h.view.render();
        assert.deepEqual(ui(h), before); assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other);
        restore(); restore = null; h.view.render(); assert.equal(h.visibility.length, before.visibility + 1);
    } finally { restore?.(); dispose(h, foreign); }
});

test('onVisibility source substitution stops subsequent feedback and row publication', async t => {
    const { h, foreign } = await pair();
    try {
        foreign.backend.readError = true; await assert.rejects(foreign.controller.refresh(), { code: 'READ' });
        const before = ui(h); let callbacks = 0;
        h.view.onVisibility = () => { callbacks++; h.view.controller = foreign.controller; };
        await h.controller.action('add', { text: 'Original real next revision' });
        t.diagnostic(JSON.stringify({ callbacks, displayedStatus: h.view.status.textContent, foreignError: foreign.controller.error.code }));
        assert.equal(callbacks, 1); assert.deepEqual(ui(h), before); assert.equal(h.backend.raw().records.length, 5);
    } finally { dispose(h, foreign); }
});

test('onVisibility destruction retires the render before later controls change', async () => {
    const h = model(); await settle();
    try {
        const before = ui(h); let callbacks = 0; h.view.onVisibility = () => { callbacks++; h.view.destroy(); };
        h.view.render(); assert.equal(callbacks, 1); assert.deepEqual(ui(h), before); assert.equal(h.controller.closed, true);
    } finally { dispose(h); }
});

for (const replaceUnsubscribe of [false, true]) test(`destroy owns original Controller and subscription (${replaceUnsubscribe ? 'replaced' : 'original'} public unsubscribe)`, async t => {
    const { h, foreign } = await pair();
    try {
        h.view.controller = foreign.controller; if (replaceUnsubscribe) h.view.unsubscribe = foreign.view.unsubscribe;
        h.view.destroy();
        t.diagnostic(JSON.stringify({ originalClosed: h.controller.closed, foreignClosed: foreign.controller.closed,
            originalBackendListeners: h.backend.listenerCount(), originalViewUnsubscribes: h.stats.viewUnsubscribes, foreignViewUnsubscribes: foreign.stats.viewUnsubscribes }));
        assert.equal(h.controller.closed, true); assert.equal(foreign.controller.closed, false);
        assert.equal(h.stats.viewUnsubscribes, 1); assert.equal(foreign.stats.viewUnsubscribes, 0);
        assert.equal(h.backend.listenerCount(), 0); assert.equal(foreign.backend.listenerCount(), 1);
        assert.equal(h.stats.destroys, 1); assert.equal(foreign.stats.destroys, 0);
        const own = io(h); h.backend.notify(); await foreign.controller.action('add', { text: 'Foreign remains independently live' });
        assert.deepEqual(io(h), own); assert.equal(foreign.controller.state.revision, 61);
    } finally { dispose(h, foreign); }
});

test('private retirement precedes modal callbacks and retained notifications cannot revive it', async t => {
    const h = model(); await settle();
    try {
        const callback = h.subscriptions[0], before = ui(h); let closes = 0, reentered = false;
        const modal = h.view.createDialog('Synthetic close lifecycle', () => {
            closes++; if (reentered) return; reentered = true;
            h.view.destroyed = false; h.view.destroy(); callback(); h.view.render();
        }); modal.open(); h.view.destroy();
        h.view.destroyed = false; callback(); h.view.render(); h.view.destroy();
        t.diagnostic(JSON.stringify({ closes, destroys: h.stats.destroys, viewUnsubscribes: h.stats.viewUnsubscribes, visibility: h.visibility.length }));
        assert.equal(closes, 1); assert.equal(h.stats.destroys, 1); assert.equal(h.stats.viewUnsubscribes, 1);
        assert.deepEqual(ui(h), before); assert.equal(h.backend.listenerCount(), 0); assert.equal(h.view.dialogs.size, 0);
    } finally { dispose(h); }
});

for (const loaded of [false, true]) test(`same-source real READ error remains visible ${loaded ? 'after ready' : 'on initial load'}`, async () => {
    const b = backend(); if (!loaded) b.readError = true; const h = model({ backend: b, alwaysVisible: false }); await settle();
    try {
        if (loaded) { b.readError = true; await assert.rejects(h.controller.refresh(), { code: 'READ' }); }
        assert.equal(h.controller.error.code, 'READ'); assert.equal(h.view.feedback.classList.contains('is-error'), true);
        assert.equal(h.view.status.textContent, 'Could not read local tasks. Nothing was replaced. Retry when storage is available.');
        assert.equal(h.view.retry.hidden, false); assert.equal(h.host.hidden, false);
        await h.controller.refresh(); assert.equal(h.view.feedback.classList.contains('is-error'), false); assert.equal(h.view.renderedRevision, 4);
    } finally { dispose(h); }
});

async function sessionModel() {
    const entry = { id: 'workspace_original', generation: 'generation_original', deletedAt: null }; let raw = initial();
    const manager = { chrome: { storage: { onChanged: { addListener() {} } } }, subscribe() {}, async ready() {},
        async registry() { return { lastUsedId: entry.id, workspaces: [clone(entry)] }; },
        locks: { request(name, options, action) { return Promise.resolve().then(action); } },
        async assertRestoreSettled() {}, async readBundle() { return { [tasks.KEY]: clone(raw) }; }, async writeBundle(entry, next) { raw = clone(next[tasks.KEY]); } };
    const session = new Workspaces.Session(manager, entry.id); await session.ready();
    const b = tasks.createChromeBackend(null, null, session); b.requests = 0;
    return { ...model({ source: source(b) }), entry, session, raw: () => clone(raw) };
}
for (const mode of ['suspend', 'invalidate']) test(`same-source real Session ${mode} failure still publishes its error`, async () => {
    const h = await sessionModel(); await settle();
    try {
        const command = edit(h), before = h.raw(); if (mode === 'suspend') h.session.suspendWrites(); else h.entry.generation = 'generation_retired';
        const code = mode === 'suspend' ? 'WORKSPACE_SWITCH_PENDING' : 'WORKSPACE_INVALIDATED';
        await assert.rejects(h.controller.run(command), { code }); assert.equal(h.controller.error.code, code); assert.strictEqual(h.controller.retryCommand, command);
        assert.equal(h.view.feedback.classList.contains('is-error'), true); assert.equal(h.view.status.textContent, 'Could not confirm the save. Your draft is still here. Retry safely.');
        assert.deepEqual(h.raw(), before);
        if (mode === 'suspend') { h.session.resumeWrites(); await h.controller.retry(); assert.equal(h.view.renderedRevision, 5); }
    } finally { dispose(h); }
});

for (const outcome of ['success', 'false', 'ack']) test(`already-issued ${outcome} remains original across a whole-Controller gap`, async t => {
    const { h, foreign } = await pair(); const gate = gateAt(h.backend, 'write');
    try {
        h.backend.mode = outcome === 'success' ? null : outcome; const command = edit(h), pending = h.controller.run(command), observed = pending.catch(error => error);
        await gate.entered.promise; const before = ui(h), other = io(foreign); h.view.controller = foreign.controller; gate.release.resolve(); const result = await observed;
        assert.deepEqual(ui(h), before); assert.deepEqual(io(foreign), other);
        if (outcome === 'success') assert.equal(result.records[0].text, 'Original exact edited task');
        else { assert.equal(result.code, 'WRITE'); assert.strictEqual(h.controller.retryCommand, command); }
        const writes = h.backend.writes; h.view.controller = h.controller; await h.controller.retry();
        assert.equal(h.backend.writes, writes + (outcome === 'false' ? 1 : 0)); assert.equal(h.backend.raw().receipts.filter(id => id === command.operationId).length, 1);
        assert.equal(h.view.renderedRevision, 5); t.diagnostic(JSON.stringify({ outcome, originalWrites: h.backend.writes, foreignWrites: foreign.backend.writes }));
    } finally { gate.release.resolve(); dispose(h, foreign); }
});

for (const outcome of ['success', 'false']) test(`original host detachment preserves dispatched ${outcome} result and rendering`, async () => {
    const h = model(); await settle(); const gate = gateAt(h.backend, 'write');
    try {
        h.backend.mode = outcome === 'success' ? null : outcome; const pending = h.controller.run(edit(h)), observed = pending.catch(error => error);
        await gate.entered.promise; h.host.remove(); gate.release.resolve(); const result = await observed;
        assert.equal(h.view.feedback.classList.contains('is-error'), outcome !== 'success');
        if (outcome === 'success') { assert.equal(result.revision, 5); assert.equal(h.view.renderedRevision, 5); }
        else { assert.equal(result.code, 'WRITE'); assert.equal(h.view.status.textContent, 'Could not confirm the save. Your draft is still here. Retry safely.'); }
    } finally { gate.release.resolve(); dispose(h); }
});

for (const outcome of ['success', 'false']) test(`destroy cannot cancel dispatched original ${outcome} or allow a late render`, async () => {
    const h = model(); await settle(); const gate = gateAt(h.backend, 'write');
    try {
        h.backend.mode = outcome === 'success' ? null : outcome; const pending = h.controller.run(edit(h)), observed = pending.catch(error => error);
        await gate.entered.promise; h.view.destroy(); const before = ui(h); gate.release.resolve(); const result = await observed;
        assert.deepEqual(ui(h), before); assert.equal(h.controller.pending, null);
        if (outcome === 'success') { assert.equal(result.revision, 5); assert.equal(h.backend.raw().revision, 5); }
        else { assert.equal(result.code, 'WRITE'); assert.equal(h.backend.raw().revision, 4); }
    } finally { gate.release.resolve(); dispose(h); }
});

test('a real modal close exception preserves its error and still releases original subscriptions once', async t => {
    const h = model(); await settle();
    try {
        const failure = Error('Synthetic close callback failure'), callback = h.subscriptions[0]; let closes = 0;
        const modal = h.view.createDialog('Synthetic throwing close', () => { closes++; throw failure; }); modal.open();
        assert.throws(() => h.view.destroy(), error => error === failure);
        t.diagnostic(JSON.stringify({ closes, destroys: h.stats.destroys, viewUnsubscribes: h.stats.viewUnsubscribes, backendListeners: h.backend.listenerCount() }));
        assert.equal(closes, 1); assert.equal(h.controller.closed, true); assert.equal(h.backend.listenerCount(), 0);
        assert.equal(h.stats.viewUnsubscribes, 1); assert.equal(h.stats.destroys, 1); assert.equal(h.view.dialogs.size, 0);
        const before = ui(h); h.view.destroyed = false; callback(); h.view.render(); h.view.destroy();
        assert.deepEqual(ui(h), before); assert.equal(h.stats.viewUnsubscribes, 1); assert.equal(h.stats.destroys, 1);
    } finally { dispose(h); }
});
