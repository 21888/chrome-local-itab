const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const Calendar = require('../shared/month-calendar');

test('ISO date drafts accept full ASCII dates with strict Gregorian round trips', () => {
    for (const [text, tuple] of [['0001-01-01', [1, 0, 1]], ['0004-02-29', [4, 1, 29]],
        ['0099-12-31', [99, 11, 31]], ['2000-02-29', [2000, 1, 29]], ['9999-12-31', [9999, 11, 31]]]) {
        const result = Calendar.parseDateDraft(text);
        assert.deepEqual([result.year, result.month, result.day], tuple);
    }
    for (const value of ['', '2024-1-01', '2024-01-1', '0000-01-01', '10000-01-01',
        '1900-02-29', '0100-02-29', '2025-02-29', '2024-04-31', '2024-13-01',
        '2024-00-01', '2024-01-00', '2024-01-32', '2024/01/01', '２０２４-01-01',
        '2024-０１-01', ' 2024-01-01', '2024-01-01 ', '2024-01-01\n',
        '2024-01-01T00:00:00Z', '2e03-01-01', '+024-01-01', null, undefined, 20240101, {}, []]) {
        assert.equal(Calendar.parseDateDraft(value), null, String(value));
    }
});

test('date interval is signed integer natural days with zero, leap-century and early-year boundaries', () => {
    for (const [start, end, expected] of [['2026-10-17', '2026-10-17', 0],
        ['2026-10-17', '2026-10-18', 1], ['2026-10-18', '2026-10-17', -1],
        ['1900-02-28', '1900-03-01', 1], ['2000-02-28', '2000-03-01', 2],
        ['0001-12-31', '0002-01-01', 1], ['0099-12-31', '0100-01-01', 1],
        ['0001-01-01', '9999-12-31', 3652058], ['9999-12-31', '0001-01-01', -3652058]]) {
        assert.equal(Calendar.dateInterval(start, end), expected);
    }
    assert.equal(Calendar.dateInterval('', '2024-01-01'), null);
    assert.equal(Calendar.dateInterval('2024-01-01', '1900-02-29'), null);
});

test('date-only intervals ignore DST, fractional offsets and civil-date skips', () => {
    const helper = require.resolve('../shared/month-calendar');
    const script = `const c = require(${JSON.stringify(helper)}); console.log(JSON.stringify([
        c.dateInterval('2026-03-08', '2026-03-09'), c.dateInterval('2026-11-01', '2026-11-02'),
        c.dateInterval('2026-10-04', '2026-10-05'), c.dateInterval('2011-12-29', '2011-12-31'),
        c.dateInterval('0001-01-01', '0099-01-01')]));`;
    for (const TZ of ['UTC', 'America/New_York', 'Australia/Lord_Howe', 'Asia/Kathmandu', 'Pacific/Chatham', 'Pacific/Apia']) {
        const result = spawnSync(process.execPath, ['--max-old-space-size=128', '-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(JSON.parse(result.stdout), [1, 1, 1, 2, 35794], TZ);
    }
});
