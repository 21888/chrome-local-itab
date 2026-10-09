const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const api = require('../shared/local-countdown-store');

function harness() {
    let raw, writes = 0, attempts = 0, reads = 0, locked = false, tail = Promise.resolve();
    let readError = false, writeError = false, returnFalse = false, afterWrite, hold;
    const listeners = new Set();
    const backend = {
        lock(fn) {
            const result = tail.then(async () => { assert.equal(locked, false); locked = true; try { return await fn(); } finally { locked = false; } });
            tail = result.catch(() => {}); return result;
        },
        async read() {
            assert(locked, 'storage read holds origin lock'); reads++;
            if (readError) throw Error('read failed');
            return structuredClone(raw);
        },
        async write(value) {
            assert(locked, 'storage write holds origin lock'); attempts++;
            if (hold) await hold;
            if (writeError) throw Error('write failed');
            if (returnFalse) return false;
            raw = structuredClone(value); writes++;
            listeners.forEach(fn => fn());
            if (afterWrite) await afterWrite();
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    };
    return { backend, store: () => new api.Store(backend), get raw() { return raw; }, set raw(v) { raw = v; },
        get writes() { return writes; }, get attempts() { return attempts; }, get reads() { return reads; },
        readFail(v) { readError = v; }, writeFail(v) { writeError = v; }, writeFalse(v) { returnFalse = v; },
        afterWrite(fn) { afterWrite = fn; }, hold(p) { hold = p; }, notify() { listeners.forEach(fn => fn()); } };
}
const configured = (extra = {}) => ({ schemaVersion: 1, revision: 1, enabled: true, title: 'Launch', targetDate: '2026-12-31', ...extra });
const save = (value = {}, revision = 0) => ({ kind: 'save', value: { enabled: true, title: 'Launch', targetDate: '2026-12-31', ...value }, revision });
const code = expected => ({ code: expected });

// Countdowns persist only the date and title. Counts/labels are always derived at display time.
test('countdown is empty and off by default; reads and display do not save derived values', async () => {
    const h = harness(), s = h.store();
    assert.deepEqual(api.initial(), { schemaVersion: 1, revision: 0, enabled: false, title: '', targetDate: '' });
    assert.notEqual(api.initial(), api.initial());
    assert.deepEqual(await s.read(), api.initial());
    assert.deepEqual(await s.read(), api.initial());
    assert.equal(h.writes, 0); assert.equal(h.raw, undefined);
    const state = await s.mutate(save());
    assert.deepEqual(state, configured());
    assert.deepEqual(Object.keys(h.raw).sort(), ['enabled', 'revision', 'schemaVersion', 'targetDate', 'title']);
    const now = new Date(2026, 11, 30, 23, 59);
    assert.deepEqual(api.display(state.targetDate, now), { days: 1, count: 1, kind: 'future' });
    now.setDate(31);
    assert.deepEqual(api.display(state.targetDate, now), { days: 0, count: 0, kind: 'today' });
    now.setDate(32);
    assert.deepEqual(api.display(state.targetDate, now), { days: -1, count: 1, kind: 'past' });
    assert.equal(h.writes, 1); assert.deepEqual(h.raw, configured());
});

test('title saves are trimmed, Unicode-counted and never truncated or HTML-interpreted', async () => {
    const h = harness(), s = h.store();
    const original = '  <script>stay text</script> 🎉 中文  ';
    let result = await s.mutate(save({ title: original }));
    assert.equal(result.title, original.trim()); assert.equal(api.LIMITS.title, 80); assert(Object.isFrozen(api.LIMITS));
    result = await s.mutate(save({ title: '😀'.repeat(80) }, 1));
    assert.equal(Array.from(result.title).length, 80); assert.equal(result.title.length, 160);
    result = await s.mutate(save({ title: 'e\u0301'.repeat(40) }, 2));
    assert.equal(result.title, 'e\u0301'.repeat(40));
    for (const title of ['x'.repeat(81), '😀'.repeat(81)]) {
        await assert.rejects(s.mutate(save({ title }, 3)), code('TEXT_LIMIT'));
    }
    for (const title of ['', ' ', '\u00a0', '\uD800', '\uDC00', 'a\uD800b', 'a\uDC00b']) {
        await assert.rejects(s.mutate(save({ title }, 3)), code('TEXT'));
    }
    for (const n of [...Array.from({ length: 32 }, (_, i) => i), ...Array.from({ length: 33 }, (_, i) => i + 127), 0x2028, 0x2029]) {
        await assert.rejects(s.mutate(save({ title: `a${String.fromCodePoint(n)}b` }, 3)), code('TEXT'));
    }
    assert.equal(h.writes, 3); assert.equal(h.raw.title, 'e\u0301'.repeat(40));
});

test('strict date parsing accepts real Gregorian leap dates and years 0001–9999', () => {
    for (const [source, year, month, day] of [
        ['0001-01-01', 1, 1, 1], ['0004-02-29', 4, 2, 29], ['0096-02-29', 96, 2, 29],
        ['0099-12-31', 99, 12, 31], ['0100-02-28', 100, 2, 28], ['0400-02-29', 400, 2, 29],
        ['1900-02-28', 1900, 2, 28], ['2000-02-29', 2000, 2, 29], ['2024-02-29', 2024, 2, 29], ['9999-12-31', 9999, 12, 31]
    ]) assert.deepEqual(api.parseDate(source), { year, month, day });
    for (const source of [
        '', '0000-01-01', '10000-01-01', '+2026-01-01', '-0001-01-01', '2026-1-01', '2026-01-1', '026-01-01',
        '2026/01/01', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', '2026-04-31', '2026-02-29',
        '1900-02-29', '2100-02-29', '0001-02-29', '0100-02-29', '2024-02-30',
        ' 2026-01-01', '2026-01-01 ', '2026-01-01\n', '2026-01-01T00:00:00Z', '２０２６-01-01', null, undefined, 20260101, new Date()
    ]) assert.throws(() => api.parseDate(source), code('DATE'), String(source));
});

test('save atomically validates title, date and visibility and permits only disabled empty pairs', async () => {
    const h = harness(), s = h.store();
    await assert.rejects(s.mutate({ kind: 'visibility', value: true, revision: 0 }), code('UNCONFIGURED'));
    await assert.rejects(s.mutate(save({ title: '', targetDate: '' })), code('UNCONFIGURED'));
    await assert.rejects(s.mutate(save({ enabled: false, title: '', targetDate: '2026-01-01' })), code('TEXT'));
    await assert.rejects(s.mutate(save({ enabled: false, title: 'Has title', targetDate: '' })), code('DATE'));
    await assert.rejects(s.mutate(save({ targetDate: '2026-02-29' })), code('DATE'));
    assert.equal(h.writes, 0);
    let state = await s.mutate(save({ enabled: false }));
    assert.deepEqual(state, configured({ enabled: false }));
    state = await s.mutate({ kind: 'visibility', value: true, revision: 1 });
    assert.deepEqual(state, configured({ revision: 2 }));
    state = await s.mutate({ kind: 'visibility', value: false, revision: 2 });
    assert.deepEqual(state, configured({ revision: 3, enabled: false }));
    await assert.rejects(s.mutate(save({ title: 'Changed', targetDate: 'bad' }, 3)), code('DATE'));
    assert.deepEqual(h.raw, state);
    state = await s.mutate(save({ enabled: false, title: '', targetDate: '' }, 3));
    assert.deepEqual(state, { ...api.initial(), revision: 4 });
    await assert.rejects(s.mutate({ kind: 'visibility', value: true, revision: 4 }), code('UNCONFIGURED'));
    assert.equal(h.writes, 4);
});

test('saved state has an exact schema; corrupt data fails closed without rewriting it', async () => {
    const states = [
        null, false, [], {}, 'string', { ...configured(), schemaVersion: 2 }, { ...configured(), revision: -1 },
        { ...configured(), revision: 0.1 }, { ...configured(), revision: Number.MAX_SAFE_INTEGER + 1 }, { ...configured(), revision: NaN },
        { ...configured(), enabled: 'true' }, { ...configured(), title: 4 }, { ...configured(), title: ' padded ' },
        { ...configured(), title: 'x'.repeat(81) }, { ...configured(), title: '\uD800' }, { ...configured(), title: '\n' },
        { ...configured(), targetDate: '2026-02-29' }, { ...configured(), targetDate: '0000-01-01' },
        { ...configured(), title: '' }, { ...configured(), targetDate: '' }, { ...api.initial(), enabled: true },
        { ...configured(), extra: 1 }, { ...configured(), days: 3 }, { ...configured(), count: 3 }, { ...configured(), updatedAt: new Date().toISOString() }
    ];
    for (const key of Object.keys(api.initial())) { const missing = configured(); delete missing[key]; states.push(missing); }
    for (const bad of states) {
        const h = harness(); h.raw = bad; const before = structuredClone(bad);
        await assert.rejects(h.store().read(), code('CORRUPT'));
        await assert.rejects(h.store().mutate(save()), code('CORRUPT'));
        await assert.rejects(h.store().mutate({ kind: 'visibility', value: false, revision: 0 }), code('CORRUPT'));
        assert.equal(h.writes, 0); assert.deepEqual(h.raw, before);
    }
    assert.throws(() => api.validate({ ...configured(), [Symbol('extra')]: 1 }), code('INVALID'));
    const hidden = configured(); Object.defineProperty(hidden, 'extra', { value: 1 });
    assert.throws(() => api.validate(hidden), code('INVALID'));
    assert.equal(api.validate(configured()).title, 'Launch');
});

test('malformed commands and exhausted revisions never write', async () => {
    const h = harness(), s = h.store();
    for (const command of [null, [], {}, { ...save(), extra: 1 }, { ...save(), kind: 'unknown' },
        { ...save(), value: { title: 'Launch', targetDate: '2026-12-31' } },
        save({ enabled: 1 }), save({ extra: true }), ...[1, null, {}, [], true].map(title => save({ title })), { kind: 'visibility', value: 1, revision: 0 }]) {
        await assert.rejects(s.mutate(command), code('INVALID'));
    }
    for (const revision of [undefined, null, '0', -1, NaN]) {
        await assert.rejects(s.mutate({ ...save(), revision }), code('INVALID'));
    }
    await assert.rejects(s.mutate(save({}, 1)), code('CONFLICT'));
    h.raw = configured({ revision: Number.MAX_SAFE_INTEGER });
    await assert.rejects(s.mutate(save({}, Number.MAX_SAFE_INTEGER)), code('INVALID'));
    assert.equal(h.writes, 0); assert.equal(h.raw.revision, Number.MAX_SAFE_INTEGER);
});

test('revision CAS serializes competing writers, including visibility, and protects deleted state', async () => {
    const h = harness(); const a = h.store(), b = h.store();
    const results = await Promise.allSettled([a.mutate(save({ title: 'A' })), b.mutate(save({ title: 'B' }))]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter(r => r.status === 'rejected')[0].reason.code, 'CONFLICT');
    assert.equal(h.writes, 1); assert.equal(h.raw.title, 'A');
    const next = await Promise.allSettled([a.mutate({ kind: 'visibility', value: false, revision: 1 }), b.mutate(save({ title: 'B' }, 1))]);
    assert.equal(next.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(next.filter(r => r.status === 'rejected')[0].reason.code, 'CONFLICT');
    assert.equal(h.raw.title, 'A'); assert.equal(h.raw.enabled, false); assert.equal(h.raw.revision, 2); assert.equal(h.writes, 2);
    h.raw = undefined;
    await assert.rejects(a.mutate(save({ title: 'Old draft' }, 2)), code('CONFLICT'));
    assert.equal(h.raw, undefined); assert.equal(h.writes, 2);
});

test('readback comparison is exact and independent of object property order', async () => {
    for (const patch of [{ title: 'Other' }, { targetDate: '2027-01-01' }, { enabled: false }, { revision: 2 }]) {
        const h = harness(); h.afterWrite(() => { h.raw = { ...h.raw, ...patch }; });
        await assert.rejects(h.store().mutate(save()), code('VERIFY'));
        assert.equal(h.writes, 1);
    }
    for (const value of [undefined, null, { ...configured(), count: 1 }, { ...configured(), schemaVersion: 2 }]) {
        const h = harness(); h.afterWrite(() => { h.raw = value; });
        await assert.rejects(h.store().mutate(save()), code(value === undefined ? 'VERIFY' : 'CORRUPT'));
        assert.equal(h.writes, 1);
    }
    const h = harness(); h.afterWrite(() => { const v = h.raw; h.raw = { targetDate: v.targetDate, title: v.title, enabled: v.enabled, revision: v.revision, schemaVersion: v.schemaVersion }; });
    assert.deepEqual(await h.store().mutate(save()), configured());
});

test('failed reads and rejected or false writes leave existing saved values alone', async () => {
    const h = harness(), s = h.store(); h.raw = configured();
    h.readFail(true);
    await assert.rejects(s.read(), code('READ'));
    await assert.rejects(s.mutate(save({ title: 'New' }, 1)), code('READ'));
    assert.equal(h.attempts, 0);
    h.readFail(false); h.writeFail(true);
    await assert.rejects(s.mutate(save({ title: 'New' }, 1)), code('WRITE'));
    assert.deepEqual(h.raw, configured());
    h.writeFail(false); h.writeFalse(true);
    await assert.rejects(s.mutate(save({ title: 'New' }, 1)), code('WRITE'));
    assert.deepEqual(h.raw, configured()); assert.equal(h.writes, 0);
    h.writeFalse(false);
    assert.equal((await s.mutate(save({ title: 'New' }, 1))).revision, 2);
});

test('uncertain write acknowledgement never reports success or replays a stale revision', async () => {
    for (const failure of ['read', 'write']) {
        const h = harness(), s = h.store();
        h.afterWrite(() => { if (failure === 'read') h.readFail(true); else throw Error('acknowledgement lost'); });
        await assert.rejects(s.mutate(save()), code(failure === 'read' ? 'READ' : 'WRITE'));
        assert.equal(h.writes, 1); assert.deepEqual(h.raw, configured());
        h.afterWrite(null); h.readFail(false);
        assert.deepEqual(await s.read(), configured());
        await assert.rejects(s.mutate(save()), code('CONFLICT'));
        assert.equal(h.writes, 1);
    }
});

test('read and mutation snapshots cannot mutate storage; subscriptions unsubscribe', async () => {
    const h = harness(), s = h.store(); let notifications = 0;
    const unsubscribe = s.subscribe(() => notifications++);
    const saved = await s.mutate(save()); saved.title = 'Mutation outside store';
    const read = await s.read(); read.targetDate = '2000-01-01';
    assert.deepEqual(h.raw, configured()); assert.equal(notifications, 1);
    unsubscribe(); h.notify(); assert.equal(notifications, 1);
});

test('explicit recovery export preserves raw draft text within strict Unicode and size bounds', () => {
    const expected = 'Release 🎉\n0001-01-01\n';
    const full = configured({ title: 'Release 🎉', targetDate: '0001-01-01' });
    assert.equal(api.exportText(full), expected);
    assert.equal(api.exportText({ ...full, enabled: false, revision: 999 }), expected);
    assert.equal(api.exportText({ title: '  Release 🎉  ', targetDate: '0001-01-01' }), '  Release 🎉  \n0001-01-01\n');
    assert.equal(api.exportText({ enabled: true, title: 'Release 🎉', targetDate: '0001-01-01' }), expected);
    assert.equal(api.exportText({ title: '<b>literal</b>', targetDate: '9999-12-31' }), '<b>literal</b>\n9999-12-31\n');
    assert.equal(api.exportText(full), expected); assert.equal(full.revision, 1);
    assert.equal(api.exportText(api.initial()), '\n\n');
    const draft = { title: `  ${'🎉'.repeat(100)}\nNot yet saved\t  `, targetDate: '2026-02-29' };
    assert.equal(api.exportText(draft), `${draft.title}\n${draft.targetDate}\n`);
    assert.equal(api.exportText({ title: 'incomplete', targetDate: '2026-0' }), 'incomplete\n2026-0\n');
    assert.equal(api.exportText({ ...full, secret: 'not included' }), expected);
    assert.equal(api.exportText({ title: 'x'.repeat(api.LIMITS.exportCharacters - 2), targetDate: '' }).length, api.LIMITS.exportCharacters);
    assert.equal(api.LIMITS.exportBytes, 131072);
    for (const draft of [
        { title: 'x'.repeat(api.LIMITS.exportCharacters - 1), targetDate: '' },
        { title: '😀'.repeat(api.LIMITS.exportCharacters - 1), targetDate: '' },
        { title: '', targetDate: 'x'.repeat(api.LIMITS.exportCharacters) }
    ]) assert.throws(() => api.exportText(draft), code('SIZE_LIMIT'));
    for (const draft of [
        { title: '\uD800', targetDate: '' }, { title: '', targetDate: '\uDC00' },
        { title: 1, targetDate: '' }, { title: '', targetDate: null }
    ]) assert.throws(() => api.exportText(draft), code('TEXT'));
});

test('mutation snapshots submitted primitive values before a lock/read can yield', async () => {
    const h = harness(), s = h.store();
    const command = save({ title: 'Submitted' });
    const pending = s.mutate(command);
    command.kind = 'visibility'; command.revision = 100;
    command.value.title = 'Changed after submit'; command.value.targetDate = 'invalid'; command.value.enabled = false;
    command.value = false;
    assert.deepEqual(await pending, configured({ title: 'Submitted' }));
    const visibility = { kind: 'visibility', value: false, revision: 1 };
    const hiding = s.mutate(visibility); visibility.value = true; visibility.revision = 2;
    assert.deepEqual(await hiding, configured({ title: 'Submitted', enabled: false, revision: 2 }));
    assert.deepEqual(api.fields({ enabled: false, title: '', targetDate: '' }), { enabled: false, title: '', targetDate: '' });
    assert.deepEqual(api.fields({ enabled: true, title: '  Canonical  ', targetDate: '2026-12-31' }), { enabled: true, title: 'Canonical', targetDate: '2026-12-31' });
});

test('calendarDifference rejects invalid dates, preserves input, and handles date-only extremes', () => {
    const now = new Date(0); now.setFullYear(1, 0, 1); now.setHours(12, 34, 56, 789);
    const stamp = now.getTime();
    assert.equal(api.calendarDifference('0001-01-01', now), 0);
    assert.equal(api.calendarDifference('9999-12-31', now), 3652058);
    assert.equal(now.getTime(), stamp);
    now.setFullYear(9999, 11, 31);
    assert.equal(api.calendarDifference('0001-01-01', now), -3652058);
    now.setFullYear(0, 0, 1);
    assert.equal(api.calendarDifference('0001-01-01', now), 366);
    for (const date of [new Date(NaN), null, 0, '2026-01-01', {}, { getTime() { return 0; } }]) {
        assert.throws(() => api.calendarDifference('2026-01-01', date), code('DATE'));
    }
    assert.throws(() => api.calendarDifference('0000-01-01', new Date()), code('DATE'));
});

function checkTimezone() {
    const assert = require('node:assert/strict');
    const api = require('./shared/local-countdown-store');
    const cases = [
        ['2026-03-08', '2026-03-09', 1], ['2026-11-01', '2026-11-02', 1],
        ['2026-03-29', '2026-03-30', 1], ['2026-10-25', '2026-10-26', 1],
        ['2024-02-28', '2024-03-01', 2], ['2024-02-29', '2024-03-01', 1],
        ['2026-02-28', '2026-03-01', 1], ['2026-12-31', '2027-01-01', 1],
        ['0001-01-01', '0001-01-02', 1], ['0004-02-28', '0004-03-01', 2],
        ['0099-12-31', '0100-01-01', 1], ['0100-02-28', '0100-03-01', 1]
    ];
    function local(source, hour, minute) {
        const { year, month, day } = api.parseDate(source);
        const value = new Date(0); value.setFullYear(year, month - 1, day); value.setHours(hour, minute, 0, 0);
        assert.equal(value.getFullYear(), year); assert.equal(value.getMonth() + 1, month); assert.equal(value.getDate(), day);
        return value;
    }
    for (const [today, target, difference] of cases) {
        for (const [hour, minute] of [[0, 0], [1, 30], [12, 0], [23, 59]]) {
            const date = local(today, hour, minute), stamp = date.getTime();
            const label = `${process.env.TZ} ${today} ${hour}:${minute}`;
            assert.equal(api.calendarDifference(target, date), difference, label);
            assert.equal(api.calendarDifference(today, date), 0, label);
            assert.deepEqual(api.display(target, date), { days: difference, count: difference, kind: 'future' }, label);
            assert.equal(api.calendarDifference(today, local(target, hour, minute)), -difference, label);
            assert.equal(date.getTime(), stamp, label);
        }
    }
    // These UTC instants cross local midnight differently; no UTC-date substitution is allowed.
    const expected = { 'America/New_York': 1, 'Europe/Berlin': 0, 'Asia/Kathmandu': 0, UTC: 0 };
    assert.equal(api.calendarDifference('2026-03-09', new Date('2026-03-09T02:30:00Z')), expected[process.env.TZ]);
    const expectedLate = { 'America/New_York': 1, 'Europe/Berlin': 1, 'Asia/Kathmandu': 0, UTC: 1 };
    assert.equal(api.calendarDifference('2026-03-09', new Date('2026-03-08T20:00:00Z')), expectedLate[process.env.TZ]);
}
for (const timezone of ['America/New_York', 'Europe/Berlin', 'Asia/Kathmandu', 'UTC']) {
    test(`local calendar day counts survive DST, leap dates and years 1–99 in ${timezone}`, () => {
        const result = spawnSync(process.execPath, ['-e', `(${checkTimezone.toString()})();`], {
            cwd: path.resolve(__dirname, '..'), env: { ...process.env, TZ: timezone }, encoding: 'utf8'
        });
        assert.ifError(result.error); assert.equal(result.status, 0, result.stderr || result.stdout);
    });
}

test('Chrome backend uses only its local key and the shared origin lock', async () => {
    let stored, notifications = 0; const calls = [], listeners = new Set();
    const chrome = { storage: {
        local: { async get(keys) { calls.push(['get', keys]); return stored === undefined ? {} : { [api.KEY]: structuredClone(stored) }; },
            async set(value) { calls.push(['set', Object.keys(value)]); stored = structuredClone(value[api.KEY]); } },
        onChanged: { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); } },
        get sync() { throw Error('sync must never be used'); }
    } };
    const locks = { async request(name, options, fn) { calls.push(['lock', name, options]); return fn(); } };
    assert.equal(api.KEY, '__localItabCountdownV1'); assert.equal(api.LOCK, 'local-itab-local-write');
    const store = new api.Store(api.createChromeBackend(chrome, locks));
    const unsubscribe = store.subscribe(() => notifications++);
    assert.deepEqual(await store.read(), api.initial());
    await store.mutate(save());
    assert.equal(calls.filter(c => c[0] === 'lock').length, 2);
    assert(calls.filter(c => c[0] === 'lock').every(c => c[1] === api.LOCK && c[2].mode === 'exclusive'));
    assert(calls.filter(c => ['get', 'set'].includes(c[0])).every(c => c[1].length === 1 && c[1][0] === api.KEY));
    for (const fn of listeners) { fn({ [api.KEY]: {} }, 'sync'); fn({ unrelated: {} }, 'local'); fn({ [api.KEY]: {} }, 'local'); }
    assert.equal(notifications, 1); unsubscribe(); assert.equal(listeners.size, 0);
    for (const [c, l] of [[null, locks], [{}, locks], [chrome, null], [chrome, {}]]) {
        assert.throws(() => api.createChromeBackend(c, l), code('UNAVAILABLE'));
    }
    chrome.storage.local.get = async () => null;
    await assert.rejects(store.read(), code('READ'));
});

test('UMD export works offline in a browser global with no eager storage or network access', () => {
    const source = fs.readFileSync(path.join(__dirname, '../shared/local-countdown-store.js'), 'utf8');
    const context = { window: {}, TextEncoder, fetch() { throw Error('network forbidden'); } };
    vm.createContext(context); vm.runInContext(source, context);
    const browser = context.window.LocalItabCountdown;
    assert.equal(browser.KEY, api.KEY); assert.equal(browser.initial().enabled, false);
    assert.equal(browser.exportText({ title: 'Offline', targetDate: '2026-01-01' }), 'Offline\n2026-01-01\n');
    assert.equal(browser.parseDate('0001-01-01').year, 1);
    assert.throws(() => browser.createChromeBackend(), code('UNAVAILABLE'));
});
