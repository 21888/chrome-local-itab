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

// Synthetic DOM/public-field fault injection, not normal workspace navigation or
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
    vm.runInNewContext(fs.readFileSync(process.env.SCRATCHPAD_VIEW_SOURCE || path.join(__dirname, '../shared/local-scratchpad-view.js'), 'utf8'), { window, document });
    async function addSource(label = 'original', conflict = true) {
        let raw = api.validate({ ...api.initial(), enabled: true, content: 'Synthetic baseline ' + label }), queue = Promise.resolve();
        const listeners = new Set(), calls = [], gates = [], counts = { reads: 0, writes: 0, mutations: 0, locks: 0, commits: 0 };
        const backend = {
            lock(action) { counts.locks++; const next = queue.then(action); queue = next.catch(() => {}); return next; },
            async read() { counts.reads++; if (backend.readError) throw backend.readError; return structuredClone(raw); },
            async write(value) { counts.writes++; if (backend.writeGate) await backend.writeGate; if (backend.writeError) throw backend.writeError; raw = structuredClone(value); counts.commits++; for (const fn of [...listeners]) fn(); if (backend.ackError) throw backend.ackError; },
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
        if (conflict) { await backend.write({ ...raw, revision: raw.revision + 1, content: SAVED }); await tick();
        assert(controller.conflict, 'real backend update creates saved conflict'); }
        view.textarea.selectionStart = view.textarea.value.indexOf(' selected');
        view.textarea.selectionEnd = view.textarea.value.indexOf('\nEnd'); view.textarea.selectionDirection = 'backward';
        return source;
    }
    const own = await addSource();
    t.after(async () => { for (const h of sources) h.release(); await tick(); for (const h of sources) { Object.assign(h.view, h.nodes, h.owners, { host: h.host, controller: h.controller }); try { h.view.destroy(); } finally { h.controller.destroy(); } } });
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

// The shared DOM helper intentionally does not detach or adopt automatically.
// Explicit remove + recursive document reassignment models actual adoption.
function move(node, parent, document = parent?.ownerDocument) {
    const previous = { parent: node.parentElement, document: node.ownerDocument };
    node.remove();
    if (document) { const adopt = item => { item.ownerDocument = document; for (const child of item.children) adopt(child); }; adopt(node); }
    parent?.append(node);
    return () => move(node, previous.parent, previous.document);
}
function foreignHost(m, transfer) {
    const doc = transfer === 'same-document' ? m.document : createDocument();
    const host = doc.createElement('article'); doc.body.append(host); return host;
}
function textAndHidden(node) { return { text: node.textContent, hidden: node.hidden }; }
function observeStatus(node) {
    let text = node.textContent, hidden = node.hidden, textWrites = 0, hiddenWrites = 0;
    Object.defineProperties(node, {
        textContent: { configurable: true, get: () => text, set(value) { textWrites++; text = value; } },
        hidden: { configurable: true, get: () => hidden, set(value) { hiddenWrites++; hidden = value; } }
    });
    return () => ({ textWrites, hiddenWrites });
}
async function assertLocked(m, route, first, ending = 'resolve') {
    const count = m.calls.length;
    m.view.copyAttempt = null;
    for (const other of routes) await copy(m, other);
    assert.equal(m.calls.length, count, 'public mirror loss never releases original issued promise');
    m.gates[0][ending](ending === 'reject' ? Error('Synthetic clipboard failure') : undefined);
    await first;
}

for (const route of routes) for (const transfer of ['same-document', 'cross-document']) for (const boundary of ['resolve', 'reject', 'invalidate', 'destroy']) {
    test(`feedback target: ${route} ${transfer} status survives ${boundary}`, async t => {
        const m = await model(t), before = remember(m), payload = expected(m, route), first = copy(m, route);
        const receipt = m.view.copyReceipt, observer = m.observers.find(o => o.active), status = m.nodes.copyStatus;
        const host = foreignHost(m, transfer), restore = move(status, host);
        assert.equal(status.ownerDocument, host.ownerDocument); assert.equal(status.parentElement, host); assert(!m.host.children.includes(status));
        status.textContent = 'New owner feedback'; status.hidden = false; const writes = observeStatus(status);
        if (boundary === 'invalidate') m.view.invalidateCopy(); if (boundary === 'destroy') m.view.destroy();
        await assertLocked(m, route, first, boundary === 'reject' ? 'reject' : 'resolve');
        assert.deepEqual(m.calls, [payload]); assert.deepEqual(textAndHidden(status), { text: 'New owner feedback', hidden: false });
        assert.deepEqual(writes(), { textWrites: 0, hiddenWrites: 0 }); assert.equal(receipt.valid, false); assert.equal(observer.disconnects, 1);
        assert.deepEqual(remember(m), before); assert.deepEqual(m.effects, []);
        restore();
        if (boundary !== 'destroy') { const next = copy(m, route); assert.equal(m.calls.length, 2); m.release(); await next; assert.equal(status.textContent, success[route]); }
    });
}

for (const route of routes) for (const transfer of ['same-document', 'cross-document']) for (const boundary of ['invalidate', 'destroy']) {
    test(`settled feedback target: ${route} ${transfer} survives ${boundary}`, async t => {
        const m = await model(t), first = copy(m, route); m.release(); await first;
        const status = m.nodes.copyStatus, restore = move(status, foreignHost(m, transfer));
        status.textContent = 'New settled owner feedback'; status.hidden = false; const writes = observeStatus(status), before = remember(m);
        m.view[boundary === 'destroy' ? 'destroy' : 'invalidateCopy']();
        assert.deepEqual(textAndHidden(status), { text: 'New settled owner feedback', hidden: false });
        assert.deepEqual(writes(), { textWrites: 0, hiddenWrites: 0 }); assert.deepEqual(remember(m), before); restore();
    });
}

for (const route of routes) for (const target of ['copyButton', 'copySelectionButton', 'copySavedButton', 'controls', 'host']) for (const transfer of ['same-document', 'cross-document']) {
    test(`final controls: ${route} ${transfer} ${target} receives no old aria writes`, async t => {
        const m = await model(t), before = remember(m), first = copy(m, route), status = m.nodes.copyStatus;
        const node = target === 'host' ? m.host : target === 'controls' ? m.nodes.copyButton.parentElement : m.nodes[target];
        const restore = move(node, foreignHost(m, transfer));
        const controls = ['copyButton', 'copySelectionButton', 'copySavedButton'].map(name => m.nodes[name]);
        controls.forEach(node => node.setAttribute('aria-disabled', 'foreign-state'));
        const writes = controls.map(watchAttributes); status.textContent = 'New target feedback';
        await assertLocked(m, route, first);
        assert.deepEqual(writes.map(count => count()), [0, 0, 0]);
        if (target === 'host') assert.equal(status.textContent, 'New target feedback');
        else { assert.equal(status.textContent, ''); assert.equal(status.hidden, true); }
        assert.deepEqual(remember(m), before); restore();
        const next = copy(m, route); assert.equal(m.calls.length, 2); m.release(); await next;
    });
}

for (const route of routes) for (const target of ['status', 'host', 'ancestor']) for (const boundary of ['invalidate', 'destroy']) {
    test(`owned detached feedback: ${route} detached ${target} clears at ${boundary}`, async t => {
        const m = await model(t), first = copy(m, route), status = m.nodes.copyStatus;
        const node = target === 'status' ? status : target === 'host' ? m.host : m.document.body;
        const restore = move(node, null); m.view[boundary === 'destroy' ? 'destroy' : 'invalidateCopy']();
        assert.equal(status.textContent, ''); assert.equal(status.hidden, true);
        await assertLocked(m, route, first); assert.equal(status.textContent, ''); restore();
    });
}

for (const route of routes) for (const transfer of ['same-document', 'cross-document']) for (const boundary of ['invalidate', 'destroy']) {
    test(`cleanup setter reentry: ${route} ${transfer} ${boundary} cannot hide newly owned status`, async t => {
        const m = await model(t), first = copy(m, route), status = m.nodes.copyStatus, host = foreignHost(m, transfer), parent = status.parentElement;
        let text = status.textContent, hidden = false, entered = false, foreignHides = 0;
        Object.defineProperties(status, {
            textContent: { configurable: true, get: () => text, set(value) { text = value; if (!entered && value === '') { entered = true; move(status, host); text = 'Feedback installed inside cleanup setter'; hidden = false; } } },
            hidden: { configurable: true, get: () => hidden, set(value) { if (entered) foreignHides++; hidden = value; } }
        });
        m.view[boundary === 'destroy' ? 'destroy' : 'invalidateCopy'](); await assertLocked(m, route, first);
        assert(entered); assert.equal(text, 'Feedback installed inside cleanup setter'); assert.equal(hidden, false); assert.equal(foreignHides, 0);
        move(status, parent, m.document);
    });
}

for (const route of routes) for (const transfer of ['same-document', 'cross-document']) {
    test(`final setter reentry: ${route} ${transfer} first button cannot authorize writes to moved next controls`, async t => {
        const m = await model(t), first = copy(m, route), firstButton = m.nodes.copyButton, nextButton = m.nodes.copySelectionButton;
        const set = firstButton.setAttribute, host = foreignHost(m, transfer); let restore, entered = false;
        firstButton.setAttribute = function (...args) { set.apply(this, args); if (!entered) { entered = true; restore = move(nextButton, host); nextButton.attributes['aria-disabled'] = 'new-control-state'; } };
        const writes = watchAttributes(nextButton); m.release(); await first;
        assert(entered); assert.equal(writes(), 0); assert.equal(nextButton.getAttribute('aria-disabled'), 'new-control-state'); restore();
    });
}

for (const route of routes) for (const phase of ['pending hidden', 'success text']) {
    test(`feedback setter reentry: ${route} ${phase} stops subsequent foreign writes`, async t => {
        const m = await model(t), status = m.nodes.copyStatus, parent = status.parentElement, host = foreignHost(m, 'cross-document');
        let text = status.textContent, hidden = status.hidden, entered = false, foreignWrites = 0;
        Object.defineProperties(status, {
            textContent: { configurable: true, get: () => text, set(value) { if (entered) foreignWrites++; text = value; if (phase === 'success text' && value === success[route]) { entered = true; move(status, host); text = 'New owner'; hidden = false; } } },
            hidden: { configurable: true, get: () => hidden, set(value) { if (entered) foreignWrites++; hidden = value; if (!entered && phase === 'pending hidden' && value === false) { entered = true; move(status, host); text = 'New owner'; } } }
        });
        const first = copy(m, route); m.release(); await first;
        assert(entered); assert.equal(foreignWrites, 0); assert.equal(text, 'New owner'); assert.equal(hidden, false);
        assert.equal(m.calls.length, phase === 'pending hidden' ? 0 : 1); move(status, parent, m.document);
    });
}

for (const route of routes) for (const target of ['status', 'control']) {
    test(`observed feedback ABA: ${route} ${target} cannot revive completion`, async t => {
        const m = await model(t), first = copy(m, route), status = m.nodes.copyStatus;
        const node = target === 'status' ? status : m.nodes.copySelectionButton, parent = node.parentElement;
        const restore = move(node, foreignHost(m, 'same-document')); restore();
        m.queue({ type: 'childList', target: parent, removedNodes: [node] });
        m.release(); await first; assert.equal(status.textContent, ''); assert.equal(status.hidden, true);
        const next = copy(m, route); assert.equal(m.calls.length, 2); m.release(); await next; assert.equal(status.textContent, success[route]);
    });
}

for (const route of routes) for (const hook of ['foreign mirror', 'throwing cleanup']) {
    test(`resource ownership: ${route} adopted status with ${hook} cleans once and retains lock`, async t => {
        const m = await model(t), first = copy(m, route), receipt = m.view.copyReceipt, status = m.nodes.copyStatus;
        const observer = m.observers.find(o => o.active), restore = move(status, foreignHost(m, 'cross-document'));
        status.textContent = 'Foreign feedback'; status.hidden = false; let foreignCalls = 0, ownedCalls = 0;
        if (hook === 'foreign mirror') m.view.copyReceipt = { valid: true, cleanup() { foreignCalls++; } };
        else receipt.cleanup = () => { ownedCalls++; throw Error('Synthetic owned cleanup failure'); };
        let failure; try { m.view.invalidateCopy(); } catch (error) { failure = error; }
        assert.equal(Boolean(failure), hook === 'throwing cleanup'); assert.equal(observer.disconnects, 1);
        for (const other of routes) await copy(m, other); assert.equal(m.calls.length, 1);
        m.release(); if (failure) await assert.rejects(first, error => error === failure); else await first;
        assert.equal(observer.disconnects, 1); assert.equal(foreignCalls, 0); assert.equal(ownedCalls, hook === 'throwing cleanup' ? 1 : 0);
        assert.equal(status.textContent, 'Foreign feedback'); assert.equal(status.hidden, false); restore(); m.view.copyReceipt = null;
        const next = copy(m, route); assert.equal(m.calls.length, 2); m.release(); await next;
    });
}

for (const fault of ['read failure', 'write failure', 'lost acknowledgement', 'pending write']) for (const route of ['current', 'selection']) {
    test(`real backend state: ${route} feedback ownership during ${fault}`, async t => {
        const env = await model(t), own = await env.addSource('fault source', false), m = { ...env, ...own };
        let saving, writeGate;
        if (fault === 'read failure') { m.backend.readError = Error('Synthetic read fault'); await assert.rejects(m.controller.refresh()); assert(m.controller.readError); }
        if (fault === 'write failure') { m.backend.writeError = Error('Synthetic write fault'); await assert.rejects(m.controller.save()); assert(m.controller.writeError); }
        if (fault === 'lost acknowledgement') { m.backend.ackError = Error('Synthetic acknowledgement fault'); await assert.rejects(m.controller.save()); assert(m.controller.writeError); assert.equal(JSON.parse(m.bytes()).content, DRAFT); }
        if (fault === 'pending write') { writeGate = gate(); t.after(() => writeGate.resolve()); m.backend.writeGate = writeGate.promise; saving = m.controller.save(); await tick(); assert(m.controller.pending); }
        const before = remember(m), first = copy(m, route), status = m.nodes.copyStatus, restore = move(status, foreignHost(m, 'cross-document'));
        status.textContent = 'New owner feedback'; status.hidden = false; await assertLocked(m, route, first);
        assert.equal(status.textContent, 'New owner feedback'); assert.equal(status.hidden, false); assert.deepEqual(remember(m), before);
        restore(); m.backend.readError = null; m.backend.writeError = null; m.backend.ackError = null;
        if (writeGate) { writeGate.resolve(); await saving; }
    });
}

for (const target of ['status', 'host']) for (const transfer of ['same-document', 'cross-document']) {
    test(`destroy without copy: private ${target} ownership survives ${transfer} transfer`, async t => {
        const m = await model(t), status = m.nodes.copyStatus, node = target === 'host' ? m.host : status;
        const restore = move(node, foreignHost(m, transfer)); status.textContent = 'New no-receipt feedback'; status.hidden = false;
        // Mutable public owner structures cannot grant private teardown authority.
        m.view.copySavedOwner.chain = [m.host]; m.view.copySavedOwner.status = status;
        m.view.copySelectionOwner.status = status;
        const writes = observeStatus(status), before = remember(m); m.view.destroy();
        assert.deepEqual(textAndHidden(status), { text: 'New no-receipt feedback', hidden: false });
        assert.deepEqual(writes(), { textWrites: 0, hiddenWrites: 0 }); assert.deepEqual(remember(m), before); assert.equal(m.calls.length, 0); restore();
    });
}
for (const target of ['status', 'host', 'ancestor']) {
    test(`destroy without copy: detached original ${target} still owns feedback`, async t => {
        const m = await model(t), status = m.nodes.copyStatus;
        status.textContent = 'Original feedback'; status.hidden = false;
        const restore = move(target === 'status' ? status : target === 'host' ? m.host : m.document.body, null);
        m.view.destroy(); assert.equal(status.textContent, ''); assert.equal(status.hidden, true); restore();
    });
}
for (const transfer of ['same-document', 'cross-document']) {
    test(`destroy without copy: ${transfer} text setter transfer prevents hidden write`, async t => {
        const m = await model(t), status = m.nodes.copyStatus, parent = status.parentElement, host = foreignHost(m, transfer);
        let text = 'Original', hidden = false, transferred = false, hides = 0;
        Object.defineProperties(status, {
            textContent: { configurable: true, get: () => text, set(value) { text = value; if (!transferred) { transferred = true; move(status, host); text = 'New feedback'; } } },
            hidden: { configurable: true, get: () => hidden, set(value) { hides++; hidden = value; } }
        });
        m.view.destroy(); assert.equal(text, 'New feedback'); assert.equal(hidden, false); assert.equal(hides, 0); move(status, parent, m.document);
    });
}
for (const route of routes) for (const property of ['ownerDocument', 'parentElement']) {
    test(`cleanup metadata reentry: ${route} ${property} transfer is rechecked before clearing`, async t => {
        const m = await model(t), first = copy(m, route), status = m.nodes.copyStatus, parent = status.parentElement, host = foreignHost(m, 'same-document');
        let value = status[property], entered = false;
        Object.defineProperty(status, property, { configurable: true, get() {
            const original = value;
            if (!entered) { entered = true; move(status, host); status.textContent = 'Metadata getter new feedback'; status.hidden = false; }
            return original;
        }, set(next) { value = next; } });
        m.view.invalidateCopy(); await assertLocked(m, route, first);
        assert(entered); assert.equal(status.textContent, 'Metadata getter new feedback'); assert.equal(status.hidden, false);
        move(status, parent, m.document);
    });
}
