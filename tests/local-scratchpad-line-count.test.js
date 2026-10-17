const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const storeApi = require('../shared/local-scratchpad-store');
const viewSource = fs.readFileSync(require.resolve('../shared/local-scratchpad-view'), 'utf8');
const controllerSource = fs.readFileSync(require.resolve('../shared/local-scratchpad-controller'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

// Real View, Store and Controller, with the unchanged shared finite DOM model.
// Only this file can opt into a synthetic textarea CR/CRLF-to-LF value setter.
// That demonstrates the DOM/controller distinction; it is not native Chrome QA.
function model({ content = '', language, normalizeTextarea = false, readHold } = {}) {
    const document = createDocument(), globals = new Map(), timers = new Map();
    const metrics = { reads: 0, writes: 0, locks: 0, timerStarts: 0, timerClears: 0, network: 0, clipboard: 0 };
    let raw = { ...storeApi.initial(), enabled: true, content }, failRead = false, failWrite = false, writeHold, tail = Promise.resolve(), timerId = 0;
    const subscriptions = new Set();
    const backend = {
        lock(fn) { metrics.locks++; const next = tail.then(fn); tail = next.catch(() => {}); return next; },
        async read() { metrics.reads++; if (readHold) await readHold; if (failRead) throw Error('synthetic read failure'); return structuredClone(raw); },
        async write(value) { if (writeHold) await writeHold; if (failWrite) throw Error('synthetic write failure'); metrics.writes++; raw = structuredClone(value); subscriptions.forEach(fn => fn()); },
        subscribe(fn) { subscriptions.add(fn); return () => subscriptions.delete(fn); }
    };
    const api = { ...storeApi }, schedule = fn => { metrics.timerStarts++; const id = ++timerId; timers.set(id, fn); return id; };
    const cancel = id => { metrics.timerClears++; timers.delete(id); };
    const clipboard = { writeText: async () => { metrics.clipboard++; } };
    const window = { LocalItabScratchpad: api, Blob, TextDecoder, setTimeout: schedule,
        fetch() { metrics.network++; throw Error('unexpected network'); },
        addEventListener(type, fn) { if (!globals.has(type)) globals.set(type, new Set()); globals.get(type).add(fn); },
        removeEventListener(type, fn) { globals.get(type)?.delete(fn); if (!globals.get(type)?.size) globals.delete(type); }
    };
    if (language) {
        const entries = ['en', 'zh_CN'].includes(language) ? JSON.parse(fs.readFileSync(require.resolve(`../_locales/${language}/messages.json`), 'utf8')) : {};
        window.i18n = { t: key => entries[key]?.message || key };
    }
    const create = document.createElement;
    document.createElement = tag => {
        const node = create(tag); node.click = () => node.dispatch('click');
        if (normalizeTextarea && tag === 'textarea') {
            let value = '';
            Object.defineProperty(node, 'value', { configurable: true, get: () => value, set: next => { value = String(next).replace(/\r\n?/g, '\n'); } });
        }
        return node;
    };
    const context = vm.createContext({ window, document, setTimeout: schedule, clearTimeout: cancel });
    vm.runInContext(controllerSource, context); vm.runInContext(viewSource, context);
    const host = document.createElement('article'); document.body.append(host);
    const controller = new api.Controller(new api.Store(backend));
    const view = new api.View(host, { controller, clipboard });
    view.textarea.selectionStart = view.textarea.selectionEnd = 0;
    view.textarea.selectionDirection = 'none';
    view.textarea.setSelectionRange = (start, end, direction = 'none') => {
        view.textarea.selectionStart = start; view.textarea.selectionEnd = end; view.textarea.selectionDirection = direction;
    };
    return { api, window, document, host, view, controller, backend, metrics, timers, globals, context,
        get raw() { return structuredClone(raw); }, readFail(value) { failRead = value; }, writeFail(value) { failWrite = value; }, holdWrite(value) { writeHold = value; },
        input(value) { view.textarea.value = value; view.textarea.dispatch('input'); },
        snapshot() { return { ...metrics }; }
    };
}
function expectCount(m, text, lines, label = 'Lines: ') {
    assert.equal(m.view.count.textContent, `${Array.from(text).length.toLocaleString()} / 32,000 · ${label}${lines.toLocaleString()}`);
}
async function loaded(options) { const m = model(options); await settle(); assert(m.controller.loaded); return m; }

test('line count: loading starts at zero and existing load render counts the loaded main editor', async t => {
    const hold = deferred(), m = model({ content: 'first\nsecond\n', readHold: hold.promise }); t.after(() => m.view.destroy());
    assert(!m.controller.loaded); assert(m.view.textarea.readOnly); expectCount(m, '', 0);
    assert.match(m.view.status.textContent, /Loading/); hold.resolve(); await settle();
    expectCount(m, 'first\nsecond\n', 3); assert(!m.view.textarea.readOnly); assert.match(m.view.status.textContent, /Saved/);
    assert.equal(m.metrics.writes, 0); assert.equal(m.metrics.timerStarts, 0);
});

test('line count: empty, whitespace, CRLF, bare CR/LF and consecutive final breaks are exact', async t => {
    const m = await loaded(); t.after(() => m.view.destroy()); m.controller.setComposing(true);
    for (const [value, lines] of [
        ['', 0], [' ', 1], [' \t  ', 1], ['one', 1], ['\n', 2], ['\r', 2], ['\r\n', 2],
        ['a\nb', 2], ['a\rb', 2], ['a\r\nb', 2], ['a\r\n\r\n', 3], ['\n\n\n', 4],
        ['\r\r\n', 3], ['\n\r\n\r', 4], ['a\r\nb\rc\n\n', 5], ['\t\n \r\n\t', 3]
    ]) { m.input(value); expectCount(m, value, lines); assert.equal(m.controller.draft, value); assert.equal(m.view.textarea.value, value); }
    assert.equal(m.metrics.writes, 0); assert.equal(m.metrics.timerStarts, 0);
});

test('line count: Unicode separators, literal markup, combining marks and incomplete surrogates are not extra breaks', async t => {
    const m = await loaded(); t.after(() => m.view.destroy()); m.controller.setComposing(true);
    const value = '\uFEFF😀e\u0301中\u0085\u2028\u2029\u200B\t<script>literal</script>\u000B\u000C\uD800\n末\uDC00';
    m.input(value); expectCount(m, value, 2); assert.equal(m.view.count.children.length, 0);
    m.controller.setComposing(false); await assert.rejects(m.controller.save(), error => error.code === 'TEXT');
    expectCount(m, value, 2); assert.match(m.view.status.textContent, /invalid Unicode/); assert.equal(m.metrics.writes, 0);
});

test('line count: width, soft wrapping, tabs and scroll geometry do not create logical lines', async t => {
    const value = 'long word\t😀 '.repeat(90), m = await loaded({ content: value }); t.after(() => m.view.destroy());
    expectCount(m, value, 1); const before = m.snapshot();
    for (const width of ['1px', '80px', '900px']) {
        m.view.textarea.style.width = width; m.view.textarea.scrollHeight = 7000; m.view.textarea.scrollTop = 37;
        m.controller.emit(); expectCount(m, value, 1); assert.equal(m.view.textarea.scrollTop, 37);
    }
    assert.deepEqual(m.snapshot(), before);
});

test('line count: 32,000 Unicode save limit stays exact while over-limit editor text is counted without truncation', async t => {
    const m = await loaded(); t.after(() => m.view.destroy());
    const accepted = '😀'.repeat(31998) + '\n\n'; m.input(accepted); expectCount(m, accepted, 3);
    await m.controller.save(); assert.equal(m.raw.content, accepted); const writes = m.metrics.writes;
    const rejected = accepted + '\n末'; m.input(rejected); expectCount(m, rejected, 4);
    await assert.rejects(m.controller.save(), error => error.code === 'TEXT_LIMIT');
    assert.equal(m.metrics.writes, writes); assert.equal(m.view.textarea.value, rejected); assert.equal(m.controller.draft, rejected);
    assert.match(m.view.status.textContent, /too long/); expectCount(m, rejected, 4); assert(m.view.retry.hidden);
});

test('line count: both metrics use one DOM read during composition, never a different controller snapshot', async t => {
    const m = await loaded({ content: 'controller' }); t.after(() => m.view.destroy()); m.controller.setComposing(true);
    const snapshot = '😀\r\nx\n'; let reads = 0;
    Object.defineProperty(m.view.textarea, 'value', { configurable: true, get() { reads++; return reads === 1 ? snapshot : 'different\n\n\n\n'; }, set() { assert.fail('composition must not assign the editor'); } });
    const before = m.snapshot(); m.view.render(); expectCount(m, snapshot, 3);
    assert.equal(reads, 1); assert.equal(m.controller.draft, 'controller'); assert.deepEqual(m.snapshot(), before);
});

test('line count: synthetic native-normalizing textarea uses DOM LF counts while stored/controller CRLF remains exact', async t => {
    const original = '😀\r\nb\rc\n', displayed = '😀\nb\nc\n';
    const m = await loaded({ content: original, normalizeTextarea: true }); t.after(() => m.view.destroy());
    assert.equal(m.controller.draft, original); assert.equal(m.raw.content, original); assert.equal(m.view.textarea.value, displayed);
    expectCount(m, displayed, 4); assert.notEqual(Array.from(original).length, Array.from(displayed).length);
    const before = m.snapshot(); m.controller.emit(); expectCount(m, displayed, 4);
    assert.deepEqual(m.snapshot(), before); assert.equal(m.controller.draft, original); assert.equal(m.raw.content, original);
});

test('line count: retained read-only draft and conflict preview remain separate through existing recovery', async t => {
    const m = await loaded({ content: 'saved' }); t.after(() => m.view.destroy()); m.input('draft\n\n');
    m.readFail(true); await assert.rejects(m.controller.refresh(), error => error.code === 'READ');
    assert(m.view.textarea.readOnly); assert(!m.view.retry.hidden); expectCount(m, 'draft\n\n', 3);
    const status = m.view.status.textContent, before = m.snapshot(); m.controller.emit();
    assert.equal(m.view.status.textContent, status); assert.deepEqual(m.snapshot(), before);
    m.readFail(false); await m.backend.write({ ...m.raw, revision: 1, content: 'remote\nline' }); await settle();
    assert(m.controller.conflict); assert(!m.view.savedPreview.hidden); assert.equal(m.view.savedPreview.value, 'remote\nline');
    expectCount(m, 'draft\n\n', 3); assert.match(m.view.status.textContent, /Another page/); assert(!m.view.useSaved.hidden);
    await m.controller.useSaved(); expectCount(m, 'remote\nline', 2); assert(!m.controller.conflict); assert(m.view.savedPreview.hidden);
});

test('line count: saving, newer pending edits, save error and explicit Retry keep their original state feedback', async t => {
    const m = await loaded(); t.after(() => m.view.destroy()); const hold = deferred();
    m.input('saving\n'); m.holdWrite(hold.promise); const pending = m.controller.save(); await settle();
    assert(m.controller.pending); expectCount(m, 'saving\n', 2); assert.match(m.view.status.textContent, /Saving/);
    m.input('new\n\n'); expectCount(m, 'new\n\n', 3); assert.match(m.view.status.textContent, /Saving/);
    hold.resolve(); m.holdWrite(null); await pending; await m.controller.save(); assert.equal(m.raw.content, 'new\n\n');
    m.writeFail(true); m.input('failed\ntext\n'); await assert.rejects(m.controller.save());
    expectCount(m, 'failed\ntext\n', 3); assert.match(m.view.status.textContent, /Could not confirm/); assert(!m.view.retry.hidden);
    const warning = m.view.status.textContent, before = m.snapshot(); m.view.render();
    assert.equal(m.view.status.textContent, warning); assert.deepEqual(m.snapshot(), before);
    m.writeFail(false); await m.controller.retry(); assert.equal(m.raw.content, 'failed\ntext\n');
    expectCount(m, 'failed\ntext\n', 3); assert.match(m.view.status.textContent, /Saved/);
});

test('line count: IME and equal-value input renders leave modeled caret, undo sentinel, focus and scroll untouched', async t => {
    const m = await loaded({ content: 'old' }); t.after(() => m.view.destroy()); const editor = m.view.textarea;
    editor.focus(); editor.selectionStart = 1; editor.selectionEnd = 3; editor.selectionDirection = 'backward'; editor.scrollTop = 57;
    let value = editor.value, assignments = 0, undo = ['synthetic prior edit']; const effects = [];
    Object.defineProperty(editor, 'value', { configurable: true, get: () => value, set: next => { assignments++; value = next; undo = []; } });
    editor.focus = () => effects.push('focus'); editor.setSelectionRange = () => effects.push('selection');
    editor.addEventListener('input', () => effects.push('input'));
    editor.dispatch('compositionstart'); value = '组\n字\n'; editor.dispatch('input'); expectCount(m, value, 3);
    m.controller.emit(); assert.equal(assignments, 0); assert.deepEqual(undo, ['synthetic prior edit']);
    assert.deepEqual([editor.selectionStart, editor.selectionEnd, editor.selectionDirection, editor.scrollTop], [1, 3, 'backward', 57]);
    assert.equal(m.document.activeElement, editor); assert.deepEqual(effects, ['input']);
    editor.dispatch('compositionend'); expectCount(m, value, 3); assert.equal(assignments, 0);
    value = 'after\n'; editor.dispatch('input'); expectCount(m, value, 2); assert.equal(assignments, 0);
    assert.deepEqual(undo, ['synthetic prior edit']); assert.deepEqual(effects, ['input', 'input']);
});

test('line count: import preview, Find selection and clipboard receipt are independent of count renders', async t => {
    const m = await loaded({ content: 'note\nnote\n' }); t.after(() => m.view.destroy());
    m.view.chooseImport(); const fileText = 'import\npreview\nwith\nmore\nlines\n', bytes = new TextEncoder().encode(fileText);
    m.view.importFile.files = [{ name: 'synthetic.txt', size: bytes.length, arrayBuffer: async () => bytes.buffer }];
    await m.view.readImport(); expectCount(m, 'note\nnote\n', 3); assert.equal(m.view.importPreview.textContent, fileText);
    m.view.findButton.dispatch('click'); m.view.findInput.value = 'note'; m.view.findInput.dispatch('input'); m.view.findNext.dispatch('click');
    assert.equal(m.view.findStatus.textContent, 'Match 1 of 2.'); await m.view.copyText(); assert.equal(m.metrics.clipboard, 1);
    assert.equal(m.view.copyStatus.textContent, 'Current text copied.');
    const before = m.snapshot(), receipt = m.view.copyReceipt, session = m.view.importSession, active = m.document.activeElement;
    const feedback = [m.view.status.textContent, m.view.findStatus.textContent, m.view.copyStatus.textContent, m.view.importInfo.textContent];
    m.controller.emit(); expectCount(m, 'note\nnote\n', 3);
    assert.deepEqual([m.view.status.textContent, m.view.findStatus.textContent, m.view.copyStatus.textContent, m.view.importInfo.textContent], feedback);
    assert.equal(m.view.copyReceipt, receipt); assert.equal(m.view.importSession, session); assert.equal(m.view.importPreview.textContent, fileText);
    assert.equal(m.document.activeElement, active); assert.deepEqual([m.view.textarea.selectionStart, m.view.textarea.selectionEnd], [0, 4]);
    assert.deepEqual(m.snapshot(), before); assert.equal(m.metrics.writes, 0);
});

test('line count: copy denial, missing Find result and failed import feedback survive the same render independently', async t => {
    const m = await loaded({ content: 'main\n' }); t.after(() => m.view.destroy());
    m.view.clipboard = { writeText: async () => { m.metrics.clipboard++; throw Error('synthetic clipboard denial'); } };
    await m.view.copyText(); assert.match(m.view.copyStatus.textContent, /Could not copy/);
    m.view.findButton.dispatch('click'); m.view.findInput.value = 'absent'; m.view.findInput.dispatch('input'); m.view.findNext.dispatch('click');
    assert.match(m.view.findStatus.textContent, /No matching/);
    m.view.chooseImport(); m.view.importFile.files = [{ name: 'synthetic.txt', size: 0, arrayBuffer: async () => { throw Error('synthetic file failure'); } }];
    await m.view.readImport(); assert.match(m.view.importInfo.textContent, /Could not read/); assert(m.view.importApply.disabled);
    const before = m.snapshot(), feedback = [m.view.status.textContent, m.view.copyStatus.textContent, m.view.findStatus.textContent, m.view.importInfo.textContent];
    m.view.render(); expectCount(m, 'main\n', 2);
    assert.deepEqual([m.view.status.textContent, m.view.copyStatus.textContent, m.view.findStatus.textContent, m.view.importInfo.textContent], feedback);
    assert.deepEqual(m.snapshot(), before); assert.equal(m.raw.content, 'main\n');
});

test('line count: preview is excluded until an explicit import applies it through the original save path', async t => {
    const m = await loaded({ content: 'current' }); t.after(() => m.view.destroy());
    m.view.chooseImport(); const text = '\nnew\n\n', bytes = new TextEncoder().encode(text);
    m.view.importFile.files = [{ name: 'synthetic.txt', size: bytes.length, arrayBuffer: async () => bytes.buffer }];
    await m.view.readImport(); m.view.render(); expectCount(m, 'current', 1); assert.equal(m.metrics.writes, 0);
    m.view.importApply.dispatch('click'); await settle(); expectCount(m, text, 4);
    assert.equal(m.raw.content, text); assert.equal(m.metrics.writes, 1); assert(m.view.importPanel.hidden);
});

test('line count: hidden-page events add no scan, timer or I/O; only existing renders update, and destroy stops them', async t => {
    const m = await loaded({ content: 'one' }); t.after(() => m.view.destroy()); m.controller.setComposing(true);
    let value = 'one\ntwo', reads = 0;
    Object.defineProperty(m.view.textarea, 'value', { configurable: true, get() { reads++; return value; }, set: next => { value = next; } });
    const before = m.snapshot();
    m.document.hidden = true; await m.document.listeners.get('visibilitychange')({ target: m.document });
    expectCount(m, 'one', 1); assert.deepEqual(m.snapshot(), before); assert.equal(reads, 0);
    m.controller.emit(); expectCount(m, 'one\ntwo', 2); assert.deepEqual(m.snapshot(), before);
    const afterRenderReads = reads;
    m.document.hidden = false; await m.document.listeners.get('visibilitychange')({ target: m.document });
    assert.equal(reads, afterRenderReads); assert.deepEqual(m.snapshot(), before); assert.equal(m.metrics.timerStarts, 0);
    m.view.destroy(); assert.equal(m.document.listeners.size, 0); assert.equal(m.globals.size, 0); assert.equal(m.timers.size, 0);
    const after = m.snapshot(); m.view.textarea.value = '\n\n\n'; m.controller.emit(); m.view.render();
    expectCount(m, 'one\ntwo', 2); assert.deepEqual(m.snapshot(), after);
});

for (const [language, label] of [['en', 'Lines: '], ['zh_CN', '行数：'], [undefined, 'Lines: '], ['missing', 'Lines: ']]) {
    test(`line count: ${language || 'absent i18n'} stays plain readable text next to the quota with no live region or new control`, async t => {
        const m = await loaded({ content: 'line\n', language }); t.after(() => m.view.destroy()); expectCount(m, 'line\n', 2, label);
        assert.equal(m.view.count.tagName, 'P'); assert(m.view.count.classList.contains('scratchpad-count'));
        const position = m.host.children.indexOf(m.view.textarea); assert.equal(m.host.children[position + 1], m.view.count);
        for (const attribute of ['aria-live', 'role', 'tabindex']) assert.equal(m.view.count.getAttribute(attribute), undefined);
        assert.equal(m.view.count.children.length, 0); assert.equal(m.view.count.listeners.size, 0); assert.equal(m.view.count.tabIndex, -1);
        assert.doesNotMatch(m.view.count.textContent, /\{count\}/); assert.equal(m.view.status.getAttribute('aria-live'), 'polite');
        assert.deepEqual([...m.document.listeners.keys()], ['visibilitychange']); assert.deepEqual([...m.globals.keys()], ['beforeunload']);
    });
}

test('line count: counting block is one constant-state pass without arrays, normalization, writes, geometry or extra lifecycle hooks', () => {
    const block = viewSource.slice(viewSource.indexOf('            const editorText ='), viewSource.indexOf('            const text = statusText(c);'));
    assert(block.includes('for (const character of editorText)')); assert.equal((block.match(/this\.textarea\.value/g) || []).length, 1);
    assert(!/\.split\(|Array\.from|\.match|\.trim\(|\.normalize\(|\.slice\(|\.substring\(|\.push\(|new (?:Array|Map|Set)|setTimeout|setInterval|addEventListener|\.save\(|\.read\(|\.write\(|fetch|clipboard|focus\(|selection|scroll|clientHeight|scrollHeight/.test(block));
    assert(!/this\.textarea\.value\s*=(?!=)/.test(block)); assert(!/this\.(?:status|copyStatus|findStatus|importInfo|importPreview|savedPreview)/.test(block));
    const css = fs.readFileSync(require.resolve('../local-scratchpad.css'), 'utf8');
    assert.match(css, /\.local-scratchpad-card\s*\{[^}]*overflow-wrap:\s*anywhere/);
    assert(!/\.scratchpad-count[^}]*white-space:\s*nowrap/.test(css));
});
