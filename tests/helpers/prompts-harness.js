const assert = require('node:assert/strict');
const Core = require('../../shared/local-prompts-store.js');
const { Controller } = require('../../shared/local-prompts-controller.js');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup() {
    let raw, n = 0, queue = Promise.resolve(), writes = 0, fail = null;
    const listeners = new Set();
    const backend = {
        lock(action) { const run = queue.then(action); queue = run.catch(() => {}); return run; },
        async read() { return clone(raw); },
        async write(value) { writes++; raw = clone(value); for (const listener of listeners) listener(); if (fail) { const error = fail; fail = null; throw error; } },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
    };
    const store = new Core.Store(backend, { id: () => `test_${String(++n).padStart(8, '0')}`, now: () => '2026-10-10T00:00:00.000Z' });
    return { store, backend, controller: new Controller({ store }), get raw() { return clone(raw); }, get writes() { return writes; }, failOnce() { fail = new Error('unconfirmed write'); } };
}
async function add(c, title = 'Explain', body = 'Explain {{topic}} to {{reader}}. Again {{topic}}.') {
    c.create(); c.update('title', title); c.update('body', body); assert.equal(await c.save(), true); await tick(); return c.record();
}

async function settle(controller) {
    const deadline = Date.now() + 2000;
    await tick();
    while (controller.busy && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal(controller.busy, false, 'controller operation settled');
    await tick();
}
module.exports = { setup, add, tick, settle };
