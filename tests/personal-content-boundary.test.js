const assert = require('node:assert/strict');
const StorageManager = require('../storage');
const KEY = '__localItabPersonalTasksV1';
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const sentinel = 'PERSONAL_ONLY_任务_🔒_<script>_DO_NOT_SHARE';
const personal = { enabled: true, records: [{ text: sentinel, state: 'active' }, { text: sentinel + 'done', state: 'done' }, { text: sentinel + 'removed', state: 'removed' }], pinnedId: sentinel + 'pin', recovery: [{ content: sentinel + 'recovery' }], receipts: ['keep-exactly'], futureField: 'opaque-even-if-corrupt' };
const watchdog = setTimeout(() => { console.error('Personal boundary model did not settle.'); process.exit(1); }, 10000);
(async () => {
    const oldChrome = global.chrome, oldNavigator = Object.getOwnPropertyDescriptor(global, 'navigator'), oldError = console.error;
    let state, failSet = false, failRemove = false, pauseRead = null, providerInitializations = 0, writes = 0;
    const queues = new Map();
    Object.defineProperty(global, 'navigator', { configurable: true, value: { locks: { request(name, action) { const task = (queues.get(name) || Promise.resolve()).then(action); queues.set(name, task.catch(() => {})); return task; } } } });
    global.chrome = { storage: { local: {
        async get(keys) { const snapshot = clone(keys ? Object.fromEntries(keys.filter(key => Object.hasOwn(state, key)).map(key => [key, state[key]])) : state); if (!keys && pauseRead) await pauseRead(); return snapshot; },
        async set(values) { if (failSet) throw new Error('write failed'); Object.assign(state, clone(values)); writes++; },
        async remove(keys) { if (failRemove) throw new Error('remove failed'); for (const key of keys) delete state[key]; }
    } } };
    console.error = () => {};
    try {
        const m = new StorageManager(); m._syncInitialized = true;
        state = { ...m.cloneDefaultConfig(), [KEY]: clone(personal) };
        m.ensureSyncInitialized = async () => { providerInitializations++; };
        // Reserved-key access cannot even initialize a provider, nor partially
        // apply a mixed settings/content write before rejecting the request.
        const before = clone(state);
        for (const operation of [() => m.get(KEY), () => m.set(KEY, { text: sentinel }), () => m.setAll({ quote: 'changed', [KEY]: personal }), () => m.writeLocalValues({ [KEY]: personal })]) {
            await assert.rejects(operation(), error => error.code === 'PERSONAL_CONTENT_BOUNDARY');
        }
        assert.equal(providerInitializations, 0); assert.equal(writes, 0); assert.deepEqual(state, before);
        // Every generic exported/synchronized/recovery builder uses its actual
        // configuration allowlist, including active/deleted/pinned/recovery text.
        for (const payload of [m.validateConfigObject(state), m.sanitizeConfigForBackup(state), m.buildManualExportPayload(state), m.buildDriveBackupPayload(state), m.prepareSyncPayload(state), await m.makeRecovery(state, 'beforeRestore')]) {
            assert(!JSON.stringify(payload).includes(sentinel)); assert(!JSON.stringify(payload).includes(KEY));
        }
        // Settings reset retains the entire opaque personal record, not a
        // reconstructed subset that could discard future/recovery fields.
        assert.equal(await m.clear(), true); assert.deepEqual(state[KEY], personal);
        assert.equal(Object.keys(state).length, 2); assert(state[m.layoutGenerationKey]);
        for (const stage of ['set', 'remove']) {
            state = { ...m.cloneDefaultConfig(), [KEY]: clone(personal) }; failSet = stage === 'set'; failRemove = stage === 'remove';
            assert.equal(await m.clear(), false); assert.deepEqual(state[KEY], personal);
            failSet = false; failRemove = false;
        }
        // A content write under its independent key lock may finish between
        // Reset's read and remove; Reset must retain that newer exact value too.
        state = { ...m.cloneDefaultConfig(), [KEY]: clone(personal) };
        const entered = deferred(), resume = deferred(); let held = false;
        pauseRead = async () => { if (!held) { held = true; entered.resolve(); await resume.promise; } };
        const clearing = m.clear(); await entered.promise;
        const newer = { ...clone(personal), revision: 42, text: sentinel + 'newer' };
        await chrome.storage.local.set({ [KEY]: newer }); resume.resolve(); assert.equal(await clearing, true);
        assert.deepEqual(state[KEY], newer); pauseRead = null;
        // Legacy settings import, remote config apply, and Drive restoration
        // merge configuration keys without adopting or erasing personal data.
        state = { ...m.cloneDefaultConfig(), [KEY]: clone(personal) };
        const imported = m.validateImportPayload({ links: [], [KEY]: { text: 'untrusted replacement' } });
        assert.equal(await m.setAll(imported, { confirmedRestore: true, skipSyncInitialization: true, skipSyncSideEffects: true }), true);
        assert.deepEqual(state[KEY], personal); assert(!JSON.stringify(state[m.restoreRecoveryKey]).includes(sentinel));
        const payload = m.prepareSyncPayload(m.cloneDefaultConfig()).payload;
        await m.acceptSyncSnapshot({ payload, validated: m.validateConfigObject(payload), schema: 1, fingerprint: await m.fingerprint({ schema: 1, payload }), revision: 'remote-current', meta: { enabled: true, updatedAt: '2026-10-08T18:00:00Z' } });
        assert.deepEqual(state[KEY], personal);
        const drive = m.buildDriveBackupPayload(state), restored = m.prepareRestoredConfig(drive, await m.getLocalProviderState());
        assert.equal(await m.setAll(restored, { confirmedRestore: true, skipSyncInitialization: true, skipSyncSideEffects: true }), true);
        assert.deepEqual(state[KEY], personal); assert(!JSON.stringify(drive).includes(sentinel)); assert(!JSON.stringify(state[m.restoreRecoveryKey]).includes(sentinel));
        console.log('personal content boundary tests ok (actual configuration reset, concurrent retention, import/Sync/Drive/recovery models)');
    } finally {
        global.chrome = oldChrome; console.error = oldError;
        if (oldNavigator) Object.defineProperty(global, 'navigator', oldNavigator); else delete global.navigator;
    }
})().then(() => clearTimeout(watchdog), error => { clearTimeout(watchdog); console.error(error); process.exitCode = 1; });
