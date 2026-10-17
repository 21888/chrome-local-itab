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

function remove(h, index = 0) { return h.rows()[index].querySelector('.search-calculator-recent-remove'); }
function removalSource(h, index = 0) { return { ...source(h, index), remove: remove(h, index) }; }
function unchangedCalculator(h) { return { draft: h.input.value, value: h.value.value, resultHidden: h.row.hidden,
    calculation: h.status.textContent, search: h.searchStatus.textContent, receipt: h.feedback.textContent,
    receiptHidden: h.feedback.hidden, receiptError: h.feedback.classList.contains('is-error'),
    start: h.input.selectionStart, end: h.input.selectionEnd }; }

test('remove is a fourth native row button in English, Chinese and missing/empty fallbacks', () => {
    for (const mode of ['en', 'zh_CN', 'missing', 'empty']) {
        const fallback = ['missing', 'empty'].includes(mode);
        const h = mount({ locale: fallback ? 'en' : mode, translate: fallback ? key => mode === 'missing' ? key : '' : undefined });
        h.calculate(); h.expand(); const saved = removalSource(h);
        assert.equal(saved.remove.tagName, 'BUTTON'); assert.equal(saved.remove.type, 'button'); assert.equal(saved.remove.tabIndex, 0);
        assert.equal(saved.remove.textContent, h.messages.calculatorRecentRemove.message); assert.equal(saved.remove.parentElement, saved.row);
        assert.equal(saved.row.querySelectorAll('button').length, 4);
        for (const [selector, label] of [['use', 'calculatorUseResult'], ['edit', 'calculatorEditExpression'], ['copy', 'calculatorRecentCopyAction']]) {
            const control = saved.row.querySelector(`.search-calculator-recent-${selector}`);
            assert.equal(control.tagName, 'BUTTON'); assert.equal(control.type, 'button'); assert.equal(control.textContent, h.messages[label].message);
        }
        saved.remove.dispatch('click'); assert.deepEqual(h.rows(), []); clean(h);
    }
});

test('each position removes only its exact record while preserving duplicate expressions, values and surviving order', () => {
    const entries = [' = 7 ', '=7', '=3+4', '=7', '=14/2'];
    for (let index = 0; index < 5; index++) {
        const h = mount(); for (const entry of entries) h.calculate(entry); h.expand();
        const records = recordTexts(h), oldControls = h.rows().map((_, i) => remove(h, i));
        oldControls[index].dispatch('click'); records.splice(index, 1); assert.deepEqual(recordTexts(h), records);
        assert.equal(h.clearRecent.disabled, false); assert.equal(h.recentEmpty.hidden, true); assert.equal(h.recent.open, true);
        for (const old of oldControls) old.dispatch('click'); assert.deepEqual(recordTexts(h), records, 'redrawn controls cannot borrow retained records');
        h.calculate('=8'); assert.deepEqual(recordTexts(h), [['=8', '8'], ...records]);
        h.calculate('=9'); assert.deepEqual(recordTexts(h), [['=9', '9'], ['=8', '8'], ...records].slice(0, 5)); clean(h);
    }
});

test('removing a calculation changes no draft, caret, result, status, evaluator or external API state', () => {
    for (const draft of [null, 'new unrelated draft', '=1/0', '']) {
        const h = mount(); let evaluations = 0; const calculate = h.window.LocalItabCalculator.calculate;
        h.window.LocalItabCalculator = { calculate(text) { evaluations++; return calculate(text); } };
        h.calculate(' = 1E-7 '); h.calculate('=0.1+0.2'); h.expand();
        if (draft !== null) { h.edit(draft); if (draft === '=1/0') h.submit(); }
        h.input.focus(); h.input.setSelectionRange(1, 3); const before = unchangedCalculator(h), count = evaluations;
        const forbidden = () => { h.io.push('unexpected side effect'); throw new Error('unexpected side effect'); };
        h.context.Date = forbidden; h.context.Date.now = forbidden; h.context.setTimeout = forbidden; h.context.setInterval = forbidden;
        Object.defineProperty(h.window.navigator, 'clipboard', { get: forbidden });
        remove(h, 1).dispatch('click'); assert.deepEqual(unchangedCalculator(h), before); assert.equal(evaluations, count);
        assert.equal(h.document.activeElement, h.input); assert.deepEqual(recordTexts(h), [['=0.1+0.2', '0.30000000000000004']]);
        assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
    }
});

test('focused removal chooses the same-position next button, then previous, then visible summary when empty', () => {
    for (const [count, index] of [[5, 0], [5, 2], [5, 4], [1, 0]]) {
        const h = mount(); for (let n = 0; n < count; n++) h.calculate(`=${n}`); h.expand();
        const control = remove(h, index), draft = h.input.value; control.focus(); assert.equal(h.document.activeElement, control);
        control.dispatch('click'); const target = count === 1 ? h.recentSummary : remove(h, Math.min(index, count - 2));
        assert.equal(h.document.activeElement, target); assert.equal(h.recent.open, true); assert.equal(h.input.value, draft);
        assert.equal(h.recentEmpty.hidden, count !== 1); assert.equal(h.clearRecent.disabled, count === 1);
        if (count === 1) assert.equal(h.recentEmpty.textContent, h.messages.calculatorRecentEmpty.message); clean(h);
    }
});

test('input, outside, current-result and body focus are not stolen by an unfocused remove button', () => {
    for (const destination of ['input', 'outside', 'result', 'body']) {
        const h = mount(); h.calculate('=3'); h.calculate('=4'); h.expand();
        const outside = h.document.createElement('button'); h.document.body.append(outside);
        const target = { input: h.input, outside, result: h.copy, body: h.document.body }[destination]; target.focus();
        remove(h).dispatch('click'); assert.equal(h.document.activeElement, target); assert.deepEqual(recordTexts(h), [['=3', '3']]); clean(h);
    }
});

test('native Enter and Space stay available while prevented, modified, repeated, composing and double-click tails cannot remove', () => {
    for (const key of ['Enter', ' ']) {
        const h = mount(); h.calculate('=7'); h.expand(); const control = remove(h); control.focus();
        assert.equal(control.dispatch('keydown', { key }).prevented, false);
        for (const flags of [{ defaultPrevented: true }, { repeat: true }, { isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }]) {
            assert(control.dispatch('keydown', { key, ...flags }).prevented); control.dispatch('click', flags); assert.equal(h.rows().length, 1);
        }
        control.dispatch('click', { detail: 2 }); assert.equal(h.rows().length, 1);
        for (const input of [h.input, h.host.querySelector('.search-custom-input')]) {
            input.dispatch('compositionstart'); assert(control.dispatch('keydown', { key }).prevented); control.dispatch('click');
            assert.equal(h.rows().length, 1); input.dispatch('compositionend');
        }
        control.dispatch('click', { detail: 0 }); assert.deepEqual(h.rows(), []); assert.equal(h.document.activeElement, h.recentSummary); clean(h);
    }
});

test('hidden, folded, inert, disabled, detached, document-hidden and departing contexts reject removal', () => {
    const unavailable = [
        h => { h.host.hidden = true; }, h => { h.host.inert = true; }, h => h.host.setAttribute('aria-hidden', 'true'),
        h => { h.host.style.display = 'none'; }, h => { h.host.style.visibility = 'hidden'; }, h => { h.host.style.visibility = 'collapse'; },
        h => h.host.remove(), h => { h.document.hidden = true; }, h => { h.document.visibilityState = 'hidden'; },
        h => h.window.LocalItabContentLifecycle.allowDeparture(), h => { h.recent.open = false; }, h => { h.recent.hidden = true; },
        h => { h.recentList.hidden = true; }, (h, s) => { s.remove.disabled = true; }, (h, s) => { s.remove.inert = true; },
        (h, s) => s.remove.setAttribute('aria-hidden', 'true'), (h, s) => { s.remove.style.display = 'none'; },
        (h, s) => { s.remove.style.visibility = 'hidden'; }, (h, s) => s.remove.remove(), (h, s) => { s.row.hidden = true; },
        (h, s) => { s.expression.hidden = true; }, (h, s) => { s.value.hidden = true; },
        h => h.input.remove(),
        h => { const details = h.document.createElement('details'); h.host.remove(); details.append(h.host); h.document.body.append(details); }
    ];
    for (const [index, hide] of unavailable.entries()) {
        const h = mount(); h.calculate('=3'); h.calculate('=7'); h.expand(); const saved = removalSource(h); hide(h, saved);
        const rows = [...h.recentList.children], before = unchangedCalculator(h), focus = h.document.activeElement;
        saved.remove.dispatch('click'); assert.deepEqual(h.recentList.children, rows, `unavailable ${index}`);
        assert.deepEqual(unchangedCalculator(h), before); assert.equal(h.document.activeElement, focus); clean(h);
    }
});

test('readonly, disabled or hidden input does not revoke an otherwise available history-only removal', () => {
    for (const state of ['readOnly', 'disabled', 'hidden']) {
        const h = mount(); h.calculate('=3'); h.calculate('=7'); h.expand(); h.input.setSelectionRange(1, 2);
        h.input[state] = true; const before = unchangedCalculator(h), focus = h.document.activeElement;
        remove(h).dispatch('click'); assert.deepEqual(recordTexts(h), [['=3', '3']]);
        assert.deepEqual(unchangedCalculator(h), before); assert.equal(h.document.activeElement, focus); clean(h);
    }
});

test('temporary hidden or folded owners remain unchanged and a restored valid control removes only one record', () => {
    for (const mode of ['host', 'document', 'details', 'disabled']) {
        const h = mount(); h.calculate('=3'); h.calculate('=7'); h.expand(); const control = remove(h);
        if (mode === 'host') h.host.hidden = true; else if (mode === 'document') h.document.hidden = true;
        else if (mode === 'details') h.recent.open = false; else control.disabled = true;
        control.dispatch('click'); assert.equal(h.rows().length, 2);
        h.host.hidden = false; h.document.hidden = false; h.recent.open = true; control.disabled = false;
        control.dispatch('click'); assert.deepEqual(recordTexts(h), [['=3', '3']]); clean(h);
    }
});

test('exact original expression/value, owner document, row and parent chain are required', () => {
    const changes = [
        (h, s) => { s.expression.textContent += ' '; }, (h, s) => { s.value.textContent = '07'; },
        (h, s) => { const replacement = h.document.createElement('span'); replacement.textContent = s.expression.textContent; s.expression.replaceWith(replacement); },
        (h, s) => { const replacement = h.document.createElement('span'); replacement.textContent = s.value.textContent; s.value.replaceWith(replacement); },
        (h, s) => { s.remove.remove(); h.rows()[1].append(s.remove); }, (h, s) => { s.row.remove(); h.host.append(s.row); },
        h => { h.input.remove(); h.host.append(h.input); }, h => { h.recentList.remove(); h.form.append(h.recentList); },
        h => { h.recent.remove(); h.host.append(h.recent); }, h => { h.form.remove(); h.document.body.append(h.form); },
        h => { h.window.localCalculatorView = {}; }, h => { h.host.id = 'different-owner'; },
        ...['row', 'expression', 'value', 'remove'].map(key => (h, s) => { s[key].ownerDocument = {}; }),
        ...['host', 'form', 'input', 'recent', 'recentList'].map(key => h => { h[key].ownerDocument = {}; })
    ];
    for (const [index, change] of changes.entries()) {
        const h = mount(); h.calculate('=3'); h.calculate('=7'); h.expand(); const saved = removalSource(h); change(h, saved);
        const rows = [...h.recentList.children], before = unchangedCalculator(h); saved.remove.dispatch('click');
        assert.deepEqual(h.recentList.children, rows, `identity ${index}`); assert.deepEqual(unchangedCalculator(h), before); clean(h);
    }
});

test('cleared, removed, redrawn and evicted old buttons cannot regain authority even when their entire row returns', () => {
    for (const mode of ['clear', 'remove', 'redraw', 'evict']) for (const reattach of ['row', 'button']) {
        const h = mount(); h.calculate('=3'); h.calculate('=7'); h.expand(); const saved = removalSource(h);
        if (mode === 'clear') h.clearRecent.dispatch('click');
        else if (mode === 'remove') saved.remove.dispatch('click');
        else if (mode === 'redraw') h.calculate('=8');
        else for (let n = 10; n < 15; n++) h.calculate(`=${n}`);
        if (!h.rows().length) h.calculate('=9'); h.edit('new draft'); const records = recordTexts(h);
        saved.remove.dispatch('click'); assert.deepEqual(recordTexts(h), records);
        if (reattach === 'row') h.recentList.append(saved.row); else { saved.remove.remove(); h.rows()[0].append(saved.remove); }
        const rows = [...h.recentList.children]; saved.remove.dispatch('click'); assert.deepEqual(h.recentList.children, rows);
        assert.equal(h.input.value, 'new draft'); clean(h);
    }
});

test('old owner actions stay retired after remount, including a reattached complete original form', () => {
    const h = mount(); h.calculate('=7'); h.expand(); const old = removalSource(h), oldForm = h.form;
    const current = h.remount(); current.calculate('=9'); current.expand(); current.edit('new owner draft'); current.input.focus();
    h.host.append(oldForm); const rows = [...current.recentList.children]; old.remove.dispatch('click');
    assert.deepEqual(current.recentList.children, rows); assert.equal(current.input.value, 'new owner draft');
    assert.equal(h.document.activeElement, current.input); assert.equal(old.row.parentElement, h.recentList); clean(h);
});

test('removal is independent of absent or disabled Use, Edit, Copy, their status and current-result controls', () => {
    for (const mode of ['absent', 'disabled']) {
        const h = mount(); h.calculate('=3'); h.calculate('=7'); h.expand(); const saved = removalSource(h), before = unchangedCalculator(h);
        for (const control of [h.use(), saved.row.querySelector('.search-calculator-recent-edit'), saved.copy, saved.status, h.copy, h.useResult]) {
            if (mode === 'absent') control.remove(); else control.disabled = true;
        }
        saved.remove.dispatch('click'); assert.deepEqual(recordTexts(h), [['=3', '3']]); assert.deepEqual(unchangedCalculator(h), before); clean(h);
    }
});

test('original Use, Edit and Copy actions still target their exact surviving record after removal', async () => {
    for (const action of ['use', 'edit', 'copy']) {
        const h = mount(); h.calculate(' = 1E-7 '); h.calculate('=8'); h.expand(); remove(h).dispatch('click');
        h.edit('new draft'); const saved = source(h), records = recordTexts(h);
        saved.row.querySelector(`.search-calculator-recent-${action}`).dispatch('click');
        if (action === 'copy') { await settle(); assert.deepEqual(h.calls, [' = 1E-7 \n1e-7']); assert.equal(h.input.value, 'new draft'); }
        else { assert.equal(h.input.value, action === 'use' ? '=1e-7' : ' = 1E-7 '); assert.equal(h.document.activeElement, h.input); }
        assert.deepEqual(recordTexts(h), records); clean(h);
    }
});

test('redraw discards all settled recent receipts but preserves independent current-result feedback', async () => {
    for (const failed of [false, true]) {
        const h = mount(); h.calculate('=3'); h.calculate('=7'); h.expand();
        h.copy.dispatch('click'); await settle(); const current = unchangedCalculator(h), old = h.rows().map((_, i) => source(h, i));
        if (failed) h.window.navigator.clipboard.writeText = () => Promise.reject(new Error('synthetic denial'));
        for (const saved of old) { saved.copy.dispatch('click'); await settle(); assert.equal(saved.status.hidden, false); }
        remove(h).dispatch('click'); for (const saved of old) assertNoFeedback(saved.status);
        assertNoFeedback(recentStatus(h)); assert.deepEqual(unchangedCalculator(h), current); assert.equal(h.observers.size, 0); clean(h);
    }
});

test('an unresolved recent write stays globally locked across removal of either row and suppresses late success or failure', async () => {
    for (const index of [0, 1]) for (const rejected of [false, true]) {
        const pending = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return pending.promise; } } });
        h.calculate('=3'); h.calculate('=7'); h.expand(); const old = source(h); old.copy.dispatch('click'); assertLocked(h);
        remove(h, index).dispatch('click'); assert.equal(h.rows().length, 1); assertNoFeedback(old.status); assertLocked(h);
        h.copy.dispatch('click'); recentCopy(h).dispatch('click'); old.copy.dispatch('click'); assert.deepEqual(calls, ['=7\n7']);
        assert.equal(h.observers.size, 0); h.input.focus(); const before = unchangedCalculator(h), records = recordTexts(h);
        if (rejected) pending.reject(new Error('late rejection')); else pending.resolve(); await settle();
        assertLocked(h, false); assertNoFeedback(old.status); assertNoFeedback(recentStatus(h));
        assert.deepEqual(unchangedCalculator(h), before); assert.deepEqual(recordTexts(h), records); assert.equal(h.document.activeElement, h.input);
        h.window.navigator.clipboard.writeText = text => { calls.push(text); return Promise.resolve(); };
        recentCopy(h).dispatch('click'); await settle(); assert.equal(calls.length, 2); assert.equal(recentStatus(h).textContent, h.messages.calculatorRecentCopySuccess.message); clean(h);
    }
});

test('removing the final recent record preserves a pending current-result write and its eventual legitimate receipt', async () => {
    for (const rejected of [false, true]) {
        const pending = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return pending.promise; } } });
        h.calculate('=7'); h.expand(); h.copy.dispatch('click'); const original = unchangedCalculator(h), observer = [...h.observers][0];
        const oldRows = h.rows(); remove(h).dispatch('click'); h.mutations([{ type: 'childList', target: h.recentList, removedNodes: oldRows }], true);
        assert.deepEqual(h.rows(), []); assert.deepEqual(unchangedCalculator(h), original); assertLocked(h);
        assert.equal([...h.observers][0], observer); h.copy.dispatch('click'); assert.deepEqual(calls, ['7']);
        if (rejected) pending.reject(new Error('late current denial')); else pending.resolve(); await settle(); assertLocked(h, false);
        assert.equal(h.feedback.textContent, h.messages[rejected ? 'calculatorCopyFailure' : 'calculatorCopySuccess'].message);
        assert.equal(h.value.value, '7'); assert.equal(h.input.value, '=7'); assert.equal(h.row.hidden, false); clean(h);
    }
});

test('removed recent receipts cannot unlock or erase a newer write after settlement and remount', async () => {
    const first = deferred(), second = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return first.promise; } } });
    h.calculate('=7'); h.expand(); const old = source(h); old.copy.dispatch('click'); const retired = [...h.observers][0]; remove(h).dispatch('click');
    const current = h.remount(); current.calculate('=9'); current.expand(); current.copy.dispatch('click'); assert.deepEqual(calls, ['=7\n7']);
    first.reject(new Error('old failure')); await settle(); h.window.navigator.clipboard.writeText = text => { calls.push(text); return second.promise; };
    const fresh = source(current); fresh.copy.dispatch('click'); const pendingText = fresh.status.textContent; assertLocked(current);
    retired.callback([{ type: 'attributes', target: h.host, attributeName: 'hidden' }]);
    assert.equal(fresh.status.textContent, pendingText); assertLocked(current); assert.deepEqual(calls, ['=7\n7', '=9\n9']);
    second.resolve(); await settle(); assert.equal(fresh.status.textContent, h.messages.calculatorRecentCopySuccess.message); clean(h);
});

test('focus moved outside during redraw is preserved even when the removed button originally held focus', () => {
    for (const mode of ['replace', 'translate']) {
        const h = mount(); h.calculate('=3'); h.calculate('=7'); h.expand(); const outside = h.document.createElement('button'); h.document.body.append(outside);
        const control = remove(h); control.focus();
        if (mode === 'replace') { const original = h.recentList.replaceChildren.bind(h.recentList); h.recentList.replaceChildren = (...rows) => { original(...rows); outside.focus(); }; }
        else { const translate = h.window.i18n.t; h.window.i18n.t = key => { outside.focus(); return translate(key); }; }
        control.dispatch('click'); assert.deepEqual(recordTexts(h), [['=3', '3']]); assert.equal(h.document.activeElement, outside); clean(h);
    }
});

test('redraw reentry cannot focus after owner remount, changed draft, ABA edit or a newly submitted calculation', () => {
    for (const mode of ['remount', 'edit', 'aba', 'submit']) {
        const h = mount(); h.calculate('=3'); h.calculate('=7'); h.expand(); const control = remove(h); control.focus();
        const replace = h.recentList.replaceChildren.bind(h.recentList); let expected, current = h;
        h.recentList.replaceChildren = (...rows) => {
            h.recentList.replaceChildren = replace; replace(...rows);
            if (mode === 'remount') { current = h.remount(); current.calculate('=9'); current.expand(); current.edit('replacement draft'); }
            else if (mode === 'edit') h.edit('newer draft');
            else if (mode === 'aba') { h.edit('temporary'); h.edit('=7'); }
            else h.calculate('=11');
            expected = { draft: current.input.value, rows: [...current.recentList.children], focus: h.document.activeElement };
        };
        control.dispatch('click'); assert(expected); assert.equal(current.input.value, expected.draft);
        assert.deepEqual(current.recentList.children, expected.rows); assert.equal(h.document.activeElement, expected.focus); clean(h);
    }
});

test('translation reentry may remount the owner without allowing the old removal to reclaim focus or edit the new draft', () => {
    const h = mount(); h.calculate('=3'); h.calculate('=7'); h.expand(); const control = remove(h); control.focus();
    const translate = h.window.i18n.t; let current;
    h.window.i18n.t = key => {
        h.window.i18n.t = translate; current = h.remount(); current.calculate('=11'); current.expand();
        current.edit('replacement during translation'); current.input.focus(); current.input.setSelectionRange(2, 5); return translate(key);
    };
    control.dispatch('click'); assert(current); assert.equal(current.input.value, 'replacement during translation');
    assert.deepEqual(recordTexts(current), [['=11', '11']]); assert.equal(h.document.activeElement, current.input);
    assert.equal(current.input.selectionStart, 2); assert.equal(current.input.selectionEnd, 5); clean(h);
});

test('replacement, hidden or disabled next controls and unavailable summary do not receive recovery focus', () => {
    for (const mode of ['replace-control', 'replace-expression', 'hidden', 'disabled', 'summary-hidden', 'summary-replaced', 'fold']) {
        const h = mount(); h.calculate('=3'); if (!mode.startsWith('summary')) h.calculate('=7'); h.expand(); const control = remove(h); control.focus();
        const replace = h.recentList.replaceChildren.bind(h.recentList);
        h.recentList.replaceChildren = (...rows) => {
            replace(...rows);
            if (mode === 'replace-control') { const clone = h.document.createElement('button'); clone.className = 'search-calculator-recent-remove'; remove(h).replaceWith(clone); }
            else if (mode === 'replace-expression') source(h).expression.replaceWith(h.document.createElement('span'));
            else if (mode === 'hidden') remove(h).hidden = true;
            else if (mode === 'disabled') remove(h).disabled = true;
            else if (mode === 'summary-hidden') h.recentSummary.hidden = true;
            else if (mode === 'summary-replaced') h.recentSummary.replaceWith(h.document.createElement('summary'));
            else h.recent.open = false;
        };
        control.dispatch('click'); assert.equal(h.document.activeElement, h.document.body, mode); assert.equal(h.input.value, mode.startsWith('summary') ? '=3' : '=7'); clean(h);
    }
});

test('recovery focus listeners own newer drafts, caret, nested removal and remounted owners without a second write', () => {
    for (const mode of ['draft', 'nested', 'remount', 'external']) {
        const h = mount(); h.calculate('=3'); h.calculate('=7'); h.expand(); const control = remove(h); control.focus();
        const replace = h.recentList.replaceChildren.bind(h.recentList); let expected, focusCalls = 0;
        h.recentList.replaceChildren = (...rows) => {
            h.recentList.replaceChildren = replace; replace(...rows); const target = remove(h), original = target.focus.bind(target);
            target.focus = () => {
                focusCalls++; original();
                if (mode === 'draft') { h.edit('focus callback draft'); h.input.setSelectionRange(2, 4); }
                else if (mode === 'nested') target.dispatch('click');
                else if (mode === 'remount') { const current = h.remount(); current.edit('new owner draft'); current.input.focus(); }
                else { const outside = h.document.createElement('button'); h.document.body.append(outside); outside.focus(); }
                expected = { focus: h.document.activeElement, value: h.host.querySelector('.search-input').value, start: h.input.selectionStart, end: h.input.selectionEnd };
            };
        };
        control.dispatch('click'); assert.equal(focusCalls, 1); assert(expected); assert.equal(h.document.activeElement, expected.focus);
        assert.equal(h.host.querySelector('.search-input').value, expected.value); assert.equal(h.input.selectionStart, expected.start); assert.equal(h.input.selectionEnd, expected.end); clean(h);
    }
});

test('history-only removal adds no reload blocker while a nonempty calculator draft keeps its existing guard', () => {
    const h = mount(); h.calculate('=3'); h.calculate('=7'); h.expand(); h.edit('');
    assert.equal(h.window.LocalItabContentLifecycle.hasUncommittedWork(), false); remove(h).dispatch('click');
    assert.equal(h.window.LocalItabContentLifecycle.hasUncommittedWork(), false); h.edit('=8+'); remove(h).dispatch('click');
    assert.equal(h.window.LocalItabContentLifecycle.hasUncommittedWork(), true); assert.equal(h.input.value, '=8+');
    assert.equal(h.window.LocalItabContentLifecycle.reload(), false); assert.deepEqual(h.reloads, []); clean(h);
});

test('the new action reuses existing wrapping, hidden and keyboard focus styles with no global handlers or new copy executor', () => {
    const css = fs.readFileSync('newtab.css', 'utf8'), js = fs.readFileSync('newtab.js', 'utf8');
    assert.match(css, /\.search-calculator-recent-item\s*\{[^}]*flex-wrap:\s*wrap/);
    assert.match(css, /\.search-calculator-recent button\s*\{[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/);
    assert.match(css, /\.search-calculator-recent button:focus-visible\s*\{[^}]*outline:/);
    assert.match(css, /\.search-calculator-recent \[hidden\]\s*\{\s*display:\s*none/);
    const action = js.slice(js.indexOf('    const bindRecentRemoveAction ='), js.indexOf('    const bindRecentCopyAction ='));
    assert.doesNotMatch(action, /markSearchEdited|calculate\(|input\.value\s*=(?!=)|setSelectionRange|Date|clipboard|navigator|storage|fetch|setTimeout|setInterval/);
    assert.equal((action.match(/\.focus\(/g) || []).length, 1); assert.match(action, /control\.addEventListener\('keydown', guardRecentKey\)/);
});
