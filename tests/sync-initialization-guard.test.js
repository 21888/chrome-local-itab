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
        const context = vm.createContext({ chrome, navigator: { locks }, crypto: webcrypto, TextEncoder, URL, console: { warn() {}, error() {} }, module: { exports: {} }, require: name => name === './shared/configuration-codec.js' ? require('../shared/configuration-codec.js') : name === './shared/layout-identity.js' ? Identity : name === './shared/dashboard-template-registry.js' ? require('../shared/dashboard-template-registry.js') : name === './shared/world-clocks.js' ? require('../shared/world-clocks.js') : require(name),
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
    return { m, page, hooks, timers, writes, publish, payload, allocate, listen: fn => listeners.push(fn), async drain() { while (events.size) await Promise.all([...events]); }, local: () => clone(local), remote: () => clone(remote), setLocal: values => Object.assign(local, clone(values)), replaceLocal: values => { local = clone(values); }, setRemote: values => Object.assign(remote, clone(values)) };
}
const { test } = require('node:test');
async function pendingInitialization(f) {
    const started = deferred(), resume = deferred(); let held = false;
    f.hooks.afterRemoteGet = async () => { if (!held) { held = true; started.resolve(); await resume.promise; } };
    f.m._syncInitialized = false;
    const result = f.m.getAll(); await started.promise;
    return { result, resume: () => resume.resolve() };
}
for (const schema of [1, 2]) {
    test(`schema ${schema}: another page's saved quote survives late initialization and retry`, async () => {
        const f = fixture(); if (schema === 2) await f.allocate();
        await f.publish(f.payload(), schema); const pending = await pendingInitialization(f);
        assert.equal(await f.page().set('quote', 'Saved in another page'), true);
        pending.resume(); await pending.result;
        assert.equal(f.local().quote, 'Saved in another page');
        assert.equal(f.local()[f.m.syncIdentityStateKey].blocked.kind, 'initialization');
        assert.equal(f.local()[f.m.syncIdentityStateKey].ack, undefined);
        const before = f.payload();
        await assert.rejects(f.page().pullFromSync(), error => error.kind === 'initialization');
        await assert.rejects(f.page().pushToSync(), error => error.code === 'SYNC_IDENTITY_COMPATIBILITY');
        equal(f.payload(), before);
        const expectedRemote = await f.m.previewCloudReplacement();
        await f.m.pullFromSync({ confirmedReplacement: true, expectedRemote });
        assert.equal(f.local()[f.m.syncIdentityStateKey].blocked, null);
        assert.equal((await f.m.getRecoveryBackup()).data.quote, 'Saved in another page');
    });
    test(`schema ${schema}: disabled local never opts in from an enabled remote`, async () => {
        const f = fixture(); if (schema === 2) await f.allocate();
        const payload = f.payload(); payload.quote = 'Remote saved quote'; await f.publish(payload, schema);
        f.setLocal({ sync: { ...f.local().sync, enabled: false } });
        f.m._syncInitialized = false; await f.m.getAll();
        assert.notEqual(f.local().quote, payload.quote); assert.equal(f.local().sync.enabled, false);
        assert.equal(f.local()[f.m.syncIdentityStateKey], undefined);
    });
}
test('an absent local configuration never opts in from the cloud', async () => {
    const f = fixture(); const payload = f.payload(); await f.publish(payload); f.replaceLocal({});
    f.m._syncInitialized = false; await f.m.getAll(); equal(f.local(), {});
});
test('same-content replacement generations reject an old initializer', async () => {
    const f = fixture(); await f.allocate(); await f.publish(f.payload(), 2);
    const pending = await pendingInitialization(f), before = f.payload();
    assert.equal(await f.page().setAll(f.m.validateConfigObject(f.local())), true);
    equal(f.payload(), before); pending.resume(); await pending.result;
    assert.equal(f.local()[f.m.syncIdentityStateKey].blocked.kind, 'initialization');
});
test('explicit off while an enabled remote snapshot is waiting stays off', async () => {
    const f = fixture(); await f.publish(f.payload());
    const baseline = await f.m.withLocalWriteLock(async () => f.m.syncInitializationFingerprint(await f.m._local.get(null)), true);
    const remote = await f.m.readSyncSnapshot(); await f.page().setSyncEnabled(false);
    await assert.rejects(f.m.acceptSyncSnapshot(remote, { initializing: true, expectedLocalFingerprint: baseline }), error => error.kind === 'initialization');
    assert.equal(f.local().sync.enabled, false);
    await assert.rejects(f.page().acceptSyncSnapshot(remote), error => error.kind === 'initialization');
});
test('full local assets omitted from Sync still participate in the fence', async () => {
    const f = fixture(); await f.publish(f.payload()); const pending = await pendingInitialization(f);
    const bg = { type: 'image', value: 'data:image/png;base64,' + 'A'.repeat(18000) };
    assert.equal(await f.page().set('bg', bg), true);
    assert.equal(f.m.prepareSyncPayload(f.local()).omittedAssets.includes('backgroundImage'), true);
    pending.resume(); await pending.result;
    assert.equal(f.local()[f.m.syncIdentityStateKey].blocked.kind, 'initialization');
});
test('comparison and final acceptance hold the local lock against a queued editor', async () => {
    const f = fixture(); const payload = f.payload(); await f.publish(payload);
    const reached = deferred(), release = deferred(); let held = false;
    f.hooks.beforeLocalSet = async values => {
        if (!held && values[f.m.syncIdentityStateKey]?.ack) { held = true; reached.resolve(); await release.promise; }
    };
    f.m._syncInitialized = false; const init = f.m.getAll(); await reached.promise;
    let saved = false; const edit = f.page().set('quote', 'Queued edit').then(value => { saved = true; return value; });
    await new Promise(resolve => setImmediate(resolve)); assert.equal(saved, false);
    release.resolve(); await init; assert.equal(await edit, true); assert.equal(f.local().quote, 'Queued edit');
});
test('failed acceptance receipt does not install ack or lose local data', async () => {
    const f = fixture(); const before = f.payload(); const payload = clone(before); await f.publish(payload);
    f.hooks.beforeLocalSet = async values => { if (values[f.m.syncIdentityStateKey]?.ack) throw new Error('Synthetic local write failure'); };
    f.m._syncInitialized = false; await f.m.getAll(); equal(f.payload(), before);
    assert.equal(f.local()[f.m.syncIdentityStateKey]?.ack, undefined);
    assert.match(f.local().sync.lastError, /Synthetic local write failure/);
});
test('a pre-existing restore conflict is never cleared by initialization', async () => {
    const f = fixture(); await f.publish(f.payload()); const blocked = { kind: 'restore', reason: 'Synthetic restore review' };
    f.setLocal({ [f.m.syncIdentityStateKey]: { blocked } }); f.m._syncInitialized = false; await f.m.getAll();
    equal(f.local()[f.m.syncIdentityStateKey].blocked, blocked);
});

test('two normal initializers can accept the same revision without a false conflict', async () => {
    const f = fixture(); await f.publish(f.payload()); const pending = await pendingInitialization(f);
    const second = f.page(); second._syncInitialized = false; await second.getAll();
    pending.resume(); await pending.result;
    assert.equal(f.local()[f.m.syncIdentityStateKey].blocked, null);
    assert(f.local()[f.m.syncIdentityStateKey].ack);
});
test('known acknowledged data never replays or blocks a newer local edit', async () => {
    const f = fixture(); await f.publish(f.payload()); await f.m.pullFromSync();
    const pending = await pendingInitialization(f); await f.page().set('quote', 'Local after ack');
    pending.resume(); await pending.result; assert.equal(f.local().quote, 'Local after ack');
    assert.equal(f.local()[f.m.syncIdentityStateKey].blocked, null);
});
test('one failed conflict receipt is retried and remains blocked on another page', async () => {
    const f = fixture(); await f.publish(f.payload()); const pending = await pendingInitialization(f);
    await f.page().set('quote', 'New saved quote'); let failed = false;
    f.hooks.beforeLocalSet = async values => { if (!failed && values[f.m.syncIdentityStateKey]?.blocked?.kind === 'initialization') { failed = true; throw new Error('Synthetic receipt failure'); } };
    pending.resume(); await pending.result; assert(failed);
    assert.equal(f.local()[f.m.syncIdentityStateKey].blocked.kind, 'initialization');
    await assert.rejects(f.page().pullFromSync(), error => error.kind === 'initialization');
    assert.equal(f.local().quote, 'New saved quote');
});
test('persistent receipt failure cannot authorize a same-page automatic retry', async () => {
    const f = fixture(); await f.publish(f.payload()); const pending = await pendingInitialization(f);
    await f.page().set('quote', 'New saved quote');
    f.hooks.beforeLocalSet = async values => { if (values[f.m.syncIdentityStateKey]?.blocked?.kind === 'initialization') throw new Error('Synthetic persistent receipt failure'); };
    pending.resume(); await pending.result; assert.equal(f.local()[f.m.syncIdentityStateKey], undefined);
    f.hooks.beforeLocalSet = null;
    await assert.rejects(f.m.pullFromSync(), error => error.kind === 'initialization');
    assert.equal(f.local().quote, 'New saved quote');
    assert.equal(f.local()[f.m.syncIdentityStateKey].blocked.kind, 'initialization');
});

for (const operation of ['startup', 'download', 'upload', 'event']) {
    test(`${operation}: a divergent empty cloud copy cannot erase post-upgrade saved data`, async () => {
        const f = fixture(), original = f.payload();
        await f.publish(original); await f.m.pullFromSync();
        assert.equal(await f.page().set('quote', 'LATEST_SYNTHETIC_SAVED_QUOTE'), true);
        const before = f.payload(), remote = f.m.cloneDefaultConfig(); delete remote.sync;
        await f.publish(remote); const cloud = f.remote();
        if (operation === 'startup') { f.m._syncInitialized = false; await f.m.getAll(); }
        else if (operation === 'upload') await assert.rejects(f.m.pushToSync(), error => error.kind === 'review');
        else await assert.rejects(f.page().pullFromSync(), error => error.kind === 'review');
        equal(f.payload(), before); equal(f.remote(), cloud);
        assert.equal(f.local().quote, 'LATEST_SYNTHETIC_SAVED_QUOTE');
        assert.equal(f.local()[f.m.syncIdentityStateKey].blocked.kind, 'review');
        const current = f.page(); await assert.rejects(current.pushToSync()); await assert.rejects(current.pullFromSync());
        equal(f.payload(), before); equal(f.remote(), cloud);
    });
}
for (const changed of ['quote', 'bg', 'layout', 'categories']) {
    test(`same shortcut count cannot authorize changed ${changed}`, async () => {
        const f = fixture(), before = f.payload(), payload = clone(before);
        if (changed === 'quote') payload.quote = 'Different quote';
        if (changed === 'bg') payload.bg = { type: 'color', value: '#123456' };
        if (changed === 'layout') payload.layout.positions['all|https://example.com/'].x = 999;
        if (changed === 'categories') payload.categories[0].name = 'Changed category';
        await f.publish(payload); await assert.rejects(f.m.pullFromSync(), error => error.kind === 'review');
        equal(f.payload(), before);
    });
}
test('local disabled blocks direct/event pull and upload without enabling the preference', async () => {
    const f = fixture(); await f.publish(f.payload()); f.setLocal({ sync: { ...f.local().sync, enabled: false } });
    const before = f.payload(), remote = f.remote();
    await assert.rejects(f.m.pullFromSync(), error => error.kind === 'review');
    await assert.rejects(f.page().pushToSync()); equal(f.payload(), before); equal(f.remote(), remote);
    assert.equal(f.local().sync.enabled, false);
});
test('known own/ack revisions never replay and cannot authorize a subsequent divergent upload', async () => {
    const f = fixture(); await f.publish(f.payload()); await f.m.pullFromSync();
    const ack = f.local()[f.m.syncIdentityStateKey].ack;
    f.setLocal({ [f.m.syncIdentityStateKey]: { ...f.local()[f.m.syncIdentityStateKey], ownWrites: [ack] } });
    assert.equal(await f.page().set('quote', 'Latest own-device edit'), true);
    const before = f.payload(), cloud = f.remote(); assert.equal((await f.m.pullFromSync()).applied, false);
    equal(f.payload(), before); await assert.rejects(f.m.pushToSync(), error => error.kind === 'review'); equal(f.remote(), cloud);
});
test('equal downloads and uploads only acknowledge and preserve exact local absence and cloud bytes', async () => {
    const f = fixture(); await f.publish(f.payload()); const local = f.local(), remote = f.remote();
    await f.m.pullFromSync(); await f.m.pushToSync();
    const after = f.local(); delete after[f.m.syncIdentityStateKey]; equal(after, local); equal(f.remote(), remote);
    assert.equal(f.writes.filter(write => write.type === 'sync').length, 0);
});
test('omitted large local assets cannot be replaced by their cloud placeholders', async () => {
    const f = fixture(); f.setLocal({ bg: { type: 'image', value: 'data:image/png;base64,' + 'A'.repeat(18000) } });
    const before = f.local(); await f.publish(f.payload());
    await assert.rejects(f.m.pullFromSync(), error => error.kind === 'review'); equal(f.local().bg, before.bg);
    await assert.rejects(f.page().pushToSync());
});
for (const mode of ['throw', 'drop', 'corrupt']) {
    test(`unverified recovery (${mode}) prevents explicit replacement`, async () => {
        const f = fixture(), before = f.payload(); const payload = clone(before); payload.quote = 'Reviewed cloud quote';
        await f.publish(payload); const expectedRemote = await f.m.previewCloudReplacement();
        f.hooks.beforeLocalSet = async values => {
            if (!values[f.m.restoreRecoveryKey]) return;
            if (mode === 'throw') throw new Error('Synthetic recovery quota failure');
            if (mode === 'drop') delete values[f.m.restoreRecoveryKey];
            if (mode === 'corrupt') values[f.m.restoreRecoveryKey].checksum = 'damaged';
        };
        await assert.rejects(f.m.pullFromSync({ confirmedReplacement: true, expectedRemote })); equal(f.payload(), before);
        assert.equal(f.writes.some(write => write.values.quote === payload.quote), false);
    });
}
test('explicit replacement retains verified recovery before a failed commit and preserves older recovery', async () => {
    const f = fixture(), before = f.payload(); const prior = { synthetic: 'PREVIOUS_RECOVERY_EXACT' };
    f.setLocal({ [f.m.restoreRecoveryKey]: prior });
    const payload = clone(before); payload.quote = 'Reviewed cloud quote'; await f.publish(payload);
    const expectedRemote = await f.m.previewCloudReplacement(); let recoverySeen = false;
    f.hooks.beforeLocalSet = async values => {
        if (values[f.m.restoreRecoveryKey]) recoverySeen = true;
        if (values.quote === payload.quote) { assert(recoverySeen); throw new Error('Synthetic replacement commit failure'); }
    };
    await assert.rejects(f.m.pullFromSync({ confirmedReplacement: true, expectedRemote }), /commit failure/);
    equal(f.payload(), before); equal(f.local()[f.m.restoreRecoveryKey].previousRecovery, prior);
    equal((await f.m.getRecoveryBackup()).data.quote, before.quote);
});
test('a reviewed replacement succeeds only after exact recovery is persisted and verified', async () => {
    const f = fixture(), before = f.payload(), payload = clone(before); payload.quote = 'Explicitly reviewed cloud quote';
    await f.publish(payload); await assert.rejects(f.m.pullFromSync(), error => error.kind === 'review');
    const expectedRemote = await f.m.previewCloudReplacement();
    await f.m.pullFromSync({ confirmedReplacement: true, expectedRemote });
    assert.equal(f.local().quote, payload.quote); equal((await f.m.getRecoveryBackup()).data.quote, before.quote);
    const recoveryAt = f.writes.findIndex(write => write.values[f.m.restoreRecoveryKey]);
    const replacedAt = f.writes.findIndex(write => write.values.quote === payload.quote);
    assert(recoveryAt >= 0 && replacedAt > recoveryAt);
});
test('persistent review-receipt failure still blocks same-page retries and never overwrites data', async () => {
    const f = fixture(), before = f.payload(), payload = clone(before); payload.quote = 'Cloud'; await f.publish(payload);
    f.hooks.beforeLocalSet = async values => { if (values[f.m.syncIdentityStateKey]?.blocked?.kind === 'review') throw new Error('Synthetic receipt failure'); };
    await assert.rejects(f.m.pullFromSync(), error => error.kind === 'review'); equal(f.payload(), before);
    await assert.rejects(f.m.pushToSync()); equal(f.payload(), before);
    await assert.rejects(f.page().pullFromSync()); equal(f.payload(), before);
});

test('explicit replacement recovery preserves raw fields, absence and unrelated-auth boundary exactly', async () => {
    const f = fixture(); const links = [{ title: 'No optional icon', url: 'https://example.com/', category: 'work' }];
    f.setLocal({ links, __auth: 'SYNTHETIC_NEVER_EXPORT', __unknownCredential: 'SYNTHETIC_NEVER_EXPORT' });
    const raw = f.local(), payload = f.payload(); payload.quote = 'Reviewed new quote'; await f.publish(payload);
    const expectedRemote = await f.m.previewCloudReplacement(); await f.m.pullFromSync({ confirmedReplacement: true, expectedRemote });
    const recovery = f.local()[f.m.restoreRecoveryKey]; equal(recovery.rawConfiguration.links, links);
    assert.equal(Object.hasOwn(recovery.rawConfiguration.links[0], 'icon'), false);
    assert.equal(recovery.rawConfiguration.quote, raw.quote); equal(recovery.rawConfiguration.sync, raw.sync);
    assert.equal(await f.m.fingerprint(recovery.rawConfiguration), recovery.rawConfigurationChecksum);
    assert(!JSON.stringify(recovery).includes('SYNTHETIC_NEVER_EXPORT'));
    const portable = await f.m.getRecoveryBackup(); assert.equal(portable.rawConfiguration, undefined);
});
for (const failure of ['throw', 'drop', 'corrupt']) {
    test(`cloud clear ${failure} recovery cannot remove the remote or overwrite prior local recovery`, async () => {
        const f = fixture(), before = f.payload(); const payload = clone(before); payload.quote = 'Divergent cloud'; await f.publish(payload);
        await assert.rejects(f.m.pullFromSync()); const remote = f.remote(), prior = { marker: 'PRIOR_RECOVERY' };
        f.setLocal({ [f.m.restoreRecoveryKey]: prior });
        f.hooks.beforeLocalSet = async values => {
            if (!values[f.m.restoreRecoveryKey]) return;
            if (failure === 'throw') throw new Error('Synthetic backup quota failure');
            if (failure === 'drop') delete values[f.m.restoreRecoveryKey];
            if (failure === 'corrupt') values[f.m.restoreRecoveryKey].checksum = 'bad';
        };
        await assert.rejects(f.m.clearSync()); equal(f.payload(), before); equal(f.remote(), remote);
        if (failure !== 'corrupt') equal(f.local()[f.m.restoreRecoveryKey], prior);
        else equal(f.local()[f.m.restoreRecoveryKey].previousRecovery, prior);
    });
}

test('cloud clear backs up despite failed guard persistence and preserves the complete cloud source', async () => {
    const f = fixture(), payload = f.payload(); payload.quote = 'Cloud not in a persisted guard'; await f.publish(payload);
    f.hooks.beforeLocalSet = async values => { if (values[f.m.syncIdentityStateKey]?.blocked) throw new Error('Synthetic guard persistence failure'); };
    await assert.rejects(f.m.pullFromSync(), error => error.kind === 'review');
    assert.equal(f.local()[f.m.syncIdentityStateKey], undefined);
    assert.equal(f.m._syncCompatibilityError.kind, 'review');
    f.hooks.beforeLocalSet = null; await f.m.clearSync();
    equal(f.local()[f.m.restoreRecoveryKey].rawConfiguration, payload);
    assert.equal(f.remote()[f.m.syncMetaKey].enabled, false);
});
for (const state of ['none', 'memory-only']) {
    test(`cloud clear with ${state} guard refuses a dropped recovery`, async () => {
        const f = fixture(), payload = f.payload(); await f.publish(payload); const remote = f.remote();
        if (state === 'memory-only') f.m._syncCompatibilityError = { kind: 'review', reason: 'Synthetic unsaved guard' };
        f.hooks.beforeLocalSet = async values => { if (values[f.m.restoreRecoveryKey]) delete values[f.m.restoreRecoveryKey]; };
        await assert.rejects(f.m.clearSync(), /recovery backup/); equal(f.remote(), remote);
    });
}
test('cloud clear refuses incomplete or changing snapshots without remote writes', async () => {
    const f = fixture(); await f.publish(f.payload()); f.setRemote({ [f.m.syncChunkPrefix + '0']: '' }); const incomplete = f.remote();
    await assert.rejects(f.m.clearSync()); equal(f.remote(), incomplete);
    await f.publish(f.payload()); let changed;
    f.hooks.beforeLocalSet = async values => {
        if (values[f.m.restoreRecoveryKey]) { const payload = f.payload(); payload.quote = 'Cloud arrived during recovery'; await f.publish(payload); changed = f.remote(); }
    };
    await assert.rejects(f.m.clearSync(), error => error.kind === 'review'); equal(f.remote(), changed);
});

for (const metadata of [null, 'unknown', [], {}, { enabled: 'yes' }, { enabled: false, chunkCount: 1 }]) {
    test(`unknown cloud metadata ${JSON.stringify(metadata)} never becomes permission to upload or clear`, async () => {
        const f = fixture(); f.setRemote({ [f.m.syncMetaKey]: metadata, [f.m.syncChunkPrefix + '0']: 'SYNTHETIC_UNREADABLE_EXISTING_DATA' });
        const before = f.remote(); await assert.rejects(f.m.pushToSync()); await assert.rejects(f.m.clearSync()); equal(f.remote(), before);
        assert.equal(f.writes.filter(write => write.type === 'sync').length, 0);
        const status = await f.m.getSyncStatus(); assert(status.compatibilityBlocked); assert.equal(status.remote, null);
        await f.m.getRecoveryAvailability();
    });
}
for (const old of ['absent', 'disabled']) {
    test(`cloud clear refuses a complete copy arriving after ${old} metadata read`, async () => {
        const f = fixture(); if (old === 'disabled') f.setRemote({ [f.m.syncMetaKey]: { enabled: false, chunkCount: 0 } });
        let changed, once = false;
        f.hooks.afterRemoteGet = async keys => {
            if (once || !keys.includes(f.m.syncMetaKey)) return; once = true;
            const payload = f.payload(); payload.quote = 'ARRIVED_NEW_CLOUD'; await f.publish(payload); changed = f.remote();
        };
        await assert.rejects(f.m.clearSync(), error => error.kind === 'review'); equal(f.remote(), changed);
        assert.equal(f.writes.filter(write => write.type === 'sync').length, 0);
    });
}

test('upload rechecks this device consent immediately before enqueue', async () => {
    const f = fixture(); let once = false;
    f.hooks.beforeLocalSet = async values => {
        if (!once && values[f.m.syncIdentityStateKey]?.ownWrites) { once = true; f.setLocal({ sync: { ...f.local().sync, enabled: false } }); }
    };
    await assert.rejects(f.m.pushToSync(), error => error.kind === 'review');
    assert.equal(f.local().sync.enabled, false); equal(f.remote(), {});
    assert.equal(f.writes.filter(write => write.type === 'sync').length, 0);
});
