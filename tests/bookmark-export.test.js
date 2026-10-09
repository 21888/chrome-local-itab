'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../shared/bookmark-export.js');
const importer = require('../shared/bookmark-import.js');
const link = (title = 'Example', category = 'a', url = 'https://example.com/') => ({title, category, url});
const config = () => ({categories: [{id: 'a', name: 'Work'}], links: [link()]});
const invalid = value => assert.throws(() => api.serialize(value), /^Error: Bookmark export contains unsupported data or exceeds its limits\.$/);

test('deterministic folders, duplicate URLs, same names, empty folders and root fallback', () => {
    const data = {categories: [{id: 'b', name: 'Same'}, {id: 'a', name: 'Same'}, {id: 'empty', name: 'Empty'}],
        links: [link('First a'), link('Root', 'missing'), link('First b', 'b'), link('Second a')]};
    const before = JSON.stringify(data); const html = api.serialize(data);
    assert.equal(api.serialize(data), html); assert.equal(JSON.stringify(data), before);
    assert.equal((html.match(/<H3>Same<\/H3>/g) || []).length, 2);
    assert.ok(html.indexOf('First b') < html.indexOf('First a'));
    assert.ok(html.indexOf('First a') < html.indexOf('Second a'));
    assert.ok(html.indexOf('Empty') < html.indexOf('Root'));
    assert.equal((html.match(/HREF=/g) || []).length, 4);
    assert.match(html, /<H3>Empty<\/H3>\n    <DL><p>\n    <\/DL>/);
});
test('ordinary exported fixture parses with folder and title content intact', () => {
    const data = config(); data.links.push(link('Reading', 'b', 'https://example.org/'));
    data.categories.push({id: 'b', name: 'Reading'});
    const result = importer.parse(api.serialize(data));
    assert.equal(result.records.length, 2);
    assert.deepEqual(result.records.map(record => record.title), ['Example', 'Reading']);
    assert.equal(result.skipped.total, 0);
});
test('escapes text/attributes and whitespace, preserves saved URL spelling and Unicode', () => {
    const data = config(); data.categories[0].name = '📚<&>"\'\t\r\n';
    data.links = [link('<script>你好 & "\'\t\r\n', 'a', 'HTTPS://Example.COM/path?q="quoted"&x=\'<tag>#frag')];
    const html = api.serialize(data);
    assert.ok(html.includes('HREF="HTTPS://Example.COM/path?q=&quot;quoted&quot;&amp;x=&#39;&lt;tag&gt;#frag"'));
    assert.ok(!html.includes('<script>')); assert.ok(html.includes('📚&lt;&amp;&gt;&quot;&#39;&#9;&#13;&#10;'));
});
test('reads only titles URLs category membership and category identity/name', () => {
    const data = config(); const trap = {get() { throw new Error('private field accessed'); }};
    for (const key of ['icon', 'layoutId']) Object.defineProperty(data.links[0], key, trap);
    for (const key of ['icon', 'color']) Object.defineProperty(data.categories[0], key, trap);
    for (const key of ['tasks', 'background', 'focus', 'scratchpad', 'countdown']) Object.defineProperty(data, key, trap);
    assert.ok(api.serialize(data).includes('Example'));
});
test('rejects whole export for unsafe URLs, malformed fields and duplicate category IDs', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///a', 'https://a b/', 'https://x\\y', 'https://user:pass@example.com/', 'https://@example.com/', 'https://example.com/%zz']) {
        const data = config(); data.links.push(link('Invalid', 'a', url)); invalid(data);
    }
    for (const value of ['\u0000', '\u000b', '\u007f', '\u0085', '\ud800', '\udc00']) {
        const data = config(); data.links[0].title += value; invalid(data);
        const folder = config(); folder.categories[0].name += value; invalid(folder);
    }
    const duplicate = config(); duplicate.categories.push({id: 'a', name: 'Other'}); invalid(duplicate);
    for (const data of [null, {}, {categories: [], links: {}}, {categories: [null], links: []}]) invalid(data);
    const missing = config(); delete missing.links[0].title; invalid(missing);
});
test('bounds cardinality, strings, and UTF-8 output without truncation', () => {
    const data = config(); data.links[0].title = '😀'.repeat(api.LIMITS.text); assert.ok(api.serialize(data));
    data.links[0].title += 'a'; invalid(data);
    const links = config(); links.links = Array(api.LIMITS.links + 1).fill(link()); invalid(links);
    const categories = config(); categories.categories = Array(api.LIMITS.categories + 1).fill({id: 'a', name: 'a'}); invalid(categories);
    const unicodeURL = config(); unicodeURL.links[0].url = 'https://example.com/' + '😀'.repeat(2100); invalid(unicodeURL);
    const long = config(); long.links[0].url = 'https://example.com/' + 'a'.repeat(api.LIMITS.url); invalid(long);
    const bytes = config(); bytes.links = Array(api.LIMITS.links).fill(link('a', 'a', 'https://example.com/' + 'x'.repeat(2000))); invalid(bytes);
    assert.ok(api.serialize({categories: [], links: []}).endsWith('</DL><p>\n'));
});
