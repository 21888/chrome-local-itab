const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const source = fs.readFileSync('newtab.js', 'utf8');
const tokyo = { timeZone: 'Asia/Tokyo', label: 'Tokyo' };
const newYork = { timeZone: 'America/New_York', label: 'New York' };
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

// Shipped ClockComponent + real WorldClocks/Intl. The bounded DOM/clipboard model
// queues explicit mutation records; it does not establish native activation,
// OS clipboard contents, assistive-technology announcements or visual layout.
function mount({ worldClocks = [tokyo, newYork], locale = 'en', config = {}, clipboard, calendar = false, now = '2026-10-10T00:30:15Z' } = {}) {
    const document = createDocument({ blurUnavailableFocus: true });
    document.hidden = false;
    const events = new Map(), observers = new Set(), calls = [], io = [], timers = new Map();
    let nextTimer = 0, timerCreations = 0, stamp = Date.parse(now), dateReads = 0, formats = 0, calendarDates = 0;
    let messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const forbidden = () => { io.push('forbidden'); throw new Error('Unexpected I/O'); };
    const queue = record => { for (const observer of observers) observer.records.push(record); };
    // Model DOM text/hidden mutations automatically, including identical writes.
    // Real observed attributes/stylesheet effects are also probed with explicit records.
    const proto = Object.getPrototypeOf(document.body);
    for (const property of ['textContent', 'hidden']) {
        const descriptor = Object.getOwnPropertyDescriptor(proto, property);
        Object.defineProperty(proto, property, { ...descriptor, set(value) {
            const before = this[property]; descriptor.set.call(this, value);
            if (property === 'hidden') queue({ type: 'attributes', target: this, attributeName: 'hidden' });
            else queue({ type: 'childList', target: this, removedNodes: before === undefined ? [] : [{ parentElement: null, contains: () => false }] });
        } });
    }
    const window = {
        i18n: { t(key, substitutions = []) { return (messages[key]?.message || key).replace(/\$([1-9])/g, (_, n) => substitutions[Number(n) - 1] ?? ''); } },
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
    class TestDate extends Date {
        constructor(...args) { dateReads++; super(...(args.length ? args : [stamp])); }
        static now() { dateReads++; return stamp; }
    }
    const header = document.createElement('header'); header.className = 'dashboard-header';
    const clockHost = document.createElement('section'); clockHost.id = 'clock-container';
    const time = document.createElement('div'); time.id = 'time-display';
    const date = document.createElement('div'); date.id = 'date-display'; clockHost.append(time, date); header.append(clockHost);
    const main = document.createElement('main'); main.className = 'dashboard-main';
    const cards = document.createElement('section'); cards.id = 'info-cards-container';
    const host = document.createElement('article'); host.id = 'world-clocks-card'; host.className = 'info-card world-clocks-card';
    cards.append(host); main.append(cards); document.body.append(header, main);
    document.execCommand = forbidden;
    const context = vm.createContext({ document, window, navigator: window.navigator, Date: TestDate, Intl, console, i18n: window.i18n,
        chrome: { storage: new Proxy({}, { get: forbidden }), i18n: { getMessage: key => messages[key]?.message || '' } },
        fetch: forbidden, XMLHttpRequest: forbidden, localStorage: new Proxy({}, { get: forbidden }),
        setInterval(fn, delay) { assert.equal(delay, 1000); timerCreations++; timers.set(++nextTimer, fn); return nextTimer; },
        clearInterval(id) { timers.delete(id); }
    });
    for (const file of ['shared/world-clocks.js', 'shared/local-content-lifecycle.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    if (calendar) vm.runInContext(fs.readFileSync('shared/month-calendar.js', 'utf8'), context);
    const realWorldClocks = window.WorldClocks;
    window.WorldClocks = { ...realWorldClocks,
        format(...args) { formats++; return realWorldClocks.format(...args); },
        calendarDate(...args) { calendarDates++; return realWorldClocks.calendarDate(...args); }
    };
    vm.runInContext(source + '\nthis.ClockComponent = ClockComponent;', context);
    context.applyModuleVisibility({ clock: true, search: false, shortcuts: false, weather: false, hot: false, movie: false });
    let clock = new context.ClockComponent({ hour12: false, showSeconds: false, worldClocks, ...config });
    const h = { document, window, context, host, main, cards, time, date, calls, io, events, observers, timers,
        get clock() { return clock; }, get view() { return clock.worldClockComparisonView; },
        get messages() { return messages; }, get dateReads() { return dateReads; }, get formats() { return formats; }, get calendarDates() { return calendarDates; }, get timerCreations() { return timerCreations; },
        compare(minutes = 0) { if (!clock.worldClockComparison) this.view.toggle.dispatch('click'); this.view.range.value = String(minutes); this.view.range.dispatch('input'); return this.view; },
        summary() { return [this.view.reference.textContent, ...clock.worldClockRows.map(row => [row.label.textContent, row.time.textContent, row.day.textContent].join(' · '))].join('\n'); },
        at(iso) { stamp = Date.parse(iso); }, tick() { for (const fn of [...timers.values()]) fn(); },
        locale(next) { messages = next ? JSON.parse(fs.readFileSync(`_locales/${next}/messages.json`, 'utf8')) : {}; },
        remount(next = {}) { clock.stop(); clock = new context.ClockComponent({ ...clock.config, ...next }); return clock; },
        emit(type) { for (const fn of [...(events.get(type) || [])]) fn(); },
        mutations(records, queued = false) { for (const observer of [...observers]) { if (queued) observer.records.push(...records); else observer.callback(records); } },
        flushMutations() { for (const observer of [...observers]) { const records = observer.takeRecords(); if (records.length) observer.callback(records); } }
    };
    return h;
}
function clean(h, started = false) {
    assert.equal(h.observers.size, 0, 'pending observer removed');
    assert.equal(h.events.get('pagehide')?.size || 0, 0, 'pending pagehide listener removed');
    assert.equal(h.events.get('blur')?.size || 0, started ? 1 : 0, 'only existing clock blur listener remains');
    assert.equal(h.document.listeners.has('visibilitychange'), started, 'only existing clock visibility listener remains');
    assert.deepEqual(h.io, [], 'no storage, network, permission, legacy or clipboard-read I/O');
}
function inTimeZone(zone, fn) {
    const before = process.env.TZ; process.env.TZ = zone;
    return Promise.resolve().then(fn).finally(() => { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; });
}

test('comparison has an explicit copy button and independent live status, without copying on render', () => {
    const h = mount();
    assert(h.view.copy, 'Compare times needs an explicit Copy comparison button');
    assert.equal(h.view.copy.tagName, 'BUTTON'); assert.equal(h.view.copy.type, 'button'); assert.equal(h.view.copy.tabIndex, 0);
    assert.equal(h.view.panel.contains(h.view.copy), true); assert.equal(h.view.panel.hidden, true);
    assert.equal(h.view.copy.textContent, 'Copy comparison'); assert.equal(h.view.copyStatus.getAttribute('role'), 'status');
    assert.equal(h.view.copyStatus.getAttribute('aria-live'), 'polite'); assert.equal(h.view.copyStatus.getAttribute('aria-atomic'), 'true');
    assert.equal(h.view.copyStatus.textContent, ''); assert.equal(h.view.copyStatus.hidden, true);
    h.view.copy.dispatch('click'); assert.deepEqual(h.calls, []); h.compare(); assert.deepEqual(h.calls, []); clean(h);
});

test('explicit activation copies rendered order and Unicode text exactly, without rereading time or formatting', async () => {
    for (const locale of ['en', 'zh_CN', null]) {
        const h = mount({ locale: locale || 'en', worldClocks: [newYork, { timeZone: 'Asia/Kathmandu', label: '家人 👩🏽‍💻 e\u0301' }, tokyo] });
        if (!locale) h.locale(null);
        h.compare(15);
        // Copy is deliberately a rendered-text export, including any exact Unicode spacing.
        h.clock.worldClockRows[1].label.textContent = '  家人 👩🏽‍💻 e\u0301\u00a0 ';
        h.clock.worldClockRows[1].time.textContent = '06:30\u202fAM';
        const expected = h.summary(), reads = h.dateReads, formats = h.formats, calendarDates = h.calendarDates, comparison = { ...h.clock.worldClockComparison };
        h.view.copy.focus(); h.view.copy.dispatch('click');
        assert.equal(h.calls.length, 1, 'write starts synchronously from the explicit button click');
        assert.equal(h.calls[0], expected); assert.equal(h.dateReads, reads); assert.equal(h.formats, formats); assert.equal(h.calendarDates, calendarDates);
        assert.equal(h.view.copyStatus.textContent, h.messages.worldClockCopying?.message || 'Copying comparison…');
        await settle();
        assert.equal(h.view.copyStatus.textContent, h.messages.worldClockCopySuccess?.message || 'Comparison copied.');
        assert.equal(h.document.activeElement, h.view.copy); assert.deepEqual({ ...h.clock.worldClockComparison }, comparison);
        assert.equal(h.view.copy.getAttribute('aria-disabled'), 'false'); assert.equal(h.summary(), expected); clean(h);
    }
});

test('real Intl formatting survives 12/24 hours, seconds, DST and previous/next/two-day comparisons', async () => {
    const cases = [
        { zone: 'America/New_York', now: '2026-03-08T06:30:15Z', minutes: 60, hour12: false, showSeconds: true, locale: 'en', clocks: [newYork, { timeZone: 'Asia/Kathmandu', label: 'नेपाल' }] },
        { zone: 'America/New_York', now: '2026-11-01T05:30:15Z', minutes: 60, hour12: true, showSeconds: false, locale: 'zh_CN', clocks: [newYork, tokyo] },
        { zone: 'Pacific/Pago_Pago', now: '2026-10-10T10:30:15Z', minutes: 0, hour12: false, showSeconds: false, locale: 'en', clocks: [{ timeZone: 'Pacific/Kiritimati', label: 'Island' }, tokyo] },
        { zone: 'Pacific/Kiritimati', now: '2026-10-10T10:30:15Z', minutes: -15, hour12: true, showSeconds: true, locale: 'zh_CN', clocks: [{ timeZone: 'Pacific/Pago_Pago', label: 'Island' }, newYork] }
    ];
    for (const options of cases) await inTimeZone(options.zone, async () => {
        const h = mount({ now: options.now, locale: options.locale, worldClocks: options.clocks, config: options });
        h.compare(options.minutes); const summary = h.summary();
        assert.equal(summary.split('\n').length, options.clocks.length + 1);
        const instant = new Date(Date.parse(options.now) + options.minutes * 60000);
        for (const row of h.clock.worldClockRows) assert.equal(row.time.textContent, h.window.WorldClocks.format(row.entry, instant, h.clock.config, 'en-US').time);
        if (options.zone === 'Pacific/Pago_Pago') assert.equal(h.clock.worldClockRows[0].day.textContent, '+2 days · 2026-10-11');
        if (options.zone === 'Pacific/Kiritimati') assert.equal(h.clock.worldClockRows[0].day.textContent, '-2 天 · 2026-10-09');
        h.view.copy.dispatch('click'); await settle(); assert.deepEqual(h.calls, [summary]);
        assert.equal(h.summary(), summary); clean(h);
    });
});

test('missing API, synchronous throw and rejected promise give local manual-copy feedback and explicit retry', async () => {
    for (const failure of ['missing', 'throw', 'reject']) {
        let calls = 0;
        const h = mount({ clipboard: failure === 'missing' ? null : { writeText() { calls++; if (failure === 'throw') throw new Error('private error'); return Promise.reject(new Error('private error')); } } });
        h.compare(); const before = h.summary(), reference = h.view.reference.textContent;
        h.view.copy.focus(); h.view.copy.dispatch('click'); await settle();
        assert.equal(calls, failure === 'missing' ? 0 : 1);
        assert.equal(h.view.copyStatus.textContent, h.messages.worldClockCopyFailure.message);
        assert(h.view.copyStatus.classList.contains('is-error')); assert.equal(h.summary(), before);
        assert.equal(h.view.reference.textContent, reference); assert.equal(h.document.activeElement, h.view.copy); clean(h);
        await settle(); assert.equal(calls, failure === 'missing' ? 0 : 1, 'no automatic retry');
        h.window.navigator.clipboard = { writeText(text) { calls++; assert.equal(text, before); return Promise.resolve(); } };
        h.view.copy.dispatch('click'); await settle(); assert.equal(h.view.copyStatus.textContent, h.messages.worldClockCopySuccess.message);
        assert.equal(h.view.copyStatus.classList.contains('is-error'), false); clean(h);
    }
});

test('pending write blocks repeated clicks without disabling focus or inventing keyboard shortcuts', async () => {
    const wait = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } });
    h.compare(); h.view.copy.focus(); h.view.copy.dispatch('click');
    assert.equal(h.view.copy.getAttribute('aria-disabled'), 'true'); assert.notEqual(h.view.copy.disabled, true);
    assert.equal(h.observers.size, 1); assert.equal(h.events.get('blur').size, 1); assert.equal(h.events.get('pagehide').size, 1);
    h.view.copy.dispatch('click'); h.view.copy.dispatch('click', { detail: 2 });
    for (const key of ['Enter', ' ']) {
        for (const flags of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) assert(h.view.copy.dispatch('keydown', { key, ...flags }).prevented);
        assert.equal(h.view.copy.dispatch('keydown', { key }).prevented, false, 'native button activation remains normal');
    }
    assert.equal(h.view.copy.dispatch('keydown', { key: 'c', ctrlKey: true }).prevented, false);
    assert.equal(calls.length, 1); assert.equal(h.document.activeElement, h.view.copy);
    wait.resolve(); await settle(); clean(h);
    h.view.copy.dispatch('click', { detail: 2 }); assert.equal(calls.length, 1);
    h.view.copy.dispatch('click'); await settle(); assert.equal(calls.length, 2); clean(h);
});

test('fixed preview ticks retain pending and settled receipts, one timer, and the live main clock', async () => {
    const wait = deferred(), h = mount({ clipboard: { writeText() { return wait.promise; } } });
    h.clock.start(); h.compare(75); const summary = h.summary(), mainTime = h.time.textContent;
    h.view.copy.focus(); h.view.copy.dispatch('click');
    for (const now of ['2026-10-11T08:22:00Z', '2026-10-12T09:22:01Z', '2026-10-13T09:22:02Z']) {
        h.at(now); h.tick(); h.flushMutations();
        assert.equal(h.summary(), summary); assert.equal(h.view.copyStatus.textContent, h.messages.worldClockCopying.message);
        assert.equal(h.observers.size, 1); assert.equal(h.timerCreations, 1);
    }
    assert.notEqual(h.time.textContent, mainTime); wait.resolve(); await settle();
    assert.equal(h.view.copyStatus.textContent, h.messages.worldClockCopySuccess.message);
    h.tick(); h.flushMutations(); assert.equal(h.view.copyStatus.textContent, h.messages.worldClockCopySuccess.message);
    assert.equal(h.document.activeElement, h.view.copy); assert.equal(h.timers.size, 1); clean(h, true);
});

test('slider same-value, invalid and ABA edits, exit/reentry, locale/config and rebuild retire late outcomes', async () => {
    const interruptions = [
        h => h.view.range.dispatch('input'),
        h => { h.view.range.value = 'bad'; h.view.range.dispatch('input'); },
        h => { h.compare(15); h.compare(0); },
        h => { h.view.toggle.dispatch('click'); h.compare(); },
        h => { h.locale('zh_CN'); h.clock.updateDisplay(); h.locale('en'); h.clock.updateDisplay(); },
        h => h.clock.updateConfig({ hour12: true, showSeconds: true }),
        h => h.clock.renderWorldClocks(),
        h => { h.clock.setEnabled(false); h.clock.setEnabled(true); },
        h => { h.clock.updateConfig({ worldClocks: [] }); h.clock.updateConfig({ worldClocks: [tokyo] }); h.compare(); }
    ];
    for (const [index, interrupt] of interruptions.entries()) {
        const wait = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } });
        h.compare(); h.view.copy.dispatch('click'); interrupt(h);
        const input = h.document.createElement('input'); h.document.body.append(input); input.focus();
        const summary = h.summary(), comparison = { ...h.clock.worldClockComparison };
        h.view.copy.dispatch('click'); assert.equal(calls.length, 1, 'invalidating feedback does not free the system lock');
        assert.equal(h.observers.size, 0, 'invalidated observer cleaned immediately');
        if (index % 2) wait.reject(new Error('late denial')); else wait.resolve();
        await settle(); assert.equal(h.view.copyStatus.textContent, ''); assert.equal(h.view.copyStatus.hidden, true);
        assert.equal(h.view.copy.getAttribute('aria-disabled'), 'false'); assert.equal(h.document.activeElement, input);
        assert.equal(h.summary(), summary); assert.deepEqual({ ...h.clock.worldClockComparison }, comparison); clean(h);
    }
});

test('card and ClockComponent replacement share a lock until settlement and preserve only owned focus', async () => {
    for (const rejected of [false, true]) {
        const wait = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } });
        h.compare(45); const comparison = h.clock.worldClockComparison, oldView = h.view;
        h.view.copy.focus(); h.view.copy.dispatch('click'); h.clock.renderWorldClocks();
        assert.equal(h.document.activeElement, h.view.copy); assert.equal(h.clock.worldClockComparison, comparison);
        assert.equal(h.view.copyStatus.hidden, true); assert.equal(h.view.copy.getAttribute('aria-disabled'), 'true');
        for (let count = 0; count < 3; count++) {
            h.remount({ worldClocks: [newYork] }); h.compare(count * 15);
            assert.equal(h.view.copy.getAttribute('aria-disabled'), 'true');
            h.view.copy.dispatch('click'); oldView.copy.dispatch('click'); assert.equal(calls.length, 1); assert.equal(h.observers.size, 0);
        }
        const input = h.document.createElement('input'); h.document.body.append(input); input.focus();
        if (rejected) wait.reject(new Error('old request')); else wait.resolve();
        await settle(); assert.equal(h.view.copyStatus.hidden, true); assert.equal(oldView.copyStatus.hidden, true);
        assert.equal(h.view.copy.getAttribute('aria-disabled'), 'false'); assert.equal(h.document.activeElement, input); clean(h);
        h.clock.renderWorldClocks(); assert.equal(h.document.activeElement, input, 'render does not steal unrelated focus');
        h.window.navigator.clipboard.writeText = text => { calls.push(text); return Promise.resolve(); };
        h.view.copy.dispatch('click'); await settle(); assert.equal(calls.length, 2); assert.equal(calls[1], h.summary()); clean(h);
    }
});

test('hidden/inert/CSS/aria-hidden, detached, departing, empty and live contexts never write', async () => {
    const unavailable = [
        h => { h.host.hidden = true; }, h => { h.host.inert = true; }, h => h.host.setAttribute('aria-hidden', 'true'),
        h => { h.host.style.visibility = 'hidden'; }, h => { h.host.style.visibility = 'collapse'; }, h => { h.host.style.display = 'none'; },
        h => h.host.remove(), h => { h.document.hidden = true; }, h => { h.document.visibilityState = 'hidden'; },
        h => h.window.LocalItabContentLifecycle.allowDeparture(), h => h.view.toggle.dispatch('click'),
        h => { h.view.reference.textContent = ''; }, h => { h.clock.worldClockRows[0].time.textContent = ''; },
        h => h.clock.worldClockRows[0].label.parentElement.remove(), h => { h.clock.worldClockRows[0].day.hidden = true; },
        h => h.document.body.classList.add('dashboard-hidden'), h => h.clock.setEnabled(false)
    ];
    for (const unavailableState of unavailable) {
        const h = mount(); h.compare(); unavailableState(h); h.view.copy.dispatch('click'); await settle();
        assert.deepEqual(h.calls, []); assert.equal(h.view.copyStatus.hidden, true); clean(h);
    }
    const empty = mount({ worldClocks: [] }); assert.equal(empty.view, null); assert.deepEqual(empty.calls, []); clean(empty);
});

test('transient hide/restore and detach/return invalidate delivered or queued mutations before late success/rejection', async () => {
    for (const [index, attribute] of ['hidden', 'inert', 'aria-hidden', 'style', 'class', 'detach'].entries()) {
        for (const queued of [false, true]) {
            const wait = deferred(), calls = [], h = mount({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } });
            h.compare(); h.view.copy.dispatch('click'); let record;
            if (attribute === 'detach') {
                h.host.remove(); h.cards.append(h.host); record = { type: 'childList', target: h.cards, removedNodes: [h.host] };
            } else {
                if (attribute === 'hidden' || attribute === 'inert') { h.host[attribute] = true; h.host[attribute] = false; }
                else if (attribute === 'aria-hidden') { h.host.setAttribute(attribute, 'true'); h.host.setAttribute(attribute, 'false'); }
                else if (attribute === 'style') { h.host.style.display = 'none'; h.host.style.display = ''; }
                else { h.host.classList.add('module-hidden'); h.host.classList.remove('module-hidden'); }
                record = { type: 'attributes', target: h.host, attributeName: attribute };
            }
            h.mutations([record], queued); h.view.copy.dispatch('click'); assert.equal(calls.length, 1);
            if (index % 2) wait.reject(new Error('late denial')); else wait.resolve();
            await settle(); assert.equal(h.view.copyStatus.hidden, true); assert.equal(h.view.copyStatus.textContent, ''); clean(h);
        }
    }
});

test('display text changes, including ABA and character-data mutation, invalidate only the old receipt', async () => {
    for (const direct of ['new text', 'ABA text', 'date text', 'date ABA', 'characterData', 'device zone']) {
        const wait = deferred(), h = mount({ clipboard: { writeText() { return wait.promise; } } });
        h.compare(); h.view.copy.dispatch('click'); const label = direct.startsWith('date') ? h.clock.worldClockRows[0].day : h.clock.worldClockRows[0].label;
        if (direct === 'device zone') {
            await inTimeZone('Pacific/Kiritimati', () => h.clock.updateDisplay());
        } else if (direct === 'characterData') {
            h.mutations([{ type: 'characterData', target: { parentElement: label } }], true);
        } else {
            const before = label.textContent; label.textContent = 'Changed'; if (direct === 'ABA text' || direct === 'date ABA') label.textContent = before;
        }
        wait.resolve(); await settle(); assert.equal(h.view.copyStatus.hidden, true); assert.equal(h.view.copyStatus.textContent, ''); clean(h);
    }
});

test('visibilitychange, blur and pagehide preserve the existing clock lifecycle and clear pending listeners', async () => {
    for (const type of ['visibilitychange', 'blur', 'pagehide']) {
        const wait = deferred(), h = mount({ clipboard: { writeText() { return wait.promise; } } });
        h.clock.start(); h.compare(); const comparison = h.clock.worldClockComparison;
        h.view.copy.dispatch('click');
        if (type === 'visibilitychange') { h.document.hidden = true; await h.document.listeners.get(type)(); h.document.hidden = false; await h.document.listeners.get(type)(); }
        else h.emit(type);
        assert.equal(h.observers.size, 0); assert.equal(h.clock.worldClockComparison, comparison);
        const input = h.document.createElement('input'); h.document.body.append(input); input.focus();
        wait.reject(new Error('after departure')); await settle(); assert.equal(h.view.copyStatus.hidden, true);
        assert.equal(h.document.activeElement, input); assert.equal(h.timers.size, 1); clean(h, true);
    }
});

test('synchronous clipboard reentry cannot write from a replacement or leak an old receipt', async () => {
    const wait = deferred(), calls = []; let h;
    h = mount({ clipboard: { writeText(text) { calls.push(text); h.remount({ worldClocks: [newYork] }); h.compare(15); h.view.copy.dispatch('click'); return wait.promise; } } });
    h.compare(); h.view.copy.dispatch('click'); assert.equal(calls.length, 1);
    assert.equal(h.view.copy.getAttribute('aria-disabled'), 'true'); wait.resolve(); await settle();
    assert.equal(h.view.copyStatus.hidden, true); assert.equal(h.view.copy.getAttribute('aria-disabled'), 'false'); clean(h);
});

test('copy styling wraps within comparison and preserves visible focus and failure contrast hooks', () => {
    const css = fs.readFileSync('newtab.css', 'utf8');
    assert.match(css, /\.world-clock-comparison button\s*\{[^}]*max-width:\s*100%[^}]*white-space:\s*normal/);
    assert.match(css, /\.world-clock-comparison button:focus-visible[^}]*outline:/);
    assert.match(css, /\.world-clock-comparison \[hidden\]\s*\{\s*display:\s*none !important/);
    assert.match(css, /\.world-clock-comparison-copy-status\.is-error\s*\{[^}]*var\(--template-error,/);
});


test('copy and cancellation leave the real calendar month, draft, announcements and shared timer intact', async () => {
    const wait = deferred(), h = mount({ calendar: true, clipboard: { writeText() { return wait.promise; } } });
    h.clock.start(); const calendar = h.clock.monthCalendar;
    calendar.details.open = true; calendar.details.dispatch('toggle'); calendar.next.dispatch('click');
    calendar.year.value = '2040'; calendar.month.value = '3';
    const month = { ...h.clock.calendarMonth }, caption = calendar.caption.textContent, announcement = calendar.announcement.textContent;
    h.compare(75); const summary = h.summary(); h.view.copy.dispatch('click');
    h.at('2026-10-11T12:20:00Z'); h.tick(); h.flushMutations();
    assert.equal(h.view.copyStatus.textContent, h.messages.worldClockCopying.message);
    h.emit('blur'); calendar.year.focus(); wait.reject(new Error('cancelled receipt')); await settle();
    assert.equal(h.view.copyStatus.hidden, true); assert.equal(calendar.details.open, true);
    assert.equal(calendar.year.value, '2040'); assert.equal(calendar.month.value, '3');
    assert.deepEqual({ ...h.clock.calendarMonth }, month); assert.equal(calendar.caption.textContent, caption);
    assert.equal(calendar.announcement.textContent, announcement); assert.equal(h.document.activeElement, calendar.year);
    assert.equal(h.summary(), summary); assert.equal(h.timerCreations, 1); assert.equal(h.timers.size, 1); clean(h, true);
});

test('copy includes each displayed full date verbatim without calling time or date helpers at activation', async () => inTimeZone('UTC', async () => {
    const h = mount({ now: '2026-12-31T15:00:00Z' }); h.compare();
    const expected = `${h.view.reference.textContent}\nTokyo · 00:00 · Next day · 2027-01-01\nNew York · 10:00 · Same day · 2026-12-31`;
    assert.equal(h.summary(), expected);
    const reads = h.dateReads, formats = h.formats, dates = h.calendarDates;
    assert(dates > 0, 'render uses the target-zone calendarDate helper');
    h.view.copy.dispatch('click');
    assert.deepEqual(h.calls, [expected]); assert.equal(h.dateReads, reads); assert.equal(h.formats, formats); assert.equal(h.calendarDates, dates);
    await settle(); clean(h);
    // Even an altered date is exported from visible text, never silently recalculated at click time.
    h.clock.worldClockRows[0].day.textContent = 'Next day · 2032-02-29';
    const visible = h.summary(); h.view.copy.dispatch('click'); await settle();
    assert.equal(h.calls[1], visible); assert.equal(h.dateReads, reads); assert.equal(h.formats, formats); assert.equal(h.calendarDates, dates); clean(h);
}));
