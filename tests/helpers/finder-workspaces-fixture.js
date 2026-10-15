'use strict';
const W = require('../../shared/workspaces.js');
const F = require('../../shared/shortcut-finder-workspaces.js');
const seed = require('../fixtures/finder-workspaces-production.json');
const clone = value => structuredClone(value);
const id = n => `l_${n.toString(16).padStart(32, '0')}`;
async function fixture() {
    const raw = clone(seed.raw), listeners = new Set(), calls = { get: [], bytes: [], locks: [], writers: 0, manager: 0, held: [] };
    let forbidden = false, hook = null, serial = 0;
    const pick = keys => Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]]));
    const local = {
        async get(keys) { calls.get.push([...keys]); if (hook) await hook('get', keys); return clone(pick(keys)); },
        async getBytesInUse(keys) { calls.bytes.push([...keys]); if (hook) await hook('bytes', keys); return 1024; },
        async set(values) { calls.writers++; if (forbidden) throw Error('Forbidden writer'); Object.assign(raw, clone(values)); },
        async remove() { calls.writers++; throw Error('Forbidden writer'); }
    };
    const locks = { async request(name, options, action) {
        calls.locks.push([name, options.mode]); if (hook) await hook('lock', [name]);
        calls.held.push(name); try { return await action(); } finally { calls.held.pop(); }
    } };
    const chrome = { storage: { local, onChanged: { addListener() {}, removeListener() {} } } };
    const manager = W.createManager({ chrome, locks, now: () => '2026-10-15T00:00:00.000Z', id: () => `fixture_${++serial}` });
    const session = manager.capture('default'); await session.ready();
    forbidden = true;
    for (const name of ['ready', 'list', 'capture', 'registry', 'readSnapshot', 'checkLegacySource', 'select', 'verifiedSet', 'persistLegacyConflict']) {
        manager[name] = () => { calls.manager++; throw Error('Forbidden live Manager call'); };
    }
    const changes = { addListener: listener => listeners.add(listener), removeListener: listener => listeners.delete(listener) };
    let visible = true, invalidations = 0;
    const reader = F.createReader({ local, locks, changes, getSession: () => session, isVisible: () => visible, onInvalidate: () => invalidations++ });
    calls.get.length = calls.bytes.length = calls.locks.length = calls.writers = 0;
    return { raw, calls, local, locks, session, reader, changes, listeners, chrome: { storage: { local, onChanged: changes } },
        named: clone(seed.named), empty: clone(seed.empty), identity: clone(seed.identity),
        hook: value => { hook = value; }, visible: value => { visible = value; }, invalidations: () => invalidations,
        emit: (key, area = 'local') => { for (const listener of listeners) listener({ [key]: {} }, area); },
        namedValues: () => raw[W.bundleKey(seed.named)].values,
        defaultValues: () => raw[W.bundleKey(seed.identity)].values,
        directReads() { local.get = async keys => { calls.get.push([...keys]); if (hook) await hook('get', keys); return pick(keys); }; }
    };
}
module.exports = { fixture, W, F, clone, id };
