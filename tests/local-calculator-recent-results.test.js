const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

// Real search initializer and existing bounded DOM model; no helper edits.
// Native button activation, focus/IME behavior, AT and layout remain unverified.
function mount({ locale = 'en', clipboard } = {}) {
    const document = createDocument({ blurUnavailableFocus: true }), events = new Map(), observers = new Set();
    // Existing integration uses this local prepend stand-in for reload notices.
    document.body.prepend = (...nodes) => document.body.append(...nodes);
    const calls = [], opens = [], io = [], reloads = [], host = document.createElement('section');
    host.id = 'search-container'; document.body.append(host);
    const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const forbidden = () => { io.push('forbidden'); throw new Error('Unexpected I/O'); };
    const window = {
        i18n: { t: key => messages[key]?.message || key },
        navigator: { clipboard: clipboard === undefined ? { writeText(text) { calls.push(text); return Promise.resolve(); }, readText: forbidden } : clipboard },
        addEventListener(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
        removeEventListener(type, fn) { events.get(type)?.delete(fn); },
        location: { reload() { reloads.push('reload'); } }, confirm: () => false,
        open(...args) { opens.push(args); return { closed: false }; },
        getComputedStyle(node) { return { visibility: node.style.visibility || 'visible', display: node.style.display || 'block' }; },
        MutationObserver: class {
            constructor(callback) { this.callback = callback; this.records = []; }
            observe() { observers.add(this); }
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
    return { ...controls(), window, document, context, host, calls, opens, io, reloads, messages, events, observers,
        remount() { context.initializeSearchComponent({}); return controls(); },
        emit(type) { for (const fn of [...(events.get(type) || [])]) fn(); },
        mutations(records, queued = false) { for (const observer of [...observers]) { if (queued) observer.records.push(...records); else observer.callback(records); } } };
}
function clean(h) {
    assert.equal(h.observers.size, 0, 'no pending observer remains');
    for (const type of ['blur', 'pagehide']) assert.equal(h.events.get(type)?.size || 0, 0, `no ${type} copy listener remains`);
    assert.equal(h.document.listeners.has('visibilitychange'), false, 'no visibility copy listener remains');
    assert.deepEqual(h.io, [], 'no storage, network, legacy or clipboard-read I/O');
}

function recordTexts(h) { return h.rows().map(row => [row.querySelector('.search-calculator-recent-expression').textContent, row.querySelector('.search-calculator-recent-value').textContent]); }

test('recent calculations are a collapsed native disclosure with local-only boundaries in both locales', () => {
    for (const locale of ['en', 'zh_CN']) {
        const h = mount({ locale });
        assert(h.recent, 'successful calculations need a page-local recent list');
        assert.equal(h.recent.tagName, 'DETAILS'); assert.equal(h.recent.open, false);
        assert.equal(h.recentSummary.tagName, 'SUMMARY'); assert.equal(h.recentSummary.tabIndex, 0);
        assert.equal(h.recentSummary.textContent, h.messages.calculatorRecentTitle.message);
        assert.equal(h.recent.querySelector('.search-calculator-recent-note').textContent, h.messages.calculatorRecentNote.message);
        assert.equal(h.recentList.tagName, 'OL'); assert.deepEqual(h.rows(), []);
        assert.equal(h.recentEmpty.textContent, h.messages.calculatorRecentEmpty.message); assert.equal(h.recentEmpty.hidden, false);
        assert.equal(h.clearRecent.type, 'button'); assert.equal(h.clearRecent.textContent, h.messages.calculatorRecentClear.message);
        assert.equal(h.clearRecent.disabled, true); assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
    }
});

test('only successful explicit calculations append newest-first, preserve raw text and full values, and cap at five', () => {
    const h = mount(); h.input.focus(); const expected = [];
    for (const [expression, value] of [[' =0 ', '0'], ['=-12', '-12'], ['=1/8', '0.125'], ['=0.1+0.2', '0.30000000000000004'], ['=1000000000000000000000', '1e+21'], ['=1/10000000', '1e-7']]) {
        h.edit(expression); assert.deepEqual(recordTexts(h), expected); h.submit();
        expected.unshift([expression, value]); expected.splice(5);
        assert.deepEqual(recordTexts(h), expected); assert.equal(h.recent.open, false, 'calculation does not expand the list');
        assert.equal(h.document.activeElement, h.input); assert.equal(h.recentEmpty.hidden, true); assert.equal(h.clearRecent.disabled, false);
    }
    h.submit(); expected.unshift(['=1/10000000', '1e-7']); expected.splice(5);
    assert.deepEqual(recordTexts(h), expected, 'a deliberately repeated calculation is another recent entry');
    assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
});

test('editing, errors, ordinary searches, composition and clearing the current result preserve recent entries', () => {
    const h = mount(); h.calculate('=2+3'); const expected = [['=2+3', '5']];
    for (const text of ['', 'draft', '=1/0', '=foo', '=', '=1e+']) {
        h.edit(text); assert.deepEqual(recordTexts(h), expected); h.submit(); assert.deepEqual(recordTexts(h), expected);
    }
    h.edit('=9'); h.input.dispatch('compositionstart'); h.submit(); h.input.dispatch('compositionend');
    assert.deepEqual(recordTexts(h), expected); h.window.localCalculatorView.clearResult(); assert.deepEqual(recordTexts(h), expected);
    for (const calculate of [undefined, () => { throw new Error('unavailable'); }]) {
        h.window.LocalItabCalculator = { calculate }; h.submit(); assert.deepEqual(recordTexts(h), expected);
    }
    assert.equal(h.opens.length, 1); assert.deepEqual(h.calls, []); clean(h);
});

test('each historical result can replace a newer draft exactly, with focus/caret and no automatic calculation or I/O', () => {
    for (const locale of ['en', 'zh_CN']) {
        const h = mount({ locale }); let calculations = 0; const calculate = h.window.LocalItabCalculator.calculate;
        h.window.LocalItabCalculator = { calculate(expression) { calculations++; return calculate(expression); } };
        for (const [expression, value] of [['=0', '0'], ['=-12', '-12'], ['=1/8', '0.125'], ['=0.1+0.2', '0.30000000000000004'], ['=1000000000000000000000', '1e+21'], ['=1/10000000', '1e-7']]) {
            h.calculate(expression); h.calculate('=42'); h.edit('new unfinished draft'); h.expand();
            const before = calculations, records = recordTexts(h), use = h.use(1);
            assert.equal(use.type, 'button'); assert.equal(use.textContent, h.messages.calculatorUseResult.message);
            use.focus(); use.dispatch('click'); assert.equal(h.input.value, `=${value}`); assert.equal(calculations, before);
            assert.equal(h.document.activeElement, h.input); assert.equal(h.input.selectionStart, h.input.value.length); assert.equal(h.input.selectionEnd, h.input.value.length);
            assert.deepEqual(recordTexts(h), records); assert.equal(h.row.hidden, true); assert.equal(h.value.value, ''); assert.equal(h.feedback.hidden, true);
            assert.equal(h.status.textContent, h.messages.calculatorHint.message); assert.equal(h.window.LocalItabContentLifecycle.hasUncommittedWork(), true);
            h.edit(h.input.value + '*2'); assert.equal(calculations, before); h.submit(); assert.equal(calculations, before + 1);
            assert.equal(h.value.value, String(calculate(`${value}*2`).value));
        }
        assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
    }
});

test('clear removes only recent entries; old cleared and evicted row callbacks cannot affect new drafts', () => {
    const h = mount(); h.calculate('=7'); h.expand(); const old = h.use(); const currentResult = h.value.value;
    h.clearRecent.dispatch('click'); assert.deepEqual(h.rows(), []); assert.equal(h.recentEmpty.hidden, false); assert.equal(h.clearRecent.disabled, true);
    assert.equal(h.input.value, '=7'); assert.equal(h.value.value, currentResult); assert.equal(h.row.hidden, false);
    h.calculate('=8'); h.edit('new draft'); old.dispatch('click'); assert.equal(h.input.value, 'new draft');
    h.recentList.append(old); old.dispatch('click'); assert.equal(h.input.value, 'new draft', 'reinserted cleared callback has no record authority'); old.remove();
    h.calculate('=1'); const evicted = h.use();
    for (let value = 2; value <= 6; value++) h.calculate(`=${value}`);
    h.edit('latest draft'); evicted.dispatch('click'); assert.equal(h.input.value, 'latest draft');
    h.recentList.append(evicted); evicted.dispatch('click'); assert.equal(h.input.value, 'latest draft', 'evicted exact record cannot be resurrected');
    assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
});

test('remount and a fresh page discard recent entries, and detached old-owner actions have no authority', () => {
    const h = mount(); h.calculate(); h.expand(); const use = h.use(), clear = h.clearRecent;
    const current = h.remount(); assert.deepEqual(current.rows(), []); assert.equal(current.recent.open, false);
    current.calculate('=9'); current.expand(); current.input.focus(); use.dispatch('click'); clear.dispatch('click');
    assert.equal(current.input.value, '=9'); assert.deepEqual(recordTexts(current), [['=9', '9']]); assert.equal(h.document.activeElement, current.input);
    assert.deepEqual(mount().rows(), []); assert.deepEqual(h.calls, []); clean(h);
});

test('history alone adds no reload blocker while an explicitly reused draft retains the existing protection', () => {
    const h = mount(); h.calculate(); h.edit(''); assert.equal(h.window.LocalItabContentLifecycle.hasUncommittedWork(), false);
    assert.equal(h.rows().length, 1); h.expand(); h.use().dispatch('click'); assert.equal(h.window.LocalItabContentLifecycle.hasUncommittedWork(), true);
    assert.equal(h.window.LocalItabContentLifecycle.reload(), false); assert.deepEqual(h.reloads, []); assert.equal(h.input.value, '=6');
    h.document.querySelector('.local-content-reload-notice button').dispatch('click'); assert.deepEqual(h.reloads, []);
    h.edit('ordinary search'); h.submit(); assert.equal(h.window.LocalItabContentLifecycle.hasUncommittedWork(), false);
    assert.equal(h.rows().length, 1); assert.equal(h.window.LocalItabContentLifecycle.reload(), true); assert.deepEqual(h.reloads, ['reload']); clean(h);
});

test('native button activation remains available while modifiers, repeat, IME, double-click tails and prevented events are ignored', () => {
    for (const key of ['Enter', ' ']) for (const selector of ['use', 'clear']) {
        const h = mount(); h.calculate(); h.expand(); h.edit('draft'); const control = selector === 'use' ? h.use() : h.clearRecent;
        assert.equal(control.dispatch('keydown', { key }).prevented, false);
        for (const flags of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { defaultPrevented: true }]) {
            assert(control.dispatch('keydown', { key, ...flags }).prevented); control.dispatch('click', flags);
            assert.equal(h.input.value, 'draft'); assert.equal(h.rows().length, 1);
        }
        control.dispatch('click', { detail: 2 }); assert.equal(h.input.value, 'draft'); assert.equal(h.rows().length, 1);
        for (const input of [h.input, h.host.querySelector('.search-custom-input')]) {
            input.dispatch('compositionstart'); assert(control.dispatch('keydown', { key }).prevented); control.dispatch('click');
            assert.equal(h.input.value, 'draft'); assert.equal(h.rows().length, 1); input.dispatch('compositionend');
        }
        control.dispatch('click', { detail: 0 }); assert.equal(h.input.value, selector === 'use' ? '=6' : 'draft'); assert.equal(h.rows().length, selector === 'use' ? 1 : 0); clean(h);
    }
});

test('hidden or unavailable controls block actions without discarding records and become usable when shown again', () => {
    const unavailable = [
        h => { h.host.hidden = true; }, h => { h.host.inert = true; }, h => h.host.setAttribute('aria-hidden', 'true'),
        h => { h.host.style.display = 'none'; }, h => { h.host.style.visibility = 'hidden'; }, h => { h.host.style.visibility = 'collapse'; },
        h => h.host.remove(), h => { h.document.hidden = true; }, h => { h.document.visibilityState = 'hidden'; },
        h => h.window.LocalItabContentLifecycle.allowDeparture(), h => { h.recent.open = false; }, h => { h.recent.hidden = true; },
        h => { h.recentList.hidden = true; }, h => { h.use().disabled = true; }, h => { h.use().inert = true; },
        h => h.use().setAttribute('aria-hidden', 'true'), h => { h.use().style.display = 'none'; }, h => { h.use().style.visibility = 'hidden'; },
        h => h.use().remove(), h => { const control = h.use(); control.remove(); h.document.body.append(control); },
        h => { h.input.hidden = true; }, h => { h.input.inert = true; }, h => h.input.setAttribute('aria-hidden', 'true'),
        h => { h.input.style.display = 'none'; }, h => { h.input.style.visibility = 'hidden'; }, h => { h.input.style.visibility = 'collapse'; },
        h => { h.input.disabled = true; }, h => { h.input.readOnly = true; }, h => h.input.remove(),
        h => { h.input.remove(); h.document.body.append(h.input); }, h => { h.window.localCalculatorView = {}; },
        h => { const details = h.document.createElement('details'); h.host.remove(); details.append(h.host); h.document.body.append(details); }
    ];
    for (const [index, hide] of unavailable.entries()) {
        const h = mount(); h.calculate(); h.expand(); h.edit('draft'); const use = h.use(); hide(h); const focus = h.document.activeElement;
        use.dispatch('click'); assert.equal(h.input.value, 'draft', `unavailable scenario ${index}`); assert.equal(h.document.activeElement, focus); assert.equal(h.input.selectionStart, undefined); clean(h);
    }
    for (const block of ['host', 'document', 'details']) {
        const h = mount(); h.calculate(); h.expand(); const use = h.use(); h.edit('draft');
        if (block === 'host') h.host.hidden = true; else if (block === 'document') h.document.hidden = true; else h.recent.open = false;
        use.dispatch('click'); h.clearRecent.dispatch('click'); assert.deepEqual(recordTexts(h), [['=42/7', '6']]);
        h.host.hidden = false; h.document.hidden = false; h.recent.open = true; use.dispatch('click'); assert.equal(h.input.value, '=6'); clean(h);
    }
});

test('focus reentry cannot overwrite new edits, ABA, submissions, records, composition, visibility or ownership', () => {
    const interruptions = [
        h => h.edit('new draft'), h => { h.edit('other draft'); h.edit('draft'); }, h => { h.input.value = 'direct change'; },
        h => { h.input.value = '=42'; h.submit(); }, h => h.submit(), h => h.calculate('=4+8'),
        h => h.clearRecent.dispatch('click'), h => { for (let n = 0; n < 5; n++) h.calculate(`=${n}`); },
        h => h.input.dispatch('compositionstart'), h => h.host.querySelector('.search-custom-input').dispatch('compositionstart'),
        h => { h.input.disabled = true; }, h => { h.input.readOnly = true; }, h => { h.input.hidden = true; },
        h => { h.recent.open = false; }, h => { h.document.hidden = true; }, h => { h.use().hidden = true; }, h => h.use().remove(),
        h => h.input.remove(), h => h.host.remove(), h => h.window.LocalItabContentLifecycle.allowDeparture(),
        h => { h.document.activeElement = h.document.body; },
        h => { const current = h.remount(); current.edit('replacement draft'); current.input.focus(); }
    ];
    for (const [index, interrupt] of interruptions.entries()) {
        const h = mount(); h.calculate(); h.expand(); h.edit('draft'); const use = h.use(); let expected;
        const focus = h.input.focus.bind(h.input); h.input.focus = () => {
            focus(); interrupt(h); expected = { value: h.input.value, result: h.value.value, status: h.status.textContent, focus: h.document.activeElement };
            h.input.selectionStart = 1; h.input.selectionEnd = 2;
        };
        use.dispatch('click'); assert(expected, `focus callback ${index}`); assert.equal(h.input.value, expected.value, `focus reentry ${index}`);
        assert.equal(h.value.value, expected.result); assert.equal(h.status.textContent, expected.status); assert.equal(h.document.activeElement, expected.focus);
        assert.equal(h.input.selectionStart, 1); assert.equal(h.input.selectionEnd, 2); clean(h);
    }
});

test('pending copy remains single-flight and late receipts cannot affect a reused historical draft', async () => {
    for (const rejected of [false, true]) {
        const wait = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } });
        h.calculate('=7'); h.calculate('=9'); h.copy.dispatch('click'); assert.deepEqual(calls, ['9']); h.expand(); h.use(1).dispatch('click');
        assert.equal(h.input.value, '=7'); assert.equal(h.feedback.hidden, true); assert.equal(h.observers.size, 0);
        h.submit(); h.copy.dispatch('click'); assert.deepEqual(calls, ['9']); assert.equal(h.copy.getAttribute('aria-disabled'), 'true');
        if (rejected) wait.reject(new Error('late denial')); else wait.resolve(); await settle();
        assert.equal(h.input.value, '=7'); assert.equal(h.value.value, '7'); assert.equal(h.feedback.hidden, true); assert.equal(h.copy.getAttribute('aria-disabled'), 'false');
        assert.equal(h.document.activeElement, h.input); assert.deepEqual(h.opens, []); clean(h);
    }
});

test('historical reuse does not depend on current-result controls or access the clipboard API', () => {
    const h = mount(); h.calculate(); h.expand(); h.copy.remove(); h.useResult.remove(); h.edit('draft');
    Object.defineProperty(h.window.navigator, 'clipboard', { get() { h.io.push('clipboard getter'); throw new Error('No clipboard'); } });
    h.use().dispatch('click'); assert.equal(h.input.value, '=6'); assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
});

test('reentrant calculator submissions publish only the latest successful recent record', () => {
    for (const interruption of ['edit', 'remount', 'submit']) {
        const h = mount(); h.edit('=1'); let nested = false;
        h.window.LocalItabCalculator = { calculate() { if (nested) return { value: 2 }; nested = true;
            if (interruption === 'edit') h.edit('=2'); else if (interruption === 'remount') h.remount(); else h.submit(); return { value: 99 }; } };
        h.submit(); assert.deepEqual(recordTexts(h), interruption === 'submit' ? [['=1', '2']] : []); clean(h);
    }
});

test('fallback labels, text-only rendering and appended wrapping/focus styles are explicit', () => {
    const h = mount(); h.window.i18n = { t: key => key }; const current = h.remount();
    assert(current.recentSummary); assert.equal(current.recentSummary.textContent, 'Recent calculations on this page');
    assert.equal(current.clearRecent.textContent, 'Clear recent calculations'); current.calculate(); current.expand();
    assert.equal(current.use().textContent, 'Use result');
    const css = fs.readFileSync('newtab.css', 'utf8');
    assert.match(css, /\.search-calculator-recent\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
    assert.match(css, /\.search-calculator-recent-item\s*\{[^}]*flex-wrap:\s*wrap/);
    assert.match(css, /\.search-calculator-recent-expression[^}]*white-space:\s*pre-wrap[^}]*overflow-wrap:\s*anywhere/);
    assert.match(css, /\.search-calculator-recent[^}]*:focus-visible[^}]*outline:/); clean(h);
});
