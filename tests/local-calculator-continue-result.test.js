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
        return { input, form, value, useResult: host.querySelector('.search-calculator-use-result'), row: host.querySelector('.search-calculator-result'), output: host.querySelector('.search-calculator-output'), copy: host.querySelector('.search-calculator-copy'),
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

test('successful result offers a native Use result action outside the readonly label', () => {
    const h = mount(); h.calculate();
    assert(h.useResult, 'successful calculation needs a Use result button');
    assert.equal(h.useResult.tagName, 'BUTTON'); assert.equal(h.useResult.type, 'button'); assert.equal(h.useResult.tabIndex, 0);
    assert.equal(h.useResult.textContent, h.messages.calculatorUseResult.message);
    assert.equal(h.output.contains(h.useResult), false); assert.equal(h.useResult.parentElement, h.row);
    assert.equal(h.value.readOnly, true); assert.equal(h.row.hidden, false);
    assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
});

test('both locales reuse the exact complete number and calculate again only on explicit submit', () => {
    for (const locale of ['en', 'zh_CN']) {
        const h = mount({ locale }); let calculations = 0;
        const calculate = h.window.LocalItabCalculator.calculate;
        h.window.LocalItabCalculator = { calculate(expression) { calculations++; return calculate(expression); } };
        assert.equal(h.useResult.textContent, h.messages.calculatorUseResult.message);
        for (const [expression, expected, doubled] of [
            ['=0', '0', '0'], ['=-12', '-12', '-24'], ['=1/8', '0.125', '0.25'],
            ['=0.1+0.2', '0.30000000000000004', '0.6000000000000001'],
            ['=1000000000000000000000', '1e+21', '2e+21'], ['=1/10000000', '1e-7', '2e-7']
        ]) {
            h.calculate(expression); assert.equal(h.value.value, expected); const before = calculations;
            h.useResult.focus(); h.useResult.dispatch('click');
            assert.equal(h.input.value, `=${expected}`); assert.equal(calculations, before, 'continuation never recalculates');
            assert.equal(h.document.activeElement, h.input); assert.equal(h.input.selectionStart, h.input.value.length);
            assert.equal(h.input.selectionEnd, h.input.value.length); assert.equal(h.value.value, ''); assert.equal(h.output.hidden, true); assert.equal(h.row.hidden, true);
            assert.equal(h.status.textContent, h.messages.calculatorHint.message); assert.equal(h.feedback.hidden, true);
            assert.equal(h.searchStatus.textContent, ''); assert.equal(h.window.LocalItabContentLifecycle.hasUncommittedWork(), true);
            h.edit(h.input.value + '*2'); assert.equal(calculations, before, 'typing the next operation does not calculate');
            h.submit(); assert.equal(calculations, before + 1); assert.equal(h.value.value, doubled);
            assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); assert.deepEqual(h.reloads, []); clean(h);
        }
    }
});

test('no result, errors, ordinary search, editing, ABA, composition and clearing cannot reuse an old result', () => {
    const h = mount(); assert.equal(h.row.hidden, true);
    h.useResult.dispatch('click'); assert.equal(h.input.value, ''); assert.equal(h.document.activeElement, h.document.body);
    const interruptions = [
        h => h.edit('=7'), h => { h.edit('=7'); h.edit('=42/7'); }, h => h.edit(''),
        h => h.edit('ordinary unsent search'), h => h.calculate('=1/0'), h => h.calculate('=foo'),
        h => h.calculate('='), h => h.window.localCalculatorView.clearResult(),
        h => { h.input.dispatch('compositionstart'); h.input.dispatch('compositionend'); },
        h => { h.host.querySelector('.search-custom-input').value = 'https://example.com/?q=%s'; h.host.querySelector('.search-custom-input').dispatch('input'); }
    ];
    for (const interrupt of interruptions) {
        h.calculate(); interrupt(h); const before = h.input.value, status = h.status.textContent;
        h.input.focus(); const focus = h.document.activeElement;
        h.useResult.dispatch('click'); assert.equal(h.input.value, before); assert.equal(h.status.textContent, status);
        assert.equal(h.row.hidden, true); assert.equal(h.value.value, ''); assert.equal(h.document.activeElement, focus);
        assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
    }
});

test('the result snapshot rejects direct expression/result changes, and newer submissions win', () => {
    const h = mount(); h.calculate();
    h.input.value = '=9'; h.useResult.dispatch('click'); assert.equal(h.input.value, '=9');
    h.input.value = '=42/7'; h.value.value = '99'; h.useResult.dispatch('click'); assert.equal(h.input.value, '=42/7');
    h.calculate('=12/3'); h.useResult.dispatch('click'); assert.equal(h.input.value, '=4');
    h.edit('=2'); let nested = false;
    h.window.LocalItabCalculator = { calculate() { if (nested) return { value: 2 }; nested = true; h.submit(); return { value: 99 }; } };
    h.submit(); assert.equal(h.value.value, '2'); h.useResult.dispatch('click'); assert.equal(h.input.value, '=2');
    assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
});

test('repeated activation and detached old buttons cannot change the continued or remounted draft', () => {
    const h = mount(); h.calculate(); h.useResult.dispatch('click', { detail: 2 }); assert.equal(h.input.value, '=42/7');
    h.useResult.dispatch('click'); assert.equal(h.input.value, '=6');
    h.useResult.dispatch('click'); h.useResult.dispatch('click', { detail: 2 }); assert.equal(h.input.value, '=6');
    h.edit('=6+10'); h.useResult.dispatch('click'); assert.equal(h.input.value, '=6+10');
    h.calculate(); const current = h.remount(); current.calculate('=9'); current.input.focus();
    h.useResult.dispatch('click'); assert.equal(current.input.value, '=9'); assert.equal(current.value.value, '9');
    assert.equal(h.document.activeElement, current.input); assert.equal(h.row.hidden, true);
    current.useResult.dispatch('click'); assert.equal(current.input.value, '=9'); assert.equal(current.row.hidden, true);
    assert.deepEqual(h.calls, []); clean(h);
});

test('native Enter and Space are left available while repeat and IME activation are suppressed', () => {
    for (const key of ['Enter', ' ']) {
        const h = mount(); h.calculate(); h.useResult.focus();
        assert.equal(h.useResult.dispatch('keydown', { key }).prevented, false);
        assert.equal(h.input.value, '=42/7', 'the handler does not synthesize a click or submit');
        for (const flags of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) {
            assert(h.useResult.dispatch('keydown', { key, ...flags }).prevented);
            h.useResult.dispatch('click', flags); assert.equal(h.input.value, '=42/7');
        }
        h.useResult.dispatch('click', { detail: 0 }); assert.equal(h.input.value, '=6', 'native click path is shared');
        for (const selector of ['.search-input', '.search-custom-input']) {
            h.calculate(); const input = h.host.querySelector(selector); input.dispatch('compositionstart');
            assert(h.useResult.dispatch('keydown', { key }).prevented);
            h.useResult.dispatch('click'); assert.equal(h.input.value, '=42/7');
            input.dispatch('compositionend'); h.useResult.dispatch('click'); assert.equal(h.input.value, '=42/7', 'composition discarded the old result');
        }
        assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
    }
});

test('hidden, detached, disabled, readonly, inert and departing inputs or controls cannot continue', () => {
    const unavailable = [
        h => { h.host.hidden = true; }, h => { h.host.inert = true; }, h => h.host.setAttribute('aria-hidden', 'true'),
        h => { h.host.style.display = 'none'; }, h => { h.host.style.visibility = 'hidden'; }, h => { h.host.style.visibility = 'collapse'; },
        h => h.host.remove(), h => { h.document.hidden = true; }, h => { h.document.visibilityState = 'hidden'; },
        h => h.window.LocalItabContentLifecycle.allowDeparture(), h => { h.row.hidden = true; },
        h => { h.useResult.hidden = true; }, h => { h.useResult.inert = true; }, h => h.useResult.setAttribute('aria-hidden', 'true'),
        h => { h.useResult.style.display = 'none'; }, h => { h.useResult.style.visibility = 'hidden'; }, h => h.useResult.remove(),
        h => { h.input.hidden = true; }, h => { h.input.inert = true; }, h => h.input.setAttribute('aria-hidden', 'true'),
        h => { h.input.style.display = 'none'; }, h => { h.input.style.visibility = 'hidden'; }, h => { h.input.style.visibility = 'collapse'; },
        h => { h.input.disabled = true; }, h => { h.input.readOnly = true; }, h => h.input.remove(),
        h => { h.input.remove(); h.document.body.append(h.input); },
        h => { h.useResult.remove(); h.document.body.append(h.useResult); },
        h => { h.window.localCalculatorView = {}; },
        h => { const details = h.document.createElement('details'); h.host.remove(); details.append(h.host); h.document.body.append(details); }
    ];
    for (const [index, hide] of unavailable.entries()) {
        const h = mount(); h.calculate(); hide(h); const before = h.input.value, focus = h.document.activeElement;
        h.useResult.dispatch('click'); assert.equal(h.input.value, before, `unavailable scenario ${index}`);
        assert.equal(h.document.activeElement, focus); assert.equal(h.input.selectionStart, undefined);
        assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
    }
});

test('continuation depends on its own control and does not require a copy button or clipboard API', () => {
    for (const removeCopy of [false, true]) {
        const h = mount(); h.calculate();
        if (removeCopy) h.copy.remove(); else h.copy.hidden = true;
        Object.defineProperty(h.window.navigator, 'clipboard', { get() { h.io.push('clipboard getter'); throw new Error('No clipboard access'); } });
        h.useResult.dispatch('click'); assert.equal(h.input.value, '=6'); assert.equal(h.document.activeElement, h.input);
        assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
    }
});

test('focus-event edits, ABA, resubmission, composition, hiding and remounting cannot be overwritten', () => {
    const interruptions = [
        h => h.edit('=new draft'), h => { h.edit('=new draft'); h.edit('=42/7'); },
        h => { h.input.value = '=direct draft'; }, h => h.calculate('=9'), h => h.submit(),
        h => h.input.dispatch('compositionstart'), h => h.host.querySelector('.search-custom-input').dispatch('compositionstart'),
        h => h.window.localCalculatorView.clearResult(), h => { h.input.hidden = true; }, h => { h.input.disabled = true; },
        h => { h.input.readOnly = true; }, h => { h.useResult.hidden = true; }, h => h.useResult.remove(),
        h => h.input.remove(), h => h.host.remove(), h => h.window.LocalItabContentLifecycle.allowDeparture(),
        h => { h.document.activeElement = h.document.body; },
        h => { const next = h.remount(); next.edit('=replacement draft'); next.input.focus(); }
    ];
    for (const [index, interrupt] of interruptions.entries()) {
        const h = mount(); h.calculate(); h.useResult.focus(); let expected;
        const focus = h.input.focus.bind(h.input);
        h.input.focus = () => {
            focus(); interrupt(h);
            expected = { value: h.input.value, result: h.value.value, status: h.status.textContent, focus: h.document.activeElement };
            h.input.selectionStart = 1; h.input.selectionEnd = 2;
        };
        h.useResult.dispatch('click'); assert(expected);
        assert.equal(h.input.value, expected.value, `focus reentry ${index}`); assert.equal(h.value.value, expected.result);
        assert.equal(h.status.textContent, expected.status); assert.equal(h.document.activeElement, expected.focus);
        assert.equal(h.input.selectionStart, 1); assert.equal(h.input.selectionEnd, 2, 'stale continuation cannot move selection');
        assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
    }
});

test('pending copy is invalidated by continuation but its global lock survives until late settlement', async () => {
    for (const rejected of [false, true]) {
        for (const remount of [false, true]) {
            const wait = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } });
            h.calculate(); h.copy.dispatch('click'); assert.deepEqual(calls, ['6']); assert.equal(h.copy.getAttribute('aria-disabled'), 'true');
            assert.notEqual(h.useResult.getAttribute('aria-disabled'), 'true', 'continuation is not blocked by the copy lock');
            h.useResult.dispatch('click'); assert.equal(h.input.value, '=6'); assert.equal(h.feedback.hidden, true);
            assert.equal(h.feedback.textContent, ''); assert.equal(h.observers.size, 0); assert.equal(h.document.activeElement, h.input);
            let current = h;
            if (remount) current = h.remount();
            current.calculate('=6+3'); current.input.focus(); current.copy.dispatch('click');
            assert.equal(current.copy.getAttribute('aria-disabled'), 'true'); assert.deepEqual(calls, ['6']);
            const before = { input: current.input.value, result: current.value.value, status: current.status.textContent, focus: h.document.activeElement };
            if (rejected) wait.reject(new Error('late denial')); else wait.resolve();
            await settle(); assert.equal(current.copy.getAttribute('aria-disabled'), 'false');
            assert.equal(current.feedback.hidden, true); assert.equal(current.feedback.textContent, ''); assert.equal(h.feedback.hidden, true);
            assert.equal(current.input.value, before.input); assert.equal(current.value.value, before.result);
            assert.equal(current.status.textContent, before.status); assert.equal(h.document.activeElement, before.focus); clean(h);
            h.window.navigator.clipboard.writeText = value => { calls.push(value); return Promise.resolve(); };
            current.copy.dispatch('click'); await settle(); assert.deepEqual(calls, ['6', '9']); clean(h);
        }
    }
});

test('completed copy feedback is cleared without another write when using the result', async () => {
    for (const rejected of [false, true]) {
        let calls = 0;
        const h = mount({ clipboard: { writeText() { calls++; return rejected ? Promise.reject(new Error('denied')) : Promise.resolve(); } } });
        h.calculate(); h.copy.dispatch('click'); await settle(); assert.equal(h.feedback.hidden, false);
        h.useResult.dispatch('click'); assert.equal(h.input.value, '=6'); assert.equal(h.feedback.hidden, true);
        assert.equal(h.feedback.textContent, ''); assert.equal(h.feedback.classList.contains('is-error'), false); assert.equal(calls, 1); clean(h);
    }
});

test('continued input remains an unsaved draft and retains existing deferred reload/discard behavior', () => {
    const h = mount(); h.calculate(); h.useResult.dispatch('click'); h.edit(h.input.value + '+4');
    const lifecycle = h.window.LocalItabContentLifecycle;
    assert.equal(lifecycle.hasUncommittedWork(), true); assert.equal(lifecycle.reload(), false);
    assert.equal(h.input.value, '=6+4'); assert.deepEqual(h.reloads, []);
    const reload = h.document.querySelector('.local-content-reload-notice button'); reload.dispatch('click');
    assert.deepEqual(h.reloads, []); assert.equal(h.input.value, '=6+4');
    h.edit(''); assert.equal(lifecycle.hasUncommittedWork(), false); assert.equal(lifecycle.reload(), true);
    assert.deepEqual(h.reloads, ['reload']); assert.deepEqual(h.calls, []); assert.deepEqual(h.opens, []); clean(h);
});

test('missing translations fall back to Use result and existing wrapping/focus styles are shared only', () => {
    const h = mount(); h.window.i18n = { t: key => key }; const current = h.remount();
    assert.equal(current.useResult.textContent, 'Use result'); current.calculate(); current.useResult.dispatch('click'); assert.equal(current.input.value, '=6');
    const css = fs.readFileSync('newtab.css', 'utf8');
    assert.match(css, /\.search-calculator-use-result,\s*\.search-calculator-copy\s*\{[^}]*white-space:\s*normal[^}]*overflow-wrap:\s*anywhere/);
    assert.match(css, /\.search-calculator-use-result:focus-visible,\s*\.search-calculator-copy:focus-visible\s*\{[^}]*outline:/);
    assert.match(css, /\.search-calculator-result\s*\{[^}]*flex-wrap:\s*wrap/);
    assert.match(css, /\.search-calculator-copy\[aria-disabled="true"\]\s*\{[^}]*cursor:\s*wait/);
    assert.doesNotMatch(css, /\.search-calculator-use-result\[aria-disabled/); clean(h);
});
