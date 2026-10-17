const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../shared/local-tasks-store');
const { Controller } = require('../shared/local-tasks-controller');
const { deferred } = require('./helpers/task-dom-model');
const clone = value => structuredClone(value);
const now = '2026-10-17T10:00:00.000Z';
const originalTime = '2026-10-17T09:00:00.000Z';
const tick = () => new Promise(resolve => setImmediate(resolve));
function seed(count = 6) {
    const state = api.initial(); state.enabled = true; state.revision = 9;
    state.records = Array.from({ length: count }, (_, index) => ({ id: `original_id_${index}`, version: `original_version_${index}`,
        text: index < 2 ? '  相同 😀\r\n<b>字面量</b>  ' : `task ${index}`, state: index < count - 2 ? 'removed' : 'active',
        removedFrom: index < count - 2 ? (index % 2 ? 'done' : 'active') : null,
        createdAt: originalTime, updatedAt: originalTime }));
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
    const options = { id: () => `batch_restoring_${String(++serial).padStart(8, '0')}`, now: () => now };
    return { b, store: new api.Store(b, options), remote: new api.Store(b, options) };
}
const targets = records => records.map(({ id, version, removedFrom }) => ({ id, version, removedFrom }));
const transitionTargets = records => records.map(({ id, version }) => ({ id, version }));
const command = (store, kind, task, extra = {}) => store.request(kind, { id: task.id, version: task.version, ...extra });
function assertFrozen(value) {
    if (!value || typeof value !== 'object') return;
    assert(Object.isFrozen(value)); Object.values(value).forEach(assertFrozen);
}
function assertRestored(saved, before, cmd) {
    assert.deepEqual(saved.records.map(record => record.id), before.records.map(record => record.id));
    assert.deepEqual(saved.records, before.records.map(record => {
        const target = cmd.targets.find(item => item.id === record.id);
        return target ? { ...record, state: target.removedFrom, removedFrom: null, version: target.nextVersion, updatedAt: cmd.updatedAt } : record;
    }));
    assert.equal(saved.enabled, before.enabled); assert.equal(saved.pinnedId, before.pinnedId); assert.deepEqual(saved.recovery, before.recovery);
}

test('restoration review captures mixed origins before waiting and one atomic save preserves original content, order, pin, settings and recovery', async () => {
    const value = seed(); value.enabled = false;
    value.recovery = [{ id: 'recovery_identity', createdAt: now, content: { records: clone(value.records), pinnedId: value.pinnedId } }];
    const { store, b } = fixture(value), before = b.raw(), selected = targets(before.records.slice(0, 2)).reverse(), captured = clone(selected);
    const gate = deferred(), held = b.lock(() => gate.promise), pending = store.reviewRestoration(selected);
    selected[0].id = 'mutated_selection'; selected[0].version = 'mutated_version'; selected[0].removedFrom = 'active'; selected.pop();
    gate.resolve(); await held; const review = await pending;
    assert.deepEqual(Object.keys(review).sort(), ['clearsPin', 'command', 'count', 'records', 'revision']);
    assert.equal(review.command.kind, 'restoreBatch'); assert.equal(review.count, 2); assert.equal(review.clearsPin, false);
    assert.equal(review.revision, before.revision); assert.equal(review.command.revision, before.revision);
    assert.deepEqual(review.records, before.records.slice(0, 2).reverse()); assert.deepEqual(targets(review.command.targets), captured);
    assertFrozen(review); assert.equal(b.writes, 0); assert.deepEqual(b.raw(), before);
    const reads = b.reads, saved = await store.mutate(review.command);
    assert.equal(b.reads, reads + 2); assert.equal(b.writes, 1); assert.equal(saved.revision, before.revision + 1);
    assert.deepEqual(saved.receipts, [review.command.operationId]); assertRestored(saved, before, review.command);
    assert.deepEqual(Object.keys(saved).sort(), Object.keys(api.initial()).sort());
    assert.deepEqual(await store.mutate(review.command), saved); assert.equal(b.writes, 1);
});

test('restoreBatch request is a strict deeply frozen copy with distinct fixed result versions', () => {
    const { store, b } = fixture(), selected = targets(b.raw().records.slice(0, 2)), captured = clone(selected);
    const cmd = store.request('restoreBatch', { targets: selected, revision: 9 });
    selected[0].id = 'mutated_selection'; selected[0].version = 'mutated_version'; selected[0].removedFrom = 'done'; selected.pop();
    assertFrozen(cmd); assert.deepEqual(Object.keys(cmd).sort(), ['kind', 'operationId', 'revision', 'targets', 'updatedAt']);
    assert.deepEqual(targets(cmd.targets), captured); assert.equal(cmd.revision, 9); assert.equal(cmd.updatedAt, now);
    for (const target of cmd.targets) {
        assert.deepEqual(Object.keys(target).sort(), ['id', 'nextVersion', 'removedFrom', 'version']);
        assert.notEqual(target.nextVersion, target.version);
    }
    assert.equal(new Set(cmd.targets.map(target => target.nextVersion)).size, cmd.targets.length); assert.equal(b.writes, 0);
});

test('restoration requires an explicit nonnegative safe-integer revision without coercion', async () => {
    const { store, b } = fixture(), selected = targets(b.raw().records.slice(0, 2));
    assert.throws(() => store.request('restoreBatch', { targets: selected }), { code: 'INVALID' });
    const valid = store.request('restoreBatch', { targets: selected, revision: 9 });
    const absent = { ...valid }; delete absent.revision;
    await assert.rejects(() => store.mutate(absent), { code: 'INVALID' });
    for (const revision of [undefined, null, '9', true, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => store.request('restoreBatch', { targets: selected, revision }), { code: 'INVALID' });
        await assert.rejects(() => store.mutate({ ...valid, revision }), { code: 'INVALID' });
    }
    await assert.rejects(() => store.mutate({ ...valid, revision: 8 }), { code: 'CONFLICT' });
    assert.equal(b.writes, 0); assert.deepEqual(b.raw(), seed());
});

test('empty, duplicate, malformed, missing-origin, extra-key and oversized selections never review or write', async () => {
    const { store, b } = fixture(), target = targets(b.raw().records)[0];
    const malformed = [undefined, null, {}, [], [target, target], [{ id: 'bad', version: 'bad', removedFrom: 'active' }],
        [{ id: target.id, version: target.version }], [{ ...target, removedFrom: null }], [{ ...target, removedFrom: 'removed' }],
        [{ ...target, removedFrom: 'Active' }], [{ ...target, removedFrom: false }], [{ ...target, text: 'extra' }],
        [{ ...target, nextVersion: 'extra_version' }], [{ ...target, id: 12345678 }], [{ ...target, version: null }], [null], Array(501).fill(target)];
    for (const selected of malformed) {
        assert.throws(() => store.request('restoreBatch', { targets: selected, revision: 9 }), { code: 'INVALID' });
        await assert.rejects(() => store.reviewRestoration(selected), { code: 'INVALID' });
    }
    assert.equal(b.writes, 0);
});

test('mutate revalidates the exact result-target contract and timestamp instead of trusting request construction', async () => {
    const { store, b } = fixture(), cmd = store.request('restoreBatch', { targets: targets(b.raw().records.slice(0, 2)), revision: 9 });
    const target = cmd.targets[0], missingOrigin = { ...target }, missingVersion = { ...target };
    delete missingOrigin.removedFrom; delete missingVersion.nextVersion;
    for (const badTargets of [[], [target, target], [missingOrigin], [missingVersion], [{ ...target, extra: true }],
        [{ ...target, removedFrom: 'removed' }], [{ ...target, nextVersion: target.version }], [{ ...target, nextVersion: 'bad' }], Array(501).fill(target)]) {
        await assert.rejects(() => store.mutate({ ...cmd, targets: badTargets }), { code: 'INVALID' });
    }
    for (const updatedAt of [undefined, null, 'not a date']) await assert.rejects(() => store.mutate({ ...cmd, updatedAt }), { code: 'INVALID' });
    assert.equal(b.writes, 0); assert.deepEqual(b.raw(), seed());
});

for (const change of ['active', 'done', 'missing', 'version', 'origin']) test(`review and direct restoration reject one selected ${change} mismatch atomically`, async () => {
    const { store, b } = fixture(), selected = targets(b.raw().records.slice(0, 2)), cmd = store.request('restoreBatch', { targets: selected, revision: 9 }), changed = b.raw();
    if (change === 'missing') changed.records.splice(1, 1);
    else if (change === 'version') changed.records[1].version = 'remote_version_changed';
    else if (change === 'origin') changed.records[1].removedFrom = 'active';
    else { changed.records[1].state = change; changed.records[1].removedFrom = null; }
    b.seed(api.validate(changed));
    await assert.rejects(() => store.reviewRestoration(selected), { code: 'CONFLICT' });
    await assert.rejects(() => store.mutate(cmd), { code: 'CONFLICT' });
    assert.equal(b.writes, 0); assert.deepEqual(b.raw(), changed); assert.equal(b.raw().records[0].state, 'removed');
});

for (const change of ['restore', 'unselected-edit', 'pin', 'enable', 'replace']) test(`reviewed restoration waiting for the lock rejects a newer ${change} without another write`, async () => {
    const { store, remote, b } = fixture(), before = b.raw(), review = await store.reviewRestoration(targets(before.records.slice(0, 2)));
    const gate = deferred(), held = b.lock(() => gate.promise); let cmd;
    if (change === 'replace') cmd = remote.request('replace', { revision: before.revision, source: JSON.stringify({ format: api.FORMAT, schemaVersion: 1, exportedAt: now, content: { records: before.records, pinnedId: before.pinnedId }, recovery: [] }) });
    else if (change === 'pin') cmd = command(remote, 'pin', before.records.at(-1), { expectedPin: before.pinnedId });
    else if (change === 'enable') cmd = remote.request('enable', { enabled: false });
    else cmd = command(remote, change === 'unselected-edit' ? 'edit' : change, before.records[change === 'unselected-edit' ? 4 : 0], { text: 'new unrelated original' });
    const changed = remote.mutate(cmd), pending = store.mutate(review.command), rejected = assert.rejects(pending, { code: 'CONFLICT' });
    gate.resolve(); await held; const latest = await changed; await rejected;
    assert.equal(b.writes, 1); assert.deepEqual(b.raw(), latest); assert.equal(b.raw().records[1].state, 'removed');
});

for (const change of ['version', 'origin']) test(`lock-time restoration validates selected ${change} even if the persisted revision did not change`, async () => {
    const { store, b } = fixture(), review = await store.reviewRestoration(targets(b.raw().records.slice(0, 2))), gate = deferred();
    const held = b.lock(() => gate.promise), changed = b.lock(() => {
        const latest = b.raw();
        if (change === 'version') latest.records[1].version = 'remote_version_changed'; else latest.records[1].removedFrom = 'active';
        b.seed(api.validate(latest)); return latest;
    });
    const pending = store.mutate(review.command), rejected = assert.rejects(pending, { code: 'CONFLICT' });
    gate.resolve(); await held; const latest = await changed; await rejected; assert.equal(b.writes, 0); assert.deepEqual(b.raw(), latest);
});

test('a queued read-only review checks selected identities against the state under its lock', async () => {
    const { store, remote, b } = fixture(), before = b.raw(), gate = deferred(), held = b.lock(() => gate.promise);
    const changed = remote.mutate(command(remote, 'restore', before.records[1]));
    const review = store.reviewRestoration(targets(before.records.slice(0, 2))), rejected = assert.rejects(review, { code: 'CONFLICT' });
    gate.resolve(); await held; const latest = await changed; await rejected; assert.equal(b.writes, 1); assert.deepEqual(b.raw(), latest);
});

for (const operation of ['review', 'mutate']) test(`workspace invalidation while waiting prevents restoration ${operation}`, async () => {
    const { store, b } = fixture(), selected = targets(b.raw().records.slice(0, 2));
    const review = operation === 'mutate' ? await store.reviewRestoration(selected) : null;
    const gate = deferred(), held = b.lock(() => gate.promise); await tick();
    const pending = operation === 'review' ? store.reviewRestoration(selected) : store.mutate(review.command);
    const rejected = assert.rejects(pending, { code: 'WORKSPACE_INVALIDATED' });
    b.invalidated = true; gate.resolve(); await held; await rejected; assert.equal(b.writes, 0);
});

for (const [failure, code, persisted] of [['failRead', 'READ', false], ['failWrite', 'WRITE', false], ['drop', 'VERIFY', false], ['failAfter', 'WRITE', true], ['failVerifyRead', 'READ', true]]) test(`Controller preserves the exact restoration through ${failure} and retries only on explicit request`, async () => {
    const { store, b } = fixture(), controller = new Controller(store); await controller.refresh();
    const review = await store.reviewRestoration(targets(b.raw().records.slice(0, 2))), before = b.raw(); b[failure] = true;
    await assert.rejects(() => controller.run(review.command), { code }); assert.strictEqual(controller.retryCommand, review.command);
    assert.equal(b.raw().revision, before.revision + (persisted ? 1 : 0)); const writes = b.writes; await tick(); await tick(); assert.equal(b.writes, writes);
    b[failure] = false; const saved = await controller.retry(); assert.equal(saved.revision, before.revision + 1);
    assert.equal(saved.receipts.filter(id => id === review.command.operationId).length, 1); assertRestored(saved, before, review.command);
    assert.equal(b.writes, writes + (persisted ? 0 : 1)); assert.equal(controller.retryCommand, null); controller.destroy();
});

test('a latest exact receipt acknowledges the stale original revision but still rejects malformed revisions', async () => {
    const { store, b } = fixture(), review = await store.reviewRestoration(targets(b.raw().records.slice(0, 2))), saved = await store.mutate(review.command);
    assert.notEqual(saved.revision, review.command.revision); assert.deepEqual(await store.mutate(review.command), saved);
    const absent = { ...review.command }; delete absent.revision;
    await assert.rejects(() => store.mutate(absent), { code: 'INVALID' });
    for (const revision of [undefined, null, '9', -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        await assert.rejects(() => store.mutate({ ...review.command, revision }), { code: 'INVALID' });
    }
    assert.equal(b.writes, 1); assert.deepEqual(b.raw(), saved);
});

test('later and expired receipts never replay an old restoration even when its targets still match', async () => {
    const { store, b } = fixture(), review = await store.reviewRestoration(targets(b.raw().records.slice(0, 2)));
    await store.mutate(review.command); await store.mutate(store.request('enable', { enabled: false })); const later = b.raw();
    await assert.rejects(() => store.mutate(review.command), { code: 'CONFLICT' }); assert.equal(b.writes, 2); assert.deepEqual(b.raw(), later);
    // Synthetic valid later history avoids an unnecessary 128-write stress loop.
    const expired = b.raw(); expired.revision += 128; expired.receipts = Array.from({ length: 128 }, (_, index) => `later_receipt_${index}`); b.seed(api.validate(expired));
    await assert.rejects(() => store.mutate(review.command), { code: 'CONFLICT' }); assert.equal(b.writes, 2); assert.deepEqual(b.raw(), expired);
});

for (const change of ['partial', 'state', 'removed', 'version', 'time', 'missing']) test(`latest restoration receipt cannot acknowledge a ${change} result after failed full readback`, async () => {
    const { store, b } = fixture(), before = b.raw(), review = await store.reviewRestoration(targets(before.records.slice(0, 2))), write = b.write;
    b.write = async next => {
        await write(next); const bad = b.raw(), record = bad.records[1];
        if (change === 'partial') bad.records[1] = before.records[1];
        else if (change === 'state') record.state = 'active';
        else if (change === 'removed') { record.state = 'removed'; record.removedFrom = 'done'; }
        else if (change === 'version') record.version = 'incorrect_result_version';
        else if (change === 'time') record.updatedAt = originalTime;
        else bad.records.splice(1, 1);
        b.seed(api.validate(bad));
    };
    await assert.rejects(() => store.mutate(review.command), { code: 'VERIFY' }); const bad = b.raw();
    await assert.rejects(() => store.mutate(review.command), { code: 'CONFLICT' }); assert.equal(b.writes, 1); assert.deepEqual(b.raw(), bad);
});

test('full readback rejects an unexpected change to an unselected task', async () => {
    const { store, b } = fixture(), review = await store.reviewRestoration(targets(b.raw().records.slice(0, 2))), write = b.write;
    b.write = async next => { await write(next); const changed = b.raw(); changed.records.at(-1).text = 'unexpected unselected change'; b.seed(changed); };
    await assert.rejects(() => store.mutate(review.command), { code: 'VERIFY' }); assert.equal(b.writes, 1);
});

test('all 500 removed records return to their own origins in place without freeing task capacity', async () => {
    const value = seed(500); value.records.forEach((record, index) => { record.state = 'removed'; record.removedFrom = index % 2 ? 'done' : 'active'; }); value.pinnedId = null;
    const { store, b } = fixture(api.validate(value)), review = await store.reviewRestoration(targets(value.records)), saved = await store.mutate(review.command);
    assert.equal(review.count, 500); assert.equal(saved.records.length, 500); assert.equal(b.writes, 1); assert.equal(saved.revision, value.revision + 1);
    assertRestored(saved, value, review.command); assert.equal(saved.records.filter(record => record.state === 'active').length, 250);
    assert.equal(saved.records.filter(record => record.state === 'done').length, 250); assert(saved.records.every(record => record.removedFrom === null));
    await assert.rejects(() => store.mutate(store.request('add', { text: 'no free slot' })), { code: 'CAPACITY' }); assert.equal(b.writes, 1);
});

function bytes(value) { return new TextEncoder().encode(JSON.stringify(value)).length; }
function fullBytes(headroom) {
    const value = seed(500); value.pinnedId = null;
    value.records.forEach((record, index) => { record.state = 'removed'; record.removedFrom = index % 2 ? 'done' : 'active'; record.version = `before_${String(index).padStart(3, '0')}`; });
    value.recovery = Array.from({ length: 8 }, (_, index) => ({ id: `recovery_id_${index}`, createdAt: now,
        content: { records: seed(250).records.map(record => ({ ...record, text: 'x' })), pinnedId: null } }));
    let remaining = api.LIMITS.bytes - 4096 - headroom - bytes(value); assert(remaining > 0);
    for (const task of value.recovery.flatMap(item => item.content.records)) { const count = Math.min(999, remaining); task.text += 'x'.repeat(count); remaining -= count; }
    assert.equal(remaining, 0); return api.validate(value);
}
for (const headroom of [0, 10000]) test(`restoration validates the full recovery and metadata byte budget with ${headroom} bytes of headroom`, async () => {
    const { store, b } = fixture(fullBytes(headroom)), before = b.raw(), selected = targets(before.records);
    if (!headroom) {
        await assert.rejects(() => store.reviewRestoration(selected), { code: 'SIZE_LIMIT' });
        await assert.rejects(() => store.mutate(store.request('restoreBatch', { targets: selected, revision: before.revision })), { code: 'SIZE_LIMIT' });
        assert.equal(b.writes, 0); assert.deepEqual(b.raw(), before);
    } else {
        const review = await store.reviewRestoration(selected); assert.equal(b.writes, 0);
        const saved = await store.mutate(review.command); assert.equal(saved.recovery.length, 8); assert.equal(b.writes, 1);
        assert(bytes(saved) <= api.LIMITS.bytes - 4096); assertRestored(saved, before, review.command);
    }
});

test('read-only restoration also validates next-revision overflow before any write', async () => {
    const value = seed(); value.revision = Number.MAX_SAFE_INTEGER; const { store, b } = fixture(value), selected = targets(value.records.slice(0, 2));
    await assert.rejects(() => store.reviewRestoration(selected), { code: 'INVALID' });
    await assert.rejects(() => store.mutate(store.request('restoreBatch', { targets: selected, revision: value.revision })), { code: 'INVALID' });
    assert.equal(b.writes, 0); assert.deepEqual(b.raw(), value);
});

test('completion and reopening retain their original target shape and revision-free whole-batch Undo', async () => {
    const value = seed(); value.records.forEach(record => { record.state = 'active'; record.removedFrom = null; }); value.pinnedId = value.records[0].id;
    const { store, remote, b } = fixture(value), selection = transitionTargets(value.records.slice(0, 2));
    for (const kind of ['completeBatch', 'reopenBatch']) {
        assert.throws(() => store.request(kind, { targets: selection.map(target => ({ ...target, removedFrom: 'active' })), revision: value.revision }), { code: 'INVALID' });
    }
    await assert.rejects(() => store.reviewCompletion(selection.map(target => ({ ...target, removedFrom: 'active' }))), { code: 'INVALID' });
    const complete = await store.reviewCompletion(selection), done = await store.mutate(complete.command); assert.equal(done.pinnedId, null);
    const reopening = await store.reviewReopening(transitionTargets(done.records.slice(0, 2)));
    assert.equal(reopening.command.revision, done.revision); assert.equal(reopening.clearsPin, false);
    await assert.rejects(() => store.reviewReopening(targets(done.records.slice(0, 2))), { code: 'INVALID' });
    const undo = store.request('reopenBatch', { targets: transitionTargets(done.records.slice(0, 2)) }); assert(!Object.hasOwn(undo, 'revision')); assertFrozen(undo);
    await remote.mutate(command(remote, 'pin', done.records.at(-1), { expectedPin: null }));
    await remote.mutate(command(remote, 'edit', b.raw().records[4], { text: 'new unrelated original' })); const before = b.raw(), writes = b.writes;
    await assert.rejects(() => store.mutate(reopening.command), { code: 'CONFLICT' });
    const controller = new Controller(store); b.failAfter = true;
    await assert.rejects(() => controller.run(undo), { code: 'WRITE' }); assert.strictEqual(controller.retryCommand, undo);
    const saved = await controller.retry(); assert.equal(b.writes, writes + 1); assert.equal(saved.revision, before.revision + 1);
    assert(saved.records.slice(0, 2).every(record => record.state === 'active' && record.removedFrom === null));
    assert.equal(saved.pinnedId, before.pinnedId); assert.deepEqual(saved.records.slice(2), before.records.slice(2));
    assert.deepEqual(await store.mutate(undo), saved); assert.equal(b.writes, writes + 1); controller.destroy();
});
