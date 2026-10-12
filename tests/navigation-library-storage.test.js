const test = require('node:test');
const assert = require('node:assert/strict');
const StorageManager = require('../storage.js');
const clone = value => JSON.parse(JSON.stringify(value));
function model(extra = {}) {
    let state = { links: [0, 1].map(i => ({ title: 'Twin', url: 'https://example.com/', icon: '★', category: i ? 'orphan' : 'work', extra: { i } })),
        categories: [{ id: 'work', name: 'Work', extra: 1 }, { id: 'personal', name: 'Personal' }],
        layout: { autoArrange: false, positions: { 'all|https://example.com/': { x: 9, y: 4 } }, extra: { untouched: 1 } },
        privacy: { onlineFavicons: false, extra: 1 }, sync: { enabled: false, extra: 1 }, arbitrary: { untouched: true }, ...extra };
    const m = new StorageManager(); m._syncInitialized = true;
    let writes = 0, syncs = 0, failure, readFailure = false, afterWrite, queue = Promise.resolve();
    m.withLocalWriteLock = work => { const result = queue.then(work); queue = result.catch(() => {}); return result; };
    Object.defineProperty(m, '_local', { value: {
        async get() { if (readFailure) throw new Error('read unavailable'); return clone(state); },
        async set(values) { writes++; if (failure === 'before') throw new Error('failed'); Object.assign(state, clone(values)); afterWrite?.(); if (failure === 'after') throw new Error('uncertain'); }
    } });
    m.scheduleShortcutUndoSync = async () => { syncs++; };
    return { m, get state() { return state; }, get writes() { return writes; }, get syncs() { return syncs; },
        set failure(v) { failure = v; }, set readFailure(v) { readFailure = v; }, set afterWrite(v) { afterWrite = v; },
        async plan(site = { name: 'New site', url: 'https://new.example.com/', icon: '📚' }) {
            return { baseline: (await m.readNavigationLibrarySnapshot()).state, site, destination: 'personal' };
        } };
}
test('one-site addition preserves every existing record and field; returns a fresh privacy-aware baseline', async () => {
    const h = model(), before = clone(h.state), request = await h.plan();
    const saved = await h.m.addCatalogShortcut(request);
    const expected = { ...before, links: [...before.links, { title: 'New site', url: 'https://new.example.com/', icon: '📚', category: 'personal' }],
        __localItabLayoutGeneration: h.state.__localItabLayoutGeneration };
    assert.deepEqual(h.state, expected); assert.equal(saved.duplicate, false); assert.equal(h.writes, 1);
    assert.deepEqual(saved, { ...await h.m.readNavigationLibrarySnapshot(), duplicate: false });
    assert.deepEqual(saved.privacy, { syncEnabled: false, onlineFavicons: false });
    assert.ok(!Object.hasOwn((await h.m.readShortcutOrganizerSnapshot()).state, 'catalogPrivacy'));
    await h.m.addCatalogShortcut(request); assert.equal(h.writes, 1);
    const next = { baseline: saved.state, destination: 'work', site: { name: 'Next', url: 'https://next.example.com', icon: 'N' } };
    await h.m.addCatalogShortcut(next); assert.equal(h.writes, 2); assert.equal(h.state.links[3].url, 'https://next.example.com/');
});
test('duplicates are canonical across all categories and do not write, migrate, or schedule sync', async () => {
    const h = model(), before = clone(h.state);
    const request = await h.plan({ name: 'Different title', url: 'https://EXAMPLE.com:443', icon: 'E' });
    const result = await h.m.addCatalogShortcut(request);
    assert.equal(result.duplicate, true); assert.equal(h.writes, 0); assert.equal(h.syncs, 0); assert.deepEqual(h.state, before);
});
test('identity mode preserves old maps and allocates only a fresh new identity', async () => {
    const id = n => 'l_' + String(n).padStart(32, '0');
    const h = model({ schemaVersion: 2, links: [1, 2].map(n => ({ title: 'Twin', url: 'https://example.com/', icon: 'E', category: 'work', layoutId: id(n) })),
        layout: { identityVersion: 1, extra: 9, positions: { 'work|https://example.com/': { x: 1, y: 2 } },
            positionsById: { [id(1)]: { work: { x: 3, y: 4 } }, [id(2)]: {}, [id(3)]: { all: { x: 5, y: 6 } } } } });
    const before = clone(h.state); let n = 2; h.m.createLayoutIdentity = () => id(n++);
    await h.m.addCatalogShortcut(await h.plan());
    assert.equal(h.state.links[2].layoutId, id(4)); assert.deepEqual(h.state.links.slice(0, 2), before.links);
    assert.deepEqual(h.state.layout, { ...before.layout, positionsById: { ...before.layout.positionsById, [id(4)]: {} } });
    assert.equal(h.state.schemaVersion, 2);
});
for (const [name, mutate] of Object.entries({ source: s => s.links[1].icon = 'new', reorder: s => s.links.reverse(),
    category: s => s.categories[1].name = 'Rename', destination: s => s.categories.pop(),
    layout: s => s.layout.positions.new = { x: 1, y: 2 }, generation: s => s.__localItabLayoutGeneration = 'new',
    schema: s => s.schemaVersion = 1, sync: s => s.sync.enabled = true, privacy: s => s.privacy.onlineFavicons = true })) {
    test(`stale ${name} fails closed without writes`, async () => {
        const h = model(), request = await h.plan(); mutate(h.state); const before = clone(h.state);
        await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_CONFLICT' }); assert.deepEqual(h.state, before); assert.equal(h.writes, 0);
    });
}
test('serialization prevents two previews overwriting one another', async () => {
    const h = model(), a = await h.plan(), b = await h.plan();
    const results = await Promise.allSettled([h.m.addCatalogShortcut(a), h.m.addCatalogShortcut(b)]);
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].reason.code, 'CATALOG_CONFLICT'); assert.equal(h.writes, 1);
});
test('same-object double-submit shares one write and submitted fields cannot be changed by caller', async () => {
    const h = model(), request = await h.plan(); let release;
    const original = h.m._local.set;
    h.m._local.set = async values => { await new Promise(resolve => { release = resolve; }); await original(values); };
    const a = h.m.addCatalogShortcut(request), b = h.m.addCatalogShortcut(request);
    await new Promise(setImmediate); request.site.name = 'Mutated'; request.destination = 'work'; release();
    await Promise.all([a, b]); assert.equal(h.writes, 1); assert.equal(h.state.links[2].title, 'New site'); assert.equal(h.state.links[2].category, 'personal');
});
test('definitely failed write can retry; committed write with rejected set is verified', async () => {
    const h = model(), request = await h.plan(), before = clone(h.state); h.failure = 'before';
    await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_FAILED' }); assert.deepEqual(h.state, before);
    h.failure = 'after'; await h.m.addCatalogShortcut(request); assert.equal(h.writes, 2); assert.equal(h.state.links.length, 3);
    await h.m.addCatalogShortcut(request); assert.equal(h.writes, 2);
});
test('unreadable readback retries read first without duplicating committed addition', async () => {
    const h = model(), request = await h.plan(); h.afterWrite = () => { h.readFailure = true; };
    await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_UNVERIFIED', mayHaveCommitted: true }); assert.equal(h.writes, 1);
    h.readFailure = false; await h.m.addCatalogShortcut(request); assert.equal(h.writes, 1); assert.equal(h.state.links.length, 3);
});
test('concurrent changes after uncertain write cannot be overwritten by retry', async () => {
    const h = model(), request = await h.plan(); h.afterWrite = () => { h.state.links[0].title = 'Concurrent'; };
    await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_UNVERIFIED' }); const before = clone(h.state);
    await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_CONFLICT' }); assert.deepEqual(h.state, before); assert.equal(h.writes, 1);
});
test('privacy changed during readback blocks success and retry', async () => {
    const h = model(), request = await h.plan(); h.afterWrite = () => { h.state.privacy.onlineFavicons = true; };
    await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_UNVERIFIED' });
    await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_CONFLICT' }); assert.equal(h.writes, 1);
});
test('completed ticket cannot be replayed after external restoration', async () => {
    const h = model(), request = await h.plan(), before = clone(h.state); await h.m.addCatalogShortcut(request);
    for (const key of Object.keys(h.state)) delete h.state[key]; Object.assign(h.state, before);
    await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_CONFLICT' }); assert.equal(h.writes, 1);
});
for (const url of ['http://example.com', 'javascript:alert(1)', 'https://user@example.com', 'https://@example.com', 'https:///example.com', 'https://example.com/ bad', 'https://example.com/%xx', 'https://example.com\\bad']) {
    test(`unsafe site URL rejected: ${url}`, async () => {
        const h = model(), p = await h.plan({ name: 'Site', url, icon: 'S' });
        await assert.rejects(h.m.addCatalogShortcut(p), { code: 'CATALOG_INVALID' }); assert.equal(h.writes, 0);
    });
}
for (const site of [{ name: '', url: 'https://example.com', icon: 'S' }, { name: 'Site', url: 'https://example.com', icon: 'https://icons.example.com/a.png' },
    { name: 'Site', url: 'https://example.com', icon: '<img>' }]) {
    test(`invalid catalog text or external icon rejected ${JSON.stringify(site)}`, async () => {
        const h = model(); await assert.rejects(h.m.addCatalogShortcut(await h.plan(site)), { code: 'CATALOG_INVALID' }); assert.equal(h.writes, 0);
    });
}
test('invalid request or unsupported state fails closed', async () => {
    const h = model(); for (const p of [null, 1, {}, []]) await assert.rejects(h.m.addCatalogShortcut(p), { code: 'CATALOG_INVALID' });
    h.state.categories.push({ id: 'work', name: 'Duplicate' });
    await assert.rejects(h.m.readNavigationLibrarySnapshot(), { code: 'CATALOG_INVALID' }); assert.equal(h.writes, 0);
});
test('workspace guard is preserved and required lock cannot silently fall back', async () => {
    const h = model(), request = await h.plan(); h.m.withLocalWriteLock = async () => { const error = new Error('workspace closed'); error.code = 'WORKSPACE_STALE'; throw error; };
    await assert.rejects(h.m.addCatalogShortcut(request), { code: 'WORKSPACE_STALE' }); assert.equal(h.writes, 0);
    const prior = Object.getOwnPropertyDescriptor(global, 'navigator'); Object.defineProperty(global, 'navigator', { configurable: true, value: {} });
    try { await assert.rejects(new StorageManager().readNavigationLibrarySnapshot(), { code: 'LINKS_LOCK_UNAVAILABLE' }); }
    finally { if (prior) Object.defineProperty(global, 'navigator', prior); else delete global.navigator; }
});
test('read failure before first write is safely retryable; unreadable uncertain retry remains unverified', async () => {
    const h = model(), request = await h.plan(); h.readFailure = true;
    await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_FAILED' }); assert.equal(h.writes, 0);
    h.readFailure = false; h.afterWrite = () => { h.readFailure = true; };
    await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_UNVERIFIED' });
    await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_UNVERIFIED', mayHaveCommitted: true }); assert.equal(h.writes, 1);
});
test('identity allocation exhaustion cannot mutate any stored data', async () => {
    const id = 'l_' + '0'.repeat(32);
    const h = model({ schemaVersion: 2, links: [{ title: 'One', url: 'https://example.com/', icon: 'E', category: 'work', layoutId: id }],
        layout: { identityVersion: 1, positions: {}, positionsById: { [id]: {} } } });
    const before = clone(h.state); h.m.createLayoutIdentity = () => id;
    await assert.rejects(h.m.addCatalogShortcut(await h.plan()), { code: 'CATALOG_INVALID' }); assert.equal(h.writes, 0); assert.deepEqual(h.state, before);
});
test('missing privacy/sync fields use effective defaults without storing defaults', async () => {
    const h = model(); delete h.state.privacy; delete h.state.sync;
    const snapshot = await h.m.readNavigationLibrarySnapshot();
    assert.deepEqual(snapshot.privacy, { syncEnabled: false, onlineFavicons: false });
    await h.m.addCatalogShortcut(await h.plan()); assert.equal(Object.hasOwn(h.state, 'privacy'), false); assert.equal(Object.hasOwn(h.state, 'sync'), false);
});
test('non-default workspace displays Sync off while retaining global privacy conflict guard', async () => {
    const h = model({ sync: { enabled: true } }); h.m.workspace = { id: 'secondary' };
    const snapshot = await h.m.readNavigationLibrarySnapshot();
    assert.equal(snapshot.privacy.syncEnabled, false); assert.equal(snapshot.state.catalogPrivacy.syncEnabled, true);
    const request = await h.plan(); h.state.sync.enabled = false;
    await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_CONFLICT' }); assert.equal(h.writes, 0);
    h.m.workspace = { id: 'default' }; h.state.sync.enabled = true;
    assert.equal((await h.m.readNavigationLibrarySnapshot()).privacy.syncEnabled, true);
});

async function workspaceFixture() {
    const Workspaces = require('../shared/workspaces.js');
    if (!globalThis.crypto?.subtle) globalThis.crypto = require('node:crypto').webcrypto;
    const raw = { links: [], categories: [{ id: 'work', name: 'Work', icon: 'W' }],
        privacy: { onlineFavicons: false }, sync: { enabled: true } };
    const writes = [], listeners = new Set(), queues = new Map(); let serial = 0;
    const locks = { request(name, options, action) {
        action ||= options;
        const result = (queues.get(name) || Promise.resolve()).then(action);
        queues.set(name, result.catch(() => {})); return result;
    } };
    const chrome = { storage: { local: {
        async get(keys) {
            if (keys == null) return structuredClone(raw);
            const names = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
            return structuredClone(Object.fromEntries(names.filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]])));
        },
        async set(values) {
            writes.push(structuredClone(values));
            const changes = Object.fromEntries(Object.keys(values).map(key => [key, { oldValue: structuredClone(raw[key]), newValue: structuredClone(values[key]) }]));
            Object.assign(raw, structuredClone(values)); for (const listener of listeners) listener(changes, 'local');
        }
    }, onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } } };
    const manager = Workspaces.createManager({ chrome, locks, id: () => `catalog_test_${++serial}` });
    const defaultStorage = new StorageManager({ workspace: manager.capture('default') });
    await manager.ready();
    const entry = await manager.create('Secondary');
    const session = manager.capture(entry.id), storage = new StorageManager({ workspace: session });
    await session.local.set({ links: [], categories: [{ id: 'work', name: 'Work', icon: 'W' }], layout: { positions: {}, autoArrange: false } });
    return { manager, session, storage, defaultStorage, raw, writes, Workspaces };
}

test('real workspace facade adds only to pinned secondary bundle without sync and guards global changes', async () => {
    const h = await workspaceFixture(); let syncs = 0; h.storage.scheduleSyncPush = () => { syncs++; };
    const snapshot = await h.storage.readNavigationLibrarySnapshot();
    assert.equal(snapshot.privacy.syncEnabled, false); assert.equal(snapshot.state.catalogPrivacy.syncEnabled, true);
    assert.equal(await h.storage.isSyncEnabledLocally(), false);
    assert.equal((await h.defaultStorage.readNavigationLibrarySnapshot()).privacy.syncEnabled, true);
    const baseline = structuredClone(h.raw), offset = h.writes.length;
    const request = { baseline: snapshot.state, destination: 'work', site: { name: 'Site', url: 'https://new.example.com', icon: 'S' } };
    const saved = await h.storage.addCatalogShortcut(request);
    assert.equal(saved.privacy.syncEnabled, false); assert.equal(saved.state.catalogPrivacy.syncEnabled, true); assert.equal(syncs, 0);
    const bundleKey = h.Workspaces.bundleKey(h.session);
    assert.equal(h.writes.length - offset, 1); assert.deepEqual(Object.keys(h.writes[offset]), [bundleKey]);
    for (const key of Object.keys(baseline)) if (key !== bundleKey) assert.deepEqual(h.raw[key], baseline[key]);
    assert.equal((await h.defaultStorage.readNavigationLibrarySnapshot()).links.length, 0);
    const next = { baseline: saved.state, destination: 'work', site: { name: 'Next', url: 'https://next.example.com', icon: 'N' } };
    h.raw.sync.enabled = false;
    await assert.rejects(h.storage.addCatalogShortcut(next), { code: 'CATALOG_CONFLICT' }); assert.equal(h.writes.length - offset, 1);
});

test('real workspace facade rejects a reviewed add after its session is trashed', async () => {
    const h = await workspaceFixture(), snapshot = await h.storage.readNavigationLibrarySnapshot();
    const request = { baseline: snapshot.state, destination: 'work', site: { name: 'Site', url: 'https://new.example.com', icon: 'S' } };
    await h.manager.trash(h.session.id); const before = structuredClone(h.raw), offset = h.writes.length;
    await assert.rejects(h.storage.addCatalogShortcut(request), { code: 'WORKSPACE_INVALIDATED' });
    assert.equal(h.writes.length, offset); assert.deepEqual(h.raw, before);
});
