const test = require('node:test');
const assert = require('node:assert/strict');
const tasks = require('../shared/local-tasks-store.js');
const { Controller } = require('../shared/local-tasks-controller.js');
const { deferred } = require('./helpers/task-dom-model.js');
const clone = value => structuredClone(value);
const order = state => state.records.filter(task => task.state === 'active').map(task => task.id);
function initial() {
    const states = ['done', 'active', 'removed', 'active', 'active', 'done', 'active', 'removed', 'active', 'active'];
    const records = states.map((state, i) => ({ id: `task_000${i}`, version: `version_${i}`, text: [1, 4, 9].includes(i) ? '  duplicate 中文 😀\ntext  ' : `Task ${i}`,
        state, removedFrom: state === 'removed' ? 'active' : null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' }));
    return tasks.validate({ schemaVersion: 1, revision: 4, enabled: true, records, pinnedId: 'task_0004', receipts: ['previous_1'],
        recovery: [{ id: 'recovery_1', createdAt: '2026-10-03T00:00:00.000Z', content: { records: clone(records.slice(0, 5)), pinnedId: 'task_0004' } }] });
}
// A serialized local-storage model. All reads/writes assert the existing lock;
// this is not native Chrome storage or browser evidence.
function fixture() {
    let raw = initial(), queue = Promise.resolve(), locked = false, sequence = 0; const listeners = new Set();
    const backend = {
        reads: 0, writes: 0, mode: null, nextReadFails: false, notifications: true,
        lock(fn) { const next = queue.then(async () => { assert.equal(locked, false); locked = true; try { return await fn(); } finally { locked = false; } }); queue = next.catch(() => {}); return next; },
        async read() { assert(locked); backend.reads++; if (backend.nextReadFails) { backend.nextReadFails = false; throw Error('private read failure'); } return clone(raw); },
        async write(value) {
            assert(locked); backend.writes++;
            if (backend.mode === 'false') return false;
            if (backend.mode === 'throw') throw Error('private write failure');
            if (backend.mode === 'drop') return;
            raw = clone(value); if (backend.notifications) listeners.forEach(fn => fn());
            if (backend.mode === 'ack') throw Error('private uncertain acknowledgement');
            if (backend.mode === 'readback') backend.nextReadFails = true;
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, raw: () => clone(raw)
    };
    const options = { id: () => `operation_${++sequence}`, now: () => '2026-10-17T07:00:00.000Z' };
    return { backend, store: new tasks.Store(backend, options), remote: new tasks.Store(backend, options) };
}
const command = (store, kind, task, values = {}) => store.request(kind, { id: task.id, version: task.version, ...values });
function move(h, id = 'task_0009', state = h.backend.raw()) { return command(h.store, 'moveFirst', state.records.find(task => task.id === id), { order: order(state) }); }
function unchangedRecords(before, after) {
    for (let i = 0; i < before.records.length; i++) {
        const task = before.records[i]; assert.deepEqual(after.records.find(record => record.id === task.id), task);
        if (task.state !== 'active') assert.deepEqual(after.records[i], task, `inactive slot ${i}`);
    }
    for (const key of ['schemaVersion', 'enabled', 'pinnedId', 'recovery']) assert.deepEqual(after[key], before[key], key);
}

for (const id of ['task_0009', 'task_0004']) test(`move ${id} once to list start preserves records, inactive slots, pin and recovery`, async () => {
    const h = fixture(), before = h.backend.raw(), request = move(h, id), after = await h.store.mutate(request);
    assert.deepEqual(order(after), [id, ...order(before).filter(value => value !== id)]); unchangedRecords(before, after);
    assert.equal(h.backend.writes, 1); assert.equal(h.backend.reads, 2, 'read then exact readback');
    assert.equal(after.revision, before.revision + 1); assert.deepEqual(after.receipts, [...before.receipts, request.operationId]);
    assert.deepEqual(await new tasks.Store(h.backend).read(), after, 'reload retains order');
    const exported = tasks.parseBackup(await h.store.export());
    assert.deepEqual(exported.content, { records: after.records, pinnedId: after.pinnedId }); assert.deepEqual(exported.recovery, before.recovery);
});

test('one moveFirst is equivalent to repeated adjacent upward swaps, including duplicate text', async () => {
    const h = fixture(), adjacent = fixture(), id = 'task_0009';
    const result = await h.store.mutate(move(h, id)); let previous = adjacent.backend.raw();
    while (order(previous)[0] !== id) {
        previous = await adjacent.store.mutate(command(adjacent.store, 'move', previous.records.find(task => task.id === id), { order: order(previous), direction: -1 }));
    }
    assert.deepEqual(result.records, previous.records); assert.equal(result.pinnedId, previous.pinnedId); assert.deepEqual(result.recovery, previous.recovery);
    assert.equal(h.backend.writes, 1); assert.equal(adjacent.backend.writes, 5);
    assert.equal(result.records.filter(task => task.text === result.records[1].text).length, 3);
});

test('already-first, missing/edited identities and non-active current identities fail without a write', async () => {
    const h = fixture(), before = h.backend.raw();
    const candidates = [move(h, 'task_0001'), { ...move(h), id: 'missing_1' }, { ...move(h), version: 'oldversion' }, move(h, 'task_0000'), move(h, 'task_0002')];
    for (const request of candidates) await assert.rejects(() => h.store.mutate(request), { code: 'CONFLICT' });
    assert.deepEqual(h.backend.raw(), before); assert.equal(h.backend.writes, 0);
});

test('complete active order is required, including the suffix after a middle target', async () => {
    const h = fixture(), before = h.backend.raw(), ids = order(before);
    for (const wrong of [undefined, ids.slice(0, -1), ids.slice().reverse(), [...ids, ids[0]], before.records.map(task => task.id), [...ids.slice(0, -2), ids.at(-1), ids.at(-2)]]) {
        await assert.rejects(() => h.store.mutate({ ...move(h, 'task_0004'), order: wrong }), { code: 'CONFLICT' });
    }
    assert.deepEqual(h.backend.raw(), before); assert.equal(h.backend.writes, 0);
});

for (const change of ['edit', 'complete', 'remove', 'move', 'add', 'restore']) test(`lock-wait stale ${change} conflicts before the single write`, async () => {
    const h = fixture(), before = h.backend.raw(), task = before.records.at(-1), request = move(h), gate = deferred();
    const held = h.backend.lock(() => gate.promise);
    const otherCommand = change === 'add' ? h.remote.request('add', { text: 'new task' }) :
        change === 'restore' ? command(h.remote, 'restore', before.records[2]) :
        change === 'move' ? command(h.remote, 'move', before.records[3], { order: order(before), direction: -1 }) :
        command(h.remote, change, task, { text: 'new saved text' });
    const remote = h.remote.mutate(otherCommand), local = h.store.mutate(request), rejected = assert.rejects(local, { code: 'CONFLICT' });
    gate.resolve(); await held; await remote; const latest = h.backend.raw(), writes = h.backend.writes;
    await rejected; assert.equal(h.backend.writes, writes); assert.deepEqual(h.backend.raw(), latest);
});

for (const change of ['edit-other', 'repin']) test(`unrelated ${change} survives a checked move without a global-revision restriction`, async () => {
    const h = fixture(), before = h.backend.raw(), request = move(h), other = before.records[3];
    await h.remote.mutate(change === 'edit-other' ? command(h.remote, 'edit', other, { text: 'new unrelated text' }) : command(h.remote, 'pin', other, { expectedPin: before.pinnedId }));
    const latest = h.backend.raw(), after = await h.store.mutate(request);
    unchangedRecords(latest, after); assert.deepEqual(order(after), ['task_0009', ...order(latest).filter(id => id !== 'task_0009')]); assert.equal(h.backend.writes, 2);
});

for (const [mode, code, committed] of [['false', 'WRITE', false], ['throw', 'WRITE', false], ['drop', 'VERIFY', false], ['ack', 'WRITE', true], ['readback', 'READ', true]]) test(`${mode} save failure keeps exact retry and never repeats an acknowledged rotation`, async () => {
    const h = fixture(), controller = new Controller(h.store); await controller.refresh(); h.backend.notifications = false;
    const before = h.backend.raw(), request = move(h); h.backend.mode = mode;
    await assert.rejects(() => controller.run(request), { code }); assert.equal(controller.status, 'error'); assert.equal(controller.retryCommand, request);
    if (!committed) assert.deepEqual(h.backend.raw(), before);
    else { assert.deepEqual(order(h.backend.raw()), ['task_0009', ...order(before).slice(0, -1)]); unchangedRecords(before, h.backend.raw()); }
    const writes = h.backend.writes; h.backend.mode = null; const after = await controller.retry();
    assert.equal(controller.status, 'saved'); assert.equal(controller.retryCommand, null); unchangedRecords(before, after);
    assert.equal(h.backend.writes, writes + (committed ? 0 : 1)); assert.deepEqual(order(after), ['task_0009', ...order(before).slice(0, -1)]);
    const settledWrites = h.backend.writes; assert.deepEqual(await h.store.mutate(request), after); assert.equal(h.backend.writes, settledWrites);
    controller.destroy();
});

for (const change of ['edit', 'pin', 'move', 'replace']) test(`older acknowledged moveFirst refuses retry after later ${change}`, async () => {
    const h = fixture(), before = h.backend.raw(), request = move(h), backup = await h.store.export(); h.backend.mode = 'ack';
    await assert.rejects(() => h.store.mutate(request), { code: 'WRITE' }); h.backend.mode = null;
    const state = h.backend.raw(), target = state.records.find(task => task.id === 'task_0009');
    const next = change === 'replace' ? h.remote.request('replace', await h.remote.review(backup)) :
        command(h.remote, change, target, change === 'edit' ? { text: 'new version' } : change === 'pin' ? { expectedPin: before.pinnedId } : { order: order(state), direction: 1 });
    await h.remote.mutate(next); const latest = h.backend.raw(), writes = h.backend.writes;
    await assert.rejects(() => h.store.mutate(request), { code: 'CONFLICT' }); assert.deepEqual(h.backend.raw(), latest); assert.equal(h.backend.writes, writes);
});
