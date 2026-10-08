const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const StorageManager = require('../storage');
const Identity = require('../shared/layout-identity');
const { createHarness } = require('./helpers/dashboard-harness');
const clone = value => JSON.parse(JSON.stringify(value));
const url = 'https://example.com/shared';
const link = (title, category = 'work', value = url) => ({ title, url: value, icon: '🌐', category });
const position = { x: 37.125, y: -5.75 };
let state, failRead, failWrite, writes, idCounter;
function reset(links = [link('A'), link('B')]) {
    state = { links: clone(links), layout: { autoArrange: false, alignToGrid: false, gridSize: 96, columns: 6, positions: {
        [`all|${url}`]: position, [`hidden|with|separator|${url}`]: { x: 909.25, y: 301.5 }, opaque: { x: -99.25, y: 17.5 }
    } }, sync: { enabled: false } };
    failRead = false; failWrite = false; writes = []; idCounter = 0;
    let queue = Promise.resolve();
    Object.defineProperty(global, 'navigator', { configurable: true, value: { locks: { request(name, action) {
        assert.equal(name, 'local-itab-local-write'); const task = queue.then(action); queue = task.catch(() => {}); return task;
    } } } });
}
function manager() { const m = new StorageManager(); m._syncInitialized = true; m.createLayoutIdentity = () => `l_${(++idCounter).toString(16).padStart(32, '0')}`; return m; }
async function allocate(m) { return m.applyLayoutPatch({ autoArrange: false }, {}, await m.getLayoutSnapshotForUpdate()); }
function page(m, config) {
    const h = createHarness(config.links);
    h.context.storageManager = m; h.context.window.storageManager = m;
    vm.runInContext(fs.readFileSync('shared/layout-identity.js', 'utf8'), h.context);
    vm.runInContext(fs.readFileSync('shared/layout.js', 'utf8'), h.context);
    h.component.layout = clone(config.layout); h.component.positions = h.component.layout.positions;
    h.component.identityPositions = h.component.layout.positionsById || {};
    h.component.layoutBaseline = clone(config);
    h.component.applyLayoutMode = h.context.ShortcutsComponent.prototype.applyLayoutMode;
    h.component.reflowVisibleLayout = h.context.ShortcutsComponent.prototype.reflowVisibleLayout;
    h.context.window.categoryNavigation.currentCategory = 'all';
    h.component.ensureLayoutController(); h.component.updateGrid();
    return h;
}
const watchdog = setTimeout(() => { console.error('Identity model did not settle.'); process.exit(1); }, 10000);
(async () => {
    const oldChrome = global.chrome, oldNavigator = Object.getOwnPropertyDescriptor(global, 'navigator'), oldError = console.error;
    global.chrome = { storage: { local: {
        async get(keys) { if (failRead) throw new Error('read failed'); return keys ? Object.fromEntries(keys.filter(key => key in state).map(key => [key, clone(state[key])])) : clone(state); },
        async set(value) { if (failWrite) throw new Error('write failed'); writes.push(clone(value)); Object.assign(state, clone(value)); },
        async remove(keys) { for (const key of keys) delete state[key]; }
    } } };
    console.error = () => {};
    try {
        reset(); const m = manager(), old = clone(state);
        const snapshot = await allocate(m), ids = snapshot.links.map(item => item.layoutId);
        assert.equal(new Set(ids).size, 2); assert(ids.every(id => Identity.idPattern.test(id)));
        assert.equal(writes.length, 1, 'records, maps, generation and recovery commit together');
        assert.deepEqual(state.layout.positions, old.layout.positions);
        for (const id of ids) {
            assert.deepEqual(state.layout.positionsById[id].all, position);
            assert.deepEqual(state.layout.positionsById[id]['hidden|with|separator'], { x: 909.25, y: 301.5 });
        }
        const original = await m.getRecoveryBackup('original');
        assert.deepEqual(original.data.links, old.links); assert.deepEqual(original.data.layout, old.layout);
        assert.equal(original.schemaVersion, 1);
        const moved = await m.applyLayoutPatch({}, {}, snapshot, () => {}, { [Identity.key(ids[1], 'all')]: { x: 217.25, y: 133.5 } });
        assert.deepEqual(state.layout.positionsById[ids[0]].all, position);
        assert.deepEqual(state.layout.positionsById[ids[1]].all, { x: 217.25, y: 133.5 });
        assert.deepEqual(state.layout.positions, old.layout.positions);
        const h = page(m, moved);
        assert.equal(h.tile(0).style.left, '37.125px'); assert.equal(h.tile(1).style.left, '208px');
        assert.equal(h.component.getSavedPosition(h.component.links[0], 'constructor'), undefined);
        assert.equal(h.component.getSavedPosition(h.component.links[0], '__proto__'), undefined);
        h.component.setSavedPosition(h.component.links[0], '__proto__', { x: 11.25, y: 22.5 });
        assert.deepEqual(clone(h.component.getSavedPosition(h.component.links[0], '__proto__')), { x: 11.25, y: 22.5 });
        h.grid.rect.width = 800; h.component.refreshTemplate(); assert.equal(h.tile(1).style.left, '217.25px');
        const reordered = await m.set('links', [moved.links[1], moved.links[0]], { expectedLinks: moved.links, expectedLayoutGeneration: moved.generation, operation: { type: 'reorder', from: 1, to: 0 }, returnSnapshot: true });
        assert.equal(reordered.links[0].layoutId, ids[1]);
        const editedLinks = clone(reordered.links); editedLinks[0] = { ...editedLinks[0], title: 'Renamed', url: 'https://example.com/new', category: 'social' };
        const edited = await m.set('links', editedLinks, { expectedLinks: reordered.links, expectedLayoutGeneration: reordered.generation, operation: { type: 'edit', index: 0 }, returnSnapshot: true });
        assert.equal(edited.links[0].layoutId, ids[1]); assert.deepEqual(edited.layout.positionsById[ids[1]].all, { x: 217.25, y: 133.5 });
        const deleted = await m.set('links', edited.links.slice(1), { expectedLinks: edited.links, operation: { type: 'delete', index: 0 }, returnSnapshot: true });
        assert.equal(deleted.links[0].layoutId, ids[0]); assert(Identity.has(deleted.layout.positionsById, ids[1]));

        // Whole v2 envelope is lossless; legacy envelopes remain accepted, while
        // identity data stripped of its version envelope is rejected.
        const data = { ...m.cloneDefaultConfig(), links: moved.links, layout: moved.layout };
        for (const payload of [m.buildManualExportPayload(data), m.buildDriveBackupPayload(data)]) {
            assert.equal(payload.schemaVersion, 2);
            const restored = m.validateImportPayload(payload);
            assert.deepEqual(restored.links, data.links); assert.deepEqual(restored.layout, data.layout);
        }
        assert.throws(() => m.validateImportPayload(data), /schema-2/);
        for (const modify of [config => { config.links[1].layoutId = config.links[0].layoutId; }, config => { config.links[1].layoutId = 'bad'; }, config => { delete config.links[1].layoutId; }]) {
            const bad = clone(data); modify(bad); assert.throws(() => m.validateImportPayload({ version: '1.0', schemaVersion: 2, data: bad }));
        }
        const legacy = { links: [link('Twin'), link('Twin')], layout: old.layout };
        for (const payload of [legacy, { settings: legacy }, { version: '1.0', data: legacy }]) assert.deepEqual(m.validateImportPayload(payload).links, legacy.links);
        assert.equal(await m.setAll({ ...m.cloneDefaultConfig(), ...legacy }, { skipSyncInitialization: true, confirmedRestore: true, skipSyncSideEffects: true }), true);
        const recovery = await m.getRecoveryBackup(); assert.equal(recovery.schemaVersion, 2);
        assert.deepEqual(recovery.data.links, deleted.links);

        // Editing X into Y carries X history, including inactive maps.
        reset([link('X', 'work', 'https://example.com/x'), link('Y')]); const n = manager();
        state.layout.positions['all|https://example.com/x'] = { x: 311.25, y: 87.5 };
        const baseline = await n.getLayoutSnapshotForUpdate(), next = clone(baseline.links); next[0].url = url;
        const collision = await n.set('links', next, { expectedLinks: baseline.links, expectedLayoutGeneration: baseline.generation, operation: { type: 'edit', index: 0 }, returnSnapshot: true });
        assert.deepEqual(collision.layout.positionsById[collision.links[0].layoutId].all, { x: 311.25, y: 87.5 });
        assert.deepEqual(collision.layout.positionsById[collision.links[1].layoutId].all, position);
        const newLinks = [...collision.links, link('New')];
        const added = await n.set('links', newLinks, { expectedLinks: collision.links, operation: { type: 'add', index: 2 }, returnSnapshot: true });
        assert.deepEqual(added.layout.positionsById[added.links[2].layoutId], {}, 'new Add has no invented history');
        assert.deepEqual(added.layout.positions, state.layout.positions);

        // Two simultaneous first allocations cannot mint competing bindings.
        reset(); const first = manager(), second = manager(), start = await first.getLayoutSnapshotForUpdate();
        const results = await Promise.allSettled([first.applyLayoutPatch({ autoArrange: false }, {}, start), second.applyLayoutPatch({ autoArrange: false }, {}, start)]);
        assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].reason.code, 'LAYOUT_CONTEXT_CHANGED'); assert.equal(writes.length, 1);
        const beforeFailure = clone(state);
        for (const failure of ['read', 'write']) {
            reset(); const q = manager(), before = clone(state), expected = await q.getLayoutSnapshotForUpdate();
            if (failure === 'read') failRead = true; else failWrite = true;
            await assert.rejects(q.applyLayoutPatch({ autoArrange: false }, {}, expected));
            assert.deepEqual(state, before); assert.equal(writes.length, 0);
        }
        reset(); state = beforeFailure; const current = manager();
        const corrupt = clone(state); corrupt.links[0].layoutId = 'bad'; state = corrupt;
        await assert.rejects(current.getAll(), error => error.code === 'LAYOUT_IDENTITY_INVALID');
        assert.deepEqual(state, corrupt);
        console.log('layout identity tests ok (allocation, actual storage/UI, recovery and backup models)');
    } finally {
        global.chrome = oldChrome; console.error = oldError;
        if (oldNavigator) Object.defineProperty(global, 'navigator', oldNavigator); else delete global.navigator;
    }
})().then(() => clearTimeout(watchdog), error => { clearTimeout(watchdog); console.error(error); process.exitCode = 1; });
