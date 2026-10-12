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

const catalogSite = n => ({ name: `Site ${n}`, url: `https://site-${n}.example.com/`, icon: 'S' });
async function batchPlan(h, sites = [catalogSite(1), catalogSite(2)]) {
    const { site, ...request } = await h.plan();
    return { ...request, sites };
}

test('batch adds 1 through 20 sites in one atomic write and preserves legacy metadata', async () => {
    for (const count of [1, 20]) {
        const h = model(), before = clone(h.state), request = await batchPlan(h, Array.from({ length: count }, (_, i) => catalogSite(i)));
        const result = await h.m.addCatalogShortcut(request);
        assert.equal(result.addedCount, count); assert.equal(result.skippedCount, 0); assert.equal(Object.hasOwn(result, 'duplicate'), false);
        assert.equal(h.writes, 1); assert.equal(h.syncs, 1);
        assert.deepEqual(h.state, { ...before, links: [...before.links, ...request.sites.map(s => ({ title: s.name, url: s.url, icon: s.icon, category: 'personal' }))],
            __localItabLayoutGeneration: h.state.__localItabLayoutGeneration });
    }
});

test('batch rejects empty, oversized, non-array and ambiguous requests before any write', async () => {
    const h = model(), request = await batchPlan(h), before = clone(h.state);
    for (const sites of [[], Array.from({ length: 21 }, (_, i) => catalogSite(i)), null, {}, 'sites']) {
        await assert.rejects(h.m.addCatalogShortcut({ ...request, sites }), { code: 'CATALOG_INVALID' });
    }
    await assert.rejects(h.m.addCatalogShortcut({ ...request, site: catalogSite(3) }), { code: 'CATALOG_INVALID' });
    assert.equal(h.writes, 0); assert.deepEqual(h.state, before);
});

test('invalid later batch entry aborts the entire write even when an earlier entry is new or duplicate', async () => {
    for (const first of [catalogSite(1), { ...catalogSite(1), url: 'https://example.com/' }]) {
        for (const invalid of [null, { ...catalogSite(2), url: 'http://site-2.example.com' }, { ...catalogSite(2), icon: '<img>' }, { ...catalogSite(2), name: '' }]) {
            const h = model(), before = clone(h.state), request = await batchPlan(h, [first, invalid]);
            await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_INVALID' });
            assert.equal(h.writes, 0); assert.deepEqual(h.state, before);
        }
    }
});

test('batch deduplicates canonical URLs against all categories and itself in selection order', async () => {
    const h = model(), before = clone(h.state);
    const request = await batchPlan(h, [{ ...catalogSite(0), url: 'https://EXAMPLE.com:443' }, catalogSite(1),
        { ...catalogSite(2), url: 'https://SITE-1.example.com:443' }, catalogSite(3)]);
    const result = await h.m.addCatalogShortcut(request);
    assert.equal(result.addedCount, 2); assert.equal(result.skippedCount, 2); assert.equal(h.writes, 1);
    assert.deepEqual(h.state.links.slice(0, 2), before.links);
    assert.deepEqual(h.state.links.slice(2).map(x => x.title), ['Site 1', 'Site 3']);
    const duplicateRequest = await batchPlan(h, request.sites), saved = clone(h.state), syncs = h.syncs;
    const duplicate = await h.m.addCatalogShortcut(duplicateRequest);
    assert.equal(duplicate.addedCount, 0); assert.equal(duplicate.skippedCount, 4);
    assert.equal(h.writes, 1); assert.equal(h.syncs, syncs); assert.deepEqual(h.state, saved);
});

test('batch identities avoid both orphan map keys and earlier newly allocated identities', async () => {
    const id = n => 'l_' + String(n).padStart(32, '0');
    const h = model({ schemaVersion: 2, links: [{ title: 'Old', url: 'https://example.com/', icon: 'E', category: 'work', layoutId: id(1), extra: 7 }],
        layout: { identityVersion: 1, extra: { safe: true }, positions: { old: { x: 2, y: 3 } },
            positionsById: { [id(1)]: { work: { x: 3, y: 4 } }, [id(2)]: { all: { x: 5, y: 6 } } } } });
    const before = clone(h.state), ids = [1, 2, 3, 3, 2, 4]; h.m.createLayoutIdentity = () => id(ids.shift());
    const result = await h.m.addCatalogShortcut(await batchPlan(h));
    assert.equal(result.addedCount, 2); assert.equal(h.writes, 1);
    assert.deepEqual(h.state.links.map(x => x.layoutId), [id(1), id(3), id(4)]);
    assert.deepEqual(h.state.layout, { ...before.layout, positionsById: { ...before.layout.positionsById, [id(3)]: {}, [id(4)]: {} } });
    assert.deepEqual(h.state.links[0], before.links[0]); assert.equal(h.state.schemaVersion, 2);
});

test('batch later identity exhaustion never persists earlier allocated links', async () => {
    const id = n => 'l_' + String(n).padStart(32, '0');
    const h = model({ schemaVersion: 2, links: [], layout: { identityVersion: 1, positions: {}, positionsById: {} } });
    const before = clone(h.state); h.m.createLayoutIdentity = () => id(1);
    await assert.rejects(h.m.addCatalogShortcut(await batchPlan(h)), { code: 'CATALOG_INVALID' });
    assert.equal(h.writes, 0); assert.deepEqual(h.state, before);
});

test('batch failed write retries the whole selection and rejected committed write verifies counts', async () => {
    const h = model(), request = await batchPlan(h), before = clone(h.state); h.failure = 'before';
    await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_FAILED' }); assert.deepEqual(h.state, before);
    h.failure = 'after'; const saved = await h.m.addCatalogShortcut(request);
    assert.equal(saved.addedCount, 2); assert.equal(saved.skippedCount, 0); assert.equal(h.writes, 2);
    const retried = await h.m.addCatalogShortcut(request);
    assert.equal(retried.addedCount, 2); assert.equal(retried.skippedCount, 0); assert.equal(h.writes, 2);
});

test('batch uncertain readback retries read-only with original added and skipped counts', async () => {
    const h = model(), request = await batchPlan(h, [catalogSite(1), catalogSite(1), catalogSite(2)]);
    h.afterWrite = () => { h.readFailure = true; };
    await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_UNVERIFIED', mayHaveCommitted: true });
    await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_UNVERIFIED', mayHaveCommitted: true });
    h.readFailure = false; const saved = await h.m.addCatalogShortcut(request);
    assert.equal(saved.addedCount, 2); assert.equal(saved.skippedCount, 1); assert.equal(h.writes, 1); assert.equal(h.state.links.length, 4);
});

for (const [name, mutate] of Object.entries({ links: s => s.links.reverse(), destination: s => s.categories.pop(),
    layout: s => s.layout.positions.new = { x: 3, y: 4 }, privacy: s => s.privacy.onlineFavicons = true, sync: s => s.sync.enabled = true })) {
    test(`batch rejects stale ${name} before writing and after uncertain save`, async () => {
        const h = model(), request = await batchPlan(h); mutate(h.state); const before = clone(h.state);
        await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_CONFLICT' }); assert.equal(h.writes, 0); assert.deepEqual(h.state, before);
        const other = model(), otherRequest = await batchPlan(other); other.afterWrite = () => mutate(other.state);
        await assert.rejects(other.m.addCatalogShortcut(otherRequest), { code: 'CATALOG_UNVERIFIED' }); const saved = clone(other.state);
        await assert.rejects(other.m.addCatalogShortcut(otherRequest), { code: 'CATALOG_CONFLICT' }); assert.equal(other.writes, 1); assert.deepEqual(other.state, saved);
    });
}

test('batch double-submit shares one immutable retry ticket and distinct previews conflict', async () => {
    const h = model(), request = await batchPlan(h), competing = await batchPlan(h); let release;
    const original = h.m._local.set;
    h.m._local.set = async values => { await new Promise(resolve => { release = resolve; }); await original(values); };
    const a = h.m.addCatalogShortcut(request), b = h.m.addCatalogShortcut(request);
    await new Promise(setImmediate); request.sites[0].name = 'Mutated'; request.sites.pop(); request.destination = 'work'; release();
    const results = await Promise.all([a, b]); assert.deepEqual(results[0], results[1]);
    assert.equal(h.writes, 1); assert.equal(results[0].addedCount, 2); assert.equal(h.state.links[2].title, 'Site 1'); assert.equal(h.state.links[2].category, 'personal');
    await assert.rejects(h.m.addCatalogShortcut(competing), { code: 'CATALOG_CONFLICT' }); assert.equal(h.writes, 1);
});

test('batch real workspace writes one pinned bundle and respects later session invalidation', async () => {
    const h = await workspaceFixture(), snapshot = await h.storage.readNavigationLibrarySnapshot();
    const before = structuredClone(h.raw), offset = h.writes.length;
    const request = { baseline: snapshot.state, destination: 'work', sites: [catalogSite(1), catalogSite(2)] };
    const saved = await h.storage.addCatalogShortcut(request), bundleKey = h.Workspaces.bundleKey(h.session);
    assert.equal(saved.addedCount, 2); assert.equal(saved.privacy.syncEnabled, false);
    assert.equal(h.writes.length - offset, 1); assert.deepEqual(Object.keys(h.writes[offset]), [bundleKey]);
    for (const key of Object.keys(before)) if (key !== bundleKey) assert.deepEqual(h.raw[key], before[key]);
    await h.manager.trash(h.session.id); const trashed = structuredClone(h.raw), writes = h.writes.length;
    await assert.rejects(h.storage.addCatalogShortcut(request), { code: 'WORKSPACE_INVALIDATED' });
    assert.equal(h.writes.length, writes); assert.deepEqual(h.raw, trashed);
});

test('batch total shortcut capacity counts only new URLs and rejects overflow atomically', async () => {
    const links = Array.from({ length: 19999 }, () => ({ title: 'Old', url: 'https://example.com/', icon: 'E', category: 'work' }));
    const h = model({ links }), before = clone(h.state);
    await assert.rejects(h.m.addCatalogShortcut(await batchPlan(h)), { code: 'CATALOG_INVALID' });
    assert.equal(h.writes, 0); assert.deepEqual(h.state, before);
    const result = await h.m.addCatalogShortcut(await batchPlan(h, [catalogSite(1), catalogSite(1), { ...catalogSite(2), url: 'https://example.com/' }]));
    assert.equal(result.addedCount, 1); assert.equal(result.skippedCount, 2); assert.equal(h.state.links.length, 20000); assert.equal(h.writes, 1);
    const duplicate = await h.m.addCatalogShortcut(await batchPlan(h, [catalogSite(1)]));
    assert.equal(duplicate.addedCount, 0); assert.equal(duplicate.skippedCount, 1); assert.equal(h.writes, 1);
});

test('completed batch ticket cannot replay after external restoration', async () => {
    const h = model(), request = await batchPlan(h), before = clone(h.state);
    await h.m.addCatalogShortcut(request);
    for (const key of Object.keys(h.state)) delete h.state[key]; Object.assign(h.state, before);
    await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_CONFLICT' }); assert.equal(h.writes, 1);
});

test('batch requires its write lock and preserves workspace errors', async () => {
    const h = model(), request = await batchPlan(h); let required;
    h.m.withLocalWriteLock = async (work, lockRequired) => {
        required = lockRequired; const error = new Error('workspace closed'); error.code = 'WORKSPACE_STALE'; throw error;
    };
    await assert.rejects(h.m.addCatalogShortcut(request), { code: 'WORKSPACE_STALE' }); assert.equal(required, true); assert.equal(h.writes, 0);
});

async function newCategoryPlan(h, name = 'Reading', sites = [catalogSite(1), catalogSite(2)]) {
    const { destination, ...request } = await batchPlan(h, sites);
    return { ...request, newCategory: { name }, confirmedNewCategory: true };
}
const categoryId = n => 'cat_library_' + String(n).padStart(32, '0');

test('new category and batch are one atomic write preserving unknown records and normalized names', async () => {
    const h = model(), before = clone(h.state), request = await newCategoryPlan(h, '  Cafe\u0301 📚  ');
    let payload; const original = h.m._local.set; h.m._local.set = async values => { payload = clone(values); await original(values); };
    const saved = await h.m.addCatalogShortcut(request);
    assert.deepEqual(saved.createdCategory, { id: saved.destination, name: 'Café 📚', icon: '📁' });
    assert.match(saved.destination, /^cat_library_[a-f0-9]{32}$/);
    assert.deepEqual(Object.keys(payload).sort(), ['__localItabLayoutGeneration', 'categories', 'links']);
    assert.deepEqual(h.state, { ...before, categories: [...before.categories, saved.createdCategory],
        links: [...before.links, ...request.sites.map(site => ({ title: site.name, url: site.url, icon: site.icon, category: saved.destination }))],
        __localItabLayoutGeneration: h.state.__localItabLayoutGeneration });
    assert.equal(saved.addedCount, 2); assert.equal(h.writes, 1);
    saved.createdCategory.name = 'caller mutation';
    const retry = await h.m.addCatalogShortcut(request); assert.equal(retry.createdCategory.name, 'Café 📚'); assert.equal(h.writes, 1);
});

test('new-category input rejects missing confirmation, ambiguous targets and caller-selected IDs/icons', async () => {
    const h = model(), good = await newCategoryPlan(h), before = clone(h.state);
    for (const request of [ { ...good, confirmedNewCategory: false }, { ...good, confirmedNewCategory: undefined },
        { ...good, destination: 'work' }, { ...good, destination: undefined },
        { ...good, newCategory: null }, { ...good, newCategory: [] },
        { ...good, newCategory: { name: 'Reading', id: categoryId(1) } },
        { ...good, newCategory: { name: 'Reading', icon: 'https://external.example/icon' } } ]) {
        await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_INVALID' });
    }
    assert.equal(h.writes, 0); assert.deepEqual(h.state, before);
});

test('new category names count Unicode codepoints after trim and NFC, reject C0/C1 even at edges', async () => {
    for (const name of ['', '   ', '😀'.repeat(81), 'a\n', '\tname', 'name\u0000', 'name\u007f', 'name\u0085', 'name\u009f', 42]) {
        const h = model(); await assert.rejects(h.m.addCatalogShortcut(await newCategoryPlan(h, name)), { code: 'CATALOG_CATEGORY_NAME' }); assert.equal(h.writes, 0);
    }
    for (const name of ['😀'.repeat(80), 'e\u0301'.repeat(80)]) {
        const h = model(), saved = await h.m.addCatalogShortcut(await newCategoryPlan(h, ` ${name} `));
        assert.equal(Array.from(saved.createdCategory.name).length, 80); assert.equal(h.writes, 1);
    }
});

test('existing category names reject case-insensitive trim/NFC duplicates without merging', async () => {
    for (const name of [' work ', 'WORK', '  CAFE\u0301  ']) {
        const h = model(); h.state.categories.push({ id: 'accent', name: ' Café ' });
        const before = clone(h.state);
        await assert.rejects(h.m.addCatalogShortcut(await newCategoryPlan(h, name)), { code: 'CATALOG_CATEGORY_EXISTS' });
        assert.deepEqual(h.state, before); assert.equal(h.writes, 0);
    }
});

test('all-duplicate new-category selection creates no empty category, allocates no ID and does not sync', async () => {
    const h = model(), before = clone(h.state);
    h.m.createCatalogCategoryIdentity = () => { throw new Error('must not allocate'); };
    const saved = await h.m.addCatalogShortcut(await newCategoryPlan(h, 'Reading', [{ ...catalogSite(1), url: 'https://EXAMPLE.com:443' }]));
    assert.equal(saved.addedCount, 0); assert.equal(saved.skippedCount, 1); assert.equal(saved.createdCategory, null); assert.equal(saved.destination, null);
    assert.equal(h.writes, 0); assert.equal(h.syncs, 0); assert.deepEqual(h.state, before);
});

test('new category allocation skips existing, orphan, legacy, historical JSON and identity view IDs', async () => {
    const layoutId = 'l_' + '1'.repeat(32);
    const h = model({ schemaVersion: 2, links: [{ title: 'Old', url: 'https://example.com/', icon: 'E', category: categoryId(2), layoutId }],
        categories: [{ id: categoryId(1), name: 'Existing', extra: 8 }],
        layout: { identityVersion: 1, extra: { untouched: true }, positions: {
            [`${categoryId(3)}|https://orphan.example/`]: { x: 1, y: 2 },
            [JSON.stringify([categoryId(4), layoutId])]: { x: 3, y: 4 } },
        positionsById: { [layoutId]: { [categoryId(5)]: { x: 5, y: 6 } } } } });
    const before = clone(h.state); let n = 0;
    const ids = ['all', '__proto__', 'constructor', 'prototype', ...[1, 2, 3, 4, 5, 6].map(categoryId)];
    h.m.createCatalogCategoryIdentity = () => ids[n++];
    const saved = await h.m.addCatalogShortcut(await newCategoryPlan(h));
    assert.equal(saved.destination, categoryId(6)); assert.equal(n, 10); assert.equal(h.writes, 1);
    assert.deepEqual(h.state.layout.positions, before.layout.positions); assert.deepEqual(h.state.layout.positionsById[layoutId], before.layout.positionsById[layoutId]);
    assert.deepEqual(h.state.layout.extra, before.layout.extra); assert.deepEqual(h.state.links[0], before.links[0]);
    for (const link of h.state.links.slice(1)) { assert.equal(link.category, categoryId(6)); assert.deepEqual(h.state.layout.positionsById[link.layoutId], {}); }
});

test('new category ID exhaustion and later link-identity exhaustion both leave storage untouched', async () => {
    const h = model(); let allocations = 0;
    h.m.createCatalogCategoryIdentity = () => { allocations++; return 'all'; };
    const before = clone(h.state);
    await assert.rejects(h.m.addCatalogShortcut(await newCategoryPlan(h)), { code: 'CATALOG_INVALID' });
    assert.equal(allocations, 32); assert.equal(h.writes, 0); assert.deepEqual(h.state, before);
    const other = model({ schemaVersion: 2, links: [], layout: { identityVersion: 1, positions: {}, positionsById: {} } });
    other.m.createLayoutIdentity = () => 'l_' + '1'.repeat(32); const prior = clone(other.state);
    await assert.rejects(other.m.addCatalogShortcut(await newCategoryPlan(other)), { code: 'CATALOG_INVALID' });
    assert.equal(other.writes, 0); assert.deepEqual(other.state, prior);
});

test('new category capacity allows the 2000th category, rejects overflow, keeps duplicate selection read-only', async () => {
    const h = model({ categories: Array.from({ length: 1999 }, (_, n) => ({ id: `c${n}`, name: `Category ${n}` })) });
    await h.m.addCatalogShortcut(await newCategoryPlan(h)); assert.equal(h.state.categories.length, 2000);
    const before = clone(h.state);
    await assert.rejects(h.m.addCatalogShortcut(await newCategoryPlan(h, 'Overflow', [catalogSite(3)])), { code: 'CATALOG_INVALID' });
    assert.deepEqual(h.state, before); assert.equal(h.writes, 1);
    const saved = await h.m.addCatalogShortcut(await newCategoryPlan(h, 'Empty')); assert.equal(saved.addedCount, 0); assert.equal(saved.createdCategory, null); assert.equal(h.writes, 1);
});

test('new-category same-object double submit shares immutable request, concurrent previews conflict', async () => {
    const h = model(), request = await newCategoryPlan(h), competing = await newCategoryPlan(h, 'Other'); let release;
    const original = h.m._local.set;
    h.m._local.set = async values => { await new Promise(resolve => { release = resolve; }); await original(values); };
    const a = h.m.addCatalogShortcut(request), b = h.m.addCatalogShortcut(request);
    await new Promise(setImmediate); request.newCategory.name = 'Changed'; request.confirmedNewCategory = false; request.destination = 'work'; release();
    const [saved, duplicate] = await Promise.all([a, b]); assert.deepEqual(saved, duplicate); assert.equal(saved.createdCategory.name, 'Reading'); assert.equal(h.writes, 1);
    await assert.rejects(h.m.addCatalogShortcut(competing), { code: 'CATALOG_CONFLICT' }); assert.equal(h.writes, 1);
});

test('new category definitely failed write retries, rejected committed set verifies, unreadable readback retries read-only', async () => {
    const h = model(), request = await newCategoryPlan(h), before = clone(h.state); h.failure = 'before';
    await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_FAILED' }); assert.deepEqual(h.state, before);
    h.failure = 'after'; const saved = await h.m.addCatalogShortcut(request);
    assert.equal(h.writes, 2); assert.equal(h.state.categories.length, 3); assert.equal(saved.createdCategory.id, saved.destination);
    const retried = await h.m.addCatalogShortcut(request); assert.equal(retried.destination, saved.destination); assert.equal(h.writes, 2);
    const other = model(), otherRequest = await newCategoryPlan(other); other.afterWrite = () => { other.readFailure = true; };
    await assert.rejects(other.m.addCatalogShortcut(otherRequest), { code: 'CATALOG_UNVERIFIED', mayHaveCommitted: true });
    const committed = clone(other.state);
    await assert.rejects(other.m.addCatalogShortcut(otherRequest), { code: 'CATALOG_UNVERIFIED', mayHaveCommitted: true });
    other.readFailure = false; const verified = await other.m.addCatalogShortcut(otherRequest);
    assert.equal(verified.destination, committed.categories.at(-1).id); assert.equal(other.writes, 1); assert.deepEqual(other.state, committed);
});

for (const [name, mutate] of Object.entries({ category: s => s.categories[0].extra = 'changed',
    links: s => s.links[0].extra.i = 99, layout: s => s.layout.extra.untouched = 7,
    privacy: s => s.privacy.onlineFavicons = true, sync: s => s.sync.enabled = true })) {
    test(`new-category rejects stale ${name} and uncertain-save changes without extra writes`, async () => {
        const h = model(), request = await newCategoryPlan(h); mutate(h.state); const before = clone(h.state);
        await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_CONFLICT' }); assert.equal(h.writes, 0); assert.deepEqual(h.state, before);
        const other = model(), otherRequest = await newCategoryPlan(other); other.afterWrite = () => mutate(other.state);
        await assert.rejects(other.m.addCatalogShortcut(otherRequest), { code: 'CATALOG_UNVERIFIED' });
        const saved = clone(other.state); await assert.rejects(other.m.addCatalogShortcut(otherRequest), { code: 'CATALOG_CONFLICT' });
        assert.equal(other.writes, 1); assert.deepEqual(other.state, saved);
    });
}

test('new-category real workspace atomically writes one bundle, leaves default untouched and preserves invalidation', async () => {
    const h = await workspaceFixture(), snapshot = await h.storage.readNavigationLibrarySnapshot(), before = structuredClone(h.raw), offset = h.writes.length;
    const request = { baseline: snapshot.state, newCategory: { name: 'Reading' }, confirmedNewCategory: true, sites: [catalogSite(1), catalogSite(2)] };
    const saved = await h.storage.addCatalogShortcut(request), key = h.Workspaces.bundleKey(h.session);
    assert.equal(saved.addedCount, 2); assert.equal(saved.privacy.syncEnabled, false); assert.equal(h.writes.length - offset, 1);
    assert.deepEqual(Object.keys(h.writes[offset]), [key]);
    for (const field of Object.keys(before)) if (field !== key) assert.deepEqual(h.raw[field], before[field]);
    const actual = await h.storage.readNavigationLibrarySnapshot();
    assert.deepEqual(actual.categories.at(-1), saved.createdCategory); assert.ok(actual.links.every(link => link.category === saved.destination));
    assert.equal((await h.defaultStorage.readNavigationLibrarySnapshot()).categories.length, 1);
    await h.manager.trash(h.session.id); const trashed = structuredClone(h.raw), writes = h.writes.length;
    await assert.rejects(h.storage.addCatalogShortcut(request), { code: 'WORKSPACE_INVALIDATED' });
    assert.equal(h.writes.length, writes); assert.deepEqual(h.raw, trashed);
});

test('new category validates the final site before allocating a category or writing anything', async () => {
    for (const invalid of [null, { ...catalogSite(2), url: 'http://insecure.example.com/' },
        { ...catalogSite(2), icon: '<img>' }, { ...catalogSite(2), name: '' }]) {
        const h = model(), before = clone(h.state); let allocations = 0;
        h.m.createCatalogCategoryIdentity = () => { allocations++; return categoryId(1); };
        await assert.rejects(h.m.addCatalogShortcut(await newCategoryPlan(h, 'Reading', [catalogSite(1), invalid])), { code: 'CATALOG_INVALID' });
        assert.equal(allocations, 0); assert.equal(h.writes, 0); assert.equal(h.syncs, 0); assert.deepEqual(h.state, before);
    }
});

test('completed new-category ticket cannot recreate its category after external restoration to baseline', async () => {
    const h = model(), request = await newCategoryPlan(h), before = clone(h.state);
    await h.m.addCatalogShortcut(request);
    for (const key of Object.keys(h.state)) delete h.state[key]; Object.assign(h.state, before);
    h.m.createCatalogCategoryIdentity = () => { throw new Error('must not reallocate'); };
    await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_CONFLICT' });
    assert.equal(h.writes, 1); assert.equal(h.syncs, 1); assert.deepEqual(h.state, before);
});

test('new category in real default workspace reports enabled sync and schedules the complete committed snapshot', async () => {
    const h = await workspaceFixture(); let syncs = 0, scheduledSnapshot;
    h.defaultStorage.scheduleSyncPush = () => { syncs++; scheduledSnapshot = h.defaultStorage._local.get(null); };
    const snapshot = await h.defaultStorage.readNavigationLibrarySnapshot();
    assert.deepEqual(snapshot.privacy, { syncEnabled: true, onlineFavicons: false });
    const before = structuredClone(h.raw), offset = h.writes.length;
    const saved = await h.defaultStorage.addCatalogShortcut({ baseline: snapshot.state,
        newCategory: { name: 'Synced reading' }, confirmedNewCategory: true, sites: [catalogSite(1), catalogSite(2)] });
    assert.deepEqual(saved.privacy, { syncEnabled: true, onlineFavicons: false });
    assert.equal(syncs, 1); assert.equal(h.writes.length - offset, 1);
    scheduledSnapshot = await scheduledSnapshot;
    assert.deepEqual(scheduledSnapshot.categories, [...snapshot.categories, saved.createdCategory]);
    assert.deepEqual(scheduledSnapshot.links, saved.links);
    assert.ok(scheduledSnapshot.links.every(link => link.category === saved.destination));
    const secondaryKey = h.Workspaces.bundleKey(h.session);
    assert.deepEqual(h.raw[secondaryKey], before[secondaryKey]);
});

test('new-category retry after identity exhaustion reports only the category actually committed', async () => {
    const h = model({ schemaVersion: 2, links: [], layout: { identityVersion: 1, positions: {}, positionsById: {} } });
    const request = await newCategoryPlan(h), before = clone(h.state);
    h.m.createCatalogCategoryIdentity = () => categoryId(1);
    h.m.createLayoutIdentity = () => 'l_' + '1'.repeat(32);
    await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_INVALID' });
    assert.equal(h.writes, 0); assert.deepEqual(h.state, before);
    h.m.createCatalogCategoryIdentity = () => categoryId(2);
    let next = 1; h.m.createLayoutIdentity = () => 'l_' + String(next++).padStart(32, '0');
    const saved = await h.m.addCatalogShortcut(request);
    assert.equal(h.writes, 1); assert.equal(saved.destination, categoryId(2));
    assert.deepEqual(saved.createdCategory, { id: categoryId(2), name: 'Reading', icon: '📁' });
    assert.deepEqual(h.state.categories, [...before.categories, saved.createdCategory]);
    assert.equal(h.state.categories.some(category => category.id === categoryId(1)), false);
    assert.equal(h.state.links.length, 2); assert.ok(h.state.links.every(link => link.category === saved.destination));
    const retry = await h.m.addCatalogShortcut(request);
    assert.deepEqual(retry.createdCategory, saved.createdCategory); assert.equal(retry.destination, saved.destination); assert.equal(h.writes, 1);
});

test('new-category definite write failure followed by external duplicate conflicts without returning or creating a phantom category', async () => {
    const h = model(), request = await newCategoryPlan(h, 'Reading', [catalogSite(1)]), before = clone(h.state);
    h.m.createCatalogCategoryIdentity = () => categoryId(1); h.failure = 'before';
    await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_FAILED' });
    assert.deepEqual(h.state, before);
    h.failure = undefined;
    h.state.links.push({ title: 'Externally added', url: catalogSite(1).url, icon: 'E', category: 'work' });
    const external = clone(h.state);
    h.m.createCatalogCategoryIdentity = () => { throw new Error('must not allocate another category'); };
    await assert.rejects(h.m.addCatalogShortcut(request), { code: 'CATALOG_CONFLICT' });
    assert.equal(h.writes, 1); assert.equal(h.syncs, 0); assert.deepEqual(h.state, external);
    assert.deepEqual(h.state.categories, before.categories);
});
