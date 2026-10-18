const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const api = require('../shared/local-scratchpad-store');
const { Controller } = require('../shared/local-scratchpad-controller');
const Workspaces = require('../shared/workspaces');
const tick = () => new Promise(resolve => setImmediate(resolve));
const TEXT = '\uFEFF Original 中文 😀\r\none <b>literal</b>\r';
const DRAFT = ' \tNew 中文 🪷\r\n<draft>\n';
// Actual Store/Controller and immutable synthetic backend snapshots. These are
// deliberate public-field/callback probes, not normal navigation/data-loss proof.
async function model(t, options = {}) {
    const document = options.document || createDocument(), restores = [], calls = [], hooks = new Map();
    const hook = name => { const fn = hooks.get(name); if (fn) { hooks.delete(name); fn(); } };
    let raw = api.validate({ ...api.initial(), revision: 4, enabled: options.enabled !== false, content: options.text ?? TEXT }), tail = Promise.resolve();
    const io = { reads: 0, writes: 0, commits: 0, locks: 0 }, listeners = new Set();
    const backend = options.backend || {
        lock(fn) { io.locks++; const p = tail.then(fn); tail = p.catch(() => {}); return p; },
        async read() { io.reads++; if (backend.readGate) await backend.readGate.promise; if (backend.failRead) throw Error('synthetic read failure'); return structuredClone(raw); },
        async write(value) { io.writes++; if (backend.writeGate) { backend.entered.resolve(); await backend.writeGate.promise; }
            if (backend.failWrite) throw Error('synthetic write failure'); raw = structuredClone(value); io.commits++; listeners.forEach(fn => fn()); if (backend.failAck) throw Error('synthetic lost acknowledgement'); },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    };
    if (options.workspace && !options.backend) backend.workspace = { id: 'original', generation: 'original-generation' };
    if (options.loading) backend.readGate = deferred();
    if (options.readFailure) backend.failRead = true;
    const store = new api.Store(backend), controller = new Controller(store, { delay: 60000 });
    for (const method of ['setDraft', 'setComposing']) {
        const original = controller[method]; controller[method] = function (value) {
            assert.equal(this === controller, true, method + ' receiver'); calls.push([method, value]); hook(method + ':before');
            const result = original.call(this, value); hook(method + ':after'); return result;
        };
    }
    const window = { LocalItabScratchpad: { ...api }, addEventListener() {}, removeEventListener() {},
        navigator: { clipboard: { writeText: async text => calls.push(['clipboard', text]) } } };
    if (options.workspace || options.backend) window.LocalItabWorkspaces = { session: backend.workspace };
    vm.runInNewContext(fs.readFileSync(process.env.SCRATCHPAD_VIEW_SOURCE || path.join(__dirname, '../shared/local-scratchpad-view.js'), 'utf8'), { window, document });
    const wrapper = document.createElement('main'), host = document.createElement('article'); document.body.append(wrapper); wrapper.append(host);
    const view = new window.LocalItabScratchpad.View(host, { controller });
    const nodes = Object.fromEntries(Object.entries(view).filter(([, node]) => node?.tagName));
    for (const method of ['invalidateCopy', 'resetFindResult', 'refreshCopyControl']) {
        const original = view[method]; view[method] = function (...args) { assert.equal(this === view, true, method + ' receiver'); calls.push([method]); hook(method); return original.apply(this, args); };
    }
    const h = { document, window, host, wrapper, view, nodes, controller, store, backend, io, calls, hooks, restores,
        bytes: () => JSON.stringify(raw), foreign: () => model(t, { text: 'FOREIGN saved note' }),
        event(type, text) { if (text !== undefined) nodes.textarea.value = text; return nodes.textarea.dispatch(type); },
        clear() { controller.cancelTimer(); calls.length = 0; },
        async feedback() { await view.copyText(undefined, nodes.copyButton); calls.length = 0; }
    };
    t.after(async () => { hooks.clear(); while (restores.length) restores.pop()(); backend.readGate?.resolve(); backend.writeGate?.resolve(); await tick();
        Object.assign(view, nodes, { host, controller }); controller.store = store; store.backend = backend;
        try { view.destroy(); } catch (_) {} controller.destroy(); });
    await tick(); h.clear(); return h;
}
function snapshot(h) {
    const c = h.controller;
    return { state: c.state, error: c.error, timer: c.timer, receipt: h.view.copyReceipt, findResult: h.view.findResult,
        values: { bytes: h.bytes(), io: { ...h.io }, state: JSON.stringify(c.state), draft: c.draft, generation: c.generation,
            loaded: c.loaded, composing: c.composing, dirty: c.dirty(), pending: c.pending, pendingWrite: c.pendingWrite,
            readError: c.readError, writeError: c.writeError, conflict: c.conflict, status: c.status,
            findStatus: h.nodes.findStatus.textContent, copyStatus: h.nodes.copyStatus.textContent, copyHidden: h.nodes.copyStatus.hidden,
            copyButtons: ['copyButton', 'copySelectionButton', 'copySavedButton'].map(k => h.nodes[k].getAttribute('aria-disabled')) } };
}
function same(h, before) { const after = snapshot(h); for (const key of ['state', 'error', 'timer', 'receipt', 'findResult']) assert.equal(after[key] === before[key], true, key + ' identity'); assert.deepEqual(after.values, before.values); }
function onceGet(h, object, key, action) {
    const own = Object.getOwnPropertyDescriptor(object, key), value = object[key];
    const restore = () => { if (own) Object.defineProperty(object, key, own); else delete object[key]; };
    h.restores.push(restore); Object.defineProperty(object, key, { configurable: true, get() { restore(); action(); return value; }, set(next) { restore(); object[key] = next; } });
}
function transfer(h, node, target) {
    const parent = node.parentElement, document = node.ownerDocument;
    // The shared model does not auto-detach/adopt on append: do both explicitly.
    const place = (next, doc) => { node.remove(); const adopt = n => { n.ownerDocument = doc; n.children.forEach(adopt); }; adopt(node); next?.append(node); };
    place(target, target.ownerDocument); assert.equal(parent?.children.includes(node), false);
    h.restores.push(() => place(parent, document));
}
const substitutions = {
    controller: (h, f) => { h.view.controller = f.controller; }, store: (h, f) => { h.controller.store = f.store; }, backend: (h, f) => { h.store.backend = f.backend; },
    host: (h, f) => { h.view.host = f.host; },
    ...Object.fromEntries(['textarea', 'copyStatus', 'copyButton', 'copySelectionButton', 'copySavedButton', 'findStatus', 'status', 'count'].map(name => [name, (h, f) => { h.view[name] = f.nodes[name]; }])),
    workspace: h => { h.backend.workspace = { ...h.backend.workspace }; }, workspaceId: h => { h.backend.workspace.id = 'other'; },
    workspaceGeneration: h => { h.backend.workspace.generation = 'other'; }, session: h => { h.window.LocalItabWorkspaces.session = {}; }
};
const events = ['input', 'compositionstart', 'compositionend'];
for (const type of events) for (const [name, change] of Object.entries(substitutions)) test(`editor admission: ${type} rejects construction ${name} replacement`, async t => {
    const h = await model(t, { workspace: true }), f = await h.foreign();
    if (type === 'compositionend') h.event('compositionstart'); h.clear();
    const before = snapshot(h), foreign = snapshot(f); change(h, f); h.event(type, DRAFT);
    same(h, before); same(f, foreign); assert.deepEqual(h.calls, []); assert.deepEqual(f.calls, []);
});
for (const type of events) for (const name of ['textarea', 'host', 'wrapper', 'copyStatus', 'findStatus', 'copyButton', 'controls']) for (const cross of [false, true]) test(`editor ownership: ${type} refuses ${cross ? 'cross' : 'same'}-document ${name} transfer`, async t => {
    const h = await model(t); if (type === 'compositionend') h.event('compositionstart'); h.clear();
    const document = cross ? createDocument() : h.document, target = document.createElement('aside'); document.body.append(target);
    const node = name === 'controls' ? h.nodes.copyButton.parentElement : h[name] || h.nodes[name]; transfer(h, node, target);
    const before = snapshot(h); h.event(type, DRAFT); same(h, before); assert.deepEqual(h.calls, []);
});
for (const type of events) for (const name of ['parentElement', 'ownerDocument']) test(`editor metadata: ${type} stale ${name} getter cannot authorize a transferred editor`, async t => {
    const h = await model(t), f = await h.foreign(); if (type === 'compositionend') h.event('compositionstart'); h.clear();
    const before = snapshot(h); onceGet(h, h.nodes.textarea, name, () => transfer(h, h.nodes.textarea, f.host)); h.event(type, DRAFT); same(h, before); assert.deepEqual(h.calls, []);
});
for (const type of events) for (const field of ['target', 'currentTarget']) test(`editor event routing: ${type} rejects foreign ${field}`, async t => {
    const h = await model(t), f = await h.foreign(); if (type === 'compositionend') h.event('compositionstart'); h.clear();
    const before = snapshot(h); h.nodes.textarea.dispatch(type, { [field]: f.nodes.textarea }); same(h, before); assert.deepEqual(h.calls, []);
});
for (const stage of ['invalidateCopy', 'resetFindResult', 'value', 'setDraft']) for (const name of ['controller', 'store', 'backend', 'textarea', 'copyStatus', 'findStatus', 'workspace', 'session']) test(`editor input callback: ${stage} ${name} replacement stops original draft admission`, async t => {
    const h = await model(t, { workspace: true }), f = await h.foreign(); h.nodes.textarea.value = DRAFT; const before = snapshot(h), foreign = snapshot(f);
    const change = () => substitutions[name](h, f);
    if (stage === 'value') onceGet(h, h.nodes.textarea, 'value', change);
    else if (stage === 'setDraft') onceGet(h, h.controller, 'setDraft', change);
    else h.hooks.set(stage, change);
    h.event('input'); assert.equal(h.controller.draft, before.values.draft); assert.equal(h.controller.generation, before.values.generation);
    assert.equal(h.calls.filter(c => c[0] === 'setDraft').length, 0); same(f, foreign); assert.deepEqual(h.io, before.values.io); assert.equal(h.bytes(), before.values.bytes);
});
for (const stage of ['invalidateCopy', 'resetFindResult', 'value', 'setDraft']) for (const mode of ['input', 'direct draft', 'compositionstart']) test(`editor reentry: newer ${mode} from ${stage} wins over stale outer input`, async t => {
    const h = await model(t); h.nodes.textarea.value = 'outer stale';
    const nested = () => {
        if (mode === 'compositionstart') h.event('compositionstart');
        if (mode === 'direct draft') h.controller.setDraft('inner genuine draft'); else h.event('input', 'inner genuine draft');
    };
    if (stage === 'value') onceGet(h, h.nodes.textarea, 'value', nested); else if (stage === 'setDraft') onceGet(h, h.controller, 'setDraft', nested); else h.hooks.set(stage, nested);
    h.event('input'); assert.equal(h.controller.draft, 'inner genuine draft'); assert.equal(h.controller.generation, 1);
    assert.equal(h.calls.filter(c => c[0] === 'setDraft').length, 1); assert.equal(h.controller.composing, mode === 'compositionstart');
});
for (const type of ['compositionstart', 'compositionend']) for (const method of type === 'compositionstart' ? ['setComposing'] : ['setDraft', 'setComposing']) for (const name of ['controller', 'textarea', 'backend', 'session']) test(`editor method lookup: ${type} ${method} getter ${name} change prevents owned call`, async t => {
    const h = await model(t, { workspace: true }), f = await h.foreign(); if (type === 'compositionend') h.event('compositionstart'); h.clear();
    onceGet(h, h.controller, method, () => substitutions[name](h, f)); h.event(type, DRAFT);
    assert.equal(h.calls.filter(c => c[0] === method).length, 0); assert.equal(h.controller.composing, type === 'compositionend'); assert.deepEqual(f.calls, []);
});
for (const mode of ['input', 'direct draft', 'compositionstart', 'new composition with input']) test(`editor compositionend: setDraft notification with ${mode} preserves newer draft and correct IME owner`, async t => {
    const h = await model(t); h.event('compositionstart'); h.clear(); let once = true;
    const off = h.controller.subscribe(() => { if (!once) return; once = false;
        if (mode.includes('composition')) h.event('compositionstart');
        if (mode === 'direct draft') h.controller.setDraft('newer notification draft');
        else if (mode !== 'compositionstart') h.event('input', 'newer notification draft');
    });
    h.event('compositionend', DRAFT); off();
    assert.equal(h.controller.draft, mode === 'compositionstart' ? DRAFT : 'newer notification draft');
    assert.equal(h.controller.composing, mode.includes('composition'));
    assert.equal(h.calls.filter(c => c[0] === 'setComposing' && c[1] === false).length, mode.includes('composition') ? 0 : 1);
    assert.equal(Boolean(h.controller.timer), !mode.includes('composition')); assert.equal(h.io.writes, 0);
});
for (const mode of ['input', 'compositionstart']) test(`editor compositionend: setComposing lookup ${mode} reentry keeps correct completion ownership`, async t => {
    const h = await model(t); h.event('compositionstart'); h.clear();
    onceGet(h, h.controller, 'setComposing', () => { if (mode === 'compositionstart') h.event('compositionstart'); else h.event('input', 'latest input'); });
    h.event('compositionend', DRAFT); assert.equal(h.controller.composing, mode === 'compositionstart');
    assert.equal(h.controller.draft, mode === 'input' ? 'latest input' : DRAFT);
    assert.equal(h.calls.filter(c => c[0] === 'setComposing' && c[1] === false).length, mode === 'input' ? 1 : 0);
});
for (const type of events) test(`editor lifetime: retained ${type} callback cannot revive retired View`, async t => {
    const h = await model(t); const listener = h.nodes.textarea.listeners.get(type)[0]; h.view.destroy(); h.view.closed = false; h.controller.closed = false; h.clear();
    const before = snapshot(h); listener({ target: h.nodes.textarea, currentTarget: h.nodes.textarea }); same(h, before); assert.deepEqual(h.calls, []);
});
for (const type of events) for (const state of ['hidden host', 'detached host', 'detached editor', 'hidden document', 'disabled editor', 'readonly editor', 'inert host', 'disabled module', 'suspended flag', 'invalidated flag']) test(`editor compatibility: ${type} original ${state} retains event editing`, async t => {
    const h = await model(t, { workspace: true, enabled: state !== 'disabled module' }); if (type === 'compositionend') h.event('compositionstart'); h.clear();
    if (state === 'hidden host') h.host.hidden = true; if (state === 'detached host') h.host.remove(); if (state === 'detached editor') h.nodes.textarea.remove();
    if (state === 'hidden document') h.document.hidden = true; if (state === 'disabled editor') h.nodes.textarea.disabled = true; if (state === 'readonly editor') h.nodes.textarea.readOnly = true;
    if (state === 'inert host') h.host.inert = true; if (state === 'suspended flag') h.backend.workspace._suspended = true; if (state === 'invalidated flag') h.backend.workspace.invalidated = true;
    h.event(type, DRAFT); assert.equal(h.controller.draft, type === 'compositionstart' ? TEXT : DRAFT); assert.equal(h.controller.composing, type === 'compositionstart');
    assert.equal(h.calls.filter(c => c[0] === 'setDraft').length, type === 'compositionstart' ? 0 : 1); assert.equal(h.io.writes, 0);
});
for (const state of ['dirty', 'write error', 'lost acknowledgement', 'conflict', 'over-limit', 'pending success', 'pending failure']) test(`editor actual state: ${state} permits editing without changing issued writes`, async t => {
    const h = await model(t); h.controller.setDraft(state === 'over-limit' ? 'x'.repeat(32001) : 'earlier owned draft'); let pending;
    if (state === 'write error' || state === 'lost acknowledgement') { h.backend[state === 'write error' ? 'failWrite' : 'failAck'] = true; await assert.rejects(h.controller.save(), { code: 'WRITE' }); await tick(); }
    if (state === 'conflict') { await new api.Store(h.backend).mutate({ kind: 'content', value: 'remote saved', revision: 4 }); await tick(); assert(h.controller.conflict); }
    if (state === 'over-limit') await assert.rejects(h.controller.save(), { code: 'TEXT_LIMIT' });
    if (state.startsWith('pending')) { h.backend.writeGate = deferred(); h.backend.entered = deferred(); h.backend.failWrite = state === 'pending failure'; pending = h.controller.save(); pending.catch(() => {}); await h.backend.entered.promise; assert(h.controller.pendingWrite); }
    h.clear(); const before = snapshot(h); h.event('input', DRAFT); assert.equal(h.controller.draft, DRAFT); assert.equal(h.controller.generation, before.values.generation + 1); assert.deepEqual(h.io, before.values.io);
    if (state === 'over-limit') { assert.equal(h.controller.error, null); assert.equal(h.controller.writeError, false); }
    else { assert.equal(h.controller.error === before.error, true); assert.equal(h.controller.conflict, before.values.conflict); }
    if (pending) { h.backend.writeGate.resolve(); if (state === 'pending failure') { await assert.rejects(pending, { code: 'WRITE' }); assert.equal(h.controller.error.code, 'WRITE'); }
        else { await pending; assert.equal(JSON.parse(h.bytes()).content, 'earlier owned draft'); assert.equal(h.controller.state.content, 'earlier owned draft'); } assert.equal(h.controller.draft, DRAFT); }
});
for (const ongoing of [false, true]) test(`editor actual read error: ${ongoing ? 'ongoing IME completes' : 'ordinary input retains readonly draft'}`, async t => {
    const h = await model(t); if (ongoing) h.event('compositionstart'); h.controller.setDraft('retained owned draft');
    h.backend.failRead = true; await assert.rejects(h.controller.refresh(), { code: 'READ' }); assert(h.nodes.textarea.readOnly); const error = h.controller.error; h.clear();
    h.event(ongoing ? 'compositionend' : 'input', DRAFT); assert.equal(h.controller.draft, ongoing ? DRAFT : 'retained owned draft'); assert.equal(h.controller.composing, false);
    assert.equal(h.controller.error === error, true); assert.equal(h.controller.readError, true); assert.equal(h.io.writes, 0); assert.equal(h.controller.timer, null);
});
for (const loading of ['loading', 'initial error']) test(`editor unloaded: ${loading} keeps original draft gate and IME bookkeeping`, async t => {
    const h = await model(t, { loading: loading === 'loading', readFailure: loading === 'initial error' });
    h.event('compositionstart'); assert.equal(h.controller.composing, true); h.event('input', DRAFT); h.event('compositionend');
    assert.equal(h.controller.draft, ''); assert.equal(h.controller.composing, false); assert.equal(h.calls.filter(c => c[0] === 'setDraft').length, 0); assert.equal(h.io.writes, 0);
});
for (const target of ['host', 'findInput', 'importAppend']) test(`host composition: arbitrary original ${target} still invalidates copy and refreshes controls`, async t => {
    const h = await model(t); await h.feedback(); const targetNode = h[target] || h.nodes[target]; targetNode.dispatch('compositionstart'); targetNode.dispatch('compositionend');
    assert.equal(h.view.copyReceipt, null); assert(h.nodes.copyStatus.hidden); assert(h.calls.some(c => c[0] === 'invalidateCopy')); assert(h.calls.some(c => c[0] === 'refreshCopyControl')); assert.equal(h.controller.composing, false);
});
for (const type of ['compositionstart', 'compositionend']) test(`host routing: rejected editor ${type} cannot invoke copy cleanup/refresh`, async t => {
    const h = await model(t), f = await h.foreign(); if (type === 'compositionend') h.event('compositionstart'); h.clear();
    h.view.copyStatus = f.nodes.copyStatus; const foreign = snapshot(f); h.event(type, DRAFT); same(f, foreign);
    assert.equal(h.calls.filter(c => ['invalidateCopy', 'refreshCopyControl'].includes(c[0])).length, 0);
});
for (const type of ['compositionstart', 'compositionend']) test(`host reentry: ${type} notification starts newer edit and copy without stale host cleanup`, async t => {
    const h = await model(t); if (type === 'compositionend') h.event('compositionstart'); h.clear(); let once = true, copied;
    const off = h.controller.subscribe(() => { if (!once) return; once = false; h.controller.setComposing(false); h.event('input', 'newer copy text'); copied = h.view.copyText(undefined, h.nodes.copyButton); });
    h.event(type, DRAFT); off(); await copied; assert.equal(h.controller.draft, 'newer copy text');
    assert.equal(h.nodes.copyStatus.textContent, 'Current text copied.'); assert.equal(h.nodes.copyStatus.hidden, false);
});
for (const type of ['input', 'compositionstart']) test(`late default-backend setup: ${type} still retires an accepted same-View selection copy`, async t => {
    const h = await model(t); h.backend.workspace = { id: 'late test workspace', generation: 1 }; h.window.LocalItabWorkspaces = { session: h.backend.workspace };
    h.nodes.textarea.selectionStart = 1; h.nodes.textarea.selectionEnd = 9; h.nodes.textarea.selectionDirection = 'forward';
    await h.view.copySelectedText(undefined, h.view.copySelectionOwner); assert(h.view.copyReceipt); h.clear(); h.event(type, DRAFT);
    assert.equal(h.view.copyReceipt, null); assert.equal(h.nodes.copyStatus.hidden, true);
});
for (const mode of ['suspend', 'invalidate']) test(`editor real Session ${mode} error does not prevent original IME completion`, async t => {
    const entry = { id: 'original', generation: 'g1', deletedAt: null }; let raw = api.validate({ ...api.initial(), enabled: true, revision: 4, content: TEXT });
    const manager = { chrome: { storage: { onChanged: { addListener() {} } } }, subscribe() {}, async ready() {}, async registry() { return { lastUsedId: entry.id, workspaces: [structuredClone(entry)] }; },
        locks: { request(name, options, action) { return Promise.resolve().then(action); } }, async assertRestoreSettled() {}, async readBundle() { return { [api.KEY]: structuredClone(raw) }; }, async writeBundle(entry, next) { raw = structuredClone(next[api.KEY]); } };
    const session = new Workspaces.Session(manager, entry.id); await session.ready(); const h = await model(t, { backend: api.createChromeBackend(null, null, session) });
    h.event('compositionstart'); h.event('input', 'retained session draft'); if (mode === 'suspend') session.suspendWrites(); else entry.generation = 'g2';
    await assert.rejects(h.controller.refresh(), { code: mode === 'suspend' ? 'WORKSPACE_SWITCH_PENDING' : 'WORKSPACE_INVALIDATED' }); const error = h.controller.error;
    h.event('compositionend', DRAFT); assert.equal(h.controller.draft, DRAFT); assert.equal(h.controller.composing, false); assert.equal(h.controller.error === error, true); assert.equal(raw.content, TEXT);
});
