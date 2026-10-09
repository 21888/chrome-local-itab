const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { webcrypto } = require('node:crypto');
const { test } = require('node:test');
const WorldClocks = require('../shared/world-clocks.js');

const storagePath = path.resolve(__dirname, '../storage.js');
const source = fs.readFileSync(storagePath, 'utf8');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const equal = (left, right, message) => assert.deepEqual(clone(left), clone(right), message);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(setImmediate);
const clock = (timeZone = 'Asia/Tokyo', label = 'Tokyo') => ({
    hour12: true, showSeconds: false, worldClocks: [{ timeZone, label }]
});

function fixture(initial = {}, { lockSupport = true } = {}) {
    let local = clone(initial), remote = {}, sequence = 0;
    const queues = new Map(), held = new Set(), timers = new Map(), writes = [], reads = [];
    const hooks = { beforeLocalGet: null, beforeLocalSet: null };
    const locks = { request(name, operation) {
        const task = (queues.get(name) || Promise.resolve()).then(async () => {
            held.add(name);
            try { return await operation(); } finally { held.delete(name); }
        });
        queues.set(name, task.catch(() => {}));
        return task;
    } };
    const area = kind => ({
        QUOTA_BYTES: kind === 'sync' ? 102400 : 5242880, QUOTA_BYTES_PER_ITEM: 8192,
        async get(keys) {
            if (kind === 'local') await hooks.beforeLocalGet?.(keys);
            reads.push({ kind, keys: clone(keys), locked: held.has('local-itab-local-write') });
            const state = kind === 'local' ? local : remote;
            return clone(keys === null ? state : Object.fromEntries(keys.filter(key => Object.hasOwn(state, key)).map(key => [key, state[key]])));
        },
        async set(values) {
            if (kind === 'local') await hooks.beforeLocalSet?.(values);
            writes.push({ kind, values: clone(values), locked: held.has('local-itab-local-write') });
            Object.assign(kind === 'local' ? local : remote, clone(values));
        },
        async remove(keys) { for (const key of keys) delete (kind === 'local' ? local : remote)[key]; },
        async getBytesInUse() { return Buffer.byteLength(JSON.stringify(kind === 'local' ? local : remote)); }
    });
    const chrome = { storage: { local: area('local'), sync: area('sync') } };
    function page() {
        const context = vm.createContext({
            chrome, navigator: lockSupport ? { locks } : {}, crypto: webcrypto, TextEncoder, URL,
            console: { warn() {}, error() {} }, module: { exports: {} }, require: createRequire(storagePath),
            setTimeout(fn) { timers.set(++sequence, fn); return sequence; }, clearTimeout(id) { timers.delete(id); }
        });
        vm.runInContext(source, context);
        const manager = new context.module.exports();
        manager._syncInitialized = true;
        return manager;
    }
    const manager = page();
    async function publish(payload) {
        const chunks = manager.createSyncChunks(JSON.stringify(payload));
        remote = { [manager.syncMetaKey]: { enabled: true, version: 2, updatedAt: `remote-${++sequence}`, chunkCount: chunks.length } };
        chunks.forEach((chunk, index) => { remote[`${manager.syncChunkPrefix}${index}`] = chunk; });
    }
    return { manager, page, hooks, writes, reads, timers, publish,
        state: () => clone(local), remote: () => clone(remote),
        setLocal(values) { Object.assign(local, clone(values)); }
    };
}

const malformedLists = [
    null, {}, 'UTC', [null], ['UTC'], [{}], [{ label: 'Missing zone' }],
    [{ timeZone: 'Not/A_Zone', label: 'Broken' }],
    [{ timeZone: '+01:00', label: 'Fixed offset' }],
    [{ timeZone: 'UTC', label: 4 }], [{ timeZone: 'UTC', label: 'a'.repeat(41) }],
    [{ timeZone: 'UTC', label: 'hidden\u0000text' }],
    [{ timeZone: 'UTC', label: 'UTC', extra: 'unknown' }],
    [{ timeZone: 'US/Eastern' }, { timeZone: 'America/New_York' }],
    ['UTC', 'Asia/Tokyo', 'Europe/London', 'Europe/Paris', 'Asia/Shanghai'].map(timeZone => ({ timeZone }))
];

test('first-run and legacy clocks default to an empty list without migration', async () => {
    const f = fixture();
    equal(f.manager.defaultConfig.clock, { hour12: false, showSeconds: true, worldClocks: [] });
    const fresh = await f.manager.getAll();
    equal(fresh.clock, fresh._clockBaseline);
    assert.equal(Object.keys(fresh).includes('_clockBaseline'), false);
    assert.equal(JSON.stringify(fresh).includes('_clockBaseline'), false);
    assert.equal(f.writes.length, 0);
    fresh._clockBaseline.worldClocks.push({ timeZone: 'UTC', label: '' });
    equal(f.manager.defaultConfig.clock.worldClocks, []);
    f.setLocal({ clock: { hour12: true, showSeconds: false } });
    const legacy = await f.manager.getAll();
    equal(legacy.clock, { hour12: true, showSeconds: false, worldClocks: [] });
    equal(legacy._clockBaseline, legacy.clock);
    assert.equal(f.writes.length, 0);
});

test('runtime recovery retains valid booleans and does not authorize corrupt replacement', async () => {
    for (const worldClocks of malformedLists) {
        const f = fixture({ clock: { hour12: true, showSeconds: false, worldClocks } });
        const config = await f.manager.getAll();
        equal(config.clock, { hour12: true, showSeconds: false, worldClocks: [] });
        equal(await f.manager.get('clock'), config.clock);
        assert.equal(Object.hasOwn(config, '_clockBaseline'), false);
        assert.equal(f.writes.length, 0);
        await assert.rejects(f.manager.setAll({ clock: clock(), quote: 'Do not commit' }, { expectedClock: config.clock }), { code: 'CLOCK_CONFLICT' });
        assert.equal(f.writes.length, 0);
        equal(f.state().clock.worldClocks, worldClocks);
    }
});

test('clock baseline is absent after failed reads and never leaks into any backup', async () => {
    const f = fixture({ clock: clock() });
    const current = await f.manager.getAll();
    for (const payload of [f.manager.buildManualExportPayload(current), f.manager.buildDriveBackupPayload(current), f.manager.prepareSyncPayload(current).payload]) {
        assert.equal(JSON.stringify(payload).includes('_clockBaseline'), false);
    }
    f.hooks.beforeLocalGet = async () => { throw new Error('Read failed'); };
    assert.equal(Object.hasOwn(await f.manager.getAll(), '_clockBaseline'), false);
    assert.equal(f.writes.length, 0);
});

test('canonical world clocks round-trip through manual, Drive, and Sync payloads', () => {
    const { manager } = fixture();
    const config = manager.cloneDefaultConfig();
    config.clock = clock('US/Eastern', '  New York  ');
    const expected = { ...config.clock, worldClocks: WorldClocks.normalize(config.clock.worldClocks) };
    const before = clone(config);
    for (const backup of [manager.buildManualExportPayload(config), manager.buildDriveBackupPayload(config)]) {
        equal(backup.data.clock, expected);
        equal(manager.validateImportPayload(backup).clock, expected);
        assert.equal(backup.data.sync.enabled, false);
    }
    const sync = manager.prepareSyncPayload(config);
    equal(sync.payload.clock, expected);
    equal(manager.validateImportPayload(sync.payload).clock, expected);
    assert.equal(Object.hasOwn(sync.payload, 'sync'), false);
    equal(config, before, 'boundary normalization must not mutate caller data');
});

test('old plain/manual/Drive/settings backups import with an empty world-clock list', () => {
    const { manager } = fixture();
    const legacy = { links: [], clock: { hour12: true, showSeconds: false } };
    const expected = { ...legacy.clock, worldClocks: [] };
    for (const payload of [legacy, { settings: legacy }, { version: '1.0', data: legacy },
        { version: '1.0', type: 'backupSnapshot', app: 'local-itab', data: legacy }]) {
        equal(manager.validateImportPayload(payload).clock, expected);
        equal(manager.prepareRestoredConfig(payload).clock, expected);
    }
    equal(manager.validateImportPayload({ links: [] }).clock, manager.defaultConfig.clock);
});

test('malformed supplied lists reject manual and Drive imports before writes', () => {
    const f = fixture({ clock: clock(), quote: 'Keep local' });
    for (const worldClocks of malformedLists) {
        const data = { links: [], clock: { hour12: true, showSeconds: false, worldClocks }, quote: 'Imported' };
        for (const payload of [data, { version: '1.0', data }, { version: '1.0', type: 'backupSnapshot', app: 'local-itab', data }]) {
            const before = clone(payload);
            assert.throws(() => f.manager.validateImportPayload(payload), /Invalid backup:.*(?:world|clock)/i);
            assert.throws(() => f.manager.prepareRestoredConfig(payload), /Invalid backup:/);
            equal(payload, before);
        }
    }
    assert.equal(f.writes.length, 0);
    assert.equal(f.state().quote, 'Keep local');
});

test('concurrent stale clock saves fail atomically without unrelated preference writes', async () => {
    const f = fixture({ clock: clock(), quote: 'Original', privacy: { onlineFavicons: false } });
    const a = f.manager, b = f.page();
    const baseline = (await a.getAll())._clockBaseline;
    const entered = deferred(), resume = deferred();
    f.hooks.beforeLocalSet = async values => {
        if (!Object.hasOwn(values, 'clock')) return;
        f.hooks.beforeLocalSet = null;
        entered.resolve(); await resume.promise;
    };
    const first = a.setAll({ clock: clock('Europe/London', 'London'), quote: 'First' }, { expectedClock: baseline });
    await entered.promise;
    const stale = b.setAll({ clock: clock('America/New_York', 'NY'), quote: 'Stale', privacy: { onlineFavicons: true } }, { expectedClock: baseline });
    const conflict = assert.rejects(stale, error => error.code === 'CLOCK_CONFLICT' && /edits are still here/i.test(error.message));
    await tick(); assert.equal(f.writes.length, 0);
    resume.resolve(); assert.equal(await first, true); await conflict;
    equal(f.state().clock, clock('Europe/London', 'London'));
    assert.equal(f.state().quote, 'First'); assert.equal(f.state().privacy.onlineFavicons, false);
    assert.equal(f.writes.length, 1); assert.equal(f.writes[0].locked, true);
    await assert.rejects(b.setAll({ clock: clock(), quote: 'Retry' }, { expectedClock: baseline }), { code: 'CLOCK_CONFLICT' });
    assert.equal(f.writes.length, 1);
});

test('booleans and world-clock list form one guarded component in both set APIs', async () => {
    const f = fixture({ clock: clock() });
    const baseline = (await f.manager.getAll())._clockBaseline;
    await f.manager.set('clock', { ...baseline, hour12: false }, { expectedClock: baseline });
    await assert.rejects(f.manager.set('clock', clock('UTC', 'UTC'), { expectedClock: baseline }), { code: 'CLOCK_CONFLICT' });
    await assert.rejects(f.manager.setAll({ clock: { ...baseline, showSeconds: true } }, { expectedClock: baseline }), { code: 'CLOCK_CONFLICT' });
    const latest = (await f.manager.getAll())._clockBaseline;
    assert.equal(await f.manager.setAll({ clock: { ...latest, showSeconds: true } }, { expectedClock: latest }), true);
    equal(f.state().clock, { ...clock(), hour12: false, showSeconds: true });
});

test('omitting an untouched clock preserves another tab\'s clock settings', async () => {
    const f = fixture({ clock: clock() });
    const baseline = (await f.manager.getAll())._clockBaseline;
    await f.manager.set('clock', clock('Europe/Paris', 'Paris'));
    assert.equal(await f.manager.setAll({ quote: 'Unrelated setting' }, { expectedClock: baseline }), true);
    equal(f.state().clock, clock('Europe/Paris', 'Paris'));
    assert.equal(Object.hasOwn(f.writes.at(-1).values, 'clock'), false);
});

test('guarded writes fail closed without Web Locks and do not save other keys', async () => {
    const f = fixture({ clock: clock(), quote: 'Original' }, { lockSupport: false });
    const baseline = (await f.manager.getAll())._clockBaseline;
    await assert.rejects(f.manager.set('clock', clock('UTC', 'UTC'), { expectedClock: baseline }), { code: 'CLOCK_LOCK_UNAVAILABLE' });
    await assert.rejects(f.manager.setAll({ clock: clock('UTC', 'UTC'), quote: 'Changed' }, { expectedClock: baseline }), { code: 'CLOCK_LOCK_UNAVAILABLE' });
    assert.equal(f.writes.length, 0); assert.equal(f.state().quote, 'Original');
});

test('clock-only writes do not need to repair unrelated corrupt shortcuts', async () => {
    const f = fixture({ clock: clock(), links: 'Corrupt shortcuts' });
    assert.equal(await f.manager.set('clock', clock('UTC', 'UTC'), { expectedClock: clock() }), true);
    assert.equal(f.state().links, 'Corrupt shortcuts');
    equal(f.state().clock, clock('UTC', 'UTC'));
});

test('every unguarded clock write joins the same lock as a guarded save', async () => {
    const f = fixture({ clock: clock() });
    const a = f.manager, b = f.page(), entered = deferred(), resume = deferred();
    f.hooks.beforeLocalSet = async () => { f.hooks.beforeLocalSet = null; entered.resolve(); await resume.promise; };
    const first = a.set('clock', clock('UTC', 'UTC'));
    await entered.promise;
    const second = b.setAll({ clock: clock('Europe/London', 'London') });
    await tick(); assert.equal(f.writes.length, 0);
    resume.resolve(); await Promise.all([first, second]);
    assert.equal(f.writes.length, 2); assert(f.writes.every(write => write.locked));
    equal(f.state().clock, clock('Europe/London', 'London'));
});

test('whole backup restoration invalidates an older clock form under the shared lock', async () => {
    const f = fixture({ clock: clock(), quote: 'Original' });
    const baseline = (await f.manager.getAll())._clockBaseline;
    const imported = f.manager.prepareRestoredConfig({ links: [], clock: clock('UTC', 'UTC'), quote: 'Restored' });
    const entered = deferred(), resume = deferred();
    f.hooks.beforeLocalSet = async values => {
        if (!Object.hasOwn(values, 'clock')) return;
        f.hooks.beforeLocalSet = null; entered.resolve(); await resume.promise;
    };
    const restoration = f.manager.setAll(imported, { confirmedRestore: true, skipSyncSideEffects: true, skipSyncInitialization: true });
    await entered.promise;
    const stale = f.page().setAll({ clock: clock('Europe/Paris', 'Paris'), quote: 'Old form' }, { expectedClock: baseline });
    const conflict = assert.rejects(stale, { code: 'CLOCK_CONFLICT' });
    resume.resolve(); assert.equal(await restoration, true); await conflict;
    equal(f.state().clock, clock('UTC', 'UTC')); assert.equal(f.state().quote, 'Restored');
    assert.equal(f.writes.filter(write => Object.hasOwn(write.values, 'clock')).length, 1);
    assert(f.writes.filter(write => Object.hasOwn(write.values, 'clock')).every(write => write.locked));
});

test('Sync remains opt-in and its wire payload preserves the configured clocks', async () => {
    const f = fixture();
    assert.equal(await f.manager.set('clock', clock()), true);
    assert.equal(f.writes.some(write => write.kind === 'sync'), false);
    assert.equal(f.timers.size, 0);
    await f.manager.setSyncEnabled(true);
    assert(f.writes.some(write => write.kind === 'sync'));
    const remote = await f.manager.readSyncSnapshot();
    equal(remote.payload.clock, clock()); equal(remote.validated.clock, clock());
    assert.equal(f.state().sync.enabled, true);
});

test('valid and legacy Sync replacements are clock-locked and reject an older form', async () => {
    for (const importedClock of [clock('Europe/London', 'London'), { hour12: false, showSeconds: true }]) {
        const f = fixture({ clock: clock() });
        const baseline = (await f.manager.getAll())._clockBaseline;
        await f.publish({ links: [], clock: importedClock, quote: 'Remote quote' });
        const result = await f.manager.pullFromSync();
        assert.equal(result.applied, true);
        equal(f.state().clock, { ...importedClock, worldClocks: importedClock.worldClocks || [] });
        await assert.rejects(f.page().setAll({ clock: clock('UTC', 'UTC'), quote: 'Stale form' }, { expectedClock: baseline }), { code: 'CLOCK_CONFLICT' });
        assert.equal(f.state().quote, 'Remote quote');
        const clockWrites = f.writes.filter(write => Object.hasOwn(write.values, 'clock'));
        assert.equal(clockWrites.length, 1); assert.equal(clockWrites[0].locked, true);
    }
});

test('malformed Sync clock lists never replace local configuration or their companion keys', async () => {
    for (const worldClocks of malformedLists) {
        const f = fixture({ clock: clock(), quote: 'Local quote' });
        await f.publish({ links: [], clock: { hour12: false, showSeconds: true, worldClocks }, quote: 'Bad remote quote' });
        await assert.rejects(f.manager.pullFromSync(), error => error.code === 'SYNC_IDENTITY_COMPATIBILITY' && /Invalid backup:/i.test(error.message));
        equal(f.state().clock, clock()); assert.equal(f.state().quote, 'Local quote');
        assert.equal(f.writes.some(write => Object.hasOwn(write.values, 'clock')), false);
    }
});

test('reset removes world clocks, preserves local personal content, and invalidates the old form', async () => {
    const personalKey = '__localItabPersonalTasksV1';
    const f = fixture({ clock: clock(), [personalKey]: { tasks: [{ title: 'Keep local task' }] } });
    const baseline = (await f.manager.getAll())._clockBaseline;
    assert.equal(await f.manager.clear(), true);
    assert.equal(Object.hasOwn(f.state(), 'clock'), false);
    equal(f.state()[personalKey], { tasks: [{ title: 'Keep local task' }] });
    equal((await f.manager.getAll()).clock, f.manager.defaultConfig.clock);
    await assert.rejects(f.manager.setAll({ clock: clock('UTC', 'UTC') }, { expectedClock: baseline }), { code: 'CLOCK_CONFLICT' });
});

test('pending saves snapshot both clock input and expected baseline before yielding', async () => {
    const f = fixture({ clock: clock() });
    const baseline = (await f.manager.getAll())._clockBaseline;
    const submitted = clock('Europe/London', 'London'), entered = deferred(), resume = deferred();
    f.manager.ensureSyncInitialized = async () => { entered.resolve(); await resume.promise; };
    const pending = f.manager.setAll({ clock: submitted }, { expectedClock: baseline });
    await entered.promise;
    baseline.worldClocks[0].label = 'Changed baseline'; submitted.worldClocks[0].label = 'Changed input';
    resume.resolve(); assert.equal(await pending, true);
    equal(f.state().clock, clock('Europe/London', 'London'));
});


test('saved reordered clocks retain exact order across JSON, Drive and Sync backup boundaries', async () => {
    const worldClocks = ['UTC', 'Asia/Tokyo', 'Europe/London', 'Asia/Kathmandu'].map(timeZone => ({timeZone, label: timeZone}));
    const f = fixture({clock: {...clock(), worldClocks}});
    const baseline = (await f.manager.getAll())._clockBaseline;
    const canonical = baseline.worldClocks;
    const reordered = {...baseline, worldClocks: [canonical[3], canonical[0], canonical[2], canonical[1]]};
    await f.manager.setAll({clock: reordered}, {expectedClock: baseline});
    const config = await f.manager.getAllForBackup();
    for (const payload of [f.manager.buildManualExportPayload(config), f.manager.buildDriveBackupPayload(config), f.manager.prepareSyncPayload(config).payload]) {
        equal(f.manager.validateImportPayload(JSON.parse(JSON.stringify(payload))).clock, reordered);
    }
    const count = f.writes.length;
    await assert.rejects(f.page().setAll({clock: baseline, quote: 'Stale order'}, {expectedClock: baseline}), {code: 'CLOCK_CONFLICT'});
    assert.equal(f.writes.length, count); equal(f.state().clock, reordered); assert.notEqual(f.state().quote, 'Stale order');
});
