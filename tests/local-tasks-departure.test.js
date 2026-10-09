const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const tasks = require('../shared/local-tasks-store');
const { Controller } = require('../shared/local-tasks-controller');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { await tick(); await tick(); await tick(); }
function harness(settings = false) {
    let raw, queue = Promise.resolve(); const subscribers = new Set(), events = new Map();
    const backend = {
        delay: null, fail: false,
        lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() { return raw && structuredClone(raw); },
        async write(value) { if (backend.delay) await backend.delay; if (backend.fail) return false; raw = structuredClone(value); subscribers.forEach(fn => fn()); },
        subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); }
    };
    const store = new tasks.Store(backend), controller = new Controller(store);
    const document = createDocument(), host = document.createElement('article'); document.body.append(host);
    const api = { ...tasks, Controller };
    const window = { LocalItabTasks: api, addEventListener(type, fn) {
        if (!events.has(type)) events.set(type, []); events.get(type).push(fn);
    } };
    const context = vm.createContext({ window, document, crypto: webcrypto, setTimeout, URL, Blob, console });
    for (const file of ['dialog-focus', 'local-tasks-view', 'local-content-lifecycle']) {
        vm.runInContext(fs.readFileSync(`shared/${file}.js`, 'utf8'), context);
    }
    let view;
    if (settings) window.localTasksSettingsController = api.mountSettings(host, { controller });
    else window.localTasksView = view = api.mount(host, { controller, alwaysVisible: true });
    assert.equal(events.get('beforeunload').length, 1, 'one shared departure listener');
    return { backend, store, controller, document, host, window, view,
        guarded(expected, reason) {
            const event = { prevented: false, returnValue: undefined, preventDefault() { this.prevented = true; } };
            for (const listener of events.get('beforeunload')) listener(event);
            assert.equal(event.prevented, expected, reason);
            assert.equal(event.returnValue, expected ? '' : undefined, reason);
        },
        destroy() { if (view) view.destroy(); else controller.destroy(); }
    };
}
const input = (node, value) => { node.value = value; node.dispatch('input'); };
function click(h, label) {
    const button = h.document.querySelectorAll('button').find(node => node.textContent === label);
    assert(button, label); button.dispatch('click');
}
async function seed(h) { await h.controller.action('add', { text: 'saved task' }); await settle(); return h.controller.state.records[0]; }

test('departure: actual Tasks quick-entry ownership, pending save and newer draft', async () => {
    const h = harness(); await settle(); h.guarded(false, 'empty initial input');
    input(h.view.filterInput, 'filter only'); h.guarded(false, 'filter is not an unsaved task');
    input(h.view.input, 'unsent text'); h.guarded(true, 'unsent task');
    input(h.view.input, ''); h.guarded(false, 'cleared input');
    input(h.view.input, 'submitted'); const wait = deferred(); h.backend.delay = wait.promise;
    h.view.add(); input(h.view.input, ''); h.guarded(true, 'pending write survives empty input');
    input(h.view.input, 'newer text'); wait.resolve(); await settle();
    assert.equal(h.view.input.value, 'newer text'); h.guarded(true, 'older completion cannot release newer draft');
    h.backend.delay = null; h.view.add(); await settle();
    assert.equal(h.view.input.value, ''); h.guarded(false, 'successful add releases ownership'); h.destroy();
});

test('departure: actual Tasks edit cancel, pending dismissal, failure and success', async () => {
    const h = harness(); await settle(); const task = await seed(h); h.view.edit(task);
    h.guarded(true, 'open editor'); click(h, 'Cancel'); h.guarded(false, 'cancel releases editor');
    h.view.edit(task); input(h.document.querySelector('.tasks-editor'), 'edited task');
    const wait = deferred(); h.backend.delay = wait.promise; click(h, 'Save task');
    click(h, 'Cancel'); h.guarded(true, 'closed editor still owns pending save');
    wait.resolve(); await settle(); h.guarded(false, 'settled dismissed save'); h.backend.delay = null;
    h.view.edit(h.controller.state.records[0]); input(h.document.querySelector('.tasks-editor'), 'retry draft');
    h.backend.fail = true; click(h, 'Save task'); await settle(); h.guarded(true, 'failed edit retains draft');
    h.backend.fail = false; click(h, 'Save task'); await settle();
    assert.equal(h.controller.state.records[0].text, 'retry draft'); h.guarded(false, 'successful edit'); h.destroy();
});

test('departure: actual Tasks import loading, review cancel and replacement save', async () => {
    const h = harness(); await settle(); await seed(h); const source = await h.store.export();
    const read = deferred(); h.view.fileInput.files = [{ size: source.length, text: () => read.promise }];
    const loading = h.view.importFile(); h.guarded(true, 'pending file read');
    read.resolve(source); await loading; h.guarded(true, 'open import review');
    click(h, 'Cancel'); h.guarded(false, 'cancel import review');
    h.view.fileInput.files = [{ size: source.length, text: async () => source }];
    await h.view.importFile(); const save = deferred(); h.backend.delay = save.promise;
    click(h, 'Replace tasks'); h.guarded(true, 'pending replacement');
    save.resolve(); await settle(); h.guarded(false, 'successful import'); h.destroy();
});

test('departure: actual Tasks settings visibility write is protected only while pending', async () => {
    const h = harness(true); await settle(); h.guarded(false, 'idle settings');
    const wait = deferred(); h.backend.delay = wait.promise;
    const checkbox = h.host.querySelector('input'); checkbox.checked = true; checkbox.dispatch('change');
    h.guarded(true, 'visibility save pending'); wait.resolve(); await settle();
    assert.equal(h.controller.state.enabled, true); h.guarded(false, 'visibility committed'); h.destroy();
});

test('departure: existing settings guards stay intact and unrelated reload guards do not expand', async () => {
    const h = harness(); await settle();
    for (const name of ['localCountdownSettingsView', 'localScratchpadSettingsView', 'worldClockSettingsView']) {
        let dirty = true; h.window[name] = { hasUncommittedWork: () => dirty };
        h.guarded(true, name); dirty = false; h.guarded(false, `${name} released`); delete h.window[name];
    }
    for (const name of ['localCountdownView', 'localScratchpadView', 'localCalculatorView', 'bookmarkImportView', 'workspacePresetsView']) {
        h.window[name] = { controller: { pending: {} }, pending: {}, hasUncommittedWork: () => true };
        h.guarded(false, `${name} departure behavior unchanged`); delete h.window[name];
    }
    h.destroy(); delete h.window.localTasksView; h.guarded(false, 'page without Tasks');
});
