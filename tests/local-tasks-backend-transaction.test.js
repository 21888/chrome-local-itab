const test = require('node:test');
const assert = require('node:assert/strict');
const tasks = require('../shared/local-tasks-store.js');
const { Controller } = require('../shared/local-tasks-controller.js');
const Workspaces = require('../shared/workspaces.js');
const clone = value => structuredClone(value);
const NOW = '2026-10-18T04:00:00.000Z';
const deferred = () => {
    let resolve; const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};
function initial(label = 'original', count = 4) {
    return tasks.validate({ schemaVersion: 1, revision: 6, enabled: true, pinnedId: 'task_0000', receipts: ['receipt_prior'],
        records: Array.from({ length: count }, (_, i) => ({ id: `task_000${i}`, version: `version_${i}`, text: `${label} ${i} 中文 😀`,
            state: i === 2 ? 'done' : i === 3 ? 'removed' : 'active', removedFrom: i === 3 ? 'done' : null, createdAt: NOW, updatedAt: NOW })),
        recovery: [{ id: 'recovery_prior', createdAt: NOW, content: { records: [], pinnedId: null } }] });
}
// Independent destinations and queues. A dispatched read/write keeps its own
// target. Mutable Store.backend replacement is deliberate injection, not a
// reproduction of the product's navigate-to-a-new-page workspace switch.
function backend(state = initial()) {
    let raw = clone(state), queue = Promise.resolve();
    const b = {
        locks: 0, reads: 0, writes: 0, active: 0, events: [], readGate: null, writeGate: null, mode: null, readError: null,
        lock(action) {
            assert.strictEqual(this, b, 'backend lock receiver is preserved'); b.locks++;
            const next = queue.then(async () => { b.active++; try { return await action(); } finally { b.active--; } });
            queue = next.catch(() => {}); return next;
        },
        async read() {
            assert.strictEqual(this, b, 'backend read receiver is preserved');
            b.reads++; b.events.push(['read', b.active]); const result = clone(raw), gate = b.readGate; b.readGate = null;
            if (gate) { gate.entered.resolve(); await gate.release.promise; }
            if (b.readError) { const error = b.readError; b.readError = null; throw error; }
            return result;
        },
        async write(value) {
            assert.strictEqual(this, b, 'backend write receiver is preserved');
            b.writes++; b.events.push(['write', b.active]); const next = clone(value), gate = b.writeGate; b.writeGate = null;
            if (gate) { gate.entered.resolve(); await gate.release.promise; }
            const mode = b.mode; b.mode = null;
            if (mode === 'false') return false;
            if (mode === 'throw') throw Error('synthetic write failure');
            if (mode === 'drop') return;
            raw = next;
            if (mode === 'ack') throw Error('synthetic acknowledgement failure');
            if (mode === 'verify-read') b.readError = Error('synthetic verification read failure');
        },
        subscribe() { return () => {}; }, raw: () => clone(raw), seed(value) { raw = clone(value); }
    };
    return b;
}
function fixture() {
    const own = backend(), foreign = backend(initial('foreign', 4)); let serial = 0;
    const store = new tasks.Store(own, { id: () => `operation_${++serial}`, now: () => NOW });
    return { own, foreign, store };
}
const counts = b => ({ locks: b.locks, reads: b.reads, writes: b.writes });
const edit = store => store.request('edit', { id: 'task_0000', version: 'version_0', text: 'exact original edit' });
const backup = state => JSON.stringify({ format: tasks.FORMAT, schemaVersion: 1, exportedAt: NOW,
    content: { records: state.records, pinnedId: state.pinnedId }, recovery: state.recovery });
function gateAt(b, stage) {
    const entered = deferred(), release = deferred(), gate = { entered, release };
    if (stage === 'lock') b.lock(async () => { entered.resolve(); await release.promise; });
    else b[`${stage}Gate`] = gate;
    return gate;
}
function unchangedExceptEdit(before, after) {
    const expected = clone(before); expected.revision++; expected.receipts.push(after.receipts.at(-1));
    expected.records[0] = { ...expected.records[0], text: 'exact original edit', version: after.records[0].version, updatedAt: NOW };
    assert.deepEqual(after, expected, 'all other records, recovery, pin and prior receipts survive');
}

for (const stage of ['lock', 'read', 'write']) test(`one mutation keeps its invocation backend across ${stage} replacement`, async t => {
    const { own, foreign, store } = fixture(), before = own.raw(), other = foreign.raw(), gate = gateAt(own, stage);
    const command = edit(store), pending = store.mutate(command); await gate.entered.promise;
    store.backend = foreign; gate.release.resolve(); const result = await pending;
    t.diagnostic(JSON.stringify({ stage, own: counts(own), foreign: counts(foreign), originalText: own.raw().records[0].text, foreignText: foreign.raw().records[0].text }));
    assert.deepEqual(counts(foreign), { locks: 0, reads: 0, writes: 0 }); assert.deepEqual(foreign.raw(), other);
    unchangedExceptEdit(before, result); assert.deepEqual(result, own.raw());
    assert.equal(own.writes, 1); assert.equal(own.reads, 2); assert.ok(own.events.every(([, active]) => active === 1));
    assert.equal(result.receipts.at(-1), command.operationId);
});

test('a synchronous reviewed guard cannot redirect the rest of the transaction', async t => {
    const { own, foreign, store } = fixture(), before = own.raw(), other = foreign.raw(); let guarded = 0;
    const result = await store.mutate(edit(store), current => { guarded++; assert.deepEqual(current, before); store.backend = foreign; return true; });
    t.diagnostic(JSON.stringify({ guarded, own: counts(own), foreign: counts(foreign) }));
    assert.equal(guarded, 1); assert.deepEqual(counts(foreign), { locks: 0, reads: 0, writes: 0 });
    assert.deepEqual(foreign.raw(), other); unchangedExceptEdit(before, result); assert.deepEqual(result, own.raw());
});

const readers = [
    ['read', store => store.read(), value => value.records[0].text],
    ['export', store => store.export(), value => JSON.parse(value).content.records[0].text],
    ['review', store => store.review(backup(initial())), value => value.current.active],
    ['reviewBatch', store => store.reviewBatch('new synthetic row'), value => value.currentTotal],
    ['reviewCompletion', store => store.reviewCompletion([{ id: 'task_0000', version: 'version_0' }]), value => value.records[0].text],
    ['reviewReopening', store => store.reviewReopening([{ id: 'task_0002', version: 'version_2' }]), value => value.records[0].text],
    ['reviewRestoration', store => store.reviewRestoration([{ id: 'task_0003', version: 'version_3', removedFrom: 'done' }]), value => value.records[0].text],
    ['reviewTransition', store => store.reviewTransition('completeBatch', [{ id: 'task_0000', version: 'version_0' }]), value => value.records[0].text]
];
for (const [name, read, select] of readers) for (const stage of ['lock', 'read']) test(`${name} reads only its invocation backend across ${stage} replacement`, async t => {
    const { own, foreign, store } = fixture(), other = foreign.raw();
    // Distinct totals also distinguish read-only count-based reviews.
    other.records.push({ ...other.records[0], id: 'foreign_extra', text: 'foreign extra' }); foreign.seed(other);
    const expected = select(await read(store)), before = own.raw(), start = counts(own), gate = gateAt(own, stage);
    const pending = read(store); await gate.entered.promise; store.backend = foreign; gate.release.resolve(); const result = await pending;
    t.diagnostic(JSON.stringify({ name, stage, own: counts(own), foreign: counts(foreign) }));
    assert.equal(select(result), expected); assert.deepEqual(counts(foreign), { locks: 0, reads: 0, writes: 0 });
    assert.deepEqual(own.raw(), before); assert.deepEqual(foreign.raw(), other); assert.equal(own.reads, start.reads + 1); assert.equal(own.writes, 0);
});

for (const stage of ['lock', 'read']) test(`verifyBatch checks the original receipt and exact records after ${stage} replacement`, async t => {
    const { own, foreign, store } = fixture(), command = store.request('addBatch', { texts: ['fixed batch row', 'fixed batch row'] });
    await store.mutate(command); const before = own.raw(), other = foreign.raw(), gate = gateAt(own, stage), start = counts(own);
    const pending = store.verifyBatch(command); await gate.entered.promise; store.backend = foreign; gate.release.resolve();
    const result = await pending; t.diagnostic(JSON.stringify({ stage, result, own: counts(own), foreign: counts(foreign) }));
    assert.deepEqual(result, { matches: true }); assert.deepEqual(counts(foreign), { locks: 0, reads: 0, writes: 0 });
    assert.deepEqual(own.raw(), before); assert.deepEqual(foreign.raw(), other); assert.equal(own.reads, start.reads + 1); assert.equal(own.writes, start.writes);
});

for (const mode of ['false', 'throw', 'ack', 'drop', 'verify-read']) test(`original ${mode} outcome remains bounded and same-command retry stays original`, async t => {
    const { own, foreign, store } = fixture(), command = edit(store), before = own.raw(), other = foreign.raw(), gate = gateAt(own, 'write');
    const controller = new Controller(store); await controller.refresh(); own.mode = mode;
    const pending = controller.run(command); await gate.entered.promise; store.backend = foreign; gate.release.resolve();
    const expected = mode === 'drop' ? 'VERIFY' : mode === 'verify-read' ? 'READ' : 'WRITE';
    await assert.rejects(pending, { code: expected });
    t.diagnostic(JSON.stringify({ mode, code: controller.error.code, own: counts(own), foreign: counts(foreign) }));
    assert.strictEqual(controller.retryCommand, command); assert.equal(controller.status, 'error'); assert.equal(controller.pending, null);
    assert.deepEqual(counts(foreign), { locks: 0, reads: 0, writes: 0 }); assert.deepEqual(foreign.raw(), other);
    if (['false', 'throw', 'drop'].includes(mode)) assert.deepEqual(own.raw(), before); else unchangedExceptEdit(before, own.raw());
    store.backend = own; const writes = own.writes; const result = await controller.retry();
    assert.equal(own.writes, writes + (['false', 'throw', 'drop'].includes(mode) ? 1 : 0));
    assert.equal(result.receipts.filter(value => value === command.operationId).length, 1); assert.equal(controller.retryCommand, null);
    unchangedExceptEdit(before, result); controller.destroy();
});

for (const latest of [true, false]) test(`receipt ${latest ? 'latest' : 'older'} remains scoped to the backend owning the lock`, async t => {
    const { own, foreign, store } = fixture(), command = edit(store); await store.mutate(command);
    if (!latest) await store.mutate(store.request('add', { text: 'later original row' }));
    const before = own.raw(), other = foreign.raw(), gate = gateAt(own, 'lock'), writes = own.writes;
    const pending = store.mutate(command); await gate.entered.promise; store.backend = foreign; gate.release.resolve();
    if (latest) assert.deepEqual(await pending, before); else await assert.rejects(pending, { code: 'CONFLICT' });
    t.diagnostic(JSON.stringify({ latest, own: counts(own), foreign: counts(foreign) }));
    assert.deepEqual(counts(foreign), { locks: 0, reads: 0, writes: 0 }); assert.deepEqual(own.raw(), before);
    assert.deepEqual(foreign.raw(), other); assert.equal(own.writes, writes);
});

test('queued original CAS conflict cannot borrow a matching foreign version', async t => {
    const { own, foreign, store } = fixture(), command = edit(store);
    await store.mutate(edit(store)); const before = own.raw(), other = foreign.raw(), gate = gateAt(own, 'lock');
    const pending = store.mutate(command); await gate.entered.promise; store.backend = foreign; gate.release.resolve();
    await assert.rejects(pending, { code: 'CONFLICT' }); t.diagnostic(JSON.stringify({ own: counts(own), foreign: counts(foreign) }));
    assert.deepEqual(counts(foreign), { locks: 0, reads: 0, writes: 0 }); assert.deepEqual(own.raw(), before); assert.deepEqual(foreign.raw(), other);
});

for (const kind of ['replace', 'recover']) test(`${kind} keeps the prior original content and recovery in the original backend`, async t => {
    const { own, foreign, store } = fixture(), before = own.raw(), other = foreign.raw(), gate = gateAt(own, 'read');
    const command = store.request(kind, kind === 'replace' ? { revision: before.revision, source: backup(initial('imported', 2)) } : { revision: before.revision, id: before.recovery[0].id });
    const pending = store.mutate(command); await gate.entered.promise; store.backend = foreign; gate.release.resolve(); const result = await pending;
    t.diagnostic(JSON.stringify({ kind, own: counts(own), foreign: counts(foreign) }));
    assert.deepEqual(counts(foreign), { locks: 0, reads: 0, writes: 0 }); assert.deepEqual(foreign.raw(), other); assert.deepEqual(own.raw(), result);
    assert.deepEqual(result.recovery.at(-1).content, { records: before.records, pinnedId: before.pinnedId });
    assert.equal(result.revision, before.revision + 1); assert.equal(result.receipts.at(-1), command.operationId);
    if (kind === 'replace') { assert.equal(result.recovery.length, 2); assert.deepEqual(result.recovery[0], before.recovery[0]); }
    else { assert.equal(result.recovery.length, 1); assert.deepEqual(result.records, []); assert.equal(result.pinnedId, null); }
});

test('an independent later invocation deliberately uses the currently configured backend', async () => {
    const { own, foreign, store } = fixture(), before = own.raw(); store.backend = foreign;
    assert.deepEqual(await store.read(), foreign.raw()); await store.mutate(edit(store));
    assert.deepEqual(counts(own), { locks: 0, reads: 0, writes: 0 }); assert.deepEqual(own.raw(), before); assert.equal(foreign.writes, 1);
});

test('boundary: Controller conflict refresh is a separate operation on its current backend', async t => {
    const { own, foreign, store } = fixture(), command = edit(store), controller = new Controller(store);
    await controller.refresh(); await store.mutate(edit(store));
    const before = own.raw(), other = foreign.raw(), gate = gateAt(own, 'read');
    const pending = controller.run(command); await gate.entered.promise; store.backend = foreign; gate.release.resolve();
    await assert.rejects(pending, { code: 'CONFLICT' });
    t.diagnostic(JSON.stringify({ boundary: 'separate-conflict-refresh', own: counts(own), foreign: counts(foreign), controllerText: controller.state.records[0].text }));
    assert.deepEqual(counts(foreign), { locks: 1, reads: 1, writes: 0 }); assert.deepEqual(controller.state, other);
    assert.strictEqual(controller.retryCommand, command); assert.equal(controller.error.code, 'CONFLICT');
    assert.deepEqual(own.raw(), before); assert.deepEqual(foreign.raw(), other); controller.destroy();
});

for (const error of [Error('synthetic detail'), Object.assign(Error('workspace unavailable'), { code: 'WORKSPACE_INVALIDATED' })]) test(`original read error preserves ${error.code || 'READ'} mapping without foreign fallback`, async () => {
    const { own, foreign, store } = fixture(), before = own.raw(), gate = gateAt(own, 'read'); own.readError = error;
    const pending = store.mutate(edit(store)); await gate.entered.promise; store.backend = foreign; gate.release.resolve();
    await assert.rejects(pending, { code: error.code || 'READ' }); assert.equal(own.writes, 0); assert.deepEqual(own.raw(), before);
    assert.deepEqual(counts(foreign), { locks: 0, reads: 0, writes: 0 });
});

// Actual Session/createBackend/withLock/get/set code, with a bounded synthetic
// manager/storage/lock transport. This is not native Web Locks or Chrome QA.
async function sessionFixture() {
    const entries = ['original', 'foreign'].map((id, i) => ({ id, generation: `generation_${i}`, deletedAt: null }));
    const values = new Map(entries.map(entry => [entry.id, { [tasks.KEY]: initial(entry.id), quote: `${entry.id} unrelated config` }]));
    const queues = new Map(), lockNames = [], writes = []; let gate = null, restorePending = false;
    const manager = {
        chrome: { storage: { onChanged: { addListener() {} } } }, subscribe() {}, async ready() {},
        async registry() { return { lastUsedId: 'original', workspaces: clone(entries) }; },
        locks: { request(name, options, action) {
            lockNames.push([name, options.mode]); const next = (queues.get(name) || Promise.resolve()).then(action);
            queues.set(name, next.catch(() => {})); return next;
        } },
        async assertRestoreSettled() { if (restorePending) throw Object.assign(Error('restore pending'), { code: 'WORKSPACE_RESTORE_PENDING' }); },
        async readBundle(entry) {
            const result = clone(values.get(entry.id)), pending = gate; gate = null;
            if (pending) { pending.entered.resolve(); await pending.release.promise; } return result;
        },
        async writeBundle(entry, next) { writes.push(entry.id); values.set(entry.id, clone(next)); }
    };
    const ownSession = new Workspaces.Session(manager, 'original'), foreignSession = new Workspaces.Session(manager, 'foreign');
    await ownSession.ready(); await foreignSession.ready();
    const own = tasks.createChromeBackend(null, null, ownSession), foreign = tasks.createChromeBackend(null, null, foreignSession); let serial = 0;
    const store = new tasks.Store(own, { id: () => `session_operation_${++serial}`, now: () => NOW });
    return { ownSession, foreignSession, own, foreign, store, entries, lockNames, writes,
        value: id => clone(values.get(id)), holdRead() { gate = { entered: deferred(), release: deferred() }; return gate; },
        setRestorePending() { restorePending = true; } };
}

test('real Session backend closures and source lock keep an injected replacement out of the transaction', async t => {
    const h = await sessionFixture(), original = h.value('original'), other = h.value('foreign'), gate = h.holdRead();
    const pending = h.store.mutate(edit(h.store)); await gate.entered.promise; h.store.backend = h.foreign;
    h.ownSession.suspendWrites(); let flushed = false; const flush = h.ownSession.flush().then(() => { flushed = true; });
    await Promise.resolve(); assert.equal(flushed, false); gate.release.resolve(); const result = await pending; await flush;
    t.diagnostic(JSON.stringify({ writes: h.writes, lockNames: h.lockNames, flushed }));
    assert.deepEqual(h.writes, ['original']); assert.deepEqual(h.value('foreign'), other);
    unchangedExceptEdit(original[tasks.KEY], result); assert.deepEqual(h.value('original')[tasks.KEY], result); assert.equal(h.value('original').quote, original.quote);
    assert.deepEqual(h.lockNames, [[Workspaces.LOCK, 'shared'], [`${Workspaces.LOCK}:write`, 'exclusive']]);
    assert.equal(h.ownSession.id, 'original'); assert.equal(h.ownSession.generation, 'generation_0'); assert.ok(Object.isFrozen(h.ownSession._identity));
    h.store.backend = h.own; await assert.rejects(h.store.read(), { code: 'WORKSPACE_SWITCH_PENDING' });
    h.ownSession.resumeWrites(); assert.deepEqual(await h.store.read(), result);
});

test('real Session refuses an unsettled restore before task read or write', async () => {
    const h = await sessionFixture(), before = h.value('original'); h.setRestorePending();
    await assert.rejects(h.store.mutate(edit(h.store)), { code: 'WORKSPACE_RESTORE_PENDING' });
    assert.deepEqual(h.writes, []); assert.deepEqual(h.value('original'), before);
});

test('real Session generation recheck after bundle await still rejects retired source without writes', async () => {
    const h = await sessionFixture(), before = h.value('original'), other = h.value('foreign'), gate = h.holdRead();
    const pending = h.store.mutate(edit(h.store)); await gate.entered.promise;
    h.store.backend = h.foreign; h.entries[0].generation = 'generation_retired'; gate.release.resolve();
    await assert.rejects(pending, { code: 'WORKSPACE_INVALIDATED' }); assert.equal(h.ownSession.invalidated, true);
    assert.deepEqual(h.writes, []); assert.deepEqual(h.value('original'), before); assert.deepEqual(h.value('foreign'), other);
});
