const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const StorageManager = require('../storage.js');
const Planner = require('../shared/bookmark-import.js');
const Identity = require('../shared/layout-identity.js');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const html = body => `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL>${body}</DL>`;
const anchor = (url = 'https://new.example/path', title = 'New bookmark') => `<DT><A HREF="${url}">${title}</A>`;
const input = html(anchor());
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture(initial = {}) {
    const manager = new StorageManager();
    let state = { ...clone(manager.defaultConfig), links: [{ title: 'Existing', url: 'https://existing.example/', icon: '🌐', category: 'work' }], ...clone(initial) };
    const writes = [], reads = [], hooks = {};
    let queue = Promise.resolve(), ids = 0, scheduled = 0;
    const locks = { request(name, operation) {
        assert.equal(name, 'local-itab-local-write');
        const result = queue.then(operation); queue = result.catch(() => {}); return result;
    } };
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks } });
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
    globalThis.chrome = { storage: { local: {
        async get(keys) {
            reads.push(clone(keys)); await hooks.beforeRead?.(keys);
            return clone(keys === null ? state : Object.fromEntries(keys.filter(key => Object.hasOwn(state, key)).map(key => [key, state[key]])));
        },
        async set(values) {
            await hooks.beforeWrite?.(values);
            writes.push(clone(values)); Object.assign(state, clone(values)); await hooks.afterWrite?.(values);
        },
        async remove(keys) { for (const key of keys) delete state[key]; }
    } } };
    globalThis.fetch = () => { throw new Error('Network is forbidden in import'); };
    manager._syncInitialized = true;
    manager.ensureSyncInitialized = async () => { throw new Error('Import must not initialize providers'); };
    manager.createLayoutIdentity = () => `l_${(++ids).toString(16).padStart(32, '0')}`;
    manager.scheduleSyncPush = () => { scheduled++; };
    return { manager, writes, reads, hooks, locks, get scheduled() { return scheduled; }, get state() { return state; },
        replace(value) { state = clone(value); },
        async snapshot() { return manager.getBookmarkImportSnapshot(); },
        async append(snapshot, text = input, extra = {}) { return manager.appendBookmarkImport({ text, expectedSnapshot: snapshot,
            expectedPrivacy: snapshot.privacy, batchId: 'test42', rootLabel: 'Imported bookmarks', ...extra }); } };
}

test('strict snapshots are read-only, bounded and do not initialize providers', async () => {
    const f = fixture(); const old = clone(f.state);
    const first = await f.snapshot(), second = await f.snapshot();
    assert.deepEqual(first, second); assert.equal(first.version, 1); assert.equal(f.writes.length, 0); assert.deepEqual(f.state, old);
    first.links[0].title = 'Caller change'; assert.equal(f.state.links[0].title, 'Existing');
    f.replace({}); const empty = await f.snapshot(); assert.equal(empty.links.length, 0); assert.equal(empty.categories.length, 5); assert.equal(empty.generation, null);
    assert.deepEqual(f.state, {}); assert.equal(f.writes.length, 0);
    f.replace({ links: new Array(20001).fill(old.links[0]) });
    await assert.rejects(f.snapshot(), { code: 'BOOKMARK_IMPORT_STATE_LIMIT' });
});

test('one atomic legacy append preserves all old records, positions, preferences and unrelated data', async () => {
    const f = fixture();
    f.state.links[0].extensionData = { keep: ['every', 'field'] };
    f.state.categories[0].extra = { orderHint: 3 };
    f.state.layout = { ...f.state.layout, positions: { 'all|https://existing.example/': { x: 10.25, y: -7.5 }, 'hidden|orphan': { x: 30, y: 50 } }, extensionField: 'keep' };
    Object.assign(f.state, { __localItabIdentityRecovery: { opaque: 'original' }, __localItabRestoreRecovery: { opaque: 'restore' },
        __localItabPersonalTasksV1: { tasks: ['private'] }, __localItabFocusV1: { history: ['private'] }, customConfig: { keep: true }, bg: { type: 'image', value: 'large opaque image' } });
    const old = clone(f.state), snapshot = await f.snapshot();
    const preview = Planner.planImport(input, snapshot, { rootLabel: 'Imported bookmarks', createCategoryId: ({ index }) => `import_test42_${index}` });
    const result = await f.append(snapshot);
    assert.equal(result.applied, true); assert.equal(result.addedBookmarks, 1); assert.equal(result.newCategories, 1);
    assert.deepEqual(result.preview, preview.preview); assert.deepEqual(f.state.links.slice(0, 1), old.links);
    assert.deepEqual(f.state.categories.slice(0, old.categories.length), old.categories);
    assert.deepEqual(f.state.links.at(-1), preview.additions.links[0]); assert.equal(f.state.links.at(-1).layoutId, undefined);
    assert.deepEqual(Object.keys(f.writes[0]).sort(), ['__localItabLayoutGeneration', 'categories', 'links']);
    for (const key of Object.keys(old).filter(key => !['links', 'categories'].includes(key))) assert.deepEqual(f.state[key], old[key], key);
    assert.equal(f.writes.length, 1); assert.equal(f.scheduled, 0);
    await assert.rejects(f.append(snapshot), { code: 'BOOKMARK_IMPORT_CONFLICT' });
});

test('canonical duplicates and zero additions do not write or schedule sync', async () => {
    const f = fixture(); f.state.sync.enabled = true;
    f.state.links.push({ ...f.state.links[0], title: 'Second preexisting duplicate', url: 'https://EXISTING.example:443/' });
    const before = clone(f.state), snapshot = await f.snapshot();
    const duplicate = html(anchor('https://existing.example/') + anchor('https://EXISTING.example:443/'));
    const result = await f.append(snapshot, duplicate);
    assert.equal(result.applied, false); assert.equal(result.addedBookmarks, 0); assert.equal(result.newCategories, 0);
    assert.equal(result.preview.skippedReasons.duplicate_url, 2); assert.equal(f.writes.length, 0); assert.equal(f.scheduled, 0); assert.deepEqual(f.state, before);
    const fresh = await f.append(snapshot, html(anchor() + anchor()));
    assert.equal(fresh.addedBookmarks, 1); assert.equal(fresh.preview.skippedReasons.duplicate_url, 1); assert.equal(f.scheduled, 1);
    assert.deepEqual(f.state.links.slice(0, 2), before.links);
});

test('identity mode reserves live and orphan IDs, appends fresh IDs, and preserves every historic position', async () => {
    const live = `l_${'1'.padStart(32, '0')}`, orphan = `l_${'2'.padStart(32, '0')}`;
    const f = fixture();
    f.state.links[0].layoutId = live;
    f.state.layout = { ...f.state.layout, identityVersion: 1, positionsById: { [live]: { all: { x: 11, y: 22 }, hidden: { x: -4, y: 9 } }, [orphan]: { gone: { x: 88, y: 99 } } },
        positions: { opaque: { x: 1, y: 2 } }, custom: { preserve: true } };
    f.state.schemaVersion = 2;
    const old = clone(f.state), snapshot = await f.snapshot();
    const result = await f.append(snapshot, html(anchor() + anchor('https://second-new.example/', 'Second')));
    assert.equal(result.applied, true); assert.equal(f.writes.length, 1);
    assert.deepEqual(f.state.links.slice(0, old.links.length), old.links);
    const newIds = f.state.links.slice(old.links.length).map(link => link.layoutId);
    assert.equal(new Set(newIds).size, 2); assert(newIds.every(id => Identity.idPattern.test(id) && ![live, orphan].includes(id)));
    for (const id of [live, orphan]) assert.deepEqual(f.state.layout.positionsById[id], old.layout.positionsById[id]);
    for (const id of newIds) assert.deepEqual(f.state.layout.positionsById[id], {});
    assert.deepEqual(f.state.layout.positions, old.layout.positions); assert.deepEqual(f.state.layout.custom, old.layout.custom);
    assert.equal(f.state.schemaVersion, 2); Identity.validateBundle(f.state);
});

test('latest legacy and identity position-only moves survive while context changes conflict', async () => {
    for (const identity of [false, true]) {
        const f = fixture(), id = `l_${'a'.repeat(32)}`;
        if (identity) { f.state.links[0].layoutId = id; f.state.layout.identityVersion = 1; f.state.layout.positionsById = { [id]: {} }; }
        const snapshot = await f.snapshot();
        delete f.manager.ensureSyncInitialized;
        const patch = identity ? { [Identity.key(id, 'all')]: { x: 77.5, y: -20 } } : {};
        await f.manager.applyLayoutPatch({}, { 'all|https://existing.example/': { x: 123.5, y: 456 } }, await f.manager.getLayoutSnapshotForUpdate(), () => {}, patch);
        const layout = clone(f.state.layout), writeCount = f.writes.length;
        await f.append(snapshot); assert.equal(f.writes.length, writeCount + 1); assert.deepEqual(f.state.layout.positions, layout.positions);
        if (identity) assert.deepEqual(f.state.layout.positionsById[id], layout.positionsById[id]);
    }
    for (const mutate of [state => { state.links[0].title = 'Edited elsewhere'; }, state => { state.links.reverse(); state.links.push({ ...state.links[0], title: 'New elsewhere' }); },
        state => { state.categories[0].name = 'Renamed elsewhere'; }, state => { state.layout.columns = 7; },
        state => { state.__localItabLayoutGeneration = 'new-generation'; }]) {
        const f = fixture(), snapshot = await f.snapshot(); mutate(f.state); const before = clone(f.state);
        await assert.rejects(f.append(snapshot), { code: 'BOOKMARK_IMPORT_CONFLICT' }); assert.equal(f.writes.length, 0); assert.deepEqual(f.state, before);
    }
});

test('privacy toggles require a new preview and cannot race a checked commit', async () => {
    for (const preference of ['sync', 'privacy']) {
        const f = fixture(), snapshot = await f.snapshot();
        if (preference === 'sync') f.state.sync.enabled = true; else f.state.privacy.onlineFavicons = true;
        await assert.rejects(f.append(snapshot), { code: 'BOOKMARK_IMPORT_PRIVACY_CHANGED' }); assert.equal(f.writes.length, 0);
    }
    const f = fixture(), snapshot = await f.snapshot(), entered = deferred(), resume = deferred();
    f.hooks.beforeWrite = async values => { if (values.links) { entered.resolve(); await resume.promise; } };
    const committing = f.append(snapshot); await entered.promise;
    let preferenceFinished = false;
    const changing = f.manager.writeLocalValues({ privacy: { onlineFavicons: true } }).then(() => { preferenceFinished = true; });
    await Promise.resolve(); assert.equal(preferenceFinished, false); assert.equal(f.state.privacy.onlineFavicons, false);
    resume.resolve(); const result = await committing; await changing;
    assert.equal(result.applied, true); assert.equal(result.snapshot.privacy.onlineFavicons, false); assert.equal(f.state.privacy.onlineFavicons, true);
    assert.equal(f.writes.length, 2);
    const g = fixture(), original = await g.snapshot(), holding = deferred(), release = deferred();
    const hold = g.locks.request('local-itab-local-write', async () => { holding.resolve(); await release.promise; }); await holding.promise;
    const preferenceFirst = g.manager.writeLocalValues({ sync: { enabled: true } });
    const importSecond = g.append(original); release.resolve(); await hold; await preferenceFirst;
    await assert.rejects(importSecond, { code: 'BOOKMARK_IMPORT_PRIVACY_CHANGED' }); assert.equal(g.writes.length, 1);
});

test('corrupt raw records fail closed and never invoke display recovery or normalization', async () => {
    const corruptions = [
        s => { s.links = null; }, s => { s.links.push({ title: '', url: 'https://bad.example', icon: 'x', category: 'work' }); },
        s => { s.links[0].title = ' padded '; }, s => { s.links[0].url = 'missing-scheme.example'; }, s => { delete s.links[0].icon; },
        s => { s.links[0].layoutId = 'invalid'; }, s => { s.categories.push(clone(s.categories[0])); },
        s => { s.categories[0].name = ' padded '; }, s => { delete s.categories[0].id; },
        s => { s.layout = null; }, s => { s.layout.positions = { x: { x: 'no', y: 2 } }; },
        s => { s.layout.columns = 999; }, s => { s.layout.identityVersion = 1; }, s => { s.schemaVersion = 99; },
        s => { s.sync = null; }, s => { s.sync.enabled = 'yes'; }, s => { s.privacy.onlineFavicons = 1; },
        s => { s.__localItabLayoutGeneration = ''; }
    ];
    for (const corrupt of corruptions) {
        const f = fixture(), baseline = await f.snapshot(); corrupt(f.state); const old = clone(f.state);
        await assert.rejects(f.snapshot()); await assert.rejects(f.append(baseline)); assert.equal(f.writes.length, 0); assert.deepEqual(f.state, old);
    }
});

test('missing locks, failed reads, bad input and oversized caller state never write', async () => {
    const f = fixture(), snapshot = await f.snapshot();
    delete globalThis.navigator.locks;
    await assert.rejects(f.snapshot(), { code: 'LINKS_LOCK_UNAVAILABLE' }); await assert.rejects(f.append(snapshot), { code: 'LINKS_LOCK_UNAVAILABLE' });
    globalThis.navigator.locks = f.locks;
    f.hooks.beforeRead = () => { throw new Error('read unavailable'); };
    await assert.rejects(f.snapshot(), /read unavailable/); await assert.rejects(f.append(snapshot), /read unavailable/); delete f.hooks.beforeRead;
    await assert.rejects(f.append(snapshot, '<html>broken</html>'), { code: 'MISSING_MARKER' });
    await assert.rejects(f.append(snapshot, input, { batchId: '<invalid>' }), { code: 'BOOKMARK_IMPORT_INVALID_REQUEST' });
    await assert.rejects(f.append(snapshot, input, { expectedSnapshot: { ...snapshot, links: new Array(20001) } }), { code: 'BOOKMARK_IMPORT_STATE_LIMIT' });
    const cyclic = clone(snapshot); cyclic.extra = cyclic;
    await assert.rejects(f.append(snapshot, input, { expectedSnapshot: cyclic }), { code: 'BOOKMARK_IMPORT_INVALID_STATE' });
    const huge = clone(snapshot); huge.extra = 'a'.repeat(12 * 1024 * 1024);
    await assert.rejects(f.append(snapshot, input, { expectedSnapshot: huge }), { code: 'BOOKMARK_IMPORT_STATE_LIMIT' });
    const accessor = clone(snapshot);
    Object.defineProperty(accessor, 'unsafe', { enumerable: true, get() { throw new Error('Getter must not be invoked'); } });
    await assert.rejects(f.append(snapshot, input, { expectedSnapshot: accessor }), { code: 'BOOKMARK_IMPORT_INVALID_STATE' });
    assert.equal(f.writes.length, 0);
});

test('write rejection, partial/mismatching writes and readback failures never report success or retry', async () => {
    for (const mode of ['rejectBefore', 'rejectAfter', 'readback', 'mismatch']) {
        const f = fixture(), snapshot = await f.snapshot();
        if (mode === 'rejectBefore') f.hooks.beforeWrite = () => { throw new Error('quota unavailable'); };
        if (mode === 'rejectAfter') f.hooks.afterWrite = () => { throw new Error('ambiguous rejection'); };
        if (mode === 'readback') f.hooks.afterWrite = () => { f.hooks.beforeRead = () => { throw new Error('verification unavailable'); }; };
        if (mode === 'mismatch') f.hooks.afterWrite = () => { f.state.links.pop(); };
        await assert.rejects(f.append(snapshot), error => error.code === 'BOOKMARK_IMPORT_UNVERIFIED' && error.mayHaveCommitted === true);
        assert.equal(f.scheduled, 0); assert.equal(f.writes.length, mode === 'rejectBefore' ? 0 : 1);
    }
    const f = fixture(), snapshot = await f.snapshot();
    f.hooks.afterWrite = () => { throw new Error('after commit lost acknowledgment'); };
    await assert.rejects(f.append(snapshot), { code: 'BOOKMARK_IMPORT_UNVERIFIED' }); delete f.hooks.afterWrite;
    const retry = await f.append(await f.snapshot()); assert.equal(retry.applied, false); assert.equal(f.writes.length, 1);
});

test('reset, confirmed restore and first identity allocation invalidate stale previews', async () => {
    {
        const f = fixture(), snapshot = await f.snapshot(); f.state.__localItabPersonalTasksV1 = { saved: true };
        assert.equal(await f.manager.clear(), true); const resetState = clone(f.state), writes = f.writes.length;
        await assert.rejects(f.append(snapshot), { code: 'BOOKMARK_IMPORT_CONFLICT' }); assert.equal(f.writes.length, writes); assert.deepEqual(f.state, resetState);
    }
    {
        const f = fixture(), snapshot = await f.snapshot(); const replacement = clone(f.manager.defaultConfig);
        replacement.links = [{ title: 'Restored', url: 'https://restore.example/', icon: 'R', category: 'work' }];
        assert.equal(await f.manager.setAll(replacement, { confirmedRestore: true, skipSyncInitialization: true, skipSyncSideEffects: true }), true);
        const restored = clone(f.state), writes = f.writes.length;
        await assert.rejects(f.append(snapshot), { code: 'BOOKMARK_IMPORT_CONFLICT' }); assert.deepEqual(f.state, restored); assert.equal(f.writes.length, writes);
    }
    {
        const f = fixture(); f.state.links.push({ ...f.state.links[0], title: 'Twin' }); const snapshot = await f.snapshot();
        delete f.manager.ensureSyncInitialized;
        await f.manager.applyLayoutPatch({ autoArrange: false }, {}, await f.manager.getLayoutSnapshotForUpdate());
        const identified = clone(f.state), writes = f.writes.length;
        await assert.rejects(f.append(snapshot), { code: 'BOOKMARK_IMPORT_CONFLICT' }); assert.deepEqual(f.state, identified); assert.equal(f.writes.length, writes);
    }
});

test('planner remains authoritative, reserves orphan category references, and cannot be fed forged additions', async () => {
    const f = fixture(); f.state.links[0].category = 'import_test42_0';
    const snapshot = await f.snapshot();
    await assert.rejects(f.append(snapshot), { code: 'ID_COLLISION_OR_INVALID' }); assert.equal(f.writes.length, 0);
    const g = fixture(), current = await g.snapshot();
    const result = await g.append(current, input, { additions: { links: [{ title: 'Injected', url: 'https://evil.example/' }], categories: [] } });
    assert.equal(result.addedBookmarks, 1); assert.equal(g.state.links.at(-1).title, 'New bookmark');
});


test('imported legacy and identity snapshots retain JSON backup/restore compatibility', async () => {
    for (const identity of [false, true]) {
        const f = fixture(), id = `l_${'b'.repeat(32)}`;
        f.state.layout.positions = { 'all|https://existing.example/': { x: 101.25, y: -9.75 }, 'hidden|retired': { x: 13, y: 88 } };
        if (identity) {
            f.state.links[0].layoutId = id;
            f.state.layout.identityVersion = 1;
            f.state.layout.positionsById = { [id]: { all: { x: 1000.5, y: 20.25 }, custom: { x: 45, y: 67 } } };
        }
        const oldLayout = clone(f.state.layout);
        const result = await f.append(await f.snapshot());
        assert.equal(result.applied, true);
        for (const create of ['buildManualExportPayload', 'buildDriveBackupPayload']) {
            const payload = f.manager[create](f.state);
            assert.equal(payload.schemaVersion, identity ? 2 : 1);
            const restored = f.manager.validateImportPayload(payload);
            assert.deepEqual(restored.links, f.state.links);
            assert.deepEqual(restored.categories, f.state.categories);
            assert.deepEqual(restored.layout, f.state.layout);
            assert.deepEqual(restored.layout.positions, oldLayout.positions);
            if (identity) assert.deepEqual(restored.layout.positionsById[id], oldLayout.positionsById[id]);
        }
    }
});

// Real Chrome storage dictionaries may come back in lexicographic key order.
// A JSON stringify equality check would reject these successful native writes.
const shuffleObjectKeys = value => {
    if (Array.isArray(value)) return value.map(shuffleObjectKeys);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, shuffleObjectKeys(value[key])]));
};
test('native-style dictionary key ordering is ignored by CAS and verified readback, including identity maps', async () => {
    for (const identity of [false, true]) {
        const f = fixture(), id = `l_${'c'.repeat(32)}`;
        f.state.links[0].extra = { z: [{ y: 2, a: 1 }], a: false };
        f.state.layout.positions = { existing: { y: 27, x: 13 } };
        if (identity) {
            f.state.links[0].layoutId = id;
            f.state.layout.identityVersion = 1;
            f.state.layout.positionsById = { [id]: { work: { y: 30, x: 20 }, all: { y: 2, x: 1 } } };
        }
        const snapshot = await f.snapshot();
        f.replace(shuffleObjectKeys(f.state));
        assert.notEqual(JSON.stringify(f.state.links), JSON.stringify(snapshot.links), 'fixture changes only dictionary insertion order');
        f.hooks.afterWrite = () => f.replace(shuffleObjectKeys(f.state));
        const result = await f.append(snapshot);
        assert.equal(result.applied, true); assert.equal(result.addedBookmarks, 1);
        assert.equal(f.writes.length, 1);
        assert.deepEqual(result.snapshot.links.slice(0, 1), snapshot.links);
        assert.deepEqual(result.snapshot.layout.positions, snapshot.layout.positions);
        if (identity) assert.deepEqual(result.snapshot.layout.positionsById[id], snapshot.layout.positionsById[id]);
    }
});

test('verified readback still rejects changed values, array order, missing/extra fields and array/object types', async () => {
    const mutations = [
        state => { state.links.at(-1).title = 'Different title'; },
        state => { state.links.reverse(); },
        state => { delete state.links.at(-1).icon; },
        state => { state.links.at(-1).extra = true; },
        state => { state.links[0].extra = [7]; },
        state => { state.links[0].extra = { 0: '7' }; }
    ];
    for (const mutate of mutations) {
        const f = fixture(); f.state.links[0].extra = { 0: 7 };
        const snapshot = await f.snapshot();
        f.hooks.afterWrite = () => { f.replace(shuffleObjectKeys(f.state)); mutate(f.state); };
        await assert.rejects(f.append(snapshot), error => error.code === 'BOOKMARK_IMPORT_UNVERIFIED' && error.mayHaveCommitted === true);
        assert.equal(f.writes.length, 1, 'uncertain writes are never retried or rolled back');
    }
});

test('CAS still rejects reordered arrays, changed values and missing/extra fields after dictionary reordering', async () => {
    const mutations = [
        state => { state.links.reverse(); },
        state => { state.links[0].title = 'Changed'; },
        state => { delete state.links[0].extra; },
        state => { state.links[0].added = 'extra'; },
        state => { state.links[0].extra = [7]; },
        state => { state.links[0].extra = { 0: '7' }; }
    ];
    for (const mutate of mutations) {
        const f = fixture(); f.state.links[0].extra = { 0: 7 };
        f.state.links.push({title: 'Second', url: 'https://second.example/', icon:'2', category:'work'});
        const snapshot = await f.snapshot(); f.replace(shuffleObjectKeys(f.state)); mutate(f.state);
        await assert.rejects(f.append(snapshot), {code: 'BOOKMARK_IMPORT_CONFLICT'});
        assert.equal(f.writes.length, 0);
    }
});
