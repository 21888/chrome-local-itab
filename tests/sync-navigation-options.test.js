'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const Storage = require('../storage');
const Workspaces = require('../shared/workspaces');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const read = file => fs.readFileSync(file, 'utf8');
const clone = value => value === undefined ? undefined : structuredClone(value);
const turn = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate, message) {
    const deadline = Date.now() + 2000;
    while (!predicate() && Date.now() < deadline) await turn();
    assert(predicate(), message);
}

// Real StorageManager, Manager/Session, Settings events, lifecycle and workspace
// view. Only storage areas, named FIFO locks and DOM are local RAM models. No
// production async method is replaced except the explicitly labelled UI-contract
// test at the end. The provider emits no automatic Sync notifications.
async function harness(t, { enabled = true } = {}) {
    const cryptoBefore = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    const raw = new Storage().cloneDefaultConfig(), remote = {};
    raw.links = []; raw.categories = []; raw.hot = { tab: 'baidu', baidu: [], weibo: [], zhihu: [] }; raw.sync.enabled = enabled;
    const listeners = new Set(), queues = new Map(), activeLocks = new Set(), calls = [], errors = [], tasks = new Set(), gates = [];
    const hooks = { remoteGet: null, remoteSet: null, localGet: null };
    const locks = { request(name, options, callback) {
        const next = (queues.get(name) || Promise.resolve()).catch(() => {}).then(async () => {
            activeLocks.add(name);
            try { return await (callback || options)(); } finally { activeLocks.delete(name); }
        });
        queues.set(name, next.catch(() => {})); return next;
    } };
    const pick = (data, keys) => keys == null ? clone(data) : Object.fromEntries((typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys)).filter(key => Object.hasOwn(data, key)).map(key => [key, clone(data[key])]));
    const area = (data, type) => ({
        QUOTA_BYTES: type === 'local' ? 10485760 : 102400, QUOTA_BYTES_PER_ITEM: 8192,
        async get(keys) { calls.push({ type, method: 'get', keys: clone(keys) }); await hooks[type === 'local' ? 'localGet' : 'remoteGet']?.(keys); return pick(data, keys); },
        async set(values) {
            calls.push({ type, method: 'set', keys: Object.keys(values) });
            if (type === 'sync') await hooks.remoteSet?.(values);
            const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { oldValue: clone(data[key]), newValue: clone(value) }]));
            Object.assign(data, clone(values)); if (type === 'local') for (const fn of listeners) fn(changes, type);
        },
        async remove(keys) { calls.push({ type, method: 'remove' }); for (const key of typeof keys === 'string' ? [keys] : keys) delete data[key]; },
        async getBytesInUse() { return JSON.stringify(data).length; }
    });
    const chrome = { storage: { local: area(raw, 'local'), sync: area(remote, 'sync'), onChanged: { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); } } } };
    let sequence = 0;
    const manager = Workspaces.createManager({ chrome, locks, now: () => '2026-10-17T00:00:00.000Z', id: () => `synthetic-${++sequence}` });
    const session = manager.capture('default'), storage = new Storage({ workspace: session });
    await session.ready(); const target = await manager.create('Synthetic Work'), config = await storage.getAll();
    const document = createDocument({ aggregateTextContent: true });
    document.body.prepend = (...nodes) => document.body.append(...nodes);
    const create = document.createElement.bind(document);
    document.createElement = tag => {
        const element = create(tag), add = element.addEventListener.bind(element);
        element.removeAttribute = name => { delete element.attributes[name]; };
        element.addEventListener = (type, fn) => add(type, event => {
            const task = fn(event);
            if (task?.then) { tasks.add(task); task.then(() => tasks.delete(task), error => { tasks.delete(task); errors.push(error); }); }
            return task;
        });
        return element;
    };
    const inputs = ['hour12-format', 'show-seconds', 'show-clock', 'show-search', 'show-shortcuts', 'show-weather', 'show-hot', 'show-movie', 'show-shortcut-titles', 'finder-shortcut-enabled', 'quote-text', 'search-engine', 'search-custom', 'privacy-online-favicons', 'weather-city', 'weather-temp', 'weather-condition', 'weather-aqi-label', 'weather-aqi', 'weather-low', 'weather-high', 'hot-topics-tab', 'movie-title', 'movie-note', 'bg-type', 'bg-color', 'bg-color-text', 'bg-image-upload', 'shortcuts-gap-x', 'shortcuts-gap-y', 'shortcut-icon-size', 'shortcut-title-size', 'import-settings', 'movie-poster-upload', 'cloud-sync-enabled'];
    const divs = ['category-manage-list', 'baidu-list', 'weibo-list', 'zhihu-list', 'options-layout', 'movie-poster-preview', 'cloud-sync-status', 'toast-container'];
    for (const [tag, ids] of [['input', inputs], ['div', divs], ['button', ['add-category', 'sync-upload-now', 'sync-download-now', 'sync-clear-cloud', 'sync-replace-local']]]) for (const id of ids) { const el = document.createElement(tag); el.id = id; document.body.append(el); }
    const events = {}, timers = new Map(), navigation = [], confirmations = [];
    const state = { confirm: true, reloads: 0 };
    const window = { document, chrome, storageManager: storage, addEventListener(type, fn) { events[type] = fn; },
        location: { href: 'chrome-extension://synthetic/options.html?workspace=default', hash: '', reload() { state.reloads++; } },
        confirm(message) { confirmations.push(message); return state.confirm; } };
    let timerId = 0;
    const context = vm.createContext({ window, document, chrome, storageManager: storage, navigator: { locks }, crypto: webcrypto, URL, TextEncoder, Blob,
        console: { log() {}, warn() {}, error(...args) { errors.push(...args.filter(value => value?.message)); } },
        Image: class { async decode() {} }, confirm: window.confirm,
        setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; }, clearTimeout(id) { timers.delete(id); },
        fetch() { assert.fail('No network is permitted'); } });
    for (const file of ['shared/layout.js', 'options.js']) vm.runInContext(read(file), context);
    await context.populateFormFields(config); context.setupCategoryManagement(config.categories);
    await context.populateSyncControls(config.sync); context.setupEventListeners();
    for (const file of ['shared/local-content-lifecycle.js', 'shared/dialog-focus.js', 'shared/workspaces-view.js']) vm.runInNewContext(read(file), { window, document, setTimeout, URL, Blob });
    const switcher = document.createElement('section'), managerHost = document.createElement('section'); document.body.append(switcher, managerHost);
    const lifecycle = window.LocalItabContentLifecycle;
    window.workspacesView = window.LocalItabWorkspacesView.mount({ switcher, managerHost, manager, session, lifecycle, navigate(id) { navigation.push(id); } });
    await window.workspacesView.ready;
    assert.equal(window.settingsFormView.hasUncommittedWork(), false, 'the real form baseline starts clean');
    assert.equal(lifecycle.pending(), false); assert.equal(session._pending.size, 0); assert.equal(storage._syncInitialized, true);
    t.after(async () => {
        hooks.remoteGet = hooks.remoteSet = hooks.localGet = null; for (const gate of gates) gate.resolve();
        await Promise.allSettled([...tasks]); window.workspacesView.destroy(); storage.cancelSyncPush(); manager.destroy?.();
        if (cryptoBefore) Object.defineProperty(globalThis, 'crypto', cryptoBefore); else delete globalThis.crypto;
    });
    const get = id => document.getElementById(id);
    return { context, window, document, storage, manager, session, target, get, events, lifecycle, calls, errors, hooks, activeLocks, navigation, state, timers, confirmations,
        gate() { const gate = deferred(); gates.push(gate); return gate; },
        act(action) {
            const id = { enable: 'cloud-sync-enabled', disable: 'cloud-sync-enabled', upload: 'sync-upload-now', download: 'sync-download-now', clear: 'sync-clear-cloud', replace: 'sync-replace-local' }[action];
            if (['enable', 'disable'].includes(action)) get(id).checked = action === 'enable';
            assert.equal(Boolean(get(id).disabled), false, `${action} retains its existing availability`);
            const before = new Set(tasks); get(id).dispatch(['enable', 'disable'].includes(action) ? 'change' : 'click');
            return [...tasks].find(task => !before.has(task));
        },
        open() { const button = managerHost.querySelector(`[data-workspace-id="${target.id}"][data-workspace-action="open"]`); assert(button && !button.disabled); button.dispatch('click'); },
        async publishReplacement() {
            const payload = storage.prepareSyncPayload(storage.validateConfigObject(config)).payload; payload.quote = 'Synthetic cloud quote';
            const chunks = storage.createSyncChunks(JSON.stringify(payload));
            Object.assign(remote, { [storage.syncMetaKey]: { enabled: true, version: 2, updatedAt: '2026-10-17T00:00:00.000Z', chunkCount: chunks.length } });
            chunks.forEach((chunk, index) => { remote[`${storage.syncChunkPrefix}${index}`] = chunk; });
            await storage.blockSync(storage.compatibilityError('Synthetic explicit review', 'review')); await context.renderSyncStatus();
        },
        async settled() { await Promise.allSettled([...tasks]); },
        warning() { const event = { prevented: false, preventDefault() { this.prevented = true; } }; events.beforeunload(event); return event.prevented; }
    };
}

for (const action of ['enable', 'disable', 'upload', 'download', 'clear', 'replace']) test(`${action}: real action registers before its first remote await and workspace Open waits without suspending the source`, async t => {
    const h = await harness(t, { enabled: action !== 'enable' }); if (action === 'replace') await h.publishReplacement();
    const gate = h.gate(); let entered = false;
    h.hooks.remoteGet = async () => { if (!entered) { entered = true; await gate.promise; } };
    const actionTask = h.act(action); await until(() => entered, 'the real store reached the remote read');
    assert.equal(h.session._pending.size, 0, 'the gate reproduces the gap outside Session writes');
    if (action === 'upload') assert(h.activeLocks.has('local-itab-sync-write'));
    assert.equal(h.window.settingsFormView.pending, true, 'Settings owns the complete manual action');
    assert.equal(h.window.settingsFormView.hasUncommittedWork(), true);
    assert.equal(h.lifecycle.pending(), true); assert.equal(h.warning(), true);
    assert.equal(h.lifecycle.reload(), false); assert.equal(h.state.reloads, 0);
    h.get('local-content-reload-notice').querySelector('button').dispatch('click');
    assert.equal(h.state.reloads, 0); assert.equal(h.confirmations.length, 0, 'pending actions cannot be discarded by Reload');
    h.open(); await new Promise(resolve => setTimeout(resolve, 50));
    assert.deepEqual(h.navigation, []); assert.equal(Boolean(h.session._suspended), false);
    assert.equal((await h.manager.registry()).lastUsedId, 'default');
    gate.resolve(); await actionTask; await until(() => h.navigation.length > 0, 'workspace opens after the full event settles');
    assert.deepEqual(h.navigation, [h.target.id]); assert.equal(h.window.settingsFormView.pending, false);
    assert.equal(h.errors.some(error => error.code === 'WORKSPACE_SWITCH_PENDING'), false);
});

for (const action of ['clear', 'disable', 'replace']) test(`${action}: declining the existing confirmation releases pending without provider writes`, async t => {
    const h = await harness(t); await h.publishReplacement(); h.state.confirm = false;
    const gate = h.gate(); let entered = false;
    h.hooks.remoteGet = async () => { if (!entered) { entered = true; await gate.promise; } };
    const before = h.calls.length, task = h.act(action); await until(() => entered, 'confirmation preflight is held');
    assert.equal(h.lifecycle.pending(), true); gate.resolve(); await task;
    assert.equal(h.confirmations.length, 1); assert.equal(h.lifecycle.pending(), false); assert.equal(h.warning(), false);
    assert.equal(h.calls.slice(before).filter(call => call.type === 'sync' && call.method !== 'get').length, 0);
    assert.equal(h.state.reloads, 0); assert.equal(h.window.settingsFormView.hasUncommittedWork(), false);
});

for (const action of ['clear', 'replace']) test(`${action}: rejected initial preflight releases its lifecycle count without adding a retry`, async t => {
    const h = await harness(t); if (action === 'replace') await h.publishReplacement();
    const gate = h.gate(); let reads = 0;
    h.hooks.remoteGet = async () => { if (++reads === 1) { await gate.promise; throw new Error('Synthetic initial preflight unavailable'); } };
    const task = h.act(action); task.catch(() => {}); await until(() => reads === 1, 'initial preflight is held');
    assert.equal(h.lifecycle.pending(), true); gate.resolve();
    if (action === 'clear') await assert.rejects(task, /Synthetic initial preflight unavailable/); else await task;
    assert.equal(h.lifecycle.pending(), false); assert.equal(h.warning(), false); assert.equal(h.state.reloads, 0);
    assert.equal(h.confirmations.length, 0); assert.equal(reads, action === 'clear' ? 1 : 2, 'only the existing replacement error status read follows');
});

test('upload failure stays pending through the real catch status read and then releases', async t => {
    const h = await harness(t), gate = h.gate(); let reads = 0;
    h.hooks.remoteGet = async () => { if (++reads === 1) throw new Error('Synthetic metadata read failed'); if (reads === 2) await gate.promise; };
    const task = h.act('upload'); await until(() => reads === 2, 'catch is waiting for status');
    assert.equal(h.lifecycle.pending(), true); assert.equal(h.warning(), true); gate.resolve(); await task;
    assert.equal(h.lifecycle.pending(), false); assert.equal(h.warning(), false);
    assert(h.errors.some(error => error.message === 'Synthetic metadata read failed'));
});

for (const fail of [false, true]) test(`toggle remains pending through its final real status read, including rejection: ${fail}`, async t => {
    const h = await harness(t, { enabled: false }), gate = h.gate(); let afterSuccessReads = 0;
    h.hooks.remoteGet = async () => {
        if (h.get('toast-container').textContent.includes('Chrome 同步已启用')) {
            afterSuccessReads++; await gate.promise; if (fail) throw new Error('Synthetic final status unavailable');
        }
    };
    const task = h.act('enable'); if (fail) task.catch(() => {});
    await until(() => afterSuccessReads === 1, 'finally is waiting for the last status read');
    assert.equal(h.lifecycle.pending(), true); assert.equal(h.warning(), true); gate.resolve();
    if (fail) await assert.rejects(task, /Synthetic final status unavailable/); else await task;
    assert.equal(h.lifecycle.pending(), false); assert.equal(h.warning(), false);
});

test('overlapping manual actions release their own count without treating the remaining read as clean', async t => {
    const h = await harness(t), first = h.gate(), second = h.gate(); let reads = 0;
    h.hooks.remoteGet = async () => { const call = ++reads; if (call === 1) await first.promise; if (call === 2) await second.promise; };
    const download = h.act('download'); await until(() => reads === 1, 'first action is held');
    const clear = h.act('clear'); await until(() => reads === 2, 'second action is held');
    first.resolve(); await download;
    assert.equal(h.lifecycle.pending(), true); assert.equal(h.warning(), true); assert.equal(h.lifecycle.reload(), false);
    h.state.confirm = false; second.resolve(); await clear;
    assert.equal(h.lifecycle.pending(), false); assert.equal(h.warning(), false); assert.equal(h.lifecycle.reload(), true);
});

for (const draft of [false, true]) test(`real explicit replacement reloads only after its own pending is released and preserves another draft: ${draft}`, async t => {
    const h = await harness(t); await h.publishReplacement();
    if (draft) h.window.localScratchpadSettingsView = { hasUncommittedWork: () => true, controller: { pending: false } };
    await h.act('replace');
    assert.equal(h.lifecycle.pending(), false); assert.equal(h.window.settingsFormView.hasUncommittedWork(), false);
    assert.equal((await h.session.local.get(['quote'])).quote, 'Synthetic cloud quote');
    assert.equal(h.state.reloads, draft ? 0 : 1);
    assert.equal(Boolean(h.get('local-content-reload-notice')), draft);
    assert.equal(h.confirmations.length, 1);
});

for (const draft of [false, true]) test(`Download applied-result UI contract schedules a non-self-blocking reload and protects another draft: ${draft}`, async t => {
    const h = await harness(t), gate = h.gate();
    // Ordinary production pull currently acknowledges equal data or asks for
    // explicit replacement. This return injection tests only the existing UI
    // applied-result branch, not a reachable real-store apply or cloud outcome.
    h.storage.pullFromSync = async () => { await gate.promise; return { applied: true }; };
    if (draft) h.get('quote-text').value = 'Synthetic unsaved form quote';
    const task = h.act('download'); assert.equal(h.lifecycle.pending(), true); gate.resolve(); await task;
    assert.equal(h.lifecycle.pending(), false);
    const reloads = [...h.timers.values()].filter(timer => timer.delay === 800); assert.equal(reloads.length, 1); reloads[0].fn();
    assert.equal(h.state.reloads, draft ? 0 : 1); assert.equal(Boolean(h.get('local-content-reload-notice')), draft);
});
