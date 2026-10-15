// Synthetic adapter faults only; no browser, profile, provider or network access.
'use strict';
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const path = require('node:path');
const root = process.env.ITAB_LAYOUT_SOURCE_ROOT || path.resolve(__dirname, '../..');
const S = require(path.join(root, 'storage'));
const W = require(path.join(root, 'shared/workspaces'));
const I = require(path.join(root, 'shared/layout-identity'));
const clone = structuredClone;
const recoveryKey = '__localItabIdentityRecovery';
const generationKey = '__localItabLayoutGeneration';
async function run(input) {
    const { mode, workspace, phase } = input;
    const url = 'https://example.com/shared';
    const initial = input.initial || { schemaVersion: 1, quote: 'Synthetic original',
        links: ['A', 'B'].map(title => ({ title, url, icon: '🌐', category: 'work' })),
        layout: { autoArrange: false, alignToGrid: false, gridSize: 96, columns: 6,
            positions: { [`all|${url}`]: { x: 37.125, y: -5.75 }, [`hidden|view|${url}`]: { x: 909.25, y: 301.5 } } },
        sync: { enabled: false }, __syntheticOpaque: { keep: ['all', 'raw', 'values'] } };
    const raw = clone(input.raw || initial), writes = [];
    let fault = false, written, scopedKey;
    const locks = { request: async (name, options, action) => (action || options)() };
    const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reorder(v)])) : value;
    const local = {
        async get(keys) {
            if (fault && written && mode === 'readfail') throw Error('synthetic read failure');
            return keys == null ? clone(raw) : Object.fromEntries(keys.filter(k => Object.hasOwn(raw, k)).map(k => [k, clone(raw[k])]));
        },
        async set(values) {
            writes.push(clone(values));
            if (!fault) { Object.assign(raw, clone(values)); return; }
            written = clone(values);
            if (mode === 'reject') throw Error('synthetic precommit rejection');
            if (mode === 'drop') return;
            Object.assign(raw, mode === 'reorder' ? reorder(clone(values)) : clone(values));
            const target = workspace ? raw[scopedKey].values : raw;
            if (mode === 'corrupt') target.links[1].layoutId = 'synthetic-invalid';
            if (mode === 'schema') target.schemaVersion = 99;
            if (mode === 'generation') target[generationKey] = 'synthetic-other';
            if (mode === 'layout') target.layout.columns = 11;
            if (mode === 'recovery') target[recoveryKey].payload.data.quote = 'synthetic-altered';
            if (mode === 'after') throw Error('synthetic postcommit rejection');
        },
        async remove() { assert.fail('No removals allowed'); },
        async clear() { assert.fail('No clearing allowed'); },
        async getBytesInUse() { return JSON.stringify(raw).length; }, QUOTA_BYTES: 10485760
    };
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks } });
    globalThis.chrome = { storage: { local, sync: { get() { assert.fail('No sync'); }, set() { assert.fail('No sync'); } } }, runtime: { getManifest: () => ({ version: '1.1.155' }) } };
    let session;
    if (workspace) {
        const wm = W.createManager({ chrome, locks });
        await wm.ready(); session = wm.capture(); await session.ready();
        scopedKey = W.bundleKey(raw[W.REGISTRY_KEY].workspaces[0]);
    }
    const s = new S({ workspace: session }); s._syncInitialized = true;
    if (input.preallocate && phase !== 'restart') await s.applyLayoutPatch({ autoArrange: false }, {}, await s.getLayoutSnapshotForUpdate());
    const before = clone(raw); writes.length = 0;
    const values = () => workspace ? raw[scopedKey].values : raw;
    if (phase === 'restart') {
        if (mode === 'corrupt' || mode === 'schema') {
            if (workspace || mode === 'corrupt') await assert.rejects(() => s.getAll());
            await assert.rejects(async () => s.applyLayoutPatch({ autoArrange: false }, {}, await s.getLayoutSnapshotForUpdate()));
            assert.equal(writes.length, 0); assert.deepEqual(raw, before);
        } else {
            if (mode === 'drop' || mode === 'reject') await s.applyLayoutPatch({ autoArrange: false }, {}, await s.getLayoutSnapshotForUpdate());
            I.validateBundle(values());
            assert.equal(new Set(values().links.map(l => l.layoutId)).size, 2);
            assert.deepEqual(values().layout.positions, initial.layout.positions);
            const backup = await s.getRecoveryBackup('original');
            assert.deepEqual(backup.data.links, initial.links); assert.deepEqual(backup.data.layout, initial.layout);
        }
    } else {
        const baseline = await s.getLayoutSnapshotForUpdate(); fault = true;
        const operation = () => s.applyLayoutPatch({ autoArrange: false }, {}, baseline);
        if (mode === 'success' || mode === 'reorder') {
            const result = await operation();
            assert.deepEqual(result.links, values().links); assert.deepEqual(result.layout, values().layout);
        } else {
            await assert.rejects(operation, error => workspace || ['reject', 'after'].includes(mode) || (error.code === 'LAYOUT_UNVERIFIED' && error.mayHaveCommitted === true));
        }
        fault = false;
        assert.equal(writes.length, 1, 'exactly one attempt; no rollback or automatic retry');
        if (mode === 'drop' || mode === 'reject') assert.deepEqual(raw, before);
        if (mode === 'corrupt' || mode === 'after') {
            const checkpoint = clone(raw), attempts = writes.length;
            await assert.rejects(() => s.applyLayoutPatch({ columns: 7 }, {}, baseline));
            assert.deepEqual(raw, checkpoint); assert.equal(writes.length, attempts);
        }
        if (!['drop', 'reject', 'recovery'].includes(mode)) {
            const backup = await s.getRecoveryBackup('original');
            assert.deepEqual(backup.data.links, initial.links); assert.deepEqual(backup.data.layout, initial.layout);
        }
    }
    if (workspace) for (const [key, value] of Object.entries(initial)) assert.deepEqual(raw[key], value, `original root ${key}`);
    else for (const [key, value] of Object.entries(initial)) if (!['links', 'layout', 'schemaVersion'].includes(key)) assert.deepEqual(raw[key], value);
    return { raw, initial, mode, workspace, phase: 'restart' };
}
if (require.main === module) {
    let input = ''; process.stdin.on('data', chunk => input += chunk);
    process.stdin.on('end', () => run(JSON.parse(input)).then(result => process.stdout.write(JSON.stringify(result))).catch(error => { console.error(error); process.exitCode = 1; }));
}
