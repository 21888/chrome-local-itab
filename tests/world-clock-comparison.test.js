const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');

const source = fs.readFileSync(path.join(__dirname, '../newtab.js'), 'utf8');
const helperSource = () => fs.readFileSync(path.join(__dirname, '../shared/world-clocks.js'), 'utf8');
const tokyo = { timeZone: 'Asia/Tokyo', label: 'Tokyo' };
const newYork = { timeZone: 'America/New_York', label: 'New York' };
const showDefaults = { clock: true, search: false, shortcuts: false, weather: false, hot: false, movie: false };

// Exercise the shipped ClockComponent and visibility function with real Intl,
// a DOM model, and one controlled clock. This does not simulate browser layout.
function model({ worldClocks = [], show = {}, locale = 'en', now = '2026-10-10T00:30:15Z', helper = true, config = {} } = {}) {
    const document = createDocument();
    document.hidden = false;
    const header = document.createElement('header');
    header.className = 'dashboard-header';
    const clockHost = document.createElement('section');
    clockHost.id = 'clock-container';
    const time = document.createElement('div');
    time.id = 'time-display';
    const date = document.createElement('div');
    date.id = 'date-display';
    clockHost.append(time, date);
    header.append(clockHost);
    const main = document.createElement('main');
    main.className = 'dashboard-main';
    const cards = document.createElement('section');
    cards.id = 'info-cards-container';
    const host = document.createElement('article');
    host.id = 'world-clocks-card';
    host.className = 'info-card world-clocks-card module-hidden';
    host.setAttribute('aria-labelledby', 'world-clocks-heading');
    host.hidden = true;
    cards.append(host);
    main.append(cards);
    document.body.append(header, main);
    let stamp = Date.parse(now), nextInterval = 0, intervalCreations = 0;
    const timers = new Map(), windowListeners = new Map();
    class TestDate extends Date {
        constructor(...args) { super(...(args.length ? args : [stamp])); }
        static now() { return stamp; }
    }
    let messages = JSON.parse(fs.readFileSync(path.join(__dirname, `../_locales/${locale}/messages.json`), 'utf8'));
    const i18n = { t(key, substitutions = []) {
        const message = messages[key]?.message || key;
        return message.replace(/\$([1-9])/g, (_, index) => substitutions[Number(index) - 1] ?? '');
    } };
    const window = { i18n, addEventListener(type, fn) {
        if (!windowListeners.has(type)) windowListeners.set(type, []);
        windowListeners.get(type).push(fn);
    } };
    const blocked = () => { throw new Error('Comparison must not perform I/O'); };
    const context = { fetch: blocked, XMLHttpRequest: blocked, localStorage: new Proxy({}, { get: blocked }), document, window, navigator: { language: 'en-US' }, Date: TestDate, Intl, console, i18n,
        chrome: { storage: new Proxy({}, { get: blocked }), i18n: { getMessage: key => messages[key]?.message || '' } },
        setInterval(fn, delay) { assert.equal(delay, 1000); intervalCreations++; timers.set(++nextInterval, fn); return nextInterval; },
        clearInterval(id) { timers.delete(id); }
    };
    vm.createContext(context);
    if (helper) vm.runInContext(helperSource(), context);
    vm.runInContext(source + '\nthis.ClockComponent = ClockComponent;', context);
    context.applyModuleVisibility({ ...showDefaults, ...show });
    const clock = new context.ClockComponent({ hour12: false, showSeconds: false, worldClocks, ...config });
    return { context, window, document, clock, host, main, cards, header, time, date, timers, windowListeners,
        locale(locale) { messages = JSON.parse(fs.readFileSync(path.join(__dirname, `../_locales/${locale}/messages.json`), 'utf8')); },
        get intervalCreations() { return intervalCreations; },
        at(iso) { stamp = Date.parse(iso); },
        tick() { for (const tick of [...timers.values()]) tick(); },
        visibility(hidden) { document.hidden = hidden; document.listeners.get('visibilitychange')(); },
        event(type) { for (const fn of windowListeners.get(type) || []) fn(); }
    };
}
function inTimeZone(zone, fn) {
    const before = process.env.TZ;
    process.env.TZ = zone;
    try { fn(); } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
}

function compare(h, minutes = 0) {
    const view = h.clock.worldClockComparisonView;
    if (!h.clock.worldClockComparison) view.toggle.dispatch('click');
    view.range.value = String(minutes); view.range.dispatch('input');
    return view;
}
function reading(h, zone = 0) { return h.clock.worldClockRows[zone].time.textContent; }

test('comparison is opt-in, bounded, keyboard-native, page-local and absent without configured clocks', () => {
    const empty = model(); assert.equal(empty.clock.worldClockComparisonView, null);
    const h = model({ worldClocks: [tokyo] }); h.clock.start();
    const view = h.clock.worldClockComparisonView;
    assert.equal(view.panel.hidden, true); assert.equal(view.toggle.textContent, 'Compare times');
    assert.equal(view.toggle.type, 'button'); assert.equal(view.toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(view.range.type, 'range'); assert.equal(view.range.min, '-1440'); assert.equal(view.range.max, '1440'); assert.equal(view.range.step, '15');
    assert.equal(view.label.htmlFor, view.range.id);
    assert.equal(view.range.getAttribute('aria-describedby'), view.reference.id);
    compare(h, 5000); assert.equal(h.clock.worldClockComparison.minutes, 1440);
    compare(h, -5000); assert.equal(h.clock.worldClockComparison.minutes, -1440);
    compare(h, 16); assert.equal(h.clock.worldClockComparison.minutes, 15); assert.equal(view.range.value, '15');
    compare(h, 'bad'); assert.equal(h.clock.worldClockComparison.minutes, 15);
    assert.equal(model({worldClocks: [tokyo]}).clock.worldClockComparison, null);
    assert.equal(h.intervalCreations, 1);
});

test('captured preview never drifts, only world clocks change, and Back to now restores live updates', () => inTimeZone('UTC', () => {
    const h = model({worldClocks: [tokyo, newYork], config: {showSeconds:true}}); h.clock.start();
    const view = compare(h, 75), frozen = reading(h), reference = view.reference.textContent;
    const originalMain = h.time.textContent;
    assert.equal(view.panel.hidden, false); assert.equal(view.toggle.textContent, 'Back to now');
    assert.equal(view.toggle.getAttribute('aria-expanded'), 'true');
    assert.match(reference, /Preview · Local: Oct 10, 2026, 01:45:15 UTC · \+75 min from start/);
    assert.equal(view.range.getAttribute('aria-valuetext'), reference);
    h.at('2026-10-11T08:22:00Z'); h.tick();
    assert.equal(reading(h), frozen); assert.equal(view.reference.textContent, reference); assert.notEqual(h.time.textContent, originalMain);
    h.visibility(true); h.at('2026-10-12T10:00:00Z'); h.visibility(false);
    assert.equal(reading(h), frozen); assert.equal(h.timers.size, 1);
    view.toggle.focus(); view.toggle.dispatch('click');
    assert.equal(h.document.activeElement, view.toggle); assert.equal(h.clock.worldClockComparison, null); assert.equal(view.panel.hidden, true);
    assert.equal(reading(h), h.window.WorldClocks.format(tokyo, new Date('2026-10-12T10:00:00Z'), h.clock.config, 'en-US').time);
    compare(h); assert.equal(h.clock.worldClockComparison.anchor, Date.parse('2026-10-12T10:00:00Z'));
}));

test('DST spring gaps and fall repeats use shared elapsed instants, including fractional zones', () => inTimeZone('America/New_York', () => {
    for (const [now, expected] of [['2026-03-08T06:30:00Z', '03:30'], ['2026-11-01T05:30:00Z', '01:30']]) {
        const h = model({now, worldClocks:[newYork, {timeZone:'Asia/Kathmandu',label:'Nepal'}, {timeZone:'Asia/Kolkata',label:'India'}]});
        h.clock.start(); compare(h, 60);
        const preview = new Date(Date.parse(now) + 3600000);
        assert.equal(reading(h), expected);
        for (let i=0;i<3;i++) assert.equal(reading(h,i), h.window.WorldClocks.format(h.clock.worldClockRows[i].entry, preview, h.clock.config, 'en-US').time);
        assert.match(h.clock.worldClockComparisonView.reference.textContent, now.includes('03-08') ? /EDT/ : /EST/);
    }
}));

test('preview day labels compare to the preview local calendar date, including two-day separation', () => inTimeZone('Pacific/Honolulu', () => {
    const h = model({now:'2026-10-10T09:30:00Z',worldClocks:[{timeZone:'Pacific/Kiritimati', label:''},newYork]});
    h.clock.start(); compare(h, 30);
    assert.equal(h.clock.worldClockRows[0].day.textContent,'Next day');
    assert.equal(h.clock.worldClockRows[1].day.textContent,'Same day');
    // UTC+14 and UTC-11 are 25 hours apart and may be two calendar dates apart.
    inTimeZone('Pacific/Pago_Pago', () => {
        h.at('2026-10-10T10:30:00Z'); h.clock.worldClockComparisonView.toggle.dispatch('click'); compare(h);
        assert.equal(h.clock.worldClockRows[0].day.textContent,'+2 days');
    });
}));

test('clock/template updates preserve anchored state and control focus; catalog refresh and removal are safe', () => {
    const h = model({worldClocks:[tokyo]}); h.clock.start(); const view = compare(h,-15);
    const state = h.clock.worldClockComparison; view.range.focus(); h.at('2026-10-11T06:00:00Z');
    h.clock.updateConfig({hour12:true,showSeconds:true,worldClocks:[newYork,tokyo]});
    assert.equal(h.clock.worldClockComparisonView,view); assert.equal(h.clock.worldClockComparison,state);
    assert.equal(h.document.activeElement,view.range); assert.equal(view.range.value,'-15');
    assert.equal(reading(h),h.window.WorldClocks.format(newYork,new Date(state.anchor-900000),h.clock.config,'en-US').time);
    h.locale('zh_CN'); h.tick(); assert.equal(view.toggle.textContent,'返回当前时间'); assert.match(view.reference.textContent,/预览 · 本地/);
    h.clock.setEnabled(false); h.clock.setEnabled(true); assert.equal(h.clock.worldClockComparison,state);
    h.clock.updateConfig({worldClocks:[]}); assert.equal(h.host.hidden,true); assert.equal(h.clock.worldClockComparison,null);
    h.clock.updateConfig({worldClocks:[tokyo]}); assert.equal(h.clock.worldClockComparisonView.panel.hidden,true);
    assert.equal(h.timers.size,1);
});

test('retired or detached controls cannot resurrect or alter another comparison', () => {
    const h = model({worldClocks:[tokyo]}); h.clock.start(); const old = compare(h,30);
    h.clock.updateConfig({worldClocks:[]}); old.toggle.dispatch('click');
    assert.equal(h.clock.worldClockComparison,null);
    h.clock.updateConfig({worldClocks:[tokyo]}); const current = compare(h,60);
    const state = {...h.clock.worldClockComparison};
    old.toggle.dispatch('click'); old.range.value='-1440'; old.range.dispatch('input');
    assert.deepEqual({...h.clock.worldClockComparison},state);
    h.clock.setEnabled(false); current.toggle.dispatch('click'); current.range.value='120'; current.range.dispatch('input');
    assert.deepEqual({...h.clock.worldClockComparison},state);
    h.clock.setEnabled(true); current.controls.remove(); current.toggle.dispatch('click'); current.range.dispatch('input');
    assert.deepEqual({...h.clock.worldClockComparison},state);
});
