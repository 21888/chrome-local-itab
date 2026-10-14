'use strict';
// Synthetic, memory-only saved records. No browser profile or provider access.
const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../shared/navigation-catalog.js');
const importer = require('../shared/bookmark-import.js');
const exporter = require('../shared/bookmark-export.js');
const finder = require('../shared/shortcut-finder.js');
const sites = require('../shared/navigation-sites.js');
const { createHarness, deferred, submit } = require('./helpers/dashboard-harness');
const clone = value => JSON.parse(JSON.stringify(value));
const spellings = ['https://example.com', 'https://example.com/', 'example.com'];
const links = () => spellings.map((url, index) => ({ title: `Synthetic saved ${index}`, url, icon: '🔖', category: 'work' }));
const categories = [{ id: 'work', name: 'Work' }];
const html = url => `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><DT><A HREF="${url}">Synthetic external</A></DL>`;
const options = { createCategoryId: () => 'synthetic_imported' };

for (let index = 0; index < spellings.length; index++) for (const field of ['title', 'icon', 'category']) {
    test(`${field}-only edit preserves raw spelling ${spellings[index]}, siblings and exact layout identity`, async () => {
        const original = links(), h = createHarness(original), writes = [];
        const positions = Object.fromEntries(spellings.flatMap((url, slot) => ['all', 'hidden|view'].map(view =>
            [`${view}|${url}`, { x: slot * 100 + 12.5, y: -slot * 25 - 6.75 }])));
        h.component.positions = clone(positions);
        h.storageManager.set = async (key, next, opts) => { writes.push({ key, next: clone(next), opts: clone(opts) }); return true; };
        h.component.openEditModal(index);
        h.component.modal.querySelector(`#shortcut-${field}`).value = field === 'category' ? 'social' : 'Changed';
        assert.equal(h.component.normalizedShortcutDraft().url, original[index].url);
        await submit(h.component);
        const expected = clone(original); expected[index][field] = field === 'category' ? 'social' : 'Changed';
        assert.equal(writes.length, 1); assert.deepEqual(writes[0].opts.expectedLinks, original);
        assert.deepEqual(writes[0].next, expected); assert.deepEqual(clone(h.component.links), expected);
        assert.deepEqual(h.component.positions, positions);
        for (const view of ['all', 'hidden|view']) for (let slot = 0; slot < spellings.length; slot++) {
            assert.deepEqual(h.component.getSavedPosition(h.component.links[slot], view), positions[`${view}|${spellings[slot]}`]);
        }
    });
}

test('explicit URL changes and new shortcuts still use the input normalizer, with raw prior provenance', async () => {
    for (const mode of ['edit', 'add']) {
        const original = links(), h = createHarness(original), writes = [];
        h.storageManager.set = async (key, next, opts) => { writes.push({ next: clone(next), opts: clone(opts) }); return true; };
        if (mode === 'edit') h.component.openEditModal(2); else h.component.openAddModal();
        h.component.modal.querySelector('#shortcut-title').value = 'Explicit input';
        h.component.modal.querySelector('#shortcut-url').value = ' example.com ';
        assert.equal(h.component.normalizedShortcutDraft().url, 'https://example.com/');
        await submit(h.component);
        assert.equal(writes.length, 1); assert.deepEqual(writes[0].opts.expectedLinks, original);
        assert.equal(writes[0].next[mode === 'edit' ? 2 : 3].url, 'https://example.com/');
        assert.deepEqual(writes[0].next.slice(0, 2), original.slice(0, 2));
    }
});

test('an editor passes unknown original fields to validation rather than dropping them', async () => {
    const original = links(); original[0].unknownMeaning = { retained: true };
    const h = createHarness(original); let attempts = 0;
    h.storageManager.set = async (key, next, opts) => {
        attempts++; assert.deepEqual(clone(opts.expectedLinks), original);
        assert.deepEqual(clone(next[0].unknownMeaning), original[0].unknownMeaning);
        throw new Error('Unsupported record field');
    };
    h.component.openEditModal(0); h.component.modal.querySelector('#shortcut-title').value = 'Edited';
    await submit(h.component);
    assert.equal(attempts, 1); assert.deepEqual(clone(h.component.links), original);
    assert.equal(h.component.modal.classList.contains('active'), true);
    assert(h.component.modal.querySelector('#url-error').textContent);
});

test('late editor completion preserves a newer modal and raw identities across queued saves', async () => {
    const original = links(), h = createHarness(original), wait = deferred(), writes = [];
    h.storageManager.set = async (key, next, opts) => {
        writes.push({ next: clone(next), opts: clone(opts) });
        if (writes.length === 1) return wait.promise;
        return true;
    };
    h.component.openEditModal(0); h.component.modal.querySelector('#shortcut-title').value = 'First changed';
    const saving = submit(h.component);
    h.component.hideModal(); h.component.openEditModal(2);
    h.component.modal.querySelector('#shortcut-title').value = 'Newer draft';
    await submit(h.component); assert.equal(writes.length, 1);
    wait.resolve(true); await saving;
    assert.equal(h.component.modal.classList.contains('active'), true);
    assert.equal(h.component.modal.querySelector('#shortcut-title').value, 'Newer draft');
    assert.equal(h.component.modal.querySelector('#shortcut-url').value, 'example.com');
    await submit(h.component); assert.equal(writes.length, 2);
    assert.deepEqual(writes[0].opts.expectedLinks, original);
    const afterFirst = clone(original); afterFirst[0].title = 'First changed';
    assert.deepEqual(writes[1].opts.expectedLinks, afterFirst);
    assert.deepEqual(h.component.links.map(link => link.url), spellings);
});

test('catalog adoption calls stored validation once and never canonicalizes late layout baselines', async () => {
    const original = links(), h = createHarness(original), wait = deferred(), adopted = [], checked = [];
    const layout = { autoArrange: false, positions: Object.fromEntries(spellings.map((url, index) => [`all|${url}`, { x: index + 0.5, y: -index - 0.5 }])) };
    h.storageManager.validateLinksConfig = () => assert.fail('Input validation cannot project stored rows');
    h.storageManager.validateStoredLinksConfig = saved => { checked.push(clone(saved)); return clone(saved); };
    h.storageManager.addCatalogShortcut = () => wait.promise;
    h.component.layoutController = { holdShortcutMutation() {}, releaseShortcutMutation() {}, async flush() {}, adoptOwnShortcutSnapshot(snapshot) { adopted.push(clone(snapshot)); } };
    const pending = h.component.addCatalogShortcut({ baseline: { links: clone(original) } });
    const snapshot = { links: [...original, { title: 'Added', url: 'https://new.example/', icon: 'N', category: 'work' }], layout, generation: 'synthetic' };
    wait.resolve(snapshot); await pending;
    assert.deepEqual(checked, [snapshot.links]); assert.equal(adopted.length, 1);
    assert.deepEqual(adopted[0].links, snapshot.links); assert.deepEqual(adopted[0].layout, layout);
    assert.deepEqual(clone(h.component.links), snapshot.links); assert.deepEqual(h.component.positions, layout.positions);
    h.component.openEditModal(2);
    await assert.rejects(h.component.addCatalogShortcut({}), /Shortcut action pending/);
});

test('catalog and bookmark existing-side matching include three spellings without relaxing external input', () => {
    const data = { links: links(), categories }, before = clone(data);
    assert.deepEqual([...catalog.savedURLs(data.links)], ['https://example.com/']);
    assert.deepEqual(catalog.savedLocations(data.links, categories).get('https://example.com/'), [{ id: 'work', name: 'Work' }]);
    for (const url of spellings) {
        const plan = importer.planImport(html('https://example.com/'), { ...data, links: [{ ...data.links[0], url }] }, options);
        assert.equal(plan.additions.links.length, 0); assert.equal(plan.preview.skippedReasons.duplicate_url, 1);
    }
    assert.equal(catalog.canonicalURL('example.com'), null); assert.equal(importer.canonicalURL('example.com'), null);
    assert.equal(importer.parse(html('example.com')).records.length, 0);
    const site = { ...sites[0], url: 'example.com' }; assert.throws(() => catalog.validate([site]));
    const uppercase = [{ ...data.links[0], url: 'HTTPS://EXAMPLE.COM' }];
    assert(catalog.savedURLs(uppercase).has('https://example.com/'));
    assert.equal(importer.planImport(html('https://example.com/'), { links: uppercase, categories }, options).additions.links.length, 0);
    assert.deepEqual(data, before);
});

test('HTML exports every saved row with an absolute derived href, without touching raw JSON or coordinates', () => {
    const data = { links: links(), categories, layout: { positions: Object.fromEntries(spellings.map((url, i) => [`all|${url}`, { x: i, y: i + 0.5 }])) } };
    const before = clone(data), serialized = exporter.serialize(data);
    assert.equal((serialized.match(/HREF="https:\/\/example.com\/"/g) || []).length, 3);
    assert.deepEqual(importer.parse(serialized).records.map(record => record.title), data.links.map(link => link.title));
    assert.deepEqual(data, before);
});

test('HTML bounds the derived URL and derived output bytes, not just shorter Unicode/schemeless source', () => {
    for (const url of ['example.com/' + 'a'.repeat(exporter.LIMITS.url - 12), 'example.com/' + '中'.repeat(500)]) {
        assert(url.length <= exporter.LIMITS.url);
        assert.throws(() => exporter.serialize({ categories, links: [{ title: 'Synthetic', category: 'work', url }] }), /exceeds its limits/);
    }
    const url = 'example.com/' + '中'.repeat(390);
    assert(new URL('https://' + url).href.length < exporter.LIMITS.url);
    assert.throws(() => exporter.serialize({ categories, links: Array(10000).fill({ title: 'Synthetic', category: 'work', url }) }), /exceeds its limits/);
});

for (const identified of [false, true]) test(`Finder catalog metadata and fresh guards retain raw identities: identified=${identified}`, async () => {
    const original = links().map((link, index) => ({ ...link, ...(identified ? { layoutId: `synthetic_${index}` } : {}) }));
    const snapshot = { links: clone(original), categories }, fresh = clone(snapshot), opened = []; let closed = 0;
    const syntheticSite = { ...sites[0], id: 'synthetic-legacy', url: 'https://example.com/', searchAliases: ['Synthetic destination alias'] };
    const controller = new finder.Controller({ getSnapshot: () => snapshot, readSnapshot: async () => fresh,
        getCatalogFields: finder.catalogLookup(catalog, [syntheticSite]),
        reserve: () => ({ open(link) { opened.push(clone(link)); }, close() { closed++; } }) });
    const rows = controller.search('Synthetic destination alias').rows;
    assert.deepEqual(rows.map(row => row.url), spellings);
    assert.deepEqual(snapshot.links, original);
    for (const row of rows) assert.equal(await controller.activate(row.token), 'opened');
    assert.deepEqual(opened, original);
    fresh.links[0].url = 'https://example.com/';
    assert.equal(await controller.activate(rows[0].token), 'stale'); assert.equal(closed, 1);
    assert.equal(opened.length, 3); assert.deepEqual(snapshot.links, original);
});
