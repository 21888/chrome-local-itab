const { test } = require('node:test');
const assert = require('node:assert/strict');
const api = require('../shared/local-countdown-store');
const { Controller } = require('../shared/local-countdown-controller');

const copy = value => structuredClone(value);
const configured = (overrides = {}) => ({ schemaVersion: 1, revision: 1, enabled: true, title: 'Launch', targetDate: '2028-02-29', ...overrides });
const fields = state => ({ enabled: state.enabled, title: state.title, targetDate: state.targetDate });
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function harness(initial) {
    let raw = copy(initial), writes = 0, tail = Promise.resolve(), readError = false, writeError = false, writeHold, afterWrite;
    const listeners = new Set(), commands = [];
    const backend = {
        lock(fn) { const result = tail.then(fn); tail = result.catch(() => {}); return result; },
        async read() { if (readError) throw Error('read failed'); return copy(raw); },
        async write(value) {
            if (writeHold) await writeHold;
            if (writeError) throw Error('write failed');
            raw = copy(value); writes++; listeners.forEach(fn => fn());
            if (afterWrite) await afterWrite(value);
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    };
    function store() {
        const result = new api.Store(backend), mutate = result.mutate.bind(result);
        result.mutate = command => { commands.push(copy(command)); return mutate(command); };
        return result;
    }
    return {
        store, backend, commands, controller: () => new Controller(store()),
        get raw() { return copy(raw); }, set raw(value) { raw = copy(value); }, get writes() { return writes; },
        get subscribers() { return listeners.size; }, notify: () => listeners.forEach(fn => fn()),
        readFail(value) { readError = value; }, writeFail(value) { writeError = value; },
        hold(value) { writeHold = value; }, afterWrite(fn) { afterWrite = fn; }
    };
}

test('countdown starts blank and off, merges draft fields, and never autosaves', async () => {
    const h = harness(), c = h.controller();
    assert.deepEqual(c.draft, { enabled: false, title: '', targetDate: '' });
    assert.equal(c.state, null); assert.equal(c.loaded, false);
    await c.init(); assert.deepEqual(c.state, api.initial()); assert.equal(c.dirty(), false);
    c.setDraft({ title: '  Launch  ' }); c.setDraft({ targetDate: '2028-02-29', enabled: true });
    await flush(); assert.equal(h.writes, 0); assert.equal(c.status, 'unsaved'); assert(c.hasUncommittedWork());
    assert.deepEqual(c.draft, { enabled: true, title: '  Launch  ', targetDate: '2028-02-29' });
    await c.save();
    assert.equal(h.writes, 1); assert.deepEqual(c.draft, fields(configured()));
    assert.equal(c.dirty(), false); assert.equal(c.status, 'saved'); assert.equal(c.hasUncommittedWork(), false);
    assert.deepEqual(h.commands[0], { kind: 'save', value: { enabled: true, title: '  Launch  ', targetDate: '2028-02-29' }, revision: 0 });
    c.setDraft({ title: 'A new draft' }); await c.cancel();
    assert.equal(c.draft.title, 'Launch'); assert.equal(h.writes, 1); assert.equal(c.hasUncommittedWork(), false); c.destroy();
});

test('validation failures retain complete drafts and corrected inputs still need explicit Save', async () => {
    const h = harness(), c = h.controller(); await c.init();
    c.setDraft({ enabled: true }); await assert.rejects(c.save(), { code: 'UNCONFIGURED' });
    assert.equal(c.draft.enabled, true); assert(c.error); assert.equal(h.writes, 0);
    c.setDraft({ title: 'Trip', targetDate: '2027-02-29' });
    assert.equal(c.error, null); await assert.rejects(c.save(), { code: 'DATE' });
    c.setDraft({ targetDate: '2028-02-29' }); await flush();
    assert.equal(c.error, null); assert.equal(h.writes, 0);
    await c.save(); assert.equal(h.raw.title, 'Trip'); assert.equal(h.writes, 1); c.destroy();
});

test('pending Save preserves newer raw inputs in all fields and canonicalizes only its own generation', async () => {
    const h = harness(), c = h.controller(); await c.init();
    const hold = deferred(); h.hold(hold.promise);
    c.setDraft({ enabled: true, title: '  First  ', targetDate: '2027-05-01' });
    const saving = c.save(); await flush(); assert.equal(c.pending, true);
    c.setDraft({ enabled: false, title: '  Second  ', targetDate: '2027-06-01' });
    await c.save(); assert.equal(h.commands.length, 1);
    hold.resolve(); h.hold(null); await saving;
    assert.deepEqual(fields(h.raw), { enabled: true, title: 'First', targetDate: '2027-05-01' });
    assert.deepEqual(c.draft, { enabled: false, title: '  Second  ', targetDate: '2027-06-01' });
    assert.equal(c.status, 'unsaved'); assert(c.dirty()); assert.equal(c.conflict, false);
    await flush(); assert.equal(h.writes, 1);
    await c.save(); assert.equal(h.writes, 2); assert.equal(c.draft.title, 'Second'); assert.equal(c.status, 'saved'); c.destroy();
});

test('composition blocks publishing and prevents Cancel from replacing an active input', async () => {
    const h = harness(configured()), c = h.controller(); await c.init();
    c.setComposing(true); c.setDraft({ title: '編集中' }); await c.save(); await c.setEnabled(false);
    assert.equal(h.writes, 0); assert(c.hasUncommittedWork());
    await c.cancel(); assert.equal(c.draft.title, '編集中'); assert(c.conflict);
    c.setComposing(false); await flush(); assert.equal(h.writes, 0);
    await c.useSaved(); assert.equal(c.draft.title, 'Launch'); assert.equal(c.conflict, false); c.destroy();
});

test('Hide persists visibility only, preserves unrelated drafts, and follows the edited checkbox owner', async () => {
    const h = harness(configured()), c = h.controller(); await c.init();
    c.setDraft({ title: 'Unpublished title', targetDate: '2029-01-01' });
    await c.setEnabled(false);
    assert.deepEqual(fields(h.raw), { enabled: false, title: 'Launch', targetDate: '2028-02-29' });
    assert.deepEqual(c.draft, { enabled: false, title: 'Unpublished title', targetDate: '2029-01-01' });
    assert.equal(h.commands[0].kind, 'visibility'); assert.equal(c.status, 'unsaved');
    await c.cancel();
    const hold = deferred(); h.hold(hold.promise); const enabling = c.setEnabled(true); await flush();
    c.setDraft({ enabled: true }); c.setDraft({ enabled: false });
    hold.resolve(); h.hold(null); await enabling;
    assert.equal(h.raw.enabled, true); assert.equal(c.draft.enabled, false); assert(c.dirty()); c.destroy();
});

test('clean other-page saves refresh while dirty drafts conflict and replacement uses the displayed revision', async () => {
    const h = harness(), a = h.controller(), b = h.controller(); await Promise.all([a.init(), b.init()]);
    a.setDraft({ enabled: true, title: 'Shared', targetDate: '2028-12-01' }); await a.save(); await flush();
    assert.equal(b.draft.title, 'Shared'); assert.equal(b.conflict, false);
    b.setDraft({ title: 'My draft' }); a.setDraft({ title: 'Other page' }); await a.save(); await flush();
    assert.equal(b.state.title, 'Other page'); assert.equal(b.draft.title, 'My draft'); assert(b.conflict);
    await b.save(); assert.equal(h.writes, 2);
    h.raw = { ...h.raw, revision: h.raw.revision + 1, title: 'Unseen newer page' };
    await assert.rejects(b.replaceWithDraft(), { code: 'CONFLICT' });
    assert.equal(h.raw.title, 'Unseen newer page'); assert.equal(b.draft.title, 'My draft'); assert(b.conflict);
    await b.replaceWithDraft(); assert.equal(h.raw.title, 'My draft'); assert.equal(b.conflict, false);
    a.destroy(); b.destroy();
});

test('out-of-order refresh successes and failures cannot regress newer saved state', async () => {
    const h = harness(configured()), c = h.controller(); await c.init();
    const reads = [deferred(), deferred(), deferred(), deferred()]; let index = 0;
    c.store.read = () => reads[index++].promise;
    const first = c.refresh(), second = c.refresh();
    reads[1].resolve(configured({ revision: 3, title: 'Newest' })); await second;
    reads[0].resolve(configured({ revision: 2, title: 'Older' })); await first;
    assert.equal(c.state.title, 'Newest'); assert.equal(c.draft.title, 'Newest'); assert.equal(c.error, null);
    const failed = c.refresh(), successful = c.refresh();
    reads[3].resolve(configured({ revision: 4, title: 'Latest' })); await successful;
    reads[2].reject(api.fault('READ')); await failed;
    assert.equal(c.state.revision, 4); assert.equal(c.draft.title, 'Latest'); assert.equal(c.error, null); c.destroy();
});

test('a refresh started before Save cannot overwrite its completion or newly typed input', async () => {
    const h = harness(configured()), c = h.controller(); await c.init();
    const old = deferred(), actualRead = c.store.read.bind(c.store);
    c.store.read = () => old.promise;
    const refreshing = c.refresh(); c.store.read = actualRead;
    c.setDraft({ title: 'Saved newer' }); await c.save();
    c.setDraft({ title: 'Typed newest' }); old.resolve(configured()); await refreshing;
    assert.equal(c.state.title, 'Saved newer'); assert.equal(c.draft.title, 'Typed newest'); assert.equal(c.error, null); c.destroy();
});

test('Cancel reads latest but keeps edits entered while its asynchronous read was pending', async () => {
    const h = harness(configured()), c = h.controller(); await c.init(); c.setDraft({ title: 'Old draft' });
    const read = deferred(), actualRead = c.store.read.bind(c.store);
    c.store.read = () => read.promise; const cancel = c.cancel();
    c.setDraft({ title: 'Newest user input', targetDate: '2029-01-01' });
    c.store.read = actualRead; read.resolve(configured()); await cancel;
    assert.equal(c.draft.title, 'Newest user input'); assert.equal(c.draft.targetDate, '2029-01-01');
    assert(c.conflict); assert.equal(h.writes, 0);
    await c.cancel(); assert.deepEqual(c.draft, fields(configured())); assert.equal(c.hasUncommittedWork(), false); c.destroy();
});

test('Retry of an uncommitted write replays only the submitted fields and leaves later edits unsaved', async () => {
    const h = harness(configured()), c = h.controller(); await c.init();
    c.setDraft({ title: '  Submitted  ', enabled: false }); h.writeFail(true);
    await assert.rejects(c.save(), { code: 'WRITE' }); assert.equal(h.writes, 0);
    c.setDraft({ title: 'Newer draft', enabled: true }); h.writeFail(false);
    const retried = await c.retry();
    assert.deepEqual(fields(h.raw), { enabled: false, title: 'Submitted', targetDate: '2028-02-29' });
    assert.equal(retried.revision, h.raw.revision);
    assert.deepEqual(c.draft, { enabled: true, title: 'Newer draft', targetDate: '2028-02-29' });
    assert.equal(h.writes, 1); assert.equal(c.error, null); assert.equal(c.status, 'unsaved'); c.destroy();
});

test('uncertain successful write verifies canonical submitted fields without replay or swallowing newer input', async () => {
    const h = harness(configured()), c = h.controller(); await c.init();
    c.setDraft({ title: '  Submitted  ', enabled: false }); h.afterWrite(() => h.readFail(true));
    await assert.rejects(c.save(), { code: 'READ' });
    assert.equal(h.writes, 1); assert(c.error); assert.equal(c.status, 'error');
    c.setDraft({ title: 'Newer input', enabled: true });
    assert.equal(c.draft.title, 'Newer input'); h.readFail(false); h.afterWrite(null);
    await c.retry();
    assert.equal(h.writes, 1); assert.equal(c.state.title, 'Submitted'); assert.equal(c.state.enabled, false);
    assert.equal(c.draft.title, 'Newer input'); assert.equal(c.draft.enabled, true); assert.equal(c.status, 'unsaved'); assert.equal(c.conflict, false); c.destroy();
});

test('Retry canonicalizes an unchanged submitted draft but preserves edits made during its verification read', async () => {
    for (const editDuringRead of [false, true]) {
        const h = harness(configured()), c = h.controller(); await c.init();
        c.setDraft({ title: '  Submitted  ', targetDate: '2029-01-01' }); h.afterWrite(() => h.readFail(true));
        await assert.rejects(c.save(), { code: 'READ' }); h.readFail(false); h.afterWrite(null);
        const read = deferred(), actualRead = c.store.read.bind(c.store);
        c.store.read = () => read.promise; const retry = c.retry();
        if (editDuringRead) c.setDraft({ title: '  My newest raw input  ', targetDate: '2030-01-01' });
        c.store.read = actualRead; read.resolve(h.raw); await retry;
        assert.equal(h.writes, 1); assert.equal(c.error, null);
        assert.equal(c.draft.title, editDuringRead ? '  My newest raw input  ' : 'Submitted');
        assert.equal(c.dirty(), editDuringRead); assert.equal(c.status, editDuringRead ? 'unsaved' : 'saved'); c.destroy();
    }
});

test('failed exact write verification is never acknowledged as Saved and Retry cannot overwrite the divergent result', async () => {
    const h = harness(configured()), c = h.controller(); await c.init();
    c.setDraft({ title: 'Submitted' });
    h.afterWrite(() => { h.raw = { ...h.raw, targetDate: '2030-01-01' }; });
    await assert.rejects(c.save(), { code: 'VERIFY' });
    assert.equal(c.status, 'error'); assert.equal(c.error.code, 'VERIFY'); assert.equal(c.draft.targetDate, '2028-02-29');
    h.afterWrite(null); await c.retry();
    assert.equal(h.writes, 1); assert(c.conflict); assert.equal(c.error.code, 'CONFLICT'); assert.equal(h.raw.targetDate, '2030-01-01'); c.destroy();
});

test('uncertain acknowledgment compares enabled too and never treats the current draft as the failed submission', async () => {
    for (const update of [
        state => ({ ...state, enabled: !state.enabled }),
        state => ({ ...state, title: 'New current draft', targetDate: '2029-01-01' })
    ]) {
        const h = harness(configured()), c = h.controller(); await c.init();
        c.setDraft({ title: 'Submitted', enabled: false }); h.afterWrite(() => h.readFail(true));
        await assert.rejects(c.save(), { code: 'READ' });
        c.setDraft({ title: 'New current draft', targetDate: '2029-01-01' });
        h.readFail(false); h.afterWrite(null); h.raw = { ...update(h.raw), revision: h.raw.revision + 1 };
        await c.retry();
        assert.equal(h.writes, 1); assert(c.conflict); assert.equal(c.error.code, 'CONFLICT');
        assert.equal(c.draft.title, 'New current draft'); assert.notEqual(c.status, 'saved'); c.destroy();
    }
});

test('visibility Retry never publishes an unrelated settings draft and verifies the visibility result', async () => {
    const h = harness(configured()), c = h.controller(); await c.init(); c.setDraft({ title: 'Unpublished' });
    h.afterWrite(() => h.readFail(true)); await assert.rejects(c.setEnabled(false), { code: 'READ' });
    c.setDraft({ targetDate: '2029-01-01' }); h.readFail(false); h.afterWrite(null); await c.retry();
    assert.equal(h.writes, 1); assert.deepEqual(fields(h.raw), { enabled: false, title: 'Launch', targetDate: '2028-02-29' });
    assert.deepEqual(c.draft, { enabled: false, title: 'Unpublished', targetDate: '2029-01-01' }); assert(c.dirty()); c.destroy();
});

test('read-only Retry clears a recovered read error without saving a draft', async () => {
    const h = harness(configured()), c = h.controller(); await c.init(); c.setDraft({ title: 'Keep local' });
    h.readFail(true); await assert.rejects(c.refresh(), { code: 'READ' });
    c.setDraft({ title: 'Keep newest local' }); h.readFail(false); await c.retry();
    assert.equal(h.writes, 0); assert.equal(c.error, null); assert.equal(c.status, 'unsaved'); assert.equal(c.draft.title, 'Keep newest local'); c.destroy();
});

test('initial read failures retry safely and corrupt or missing saved baselines cannot be overwritten', async () => {
    const h = harness(), c = h.controller(); h.readFail(true);
    await assert.rejects(c.init(), { code: 'READ' }); assert.equal(c.loaded, false); assert.equal(h.writes, 0);
    h.readFail(false); await c.retry(); assert.equal(c.loaded, true); assert.equal(c.error, null); c.destroy();
    for (const broken of [undefined, null, {}, configured({ revision: 0 })]) {
        const h = harness(configured()), c = h.controller(); await c.init(); c.setDraft({ title: 'Do not lose this' }); h.raw = broken;
        await assert.rejects(c.refresh(), { code: 'CORRUPT' }); assert.equal(c.state.revision, 1); assert.equal(c.draft.title, 'Do not lose this');
        await c.save(); await c.replaceWithDraft(); await c.setEnabled(false); assert.equal(h.writes, 0);
        await assert.rejects(c.retry(), { code: 'CORRUPT' }); await assert.rejects(c.cancel(), { code: 'CORRUPT' });
        assert.equal(c.draft.title, 'Do not lose this'); assert.equal(h.writes, 0); c.destroy();
    }
});

test('destroy unsubscribes and ignores in-flight reads without notifications or writes', async () => {
    const h = harness(configured()), c = h.controller(); let changes = 0;
    c.subscribe(() => changes++); await c.init(); await c.init(); assert.equal(h.subscribers, 1);
    const read = deferred(); c.store.read = () => read.promise; const refreshing = c.refresh(); const before = changes;
    c.destroy(); read.resolve(configured({ revision: 2, title: 'After close' })); await refreshing;
    c.setDraft({ title: 'Closed' }); await c.save(); await c.retry(); await c.cancel();
    assert.equal(h.subscribers, 0); assert.equal(changes, before); assert.equal(c.state.title, 'Launch'); assert.equal(h.writes, 0);
});
