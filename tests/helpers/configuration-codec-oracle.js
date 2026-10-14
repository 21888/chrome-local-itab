'use strict';

// TEST ONLY: this cold oracle is the original v1.1.139 Storage implementation,
// not a wrapper around today's Storage or its extracted configuration codec.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
const BASELINE_COMMIT = '008b97ab064d323baa4b26d8e6f72f57da2feca3';
const BASELINE_SHA256 = 'bc51d96953fa58ea790cc1e77cfc910d779017198039f5f73968cc2475c31060';
const BASELINE_PATH = path.join(ROOT, 'tests/fixtures/configuration-codec/formal139-storage.js');
const BASELINE_DEPENDENCIES = Object.freeze({
    'shared/layout-identity.js': '5b75dd17cabd1a6be31c744312f29dbd538581c20c096f618960d111476862e2',
    'shared/dashboard-template-registry.js': 'bdfe28d483725af1021dd36e18fc8a23edd657c3cb87eeed2de1dd953f4438a9',
    'shared/world-clocks.js': '8f95d6acc0a9c61802e2a8a9c25eb6623a9875bdbaf38090aa5704e5e99fe600',
    'shared/stored-shortcut-url.js': '090916ba45148e2863dd76d2d8cb3d76a2771cdd53e6fa1b7dc4ecd25bcb37fe'
});
const EPOCH = Date.parse('2026-10-14T12:34:56.789Z');
const dependencies = new Set([
    'shared/layout-identity.js', 'shared/dashboard-template-registry.js',
    'shared/world-clocks.js', 'shared/stored-shortcut-url.js',
    'shared/configuration-codec.js'
]);

function baselineBytes() {
    const bytes = fs.readFileSync(BASELINE_PATH);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), BASELINE_SHA256,
        'The formal139 cold oracle must remain byte-for-byte identical to its pinned source.');
    return bytes;
}

function baselineDependency(relative) {
    assert(Object.hasOwn(BASELINE_DEPENDENCIES, relative), `Unpinned formal139 dependency: ${relative}`);
    const bytes = fs.readFileSync(path.join(ROOT, 'tests/fixtures/configuration-codec', relative));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), BASELINE_DEPENDENCIES[relative],
        `The formal139 ${relative} dependency must remain byte-for-byte identical to its pinned source.`);
    return bytes.toString('utf8');
}

// Preserve undefined, NaN, signed zero, holes, cycles and accessor descriptors.
// No getter, setter, toJSON or user-provided conversion hook is executed.
function inspect(value, seen = new Map(), descriptors = false) {
    if (value === null || typeof value !== 'object') return value;
    if (seen.has(value)) return { reference: seen.get(value) };
    const id = seen.size; seen.set(value, id);
    const properties = Reflect.ownKeys(value).map(key => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        const entry = Object.hasOwn(descriptor, 'value')
            ? { value: inspect(descriptor.value, seen, descriptors) }
            : { get: descriptor.get, set: descriptor.set };
        if (descriptors) Object.assign(entry, {
            enumerable: descriptor.enumerable, configurable: descriptor.configurable,
            ...(Object.hasOwn(descriptor, 'writable') ? { writable: descriptor.writable } : {})
        });
        return [key, entry];
    });
    return { id, array: Array.isArray(value), ...(descriptors ? { prototype: Object.getPrototypeOf(value) } : {}), properties };
}

function failure(error) {
    return { name: error.name, message: error.message, code: error.code, kind: error.kind };
}

function createRealm(kind, { workspace = false, getMessage = () => '', manifestVersion = '1.1.139-synthetic' } = {}) {
    const events = [], warnings = [], modules = [], cache = new Map(), raw = {};
    class FixedDate extends Date {
        constructor(...args) { super(...(args.length ? args : [EPOCH])); }
        static now() { return EPOCH; }
    }
    const forbidden = name => (...args) => { events.push(name); throw new Error(`Synthetic forbidden API: ${name}`); };
    const pick = keys => keys == null ? raw : Object.fromEntries((Array.isArray(keys) ? keys : [keys])
        .filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]]));
    const local = {
        async get(keys) { events.push('local.get'); return pick(keys); },
        async set() { events.push('local.set'); throw new Error('Synthetic writes are forbidden'); },
        remove: forbidden('local.remove'), clear: forbidden('local.clear')
    };
    const chrome = {
        storage: { local, sync: { get: forbidden('sync.get'), set: forbidden('sync.set'), remove: forbidden('sync.remove') },
            onChanged: { addListener() { events.push('listener.add'); }, removeListener() { events.push('listener.remove'); } } },
        i18n: { getMessage(key) { events.push(`locale:${key}`); return getMessage(key); } },
        runtime: { getManifest() { events.push('manifest.get'); return { version: manifestVersion }; } },
        identity: { getAuthToken: forbidden('identity.getAuthToken') }
    };
    const sandbox = {
        Date: FixedDate, URL, TextEncoder, TextDecoder, structuredClone,
        chrome, console: { log() {}, error() {}, warn(...args) {
            warnings.push(args.map(value => value && typeof value === 'object' && typeof value.message === 'string' ? failure(value) : value));
        } },
        crypto: { randomUUID() { return '00000000-0000-4000-8000-000000000139'; } },
        fetch: forbidden('fetch'), setTimeout: forbidden('setTimeout'), clearTimeout: forbidden('clearTimeout'),
        setInterval: forbidden('setInterval'), clearInterval: forbidden('clearInterval'),
        navigator: { locks: { request: forbidden('locks.request') } },
        document: { addEventListener: forbidden('document.addEventListener') }
    };
    const context = vm.createContext(sandbox);
    function load(relative, sourceOverride) {
        if (cache.has(relative)) return cache.get(relative).exports;
        if (relative !== 'storage.js') assert(dependencies.has(relative), `Unexpected oracle dependency: ${relative}`);
        if (kind === 'oracle') assert.notEqual(relative, 'shared/configuration-codec.js', 'Cold oracle must never import the candidate codec.');
        const source = sourceOverride || (kind === 'oracle' ? baselineDependency(relative) : fs.readFileSync(path.join(ROOT, relative), 'utf8'));
        modules.push(relative);
        const module = { exports: {} }; cache.set(relative, module);
        const requireInRealm = specifier => {
            assert(specifier.startsWith('.'), `Only local pure dependencies are allowed: ${specifier}`);
            const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier));
            assert(dependencies.has(resolved), `Unexpected source dependency: ${specifier}`);
            return load(resolved);
        };
        const wrapper = new vm.Script(`(function (require, module, exports) {\n${source}\n})`, { filename: relative }).runInContext(context);
        wrapper(requireInRealm, module, module.exports);
        return module.exports;
    }
    let api, instance;
    if (kind === 'pure') {
        api = load('shared/configuration-codec.js');
        instance = api.create({ getMessage, now: () => EPOCH, workspace, warn: (...args) => sandbox.console.warn(...args) });
    } else {
        api = load('storage.js', kind === 'oracle' ? baselineBytes().toString('utf8') : undefined);
        const session = workspace ? {
            id: 'synthetic', requestedId: 'synthetic', local, lockedLocal: local,
            manager: { chrome, configureValidation() { events.push('workspace.configureValidation'); } },
            withLock: fn => fn()
        } : null;
        instance = new api({ workspace: session });
        // Tests exercise the already-initialized storage read boundary; invoking
        // providers or migrations is deliberately impossible in this harness.
        instance.ensureSyncInitialized = async () => {};
        instance.withLocalWriteLock = async fn => fn();
    }
    return { api, instance, events, warnings, modules, context, raw, load };
}

module.exports = { ROOT, BASELINE_COMMIT, BASELINE_SHA256, BASELINE_PATH, BASELINE_DEPENDENCIES, EPOCH,
    baselineBytes, baselineDependency, inspect, failure, createRealm };
