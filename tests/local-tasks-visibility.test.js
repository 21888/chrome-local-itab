const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');
const tasks = require('../shared/local-tasks-store.js');
const { Controller } = require('../shared/local-tasks-controller.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { await tick(); await tick(); await tick(); }
function model(options = {}) {
    let raw, queue = Promise.resolve(); const listeners = new Set();
    const b = { fail: false, delay: null, failRead: options.failRead,
        lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() { if (b.failRead) throw new Error("Storage unavailable"); return raw && structuredClone(raw); },
        async write(value) { if (b.delay) await b.delay; if (b.fail) return false; raw = structuredClone(value); listeners.forEach(fn => fn()); },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, raw: () => raw
    };
    const store = new tasks.Store(b), controller = new Controller(store);
    const document = createDocument(), host = document.createElement('article'), search = document.createElement('input');
    document.body.append(search, host); search.focus();
    const api = { ...tasks, Controller }, window = { LocalItabTasks: api };
    const context = vm.createContext({ window, document, crypto: webcrypto, setTimeout, URL, Blob, console });
    const dialogPath = path.resolve(__dirname, '../shared/dialog-focus.js');
    vm.runInContext(fs.readFileSync(fs.existsSync(dialogPath) ? dialogPath : path.resolve(__dirname, '../source-model/shared/dialog-focus.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../shared/local-tasks-view.js'), 'utf8'), context);
    const view = api.mount(host, { controller, alwaysVisible: options.alwaysVisible ?? true, onVisibility: options.onVisibility });
    return { b, store, controller, document, host, search, api, view };
}
const setInput = (input, value) => { input.value = value; input.dispatch('input'); };
const presets = require('../shared/workspace-presets.js');
async function enabledModel() {
    const visibility = [], h = model({ alwaysVisible: false, onVisibility: v => visibility.push(v) });
    h.visibility = visibility;
    h.remote = new tasks.Store(h.b);
    await settle(); await h.remote.mutate(h.remote.request('enable', { enabled: true })); await settle();
    assert.equal(h.host.hidden, false);
    return h;
}
async function remoteEnable(h, enabled) { await h.remote.mutate(h.remote.request('enable', { enabled })); await settle(); }
async function presetDisable(h) {
    const store = new presets.Store({ lock: fn => h.b.lock(fn), read: async () => ({ [tasks.KEY]: await h.b.read() }), write: async values => { assert.deepEqual(Object.keys(values), [tasks.KEY]); await h.b.write(values[tasks.KEY]); } });
    await store.apply(await store.prepare('clarity')); await settle();
}
for (const [name, disable] of [['remote setting', h => remoteEnable(h, false)], ['workspace clarity preset', presetDisable]]) {
    for (const draft of ['', 'unsaved Add draft']) {
        test(`${name}: ${draft ? 'dirty card stays accessible' : 'clean card hides'}; reenable preserves exact input`, async () => {
            const h = await enabledModel(); setInput(h.view.input, draft);
            await disable(h);
            assert.equal(h.controller.state.enabled, false); assert.equal(h.b.raw().enabled, false);
            assert.equal(h.host.hidden, !draft); assert.equal(h.visibility.at(-1), !!draft);
            assert.equal(h.view.input.value, draft); assert.equal(h.view.hasUncommittedWork(), !!draft);
            assert.equal(h.controller.state.records.length, 0);
            await remoteEnable(h, true);
            assert.equal(h.host.hidden, false); assert.equal(h.view.input.value, draft);
            h.view.destroy();
        });
    }
}
for (const [source, disable] of [['remote setting', h => remoteEnable(h, false)], ['workspace clarity preset', presetDisable]]) for (const outcome of ['success', 'failure', 'newer draft']) {
    test(`pending add + ${source} disable: ${outcome}`, async () => {
        const h = await enabledModel(), gate = deferred(), mutate = h.store.mutate.bind(h.store);
        // Pause this owner's add before lock acquisition, so another page can legitimately commit first.
        h.store.mutate = async command => { await gate.promise; return mutate(command); };
        setInput(h.view.input, 'submitted Add'); h.view.add();
        if (outcome === 'newer draft') setInput(h.view.input, 'newer unsaved Add');
        assert(h.controller.pending); await disable(h);
        assert.equal(h.host.hidden, false); assert.equal(h.visibility.at(-1), true); assert.equal(h.view.hasUncommittedWork(), true);
        h.b.fail = outcome === 'failure'; gate.resolve(); await settle();
        assert.equal(h.controller.pending, null); assert.equal(h.host.hidden, outcome === 'success'); assert.equal(h.visibility.at(-1), outcome !== 'success'); assert.equal(h.b.raw().enabled, false);
        if (outcome === 'failure') {
            assert.equal(h.controller.error.code, 'WRITE'); assert.equal(h.view.input.value, 'submitted Add');
            assert.equal(h.view.retry.hidden, false, 'Retry stays reachable'); assert.equal(h.view.hasUncommittedWork(), true);
            h.b.fail = false; await remoteEnable(h, true);
            assert.equal(h.host.hidden, false); assert.equal(h.view.input.value, 'submitted Add');
            await h.view.retryLast(); await settle();
            assert.equal(h.view.input.value, ''); assert.equal(h.b.raw().records.length, 1);
        } else {
            assert.equal(h.b.raw().records.length, 1); assert.equal(h.b.raw().records[0].text, 'submitted Add');
            assert.equal(h.view.input.value, outcome === 'newer draft' ? 'newer unsaved Add' : '');
            assert.equal(h.view.hasUncommittedWork(), outcome === 'newer draft');
            await remoteEnable(h, true); assert.equal(h.host.hidden, false);
            assert.equal(h.view.input.value, outcome === 'newer draft' ? 'newer unsaved Add' : '');
        }
        h.view.destroy();
    });
}
test('failed add first, preset disables later: text and owned retry stay accessible', async () => {
    const h = await enabledModel(); setInput(h.view.input, 'failed Add'); h.b.fail = true;
    h.view.add(); await settle(); const retry = h.controller.retryCommand;
    h.b.fail = false; await presetDisable(h);
    assert.equal(h.host.hidden, false); assert.equal(h.visibility.at(-1), true); assert.equal(h.view.retry.hidden, false); assert.equal(h.view.input.value, 'failed Add');
    assert.equal(h.controller.retryCommand, retry); assert.equal(h.view.hasUncommittedWork(), true);
    await remoteEnable(h, true); await h.view.retryLast(); await settle();
    assert.equal(h.b.raw().records.length, 1); assert.equal(h.view.input.value, ''); h.view.destroy();
});

test('clearing a dirty Add hides immediately without a settings write; filter text alone does not retain visibility', async () => {
    const h = await enabledModel(); setInput(h.view.input, 'unsaved draft'); setInput(h.view.filterInput, 'filter stays');
    await presetDisable(h); const disabled = structuredClone(h.b.raw());
    assert.equal(h.host.hidden, false); setInput(h.view.input, '');
    assert.equal(h.host.hidden, true); assert.equal(h.visibility.at(-1), false);
    assert.equal(h.view.filterInput.value, 'filter stays'); assert.equal(h.view.hasUncommittedWork(), false);
    await settle(); assert.deepEqual(h.b.raw(), disabled); h.view.destroy();
});

test('clearing text during an owned pending Add keeps access until completion, then hides', async () => {
    const h = await enabledModel(), gate = deferred(), mutate = h.store.mutate.bind(h.store);
    h.store.mutate = async command => { await gate.promise; return mutate(command); };
    setInput(h.view.input, 'submitted'); h.view.add(); await remoteEnable(h, false);
    setInput(h.view.input, ''); assert.equal(h.host.hidden, false); assert.equal(h.visibility.at(-1), true);
    gate.resolve(); await settle(); assert.equal(h.host.hidden, true); assert.equal(h.visibility.at(-1), false);
    assert.equal(h.b.raw().enabled, false); assert.equal(h.b.raw().records.length, 1); h.view.destroy();
});

test('failed Add retry remains reachable while disabled, then hides after exact save without reenabling', async () => {
    const h = await enabledModel(); setInput(h.view.input, 'retry this draft'); h.b.fail = true;
    h.view.add(); await settle(); const command = h.controller.retryCommand;
    h.b.fail = false; await presetDisable(h);
    assert.equal(h.host.hidden, false); assert.equal(h.view.retry.hidden, false);
    assert.equal(h.controller.retryCommand, command); await h.view.retryLast(); await settle();
    assert.equal(h.host.hidden, true); assert.equal(h.visibility.at(-1), false); assert.equal(h.view.input.value, '');
    assert.equal(h.b.raw().enabled, false); assert.equal(h.b.raw().records.length, 1);
    assert.equal(h.b.raw().records[0].id, command.operationId); h.view.destroy();
});

test('explicitly clearing failed Add text allows hiding without altering existing retry semantics', async () => {
    const h = await enabledModel(); setInput(h.view.input, 'failed'); h.b.fail = true;
    h.view.add(); await settle(); const command = h.controller.retryCommand;
    h.b.fail = false; await remoteEnable(h, false); const disabled = structuredClone(h.b.raw());
    setInput(h.view.input, ''); assert.equal(h.host.hidden, true); assert.equal(h.visibility.at(-1), false);
    assert.equal(h.controller.retryCommand, command); assert.deepEqual(h.b.raw(), disabled); h.view.destroy();
});

test('always-visible mounting reports actual visible state even when persisted preference is disabled', async () => {
    const visibility = [], h = model({ alwaysVisible: true, onVisibility: value => visibility.push(value) });
    await settle(); assert.equal(h.controller.state.enabled, false);
    assert.equal(h.host.hidden, false); assert.equal(visibility.at(-1), true); h.view.destroy();
});

test('a pending command not owned by quick entry does not keep a clean disabled card visible', async () => {
    const h = await enabledModel(), gate = deferred(), mutate = h.store.mutate.bind(h.store);
    await remoteEnable(h, false); h.store.mutate = async command => { await gate.promise; return mutate(command); };
    const pending = h.controller.action('add', { text: 'another caller' });
    assert.equal(h.host.hidden, true); assert.equal(h.visibility.at(-1), false);
    gate.resolve(); await pending; await settle(); assert.equal(h.host.hidden, true); assert.equal(h.b.raw().enabled, false); h.view.destroy();
});
