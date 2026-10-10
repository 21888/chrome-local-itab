'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const StorageManager = require('../storage');
const { createHarness } = require('./helpers/dashboard-harness');
const id = i => `l_${i.toString(16).padStart(32, '0')}`;

// Production JavaScript and DOM operation counts; these are not native timings.
for (const size of [200, 2000, 20000]) test(`dashboard production render counts at ${size} saved links`, t => {
    const categories = Array.from({length: size / 10}, (_, i) => ({id: `c${i}`, name: `Category ${i}`, icon: '📁'}));
    const links = Array.from({length: size}, (_, i) => ({
        title: `Synthetic ${i}`, url: `https://saved${i}.invalid/`, icon: 'x'.repeat(256),
        category: `c${i % categories.length}`, layoutId: id(i + 1)
    }));
    const manager = new StorageManager();
    const snapshot = manager.bookmarkImportSnapshot({
        ...structuredClone(manager.defaultConfig), links, categories, schemaVersion: 2,
        layout: {...manager.defaultConfig.layout, identityVersion: 1,
            positionsById: Object.fromEntries(links.map(link => [link.layoutId, {}]))}
    });
    assert.equal(snapshot.links.length, size);
    const h = createHarness(links), c = h.component, nav = h.context.window.categoryNavigation;
    c.categories = categories; nav.categories = categories; nav.currentCategory = 'all';
    const list = h.document.createElement('div');
    list.id = 'category-list'; h.document.body.append(list);
    // The general harness stubs these routines. Restore the production methods.
    c.applyLayoutMode = h.context.ShortcutsComponent.prototype.applyLayoutMode;
    c.reflowVisibleLayout = h.context.ShortcutsComponent.prototype.reflowVisibleLayout;
    h.storageManager.set = async () => assert.fail('presentation must not write storage');

    const stats = {};
    const reset = () => { for (const key of Object.keys(stats)) delete stats[key]; };
    for (const key of ['createShortcutItem', 'updateCollectionVisibility', 'buildShortcutsFragment']) {
        const original = c[key];
        c[key] = function (...args) {
            stats[key] = (stats[key] || 0) + 1;
            return original.apply(this, args);
        };
    }
    let counting = false;
    const updateCounts = nav.updateCounts;
    nav.updateCounts = function (...args) {
        counting = true;
        try { return updateCounts.apply(this, args); } finally { counting = false; }
    };
    for (const link of c.links) {
        const category = link.category;
        Object.defineProperty(link, 'category', {enumerable: true, configurable: true, get() {
            if (counting) stats.badgeCategoryReads = (stats.badgeCategoryReads || 0) + 1;
            return category;
        }});
    }
    const filter = c.links.filter;
    c.links.filter = function (fn, ...args) {
        return filter.call(this, (...values) => {
            stats.linkFilterVisits = (stats.linkFilterVisits || 0) + 1;
            return fn(...values);
        }, ...args);
    };
    h.context.JSON = {parse: JSON.parse, stringify(value) {
        stats.serializations = (stats.serializations || 0) + 1;
        if (value === c.links) stats.fullLinksSerializations = (stats.fullLinksSerializations || 0) + 1;
        return JSON.stringify(value);
    }};
    const countElements = node => 1 + node.children.reduce((sum, child) => sum + countElements(child), 0);
    const report = label => {
        const tiles = h.grid.querySelectorAll('.shortcut-item:not(.add-shortcut)').length;
        assert.equal(tiles, size);
        assert.equal(stats.fullLinksSerializations || 0, 0);
        assert.equal(stats.badgeCategoryReads || 0, (stats.updateCollectionVisibility || 0) * size,
            'one category read per saved link per badge refresh');
        t.diagnostic(JSON.stringify({size, label, ...stats, gridElements: countElements(h.grid) - 1,
            tiles, groups: h.grid.querySelectorAll('.shortcut-collection').length}));
    };
    nav.render(); reset();
    h.document.documentElement.dataset.dashboardTemplate = 'graphite';
    c.refreshTemplate(); report('flat-to-grouped');
    reset(); nav.selectCategory('c0'); report('category');
    assert.equal(h.grid.querySelectorAll('.shortcut-item:not(.add-shortcut)').filter(el => el.style.display !== 'none').length, 10);
    const groupedTiles = h.grid.querySelectorAll('.shortcut-item');
    reset(); h.document.documentElement.dataset.dashboardTemplate = 'folio';
    c.refreshTemplate(); report('grouped-to-grouped');
    assert.equal(stats.createShortcutItem || 0, 0, 'equivalent grouping creates no tiles');
    assert.equal(stats.buildShortcutsFragment || 0, 0, 'equivalent grouping creates no fragment');
    assert.equal(stats.serializations || 0, 0, 'equivalent grouping serializes no focus keys');
    h.grid.querySelectorAll('.shortcut-item').forEach((tile, index) => assert.equal(tile === groupedTiles[index], true));
    reset(); h.document.documentElement.dataset.dashboardTemplate = 'clarity';
    c.refreshTemplate(); report('grouped-to-flat');
    assert.equal(c.links.length, size);
    assert.deepEqual(Array.from(c.links, link => link.layoutId), links.map(link => link.layoutId));

    // Established Free positions: no storage, migration, or missing-key initialization.
    c.layout.autoArrange = false;
    c.identityPositions = Object.fromEntries(links.map(link => [link.layoutId, {c0: {x: 0, y: 0}, all: {x: 0, y: 0}}]));
    reset(); c.applyLayoutMode({persistMissing: false}); report('grid-to-established-free');
    reset(); h.document.documentElement.dataset.dashboardTemplate = 'folio';
    c.refreshTemplate(); report('free-template');
    reset(); nav.selectCategory('all'); report('free-category');
});

test('badge aggregation retains fallback, unknown IDs, duplicate nav items, All, selection and focus', () => {
    const h = createHarness([
        {title:'Missing',url:'https://missing.invalid/'},
        {title:'Empty',url:'https://empty.invalid/',category:''},
        {title:'Work',url:'https://work.invalid/',category:'work'},
        {title:'Unknown',url:'https://unknown.invalid/',category:'unknown'},
        {title:'Prototype key',url:'https://prototype.invalid/',category:'__proto__'}
    ]);
    const nav = h.context.window.categoryNavigation;
    nav.categories = [
        {id:'work',name:'Work'}, {id:'work',name:'Duplicate Work'},
        {id:'unknown',name:'Unknown'}, {id:'__proto__',name:'Prototype key'},
        {id:'empty',name:'Empty'}
    ];
    const list = h.document.createElement('div');
    list.id = 'category-list'; h.document.body.append(list);
    const saved = [];
    nav.storageKey = 'currentCategory';
    h.context.localStorage = {setItem: (...args) => saved.push(args)};
    nav.render();
    const items = list.querySelectorAll('.category-item');
    const counts = () => items.map(item => String(item.querySelector('.category-count').textContent));
    assert.deepEqual(counts(), ['5','3','3','1','1','0']);
    const control = items[3]; control.focus();
    const tiles = h.grid.querySelectorAll('.shortcut-item');
    nav.selectCategory('unknown');
    assert.equal(h.document.activeElement, control);
    assert.equal(nav.currentCategory, 'unknown');
    assert.deepEqual(saved, [['currentCategory','unknown']]);
    assert.deepEqual(h.grid.querySelectorAll('.shortcut-item'), tiles);
    assert.deepEqual(counts(), ['5','3','3','1','1','0']);
    nav.updateCounts([]);
    assert.deepEqual(counts(), ['0','0','0','0','0','0']);
});
