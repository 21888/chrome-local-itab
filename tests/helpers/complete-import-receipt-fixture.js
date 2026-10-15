// Synthetic memory-only integration fixture: production storage, workspace
// locks and complete-backup Store; no browser profile or provider access.
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const Storage = require('../../storage.js');
const Workspaces = require('../../shared/workspaces.js');
const Backup = require('../../shared/complete-backup.js');
const NOW = '2026-10-15T00:00:00.000Z';
const DEFER = Symbol('normal memory storage');
const clone = value => structuredClone(value);
const code = (...expected) => error => expected.includes(error.code);

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
        runtime: { getManifest: () => ({ version: require('../../manifest.json').version }) } };
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

function seed() { return { ...new Storage().cloneDefaultConfig(), schemaVersion: 1, quote: 'Synthetic before-import configuration' }; }

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

const restoreOptions = { confirmedRestore: true, skipSyncInitialization: true, skipSyncSideEffects: true };
async function uncertainImport(f, storage, session, restored) {
    const entry = f.raw[Workspaces.REGISTRY_KEY].workspaces.find(item => item.id === session.id);
    const key = Workspaces.bundleKey(entry); let submitted = false;
    f.hooks.set = written => { if (Object.hasOwn(written, key)) submitted = true; return DEFER; };
    f.hooks.get = keys => { if (submitted && keys?.includes(key)) throw Error('Synthetic readback unavailable'); return DEFER; };
    await assert.rejects(storage.setAll(restored, restoreOptions), code('WORKSPACE_READ'));
    f.hooks.get = f.hooks.set = null;
    assert.equal(values(f, session.id)[storage.restoreReceiptKey].status, 'pending');
}

module.exports = { Storage, Workspaces, Backup, NOW, DEFER, clone, code, fixture, withGlobals, seed, storageFor, backupFor, boot, values, restoreOptions, uncertainImport };
