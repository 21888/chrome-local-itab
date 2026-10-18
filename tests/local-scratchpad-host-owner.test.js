const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const api = require('../shared/local-scratchpad-store');
const { Controller } = require('../shared/local-scratchpad-controller');
const tick = () => new Promise(resolve => setImmediate(resolve));
const TEXT = '\uFEFF Synthetic 中文 😀\r\nold <text>\r';
const DRAFT = ' Synthetic draft 🪷\r\nnot yet saved ';
const IMPORT = 'Imported synthetic 中文\r\nsecond line';
// Same public API/module instance, actual shared host, and independent genuine
// Controllers/Stores/backends. No manufactured Controller state or outcomes.
async function model(t) {
    const document = createDocument(), actors = [], restores = [], hooks = new Map(), effects = [], windows = new Map();
    const hook = key => { const fn = hooks.get(key); if (fn) { hooks.delete(key); fn(); } };
    const create = document.createElement;
    document.createElement = function (tag) { const node = create(tag); node.click = () => { if (tag === 'a') effects.push(['download', node.href]); node.dispatch('click'); }; return node; };
    const window = { LocalItabScratchpad: { ...api }, Blob, TextDecoder,
        i18n: { t(key) { hook('t:' + key); return key; } },
        URL: { createObjectURL(blob) { effects.push(['blob', blob]); return 'blob:synthetic'; }, revokeObjectURL(url) { effects.push(['revoke', url]); } },
        setTimeout(fn) { effects.push(['timer']); fn(); },
        addEventListener(type, fn) { const set = windows.get(type) || new Set(); set.add(fn); windows.set(type, set); },
        removeEventListener(type, fn) { windows.get(type)?.delete(fn); },
        navigator: { clipboard: { async writeText(text) { effects.push(['copy', text]); } } } };
    vm.runInNewContext(fs.readFileSync(process.env.SCRATCHPAD_VIEW_SOURCE || path.join(__dirname, '../shared/local-scratchpad-view.js'), 'utf8'), { window, document });
    const wrapper = document.createElement('main'), host = document.createElement('article'); document.body.append(wrapper); wrapper.append(host);
    const h = { document, window, wrapper, host, actors, restores, hooks, effects, windows,
        async actor(options = {}) {
            let raw = api.validate({ ...api.initial(), revision: 3, enabled: options.enabled !== false, content: options.text ?? TEXT }), tail = Promise.resolve();
            const io = { reads: 0, writes: 0, commits: 0, locks: 0 }, listeners = new Set();
            const backend = {
                lock(fn) { io.locks++; const result = tail.then(fn); tail = result.catch(() => {}); return result; },
                async read() { io.reads++; if (backend.readGate) await backend.readGate.promise; if (backend.failRead) throw Error('synthetic read failure'); return structuredClone(raw); },
                async write(value) { io.writes++; backend.writeEntered?.resolve(); if (backend.writeGate) await backend.writeGate.promise;
                    if (backend.failWrite) throw Error('synthetic write failure'); raw = structuredClone(value); io.commits++;
                    listeners.forEach(fn => fn()); if (backend.failAck) throw Error('synthetic lost acknowledgement'); },
                subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
            };
            const store = new api.Store(backend), controller = new Controller(store, { delay: 60000 });
            const a = { backend, store, controller, io, views: [], visible: [], requests: [], bytes: () => JSON.stringify(raw), listeners };
            actors.push(a); if (!options.unloaded) await controller.init(); return a;
        },
        mount(a, direct = false, options = {}) {
            const opts = { controller: a.controller, onVisibility(visible) { a.visible.push(visible); hook('visible'); }, ...options };
            const view = direct ? new window.LocalItabScratchpad.View(host, opts) : window.LocalItabScratchpad.mount(host, opts);
            a.view = view; a.views.push(view); a.nodes = Object.fromEntries(Object.entries(view).filter(([, node]) => node?.tagName && node !== host));
            a.children = [...host.children]; return view;
        },
        async settle() { await Promise.allSettled(actors.flatMap(a => a.requests)); await tick(); for (const a of actors) a.controller.cancelTimer(); }
    };
    t.after(async () => { hooks.clear(); while (restores.length) restores.pop()(); for (const a of actors) { a.backend.readGate?.resolve(); a.backend.writeGate?.resolve(); }
        await h.settle(); for (const a of actors) { for (const v of a.views) try { v.destroy(); } catch (_) {} a.controller.destroy(); } });
    return h;
}
function ui(h, a) { return { hidden: h.host.hidden, children: h.host.children.slice(), visible: a.visible.slice(), nodes: Object.fromEntries(Object.entries(a.nodes).map(([key, n]) => [key, {
    value: n.value, text: n.textContent, hidden: n.hidden, disabled: n.disabled, readOnly: n.readOnly, attributes: { ...n.attributes }
}])) }; }
function sameUI(h, a, expected) { const actual = ui(h, a); assert.equal(actual.children.length, expected.children.length); actual.children.forEach((n, i) => assert.equal(n === expected.children[i], true, 'newest child identity')); assert.deepEqual({ ...actual, children: [] }, { ...expected, children: [] }); }
function data(a) { const c = a.controller; return { state: c.state, error: c.error, draft: c.draft, generation: c.generation, loaded: c.loaded, pending: c.pending,
    pendingWrite: c.pendingWrite, conflict: c.conflict, composing: c.composing, readError: c.readError, writeError: c.writeError, bytes: a.bytes(), io: { ...a.io } }; }
function sameData(a, expected) { const actual = data(a); assert.equal(actual.state === expected.state, true); assert.equal(actual.error === expected.error, true); assert.deepEqual(actual, expected); }
async function pair(t, oldOptions = {}, nextOptions = {}) { const h = await model(t), a = await h.actor(oldOptions), b = await h.actor({ text: 'NEWEST saved 中文', ...nextOptions }); h.mount(a); await h.settle(); return { h, a, b }; }
async function conflict(a) { a.controller.setDraft(DRAFT); a.controller.cancelTimer(); await new api.Store(a.backend).mutate({ kind: 'content', value: 'Remote synthetic saved', revision: a.controller.state.revision }); await tick(); assert(a.controller.conflict); }
async function writeError(a, ack = false) { a.controller.setDraft(DRAFT); a.backend[ack ? 'failAck' : 'failWrite'] = true; await assert.rejects(a.controller.save(), { code: 'WRITE' }); a.backend.failWrite = a.backend.failAck = false; a.controller.cancelTimer(); }
async function importPreview(a) { a.view.chooseImport(); assert(a.view.importSession); const bytes = new TextEncoder().encode(IMPORT); a.nodes.importFile.files = [{ name: 'synthetic.txt', size: bytes.length, async arrayBuffer() { return bytes.buffer; } }]; await a.view.readImport(); assert.equal(a.nodes.importPreview.textContent, IMPORT); }
function once(h, object, key, action) { const original = object[key]; object[key] = function (...args) { object[key] = original; const result = original.apply(this, args); action(); return result; }; h.restores.push(() => { object[key] = original; }); }
function getter(h, object, key, action) { const own = Object.getOwnPropertyDescriptor(object, key), value = object[key]; const restore = () => { if (own) Object.defineProperty(object, key, own); else delete object[key]; }; h.restores.push(restore); Object.defineProperty(object, key, { configurable: true, get() { restore(); action(); return value; }, set(next) { restore(); object[key] = next; } }); }
for (const direct of [false, true]) for (const state of ['clean disabled', 'dirty', 'read error', 'write error', 'lost acknowledgement', 'conflict', 'composing']) test(`same host ${direct ? 'new View' : 'mount'}: old ${state} never repaints newest`, async t => {
    const { h, a, b } = await pair(t, { enabled: state !== 'clean disabled' }, { enabled: state === 'clean disabled' });
    if (state === 'dirty') a.controller.setDraft(DRAFT);
    if (state === 'read error') { a.backend.failRead = true; await assert.rejects(a.controller.refresh(), { code: 'READ' }); }
    if (state === 'write error' || state === 'lost acknowledgement') await writeError(a, state === 'lost acknowledgement');
    if (state === 'conflict') await conflict(a); if (state === 'composing') a.controller.setComposing(true);
    a.controller.cancelTimer(); h.mount(b, direct); await h.settle(); const expected = ui(h, b), original = data(a), newest = data(b);
    a.view.render(); a.controller.emit(); sameUI(h, b, expected); sameData(a, original); sameData(b, newest);
});
for (const type of ['input', 'compositionstart', 'compositionend']) test(`same host: detached old ${type} cannot edit retained Controller`, async t => {
    const { h, a, b } = await pair(t); h.mount(b); await h.settle(); const expected = ui(h, b), original = data(a), newest = data(b);
    a.nodes.textarea.value = DRAFT; a.nodes.textarea.dispatch(type); await h.settle(); sameData(a, original); sameData(b, newest); sameUI(h, b, expected);
});
for (const action of ['retry', 'useSaved', 'replace']) test(`same host: old ${action} cannot dispatch a real recovery`, async t => {
    const { h, a, b } = await pair(t); if (action === 'retry') await writeError(a); else await conflict(a);
    h.mount(b); await h.settle(); const expected = ui(h, b), original = data(a), newest = data(b); a.nodes[action].dispatch('click'); await h.settle(); sameData(a, original); sameData(b, newest); sameUI(h, b, expected);
});
test('same host: a real old import preview cannot apply to the old saved source', async t => {
    const { h, a, b } = await pair(t); await importPreview(a); h.mount(b); await h.settle(); const original = data(a), newest = data(b), expected = ui(h, b);
    a.nodes.importApply.dispatch('click'); await h.settle(); sameData(a, original); sameData(b, newest); sameUI(h, b, expected);
});
for (const outcome of ['success', 'failure', 'lost acknowledgement']) test(`same host: already-issued old write retains honest ${outcome} and newest UI`, async t => {
    const { h, a, b } = await pair(t, {}, { enabled: false }); a.controller.setDraft(DRAFT); a.backend.writeGate = deferred(); a.backend.writeEntered = deferred();
    if (outcome === 'failure') a.backend.failWrite = true; if (outcome === 'lost acknowledgement') a.backend.failAck = true;
    const pending = a.controller.save(); a.requests.push(pending); await a.backend.writeEntered.promise; h.mount(b); await tick(); const expected = ui(h, b), newest = data(b);
    assert(a.view.hasUncommittedWork()); assert(!a.controller.closed); a.backend.writeGate.resolve(); await h.settle();
    assert.equal(a.io.commits, outcome === 'failure' ? 0 : 1); assert.equal(a.controller.pending, false); assert.equal(a.controller.draft, DRAFT);
    if (outcome !== 'success') { assert.equal(a.controller.error.code, 'WRITE'); assert(a.controller.writeError); } else assert.equal(a.controller.state.content, DRAFT);
    sameUI(h, b, expected); sameData(b, newest);
});
for (const old of ['dirty', 'write error', 'conflict', 'composing']) test(`same host: old ${old} still protects uncommitted work and destroys only itself`, async t => {
    const { h, a, b } = await pair(t); if (old === 'dirty') a.controller.setDraft(DRAFT); if (old === 'write error') await writeError(a); if (old === 'conflict') await conflict(a); if (old === 'composing') a.controller.setComposing(true);
    h.mount(b); await h.settle(); assert(a.view.hasUncommittedWork()); const event = { count: 0, preventDefault() { this.count++; } }; a.view.beforeUnload(event); assert.equal(event.count, 1);
    const expected = ui(h, b), newest = data(b); a.view.controller = b.controller; a.view.unsubscribe = () => { throw Error('foreign unsubscribe must not run'); };
    a.view.destroy(); a.view.closed = false; a.view.destroy(); assert(a.controller.closed); assert(!b.controller.closed); sameUI(h, b, expected); sameData(b, newest);
});
for (const levels of [2, 3]) for (const restore of ['none', 'old nodes', 'public fields']) test(`same host: ${levels} owners cannot resurrect after newest destroy and ${restore}`, async t => {
    const { h, a, b } = await pair(t, { enabled: false }); h.mount(b); let c = b; if (levels === 3) { c = await h.actor({ text: 'THIRD saved' }); h.mount(c, true); }
    await h.settle(); c.view.destroy(); if (restore === 'old nodes') h.host.replaceChildren(...a.children); if (restore === 'public fields') { a.view.closed = false; c.view.closed = false; a.view.copySelectionOwner.valid = true; }
    const before = h.host.hidden, old = data(a), calls = a.visible.slice(); a.nodes.textarea.value = DRAFT; a.nodes.textarea.dispatch('input'); a.view.render(); a.controller.emit(); await h.settle();
    assert.equal(h.host.hidden, before); assert.deepEqual(a.visible, calls); sameData(a, old);
});
for (const state of ['plain', 'dirty', 'read error', 'closed Controller', 'late workspace']) test(`read-only recovery: superseded original ${state} exports exact retained draft`, async t => {
    const { h, a, b } = await pair(t); if (state === 'dirty') a.controller.setDraft(DRAFT); if (state === 'read error') { a.backend.failRead = true; await assert.rejects(a.controller.refresh(), { code: 'READ' }); }
    if (state === 'closed Controller') a.controller.destroy(); if (state === 'late workspace') { a.backend.workspace = { id: 'late', generation: 1 }; h.window.LocalItabWorkspaces = { session: a.backend.workspace }; }
    h.mount(b); await h.settle(); const original = data(a), newest = data(b), expected = ui(h, b); a.view.exportText();
    assert.equal(h.effects.filter(e => e[0] === 'download').length, 1); const blob = h.effects.find(e => e[0] === 'blob')[1]; assert.deepEqual(Buffer.from(await blob.arrayBuffer()), Buffer.from(a.controller.draft));
    sameData(a, original); sameData(b, newest); sameUI(h, b, expected);
});
for (const mode of ['hidden host', 'detached host', 'detached textarea', 'detached controls', 'disabled module', 'hidden document']) test(`single-owner positive: ${mode} retains original editor and recovery`, async t => {
    const { h, a } = await pair(t, { enabled: mode !== 'disabled module' }); if (mode === 'hidden host') h.host.hidden = true; if (mode === 'detached host') h.host.remove();
    if (mode === 'detached textarea') a.nodes.textarea.remove(); if (mode === 'detached controls') a.nodes.retry.parentElement.remove(); if (mode === 'hidden document') h.document.hidden = true;
    a.nodes.textarea.value = DRAFT; a.nodes.textarea.dispatch('input'); assert.equal(a.controller.draft, DRAFT); a.controller.cancelTimer(); a.nodes.retry.dispatch('click'); await h.settle(); assert.equal(JSON.parse(a.bytes()).content, DRAFT);
});
for (const boundary of ['classList', 'aria translation', 'host attribute', 'replaceChildren', 'selection invalidation', 'saved invalidation', 'subscribe', 'visibility']) test(`constructor reentry: newest nested mount at ${boundary} owns shared host`, async t => {
    const { h, a, b } = await pair(t), c = await h.actor({ enabled: false, text: 'NESTED NEWEST' }); let expected, mounted = false;
    const nested = () => { if (mounted) return; mounted = true; h.mount(c); expected = ui(h, c); };
    if (boundary === 'classList') getter(h, h.host, 'classList', nested);
    if (boundary === 'aria translation') h.hooks.set('t:scratchpadTitle', nested);
    if (boundary === 'host attribute') once(h, h.host, 'setAttribute', nested);
    if (boundary === 'replaceChildren') once(h, h.host, 'replaceChildren', nested);
    if (boundary === 'selection invalidation') a.view.copySelectionOwner.invalidate = nested;
    if (boundary === 'saved invalidation') a.view.copySavedOwner.invalidate = nested;
    if (boundary === 'subscribe') once(h, b.controller, 'subscribe', nested);
    if (boundary === 'visibility') h.hooks.set('visible', nested);
    h.mount(b); assert(mounted); sameUI(h, c, expected); await h.settle(); sameUI(h, c, expected);
    b.controller.setDraft(DRAFT); b.controller.cancelTimer(); a.controller.setDraft('older'); a.controller.cancelTimer(); sameUI(h, c, expected);
    c.view.copyText(); assert.equal(c.view.copySelectionOwner.valid, true); assert(!c.controller.closed);
});
for (const boundary of ['title', 'replaceChildren', 'selection invalidation', 'saved invalidation', 'subscribe', 'visibility']) for (const thrown of [Error('synthetic constructor failure'), 0]) test(`constructor exception: ${boundary} preserves original thrown value and no obsolete subscription (${String(thrown)})`, async t => {
    const { h, a, b } = await pair(t); const fail = () => { throw thrown; };
    if (boundary === 'title') h.hooks.set('t:scratchpadTitle', fail);
    if (boundary === 'replaceChildren') once(h, h.host, 'replaceChildren', fail);
    if (boundary === 'selection invalidation') a.view.copySelectionOwner.invalidate = fail;
    if (boundary === 'saved invalidation') a.view.copySavedOwner.invalidate = fail;
    if (boundary === 'subscribe') getter(h, b.controller, 'subscribe', fail);
    if (boundary === 'visibility') h.hooks.set('visible', fail);
    let caught = false; try { h.mount(b); } catch (error) { caught = true; assert.equal(error, thrown); } assert(caught);
    assert(!a.controller.closed); assert(!b.controller.closed); assert.equal(b.controller.listeners.size, 0, 'failed constructor must release its render subscription');
    const c = await h.actor({ enabled: false, text: 'RECOVERY newest' }); h.mount(c); await h.settle(); const expected = ui(h, c);
    a.controller.setDraft(DRAFT); b.controller.setDraft('failed constructor draft'); a.controller.cancelTimer(); b.controller.cancelTimer(); sameUI(h, c, expected);
});
for (const boundary of ['store getter', 'destroy getter', 'classList getter', 'classList add', 'title translation', 'host hidden', 'replaceChildren getter']) test(`construction claim precedes old emission at ${boundary}`, async t => {
    const { h, a, b } = await pair(t, { enabled: false }); let hit = false; const old = () => { hit = true; const before = h.host.hidden, visible = a.visible.slice(); a.controller.setDraft(DRAFT); a.controller.cancelTimer(); assert.equal(h.host.hidden, before); assert.deepEqual(a.visible, visible); };
    if (boundary === 'store getter') getter(h, b.controller, 'store', old);
    if (boundary === 'destroy getter') getter(h, b.controller, 'destroy', old);
    if (boundary === 'classList getter') getter(h, h.host, 'classList', old);
    if (boundary === 'classList add') once(h, h.host.classList, 'add', old);
    if (boundary === 'title translation') h.hooks.set('t:scratchpadTitle', old);
    if (boundary === 'replaceChildren getter') getter(h, h.host, 'replaceChildren', old);
    if (boundary === 'host hidden') { let value = h.host.hidden; Object.defineProperty(h.host, 'hidden', { configurable: true, get() { return value; }, set(next) { value = next; delete h.host.hidden; h.host.hidden = next; old(); } }); }
    h.mount(b); assert(hit); await h.settle(); assert.equal(b.nodes.textarea.value, b.controller.draft); assert(a.view.hasUncommittedWork());
});
for (const boundary of ['store getter', 'destroy getter', 'replaceChildren getter', 'subscribe getter', 'add listener']) test(`constructor lookup reentry: nested newest mount at ${boundary}`, async t => {
    const { h, a, b } = await pair(t), c = await h.actor({ text: 'THIRD live' }); let expected;
    const nested = () => { h.mount(c); expected = ui(h, c); };
    if (boundary === 'store getter') getter(h, b.controller, 'store', nested);
    if (boundary === 'destroy getter') getter(h, b.controller, 'destroy', nested);
    if (boundary === 'replaceChildren getter') getter(h, h.host, 'replaceChildren', nested);
    if (boundary === 'subscribe getter') getter(h, b.controller, 'subscribe', nested);
    if (boundary === 'add listener') once(h, h.host, 'addEventListener', nested);
    h.mount(b); assert(expected); sameUI(h, c, expected); await h.settle(); sameUI(h, c, expected);
    await c.view.copyText(); assert(h.effects.some(e => e[0] === 'copy' && e[1] === c.controller.draft)); assert.equal(c.view.selectionOwned(c.view.copySelectionOwner), true);
    a.view.destroy(); b.view.destroy(); assert(!c.controller.closed); assert.equal(c.view.selectionOwned(c.view.copySelectionOwner), true);
});
for (const boundary of ['title', 'selection invalidation', 'saved invalidation', 'visibility']) test(`constructor nested throw: ${boundary} never retires the newer successful mount`, async t => {
    const { h, a, b } = await pair(t), c = await h.actor({ enabled: false, text: 'LAST newest' }); const failure = Error('synthetic outer construction throw'); let expected;
    const nested = () => { h.mount(c); expected = ui(h, c); throw failure; };
    if (boundary === 'title') h.hooks.set('t:scratchpadTitle', nested);
    if (boundary === 'selection invalidation') a.view.copySelectionOwner.invalidate = nested;
    if (boundary === 'saved invalidation') a.view.copySavedOwner.invalidate = nested;
    if (boundary === 'visibility') h.hooks.set('visible', nested);
    assert.throws(() => h.mount(b), error => error === failure); assert(expected); sameUI(h, c, expected); await h.settle(); sameUI(h, c, expected);
    assert(!c.controller.closed); assert(!b.controller.closed); assert.equal(b.controller.listeners.size, 0);
});
for (const state of ['write error', 'conflict', 'dirty']) test(`old direct Controller recovery remains deliberate and honest after ${state} remount`, async t => {
    const { h, a, b } = await pair(t, {}, { enabled: false }); if (state === 'write error') await writeError(a); if (state === 'conflict') await conflict(a); if (state === 'dirty') a.controller.setDraft(DRAFT);
    h.mount(b); await h.settle(); const expected = ui(h, b), newest = data(b);
    if (state === 'conflict') await a.controller.replaceWithDraft(); else await a.controller.retry(); await h.settle();
    assert.equal(a.controller.state.content, DRAFT); assert.equal(a.controller.draft, DRAFT); assert(!a.view.hasUncommittedWork()); sameUI(h, b, expected); sameData(b, newest);
});
for (const outcome of ['resolve', 'reject']) test(`old issued clipboard ${outcome} cannot clear newest real copy feedback`, async t => {
    const { h, a, b } = await pair(t); let resolve, reject; const waiting = new Promise((yes, no) => { resolve = yes; reject = no; });
    a.view.clipboard = { writeText(text) { h.effects.push(['old copy', text]); return waiting; } };
    const pending = a.view.copyText(); a.requests.push(pending); assert(a.view.copyAttempt); h.mount(b); await tick(); await b.view.copyText(); const receipt = b.view.copyReceipt, expected = ui(h, b);
    if (outcome === 'resolve') resolve(); else reject(Error('synthetic clipboard failure')); await h.settle();
    assert.equal(b.view.copyReceipt === receipt, true); assert(receipt.valid); sameUI(h, b, expected); assert.equal(h.effects.filter(e => e[0] === 'old copy').length, 1);
});
for (const boundary of ['render translation', 'editor cleanup', 'recovery lookup', 'import lookup']) test(`in-flight old ${boundary} stops after a genuine newest mount`, async t => {
    const { h, a, b } = await pair(t, {}, { enabled: false }); if (boundary === 'recovery lookup') await writeError(a); if (boundary === 'import lookup') await importPreview(a);
    let expected, original; const nested = () => { h.mount(b); expected = ui(h, b); original = data(a); };
    if (boundary === 'render translation') h.hooks.set('t:scratchpadLines', nested);
    if (boundary === 'editor cleanup') once(h, a.view, 'invalidateCopy', nested);
    if (boundary === 'recovery lookup') getter(h, a.controller, 'retry', nested);
    if (boundary === 'import lookup') getter(h, a.controller, 'setDraft', nested);
    if (boundary === 'render translation') a.view.render();
    if (boundary === 'editor cleanup') { a.nodes.textarea.value = DRAFT; a.nodes.textarea.dispatch('input'); }
    if (boundary === 'recovery lookup') a.nodes.retry.dispatch('click');
    if (boundary === 'import lookup') a.view.applyImport();
    assert(expected); sameData(a, original); sameUI(h, b, expected); await h.settle(); sameUI(h, b, expected);
});
test('destroy with same explicitly shared Controller retains the pre-existing caller-owned lifetime contract', async t => {
    const { h, a } = await pair(t); const first = a.view; h.mount(a); await h.settle(); first.destroy(); assert(a.controller.closed); assert.equal(a.view.controller === first.controller, true);
});
test('constructor init lookup: nested newest mount prevents old init invocation and read', async t => {
    const { h, a, b } = await pair(t), c = await h.actor({ enabled: false, text: 'INIT LOOKUP newest' });
    const init = b.controller.init; let calls = 0, expected;
    b.controller.init = function (...args) { calls++; assert.equal(this === b.controller, true); return init.apply(this, args); };
    getter(h, b.controller, 'init', () => { h.mount(c); expected = ui(h, c); });
    const original = data(b); h.mount(b); assert(expected); await h.settle();
    assert.equal(calls, 0, 'superseded initialization must not dispatch'); sameData(b, original); sameUI(h, c, expected);
    assert(!a.controller.closed); assert(!b.controller.closed); assert(!c.controller.closed);
});
test('constructor entered init: an already-dispatched original read settles after nested newest mount', async t => {
    const { h, a, b } = await pair(t), c = await h.actor({ enabled: false, text: 'ENTERED INIT newest' });
    const init = b.controller.init; b.backend.readGate = deferred(); let calls = 0, expected, pending;
    b.controller.init = function (...args) { calls++; assert.equal(this === b.controller, true); pending = init.apply(this, args);
        b.requests.push(pending); h.mount(c); expected = ui(h, c); return pending; };
    const reads = b.io.reads; h.mount(b); assert(expected); assert.equal(calls, 1); await tick(); assert.equal(b.io.reads, reads + 1);
    b.backend.readGate.resolve(); await h.settle(); assert.equal((await pending).content, 'NEWEST saved 中文');
    assert.equal(calls, 1); assert.equal(b.io.reads, reads + 1); assert.equal(b.controller.draft, 'NEWEST saved 中文'); sameUI(h, c, expected);
    assert(!a.controller.closed); assert(!b.controller.closed); assert(!c.controller.closed);
});
