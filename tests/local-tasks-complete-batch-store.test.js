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
        text: index < 2 ? '  相同 😀\r\n<b>字面量</b>  ' : `task ${index}`, state: 'active', removedFrom: null,
        createdAt: now, updatedAt: now }));
    state.pinnedId = state.records[0]?.id || null; return api.validate(state);
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
    const options = { id: () => `batch_complete_${String(++serial).padStart(8, '0')}`, now: () => now };
    return { b, store: new api.Store(b, options), remote: new api.Store(b, options) };
}
const targets = records => records.map(({ id, version }) => ({ id, version }));
const command = (store, kind, task, extra = {}) => store.request(kind, { id: task.id, version: task.version, ...extra });

test('review completion is read-only, frozen, exact, and one atomic save changes only chosen active records', async () => {
    const { store, b } = fixture(), before = b.raw(), selection = targets(before.records.slice(0, 2));
    const pending = store.reviewCompletion(selection); selection[0].id = 'changed_selection'; const review = await pending;
    assert.deepEqual(review.records.map(t => t.text), before.records.slice(0, 2).map(t => t.text));
    assert.equal(review.count, 2); assert.equal(review.clearsPin, true); assert.equal(review.revision, before.revision);
    assert(Object.isFrozen(review)); assert(Object.isFrozen(review.records)); assert(review.records.every(Object.isFrozen));
    assert(Object.isFrozen(review.command)); assert(Object.isFrozen(review.command.targets)); assert(review.command.targets.every(Object.isFrozen));
    assert.deepEqual(b.raw(), before); assert.equal(b.writes, 0);
    const saved = await store.mutate(review.command);
    assert.equal(b.writes, 1); assert.equal(saved.revision, before.revision + 1); assert.deepEqual(saved.receipts, [review.command.operationId]);
    assert.equal(saved.pinnedId, null); assert.deepEqual(saved.records.slice(2), before.records.slice(2));
    for (let i = 0; i < 2; i++) assert.deepEqual(saved.records[i], { ...before.records[i], state: 'done', version: review.command.targets[i].nextVersion, updatedAt: review.command.updatedAt });
    assert.deepEqual(await store.mutate(review.command), saved); assert.equal(b.writes, 1);
});

test('request snapshots nested identities and refuses empty, duplicate, malformed or oversized targets', async () => {
    const { store, b } = fixture(), picked = targets(b.raw().records.slice(0, 2));
    const cmd = store.request('completeBatch', { targets: picked, revision: 9 }); picked[0].version = 'mutated_version'; picked.pop();
    assert.equal(cmd.targets.length, 2); assert.equal(cmd.targets[0].version, 'original_version_0');
    assert(Object.isFrozen(cmd.targets[0])); assert(Object.isFrozen(cmd.targets)); assert(Object.isFrozen(cmd));
    for (const selection of [[], [targets(b.raw().records)[0], targets(b.raw().records)[0]], [{ id: 'bad', version: 'bad' }],
        [{ ...targets(b.raw().records)[0], text: 'extra' }], Array(501).fill(targets(b.raw().records)[0])]) {
        assert.throws(() => store.request('completeBatch', { targets: selection, revision: 9 }), { code: 'INVALID' });
        await assert.rejects(() => store.reviewCompletion(selection), { code: 'INVALID' });
    }
    assert.equal(b.writes, 0);
});

test('an unselected pin, task order, recovery, enabled flag and original text survive completion', async () => {
    const value = seed(); value.pinnedId = value.records[3].id; value.enabled = false;
    value.recovery = [{ id: 'recovery_identity', createdAt: now, content: { records: clone(value.records), pinnedId: value.pinnedId } }];
    const { store, b } = fixture(value), review = await store.reviewCompletion(targets(value.records.slice(0, 2)));
    assert.equal(review.clearsPin, false); const saved = await store.mutate(review.command);
    assert.equal(saved.pinnedId, value.pinnedId); assert.equal(saved.enabled, false); assert.deepEqual(saved.recovery, value.recovery);
    assert.deepEqual(saved.records.map(t => t.id), value.records.map(t => t.id)); assert.deepEqual(saved.records.map(t => t.text), value.records.map(t => t.text));
    assert.equal(b.writes, 1); assert.deepEqual(Object.keys(saved).sort(), Object.keys(api.initial()).sort());
});

for (const change of ['edit', 'complete', 'remove', 'moveFirst', 'pin', 'unselected-edit', 'replace']) test(`lock-waiting confirmation rejects ${change} with zero additional writes`, async () => {
    const { store, remote, b } = fixture(), before = b.raw();
    const review = await store.reviewCompletion(targets(before.records.slice(0, 2))), gate = deferred();
    const held = b.lock(() => gate.promise); let mutation;
    if (change === 'replace') mutation = remote.request('replace', { revision: before.revision, source: JSON.stringify({ format: api.FORMAT, schemaVersion: 1, exportedAt: now, content: { records: before.records, pinnedId: before.pinnedId }, recovery: [] }) });
    else if (change === 'moveFirst') mutation = command(remote, change, before.records[1], { order: before.records.map(t => t.id) });
    else if (change === 'pin') mutation = command(remote, change, before.records[3], { expectedPin: before.pinnedId });
    else mutation = command(remote, change === 'unselected-edit' ? 'edit' : change, before.records[change === 'unselected-edit' ? 3 : 0], { text: 'remote change' });
    const changed = remote.mutate(mutation), saved = store.mutate(review.command);
    const rejected = assert.rejects(saved, { code: 'CONFLICT' }); gate.resolve(); await held; const latest = await changed; await rejected;
    assert.deepEqual(b.raw(), latest); assert.equal(b.writes, 1);
});

test('workspace invalidation while waiting for the same lock prevents a reviewed completion', async () => {
    const { store, b } = fixture(), review = await store.reviewCompletion(targets(b.raw().records.slice(0, 2)));
    const gate = deferred(), held = b.lock(() => gate.promise); await tick();
    const result = store.mutate(review.command), rejected = assert.rejects(result, { code: 'WORKSPACE_INVALIDATED' });
    b.invalidated = true; gate.resolve(); await held; await rejected; assert.equal(b.writes, 0);
});

for (const state of ['done', 'removed', 'missing', 'changed']) test(`review refuses a selected ${state} identity without any write`, async () => {
    const { store, b } = fixture(), selected = targets(b.raw().records.slice(0, 2)), next = b.raw();
    if (state === 'missing') next.records.splice(1, 1);
    else if (state === 'changed') next.records[1].version = 'remote_version_changed';
    else { next.records[1].state = state; next.records[1].removedFrom = state === 'removed' ? 'active' : null; }
    b.seed(next); await assert.rejects(() => store.reviewCompletion(selected), { code: 'CONFLICT' }); assert.equal(b.writes, 0);
});

for (const [failure, code, persisted] of [['failRead', 'READ', false], ['failWrite', 'WRITE', false], ['drop', 'VERIFY', false], ['failAfter', 'WRITE', true], ['failVerifyRead', 'READ', true]]) test(`Controller preserves the exact immutable batch through ${code}/${failure} and retries only explicitly`, async () => {
    const { store, b } = fixture(), controller = new Controller(store); await controller.refresh();
    const review = await store.reviewCompletion(targets(b.raw().records.slice(0, 2))), before = b.raw(); b[failure] = true;
    await assert.rejects(() => controller.run(review.command), { code }); assert.strictEqual(controller.retryCommand, review.command);
    assert.equal(b.raw().revision, before.revision + (persisted ? 1 : 0)); const writes = b.writes; await tick(); await tick(); assert.equal(b.writes, writes);
    b[failure] = false; const saved = await controller.retry(); assert.equal(saved.revision, before.revision + 1);
    assert.equal(saved.receipts.filter(id => id === review.command.operationId).length, 1); assert.equal(saved.records.filter(t => t.state === 'done').length, 2);
    assert.equal(b.writes, writes + (persisted ? 0 : 1)); assert.equal(controller.retryCommand, null); controller.destroy();
});

test('a later receipt or an expired receipt cannot replay old completion after reopening the members', async () => {
    const { store, b } = fixture(), review = await store.reviewCompletion(targets(b.raw().records.slice(0, 2)));
    const done = await store.mutate(review.command), reopen = store.request('reopenBatch', { targets: targets(done.records.slice(0, 2)) });
    await store.mutate(reopen); let before = b.raw(), writes = b.writes;
    await assert.rejects(() => store.mutate(review.command), { code: 'CONFLICT' }); assert.equal(b.writes, writes); assert.deepEqual(b.raw(), before);
    for (let i = 0; i < 128; i++) await store.mutate(store.request('enable', { enabled: Boolean(i % 2) }));
    assert.equal(b.raw().receipts.length, 128); assert(!b.raw().receipts.includes(review.command.operationId));
    before = b.raw(); writes = b.writes; await assert.rejects(() => store.mutate(review.command), { code: 'CONFLICT' });
    assert.equal(b.writes, writes); assert.deepEqual(b.raw(), before);
});

test('whole-batch Undo allows unrelated edits and a newer pin without restoring the old pin', async () => {
    const { store, remote, b } = fixture(), review = await store.reviewCompletion(targets(b.raw().records.slice(0, 2)));
    const done = await store.mutate(review.command), selected = targets(done.records.slice(0, 2));
    const undo = store.request('reopenBatch', { targets: selected }); selected[0].id = 'mutated_selection';
    await remote.mutate(command(remote, 'pin', done.records[3], { expectedPin: null }));
    await remote.mutate(command(remote, 'edit', done.records[4], { text: 'unrelated newer text' }));
    const before = b.raw(), writes = b.writes, saved = await store.mutate(undo);
    assert.equal(b.writes, writes + 1); assert.equal(saved.revision, before.revision + 1); assert.equal(saved.pinnedId, done.records[3].id);
    assert.deepEqual(saved.records.slice(2), before.records.slice(2)); assert(saved.records.slice(0, 2).every(record => record.state === 'active'));
    assert.deepEqual(await store.mutate(undo), saved); assert.equal(b.writes, writes + 1);
});

for (const change of ['edit', 'remove', 'reopen']) test(`whole-batch Undo rejects one ${change} member and leaves the other completed`, async () => {
    const { store, remote, b } = fixture(), review = await store.reviewCompletion(targets(b.raw().records.slice(0, 2)));
    const done = await store.mutate(review.command), undo = store.request('reopenBatch', { targets: targets(done.records.slice(0, 2)) });
    await remote.mutate(command(remote, change, done.records[1], { text: 'new version' })); const before = b.raw(), writes = b.writes;
    await assert.rejects(() => store.mutate(undo), { code: 'CONFLICT' }); assert.equal(b.writes, writes); assert.deepEqual(b.raw(), before);
    assert.equal(b.raw().records[0].state, 'done');
});

test('uncertain whole-batch Undo is acknowledged without a second write; later mutations and receipt expiry refuse replay', async () => {
    const { store, b } = fixture(), review = await store.reviewCompletion(targets(b.raw().records.slice(0, 2)));
    const done = await store.mutate(review.command), undo = store.request('reopenBatch', { targets: targets(done.records.slice(0, 2)) });
    const controller = new Controller(store); b.failAfter = true; await assert.rejects(() => controller.run(undo), { code: 'WRITE' });
    assert.strictEqual(controller.retryCommand, undo); const writes = b.writes; const saved = await controller.retry(); assert.equal(b.writes, writes);
    assert(saved.records.slice(0, 2).every(t => t.state === 'active')); await store.mutate(store.request('enable', { enabled: false }));
    await assert.rejects(() => store.mutate(undo), { code: 'CONFLICT' });
    for (let i = 0; i < 127; i++) await store.mutate(store.request('enable', { enabled: Boolean(i % 2) }));
    assert(!b.raw().receipts.includes(undo.operationId)); const before = b.raw(); await assert.rejects(() => store.mutate(undo), { code: 'CONFLICT' });
    assert.deepEqual(b.raw(), before); controller.destroy();
});

test('completion keeps all 500 records and does not free capacity for new tasks', async () => {
    const { store, b } = fixture(seed(500)), before = b.raw(), review = await store.reviewCompletion(targets(before.records));
    const done = await store.mutate(review.command); assert.equal(done.records.length, 500); assert(done.records.every(task => task.state === 'done'));
    assert.equal(b.writes, 1); assert.equal(done.revision, before.revision + 1);
    await assert.rejects(() => store.mutate(store.request('add', { text: 'no free slot' })), { code: 'CAPACITY' });
    const reopened = await store.mutate(store.request('reopenBatch', { targets: targets(done.records) }));
    assert.equal(reopened.records.length, 500); assert.equal(b.writes, 2); assert(reopened.records.every(task => task.state === 'active'));
});

function bytes(value) { return new TextEncoder().encode(JSON.stringify(value)).length; }
function fullBytes(headroom) {
    const value = seed(500); value.recovery = Array.from({ length: 8 }, (_, i) => ({ id: `recovery_id_${i}`, createdAt: now,
        content: { records: seed(250).records.map(record => ({ ...record, text: 'x' })), pinnedId: null } }));
    let remaining = api.LIMITS.bytes - 4096 - headroom - bytes(value); assert(remaining > 0);
    for (const task of value.recovery.flatMap(item => item.content.records)) { const count = Math.min(999, remaining); task.text += 'x'.repeat(count); remaining -= count; }
    assert.equal(remaining, 0); return api.validate(value);
}
for (const headroom of [0, 10000]) test(`full-state metadata and byte budget are checked during read-only review (${headroom} headroom)`, async () => {
    const { store, b } = fixture(fullBytes(headroom)), before = b.raw();
    if (!headroom) {
        await assert.rejects(() => store.reviewCompletion(targets(before.records)), { code: 'SIZE_LIMIT' });
        await assert.rejects(() => store.mutate(store.request('completeBatch', { targets: targets(before.records), revision: before.revision })), { code: 'SIZE_LIMIT' });
        assert.equal(b.writes, 0); assert.deepEqual(b.raw(), before);
    } else {
        const review = await store.reviewCompletion(targets(before.records)), done = await store.mutate(review.command);
        assert.equal(done.records.length, 500); assert.equal(done.recovery.length, 8); assert(bytes(done) <= api.LIMITS.bytes - 4096);
        assert.deepEqual(done.recovery, before.recovery); const reopened = await store.mutate(store.request('reopenBatch', { targets: targets(done.records) }));
        assert.equal(b.writes, 2); assert.equal(reopened.recovery.length, 8); assert(bytes(reopened) <= api.LIMITS.bytes - 4096);
    }
});

test('review validates the next revision and full readback cannot accept a changed unselected record', async () => {
    const value = seed(); value.revision = Number.MAX_SAFE_INTEGER;
    const invalid = fixture(value); await assert.rejects(() => invalid.store.reviewCompletion(targets(value.records.slice(0, 2))), { code: 'INVALID' }); assert.equal(invalid.b.writes, 0);
    const { store, b } = fixture(), review = await store.reviewCompletion(targets(b.raw().records.slice(0, 2))), write = b.write;
    b.write = async value => { await write(value); const changed = b.raw(); changed.records.at(-1).text = 'unexpected data'; b.seed(changed); };
    await assert.rejects(() => store.mutate(review.command), { code: 'VERIFY' }); assert.equal(b.writes, 1);
});

for (const kind of ['completeBatch', 'reopenBatch']) test(`latest receipt cannot confirm a partial ${kind} result after failed full verification`, async () => {
    const { store, b } = fixture(); let review = await store.reviewCompletion(targets(b.raw().records.slice(0, 2)));
    let cmd = review.command;
    if (kind === 'reopenBatch') { const done = await store.mutate(cmd); cmd = store.request(kind, { targets: targets(done.records.slice(0, 2)) }); }
    const before = b.raw(), write = b.write;
    b.write = async value => { await write(value); const partial = b.raw(); partial.records[1] = before.records[1]; b.seed(partial); };
    await assert.rejects(() => store.mutate(cmd), { code: 'VERIFY' }); const writes = b.writes, partial = b.raw();
    await assert.rejects(() => store.mutate(cmd), { code: 'CONFLICT' }); assert.equal(b.writes, writes); assert.deepEqual(b.raw(), partial);
});
