const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../shared/local-scratchpad-store.js');
const { Controller } = require('../shared/local-scratchpad-controller.js');
const Workspaces = require('../shared/workspaces.js');
const clone = value => structuredClone(value);
const deferred = () => {
    let resolve; const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};
const state = (label = 'original', revision = 6) => ({ schemaVersion: 1, revision, enabled: label === 'original', content: `${label} 中文 😀\r\n` });
const failure = (code, message = 'synthetic storage failure') => Object.assign(Error(message), code ? { code } : {});
const counts = b => ({ locks: b.locks, reads: b.reads, writes: b.writes, committed: b.committed });
const zero = { locks: 0, reads: 0, writes: 0, committed: 0 };
const outcome = promise => promise.then(value => ({ value }), error => ({ error }));

// Each backend has an independent fixed destination and lock queue. Dispatched
// reads return detached snapshots. This deliberately replaces a public Store
// field; it is not a reproduction of normal page-navigation workspace switching.
// Notifications are explicit so Controller's separate future reads are not
// confused with Store transaction ownership or manufactured Retry state.
function backend(initial = state()) {
    let raw = clone(initial), queue = Promise.resolve();
    const listeners = new Set();
    const b = {
        locks: 0, reads: 0, writes: 0, committed: 0, active: 0, events: [],
        readGates: new Map(), readErrors: new Map(), writeGate: null, writeMode: null, lockError: null,
        lock(action) {
            assert.strictEqual(this, b, 'lock receiver'); b.locks++;
            const next = queue.then(async () => {
                b.active++;
                try { if (b.lockError) { const error = b.lockError; b.lockError = null; throw error; } return await action(); }
                finally { b.active--; }
            });
            queue = next.catch(() => {}); return next;
        },
        async read() {
            assert.strictEqual(this, b, 'read receiver'); const index = ++b.reads;
            b.events.push(['read', b.active]); const value = clone(raw), gate = b.readGates.get(index), error = b.readErrors.get(index);
            b.readGates.delete(index); b.readErrors.delete(index);
            if (gate) { gate.entered.resolve(); await gate.release.promise; }
            if (error) throw error;
            return value;
        },
        async write(value) {
            assert.strictEqual(this, b, 'write receiver'); b.writes++; b.events.push(['write', b.active]);
            const next = clone(value), gate = b.writeGate, mode = b.writeMode; b.writeGate = null; b.writeMode = null;
            if (gate) { gate.entered.resolve(); await gate.release.promise; }
            if (mode === 'reject') throw failure();
            if (mode === 'workspace-reject') throw failure('WORKSPACE_INVALIDATED');
            if (mode === 'drop') return;
            raw = next; b.committed++;
            if (typeof mode === 'function') raw = mode(raw);
            if (mode === 'ack') throw failure(null, 'synthetic lost acknowledgement after commit');
            if (mode === 'verify-read') b.readErrors.set(b.reads + 1, failure());
            if (mode === 'verify-workspace') b.readErrors.set(b.reads + 1, failure('WORKSPACE_INVALIDATED'));
        },
        subscribe(listener) {
            assert.strictEqual(this, b, 'subscribe receiver'); listeners.add(listener); return () => listeners.delete(listener);
        },
        notify() { for (const listener of listeners) listener(); }, listenerCount: () => listeners.size,
        raw: () => clone(raw), seed(value) { raw = clone(value); }
    };
    return b;
}
function fixture() {
    const own = backend(), foreign = backend(state('foreign'));
    return { own, foreign, store: new api.Store(own) };
}
function gateAt(b, stage) {
    const gate = { entered: deferred(), release: deferred() };
    if (stage === 'lock') b.lock(async () => { gate.entered.resolve(); await gate.release.promise; });
    else if (stage === 'read' || stage === 'verify') b.readGates.set(b.reads + (stage === 'verify' ? 2 : 1), gate);
    else b.writeGate = gate;
    return gate;
}
function expected(before, command) {
    return { ...before, revision: before.revision + 1, [command.kind === 'content' ? 'content' : 'enabled']: command.value };
}
function isolated(own, foreign, other) {
    assert.deepEqual(counts(foreign), zero, 'foreign backend receives no operation I/O');
    assert.deepEqual(foreign.raw(), other, 'complete foreign record stays byte-exact');
    assert.ok(own.events.every(([, active]) => active === 1), 'read/write remain under their original lock');
}
function diagnostic(t, stage, own, foreign, result) {
    t.diagnostic(JSON.stringify({ stage, own: counts(own), foreign: counts(foreign), code: result.error?.code || null,
        original: own.raw(), other: foreign.raw() }));
}

for (const kind of ['content', 'visibility']) for (const stage of ['lock', 'read', 'write', 'verify']) {
    test(`${kind} mutation owns original lock/read/write/verification across ${stage} replacement`, async t => {
        const { own, foreign, store } = fixture(), before = own.raw(), other = foreign.raw(), gate = gateAt(own, stage);
        const command = { kind, value: kind === 'content' ? ' exact\r\n中文 😀 e\u0301\u0000 ' : false, revision: before.revision };
        const pending = outcome(store.mutate(command)); await gate.entered.promise;
        store.backend = foreign; gate.release.resolve(); const result = await pending;
        diagnostic(t, stage, own, foreign, result); isolated(own, foreign, other);
        assert.equal(result.error, undefined); assert.deepEqual(result.value, expected(before, command));
        assert.deepEqual(own.raw(), result.value); assert.equal(own.writes, 1); assert.equal(own.committed, 1); assert.equal(own.reads, 2);
        assert.equal(own.locks, stage === 'lock' ? 2 : 1);
        assert.deepEqual(Object.keys(result.value).sort(), ['content', 'enabled', 'revision', 'schemaVersion']);
    });
}

for (const method of ['raw', 'read']) for (const stage of method === 'raw' ? ['read'] : ['lock', 'read']) {
    test(`${method} captures its original source across ${stage} replacement`, async t => {
        const { own, foreign, store } = fixture(), before = own.raw(), other = foreign.raw(), gate = gateAt(own, stage);
        const pending = outcome(store[method]()); await gate.entered.promise; store.backend = foreign; gate.release.resolve(); const result = await pending;
        diagnostic(t, stage, own, foreign, result); assert.deepEqual(counts(foreign), zero); assert.deepEqual(foreign.raw(), other);
        assert.equal(result.error, undefined); assert.deepEqual(result.value, before); assert.deepEqual(own.raw(), before);
        assert.equal(own.writes, 0); assert.equal(own.reads, 1); assert.equal(own.locks, method === 'raw' ? 0 : stage === 'lock' ? 2 : 1);
        result.value.content = 'detached result'; assert.deepEqual(own.raw(), before);
    });
}

for (const value of ['', '\r\n', '\uFEFF中😀e\u0301\r\n \t\u0000<text>']) for (const stage of ['lock', 'read', 'write']) {
    test(`content bytes ${JSON.stringify(value)} survive ${stage} replacement`, async t => {
        const { own, foreign, store } = fixture(), before = own.raw(), other = foreign.raw(), gate = gateAt(own, stage);
        const pending = outcome(store.mutate({ kind: 'content', value, revision: before.revision })); await gate.entered.promise;
        store.backend = foreign; gate.release.resolve(); const result = await pending;
        diagnostic(t, stage, own, foreign, result); isolated(own, foreign, other); assert.equal(result.error, undefined);
        assert.equal(result.value.content, value); assert.deepEqual(Buffer.from(result.value.content, 'utf8'), Buffer.from(value, 'utf8'));
        assert.deepEqual(own.raw(), { ...before, revision: before.revision + 1, content: value });
    });
}

for (const enabled of [false, true]) test(`visibility ${enabled} preserves original Unicode and CRLF content`, async () => {
    const { own, foreign, store } = fixture(), before = own.raw(), other = foreign.raw(), gate = gateAt(own, 'read');
    const pending = outcome(store.mutate({ kind: 'visibility', value: enabled, revision: before.revision })); await gate.entered.promise;
    store.backend = foreign; gate.release.resolve(); const result = await pending;
    isolated(own, foreign, other); assert.equal(result.error, undefined); assert.deepEqual(result.value, { ...before, revision: before.revision + 1, enabled });
});

for (const kind of ['content', 'visibility']) for (const stage of ['lock', 'read']) {
    test(`${kind} original stale revision is rejected across ${stage} replacement`, async t => {
        const { own, foreign, store } = fixture(); own.seed(state('original', 7));
        const before = own.raw(), other = foreign.raw(), gate = gateAt(own, stage);
        const pending = outcome(store.mutate({ kind, value: kind === 'content' ? 'must reject' : false, revision: 6 }));
        await gate.entered.promise; store.backend = foreign; gate.release.resolve(); const result = await pending;
        diagnostic(t, stage, own, foreign, result); isolated(own, foreign, other);
        assert.equal(result.error?.code, 'CONFLICT'); assert.equal(own.writes, 0); assert.deepEqual(own.raw(), before);
    });
}

test('all queued stale commands reject on original CAS despite a matching foreign revision', async t => {
    const { own, foreign, store } = fixture(); own.seed(state('original', 7));
    const before = own.raw(), other = foreign.raw(), gate = gateAt(own, 'lock');
    const pending = ['a', 'b', 'c'].map(value => outcome(store.mutate({ kind: 'content', value, revision: 6 })));
    await gate.entered.promise; store.backend = foreign; gate.release.resolve(); const results = await Promise.all(pending);
    t.diagnostic(JSON.stringify({ codes: results.map(result => result.error?.code || null), own: counts(own), foreign: counts(foreign) }));
    isolated(own, foreign, other); assert.deepEqual(results.map(result => result.error?.code), ['CONFLICT', 'CONFLICT', 'CONFLICT']);
    assert.deepEqual(own.raw(), before); assert.equal(own.writes, 0); assert.equal(own.reads, 3);
});

for (const kind of ['content', 'visibility']) test(`queued ${kind} competitors keep one original CAS winner`, async () => {
    const { own, foreign, store } = fixture(), before = own.raw(), other = foreign.raw(), gate = gateAt(own, 'lock');
    const values = kind === 'content' ? ['first', 'second'] : [false, true];
    const pending = values.map(value => outcome(store.mutate({ kind, value, revision: before.revision })));
    await gate.entered.promise; store.backend = foreign; gate.release.resolve(); const results = await Promise.all(pending);
    isolated(own, foreign, other); assert.equal(results[0].error, undefined); assert.equal(results[1].error?.code, 'CONFLICT');
    assert.deepEqual(own.raw(), expected(before, { kind, value: values[0] })); assert.equal(own.writes, 1); assert.equal(own.reads, 3);
});

for (const method of ['raw', 'read', 'mutate']) for (const stage of method === 'raw' ? ['read'] : ['lock', 'read']) {
    for (const code of [null, 'WORKSPACE_INVALIDATED', 'WORKSPACE_RESTORE_PENDING']) {
        test(`${method} ${stage} original read failure retains ${code || 'READ'} with no foreign fallback`, async () => {
            const { own, foreign, store } = fixture(), before = own.raw(), other = foreign.raw(), gate = gateAt(own, stage), error = failure(code);
            own.readErrors.set(1, error);
            const pending = outcome(method === 'mutate' ? store.mutate({ kind: 'content', value: 'never saved', revision: 6 }) : store[method]());
            await gate.entered.promise; store.backend = foreign; gate.release.resolve(); const result = await pending;
            assert.deepEqual(counts(foreign), zero); assert.deepEqual(foreign.raw(), other); assert.deepEqual(own.raw(), before); assert.equal(own.writes, 0);
            assert.equal(result.error?.code, code || 'READ'); if (code) assert.strictEqual(result.error, error);
        });
    }
}

for (const method of ['read', 'mutate']) test(`${method} original queued lock admission failure preserves its WORKSPACE error`, async () => {
    const { own, foreign, store } = fixture(), before = own.raw(), other = foreign.raw(), gate = gateAt(own, 'lock');
    await gate.entered.promise;
    const error = failure('WORKSPACE_SWITCH_PENDING'); own.lockError = error;
    const pending = outcome(method === 'read' ? store.read() : store.mutate({ kind: 'visibility', value: false, revision: 6 }));
    store.backend = foreign; gate.release.resolve(); const result = await pending;
    assert.strictEqual(result.error, error); assert.equal(own.reads, 0); assert.equal(own.writes, 0); assert.deepEqual(own.raw(), before);
    assert.deepEqual(counts(foreign), zero); assert.deepEqual(foreign.raw(), other);
});

for (const mode of ['reject', 'workspace-reject', 'ack', 'drop', 'verify-read', 'verify-workspace']) {
    test(`original ${mode} write outcome is retained after write-stage replacement`, async t => {
        const { own, foreign, store } = fixture(), before = own.raw(), other = foreign.raw(), gate = gateAt(own, 'write'); own.writeMode = mode;
        const command = { kind: 'content', value: 'original attempted content', revision: 6 };
        const pending = outcome(store.mutate(command)); await gate.entered.promise; store.backend = foreign; gate.release.resolve(); const result = await pending;
        diagnostic(t, mode, own, foreign, result); isolated(own, foreign, other);
        const code = mode === 'drop' ? 'VERIFY' : mode === 'verify-read' ? 'READ' : mode === 'verify-workspace' ? 'WORKSPACE_INVALIDATED' : 'WRITE';
        assert.equal(result.error?.code, code); assert.equal(own.writes, 1);
        assert.deepEqual(own.raw(), ['ack', 'verify-read', 'verify-workspace'].includes(mode) ? expected(before, command) : before);
    });
}

test('foreign matching result cannot falsely acknowledge an original dropped write', async t => {
    const { own, foreign, store } = fixture(), before = own.raw();
    const command = { kind: 'content', value: 'claimed saved content', revision: 6 };
    foreign.seed(expected(before, command)); const other = foreign.raw(), gate = gateAt(own, 'write'); own.writeMode = 'drop';
    const pending = outcome(store.mutate(command)); await gate.entered.promise; store.backend = foreign; gate.release.resolve(); const result = await pending;
    diagnostic(t, 'false-acknowledgement', own, foreign, result); isolated(own, foreign, other);
    assert.equal(result.error?.code, 'VERIFY'); assert.deepEqual(own.raw(), before); assert.equal(own.committed, 0);
});

for (const [field, alter, code] of [
    ['content CRLF', value => ({ ...value, content: value.content.replace('\r\n', '\n') }), 'VERIFY'],
    ['enabled', value => ({ ...value, enabled: !value.enabled }), 'VERIFY'],
    ['revision', value => ({ ...value, revision: value.revision + 1 }), 'VERIFY'],
    ['schemaVersion', value => ({ ...value, schemaVersion: 2 }), 'CORRUPT'],
    ['extra field', value => ({ ...value, receipt: 'not permitted' }), 'CORRUPT']
]) test(`original verification still rejects differing ${field}`, async () => {
    const { own, foreign, store } = fixture(), other = foreign.raw(), gate = gateAt(own, 'write'); own.writeMode = alter;
    const pending = outcome(store.mutate({ kind: 'content', value: 'exact\r\n😀', revision: 6 })); await gate.entered.promise;
    store.backend = foreign; gate.release.resolve(); const result = await pending;
    isolated(own, foreign, other); assert.equal(result.error?.code, code); assert.equal(own.writes, 1); assert.equal(own.reads, 2);
});

for (const method of ['raw', 'read', 'mutate']) test(`${method} missing original record does not borrow foreign data`, async () => {
    const { own, foreign, store } = fixture(); own.seed(undefined);
    const other = foreign.raw(), gate = gateAt(own, method === 'raw' ? 'read' : 'lock');
    const pending = outcome(method === 'mutate' ? store.mutate({ kind: 'visibility', value: true, revision: 0 }) : store[method]());
    await gate.entered.promise; store.backend = foreign; gate.release.resolve(); const result = await pending;
    assert.deepEqual(counts(foreign), zero); assert.deepEqual(foreign.raw(), other); assert.equal(result.error, undefined);
    assert.deepEqual(result.value, method === 'mutate' ? { ...api.initial(), enabled: true, revision: 1 } : api.initial());
    assert.deepEqual(own.raw(), method === 'mutate' ? result.value : undefined); assert.equal(own.writes, method === 'mutate' ? 1 : 0);
});

const invalidRecords = [null, {}, [], { ...state(), content: 4 }, { ...state(), content: '\uD800' }, { ...state(), revision: -1 },
    { ...state(), enabled: 1 }, { ...state(), extra: 'rejected' }, { ...state(), content: 'x'.repeat(32001) }];
for (const [index, invalid] of invalidRecords.entries()) for (const method of ['read', 'mutate']) {
    test(`${method} corrupt original fixture ${index} remains intact after queued replacement`, async () => {
        const { own, foreign, store } = fixture(); own.seed(invalid);
        const before = own.raw(), other = foreign.raw(), gate = gateAt(own, 'lock');
        const pending = outcome(method === 'read' ? store.read() : store.mutate({ kind: 'visibility', value: false, revision: 6 }));
        await gate.entered.promise; store.backend = foreign; gate.release.resolve(); const result = await pending;
        isolated(own, foreign, other); assert.equal(result.error?.code, 'CORRUPT'); assert.equal(own.writes, 0); assert.deepEqual(own.raw(), before);
    });
}

for (const [label, command, code] of [
    ['unknown kind', { kind: 'other', value: 'x', revision: 6 }, 'INVALID'],
    ['visibility value', { kind: 'visibility', value: 'false', revision: 6 }, 'INVALID'],
    ['non-string content', { kind: 'content', value: 0, revision: 6 }, 'INVALID'],
    ['unpaired surrogate', { kind: 'content', value: '\uD800', revision: 6 }, 'TEXT'],
    ['oversize text', { kind: 'content', value: 'x'.repeat(32001), revision: 6 }, 'TEXT_LIMIT']
]) test(`invalid ${label} still rejects with no writes to either backend`, async () => {
    const { own, foreign, store } = fixture(), before = own.raw(), other = foreign.raw(), gate = gateAt(own, 'lock');
    const pending = outcome(store.mutate(command)); await gate.entered.promise; store.backend = foreign; gate.release.resolve(); const result = await pending;
    isolated(own, foreign, other); assert.equal(result.error?.code, code); assert.equal(own.writes, 0); assert.deepEqual(own.raw(), before);
});

for (const mode of ['reject', 'ack', 'drop', 'verify-read', 'verify-workspace']) for (const value of ['', 'exact 中文😀\r\n\uFEFFe\u0301\u0000']) {
    test(`real Controller Retry after ${mode} preserves ${JSON.stringify(value)} with no duplicate successful write`, async t => {
        const { own, foreign, store } = fixture(), before = own.raw(), other = foreign.raw();
        const controller = new Controller(store, { delay: 60000 }); t.after(() => controller.destroy()); await controller.init();
        controller.setDraft(value); own.writeMode = mode; const gate = gateAt(own, 'write');
        const pending = outcome(controller.save()); await gate.entered.promise; store.backend = foreign; gate.release.resolve(); const result = await pending;
        diagnostic(t, mode, own, foreign, result); isolated(own, foreign, other);
        const code = mode === 'drop' ? 'VERIFY' : mode === 'verify-read' ? 'READ' : mode === 'verify-workspace' ? 'WORKSPACE_INVALIDATED' : 'WRITE';
        assert.equal(result.error?.code, code); assert.strictEqual(controller.error, result.error);
        assert.equal(controller.draft, value); assert.equal(controller.status, 'error'); assert.equal(controller.writeError, true);
        assert.equal(controller.pending, false); assert.equal(controller.pendingWrite, false); assert.equal(controller.hasUncommittedWork(), true);
        const alreadyCommitted = ['ack', 'verify-read', 'verify-workspace'].includes(mode);
        assert.deepEqual(own.raw(), alreadyCommitted ? { ...before, revision: 7, content: value } : before);
        // Retry is a new invocation. Restore its source deliberately; no state,
        // error, conflict, draft or retry fields are fabricated for this check.
        store.backend = own; const writes = own.writes; await controller.retry();
        assert.equal(own.writes, writes + (alreadyCommitted ? 0 : 1)); assert.equal(own.committed, 1);
        assert.deepEqual(own.raw(), { ...before, revision: 7, content: value }); assert.deepEqual(controller.state, own.raw());
        assert.equal(controller.draft, value); assert.equal(controller.status, 'saved'); assert.equal(controller.error, null);
        assert.equal(controller.writeError, false); assert.equal(controller.conflict, false); assert.equal(controller.hasUncommittedWork(), false);
        isolated(own, foreign, other);
    });
}

for (const kind of ['content', 'visibility']) test(`real Controller ${kind} success retains original result without notification-driven refresh`, async t => {
    const { own, foreign, store } = fixture(), before = own.raw(), other = foreign.raw();
    const controller = new Controller(store, { delay: 60000 }); t.after(() => controller.destroy()); await controller.init();
    if (kind === 'content') controller.setDraft('controller original edit');
    const gate = gateAt(own, 'read'), pending = outcome(kind === 'content' ? controller.save() : controller.setEnabled(false));
    await gate.entered.promise; store.backend = foreign; gate.release.resolve(); const result = await pending;
    isolated(own, foreign, other); assert.equal(result.error, undefined); assert.deepEqual(controller.state, own.raw());
    assert.deepEqual(own.raw(), expected(before, { kind, value: kind === 'content' ? 'controller original edit' : false }));
    assert.equal(controller.draft, own.raw().content); assert.equal(controller.status, 'saved'); assert.equal(controller.hasUncommittedWork(), false);
});

test('a concurrent later invocation deliberately captures the replacement backend', async t => {
    const { own, foreign, store } = fixture(), before = own.raw(), other = foreign.raw(), gate = gateAt(own, 'read');
    const first = outcome(store.mutate({ kind: 'content', value: 'original invocation', revision: 6 })); await gate.entered.promise;
    store.backend = foreign;
    const later = await store.mutate({ kind: 'content', value: 'foreign invocation', revision: 6 });
    assert.deepEqual(later, { ...other, revision: 7, content: 'foreign invocation' });
    gate.release.resolve(); const result = await first;
    diagnostic(t, 'concurrent-independent-invocations', own, foreign, result); assert.equal(result.error, undefined);
    assert.deepEqual(own.raw(), { ...before, revision: 7, content: 'original invocation' }); assert.deepEqual(result.value, own.raw());
    assert.deepEqual(foreign.raw(), later); assert.deepEqual(counts(own), { locks: 1, reads: 2, writes: 1, committed: 1 });
    assert.deepEqual(counts(foreign), { locks: 1, reads: 2, writes: 1, committed: 1 });
    assert.ok([...own.events, ...foreign.events].every(([, active]) => active === 1));
});

test('later raw/read/mutate invocations use the new backend and subscriptions keep their registration owner', async () => {
    const { own, foreign, store } = fixture(), before = own.raw(); let originalEvents = 0, foreignEvents = 0;
    const unsubscribeOriginal = store.subscribe(() => originalEvents++); store.backend = foreign;
    const unsubscribeForeign = store.subscribe(() => foreignEvents++);
    own.notify(); assert.deepEqual([originalEvents, foreignEvents], [1, 0]); foreign.notify(); assert.deepEqual([originalEvents, foreignEvents], [1, 1]);
    assert.deepEqual(await store.raw(), foreign.raw()); assert.deepEqual(await store.read(), foreign.raw());
    await store.mutate({ kind: 'visibility', value: true, revision: 6 });
    assert.deepEqual(counts(own), zero); assert.deepEqual(own.raw(), before); assert.equal(foreign.writes, 1);
    unsubscribeOriginal(); assert.equal(own.listenerCount(), 0); assert.equal(foreign.listenerCount(), 1);
    own.notify(); foreign.notify(); assert.deepEqual([originalEvents, foreignEvents], [1, 2]);
    unsubscribeForeign(); assert.equal(foreign.listenerCount(), 0);
});

// Real Session/createBackend/withLock/get/set, over synthetic storage and lock
// transport. This does not execute native Chrome, Web Locks or navigation.
async function sessionFixture() {
    const entries = ['original', 'foreign'].map((id, i) => ({ id, generation: `generation_${i}`, deletedAt: null }));
    const values = new Map(entries.map(entry => [entry.id, { [api.KEY]: state(entry.id), quote: `${entry.id} unrelated setting` }]));
    const queues = new Map(), lockNames = [], writes = []; let readGate = null, restorePending = false;
    const manager = {
        chrome: { storage: { onChanged: { addListener() {} } } }, subscribe() {}, async ready() {},
        async registry() { return { lastUsedId: 'original', workspaces: clone(entries) }; },
        locks: { request(name, options, action) {
            lockNames.push([name, options.mode]); const next = (queues.get(name) || Promise.resolve()).then(action);
            queues.set(name, next.catch(() => {})); return next;
        } },
        async assertRestoreSettled() { if (restorePending) throw failure('WORKSPACE_RESTORE_PENDING'); },
        async readBundle(entry) {
            const result = clone(values.get(entry.id)), gate = readGate; readGate = null;
            if (gate) { gate.entered.resolve(); await gate.release.promise; } return result;
        },
        async writeBundle(entry, next) { writes.push(entry.id); values.set(entry.id, clone(next)); }
    };
    const ownSession = new Workspaces.Session(manager, 'original'), foreignSession = new Workspaces.Session(manager, 'foreign');
    await ownSession.ready(); await foreignSession.ready();
    const own = api.createChromeBackend(null, null, ownSession), foreign = api.createChromeBackend(null, null, foreignSession);
    return { ownSession, foreignSession, own, foreign, store: new api.Store(own), entries, lockNames, writes,
        value: id => clone(values.get(id)), holdRead() { readGate = { entered: deferred(), release: deferred() }; return readGate; },
        setRestorePending() { restorePending = true; } };
}

for (const kind of ['content', 'visibility']) test(`real Session ${kind} keeps original destination and pending flush across injected replacement`, async t => {
    const h = await sessionFixture(), before = h.value('original'), other = h.value('foreign'), gate = h.holdRead();
    const command = { kind, value: kind === 'content' ? 'session original 中文😀\r\n' : false, revision: 6 };
    const pending = outcome(h.store.mutate(command)); await gate.entered.promise; h.store.backend = h.foreign;
    h.ownSession.suspendWrites(); let flushed = false; const flushing = h.ownSession.flush().then(() => { flushed = true; });
    await Promise.resolve(); assert.equal(flushed, false); gate.release.resolve(); const result = await pending; await flushing;
    t.diagnostic(JSON.stringify({ kind, code: result.error?.code || null, writes: h.writes, lockNames: h.lockNames, flushed }));
    assert.equal(result.error, undefined); assert.deepEqual(h.writes, ['original']); assert.deepEqual(h.value('foreign'), other);
    assert.deepEqual(result.value, expected(before[api.KEY], command)); assert.deepEqual(h.value('original'), { ...before, [api.KEY]: result.value });
    assert.deepEqual(h.lockNames, [[Workspaces.LOCK, 'shared'], [`${Workspaces.LOCK}:write`, 'exclusive']]);
    assert.equal(h.ownSession.id, 'original'); assert.equal(h.ownSession.generation, 'generation_0'); assert.ok(Object.isFrozen(h.ownSession._identity));
    h.store.backend = h.own; await assert.rejects(h.store.read(), { code: 'WORKSPACE_SWITCH_PENDING' });
    h.ownSession.resumeWrites(); assert.deepEqual(await h.store.read(), result.value);
});

test('real Session unsettled restore refuses original transaction without writes', async () => {
    const h = await sessionFixture(), before = h.value('original'), other = h.value('foreign'); h.setRestorePending();
    await assert.rejects(h.store.mutate({ kind: 'content', value: 'blocked', revision: 6 }), { code: 'WORKSPACE_RESTORE_PENDING' });
    assert.deepEqual(h.writes, []); assert.deepEqual(h.value('original'), before); assert.deepEqual(h.value('foreign'), other);
});

test('real Session generation recheck after original bundle await preserves WORKSPACE_INVALIDATED', async () => {
    const h = await sessionFixture(), before = h.value('original'), other = h.value('foreign'), gate = h.holdRead();
    const pending = outcome(h.store.mutate({ kind: 'content', value: 'blocked', revision: 6 })); await gate.entered.promise;
    h.store.backend = h.foreign; h.entries[0].generation = 'retired_generation'; gate.release.resolve(); const result = await pending;
    assert.equal(result.error?.code, 'WORKSPACE_INVALIDATED'); assert.equal(h.ownSession.invalidated, true);
    assert.deepEqual(h.writes, []); assert.deepEqual(h.value('original'), before); assert.deepEqual(h.value('foreign'), other);
});
