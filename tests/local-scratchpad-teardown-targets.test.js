const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const api = require('../shared/local-scratchpad-store');
const { Controller } = require('../shared/local-scratchpad-controller');
const tick = () => new Promise(resolve => setImmediate(resolve));
const gate = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const SAVED = '\uFEFFSaved 中文 😀\r\n<literal>\rEnd\n';
const DRAFT = '\uFEFFUnsaved 中文 🪷\r\n<draft>\rEnd\n';
const IMPORT = '\uFEFFImported 中文 🌱\r\n<preview>\rEnd\n';
const fields = [
    ['exportStatus', 'textContent', '', 'New owner export feedback'],
    ['findInput', 'value', '', 'New owner query 中文 😀'],
    ['findStatus', 'textContent', '', 'New owner find result'],
    ['findPanel', 'hidden', true, false],
    ['findButton', 'aria-expanded', 'false', 'true'],
    ['findPrevious', 'disabled', true, false],
    ['findNext', 'disabled', true, false],
    ['importApply', 'textContent', 'Replace Scratchpad text', 'New owner apply label'],
    ['importAppend', 'checked', false, true],
    ['importAppend', 'disabled', true, false],
    ['importPanel', 'hidden', true, false],
    ['importPreview', 'textContent', '', '\uFEFFNew owner preview 中文 😀\r\n<literal>\r'],
    ['importInfo', 'textContent', '', 'New owner file details'],
    ['importFile', 'value', '', 'C:\\fakepath\\synthetic-new-owner.txt']
];
const names = [...new Set(fields.map(([name]) => name))];
const readField = (node, prop) => prop === 'aria-expanded' ? node.getAttribute(prop) : node[prop];
const writeField = (node, prop, value) => prop === 'aria-expanded' ? node.setAttribute(prop, value) : (node[prop] = value);
const targetValues = h => fields.map(([name, prop]) => readField(h.nodes[name], prop));
function seedTargets(h, selected = names) { for (const [name, prop, , value] of fields) if (selected.includes(name)) writeField(h.nodes[name], prop, value); }
function observeTargets(h, selected = names) {
    const writes = [];
    for (const [name, prop] of fields) if (selected.includes(name)) {
        const node = h.nodes[name];
        if (prop === 'aria-expanded') { const set = node.setAttribute; node.setAttribute = function (...args) { if (args[0] === prop) writes.push([name, prop, args[1]]); return set.apply(this, args); }; }
        else { let value = node[prop]; Object.defineProperty(node, prop, { configurable: true, get: () => value, set(next) { writes.push([name, prop, next]); value = next; } }); }
    }
    return writes;
}
// Explicit detachment and recursive ownerDocument reassignment are intentional:
// the shared deterministic DOM helper's append does neither automatically.
function move(node, parent, document = parent?.ownerDocument) {
    const previous = { parent: node.parentElement, document: node.ownerDocument };
    node.remove();
    if (document) { const adopt = item => { item.ownerDocument = document; for (const child of item.children) adopt(child); }; adopt(node); }
    parent?.append(node);
    return () => move(node, previous.parent, previous.document);
}
function remember(h) {
    const c = h.controller, n = h.nodes;
    return { raw: h.bytes(), io: { ...h.io }, state: c.state, stateText: JSON.stringify(c.state), draft: c.draft, generation: c.generation,
        error: c.error, readError: c.readError, writeError: c.writeError, conflict: c.conflict, pending: c.pending,
        pendingWrite: c.pendingWrite, status: c.status, composing: c.composing,
        editor: n.textarea.value, readOnly: n.textarea.readOnly, saved: n.savedPreview.value, savedHidden: n.savedPreview.hidden,
        statusText: n.status.textContent, statusError: n.status.classList.contains('scratchpad-error'), retryHidden: n.retry.hidden,
        retryDisabled: n.retry.disabled, count: n.count.textContent, hostHidden: h.host.hidden,
        selection: [n.textarea.selectionStart, n.textarea.selectionEnd, n.textarea.selectionDirection], focus: h.document.activeElement };
}
async function model(t) {
    const sources = [], effects = [], observers = [];
    async function addSource(label = 'original', document = createDocument({ blurUnavailableFocus: true }), suppliedHost) {
        let raw = api.validate({ ...api.initial(), enabled: true, revision: 4, content: SAVED + label }), queue = Promise.resolve();
        const subscribers = new Set(), events = new Map(), io = { reads: 0, writes: 0, mutations: 0, locks: 0, commits: 0 };
        const stats = { viewUnsubscribes: 0, destroys: 0, backendUnsubscribes: 0 }, removals = [], copyCalls = [], copyGates = [];
        const backend = {
            lock(action) { io.locks++; const p = queue.then(action); queue = p.catch(() => {}); return p; },
            async read() { io.reads++; if (backend.readError) throw backend.readError; return structuredClone(raw); },
            async write(value) { io.writes++; if (backend.writeGate) { backend.writeGate.entered.resolve(); await backend.writeGate.release.promise; }
                if (backend.writeError) throw backend.writeError; raw = structuredClone(value); io.commits++; for (const fn of [...subscribers]) fn();
                if (backend.ackError) throw backend.ackError;
            },
            subscribe(fn) { subscribers.add(fn); return () => { stats.backendUnsubscribes++; subscribers.delete(fn); }; }
        };
        const store = new api.Store(backend), mutate = store.mutate;
        store.mutate = function (...args) { io.mutations++; return mutate.apply(this, args); };
        const controller = new Controller(store, { delay: 60000 }), subscribe = controller.subscribe, destroy = controller.destroy;
        controller.subscribe = function (fn) { const off = subscribe.call(this, fn); return () => { stats.viewUnsubscribes++; off(); }; };
        controller.destroy = function () { stats.destroys++; return destroy.call(this); };
        const window = { LocalItabScratchpad: { ...api }, Blob, TextDecoder,
            getComputedStyle: node => ({ visibility: node.style.visibility || 'visible' }),
            navigator: { permissions: { query() { effects.push('permissions'); throw Error('Unexpected permission'); } } },
            fetch() { effects.push('network'); throw Error('Unexpected network'); },
            addEventListener(type, fn) { const set = events.get(type) || new Set(); set.add(fn); events.set(type, set); },
            removeEventListener(type, fn) { events.get(type)?.delete(fn); },
            MutationObserver: class { constructor(callback) { this.callback = callback; this.disconnects = 0; this.records = []; observers.push(this); }
                observe() {} disconnect() { this.disconnects++; } takeRecords() { const records = this.records; this.records = []; return records; } }
        };
        vm.runInNewContext(fs.readFileSync(process.env.SCRATCHPAD_VIEW_SOURCE || path.join(__dirname, '../shared/local-scratchpad-view.js'), 'utf8'), { window, document });
        const wrapper = document.createElement('main'), host = suppliedHost || document.createElement('article'), neutral = document.createElement('input');
        if (!suppliedHost) { document.body.append(wrapper, neutral); wrapper.append(host); }
        const create = document.createElement; document.createElement = tag => { const node = create(tag); node.click = () => node.dispatch('click'); return node; };
        const clipboard = { writeText(value) { const g = gate(); copyCalls.push(value); copyGates.push(g); return g.promise; },
            readText() { effects.push('clipboard read'); throw Error('Unexpected clipboard read'); } };
        document.execCommand = () => { effects.push('fallback'); throw Error('Unexpected fallback'); };
        const view = new window.LocalItabScratchpad.View(host, { controller, clipboard });
        const nodes = Object.fromEntries(Object.entries(view).filter(([, node]) => node?.tagName));
        const expectedListeners = [[host, 'compositionstart', view.copyCompositionStart], [host, 'compositionend', view.copyCompositionEnd],
            [host, 'keyup', view.findKeyup], [host, 'pointerdown', view.findPointerdown], [host, 'keydown', view.findKeydown],
            [document, 'visibilitychange', view.findVisibilityChange], [window, 'beforeunload', view.beforeUnload]];
        for (const target of new Set(expectedListeners.map(([target]) => target))) {
            const remove = target.removeEventListener; target.removeEventListener = function (...args) { removals.push([target, ...args]); return remove.apply(this, args); };
        }
        const sentinels = expectedListeners.map(([target, type]) => { const fn = () => {}; target.addEventListener(type, fn); return [target, type, fn]; });
        const h = { label, document, window, host, wrapper, neutral, controller, store, backend, view, nodes, io, stats, removals,
            expectedListeners, sentinels, events, copyCalls, copyGates, bytes: () => JSON.stringify(raw),
            release: () => { backend.writeGate?.release.resolve(); for (const g of copyGates) g.resolve(); }, forceDestroy: () => destroy.call(controller) };
        sources.push(h); await tick(); neutral.focus(); return h;
    }
    const own = await addSource();
    t.after(async () => { for (const h of sources) h.release(); await tick(); for (const h of sources) { try { h.view.destroy(); } catch (_) {} h.forceDestroy(); } });
    return { ...own, addSource, effects, observers };
}
function assertCleanup(h) {
    assert.deepEqual(h.stats, { viewUnsubscribes: 1, destroys: 1, backendUnsubscribes: 1 }); assert.equal(h.controller.closed, true);
    for (const [target, type, fn] of h.expectedListeners) assert.equal(h.removals.filter(r => r[0] === target && r[1] === type && r[2] === fn).length, 1, 'each original listener removal attempted once');
    for (const [target, type, fn] of h.sentinels) {
        assert.equal(h.removals.filter(r => r[0] === target && r[1] === type && r[2] === fn).length, 0, 'foreign listener never removed');
        if (target === h.window) assert(target && h.events.get(type).has(fn));
        else if (target !== h.document) assert(target.listeners.get(type).includes(fn));
    }
    h.view.closed = false; h.view.destroy(); assert.equal(h.stats.destroys, 1, 'public closed reset cannot repeat cleanup');
}
async function preview(h) {
    h.view.findButton.dispatch('click'); h.nodes.findInput.value = 'Saved'; h.nodes.findInput.dispatch('input');
    h.view.chooseImport(); const bytes = new TextEncoder().encode(IMPORT);
    h.nodes.importFile.files = [{ name: 'synthetic-original.txt', size: bytes.byteLength, arrayBuffer: async () => bytes.buffer }];
    await h.view.readImport(); h.nodes.importAppend.checked = true; h.nodes.importAppend.dispatch('change');
    assert(h.view.importSession && h.nodes.importPreview.textContent.endsWith(IMPORT)); h.neutral.focus();
}
function ancestor(h, name) {
    if (name === 'host') return h.host;
    if (name === 'ancestor') return h.wrapper;
    if (name === 'controls') return h.nodes.findButton.parentElement;
    if (name === 'findLabel') return h.nodes.findInput.parentElement;
    if (name === 'appendLabel') return h.nodes.importAppend.parentElement;
    if (name === 'importControls') return h.nodes.importApply.parentElement;
    return h.nodes[name];
}
function inSubtree(h, node) { return names.filter(name => node.contains(h.nodes[name])); }

for (const transfer of ['same-document', 'cross-document']) for (const target of [...names, 'findLabel', 'appendLabel', 'importControls', 'controls', 'host', 'ancestor']) {
    test(`teardown ownership: ${transfer} ${target} keeps exact new-owner fields`, async t => {
        const h = await model(t); await preview(h);
        const foreign = await h.addSource('foreign', transfer === 'same-document' ? h.document : createDocument({ blurUnavailableFocus: true }));
        const node = ancestor(h, target), selected = inSubtree(h, node), oldParent = node.parentElement;
        move(node, foreign.host); assert(!oldParent.children.includes(node));
        for (const name of selected) assert.equal(h.nodes[name].ownerDocument, foreign.document, 'recursive adoption includes every descendant');
        seedTargets(h, selected); const writes = observeTargets(h, selected), values = targetValues(h), before = remember(h), other = remember(foreign), foreignTargets = targetValues(foreign);
        h.view.destroy();
        assert.deepEqual(writes, [], 'old destroy cannot write any transferred field');
        fields.forEach(([name], index) => { if (selected.includes(name)) assert.equal(targetValues(h)[index], values[index]); });
        assert.deepEqual(remember(h), before); assert.deepEqual(remember(foreign), other); assert.deepEqual(targetValues(foreign), foreignTargets);
        assert.deepEqual(foreign.stats, { viewUnsubscribes: 0, destroys: 0, backendUnsubscribes: 0 });
        assertCleanup(h); assert.deepEqual(h.effects, []);
    });
}

for (const target of [...names, 'findLabel', 'appendLabel', 'importControls', 'controls', 'host', 'ancestor']) {
    test(`owned detached teardown: ${target} still clears original fields`, async t => {
        const h = await model(t); await preview(h); seedTargets(h); move(ancestor(h, target), null); h.neutral.focus();
        const before = remember(h); h.view.destroy();
        assert.deepEqual(targetValues(h), fields.map(([, , clean]) => clean)); assert.deepEqual(remember(h), before); assertCleanup(h);
    });
}

for (const group of ['findPanel', 'importPanel', 'host']) for (const transfer of ['same-document', 'cross-document']) {
    test(`conservative detached chain: ${group} retains values when former ancestor becomes ${transfer} foreign`, async t => {
        const h = await model(t), foreign = await h.addSource('foreign', transfer === 'same-document' ? h.document : createDocument());
        const node = ancestor(h, group), selected = inSubtree(h, node), formerParent = node.parentElement;
        move(node, null); move(formerParent, foreign.host); seedTargets(h, selected); const writes = observeTargets(h, selected), values = targetValues(h);
        h.view.destroy(); assert.deepEqual(writes, []);
        fields.forEach(([name], index) => { if (selected.includes(name)) assert.equal(targetValues(h)[index], values[index]); }); assertCleanup(h);
    });
}

for (const transfer of ['same-document', 'cross-document']) for (const boundary of ['findInput', 'findLabel', 'importAppend', 'importPanel', 'host', 'ancestor']) for (const property of ['parentElement', 'ownerDocument']) {
    test(`one-shot metadata reentry: ${transfer} ${boundary}.${property} cannot authorize foreign writes`, async t => {
        const h = await model(t), foreign = await h.addSource('foreign', transfer === 'same-document' ? h.document : createDocument());
        const node = ancestor(h, boundary), selected = inSubtree(h, node); let current = node[property], entered = false, writes;
        Object.defineProperty(node, property, { configurable: true, get() { const stale = current; if (!entered) { entered = true; move(node, foreign.host); seedTargets(h, selected); writes = observeTargets(h, selected); } return stale; }, set(value) { current = value; } });
        h.view.destroy(); assert(entered); assert.deepEqual(writes, [], 'second private ancestry check rejects the one-shot stale getter');
        for (const [name, prop, , value] of fields) if (selected.includes(name)) assert.equal(readField(h.nodes[name], prop), value); assertCleanup(h);
    });
}

for (const transfer of ['same-document', 'cross-document']) for (let index = 0; index < fields.length - 1; index++) {
    const [name, prop, clean] = fields[index], [next] = fields[index + 1];
    test(`cleanup setter reentry: ${transfer} ${name}.${prop} cannot write transferred ${next}`, async t => {
        const h = await model(t), foreign = await h.addSource('foreign', transfer === 'same-document' ? h.document : createDocument());
        seedTargets(h); let entered = false, writes;
        const transferNext = () => { if (entered) return; entered = true; move(h.nodes[next], foreign.host); seedTargets(h, [next]); writes = observeTargets(h, [next]); h.view.destroy(); };
        const node = h.nodes[name];
        if (prop === 'aria-expanded') { const set = node.setAttribute; node.setAttribute = function (...args) { set.apply(this, args); if (args[0] === prop && args[1] === clean) transferNext(); }; }
        else { let value = node[prop]; Object.defineProperty(node, prop, { configurable: true, get: () => value, set(nextValue) { value = nextValue; if (nextValue === clean) transferNext(); } }); }
        const before = remember(h); h.view.destroy(); assert(entered); assert.deepEqual(writes, []);
        for (const [target, property, , value] of fields) if (target === next) assert.equal(readField(h.nodes[target], property), value);
        assert.deepEqual(remember(h), before); assertCleanup(h);
    });
}

for (const transfer of ['same-document', 'cross-document']) for (const getter of ['translation', 'attribute method']) {
    test(`cleanup preparation reentry: ${transfer} ${getter} cannot publish to its transferred target`, async t => {
        const h = await model(t), foreign = await h.addSource('foreign', transfer === 'same-document' ? h.document : createDocument());
        const name = getter === 'translation' ? 'importApply' : 'findButton', node = h.nodes[name]; let entered = false, writes;
        const transferTarget = () => { if (entered) return; entered = true; move(node, foreign.host); seedTargets(h, [name]); writes = observeTargets(h, [name]); };
        if (getter === 'translation') h.window.i18n = { t(key) { if (key === 'scratchpadImportReplace') transferTarget(); return 'Obsolete translated label'; } };
        else { const method = node.setAttribute; Object.defineProperty(node, 'setAttribute', { configurable: true, get() { transferTarget(); return method; }, set(value) { Object.defineProperty(node, 'setAttribute', { configurable: true, writable: true, value }); } }); }
        h.view.destroy(); assert(entered); assert.deepEqual(writes, []);
        for (const [target, property, , value] of fields) if (target === name) assert.equal(readField(node, property), value); assertCleanup(h);
    });
}

for (const first of [undefined, null, false, 0, '', Error('Synthetic first cleanup failure')]) {
    test(`first cleanup error ${String(first)} survives later errors and exactly-once resource cleanup`, async t => {
        const h = await model(t); seedTargets(h); const later = Error('Synthetic later cleanup failure'); let firstCalls = 0, laterCalls = 0;
        Object.defineProperty(h.nodes.findInput, 'value', { configurable: true, get: () => 'Retained query', set() { firstCalls++; throw first; } });
        Object.defineProperty(h.nodes.importInfo, 'textContent', { configurable: true, get: () => 'Retained details', set() { laterCalls++; throw later; } });
        let caught = false, failure; try { h.view.destroy(); } catch (error) { caught = true; failure = error; }
        assert(caught); assert.equal(failure, first); assert.equal(firstCalls, 1); assert.equal(laterCalls, 1);
        assert.equal(h.nodes.findStatus.textContent, ''); assert.equal(h.nodes.importFile.value, ''); assertCleanup(h);
    });
}

for (const property of ['parentElement', 'ownerDocument']) {
    test(`throwing ${property} ownership getter retains first error and cleans remaining resources`, async t => {
        const h = await model(t), first = Error('Synthetic metadata failure'); let calls = 0;
        Object.defineProperty(h.nodes.findInput, property, { configurable: true, get() { calls++; throw first; } });
        assert.throws(() => h.view.destroy(), error => error === first); assert.equal(calls, 1);
        assert.equal(h.nodes.findStatus.textContent, ''); assert.equal(h.nodes.importPreview.textContent, ''); assertCleanup(h);
    });
}

for (const phase of ['saved', 'dirty', 'read failure', 'write failure', 'lost acknowledgement', 'pending success', 'pending failure', 'conflict']) {
    test(`real ${phase} teardown preserves original data and transferred find/import state`, async t => {
        const h = await model(t), foreign = await h.addSource('foreign'); let pending, outcome;
        if (phase !== 'saved' && phase !== 'read failure') { h.controller.setDraft(DRAFT); h.controller.cancelTimer(); }
        if (phase === 'read failure') { h.backend.readError = Error('Synthetic read failure'); await assert.rejects(h.controller.refresh()); assert(h.controller.readError); }
        if (phase === 'write failure') { h.backend.writeError = Error('Synthetic write failure'); await assert.rejects(h.controller.save()); assert(h.controller.writeError); }
        if (phase === 'lost acknowledgement') { h.backend.ackError = Error('Synthetic lost acknowledgement'); await assert.rejects(h.controller.save()); assert(h.controller.writeError); assert.equal(JSON.parse(h.bytes()).content, DRAFT); }
        if (phase === 'conflict') { await h.backend.write({ ...h.controller.state, content: 'Remote real revision', revision: h.controller.state.revision + 1 }); await tick(); assert(h.controller.conflict); }
        if (phase.startsWith('pending')) {
            h.backend.writeGate = { entered: gate(), release: gate() }; if (phase === 'pending failure') h.backend.writeError = Error('Synthetic delayed write failure');
            pending = h.controller.save(); outcome = pending.then(value => ({ value }), error => ({ error })); await h.backend.writeGate.entered.promise; assert(h.controller.pending && h.controller.pendingWrite);
        }
        move(h.nodes.findPanel, foreign.host); move(h.nodes.importPanel, foreign.host); const selected = [...inSubtree(h, h.nodes.findPanel), ...inSubtree(h, h.nodes.importPanel)];
        seedTargets(h, selected); const writes = observeTargets(h, selected), before = remember(h), other = remember(foreign), values = targetValues(h);
        h.view.controller = foreign.controller; h.view.unsubscribe = foreign.view.unsubscribe;
        h.view.destroy(); assert.deepEqual(writes, []); assert.deepEqual(remember(h), before); assert.deepEqual(remember(foreign), other); assertCleanup(h);
        assert.deepEqual(foreign.stats, { viewUnsubscribes: 0, destroys: 0, backendUnsubscribes: 0 });
        if (pending) {
            h.backend.writeGate.release.resolve(); const result = await outcome; await tick();
            assert.equal(Boolean(result.error), phase === 'pending failure'); assert.equal(h.controller.pending, false); assert.equal(h.controller.pendingWrite, false);
            assert.equal(JSON.parse(h.bytes()).content, phase === 'pending success' ? DRAFT : SAVED + 'original');
            assert.equal(h.controller.state, before.state); assert.equal(h.controller.draft, before.draft); assert.equal(h.nodes.textarea.value, before.editor);
            assert.equal(h.nodes.status.textContent, before.statusText); assert.deepEqual(writes, []); assert.deepEqual(remember(foreign), other);
        }
        fields.forEach(([name], index) => { if (selected.includes(name)) assert.equal(targetValues(h)[index], values[index]); }); assert.deepEqual(h.effects, []);
    });
}

for (const transfer of ['same-document', 'cross-document']) for (const hook of ['ordinary', 'throws']) {
    test(`owned clipboard cleanup ${hook} transfers ${transfer} find/import targets without redirecting resources`, async t => {
        const h = await model(t), foreign = await h.addSource('foreign', transfer === 'same-document' ? h.document : createDocument());
        const pending = h.view.copyText(), receipt = h.view.copyReceipt, observer = h.observers.at(-1), original = receipt.cleanup, first = Error('Synthetic receipt cleanup failure');
        let calls = 0, writes; receipt.cleanup = () => { calls++; original(); move(h.nodes.findPanel, foreign.host); move(h.nodes.importPanel, foreign.host);
            const selected = [...inSubtree(h, h.nodes.findPanel), ...inSubtree(h, h.nodes.importPanel)]; seedTargets(h, selected); writes = observeTargets(h, selected); h.view.destroy(); if (hook === 'throws') throw first; };
        const outcome = pending.then(value => ({ value }), error => ({ error }));
        if (hook === 'throws') assert.throws(() => h.view.destroy(), error => error === first); else h.view.destroy();
        assert.equal(calls, 1); assert.equal(observer.disconnects, 1); assert.deepEqual(writes, []); assert.equal(receipt.valid, false); assertCleanup(h);
        h.release(); const result = await outcome; assert.equal(result.error, hook === 'throws' ? first : undefined);
        assert.equal(observer.disconnects, 1); assert.equal(h.copyCalls.length, 1); assert.equal(foreign.stats.destroys, 0); assert.deepEqual(writes, []);
    });
}

for (const transfer of ['same-document', 'cross-document']) for (const prior of ['selection', 'saved']) {
    test(`construction capture precedes previous ${prior} owner callback with ${transfer} transfer`, async t => {
        const h = await model(t), foreign = await h.addSource('foreign', transfer === 'same-document' ? h.document : createDocument());
        let transferred; const owner = prior === 'selection' ? h.view.copySelectionOwner : h.view.copySavedOwner;
        owner.invalidate = () => { transferred = h.host.querySelector('.scratchpad-find'); move(transferred, foreign.host); };
        // Reuse the original constructor realm: its private host ownership maps
        // must see the previous View before invoking this synchronous callback.
        const controller = new Controller(new api.Store({ lock: action => Promise.resolve().then(action), read: async () => api.validate({ ...api.initial(), enabled: true, content: 'New genuine source' }), subscribe: () => () => {} }));
        const view = new h.window.LocalItabScratchpad.View(h.host, { controller }); await tick();
        try {
            assert(transferred); assert.equal(view.findPanel, transferred); const values = 'Callback-transferred query 中文';
            view.findInput.value = values; view.findStatus.textContent = 'Callback-transferred status'; view.findPanel.hidden = false;
            view.findPrevious.disabled = false; view.findNext.disabled = false; view.destroy();
            assert.equal(view.findInput.value, values); assert.equal(view.findStatus.textContent, 'Callback-transferred status');
            assert.equal(view.findPanel.hidden, false); assert.equal(view.findPrevious.disabled, false); assert.equal(view.findNext.disabled, false);
        } finally { view.destroy(); controller.destroy(); }
    });
}

test('public target substitution cannot redirect teardown or replace private original ancestry', async t => {
    const h = await model(t), foreign = await h.addSource('foreign'); seedTargets(h); seedTargets(foreign);
    const foreignValues = targetValues(foreign), before = remember(h), other = remember(foreign);
    Object.assign(h.view, foreign.nodes, { host: foreign.host, controller: foreign.controller, unsubscribe: foreign.view.unsubscribe,
        copySelectionOwner: foreign.view.copySelectionOwner, copySavedOwner: foreign.view.copySavedOwner });
    h.view.destroy(); assert.deepEqual(targetValues(h), fields.map(([, , clean]) => clean)); assert.deepEqual(targetValues(foreign), foreignValues);
    assert.deepEqual(remember(h), before); assert.deepEqual(remember(foreign), other); assert.equal(foreign.stats.destroys, 0); assertCleanup(h);
});

for (const transfer of ['same-document', 'cross-document']) for (const getter of ['returns', 'throws']) {
    test(`already foreign ${transfer} find button ${getter} method getter is never consulted`, async t => {
        const h = await model(t), foreign = await h.addSource('foreign', transfer === 'same-document' ? h.document : createDocument());
        const node = h.nodes.findButton; move(node, foreign.host); node.setAttribute('aria-expanded', 'new-owner-expanded');
        const method = node.setAttribute, first = Error('Foreign method getter must not run'); let reads = 0, calls = 0;
        Object.defineProperty(node, 'setAttribute', { configurable: true, get() { reads++; if (getter === 'throws') throw first;
            return function (...args) { calls++; return method.apply(this, args); }; } });
        const before = remember(h), other = remember(foreign); let caught = false;
        try { h.view.destroy(); } catch (_) { caught = true; }
        assertCleanup(h); assert.equal(reads, 0, 'already unowned targets cannot expose their new method accessor to old cleanup');
        assert.equal(calls, 0); assert.equal(caught, false); assert.equal(node.getAttribute('aria-expanded'), 'new-owner-expanded');
        assert.deepEqual(remember(h), before); assert.deepEqual(remember(foreign), other); assert.equal(foreign.stats.destroys, 0);
    });
}
