const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const api = require('../shared/local-tasks-store.js');
// Staging default is the exact, unmodified PM-07 storage.js snapshot, not a reimplementation.
// Integration: ITAB_SOURCE_ROOT=/path/to/chrome-local-itab ITAB_REQUIRE_RESET_RETENTION=1 node --test ...
const integrated = fs.existsSync(path.resolve(__dirname, '../storage.js'));
const project = process.env.ITAB_SOURCE_ROOT || path.resolve(__dirname, integrated ? '..' : '../source-model');
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

for (const enabled of [false, true]) test(`real adapter isolates every content action; Sync enabled=${enabled}`, async () => {
    const h = harness(enabled); const oldChrome = global.chrome; const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    global.chrome = h.chrome; Object.defineProperty(globalThis, 'navigator', { value: { locks: h.locks }, configurable: true });
    try {
        const manager = new StorageManager(), counts = {};
        for (const method of ['ensureSyncInitialized', 'scheduleSyncPush', 'pushToSync', 'cancelSyncPush', 'disableRemoteSync']) {
            const original = manager[method]; manager[method] = function (...args) { counts[method] = (counts[method] || 0) + 1; return original.apply(this, args); };
        }
        const unrelatedTimer = { pending: true }; manager._syncPushTimer = unrelatedTimer;
        const previousProvider = clone(h.local().sync);
        const store = new api.Store(api.createChromeBackend(h.chrome, h.locks));
        let state = await store.mutate(store.request('enable', { enabled: true }));
        const sentinels = ['ACTIVE_PRIVATE_SENTINEL', 'DONE_PRIVATE_SENTINEL', 'REMOVED_PRIVATE_SENTINEL', 'PINNED_PRIVATE_SENTINEL', 'RECOVERY_PRIVATE_SENTINEL'];
        for (const text of sentinels) state = await store.mutate(store.request('add', { text }));
        const req = (kind, task, rest) => store.request(kind, { id: task.id, version: task.version, ...rest });
        state = await store.mutate(req('complete', state.records[1]));
        state = await store.mutate(req('remove', state.records[2]));
        state = await store.mutate(req('pin', state.records[3], { expectedPin: null }));
        const file = await store.export(); state = await store.mutate(store.request('replace', await store.review(file)));
        state = await store.mutate(req('edit', state.records[0], { text: sentinels[0] + '_EDIT' }));
        state = await store.mutate(req('move', state.records[0], { order: state.records.filter(t => t.state === 'active').map(t => t.id), direction: 1 }));
        state = await store.mutate(req('restore', state.records.find(t => t.state === 'removed')));
        state = await store.mutate(req('reopen', state.records.find(t => t.state === 'done')));
        state = await store.mutate(store.request('recover', { id: state.recovery[0].id, revision: state.revision }));
        state = await store.mutate(store.request('enable', { enabled: false }));
        assert.deepEqual(counts, {}, 'content cannot initialize, schedule, cancel, clear compatibility, or invoke any provider');
        assert.deepEqual(h.remoteCalls, []); assert.equal(manager._syncPushTimer, unrelatedTimer);
        assert.deepEqual(h.local().sync, previousProvider);
        assert(h.localCalls.every(values => Object.keys(values).length === 1 && Object.hasOwn(values, api.KEY)), 'every write has only the personal key');
        const fullRaw = h.local();
        for (const payload of [manager.sanitizeConfigForBackup(fullRaw), manager.buildManualExportPayload(fullRaw), manager.buildDriveBackupPayload(fullRaw), manager.prepareSyncPayload(fullRaw), await manager.makeRecovery(fullRaw, 'beforeRestore')]) {
            const serialized = JSON.stringify(payload);
            for (const sentinel of sentinels) assert(!serialized.includes(sentinel));
            assert(!serialized.includes(api.KEY));
        }
        const savedContent = clone(fullRaw[api.KEY]);
        // Explicit provider work uses real source; backend is synthetic, no account or network.
        manager._syncPushTimer = null;
        await manager.ensureSyncInitialized();
        if (enabled) await manager.pushToSync();
        for (const sentinel of sentinels) assert(!JSON.stringify(h.remoteCalls).includes(sentinel), 'initialization/explicit upload excludes every personal state');
        assert.deepEqual(h.local()[api.KEY], savedContent);
        const restored = manager.prepareRestoredConfig(manager.buildManualExportPayload(manager.cloneDefaultConfig()), { sync: previousProvider });
        assert.equal(await manager.setAll(restored, { skipSyncInitialization: true, skipSyncSideEffects: true, confirmedRestore: true }), true);
        assert.deepEqual(h.local()[api.KEY], savedContent, 'actual generic settings restore preserves exact task/recovery state');

    } finally {
        global.chrome = oldChrome; if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator); else delete globalThis.navigator;
    }
});

test('integrated settings reset retains personal content and recovery exactly', { skip: !integrated && process.env.ITAB_REQUIRE_RESET_RETENTION !== '1' ? 'PM-07 snapshot intentionally lacks the required Tasks reset integration. Enable this gate against integrated source.' : false }, async () => {
    const h = harness(false); const oldChrome = global.chrome, oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    global.chrome = h.chrome; Object.defineProperty(globalThis, 'navigator', { value: { locks: h.locks }, configurable: true });
    try {
        const store = new api.Store(api.createChromeBackend(h.chrome, h.locks)); await store.mutate(store.request('add', { text: 'RESET_PRIVATE_SENTINEL' }));
        await store.mutate(store.request('replace', await store.review(await store.export())));
        const before = clone(h.local()[api.KEY]), manager = new StorageManager();
        assert.equal(await manager.clear(), true); assert.deepEqual(h.local()[api.KEY], before);
    } finally { global.chrome = oldChrome; Object.defineProperty(globalThis, 'navigator', oldNavigator); }
});
