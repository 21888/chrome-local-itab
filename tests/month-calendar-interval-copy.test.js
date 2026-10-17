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

test('explicit Copy result button has independent polite feedback, stays focusable and never copies or calculates on render', () => {
    const h = mount(); const copy = control(h); h.open();
    assert.equal(copy.tagName, 'BUTTON'); assert.equal(copy.type, 'button'); assert.equal(copy.tabIndex, 0);
    assert.equal(copy.textContent, 'Copy result'); assert.equal(copy.disabled, undefined); assert.equal(copy.getAttribute('aria-disabled'), 'true');
    assert.equal(h.x.copyStatus.getAttribute('role'), 'status'); assert.equal(h.x.copyStatus.getAttribute('aria-live'), 'polite'); assert.equal(h.x.copyStatus.getAttribute('aria-atomic'), 'true');
    assert.equal(h.x.copyStatus.hidden, true); assert.equal(h.x.copyStatus.textContent, '');
    copy.dispatch('click'); h.tick(); assert.deepEqual(h.calls, []); assert.equal(h.calculations, 0); clean(h);
});

test('copies exact current rendered ISO dates, direction and localized units synchronously without recalculating', async () => {
    for (const locale of ['en', 'zh_CN', null]) for (const [start, end, days] of [
        ['2024-02-29', '2024-02-29', 0], ['2024-02-28', '2024-02-29', 1], ['2024-03-01', '2024-02-29', -1],
        ['2000-02-28', '2000-03-01', 2], ['0001-01-01', '0001-01-02', 1], ['0099-12-31', '0100-01-01', 1], ['9999-12-31', '9999-12-30', -1]
    ]) {
        const h = mount({ locale }); const rendered = h.calculate(start, end), copy = control(h), identity = h.x.resultValue, calculations = h.calculations;
        const unit = locale === 'zh_CN' ? '个自然日' : Math.abs(days) === 1 ? 'calendar day' : 'calendar days';
        assert.equal(rendered, `${start} → ${end}: ${days > 0 ? '+' : ''}${days} ${unit}`);
        copy.focus(); copy.dispatch('click'); assert.deepEqual(h.calls, [rendered], 'writeText called in the activation stack');
        assert.equal(h.calculations, calculations); assert.equal(h.x.copyStatus.textContent, h.messages.monthCalendarIntervalCopying?.message || 'Copying result…');
        await settle(); assert.equal(h.x.copyStatus.textContent, h.messages.monthCalendarIntervalCopySuccess?.message || 'Result copied.');
        assert.equal(h.document.activeElement, copy); assert.equal(h.x.resultValue, identity); assert.equal(h.x.result.textContent, rendered);
        assert.equal(copy.getAttribute('aria-disabled'), 'false'); clean(h);
    }
});

test('draft, invalid, edited, mismatched raw value, changed result identity/text and disabled controls cannot copy', async () => {
    const cases = [h => {}, h => { h.x.start.value = '2024-02-28'; h.x.end.value = '2024-02-29'; },
        h => h.calculate('1900-02-29', '2024-03-01'), h => { h.calculate(); h.x.start.dispatch('input'); },
        h => { h.calculate(); h.x.end.value = '2024-03-01'; }, h => { h.calculate(); h.x.resultValue = { ...h.x.resultValue }; },
        h => { h.calculate(); h.x.resultValue.days = 99; }, h => { h.calculate(); h.x.result.textContent = 'stale'; },
        h => { h.calculate(); h.x.copy.disabled = true; }, h => { h.calculate(); h.x.start.disabled = true; }];
    for (const change of cases) {
        const h = mount(); h.open(); control(h); change(h); const result = h.x.result.textContent, error = h.x.error.textContent, calculations = h.calculations;
        h.x.copy.dispatch('click'); await settle(); assert.deepEqual(h.calls, []); assert.equal(h.calculations, calculations);
        assert.equal(h.x.result.textContent, result); assert.equal(h.x.error.textContent, error); clean(h);
    }
});

test('API absence, getter throw, synchronous throw and rejection keep result and independent errors with manual-copy feedback', async () => {
    for (const failure of ['missing', 'getter', 'throw', 'reject']) {
        let writes = 0; const h = mount({ clipboard: failure === 'missing' ? null : { writeText() { writes++; if (failure === 'throw') throw Error('private reason'); return Promise.reject(Error('private reason')); } } });
        if (failure === 'getter') Object.defineProperty(h.window.navigator, 'clipboard', { configurable: true, get() { throw Error('private getter'); } });
        const result = h.calculate(), copy = control(h); h.view.error.hidden = false; h.view.error.textContent = 'Independent month error'; h.view.announcement.textContent = 'Existing month announcement';
        const intervalError = h.x.error.textContent; copy.focus(); copy.dispatch('click'); await settle();
        assert.equal(h.x.copyStatus.textContent, 'Could not copy. Select the result text and press Ctrl/Cmd+C to copy it manually.');
        assert(h.x.copyStatus.classList.contains('is-error')); assert.equal(h.x.result.textContent, result); assert.equal(h.x.error.textContent, intervalError);
        assert.equal(h.view.error.textContent, 'Independent month error'); assert.equal(h.view.announcement.textContent, 'Existing month announcement'); assert.equal(h.document.activeElement, copy);
        assert.equal(writes, ['missing', 'getter'].includes(failure) ? 0 : 1); await settle(); assert.equal(writes, ['missing', 'getter'].includes(failure) ? 0 : 1);
        Object.defineProperty(h.window.navigator, 'clipboard', { configurable: true, value: { writeText(text) { h.calls.push(text); return Promise.resolve(); } } });
        copy.dispatch('click'); await settle(); assert.deepEqual(h.calls, [result]); assert.equal(h.x.copyStatus.textContent, 'Result copied.'); assert(!h.x.copyStatus.classList.contains('is-error')); clean(h);
    }
});

test('double-click, pending repeats, handled/composing clicks and native held Enter/Space do not duplicate writes', async () => {
    const wait = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); h.calculate(); const copy = control(h);
    for (const fields of [{ detail: 2 }, { defaultPrevented: true }, { isComposing: true }, { keyCode: 229 }]) copy.dispatch('click', fields);
    assert.equal(calls.length, 0);
    for (const field of [h.view.year, h.x.start, h.x.end]) { field.dispatch('compositionstart'); copy.dispatch('click'); assert.equal(calls.length, 0); field.dispatch('compositionend'); field.dispatch('keyup', { key: 'Enter' }); }
    copy.focus(); copy.dispatch('click'); assert.equal(calls.length, 1); assert.equal(copy.getAttribute('aria-disabled'), 'true'); assert.notEqual(copy.disabled, true);
    copy.dispatch('click'); copy.dispatch('click', { detail: 2 });
    for (const key of ['Enter', ' ']) {
        for (const flags of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) assert.equal(copy.dispatch('keydown', { key, ...flags }).prevented, true);
        assert.equal(copy.dispatch('keydown', { key }).prevented, false, 'native activation handles fresh keys');
    }
    assert.equal(copy.dispatch('keydown', { key: 'c', ctrlKey: true }).prevented, false); assert.equal(calls.length, 1); assert.equal(h.document.activeElement, copy);
    wait.resolve(); await settle(); copy.dispatch('click', { detail: 2 }); assert.equal(calls.length, 1); copy.dispatch('click'); await settle(); assert.equal(calls.length, 2);
    assert.equal(h.observers.size, 1, 'only current feedback observer'); clean(h);
});

test('ordinary navigation, Today, month jump, ticks and clock preference updates preserve pending and settled feedback', async () => {
    const wait = deferred(), h = mount({ clipboard: { writeText() { return wait.promise; } } }); h.clock.start(); const result = h.calculate(), identity = h.x.resultValue;
    control(h).focus(); h.x.copy.dispatch('click');
    for (let phase = 0; phase < 2; phase++) {
        const feedback = h.x.copyStatus.textContent;
        for (const button of [h.view.previous, h.view.next, h.view.today]) { button.dispatch('click'); h.flush(); assert.equal(h.x.copyStatus.textContent, feedback); }
        h.view.year.value = '1900'; h.view.month.value = '1'; h.view.jump.dispatch('click');
        h.at('2026-10-18T00:01:00Z'); h.tick(); h.clock.updateConfig({ hour12: true }); h.flush();
        assert.equal(h.x.copyStatus.textContent, feedback); assert.equal(h.x.result.textContent, result); assert.equal(h.x.resultValue, identity);
        assert.equal(h.timerCreations, 1); assert.equal(h.timers.size, 1); assert.equal(h.document.activeElement, h.x.copy);
        wait.resolve(); await settle();
    }
    clean(h, true);
});

const interruptions = {
    'same-value input': h => h.x.start.dispatch('input'),
    'same-value change': h => h.x.end.dispatch('change'),
    'edit away and back': h => { const value = h.x.start.value; h.x.start.value = '2000-01-01'; h.x.start.dispatch('input'); h.x.start.value = value; h.x.start.dispatch('input'); h.x.calculate.dispatch('click'); },
    'same-result calculation': h => h.x.calculate.dispatch('click'),
    'locale ABA': h => { h.locale('zh_CN'); h.tick(); h.locale('en'); h.tick(); },
    'same-locale text ABA': h => { const old = h.messages.monthCalendarIntervalDays.message; h.messages.monthCalendarIntervalDays.message = 'changed units'; h.tick(); h.messages.monthCalendarIntervalDays.message = old; h.tick(); },
    'fold and unfold': h => { h.x.details.open = false; h.x.details.dispatch('toggle'); h.x.details.open = true; h.x.details.dispatch('toggle'); },
    'queued fold and unfold': h => { h.x.details.open = false; h.x.details.open = true; },
    'close and reopen': h => { h.clock.closeMonthCalendar(); h.calculate(); },
    'disabled clock': h => { h.clock.setEnabled(false); h.clock.setEnabled(true); h.calculate(); },
    'dashboard hide and show': h => { h.context.applyDashboardHiddenState(true); h.context.applyDashboardHiddenState(false); h.calculate(); },
    'hide and show': h => { h.host.hidden = true; h.host.hidden = false; },
    'detach and return': h => { h.host.remove(); h.document.body.append(h.host); },
    'text ABA': h => { const text = h.x.result.textContent; h.x.result.textContent = 'other'; h.x.result.textContent = text; },
    'document hide and show': h => { h.document.hidden = true; h.document.listeners.get('visibilitychange')?.(); h.document.hidden = false; },
    'window blur': h => h.emit('blur'),
    'pagehide pageshow': h => { h.emit('pagehide'); h.emit('pageshow'); },
    'departing': h => { h.window.LocalItabContentLifecycle.departing = true; },
    'view replacement': h => { h.rebuild(); h.calculate(); },
    'class replacement': h => { h.remount(); h.calculate(); }
};
for (const [name, interrupt] of Object.entries(interruptions)) test(`late success/failure never revives feedback after ${name}`, async () => {
    for (const rejected of [false, true]) {
        const wait = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); h.calculate(); const old = h.x;
        control(h).dispatch('click'); interrupt(h);
        const other = h.document.createElement('input'); h.document.body.append(other); other.focus();
        h.x.copy.dispatch('click'); old.copy.dispatch('click'); assert.equal(calls.length, 1, 'invalidation cannot release unresolved OS write');
        if (rejected) wait.reject(Error('late denial')); else wait.resolve(); await settle(); h.flush();
        assert.equal(h.x.copyStatus.textContent, ''); assert.equal(old.copyStatus.textContent, ''); assert.equal(h.x.copyStatus.hidden, true);
        assert.equal(h.document.activeElement, other); assert.equal(h.observers.size, 0); clean(h);
    }
});

test('settled success/failure feedback also retires permanently on edits, locale, hide, fold and replacement without listener growth', async () => {
    for (const name of ['same-value input', 'same-result calculation', 'locale ABA', 'same-locale text ABA', 'hide and show', 'fold and unfold', 'detach and return', 'text ABA', 'window blur', 'pagehide pageshow', 'view replacement', 'class replacement']) for (const rejected of [false, true]) {
        const h = mount({ clipboard: { writeText() { return rejected ? Promise.reject(Error('denied')) : Promise.resolve(); } } }); h.calculate(); control(h).dispatch('click'); await settle();
        assert.equal(h.x.copyStatus.hidden, false); assert.equal(h.observers.size, 1); const old = h.x;
        interruptions[name](h); h.flush(); assert.equal(h.x.copyStatus.hidden, true, name); assert.equal(old.copyStatus.textContent, '', name); assert.equal(h.observers.size, 0, name); clean(h);
    }
});

test('hidden/inert/aria-hidden/styles/folded/detached/departing/old controls reject activation synchronously', async () => {
    for (const change of [h => { h.host.hidden = true; }, h => { h.host.inert = true; }, h => h.host.setAttribute('aria-hidden', 'true'),
        h => { h.host.style.display = 'none'; }, h => { h.host.style.visibility = 'hidden'; }, h => { h.host.style.visibility = 'collapse'; },
        h => { h.document.hidden = true; }, h => { h.document.visibilityState = 'hidden'; }, h => { h.window.LocalItabContentLifecycle.departing = true; },
        h => { h.x.details.open = false; }, h => { h.view.details.open = false; }, h => h.host.remove(), h => { h.x.result.hidden = true; }, h => { h.x.start.hidden = true; },
        h => { h.document.body.classList.add('dashboard-hidden'); }, h => h.rebuild(), h => h.remount()]) {
        const h = mount(); h.calculate(); const old = h.x, copy = control(h); change(h); copy.dispatch('click'); await settle();
        assert.equal(h.calls.length, 0); assert.equal(old.copyStatus.textContent, ''); clean(h);
    }
});

test('queued ancestor attribute ABA and removed subtrees permanently invalidate without extra I/O', async () => {
    for (const attribute of ['hidden', 'inert', 'aria-hidden', 'style', 'class', 'open']) for (const queued of [false, true]) {
        const wait = deferred(), h = mount({ clipboard: { writeText() { return wait.promise; } } }); h.calculate(); control(h).dispatch('click');
        h.mutations([{ type: 'attributes', target: h.host, attributeName: attribute }], queued); wait.resolve(); await settle();
        assert.equal(h.x.copyStatus.textContent, ''); assert.equal(h.x.copyStatus.hidden, true); clean(h);
    }
});

test('repeated view and class replacement keep one unresolved feature lock, then unlock only the current owner', async () => {
    const wait = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); h.calculate(); const old = control(h); old.dispatch('click');
    for (let i = 0; i < 4; i++) { i % 2 ? h.remount() : h.rebuild(); h.calculate('0001-01-01', '0099-12-31'); control(h).dispatch('click'); old.dispatch('click'); assert.equal(calls.length, 1); assert.equal(h.x.copy.getAttribute('aria-disabled'), 'true'); }
    wait.resolve(); await settle(); assert.equal(h.x.copyStatus.textContent, ''); assert.equal(h.x.copy.getAttribute('aria-disabled'), 'false');
    h.x.copy.dispatch('click'); await settle(); assert.equal(calls.length, 2); assert.equal(h.x.copyStatus.textContent, 'Result copied.'); clean(h);
});

test('copy is independent of world-clock lock and stays within existing timer, I/O and key routing boundaries', async () => {
    const h = mount(); h.clock.start(); h.calculate(); const copy = control(h);
    vm.runInContext('worldClockCopyAttempt = { unrelated: true };', h.context);
    copy.dispatch('click'); await settle(); assert.equal(h.calls.length, 1);
    assert.equal(vm.runInContext('worldClockCopyAttempt.unrelated', h.context), true);
    assert.equal(h.context.shouldToggleFromEvent({ target: copy }), false);
    assert.equal(h.document.listeners.has('keydown'), false); assert.equal(h.events.has('keydown'), false);
    assert.equal(h.timerCreations, 1); assert.equal(h.timers.size, 1); clean(h, true);
});

test('localized and missing-key failure feedback preserves the complete selectable result', async () => {
    for (const locale of ['en', 'zh_CN', null]) {
        const h = mount({ locale, clipboard: null }); const result = h.calculate('0099-12-31', '0100-01-01'); control(h).dispatch('click'); await settle();
        assert.equal(h.x.copyStatus.textContent, locale === 'zh_CN' ? '未能复制。请选中结果文本并按 Ctrl/Cmd+C 手动复制。' : 'Could not copy. Select the result text and press Ctrl/Cmd+C to copy it manually.');
        assert.equal(h.x.result.textContent, result); assert.equal(h.x.result.children.length, 0); clean(h);
    }
});

test('existing tick retires unavailable settled feedback; unrelated year composition does not change a valid result receipt', async () => {
    const h = mount(); h.calculate(); control(h).dispatch('click'); await settle();
    h.view.year.dispatch('compositionstart'); h.tick(); h.flush(); assert.equal(h.x.copyStatus.textContent, 'Result copied.');
    h.view.year.dispatch('compositionend'); h.view.year.dispatch('keyup');
    h.window.LocalItabContentLifecycle.departing = true; h.tick(); h.window.LocalItabContentLifecycle.departing = false; h.tick();
    assert.equal(h.x.copyStatus.textContent, ''); assert.equal(h.observers.size, 0); clean(h);
});

test('clipboard getter reentry cannot substitute unverified result text into the captured write', async () => {
    for (const accessor of ['clipboard', 'writeText']) for (const mutateSnapshot of [false, true]) {
        const h = mount(), result = h.calculate(); control(h);
        const write = text => { h.calls.push(text); return Promise.resolve(); };
        const changed = () => { h.x.result.textContent = 'Uncalculated replacement text'; if (mutateSnapshot) h.x.renderedResult.text = h.x.result.textContent; };
        if (accessor === 'clipboard') Object.defineProperty(h.window.navigator, 'clipboard', { get() { changed(); return { writeText: write }; } });
        else Object.defineProperty(h.window.navigator.clipboard, 'writeText', { get() { changed(); return write; } });
        h.x.copy.dispatch('click'); assert.deepEqual(h.calls, [result]); await settle();
        assert.equal(h.x.result.textContent, 'Uncalculated replacement text'); assert.equal(h.x.copyStatus.textContent, ''); clean(h);
    }
});

// Swap-draft regressions reuse the same bounded calendar/clipboard model.
function swapControl(h) { assert(h.x.swap, 'Date interval needs an explicit Swap dates button'); return h.x.swap; }
function assertClearedInterval(h) {
    assert.equal(h.x.invalid, false); assert.equal(h.x.resultValue, null); assert.equal(h.x.renderedResult, null);
    assert.equal(h.x.error.hidden, true); assert.equal(h.x.error.textContent, ''); assert.equal(h.x.result.textContent, '');
    assert.equal(h.x.start.getAttribute('aria-invalid'), 'false'); assert.equal(h.x.end.getAttribute('aria-invalid'), 'false');
    assert.equal(h.x.copyStatus.hidden, true); assert.equal(h.x.copyStatus.textContent, '');
    assert.equal(h.x.copyStatus.classList.contains('is-error'), false); assert.equal(h.x.copy.getAttribute('aria-disabled'), 'true');
}

test('Swap dates is an explicit localized native button with EN fallback and no render-time action', () => {
    for (const locale of ['en', 'zh_CN', null]) {
        const h = mount({ locale }), swap = swapControl(h); h.open(); h.tick();
        assert.equal(swap.tagName, 'BUTTON'); assert.equal(swap.type, 'button'); assert.equal(swap.tabIndex, 0);
        assert.equal(swap.textContent, locale === 'zh_CN' ? '交换日期' : 'Swap dates'); assert.notEqual(swap.disabled, true);
        assert.equal(swap.parentElement, h.x.fields); assert.equal(h.x.start.value, ''); assert.equal(h.x.end.value, '');
        assert.equal(h.calculations, 0); assert.deepEqual(h.calls, []); assert.equal(h.observers.size, 0); clean(h);
    }
});

test('Swap dates exchanges exact raw valid, invalid, empty, whitespace and Unicode strings without parsing', () => {
    for (const [start, end] of [['0001-01-01', '9999-12-31'], ['0099-12-31', '0100-01-01'], ['2000-02-29', '2000-02-29'],
        ['', ''], ['', '1900-02-29'], ['2024-01-01 ', ' 2024-02-29'], [' \t ', '\t'],
        ['２０２４-01-01', '2024-1-1'], ['10000-01-01', '<img src=x onerror=alert(1)>']]) {
        const h = mount(); h.open(); const swap = swapControl(h); h.x.start.value = start; h.x.end.value = end;
        const forbidden = () => { throw Error('Swapping raw drafts must not parse or calculate'); };
        const calendar = h.window.MonthCalendar;
        h.window.MonthCalendar = { ...calendar, parseDateDraft: forbidden, parseMonthDraft: forbidden, dateInterval: forbidden };
        swap.focus(); swap.dispatch('click');
        assert.equal(h.x.start.value, end); assert.equal(h.x.end.value, start); assert.equal(h.document.activeElement, swap);
        assert.equal(h.calculations, 0); assert.deepEqual(h.calls, []); assertClearedInterval(h);
        // Cleanup syncs the unrelated month editor, so restore its parser first.
        h.window.MonthCalendar = calendar; clean(h);
    }
});

test('Swap dates clears successful or invalid interval state while preserving the month, its invalid draft and focus', () => {
    for (const [start, end] of [['2024-02-28', '2024-02-29'], ['2024-02-29', '2024-02-29'], ['1900-02-29', '']]) {
        const h = mount(); h.calculate(start, end); const swap = swapControl(h);
        h.view.year.value = '10000'; h.view.month.value = '3'; h.view.jump.dispatch('click');
        const month = h.clock.calendarMonth, rows = h.view.body.children, caption = h.view.caption.textContent,
            monthError = h.view.error.textContent, announcement = h.view.announcement.textContent, calculations = h.calculations;
        assert.equal(h.view.error.hidden, false); swap.focus(); swap.dispatch('click');
        assert.equal(h.x.start.value, end); assert.equal(h.x.end.value, start); assertClearedInterval(h);
        assert.equal(h.clock.calendarMonth, month); assert.equal(h.view.body.children, rows); assert.equal(h.view.caption.textContent, caption);
        assert.equal(h.view.year.value, '10000'); assert.equal(h.view.month.value, '3'); assert.equal(h.view.error.textContent, monthError);
        assert.equal(h.view.error.hidden, false); assert.equal(h.view.year.getAttribute('aria-invalid'), 'true');
        assert.equal(h.view.announcement.textContent, announcement); assert.equal(h.calculations, calculations); assert.equal(h.document.activeElement, swap); clean(h);
    }
});

test('Swap dates requires a fresh explicit calculation before any reversed result can be copied', async () => {
    const h = mount(); h.calculate('2000-02-28', '2000-03-01'); const swap = swapControl(h), calculations = h.calculations;
    swap.dispatch('click'); h.x.copy.dispatch('click'); await settle();
    assertClearedInterval(h); assert.equal(h.calculations, calculations); assert.deepEqual(h.calls, []);
    h.x.calculate.dispatch('click'); assert.equal(h.calculations, calculations + 1);
    assert.equal(h.x.result.textContent, '2000-03-01 → 2000-02-28: -2 calendar days');
    h.x.copy.dispatch('click'); await settle(); assert.deepEqual(h.calls, [h.x.result.textContent]); clean(h);
});

test('Swap dates ignores handled, repeated, composing and double-click activation but allows a later deliberate reverse', () => {
    const h = mount(); h.calculate(); const swap = swapControl(h), oldResult = h.x.resultValue;
    for (const flags of [{ defaultPrevented: true }, { detail: 2 }, { detail: 3 }, { repeat: true }, { isComposing: true }, { keyCode: 229 }]) {
        swap.dispatch('click', flags); assert.equal(h.x.start.value, '2024-02-28'); assert.equal(h.x.end.value, '2024-02-29');
        assert.equal(h.x.resultValue, oldResult);
    }
    for (const key of ['Enter', ' ']) {
        for (const flags of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) {
            assert.equal(swap.dispatch('keydown', { key, ...flags }).prevented, true);
            assert.equal(h.x.resultValue, oldResult, 'keydown guard does not itself activate');
        }
        assert.equal(swap.dispatch('keydown', { key }).prevented, false, 'fresh activation stays native');
    }
    assert.equal(swap.dispatch('keydown', { key: 'c', ctrlKey: true }).prevented, false);
    swap.dispatch('click', { detail: 1 }); assert.equal(h.x.start.value, '2024-02-29'); assert.equal(h.x.end.value, '2024-02-28');
    swap.dispatch('click', { detail: 2 }); assert.equal(h.x.start.value, '2024-02-29');
    swap.dispatch('click', { detail: 1 }); assert.equal(h.x.start.value, '2024-02-28'); assert.equal(h.x.end.value, '2024-02-29');
    assert.equal(h.calculations, 1); clean(h);
});

test('Swap dates leaves drafts and result untouched during either date or year IME composition', () => {
    for (const name of ['year', 'start', 'end']) {
        const h = mount(); h.calculate(); const swap = swapControl(h), field = name === 'year' ? h.view.year : h.x[name], result = h.x.resultValue;
        field.dispatch('compositionstart');
        for (const key of ['Enter', ' ']) assert.equal(swap.dispatch('keydown', { key }).prevented, true);
        swap.dispatch('click'); assert.equal(h.x.start.value, '2024-02-28'); assert.equal(h.x.end.value, '2024-02-29');
        assert.equal(h.x.resultValue, result); field.dispatch('compositionend'); field.dispatch('keyup', { key: 'Enter' });
        swap.dispatch('click'); assert.equal(h.x.start.value, '2024-02-29'); assert.equal(h.x.end.value, '2024-02-28'); assertClearedInterval(h); clean(h);
    }
});

test('Swap dates requires the visible open active calendar and both usable fields', () => {
    const unavailable = [h => { h.x.details.open = false; }, h => { h.view.details.open = false; }, h => { h.clock.enabled = false; },
        h => { h.document.hidden = true; }, h => { h.document.visibilityState = 'hidden'; }, h => { h.window.LocalItabContentLifecycle.departing = true; },
        h => { h.document.body.classList.add('dashboard-hidden'); }, h => h.host.remove(), h => { h.host.hidden = true; },
        h => { h.host.inert = true; }, h => h.host.setAttribute('aria-hidden', 'true'), h => { h.host.style.display = 'none'; },
        h => { h.host.style.visibility = 'hidden'; }, h => { h.host.style.visibility = 'collapse'; }];
    for (const key of ['swap', 'start', 'end']) for (const change of [node => { node.hidden = true; }, node => { node.disabled = true; },
        node => { node.inert = true; }, node => node.setAttribute('aria-hidden', 'true'), node => { node.style.display = 'none'; },
        node => { node.style.visibility = 'hidden'; }, node => node.remove()]) unavailable.push(h => change(h.x[key]));
    unavailable.push(h => { const field = h.x.end; field.remove(); h.view.panel.append(field); });
    for (const change of unavailable) {
        const h = mount(); h.calculate(); const swap = swapControl(h), result = h.x.resultValue, text = h.x.result.textContent;
        change(h); swap.dispatch('click');
        assert.equal(h.x.start.value, '2024-02-28'); assert.equal(h.x.end.value, '2024-02-29');
        assert.equal(h.x.resultValue, result); assert.equal(h.x.result.textContent, text); assert.equal(h.calculations, 1); assert.deepEqual(h.calls, []); clean(h);
    }
});

test('Swap dates rejects superseded calendar views and old clock owners even while their old controls remain connected', () => {
    for (const replace of [h => h.rebuild(), h => h.remount()]) {
        const h = mount(); h.calculate(); const old = h.x, swap = swapControl(h), result = old.resultValue;
        replace(h); h.calculate('0001-01-01', '0099-12-31'); const currentResult = h.x.resultValue;
        assert.equal(swap.isConnected, true); swap.dispatch('click');
        assert.equal(old.start.value, '2024-02-28'); assert.equal(old.end.value, '2024-02-29'); assert.equal(old.resultValue, result);
        assert.equal(h.x.start.value, '0001-01-01'); assert.equal(h.x.end.value, '0099-12-31'); assert.equal(h.x.resultValue, currentResult);
        h.x.swap.dispatch('click'); assert.equal(h.x.start.value, '0099-12-31'); assert.equal(h.x.end.value, '0001-01-01'); assertClearedInterval(h); clean(h);
    }
});

test('Swap dates retires pending copy feedback without releasing its issued-write lock or reviving late success/failure', async () => {
    for (const rejected of [false, true]) {
        const wait = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } });
        const original = h.calculate(); control(h).dispatch('click'); const swap = swapControl(h); swap.focus();
        assert.equal(calls.length, 1); swap.dispatch('click'); assertClearedInterval(h); assert.equal(h.observers.size, 0);
        assert.equal(h.document.activeElement, swap); h.x.copy.dispatch('click'); assert.equal(calls.length, 1);
        h.x.calculate.dispatch('click'); const reversed = h.x.result.textContent; assert.notEqual(reversed, original);
        assert.equal(h.x.copy.getAttribute('aria-disabled'), 'true'); h.x.copy.dispatch('click'); assert.equal(calls.length, 1);
        if (rejected) wait.reject(Error('late denial')); else wait.resolve(); await settle(); h.flush();
        assert.equal(h.x.copyStatus.textContent, ''); assert.equal(h.x.copyStatus.hidden, true); assert.equal(h.document.activeElement, swap);
        assert.equal(h.x.copy.getAttribute('aria-disabled'), 'false'); assert.equal(h.x.result.textContent, reversed);
        h.x.copy.dispatch('click'); await settle(); assert.deepEqual(calls, [original, reversed]); clean(h);
    }
});

test('Swap dates clears settled success/failure feedback and identical-value swaps still retire the result', async () => {
    for (const rejected of [false, true]) {
        const h = mount({ clipboard: { writeText() { return rejected ? Promise.reject(Error('denied')) : Promise.resolve(); } } });
        h.calculate('2024-02-29', '2024-02-29'); control(h).dispatch('click'); await settle();
        assert.equal(h.x.copyStatus.hidden, false); assert.equal(h.observers.size, 1);
        swapControl(h).dispatch('click'); assertClearedInterval(h); assert.equal(h.observers.size, 0);
        assert.equal(h.x.start.value, '2024-02-29'); assert.equal(h.x.end.value, '2024-02-29'); assert.equal(h.calculations, 1); clean(h);
    }
});

test('Swap dates cannot unlock an unresolved copy through swap-back, view rebuild or clock replacement', async () => {
    for (const replace of [h => h.rebuild(), h => h.remount()]) {
        const wait = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } });
        const original = h.calculate(); control(h).dispatch('click'); const old = h.x;
        swapControl(h).dispatch('click'); h.x.swap.dispatch('click'); h.x.calculate.dispatch('click');
        assert.equal(h.x.result.textContent, original); h.x.copy.dispatch('click'); assert.equal(calls.length, 1);
        replace(h); h.calculate(); old.swap.dispatch('click'); h.x.copy.dispatch('click'); old.copy.dispatch('click'); assert.equal(calls.length, 1);
        wait.resolve(); await settle(); assert.equal(old.copyStatus.textContent, ''); assert.equal(h.x.copyStatus.textContent, '');
        assert.equal(h.x.copy.getAttribute('aria-disabled'), 'false'); h.x.copy.dispatch('click'); await settle(); assert.equal(calls.length, 2); clean(h);
    }
});

test('Swap dates keeps stable controls and drafts across ticks/language changes, adds no I/O or timer and never steals focus', () => {
    const h = mount(); h.clock.start(); h.calculate(); const swap = swapControl(h), start = h.x.start, end = h.x.end;
    const other = h.document.createElement('input'); h.document.body.append(other); other.focus();
    swap.dispatch('click'); assert.equal(h.document.activeElement, other); assertClearedInterval(h);
    h.view.year.value = '0099'; h.view.month.value = '11'; const month = h.clock.calendarMonth;
    for (const locale of ['zh_CN', 'en']) {
        h.locale(locale); h.tick(); h.clock.updateConfig({ hour12: true });
        assert.equal(h.x.swap, swap); assert.equal(h.x.start, start); assert.equal(h.x.end, end);
        assert.equal(swap.textContent, locale === 'zh_CN' ? '交换日期' : 'Swap dates');
        assert.equal(start.value, '2024-02-29'); assert.equal(end.value, '2024-02-28'); assert.equal(h.clock.calendarMonth, month);
        assert.equal(h.view.year.value, '0099'); assert.equal(h.view.month.value, '11'); assert.equal(h.document.activeElement, other);
    }
    assert.equal(h.calculations, 1); assert.equal(h.timerCreations, 1); assert.equal(h.timers.size, 1); assert.deepEqual(h.calls, []);
    assert.equal(h.context.shouldToggleFromEvent({ target: swap }), false); assert.equal(h.document.listeners.has('keydown'), false); assert.equal(h.events.has('keydown'), false);
    swap.focus(); const escape = swap.dispatch('keydown', { key: 'Escape' });
    assert.equal(escape.prevented, true); assert.equal(h.document.activeElement, h.view.summary); assert.equal(h.x.start.value, ''); assert.equal(h.x.end.value, '');
    clean(h, true);
});

// Endpoint-today coverage is synthetic. Local getter values deliberately differ
// from the UTC instant; this does not change a real device clock or time zone.
function todayControl(h, endpoint) {
    const button = h.x[`${endpoint}Today`];
    assert(button, `Date interval needs an explicit ${endpoint} Today button`);
    return button;
}
function modeledLocalClock(h, initial) {
    const BaseDate = h.context.Date;
    let components = initial, captures = 0;
    h.context.Date = class extends BaseDate {
        constructor(...args) { super(...args); if (!args.length) { this.localComponents = [...components]; captures++; } }
        getFullYear() { return this.localComponents ? this.localComponents[0] : super.getFullYear(); }
        getMonth() { return this.localComponents ? this.localComponents[1] : super.getMonth(); }
        getDate() { return this.localComponents ? this.localComponents[2] : super.getDate(); }
        toISOString() { if (this.localComponents) throw Error('Today must not use a UTC ISO date'); return super.toISOString(); }
    };
    return { at(next) { components = next; }, get captures() { return captures; } };
}
function intervalSnapshot(h, x = h.x) {
    return { start: x.start.value, end: x.end.value, invalid: x.invalid, result: x.resultValue,
        rendered: x.renderedResult, error: x.error.textContent, errorHidden: x.error.hidden,
        text: x.result.textContent, copyText: x.copyStatus.textContent, copyHidden: x.copyStatus.hidden,
        copyDisabled: x.copy.getAttribute('aria-disabled'), calculations: h.calculations };
}

test('endpoint Today buttons have distinct localized names, separate labels and no render-time action', () => {
    for (const locale of ['en', 'zh_CN', null]) {
        const h = mount({ locale }); h.open(); h.tick();
        for (const endpoint of ['start', 'end']) {
            const button = todayControl(h, endpoint), field = h.x[endpoint];
            assert.equal(button.tagName, 'BUTTON'); assert.equal(button.type, 'button'); assert.equal(button.tabIndex, 0);
            assert.equal(button.textContent, locale === 'zh_CN'
                ? endpoint === 'start' ? '开始日期用今天' : '结束日期用今天'
                : `Use today for ${endpoint}`);
            assert.equal(button.closest('label'), null, 'button is not a second labelable child');
            assert.equal(field.parentElement.tagName, 'LABEL'); assert.equal(field.parentElement.parentElement, button.parentElement);
            assert(button.parentElement.classList.contains('month-calendar-interval-endpoint'));
            assert.equal(button.parentElement.parentElement, h.x.fields); assert.equal(field.value, ''); assert.notEqual(button.disabled, true);
        }
        assert.notEqual(h.x.startToday.textContent, h.x.endToday.textContent);
        assert.equal(h.calculations, 0); assert.deepEqual(h.calls, []); assert.equal(h.observers.size, 0); clean(h);
    }
    const css = read('local-month-calendar.css');
    assert.match(css, /\.month-calendar-interval-endpoint \{[^}]*flex: 1 1 100%;[^}]*flex-wrap: wrap;[^}]*min-width: 0;/);
    assert.match(css, /\.month-calendar-interval-endpoint label \{ flex: 1 1 7rem; \}/);
    assert.match(css, /\.month-calendar-interval-endpoint button \{ box-sizing: border-box; max-width: 100%; \}/);
});

test('endpoint Today uses fresh local components at each action rather than UTC, browsed month or open time', () => {
    const h = mount(); h.open(); h.view.year.value = '0099'; h.view.month.value = '11'; h.view.jump.dispatch('click');
    const month = h.clock.calendarMonth, rows = h.view.body.children;
    h.at('2026-10-18T00:30:00Z'); const time = modeledLocalClock(h, [2026, 9, 17]);
    todayControl(h, 'start').dispatch('click'); assert.equal(h.x.start.value, '2026-10-17'); assert.equal(h.x.end.value, '');
    assert.equal(time.captures, 1);
    time.at([2026, 9, 18]); todayControl(h, 'end').dispatch('click');
    assert.equal(h.x.start.value, '2026-10-17'); assert.equal(h.x.end.value, '2026-10-18'); assert.equal(time.captures, 2);
    time.at([2026, 9, 19]); h.x.startToday.dispatch('click');
    assert.equal(h.x.start.value, '2026-10-19'); assert.equal(h.x.end.value, '2026-10-18'); assert.equal(time.captures, 3);
    assert.equal(h.clock.calendarMonth, month); assert.equal(h.view.body.children, rows);
    assert.equal(h.view.year.value, '0099'); assert.equal(h.view.month.value, '11');
    assert.equal(h.calculations, 0); assert.deepEqual(h.calls, []); assertClearedInterval(h); clean(h);
});

test('endpoint Today zero-pads leap dates and every supported early-year or upper boundary without year-1900 coercion', () => {
    const cases = [[1, 0, 1, '0001-01-01'], [4, 1, 29, '0004-02-29'], [99, 11, 31, '0099-12-31'],
        [100, 0, 1, '0100-01-01'], [1900, 2, 1, '1900-03-01'], [2000, 1, 29, '2000-02-29'],
        [2024, 1, 29, '2024-02-29'], [9999, 11, 31, '9999-12-31']];
    for (const endpoint of ['start', 'end']) {
        const h = mount(); h.open(); const time = modeledLocalClock(h, cases[0]);
        for (const [year, month, day, expected] of cases) {
            time.at([year, month, day]); todayControl(h, endpoint).dispatch('click');
            assert.equal(h.x[endpoint].value, expected); assert(h.window.MonthCalendar.parseDateDraft(expected));
            assert.equal(h.x[endpoint === 'start' ? 'end' : 'start'].value, ''); assertClearedInterval(h);
        }
        assert.equal(h.calculations, 0); clean(h);
    }
});

test('invalid or out-of-range device clocks leave both drafts, validation and existing result/feedback untouched', async () => {
    for (const endpoint of ['start', 'end']) for (const invalidState of [false, true]) {
        const h = mount(); h.calculate(...(invalidState ? ['1900-02-29', ''] : ['2024-02-28', '2024-02-29']));
        if (!invalidState) { h.x.copy.dispatch('click'); await settle(); }
        const button = todayControl(h, endpoint), time = modeledLocalClock(h, [2026, 9, 17]);
        button.focus(); const before = intervalSnapshot(h), observerCount = h.observers.size;
        for (const year of [0, -1, 10000, 275760, NaN, Infinity, 2026.5]) {
            time.at([year, 0, 1]); assert.doesNotThrow(() => button.dispatch('click'));
            assert.deepEqual(intervalSnapshot(h), before); assert.equal(h.observers.size, observerCount); assert.equal(h.document.activeElement, button);
        }
        h.at('not a valid date'); time.at([2026, 9, 17]); assert.doesNotThrow(() => button.dispatch('click'));
        assert.deepEqual(intervalSnapshot(h), before); assert.equal(h.observers.size, observerCount); assert.equal(h.document.activeElement, button);
        h.at('2026-10-17T12:00:00Z'); button.dispatch('click'); assert.equal(h.x[endpoint].value, '2026-10-17'); assertClearedInterval(h); clean(h);
    }
});

test('endpoint Today edits only its target and preserves arbitrary peer bytes, non-target caret, and month drafts', () => {
    for (const endpoint of ['start', 'end']) for (const raw of ['', '1900-02-29', ' \t2024-1-1\r\n ', '２０２４-01-01', '<b>raw</b>']) {
        const h = mount(); h.calculate(); const button = todayControl(h, endpoint), peer = h.x[endpoint === 'start' ? 'end' : 'start'];
        peer.value = raw; h.view.year.value = ' 0099\r\n'; h.view.month.value = '3'; h.view.jump.dispatch('click');
        const month = h.clock.calendarMonth, rows = h.view.body.children, caption = h.view.caption.textContent,
            error = h.view.error.textContent, announcement = h.view.announcement.textContent, calculations = h.calculations;
        peer.selectionStart = 1; peer.selectionEnd = 3; peer.selectionDirection = 'backward'; peer.focus();
        let peerWrites = 0;
        Object.defineProperty(peer, 'value', { configurable: true, get() { return raw; }, set() { peerWrites++; } });
        modeledLocalClock(h, [2024, 1, 29]); button.dispatch('click');
        assert.equal(h.x[endpoint].value, '2024-02-29'); assert.equal(peer.value, raw); assert.equal(peerWrites, 0);
        assert.equal(h.document.activeElement, peer); assert.deepEqual([peer.selectionStart, peer.selectionEnd, peer.selectionDirection], [1, 3, 'backward']);
        assert.equal(h.clock.calendarMonth, month); assert.equal(h.view.body.children, rows); assert.equal(h.view.caption.textContent, caption);
        assert.equal(h.view.year.value, ' 0099\r\n'); assert.equal(h.view.month.value, '3'); assert.equal(h.view.error.textContent, error);
        assert.equal(h.view.error.hidden, false); assert.equal(h.view.year.getAttribute('aria-invalid'), 'true'); assert.equal(h.view.announcement.textContent, announcement);
        assert.equal(h.calculations, calculations); assertClearedInterval(h);
        Object.defineProperty(peer, 'value', { configurable: true, writable: true, value: raw }); clean(h);
    }
});

test('endpoint Today clears invalid feedback without parsing the untouched peer or calculating automatically', () => {
    for (const endpoint of ['start', 'end']) {
        const h = mount(); h.calculate('1900-02-29', ' bad\r\n'); const button = todayControl(h, endpoint), calculations = h.calculations;
        const calendar = h.window.MonthCalendar, forbidden = () => { throw Error('Filling today must not parse drafts or calculate'); };
        h.window.MonthCalendar = { ...calendar, parseDateDraft: forbidden, parseMonthDraft: forbidden, dateInterval: forbidden };
        modeledLocalClock(h, [2024, 1, 29]); button.dispatch('click'); assert.equal(h.x[endpoint].value, '2024-02-29');
        assert.equal(h.x[endpoint === 'start' ? 'end' : 'start'].value, endpoint === 'start' ? ' bad\r\n' : '1900-02-29');
        assert.equal(h.calculations, calculations); assertClearedInterval(h); h.window.MonthCalendar = calendar; clean(h);
    }
});

test('endpoint Today ignores handled, repeated, composing and double-click continuation with native fresh-key behavior', () => {
    for (const endpoint of ['start', 'end']) {
        const h = mount(); h.calculate(); const button = todayControl(h, endpoint), before = intervalSnapshot(h);
        const time = modeledLocalClock(h, [2024, 1, 29]);
        for (const flags of [{ defaultPrevented: true }, { detail: 2 }, { detail: 3 }, { repeat: true }, { isComposing: true }, { keyCode: 229 }]) {
            button.dispatch('click', flags); assert.deepEqual(intervalSnapshot(h), before); assert.equal(time.captures, 0);
        }
        for (const key of ['Enter', ' ']) {
            for (const flags of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) assert.equal(button.dispatch('keydown', { key, ...flags }).prevented, true);
            assert.equal(button.dispatch('keydown', { key }).prevented, false, 'fresh activation remains native');
            assert.deepEqual(intervalSnapshot(h), before);
        }
        assert.equal(button.dispatch('keydown', { key: 'c', ctrlKey: true }).prevented, false);
        button.focus(); button.dispatch('click', { detail: 1 }); assert.equal(h.x[endpoint].value, '2024-02-29');
        time.at([2024, 2, 1]); button.dispatch('click', { detail: 2 }); assert.equal(h.x[endpoint].value, '2024-02-29'); assert.equal(time.captures, 1);
        button.dispatch('click', { detail: 1 }); assert.equal(h.x[endpoint].value, '2024-03-01'); assert.equal(time.captures, 2);
        assert.equal(h.document.activeElement, button); assert.equal(h.calculations, 1); clean(h);
    }
});

test('endpoint Today leaves all state untouched during either date-field or year-field composition', () => {
    for (const endpoint of ['start', 'end']) for (const name of ['year', 'start', 'end']) {
        const h = mount(); h.calculate(); const button = todayControl(h, endpoint), field = name === 'year' ? h.view.year : h.x[name];
        const before = intervalSnapshot(h), time = modeledLocalClock(h, [2024, 1, 29]); field.dispatch('compositionstart');
        for (const key of ['Enter', ' ']) assert.equal(button.dispatch('keydown', { key }).prevented, true);
        button.dispatch('click'); assert.deepEqual(intervalSnapshot(h), before); assert.equal(time.captures, 0);
        field.dispatch('compositionend'); field.dispatch('keyup', { key: 'Enter' }); button.dispatch('click');
        assert.equal(h.x[endpoint].value, '2024-02-29'); assert.equal(time.captures, 1); assertClearedInterval(h); clean(h);
    }
});

test('endpoint Today requires current owner, open visible calendar and both usable endpoint fields', () => {
    const unavailable = [h => { h.x.details.open = false; }, h => { h.view.details.open = false; }, h => { h.clock.enabled = false; },
        h => { h.document.hidden = true; }, h => { h.document.visibilityState = 'hidden'; }, h => { h.window.LocalItabContentLifecycle.departing = true; },
        h => { h.document.body.classList.add('dashboard-hidden'); }, h => h.host.remove(), h => { h.host.hidden = true; },
        h => { h.host.inert = true; }, h => h.host.setAttribute('aria-hidden', 'true'), h => { h.host.style.display = 'none'; },
        h => { h.host.style.visibility = 'hidden'; }, h => { h.host.style.visibility = 'collapse'; },
        h => { h.x.fields.hidden = true; }, h => { h.view.panel.inert = true; }];
    for (const key of ['button', 'start', 'end']) for (const change of [node => { node.hidden = true; }, node => { node.disabled = true; },
        node => { node.inert = true; }, node => node.setAttribute('aria-hidden', 'true'), node => { node.style.display = 'none'; },
        node => { node.style.visibility = 'hidden'; }, node => { node.style.visibility = 'collapse'; }, node => node.remove(),
        node => { node.getClientRects = () => []; }]) unavailable.push((h, button) => change(key === 'button' ? button : h.x[key]));
    unavailable.push((h, button) => { button.parentElement.hidden = true; });
    unavailable.push((h, button) => { button.remove(); h.view.panel.append(button); });
    unavailable.push(h => { const field = h.x.end; field.remove(); h.view.panel.append(field); });
    for (const endpoint of ['start', 'end']) for (const change of unavailable) {
        const h = mount(); h.calculate(); const button = todayControl(h, endpoint), time = modeledLocalClock(h, [2024, 1, 29]);
        change(h, button); const before = intervalSnapshot(h), focus = h.document.activeElement;
        button.dispatch('click'); assert.deepEqual(intervalSnapshot(h), before); assert.equal(time.captures, 0);
        assert.equal(h.document.activeElement, focus); assert.deepEqual(h.calls, []); clean(h);
    }
});

test('endpoint Today rejects connected superseded views and old clock owners', () => {
    for (const endpoint of ['start', 'end']) for (const replace of [h => h.rebuild(), h => h.remount()]) {
        const h = mount(); h.calculate(); const old = h.x, button = todayControl(h, endpoint);
        replace(h); h.calculate('0001-01-01', '0099-12-31'); const before = intervalSnapshot(h), oldBefore = intervalSnapshot(h, old);
        const time = modeledLocalClock(h, [2024, 1, 29]); assert.equal(button.isConnected, true); button.dispatch('click');
        assert.deepEqual(intervalSnapshot(h), before); assert.deepEqual(intervalSnapshot(h, old), oldBefore); assert.equal(time.captures, 0);
        todayControl(h, endpoint).dispatch('click'); assert.equal(h.x[endpoint].value, '2024-02-29'); assert.equal(time.captures, 1); assertClearedInterval(h); clean(h);
    }
});

test('endpoint Today retires pending copy feedback but retains the issued-write lock until actual success or failure', async () => {
    for (const endpoint of ['start', 'end']) for (const rejected of [false, true]) {
        const wait = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } });
        const original = h.calculate(); h.x.copy.dispatch('click'); const button = todayControl(h, endpoint); button.focus();
        modeledLocalClock(h, [2024, 2, 1]); button.dispatch('click'); assertClearedInterval(h); assert.equal(h.observers.size, 0);
        assert.equal(h.document.activeElement, button); assert.equal(h.calculations, 1); h.x.copy.dispatch('click'); assert.equal(calls.length, 1);
        h.x.calculate.dispatch('click'); const fresh = h.x.result.textContent; assert.notEqual(fresh, original);
        assert.equal(h.x.copy.getAttribute('aria-disabled'), 'true'); h.x.copy.dispatch('click'); assert.equal(calls.length, 1);
        if (rejected) wait.reject(Error('late denial')); else wait.resolve(); await settle(); h.flush();
        assert.equal(h.x.copyStatus.textContent, ''); assert.equal(h.x.copyStatus.hidden, true); assert.equal(h.document.activeElement, button);
        assert.equal(h.x.copy.getAttribute('aria-disabled'), 'false'); assert.equal(h.x.result.textContent, fresh);
        h.x.copy.dispatch('click'); await settle(); assert.deepEqual(calls, [original, fresh]); clean(h);
    }
});

test('same-value endpoint Today clears settled success or failure and still requires explicit recalculation', async () => {
    for (const endpoint of ['start', 'end']) for (const rejected of [false, true]) {
        const calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return rejected ? Promise.reject(Error('denied')) : Promise.resolve(); } } });
        const original = h.calculate('2024-02-29', '2024-02-29'); h.x.copy.dispatch('click'); await settle();
        assert.equal(h.x.copyStatus.hidden, false); assert.equal(h.observers.size, 1);
        modeledLocalClock(h, [2024, 1, 29]); todayControl(h, endpoint).dispatch('click'); assertClearedInterval(h); assert.equal(h.observers.size, 0);
        assert.equal(h.x.start.value, '2024-02-29'); assert.equal(h.x.end.value, '2024-02-29'); assert.equal(h.calculations, 1);
        h.x.copy.dispatch('click'); assert.deepEqual(calls, [original]); h.x.calculate.dispatch('click'); h.x.copy.dispatch('click'); await settle();
        assert.deepEqual(calls, [original, original]); assert.equal(h.calculations, 2); clean(h);
    }
});

test('endpoint Today cannot unlock an unresolved copy through same-date refill, rebuild or owner replacement', async () => {
    for (const replace of [h => h.rebuild(), h => h.remount()]) {
        const wait = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } });
        const original = h.calculate('2024-02-29', '2024-02-29'); h.x.copy.dispatch('click'); modeledLocalClock(h, [2024, 1, 29]); const old = h.x;
        todayControl(h, 'start').dispatch('click'); todayControl(h, 'end').dispatch('click'); h.x.calculate.dispatch('click');
        assert.equal(h.x.result.textContent, original); h.x.copy.dispatch('click'); assert.equal(calls.length, 1);
        replace(h); h.calculate(); old.startToday.dispatch('click'); old.endToday.dispatch('click');
        h.x.copy.dispatch('click'); old.copy.dispatch('click'); assert.equal(calls.length, 1);
        wait.resolve(); await settle(); assert.equal(old.copyStatus.textContent, ''); assert.equal(h.x.copyStatus.textContent, '');
        assert.equal(h.x.copy.getAttribute('aria-disabled'), 'false'); h.x.copy.dispatch('click'); await settle(); assert.equal(calls.length, 2); clean(h);
    }
});

test('endpoint Today remains stable across ticks/locales with no focus theft, extra timer, global keys or I/O', () => {
    for (const endpoint of ['start', 'end']) {
        const h = mount(); h.clock.start(); h.calculate(); const button = todayControl(h, endpoint), start = h.x.start, end = h.x.end;
        const other = h.view.year; other.value = '0099'; h.view.month.value = '11'; other.selectionStart = 1; other.selectionEnd = 2; other.focus();
        const month = h.clock.calendarMonth; modeledLocalClock(h, [2024, 1, 29]); button.dispatch('click');
        assert.equal(h.document.activeElement, other); assert.deepEqual([other.selectionStart, other.selectionEnd], [1, 2]); assertClearedInterval(h);
        const drafts = [start.value, end.value];
        for (const locale of ['zh_CN', 'en', null]) {
            h.locale(locale); h.tick(); h.clock.updateConfig({ hour12: true });
            assert.equal(todayControl(h, endpoint), button); assert.equal(h.x.start, start); assert.equal(h.x.end, end);
            assert.equal(button.textContent, locale === 'zh_CN' ? endpoint === 'start' ? '开始日期用今天' : '结束日期用今天' : `Use today for ${endpoint}`);
            assert.deepEqual([start.value, end.value], drafts); assert.equal(h.clock.calendarMonth, month);
            assert.equal(h.view.year.value, '0099'); assert.equal(h.view.month.value, '11'); assert.equal(h.document.activeElement, other);
            assert.deepEqual([other.selectionStart, other.selectionEnd], [1, 2]);
        }
        assert.equal(h.calculations, 1); assert.equal(h.timerCreations, 1); assert.equal(h.timers.size, 1); assert.deepEqual(h.calls, []);
        assert.equal(h.context.shouldToggleFromEvent({ target: button }), false); assert.equal(h.document.listeners.has('keydown'), false); assert.equal(h.events.has('keydown'), false);
        button.focus(); const escape = button.dispatch('keydown', { key: 'Escape' });
        assert.equal(escape.prevented, true); assert.equal(h.document.activeElement, h.view.summary); assert.equal(start.value, ''); assert.equal(end.value, '');
        clean(h, true);
    }
});
