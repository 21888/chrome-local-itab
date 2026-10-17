const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const api = require('../shared/local-scratchpad-store');
const { Controller } = require('../shared/local-scratchpad-controller');
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

// Real View/Store/Controller; unchanged shared DOM model. These local stand-ins
// explicitly supply textarea LF normalization, selection properties and observer
// records. They do not simulate native selection events, default button clicks,
// auto-detachment on append, Chromium activation or the OS clipboard.
async function model(t, text = 'A selected Z', options = {}) {
    const document = createDocument({ blurUnavailableFocus: true }), effects = [], observers = [], rootListeners = new Map();
    const create = document.createElement;
    document.createElement = tag => {
        const node = create(tag);
        if (tag === 'textarea') {
            let value = '';
            Object.defineProperty(node, 'value', { configurable: true, get: () => value, set: next => { value = options.normalize ? String(next).replace(/\r\n?/g, '\n') : next; } });
            node.selectionStart = node.selectionEnd = 0; node.selectionDirection = 'none';
            node.setSelectionRange = () => effects.push('selection setter');
        }
        return node;
    };
    document.getSelection = () => { effects.push('document selection'); throw Error('wrong source'); };
    let raw = { ...api.initial(), enabled: true, content: text }, reads = 0, writes = 0, failRead = false, failWrite = false, heldWrite = null;
    const subscriptions = new Set(), calls = [];
    const backend = {
        lock: action => Promise.resolve().then(action),
        async read() { reads++; if (failRead) throw Error('synthetic read failure'); return structuredClone(raw); },
        async write(value) { if (heldWrite) await heldWrite; if (failWrite) throw Error('synthetic write failure'); writes++; raw = structuredClone(value); subscriptions.forEach(fn => fn()); },
        subscribe(fn) { subscriptions.add(fn); return () => subscriptions.delete(fn); }
    };
    const clipboard = { writeText(value) { calls.push(value); return options.writeText ? options.writeText(value) : Promise.resolve(); }, readText() { effects.push('clipboard read'); throw Error('not allowed'); } };
    const window = {
        LocalItabScratchpad: { ...api }, navigator: { clipboard, permissions: { query() { effects.push('permissions'); throw Error('not allowed'); } } },
        fetch() { effects.push('network'); throw Error('not allowed'); }, getSelection() { effects.push('window selection'); throw Error('wrong source'); },
        getComputedStyle: node => ({ visibility: node.style.visibility || 'visible' }),
        addEventListener(type, fn) { const set = rootListeners.get(type) || new Set(); set.add(fn); rootListeners.set(type, set); },
        removeEventListener(type, fn) { rootListeners.get(type)?.delete(fn); },
        MutationObserver: class {
            constructor(callback) { this.callback = callback; this.records = []; observers.push(this); }
            observe(target, config) { this.target = target; this.config = config; this.active = true; }
            disconnect() { this.active = false; this.records = []; }
            takeRecords() { const records = this.records; this.records = []; return records; }
        }
    };
    if (options.locale) { const catalog = JSON.parse(fs.readFileSync(require.resolve(`../_locales/${options.locale}/messages.json`), 'utf8')); window.i18n = { t: key => catalog[key]?.message || key }; }
    if (options.missingTranslations) window.i18n = { t: key => key };
    vm.runInNewContext(fs.readFileSync(require.resolve('../shared/local-scratchpad-view'), 'utf8'), { window, document });
    const host = document.createElement('article'); document.body.append(host);
    const controller = new Controller(new api.Store(backend), { delay: 60000 });
    const view = new window.LocalItabScratchpad.View(host, { controller });
    t.after(() => view.destroy()); await flush();
    const range = (start, end, direction = 'forward') => { view.textarea.selectionStart = start; view.textarea.selectionEnd = end; view.textarea.selectionDirection = direction; };
    range(2, 10, 'backward');
    const click = (node = view.copySelectionButton, fields = {}) => node.dispatch('click', { currentTarget: node, defaultPrevented: false, ...fields });
    return { window, document, host, view, controller, backend, calls, effects, observers, clipboard, range, click,
        get reads() { return reads; }, get writes() { return writes; }, get raw() { return raw; },
        failRead(value) { failRead = value; }, failWrite(value) { failWrite = value; }, holdWrite(value) { heldWrite = value; },
        queue(record) { observers.filter(o => o.active && (record.type !== 'attributes' || o.config.attributes)).forEach(o => o.records.push(record)); },
        deliver() { observers.filter(o => o.active).forEach(o => o.callback(o.takeRecords())); },
        rootEvent(type) { rootListeners.get(type)?.forEach(fn => fn({ type })); },
        documentEvent(type, fields = {}) { return document.listeners.get(type)?.({ target: document, ...fields }); }
    };
}
function remember(m) {
    return { reads: m.reads, writes: m.writes, draft: m.controller.draft, generation: m.controller.generation, state: m.controller.state,
        pending: m.controller.pending, error: m.controller.error, conflict: m.controller.conflict, readError: m.controller.readError,
        status: m.view.status.textContent, focus: m.document.activeElement,
        range: [m.view.textarea.selectionStart, m.view.textarea.selectionEnd, m.view.textarea.selectionDirection] };
}
function unchanged(m, before) {
    assert.deepEqual(remember(m), before); assert.deepEqual(m.effects, []);
}

test('Scratchpad selection copy: native adjacent entry uses independent polite feedback', async t => {
    const m = await model(t), button = m.view.copySelectionButton, controls = m.view.copyButton.parentElement;
    assert.equal(button.tagName, 'BUTTON'); assert.equal(button.type, 'button'); assert.equal(button.textContent, 'Copy selected text');
    assert.equal(controls.children[controls.children.indexOf(m.view.copyButton) + 1], button);
    assert.equal(m.view.copyStatus.getAttribute('role'), 'status'); assert.equal(m.view.copyStatus.getAttribute('aria-live'), 'polite');
    assert.equal(m.view.copyStatus.getAttribute('aria-atomic'), 'true'); assert.notEqual(m.view.copyStatus, m.view.status);
    assert.equal(button.disabled, undefined); assert.equal(button.getAttribute('aria-disabled'), 'false');
    assert.deepEqual(m.calls, []); assert.equal(m.writes, 0);
});

test('Scratchpad selection copy: native-normalized DOM offsets differ from unchanged full controller CRLF payload', async t => {
    const text = '\uFEFFlead\r\n 中文 😀 e\u0301\r<literal>\n end ', m = await model(t, text, { normalize: true });
    const dom = text.replace(/\r\n?/g, '\n'), start = dom.indexOf(' 中文'), end = dom.indexOf(' end');
    m.range(start, end, 'backward'); m.view.copySelectionButton.focus();
    m.view.savedPreview.value = 'wrong saved preview'; m.view.importPreview.textContent = 'wrong import preview';
    const before = remember(m); m.click();
    assert.deepEqual(m.calls, [dom.slice(start, end)], 'writeText must run synchronously in click');
    assert.equal(m.view.copyStatus.textContent, 'Copying selected text…');
    assert.equal(m.view.copyButton.getAttribute('aria-disabled'), 'true'); assert.equal(m.view.copySelectionButton.getAttribute('aria-disabled'), 'true');
    await flush(); unchanged(m, before); assert.equal(m.view.copyStatus.textContent, 'Selected text copied.');
    m.click(m.view.copyButton); assert.deepEqual(m.calls, [dom.slice(start, end), text]); await flush();
    unchanged(m, before); assert.equal(m.view.copyStatus.textContent, 'Current text copied.');
});

for (const selected of [' \t ', '\uFEFF', '😀', 'e\u0301', '\nline 1\nline 2\n', '<script>literal & text</script>', '\uFEFF \t中文 😀 e\u0301\n  ', '😀'.repeat(33000)]) {
    test(`Scratchpad selection copy: exact complete slice ${selected.length > 100 ? 'beyond save limit' : JSON.stringify(selected)}`, async t => {
        const m = await model(t, 'saved'); m.controller.setDraft('\uD800left' + selected + 'right\uDC00'); m.controller.cancelTimer();
        m.range(5, 5 + selected.length); const before = remember(m); m.click();
        assert.deepEqual(m.calls, [selected]); await flush(); unchanged(m, before);
        assert.equal(m.view.copyStatus.textContent, 'Selected text copied.'); assert.equal(m.view.copyStatus.children.length, 0);
    });
}

for (const [name, text, start, end] of [
    ['empty', 'abc', 1, 1], ['negative', 'abc', -1, 2], ['reversed', 'abc', 2, 1], ['out of range', 'abc', 0, 4],
    ['fractional', 'abc', 0.5, 2], ['NaN', 'abc', NaN, 2], ['infinite', 'abc', 0, Infinity], ['string', 'abc', '0', 2],
    ['missing', 'abc', undefined, 2], ['split high surrogate', 'a😀b', 1, 2], ['split low surrogate', 'a😀b', 2, 3],
    ['invalid selected Unicode', 'a\uD800b', 1, 2], ['empty editor', '', 0, 0]
]) {
    test(`Scratchpad selection copy: ${name} gives guidance without a clipboard call`, async t => {
        const m = await model(t, 'saved'); m.controller.setDraft(text); m.controller.cancelTimer(); m.range(start, end);
        const before = remember(m); await m.view.copySelectedText();
        assert.deepEqual(m.calls, []); assert.match(m.view.copyStatus.textContent, /Select nonempty text.*complete Unicode.*clipboard was not changed/);
        unchanged(m, before); assert.equal(m.view.copyAttempt, null);
    });
}

for (const mode of ['saved', 'unsaved', 'saving', 'save failure', 'conflict', 'read failure', 'over-limit', 'invalid outside']) {
    test(`Scratchpad selection copy: ${mode} loaded draft remains copyable without changing save/Find/import feedback`, async t => {
        const m = await model(t), draft = mode === 'over-limit' ? 'x selected ' + '😀'.repeat(33000) : mode === 'invalid outside' ? 'x selected \uD800' : 'x selected draft';
        if (mode !== 'saved') { m.controller.setDraft(draft); m.controller.cancelTimer(); }
        let held, saving;
        if (mode === 'saving') { held = deferred(); m.holdWrite(held.promise); saving = m.controller.save(); await flush(); assert(m.controller.pending); }
        if (mode === 'save failure') { m.failWrite(true); await assert.rejects(m.controller.save()); }
        if (mode === 'conflict') { await m.backend.write({ ...m.raw, revision: 1, content: 'remote' }); await flush(); assert(m.controller.conflict); }
        if (mode === 'read failure') { m.failRead(true); await assert.rejects(m.controller.refresh()); assert(m.view.textarea.readOnly); }
        if (mode === 'over-limit') await assert.rejects(m.controller.save(), { code: 'TEXT_LIMIT' });
        if (mode === 'invalid outside') await assert.rejects(m.controller.save(), { code: 'TEXT' });
        m.view.findButton.dispatch('click'); m.view.findInput.value = 'preserved query'; m.view.findStatus.textContent = 'preserved matches';
        m.view.importInfo.textContent = 'preserved import'; m.view.importPreview.textContent = 'preserved preview';
        m.range(2, 10); m.view.copySelectionButton.focus(); const before = remember(m);
        await m.view.copySelectedText(); assert.deepEqual(m.calls, ['selected']); unchanged(m, before);
        assert.equal(m.view.findInput.value, 'preserved query'); assert.equal(m.view.findStatus.textContent, 'preserved matches');
        assert.equal(m.view.importInfo.textContent, 'preserved import'); assert.equal(m.view.importPreview.textContent, 'preserved preview');
        if (held) { held.resolve(); await saving; }
    });
}

for (const failure of ['missing API', 'throwing getter', 'synchronous denial', 'rejection']) {
    test(`Scratchpad selection copy: ${failure} retains selection with explicit retry`, async t => {
        const m = await model(t); m.view.copySelectionButton.focus();
        if (failure === 'missing API') m.view.clipboard = null;
        if (failure === 'throwing getter') m.view.clipboard = { get writeText() { throw Error('synthetic getter denial'); } };
        if (failure === 'synchronous denial') m.view.clipboard = { writeText() { throw Error('synthetic denial'); } };
        if (failure === 'rejection') m.view.clipboard = { writeText() { return Promise.reject(Error('synthetic denial')); } };
        const before = remember(m); await m.view.copySelectedText(); unchanged(m, before);
        assert.match(m.view.copyStatus.textContent, /selection is still here.*retry.*manually/);
        assert.equal(m.view.copyAttempt, null); assert.equal(m.view.copySelectionButton.getAttribute('aria-disabled'), 'false');
        await flush(); assert.deepEqual(m.calls, []); m.view.clipboard = m.clipboard;
        m.click(); assert.deepEqual(m.calls, ['selected']); await flush(); unchanged(m, before);
    });
}

for (const first of ['full', 'selection']) for (const rejected of [false, true]) {
    test(`Scratchpad selection copy: shared pending ${first} lock survives invalidation and ${rejected ? 'rejection' : 'success'}`, async t => {
        const held = deferred(), m = await model(t, 'A selected Z', { writeText: () => held.promise });
        const primary = first === 'full' ? m.view.copyButton : m.view.copySelectionButton, other = first === 'full' ? m.view.copySelectionButton : m.view.copyButton;
        m.click(primary); const attempt = m.view.copyAttempt;
        m.click(primary); m.click(other); assert.equal(m.calls.length, 1);
        m.controller.setDraft('B selected Z'); m.controller.setDraft('A selected Z'); m.controller.cancelTimer();
        m.click(other); assert.equal(m.calls.length, 1); assert.equal(m.view.copyAttempt, attempt); assert(m.view.copyStatus.hidden);
        if (rejected) held.reject(Error('synthetic denial')); else held.resolve();
        await flush(); assert.equal(m.view.copyAttempt, null); assert.equal(m.view.copyStatus.textContent, '');
        m.view.clipboard = { writeText(value) { m.calls.push(value); return Promise.resolve(); } };
        m.click(other); await flush(); assert.deepEqual(m.calls, first === 'full' ? ['A selected Z', 'selected'] : ['selected', 'A selected Z']);
    });
}

for (const eventType of ['select', 'selectionchange', 'document selectionchange']) for (const settled of [false, true]) {
    test(`Scratchpad selection copy: ${eventType} retires ${settled ? 'settled' : 'pending'} selection ABA feedback only`, async t => {
        const held = deferred(), m = await model(t, 'A selected Z', { writeText: () => held.promise }); m.click();
        if (settled) { held.resolve(); await flush(); }
        const attempt = m.view.copyAttempt;
        m.range(0, 1); m.range(2, 10, 'backward');
        if (eventType === 'document selectionchange') { m.view.textarea.focus(); await m.documentEvent('selectionchange'); }
        else m.view.textarea.dispatch(eventType);
        assert(m.view.copyStatus.hidden); assert.equal(m.view.copyAttempt, attempt);
        if (!settled) { m.click(m.view.copyButton); assert.equal(m.calls.length, 1); held.resolve(); await flush(); }
        assert.equal(m.view.copyStatus.textContent, '');
        m.click(m.view.copyButton); await flush(); m.range(1, 2); m.view.textarea.dispatch('select'); await m.documentEvent('selectionchange');
        assert.equal(m.view.copyStatus.textContent, 'Current text copied.', 'selection changes cannot retire a full-text copy');
    });
}

test('Scratchpad selection copy: unrelated document selection does not retire a receipt', async t => {
    const m = await model(t); m.view.copySelectionButton.focus(); await m.view.copySelectedText();
    await m.documentEvent('selectionchange'); assert.equal(m.view.copyStatus.textContent, 'Selected text copied.');
    m.range(2, 9); await m.documentEvent('selectionchange'); assert(m.view.copyStatus.hidden);
});

const changes = [
    ['range without event', m => m.range(0, 1)], ['direction without event', m => m.range(2, 10, 'forward')],
    ['draft ABA', m => { m.controller.setDraft('B selected Z'); m.controller.setDraft('A selected Z'); m.controller.cancelTimer(); }],
    ['DOM text without input', m => { m.view.textarea.value = 'B selected Z'; }],
    ['editor input ABA', m => { m.view.textarea.value = 'B selected Z'; m.view.textarea.dispatch('input'); m.view.textarea.value = 'A selected Z'; m.view.textarea.dispatch('input'); m.controller.cancelTimer(); }],
    ['editor identity', m => { const fresh = m.document.createElement('textarea'); fresh.value = m.view.textarea.value; fresh.selectionStart = 2; fresh.selectionEnd = 10; fresh.selectionDirection = 'backward'; m.view.textarea.replaceWith(fresh); m.view.textarea = fresh; }],
    ['origin identity', m => { const fresh = m.document.createElement('button'); m.view.copySelectionButton.replaceWith(fresh); m.view.copySelectionButton = fresh; }],
    ['editor reparent', m => { const container = m.document.createElement('div'); m.host.append(container); m.view.textarea.remove(); container.append(m.view.textarea); }],
    ['origin reparent', m => { m.view.copySelectionButton.remove(); m.host.append(m.view.copySelectionButton); }],
    ['document identity', m => { m.view.textarea.ownerDocument = {}; }],
    ['host identity', m => { m.view.host = m.document.body; }],
    ['workspace id', m => { m.backend.workspace.id = 'other'; }], ['workspace generation', m => { m.backend.workspace.generation++; }],
    ['workspace object', m => { m.backend.workspace = { ...m.backend.workspace }; }], ['session object', m => { m.window.LocalItabWorkspaces.session = { ...m.backend.workspace }; }],
    ['workspace ABA with render', m => { const original = m.backend.workspace; m.backend.workspace = { ...original }; m.controller.emit(); m.backend.workspace = original; m.controller.emit(); }],
    ['loaded false', m => { m.controller.loaded = false; }], ['departing', m => { m.window.LocalItabContentLifecycle = { departing: true }; }],
    ['destroy', m => m.view.destroy()], ['pagehide', m => m.rootEvent('pagehide')], ['window blur', m => m.rootEvent('blur')],
    ['visibility ABA', m => { m.document.hidden = true; m.documentEvent('visibilitychange'); m.document.hidden = false; }],
    ['editor composition ABA', m => { m.view.textarea.dispatch('compositionstart'); m.view.textarea.dispatch('compositionend'); m.controller.cancelTimer(); }],
    ['find composition ABA', m => { m.view.findButton.dispatch('click'); m.view.findInput.dispatch('compositionstart'); m.view.findInput.dispatch('compositionend'); }],
    ['queued hide ABA', m => { m.queue({ type: 'attributes', target: m.host, attributeName: 'hidden' }); }],
    ['queued editor detach/reattach', m => { m.view.textarea.remove(); m.host.append(m.view.textarea); m.queue({ type: 'childList', target: m.host, removedNodes: [m.view.textarea] }); }],
    ['queued origin detach/reattach', m => { const parent = m.view.copySelectionButton.parentElement; m.view.copySelectionButton.remove(); parent.append(m.view.copySelectionButton); m.queue({ type: 'childList', target: parent, removedNodes: [m.view.copySelectionButton] }); }]
];
for (const [index, [name, change]] of changes.entries()) {
    test(`Scratchpad selection copy: ${name} cannot acknowledge an old ${index % 2 ? 'failure' : 'success'}`, async t => {
        const held = deferred(), m = await model(t, 'A selected Z', { writeText: () => held.promise });
        m.backend.workspace = { id: 'synthetic', generation: 1 }; m.window.LocalItabWorkspaces = { session: m.backend.workspace };
        m.click(); const attempt = m.view.copyAttempt; change(m);
        assert.equal(m.view.copyAttempt, attempt); m.click(m.view.copyButton); assert.deepEqual(m.calls, ['selected']);
        if (index % 2) held.reject(Error('synthetic denial')); else held.resolve(); await flush();
        assert.equal(m.view.copyStatus.textContent, ''); assert(m.view.copyStatus.hidden); assert.equal(m.view.copyAttempt, null);
        assert(m.observers.every(observer => !observer.active));
    });
}

for (const blocked of ['unloaded', 'closed', 'hidden document', 'visibility hidden', 'hidden host', 'inert host', 'aria-hidden', 'display none',
    'visibility collapse', 'closed details', 'detached editor', 'detached origin', 'disabled origin', 'departing', 'invalidated workspace', 'suspended workspace', 'wrong session',
    'editor composing', 'find composing']) {
    test(`Scratchpad selection copy: ${blocked} admission has no clipboard or I/O effect`, async t => {
        const m = await model(t);
        if (blocked === 'unloaded') m.controller.loaded = false;
        if (blocked === 'closed') m.controller.closed = true;
        if (blocked === 'hidden document') m.document.hidden = true;
        if (blocked === 'visibility hidden') m.document.visibilityState = 'hidden';
        if (blocked === 'hidden host') m.host.hidden = true;
        if (blocked === 'inert host') m.host.inert = true;
        if (blocked === 'aria-hidden') m.host.setAttribute('aria-hidden', 'true');
        if (blocked === 'display none') m.host.style.display = 'none';
        if (blocked === 'visibility collapse') m.view.copySelectionButton.style.visibility = 'collapse';
        if (blocked === 'closed details') { const details = m.document.createElement('details'); m.host.remove(); m.document.body.append(details); details.append(m.host); }
        if (blocked === 'detached editor') m.view.textarea.remove();
        if (blocked === 'detached origin') m.view.copySelectionButton.remove();
        if (blocked === 'disabled origin') m.view.copySelectionButton.disabled = true;
        if (blocked === 'departing') m.window.LocalItabContentLifecycle = { departing: true };
        if (blocked.includes('workspace') || blocked === 'wrong session') {
            m.backend.workspace = { id: 'synthetic', generation: 1, invalidated: blocked === 'invalidated workspace', _suspended: blocked === 'suspended workspace' };
            m.window.LocalItabWorkspaces = { session: blocked === 'wrong session' ? {} : m.backend.workspace };
        }
        if (blocked === 'editor composing') m.controller.composing = true;
        if (blocked === 'find composing') m.view.findComposing = true;
        const before = remember(m); m.click(); await m.view.copySelectedText(); assert.deepEqual(m.calls, []); unchanged(m, before);
    });
}

test('Scratchpad selection copy: same-draft save and conflict refresh preserve a pending selection receipt', async t => {
    const held = deferred(), m = await model(t, 'saved', { writeText: () => held.promise });
    m.controller.setDraft('A selected Z'); m.controller.cancelTimer(); m.range(2, 10, 'backward'); m.click();
    const state = m.controller.state, generation = m.controller.generation;
    await m.controller.save(); assert.notEqual(m.controller.state, state); assert.equal(m.controller.generation, generation);
    assert.equal(m.view.copyStatus.textContent, 'Copying selected text…');
    held.resolve(); await flush(); assert.equal(m.view.copyStatus.textContent, 'Selected text copied.');
    m.controller.setDraft('A selected Z!'); m.controller.cancelTimer(); m.click();
    await m.backend.write({ ...m.raw, revision: m.raw.revision + 1, content: 'remote' }); await flush();
    assert(m.controller.conflict); assert.equal(m.view.copyStatus.textContent, 'Selected text copied.'); assert.equal(m.view.savedPreview.value, 'remote');
});

test('Scratchpad selection copy: active import session and Find result are unchanged', async t => {
    const m = await model(t);
    m.view.importFile.click = () => {}; // Test-local chooser stand-in; the shared model has no native click.
    m.view.chooseImport(); const session = m.view.importSession;
    session.text = 'import contents'; session.name = 'synthetic.txt'; m.view.importPanel.hidden = false; m.view.importAppend.checked = true;
    m.view.importPreview.textContent = 'preview'; m.view.importInfo.textContent = 'info';
    m.view.findPanel.hidden = false; m.view.findInput.value = 'selected'; const result = m.view.findResult = { query: 'selected', text: m.view.textarea.value, start: 2, end: 10 };
    m.view.findStatus.textContent = 'find result'; m.view.findHeldEnter = { key: 'Enter' };
    m.view.textarea.focus(); const before = remember(m); await m.view.copySelectedText(); unchanged(m, before);
    assert.equal(m.view.importSession, session); assert.equal(m.view.importAppend.checked, true); assert(!m.view.importPanel.hidden);
    assert.equal(m.view.importInfo.textContent, 'info'); assert.equal(m.view.importPreview.textContent, 'preview');
    assert.equal(m.view.findResult, result); assert.equal(m.view.findStatus.textContent, 'find result'); assert.equal(m.view.findHeldEnter.key, 'Enter');
});

for (const fields of [{ defaultPrevented: true }, { detail: 2 }, { repeat: true }, { isComposing: true }, { keyCode: 229 }]) {
    test(`Scratchpad selection copy: click guard ${JSON.stringify(fields)}`, async t => {
        const m = await model(t), before = remember(m); m.click(undefined, fields); await flush(); assert.deepEqual(m.calls, []); unchanged(m, before);
    });
}

for (const key of ['Enter', ' ']) {
    test(`Scratchpad selection copy: held ${JSON.stringify(key)} cannot duplicate a native-modeled activation`, async t => {
        const m = await model(t), button = m.view.copySelectionButton; button.focus(); const before = remember(m);
        button.dispatch('keydown', { key, repeat: false }); m.click(); await flush();
        const repeat = button.dispatch('keydown', { key, repeat: true }); assert(repeat.prevented);
        m.click(); await flush(); assert.deepEqual(m.calls, ['selected']); unchanged(m, before);
        button.dispatch('keyup', { key }); button.dispatch('keydown', { key, repeat: false }); m.click(); await flush();
        assert.deepEqual(m.calls, ['selected', 'selected']); unchanged(m, before);
    });
}

for (const phase of ['clipboard getter', 'write invocation', 'DOM getter']) {
    test(`Scratchpad selection copy: ${phase} reentry is checked and cannot bypass the pending lock`, async t => {
        const held = deferred(), m = await model(t); let nested = 0;
        const change = () => { nested++; m.range(0, 1); m.click(m.view.copyButton); };
        if (phase === 'clipboard getter') m.view.clipboard = { get writeText() { change(); return () => { m.calls.push('unexpected'); return held.promise; }; } };
        if (phase === 'write invocation') m.view.clipboard = { writeText(text) { m.calls.push(text); change(); return held.promise; } };
        if (phase === 'DOM getter') {
            const editor = m.view.textarea; let once = true, value = editor.value;
            Object.defineProperty(editor, 'value', { configurable: true, get() { if (once) { once = false; m.controller.generation++; change(); } return value; }, set(next) { value = next; } });
        }
        m.click(); assert.equal(nested, 1);
        assert.deepEqual(m.calls, phase === 'write invocation' ? ['selected'] : []);
        assert(m.view.copyStatus.hidden);
        if (phase === 'write invocation') { assert(m.view.copyAttempt); m.click(m.view.copyButton); assert.equal(m.calls.length, 1); }
        held.resolve(); await flush(); assert.equal(m.view.copyAttempt, null); assert.equal(m.view.copyStatus.textContent, '');
    });
}

test('Scratchpad selection copy: stale callback, source replacement and remount cannot use a newer editor', async t => {
    const held = deferred(), m = await model(t, 'A selected Z', { writeText: () => held.promise });
    const original = m.view.copySelectionButton, callback = original.listeners.get('click')[0]; m.click(); m.view.destroy();
    const freshController = new Controller(new api.Store(m.backend), { delay: 60000 }), freshCalls = [];
    const fresh = new m.window.LocalItabScratchpad.View(m.host, { controller: freshController, clipboard: { writeText(text) { freshCalls.push(text); return Promise.resolve(); } } });
    t.after(() => fresh.destroy()); await flush(); fresh.textarea.selectionStart = 2; fresh.textarea.selectionEnd = 10; fresh.textarea.selectionDirection = 'backward';
    callback({ target: fresh.copySelectionButton, currentTarget: fresh.copySelectionButton });
    m.view.copySelectionButton = fresh.copySelectionButton; m.view.textarea = fresh.textarea;
    original.dispatch('click'); await m.view.copySelectedText(); assert.deepEqual(m.calls, ['selected']);
    await fresh.copySelectedText(); assert.deepEqual(freshCalls, ['selected'], 'lock remains per View, as before');
    held.resolve(); await flush(); assert.equal(fresh.copyStatus.textContent, 'Selected text copied.'); assert.equal(m.view.copyStatus.textContent, '');
});

test('Scratchpad selection copy: source replacement before first copy and foreign callback targets fail closed', async t => {
    const m = await model(t), original = m.view.copySelectionButton, callback = original.listeners.get('click')[0];
    callback({ target: m.view.copyButton, currentTarget: m.view.copyButton }); assert.deepEqual(m.calls, []);
    const fresh = m.document.createElement('button'); original.replaceWith(fresh); m.view.copySelectionButton = fresh;
    callback({ target: original, currentTarget: original }); await m.view.copySelectedText(); assert.deepEqual(m.calls, []);
});

for (const locale of ['en', 'zh_CN', 'fallback']) {
    test(`Scratchpad selection copy: ${locale} covers label, guidance, pending, success and failure`, async t => {
        const held = deferred(), m = await model(t, 'A selected Z', { locale: locale === 'fallback' ? undefined : locale, missingTranslations: locale === 'fallback', writeText: () => held.promise });
        const catalog = JSON.parse(fs.readFileSync(require.resolve(`../_locales/${locale === 'fallback' ? 'en' : locale}/messages.json`), 'utf8'));
        for (const key of ['scratchpadCopySelection', 'scratchpadCopySelectionHelp', 'scratchpadCopySelectionCopying', 'scratchpadCopySelectionSuccess', 'scratchpadCopySelectionFailure']) assert(catalog[key]?.message);
        assert.equal(m.view.copySelectionButton.textContent, catalog.scratchpadCopySelection.message);
        m.range(0, 0); await m.view.copySelectedText(); assert.equal(m.view.copyStatus.textContent, catalog.scratchpadCopySelectionHelp.message);
        m.range(2, 10); m.click(); assert.equal(m.view.copyStatus.textContent, catalog.scratchpadCopySelectionCopying.message);
        held.resolve(); await flush(); assert.equal(m.view.copyStatus.textContent, catalog.scratchpadCopySelectionSuccess.message);
        m.view.clipboard = null; await m.view.copySelectedText(); assert.equal(m.view.copyStatus.textContent, catalog.scratchpadCopySelectionFailure.message);
    });
}

test('Scratchpad selection copy: no storage, permission, clipboard-read, fallback or automatic retry path', () => {
    const source = fs.readFileSync(require.resolve('../shared/local-scratchpad-view'), 'utf8');
    const copy = source.slice(source.indexOf('        canCopy(event)'), source.indexOf('        exportText()'));
    assert(!/readText|execCommand|permissions\.|storage\.|fetch\(|\.save\(|\.retry\(|\.setDraft\(|setSelectionRange|\.focus\(/.test(copy));
    assert(copy.includes('editorText.slice(start, end)')); assert(copy.includes('writeText.call(clipboard, payload)'));
});

test('Scratchpad selection copy: remount without destroy rejects reattached original controls and preserves old pending lock', async t => {
    const held = deferred(), m = await model(t, 'A selected Z', { writeText: () => held.promise });
    const owner = m.view.copySelectionOwner, originalStatus = m.view.copyStatus;
    m.click(); const attempt = m.view.copyAttempt;
    const freshController = new Controller(new api.Store(m.backend), { delay: 60000 }), freshCalls = [];
    const fresh = new m.window.LocalItabScratchpad.View(m.host, { controller: freshController, clipboard: { writeText(text) { freshCalls.push(text); return Promise.resolve(); } } });
    t.after(() => fresh.destroy()); await flush();
    assert.equal(m.view.copyAttempt, attempt); assert(originalStatus.hidden);
    m.host.append(owner.editor, owner.controls, owner.status); // replaceChildren already detached these originals.
    owner.origin.dispatch('click'); await m.view.copySelectedText(); assert.deepEqual(m.calls, ['selected']);
    fresh.textarea.selectionStart = 2; fresh.textarea.selectionEnd = 10; fresh.textarea.selectionDirection = 'backward';
    await fresh.copySelectedText(); assert.deepEqual(freshCalls, ['selected']);
    held.resolve(); await flush(); assert.equal(m.view.copyAttempt, null); assert.equal(originalStatus.textContent, '');
    assert.equal(fresh.copyStatus.textContent, 'Selected text copied.');
    owner.origin.dispatch('click'); assert.deepEqual(m.calls, ['selected']);
});

for (const change of ['status replacement', 'status document', 'controls document', 'status parent']) {
    test(`Scratchpad selection copy: ${change} cannot redirect old feedback`, async t => {
        const held = deferred(), m = await model(t, 'A selected Z', { writeText: () => held.promise }), originalStatus = m.view.copyStatus;
        m.click(); let newStatus;
        if (change === 'status replacement') { newStatus = m.document.createElement('p'); newStatus.textContent = 'new owner status'; originalStatus.replaceWith(newStatus); m.view.copyStatus = newStatus; }
        if (change === 'status document') originalStatus.ownerDocument = {};
        if (change === 'controls document') m.view.copySelectionButton.parentElement.ownerDocument = {};
        if (change === 'status parent') { originalStatus.remove(); m.document.body.append(originalStatus); }
        held.resolve(); await flush(); assert.equal(originalStatus.textContent, ''); assert(originalStatus.hidden);
        if (newStatus) assert.equal(newStatus.textContent, 'new owner status');
        m.click(); assert.deepEqual(m.calls, ['selected']);
    });
}

for (const state of ['missing workspace session', 'replacement controller']) {
    test(`Scratchpad selection copy: ${state} blocks a new selection and retires pending feedback`, async t => {
        const held = deferred(), m = await model(t, 'A selected Z', { writeText: () => held.promise });
        m.backend.workspace = { id: 'synthetic', generation: 1 }; m.window.LocalItabWorkspaces = { session: m.backend.workspace };
        m.click(); const attempt = m.view.copyAttempt;
        if (state === 'missing workspace session') m.window.LocalItabWorkspaces.session = null;
        else m.view.controller = Object.create(m.controller);
        m.view.render(); assert(m.view.copyStatus.hidden); assert.equal(m.view.copyAttempt, attempt);
        held.resolve(); await flush(); assert.equal(m.view.copyAttempt, null); assert.equal(m.view.copyStatus.textContent, '');
        m.click(); assert.deepEqual(m.calls, ['selected']);
        m.view.controller = m.controller;
    });
}

for (const mutation of ['disabled ABA', 'status detach/reattach']) {
    test(`Scratchpad selection copy: queued ${mutation} retires only selection receipt without early unlock`, async t => {
        const held = deferred(), m = await model(t, 'A selected Z', { writeText: () => held.promise }); m.click();
        const observer = m.observers.find(o => o.active), attempt = m.view.copyAttempt;
        assert(observer.config.attributeFilter.includes('disabled'));
        if (mutation === 'disabled ABA') {
            m.view.copySelectionButton.disabled = true; m.queue({ type: 'attributes', target: m.view.copySelectionButton, attributeName: 'disabled' }); m.view.copySelectionButton.disabled = false;
        } else {
            m.view.copyStatus.remove(); m.host.append(m.view.copyStatus); m.queue({ type: 'childList', target: m.host, removedNodes: [m.view.copyStatus] });
        }
        m.view.render(); assert(m.view.copyStatus.hidden); assert.equal(m.view.copyAttempt, attempt);
        m.click(m.view.copyButton); assert.deepEqual(m.calls, ['selected']);
        held.resolve(); await flush(); assert.equal(m.view.copyAttempt, null); assert.equal(m.view.copyStatus.textContent, '');
        m.click(m.view.copyButton); await flush(); const fullObserver = m.observers.find(o => o.active);
        assert(!fullObserver.config.attributeFilter.includes('disabled'));
        m.queue({ type: 'attributes', target: m.view.copyStatus, attributeName: 'hidden' }); m.deliver();
        assert.equal(m.view.copyStatus.textContent, 'Current text copied.');
    });
}

test('Scratchpad selection copy: own initial status visibility does not invalidate the receipt', async t => {
    const m = await model(t); let hidden = true;
    Object.defineProperty(m.view.copyStatus, 'hidden', { configurable: true, get: () => hidden, set(value) {
        if (value !== hidden) { hidden = value; m.queue({ type: 'attributes', target: m.view.copyStatus, attributeName: 'hidden' }); }
    } });
    m.click(); assert.deepEqual(m.calls, ['selected']); await flush(); assert.equal(m.view.copyStatus.textContent, 'Selected text copied.');
});
