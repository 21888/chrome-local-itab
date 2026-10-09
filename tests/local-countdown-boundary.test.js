const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const api = require('../shared/local-countdown-store.js');
// Default deliberately checks the actual current production baseline.
// To validate proposed integration: ITAB_SOURCE_ROOT=/path/to/integration-model node --test ...
const integrated = fs.existsSync(path.resolve(__dirname, '../storage.js'));
const project = process.env.ITAB_SOURCE_ROOT || path.resolve(__dirname, integrated ? '..' : '../../chrome-local-itab');
const StorageManager = require(path.join(project, 'storage.js'));
const clone = value => structuredClone(value);
const sentinel = 'PRIVATE_COUNTDOWN_任务_🔒_<script>_DO_NOT_SHARE';
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


for (const enabled of [false, true]) test(`countdown edits stay local, Sync enabled=${enabled}`, async () => {
    const h = harness(enabled), oldChrome = global.chrome, oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    global.chrome = h.chrome; Object.defineProperty(globalThis, 'navigator', { value: { locks: h.locks }, configurable: true });
    try {
        const manager = new StorageManager(), counts = {};
        for (const method of ['ensureSyncInitialized', 'scheduleSyncPush', 'pushToSync', 'cancelSyncPush', 'disableRemoteSync']) {
            const original = manager[method]; manager[method] = function (...args) { counts[method] = (counts[method] || 0) + 1; return original.apply(this, args); };
        }
        const originalConsoleError = console.error; console.error = () => {};
        try {
            await assert.rejects(manager.get(api.KEY), { code: 'PERSONAL_CONTENT_BOUNDARY' });
            await assert.rejects(manager.writeLocalValues({ [api.KEY]: api.initial() }), { code: 'PERSONAL_CONTENT_BOUNDARY' });
            await assert.rejects(manager.set(api.KEY, api.initial()), { code: 'PERSONAL_CONTENT_BOUNDARY' });
            await assert.rejects(manager.setAll({ quote: 'must not be partially written', [api.KEY]: api.initial() }), { code: 'PERSONAL_CONTENT_BOUNDARY' });
        } finally { console.error = originalConsoleError; }
        assert.deepEqual(counts, {}); assert.deepEqual(h.localCalls, []);
        const timer = {}; manager._syncPushTimer = timer; const preferences = clone(h.local().sync);
        const store = new api.Store(api.createChromeBackend(h.chrome, h.locks));
        let state = await store.read();
        const run = async (kind, value) => state = await store.mutate({ kind, value, revision: state.revision });
        await run('save', {enabled:true,title:sentinel,targetDate:'2027-01-01'});
        await run('visibility', false);
        await run('visibility', true);
        assert.equal((await store.read()).title, sentinel);
        assert.deepEqual(counts, {}); assert.deepEqual(h.remoteCalls, []); assert.equal(manager._syncPushTimer, timer);
        assert.deepEqual(h.local().sync, preferences); assert(h.localCalls.every(value => Object.keys(value).length === 1 && Object.hasOwn(value, api.KEY)));
        for (const payload of [manager.validateConfigObject(h.local()), manager.sanitizeConfigForBackup(h.local()), manager.buildManualExportPayload(h.local()), manager.buildDriveBackupPayload(h.local()), manager.prepareSyncPayload(h.local()), await manager.makeRecovery(h.local(), 'beforeRestore')]) {
            assert(!JSON.stringify(payload).includes(sentinel)); assert(!JSON.stringify(payload).includes(api.KEY));
        }
        // Settings owns neither validation nor reconstruction of this opaque record.
        h.local()[api.KEY].futurePrivateField = { recovery: sentinel, corrupt: true };
        const saved = clone(h.local()[api.KEY]); manager._syncPushTimer = null;
        await manager.ensureSyncInitialized(); if (enabled) await manager.pushToSync();
        assert(!JSON.stringify(h.remoteCalls).includes(sentinel)); assert(!JSON.stringify(h.remoteCalls).includes(api.KEY));
        const restored = manager.prepareRestoredConfig(manager.buildManualExportPayload(manager.cloneDefaultConfig()), { sync: preferences });
        assert.equal(await manager.setAll(restored, { skipSyncInitialization: true, skipSyncSideEffects: true, confirmedRestore: true }), true);
        assert.deepEqual(h.local()[api.KEY], saved);
        const imported = manager.validateImportPayload({ links: [], [api.KEY]: { content: 'untrusted replacement' } });
        assert.equal(await manager.setAll(imported, { skipSyncInitialization: true, skipSyncSideEffects: true, confirmedRestore: true }), true);
        assert.deepEqual(h.local()[api.KEY], saved);
        const drive = manager.buildDriveBackupPayload(h.local());
        const driveRestore = manager.prepareRestoredConfig(drive, { sync: preferences });
        assert.equal(await manager.setAll(driveRestore, { skipSyncInitialization: true, skipSyncSideEffects: true, confirmedRestore: true }), true);
        assert.deepEqual(h.local()[api.KEY], saved);
        const payload = manager.prepareSyncPayload(manager.cloneDefaultConfig()).payload;
        await manager.acceptSyncSnapshot({ payload, validated: manager.validateConfigObject(payload), schema: 1,
            fingerprint: await manager.fingerprint({ schema: 1, payload }), revision: 'remote-current',
            meta: { enabled: true, updatedAt: '2026-10-09T12:00:00Z' } }, { confirmedReplacement: true });
        assert.deepEqual(h.local()[api.KEY], saved);
        assert(!JSON.stringify(h.local()[manager.restoreRecoveryKey]).includes(sentinel));
        assert.equal(await manager.clear(), true); assert.deepEqual(h.local()[api.KEY], saved);
    } finally { global.chrome = oldChrome; if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator); else delete globalThis.navigator; }
});

for (const failure of ['set', 'remove']) test(`failed settings reset preserves opaque countdown (${failure})`, async () => {
    const h = harness(false), oldChrome = global.chrome, oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator'), oldError = console.error;
    global.chrome = h.chrome; Object.defineProperty(globalThis, 'navigator', { value: { locks: h.locks }, configurable: true });
    console.error = () => {};
    try {
        const manager = new StorageManager(), privateRecord = { content: sentinel, future: { recovery: sentinel }, invalidButPreserved: true };
        Object.assign(h.local(), manager.cloneDefaultConfig(), { [api.KEY]: clone(privateRecord) });
        h.chrome.storage.local[failure] = async () => { throw new Error('synthetic storage failure'); };
        assert.equal(await manager.clear(), false);
        assert.deepEqual(h.local()[api.KEY], privateRecord);
    } finally {
        console.error = oldError; global.chrome = oldChrome;
        if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator); else delete globalThis.navigator;
    }
});

test('settings reset cannot erase a later countdown save under the shared origin lock', { timeout: 5000 }, async () => {
    const h = harness(false), oldChrome = global.chrome, oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    global.chrome = h.chrome; Object.defineProperty(globalThis, 'navigator', { value: { locks: h.locks }, configurable: true });
    try {
        assert.equal(api.LOCK, 'local-itab-local-write');
        const manager = new StorageManager(), store = new api.Store(api.createChromeBackend(h.chrome, h.locks));
        const state = await store.mutate({ kind: 'save', value: {enabled:true,title:sentinel,targetDate:'2027-01-01'}, revision: 0 });
        const originalGet = h.chrome.storage.local.get;
        let entered, resume;
        const reached = new Promise(resolve => { entered = resolve; }), held = new Promise(resolve => { resume = resolve; });
        h.chrome.storage.local.get = async keys => {
            const result = await originalGet(keys);
            if (keys === null) { entered(); await held; }
            return result;
        };
        const clearing = manager.clear(); await reached;
        const saving = store.mutate({ kind: 'save', value: {enabled:true,title:sentinel+'_NEWER',targetDate:'2027-01-01'}, revision: state.revision });
        resume(); assert.equal(await clearing, true); const saved = await saving;
        assert.equal(saved.title, sentinel + '_NEWER'); assert.deepEqual(h.local()[api.KEY], saved);
    } finally {
        global.chrome = oldChrome;
        if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator); else delete globalThis.navigator;
    }
});

test('nested unrecognized countdown keys are stripped by settings schema allowlists', async () => {
    const manager = new StorageManager();
    const raw = { ...manager.cloneDefaultConfig(), [api.KEY]: { content: sentinel },
        appearance: { template: 'clarity', colorMode: 'light', [api.KEY]: { content: sentinel } } };
    // The boundary reserves storage keys, not arbitrary words in legitimate
    // settings strings. Unknown object fields must not become a covert export.
    for (const result of [manager.validateConfigObject(raw), manager.buildManualExportPayload(raw), manager.buildDriveBackupPayload(raw), manager.prepareSyncPayload(raw), await manager.makeRecovery(raw, 'beforeRestore')]) {
        assert(!JSON.stringify(result).includes(api.KEY)); assert(!JSON.stringify(result).includes(sentinel));
    }
});

test('runtime package allowlist includes countdown code, never tests or private data', () => {
    const { execFileSync } = require('node:child_process');
    const script = `import importlib.util, json
from pathlib import Path
spec = importlib.util.spec_from_file_location('package_extension', Path('tools/package_extension.py'))
pack = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pack)
files = pack.collect(pack.ROOT)
print(json.dumps(sorted(files)))`;
    const files = JSON.parse(execFileSync('python3', ['-c', script], { cwd: project, encoding: 'utf8' }));
    for (const file of ['shared/local-countdown-store.js', 'shared/local-countdown-controller.js', 'shared/local-countdown-view.js', 'local-countdown.css']) assert(files.includes(file), `${file} must be packaged`);
    assert(!files.some(file => /^(tests|docs|tools|release)\//.test(file)));
    assert(!files.some(file => file.includes(api.KEY) || /(?:private|\.env|token\.json)/i.test(file)));
});
