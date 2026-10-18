const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');
const scratchpad = require('../shared/local-scratchpad-store.js');
const { Controller } = require('../shared/local-scratchpad-controller.js');
const Workspaces = require('../shared/workspaces.js');
const clone = value => structuredClone(value);
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { await tick(); await tick(); await tick(); }
const EXACT = '\uFEFF \tOriginal 中文 😀\r\n<script>literal</script>\rfinal\n\n';
const DRAFT = ' \tOwned unsaved 中文 🪷\r\n<draft>\r\n';
const initial = (content = EXACT, enabled = true, revision = 4) => scratchpad.validate({ schemaVersion: 1, revision, enabled, content });
// Public source substitutions are deliberate lifecycle fault injection. They
// are not the normal workspace flush/select/navigation path or data-loss proof.
function backend(state = initial(), workspace = { id: 'workspace_original', generation: 'generation_original' }) {
    let raw = clone(state), queue = Promise.resolve(); const listeners = new Set();
    const b = { workspace, reads: 0, writes: 0, mutations: 0, unsubscribes: 0, readGate: null, writeGate: null, readError: false, writeMode: null,
        lock(action) { const pending = queue.then(action); queue = pending.catch(() => {}); return pending; },
        async read() {
            b.reads++; const value = clone(raw), gate = b.readGate, error = b.readError; b.readGate = null; b.readError = false;
            if (gate) { gate.entered.resolve(); await gate.release.promise; } if (error) throw Error('Synthetic read failure'); return value;
        },
        async write(value) {
            b.writes++; const gate = b.writeGate, mode = b.writeMode; b.writeGate = null; b.writeMode = null;
            if (gate) { gate.entered.resolve(); await gate.release.promise; }
            if (mode === 'reject') throw Error('Synthetic write rejection');
            raw = clone(value); b.notify(); if (mode === 'ack') throw Error('Synthetic lost acknowledgement');
        },
        subscribe(fn) { listeners.add(fn); return () => { b.unsubscribes++; listeners.delete(fn); }; },
        notify() { for (const fn of [...listeners]) fn(); }, listenerCount: () => listeners.size, raw: () => clone(raw)
    }; return b;
}
function source(b = backend()) {
    const store = new scratchpad.Store(b), mutate = store.mutate;
    store.mutate = function (...args) { b.mutations++; return mutate.apply(this, args); };
    const controller = new Controller(store, { delay: 60000 }), subscribe = controller.subscribe, destroy = controller.destroy;
    const subscriptions = [], stats = { viewUnsubscribes: 0, destroys: 0, onUnsubscribe: null };
    controller.subscribe = function (fn) { subscriptions.push(fn); const off = subscribe.call(this, fn); return () => { stats.viewUnsubscribes++; off(); stats.onUnsubscribe?.(); }; };
    controller.destroy = function () { stats.destroys++; return destroy.call(this); };
    return { backend: b, store, controller, subscriptions, stats };
}
function model(options = {}) {
    const h = options.source || source(options.backend), document = createDocument({ blurUnavailableFocus: true, aggregateTextContent: true });
    const api = { ...scratchpad, Controller }, events = new Map();
    const window = { LocalItabScratchpad: api, LocalItabWorkspaces: { session: h.backend.workspace }, Blob, TextDecoder,
        addEventListener(type, fn) { const set = events.get(type) || new Set(); set.add(fn); events.set(type, set); },
        removeEventListener(type, fn) { events.get(type)?.delete(fn); } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../shared/local-scratchpad-view.js'), 'utf8'), { window, document });
    const host = document.createElement('article'), search = document.createElement('input'); document.body.append(search, host); search.focus();
    const visibility = [], view = api.mount(host, { controller: h.controller, onVisibility: value => visibility.push(value) });
    const nodes = Object.fromEntries(Object.entries(view).filter(([, value]) => value?.tagName && value.ownerDocument === document));
    return { ...h, document, window, events, host, search, view, visibility, nodes, viewUnsubscribe: view.unsubscribe,
        selectionOwner: view.copySelectionOwner, savedOwner: view.copySavedOwner };
}
async function pair() {
    const h = model(), foreign = model({ backend: backend(initial('Foreign exact text 😀\r\n', true, 60), h.backend.workspace) });
    await settle(); return { h, foreign };
}
function dispose(...models) {
    for (const h of models) if (h) {
        h.stats.onUnsubscribe = null;
        Object.assign(h.view, h.nodes, { controller: h.controller, unsubscribe: h.viewUnsubscribe, copySelectionOwner: h.selectionOwner, copySavedOwner: h.savedOwner });
        h.view.destroy(); h.controller.destroy();
    }
}
const io = h => ({ reads: h.backend.reads, writes: h.backend.writes, mutations: h.backend.mutations });
const raw = h => JSON.stringify(h.backend.raw());
const ui = h => ({ hidden: h.host.hidden, text: h.nodes.textarea.value, readOnly: h.nodes.textarea.readOnly,
    saved: h.nodes.savedPreview.value, savedHidden: h.nodes.savedPreview.hidden, status: h.nodes.status.textContent,
    error: h.nodes.status.classList.contains('scratchpad-error'), retry: h.nodes.retry.hidden, retryDisabled: h.nodes.retry.disabled,
    count: h.nodes.count.textContent, importDisabled: h.nodes.importButton.disabled, replaceHidden: h.nodes.replace.hidden,
    copyStatus: h.nodes.copyStatus.textContent, visibility: h.visibility.length });
const gateAt = (b, stage) => { const gate = { entered: deferred(), release: deferred() }; b[`${stage}Gate`] = gate; return gate; };
function watchHidden(node) {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'hidden'); let writes = 0;
    Object.defineProperty(node, 'hidden', { configurable: true, get() { return descriptor.get.call(this); }, set(value) { writes++; descriptor.set.call(this, value); } });
    return () => writes;
}
function depart(h) { const event = { prevented: false, preventDefault() { this.prevented = true; } }; for (const fn of h.events.get('beforeunload') || []) fn(event); return event; }

for (const entry of ['subscription', 'direct']) test(`${entry} render rejects a different complete real Controller before DOM publication`, async t => {
    const { h, foreign } = await pair();
    try {
        const before = ui(h), other = io(foreign), ownBytes = raw(h), foreignBytes = raw(foreign), writes = watchHidden(h.host);
        h.view.controller = foreign.controller;
        if (entry === 'subscription') { h.backend.notify(); await settle(); } else h.view.render();
        t.diagnostic(JSON.stringify({ entry, displayed: h.nodes.textarea.value, original: h.controller.draft, foreign: foreign.controller.draft, hostWrites: writes() }));
        assert.deepEqual(ui(h), before); assert.equal(writes(), 0); assert.deepEqual(io(foreign), other);
        assert.equal(raw(h), ownBytes); assert.equal(raw(foreign), foreignBytes);
        h.view.controller = h.controller; h.controller.setDraft(DRAFT); assert.equal(h.nodes.textarea.value, DRAFT);
        assert.equal(foreign.nodes.textarea.value, foreign.controller.draft, 'new intentional foreign View remains functional');
    } finally { dispose(h, foreign); }
});

test('subscription admission rejects substituted source before invoking public render', async () => {
    const { h, foreign } = await pair();
    try {
        let calls = 0; const render = h.view.render; h.view.render = () => { calls++; };
        h.view.controller = foreign.controller; h.backend.notify(); await settle(); assert.equal(calls, 0);
        h.view.controller = h.controller; h.backend.notify(); await settle(); assert.equal(calls, 1); h.view.render = render;
    } finally { dispose(h, foreign); }
});

const substitutions = {
    controller(h, f) { h.view.controller = f.controller; return () => { h.view.controller = h.controller; }; },
    store(h, f) { h.controller.store = f.store; return () => { h.controller.store = h.store; }; },
    backend(h, f) { h.store.backend = f.backend; return () => { h.store.backend = h.backend; }; },
    workspace(h) { const prior = h.backend.workspace; h.backend.workspace = { ...prior }; return () => { h.backend.workspace = prior; }; },
    workspaceId(h) { const prior = h.backend.workspace.id; h.backend.workspace.id = 'workspace_replaced'; return () => { h.backend.workspace.id = prior; }; },
    workspaceGeneration(h) { const prior = h.backend.workspace.generation; h.backend.workspace.generation = 'generation_replaced'; return () => { h.backend.workspace.generation = prior; }; },
    session(h) { const prior = h.window.LocalItabWorkspaces.session; h.window.LocalItabWorkspaces.session = { ...prior }; return () => { h.window.LocalItabWorkspaces.session = prior; }; },
    host(h, f) { h.view.host = f.host; return () => { h.view.host = h.host; }; },
    textarea(h, f) { h.view.textarea = f.view.textarea; return () => { h.view.textarea = h.nodes.textarea; }; },
    status(h, f) { h.view.status = f.view.status; return () => { h.view.status = h.nodes.status; }; }
};
for (const [name, substitute] of Object.entries(substitutions)) test(`render construction ${name} identity is rejected and recoverable`, async () => {
    const { h, foreign } = await pair(); let restore;
    try {
        const before = ui(h), theirs = ui(foreign), own = io(h), other = io(foreign), ownBytes = raw(h), foreignBytes = raw(foreign);
        const writes = watchHidden(h.host), foreignWrites = watchHidden(foreign.host);
        restore = substitute(h, foreign); h.view.render();
        assert.equal(writes(), 0); assert.equal(foreignWrites(), 0); assert.deepEqual(ui(h), before); assert.deepEqual(ui(foreign), theirs);
        assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); assert.equal(raw(h), ownBytes); assert.equal(raw(foreign), foreignBytes);
        restore(); restore = null; h.view.render(); assert.equal(writes(), 1);
    } finally { restore?.(); dispose(h, foreign); }
});

for (const outcome of ['success', 'READ']) test(`initial ${outcome} callback cannot render substituted Controller`, async () => {
    const b = backend(), gate = gateAt(b, 'read'); b.readError = outcome === 'READ'; const h = model({ backend: b });
    const foreign = model({ backend: backend(initial('Foreign ready', true, 60), b.workspace) });
    try {
        await gate.entered.promise; await settle(); const before = ui(h), other = io(foreign); h.view.controller = foreign.controller;
        gate.release.resolve(); await settle(); assert.deepEqual(ui(h), before); assert.deepEqual(io(foreign), other);
        assert.equal(h.controller.error?.code, outcome === 'READ' ? 'READ' : undefined);
        h.view.controller = h.controller; h.view.render(); assert.equal(h.nodes.status.classList.contains('scratchpad-error'), outcome === 'READ');
    } finally { gate.release.resolve(); dispose(h, foreign); }
});

for (const name of ['controller', 'store', 'backend', 'workspace', 'workspaceId', 'workspaceGeneration', 'session', 'host', 'textarea', 'status']) {
    test(`onVisibility ${name} substitution stops the remainder of original render`, async () => {
        const { h, foreign } = await pair(); let restore;
        try {
            await h.controller.setEnabled(false); const before = ui(h), theirs = ui(foreign), ownBytes = raw(h), foreignBytes = raw(foreign); let calls = 0;
            h.view.onVisibility = () => { calls++; restore = substitutions[name](h, foreign); };
            h.controller.setDraft(DRAFT);
            assert.equal(calls, 1); assert.equal(h.nodes.textarea.value, before.text); assert.equal(h.nodes.status.textContent, before.status);
            assert.equal(h.nodes.count.textContent, before.count); assert.deepEqual(ui(foreign), theirs);
            assert.equal(raw(h), ownBytes); assert.equal(raw(foreign), foreignBytes);
            restore(); restore = null; h.view.render(); assert.equal(h.nodes.textarea.value, DRAFT);
        } finally { restore?.(); dispose(h, foreign); }
    });
}

test('onVisibility destroy stops remaining render and does not restore textarea content after teardown', async () => {
    const h = model(); await settle();
    try {
        await h.controller.setEnabled(false); const before = h.nodes.textarea.value;
        h.view.onVisibility = () => h.view.destroy(); h.controller.setDraft(DRAFT);
        assert.equal(h.controller.closed, true); assert.equal(h.nodes.textarea.value, before); assert.equal(h.stats.destroys, 1);
    } finally { dispose(h); }
});

test('real nested onVisibility edit renders the newest same-source draft without a stale snapshot token', async () => {
    const h = model(); await settle();
    try {
        await h.controller.setEnabled(false); let calls = 0;
        h.view.onVisibility = () => { calls++; h.controller.setDraft('Nested newest text 😀\r\n'); };
        h.controller.setDraft(DRAFT); assert.equal(calls, 1); assert.equal(h.nodes.textarea.value, 'Nested newest text 😀\r\n');
        assert.equal(h.nodes.status.textContent, 'Unsaved changes'); assert.equal(h.controller.draft, h.nodes.textarea.value);
        assert.equal(h.backend.raw().content, EXACT);
    } finally { dispose(h); }
});

for (const kind of ['dirty', 'composing', 'write error', 'conflict', 'pending']) test(`departure guard keeps real original ${kind} when public Controller is foreign`, async t => {
    const { h, foreign } = await pair(); let gate, pending;
    try {
        if (kind === 'composing') h.controller.setComposing(true);
        else h.controller.setDraft(DRAFT);
        if (kind === 'write error') { h.backend.writeMode = 'reject'; await assert.rejects(h.controller.save(), { code: 'WRITE' }); }
        if (kind === 'conflict') { await new scratchpad.Store(h.backend).mutate({ kind: 'content', value: 'Remote saved text', revision: h.controller.state.revision }); await settle(); assert.equal(h.controller.conflict, true); }
        if (kind === 'pending') { gate = gateAt(h.backend, 'write'); pending = h.controller.save(); await gate.entered.promise; assert.equal(h.controller.pendingWrite, true); }
        assert.equal(h.controller.hasUncommittedWork(), true); let foreignQueries = 0;
        const query = foreign.controller.hasUncommittedWork; foreign.controller.hasUncommittedWork = function () { foreignQueries++; return query.call(this); };
        const own = io(h), other = io(foreign), ownBytes = raw(h), foreignBytes = raw(foreign); h.view.controller = foreign.controller;
        const guarded = h.view.hasUncommittedWork(), event = depart(h);
        t.diagnostic(JSON.stringify({ kind, guarded, prevented: event.prevented, foreignQueries }));
        assert.equal(guarded, true); assert.equal(event.prevented, true); assert.equal(event.returnValue, ''); assert.equal(foreignQueries, 0);
        assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); assert.equal(raw(h), ownBytes); assert.equal(raw(foreign), foreignBytes);
        h.window.LocalItabContentLifecycle = { departing: true }; assert.equal(depart(h).prevented, false);
    } finally { gate?.release.resolve(); await pending; dispose(h, foreign); }
});

test('clean original ignores foreign dirty work and passive original read failure does not invent ownership', async () => {
    const { h, foreign } = await pair();
    try {
        foreign.controller.setDraft('Foreign owned draft'); h.backend.readError = true; await assert.rejects(h.controller.refresh(), { code: 'READ' });
        h.view.controller = foreign.controller; assert.equal(h.view.hasUncommittedWork(), false); assert.equal(depart(h).prevented, false);
    } finally { dispose(h, foreign); }
});

for (const outcome of ['success', 'reject', 'ack']) test(`issued original ${outcome} is preserved across a foreign Controller display gap`, async t => {
    const { h, foreign } = await pair(); const gate = gateAt(h.backend, 'write');
    try {
        h.controller.setDraft(DRAFT); h.backend.writeMode = outcome === 'success' ? null : outcome;
        const pending = h.controller.save().catch(error => error); await gate.entered.promise;
        const before = ui(h), other = io(foreign), otherBytes = raw(foreign); h.view.controller = foreign.controller;
        gate.release.resolve(); const result = await pending; await settle();
        assert.deepEqual(ui(h), before); assert.deepEqual(io(foreign), other); assert.equal(raw(foreign), otherBytes);
        assert.equal(h.backend.raw().content, outcome === 'reject' ? EXACT : DRAFT);
        assert.equal(outcome === 'success' ? result.revision : result.code, outcome === 'success' ? 5 : 'WRITE');
        const writes = h.backend.writes; h.view.controller = h.controller; h.view.render(); await h.controller.retry();
        assert.equal(h.backend.writes, writes + (outcome === 'reject' ? 1 : 0)); assert.equal(h.backend.raw().content, DRAFT);
        assert.equal(h.nodes.textarea.value, DRAFT); assert.equal(h.nodes.status.textContent, 'Saved on this device');
        t.diagnostic(JSON.stringify({ outcome, original: io(h), foreign: io(foreign), exactSaved: h.backend.raw().content === DRAFT }));
    } finally { gate.release.resolve(); dispose(h, foreign); }
});

for (const outcome of ['success', 'reject']) test(`original detached hidden completion still publishes ${outcome}`, async () => {
    const h = model(); await settle(); const gate = gateAt(h.backend, 'write');
    try {
        h.controller.setDraft(DRAFT); h.backend.writeMode = outcome === 'success' ? null : outcome;
        const pending = h.controller.save().catch(error => error); await gate.entered.promise;
        h.host.remove(); h.document.hidden = true; h.backend.workspace._suspended = true;
        gate.release.resolve(); const result = await pending;
        assert.equal(h.nodes.status.classList.contains('scratchpad-error'), outcome === 'reject');
        assert.equal(h.nodes.status.textContent, outcome === 'success' ? 'Saved on this device' : 'Could not confirm the save. Your draft is still here. Retry or export a text copy before leaving.');
        assert.equal(outcome === 'success' ? result.revision : result.code, outcome === 'success' ? 5 : 'WRITE');
    } finally { gate.release.resolve(); dispose(h); }
});

for (const loaded of [false, true]) test(`same-source real READ error is rendered ${loaded ? 'after load' : 'on first load'}`, async () => {
    const b = backend(); b.readError = !loaded; const h = model({ backend: b }); await settle();
    try {
        if (loaded) { b.readError = true; await assert.rejects(h.controller.refresh(), { code: 'READ' }); }
        assert.equal(h.nodes.status.textContent, 'Could not load Scratchpad. Retry before editing.'); assert.equal(h.nodes.textarea.readOnly, true);
        assert.equal(h.nodes.retry.hidden, false); await h.controller.retry(); assert.equal(h.nodes.textarea.value, EXACT);
        assert.equal(h.nodes.status.textContent, 'Saved on this device');
    } finally { dispose(h); }
});

test('normal exact text, IME, focus and real conflict saved preview retain existing behavior', async () => {
    const h = model(); await settle();
    try {
        assert.equal(h.nodes.textarea.value, EXACT); assert.equal(h.document.activeElement, h.search);
        h.nodes.textarea.focus(); h.nodes.textarea.dispatch('compositionstart'); h.nodes.textarea.value = DRAFT; h.nodes.textarea.dispatch('input');
        await new scratchpad.Store(h.backend).mutate({ kind: 'content', value: 'Remote exact\r\n中文 😀', revision: h.controller.state.revision }); await settle();
        assert.equal(h.controller.conflict, true); assert.equal(h.nodes.savedPreview.value, 'Remote exact\r\n中文 😀'); assert.equal(h.nodes.savedPreview.hidden, false);
        assert.equal(h.nodes.textarea.value, DRAFT); assert.equal(h.document.activeElement, h.nodes.textarea);
        h.nodes.textarea.value = DRAFT + '完成'; h.nodes.textarea.dispatch('compositionend'); assert.equal(h.controller.draft, DRAFT + '完成');
        await h.controller.useSaved(); assert.equal(h.nodes.textarea.value, 'Remote exact\r\n中文 😀'); assert.equal(h.nodes.savedPreview.hidden, true);
    } finally { dispose(h); }
});

async function sessionModel() {
    const entry = { id: 'workspace_original', generation: 'generation_original', deletedAt: null }; let value = initial();
    const manager = { chrome: { storage: { onChanged: { addListener() {} } } }, subscribe() {}, async ready() {},
        async registry() { return { lastUsedId: entry.id, workspaces: [clone(entry)] }; },
        locks: { request(name, options, action) { return Promise.resolve().then(action); } }, async assertRestoreSettled() {},
        async readBundle() { return { [scratchpad.KEY]: clone(value) }; }, async writeBundle(entry, next) { value = clone(next[scratchpad.KEY]); } };
    const session = new Workspaces.Session(manager, entry.id); await session.ready();
    const b = scratchpad.createChromeBackend(null, null, session);
    return { ...model({ source: source(b) }), session, entry, raw: () => clone(value) };
}
for (const mode of ['suspend', 'invalidate']) test(`same-source real Session ${mode} keeps the original error visible`, async () => {
    const h = await sessionModel(); await settle();
    try {
        h.controller.setDraft(DRAFT); const before = JSON.stringify(h.raw());
        if (mode === 'suspend') h.session.suspendWrites(); else h.entry.generation = 'generation_retired';
        const code = mode === 'suspend' ? 'WORKSPACE_SWITCH_PENDING' : 'WORKSPACE_INVALIDATED';
        await assert.rejects(h.controller.save(), { code }); assert.equal(h.controller.error.code, code);
        assert.equal(h.nodes.status.classList.contains('scratchpad-error'), true); assert.equal(h.view.hasUncommittedWork(), true);
        assert.equal(JSON.stringify(h.raw()), before);
        if (mode === 'suspend') { h.session.resumeWrites(); await h.controller.retry(); assert.equal(h.raw().content, DRAFT); }
    } finally { dispose(h); }
});

for (const replaceFields of [false, true]) test(`destroy uses original Controller, host, listeners and subscription with ${replaceFields ? 'all public handles replaced' : 'foreign Controller only'}`, async t => {
    const { h, foreign } = await pair();
    try {
        const own = io(h), other = io(foreign), ownBytes = raw(h), foreignBytes = raw(foreign), theirs = ui(foreign);
        h.view.controller = foreign.controller;
        if (replaceFields) {
            Object.assign(h.view, foreign.nodes, { unsubscribe: foreign.viewUnsubscribe, copySavedOwner: foreign.savedOwner, copySelectionOwner: foreign.selectionOwner });
            for (const name of ['copyCompositionStart', 'copyCompositionEnd', 'findKeyup', 'findPointerdown', 'findKeydown', 'findVisibilityChange', 'beforeUnload']) h.view[name] = foreign.view[name];
        }
        h.view.destroy();
        t.diagnostic(JSON.stringify({ replaceFields, originalClosed: h.controller.closed, foreignClosed: foreign.controller.closed,
            originalUnsubscribes: h.stats.viewUnsubscribes, foreignUnsubscribes: foreign.stats.viewUnsubscribes }));
        assert.equal(h.controller.closed, true); assert.equal(foreign.controller.closed, false);
        assert.equal(h.stats.destroys, 1); assert.equal(foreign.stats.destroys, 0); assert.equal(h.stats.viewUnsubscribes, 1); assert.equal(foreign.stats.viewUnsubscribes, 0);
        assert.equal(h.backend.listenerCount(), 0); assert.equal(foreign.backend.listenerCount(), 1);
        for (const name of ['compositionstart', 'compositionend', 'keyup', 'pointerdown', 'keydown']) assert.equal(h.host.listeners.get(name).length, 0, name);
        assert.equal(h.document.listeners.has('visibilitychange'), false); assert.equal(h.events.get('beforeunload').size, 0);
        assert.equal(foreign.selectionOwner.valid, true); assert.equal(foreign.savedOwner.valid, true); assert.deepEqual(ui(foreign), theirs);
        assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); assert.equal(raw(h), ownBytes); assert.equal(raw(foreign), foreignBytes);
        foreign.controller.setDraft('Foreign still editable'); assert.equal(foreign.nodes.textarea.value, 'Foreign still editable');
    } finally { dispose(h, foreign); }
});

test('private retirement precedes unsubscribe callbacks and closed reset cannot revive or destroy twice', async () => {
    const h = model(); await settle();
    try {
        const callback = h.subscriptions[0], writes = watchHidden(h.host); let callbacks = 0;
        h.stats.onUnsubscribe = () => {
            if (++callbacks > 1) return;
            h.view.closed = false; callback(); h.view.render(); h.view.destroy();
        };
        h.view.destroy(); assert.equal(callbacks, 1); assert.equal(writes(), 0);
        assert.equal(h.stats.viewUnsubscribes, 1); assert.equal(h.stats.destroys, 1); assert.equal(h.backend.listenerCount(), 0);
        h.view.closed = false; callback(); h.view.render(); h.view.destroy();
        assert.equal(h.stats.viewUnsubscribes, 1); assert.equal(h.stats.destroys, 1); assert.equal(writes(), 0); assert.equal(h.view.hasUncommittedWork(), false);
    } finally { dispose(h); }
});

for (const failureAt of ['listener', 'unsubscribe']) test(`destroy exposes first ${failureAt} cleanup error after completing remaining original cleanup`, async t => {
    const h = model(); await settle(); const first = Error('Synthetic first cleanup failure'), later = Error('Synthetic later cleanup failure'); let removes = 0;
    const remove = h.host.removeEventListener;
    try {
        h.host.removeEventListener = function (...args) { remove.apply(this, args); if (++removes === 1 && failureAt === 'listener') throw first; };
        h.stats.onUnsubscribe = () => { throw failureAt === 'unsubscribe' ? first : later; };
        assert.throws(() => h.view.destroy(), error => error === first);
        t.diagnostic(JSON.stringify({ failureAt, removes, destroys: h.stats.destroys, unsubscribes: h.stats.viewUnsubscribes, backendListeners: h.backend.listenerCount() }));
        assert.equal(removes, 5); assert.equal(h.stats.viewUnsubscribes, 1); assert.equal(h.stats.destroys, 1); assert.equal(h.backend.listenerCount(), 0);
        assert.equal(h.events.get('beforeunload').size, 0); assert.equal(h.document.listeners.has('visibilitychange'), false);
        h.view.closed = false; assert.doesNotThrow(() => h.view.destroy()); assert.equal(h.stats.destroys, 1);
    } finally { h.host.removeEventListener = remove; dispose(h); }
});

for (const outcome of ['success', 'reject', 'ack']) test(`destroy cannot cancel issued original ${outcome} and retained render cannot publish later`, async () => {
    const { h, foreign } = await pair(); const gate = gateAt(h.backend, 'write');
    try {
        h.controller.setDraft(DRAFT); h.backend.writeMode = outcome === 'success' ? null : outcome;
        const pending = h.controller.save().catch(error => error); await gate.entered.promise;
        h.view.controller = foreign.controller; h.view.destroy(); const before = ui(h), other = io(foreign), otherBytes = raw(foreign);
        gate.release.resolve(); const result = await pending; await settle();
        assert.equal(h.controller.closed, true); assert.equal(foreign.controller.closed, false); assert.deepEqual(ui(h), before);
        assert.equal(h.backend.raw().content, outcome === 'reject' ? EXACT : DRAFT); assert.equal(h.controller.pending, false);
        assert.equal(outcome === 'success' ? result.revision : result.code, outcome === 'success' ? 5 : 'WRITE');
        assert.deepEqual(io(foreign), other); assert.equal(raw(foreign), otherBytes);
        h.view.closed = false; h.subscriptions[0](); h.view.render(); assert.deepEqual(ui(h), before);
    } finally { gate.release.resolve(); dispose(h, foreign); }
});

// Model native adoption by moving the same nodes and recursively changing their
// ownerDocument. This is an identity change, unlike same-document detachment.
function adoptInto(node, document, parent) {
    node.remove();
    const visit = current => { current.ownerDocument = document; for (const child of current.children) visit(child); };
    visit(node); parent.append(node);
}
for (const target of ['host', 'textarea', 'status']) for (const entry of ['subscription', 'direct']) {
    test(`${entry} render rejects original ${target} adopted into a different document`, async () => {
        const { h, foreign } = await pair(), node = target === 'host' ? h.host : h.nodes[target], parent = node.parentElement;
        try {
            h.controller.setDraft('Original draft before adoption'); h.controller.cancelTimer();
            const before = ui(h), theirs = ui(foreign), own = io(h), other = io(foreign), ownBytes = raw(h), foreignBytes = raw(foreign);
            const writes = watchHidden(h.host);
            if (entry === 'direct') h.viewUnsubscribe();
            adoptInto(node, foreign.document, foreign.document.body);
            h.controller.setDraft(DRAFT); h.controller.cancelTimer();
            if (entry === 'direct') h.view.render();
            assert.equal(node.ownerDocument, foreign.document); assert.equal(h.controller.draft, DRAFT);
            assert.equal(writes(), 0); assert.deepEqual(ui(h), before); assert.deepEqual(ui(foreign), theirs);
            assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); assert.equal(raw(h), ownBytes); assert.equal(raw(foreign), foreignBytes);
            adoptInto(node, h.document, parent); h.view.render(); assert.equal(h.nodes.textarea.value, DRAFT); assert.equal(writes(), 1);
        } finally { adoptInto(node, h.document, parent); dispose(h, foreign); }
    });
}
for (const target of ['host', 'textarea', 'status']) test(`onVisibility adoption of original ${target} retires the rest of that render`, async () => {
    const { h, foreign } = await pair(), node = target === 'host' ? h.host : h.nodes[target], parent = node.parentElement;
    try {
        await h.controller.setEnabled(false); const before = ui(h), theirs = ui(foreign), own = io(h), other = io(foreign), ownBytes = raw(h), foreignBytes = raw(foreign); let calls = 0;
        h.view.onVisibility = () => { calls++; adoptInto(node, foreign.document, foreign.document.body); };
        h.controller.setDraft(DRAFT); h.controller.cancelTimer();
        assert.equal(calls, 1); assert.equal(node.ownerDocument, foreign.document);
        assert.equal(h.nodes.textarea.value, before.text); assert.equal(h.nodes.status.textContent, before.status); assert.equal(h.nodes.count.textContent, before.count);
        assert.deepEqual(ui(foreign), theirs); assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other);
        assert.equal(raw(h), ownBytes); assert.equal(raw(foreign), foreignBytes);
        adoptInto(node, h.document, parent); h.view.render(); assert.equal(h.nodes.textarea.value, DRAFT);
    } finally { adoptInto(node, h.document, parent); dispose(h, foreign); }
});

async function readyCopy(h, kind) {
    if (kind === 'saved') {
        h.controller.setDraft(DRAFT); h.controller.cancelTimer();
        await new scratchpad.Store(h.backend).mutate({ kind: 'content', value: 'Remote saved copy 中文\r\n', revision: h.controller.state.revision });
        await settle(); assert.equal(h.controller.conflict, true);
    }
    h.nodes.textarea.selectionStart = 0; h.nodes.textarea.selectionEnd = 3; h.nodes.textarea.selectionDirection = 'forward';
}
function copyHarness(h) {
    const gates = [deferred(), deferred()], calls = [];
    h.view.clipboard = { writeText(text) { const gate = gates[calls.length]; calls.push(text); return gate.promise; } };
    return { gates, calls, release() { for (const gate of gates) gate.resolve(); } };
}
function copy(h, kind) { return kind === 'saved' ? h.view.copySavedText() : kind === 'selection' ? h.view.copySelectedText() : h.view.copyText(); }
const copyGaps = {
    controller(h, foreign) { h.view.controller = foreign.controller; return () => { h.view.controller = h.controller; }; },
    workspace(h) { const prior = h.backend.workspace; h.backend.workspace = { ...prior }; return () => { h.backend.workspace = prior; }; },
    session(h) { const prior = h.window.LocalItabWorkspaces.session; delete h.window.LocalItabWorkspaces.session; return () => { h.window.LocalItabWorkspaces.session = prior; }; }
};
for (const kind of ['full', 'selection', 'saved']) for (const settled of [false, true]) for (const [gap, change] of Object.entries(copyGaps)) for (const entry of ['direct', 'subscription']) {
    test(`${entry} ${gap} gap retires original ${kind} ${settled ? 'settled' : 'pending'} receipt without releasing its issued lock`, async () => {
        const { h, foreign } = await pair(); const clip = copyHarness(h); let restore, pending; const refresh = h.view.refreshCopyControl;
        try {
            await readyCopy(h, kind); pending = copy(h, kind); assert.equal(clip.calls.length, 1);
            if (settled) { clip.gates[0].resolve(); await pending; }
            const receipt = h.view.copyReceipt, attempt = h.view.copyAttempt, other = io(foreign), ownBytes = raw(h), foreignBytes = raw(foreign);
            let foreignQueries = 0; const query = foreign.controller.hasUncommittedWork;
            foreign.controller.hasUncommittedWork = function () { foreignQueries++; return query.call(this); };
            h.view.refreshCopyControl = () => { throw Error('Rejected render must not dynamically refresh copy controls'); };
            restore = change(h, foreign);
            if (entry === 'subscription') { h.backend.notify(); await settle(); } else h.view.render();
            assert.equal(receipt.valid, false); assert.equal(h.view.copyReceipt, null); assert.equal(h.view.copyAttempt, attempt);
            assert.equal(h.nodes.copyStatus.textContent, ''); assert.equal(h.nodes.copyStatus.hidden, true); assert.equal(foreignQueries, 0);
            assert.deepEqual(io(foreign), other); assert.equal(raw(h), ownBytes); assert.equal(raw(foreign), foreignBytes);
            h.view.refreshCopyControl = refresh; restore(); restore = null; h.view.render();
            if (!settled) { copy(h, 'full'); copy(h, 'selection'); copy(h, 'saved'); assert.equal(clip.calls.length, 1); }
            clip.gates[0].resolve(); await pending;
            assert.equal(h.view.copyAttempt, null); assert.equal(h.nodes.copyStatus.textContent, ''); assert.equal(h.nodes.copyStatus.hidden, true);
        } finally { h.view.refreshCopyControl = refresh; restore?.(); clip.release(); await pending; dispose(h, foreign); }
    });
}
for (const kind of ['full', 'selection', 'saved']) for (const settled of [false, true]) test(`real closed Controller retires ${kind} ${settled ? 'settled' : 'pending'} receipt`, async () => {
    const h = model(); await settle(); const clip = copyHarness(h); let pending;
    try {
        await readyCopy(h, kind); pending = copy(h, kind); assert.equal(clip.calls.length, 1);
        if (settled) { clip.gates[0].resolve(); await pending; }
        const receipt = h.view.copyReceipt, attempt = h.view.copyAttempt, own = io(h), bytes = raw(h);
        h.controller.destroy(); h.view.render();
        assert.equal(receipt.valid, false); assert.equal(h.view.copyReceipt, null); assert.equal(h.view.copyAttempt, attempt);
        assert.equal(h.nodes.copyStatus.textContent, ''); assert.equal(h.nodes.copyStatus.hidden, true); assert.deepEqual(io(h), own); assert.equal(raw(h), bytes);
        clip.gates[0].resolve(); await pending; assert.equal(h.view.copyAttempt, null);
    } finally { clip.release(); await pending; dispose(h); }
});

for (const kind of ['full', 'selection', 'saved']) test(`rejected render never cleans foreign ${kind} receipt or changes its status`, async () => {
    const { h, foreign } = await pair(), clip = copyHarness(foreign); let pending;
    try {
        await readyCopy(foreign, kind); pending = copy(foreign, kind); assert.equal(clip.calls.length, 1);
        const receipt = foreign.view.copyReceipt, cleanup = receipt.cleanup; let cleaned = 0;
        receipt.cleanup = () => { cleaned++; cleanup(); h.view.copyReceipt = null; };
        const theirs = ui(foreign), own = io(h), other = io(foreign), ownBytes = raw(h), foreignBytes = raw(foreign);
        h.view.controller = foreign.controller; h.view.copyReceipt = receipt; h.view.copyAttempt = foreign.view.copyAttempt; h.view.copyStatus = foreign.nodes.copyStatus;
        h.view.render(); h.subscriptions[0]();
        assert.equal(cleaned, 0); assert.equal(receipt.valid, true); assert.equal(h.view.copyReceipt, receipt); assert.equal(h.view.copyAttempt, receipt);
        assert.deepEqual(ui(foreign), theirs); assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); assert.equal(raw(h), ownBytes); assert.equal(raw(foreign), foreignBytes);
        h.view.copyReceipt = null; h.view.copyAttempt = null; receipt.cleanup = cleanup;
    } finally { clip.release(); await pending; dispose(h, foreign); }
});

for (const replacement of ['adopted status', 'substituted status', 'reparented status', 'reparented host']) test(`source-gap receipt retirement does not write ${replacement} DOM`, async () => {
    const { h, foreign } = await pair(), clip = copyHarness(h); let pending;
    const status = h.nodes.copyStatus, parent = status.parentElement;
    try {
        pending = copy(h, 'full'); const receipt = h.view.copyReceipt, before = status.textContent, foreignBefore = ui(foreign), writes = watchHidden(status);
        if (replacement === 'adopted status') adoptInto(status, foreign.document, foreign.document.body);
        else if (replacement === 'substituted status') h.view.copyStatus = foreign.nodes.copyStatus;
        else { const container = h.document.createElement('section'); h.document.body.append(container); adoptInto(replacement === 'reparented host' ? h.host : status, h.document, container); }
        h.view.controller = foreign.controller; h.view.render();
        assert.equal(receipt.valid, false); assert.equal(h.view.copyReceipt, null); assert.equal(h.view.copyAttempt, receipt);
        assert.equal(status.textContent, before); assert.equal(writes(), 0); assert.deepEqual(ui(foreign), foreignBefore);
    } finally { adoptInto(h.host, h.document, h.document.body); adoptInto(status, h.document, parent); h.view.copyStatus = status; h.view.controller = h.controller; clip.release(); await pending; dispose(h, foreign); }
});

test('reentrant original cleanup can restore source and create a newer original receipt without old retirement erasing it', async () => {
    const { h, foreign } = await pair(), clip = copyHarness(h); let first, second;
    try {
        first = copy(h, 'full'); clip.gates[0].resolve(); await first;
        const old = h.view.copyReceipt, cleanup = old.cleanup; let cleaned = 0, latest;
        old.cleanup = () => { cleaned++; cleanup(); h.view.controller = h.controller; second = copy(h, 'full'); latest = h.view.copyReceipt; };
        h.view.controller = foreign.controller; h.view.render();
        assert.equal(cleaned, 1); assert.equal(old.valid, false); assert.notEqual(latest, old); assert.equal(latest.valid, true);
        assert.equal(h.view.copyReceipt, latest); assert.equal(h.view.copyAttempt, latest); assert.equal(clip.calls.length, 2);
        assert.equal(h.nodes.copyStatus.textContent, 'Copying current text…'); assert.equal(h.nodes.copyStatus.hidden, false);
        clip.gates[1].resolve(); await second; assert.equal(h.nodes.copyStatus.textContent, 'Current text copied.');
    } finally { h.view.controller = h.controller; clip.release(); await first; await second; dispose(h, foreign); }
});

for (const settled of [false, true]) test(`reentrant cleanup installing a foreign receipt preserves the new state after ${settled ? 'settled' : 'pending'} original retirement`, async () => {
    const { h, foreign } = await pair(), ownClip = copyHarness(h), foreignClip = copyHarness(foreign); let pending, otherPending;
    try {
        pending = copy(h, 'full'); if (settled) { ownClip.gates[0].resolve(); await pending; }
        otherPending = copy(foreign, 'full'); const old = h.view.copyReceipt, cleanup = old.cleanup, newer = foreign.view.copyReceipt, attempt = h.view.copyAttempt, theirs = ui(foreign); let cleaned = 0;
        old.cleanup = () => { cleaned++; cleanup(); h.view.copyReceipt = newer; h.view.copyStatus = foreign.nodes.copyStatus; };
        h.view.controller = foreign.controller; h.view.render();
        assert.equal(cleaned, 1); assert.equal(old.valid, false); assert.equal(newer.valid, true);
        assert.equal(h.view.copyReceipt, newer); assert.equal(h.view.copyAttempt, attempt); assert.deepEqual(ui(foreign), theirs);
        h.view.copyReceipt = null; h.view.copyStatus = h.nodes.copyStatus; h.view.controller = h.controller;
        ownClip.gates[0].resolve(); await pending; assert.equal(h.view.copyAttempt, null);
    } finally { h.view.copyReceipt = null; h.view.copyStatus = h.nodes.copyStatus; h.view.controller = h.controller; ownClip.release(); foreignClip.release(); await pending; await otherPending; dispose(h, foreign); }
});

for (const settled of [false, true]) test(`post-onVisibility source gap retires original ${settled ? 'settled' : 'pending'} receipt`, async () => {
    const { h, foreign } = await pair(), clip = copyHarness(h); let pending;
    try {
        pending = copy(h, 'full'); if (settled) { clip.gates[0].resolve(); await pending; }
        const receipt = h.view.copyReceipt, attempt = h.view.copyAttempt, theirs = ui(foreign); let changed = 0;
        h.view.onVisibility = visible => { if (!visible) { changed++; h.view.controller = foreign.controller; } };
        await h.controller.setEnabled(false);
        assert.equal(changed, 1); assert.equal(receipt.valid, false); assert.equal(h.view.copyReceipt, null); assert.equal(h.view.copyAttempt, attempt);
        assert.equal(h.nodes.copyStatus.textContent, ''); assert.equal(h.nodes.copyStatus.hidden, true); assert.deepEqual(ui(foreign), theirs);
    } finally { h.view.controller = h.controller; clip.release(); await pending; dispose(h, foreign); }
});
