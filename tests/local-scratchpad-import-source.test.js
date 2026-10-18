const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const api = require('../shared/local-scratchpad-store');
const { Controller } = require('../shared/local-scratchpad-controller');
const tick = () => new Promise(resolve => setImmediate(resolve));
const ORIGINAL = '\uFEFF Original 中文 😀 e\u0301\r\n<script>literal</script>\rEnd\n';
const IMPORTED = '\uFEFF \tImported 中文 🪷 e\u0301\r\n<img>literal</img>\rEnd\n\n';
const importNodes = ['textarea', 'importButton', 'importFile', 'importPanel', 'importInfo', 'importPreview', 'importAppend', 'importApply', 'importCancel'];
// Public fields and synchronous getter/setter callbacks are robustness probes,
// not ordinary workspace navigation or an explanation of historical data loss.
async function model(t, options = {}) {
    const document = options.document || createDocument({ blurUnavailableFocus: true }), hooks = new Map(), effects = [], clicks = [];
    const call = (name, ...args) => { const fn = hooks.get(name); if (fn) { hooks.delete(name); return fn(...args); } };
    let queue = Promise.resolve(), raw = api.validate({ ...api.initial(), revision: 4, enabled: options.enabled !== false, content: options.content ?? ORIGINAL });
    const subscriptions = new Set(), io = { locks: 0, reads: 0, writes: 0, commits: 0, mutations: 0 };
    const backend = {
        lock(fn) { io.locks++; const p = queue.then(fn); queue = p.catch(() => {}); return p; },
        async read() { io.reads++; if (backend.readGate) await backend.readGate.promise; if (backend.readError) throw Error('Synthetic read failure'); return structuredClone(raw); },
        async write(next) { io.writes++; if (backend.writeGate) { backend.writeEntered.resolve(); await backend.writeGate.promise; }
            if (backend.writeError) throw Error('Synthetic write failure'); if (!backend.dropWrite) { raw = structuredClone(next); io.commits++; }
            for (const fn of subscriptions) fn(); if (backend.ackError) throw Error('Synthetic lost acknowledgement'); },
        subscribe(fn) { subscriptions.add(fn); return () => subscriptions.delete(fn); }
    };
    if (options.workspace) backend.workspace = { id: 'original-workspace', generation: 'original-generation' };
    if (options.loading) backend.readGate = deferred();
    if (options.readError) backend.readError = true;
    const store = new api.Store(backend), originalMutate = store.mutate;
    store.mutate = function (...args) { io.mutations++; return originalMutate.apply(this, args); };
    const controller = new Controller(store, { delay: 60000 });
    const window = { LocalItabScratchpad: { ...api },
        TextDecoder: class extends TextDecoder { constructor(...args) { call('decoder'); super(...args); } decode(...args) { call('decode'); return super.decode(...args); } },
        Blob: class extends Blob { constructor(...args) { call('blob'); super(...args); } },
        i18n: { t(key) { call('translate:' + key); return key; } },
        addEventListener() {}, removeEventListener() {},
        navigator: { clipboard: { writeText() { effects.push('clipboard write'); }, readText() { effects.push('clipboard read'); } }, permissions: { query() { effects.push('permission'); } } },
        fetch() { effects.push('network'); }, URL: { createObjectURL() { effects.push('download'); }, revokeObjectURL() {} }, setTimeout() {}
    };
    if (options.workspace) window.LocalItabWorkspaces = { session: backend.workspace };
    document.execCommand = () => effects.push('fallback');
    const create = document.createElement;
    document.createElement = tag => { const node = create(tag); node.click = function () { assert.equal(this, node); clicks.push(node); call('click'); node.dispatch('click'); }; return node; };
    vm.runInNewContext(fs.readFileSync(process.env.SCRATCHPAD_VIEW_SOURCE || path.join(__dirname, '../shared/local-scratchpad-view.js'), 'utf8'), { window, document });
    const wrapper = document.createElement('main'), host = document.createElement('article'), neutral = document.createElement('input');
    document.body.append(wrapper, neutral); wrapper.append(host);
    const view = new window.LocalItabScratchpad.View(host, { controller }), nodes = Object.fromEntries(Object.entries(view).filter(([, node]) => node?.tagName));
    const h = { document, window, wrapper, host, neutral, controller, store, backend, view, nodes, io, effects, clicks, hooks, call,
        bytes: () => JSON.stringify(raw), raw: () => structuredClone(raw),
        async foreign(sameDocument = false) { return model(t, { document: sameDocument ? document : undefined, content: 'Foreign saved text 😀' }); } };
    t.after(async () => { hooks.clear(); backend.readGate?.resolve(); backend.writeGate?.resolve(); await tick();
        Object.assign(view, nodes, { controller }); controller.store = store; store.backend = backend; try { view.destroy(); } catch (_) {} controller.destroy(); });
    await tick(); neutral.focus(); return h;
}
function snapshot(h) {
    const c = h.controller;
    return { raw: h.bytes(), io: { ...h.io }, state: c.state, stateText: JSON.stringify(c.state), draft: c.draft, generation: c.generation,
        error: c.error, readError: c.readError, writeError: c.writeError, conflict: c.conflict, pending: c.pending, pendingWrite: c.pendingWrite,
        composing: c.composing, status: c.status, editor: h.nodes.textarea.value, saved: h.nodes.savedPreview.value, feedback: h.nodes.status.textContent };
}
function same(h, before) {
    const after = snapshot(h); assert.equal(after.state === before.state, true, 'state identity'); delete after.state; before = { ...before }; delete before.state;
    assert.deepEqual(after, before); assert.deepEqual(h.effects, []);
}
function ui(node) { return { value: node.value, text: node.textContent, hidden: node.hidden, checked: node.checked, disabled: node.disabled }; }
function move(node, parent, document = parent?.ownerDocument) {
    const original = { parent: node.parentElement, document: node.ownerDocument }; node.remove();
    if (document) { const adopt = n => { n.ownerDocument = document; n.children.forEach(adopt); }; adopt(node); }
    parent?.append(node); return () => move(node, original.parent, original.document);
}
function onceProperty(node, property, callback, getter = false) {
    let value = node[property], armed = true;
    Object.defineProperty(node, property, { configurable: true, get() { const result = value; if (getter && armed) { armed = false; callback(); } return result; },
        set(next) { value = next; if (!getter && armed) { armed = false; callback(); } } });
}
function file(h, text = IMPORTED, overrides = {}) {
    const bytes = new TextEncoder().encode(text);
    return { name: 'synthetic.txt', size: bytes.length, arrayBuffer: async () => bytes.buffer, ...overrides };
}
async function preview(h, text = IMPORTED, overrides = {}) { h.view.chooseImport(); h.nodes.importFile.files = [file(h, text, overrides)]; await h.view.readImport(); }
function pending(h) {
    const gate = deferred(); h.view.chooseImport(); h.nodes.importFile.files = [file(h, IMPORTED, { arrayBuffer: () => gate.promise })];
    const done = h.view.readImport(); return { done, resolve: () => gate.resolve(new TextEncoder().encode(IMPORTED).buffer) };
}
const substitutions = {
    controller(h, f) { h.view.controller = f.controller; return () => { h.view.controller = h.controller; }; },
    store(h, f) { h.controller.store = f.store; return () => { h.controller.store = h.store; }; },
    backend(h, f) { h.store.backend = f.backend; return () => { h.store.backend = h.backend; }; },
    host(h, f) { h.view.host = f.host; return () => { h.view.host = h.host; }; },
    ...Object.fromEntries(importNodes.map(name => [name, (h, f) => { h.view[name] = f.nodes[name]; return () => { h.view[name] = h.nodes[name]; }; }])),
    workspace(h) { const value = h.backend.workspace; h.backend.workspace = { ...value }; return () => { h.backend.workspace = value; }; },
    workspaceId(h) { const value = h.backend.workspace.id; h.backend.workspace.id = 'foreign'; return () => { h.backend.workspace.id = value; }; },
    workspaceGeneration(h) { const value = h.backend.workspace.generation; h.backend.workspace.generation = 'foreign'; return () => { h.backend.workspace.generation = value; }; },
    session(h) { const value = h.window.LocalItabWorkspaces.session; h.window.LocalItabWorkspaces.session = { ...value }; return () => { h.window.LocalItabWorkspaces.session = value; }; }
};
for (const [name, change] of Object.entries(substitutions)) test(`import admission: construction ${name} replacement cannot open a chooser`, async t => {
    const h = await model(t, { workspace: true }), f = await h.foreign(), before = snapshot(h), other = snapshot(f), old = Object.fromEntries(importNodes.map(key => [key, ui(f.nodes[key])]));
    const restore = change(h, f); h.view.chooseImport(); assert.equal(h.clicks.length, 0); assert.equal(f.clicks.length, 0); same(h, before); same(f, other);
    for (const key of importNodes) assert.deepEqual(ui(f.nodes[key]), old[key]); restore(); h.view.chooseImport(); assert.equal(h.clicks.length, 1);
});
for (const [name, change] of Object.entries(substitutions)) for (const phase of ['read', 'apply']) test(`import ownership: ${phase} rejects ${name} substitution`, async t => {
    const h = await model(t, { workspace: true }), f = await h.foreign(); let p;
    if (phase === 'read') p = pending(h); else await preview(h);
    const before = snapshot(h), other = snapshot(f), old = Object.fromEntries(importNodes.map(key => [key, ui(f.nodes[key])])); change(h, f);
    if (p) { p.resolve(); await p.done; } else h.view.applyImport(); await tick(); same(h, before); same(f, other);
    for (const key of importNodes) assert.deepEqual(ui(f.nodes[key]), old[key]);
    assert.notEqual(h.nodes.importPreview.textContent, IMPORTED, 'stale preview must not remain actionable');
});
for (const kind of ['same-document', 'cross-document']) for (const name of [...importNodes, 'host', 'wrapper']) test(`import targets: ${kind} ${name} transfer protects new owner`, async t => {
    const h = await model(t), f = await h.foreign(kind === 'same-document'); await preview(h);
    const node = h[name] || h.nodes[name]; move(node, f.host); node.textContent = 'NEW OWNER'; node.value = 'NEW VALUE'; node.hidden = false; node.disabled = false; node.checked = true;
    const before = snapshot(h), other = snapshot(f), target = ui(node); h.view.applyImport(); h.view.cancelImport(true); await tick(); same(h, before); same(f, other); assert.deepEqual(ui(node), target);
});
for (const phase of ['chooser', 'reading', 'preview']) test(`import public receipt: foreign replacement during ${phase} cannot authorize payload or clean foreign UI`, async t => {
    const h = await model(t), f = await h.foreign(); await preview(f, 'FOREIGN import'); let p;
    if (phase === 'chooser') h.view.chooseImport(); if (phase === 'reading') p = pending(h); if (phase === 'preview') await preview(h);
    const other = snapshot(f), before = snapshot(h), foreignUI = ui(f.nodes.importPreview); h.view.importSession = f.view.importSession;
    if (p) { p.resolve(); await p.done; } h.view.applyImport(); await tick(); same(h, before); same(f, other); assert.deepEqual(ui(f.nodes.importPreview), foreignUI);
});
for (const property of ['text', 'name', 'state', 'generation']) test(`import public receipt: changing ${property} cannot authorize a forged confirmation`, async t => {
    const h = await model(t); await preview(h); const before = snapshot(h);
    h.view.importSession[property] = property === 'state' ? { ...h.controller.state } : property === 'generation' ? h.controller.generation + 1 : 'FORGED';
    h.view.applyImport(); await tick(); same(h, before);
});
for (const stage of ['files', 'file name', 'file size', 'arrayBuffer getter', 'arrayBuffer call', 'decoder', 'decode', 'blob', 'reading translation', 'preview label translation', 'cancel focus']) for (const loss of ['controller', 'target', 'new edit']) test(`import callback: ${stage} ${loss} cannot publish or confirm stale content`, async t => {
    const h = await model(t), f = await h.foreign(); h.view.chooseImport(); let expected, target;
    const lose = () => {
        if (loss === 'controller') h.view.controller = f.controller;
        if (loss === 'target') { move(h.nodes.importPreview, f.host); h.nodes.importPreview.textContent = 'NEW OWNER'; target = ui(h.nodes.importPreview); }
        if (loss === 'new edit') { h.controller.setDraft('Newer genuine edit 😀'); h.controller.cancelTimer(); }
        expected = snapshot(h);
    };
    const chosen = file(h); h.nodes.importFile.files = [chosen];
    if (stage === 'files') onceProperty(h.nodes.importFile, 'files', lose, true);
    if (stage === 'file name') onceProperty(chosen, 'name', lose, true);
    if (stage === 'file size') onceProperty(chosen, 'size', lose, true);
    if (stage === 'arrayBuffer getter') onceProperty(chosen, 'arrayBuffer', lose, true);
    if (stage === 'arrayBuffer call') chosen.arrayBuffer = async () => { lose(); return new TextEncoder().encode(IMPORTED).buffer; };
    if (['decoder', 'decode', 'blob'].includes(stage)) h.hooks.set(stage, lose);
    if (stage === 'reading translation') h.hooks.set('translate:scratchpadImportReading', lose);
    if (stage === 'preview label translation') h.hooks.set('translate:scratchpadImportReplace', lose);
    if (stage === 'cancel focus') { const focus = h.nodes.importCancel.focus; h.nodes.importCancel.focus = function () { focus.call(this); lose(); }; }
    const other = snapshot(f); await h.view.readImport(); h.view.applyImport(); await tick(); assert(expected, 'hook executed'); same(h, expected); same(f, other); if (target) assert.deepEqual(ui(h.nodes.importPreview), target);
});
for (const stage of ['label', 'append checked', 'append disabled', 'panel hidden', 'preview text', 'info text', 'file value']) for (const loss of ['controller', 'target', 'new edit', 'new chooser']) test(`import cancellation: ${stage} ${loss} cannot redirect cleanup or Apply`, async t => {
    const h = await model(t), f = await h.foreign(); await preview(h); let expected, target, newer;
    const lose = () => {
        if (loss === 'controller') h.view.controller = f.controller;
        if (loss === 'target') { move(h.nodes.importInfo, f.host); h.nodes.importInfo.textContent = 'NEW OWNER'; target = ui(h.nodes.importInfo); }
        if (loss === 'new edit') { h.controller.setDraft('Newer draft during cancellation'); h.controller.cancelTimer(); }
        if (loss === 'new chooser') { h.view.chooseImport(); newer = h.view.importSession; }
        expected = snapshot(h);
    };
    if (stage === 'label') h.hooks.set('translate:scratchpadImportReplace', lose);
    else { const [name, property] = { 'append checked': ['importAppend', 'checked'], 'append disabled': ['importAppend', 'disabled'], 'panel hidden': ['importPanel', 'hidden'], 'preview text': ['importPreview', 'textContent'], 'info text': ['importInfo', 'textContent'], 'file value': ['importFile', 'value'] }[stage]; onceProperty(h.nodes[name], property, lose); }
    const other = snapshot(f); h.view.applyImport(); await tick(); assert(expected, 'hook executed'); same(h, expected); same(f, other); if (target) assert.deepEqual(ui(h.nodes.importInfo), target); if (newer) assert.equal(h.view.importSession === newer, true);
});
for (const stage of ['cancel button focus', 'editor focus', 'setDraft notification']) test(`import application: ${stage} cannot save a replacement Controller or newer draft`, async t => {
    const h = await model(t), f = await h.foreign(); await preview(h); let calls = 0, expected;
    const lose = () => { h.view.controller = f.controller; h.controller.setDraft('newer local edit'); h.controller.cancelTimer(); expected = snapshot(h); };
    if (stage === 'setDraft notification') { const unsubscribe = h.controller.subscribe(() => { unsubscribe(); lose(); }); }
    else { const node = stage === 'editor focus' ? h.nodes.textarea : h.nodes.importButton, focus = node.focus; node.focus = function () { focus.call(this); lose(); }; }
    const save = h.controller.save; h.controller.save = function (...args) { calls++; return save.apply(this, args); };
    const other = snapshot(f); if (stage === 'cancel button focus') h.view.cancelImport(true); else h.view.applyImport();
    await tick(); assert(expected); same(h, expected); same(f, other); assert.equal(calls, 0);
});
for (const change of ['edit undo', 'IME', 'refresh', 'remote content', 'remote hide', 'read failure', 'cancel', 'new chooser', 'new selection', 'destroy reset']) test(`import lifecycle: genuine ${change} permanently retires pending selection`, async t => {
    const h = await model(t), p = pending(h);
    if (change === 'edit undo') { h.controller.setDraft('temporary'); h.controller.setDraft(ORIGINAL); }
    if (change === 'IME') { h.controller.setComposing(true); h.controller.setComposing(false); }
    if (change === 'refresh') await h.controller.refresh();
    if (change.startsWith('remote')) { await new api.Store(h.backend).mutate({ kind: change.endsWith('hide') ? 'visibility' : 'content', value: change.endsWith('hide') ? false : 'Remote note', revision: h.controller.state.revision }); await tick(); }
    if (change === 'read failure') { h.backend.readError = true; await assert.rejects(h.controller.refresh(), { code: 'READ' }); }
    if (change === 'cancel') h.view.cancelImport(true);
    if (change === 'new chooser') h.view.chooseImport();
    if (change === 'new selection') { h.nodes.importFile.files = [file(h, 'NEW selection')]; await h.view.readImport(); }
    if (change === 'destroy reset') { h.view.destroy(); h.view.closed = false; }
    h.controller.cancelTimer(); const before = snapshot(h), oldPreview = h.nodes.importPreview.textContent, receipt = h.view.importSession;
    p.resolve(); await p.done; same(h, before); assert.equal(h.nodes.importPreview.textContent, oldPreview); assert.equal(h.view.importSession === receipt, true);
});
for (const text of [IMPORTED, '', '😀'.repeat(32000)]) test(`import exact positive: ${text.length} UTF-16 units preserve bytes through confirmation`, async t => {
    const h = await model(t); const before = snapshot(h); await preview(h, text); same(h, before); assert.equal(h.nodes.importPreview.textContent, text); assert.equal(h.document.activeElement === h.nodes.importCancel, true);
    h.view.applyImport(); await tick(); assert.equal(h.raw().content, text); assert.equal(h.controller.draft, text); assert.equal(h.document.activeElement === h.nodes.textarea, true); assert.equal(h.io.commits, 1); assert.deepEqual(h.effects, []);
});
for (const [before, after, expected] of [['saved', 'new', 'saved\nnew'], ['saved\r', 'new', 'saved\rnew'], ['saved\r\n', 'new', 'saved\r\nnew'], ['saved', '\nnew', 'saved\nnew'], ['saved', '', 'saved'], ['', IMPORTED, IMPORTED], [ORIGINAL, IMPORTED, ORIGINAL + IMPORTED]]) test(`import append positive: ${JSON.stringify([before, after])}`, async t => {
    const h = await model(t, { content: before }); await preview(h, after); h.nodes.importAppend.checked = true; h.view.renderImportPreview(); assert.equal(h.nodes.importPreview.textContent, expected); assert.equal(h.io.writes, 0);
    h.view.applyImport(); await tick(); assert.equal(h.raw().content, expected); assert.equal(h.controller.draft, expected); assert.equal(h.io.commits, before === expected ? 0 : 1);
});
for (const kind of ['wrong extension', 'multiple', 'preflight bytes', 'returned bytes', 'invalid UTF8', 'character limit', 'read rejection']) test(`import validation: ${kind} retains original note and cannot Apply`, async t => {
    const h = await model(t), before = snapshot(h); let reads = 0; const chosen = file(h, kind === 'character limit' ? 'x'.repeat(32001) : IMPORTED);
    if (kind === 'wrong extension') chosen.name = 'file.html';
    if (kind === 'preflight bytes') chosen.size = api.LIMITS.bytes + 1;
    const read = chosen.arrayBuffer; chosen.arrayBuffer = async () => { reads++; if (kind === 'returned bytes') return new ArrayBuffer(api.LIMITS.bytes + 1); if (kind === 'invalid UTF8') return new Uint8Array([0xC3, 0x28]).buffer; if (kind === 'read rejection') throw Error('Synthetic file failure'); return read(); };
    h.view.chooseImport(); h.nodes.importFile.files = kind === 'multiple' ? [chosen, chosen] : [chosen]; await h.view.readImport(); assert.match(h.nodes.importInfo.textContent, /Could not read/); assert.equal(h.nodes.importApply.disabled, true); h.view.applyImport(); await tick(); same(h, before);
    if (['wrong extension', 'multiple', 'preflight bytes'].includes(kind)) assert.equal(reads, 0);
});
for (const kind of ['write error', 'lost acknowledgement', 'dropped write', 'unseen CAS', 'pending newer draft']) test(`import recovery: real ${kind} retains unchanged Controller and Store semantics`, async t => {
    const h = await model(t); await preview(h); h.nodes.importAppend.checked = true; h.view.renderImportPreview(); const expected = ORIGINAL + IMPORTED;
    if (kind === 'unseen CAS') { h.controller.unsubscribe(); await new api.Store(h.backend).mutate({ kind: 'content', value: 'REMOTE', revision: h.controller.state.revision }); }
    if (kind === 'write error') h.backend.writeError = true;
    if (kind === 'lost acknowledgement') h.backend.ackError = true;
    if (kind === 'dropped write') h.backend.dropWrite = true;
    if (kind === 'pending newer draft') { h.backend.writeGate = deferred(); h.backend.writeEntered = deferred(); }
    h.view.applyImport();
    if (kind === 'pending newer draft') { await h.backend.writeEntered.promise; h.controller.setDraft('NEWER'); h.controller.cancelTimer(); h.backend.writeGate.resolve(); }
    await tick();
    if (kind === 'pending newer draft') { assert.equal(h.raw().content, expected); assert.equal(h.controller.draft, 'NEWER'); assert.equal(h.controller.state.content, expected); h.controller.cancelTimer(); await h.controller.save(); assert.equal(h.raw().content, 'NEWER'); }
    else { assert.equal(h.controller.draft, expected); assert(h.controller.writeError); assert.doesNotMatch(h.nodes.status.textContent, /^Saved/); const commits = h.io.commits;
        h.backend.writeError = h.backend.ackError = h.backend.dropWrite = false; await h.controller.retry();
        if (kind === 'unseen CAS') { assert.equal(h.raw().content, 'REMOTE'); assert(h.controller.conflict); }
        else { assert.equal(h.raw().content, expected); assert.equal(h.io.commits, commits + (kind === 'lost acknowledgement' ? 0 : 1)); assert(!h.controller.hasUncommittedWork()); } }
});
