/* Synthetic browser script ordering only: no installed-extension or incident claim. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function page(mode) {
    const raw = { quote: 'Synthetic retained quote', sync: { enabled: false } };
    const before = JSON.stringify(raw), calls = [];
    const local = {
        async get(keys) { calls.push('get'); return structuredClone(keys == null ? raw : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in raw).map(key => [key, raw[key]]))); },
        async set(values) { calls.push('set'); Object.assign(raw, structuredClone(values)); },
        async remove(keys) { calls.push('remove'); for (const key of keys) delete raw[key]; }
    };
    const context = {
        console: { log() {}, warn() {}, error() {} }, URL, TextEncoder, TextDecoder,
        structuredClone, setTimeout, clearTimeout, crypto: webcrypto,
        navigator: { locks: { request: async (name, options, action) => (action || options)() } },
        chrome: { storage: { local, sync: {get: async () => { calls.push('sync.get'); return {}; }, set: async () => { calls.push('sync.set'); }, remove: async () => { calls.push('sync.remove'); }}, onChanged: { addListener() {}, removeListener() {} } } },
        location: { href: 'chrome-extension://synthetic/newtab.html' + (mode === 'invalid-id' ? '?workspace=invalid%20id' : '') }
    };
    context.window = context; context.globalThis = context; vm.createContext(context);
    let bootstrapError;
    const scripts = [...fs.readFileSync('newtab.html', 'utf8').matchAll(/<script[^>]*src="([^"]+)"/g)].map(match => match[1]);
    for (const file of scripts) {
        if (file === 'shared/workspaces.js' && mode === 'missing') continue;
        try { vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file }); }
        catch (error) { if (file !== 'shared/workspaces.js') throw error; bootstrapError = error; }
        if (file === 'storage.js') break;
    }
    return { context, store: context.storageManager, raw, before, calls, bootstrapError };
}

for (const mode of ['missing', 'invalid-id']) test(`browser ${mode} workspace bootstrap cannot read defaults or write legacy root`, async () => {
    const p = page(mode);
    if (mode === 'invalid-id') assert.equal(p.bootstrapError.code, 'WORKSPACE_NOT_FOUND');
    assert.equal(p.store.workspace, null);
    for (const operation of [
        () => p.store.get('categories'), () => p.store.getAll(),
        () => p.store.set('quote', 'Synthetic rejected edit'),
        () => p.store.setAll({quote: 'Synthetic rejected edit'}, {expectedSettings: {generation: null, values: {quote: p.raw.quote}}, settingsPaths: ['quote']}),
        () => p.store.pullFromSync(), () => p.store.pushToSync()
    ]) await assert.rejects(operation, {code: 'WORKSPACE_UNAVAILABLE'});
    assert.throws(() => p.store.onLocalChanged(() => {}), {code: 'WORKSPACE_UNAVAILABLE'});
    assert.throws(() => p.store.local, {code: 'WORKSPACE_UNAVAILABLE'});
    assert.throws(() => p.store._local, {code: 'WORKSPACE_UNAVAILABLE'});
    assert.deepEqual(p.calls, []);
    assert.equal(JSON.stringify(p.raw), p.before);
    // A later global assignment must not silently retarget an already-created page.
    p.context.LocalItabWorkspaces = {session: {}};
    await assert.rejects(() => p.store.getAll(), {code: 'WORKSPACE_UNAVAILABLE'});
});

test('normal browser bootstrap retains the captured session and guarded Settings save', async () => {
    const p = page('normal');
    assert.equal(p.bootstrapError, undefined);
    assert.equal(p.store.workspace, p.context.LocalItabWorkspaces.session);
    const captured = p.store.workspace;
    p.context.LocalItabWorkspaces.session = {ready: () => { throw new Error('must not retarget'); }};
    const config = await p.store.getAll();
    assert.equal(p.store.workspace, captured);
    assert.equal(config.quote, 'Synthetic retained quote');
    await p.store.setAll({quote: 'Synthetic explicit edit'}, {expectedSettings: config._settingsBaseline, settingsPaths: ['quote']});
    assert.equal((await p.store.getAll()).quote, 'Synthetic explicit edit');
    assert.equal(p.raw.quote, 'Synthetic retained quote');
});

test('CommonJS standalone historical backend remains explicit and available', async () => {
    const Storage = require('../storage.js');
    const previous = global.chrome;
    const raw = {quote: 'Synthetic standalone'};
    try {
        global.chrome = {storage: {local: {get: async () => structuredClone(raw)}}};
        const store = new Storage();
        assert.equal(store.workspace, null);
        assert.equal((await store.getAll()).quote, raw.quote);
    } finally { if (previous === undefined) delete global.chrome; else global.chrome = previous; }
});
