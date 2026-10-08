const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const StorageManager = require('../storage');
const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const defer = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const links = ['a', 'b'].map(title => ({ title, url: `https://example.com/${title}`, category: 'work', icon: '🌐' }));
const initial = { autoArrange: false, alignToGrid: false, columns: 6, gridSize: 96, positions: {
    'all|https://example.com/a': { x: 10.125, y: 20.25 },
    'all|https://example.com/b': { x: 106.5, y: 20.25 },
    'hidden|https://example.com/a': { x: 907.25, y: 603.5 }
} };
const firstKey = 'all|https://example.com/a', secondKey = 'all|https://example.com/b';
function locks() {
    let queue = Promise.resolve();
    return { request(name, operation) {
        assert.equal(name, 'local-itab-local-write');
        const task = queue.then(operation); queue = task.catch(() => {}); return task;
    } };
}
const key = new StorageManager().layoutGenerationKey;
let state, writes, reads, failSet, failRead, failRemove, onRead, onSet, onRemove;
function reset() {
    state = { layout: clone(initial), links: clone(links), appearance: { template: 'folio', colorMode: 'dark' }, categories: [{ id: 'work', name: 'Work', icon: 'W' }] };
    writes = []; reads = 0; failSet = false; failRead = false; failRemove = false; onRead = null; onSet = null; onRemove = null;
    Object.defineProperty(global, 'navigator', { configurable: true, value: { locks: locks() } });
}
function manager() { const storage = new StorageManager(); storage._syncInitialized = true; return storage; }
function controller(storage, baseline, options = {}) {
    const paints = [], states = [], errors = [];
    const timers = new Map(); let id = 0;
    const context = { window: { location: { reload() { context.reloads++; } } }, reloads: 0, console,
        setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout(timer) { timers.delete(timer); } };
    vm.createContext(context); vm.runInContext(fs.readFileSync('shared/layout.js', 'utf8'), context);
    const value = new context.window.LocalItabLayout.Controller({ storage, initial: baseline?.layout || initial, baseline,
        render: (layout, state) => states.push({ layout: clone(layout), state }),
        onApply: (layout, state) => paints.push({ layout: clone(layout), state }),
        onError: error => errors.push(error), ...options });
    return { value, context, paints, states, errors, timers };
}
(async () => {
    const previousChrome = global.chrome, previousNavigator = Object.getOwnPropertyDescriptor(global, 'navigator'), previousError = console.error;
    global.chrome = { storage: { local: {
        async get(keys) {
            if (failRead) throw new Error('read unavailable');
            const result = keys === null ? clone(state) : Object.fromEntries(keys.filter(k => k in state).map(k => [k, clone(state[k])]));
            if (keys === null || keys.includes('layout')) { reads++; await onRead?.(); }
            return result;
        },
        async set(values) { if (failSet) throw new Error('write unavailable'); await onSet?.(values); writes.push(clone(values)); Object.assign(state, clone(values)); },
        async remove(keys) { if (failRemove) throw new Error('remove unavailable'); await onRemove?.(); for (const k of keys) delete state[k]; }
    } } };
    console.error = () => {};
    try {
        // No first-run migration; the trustworthy baseline shares the same read
        // as the visible configuration and cannot leak into any backup/export.
        reset(); const a = manager(), b = manager();
        const config = await a.getAll();
        assert(config._layoutBaseline); assert.equal(config._layoutBaseline.generation, null);
        assert.equal(Object.keys(config).includes('_layoutBaseline'), false); assert.equal(writes.length, 0);
        for (const backup of [a.buildManualExportPayload(config), a.buildDriveBackupPayload(config), a.prepareSyncPayload(config).payload]) {
            assert(!JSON.stringify(backup).includes('layoutBaseline')); assert(!JSON.stringify(backup).includes(key));
        }
        const legacy = clone(config._layoutBaseline);
        // Hold A's authoritative read while B waits for the exact same lock.
        const entered = defer(), release = defer();
        onRead = async () => { entered.resolve(); await release.promise; };
        const pa = a.applyLayoutPatch({}, { [firstKey]: { x: 37.25, y: 53.75 } }, legacy);
        await entered.promise;
        const pb = b.applyLayoutPatch({}, { [secondKey]: { x: 173.5, y: 113.625 } }, legacy);
        await tick(); assert.equal(reads, 2, 'only getAll plus A read; B is blocked'); assert.equal(writes.length, 0);
        release.resolve(); await pa; await pb; onRead = null;
        assert.deepEqual(state.layout.positions[firstKey], { x: 37.25, y: 53.75 });
        assert.deepEqual(state.layout.positions[secondKey], { x: 173.5, y: 113.625 });
        assert.deepEqual(state.layout.positions['hidden|https://example.com/a'], initial.positions['hidden|https://example.com/a']);
        assert.deepEqual(state.appearance, { template: 'folio', colorMode: 'dark' });
        assert.equal(state[key], undefined, 'ordinary deltas do not migrate/generate a private token');

        // Disjoint fields merge; mode is one logical pair, including Grid's
        // intentionally partial autoArrange patch. Identical intents are safe.
        reset(); const baseline = await a.getLayoutSnapshotForUpdate();
        await a.applyLayoutPatch({ columns: 3 }, {}, baseline);
        await b.applyLayoutPatch({ gridSize: 144 }, {}, baseline);
        assert.equal(state.layout.columns, 3); assert.equal(state.layout.gridSize, 144);
        await b.applyLayoutPatch({ columns: 3 }, {}, baseline);
        await assert.rejects(a.applyLayoutPatch({ columns: 8 }, {}, baseline), error => error.code === 'LAYOUT_CONFLICT' && error.latestLayoutSnapshot.layout.columns === 3);
        await a.applyLayoutPatch({ autoArrange: false, alignToGrid: true }, {}, baseline);
        await assert.rejects(b.applyLayoutPatch({ autoArrange: true }, {}, baseline), error => error.code === 'LAYOUT_CONFLICT');
        assert.equal(state.layout.autoArrange, false); assert.equal(state.layout.alignToGrid, true);

        reset(); const original = await a.getLayoutSnapshotForUpdate();
        await a.applyLayoutPatch({}, { [firstKey]: { x: 33.125, y: 45.25 } }, original);
        await assert.rejects(b.applyLayoutPatch({}, { [firstKey]: { x: 99, y: 77 } }, original), error => error.code === 'LAYOUT_CONFLICT');
        assert.equal(writes.length, 1); assert.deepEqual(state.layout.positions[firstKey], { x: 33.125, y: 45.25 });

        // Unchanged categories in an unrelated Save Settings do not invalidate
        // the options page/dashboard; a real category change still does.
        reset(); const unrelated = await a.getLayoutSnapshotForUpdate();
        await b.setAll({ clock: { hour12: true, showSeconds: false }, categories: clone(state.categories) });
        assert.equal(state[key], undefined);
        await a.applyLayoutPatch({ columns: 4 }, {}, unrelated);
        assert.equal(state.layout.columns, 4);

        // Full restore, identical restore, direct layout writes, category change,
        // sync's central replacement path and reset all invalidate old writers.
        for (const replace of [
            () => b.setAll({ ...b.cloneDefaultConfig(), links: clone(links), layout: clone(initial) }),
            () => b.set('layout', clone(initial)),
            () => b.set('links', clone(links)),
            () => b.set('categories', [{ id: 'new', name: 'New', icon: 'N' }]),
            () => b.writeLocalValues({ ...b.cloneDefaultConfig(), links: clone(links), layout: clone(initial) }),
            () => b.clear()
        ]) {
            reset(); const old = await a.getLayoutSnapshotForUpdate();
            await replace(); assert.equal(typeof state[key], 'string');
            const after = clone(state), count = writes.length;
            await assert.rejects(a.applyLayoutPatch({}, { [firstKey]: { x: 400, y: 300 } }, old), error => error.code === 'LAYOUT_CONTEXT_CHANGED');
            assert.deepEqual(state, after); assert.equal(writes.length, count);
            const fresh = await b.getLayoutSnapshotForUpdate();
            await b.applyLayoutPatch({ columns: 7 }, {}, fresh);
            assert.equal(state.layout.columns, 7);
            const exportConfig = await b.getAll();
            assert(!JSON.stringify(exportConfig).includes(key));
            assert(!JSON.stringify(b.buildDriveBackupPayload(exportConfig)).includes(key));
        }

        // The restore waits for an already-started layout write. The later
        // replacement wins; the following stale patch cannot resurrect it.
        reset(); const old = await a.getLayoutSnapshotForUpdate();
        const writing = defer(), resume = defer();
        onSet = async values => { if (values.layout && !values[key]) { writing.resolve(); await resume.promise; } };
        const drag = a.applyLayoutPatch({}, { [firstKey]: { x: 888, y: 999 } }, old); await writing.promise;
        const restoredLayout = { ...clone(initial), columns: 2 };
        const restoring = b.setAll({ links: [], layout: restoredLayout }); await tick(); assert.equal(writes.length, 0);
        resume.resolve(); await drag; await restoring; onSet = null;
        assert.deepEqual(state.layout, restoredLayout); assert.deepEqual(state.links, []);
        await assert.rejects(a.applyLayoutPatch({ columns: 9 }, {}, old), error => error.code === 'LAYOUT_CONTEXT_CHANGED');

        // Reset partial failures cannot create null-generation ABA or clear data
        // before an invalidating token has been persisted.
        for (const failure of ['token', 'remove']) {
            reset(); const before = clone(state), old = await a.getLayoutSnapshotForUpdate();
            if (failure === 'token') failSet = true; else failRemove = true;
            assert.equal(await b.clear(), false);
            if (failure === 'token') assert.deepEqual(state, before);
            else {
                assert.equal(typeof state[key], 'string');
                await assert.rejects(a.applyLayoutPatch({ columns: 2 }, {}, old), error => error.code === 'LAYOUT_CONTEXT_CHANGED');
                for (const [k, v] of Object.entries(before)) assert.deepEqual(state[k], v);
            }
        }

        // Reads cannot pair reset's new generation with its old data between
        // token persistence and removal. Both bootstrap and refresh wait.
        reset(); const removal = defer(), finishRemoval = defer();
        onRemove = async () => { removal.resolve(); await finishRemoval.promise; };
        const clearing = b.clear(); await removal.promise;
        let bootstrapDone = false, refreshDone = false;
        const bootstrap = a.getAll().then(value => { bootstrapDone = true; return value; });
        const refreshing = a.getLayoutSnapshotForUpdate().then(value => { refreshDone = true; return value; });
        await tick(); assert.equal(bootstrapDone, false); assert.equal(refreshDone, false);
        finishRemoval.resolve(); await clearing;
        const afterReset = await bootstrap, refreshed = await refreshing; onRemove = null;
        assert.deepEqual(afterReset.layout, a.defaultConfig.layout);
        assert.deepEqual(refreshed.layout, a.defaultConfig.layout);
        assert.equal(afterReset._layoutBaseline.generation, state[key]);

        // Guarded same-page shortcut CRUD uses expected lists rather than token
        // churn. A stale page cannot add positions for the replaced/removed list.
        reset(); const beforeCrud = await a.getLayoutSnapshotForUpdate();
        const updatedLinks = [...links, { title: 'c', url: 'https://example.com/c', category: 'work', icon: 'C' }];
        assert.equal(await b.set('links', updatedLinks, { expectedLinks: links }), true);
        assert.equal(state[key], undefined);
        await assert.rejects(a.applyLayoutPatch({}, { [firstKey]: { x: 88, y: 99 } }, beforeCrud), error => error.code === 'LAYOUT_CONTEXT_CHANGED');
        await a.applyLayoutPatch({}, { [firstKey]: { x: 88, y: 99 } }, { ...beforeCrud, links: updatedLinks });
        assert.deepEqual(state.layout.positions[firstKey], { x: 88, y: 99 });

        // A corrupt layout baseline must not turn unrelated readable data into
        // whole-config defaults in export or the dashboard.
        reset(); state[key] = null;
        const warn = console.warn; console.warn = () => {};
        const readable = await a.getAll(); console.warn = warn;
        assert.equal(readable._layoutBaseline, undefined);
        assert.deepEqual(readable.links, links.map(link => ({ title: link.title, url: link.url, icon: link.icon, category: link.category })));
        assert.deepEqual(readable.appearance, state.appearance);

        // Failed initial reads cannot authorize a write using fallback defaults.
        reset(); failRead = true;
        const fallback = await a.getAll(); assert.equal(fallback._layoutBaseline, undefined);
        const noBaseline = controller(a, fallback._layoutBaseline);
        failRead = false; assert.equal(await noBaseline.value.select('grid'), false);
        assert.equal(noBaseline.states.at(-1).state, 'reload'); assert.equal(writes.length, 0);

        for (const failure of ['read', 'write', 'locks', 'corrupt-layout', 'corrupt-links', 'corrupt-generation']) {
            reset(); const expected = await a.getLayoutSnapshotForUpdate();
            if (failure === 'read') failRead = true;
            if (failure === 'write') failSet = true;
            if (failure === 'locks') navigator.locks = undefined;
            if (failure === 'corrupt-layout') state.layout.positions[firstKey].x = 'bad';
            if (failure === 'corrupt-links') state.links.push(null);
            if (failure === 'corrupt-generation') state[key] = null;
            await assert.rejects(a.applyLayoutPatch({ columns: 2 }, {}, expected));
            assert.equal(writes.length, 0, failure);
        }

        // Two real page controllers merge independent drags using the actual
        // transaction, and same-key conflict is visible until deliberate retry.
        reset(); const start = await a.getLayoutSnapshotForUpdate();
        const ca = controller(a, start), cb = controller(b, start);
        ca.value.change({}, { [firstKey]: { x: 77.25, y: 37.5 } }, { debounce: true });
        cb.value.change({}, { [secondKey]: { x: 171.125, y: 113.25 } }, { debounce: true });
        await Promise.all([ca.value.flush(), cb.value.flush()]);
        assert.deepEqual(state.layout.positions[firstKey], { x: 77.25, y: 37.5 });
        assert.deepEqual(state.layout.positions[secondKey], { x: 171.125, y: 113.25 });
        const conflict = controller(manager(), start);
        conflict.value.change({}, { [firstKey]: { x: 15, y: 17 } }, { debounce: true });
        assert.equal(await conflict.value.flush(), false);
        assert.equal(conflict.states.at(-1).state, 'conflict');
        assert.deepEqual(clone(conflict.value.confirmed.positions[firstKey]), { x: 77.25, y: 37.5 });
        assert.equal(await conflict.value.retry(), true);
        assert.deepEqual(state.layout.positions[firstKey], { x: 15, y: 17 });

        // Replacement discovered by an older started transaction also invalidates
        // a newer queued request. Neither can silently rebase onto the restore.
        for (const kind of ['context', 'same-key']) {
            reset(); const snapshot = await a.getLayoutSnapshotForUpdate();
            const c = controller(a, snapshot);
            const entered = defer(), release = defer();
            const originalApply = a.applyLayoutPatch.bind(a);
            let delayed = true;
            a.applyLayoutPatch = async (...args) => { if (delayed) { delayed = false; entered.resolve(); await release.promise; } return originalApply(...args); };
            const first = c.value.select('grid'); await entered.promise;
            const second = c.value.select('snap');
            if (kind === 'context') await b.setAll({ links: [], layout: clone(initial) });
            else await b.applyLayoutPatch({ autoArrange: false, alignToGrid: true }, {}, snapshot);
            const count = writes.length; release.resolve(); await first; await second;
            assert.equal(writes.length, count, 'queued old intent must not write after conflict');
            assert.equal(c.states.at(-1).state, kind === 'context' ? 'reload' : 'conflict');
            if (kind === 'context') {
                assert.equal(await c.value.select('free'), false);
                await c.value.retry(); assert.equal(c.context.reloads, 1);
            } else {
                assert.equal(await c.value.retry(), true);
                assert.equal(state.layout.alignToGrid, true);
            }
            a.applyLayoutPatch = originalApply;
        }

        // Own earlier success advances the baseline for a queued same-key edit.
        reset(); const snapshot = await a.getLayoutSnapshotForUpdate(), c = controller(a, snapshot);
        const started = defer(), releaseOwn = defer(); let firstWrite = true;
        onSet = async () => { if (firstWrite) { firstWrite = false; started.resolve(); await releaseOwn.promise; } };
        const one = c.value.select('grid'); await started.promise;
        const two = c.value.select('snap'); releaseOwn.resolve(); await one; await two; onSet = null;
        assert.equal(c.states.at(-1).state, 'saved'); assert.equal(state.layout.autoArrange, false); assert.equal(state.layout.alignToGrid, true);

        // An Add initializer must not bless an older pending drag with a new list.
        reset(); const beforeAdd = await a.getLayoutSnapshotForUpdate(); let pageLinks = clone(links);
        const adding = controller(a, beforeAdd, { getLinks: () => pageLinks });
        adding.value.change({}, { [firstKey]: { x: 66, y: 77 } }, { debounce: true });
        await b.set('links', updatedLinks, { expectedLinks: links }); pageLinks = clone(updatedLinks);
        assert.equal(await adding.value.change({}, { 'all|https://example.com/c': { x: 200, y: 200 } }, { debounce: true }), false);
        await adding.value.flush();
        assert.equal(adding.states.at(-1).state, 'reload'); assert.deepEqual(state.layout, initial);
        // A failed Delete restored its old links and has no new context to adopt.
        reset(); const beforeDelete = await a.getLayoutSnapshotForUpdate(); pageLinks = clone(links);
        const deleting = controller(a, beforeDelete, { getLinks: () => pageLinks });
        failSet = true; assert.equal(await b.set('links', links.slice(1), { expectedLinks: links }), false); failSet = false;
        await deleting.value.select('grid'); assert.equal(deleting.states.at(-1).state, 'saved');

        // Reset's new failure boundary must not report completion via reload.
        const resetContext = { document: { addEventListener() {} }, window: { location: { reload() { resetContext.reloads++; } } },
            storageManager: { clear: async () => false }, console: { error() {} }, reloads: 0 };
        vm.createContext(resetContext);
        vm.runInContext(fs.readFileSync('options.js', 'utf8') + '\nthis.notices = []; showMessage = (text, state) => notices.push({text, state});', resetContext);
        await resetContext.resetAllSettings();
        assert.equal(resetContext.reloads, 0); assert.equal(resetContext.notices.at(-1).state, 'error');

        console.log('layout write conflict tests ok (real storage methods, deterministic shared-lock/page models)');
    } finally {
        global.chrome = previousChrome; console.error = previousError;
        if (previousNavigator) Object.defineProperty(global, 'navigator', previousNavigator); else delete global.navigator;
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
