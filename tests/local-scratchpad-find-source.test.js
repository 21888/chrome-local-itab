const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const api = require('../shared/local-scratchpad-store');
const { Controller } = require('../shared/local-scratchpad-controller');
const tick = () => new Promise(resolve => setImmediate(resolve));
const TEXT = '\uFEFF one 中文 😀 e\u0301\r\none <b>.*[x]</b>\rone';
const findNames = ['textarea', 'findButton', 'findSelectionButton', 'findPanel', 'findInput', 'findPrevious', 'findNext', 'findClose', 'findStatus'];
// Deliberate public-field/callback robustness probes, not normal navigation or
// evidence about historical personal-data loss. All payloads are synthetic.
async function model(t, options = {}) {
    const document = options.document || createDocument(), effects = [], hooks = new Map(), restores = [];
    const call = (name, ...args) => { const fn = hooks.get(name); if (fn) { hooks.delete(name); return fn(...args); } };
    let raw = api.validate({ ...api.initial(), revision: 4, enabled: true, content: options.text ?? TEXT }), queue = Promise.resolve();
    const io = { reads: 0, writes: 0, commits: 0, locks: 0, mutations: 0 }, subscribers = new Set();
    const backend = {
        lock(fn) { io.locks++; const p = queue.then(fn); queue = p.catch(() => {}); return p; },
        async read() { io.reads++; if (backend.readGate) await backend.readGate.promise; if (backend.failRead) throw Error('Synthetic read failure'); return structuredClone(raw); },
        async write(value) { io.writes++; if (backend.writeGate) { backend.writeEntered.resolve(); await backend.writeGate.promise; }
            if (backend.failWrite) throw Error('Synthetic write failure'); raw = structuredClone(value); io.commits++;
            for (const fn of subscribers) fn(); if (backend.failAck) throw Error('Synthetic lost acknowledgement'); },
        subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); }
    };
    if (options.workspace) backend.workspace = { id: 'original', generation: 'original-generation' };
    if (options.loading) backend.readGate = deferred();
    const store = new api.Store(backend), mutate = store.mutate;
    store.mutate = function (...args) { io.mutations++; return mutate.apply(this, args); };
    const controller = new Controller(store, { delay: 60000 });
    const window = { LocalItabScratchpad: { ...api }, addEventListener() {}, removeEventListener() {},
        i18n: { t(key) { call('translate:' + key); return key; } }, fetch() { effects.push('network'); },
        navigator: { clipboard: { readText() { effects.push('clipboard read'); }, writeText() { effects.push('clipboard write'); } }, permissions: { query() { effects.push('permission'); } } }
    };
    if (options.workspace) window.LocalItabWorkspaces = { session: backend.workspace };
    document.execCommand = () => effects.push('fallback');
    vm.runInNewContext(fs.readFileSync(process.env.SCRATCHPAD_VIEW_SOURCE || path.join(__dirname, '../shared/local-scratchpad-view.js'), 'utf8'), { window, document });
    const wrapper = document.createElement('main'), host = document.createElement('article'), neutral = document.createElement('input');
    document.body.append(wrapper, neutral); wrapper.append(host);
    const view = new window.LocalItabScratchpad.View(host, { controller });
    const nodes = Object.fromEntries(Object.entries(view).filter(([, node]) => node?.tagName));
    const h = { document, window, wrapper, host, neutral, view, nodes, controller, store, backend, io, effects, hooks, restores, call,
        bytes: () => JSON.stringify(raw), async foreign(sameDocument = false) { return model(t, { document: sameDocument ? document : undefined, text: 'one FOREIGN one' }); },
        open() { nodes.findButton.dispatch('click'); }, query(text = 'one') { nodes.findInput.value = text; nodes.findInput.dispatch('input'); },
        ready() { this.open(); this.query(); nodes.textarea.selectionStart = 2; nodes.textarea.selectionEnd = 5; nodes.textarea.selectionDirection = 'backward'; effects.length = 0; }
    };
    for (const name of ['textarea', 'findInput', 'findButton']) {
        const node = nodes[name], focus = node.focus;
        node.focus = function () { assert.equal(this, node); effects.push(name + ':focus'); focus.call(node); call(name + ':focus'); };
    }
    nodes.textarea.setSelectionRange = function (start, end) { assert.equal(this, nodes.textarea); effects.push(['selection', start, end]); this.selectionStart = start; this.selectionEnd = end; call('selection'); };
    t.after(async () => { hooks.clear(); while (restores.length) restores.pop()(); backend.readGate?.resolve(); backend.writeGate?.resolve(); await tick();
        Object.assign(view, nodes, { controller, host }); controller.store = store; store.backend = backend;
        try { view.destroy(); } catch (_) {} controller.destroy(); });
    await tick(); neutral.focus(); effects.length = 0; return h;
}
function core(h) {
    const c = h.controller, n = h.nodes;
    return { bytes: h.bytes(), io: { ...h.io }, state: c.state, stateJSON: JSON.stringify(c.state), draft: c.draft, generation: c.generation,
        pending: c.pending, pendingWrite: c.pendingWrite, error: c.error, readError: c.readError, writeError: c.writeError, conflict: c.conflict,
        composing: c.composing, timer: c.timer, dirty: c.dirty(), work: c.hasUncommittedWork(), status: c.status,
        text: n.textarea.value, saved: n.savedPreview.value, feedback: n.status.textContent, readOnly: n.textarea.readOnly, retry: n.retry.hidden };
}
function sameCore(h, before) { const after = core(h); for (const key of ['state', 'error', 'timer']) { assert.equal(after[key] === before[key], true, key + ' identity'); delete after[key]; } const expected = { ...before }; for (const key of ['state', 'error', 'timer']) delete expected[key]; assert.deepEqual(after, expected); }
function ui(h) { const n = h.nodes; return { query: n.findInput.value, status: n.findStatus.textContent, hidden: n.findPanel.hidden,
    expanded: n.findButton.getAttribute('aria-expanded'), disabled: findNames.filter(k => k.includes('find')).map(k => Boolean(n[k].disabled)),
    start: n.textarea.selectionStart, end: n.textarea.selectionEnd, direction: n.textarea.selectionDirection }; }
function move(h, node, parent, document = parent?.ownerDocument) {
    const oldParent = node.parentElement, oldDocument = node.ownerDocument;
    const transfer = (target, doc) => { node.remove(); if (doc) { const adopt = n => { n.ownerDocument = doc; n.children.forEach(adopt); }; adopt(node); } target?.append(node); };
    transfer(parent, document); h.restores.push(() => transfer(oldParent, oldDocument));
    assert(!oldParent?.children.includes(node), 'explicit unlink from original parent');
}
function onceGet(h, object, key, action) {
    const own = Object.getOwnPropertyDescriptor(object, key); let proto = object, descriptor;
    while (proto && !(descriptor = Object.getOwnPropertyDescriptor(proto, key))) proto = Object.getPrototypeOf(proto);
    const value = object[key], restore = () => { if (own) Object.defineProperty(object, key, own); else delete object[key]; };
    h.restores.push(restore); Object.defineProperty(object, key, { configurable: true, get() { restore(); action(); return value; }, set(value) { restore(); object[key] = value; } });
}
function onceSet(h, object, key, action) {
    const own = Object.getOwnPropertyDescriptor(object, key); let value = object[key], proto = object, descriptor;
    while (proto && !(descriptor = Object.getOwnPropertyDescriptor(proto, key))) proto = Object.getPrototypeOf(proto);
    const restore = () => { if (own?.get || own?.set) Object.defineProperty(object, key, own); else if (own) Object.defineProperty(object, key, { ...own, value }); else delete object[key]; };
    h.restores.push(restore); Object.defineProperty(object, key, { configurable: true, get() { return value; }, set(next) { value = next; restore(); if (descriptor?.set) descriptor.set.call(object, next); else object[key] = next; action(); } });
}
const substitutions = {
    controller(h, f) { h.view.controller = f.controller; }, store(h, f) { h.controller.store = f.store; }, backend(h, f) { h.store.backend = f.backend; },
    host(h, f) { h.view.host = f.host; },
    ...Object.fromEntries(findNames.map(name => [name, (h, f) => { h.view[name] = f.nodes[name]; }])),
    workspace(h) { h.backend.workspace = { ...h.backend.workspace }; }, workspaceId(h) { h.backend.workspace.id = 'changed'; },
    workspaceGeneration(h) { h.backend.workspace.generation = 'changed'; }, session(h) { h.window.LocalItabWorkspaces.session = {}; }
};
const actions = {
    open: h => h.nodes.findButton.dispatch('click'), selected: h => h.nodes.findSelectionButton.dispatch('click'),
    next: h => h.nodes.findNext.dispatch('click'), enter: h => h.nodes.findInput.dispatch('keydown', { key: 'Enter' }), render: h => h.view.renderFind()
};
for (const [action, invoke] of Object.entries(actions)) for (const [name, change] of Object.entries(substitutions)) test(`find admission: ${action} rejects construction ${name} substitution`, async t => {
    const h = await model(t, { workspace: true }), f = await h.foreign(); h.ready(); f.ready();
    const before = core(h), other = core(f), oldUI = ui(h), foreignUI = ui(f); change(h, f); invoke(h);
    assert.deepEqual(ui(h), oldUI); assert.deepEqual(ui(f), foreignUI); assert.deepEqual(h.effects, []); assert.deepEqual(f.effects, []); sameCore(h, before); sameCore(f, other);
});
for (const transfer of ['same-document', 'cross-document']) for (const name of [...findNames, 'host', 'wrapper', 'findLabel', 'findControls']) test(`find ownership: ${transfer} ${name} refuses navigation and foreign cleanup`, async t => {
    const h = await model(t); h.ready(); const document = transfer === 'same-document' ? h.document : createDocument(), target = document.createElement('aside'); document.body.append(target);
    const node = name === 'findLabel' ? h.nodes.findInput.parentElement : name === 'findControls' ? h.nodes.findNext.parentElement : h[name] || h.nodes[name];
    move(h, node, target); const before = core(h), previous = ui(h);
    h.nodes.findNext.dispatch('click'); assert.deepEqual(h.effects, []); assert.deepEqual(ui(h), previous); sameCore(h, before);
    const observed = { query: h.nodes.findInput.value, status: h.nodes.findStatus.textContent, hidden: h.nodes.findPanel.hidden, expanded: h.nodes.findButton.getAttribute('aria-expanded') };
    h.view.closeFind(true);
    if (node.contains(h.nodes.findInput)) assert.equal(h.nodes.findInput.value, observed.query);
    if (node.contains(h.nodes.findStatus)) assert.equal(h.nodes.findStatus.textContent, observed.status);
    if (node.contains(h.nodes.findPanel)) assert.equal(h.nodes.findPanel.hidden, observed.hidden);
    if (node.contains(h.nodes.findButton)) assert.equal(h.nodes.findButton.getAttribute('aria-expanded'), observed.expanded);
    assert.deepEqual(h.effects, []); sameCore(h, before);
});
for (const stage of ['textarea:focus', 'selection', 'translate:scratchpadFindSelected']) for (const name of ['controller', 'store', 'backend', 'host', 'textarea', 'findInput', 'findStatus', 'workspace', 'workspaceGeneration', 'session']) test(`find callback: ${stage} ${name} loss stops later selection/feedback`, async t => {
    const h = await model(t, { workspace: true }), f = await h.foreign(); h.ready(); f.ready();
    const before = core(h), other = core(f), foreignUI = ui(f); h.hooks.set(stage, () => substitutions[name](h, f));
    h.nodes.findInput.dispatch('keydown', { key: 'Enter' });
    assert.deepEqual(ui(f), foreignUI); assert.deepEqual(f.effects, []); assert.equal(h.nodes.findStatus.textContent, '');
    assert.equal(h.view.findHeldEnter || null, null); assert.equal(h.view.findResult?.total, undefined);
    assert.equal(h.effects.filter(x => Array.isArray(x)).length, stage === 'textarea:focus' ? 0 : 1); sameCore(h, before); sameCore(f, other);
});
for (const method of ['focus', 'setSelectionRange']) for (const transfer of ['source', 'target']) test(`find method lookup: ${method} ${transfer} change prevents original call`, async t => {
    const h = await model(t), f = await h.foreign(); h.ready(); const other = ui(f);
    onceGet(h, h.nodes.textarea, method, () => { if (transfer === 'source') h.view.controller = f.controller; else move(h, h.nodes.textarea, f.host); });
    h.nodes.findNext.dispatch('click'); assert.equal(h.effects.filter(x => Array.isArray(x)).length, 0);
    if (method === 'focus') assert.deepEqual(h.effects, []); assert.equal(h.nodes.findStatus.textContent, ''); assert.deepEqual(ui(f), other);
});
for (const name of ['findInput', 'findStatus', 'findButton', 'findPanel']) for (const metadata of ['parentElement', 'ownerDocument']) test(`find stale metadata: ${name}.${metadata} one-shot transfer is rejected`, async t => {
    const h = await model(t), f = await h.foreign(); h.ready(); onceGet(h, h.nodes[name], metadata, () => move(h, h.nodes[name], f.host));
    h.nodes.findNext.dispatch('click'); assert.deepEqual(h.effects, []); assert.equal(h.nodes.findStatus.textContent, '');
});
for (const stage of ['textarea:focus', 'selection', 'translate:scratchpadFindSelected']) test(`find nested: newer navigation from ${stage} owns result and held gesture`, async t => {
    const h = await model(t, { text: 'one one one' }); h.ready(); let newer;
    h.hooks.set(stage, () => { newer = h.nodes.findInput.dispatch('keydown', { key: 'Enter' }); });
    const older = h.nodes.findInput.dispatch('keydown', { key: 'Enter' });
    assert(newer); assert.equal(h.view.findHeldEnter === newer, true); assert.equal(h.view.findHeldEnter === older, false);
    assert.equal(h.nodes.findStatus.textContent, stage === 'translate:scratchpadFindSelected' ? 'Match 2 of 3.' : 'Match 1 of 3.');
});
for (const stage of ['textarea:focus', 'selection', 'translate:scratchpadFindSelected']) test(`find newer edit: ${stage} real setDraft leaves newer feedback untouched`, async t => {
    const h = await model(t); h.ready(); h.hooks.set(stage, () => { h.controller.setDraft('new genuine one draft'); h.controller.cancelTimer(); h.nodes.findStatus.textContent = 'newer edit feedback'; });
    h.nodes.findInput.dispatch('keydown', { key: 'Enter' }); assert.equal(h.controller.draft, 'new genuine one draft');
    assert.equal(h.nodes.findStatus.textContent, 'newer edit feedback'); assert.equal(h.view.findHeldEnter || null, null); assert.equal(h.view.findResult?.total, undefined);
});
for (const stage of ['findInput:focus', 'translate:scratchpadFindSelectionHelp', 'translate:scratchpadFindSelectionFailed']) for (const name of ['controller', 'textarea', 'findInput', 'findStatus']) test(`selected find: ${stage} ${name} loss cannot prefill or publish`, async t => {
    const h = await model(t), f = await h.foreign(); h.ready(); f.ready(); h.query('keep');
    if (stage.endsWith('Help')) h.nodes.textarea.selectionEnd = h.nodes.textarea.selectionStart;
    if (stage.endsWith('Failed')) h.nodes.findInput.focus = () => {};
    h.neutral.focus(); h.effects.length = 0; const other = ui(f); h.hooks.set(stage, () => substitutions[name](h, f));
    h.nodes.findSelectionButton.dispatch('click'); assert.equal(h.nodes.findInput.value, 'keep'); assert.equal(h.nodes.findStatus.textContent, ''); assert.deepEqual(ui(f), other); assert.deepEqual(f.effects, []);
});
for (const name of ['findInput', 'findStatus', 'findPanel', 'findButton', 'findPrevious', 'findNext']) test(`find cleanup: substituted ${name} never receives reset/close writes`, async t => {
    const h = await model(t), f = await h.foreign(); h.ready(); f.ready(); f.nodes.findStatus.textContent = 'foreign feedback'; const before = ui(f);
    h.view[name] = f.nodes[name]; h.view.resetFindResult(); h.view.closeFind(true); assert.deepEqual(ui(f), before); assert.deepEqual(f.effects, []);
});
for (const phase of ['clear query', 'clear status', 'hide panel', 'attribute getter', 'disable previous']) test(`find close: ${phase} callback newer opening survives older cleanup`, async t => {
    const h = await model(t); h.ready(); const newer = () => { h.view.closeFind(); h.open(); h.query('new query'); h.nodes.findStatus.textContent = 'new action'; };
    if (phase === 'clear query') onceSet(h, h.nodes.findInput, 'value', newer);
    if (phase === 'clear status') onceSet(h, h.nodes.findStatus, 'textContent', newer);
    if (phase === 'hide panel') onceSet(h, h.nodes.findPanel, 'hidden', newer);
    if (phase === 'attribute getter') onceGet(h, h.nodes.findButton, 'setAttribute', newer);
    if (phase === 'disable previous') onceSet(h, h.nodes.findPrevious, 'disabled', newer);
    h.view.closeFind(true); assert.equal(h.nodes.findInput.value, 'new query'); assert.equal(h.nodes.findStatus.textContent, 'new action'); assert.equal(h.nodes.findPanel.hidden, false);
    assert.equal(h.nodes.findNext.disabled, false); assert.equal(h.document.activeElement === h.nodes.findInput, true);
});
for (const phase of ['findStatus', 'findPanel', 'findButton', 'findPrevious']) test(`find render: ${phase} setter transferring later target preserves new owner`, async t => {
    const h = await model(t), f = await h.foreign(); h.ready(); const key = phase === 'findStatus' ? 'textContent' : phase === 'findPanel' ? 'hidden' : 'disabled';
    if (phase === 'findStatus') { h.nodes.findNext.dispatch('click'); h.nodes.textarea.value = 'changed'; }
    if (phase === 'findPanel') h.host.hidden = true;
    onceSet(h, h.nodes[phase], key, () => { move(h, h.nodes.findNext, f.host); h.nodes.findNext.disabled = false; });
    h.view.renderFind(); assert.equal(h.nodes.findNext.disabled, false);
});
for (const state of ['saved', 'dirty', 'write error', 'lost acknowledgement', 'conflict', 'read error', 'over-limit', 'pending success', 'pending failure']) test(`find zero I/O: genuine ${state} searches exact DOM and preserves recovery`, async t => {
    const h = await model(t); let pending;
    if (state !== 'saved') h.controller.setDraft(state === 'over-limit' ? 'x'.repeat(32001) + 'one one' : 'unsaved\r\none one');
    if (state === 'write error' || state === 'lost acknowledgement') { h.backend[state === 'write error' ? 'failWrite' : 'failAck'] = true; await assert.rejects(h.controller.save(), { code: 'WRITE' }); await tick(); }
    if (state === 'conflict') { await new api.Store(h.backend).mutate({ kind: 'content', value: 'remote preview', revision: h.controller.state.revision }); await tick(); assert(h.controller.conflict); }
    if (state === 'read error') { h.backend.failRead = true; await assert.rejects(h.controller.refresh(), { code: 'READ' }); assert(h.nodes.textarea.readOnly); }
    if (state === 'over-limit') await assert.rejects(h.controller.save(), { code: 'TEXT_LIMIT' });
    if (state.startsWith('pending')) { h.backend.writeGate = deferred(); h.backend.writeEntered = deferred(); h.backend.failWrite = state === 'pending failure'; pending = h.controller.save(); pending.catch(() => {}); await h.backend.writeEntered.promise; assert(h.controller.pendingWrite); }
    h.controller.cancelTimer(); h.nodes.textarea.value = h.controller.draft.replace(/\r\n?/g, '\n'); h.ready(); const before = core(h);
    h.nodes.findNext.dispatch('click'); const start = h.nodes.textarea.value.indexOf('one'); assert.equal(h.nodes.textarea.selectionStart, start); assert.equal(h.nodes.textarea.selectionEnd, start + 3);
    assert.equal(h.nodes.findStatus.textContent, state === 'saved' ? 'Match 1 of 3.' : 'Match 1 of 2.');
    h.nodes.findSelectionButton.dispatch('click'); assert.equal(h.nodes.findInput.value, 'one'); sameCore(h, before);
    assert(h.effects.every(x => Array.isArray(x) || x.endsWith(':focus')));
    if (pending) { h.backend.writeGate.resolve(); if (state === 'pending failure') await assert.rejects(pending, { code: 'WRITE' }); else await pending; }
});
for (const name of ['hidden host', 'detached host', 'detached input', 'closed Controller', 'document hidden', 'inert host', 'disabled button', 'editor IME', 'query IME']) test(`find compatibility: ${name} retains original refusal and cleanup`, async t => {
    const h = await model(t); h.ready(); h.nodes.findNext.dispatch('click'); h.effects.length = 0;
    if (name === 'hidden host') h.host.hidden = true;
    if (name === 'detached host') h.host.remove();
    if (name === 'detached input') h.nodes.findInput.remove();
    if (name === 'closed Controller') h.controller.destroy();
    if (name === 'document hidden') h.document.hidden = true;
    if (name === 'inert host') h.host.inert = true;
    if (name === 'disabled button') h.nodes.findNext.disabled = true;
    if (name === 'editor IME') h.controller.setComposing(true);
    if (name === 'query IME') h.nodes.findInput.dispatch('compositionstart');
    h.effects.length = 0; h.nodes.findNext.dispatch('click'); assert.deepEqual(h.effects, []);
    if (['hidden host', 'detached host', 'closed Controller', 'inert host'].includes(name)) { assert.equal(h.nodes.findInput.value, ''); assert.equal(h.nodes.findStatus.textContent, ''); assert.equal(h.nodes.findPanel.hidden, true); }
});
for (const name of ['workspace', 'workspaceId', 'workspaceGeneration', 'session']) test(`find context: pre-entry ${name} replacement rejected until exact restoration`, async t => {
    const h = await model(t, { workspace: true }); h.ready(); const old = h.backend.workspace, id = old.id, generation = old.generation;
    substitutions[name](h); h.nodes.findNext.dispatch('click'); assert.deepEqual(h.effects, []);
    h.backend.workspace = old; old.id = id; old.generation = generation; h.window.LocalItabWorkspaces.session = old;
    h.nodes.findNext.dispatch('click'); assert.equal(h.nodes.findStatus.textContent, 'Match 1 of 3.');
});
for (const phase of ['focus', 'selection', 'translation']) test(`find retirement: destroy then reset public closed cannot publish from ${phase}`, async t => {
    const h = await model(t); h.ready(); h.hooks.set(phase === 'focus' ? 'textarea:focus' : phase === 'selection' ? 'selection' : 'translate:scratchpadFindSelected', () => { h.view.destroy(); h.view.closed = false; });
    h.nodes.findInput.dispatch('keydown', { key: 'Enter' }); assert.equal(h.nodes.findStatus.textContent, ''); assert.equal(h.view.findHeldEnter || null, null); assert.equal(h.nodes.findPanel.hidden, true);
});

test('find held gesture: button repeats preserve original editor repeat guard and a fresh editor key releases it', async t => {
    const h = await model(t); h.ready(); const gesture = h.nodes.findNext.dispatch('keydown', { key: 'Enter' });
    assert(gesture.prevented); assert.equal(h.view.findHeldEnter === gesture, true);
    assert(h.nodes.findNext.dispatch('keydown', { key: 'Enter', repeat: true }).prevented);
    assert(h.document.activeElement.dispatch('keydown', { key: 'Enter', repeat: true }).prevented);
    assert.equal(h.view.findHeldEnter === gesture, true);
    assert(!h.nodes.textarea.dispatch('keydown', { key: 'Enter', repeat: false }).prevented);
    assert(!h.nodes.textarea.dispatch('keydown', { key: 'Enter', repeat: true }).prevented);
});
for (const action of ['open', 'selected', 'enter']) test(`find admission reentry: ${action} visibility lookup cannot supersede a newer gesture`, async t => {
    const h = await model(t); h.ready(); let newer;
    const source = action === 'open' ? h.nodes.findButton : action === 'selected' ? h.nodes.findSelectionButton : h.nodes.findInput;
    onceGet(h, source, 'getClientRects', () => { newer = h.nodes.findInput.dispatch('keydown', { key: 'Enter' }); });
    actions[action](h); assert(newer); assert.equal(h.view.findHeldEnter === newer, true);
    assert.equal(h.nodes.findStatus.textContent, 'Match 1 of 3.'); assert.equal(h.nodes.findPanel.hidden, false);
    assert.equal(h.document.activeElement === h.nodes.textarea, true);
});
for (const mode of ['query', 'text', 'selection', 'feedback']) test(`find translated success: changed ${mode} cannot receive old success`, async t => {
    const h = await model(t); h.ready(); h.hooks.set('translate:scratchpadFindSelected', () => {
        if (mode === 'query') h.nodes.findInput.value = 'changed query';
        if (mode === 'text') h.nodes.textarea.value = 'changed DOM text';
        if (mode === 'selection') h.nodes.textarea.selectionStart = 9;
        if (mode === 'feedback') h.nodes.findStatus.textContent = 'new owner feedback';
    });
    h.nodes.findInput.dispatch('keydown', { key: 'Enter' });
    assert.equal(h.nodes.findStatus.textContent, mode === 'feedback' ? 'new owner feedback' : '');
    assert.equal(h.view.findResult?.total, undefined); assert.equal(h.view.findHeldEnter || null, null);
});
for (const key of ['scratchpadFindNoMatch', 'scratchpadFindInvalid', 'scratchpadFindSelectionHelp', 'scratchpadFindSelectionFailed']) test(`find translated failure: ${key} newer query is not labelled by old attempt`, async t => {
    const h = await model(t); h.ready();
    if (key === 'scratchpadFindNoMatch') h.query('absent');
    if (key === 'scratchpadFindInvalid') h.query('\uD800');
    if (key === 'scratchpadFindSelectionHelp') h.nodes.textarea.selectionEnd = h.nodes.textarea.selectionStart;
    if (key === 'scratchpadFindSelectionFailed') { h.neutral.focus(); h.nodes.findInput.focus = () => {}; }
    h.hooks.set('translate:' + key, () => { h.nodes.findInput.value = 'newer query'; });
    (key.includes('Selection') ? actions.selected : actions.next)(h);
    assert.equal(h.nodes.findInput.value, 'newer query'); assert.equal(h.nodes.findStatus.textContent, '');
});
for (const name of ['findInput', 'findStatus', 'findPanel', 'findButton']) test(`find close: independent original ${name} cleanup survives public Controller replacement`, async t => {
    const h = await model(t), f = await h.foreign(); h.ready(); h.nodes.findStatus.textContent = 'old feedback'; h.view.controller = f.controller;
    const other = ui(f); h.view.closeFind(); assert.equal(h.nodes.findInput.value, ''); assert.equal(h.nodes.findStatus.textContent, '');
    assert.equal(h.nodes.findPanel.hidden, true); assert.equal(h.nodes.findButton.getAttribute('aria-expanded'), 'false'); assert.deepEqual(ui(f), other);
});
for (const stage of ['findInput.value', 'textarea.value', 'textarea.selectionStart', 'textarea.selectionEnd']) test(`find selected snapshot: ${stage} getter source loss cannot prefill`, async t => {
    const h = await model(t), f = await h.foreign(); h.ready(); const [name, property] = stage.split('.'); const other = ui(f);
    onceGet(h, h.nodes[name], property, () => { h.view.controller = f.controller; }); h.nodes.findSelectionButton.dispatch('click');
    assert.equal(h.nodes.findInput.value, 'one'); assert.equal(h.nodes.findStatus.textContent, ''); assert.deepEqual(ui(f), other);
});

test('find held gesture: genuine unchanged Controller refresh preserves the original held editor guard', async t => {
    const h = await model(t); h.ready(); const gesture = h.nodes.findInput.dispatch('keydown', { key: 'Enter' });
    const before = core(h), reads = h.io.reads; await h.controller.refresh(); assert.equal(h.io.reads, reads + 1);
    assert.equal(h.controller.draft, before.draft); assert.equal(h.controller.generation, before.generation);
    assert.equal(h.nodes.findStatus.textContent, 'Match 1 of 3.'); assert.equal(h.view.findHeldEnter === gesture, true);
    assert(h.nodes.textarea.dispatch('keydown', { key: 'Enter', repeat: true }).prevented);
    h.controller.setDraft('new one draft'); h.controller.cancelTimer();
    assert(!h.nodes.textarea.dispatch('keydown', { key: 'Enter', repeat: true }).prevented);
});

test('find origin: an unowned same-host button cannot become a navigation control', async t => {
    const h = await model(t); h.ready(); const foreign = h.document.createElement('button'); h.host.append(foreign);
    h.view.findText(1, foreign, {}); assert.deepEqual(h.effects, []); assert.equal(h.nodes.findStatus.textContent, '');
});
test('find failure translation: a later query remains unlabelled by the earlier failed selection', async t => {
    const h = await model(t); h.ready(); h.nodes.textarea.setSelectionRange = () => { throw Error('synthetic selection failure'); };
    h.hooks.set('translate:scratchpadFindFailed', () => { h.nodes.findInput.value = 'new query'; });
    h.nodes.findNext.dispatch('click'); assert.equal(h.nodes.findStatus.textContent, ''); assert.equal(h.nodes.findInput.value, 'new query');
});
for (const phase of ['query cleanup', 'focus getter']) test(`find close focus: ${phase} preserves a newer outside focus`, async t => {
    const h = await model(t); h.ready(); h.nodes.findInput.focus(); h.effects.length = 0;
    if (phase === 'query cleanup') onceSet(h, h.nodes.findInput, 'value', () => h.neutral.focus());
    else onceGet(h, h.nodes.findButton, 'focus', () => h.neutral.focus());
    h.view.closeFind(true); assert.equal(h.document.activeElement === h.neutral, true); assert.deepEqual(h.effects, []);
});

for (const mode of ['close click', 'Escape', 'composition start']) test(`find original entry: ${mode} readiness callback preserves newer completed Find`, async t => {
    const h = await model(t); h.ready(); const node = mode === 'close click' ? h.nodes.findClose : h.nodes.findInput;
    const rects = node.getClientRects; let fired = false;
    node.getClientRects = function () { const result = rects.call(this); if (!fired) { fired = true; h.query('中文'); h.nodes.findNext.dispatch('click'); } return result; };
    h.restores.push(() => { node.getClientRects = rects; }); const before = core(h);
    if (mode === 'close click') node.dispatch('click');
    else if (mode === 'Escape') node.dispatch('keydown', { key: 'Escape' });
    else node.dispatch('compositionstart');
    assert(fired); assert.equal(h.nodes.findInput.value, '中文'); assert.equal(h.nodes.findPanel.hidden, false);
    assert.equal(h.nodes.findStatus.textContent, 'Match 1 of 1.'); assert.equal(h.view.findResult.query, '中文');
    assert.equal(Boolean(h.view.findComposing), false); sameCore(h, before);
});
