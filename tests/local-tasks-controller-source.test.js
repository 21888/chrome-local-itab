const test = require('node:test');
const assert = require('node:assert/strict');
const tasks = require('../shared/local-tasks-store.js');
const { Controller } = require('../shared/local-tasks-controller.js');
const Workspaces = require('../shared/workspaces.js');
const clone = value => structuredClone(value);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { await tick(); await tick(); await tick(); }
const NOW = '2026-10-18T04:00:00.000Z';
function initial(label = 'original', revision = 6) {
    return tasks.validate({ schemaVersion: 1, revision, enabled: true, pinnedId: 'task_0001', receipts: ['receipt_prior'],
        records: Array.from({ length: 4 }, (_, i) => ({ id: `task_000${i}`, version: `version_${i}`, text: `${label} ${i} 中文 😀`,
            state: i === 2 ? 'done' : i === 3 ? 'removed' : 'active', removedFrom: i === 3 ? 'done' : null,
            createdAt: NOW, updatedAt: NOW })), recovery: [{ id: 'recovery_prior', createdAt: NOW, content: { records: [], pinnedId: null } }] });
}
// Real Store and Controller, with independently serialized synthetic transports.
// Public field substitution is injection, not the product's page-navigation switch.
function backend(state = initial()) {
    let raw = clone(state), queue = Promise.resolve(); const listeners = new Set();
    const b = { locks: 0, reads: 0, writes: 0, requests: 0, unsubscribes: 0, readGate: null, writeGate: null, readError: null, mode: null,
        lock(action) { assert.strictEqual(this, b); b.locks++; const next = queue.then(action); queue = next.catch(() => {}); return next; },
        async read() {
            assert.strictEqual(this, b); b.reads++; const value = clone(raw), gate = b.readGate, error = b.readError;
            b.readGate = null; b.readError = null; if (gate) { gate.entered.resolve(); await gate.release.promise; }
            if (error) throw error; return value;
        },
        async write(value) {
            assert.strictEqual(this, b); b.writes++; const next = clone(value), gate = b.writeGate, mode = b.mode;
            b.writeGate = null; b.mode = null; if (gate) { gate.entered.resolve(); await gate.release.promise; }
            if (mode === 'false') return false; if (mode === 'throw') throw Error('synthetic rejected write');
            if (mode === 'drop') return; raw = next;
            if (mode === 'ack') throw Error('synthetic lost acknowledgement');
            if (mode === 'verify-read') b.readError = Error('synthetic failed verification read');
        },
        subscribe(fn) { assert.strictEqual(this, b); listeners.add(fn); return () => { b.unsubscribes++; listeners.delete(fn); }; },
        notify() { for (const fn of [...listeners]) fn(); }, callbacks: () => [...listeners], raw: () => clone(raw), seed(value) { raw = clone(value); }
    }; return b;
}
function storeFor(b) {
    let serial = 0; const store = new tasks.Store(b, { id: () => `operation_${++serial}`, now: () => NOW }), request = store.request;
    store.request = function (...args) { b.requests++; return request.apply(this, args); }; return store;
}
function fixture() {
    const own = backend(), foreign = backend(initial('FOREIGN', 60)), store = storeFor(own), otherStore = storeFor(foreign);
    return { own, foreign, store, otherStore, controller: new Controller(store) };
}
const counts = b => ({ requests: b.requests, locks: b.locks, reads: b.reads, writes: b.writes });
const edit = (store, text = 'original exact edit') => store.request('edit', { id: 'task_0000', version: 'version_0', text });
const change = (h, source) => { if (source === 'store') h.controller.store = h.otherStore; else h.store.backend = h.foreign; };
const restore = h => { h.controller.store = h.store; h.store.backend = h.own; };
function gateAt(b, stage) { const gate = { entered: deferred(), release: deferred() }; b[`${stage}Gate`] = gate; return gate; }
const snapshot = c => ({ state: c.state, status: c.status, error: c.error, retryCommand: c.retryCommand, pending: c.pending });
function sameSnapshot(c, before) { for (const [key, value] of Object.entries(before)) assert.strictEqual(c[key], value, key); }
function exactEdit(before, after) {
    const expected = clone(before); expected.revision++; expected.receipts.push(after.receipts.at(-1));
    expected.records[0] = { ...expected.records[0], text: 'original exact edit', version: after.records[0].version, updatedAt: NOW };
    assert.deepEqual(after, expected);
}

for (const source of ['backend', 'store']) for (const loaded of [false, true]) test(`refresh refuses ${source} replacement ${loaded ? 'after ready' : 'before first read'}`, async t => {
    const h = fixture(); t.after(() => h.controller.destroy()); if (loaded) await h.controller.refresh();
    const before = snapshot(h.controller), own = counts(h.own), other = counts(h.foreign); change(h, source);
    await assert.rejects(h.controller.refresh(), { code: 'UNAVAILABLE' });
    sameSnapshot(h.controller, before); assert.deepEqual(counts(h.own), own); assert.deepEqual(counts(h.foreign), other);
    restore(h); await h.controller.refresh(); assert.deepEqual(h.controller.state, h.own.raw());
});

for (const source of ['backend', 'store']) test(`original subscription cannot refresh a replacement ${source}`, async t => {
    const h = fixture(); t.after(() => h.controller.destroy()); await h.controller.refresh();
    const before = snapshot(h.controller), own = counts(h.own), other = counts(h.foreign); change(h, source);
    h.own.notify(); h.foreign.notify(); await settle();
    t.diagnostic(JSON.stringify({ source, own: counts(h.own), foreign: counts(h.foreign) }));
    sameSnapshot(h.controller, before); assert.deepEqual(counts(h.own), own); assert.deepEqual(counts(h.foreign), other);
    restore(h); await h.store.mutate(edit(h.store)); h.own.notify(); await settle(); assert.deepEqual(h.controller.state, h.own.raw());
});

for (const source of ['backend', 'store']) test(`real original CONFLICT cannot trigger a foreign ${source} refresh`, async t => {
    const h = fixture(); t.after(() => h.controller.destroy()); await h.controller.refresh(); const command = edit(h.store);
    await h.store.mutate(edit(h.store, 'latest original task')); const before = snapshot(h.controller), original = h.own.raw(), other = h.foreign.raw();
    const gate = gateAt(h.own, 'read'), pending = h.controller.run(command); await gate.entered.promise; change(h, source); gate.release.resolve();
    await assert.rejects(pending, { code: 'CONFLICT' });
    t.diagnostic(JSON.stringify({ source, original: counts(h.own), foreign: counts(h.foreign), controllerText: h.controller.state.records[0].text }));
    assert.deepEqual(counts(h.foreign), { requests: 0, locks: 0, reads: 0, writes: 0 }); assert.strictEqual(h.controller.state, before.state);
    assert.strictEqual(h.controller.retryCommand, command); assert.equal(h.controller.error.code, 'CONFLICT'); assert.equal(h.controller.status, 'error'); assert.equal(h.controller.pending, null);
    assert.deepEqual(h.own.raw(), original); assert.deepEqual(h.foreign.raw(), other);
    restore(h); await h.controller.refresh(); assert.deepEqual(h.controller.state, original); assert.strictEqual(h.controller.retryCommand, command); assert.equal(h.controller.error.code, 'CONFLICT');
});

test('same-source real conflict refreshes latest rows while retaining the exact failed command', async t => {
    const h = fixture(); t.after(() => h.controller.destroy()); await h.controller.refresh(); const command = edit(h.store);
    await h.store.mutate(edit(h.store, 'latest original task')); await assert.rejects(h.controller.run(command), { code: 'CONFLICT' });
    assert.deepEqual(h.controller.state, h.own.raw()); assert.strictEqual(h.controller.retryCommand, command); assert.equal(h.controller.error.code, 'CONFLICT');
});

for (const source of ['backend', 'store']) for (const action of ['run', 'action', 'retry']) test(`${action} refuses ${source} replacement without consuming a real failed retry`, async t => {
    const h = fixture(); t.after(() => h.controller.destroy()); await h.controller.refresh(); const command = edit(h.store);
    h.own.mode = 'false'; await assert.rejects(h.controller.run(command), { code: 'WRITE' });
    const before = snapshot(h.controller), own = counts(h.own), other = counts(h.foreign); change(h, source);
    const next = action === 'action' ? h.controller.action('add', { text: 'must not become a foreign request' }) : h.controller[action](command);
    await assert.rejects(next, { code: 'UNAVAILABLE' }); sameSnapshot(h.controller, before);
    assert.deepEqual(counts(h.own), own); assert.deepEqual(counts(h.foreign), other);
    restore(h); const saved = await h.controller.retry(); assert.equal(saved.receipts.filter(id => id === command.operationId).length, 1); assert.equal(h.controller.retryCommand, null);
});

for (const source of ['backend', 'store']) for (const outcome of ['success', 'READ']) test(`paused refresh ${outcome} does not publish after ${source} replacement`, async t => {
    const h = fixture(); t.after(() => h.controller.destroy()); await h.controller.refresh();
    await h.store.mutate(edit(h.store)); const before = snapshot(h.controller), gate = gateAt(h.own, 'read');
    if (outcome === 'READ') h.own.readError = Error('real transport read failure');
    const pending = h.controller.refresh(); const observed = pending.catch(error => error); await gate.entered.promise; change(h, source); gate.release.resolve();
    const result = await observed; if (outcome === 'READ') assert.equal(result.code, 'READ'); else assert.deepEqual(result, h.own.raw());
    sameSnapshot(h.controller, before); assert.deepEqual(counts(h.foreign), { requests: 0, locks: 0, reads: 0, writes: 0 });
    restore(h); await h.controller.refresh(); assert.deepEqual(h.controller.state, h.own.raw());
});

// Deliberately delay delivery AFTER the actual Store lock settles, so a newer
// real read/mutation can finish first. No Controller state/error is fabricated.
function holdReadDelivery(store) {
    const read = store.read, entered = deferred(), release = deferred(); let first = true;
    store.read = function () {
        const result = read.call(this); if (!first) return result; first = false;
        return result.then(async state => { entered.resolve(); await release.promise; return state; },
            async error => { entered.resolve(); await release.promise; throw error; });
    }; return { entered, release };
}
for (const older of ['success', 'READ']) for (const newer of ['success', 'READ']) test(`same-source newer refresh ${newer} wins over older delayed ${older}`, async t => {
    const h = fixture(); t.after(() => h.controller.destroy()); await h.controller.refresh(); const gate = holdReadDelivery(h.store);
    if (older === 'READ') h.own.readError = Error('older actual read failure');
    const pending = h.controller.refresh(), observed = pending.catch(error => error); await gate.entered.promise;
    await h.store.mutate(edit(h.store)); if (newer === 'READ') h.own.readError = Error('newer actual read failure');
    if (newer === 'READ') await assert.rejects(h.controller.refresh(), { code: 'READ' }); else await h.controller.refresh();
    const before = snapshot(h.controller); gate.release.resolve(); const result = await observed;
    if (older === 'READ') assert.equal(result.code, 'READ'); else assert.equal(result.revision, 6);
    sameSnapshot(h.controller, before); if (newer === 'success') assert.deepEqual(h.controller.state, h.own.raw());
});
for (const moment of ['start', 'finish']) for (const outcome of ['success', 'WRITE']) test(`a mutation ${moment} invalidates older refresh failure without hiding its READ (${outcome})`, async t => {
    const h = fixture(); t.after(() => h.controller.destroy()); await h.controller.refresh(); const delivery = holdReadDelivery(h.store);
    h.own.readError = Error('actual delayed read failure'); const reading = h.controller.refresh(), observedRead = reading.catch(error => error); await delivery.entered.promise;
    const gate = gateAt(h.own, 'write'), command = edit(h.store); if (outcome === 'WRITE') h.own.mode = 'false';
    const pending = h.controller.run(command), observedRun = pending.catch(error => error); await gate.entered.promise;
    if (moment === 'finish') { gate.release.resolve(); await observedRun; }
    const before = snapshot(h.controller); delivery.release.resolve(); assert.equal((await observedRead).code, 'READ'); sameSnapshot(h.controller, before);
    if (moment === 'start') { gate.release.resolve(); await observedRun; }
    assert.equal(h.controller.status, outcome === 'success' ? 'saved' : 'error'); assert.equal(h.controller.error?.code, outcome === 'success' ? undefined : 'WRITE');
});

test('a refresh started during a mutation cannot overwrite its later real WRITE error', async t => {
    const h = fixture(); t.after(() => h.controller.destroy()); await h.controller.refresh(); const writeGate = gateAt(h.own, 'write');
    h.own.mode = 'false'; const command = edit(h.store), pending = h.controller.run(command), observedRun = pending.catch(error => error); await writeGate.entered.promise;
    const delivery = holdReadDelivery(h.store); h.own.readError = Error('actual following read failure');
    const refresh = h.controller.refresh(), observedRead = refresh.catch(error => error); writeGate.release.resolve();
    await observedRun; await delivery.entered.promise; const before = snapshot(h.controller); delivery.release.resolve();
    assert.equal((await observedRead).code, 'READ'); sameSnapshot(h.controller, before); assert.equal(h.controller.error.code, 'WRITE'); assert.strictEqual(h.controller.retryCommand, command);
});

for (const source of ['backend', 'store']) for (const mode of ['success', 'false', 'throw', 'ack', 'drop', 'verify-read']) test(`already-dispatched ${mode} preserves original outcome across ${source} gap`, async t => {
    const h = fixture(); t.after(() => h.controller.destroy()); await h.controller.refresh(); const before = h.own.raw(), oldState = h.controller.state, command = edit(h.store), gate = gateAt(h.own, 'write');
    h.own.mode = mode; const pending = h.controller.run(command), observed = pending.catch(error => error); await gate.entered.promise; change(h, source);
    assert.strictEqual(h.controller.run(command), pending); assert.strictEqual(h.controller.retry(), pending); assert.strictEqual(h.controller.action('add', { text: 'coalesced' }), pending);
    gate.release.resolve(); const result = await observed;
    if (mode === 'success') { exactEdit(before, result); assert.equal(h.controller.status, 'saved'); assert.equal(h.controller.error, null); assert.equal(h.controller.retryCommand, null); }
    else { assert.equal(result.code, mode === 'drop' ? 'VERIFY' : mode === 'verify-read' ? 'READ' : 'WRITE'); assert.strictEqual(h.controller.error, result); assert.strictEqual(h.controller.retryCommand, command); assert.equal(h.controller.status, 'error'); }
    assert.strictEqual(h.controller.state, oldState); assert.equal(h.controller.pending, null);
    assert.deepEqual(counts(h.foreign), { requests: 0, locks: 0, reads: 0, writes: 0 });
    if (['success', 'ack', 'verify-read'].includes(mode)) exactEdit(before, h.own.raw()); else assert.deepEqual(h.own.raw(), before);
    restore(h); const writes = h.own.writes; const saved = await h.controller.retry();
    assert.equal(h.own.writes, writes + (['false', 'throw', 'drop'].includes(mode) ? 1 : 0));
    assert.equal(saved.receipts.filter(id => id === command.operationId).length, 1); assert.deepEqual(h.controller.state, h.own.raw());
});

for (const action of ['refresh', 'run', 'action', 'retry', 'subscription']) test(`destroy blocks new ${action} I/O including a retained subscription callback`, async () => {
    const h = fixture(); await h.controller.refresh(); const command = edit(h.store), callback = h.own.callbacks()[0]; h.controller.destroy();
    const before = snapshot(h.controller), own = counts(h.own);
    if (action === 'subscription') { callback(); await settle(); }
    else { const next = action === 'action' ? h.controller.action('add', { text: 'closed' }) : h.controller[action](command); await assert.rejects(next, { code: 'UNAVAILABLE' }); }
    sameSnapshot(h.controller, before); assert.deepEqual(counts(h.own), own); assert.equal(h.own.unsubscribes, 1);
});
for (const outcome of ['success', 'WRITE']) test(`destroy keeps dispatched ${outcome} result and pending identity without late emit`, async t => {
    const h = fixture(); await h.controller.refresh(); const gate = gateAt(h.own, 'write'), command = edit(h.store); let emits = 0;
    h.controller.subscribe(() => emits++); if (outcome === 'WRITE') h.own.mode = 'false';
    const pending = h.controller.run(command), observed = pending.catch(error => error); await gate.entered.promise; h.controller.destroy(); const before = snapshot(h.controller), count = emits;
    assert.strictEqual(h.controller.run(command), pending); assert.strictEqual(h.controller.retry(), pending); gate.release.resolve(); const result = await observed;
    if (outcome === 'WRITE') assert.equal(result.code, 'WRITE'); else assert.equal(result.records[0].text, 'original exact edit');
    assert.equal(emits, count); assert.equal(h.controller.pending, null); sameSnapshot(h.controller, { ...before, pending: null });
});

// Actual Session closures and validation; synthetic manager transport only.
async function sessionFixture() {
    const entry = { id: 'workspace_original', generation: 'generation_original', deletedAt: null }; let raw = initial();
    const manager = { chrome: { storage: { onChanged: { addListener() {} } } }, subscribe() {}, async ready() {},
        async registry() { return { lastUsedId: entry.id, workspaces: [clone(entry)] }; },
        locks: { request(name, options, action) { return Promise.resolve().then(action); } },
        async assertRestoreSettled() {}, async readBundle() { return { [tasks.KEY]: clone(raw) }; }, async writeBundle(entry, next) { raw = clone(next[tasks.KEY]); } };
    const session = new Workspaces.Session(manager, entry.id); await session.ready();
    const store = storeFor(tasks.createChromeBackend(null, null, session)), controller = new Controller(store);
    return { session, entry, store, controller, raw: () => clone(raw) };
}
for (const mode of ['suspend', 'invalidate']) test(`real Session ${mode} keeps its WORKSPACE error rather than source UNAVAILABLE`, async t => {
    const h = await sessionFixture(); t.after(() => h.controller.destroy()); await h.controller.refresh(); const command = edit(h.store), before = h.raw();
    if (mode === 'suspend') h.session.suspendWrites(); else h.entry.generation = 'generation_retired';
    const code = mode === 'suspend' ? 'WORKSPACE_SWITCH_PENDING' : 'WORKSPACE_INVALIDATED';
    await assert.rejects(h.controller.run(command), { code }); assert.equal(h.controller.error.code, code); assert.strictEqual(h.controller.retryCommand, command); assert.deepEqual(h.raw(), before);
    if (mode === 'suspend') { h.session.resumeWrites(); await h.controller.retry(); assert.equal(h.raw().records[0].text, 'original exact edit'); }
});

for (const mode of ['ack', 'verify-read', 'success']) test(`latest original committed notification publishes state without replacing ${mode} feedback`, async t => {
    const h = fixture(); t.after(() => h.controller.destroy()); await h.controller.refresh();
    const write = h.own.write;
    h.own.write = async function (value) { try { return await write.call(this, value); } finally { h.own.notify(); } };
    const delivery = holdReadDelivery(h.store), command = h.store.request('reopen', { id: 'task_0002', version: 'version_2' });
    h.own.mode = mode; const pending = h.controller.run(command), observed = pending.catch(error => error);
    await delivery.entered.promise; const result = await observed, before = snapshot(h.controller); let emitted = 0;
    h.controller.subscribe(() => emitted++);
    assert.equal(h.own.raw().records[2].state, 'active', 'the original reopening really committed');
    if (mode !== 'success') {
        assert.equal(result.code, mode === 'ack' ? 'WRITE' : 'READ'); assert.strictEqual(h.controller.error, result);
        assert.equal(h.controller.state.records[2].state, 'done', 'only the pending notification can observe the committed reopening');
    }
    delivery.release.resolve(); await settle();
    assert.deepEqual(h.controller.state, h.own.raw()); assert.equal(h.controller.state.records[2].state, 'active');
    assert.equal(emitted, 1, 'the latest same-source snapshot still reaches Undo/render listeners');
    sameSnapshot(h.controller, { ...before, state: h.controller.state });
    if (mode !== 'success') { const writes = h.own.writes; await h.controller.retry(); assert.equal(h.own.writes, writes); }
    assert.equal(h.own.raw().receipts.filter(id => id === command.operationId).length, 1);
});

test('a real queued notification READ failure cannot replace a committed but unacknowledged WRITE error', async t => {
    const h = fixture(); t.after(() => h.controller.destroy()); await h.controller.refresh();
    const write = h.own.write;
    h.own.write = async function (value) { try { return await write.call(this, value); } finally { h.own.readError = Error('actual notification read failure'); h.own.notify(); } };
    const delivery = holdReadDelivery(h.store), command = edit(h.store); h.own.mode = 'ack';
    const pending = h.controller.run(command), observed = pending.catch(error => error);
    await delivery.entered.promise; const error = await observed, before = snapshot(h.controller);
    assert.equal(error.code, 'WRITE'); assert.equal(h.own.raw().records[0].text, 'original exact edit');
    delivery.release.resolve(); await settle(); sameSnapshot(h.controller, before); assert.strictEqual(h.controller.error, error);
    assert.strictEqual(h.controller.retryCommand, command);
});
