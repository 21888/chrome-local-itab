const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const api = require('../shared/local-scratchpad-store');
const { Controller } = require('../shared/local-scratchpad-controller');
const Workspaces = require('../shared/workspaces');
const tick = () => new Promise(resolve => setImmediate(resolve));
const TEXT = '\uFEFF Original 中文 😀\r\none <b>literal</b>\r';
const DRAFT = ' \tRecovery 中文 🪷\r\n<draft>\n';
const SAVED = 'Other page saved\r\n中文 😀\n';
const methods = { retry: 'retry', useSaved: 'useSaved', replace: 'replaceWithDraft' };
// Real Stores, Controllers, serialized transactions and synthetic snapshots.
// Public-field substitution below is robustness fault injection, not navigation.
async function model(t, options = {}) {
    const document = options.document || createDocument(), restores = [], calls = [], requests = [];
    let raw = api.validate({ ...api.initial(), revision: 4, enabled: options.enabled !== false, content: options.text ?? TEXT }), tail = Promise.resolve();
    const io = { reads: 0, writes: 0, commits: 0, locks: 0 }, listeners = new Set();
    const backend = options.backend || {
        lock(fn) { io.locks++; const result = tail.then(fn); tail = result.catch(() => {}); return result; },
        async read() { io.reads++; if (backend.readGate) { backend.readEntered?.resolve(); await backend.readGate.promise; }
            if (backend.failRead) throw Error('synthetic read failure'); return structuredClone(raw); },
        async write(value) { io.writes++; if (backend.writeGate) { backend.writeEntered?.resolve(); await backend.writeGate.promise; }
            if (backend.failWrite) throw Error('synthetic write failure'); raw = structuredClone(value); io.commits++;
            if (!backend.quiet) listeners.forEach(fn => fn()); if (backend.failAck) throw Error('synthetic lost acknowledgement'); },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    };
    if (options.workspace && !options.backend) backend.workspace = { id: 'original', generation: 'g1' };
    if (options.readFailure) backend.failRead = true;
    const store = new api.Store(backend), controller = new Controller(store, { delay: 60000 });
    for (const method of Object.values(methods)) {
        const original = controller[method]; controller[method] = function (...args) {
            assert.equal(this === controller, true, method + ' original receiver'); calls.push(method);
            const result = original.apply(this, args); requests.push(result); Promise.resolve(result).catch(() => {}); return result;
        };
    }
    const window = { LocalItabScratchpad: { ...api }, addEventListener() {}, removeEventListener() {} };
    if (options.workspace || options.backend) window.LocalItabWorkspaces = { session: backend.workspace };
    vm.runInNewContext(fs.readFileSync(process.env.SCRATCHPAD_VIEW_SOURCE || path.join(__dirname, '../shared/local-scratchpad-view.js'), 'utf8'), { window, document });
    const wrapper = document.createElement('main'), host = document.createElement('article'); document.body.append(wrapper); wrapper.append(host);
    const view = new window.LocalItabScratchpad.View(host, { controller });
    const nodes = Object.fromEntries(Object.entries(view).filter(([, node]) => node?.tagName));
    const h = { document, window, wrapper, host, view, nodes, controller, store, backend, io, calls, requests, restores,
        bytes: () => JSON.stringify(raw), foreign: () => model(t, { text: 'FOREIGN saved note' }),
        click(action, fields) { return nodes[action].dispatch('click', fields); },
        clear() { controller.cancelTimer(); calls.length = 0; requests.length = 0; },
        async settle() { await Promise.allSettled(requests); await tick(); controller.cancelTimer(); },
        async conflict() { controller.setDraft(DRAFT); controller.cancelTimer(); await new api.Store(backend).mutate({ kind: 'content', value: SAVED, revision: controller.state.revision }); await tick(); assert(controller.conflict); h.clear(); },
        async failWrite(ack = false) { controller.setDraft(DRAFT); backend[ack ? 'failAck' : 'failWrite'] = true;
            await assert.rejects(controller.save(), { code: 'WRITE' }); await tick(); backend.failWrite = backend.failAck = false; assert(controller.writeError); h.clear(); }
    };
    t.after(async () => { while (restores.length) restores.pop()(); backend.readGate?.resolve(); backend.writeGate?.resolve(); await tick();
        Object.assign(view, nodes, { host, controller }); controller.store = store; store.backend = backend;
        try { view.destroy(); } catch (_) {} controller.destroy(); });
    await tick(); h.clear(); return h;
}
function snapshot(h) {
    const c = h.controller;
    return { state: c.state, error: c.error, timer: c.timer,
        values: { bytes: h.bytes(), io: { ...h.io }, state: JSON.stringify(c.state), draft: c.draft, generation: c.generation,
            loaded: c.loaded, composing: c.composing, pending: c.pending, pendingWrite: c.pendingWrite, readError: c.readError,
            writeError: c.writeError, conflict: c.conflict, status: c.status,
            nodes: Object.fromEntries(Object.entries(h.nodes).map(([key, node]) => [key, { value: node.value, text: node.textContent, hidden: node.hidden, disabled: node.disabled, readOnly: node.readOnly, attributes: { ...node.attributes } }])) } };
}
function same(h, before) { const after = snapshot(h); for (const key of ['state', 'error', 'timer']) assert.equal(after[key] === before[key], true, key + ' identity'); assert.deepEqual(after.values, before.values); }
function onceGet(h, object, key, action) {
    const own = Object.getOwnPropertyDescriptor(object, key), value = object[key];
    const restore = () => { if (own) Object.defineProperty(object, key, own); else delete object[key]; };
    h.restores.push(restore); Object.defineProperty(object, key, { configurable: true, get() { restore(); action(); return value; }, set(next) { restore(); object[key] = next; } });
}
function transfer(h, node, target) {
    const parent = node.parentElement, document = node.ownerDocument;
    // The unchanged shared model needs explicit unlink and recursive adoption.
    const place = (next, doc) => { node.remove(); const adopt = n => { n.ownerDocument = doc; n.children.forEach(adopt); }; adopt(node); next?.append(node); };
    place(target, target.ownerDocument); assert.equal(parent?.children.includes(node), false);
    h.restores.push(() => place(parent, document));
}
const replacements = {
    controller: (h, f) => { h.view.controller = f.controller; }, store: (h, f) => { h.controller.store = f.store; },
    backend: (h, f) => { h.store.backend = f.backend; }, host: (h, f) => { h.view.host = f.host; },
    ...Object.fromEntries(['textarea', 'status', 'savedPreview', 'savedLabel', 'retry', 'useSaved', 'replace', 'count', 'copyStatus', 'copyButton', 'copySavedButton', 'findStatus', 'importPanel'].map(name => [name, (h, f) => { h.view[name] = f.nodes[name]; }]))
};
const metadata = {
    workspace: h => { h.backend.workspace = { ...h.backend.workspace }; },
    workspaceId: h => { h.backend.workspace.id = 'new-id'; }, workspaceGeneration: h => { h.backend.workspace.generation = 'new-generation'; },
    session: h => { h.window.LocalItabWorkspaces.session = {}; },
    lateWorkspace: h => { h.backend.workspace = { id: 'late', generation: 'late' }; h.window.LocalItabWorkspaces = { session: h.backend.workspace }; }
};
async function prepared(t, action, options = {}) { const h = await model(t, options); if (action === 'retry') await h.failWrite(); else await h.conflict(); return h; }
for (const action of Object.keys(methods)) for (const [name, change] of Object.entries(replacements)) test(`recovery admission: ${action} refuses construction ${name} replacement`, async t => {
    const h = await prepared(t, action, { workspace: true }), f = await h.foreign(); const original = snapshot(h), foreign = snapshot(f);
    change(h, f); h.click(action); await h.settle(); same(h, original); same(f, foreign); assert.deepEqual(h.calls, []); assert.deepEqual(f.calls, []);
});
for (const action of Object.keys(methods)) for (const name of ['host', 'wrapper', 'textarea', 'status', 'savedPreview', 'retry', 'useSaved', 'replace', 'controls']) for (const cross of [false, true]) test(`recovery ownership: ${action} rejects ${cross ? 'cross' : 'same'}-document ${name} transfer`, async t => {
    const h = await prepared(t, action), document = cross ? createDocument() : h.document, target = document.createElement('aside'); document.body.append(target);
    transfer(h, name === 'controls' ? h.nodes.retry.parentElement : h[name] || h.nodes[name], target); const before = snapshot(h);
    h.click(action); await h.settle(); same(h, before); assert.deepEqual(h.calls, []);
});
for (const action of Object.keys(methods)) for (const field of ['target', 'currentTarget']) test(`recovery event: ${action} rejects foreign ${field}`, async t => {
    const h = await prepared(t, action), f = await h.foreign(), before = snapshot(h); h.click(action, { [field]: f.nodes[action] }); await h.settle(); same(h, before); assert.deepEqual(h.calls, []);
});
for (const action of Object.keys(methods)) test(`recovery event: ${action} rejects a descendant impersonating its original button`, async t => {
    const h = await prepared(t, action), child = h.document.createElement('span'); h.nodes[action].append(child); const before = snapshot(h);
    child.dispatch('click'); await h.settle(); same(h, before); assert.deepEqual(h.calls, []);
});
for (const action of Object.keys(methods)) for (const [name, change] of Object.entries({ ...replacements, ...metadata })) test(`recovery method lookup: ${action} rechecks ${name} before dispatch`, async t => {
    const h = await prepared(t, action, { workspace: true }), f = await h.foreign(), before = snapshot(h), foreign = snapshot(f);
    onceGet(h, h.controller, methods[action], () => change(h, f)); h.click(action); await h.settle(); same(h, before); same(f, foreign); assert.deepEqual(h.calls, []); assert.deepEqual(f.calls, []);
});
for (const action of Object.keys(methods)) for (const field of ['parentElement', 'ownerDocument']) test(`recovery metadata: ${action} stale ${field} cannot authorize transferred button`, async t => {
    const h = await prepared(t, action), f = await h.foreign(), before = snapshot(h);
    onceGet(h, h.nodes[action], field, () => transfer(h, h.nodes[action], f.host)); h.click(action); await h.settle(); same(h, before); assert.deepEqual(h.calls, []);
});
for (const action of Object.keys(methods)) for (const name of ['host', 'textarea', 'status', 'button']) test(`recovery method lookup: ${action} DOM transfer of ${name} stops dispatch`, async t => {
    const h = await prepared(t, action), f = await h.foreign(), before = snapshot(h);
    onceGet(h, h.controller, methods[action], () => transfer(h, name === 'button' ? h.nodes[action] : h[name] || h.nodes[name], f.host));
    h.click(action); await h.settle(); same(h, before); assert.deepEqual(h.calls, []);
});
for (const action of Object.keys(methods)) for (const [name, change] of Object.entries(metadata)) test(`recovery source: ${action} rejects completed ${name} substitution and resumes only after exact restoration`, async t => {
    const h = await prepared(t, action, { workspace: name !== 'lateWorkspace' }), f = await h.foreign();
    const workspace = h.backend.workspace, id = workspace?.id, generation = workspace?.generation, namespace = h.window.LocalItabWorkspaces, session = namespace?.session;
    const before = snapshot(h), foreign = snapshot(f); change(h); h.click(action); await h.settle(); same(h, before); same(f, foreign); assert.deepEqual(h.calls, []);
    h.backend.workspace = workspace; if (workspace) { workspace.id = id; workspace.generation = generation; }
    h.window.LocalItabWorkspaces = namespace; if (namespace) namespace.session = session;
    h.click(action); await h.settle(); assert.deepEqual(h.calls, [methods[action]]); assert.equal(h.controller.error, null); assert.equal(h.controller.conflict, false);
    assert.equal(h.controller.draft, action === 'useSaved' ? SAVED : DRAFT); assert.equal(JSON.parse(h.bytes()).content, action === 'useSaved' ? SAVED : DRAFT);
    assert.equal(h.io.writes - before.values.io.writes, action === 'useSaved' ? 0 : 1); same(f, foreign);
});
for (const outer of Object.keys(methods)) for (const inner of Object.keys(methods)) test(`recovery reentry: newer ${inner} click supersedes ${outer} method lookup`, async t => {
    const h = await prepared(t, 'replace'); onceGet(h, h.controller, methods[outer], () => h.click(inner)); h.click(outer); await h.settle();
    assert.deepEqual(h.calls, [methods[inner]]); assert.equal(h.io.writes, inner === 'replace' ? 2 : 1);
    assert.equal(h.controller.draft, inner === 'useSaved' ? SAVED : DRAFT);
});
for (const action of Object.keys(methods)) for (const mode of ['direct draft', 'editor input', 'compositionstart', 'direct useSaved', 'direct retry', 'direct replace']) test(`recovery reentry: ${action} cannot overtake ${mode} from method getter`, async t => {
    const h = await prepared(t, 'replace'); onceGet(h, h.controller, methods[action], () => {
        if (mode === 'direct draft') h.controller.setDraft('newer exact draft');
        if (mode === 'editor input') { h.nodes.textarea.value = 'newer exact draft'; h.nodes.textarea.dispatch('input'); }
        if (mode === 'compositionstart') h.nodes.textarea.dispatch('compositionstart');
        if (mode.startsWith('direct ') && !mode.endsWith('draft')) h.controller[methods[mode.slice(7)]]();
    });
    h.click(action); await h.settle();
    assert.deepEqual(h.calls, mode.startsWith('direct ') && !mode.endsWith('draft') ? [methods[mode.slice(7)]] : []);
    if (mode.endsWith('draft') || mode === 'editor input') assert.equal(h.controller.draft, 'newer exact draft');
    if (mode === 'compositionstart') assert.equal(h.controller.composing, true);
});
for (const action of Object.keys(methods)) for (const stage of ['before click', 'method getter']) test(`recovery lifetime: ${action} cannot revive privately retired View at ${stage}`, async t => {
    const h = await prepared(t, action), listener = h.nodes[action].listeners.get('click')[0];
    const retire = () => { h.view.destroy(); h.view.closed = false; h.controller.closed = false; h.clear(); };
    if (stage === 'before click') retire(); else onceGet(h, h.controller, methods[action], retire);
    const bytes = h.bytes(), io = { ...h.io }; listener({ target: h.nodes[action], currentTarget: h.nodes[action] }); await h.settle();
    assert.deepEqual(h.calls, []); assert.equal(h.bytes(), bytes); assert.deepEqual(h.io, io);
});
for (const action of Object.keys(methods)) for (const state of ['hidden host', 'detached host', 'detached button', 'detached editor', 'hidden document', 'disabled button', 'readonly editor', 'inert host', 'disabled module', 'suspended flag', 'invalidated flag']) test(`recovery compatibility: ${action} retains original ${state} admission`, async t => {
    const h = await prepared(t, action, { workspace: true, enabled: state !== 'disabled module' });
    if (state === 'hidden host') h.host.hidden = true; if (state === 'detached host') h.host.remove(); if (state === 'detached button') h.nodes[action].remove();
    if (state === 'detached editor') h.nodes.textarea.remove(); if (state === 'hidden document') h.document.hidden = true;
    if (state === 'disabled button') h.nodes[action].disabled = true; if (state === 'readonly editor') h.nodes.textarea.readOnly = true; if (state === 'inert host') h.host.inert = true;
    if (state === 'suspended flag') h.backend.workspace._suspended = true; if (state === 'invalidated flag') h.backend.workspace.invalidated = true;
    h.click(action); await h.settle(); assert.deepEqual(h.calls, [methods[action]]); assert.equal(h.controller.error, null); assert.equal(h.controller.conflict, false);
    assert.equal(h.controller.draft, action === 'useSaved' ? SAVED : DRAFT); assert.equal(JSON.parse(h.bytes()).content, action === 'useSaved' ? SAVED : DRAFT);
});
test('recovery Retry: lost acknowledgement recognizes exact committed bytes without a second write', async t => {
    const h = await model(t); await h.failWrite(true); const before = { ...h.io }; assert.equal(JSON.parse(h.bytes()).content, DRAFT);
    h.click('retry'); await h.settle(); assert.deepEqual(h.calls, ['retry']); assert.equal(h.io.writes, before.writes); assert.equal(h.controller.state.content, DRAFT);
    assert.equal(h.controller.draft, DRAFT); assert.equal(h.controller.writeError, false); assert.equal(h.controller.conflict, false); assert.equal(h.controller.error, null);
});
for (const phase of ['initial read error', 'passive read error', 'dirty read error']) test(`recovery Retry: ${phase} uses actual original read and preserves intended draft`, async t => {
    const h = await model(t, { readFailure: phase === 'initial read error' });
    if (phase !== 'initial read error') { if (phase === 'dirty read error') { h.controller.setDraft(DRAFT); h.controller.cancelTimer(); } h.backend.failRead = true; await assert.rejects(h.controller.refresh(), { code: 'READ' }); }
    assert(h.controller.readError); h.backend.failRead = false; h.clear(); h.click('retry'); await h.settle();
    assert.deepEqual(h.calls, ['retry']); assert.equal(h.controller.readError, false); assert.equal(h.controller.error, null);
    assert.equal(h.controller.draft, phase === 'dirty read error' ? DRAFT : TEXT); assert.equal(h.io.writes, phase === 'dirty read error' ? 1 : 0);
});
for (const action of Object.keys(methods)) test(`recovery actual pending: ${action} delegates existing pending gate without duplicate storage`, async t => {
    const h = await model(t); h.controller.setDraft(DRAFT); h.backend.writeGate = deferred(); h.backend.writeEntered = deferred(); const pending = h.controller.save(); await h.backend.writeEntered.promise;
    assert(h.controller.pendingWrite); h.clear(); const before = { ...h.io }; h.click(action); await tick(); assert.deepEqual(h.calls, [methods[action]]); assert.deepEqual(h.io, before);
    h.backend.writeGate.resolve(); await pending; await h.settle(); assert.equal(JSON.parse(h.bytes()).content, DRAFT); assert.equal(h.controller.pending, false);
});
for (const action of Object.keys(methods)) test(`recovery real IME: ${action} retains Controller composition semantics`, async t => {
    const h = await prepared(t, action); h.nodes.textarea.dispatch('compositionstart'); const before = { ...h.io }; h.clear(); h.click(action); await h.settle();
    assert.deepEqual(h.calls, [methods[action]]); assert.equal(h.controller.composing, true); assert.equal(h.controller.draft, DRAFT); assert.equal(h.io.writes, before.writes);
    if (action === 'useSaved') assert.equal(h.controller.conflict, true);
    h.nodes.textarea.dispatch('compositionend'); h.controller.cancelTimer();
});
test('recovery Use saved: exact saved text replaces the draft without programmatic focus or selection', async t => {
    const h = await prepared(t, 'useSaved'); const focus = h.document.createElement('input'); h.document.body.append(focus); focus.focus(); let focusCalls = 0;
    const original = h.nodes.textarea.focus; h.nodes.textarea.focus = function () { focusCalls++; return original.call(this); };
    h.nodes.textarea.selectionStart = 3; h.nodes.textarea.selectionEnd = 7; h.click('useSaved'); await h.settle();
    assert.equal(h.controller.draft, SAVED); assert.equal(h.nodes.textarea.value, SAVED); assert.equal(h.document.activeElement === focus, true); assert.equal(focusCalls, 0);
    assert.equal(h.nodes.textarea.selectionStart, 3); assert.equal(h.nodes.textarea.selectionEnd, 7); assert.equal(h.io.writes, 1);
});
test('recovery Use saved: permitted without conflict and rejects a real failed read without discarding draft', async t => {
    const h = await model(t); h.controller.setDraft(DRAFT); h.controller.cancelTimer(); assert.equal(h.controller.conflict, false);
    h.backend.failRead = true; h.click('useSaved'); await h.settle(); assert.equal(h.controller.error.code, 'READ'); assert.equal(h.controller.draft, DRAFT); assert.equal(h.io.writes, 0);
    h.backend.failRead = false; h.clear(); h.click('useSaved'); await h.settle(); assert.deepEqual(h.calls, ['useSaved']); assert.equal(h.controller.draft, TEXT); assert.equal(h.controller.error, null);
});
test('recovery Use saved: a genuine newer editor draft while reading remains owned and conflicted', async t => {
    const h = await prepared(t, 'useSaved'); h.backend.readGate = deferred(); h.backend.readEntered = deferred(); h.click('useSaved'); await h.backend.readEntered.promise;
    h.nodes.textarea.value = 'newer while reading'; h.nodes.textarea.dispatch('input'); h.backend.readGate.resolve(); await h.settle();
    assert.equal(h.controller.draft, 'newer while reading'); assert.equal(h.controller.conflict, true); assert.equal(h.controller.state.content, SAVED); assert.equal(h.io.writes, 1);
});
test('recovery Replace: actual intervening saved revision conflicts, then explicit second replace uses latest CAS', async t => {
    const h = await prepared(t, 'replace'); h.backend.quiet = true;
    await new api.Store(h.backend).mutate({ kind: 'content', value: 'intervening real saved version', revision: 5 }); assert.equal(h.controller.state.revision, 5);
    const before = h.io.writes; h.click('replace'); await h.settle(); assert.equal(h.io.writes, before); assert.equal(h.controller.error.code, 'CONFLICT');
    assert.equal(h.controller.conflict, true); assert.equal(h.controller.draft, DRAFT); assert.equal(h.controller.state.revision, 6); assert.equal(h.controller.state.content, 'intervening real saved version');
    h.clear(); h.click('replace'); await h.settle(); assert.equal(h.io.writes, before + 1); assert.equal(h.controller.state.revision, 7); assert.equal(JSON.parse(h.bytes()).content, DRAFT); assert.equal(h.controller.conflict, false);
});
test('recovery Replace: real read error keeps draft and rejects a new write until Retry', async t => {
    const h = await prepared(t, 'replace'); h.backend.failRead = true; await assert.rejects(h.controller.refresh(), { code: 'READ' }); const before = { ...h.io }; h.clear();
    h.click('replace'); await h.settle(); assert.deepEqual(h.calls, ['replaceWithDraft']); assert.deepEqual(h.io, before); assert.equal(h.controller.draft, DRAFT);
    h.backend.failRead = false; h.click('retry'); await h.settle(); assert.equal(h.controller.readError, false); assert.equal(h.controller.conflict, true); h.click('replace'); await h.settle(); assert.equal(JSON.parse(h.bytes()).content, DRAFT);
});
for (const action of Object.keys(methods)) for (const mode of ['suspend', 'invalidate']) test(`recovery real Session: ${action} reports original ${mode} failure, not a foreign request`, async t => {
    const entry = { id: 'original', generation: 'g1', deletedAt: null }; let raw = api.validate({ ...api.initial(), enabled: true, revision: 4, content: TEXT });
    let writes = 0; const manager = { chrome: { storage: { onChanged: { addListener() {} } } }, subscribe() {}, async ready() {},
        async registry() { return { lastUsedId: entry.id, workspaces: [structuredClone(entry)] }; }, locks: { request(name, options, fn) { return Promise.resolve().then(fn); } },
        async assertRestoreSettled() {}, async readBundle() { return { [api.KEY]: structuredClone(raw) }; }, async writeBundle(entry, next) { writes++; raw = structuredClone(next[api.KEY]); } };
    const session = new Workspaces.Session(manager, entry.id); await session.ready(); const h = await model(t, { backend: api.createChromeBackend(null, null, session) });
    h.controller.setDraft(DRAFT); h.controller.cancelTimer(); if (action === 'replace') { await new api.Store(h.backend).mutate({ kind: 'content', value: SAVED, revision: 4 }); await h.controller.refresh(); assert(h.controller.conflict); }
    const before = writes; if (mode === 'suspend') session.suspendWrites(); else entry.generation = 'g2'; h.clear(); h.click(action); await h.settle();
    assert.deepEqual(h.calls, [methods[action]]); assert.equal(h.controller.error.code, mode === 'suspend' ? 'WORKSPACE_SWITCH_PENDING' : 'WORKSPACE_INVALIDATED');
    assert.equal(h.controller.draft, DRAFT); assert.equal(writes, before);
});
for (const action of Object.keys(methods)) for (const stage of ['view controller', 'button document', 'event target']) for (const newer of ['draft', 'composition']) test(`recovery admission reentry: ${action} cannot overtake newer ${newer} from ${stage}`, async t => {
    const h = await prepared(t, action), event = { target: h.nodes[action], currentTarget: h.nodes[action] };
    const change = () => { if (newer === 'draft') h.controller.setDraft('newer admission draft'); else h.controller.setComposing(true); };
    if (stage === 'view controller') onceGet(h, h.view, 'controller', change);
    else if (stage === 'button document') onceGet(h, h.nodes[action], 'ownerDocument', change);
    else onceGet(h, event, 'target', change);
    h.nodes[action].listeners.get('click')[0](event); await h.settle(); assert.deepEqual(h.calls, []);
    assert.equal(h.controller.draft, newer === 'draft' ? 'newer admission draft' : DRAFT); assert.equal(h.controller.composing, newer === 'composition');
});
for (const action of Object.keys(methods)) test(`recovery foreign access: ${action} never reads substituted Controller fields or methods`, async t => {
    const h = await prepared(t, action), f = await h.foreign(), before = snapshot(h), foreign = snapshot(f); let reads = 0; const restore = [];
    for (const key of ['state', 'draft', 'store', 'error', 'pending', 'closed', ...Object.values(methods)]) {
        const descriptor = Object.getOwnPropertyDescriptor(f.controller, key); const value = f.controller[key];
        Object.defineProperty(f.controller, key, { configurable: true, get() { reads++; return value; }, set() { throw Error('foreign write'); } });
        restore.push(() => Object.defineProperty(f.controller, key, descriptor));
    }
    h.view.controller = f.controller; h.click(action); await h.settle(); restore.forEach(fn => fn());
    assert.equal(reads, 0); assert.deepEqual(f.calls, []); same(h, before); same(f, foreign); assert.deepEqual(h.calls, []);
});
for (const action of Object.keys(methods)) test(`recovery unavailable original: ${action} respects genuine closed Controller without consulting its method`, async t => {
    const h = await prepared(t, action); h.controller.destroy(); h.clear(); const before = snapshot(h); h.click(action); await h.settle(); same(h, before); assert.deepEqual(h.calls, []);
});
