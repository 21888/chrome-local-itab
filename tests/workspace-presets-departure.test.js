'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const StorageManager = require('../storage');
const {fixture, Workspaces, Tasks, Focus, copy} = require('./helpers/complete-backup-acceptance');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const turn = () => new Promise(resolve => setImmediate(resolve));

// Real Preset View/Store, Session, StorageManager and lifecycle; only DOM,
// RAM Chrome storage and Web Locks are modeled. Warning requests are checked,
// not the browser's discretionary display of a native departure prompt.
async function page() {
    const f = fixture(); delete f.raw.__auth;
    f.raw.sync = {enabled: false}; f.raw.privacy = {onlineFavicons: false};
    f.values('work').appearance = {template: 'studio', colorMode: 'light'};
    f.values('work')[Tasks.KEY].enabled = false; f.values('work')[Focus.KEY].enabled = false;
    f.raw[Tasks.KEY] = {...copy(f.values('default')[Tasks.KEY]), enabled: true};
    f.raw[Focus.KEY] = {...Focus.initial(), enabled: true};
    f.raw[Workspaces.SNAPSHOT_KEY].values = {[Tasks.KEY]: copy(f.raw[Tasks.KEY]), [Focus.KEY]: copy(f.raw[Focus.KEY])};
    const calls = {reads: 0, sets: 0, removes: 0, locks: 0, provider: 0, navigation: 0, confirm: 0};
    const changed = new Set(), events = new Map(), gates = [], held = [];
    f.chrome.storage.onChanged = {addListener: fn => changed.add(fn), removeListener: fn => changed.delete(fn)};
    const get = f.chrome.storage.local.get, set = f.chrome.storage.local.set, request = f.locks.request;
    f.chrome.storage.local.get = keys => { calls.reads++; return get(keys); };
    f.chrome.storage.local.set = async values => {
        calls.sets++; const before = copy(f.raw); await set(values);
        const changes = Object.fromEntries(Object.keys(values).map(key => [key, {oldValue: before[key], newValue: copy(f.raw[key])}]));
        for (const listener of [...changed]) listener(changes, 'local');
    };
    f.locks.request = (...args) => { calls.locks++; return request(...args); };
    f.chrome.storage.local.remove = async () => { calls.removes++; throw Error('Unexpected removal'); };
    f.chrome.storage.sync = Object.fromEntries(['get', 'set', 'remove'].map(name => [name, async () => { calls.provider++; throw Error('Unexpected provider operation'); }]));
    const manager = new Workspaces.Manager({chrome: f.chrome, locks: f.locks}), session = manager.capture('work');
    const storage = new StorageManager({workspace: session}), config = await storage.getAll();
    assert.equal(session.id, 'work'); assert.equal(calls.sets, 0);
    const document = createDocument(), host = document.createElement('section'); host.id = 'workspace-presets'; document.body.append(host);
    const window = {document, chrome: f.chrome, navigator: {locks: f.locks}, storageManager: storage,
        LocalItabWorkspaces: {session}, LocalItabTasks: Tasks, LocalItabFocus: Focus,
        addEventListener(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
        removeEventListener(type, fn) { events.get(type)?.delete(fn); },
        location: {reload() { calls.navigation++; }}, confirm() { calls.confirm++; return false; }, console, setTimeout, clearTimeout};
    window.window = window; vm.createContext(window);
    for (const file of ['shared/dashboard-template-registry.js', 'shared/workspace-presets.js', 'shared/workspace-presets-view.js', 'shared/local-content-lifecycle.js']) vm.runInContext(source(file), window);
    assert.equal(vm.runInContext('window === globalThis', window), true);
    const view = window.workspacePresetsView = window.LocalItabWorkspace.mount(host, {getTemplate: () => config.appearance.template});
    const [review, apply, cancel] = host.querySelectorAll('button'), lifecycle = window.LocalItabContentLifecycle;
    function click(button) { button.focus(); button.dispatch('click'); return view.pending; }
    function departure(stage) {
        const before = copy(f.raw), counts = {...calls}, event = {prevented: 0, preventDefault() { this.prevented++; }};
        for (const fn of events.get('beforeunload') || []) fn(event);
        assert.deepEqual(f.raw, before, `${stage}: event never mutates raw storage`);
        assert.deepEqual(calls, counts, `${stage}: event performs no storage, locks, providers or navigation`);
        return {stage, applying: Boolean(view.applying), prevented: event.prevented, returnValueSet: Object.hasOwn(event, 'returnValue'), returnValue: event.returnValue};
    }
    function pauseRead() {
        const entered = deferred(), release = deferred(); gates.push(release);
        f.hooks.read = async (keys, raw) => {
            f.hooks.read = null; entered.resolve(); await release.promise;
            return copy(keys === null ? raw : Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]])));
        };
        return {entered: entered.promise, release: release.resolve};
    }
    function pauseWrite(failure = null) {
        const entered = deferred(), release = deferred(); gates.push(release);
        f.hooks.set = async (values, raw) => {
            entered.resolve(); await release.promise;
            if (failure === 'rejected') throw Error('Synthetic write rejection');
            Object.assign(raw, copy(values));
            if (failure === 'lost acknowledgement') throw Error('Synthetic lost write acknowledgement');
        };
        return {entered: entered.promise, release: release.resolve};
    }
    async function holdLock() {
        const entered = deferred(), release = deferred(); gates.push(release);
        const operation = session.withLock(async () => { entered.resolve(); await release.promise; }); held.push(operation);
        await entered.promise; return {release: release.resolve, operation};
    }
    async function ready() { await click(review); assert.equal(view.pending, null); assert.equal(view.hasUncommittedWork(), true); assert.equal(apply.disabled, false); }
    async function close() { for (const gate of gates) gate.resolve(); await Promise.all(held); if (view.pending) await view.pending; view.destroy(); storage.cancelSyncPush(); }
    return {f, calls, storage, session, host, view, lifecycle, review, apply, cancel, click, departure, pauseRead, pauseWrite, holdLock, ready, close};
}
function expectsWarning(row, expected) {
    assert.equal(row.prevented, expected ? 1 : 0, `${row.stage}: beforeunload warning request`);
    assert.equal(row.returnValueSet, expected, `${row.stage}: returnValue presence`);
    if (expected) assert.equal(row.returnValue, '');
    assert.equal(row.applying, expected, `${row.stage}: only an active Apply owns applying`);
}
function preserved(p, before, changedKey = null) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(p.f.raw)])) if (key !== changedKey) assert.deepEqual(p.f.raw[key], before[key], `preserved ${key}`);
    for (const key of ['removes', 'provider', 'navigation', 'confirm']) assert.equal(p.calls[key], 0);
}

test('read-only preset loading, ready review and Cancel do not request departure warning', {timeout: 5000}, async t => {
    const p = await page(); t.after(p.close); const before = copy(p.f.raw);
    const gate = p.pauseRead(), operation = p.click(p.review); await gate.entered;
    assert(p.view.pending); assert.equal(p.lifecycle.pending(), true);
    const reading = p.departure('preview reading'); gate.release(); await operation;
    assert.equal(p.view.hasUncommittedWork(), true); const ready = p.departure('ready review');
    p.click(p.cancel); assert.equal(p.view.hasUncommittedWork(), false); const cancelled = p.departure('Cancel ready review');
    const next = p.pauseRead(), readingAgain = p.click(p.review); await next.entered;
    p.click(p.cancel); const cancelledRead = p.departure('Cancel pending read'); next.release(); await readingAgain;
    assert.equal(p.view.hasUncommittedWork(), false); assert.equal(p.apply.disabled, true);
    assert.equal(p.calls.sets, 0); preserved(p, before);
    for (const row of [reading, ready, cancelled, cancelledRead]) expectsWarning(row, false);
});

test('explicit preset Apply is protected while waiting for its real lock and Chrome set, then releases', {timeout: 5000}, async t => {
    const p = await page(); t.after(p.close); await p.ready(); const before = copy(p.f.raw);
    const lock = await p.holdLock(), writes = p.calls.sets, locks = p.calls.locks, gate = p.pauseWrite();
    const operation = p.click(p.apply); await turn();
    assert(p.calls.locks > locks, 'Apply has requested the held Session lock'); assert.equal(p.calls.sets, writes);
    const waiting = p.departure('Apply waiting for Session lock');
    lock.release(); await lock.operation; await gate.entered;
    assert.equal(p.cancel.disabled, true); const writing = p.departure('Apply pending inside Chrome set');
    p.cancel.dispatch('click'); p.host.dispatch('keydown', {key: 'Escape'});
    assert.equal(p.view.pending, operation); const refusedCancel = p.departure('Cancel cannot retire submitted Apply');
    assert.deepEqual(p.f.raw, before); gate.release(); await operation;
    assert.equal(p.view.pending, null); assert.equal(p.view.hasUncommittedWork(), false);
    assert.match(p.host.querySelector('[role="status"]').textContent, /saved/);
    const settled = p.departure('successful Apply settled'), key = Workspaces.bundleKey(p.session);
    assert.equal(p.calls.sets, 1); assert.deepEqual(Object.keys(p.f.writes[0]), [key]);
    assert.equal(p.f.values('work')[Tasks.KEY].enabled, true); assert.equal(p.f.values('work')[Focus.KEY].enabled, true);
    preserved(p, before, key);
    t.diagnostic(JSON.stringify({waiting, writing, refusedCancel, writes: p.calls.sets, writeKeys: Object.keys(p.f.writes[0]), provider: p.calls.provider}));
    for (const row of [waiting, writing, refusedCancel]) expectsWarning(row, true); expectsWarning(settled, false);
});

for (const failure of ['rejected', 'lost acknowledgement']) test(`${failure}: preset Apply warning ends when the failed attempt settles`, {timeout: 5000}, async t => {
    const p = await page(); t.after(p.close); await p.ready(); const before = copy(p.f.raw), gate = p.pauseWrite(failure);
    const operation = p.click(p.apply); await gate.entered; const writing = p.departure(`${failure}: pending write`);
    gate.release(); await operation;
    assert.equal(p.view.pending, null); assert.equal(p.view.hasUncommittedWork(), false); assert.equal(p.apply.disabled, true);
    assert.match(p.host.querySelector('[role="status"]').textContent, /Could not confirm/);
    const settled = p.departure(`${failure}: settled`); assert.equal(p.calls.sets, 1, 'no automatic retry or rollback');
    if (failure === 'rejected') preserved(p, before);
    else { assert.equal(p.f.values('work')[Tasks.KEY].enabled, true); preserved(p, before, Workspaces.bundleKey(p.session)); }
    expectsWarning(writing, true); expectsWarning(settled, false);
});

test('explicit allowance bypasses Apply warning and cancelDeparture restores it without cancelling the write', {timeout: 5000}, async t => {
    const p = await page(); t.after(p.close); await p.ready(); const before = copy(p.f.raw), gate = p.pauseWrite();
    const operation = p.click(p.apply); await gate.entered;
    p.lifecycle.allowDeparture(); assert.equal(p.lifecycle.departing, true);
    const allowed = p.departure('explicitly allowed Apply departure'); assert.equal(allowed.prevented, 0); assert.equal(allowed.returnValueSet, false);
    p.lifecycle.cancelDeparture(); assert.equal(p.lifecycle.departing, false);
    const restored = p.departure('Apply after cancelDeparture'); assert.equal(p.view.pending, operation); assert.deepEqual(p.f.raw, before);
    gate.release(); await operation; const settled = p.departure('allowed then settled');
    preserved(p, before, Workspaces.bundleKey(p.session)); assert.equal(p.calls.sets, 1);
    expectsWarning(restored, true); assert.equal(allowed.applying, true); expectsWarning(settled, false);
});
