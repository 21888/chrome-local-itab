'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const StorageManager = require('../storage');
const Identity = require('../shared/layout-identity');
const { createHarness } = require('./helpers/dashboard-harness');
const id = i => `l_${i.toString(16).padStart(32, '0')}`;
const plain = value => JSON.parse(JSON.stringify(value));
const link = (i, extra = {}) => ({ title: `Synthetic ${i}`, url: `https://saved${i}.invalid/`, category: 'work', layoutId: id(i), ...extra });
function page(links, positionsById = {}, positions = {}) {
    const h = createHarness(links), c = h.component;
    h.context.window.categoryNavigation.currentCategory = 'all';
    h.context.window.categoryNavigation.filterShortcuts({ reflow: false });
    c.layout = { autoArrange: false, alignToGrid: false, gridSize: 96, columns: 6, positions, identityVersion: 1, positionsById };
    c.identityPositions = positionsById; c.positions = positions;
    c.applyLayoutMode = h.context.ShortcutsComponent.prototype.applyLayoutMode;
    c.reflowVisibleLayout = h.context.ShortcutsComponent.prototype.reflowVisibleLayout;
    const saves = [];
    c.saveLayoutDebounced = (legacy, identified) => saves.push({ legacy, identified });
    return { ...h, c, saves };
}

// Operation counts on production methods, not browser timing. The proxy is also
// a fail-fast budget: a regression cannot restart the old unbounded 20k stress.
for (const size of [200, 2000, 20000]) test(`initial Free batch copies ${size} identity entries only once`, t => {
    const categories = Array.from({ length: size / 10 }, (_, i) => ({ id: `c${i}`, name: `Category ${i}`, icon: '📁' }));
    const links = Array.from({ length: size }, (_, i) => link(i + 1, { icon: 'x'.repeat(256), category: `c${i % categories.length}` }));
    const manager = new StorageManager();
    const original = Object.fromEntries(links.map(item => [item.layoutId, Object.freeze({})]));
    const snapshot = manager.bookmarkImportSnapshot({
        ...structuredClone(manager.defaultConfig), links, categories, schemaVersion: 2,
        layout: { ...manager.defaultConfig.layout, identityVersion: 1, positionsById: original }
    });
    assert.equal(snapshot.links.length, size, 'fixture passes actual safe-import count/allocation validation');
    Object.freeze(original);
    const { c, saves } = page(links, original);
    let counting = false, copies = 0, entries = 0;
    const wrap = map => new Proxy(map, { ownKeys(target) {
        const keys = Reflect.ownKeys(target);
        if (counting) {
            copies++; entries += keys.length;
            assert.ok(entries <= size, 'initialization must not repeatedly copy the full identity map');
        }
        return keys;
    } });
    let current = wrap(original);
    Object.defineProperty(c, 'identityPositions', { get: () => current, set: value => { current = wrap(value); } });
    counting = true;
    try { c.initializeMissingPositions(); } finally { counting = false; }
    assert.equal(copies, 1); assert.equal(entries, size);
    assert.equal(saves.length, 1);
    assert.equal(Object.keys(saves[0].identified).length, size);
    assert.deepEqual(plain(saves[0].legacy), {});
    for (let i = 0; i < size; i++) {
        assert.deepEqual(plain(c.identityPositions[id(i + 1)].all), { x: (i % 3) * 96, y: Math.floor(i / 3) * 96 });
        assert.equal(Object.keys(original[id(i + 1)]).length, 0, 'borrowed view maps are untouched');
    }
    const owned = c.identityPositions;
    counting = true;
    try { c.initializeMissingPositions(); } finally { counting = false; }
    assert.equal(c.identityPositions, owned, 'established layout keeps map ownership');
    assert.equal(copies, 1); assert.equal(saves.length, 1, 'no repeated persistence');
    t.diagnostic(JSON.stringify({ size, topLevelCopies: copies, copiedEntries: entries, initialized: size }));
});

test('batch preserves visible seed order, fractions, contexts, hidden/orphan maps and legacy entries', () => {
    const saved = Object.freeze({ x: -37.25, y: 53.75 });
    const other = Object.freeze({ x: 904.5, y: -9.125 });
    const existing = Object.freeze({ all: saved, work: other });
    const missing = Object.freeze({ work: other });
    const hidden = Object.freeze({ social: saved });
    const orphan = Object.freeze({ all: other });
    const original = Object.freeze({ [id(1)]: existing, [id(2)]: missing, [id(3)]: missing, [id(4)]: hidden, [id(99)]: orphan });
    const legacy = { 'hidden|https://old.invalid/': { x: 12.5, y: 13.5 } };
    const { c, grid, tile, saves } = page([link(1), link(2), link(3, { url: 'https://saved2.invalid/' }), link(4), link(5, { layoutId: undefined })], original, legacy);
    grid.rect.width = 220;
    tile(0).rect = { width: 80, height: 100 };
    tile(1).rect = { width: 120, height: 60 };
    tile(2).rect = { width: 90, height: 90 };
    tile(3).style.display = 'none';
    c.initializeMissingPositions();
    assert.deepEqual(plain(c.identityPositions[id(2)].all), { x: 0, y: 169.75 });
    assert.deepEqual(plain(c.identityPositions[id(3)].all), { x: 0, y: 245.75 });
    assert.deepEqual(plain(legacy['all|https://saved5.invalid/']), { x: 106, y: 245.75 });
    assert.equal(c.identityPositions[id(1)], existing);
    assert.equal(c.identityPositions[id(4)], hidden);
    assert.equal(c.identityPositions[id(99)], orphan);
    assert.equal(c.identityPositions[id(2)].work, other);
    assert.notEqual(c.identityPositions[id(2)], missing);
    assert.notEqual(c.identityPositions[id(2)], c.identityPositions[id(3)]);
    assert.deepEqual(plain(missing), { work: other });
    assert.equal(c.layout.positionsById, original, 'optimistic batch does not mutate the saved layout');
    assert.equal(saves.length, 1);
    assert.deepEqual(Object.keys(saves[0].identified), [JSON.stringify(['all', id(2)]), JSON.stringify(['all', id(3)])]);
    assert.deepEqual(Object.keys(saves[0].legacy), ['all|https://saved5.invalid/']);
    assert.notEqual(saves[0].identified[JSON.stringify(['all', id(2)])], c.identityPositions[id(2)].all, 'queued coordinates have separate ownership');
    c.applyVisibleTransformsFromPositions();
    assert.equal(tile(0).style.left, '0px', 'display-only bounds clamp negative saved x');
    assert.equal(tile(0).style.top, '53.75px');
    assert.equal(c.identityPositions[id(1)].all, saved);
});

test('new category batch is view-local, persist=false is quiet, drag setter remains immutable', () => {
    const original = Object.freeze({ [id(1)]: Object.freeze({ all: Object.freeze({ x: 7.25, y: -12.5 }) }) });
    const { c, context, tile, saves } = page([link(1)], original);
    context.window.categoryNavigation.currentCategory = 'work|with|separator';
    c.initializeMissingPositions(false);
    assert.equal(saves.length, 0);
    assert.deepEqual(plain(c.identityPositions[id(1)]), { all: { x: 7.25, y: -12.5 }, 'work|with|separator': { x: 0, y: 0 } });
    const batch = c.identityPositions;
    c.setSavedPosition(c.links[0], 'work|with|separator', { x: 999.125, y: -8.5 });
    assert.notEqual(c.identityPositions, batch);
    assert.notEqual(c.identityPositions[id(1)], batch[id(1)]);
    assert.deepEqual(plain(batch[id(1)]['work|with|separator']), { x: 0, y: 0 });
    c.applyVisibleTransformsFromPositions();
    assert.equal(tile(0).style.left, '208px'); assert.equal(tile(0).style.top, '0px');
    assert.deepEqual(plain(c.identityPositions[id(1)]['work|with|separator']), { x: 999.125, y: -8.5 });
});

test('missing map, repeated tile and prototype-looking view get a single owned seed', () => {
    const { c, context, document, grid, saves } = page([link(1)], {});
    context.window.categoryNavigation.currentCategory = '__proto__';
    const duplicate = document.createElement('div');
    duplicate.className = 'shortcut-item'; duplicate.dataset.index = '0';
    grid.append(duplicate); // Defensive repeated DOM binding, not duplicate stored identity.
    c.initializeMissingPositions();
    assert.deepEqual(plain(c.identityPositions[id(1)]), { ['__proto__']: { x: 0, y: 0 } });
    assert.equal(Object.keys(saves[0].identified).length, 1);
});

test('Grid and identity migration guards do not enter missing-position batching', () => {
    const { c, context } = page([link(1, { layoutId: undefined }), link(2, { layoutId: undefined, url: 'https://saved1.invalid/' })]);
    c.initializeMissingPositions = () => assert.fail('must not initialize positions');
    c.layout.autoArrange = true;
    c.applyLayoutMode();
    c.layout.autoArrange = false;
    context.window.LocalItabIdentity = Identity;
    const changes = [];
    const controller = { change: patch => changes.push(patch) };
    c.ensureLayoutController = () => controller;
    c.applyLayoutMode();
    assert.deepEqual(plain(changes), [{ autoArrange: false }]);
    c.applyLayoutMode({ persistMissing: false });
    controller.failedChange = {};
    c.applyLayoutMode();
    assert.equal(changes.length, 1, 'failed migration is not silently retried');
});
