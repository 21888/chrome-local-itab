const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../shared/local-prompts-store.js');
const { setup } = require('./helpers/prompts-harness.js');

async function fixture(body, fields = {}) {
    const h = setup();
    const state = await h.store.mutate(h.store.request('add', { title: 'Synthetic prompt', body, ...fields }));
    return { ...h, state };
}
function safeSnippet(snippet) {
    assert.ok(Array.from(snippet).length <= 182);
    assert.doesNotMatch(snippet, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u);
}

test('prompt excerpts map expanded lowercase offsets back to their original Unicode text', async () => {
    const body = 'İ'.repeat(200) + '😀'.repeat(80) + '针尖 NEEDLE' + '尾'.repeat(500);
    const h = await fixture(body), before = h.raw, writes = h.writes;
    for (const query of ['针尖', 'NEEDLE', 'needle', 'needle 针尖']) {
        const [row] = Core.search(h.state, query);
        assert.deepEqual(row.matchedFields, ['body']);
        assert.match(row.snippet, /针尖 NEEDLE/); safeSnippet(row.snippet);
        assert.equal(row.record.body, body);
    }
    assert.deepEqual(h.raw, before); assert.equal(h.writes, writes);
});

test('expanded matches themselves map to one original point and retain combining and non-BMP text', async () => {
    const marker = 'İSTANBUL e\u0301 👩🏽‍💻 𐐀';
    const { state } = await fixture('İ'.repeat(120) + '😀'.repeat(60) + marker + '尾'.repeat(220));
    for (const query of ['i\u0307stanbul', '\u0307stanbul', 'e\u0301', '👩🏽‍💻', '𐐨']) {
        const [row] = Core.search(state, query);
        assert.ok(row.snippet.includes(marker), query); safeSnippet(row.snippet);
    }
});

test('multi-term AND remains cross-field and picks the earliest original body hit regardless of query order', async () => {
    const { state } = await fixture('İ'.repeat(200) + '😀'.repeat(80) + 'FIRST' + '尾'.repeat(250) + 'LAST', {
        title: 'Project title', tags: ['Exact,Tag'], category: 'Work', tool: 'Synthetic Tool'
    });
    for (const query of ['project LAST exact,tag FIRST work synthetic', 'FIRST LAST project']) {
        const rows = Core.search(state, query); assert.equal(rows.length, 1);
        assert.match(rows[0].snippet, /FIRST/); assert.doesNotMatch(rows[0].snippet, /LAST/); safeSnippet(rows[0].snippet);
    }
    assert.equal(Core.search(state, 'project FIRST missing').length, 0);
});

test('non-body matches use their original field and unmatched or empty queries keep existing behavior', async () => {
    const body = '😀'.repeat(220) + 'body tail';
    const { state } = await fixture(body, { title: 'İ'.repeat(100) + 'TitleNeedle' + '尾'.repeat(60) });
    const [title] = Core.search(state, 'titleneedle');
    assert.deepEqual(title.matchedFields, ['title']); assert.match(title.snippet, /TitleNeedle/); safeSnippet(title.snippet);
    for (const query of ['', '   \t\n']) {
        const [row] = Core.search(state, query); assert.deepEqual(row.matchedFields, []);
        assert.equal(row.snippet, '😀'.repeat(180) + '…'); safeSnippet(row.snippet);
    }
    assert.deepEqual(Core.search(state, 'not-present'), []);
});

test('long prompt excerpts preserve supplementary characters at both code-point cut boundaries', async () => {
    const { state } = await fixture('İ😀'.repeat(8000) + 'TARGET' + '😀尾'.repeat(1000));
    const [row] = Core.search(state, 'target');
    assert.match(row.snippet, /TARGET/); safeSnippet(row.snippet);
    assert.ok(row.snippet.startsWith('…')); assert.ok(row.snippet.endsWith('…'));
});
