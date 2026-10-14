'use strict';
// Synthetic, memory-only integration matrix. Real StorageManager, Workspace
// sessions, archive validators, tickets, locks and restore implementations run.
// No browser profile, credentials, remote provider, or network is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const Storage = require('../storage.js');
const Workspaces = require('../shared/workspaces.js');
const Backup = require('../shared/complete-backup.js');
const Tasks = require('../shared/local-tasks-store.js');
const Scratchpad = require('../shared/local-scratchpad-store.js');
const Countdown = require('../shared/local-countdown-store.js');
const Focus = require('../shared/local-focus-store.js');
const { createHarness } = require('./helpers/dashboard-harness');
const { compareRestore, compareRecovery } = require('./helpers/complete-backup-comparison');
const NOW = '2026-10-14T12:00:00.000Z';
const URLS = ['https://example.com', 'https://example.com/', 'example.com'];
const VIEWS = ['all', 'hidden|view', 'constructor', '__proto__'];
const DEFER = Symbol('normal memory storage');
const clone = value => structuredClone(value);
const lid = value => `l_${value.toString(16).padStart(32, '0')}`;
const code = (...expected) => error => expected.includes(error.code);
const bounded = (name, action) => test(name, { timeout: 10000 }, action);
const APIs = { tasks: Tasks, scratchpad: Scratchpad, countdown: Countdown, focus: Focus };

// The shared/exclusive queue and DEFER fault hooks mirror
// workspaces-invariants.test.js. Production code chooses every lock and write.
function fixture(initial = {}) {
    const raw = clone(initial), writes = [], reads = [], providers = [], hooks = {};
    const lockState = new Map(), lockNames = [], listeners = new Set(); let serial = 0;
    const locks = { request(name, options, action) {
        action ||= options; lockNames.push(name);
        const mode = options?.mode === 'shared' ? 'shared' : 'exclusive';
        if (!lockState.has(name)) lockState.set(name, { active: 0, exclusive: false, waiting: [] });
        const state = lockState.get(name);
        const drain = () => {
            if (state.exclusive || !state.waiting.length || state.active && state.waiting[0].mode === 'exclusive') return;
            do {
                const next = state.waiting.shift(); state.active++; state.exclusive = next.mode === 'exclusive';
                Promise.resolve().then(next.action).then(next.resolve, next.reject).finally(() => {
                    state.active--; if (next.mode === 'exclusive') state.exclusive = false; drain();
                });
            } while (!state.exclusive && state.waiting[0]?.mode === 'shared');
        };
        return new Promise((resolve, reject) => { state.waiting.push({ mode, action, resolve, reject }); drain(); });
    } };
    const extract = keys => {
        if (keys == null) return clone(raw);
        if (typeof keys === 'string') keys = [keys];
        if (!Array.isArray(keys)) return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [key, clone(Object.hasOwn(raw, key) ? raw[key] : fallback)]));
        return Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, clone(raw[key])]));
    };
    const apply = values => {
        const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { oldValue: clone(raw[key]), newValue: clone(value) }]));
        Object.assign(raw, clone(values)); for (const listener of listeners) listener(clone(changes), 'local');
    };
    const local = {
        async get(keys) { reads.push(clone(keys)); if (hooks.get) { const value = await hooks.get(keys, raw); if (value !== DEFER) return value; } return extract(keys); },
        async set(values) { writes.push(clone(values)); if (hooks.set) { const value = await hooks.set(values, raw, apply); if (value !== DEFER) return value; } apply(values); },
        async remove() { assert.fail('This preservation matrix must not delete stored keys'); },
        async getBytesInUse() { return Buffer.byteLength(JSON.stringify(raw)); }, QUOTA_BYTES: 10 * 1024 * 1024
    };
    const forbidden = name => async () => { providers.push(name); throw Error(`Synthetic provider access forbidden: ${name}`); };
    const chrome = { storage: { local, sync: { get: forbidden('sync.get'), set: forbidden('sync.set'), remove: forbidden('sync.remove') },
        onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } },
        identity: { getAuthToken: forbidden('identity') }, permissions: { request: forbidden('permissions') },
        runtime: { getManifest: () => ({ version: '1.1.138' }) } };
    return { raw, writes, reads, hooks, providers, locks, lockNames, chrome, apply, extract, forbidden,
        manager: () => Workspaces.createManager({ chrome, locks, now: () => NOW, id: () => `synthetic_workspace_${++serial}` }),
        nextId: () => `synthetic_archive_${++serial}` };
}
async function withGlobals(f, action) {
    const values = { chrome: f.chrome, navigator: { locks: f.locks }, crypto: webcrypto, fetch: f.forbidden('fetch') };
    const before = Object.fromEntries(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, value });
    try { return await action(); }
    finally { for (const [key, value] of Object.entries(before)) if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key]; }
}
function seed({ schema = 1, duplicate = false, mixed = false, noSchema = false, label = 'source' } = {}) {
    const raw = new Storage().cloneDefaultConfig(); if (!noSchema) raw.schemaVersion = schema;
    const urls = duplicate ? [...URLS, URLS[0], URLS[2]] : URLS;
    raw.links = urls.map((url, index) => ({ title: `${label} shortcut ${index} 中文`, url, icon: '🧭', category: index % 2 ? 'social' : 'work',
        ...(schema === 2 && (!mixed || index === 0) ? { layoutId: lid(index + 1) } : {}) }));
    raw.layout = { ...raw.layout, autoArrange: false, alignToGrid: false, positions: Object.fromEntries(URLS.flatMap((url, index) => VIEWS.map((view, n) =>
        [`${view}|${url}`, { x: index * 100 + n * 17 + 11.25, y: -index * 20 + n * 11 - 7.5 }])).concat([
        ['orphan|https://deleted.example/', { x: -71.5, y: 802.25 }], ['opaque-unparsed-key', { x: 33.5, y: -70.75 }]
    ])) };
    if (schema === 2) {
        raw.layout.identityVersion = 1;
        raw.layout.positionsById = Object.fromEntries(raw.links.filter(link => link.layoutId).map((link, index) => [link.layoutId,
            Object.fromEntries(VIEWS.map((view, n) => [view, { x: index * 200 + n * 10 + 45.5, y: -index * 50 + n * 7 - 10.25 }]))
        ]).concat([[lid(255), Object.fromEntries([['orphan|reserved', { x: 20.5, y: -90.75 }], ['__proto__', { x: 91.25, y: 14.5 }]])]]));
    }
    const task = (n, state = 'active') => ({ id: `${label}_task_${n}`, version: `${label}_version_${n}`, text: `${label} task ${n} 中文 📝`, state,
        removedFrom: state === 'removed' ? 'done' : null, createdAt: NOW, updatedAt: NOW });
    const tasks = { ...Tasks.initial(), enabled: true, revision: 7, records: [task(0), task(1, 'done'), task(2, 'removed')], pinnedId: `${label}_task_0`, receipts: [`${label}_receipt_original`],
        recovery: Array.from({ length: 8 }, (_, n) => ({ id: `${label}_history_${n}`, createdAt: NOW, content: { records: [task(n + 10)], pinnedId: null } })) };
    const focus = { ...Focus.initial(), enabled: true, revision: 4, durations: { focus: 37, break: 9 } }; focus.session.remainingMs = 37 * 60000;
    Object.assign(raw, { quote: `${label} quote 中文 🧭`, [Tasks.KEY]: tasks, [Scratchpad.KEY]: { ...Scratchpad.initial(), enabled: true, revision: 8, content: `${label} exact\n中文 🧭\nlast line` },
        [Countdown.KEY]: { ...Countdown.initial(), enabled: true, revision: 5, title: `${label} milestone`, targetDate: '2027-01-01' }, [Focus.KEY]: focus,
        __auth: 'SYNTHETIC_AUTH_SENTINEL_NEVER_PORTABLE', __syntheticOpaque: { keep: ['exact', 1, '中文'] }, __updatePreferences: { channel: 'synthetic' } });
    return raw;
}
function storageFor(f, session = null) {
    const storage = new Storage(session ? { workspace: session } : {}); storage._syncInitialized = true;
    return storage;
}
function backupFor(f, storage, workspaceManager = null) {
    return new Backup.Store(storage, Backup.createBackend(storage, f.chrome, f.locks), { workspaceManager, now: () => NOW, id: f.nextId });
}
async function boot(f) {
    const manager = f.manager(), session = manager.capture(), storage = storageFor(f, session);
    await session.ready(); return { manager, session, storage, store: backupFor(f, storage, manager) };
}
function values(f, id = 'default') {
    const entry = f.raw[Workspaces.REGISTRY_KEY].workspaces.find(entry => entry.id === id);
    return f.raw[Workspaces.bundleKey(entry)].values;
}
function scoped(raw) { return Object.fromEntries(Object.entries(raw).filter(([key]) => Workspaces.SCOPED_KEYS.includes(key))); }
async function multiWorkspace(f) {
    const b = await boot(f), added = [];
    for (const [label, schema, removed] of [['work', 2, false], ['retired', 1, true]]) {
        const entry = await b.manager.create(label), session = b.manager.capture(entry.id); await session.ready();
        await session.local.set(scoped(seed({ schema, duplicate: true, label })));
        if (removed) await b.manager.trash(entry.id); added.push(entry.id);
    }
    return { ...b, liveId: added[0], trashId: added[1] };
}
function exactOriginal(f, original) {
    for (const [key, value] of Object.entries(original)) assert.deepEqual(f.raw[key], value, `legacy source ${key}`);
    assert.deepEqual(f.raw[Workspaces.SNAPSHOT_KEY].values, original, 'pre-migration snapshot preserves every original JSON value');
}
function portablePersonal(raw, name) {
    const expected = clone(raw[APIs[name].KEY]); delete expected.revision;
    if (name === 'tasks') delete expected.receipts;
    if (name === 'focus') delete expected.session;
    return expected;
}
function assertNoProvider(f, ...portable) {
    assert.deepEqual(f.providers, []);
    for (const value of portable) assert(!JSON.stringify(value).includes('SYNTHETIC_AUTH_SENTINEL_NEVER_PORTABLE'));
}
function assertRelationships(config, original) {
    assert.deepEqual(config.links, original.links); assert.deepEqual(config.layout, original.layout);
    for (const link of config.links) for (const view of VIEWS) {
        const expected = link.layoutId ? original.layout.positionsById[link.layoutId][view] : original.layout.positions[`${view}|${link.url}`];
        const actual = link.layoutId ? config.layout.positionsById[link.layoutId][view] : config.layout.positions[`${view}|${link.url}`];
        assert.deepEqual(actual, expected, `${link.title}/${view}`);
    }
}

for (const shape of [{ schema: 1 }, { schema: 1, noSchema: true }, { schema: 1, duplicate: true }, { schema: 2 }, { schema: 2, duplicate: true }, { schema: 2, mixed: true }]) {
    bounded(`startup and ordinary reads preserve three raw URL spellings, identity maps and modules ${JSON.stringify(shape)}`, async () => {
        const original = seed(shape), f = fixture(original);
        await withGlobals(f, async () => {
            const b = await boot(f); exactOriginal(f, original);
            const migrated = clone(f.raw), writes = f.writes.length;
            assert.deepEqual(await b.session.local.get(Object.keys(scoped(original))), scoped(original));
            assertRelationships(await b.storage.getAll(), original);
            assert.deepEqual(await b.storage.get('links'), original.links);
            assertRelationships(await b.storage.getLayoutSnapshotForUpdate(), original);
            assertRelationships(await b.storage.getAllForBackup(), original);
            for (const api of Object.values(APIs)) assert.deepEqual(values(f)[api.KEY], original[api.KEY]);
            await f.manager().capture().ready(); assert.equal(f.writes.length, writes); assert.deepEqual(f.raw, migrated);
            assert.deepEqual(values(f).links.map(link => link.layoutId), original.links.map(link => link.layoutId), 'no startup identity allocation');
            assertNoProvider(f);
        });
    });
}

for (const schema of [1, 2]) bounded(`real editor title/category, organizer, reorder and Delete/Undo preserve raw identities (schema ${schema})`, async () => {
    const original = seed({ schema }), f = fixture(original);
    await withGlobals(f, async () => {
        const b = await boot(f), h = createHarness(original.links);
        h.context.storageManager = b.storage; h.context.window.storageManager = b.storage;
        vm.runInContext(fs.readFileSync('shared/stored-shortcut-url.js', 'utf8'), h.context);
        h.component.layout = clone(original.layout); h.component.positions = clone(original.layout.positions);
        h.component.identityPositions = clone(original.layout.positionsById || {});
        h.component.layoutBaseline = await b.storage.getLayoutSnapshotForUpdate();
        const expected = clone(original);
        for (const index of [0, 1, 2]) for (const field of ['title', 'icon', 'category']) {
            h.component.openEditModal(index);
            const value = field === 'category' ? 'social' : field === 'icon' ? '📚' : `Explicit title ${index}`;
            h.component.modal.querySelector(`#shortcut-${field}`).value = value;
            await h.component.handleFormSubmit({ preventDefault() {} });
            expected.links[index][field] = value;
            assertRelationships(await b.storage.getAll(), expected);
        }
        const organizer = await b.storage.readShortcutOrganizerSnapshot();
        await b.storage.moveShortcutsToCategory({ indices: [2], destination: 'work', baseline: organizer.state }); expected.links[2].category = 'work';
        assertRelationships(await b.storage.getAll(), expected);
        const baseline = await b.storage.getLayoutSnapshotForUpdate();
        const reordered = [baseline.links[2], baseline.links[0], baseline.links[1]];
        assert(await b.storage.set('links', reordered, { expectedLinks: baseline.links, expectedLayoutGeneration: baseline.generation, operation: { type: 'reorder', from: 2, to: 0 } }));
        expected.links = [expected.links[2], expected.links[0], expected.links[1]];
        assertRelationships(await b.storage.getAll(), expected);
        const beforeUndo = clone(values(f)), current = await b.storage.getLayoutSnapshotForUpdate();
        const deletion = await b.storage.deleteShortcutWithUndo(1, { expectedLinks: current.links, expectedLayoutGeneration: current.generation });
        assert.deepEqual(values(f).links, expected.links.filter((_, index) => index !== 1));
        await b.storage.undoShortcutDeletion(deletion.receipt); assert.deepEqual(values(f), beforeUndo);
        exactOriginal(f, original); assertNoProvider(f);
    });
});

for (const mixed of [false, true]) bounded(`explicit URL collision uses each original raw coordinate including reserved views (mixed=${mixed})`, async () => {
    const original = seed({ schema: mixed ? 2 : 1, mixed }), f = fixture(original);
    await withGlobals(f, async () => {
        const b = await boot(f); let serial = 0;
        // Existing/reserved IDs are deliberately proposed first, proving they
        // cannot be reused by the real production allocator.
        const proposals = [lid(255), lid(1), lid(256), lid(257), lid(258)];
        b.storage.createLayoutIdentity = () => proposals[serial++] || lid(300 + serial);
        for (const index of [0, 2]) {
            const baseline = await b.storage.getLayoutSnapshotForUpdate(), next = clone(baseline.links); next[index].url = URLS[1];
            const result = await b.storage.set('links', next, { expectedLinks: baseline.links, expectedLayoutGeneration: baseline.generation,
                operation: { type: 'edit', index }, returnSnapshot: true }); assert(result && result.links);
        }
        const result = await b.storage.getLayoutSnapshotForUpdate(); assert.equal(new Set(result.links.map(link => link.layoutId)).size, 3);
        result.links.forEach((link, index) => {
            for (const view of VIEWS) assert.deepEqual(result.layout.positionsById[link.layoutId][view], original.links[index].layoutId
                ? original.layout.positionsById[original.links[index].layoutId][view] : original.layout.positions[`${view}|${original.links[index].url}`]);
        });
        assert.deepEqual(result.layout.positions, original.layout.positions);
        if (mixed) assert.deepEqual(result.layout.positionsById[lid(255)], original.layout.positionsById[lid(255)]);
        else { const recovery = await b.storage.getRecoveryBackup('original'); assertRelationships(recovery.data, original); assert.equal(recovery.version, '2.0'); }
        exactOriginal(f, original); assertNoProvider(f);
    });
});

for (const schema of [1, 2]) for (const destinationSchema of [1, 2]) for (const kind of ['manual', 'drive', 'recovery']) bounded(`${kind} version-2 JSON and real setAll restore retain schema-${schema} identity over schema-${destinationSchema} destination and prior recovery`, async () => {
    const original = seed({ schema, duplicate: true }), destination = seed({ schema: destinationSchema, label: 'destination' }), f = fixture(destination);
    await withGlobals(f, async () => {
        const b = await boot(f), source = new Storage(), before = clone(original);
        const payload = kind === 'manual' ? source.buildManualExportPayload(original, { exportDate: NOW }) : kind === 'drive'
            ? source.buildDriveBackupPayload(original, { createdAt: NOW, snapshotId: 'synthetic_snapshot', deviceId: 'synthetic_device' })
            : (await source.makeRecovery(original, 'synthetic-test')).payload;
        assert.equal(payload.version, '2.0'); assert.equal(payload.urlIdentityVersion, 1); assert.equal(payload.schemaVersion, schema);
        const parsed = JSON.parse(JSON.stringify(payload)), restored = b.storage.validateImportPayload(parsed); assertRelationships(restored, original);
        assert.equal(await b.storage.setAll(restored, { confirmedRestore: true, skipSyncInitialization: true, skipSyncSideEffects: true }), true);
        assertRelationships(await b.storage.getAll(), original);
        const recovery = await b.storage.getRecoveryBackup(); assert.equal(recovery.version, '2.0'); assert.equal(recovery.urlIdentityVersion, 1);
        assertRelationships(recovery.data, destination);
        for (const api of Object.values(APIs)) assert.deepEqual(values(f)[api.KEY], destination[api.KEY], 'configuration restore never replaces dedicated local content');
        assert.deepEqual(original, before); exactOriginal(f, destination); assertNoProvider(f, payload, recovery);
    });
});

bounded('full current complete archive export, parse, preview, restore and recovery retain live plus Trash and every module', async () => {
    const sourceRaw = seed({ schema: 2, duplicate: true }), destinationRaw = seed({ label: 'destination' });
    const incoming = fixture(sourceRaw), f = fixture(destinationRaw);
    await withGlobals(f, async () => {
        const source = await multiWorkspace(incoming), target = await multiWorkspace(f);
        const sourceBefore = clone(incoming.raw), targetBefore = clone(f.raw);
        const sourceText = await source.store.export(), file = Backup.parse(sourceText, source.storage);
        const baseline = Backup.parse(await target.store.export(), target.storage);
        assert.equal(file.schemaVersion, 4); assert.deepEqual(file.modules, Backup.MODULES);
        assert.equal(file.workspaces.length, 2); assert.equal(file.trash.length, 1);
        for (const entry of [...file.workspaces, ...file.trash]) {
            const saved = values(incoming, entry.id); assertRelationships(entry.modules.config.data, saved);
            for (const name of Object.keys(APIs)) assert.deepEqual(entry.modules[name], portablePersonal(saved, name));
        }
        const preview = await target.store.review(sourceText, null, { promptTarget: 'global-library', collectionTarget: 'global-collections' }); assert.equal(preview.workspaces.scope, 'all');
        const writesBefore = f.writes.length;
        assert((await target.store.restore(preview, { confirmed: true })).changed);
        const actual = Backup.parse(await target.store.export(), target.storage), recovery = Backup.parse(await target.store.recovery(), target.storage);
        compareRestore(file, baseline, actual, Backup.MODULES, recovery); compareRecovery(baseline, recovery, Backup.MODULES);
        for (const entry of targetBefore[Workspaces.REGISTRY_KEY].workspaces) assert.deepEqual(f.raw[Workspaces.bundleKey(entry)], targetBefore[Workspaces.bundleKey(entry)], 'original authoritative generation remains complete');
        for (const entry of actual.workspaces.concat(actual.trash)) {
            const saved = values(f, entry.id), prior = values(incoming, entry.id);
            assertRelationships(saved, prior);
            for (const [name, api] of Object.entries(APIs)) api.validate(saved[api.KEY]);
            assert.deepEqual(saved[Tasks.KEY].recovery, prior[Tasks.KEY].recovery); assert.deepEqual(saved[Focus.KEY].durations, prior[Focus.KEY].durations);
        }
        assert.equal(f.writes.slice(writesBefore).filter(write => Object.hasOwn(write, Workspaces.REGISTRY_KEY)).length, 1);
        assert.deepEqual(incoming.raw, sourceBefore); exactOriginal(f, destinationRaw); assertNoProvider(incoming, sourceText); assertNoProvider(f, actual, recovery);
    });
});

for (const destinationMode of ['legacy', 'workspace']) bounded(`old schema-1 complete archive round-trip through real ${destinationMode} restore`, async () => {
    const original = seed({ schema: 2, duplicate: true }), before = seed({ label: 'destination' }), incoming = fixture(original), f = fixture(before);
    await withGlobals(f, async () => {
        const sourceStorage = new Storage(), sourceStore = backupFor(incoming, sourceStorage);
        const sourceText = await sourceStore.export(), file = Backup.parse(sourceText, sourceStorage);
        assert.equal(file.schemaVersion, 1); assertRelationships(file.modules.config.data, original);
        for (const name of Object.keys(APIs)) assert.deepEqual(file.modules[name], portablePersonal(original, name));
        const target = destinationMode === 'workspace' ? await multiWorkspace(f) : { storage: storageFor(f) };
        target.store ||= backupFor(f, target.storage);
        const beforeSnapshot = destinationMode === 'workspace' ? await target.manager.exportSnapshot() : clone(f.raw);
        const preview = await target.store.review(sourceText, Backup.SCOPED_MODULES, destinationMode === 'workspace' ? { targetWorkspaceId: 'default' } : {});
        await target.store.restore(preview, { confirmed: true });
        const restored = destinationMode === 'workspace' ? values(f) : f.raw;
        assertRelationships(restored, original);
        for (const [name, api] of Object.entries(APIs)) {
            api.validate(restored[api.KEY]);
            const expected = portablePersonal(original, name), actual = portablePersonal(restored, name);
            if (name === 'tasks') { actual.records.forEach((record, index) => { assert.notEqual(record.version, expected.records[index].version); record.version = expected.records[index].version; }); }
            assert.deepEqual(actual, expected);
        }
        const recovery = Backup.parse(await target.store.recovery(), target.storage);
        const priorModules = recovery.schemaVersion === 1 ? recovery.modules : recovery.workspaces.find(entry => entry.id === 'default').modules;
        assertRelationships(priorModules.config.data, before);
        for (const name of Object.keys(APIs)) assert.deepEqual(priorModules[name], portablePersonal(before, name));
        if (destinationMode === 'workspace') {
            const after = await target.manager.exportSnapshot();
            for (const id of [target.liveId, target.trashId]) assert.deepEqual(after.bundles.find(b => b.id === id), beforeSnapshot.bundles.find(b => b.id === id));
            exactOriginal(f, before);
        }
        assert.deepEqual(incoming.raw, original); assertNoProvider(incoming, file); assertNoProvider(f, recovery);
    });
});

for (const schema of [2, 3]) bounded(`older multi-workspace complete format ${schema} retains raw spellings through full restore`, async () => {
    const incoming = fixture(seed({ schema: 2, duplicate: true })), f = fixture(seed({ label: 'destination' }));
    await withGlobals(f, async () => {
        const source = await multiWorkspace(incoming), target = await multiWorkspace(f);
        const selected = [...Backup.SCOPED_MODULES, ...(schema === 3 ? ['prompts'] : [])];
        const sourceText = await source.store.export(selected), file = Backup.parse(sourceText, source.storage);
        assert.equal(file.schemaVersion, schema);
        const baseline = Backup.parse(await target.store.export(), target.storage);
        await target.store.restore(await target.store.review(sourceText, null, { promptTarget: 'global-library' }), { confirmed: true });
        const actual = Backup.parse(await target.store.export(), target.storage), recovery = Backup.parse(await target.store.recovery(), target.storage);
        // Use the full source only as an independent expectation for unchanged
        // global module(s); the actual restored input is the older full file.
        const fullSource = Backup.parse(await source.store.export(), source.storage);
        compareRestore(fullSource, baseline, actual, selected, recovery); compareRecovery(baseline, recovery, selected);
        assertNoProvider(incoming, sourceText); assertNoProvider(f, actual, recovery);
    });
});

for (const mode of ['recovery-write', 'recovery-readback', 'staged-write', 'staged-readback', 'late-source']) bounded(`complete restore ${mode} failure never overwrites authoritative raw URL content`, async () => {
    const incoming = fixture(seed({ schema: 2, duplicate: true })), f = fixture(seed({ label: 'destination' }));
    await withGlobals(f, async () => {
        const source = await multiWorkspace(incoming), target = await multiWorkspace(f);
        const preview = await target.store.review(await source.store.export(Backup.SCOPED_MODULES));
        const original = clone(f.raw), registry = clone(f.raw[Workspaces.REGISTRY_KEY]); const count = f.writes.length; let failedKey;
        f.hooks.set = (written, raw, apply) => {
            if (Object.hasOwn(written, Backup.WORKSPACE_RECOVERY_KEY)) {
                if (mode === 'recovery-write') throw Error('synthetic recovery write failure');
                if (mode === 'recovery-readback') { apply(written); failedKey = Backup.WORKSPACE_RECOVERY_KEY; return; }
            }
            const staged = Object.keys(written).find(key => key.startsWith(Workspaces.PREFIX));
            if (staged) {
                if (mode === 'staged-write') throw Error('synthetic staged write failure');
                if (mode === 'staged-readback') { apply(written); failedKey = staged; return; }
                if (mode === 'late-source') { apply(written); values(f, target.liveId).links[0].url = 'https://example.com/'; return; }
            }
            return DEFER;
        };
        f.hooks.get = keys => { if (failedKey && (keys == null || keys.includes(failedKey))) throw Error('synthetic readback failure'); return DEFER; };
        await assert.rejects(target.store.restore(preview, { confirmed: true }), code(mode.startsWith('recovery') ? 'RECOVERY' : mode === 'late-source' ? 'CONFLICT' : 'UNCONFIRMED'));
        delete f.hooks.get; delete f.hooks.set;
        assert.deepEqual(f.raw[Workspaces.REGISTRY_KEY], registry);
        assert.equal(f.writes.slice(count).filter(write => Object.hasOwn(write, Workspaces.REGISTRY_KEY)).length, 0, 'zero authority overwrite');
        for (const entry of registry.workspaces) {
            const expected = clone(original[Workspaces.bundleKey(entry)]);
            if (mode === 'late-source' && entry.id === target.liveId) expected.values.links[0].url = 'https://example.com/';
            assert.deepEqual(f.raw[Workspaces.bundleKey(entry)], expected, 'no rollback erases the newer raw spelling');
        }
        assertNoProvider(f);
    });
});

bounded('raw spelling change after complete preview rejects with zero writes', async () => {
    const incoming = fixture(seed({ schema: 2 })), f = fixture(seed());
    await withGlobals(f, async () => {
        const source = await boot(incoming), target = await boot(f), preview = await target.store.review(await source.store.export(Backup.SCOPED_MODULES));
        values(f).links[0].url = URLS[1]; const before = clone(f.raw), writes = f.writes.length;
        await assert.rejects(target.store.restore(preview, { confirmed: true }), code('CONFLICT'));
        assert.deepEqual(f.raw, before); assert.equal(f.writes.length, writes); assertNoProvider(f);
    });
});

for (const kind of ['links', 'layout']) bounded(`${kind} CAS compares exact raw spelling before any write`, async () => {
    const f = fixture(seed());
    await withGlobals(f, async () => {
        const b = await boot(f), baseline = await b.storage.getLayoutSnapshotForUpdate(); values(f).links[0].url = URLS[1];
        const before = clone(f.raw), writes = f.writes.length;
        await assert.rejects(kind === 'links' ? b.storage.set('links', baseline.links.map((link, index) => index ? link : { ...link, title: 'Pending edit' }),
            { expectedLinks: baseline.links, expectedLayoutGeneration: baseline.generation, operation: { type: 'edit', index: 0 } })
            : b.storage.applyLayoutPatch({}, { [`all|${URLS[0]}`]: { x: 1000, y: 1000 } }, baseline), code(kind === 'links' ? 'LINKS_CONFLICT' : 'LAYOUT_CONTEXT_CHANGED'));
        assert.deepEqual(f.raw, before); assert.equal(f.writes.length, writes); assertNoProvider(f);
    });
});

bounded('existing canonical unknown-field Delete/Undo contract retains every unknown value', async () => {
    const original = seed(); original.links = [{ title: 'Canonical unknown contract', url: URLS[1], icon: '🧭', category: 'work', unknown: { exact: ['keep', 7] } }];
    original.categories[0].unknown = { keep: 'category' }; original.layout.unknown = { keep: 'layout' };
    const f = fixture(original);
    await withGlobals(f, async () => {
        const storage = storageFor(f), deletion = await storage.deleteShortcutWithUndo(0, { expectedLinks: original.links, expectedLayoutGeneration: null });
        await storage.undoShortcutDeletion(deletion.receipt); assert.deepEqual(f.raw, original); assertNoProvider(f);
    });
});

for (const mutate of [raw => { raw.links[0].unknownMeaning = { keep: true }; }, raw => { raw.links[1].layoutId = raw.links[0].layoutId; }, raw => { delete raw.links[0].layoutId; }]) {
    bounded(`unknown noncanonical fields or invalid duplicate identities reject migration without writes: ${mutate.toString()}`, async () => {
        const original = seed({ schema: 2, duplicate: true }); mutate(original); const f = fixture(original);
        await withGlobals(f, async () => { await assert.rejects(boot(f)); assert.deepEqual(f.raw, original); assert.equal(f.writes.length, 0); assertNoProvider(f); });
    });
}

for (const schema of [1, 2]) bounded(`duplicate raw URL Delete/Undo retains every surviving ID and source association (schema ${schema})`, async () => {
    const original = seed({ schema, duplicate: true }), f = fixture(original);
    await withGlobals(f, async () => {
        const b = await boot(f), baseline = await b.storage.getLayoutSnapshotForUpdate();
        const deleted = await b.storage.deleteShortcutWithUndo(0, { expectedLinks: baseline.links, expectedLayoutGeneration: baseline.generation });
        const survivorIds = Object.fromEntries(values(f).links.map(link => [link.title, link.layoutId]));
        await b.storage.undoShortcutDeletion(deleted.receipt);
        const saved = values(f); assert.deepEqual(saved.layout.positions, original.layout.positions);
        assert.equal(saved.schemaVersion, 2);
        saved.links.forEach((link, index) => {
            const prior = original.links[index], withoutIdentity = value => { const copy = clone(value); delete copy.layoutId; return copy; };
            assert.deepEqual(withoutIdentity(link), withoutIdentity(prior));
            if (Object.hasOwn(survivorIds, link.title) && survivorIds[link.title]) assert.equal(link.layoutId, survivorIds[link.title]);
            if (link.layoutId) for (const view of VIEWS) assert.deepEqual(saved.layout.positionsById[link.layoutId][view], prior.layoutId
                ? original.layout.positionsById[prior.layoutId][view] : original.layout.positions[`${view}|${prior.url}`]);
        });
        if (schema === 2) assert.deepEqual(saved.layout, original.layout);
        exactOriginal(f, original); assertNoProvider(f);
    });
});

bounded('explicit layout change allocates exact duplicate identities without changing raw source spelling or schema provenance', async () => {
    const original = seed({ duplicate: true }), f = fixture(original);
    await withGlobals(f, async () => {
        const b = await boot(f), baseline = await b.storage.getLayoutSnapshotForUpdate();
        const saved = await b.storage.applyLayoutPatch({ autoArrange: false }, {}, baseline);
        assert.equal(values(f).schemaVersion, 2);
        saved.links.forEach((link, index) => {
            assert.equal(link.url, original.links[index].url);
            if (link.layoutId) for (const view of VIEWS) assert.deepEqual(saved.layout.positionsById[link.layoutId][view], original.layout.positions[`${view}|${original.links[index].url}`]);
        });
        assert.deepEqual(saved.layout.positions, original.layout.positions);
        assertRelationships((await b.storage.getRecoveryBackup('original')).data, original);
        exactOriginal(f, original); assertNoProvider(f);
    });
});

for (const mutation of ['collision', 'layout', 'delete-undo', 'restore']) bounded(`explicit ${mutation} keeps an absent historical schema marker absent`, async () => {
    const original = seed({ noSchema: true, duplicate: mutation !== 'collision' }), f = fixture(original);
    await withGlobals(f, async () => {
        const b = await boot(f), baseline = await b.storage.getLayoutSnapshotForUpdate();
        assert.equal(Object.hasOwn(values(f), 'schemaVersion'), false);
        if (mutation === 'collision') {
            const next = clone(baseline.links); next[0].url = URLS[1];
            assert(await b.storage.set('links', next, { expectedLinks: baseline.links, expectedLayoutGeneration: baseline.generation, operation: { type: 'edit', index: 0 } }));
        } else if (mutation === 'layout') await b.storage.applyLayoutPatch({ autoArrange: false }, {}, baseline);
        else if (mutation === 'delete-undo') {
            const deletion = await b.storage.deleteShortcutWithUndo(0, { expectedLinks: baseline.links, expectedLayoutGeneration: baseline.generation });
            await b.storage.undoShortcutDeletion(deletion.receipt);
        } else {
            const incoming = seed({ schema: 2 }), payload = b.storage.buildManualExportPayload(incoming);
            assert.equal(await b.storage.setAll(b.storage.validateImportPayload(payload), { confirmedRestore: true, skipSyncInitialization: true, skipSyncSideEffects: true }), true);
            assertRelationships(await b.storage.getAll(), incoming);
        }
        assert.equal(Object.hasOwn(values(f), 'schemaVersion'), false, 'explicit actions do not invent a historically absent marker');
        exactOriginal(f, original); assertNoProvider(f);
    });
});

for (const status of ['running', 'paused', 'uncertain']) bounded(`complete restore refuses active Focus ${status} without writes and a partial restore retains it exactly`, async () => {
    const original = seed(), incoming = fixture(seed({ schema: 2 }));
    original[Focus.KEY].session = { id: 'synthetic_active_focus', phase: 'focus', status, remainingMs: 30000,
        startedAt: status === 'running' ? 1000 : null, deadline: status === 'running' ? 31000 : null };
    const f = fixture(original);
    await withGlobals(f, async () => {
        const source = await boot(incoming), target = await multiWorkspace(f), text = await source.store.export(Backup.SCOPED_MODULES);
        const preview = await target.store.review(text), before = clone(f.raw), writes = f.writes.length;
        assert.equal(preview.current.focus.activeSession, true);
        await assert.rejects(target.store.restore(preview, { confirmed: true }), code('FOCUS_ACTIVE'));
        assert.deepEqual(f.raw, before); assert.equal(f.writes.length, writes);
        const legacy = backupFor(incoming, new Storage());
        const scratchpadText = await legacy.export(['scratchpad']);
        await target.store.restore(await target.store.review(scratchpadText, ['scratchpad'], { targetWorkspaceId: 'default' }), { confirmed: true });
        assert.deepEqual(values(f)[Focus.KEY], original[Focus.KEY]); assert.deepEqual(values(f).links, original.links); assert.deepEqual(values(f).layout, original.layout);
        for (const api of [Tasks, Countdown]) assert.deepEqual(values(f)[api.KEY], original[api.KEY]);
        exactOriginal(f, original); assertNoProvider(f);
    });
});

bounded('exporting an active Focus session preserves raw original while omitting only documented portable fields', async () => {
    const original = seed({ schema: 2, duplicate: true });
    original[Focus.KEY].session = { id: 'synthetic_export_focus', phase: 'focus', status: 'running', remainingMs: 30000, startedAt: 1000, deadline: 31000 };
    const f = fixture(original);
    await withGlobals(f, async () => {
        const b = await boot(f), before = clone(f.raw), writes = f.writes.length;
        const text = await b.store.export(), file = Backup.parse(text, b.storage), modules = file.workspaces[0].modules;
        for (const name of Object.keys(APIs)) assert.deepEqual(modules[name], portablePersonal(original, name));
        assert(!text.includes('synthetic_export_focus')); assert(!Object.hasOwn(modules.focus, 'session'));
        assert.deepEqual(f.raw, before); assert.equal(f.writes.length, writes); exactOriginal(f, original); assertNoProvider(f, text);
    });
});

for (const mutate of [
    file => { delete file.urlIdentityVersion; }, file => { file.urlIdentityVersion = 2; }, file => { file.version = '1.0'; },
    file => { file.data.links[0].unknownMeaning = { keep: true }; }, file => { file.data.links[2].url = '//example.com'; },
    file => { file.metadata.urlIdentityVersion = 0; }, file => { file.unrecognizedEnvelopeField = true; }
]) bounded(`portable stored-URL envelope corruption rejects without writes: ${mutate.toString()}`, async () => {
    const original = seed({ schema: 2 }), f = fixture(original);
    await withGlobals(f, async () => {
        const b = await boot(f), payload = JSON.parse(JSON.stringify(b.storage.buildDriveBackupPayload(await b.storage.getAllForBackup())));
        mutate(payload); const before = clone(f.raw), writes = f.writes.length;
        assert.throws(() => b.storage.validateImportPayload(payload));
        assert.deepEqual(f.raw, before); assert.equal(f.writes.length, writes); assertNoProvider(f);
    });
});

bounded('complete archive validates unknown noncanonical fields even in an unselected module before any restore write', async () => {
    const f = fixture(seed());
    await withGlobals(f, async () => {
        const b = await multiWorkspace(f), file = JSON.parse(await b.store.export());
        file.trash[0].modules.config.data.links[0].unknownMeaning = { keep: true };
        const before = clone(f.raw), writes = f.writes.length;
        assert.throws(() => b.store.review(JSON.stringify(file), ['scratchpad']));
        assert.deepEqual(f.raw, before); assert.equal(f.writes.length, writes); assertNoProvider(f);
    });
});
