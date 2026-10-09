const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const WorldClocks = require('../shared/world-clocks');

const clock = (timeZone, instant, deviceTimeZone = 'UTC', preferences = {}, locale = 'en-GB') =>
    WorldClocks.format({ timeZone }, new Date(instant), { hour12: false, showSeconds: false, ...preferences }, locale, deviceTimeZone);

test('world clocks normalize a fresh ordered list and canonicalize native aliases', () => {
    const input = [{ timeZone: 'US/Eastern', label: '  Office  ' }, { timeZone: 'Asia/Kathmandu' }];
    const copy = JSON.stringify(input);
    const result = WorldClocks.normalize(input);
    assert.deepEqual(result, [
        { timeZone: new Intl.DateTimeFormat('en', { timeZone: 'US/Eastern' }).resolvedOptions().timeZone, label: 'Office' },
        { timeZone: new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kathmandu' }).resolvedOptions().timeZone, label: '' }
    ]);
    assert.equal(JSON.stringify(input), copy);
    assert.notEqual(result, input);
    assert.notEqual(result[0], input[0]);
    assert.deepEqual(WorldClocks.normalize(undefined), []);
    assert.deepEqual(WorldClocks.normalize([]), []);
    assert.equal(WorldClocks.normalize(['UTC', 'Europe/London', 'Asia/Tokyo', 'America/New_York'].map(timeZone => ({ timeZone }))).length, 4);
    assert.equal(WorldClocks.normalize([{ timeZone: 'UTC', label: '🌍'.repeat(40) }])[0].label, '🌍'.repeat(40));
    assert.equal(WorldClocks.normalize([{ timeZone: 'UTC', label: ' 家人 ' }])[0].label, '家人');
});

test('world clocks reject malformed types, shapes, zones, counts, duplicates and labels', () => {
    const invalid = [
        null, false, 1, '', '[]', {}, { length: 0 },
        [null], [undefined], [[]], [false], [1], ['UTC'], [{}], new Array(1),
        [{ timezone: 'UTC' }], [{ timeZone: 'UTC', ignored: true }],
        [{ timeZone: undefined }], [{ timeZone: null }], [{ timeZone: 1 }],
        [{ timeZone: '' }], [{ timeZone: ' UTC ' }], [{ timeZone: 'Mars/Olympus_Mons' }],
        [{ timeZone: '+05:30' }], [{ timeZone: '-0700' }], [{ timeZone: '+01' }], [{ timeZone: 'UTC+01:00' }],
        [{ timeZone: 'UTC', label: undefined }], [{ timeZone: 'UTC', label: null }],
        [{ timeZone: 'UTC', label: 1 }], [{ timeZone: 'UTC', label: [] }],
        [{ timeZone: 'UTC', label: 'x'.repeat(41) }], [{ timeZone: 'UTC', label: '🌍'.repeat(41) }],
        [{ timeZone: 'UTC' }, { timeZone: 'Etc/UTC' }],
        [{ timeZone: 'America/New_York' }, { timeZone: 'US/Eastern' }],
        [{ timeZone: 'utc' }, { timeZone: 'UTC' }],
        ['UTC', 'Europe/London', 'Asia/Tokyo', 'America/New_York', 'Australia/Sydney'].map(timeZone => ({ timeZone }))
    ];
    for (const control of ['\0', '\n', '\r', '\t', '\u007f', '\u0085', '\u061c', '\u200e', '\u2028', '\u2029', '\u202e', '\u2066']) {
        invalid.push([{ timeZone: 'UTC', label: control + 'Office' }]);
    }
    for (const value of invalid) {
        assert.throws(() => WorldClocks.normalize(value), undefined, JSON.stringify(value));
        assert.deepEqual(WorldClocks.safe(value), [], JSON.stringify(value));
    }
    assert.deepEqual(WorldClocks.safe([{ timeZone: 'UTC', label: 'Home' }]), [{ timeZone: 'UTC', label: 'Home' }]);
});

test('world clocks expose the same browser API without dependencies or I/O', () => {
    const source = fs.readFileSync(path.join(__dirname, '../shared/world-clocks.js'), 'utf8');
    const context = { window: {} };
    vm.createContext(context);
    vm.runInContext(source, context);
    assert.equal(typeof context.window.WorldClocks.normalize, 'function');
    assert.equal(context.window.WorldClocks.MAX_CLOCKS, 4);
    assert.equal(context.window.WorldClocks.format({ timeZone: 'UTC' }, new Date('2026-01-01T12:34:56Z'), { hour12: false }, 'en-GB', 'UTC').time, '12:34');
    assert(!/\b(?:require|fetch|XMLHttpRequest|localStorage|chrome|document|navigator|geolocation|sendBeacon)\s*[.(]/.test(source));
});

test('world clocks follow US spring and fall DST instants', () => {
    for (const [instant, expected] of [
        ['2026-03-08T06:59:59Z', '01:59:59'],
        ['2026-03-08T07:00:00Z', '03:00:00'],
        ['2026-11-01T05:59:59Z', '01:59:59'],
        ['2026-11-01T06:00:00Z', '01:00:00']
    ]) {
        assert.equal(clock('America/New_York', instant, 'UTC', { showSeconds: true }).time, expected, instant);
        assert.equal(clock('America/New_York', instant).dayDifference, 0, instant);
    }
});

test('world clocks follow European spring and fall DST instants', () => {
    for (const [instant, expected] of [
        ['2026-03-29T00:59:59Z', '01:59:59'],
        ['2026-03-29T01:00:00Z', '03:00:00'],
        ['2026-10-25T00:59:59Z', '02:59:59'],
        ['2026-10-25T01:00:00Z', '02:00:00']
    ]) assert.equal(clock('Europe/Berlin', instant, 'UTC', { showSeconds: true }).time, expected, instant);
});

test('world clocks keep half-hour and quarter-hour offsets', () => {
    for (const [timeZone, expected] of [
        ['Asia/Kolkata', '17:30'], ['Asia/Kathmandu', '17:45'],
        ['Australia/Eucla', '20:45'], ['Pacific/Chatham', '01:45'], ['America/St_Johns', '08:30']
    ]) assert.equal(clock(timeZone, '2026-01-01T12:00:00Z').time, expected, timeZone);
    assert.equal(clock('Pacific/Chatham', '2026-01-01T12:00:00Z').dayDifference, 1);
    assert.equal(clock('Pacific/Chatham', '2026-07-01T12:00:00Z').time, '00:45');
});

test('world clock day differences compare calendar dates across year end and the date line', () => {
    const cases = [
        ['Asia/Tokyo', '2026-12-31T15:00:00Z', 'UTC', 1],
        ['America/Los_Angeles', '2027-01-01T00:00:00Z', 'UTC', -1],
        ['Asia/Tokyo', '2026-12-31T14:59:59Z', 'UTC', 0],
        ['Pacific/Kiritimati', '2026-12-31T10:30:00Z', 'Etc/GMT+12', 2],
        ['Etc/GMT+12', '2026-12-31T10:30:00Z', 'Pacific/Kiritimati', -2],
        ['Asia/Kolkata', '2024-02-29T20:00:00Z', 'UTC', 1],
        ['Etc/GMT-12', '0099-12-31T18:00:00Z', 'UTC', 1],
        ['Etc/GMT+12', '0000-01-01T06:00:00Z', 'UTC', -1]
    ];
    for (const [zone, instant, device, expected] of cases) {
        assert.equal(clock(zone, instant, device).dayDifference, expected, `${zone} versus ${device} at ${instant}`);
    }
});

test('world clock day differences use calendar days on both sides of DST', () => {
    for (const [instant, expected] of [
        ['2026-03-08T04:30:00Z', 1], ['2026-03-09T03:30:00Z', 1], ['2026-03-09T04:30:00Z', 0],
        ['2026-11-01T03:30:00Z', 1], ['2026-11-02T04:30:00Z', 1], ['2026-11-02T05:30:00Z', 0]
    ]) assert.equal(clock('UTC', instant, 'America/New_York').dayDifference, expected, instant);
    assert.equal(clock('America/New_York', '2026-03-09T03:30:00Z', 'Europe/Berlin').dayDifference, -1);
});

test('world clocks honor 12/24-hour, seconds, native locale digits, and display labels', () => {
    const instant = '2026-01-01T13:04:05Z';
    assert.equal(clock('UTC', instant, 'UTC', { hour12: true }, 'en-US').time, '01:04 PM');
    assert.equal(clock('UTC', instant, 'UTC', { hour12: false }, 'en-US').time, '13:04');
    assert.equal(clock('UTC', instant, 'UTC', { hour12: true, showSeconds: true }, 'en-US').time, '01:04:05 PM');
    assert.equal(clock('UTC', instant, 'UTC', { hour12: false, showSeconds: true }, 'en-GB').time, '13:04:05');
    assert.equal(clock('UTC', instant, 'UTC', {}, 'ar-EG').time, '١٣:٠٤');
    const date = new Date(instant);
    assert.equal(WorldClocks.format({ timeZone: 'UTC' }, date, {}, 'en-US', 'UTC').time, '01:04 PM');
    assert.equal(WorldClocks.format({ timeZone: 'UTC' }, date, {}, 'en-GB', 'UTC').time, '13:04');
    assert.equal(WorldClocks.format({ timeZone: 'America/New_York', label: ' Home ' }, date, {}, 'en-US', 'UTC').label, 'Home');
    assert.equal(WorldClocks.format({ timeZone: 'America/New_York', label: '  ' }, date, {}, 'en-US', 'UTC').label, 'New York');
    assert.equal(WorldClocks.format({ timeZone: 'UTC' }, date, {}, 'th-TH-u-ca-buddhist-nu-thai', 'UTC').dayDifference, 0);
    assert.equal(date.toISOString(), instant.replace('Z', '.000Z'));
    assert.throws(() => WorldClocks.format({ timeZone: 'UTC' }, new Date(NaN)), RangeError);
    assert.throws(() => WorldClocks.format({ timeZone: 'UTC' }, instant), TypeError);
});

test('world clocks default to the real device time zone in fresh processes', () => {
    const helper = path.resolve(__dirname, '../shared/world-clocks.js');
    for (const [timeZone, expected] of [['UTC', 0], ['America/Los_Angeles', 1], ['Asia/Tokyo', 0]]) {
        const code = `const api = require(${JSON.stringify(helper)}); console.log(api.format({timeZone:'UTC'}, new Date('2027-01-01T00:30:00Z'), {hour12:false}, 'en-GB').dayDifference);`;
        const result = spawnSync(process.execPath, ['-e', code], { env: { ...process.env, TZ: timeZone }, encoding: 'utf8' });
        assert.ifError(result.error);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout.trim(), String(expected), timeZone);
    }
});

test('world clock formatter caching reuses instances and evicts old locale variants', () => {
    let constructions = 0;
    const context = { window: {}, Intl: {
        DateTimeFormat: function (...args) { constructions++; return new Intl.DateTimeFormat(...args); },
        getCanonicalLocales: Intl.getCanonicalLocales
    } };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared/world-clocks.js'), 'utf8'), context);
    const api = context.window.WorldClocks;
    const date = new Date('2026-01-01T12:00:00Z');
    const display = locale => api.format({ timeZone: 'UTC' }, date, { hour12: false }, locale, 'UTC');
    display('en-GB');
    const firstCount = constructions;
    for (let index = 0; index < 20; index++) assert.equal(display('en-GB').time, '12:00');
    assert.equal(constructions, firstCount);
    for (let index = 0; index < 80; index++) display(`en-US-x-clock${index}`);
    const beforeRevisit = constructions;
    assert.equal(display('en-GB').time, '12:00');
    assert(constructions > beforeRevisit, 'old locale formatter is evicted from the bounded cache');
});
