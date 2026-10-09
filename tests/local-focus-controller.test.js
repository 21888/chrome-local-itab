const { test } = require('node:test');
const assert = require('node:assert/strict');
const api = require('../shared/local-focus-store');
const { harness } = require('./focus-timer-helpers');
test('manual transitions, bounded duration and phases; no auto-start', async () => {
    const h = harness(), c = h.controller(); await c.refresh(); assert.equal(c.snapshot().session.status, 'ready'); assert.equal(h.writes, 0);
    for (const value of [0, -1, 181, 1.5, NaN, Infinity, '25']) await assert.rejects(c.action('duration', value));
    await c.action('duration', 1); await c.action('start'); await assert.rejects(c.action('start'));
    await assert.rejects(c.action('phase', 'break')); await assert.rejects(c.action('duration', 2));
    await c.action('pause'); await c.action('resume'); await c.action('reset'); assert.equal(c.snapshot().session.status, 'ready');
    await c.action('phase', 'break'); assert.equal(c.snapshot().session.remainingMs, 300000); c.destroy();
});
test('delayed ticks and hidden interval use elapsed time; completion commits only once', async () => {
    const h = harness(), c = h.controller(); await c.refresh(); await c.action('duration', 1); await c.action('start'); const writes = h.writes;
    h.advance(59999); c.tick(); assert.equal(api.formatRemaining(c.snapshot().session.remainingMs), '0:01'); assert.equal(h.writes, writes);
    h.advance(600000); c.tick(); await h.flush(); assert.equal(c.snapshot().session.status, 'completed'); assert.equal(c.snapshot().session.remainingMs, 0);
    assert.equal(h.writes, writes + 1); for (let i = 0; i < 10; i++) c.tick(); await h.flush(); assert.equal(h.writes, writes + 1);
    await c.action('phase', 'break'); assert.equal(c.snapshot().session.status, 'ready'); c.destroy();
});
test('pause excludes elapsed time and persists across reload; resume is manual', async () => {
    const h = harness(), c = h.controller(); await c.refresh(); await c.action('start'); h.advance(20000); await c.action('pause');
    assert.equal(c.snapshot().session.remainingMs, 1480000); c.destroy(); h.advance(999999);
    const reloaded = h.controller(); await reloaded.refresh(); assert.equal(reloaded.snapshot().session.status, 'paused'); assert.equal(reloaded.snapshot().session.remainingMs, 1480000);
    await reloaded.action('resume'); h.advance(1000); reloaded.tick(); assert.equal(reloaded.snapshot().session.remainingMs, 1479000); reloaded.destroy();
});
test('reopen running or completed deadline; long sleep, backward clock, forward jump', async () => {
    let h = harness(), c = h.controller(); await c.refresh(); await c.action('start'); c.destroy(); h.advance(10000);
    c = h.controller(); await c.refresh(); assert.equal(c.snapshot().session.remainingMs, 1490000); c.destroy(); h.advance(86400000);
    c = h.controller(); await c.refresh(); await h.flush(); assert.equal(c.snapshot().session.status, 'completed'); c.destroy();
    for (const change of [h => h.wall(10000), h => h.wall(-10000), h => h.mono(-1)]) {
        h = harness(); c = h.controller(); await c.refresh(); await c.action('start'); change(h); c.tick(); await h.flush();
        assert.equal(c.snapshot().session.status, 'uncertain'); await assert.rejects(c.action('resume')); await c.action('reset'); assert.equal(c.snapshot().session.status, 'ready'); c.destroy();
    }
    h = harness(); c = h.controller(); await c.refresh(); await c.action('start'); c.destroy(); h.wall(-10000);
    c = h.controller(); await c.refresh(); assert.equal(c.snapshot().session.status, 'uncertain'); c.destroy();
});
test('two pages share session; simultaneous and stale revision commands cannot overwrite newer state', async () => {
    const h = harness(), a = h.controller(), b = h.controller(); await Promise.all([a.refresh(), b.refresh()]);
    const results = await Promise.allSettled([a.action('start'), b.action('start')]); assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
    await h.flush(); assert.equal(a.state.session.id, b.state.session.id); const stale = a.state.revision;
    await a.action('reset'); await a.action('start'); await h.flush(); assert(!b.tick(stale));
    await assert.rejects(h.store().mutate({ kind: 'pause', revision: stale }), { code: 'CONFLICT' });
    assert.equal(a.snapshot().session.status, 'running'); a.destroy(); b.destroy();
});
test('storage failure and uncertain post-write failure are recoverable without replay', async () => {
    const h = harness(), c = h.controller(); h.failRead(true); await assert.rejects(c.refresh()); assert.equal(c.state, null);
    h.failRead(false); await c.refresh(); h.failWrite(true); await assert.rejects(c.action('start')); assert.equal(c.snapshot().session.status, 'ready');
    h.failWrite(false); h.failAfterWrite(true); await assert.rejects(c.action('start')); assert.equal(c.snapshot().session.status, 'running');
    h.failAfterWrite(false); await c.refresh(); assert.equal(c.snapshot().session.status, 'running'); assert.equal(h.writes, 1); c.destroy();
});
test('invalid persisted state is rejected and never overwritten', async () => {
    for (const mutate of [v => v.schemaVersion = 2, v => v.session.remainingMs = -1, v => v.taskLabel = 'PRIVATE_SENTINEL', v => v.session.deadline = 123]) {
        const h = harness(), state = api.initial(); mutate(state); h.state = state; const c = h.controller(); await assert.rejects(c.refresh()); assert.equal(h.writes, 0); c.destroy();
    }
});
test('visibility-only writes preserve session and durations exactly', async () => {
    const h = harness(), c = h.controller(); await c.refresh(); await c.action('start'); const saved = structuredClone(c.state.session);
    await c.action('visibility', true); await c.action('visibility', false); assert.deepEqual(c.state.session, saved); c.destroy();
});
test('Chrome dictionary property reordering does not produce a false verification failure', async () => {
    let raw; const reverse = value => value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).reverse().map(key => [key, reverse(value[key])])) : value;
    const backend = { lock: fn => fn(), read: async () => raw, write: async value => { raw = reverse(value); }, subscribe: () => () => {} };
    const store = new api.Store(backend, { now: () => 1700000000000, id: () => 'session_order' });
    const state = await store.mutate({ kind: 'start', revision: 0 }); assert.equal(state.session.status, 'running');
});
test('clock uncertainty survives failed save and retry read; reset is explicit', async () => {
    const h = harness(), c = h.controller(); await c.refresh(); await c.action('start'); h.failWrite(true); h.wall(9000); c.tick(); await h.flush();
    assert.equal(c.snapshot().session.status, 'uncertain'); h.failWrite(false); await c.refresh(); await h.flush(); assert.equal(c.snapshot().session.status, 'uncertain');
    await c.action('reset'); assert.equal(c.snapshot().session.status, 'ready'); c.destroy();
});
test('small clock drift at completion boundary never finishes ahead of monotonic elapsed', async () => {
    for (const drift of [1000, -1000]) {
        const h = harness(), c = h.controller(); await c.refresh(); await c.action('duration', 1); await c.action('start');
        h.advance(drift > 0 ? 59000 : 60000); h.wall(drift);
        const view = c.snapshot(); assert.equal(view.session.status, 'uncertain');
        if (drift > 0) assert.equal(view.session.remainingMs, 1000);
        c.tick(); await h.flush(); assert.equal(c.state.session.status, 'uncertain'); assert.notEqual(c.state.session.status, 'completed'); c.destroy();
    }
});
