// Synthetic adapter faults only; no browser, profile, provider or network access.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
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
    const startup = clone(raw);
    let fault = false, written, scopedKey, baseline = input.baseline;
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
            if (mode === 'layout-valid') target.layout.columns = 9;
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
    const restarting = phase.startsWith('restart');
    if (restarting || input.raw) {
        assert.equal(writes.length, 0, 'reconstructing saved state must not write defaults or retry');
        assert.deepEqual(raw, startup, 'startup preserves the complete persisted checkpoint');
    }
    if (input.preallocate && !restarting) await s.applyLayoutPatch({ autoArrange: false }, {}, await s.getLayoutSnapshotForUpdate());
    const before = clone(raw); writes.length = 0;
    const values = () => workspace ? raw[scopedKey].values : raw;
    const originalRecovery = async () => {
        const backup = await s.getRecoveryBackup('original');
        assert.deepEqual(backup.data.links, initial.links);
        assert.deepEqual(backup.data.layout, initial.layout);
    };
    const validIdentities = () => {
        I.validateBundle(values());
        assert.equal(new Set(values().links.map(l => l.layoutId)).size, 2);
        assert.deepEqual(values().layout.positions, initial.layout.positions);
    };
    const unchanged = () => {
        assert.equal(writes.length, 0, 'no rollback, default write, or automatic retry after restart');
        assert.deepEqual(raw, before, 'read/stale baseline preserves every raw key and value');
    };
    let result;
    if (phase === 'prepare') {
        baseline = await s.getLayoutSnapshotForUpdate();
        unchanged();
    } else if (restarting) {
        // All restart inputs are complete JSON checkpoints, never live objects.
        // The old baseline belongs to the process before the ambiguous write.
        if (input.pid) assert.notEqual(process.pid, input.pid);
        if (mode === 'corrupt' || (workspace && ['schema', 'layout'].includes(mode))) await assert.rejects(() => s.getAll());
        else {
            const current = await s.getAll();
            assert.equal(current.quote, initial.quote);
            assert.deepEqual(current.links, values().links);
            assert.deepEqual(current.layout.positions, initial.layout.positions);
        }
        if (mode === 'recovery') {
            await assert.rejects(() => s.getRecoveryBackup('original'), /integrity check failed/);
            assert.deepEqual(values()[recoveryKey], workspace ? before[scopedKey].values[recoveryKey] : before[recoveryKey]);
        } else if (!['drop', 'reject'].includes(mode)) await originalRecovery();
        if (baseline && !['drop', 'reject'].includes(mode)) {
            await assert.rejects(() => s.applyLayoutPatch({ columns: 7 }, {}, baseline), error =>
                error.code === (['corrupt', 'schema'].includes(mode) ? 'LAYOUT_IDENTITY_INVALID' : 'LAYOUT_CONTEXT_CHANGED'));
        }
        if (mode === 'corrupt' || mode === 'schema') {
            await assert.rejects(async () => s.applyLayoutPatch({ autoArrange: false }, {}, await s.getLayoutSnapshotForUpdate()));
        }
        unchanged();
        if (phase !== 'restart-read' && !['corrupt', 'schema', 'layout'].includes(mode)) {
            // This is a new, explicit operation after a fresh read. A changed but
            // valid generation/layout and an invalid retained recovery are not
            // durable operation receipts and do not permanently lock all edits.
            const fresh = await s.getLayoutSnapshotForUpdate();
            result = await s.applyLayoutPatch({ gridSize: 120 }, {}, fresh);
            assert.equal(writes.length, 1, 'one explicit fresh operation, no retry');
            validIdentities();
            assert.deepEqual(result.links, values().links);
            assert.deepEqual(result.layout, values().layout);
            const expected = clone(before);
            Object.assign(expected, clone(writes[0]));
            assert.deepEqual(raw, expected, 'only the explicitly submitted update may change the checkpoint');
            if (!['drop', 'reject'].includes(mode)) {
                const prior = workspace ? before[scopedKey].values : before;
                assert.deepEqual(values().links, prior.links);
                assert.deepEqual(values()[recoveryKey], prior[recoveryKey], 'never repair or replace the retained recovery');
                assert.equal(values()[generationKey], prior[generationKey]);
                assert.deepEqual(values().layout, { ...prior.layout, gridSize: 120 });
            }
            if (mode === 'recovery') await assert.rejects(() => s.getRecoveryBackup('original'), /integrity check failed/);
            else await originalRecovery();
        }
        // columns=11 remains a separately reported admission/normalization gap:
        // this matrix proves only unchanged reads and stale-baseline rejection
        // for that case, not that a newly read baseline refuses all mutation.
    } else {
        baseline = baseline || await s.getLayoutSnapshotForUpdate(); fault = true;
        const operation = () => s.applyLayoutPatch({ autoArrange: false }, {}, baseline);
        if (mode === 'success' || mode === 'reorder') {
            result = await operation();
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
        if (!['drop', 'reject', 'recovery'].includes(mode)) await originalRecovery();
    }
    if (workspace) {
        for (const [key, value] of Object.entries(initial)) assert.deepEqual(raw[key], value, `original root ${key}`);
        assert.deepEqual(raw[W.SNAPSHOT_KEY].values, initial, 'the complete pre-migration snapshot stays intact');
        // Exclude only the active bundle from the exact full-root comparison.
        for (const [key, value] of Object.entries(before)) if (key !== scopedKey) assert.deepEqual(raw[key], value, `unrelated root ${key}`);
    } else for (const [key, value] of Object.entries(initial)) if (!['links', 'layout', 'schemaVersion'].includes(key)) assert.deepEqual(raw[key], value);
    return { raw, initial, mode, workspace, before, baseline, writes, result, pid: process.pid,
        phase: phase === 'prepare' ? 'fault' : 'restart' };
}
if (require.main === module) {
    const execute = input => run(JSON.parse(input)).then(result => process.stdout.write(JSON.stringify(result))).catch(error => { console.error(error); process.exitCode = 1; });
    if (process.argv[2]) execute(fs.readFileSync(process.argv[2], 'utf8'));
    else {
        let input = ''; process.stdin.on('data', chunk => input += chunk);
        process.stdin.on('end', () => execute(input));
    }
}
