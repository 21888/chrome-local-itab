const test = require('node:test');
const assert = require('node:assert/strict');
const Backup = require('../shared/complete-backup.js');
const Collections = require('../shared/local-ai-collections-store.js');
const code = expected => error => error.code === expected;

test('raw envelope rejects duplicate keys, including escaped equivalent names at every depth', () => {
    for (const source of [
        '{"schemaVersion":1,"schemaVersion":4}',
        '{"modules":{"tasks":{"enabled":false,"enabled":true}}}',
        '{"globals":{"collections":{"content":{"records":[{"title":"First","title":"Last"}]}}}}',
        '{"globals":{"prompts":{"content":{"records":[{"title":"First","t\\u0069tle":"Last"}]}}}}',
        '{"registry":{"entries":[{"name":"First","name":"Last"}]}}',
        '{"trash":[{"modules":{"config":{"data":{"quote":"First","quote":"Last"}}}}]}',
        '{"a\\\"b":1,"a\\u0022b":2}', '{"😀":1,"\\uD83D\\uDE00":2}',
        '{"__proto__":1,"__proto__":2}', '{"constructor":1,"constructor":2}'
    ]) assert.throws(() => Backup.parse(source, {}), code('DUPLICATE_KEY'), source);
});

test('scanner permits independent objects, strings, escapes and distinct Unicode names', () => {
    const values = [
        { first: { title: 'First' }, second: { title: 'Last' } },
        [{ title: 'First' }, { title: 'Last' }],
        { text: '"title":"First","title":"Last"', 'a"b': '\\\n\t\r\b\f/', '😀': '雪', 'é': 1, 'é': 2 },
        [null, true, false, 0, -1.2e30, 1e-9]
    ];
    for (const value of values) assert.doesNotThrow(() => Collections.rejectDuplicateKeys(JSON.stringify(value)));
    assert.doesNotThrow(() => Collections.rejectDuplicateKeys(' \t\r\n{"\\u0061":1,"b":2}\n'));
});

test('malformed JSON fails with a controlled INVALID error before review or writes', () => {
    let reads = 0, writes = 0, locks = 0;
    const store = new Backup.Store({}, { read() { reads++; }, write() { writes++; }, lock() { locks++; } });
    for (const source of ['', ' ', '{', '[', '{"x":}', '{"x" 1}', '{"x":1,}', '[1,]',
        '{"x":01}', '{"x":1.}', '{"x":1e}', '{"x":undefined}', '{"x":NaN}',
        '{"x":"\\u123"}', '{"x":"\\z"}', '{"x":"\n"}', '{"x":"unfinished}',
        '{}{}', 'true false', '[1 2]', '\u00a0{}', '[truex]', '[+1]', '{unquoted:1}']) {
        assert.throws(() => store.review(source), code('INVALID'), JSON.stringify(source));
    }
    assert.deepEqual([reads, writes, locks], [0, 0, 0]);
});

test('depth and node budgets are checked before allocating parsed envelope trees', () => {
    const nested = depth => '['.repeat(depth) + '0' + ']'.repeat(depth);
    assert.throws(() => Backup.parse(nested(32), {}), code('VERSION'));
    assert.throws(() => Backup.parse(nested(33), {}), code('SIZE_LIMIT'));
    assert.throws(() => Backup.parse(nested(20000), {}), code('SIZE_LIMIT'));
    const array = count => '[' + '0,'.repeat(count - 1) + '0]';
    assert.throws(() => Backup.parse(array(249999), {}), code('VERSION'));
    assert.throws(() => Backup.parse(array(250000), {}), code('SIZE_LIMIT'));
    // Object keys consume the same per-value work budget as array entries.
    const wide = '{' + Array.from({ length: 60000 }, (_, index) => `"k${index}":0`).join(',') + '}';
    assert.throws(() => Collections.rejectDuplicateKeys(wide), code('INPUT_LIMIT'));
});

test('exact 32 MiB envelope budget and UTF-8 byte budget are preserved', () => {
    const limit = Backup.LIMITS.bytes;
    assert.throws(() => Backup.parse('{}' + ' '.repeat(limit - 2), {}), code('VERSION'));
    assert.throws(() => Backup.parse(' '.repeat(limit + 1), {}), code('SIZE_LIMIT'));
    assert.throws(() => Backup.parse('"' + '雪'.repeat(Math.floor(limit / 3) + 1) + '"', {}), code('SIZE_LIMIT'));
});

test('duplicates and excessive depth never reach whole-envelope JSON.parse', () => {
    const nativeParse = JSON.parse;
    for (const [source, expected] of [
        ['{"globals":{"collections":{"title":"First","title":"Last"}}}', 'DUPLICATE_KEY'],
        ['['.repeat(10000) + '0' + ']'.repeat(10000), 'SIZE_LIMIT']
    ]) {
        let envelopeParses = 0;
        JSON.parse = function (text, ...args) {
            if (text === source) envelopeParses++;
            return nativeParse(text, ...args);
        };
        try { assert.throws(() => Backup.parse(source, {}), code(expected)); }
        finally { JSON.parse = nativeParse; }
        assert.equal(envelopeParses, 0);
    }
});
