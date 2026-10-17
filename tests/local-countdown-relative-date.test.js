'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const Countdown = require('../shared/local-countdown-store');
const { Controller } = require('../shared/local-countdown-controller');
const configured = (extra = {}) => ({ ...Countdown.initial(), title: 'Synthetic milestone', targetDate: '2026-10-20', revision: 1, ...extra });
const flush = () => new Promise(resolve => setImmediate(resolve));

// Real Countdown store/controller with a synthetic DOM and in-memory backend.
// This does not establish native keyboard, IME, layout or accessibility acceptance.
async function model({ raw: initial = configured(), failRead = false, translate } = {}) {
    const document = createDocument({ blurUnavailableFocus: true }), events = new Map(), timers = new Map();
    let raw = initial, readFailure = failRead, writeFailure = false, reads = 0, writes = 0, timerId = 0;
    let currentDate = new Date(2026, 9, 17, 12), tail = Promise.resolve();
    const backend = {
        lock(action) { const next = tail.then(action); tail = next.catch(() => {}); return next; },
        async read() { reads++; if (readFailure) throw Error('synthetic read failure'); return structuredClone(raw); },
        async write(value) { if (writeFailure) throw Error('synthetic write failure'); writes++; raw = structuredClone(value); },
        subscribe() { return () => {}; }
    };
    const api = { ...Countdown, Controller }, window = {
        LocalItabCountdown: api, Blob, TextDecoder, i18n: translate ? { t: translate } : undefined,
        confirm: () => true,
        getComputedStyle(node) { for (let current = node; current; current = current.parentElement) if (current.style.visibility) return { visibility: current.style.visibility }; return { visibility: 'visible' }; },
        setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id),
        addEventListener(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
        removeEventListener(type, fn) { events.get(type)?.delete(fn); }
    };
    const create = document.createElement; document.createElement = tag => { const node = create(tag); node.click = () => node.dispatch('click'); return node; };
    vm.runInNewContext(fs.readFileSync(require.resolve('../shared/local-countdown-view'), 'utf8'), { window, document });
    const parent = document.createElement('div'), host = document.createElement('div'); document.body.append(parent); parent.append(host);
    const controller = new Controller(new Countdown.Store(backend));
    const view = api.mountSettings(host, { controller, now: () => currentDate });
    await flush();
    return {
        document, parent, host, window, view, controller, api, backend, timers,
        get raw() { return raw; }, get reads() { return reads; }, get writes() { return writes; },
        readFail(value) { readFailure = value; }, writeFail(value) { writeFailure = value; },
        now(value) { currentDate = value; }, remote(value) { raw = structuredClone(value); },
        fire(type) { for (const fn of events.get(type) || []) fn(); },
        input(field, value) { view[field].value = value; view[field].dispatch('input'); },
        fill(value) { this.input('relativeDays', value); view.relativeApply.dispatch('click'); },
        tick() { const [id, timer] = [...timers].find(([, item]) => item.delay === 60000); timers.delete(id); timer.fn(); }
    };
}

test('relative-date entry: pure calendar helper exists and 0 means today', () => {
    assert.equal(typeof Countdown.dateFromToday, 'function', 'a pure local-calendar date-from-today helper is required');
    assert.equal(Countdown.dateFromToday(0, new Date(2026, 9, 17, 12)), '2026-10-17');
});

test('relative-date entry: settings has a labeled day count and native fill button', async t => {
    const m = await model(); t.after(() => m.view.destroy());
    assert(m.view.relativeDays, 'settings needs an explicit days-from-today input');
    assert(m.view.relativeApply, 'settings needs a native fill-date button');
    assert.equal(m.view.relativeDays.tagName, 'INPUT');
    assert.equal(m.view.relativeDays.parentElement.tagName, 'LABEL');
    assert.equal(m.view.relativeDays.getAttribute('aria-label'), 'Days from today');
    assert.equal(m.view.relativeApply.tagName, 'BUTTON'); assert.equal(m.view.relativeApply.type, 'button');
});

function localDate(year, month, day, hour = 12, minute = 0) {
    const date = new Date(0); date.setHours(hour, minute, 0, 0); date.setFullYear(year, month - 1, day); return date;
}
const importedFile = text => {
    const bytes = new TextEncoder().encode(text);
    return { name: 'synthetic-countdown.txt', size: bytes.byteLength, arrayBuffer: async () => bytes.buffer };
};
async function preview(m, file = importedFile('Synthetic imported title\n2028-02-29\n')) {
    m.view.chooseImport(); m.view.importFile.files = [file]; await m.view.readImport(); return m.view.importSession;
}

test('relative-date helper: Gregorian boundaries, early years and exact range stay calendar-only', () => {
    const cases = [
        [1, 1, 1, 0, '0001-01-01'], [4, 2, 28, 1, '0004-02-29'], [99, 12, 31, 1, '0100-01-01'],
        [100, 2, 28, 1, '0100-03-01'], [400, 2, 28, 1, '0400-02-29'], [1900, 2, 28, 1, '1900-03-01'],
        [2000, 2, 28, 1, '2000-02-29'], [2028, 2, 28, 2, '2028-03-01'], [2026, 12, 31, 1, '2027-01-01'],
        [9999, 12, 30, 1, '9999-12-31'], [9999, 12, 31, 0, '9999-12-31'], [1, 1, 1, 3652058, '9999-12-31']
    ];
    for (const [year, month, day, days, expected] of cases) {
        const today = localDate(year, month, day), original = today.getTime();
        assert.equal(Countdown.dateFromToday(days, today), expected);
        assert.equal(Countdown.calendarDifference(expected, today), days); assert.equal(today.getTime(), original);
        Countdown.parseDate(expected);
    }
    assert.throws(() => Countdown.dateFromToday(1, localDate(9999, 12, 31)), { code: 'DATE' });
    assert.throws(() => Countdown.dateFromToday(3652059, localDate(1, 1, 1)), { code: 'DATE' });
});

test('relative-date helper: reject invalid dates, unsafe counts and coercion without normalization', () => {
    for (const days of [-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '2', '', null, undefined, true, {}, 2n]) {
        assert.throws(() => Countdown.dateFromToday(days, localDate(2026, 10, 17)), { code: 'DAYS' });
    }
    for (const date of [new Date(NaN), {}, { getTime: () => 0 }, '2026-10-17', null, localDate(0, 12, 31), localDate(10000, 1, 1)]) {
        assert.throws(() => Countdown.dateFromToday(0, date), { code: 'DATE' });
    }
    assert.throws(() => Countdown.dateFromToday(Number.MAX_SAFE_INTEGER, localDate(2026, 10, 17)), { code: 'DATE' });
    const today = localDate(2026, 10, 17); today.getFullYear = () => 2000;
    assert.equal(Countdown.dateFromToday(1, today), '2026-10-18', 'native Date slots determine the local date');
});

test('relative-date helper: fresh timezone processes cover DST and non-integer UTC offsets', () => {
    const { spawnSync } = require('node:child_process');
    const source = `const assert = require('node:assert/strict'); const api = require(${JSON.stringify(require.resolve('../shared/local-countdown-store'))});
        for (const [y,m,d,h,n,expected] of [[2026,2,7,23,1,'2026-03-08'],[2026,10,1,0,1,'2026-11-02'],[2026,8,26,23,1,'2026-09-27'],[2026,3,5,0,1,'2026-04-06']]) {
            const date = new Date(y,m,d,h,30); assert.equal(api.dateFromToday(n,date),expected); assert.equal(api.calendarDifference(expected,date),n);
        }
        const instant = new Date('2026-12-31T10:30:00Z');
        const expected = ['Pacific/Chatham', 'Pacific/Kiritimati'].includes(process.env.TZ) ? '2027-01-01' : '2026-12-31';
        assert.equal(api.dateFromToday(0, instant), expected);`;
    for (const TZ of ['UTC', 'America/New_York', 'Asia/Kathmandu', 'Pacific/Chatham', 'Pacific/Kiritimati']) {
        const result = spawnSync(process.execPath, ['--max-old-space-size=512', '-e', source], { encoding: 'utf8', env: { ...process.env, TZ } });
        assert.equal(result.status, 0, `${TZ}: ${result.stderr || result.stdout}`);
    }
});

test('relative-date draft: fill changes only the date once, retains focus and saves only explicitly', async t => {
    const m = await model(); t.after(() => m.view.destroy());
    const original = structuredClone(m.raw), reads = m.reads, calls = [], setDraft = m.controller.setDraft.bind(m.controller);
    m.controller.setDraft = fields => { calls.push(structuredClone(fields)); setDraft(fields); };
    m.input('relativeDays', '0002'); assert(!m.controller.hasUncommittedWork()); assert.equal(m.controller.generation, 0);
    m.view.relativeApply.focus(); m.view.relativeApply.dispatch('click');
    assert.deepEqual(calls, [{ targetDate: '2026-10-19' }]);
    assert.deepEqual(m.controller.draft, { enabled: false, title: original.title, targetDate: '2026-10-19' });
    assert.equal(m.controller.generation, 1); assert.equal(m.document.activeElement, m.view.relativeApply);
    assert.match(m.view.relativeStatus.textContent, /2026-10-19.*Save/); assert.equal(m.view.relativeStatus.getAttribute('role'), 'status');
    assert.match(m.view.status.textContent, /Unsaved/); assert.equal(m.writes, 0); assert.equal(m.reads, reads); assert.deepEqual(m.raw, original);
    m.view.relativeApply.dispatch('click'); assert.equal(calls.length, 1); assert.equal(m.controller.generation, 1);
    m.fill('0'); assert.equal(m.controller.draft.targetDate, '2026-10-17');
    m.fill('1'); assert.equal(m.controller.draft.targetDate, '2026-10-18', 'always count from today, not the old target');
    m.view.saveButton.dispatch('click'); await flush();
    assert.equal(m.writes, 1); assert.equal(m.raw.targetDate, '2026-10-18'); assert.equal(m.raw.enabled, false);
    assert.deepEqual(Object.keys(m.raw).sort(), ['schemaVersion', 'revision', 'enabled', 'title', 'targetDate'].sort());
    assert.equal(m.view.relativeStatus.textContent, '');
    m.fill('2'); m.view.cancelButton.dispatch('click'); await flush();
    assert.equal(m.controller.draft.targetDate, '2026-10-18'); assert.equal(m.writes, 1);
});

test('relative-date draft: blank disabled Countdown stays disabled and unnamed until explicit edits', async t => {
    const m = await model({ raw: Countdown.initial() }); t.after(() => m.view.destroy());
    m.fill('7'); assert.deepEqual(m.controller.draft, { enabled: false, title: '', targetDate: '2026-10-24' });
    assert.deepEqual(m.raw, Countdown.initial()); assert.equal(m.writes, 0);
    m.view.saveButton.dispatch('click'); await flush();
    assert.equal(m.controller.error.code, 'TEXT'); assert.equal(m.writes, 0);
});

test('relative-date input: strict decimal digits and overflow failures leave draft, status and generations untouched', async t => {
    const m = await model(); t.after(() => m.view.destroy());
    const original = structuredClone(m.controller.draft), status = m.view.status.textContent, reads = m.reads;
    for (const value of ['', ' ', '-1', '+1', '1.0', '.5', '1e2', '0x10', '2days', '1 2', '2\n', ' 2', '２', '١', '9007199254740992', '999999999999999999999999999999999']) {
        m.fill(value);
        assert.deepEqual(m.controller.draft, original, value); assert.equal(m.controller.generation, 0, value);
        assert.equal(m.view.status.textContent, status); assert(m.view.relativeStatus.classList.contains('countdown-error'));
        assert.match(m.view.relativeStatus.textContent, /draft is unchanged/); assert.equal(m.controller.error, null);
    }
    m.now(localDate(9999, 12, 31)); m.fill('1'); assert.deepEqual(m.controller.draft, original);
    m.now(new Date(NaN)); m.fill('0'); assert.deepEqual(m.controller.draft, original);
    assert.equal(m.reads, reads); assert.equal(m.writes, 0);
    m.now(localDate(2026, 10, 17)); m.fill('0000'); assert.equal(m.controller.draft.targetDate, '2026-10-17');
    assert(!m.view.relativeStatus.classList.contains('countdown-error'));
});

test('relative-date timing: click-time local date is used once and midnight/focus never moves the filled target', async t => {
    const m = await model(); t.after(() => m.view.destroy());
    m.now(localDate(2026, 10, 17, 23, 59)); m.input('relativeDays', '2');
    m.now(localDate(2026, 10, 18, 0, 1)); m.view.relativeApply.dispatch('click');
    assert.equal(m.controller.draft.targetDate, '2026-10-20'); assert.equal(m.controller.generation, 0, 'same date is a no-op');
    m.fill('1'); assert.equal(m.controller.draft.targetDate, '2026-10-19');
    const receipt = m.view.relativeStatus.textContent, reads = m.reads, generation = m.controller.generation;
    m.now(localDate(2026, 10, 19, 0, 1)); m.tick(); m.fire('focus');
    assert.equal(m.controller.draft.targetDate, '2026-10-19'); assert.equal(m.controller.generation, generation);
    assert.match(m.view.datePreview.textContent, /Today/); assert.equal(m.view.relativeStatus.textContent, receipt);
    assert.equal(m.reads, reads); assert.equal(m.writes, 0);
});

test('relative-date IME: temporary parameter composition is local and Enter has no custom submission', async t => {
    const m = await model(); t.after(() => m.view.destroy());
    const session = await preview(m), original = structuredClone(m.controller.draft);
    m.view.relativeDays.dispatch('compositionstart'); m.input('relativeDays', '2');
    assert(!m.controller.composing); assert.equal(m.controller.generation, 0); assert(!m.controller.hasUncommittedWork());
    assert.equal(m.view.importSession, session); assert(!m.view.importPanel.hidden); assert(m.view.relativeApply.disabled);
    m.view.relativeApply.dispatch('click'); assert.deepEqual(m.controller.draft, original);
    const event = m.view.relativeDays.dispatch('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
    assert(!event.prevented); assert.deepEqual(m.controller.draft, original);
    m.view.relativeDays.dispatch('compositionend'); assert(!m.view.relativeApply.disabled);
    m.view.relativeDays.dispatch('keydown', { key: 'Enter' }); assert.deepEqual(m.controller.draft, original);
    m.view.relativeApply.dispatch('click', { isComposing: true }); m.view.relativeApply.dispatch('click', { keyCode: 229 });
    assert.deepEqual(m.controller.draft, original);
    m.view.date.dispatch('compositionstart'); m.view.relativeApply.dispatch('click'); assert.deepEqual(m.controller.draft, original);
    m.view.date.dispatch('compositionend'); m.view.relativeApply.dispatch('click');
    assert.equal(m.controller.draft.targetDate, '2026-10-19'); assert.equal(m.writes, 0);
});

test('relative-date import: parameter, invalid count and same-date fill retain review; real new draft invalidates it', async t => {
    const m = await model(); t.after(() => m.view.destroy());
    const session = await preview(m), text = m.view.importPreview.textContent;
    m.input('relativeDays', '3'); assert.equal(m.view.importSession, session);
    m.fill('1e2'); assert.equal(m.view.importSession, session); assert.equal(m.controller.generation, 0);
    m.fill('3'); assert.equal(m.view.importSession, session); assert.equal(m.view.importPreview.textContent, text); assert(!m.view.importApply.disabled);
    m.fill('4'); assert.equal(m.controller.generation, 1); assert.equal(m.view.importSession, null); assert(m.view.importPanel.hidden);
    m.view.importApply.dispatch('click'); assert.equal(m.controller.draft.title, 'Synthetic milestone'); assert.equal(m.controller.draft.targetDate, '2026-10-21'); assert.equal(m.writes, 0);
});

test('relative-date import: late file read survives a same date, but cannot overwrite a new draft date', async t => {
    for (const days of ['3', '4']) {
        const m = await model(); t.after(() => m.view.destroy());
        const file = importedFile('Synthetic late title\n2028-02-29\n'), bytes = await file.arrayBuffer(), gate = deferred();
        file.arrayBuffer = () => gate.promise; m.view.chooseImport(); m.view.importFile.files = [file]; const pending = m.view.readImport();
        const session = m.view.importSession; m.fill(days); gate.resolve(bytes); await pending;
        if (days === '3') { assert.equal(m.view.importSession, session); assert.match(m.view.importPreview.textContent, /Synthetic late title/); assert(!m.view.importApply.disabled); }
        else { assert.equal(m.view.importSession, null); assert(m.view.importPanel.hidden); assert.equal(m.view.importPreview.textContent, ''); }
        assert.equal(m.controller.draft.title, 'Synthetic milestone'); assert.equal(m.writes, 0);
    }
});

test('relative-date read race: late saved refresh retains a new draft and records the real conflict', async t => {
    const m = await model(); t.after(() => m.view.destroy());
    const gate = deferred(), read = m.backend.read; m.backend.read = async () => { await gate.promise; return read(); };
    const pending = m.controller.refresh(); m.fill('8');
    m.remote(configured({ revision: 2, title: 'Synthetic other page', targetDate: '2027-01-01' })); gate.resolve(); await pending;
    assert.equal(m.controller.draft.targetDate, '2026-10-25'); assert.equal(m.controller.draft.title, 'Synthetic milestone');
    assert(m.controller.conflict); assert.equal(m.controller.state.title, 'Synthetic other page'); assert.equal(m.writes, 0);
});

test('relative-date recovery: editable DATE validation can be corrected without retry or storage work', async t => {
    const m = await model(); t.after(() => m.view.destroy());
    m.input('date', '2026-02-30'); m.view.saveButton.dispatch('click'); await flush();
    assert.equal(m.controller.error.code, 'DATE'); assert(!m.view.relativeApply.disabled);
    let retries = 0; m.controller.retry = () => { retries++; }; const reads = m.reads;
    m.fill('2'); assert.equal(m.controller.draft.targetDate, '2026-10-19'); assert.equal(m.controller.error, null);
    assert(!m.view.saveButton.disabled); assert.equal(m.reads, reads); assert.equal(m.writes, 0); assert.equal(retries, 0);
});

test('relative-date recovery: uncertain saves, failed reads, conflict and pending operations cannot fill', async t => {
    const m = await model(); t.after(() => m.view.destroy());
    m.input('title', 'Synthetic unsaved title'); m.writeFail(true); m.view.saveButton.dispatch('click'); await flush();
    const error = m.controller.error, attempt = m.controller.lastAttempt, original = structuredClone(m.controller.draft), generation = m.controller.generation, reads = m.reads;
    assert.equal(error.code, 'WRITE'); m.fill('8'); assert.deepEqual(m.controller.draft, original);
    assert.equal(m.controller.error, error); assert.equal(m.controller.lastAttempt, attempt); assert.equal(m.controller.generation, generation); assert.equal(m.reads, reads);
    m.writeFail(false); await m.controller.retry(); assert.equal(m.writes, 1);
    m.readFail(true); await assert.rejects(m.controller.refresh()); m.fill('8'); assert.equal(m.controller.draft.targetDate, original.targetDate); m.readFail(false); await m.controller.retry();
    const gate = deferred(), read = m.backend.read; m.backend.read = async () => { await gate.promise; return read(); };
    m.input('title', 'Synthetic pending title'); m.view.saveButton.dispatch('click'); assert(m.controller.pending);
    m.fill('9'); assert.equal(m.controller.draft.targetDate, original.targetDate); gate.resolve(); await flush();
    m.input('title', 'Synthetic conflict draft'); m.remote({ ...m.raw, revision: m.raw.revision + 1, title: 'Synthetic remote' }); await m.controller.refresh();
    assert(m.controller.conflict); m.fill('10'); assert.equal(m.controller.draft.targetDate, original.targetDate);
});

test('relative-date lifecycle: synthetic clicks fail closed for inactive, hidden, inert or stale hosts', async () => {
    const boundaries = {
        loading: m => { m.controller.loaded = false; }, controllerClosed: m => m.controller.destroy(),
        viewClosed: m => m.view.destroy(), suspended: m => m.fire('pagehide'),
        hiddenDocument: m => { m.document.hidden = true; }, hiddenState: m => { m.document.visibilityState = 'hidden'; },
        hiddenHost: m => { m.host.hidden = true; }, hiddenParent: m => { m.parent.hidden = true; },
        noLayout: m => { m.parent.style.display = 'none'; }, hiddenStyle: m => { m.parent.style.visibility = 'hidden'; },
        collapsedStyle: m => { m.parent.style.visibility = 'collapse'; }, inert: m => { m.parent.inert = true; },
        detached: m => m.host.remove(), replaced: m => m.host.replaceChildren(m.document.createElement('p')),
        departing: m => { m.window.LocalItabContentLifecycle = { departing: true }; },
        invalidated: m => { m.backend.workspace = { invalidated: true }; },
        workspaceSuspended: m => { m.backend.workspace = { _suspended: true }; },
        switchedSession: m => { m.backend.workspace = {}; m.window.LocalItabWorkspaces = { session: {} }; }
    };
    for (const [name, leave] of Object.entries(boundaries)) {
        const m = await model();
        try {
            const draft = structuredClone(m.controller.draft), generation = m.controller.generation, reads = m.reads;
            m.input('relativeDays', '2'); leave(m); m.view.relativeApply.dispatch('click');
            assert.deepEqual(m.controller.draft, draft, name); assert.equal(m.controller.generation, generation, name);
            assert.equal(m.writes, 0, name); assert.equal(m.reads, reads, name);
        } finally { if (!m.view.closed) m.view.destroy(); }
    }
});

test('relative-date catalog: English, Chinese and fallback expose identical explicit parameter semantics', async t => {
    const keys = ['countdownRelativeDaysLabel', 'countdownRelativeDaysHelp', 'countdownRelativeApply', 'countdownRelativeError', 'countdownRelativeFilled'];
    for (const locale of ['en', 'zh_CN']) {
        const catalog = JSON.parse(fs.readFileSync(require.resolve(`../_locales/${locale}/messages.json`), 'utf8'));
        for (const key of keys) assert(catalog[key]?.message, `${locale}: ${key}`);
        const m = await model({ translate: (key, values) => (catalog[key]?.message || key).replace(/\$1/g, String(values[0] ?? '')) }); t.after(() => m.view.destroy());
        assert.equal(m.view.relativeDays.getAttribute('aria-label'), catalog.countdownRelativeDaysLabel.message);
        assert.equal(m.view.relativeApply.textContent, catalog.countdownRelativeApply.message);
        m.fill('2'); assert.equal(m.view.relativeStatus.textContent, catalog.countdownRelativeFilled.message.replace('$1', '2026-10-19'));
        m.fill('-1'); assert.equal(m.view.relativeStatus.textContent, catalog.countdownRelativeError.message);
    }
});
