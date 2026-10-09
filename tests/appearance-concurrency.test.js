const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { webcrypto } = require('node:crypto');
const StorageManager = require('../storage.js');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');

// Actual dashboard/Options mount, appearance Controller and StorageManager over
// separate page globals and shared storage/Web Locks. No persistence stub or
// browser/provider access. Gates deterministically expose the queued boundaries.
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const same = (actual, expected, message) => assert.deepEqual(clone(actual), clone(expected), message);
const turn = () => new Promise(resolve => setImmediate(resolve));
const bounded = (name, fn) => test(name, { timeout: 8000 }, fn);
const GENERATION = '__localItabSettingsGeneration';
const PERSONAL = ['__localItabPersonalTasksV1', '__localItabFocusV1', '__localItabScratchpadV1', '__localItabCountdownV1'];

function fixture(initial) {
    let state = initial === undefined ? new StorageManager().cloneDefaultConfig() : clone(initial);
    if (initial === undefined) {
        state.links = [{ title: 'Keep', url: 'https://example.com/', category: 'work' }];
        state.layout = { autoArrange: false, alignToGrid: false, gridSize: 144, columns: 4,
            positions: { 'all|https://example.com/': { x: 37.25, y: 53.5 } } };
        for (const key of PERSONAL) state[key] = { opaque: [key, { keep: true }] };
    }
    const writes = [], reads = [], listeners = [], queues = new Map(), locksUsed = [];
    const hooks = { read: null, write: null, afterWrite: null, lock: null };
    let forbiddenCalls = 0, held = false;
    const forbidden = () => { forbiddenCalls++; throw new Error('Unexpected provider/network/permission call'); };
    const locks = { request(name, operation) {
        locksUsed.push(name);
        const result = (queues.get(name) || Promise.resolve()).then(async () => {
            await hooks.lock?.(name); held = true;
            try { return await operation(); } finally { held = false; }
        });
        queues.set(name, result.catch(() => {})); return result;
    } };
    Object.defineProperty(global, 'navigator', { configurable: true, value: { locks } });
    global.crypto = webcrypto;
    global.chrome = { permissions: { request: forbidden }, identity: { getAuthToken: forbidden }, storage: {
        onChanged: { addListener(fn) { listeners.push(fn); } }, local: {
            async get(keys) {
                reads.push({ keys: clone(keys), held }); await hooks.read?.(keys);
                return keys === null ? clone(state) : Object.fromEntries(keys.filter(key => key in state).map(key => [key, clone(state[key])]));
            },
            async set(values) {
                await hooks.write?.(values);
                const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { oldValue: clone(state[key]), newValue: clone(value) }]));
                writes.push(clone(values)); Object.assign(state, clone(values));
                for (const fn of listeners) fn(changes, 'local');
                await hooks.afterWrite?.(values);
            },
            async remove(keys) {
                const changes = Object.fromEntries(keys.map(key => [key, { oldValue: clone(state[key]) }]));
                for (const key of keys) delete state[key];
                for (const fn of listeners) fn(changes, 'local');
            }
        }
    } };
    function manager() { const m = new StorageManager(); m._syncInitialized = true; return m; }
    async function settle() { for (let i = 0; i < 3; i++) { await turn(); await Promise.all([...queues.values()]); } }
    async function page(kind = 'dashboard', locale) {
        const storage = manager(), config = await storage.getAll(), document = createDocument();
        const host = document.createElement('div'); host.id = kind === 'options' ? 'options-appearance' : 'dashboard-appearance'; document.body.append(host);
        const window = { document, chrome: global.chrome, storageManager: storage, addEventListener() {}, location: { reload: forbidden } };
        if (locale) {
            const messages = JSON.parse(source(`_locales/${locale}/messages.json`)); window.i18n = { t: key => messages[key]?.message || key };
        }
        const context = vm.createContext({ window, document, storageManager: storage, chrome: global.chrome,
            navigator: global.navigator, crypto: webcrypto, console: { log() {}, warn() {}, error() {} },
            URL, TextEncoder, Blob, setTimeout, clearTimeout, setInterval: forbidden, fetch: forbidden });
        for (const file of ['shared/dashboard-template-registry.js', 'shared/appearance.js', kind === 'options' ? 'options.js' : 'newtab.js']) vm.runInContext(source(file), context);
        if (kind === 'options') await context.populateFormFields(config); else context.setupDashboardAppearance(config);
        const controller = window.appearanceController;
        const control = field => host.querySelector(`[data-appearance-field="${field}"]`);
        return { storage, config, window, document, context, host, controller,
            status: host.querySelector('.appearance-status'), control,
            async choose(field, value) { const select = control(field); select.value = value; select.dispatch('change'); return controller.queue; } };
    }
    return { manager, page, writes, reads, hooks, locksUsed, settle, state: () => clone(state),
        patch(values) { Object.assign(state, clone(values)); }, get forbiddenCalls() { return forbiddenCalls; },
        pauseNextWrite(fail = false) {
            const entered = deferred(), resume = deferred();
            hooks.write = async () => { hooks.write = null; entered.resolve(); await resume.promise; if (fail) throw new Error('injected write failure'); };
            return { entered: entered.promise, resume: resume.resolve };
        } };
}
const appearance = (template = 'clarity', colorMode = 'light') => ({ template, colorMode });

for (const order of ['template-first', 'color-first']) bounded(`concurrent dashboard/Settings appearance fields merge ${order}`, async () => {
    const f = fixture(), a = await f.page(), b = await f.page('options'), before = f.state();
    const choices = order === 'template-first' ? [['template', 'folio'], ['colorMode', 'dark']] : [['colorMode', 'dark'], ['template', 'folio']];
    same(await Promise.all([a.choose(...choices[0]), b.choose(...choices[1])]), [true, true]); await f.settle();
    same(f.state(), { ...before, appearance: appearance('folio', 'dark') });
    for (const page of [a, b]) {
        same(page.controller.confirmed, appearance('folio', 'dark'));
        assert.equal(page.control('template').value, 'folio'); assert.equal(page.control('colorMode').value, 'dark');
        assert.equal(page.document.documentElement.dataset.dashboardTemplate, 'folio');
        assert.equal(page.document.documentElement.dataset.colorMode, 'dark');
    }
    assert(f.writes.every(value => Object.keys(value).join() === 'appearance'));
    assert(f.reads.filter(read => read.keys?.includes(GENERATION)).every(read => read.held), 'generation reads are inside the write lock');
    assert(f.locksUsed.every(name => name === 'local-itab-local-write')); assert.equal(f.forbiddenCalls, 0);
});

bounded('same-field explicit choices retain last serialized intent', async () => {
    const f = fixture(), a = await f.page(), b = await f.page('options');
    same(await Promise.all([a.choose('template', 'graphite'), b.choose('template', 'folio')]), [true, true]);
    await f.settle(); same(f.state().appearance, appearance('folio'));
    assert.equal(await a.choose('template', 'clarity'), true); same(f.state().appearance, appearance());
});

bounded('same-page rapid choices coalesce both axes without replaying other settings', async () => {
    const f = fixture(), a = await f.page(), before = f.state();
    const first = a.choose('template', 'graphite'), second = a.choose('colorMode', 'dark'), third = a.choose('template', 'folio');
    same(await Promise.all([first, second, third]), [false, false, true]); await f.settle();
    same(f.writes, [{ appearance: appearance('folio', 'dark') }]); same(f.state(), { ...before, appearance: appearance('folio', 'dark') });
});

bounded('queued color choice cannot replay an acknowledged template over another tab', async () => {
    const f = fixture(), a = await f.page(), b = await f.page('options'), gate = f.pauseNextWrite();
    const first = a.choose('template', 'graphite'); await gate.entered;
    const other = b.choose('template', 'folio'); await turn();
    const next = a.choose('colorMode', 'dark'); gate.resume();
    same(await Promise.all([first, other, next]), [true, true, true]); await f.settle();
    same(f.writes.map(value => value.appearance), [appearance('graphite'), appearance('folio'), appearance('folio', 'dark')]);
    same(a.controller.confirmed, appearance('folio', 'dark'));
});

bounded('newer same-value template intent remains owned after an earlier write completes', async () => {
    const f = fixture(), a = await f.page(), b = await f.page('options'), gate = f.pauseNextWrite();
    const first = a.choose('template', 'graphite'); await gate.entered;
    const other = b.choose('template', 'folio'); await turn();
    const next = a.choose('template', 'graphite'); gate.resume();
    same(await Promise.all([first, other, next]), [true, true, true]); await f.settle(); same(f.state().appearance, appearance('graphite'));
});

bounded('failure of newest choice restores the preceding committed local choice and visible error', async () => {
    const f = fixture(), a = await f.page(), gate = f.pauseNextWrite();
    const first = a.choose('template', 'graphite'); await gate.entered;
    const next = a.choose('template', 'folio');
    f.hooks.write = async () => { throw new Error('later write failed'); }; gate.resume();
    same(await Promise.all([first, next]), [true, false]); await f.settle();
    same(f.state().appearance, appearance('graphite')); same(a.controller.confirmed, appearance('graphite'));
    assert.equal(a.document.documentElement.dataset.dashboardTemplate, 'graphite');
    assert.equal(a.host.dataset.saveState, 'error'); assert.match(a.status.textContent, /Could not save/);
});

for (const failure of ['read', 'write', 'lock']) bounded(`${failure} rejection preserves saved data and permits an explicit retry`, async () => {
    const f = fixture(), a = await f.page('options'), before = f.state();
    f.hooks[failure] = async keys => { if (failure !== 'read' || keys === null || keys.includes('appearance')) throw new Error(`${failure} failed`); };
    assert.equal(await a.choose('template', 'folio'), false); await f.settle();
    same(f.state(), before); assert.equal(f.writes.length, 0); assert.equal(a.control('template').value, 'clarity');
    assert.equal(a.host.dataset.saveState, 'error'); assert.match(a.status.textContent, /Could not save/);
    f.hooks[failure] = null; assert.equal(await a.choose('template', 'folio'), true); same(f.state().appearance, appearance('folio'));
});

bounded('failed acknowledgement surfaces an error without retrying or rolling back a committed appearance', async () => {
    const f = fixture(), a = await f.page();
    f.hooks.afterWrite = async () => { throw new Error('injected acknowledgement failure'); };
    assert.equal(await a.choose('template', 'folio'), false); await f.settle();
    same(f.state().appearance, appearance('folio')); same(a.controller.confirmed, appearance('folio'));
    assert.equal(f.writes.length, 1); assert.equal(a.host.dataset.saveState, 'error');
    assert.match(a.status.textContent, /Could not save/); assert.equal(a.controller.pending, 0);
});

bounded('initialization failure and malformed replacement generation cannot authorize an appearance write', async () => {
    for (const failure of ['initialization', 'generation']) {
        const f = fixture(), a = await f.page();
        if (failure === 'initialization') a.storage.ensureSyncInitialized = async () => { throw new Error('initialization failed'); };
        else f.patch({ [GENERATION]: 17 });
        const before = f.state(); assert.equal(await a.choose('template', 'folio'), false);
        same(f.state(), before); assert.equal(f.writes.length, 0); assert.equal(a.host.dataset.saveState, 'error');
    }
});

bounded('missing initial baseline and missing Web Locks fail closed with guidance', async () => {
    for (const failure of ['initial read', 'locks']) {
        const f = fixture();
        if (failure === 'initial read') f.hooks.read = async () => { throw new Error('initial read failed'); };
        const a = await f.page(); f.hooks.read = null;
        if (failure === 'locks') delete global.navigator.locks;
        const before = f.state(); assert.equal(await a.choose('template', 'folio'), false);
        same(f.state(), before); assert.equal(f.writes.length, 0); assert.match(a.status.textContent, /open a new tab/);
    }
});

for (const replacement of ['restore', 'reset', 'Sync']) bounded(`${replacement} invalidates both old page generations, even after refresh`, async () => {
    const f = fixture(), a = await f.page(), b = await f.page('options'), m = f.manager(), before = f.state();
    if (replacement === 'restore') assert.equal(await m.setAll(m.validateConfigObject(before), { confirmedRestore: true }), true);
    else if (replacement === 'reset') assert.equal(await m.clear(), true);
    else {
        const payload = m.prepareSyncPayload(before).payload;
        const remote = { payload, validated: m.validateImportPayload(payload), schema: 1, meta: { enabled: true, updatedAt: '2026-10-09T22:00:00.000Z' },
            revision: 'appearance-test-remote', fingerprint: await m.fingerprint({ schema: 1, payload }) };
        assert.equal((await m.acceptSyncSnapshot(remote)).applied, true);
    }
    await f.settle(); const after = f.state(), count = f.writes.length; assert(after[GENERATION]);
    for (const key of PERSONAL) same(after[key], before[key]);
    same(await Promise.all([a.choose('template', 'folio'), b.choose('colorMode', 'dark')]), [false, false]); await f.settle();
    same(f.state(), after); assert.equal(f.writes.length, count);
    for (const page of [a, b]) { assert.equal(page.host.dataset.saveState, 'error'); assert.match(page.status.textContent, /open a new tab/); }
    const fresh = await f.page(); fresh.storage.scheduleSyncPush = () => {};
    assert.equal(await fresh.choose('template', 'folio'), true); assert.equal(f.state()[GENERATION], after[GENERATION]);
});

bounded('restore already holding the lock rejects an older queued appearance intention', async () => {
    const f = fixture(), a = await f.page(), m = f.manager(), before = f.state(), gate = f.pauseNextWrite();
    const restored = m.setAll(m.validateConfigObject(before), { confirmedRestore: true }); await gate.entered;
    const selection = a.choose('template', 'folio'); await turn(); gate.resume();
    assert.equal(await restored, true); assert.equal(await selection, false); await f.settle();
    same(f.state().appearance, before.appearance); assert.equal(f.writes.length, 1); assert.match(a.status.textContent, /open a new tab/);
});

bounded('appearance before a queued restore cannot change the replacement payload', async () => {
    const f = fixture(), a = await f.page(), m = f.manager(), backup = f.state(), gate = f.pauseNextWrite();
    const selection = a.choose('template', 'folio'); await gate.entered;
    const restored = m.setAll(m.validateConfigObject(backup), { confirmedRestore: true }); await turn(); gate.resume();
    assert.equal(await selection, true); assert.equal(await restored, true); await f.settle(); same(f.state().appearance, backup.appearance);
    assert.equal(await a.choose('colorMode', 'dark'), false); same(f.state().appearance, backup.appearance);
});

bounded('legacy appearance resolution is read-only and patch preserves theme plus unknown siblings', async () => {
    for (const legacy of [{}, { themePreset: 'ink-paper' }, { themePreset: 'warm-studio' }]) {
        const f = fixture(legacy), a = await f.page(); same(f.state(), legacy); assert.equal(f.writes.length, 0);
        assert.equal(await a.choose('template', 'folio'), true);
        same(f.state(), { ...legacy, appearance: appearance('folio', legacy.themePreset === 'warm-studio' ? 'dark' : 'light') });
    }
    const f = fixture(), a = await f.page();
    f.patch({ appearance: { template: 'graphite', colorMode: 'dark', future: { opaque: ['keep'] } } });
    const before = f.state(); assert.equal(await a.choose('template', 'folio'), true);
    same(f.state(), { ...before, appearance: { ...before.appearance, template: 'folio' } });
});

bounded('only owned valid fields may be patched; malformed baselines and stored parents fail closed', async () => {
    const f = fixture(), m = f.manager(), baseline = (await m.getAll())._settingsBaseline, before = f.state();
    for (const patch of [null, [], {}, { template: 'unknown' }, { colorMode: 'system' }, { themePreset: 'ink-paper' }, { template: 'folio', other: true }]) {
        await assert.rejects(m.patchAppearance(patch, baseline));
    }
    for (const baseline of [null, [], {}, { generation: undefined }, { generation: '' }, { generation: 1 }]) {
        await assert.rejects(m.patchAppearance({ template: 'folio' }, baseline));
    }
    same(f.state(), before); assert.equal(f.writes.length, 0);
    for (const malformed of [null, [], 'folio']) {
        f.patch({ appearance: malformed }); const snapshot = f.state();
        await assert.rejects(m.patchAppearance({ template: 'folio' }, baseline)); same(f.state(), snapshot);
    }
});

bounded('generation and patch are copied before any asynchronous initialization', async () => {
    const f = fixture(), m = f.manager(), baseline = { generation: null }, patch = { template: 'folio' }, gate = deferred();
    m.ensureSyncInitialized = () => gate.promise;
    const pending = m.patchAppearance(patch, baseline); patch.template = 'graphite'; baseline.generation = 'changed'; gate.resolve();
    same(await pending, appearance('folio')); same(f.state().appearance, appearance('folio'));
});

bounded('optional Sync scheduling failure does not turn a committed local appearance save into failure', async () => {
    const f = fixture(), a = await f.page();
    a.storage.isSyncEnabledLocally = async () => true;
    a.storage.scheduleSyncPush = () => { throw new Error('injected scheduling failure'); };
    assert.equal(await a.choose('template', 'folio'), true); same(f.state().appearance, appearance('folio'));
    assert.equal(f.writes.length, 1);
});

bounded('ordinary Settings form writes preserve independently saved appearance and baseline generation', async () => {
    const f = fixture(), a = await f.page(), m = f.manager(), baseline = (await m.getAll())._settingsBaseline;
    assert.equal(await a.choose('template', 'folio'), true);
    assert.equal(await m.setAll({ quote: 'new independent quote' }, { expectedSettings: baseline, settingsPaths: ['quote'] }), true);
    assert.equal(await a.choose('colorMode', 'dark'), true);
    same(f.state().appearance, appearance('folio', 'dark')); assert.equal(f.state().quote, 'new independent quote'); assert.equal(GENERATION in f.state(), false);
});

bounded('appearance changes keep workspace recommendations opt-in and invalidate the existing review', async () => {
    const f = fixture(), a = await f.page('options'), before = f.state();
    a.window.LocalItabWorkspace = {};
    vm.runInContext(source('shared/workspace-presets-view.js'), a.context);
    const host = a.document.createElement('section'); a.document.body.append(host);
    let prepared = 0, applied = 0;
    const store = { async prepare(template) { prepared++; return { template, before: { tasks: { enabled: true }, focus: { enabled: true } } }; }, async apply() { applied++; } };
    a.window.LocalItabWorkspace.mount(host, { store });
    const review = host.children.find(node => node.tagName === 'BUTTON'); review.dispatch('click'); await f.settle();
    assert.equal(prepared, 1); const panel = host.children.find(node => node.tagName === 'DIV'); assert.equal(panel.hidden, false);
    assert.equal(await a.choose('template', 'quiet'), true); await f.settle();
    assert.equal(panel.hidden, true); assert.equal(applied, 0);
    for (const key of PERSONAL) same(f.state()[key], before[key]);
});

for (const locale of ['en', 'zh_CN']) bounded(`${locale} replacement conflict guidance remains visible after deferred refresh`, async () => {
    const f = fixture(), a = await f.page('options', locale), m = f.manager(), gate = f.pauseNextWrite();
    const restored = m.setAll(m.validateConfigObject(f.state()), { confirmedRestore: true }); await gate.entered;
    const choice = a.choose('template', 'folio'); await turn(); gate.resume(); await restored;
    assert.equal(await choice, false); await f.settle();
    const messages = JSON.parse(source(`_locales/${locale}/messages.json`));
    assert.equal(a.status.textContent, messages.dashboardPreferenceConflict.message); assert.equal(a.host.dataset.saveState, 'error');
    f.hooks.read = async keys => { if (keys.includes('appearance')) throw new Error('later refresh failed'); };
    await a.controller.refresh();
    assert.equal(a.status.textContent, messages.dashboardPreferenceConflict.message, 'a read error cannot hide a stale-generation instruction');
    f.hooks.read = null;
    assert.equal(await a.choose('template', 'folio'), false, 'refresh failure never authorizes a stale retry');
    assert.equal(a.status.textContent, messages.dashboardPreferenceConflict.message);
});
