const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { createDocument } = require('./helpers/task-dom-model.js');
const tasks = require('../shared/local-tasks-store.js');
const { Controller } = require('../shared/local-tasks-controller.js');
const clone = value => structuredClone(value);
const NOW = '2026-10-18T08:00:00.000Z';
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { await tick(); await tick(); await tick(); }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function initial() {
    return tasks.validate({ schemaVersion: 1, revision: 7, enabled: true, pinnedId: 'task_0001', receipts: ['receipt_prior'],
        records: ['active', 'active', 'done', 'done', 'removed', 'removed'].map((state, i) => ({ id: `task_000${i}`, version: `version_${i}`,
            text: ['  Exact 中文 😀\r\nsecond\rline\u2028\u2029  ', '<b>plain & literal</b>', 'Completed café e\u0301', 'Completed café e\u0301', 'Removed 🧪\nkeep order', '😀'.repeat(1000)][i],
            state, removedFrom: state === 'removed' ? (i === 4 ? 'active' : 'done') : null, createdAt: NOW, updatedAt: NOW })),
        recovery: [{ id: 'recovery_prior', createdAt: NOW, content: { records: [{ id: 'old_task_1', version: 'old_version_1',
            text: 'Previous 中文 copy', state: 'active', removedFrom: null, createdAt: NOW, updatedAt: NOW }], pinnedId: 'old_task_1' } }] });
}
// Independent real Stores/Controllers deliberately share identical legal bytes
// and a workspace object. Replacing public identities is source-boundary fault
// injection, not ordinary navigation or evidence of historical data loss.
function source(workspace = { id: 'workspace_original', generation: 'generation_original' }) {
    let raw = initial(), queue = Promise.resolve(), serial = 0; const listeners = new Set();
    const backend = { workspace, reads: 0, writes: 0, locks: 0, failWrite: false,
        lock(fn) { backend.locks++; const promise = queue.then(fn); queue = promise.catch(() => {}); return promise; },
        async read() { backend.reads++; return clone(raw); },
        async write(value) { backend.writes++; if (backend.failWrite) throw Error('Synthetic storage failure'); raw = clone(value); },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, raw: () => clone(raw) };
    const store = new tasks.Store(backend, { id: () => `operation_${++serial}`, now: () => NOW });
    return { backend, store, controller: new Controller(store) };
}
function model(own = source()) {
    const document = createDocument({ blurUnavailableFocus: true, aggregateTextContent: true });
    const host = document.createElement('article'), search = document.createElement('input'); document.body.append(search, host); search.focus();
    const api = { ...tasks, Controller }, events = new Map(), observers = new Set(), observed = [], calls = [], gates = [];
    const external = { network: 0, permissions: 0 };
    const clipboard = { writeText(text) { assert.strictEqual(this, clipboard, 'captured method retains its receiver'); calls.push(text); return gates.shift()?.promise || Promise.resolve(); } };
    const window = { LocalItabTasks: api, LocalItabWorkspaces: { session: own.backend.workspace }, LocalItabContentLifecycle: { departing: false },
        fetch() { external.network++; throw Error('Unexpected network'); },
        navigator: { clipboard, permissions: { query() { external.permissions++; throw Error('Unexpected permission query'); } } },
        addEventListener(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
        removeEventListener(type, fn) { events.get(type)?.delete(fn); },
        getComputedStyle(node) { for (let current = node; current; current = current.parentElement) if (current.style.visibility) return { visibility: current.style.visibility }; return { visibility: 'visible' }; },
        // Observer records are explicit; this fixture claims no native timing.
        MutationObserver: class {
            constructor(callback) { this.callback = callback; this.records = []; this.disconnects = 0; observed.push(this); }
            observe() { observers.add(this); }
            disconnect() { this.disconnects++; observers.delete(this); }
            takeRecords() { const records = this.records; this.records = []; return records; }
        } };
    const context = vm.createContext({ window, document, crypto: webcrypto, setTimeout, URL, Blob, console });
    for (const file of ['dialog-focus.js', 'local-tasks-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared', file), 'utf8'), context);
    const view = api.mount(host, { controller: own.controller, clipboard, alwaysVisible: true });
    const h = { ...own, document, host, search, window, view, clipboard, calls, gates, events, observers, observed, external, lastCopy: null };
    const copy = view.copyText; view.copyText = function (...args) { return h.lastCopy = copy.apply(this, args); };
    return h;
}
async function pair() { const h = model(), foreign = source(h.backend.workspace); await foreign.controller.refresh(); await settle();
    assert.deepEqual(h.controller.state, foreign.controller.state); return { h, foreign }; }
function dispose(h, foreign) { h.view.destroy(); foreign?.controller.destroy(); assert.deepEqual(h.external, { network: 0, permissions: 0 }); }
const io = h => ({ reads: h.backend.reads, writes: h.backend.writes, locks: h.backend.locks });
const numbered = records => records.map((task, index) => `${index + 1}. ${task.text}`).join('\n');
const ui = h => ({ draft: h.view.input.value, filter: h.view.filterInput.value, filterQuery: h.view.filterQuery,
    error: h.view.localError, status: h.view.status.textContent, cardRetry: h.view.retry.hidden, retryCommand: h.controller.retryCommand,
    controllerError: h.controller.error, controllerStatus: h.controller.status, focused: h.document.activeElement });
function route(h, kind) {
    const v = h.view;
    if (kind === 'row') { const item = v.list.children[0]; item.querySelector('.tasks-row-menu').open = true;
        return { origin: item.querySelector('.tasks-copy-text'), status: item.querySelector('.tasks-row-copy-status'), current: 'copyCurrent', text: h.controller.state.records[0].text }; }
    if (kind === 'completed' || kind === 'removed') { v[kind].box.open = true; v[kind].box.dispatch('toggle'); }
    const stem = kind === 'active' ? 'Visible' : kind === 'completed' ? 'Completed' : 'Removed';
    return { origin: v[`copy${stem}Button`], status: v[`copy${stem}Status`],
        current: kind === 'active' ? 'copyVisibleCurrent' : kind === 'completed' ? 'completedVisibleCurrent' : 'removedVisibleCurrent',
        text: numbered(kind === 'active' ? v.visibleTasks : kind === 'completed' ? v.visibleCompletedTasks : v.visibleRemovedTasks) };
}
function click(h, r) { r.origin.dispatch('click'); return h.lastCopy; }
function onceMethod(object, method, callback) { const original = object[method]; object[method] = function (...args) {
    object[method] = original; const value = original.apply(this, args); callback(); return value;
}; }
function onceStatus(status, callback, when = () => true) { const prototype = Object.getPrototypeOf(status), descriptor = Object.getOwnPropertyDescriptor(prototype, 'textContent');
    Object.defineProperty(status, 'textContent', { configurable: true, get() { return descriptor.get.call(this); }, set(value) {
        descriptor.set.call(this, value); if (when(value)) { delete this.textContent; callback(value); }
    } });
}
const substitutions = {
    controller(h, other) { h.view.controller = other.controller; return () => { h.view.controller = h.controller; }; },
    store(h, other) { h.controller.store = other.store; return () => { h.controller.store = h.store; }; },
    backend(h, other) { h.store.backend = other.backend; return () => { h.store.backend = h.backend; }; },
    workspace(h) { const old = h.backend.workspace; h.backend.workspace = { ...old }; return () => { h.backend.workspace = old; }; },
    workspaceId(h) { const old = h.backend.workspace.id; h.backend.workspace.id = 'workspace_foreign'; return () => { h.backend.workspace.id = old; }; },
    workspaceGeneration(h) { const old = h.backend.workspace.generation; h.backend.workspace.generation = 'generation_foreign'; return () => { h.backend.workspace.generation = old; }; },
    session(h) { const old = h.window.LocalItabWorkspaces.session; h.window.LocalItabWorkspaces.session = { ...old }; return () => { h.window.LocalItabWorkspaces.session = old; }; },
    host(h) { const other = h.document.createElement('article'), control = h.document.createElement('button'); control.className = 'tasks-copy-text tasks-reuse-text';
        control.setAttribute('aria-disabled', 'foreign marker'); other.append(control); h.document.body.append(other); h.foreignControl = control; h.view.host = other;
        return () => { h.view.host = h.host; other.remove(); }; }
};
async function actualLocalError(h) { h.view.fileInput.files = [{ size: 2, text: async () => '{}' }]; await h.view.importFile(); assert.equal(h.view.localError.code, 'INVALID'); }
function unchanged(h, foreign, before) {
    assert.deepEqual(io(h), before.own, 'copy performs no original Store I/O'); assert.deepEqual(io(foreign), before.other, 'copy performs no foreign Store I/O');
    assert.deepEqual(h.backend.raw(), before.raw); assert.deepEqual(foreign.backend.raw(), before.foreignRaw); assert.deepEqual(ui(h), before.ui);
    if (h.foreignControl) assert.equal(h.foreignControl.getAttribute('aria-disabled'), 'foreign marker', 'foreign host controls are untouched');
}
function snapshot(h, foreign) { return { own: io(h), other: io(foreign), raw: h.backend.raw(), foreignRaw: foreign.backend.raw(), ui: ui(h) }; }
const kinds = ['row', 'active', 'completed', 'removed'];

for (const kind of kinds) test(`${kind}: real visible route synchronously copies exact bytes and only its local feedback`, async () => {
    const { h, foreign } = await pair();
    try { await actualLocalError(h); h.view.input.value = 'Unsaved 中文 draft'; const r = route(h, kind); r.origin.focus(); const before = snapshot(h, foreign);
        const pending = click(h, r); assert.deepEqual(h.calls, [r.text], 'write occurs within user-activated dispatch, before awaiting'); await pending;
        assert.match(r.status.textContent, /copied\.$/); assert.equal(r.status.hidden, false); unchanged(h, foreign, before);
    } finally { dispose(h, foreign); }
});

for (const kind of kinds) for (const [name, substitute] of Object.entries(substitutions))
    for (const stage of ['entry', 'status', 'controls', 'final-current']) test(`${kind}: ${stage} ${name} gap prevents a new clipboard effect`, async () => {
        const { h, foreign } = await pair(); let restore;
        try { await actualLocalError(h); h.view.input.value = 'Unsaved 中文 draft'; const r = route(h, kind); r.origin.focus(); const before = snapshot(h, foreign);
            const change = () => { restore = substitute(h, foreign); };
            if (stage === 'entry') change(); else if (stage === 'status') onceStatus(r.status, change);
            else if (stage === 'controls') onceMethod(h.view, 'refreshCopyControls', change);
            else onceMethod(h.view, r.current, change);
            await click(h, r); assert.equal(h.calls.length, 0, 'observed construction gap cannot issue a write');
            assert.equal(r.status.hidden, true); unchanged(h, foreign, before);
        } finally { restore?.(); dispose(h, foreign); }
    });

for (const kind of kinds) for (const [name, substitute] of Object.entries(substitutions)) for (const outcome of ['resolve', 'reject'])
    test(`${kind}: late ${outcome} after ${name} gap cleans only its pending copy`, async () => {
        const { h, foreign } = await pair(); let restore; const gate = deferred(); h.gates.push(gate);
        try { await actualLocalError(h); const r = route(h, kind); r.origin.focus(); const before = snapshot(h, foreign), pending = click(h, r), attempt = h.view.copyAttempt;
            assert.deepEqual(h.calls, [r.text]); restore = substitute(h, foreign); outcome === 'resolve' ? gate.resolve() : gate.reject(Error('Synthetic clipboard rejection'));
            await pending; assert.equal(r.status.textContent, ''); assert.equal(r.status.hidden, true); assert.equal(attempt.valid, false);
            assert.equal(h.view.copyAttempt, null); unchanged(h, foreign, before);
        } finally { gate.resolve(); restore?.(); dispose(h, foreign); }
    });

for (const kind of kinds) for (const outcome of ['resolve', 'reject']) test(`${kind}: final current callback ${outcome} cannot publish after its own source hook`, async () => {
    const { h, foreign } = await pair(); const gate = deferred(); h.gates.push(gate); let restore;
    try { const r = route(h, kind), pending = click(h, r); assert.equal(h.calls.length, 1);
        onceMethod(h.view, r.current, () => { restore = substitutions.workspaceGeneration(h); });
        outcome === 'resolve' ? gate.resolve() : gate.reject(Error('Synthetic clipboard rejection')); await pending;
        assert.equal(r.status.textContent, ''); assert.equal(r.status.hidden, true);
    } finally { gate.resolve(); restore?.(); dispose(h, foreign); }
});

for (const kind of kinds) for (const boundary of ['clipboard', 'writeText']) test(`${kind}: capture ${boundary} getter once and preserve the actual receiver`, async () => {
    const { h, foreign } = await pair(); let reads = 0, foreignCalls = 0;
    try { const r = route(h, kind), original = h.clipboard.writeText;
        if (boundary === 'clipboard') Object.defineProperty(h.view, 'clipboard', { configurable: true, get() { reads++; return reads === 1 ? h.clipboard : { writeText() { foreignCalls++; } }; } });
        else Object.defineProperty(h.clipboard, 'writeText', { configurable: true, get() { reads++; return reads === 1 ? original : function () { foreignCalls++; }; } });
        await click(h, r); assert.equal(reads, 1); assert.deepEqual(h.calls, [r.text]); assert.equal(foreignCalls, 0); assert.match(r.status.textContent, /copied\.$/);
    } finally { dispose(h, foreign); }
});
for (const kind of kinds) for (const boundary of ['clipboard', 'writeText']) for (const mode of ['gap', 'retire'])
    test(`${kind}: ${boundary} getter ${mode} prevents invocation`, async () => {
        const { h, foreign } = await pair(); let restore;
        try { const r = route(h, kind), original = h.clipboard.writeText; const change = () => {
            if (mode === 'gap') restore = substitutions.controller(h, foreign); else { h.view.destroy(); h.view.destroyed = false; }
        };
            Object.defineProperty(boundary === 'clipboard' ? h.view : h.clipboard, boundary, { configurable: true, get() { change(); return boundary === 'clipboard' ? h.clipboard : original; } });
            await click(h, r); assert.equal(h.calls.length, 0); assert.equal(r.status.hidden, true);
        } finally { restore?.(); dispose(h, foreign); }
    });

for (const kind of kinds) for (const event of ['blur', 'pagehide', 'observer']) test(`${kind}: stale ${event} callback never invalidates a newer real copy`, async () => {
    const { h, foreign } = await pair(); const first = deferred(), second = deferred(); h.gates.push(first, second);
    try { const r = route(h, kind), older = click(h, r), oldObserver = h.observed.at(-1);
        const stale = event === 'observer' ? () => oldObserver.callback([{ type: 'attributes', target: h.host }]) : [...h.events.get(event)][0];
        first.resolve(); await older; const newer = click(h, r), attempt = h.view.copyAttempt;
        assert.equal(h.calls.length, 2); assert.equal(attempt.valid, true); stale();
        assert.strictEqual(h.view.copyAttempt, attempt); assert.equal(attempt.valid, true, 'an old closure owns only its own attempt');
        assert.match(r.status.textContent, /Copying/); second.resolve(); await newer; assert.match(r.status.textContent, /copied\.$/);
    } finally { first.resolve(); second.resolve(); await settle(); dispose(h, foreign); }
});

for (const kind of kinds) for (const [name, substitute] of Object.entries(substitutions)) test(`${kind}: invalidated ${name} gap retains the issued-write lock until settlement`, async () => {
    const { h, foreign } = await pair(); const gate = deferred(); h.gates.push(gate); let restore;
    try { const r = route(h, kind), pending = click(h, r), attempt = h.view.copyAttempt; restore = substitute(h, foreign); h.view.invalidateCopy(); restore(); restore = null;
        await click(h, r); assert.equal(h.calls.length, 1); assert.strictEqual(h.view.copyAttempt, attempt); assert.equal(attempt.valid, false);
        gate.resolve(); await pending; assert.equal(h.view.copyAttempt, null); await click(h, r); assert.equal(h.calls.length, 2); assert.match(r.status.textContent, /copied\.$/);
    } finally { gate.resolve(); restore?.(); dispose(h, foreign); }
});

for (const kind of kinds) for (const stage of ['entry', 'controls', 'pending']) test(`${kind}: private construction retirement survives a reset public destroyed flag at ${stage}`, async () => {
    const { h, foreign } = await pair(); const gate = deferred(); h.gates.push(gate);
    try { const r = route(h, kind), retire = () => { h.view.destroy(); h.view.destroyed = false; };
        if (stage === 'entry') retire(); else if (stage === 'controls') onceMethod(h.view, 'refreshCopyControls', retire);
        const pending = click(h, r); if (stage === 'pending') { assert.equal(h.calls.length, 1); retire(); }
        gate.resolve(); await pending; assert.equal(h.calls.length, stage === 'pending' ? 1 : 0); assert.equal(r.status.hidden, true);
        await click(h, r); assert.equal(h.calls.length, stage === 'pending' ? 1 : 0);
    } finally { gate.resolve(); dispose(h, foreign); }
});

for (const kind of kinds) for (const failure of ['missing', 'throw', 'reject']) test(`${kind}: original ${failure} retains existing copy failure and focus with no retry or storage`, async () => {
    const { h, foreign } = await pair(); let calls = 0;
    try { await actualLocalError(h); h.view.input.value = 'Unsaved draft'; const r = route(h, kind); r.origin.focus(); const before = snapshot(h, foreign);
        h.view.clipboard = failure === 'missing' ? null : { writeText() { calls++; if (failure === 'throw') throw Error('Private synthetic clipboard message'); return Promise.reject(Error('Private synthetic clipboard message')); } };
        await click(h, r); assert.match(r.status.textContent, /^Could not copy\. Select /); assert.equal(r.status.classList.contains('is-error'), true);
        assert.equal(calls, failure === 'missing' ? 0 : 1); unchanged(h, foreign, before); await settle(); assert.equal(calls, failure === 'missing' ? 0 : 1);
    } finally { dispose(h, foreign); }
});

for (const kind of kinds) test(`${kind}: actual Controller write failure and retry survive a blocked copy`, async () => {
    const { h, foreign } = await pair();
    try { h.backend.failWrite = true; h.view.input.value = 'Actual failed save'; h.view.form.dispatch('submit'); await settle();
        assert.equal(h.controller.error.code, 'WRITE'); assert.equal(h.view.retry.hidden, false); const r = route(h, kind), before = snapshot(h, foreign);
        await click(h, r); assert.equal(h.calls.length, 0); unchanged(h, foreign, before);
    } finally { dispose(h, foreign); }
});

for (const kind of kinds) for (const attached of [false, true]) test(`${kind}: intact status parent adopted into ${attached ? 'attached' : 'detached'} foreign host is not cleared`, async () => {
    const { h, foreign } = await pair(); const gate = deferred(); h.gates.push(gate);
    try { const r = route(h, kind), pending = click(h, r), originalParent = r.status.parentElement, destination = h.document.createElement('aside');
        if (attached) h.document.body.append(destination);
        originalParent.remove(); destination.append(originalParent); const text = r.status.textContent, hidden = r.status.hidden;
        gate.resolve(); await pending;
        assert.equal(r.status.textContent, text, 'adoption does not grant the old attempt ownership of foreign status'); assert.equal(r.status.hidden, hidden);
        assert.equal(h.view.copyAttempt, null); assert.equal(h.events.get('blur')?.size || 0, 0);
    } finally { gate.resolve(); dispose(h, foreign); }
});

for (const kind of kinds) test(`${kind}: older control refresh cannot unlock controls after a hook starts a newer real copy`, async () => {
    const { h, foreign } = await pair(); const first = deferred(), second = deferred(); h.gates.push(first, second); let newer;
    try { const olderRoute = route(h, kind), newerRoute = route(h, kind === 'completed' ? 'active' : 'completed');
        const pending = click(h, olderRoute), rowControl = h.view.list.children[0].querySelector('.tasks-copy-text');
        const originalSet = rowControl.setAttribute;
        rowControl.setAttribute = function (name, value) {
            originalSet.call(this, name, value);
            if (name === 'aria-disabled' && value === 'false') { rowControl.setAttribute = originalSet; newer = click(h, newerRoute); }
        };
        first.resolve(); await pending; assert.equal(h.calls.length, 2, 'the hook starts a genuine second clipboard write after the first settles');
        assert.equal(h.view.copyAttempt.valid, true);
        for (const control of [h.view.copyVisibleButton, h.view.copyCompletedButton, h.view.copyRemovedButton])
            assert.equal(control.getAttribute('aria-disabled'), 'true', 'the older refresh cannot overwrite the newer lock presentation');
        second.resolve(); await newer; assert.match(newerRoute.status.textContent, /copied\.$/);
    } finally { first.resolve(); second.resolve(); await settle(); dispose(h, foreign); }
});
