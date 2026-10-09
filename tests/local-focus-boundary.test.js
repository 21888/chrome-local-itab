const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const api = require('../shared/local-focus-store.js');
// Default deliberately checks the actual current production baseline.
// To validate proposed integration: ITAB_SOURCE_ROOT=/path/to/integration-model node --test ...
const integrated = fs.existsSync(path.resolve(__dirname, '../storage.js'));
const project = process.env.ITAB_SOURCE_ROOT || path.resolve(__dirname, integrated ? '..' : '../../chrome-local-itab');
const StorageManager = require(path.join(project, 'storage.js'));
const clone = value => structuredClone(value);
function harness(enabled) {
    let local = { sync: { enabled, lastSync: 'untouched', lastError: 'untouched', includeLargeAssets: false } }, remote = {};
    const listeners = new Set(), queues = new Map(), remoteCalls = [], localCalls = [];
    const locks = { request(name, options, fn) { fn ||= options; const next = (queues.get(name) || Promise.resolve()).then(fn); queues.set(name, next.catch(() => {})); return next; } };
    const area = (name, getData) => ({
        async get(keys) {
            if (name === 'sync') remoteCalls.push(['get', clone(keys)]);
            const data = getData(); if (keys === null) return clone(data);
            return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => k in data).map(k => [k, clone(data[k])]));
        },
        async set(values) {
            if (name === 'sync') remoteCalls.push(['set', clone(values)]); else localCalls.push(clone(values));
            const data = getData(), changes = {}; for (const [key, value] of Object.entries(values)) { changes[key] = { oldValue: clone(data[key]), newValue: clone(value) }; data[key] = clone(value); }
            listeners.forEach(fn => fn(changes, name));
        },
        async remove(keys) { const data = getData(); for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]; },
        async getBytesInUse() { return 0; }, QUOTA_BYTES_PER_ITEM: 8192
    });
    const chrome = { storage: { local: area('local', () => local), sync: area('sync', () => remote), onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } }, runtime: { getManifest: () => ({ version: '1.1.5' }) } };
    return { chrome, locks, local: () => local, remoteCalls, localCalls };
}


for (const enabled of [false, true]) test(`timer actions stay local, Sync enabled=${enabled}`, async () => {
    const h = harness(enabled), oldChrome = global.chrome, oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    global.chrome = h.chrome; Object.defineProperty(globalThis, 'navigator', { value: { locks: h.locks }, configurable: true });
    try {
        const manager = new StorageManager(), counts = {};
        for (const method of ['ensureSyncInitialized', 'scheduleSyncPush', 'pushToSync', 'cancelSyncPush', 'disableRemoteSync']) {
            const original = manager[method]; manager[method] = function (...args) { counts[method] = (counts[method] || 0) + 1; return original.apply(this, args); };
        }
        const originalConsoleError = console.error; console.error = () => {};
        try {
            await assert.rejects(manager.set(api.KEY, api.initial()), { code: 'PERSONAL_CONTENT_BOUNDARY' });
            await assert.rejects(manager.setAll({ [api.KEY]: api.initial() }), { code: 'PERSONAL_CONTENT_BOUNDARY' });
        } finally { console.error = originalConsoleError; }
        assert.deepEqual(counts, {}); assert.deepEqual(h.localCalls, []);
        const timer = {}; manager._syncPushTimer = timer; const preferences = clone(h.local().sync);
        let now = 1700000000000;
        const store = new api.Store(api.createChromeBackend(h.chrome, h.locks), { now: () => now, id: () => 'PRIVATE_SESSION_SENTINEL' });
        let state = await store.read();
        const run = async (kind, value) => state = await store.mutate({ kind, value, revision: state.revision });
        await run('visibility', true); await run('duration', 1); await run('start'); now += 1000;
        await run('pause'); await run('resume'); await run('uncertain'); await run('reset');
        await run('phase', 'break'); await run('start'); now += 300001; await run('complete'); await run('visibility', false);
        assert.deepEqual(counts, {}); assert.deepEqual(h.remoteCalls, []); assert.equal(manager._syncPushTimer, timer);
        assert.deepEqual(h.local().sync, preferences); assert(h.localCalls.every(value => Object.keys(value).length === 1 && Object.hasOwn(value, api.KEY)));
        for (const payload of [manager.sanitizeConfigForBackup(h.local()), manager.buildManualExportPayload(h.local()), manager.buildDriveBackupPayload(h.local()), manager.prepareSyncPayload(h.local()), await manager.makeRecovery(h.local(), 'beforeRestore')]) {
            assert(!JSON.stringify(payload).includes('PRIVATE_SESSION_SENTINEL')); assert(!JSON.stringify(payload).includes(api.KEY));
        }
        const saved = clone(h.local()[api.KEY]); manager._syncPushTimer = null;
        await manager.ensureSyncInitialized(); if (enabled) await manager.pushToSync();
        assert(!JSON.stringify(h.remoteCalls).includes('PRIVATE_SESSION_SENTINEL')); assert(!JSON.stringify(h.remoteCalls).includes(api.KEY));
        const restored = manager.prepareRestoredConfig(manager.buildManualExportPayload(manager.cloneDefaultConfig()), { sync: preferences });
        assert.equal(await manager.setAll(restored, { skipSyncInitialization: true, skipSyncSideEffects: true, confirmedRestore: true }), true);
        assert.deepEqual(h.local()[api.KEY], saved); assert.equal(await manager.clear(), true); assert.deepEqual(h.local()[api.KEY], saved);
    } finally { global.chrome = oldChrome; if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator); else delete globalThis.navigator; }
});
