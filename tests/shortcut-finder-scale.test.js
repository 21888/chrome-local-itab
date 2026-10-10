'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const StorageManager = require('../storage');
const { createDocument } = require('./helpers/finder-dom-model');
const id = i => `l_${i.toString(16).padStart(32, '0')}`;
function fixture({ legacy = false, count = 20000 } = {}) {
    const links = Array.from({length: count}, (_, i) => ({ title: `Synthetic Café 中文 ${i}`, url: `https://saved${i}.invalid/path`,
        category: `c${i % 2000}`, ...(legacy ? {} : { layoutId: id(i + 1) }), icon: 'x'.repeat(256) }));
    const categories = Array.from({length: 2000}, (_, i) => ({id: `c${i}`, name: `Category ${i}`, icon: '📁'}));
    let snapshot = {links, categories}, fresh = () => structuredClone(snapshot), opened = [];
    const counts = { urls: 0, snapshots: 0, bytes: 0 };
    const context = { window: {}, URL: class extends URL { constructor(...args) { super(...args); counts.urls++; } },
        JSON: { stringify(value) { const result = JSON.stringify(value); if (Array.isArray(value) && typeof value[0] === 'object') { counts.snapshots++; counts.bytes += Buffer.byteLength(result); } return result; } } };
    vm.createContext(context); vm.runInContext(fs.readFileSync(require.resolve('../shared/shortcut-finder'), 'utf8'), context);
    const controller = new context.window.LocalItabFinder.Controller({ getSnapshot: () => snapshot, readSnapshot: () => fresh(), activate: link => opened.push(link) });
    return { context, counts, controller, links, categories, opened,
        reset() { counts.urls = counts.snapshots = counts.bytes = 0; },
        replace(value) { snapshot = value; }, fresh(value) { fresh = () => value; } };
}
test('20,000 saved-ID rows: only 50 URL models; no icon-bearing snapshot serialization', t => {
    const f = fixture();
    const manager = new StorageManager();
    const snapshot = manager.bookmarkImportSnapshot({...structuredClone(manager.defaultConfig), links: f.links, categories: f.categories, schemaVersion: 2,
        layout: {...manager.defaultConfig.layout, identityVersion: 1, positionsById: Object.fromEntries(f.links.map(link => [link.layoutId, {}]))}});
    assert.equal(snapshot.links.length, 20000); assert.equal(snapshot.categories.length, 2000);
    const result = f.controller.search('cafe');
    assert.equal(result.total, 20000); assert.equal(result.rows.length, 50);
    assert.equal(f.counts.urls, 50, 'URL parsing is bounded by the displayed page');
    assert.equal(f.counts.snapshots, 0, 'stable IDs do not need the full legacy snapshot');
    f.reset(); const empty = f.controller.search('');
    assert.equal(empty.saved, 20000); assert.equal(empty.total, 0); assert.equal(empty.rows.length, 0);
    assert.equal(f.counts.urls, 0); assert.equal(f.counts.snapshots, 0);
    f.reset(); assert.equal(f.controller.search('absent-synthetic-token').total, 0);
    assert.equal(f.counts.urls, 0); assert.equal(f.counts.snapshots, 0);
    f.reset(); const second = f.controller.search('cafe', 1);
    assert.equal(second.start, 50); assert.equal(second.rows[0].token.id, id(51));
    assert.equal(f.counts.urls, 50); assert.equal(f.counts.snapshots, 0);
    f.reset(); const last = f.controller.search('cafe', 999999);
    assert.equal(last.page, 399); assert.equal(last.start, 19950); assert.equal(last.rows[49].token.id, id(20000));
    assert.equal(last.hasNext, false); assert.equal(f.counts.urls, 50); assert.equal(f.counts.snapshots, 0);
    t.diagnostic('Synthetic operation counts only. This does not measure native browser responsiveness or paint.');
});
test('20,000 saved rows: every identity reachable; category filtering and stale activation stay exact', async () => {
    const f = fixture(); const seen = new Set();
    for (let page = 0; page < 400; page++) {
        const result = f.controller.search('cafe', page);
        assert.equal(result.page, page); assert.equal(result.total, 20000); assert.equal(result.rows.length, 50);
        for (const row of result.rows) { assert(!seen.has(row.token.id)); seen.add(row.token.id); }
    }
    assert.equal(seen.size, 20000); assert.equal(f.counts.urls, 20000); assert.equal(f.counts.snapshots, 0);
    const category = f.controller.search('Category 1999'); assert.equal(category.total, 10);
    const token = category.rows[9].token;
    f.replace({links: [...f.links].reverse(), categories: f.categories});
    assert.equal(await f.controller.activate(token), 'opened'); assert.equal(f.opened[0].layoutId, id(20000));
    f.fresh({links: f.links.map(link => link.layoutId === token.id ? {...link, url: 'https://changed.invalid/'} : link)});
    assert.equal(await f.controller.activate(token), 'stale'); assert.equal(f.opened.length, 1);
});
test('mixed legacy pages serialize once only when needed and preserve fresh-read stale checks', async () => {
    const f = fixture({ count: 101 }); delete f.links[100].layoutId;
    f.controller.search('cafe'); assert.equal(f.counts.snapshots, 0);
    f.reset(); const token = f.controller.search('cafe', 2).rows[0].token;
    assert.equal(token.id, null); assert.equal(f.counts.urls, 1); assert.equal(f.counts.snapshots, 1);
    assert.equal(await f.controller.activate(token), 'opened');
    const changed = structuredClone(f.links); changed[0].icon = 'changed';
    f.fresh({links: changed}); assert.equal(await f.controller.activate(token), 'stale');
    assert.equal(f.opened.length, 1);
    const reordered = [...f.links]; [reordered[0], reordered[100]] = [reordered[100], reordered[0]];
    f.replace({links: reordered, categories: f.categories}); f.fresh({links: reordered});
    f.reset(); const entered = f.controller.search('cafe').rows[0];
    assert.equal(entered.token.id, null); assert.equal(f.counts.snapshots, 1);
    assert.equal(entered.token.index, 0); assert.equal(await f.controller.activate(entered.token), 'opened');
    assert.equal(await f.controller.activate(token), 'stale', 'previous legacy page token rejects after reordering');
});
test('20,000 saved rows: DOM model holds 50 results with exact first/last counts', () => {
    const f = fixture(); const document = createDocument(); const host = document.createElement('header'); document.body.append(host);
    Object.assign(f.context, { document }); f.context.window.document = document;
    vm.runInContext(fs.readFileSync(require.resolve('../shared/dialog-focus'), 'utf8'), f.context);
    vm.runInContext(fs.readFileSync(require.resolve('../shared/shortcut-finder-view'), 'utf8'), f.context);
    const view = f.context.window.LocalItabFinder.mount(host, { getSnapshot: () => ({links: f.links, categories: f.categories}), activate() { assert.fail('unexpected activation'); } });
    host.querySelector('button').dispatch('click'); const input = document.querySelector('.finder-input');
    input.value = 'cafe'; input.dispatch('input');
    assert.equal(document.querySelectorAll('.finder-result').length, 50);
    assert.equal(document.querySelector('[role="status"]').textContent, 'Results: 20000 · Showing: 1–50');
    const next = document.querySelectorAll('button').find(node => node.textContent === 'Next results'); next.dispatch('click');
    assert.equal(document.querySelector('[role="status"]').textContent, 'Results: 20000 · Showing: 51–100');
    assert.equal(document.querySelectorAll('.finder-result').length, 50);
    view.destroy(); assert.equal(document.querySelectorAll('.finder-result').length, 0);
});
