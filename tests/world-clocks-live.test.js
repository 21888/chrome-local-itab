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
    const messages = JSON.parse(fs.readFileSync(path.join(__dirname, `../_locales/${locale}/messages.json`), 'utf8'));
    const i18n = { t(key, substitutions = []) {
        const message = messages[key]?.message || key;
        return message.replace(/\$([1-9])/g, (_, index) => substitutions[Number(index) - 1] ?? '');
    } };
    const window = { i18n, addEventListener(type, fn) {
        if (!windowListeners.has(type)) windowListeners.set(type, []);
        windowListeners.get(type).push(fn);
    } };
    const context = { document, window, navigator: { language: 'en-US' }, Date: TestDate, Intl, console, i18n,
        chrome: { i18n: { getMessage: key => messages[key]?.message || '' } },
        setInterval(fn, delay) { assert.equal(delay, 1000); intervalCreations++; timers.set(++nextInterval, fn); return nextInterval; },
        clearInterval(id) { timers.delete(id); }
    };
    vm.createContext(context);
    if (helper) vm.runInContext(helperSource(), context);
    vm.runInContext(source + '\nthis.ClockComponent = ClockComponent;', context);
    context.applyModuleVisibility({ ...showDefaults, ...show });
    const clock = new context.ClockComponent({ hour12: false, showSeconds: false, worldClocks, ...config });
    return { context, window, document, clock, host, main, cards, header, time, date, timers, windowListeners,
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


const clone = value => JSON.parse(JSON.stringify(value));
function liveHarness(showClock = true) {
    const h = model({worldClocks: [], show: {clock: showClock}});
    let raw = {clock: {hour12: false, showSeconds: false, worldClocks: []}, show: {clock: showClock}};
    const listeners = [], reads = []; let delayed = false;
    h.context.chrome.storage = {onChanged: {addListener(fn) { listeners.push(fn); }}, local: {get(keys) {
        assert.deepEqual(Array.from(keys), ['clock', 'show']);
        const snapshot = clone(raw);
        if (delayed) return new Promise(resolve => reads.push({resolve, snapshot}));
        return Promise.resolve(snapshot);
    }}};
    if (showClock) { h.context.existingClock = h.clock; vm.runInContext('clockComponentInstance = existingClock;', h.context); h.clock.start(); }
    h.refresh = h.context.setupClockPreferenceListener(clone(raw));
    return Object.assign(h, {listeners, reads,
        getRaw: () => raw, replaceRaw: value => {raw = clone(value)}, delayReads: () => {delayed = true},
        change(values, area = 'local') {
            const changes = {};
            for (const [key, value] of Object.entries(values)) { changes[key] = {oldValue: raw[key], newValue: value}; if (area === 'local') { if (value === undefined) delete raw[key]; else raw[key] = clone(value); } }
            for (const listener of listeners) listener(changes, area);
        },
        instance: () => vm.runInContext('clockComponentInstance', h.context)
    });
}
test('local clock changes update owned card/main clock without reload or other draft changes', async () => {
    const h = liveHarness(); await h.refresh();
    const instance = h.instance(); const draft = h.document.createElement('input'); draft.value = 'unsaved search'; h.document.body.append(draft); draft.focus();
    h.change({clock: {hour12: true, showSeconds: true, worldClocks: [tokyo]}});
    assert.equal(h.instance(), instance); assert.equal(h.host.hidden, false); assert.equal(h.host.querySelector('.world-clock-label').textContent, 'Tokyo');
    assert.equal(h.time.textContent, instance.formatTime(new Date('2026-10-10T00:30:15Z')));
    assert.equal(instance.config.hour12, true); assert.equal(instance.config.showSeconds, true);
    assert.equal(draft.value, 'unsaved search'); assert.equal(h.document.activeElement, draft); assert.equal(h.timers.size, 1);
    h.change({clock: {hour12: false, showSeconds: false, worldClocks: []}}); assert.equal(h.host.hidden, true); assert.equal(h.cards.classList.contains('module-hidden'), true); assert.equal(h.timers.size, 1);
});
test('initially hidden clock creates once, disabled clocks never resume timers, and show updates remain scoped', async () => {
    const h = liveHarness(false); await h.refresh(); assert.equal(h.instance(), null); assert.equal(h.timers.size, 0);
    h.change({clock: {worldClocks: [tokyo]}, show: {clock: true, weather: true, search: true}});
    const instance = h.instance(); assert(instance); assert.equal(h.host.hidden, false); assert.equal(h.timers.size, 1);
    assert.equal(h.window.localItabModuleVisibility.weather, false); assert.equal(h.window.localItabModuleVisibility.search, false);
    h.change({show: {clock: false}}); assert.equal(h.host.hidden, true); assert.equal(h.timers.size, 0);
    h.event('focus'); await Promise.resolve(); assert.equal(h.timers.size, 0);
    h.visibility(true); h.visibility(false); assert.equal(h.timers.size, 0);
    h.change({show: {clock: true}}); assert.equal(h.instance(), instance); assert.equal(h.timers.size, 1);
    h.visibility(true); assert.equal(h.timers.size, 0); h.change({clock: {worldClocks: [newYork]}}); assert.equal(h.timers.size, 0);
    h.visibility(false); assert.equal(h.timers.size, 1); assert.equal(h.host.querySelector('.world-clock-label').textContent, 'New York');
});
test('deleted, legacy and corrupt clock values replace rather than merge preferences', async () => {
    const h = liveHarness(); await h.refresh(); h.change({clock: {hour12:true,showSeconds:false,worldClocks:[tokyo]}});
    h.change({clock: {hour12:false}}); assert.deepEqual(clone(h.instance().config), {hour12:false,showSeconds:true,worldClocks:[]}); assert.equal(h.host.hidden,true);
    h.change({clock: {hour12:true,showSeconds:false,worldClocks:'bad'}}); assert.deepEqual(clone(h.instance().config), {hour12:true,showSeconds:false,worldClocks:[]});
    h.change({clock: undefined, show: undefined}); assert.deepEqual(clone(h.instance().config), {hour12:false,showSeconds:true,worldClocks:[]}); assert.equal(h.timers.size,1);
    h.change({clock: null}); assert.deepEqual(clone(h.instance().config), {hour12:false,showSeconds:true,worldClocks:[]});
});
test('listeners are singleton and unrelated/local-sync events do not alter clock state', async () => {
    const h=liveHarness(); await h.refresh(); const instance=h.instance();
    assert.equal(h.context.setupClockPreferenceListener({}),h.refresh); assert.equal(h.listeners.length,1);
    const config=clone(instance.config); h.change({quote:'changed'}); h.change({clock:{worldClocks:[tokyo]}},'sync');
    assert.deepEqual(clone(instance.config),config); assert.equal(h.timers.size,1);
});
test('fresh reads close startup/focus gaps and stale reads cannot overwrite newer events or reads', async () => {
    const h=liveHarness(); await h.refresh(); h.delayReads();
    const first=h.refresh(); h.change({clock:{worldClocks:[tokyo]}}); h.reads.shift().resolve({clock:{worldClocks:[]},show:{clock:true}}); await first;
    assert.equal(h.instance().config.worldClocks[0].timeZone,'Asia/Tokyo');
    const older=h.refresh(), newer=h.refresh(); const a=h.reads.shift(),b=h.reads.shift();
    b.resolve({clock:{worldClocks:[newYork]},show:{clock:true}}); await newer;
    a.resolve({clock:{worldClocks:[tokyo]},show:{clock:false}}); await older;
    assert.equal(h.instance().config.worldClocks[0].timeZone,'America/New_York'); assert.equal(h.host.hidden,false); assert.equal(h.timers.size,1);
    const focus=h.refresh(); h.change({show:{clock:false}}); h.reads.shift().resolve({clock:{worldClocks:[tokyo]},show:{clock:true}}); await focus;
    assert.equal(h.host.hidden,true); assert.equal(h.timers.size,0); assert.equal(h.instance().config.worldClocks[0].timeZone,'Asia/Tokyo');
});
test('startup subscription wins an in-flight initial read and failed refresh preserves the current display', async () => {
    const h = liveHarness();
    h.change({clock: {hour12:true,showSeconds:false,worldClocks:[tokyo]}});
    await Promise.resolve(); await Promise.resolve();
    assert.equal(h.instance().config.worldClocks[0].timeZone,'Asia/Tokyo');
    const before=clone(h.instance().config);
    h.context.console={warn(){}};
    h.context.chrome.storage.local.get=async()=>{throw new Error('unavailable')};
    await h.refresh(); assert.deepEqual(clone(h.instance().config),before); assert.equal(h.timers.size,1);
    assert(source.includes('setupClockPreferenceListener(config);'));
});
