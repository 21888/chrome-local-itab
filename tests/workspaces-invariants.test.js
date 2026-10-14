/* Focused adversarial workspace tests. All storage, clocks, locks and providers
 * are synthetic; this file never opens a browser or touches a user profile. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const project = process.env.ITAB_WORKSPACE_SOURCE_ROOT || path.resolve(__dirname, '..');
const Workspaces = require(path.join(project, 'shared/workspaces.js'));
const Tasks = require(path.join(project, 'shared/local-tasks-store.js'));
const Scratchpad = require(path.join(project, 'shared/local-scratchpad-store.js'));
const Countdown = require(path.join(project, 'shared/local-countdown-store.js'));
const Focus = require(path.join(project, 'shared/local-focus-store.js'));
const StorageManager = require(path.join(project, 'storage.js'));
const CompleteBackup = require(path.join(project, 'shared/complete-backup.js'));
const NOW = '2026-10-10T12:00:00.000Z';
const copy = value => structuredClone(value);
const DEFER = Symbol('use normal storage');
const constants = {
    registry: '__localItabWorkspaceRegistryV1',
    activation: '__localItabWorkspaceActivationV1',
    recovery: '__localItabWorkspacePreMigrationV1',
    stage: '__localItabWorkspaceStageV1',
    prefix: '__localItabWorkspaceV1:'
};
const bounded = (name, fn) => test(name, { timeout: 5000 }, fn);
const code = (...expected) => error => expected.includes(error.code);
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};

function fixture(initial = {}) {
    const raw = copy(initial), writes = [], removals = [], reads = [], hooks = {}, providers = [];
    const queues = new Map(), locksState = new Map(), listeners = new Set(), lockNames = [];
    let serial = 0;
    const locks = { request(name, options, action) {
        action ||= options; lockNames.push(name);
        const mode = options?.mode === 'shared' ? 'shared' : 'exclusive';
        if (!locksState.has(name)) locksState.set(name, { active: 0, exclusive: false, waiting: [] });
        const state = locksState.get(name);
        const drain = () => {
            if (state.exclusive || !state.waiting.length) return;
            if (state.active && state.waiting[0].mode === 'exclusive') return;
            do {
                const next = state.waiting.shift(); state.active++; state.exclusive = next.mode === 'exclusive';
                Promise.resolve().then(next.action).then(next.resolve, next.reject).finally(() => { state.active--; if (next.mode === 'exclusive') state.exclusive = false; drain(); });
            } while (!state.exclusive && state.waiting[0]?.mode === 'shared');
        };
        const next = new Promise((resolve, reject) => { state.waiting.push({ mode, action, resolve, reject }); drain(); });
        queues.set(name, next.catch(() => {})); return next;
    } };
    const extract = keys => {
        if (keys === null || keys === undefined) return copy(raw);
        if (typeof keys === 'string') keys = [keys];
        if (!Array.isArray(keys)) return Object.fromEntries(Object.entries(keys).map(([key, value]) => [key, copy(Object.hasOwn(raw, key) ? raw[key] : value)]));
        return Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, copy(raw[key])]));
    };
    const notify = changes => { for (const fn of listeners) fn(copy(changes), 'local'); };
    const apply = values => {
        const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { oldValue: copy(raw[key]), newValue: copy(value) }]));
        Object.assign(raw, copy(values)); notify(changes);
    };
    const local = {
        async get(keys) {
            reads.push(copy(keys));
            if (hooks.get) { const result = await hooks.get(keys, raw); if (result !== DEFER) return result; }
            return extract(keys);
        },
        async set(values) {
            writes.push(copy(values));
            if (hooks.set) { const result = await hooks.set(values, raw, apply); if (result !== DEFER) return result; }
            apply(values);
        },
        async remove(keys) {
            if (!Array.isArray(keys)) keys = [keys]; removals.push(copy(keys));
            if (hooks.remove) { const result = await hooks.remove(keys, raw); if (result !== DEFER) return result; }
            const changes = Object.fromEntries(keys.map(key => [key, { oldValue: copy(raw[key]) }]));
            for (const key of keys) delete raw[key]; notify(changes);
        },
        async getBytesInUse() { return Buffer.byteLength(JSON.stringify(raw)); },
        QUOTA_BYTES: 10 * 1024 * 1024
    };
    const forbidden = name => async (...args) => { providers.push([name, copy(args)]); throw Error(`Provider access forbidden: ${name}`); };
    const chrome = { storage: { local,
        sync: { get: forbidden('sync.get'), set: forbidden('sync.set'), remove: forbidden('sync.remove') },
        onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) }
    }, identity: { getAuthToken: forbidden('identity.getAuthToken') }, permissions: { request: forbidden('permissions.request') },
    runtime: { getManifest: () => ({ version: '1.1.21' }) } };
    const manager = () => Workspaces.createManager({ chrome, locks, now: () => NOW, id: () => `synthetic_workspace_${++serial}` });
    return { raw, writes, removals, reads, hooks, providers, locks, lockNames, chrome, manager, apply, extract,
        async settled() { await Promise.all([...queues.values()]); await new Promise(resolve => setImmediate(resolve)); }
    };
}

function seeded() {
    const tasks = Tasks.initial(); tasks.enabled = true; tasks.revision = 3;
    tasks.records = [{ id: 'task_original', version: 'version_original', text: 'PRIVATE_TASK_A', state: 'active', removedFrom: null, createdAt: NOW, updatedAt: NOW }];
    tasks.pinnedId = 'task_original';
    return {
        quote: 'ORIGINAL_QUOTE',
        links: [{ title: 'Original site', url: 'https://example.com/', category: 'work' }],
        [Tasks.KEY]: tasks,
        [Scratchpad.KEY]: { ...Scratchpad.initial(), enabled: true, revision: 7, content: 'PRIVATE_NOTE_A\n中文' },
        [Countdown.KEY]: { ...Countdown.initial(), enabled: true, revision: 4, title: 'Private date', targetDate: '2027-01-01' },
        [Focus.KEY]: { ...Focus.initial(), enabled: true, revision: 2 },
        privacy: { onlineFavicons: false },
        sync: { enabled: false, lastSync: 'keep', lastError: '', includeLargeAssets: false },
        __auth: 'SYNTHETIC_AUTH_DO_NOT_EXPORT', __updatePreferences: { channel: 'stable' },
        __futureOpaqueKey: { preserve: true }
    };
}

async function selected(f, manager = f.manager()) {
    const registry = await manager.ready(), session = manager.capture(registry.defaultId);
    await session.ready(); return { manager, registry, session };
}

async function withGlobals(f, action) {
    const saved = Object.fromEntries(['chrome', 'navigator', 'crypto'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    Object.defineProperty(globalThis, 'chrome', { configurable: true, value: f.chrome });
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: f.locks } });
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
    try { return await action(); }
    finally { for (const [key, descriptor] of Object.entries(saved)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } }
}

bounded('migration is one-time, preserves original source, and verifies recovery before activation', async () => {
    const original = seeded(), f = fixture(original), { registry, session } = await selected(f);
    assert.equal(registry.workspaces.filter(item => !item.deletedAt).length, 1);
    assert.equal(registry.lastUsedId, registry.defaultId);
    for (const [key, value] of Object.entries(original)) assert.deepEqual(f.raw[key], value, `legacy ${key} must survive migration`);
    for (const key of ['quote', 'links', Tasks.KEY, Scratchpad.KEY, Countdown.KEY, Focus.KEY]) assert.deepEqual((await session.local.get([key]))[key], original[key]);
    const recoveryIndex = f.writes.findIndex(value => Object.hasOwn(value, constants.recovery));
    const activationIndex = f.writes.findIndex(value => Object.hasOwn(value, constants.activation));
    assert(recoveryIndex >= 0 && activationIndex > recoveryIndex);
    assert(f.reads.some(keys => keys === null || Array.isArray(keys) && keys.includes(constants.recovery)), 'recovery must be read back');
    const committed = copy(f.raw), writes = f.writes.length;
    await f.manager().ready(); await f.manager().ready();
    assert.equal(f.writes.length, writes); assert.deepEqual(f.raw, committed);
    assert.deepEqual(f.providers, []);
});

for (const onlineWallpapers of [false, true]) for (const onlineFavicons of [false, true]) bounded(`legacy wallpaper privacy (${onlineWallpapers}/${onlineFavicons}) migrates without changing privacy or contacting providers`, async () => {
    const original = seeded(); original.privacy = { onlineWallpapers, onlineFavicons };
    const f = fixture(original), { session } = await selected(f);
    assert.deepEqual(f.raw.privacy, original.privacy);
    assert.deepEqual(f.raw[constants.recovery].values.privacy, original.privacy);
    assert.deepEqual((await session.local.get(['privacy'])).privacy, original.privacy);
    assert.deepEqual((await session.local.get(['links'])).links, original.links);
    await withGlobals(f, async () => {
        const storage = new StorageManager({ workspace: session }); storage._syncInitialized = true;
        const config = await storage.getAll();
        assert.deepEqual(config.privacy, { onlineFavicons });
        assert.deepEqual(storage.completeBackupConfigFromRaw(await session.local.get(null)).data.privacy, { onlineFavicons });
    });
    assert.deepEqual(f.raw.privacy, original.privacy);
    assert.deepEqual(f.providers, []);
    const before = copy(f.raw), writes = f.writes.length;
    await f.manager().ready(); assert.deepEqual(f.raw, before); assert.equal(f.writes.length, writes);
});

for (const privacy of [
    { onlineWallpapers: 'false', onlineFavicons: false },
    { onlineWallpapers: null, onlineFavicons: false },
    { onlineWallpapers: 0, onlineFavicons: false },
    { onlineWallpapers: [], onlineFavicons: false },
    { onlineWallpapers: false, onlineFavicons: 'false' },
    { onlineWallpapers: false, onlineFavicons: false, unknownPrivacy: true }
]) bounded(`legacy privacy projection rejects malformed or unknown supplied fields (${JSON.stringify(privacy)})`, async () => {
    const original = { ...seeded(), privacy }, f = fixture(original);
    await assert.rejects(f.manager().ready(), code('WORKSPACE_CORRUPT'));
    assert.deepEqual(f.raw, original); assert.equal(f.writes.length, 0); assert.deepEqual(f.providers, []);
});

bounded('deprecated wallpaper privacy remains invalid in an imported portable archive', () => {
    const storage = new StorageManager(), archive = storage.completeBackupConfigFromRaw({});
    archive.data.privacy.onlineWallpapers = false;
    assert.throws(() => storage.validateCompleteBackupConfig(archive));
});

bounded('interrupted legacy privacy migration resumes from its exact original recovery', async () => {
    const original = seeded(); original.privacy = { onlineWallpapers: true };
    const f = fixture(original); let interrupted = false;
    f.hooks.set = (values, raw, apply) => {
        if (Object.hasOwn(values, constants.recovery) && !interrupted) {
            interrupted = true; apply(values); throw Error('synthetic interruption after recovery');
        }
        return DEFER;
    };
    await assert.rejects(f.manager().ready(), code('WORKSPACE_WRITE'));
    assert(interrupted); assert.deepEqual(f.raw.privacy, original.privacy);
    assert.deepEqual(f.raw[constants.recovery].values, original);
    assert.equal(f.raw[constants.activation], undefined);
    const recovery = copy(f.raw[constants.recovery]);
    const { session } = await selected(f);
    assert.deepEqual(f.raw[constants.recovery], recovery);
    assert.deepEqual((await session.local.get(['privacy'])).privacy, original.privacy);
    assert.deepEqual(f.raw.privacy, original.privacy); assert.deepEqual(f.providers, []);
});

for (const mode of ['throw', 'false', 'drop', 'corrupt']) bounded(`migration recovery ${mode} must block activation and keep legacy source`, async () => {
    const original = seeded(), f = fixture(original);
    f.hooks.set = (values, raw, apply) => {
        if (!Object.hasOwn(values, constants.recovery)) return DEFER;
        if (mode === 'throw') throw Error('synthetic quota failure');
        if (mode === 'false') return false;
        if (mode === 'drop') return undefined;
        apply(values); raw[constants.recovery] = { corrupt: true }; return undefined;
    };
    await assert.rejects(f.manager().ready());
    assert.equal(f.raw[constants.activation], undefined);
    for (const [key, value] of Object.entries(original)) assert.deepEqual(f.raw[key], value);
});

for (const corrupt of [null, { schemaVersion: 99 }, { ...Scratchpad.initial(), content: 42 }]) bounded(`corrupt legacy personal data is never defaulted (${JSON.stringify(corrupt)})`, async () => {
    const f = fixture({ ...seeded(), [Scratchpad.KEY]: corrupt }), before = copy(f.raw);
    await assert.rejects(f.manager().ready());
    assert.equal(f.raw[constants.activation], undefined);
    for (const [key, value] of Object.entries(before)) assert.deepEqual(f.raw[key], value);
});

for (const corrupt of [{ quote: 42 }, { links: 'bad' }, { schemaVersion: 99 }]) bounded(`corrupt legacy config is never defaulted (${JSON.stringify(corrupt)})`, async () => {
    const f = fixture({ ...seeded(), ...corrupt });
    await assert.rejects(f.manager().ready()); assert.equal(f.raw[constants.activation], undefined);
});

for (const read of [() => { throw Error('read rejected'); }, () => null, () => []]) bounded(`failed/malformed migration read is never fresh storage (${read.toString()})`, async () => {
    const f = fixture(seeded()); f.hooks.get = read;
    await assert.rejects(f.manager().ready()); assert.equal(f.writes.length, 0);
});

for (const key of [constants.registry, constants.activation]) bounded(`corrupt active marker ${key} cannot restart migration`, async () => {
    const f = fixture(seeded()); await selected(f); f.raw[key] = { corrupt: true };
    const before = copy(f.raw), writes = f.writes.length;
    await assert.rejects(f.manager().ready()); assert.deepEqual(f.raw, before); assert.equal(f.writes.length, writes);
});

bounded('cross-tab stale personal writes conflict without changing sibling data or providers', async () => {
    const f = fixture(seeded()), { manager, registry } = await selected(f);
    const a = manager.capture(registry.defaultId), b = f.manager().capture(registry.defaultId);
    const storeA = new Scratchpad.Store(a.createBackend(Scratchpad.KEY, Scratchpad.LOCK));
    const storeB = new Scratchpad.Store(b.createBackend(Scratchpad.KEY, Scratchpad.LOCK));
    const oldA = await storeA.read(), oldB = await storeB.read();
    await storeA.mutate({ kind: 'content', value: 'newer text', revision: oldA.revision });
    await assert.rejects(storeB.mutate({ kind: 'content', value: 'stale text', revision: oldB.revision }), code('CONFLICT'));
    assert.equal((await storeB.read()).content, 'newer text'); assert.deepEqual(f.providers, []);
});

bounded('missing active namespace data cannot be synthesized into a fresh workspace', async () => {
    const f = fixture(seeded()), { registry } = await selected(f);
    for (const key of Object.keys(f.raw)) if (key.startsWith(`${constants.prefix}${registry.defaultId}:`)) delete f.raw[key];
    const before = copy(f.raw), writes = f.writes.length;
    const manager = f.manager();
    await assert.rejects(async () => { await manager.ready(); await manager.capture(registry.defaultId).local.get(null); });
    assert.deepEqual(f.raw, before); assert.equal(f.writes.length, writes);
});

for (const boundary of [constants.recovery, constants.stage, constants.registry, constants.activation]) bounded(`crash after ${boundary} write resumes without a second migration`, async () => {
    const original = seeded(), f = fixture(original); let interrupted = false;
    f.hooks.set = (values, raw, apply) => {
        if (interrupted || !Object.hasOwn(values, boundary)) return DEFER;
        interrupted = true; apply(values); throw Error('synthetic process interruption after commit');
    };
    await assert.rejects(f.manager().ready()); assert(interrupted, 'injected boundary must be reached');
    delete f.hooks.set;
    const { registry, session } = await selected(f);
    assert.equal(registry.workspaces.length, 1);
    assert.equal((await session.local.get(['quote'])).quote, original.quote);
    assert.equal((await session.local.get([Scratchpad.KEY]))[Scratchpad.KEY].content, original[Scratchpad.KEY].content);
    const writes = f.writes.length; await f.manager().ready(); assert.equal(f.writes.length, writes);
    for (const [key, value] of Object.entries(original)) assert.deepEqual(f.raw[key], value);
});

bounded('legacy writer changing source during awaited recovery blocks migration activation', async () => {
    const f = fixture(seeded()); let raced = false;
    f.hooks.set = (values, raw, apply) => {
        if (raced || !Object.hasOwn(values, constants.recovery)) return DEFER;
        raced = true; apply(values); raw.quote = 'NEWER_LEGACY_TAB_QUOTE'; return undefined;
    };
    await assert.rejects(f.manager().ready()); assert(raced);
    assert.equal(f.raw[constants.activation], undefined);
    assert.equal(f.raw.quote, 'NEWER_LEGACY_TAB_QUOTE');
});

for (const boundary of [constants.registry, constants.activation]) bounded(`legacy write during ${boundary} commit blocks first-session admission and retains both branches`, async () => {
    const original = seeded(), f = fixture(original), manager = f.manager(), session = manager.capture(); let raced = false;
    f.hooks.set = (values, raw, apply) => {
        if (raced || !Object.hasOwn(values, boundary)) return DEFER;
        raced = true; apply(values); f.apply({ quote: 'LATE_LEGACY_QUOTE' }); return undefined;
    };
    await assert.rejects(session.ready(), code('WORKSPACE_LEGACY_CONFLICT')); await f.settled();
    assert(raced); assert.equal(session.id, null); assert.equal(f.raw.quote, 'LATE_LEGACY_QUOTE');
    assert.deepEqual(f.raw[constants.recovery].values, original);
    const entry = f.raw[constants.registry].workspaces[0];
    assert.equal(f.raw[Workspaces.bundleKey(entry)].values.quote, original.quote);
    assert(f.raw[Workspaces.LEGACY_CONFLICT_KEY]); assert.equal(f.raw[Workspaces.LEGACY_CONFLICT_KEY].resolvedAt, undefined);
    const before = copy(f.raw), writes = f.writes.length;
    await assert.rejects(session.local.set({ quote: 'MUST_NOT_OVERWRITE_LATE_BRANCH' }));
    await assert.rejects(f.manager().capture().ready(), code('WORKSPACE_LEGACY_CONFLICT'));
    assert.deepEqual(f.raw, before); assert.equal(f.writes.length, writes);
    assert.deepEqual(f.removals, []); assert.deepEqual(f.providers, []);
});

bounded('existing activated metadata rechecks legacy changes that arrive while reading its bundles', async () => {
    const original = seeded(), source = fixture(original), { registry } = await selected(source);
    const f = fixture(source.raw), manager = f.manager(), session = manager.capture(); let raced = false;
    const key = Workspaces.bundleKey(registry.workspaces[0]);
    f.hooks.get = keys => {
        if (!raced && Array.isArray(keys) && keys.includes(key)) {
            raced = true; f.apply({ quote: 'LATE_EXISTING_METADATA_QUOTE' });
        }
        return DEFER;
    };
    await assert.rejects(session.ready(), code('WORKSPACE_LEGACY_CONFLICT')); await f.settled();
    assert(raced); assert.equal(session.id, null); assert.equal(f.raw.quote, 'LATE_EXISTING_METADATA_QUOTE');
    assert.deepEqual(f.raw[constants.recovery], source.raw[constants.recovery]);
    assert.deepEqual(f.raw[key], source.raw[key]); assert.deepEqual(f.removals, []); assert.deepEqual(f.providers, []);
});

for (const failPersistence of [false, true]) bounded(`final admission keeps an onChanged conflict when get returns an earlier snapshot (persist fails=${failPersistence})`, async () => {
    const original = seeded(), f = fixture(original), manager = f.manager(), session = manager.capture(); let raced = false;
    f.hooks.get = keys => {
        if (!raced && manager._activated && Array.isArray(keys) && keys.includes(Workspaces.SNAPSHOT_KEY) && keys.includes(Workspaces.LEGACY_CONFLICT_KEY)) {
            raced = true; const earlier = f.extract(keys); f.apply({ quote: 'LATE_FINAL_READ_QUOTE' }); return earlier;
        }
        return DEFER;
    };
    if (failPersistence) f.hooks.set = values => {
        if (Object.hasOwn(values, Workspaces.LEGACY_CONFLICT_KEY)) throw Error('synthetic conflict-marker write failure');
        return DEFER;
    };
    await assert.rejects(session.ready(), code('WORKSPACE_LEGACY_CONFLICT')); await f.settled();
    assert(raced); assert.equal(session.id, null); assert.equal(manager._legacyConflict, true);
    assert.equal(f.raw.quote, 'LATE_FINAL_READ_QUOTE'); assert.deepEqual(f.raw[constants.recovery].values, original);
    const entry = f.raw[constants.registry].workspaces[0]; assert.equal(f.raw[Workspaces.bundleKey(entry)].values.quote, original.quote);
    await assert.rejects(session.local.set({ quote: 'MUST_NOT_RESUME_WRITING' }));
    await assert.rejects(f.manager().capture().ready(), code(failPersistence ? 'WORKSPACE_WRITE' : 'WORKSPACE_LEGACY_CONFLICT'));
    delete f.hooks.set;
    await assert.rejects(f.manager().capture().ready(), code('WORKSPACE_LEGACY_CONFLICT'));
    assert.equal(f.raw.quote, 'LATE_FINAL_READ_QUOTE'); assert.deepEqual(f.raw[constants.recovery].values, original);
    assert.deepEqual(f.removals, []); assert.deepEqual(f.providers, []);
});

bounded('failed final admission read rejects without defaults and a new capture can retry verified metadata', async () => {
    const original = seeded(), f = fixture(original), manager = f.manager(); let failed = false;
    f.hooks.get = keys => {
        if (!failed && manager._activated && Array.isArray(keys) && keys.includes(Workspaces.SNAPSHOT_KEY)) {
            failed = true; throw Error('synthetic final admission read failure');
        }
        return DEFER;
    };
    await assert.rejects(manager.capture().ready(), code('WORKSPACE_READ'));
    assert(failed); assert.equal(manager._ready, null);
    const before = copy(f.raw), writes = f.writes.length, session = manager.capture();
    await session.ready(); assert.equal((await session.local.get(['quote'])).quote, original.quote);
    assert.deepEqual(f.raw, before); assert.equal(f.writes.length, writes);
    assert.deepEqual(f.raw[constants.recovery].values, original); assert.deepEqual(f.providers, []);
});

bounded('concurrent ready callers share one final admission and no extra lifecycle lock is needed after capture', async () => {
    const f = fixture(seeded()), manager = f.manager(); let finalReads = 0;
    f.hooks.get = keys => {
        if (manager._activated && Array.isArray(keys) && keys.includes(Workspaces.SNAPSHOT_KEY)) finalReads++;
        return DEFER;
    };
    const sessions = [manager.capture(), manager.capture()]; await Promise.all(sessions.map(session => session.ready()));
    assert.equal(finalReads, 1); assert.equal(sessions[0].id, sessions[1].id);
    await sessions[0].local.set({ quote: 'AFTER_VALID_ADMISSION' });
    assert.equal((await sessions[1].local.get(['quote'])).quote, 'AFTER_VALID_ADMISSION'); assert.equal(finalReads, 1);
});

bounded('missing explicit workspace never silently redirects to Default', async () => {
    const f = fixture(seeded()), { manager } = await selected(f), before = copy(f.raw);
    await assert.rejects(manager.capture('synthetic_missing_workspace').local.get(null));
    assert.deepEqual(f.raw, before);
});

bounded('create and rename preserve stable identity and reject stale registry revision', async () => {
    const f = fixture(seeded()), { manager } = await selected(f);
    const baseline = await manager.list(), entry = await manager.create('Second space', { expectedRevision: baseline.revision });
    assert.notEqual(entry.id, baseline.defaultId);
    const current = await manager.list();
    const renamed = await manager.rename(entry.id, 'Second renamed', { expectedRevision: current.revision });
    assert.equal(renamed.id, entry.id); assert.equal(renamed.generation, entry.generation); assert.equal(renamed.name, 'Second renamed');
    const before = copy(f.raw);
    await assert.rejects(manager.rename(entry.id, 'Stale name', { expectedRevision: current.revision }), code('WORKSPACE_CONFLICT'));
    assert.deepEqual(f.raw, before);
});

bounded('every content module and local preference writes only its captured workspace', async () => {
    const f = fixture(seeded()), { manager, registry, session: a } = await selected(f);
    const second = await manager.create('Second space'), b = manager.capture(second.id); await b.ready();
    const beforeA = await a.local.get(null), providerBefore = copy(f.raw.sync);
    const taskStore = new Tasks.Store(b.createBackend(Tasks.KEY, Tasks.LOCK), { now: () => NOW, id: () => 'task_second_space' });
    const tasks = await taskStore.mutate(taskStore.request('add', { text: 'PRIVATE_TASK_B' }));
    assert.equal(tasks.records[0].text, 'PRIVATE_TASK_B');
    const noteStore = new Scratchpad.Store(b.createBackend(Scratchpad.KEY, Scratchpad.LOCK));
    await noteStore.mutate({ kind: 'content', value: 'PRIVATE_NOTE_B', revision: (await noteStore.read()).revision });
    const dateStore = new Countdown.Store(b.createBackend(Countdown.KEY, Countdown.LOCK));
    await dateStore.mutate({ kind: 'save', value: { enabled: true, title: 'Second date', targetDate: '2027-03-01' }, revision: (await dateStore.read()).revision });
    const focusStore = new Focus.Store(b.createBackend(Focus.KEY, Focus.LOCK), { now: () => 100000, id: () => 'session_second_space' });
    await focusStore.mutate({ kind: 'duration', value: 45, revision: (await focusStore.read()).revision });
    await b.local.set({ quote: 'SECOND_QUOTE', links: [{ title: 'Second site', url: 'https://second.example/', category: 'work' }], appearance: { template: 'folio', colorMode: 'dark' }, search: { engine: 'bing', custom: '' } });
    assert.deepEqual(await a.local.get(null), beforeA);
    assert.equal((await b.local.get(['quote'])).quote, 'SECOND_QUOTE');
    assert.equal((await manager.capture(registry.defaultId).local.get([Scratchpad.KEY]))[Scratchpad.KEY].content, 'PRIVATE_NOTE_A\n中文');
    assert.deepEqual(f.raw.sync, providerBefore); assert.deepEqual(f.providers, []);
});

bounded('operation invoked before awaiting selection remains bound to its original session', async () => {
    const f = fixture(seeded()), { manager, registry, session } = await selected(f);
    const second = await manager.create('Second space');
    const pending = session.local.set({ quote: 'CAPTURED_DEFAULT_WRITE' });
    const selection = manager.select(second.id);
    await Promise.all([pending, selection]);
    assert.equal((await session.local.get(['quote'])).quote, 'CAPTURED_DEFAULT_WRITE');
    assert.notEqual((await manager.capture(second.id).local.get(['quote'])).quote, 'CAPTURED_DEFAULT_WRITE');
    assert.equal((await session.ready()).id, registry.defaultId);
    assert.equal((await manager.list()).lastUsedId, second.id);
});

bounded('lazy explicit session captures workspace before its first ready await', async () => {
    const f = fixture(seeded()), { manager, registry } = await selected(f), second = await manager.create('Second space');
    const otherPage = f.manager(), captured = otherPage.capture(registry.defaultId);
    const pending = captured.local.set({ quote: 'EXPLICIT_BEFORE_READY' });
    await manager.select(second.id); await pending;
    assert.equal((await captured.local.get(['quote'])).quote, 'EXPLICIT_BEFORE_READY');
    assert.notEqual((await manager.capture(second.id).local.get(['quote'])).quote, 'EXPLICIT_BEFORE_READY');
});

bounded('duplicate retains saved content while resetting the active focus session', async () => {
    const initial = seeded(); initial[Focus.KEY].session = { id: 'running_original', phase: 'focus', status: 'running', remainingMs: 1500000, startedAt: 100000, deadline: 1600000 };
    const f = fixture(initial), { manager, registry, session } = await selected(f);
    const duplicate = await manager.duplicate(registry.defaultId, 'Duplicate'), cloned = manager.capture(duplicate.id);
    const original = await session.local.get(null), result = await cloned.local.get(null);
    for (const key of ['quote', 'links', Scratchpad.KEY, Countdown.KEY]) assert.deepEqual(result[key], original[key]);
    assert.deepEqual(result[Tasks.KEY].records.map(task => task.text), original[Tasks.KEY].records.map(task => task.text));
    assert.equal(result[Focus.KEY].session.status, 'ready'); assert.equal(result[Focus.KEY].session.id, null);
    assert.deepEqual(result[Focus.KEY].durations, original[Focus.KEY].durations);
    assert.equal((await session.local.get([Focus.KEY]))[Focus.KEY].session.status, 'running');
});

bounded('Default remains protected; recoverable trash retains contents and invalidates old sessions', async () => {
    const f = fixture(seeded()), { manager, registry } = await selected(f);
    await assert.rejects(manager.trash(registry.defaultId));
    const second = await manager.create('Disposable'), oldSession = manager.capture(second.id); await oldSession.ready();
    await oldSession.local.set({ quote: 'RECOVER_ME' });
    await manager.select(second.id); await manager.trash(second.id);
    assert((await manager.list()).workspaces.find(item => item.id === second.id).deletedAt);
    assert.equal((await manager.list()).lastUsedId, registry.defaultId);
    const trashed = copy(f.raw); await assert.rejects(oldSession.local.set({ quote: 'STALE_TAB' })); assert.deepEqual(f.raw, trashed);
    const recovered = await manager.restore(second.id); assert.equal(recovered.id, second.id); assert.notEqual(recovered.generation, second.generation);
    assert.equal((await manager.capture(second.id).local.get(['quote'])).quote, 'RECOVER_ME');
    await assert.rejects(oldSession.local.set({ quote: 'OLD_GENERATION' }));
    assert((await manager.list()).workspaces.some(item => !item.deletedAt));
});

bounded('scoped enumeration and remove cannot reach sibling bundles or provider credentials', async () => {
    const f = fixture(seeded()), { manager, session } = await selected(f);
    const second = await manager.create('Second'), sibling = manager.capture(second.id); await sibling.local.set({ quote: 'SIBLING_SAFE' });
    const visible = await session.local.get(null);
    assert(!Object.keys(visible).some(key => key.startsWith(constants.prefix)), 'physical workspace keys stay hidden');
    assert(!Object.hasOwn(visible, constants.registry)); assert(!Object.hasOwn(visible, '__auth'));
    await session.local.remove(['quote', 'links']);
    assert.equal((await sibling.local.get(['quote'])).quote, 'SIBLING_SAFE');
    assert.equal(f.raw.__auth, 'SYNTHETIC_AUTH_DO_NOT_EXPORT');
    assert(f.raw[constants.registry]); assert.deepEqual(f.providers, []);
});

for (const mutate of [
    registry => { registry.schemaVersion = 99; },
    registry => { registry.revision = Number.MAX_SAFE_INTEGER + 1; },
    registry => { registry.lastUsedId = 'missing_workspace'; },
    registry => { registry.defaultId = 'missing_default'; },
    registry => { registry.workspaces.push(copy(registry.workspaces[0])); },
    registry => { registry.workspaces[0].generation = '../other_workspace'; },
    registry => { registry.workspaces[0].deletedAt = NOW; },
    registry => { registry.workspaces = []; }
]) bounded(`registry validation fails closed (${mutate.toString()})`, async () => {
    const f = fixture(), { registry } = await selected(f), corrupt = copy(registry); mutate(corrupt);
    assert.throws(() => Workspaces.validateRegistry(corrupt));
    f.raw[constants.registry] = corrupt; const writes = f.writes.length;
    await assert.rejects(f.manager().ready()); assert.equal(f.writes.length, writes);
});

bounded('live workspace corruption prevents writes rather than replacing it with defaults', async () => {
    const f = fixture(seeded()), { registry, session } = await selected(f);
    const key = Object.keys(f.raw).find(key => key.startsWith(`${constants.prefix}${registry.defaultId}:`));
    assert(key, 'active workspace bundle exists');
    f.raw[key] = { ...f.raw[key], values: null };
    const before = copy(f.raw), writes = f.writes.length;
    await assert.rejects(session.local.set({ quote: 'MUST_NOT_REPLACE_CORRUPTION' }));
    assert.deepEqual(f.raw, before); assert.equal(f.writes.length, writes);
});

for (const method of ['getAll', 'get', 'getAllForBackup']) bounded(`StorageManager.${method} propagates workspace corruption without writing defaults`, async () => {
    const f = fixture(seeded()), { registry, session } = await selected(f);
    await withGlobals(f, async () => {
        const storage = new StorageManager({ workspace: session }); storage._syncInitialized = true;
        const key = Workspaces.bundleKey(registry.workspaces[0]); f.raw[key].values.quote = 42;
        const before = copy(f.raw), writes = f.writes.length;
        await assert.rejects(method === 'get' ? storage.get('quote', 'FALLBACK') : storage[method](), code('WORKSPACE_CORRUPT'));
        assert.deepEqual(f.raw, before); assert.equal(f.writes.length, writes);
    });
});

for (const method of ['getAll', 'get', 'getAllForBackup']) bounded(`StorageManager.${method} propagates a scoped storage read failure without defaults`, async () => {
    const f = fixture(seeded()), { registry, session } = await selected(f);
    await withGlobals(f, async () => {
        const storage = new StorageManager({ workspace: session }); storage._syncInitialized = true;
        const key = Workspaces.bundleKey(registry.workspaces[0]), writes = f.writes.length;
        f.hooks.get = keys => { if (Array.isArray(keys) && keys.includes(key)) throw Error('synthetic read failure'); return DEFER; };
        await assert.rejects(method === 'get' ? storage.get('quote', 'FALLBACK') : storage[method]());
        assert.equal(f.writes.length, writes);
    });
});

bounded('non-Default settings reset preserves sibling data, personal modules and globals', async () => {
    const f = fixture(seeded()), { manager, session: original } = await selected(f), second = await manager.duplicate('default', 'Reset me');
    const session = manager.capture(second.id); await session.ready();
    await withGlobals(f, async () => {
        const storage = new StorageManager({ workspace: session });
        const sibling = await original.local.get(null), personal = await session.local.get(Workspaces.PERSONAL_KEYS), globals = copy(f.raw.sync);
        assert.equal(await storage.clear(), true);
        assert.deepEqual(await original.local.get(null), sibling);
        assert.deepEqual(await session.local.get(Workspaces.PERSONAL_KEYS), personal);
        assert.deepEqual(f.raw.sync, globals); assert.equal(f.raw.__auth, 'SYNTHETIC_AUTH_DO_NOT_EXPORT');
        assert.deepEqual(f.providers, []);
    });
});

bounded('Sync upload invoked from another workspace serializes Default only', async () => {
    const f = fixture(seeded()), { manager } = await selected(f), second = await manager.create('Private second');
    const session = manager.capture(second.id); await session.local.set({ quote: 'SECOND_SECRET_QUOTE', links: [{ title: 'SECOND_SECRET_SITE', url: 'https://private.example/', category: 'work' }] });
    await manager.select(second.id);
    const remote = {}, calls = [];
    f.chrome.storage.sync = {
        async get(keys) { calls.push(['get', copy(keys)]); return keys === null ? copy(remote) : Object.fromEntries(keys.filter(key => Object.hasOwn(remote, key)).map(key => [key, copy(remote[key])])); },
        async set(values) { calls.push(['set', copy(values)]); Object.assign(remote, copy(values)); },
        async remove(keys) { calls.push(['remove', copy(keys)]); for (const key of keys) delete remote[key]; },
        async getBytesInUse() { return Buffer.byteLength(JSON.stringify(remote)); },
        QUOTA_BYTES_PER_ITEM: 8192
    };
    await withGlobals(f, async () => {
        const storage = new StorageManager({ workspace: session }), defaultStorage = storage.forDefaultWorkspace();
        defaultStorage._syncInitialized = true;
        const sibling = await session.local.get(null);
        await storage.pushToSync();
        const serialized = JSON.stringify(calls);
        assert(serialized.includes('ORIGINAL_QUOTE')); assert(!serialized.includes('SECOND_SECRET_QUOTE')); assert(!serialized.includes('SECOND_SECRET_SITE'));
        assert(!serialized.includes('PRIVATE_NOTE_A')); assert(!serialized.includes('PRIVATE_TASK_A')); assert(!serialized.includes('SYNTHETIC_AUTH_DO_NOT_EXPORT'));
        const after = await session.local.get(null); for (const key of Workspaces.SCOPED_KEYS) if (Object.hasOwn(sibling, key)) assert.deepEqual(after[key], sibling[key]);
        assert.deepEqual(f.providers, []);
    });
});

bounded('Drive manager constructed from another workspace is pinned to Default', async () => {
    const Drive = require(path.join(project, 'drive-backup.js'));
    const f = fixture(seeded()), { manager } = await selected(f), second = await manager.create('Private second');
    await withGlobals(f, async () => {
        const storage = new StorageManager({ workspace: manager.capture(second.id) }), drive = new Drive(storage);
        assert.equal((await drive.storageManager.workspace.ready()).id, 'default');
        assert.notEqual(drive.storageManager, storage);
        assert.deepEqual(f.providers, []);
    });
});

// Reuse only the repository's synthetic DOM model, never a browser.
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const uiProject = process.env.ITAB_WORKSPACE_UI_SOURCE_ROOT || project;
const source = fs.readFileSync(path.join(uiProject, 'shared/workspaces-view.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function workspaceUiFixture() {
    const document=createDocument({blurUnavailableFocus:true}),create=document.createElement;
    document.createElement=tag=>{const el=create(tag);el.removeAttribute=name=>{delete el.attributes[name]};return el;};
    const switcher=document.createElement('section'),managerHost=document.createElement('section');document.body.append(switcher,managerHost);
    let registry={schemaVersion:1,defaultId:'default',lastUsedId:'default',revision:0,workspaces:[{id:'default',name:'Default',order:0,generation:'g0',deletedAt:null},{id:'work',name:'Work',order:1,generation:'g1',deletedAt:null}]};
    const calls=[],listeners=new Set();const record=(method,...args)=>calls.push([method,...args]);
    const manager={list:async()=>clone(registry),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
        create:async name=>{record('create',name);registry.workspaces.push({id:'new',name,order:2,generation:'newg',deletedAt:null});},
        rename:async(id,name)=>{record('rename',id,name);registry.workspaces.find(w=>w.id===id).name=name;},
        duplicate:async(id,name)=>{record('duplicate',id,name);registry.workspaces.push({id:'copy',name,order:2,generation:'copyg',deletedAt:null});},
        trash:async id=>{record('trash',id);registry.workspaces.find(w=>w.id===id).deletedAt=123;},
        restore:async id=>{record('restore',id);const w=registry.workspaces.find(w=>w.id===id);w.deletedAt=null;w.generation+='restored';},
        select:async id=>{record('select',id);registry.lastUsedId=id;}};
    const session={id:'default',generation:'g0',ready:async()=>({id:'default',generation:'g0'}),flush:async()=>record('flush'),suspendWrites:()=>record('suspend'),resumeWrites:()=>record('resume')};
    let dirty=false;const lifecycle={waitForPending:async()=>record('wait'),hasUncommittedWork:()=>dirty,saveDrafts:async()=>{record('save');dirty=false;return true;},pauseAutosave:()=>record('pause'),resumeAutosave:()=>record('resume-auto'),allowDeparture:()=>record('depart'),cancelDeparture:()=>record('cancel-depart')};
    const window={document,location:{href:'chrome-extension://unit/newtab.html'},chrome:{runtime:{getURL:p=>'chrome-extension://unit/'+p}},i18n:{t:key=>key}};
    vm.runInNewContext(fs.readFileSync(path.join(uiProject, 'shared/dialog-focus.js'),'utf8'),{window});
    vm.runInNewContext(source,{window,URL,Blob,setTimeout});
    const view=window.LocalItabWorkspacesView.mount({switcher,managerHost,manager,session,lifecycle,navigate:id=>record('navigate',id),download:async(...args)=>record('download',...args)});
    const find=(text,host=document.body)=>host.querySelectorAll('button').find(b=>b.textContent===text);
    return {document,window,switcher,managerHost,manager,session,lifecycle,view,calls,find,registry,dirty(value=true){dirty=value;},notify(){listeners.forEach(fn=>fn(registry));},dialog:()=>document.querySelector('.spaces-dialog'),input:()=>document.querySelector('.spaces-name-input')};
}

bounded('new draft typed while workspace selection awaits cannot be silently discarded', async () => {
    const m = workspaceUiFixture(); await m.view.ready;
    const entered = deferred(), release = deferred();
    m.manager.select = async id => { m.calls.push(['select', id]); entered.resolve(); await release.promise; };
    const switching = m.view.requestSwitch('work'); await entered.promise;
    m.dirty(true); release.resolve(); await switching;
    assert(!m.calls.some(call => call[0] === 'navigate'), 'new draft must keep the current page or show a new departure decision');
    assert(!m.calls.some(call => call[0] === 'depart'), 'native departure protection must stay active');
});

bounded('snapshot replacement changes only affected generations and retains recoverable prior contents', async () => {
    const f = fixture(seeded()), { manager, session: a } = await selected(f), entry = await manager.create('Second');
    const b = manager.capture(entry.id); await b.local.set({ quote: 'BEFORE_RESTORE' });
    const source = await manager.exportSnapshot(), before = copy(source), next = copy(source);
    next.bundles.find(bundle => bundle.id === entry.id).values.quote = 'AFTER_RESTORE';
    await manager.replaceSnapshot(next);
    assert.equal((await a.local.get(['quote'])).quote, 'ORIGINAL_QUOTE');
    await assert.rejects(b.local.set({ quote: 'STALE_EDIT' }), code('WORKSPACE_INVALIDATED'));
    assert.equal((await manager.capture(entry.id).local.get(['quote'])).quote, 'AFTER_RESTORE');
    assert.deepEqual(f.raw[Workspaces.RECOVERY_KEY].snapshot, before);
    const registry = await manager.list();
    assert.equal(registry.workspaces.find(item => item.id === 'default').generation, before.registry.workspaces.find(item => item.id === 'default').generation);
    assert.notEqual(registry.workspaces.find(item => item.id === entry.id).generation, entry.generation);
    assert.deepEqual(f.providers, []);
});

for (const mode of ['drop', 'corrupt', 'throw']) bounded(`all-workspace replacement recovery ${mode} cannot activate replacement`, async () => {
    const f = fixture(seeded()), { manager } = await selected(f), before = await manager.exportSnapshot(), incoming = copy(before);
    incoming.bundles[0].values.quote = 'NEW_CONTENT';
    f.hooks.set = (values, raw, apply) => {
        if (!Object.hasOwn(values, Workspaces.RECOVERY_KEY)) return DEFER;
        if (mode === 'throw') throw Error('synthetic recovery quota');
        if (mode === 'corrupt') { apply(values); raw[Workspaces.RECOVERY_KEY] = null; }
        return undefined;
    };
    await assert.rejects(manager.replaceSnapshot(incoming));
    assert.deepEqual(await manager.exportSnapshot(), before);
});

bounded('all-workspace replacement rejects malformed sibling before any recovery or content writes', async () => {
    const f = fixture(seeded()), { manager } = await selected(f); await manager.create('Second');
    const incoming = await manager.exportSnapshot(); incoming.bundles[1].values[Scratchpad.KEY] = { schemaVersion: 99 };
    const before = copy(f.raw), writes = f.writes.length;
    await assert.rejects(manager.replaceSnapshot(incoming)); assert.deepEqual(f.raw, before); assert.equal(f.writes.length, writes);
});

bounded('concurrent Tasks and Scratchpad writes share one workspace lock without lost modules', async () => {
    const f = fixture(), { manager, registry } = await selected(f);
    const a = manager.capture(registry.defaultId), b = f.manager().capture(registry.defaultId);
    const tasks = new Tasks.Store(a.createBackend(Tasks.KEY), { now: () => NOW, id: () => 'concurrent_task_id' });
    const notes = new Scratchpad.Store(b.createBackend(Scratchpad.KEY));
    await Promise.all([tasks.mutate(tasks.request('add', { text: 'CONCURRENT_TASK' })), notes.mutate({ kind: 'content', value: 'CONCURRENT_NOTE', revision: 0 })]);
    assert.equal((await tasks.read()).records[0].text, 'CONCURRENT_TASK'); assert.equal((await notes.read()).content, 'CONCURRENT_NOTE');
});

function backup(f, manager) {
    const storage = new StorageManager({ workspace: manager.capture('default') }); let serial = 0;
    return new CompleteBackup.Store(storage, CompleteBackup.createBackend(storage, f.chrome, f.locks), { now: () => NOW, id: () => `archive_identity_${++serial}`, workspaceManager: manager });
}

bounded('full portable archive round-trips live spaces, Trash and saved content without providers', async () => {
    const source = fixture(seeded()), { manager } = await selected(source), live = await manager.duplicate('default', 'Reading'), removed = await manager.create('Retired');
    await manager.capture(live.id).local.set({ [Scratchpad.KEY]: { ...Scratchpad.initial(), content: 'READING_PRIVATE_NOTE' } });
    await manager.capture(removed.id).local.set({ [Scratchpad.KEY]: { ...Scratchpad.initial(), content: 'TRASH_PRIVATE_NOTE' } });
    await manager.trash(removed.id); await manager.select(live.id);
    const exported = await backup(source, manager).export(CompleteBackup.SCOPED_MODULES), file = JSON.parse(exported);
    assert.equal(file.schemaVersion, 2); assert.equal(file.workspaces.length, 2); assert.equal(file.trash.length, 1);
    assert(exported.includes('READING_PRIVATE_NOTE')); assert(exported.includes('TRASH_PRIVATE_NOTE'));
    for (const excluded of ['SYNTHETIC_AUTH_DO_NOT_EXPORT', '__futureOpaqueKey', '__updatePreferences', '"privacy"', '"sync"', '"session"', '"receipts"']) assert(!exported.includes(excluded), excluded);
    const destination = fixture({ ...seeded(), quote: 'BEFORE_COMPLETE_RESTORE', privacy: { onlineFavicons: true } }), target = await selected(destination), store = backup(destination, target.manager);
    const preview = await store.review(exported); await store.restore(preview, { confirmed: true });
    const roundtrip = JSON.parse(await store.export(CompleteBackup.SCOPED_MODULES));
    // Editor versions deliberately rotate at restore; record identity/content,
    // retained recovery, workspace topology and portable preferences round-trip.
    const portableContent = value => {
        const result = copy(value);
        for (const workspace of [...result.workspaces, ...result.trash]) for (const record of workspace.modules.tasks.records) delete record.version;
        return result;
    };
    assert.notEqual(roundtrip.workspaces[0].modules.tasks.records[0].version, file.workspaces[0].modules.tasks.records[0].version);
    assert.deepEqual(portableContent(roundtrip), portableContent(file));
    const recovery = JSON.parse(await store.recovery());
    assert.equal(recovery.workspaces[0].modules.config.data.quote, 'BEFORE_COMPLETE_RESTORE'); assert.equal(recovery.workspaces.length, 1);
    assert.equal(destination.raw.privacy.onlineFavicons, true); assert.equal(destination.raw.__auth, 'SYNTHETIC_AUTH_DO_NOT_EXPORT');
    await assert.rejects(target.session.local.set({ quote: 'STALE_PRE_RESTORE_TAB' }), code('WORKSPACE_INVALIDATED'));
    assert.deepEqual(source.providers, []); assert.deepEqual(destination.providers, []);
});

bounded('partial portable archive cannot implicitly create or remove workspace topology', async () => {
    const source = fixture(), a = await selected(source); await a.manager.create('Extra');
    const text = await backup(source, a.manager).export(['scratchpad']);
    const destination = fixture(), b = await selected(destination), before = copy(destination.raw), writes = destination.writes.length;
    await assert.rejects(backup(destination, b.manager).review(text), code('TOPOLOGY'));
    assert.deepEqual(destination.raw, before); assert.equal(destination.writes.length, writes);
});

bounded('legacy partial import requires explicit reviewed target and preserves siblings and active Focus exactly', async () => {
    const f = fixture(), { manager, session: defaultSession } = await selected(f), entry = await manager.create('Destination');
    const target = manager.capture(entry.id), state = Focus.initial();
    state.session = { id: 'running_partial_import', phase: 'focus', status: 'running', remainingMs: 1500000, startedAt: 100000, deadline: 1600000 };
    await target.local.set({ [Focus.KEY]: state });
    const store = backup(f, manager), legacy = JSON.stringify({ format: CompleteBackup.FORMAT, schemaVersion: 1, exportedAt: NOW, modules: { scratchpad: { schemaVersion: 1, enabled: true, content: 'LEGACY_TARGET_NOTE' } } });
    const undecided = await store.review(legacy); assert.equal(undecided.requiresTarget, true);
    assert.throws(() => store.restore(undecided, { confirmed: true }), code('CONFLICT'));
    const priorDefault = await defaultSession.local.get(null), preview = await store.review(legacy, ['scratchpad'], { targetWorkspaceId: entry.id });
    preview.targetWorkspace.id = 'default';
    await store.restore(preview, { confirmed: true });
    assert.deepEqual(await defaultSession.local.get(null), priorDefault);
    const fresh = await manager.capture(entry.id).local.get(null); assert.equal(fresh[Scratchpad.KEY].content, 'LEGACY_TARGET_NOTE'); assert.deepEqual(fresh[Focus.KEY], state);
    await assert.rejects(target.local.set({ quote: 'OLD_TARGET_GENERATION' }), code('WORKSPACE_INVALIDATED'));
});

bounded('full portable restore refuses overwriting any active Focus before recovery or staging', async () => {
    const f = fixture(), { manager } = await selected(f), entry = await manager.create('Focus');
    const store = backup(f, manager), source = await store.export(CompleteBackup.SCOPED_MODULES), session = manager.capture(entry.id);
    const focus = new Focus.Store(session.createBackend(Focus.KEY), { now: () => 100000, id: () => 'running_full_restore' });
    await focus.mutate({ kind: 'start', revision: 0 });
    const preview = await store.review(source), before = copy(f.raw), writes = f.writes.length;
    await assert.rejects(store.restore(preview, { confirmed: true }), code('FOCUS_ACTIVE'));
    assert.deepEqual(f.raw, before); assert.equal(f.writes.length, writes);
});

bounded('session suspension drains accepted writes, blocks new commands and resumes safely', async () => {
    const f = fixture(), { session } = await selected(f), store = new Scratchpad.Store(session.createBackend(Scratchpad.KEY));
    const entered = deferred(), release = deferred(); let held = false;
    f.hooks.set = async values => {
        if (held || !Object.keys(values).some(key => key.startsWith(Workspaces.PREFIX))) return DEFER;
        held = true; entered.resolve(); await release.promise; return DEFER;
    };
    const accepted = store.mutate({ kind: 'content', value: 'ACCEPTED_BEFORE_SWITCH', revision: 0 }); await entered.promise;
    session.suspendWrites();
    await assert.rejects(store.mutate({ kind: 'content', value: 'REJECTED_DURING_SWITCH', revision: 0 }), code('WORKSPACE_SWITCH_PENDING'));
    let flushed = false; const flush = session.flush().then(() => { flushed = true; });
    await new Promise(resolve => setImmediate(resolve)); assert.equal(flushed, false);
    release.resolve(); await accepted; await flush; assert.equal(flushed, true);
    session.resumeWrites(); const saved = await store.mutate({ kind: 'content', value: 'RESUMED_AFTER_STAY', revision: 1 }); assert.equal(saved.content, 'RESUMED_AFTER_STAY');
});

for (const mode of ['drift', 'cancel']) bounded(`out-of-band ${mode} during replacement staging prevents registry activation`, async () => {
    const f = fixture(seeded()), { manager, registry } = await selected(f), incoming = await manager.exportSnapshot();
    incoming.bundles[0].values.quote = 'STAGED_ONLY'; const originalKey = Workspaces.bundleKey(registry.workspaces[0]); let current = true, injected = false;
    f.hooks.set = (values, raw, apply) => {
        if (injected || !Object.keys(values).some(key => key.startsWith(Workspaces.PREFIX))) return DEFER;
        injected = true; apply(values);
        if (mode === 'drift') raw[originalKey].values.quote = 'NEWER_OUT_OF_BAND'; else current = false;
        return undefined;
    };
    await assert.rejects(manager.replaceSnapshot(incoming, { isCurrent: () => current }), code(mode === 'drift' ? 'WORKSPACE_CONFLICT' : 'WORKSPACE_CANCELED'));
    assert(injected); assert.deepEqual(f.raw[Workspaces.REGISTRY_KEY], registry);
    assert.equal((await manager.capture('default').local.get(['quote'])).quote, mode === 'drift' ? 'NEWER_OUT_OF_BAND' : 'ORIGINAL_QUOTE');
});

bounded('Default settings reset keeps provider preferences and persistently blocks automatic Sync replay', async () => {
    const initial = seeded(); initial.sync.enabled = true;
    const f = fixture(initial), { session } = await selected(f);
    await withGlobals(f, async () => {
        const storage = new StorageManager({ workspace: session }); storage._syncInitialized = true;
        const providers = copy(f.raw.sync), privacy = copy(f.raw.privacy);
        assert.equal(await storage.clear(), true);
        assert.deepEqual(f.raw.sync, providers); assert.deepEqual(f.raw.privacy, privacy);
        assert.equal(f.raw[storage.syncIdentityStateKey]?.blocked?.kind, 'restore');
        assert.deepEqual(f.providers, []);
    });
});

bounded('non-Default cannot mutate shared Sync provider control through its local adapter', async () => {
    const f = fixture(seeded()), { manager } = await selected(f), entry = await manager.create('Local only');
    const session = manager.capture(entry.id); await session.ready(); const before = copy(f.raw);
    await assert.rejects(session.local.set({ sync: { enabled: true } }), code('WORKSPACE_PROVIDER_BOUNDARY'));
    await assert.rejects(session.local.set({ __localItabSyncIdentityState: { blocked: null } }), code('WORKSPACE_PROVIDER_BOUNDARY'));
    assert.deepEqual(f.raw, before); assert.deepEqual(f.providers, []);
});

bounded('a fresh Default tab cannot replay old remote Sync over an all-workspace config restore', async () => {
    const incoming = fixture({ quote: 'RESTORED_DEFAULT_QUOTE' }), from = await selected(incoming);
    const archive = await backup(incoming, from.manager).export(['config']);
    const initial = seeded(); initial.sync.enabled = true;
    const f = fixture(initial), { manager } = await selected(f), store = backup(f, manager);
    await store.restore(await store.review(archive, ['config']), { confirmed: true });
    await withGlobals(f, async () => {
        const fresh = new StorageManager({ workspace: f.manager().capture('default') });
        const payload = fresh.prepareSyncPayload(fresh.cloneDefaultConfig()).payload; payload.quote = 'STALE_REMOTE_QUOTE';
        const remote = { meta: { enabled: true, updatedAt: NOW }, payload, validated: fresh.validateConfigObject(payload), schema: 1, fingerprint: await fresh.fingerprint({ schema: 1, payload }), revision: 'stale_remote_revision' };
        // Synthetic server response: exercise actual initialization and acceptance
        // code without an external account or provider operation.
        fresh.readSyncSnapshot = async () => remote;
        await fresh.ensureSyncInitialized();
        assert.equal((await fresh.local.get(['quote'])).quote, 'RESTORED_DEFAULT_QUOTE');
        assert.equal(f.raw[fresh.syncIdentityStateKey]?.blocked?.kind, 'restore');
        assert.equal(f.raw.sync.enabled, true); assert.deepEqual(f.providers, []);
    });
});

bounded('public local facades serialize concurrent disjoint writes without losing a field', async () => {
    const f = fixture(seeded()), { manager } = await selected(f);
    const a = manager.capture('default'), b = f.manager().capture('default'); await Promise.all([a.ready(), b.ready()]);
    await Promise.all([a.local.set({ quote: 'CONCURRENT_QUOTE' }), b.local.set({ search: { engine: 'bing', custom: '' } })]);
    const saved = await a.local.get(['quote', 'search']);
    assert.equal(saved.quote, 'CONCURRENT_QUOTE'); assert.equal(saved.search.engine, 'bing');
});

bounded('a generation replaced during an unlocked read cannot return stale data as current', async () => {
    const f = fixture(seeded()), { manager } = await selected(f), entry = await manager.duplicate('default', 'Read race');
    const session = manager.capture(entry.id); await session.ready();
    const incoming = await manager.exportSnapshot(); incoming.bundles.find(bundle => bundle.id === entry.id).values.quote = 'REPLACED_CONTENT';
    const oldKey = Workspaces.bundleKey(entry), entered = deferred(), release = deferred(); let held = false;
    f.hooks.get = async keys => {
        if (held || !Array.isArray(keys) || !keys.includes(oldKey)) return DEFER;
        held = true; const result = f.extract(keys); entered.resolve(); await release.promise; return result;
    };
    const read = session.local.get(['quote']).then(value => ({ value }), error => ({ error })); await entered.promise;
    let committed = false; const replace = manager.replaceSnapshot(incoming).then(() => { committed = true; });
    await new Promise(resolve => setTimeout(resolve, 10)); const replacedBeforeReadCompleted = committed;
    release.resolve(); const result = await read; await replace;
    if (replacedBeforeReadCompleted) assert(result.error?.code?.startsWith('WORKSPACE_'), 'a read crossing an authoritative generation switch must reject');
    else assert.equal(result.value?.quote, 'ORIGINAL_QUOTE', 'serialized read may complete before the generation changes');
    await assert.rejects(session.local.set({ quote: 'STALE_AFTER_READ' }), code('WORKSPACE_INVALIDATED'));
});

bounded('Sync-clear safety recovery cannot overwrite a concurrently saved personal note', async () => {
    const f = fixture(seeded()), { session } = await selected(f);
    await withGlobals(f, async () => {
        const storage = new StorageManager({ workspace: session }); storage._syncInitialized = true;
        f.raw[storage.syncIdentityStateKey] = { blocked: { kind: 'restore', reason: 'Synthetic existing block' } };
        storage.getRemoteMeta = async () => ({ enabled: true, chunkCount: 0 });
        storage.readSyncSnapshot = async () => ({ validated: storage.cloneDefaultConfig() });
        f.chrome.storage.sync.set = async () => {};
        f.chrome.storage.sync.remove = async () => {};
        const entered = deferred(), release = deferred(); let held = false;
        f.hooks.set = async values => {
            if (held || !Object.values(values).some(value => value?.values?.[storage.restoreRecoveryKey])) return DEFER;
            held = true; entered.resolve(); await release.promise; return DEFER;
        };
        const disable = storage.disableRemoteSync(); await entered.promise;
        const notes = new Scratchpad.Store(session.createBackend(Scratchpad.KEY));
        const write = notes.mutate({ kind: 'content', value: 'NOTE_SAVED_DURING_SYNC_CLEAR', revision: 7 });
        await new Promise(resolve => setTimeout(resolve, 10)); release.resolve();
        await Promise.all([disable, write]);
        assert.equal((await notes.read()).content, 'NOTE_SAVED_DURING_SYNC_CLEAR');
        assert((await session.local.get([storage.restoreRecoveryKey]))[storage.restoreRecoveryKey]);
    });
});

bounded('shared device-privacy comparisons serialize across distinct workspace sessions', async () => {
    const f = fixture(seeded()), { manager, session: a } = await selected(f), entry = await manager.create('Privacy sibling'), b = manager.capture(entry.id);
    await b.ready();
    const compareAndSet = session => session.withLock(async local => {
        const saved = (await local.get(['privacy'])).privacy;
        if (saved.onlineFavicons !== false) throw Object.assign(Error('Privacy baseline changed'), { code: 'STALE_DEVICE_PRIVACY' });
        await new Promise(resolve => setImmediate(resolve));
        await local.set({ privacy: { onlineFavicons: true } });
    });
    const results = await Promise.allSettled([compareAndSet(a), compareAndSet(b)]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected')?.reason.code, 'STALE_DEVICE_PRIVACY');
    assert.equal(f.raw.privacy.onlineFavicons, true); assert.deepEqual(f.providers, []);
});

bounded('legacy-tab writes block existing sessions and preserve both branches without exporting globals', async () => {
    const f = fixture(seeded()), { manager, session } = await selected(f);
    f.apply({ quote: 'LEGACY_TAB_NEW_QUOTE' });
    await assert.rejects(session.local.set({ quote: 'MUST_NOT_OVERWRITE_EITHER' })); await f.settled();
    assert(f.raw[Workspaces.LEGACY_CONFLICT_KEY]);
    await assert.rejects(f.manager().ready(), code('WORKSPACE_LEGACY_CONFLICT'));
    const recovery = await manager.exportLegacyConflictRecovery();
    assert.equal(recovery.legacy.quote, 'LEGACY_TAB_NEW_QUOTE');
    assert.equal(recovery.workspaces.bundles.find(bundle => bundle.id === 'default').values.quote, 'ORIGINAL_QUOTE');
    const text = JSON.stringify(recovery);
    for (const excluded of ['SYNTHETIC_AUTH_DO_NOT_EXPORT', '__futureOpaqueKey', '"privacy"', '"sync"']) assert(!text.includes(excluded), excluded);
});

bounded('legacy drift while no page is observing is detected at the next startup', async () => {
    const f = fixture(seeded()); await selected(f);
    f.raw.quote = 'UNOBSERVED_LEGACY_WRITE';
    await assert.rejects(f.manager().ready(), code('WORKSPACE_LEGACY_CONFLICT'));
    assert.equal(f.raw.quote, 'UNOBSERVED_LEGACY_WRITE'); assert(f.raw[Workspaces.LEGACY_CONFLICT_KEY]);
});

bounded('legacy-conflict resolution requires a live confirmed review and retains both recoverable versions', async () => {
    const f = fixture(seeded()), { manager, session } = await selected(f);
    f.apply({ quote: 'LEGACY_KEPT_IN_RECOVERY' }); await f.settled();
    const review = await manager.reviewLegacyConflict();
    await assert.rejects(manager.resolveLegacyConflict(review));
    await assert.rejects(manager.resolveLegacyConflict({ ...review }, { confirmed: true }));
    await manager.resolveLegacyConflict(review, { confirmed: true });
    const saved = f.raw[f.raw[Workspaces.LEGACY_CONFLICT_KEY].recoveryKey].recovery;
    assert.equal(saved.legacy.quote, 'LEGACY_KEPT_IN_RECOVERY'); assert.equal(saved.workspaces.bundles[0].values.quote, 'ORIGINAL_QUOTE');
    assert.equal(f.raw.quote, 'LEGACY_KEPT_IN_RECOVERY');
    assert.equal((await f.manager().capture('default').local.get(['quote'])).quote, 'ORIGINAL_QUOTE');
    await assert.rejects(session.local.set({ quote: 'OLD_CONFLICT_TAB' }));
});

bounded('legacy-conflict resolution rechecks after awaited recovery and refuses new legacy changes', async () => {
    const f = fixture(seeded()), { manager } = await selected(f);
    f.apply({ quote: 'LEGACY_FIRST' }); await f.settled(); const review = await manager.reviewLegacyConflict();
    let raced = false;
    f.hooks.set = (values, raw, apply) => {
        if (raced || !Object.keys(values).some(key => key.startsWith(Workspaces.LEGACY_RECOVERY_PREFIX))) return DEFER;
        raced = true; apply(values); raw.quote = 'LEGACY_CHANGED_DURING_RECOVERY'; return undefined;
    };
    await assert.rejects(manager.resolveLegacyConflict(review, { confirmed: true }), code('WORKSPACE_CONFLICT'));
    assert(raced); assert.equal(f.raw[Workspaces.LEGACY_CONFLICT_KEY].resolvedAt, undefined); assert.equal(f.raw.quote, 'LEGACY_CHANGED_DURING_RECOVERY');
});

for (const phase of ['running', 'paused', 'completed']) bounded(`trash and restore retain a recoverable ${phase} Focus timer without restarting it`, async () => {
    const f = fixture(), { manager } = await selected(f), entry = await manager.create('Timer');
    const state = Focus.initial(), start = Date.parse(NOW) - 60000;
    state.session = phase === 'running'
        ? { id: 'trash_timer_session', phase: 'focus', status: phase, remainingMs: 1500000, startedAt: start, deadline: start + 1500000 }
        : { id: 'trash_timer_session', phase: 'focus', status: phase, remainingMs: phase === 'completed' ? 0 : 900000, startedAt: null, deadline: null };
    await manager.capture(entry.id).local.set({ [Focus.KEY]: state }); await manager.trash(entry.id); await manager.restore(entry.id);
    const restored = (await manager.capture(entry.id).local.get([Focus.KEY]))[Focus.KEY];
    assert.equal(restored.session.status, phase === 'running' ? 'paused' : phase);
    assert.equal(restored.session.remainingMs, phase === 'running' ? 1440000 : state.session.remainingMs);
    assert.equal(restored.session.id, state.session.id); assert.equal(restored.session.startedAt, null); assert.equal(restored.session.deadline, null);
});

bounded('workspace archive recovery does not mutate migrated v1 recovery or trigger a false legacy conflict', async () => {
    const historical = { source: 'UNRELATED_HISTORICAL_RECOVERY', checksum: 'a'.repeat(64) };
    const f = fixture({ ...seeded(), __localItabCompleteRecoveryV1: historical }), { manager } = await selected(f);
    const store = backup(f, manager), legacy = JSON.stringify({ format: CompleteBackup.FORMAT, schemaVersion: 1, exportedAt: NOW, modules: { scratchpad: { schemaVersion: 1, enabled: true, content: 'NEW_WORKSPACE_NOTE' } } });
    await store.restore(await store.review(legacy, ['scratchpad'], { targetWorkspaceId: 'default' }), { confirmed: true });
    assert.deepEqual(f.raw.__localItabCompleteRecoveryV1, historical);
    const next = f.manager(); await next.ready();
    assert.deepEqual((await next.capture('default').local.get(['__localItabCompleteRecoveryV1'])).__localItabCompleteRecoveryV1, historical);
    const recovery = JSON.parse(await store.recovery()); assert.equal(recovery.schemaVersion, 2);
    assert.equal(recovery.workspaces[0].modules.scratchpad.content, 'PRIVATE_NOTE_A\n中文');
    assert.equal(f.raw[Workspaces.LEGACY_CONFLICT_KEY], undefined);
});

// Real workspace sessions back the local-prompt UI. Only storage and DOM are
// synthetic; no provider, clipboard service, browser profile or network is used.
async function localCopyWorkspaceUI(f, manager, session, clipboard, locale = 'en') {
    const fs = require('node:fs'), vm = require('node:vm');
    const AI = require('../shared/ai-context'), Collections = require('../shared/local-ai-collections-store');
    const { createDocument } = require('./helpers/task-dom-model');
    const messages = require(`../_locales/${locale}/messages.json`);
    const controller = AI.createController({ workspaces: { manager, session }, tasks: Tasks, collections: Collections, scratchpad: Scratchpad,
        transport: {}, permissions: {} });
    const document = createDocument(), host = document.createElement('main'); document.body.append(host);
    const window = { document, addEventListener() {}, removeEventListener() {} };
    vm.runInNewContext(fs.readFileSync(path.join(project, 'shared/ai-context-view.js'), 'utf8'), { window });
    const view = window.LocalItabAIContextView.mount(host, { controller, clipboard, t: (key, fallback) => messages[key]?.message || fallback });
    await view.ready;
    const button = key => host.querySelectorAll('button').find(node => node.textContent === messages[`aiContext${key}`].message);
    const question = host.querySelector('textarea'); question.value = 'Synthetic local question'; question.dispatch('input');
    button('ReviewLocal').dispatch('click'); await f.settled();
    assert(controller.localReview);
    return { controller, document, host, view, question, button, messages,
        status: host.querySelector('.ai-context-status'), panel: host.querySelector('.ai-context-local-review'),
        localStatus: host.querySelector('.ai-context-local-status') };
}
async function localCopyWorkspaceFixture(clipboard, locale) {
    const f = fixture(), manager = f.manager(); await manager.ready();
    const entry = await manager.create('Synthetic local copy workspace'), session = manager.capture(entry.id); await session.ready();
    const other = f.manager(); await other.ready();
    return { f, manager, other, entry, session, h: await localCopyWorkspaceUI(f, manager, session, clipboard, locale) };
}
for (const locale of ['en', 'zh_CN']) for (const timing of ['before-copy', 'during-copy']) for (const focus of ['local-status', 'question']) {
    bounded(`local prompt: real workspace invalidation ${timing}, ${locale}, focus ${focus}`, async () => {
        const gate = deferred(), copies = [];
        const { f, other, entry, session, h } = await localCopyWorkspaceFixture({ writeText: async text => {
            copies.push(text); if (timing === 'during-copy') await gate.promise;
        } }, locale);
        const ticket = h.controller.localReview;
        if (timing === 'before-copy') await other.trash(entry.id);
        const writesBeforeCopy = f.writes.length, removalsBeforeCopy = f.removals.length;
        h.button('CopyLocal').focus(); h.button('CopyLocal').dispatch('click');
        if (focus === 'question') h.question.focus();
        await f.settled();
        if (timing === 'during-copy') {
            assert.deepEqual(copies, [ticket.packed.prompt]);
            assert.equal(f.writes.length, writesBeforeCopy);
            await other.trash(entry.id);
            gate.resolve(); await f.settled();
        }
        assert.equal(session.invalidated, true);
        assert.equal(h.controller.localReview, null);
        assert.equal(h.panel.hidden, true); assert.equal(h.panel.querySelector('textarea').value, '');
        assert.equal(h.localStatus.textContent, '');
        assert.equal(h.status.textContent, h.messages.aiContextLocalCopyWorkspaceInvalid.message);
        assert.equal(h.status.getAttribute('role'), 'status');
        assert.equal(h.document.activeElement, focus === 'question' ? h.question : h.status);
        assert.equal(copies.length, timing === 'before-copy' ? 0 : 1);
        const afterTrashWrites = f.writes.length;
        await assert.rejects(h.controller.copyLocalPrompt(ticket, () => assert.fail('stale ticket reused')));
        assert.equal(f.writes.length, afterTrashWrites); assert.equal(f.removals.length, removalsBeforeCopy);
        // B's explicit trash is the only post-review write, not the read-only copy.
        assert.equal(afterTrashWrites - writesBeforeCopy, timing === 'before-copy' ? 0 : 1);
        assert.deepEqual(f.providers, []);
    });
}
for (const locale of ['en', 'zh_CN']) for (const race of ['new-review', 'close-new-interface', 'edit']) {
    bounded(`local prompt: old workspace failure cannot overwrite ${race}, ${locale}`, async () => {
        const gate = deferred(), copies = [];
        const { f, manager, other, entry, h } = await localCopyWorkspaceFixture({ writeText: async text => { copies.push(text); await gate.promise; } }, locale);
        const oldTicket = h.controller.localReview;
        h.button('CopyLocal').focus(); h.button('CopyLocal').dispatch('click'); await f.settled();
        assert.equal(copies.length, 1);
        let current = h;
        if (race === 'close-new-interface') {
            h.view.destroy();
            const session = manager.capture('default'); await session.ready();
            current = await localCopyWorkspaceUI(f, manager, session, { writeText: async () => {} }, locale);
        } else {
            h.question.value = 'New synthetic question'; h.question.dispatch('input');
            if (race === 'new-review') { h.button('ReviewLocal').dispatch('click'); await f.settled(); }
        }
        current.question.focus();
        const ticket = current.controller.localReview, text = current.status.textContent, prompt = current.panel.querySelector('textarea').value;
        await other.trash(entry.id);
        const writes = f.writes.length; gate.resolve(); await f.settled();
        assert.equal(current.controller.localReview, ticket); assert.notEqual(ticket, oldTicket);
        assert.equal(current.status.textContent, text); assert.equal(current.panel.querySelector('textarea').value, prompt);
        assert.equal(current.document.activeElement, current.question);
        assert.equal(f.writes.length, writes); assert.deepEqual(f.providers, []);
        assert.equal(copies.length, 1);
        await assert.rejects(h.controller.copyLocalPrompt(oldTicket, () => assert.fail('old ticket resurrected')));
    });
}
bounded('local prompt: selecting a different workspace in another tab keeps the captured session valid', async () => {
    const copies = [], { f, other, session, h } = await localCopyWorkspaceFixture({ writeText: async text => copies.push(text) }, 'en');
    const ticket = h.controller.localReview;
    await other.select('default'); await session.assertActive();
    const writes = f.writes.length;
    h.button('CopyLocal').dispatch('click'); await f.settled();
    assert.equal(h.controller.localReview, ticket); assert.equal(h.panel.hidden, false);
    assert.equal(h.localStatus.textContent, h.messages.aiContextLocalCopied.message);
    assert.deepEqual(copies, [ticket.packed.prompt]); assert.equal(f.writes.length, writes); assert.deepEqual(f.providers, []);
});
