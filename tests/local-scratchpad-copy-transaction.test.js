const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const api = require('../shared/local-scratchpad-store');
const { Controller } = require('../shared/local-scratchpad-controller');
const tick = () => new Promise(resolve => setImmediate(resolve));
const gate = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const DRAFT = '\uFEFFLead\r\n selected 中文 😀 e\u0301\r<draft>\nEnd';
const SAVED = '\uFEFFRemote\r\nSaved 中文 🪷\r<saved>\n';
const routes = ['current', 'selection', 'saved'];
const methods = { current: 'copyText', selection: 'copySelectedText', saved: 'copySavedText' };
const success = { current: 'Current text copied.', selection: 'Selected text copied.', saved: 'Saved text copied.' };

// Synthetic public-field fault injection, not normal workspace navigation or
// historical-loss evidence. Real Store/Controller plus explicit Promise gates;
// this deterministic DOM model never accesses the OS clipboard/native Chrome.
async function model(t) {
    const document = createDocument({ blurUnavailableFocus: true }), events = new Map(), observers = [], effects = [], sources = [], documentHandlers = new Map();
    const addDocumentListener = document.addEventListener;
    document.addEventListener = function (type, fn, ...args) { const list = documentHandlers.get(type) || []; list.push(fn); documentHandlers.set(type, list); return addDocumentListener.call(this, type, fn, ...args); };
    const create = document.createElement;
    document.createElement = tag => {
        const node = create(tag);
        if (tag === 'textarea') {
            let value = '';
            Object.defineProperty(node, 'value', { configurable: true, get: () => value, set: next => { value = String(next).replace(/\r\n?/g, '\n'); } });
            node.selectionStart = node.selectionEnd = 0; node.selectionDirection = 'none';
            node.setSelectionRange = () => { effects.push('selection setter'); throw Error('Unrequested selection mutation'); };
        }
        return node;
    };
    document.execCommand = () => { effects.push('fallback'); throw Error('Unrequested fallback'); };
    const window = { LocalItabScratchpad: { ...api },
        navigator: { permissions: { query() { effects.push('permissions'); throw Error('Unrequested permission'); } } },
        fetch() { effects.push('network'); throw Error('Unrequested network'); },
        getComputedStyle: node => ({ visibility: node.style.visibility || 'visible', display: node.style.display || 'block' }),
        addEventListener(type, fn) { const set = events.get(type) || new Set(); set.add(fn); events.set(type, set); },
        removeEventListener(type, fn) { events.get(type)?.delete(fn); },
        MutationObserver: class {
            constructor(callback) { this.callback = callback; this.records = []; this.targets = []; this.disconnects = 0; observers.push(this); }
            observe(target, config) { this.targets.push({ target, config }); this.active = true; }
            disconnect() { this.disconnects++; this.active = false; this.records = []; }
            takeRecords() { const records = this.records; this.records = []; return records; }
        }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../shared/local-scratchpad-view.js'), 'utf8'), { window, document });
    async function addSource(label = 'original') {
        let raw = api.validate({ ...api.initial(), enabled: true, content: 'Synthetic baseline ' + label }), queue = Promise.resolve();
        const listeners = new Set(), calls = [], gates = [], counts = { reads: 0, writes: 0, mutations: 0 };
        const backend = {
            lock(action) { const next = queue.then(action); queue = next.catch(() => {}); return next; },
            async read() { counts.reads++; return structuredClone(raw); },
            async write(value) { counts.writes++; raw = structuredClone(value); for (const fn of [...listeners]) fn(); },
            subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
        };
        const store = new api.Store(backend), mutate = store.mutate;
        store.mutate = function (...args) { counts.mutations++; return mutate.apply(this, args); };
        const controller = new Controller(store, { delay: 60000 }), host = document.createElement('article'); document.body.append(host);
        const clipboard = { writeText(value) { const pending = gate(); calls.push(value); gates.push(pending); return pending.promise; }, readText() { effects.push('clipboard read'); throw Error('Unrequested read'); } };
        const view = new window.LocalItabScratchpad.View(host, { controller, clipboard });
        const source = { label, host, view, controller, store, backend, clipboard, calls, gates, counts,
            bytes: () => JSON.stringify(raw), release: () => gates.forEach(g => g.resolve()),
            nodes: Object.fromEntries(Object.entries(view).filter(([, value]) => value?.tagName)),
            owners: { copySelectionOwner: view.copySelectionOwner, copySavedOwner: view.copySavedOwner } };
        sources.push(source); await tick();
        controller.setDraft(DRAFT); controller.cancelTimer();
        await backend.write({ ...raw, revision: raw.revision + 1, content: SAVED }); await tick();
        assert(controller.conflict, 'real backend update creates saved conflict');
        view.textarea.selectionStart = view.textarea.value.indexOf(' selected');
        view.textarea.selectionEnd = view.textarea.value.indexOf('\nEnd'); view.textarea.selectionDirection = 'backward';
        return source;
    }
    const own = await addSource();
    t.after(async () => { for (const h of sources) h.release(); await tick(); for (const h of sources) { Object.assign(h.view, h.nodes, h.owners, { host: h.host, controller: h.controller }); h.view.destroy(); h.controller.destroy(); } });
    return { ...own, document, window, observers, effects, addSource, documentHandlers,
        event(type) { for (const fn of [...(events.get(type) || [])]) fn({ type }); },
        documentEvent(type) { return document.listeners.get(type)?.({ type, target: document }); },
        queue(record) { for (const o of observers.filter(o => o.active)) o.records.push(record); }
    };
}
const copy = (m, route) => m.view[methods[route]]();
const expected = (m, route) => route === 'current' ? DRAFT : route === 'saved' ? SAVED : m.nodes.textarea.value.slice(m.nodes.textarea.selectionStart, m.nodes.textarea.selectionEnd);
const remember = m => ({ counts: { ...m.counts }, bytes: m.bytes(), draft: m.controller.draft, state: m.controller.state, generation: m.controller.generation,
    conflict: m.controller.conflict, pending: m.controller.pending, error: m.controller.error, focus: m.document?.activeElement,
    selection: [m.nodes.textarea.selectionStart, m.nodes.textarea.selectionEnd, m.nodes.textarea.selectionDirection] });
function watchAttributes(node) { const set = node.setAttribute; let writes = 0; node.setAttribute = function (...args) { writes++; return set.apply(this, args); }; return () => writes; }

for (const route of routes) test(`transaction positive: ${route} exact payload, shared lock, actual settlement and explicit next copy`, async t => {
    const m = await model(t), before = remember(m), payload = expected(m, route), first = copy(m, route), receipt = m.view.copyReceipt;
    assert.deepEqual(m.calls, [payload]); for (const other of routes) await copy(m, other);
    assert.deepEqual(m.calls, [payload]); assert.equal(m.view.copyAttempt, receipt);
    m.gates[0].resolve(); await first; assert.equal(m.view.copyAttempt, null); assert.equal(m.nodes.copyStatus.textContent, success[route]);
    const next = copy(m, route); assert.deepEqual(m.calls, [payload, payload]); m.gates[1].resolve(); await next;
    assert.deepEqual(remember(m), before); assert.deepEqual(m.effects, []);
});

for (const route of routes) for (const fields of ['attempt', 'both']) for (const ending of ['resolve', 'reject']) test(`transaction lock: ${route} ${fields} public null cannot release issued ${ending} write`, async t => {
    const m = await model(t), before = remember(m), first = copy(m, route), payload = expected(m, route);
    m.view.copyAttempt = null; if (fields === 'both') m.view.copyReceipt = null;
    for (const other of routes) copy(m, other);
    const count = m.calls.length; m.gates[0][ending](ending === 'reject' ? Error('Synthetic clipboard denial') : undefined);
    m.release(); await first; await tick();
    assert.equal(count, 1, 'public mirrors must not unlock the actual issued write'); assert.deepEqual(remember(m), before); assert.deepEqual(m.effects, []);
    const next = copy(m, route); assert.equal(m.calls.length, 2, 'actual settlement allows an explicit next user copy'); m.release(); await next;
});

for (const route of routes) for (const trigger of ['invalidate', 'visibility', 'observer drain', 'source rejection', 'destroy']) test(`transaction cleanup: displaced ${route} receipt remains owned during ${trigger}`, async t => {
    const m = await model(t), first = copy(m, route), receipt = m.view.copyReceipt, observer = m.observers.find(o => o.active);
    m.view.copyReceipt = null;
    if (trigger === 'invalidate') m.view.invalidateCopy();
    if (trigger === 'visibility') await m.documentEvent('visibilitychange');
    if (trigger === 'observer drain') { m.queue({ type: 'attributes', target: m.host, attributeName: 'hidden' }); m.view.copyCurrent(receipt); }
    if (trigger === 'source rejection') { const foreign = await m.addSource('foreign'); m.view.controller = foreign.controller; m.view.render(); m.view.controller = m.controller; }
    if (trigger === 'destroy') m.view.destroy();
    const valid = receipt.valid, active = observer.active, count = observer.disconnects;
    m.gates[0].resolve(); await first;
    assert.equal(valid, false, 'original receipt must be retired even when its public mirror is lost');
    assert.equal(active, false, 'original observer must be disconnected'); assert.equal(count, 1, 'original cleanup runs once');
    assert.equal(observer.disconnects, 1); assert.deepEqual(m.calls, [expected(m, route)]); assert.deepEqual(m.effects, []);
});

for (const route of routes) for (const trigger of ['invalidate', 'visibility', 'settlement']) test(`transaction ownership: ${route} callback cannot clean or repaint a foreign receipt at ${trigger}`, async t => {
    const m = await model(t), foreign = await m.addSource('foreign'), first = copy(m, route), original = m.view.copyReceipt;
    const ownVisibility = m.documentHandlers.get('visibilitychange').at(-1);
    const second = copy(foreign, route), theirs = foreign.view.copyReceipt, status = foreign.nodes.copyStatus.textContent, observed = m.observers.find(o => o.active);
    let foreignCleanup = 0; const cleanup = theirs.cleanup; theirs.cleanup = () => { foreignCleanup++; cleanup(); };
    m.view.copyReceipt = theirs; m.view.copyStatus = foreign.nodes.copyStatus;
    if (trigger === 'invalidate') m.view.invalidateCopy();
    if (trigger === 'visibility') ownVisibility({ target: m.document });
    m.gates[0].resolve(); await first;
    assert.equal(foreignCleanup, 0, 'the original View cannot call the foreign receipt cleanup');
    assert.equal(theirs.valid, true); assert.equal(foreign.nodes.copyStatus.textContent, status);
    assert.equal(m.view.copyReceipt, theirs); assert.equal(original.valid, false); assert.equal(observed.active, false);
    foreign.release(); await second;
});

for (const route of routes) for (const phase of ['clipboard getter', 'write invocation']) test(`transaction reentry: ${route} public-null ${phase} cannot issue a nested write`, async t => {
    const m = await model(t), original = m.clipboard.writeText, nested = [];
    let entered = false, reserved;
    function reenter() { if (entered) return; entered = true; reserved = m.view.copyReceipt; m.view.copyAttempt = null; for (const other of routes) nested.push(copy(m, other)); }
    if (phase === 'clipboard getter') Object.defineProperty(m.clipboard, 'writeText', { configurable: true, get() { reenter(); return original; } });
    else m.clipboard.writeText = function (value) { const result = original.call(this, value); reenter(); return result; };
    const pending = copy(m, route), count = m.calls.length; m.release(); await pending; await Promise.all(nested);
    assert.equal(count, 1, 'the reserved transaction survives synchronous public mirror assignment');
    assert.deepEqual(m.calls, [expected(m, route)]); assert(m.view.copyReceipt === reserved, 'nested entry cannot replace the reserved original feedback'); assert.deepEqual(m.effects, []);
});

for (const route of routes) for (const ending of ['resolve', 'reject']) test(`transaction finalization: ${route} ${ending} cannot refresh substituted foreign buttons`, async t => {
    const m = await model(t), foreign = await m.addSource('foreign'), pending = copy(m, route);
    const writes = ['copyButton', 'copySelectionButton', 'copySavedButton'].map(name => { m.view[name] = foreign.nodes[name]; return watchAttributes(foreign.nodes[name]); });
    const before = foreign.nodes.copyStatus.textContent;
    m.gates[0][ending](ending === 'reject' ? Error('Synthetic denied clipboard') : undefined); await pending;
    assert.deepEqual(writes.map(count => count()), [0, 0, 0], 'late final refresh must not act on replacement controls');
    assert.equal(foreign.nodes.copyStatus.textContent, before); assert.deepEqual(m.effects, []);
});

for (const route of routes) test(`transaction cleanup reentry: ${route} preserves a newer original receipt installed after settled cleanup`, async t => {
    const m = await model(t), first = copy(m, route); m.release(); await first;
    const old = m.view.copyReceipt, cleanup = old.cleanup; let next, latest, entered = false;
    old.cleanup = () => { cleanup(); if (entered) return; entered = true; next = copy(m, route); latest = m.view.copyReceipt; };
    m.view.invalidateCopy();
    assert(latest !== old); assert(m.view.copyReceipt === latest, 'old cleanup cannot erase newer feedback');
    assert.equal(latest.valid, true); assert.match(m.nodes.copyStatus.textContent, /Copying/);
    m.release(); await next; assert.equal(m.nodes.copyStatus.textContent, success[route]);
});

for (const route of routes) test(`transaction source: ${route} matching foreign Controller cannot acknowledge the issued original write`, async t => {
    const m = await model(t), foreign = await m.addSource('foreign'), pending = copy(m, route), original = m.view.copyReceipt;
    assert.equal(foreign.controller.draft, m.controller.draft); assert.equal(foreign.controller.generation, m.controller.generation);
    m.view.controller = foreign.controller; m.gates[0].resolve(); await pending;
    assert.equal(original.valid, false); assert.notEqual(m.nodes.copyStatus.textContent, success[route]);
    assert.deepEqual(m.calls, [expected(m, route)]); assert.deepEqual(m.effects, []);
});

for (const route of routes) test(`transaction reservation: ${route} DOM availability getter cannot admit a nested route before the original lock`, async t => {
    const m = await model(t), origin = m.nodes[route === 'current' ? 'copyButton' : route === 'selection' ? 'copySelectionButton' : 'copySavedButton'];
    const rects = origin.getClientRects; let entered = false; const nested = [];
    origin.getClientRects = function () { if (!entered) { entered = true; nested.push(copy(m, 'current')); } return rects.call(this); };
    const pending = copy(m, route), count = m.calls.length; m.release(); await pending; await Promise.all(nested);
    assert.equal(count, 1); assert.deepEqual(m.calls, [expected(m, route)]);
});

for (const route of routes) test(`transaction cleanup reentry: ${route} foreign receipt/status installed during original cleanup stays untouched`, async t => {
    const m = await model(t), foreign = await m.addSource('foreign'), pending = copy(m, route), other = copy(foreign, route);
    const old = m.view.copyReceipt, theirs = foreign.view.copyReceipt, cleanup = old.cleanup, status = foreign.nodes.copyStatus.textContent;
    old.cleanup = () => { cleanup(); m.view.copyReceipt = theirs; m.view.copyStatus = foreign.nodes.copyStatus; };
    m.view.invalidateCopy();
    assert(m.view.copyReceipt === theirs); assert.equal(theirs.valid, true); assert.equal(foreign.nodes.copyStatus.textContent, status);
    m.release(); await pending; assert(m.view.copyReceipt === theirs); assert.equal(foreign.nodes.copyStatus.textContent, status);
    foreign.release(); await other;
});

for (const route of routes) test(`transaction clipboard capture: ${route} uses one captured method and receiver while replacement is for the next explicit copy`, async t => {
    const m = await model(t), original = m.clipboard.writeText; let reads = 0, receiver;
    const replacement = { writeText(value) { return original.call(this, value); } };
    Object.defineProperty(m.clipboard, 'writeText', { configurable: true, get() { reads++; m.view.clipboard = replacement; return function (value) { receiver = this; return original.call(this, value); }; } });
    const pending = copy(m, route); assert.equal(reads, 1); assert(receiver === m.clipboard); assert.deepEqual(m.calls, [expected(m, route)]);
    m.release(); await pending; assert.equal(m.nodes.copyStatus.textContent, success[route]);
    const next = copy(m, route); m.release(); await next; assert.equal(reads, 1); assert.equal(m.calls.length, 2);
});
