const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

function model() {
    const document = createDocument();
    document.hidden = false;
    const host = document.createElement('section'); host.id = 'clock-container';
    const display = document.createElement('div'); display.className = 'clock-display';
    const date = document.createElement('div'); date.id = 'date-display';
    display.append(date); host.append(display); document.body.append(host);
    let stamp = new Date(2026, 9, 9, 23, 59, 50).getTime(), language = 'en';
    let intervalCreations = 0;
    const timers = new Map(), listeners = new Map();
    class ControlledDate extends Date {
        constructor(...args) { super(...(args.length ? args : [stamp])); }
        static now() { return stamp; }
    }
    const catalogs = { en: JSON.parse(read('_locales/en/messages.json')), zh_CN: JSON.parse(read('_locales/zh_CN/messages.json')) };
    const blocked = () => { throw new Error('Calendar must not perform I/O'); };
    const i18n = { t: key => catalogs[language][key]?.message || key };
    const context = { document, Date: ControlledDate, Intl, console, i18n, navigator: { language: 'en-US' },
        window: { i18n, addEventListener(type, fn) { listeners.set(type, fn); } },
        chrome: { i18n: { getMessage: key => catalogs[language][key]?.message || '' }, storage: new Proxy({}, { get: blocked }) },
        fetch: blocked, XMLHttpRequest: blocked, localStorage: new Proxy({}, { get: blocked }),
        setInterval(fn, delay) { assert.equal(delay, 1000); const id = ++intervalCreations; timers.set(id, fn); return id; },
        clearInterval(id) { timers.delete(id); }, setTimeout: blocked
    };
    vm.createContext(context);
    vm.runInContext(read('shared/month-calendar.js'), context);
    vm.runInContext(read('newtab.js') + '\nthis.ClockComponent = ClockComponent;', context);
    const clock = new context.ClockComponent({ hour12: false, showSeconds: true });
    context.instance = clock; vm.runInContext('clockComponentInstance = instance;', context);
    clock.start();
    const view = clock.monthCalendar;
    return { clock, view, document, context, host, timers, listeners,
        get intervalCreations() { return intervalCreations; },
        at(...args) { stamp = new Date(...args).getTime(); },
        locale(value) { language = value; },
        open() { view.details.open = true; view.details.dispatch('toggle'); },
        close() { view.details.open = false; view.details.dispatch('toggle'); },
        tick() { for (const fn of timers.values()) fn(); }
    };
}

test('collapsed viewer owns stable controls, shares one timer and does no closed table work or I/O', () => {
    const h = model(); const { view, clock } = h;
    assert.equal(view.details.open, false); assert.equal(view.body.children.length, 0);
    assert.equal(view.summary.textContent, 'Calendar');
    const initialBody = view.body.children;
    for (let i = 0; i < 10; i++) h.tick();
    clock.updateConfig({ hour12: true });
    assert.equal(view.body.children, initialBody); assert.equal(h.intervalCreations, 1);
    assert.equal(h.document.querySelectorAll('.month-calendar').length, 1);
    h.open(); const rows = view.body.children; const heading = view.head.children;
    view.next.focus();
    for (let i = 0; i < 10; i++) { h.tick(); clock.updateConfig({ showSeconds: false }); }
    assert.equal(view.body.children, rows); assert.equal(view.head.children, heading);
    assert.equal(h.document.activeElement, view.next);
    assert.equal(clock.monthCalendar, view); assert.equal(h.intervalCreations, 1);
    assert.equal(h.document.listeners.has('keydown'), false);
});

test('navigation and midnight/config refresh retain browsed month and focus; reopening resets to device month', () => {
    const h = model(); h.open(); const { view, clock } = h;
    view.next.focus(); view.next.dispatch('click');
    assert.equal(clock.calendarMonth.month, 10);
    assert.match(view.caption.textContent, /November/);
    assert.equal(view.announcement.textContent, view.caption.textContent);
    const beforeMidnight = view.body.children;
    h.at(2026, 9, 10, 0, 1); h.tick();
    assert.equal(clock.calendarMonth.month, 10); assert.notEqual(view.body.children, beforeMidnight);
    assert.equal(h.document.activeElement, view.next);
    const announcement = view.announcement.textContent;
    h.locale('zh_CN'); clock.updateConfig({ hour12: true });
    assert.equal(view.summary.textContent, '日历'); assert.equal(view.next.textContent, '下个月');
    assert.equal(clock.calendarMonth.month, 10); assert.equal(view.announcement.textContent, announcement);
    assert.equal(h.document.activeElement, view.next);
    h.close(); const closedRows = view.body.children;
    h.at(2027, 1, 1); h.tick(); clock.updateConfig({ hour12: false });
    assert.equal(view.body.children, closedRows);
    h.open(); assert.equal(clock.calendarMonth.year, 2027); assert.equal(clock.calendarMonth.month, 1);
    h.at(2028, 4, 9); view.today.dispatch('click');
    assert.equal(clock.calendarMonth.year, 2028); assert.equal(clock.calendarMonth.month, 4);
    assert.equal(view.body.querySelector('[aria-current="date"]').textContent, '9');
});

test('table has actual caption, scoped full weekday names, plain dates and only current date emphasis', () => {
    const h = model(); h.open(); const { view } = h;
    assert.equal(view.caption.tagName, 'CAPTION'); assert.equal(view.caption.parentElement.tagName, 'TABLE');
    assert.equal(view.head.querySelectorAll('th').length, 7);
    for (const cell of view.head.querySelectorAll('th')) { assert.equal(cell.getAttribute('scope'), 'col'); assert(cell.getAttribute('aria-label').length >= 3); }
    assert.equal(view.body.querySelectorAll('button, a, [tabindex]').length, 0);
    assert.equal(view.body.querySelectorAll('[aria-current="date"]').length, 1);
    assert.equal(view.body.querySelector('[aria-current="date"]').textContent, '9');
    assert(view.body.children.length >= 4 && view.body.children.length <= 6);
    assert(view.body.children.every(row => row.children.length === 7));
    view.next.dispatch('click'); assert.equal(view.body.querySelectorAll('[aria-current="date"]').length, 0);
});

test('Escape stays local, closes and returns to visible summary; clock/dashboard hiding never focuses', () => {
    const h = model(); h.open(); const { view, clock } = h;
    view.next.focus(); const event = view.next.dispatch('keydown', { key: 'Escape' });
    assert.equal(event.prevented, true); assert.equal(event.stopped, true); assert.equal(view.details.open, false);
    assert.equal(h.document.activeElement, view.summary);
    h.open(); view.next.focus(); h.host.hidden = true; view.next.dispatch('keydown', { key: 'Escape' });
    assert.notEqual(h.document.activeElement, view.summary);
    h.host.hidden = false; h.open(); view.next.focus(); clock.setEnabled(false);
    assert.equal(view.details.open, false); assert.equal(h.timers.size, 0); assert.notEqual(h.document.activeElement, view.summary);
    clock.setEnabled(true); assert.equal(view.details.open, false); assert.equal(h.timers.size, 1);
    h.open(); h.context.applyDashboardHiddenState(true); assert.equal(view.details.open, false);
    h.context.applyDashboardHiddenState(false); assert.equal(view.details.open, false);
});

test('repeated activation/composition is guarded; calendar double-clicks never hide dashboard', () => {
    const h = model(); h.open(); const { view } = h;
    for (const fields of [{ key: 'Enter', repeat: true }, { key: ' ', repeat: true }, { key: 'Enter', isComposing: true }, { key: 'Unidentified', keyCode: 229 }]) {
        assert.equal(view.next.dispatch('keydown', fields).prevented, true);
    }
    assert.equal(view.next.dispatch('keydown', { key: 'Enter' }).prevented, false);
    for (const target of [view.summary, view.caption, view.body.children[0].children[0], view.details]) {
        assert.equal(h.context.shouldToggleFromEvent({ target }), false);
    }
    assert.equal(h.context.shouldToggleFromEvent({ target: h.document.body }), true);
});

test('year bounds disable buttons while stable controls and focus survive repeated navigation', () => {
    const h = model(); h.open(); const { view, clock } = h;
    const previous = view.previous, next = view.next;
    clock.calendarMonth = { year: 1, month: 0 }; clock.updateDisplay();
    assert.equal(previous.disabled, true); assert.equal(next.disabled, false);
    clock.calendarMonth = { year: 9999, month: 11 }; clock.updateDisplay();
    assert.equal(previous.disabled, false); assert.equal(next.disabled, true);
    previous.focus();
    for (let i = 0; i < 25; i++) previous.dispatch('click');
    assert.equal(h.document.activeElement, previous); assert.equal(view.next, next);
    assert.equal(clock.calendarMonth.year, 9997); assert.equal(clock.calendarMonth.month, 10);
});

test('runtime inventory/script order and narrow open-only layout are explicit', () => {
    const html = read('newtab.html'), css = read('local-month-calendar.css'), pack = read('tools/package_extension.py');
    assert(html.indexOf('src="shared/month-calendar.js"') < html.indexOf('src="newtab.js"'));
    assert(html.indexOf('href="local-month-calendar.css"') > html.indexOf('href="dashboard-template-gallery.css"'));
    assert(pack.includes('"shared/month-calendar.js"')); assert(pack.includes('"local-month-calendar.css"'));
    assert.match(css, /@media \(max-width: 600px\)/); assert.match(css, /:has\(\.month-calendar\[open\]\)/);
    assert.match(css, /\.month-calendar\[open\] \{ width: 17rem;/); assert.match(css, /aria-current="date".*outline:/);
});

test('detached host does not navigate, render or announce', () => {
    const h = model(); h.open(); const { clock, view } = h;
    const rows = view.body.children, caption = view.caption.textContent, month = clock.calendarMonth;
    h.host.remove(); h.at(2027, 4, 1); h.locale('zh_CN');
    view.next.dispatch('click'); view.today.dispatch('click'); h.tick(); clock.updateConfig({ hour12: true });
    view.details.dispatch('toggle');
    assert.equal(view.body.children, rows); assert.equal(view.caption.textContent, caption);
    assert.equal(clock.calendarMonth, month); assert.equal(view.announcement.textContent || '', '');
    assert.equal(view.summary.textContent, 'Calendar');
});

test('explicit navigation at either year edge moves owned focus to Today, passive refresh does not', () => {
    const h = model(); h.open(); const { clock, view } = h;
    clock.calendarMonth = { year: 1, month: 1 }; clock.updateDisplay();
    view.previous.focus(); view.previous.dispatch('click');
    assert.equal(view.previous.disabled, true); assert.equal(h.document.activeElement, view.today);
    clock.calendarMonth = { year: 9999, month: 10 }; clock.updateDisplay();
    view.next.focus(); view.next.dispatch('click');
    assert.equal(view.next.disabled, true); assert.equal(h.document.activeElement, view.today);
    view.previous.focus(); h.tick(); assert.equal(h.document.activeElement, view.previous);
});
