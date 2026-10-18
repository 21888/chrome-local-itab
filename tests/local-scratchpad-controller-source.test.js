const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../shared/local-scratchpad-store.js');
const { Controller } = require('../shared/local-scratchpad-controller.js');
const Workspaces = require('../shared/workspaces.js');
const clone = value => structuredClone(value);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
const state = (content = 'original saved 中文 😀\r\n', revision = 6) => ({ schemaVersion: 1, revision, enabled: true, content });
const counts = b => ({ locks: b.locks, reads: b.reads, writes: b.writes, committed: b.committed });
const zero = { locks: 0, reads: 0, writes: 0, committed: 0 };
const outcome = promise => Promise.resolve(promise).then(value => ({ value }), error => ({ error }));
// Each real Store uses a synthetic fixed destination and independent serialized
// lock. Public-field substitution is fault injection, not normal navigation.
function backend(initial = state()) {
    let raw = clone(initial), tail = Promise.resolve(); const listeners = new Set();
    const b = { locks: 0, reads: 0, writes: 0, committed: 0, unsubscribes: 0,
        readGate: null, readError: null, writeGate: null, mode: null,
        lock(action) { assert.strictEqual(this, b); b.locks++; const next = tail.then(action); tail = next.catch(() => {}); return next; },
        async read() {
            assert.strictEqual(this, b); b.reads++; const value = clone(raw), gate = b.readGate, error = b.readError;
            b.readGate = null; b.readError = null;
            if (gate) { gate.entered.resolve(); await gate.release.promise; }
            if (error) throw error; return value;
        },
        async write(value) {
            assert.strictEqual(this, b); b.writes++; const next = clone(value), gate = b.writeGate, mode = b.mode;
            b.writeGate = null; b.mode = null;
            if (gate) { gate.entered.resolve(); await gate.release.promise; }
            if (mode === 'reject') throw Error('synthetic original rejected write');
            if (mode === 'drop') return;
            raw = next; b.committed++; b.notify();
            if (mode === 'ack') throw Error('synthetic original lost acknowledgement');
            if (mode === 'verify-read') b.readError = Error('synthetic original verification read failure');
        },
        subscribe(fn) { assert.strictEqual(this, b); listeners.add(fn); return () => { b.unsubscribes++; listeners.delete(fn); }; },
        notify() { for (const fn of [...listeners]) fn(); }, callbacks: () => [...listeners],
        raw: () => clone(raw), seed(value) { raw = clone(value); }
    }; return b;
}
function fixture(t, options = {}) {
    const own = backend(), foreign = backend(state('foreign saved note', 7));
    const store = new api.Store(own), otherStore = new api.Store(foreign), controller = new Controller(store, { delay: 60000, ...options });
    t.after(() => controller.destroy()); return { own, foreign, store, otherStore, controller };
}
const change = (h, source) => { if (source === 'store') h.controller.store = h.otherStore; else h.store.backend = h.foreign; };
const restore = h => { h.controller.store = h.store; h.store.backend = h.own; };
function gateAt(b, stage) { const gate = { entered: deferred(), release: deferred() }; b[`${stage}Gate`] = gate; return gate; }
const snapshot = c => Object.fromEntries(['state', 'draft', 'loaded', 'pending', 'pendingWrite', 'status', 'error', 'readError', 'writeError', 'conflict', 'composing', 'generation'].map(key => [key, c[key]]));
function unchanged(c, before, overrides = {}) { for (const [key, value] of Object.entries({ ...before, ...overrides })) assert.strictEqual(c[key], value, key); }
function isolated(h, other = state('foreign saved note', 7)) { assert.deepEqual(counts(h.foreign), zero); assert.deepEqual(h.foreign.raw(), other); }
async function failedDraft(h, mode = 'reject', text = 'original requested edit') {
    h.controller.setDraft(text); h.own.mode = mode; const result = await outcome(h.controller.save()); assert.ok(result.error); return result.error;
}
async function conflictingDraft(h) {
    h.controller.setComposing(true); h.controller.setDraft('local conflict draft');
    await h.store.mutate({ kind: 'content', value: 'new original saved text', revision: h.own.raw().revision });
    await settle(); assert.equal(h.controller.conflict, true); h.controller.setComposing(false);
}

for (const source of ['backend', 'store']) for (const loaded of [false, true]) test(`init/refresh rejects ${source} replacement ${loaded ? 'after load' : 'before initial subscription'}`, async t => {
    const h = fixture(t), c = h.controller; if (loaded) await c.init();
    const before = snapshot(c), own = counts(h.own); change(h, source);
    await assert.rejects(loaded ? c.refresh() : c.init(), { code: 'UNAVAILABLE' });
    unchanged(c, before); assert.deepEqual(counts(h.own), own); isolated(h); assert.equal(h.foreign.callbacks().length, 0);
    restore(h); await c.init(); assert.deepEqual(c.state, h.own.raw()); assert.equal(h.own.callbacks().length, 1);
});
for (const source of ['backend', 'store']) test(`owned subscription cannot read substituted ${source} and can resume original source`, async t => {
    const h = fixture(t), c = h.controller; await c.init(); const before = snapshot(c), own = counts(h.own); change(h, source);
    h.own.notify(); h.foreign.notify(); await settle(); unchanged(c, before); assert.deepEqual(counts(h.own), own); isolated(h);
    restore(h); await h.store.mutate({ kind: 'content', value: 'genuine original notification', revision: 6 }); await settle();
    assert.equal(c.draft, 'genuine original notification'); assert.deepEqual(c.state, h.own.raw());
});
for (const source of ['backend', 'store']) for (const method of ['run', 'save', 'retry', 'useSaved', 'replaceWithDraft', 'setEnabled']) test(`${method} rejects changed ${source} before I/O and preserves genuine prior feedback`, async t => {
    const h = fixture(t), c = h.controller; await c.init();
    if (method === 'retry') await failedDraft(h);
    else if (method === 'replaceWithDraft' || method === 'useSaved') await conflictingDraft(h);
    else if (method !== 'setEnabled') c.setDraft('local untouched draft');
    const before = snapshot(c), own = counts(h.own); change(h, source);
    const result = method === 'run' ? c.run('content', c.draft, c.state.revision) : method === 'setEnabled' ? c.setEnabled(false) : c[method]();
    await assert.rejects(result, { code: 'UNAVAILABLE' }); unchanged(c, before); assert.deepEqual(counts(h.own), own); isolated(h);
    restore(h); if (method === 'retry') { await c.retry(); assert.equal(c.error, null); assert.equal(h.own.committed, 1); }
});
for (const source of ['backend', 'store']) for (const mode of ['success', 'reject', 'ack', 'drop', 'verify-read']) test(`dispatched ${mode} retains actual original write outcome across ${source} gap and notification`, async t => {
    const h = fixture(t), c = h.controller; await c.init(); c.setDraft('original requested edit');
    const before = h.own.raw(), gate = gateAt(h.own, 'write'); h.own.mode = mode;
    const pending = outcome(c.save()); await gate.entered.promise;
    // A real original notification while pending also tests refreshNeeded cleanup.
    h.own.notify(); assert.equal(c.refreshNeeded, true); change(h, source); gate.release.resolve(); const result = await pending;
    t.diagnostic(JSON.stringify({ source, mode, own: counts(h.own), foreign: counts(h.foreign), code: result.error?.code || null, draft: c.draft, status: c.status }));
    isolated(h); assert.equal(c.pending, false); assert.equal(c.pendingWrite, false); assert.equal(c.refreshNeeded, false);
    assert.equal(c.draft, 'original requested edit'); assert.equal(h.own.writes, 1);
    if (mode === 'success') { assert.equal(result.error, undefined); assert.deepEqual(c.state, result.value); assert.equal(c.status, 'saved'); assert.equal(c.hasUncommittedWork(), false); }
    else { assert.equal(result.error?.code, mode === 'drop' ? 'VERIFY' : mode === 'verify-read' ? 'READ' : 'WRITE'); assert.strictEqual(c.error, result.error); assert.equal(c.writeError, true); assert.equal(c.status, 'error'); assert.equal(c.hasUncommittedWork(), true); }
    assert.deepEqual(h.own.raw(), ['success', 'ack', 'verify-read'].includes(mode) ? { ...before, revision: 7, content: c.draft } : before);
    restore(h); const writes = h.own.writes; await c.retry();
    assert.equal(c.status, 'saved'); assert.equal(c.error, null); assert.equal(c.hasUncommittedWork(), false);
    assert.equal(h.own.writes, writes + (['reject', 'drop'].includes(mode) ? 1 : 0)); assert.equal(h.own.committed, 1);
});
for (const source of ['backend', 'store']) test(`newer composing draft survives successful original write and ${source} gap`, async t => {
    const h = fixture(t), c = h.controller; await c.init(); c.setDraft('first original edit'); const gate = gateAt(h.own, 'write');
    const pending = c.save(); await gate.entered.promise; change(h, source); c.setComposing(true); c.setDraft('newer local 中文\r\n😀'); gate.release.resolve(); await pending;
    isolated(h); assert.equal(c.draft, 'newer local 中文\r\n😀'); assert.equal(c.state.content, 'first original edit'); assert.equal(c.status, 'unsaved');
    assert.equal(c.composing, true); assert.equal(c.dirty(), true); assert.equal(c.hasUncommittedWork(), true); assert.equal(h.own.committed, 1);
    restore(h); c.setComposing(false); await c.save(); assert.equal(h.own.committed, 2); assert.equal(h.own.raw().content, c.draft);
});
for (const source of ['backend', 'store']) test(`genuine original CAS conflict does not refresh foreign ${source}`, async t => {
    const h = fixture(t), c = h.controller; await c.init(); c.setDraft('local CAS draft');
    // A missed notification is modeled by seeding the independent storage record.
    h.own.seed(state('unseen original newer content', 7)); const before = c.state, gate = gateAt(h.own, 'read');
    const pending = outcome(c.save()); await gate.entered.promise; change(h, source); gate.release.resolve(); const result = await pending;
    assert.equal(result.error?.code, 'CONFLICT'); assert.strictEqual(c.error, result.error); assert.strictEqual(c.state, before); assert.equal(c.conflict, true);
    assert.equal(c.draft, 'local CAS draft'); assert.equal(c.status, 'error'); isolated(h); assert.equal(h.own.writes, 0);
    restore(h); await c.refresh(); assert.equal(c.state.revision, 7); assert.equal(c.conflict, true); await c.replaceWithDraft();
    assert.equal(h.own.raw().content, 'local CAS draft'); assert.equal(h.own.committed, 1);
});
for (const source of ['backend', 'store']) for (const method of ['refresh', 'retry', 'useSaved']) for (const failure of [false, true]) test(`delayed original ${method} ${failure ? 'READ failure' : 'success'} cannot publish through ${source} gap`, async t => {
    const h = fixture(t), c = h.controller; await c.init();
    if (method === 'retry') await failedDraft(h, 'ack');
    else if (method === 'useSaved') await conflictingDraft(h);
    else h.own.seed(state('original changed after initial load', 7));
    const before = snapshot(c), gate = gateAt(h.own, 'read'); if (failure) h.own.readError = Error('delayed original failure');
    const pending = outcome(c[method]()); await gate.entered.promise; change(h, source); gate.release.resolve(); const result = await pending;
    if (failure) assert.equal(result.error?.code, 'READ'); else assert.equal(result.error, undefined);
    unchanged(c, before); isolated(h); restore(h);
    if (method === 'retry') { const writes = h.own.writes; await c.retry(); assert.equal(c.status, 'saved'); assert.equal(h.own.writes, writes); }
    else await c.refresh();
});
for (const method of ['init', 'refresh', 'retry', 'useSaved']) for (const failure of [false, true]) test(`destroy prevents delayed ${method} ${failure ? 'failure' : 'success'} publication`, async t => {
    const h = fixture(t), c = h.controller; if (method !== 'init') await c.init();
    if (method === 'retry') await failedDraft(h); if (method === 'useSaved') await conflictingDraft(h);
    const gate = gateAt(h.own, 'read'); if (failure) h.own.readError = Error('closed original read failure');
    const pending = outcome(c[method]()); await gate.entered.promise; c.destroy(); const before = snapshot(c); gate.release.resolve(); const result = await pending;
    if (failure) assert.equal(result.error?.code, 'READ'); unchanged(c, before, { pending: false }); isolated(h);
});
for (const source of ['backend', 'store']) for (const method of ['run', 'retry', 'useSaved']) test(`onChange ${method} source substitution is rechecked before dispatch (${source})`, async t => {
    const h = fixture(t), c = h.controller; await c.init(); if (method === 'retry') await failedDraft(h); else c.setDraft('local pre-dispatch draft');
    const before = snapshot(c), own = counts(h.own); let changed = false;
    c.onChange = () => { if (c.pending && !changed) { changed = true; change(h, source); } };
    const pending = method === 'run' ? c.run('content', c.draft, c.state.revision) : c[method]();
    await assert.rejects(pending, { code: 'UNAVAILABLE' }); assert.equal(changed, true); unchanged(c, before); assert.deepEqual(counts(h.own), own); isolated(h);
});
for (const method of ['run', 'retry', 'useSaved']) test(`onChange destruction retires ${method} before dispatch without new I/O`, async t => {
    const h = fixture(t), c = h.controller; await c.init(); if (method === 'retry') await failedDraft(h); else c.setDraft('local pre-dispatch draft');
    const before = snapshot(c), own = counts(h.own); c.onChange = () => { if (c.pending) c.destroy(); };
    const pending = method === 'run' ? c.run('content', c.draft, c.state.revision) : c[method]();
    await assert.rejects(pending, { code: 'UNAVAILABLE' }); unchanged(c, before); assert.deepEqual(counts(h.own), own); isolated(h);
});
for (const source of ['backend', 'store']) test(`autosave timer and composition editing never write foreign ${source}`, async t => {
    const timers = new Map(); let next = 0;
    t.mock.method(globalThis, 'setTimeout', fn => { const id = ++next; timers.set(id, fn); return id; });
    t.mock.method(globalThis, 'clearTimeout', id => timers.delete(id));
    const h = fixture(t), c = h.controller; await c.init(); c.setDraft('scheduled original draft'); assert.equal(timers.size, 1);
    const fire = [...timers.values()][0]; change(h, source); fire(); await settle(); isolated(h); assert.equal(h.own.writes, 0);
    c.setComposing(true); c.setDraft('continued local composition'); c.setComposing(false); assert.equal(c.draft, 'continued local composition'); assert.equal(c.dirty(), true);
    for (const fn of [...timers.values()]) fn(); await settle(); isolated(h); assert.equal(h.own.writes, 0); assert.equal(c.hasUncommittedWork(), true);
    restore(h); await c.save(); assert.equal(h.own.raw().content, c.draft); assert.equal(h.own.committed, 1);
});
test('destroy unsubscribes from the construction backend despite replaced public unsubscribe and Store', async t => {
    const h = fixture(t), c = h.controller; await c.init(); const callback = h.own.callbacks()[0], own = counts(h.own); let foreignUnsubscribe = 0;
    c.unsubscribe = () => foreignUnsubscribe++; c.store = h.otherStore; c.destroy();
    assert.equal(h.own.callbacks().length, 0); assert.equal(h.own.unsubscribes, 1); assert.equal(foreignUnsubscribe, 0);
    callback(); await settle(); assert.deepEqual(counts(h.own), own); isolated(h);
});
test('retired Controller cannot resubscribe or read after its public closed flag is reset', async t => {
    const h = fixture(t), c = h.controller; await c.init(); const callback = h.own.callbacks()[0]; c.destroy(); c.closed = false;
    const own = counts(h.own), before = snapshot(c); callback(); await outcome(c.init()); await outcome(c.refresh()); await settle();
    unchanged(c, before); assert.deepEqual(counts(h.own), own); assert.equal(h.own.callbacks().length, 0); isolated(h);
});
test('new Controller explicitly constructed for another source works normally', async t => {
    const h = fixture(t), c = new Controller(h.otherStore, { delay: 60000 }); t.after(() => c.destroy()); await c.init(); c.setDraft('explicit foreign controller edit');
    await c.save(); assert.equal(h.foreign.raw().content, 'explicit foreign controller edit'); assert.equal(h.foreign.committed, 1); assert.deepEqual(counts(h.own), zero);
});
// Genuine Session-owned availability is independent of public-field ownership.
async function sessionFixture(t) {
    const entry = { id: 'workspace_original', generation: 'generation_original', deletedAt: null }; let raw = state();
    const manager = { chrome: { storage: { onChanged: { addListener() {} } } }, subscribe() {}, async ready() {},
        async registry() { return { lastUsedId: entry.id, workspaces: [clone(entry)] }; },
        locks: { request(name, options, action) { return Promise.resolve().then(action); } },
        async assertRestoreSettled() {}, async readBundle() { return { [api.KEY]: clone(raw) }; }, async writeBundle(entry, next) { raw = clone(next[api.KEY]); } };
    const session = new Workspaces.Session(manager, entry.id); await session.ready();
    const store = new api.Store(api.createChromeBackend(null, null, session)), controller = new Controller(store, { delay: 60000 });
    t.after(() => controller.destroy()); return { session, entry, controller, raw: () => clone(raw) };
}
for (const mode of ['suspend', 'invalidate']) test(`real Session ${mode} retains its genuine WORKSPACE error`, async t => {
    const h = await sessionFixture(t), c = h.controller; await c.init(); c.setDraft('original workspace edit'); const before = h.raw();
    if (mode === 'suspend') h.session.suspendWrites(); else h.entry.generation = 'generation_retired';
    const code = mode === 'suspend' ? 'WORKSPACE_SWITCH_PENDING' : 'WORKSPACE_INVALIDATED';
    await assert.rejects(c.save(), { code }); assert.equal(c.error.code, code); assert.equal(c.writeError, true); assert.equal(c.draft, 'original workspace edit'); assert.deepEqual(h.raw(), before);
    if (mode === 'suspend') { h.session.resumeWrites(); await c.retry(); assert.equal(h.raw().content, c.draft); assert.equal(c.status, 'saved'); }
});

for (const source of ['backend', 'store']) for (const method of ['save', 'setEnabled', 'run']) test(`equal-revision foreign ${source} still receives no ${method} dispatch`, async t => {
    const h = fixture(t), c = h.controller; h.foreign.seed(state('foreign equal-revision text', 6)); await c.init();
    if (method !== 'setEnabled') c.setDraft('must remain an original draft'); const own = counts(h.own), before = snapshot(c), other = h.foreign.raw(); change(h, source);
    const pending = method === 'run' ? c.run('content', c.draft, 6) : method === 'setEnabled' ? c.setEnabled(false) : c.save();
    await assert.rejects(pending, { code: 'UNAVAILABLE' }); unchanged(c, before); assert.deepEqual(counts(h.own), own); isolated(h, other);
});
for (const source of ['backend', 'store']) test(`explicit Retry saves newer draft against known committed original revision after ${source} restoration`, async t => {
    const h = fixture(t), c = h.controller; await c.init(); c.setDraft('first committed text'); const gate = gateAt(h.own, 'write');
    const pending = c.save(); await gate.entered.promise; change(h, source); c.setDraft('second deliberate exact draft'); gate.release.resolve(); const first = await pending;
    isolated(h); assert.deepEqual(c.state, first); assert.equal(c.state.revision, 7); assert.equal(c.draft, 'second deliberate exact draft'); assert.equal(c.status, 'unsaved'); assert.equal(c.conflict, false);
    restore(h); await settle(); assert.equal(h.own.committed, 1, 'restoration alone does not replay'); await c.retry();
    assert.equal(h.own.committed, 2); assert.equal(h.own.raw().revision, 8); assert.equal(h.own.raw().content, 'second deliberate exact draft'); assert.equal(c.status, 'saved');
});
for (const mode of ['success', 'reject', 'ack']) test(`destroyed pending original ${mode} keeps real return outcome without publication`, async t => {
    const h = fixture(t), c = h.controller; await c.init(); c.setDraft('original destroyed transaction'); const gate = gateAt(h.own, 'write'); h.own.mode = mode;
    const pending = outcome(c.save()); await gate.entered.promise; c.destroy(); const before = snapshot(c); gate.release.resolve(); const result = await pending;
    if (mode === 'success') assert.equal(result.value.content, 'original destroyed transaction'); else assert.equal(result.error?.code, 'WRITE');
    unchanged(c, before, { pending: false, pendingWrite: false }); isolated(h); assert.equal(h.own.writes, 1); assert.equal(h.own.committed, mode === 'reject' ? 0 : 1);
});
test('owned unsubscribe is released exactly once across repeated destroy', async t => {
    const h = fixture(t); await h.controller.init(); h.controller.destroy(); h.controller.destroy(); assert.equal(h.own.unsubscribes, 1); assert.equal(h.own.callbacks().length, 0);
});
