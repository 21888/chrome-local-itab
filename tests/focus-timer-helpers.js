const { Store } = require('../shared/local-focus-store');
const { Controller } = require('../shared/local-focus-controller');
function harness() {
    let state, mono = 1000, wall = 1700000000000, queue = Promise.resolve(), writes = 0, failRead = false, failWrite = false, failAfterWrite = false, ids = 0;
    const listeners = new Set();
    const backend = { lock(fn) { const p = queue.then(fn); queue = p.catch(() => {}); return p; },
        async read() { if (failRead) throw Error('read'); return structuredClone(state); },
        async write(value) { if (failWrite) throw Error('write'); state = structuredClone(value); writes++; listeners.forEach(fn => fn()); if (failAfterWrite) throw Error('after write'); },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
    const store = () => new Store(backend, { now: () => wall, id: () => `session_${++ids}` });
    return { store, controller: () => new Controller(store(), { monotonic: () => mono, wall: () => wall }),
        advance(ms) { mono += ms; wall += ms; }, mono(ms) { mono += ms; }, wall(ms) { wall += ms; },
        get writes() { return writes; }, get state() { return structuredClone(state); }, set state(value) { state = value; },
        failRead(value) { failRead = value; }, failWrite(value) { failWrite = value; }, failAfterWrite(value) { failAfterWrite = value; },
        async flush() { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); } };
}
module.exports = { harness };
