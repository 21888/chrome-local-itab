'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../shared/bookmark-export.js');
const fixture = () => ({categories: [{id: 'all', name: '同名 <&>'}, {id: 'b', name: '同名 <&>'}, {id: 'empty', name: 'Empty'}],
    links: [{title: '第一 <&>', url: 'https://example.com/?private=1&x=2#frag', category: 'all'},
        {title: 'Other', url: 'https://example.org/', category: 'b'},
        {title: 'Duplicate', url: 'https://example.com/?private=1&x=2#frag', category: 'all'},
        {title: 'Orphan', url: 'https://example.net/', category: 'missing'}]});
test('scope preparation retains byte-identical all output and an independent frozen export snapshot', () => {
    const data = fixture(), prepared = api.prepare(data);
    assert.equal(prepared.html, api.serialize(data));
    assert.equal(prepared.siteCount, 4); assert.equal(prepared.folderCount, 3);
    assert.deepEqual(prepared.scope, {kind: 'all'});
    data.links[0].title = 'Later'; data.categories[0].name = 'Later';
    assert.equal(prepared.snapshot.links[0].title, '第一 <&>');
    assert.equal(prepared.snapshot.categories[0].name, '同名 <&>');
    for (const value of [prepared, prepared.scope, prepared.snapshot, prepared.snapshot.categories,
        prepared.snapshot.categories[0], prepared.snapshot.links, prepared.snapshot.links[0]]) assert.equal(Object.isFrozen(value), true);
});
test('typed category scope uses real identity including all and preserves duplicates Unicode escaping and query/hash', () => {
    const data = fixture(), prepared = api.prepare(data, {kind: 'category', id: 'all'});
    assert.equal(prepared.siteCount, 2); assert.equal(prepared.folderCount, 1);
    assert.equal(prepared.html, api.serialize({categories: [data.categories[0]], links: [data.links[0], data.links[2]]}));
    assert.match(prepared.html, /第一 &lt;&amp;&gt;/); assert.match(prepared.html, /private=1&amp;x=2#frag/);
    assert.equal((prepared.html.match(/HREF=/g) || []).length, 2);
    assert.ok(!prepared.html.includes('Other')); assert.ok(!prepared.html.includes('Orphan'));
    assert.ok(prepared.html.indexOf('第一') < prepared.html.indexOf('Duplicate'));
    const sameName = api.prepare(data, {kind: 'category', id: 'b'});
    assert.equal(sameName.siteCount, 1); assert.ok(sameName.html.includes('Other'));
});
test('empty category is zero sites one folder; no synthetic orphan category is offered', () => {
    const empty = api.prepare(fixture(), {kind: 'category', id: 'empty'});
    assert.equal(empty.siteCount, 0); assert.equal(empty.folderCount, 1); assert.match(empty.html, /<H3>Empty<\/H3>/);
    assert.throws(() => api.prepare(fixture(), {kind: 'category', id: 'missing'}));
    assert.throws(() => api.prepare(fixture(), {kind: 'category', id: 0}));
    assert.throws(() => api.prepare(fixture(), 'all'));
    assert.equal(api.prepare({categories: [], links: []}).folderCount, 0);
});
test('scoping cannot bypass full-source malformed fields duplicate IDs unsafe URLs or count limits', () => {
    const mutations = [data => { data.links[1].url = 'javascript:alert(1)'; },
        data => { data.links[1].title = '\u0000'; }, data => { data.links[1].category = null; },
        data => { data.categories[1].id = 'all'; }, data => { data.categories[1].name = '\ud800'; },
        data => { data.links = Array(api.LIMITS.links + 1); }, data => { data.categories = Array(api.LIMITS.categories + 1); }];
    for (const mutate of mutations) { const data = fixture(); mutate(data); assert.throws(() => api.prepare(data, {kind: 'category', id: 'empty'})); }
});
test('export snapshot matching checks all ordered relevant fields including outside the selected category', () => {
    const data = fixture(), prepared = api.prepare(data, {kind: 'category', id: 'all'});
    assert.equal(api.matches(prepared, structuredClone(data)), true);
    for (const mutate of [value => { value.links[1].title += '!'; }, value => { value.links[1].url += '?changed'; },
        value => { value.links[1].category = 'all'; }, value => { value.links.reverse(); },
        value => { value.categories[1].name += '!'; }, value => { value.categories[1].id += '!'; },
        value => { value.categories.reverse(); }, value => { value.links.pop(); }, value => { value.categories.pop(); }]) {
        const current = structuredClone(data); mutate(current); assert.equal(api.matches(prepared, current), false);
    }
    assert.throws(() => api.matches(prepared, {categories: [], links: null}));
});
test('prepare and snapshot comparison never read non-export fields', () => {
    const data = fixture(), trap = {get() { throw new Error('private field read'); }};
    for (const key of ['appearance', 'tasks', 'focus', 'scratchpad', 'countdown', 'background']) Object.defineProperty(data, key, trap);
    Object.defineProperty(data.links[0], 'icon', trap); Object.defineProperty(data.categories[0], 'icon', trap);
    const prepared = api.prepare(data); assert.equal(api.matches(prepared, data), true);
    const harmless = fixture(); harmless.appearance = {theme: 'changed'}; harmless.links[0].icon = 'changed';
    assert.equal(api.matches(prepared, harmless), true);
});
