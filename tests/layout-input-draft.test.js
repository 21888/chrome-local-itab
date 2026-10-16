const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const StorageManager = require('../storage');
const { createDocument } = require('./helpers/task-dom-model');
const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function harness(field = 'columns') {
    const document = createDocument(), handlers = new Map(), changes = [], writes = [], requests = [];
    let reloads = 0;
    const storage = new StorageManager();
    let data = { layout: { ...clone(storage.defaultConfig.layout), autoArrange: field === 'columns', alignToGrid: true }, generation: null, links: [] };
    storage.onLocalChanged = fn => { changes.push(fn); };
    storage.getLayoutSnapshotForUpdate = async () => clone(data);
    // Real applyLayoutPatch conflict/readback code; only I/O and lock are modeled.
    storage.ensureSyncInitialized = async () => {};
    storage.isSyncEnabledLocally = async () => false;
    let queue = Promise.resolve();
    storage.withLocalWriteLock = action => {
        const next = queue.then(action); queue = next.catch(() => {}); return next;
    };
    Object.defineProperty(storage, '_local', { value: {
        async get() { return { layout: clone(data.layout), links: clone(data.links), ...(data.generation === null ? {} : { [storage.layoutGenerationKey]: data.generation }) }; },
        async set(value) { writes.push(clone(value)); data.layout = clone(value.layout); }
    } });
    const apply = storage.applyLayoutPatch.bind(storage);
    storage.applyLayoutPatch = (patch, positions, expected, ...rest) => {
        requests.push({ patch: clone(patch), expected: clone(expected) });
        return apply(patch, positions, expected, ...rest);
    };
    const window = { storageManager: storage, location: { reload() { reloads++; } }, confirm: () => false, addEventListener(type, fn) { handlers.set(type, fn); } };
    document.body.prepend = (...nodes) => document.body.append(...nodes);
    const context = vm.createContext({ window, document, console, setTimeout, clearTimeout });
    for (const file of ['layout', 'local-content-lifecycle']) vm.runInContext(fs.readFileSync(`shared/${file}.js`, 'utf8'), context);
    const host = document.createElement('div'), columns = document.createElement('input'), gridSize = document.createElement('input');
    document.body.append(host, columns, gridSize);
    for (const input of [columns, gridSize]) {
        // Native HTMLInputElement coerces numeric assignments to text.
        let value = ''; Object.defineProperty(input, 'value', { get: () => value, set: next => { value = String(next); } });
    }
    const controller = new window.LocalItabLayout.Controller({ storage, initial: data.layout, baseline: data });
    window.layoutController = controller;
    window.LocalItabLayout.mount(host, controller, { columns, gridSize });
    const input = field === 'columns' ? columns : gridSize;
    return { window, document, host, columns, gridSize, controller, storage, changes, writes, requests, handlers, input,
        get reloads() { return reloads; },
        guarded() { const event = { preventDefault() { this.prevented = true; } }; handlers.get('beforeunload')(event); return Boolean(event.prevented); },
        snapshot: () => clone(data), setSnapshot(value) { data = clone(value); },
        type(value) { input.focus(); input.value = value; input.dispatch('input'); } };
}

for (const field of ['columns', 'gridSize']) {
    test(`layout ${field}: successful refresh does not erase unfinished numeric typing`, async () => {
        const h = harness(field), saved = h.snapshot();
        h.type(field === 'columns' ? '8' : '144'); h.document.body.focus();
        await h.controller.refresh();
        assert.equal(h.input.value, field === 'columns' ? '8' : '144');
        assert.deepEqual(h.snapshot(), saved); assert.equal(h.writes.length, 0);
    });
    test(`layout ${field}: late failed refresh does not erase an empty draft`, async () => {
        const h = harness(field), gate = deferred();
        h.storage.getLayoutSnapshotForUpdate = () => gate.promise;
        const reading = h.controller.refresh(); h.type('');
        gate.reject(new Error('synthetic read failure')); await reading;
        assert.equal(h.input.value, ''); assert.equal(h.writes.length, 0);
    });
}

test('raw layout input blocks reload/departure and Save-and-switch does not silently submit it', async () => {
    const h = harness();
    assert.equal(h.guarded(), false);
    for (const raw of ['8', '', '1e', '1.5']) {
        h.type(raw); h.document.body.focus();
        assert.equal(h.controller.hasUncommittedWork(), true, raw); assert.equal(h.guarded(), true, raw);
        assert.equal(h.window.LocalItabContentLifecycle.reload(), false);
        assert.equal(await h.window.LocalItabContentLifecycle.saveDrafts(), false);
        assert.equal(h.reloads, 0); assert.equal(h.writes.length, 0); assert.equal(h.input.value, raw);
    }
    h.type('6'); assert.equal(h.controller.hasUncommittedWork(), false); assert.equal(h.guarded(), false);
    assert.equal(h.window.LocalItabContentLifecycle.reload(), true); assert.equal(h.reloads, 1);
});

test('an untouched field follows refresh and returns to normal after the draft is deliberately saved', async () => {
    const h = harness(); const latest = h.snapshot(); latest.layout.columns = 7;
    h.setSnapshot(latest); await h.controller.refresh(); assert.equal(h.input.value, '7');
    h.type('8'); h.input.dispatch('change'); await h.controller.queue;
    assert.equal(h.snapshot().layout.columns, 8); assert.equal(h.input.value, '8');
    assert.equal(h.controller.hasUncommittedWork(), false); assert.equal(h.guarded(), false);
    assert.equal(h.host.querySelector('.layout-status').textContent, 'Saved');
    const next = h.snapshot(); next.layout.columns = 9; h.setSnapshot(next); await h.controller.refresh();
    assert.equal(h.input.value, '9'); assert.equal(h.writes.length, 1);
});

for (const raw of ['9', '6', '']) {
    for (const failed of [false, true]) {
        test(`an older ${failed ? 'failed' : 'successful'} save keeps later raw input ${JSON.stringify(raw)}`, async () => {
            const h = harness(), gate = deferred(), apply = h.storage.applyLayoutPatch;
            h.storage.applyLayoutPatch = async (...args) => { await gate.promise; if (failed) throw new Error('synthetic write failure'); return apply(...args); };
            h.type('8'); h.input.dispatch('change'); await tick(); h.type(raw); h.document.body.focus();
            gate.resolve(); await h.controller.queue;
            assert.equal(h.input.value, raw); assert.equal(h.guarded(), true);
            assert.equal(h.controller.hasUncommittedWork(), true);
            assert.equal(h.snapshot().layout.columns, failed ? 6 : 8);
            assert.equal(h.writes.length, failed ? 0 : 1);
            if (!failed) assert.match(h.host.querySelector('.layout-status').textContent, /Unsaved layout input/);
        });
    }
}

test('rapid consecutive numeric submissions inherit the earlier own write, without creating a false conflict', async () => {
    const h = harness(), gate = deferred(), apply = h.storage.applyLayoutPatch;
    let calls = 0;
    h.storage.applyLayoutPatch = async (...args) => { if (++calls === 1) await gate.promise; return apply(...args); };
    h.type('8'); h.input.dispatch('change'); await tick();
    h.type('9'); h.input.dispatch('change'); gate.resolve(); await h.controller.queue;
    assert.equal(h.snapshot().layout.columns, 9); assert.equal(h.input.value, '9');
    assert.equal(h.requests[0].expected.layout.columns, 6); assert.equal(h.requests[1].expected.layout.columns, 8);
    assert.equal(h.controller.hasUncommittedWork(), false); assert.equal(h.writes.length, 2);
});

for (const timing of ['before', 'during']) {
    test(`a ${timing}-typing refresh preserves the original same-field conflict baseline`, async () => {
        const h = harness(), gate = deferred(), read = h.storage.getLayoutSnapshotForUpdate;
        const remote = h.snapshot(); remote.layout.columns = 7;
        let refreshing;
        if (timing === 'before') {
            h.storage.getLayoutSnapshotForUpdate = () => gate.promise;
            refreshing = h.controller.refresh();
        }
        h.type('8'); h.document.body.focus(); h.setSnapshot(remote);
        if (refreshing) { gate.resolve(remote); await refreshing; h.storage.getLayoutSnapshotForUpdate = read; }
        else { for (const listener of h.changes) listener({ layout: { newValue: remote.layout } }, 'local'); await tick(); }
        assert.equal(h.controller.confirmed.columns, 7); assert.equal(h.input.value, '8');
        h.input.dispatch('change'); await h.controller.queue;
        assert.equal(h.requests.at(-1).expected.layout.columns, 6);
        assert.equal(h.snapshot().layout.columns, 7); assert.equal(h.writes.length, 0);
        assert.equal(h.host.dataset.saveState, 'conflict'); assert.equal(h.input.value, '8');
        assert.match(h.host.querySelector('.layout-status').textContent, /new Settings tab/);
        // Existing explicit Retry is the deliberate rebase, never a refresh.
        await h.controller.retry();
        assert.equal(h.snapshot().layout.columns, 8); assert.equal(h.writes.length, 1);
        assert.equal(h.controller.hasUncommittedWork(), false);
    });
}

test('an unrelated own mode save cannot rebase an existing numeric draft onto an external value', async () => {
    const h = harness(); h.type('8');
    const remote = h.snapshot(); remote.layout.columns = 7; h.setSnapshot(remote);
    await h.controller.select('snap');
    assert.equal(h.controller.confirmed.columns, 7); assert.equal(h.input.value, '8'); assert.equal(h.input.disabled, true);
    h.input.dispatch('change'); assert.equal(h.writes.length, 1, 'disabled field cannot submit an old blur');
    await h.controller.select('grid'); assert.equal(h.input.disabled, false); assert.equal(h.input.value, '8');
    h.input.dispatch('change'); await h.controller.queue;
    assert.equal(h.requests.at(-1).expected.layout.columns, 6);
    assert.equal(h.host.dataset.saveState, 'conflict'); assert.equal(h.snapshot().layout.columns, 7);
    assert.equal(h.writes.length, 2, 'only the two explicit placement choices were saved');
});

test('replacement invalidation keeps the raw draft and rejects late blur and input events', async () => {
    const h = harness(); h.type('8');
    const replacement = h.snapshot(); replacement.generation = 'synthetic-replacement'; replacement.layout.columns = 4;
    h.setSnapshot(replacement); await h.controller.refresh();
    assert.equal(h.controller.invalidated, true); assert.equal(h.input.disabled, true);
    assert.equal(h.input.value, '8'); assert.equal(h.host.dataset.saveState, 'reload'); assert.equal(h.guarded(), true);
    h.input.dispatch('change'); h.input.dispatch('input'); await h.controller.queue;
    assert.equal(h.writes.length, 0); assert.deepEqual(h.snapshot(), replacement);
    assert.equal(await h.window.LocalItabContentLifecycle.saveDrafts(), false);
});

test('an unobserved replacement still fails through the existing locked storage check', async () => {
    const h = harness(); h.type('8');
    const replacement = h.snapshot(); replacement.generation = 'synthetic-replacement'; h.setSnapshot(replacement);
    h.input.dispatch('change'); await h.controller.queue;
    assert.equal(h.controller.invalidated, true); assert.equal(h.input.value, '8'); assert.equal(h.writes.length, 0);
    assert.deepEqual(h.snapshot(), replacement);
});

test('failed reads can be retried without resetting or writing a numeric draft', async () => {
    const h = harness(), gate = deferred(), read = h.storage.getLayoutSnapshotForUpdate;
    h.storage.getLayoutSnapshotForUpdate = () => gate.promise;
    const refreshing = h.controller.refresh(); h.type(''); gate.reject(new Error('synthetic read failure')); await refreshing;
    assert.equal(h.host.dataset.saveState, 'error'); assert.equal(h.input.value, '');
    h.storage.getLayoutSnapshotForUpdate = read; await h.controller.retry();
    assert.equal(h.host.dataset.saveState, ''); assert.equal(h.input.value, '');
    assert.equal(h.guarded(), true); assert.equal(h.writes.length, 0);
});

test('retrying an older failed save never clears newer, unsubmitted typing', async () => {
    const h = harness(), apply = h.storage.applyLayoutPatch;
    h.storage.applyLayoutPatch = async () => { throw new Error('synthetic write failure'); };
    h.type('8'); h.input.dispatch('change'); await h.controller.queue; h.type('9');
    h.storage.applyLayoutPatch = apply; await h.controller.retry();
    assert.equal(h.snapshot().layout.columns, 8); assert.equal(h.input.value, '9'); assert.equal(h.guarded(), true);
    h.input.dispatch('change'); await h.controller.queue;
    assert.equal(h.snapshot().layout.columns, 9); assert.equal(h.input.value, '9'); assert.equal(h.guarded(), false);
});

test('deliberate invalid change keeps the existing validation reset; normalization clears only the submitted draft', async () => {
    const h = harness(); h.type(''); h.input.dispatch('change'); await h.controller.queue;
    assert.equal(h.input.value, '6'); assert.equal(h.guarded(), false); assert.equal(h.writes.length, 0);
    h.type('08'); h.input.dispatch('change'); await h.controller.queue;
    assert.equal(h.input.value, '8'); assert.equal(h.snapshot().layout.columns, 8); assert.equal(h.guarded(), false);
});
