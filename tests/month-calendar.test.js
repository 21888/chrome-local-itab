const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const MonthCalendar = require('../shared/month-calendar');

const source = fs.readFileSync(path.join(__dirname, '../shared/month-calendar.js'), 'utf8');
const days = value => value.weeks.flat().filter(day => day !== null);

function browserApi(Locale) {
    const context = { window: {}, Intl: { Locale, DateTimeFormat: Intl.DateTimeFormat } };
    vm.createContext(context);
    vm.runInContext(source, context);
    return context.window.MonthCalendar;
}

test('month calendar exposes a dependency-free browser API and Node exports', () => {
    const api = browserApi(Intl.Locale);
    assert.deepEqual(Object.keys(api).sort(), Object.keys(MonthCalendar).sort());
    assert.equal(api.month(2024, 1, 'en-US').caption, 'February 2024');
    assert.equal(Object.isFrozen(api), true);
    assert(!/\b(?:require|fetch|XMLHttpRequest|localStorage|chrome|document|navigator|geolocation|sendBeacon)\s*[.(]/.test(source));
});

test('UTC construction preserves years 1–99, midnight and calendar rollover', () => {
    for (const year of [1, 4, 99, 100, 1900, 2000, 2024, 9999]) {
        const date = MonthCalendar.utcDate(year, 0);
        assert.equal(date.getUTCFullYear(), year);
        assert.equal(date.getUTCMonth(), 0);
        assert.equal(date.getUTCDate(), 1);
        assert.equal(date.getUTCHours(), 0);
        assert.equal(date.getUTCMinutes(), 0);
        assert.equal(date.getUTCSeconds(), 0);
        assert.equal(date.getUTCMilliseconds(), 0);
    }
    assert.equal(MonthCalendar.utcDate(99, 12, 1).getUTCFullYear(), 100);
    assert.equal(MonthCalendar.utcDate(2024, 2, 0).getUTCDate(), 29);
    assert.equal(MonthCalendar.utcDate(9999, 12, 0).toISOString(), '9999-12-31T00:00:00.000Z');
});

test('month lengths use Gregorian century and leap-year rules', () => {
    for (const [year, february] of [[1, 28], [4, 29], [99, 28], [100, 28], [1900, 28], [2000, 29], [2024, 29], [2025, 28], [9999, 28]]) {
        const lengths = [31, february, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        lengths.forEach((length, monthIndex) => {
            const result = MonthCalendar.month(year, monthIndex, 'en-US');
            assert.deepEqual(days(result), Array.from({ length }, (_, index) => index + 1), `${year}-${monthIndex + 1}`);
            assert(result.weeks.length >= 4 && result.weeks.length <= 6);
            assert(result.weeks.every(week => week.length === 7));
        });
    }
});

test('week offsets and translated headings follow Sunday-first and Monday-first locales', () => {
    const us = MonthCalendar.month(2024, 8, 'en-US'); // September 1 was Sunday.
    assert.deepEqual(us.weeks[0], [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(us.weekdays.map(day => day.short), ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    assert.deepEqual(us.weekdays.map(day => day.long), ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
    const cn = MonthCalendar.month(2024, 8, 'zh-CN');
    assert.deepEqual(cn.weeks[0], [null, null, null, null, null, null, 1]);
    assert.deepEqual(cn.weeks.at(-1), [30, null, null, null, null, null, null]);
    assert.equal(cn.weekdays[0].long, '星期一');
    assert.equal(cn.weekdays[6].long, '星期日');
    assert.equal(cn.caption, '2024年9月');
    assert.equal(MonthCalendar.month(2015, 1, 'en-US').weeks.length, 4);
    assert.equal(MonthCalendar.month(2024, 8, 'zh-CN').weeks.length, 6);
});

test('leading padding covers every weekday and the early/late year boundaries', () => {
    const starts = [1, 4, 5, 1, 3, 6, 1, 4, 0, 2, 5, 0]; // January–December 2024.
    starts.forEach((weekday, monthIndex) => {
        assert.equal(MonthCalendar.month(2024, monthIndex, 'en-US').weeks[0].indexOf(1), weekday);
        assert.equal(MonthCalendar.month(2024, monthIndex, 'zh-CN').weeks[0].indexOf(1), (weekday + 6) % 7);
    });
    for (const [year, weekday] of [[1, 1], [99, 4], [100, 5], [9999, 5]]) {
        assert.equal(MonthCalendar.month(year, 0, 'en-US').weeks[0].indexOf(1), weekday);
    }
    assert.equal(MonthCalendar.month(9999, 11, 'en-US').weeks[0].indexOf(1), 3);
});

test('week start accepts modern getWeekInfo and legacy weekInfo with valid 1–7 values', () => {
    for (let firstDay = 1; firstDay <= 7; firstDay++) {
        const modern = browserApi(class { getWeekInfo() { return { firstDay }; } });
        const legacy = browserApi(class { get weekInfo() { return { firstDay }; } });
        assert.equal(modern.firstDayOfWeek('en-US'), firstDay % 7);
        assert.equal(legacy.firstDayOfWeek('en-US'), firstDay % 7);
    }
    const both = browserApi(class {
        getWeekInfo() { return { firstDay: 6 }; }
        get weekInfo() { return { firstDay: 7 }; }
    });
    assert.equal(both.firstDayOfWeek('en-US'), 6);
    const invalidModern = browserApi(class {
        getWeekInfo() { return { firstDay: 0 }; }
        get weekInfo() { return { firstDay: 2 }; }
    });
    assert.equal(invalidModern.firstDayOfWeek('en-US'), 2);
});

test('week start falls back deterministically when week data is missing, invalid or throws', () => {
    const constructors = [
        undefined,
        class {},
        class { constructor() { throw new Error('unavailable'); } },
        class { getWeekInfo() { throw new Error('unavailable'); } get weekInfo() { throw new Error('unavailable'); } },
        ...[null, {}, { firstDay: 0 }, { firstDay: 8 }, { firstDay: 1.5 }, { firstDay: '7' }, { firstDay: NaN }]
            .map(info => class { getWeekInfo() { return info; } get weekInfo() { return info; } })
    ];
    for (const Locale of constructors) {
        const api = browserApi(Locale);
        for (const locale of ['en', 'en-US', 'en-GB', 'EN-au']) assert.equal(api.firstDayOfWeek(locale), 0);
        for (const locale of ['zh-CN', 'fr-FR', 'unknown', '', undefined]) assert.equal(api.firstDayOfWeek(locale), 1);
    }
});

test('Gregorian captions ignore a locale calendar override and preserve early years', () => {
    for (const year of [1, 99, 100, 9999]) {
        assert.equal(MonthCalendar.month(year, 0, 'en-US').caption, `January ${year}`);
        assert.equal(MonthCalendar.month(year, 0, 'en-US-u-ca-buddhist').caption, `January ${year}`);
    }
    assert.equal(days(MonthCalendar.month(2024, 1, 'en-US-u-ca-islamic')).length, 29);
});

test('today is highlighted only for a valid matching local calendar day without mutating its tuple', () => {
    const today = Object.freeze({ year: 2024, month: 1, day: 29 });
    assert.equal(MonthCalendar.month(2024, 1, 'en-US', today).todayDay, 29);
    assert.equal(MonthCalendar.month(2024, 2, 'en-US', today).todayDay, null);
    assert.equal(MonthCalendar.month(2025, 1, 'en-US', today).todayDay, null);
    for (const value of [undefined, null, {}, { ...today, day: 0 }, { ...today, day: 30 }, { ...today, day: 2.5 }, { ...today, day: '29' }]) {
        assert.equal(MonthCalendar.month(2024, 1, 'en-US', value).todayDay, null);
    }
    assert.deepEqual(today, { year: 2024, month: 1, day: 29 });
});

test('navigation crosses year boundaries and clamps at the supported first and last months', () => {
    for (const year of [1, 99, 100, 2024, 9998]) {
        assert.deepEqual(MonthCalendar.shift(year, 11, 1), { year: year + 1, month: 0 });
        assert.deepEqual(MonthCalendar.shift(year + 1, 0, -1), { year, month: 11 });
    }
    assert.deepEqual(MonthCalendar.shift(1, 0, -1), { year: 1, month: 0 });
    assert.deepEqual(MonthCalendar.shift(9999, 11, 1), { year: 9999, month: 11 });
    assert.deepEqual(MonthCalendar.shift(2024, 6, -Number.MAX_SAFE_INTEGER), { year: 1, month: 0 });
    assert.deepEqual(MonthCalendar.shift(2024, 6, Number.MAX_SAFE_INTEGER), { year: 9999, month: 11 });
    assert.deepEqual(MonthCalendar.shift(2024, 6, 0), { year: 2024, month: 6 });
    assert.deepEqual(MonthCalendar.shift(2024, 6, 18), { year: 2026, month: 0 });
    for (const [year, monthIndex, previous, next] of [[1, 0, true, false], [1, 1, false, false], [99, 11, false, false], [100, 0, false, false], [9999, 10, false, false], [9999, 11, false, true]]) {
        const value = MonthCalendar.month(year, monthIndex, 'en-US');
        assert.equal(value.previousDisabled, previous);
        assert.equal(value.nextDisabled, next);
    }
});

test('invalid month, shift and date inputs fail explicitly', () => {
    for (const [year, monthIndex] of [[0, 0], [10000, 0], [2024.5, 0], ['2024', 0], [2024, -1], [2024, 12], [2024, 1.5], [NaN, 0], [2024, '0']]) {
        assert.throws(() => MonthCalendar.month(year, monthIndex, 'en-US'), RangeError);
        assert.throws(() => MonthCalendar.shift(year, monthIndex, 1), RangeError);
    }
    for (const delta of [NaN, Infinity, 0.5, '1', Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => MonthCalendar.shift(2024, 0, delta), RangeError);
    }
    assert.throws(() => MonthCalendar.localTuple(new Date(NaN)), RangeError);
});

function checkTimezone() {
    const assert = require('node:assert/strict');
    const MonthCalendar = require('./shared/month-calendar');
    const cases = {
        UTC: [['2026-01-01T00:30:00Z', 2026, 0, 1]],
        'America/New_York': [
            ['2026-01-01T00:30:00Z', 2025, 11, 31],
            ['2026-03-08T06:59:59Z', 2026, 2, 8], ['2026-03-08T07:00:00Z', 2026, 2, 8],
            ['2026-11-01T05:59:59Z', 2026, 10, 1], ['2026-11-01T06:00:00Z', 2026, 10, 1]
        ],
        'Australia/Sydney': [
            ['2026-01-01T13:30:00Z', 2026, 0, 2],
            ['2026-04-04T15:59:59Z', 2026, 3, 5], ['2026-04-04T16:00:00Z', 2026, 3, 5],
            ['2026-10-03T15:59:59Z', 2026, 9, 4], ['2026-10-03T16:00:00Z', 2026, 9, 4]
        ],
        'Asia/Kathmandu': [['2026-01-01T20:00:00Z', 2026, 0, 2]],
        'Pacific/Kiritimati': [['2026-12-31T10:00:00Z', 2027, 0, 1]],
        'Pacific/Honolulu': [['2026-01-01T00:30:00Z', 2025, 11, 31]]
    };
    for (const [instant, year, month, day] of cases[process.env.TZ]) {
        const date = new Date(instant);
        const stamp = date.getTime();
        const tuple = MonthCalendar.localTuple(date);
        assert.deepEqual(tuple, { year, month, day }, `${process.env.TZ} ${instant}`);
        assert.equal(date.getTime(), stamp);
        assert.equal(MonthCalendar.month(year, month, 'en-US', tuple).todayDay, day);
    }
    // Cell layout and captions must be identical in every zone, even where
    // UTC midnight falls on the previous local date.
    const value = MonthCalendar.month(2024, 1, 'en-US');
    assert.equal(value.caption, 'February 2024');
    assert.deepEqual(value.weeks[0], [null, null, null, null, 1, 2, 3]);
    assert.deepEqual(value.weeks.at(-1), [25, 26, 27, 28, 29, null, null]);
    assert.equal(value.weekdays[0].long, 'Sunday');
    for (const year of [1, 99, 100, 9999]) {
        const date = new Date(0);
        date.setFullYear(year, 0, 1);
        date.setHours(12, 0, 0, 0);
        assert.deepEqual(MonthCalendar.localTuple(date), { year, month: 0, day: 1 });
    }
}

for (const timezone of ['UTC', 'America/New_York', 'Australia/Sydney', 'Asia/Kathmandu', 'Pacific/Kiritimati', 'Pacific/Honolulu']) {
    test(`local today and UTC month layout stay correct in ${timezone}`, () => {
        const result = spawnSync(process.execPath, ['-e', `(${checkTimezone.toString()})();`], {
            cwd: path.resolve(__dirname, '..'), env: { ...process.env, TZ: timezone }, encoding: 'utf8'
        });
        assert.ifError(result.error);
        assert.equal(result.status, 0, result.stderr || result.stdout);
    });
}
