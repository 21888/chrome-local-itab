const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');
const scratchpad = require('../shared/local-scratchpad-store.js');
const { Controller } = require('../shared/local-scratchpad-controller.js');
const VIEW = process.env.SETTINGS_VIEW_SOURCE || require.resolve('../shared/local-scratchpad-view.js');
const EXACT = '\uFEFF \tSaved 中文 😀\r\n<script>literal</script>\rfinal\n\n';
const DRAFT = ' \tRetained draft 中文 🪷\r\n<draft>\r\n';
const clone = value => structuredClone(value);
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { await tick(); await tick(); await tick(); }
const initial = (content = EXACT, enabled = true, revision = 4) => scratchpad.validate({ schemaVersion: 1, revision, enabled, content });
// All data and failures are synthetic. Every state transition uses the genuine
// Controller/Store; public source/DOM substitutions are explicit fault injection.
function backend(state = initial(), workspace = { id: 'workspace_original', generation: 'generation_original' }) {
    let raw = clone(state), queue = Promise.resolve(); const listeners = new Set();
    const b = { workspace, reads: 0, writes: 0, mutations: 0, unsubscribes: 0, readGate: null, writeGate: null, readError: false, writeMode: null,
        lock(action) { const p = queue.then(action); queue = p.catch(() => {}); return p; },
        async read() { b.reads++; const value = clone(raw), gate = b.readGate, error = b.readError; b.readGate = null; b.readError = false;
            if (gate) { gate.entered.resolve(); await gate.release.promise; } if (error) throw Error('Synthetic read failure'); return value; },
        async write(value) { b.writes++; const gate = b.writeGate, mode = b.writeMode; b.writeGate = null; b.writeMode = null;
            if (gate) { gate.entered.resolve(); await gate.release.promise; } if (mode === 'reject') throw Error('Synthetic write rejection');
            raw = clone(value); b.notify(); if (mode === 'ack') throw Error('Synthetic lost acknowledgement'); },
        subscribe(fn) { listeners.add(fn); return () => { b.unsubscribes++; listeners.delete(fn); }; },
        notify() { for (const fn of [...listeners]) fn(); }, listenerCount: () => listeners.size, raw: () => clone(raw)
    }; return b;
}
function source(b = backend()) {
    const store = new scratchpad.Store(b), mutate = store.mutate; store.mutate = function (...args) { b.mutations++; return mutate.apply(this, args); };
    const controller = new Controller(store, { delay: 60000 }), subscribe = controller.subscribe, destroy = controller.destroy;
    const callbacks = [], stats = { unsubscribes: 0, destroys: 0, onUnsubscribe: null };
    controller.subscribe = function (fn) { callbacks.push(fn); const off = subscribe.call(this, fn); return () => { stats.unsubscribes++; off(); stats.onUnsubscribe?.(); }; };
    controller.destroy = function () { stats.destroys++; return destroy.call(this); };
    return { backend: b, store, controller, callbacks, stats };
}
function model(options = {}) {
    const document = createDocument({ aggregateTextContent: true }), api = { ...scratchpad, Controller };
    const h = options.source || source(options.backend), window = { LocalItabScratchpad: api, LocalItabWorkspaces: { session: h.backend.workspace } };
    vm.runInNewContext(fs.readFileSync(VIEW, 'utf8'), { window, document });
    const host = document.createElement('section'); document.body.append(host);
    const m = { ...h, document, window, api, host, handles: [] };
    m.mount = (s = h, opts = {}) => { const handle = api.mountSettings(host, { controller: s.controller, ...opts }); m.handles.push({ handle, source: s }); return handle; };
    if (!options.unmounted) { m.handle = m.mount(); m.nodes = nodes(host); }
    return m;
}
function nodes(host) { const buttons = host.querySelectorAll('button'); return { input: host.querySelector('input'), status: host.querySelector('.scratchpad-status'), retry: buttons[0], latest: buttons[1] }; }
function dispose(...models) { for (const h of models) if (h) { h.stats.onUnsubscribe = null; for (const { handle, source: s } of h.handles) { s.stats.onUnsubscribe = null; try { handle.destroy(); } catch (_) {} try { s.controller.destroy(); } catch (_) {} } try { h.controller.destroy(); } catch (_) {} } }
const io = h => ({ reads: h.backend.reads, writes: h.backend.writes, mutations: h.backend.mutations });
const raw = h => JSON.stringify(h.backend.raw());
const ui = n => ({ checked: n.input.checked, disabled: n.input.disabled, status: n.status.textContent, retryHidden: n.retry.hidden, retryDisabled: n.retry.disabled, latestHidden: n.latest.hidden, latestDisabled: n.latest.disabled });
function gateAt(b, stage) { const gate = { entered: deferred(), release: deferred() }; b[`${stage}Gate`] = gate; return gate; }
function onceGet(object, key, callback) { const descriptor = Object.getOwnPropertyDescriptor(object, key), value = object[key]; let armed = true;
    Object.defineProperty(object, key, { configurable: true, get() { if (armed) { armed = false; callback(); } return value; }, set(next) { Object.defineProperty(object, key, { configurable: true, writable: true, value: next }); } });
    return () => descriptor ? Object.defineProperty(object, key, descriptor) : (delete object[key], object[key] = value);
}
async function conflict(h) { h.controller.setDraft(DRAFT); await new scratchpad.Store(h.backend).mutate({ kind: 'content', value: 'Other saved exact 😀\r\n', revision: h.controller.state.revision }); await settle(); assert.equal(h.controller.conflict, true); }
async function writeError(h, mode = 'reject') { h.controller.setDraft(DRAFT); h.backend.writeMode = mode; await assert.rejects(h.controller.save(), { code: 'WRITE' }); assert.equal(h.controller.writeError, true); }
function invoke(h, action) { if (action === 'render') h.callbacks[0](); else if (action === 'toggle') { h.nodes.input.checked = false; h.nodes.input.dispatch('change'); } else h.nodes[action === 'retry' ? 'retry' : 'latest'].dispatch('click'); }
const substitutions = {
    controller(h, f) { const prior = h.handle.controller; h.handle.controller = f.controller; return () => { h.handle.controller = prior; }; },
    store(h, f) { h.controller.store = f.store; return () => { h.controller.store = h.store; }; },
    backend(h, f) { h.store.backend = f.backend; return () => { h.store.backend = h.backend; }; },
    workspace(h) { const prior = h.backend.workspace; h.backend.workspace = { ...prior }; return () => { h.backend.workspace = prior; }; },
    workspaceId(h) { const prior = h.backend.workspace.id; h.backend.workspace.id = 'foreign_id'; return () => { h.backend.workspace.id = prior; }; },
    workspaceGeneration(h) { const prior = h.backend.workspace.generation; h.backend.workspace.generation = 'foreign_generation'; return () => { h.backend.workspace.generation = prior; }; },
    session(h) { const prior = h.window.LocalItabWorkspaces.session; h.window.LocalItabWorkspaces.session = { ...prior }; return () => { h.window.LocalItabWorkspaces.session = prior; }; }
};
for (const [name, substitute] of Object.entries(substitutions)) for (const action of ['render', 'toggle', 'retry', 'latest']) test(`${action} retains exact original ${name} source`, async () => {
    const h = model(), f = model(); await settle(); let restore;
    try {
        if (action === 'retry') await writeError(h); if (action === 'latest') await conflict(h);
        if (action === 'render') h.nodes.status.textContent = 'original display sentinel';
        if (action === 'toggle') h.nodes.input.checked = false;
        const before = ui(h.nodes), own = io(h), other = io(f), bytes = raw(h), foreign = raw(f);
        restore = substitute(h, f); invoke(h, action); await settle();
        assert.deepEqual(ui(h.nodes), before); assert.deepEqual(io(h), own); assert.deepEqual(io(f), other); assert.equal(raw(h), bytes); assert.equal(raw(f), foreign);
        restore(); restore = null;
        if (action === 'render') { h.callbacks[0](); assert.notEqual(h.nodes.status.textContent, before.status); }
        else { invoke(h, action); await settle(); if (action === 'toggle') assert.equal(h.backend.raw().enabled, false); if (action === 'retry') assert.equal(h.backend.raw().content, DRAFT); if (action === 'latest') assert.equal(h.controller.draft, h.backend.raw().content); }
    } finally { restore?.(); dispose(h, f); }
});

for (const name of ['input', 'status', 'retry', 'latest']) for (const change of ['transfer', 'replace', 'document']) for (const action of ['render', 'toggle', 'retry', 'latest']) test(`${action} rejects ${name} ${change} before UI or Controller dispatch`, async () => {
    const h = model(); await settle();
    try {
        if (action === 'retry') await writeError(h); if (action === 'latest') await conflict(h);
        const target = h.nodes[name], parent = target.parentElement, next = h.document.createElement(target.tagName), foreign = h.document.createElement('aside'); h.document.body.append(foreign);
        if (change === 'transfer') { target.remove(); foreign.append(target); }
        if (change === 'replace') target.replaceWith(next);
        if (change === 'document') target.ownerDocument = createDocument();
        h.nodes.status.textContent = 'owned display sentinel'; h.nodes.input.checked = false;
        const before = ui(h.nodes), own = io(h), bytes = raw(h); invoke(h, action); await settle();
        assert.deepEqual(ui(h.nodes), before); assert.deepEqual(io(h), own); assert.equal(raw(h), bytes);
        assert.equal(next.textContent, ''); assert.equal(next.checked, undefined);
        if (change === 'document') target.ownerDocument = h.document;
        else { target.remove(); if (change === 'replace') next.remove(); parent.append(target); }
        h.callbacks[0](); assert.notEqual(h.nodes.status.textContent, 'owned display sentinel');
    } finally { dispose(h); }
});

for (const method of ['toggle', 'retry', 'latest']) for (const mode of ['hidden', 'detached host', 'disabled controls']) test(`original ${mode} preserves real ${method} semantics`, async () => {
    const h = model(); await settle();
    try {
        if (method === 'retry') await writeError(h); if (method === 'latest') await conflict(h);
        if (mode === 'hidden') h.host.hidden = true;
        if (mode === 'detached host') h.host.remove();
        if (mode === 'disabled controls') for (const node of Object.values(h.nodes)) node.disabled = true;
        invoke(h, method); await settle();
        if (method === 'toggle') { assert.equal(h.backend.raw().enabled, false); assert.equal(h.backend.raw().content, EXACT); }
        if (method === 'retry') assert.equal(h.backend.raw().content, DRAFT);
        if (method === 'latest') assert.equal(h.controller.draft, h.backend.raw().content);
    } finally { dispose(h); }
});

for (const method of ['toggle', 'retry', 'latest']) test(`forged ${method} event cannot dispatch to original Controller`, async () => {
    const h = model(); await settle();
    try {
        if (method === 'retry') await writeError(h); if (method === 'latest') await conflict(h);
        const node = method === 'toggle' ? h.nodes.input : h.nodes[method], event = method === 'toggle' ? 'change' : 'click';
        const own = io(h), bytes = raw(h); node.dispatch(event, { target: h.document.createElement('button') }); await settle();
        assert.deepEqual(io(h), own); assert.equal(raw(h), bytes);
    } finally { dispose(h); }
});

for (const action of ['render', 'toggle', 'retry', 'latest']) test(`same-host remount blocks old ${action} without retiring old work`, async () => {
    const h = model(); await settle();
    try {
        if (action === 'retry') await writeError(h); else if (action === 'latest') await conflict(h); else h.controller.setDraft(DRAFT);
        const fresh = source(backend(initial('Newest distinct source 😀\r\n', false, 90), h.backend.workspace));
        const newer = h.mount(fresh); await settle(); const current = nodes(h.host), before = ui(current), own = io(h), other = io(fresh), bytes = raw(h);
        assert.equal(h.handle.hasUncommittedWork(), true); assert.equal(h.controller.closed, false);
        invoke(h, action); await settle(); assert.deepEqual(io(h), own); assert.deepEqual(io(fresh), other); assert.deepEqual(ui(current), before); assert.equal(raw(h), bytes);
        newer.destroy(); h.host.replaceChildren(...h.host.children); invoke(h, action); await settle(); assert.deepEqual(io(h), own);
        assert.equal(h.controller.draft, DRAFT); assert.equal(h.handle.hasUncommittedWork(), true);
    } finally { dispose(h); }
});

for (const outcome of ['success', 'reject', 'ack']) test(`issued original ${outcome} survives remount and settles honestly`, async () => {
    const h = model(); await settle(); let pending, gate;
    try {
        h.controller.setDraft(DRAFT); gate = gateAt(h.backend, 'write'); h.backend.writeMode = outcome === 'success' ? null : outcome;
        pending = h.controller.save().catch(error => error); await gate.entered.promise;
        const fresh = source(backend(initial('New owner', false, 90), h.backend.workspace)); h.mount(fresh); await settle();
        const current = nodes(h.host), before = ui(current), other = io(fresh); assert.equal(h.handle.hasUncommittedWork(), true);
        gate.release.resolve(); const result = await pending; await settle();
        assert.equal(h.controller.draft, DRAFT); assert.equal(h.controller.closed, false); assert.equal(h.controller.pending, false);
        assert.equal(h.backend.raw().content, outcome === 'reject' ? EXACT : DRAFT);
        assert.equal(result?.code, outcome === 'success' ? undefined : 'WRITE'); assert.equal(h.handle.hasUncommittedWork(), outcome !== 'success');
        assert.deepEqual(ui(current), before); assert.deepEqual(io(fresh), other);
        if (outcome !== 'success') { await h.controller.retry(); assert.equal(h.backend.raw().content, DRAFT); assert.equal(h.controller.hasUncommittedWork(), false); }
    } finally { gate?.release.resolve(); await pending; dispose(h); }
});

for (const boundary of ['checked', 'method', 'source', 'event']) for (const action of ['toggle', 'retry', 'latest']) test(`${action} snapshots before ${boundary} getter creates a genuine newer draft`, async () => {
    const h = model(); await settle(); let restore;
    try {
        if (action === 'retry') await writeError(h); if (action === 'latest') await conflict(h);
        const node = action === 'toggle' ? h.nodes.input : h.nodes[action], event = action === 'toggle' ? 'change' : 'click';
        const method = action === 'toggle' ? 'setEnabled' : action === 'latest' ? 'useSaved' : 'retry';
        let calls = 0; const original = h.controller[method]; h.controller[method] = function (...args) { calls++; assert.equal(this, h.controller); return original.apply(this, args); };
        const nested = () => h.controller.setDraft('Genuine newest draft 😀\r\n');
        if (boundary === 'checked') {
            if (action !== 'toggle') { restore = onceGet(node, 'ownerDocument', nested); } else { node.checked = false; restore = onceGet(node, 'checked', nested); }
        } else if (boundary === 'method') restore = onceGet(h.controller, method, nested);
        else if (boundary === 'source') restore = onceGet(h.host, 'ownerDocument', nested);
        const own = io(h), bytes = raw(h);
        if (boundary === 'event') { const callback = node.listeners.get(event)[0]; const injected = {}; Object.defineProperty(injected, 'target', { get() { nested(); return node; } }); callback(injected); }
        else node.dispatch(event);
        await settle(); assert.equal(calls, 0); assert.deepEqual(io(h), own); assert.equal(raw(h), bytes); assert.equal(h.controller.draft, 'Genuine newest draft 😀\r\n');
    } finally { restore?.(); dispose(h); }
});

test('checked is read exactly once and original setEnabled receiver is retained', async () => {
    const h = model(); await settle(); let restore;
    try {
        let reads = 0, calls = 0; const enabled = h.controller.setEnabled;
        h.controller.setEnabled = function (value) { calls++; assert.equal(this, h.controller); assert.equal(value, false); return enabled.call(this, value); };
        Object.defineProperty(h.nodes.input, 'checked', { configurable: true, get() { reads++; return false; }, set() {} });
        h.nodes.input.dispatch('change'); await settle(); assert.equal(reads, 1); assert.equal(calls, 1); assert.equal(h.backend.raw().enabled, false); assert.equal(h.backend.raw().content, EXACT);
    } finally { restore?.(); dispose(h); }
});

for (const boundary of ['translation function', 'translation getter', 'status getter', 'input setter', 'source getter', 'work method getter']) test(`nested genuine render wins across ${boundary}`, async () => {
    const h = model(); await settle(); let restore, armed = true;
    try {
        const nested = () => { if (armed) { armed = false; h.controller.setDraft(DRAFT); } };
        if (boundary === 'translation function') h.window.i18n = { t(key) { nested(); return key; } };
        if (boundary === 'translation getter') { h.window.i18n = {}; Object.defineProperty(h.window.i18n, 't', { get() { nested(); return key => key; } }); }
        if (boundary === 'status getter') restore = onceGet(h.nodes.status, 'textContent', nested);
        if (boundary === 'source getter') restore = onceGet(h.host, 'ownerDocument', nested);
        if (boundary === 'work method getter') restore = onceGet(h.controller, 'hasUncommittedWork', nested);
        if (boundary === 'input setter') { let checked = h.nodes.input.checked; Object.defineProperty(h.nodes.input, 'checked', { configurable: true, get() { return checked; }, set(value) { checked = value; nested(); } }); }
        const own = io(h), bytes = raw(h); h.callbacks[0](); assert.equal(h.controller.draft, DRAFT); assert.equal(h.nodes.status.textContent, 'Unsaved changes'); assert.deepEqual(io(h), own); assert.equal(raw(h), bytes);
    } finally { restore?.(); dispose(h); }
});

for (const boundary of ['options getter', 'destroy getter', 'store getter', 'classList getter', 'class add getter', 'class add callback', 'create getter', 'create callback', 'translation getter', 'translation callback', 'replace getter', 'replace callback', 'listener getter', 'listener callback', 'subscribe getter', 'subscribe callback', 'init getter']) test(`newest nested settings mount wins at ${boundary}`, async () => {
    const h = model({ unmounted: true }), fresh = source(backend(initial('Newest exact 😀\r\n', false, 70), h.backend.workspace));
    let newest, current, before, restore, armed = true, oldInit = 0;
    const init = h.controller.init; h.controller.init = function (...args) { oldInit++; return init.apply(this, args); };
    const nested = () => { if (!armed) return; armed = false; newest = h.mount(fresh); current = nodes(h.host); before = ui(current); };
    try {
        let options = { controller: h.controller };
        if (boundary === 'options getter') Object.defineProperty(options, 'controller', { get() { nested(); return h.controller; } });
        if (boundary === 'destroy getter') restore = onceGet(h.controller, 'destroy', nested);
        if (boundary === 'store getter') restore = onceGet(h.controller, 'store', nested);
        if (boundary === 'classList getter') restore = onceGet(h.host, 'classList', nested);
        if (boundary === 'class add getter') restore = onceGet(h.host.classList, 'add', nested);
        if (boundary === 'class add callback') { const add = h.host.classList.add; h.host.classList.add = function (...args) { const result = add.apply(this, args); nested(); return result; }; }
        if (boundary === 'create getter') restore = onceGet(h.document, 'createElement', nested);
        if (boundary === 'create callback') { const create = h.document.createElement; h.document.createElement = function (...args) { const node = create.apply(this, args); nested(); return node; }; }
        if (boundary === 'translation getter') { h.window.i18n = {}; Object.defineProperty(h.window.i18n, 't', { get() { nested(); return key => key; } }); }
        if (boundary === 'translation callback') h.window.i18n = { t(key) { nested(); return key; } };
        if (boundary === 'replace getter') restore = onceGet(h.host, 'replaceChildren', nested);
        if (boundary === 'replace callback') { const replace = h.host.replaceChildren; h.host.replaceChildren = function (...args) { const result = replace.apply(this, args); nested(); return result; }; }
        if (boundary.startsWith('listener')) {
            const create = h.document.createElement; h.document.createElement = function (...args) { const node = create.apply(this, args);
                if (node.tagName === 'INPUT') {
                    if (boundary === 'listener getter') onceGet(node, 'addEventListener', nested);
                    else { const add = node.addEventListener; node.addEventListener = function (...params) { const result = add.apply(this, params); nested(); return result; }; }
                } return node;
            };
        }
        if (boundary === 'subscribe getter') restore = onceGet(h.controller, 'subscribe', nested);
        if (boundary === 'subscribe callback') { const subscribe = h.controller.subscribe; h.controller.subscribe = function (...args) { const off = subscribe.apply(this, args); nested(); return off; }; }
        if (boundary === 'init getter') restore = onceGet(h.controller, 'init', nested);
        const old = h.api.mountSettings(h.host, options); h.handles.push({ handle: old, source: h });
        assert.ok(newest); assert.equal(h.host.querySelector('input'), current.input); assert.deepEqual(ui(current), before);
        await settle(); assert.equal(h.host.querySelector('input'), current.input); assert.equal(current.input.checked, false); assert.equal(h.backend.reads, 0); assert.equal(h.backend.writes, 0); assert.equal(oldInit, 0);
        assert.equal(h.controller.closed, false); assert.equal(h.stats.destroys, 0); assert.equal(fresh.controller.loaded, true);
        old.destroy(); assert.equal(fresh.controller.closed, false); assert.equal(fresh.backend.listenerCount(), 1);
    } finally { restore?.(); dispose(h); }
});

test('already-entered original init/read can settle after nested newest mount', async () => {
    const h = model({ unmounted: true }), fresh = source(backend(initial('Newest exact', false, 70), h.backend.workspace)), gate = gateAt(h.backend, 'read');
    let entered = 0; const init = h.controller.init;
    h.controller.init = function (...args) { entered++; const result = init.apply(this, args); h.mount(fresh); return result; };
    try {
        h.handle = h.mount(); const current = nodes(h.host); await gate.entered.promise; await settle(); const before = ui(current), other = io(fresh);
        assert.equal(entered, 1); assert.equal(h.backend.reads, 1); gate.release.resolve(); await settle();
        assert.equal(h.controller.loaded, true); assert.equal(h.controller.draft, EXACT); assert.deepEqual(ui(current), before); assert.deepEqual(io(fresh), other);
    } finally { gate.release.resolve(); dispose(h); }
});

for (const action of ['toggle', 'retry', 'latest']) test(`method getter remount prevents old ${action} invocation`, async () => {
    const h = model(); await settle(); let restore;
    try {
        if (action === 'retry') await writeError(h); if (action === 'latest') await conflict(h);
        const fresh = source(backend(initial('New source', false, 50), h.backend.workspace)), method = action === 'toggle' ? 'setEnabled' : action === 'retry' ? 'retry' : 'useSaved';
        let calls = 0; const fn = h.controller[method]; h.controller[method] = function (...args) { calls++; return fn.apply(this, args); };
        restore = onceGet(h.controller, method, () => h.mount(fresh)); const own = io(h), bytes = raw(h);
        invoke(h, action); await settle(); assert.equal(calls, 0); assert.deepEqual(io(h), own); assert.equal(raw(h), bytes); assert.equal(nodes(h.host).input.checked, false);
    } finally { restore?.(); dispose(h); }
});

for (const reason of ['dirty', 'composing', 'write error', 'conflict', 'pending write']) test(`original work query survives public handle substitution with real ${reason}`, async () => {
    const h = model(), foreign = model(); await settle(); let pending, gate;
    try {
        if (reason === 'composing') h.controller.setComposing(true);
        else if (reason === 'write error') await writeError(h);
        else if (reason === 'conflict') await conflict(h);
        else { h.controller.setDraft(DRAFT); if (reason === 'pending write') { gate = gateAt(h.backend, 'write'); pending = h.controller.save(); await gate.entered.promise; } }
        h.handle.controller = foreign.controller; const other = io(foreign); assert.equal(h.handle.hasUncommittedWork(), true); assert.deepEqual(io(foreign), other);
        assert.equal(foreign.controller.hasUncommittedWork(), false); h.handle.controller = h.controller;
    } finally { gate?.release.resolve(); await pending; dispose(h, foreign); }
});

test('passive initial read error retains genuine Retry with no invented uncommitted work', async () => {
    const b = backend(); b.readError = true; const h = model({ backend: b }); await settle();
    try { assert.equal(h.controller.readError, true); assert.equal(h.handle.hasUncommittedWork(), false); assert.equal(h.nodes.input.disabled, true); assert.equal(h.nodes.retry.hidden, false);
        h.nodes.retry.dispatch('click'); await settle(); assert.equal(h.controller.loaded, true); assert.equal(h.nodes.input.disabled, false); assert.equal(h.backend.writes, 0); assert.equal(h.controller.draft, EXACT);
    } finally { dispose(h); }
});

for (const thrown of [undefined, null, false, 0, '', new Error('Synthetic cleanup failure')]) test(`destroy continues original cleanup after ${String(thrown)} and never touches new owner`, async () => {
    const h = model(); await settle(); const fresh = source(backend(initial('Newest saved', false, 70), h.backend.workspace)); h.mount(fresh); await settle();
    try {
        const current = nodes(h.host), before = ui(current); h.handle.controller = fresh.controller;
        h.stats.onUnsubscribe = () => { throw thrown; }; let caught = false, value;
        try { h.handle.destroy(); } catch (error) { caught = true; value = error; }
        assert.equal(caught, true); assert.equal(value, thrown); assert.equal(h.stats.unsubscribes, 1); assert.equal(h.stats.destroys, 1); assert.equal(h.backend.listenerCount(), 0);
        assert.equal(h.nodes.input.listeners.get('change').length, 0); assert.equal(h.nodes.retry.listeners.get('click').length, 0); assert.equal(h.nodes.latest.listeners.get('click').length, 0);
        assert.equal(fresh.controller.closed, false); assert.equal(fresh.stats.unsubscribes, 0); assert.equal(fresh.stats.destroys, 0); assert.deepEqual(ui(current), before);
        h.handle.destroy(); assert.equal(h.stats.unsubscribes, 1); assert.equal(h.stats.destroys, 1);
    } finally { dispose(h); }
});

test('explicit destroy uses captured original method and receiver after later method replacement', async () => {
    const h = model(); await settle(); const original = h.controller.destroy; let foreignCalls = 0;
    try { h.controller.destroy = () => { foreignCalls++; }; h.handle.destroy(); assert.equal(foreignCalls, 0); assert.equal(h.stats.destroys, 1); assert.equal(h.controller.closed, true); h.handle.destroy(); assert.equal(h.stats.destroys, 1); }
    finally { h.controller.destroy = original; dispose(h); }
});

test('two explicitly shared-Controller settings handles retain pre-existing shared destroy lifetime', async () => {
    const h = model(); await settle();
    try { const newer = h.mount(h); await settle(); h.handle.destroy(); assert.equal(newer.controller, h.controller); assert.equal(h.controller.closed, true); assert.equal(h.backend.listenerCount(), 0); newer.destroy(); }
    finally { dispose(h); }
});

for (const thrown of [undefined, null, false, 0, '', new Error('Synthetic construction failure')]) test(`construction preserves ${String(thrown)} while cleaning known resources without destroying C`, async () => {
    const h = model({ unmounted: true }); let caught = false, value, input;
    const create = h.document.createElement; h.document.createElement = function (...args) { const node = create.apply(this, args); if (node.tagName === 'INPUT') input = node; return node; };
    // Render occurs after the original subscription and listener acquisitions.
    h.window.i18n = { t(key) { if (key === 'scratchpadLoading') throw thrown; return key; } };
    h.stats.onUnsubscribe = () => { throw Error('Secondary cleanup must not replace original'); };
    try {
        try { h.mount(); } catch (error) { caught = true; value = error; }
        assert.equal(caught, true); assert.equal(value, thrown); assert.equal(h.stats.unsubscribes, 1); assert.equal(h.stats.destroys, 0); assert.equal(h.controller.closed, false);
        assert.equal(input.listeners.get('change').length, 0); assert.equal(h.controller.listeners.size, 0); assert.deepEqual(io(h), { reads: 0, writes: 0, mutations: 0 });
    } finally { dispose(h); }
});

test('actual Chrome backend visibility write keeps saved text and configuration keys separate', async () => {
    const configuration = { widgets: ['clock'], title: 'Synthetic configuration' }, raw = { configuration: clone(configuration), [scratchpad.KEY]: initial() }, listeners = new Set(), writes = [];
    let queue = Promise.resolve();
    const chrome = { storage: { local: { async get(keys) { return Object.fromEntries(keys.map(key => [key, clone(raw[key])])); }, async set(patch) { writes.push(clone(patch)); Object.assign(raw, clone(patch)); for (const fn of listeners) fn(Object.fromEntries(Object.keys(patch).map(key => [key, {}])), 'local'); } }, onChanged: { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); } } } };
    const locks = { request(name, options, action) { assert.equal(name, scratchpad.LOCK); const result = queue.then(action); queue = result.catch(() => {}); return result; } };
    const b = scratchpad.createChromeBackend(chrome, locks, null); Object.assign(b, { workspace: undefined, raw: () => clone(raw[scratchpad.KEY]), reads: 0, writes: 0 });
    const h = model({ backend: b }); await settle();
    try { h.nodes.input.checked = false; h.nodes.input.dispatch('change'); await settle(); assert.equal(writes.length, 1); assert.deepEqual(Object.keys(writes[0]), [scratchpad.KEY]);
        assert.deepEqual(raw.configuration, configuration); assert.equal(raw[scratchpad.KEY].content, EXACT); assert.equal(raw[scratchpad.KEY].enabled, false); assert.equal(raw[scratchpad.KEY].revision, 5);
    } finally { dispose(h); }
});

for (const boundary of ['translation', 'subscribe', 'init']) test(`initialized original Controller remains recoverable after constructor ${boundary} reentry`, async () => {
    const s = source(); await s.controller.init(); s.controller.setDraft(DRAFT); const h = model({ source: s, unmounted: true });
    const fresh = source(backend(initial('Newest saved', false, 70), h.backend.workspace)); let armed = true, restore;
    const nested = () => { if (armed) { armed = false; h.mount(fresh); } };
    try {
        if (boundary === 'translation') h.window.i18n = { t(key) { nested(); return key; } };
        if (boundary === 'subscribe') restore = onceGet(h.controller, 'subscribe', nested);
        if (boundary === 'init') restore = onceGet(h.controller, 'init', nested);
        const own = io(h), old = h.mount(); await settle(); assert.deepEqual(io(h), own); assert.equal(old.hasUncommittedWork(), true); assert.equal(h.controller.draft, DRAFT); assert.equal(h.controller.closed, false);
        old.destroy(); assert.equal(h.controller.closed, true); assert.equal(fresh.controller.closed, false);
    } finally { restore?.(); dispose(h); }
});

for (const thrown of [undefined, null, false, 0, '', new Error('Synthetic listener failure')]) test(`entered listener install failure ${String(thrown)} cleans acquired listeners and preserves original C`, async () => {
    const h = model({ unmounted: true }); await h.controller.init(); h.controller.setDraft(DRAFT); const create = h.document.createElement; const created = [];
    h.document.createElement = function (...args) { const node = create.apply(this, args); created.push(node);
        if (node.tagName === 'BUTTON') { const add = node.addEventListener; node.addEventListener = function (...params) { add.apply(this, params); throw thrown; }; } return node;
    };
    try {
        let caught = false, value; const own = io(h); try { h.mount(); } catch (error) { caught = true; value = error; }
        assert.equal(caught, true); assert.equal(value, thrown); assert.deepEqual(io(h), own); assert.equal(h.stats.destroys, 0); assert.equal(h.controller.closed, false); assert.equal(h.controller.draft, DRAFT);
        for (const node of created) for (const handlers of node.listeners.values()) assert.equal(handlers.length, 0);
    } finally { dispose(h); }
});

test('cleanup continues when captured listener removal throws false and preserves first failure', async () => {
    const h = model({ unmounted: true }), create = h.document.createElement;
    h.document.createElement = function (...args) { const node = create.apply(this, args);
        if (node.tagName === 'INPUT') { const remove = node.removeEventListener; node.removeEventListener = function (...params) { remove.apply(this, params); throw false; }; } return node;
    };
    h.handle = h.mount(); h.nodes = nodes(h.host); await settle();
    try {
        h.stats.onUnsubscribe = () => { throw Error('Later unsubscribe error'); }; let caught = false, value;
        try { h.handle.destroy(); } catch (error) { caught = true; value = error; }
        assert.equal(caught, true); assert.equal(value, false); assert.equal(h.stats.unsubscribes, 1); assert.equal(h.stats.destroys, 1); assert.equal(h.controller.closed, true);
        assert.equal(h.nodes.retry.listeners.get('click').length, 0); assert.equal(h.nodes.latest.listeners.get('click').length, 0);
    } finally { dispose(h); }
});

test('unsubscribe reentry can mount a new owner while recursive old destroy stays idempotent', async () => {
    const h = model(); await settle(); const fresh = source(backend(initial('Newest data', false, 70), h.backend.workspace)); let newer;
    try {
        h.stats.onUnsubscribe = () => { h.handle.destroy(); newer = h.mount(fresh); };
        h.handle.destroy(); await settle(); assert.ok(newer); assert.equal(h.stats.unsubscribes, 1); assert.equal(h.stats.destroys, 1); assert.equal(fresh.controller.closed, false); assert.equal(fresh.backend.listenerCount(), 1);
        assert.equal(nodes(h.host).input.checked, false);
    } finally { dispose(h); }
});

test('settings Retry reconciles real lost acknowledgement without replaying the saved draft', async () => {
    const h = model(); await settle();
    try { await writeError(h, 'ack'); assert.equal(h.backend.raw().content, DRAFT); const writes = h.backend.writes; h.nodes.retry.dispatch('click'); await settle();
        assert.equal(h.backend.writes, writes); assert.equal(h.controller.draft, DRAFT); assert.equal(h.controller.error, null); assert.equal(h.handle.hasUncommittedWork(), false); assert.equal(h.nodes.retry.hidden, true);
    } finally { dispose(h); }
});

test('production options caller still uses its existing single-mount guard', () => {
    const source = fs.readFileSync(require.resolve('../options.js'), 'utf8');
    assert.match(source, /!window\.localScratchpadSettingsView/); assert.match(source, /localScratchpadSettingsView\s*=\s*window\.LocalItabScratchpad\.mountSettings/);
});
