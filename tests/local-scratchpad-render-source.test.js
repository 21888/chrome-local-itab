const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const api = require('../shared/local-scratchpad-store');
const { Controller } = require('../shared/local-scratchpad-controller');
const tick = () => new Promise(resolve => setImmediate(resolve));
const TEXT = '\uFEFF Original 中文 😀\r\none <b>literal</b>\r';
const DRAFT = ' \tNewer 中文 🪷\r\n<draft>\n';
const SAVED = 'Other saved text\r\n中文 😀\n';
// Actual Stores and Controllers; all text and failures are synthetic. Public
// substitutions/accessors test robustness, not normal workspace navigation.
async function model(t, options = {}) {
    const document = options.document || createDocument(), restores = [], hooks = new Map(), effects = [], requests = [];
    const hook = name => { const action = hooks.get(name); if (action) { hooks.delete(name); action(); } };
    let raw = api.validate({ ...api.initial(), revision: 4, enabled: options.enabled !== false, content: options.text ?? TEXT }), tail = Promise.resolve();
    const io = { reads: 0, writes: 0, commits: 0, locks: 0 }, listeners = new Set();
    const backend = {
        lock(fn) { io.locks++; const result = tail.then(fn); tail = result.catch(() => {}); return result; },
        async read() { io.reads++; if (backend.readGate) await backend.readGate.promise;
            if (backend.failRead) throw Error('synthetic read failure'); return structuredClone(raw); },
        async write(value) { io.writes++; if (backend.writeGate) { backend.writeEntered?.resolve(); await backend.writeGate.promise; }
            if (backend.failWrite) throw Error('synthetic write failure'); raw = structuredClone(value); io.commits++;
            if (!backend.quiet) listeners.forEach(fn => fn()); if (backend.failAck) throw Error('synthetic lost acknowledgement'); },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    };
    if (options.workspace) backend.workspace = { id: 'original', generation: 'g1' };
    if (options.loading) backend.readGate = deferred(); if (options.readFailure) backend.failRead = true;
    const store = new api.Store(backend), controller = new Controller(store, { delay: 60000 });
    const window = { LocalItabScratchpad: { ...api }, i18n: { t(key) { hook('translate:' + key); return key; } },
        addEventListener() {}, removeEventListener() {}, TextDecoder, Blob,
        navigator: { clipboard: { async writeText(value) { effects.push(value); } } } };
    if (options.workspace) window.LocalItabWorkspaces = { session: backend.workspace };
    const create = document.createElement; document.createElement = tag => { const node = create(tag); node.click = () => node.dispatch('click'); return node; };
    vm.runInNewContext(fs.readFileSync(process.env.SCRATCHPAD_VIEW_SOURCE || path.join(__dirname, '../shared/local-scratchpad-view.js'), 'utf8'), { window, document });
    const wrapper = document.createElement('main'), host = document.createElement('article'); document.body.append(wrapper); wrapper.append(host);
    const view = new window.LocalItabScratchpad.View(host, { controller, onVisibility() { hook('visibility'); } });
    const nodes = Object.fromEntries(Object.entries(view).filter(([, node]) => node?.tagName));
    const h = { document, window, wrapper, host, view, nodes, controller, store, backend, io, restores, hooks, effects, requests,
        bytes: () => JSON.stringify(raw), raw: () => structuredClone(raw),
        foreign: same => model(t, { document: same ? document : undefined, text: 'FOREIGN saved text' }),
        pause(action) { const render = view.render; view.render = () => {}; try { action(); } finally { view.render = render; controller.cancelTimer(); } },
        async settle() { await Promise.allSettled(requests); await tick(); controller.cancelTimer(); },
        async conflict() { controller.setDraft(DRAFT); controller.cancelTimer(); await new api.Store(backend).mutate({ kind: 'content', value: SAVED, revision: controller.state.revision }); await tick(); assert(controller.conflict); },
        async failWrite(ack = false) { controller.setDraft(DRAFT); backend[ack ? 'failAck' : 'failWrite'] = true;
            await assert.rejects(controller.save(), { code: 'WRITE' }); await tick(); backend.failWrite = backend.failAck = false; assert(controller.writeError); }
    };
    t.after(async () => { hooks.clear(); while (restores.length) restores.pop()(); backend.readGate?.resolve(); backend.writeGate?.resolve(); await h.settle();
        Object.assign(view, nodes, { host, controller }); controller.store = store; store.backend = backend;
        try { view.destroy(); } catch (_) {} controller.destroy(); });
    await tick(); controller.cancelTimer(); return h;
}
function ui(h) { return Object.fromEntries(Object.entries(h.nodes).map(([name, node]) => [name, {
    value: node.value, text: node.textContent, hidden: node.hidden, disabled: node.disabled, readOnly: node.readOnly,
    attributes: { ...node.attributes }, classes: node.className
}])); }
function data(h) { const c = h.controller; return { state: c.state, error: c.error, bytes: h.bytes(), io: { ...h.io },
    draft: c.draft, generation: c.generation, loaded: c.loaded, pending: c.pending, pendingWrite: c.pendingWrite,
    readError: c.readError, writeError: c.writeError, conflict: c.conflict, composing: c.composing, status: c.status }; }
function sameData(h, expected) { const actual = data(h); assert.equal(actual.state === expected.state, true, 'saved-state identity'); assert.equal(actual.error === expected.error, true, 'error identity'); assert.deepEqual(actual, expected); }
function onceGet(h, object, key, action) {
    const own = Object.getOwnPropertyDescriptor(object, key), value = object[key];
    const restore = () => { if (own) Object.defineProperty(object, key, own); else delete object[key]; };
    h.restores.push(restore); Object.defineProperty(object, key, { configurable: true, get() { restore(); action(); return value; }, set(next) { restore(); object[key] = next; } });
}
function onceCall(h, object, key, action) {
    const original = object[key]; object[key] = function (...args) { object[key] = original;
        assert.equal(this === object, true, key + ' original receiver'); const result = original.apply(this, args); action(); return result; };
    h.restores.push(() => { object[key] = original; });
}
function move(h, node, parent) {
    const oldParent = node.parentElement, oldDocument = node.ownerDocument;
    const place = (target, doc) => { node.remove(); const adopt = n => { n.ownerDocument = doc; n.children.forEach(adopt); }; adopt(node); target?.append(node); };
    place(parent, parent.ownerDocument); h.restores.push(() => place(oldParent, oldDocument));
}
function watchWrites(h) {
    const writes = [];
    for (const [name, node] of Object.entries(h.nodes)) for (const key of ['value', 'textContent', 'hidden', 'disabled', 'readOnly']) {
        const own = Object.getOwnPropertyDescriptor(node, key); let value = node[key];
        Object.defineProperty(node, key, { configurable: true, get() { return value; }, set(next) { writes.push(name + '.' + key); value = next; } });
        h.restores.push(() => { if (own) Object.defineProperty(node, key, own); else { delete node[key]; node[key] = value; } });
    }
    for (const [name, node] of Object.entries(h.nodes)) for (const [object, key] of [[node, 'setAttribute'], [node.classList, 'toggle']]) {
        const original = object[key]; object[key] = function (...args) { writes.push(name + '.' + key); return original.apply(this, args); };
        h.restores.push(() => { object[key] = original; });
    }
    return writes;
}
const names = ['textarea', 'savedPreview', 'savedLabel', 'status', 'retry', 'useSaved', 'replace', 'exportButton',
    'copyButton', 'copySelectionButton', 'copySavedButton', 'copyStatus', 'importButton', 'importFile', 'importPanel',
    'importInfo', 'importPreview', 'importAppend', 'importApply', 'importCancel', 'findButton', 'findSelectionButton',
    'findPanel', 'findInput', 'findPrevious', 'findNext', 'findClose', 'findStatus', 'count'];
const changes = {
    controller: (h, f) => { h.view.controller = f.controller; }, store: (h, f) => { h.controller.store = f.store; },
    backend: (h, f) => { h.store.backend = f.backend; }, host: (h, f) => { h.view.host = f.host; },
    ...Object.fromEntries(names.map(name => [name, (h, f) => { h.view[name] = f.nodes[name]; }])),
    workspace: h => { h.backend.workspace = { ...h.backend.workspace }; }, workspaceId: h => { h.backend.workspace.id = 'new'; },
    workspaceGeneration: h => { h.backend.workspace.generation = 'new'; }, session: h => { h.window.LocalItabWorkspaces.session = {}; }
};
for (const [name, change] of Object.entries(changes)) test(`render admission: construction ${name} replacement cannot repaint either source`, async t => {
    const h = await model(t, { workspace: true }), f = await h.foreign(), original = data(h), foreign = data(f);
    const writes = watchWrites(h), foreignWrites = watchWrites(f); change(h, f); h.view.render();
    assert.deepEqual(writes, []); assert.deepEqual(foreignWrites, []); sameData(h, original); sameData(f, foreign);
});
for (const name of [...names, 'host', 'wrapper', 'controls']) for (const cross of [false, true]) test(`render ownership: ${cross ? 'cross' : 'same'}-document ${name} transfer stops render`, async t => {
    const h = await model(t), f = await h.foreign(!cross), original = data(h), foreign = data(f);
    move(h, name === 'controls' ? h.nodes.retry.parentElement : h[name] || h.nodes[name], f.host);
    const writes = watchWrites(h), foreignWrites = watchWrites(f); h.view.render();
    assert.deepEqual(writes, []); assert.deepEqual(foreignWrites, []); sameData(h, original); sameData(f, foreign);
});
const stages = {
    canImport: (h, action) => onceCall(h, h.view, 'canImport', action),
    countTranslation: (h, action) => h.hooks.set('translate:scratchpadLines', action),
    statusTranslation: (h, action) => h.hooks.set('translate:scratchpadSaved', action),
    renderFind: (h, action) => onceCall(h, h.view, 'renderFind', action)
};
for (const [stage, arm] of Object.entries(stages)) for (const name of ['controller', 'store', 'backend', 'host', 'textarea', 'status', 'count', 'copyButton', 'importButton', 'findStatus', 'workspace', 'session']) test(`render callback: ${stage} rechecks ${name} before continuing`, async t => {
    const h = await model(t, { workspace: true }), f = await h.foreign(), original = data(h), foreign = data(f);
    const writes = watchWrites(h), foreignWrites = watchWrites(f); let reached = false;
    arm(h, () => { reached = true; changeAndClear(); });
    function changeAndClear() { changes[name](h, f); writes.length = foreignWrites.length = 0; }
    h.view.render(); assert(reached); assert.deepEqual(writes, []); assert.deepEqual(foreignWrites, []); sameData(h, original); sameData(f, foreign);
});
for (const [stage, arm] of Object.entries(stages)) for (const name of ['host', 'wrapper', 'textarea', 'status', 'copyButton', 'importButton', 'count']) test(`render callback: ${stage} detects same-document ${name} transfer`, async t => {
    const h = await model(t), f = await h.foreign(true), writes = watchWrites(h); let reached = false;
    arm(h, () => { reached = true; move(h, h[name] || h.nodes[name], f.host); writes.length = 0; }); h.view.render(); assert(reached); assert.deepEqual(writes, []);
});
for (const field of ['parentElement', 'ownerDocument']) for (const name of ['host', 'wrapper', 'textarea', 'status', 'count']) test(`render accessor: stale ${name}.${field} cannot authorize transferred controls`, async t => {
    const h = await model(t), f = await h.foreign(true), writes = watchWrites(h);
    onceGet(h, h[name] || h.nodes[name], field, () => move(h, h[name] || h.nodes[name], f.host)); h.view.render(); assert.deepEqual(writes, []);
});
async function prepareStage(h, stage) {
    if (['importCurrent', 'cancelImport'].includes(stage)) { h.view.chooseImport(); assert(h.view.importSession); if (stage === 'cancelImport') h.pause(() => h.controller.setDraft(DRAFT)); }
    if (['copyCurrent', 'invalidateCopy'].includes(stage)) {
        await h.view.copyText(); assert(h.view.copyReceipt); if (stage === 'invalidateCopy') h.pause(() => h.controller.setDraft(DRAFT));
    }
    if (stage === 'onVisibility') h.view.visible = undefined;
}
for (const stage of ['canImport', 'onVisibility', 'renderFind', 'refreshCopyControl', 'importCurrent', 'cancelImport', 'copyCurrent', 'invalidateCopy']) test(`render method lookup: ${stage} transfer stops invocation and following writes`, async t => {
    const h = await model(t), f = await h.foreign(true); await prepareStage(h, stage);
    const original = h.view[stage]; let calls = 0;
    h.view[stage] = function (...args) { calls++; assert.equal(this === h.view, true); return original.apply(this, args); };
    const writes = watchWrites(h); onceGet(h, h.view, stage, () => { move(h, h.nodes.status, f.host); writes.length = 0; });
    h.view.render(); assert.equal(calls, 0);
    // Rejected render still retires its original owned copy feedback.
    assert.deepEqual(writes, ['copyCurrent', 'invalidateCopy'].includes(stage) ? ['copyStatus.textContent', 'copyStatus.hidden'] : []);
});
for (const stage of ['canImport', 'countTranslation', 'statusTranslation', 'renderFind']) test(`render reentry: newer actual setDraft at ${stage} owns all subsequent UI`, async t => {
    const h = await model(t), writes = watchWrites(h); let expected, reached = false;
    stages[stage](h, () => { reached = true; h.controller.setDraft(DRAFT); h.controller.cancelTimer(); expected = ui(h); writes.length = 0; });
    h.view.render(); assert(reached); assert.equal(h.controller.draft, DRAFT); assert.deepEqual(ui(h), expected); assert.deepEqual(writes, []); assert.match(h.nodes.status.textContent, /Unsaved/);
});
for (const stage of ['canImport', 'renderFind', 'refreshCopyControl', 'onVisibility', 'copyCurrent', 'invalidateCopy', 'importCurrent', 'cancelImport']) test(`render lookup reentry: ${stage} cannot continue after a genuine newer draft`, async t => {
    const h = await model(t); await prepareStage(h, stage); const writes = watchWrites(h); let expected;
    onceGet(h, h.view, stage, () => { h.controller.setDraft(DRAFT + 'nested'); h.controller.cancelTimer(); expected = ui(h); writes.length = 0; });
    h.view.render(); assert(expected); assert.equal(h.controller.draft, DRAFT + 'nested'); assert.deepEqual(ui(h), expected); assert.deepEqual(writes, []);
});
for (const field of ['controller', 'host', 'textarea', 'status']) test(`render first admission: ${field} accessor cannot adopt a newer render epoch`, async t => {
    const h = await model(t), writes = watchWrites(h); let expected;
    onceGet(h, h.view, field, () => { h.controller.setDraft(DRAFT); h.controller.cancelTimer(); expected = ui(h); writes.length = 0; });
    h.view.render(); assert.deepEqual(ui(h), expected); assert.deepEqual(writes, []);
});
for (const field of ['value', 'textContent', 'classList']) test(`render DOM lookup: ${field} reentry cannot overwrite a newer actual draft`, async t => {
    const h = await model(t), writes = watchWrites(h); let expected;
    const node = field === 'value' ? h.nodes.textarea : h.nodes.status;
    onceGet(h, node, field, () => { h.controller.setDraft(DRAFT); h.controller.cancelTimer(); expected = ui(h); writes.length = 0; });
    h.view.render(); assert.deepEqual(ui(h), expected); assert.deepEqual(writes, []);
});
for (const stage of ['countTranslation', 'statusTranslation']) test(`render feedback: ${stage} cannot overwrite actual synchronous save pending state`, async t => {
    const h = await model(t); h.pause(() => h.controller.setDraft(DRAFT)); h.backend.writeGate = deferred();
    const key = stage === 'countTranslation' ? 'scratchpadLines' : 'scratchpadUnsaved'; let expected;
    h.hooks.set('translate:' + key, () => { const pending = h.controller.save(); h.requests.push(pending); expected = ui(h); });
    h.view.render(); assert(h.controller.pending); assert.deepEqual(ui(h), expected); assert.match(h.nodes.status.textContent, /Saving/);
    h.backend.writeGate.resolve(); await h.settle(); assert.match(h.nodes.status.textContent, /Saved/); assert.equal(JSON.parse(h.bytes()).content, DRAFT);
});
test('render visibility: true callback may synchronously render a newer original draft exactly once', async t => {
    const h = await model(t, { enabled: false }); let visibleCalls = 0, tailCalls = 0;
    const find = h.view.renderFind; h.view.renderFind = function (...args) { tailCalls++; return find.apply(this, args); };
    h.view.onVisibility = function (visible) { assert.equal(this === h.view, true); if (visible) { visibleCalls++; h.controller.setDraft(DRAFT); } };
    h.controller.setDraft('outer'); h.controller.cancelTimer(); assert.equal(visibleCalls, 1); assert.equal(tailCalls, 1);
    assert.equal(h.nodes.textarea.value, DRAFT); assert.match(h.nodes.status.textContent, /Unsaved/);
});
for (const state of ['fresh saved read', 'conflicting read', 'passive read error']) test(`render refresh: genuine ${state} remains authoritative under translation reentry`, async t => {
    const h = await model(t);
    if (state === 'conflicting read') { h.controller.setDraft(DRAFT); h.controller.cancelTimer(); }
    if (state === 'passive read error') h.backend.failRead = true;
    else { h.backend.quiet = true; await new api.Store(h.backend).mutate({ kind: 'content', value: SAVED, revision: h.controller.state.revision }); }
    let calls = 0; h.hooks.set('translate:scratchpadLines', () => { calls++; h.view.render(); });
    if (state === 'passive read error') await assert.rejects(h.controller.refresh(), { code: 'READ' }); else await h.controller.refresh();
    assert.equal(calls, 1); assert.equal(h.controller.draft, state === 'fresh saved read' ? SAVED : state === 'conflicting read' ? DRAFT : TEXT);
    assert.equal(h.nodes.textarea.value, h.controller.draft); assert.equal(h.nodes.savedPreview.value, h.controller.state.content);
    assert.equal(h.nodes.textarea.readOnly, state === 'passive read error'); assert.equal(h.nodes.savedPreview.hidden, state !== 'conflicting read');
    assert.match(h.nodes.status.textContent, state === 'passive read error' ? /Could not load/ : state === 'conflicting read' ? /Another page/ : /Saved/);
});
for (const state of ['hidden host', 'detached host', 'detached wrapper', 'detached textarea', 'detached status', 'detached controls', 'hidden document', 'readonly', 'inert', 'disabled module', 'suspended flag', 'invalidated flag']) test(`render compatibility: original ${state} can render real new draft`, async t => {
    const h = await model(t, { workspace: true, enabled: state !== 'disabled module' });
    if (state === 'hidden host') h.host.hidden = true; if (state === 'hidden document') h.document.hidden = true;
    if (state === 'detached host') h.host.remove(); if (state === 'detached wrapper') h.wrapper.remove();
    if (state === 'detached textarea') h.nodes.textarea.remove(); if (state === 'detached status') h.nodes.status.remove();
    if (state === 'detached controls') h.nodes.retry.parentElement.remove(); if (state === 'readonly') h.nodes.textarea.readOnly = true;
    if (state === 'inert') h.host.inert = true; if (state === 'suspended flag') h.backend.workspace._suspended = true;
    if (state === 'invalidated flag') h.backend.workspace.invalidated = true;
    h.controller.setDraft(DRAFT); h.controller.cancelTimer(); assert.equal(h.nodes.textarea.value, DRAFT); assert.match(h.nodes.status.textContent, /Unsaved/); assert(!h.host.hidden);
});
for (const state of ['loading', 'initial read error', 'write error', 'lost acknowledgement', 'conflict', 'over limit', 'IME', 'pending']) test(`render compatibility: real ${state} preserves original display`, async t => {
    const h = await model(t, { loading: state === 'loading', readFailure: state === 'initial read error' });
    if (state === 'write error' || state === 'lost acknowledgement') await h.failWrite(state === 'lost acknowledgement');
    if (state === 'conflict') await h.conflict();
    if (state === 'over limit') { h.controller.setDraft('x'.repeat(32001)); await assert.rejects(h.controller.save(), { code: 'TEXT_LIMIT' }); }
    if (state === 'IME') { h.controller.setComposing(true); h.nodes.textarea.value = DRAFT; h.controller.setDraft(DRAFT); h.nodes.textarea.value += ' composing'; }
    if (state === 'pending') { h.controller.setDraft(DRAFT); h.backend.writeGate = deferred(); h.requests.push(h.controller.save()); }
    h.controller.cancelTimer(); const expected = ui(h), original = data(h);
    if (state === 'IME') expected.count.text = `${[...h.nodes.textarea.value].length} / 32,000 · Lines: 3`;
    h.view.render(); assert.deepEqual(ui(h), expected); sameData(h, original);
    if (state === 'loading' || state === 'initial read error') assert(h.nodes.textarea.readOnly);
    if (state === 'IME') assert.equal(h.nodes.textarea.value, DRAFT + ' composing');
    if (state === 'conflict' || state === 'lost acknowledgement') assert(!h.nodes.savedPreview.hidden);
    if (state === 'write error') assert(!h.nodes.retry.hidden); if (state === 'pending') assert.match(h.nodes.status.textContent, /Saving/);
});
test('render compatibility: exact text/counts, Find, copy and import remain available without storage effects', async t => {
    const h = await model(t), original = data(h); h.view.render(); assert.equal(h.nodes.textarea.value, TEXT);
    assert.equal(h.nodes.count.textContent, `${[...TEXT].length} / 32,000 · Lines: 3`); assert.equal(h.nodes.importButton.disabled, false);
    h.nodes.findButton.dispatch('click'); assert.equal(h.nodes.findPanel.hidden, false); h.nodes.findInput.value = 'Original'; h.nodes.findInput.dispatch('input'); assert.equal(h.nodes.findNext.disabled, false);
    await h.view.copyText(); assert.deepEqual(h.effects, [TEXT]); h.view.render(); assert(h.view.copyReceipt); assert.match(h.nodes.copyStatus.textContent, /copied/);
    h.view.chooseImport(); assert(h.view.importSession); h.view.render(); assert(h.view.importSession); sameData(h, original);
});
for (const stage of ['before render', 'canImport', 'statusTranslation', 'renderFind']) test(`render retirement: ${stage} cannot revive retired original controls`, async t => {
    const h = await model(t); const retire = () => { h.view.destroy(); h.view.closed = false; h.controller.closed = false; };
    const writes = watchWrites(h); if (stage === 'before render') { retire(); writes.length = 0; } else stages[stage](h, () => { retire(); writes.length = 0; });
    h.view.render(); assert.deepEqual(writes, []);
});
for (const stage of ['canImport', 'statusTranslation', 'renderFind']) for (const action of ['draft', 'composition', 'pending save']) test(`render real-state snapshot: ${stage} detects ${action} even when nested subscription render is suppressed`, async t => {
    const h = await model(t), writes = watchWrites(h); let expected;
    stages[stage](h, () => { h.pause(() => {
        if (action === 'draft') h.controller.setDraft(DRAFT);
        if (action === 'composition') h.controller.setComposing(true);
        if (action === 'pending save') { h.controller.setDraft(DRAFT); h.backend.writeGate = deferred(); h.requests.push(h.controller.save()); }
    }); expected = ui(h); writes.length = 0; });
    h.view.render(); assert.deepEqual(ui(h), expected); assert.deepEqual(writes, []);
    h.view.render(); if (action !== 'composition') assert.equal(h.nodes.textarea.value, DRAFT);
    if (action === 'pending save') assert.match(h.nodes.status.textContent, /Saving/);
});
for (const stage of ['i18n namespace', 'translation method', 'classList toggle', 'work query', 'saved preview']) for (const kind of ['source transfer', 'newer draft']) test(`render nested lookup: ${stage} rejects ${kind} before effect`, async t => {
    const h = await model(t), f = await h.foreign(true), writes = watchWrites(h); let expected, reached = false;
    const action = () => { reached = true; if (kind === 'source transfer') move(h, h.nodes.status, f.host);
        else { h.controller.setDraft(DRAFT); h.controller.cancelTimer(); } expected = ui(h); writes.length = 0; };
    if (stage === 'i18n namespace') onceGet(h, h.window, 'i18n', action);
    if (stage === 'translation method') onceGet(h, h.window.i18n, 't', action);
    if (stage === 'classList toggle') onceGet(h, h.nodes.status.classList, 'toggle', action);
    if (stage === 'work query') onceGet(h, h.controller, 'hasUncommittedWork', action);
    if (stage === 'saved preview') onceGet(h, h.nodes.savedPreview, 'value', action);
    h.view.render(); assert(reached); assert.deepEqual(ui(h), expected); assert.deepEqual(writes, []);
});
for (const name of ['host', 'textarea', 'status', 'count', 'copyButton']) test(`render count setter: reparented ${name} cannot receive later writes`, async t => {
    const h = await model(t), f = await h.foreign(true), writes = watchWrites(h), node = h.nodes.count;
    const descriptor = Object.getOwnPropertyDescriptor(node, 'textContent'); let armed = true;
    Object.defineProperty(node, 'textContent', { configurable: true, get: descriptor.get, set(value) {
        descriptor.set.call(this, value); if (armed) { armed = false; move(h, h[name] || h.nodes[name], f.host); writes.length = 0; }
    } });
    h.restores.push(() => Object.defineProperty(node, 'textContent', descriptor)); h.view.render(); assert.deepEqual(writes, []);
});
test('render count setter: a genuinely newer draft owns status and remaining controls', async t => {
    const h = await model(t), writes = watchWrites(h), node = h.nodes.count, descriptor = Object.getOwnPropertyDescriptor(node, 'textContent'); let armed = true, expected;
    Object.defineProperty(node, 'textContent', { configurable: true, get: descriptor.get, set(value) {
        descriptor.set.call(this, value); if (armed) { armed = false; h.controller.setDraft(DRAFT); h.controller.cancelTimer(); expected = ui(h); writes.length = 0; }
    } });
    h.restores.push(() => Object.defineProperty(node, 'textContent', descriptor)); h.view.render(); assert.deepEqual(ui(h), expected); assert.deepEqual(writes, []);
});
for (const name of ['controller', 'status', 'same-document status', 'workspace', 'session']) test(`render restoration: rejected original ${name} resumes only after exact identity restoration`, async t => {
    const h = await model(t, { workspace: true }), f = await h.foreign(true), originalUI = ui(h);
    const workspace = h.backend.workspace, session = h.window.LocalItabWorkspaces.session;
    if (name === 'same-document status') move(h, h.nodes.status, f.host); else changes[name](h, f);
    h.controller.setDraft(DRAFT); h.controller.cancelTimer(); assert.deepEqual(ui(h), originalUI);
    if (name === 'same-document status') h.restores.pop()();
    Object.assign(h.view, h.nodes, { controller: h.controller }); h.backend.workspace = workspace; h.window.LocalItabWorkspaces.session = session;
    h.view.render(); assert.equal(h.nodes.textarea.value, DRAFT); assert.match(h.nodes.status.textContent, /Unsaved/);
});
test('render foreign access: replacement Controller fields and methods remain unread', async t => {
    const h = await model(t), f = await h.foreign(), foreign = data(f), before = data(h); let reads = 0; const restores = [];
    for (const key of ['state', 'draft', 'closed', 'store', 'error', 'pending', 'hasUncommittedWork']) {
        const own = Object.getOwnPropertyDescriptor(f.controller, key), value = f.controller[key];
        Object.defineProperty(f.controller, key, { configurable: true, get() { reads++; return value; } });
        restores.push(() => { if (own) Object.defineProperty(f.controller, key, own); else delete f.controller[key]; });
    }
    h.view.controller = f.controller; h.view.render(); restores.forEach(fn => fn()); assert.equal(reads, 0); sameData(h, before); sameData(f, foreign);
});
for (const stage of ['copyCurrent callback', 'copyCurrent getter', 'invalidateCopy getter']) test(`render saved-copy: ${stage} cannot clear feedback created by a newer actual render`, async t => {
    const h = await model(t); await h.conflict(); await h.view.copySavedText(); assert(h.view.copyReceipt?.saved);
    if (stage === 'invalidateCopy getter') h.pause(() => h.controller.setComposing(true));
    const method = stage.startsWith('invalidate') ? 'invalidateCopy' : 'copyCurrent'; let expected;
    const action = () => { h.controller.setDraft(DRAFT + 'newer'); h.controller.cancelTimer(); expected = ui(h); };
    if (stage.endsWith('callback')) onceCall(h, h.view, method, action); else onceGet(h, h.view, method, action);
    h.view.render(); assert(expected); assert.deepEqual(ui(h), expected); assert.equal(h.controller.draft, DRAFT + 'newer');
});
const thrownValues = { error: Error('synthetic original callback failure'), false: false, zero: 0, empty: '', null: null, undefined: undefined };
for (const stage of ['canImport', 'countTranslation', 'statusTranslation', 'renderFind']) for (const [name, failure] of Object.entries(thrownValues)) test(`render exception priority: ${stage} preserves original ${name} throw over cleanup failure`, async t => {
    const h = await model(t), f = await h.foreign(); await h.view.copyText();
    const receipt = h.view.copyReceipt, originalCleanup = receipt.cleanup, original = data(h), foreign = data(f); let cleanups = 0;
    receipt.cleanup = () => { cleanups++; originalCleanup(); throw Error('synthetic cleanup failure'); };
    stages[stage](h, () => { h.view.controller = f.controller; throw failure; });
    let caught, thrown = false; try { h.view.render(); } catch (error) { caught = error; thrown = true; }
    assert.equal(thrown, true); assert.equal(caught, failure, 'original callback exception remains observable');
    assert.equal(cleanups, 1); assert.equal(receipt.valid, false); assert.equal(h.view.copyReceipt, null);
    assert.equal(h.nodes.copyStatus.hidden, true); assert.equal(h.nodes.copyStatus.textContent, '');
    sameData(h, original); sameData(f, foreign); h.view.controller = h.controller; h.view.render(); assert.equal(cleanups, 1);
});
test('render cleanup exception: source rejection exposes cleanup failure when no callback already failed', async t => {
    const h = await model(t), f = await h.foreign(); await h.view.copyText();
    const receipt = h.view.copyReceipt, cleanup = receipt.cleanup, failure = Error('synthetic cleanup only failure'); let cleanups = 0;
    receipt.cleanup = () => { cleanups++; cleanup(); throw failure; }; stages.canImport(h, () => { h.view.controller = f.controller; });
    assert.throws(() => h.view.render(), error => error === failure); assert.equal(cleanups, 1); assert.equal(h.view.copyReceipt, null);
    h.view.controller = h.controller; h.view.render(); assert.equal(cleanups, 1);
});
