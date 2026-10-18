const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const api = require('../shared/local-scratchpad-store');
const { Controller } = require('../shared/local-scratchpad-controller');
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const catalog = (locale = 'en') => JSON.parse(fs.readFileSync(require.resolve(`../_locales/${locale}/messages.json`), 'utf8'));

// Real View/Store/Controller with the unchanged shared DOM helper. Test-local
// textarea normalization, scoped observer records and focus probes are explicit.
// This model does not emulate native key clicks, browser activation or OS copying.
async function model(t, saved = 'Latest saved text', options = {}) {
    const document = createDocument({ blurUnavailableFocus: true }), effects = [], observers = [], rootListeners = new Map();
    const create = document.createElement;
    document.createElement = tag => {
        const node = create(tag), focus = node.focus;
        node.focus = function () { effects.push('focus'); return focus.call(this); };
        if (tag === 'textarea') {
            let value = '';
            Object.defineProperty(node, 'value', { configurable: true, get: () => value,
                set: next => { value = options.normalize ? String(next).replace(/\r\n?/g, '\n') : next; } });
            node.selectionStart = node.selectionEnd = 0; node.selectionDirection = 'none';
            node.setSelectionRange = () => { effects.push('selection setter'); throw Error('copy must not select'); };
        }
        return node;
    };
    document.getSelection = () => { effects.push('document selection'); throw Error('wrong source'); };
    document.execCommand = () => { effects.push('clipboard fallback'); throw Error('not permitted'); };
    let raw = { ...api.initial(), enabled: true, content: 'Original baseline' }, reads = 0, writes = 0, failRead = false, failWrite = false;
    const subscriptions = new Set(), calls = [];
    const backend = {
        lock: action => Promise.resolve().then(action),
        async read() { reads++; if (failRead) throw Error('synthetic read failure'); return structuredClone(raw); },
        async write(value) { if (failWrite) throw Error('synthetic write failure'); writes++; raw = structuredClone(value); subscriptions.forEach(fn => fn()); },
        subscribe(fn) { subscriptions.add(fn); return () => subscriptions.delete(fn); }
    };
    if (!options.legacy) backend.workspace = { id: 'synthetic-saved-copy', generation: 1 };
    const clipboard = { writeText(value) { calls.push(value); return options.writeText ? options.writeText(value) : Promise.resolve(); },
        readText() { effects.push('clipboard read'); throw Error('not permitted'); } };
    const window = {
        LocalItabScratchpad: { ...api }, navigator: { clipboard, permissions: { query() { effects.push('permissions'); throw Error('not permitted'); } } },
        fetch() { effects.push('network'); throw Error('not permitted'); }, getSelection() { effects.push('window selection'); throw Error('wrong source'); },
        getComputedStyle: node => ({ visibility: node.style.visibility || 'visible', display: node.style.display || 'block' }),
        addEventListener(type, fn) { const set = rootListeners.get(type) || new Set(); set.add(fn); rootListeners.set(type, set); },
        removeEventListener(type, fn) { rootListeners.get(type)?.delete(fn); },
        MutationObserver: class {
            constructor(callback) { this.callback = callback; this.records = []; this.targets = []; observers.push(this); }
            observe(target, config) { this.target = target; this.config = config; this.targets.push({ target, config }); this.active = true; }
            disconnect() { this.active = false; this.records = []; }
            takeRecords() { const records = this.records; this.records = []; return records; }
        }
    };
    if (!options.legacy) window.LocalItabWorkspaces = { session: backend.workspace };
    if (options.locale) { const messages = catalog(options.locale); window.i18n = { t: key => messages[key]?.message || key }; }
    if (options.missingTranslations) window.i18n = { t: key => key };
    vm.runInNewContext(fs.readFileSync(require.resolve('../shared/local-scratchpad-view'), 'utf8'), { window, document });
    const wrapper = document.createElement('section'), host = document.createElement('article'); document.body.append(wrapper); wrapper.append(host);
    const store = new api.Store(backend), controller = new Controller(store, { delay: 60000 });
    const view = new window.LocalItabScratchpad.View(host, { controller });
    t.after(() => { view.controller = controller; controller.store = store; store.backend = backend; view.destroy(); controller.cancelTimer(); });
    await flush(); controller.setDraft(options.draft ?? 'Local draft selected text'); controller.cancelTimer();
    const remote = async (patch = {}) => { await backend.write({ ...raw, revision: raw.revision + 1, ...patch }); await flush(); };
    if (options.conflict !== false) { await remote({ content: saved }); assert(controller.conflict, 'fixture must use a real backend conflict'); }
    view.textarea.selectionStart = 12; view.textarea.selectionEnd = 20; view.textarea.selectionDirection = 'backward';
    view.savedPreview.selectionStart = 0; view.savedPreview.selectionEnd = Math.min(3, view.savedPreview.value.length); view.savedPreview.selectionDirection = 'forward';
    view.textarea.scrollTop = 19; view.textarea.scrollLeft = 7; view.savedPreview.scrollTop = 31; view.savedPreview.scrollLeft = 11;
    const click = (node = view.copySavedButton, fields = {}) => node.dispatch('click', { currentTarget: node, defaultPrevented: false, ...fields });
    effects.length = 0;
    return { window, document, wrapper, host, view, controller, store, backend, clipboard, calls, effects, observers, click, remote,
        get reads() { return reads; }, get writes() { return writes; }, get raw() { return raw; },
        failRead(value) { failRead = value; }, failWrite(value) { failWrite = value; }, silentRemote(patch) { raw = { ...raw, revision: raw.revision + 1, ...patch }; },
        queue(record) { observers.filter(observer => observer.active && observer.targets.some(({ target, config }) =>
            (target === record.target || config.subtree && target.contains(record.target)) &&
            (record.type === 'attributes' ? config.attributes && (!config.attributeFilter || config.attributeFilter.includes(record.attributeName)) : config.childList)
        )).forEach(observer => observer.records.push(record)); },
        deliver() { observers.filter(observer => observer.active).forEach(observer => observer.callback(observer.takeRecords())); },
        rootEvent(type) { rootListeners.get(type)?.forEach(fn => fn({ type })); },
        documentEvent(type, fields = {}) { return document.listeners.get(type)?.({ target: document, ...fields }); }
    };
}
function remember(m) {
    return { reads: m.reads, writes: m.writes, state: m.controller.state, draft: m.controller.draft, generation: m.controller.generation,
        pending: m.controller.pending, pendingWrite: m.controller.pendingWrite, conflict: m.controller.conflict, error: m.controller.error, readError: m.controller.readError,
        status: m.view.status.textContent, focus: m.document.activeElement, effects: [...m.effects],
        range: [m.view.textarea.selectionStart, m.view.textarea.selectionEnd, m.view.textarea.selectionDirection],
        previewRange: [m.view.savedPreview.selectionStart, m.view.savedPreview.selectionEnd, m.view.savedPreview.selectionDirection],
        scroll: [m.view.textarea.scrollTop, m.view.textarea.scrollLeft, m.view.savedPreview.scrollTop, m.view.savedPreview.scrollLeft],
        preview: m.view.savedPreview.value, findQuery: m.view.findInput.value, findStatus: m.view.findStatus.textContent,
        importInfo: m.view.importInfo.textContent, importPreview: m.view.importPreview.textContent };
}
function unchanged(m, before) { assert.deepEqual(remember(m), before); }
function noReceipt(m) { assert.equal(m.view.copyStatus.textContent, ''); assert(m.view.copyStatus.hidden); }

// Entry, raw source fidelity and read-only effects.
test('Scratchpad saved copy: native conflict entry follows resolution and names the saved preview', async t => {
    const m = await model(t), b = m.view.copySavedButton, controls = m.view.replace.parentElement;
    assert.equal(b.tagName, 'BUTTON'); assert.equal(b.type, 'button'); assert.equal(b.textContent, 'Copy saved text');
    assert.equal(b.parentElement, controls); assert.equal(controls.children[controls.children.indexOf(m.view.replace) + 1], b);
    assert(b.title.toLowerCase().includes(m.view.savedLabel.textContent.toLowerCase())); assert.equal(b.title, catalog().scratchpadCopySavedHelp.message);
    assert(!b.hidden); assert(!b.disabled); assert.equal(b.getAttribute('aria-disabled'), 'false');
    assert.equal(m.view.copyStatus.getAttribute('role'), 'status'); assert.equal(m.view.copyStatus.getAttribute('aria-live'), 'polite');
    assert.equal(m.view.copyStatus.getAttribute('aria-atomic'), 'true'); assert.notEqual(m.view.copyStatus, m.view.status);
    assert.deepEqual(m.calls, []); assert.equal(m.view.copyAttempt, null);
});
for (const normalize of [false, true]) for (const saved of [' \t ', '\uFEFF', '😀', 'e\u0301', '\r\n', '\r', '\nline 1\nline 2\n', '<script>literal & text</script>', '\uFEFF \t中文 😀 e\u0301\r\n<literal>\rEND\n\n', '😀'.repeat(32000)]) {
    test(`Scratchpad saved copy: exact full ${normalize ? 'LF-normalized' : 'raw'} preview payload ${saved.length > 100 ? 'at saved limit' : JSON.stringify(saved)}`, async t => {
        const m = await model(t, saved, { normalize });
        m.view.findInput.value = 'wrong query'; m.view.findStatus.textContent = 'retained Find result';
        m.view.importInfo.textContent = 'retained import info'; m.view.importPreview.textContent = 'wrong import source';
        m.view.savedPreview.selectionStart = 0; m.view.savedPreview.selectionEnd = 1;
        m.view.copySavedButton.focus(); const before = remember(m); m.click();
        assert.deepEqual(m.calls, [saved], 'writeText happens synchronously within the click turn');
        assert.equal(m.view.copyReceipt.saved, true); assert.equal(m.view.copyStatus.textContent, catalog().scratchpadCopySavedCopying.message);
        for (const b of [m.view.copyButton, m.view.copySelectionButton, m.view.copySavedButton]) { assert.equal(b.getAttribute('aria-disabled'), 'true'); assert(!b.disabled); }
        await flush(); unchanged(m, before); assert.equal(m.view.copyStatus.textContent, catalog().scratchpadCopySavedSuccess.message);
        assert.equal(m.view.copyStatus.children.length, 0); assert.equal(m.view.copySavedButton.getAttribute('aria-disabled'), 'false');
    });
}
test('Scratchpad saved copy: empty saved conflict has distinct no-write guidance with a nonempty draft', async t => {
    const m = await model(t, ''), before = remember(m); await m.view.copySavedText();
    assert.deepEqual(m.calls, []); unchanged(m, before); assert.equal(m.view.copyAttempt, null);
    assert.equal(m.view.copyStatus.textContent, catalog().scratchpadCopySavedEmpty.message);
    assert.notEqual(m.view.copyStatus.textContent, catalog().scratchpadCopyEmpty.message); assert(!m.view.copyStatus.hidden);
});
for (const invalid of ['\uD800', 'x\uDC00y', 'a\uD800b']) {
    test(`Scratchpad saved copy: invalid Unicode ${JSON.stringify(invalid)} cannot touch clipboard`, async t => {
        const m = await model(t); m.controller.state = { ...m.controller.state, content: invalid }; m.view.savedPreview.value = invalid;
        const before = remember(m); await m.view.copySavedText(); assert.deepEqual(m.calls, []); unchanged(m, before); assert.equal(m.view.copyAttempt, null);
        assert.equal(m.view.copyStatus.textContent, catalog().scratchpadCopySavedInvalid.message);
    });
}
for (const draft of ['😀'.repeat(33000), '\uD800unpaired local draft', 'retained read-only draft']) {
    test(`Scratchpad saved copy: ${draft.length > 100 ? 'over-limit' : draft.startsWith('\uD800') ? 'invalid' : 'read-only'} draft does not replace the valid saved source`, async t => {
        const m = await model(t, 'Valid saved contents', { draft }); m.view.textarea.readOnly = true;
        const before = remember(m); await m.view.copySavedText(); assert.deepEqual(m.calls, ['Valid saved contents']); unchanged(m, before);
    });
}
test('Scratchpad saved copy: real CAS CONFLICT error permits the displayed saved snapshot', async t => {
    const m = await model(t, undefined, { conflict: false }); m.silentRemote({ content: 'Concurrent write' });
    await assert.rejects(m.controller.save(), { code: 'CONFLICT' }); assert(m.controller.conflict); assert.equal(m.controller.error.code, 'CONFLICT');
    assert.equal(m.view.savedPreview.value, 'Concurrent write'); const before = remember(m); await m.view.copySavedText();
    assert.deepEqual(m.calls, ['Concurrent write']); unchanged(m, before);
});
for (const resolve of ['useSaved', 'replaceWithDraft']) {
    test(`Scratchpad saved copy: ${resolve} ends conflict and hides the native entry`, async t => {
        const m = await model(t); await m.view.copySavedText(); await m.controller[resolve]();
        assert(!m.controller.conflict); assert(m.view.copySavedButton.hidden); noReceipt(m);
        const before = remember(m); m.click(); await m.view.copySavedText(); assert.equal(m.calls.length, 1); unchanged(m, before);
    });
}

// Admission, error policy and construction-time ownership.
const blockedCases = [
    ['not loaded', m => { m.controller.loaded = false; }], ['closed controller', m => { m.controller.closed = true; }],
    ['no conflict', m => { m.controller.conflict = false; }], ['pending save', m => { m.controller.pending = true; }],
    ['pending write', m => { m.controller.pendingWrite = true; }], ['read error', m => { m.controller.readError = true; }],
    ['hidden document', m => { m.document.hidden = true; }], ['hidden visibility state', m => { m.document.visibilityState = 'hidden'; }],
    ['hidden host', m => { m.host.hidden = true; }], ['inert ancestor', m => { m.wrapper.inert = true; }],
    ['aria-hidden ancestor', m => { m.wrapper.setAttribute('aria-hidden', 'true'); }], ['display none ancestor', m => { m.wrapper.style.display = 'none'; }],
    ['visibility hidden ancestor', m => { m.wrapper.style.visibility = 'hidden'; }], ['hidden saved preview', m => { m.view.savedPreview.hidden = true; }],
    ['inert saved preview', m => { m.view.savedPreview.inert = true; }], ['collapsed saved preview', m => { m.view.savedPreview.style.visibility = 'collapse'; }],
    ['hidden saved label', m => { m.view.savedLabel.hidden = true; }], ['inert saved label', m => { m.view.savedLabel.inert = true; }],
    ['hidden saved label CSS', m => { m.view.savedLabel.style.visibility = 'hidden'; }], ['hidden saved button', m => { m.view.copySavedButton.hidden = true; }],
    ['disabled saved button', m => { m.view.copySavedButton.disabled = true; }],
    ['closed details ancestor', m => { const details = m.document.createElement('details'); m.wrapper.remove(); m.document.body.append(details); details.append(m.wrapper); }],
    ['departing lifecycle', m => { m.window.LocalItabContentLifecycle = { departing: true }; }],
    ['invalidated workspace', m => { m.backend.workspace.invalidated = true; }], ['suspended workspace', m => { m.backend.workspace._suspended = true; }],
    ['editor composing', m => { m.controller.composing = true; }], ['Find composing', m => { m.view.findComposing = true; }],
    ['stale saved display', m => { m.view.savedPreview.value = 'not displayed state'; }],
    ['stale normalized saved display', m => { m.view.savedPreview.value = m.controller.state.content + '\n'; }]
];
for (const [name, block] of blockedCases) {
    test(`Scratchpad saved copy: ${name} admission has no clipboard, I/O, selection or focus effect`, async t => {
        const m = await model(t); block(m); const before = remember(m); m.click(); await m.view.copySavedText();
        assert.deepEqual(m.calls, []); unchanged(m, before); assert.equal(m.view.copyAttempt, null);
    });
}
for (const code of ['WRITE', 'VERIFY', 'READ', 'CORRUPT', 'WORKSPACE_STALE', 'WORKSPACE_CLOSED', 'UNKNOWN', undefined]) {
    test(`Scratchpad saved copy: ${code || 'uncoded'} error cannot claim a known saved source`, async t => {
        const m = await model(t); m.controller.error = code ? api.fault(code) : Error('unknown'); m.controller.writeError = true;
        const before = remember(m); m.click(); await m.view.copySavedText(); assert.deepEqual(m.calls, []); unchanged(m, before);
    });
}
for (const code of ['CONFLICT', 'TEXT', 'TEXT_LIMIT', 'SIZE_LIMIT']) {
    test(`Scratchpad saved copy: ${code} draft error and writeError do not block a known saved snapshot`, async t => {
        const m = await model(t, 'Valid saved'); m.controller.error = api.fault(code); m.controller.writeError = true;
        const before = remember(m); await m.view.copySavedText(); assert.deepEqual(m.calls, ['Valid saved']); unchanged(m, before);
    });
}
for (const [code, draft] of [['TEXT', '\uD800'], ['TEXT_LIMIT', '😀'.repeat(33000)]]) {
    test(`Scratchpad saved copy: real ${code} local save failure retains a copyable saved conflict`, async t => {
        const m = await model(t, undefined, { conflict: false, draft }); await assert.rejects(m.controller.save(), { code });
        await m.remote({ content: 'Valid concurrent saved text' }); assert(m.controller.conflict); assert(m.controller.writeError);
        const before = remember(m); await m.view.copySavedText(); assert.deepEqual(m.calls, ['Valid concurrent saved text']); unchanged(m, before);
    });
}
test('Scratchpad saved copy: real failed write and later conflict remain unavailable until recovery', async t => {
    const m = await model(t, undefined, { conflict: false }); m.failWrite(true); await assert.rejects(m.controller.save(), { code: 'WRITE' });
    m.failWrite(false); await m.remote({ content: 'Saved despite another failed attempt' }); assert(m.controller.conflict);
    const before = remember(m); await m.view.copySavedText(); assert.deepEqual(m.calls, []); unchanged(m, before);
});
for (const property of ['revision', 'content', 'enabled']) {
    test(`Scratchpad saved copy: malformed state ${property} accessor is rejected without invocation`, async t => {
        const m = await model(t), state = m.controller.state, value = state[property]; let reads = 0;
        Object.defineProperty(state, property, { configurable: true, enumerable: true, get() { reads++; return value; } });
        await m.view.copySavedText(); assert.deepEqual(m.calls, []); assert.equal(reads, 0); assert.equal(m.view.copyAttempt, null);
        Object.defineProperty(state, property, { configurable: true, enumerable: true, writable: true, value });
    });
}
const ownerChanges = [
    ['host replacement', m => { m.view.host = m.wrapper; }], ['controller replacement', m => { m.view.controller = Object.create(m.controller); }],
    ['store replacement', m => { m.controller.store = new api.Store(m.backend); }], ['backend replacement', m => { m.store.backend = { ...m.backend }; }],
    ['preview replacement', m => { const n = m.document.createElement('textarea'); n.value = m.view.savedPreview.value; m.view.savedPreview.replaceWith(n); m.view.savedPreview = n; }],
    ['label replacement', m => { const n = m.document.createElement('p'); n.textContent = m.view.savedLabel.textContent; m.view.savedLabel.replaceWith(n); m.view.savedLabel = n; }],
    ['button replacement', m => { const n = m.document.createElement('button'); m.view.copySavedButton.replaceWith(n); m.view.copySavedButton = n; }],
    ['status replacement', m => { const n = m.document.createElement('p'); n.textContent = 'new owner status'; m.view.copyStatus.replaceWith(n); m.view.copyStatus = n; }],
    ['preview detach', m => m.view.savedPreview.remove()], ['label detach', m => m.view.savedLabel.remove()],
    ['button detach', m => m.view.copySavedButton.remove()], ['status detach', m => m.view.copyStatus.remove()],
    ['preview reparent', m => { m.view.savedPreview.remove(); m.wrapper.append(m.view.savedPreview); }],
    ['label reparent', m => { m.view.savedLabel.remove(); m.wrapper.append(m.view.savedLabel); }],
    ['button reparent', m => { m.view.copySavedButton.remove(); m.host.append(m.view.copySavedButton); }],
    ['status reparent', m => { m.view.copyStatus.remove(); m.wrapper.append(m.view.copyStatus); }],
    ['controls reparent', m => { const controls = m.view.copySavedButton.parentElement; controls.remove(); m.wrapper.append(controls); }],
    ['host ancestor reparent', m => { const n = m.document.createElement('div'); m.document.body.append(n); m.wrapper.remove(); n.append(m.wrapper); }],
    ...['host', 'savedPreview', 'savedLabel', 'copySavedButton', 'copyStatus'].map(key => [`${key} document replacement`, m => { (key === 'host' ? m.host : m.view[key]).ownerDocument = {}; }]),
    ['controls document replacement', m => { m.view.copySavedButton.parentElement.ownerDocument = {}; }],
    ['workspace object replacement', m => { m.backend.workspace = { ...m.backend.workspace }; m.window.LocalItabWorkspaces.session = m.backend.workspace; }],
    ['workspace id mutation', m => { m.backend.workspace.id = 'other'; }], ['workspace generation mutation', m => { m.backend.workspace.generation++; }],
    ['session replacement', m => { m.window.LocalItabWorkspaces.session = { ...m.backend.workspace }; }],
    ['session missing', m => { m.window.LocalItabWorkspaces.session = undefined; }], ['workspace missing', m => { m.backend.workspace = undefined; }]
];
for (const phase of ['before first copy', 'pending', 'settled']) for (const [name, change] of ownerChanges) {
    test(`Scratchpad saved copy: ${name} ${phase} cannot adopt new ownership or acknowledge an old source`, async t => {
        const held = deferred(), m = await model(t, 'Saved owner text', { writeText: () => held.promise }), status = m.view.copyStatus;
        if (phase !== 'before first copy') { m.click(); assert.deepEqual(m.calls, ['Saved owner text']); }
        if (phase === 'settled') { held.resolve(); await flush(); }
        const transferred = phase !== 'before first copy' && ['status reparent', 'host ancestor reparent', 'host document replacement', 'copyStatus document replacement'].includes(name);
        const receipt = transferred ? m.view.copyReceipt : null, before = transferred ? remember(m) : null;
        const attempt = m.view.copyAttempt; change(m);
        if (transferred) { status.textContent = 'New owner feedback'; status.hidden = false; }
        await m.view.copySavedText();
        if (phase === 'pending') { assert.equal(m.view.copyAttempt, attempt); held.resolve(); await flush(); }
        else { held.resolve(); m.view.render(); await flush(); }
        assert.equal(m.calls.length, phase === 'before first copy' ? 0 : 1);
        if (transferred) {
            assert.equal(status.textContent, 'New owner feedback'); assert.equal(status.hidden, false);
            assert.equal(receipt.valid, false); assert.equal(m.view.copyReceipt, null); unchanged(m, before);
        } else if (phase !== 'before first copy') { assert.equal(status.textContent, ''); assert(status.hidden); }
        if (name === 'status replacement') assert.equal(m.view.copyStatus.textContent, 'new owner status');
        assert.equal(m.view.copyAttempt, null); m.view.host = m.host; m.controller.store = m.store; m.store.backend = m.backend;
    });
}
for (const mode of ['unchanged legacy', 'late workspace', 'late session']) {
    test(`Scratchpad saved copy: construction-time ${mode} identity is explicit`, async t => {
        const m = await model(t, 'Legacy saved', { legacy: true });
        if (mode !== 'unchanged legacy') { const workspace = { id: 'late', generation: 1 }; m.window.LocalItabWorkspaces = { session: workspace }; if (mode === 'late workspace') m.backend.workspace = workspace; }
        const before = remember(m); await m.view.copySavedText(); assert.deepEqual(m.calls, mode === 'unchanged legacy' ? ['Legacy saved'] : []); unchanged(m, before);
    });
}

// Shared single-flight and source-based receipt lifetime.
for (const first of ['copyText', 'copySelectedText', 'copySavedText']) for (const reject of [false, true]) {
    test(`Scratchpad saved copy: ${first} owns all three directions through stale ${reject ? 'failure' : 'success'}`, async t => {
        const held = deferred(), m = await model(t, 'Remote saved', { writeText: () => held.promise });
        const methods = ['copyText', 'copySelectedText', 'copySavedText']; m.view[first](); const attempt = m.view.copyAttempt;
        for (const method of methods) m.view[method](); assert.equal(m.calls.length, 1); assert(attempt);
        await m.remote({ content: 'New saved snapshot' });
        if (first !== 'copySavedText') { m.controller.setDraft('Changed local draft'); m.controller.cancelTimer(); }
        assert.equal(m.view.copyAttempt, attempt); for (const method of methods) m.view[method](); assert.equal(m.calls.length, 1);
        noReceipt(m); if (reject) held.reject(Error('synthetic denial')); else held.resolve(); await flush();
        assert.equal(m.view.copyAttempt, null); noReceipt(m);
        m.view.clipboard = { writeText(value) { m.calls.push(value); return Promise.resolve(); } }; await m.view.copySavedText();
        assert.equal(m.calls.at(-1), 'New saved snapshot'); assert.equal(m.calls.length, 2);
    });
}
for (const settled of [false, true]) for (const mutation of ['selection', 'input', 'draft', 'same snapshot refresh']) {
    test(`Scratchpad saved copy: ${mutation} preserves ${settled ? 'settled' : 'pending'} saved feedback`, async t => {
        const held = deferred(), m = await model(t, 'Stable saved state', { writeText: () => held.promise }); m.click();
        if (settled) { held.resolve(); await flush(); }
        const receipt = m.view.copyReceipt, attempt = m.view.copyAttempt, status = m.view.copyStatus.textContent;
        if (mutation === 'selection') { m.view.textarea.selectionStart = 0; m.view.textarea.selectionEnd = 1; m.view.textarea.dispatch('select'); m.view.textarea.dispatch('selectionchange'); await m.documentEvent('selectionchange'); }
        if (mutation === 'input') { m.view.textarea.value = 'Edited local draft'; m.view.textarea.dispatch('input'); m.controller.cancelTimer(); }
        if (mutation === 'draft') { m.controller.setDraft('Changed local draft'); m.controller.cancelTimer(); }
        if (mutation === 'same snapshot refresh') { const oldState = m.controller.state; await m.controller.refresh(); assert.notEqual(m.controller.state, oldState); }
        assert.equal(m.view.copyReceipt, receipt); assert.equal(m.view.copyAttempt, attempt); assert.equal(m.view.copyStatus.textContent, status);
        assert(!m.view.copyStatus.hidden); held.resolve(); await flush(); assert.equal(m.view.copyStatus.textContent, catalog().scratchpadCopySavedSuccess.message);
    });
}
const receiptChanges = [
    ['new saved content', m => m.remote({ content: 'Newly saved text' })], ['new revision same content', m => m.remote({ content: m.controller.state.content })],
    ['saved enabled change', m => m.remote({ enabled: false })], ['display mutation', m => { m.view.savedPreview.value = 'different displayed text'; }],
    ['conflict ends', m => { m.controller.conflict = false; m.controller.emit(); }], ['read error', m => { m.controller.readError = true; m.controller.emit(); }],
    ['pending operation', m => { m.controller.pending = true; m.controller.emit(); }], ['pending write', m => { m.controller.pendingWrite = true; m.controller.emit(); }],
    ['unloaded', m => { m.controller.loaded = false; m.controller.emit(); }], ['closed controller', m => { m.controller.closed = true; }],
    ['pagehide', m => m.rootEvent('pagehide')], ['window blur', m => m.rootEvent('blur')],
    ['document visibility ABA', async m => { m.document.hidden = true; await m.documentEvent('visibilitychange'); m.document.hidden = false; }],
    ['editor IME ABA', m => { m.view.textarea.dispatch('compositionstart'); m.view.textarea.dispatch('compositionend'); m.controller.cancelTimer(); }],
    ['Find IME ABA', m => { m.view.findPanel.hidden = false; m.view.findInput.dispatch('compositionstart'); m.view.findInput.dispatch('compositionend'); }],
    ['workspace ABA observed by render', m => { const original = m.backend.workspace; m.backend.workspace = { ...original }; m.controller.emit(); m.backend.workspace = original; m.controller.emit(); }],
    ['destroy', m => m.view.destroy()]
];
for (const settled of [false, true]) for (const [name, change] of receiptChanges) {
    test(`Scratchpad saved copy: ${name} expires ${settled ? 'settled' : 'pending'} receipt without early unlocking`, async t => {
        const held = deferred(), m = await model(t, 'Saved before change', { writeText: () => held.promise }); m.click();
        if (settled) { held.resolve(); await flush(); }
        const attempt = m.view.copyAttempt; await change(m); if (!m.view.closed) m.view.render();
        assert.equal(m.view.copyAttempt, attempt); noReceipt(m);
        if (!settled) { m.view.copyText(); m.view.copySelectedText(); m.view.copySavedText(); assert.equal(m.calls.length, 1); held.resolve(); await flush(); }
        assert.equal(m.view.copyAttempt, null); noReceipt(m); assert(m.observers.every(observer => !observer.active));
    });
}
for (const key of ['pending', 'pendingWrite', 'readError', 'composing']) {
    test(`Scratchpad saved copy: temporary ${key} uses aria-disabled without losing native button focus`, async t => {
        const m = await model(t); m.view.copySavedButton.focus(); m.controller[key] = true; m.controller.emit();
        assert.equal(m.view.copySavedButton.getAttribute('aria-disabled'), 'true'); assert(!m.view.copySavedButton.disabled);
        assert.equal(m.document.activeElement, m.view.copySavedButton); const before = remember(m); m.click(); unchanged(m, before); assert.deepEqual(m.calls, []);
        m.controller[key] = false; m.controller.emit(); assert.equal(m.document.activeElement, m.view.copySavedButton);
        assert.equal(m.view.copySavedButton.getAttribute('aria-disabled'), 'false'); m.click(); await flush(); assert.equal(m.calls.length, 1);
    });
}

// Scoped observer records include removals and attribute ABA, not unrelated UI.
for (const target of ['host', 'wrapper', 'savedPreview', 'savedLabel', 'copySavedButton']) for (const attribute of ['hidden', 'inert', 'style', 'class']) {
    test(`Scratchpad saved copy: queued ${target} ${attribute} ABA expires pending feedback`, async t => {
        const held = deferred(), m = await model(t, 'Saved source', { writeText: () => held.promise }); m.click(); const attempt = m.view.copyAttempt;
        m.queue({ type: 'attributes', target: ['host', 'wrapper'].includes(target) ? m[target] : m.view[target], attributeName: attribute });
        m.view.render(); noReceipt(m); assert.equal(m.view.copyAttempt, attempt); m.click(); assert.equal(m.calls.length, 1);
        held.resolve(); await flush(); noReceipt(m); assert.equal(m.view.copyAttempt, null);
    });
}
for (const target of ['savedPreview', 'savedLabel', 'copySavedButton', 'copyStatus']) {
    test(`Scratchpad saved copy: queued ${target} detach and reattach cannot restore an old receipt`, async t => {
        const held = deferred(), m = await model(t, 'Saved source', { writeText: () => held.promise }); m.click(); const attempt = m.view.copyAttempt;
        const node = m.view[target], parent = node.parentElement; node.remove(); parent.append(node);
        m.queue({ type: 'childList', target: parent, removedNodes: [node] }); m.view.render(); noReceipt(m); assert.equal(m.view.copyAttempt, attempt);
        held.resolve(); await flush(); noReceipt(m); assert.equal(m.view.copyAttempt, null);
    });
}
test('Scratchpad saved copy: disabled ABA is observed but status own hidden and unrelated mutations are ignored', async t => {
    const held = deferred(), m = await model(t, 'Saved source', { writeText: () => held.promise }); m.click();
    const receipt = m.view.copyReceipt, observer = m.observers.find(item => item.active);
    assert(observer.targets.some(({ config }) => config.attributeFilter?.includes('disabled')));
    m.queue({ type: 'attributes', target: m.view.copyStatus, attributeName: 'hidden' });
    m.queue({ type: 'attributes', target: m.view.importPanel, attributeName: 'hidden' }); m.deliver();
    assert.equal(m.view.copyReceipt, receipt); assert(!m.view.copyStatus.hidden);
    m.view.copySavedButton.disabled = true; m.queue({ type: 'attributes', target: m.view.copySavedButton, attributeName: 'disabled' }); m.view.copySavedButton.disabled = false;
    m.deliver(); noReceipt(m); assert.equal(m.view.copyAttempt, receipt); held.resolve(); await flush(); assert.equal(m.view.copyAttempt, null);
});
test('Scratchpad saved copy: own initial feedback visibility does not invalidate successful delivery', async t => {
    const m = await model(t); let hidden = true;
    Object.defineProperty(m.view.copyStatus, 'hidden', { configurable: true, get: () => hidden, set(value) {
        if (hidden !== value) { hidden = value; m.queue({ type: 'attributes', target: m.view.copyStatus, attributeName: 'hidden' }); }
    } });
    m.click(); assert.equal(m.calls.length, 1); await flush(); assert.equal(m.view.copyStatus.textContent, catalog().scratchpadCopySavedSuccess.message);
});

// Native-event fences, reentrant getters and explicit retry.
for (const fields of [{ defaultPrevented: true }, { detail: 2 }, { repeat: true }, { isComposing: true }, { keyCode: 229 }]) {
    test(`Scratchpad saved copy: guarded click ${JSON.stringify(fields)} never writes`, async t => {
        const m = await model(t), before = remember(m); m.click(undefined, fields); await flush(); assert.deepEqual(m.calls, []); unchanged(m, before);
    });
}
for (const key of ['Enter', ' ']) {
    test(`Scratchpad saved copy: held ${JSON.stringify(key)} permits only one native-modeled activation`, async t => {
        const m = await model(t), b = m.view.copySavedButton; b.focus(); const before = remember(m);
        b.dispatch('keydown', { key, repeat: false }); m.click(); await flush(); assert.equal(m.calls.length, 1);
        assert(b.dispatch('keydown', { key, repeat: true }).prevented); m.click(); await flush(); assert.equal(m.calls.length, 1); unchanged(m, before);
        b.dispatch('keyup', { key }); b.dispatch('keydown', { key, repeat: false }); m.click(); await flush(); assert.equal(m.calls.length, 2); unchanged(m, before);
    });
}
for (const phase of ['clipboard getter', 'preview getter', 'write invocation']) {
    test(`Scratchpad saved copy: ${phase} reentry fences stale saved content and all alternate routes`, async t => {
        const held = deferred(), m = await model(t, 'Before reentry'); let nested = 0;
        const change = () => { nested++; m.controller.state = { ...m.controller.state, revision: m.controller.state.revision + 1, content: 'After reentry' }; m.view.savedPreview.value = 'After reentry'; m.view.copyText(); m.view.copySelectedText(); m.view.copySavedText(); };
        if (phase === 'clipboard getter') m.view.clipboard = { get writeText() { change(); return () => { m.calls.push('unexpected'); return held.promise; }; } };
        if (phase === 'write invocation') m.view.clipboard = { writeText(text) { m.calls.push(text); change(); return held.promise; } };
        if (phase === 'preview getter') {
            let value = m.view.savedPreview.value, once = true;
            Object.defineProperty(m.view.savedPreview, 'value', { configurable: true, get() { if (once) { once = false; change(); } return value; }, set(next) { value = next; } });
        }
        m.click(); assert.equal(nested, 1); assert.deepEqual(m.calls, phase === 'write invocation' ? ['Before reentry'] : []); noReceipt(m);
        if (phase === 'write invocation') { assert(m.view.copyAttempt); m.view.copyText(); assert.equal(m.calls.length, 1); }
        held.resolve(); await flush(); assert.equal(m.view.copyAttempt, null); noReceipt(m);
    });
}
test('Scratchpad saved copy: draft-only clipboard getter mutation keeps the saved source and blocks nested routes', async t => {
    const m = await model(t, 'Saved remains current'); let nested = 0;
    m.view.clipboard = { get writeText() { nested++; m.controller.setDraft('New draft only'); m.controller.cancelTimer(); m.view.copyText(); m.view.copySelectedText();
        return text => { m.calls.push(text); return Promise.resolve(); }; } };
    m.click(); assert.equal(nested, 1); assert.deepEqual(m.calls, ['Saved remains current']); await flush();
    assert.equal(m.view.copyStatus.textContent, catalog().scratchpadCopySavedSuccess.message);
});
for (const failure of ['missing API', 'throwing getter', 'synchronous exception', 'rejected promise']) {
    test(`Scratchpad saved copy: ${failure} keeps the saved preview and requires explicit retry`, async t => {
        const m = await model(t, 'Still saved'); m.view.copySavedButton.focus();
        if (failure === 'missing API') m.view.clipboard = null;
        if (failure === 'throwing getter') m.view.clipboard = { get writeText() { throw Error('synthetic denial'); } };
        if (failure === 'synchronous exception') m.view.clipboard = { writeText() { throw Error('synthetic denial'); } };
        if (failure === 'rejected promise') m.view.clipboard = { writeText() { return Promise.reject(Error('synthetic denial')); } };
        const before = remember(m); await m.view.copySavedText(); unchanged(m, before); assert.deepEqual(m.calls, []);
        assert.equal(m.view.copyStatus.textContent, catalog().scratchpadCopySavedFailure.message); assert.match(m.view.copyStatus.textContent, /retry/i);
        assert.equal(m.view.copyAttempt, null); assert.equal(m.view.copySavedButton.getAttribute('aria-disabled'), 'false');
        await flush(); assert.deepEqual(m.calls, []); m.view.clipboard = m.clipboard; m.click(); assert.deepEqual(m.calls, ['Still saved']); await flush(); unchanged(m, before);
    });
}
test('Scratchpad saved copy: foreign targets and stale callbacks never route through substituted saved controls', async t => {
    const m = await model(t), original = m.view.copySavedButton, callback = original.listeners.get('click')[0];
    callback({ target: m.view.copyButton, currentTarget: m.view.copyButton }); assert.deepEqual(m.calls, []);
    const fresh = m.document.createElement('button'); original.replaceWith(fresh); m.view.copySavedButton = fresh;
    callback({ target: original, currentTarget: original }); await m.view.copySavedText(); assert.deepEqual(m.calls, []);
});
for (const destroy of [false, true]) {
    test(`Scratchpad saved copy: ${destroy ? 'destroy then' : 'live host'} remount cannot revive originals or release a pending write`, async t => {
        const held = deferred(), m = await model(t, 'Original saved', { writeText: () => held.promise });
        const oldButton = m.view.copySavedButton, oldPreview = m.view.savedPreview, oldLabel = m.view.savedLabel, oldStatus = m.view.copyStatus, oldControls = oldButton.parentElement;
        const callback = oldButton.listeners.get('click')[0]; m.click(); const attempt = m.view.copyAttempt; if (destroy) m.view.destroy();
        const freshController = new Controller(new api.Store(m.backend), { delay: 60000 }), freshCalls = [];
        const fresh = new m.window.LocalItabScratchpad.View(m.host, { controller: freshController, clipboard: { writeText(text) { freshCalls.push(text); return Promise.resolve(); } } });
        t.after(() => fresh.destroy()); await flush(); freshController.setDraft('Fresh local draft'); freshController.cancelTimer(); await m.remote({ content: 'Fresh saved' });
        m.host.append(oldPreview, oldLabel, oldControls, oldStatus);
        callback({ target: fresh.copySavedButton, currentTarget: fresh.copySavedButton }); oldButton.dispatch('click'); await m.view.copySavedText();
        assert.deepEqual(m.calls, ['Original saved']); assert.equal(m.view.copyAttempt, attempt); assert(oldStatus.hidden);
        await fresh.copySavedText(); assert.deepEqual(freshCalls, ['Fresh saved']); held.resolve(); await flush();
        assert.equal(m.view.copyAttempt, null); assert.equal(oldStatus.textContent, ''); assert.equal(fresh.copyStatus.textContent, catalog().scratchpadCopySavedSuccess.message);
    });
}
for (const locale of ['en', 'zh_CN', 'fallback']) {
    test(`Scratchpad saved copy: ${locale} label and empty, pending, success, failure feedback are localized`, async t => {
        const held = deferred(), m = await model(t, '', { locale: locale === 'fallback' ? undefined : locale, missingTranslations: locale === 'fallback', writeText: () => held.promise });
        const messages = catalog(locale === 'fallback' ? 'en' : locale);
        for (const key of ['scratchpadCopySaved', 'scratchpadCopySavedHelp', 'scratchpadCopySavedEmpty', 'scratchpadCopySavedInvalid', 'scratchpadCopySavedCopying', 'scratchpadCopySavedSuccess', 'scratchpadCopySavedFailure']) assert(messages[key]?.message);
        assert.equal(m.view.copySavedButton.textContent, messages.scratchpadCopySaved.message); assert.equal(m.view.copySavedButton.title, messages.scratchpadCopySavedHelp.message);
        assert.equal(m.view.copySavedButton.textContent, locale === 'zh_CN' ? '复制已保存文本' : 'Copy saved text');
        await m.view.copySavedText(); assert.equal(m.view.copyStatus.textContent, messages.scratchpadCopySavedEmpty.message);
        await m.remote({ content: 'Localized saved test' }); m.click(); assert.equal(m.view.copyStatus.textContent, messages.scratchpadCopySavedCopying.message);
        held.resolve(); await flush(); assert.equal(m.view.copyStatus.textContent, messages.scratchpadCopySavedSuccess.message);
        m.view.clipboard = null; await m.view.copySavedText(); assert.equal(m.view.copyStatus.textContent, messages.scratchpadCopySavedFailure.message);
        const count = m.calls.length; m.controller.state = { ...m.controller.state, content: '\uD800' }; m.view.savedPreview.value = '\uD800';
        await m.view.copySavedText(); assert.equal(m.view.copyStatus.textContent, messages.scratchpadCopySavedInvalid.message); assert.equal(m.calls.length, count);
    });
}
test('Scratchpad saved copy: copy routes contain no storage, clipboard read, network, focus or selection fallback', () => {
    const source = fs.readFileSync(require.resolve('../shared/local-scratchpad-view'), 'utf8');
    const copy = source.slice(source.indexOf('        canCopy(event)'), source.indexOf('        exportText()'));
    assert(copy.includes('copySavedText')); assert(copy.includes('writeText.call(clipboard, payload)'));
    assert(!/readText|execCommand|permissions\.|storage\.|fetch\(|\.save\(|\.retry\(|\.setDraft\(|setSelectionRange|\.focus\(/.test(copy));
});

test('Scratchpad saved copy: unavailable saved activation preserves an otherwise current full-text receipt', async t => {
    const m = await model(t, 'Saved side'); await m.view.copyText();
    assert.deepEqual(m.calls, ['Local draft selected text']); const receipt = m.view.copyReceipt, status = m.view.copyStatus.textContent;
    assert.equal(status, catalog().scratchpadCopySuccess.message); m.controller.pending = true;
    const before = remember(m); await m.view.copySavedText();
    assert.deepEqual(m.calls, ['Local draft selected text']); assert.equal(m.view.copyReceipt, receipt);
    assert.equal(m.view.copyStatus.textContent, status); assert(!m.view.copyStatus.hidden); assert.equal(m.view.copyAttempt, null); unchanged(m, before);
});

for (const late of ['conflict ended', 'pending write', 'workspace invalidated', 'document hidden']) {
    test(`Scratchpad saved copy: final DOM getter ${late} cannot admit a stale clipboard write`, async t => {
        const m = await model(t, 'Saved before final DOM check'), controls = m.view.copySavedButton.parentElement;
        const original = controls.getClientRects, reads = m.reads, writes = m.writes, draft = m.controller.draft;
        let triggered = false;
        m.view.clipboard = { get writeText() {
            let calls = 0;
            controls.getClientRects = function () {
                const value = original.call(this);
                // The second readiness pass in copyCurrent ends with this DOM
                // read. Eligibility must be checked again after it returns.
                if (++calls === 2) {
                    triggered = true;
                    if (late === 'conflict ended') m.controller.conflict = false;
                    if (late === 'pending write') m.controller.pendingWrite = true;
                    if (late === 'workspace invalidated') m.backend.workspace.invalidated = true;
                    if (late === 'document hidden') m.document.hidden = true;
                }
                return value;
            };
            return value => { m.calls.push(value); return Promise.resolve(); };
        } };
        m.click(); assert(triggered, 'probe must reach the final DOM eligibility mutation'); assert.deepEqual(m.calls, []);
        await flush(); assert.equal(m.view.copyAttempt, null); noReceipt(m);
        assert.equal(m.reads, reads); assert.equal(m.writes, writes); assert.equal(m.controller.draft, draft); assert.deepEqual(m.effects, []);
    });
}
