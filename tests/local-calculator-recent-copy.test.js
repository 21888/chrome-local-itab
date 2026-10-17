const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

// Real search initializer and existing bounded DOM model; no helper edits.
// Native button activation, focus/IME behavior, AT and layout remain unverified.
function mount({ locale = 'en', clipboard, translate } = {}) {
    const document = createDocument({ blurUnavailableFocus: true }), events = new Map(), observers = new Set();
    // Existing integration uses this local prepend stand-in for reload notices.
    document.body.prepend = (...nodes) => document.body.append(...nodes);
    const calls = [], opens = [], io = [], reloads = [], observerOptions = [], host = document.createElement('section');
    host.id = 'search-container'; document.body.append(host);
    const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const forbidden = () => { io.push('forbidden'); throw new Error('Unexpected I/O'); };
    const window = {
        i18n: { t: translate || (key => messages[key]?.message || key) },
        navigator: { permissions: { query: forbidden }, clipboard: clipboard === undefined ? { writeText(text) { calls.push(text); return Promise.resolve(); }, readText: forbidden } : clipboard },
        addEventListener(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
        removeEventListener(type, fn) { events.get(type)?.delete(fn); },
        location: { reload() { reloads.push('reload'); } }, confirm: () => false,
        open(...args) { opens.push(args); return { closed: false }; },
        getComputedStyle(node) { return { visibility: node.style.visibility || 'visible', display: node.style.display || 'block' }; },
        MutationObserver: class {
            constructor(callback) { this.callback = callback; this.records = []; }
            observe(root, options) { observerOptions.push({ root, options }); observers.add(this); }
            disconnect() { observers.delete(this); }
            takeRecords() { const records = this.records; this.records = []; return records; }
        }
    };
    const context = vm.createContext({ window, document, URL, console, encodeURIComponent, navigator: window.navigator,
        i18n: window.i18n, fetch: forbidden, XMLHttpRequest: forbidden,
        localStorage: { getItem: forbidden, setItem: forbidden }, storageManager: { set: forbidden, get: forbidden } });
    window.fetch = forbidden; window.storageManager = context.storageManager; document.execCommand = forbidden;
    for (const file of ['shared/search-template.js', 'shared/local-calculator.js', 'shared/local-content-lifecycle.js', 'newtab.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    const controls = () => {
        const input = host.querySelector('.search-input'), form = host.querySelector('form'), value = host.querySelector('.search-calculator-value');
        input.setSelectionRange = (start, end) => { input.selectionStart = start; input.selectionEnd = end; };
        value.select = () => { value.selectionStart = 0; value.selectionEnd = value.value.length; };
        return { input, form, value, recent: host.querySelector('.search-calculator-recent'), recentList: host.querySelector('.search-calculator-recent-list'), clearRecent: host.querySelector('.search-calculator-recent-clear'), recentEmpty: host.querySelector('.search-calculator-recent-empty'), recentSummary: host.querySelector('.search-calculator-recent-summary'), rows() { return host.querySelectorAll('.search-calculator-recent-item'); }, expand() { assert(this.recent, 'a native recent-calculations disclosure is required'); this.recent.open = true; }, use(index = 0) { return this.rows()[index].querySelector('.search-calculator-recent-use'); }, useResult: host.querySelector('.search-calculator-use-result'), row: host.querySelector('.search-calculator-result'), output: host.querySelector('.search-calculator-output'), copy: host.querySelector('.search-calculator-copy'),
            feedback: host.querySelector('.search-calculator-copy-status'), status: host.querySelector('.search-calculator-status'), searchStatus: host.querySelector('.search-open-status'),
            edit(text) { input.value = text; input.dispatch('input'); },
            submit() { const event = form.dispatch('submit'); assert(event.prevented); },
            calculate(text = '=42/7') { this.edit(text); this.submit(); },
            focusResult() { value.focus(); value.dispatch('focus'); } };
    };
    context.initializeSearchComponent({});
    return { ...controls(), window, document, context, host, calls, opens, io, reloads, messages, events, observers, observerOptions,
        remount() { context.initializeSearchComponent({}); return controls(); },
        emit(type) { for (const fn of [...(events.get(type) || [])]) fn(); },
        mutations(records, queued = false) { for (const observer of [...observers]) { if (queued) observer.records.push(...records); else observer.callback(records); } } };
}
function clean(h) {
    // Recent past-action receipts keep guards until an edit/fold/departure/remount.
    h.window.localCalculatorView.clearResult?.();
    assert.equal(h.observers.size, 0, 'no pending observer remains');
    for (const type of ['blur', 'pagehide']) assert.equal(h.events.get(type)?.size || 0, 0, `no ${type} copy listener remains`);
    assert.equal(h.document.listeners.has('visibilitychange'), false, 'no visibility copy listener remains');
    assert.deepEqual(h.io, [], 'no storage, network, legacy or clipboard-read I/O');
}

function recordTexts(h) { return h.rows().map(row => [row.querySelector('.search-calculator-recent-expression').textContent, row.querySelector('.search-calculator-recent-value').textContent]); }

function recentCopy(h, index = 0) { return h.rows()[index].querySelector('.search-calculator-recent-copy'); }
function recentStatus(h, index = 0) { return h.rows()[index].querySelector('.search-calculator-recent-copy-status'); }
function source(h, index = 0) { const row = h.rows()[index]; return { row, expression: row.querySelector('.search-calculator-recent-expression'), value: row.querySelector('.search-calculator-recent-value'), copy: recentCopy(h, index), status: recentStatus(h, index) }; }
function assertNoFeedback(status) { assert.equal(status.textContent, ''); assert.equal(status.hidden, true); }
function assertLocked(h, locked = true) { assert.equal(h.copy.getAttribute('aria-disabled'), String(locked)); for (const row of h.rows()) assert.equal(row.querySelector('.search-calculator-recent-copy').getAttribute('aria-disabled'), String(locked)); }

test('recent copy has its own native button and live status in EN, Chinese and missing/empty fallbacks', async () => {
    for (const mode of ['en', 'zh_CN', 'missing', 'empty']) {
        const fallback = ['missing', 'empty'].includes(mode);
        const h = mount({ locale: fallback ? 'en' : mode, translate: fallback ? key => mode === 'missing' ? key : '' : undefined });
        h.calculate(); h.expand(); const { row, copy, status } = source(h);
        assert.equal(copy.tagName, 'BUTTON'); assert.equal(copy.type, 'button'); assert.equal(copy.tabIndex, 0);
        assert.equal(copy.textContent, h.messages.calculatorRecentCopyAction.message);
        assert.equal(copy.parentElement, row); assert.equal(row.querySelectorAll('button').length, 3);
        assert.equal(status.getAttribute('role'), 'status'); assert.equal(status.getAttribute('aria-live'), 'polite'); assert.equal(status.getAttribute('aria-atomic'), 'true');
        assertNoFeedback(status); assert.equal(h.feedback.hidden, true); assert.notEqual(status, h.feedback);
        copy.focus(); copy.dispatch('click'); assert.equal(status.textContent, h.messages.calculatorRecentCopying.message);
        assert.equal(copy.disabled, undefined, 'aria-disabled preserves focused native button'); assertLocked(h);
        await settle(); assert.equal(status.textContent, h.messages.calculatorRecentCopySuccess.message); assert.equal(h.document.activeElement, copy); assertLocked(h, false);
        h.window.navigator.clipboard.writeText = () => Promise.reject(new Error('synthetic denial'));
        copy.dispatch('click'); await settle(); assert.equal(status.textContent, h.messages.calculatorRecentCopyFailure.message); assert(status.classList.contains('is-error'));
        assert.equal(h.feedback.hidden, true); assert.equal(h.observers.size, 1, 'retry replaces rather than leaks the receipt guard'); clean(h);
    }
});

test('exact raw expression, one LF and full saved value are copied synchronously with no focus/caret or record change', async () => {
    for (const locale of ['en', 'zh_CN']) {
        const h = mount({ locale }); let evaluations = 0; const calculate = h.window.LocalItabCalculator.calculate;
        h.window.LocalItabCalculator = { calculate(text) { evaluations++; return calculate(text); } };
        for (const [expression, expected] of [['  = 0  ', '0'], ['\t=-0\t', '0'], ['=-12', '-12'], ['=1/8', '0.125'], ['=0.1+0.2', '0.30000000000000004'], ['\u2003 = 1E+21\u00a0', '1e+21'], ['= 1.0e-07 ', '1e-7'], ['=(12 + 3) / 2', '7.5']]) {
            h.calculate(expression); h.expand(); h.input.focus(); h.input.setSelectionRange(1, 2);
            const rows = h.rows(), records = recordTexts(h), evaluationCount = evaluations;
            const original = source(h), calculation = h.status.textContent, search = h.searchStatus.textContent, result = h.value.value;
            original.copy.dispatch('click'); assert.equal(h.calls.at(-1), expression + '\n' + expected, 'writeText is called within explicit activation');
            assert.equal(original.status.textContent, h.messages.calculatorRecentCopying.message);
            await settle(); assert.equal(h.input.value, expression); assert.equal(h.value.value, result); assert.equal(h.status.textContent, calculation); assert.equal(h.searchStatus.textContent, search);
            assert.equal(h.input.selectionStart, 1); assert.equal(h.input.selectionEnd, 2); assert.equal(h.document.activeElement, h.input);
            assert.deepEqual(h.rows(), rows); assert.deepEqual(recordTexts(h), records); assert.equal(evaluations, evaluationCount); assert.deepEqual(h.opens, []); assert.deepEqual(h.io, []);
        }
        clean(h);
    }
});

test('literal Unicode source and a newer unrelated draft never become markup, metadata or the copied record', async () => {
    const h = mount(); let evaluations = 0;
    h.window.LocalItabCalculator = { calculate() { evaluations++; return { value: '0.30000000000000004' }; } };
    const original = '\u2003= <b>文字 & "quoted"</b> 👩🏽‍💻\t';
    h.calculate(original); h.expand(); const saved = source(h);
    assert.equal(saved.expression.textContent, original); assert.deepEqual(saved.expression.children, []);
    h.edit('new draft = 999, not the saved expression'); h.input.focus(); h.input.setSelectionRange(4, 8);
    const count = evaluations, records = recordTexts(h), calcStatus = h.status.textContent;
    saved.copy.dispatch('click'); await settle(); assert.deepEqual(h.calls, [original + '\n0.30000000000000004']);
    assert.equal(evaluations, count); assert.equal(h.input.value, 'new draft = 999, not the saved expression'); assert.equal(h.status.textContent, calcStatus);
    assert.equal(h.input.selectionStart, 4); assert.equal(h.input.selectionEnd, 8); assert.equal(h.document.activeElement, h.input); assert.deepEqual(recordTexts(h), records);
    assert.equal(saved.expression.textContent, original); assert.equal(saved.value.textContent, '0.30000000000000004'); clean(h);
});

test('same-valued distinct records keep their original expressions and independent historical/current receipts', async () => {
    const h = mount(); h.calculate(' = 2 + 2 '); h.calculate('=4'); h.expand(); const newest = source(h), older = source(h, 1);
    h.copy.dispatch('click'); await settle(); const currentReceipt = h.feedback.textContent;
    older.copy.dispatch('click'); await settle(); newest.copy.dispatch('click'); await settle();
    assert.deepEqual(h.calls, ['4', ' = 2 + 2 \n4', '=4\n4']);
    assert.equal(h.feedback.textContent, currentReceipt); assert.equal(older.status.textContent, h.messages.calculatorRecentCopySuccess.message); assert.equal(newest.status.textContent, h.messages.calculatorRecentCopySuccess.message);
    assert.equal(h.observers.size, 2); assert.deepEqual(recordTexts(h), [['=4', '4'], [' = 2 + 2 ', '4']]);
    h.window.navigator.clipboard = { writeText() { return Promise.resolve(); }, readText() { throw new Error('must never inspect current clipboard'); } };
    assert.equal(older.status.textContent, 'Calculation copied.', 'past-action receipt does not assert current clipboard contents'); clean(h);
});

test('missing, throwing and rejecting clipboard APIs preserve original text and focus, without fallback or automatic retry', async () => {
    for (const failure of ['missing', 'throw', 'reject', 'getter']) {
        let attempts = 0;
        const clipboard = failure === 'missing' ? null : failure === 'getter' ? { get writeText() { attempts++; throw new Error('synthetic private getter'); } } : { writeText() { attempts++; if (failure === 'throw') throw new Error('synthetic private throw'); return Promise.reject(new Error('synthetic private rejection')); } };
        const h = mount({ clipboard }); h.calculate(' = 1.0E-7 '); h.expand(); const saved = source(h), records = recordTexts(h);
        saved.copy.focus(); saved.copy.dispatch('click'); await settle();
        assert.equal(saved.status.textContent, h.messages.calculatorRecentCopyFailure.message); assert(saved.status.classList.contains('is-error'));
        assert.equal(h.document.activeElement, saved.copy); assert.equal(saved.expression.textContent, ' = 1.0E-7 '); assert.equal(saved.value.textContent, '1e-7');
        for (const node of [saved.expression, saved.value]) for (const ctrlKey of [true, false]) assert.equal(node.dispatch('keydown', { key: 'c', ctrlKey, metaKey: !ctrlKey }).prevented, false);
        assert.deepEqual(recordTexts(h), records); await settle(); assert.equal(attempts, failure === 'missing' ? 0 : 1);
        h.window.navigator.clipboard = { writeText(text) { attempts++; assert.equal(text, ' = 1.0E-7 \n1e-7'); return Promise.resolve(); } };
        saved.copy.dispatch('click'); await settle(); assert.equal(saved.status.textContent, h.messages.calculatorRecentCopySuccess.message); assert.equal(saved.status.classList.contains('is-error'), false); assertLocked(h, false); clean(h);
    }
});

test('all current-to-recent, recent-to-current and recent-to-other-row writes share one settlement lock', async () => {
    for (const from of ['current', 'newest', 'older']) for (const rejected of [false, true]) {
        const waiting = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return waiting.promise; } } });
        h.calculate('=3'); h.calculate('=4'); h.expand();
        const controls = [h.copy, recentCopy(h), recentCopy(h, 1)], first = controls[['current', 'newest', 'older'].indexOf(from)];
        first.focus(); first.dispatch('click'); assertLocked(h); assert.equal(calls.length, 1);
        for (const control of controls) { control.dispatch('click'); control.dispatch('click', { detail: 2 }); }
        assert.equal(calls.length, 1); assert.equal(h.document.activeElement, first);
        h.edit('new draft'); h.calculate('=9'); h.expand(); assertLocked(h);
        for (const control of [h.copy, ...h.rows().map(row => row.querySelector('.search-calculator-recent-copy')), ...controls]) control.dispatch('click');
        assert.equal(calls.length, 1); assert.equal(h.observers.size, 0, 'edit removes stale guard, but retains the write lock');
        if (rejected) waiting.reject(new Error('late rejection')); else waiting.resolve(); await settle(); assertLocked(h, false);
        assert.equal(h.feedback.hidden, true); for (const row of h.rows()) assertNoFeedback(row.querySelector('.search-calculator-recent-copy-status'));
        h.window.navigator.clipboard.writeText = text => { calls.push(text); return Promise.resolve(); };
        recentCopy(h).dispatch('click'); await settle(); h.copy.dispatch('click'); await settle(); assert.deepEqual(calls.slice(-2), ['=9\n9', '9']); clean(h);
    }
});

test('clear, fold, hide, redraw, eviction and repeated remount preserve an unresolved historical write lock', async () => {
    const interrupts = [
        h => h.clearRecent.dispatch('click'),
        h => { h.recent.open = false; h.recent.dispatch('toggle'); h.recent.open = true; },
        h => { h.host.hidden = true; h.mutations([{ type: 'attributes', target: h.host, attributeName: 'hidden' }]); h.host.hidden = false; },
        h => h.calculate('=8'),
        h => { for (let n = 0; n < 6; n++) h.calculate(`=${n}`); },
        h => { let current; for (let i = 0; i < 3; i++) current = h.remount(); current.calculate('=9'); current.expand(); return current; }
    ];
    for (const [index, interrupt] of interrupts.entries()) {
        const waiting = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return waiting.promise; } } });
        h.calculate('=7'); h.expand(); const saved = source(h); saved.copy.dispatch('click');
        const replacement = interrupt(h), current = replacement?.expand ? replacement : h;
        current.expand(); if (!current.rows().length) current.calculate('=8');
        assertLocked(current); saved.copy.dispatch('click'); current.copy.dispatch('click'); recentCopy(current).dispatch('click'); assert.deepEqual(calls, ['=7\n7']);
        current.input.focus(); const focus = h.document.activeElement, draft = current.input.value, records = recordTexts(current);
        if (index % 2) waiting.reject(new Error('late denial')); else waiting.resolve(); await settle();
        assertNoFeedback(saved.status); assertLocked(current, false); assert.equal(h.document.activeElement, focus); assert.equal(current.input.value, draft); assert.deepEqual(recordTexts(current), records);
        for (const row of current.rows()) assertNoFeedback(row.querySelector('.search-calculator-recent-copy-status')); clean(h);
    }
});

test('stale whole rows and controls cannot regain authority after clear, redraw or five-entry eviction', () => {
    for (const mode of ['clear', 'redraw', 'eviction']) {
        const h = mount(); h.calculate('=7'); h.expand(); const saved = source(h);
        if (mode === 'clear') h.clearRecent.dispatch('click');
        else if (mode === 'redraw') h.calculate('=8');
        else for (let n = 0; n < 5; n++) h.calculate(`=${n}`);
        h.recentList.append(saved.row); saved.copy.dispatch('click');
        saved.copy.remove(); (h.rows().find(row => row !== saved.row) || h.recentList).append(saved.copy); saved.copy.dispatch('click');
        assert.deepEqual(h.calls, []); assertNoFeedback(saved.status); clean(h);
    }
});

test('origin row, exact rendered source nodes, literal raw text and owner document are required before writing', () => {
    const changes = [
        (h, s) => { s.expression.textContent += ' '; }, (h, s) => { s.value.textContent = '07'; },
        (h, s) => { const replacement = h.document.createElement('span'); replacement.textContent = s.expression.textContent; s.expression.replaceWith(replacement); },
        (h, s) => { const replacement = h.document.createElement('span'); replacement.textContent = s.value.textContent; s.value.replaceWith(replacement); },
        (h, s) => { s.copy.remove(); h.rows()[1].append(s.copy); }, (h, s) => { s.row.remove(); h.host.append(s.row); },
        (h, s) => { s.status.remove(); }, (h, s) => { s.expression.ownerDocument = {}; },
        h => { h.input.remove(); h.host.append(h.input); }, h => { h.window.localCalculatorView = {}; },
        h => { h.host.id = 'different-owner'; }
    ];
    for (const [index, change] of changes.entries()) {
        const h = mount(); h.calculate('=3'); h.calculate('=7'); h.expand(); const saved = source(h); change(h, saved);
        saved.copy.dispatch('click'); assert.deepEqual(h.calls, [], `origin scenario ${index}`); assertNoFeedback(saved.status); clean(h);
    }
});

test('removed or disabled Use/Edit siblings do not revoke copy before or during its write', async () => {
    for (const selector of ['.search-calculator-recent-use', '.search-calculator-recent-edit']) for (const during of [false, true]) {
        const waiting = deferred(), h = mount({ clipboard: { writeText(text) { h.calls.push(text); return waiting.promise; } } });
        h.calculate('=7'); h.expand(); const saved = source(h), sibling = saved.row.querySelector(selector);
        if (during) saved.copy.dispatch('click'); sibling.disabled = true; sibling.remove();
        h.mutations([{ type: 'attributes', target: sibling, attributeName: 'disabled' }, { type: 'childList', target: saved.row, removedNodes: [sibling] }], true);
        if (!during) saved.copy.dispatch('click'); waiting.resolve(); await settle();
        assert.deepEqual(h.calls, ['=7\n7']); assert.equal(saved.status.textContent, h.messages.calculatorRecentCopySuccess.message); clean(h);
    }
});

test('queued or delivered source/ancestor ABA mutations fail closed without releasing the issued write', async () => {
    const changes = [
        (h, s) => ({ type: 'attributes', target: h.host, attributeName: 'hidden' }),
        (h, s) => ({ type: 'attributes', target: h.recent, attributeName: 'open' }),
        (h, s) => ({ type: 'attributes', target: s.row, attributeName: 'class' }),
        (h, s) => ({ type: 'attributes', target: s.copy, attributeName: 'disabled' }),
        (h, s) => ({ type: 'attributes', target: h.input, attributeName: 'readonly' }),
        (h, s) => { s.expression.textContent = 'changed'; s.expression.textContent = '=7'; return { type: 'childList', target: s.expression, removedNodes: [] }; },
        (h, s) => { s.value.textContent = '8'; s.value.textContent = '7'; return { type: 'characterData', target: s.value }; },
        (h, s) => { s.row.remove(); h.recentList.append(s.row); return { type: 'childList', target: h.recentList, removedNodes: [s.row] }; },
        (h, s) => { s.expression.remove(); s.row.append(s.expression); return { type: 'childList', target: s.row, removedNodes: [s.expression] }; },
        (h, s) => { s.value.remove(); s.row.append(s.value); return { type: 'childList', target: s.row, removedNodes: [s.value] }; },
        (h, s) => { s.copy.remove(); s.row.append(s.copy); return { type: 'childList', target: s.row, removedNodes: [s.copy] }; },
        (h, s) => { h.input.remove(); h.form.append(h.input); return { type: 'childList', target: h.form, removedNodes: [h.input] }; },
        (h, s) => { h.host.remove(); h.document.body.append(h.host); return { type: 'childList', target: h.document.body, removedNodes: [h.host] }; }
    ];
    for (const queued of [false, true]) for (const [index, mutate] of changes.entries()) {
        const waiting = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return waiting.promise; } } });
        h.calculate('=7'); h.expand(); const saved = source(h); saved.copy.dispatch('click');
        const observation = h.observerOptions.at(-1); assert.equal(observation.root, h.document.documentElement); assert.equal(observation.options.characterData, true);
        h.mutations([mutate(h, saved)], queued); h.copy.dispatch('click'); saved.copy.dispatch('click'); assert.deepEqual(calls, ['=7\n7']); assertLocked(h);
        if (index % 2) waiting.reject(new Error('late denial')); else waiting.resolve(); await settle();
        assertNoFeedback(saved.status); assertLocked(h, false); assert.equal(h.observers.size, 0); clean(h);
    }
});

test('edit/submission/owner ABA and direct source changes suppress late historical success and failure', async () => {
    const interrupts = [
        (h, s) => { h.edit('other'); h.edit('draft'); }, h => h.edit('draft'),
        h => { h.host.querySelector('.search-custom-input').dispatch('input'); },
        h => { h.submit(); }, h => { h.input.value = '=7'; h.submit(); h.input.value = 'draft'; },
        (h, s) => { s.expression.textContent = '=8'; }, (h, s) => { s.value.textContent = '8'; },
        (h, s) => { s.expression.remove(); }, (h, s) => { s.value.remove(); },
        h => { h.input.value = 'different direct input'; }, h => { h.window.localCalculatorView = {}; },
        h => { const oldOwner = h.window.localCalculatorView; h.remount(); h.window.localCalculatorView = oldOwner; },
        h => { h.window.LocalItabContentLifecycle.allowDeparture(); },
        h => { h.input.dispatch('compositionstart'); h.input.dispatch('compositionend'); }
    ];
    for (const rejected of [false, true]) for (const [index, interrupt] of interrupts.entries()) {
        const waiting = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return waiting.promise; } } });
        h.calculate('=7'); h.expand(); h.edit('draft'); const saved = source(h); saved.copy.dispatch('click'); interrupt(h, saved);
        const draft = h.input.value, focus = h.document.activeElement, status = h.searchStatus.textContent;
        saved.copy.dispatch('click'); assert.deepEqual(calls, ['=7\n7']);
        if (rejected) waiting.reject(new Error('late denial')); else waiting.resolve(); await settle();
        assertNoFeedback(saved.status); assert.equal(h.input.value, draft, `interrupt ${index}`); assert.equal(h.document.activeElement, focus); assert.equal(h.searchStatus.textContent, status); assert.equal(h.observers.size, 0); clean(h);
    }
});

test('hidden, folded, inert, detached, disabled, composing and departing contexts cannot begin a recent copy', () => {
    const unavailable = [
        h => { h.host.hidden = true; }, h => { h.host.inert = true; }, h => h.host.setAttribute('aria-hidden', 'true'),
        h => { h.host.style.display = 'none'; }, h => { h.host.style.visibility = 'hidden'; }, h => { h.host.style.visibility = 'collapse'; },
        h => h.host.remove(), h => { h.document.hidden = true; }, h => { h.document.visibilityState = 'hidden'; },
        h => h.window.LocalItabContentLifecycle.allowDeparture(), h => { h.recent.open = false; }, h => { h.recent.hidden = true; },
        h => { h.recentList.hidden = true; }, h => { recentCopy(h).disabled = true; }, h => { recentCopy(h).inert = true; },
        h => recentCopy(h).setAttribute('aria-hidden', 'true'), h => { recentCopy(h).style.display = 'none'; }, h => { recentCopy(h).style.visibility = 'hidden'; },
        h => recentCopy(h).remove(), h => { h.rows()[0].hidden = true; }, h => { source(h).expression.hidden = true; }, h => { source(h).value.hidden = true; },
        h => { h.input.hidden = true; }, h => { h.input.disabled = true; }, h => { h.input.readOnly = true; }, h => h.input.remove(),
        h => h.input.dispatch('compositionstart'), h => h.host.querySelector('.search-custom-input').dispatch('compositionstart'),
        h => { const details = h.document.createElement('details'); h.host.remove(); details.append(h.host); h.document.body.append(details); }
    ];
    for (const [index, hide] of unavailable.entries()) {
        const h = mount(); h.calculate('=7'); h.expand(); const saved = source(h); hide(h); const focus = h.document.activeElement;
        saved.copy.dispatch('click'); assert.deepEqual(h.calls, [], `unavailable ${index}`); assertNoFeedback(saved.status); assert.equal(h.document.activeElement, focus); clean(h);
    }
});

test('prevented events, repeat, IME, key-code 229, modifiers and double-click tails cannot issue a write', async () => {
    const h = mount(); h.calculate('=7'); h.expand(); const saved = source(h); saved.copy.focus();
    for (const key of ['Enter', ' ']) {
        assert.equal(saved.copy.dispatch('keydown', { key }).prevented, false);
        for (const flags of [{ defaultPrevented: true }, { repeat: true }, { isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }]) {
            assert(saved.copy.dispatch('keydown', { key, ...flags }).prevented); saved.copy.dispatch('click', flags); assert.deepEqual(h.calls, []);
        }
    }
    saved.copy.dispatch('click', { detail: 2 }); assert.deepEqual(h.calls, []);
    for (const input of [h.input, h.host.querySelector('.search-custom-input')]) {
        input.dispatch('compositionstart'); saved.copy.dispatch('click'); assert(saved.copy.dispatch('keydown', { key: ' ' }).prevented); input.dispatch('compositionend'); assert.deepEqual(h.calls, []);
    }
    saved.copy.dispatch('click', { detail: 0 }); assert.deepEqual(h.calls, ['=7\n7']); await settle(); assert.equal(h.document.activeElement, saved.copy); clean(h);
});

test('settled historical receipts clear on edits, redraw, clearing, fold, hide and departure without touching current receipts', async () => {
    const clears = [
        h => h.edit(h.input.value), h => h.host.querySelector('.search-custom-input').dispatch('input'), h => h.submit(),
        h => h.clearRecent.dispatch('click'), h => { h.recent.open = false; h.recent.dispatch('toggle'); },
        h => { h.host.hidden = true; h.mutations([{ type: 'attributes', target: h.host, attributeName: 'hidden' }]); },
        h => h.emit('blur'), h => h.emit('pagehide'), h => h.document.listeners.get('visibilitychange')(),
        h => h.remount()
    ];
    for (const clear of clears) {
        const h = mount(); h.calculate('=7'); h.expand(); const saved = source(h); saved.copy.dispatch('click'); await settle();
        assert.equal(saved.status.textContent, h.messages.calculatorRecentCopySuccess.message); clear(h); assertNoFeedback(saved.status); assert.equal(h.observers.size, 0); clean(h);
    }
    const h = mount(); h.calculate('=7'); h.expand(); h.copy.dispatch('click'); await settle(); const receipt = h.feedback.textContent;
    recentCopy(h).dispatch('click'); await settle(); const saved = source(h); h.recent.open = false; h.recent.dispatch('toggle');
    assertNoFeedback(saved.status); assert.equal(h.feedback.textContent, receipt); assert.equal(h.feedback.hidden, false); clean(h);
});

test('search/recovery feedback and reload guard remain separate from recent copying', async () => {
    const h = mount(); h.calculate('=7'); h.expand(); h.edit('ordinary search'); h.window.open = () => null; h.submit();
    const searchStatus = h.searchStatus.textContent, calculatorStatus = h.status.textContent;
    assert(searchStatus); h.input.focus(); const focus = h.document.activeElement, records = recordTexts(h);
    recentCopy(h).dispatch('click'); await settle(); assert.equal(h.searchStatus.textContent, searchStatus); assert.equal(h.status.textContent, calculatorStatus); assert.equal(h.document.activeElement, focus);
    assert.equal(h.window.LocalItabContentLifecycle.hasUncommittedWork(), true);
    h.edit(''); assert.equal(h.window.LocalItabContentLifecycle.hasUncommittedWork(), false); recentCopy(h).dispatch('click'); await settle();
    assert.equal(h.window.LocalItabContentLifecycle.hasUncommittedWork(), false); assert.deepEqual(recordTexts(h), records); assert.deepEqual(h.io, []); clean(h);
});

test('synchronous clipboard getter/write reentry cannot publish an old receipt or admit overlapping copies', async () => {
    for (const mode of ['getter', 'write']) {
        const waiting = deferred(), calls = []; let h, replacement;
        const reenter = () => { replacement = h.remount(); replacement.calculate('=8'); replacement.expand(); recentCopy(replacement).dispatch('click'); replacement.copy.dispatch('click'); };
        const clipboard = mode === 'getter' ? { get writeText() { reenter(); return text => { calls.push(text); return waiting.promise; }; } } : { writeText(text) { calls.push(text); reenter(); return waiting.promise; } };
        h = mount({ clipboard }); h.calculate('=7'); h.expand(); const saved = source(h); saved.copy.dispatch('click');
        assert.deepEqual(calls, mode === 'getter' ? [] : ['=7\n7']);
        if (mode === 'write') { assertLocked(replacement); waiting.resolve(); await settle(); }
        assertLocked(replacement, false); assertNoFeedback(saved.status); assertNoFeedback(recentStatus(replacement)); assert.equal(replacement.feedback.hidden, true); clean(h);
    }
});

test('new row copy feedback uses existing wrap/focus styles and a bounded full-width status', () => {
    const css = fs.readFileSync('newtab.css', 'utf8');
    assert.match(css, /\.search-calculator-recent-item\s*\{[^}]*flex-wrap:\s*wrap/);
    assert.match(css, /\.search-calculator-recent button\s*\{[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/);
    assert.match(css, /\.search-calculator-recent button:focus-visible\s*\{[^}]*outline:/);
    assert.match(css, /\.search-calculator-recent-copy-status\s*\{[^}]*flex:\s*1\s+0\s+100%[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere/);
    assert.match(css, /\.search-calculator-recent-copy-status\.is-error\s*\{[^}]*var\(--template-error,/);
    assert.match(css, /\.search-calculator-recent \[hidden\]\s*\{\s*display:\s*none/);
});

test('a retired receipt callback cannot clear the same row’s newer explicit retry feedback', async () => {
    const h = mount(); h.calculate('=7'); h.expand(); const saved = source(h); saved.copy.dispatch('click'); await settle();
    const oldObserver = [...h.observers][0]; saved.copy.dispatch('click'); await settle();
    assert.equal(h.observers.size, 1); assert.equal(saved.status.textContent, h.messages.calculatorRecentCopySuccess.message);
    oldObserver.callback([{ type: 'attributes', target: h.recent, attributeName: 'open' }]);
    assert.equal(saved.status.textContent, h.messages.calculatorRecentCopySuccess.message); assert.equal(saved.status.hidden, false); assert.equal(h.observers.size, 1); clean(h);
});

test('historical failure and unrelated row/current/search mutations preserve separate feedback', async () => {
    const h = mount(); h.calculate('=3'); h.calculate('=7'); h.expand(); h.copy.dispatch('click'); await settle();
    const currentReceipt = h.feedback.textContent, waiting = deferred(), saved = source(h, 1), unrelated = source(h);
    h.window.navigator.clipboard.writeText = () => waiting.promise; saved.copy.dispatch('click');
    h.searchStatus.textContent = 'Separate synthetic search feedback';
    h.mutations([{ type: 'childList', target: h.searchStatus, removedNodes: [] }, { type: 'childList', target: h.feedback, removedNodes: [] }, { type: 'attributes', target: unrelated.expression, attributeName: 'style' }], true);
    waiting.reject(new Error('synthetic failure')); await settle();
    assert.equal(saved.status.textContent, h.messages.calculatorRecentCopyFailure.message); assert.equal(h.feedback.textContent, currentReceipt);
    assert.equal(h.searchStatus.textContent, 'Separate synthetic search feedback'); assertNoFeedback(unrelated.status); clean(h);
});
