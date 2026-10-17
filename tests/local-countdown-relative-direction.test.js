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
        direction(value) { view.relativeDirection.value = value; view.relativeDirection.dispatch('change'); },
        fill(value, event = {}) { this.input('relativeDays', value); view.relativeApply.dispatch('click', event); },
        tick() { const [id, timer] = [...timers].find(([, item]) => item.delay === 60000); timers.delete(id); timer.fn(); }
    };
}

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

test('relative direction helper: backward Gregorian boundaries, early years and exact lower bound', () => {
    const cases = [
        [1, 1, 1, 0, '0001-01-01'], [1, 1, 2, 1, '0001-01-01'], [4, 3, 1, 1, '0004-02-29'],
        [100, 1, 1, 1, '0099-12-31'], [100, 3, 1, 1, '0100-02-28'], [400, 3, 1, 1, '0400-02-29'],
        [1900, 3, 1, 1, '1900-02-28'], [2000, 3, 1, 1, '2000-02-29'], [2028, 3, 1, 2, '2028-02-28'],
        [2027, 1, 1, 1, '2026-12-31'], [9999, 12, 31, 0, '9999-12-31'], [9999, 12, 31, 3652058, '0001-01-01']
    ];
    for (const [year, month, day, days, expected] of cases) {
        const today = localDate(year, month, day), original = today.getTime();
        assert.equal(Countdown.dateFromToday(days, today, 'before'), expected);
        assert.equal(Countdown.calendarDifference(expected, today), days === 0 ? 0 : -days);
        assert.equal(today.getTime(), original); Countdown.parseDate(expected);
    }
});

test('relative direction helper: default after is backward compatible and zero works in both directions', () => {
    for (const today of [localDate(1, 1, 1), localDate(99, 12, 30), localDate(2026, 10, 17), localDate(9999, 12, 31)]) {
        for (const days of [0, 1, 300]) {
            if (Countdown.calendarDifference('9999-12-31', today) < days) continue;
            assert.equal(Countdown.dateFromToday(days, today, 'after'), Countdown.dateFromToday(days, today));
            assert.equal(Countdown.dateFromToday(days, today, undefined), Countdown.dateFromToday(days, today));
        }
        assert.equal(Countdown.dateFromToday(0, today, 'before'), Countdown.dateFromToday(0, today, 'after'));
    }
});

test('relative direction helper: strict enum and count types reject coercion before calendar movement', () => {
    const today = localDate(2026, 10, 17);
    for (const direction of ['', 'Before', 'AFTER', ' before', 'after ', 'past', null, false, true, 0, 1, [], {}, new String('before'), Symbol('before'), 1n]) {
        assert.throws(() => Countdown.dateFromToday(1, today, direction), { code: 'DIRECTION' });
    }
    for (const days of [-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, '2', '', null, undefined, true, {}, 2n]) {
        assert.throws(() => Countdown.dateFromToday(days, today, 'before'), { code: 'DAYS' });
    }
    let coercions = 0;
    const object = { valueOf() { coercions++; return 1; }, toString() { coercions++; return 'before'; } };
    assert.throws(() => Countdown.dateFromToday(object, today, 'before'), { code: 'DAYS' });
    assert.throws(() => Countdown.dateFromToday(1, today, object), { code: 'DIRECTION' });
    assert.equal(coercions, 0);
});

test('relative direction helper: bounds reject safely before addition or subtraction', () => {
    const lower = localDate(1, 1, 1), upper = localDate(9999, 12, 31), original = Date.prototype.setUTCDate;
    let moves = 0;
    Date.prototype.setUTCDate = function (...args) { moves++; return original.apply(this, args); };
    try {
        for (const days of [1, 3652059, Number.MAX_SAFE_INTEGER]) {
            assert.throws(() => Countdown.dateFromToday(days, lower, 'before'), { code: 'DATE' });
            assert.throws(() => Countdown.dateFromToday(days, upper, 'after'), { code: 'DATE' });
        }
        assert.throws(() => Countdown.dateFromToday(3652059, upper, 'before'), { code: 'DATE' });
        assert.throws(() => Countdown.dateFromToday(3652059, lower, 'after'), { code: 'DATE' });
        assert.equal(moves, 0, 'out-of-range arithmetic is never attempted');
    } finally { Date.prototype.setUTCDate = original; }
});

test('relative direction helper: invalid dates fail closed; native Date slots remain authoritative and immutable', () => {
    for (const date of [new Date(NaN), {}, { getTime: () => 0 }, '2026-10-17', null, localDate(0, 12, 31), localDate(10000, 1, 1), new Proxy(new Date(), {})]) {
        assert.throws(() => Countdown.dateFromToday(0, date, 'before'), { code: 'DATE' });
    }
    const today = localDate(2026, 10, 17), time = today.getTime();
    for (const key of ['getTime', 'getFullYear', 'getMonth', 'getDate', 'setDate', 'setUTCDate']) today[key] = () => { throw Error('overridden accessor must not run'); };
    Object.freeze(today);
    assert.equal(Countdown.dateFromToday(2, today, 'before'), '2026-10-15');
    assert.equal(Date.prototype.getTime.call(today), time);
    const foreign = vm.runInNewContext('new Date(2026, 9, 17, 12)');
    assert.equal(Countdown.dateFromToday(2, foreign, 'before'), '2026-10-15');
});

test('relative direction helper: sequential timezone probes cover backwards DST, fractional offsets and local year rollover', () => {
    const { spawnSync } = require('node:child_process');
    const source = `const assert = require('node:assert/strict'); const api = require(${JSON.stringify(require.resolve('../shared/local-countdown-store'))});
        for (const [y,m,d,h,n,expected] of [[2026,2,9,0,1,'2026-03-08'],[2026,10,2,0,1,'2026-11-01'],[2026,8,28,0,1,'2026-09-27'],[2026,3,6,0,1,'2026-04-05']]) {
            const date = new Date(y,m,d,h,30), original = date.getTime();
            assert.equal(api.dateFromToday(n,date,'before'),expected); assert.equal(api.calendarDifference(expected,date),-n); assert.equal(date.getTime(),original);
        }
        const instant = new Date('2026-12-31T10:30:00Z');
        const expected = ['Pacific/Chatham', 'Pacific/Kiritimati'].includes(process.env.TZ) ? '2026-12-31' : '2026-12-30';
        assert.equal(api.dateFromToday(1, instant, 'before'), expected);`;
    for (const TZ of ['UTC', 'America/New_York', 'Asia/Kathmandu', 'Pacific/Chatham', 'Pacific/Kiritimati']) {
        const result = spawnSync(process.execPath, ['--max-old-space-size=512', '-e', source], { encoding: 'utf8', env: { ...process.env, TZ }, timeout: 10000 });
        assert.equal(result.status, 0, `${TZ}: ${result.stderr || result.stdout}`);
    }
});

test('relative direction settings: labeled stable native select starts after; parameter edits do not dirty or persist', async t => {
    const m = await model(); t.after(() => m.view.destroy());
    const select = m.view.relativeDirection, draft = structuredClone(m.controller.draft), reads = m.reads;
    assert.equal(select.tagName, 'SELECT'); assert.equal(select.parentElement.tagName, 'LABEL');
    assert.equal(select.getAttribute('aria-label'), 'Direction from today'); assert.equal(select.value, 'after');
    assert.deepEqual(select.children.map(node => [node.tagName, node.value, node.textContent]), [['OPTION', 'after', 'After today'], ['OPTION', 'before', 'Before today']]);
    m.direction('before'); m.input('relativeDays', '0002');
    assert.deepEqual(m.controller.draft, draft); assert.equal(m.controller.generation, 0); assert(!m.view.hasUncommittedWork());
    assert.equal(m.reads, reads); assert.equal(m.writes, 0); assert(m.view.saveButton.disabled); assert(m.view.cancelButton.disabled);
    select.focus(); m.view.render(); m.tick(); m.fire('focus');
    assert.equal(m.view.relativeDirection, select); assert.equal(select.value, 'before'); assert.equal(m.view.relativeDays.value, '0002');
    assert.equal(m.document.activeElement, select); assert.equal(m.controller.generation, 0);
});

test('relative direction draft: before fill changes only target, preserves native focus, saves only explicitly and resets on remount', async t => {
    const m = await model({ raw: configured({ enabled: true }) }); t.after(() => { if (!m.view.closed) m.view.destroy(); });
    const original = structuredClone(m.raw), reads = m.reads, calls = [], setDraft = m.controller.setDraft.bind(m.controller);
    m.controller.setDraft = fields => { calls.push(structuredClone(fields)); setDraft(fields); };
    m.direction('before'); m.view.relativeApply.focus(); m.fill('0002');
    assert.deepEqual(calls, [{ targetDate: '2026-10-15' }]);
    assert.deepEqual(m.controller.draft, { enabled: true, title: original.title, targetDate: '2026-10-15' });
    assert.equal(m.document.activeElement, m.view.relativeApply); assert.match(m.view.datePreview.textContent, /2 days ago/);
    m.view.relativeApply.dispatch('click'); assert.equal(calls.length, 1); assert.equal(m.controller.generation, 1);
    assert.equal(m.reads, reads); assert.equal(m.writes, 0); assert.deepEqual(m.raw, original);
    assert.equal(Countdown.exportText(m.controller.draft), 'Synthetic milestone\n2026-10-15\n');
    await m.controller.save(); assert.equal(m.writes, 1); assert.equal(m.raw.targetDate, '2026-10-15');
    assert.deepEqual(Object.keys(m.raw).sort(), ['schemaVersion', 'revision', 'enabled', 'title', 'targetDate'].sort());
    assert.equal(m.view.relativeDirection.value, 'before'); assert.equal(m.view.relativeDays.value, '0002');
    m.fill('4'); await m.controller.useSaved(); assert.equal(m.controller.draft.targetDate, '2026-10-15');
    m.view.destroy();
    const fresh = await model({ raw: m.raw }); t.after(() => fresh.view.destroy());
    assert.equal(fresh.view.relativeDirection.value, 'after'); assert.equal(fresh.view.relativeDays.value, '');
    assert.equal(fresh.controller.draft.targetDate, '2026-10-15'); assert.equal(fresh.view.relativeStatus.textContent || '', '');
});

test('relative direction draft: blank hidden Countdown stays unnamed and hidden; zero has identical meaning', async t => {
    const m = await model({ raw: Countdown.initial() }); t.after(() => m.view.destroy());
    m.direction('before'); m.fill('7'); assert.deepEqual(m.controller.draft, { enabled: false, title: '', targetDate: '2026-10-10' });
    m.fill('0000'); assert.equal(m.controller.draft.targetDate, '2026-10-17'); const generation = m.controller.generation;
    m.direction('after'); m.fill('0'); assert.equal(m.controller.generation, generation);
    await assert.rejects(m.controller.save(), { code: 'TEXT' }); assert.equal(m.writes, 0); assert.deepEqual(m.raw, Countdown.initial());
});

test('relative direction feedback: changes clear only relative status and preserve title/date caret and save error', async t => {
    const m = await model(); t.after(() => m.view.destroy());
    m.fill('invalid'); assert(m.view.relativeStatus.classList.contains('countdown-error'));
    const title = m.view.title, date = m.view.date, input = m.view.relativeDays;
    title.focus(); title.selectionStart = 2; title.selectionEnd = 4; input.selectionStart = 1; input.selectionEnd = 3;
    const status = m.view.status.textContent, previewText = m.view.datePreview.textContent, generation = m.controller.generation;
    m.direction('before'); assert.equal(m.view.relativeStatus.textContent, ''); assert.equal(m.view.relativeReceipt, null);
    assert(!m.view.relativeStatus.classList.contains('countdown-error')); assert.equal(m.document.activeElement, title);
    assert.equal(m.view.status.textContent, status); assert.equal(m.view.datePreview.textContent, previewText);
    assert.equal(title.selectionStart, 2); assert.equal(title.selectionEnd, 4); assert.equal(input.selectionStart, 1); assert.equal(input.selectionEnd, 3);
    m.view.render(); assert.equal(m.view.title, title); assert.equal(m.view.date, date); assert.equal(m.view.relativeDays, input); assert.equal(m.controller.generation, generation);
    m.input('title', 'Synthetic failed save'); m.writeFail(true); await assert.rejects(m.controller.save());
    const error = m.controller.error, attempt = m.controller.lastAttempt, errorStatus = m.view.status.textContent;
    m.direction('after'); assert.equal(m.controller.error, error); assert.equal(m.controller.lastAttempt, attempt); assert.equal(m.view.status.textContent, errorStatus);
});

test('relative direction input: strict counts, lower bound, invalid Date and unknown select value leave draft intact', async t => {
    const m = await model(); t.after(() => m.view.destroy()); m.direction('before');
    const draft = structuredClone(m.controller.draft), status = m.view.status.textContent, reads = m.reads;
    for (const value of ['', ' ', '-1', '+1', '1.0', '.5', '1e2', '0x10', '2days', '1 2', '2\n', ' 2', '２', '١', '9007199254740992', '999999999999999999999999999999999']) {
        m.fill(value); assert.deepEqual(m.controller.draft, draft, value); assert.equal(m.controller.generation, 0);
        assert.match(m.view.relativeStatus.textContent, /0001-01-01.*9999-12-31.*draft is unchanged/); assert.equal(m.view.status.textContent, status);
    }
    m.now(localDate(1, 1, 1)); m.fill('1'); assert.deepEqual(m.controller.draft, draft);
    m.now(new Date(NaN)); m.fill('0'); assert.deepEqual(m.controller.draft, draft);
    m.now(localDate(2026, 10, 17));
    for (const direction of ['', 'past', 'BEFORE', ' after', null]) {
        m.direction(direction); m.fill('2'); assert.deepEqual(m.controller.draft, draft); assert.equal(m.controller.generation, 0);
    }
    assert.equal(m.reads, reads); assert.equal(m.writes, 0); assert.equal(m.controller.error, null);
});

test('relative direction timing: use click-time local day, never move filled date on midnight/focus or change of parameters', async t => {
    const m = await model(); t.after(() => m.view.destroy());
    m.now(localDate(2026, 10, 17, 23, 59)); m.direction('before'); m.input('relativeDays', '2');
    m.now(localDate(2026, 10, 18, 0, 1)); m.view.relativeApply.dispatch('click'); assert.equal(m.controller.draft.targetDate, '2026-10-16');
    const generation = m.controller.generation, reads = m.reads;
    m.now(localDate(2026, 10, 19, 0, 1)); m.tick(); m.fire('focus'); m.direction('after');
    assert.equal(m.controller.draft.targetDate, '2026-10-16'); assert.equal(m.controller.generation, generation); assert.equal(m.reads, reads);
    m.direction('before'); m.fill('1'); assert.equal(m.controller.draft.targetDate, '2026-10-18'); assert.equal(m.writes, 0);
});

test('relative direction imports: parameters, invalid or same result preserve review; different result invalidates it', async t => {
    const m = await model({ raw: configured({ targetDate: '2026-10-15' }) }); t.after(() => m.view.destroy());
    const session = await preview(m), previewText = m.view.importPreview.textContent;
    m.fill('bad'); const importStatus = m.view.importInfo.textContent;
    m.direction('before'); assert.equal(m.view.relativeStatus.textContent, ''); assert.equal(m.view.importInfo.textContent, importStatus);
    m.input('relativeDays', '2'); assert.equal(m.view.importSession, session); assert(!m.controller.hasUncommittedWork());
    m.fill('1e2'); assert.equal(m.view.importSession, session); assert.equal(m.controller.generation, 0);
    m.fill('2'); assert.equal(m.view.importSession, session); assert.equal(m.view.importPreview.textContent, previewText); assert(!m.view.importApply.disabled);
    m.direction('after'); m.direction('before'); assert.equal(m.view.importSession, session);
    m.fill('3'); assert.equal(m.controller.generation, 1); assert.equal(m.view.importSession, null); assert(m.view.importPanel.hidden);
    m.view.importApply.dispatch('click'); assert.equal(m.controller.draft.title, 'Synthetic milestone'); assert.equal(m.controller.draft.targetDate, '2026-10-14'); assert.equal(m.writes, 0);
});

test('relative direction import race: late TXT read survives direction changes, invalid and same results only', async t => {
    for (const action of ['parameter', 'invalid', 'same', 'different']) {
        const m = await model({ raw: configured({ targetDate: '2026-10-15' }) }); t.after(() => m.view.destroy());
        const file = importedFile('Synthetic late title\n2028-02-29\n'), bytes = await file.arrayBuffer(), gate = deferred();
        file.arrayBuffer = () => gate.promise; m.view.chooseImport(); m.view.importFile.files = [file]; const pending = m.view.readImport();
        const session = m.view.importSession; m.direction('before');
        if (action !== 'parameter') m.fill(action === 'invalid' ? '-2' : action === 'same' ? '2' : '3');
        gate.resolve(bytes); await pending;
        if (action === 'different') { assert.equal(m.view.importSession, null); assert(m.view.importPanel.hidden); assert.equal(m.view.importPreview.textContent, ''); }
        else { assert.equal(m.view.importSession, session); assert.match(m.view.importPreview.textContent, /Synthetic late title/); assert(!m.view.importApply.disabled); }
        assert.equal(m.controller.draft.title, 'Synthetic milestone'); assert.equal(m.writes, 0);
    }
});

test('relative direction refresh race: late saved read retains new past draft and marks conflict', async t => {
    const m = await model(); t.after(() => m.view.destroy()); m.direction('before');
    const gate = deferred(), read = m.backend.read; m.backend.read = async () => { await gate.promise; return read(); };
    const pending = m.controller.refresh(); m.fill('8');
    m.remote(configured({ revision: 2, title: 'Synthetic other page', targetDate: '2027-01-01' })); gate.resolve(); await pending;
    assert.equal(m.controller.draft.targetDate, '2026-10-09'); assert.equal(m.controller.draft.title, 'Synthetic milestone');
    assert(m.controller.conflict); assert.equal(m.controller.state.title, 'Synthetic other page');
    m.fill('9'); assert.equal(m.controller.draft.targetDate, '2026-10-09'); assert.equal(m.writes, 0);
});

test('relative direction recovery: valid past date corrects DATE error without reading, writing or retrying', async t => {
    const m = await model(); t.after(() => m.view.destroy());
    m.input('date', '2026-02-30'); await assert.rejects(m.controller.save(), { code: 'DATE' });
    const error = m.controller.error; m.direction('before'); assert.equal(m.controller.error, error);
    let retries = 0; m.controller.retry = () => { retries++; }; const reads = m.reads;
    m.fill('2'); assert.equal(m.controller.draft.targetDate, '2026-10-15'); assert.equal(m.controller.error, null);
    assert(!m.view.saveButton.disabled); assert.equal(m.reads, reads); assert.equal(m.writes, 0); assert.equal(retries, 0);
});

test('relative direction recovery: failed writes retain exact attempt and Retry only replays the original save', async t => {
    const m = await model(); t.after(() => m.view.destroy()); m.direction('before'); m.fill('2');
    m.writeFail(true); await assert.rejects(m.controller.save(), { code: 'WRITE' });
    const error = m.controller.error, attempt = m.controller.lastAttempt, generation = m.controller.generation, reads = m.reads;
    m.direction('after'); m.fill('7'); m.direction('before'); m.fill('8');
    assert.equal(m.controller.draft.targetDate, '2026-10-15'); assert.equal(m.controller.error, error); assert.equal(m.controller.lastAttempt, attempt);
    assert.equal(m.controller.generation, generation); assert.equal(m.reads, reads); assert.equal(m.writes, 0);
    m.writeFail(false); await m.controller.retry(); assert.equal(m.raw.targetDate, '2026-10-15'); assert.equal(m.writes, 1); assert.equal(m.controller.error, null);
});

test('relative direction recovery: lost write acknowledgement is reconciled without a second write', async t => {
    const m = await model(); t.after(() => m.view.destroy()); m.direction('before'); m.fill('2');
    const write = m.backend.write; m.backend.write = async value => { await write(value); throw Error('synthetic lost acknowledgement'); };
    await assert.rejects(m.controller.save(), { code: 'WRITE' });
    const attempt = m.controller.lastAttempt; assert.equal(m.writes, 1); assert.equal(m.raw.targetDate, '2026-10-15');
    m.direction('after'); m.fill('5'); assert.equal(m.controller.lastAttempt, attempt); assert.equal(m.controller.draft.targetDate, '2026-10-15');
    m.backend.write = write; await m.controller.retry(); assert.equal(m.writes, 1); assert.equal(m.controller.error, null); assert(!m.controller.hasUncommittedWork());
});

test('relative direction recovery: read failures and pending saves block fill without cancelling operation', async t => {
    const m = await model(); t.after(() => m.view.destroy()); m.direction('before');
    m.readFail(true); await assert.rejects(m.controller.refresh()); const error = m.controller.error;
    m.fill('2'); assert.equal(m.controller.draft.targetDate, '2026-10-20'); assert.equal(m.controller.error, error);
    m.readFail(false); await m.controller.retry();
    const gate = deferred(), read = m.backend.read; m.backend.read = async () => { await gate.promise; return read(); };
    m.input('title', 'Synthetic pending title'); const pending = m.controller.save(); assert(m.controller.pending);
    m.direction('after'); m.direction('before'); m.fill('9'); assert.equal(m.controller.draft.targetDate, '2026-10-20');
    gate.resolve(); await pending; assert.equal(m.raw.title, 'Synthetic pending title'); assert.equal(m.writes, 1);
});

test('relative direction activation: reject handled, held, double clicks and IME without global or input shortcuts', async t => {
    const m = await model(); t.after(() => m.view.destroy()); const session = await preview(m);
    m.direction('before'); m.input('relativeDays', '2'); const draft = structuredClone(m.controller.draft);
    for (const event of [{ defaultPrevented: true }, { repeat: true }, { detail: 2 }, { detail: 3 }, { isComposing: true }, { keyCode: 229 }]) {
        m.view.relativeApply.dispatch('click', event); assert.deepEqual(m.controller.draft, draft); assert.equal(m.view.importSession, session);
    }
    for (const key of ['Enter', ' ']) {
        for (const event of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) assert(m.view.relativeApply.dispatch('keydown', { key, ...event }).prevented);
        assert(!m.view.relativeApply.dispatch('keydown', { key }).prevented);
        for (const field of ['relativeDays', 'relativeDirection']) assert(!m.view[field].dispatch('keydown', { key }).prevented);
    }
    assert(!m.document.listeners.has('keydown')); assert(!m.window.keydown); assert.equal(m.controller.generation, 0);
    m.view.relativeDays.dispatch('compositionstart'); m.direction('after'); m.direction('before'); m.view.relativeApply.dispatch('click');
    assert.deepEqual(m.controller.draft, draft); assert(!m.controller.composing); assert.equal(m.view.importSession, session);
    m.view.relativeDays.dispatch('compositionend'); m.view.date.dispatch('compositionstart'); m.view.relativeApply.dispatch('click'); assert.deepEqual(m.controller.draft, draft);
    m.view.date.dispatch('compositionend'); m.view.relativeApply.dispatch('click', { detail: 0 }); assert.equal(m.controller.draft.targetDate, '2026-10-15');
});

test('relative direction lifecycle: select joins existing hidden, stale, workspace and composition action guards', async () => {
    const boundaries = {
        loading: m => { m.controller.loaded = false; }, controllerClosed: m => m.controller.destroy(), viewClosed: m => m.view.destroy(),
        suspended: m => m.fire('pagehide'), hiddenDocument: m => { m.document.hidden = true; }, hiddenState: m => { m.document.visibilityState = 'hidden'; },
        hiddenHost: m => { m.host.hidden = true; }, hiddenParent: m => { m.parent.hidden = true; },
        detached: m => m.host.remove(), replaced: m => m.host.replaceChildren(m.document.createElement('p')),
        departing: m => { m.window.LocalItabContentLifecycle = { departing: true }; },
        invalidated: m => { m.backend.workspace = { invalidated: true }; }, workspaceSuspended: m => { m.backend.workspace = { _suspended: true }; },
        switchedSession: m => { m.backend.workspace = {}; m.window.LocalItabWorkspaces = { session: {} }; },
        selectHidden: m => { m.view.relativeDirection.hidden = true; }, selectNoLayout: m => { m.view.relativeDirection.style.display = 'none'; },
        selectInvisible: m => { m.view.relativeDirection.style.visibility = 'hidden'; }, selectCollapsed: m => { m.view.relativeDirection.style.visibility = 'collapse'; },
        selectInert: m => { m.view.relativeDirection.inert = true; }, selectDetached: m => m.view.relativeDirection.remove(),
        selectReplaced: m => m.view.relativeDirection.replaceWith(m.document.createElement('select')),
        selectInClosedDetails: m => { const details = m.document.createElement('details'); m.view.relativeDirection.parentElement.append(details); m.view.relativeDirection.remove(); details.append(m.view.relativeDirection); }
    };
    for (const [name, leave] of Object.entries(boundaries)) {
        const m = await model();
        try {
            m.direction('before'); m.input('relativeDays', '2'); const draft = structuredClone(m.controller.draft), reads = m.reads;
            leave(m); m.view.relativeApply.dispatch('click');
            assert.deepEqual(m.controller.draft, draft, name); assert.equal(m.controller.generation, 0, name); assert.equal(m.reads, reads, name); assert.equal(m.writes, 0, name);
        } finally { if (!m.view.closed) m.view.destroy(); }
    }
});

test('relative direction loading: select follows initial load availability without rewriting its selection', async t => {
    const m = await model({ failRead: true }); t.after(() => m.view.destroy());
    assert(m.view.relativeDirection.disabled); assert(m.view.relativeDays.disabled); assert(m.view.relativeApply.disabled);
    m.readFail(false); await m.controller.retry(); assert(!m.view.relativeDirection.disabled); assert.equal(m.view.relativeDirection.value, 'after');
    m.direction('before'); await m.controller.refresh(); assert.equal(m.view.relativeDirection.value, 'before'); assert(!m.controller.hasUncommittedWork());
});

test('relative direction catalogs: EN/zh and missing-translation fallback expose options, bounds and isolated feedback', async t => {
    const keys = ['countdownRelativeDaysLabel', 'countdownRelativeDirectionLabel', 'countdownRelativeAfter', 'countdownRelativeBefore', 'countdownRelativeDaysHelp', 'countdownRelativeApply', 'countdownRelativeError', 'countdownRelativeFilled'];
    const catalogs = Object.fromEntries(['en', 'zh_CN'].map(locale => [locale, JSON.parse(fs.readFileSync(require.resolve(`../_locales/${locale}/messages.json`), 'utf8'))]));
    for (const locale of ['en', 'zh_CN', 'fallback']) {
        const catalog = catalogs[locale === 'fallback' ? 'en' : locale];
        for (const key of keys) assert(catalog[key]?.message, `${locale}: ${key}`);
        const m = await model({ translate: locale === 'fallback' ? key => key : (key, values) => (catalog[key]?.message || key).replace(/\$1/g, String(values[0] ?? '')) }); t.after(() => m.view.destroy());
        assert.equal(m.view.relativeDirection.getAttribute('aria-label'), catalog.countdownRelativeDirectionLabel.message);
        assert.deepEqual(m.view.relativeDirection.children.map(node => node.textContent), [catalog.countdownRelativeAfter.message, catalog.countdownRelativeBefore.message]);
        const help = m.view.relativeStatus.parentElement.children.find(node => node.classList.contains('countdown-help') && node.textContent === catalog.countdownRelativeDaysHelp.message);
        assert(help, `${locale}: matching help`); assert.match(help.textContent, /0001-01-01.*9999-12-31/);
        m.direction('before'); m.fill('2'); assert.equal(m.view.relativeStatus.textContent, catalog.countdownRelativeFilled.message.replace('$1', '2026-10-15'));
        m.fill('-2'); assert.equal(m.view.relativeStatus.textContent, catalog.countdownRelativeError.message);
        m.direction('after'); assert.equal(m.view.relativeStatus.textContent, '');
    }
});
