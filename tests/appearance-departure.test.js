'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const StorageManager = require('../storage');
const {fixture, Workspaces, copy} = require('./helpers/complete-backup-acceptance');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// Actual Appearance mount/Controller, Work Session, StorageManager and lifecycle.
// Only DOM events, Chrome storage and Web Locks are modeled. These assertions
// check the warning request, not whether a native browser displays a prompt.
async function page() {
    const f = fixture(); delete f.raw.__auth;
    f.raw.sync = {enabled: false}; f.raw.privacy = {onlineFavicons: false};
    f.values('work').appearance = {template: 'studio', colorMode: 'light'};
    const calls = {reads: 0, sets: 0, removes: 0, provider: 0, navigation: 0, confirm: 0};
    const changed = new Set(), events = new Map(), gates = [];
    f.chrome.storage.onChanged = {addListener: fn => changed.add(fn), removeListener: fn => changed.delete(fn)};
    const get = f.chrome.storage.local.get, set = f.chrome.storage.local.set;
    f.chrome.storage.local.get = keys => { calls.reads++; return get(keys); };
    f.chrome.storage.local.set = async values => {
        calls.sets++; const before = copy(f.raw); await set(values);
        const changes = Object.fromEntries(Object.keys(values).map(key => [key, {oldValue: before[key], newValue: copy(f.raw[key])}]));
        for (const listener of [...changed]) listener(changes, 'local');
    };
    f.chrome.storage.local.remove = async () => { calls.removes++; throw Error('Unexpected removal'); };
    f.chrome.storage.sync = Object.fromEntries(['get', 'set', 'remove'].map(name => [name, async () => { calls.provider++; throw Error('Unexpected provider operation'); }]));
    const manager = new Workspaces.Manager({chrome: f.chrome, locks: f.locks});
    const storage = new StorageManager({workspace: manager.capture('work')});
    const config = await storage.getAll(), document = createDocument();
    assert.equal(storage.workspace.id, 'work'); assert.equal(calls.sets, 0);
    const host = document.createElement('section'); host.id = 'options-appearance'; document.body.append(host);
    const window = {document, storageManager: storage,
        addEventListener(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
        location: {reload() { calls.navigation++; }}, confirm() { calls.confirm++; return false; }};
    const context = vm.createContext({window, document, console, setTimeout, clearTimeout});
    for (const file of ['shared/dashboard-template-registry.js', 'shared/appearance.js', 'shared/local-content-lifecycle.js']) vm.runInContext(source(file), context);
    const controller = window.appearanceController = window.LocalItabAppearance.mount(host, {
        storage, initial: config.appearance, baseline: config._settingsBaseline, previewEnabled: true
    });
    const lifecycle = window.LocalItabContentLifecycle;
    function dispatch(type, event) { for (const fn of events.get(type) || []) fn(event); }
    function departure(stage) {
        const before = copy(f.raw), counts = {...calls}, event = {prevented: 0, preventDefault() { this.prevented++; }};
        dispatch('beforeunload', event);
        assert.deepEqual(f.raw, before, `${stage}: warning event never changes storage`);
        assert.deepEqual(calls, counts, `${stage}: warning event performs no reads, writes, providers, navigation or confirmation`);
        return {stage, prevented: event.prevented, returnValueSet: Object.hasOwn(event, 'returnValue'), returnValue: event.returnValue};
    }
    function pauseWrite({fail = false} = {}) {
        const entered = deferred(), release = deferred(); gates.push(release);
        f.hooks.set = async (values, raw) => {
            entered.resolve(); await release.promise;
            if (fail) throw Error('Synthetic rejected appearance write');
            Object.assign(raw, copy(values));
        };
        return {entered: entered.promise, release: release.resolve};
    }
    function select(field, value) {
        const control = host.querySelector(`[data-appearance-field="${field}"]`);
        assert(!control.disabled); control.value = value; control.dispatch('change'); return controller.queue;
    }
    async function close() { for (const gate of gates) gate.resolve(); await controller.queue; storage.cancelSyncPush(); }
    return {f, calls, storage, document, host, controller, lifecycle, departure, pauseWrite, select, dispatch, close};
}
function expectsWarning(row, expected) {
    assert.equal(row.prevented, expected ? 1 : 0, `${row.stage}: beforeunload warning request`);
    assert.equal(row.returnValueSet, expected, `${row.stage}: returnValue presence`);
    if (expected) assert.equal(row.returnValue, '');
}
function noExternal(p) { assert.equal(p.calls.removes, 0); assert.equal(p.calls.provider, 0); assert.equal(p.calls.navigation, 0); assert.equal(p.calls.confirm, 0); }

test('appearance queued and real Chrome write pending request warning; successful settlement is clean', {timeout: 5000}, async t => {
    const p = await page(); t.after(p.close); const before = copy(p.f.raw);
    expectsWarning(p.departure('clean'), false);
    const gate = p.pauseWrite(), operation = p.select('colorMode', 'dark');
    assert.equal(p.controller.pending, 1); assert.equal(p.lifecycle.pending(), true);
    const queued = p.departure('queued before write'); assert.equal(p.calls.sets, 0);
    await gate.entered;
    assert.equal(p.controller.pending, 1); assert.equal(p.lifecycle.hasUncommittedWork(), true);
    assert.deepEqual(p.f.raw, before); assert.equal(p.calls.sets, 1);
    const writing = p.departure('actual Chrome write pending');
    gate.release(); assert.equal(await operation, true);
    assert.equal(p.controller.pending, 0); assert.deepEqual(Object.keys(p.controller.patch), []);
    assert.equal(p.f.values('work').appearance.colorMode, 'dark');
    assert.equal(p.lifecycle.hasUncommittedWork(), false); expectsWarning(p.departure('settled'), false);
    assert.deepEqual(Object.keys(p.f.writes[0]), [Workspaces.bundleKey(p.storage.workspace)]);
    for (const key of Object.keys(before)) if (key !== Workspaces.bundleKey(p.storage.workspace)) assert.deepEqual(p.f.raw[key], before[key]);
    assert.equal(p.calls.sets, 1); noExternal(p);
    t.diagnostic(JSON.stringify({queued, writing, writes: p.calls.sets, provider: p.calls.provider}));
    expectsWarning(queued, true); expectsWarning(writing, true);
});

test('explicit allowDeparture bypasses pending appearance; cancelDeparture restores warning', {timeout: 5000}, async t => {
    const p = await page(); t.after(p.close); const gate = p.pauseWrite(), operation = p.select('colorMode', 'dark');
    await gate.entered;
    const normal = p.departure('pending before allowance');
    p.lifecycle.allowDeparture(); assert.equal(p.lifecycle.departing, true);
    expectsWarning(p.departure('explicitly allowed pending departure'), false);
    p.lifecycle.cancelDeparture(); assert.equal(p.lifecycle.departing, false);
    const restored = p.departure('pending after cancelDeparture');
    gate.release(); assert.equal(await operation, true); expectsWarning(p.departure('settled after cancelDeparture'), false);
    noExternal(p); expectsWarning(normal, true); expectsWarning(restored, true);
});

test('rejected appearance write clears its patch and restores confirmed controls without warning', {timeout: 5000}, async t => {
    const p = await page(); t.after(p.close); const before = copy(p.f.raw), gate = p.pauseWrite({fail: true});
    const operation = p.select('colorMode', 'dark'); await gate.entered; gate.release();
    assert.equal(await operation, false); assert.equal(p.controller.pending, 0);
    assert.deepEqual(Object.keys(p.controller.patch), []); assert(p.controller.saveError);
    assert.equal(p.controller.confirmed.colorMode, 'light');
    assert.equal(p.host.querySelector('[data-appearance-field="colorMode"]').value, 'light');
    assert.equal(p.document.documentElement.dataset.colorMode, 'light');
    assert.equal(p.host.dataset.saveState, 'error'); assert.deepEqual(p.f.raw, before);
    // saveError remains relevant to explicit reload/save workflows; it alone is
    // not an unsaved appearance patch requiring the native departure warning.
    expectsWarning(p.departure('failed write with discarded patch'), false);
    assert.equal(p.calls.sets, 1); noExternal(p);
});

test('temporary template preview and its pagehide discard remain read-only and do not request warning', {timeout: 5000}, async t => {
    const p = await page(); t.after(p.close); const before = copy(p.f.raw);
    assert.equal(await p.controller.previewTemplate('folio'), true);
    assert.equal(p.controller.pending, 0); assert.equal(p.controller.preview.template, 'folio');
    assert.equal(p.document.documentElement.dataset.dashboardTemplate, 'folio');
    expectsWarning(p.departure('pure temporary template preview'), false);
    p.dispatch('pagehide', {});
    assert.equal(p.controller.closed, true); assert.equal(p.controller.preview, null);
    assert.equal(p.document.documentElement.dataset.dashboardTemplate, 'studio');
    expectsWarning(p.departure('discarded temporary preview'), false);
    assert.deepEqual(p.f.raw, before); assert.equal(p.calls.sets, 0); noExternal(p);
});
