'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const {fixture, Workspaces, Focus, copy} = require('./helpers/complete-backup-acceptance');
const {Controller} = require('../shared/local-focus-controller');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const turn = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) { for (let n = 0; n < 100; n++) { if (predicate()) return; await turn(); } assert(predicate(), 'real asynchronous view operation should settle'); }
const settle = async () => { for (let n = 0; n < 4; n++) await turn(); };

// Real stores/controllers, two independently captured Work Sessions and mounted
// settings/dashboard Views. Only DOM, Chrome RAM storage, locks and callback
// delivery are modeled; clocks stay fixed and no timer session is started.
async function page({initialReadFails = false} = {}) {
    const f = fixture(); delete f.raw.__auth; f.raw.sync = {enabled: false}; f.raw.privacy = {onlineFavicons: false};
    f.values('work')[Focus.KEY].enabled = true;
    const before = copy(f.raw), changed = new Set(), gates = [], delayed = [];
    const calls = {reads: 0, writes: 0, commits: 0, removes: 0, provider: 0};
    f.chrome.storage.onChanged = {addListener: fn => changed.add(fn), removeListener: fn => changed.delete(fn)};
    const get = f.chrome.storage.local.get, set = f.chrome.storage.local.set;
    f.chrome.storage.local.get = keys => { calls.reads++; return get(keys); };
    f.chrome.storage.local.set = async values => {
        calls.writes++; const previous = copy(f.raw); await set(values); calls.commits++;
        const changes = Object.fromEntries(Object.keys(values).map(key => [key, {oldValue: previous[key], newValue: copy(f.raw[key])}]));
        for (const fn of [...changed]) fn(copy(changes), 'local');
    };
    f.chrome.storage.local.remove = async () => { calls.removes++; throw Error('Unexpected removal'); };
    f.chrome.storage.sync = Object.fromEntries(['get', 'set', 'remove'].map(name => [name, async () => { calls.provider++; throw Error('Unexpected provider operation'); }]));
    function session() {
        const manager = new Workspaces.Manager({chrome: f.chrome, locks: f.locks});
        manager.configureValidation(values => { f.manager.completeBackupConfigFromRaw(values); if (values[Focus.KEY]) Focus.validate(values[Focus.KEY]); });
        return manager.capture('work');
    }
    const localSession = session(), remoteSession = session(); await Promise.all([localSession.ready(), remoteSession.ready()]);
    let id = 0;
    const makeStore = owner => new Focus.Store(Focus.createChromeBackend(f.chrome, f.locks, owner), {now: () => 1700000000000, id: () => `focus_feedback_${++id}`});
    const makeController = store => new Controller(store, {wall: () => 1700000000000, monotonic: () => 1000});
    const store = makeStore(localSession), controller = makeController(store), document = createDocument({blurUnavailableFocus: true});
    const api = {...Focus, Controller}, window = {LocalItabFocus: api, setTimeout() { return 1; }, clearTimeout() {}, addEventListener() {}, removeEventListener() {}};
    vm.runInNewContext(fs.readFileSync(require.resolve('../shared/local-focus-view'), 'utf8'), {window, document});
    const host = document.createElement('section'); document.body.append(host);
    if (initialReadFails) f.hooks.read = () => { throw Error('Synthetic initial Chrome read failure'); };
    const settings = api.mountSettings(host, {controller});
    await until(() => controller.state !== null || controller.error !== null);
    const input = host.querySelector('input'), retry = host.querySelector('button'), status = host.querySelector('[role="status"]');
    const remoteStore = makeStore(remoteSession), remoteController = makeController(remoteStore);
    const views = [settings];
    function remoteView() {
        const document = createDocument({blurUnavailableFocus: true}), api = {...Focus, Controller};
        const window = {LocalItabFocus: api, LocalItabWorkspaces: {session: remoteSession}, setTimeout() { return 1; }, clearTimeout() {}, addEventListener() {}, removeEventListener() {}};
        vm.runInNewContext(fs.readFileSync(require.resolve('../shared/local-focus-view'), 'utf8'), {window, document});
        const host = document.createElement('article'); document.body.append(host);
        const view = new api.View(host, {controller: remoteController}); views.push(view); return view;
    }
    function toggle(enabled) { assert.equal(input.disabled, false); input.checked = enabled; input.dispatch('change'); assert(controller.pending); return controller.pending; }
    function pauseSet() {
        const entered = deferred(), release = deferred(); gates.push(release);
        f.hooks.set = async (values, raw) => { entered.resolve(); await release.promise; Object.assign(raw, copy(values)); };
        return {entered: entered.promise, release: release.resolve};
    }
    // Hold only delivery after a real Store.read resolves/rejects and releases
    // its Session locks. The validated value/error is untouched. Holding a
    // Chrome read inside that lock would incorrectly prevent the later action.
    function delayNextRead({fail = false} = {}) {
        const entered = deferred(), release = deferred(); gates.push(release);
        const original = store.read;
        if (fail) f.hooks.read = () => { f.hooks.read = null; throw Error('Synthetic Chrome read rejection'); };
        store.read = function (...args) {
            store.read = original;
            const result = original.apply(this, args).then(value => ({value}), error => ({error}));
            const delivery = result.then(async outcome => { entered.resolve(outcome); await release.promise; if (outcome.error) throw outcome.error; return outcome.value; });
            delayed.push(delivery.catch(() => {})); return delivery;
        };
        return {entered: entered.promise, release: release.resolve};
    }
    async function rejectVisibility() {
        f.hooks.set = () => { throw Error('Synthetic Chrome visibility write rejection'); };
        await assert.rejects(toggle(false), {code: 'WRITE'}); f.hooks.set = null;
        assert.equal(controller.pending, null); assert.equal(controller.state.enabled, true); assert.equal(input.checked, true);
        return controller.error;
    }
    async function close() { for (const gate of gates) gate.resolve(); await Promise.all(delayed); await Promise.allSettled([controller.pending, remoteController.pending]); for (const view of views) view.destroy(); remoteController.destroy(); }
    return {f, calls, before, store, controller, settings, document, host, input, retry, status, remoteStore, remoteController, remoteSession, localSession, remoteView, toggle, pauseSet, delayNextRead, rejectVisibility, close};
}
function feedback(p, expected) {
    assert.equal(p.controller.error, expected, 'the mutation still owns its exact failure feedback');
    assert.equal(p.retry.hidden, false); assert.equal(p.retry.disabled, false); assert.match(p.status.textContent, /Could not confirm/);
}
function preserved(p, expectedWork = p.before[Workspaces.bundleKey(p.localSession)]) {
    const key = Workspaces.bundleKey(p.localSession);
    for (const name of Object.keys(p.before)) assert.deepEqual(p.f.raw[name], name === key ? expectedWork : p.before[name], `raw ${name}`);
    assert.equal(p.calls.removes, 0); assert.equal(p.calls.provider, 0);
    assert.equal(p.controller.snapshot()?.session.status || 'ready', 'ready');
}

test('another Work page saves minutes; rejected visibility intent keeps its error and Retry after subscribed reads', {timeout: 5000}, async t => {
    const p = await page(); t.after(p.close); const remote = p.remoteView(); await until(() => p.remoteController.state !== null);
    assert.notEqual(p.localSession, p.remoteSession); assert.equal(p.store.backend.workspace, p.localSession);
    const gate = p.pauseSet(); remote.minutes.value = '30'; remote.minutes.dispatch('input');
    assert.equal(remote.saveMinutes.hidden, false); remote.saveMinutes.dispatch('click'); const saving = p.remoteController.pending; await gate.entered;
    const hiding = p.toggle(false).then(value => ({value}), error => ({error})); gate.release();
    const outcome = await hiding; await saving; await settle();
    assert.equal(outcome.error?.code, 'CONFLICT'); assert.equal(p.input.checked, true); assert.equal(p.controller.state.durations.focus, 30);
    const expected = copy(p.before[Workspaces.bundleKey(p.localSession)]); expected.values[Focus.KEY].durations.focus = 30; expected.values[Focus.KEY].session.remainingMs = 1800000; expected.values[Focus.KEY].revision = 1;
    preserved(p, expected); assert.equal(p.calls.writes, 1); assert.equal(p.calls.commits, 1);
    t.diagnostic(JSON.stringify({outcome: outcome.error.code, controllerError: p.controller.error?.code || null, retryHidden: p.retry.hidden, enabled: p.controller.state.enabled, minutes: p.controller.state.durations.focus, writes: p.calls.writes}));
    feedback(p, outcome.error);
});

for (const fail of [false, true]) test(`old refresh ${fail ? 'failure' : 'success'} cannot replace a later mutation failure`, {timeout: 5000}, async t => {
    const p = await page(); t.after(p.close); const gate = p.delayNextRead({fail});
    const old = p.controller.refresh().then(value => ({value}), error => ({error})); await gate.entered;
    const mutationError = await p.rejectVisibility(); assert.equal(mutationError.code, 'WRITE'); feedback(p, mutationError);
    gate.release(); const outcome = await old; await settle();
    assert.equal(Boolean(outcome.error), fail); preserved(p); assert.equal(p.calls.writes, 1); assert.equal(p.calls.commits, 0);
    feedback(p, mutationError);
});

test('background subscription updates saved state but only explicit successful Retry clears mutation feedback', {timeout: 5000}, async t => {
    const p = await page(); t.after(p.close); const mutationError = await p.rejectVisibility();
    await p.remoteStore.mutate({kind: 'duration', value: 30, revision: 0}); await until(() => p.controller.state.revision === 1); await settle();
    const retained = {error: p.controller.error, retryHidden: p.retry.hidden, status: p.status.textContent};
    const writes = p.calls.writes; p.retry.dispatch('click'); await until(() => !p.controller.error); await settle();
    assert.equal(p.retry.hidden, true); assert.equal(p.input.checked, true); assert.equal(p.controller.state.durations.focus, 30);
    assert.equal(p.calls.writes, writes); assert.equal(p.calls.writes, 2); assert.equal(p.calls.commits, 1);
    const expected = copy(p.before[Workspaces.bundleKey(p.localSession)]); expected.values[Focus.KEY].durations.focus = 30; expected.values[Focus.KEY].session.remainingMs = 1800000; expected.values[Focus.KEY].revision = 1; preserved(p, expected);
    assert.equal(retained.error, mutationError); assert.equal(retained.retryHidden, false); assert.match(retained.status, /Could not confirm/);
});

test('an explicit Retry already reading cannot clear the failure of a newer action', {timeout: 5000}, async t => {
    const p = await page(); t.after(p.close); const first = await p.rejectVisibility(), gate = p.delayNextRead();
    p.retry.dispatch('click'); await gate.entered;
    const newer = await p.rejectVisibility(); assert.notEqual(newer, first); feedback(p, newer);
    gate.release(); await settle();
    preserved(p); assert.equal(p.calls.writes, 2); assert.equal(p.calls.commits, 0); feedback(p, newer);
});

test('normal initial read failure remains visible until a later explicit successful read', {timeout: 5000}, async t => {
    const p = await page({initialReadFails: true}); t.after(p.close);
    assert.equal(p.controller.state, null); assert(p.controller.error); assert.equal(p.input.disabled, true); assert.equal(p.retry.hidden, false);
    p.f.hooks.read = null; p.retry.dispatch('click'); await until(() => p.controller.state !== null && !p.controller.error);
    assert.equal(p.input.disabled, false); assert.equal(p.input.checked, true); assert.equal(p.retry.hidden, true);
    preserved(p); assert.equal(p.calls.writes, 0); assert.equal(p.calls.commits, 0);
});

for (const fail of [false, true]) test(`destroy ignores a late real read ${fail ? 'rejection' : 'success'} without emitting`, {timeout: 5000}, async t => {
    const p = await page(); t.after(p.close); let emissions = 0; p.controller.subscribe(() => emissions++);
    const gate = p.delayNextRead({fail}), reading = p.controller.refresh().catch(error => error); await gate.entered;
    p.settings.destroy(); const state = copy(p.controller.state), error = p.controller.error, count = emissions;
    gate.release(); await reading; await settle();
    assert.deepEqual(p.controller.state, state); assert.equal(p.controller.error, error); assert.equal(emissions, count);
    preserved(p); assert.equal(p.calls.writes, 0); assert.equal(p.calls.commits, 0);
});

test('an explicit read started while an action is pending cannot dismiss its later failure', {timeout: 5000}, async t => {
    const p = await page(), entered = deferred(), release = deferred();
    t.after(async () => { release.resolve(); await p.close(); });
    p.f.hooks.set = async () => { entered.resolve(); await release.promise; throw Error('Synthetic pending write rejection'); };
    const saving = p.toggle(false).then(value => ({value}), error => ({error})); await entered.promise;
    assert(p.controller.pending); assert.equal(p.retry.disabled, true);
    // The public refresh API may be called while pending; this is not a claim
    // that the disabled native Retry button can be activated by a user.
    const reading = p.controller.refresh(); release.resolve();
    const outcome = await saving; await reading; await settle(); p.f.hooks.set = null;
    assert.equal(outcome.error?.code, 'WRITE'); feedback(p, outcome.error);
    preserved(p); assert.equal(p.calls.writes, 1); assert.equal(p.calls.commits, 0);
});
