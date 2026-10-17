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
        window: { i18n, addEventListener(type, fn) { listeners.set(type, fn); },
            // Model only inherited visibility used by the local event guard;
            // this does not evaluate stylesheets or prove native layout.
            getComputedStyle(node) {
                for (let current = node; current; current = current.parentElement) {
                    if (current.style.visibility) return { visibility: current.style.visibility };
                }
                return { visibility: 'visible' };
            } },
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

test('expanded narrow calendar lets the date use its own row without changing collapsed geometry', () => {
    const css = read('local-month-calendar.css');
    const [base, narrow] = css.split('@media (max-width: 600px) {');
    assert(narrow, 'expanded responsive rules exist');
    assert.doesNotMatch(base, /\.date-display\s*\{/);
    assert.match(narrow, /:root\[data-dashboard-template\] #dashboard \.dashboard-header:has\(\.month-calendar\[open\]\) \.date-display \{ max-width: 100%; \}/);
    assert.equal((css.match(/\.date-display\s*\{/g) || []).length, 1);
    assert.match(read('dashboard-templates.css'), /\.date-display \{ font-size: 10px; max-width: 135px; \}/);
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

test('month jump editor exposes explicit year and month controls', () => {
    const h = model(); h.open(); const { view } = h;
    assert(view.year, 'calendar has a year editor');
    assert.equal(view.year.type, 'text');
    assert.equal(view.year.inputMode, 'numeric');
    assert.equal(view.year.getAttribute('maxlength'), undefined);
    assert.equal(view.month.tagName, 'SELECT');
    assert.equal(view.month.children.length, 12);
    assert.deepEqual(view.month.children.map(option => option.value), Array.from({ length: 12 }, (_, index) => String(index)));
    assert.equal(view.jump.type, 'button');
    assert.equal(view.jump.textContent, 'View');
    assert.equal(view.year.closest('.month-calendar-controls'), null);
    assert.equal(view.year.value, '2026'); assert.equal(view.month.value, '9');
});

test('month jump requires explicit View or a fresh year Enter and preserves successful text and focus', () => {
    const h = model(); h.open(); const { view, clock } = h;
    const before = view.body.children;
    view.year.value = '0099'; view.month.value = '1';
    view.year.focus(); view.year.selectionStart = 1; view.year.selectionEnd = 3;
    view.year.dispatch('input'); view.year.dispatch('change'); view.month.dispatch('change');
    assert.equal(clock.calendarMonth.year, 2026); assert.equal(view.body.children, before);
    const entered = view.year.dispatch('keydown', { key: 'Enter' });
    assert.equal(entered.prevented, true);
    assert.equal(clock.calendarMonth.year, 99); assert.equal(clock.calendarMonth.month, 1);
    assert.equal(view.caption.textContent, 'February 99');
    assert.equal(view.year.value, '0099'); assert.equal(view.month.value, '1');
    assert.equal(view.year.selectionStart, 1); assert.equal(view.year.selectionEnd, 3);
    assert.equal(h.document.activeElement, view.year);
    assert.equal(view.announcement.textContent, 'February 99');
    view.year.value = '2000'; view.month.value = '0'; view.jump.focus(); view.jump.dispatch('click');
    assert.equal(clock.calendarMonth.year, 2000); assert.equal(clock.calendarMonth.month, 0);
    assert.equal(h.document.activeElement, view.jump);
    assert.equal(view.announcement.textContent, 'January 2000');
    assert.equal(h.intervalCreations, 1); assert.equal(h.timers.size, 1);
});

test('month jump renders Gregorian leap years and supported first and last months', () => {
    const h = model(); h.open(); const { view, clock } = h;
    for (const [year, count] of [['0001', 28], ['0004', 29], ['0099', 28], ['0100', 28], ['1900', 28], ['2000', 29], ['9999', 28]]) {
        view.year.value = year; view.month.value = '1'; view.jump.dispatch('click');
        const dates = view.body.querySelectorAll('td').filter(cell => cell.textContent);
        assert.equal(dates.length, count); assert.equal(clock.calendarMonth.year, Number(year));
        assert.equal(view.caption.textContent, `February ${Number(year)}`);
    }
    view.year.value = '0001'; view.month.value = '0'; view.year.focus(); view.year.dispatch('keydown', { key: 'Enter' });
    assert.equal(view.previous.disabled, true); assert.equal(view.next.disabled, false);
    assert.equal(h.document.activeElement, view.year);
    view.year.value = '9999'; view.month.value = '11'; view.jump.focus(); view.jump.dispatch('click');
    assert.equal(view.previous.disabled, false); assert.equal(view.next.disabled, true);
    assert.equal(view.caption.textContent, 'December 9999'); assert.equal(h.document.activeElement, view.jump);
});

test('invalid month jump preserves draft, viewed month and focus with a localized accessible error', () => {
    const h = model(); h.open(); const { view, clock } = h;
    const month = clock.calendarMonth, rows = view.body.children;
    view.year.focus();
    for (const invalid of ['', '0000', '10000', '-1', '1.2', '1e2', '20x6', '１２３４', ' 99', '99 ']) {
        view.year.value = invalid; view.month.value = '9'; view.year.dispatch('keydown', { key: 'Enter' });
        assert.equal(view.year.value, invalid); assert.equal(clock.calendarMonth, month);
        assert.equal(view.body.children, rows); assert.equal(h.document.activeElement, view.year);
        assert.equal(view.error.hidden, false); assert.match(view.error.textContent, /1 to 9999/);
        assert.equal(view.error.getAttribute('role'), 'alert');
        assert.equal(view.year.getAttribute('aria-describedby'), view.error.id);
        assert.equal(view.year.getAttribute('aria-invalid'), 'true');
        assert.equal(view.month.getAttribute('aria-invalid'), 'false');
        assert.equal(view.announcement.textContent || '', '');
    }
    view.year.value = '2024';
    for (const invalid of ['', '-1', '12', '01', '1.5', '1e0', '1\n']) {
        view.month.value = invalid; view.jump.dispatch('click');
        assert.equal(view.month.value, invalid); assert.equal(clock.calendarMonth, month);
        assert.equal(view.month.getAttribute('aria-invalid'), 'true');
        assert.equal(view.year.getAttribute('aria-invalid'), 'false');
    }
    h.locale('zh_CN'); h.tick();
    assert.match(view.error.textContent, /请输入/);
    assert.equal(view.yearText.textContent, '年份'); assert.equal(view.monthText.textContent, '月份');
    assert.equal(view.jump.textContent, '查看'); assert.equal(view.monthOptions[0].textContent, '一月');
    view.month.value = '1'; view.jump.dispatch('click');
    assert.equal(view.error.hidden, true); assert.equal(view.error.textContent, '');
    assert.equal(view.year.getAttribute('aria-invalid'), 'false'); assert.equal(view.month.getAttribute('aria-invalid'), 'false');
    assert.equal(view.announcement.textContent, '2024年2月');
});

test('ticks midnight config and locale updates never write drafts or replace editing nodes and options', () => {
    const h = model(); h.open(); const { view, clock } = h;
    view.year.value = '10000'; view.month.value = '3'; view.jump.dispatch('click'); view.year.focus();
    view.year.selectionStart = 1; view.year.selectionEnd = 4;
    const year = view.year, month = view.month, options = [...view.monthOptions];
    // A value assignment loses the modeled caret, even if the assigned text is
    // unchanged. This detects resets more strictly than comparing final values.
    for (const field of [year, month]) {
        let value = field.value;
        Object.defineProperty(field, 'value', { configurable: true, get: () => value,
            set(next) { value = next; field.selectionStart = field.selectionEnd = 0; throw new Error('passive refresh wrote an editor value'); } });
    }
    for (let i = 0; i < 4; i++) h.tick();
    h.at(2026, 9, 10, 0, 1); h.tick();
    clock.updateConfig({ hour12: true, showSeconds: false });
    h.locale('zh_CN'); clock.updateConfig({ hour12: false });
    assert.equal(view.year, year); assert.equal(view.month, month);
    options.forEach((option, index) => { assert.equal(view.month.children[index], option); assert.equal(view.monthOptions[index], option); });
    assert.equal(year.value, '10000'); assert.equal(month.value, '3');
    assert.equal(year.selectionStart, 1); assert.equal(year.selectionEnd, 4);
    assert.equal(h.document.activeElement, year); assert.equal(view.error.hidden, false);
    assert.match(view.error.textContent, /请输入/); assert.equal(clock.calendarMonth.month, 9);
    assert.equal(h.intervalCreations, 1);
});

test('explicit Previous Next and Today synchronize the draft and clear errors', () => {
    const h = model(); h.open(); const { view, clock } = h;
    for (const [button, expected] of [[view.next, [2026, 10]], [view.previous, [2026, 9]], [view.today, [2026, 9]]]) {
        view.year.value = '10000'; view.month.value = '1'; view.jump.dispatch('click');
        assert.equal(view.error.hidden, false); button.focus(); button.dispatch('click');
        assert.deepEqual([clock.calendarMonth.year, clock.calendarMonth.month], expected);
        assert.equal(view.year.value, String(expected[0])); assert.equal(view.month.value, String(expected[1]));
        assert.equal(view.error.hidden, true); assert.equal(view.error.textContent, '');
        assert.equal(h.document.activeElement, button);
    }
});

test('year composition and its trailing Enter cannot jump or close; native select keys are untouched', () => {
    const h = model(); h.open(); const { view, clock } = h;
    view.year.value = '2000'; view.month.value = '1'; view.year.focus();
    view.year.dispatch('compositionstart');
    for (const fields of [{ key: 'Enter' }, { key: 'Escape' }, { key: 'Enter', isComposing: true }, { key: 'Enter', keyCode: 229 }]) {
        const event = view.year.dispatch('keydown', fields);
        assert.equal(event.prevented, false); assert.equal(event.stopped, false);
        assert.equal(clock.calendarMonth.year, 2026); assert.equal(view.details.open, true);
    }
    view.jump.dispatch('click'); assert.equal(clock.calendarMonth.year, 2026);
    view.year.dispatch('compositionend');
    assert.equal(view.year.dispatch('keydown', { key: 'Enter' }).prevented, false);
    assert.equal(clock.calendarMonth.year, 2026);
    view.year.dispatch('keyup', { key: 'Enter' });
    assert.equal(view.year.dispatch('keydown', { key: 'Enter', repeat: true }).prevented, false);
    assert.equal(clock.calendarMonth.year, 2026);
    view.year.dispatch('keydown', { key: 'Enter' }); assert.equal(clock.calendarMonth.year, 2000);
    for (const fields of [{ key: 'ArrowDown' }, { key: 'Enter' }, { key: ' ' }, { key: 'Escape' }, { key: 'Escape', isComposing: true }, { key: 'Escape', keyCode: 229 }]) {
        view.month.focus(); const event = view.month.dispatch('keydown', fields);
        assert.equal(event.prevented, false); assert.equal(event.stopped, false); assert.equal(view.details.open, true);
    }
    assert.equal(view.year.dispatch('keydown', { key: 'Escape', defaultPrevented: true }).prevented, false);
    assert.equal(view.details.open, true);
    view.year.focus(); view.year.dispatch('keydown', { key: 'Escape' });
    assert.equal(view.details.open, false); assert.equal(h.document.activeElement, view.summary);
    assert.equal(view.year.value, ''); assert.equal(view.month.value, '');
});

test('IME flags without composition events and interrupted composition release safely', () => {
    const h = model(); h.open(); const { view, clock } = h;
    view.year.value = '1900'; view.month.value = '1';
    for (const fields of [{ key: 'Enter', isComposing: true }, { key: 'Enter', keyCode: 229 }]) {
        view.year.dispatch('keydown', fields); view.year.dispatch('keydown', { key: 'Enter' });
        assert.equal(clock.calendarMonth.year, 2026); view.year.dispatch('keyup', { key: 'Enter' });
    }
    view.year.dispatch('compositionstart'); h.host.hidden = true;
    view.year.dispatch('compositionend'); view.year.dispatch('blur');
    assert.equal(view.composing, false); assert.equal(view.compositionEnter, false);
    h.host.hidden = false; view.year.dispatch('keydown', { key: 'Enter' });
    assert.equal(clock.calendarMonth.year, 1900);
    view.year.dispatch('compositionstart'); clock.closeMonthCalendar();
    assert.equal(view.composing, false); assert.equal(view.compositionEnter, false);
    h.open(); view.year.value = '4'; view.year.dispatch('keydown', { key: 'Enter' });
    assert.equal(clock.calendarMonth.year, 4);
});

test('same-month reopen always reinitializes cleared drafts independently of table render caching', () => {
    const h = model(); h.open(); const { view, clock } = h;
    const rows = view.body.children, key = clock.calendarRenderKey;
    for (let i = 0; i < 8; i++) {
        view.year.value = '10000'; view.month.value = '5'; view.jump.dispatch('click');
        h.close();
        assert.equal(view.year.value, ''); assert.equal(view.month.value, ''); assert.equal(view.error.hidden, true);
        assert.equal(view.announcement.textContent, ''); assert.equal(clock.calendarMonth, null);
        h.open();
        assert.equal(view.year.value, '2026'); assert.equal(view.month.value, '9');
        assert.equal(view.error.hidden, true); assert.equal(clock.calendarRenderKey, key); assert.equal(view.body.children, rows);
    }
    assert.equal(h.document.querySelectorAll('.month-calendar-editor').length, 1);
    assert.equal(h.document.listeners.has('keydown'), false); assert.equal(h.listeners.has('keydown'), false);
    assert.equal(h.intervalCreations, 1);
});

test('closing and clock dashboard or panel hiding clear drafts without hidden focus', () => {
    for (const hide of [h => h.clock.setEnabled(false), h => h.context.applyDashboardHiddenState(true), h => { h.view.panel.hidden = true; h.tick(); }, h => { h.host.hidden = true; h.tick(); }]) {
        const h = model(); h.open(); const { view, clock } = h;
        view.year.value = '10000'; view.month.value = '3'; view.jump.dispatch('click'); view.year.focus();
        hide(h);
        assert.equal(view.details.open, false); assert.equal(clock.calendarMonth, null);
        assert.equal(view.year.value, ''); assert.equal(view.month.value, ''); assert.equal(view.error.hidden, true);
        assert.notEqual(h.document.activeElement, view.summary);
    }
});

test('closed disabled detached hidden inert and superseded controls reject stale jumps and navigation', () => {
    for (const deactivate of [h => h.close(), h => h.clock.setEnabled(false), h => h.host.remove(), h => { h.host.hidden = true; }, h => { h.host.style.display = 'none'; }, h => { h.host.inert = true; }, h => { h.host.setAttribute('aria-hidden', 'true'); }, h => { h.host.style.visibility = 'hidden'; }, h => { h.host.style.visibility = 'collapse'; }, h => { h.view.panel.setAttribute('aria-hidden', 'true'); }, h => { h.document.hidden = true; }, h => { h.view.panel.hidden = true; }, h => { h.document.body.classList.add('dashboard-hidden'); }, h => h.clock.createMonthCalendar()]) {
        const h = model(); h.open(); const { view, clock } = h;
        view.year.value = '2000'; view.month.value = '1'; deactivate(h);
        const current = clock.calendarMonth, caption = view.caption.textContent, announcement = view.announcement.textContent;
        const rows = view.body.children, error = view.error.textContent;
        view.jump.dispatch('click'); view.year.dispatch('keydown', { key: 'Enter' });
        view.previous.dispatch('click'); view.next.dispatch('click'); view.today.dispatch('click');
        assert.equal(clock.calendarMonth, current); assert.equal(view.body.children, rows);
        assert.equal(view.caption.textContent, caption); assert.equal(view.announcement.textContent, announcement);
        assert.equal(view.error.textContent, error); assert.notEqual(h.document.activeElement, view.summary);
    }
});


test('mouse-completed composition and key release before compositionend allow the next fresh Enter', () => {
    for (const finish of [
        view => view.year.dispatch('compositionend'),
        view => { view.year.dispatch('keydown', { key: 'a', isComposing: true, keyCode: 229 }); view.year.dispatch('compositionend'); },
        view => { view.year.dispatch('keydown', { key: 'Unidentified', keyCode: 229 }); view.year.dispatch('compositionend'); },
        view => { view.year.dispatch('keydown', { key: 'Process', keyCode: 229, isComposing: true }); view.year.dispatch('keyup', { key: 'a', keyCode: 65, isComposing: true }); view.year.dispatch('compositionend'); },
        view => { view.year.dispatch('keydown', { key: 'Enter', isComposing: true }); view.year.dispatch('keyup', { key: 'Enter', isComposing: true }); view.year.dispatch('compositionend'); }
    ]) {
        const h = model(); h.open(); const { view, clock } = h;
        view.year.value = '2000'; view.month.value = '1'; view.year.focus();
        view.year.dispatch('compositionstart'); finish(view);
        assert.equal(view.year.dispatch('keydown', { key: 'Enter' }).prevented, true);
        assert.equal(clock.calendarMonth.year, 2000); assert.equal(h.document.activeElement, view.year);
    }
});

test('already handled year Enter does not jump or display validation errors', () => {
    const h = model(); h.open(); const { view, clock } = h;
    for (const draft of ['2000', '10000']) {
        view.year.value = draft; view.month.value = '1';
        const event = view.year.dispatch('keydown', { key: 'Enter', defaultPrevented: true });
        assert.equal(event.prevented, false); assert.equal(clock.calendarMonth.year, 2026);
        assert.equal(view.error.hidden, true); assert.equal(view.announcement.textContent || '', '');
    }
});

// Synthetic DOM/event-model coverage only; not native layout, IME or accessibility acceptance.
test('date interval starts collapsed with independent stable ISO text drafts and explicit calculation', () => {
    const h = model(); h.open(); const { view, clock } = h;
    const interval = view.interval;
    assert(interval, 'calendar has an independent date interval tool');
    assert.equal(interval.details.open, false); assert.equal(interval.summary.textContent, 'Date interval');
    assert.equal(interval.details.parentElement, view.panel);
    interval.details.open = true; interval.details.dispatch('toggle');
    assert.equal(view.details.open, true); assert.equal(clock.calendarMonth.month, 9);
    for (const field of [interval.start, interval.end]) {
        assert.equal(field.type, 'text'); assert.equal(field.value, '');
        assert.equal(field.getAttribute('maxlength'), undefined);
    }
    interval.start.value = '2000-02-28'; interval.end.value = '2000-03-01';
    interval.start.dispatch('input'); interval.end.dispatch('input');
    assert.equal(interval.result.textContent, '');
    interval.calculate.focus(); interval.calculate.dispatch('click');
    assert.equal(interval.result.textContent, '2000-02-28 → 2000-03-01: +2 calendar days');
    assert.equal(interval.result.getAttribute('role'), 'status');
    assert.equal(h.document.activeElement, interval.calculate);
    assert.equal(clock.calendarMonth.month, 9); assert.equal(clock.calendarMonth.year, 2026);
    interval.end.value = '2000-02-27'; interval.end.dispatch('input');
    assert.equal(interval.result.textContent, '');
    interval.end.dispatch('keydown', { key: 'Enter' });
    assert.equal(interval.result.textContent, '2000-02-28 → 2000-02-27: -1 calendar day');
    interval.end.value = '2000-02-28'; interval.end.dispatch('input'); interval.calculate.dispatch('click');
    assert.equal(interval.result.textContent, '2000-02-28 → 2000-02-28: 0 calendar days');
});

test('interval rejects invalid raw drafts locally without truncation, month changes or focus movement', () => {
    const h = model(); h.open(); const { view, clock } = h; const x = view.interval;
    x.details.open = true; x.details.dispatch('toggle');
    x.end.value = '2024-03-01'; x.start.focus();
    const current = clock.calendarMonth, rows = view.body.children;
    for (const invalid of ['', '2024-2-29', '1900-02-29', '0000-01-01', '10000-01-01', '２０２４-01-01', '2024-01-01\n', '<img src=x onerror=alert(1)>']) {
        x.start.value = invalid; x.start.dispatch('input'); x.calculate.dispatch('click');
        assert.equal(x.start.value, invalid); assert.equal(x.end.value, '2024-03-01');
        assert.equal(x.error.hidden, false); assert.match(x.error.textContent, /YYYY-MM-DD/);
        assert.equal(x.error.getAttribute('role'), 'alert');
        assert(x.start.getAttribute('aria-describedby').includes(x.error.id));
        assert.equal(x.start.getAttribute('aria-invalid'), 'true'); assert.equal(x.end.getAttribute('aria-invalid'), 'false');
        assert.equal(x.result.textContent, ''); assert.equal(clock.calendarMonth, current);
        assert.equal(view.body.children, rows); assert.equal(h.document.activeElement, x.start);
    }
    x.start.value = '0001-01-01'; x.end.value = ''; x.calculate.dispatch('click');
    assert.equal(x.start.getAttribute('aria-invalid'), 'false'); assert.equal(x.end.getAttribute('aria-invalid'), 'true');
    x.end.value = '0001-01-02'; x.end.dispatch('input');
    assert.equal(x.error.hidden, true); assert.equal(x.result.textContent, '');
    x.calculate.dispatch('click'); assert.equal(x.result.textContent, '0001-01-01 → 0001-01-02: +1 calendar day');
    x.start.dispatch('input'); assert.equal(x.result.textContent, '', 'even an unchanged-value input retires the result');
});

test('month navigation, jumping, ticks, midnight, language and config never write date drafts or move their caret', () => {
    const h = model(); h.open(); const { view, clock } = h; const x = view.interval;
    x.details.open = true; x.details.dispatch('toggle');
    x.start.value = '0099-12-31'; x.end.value = '0100-01-01'; x.calculate.dispatch('click'); x.start.focus();
    x.start.selectionStart = 2; x.start.selectionEnd = 4;
    const fields = [x.start, x.end], result = x.resultValue;
    for (const field of fields) {
        const value = field.value;
        Object.defineProperty(field, 'value', { get: () => value, set() { throw new Error('navigation/passive refresh wrote a date draft'); } });
    }
    for (const button of [view.next, view.previous, view.today]) button.dispatch('click');
    view.year.value = '1900'; view.month.value = '1'; view.jump.dispatch('click');
    assert.equal(clock.calendarMonth.year, 1900); assert.equal(clock.calendarMonth.month, 1);
    for (let i = 0; i < 5; i++) h.tick();
    h.at(2026, 9, 10, 0, 1); h.tick();
    clock.updateConfig({ hour12: true, showSeconds: false });
    h.locale('zh_CN'); h.tick();
    h.document.hidden = true; h.tick(); h.document.hidden = false; h.tick();
    assert.equal(x.start, fields[0]); assert.equal(x.end, fields[1]); assert.equal(x.resultValue, result);
    assert.equal(x.start.value, '0099-12-31'); assert.equal(x.end.value, '0100-01-01');
    assert.equal(x.start.selectionStart, 2); assert.equal(x.start.selectionEnd, 4); assert.equal(h.document.activeElement, x.start);
    assert.equal(x.result.textContent, '0099-12-31 → 0100-01-01: +1 个自然日');
    assert.equal(x.summary.textContent, '日期间隔'); assert.equal(x.calculate.textContent, '计算');
    assert.equal(clock.calendarMonth.year, 1900); assert.equal(clock.calendarMonth.month, 1);
    assert.equal(h.intervalCreations, 1); assert.equal(h.timers.size, 1);
});

test('interval errors and labels relocalize with EN fallback, preserving raw drafts and an empty result', () => {
    const h = model(); h.open(); const { view } = h; const x = view.interval;
    x.details.open = true; x.start.value = '1900-02-29'; x.calculate.dispatch('click');
    h.locale('zh_CN'); h.tick();
    assert.equal(x.start.value, '1900-02-29'); assert.equal(x.end.value, ''); assert.equal(x.error.hidden, false);
    assert.match(x.error.textContent, /YYYY-MM-DD 输入两个有效日期/); assert.match(x.hint.textContent, /不是经过小时、工作日或含首尾/);
    assert.equal(x.startText.textContent, '开始日期'); assert.equal(x.endText.textContent, '结束日期');
    h.context.window.i18n.t = key => key; h.clock.calendarLabelsSet = false; h.tick();
    assert.equal(x.summary.textContent, 'Date interval'); assert.equal(x.calculate.textContent, 'Calculate');
    assert.equal(x.startText.textContent, 'Start date'); assert.equal(x.endText.textContent, 'End date');
    assert.match(x.error.textContent, /0001–9999/); assert.match(x.hint.textContent, /Not hours, workdays or an inclusive count/);
    assert.equal(x.result.textContent, '');
});

test('folding interval retains drafts/result but makes stale input, calculate and Escape inert; nested toggle never resets month', () => {
    const h = model(); h.open(); const { view, clock } = h; const x = view.interval;
    view.next.dispatch('click'); const current = clock.calendarMonth;
    x.details.open = true; x.details.dispatch('toggle');
    assert.equal(clock.calendarMonth, current);
    x.start.value = '2024-01-01'; x.end.value = '2024-02-01'; x.calculate.dispatch('click');
    const result = x.result.textContent;
    x.start.dispatch('compositionstart'); x.start.dispatch('keydown', { key: 'Enter', isComposing: true });
    x.details.open = false; x.details.dispatch('toggle');
    assert.equal(clock.calendarMonth, current); assert.equal(view.details.open, true);
    assert.equal(x.startState.composing, false); assert.equal(x.startState.compositionEnter, false);
    for (const type of ['input', 'change', 'keyup', 'compositionend']) x.start.dispatch(type, { key: 'Enter' });
    x.calculate.dispatch('click'); x.start.dispatch('keydown', { key: 'Enter' });
    x.end.dispatch('keydown', { key: 'Escape' });
    assert.equal(x.result.textContent, result); assert.equal(x.start.value, '2024-01-01'); assert.equal(x.end.value, '2024-02-01');
    assert.equal(view.details.open, true); assert.notEqual(h.document.activeElement, view.summary);
    x.details.open = true; x.details.dispatch('toggle');
    assert.equal(clock.calendarMonth, current); assert.equal(x.result.textContent, result);
    x.end.focus(); x.end.dispatch('keydown', { key: 'Escape' });
    assert.equal(view.details.open, false); assert.equal(h.document.activeElement, view.summary);
    assert.equal(x.start.value, ''); assert.equal(x.end.value, ''); assert.equal(x.result.textContent, ''); assert.equal(x.details.open, false);
});

test('date fields share IME convention but not completion state and reject held/handled submission', () => {
    for (const fieldName of ['start', 'end']) {
        const h = model(); h.open(); const { view } = h; const x = view.interval;
        x.details.open = true; x.start.value = '2000-02-28'; x.end.value = '2000-03-01';
        const field = x[fieldName], state = x[`${fieldName}State`]; field.focus();
        field.dispatch('compositionstart');
        for (const fields of [{ key: 'Enter' }, { key: 'Escape' }, { key: 'Enter', isComposing: true }, { key: 'Unidentified', code: 'Enter', keyCode: 229 }]) {
            const event = field.dispatch('keydown', fields);
            assert.equal(event.prevented, false); assert.equal(event.stopped, false); assert.equal(view.details.open, true);
        }
        x.calculate.dispatch('click'); assert.equal(x.result.textContent, '');
        field.dispatch('compositionend');
        assert.equal(field.dispatch('keydown', { key: 'Enter' }).prevented, false);
        assert.equal(x.result.textContent, '');
        field.dispatch('keyup', { key: 'Enter' });
        for (const fields of [{ key: 'Enter', repeat: true }, { key: 'Enter', defaultPrevented: true }]) {
            assert.equal(field.dispatch('keydown', fields).prevented, false); assert.equal(x.result.textContent, '');
        }
        assert.equal(field.dispatch('keydown', { key: 'Enter' }).prevented, true);
        assert.equal(x.result.textContent, '2000-02-28 → 2000-03-01: +2 calendar days');
        assert.equal(h.document.activeElement, field); assert.equal(state.composing, false);
        x.start.dispatch('input'); field.dispatch('keydown', { key: 'Enter', isComposing: true });
        const other = x[fieldName === 'start' ? 'end' : 'start'];
        other.dispatch('keydown', { key: 'Enter' }); assert.notEqual(x.result.textContent, '', 'completion state is per field');
        for (const button of [x.calculate, x.summary]) {
            for (const fields of [{ key: 'Enter', repeat: true }, { key: ' ', repeat: true }, { key: 'Enter', isComposing: true }, { key: ' ', keyCode: 229 }]) {
                assert.equal(button.dispatch('keydown', fields).prevented, true);
            }
            assert.equal(button.dispatch('keydown', { key: 'Enter' }).prevented, false);
        }
    }
});

test('mouse IME completion, release-before-end and interrupted composition permit the next fresh date Enter', () => {
    for (const finish of [field => field.dispatch('compositionend'),
        field => { field.dispatch('keydown', { key: 'Process', keyCode: 229 }); field.dispatch('compositionend'); },
        field => { field.dispatch('keydown', { key: 'Enter', isComposing: true }); field.dispatch('keyup', { key: 'Enter' }); field.dispatch('compositionend'); },
        field => { field.dispatch('keydown', { key: 'Enter', isComposing: true }); field.dispatch('blur'); }]) {
        const h = model(); h.open(); const x = h.view.interval;
        x.details.open = true; x.start.value = '9999-12-30'; x.end.value = '9999-12-31';
        x.start.dispatch('compositionstart'); finish(x.start);
        assert.equal(x.start.dispatch('keydown', { key: 'Enter' }).prevented, true);
        assert.equal(x.result.textContent, '9999-12-30 → 9999-12-31: +1 calendar day');
    }
});

test('close, same-month reopen and clock/dashboard hiding clear interval drafts/errors/results and IME state without focusing', () => {
    for (const endSession of [h => h.close(), h => h.clock.setEnabled(false), h => h.context.applyDashboardHiddenState(true),
        h => { h.view.panel.hidden = true; h.tick(); }, h => { h.host.hidden = true; h.tick(); }]) {
        const h = model(); h.open(); const x = h.view.interval;
        x.details.open = true; x.start.value = '2024-01-01'; x.end.value = '2024-01-02'; x.calculate.dispatch('click');
        x.start.value = 'bad'; x.start.dispatch('input'); x.calculate.dispatch('click'); x.start.focus();
        x.start.dispatch('compositionstart'); x.start.dispatch('keydown', { key: 'Enter', isComposing: true });
        endSession(h);
        assert.equal(x.details.open, false); assert.equal(x.start.value, ''); assert.equal(x.end.value, '');
        assert.equal(x.error.hidden, true); assert.equal(x.error.textContent, ''); assert.equal(x.result.textContent, '');
        assert.equal(x.startState.composing, false); assert.equal(x.startState.compositionEnter, false);
        assert.equal(x.endState.composing, false); assert.equal(x.endState.compositionEnter, false);
        assert.notEqual(h.document.activeElement, h.view.summary);
    }
    const h = model(); h.open(); const x = h.view.interval, rows = h.view.body.children;
    for (let i = 0; i < 3; i++) {
        x.details.open = true; x.start.value = '0001-01-01'; x.end.value = '9999-12-31'; x.calculate.dispatch('click');
        h.close(); h.open();
        assert.equal(x.details.open, false); assert.equal(x.start.value, ''); assert.equal(x.end.value, '');
        assert.equal(x.result.textContent, ''); assert.equal(h.view.body.children, rows);
    }
    // A browser can coalesce a rapid close/open into only the final open toggle.
    x.details.open = true; x.start.value = 'stale'; h.open();
    assert.equal(x.start.value, ''); assert.equal(x.details.open, false);
});

test('inactive, hidden, disabled, detached and superseded interval controls cannot calculate, clear results or steal focus', () => {
    for (const deactivate of [h => h.close(), h => h.clock.setEnabled(false), h => h.host.remove(),
        h => { h.host.hidden = true; }, h => { h.host.style.display = 'none'; }, h => { h.host.inert = true; },
        h => { h.host.setAttribute('aria-hidden', 'true'); }, h => { h.host.style.visibility = 'hidden'; },
        h => { h.host.style.visibility = 'collapse'; }, h => { h.document.hidden = true; },
        h => { h.view.panel.hidden = true; }, h => { h.document.body.classList.add('dashboard-hidden'); },
        h => { h.view.interval.details.open = false; }, h => { h.view.interval.fields.hidden = true; },
        h => { h.view.interval.start.disabled = true; h.view.interval.end.disabled = true; h.view.interval.calculate.disabled = true; },
        h => h.clock.createMonthCalendar()]) {
        const h = model(); h.open(); const { view, clock } = h; const x = view.interval;
        x.details.open = true; x.start.value = '2024-01-01'; x.end.value = '2024-02-01'; x.calculate.dispatch('click');
        deactivate(h); const result = x.result.textContent, error = x.error.textContent, current = clock.calendarMonth;
        const focused = h.document.activeElement;
        x.start.dispatch('input'); x.end.dispatch('change'); x.calculate.dispatch('click');
        x.start.dispatch('keydown', { key: 'Enter' }); x.end.dispatch('keydown', { key: 'Escape' });
        x.start.dispatch('compositionstart'); x.start.dispatch('keyup', { key: 'Enter' }); x.start.dispatch('compositionend');
        assert.equal(x.result.textContent, result); assert.equal(x.error.textContent, error);
        assert.equal(clock.calendarMonth, current); assert.equal(h.document.activeElement, focused);
    }
});

test('a hidden or disabled endpoint rejects even a visible calculate button and interval stays within existing no-I/O clock lifecycle', () => {
    for (const property of ['hidden', 'disabled']) {
        const h = model(); h.open(); const x = h.view.interval;
        x.details.open = true; x.start.value = '2000-01-01'; x.end.value = '2000-01-02'; x.start[property] = true;
        x.calculate.dispatch('click'); x.end.dispatch('keydown', { key: 'Enter' }); assert.equal(x.result.textContent, '');
        assert.equal(h.intervalCreations, 1); assert.equal(h.timers.size, 1);
        assert.equal(h.document.listeners.has('keydown'), false); assert.equal(h.listeners.has('keydown'), false);
    }
    const css = read('local-month-calendar.css');
    assert.match(css, /\.month-calendar-interval-fields label \{ flex: 1 1 100%; \}/);
    assert.match(css, /\.month-calendar-interval-result \{ overflow-wrap: anywhere;/);
    const source = read('newtab.js').split('    createMonthCalendar() {')[1].split('    // The optional card shares')[0];
    assert.doesNotMatch(source, /\b(?:setTimeout|setInterval|fetch|XMLHttpRequest|localStorage|chrome\.storage)\s*[.(]/);
    for (const nodeName of ['summary', 'start', 'end', 'calculate', 'result', 'hint']) {
        const h = model(); h.open(); assert.equal(h.context.shouldToggleFromEvent({ target: h.view.interval[nodeName] }), false);
    }
});
