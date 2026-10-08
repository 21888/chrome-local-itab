const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const Identity = require('../shared/layout-identity');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const equal = (a, b) => assert.deepEqual(clone(a), clone(b));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture() {
    let local = {}, remote = {}, counter = 0;
    const listeners = [], queues = new Map(), timers = new Map(), writes = [], events = new Set();
    const emit = (changes, type) => { for (const listener of listeners) { const result = listener(changes, type); if (result?.then) { events.add(result); result.finally(() => events.delete(result)); } } };
    const hooks = { beforeLocalSet: null, afterRemoteGet: null, beforeRemoteSet: null, afterLocalGet: null };
    const locks = { request(name, action) { const task = (queues.get(name) || Promise.resolve()).then(action); queues.set(name, task.catch(() => {})); return task; } };
    const pick = (data, keys) => clone(keys ? Object.fromEntries(keys.filter(key => Object.hasOwn(data, key)).map(key => [key, data[key]])) : data);
    const area = type => ({
        QUOTA_BYTES: 102400, QUOTA_BYTES_PER_ITEM: 8192,
        async get(keys) { const result = pick(type === 'local' ? local : remote, keys); if (type === 'sync') await hooks.afterRemoteGet?.(keys); else await hooks.afterLocalGet?.(keys); return result; },
        async set(values) {
            if (type === 'local') await hooks.beforeLocalSet?.(values); else await hooks.beforeRemoteSet?.(values);
            const target = type === 'local' ? local : remote;
            const changes = Object.fromEntries(Object.keys(values).filter(key => JSON.stringify(target[key]) !== JSON.stringify(values[key])).map(key => [key, { oldValue: clone(target[key]), newValue: clone(values[key]) }]));
            Object.assign(target, clone(values)); writes.push({ type, values: clone(values) });
            emit(changes, type);
        },
        async remove(keys) { const data = type === 'local' ? local : remote; const changes = Object.fromEntries(keys.filter(key => Object.hasOwn(data, key)).map(key => [key, { oldValue: clone(data[key]) }])); for (const key of keys) delete data[key]; emit(changes, type); },
        async getBytesInUse() { return JSON.stringify(type === 'local' ? local : remote).length; }
    });
    const chrome = { storage: { local: area('local'), sync: area('sync'), onChanged: { addListener(fn) { listeners.push(fn); } } } };
    function page() {
        const context = vm.createContext({ chrome, navigator: { locks }, crypto: webcrypto, TextEncoder, URL, console: { warn() {}, error() {} }, module: { exports: {} }, require: name => name === './shared/layout-identity.js' ? Identity : name === './shared/dashboard-template-registry.js' ? require('../shared/dashboard-template-registry.js') : require(name),
            setTimeout(fn) { const id = ++counter; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } });
        vm.runInContext(fs.readFileSync('storage.js', 'utf8'), context);
        const m = new context.module.exports(); m._syncInitialized = true; return m;
    }
    const m = page();
    local = clone(m.defaultConfig); local.sync.enabled = true;
    local.links = [{ title: 'A', url: 'https://example.com/', icon: 'A', category: 'work' }, { title: 'B', url: 'https://example.com/', icon: 'B', category: 'work' }];
    local.layout.positions = { 'all|https://example.com/': { x: 10.25, y: 20.5 } };
    let revision = 0;
    async function publish(payload, schema = 1, extra = {}) {
        const chunks = m.createSyncChunks(JSON.stringify(payload));
        const meta = { enabled: true, version: 2, updatedAt: `remote-${++revision}`, chunkCount: chunks.length, ...extra };
        if (schema === 2) Object.assign(meta, { configurationSchemaVersion: 2, revision: `r-${revision}`, payloadHash: await m.fingerprint({ schema, payload }) });
        remote = { [m.syncMetaKey]: meta }; chunks.forEach((chunk, i) => { remote[`${m.syncChunkPrefix}${i}`] = chunk; });
        return clone(meta);
    }
    const payload = () => m.prepareSyncPayload(m.validateConfigObject(local)).payload;
    const allocate = async () => m.applyLayoutPatch({ autoArrange: false }, {}, await m.getLayoutSnapshotForUpdate());
    return { m, page, hooks, timers, writes, publish, payload, allocate, listen: fn => listeners.push(fn), async drain() { while (events.size) await Promise.all([...events]); }, local: () => clone(local), remote: () => clone(remote), setLocal: values => Object.assign(local, clone(values)), setRemote: values => Object.assign(remote, clone(values)) };
}
const watchdog = setTimeout(() => { console.error('Identity model did not settle.'); process.exit(1); }, 10000);
(async () => {
    // Acknowledged legacy copy may upgrade once. Every page recognizes this
    // profile's exact upload; a legacy rewrite two milliseconds later is not ignored.
    {
        const f = fixture(), { m } = f; const legacy = f.payload(); await f.publish(legacy);
        await m.pullFromSync(); const ack = f.local()[m.syncIdentityStateKey].ack;
        await f.allocate(); assert(ack); await m.pushToSync();
        const cloud = await m.readSyncSnapshot(); assert.equal(cloud.schema, 2); assert(cloud.payload.links[0].layoutId);
        assert(!('data' in cloud.payload)); equal(cloud.payload.layout.positions, legacy.layout.positions);
        const second = f.page();
        assert.equal(await second.shouldIgnoreRemoteSyncChange({ [m.syncMetaKey]: { newValue: cloud.meta } }), true);
        const before = f.local(), id = before.links[0].layoutId;
        await m.applyLayoutPatch({}, {}, await m.getLayoutSnapshotForUpdate(), () => {}, { [Identity.key(id, 'all')]: { x: 88.25, y: 41.5 } });
        assert.equal((await second.pullFromSync()).applied, false, 'own full snapshot cannot replay over newer drag');
        assert.equal(f.local().layout.positionsById[id].all.x, 88.25);
        const oldMeta = await f.publish(legacy);
        assert.equal(await second.shouldIgnoreRemoteSyncChange({ [m.syncMetaKey]: { newValue: oldMeta } }), false);
        second.scheduleSyncPush(); assert(f.timers.size);
        const protectedData = f.payload(), lastSync = f.local().sync.lastSync;
        await assert.rejects(m.pullFromSync(), error => error.code === 'SYNC_IDENTITY_COMPATIBILITY');
        equal(f.payload(), protectedData); assert.equal(f.local().sync.enabled, true); assert.equal(f.local().sync.lastSync, lastSync);
        assert.equal(f.timers.size, 0, 'shared block cancels every page timer');
        const uploads = f.writes.filter(w => w.type === 'sync').length;
        await assert.rejects(second.pushToSync(), error => error.code === 'SYNC_IDENTITY_COMPATIBILITY');
        assert.equal(f.writes.filter(w => w.type === 'sync').length, uploads);
        // A local move while blocked prevents automatic v2 recovery authority.
        await m.applyLayoutPatch({}, {}, await m.getLayoutSnapshotForUpdate(), () => {}, { [Identity.key(id, 'all')]: { x: 999, y: 42 } });
        await f.publish(cloud.payload, 2);
        await assert.rejects(m.pullFromSync(), /Local settings changed/);
        assert.equal(f.local().layout.positionsById[id].all.x, 999);
        const expectedRemote = await m.previewCloudReplacement();
        await m.pullFromSync({ confirmedReplacement: true, expectedRemote });
        equal((await m.getRecoveryBackup()).data.layout.positionsById[id].all, { x: 999, y: 42 });
        assert.equal(f.local()[m.syncIdentityStateKey].blocked, null);
    }
    // Complete compatible retry only recovers automatically if local data did
    // not change while blocked. A spoofed schema stamp cannot bypass raw checks.
    {
        const f = fixture(), { m } = f; await f.allocate(); const coherent = f.payload();
        const legacy = clone(coherent); delete legacy.layout.identityVersion; delete legacy.layout.positionsById; legacy.links.forEach(link => delete link.layoutId);
        await f.publish(legacy, 1, { configurationSchemaVersion: 2 });
        const before = f.payload(); await assert.rejects(m.pullFromSync(), /metadata/); equal(f.payload(), before);
        await f.publish(coherent, 2); await m.pullFromSync(); assert.equal(f.local()[m.syncIdentityStateKey].blocked, null);
    }
    // The compatibility decision must use the bundle read inside the lock,
    // even if a legacy download started before first allocation.
    {
        const f = fixture(), { m } = f; await f.publish(f.payload());
        const staleRemote = await m.readSyncSnapshot(); await f.allocate();
        const before = f.payload(); await assert.rejects(m.acceptSyncSnapshot(staleRemote), error => error.code === 'SYNC_IDENTITY_COMPATIBILITY'); equal(f.payload(), before);
    }
    // Explicit v1 restore keeps a sticky block, enabled preference, latest v2
    // recovery and the prior first-upgrade recovery. A queued other page cannot
    // upload or pull either an old own revision or a newer compatible copy.
    {
        const f = fixture(), { m } = f; const legacy = f.payload(); await f.publish(legacy); await m.pullFromSync(); await f.allocate(); await m.pushToSync();
        const cloud = await m.readSyncSnapshot(), other = f.page(); other.scheduleSyncPush();
        const restored = m.prepareRestoredConfig(legacy, { sync: f.local().sync });
        assert.equal(await m.setAll(restored, { confirmedRestore: true, skipSyncInitialization: true, skipSyncSideEffects: true }), true);
        assert.equal(f.local().sync.enabled, true); assert.equal(f.local()[m.syncIdentityStateKey].blocked.kind, 'restore'); assert.equal(f.timers.size, 0);
        assert.equal((await m.getRecoveryBackup()).schemaVersion, 2);
        for (let i = 0; i < 2; i++) { await assert.rejects(other.pullFromSync(), error => error.kind === 'restore'); await assert.rejects(other.pushToSync()); }
        await f.publish(cloud.payload, 2); await assert.rejects(other.pullFromSync(), error => error.kind === 'restore'); equal(f.payload(), legacy);
        assert.equal(f.local()[m.syncIdentityStateKey].blocked.kind, 'restore');
    }
    // Failed restore backup/commit and changed confirmation never authorize a replacement.
    {
        const f = fixture(), { m } = f; await f.allocate(); await f.publish(f.payload(), 2); const expectedRemote = await m.previewCloudReplacement();
        await f.publish(f.payload(), 2); const before = f.payload();
        await assert.rejects(m.pullFromSync({ confirmedReplacement: true, expectedRemote }), /changed after confirmation/); equal(f.payload(), before);
        const current = await m.previewCloudReplacement(); f.hooks.beforeLocalSet = async values => { if (values[m.restoreRecoveryKey]) throw new Error('backup quota failed'); };
        await assert.rejects(m.pullFromSync({ confirmedReplacement: true, expectedRemote: current }), /backup quota/); equal(f.payload(), before);
    }
    // An old upload already waiting on remote reads must recheck the shared
    // block immediately before it can enqueue any remote write.
    {
        const f = fixture(), { m } = f; await f.publish(f.payload()); await m.pullFromSync(); await f.allocate();
        const second = f.page(), started = deferred(), resume = deferred(); let held = false;
        f.hooks.afterRemoteGet = async () => { if (!held) { held = true; started.resolve(); await resume.promise; } };
        const pending = second.pushToSync(); await started.promise;
        await m.blockSync(m.compatibilityError('conflicting old client')); resume.resolve();
        await assert.rejects(pending, /conflicting old client/); assert.equal(f.writes.filter(w => w.type === 'sync').length, 0);
    }
    // Final eligibility and enqueue are ordered by the local lock. The lock
    // is released while the provider is pending, so another page can block.
    {
        const f = fixture(), { m } = f; await f.publish(f.payload()); await m.pullFromSync(); await f.allocate();
        const readStarted = deferred(), releaseRead = deferred(), enqueued = deferred(), provider = deferred(); let held = false;
        f.hooks.afterLocalGet = async keys => { if (!held && keys?.length === 2 && keys.includes(m.layoutGenerationKey)) { held = true; readStarted.resolve(); await releaseRead.promise; } };
        f.hooks.beforeRemoteSet = async () => { enqueued.resolve(); await provider.promise; };
        const upload = m.pushToSync(); await readStarted.promise;
        let blocked = false; const block = f.page().blockSync(m.compatibilityError('later compatibility conflict')).then(() => { blocked = true; });
        await Promise.resolve(); assert.equal(blocked, false, 'block waits for locked enqueue boundary');
        releaseRead.resolve(); await enqueued.promise; await block;
        assert.equal(blocked, true, 'provider completion does not hold local lock');
        provider.resolve(); await assert.rejects(upload, /later compatibility conflict/);
        assert.equal(f.writes.filter(w => w.type === 'sync').length, 1, 'only the already enqueued upload can finish');
    }
    // Reset during an already enqueued upload invalidates the acknowledgment.
    // It must not resurrect enabled state, identities, or their recovery copies.
    {
        const f = fixture(), { m } = f; await f.publish(f.payload()); await m.pullFromSync(); await f.allocate();
        const entered = deferred(), resume = deferred(); let once = false;
        f.hooks.beforeRemoteSet = async () => { if (!once) { once = true; entered.resolve(); await resume.promise; } };
        const oldGeneration = f.local()[m.layoutGenerationKey];
        const upload = m.pushToSync(); await entered.promise;
        const reset = f.page().clear();
        for (let i = 0; i < 20 && f.local()[m.layoutGenerationKey] === oldGeneration; i++) await new Promise(resolve => setImmediate(resolve));
        assert.notEqual(f.local()[m.layoutGenerationKey], oldGeneration);
        resume.resolve(); await assert.rejects(upload, /replaced during upload/); assert.equal(await reset, true);
        assert.equal(f.local().sync.enabled, false); assert.equal(f.local().links, undefined); assert.equal(f.local()[m.identityRecoveryKey], undefined);
    }
    // Quota failure never omits identity data or flips an existing preference.
    {
        const f = fixture(), { m } = f; await f.publish(f.payload()); await m.pullFromSync(); await f.allocate();
        const local = f.payload(), remote = f.remote(); m.syncTotalBudget = 1;
        await assert.rejects(m.pushToSync(), /quota/); equal(f.payload(), local); equal(f.remote(), remote); assert.equal(f.local().sync.enabled, true);
    }
    // A new but not-yet-identified page must not downgrade a v2 cloud copy.
    {
        const f = fixture(), { m } = f; const legacy = f.local(); await f.allocate();
        const identified = f.payload(); await f.publish(identified, 2);
        f.setLocal({ links: legacy.links, layout: legacy.layout });
        const before = f.remote(); await assert.rejects(m.pushToSync(), /remove cloud layout identity/); equal(f.remote(), before);
        assert.equal(f.local().sync.enabled, true);
        await m.pullFromSync(); equal(f.local().links, identified.links);
    }
    // Remote-off checks the same locked snapshot as its preference write.
    {
        const f = fixture(), { m } = f; f.setRemote({ [m.syncMetaKey]: { enabled: false } });
        const started = deferred(), resume = deferred(); let once = false;
        f.hooks.beforeLocalSet = async values => { if (!once && values.links && values.layout) { once = true; started.resolve(); await resume.promise; } };
        const allocation = f.allocate(); await started.promise;
        const off = f.page().pullFromSync(); resume.resolve(); await allocation;
        await assert.rejects(off, /removed or disabled/); assert.equal(f.local().sync.enabled, true); assert(f.local().layout.identityVersion);
    }
    // Explicit off is an exact owned revision before chunk cleanup. Late
    // partial-read/self notifications cannot recreate a compatibility block.
    {
        const f = fixture(), { m } = f; const legacy = f.payload(); await f.publish(legacy); await m.pullFromSync(); await f.allocate(); await m.pushToSync();
        await f.publish(legacy); await assert.rejects(m.pullFromSync());
        const other = f.page();
        f.listen(async (changes, area) => { if (area !== 'sync') return; try { if (!await other.shouldIgnoreRemoteSyncChange(changes)) await other.pullFromSync(); } catch (_) {} });
        await m.setSyncEnabled(false); await f.drain();
        assert.equal(f.local().sync.enabled, false); assert.equal(f.local()[m.syncIdentityStateKey].blocked, null);
        assert.equal(await other.shouldIgnoreRemoteSyncChange({ [m.syncChunkPrefix + '0']: { oldValue: 'removed' } }), true);
        assert.equal((await m.getRecoveryBackup()).schemaVersion, 1, 'explicit clear saved the readable divergent cloud copy');
    }
    // Missing chunks, malformed IDs and quota failures preserve the local bundle.
    {
        const f = fixture(), { m } = f; await f.allocate(); const before = f.payload();
        await f.publish(before, 2);
        const meta = f.remote()[m.syncMetaKey]; delete meta.payloadHash; f.setRemote({ [m.syncMetaKey]: meta });
        await assert.rejects(m.pullFromSync(), /revision fingerprint/); equal(f.payload(), before);
        await f.publish(before, 2); f.setRemote({ [m.syncChunkPrefix + '0']: '' });
        await assert.rejects(m.pullFromSync(), /incomplete/); equal(f.payload(), before);
        const bad = clone(before); bad.links[1].layoutId = bad.links[0].layoutId; await f.publish(bad, 2);
        await assert.rejects(m.pullFromSync(), error => error.code === 'SYNC_IDENTITY_COMPATIBILITY'); equal(f.payload(), before);
    }
    console.log('identity sync tests ok (deterministic shared-state, wire, restore and interleaving models; no live account)');
})().then(() => clearTimeout(watchdog), error => { clearTimeout(watchdog); console.error(error); process.exitCode = 1; });
