const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const api = require('../shared/local-scratchpad-store');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settled() { for (let i = 0; i < 4; i++) await tick(); }
async function model(t, { enabled = true, locale = 'en', settings = false, fail = true } = {}) {
    const initial = { ...api.initial(), enabled, revision: 4, content: 'Original 中文 😀\r\nexact text' };
    let raw = structuredClone(initial), queue = Promise.resolve(); const listeners = new Set();
    const backend = { fail, reads: 0, writes: 0, gate: null,
        lock(fn) { const promise = queue.then(fn); queue = promise.catch(() => {}); return promise; },
        async read() {
            backend.reads++; const value = structuredClone(raw), failed = backend.fail, gate = backend.gate; backend.gate = null;
            if (gate) { gate.entered.resolve(); await gate.release.promise; }
            if (failed) throw Error('synthetic read failure'); return value;
        },
        async write(value) { backend.writes++; raw = structuredClone(value); listeners.forEach(fn => fn()); },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    };
    const document = createDocument(); document.body.prepend = (...nodes) => document.body.append(...nodes);
    const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const window = { LocalItabScratchpad: { ...api }, i18n: { t: key => messages[key]?.message || key },
        addEventListener() {}, removeEventListener() {}, location: { reload() { throw Error('unexpected reload'); } } };
    const context = { window, document, setTimeout, clearTimeout }; vm.createContext(context);
    for (const file of ['shared/local-scratchpad-controller.js', 'shared/local-scratchpad-view.js', 'shared/local-content-lifecycle.js'])
        vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    const store = new api.Store(backend), controller = new window.LocalItabScratchpad.Controller(store, { delay: 60000 });
    const host = document.createElement('article'); document.body.append(host);
    const view = settings ? window.LocalItabScratchpad.mountSettings(host, { controller }) : new window.LocalItabScratchpad.View(host, { controller });
    window[settings ? 'localScratchpadSettingsView' : 'localScratchpadView'] = view;
    const gates = []; t.after(() => { gates.forEach(gate => gate.release.resolve()); view.destroy(); controller.destroy(); });
    await settled();
    return { backend, controller, store, host, view, window, initial, messages, raw: () => structuredClone(raw),
        seed(value) { raw = structuredClone(value); listeners.forEach(fn => fn()); },
        pause() { const gate = { entered: deferred(), release: deferred() }; gates.push(gate); backend.gate = gate; return gate; } };
}
for (const settings of [false, true]) for (const locale of ['en', 'zh_CN']) test(`read Retry remains recoverable after another failure, ${settings ? 'settings' : 'card'}, ${locale}`, async t => {
    const h = await model(t, { settings, locale }), c = h.controller;
    assert(c.readError); assert(!c.loaded); const gate = h.pause(), retry = c.retry();
    const rejected = assert.rejects(retry, { code: 'READ' }); await gate.entered.promise;
    assert(c.pending); assert(!c.pendingWrite); assert(h.window.LocalItabContentLifecycle.pending());
    gate.release.resolve(); await rejected; assert(!c.pending); assert(c.readError); assert(!c.loaded);
    const button = settings ? h.host.querySelector('button') : h.view.retry;
    assert(!button.hidden); assert(!button.disabled); assert.deepEqual(h.raw(), h.initial); assert.equal(h.backend.writes, 0);
    h.backend.fail = false; button.dispatch('click'); await settled();
    assert(!c.error); assert(c.loaded); assert.equal(c.draft, h.initial.content); assert.equal(h.backend.writes, 0);
    if (!settings) { c.setDraft('Explicit later edit'); await c.save(); assert.equal(h.backend.writes, 1); assert.equal(h.raw().content, 'Explicit later edit'); }
});

test('clean hidden Scratchpad read Retry stays private, unlike a draft-discard action', async t => {
    const h = await model(t, { enabled: false, fail: false }), c = h.controller;
    h.backend.fail = true; await assert.rejects(c.refresh(), { code: 'READ' }); assert(h.host.hidden);
    h.backend.fail = false; const gate = h.pause(), retry = c.retry(); await gate.entered.promise;
    assert(c.pending); assert(!c.hasUncommittedWork()); assert(h.host.hidden); assert.equal(c.draft, h.initial.content);
    gate.release.resolve(); await retry; assert(h.host.hidden); assert(!c.conflict); assert.equal(h.backend.writes, 0);
});

test('owned read Retry drains a notification before lifecycle settlement without writing', async t => {
    const h = await model(t), c = h.controller; h.backend.fail = false;
    const gate = h.pause(), retry = c.retry(); await gate.entered.promise;
    const next = { ...h.initial, revision: 5, content: 'Newer saved note' }; h.seed(next);
    let complete = false; const waiting = h.window.LocalItabContentLifecycle.saveDrafts().then(value => { complete = true; return value; });
    await tick(); assert(!complete); assert(c.refreshNeeded); gate.release.resolve(); await retry;
    assert.equal(await waiting, true); assert.equal(c.draft, next.content); assert.equal(c.state.revision, 5);
    assert(!c.pending); assert(!c.refreshNeeded); assert.equal(h.backend.writes, 0);
});

test('new typing after first recovery render is retained while queued latest state becomes a conflict', async t => {
    const h = await model(t), c = h.controller; h.backend.fail = false;
    const gate = h.pause(), retry = c.retry(); await gate.entered.promise;
    h.seed({ ...h.initial, revision: 5, content: 'Remote newer note' });
    let edited = false; c.subscribe(() => { if (!edited && c.loaded) { edited = true; c.setDraft('New local draft'); } });
    gate.release.resolve(); await retry;
    assert.equal(c.draft, 'New local draft'); assert.equal(c.state.content, 'Remote newer note'); assert(c.conflict);
    assert(c.hasUncommittedWork()); assert.equal(h.backend.writes, 0);
    assert.equal(await h.window.LocalItabContentLifecycle.saveDrafts(), false); assert.equal(h.backend.writes, 0);
});

for (const retirement of ['destroy', 'backend replacement']) test(`owned initial Retry cannot publish after ${retirement}`, async t => {
    const h = await model(t), c = h.controller; h.backend.fail = false;
    const gate = h.pause(), retry = c.retry(); await gate.entered.promise;
    const error = c.error;
    if (retirement === 'destroy') c.destroy(); else h.store.backend = { read() { throw Error('foreign read forbidden'); } };
    gate.release.resolve(); await retry;
    assert(!c.loaded); assert.equal(c.draft, ''); assert.strictEqual(c.error, error); assert(!c.pending); assert.equal(h.backend.writes, 0);
});

test('passive background read remains non-owning and does not create draft ownership', async t => {
    const h = await model(t, { fail: false }), c = h.controller, gate = h.pause(), read = c.refresh();
    await gate.entered.promise; assert(!c.pending); assert(!c.hasUncommittedWork());
    gate.release.resolve(); await read; assert.equal(h.backend.writes, 0); assert.equal(c.draft, h.initial.content);
});
