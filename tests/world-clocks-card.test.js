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

for (const worldClocks of [undefined, [], null, 'Asia/Tokyo', [{ timeZone: 'Not/AZone', label: 'Broken' }]]) {
    test(`empty or invalid world clocks hide the card and unused grid (${JSON.stringify(worldClocks)})`, () => {
        const h = model({ worldClocks });
        h.clock.start();
        assert.equal(h.host.hidden, true);
        assert(h.host.classList.contains('module-hidden'));
        assert(h.cards.classList.contains('module-hidden'));
        assert(!h.main.classList.contains('has-info-cards'));
        assert.equal(h.host.children.length, 0);
        assert.equal(h.timers.size, 1, 'only the existing main-clock timer runs');
        assert(h.time.textContent.length > 0);
    });
}

test('a missing helper safely leaves the main clock working and no optional card', () => {
    const h = model({ worldClocks: [tokyo], helper: false });
    h.clock.start();
    assert.equal(h.host.hidden, true);
    assert.equal(h.clock.worldClockRows.length, 0);
    assert(h.time.textContent);
});

test('a configured world-clock-only card keeps its grid visible and follows show.clock', () => {
    const h = model({ worldClocks: [tokyo, newYork] });
    h.clock.start();
    assert.equal(h.host.hidden, false);
    assert(!h.cards.classList.contains('module-hidden'));
    assert(h.main.classList.contains('has-info-cards'));
    assert.equal(h.host.querySelectorAll('li').length, 2);
    assert(!h.header.contains(h.host));
    h.context.applyModuleVisibility({ ...showDefaults, clock: false });
    assert.equal(h.host.hidden, true);
    assert(h.cards.classList.contains('module-hidden'));
    assert(!h.main.classList.contains('has-info-cards'));
    h.context.applyModuleVisibility(showDefaults);
    assert.equal(h.host.hidden, false);
    assert(h.main.classList.contains('has-info-cards'));
    h.clock.updateConfig({ worldClocks: [] });
    assert.equal(h.host.hidden, true);
    assert(h.cards.classList.contains('module-hidden'));
    h.clock.updateConfig({ worldClocks: [tokyo] });
    assert.equal(h.host.hidden, false);
    assert.equal(h.host.querySelectorAll('li').length, 1);
    assert.equal(h.intervalCreations, 1, 'configuration updates do not create more timers');
});

test('other real cards keep their grid when world clocks are off', () => {
    const h = model({ worldClocks: [tokyo], show: { clock: false, weather: true } });
    h.clock.start();
    assert.equal(h.host.hidden, true);
    assert(!h.cards.classList.contains('module-hidden'));
    h.context.applyModuleVisibility({ ...showDefaults, clock: false });
    assert(h.cards.classList.contains('module-hidden'));
    h.window.localItabTasksVisible = true;
    h.context.applyModuleVisibility({ ...showDefaults, clock: false });
    assert(!h.cards.classList.contains('module-hidden'));
});

test('world clocks render local labels and civil-day hints without changing the main clock', () => inTimeZone('UTC', () => {
    const h = model({ worldClocks: [tokyo, newYork] });
    h.clock.start();
    assert.equal(h.clock.worldClockRows[0].label.textContent, 'Tokyo');
    assert.equal(h.clock.worldClockRows[0].time.textContent, '09:30');
    assert.equal(h.clock.worldClockRows[0].day.textContent, 'Today');
    assert.equal(h.clock.worldClockRows[1].time.textContent, '20:30');
    assert.equal(h.clock.worldClockRows[1].day.textContent, 'Yesterday');
    const date = new Date('2026-10-10T00:30:15Z');
    assert.equal(h.time.textContent, h.clock.formatTime(date));
    assert.equal(h.date.textContent, h.clock.formatDate(date));
    for (const hour12 of [true, false]) for (const showSeconds of [true, false]) {
        h.clock.updateConfig({ hour12, showSeconds });
        const options = { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12 };
        if (showSeconds) options.second = '2-digit';
        assert.equal(h.clock.worldClockRows[0].time.textContent, date.toLocaleTimeString('en-US', options));
        assert.equal(h.time.textContent, h.clock.formatTime(date));
    }
}));

test('visibility and focus resume refresh world clocks using one lifecycle and the current device zone', () => inTimeZone('UTC', () => {
    const h = model({ worldClocks: [tokyo], now: '2026-10-10T02:00:00Z' });
    h.clock.start();
    h.clock.start();
    assert.equal(h.intervalCreations, 1);
    assert.equal(h.windowListeners.get('focus').length, 1);
    assert.equal(h.clock.worldClockRows[0].day.textContent, 'Today');
    process.env.TZ = 'America/Los_Angeles';
    h.event('focus');
    assert.equal(h.clock.worldClockRows[0].day.textContent, 'Tomorrow', 'device zone is recomputed even while the original timer runs');
    assert.equal(h.intervalCreations, 1);
    h.visibility(true);
    assert.equal(h.timers.size, 0);
    h.at('2026-10-11T16:05:30Z');
    h.visibility(false);
    assert.equal(h.timers.size, 1);
    assert.equal(h.clock.worldClockRows[0].time.textContent, '01:05');
    assert.equal(h.clock.worldClockRows[0].day.textContent, 'Tomorrow');
    h.event('focus');
    assert.equal(h.timers.size, 1);
    assert.equal(h.intervalCreations, 2);
}));

test('ticks change text only, preserve the card nodes, and never create a live time announcer', () => {
    const h = model({ worldClocks: [{ timeZone: 'Asia/Tokyo', label: '<img src=x onerror=alert(1)>' }] });
    h.clock.start();
    const heading = h.host.children[0], list = h.host.children[1], row = h.clock.worldClockRows[0];
    assert.equal(row.label.textContent, '<img src=x onerror=alert(1)>');
    assert.equal(h.host.querySelectorAll('img').length, 0);
    assert.equal(h.host.querySelectorAll('[aria-live], [role="status"], [role="timer"]').length, 0);
    assert.equal(row.label.innerHTML, undefined);
    h.at('2026-10-10T00:31:15Z');
    h.tick();
    assert.equal(h.host.children[0], heading);
    assert.equal(h.host.children[1], list);
    assert.equal(h.clock.worldClockRows[0], row);
    assert.equal(row.time.textContent, '09:31');
    assert.equal(h.timers.size, 1);
});

test('day hints use catalog translations and a signed fallback substitution', () => {
    const h = model({ locale: 'zh_CN', worldClocks: [tokyo] });
    const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../_locales/zh_CN/messages.json'), 'utf8'));
    for (const key of ['worldClocks', 'worldClockToday', 'worldClockYesterday', 'worldClockTomorrow', 'worldClockDays']) {
        assert(catalog[key]?.message, `${key} exists in the shipped Chinese catalog`);
    }
    assert.equal(h.host.querySelector('h2').textContent, catalog.worldClocks.message);
    for (const [value, key] of [[0, 'worldClockToday'], [-1, 'worldClockYesterday'], [1, 'worldClockTomorrow']]) {
        assert.equal(h.clock.worldClockDayLabel(value), catalog[key].message);
    }
    assert.equal(h.clock.worldClockDayLabel(2), catalog.worldClockDays.message.replace('$1', '+2'));
    assert.equal(h.clock.worldClockDayLabel(-2), catalog.worldClockDays.message.replace('$1', '-2'));
    h.window.i18n = { t: key => key };
    assert.equal(h.clock.worldClockDayLabel(2), '+2 days');
});

test('HTML and theme integration keep the optional card in the existing grid', () => {
    const html = fs.readFileSync(path.join(__dirname, '../newtab.html'), 'utf8');
    const infoCards = html.match(/<section id="info-cards-container"[\s\S]*?<\/section>/)[0];
    const header = html.match(/<header class="dashboard-header"[\s\S]*?<\/header>/)[0];
    assert.match(infoCards, /<article id="world-clocks-card" class="info-card world-clocks-card module-hidden"[^>]*hidden/);
    assert(!header.includes('world-clocks'));
    assert(html.indexOf('src="shared/world-clocks.js"') < html.indexOf('src="storage.js"'));
    assert(html.indexOf('src="shared/world-clocks.js"') < html.indexOf('src="newtab.js"'));
    const clockSource = source.slice(source.indexOf('class ClockComponent'), source.indexOf('function initializeShortcutsComponent'));
    assert.equal((clockSource.match(/setInterval\(/g) || []).length, 1);
    assert(!clockSource.includes('aria-live'));
    const worldTick = clockSource.match(/updateWorldClocks\(now\) \{[\s\S]*?\n    \}/)[0];
    assert(!/innerHTML|replaceChildren|appendChild/.test(worldTick));
    assert.match(worldTick, /time\.textContent = formatted\.time/);
    const css = fs.readFileSync(path.join(__dirname, '../newtab.css'), 'utf8');
    assert.match(css, /\.info-card\.world-clocks-card\s*\{[^}]*min-width:\s*0/);
    assert.match(css, /\.world-clock-row\s*\{[^}]*flex-wrap:\s*wrap/);
    assert.match(css, /\.world-clock-label\s*\{[^}]*overflow-wrap:\s*anywhere/);
    assert.match(css, /\.world-clock-day\s*\{[^}]*var\(--template-muted\)/);
    assert.match(css, /\.world-clock-time\s*\{[^}]*var\(--template-text\)/);
});

assert.ok(fs.readFileSync("newtab.js", "utf8").includes("[contenteditable], .world-clocks-card,"), "world-clock text double-click must not hide the dashboard");
