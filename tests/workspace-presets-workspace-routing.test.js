'use strict';
// Real Session + Tasks/Focus stores + preset transaction; RAM Chrome and Web
// Locks are the only storage/concurrency boundaries. No provider is initialized.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Presets = require('../shared/workspace-presets');
const Templates = require('../shared/dashboard-template-registry');
const {fixture, synthetic, accepted, Workspaces, Tasks, Focus, copy} = require('./helpers/complete-backup-acceptance');
const {deferred} = require('./helpers/task-dom-model');
const presetSource = () => fs.readFileSync(path.join(__dirname, '../shared/workspace-presets.js'), 'utf8');

function harness(id = 'work', rootEnabled = true, persisted = null) {
    const f = fixture({persisted});
    if (!persisted) {
        for (const name of ['default', 'work', 'removed']) {
            f.values(name)[Tasks.KEY].enabled = false; f.values(name)[Focus.KEY].enabled = false;
        }
        f.raw[Tasks.KEY] = {...copy(f.values('default')[Tasks.KEY]), enabled: rootEnabled, revision: 7};
        f.raw[Tasks.KEY].records[0].text = 'Synthetic retained migration original';
        f.raw[Focus.KEY] = {...Focus.initial(), enabled: rootEnabled, revision: 5};
        f.raw[Workspaces.SNAPSHOT_KEY].values = {[Tasks.KEY]: copy(f.raw[Tasks.KEY]), [Focus.KEY]: copy(f.raw[Focus.KEY])};
    }
    const calls = {reads: [], writes: [], trace: [], locks: [], removes: 0, provider: 0}, events = [], listeners = new Set();
    f.chrome.storage.onChanged = {addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn)};
    const get = f.chrome.storage.local.get, set = f.chrome.storage.local.set, request = f.locks.request;
    f.chrome.storage.local.get = async keys => { calls.reads.push(copy(keys)); calls.trace.push({type: 'read', keys: copy(keys)}); return get(keys); };
    f.chrome.storage.local.set = async values => {
        calls.writes.push(copy(values)); calls.trace.push({type: 'write', keys: Object.keys(values)}); const before = copy(f.raw); await set(values);
        const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, {oldValue: before[key], newValue: copy(value)}]));
        events.push(copy(changes)); for (const listener of [...listeners]) listener(copy(changes), 'local');
    };
    f.chrome.storage.local.remove = async () => { calls.removes++; throw Error('Unexpected removal'); };
    f.chrome.storage.sync = Object.fromEntries(['get', 'set', 'remove'].map(name => [name, async () => { calls.provider++; throw Error('Unexpected provider operation'); }]));
    f.locks.request = (name, ...args) => { calls.locks.push(name); return request(name, ...args); };
    let serial = 0;
    const manager = new Workspaces.Manager({chrome: f.chrome, locks: f.locks, now: () => '2026-10-19T19:00:00.000Z', id: () => `preset_generation_${++serial}`});
    manager.configureValidation(values => { f.manager.completeBackupConfigFromRaw(values); if (values[Tasks.KEY]) Tasks.validate(values[Tasks.KEY]); if (values[Focus.KEY]) Focus.validate(values[Focus.KEY]); });
    const session = manager.capture(id);
    const store = new Presets.Store(Presets.createBackend(f.chrome, f.locks, session));
    const tasks = new Tasks.Store(Tasks.createChromeBackend(f.chrome, f.locks, session), {id: () => 'preset_task_operation', now: () => '2026-10-19T19:00:00.000Z'});
    const focus = new Focus.Store(Focus.createChromeBackend(f.chrome, f.locks, session), {now: () => 1000, id: () => 'preset_focus_session'});
    return {f, calls, events, manager, session, store, tasks, focus};
}
function noExternal(h) { assert.equal(h.calls.removes, 0); assert.equal(h.calls.provider, 0); }
function preserved(h, before, changedKey) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(h.f.raw)])) if (key !== changedKey)
        assert.deepEqual(h.f.raw[key], before[key], `untouched raw key ${key}`);
    noExternal(h);
}
function browserStore(h, session = h.session) {
    // A classic browser script has one Window/globalThis, unlike split-object VM fixtures.
    const context = {chrome: h.f.chrome, navigator: {locks: h.f.locks}, LocalItabWorkspaces: {session},
        LocalItabTasks: Tasks, LocalItabFocus: Focus, LocalItabTemplates: Templates};
    context.window = context; vm.createContext(context);
    vm.runInContext(presetSource(), context);
    assert.equal(vm.runInContext('globalThis === window', context), true);
    return {context, store: vm.runInContext('new LocalItabWorkspace.Store()', context)};
}

for (const id of ['default', 'work']) for (const rootEnabled of [true, false])
    test(`${id}, retained root ${rootEnabled}: preview and one verified bundle write use the selected workspace`, async t => {
        const h = harness(id, rootEnabled), before = copy(h.f.raw);
        const tasks = await h.tasks.read(), focus = await h.focus.read(), lockCount = h.calls.locks.length;
        const preview = await h.store.prepare('studio');
        assert.deepEqual(preview.before, {tasks, focus}, 'preview matches the real ordinary module stores, never retained root values');
        assert.equal(preview.before.tasks.enabled, false); assert.equal(preview.before.focus.enabled, false);
        assert.deepEqual(h.f.raw, before); assert.equal(h.calls.writes.length, 0);
        const key = Workspaces.bundleKey(h.session);
        const result = await h.store.apply(preview); assert.equal(result.changed, true);
        assert.equal(h.calls.writes.length, 1); assert.deepEqual(Object.keys(h.calls.writes[0]), [key]);
        const submitted = h.calls.trace.findIndex(call => call.type === 'write');
        assert(h.calls.trace.slice(submitted + 1).filter(call => call.type === 'read' && Array.isArray(call.keys) && call.keys.includes(key)).length >= 2, 'after submission the bundle is verified and preset data read back');
        assert(h.calls.locks.includes(Workspaces.LOCK)); assert(h.calls.locks.includes(Workspaces.LOCK + ':write'));
        const presetLocks = h.calls.locks.slice(lockCount);
        assert(!presetLocks.includes(Tasks.LOCK) && !presetLocks.includes(Focus.LOCK), 'after real Session initialization, presets use its workspace lock rather than raw-root locks');
        const actual = {tasks: await h.tasks.read(), focus: await h.focus.read()};
        for (const [name, api] of [['tasks', Tasks], ['focus', Focus]]) {
            const expected = {...copy(preview.before[name]), enabled: true, revision: preview.before[name].revision + 1};
            assert.deepEqual(actual[name], expected); assert.deepEqual(h.f.raw[key].values[api.KEY], expected);
        }
        assert.deepEqual(h.f.raw[key], {...copy(before[key]), values: {...copy(before[key].values), [Tasks.KEY]: actual.tasks, [Focus.KEY]: actual.focus}});
        preserved(h, before, key); assert.equal(h.session.invalidated, false); assert.equal(h.manager._legacyConflict, false);
        assert.equal((await h.store.apply(await h.store.prepare('studio'))).changed, false); assert.equal(h.calls.writes.length, 1);
        preserved(h, before, key);
        t.diagnostic(JSON.stringify({id, rootEnabled, writes: h.calls.writes.length, writtenKeys: Object.keys(h.calls.writes[0]), removes: h.calls.removes, provider: h.calls.provider}));
    });

test('classic browser defaults capture the original Session even after the global current workspace changes', async () => {
    const h = harness('work'); await h.session.ready(); const before = copy(h.f.raw);
    const {context, store} = browserStore(h), other = h.manager.capture('default'); await other.ready();
    context.LocalItabWorkspaces.session = other;
    assert.equal((await store.apply(await store.prepare('studio'))).changed, true);
    assert.equal(h.f.values('work')[Tasks.KEY].enabled, true); assert.equal(h.f.values('default')[Tasks.KEY].enabled, false);
    assert.deepEqual(Object.keys(h.calls.writes[0]), [Workspaces.bundleKey(h.session)]); preserved(h, before, Workspaces.bundleKey(h.session));
});

test('an existing browser Session whose ready() rejects cannot fall back to retained root state', async () => {
    const h = harness('missing_workspace'), before = copy(h.f.raw), {store} = browserStore(h);
    await assert.rejects(h.session.ready(), {code: 'WORKSPACE_NOT_FOUND'});
    assert.equal(h.session.id, null); await assert.rejects(store.prepare('studio'), {code: 'WORKSPACE_NOT_FOUND'});
    assert.deepEqual(h.f.raw, before); assert.equal(h.calls.writes.length, 0); noExternal(h);
});

test('a preview cannot apply through a Session invalidated by a genuine Trash/restore generation change', async () => {
    const h = harness(), preview = await h.store.prepare('studio'); await h.session.ready(); const originalGeneration = h.session.generation;
    await h.manager.trash('work'); await h.manager.restore('work');
    assert.notEqual(h.f.raw[Workspaces.REGISTRY_KEY].workspaces.find(entry => entry.id === 'work').generation, originalGeneration);
    const before = copy(h.f.raw), count = h.calls.writes.length;
    await assert.rejects(h.store.apply(preview), {code: 'WORKSPACE_INVALIDATED'});
    assert.deepEqual(h.f.raw, before); assert.equal(h.calls.writes.length, count); noExternal(h);
});

test('a generation changed by a real replacement while Apply waits for its lock is rechecked before writing', async () => {
    const h = harness(), preview = await h.store.prepare('studio'), entered = deferred(), resume = deferred();
    const changing = h.manager.withSnapshotLock(async access => {
        const replacement = await access.snapshot(); replacement.bundles.find(bundle => bundle.id === 'work').values.quote = 'Synthetic replacement while preset waits';
        entered.resolve(); await resume.promise; return access.replace(replacement);
    });
    await entered.promise;
    const count = h.calls.writes.length, applying = h.store.apply(preview).then(value => ({value}), error => ({error}));
    try { await new Promise(resolve => setImmediate(resolve)); assert.equal(h.calls.writes.length, count); }
    finally { resume.resolve(); }
    await changing; const before = copy(h.f.raw), writes = h.calls.writes.length, outcome = await applying;
    assert.equal(outcome.error?.code, 'WORKSPACE_INVALIDATED'); assert.equal(outcome.value, undefined);
    assert.deepEqual(h.f.raw, before); assert.equal(h.calls.writes.length, writes); noExternal(h);
});

for (const module of ['Tasks', 'Focus']) test(`a real ${module} revision change after preview is not overwritten`, async () => {
    const h = harness(), preview = await h.store.prepare('studio');
    if (module === 'Tasks') await h.tasks.mutate(h.tasks.request('add', {text: 'Synthetic newer task'}));
    else await h.focus.mutate({kind: 'start', revision: (await h.focus.read()).revision});
    const before = copy(h.f.raw), count = h.calls.writes.length;
    await assert.rejects(h.store.apply(preview), {code: 'CONFLICT'});
    assert.deepEqual(h.f.raw, before); assert.equal(h.calls.writes.length, count); noExternal(h);
});

test('a real persisted prepared restore fences both new previews and an already reviewed preset', async () => {
    const h = harness(), preview = await h.store.prepare('studio'), incoming = await synthetic('source');
    const review = await h.f.store.review(await incoming.store.export(), null, accepted);
    h.f.hooks.set = (values, raw) => { Object.assign(raw, copy(values)); if (values[Workspaces.RESTORE_TRANSACTION_KEY]?.status === 'prepared') throw Error('Synthetic lost prepared acknowledgement'); };
    await assert.rejects(h.f.store.restore(review, {confirmed: true}), {code: 'UNCONFIRMED'}); delete h.f.hooks.set;
    assert.equal(h.f.raw[Workspaces.RESTORE_TRANSACTION_KEY].status, 'prepared');
    const before = copy(h.f.raw), count = h.calls.writes.length;
    await assert.rejects(h.store.prepare('studio'), {code: 'WORKSPACE_RESTORE_PENDING'});
    await assert.rejects(h.store.apply(preview), {code: 'WORKSPACE_RESTORE_PENDING'});
    assert.deepEqual(h.f.raw, before); assert.equal(h.calls.writes.length, count); noExternal(h);
});

for (const [id, code] of [['missing_workspace', 'WORKSPACE_NOT_FOUND'], ['removed', 'WORKSPACE_DELETED']])
    test(`${id}: rejected Session never creates a workspace or edits root values`, async () => {
        const h = harness(id), before = copy(h.f.raw);
        await assert.rejects(h.store.prepare('studio'), {code}); assert.equal(h.session.id, null);
        assert.deepEqual(h.f.raw, before); assert.equal(h.calls.writes.length, 0); noExternal(h);
    });

for (const failure of ['write rejection', 'verification mismatch']) test(`${failure}: scoped preset Apply rejects without root fallback, retry or rollback`, async () => {
    const h = harness(), preview = await h.store.prepare('studio'), before = copy(h.f.raw), key = Workspaces.bundleKey(h.session);
    if (failure === 'write rejection') h.f.hooks.set = () => { throw Error('Synthetic write failure'); };
    else h.f.hooks.read = (keys, raw) => {
        const result = copy(keys === null ? raw : Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]])));
        if (h.calls.writes.length && result[key]) result[key].values[Tasks.KEY].enabled = false;
        return result;
    };
    await assert.rejects(h.store.apply(preview), {code: 'UNCONFIRMED'});
    assert.equal(h.calls.writes.length, 1); assert.deepEqual(Object.keys(h.calls.writes[0]), [key]);
    if (failure === 'write rejection') assert.deepEqual(h.f.raw, before);
    else assert.equal(h.f.raw[key].values[Tasks.KEY].enabled, true, 'an unconfirmed write is neither silently retried nor rolled back');
    preserved(h, before, key);
});

test('legacy operation without any Session retains one root write under Tasks then Focus locks', async () => {
    const h = harness('work', false, {[Tasks.KEY]: Tasks.initial(), [Focus.KEY]: Focus.initial(), marker: 'Synthetic legacy profile'});
    const store = new Presets.Store(Presets.createBackend(h.f.chrome, h.f.locks, null)), before = copy(h.f.raw);
    assert.equal((await store.apply(await store.prepare('studio'))).changed, true);
    assert.equal(h.calls.writes.length, 1); assert.deepEqual(Object.keys(h.calls.writes[0]), [Tasks.KEY, Focus.KEY]);
    assert.deepEqual(h.calls.locks, [Tasks.LOCK, Focus.LOCK, Tasks.LOCK, Focus.LOCK]);
    assert.equal(h.f.raw[Tasks.KEY].enabled, true); assert.equal(h.f.raw[Focus.KEY].enabled, true); assert.equal(h.f.raw.marker, before.marker);
    assert.equal(h.f.raw[Workspaces.REGISTRY_KEY], undefined); noExternal(h);
});
