const assert = require('node:assert/strict');
const test = require('node:test');
const api = require('../shared/local-prompts-store.js');
function fixture() {
    let state, serial = 0, queue = Promise.resolve();
    const backend = {
        writes: 0,
        lock(action) { const result = queue.then(action); queue = result.catch(() => {}); return result; },
        async read() { return state === undefined ? undefined : structuredClone(state); },
        async write(next) { this.writes++; state = structuredClone(next); },
        subscribe() { return () => {}; }
    };
    return { backend, store: new api.Store(backend, { id: () => `lock_test_${++serial}`, now: () => '2026-10-10T20:00:00.000Z' }) };
}
test('sync and async lock acquisition errors are sanitized across read, mutate, export and review', async () => {
    const source = await fixture().store.export();
    for (const lock of [() => { throw Error('private credential detail'); }, async () => { throw Error('private credential detail'); }]) {
        const { store, backend } = fixture(); backend.lock = lock;
        const request = store.request('add', { title: 'Title', body: 'Body' });
        for (const action of [() => store.read(), () => store.mutate(request), () => store.export(), () => store.review(source)])
            await assert.rejects(action, error => error.code === 'LOCK' && error.message === 'Local prompts: LOCK');
        assert.equal(backend.writes, 0);
    }
});
test('owned restore fences and domain errors retain exact typed codes', async () => {
    const { store, backend } = fixture();
    backend.lock = () => { throw api.fault('RESTORE_PENDING'); };
    await assert.rejects(() => store.read(), { code: 'RESTORE_PENDING' });
    const safe = fixture();
    await assert.rejects(() => safe.store.mutate(safe.store.request('edit', { id: 'missing_identity', version: 'missing_version', title: 'New' })), { code: 'CONFLICT' });
});
test('post-callback lock failure is VERIFY even after successful commit and exact retry is idempotent', async () => {
    const { store, backend } = fixture(), originalLock = backend.lock.bind(backend); let rejectAfter = true;
    backend.lock = action => originalLock(async () => { const result = await action(); if (rejectAfter) throw Error('private post-commit detail'); return result; });
    const request = store.request('add', { title: 'Title', body: 'Uncertain result' });
    await assert.rejects(() => store.mutate(request), error => error.code === 'VERIFY' && error.message === 'Local prompts: VERIFY');
    assert.equal(backend.writes, 1); rejectAfter = false;
    const state = await store.mutate(request); assert.equal(state.records.length, 1); assert.equal(backend.writes, 1);
});
test('hostile code/message accessors cannot forge domain errors or run during lock error normalization', async () => {
    const { store, backend } = fixture(), originalLock = backend.lock.bind(backend); let accessed = 0;
    const hostile = Object.defineProperties({}, {
        code: { get() { accessed++; return 'RESTORE_PENDING'; } },
        message: { get() { accessed++; return 'private detail'; } }
    });
    backend.lock = () => { throw hostile; }; await assert.rejects(() => store.read(), { code: 'LOCK' });
    backend.lock = action => originalLock(async () => { await action(); throw hostile; });
    await assert.rejects(() => store.read(), { code: 'VERIFY' }); assert.equal(accessed, 0);
});
