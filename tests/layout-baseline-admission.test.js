// Synthetic public-adapter admission tests. Browser durability is not modeled.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const S = require('../storage');
const W = require('../shared/workspaces');
const clone = structuredClone;
const canonical = { autoArrange: true, alignToGrid: false, columns: 6, gridSize: 96,
    positions: { 'hidden|https://example.com/synthetic': { x: 37.125, y: -5.75 } } };

async function fixture(t, workspace) {
    const oldChrome = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
    const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const oldCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    t.after(() => {
        for (const [key, descriptor] of [['chrome', oldChrome], ['navigator', oldNavigator], ['crypto', oldCrypto]]) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    });
    const raw = { schemaVersion: 1, links: [{ title: 'Synthetic', url: 'https://example.com/synthetic', icon: '🌐', category: 'work' }],
        layout: clone(canonical), quote: 'Synthetic untouched value', sync: { enabled: false },
        __localItabLayoutGeneration: 'synthetic-stable-generation', __syntheticOpaque: { keep: ['all', 'raw', 'values'] } };
    const writes = [];
    const locks = { request: async (name, options, action) => (action || options)() };
    const local = {
        get: async keys => keys === null ? clone(raw) : Object.fromEntries(keys.filter(k => Object.hasOwn(raw, k)).map(k => [k, clone(raw[k])])),
        set: async values => { writes.push(clone(values)); Object.assign(raw, clone(values)); },
        remove: async () => assert.fail('Unexpected removal'), clear: async () => assert.fail('Unexpected clear'),
        getBytesInUse: async () => JSON.stringify(raw).length, QUOTA_BYTES: 10485760
    };
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks } });
    Object.defineProperty(globalThis, 'chrome', { configurable: true, value: {
        storage: { local, sync: { get() { assert.fail('No sync'); }, set() { assert.fail('No sync'); } } },
        runtime: { getManifest: () => ({ version: '1.1.155' }) }
    } });
    let session, scopedKey;
    if (workspace) {
        const manager = W.createManager({ chrome, locks }); await manager.ready(); session = manager.capture(); await session.ready();
        scopedKey = W.bundleKey(raw[W.REGISTRY_KEY].workspaces[0]);
    }
    const storage = new S({ workspace: session }); storage._syncInitialized = true;
    const baseline = await storage.getLayoutSnapshotForUpdate();
    writes.length = 0;
    return { storage, raw, writes, baseline, scopedKey, values: () => scopedKey ? raw[scopedKey].values : raw };
}

const invalid = [
    ['columns below minimum', { columns: 0 }], ['columns negative', { columns: -1 }],
    ['columns above maximum', { columns: 11 }], ['columns fractional', { columns: 6.25 }],
    ['columns near minimum', { columns: 0.999 }], ['columns near maximum', { columns: 10.001 }],
    ['columns huge', { columns: 1e100 }], ['grid below minimum', { gridSize: 47.999 }],
    ['grid above maximum', { gridSize: 240.001 }], ['grid negative', { gridSize: -1 }],
    ['grid huge', { gridSize: 1e100 }], ['both need normalization', { columns: 11, gridSize: 300 }],
    ['columns string', { columns: '6' }], ['columns null', { columns: null }],
    ['grid string', { gridSize: '96' }], ['grid null', { gridSize: null }]
];
for (const workspace of [false, true]) {
    const adapter = workspace ? 'workspace' : 'compatibility';
    for (const [name, fields] of invalid) test(`${adapter} refuses saved ${name} without writes`, async t => {
        const h = await fixture(t, workspace);
        Object.assign(h.values().layout, fields);
        const before = clone(h.raw);
        const unchanged = () => { assert.deepEqual(h.writes, []); assert.deepEqual(h.raw, before); };
        await assert.rejects(() => h.storage.getLayoutSnapshotForUpdate(), /Stored layout settings are invalid/);
        unchanged();
        // A previously captured baseline cannot bypass the locked reread,
        // even when the requested patch would repair the invalid persisted field.
        let callbacks = 0;
        for (const patch of [{ gridSize: 120 }, {}, { columns: 6, gridSize: 96 }]) {
            await assert.rejects(() => h.storage.applyLayoutPatch(patch, {}, h.baseline, () => callbacks++), /Stored layout settings are invalid/);
            assert.equal(callbacks, 0); unchanged();
        }
    });

    const valid = [
        ['canonical', clone(canonical)], ['minimums', { ...canonical, columns: 1, gridSize: 48 }],
        ['maximums', { ...canonical, columns: 10, gridSize: 240 }],
        ['fractional grid', { ...canonical, columns: 7, gridSize: 96.125 }],
        ['missing columns', { autoArrange: true, gridSize: 96, positions: clone(canonical.positions) }],
        ['missing grid', { autoArrange: true, columns: 6, positions: clone(canonical.positions) }],
        ['missing numeric fields', { autoArrange: true, positions: clone(canonical.positions) }],
        ['empty legacy layout', {}], ['missing legacy layout', undefined]
    ];
    for (const [name, layout] of valid) test(`${adapter} accepts ${name} read-only until explicit edit`, async t => {
        const h = await fixture(t, workspace);
        if (layout === undefined) delete h.values().layout;
        else h.values().layout = clone(layout);
        const before = clone(h.raw);
        const baseline = await h.storage.getLayoutSnapshotForUpdate();
        const expectedLayout = h.storage.validateLayoutConfig(layout || h.storage.defaultConfig.layout);
        assert.deepEqual(baseline.layout, expectedLayout);
        assert.deepEqual(h.writes, []); assert.deepEqual(h.raw, before);
        const result = await h.storage.applyLayoutPatch({ gridSize: 120 }, {}, baseline);
        assert.equal(h.writes.length, 1);
        assert.deepEqual(h.values().layout, { ...expectedLayout, gridSize: 120 });
        assert.deepEqual(result.layout, h.values().layout);
        const expected = clone(before);
        if (h.scopedKey) expected[h.scopedKey].values.layout = clone(h.values().layout);
        else expected.layout = clone(h.values().layout);
        assert.deepEqual(h.raw, expected, 'only the explicit layout edit changes persisted state');
    });

    test(`${adapter} preserves caller patch normalization on valid saved layout`, async t => {
        const h = await fixture(t, workspace);
        for (const [patch, expected] of [
            [{ columns: 11, gridSize: 300 }, { columns: 10, gridSize: 240 }],
            [{ columns: 0, gridSize: 30 }, { columns: 1, gridSize: 48 }],
            [{ columns: 6.25, gridSize: 96.125 }, { columns: 6, gridSize: 96.125 }]
        ]) {
            const fresh = await h.storage.getLayoutSnapshotForUpdate();
            const result = await h.storage.applyLayoutPatch(patch, {}, fresh);
            assert.deepEqual(result.layout, { ...canonical, ...expected });
        }
        assert.equal(h.writes.length, 3);
    });
}
