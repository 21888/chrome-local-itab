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

// Expression editing adds coverage without changing the existing harness or tests.
function expressionEdit(h, index = 0) { return h.rows()[index].querySelector('.search-calculator-recent-edit'); }

test('recent expression edit restores exact original text in both locales and waits for explicit submission', () => {
    const examples = [['  = .5E+2 + ( -3 )  ', '47'], ['\t=1e-7*2 \t', '2e-7'],
        ['=0.1+0.2', '0.30000000000000004'], [' =1000000000000000000000 ', '1e+21'], ['=-0', '0'], [' = -12 ', '-12']];
    for (const locale of ['en', 'zh_CN']) {
        const h = mount({ locale }); let calculations = 0; const calculate = h.window.LocalItabCalculator.calculate;
        h.window.LocalItabCalculator = { calculate(expression) { calculations++; return calculate(expression); } };
        for (const [expression, value] of examples) {
            h.calculate(expression); h.calculate('=999'); h.edit('unfinished replacement draft'); h.expand();
            const control = expressionEdit(h, 1), before = calculations, rows = h.rows(), records = recordTexts(h);
            assert(control, 'each recent row has its own expression edit action'); assert.equal(control.tagName, 'BUTTON');
            assert.equal(control.type, 'button'); assert.equal(control.tabIndex, 0);
            assert.equal(control.textContent, h.messages.calculatorEditExpression.message);
            assert.notEqual(control, h.use(1)); assert.equal(h.use(1).textContent, h.messages.calculatorUseResult.message);
            control.focus(); control.dispatch('click');
            assert.equal(h.input.value, expression); assert.equal(calculations, before, 'editing never evaluates');
            assert.equal(h.document.activeElement, h.input); assert.equal(h.input.selectionStart, expression.length); assert.equal(h.input.selectionEnd, expression.length);
            assert.equal(h.row.hidden, true); assert.equal(h.value.value, ''); assert.equal(h.feedback.hidden, true);
            assert.equal(h.status.textContent, h.messages.calculatorHint.message); assert.equal(h.searchStatus.textContent, '');
            assert.deepEqual(recordTexts(h), records, 'editing does not append, reorder or clear history');
            assert.deepEqual(h.rows(), rows, 'editing does not redraw history'); assert.equal(h.recent.open, true);
            assert.equal(h.window.LocalItabContentLifecycle.hasUncommittedWork(), true);
            h.submit(); assert.equal(calculations, before + 1); assert.equal(h.value.value, value);
            assert.deepEqual(recordTexts(h)[0], [expression, value]);
            assert.deepEqual(recordTexts(h), [[expression, value], ...records].slice(0, 5), 'only explicit submission adds a record');
        }
        assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
    }
});

test('expression edit clears successful copy feedback and calculator/search errors through the existing hint path', async () => {
    const h = mount(), expression = '  =1E-7 * 2  ';
    h.calculate(expression); h.calculate('=8'); h.expand(); h.copy.dispatch('click'); await settle();
    assert.equal(h.feedback.textContent, h.messages.calculatorCopySuccess.message);
    expressionEdit(h, 1).dispatch('click'); assert.equal(h.input.value, expression);
    assert.equal(h.feedback.textContent, ''); assert.equal(h.feedback.hidden, true); assert.equal(h.row.hidden, true);
    h.calculate('=1/0'); assert.equal(h.status.classList.contains('is-error'), true);
    expressionEdit(h, 1).dispatch('click'); assert.equal(h.input.value, expression);
    assert.equal(h.status.classList.contains('is-error'), false); assert.equal(h.status.textContent, h.messages.calculatorHint.message);
    h.window.open = () => { throw new Error('blocked'); }; h.edit('ordinary query'); h.submit();
    assert.equal(h.searchStatus.classList.contains('is-error'), true);
    expressionEdit(h, 1).dispatch('click'); assert.equal(h.input.value, expression);
    assert.equal(h.searchStatus.textContent, ''); assert.equal(h.searchStatus.classList.contains('is-error'), false);
    assert.deepEqual(recordTexts(h), [['=8', '8'], [expression, '2e-7']]); assert.deepEqual(h.calls, ['8']); clean(h);
});

test('expression edit uses native button activation and rejects modifiers, IME, repeats and double-click tails', () => {
    for (const key of ['Enter', ' ']) {
        const h = mount(), expression = ' =42/7 '; h.calculate(expression); h.expand(); h.edit('draft'); const control = expressionEdit(h);
        assert(control); assert.equal(control.dispatch('keydown', { key }).prevented, false);
        assert.equal(h.input.value, 'draft', 'keydown does not synthesize an action');
        for (const flags of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { defaultPrevented: true }]) {
            assert(control.dispatch('keydown', { key, ...flags }).prevented); control.dispatch('click', flags);
            assert.equal(h.input.value, 'draft'); assert.equal(h.rows().length, 1);
        }
        control.dispatch('click', { detail: 2 }); assert.equal(h.input.value, 'draft');
        for (const input of [h.input, h.host.querySelector('.search-custom-input')]) {
            input.dispatch('compositionstart'); assert(control.dispatch('keydown', { key }).prevented); control.dispatch('click');
            assert.equal(h.input.value, 'draft'); assert.equal(h.rows().length, 1); input.dispatch('compositionend');
        }
        control.dispatch('click', { detail: 0 }); assert.equal(h.input.value, expression); assert.equal(h.rows().length, 1);
        assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
    }
});

test('expression edit rejects unavailable owners, inputs, rows and controls without touching the draft', () => {
    const unavailable = [
        h => { h.host.hidden = true; }, h => { h.host.inert = true; }, h => h.host.setAttribute('aria-hidden', 'true'),
        h => { h.host.style.display = 'none'; }, h => { h.host.style.visibility = 'hidden'; }, h => { h.host.style.visibility = 'collapse'; },
        h => h.host.remove(), h => { h.document.hidden = true; }, h => { h.document.visibilityState = 'hidden'; },
        h => h.window.LocalItabContentLifecycle.allowDeparture(), h => { h.recent.open = false; }, h => { h.recent.hidden = true; },
        h => { h.recentList.hidden = true; }, h => { h.rows()[0].hidden = true; }, h => h.rows()[0].remove(),
        h => { const row = h.rows()[0]; row.remove(); h.host.append(row); },
        h => { expressionEdit(h).disabled = true; }, h => { expressionEdit(h).hidden = true; }, h => { expressionEdit(h).inert = true; },
        h => expressionEdit(h).setAttribute('aria-hidden', 'true'), h => { expressionEdit(h).style.display = 'none'; },
        h => { expressionEdit(h).style.visibility = 'hidden'; }, h => { expressionEdit(h).style.visibility = 'collapse'; },
        h => expressionEdit(h).remove(), h => { const control = expressionEdit(h); control.remove(); h.document.body.append(control); },
        h => { const control = expressionEdit(h); control.remove(); h.host.append(control); },
        h => { h.input.hidden = true; }, h => { h.input.inert = true; }, h => h.input.setAttribute('aria-hidden', 'true'),
        h => { h.input.style.display = 'none'; }, h => { h.input.style.visibility = 'hidden'; }, h => { h.input.style.visibility = 'collapse'; },
        h => { h.input.disabled = true; }, h => { h.input.readOnly = true; }, h => h.input.remove(),
        h => { h.input.remove(); h.document.body.append(h.input); }, h => { h.window.localCalculatorView = {}; },
        h => { const details = h.document.createElement('details'); h.host.remove(); details.append(h.host); h.document.body.append(details); }
    ];
    for (const [index, hide] of unavailable.entries()) {
        const h = mount(); h.calculate(); h.expand(); h.edit('draft'); const control = expressionEdit(h); assert(control); hide(h);
        const focus = h.document.activeElement; control.dispatch('click');
        assert.equal(h.input.value, 'draft', `unavailable expression scenario ${index}`); assert.equal(h.document.activeElement, focus);
        assert.equal(h.input.selectionStart, undefined); assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
    }
    const h = mount(); h.calculate(' =42/7 '); h.expand(); h.edit('draft'); const control = expressionEdit(h);
    h.host.hidden = true; control.dispatch('click'); h.host.hidden = false; control.dispatch('click');
    assert.equal(h.input.value, ' =42/7 '); assert.deepEqual(recordTexts(h), [[' =42/7 ', '6']]); clean(h);
});

test('expression and result actions have independent control ownership and exact row membership', () => {
    for (const selected of ['expression', 'result']) {
        const h = mount(); h.calculate(' =3+4 '); h.expand(); h.edit('draft');
        const control = selected === 'expression' ? expressionEdit(h) : h.use();
        const sibling = selected === 'expression' ? h.use() : expressionEdit(h);
        sibling.remove(); h.copy.remove(); h.useResult.remove();
        Object.defineProperty(h.window.navigator, 'clipboard', { get() { h.io.push('clipboard getter'); throw new Error('No clipboard'); } });
        control.dispatch('click'); assert.equal(h.input.value, selected === 'expression' ? ' =3+4 ' : '=7');
        assert.equal(h.rows().length, 1); assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
    }
    for (const selected of ['expression', 'result']) {
        const h = mount(); h.calculate('=3+4'); h.calculate('=9'); h.expand(); h.edit('draft');
        const control = selected === 'expression' ? expressionEdit(h, 1) : h.use(1), originalRow = h.rows()[1];
        control.remove(); h.rows()[0].append(control); control.dispatch('click');
        assert.equal(h.input.value, 'draft', 'a current control moved into a different record row has no authority');
        control.remove(); originalRow.append(control); control.dispatch('click');
        assert.equal(h.input.value, selected === 'expression' ? '=3+4' : '=7'); clean(h);
    }
});

test('both recent actions reject reattached stale controls and entire rows after redraw, clear and eviction', () => {
    for (const invalidation of ['redraw', 'clear', 'evict']) {
        const h = mount(); h.calculate(' =3+4 '); h.expand(); const row = h.rows()[0], controls = [h.use(), expressionEdit(h)];
        if (invalidation === 'clear') h.clearRecent.dispatch('click');
        if (invalidation === 'evict') for (let n = 0; n < 5; n++) h.calculate(`=${n}`);
        else h.calculate('=9');
        h.edit('new draft'); const records = recordTexts(h), currentRows = h.rows();
        h.recentList.append(row);
        for (const control of controls) { control.dispatch('click'); assert.equal(h.input.value, 'new draft', `${invalidation}: reattached old row`); }
        row.remove();
        for (const control of controls) {
            control.remove(); currentRows[0].append(control); control.dispatch('click');
            assert.equal(h.input.value, 'new draft', `${invalidation}: old control in a new row`); control.remove();
        }
        assert.deepEqual(recordTexts(h), records); assert.deepEqual(h.rows(), currentRows);
        assert.equal(h.input.selectionStart, undefined); assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
    }
});

test('old expression edit cannot regain authority after owner remount even when its entire form is reattached', () => {
    const h = mount(); h.calculate(' =3+4 '); h.expand(); const controls = [h.use(), expressionEdit(h)], oldForm = h.form;
    const current = h.remount(); current.calculate('=9'); current.expand(); current.edit('replacement draft'); current.input.focus();
    h.host.append(oldForm);
    for (const control of controls) control.dispatch('click');
    assert.equal(current.input.value, 'replacement draft'); assert.equal(h.input.value, ' =3+4 ');
    assert.equal(h.document.activeElement, current.input); assert.equal(current.input.selectionStart, undefined);
    assert.deepEqual(recordTexts(current).slice(0, 1), [['=9', '9']]);
    oldForm.remove(); assert.deepEqual(recordTexts(current), [['=9', '9']]); clean(h);
});

test('expression focus reentry preserves newer edits, ABA revisions, submissions, record changes and owner state', () => {
    const interruptions = [
        h => h.edit('new draft'), h => { h.edit('other draft'); h.edit('draft'); }, h => { h.input.value = 'direct change'; },
        h => { h.input.value = '=42'; h.submit(); }, h => h.submit(), h => h.calculate('=4+8'),
        h => { const input = h.host.querySelector('.search-custom-input'); input.value = 'changed'; input.dispatch('input'); input.value = ''; input.dispatch('input'); },
        h => h.clearRecent.dispatch('click'), h => { for (let n = 0; n < 5; n++) h.calculate(`=${n}`); },
        h => h.input.dispatch('compositionstart'), h => h.host.querySelector('.search-custom-input').dispatch('compositionstart'),
        h => { h.input.disabled = true; }, h => { h.input.readOnly = true; }, h => { h.input.hidden = true; },
        h => { h.recent.open = false; }, h => { h.document.hidden = true; }, h => { h.document.visibilityState = 'hidden'; },
        h => { expressionEdit(h).disabled = true; }, h => { expressionEdit(h).hidden = true; }, h => expressionEdit(h).remove(),
        h => h.rows()[0].remove(), h => { const row = h.rows()[0]; row.remove(); h.host.append(row); },
        h => h.input.remove(), h => h.host.remove(), h => h.window.LocalItabContentLifecycle.allowDeparture(),
        h => { h.document.activeElement = h.document.body; },
        h => { const current = h.remount(); current.edit('replacement draft'); current.input.focus(); }
    ];
    for (const [index, interrupt] of interruptions.entries()) {
        const h = mount(); h.calculate(' =3+4 '); h.expand(); h.edit('draft'); const control = expressionEdit(h); let expected;
        assert(control); const focus = h.input.focus.bind(h.input); h.input.focus = () => {
            focus(); interrupt(h); expected = { value: h.input.value, result: h.value.value, status: h.status.textContent, focus: h.document.activeElement };
            h.input.selectionStart = 1; h.input.selectionEnd = 2;
        };
        control.dispatch('click'); assert(expected, `expression focus callback ${index}`);
        assert.equal(h.input.value, expected.value, `expression focus reentry ${index}`); assert.equal(h.value.value, expected.result);
        assert.equal(h.status.textContent, expected.status); assert.equal(h.document.activeElement, expected.focus);
        assert.equal(h.input.selectionStart, 1); assert.equal(h.input.selectionEnd, 2); clean(h);
    }
});

test('focus reentry from either recent action cannot overwrite the newer sibling action', () => {
    for (const selected of ['expression', 'result']) {
        const h = mount(); h.calculate(' =3+4 '); h.expand(); h.edit('draft');
        const control = selected === 'expression' ? expressionEdit(h) : h.use();
        const newer = selected === 'expression' ? h.use() : expressionEdit(h);
        const focus = h.input.focus.bind(h.input); let entered = false;
        h.input.focus = () => { focus(); if (!entered) { entered = true; newer.dispatch('click'); } };
        control.dispatch('click'); const expected = selected === 'expression' ? '=7' : ' =3+4 ';
        assert.equal(h.input.value, expected); assert.equal(h.input.selectionStart, expected.length); assert.equal(h.input.selectionEnd, expected.length);
        assert.deepEqual(recordTexts(h), [[' =3+4 ', '7']]); assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
    }
});

test('expression edit keeps pending clipboard writes locked through settlement and never accepts late feedback', async () => {
    for (const rejected of [false, true]) for (const replaceOwner of [false, true]) {
        const wait = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } });
        const expression = '  =1E-7 * 2  '; h.calculate(expression); h.calculate('=9'); h.copy.dispatch('click');
        assert.deepEqual(calls, ['9']); h.expand(); expressionEdit(h, 1).dispatch('click');
        assert.equal(h.input.value, expression); assert.equal(h.feedback.hidden, true); assert.equal(h.feedback.textContent, ''); assert.equal(h.observers.size, 0);
        assert.equal(h.copy.getAttribute('aria-disabled'), 'true');
        const current = replaceOwner ? h.remount() : h;
        if (replaceOwner) current.calculate('=11'); else current.submit();
        current.copy.dispatch('click'); assert.deepEqual(calls, ['9']); assert.equal(current.copy.getAttribute('aria-disabled'), 'true');
        current.useResult.focus(); const focus = h.document.activeElement, records = recordTexts(current);
        if (rejected) wait.reject(new Error('late denial')); else wait.resolve(); await settle();
        assert.equal(current.input.value, replaceOwner ? '=11' : expression); assert.equal(current.value.value, replaceOwner ? '11' : '2e-7');
        assert.equal(current.feedback.hidden, true); assert.equal(current.feedback.textContent, ''); assert.equal(current.copy.getAttribute('aria-disabled'), 'false');
        assert.equal(h.document.activeElement, focus); assert.deepEqual(recordTexts(current), records);
        current.copy.dispatch('click'); await settle(); assert.deepEqual(calls, ['9', replaceOwner ? '11' : '2e-7']);
        assert.deepEqual(h.opens, []); clean(h);
    }
});

test('editing a recent expression preserves draft reload protection without adding a history-only blocker', () => {
    const h = mount(), expression = '  =3 + 4  '; h.calculate(expression); h.edit(''); h.expand();
    assert.equal(h.window.LocalItabContentLifecycle.hasUncommittedWork(), false);
    expressionEdit(h).dispatch('click'); assert.equal(h.input.value, expression); assert.equal(h.window.LocalItabContentLifecycle.hasUncommittedWork(), true);
    assert.equal(h.window.LocalItabContentLifecycle.reload(), false); assert.deepEqual(h.reloads, []);
    h.edit(''); assert.equal(h.window.LocalItabContentLifecycle.hasUncommittedWork(), false);
    assert.deepEqual(recordTexts(h), [[expression, '7']]); assert.equal(h.window.LocalItabContentLifecycle.reload(), true);
    assert.deepEqual(h.reloads, ['reload']); assert.deepEqual(h.calls, []); clean(h);
});

test('expression edit has English fallback labels and reuses existing wrapping and keyboard focus styles', () => {
    for (const translation of [undefined, { t: key => key }, { t: () => '' }]) {
        const h = mount(); h.window.i18n = translation; const current = h.remount(); current.calculate(' =3+4 '); current.expand();
        const control = expressionEdit(current); assert(control); assert.equal(control.textContent, 'Edit expression');
        assert.equal(current.use().textContent, 'Use result'); control.dispatch('click'); assert.equal(current.input.value, ' =3+4 '); clean(h);
    }
    const css = fs.readFileSync('newtab.css', 'utf8');
    assert.match(css, /\.search-calculator-recent-item\s*\{[^}]*flex-wrap:\s*wrap/);
    assert.match(css, /\.search-calculator-recent button\s*\{[^}]*max-width:\s*100%[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/);
    assert.match(css, /\.search-calculator-recent button:focus-visible\s*\{[^}]*outline:/);
});

// Clear-all focus regression: native activation is modeled explicitly here.
// These checks do not establish Chrome key synthesis, focus painting or IME behavior.
test('focused clear recent calculations returns to its summary after modeled Enter and Space in both locales', () => {
    for (const locale of ['en', 'zh_CN']) for (const key of ['Enter', ' ']) {
        const h = mount({ locale }); let evaluations = 0; const calculate = h.window.LocalItabCalculator.calculate;
        h.window.LocalItabCalculator = { calculate(text) { evaluations++; return calculate(text); } };
        h.calculate('=1+2'); h.expand(); h.input.setSelectionRange(1, 3);
        const result = h.value.value, status = h.status.textContent, feedback = h.feedback.textContent;
        h.clearRecent.focus(); assert.equal(h.document.activeElement, h.clearRecent);
        assert.equal(h.clearRecent.dispatch('keydown', { key }).prevented, false);
        assert.equal(h.rows().length, 1, 'keydown does not synthesize a click');
        if (key === ' ') assert.equal(h.clearRecent.dispatch('keyup', { key }).prevented, false);
        h.clearRecent.dispatch('click', { detail: 0 });
        assert.deepEqual(h.rows(), []); assert.equal(h.clearRecent.disabled, true); assert.equal(h.recentEmpty.hidden, false);
        assert.equal(h.recent.open, true); assert.equal(h.document.activeElement, h.recentSummary);
        assert.equal(h.input.value, '=1+2'); assert.equal(h.input.selectionStart, 1); assert.equal(h.input.selectionEnd, 3);
        assert.equal(h.value.value, result); assert.equal(h.row.hidden, false); assert.equal(h.status.textContent, status);
        assert.equal(h.feedback.textContent, feedback); assert.equal(evaluations, 1);
        assert.equal(h.window.LocalItabContentLifecycle.hasUncommittedWork(), true);
        assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); assert.deepEqual(h.reloads, []); clean(h);
    }
});

test('an unfocused clear control never takes focus from an input, result, outside control or body', () => {
    for (const destination of ['input', 'result', 'outside', 'body']) {
        const h = mount(); h.calculate('=6*7'); h.expand(); h.input.setSelectionRange(2, 4);
        const outside = h.document.createElement('button'); h.document.body.append(outside);
        const target = { input: h.input, result: h.copy, outside, body: h.document.body }[destination]; target.focus();
        h.clearRecent.dispatch('click', { detail: 1 });
        assert.deepEqual(h.rows(), []); assert.equal(h.document.activeElement, target, destination);
        assert.equal(h.input.value, '=6*7'); assert.equal(h.input.selectionStart, 2); assert.equal(h.input.selectionEnd, 4);
        assert.equal(h.value.value, '42'); assert.equal(h.row.hidden, false); assert.equal(h.recent.open, true);
        assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
    }
});

test('empty, repeated and composing clear activations neither remove records nor redirect focus', () => {
    const empty = mount(); empty.expand(); empty.input.focus();
    empty.clearRecent.dispatch('click', { detail: 0 });
    assert.deepEqual(empty.rows(), []); assert.equal(empty.document.activeElement, empty.input);
    assert.deepEqual(empty.calls, []); assert.deepEqual(empty.opens, []); clean(empty);
    for (const flags of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) {
        const h = mount(); h.calculate('=7'); h.expand(); h.clearRecent.focus();
        const records = recordTexts(h), status = h.status.textContent;
        assert.equal(h.clearRecent.dispatch('keydown', { key: 'Enter', ...flags }).prevented, true);
        h.clearRecent.dispatch('click', { detail: 0, ...flags });
        assert.deepEqual(recordTexts(h), records); assert.equal(h.document.activeElement, h.clearRecent);
        assert.equal(h.input.value, '=7'); assert.equal(h.value.value, '7'); assert.equal(h.status.textContent, status);
        assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
    }
    for (const selector of ['.search-input', '.search-custom-input']) {
        const h = mount(); h.calculate('=7'); h.expand(); const records = recordTexts(h);
        const composingInput = h.host.querySelector(selector); composingInput.dispatch('compositionstart'); h.clearRecent.focus();
        h.clearRecent.dispatch('click', { detail: 0 });
        assert.deepEqual(recordTexts(h), records); assert.equal(h.document.activeElement, h.clearRecent);
        assert.equal(h.input.value, '=7'); composingInput.dispatch('compositionend');
        assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
    }
});

test('clear focus recovery and newer typing survive late current-result and recent-copy success or failure', async () => {
    for (const source of ['current', 'recent']) for (const rejected of [false, true]) {
        const wait = deferred(), writes = [], h = mount({ clipboard: { writeText(text) { writes.push(text); return wait.promise; } } });
        h.calculate('=1+2'); h.expand();
        const oldRow = h.rows()[0], oldStatus = oldRow.querySelector('.search-calculator-recent-copy-status');
        const copy = source === 'current' ? h.copy : oldRow.querySelector('.search-calculator-recent-copy');
        copy.dispatch('click'); assert.deepEqual(writes, [source === 'current' ? '3' : '=1+2\n3']);
        h.clearRecent.focus(); h.clearRecent.dispatch('click', { detail: 0 });
        assert.deepEqual(h.rows(), []); assert.equal(h.document.activeElement, h.recentSummary);
        assert.equal(h.input.value, '=1+2'); assert.equal(h.value.value, '3'); assert.equal(h.row.hidden, false);
        assert.equal(h.copy.getAttribute('aria-disabled'), 'true', 'clear does not release an issued clipboard write');
        h.edit('new unfinished draft'); h.input.focus(); h.input.setSelectionRange(4, 7);
        if (rejected) wait.reject(new Error('late copy failure')); else wait.resolve(); await settle();
        assert.equal(h.document.activeElement, h.input); assert.equal(h.input.value, 'new unfinished draft');
        assert.equal(h.input.selectionStart, 4); assert.equal(h.input.selectionEnd, 7); assert.equal(h.value.value, '');
        assert.equal(h.row.hidden, true); assert.deepEqual(h.rows(), []); assert.equal(h.recent.open, true);
        assert.equal(h.feedback.hidden, true); assert.equal(h.feedback.textContent, '');
        assert.equal(oldStatus.hidden, true); assert.equal(oldStatus.textContent, '');
        assert.equal(h.copy.getAttribute('aria-disabled'), 'false'); assert.equal(writes.length, 1);
        assert.deepEqual(h.opens, []); assert.deepEqual(h.reloads, []); clean(h);
    }
});

test('clear redraw never reclaims focus after a newer focus, edit, submission or remount', () => {
    for (const change of ['focus', 'edit', 'edit-away-back', 'submit', 'calculate', 'remount']) {
        const h = mount(); h.calculate('=1+2'); h.expand(); h.clearRecent.focus();
        const outside = h.document.createElement('button'); h.document.body.append(outside);
        let current = h, interrupted = false, expected, focusCalls = 0;
        const focus = h.recentSummary.focus.bind(h.recentSummary);
        h.recentSummary.focus = () => { focusCalls++; focus(); };
        const replaceChildren = h.recentList.replaceChildren.bind(h.recentList);
        h.recentList.replaceChildren = (...children) => {
            replaceChildren(...children);
            if (interrupted) return;
            interrupted = true;
            if (change === 'focus') outside.focus();
            if (change === 'edit') h.edit('new unfinished draft');
            if (change === 'edit-away-back') { h.edit('temporary draft'); h.edit('=1+2'); }
            if (change === 'submit') h.submit();
            if (change === 'calculate') h.calculate('=9*9');
            if (change === 'remount') { current = h.remount(); current.edit('replacement draft'); current.input.focus(); }
            expected = { draft: current.input.value, value: current.value.value, status: current.status.textContent, records: recordTexts(current) };
        };
        h.clearRecent.dispatch('click', { detail: 0 });
        assert.equal(interrupted, true); assert.equal(focusCalls, 0, change);
        assert.equal(current.input.value, expected.draft); assert.equal(current.value.value, expected.value);
        assert.equal(current.status.textContent, expected.status); assert.deepEqual(recordTexts(current), expected.records);
        const target = change === 'focus' ? outside : change === 'remount' ? current.input :
            ['submit', 'calculate'].includes(change) ? h.clearRecent : h.document.body;
        assert.equal(h.document.activeElement, target, change);
        assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
    }
});

test('summary focus is the final clear side effect and leaves its newer input callback untouched', () => {
    const h = mount(); h.calculate('=1+2'); h.expand(); h.clearRecent.focus();
    const focus = h.recentSummary.focus.bind(h.recentSummary); let focusCalls = 0;
    h.recentSummary.focus = () => {
        focusCalls++; focus(); h.calculate('=8*8'); h.input.focus(); h.input.setSelectionRange(1, 4);
    };
    h.clearRecent.dispatch('click', { detail: 0 });
    assert.equal(focusCalls, 1); assert.equal(h.document.activeElement, h.input);
    assert.equal(h.input.value, '=8*8'); assert.equal(h.input.selectionStart, 1); assert.equal(h.input.selectionEnd, 4);
    assert.equal(h.value.value, '64'); assert.deepEqual(recordTexts(h), [['=8*8', '64']]);
    assert.equal(h.clearRecent.disabled, false); assert.equal(h.recent.open, true);
    assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
});

test('clear without another edit retains current-copy settlement but retires a removed recent-copy receipt', async () => {
    for (const source of ['current', 'recent']) for (const rejected of [false, true]) {
        const wait = deferred(), writes = [], h = mount({ clipboard: { writeText(text) { writes.push(text); return wait.promise; } } });
        h.calculate('=1+2'); h.expand(); h.input.setSelectionRange(1, 3);
        const oldRow = h.rows()[0], oldStatus = oldRow.querySelector('.search-calculator-recent-copy-status');
        const copy = source === 'current' ? h.copy : oldRow.querySelector('.search-calculator-recent-copy');
        copy.dispatch('click'); h.clearRecent.focus(); h.clearRecent.dispatch('click', { detail: 0 });
        assert.equal(h.document.activeElement, h.recentSummary); assert.deepEqual(h.rows(), []);
        assert.equal(h.copy.getAttribute('aria-disabled'), 'true'); h.copy.dispatch('click'); assert.equal(writes.length, 1);
        if (rejected) wait.reject(new Error('late copy failure')); else wait.resolve(); await settle();
        assert.equal(h.document.activeElement, h.recentSummary); assert.equal(h.recent.open, true);
        assert.equal(h.input.value, '=1+2'); assert.equal(h.input.selectionStart, 1); assert.equal(h.input.selectionEnd, 3);
        assert.equal(h.value.value, '3'); assert.equal(h.row.hidden, false); assert.deepEqual(h.rows(), []);
        assert.equal(h.copy.getAttribute('aria-disabled'), 'false'); assert.equal(writes.length, 1);
        if (source === 'current') {
            const key = rejected ? 'calculatorCopyFailure' : 'calculatorCopySuccess';
            assert.equal(h.feedback.hidden, false); assert.equal(h.feedback.textContent, h.messages[key].message);
            assert.equal(h.feedback.classList.contains('is-error'), rejected);
        } else { assert.equal(h.feedback.hidden, true); assert.equal(h.feedback.textContent, ''); }
        assert.equal(oldStatus.hidden, true); assert.equal(oldStatus.textContent, '');
        assert.deepEqual(h.opens, []); assert.deepEqual(h.reloads, []); clean(h);
    }
});
