'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const read = name => fs.readFileSync(name, 'utf8');
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

// Shipped ClockComponent + MonthCalendar. This bounded DOM/event/clipboard model
// is synthetic: it does not prove Chrome activation, native IME/layout/AT or the
// OS clipboard. Queued records also probe transient changes before settlement.
function mount({ locale = 'en', clipboard } = {}) {
    const document = createDocument({ blurUnavailableFocus: true }); document.hidden = false;
    const events = new Map(), observers = new Set(), calls = [], io = [], timers = new Map();
    let messages = locale ? JSON.parse(read(`_locales/${locale}/messages.json`)) : {};
    let timerCreations = 0, calculations = 0, stamp = Date.parse('2026-10-17T12:00:00Z');
    const forbidden = () => { io.push('forbidden'); throw Error('Unexpected I/O or new timer'); };
    const queue = record => { for (const observer of observers) if (record.type !== 'attributes' || observer.options.attributeFilter.includes(record.attributeName)) observer.records.push(record); };
    const proto = Object.getPrototypeOf(document.body);
    for (const property of ['textContent', 'hidden']) {
        const descriptor = Object.getOwnPropertyDescriptor(proto, property);
        Object.defineProperty(proto, property, { ...descriptor, set(value) {
            descriptor.set.call(this, value);
            queue({ type: property === 'hidden' ? 'attributes' : 'childList', target: this, attributeName: property, removedNodes: [] });
        } });
    }
    Object.defineProperty(proto, 'open', { configurable: true, get() { return this._open || false; }, set(value) {
        const old = this._open; this._open = value;
        if (old !== value) queue({ type: 'attributes', target: this, attributeName: 'open' });
    } });
    const setAttribute = proto.setAttribute;
    proto.setAttribute = function(name, value) { setAttribute.call(this, name, value); queue({ type: 'attributes', target: this, attributeName: name }); };
    const remove = proto.remove;
    proto.remove = function() { const parent = this.parentElement; remove.call(this); if (parent) queue({ type: 'childList', target: parent, removedNodes: [this] }); };
    const window = {
        i18n: { t: key => messages[key]?.message || key }, LocalItabContentLifecycle: { departing: false },
        navigator: { language: 'en-US', clipboard: clipboard === undefined ? { writeText(text) { calls.push(text); return Promise.resolve(); }, readText: forbidden } : clipboard, permissions: { query: forbidden } },
        addEventListener(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
        removeEventListener(type, fn) { events.get(type)?.delete(fn); },
        getComputedStyle(node) { return { visibility: node.style.visibility || 'visible', display: node.style.display || 'block' }; },
        MutationObserver: class {
            constructor(callback) { this.callback = callback; this.records = []; }
            observe(node, options) { this.options = options; observers.add(this); }
            disconnect() { observers.delete(this); this.records = []; }
            takeRecords() { const records = this.records; this.records = []; return records; }
        }
    };
    const host = document.createElement('section'), display = document.createElement('div'), date = document.createElement('div');
    host.id = 'clock-container'; display.className = 'clock-display'; date.id = 'date-display'; display.append(date); host.append(display); document.body.append(host);
    document.execCommand = forbidden;
    class ControlledDate extends Date { constructor(...args) { super(...(args.length ? args : [stamp])); } static now() { return stamp; } }
    const context = vm.createContext({ document, window, navigator: window.navigator, Date: ControlledDate, Intl, console,
        chrome: { i18n: { getMessage: key => messages[key]?.message || '' }, storage: new Proxy({}, { get: forbidden }) },
        fetch: forbidden, XMLHttpRequest: forbidden, localStorage: new Proxy({}, { get: forbidden }), setTimeout: forbidden,
        setInterval(fn, delay) { assert.equal(delay, 1000); timers.set(++timerCreations, fn); return timerCreations; }, clearInterval(id) { timers.delete(id); }
    });
    vm.runInContext(read('shared/month-calendar.js'), context);
    const calendar = window.MonthCalendar;
    window.MonthCalendar = { ...calendar, dateInterval(...args) { calculations++; return calendar.dateInterval(...args); } };
    vm.runInContext(read('newtab.js') + '\nthis.ClockComponent = ClockComponent;', context);
    let clock = new context.ClockComponent({ hour12: false, showSeconds: false });
    const register = () => { context.instance = clock; vm.runInContext('clockComponentInstance = instance;', context); };
    register(); clock.updateDisplay();
    return { document, window, context, host, display, events, observers, calls, io, timers,
        get clock() { return clock; }, get view() { return clock.monthCalendar; }, get x() { return this.view.interval; },
        get messages() { return messages; }, get timerCreations() { return timerCreations; }, get calculations() { return calculations; },
        open() { this.view.details.open = true; this.view.details.dispatch('toggle'); this.x.details.open = true; this.x.details.dispatch('toggle'); },
        calculate(start = '2024-02-28', end = '2024-02-29') { if (!this.view.details.open) this.open(); this.x.start.value = start; this.x.end.value = end; this.x.calculate.dispatch('click'); return this.x.result.textContent; },
        locale(next) { messages = next ? JSON.parse(read(`_locales/${next}/messages.json`)) : {}; },
        tick() { clock.updateDisplay(); }, at(iso) { stamp = Date.parse(iso); },
        emit(type) { for (const fn of [...(events.get(type) || [])]) fn(); },
        mutations(records, queued = false) { for (const observer of [...observers]) if (queued) observer.records.push(...records); else observer.callback(records); },
        flush() { for (const observer of [...observers]) { const records = observer.takeRecords().filter(record => record.type !== 'attributes' || observer.options.attributeFilter.includes(record.attributeName)); if (records.length) observer.callback(records); } },
        rebuild() { clock.createMonthCalendar(); clock.updateDisplay(); },
        remount() { clock.stop(); clock = new context.ClockComponent({ ...clock.config }); register(); clock.updateDisplay(); }
    };
}
function control(h) { assert(h.x.copy, 'Date interval needs an explicit Copy result button'); return h.x.copy; }
function clean(h, started = false) {
    h.clock.closeMonthCalendar();
    assert.equal(h.observers.size, 0, 'feedback observer cleaned');
    assert.equal(h.events.get('pagehide')?.size || 0, 0);
    assert.equal(h.events.get('blur')?.size || 0, started ? 1 : 0);
    assert.equal(h.document.listeners.has('visibilitychange'), started);
    assert.deepEqual(h.io, []);
}

// A dedicated copy of the existing mount fixture above uses the unchanged shared
// DOM model and shipped initializer. No earlier test or shared helper is edited.
function clearControl(h) { assert(h.x.clear, 'Date interval needs an explicit Clear dates button'); return h.x.clear; }
function snapshot(h, x = h.x) {
    return { start: x.start.value, end: x.end.value, invalid: x.invalid, result: x.resultValue,
        rendered: x.renderedResult, error: x.error.textContent, errorHidden: x.error.hidden,
        text: x.result.textContent, copyText: x.copyStatus.textContent, copyHidden: x.copyStatus.hidden,
        copyDisabled: x.copy.getAttribute('aria-disabled'), calculations: h.calculations };
}
function assertCleared(h) {
    assert.equal(h.x.start.value, ''); assert.equal(h.x.end.value, '');
    assert.equal(h.x.invalid, false); assert.equal(h.x.resultValue, null); assert.equal(h.x.renderedResult, null);
    assert.equal(h.x.error.hidden, true); assert.equal(h.x.error.textContent, ''); assert.equal(h.x.result.textContent, '');
    assert.equal(h.x.start.getAttribute('aria-invalid'), 'false'); assert.equal(h.x.end.getAttribute('aria-invalid'), 'false');
    assert.equal(h.x.copyStatus.hidden, true); assert.equal(h.x.copyStatus.textContent, '');
    assert.equal(h.x.copyStatus.classList.contains('is-error'), false); assert.equal(h.x.copy.getAttribute('aria-disabled'), 'true');
}

test('Clear dates is a stable localized native button with fallback, no render-time edit and existing wrapping/focus styles', () => {
    for (const locale of ['en', 'zh_CN', null]) {
        const h = mount({ locale }), clear = clearControl(h); h.open(); h.tick();
        assert.equal(clear.tagName, 'BUTTON'); assert.equal(clear.type, 'button'); assert.equal(clear.tabIndex, 0);
        assert.equal(clear.textContent, locale === 'zh_CN' ? '清空日期' : 'Clear dates'); assert.notEqual(clear.disabled, true);
        assert.equal(clear.parentElement, h.x.fields); assert.equal(clear.closest('label'), null);
        assert.equal(h.x.start.value, ''); assert.equal(h.x.end.value, ''); assert.equal(h.calculations, 0);
        assert.deepEqual(h.calls, []); assert.equal(h.observers.size, 0); assert.equal(h.timerCreations, 0); clean(h);
    }
    const css = read('local-month-calendar.css');
    assert.match(css, /\.month-calendar-interval-fields \{[^}]*flex-wrap: wrap;/);
    assert.match(css, /\.month-calendar-interval button \{[^}]*min-width: 0;[^}]*overflow-wrap: anywhere;/);
    assert.match(css, /\.month-calendar :is\(summary, button, input, select\):focus-visible \{[^}]*outline:/);
});

test('Clear dates empties valid, malformed, whitespace, CRLF, Unicode and empty raw drafts without parsing, navigation or reading a date', () => {
    for (const [start, end] of [['0001-01-01', '9999-12-31'], ['0099-12-31', '0100-01-01'], ['2000-02-29', '2000-02-29'],
        ['', ''], ['', '1900-02-29'], ['2024-01-01 ', ' 2024-02-29'], [' \t\r\n ', '\t'],
        ['２０２４-01-01', '2024-1-1'], ['10000-01-01', '<img src=x onerror=alert(1)>']]) {
        const h = mount(); h.open(); h.x.start.value = start; h.x.end.value = end;
        const clear = clearControl(h), calendar = h.window.MonthCalendar, DateClass = h.context.Date;
        const forbidden = () => { throw Error('Clear must not parse, calculate, navigate or read the device clock'); };
        h.window.MonthCalendar = Object.fromEntries(Object.keys(calendar).map(key => [key, forbidden]));
        h.context.Date = new Proxy(DateClass, { construct: forbidden, apply: forbidden, get: forbidden });
        clear.focus(); clear.dispatch('click'); assertCleared(h); assert.equal(h.document.activeElement, clear);
        assert.equal(h.view.details.open, true); assert.equal(h.x.details.open, true);
        assert.equal(h.calculations, 0); assert.deepEqual(h.calls, []); assert.equal(h.timerCreations, 0);
        h.window.MonthCalendar = calendar; h.context.Date = DateClass; clean(h);
    }
});

test('Clear dates retires successful or invalid interval state while preserving month identity, independent drafts/errors, disclosures and focus', () => {
    for (const [start, end] of [['2024-02-28', '2024-02-29'], ['2024-02-29', '2024-02-29'], ['1900-02-29', '']]) {
        for (const focusName of ['clear', 'year', 'start', 'end', 'outside']) {
            const h = mount(); h.calculate(start, end); h.view.previous.dispatch('click');
            h.view.year.value = '10000'; h.view.month.value = '3'; h.view.jump.dispatch('click');
            const month = h.clock.calendarMonth, rows = h.view.body.children, caption = h.view.caption.textContent,
                error = h.view.error.textContent, announcement = h.view.announcement.textContent, calculations = h.calculations;
            const outside = h.document.createElement('input'); h.document.body.append(outside);
            const focus = focusName === 'outside' ? outside : focusName === 'year' ? h.view.year : h.x[focusName];
            h.view.year.selectionStart = 1; h.view.year.selectionEnd = 3; focus.focus(); clearControl(h).dispatch('click');
            assertCleared(h); assert.equal(h.clock.calendarMonth, month); assert.equal(h.view.body.children, rows);
            assert.equal(h.view.caption.textContent, caption); assert.equal(h.view.year.value, '10000'); assert.equal(h.view.month.value, '3');
            assert.equal(h.view.error.textContent, error); assert.equal(h.view.error.hidden, false);
            assert.equal(h.view.year.getAttribute('aria-invalid'), 'true'); assert.equal(h.view.announcement.textContent, announcement);
            assert.equal(h.view.year.selectionStart, 1); assert.equal(h.view.year.selectionEnd, 3);
            assert.equal(h.view.details.open, true); assert.equal(h.x.details.open, true);
            assert.equal(h.calculations, calculations); assert.equal(h.document.activeElement, focus); clean(h);
        }
    }
});

test('already-empty drafts still clear old invalid state, result and settled copy success/failure without early-returning', async () => {
    for (const state of ['invalid', 'result', 'success', 'failure']) {
        const h = mount({ clipboard: { writeText() { return state === 'failure' ? Promise.reject(Error('synthetic denial')) : Promise.resolve(); } } });
        h.calculate(state === 'invalid' ? '1900-02-29' : '2024-02-28', '2024-02-29');
        if (['success', 'failure'].includes(state)) { h.x.copy.dispatch('click'); await settle(); assert.equal(h.x.copyStatus.hidden, false); }
        h.x.start.value = ''; h.x.end.value = ''; const calculations = h.calculations;
        clearControl(h).dispatch('click'); assertCleared(h); assert.equal(h.calculations, calculations);
        assert.equal(h.observers.size, 0); assert.equal(h.view.details.open, true); assert.equal(h.x.details.open, true); clean(h);
    }
});

test('handled, composing, repeated, IME229 and double-click continuation activations leave interval state unchanged', () => {
    const h = mount(); h.calculate(); const clear = clearControl(h), before = snapshot(h);
    for (const flags of [{ defaultPrevented: true }, { detail: 2 }, { detail: 3 }, { repeat: true }, { isComposing: true }, { keyCode: 229 }]) {
        clear.dispatch('click', flags); assert.deepEqual(snapshot(h), before);
    }
    clear.dispatch('click', { detail: 1 }); assertCleared(h);
    h.x.start.value = 'new draft'; h.x.end.value = 'peer draft';
    clear.dispatch('click', { detail: 2 }); assert.equal(h.x.start.value, 'new draft'); assert.equal(h.x.end.value, 'peer draft');
    clear.dispatch('click', { detail: 1 }); assertCleared(h); assert.equal(h.calculations, 1); clean(h);
});

test('fresh Enter and Space retain native activation and held/composing keydowns do not activate or add keyboard routing', () => {
    const h = mount(); h.calculate(); const clear = clearControl(h), before = snapshot(h);
    for (const key of ['Enter', ' ']) {
        for (const flags of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) {
            assert.equal(clear.dispatch('keydown', { key, ...flags }).prevented, true); assert.deepEqual(snapshot(h), before);
        }
        assert.equal(clear.dispatch('keydown', { key }).prevented, false); assert.deepEqual(snapshot(h), before);
        assert.equal(clear.dispatch('keyup', { key }).prevented, false); assert.deepEqual(snapshot(h), before);
    }
    assert.equal(clear.dispatch('keydown', { key: 'c', ctrlKey: true }).prevented, false);
    assert.equal(h.context.shouldToggleFromEvent({ target: clear }), false);
    assert.equal(h.document.listeners.has('keydown'), false); assert.equal(h.events.has('keydown'), false);
    // The bounded model cannot synthesize the browser's trusted activation.
    clear.focus(); clear.dispatch('click', { detail: 0 }); assertCleared(h); assert.equal(h.document.activeElement, clear); clean(h);
});

test('either date field or the year field composing blocks clear without disturbing composition completion', () => {
    for (const name of ['year', 'start', 'end']) {
        const h = mount(); h.calculate(); const clear = clearControl(h), field = name === 'year' ? h.view.year : h.x[name];
        field.dispatch('compositionstart'); const before = snapshot(h);
        for (const key of ['Enter', ' ']) assert.equal(clear.dispatch('keydown', { key }).prevented, true);
        clear.dispatch('click'); assert.deepEqual(snapshot(h), before);
        field.dispatch('compositionend'); field.dispatch('keyup', { key: 'Enter' });
        clear.dispatch('click'); assertCleared(h); clean(h);
    }
});

test('Clear dates requires current visible open calendar and interval, lifecycle, and enabled connected endpoints/button', () => {
    const unavailable = [h => { h.x.details.open = false; }, h => { h.view.details.open = false; }, h => { h.clock.enabled = false; },
        h => { h.document.hidden = true; }, h => { h.document.visibilityState = 'hidden'; }, h => { h.window.LocalItabContentLifecycle.departing = true; },
        h => { h.document.body.classList.add('dashboard-hidden'); }, h => h.host.remove(), h => { h.host.hidden = true; },
        h => { h.host.inert = true; }, h => h.host.setAttribute('aria-hidden', 'true'), h => { h.host.style.display = 'none'; },
        h => { h.host.style.visibility = 'hidden'; }, h => { h.host.style.visibility = 'collapse'; },
        h => { h.x.fields.hidden = true; }, h => { h.view.panel.inert = true; }];
    for (const key of ['clear', 'start', 'end']) for (const change of [node => { node.hidden = true; }, node => { node.disabled = true; },
        node => { node.inert = true; }, node => node.setAttribute('aria-hidden', 'true'), node => { node.style.display = 'none'; },
        node => { node.style.visibility = 'hidden'; }, node => { node.style.visibility = 'collapse'; }, node => node.remove(),
        node => { node.getClientRects = () => []; }]) unavailable.push(h => change(h.x[key]));
    for (const change of unavailable) {
        const h = mount(); h.calculate(); const clear = clearControl(h); change(h);
        const before = snapshot(h), focus = h.document.activeElement; clear.dispatch('click');
        assert.deepEqual(snapshot(h), before); assert.equal(h.document.activeElement, focus); assert.deepEqual(h.calls, []); clean(h);
    }
});

test('old clear callbacks reject same-view replacement button or field references even if original and replacement nodes stay connected', () => {
    for (const name of ['clear', 'start', 'end']) for (const detachOriginal of [false, true]) {
        const h = mount(); h.calculate(); const clear = clearControl(h), original = h.x[name], parent = original.parentElement;
        const replacement = h.document.createElement(original.tagName); replacement.value = 'replacement draft'; replacement.type = original.type;
        parent.append(replacement); if (detachOriginal) original.remove(); h.x[name] = replacement;
        const before = snapshot(h), originalValue = original.value; clear.dispatch('click');
        assert.deepEqual(snapshot(h), before); assert.equal(original.value, originalValue);
        h.x[name] = original; replacement.remove(); if (detachOriginal) parent.append(original); clear.dispatch('click'); assertCleared(h); clean(h);
    }
});

test('clear callback rejects changed interval/container references and exact original ancestor relationships', () => {
    for (const target of ['clear', 'start', 'end', 'startLabel', 'endLabel', 'startEndpoint', 'endEndpoint', 'fields', 'intervalDetails', 'panel', 'details']) {
        const h = mount(); h.calculate(); const clear = clearControl(h);
        const nodes = { ...h.x, startLabel: h.x.start.parentElement, endLabel: h.x.end.parentElement,
            startEndpoint: h.x.start.parentElement.parentElement, endEndpoint: h.x.end.parentElement.parentElement,
            intervalDetails: h.x.details, panel: h.view.panel, details: h.view.details };
        const node = nodes[target], parent = node.parentElement, wrapper = h.document.createElement('div');
        node.remove(); parent.append(wrapper); wrapper.append(node); const before = snapshot(h);
        clear.dispatch('click'); assert.deepEqual(snapshot(h), before, target);
        node.remove(); wrapper.remove(); parent.append(node); clear.dispatch('click'); assertCleared(h); clean(h);
    }
    for (const name of ['fields', 'details']) {
        const h = mount(); h.calculate(); const clear = clearControl(h), original = h.x[name];
        h.x[name] = h.document.createElement(original.tagName); const before = snapshot(h);
        clear.dispatch('click'); assert.deepEqual(snapshot(h), before); h.x[name] = original; clean(h);
    }
    const h = mount(); h.calculate(); const clear = clearControl(h), original = h.view.interval;
    h.view.interval = { ...original }; const before = snapshot(h); clear.dispatch('click'); assert.deepEqual(snapshot(h), before);
    h.view.interval = original; clean(h);
});

test('clear does not follow nodes adopted into another ownerDocument', () => {
    for (const target of ['clear', 'start', 'end', 'startLabel', 'endLabel', 'startEndpoint', 'endEndpoint', 'fields', 'intervalDetails', 'panel', 'details', 'parent']) {
        const h = mount(); h.calculate(); const clear = clearControl(h);
        const nodes = { ...h.x, startLabel: h.x.start.parentElement, endLabel: h.x.end.parentElement,
            startEndpoint: h.x.start.parentElement.parentElement, endEndpoint: h.x.end.parentElement.parentElement,
            intervalDetails: h.x.details, panel: h.view.panel, details: h.view.details, parent: h.view.details.parentElement };
        const node = nodes[target]; node.ownerDocument = createDocument(); const before = snapshot(h);
        clear.dispatch('click'); assert.deepEqual(snapshot(h), before, target);
        node.ownerDocument = h.document; clear.dispatch('click'); assertCleared(h); clean(h);
    }
});

test('connected superseded views and clock owners cannot clear either their old drafts or current drafts', () => {
    for (const replace of [h => h.rebuild(), h => h.remount()]) {
        const h = mount(); h.calculate(); const old = h.x, clear = clearControl(h);
        replace(h); h.calculate('0001-01-01', '0099-12-31'); const before = snapshot(h), oldBefore = snapshot(h, old);
        assert.equal(clear.isConnected, true); clear.dispatch('click');
        assert.deepEqual(snapshot(h), before); assert.deepEqual(snapshot(h, old), oldBefore);
        clearControl(h).dispatch('click'); assertCleared(h); clean(h);
    }
});

test('Clear dates is independent of other action buttons being removed, hidden or disabled', () => {
    for (const names of [['calculate'], ['swap'], ['copy'], ['startToday'], ['endToday'], ['calculate', 'swap', 'copy', 'startToday', 'endToday']]) {
        for (const action of ['remove', 'hide', 'disable']) {
            const h = mount(); h.calculate(); const clear = clearControl(h);
            for (const name of names) { if (action === 'remove') h.x[name].remove(); else if (action === 'hide') h.x[name].hidden = true; else h.x[name].disabled = true; }
            clear.focus(); clear.dispatch('click'); assertCleared(h); assert.equal(h.document.activeElement, clear);
            assert.equal(h.view.details.open, true); assert.equal(h.x.details.open, true); assert.equal(h.calculations, 1); clean(h);
        }
    }
});

test('clear retires pending success/failure feedback, keeps issued-write lock until settlement, and never cancels or auto-copies', async () => {
    for (const rejected of [false, true]) {
        const wait = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } });
        const original = h.calculate(); h.x.copy.dispatch('click'); const receipt = h.clock.monthCalendarIntervalCopyReceipt;
        const clear = clearControl(h); clear.focus(); clear.dispatch('click'); assertCleared(h);
        assert.equal(receipt.valid, false); assert.equal(h.clock.monthCalendarIntervalCopyReceipt, null); assert.equal(h.observers.size, 0);
        h.x.copy.dispatch('click'); assert.deepEqual(calls, [original]);
        h.calculate('2000-02-28', '2000-03-01'); const next = h.x.result.textContent;
        assert.equal(h.x.copy.getAttribute('aria-disabled'), 'true'); h.x.copy.dispatch('click'); assert.deepEqual(calls, [original]);
        if (rejected) wait.reject(Error('late synthetic denial')); else wait.resolve(); await settle(); h.flush();
        assert.equal(h.x.copyStatus.hidden, true); assert.equal(h.x.copyStatus.textContent, ''); assert.equal(h.x.result.textContent, next);
        assert.equal(h.x.copy.getAttribute('aria-disabled'), 'false'); assert.equal(h.document.activeElement, clear);
        assert.deepEqual(calls, [original]); h.x.copy.dispatch('click'); await settle(); assert.deepEqual(calls, [original, next]); clean(h);
    }
});

test('clear of settled success/failure requires fresh explicit calculation before copy and does not retry on its own', async () => {
    for (const rejected of [false, true]) {
        const calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return rejected ? Promise.reject(Error('synthetic denial')) : Promise.resolve(); } } });
        const original = h.calculate(); h.x.copy.dispatch('click'); await settle(); assert.equal(h.x.copyStatus.hidden, false);
        clearControl(h).dispatch('click'); assertCleared(h); assert.equal(h.observers.size, 0);
        h.x.start.value = '2024-02-28'; h.x.end.value = '2024-02-29'; h.x.copy.dispatch('click'); await settle(); assert.deepEqual(calls, [original]);
        assert.equal(h.calculations, 1); h.x.calculate.dispatch('click'); h.x.copy.dispatch('click'); await settle();
        assert.deepEqual(calls, [original, original]); assert.equal(h.calculations, 2); clean(h);
    }
});

test('repeated clear, empty clear, fold/reopen, view rebuild and owner replacement do not unlock an unresolved write', async () => {
    for (const replace of [h => h.rebuild(), h => h.remount()]) for (const rejected of [false, true]) {
        const wait = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } });
        h.calculate(); h.x.copy.dispatch('click'); const old = h.x;
        clearControl(h).dispatch('click'); h.x.clear.dispatch('click');
        h.x.details.open = false; h.x.details.dispatch('toggle'); h.x.details.open = true; h.x.details.dispatch('toggle');
        h.calculate(); h.x.copy.dispatch('click'); replace(h); h.calculate('0001-01-01', '0099-12-31');
        old.clear.dispatch('click'); old.copy.dispatch('click'); h.x.copy.dispatch('click'); assert.equal(calls.length, 1);
        assert.equal(h.x.copy.getAttribute('aria-disabled'), 'true'); const current = h.x.resultValue;
        if (rejected) wait.reject(Error('late denial')); else wait.resolve(); await settle(); h.flush();
        assert.equal(h.x.copyStatus.textContent, ''); assert.equal(old.copyStatus.textContent, ''); assert.equal(h.x.resultValue, current);
        assert.equal(h.x.copy.getAttribute('aria-disabled'), 'false'); h.x.copy.dispatch('click'); await settle(); assert.equal(calls.length, 2); clean(h);
    }
});

test('clear controls and empty drafts remain stable across ticks, locales and clock preferences with no timer/listener growth or focus theft', () => {
    const h = mount(); h.clock.start(); h.calculate(); const clear = clearControl(h), start = h.x.start, end = h.x.end;
    const other = h.document.createElement('input'); h.document.body.append(other); other.focus(); clear.dispatch('click'); assertCleared(h);
    h.view.year.value = '0099'; h.view.month.value = '11'; const month = h.clock.calendarMonth;
    for (const locale of ['zh_CN', 'en', null, 'en']) {
        h.locale(locale); h.at('2026-10-18T00:01:00Z'); h.tick(); h.clock.updateConfig({ hour12: true });
        assert.equal(clearControl(h), clear); assert.equal(h.x.start, start); assert.equal(h.x.end, end);
        assert.equal(clear.textContent, locale === 'zh_CN' ? '清空日期' : 'Clear dates'); assertCleared(h);
        assert.equal(h.document.activeElement, other); assert.equal(h.clock.calendarMonth, month);
        assert.equal(h.view.year.value, '0099'); assert.equal(h.view.month.value, '11');
        assert.equal(h.view.details.open, true); assert.equal(h.x.details.open, true);
    }
    assert.equal(h.timerCreations, 1); assert.equal(h.timers.size, 1); assert.equal(h.calculations, 1);
    assert.deepEqual(h.calls, []); assert.equal(h.observers.size, 0); clean(h, true);
});

test('Clear dates retains existing Escape and close/reopen conventions instead of invoking the closing reset', () => {
    const h = mount(); h.calculate(); const clear = clearControl(h); clear.focus(); clear.dispatch('click');
    assert.equal(h.view.details.open, true); assert.equal(h.x.details.open, true); assert.equal(h.document.activeElement, clear);
    const escape = clear.dispatch('keydown', { key: 'Escape' });
    assert.equal(escape.prevented, true); assert.equal(h.view.details.open, false); assert.equal(h.x.details.open, false);
    assert.equal(h.document.activeElement, h.view.summary); assertCleared(h);
    h.view.details.open = true; h.view.details.dispatch('toggle'); assert.equal(h.x.details.open, false); assertCleared(h); clean(h);
});
