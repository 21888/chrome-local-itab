const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const storeApi = require('../shared/local-scratchpad-store');
const { Controller } = require('../shared/local-scratchpad-controller');
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }

// A local DOM/event model with the real Store and Controller. OS clipboard,
// native user activation, selection painting and assistive technology need QA.
async function model(t, text = 'current draft', options = {}) {
    const document = createDocument({ blurUnavailableFocus: true }), rootListeners = new Map();
    let raw = { ...storeApi.initial(), enabled: true, content: text }, reads = 0, writes = 0, failRead = false, failWrite = false, heldWrite = null;
    const subscriptions = new Set(), clipboardCalls = [], effects = [];
    const backend = {
        lock: action => Promise.resolve().then(action),
        async read() { reads++; if (failRead) throw Error('synthetic read failure'); return structuredClone(raw); },
        async write(value) { if (heldWrite) await heldWrite; if (failWrite) throw Error('synthetic write failure'); writes++; raw = structuredClone(value); subscriptions.forEach(fn => fn()); },
        subscribe(fn) { subscriptions.add(fn); return () => subscriptions.delete(fn); }
    };
    const clipboard = { writeText(value) { clipboardCalls.push(value); return options.writeText ? options.writeText(value) : Promise.resolve(); },
        readText() { effects.push('clipboard read'); throw Error('must not read clipboard'); } };
    const window = {
        LocalItabScratchpad: { ...storeApi }, navigator: { clipboard, permissions: { query() { effects.push('permissions'); throw Error('must not query permissions'); } } },
        fetch() { effects.push('network'); throw Error('must not request network'); },
        getComputedStyle: node => ({ visibility: node.style.visibility || 'visible' }),
        addEventListener(type, fn) { const set = rootListeners.get(type) || new Set(); set.add(fn); rootListeners.set(type, set); },
        removeEventListener(type, fn) { rootListeners.get(type)?.delete(fn); }
    };
    const observers = [];
    // Explicit mutation records model observer delivery/draining, not browser layout.
    if (options.observer) window.MutationObserver = class {
        constructor(callback) { this.callback = callback; this.records = []; observers.push(this); }
        observe(target, config) { this.target = target; this.config = config; this.active = true; }
        disconnect() { this.active = false; this.records = []; }
        takeRecords() { const records = this.records; this.records = []; return records; }
    };
    if (options.locale) { const catalog = JSON.parse(fs.readFileSync(require.resolve(`../_locales/${options.locale}/messages.json`), 'utf8')); window.i18n = { t: key => catalog[key]?.message || key }; }
    const source = fs.readFileSync(require.resolve('../shared/local-scratchpad-view'), 'utf8');
    vm.runInNewContext(source, { window, document });
    const host = document.createElement('article'); document.body.append(host);
    const controller = new Controller(new storeApi.Store(backend), { delay: 60000 });
    const view = new window.LocalItabScratchpad.View(host, { controller, ...options.viewOptions });
    t.after(() => view.destroy()); await flush();
    view.textarea.selectionStart = 2; view.textarea.selectionEnd = 4;
    view.textarea.setSelectionRange = () => effects.push('selection');
    return { window, document, host, controller, view, backend, clipboardCalls, effects,
        get reads() { return reads; }, get writes() { return writes; }, get raw() { return raw; },
        failRead(value) { failRead = value; }, failWrite(value) { failWrite = value; }, holdWrite(value) { heldWrite = value; },
        queueMutation(record) { observers.filter(observer => observer.active).forEach(observer => observer.records.push(record)); },
        deliverMutations() { observers.filter(observer => observer.active).forEach(observer => observer.callback(observer.takeRecords())); }, observers,
        rootEvent(type) { rootListeners.get(type)?.forEach(fn => fn({ type })); }, rootListeners
    };
}

test('Scratchpad copy: explicit native entry and independent polite status', async t => {
    const m = await model(t);
    assert(m.view.copyButton, 'an explicit Copy current text entry is required');
    assert.equal(m.view.copyButton.tagName, 'BUTTON'); assert.equal(m.view.copyButton.type, 'button');
    assert.equal(m.view.copyButton.textContent, 'Copy current text');
    assert.notEqual(m.view.copyStatus, m.view.status);
    assert.equal(m.view.copyStatus.getAttribute('role'), 'status');
    assert.equal(m.view.copyStatus.getAttribute('aria-live'), 'polite');
    assert.equal(m.view.copyStatus.getAttribute('aria-atomic'), 'true');
    assert.deepEqual(m.clipboardCalls, []); assert.equal(m.writes, 0);
});

test('Scratchpad copy: immediately sends the exact full controller text without save, reads, focus or selection', async t => {
    const text = '\uFEFF \t中文 😀 e\u0301\r\n<script>literal</script>\rEND\n\n';
    const m = await model(t, text), before = { reads: m.reads, writes: m.writes, status: m.view.status.textContent, state: m.controller.state };
    // Native textareas normalize CRLF/CR. The original controller text wins.
    m.view.textarea.value = text.replace(/\r\n?/g, '\n');
    m.view.savedPreview.value = 'not this saved preview';
    m.view.copyButton.focus(); const focus = m.document.activeElement;
    m.view.copyButton.dispatch('click');
    assert.deepEqual(m.clipboardCalls, [text], 'the call happens in the click turn, before any await');
    assert.equal(m.view.copyStatus.textContent, 'Copying current text…');
    assert.equal(m.view.copyButton.getAttribute('aria-disabled'), 'true'); assert(!m.view.copyButton.disabled);
    assert.equal(m.document.activeElement, focus); await flush();
    assert.equal(m.view.copyStatus.textContent, 'Current text copied.');
    assert.equal(m.view.copyButton.getAttribute('aria-disabled'), 'false');
    assert.equal(m.document.activeElement, focus); assert.deepEqual(m.effects, []);
    assert.deepEqual([m.view.textarea.selectionStart, m.view.textarea.selectionEnd], [2, 4]);
    assert.equal(m.reads, before.reads); assert.equal(m.writes, before.writes);
    assert.equal(m.controller.state, before.state); assert.equal(m.controller.draft, text);
    assert.equal(m.view.status.textContent, before.status); assert.equal(m.view.copyStatus.children.length, 0);
});

for (const mode of ['unsaved', 'saving', 'save failure', 'conflict', 'read failure', 'over-limit']) {
    test(`Scratchpad copy: full ${mode} draft stays copyable and save feedback stays owned by saving`, async t => {
        const m = await model(t, 'saved baseline'), draft = mode === 'over-limit' ? '😀'.repeat(33000) : 'unsaved\r\nlocal draft';
        m.controller.setDraft(draft); m.controller.cancelTimer();
        let saving, held;
        if (mode === 'saving') { held = deferred(); m.holdWrite(held.promise); saving = m.controller.save(); await flush(); assert(m.controller.pending); }
        if (mode === 'save failure') { m.failWrite(true); await assert.rejects(m.controller.save()); }
        if (mode === 'conflict') { await m.backend.write({ ...m.raw, revision: m.raw.revision + 1, content: 'remote conflict preview' }); await flush(); assert(m.controller.conflict); }
        if (mode === 'read failure') { m.failRead(true); await assert.rejects(m.controller.refresh()); assert(m.view.textarea.readOnly); }
        if (mode === 'over-limit') await assert.rejects(m.controller.save(), { code: 'TEXT_LIMIT' });
        m.view.findButton.dispatch('click'); m.view.findInput.value = 'query stays';
        m.view.importPreview.textContent = 'preview stays';
        const before = { reads: m.reads, writes: m.writes, state: m.controller.state, error: m.controller.error,
            status: m.view.status.textContent, conflict: m.controller.conflict, pending: m.controller.pending };
        await m.view.copyText();
        assert.deepEqual(m.clipboardCalls, [draft]); assert.equal(m.view.copyStatus.textContent, 'Current text copied.');
        assert.equal(m.reads, before.reads); assert.equal(m.writes, before.writes);
        for (const key of ['state', 'error', 'conflict', 'pending']) assert.equal(m.controller[key], before[key], key);
        assert.equal(m.view.status.textContent, before.status); assert.equal(m.view.findInput.value, 'query stays');
        assert.equal(m.view.importPreview.textContent, 'preview stays'); assert.equal(m.controller.draft, draft);
        assert.deepEqual(m.effects, []);
        if (held) { held.resolve(); await saving; }
    });
}

test('Scratchpad copy: empty and invalid Unicode never write or clear the clipboard; whitespace is text', async t => {
    const m = await model(t, '');
    await m.view.copyText(); assert.deepEqual(m.clipboardCalls, []);
    assert.match(m.view.copyStatus.textContent, /no text.*clipboard was not changed/i);
    for (const invalid of ['a\uD800b', '\uDC00']) {
        m.controller.setDraft(invalid); m.controller.cancelTimer(); const status = m.view.status.textContent;
        await m.view.copyText(); assert.deepEqual(m.clipboardCalls, []);
        assert.match(m.view.copyStatus.textContent, /incomplete Unicode.*clipboard was not changed/);
        assert.equal(m.view.status.textContent, status); assert.equal(m.controller.draft, invalid);
    }
    m.controller.setDraft(' \t\r\n'); m.controller.cancelTimer(); await m.view.copyText();
    assert.deepEqual(m.clipboardCalls, [' \t\r\n']); assert.equal(m.writes, 0);
});

test('Scratchpad copy: editor and find IME, composing click and legacy 229 cannot write', async t => {
    const m = await model(t);
    m.view.textarea.dispatch('compositionstart'); m.view.textarea.value = '组合'; m.view.textarea.dispatch('input');
    m.view.copyButton.dispatch('click'); assert.deepEqual(m.clipboardCalls, []);
    m.view.textarea.dispatch('compositionend'); m.controller.cancelTimer();
    m.view.findButton.dispatch('click'); m.view.findInput.dispatch('compositionstart');
    m.view.copyButton.dispatch('click'); assert.deepEqual(m.clipboardCalls, []);
    m.view.findInput.dispatch('compositionend');
    m.view.copyButton.dispatch('click', { isComposing: true }); m.view.copyButton.dispatch('click', { keyCode: 229 });
    assert.deepEqual(m.clipboardCalls, []);
    m.view.copyButton.dispatch('click'); assert.deepEqual(m.clipboardCalls, ['组合']); await flush();
});

for (const failure of ['unavailable', 'synchronous exception', 'rejected promise']) {
    test(`Scratchpad copy: ${failure} stays in separate feedback and allows explicit retry`, async t => {
        const options = failure === 'unavailable' ? { viewOptions: { clipboard: null } } : {
            writeText() { if (failure === 'synchronous exception') throw Error('synthetic denial'); return Promise.reject(Error('synthetic denial')); }
        };
        const m = await model(t, 'retained', options); m.controller.error = storeApi.fault('WRITE'); m.controller.writeError = true; m.controller.emit();
        const status = m.view.status.textContent, error = m.controller.error, reads = m.reads;
        m.view.copyButton.focus(); await m.view.copyText();
        assert.match(m.view.copyStatus.textContent, /Could not copy.*manually.*export/);
        assert.equal(m.view.status.textContent, status); assert.equal(m.controller.error, error);
        assert.equal(m.document.activeElement, m.view.copyButton); assert.equal(m.reads, reads); assert.equal(m.writes, 0);
        assert.equal(m.view.copyAttempt, null); assert.equal(m.view.copyButton.getAttribute('aria-disabled'), 'false');
        const retry = []; m.view.clipboard = { writeText(value) { retry.push(value); return Promise.resolve(); } };
        await m.view.copyText(); assert.deepEqual(retry, ['retained']); assert.equal(m.view.copyStatus.textContent, 'Current text copied.');
    });
}

test('Scratchpad copy: one pending system write survives invalidation until settlement, then an explicit new click works', async t => {
    const held = deferred(), m = await model(t, 'A', { writeText: () => held.promise });
    m.view.copyButton.focus(); m.view.copyButton.dispatch('click'); const attempt = m.view.copyAttempt;
    m.view.copyButton.dispatch('click'); await m.view.copyText(); assert.deepEqual(m.clipboardCalls, ['A']);
    m.controller.setDraft('B'); m.controller.setDraft('A'); m.controller.cancelTimer();
    assert.equal(m.view.copyAttempt, attempt); assert(m.view.copyStatus.hidden); assert.equal(m.view.copyStatus.textContent, '');
    assert.equal(m.view.copyButton.getAttribute('aria-disabled'), 'true');
    m.view.copyButton.dispatch('click'); assert.deepEqual(m.clipboardCalls, ['A']);
    held.resolve(); await flush(); assert.equal(m.view.copyAttempt, null); assert.equal(m.view.copyStatus.textContent, '');
    assert.equal(m.document.activeElement, m.view.copyButton);
    m.view.copyButton.dispatch('click'); await flush(); assert.deepEqual(m.clipboardCalls, ['A', 'A']);
    assert.equal(m.view.copyStatus.textContent, 'Current text copied.');
});

test('Scratchpad copy: a same-text save replaces state without expiring the correct pending receipt', async t => {
    const held = deferred(), m = await model(t, 'saved', { writeText: () => held.promise });
    m.controller.setDraft('current draft'); m.controller.cancelTimer();
    const state = m.controller.state, generation = m.controller.generation;
    m.view.copyButton.dispatch('click'); await m.controller.save();
    assert.notEqual(m.controller.state, state); assert.equal(m.controller.generation, generation);
    assert.equal(m.view.copyStatus.textContent, 'Copying current text…');
    held.resolve(); await flush(); assert.equal(m.view.copyStatus.textContent, 'Current text copied.');
    assert.equal(m.raw.content, 'current draft'); assert.deepEqual(m.clipboardCalls, ['current draft']);
});

test('Scratchpad copy: refreshed remote saved text keeps the same retained-draft receipt and conflict warning', async t => {
    const held = deferred(), m = await model(t, 'saved', { writeText: () => held.promise });
    m.controller.setDraft('retained'); m.controller.cancelTimer(); m.view.copyButton.dispatch('click');
    await m.backend.write({ ...m.raw, revision: m.raw.revision + 1, content: 'remote' }); await flush();
    assert(m.controller.conflict); const status = m.view.status.textContent;
    held.resolve(); await flush(); assert.equal(m.view.copyStatus.textContent, 'Current text copied.');
    assert.equal(m.view.status.textContent, status); assert.equal(m.view.savedPreview.value, 'remote');
    assert.deepEqual(m.clipboardCalls, ['retained']);
});

for (const blocked of ['not loaded', 'controller closed', 'destroyed', 'page hidden', 'visibility hidden', 'host hidden', 'ancestor hidden',
    'ancestor inert', 'ancestor aria-hidden', 'CSS display', 'CSS visibility', 'closed details', 'host detached', 'editor detached', 'button detached',
    'departing', 'workspace invalidated', 'workspace suspended', 'workspace replaced']) {
    test(`Scratchpad copy: admission ignores ${blocked}`, async t => {
        const m = await model(t), ancestor = m.document.createElement(blocked === 'closed details' ? 'details' : 'section');
        m.host.remove(); m.document.body.append(ancestor); ancestor.append(m.host);
        if (blocked === 'not loaded') m.controller.loaded = false;
        if (blocked === 'controller closed') m.controller.closed = true;
        if (blocked === 'destroyed') m.view.destroy();
        if (blocked === 'page hidden') m.document.hidden = true;
        if (blocked === 'visibility hidden') m.document.visibilityState = 'hidden';
        if (blocked === 'host hidden') m.host.hidden = true;
        if (blocked === 'ancestor hidden') ancestor.hidden = true;
        if (blocked === 'ancestor inert') ancestor.inert = true;
        if (blocked === 'ancestor aria-hidden') ancestor.setAttribute('aria-hidden', 'true');
        if (blocked === 'CSS display') ancestor.style.display = 'none';
        if (blocked === 'CSS visibility') m.view.copyButton.style.visibility = 'hidden';
        if (blocked === 'host detached') m.host.remove();
        if (blocked === 'editor detached') m.view.textarea.remove();
        if (blocked === 'button detached') m.view.copyButton.remove();
        if (blocked === 'departing') m.window.LocalItabContentLifecycle = { departing: true };
        if (blocked.startsWith('workspace')) {
            const workspace = { id: 'synthetic-workspace', generation: 'v1', invalidated: false, _suspended: false };
            m.backend.workspace = workspace; m.window.LocalItabWorkspaces = { session: workspace };
            if (blocked === 'workspace invalidated') workspace.invalidated = true;
            if (blocked === 'workspace suspended') workspace._suspended = true;
            if (blocked === 'workspace replaced') m.window.LocalItabWorkspaces.session = { ...workspace };
        }
        m.view.copyButton.dispatch('click'); await m.view.copyText();
        assert.deepEqual(m.clipboardCalls, []); assert.equal(m.writes, 0); assert.deepEqual(m.effects, []);
    });
}

const invalidations = [
    ['editor input ABA', m => { m.view.textarea.value = 'B'; m.view.textarea.dispatch('input'); m.view.textarea.value = 'A'; m.view.textarea.dispatch('input'); m.controller.cancelTimer(); }],
    ['editor composition start/end', m => { m.view.textarea.dispatch('compositionstart'); m.view.textarea.dispatch('compositionend'); m.controller.cancelTimer(); }],
    ['find composition start/end', m => { m.view.findButton.dispatch('click'); m.view.findInput.dispatch('compositionstart'); m.view.findInput.dispatch('compositionend'); }],
    ['controller closed', m => { m.controller.closed = true; }],
    ['destroy', m => m.view.destroy()],
    ['page hide/return', m => { m.document.hidden = true; m.document.listeners.get('visibilitychange')?.({}); m.document.hidden = false; }],
    ['pagehide', m => m.rootEvent('pagehide')],
    ['window blur', m => m.rootEvent('blur')],
    ['host hidden/returned observer delivery', m => { m.host.hidden = true; m.queueMutation({ type: 'attributes', target: m.host, attributeName: 'hidden' }); m.host.hidden = false; m.deliverMutations(); }],
    ['inert ancestor restored before observer delivery', m => { m.queueMutation({ type: 'attributes', target: m.document.body, attributeName: 'inert' }); }],
    ['editor detach/reattach before observer delivery', m => { m.view.textarea.remove(); m.host.append(m.view.textarea); m.queueMutation({ type: 'childList', target: m.host, removedNodes: [m.view.textarea] }); }],
    ['workspace invalidation', m => { m.backend.workspace.invalidated = true; }],
    ['workspace suspension', m => { m.backend.workspace._suspended = true; }],
    ['workspace identity changed', m => { m.backend.workspace.generation = 'v2'; }],
    ['active workspace replaced', m => { m.window.LocalItabWorkspaces.session = { ...m.backend.workspace }; }]
];
for (const [index, [change, mutate]] of invalidations.entries()) {
    test(`Scratchpad copy: pending ${index % 2 ? 'rejection' : 'success'} has no stale feedback after ${change}`, async t => {
        const held = deferred(), m = await model(t, 'A', { writeText: () => held.promise, observer: true });
        m.backend.workspace = { id: 'synthetic-workspace', generation: 'v1', invalidated: false, _suspended: false };
        m.window.LocalItabWorkspaces = { session: m.backend.workspace };
        m.view.copyButton.dispatch('click'); const attempt = m.view.copyAttempt;
        mutate(m); assert.equal(m.view.copyAttempt, attempt, 'invalidation must not release the system-write lock');
        m.view.copyButton.dispatch('click'); assert.deepEqual(m.clipboardCalls, ['A']);
        if (index % 2) held.reject(Error('synthetic clipboard rejection')); else held.resolve();
        await flush(); assert.equal(m.view.copyStatus.textContent, ''); assert(m.view.copyStatus.hidden);
        assert.equal(m.view.copyAttempt, null); assert.equal(m.writes, 0);
        assert(m.observers.every(observer => !observer.active));
    });
}

test('Scratchpad copy: settled receipt also clears on edit or hide and destroy removes only its own listeners', async t => {
    const m = await model(t, 'A', { observer: true }); await m.view.copyText();
    assert.equal(m.view.copyStatus.textContent, 'Current text copied.');
    m.controller.setDraft('B'); m.controller.cancelTimer(); assert.equal(m.view.copyStatus.textContent, '');
    await m.view.copyText(); m.queueMutation({ type: 'attributes', target: m.host, attributeName: 'aria-hidden' }); m.deliverMutations();
    assert.equal(m.view.copyStatus.textContent, ''); assert(m.view.copyStatus.hidden);
    await m.view.copyText(); assert.equal(m.rootListeners.get('pagehide').size, 1);
    let foreignCalls = 0; const foreign = () => foreignCalls++; m.window.addEventListener('pagehide', foreign);
    m.view.destroy(); m.rootEvent('pagehide'); assert.equal(foreignCalls, 1);
    assert.equal(m.rootListeners.get('pagehide').size, 1); assert.equal(m.rootListeners.get('blur').size, 0);
    assert.equal(m.rootListeners.get('beforeunload').size, 0); assert(!m.document.listeners.has('visibilitychange'));
    assert(m.observers.every(observer => !observer.active)); assert.equal(m.view.copyStatus.textContent, '');
});

test('Scratchpad copy: old destroyed completion cannot overwrite a newly mounted view', async t => {
    const held = deferred(), m = await model(t, 'A', { writeText: () => held.promise });
    m.view.copyButton.dispatch('click'); m.view.destroy();
    const freshController = new Controller(new storeApi.Store(m.backend), { delay: 60000 }), calls = [];
    const fresh = new m.window.LocalItabScratchpad.View(m.host, { controller: freshController, clipboard: { writeText(text) { calls.push(text); return Promise.resolve(); } } });
    t.after(() => fresh.destroy()); await flush(); await fresh.copyText();
    held.resolve(); await flush(); assert.equal(fresh.copyStatus.textContent, 'Current text copied.');
    assert.equal(m.view.copyStatus.textContent, ''); assert.deepEqual(calls, ['A']);
    m.view.copyButton.dispatch('click'); assert.deepEqual(m.clipboardCalls, ['A']);
});

for (const locale of ['en', 'zh_CN']) {
    test(`Scratchpad copy: ${locale} catalog covers native label and all separate feedback`, async t => {
        const m = await model(t, 'A', { locale }), catalog = JSON.parse(fs.readFileSync(require.resolve(`../_locales/${locale}/messages.json`), 'utf8'));
        assert.equal(m.view.copyButton.textContent, catalog.scratchpadCopyText.message);
        await m.view.copyText(); assert.equal(m.view.copyStatus.textContent, catalog.scratchpadCopySuccess.message);
        m.view.clipboard = null; await m.view.copyText(); assert.equal(m.view.copyStatus.textContent, catalog.scratchpadCopyFailure.message);
        m.controller.setDraft(''); m.controller.cancelTimer(); await m.view.copyText(); assert.equal(m.view.copyStatus.textContent, catalog.scratchpadCopyEmpty.message);
        m.controller.setDraft('\uD800'); m.controller.cancelTimer(); await m.view.copyText(); assert.equal(m.view.copyStatus.textContent, catalog.scratchpadCopyInvalid.message);
        for (const key of ['scratchpadCopyText', 'scratchpadCopying', 'scratchpadCopySuccess', 'scratchpadCopyFailure', 'scratchpadCopyEmpty', 'scratchpadCopyInvalid']) assert(catalog[key]?.message);
    });
}

test('Scratchpad copy: production host uses the default root navigator clipboard, without new storage or permission paths', () => {
    const source = fs.readFileSync(require.resolve('../shared/local-scratchpad-view'), 'utf8'), newtab = fs.readFileSync(require.resolve('../newtab.js'), 'utf8');
    assert(source.includes('clipboard = root.navigator?.clipboard'));
    assert(newtab.includes("window.LocalItabScratchpad.mount(scratchpadHost, {"));
    const copy = source.slice(source.indexOf('        canCopy(event)'), source.indexOf('        exportText()'));
    assert(!/readText|execCommand|permissions\.|storage\.|fetch\(|\.save\(|\.retry\(|\.setDraft\(/.test(copy));
});
