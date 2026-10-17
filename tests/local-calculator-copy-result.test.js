const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

// Real search initializer, bounded DOM model and explicit clipboard/observer records.
// This does not claim native activation, clipboard contents or mutation timing.
function mount({ locale = 'en', clipboard } = {}) {
    const document = createDocument({ blurUnavailableFocus: true }), events = new Map(), observers = new Set();
    const calls = [], opens = [], io = [], host = document.createElement('section');
    host.id = 'search-container'; document.body.append(host);
    const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const forbidden = () => { io.push('forbidden'); throw new Error('Unexpected I/O'); };
    const window = {
        i18n: { t: key => messages[key]?.message || key },
        navigator: { clipboard: clipboard === undefined ? { writeText(text) { calls.push(text); return Promise.resolve(); }, readText: forbidden } : clipboard },
        addEventListener(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
        removeEventListener(type, fn) { events.get(type)?.delete(fn); },
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
        value.select = () => { value.selectionStart = 0; value.selectionEnd = value.value.length; };
        return { input, form, value, output: host.querySelector('.search-calculator-output'), copy: host.querySelector('.search-calculator-copy'),
            feedback: host.querySelector('.search-calculator-copy-status'), status: host.querySelector('.search-calculator-status'), searchStatus: host.querySelector('.search-open-status'),
            edit(text) { input.value = text; input.dispatch('input'); },
            submit() { const event = form.dispatch('submit'); assert(event.prevented); },
            calculate(text = '=42/7') { this.edit(text); this.submit(); },
            focusResult() { value.focus(); value.dispatch('focus'); } };
    };
    context.initializeSearchComponent({});
    return { ...controls(), window, document, context, host, calls, opens, io, messages, events, observers,
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

test('copy control exists outside the result label', () => {
    const h = mount(); h.calculate();
    assert(h.copy, 'successful calculation needs a Copy result button');
    assert.equal(h.copy.tagName, 'BUTTON'); assert.equal(h.copy.type, 'button'); assert.equal(h.copy.tabIndex, 0);
    assert.equal(h.copy.textContent, h.messages.calculatorCopyAction.message);
    assert.equal(h.output.contains(h.copy), false); assert.equal(h.value.parentElement, h.output);
    assert.equal(h.value.readOnly, true); assert.equal(h.feedback.getAttribute('role'), 'status');
    assert.equal(h.feedback.getAttribute('aria-live'), 'polite'); assert.equal(h.feedback.hidden, true);
    assert.deepEqual(h.calls, []); clean(h);
});

test('only an explicit click copies each full numeric string, with both locales and manual copy intact', async () => {
    for (const locale of ['en', 'zh_CN']) {
        const h = mount({ locale }); let calculations = 0;
        const calculate = h.window.LocalItabCalculator.calculate;
        h.window.LocalItabCalculator = { calculate(expression) { calculations++; return calculate(expression); } };
        for (const [expression, expected] of [['=0', '0'], ['=-12', '-12'], ['=1/8', '0.125'], ['=0.1+0.2', '0.30000000000000004'], ['=1e21', '1e+21'], ['=1e-7', '1e-7']]) {
            const before = h.calls.length;
            h.input.focus(); h.calculate(expression); assert.equal(h.document.activeElement, h.input);
            assert.equal(h.value.value, expected); assert.equal(h.calls.length, before);
            h.focusResult(); assert.equal(h.value.value.slice(h.value.selectionStart, h.value.selectionEnd), expected);
            for (const fields of [{ key: 'c', ctrlKey: true }, { key: 'c', metaKey: true }, { key: 'a', ctrlKey: true }]) assert.equal(h.value.dispatch('keydown', fields).prevented, false);
            assert(h.value.dispatch('keydown', { key: 'Enter' }).prevented);
            assert.equal(h.calls.length, before, 'calculation, selection and keyboard copy never call clipboard API');
            const count = calculations, status = h.status.textContent, searchStatus = h.searchStatus.textContent;
            h.copy.focus(); h.copy.dispatch('click');
            assert.equal(h.calls.length, before + 1, 'one synchronous call within explicit activation');
            assert.equal(h.calls.at(-1), expected); assert.equal(calculations, count, 'copy does not recalculate');
            assert.equal(h.feedback.textContent, h.messages.calculatorCopying.message);
            await settle(); assert.equal(h.feedback.textContent, h.messages.calculatorCopySuccess.message);
            assert.equal(h.copy.getAttribute('aria-disabled'), 'false'); assert.equal(h.document.activeElement, h.copy);
            assert.equal(h.input.value, expression); assert.equal(h.value.value, expected);
            assert.equal(h.status.textContent, status); assert.equal(h.searchStatus.textContent, searchStatus); clean(h);
        }
        const count = h.calls.length; h.edit('ordinary search'); h.submit(); assert.equal(h.opens.length, 1);
        h.copy.dispatch('click'); await settle(); assert.equal(h.calls.length, count); clean(h);
    }
});

test('missing API, synchronous throw and rejection preserve selectable output, local statuses and explicit retry', async () => {
    for (const failure of ['missing', 'throw', 'reject']) {
        let attempts = 0;
        const h = mount({ clipboard: failure === 'missing' ? null : { writeText() { attempts++; if (failure === 'throw') throw new Error('private error'); return Promise.reject(new Error('private rejection')); } } });
        h.calculate(); h.copy.focus();
        const calculation = h.status.textContent, search = h.searchStatus.textContent;
        h.copy.dispatch('click'); await settle();
        assert.equal(h.feedback.textContent, h.messages.calculatorCopyFailure.message); assert(h.feedback.classList.contains('is-error'));
        assert.equal(attempts, failure === 'missing' ? 0 : 1); assert.equal(h.document.activeElement, h.copy);
        assert.equal(h.status.textContent, calculation); assert.equal(h.searchStatus.textContent, search);
        assert.equal(h.input.value, '=42/7'); assert.equal(h.value.value, '6');
        h.focusResult(); assert.equal(h.value.selectionEnd, 1); assert.equal(h.value.dispatch('keydown', { key: 'c', ctrlKey: true }).prevented, false);
        await settle(); assert.equal(attempts, failure === 'missing' ? 0 : 1, 'no automatic retry'); clean(h);
        h.window.navigator.clipboard = { writeText(text) { attempts++; assert.equal(text, '6'); return Promise.resolve(); } };
        h.copy.focus(); h.copy.dispatch('click'); await settle();
        assert.equal(h.feedback.textContent, h.messages.calculatorCopySuccess.message); assert.equal(h.feedback.classList.contains('is-error'), false); clean(h);
    }
});

test('one unresolved write guards repeated activation without blurring the focused button', async () => {
    const wait = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } });
    h.calculate(); h.copy.focus(); h.copy.dispatch('click');
    assert.equal(calls.length, 1); assert.equal(h.copy.getAttribute('aria-disabled'), 'true'); assert.equal(h.observers.size, 1);
    assert.equal(h.events.get('pagehide').size, 1); assert.equal(h.events.get('blur').size, 1);
    h.copy.dispatch('click'); h.copy.dispatch('click', { detail: 2 });
    for (const key of ['Enter', ' ']) {
        for (const flags of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) assert(h.copy.dispatch('keydown', { key, ...flags }).prevented);
        assert.equal(h.copy.dispatch('keydown', { key }).prevented, false, 'ordinary native button activation remains available');
    }
    assert.equal(calls.length, 1); assert.equal(h.document.activeElement, h.copy);
    wait.reject(new Error('denied')); await settle(); assert.equal(h.feedback.textContent, h.messages.calculatorCopyFailure.message); clean(h);
    h.window.navigator.clipboard.writeText = text => { calls.push(text); return Promise.resolve(); };
    h.copy.dispatch('click', { detail: 2 }); assert.equal(calls.length, 1, 'double-click tail is not another request');
    h.copy.dispatch('click'); await settle(); assert.deepEqual(calls, ['6', '6']); clean(h);
});

test('new input, submissions, IME, search, errors and clearing permanently invalidate old receipts', async () => {
    const interruptions = [
        h => h.edit('=7'),
        h => { h.edit('=7'); h.edit('=42/7'); },
        h => h.submit(),
        h => h.calculate('=12/2'),
        h => { h.input.dispatch('compositionstart'); h.input.dispatch('compositionend'); },
        h => { h.edit('ordinary search'); h.submit(); },
        h => h.calculate('=1/0'),
        h => h.window.localCalculatorView.clearResult()
    ];
    for (const [index, interrupt] of interruptions.entries()) {
        const wait = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } });
        h.calculate(); h.copy.dispatch('click'); interrupt(h);
        const value = h.value.value, expression = h.input.value, status = h.status.textContent, searchStatus = h.searchStatus.textContent;
        h.input.focus(); const focus = h.document.activeElement;
        h.copy.dispatch('click'); assert.equal(calls.length, 1, 'invalidating UI does not unlock a pending write');
        assert.equal(h.observers.size, 0, 'invalidated attempt releases observer immediately');
        if (index % 2) wait.reject(new Error('late denial')); else wait.resolve();
        await settle(); assert.equal(h.feedback.hidden, true); assert.equal(h.feedback.textContent, '');
        assert.equal(h.value.value, value); assert.equal(h.input.value, expression); assert.equal(h.status.textContent, status); assert.equal(h.searchStatus.textContent, searchStatus);
        assert.equal(h.document.activeElement, focus); assert.equal(h.copy.getAttribute('aria-disabled'), 'false'); clean(h);
    }
});

test('pending lock survives several remounts; settlement enables the current owner without its old receipt', async () => {
    for (const rejected of [false, true]) {
        const wait = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } });
        h.calculate(); h.copy.dispatch('click'); const old = h.copy;
        let current;
        for (let count = 0; count < 3; count++) {
            current = h.remount(); current.calculate('=9');
            assert.equal(current.copy.getAttribute('aria-disabled'), 'true'); current.copy.dispatch('click'); old.dispatch('click');
            assert.deepEqual(calls, ['6']); assert.equal(h.observers.size, 0); assert.equal(h.events.get('pagehide').size, 0);
        }
        current.input.focus();
        if (rejected) wait.reject(new Error('old request')); else wait.resolve();
        await settle(); assert.equal(current.copy.getAttribute('aria-disabled'), 'false');
        assert.equal(current.feedback.hidden, true); assert.equal(h.feedback.hidden, true); assert.equal(h.document.activeElement, current.input);
        h.window.navigator.clipboard.writeText = text => { calls.push(text); return Promise.resolve(); };
        current.copy.dispatch('click'); await settle(); assert.deepEqual(calls, ['6', '9']);
        assert.equal(current.feedback.textContent, h.messages.calculatorCopySuccess.message); clean(h);
    }
});

test('hidden, inert, aria-hidden, CSS-hidden, detached and departing contexts cannot start a write', async () => {
    const unavailable = [
        h => { h.host.hidden = true; }, h => { h.host.inert = true; }, h => h.host.setAttribute('aria-hidden', 'true'),
        h => { h.host.style.visibility = 'hidden'; }, h => { h.host.style.visibility = 'collapse'; }, h => { h.host.style.display = 'none'; },
        h => h.host.remove(), h => { h.document.hidden = true; }, h => { h.document.visibilityState = 'hidden'; },
        h => h.window.LocalItabContentLifecycle.allowDeparture()
    ];
    for (const hide of unavailable) {
        const h = mount(); h.calculate(); hide(h); h.copy.dispatch('click'); await settle();
        assert.deepEqual(h.calls, []); assert.equal(h.feedback.hidden, true); clean(h);
    }
});

test('transient ancestor changes and detach-return invalidate delivered and queued observer records', async () => {
    for (const [index, attribute] of ['hidden', 'inert', 'aria-hidden', 'style', 'class', 'detach'].entries()) {
        const wait = deferred(), h = mount({ clipboard: { writeText() { return wait.promise; } } });
        h.calculate(); h.copy.dispatch('click'); let record;
        if (attribute === 'detach') {
            h.host.remove(); h.document.body.append(h.host);
            record = { type: 'childList', target: h.document.body, removedNodes: [h.host] };
        } else {
            if (attribute === 'hidden' || attribute === 'inert') { h.host[attribute] = true; h.host[attribute] = false; }
            else if (attribute === 'aria-hidden') { h.host.setAttribute(attribute, 'true'); h.host.setAttribute(attribute, 'false'); }
            else if (attribute === 'style') { h.host.style.visibility = 'hidden'; h.host.style.visibility = 'visible'; }
            else { h.host.classList.add('module-hidden'); h.host.classList.remove('module-hidden'); }
            record = { type: 'attributes', target: h.host, attributeName: attribute };
        }
        h.mutations([record], index % 2 === 0);
        wait.resolve(); await settle(); assert.equal(h.feedback.hidden, true); assert.equal(h.feedback.textContent, '');
        assert.equal(h.value.value, '6'); clean(h);
    }
});

test('visibility, blur and pagehide suppress late outcomes and remove only attempt listeners', async () => {
    for (const type of ['visibilitychange', 'blur', 'pagehide']) {
        const wait = deferred(), h = mount({ clipboard: { writeText() { return wait.promise; } } });
        h.calculate(); h.copy.dispatch('click');
        if (type === 'visibilitychange') { h.document.hidden = true; await h.document.listeners.get(type)(); h.document.hidden = false; }
        else h.emit(type);
        assert.equal(h.observers.size, 0); h.input.focus();
        wait.reject(new Error('after departure')); await settle();
        assert.equal(h.feedback.hidden, true); assert.equal(h.document.activeElement, h.input); assert.equal(h.value.value, '6');
        assert.equal(h.events.get('beforeunload').size, 1, 'existing lifecycle listener remains singular'); clean(h);
    }
});

test('synchronous clipboard reentry cannot publish old feedback or release a newer owner early', async () => {
    const wait = deferred(), calls = []; let h, current;
    h = mount({ clipboard: { writeText(text) { calls.push(text); current = h.remount(); current.calculate('=8'); current.copy.dispatch('click'); return wait.promise; } } });
    h.calculate(); h.copy.dispatch('click'); assert.deepEqual(calls, ['6']); assert.equal(current.copy.getAttribute('aria-disabled'), 'true');
    wait.resolve(); await settle(); assert.equal(current.feedback.hidden, true); assert.equal(current.copy.getAttribute('aria-disabled'), 'false'); clean(h);
});

test('result snapshot rejects direct text changes and a reentrant older submission', async () => {
    const h = mount(); h.calculate(); h.value.value = '999'; h.copy.dispatch('click'); assert.deepEqual(h.calls, []);
    h.value.value = '6'; h.input.value = '=9'; h.copy.dispatch('click'); assert.deepEqual(h.calls, []);
    h.edit('=2'); let nested = false;
    h.window.LocalItabCalculator = { calculate() { if (nested) return { value: 2 }; nested = true; h.submit(); return { value: 99 }; } };
    h.submit(); assert.equal(h.value.value, '2'); h.copy.dispatch('click'); assert.deepEqual(h.calls, ['2']); await settle(); clean(h);
});

test('copy layout wraps independently and preserves explicit hidden/focus styles', () => {
    const css = fs.readFileSync('newtab.css', 'utf8');
    assert.match(css, /\.search-calculator-result\s*\{[^}]*grid-column:\s*1\s*\/\s*-1[^}]*flex-wrap:\s*wrap[^}]*min-width:\s*0/);
    assert.match(css, /\.search-calculator-result\[hidden\][^{]*\{\s*display:\s*none/);
    assert.match(css, /\.search-calculator-copy:focus-visible\s*\{[^}]*outline:/);
    assert.match(css, /\.search-calculator-copy-status\.is-error\s*\{[^}]*var\(--template-error,/);
});
