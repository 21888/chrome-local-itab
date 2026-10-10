'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const StorageManager = require('../storage.js');
const copy = value => JSON.parse(JSON.stringify(value));
const wrappers = [data => data, data => ({ settings: data }),
    data => ({ version: '1.0', schemaVersion: 1, data }),
    data => ({ version: '1.0', schemaVersion: 1, app: 'local-itab', type: 'backupSnapshot', data })];
const site = category => ({ title: '<img src=x> saved site', url: 'https://example.com/', icon: '🔗', category });

test('settings imports reject explicit duplicate category IDs in every supported legacy envelope', () => {
    const manager = new StorageManager();
    for (const links of [[], [site('same')]]) for (const wrap of wrappers) {
        const payload = wrap({ links, categories: [{ id: 'same', name: 'One' }, { id: 'same', name: 'Two' }] });
        const before = copy(payload);
        assert.throws(() => manager.validateImportPayload(payload), /Invalid backup: duplicate category IDs/);
        assert.deepEqual(payload, before, 'rejection does not repair or partly mutate the input');
    }
    for (const id of [0, false, null, [], {}]) {
        assert.throws(() => manager.validateImportPayload({ links: [], categories: [{ id, name: 'Invalid' }] }), /Invalid backup:/);
    }
});

test('legacy missing and empty IDs get stable unique IDs without capturing explicit IDs or orphan links', () => {
    const manager = new StorageManager();
    // A future built-in ID must also be reserved, even when categories are supplied.
    manager.defaultConfig.categories.push({ id: 'cat_import_3', name: 'Built in', icon: '📁' });
    const data = { links: [site('cat_import_2'), { ...site('work'), url: 'https://example.com/work' }], categories: [
        { name: ' Missing ID ' }, { id: '', name: 'Empty ID', icon: '✨' },
        { id: 'cat_import_1', name: 'Explicit ID appearing later', icon: '1' },
        { id: 'work', name: 'Renamed work', icon: '💼' }
    ] };
    const before = copy(data);
    for (const wrap of wrappers) {
        const result = manager.validateImportPayload(wrap(data));
        assert.deepEqual(result.categories.map(category => category.id), ['cat_import_4', 'cat_import_5', 'cat_import_1', 'work']);
        assert.equal(result.categories[0].name, 'Missing ID');
        assert.equal(result.categories[0].icon, '📁');
        assert.deepEqual(result.links, data.links, 'existing link/category references remain unchanged');
        assert(!result.categories.some(category => category.id === 'cat_import_2'), 'orphan link remains an orphan');
        assert.doesNotThrow(() => manager.validateCategoryBaseline(result.categories));
        assert.deepEqual(manager.validateImportPayload(wrap(data)).categories, result.categories, 'IDs do not depend on time');
        assert.deepEqual(manager.validateImportPayload(manager.buildManualExportPayload(result)), result);
        assert.deepEqual(manager.validateImportPayload(manager.buildDriveBackupPayload(result)), result);
    }
    assert.deepEqual(data, before, 'allocation leaves the caller data unchanged');
});

test('empty and omitted category lists keep their existing semantics, and shortcuts remain required', () => {
    const manager = new StorageManager();
    for (const links of [[], [site('work')]]) {
        const omitted = manager.validateImportPayload({ links });
        assert.deepEqual(omitted.categories, manager.defaultConfig.categories);
        const empty = manager.validateImportPayload({ links, categories: [] });
        assert.deepEqual(empty.categories, []);
        assert.deepEqual(empty.links, links);
        const legacy = manager.validateImportPayload({ links, categories: [{ name: 'One' }, { name: 'Two' }] });
        assert.deepEqual(legacy.categories.map(category => category.id), ['cat_import_1', 'cat_import_2']);
        assert.doesNotThrow(() => manager.validateCategoryBaseline(legacy.categories));
    }
    for (const categories of [undefined, [], [{ name: 'Legacy' }]]) {
        assert.throws(() => manager.validateImportPayload({ categories }), /shortcuts array is required/);
    }
});

test('valid explicit IDs, category references and names survive a settings round trip unchanged', () => {
    const manager = new StorageManager();
    const data = { links: [site('Work'), { ...site('work'), url: 'https://example.com/lower' }], categories: [
        { id: 'Work', name: 'Uppercase', icon: 'A' }, { id: 'work', name: 'Lowercase', icon: 'B' },
        { id: '__proto__', name: '<img src="https://invalid.example/">', icon: '<svg onload=alert(1)>' }
    ] };
    const result = manager.validateImportPayload(data);
    assert.deepEqual(result.links, data.links);
    assert.deepEqual(result.categories, data.categories);
    assert.doesNotThrow(() => manager.validateCategoryBaseline(result.categories));
    assert.deepEqual(manager.validateImportPayload(manager.buildManualExportPayload(result)), result);
});

test('schema-2 import preserves shortcut identities, category references and saved coordinates', () => {
    const manager = new StorageManager(), layoutId = `l_${'a'.repeat(32)}`;
    const data = { links: [{ ...site('cat_import_1'), layoutId }], categories: [{ name: 'Legacy missing ID' }],
        layout: { identityVersion: 1, positions: {}, positionsById: { [layoutId]: { all: { x: 12, y: 34 } } } } };
    const result = manager.validateImportPayload({ schemaVersion: 2, data });
    assert.equal(result.categories[0].id, 'cat_import_2');
    assert.deepEqual(result.links, data.links);
    assert.deepEqual(result.layout.positionsById, data.layout.positionsById);
    assert.deepEqual(manager.validateImportPayload(manager.buildManualExportPayload(result)), result);
    assert.throws(() => manager.validateImportPayload({ schemaVersion: 2, data: { ...data,
        categories: [{ id: 'same', name: 'One' }, { id: 'same', name: 'Two' }] } }), /duplicate category IDs/);
});

test('actual Options import and confirmed storage replacement leave legacy categories editable', async () => {
    const fs = require('node:fs'), vm = require('node:vm');
    const manager = new StorageManager(); manager._syncInitialized = true;
    let state = manager.cloneDefaultConfig(), writes = 0, confirmations = 0;
    const descriptors = new Map(['chrome', 'navigator', 'crypto'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    Object.defineProperty(globalThis, 'chrome', { configurable: true, value: { storage: { local: {
        async get(keys) { return keys === null ? copy(state) : Object.fromEntries(keys.filter(key => Object.hasOwn(state, key)).map(key => [key, copy(state[key])])); },
        async set(values) { writes++; state = { ...state, ...copy(values) }; },
        async remove() { throw new Error('Import must not remove storage'); }
    } } } });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: (name, operation) => operation() } } });
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: require('node:crypto').webcrypto });
    try {
        const feedback = [];
        const context = vm.createContext({ storageManager: manager, URL, Blob,
            document: { addEventListener() {}, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; } },
            window: {}, console: { error() {}, log() {}, warn() {} }, setTimeout() {},
            confirm() { confirmations++; return true; }, localStorage: { getItem() { return null; } } });
        vm.runInContext(fs.readFileSync('options.js', 'utf8'), context);
        context.showImportExportFeedback = (operation, status, message) => feedback.push({ operation, status, message });
        const legacy = { links: [site('work')], categories: [{ name: 'One' }, { id: '', name: 'Two' }, { id: 'work', name: 'Work' }] };
        const importFile = data => context.importSettings({ name: 'fixture.json', size: 200, text: async () => JSON.stringify(data) });
        await importFile(legacy);
        assert.equal(feedback.at(-1).status, 'success'); assert.equal(confirmations, 1); assert.equal(writes, 1);
        const baseline = copy(state.categories);
        assert.deepEqual(baseline.map(category => category.id), ['cat_import_1', 'cat_import_2', 'work']);
        const edited = baseline.map((category, index) => ({ ...category, name: index ? category.name : 'Edited after import' }));
        assert.equal(await manager.set('categories', edited, { expectedCategories: baseline }), true);
        assert.deepEqual(state.categories, edited);
        const beforeRejection = copy(state), previousWrites = writes;
        await importFile({ links: [], categories: [{ id: 'same', name: 'One' }, { id: 'same', name: 'Two' }] });
        assert.equal(feedback.at(-1).status, 'error'); assert.match(feedback.at(-1).message, /duplicate category IDs/);
        assert.equal(confirmations, 1); assert.equal(writes, previousWrites);
        assert.deepEqual(state, beforeRejection, 'rejection preserves settings and previous recovery data');
    } finally {
        for (const [key, descriptor] of descriptors) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
        }
    }
});
