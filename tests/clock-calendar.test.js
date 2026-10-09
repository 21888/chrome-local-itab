const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

// Run the shipped clock code in fresh processes so Date uses each real TZ.
function checkLocalCalendar() {
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const vm = require('node:vm');
    const { createDocument } = require('./tests/helpers/task-dom-model');
    const context = {
        document: createDocument(), window: { addEventListener() {} },
        navigator: { language: 'en-US' }, console
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('newtab.js', 'utf8') + '\nthis.ClockComponent = ClockComponent;', context);
    const clock = new context.ClockComponent({ hour12: false, showSeconds: true });
    // Independent calendar facts, not values computed by the clock under test.
    const cases = [
        [2026, 1, 1, 1, 1],
        [2026, 3, 8, 67, 10],
        [2026, 3, 9, 68, 11],
        [2026, 4, 5, 95, 14],
        [2026, 4, 6, 96, 15],
        [2026, 7, 1, 182, 27],
        [2026, 10, 4, 277, 40],
        [2026, 10, 5, 278, 41],
        [2026, 11, 1, 305, 44],
        [2026, 11, 2, 306, 45],
        [2026, 12, 31, 365, 53],
        [2024, 2, 29, 60, 9],
        [2024, 3, 1, 61, 9],
        [2024, 12, 31, 366, 1]
    ];
    for (const [year, month, day, ordinal, week] of cases) {
        for (const [hour, minute] of [[0, 0], [12, 0], [23, 59]]) {
            const date = new Date(year, month - 1, day, hour, minute);
            const stamp = date.getTime();
            const label = `${process.env.TZ}: ${year}-${month}-${day} ${hour}:${minute}`;
            assert.equal(clock.getDayOfYear(date), ordinal, label);
            assert.equal(clock.getWeekNumber(date), week, label);
            const expected = `${date.toLocaleDateString('en-US', { weekday: 'long' })}, ${date.toLocaleDateString('en-US', { month: 'long' })} ${day}, ${year} • Day ${ordinal} • Week ${week}`;
            assert.equal(clock.formatDate(date), expected, label);
            assert.equal(clock.formatDate(date), expected, label + ' repeated');
            assert.equal(date.getTime(), stamp, label + ' input unchanged');
        }
    }
}

for (const timezone of ['UTC', 'America/Phoenix', 'America/New_York', 'Australia/Sydney']) {
    test(`clock day of year follows the local calendar in ${timezone}`, () => {
        const result = spawnSync(process.execPath, ['-e', `(${checkLocalCalendar.toString()})();`], {
            cwd: path.resolve(__dirname, '..'),
            env: { ...process.env, TZ: timezone }, encoding: 'utf8'
        });
        assert.ifError(result.error);
        assert.equal(result.status, 0, result.stderr || result.stdout);
    });
}
