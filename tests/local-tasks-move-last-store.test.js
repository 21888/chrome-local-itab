const test = require('node:test');
const assert = require('node:assert/strict');
const tasks = require('../shared/local-tasks-store.js');
const { Controller } = require('../shared/local-tasks-controller.js');
const { deferred } = require('./helpers/task-dom-model.js');
const clone = value => structuredClone(value);
const order = state => state.records.filter(task => task.state === 'active').map(task => task.id);
const now = '2026-10-17T21:00:00.000Z';
const duplicateText = '  duplicate 中文 😀\r\n<b>literal</b>\ntext  ';
const mixedStates = ['done', 'active', 'removed', 'active', 'active', 'done', 'active', 'removed', 'active', 'active', 'done', 'removed'];
function initial(states = mixedStates) {
    const records = states.map((state, index) => ({ id: `task_${String(index).padStart(4, '0')}`, version: `version_${index}`,
        text: [1, 4, 9].includes(index) ? duplicateText : `Task ${index}`, state, removedFrom: state === 'removed' ? 'active' : null,
        createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' }));
    const pinnedId = records.find(task => task.id === 'task_0004' && task.state === 'active')?.id || records.find(task => task.state === 'active')?.id || null;
    const recoveryRecords = clone(records.slice(0, 5));
    return tasks.validate({ schemaVersion: 1, revision: 4, enabled: true, records, pinnedId, receipts: ['previous_1'],
        recovery: [{ id: 'recovery_1', createdAt: '2026-10-03T00:00:00.000Z', content: {
            records: recoveryRecords, pinnedId: recoveryRecords.some(task => task.id === pinnedId) ? pinnedId : null
        } }] });
}
// Serialized storage is a deterministic model, not native Chrome/browser evidence.
// Both mutation reads and the exact readback must remain in the same held lock.
function fixture(value = initial()) {
    let raw = clone(value), queue = Promise.resolve(), locked = false, sequence = 0;
    const listeners = new Set();
    const backend = {
        reads: 0, writes: 0, trace: [], mode: null, nextReadFails: false, notifications: true, invalidated: false,
        lock(fn) {
            const next = queue.then(async () => {
                if (backend.invalidated) throw tasks.fault('WORKSPACE_INVALIDATED');
                assert.equal(locked, false); locked = true;
                try { return await fn(); } finally { locked = false; }
            });
            queue = next.catch(() => {}); return next;
        },
        async read() {
            assert(locked); backend.reads++; backend.trace.push('read');
            if (backend.nextReadFails) { backend.nextReadFails = false; throw Error('synthetic read failure'); }
            return clone(raw);
        },
        async write(value) {
            assert(locked); backend.writes++; backend.trace.push('write');
            if (backend.mode === 'false') return false;
            if (backend.mode === 'throw') throw Error('synthetic write failure');
            if (backend.mode === 'drop') return;
            raw = clone(value);
            if (backend.mode === 'corrupt-record') raw.records[0].updatedAt = '2026-10-16T12:00:00.000Z';
            if (backend.notifications) listeners.forEach(fn => fn());
            if (backend.mode === 'ack') throw Error('synthetic lost acknowledgement');
            if (backend.mode === 'readback') backend.nextReadFails = true;
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        raw: () => clone(raw), seed(value) { raw = clone(tasks.validate(value)); }
    };
    const options = { id: () => `operation_${++sequence}`, now: () => now };
    return { backend, store: new tasks.Store(backend, options), remote: new tasks.Store(backend, options) };
}
const command = (store, kind, task, values = {}) => store.request(kind, { id: task.id, version: task.version, ...values });
function move(h, id = 'task_0004', state = h.backend.raw()) {
    return command(h.store, 'moveLast', state.records.find(task => task.id === id), { order: order(state) });
}
const movedOrder = (state, id) => [...order(state).filter(value => value !== id), id];
function unchangedRecords(before, after) {
    assert.equal(after.records.length, before.records.length);
    const byId = new Map(after.records.map(task => [task.id, task]));
    assert.equal(byId.size, before.records.length);
    before.records.forEach((task, index) => {
        assert.deepEqual(byId.get(task.id), task, `unchanged complete record ${task.id}`);
        if (task.state !== 'active') assert.deepEqual(after.records[index], task, `inactive absolute slot ${index}`);
    });
    for (const key of ['schemaVersion', 'enabled', 'pinnedId', 'recovery']) assert.deepEqual(after[key], before[key], key);
    assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
}
function singleMove(before, after, request) {
    assert.deepEqual(order(after), movedOrder(before, request.id)); unchangedRecords(before, after);
    assert.equal(after.revision, before.revision + 1);
    assert.deepEqual(after.receipts, [...before.receipts, request.operationId].slice(-128));
    assert.equal(after.receipts.filter(id => id === request.operationId).length, 1);
}
async function holdLock(h) {
    const gate = deferred(), entered = deferred();
    const held = h.backend.lock(() => { entered.resolve(); return gate.promise; });
    await entered.promise; return { gate, held };
}
function backup(state) {
    return JSON.stringify({ format: tasks.FORMAT, schemaVersion: 1, exportedAt: now,
        content: { records: state.records, pinnedId: state.pinnedId }, recovery: state.recovery });
}

for (const [layout, states] of [['interleaved', mixedStates], ['contiguous', Array(6).fill('active')]]) {
    const value = initial(states), ids = order(value);
    for (const [index, id] of ids.entries()) test(`${layout} active position ${index + 1}/${ids.length} rotates only its suffix once`, async () => {
        const h = fixture(value), before = h.backend.raw(), request = move(h, id);
        if (index === ids.length - 1) {
            await assert.rejects(() => h.store.mutate(request), { code: 'CONFLICT' });
            assert.deepEqual(h.backend.raw(), before); assert.equal(h.backend.writes, 0); assert.deepEqual(h.backend.trace, ['read']);
            return;
        }
        const after = await h.store.mutate(request); singleMove(before, after, request);
        assert.deepEqual(order(after).slice(0, index), ids.slice(0, index), 'active prefix stays in place');
        assert.equal(h.backend.writes, 1); assert.equal(h.backend.reads, 2); assert.deepEqual(h.backend.trace, ['read', 'write', 'read']);
        assert.deepEqual(await new tasks.Store(h.backend).read(), after, 'fresh Store reload');
        const exported = tasks.parseBackup(await h.store.export());
        assert.deepEqual(exported.content, { records: after.records, pinnedId: after.pinnedId });
        assert.deepEqual(exported.recovery, before.recovery);
    });
}

for (const id of ['task_0001', 'task_0004', 'task_0008']) test(`moveLast ${id} equals repeated adjacent downward swaps without changing duplicate Unicode text`, async () => {
    const direct = fixture(), adjacent = fixture(), before = direct.backend.raw();
    const after = await direct.store.mutate(move(direct, id)); let previous = adjacent.backend.raw(), swaps = 0;
    while (order(previous).at(-1) !== id) {
        previous = await adjacent.store.mutate(command(adjacent.store, 'move', previous.records.find(task => task.id === id), { order: order(previous), direction: 1 }));
        swaps++;
    }
    assert.deepEqual(after.records, previous.records); assert.equal(after.pinnedId, previous.pinnedId); assert.deepEqual(after.recovery, previous.recovery);
    unchangedRecords(before, after); assert.equal(direct.backend.writes, 1);
    assert.equal(swaps, order(before).length - order(before).indexOf(id) - 1); assert.equal(adjacent.backend.writes, swaps);
    assert.equal(after.records.filter(task => task.text === duplicateText).length, 3);
});

test('missing, stale-version, done and removed targets conflict without writing', async () => {
    const h = fixture(), before = h.backend.raw();
    for (const request of [{ ...move(h), id: 'missing_1' }, { ...move(h), id: undefined }, { ...move(h), version: 'old_version' },
        { ...move(h), version: undefined }, move(h, 'task_0000'), move(h, 'task_0002')]) {
        await assert.rejects(() => h.store.mutate(request), { code: 'CONFLICT' });
    }
    assert.deepEqual(h.backend.raw(), before); assert.equal(h.backend.writes, 0);
});

test('one active record is already last even when surrounded by inactive records', async () => {
    const h = fixture(initial(['done', 'removed', 'active', 'done', 'removed'])), before = h.backend.raw();
    await assert.rejects(() => h.store.mutate(move(h, 'task_0002')), { code: 'CONFLICT' });
    assert.equal(h.backend.writes, 0); assert.deepEqual(h.backend.raw(), before);
});

test('the entire exact active ID order is required, including the unchanged prefix before a middle target', async () => {
    const h = fixture(), before = h.backend.raw(), ids = order(before);
    const wrongOrders = [undefined, null, [], ids.slice(1), ids.slice(0, -1), ids.slice().reverse(), [...ids, ids[0]],
        before.records.map(task => task.id), JSON.stringify(ids), [ids[1], ids[0], ...ids.slice(2)],
        [...ids.slice(0, -2), ids.at(-1), ids.at(-2)], [...ids.slice(0, -1), 'missing_1']];
    for (const wrong of wrongOrders) await assert.rejects(() => h.store.mutate({ ...move(h), order: wrong }), { code: 'CONFLICT' });
    assert.deepEqual(h.backend.raw(), before); assert.equal(h.backend.writes, 0);
});

for (const change of ['edit', 'complete', 'remove', 'add', 'reopen', 'restore', 'move', 'moveFirst', 'moveLast', 'replace', 'recover']) {
    test(`lock-wait ${change} is checked against the latest target and complete active order before any local write`, async () => {
        const h = fixture(), before = h.backend.raw(), target = before.records[4], request = move(h), { gate, held } = await holdLock(h);
        let other;
        if (change === 'add') other = h.remote.request('add', { text: 'synthetic new task' });
        else if (change === 'reopen') other = command(h.remote, change, before.records[0]);
        else if (change === 'restore') other = command(h.remote, change, before.records[2]);
        else if (change === 'move' || change === 'moveFirst') other = command(h.remote, change, before.records[3], { order: order(before), direction: -1 });
        else if (change === 'moveLast') other = command(h.remote, change, before.records[1], { order: order(before) });
        else if (change === 'replace') other = h.remote.request(change, { source: backup(before), revision: before.revision });
        else if (change === 'recover') other = h.remote.request(change, { id: before.recovery[0].id, revision: before.revision });
        else other = command(h.remote, change, target, { text: 'synthetic newer target text' });
        const remote = h.remote.mutate(other), local = h.store.mutate(request), rejected = assert.rejects(local, { code: 'CONFLICT' });
        assert.equal(h.backend.reads, 0); assert.equal(h.backend.writes, 0);
        gate.resolve(); await held; const latest = await remote; await rejected;
        assert.equal(h.backend.writes, 1); assert.deepEqual(h.backend.raw(), latest);
        assert.deepEqual(h.backend.trace, ['read', 'write', 'read', 'read']);
    });
}

test('workspace invalidation while queued prevents the move before its first read or write', async () => {
    const h = fixture(), before = h.backend.raw(), request = move(h), { gate, held } = await holdLock(h);
    const pending = h.store.mutate(request), rejected = assert.rejects(pending, { code: 'WORKSPACE_INVALIDATED' });
    h.backend.invalidated = true; gate.resolve(); await held; await rejected;
    assert.equal(h.backend.reads, 0); assert.equal(h.backend.writes, 0); assert.deepEqual(h.backend.raw(), before);
});

for (const change of ['edit-other-active', 'edit-other-done', 'repin']) test(`queued unrelated ${change} survives moveLast without a global revision restriction`, async () => {
    const h = fixture(), before = h.backend.raw(), request = move(h), { gate, held } = await holdLock(h);
    const other = before.records[change === 'edit-other-done' ? 0 : 3];
    const mutation = change === 'repin' ? command(h.remote, 'pin', other, { expectedPin: before.pinnedId }) :
        command(h.remote, 'edit', other, { text: '  newer unrelated 中文 😀\ntext  ' });
    const remote = h.remote.mutate(mutation), local = h.store.mutate(request);
    gate.resolve(); await held; const latest = await remote, after = await local;
    singleMove(latest, after, request); assert.equal(h.backend.writes, 2);
    assert.deepEqual(h.backend.trace, ['read', 'write', 'read', 'read', 'write', 'read']);
});

for (const [mode, code, committed] of [['initial-read', 'READ', false], ['false', 'WRITE', false], ['throw', 'WRITE', false],
    ['drop', 'VERIFY', false], ['ack', 'WRITE', true], ['readback', 'READ', true]]) {
    test(`${mode} failure retains the exact Controller command; explicit retry performs at most one total rotation`, async () => {
        const h = fixture(), controller = new Controller(h.store); await controller.refresh(); h.backend.notifications = false;
        const before = h.backend.raw(), request = move(h); h.backend.mode = mode;
        if (mode === 'initial-read') h.backend.nextReadFails = true;
        await assert.rejects(() => controller.run(request), { code });
        assert.equal(controller.status, 'error'); assert.equal(controller.error.code, code); assert.strictEqual(controller.retryCommand, request);
        assert.strictEqual(controller.pending, null); assert.deepEqual(controller.state, before);
        if (committed) singleMove(before, h.backend.raw(), request); else assert.deepEqual(h.backend.raw(), before);
        if (mode === 'initial-read') assert.equal(h.backend.writes, 0);
        const writes = h.backend.writes; await Promise.resolve(); assert.equal(h.backend.writes, writes, 'no automatic retry');
        h.backend.mode = null; const after = await controller.retry();
        assert.equal(controller.status, 'saved'); assert.equal(controller.error, null); assert.equal(controller.retryCommand, null);
        assert.equal(h.backend.writes, writes + (committed ? 0 : 1)); singleMove(before, after, request);
        const settledWrites = h.backend.writes; assert.deepEqual(await h.store.mutate(request), after);
        assert.equal(h.backend.writes, settledWrites, 'latest receipt acknowledges without repeating the rotation');
        controller.destroy();
    });
}

test('exact readback rejects altered record metadata even when revision, receipt and active order match', async () => {
    const h = fixture(), controller = new Controller(h.store); await controller.refresh(); h.backend.notifications = false;
    const before = h.backend.raw(), request = move(h); h.backend.mode = 'corrupt-record';
    await assert.rejects(() => controller.run(request), { code: 'VERIFY' });
    const persisted = h.backend.raw(); assert.deepEqual(order(persisted), movedOrder(before, request.id));
    assert.equal(persisted.revision, before.revision + 1); assert.equal(persisted.receipts.at(-1), request.operationId);
    assert.notDeepEqual(persisted.records.find(task => task.id === before.records[0].id), before.records[0]);
    assert.equal(h.backend.writes, 1); assert.equal(controller.status, 'error'); assert.strictEqual(controller.retryCommand, request);
    assert.deepEqual(controller.state, before); controller.destroy();
});

for (const change of ['edit', 'pin', 'move', 'moveFirst', 'moveLast', 'replace', 'recover']) {
    test(`an uncertain acknowledged moveLast refuses exact retry after a later ${change} receipt`, async () => {
        const h = fixture(), before = h.backend.raw(), request = move(h); h.backend.mode = 'ack';
        await assert.rejects(() => h.store.mutate(request), { code: 'WRITE' }); h.backend.mode = null;
        const state = h.backend.raw(), target = state.records.find(task => task.id === request.id); let next;
        if (change === 'replace') next = h.remote.request(change, { source: backup(before), revision: state.revision });
        else if (change === 'recover') next = h.remote.request(change, { id: state.recovery[0].id, revision: state.revision });
        else if (change === 'moveLast') next = command(h.remote, change, state.records.find(task => task.id === order(state)[0]), { order: order(state) });
        else next = command(h.remote, change, target, change === 'edit' ? { text: 'synthetic later edit' } :
            change === 'pin' ? { expectedPin: state.pinnedId } : { order: order(state), direction: -1 });
        await h.remote.mutate(next); const latest = h.backend.raw(), writes = h.backend.writes;
        await assert.rejects(() => h.store.mutate(request), { code: 'CONFLICT' });
        assert.deepEqual(h.backend.raw(), latest); assert.equal(h.backend.writes, writes);
    });
}

test('the bounded receipt list appends once and an expired move cannot rotate the already-last target again', async () => {
    const value = initial(); value.receipts = Array.from({ length: 128 }, (_, index) => `previous_receipt_${index}`);
    const h = fixture(value), before = h.backend.raw(), request = move(h), after = await h.store.mutate(request);
    singleMove(before, after, request); assert.equal(after.receipts.length, 128); assert.equal(after.receipts[0], 'previous_receipt_1');
    // A synthetic valid later history tests expiry without a large mutation loop.
    const later = clone(after); later.revision += 128; later.receipts = Array.from({ length: 128 }, (_, index) => `later_receipt_${index}`); h.backend.seed(later);
    await assert.rejects(() => h.store.mutate(request), { code: 'CONFLICT' });
    assert.equal(h.backend.writes, 1); assert.deepEqual(h.backend.raw(), later);
});

for (const layout of ['contiguous', 'interleaved']) test(`500-record ${layout} boundary preserves every record at first, middle and penultimate targets`, async () => {
    const states = Array.from({ length: 500 }, (_, index) => layout === 'contiguous' ? 'active' : ['done', 'active', 'removed', 'active'][index % 4]);
    const value = initial(states), ids = order(value);
    for (const index of [0, Math.floor(ids.length / 2), ids.length - 2]) {
        const h = fixture(value), before = h.backend.raw(), request = move(h, ids[index]), after = await h.store.mutate(request);
        singleMove(before, after, request); assert.equal(after.records.length, 500); assert.equal(h.backend.writes, 1); assert.equal(h.backend.reads, 2);
        await assert.rejects(() => h.store.mutate(h.store.request('add', { text: 'synthetic over-capacity task' })), { code: 'CAPACITY' });
        assert.equal(h.backend.writes, 1); assert.deepEqual(h.backend.raw(), after);
    }
    const last = fixture(value), before = last.backend.raw();
    await assert.rejects(() => last.store.mutate(move(last, ids.at(-1))), { code: 'CONFLICT' });
    assert.equal(last.backend.writes, 0); assert.deepEqual(last.backend.raw(), before);
});
