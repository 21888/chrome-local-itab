const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { webcrypto } = require('node:crypto');
const StorageManager = require('../storage.js');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');

// Actual Options/dashboard entrypoints and StorageManager, with separate page
// globals over a shared Chrome-storage/Web-Locks model. Persistence is not
// stubbed. This is deterministic ownership/race coverage, not Chromium UI QA.
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const same = (actual, expected, message) => assert.deepEqual(clone(actual), clone(expected), message);
const turn = () => new Promise(resolve => setImmediate(resolve));
const bounded = (name, fn) => test(name, { timeout: 8000 }, fn);
const TOKEN = '__localItabSettingsGeneration';
const OLD = 'https://old.example/search?q=%s';
const NEW = 'https://new.example/search?q=%s';
const DRAFT = 'https://draft.example/search?q=%s';
const PERSONAL = ['__localItabPersonalTasksV1', '__localItabFocusV1', '__localItabScratchpadV1', '__localItabCountdownV1'];

function fixture(initial) {
    let state = initial === undefined ? new StorageManager().cloneDefaultConfig() : clone(initial);
    if (initial === undefined) state.search = { engine: 'google', custom: OLD };
    const writes = [], reads = [], listeners = [], locksUsed = [], queues = new Map();
    const hooks = { read: null, write: null, lock: null };
    let forbiddenCalls = 0;
    const forbidden = () => { forbiddenCalls++; throw new Error('Unexpected network/provider/permission call'); };
    const locks = { request(name, operation) {
        locksUsed.push(name);
        const result = (queues.get(name) || Promise.resolve()).then(async () => {
            await hooks.lock?.(name); return operation();
        });
        queues.set(name, result.catch(() => {})); return result;
    } };
    Object.defineProperty(global, 'navigator', { configurable: true, value: { locks } });
    global.crypto = webcrypto;
    global.chrome = { permissions: { contains(_request, cb) { cb(false); return Promise.resolve(false); }, request: forbidden },
        identity: { getAuthToken: forbidden }, storage: { onChanged: { addListener(fn) { listeners.push(fn); } }, local: {
            async get(keys) {
                reads.push(clone(keys)); await hooks.read?.(keys);
                return keys === null ? clone(state) : Object.fromEntries(keys.filter(key => key in state).map(key => [key, clone(state[key])]));
            },
            async set(values) {
                await hooks.write?.(values);
                const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { oldValue: clone(state[key]), newValue: clone(value) }]));
                writes.push(clone(values)); Object.assign(state, clone(values));
                for (const fn of listeners) fn(changes, 'local');
            },
            async remove(keys) { for (const key of keys) delete state[key]; },
            async getBytesInUse() { return JSON.stringify(state).length; }
        } } };
    function manager() { const m = new StorageManager(); m._syncInitialized = true; return m; }
    async function settle() { for (let i = 0; i < 3; i++) { await turn(); await Promise.all([...queues.values()]); } }
    function base(document, storage) {
        document.body.prepend = (...nodes) => document.body.append(...nodes);
        let reloads = 0, confirms = 0;
        const windowEvents = new Map();
        const window = { document, chrome: global.chrome, storageManager: storage,
            addEventListener(type, fn) { if (!windowEvents.has(type)) windowEvents.set(type, []); windowEvents.get(type).push(fn); }, getSelection: () => null, open: forbidden,
            location: { hash: '', reload() { reloads++; } }, confirm() { confirms++; return true; } };
        const timers = new Map(); let timerId = 0;
        const context = vm.createContext({ window, document, chrome: global.chrome, storageManager: storage,
            navigator: global.navigator, crypto: webcrypto, URL, TextEncoder, Blob, encodeURIComponent,
            console: { log() {}, warn() {}, error() {} }, confirm: () => true, fetch: forbidden,
            localStorage: { getItem: forbidden, setItem: forbidden },
            setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
            setInterval() {}, clearInterval() {} });
        return { window, windowEvents, context, document, storage, timers, get reloads() { return reloads; }, get confirms() { return confirms; } };
    }
    async function dashboard(locale = null) {
        const storage = manager(), config = await storage.getAll(), document = createDocument();
        for (const id of ['dashboard', 'search-container']) { const el = document.createElement('div'); el.id = id; document.body.append(el); }
        const h = base(document, storage);
        if (locale) {
            const messages = JSON.parse(source(`_locales/${locale}/messages.json`));
            h.context.i18n = h.window.i18n = { t: key => messages[key]?.message || key };
        }
        for (const file of ['shared/search-template.js', 'shared/local-content-lifecycle.js', 'newtab.js']) vm.runInContext(source(file), h.context);
        h.context.initializeSearchComponent(config.search, config._settingsBaseline);
        h.context.setupDashboardVisibilityToggle(config.ui, config._settingsBaseline);
        h.config = config;
        h.host = document.getElementById('search-container');
        h.editor = () => {
            const select = h.host.querySelector('select'), input = h.host.querySelector('.search-custom-input');
            return { select, input, status: h.host.querySelector('.search-custom-status'),
                edit(value) { input.value = value; input.dispatch('input'); },
                async choose(value) { select.value = value; for (const fn of select.listeners.get('change')) await fn({ target: select }); },
                save() { return h.host.querySelector('.search-custom-save').listeners.get('click')[0](); } };
        };
        h.toggle = async () => { document.getElementById('dashboard').dispatch('dblclick'); await settle(); };
        h.owned = () => h.window.LocalItabContentLifecycle.hasUncommittedWork();
        h.remount = async () => {
            const fresh = await storage.getAll();
            h.context.initializeSearchComponent(fresh.search, fresh._settingsBaseline);
            h.context.setupDashboardVisibilityToggle(fresh.ui, fresh._settingsBaseline);
        };
        return h;
    }
    async function options() {
        const storage = manager(), document = createDocument();
        for (const id of ['hour12-format', 'show-seconds', 'show-clock', 'show-search', 'show-shortcuts',
            'show-weather', 'show-hot', 'show-movie', 'show-shortcut-titles', 'quote-text', 'search-engine',
            'search-custom', 'privacy-online-favicons', 'weather-city', 'weather-temp', 'weather-condition',
            'weather-aqi-label', 'weather-aqi', 'weather-low', 'weather-high', 'hot-topics-tab', 'movie-title',
            'movie-note', 'bg-type', 'bg-color', 'shortcuts-gap-x', 'shortcuts-gap-y', 'shortcut-icon-size', 'shortcut-title-size']) {
            const el = document.createElement('input'); el.id = id; document.body.append(el);
        }
        for (const id of ['category-manage-list', 'baidu-list', 'weibo-list', 'zhihu-list', 'options-layout']) {
            const el = document.createElement('div'); el.id = id; document.body.append(el);
        }
        const add = document.createElement('button'); add.id = 'add-category'; document.body.append(add);
        const h = base(document, storage), messages = [];
        h.window.LocalItabContentLifecycle = { reload: () => h.window.location.reload() };
        for (const file of ['shared/layout.js', 'options.js']) vm.runInContext(source(file), h.context);
        h.context.showMessage = (text, type) => messages.push({ text, type });
        h.context.showImportExportFeedback = (operation, type, text) => messages.push({ operation, type, text });
        h.context.displayStorageInfo = async () => {};
        const config = await storage.getAll();
        await h.context.populateFormFields(config); h.context.setupCategoryManagement(config.categories);
        h.field = id => document.getElementById(id); h.save = () => h.context.saveAllSettings(); h.messages = messages;
        h.import = config => h.context.importSettings({ name: 'backup.json', size: 100,
            text: async () => JSON.stringify(storage.buildManualExportPayload(config)) });
        return h;
    }
    return { manager, dashboard, options, writes, reads, hooks, locks, locksUsed, settle,
        state: () => clone(state), patch(values) { Object.assign(state, clone(values)); },
        get forbiddenCalls() { return forbiddenCalls; },
        pauseNextWrite(fail = false) {
            const entered = deferred(), resume = deferred();
            hooks.write = async () => { hooks.write = null; entered.resolve(); await resume.promise; if (fail) throw new Error('injected write failure'); };
            return { entered: entered.promise, resume: resume.resolve };
        } };
}
const optionsSaved = h => assert.equal(h.messages.at(-1)?.type, 'success', JSON.stringify(h.messages));
const conflict = error => error.code === 'DASHBOARD_PREF_CONFLICT';

bounded('actual Settings custom-URL Save survives a stale dashboard engine selection', async () => {
    const f = fixture(), dash = await f.dashboard(), options = await f.options();
    options.field('search-engine').value = 'custom'; options.field('search-custom').value = NEW;
    await options.save(); optionsSaved(options);
    await dash.editor().choose('bing');
    same(f.state().search, { engine: 'bing', custom: NEW });
    assert.deepEqual(Object.keys(f.writes.at(-1)), ['search']);
    assert.equal(dash.editor().input.value, NEW, 'clean custom editor adopts the committed sibling value');
    assert.equal(TOKEN in f.state(), false);
});

bounded('actual Settings UI Save survives stale dashboard double-click hiding', async () => {
    const f = fixture(), dash = await f.dashboard(), options = await f.options();
    options.field('show-shortcut-titles').checked = false; options.field('shortcuts-gap-x').value = '44';
    options.field('shortcut-icon-size').value = '80';
    await options.save(); optionsSaved(options); const latest = f.state().ui;
    await dash.toggle();
    same(f.state().ui, { ...latest, dashboardHidden: true });
    assert.equal(dash.window.dashboardHiddenState, true);
    assert.equal(dash.document.body.classList.contains('dashboard-hidden'), true);
    assert.deepEqual(Object.keys(f.writes.at(-1)), ['ui']);
});

bounded('field mutation preserves latest raw siblings, unknown fields, and unrelated parents', async () => {
    const f = fixture(), m = f.manager(), baseline = (await m.getAll())._settingsBaseline;
    f.patch({ search: { engine: 'duck', custom: NEW, futureSearch: { keep: ['opaque'] } },
        ui: { ...f.state().ui, dashboardPadding: 36, futureUi: { keep: true } }, quote: 'newest quote' });
    const before = f.state();
    const result = await m.patchDashboardPreferences({ engine: 'bing', dashboardHidden: true }, baseline);
    same(f.state(), { ...before, search: { ...before.search, engine: 'bing' }, ui: { ...before.ui, dashboardHidden: true } });
    same(result.searchSource, f.state().search); assert.equal(result.search.engine, 'bing'); assert.equal(result.ui.dashboardHidden, true);
    assert.equal(result.generation, null); assert.deepEqual(new Set(Object.keys(f.writes.at(-1))), new Set(['search', 'ui']));
    assert.ok(f.locksUsed.every(name => name === 'local-itab-local-write'));
});

bounded('explicit engine and hide intentions win over same-field changes within one generation', async () => {
    const f = fixture(), a = await f.dashboard(), b = await f.dashboard();
    await a.editor().choose('duck'); await b.editor().choose('bing'); await a.editor().choose('google');
    assert.equal(f.state().search.engine, 'google'); assert.equal(f.state().search.custom, OLD);
    await a.context.setDashboardHidden(true); await f.settle();
    await b.context.setDashboardHidden(false); await f.settle();
    assert.equal(f.state().ui.dashboardHidden, false, 'explicit false is not recomputed by toggling the latest storage value');
});

bounded('custom Save compares the complete original raw search group and retains conflicting draft', async () => {
    for (const latest of [{ engine: 'duck', custom: OLD }, { engine: 'google', custom: NEW }]) {
        const f = fixture(), dash = await f.dashboard(), e = dash.editor(); e.edit(DRAFT);
        f.patch({ search: latest }); const before = f.state(), count = f.writes.length;
        assert.equal(await e.save(), false); same(f.state(), before); assert.equal(f.writes.length, count);
        assert.equal(e.input.value, DRAFT); assert(e.status.classList.contains('is-error')); assert(dash.owned());
        assert.equal(await e.save(), false, 'conflict does not silently rebase the draft');
    }
});

bounded('engine-only success cannot launder a stale dirty custom draft into a later Save', async () => {
    const f = fixture(), dash = await f.dashboard(), e = dash.editor(); e.edit(DRAFT);
    f.patch({ search: { engine: 'custom', custom: NEW } });
    await e.choose('bing'); same(f.state().search, { engine: 'bing', custom: NEW });
    assert.equal(e.input.value, DRAFT); assert.equal(await e.save(), false);
    same(f.state().search, { engine: 'bing', custom: NEW }); assert(dash.owned());
});

for (const replacement of ['same-value restore', 'reset', 'Sync']) bounded(`${replacement} fences stale dashboard engine, custom Save, and hide actions`, async () => {
    const f = fixture(), dash = await f.dashboard(), options = await f.options(), m = f.manager();
    const oldValues = f.state();
    if (replacement === 'same-value restore') { await options.import(oldValues); optionsSaved(options); }
    else if (replacement === 'reset') await options.context.resetAllSettings();
    else {
        const payload = m.prepareSyncPayload(oldValues).payload;
        const remote = { payload, validated: m.validateImportPayload(payload), schema: 1,
            meta: { enabled: true, updatedAt: '2026-10-09T12:00:00.000Z' }, revision: 'dashboard-test-remote',
            fingerprint: await m.fingerprint({ schema: 1, payload }) };
        assert.equal((await m.acceptSyncSnapshot(remote)).applied, true);
    }
    assert.ok(f.state()[TOKEN]); const after = f.state(), count = f.writes.length, e = dash.editor();
    await e.choose('bing'); e.edit(DRAFT); assert.equal(await e.save(), false); await dash.toggle();
    same(f.state(), after); assert.equal(f.writes.length, count); assert.equal(e.input.value, DRAFT);
    assert.equal(dash.window.dashboardHiddenState, false); assert.equal(e.select.value, 'google');
    await assert.rejects(m.patchDashboardPreferences({ engine: 'duck' }, dash.config._settingsBaseline), conflict);
    const fresh = await f.dashboard(); await fresh.editor().choose('duck');
    assert.equal(f.state().search.engine, 'duck'); assert.equal(f.state()[TOKEN], after[TOKEN]);
});

bounded('replacement waiting on the shared lock fences queued pre-replacement dashboard intent', async () => {
    const f = fixture(), dash = await f.dashboard(), options = await f.options();
    const gate = f.pauseNextWrite(), restored = options.import(f.state()); await gate.entered;
    const selection = dash.editor().choose('duck'); gate.resume(); await restored; await selection;
    optionsSaved(options); assert.equal(f.state().search.engine, 'google'); assert.equal(f.writes.length, 1);
    assert.equal(dash.editor().select.value, 'google');
});

bounded('missing initial baseline and missing Web Locks fail closed at actual entrypoints', async () => {
    for (const mode of ['initial read', 'lock unavailable', 'lock rejection']) {
        const f = fixture();
        if (mode === 'initial read') f.hooks.read = async () => { throw new Error('initial read failed'); };
        const dash = await f.dashboard(); f.hooks.read = null;
        if (mode === 'lock unavailable') delete global.navigator.locks;
        if (mode === 'lock rejection') f.hooks.lock = async () => { throw new Error('lock failed'); };
        const before = f.state(), e = dash.editor(); await e.choose('bing'); await dash.toggle();
        e.edit(DRAFT); assert.equal(await e.save(), false);
        same(f.state(), before); assert.equal(f.writes.length, 0); assert.equal(e.select.value, 'google');
        assert.equal(dash.window.dashboardHiddenState, false); assert.equal(e.input.value, DRAFT);
    }
});

bounded('storage read/write failure rolls controls back and explicit retry uses retained safe baseline', async () => {
    for (const mode of ['read', 'write']) {
        const f = fixture(), dash = await f.dashboard(), e = dash.editor();
        f.hooks[mode] = async keys => { if (mode === 'write' || keys === null || keys.includes('search')) throw new Error(`${mode} failed`); };
        const before = f.state(); await e.choose('bing'); await dash.toggle();
        same(f.state(), before); assert.equal(e.select.value, 'google'); assert.equal(dash.window.dashboardHiddenState, false);
        const failureStatus = dash.host.querySelector('.search-open-status');
        assert(failureStatus.textContent); assert(!failureStatus.classList.contains('sr-only'), 'engine failure is visible');
        e.edit(DRAFT); assert.equal(await e.save(), false); assert.equal(e.input.value, DRAFT);
        f.hooks[mode] = null;
        assert.equal(await e.save(), true); assert.equal(f.state().search.custom, DRAFT);
        await dash.toggle(); assert.equal(f.state().ui.dashboardHidden, true);
    }
});

bounded('malformed raw parents and invalid patch/baseline shapes never overwrite persisted data', async () => {
    const f = fixture(), m = f.manager(), baseline = (await m.getAll())._settingsBaseline;
    for (const patch of [null, [], {}, { quote: 'no' }, { search: { engine: 'bing' } }, { engine: 'invalid' },
        { dashboardHidden: 'true' }, { custom: DRAFT }, { engine: 'bing', custom: DRAFT }, { engine: 'custom', custom: 'javascript:alert(1)' }]) {
        const before = f.state(); await assert.rejects(m.patchDashboardPreferences(patch, baseline)); same(f.state(), before);
    }
    for (const baselineValue of [undefined, null, {}, { generation: null }, { generation: null, values: [] }, { generation: null, values: 'bad' }, { generation: 17, values: {} }]) {
        await assert.rejects(m.patchDashboardPreferences({ engine: 'bing' }, baselineValue), undefined, `invalid baseline: ${JSON.stringify(baselineValue)}`);
    }
    for (const [parent, patch] of [['search', { engine: 'bing' }], ['ui', { dashboardHidden: true }]]) {
        for (const value of [null, [], 17, 'broken']) {
            const latest = f.state(); latest[parent] = value; f.patch(latest);
            const before = f.state(); await assert.rejects(m.patchDashboardPreferences(patch, baseline)); same(f.state(), before);
        }
    }
    assert.equal(f.writes.length, 0);
});

bounded('missing legacy parents are created from explicit fields without replaying defaults', async () => {
    const f = fixture({}), m = f.manager(), baseline = (await m.getAll())._settingsBaseline;
    await m.patchDashboardPreferences({ engine: 'bing', dashboardHidden: true }, baseline);
    same(f.state(), { search: { engine: 'bing' }, ui: { dashboardHidden: true } });
});

bounded('pending engine choices preserve newest intent even after older failure', async () => {
    for (const fail of [false, true]) {
        const f = fixture(), dash = await f.dashboard(), e = dash.editor(), gate = f.pauseNextWrite(fail);
        const first = e.choose('bing'); await gate.entered;
        const last = e.choose('duck'); assert.equal(e.select.value, 'duck');
        gate.resume(); await Promise.all([first, last]);
        assert.equal(f.state().search.engine, 'duck'); assert.equal(e.select.value, 'duck'); assert.equal(f.state().search.custom, OLD);
    }
});

bounded('pending hide/show preserves newest explicit intention after older success or failure', async () => {
    for (const fail of [false, true]) {
        const f = fixture(), dash = await f.dashboard(), gate = f.pauseNextWrite(fail);
        const first = dash.context.setDashboardHidden(true); await gate.entered;
        const last = dash.context.setDashboardHidden(false); assert.equal(dash.window.dashboardHiddenState, false);
        gate.resume(); await Promise.all([first, last]); await f.settle();
        assert.equal(f.state().ui.dashboardHidden, false); assert.equal(dash.window.dashboardHiddenState, false);
        assert.equal(dash.document.body.classList.contains('dashboard-hidden'), false);
    }
});

bounded('custom text typed while engine persistence is pending is never replaced by acknowledgement', async () => {
    const f = fixture(), dash = await f.dashboard(), e = dash.editor();
    f.patch({ search: { engine: 'google', custom: NEW } });
    const gate = f.pauseNextWrite(), choice = e.choose('bing'); await gate.entered;
    e.edit(DRAFT); gate.resume(); await choice;
    assert.equal(e.input.value, DRAFT); assert.equal(f.state().search.custom, NEW); assert(dash.owned());
    assert.equal(await e.save(), false, 'pending clean selection cannot grant review of a newly discovered template to a later draft');
});

bounded('custom Save retains newer text and queued engine choice retains its successful URL', async () => {
    const f = fixture(), dash = await f.dashboard(), e = dash.editor(); e.edit('  ' + DRAFT + '  ');
    const gate = f.pauseNextWrite(), save = e.save(); await gate.entered;
    assert.equal(await e.save(), false, 'duplicate pending Save is ignored');
    e.edit(NEW); const selection = e.choose('duck'); gate.resume(); assert.equal(await save, true); await selection;
    same(f.state().search, { engine: 'duck', custom: DRAFT }); assert.equal(e.input.value, NEW); assert(dash.owned());
    assert.equal(await e.save(), true); same(f.state().search, { engine: 'custom', custom: NEW }); assert(!dash.owned());
});

bounded('pending dashboard writes prevent lifecycle reload even after confirmable reload notice', async () => {
    for (const kind of ['engine', 'custom', 'hide']) {
        const f = fixture(), dash = await f.dashboard(), gate = f.pauseNextWrite(), e = dash.editor();
        if (kind === 'custom') e.edit(DRAFT);
        const pending = kind === 'engine' ? e.choose('bing') : kind === 'custom' ? e.save() : dash.context.setDashboardHidden(true);
        await gate.entered; assert(dash.owned());
        const departure = { prevented: false, preventDefault() { this.prevented = true; } };
        for (const fn of dash.windowEvents.get('beforeunload') || []) fn(departure);
        assert(departure.prevented); assert.equal(departure.returnValue, '');
        assert.equal(dash.window.LocalItabContentLifecycle.reload(), false);
        dash.document.querySelector('#local-content-reload-notice button').dispatch('click');
        assert.equal(dash.reloads, 0); assert.equal(dash.confirms, 0, 'pending work cannot be discarded by confirmation');
        gate.resume(); await pending; await f.settle(); assert(!dash.owned());
        dash.document.querySelector('#local-content-reload-notice button').dispatch('click'); assert.equal(dash.reloads, 1);
    }
});

bounded('remount or detach retires queued search writes and old acknowledgements cannot rewrite new UI', async () => {
    for (const action of ['remount', 'detach']) {
        const f = fixture(), dash = await f.dashboard(), e = dash.editor(), gate = f.pauseNextWrite();
        const first = e.choose('bing'); await gate.entered;
        e.edit(DRAFT); const queued = e.save(); const oldForm = dash.host.querySelector('form');
        if (action === 'remount') dash.context.initializeSearchComponent(dash.config.search, dash.config._settingsBaseline);
        else dash.host.remove();
        gate.resume(); await first; assert.equal(await queued, false); assert.equal(f.writes.length, 1);
        if (action === 'remount') {
            dash.host.append(oldForm); await e.choose('duck'); assert.equal(f.writes.length, 1);
            assert.equal(dash.editor().select.value, 'google'); assert.equal(dash.editor().input.value, OLD);
        }
        assert(!dash.owned());
    }
});

bounded('same dashboard reinitialization retires its old double-click handler', async () => {
    const f = fixture(), dash = await f.dashboard(); await dash.remount();
    await dash.toggle(); assert.equal(f.state().ui.dashboardHidden, true);
    assert.equal(f.writes.length, 1, 'one gesture must produce one intent after reinitialization');
});

bounded('field-only writes leave private content/token boundaries and provider permissions unchanged', async () => {
    const f = fixture(), privateValues = Object.fromEntries(PERSONAL.map((key, i) => [key, { text: `PRIVATE_SENTINEL_${i}`, malformedButOpaque: true }]));
    f.patch({ ...privateValues, [TOKEN]: 'private-generation-marker' });
    const dash = await f.dashboard(), m = f.manager(); await dash.editor().choose('bing'); await dash.toggle();
    for (const key of PERSONAL) same(f.state()[key], privateValues[key]);
    assert.equal(f.state()[TOKEN], 'private-generation-marker');
    for (const write of f.writes) {
        assert(Object.keys(write).every(key => ['search', 'ui'].includes(key)));
        assert(!JSON.stringify(write).includes('PRIVATE_SENTINEL'));
    }
    const config = await m.getAll(); assert(!Object.keys(config).includes('_settingsBaseline'));
    for (const payload of [m.buildManualExportPayload(f.state()), m.buildDriveBackupPayload(f.state()), m.prepareSyncPayload(f.state()), await m.getAllForBackup()]) {
        assert(!JSON.stringify(payload).includes('PRIVATE_SENTINEL')); assert(!JSON.stringify(payload).includes(TOKEN));
        assert(!JSON.stringify(payload).includes('private-generation-marker')); assert(!JSON.stringify(payload).includes('_settingsBaseline'));
    }
    assert.equal(f.forbiddenCalls, 0);
    const manifest = JSON.parse(source('manifest.json'));
    same(manifest.permissions, ['storage', 'unlimitedStorage', 'identity']);
    same(manifest.host_permissions, ['https://www.googleapis.com/*']);
    same(manifest.optional_host_permissions, ['https://www.google.com/*']);
});

bounded('unrelated malformed parent does not block an otherwise safe owned-field commit', async () => {
    for (const kind of ['search', 'ui']) {
        const f = fixture(), m = f.manager(), baseline = (await m.getAll())._settingsBaseline;
        f.patch(kind === 'search' ? { ui: null } : { search: null });
        const before = f.state();
        const result = await m.patchDashboardPreferences(kind === 'search' ? { engine: 'bing' } : { dashboardHidden: true }, baseline);
        assert(result);
        if (kind === 'search') { assert.equal(f.state().search.engine, 'bing'); same(f.state().ui, before.ui); }
        else { assert.equal(f.state().ui.dashboardHidden, true); same(f.state().search, before.search); }
        assert.equal(f.writes.length, 1);
    }
});

bounded('mutation copies caller intent and custom baseline before waiting for a lock', async () => {
    const f = fixture(), m = f.manager(), baseline = (await m.getAll())._settingsBaseline;
    const entered = deferred(), resume = deferred();
    const holder = f.locks.request('local-itab-local-write', async () => { entered.resolve(); await resume.promise; }); await entered.promise;
    const patch = { engine: 'custom', custom: DRAFT }, promise = m.patchDashboardPreferences(patch, baseline);
    patch.custom = NEW; baseline.values.search.custom = 'https://mutated.example/?q=%s';
    resume.resolve(); await holder; const result = await promise;
    same(f.state().search, { engine: 'custom', custom: DRAFT });
    result.searchSource.custom = NEW; assert.equal(f.state().search.custom, DRAFT, 'returned snapshots are detached from storage');
});

bounded('remount retires queued hide actions and late failures cannot roll back new mounted state', async () => {
    for (const fail of [false, true]) {
        const f = fixture(), dash = await f.dashboard(), gate = f.pauseNextWrite(fail);
        const first = dash.context.setDashboardHidden(true); await gate.entered;
        const second = dash.context.setDashboardHidden(false);
        dash.context.setupDashboardVisibilityToggle({ ...dash.config.ui, dashboardHidden: true }, dash.config._settingsBaseline);
        gate.resume(); await Promise.all([first, second]); await f.settle();
        assert.equal(dash.window.dashboardHiddenState, true); assert(dash.document.body.classList.contains('dashboard-hidden'));
        assert.equal(f.writes.length, fail ? 0 : 1, 'obsolete queued hide/show never enters persistence');
    }
});

bounded('scratchpad draft guard and interactive double-clicks never start dashboard visibility writes', async () => {
    const f = fixture(), dash = await f.dashboard();
    dash.window.localScratchpadView = { hasUncommittedWork: () => true }; await dash.toggle();
    assert.equal(f.writes.length, 0); assert.equal(dash.window.dashboardHiddenState, false);
    dash.window.localScratchpadView = null;
    const input = dash.document.createElement('input'); dash.document.getElementById('dashboard').append(input);
    input.dispatch('dblclick'); await f.settle(); assert.equal(f.writes.length, 0);
});

bounded('detached or replaced dashboard root retires queued hide/show intents without repainting', async () => {
    for (const replacement of [false, true]) for (const fail of [false, true]) {
        const f = fixture(), dash = await f.dashboard(), root = dash.document.getElementById('dashboard');
        const gate = f.pauseNextWrite(fail), first = dash.context.setDashboardHidden(true); await gate.entered;
        const queued = dash.context.setDashboardHidden(false); root.remove();
        if (replacement) {
            const newRoot = dash.document.createElement('div'); newRoot.id = 'dashboard'; dash.document.body.append(newRoot);
        }
        gate.resume(); await first; assert.equal(await queued, false); await f.settle();
        assert.equal(f.writes.length, fail ? 0 : 1, 'already-started write may finish, detached queued intent must not write');
        assert.equal(f.state().ui.dashboardHidden, !fail);
        assert.equal(dash.window.dashboardHiddenState, false); assert(!dash.document.body.classList.contains('dashboard-hidden'));
        root.dispatch('dblclick'); await f.settle(); assert.equal(f.writes.length, fail ? 0 : 1, 'retired detached handler cannot create new intent');
        assert.equal(dash.document.querySelector('.error-message'), null, 'obsolete failures do not emit current-page feedback');
    }
});

bounded('late failure after plain root detach cannot repaint its optimistic state', async () => {
    const f = fixture(), dash = await f.dashboard(), gate = f.pauseNextWrite(true);
    const pending = dash.context.setDashboardHidden(true); await gate.entered;
    dash.document.getElementById('dashboard').remove();
    gate.resume(); assert.equal(await pending, false); await f.settle();
    assert.equal(f.writes.length, 0); assert.equal(dash.window.dashboardHiddenState, true);
    assert(dash.document.body.classList.contains('dashboard-hidden'), 'detached owner does not repaint the page on late failure');
    assert.equal(dash.document.querySelector('.error-message'), null);
});

bounded('dashboard failures show localized conflict, write, and missing-lock feedback in all controls', async () => {
    for (const locale of ['en', 'zh_CN', null]) for (const failure of ['conflict', 'write', 'lock']) {
        const f = fixture(), dash = await f.dashboard(locale), e = dash.editor();
        const messages = JSON.parse(source(`_locales/${locale || 'en'}/messages.json`));
        const key = failure === 'conflict' ? 'dashboardPreferenceConflict'
            : failure === 'lock' ? 'dashboardPreferenceLockUnavailable' : 'dashboardPreferenceFailed';
        const expected = messages[key].message; assert(expected); assert.notEqual(expected, key);
        if (failure === 'conflict') f.patch({ [TOKEN]: 'replacement-generation' });
        if (failure === 'write') f.hooks.write = async () => { throw new Error('injected write failure'); };
        if (failure === 'lock') delete global.navigator.locks;
        await e.choose('bing');
        const status = dash.host.querySelector('.search-open-status');
        assert.equal(status.textContent, expected); assert(!status.classList.contains('sr-only')); assert(status.classList.contains('is-error'));
        e.edit(DRAFT); assert.equal(await e.save(), false); assert.equal(e.status.textContent, expected);
        assert(e.status.classList.contains('is-error')); assert.equal(e.input.value, DRAFT);
        await dash.toggle(); assert.equal(dash.document.querySelector('.error-message')?.textContent, expected);
        assert.equal(f.writes.length, 0); assert.equal(e.select.value, 'google'); assert.equal(dash.window.dashboardHiddenState, false);
    }
});
