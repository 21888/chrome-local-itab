const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../shared/local-tasks-store');
const { Controller } = require('../shared/local-tasks-controller');
const { deferred } = require('./helpers/task-dom-model');
const clone = value => structuredClone(value);
const now = '2026-10-17T10:00:00.000Z';
const tick = () => new Promise(resolve => setImmediate(resolve));
function seed(count = 5) {
    const state = api.initial(); state.enabled = true; state.revision = 9;
    state.records = Array.from({ length: count }, (_, index) => ({ id: `original_id_${index}`, version: `original_version_${index}`,
        text: index < 2 ? '  相同 😀\r\n<b>字面量</b>  ' : `task ${index}`, state: index < count - 1 ? 'done' : 'active', removedFrom: null,
        createdAt: now, updatedAt: now }));
    state.pinnedId = state.records.at(-1)?.id || null; return api.validate(state);
}
function fixture(value = seed()) {
    let raw = clone(value), queue = Promise.resolve(), serial = 0; const listeners = new Set();
    const b = { writes: 0, reads: 0, notifications: true,
        lock(fn) { const next = queue.then(() => { if (b.invalidated) throw api.fault('WORKSPACE_INVALIDATED'); return fn(); }); queue = next.catch(() => {}); return next; },
        async read() { b.reads++; if (b.failRead || b.readOnce) { b.readOnce = false; throw Error('read'); } return clone(raw); },
        async write(next) { b.writes++; if (b.delay) await b.delay; if (b.failWrite) return false; if (b.drop) return;
            raw = clone(next); if (b.notifications) listeners.forEach(fn => fn());
            if (b.failAfter) { b.failAfter = false; throw Error('ack lost'); }
            if (b.failVerifyRead) { b.failVerifyRead = false; b.readOnce = true; }
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, raw: () => clone(raw), seed(next) { raw = clone(next); }
    };
    const options = { id: () => `batch_reopening_${String(++serial).padStart(8, '0')}`, now: () => now };
    return { b, store: new api.Store(b, options), remote: new api.Store(b, options) };
}
const targets = records => records.map(({ id, version }) => ({ id, version }));
const command = (store, kind, task, extra = {}) => store.request(kind, { id: task.id, version: task.version, ...extra });

test('review reopening snapshots exact originals and one atomic write preserves pin, order, recovery and settings', async () => {
    const value = seed(); value.enabled = false;
    value.recovery = [{ id: 'recovery_identity', createdAt: now, content: { records: clone(value.records), pinnedId: value.pinnedId } }];
    const { store, b } = fixture(value), before = b.raw(), selected = targets(before.records.slice(0, 2));
    const pending = store.reviewReopening(selected); selected[0].id = 'mutated_selection'; selected.pop();
    const review = await pending;
    assert.equal(review.command.kind, 'reopenBatch'); assert.equal(review.count, 2); assert.equal(review.clearsPin, false);
    assert.equal(review.revision, before.revision); assert.equal(review.command.revision, before.revision);
    assert.deepEqual(review.records, before.records.slice(0, 2));
    for (const object of [review, review.records, ...review.records, review.command, review.command.targets, ...review.command.targets]) assert(Object.isFrozen(object));
    assert.equal(b.writes, 0); assert.deepEqual(b.raw(), before);
    const saved = await store.mutate(review.command);
    assert.equal(b.writes, 1); assert.equal(saved.revision, before.revision + 1); assert.deepEqual(saved.receipts, [review.command.operationId]);
    assert.equal(saved.enabled, before.enabled); assert.equal(saved.pinnedId, before.pinnedId); assert.deepEqual(saved.recovery, before.recovery);
    assert.deepEqual(saved.records.slice(2), before.records.slice(2)); assert.deepEqual(saved.records.map(t => t.id), before.records.map(t => t.id));
    for (let i = 0; i < 2; i++) assert.deepEqual(saved.records[i], { ...before.records[i], state: 'active', version: review.command.targets[i].nextVersion, updatedAt: review.command.updatedAt });
    assert.deepEqual(Object.keys(saved).sort(), Object.keys(api.initial()).sort());
    assert.deepEqual(await store.mutate(review.command), saved); assert.equal(b.writes, 1);
});

test('optional revision is copied exactly and validated without coercion, while revision-free Undo stays compatible', async () => {
    const { store, remote, b } = fixture(), selected = targets(b.raw().records.slice(0, 2));
    for (const revision of [undefined, null, '9', -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => store.request('reopenBatch', { targets: selected, revision }), { code: 'INVALID' });
        const raw = { ...store.request('reopenBatch', { targets: selected }), revision };
        await assert.rejects(() => store.mutate(raw), { code: 'INVALID' });
    }
    assert.equal(b.writes, 0);
    const reviewed = store.request('reopenBatch', { targets: selected, revision: 9 });
    const undo = store.request('reopenBatch', { targets: selected }); assert(!Object.hasOwn(undo, 'revision'));
    selected[0].version = 'changed_version'; assert.equal(reviewed.targets[0].version, 'original_version_0');
    await remote.mutate(command(remote, 'edit', b.raw().records[3], { text: 'unrelated newer original' }));
    await remote.mutate(command(remote, 'pin', b.raw().records[4], { expectedPin: b.raw().pinnedId }));
    const before = b.raw(); await assert.rejects(() => store.mutate(reviewed), { code: 'CONFLICT' }); assert.equal(b.writes, 2);
    const saved = await store.mutate(undo); assert.equal(b.writes, 3); assert.equal(saved.pinnedId, before.pinnedId);
    assert.deepEqual(saved.records.slice(2), before.records.slice(2)); assert(saved.records.slice(0, 2).every(t => t.state === 'active'));
});

test('empty, duplicate, malformed and oversized selections never create a review or write', async () => {
    const { store, b } = fixture(), target = targets(b.raw().records)[0];
    for (const selected of [[], [target, target], [{ id: 'bad', version: 'bad' }], [{ ...target, text: 'extra' }], Array(501).fill(target)]) {
        assert.throws(() => store.request('reopenBatch', { targets: selected, revision: 9 }), { code: 'INVALID' });
        await assert.rejects(() => store.reviewReopening(selected), { code: 'INVALID' });
    }
    assert.equal(b.writes, 0);
});

for (const state of ['active', 'removed', 'missing', 'changed']) test(`read-only reopening review refuses a ${state} selected member`, async () => {
    const { store, b } = fixture(), selected = targets(b.raw().records.slice(0, 2)), value = b.raw();
    if (state === 'missing') value.records.splice(1, 1);
    else if (state === 'changed') value.records[1].version = 'changed_remote_version';
    else { value.records[1].state = state; value.records[1].removedFrom = state === 'removed' ? 'done' : null; }
    b.seed(value); await assert.rejects(() => store.reviewReopening(selected), { code: 'CONFLICT' }); assert.equal(b.writes, 0);
});

for (const change of ['edit', 'remove', 'reopen', 'pin', 'unselected-edit', 'replace']) test(`reviewed reopening waits for the lock and refuses newer ${change} with zero additional writes`, async () => {
    const { store, remote, b } = fixture(), before = b.raw(), review = await store.reviewReopening(targets(before.records.slice(0, 2)));
    const gate = deferred(), held = b.lock(() => gate.promise); let cmd;
    if (change === 'replace') cmd = remote.request('replace', { revision: before.revision, source: JSON.stringify({ format: api.FORMAT, schemaVersion: 1, exportedAt: now, content: { records: before.records, pinnedId: before.pinnedId }, recovery: [] }) });
    else if (change === 'pin') cmd = command(remote, 'pin', before.records[4], { expectedPin: before.pinnedId });
    else cmd = command(remote, change === 'unselected-edit' ? 'edit' : change, before.records[change === 'unselected-edit' ? 3 : 0], { text: 'new remote text' });
    const changed = remote.mutate(cmd), pending = store.mutate(review.command), rejected = assert.rejects(pending, { code: 'CONFLICT' });
    gate.resolve(); await held; const latest = await changed; await rejected; assert.equal(b.writes, 1); assert.deepEqual(b.raw(), latest);
});

test('workspace invalidation while waiting for the shared lock prevents reopening', async () => {
    const { store, b } = fixture(), review = await store.reviewReopening(targets(b.raw().records.slice(0, 2)));
    const gate = deferred(), held = b.lock(() => gate.promise); await tick();
    const result = store.mutate(review.command), rejected = assert.rejects(result, { code: 'WORKSPACE_INVALIDATED' });
    b.invalidated = true; gate.resolve(); await held; await rejected; assert.equal(b.writes, 0);
});

for (const [failure, code, persisted] of [['failRead', 'READ', false], ['failWrite', 'WRITE', false], ['drop', 'VERIFY', false], ['failAfter', 'WRITE', true], ['failVerifyRead', 'READ', true]]) test(`Controller retains reviewed reopening command through ${failure} and acknowledges only an explicit exact retry`, async () => {
    const { store, b } = fixture(), controller = new Controller(store); await controller.refresh();
    const review = await store.reviewReopening(targets(b.raw().records.slice(0, 2))), before = b.raw(); b[failure] = true;
    await assert.rejects(() => controller.run(review.command), { code }); assert.strictEqual(controller.retryCommand, review.command);
    assert.equal(b.raw().revision, before.revision + (persisted ? 1 : 0)); const writes = b.writes; await tick(); assert.equal(b.writes, writes);
    b[failure] = false; const saved = await controller.retry(); assert.equal(saved.revision, before.revision + 1);
    assert.equal(saved.receipts.filter(id => id === review.command.operationId).length, 1);
    assert(saved.records.slice(0, 2).every(t => t.state === 'active')); assert.equal(b.writes, writes + (persisted ? 0 : 1)); controller.destroy();
});

test('later and expired receipts cannot replay reviewed reopening', async () => {
    const { store, b } = fixture(), review = await store.reviewReopening(targets(b.raw().records.slice(0, 2)));
    await store.mutate(review.command); await store.mutate(store.request('enable', { enabled: true }));
    await assert.rejects(() => store.mutate(review.command), { code: 'CONFLICT' }); assert.equal(b.writes, 2);
    // Synthetic valid later history exercises the bounded receipt protocol without a stress loop.
    const later = b.raw(); later.revision += 128; later.receipts = Array.from({ length: 128 }, (_, i) => `later_receipt_${i}`); b.seed(later);
    await assert.rejects(() => store.mutate(review.command), { code: 'CONFLICT' }); assert.deepEqual(b.raw(), later); assert.equal(b.writes, 2);
});

test('a latest receipt cannot acknowledge partial reopening after failed full readback', async () => {
    const { store, b } = fixture(), before = b.raw(), review = await store.reviewReopening(targets(before.records.slice(0, 2))), write = b.write;
    b.write = async next => { await write(next); const partial = b.raw(); partial.records[1] = before.records[1]; b.seed(partial); };
    await assert.rejects(() => store.mutate(review.command), { code: 'VERIFY' }); const partial = b.raw();
    await assert.rejects(() => store.mutate(review.command), { code: 'CONFLICT' }); assert.equal(b.writes, 1); assert.deepEqual(b.raw(), partial);
});

test('500 completed records reopen in place without freeing capacity or exceeding the validated snapshot', async () => {
    const value = seed(500); value.records.forEach(t => { t.state = 'done'; }); value.pinnedId = null;
    const { store, b } = fixture(value), review = await store.reviewReopening(targets(value.records)), saved = await store.mutate(review.command);
    assert.equal(saved.records.length, 500); assert(saved.records.every(t => t.state === 'active')); assert.equal(b.writes, 1);
    assert.deepEqual(saved.records.map(t => t.text), value.records.map(t => t.text));
    await assert.rejects(() => store.mutate(store.request('add', { text: 'no free slot' })), { code: 'CAPACITY' }); assert.equal(b.writes, 1);
});

test('review checks next revision capacity and complete metadata byte budget without writing', async () => {
    const value = seed(); value.revision = Number.MAX_SAFE_INTEGER; const invalid = fixture(value);
    await assert.rejects(() => invalid.store.reviewReopening(targets(value.records.slice(0, 2))), { code: 'INVALID' }); assert.equal(invalid.b.writes, 0);
    const full = seed(500); full.recovery = Array.from({ length: 8 }, (_, i) => ({ id: `recovery_id_${i}`, createdAt: now,
        content: { records: seed(250).records.map(t => ({ ...t, text: 'x' })), pinnedId: null } }));
    let remaining = api.LIMITS.bytes - 4096 - new TextEncoder().encode(JSON.stringify(full)).length;
    for (const task of full.recovery.flatMap(item => item.content.records)) { const n = Math.min(999, remaining); task.text += 'x'.repeat(n); remaining -= n; }
    assert.equal(remaining, 0); const { store, b } = fixture(api.validate(full));
    await assert.rejects(() => store.reviewReopening(targets(full.records.slice(0, 499))), { code: 'SIZE_LIMIT' }); assert.equal(b.writes, 0);
});
