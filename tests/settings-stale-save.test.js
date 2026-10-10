const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const {webcrypto} = require('node:crypto');
const StorageManager = require('../storage.js');
const {createDocument, deferred} = require('./helpers/task-dom-model.js');

// Actual Options functions and StorageManager, separate page globals, shared
// Chrome storage and serialized Web Locks. This covers ownership/transactions,
// not native extension permissions, file pickers, painting, or browser reloads.
// Regression sources: ordinary-tab stale save, stale post-restore save, and a
// same-tab background FileReader completing after a confirmed import.
const optionsSource = fs.readFileSync(path.join(__dirname, '../options.js'), 'utf8');
const layoutSource = fs.readFileSync(path.join(__dirname, '../shared/layout.js'), 'utf8');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const same = (actual, expected, message) => assert.deepEqual(clone(actual), clone(expected), message);
const IMAGE = 'data:image/png;base64,T1JJR0lOQUw=';
const NEW_IMAGE = 'data:image/png;base64,TkVX';
const TOKEN = '__localItabSettingsGeneration';
const PERSONAL_KEYS = ['__localItabPersonalTasksV1', '__localItabFocusV1', '__localItabScratchpadV1', '__localItabCountdownV1'];

function fixture(initial) {
    let state = initial === undefined ? new StorageManager().cloneDefaultConfig() : clone(initial);
    const writes = [], listeners = [], locksUsed = [], queues = new Map();
    const hooks = {read: null, write: null, remove: null, permission: false, permissionRequest: null};
    const locks = {request(name, operation) {
        locksUsed.push(name);
        const result = (queues.get(name) || Promise.resolve()).then(operation);
        queues.set(name, result.catch(() => {}));
        return result;
    }};
    Object.defineProperty(global, 'navigator', {configurable: true, value: {locks}});
    global.crypto = webcrypto;
    global.chrome = {permissions: {
        contains(_request, callback) { callback(hooks.permission); return Promise.resolve(hooks.permission); },
        request: request => hooks.permissionRequest ? hooks.permissionRequest(request) : Promise.resolve(hooks.permission)
    }, storage: {onChanged: {addListener(fn) { listeners.push(fn); }}, local: {
        async get(keys) {
            await hooks.read?.(keys);
            return keys === null ? clone(state) : Object.fromEntries(keys.filter(key => key in state).map(key => [key, clone(state[key])]));
        },
        async set(values) {
            await hooks.write?.(values);
            const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, {oldValue: clone(state[key]), newValue: clone(value)}]));
            writes.push(clone(values)); Object.assign(state, clone(values));
            for (const fn of listeners) fn(changes, 'local');
        },
        async remove(keys) { await hooks.remove?.(keys); for (const key of keys) delete state[key]; },
        async getBytesInUse() { return JSON.stringify(state).length; }
    }}};
    function manager() { const m = new StorageManager(); m._syncInitialized = true; return m; }
    async function page({initialize = true, events = false} = {}) {
        const storage = manager(), document = createDocument();
        for (const id of ['hour12-format', 'show-seconds', 'show-clock', 'show-search', 'show-shortcuts',
            'show-weather', 'show-hot', 'show-movie', 'show-shortcut-titles', 'finder-shortcut-enabled', 'quote-text', 'search-engine',
            'search-custom', 'privacy-online-favicons', 'weather-city', 'weather-temp', 'weather-condition',
            'weather-aqi-label', 'weather-aqi', 'weather-low', 'weather-high', 'hot-topics-tab', 'movie-title',
            'movie-note', 'bg-type', 'bg-color', 'bg-color-text', 'bg-image-upload', 'shortcuts-gap-x',
            'shortcuts-gap-y', 'shortcut-icon-size', 'shortcut-title-size', 'import-settings', 'movie-poster-upload']) {
            const input = document.createElement('input'); input.id = id; document.body.append(input);
        }
        for (const id of ['category-manage-list', 'baidu-list', 'weibo-list', 'zhihu-list', 'options-layout']) {
            const element = document.createElement('div'); element.id = id; document.body.append(element);
        }
        const add = document.createElement('button'); add.id = 'add-category'; document.body.append(add);
        const posterPreview = document.createElement('div'); posterPreview.id = 'movie-poster-preview'; document.body.append(posterPreview);
        const posterImage = document.createElement('img'); posterImage.id = 'movie-preview-img'; posterPreview.append(posterImage);
        const messages = [], timers = new Map(); let timerId = 0, reloads = 0;
        const window = {document, chrome: global.chrome, storageManager: storage, addEventListener() {},
            location: {hash: '', reload() { reloads++; }}, LocalItabContentLifecycle: {reload() { reloads++; }}};
        const context = vm.createContext({window, document, chrome: global.chrome, storageManager: storage,
            navigator: global.navigator, crypto: webcrypto, URL, TextEncoder, Blob, console: {log() {}, warn() {}, error() {}},
            confirm: () => true, setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); }});
        vm.runInContext(layoutSource, context);
        vm.runInContext(optionsSource, context);
        context.showMessage = (text, type) => messages.push({text, type});
        context.showImportExportFeedback = (operation, type, text) => messages.push({operation, text, type});
        context.displayStorageInfo = async () => {};
        if (initialize) {
            const config = await storage.getAll();
            await context.populateFormFields(config);
            context.setupCategoryManagement(config.categories);
            context.setupCloudSyncChangeListener();
        }
        if (events) context.setupEventListeners();
        const field = id => document.getElementById(id);
        return {storage, document, context, messages, timers, field, get reloads() { return reloads; },
            save: () => context.saveAllSettings(),
            readFileLater() {
                const started = deferred(); let reader;
                context.FileReader = class {readAsDataURL() { reader = this; started.resolve(); }};
                return {started: started.promise, finish(value = NEW_IMAGE) { reader.result = value; reader.onload(); }};
            },
            import(config) {
                const payload = storage.buildManualExportPayload(config);
                return context.importSettings({name: 'backup.json', size: 100, text: async () => JSON.stringify(payload)});
            }
        };
    }
    return {page, manager, hooks, writes, locks, locksUsed, state: () => clone(state),
        patch(values) { Object.assign(state, clone(values)); },
        pauseNextWrite() {
            const entered = deferred(), resume = deferred();
            hooks.write = async () => { hooks.write = null; entered.resolve(); await resume.promise; };
            return {entered: entered.promise, resume: resume.resolve};
        }};
}
function success(page) { assert.equal(page.messages.at(-1)?.type, 'success'); }
function conflict(page) {
    assert.equal(page.messages.at(-1)?.type, 'error');
    assert.match(page.messages.at(-1).text, /Settings changed|Settings could not be read safely|Safe Settings saving is unavailable/i);
}
function editCategory(page, name) { page.document.querySelector('#category-manage-list .cat-name').value = name; }
const bounded = (name, fn) => test(name, {timeout: 8000}, fn);

bounded('two rendered tabs preserve independent quote, visibility, and weather fields', async () => {
    const f = fixture(), a = await f.page(), b = await f.page();
    b.field('quote-text').value = 'Written in B'; await b.save(); success(b);
    assert.equal(a.context.window.layoutController.invalidated, false, 'ordinary settings do not rely on a layout invalidation');
    a.field('show-weather').checked = true; await a.save(); success(a);
    assert.equal(f.state().quote, 'Written in B'); assert.equal(f.state().show.weather, true);
    assert.deepEqual(Object.keys(f.writes.at(-1)), ['show']);
    b.field('show-hot').checked = true; await b.save(); success(b);
    assert.equal(f.state().show.weather, true); assert.equal(f.state().show.hot, true);
    a.field('weather-city').value = 'Kyoto'; await a.save(); success(a);
    b.field('weather-temp').value = '31'; await b.save(); success(b);
    assert.equal(f.state().weather.city, 'Kyoto'); assert.equal(f.state().weather.temp, 31);
    assert.equal(TOKEN in f.state(), false, 'ordinary edits do not rotate a replacement token');
});

bounded('same quote conflict rejects the entire transaction and preserves the draft on repeat', async () => {
    const f = fixture(), a = await f.page(), b = await f.page();
    b.field('quote-text').value = 'Newest committed quote'; await b.save();
    a.field('quote-text').value = 'My conflicting draft'; a.field('weather-city').value = 'Tokyo';
    a.field('hour12-format').checked = true; editCategory(a, 'Unsaved category');
    const before = f.state(), count = f.writes.length;
    for (let retry = 0; retry < 2; retry++) {
        await a.save(); conflict(a); same(f.state(), before); assert.equal(f.writes.length, count);
        assert.equal(a.field('quote-text').value, 'My conflicting draft');
        assert.equal(a.field('weather-city').value, 'Tokyo');
        assert.equal(a.field('hour12-format').checked, true);
        assert.equal(a.document.querySelector('#category-manage-list .cat-name').value, 'Unsaved category');
    }
});

bounded('search engine and custom template remain one conflict unit', async () => {
    const f = fixture(), a = await f.page(), b = await f.page();
    b.field('search-engine').value = 'bing'; await b.save(); success(b);
    a.field('search-custom').value = 'https://example.com/?q=%s';
    a.field('show-weather').checked = true;
    const before = f.state(), count = f.writes.length;
    await a.save(); conflict(a); same(f.state(), before); assert.equal(f.writes.length, count);
    assert.equal(a.field('search-custom').value, 'https://example.com/?q=%s');
});

bounded('same-value confirmed restore fences every stale field and clean stale Save', async () => {
    const f = fixture(), a = await f.page(), b = await f.page(), before = f.state();
    await b.import(before); success(b);
    assert.equal(typeof f.state()[TOKEN], 'string'); assert.ok(f.state()[TOKEN]);
    const afterRestore = f.state(), count = f.writes.length;
    await a.save(); conflict(a); assert.equal(f.writes.length, count);
    a.field('weather-city').value = 'Unsaved city';
    await a.save(); conflict(a); same(f.state(), afterRestore);
    assert.equal(a.field('weather-city').value, 'Unsaved city');
    const fresh = await f.page(); fresh.field('weather-city').value = 'Fresh city'; await fresh.save(); success(fresh);
    assert.equal(f.state().weather.city, 'Fresh city'); assert.equal(f.state()[TOKEN], afterRestore[TOKEN]);
});

bounded('reset fences a stale page even when both raw pre/post settings are absent', async () => {
    const f = fixture({}), a = await f.page(), b = await f.page();
    await b.context.resetAllSettings(); assert.equal(b.reloads, 1); assert.ok(f.state()[TOKEN]);
    const afterReset = f.state(), count = f.writes.length;
    a.field('show-weather').checked = true; await a.save(); conflict(a);
    same(f.state(), afterReset); assert.equal(f.writes.length, count); assert.equal(a.field('show-weather').checked, true);
    await b.save(); assert.equal(f.writes.length, count, 'own discarded form cannot save during reload delay');
});

bounded('accepted Sync replacement rotates the fence; acknowledged copy does not', async () => {
    const f = fixture(), a = await f.page(), m = f.manager();
    const payload = m.prepareSyncPayload(f.state()).payload;
    const remote = {payload, validated: m.validateImportPayload(payload), schema: 1,
        meta: {enabled: true, updatedAt: '2026-10-09T12:00:00.000Z'}, revision: 'remote-1', fingerprint: await m.fingerprint({schema: 1, payload})};
    assert.equal((await m.acceptSyncSnapshot(remote)).applied, true); assert.ok(f.state()[TOKEN]);
    const token = f.state()[TOKEN];
    assert.equal((await m.acceptSyncSnapshot(remote)).acknowledged, true); assert.equal(f.state()[TOKEN], token);
    const before = f.state(), count = f.writes.length;
    a.field('quote-text').value = 'Stale after Sync'; await a.save(); conflict(a);
    same(f.state(), before); assert.equal(f.writes.length, count);
});

bounded('category and layout edits do not unnecessarily invalidate Settings ownership', async () => {
    const f = fixture(), a = await f.page(), m = f.manager();
    const categories = clone(f.state().categories); categories[0].name = 'Renamed elsewhere';
    assert.equal(await m.setAll({categories}), true);
    const layout = {...f.state().layout, columns: 8}; assert.equal(await m.setAll({layout}), true);
    const before = f.state(); assert.equal(TOKEN in before, false);
    a.field('quote-text').value = 'Can still save'; await a.save(); success(a);
    same(f.state().categories, before.categories); same(f.state().layout, before.layout);
    assert.equal(f.state().quote, 'Can still save');
});

bounded('missing Web Locks fails closed without changing any stored field', async () => {
    const f = fixture(), a = await f.page(); a.field('quote-text').value = 'Keep this draft';
    delete global.navigator.locks;
    const before = f.state(); await a.save(); conflict(a); same(f.state(), before); assert.equal(f.writes.length, 0);
    assert.equal(a.field('quote-text').value, 'Keep this draft');
    global.navigator.locks = f.locks; await a.save(); success(a); assert.equal(f.state().quote, 'Keep this draft');
});

bounded('failed locked read and write retain the baseline and permit an explicit retry', async () => {
    for (const failure of ['read', 'write']) {
        const f = fixture(), a = await f.page(); a.field('quote-text').value = `Retry ${failure}`;
        const before = f.state();
        f.hooks[failure] = async keys => { if (failure === 'write' || keys === null) throw new Error('injected unavailable storage'); };
        await a.save(); assert.equal(a.messages.at(-1).type, 'error'); same(f.state(), before); assert.equal(f.writes.length, 0);
        assert.equal(a.field('quote-text').value, `Retry ${failure}`);
        f.hooks[failure] = null; await a.save(); success(a); assert.equal(f.state().quote, `Retry ${failure}`);
    }
});

bounded('failed initial getAll fallback is never accepted as a save baseline', async () => {
    const f = fixture(); f.hooks.read = async () => { throw new Error('initial read unavailable'); };
    const a = await f.page(); f.hooks.read = null;
    a.field('quote-text').value = 'Draft after failed initial load';
    const before = f.state(); await a.save(); conflict(a); same(f.state(), before); assert.equal(f.writes.length, 0);
    assert.equal(a.field('quote-text').value, 'Draft after failed initial load');
    const b = await f.page(); b.field('quote-text').value = 'Safe new page'; await b.save(); success(b);
});

bounded('typing during a pending save is retained and queued newest Save commits it', async () => {
    const f = fixture(), a = await f.page(); a.field('quote-text').value = 'First submission';
    const gate = f.pauseNextWrite(), first = a.save(); await gate.entered;
    a.field('quote-text').value = 'Newest queued submission'; const second = a.save();
    gate.resume(); await Promise.all([first, second]); success(a);
    assert.equal(f.state().quote, 'Newest queued submission');
    assert.equal(a.field('quote-text').value, 'Newest queued submission');
    a.field('quote-text').value = 'Submitted'; const gate2 = f.pauseNextWrite(), pending = a.save(); await gate2.entered;
    a.field('quote-text').value = 'Still unsaved'; gate2.resume(); await pending;
    assert.equal(f.state().quote, 'Submitted'); assert.equal(a.field('quote-text').value, 'Still unsaved');
    assert.equal(a.context.window.settingsFormView.hasUncommittedWork(), true);
    await a.save(); success(a); assert.equal(f.state().quote, 'Still unsaved');
    assert.equal(a.context.window.settingsFormView.hasUncommittedWork(), false);
});

bounded('helpers followed by unrelated Save retain background assets and poster', async () => {
    const f = fixture(); f.patch({bg: {type: 'image', value: IMAGE}, movie: {...f.state().movie, poster: IMAGE}});
    const a = await f.page();
    a.context.FileReader = class {readAsDataURL() { this.result = NEW_IMAGE; this.onload(); }};
    await a.context.handleBackgroundImageUpload({type: 'image/png', size: 3}); success(a);
    a.field('quote-text').value = 'After upload'; await a.save(); success(a);
    same(f.state().bg, {type: 'image', value: NEW_IMAGE}); assert.equal('bg' in f.writes.at(-1), false);
    await a.context.removeBackgroundImage(); success(a);
    a.field('quote-text').value = 'After removal'; await a.save();
    same(f.state().bg, {type: 'gradient', value: ''}); assert.equal('bg' in f.writes.at(-1), false);
    a.field('bg-type').value = 'color'; a.field('bg-color').value = '#123456'; await a.context.saveBackgroundSettings();
    a.field('quote-text').value = 'After color'; await a.save(); same(f.state().bg, {type: 'color', value: '#123456'});
    await a.context.handleMoviePosterUpload({type: 'image/png', size: 3}); success(a);
    a.field('movie-title').value = 'Edited title'; await a.save(); success(a);
    assert.equal(f.state().movie.poster, NEW_IMAGE); assert.equal(f.state().movie.title, 'Edited title');
});

bounded('concurrent background changes reject stale upload/type/removal without reverting controls', async () => {
    for (const operation of ['upload', 'type', 'remove']) {
        const f = fixture(); f.patch({bg: {type: 'image', value: IMAGE}});
        const a = await f.page(), b = await f.page();
        b.field('bg-type').value = 'color'; b.field('bg-color').value = '#654321'; await b.context.saveBackgroundSettings();
        const before = f.state(), count = f.writes.length;
        if (operation === 'upload') {
            a.context.FileReader = class {readAsDataURL() { this.result = NEW_IMAGE; this.onload(); }};
            await a.context.handleBackgroundImageUpload({type: 'image/png', size: 3});
        } else if (operation === 'type') {
            a.field('bg-type').value = 'color'; a.field('bg-color').value = '#123456'; await a.context.saveBackgroundSettings();
            assert.equal(a.field('bg-color').value, '#123456'); assert.equal(a.field('bg-type').value, 'color');
        } else await a.context.removeBackgroundImage();
        conflict(a);
        if (operation === 'upload') assert.match(a.messages.at(-1).text, /image was not saved.*choose the image again/i);
        same(f.state(), before); assert.equal(f.writes.length, count);
    }
});

bounded('confirmed own import invalidates a pending background FileReader before it can write', async () => {
    const f = fixture(), a = await f.page(), reader = a.readFileLater();
    const upload = a.context.handleBackgroundImageUpload({type: 'image/png', size: 3}); await reader.started;
    const replacement = f.state(); replacement.bg = {type: 'color', value: '#123456'};
    const confirmed = deferred(); a.context.confirm = () => { confirmed.resolve(); return true; };
    const importing = a.import(replacement); await confirmed.promise;
    reader.finish(); await Promise.all([upload, importing]); success(a);
    same(f.state().bg, replacement.bg);
    assert.equal(f.writes.some(write => write.bg?.value === NEW_IMAGE), false);
    assert.equal(a.messages.some(message => message.text === 'Background image uploaded.'), false);
    const count = f.writes.length; await a.save(); assert.equal(f.writes.length, count);
});

bounded('another tab restore while a background reader is pending rejects the old upload', async () => {
    const f = fixture(), a = await f.page(), b = await f.page(), reader = a.readFileLater();
    const upload = a.context.handleBackgroundImageUpload({type: 'image/png', size: 3}); await reader.started;
    const replacement = f.state(); replacement.bg = {type: 'color', value: '#abcdef'};
    await b.import(replacement); success(b); const before = f.state(), count = f.writes.length;
    reader.finish(); await upload; conflict(a); same(f.state(), before); assert.equal(f.writes.length, count);
    assert.match(a.messages.at(-1).text, /image was not saved.*choose the image again/i);
});

bounded('general Save preserves personal content, assets, layout, Sync, appearance and unrelated nested fields', async () => {
    const f = fixture(), a = await f.page();
    const updates = {bg: {type: 'image', value: NEW_IMAGE}, movie: {...f.state().movie, poster: IMAGE},
        sync: {...f.state().sync, lastSync: '2026-10-09T10:00:00.000Z', lastError: 'preserve'},
        layout: {...f.state().layout, columns: 8}, appearance: {template: 'clarity', colorMode: 'dark'},
        ui: {...f.state().ui, dashboardHidden: true}, privacy: {...f.state().privacy, retained: 'unowned'}};
    PERSONAL_KEYS.forEach((key, i) => { updates[key] = {version: 1, content: `PRIVATE-${i}`}; });
    f.patch(updates); const before = f.state();
    a.field('movie-title').value = 'User movie edit'; a.field('quote-text').value = 'Only owned settings'; await a.save(); success(a);
    for (const key of [...PERSONAL_KEYS, 'bg', 'layout', 'sync', 'appearance', 'ui', 'privacy', 'links', 'categories']) same(f.state()[key], before[key], key);
    assert.equal(f.state().movie.poster, IMAGE); assert.equal(f.state().movie.title, 'User movie edit');
    assert.deepEqual(Object.keys(f.writes.at(-1)).sort(), ['movie', 'quote']);
});

bounded('generation/baseline stay local and absent from JSON, manual, Drive and Sync exports', async () => {
    const f = fixture(); f.patch({[TOKEN]: 'local-fence-token'}); const m = f.manager(), config = await m.getAll();
    assert.equal(config._settingsBaseline.generation, 'local-fence-token');
    assert.equal(Object.getOwnPropertyDescriptor(config, '_settingsBaseline').enumerable, false);
    const payloads = [JSON.stringify(config), JSON.stringify({...config}),
        JSON.stringify(m.buildManualExportPayload(config)), JSON.stringify(m.buildDriveBackupPayload(config)),
        JSON.stringify(m.prepareSyncPayload(config)), JSON.stringify(await m.getAllForBackup())];
    for (const payload of payloads) {
        assert.equal(payload.includes(TOKEN), false); assert.equal(payload.includes('_settingsBaseline'), false);
        assert.equal(payload.includes('local-fence-token'), false);
    }
});

bounded('ungranted favicon permission cannot be persisted by general Save', async () => {
    const f = fixture(), a = await f.page();
    a.field('privacy-online-favicons').checked = true; a.field('quote-text').value = 'Keep my other edit';
    const before = f.state(); await a.save();
    assert.equal(a.messages.at(-1).type, 'error'); assert.match(a.messages.at(-1).text, /permission.*pending|permission.*not granted/);
    same(f.state(), before); assert.equal(f.writes.length, 0); assert.equal(a.field('quote-text').value, 'Keep my other edit');
    assert.equal(a.field('privacy-online-favicons').checked, true);
    a.field('privacy-online-favicons').checked = false; await a.save(); success(a);
    assert.equal(f.state().privacy.onlineFavicons, false); assert.equal(f.state().quote, 'Keep my other edit');
});

bounded('pending or denied optional-permission request cannot leak enabled flag through Save', async () => {
    const f = fixture(), a = await f.page({events: true}), requested = deferred(), answer = deferred();
    f.hooks.permissionRequest = () => { requested.resolve(); return answer.promise; };
    const checkbox = a.field('privacy-online-favicons'); checkbox.checked = true;
    const change = checkbox.listeners.get('change')[0]({target: checkbox}); await requested.promise;
    a.field('quote-text').value = 'Preserve while permission pending'; const before = f.state();
    await a.save(); assert.equal(a.messages.at(-1).type, 'error'); same(f.state(), before); assert.equal(f.writes.length, 0);
    answer.resolve(false); await change;
    assert.equal(checkbox.checked, false); assert.equal(f.state().privacy.onlineFavicons, false);
    assert.equal(f.writes.some(write => write.privacy?.onlineFavicons === true), false);
    assert.equal(f.state().quote, 'Preserve while permission pending');
});

bounded('simultaneous tabs compare and merge under the same write lock', async () => {
    const f = fixture(), a = await f.page(), b = await f.page();
    a.field('show-weather').checked = true; b.field('show-hot').checked = true;
    const gate = f.pauseNextWrite(), first = a.save(); await gate.entered;
    const second = b.save(); gate.resume(); await Promise.all([first, second]); success(a); success(b);
    assert.equal(f.state().show.weather, true); assert.equal(f.state().show.hot, true);
    a.field('quote-text').value = 'First locked quote'; b.field('quote-text').value = 'Conflicting queued quote';
    const quoteGate = f.pauseNextWrite(), firstQuote = a.save(); await quoteGate.entered;
    const secondQuote = b.save(); quoteGate.resume(); await Promise.all([firstQuote, secondQuote]);
    success(a); conflict(b); assert.equal(f.state().quote, 'First locked quote');
    assert.equal(b.field('quote-text').value, 'Conflicting queued quote');
    assert.equal(new Set(f.locksUsed).size, 1, 'reads and mutation paths share one lock domain');
});

bounded('canonical quote writes advance storage baseline without erasing raw or newer input', async () => {
    const f = fixture(), a = await f.page(); a.field('quote-text').value = '  Saved with whitespace  ';
    await a.save(); success(a); assert.equal(f.state().quote, 'Saved with whitespace');
    assert.equal(a.field('quote-text').value, '  Saved with whitespace  ');
    assert.equal(a.context.window.settingsFormView.hasUncommittedWork(), false);
    a.field('quote-text').value = '  Second edit  '; await a.save(); success(a);
    assert.equal(f.state().quote, 'Second edit');
    a.field('quote-text').value = '   '; await a.save(); success(a);
    assert.equal(f.state().quote, 'Welcome to your personalized new tab page!');
    a.field('quote-text').value = 'After blank'; await a.save(); success(a); assert.equal(f.state().quote, 'After blank');
});

bounded('untouched legacy normalization cannot turn unrelated Save into a repair write', async () => {
    const f = fixture();
    f.patch({search: {engine: 'custom', custom: ''}, quote: '  Legacy whitespace  ',
        show: {...f.state().show, historical: true}, ui: {...f.state().ui, historical: {keep: true}}});
    const a = await f.page(), before = f.state();
    a.field('weather-city').value = 'Osaka'; await a.save(); success(a);
    same(f.state().search, before.search); same(f.state().quote, before.quote);
    same(f.state().show, before.show); same(f.state().ui, before.ui);
    assert.deepEqual(Object.keys(f.writes.at(-1)), ['weather']);
});

bounded('independent style and hot-topic fields merge while each topic list remains atomic', async () => {
    const f = fixture();
    f.patch({hot: {tab: 'baidu', baidu: [{t: 'Original Baidu', s: 1}], weibo: [{t: 'Original Weibo', s: 2}], zhihu: []}});
    const a = await f.page(), b = await f.page();
    a.field('shortcuts-gap-x').value = '22'; await a.save();
    b.field('shortcuts-gap-y').value = '33'; await b.save(); success(b);
    assert.equal(f.state().ui.shortcutsStyle.gapX, 22); assert.equal(f.state().ui.shortcutsStyle.gapY, 33);
    a.document.querySelector('#baidu-list .topic-title').textContent = 'Baidu from A'; await a.save(); success(a);
    b.document.querySelector('#weibo-list .topic-title').textContent = 'Weibo from B'; await b.save(); success(b);
    assert.equal(f.state().hot.baidu[0].t, 'Baidu from A'); assert.equal(f.state().hot.weibo[0].t, 'Weibo from B');
    b.document.querySelector('#baidu-list .topic-score').textContent = '999';
    const before = f.state(), count = f.writes.length; await b.save(); conflict(b);
    same(f.state(), before); assert.equal(f.writes.length, count);
    assert.equal(b.document.querySelector('#baidu-list .topic-score').textContent, '999');
});

bounded('a failed own restore keeps an already-committed general-settings baseline retryable', async () => {
    const f = fixture(), a = await f.page(); a.field('quote-text').value = 'Committed before failed import';
    const gate = f.pauseNextWrite(), saving = a.save(); await gate.entered;
    const confirmed = deferred(); a.context.confirm = () => { confirmed.resolve(); return true; };
    const replacement = f.state(); replacement.quote = 'Must not be imported';
    const importing = a.import(replacement); await confirmed.promise;
    f.hooks.write = async values => { if (TOKEN in values) throw new Error('restore commit unavailable'); };
    gate.resume(); await Promise.all([saving, importing]);
    assert.equal(a.messages.at(-1).type, 'error'); assert.equal(f.state().quote, 'Committed before failed import');
    f.hooks.write = null; a.field('quote-text').value = 'Edited after failed import'; await a.save(); success(a);
    assert.equal(f.state().quote, 'Edited after failed import');
});

bounded('own import invalidates late permission grants without resaving the pre-import form', async () => {
    const f = fixture(), a = await f.page({events: true}), requested = deferred(), answer = deferred();
    f.hooks.permissionRequest = () => { requested.resolve(); return answer.promise; };
    const checkbox = a.field('privacy-online-favicons'); checkbox.checked = true;
    const change = checkbox.listeners.get('change')[0]({target: checkbox}); await requested.promise;
    const replacement = f.state(); replacement.quote = 'Imported safely'; replacement.privacy.onlineFavicons = false;
    await a.import(replacement); success(a); const before = f.state(), count = f.writes.length;
    f.hooks.permission = true; answer.resolve(true); await change;
    same(f.state(), before); assert.equal(f.writes.length, count);
    assert.equal(f.state().privacy.onlineFavicons, false);
});

bounded('guarded Settings API rejects unowned keys and paths atomically', async () => {
    const f = fixture(), m = f.manager(), config = await m.getAll();
    for (const [data, settingsPaths] of [
        [{quote: 'Forbidden mixed write', sync: {...f.state().sync, enabled: true}}, ['quote']],
        [{quote: 'Forbidden mixed write', layout: f.state().layout}, ['quote']],
        [{ui: {...f.state().ui, dashboardHidden: true}}, ['ui.dashboardHidden']],
        [{quote: 'Forbidden clock shortcut', clock: f.state().clock}, ['quote']],
        [{quote: 'Forbidden categories shortcut', categories: f.state().categories}, ['quote']]
    ]) {
        await assert.rejects(m.setAll(data, {expectedSettings: config._settingsBaseline, settingsPaths}), {code: 'SETTINGS_CONFLICT'});
        assert.equal(f.writes.length, 0);
    }
});

bounded('typing background color text during a pending write retains the draft and departure guard', async () => {
    const f = fixture(), a = await f.page({events: true});
    a.field('bg-type').value = 'color'; a.field('bg-color').value = '#112233';
    const gate = f.pauseNextWrite();
    const save = a.field('bg-color').listeners.get('input')[0]({target: a.field('bg-color')}); await gate.entered;
    assert.equal(a.context.window.settingsFormView.hasUncommittedWork(), true, 'pending background write blocks departure');
    a.field('bg-color-text').value = '#445566'; gate.resume(); await save;
    same(f.state().bg, {type: 'color', value: '#112233'});
    assert.equal(a.field('bg-color-text').value, '#445566', 'completion must not repaint newer typing');
    assert.equal(a.field('bg-color').value, '#112233');
    assert.equal(a.context.window.settingsFormView.hasUncommittedWork(), true, 'newer unsubmitted text remains protected');
    a.field('quote-text').value = 'Unrelated save'; await a.save(); success(a);
    assert.equal(a.field('bg-color-text').value, '#445566');
    same(f.state().bg, {type: 'color', value: '#445566'}, 'explicit Save commits the background choice already dirty at submission');
    assert.equal(a.field('bg-color').value, '#445566');
    assert.equal(a.context.window.settingsFormView.hasUncommittedWork(), false);
    await a.field('bg-color-text').listeners.get('change')[0]({target: a.field('bg-color-text')});
    same(f.state().bg, {type: 'color', value: '#445566'});
    assert.equal(a.context.window.settingsFormView.hasUncommittedWork(), false);
});

bounded('background storage failure retains submitted controls and keeps draft retryable', async () => {
    const f = fixture(), a = await f.page({events: true}), before = f.state();
    a.field('bg-type').value = 'color'; a.field('bg-color').value = '#112233'; a.field('bg-color-text').value = '#112233';
    f.hooks.write = async () => { throw new Error('background write unavailable'); };
    await a.context.saveBackgroundSettings(); assert.equal(a.messages.at(-1).type, 'error');
    same(f.state(), before); assert.equal(f.writes.length, 0);
    assert.equal(a.field('bg-type').value, 'color'); assert.equal(a.field('bg-color').value, '#112233');
    assert.equal(a.field('bg-color-text').value, '#112233');
    assert.equal(a.context.window.settingsFormView.hasUncommittedWork(), true);
    f.hooks.write = null; await a.save(); success(a);
    same(f.state().bg, {type: 'color', value: '#112233'}, 'general Save retries a failed immediate color write');
    assert.equal(a.context.window.settingsFormView.hasUncommittedWork(), false);
});

bounded('newest queued background choice commits after a pending own background write', async () => {
    const f = fixture(), a = await f.page();
    a.field('bg-type').value = 'color'; a.field('bg-color').value = '#111111'; a.field('bg-color-text').value = '#111111';
    const gate = f.pauseNextWrite(), first = a.context.saveBackgroundSettings(); await gate.entered;
    a.field('bg-color').value = '#222222'; a.field('bg-color-text').value = '#222222';
    const newest = a.context.saveBackgroundSettings(); gate.resume(); await Promise.all([first, newest]);
    same(f.state().bg, {type: 'color', value: '#222222'});
    assert.equal(a.field('bg-color-text').value, '#222222');
    assert.equal(a.context.window.settingsFormView.hasUncommittedWork(), false);
    assert.equal(f.writes.length, 2);
});

bounded('own topic add/edit/delete helpers advance their baseline for the next unrelated Save', async () => {
    const f = fixture(); f.patch({hot: {tab: 'baidu', baidu: [{t: 'Original', s: 1}], weibo: [], zhihu: []}});
    const a = await f.page();
    await a.context.addHotTopic('baidu', 'Added', 2); success(a);
    a.field('quote-text').value = 'After topic add'; await a.save(); success(a);
    same(f.state().hot.baidu, [{t: 'Original', s: 1}, {t: 'Added', s: 2}]);
    assert.equal('hot' in f.writes.at(-1), false, 'general Save does not replay a successful helper write');
    const prompts = ['Edited', '3']; a.context.prompt = () => prompts.shift();
    await a.context.editHotTopic('baidu', 1); success(a);
    a.field('quote-text').value = 'After topic edit'; await a.save(); success(a);
    same(f.state().hot.baidu, [{t: 'Original', s: 1}, {t: 'Edited', s: 3}]);
    await a.context.deleteHotTopic('baidu', 0); success(a);
    a.field('quote-text').value = 'After topic delete'; await a.save(); success(a);
    same(f.state().hot.baidu, [{t: 'Edited', s: 3}]);
    assert.equal(a.context.window.settingsFormView.hasUncommittedWork(), false);
});

bounded('stale topic add/edit/delete helpers reject external changes and preserve their visible draft', async () => {
    for (const operation of ['add', 'edit', 'delete']) {
        const f = fixture(); f.patch({hot: {tab: 'baidu', baidu: [{t: 'Original', s: 1}], weibo: [], zhihu: []}});
        const a = await f.page(), b = await f.page();
        await b.context.addHotTopic('baidu', 'Other tab', 9); success(b);
        const before = f.state(), count = f.writes.length;
        let expectedDraft;
        if (operation === 'add') {
            expectedDraft = [{t: 'Original', s: 1}, {t: 'My new topic', s: 4}];
            await a.context.addHotTopic('baidu', 'My new topic', 4);
        } else if (operation === 'edit') {
            expectedDraft = [{t: 'My edited topic', s: 5}];
            const prompts = ['My edited topic', '5']; a.context.prompt = () => prompts.shift();
            await a.context.editHotTopic('baidu', 0);
        } else {
            expectedDraft = []; await a.context.deleteHotTopic('baidu', 0);
        }
        conflict(a); same(f.state(), before); assert.equal(f.writes.length, count);
        same(a.context.collectHotTopicsFromList('baidu'), expectedDraft);
        assert.equal(a.context.window.settingsFormView.hasUncommittedWork(), true);
        await a.save(); conflict(a); same(f.state(), before);
        same(a.context.collectHotTopicsFromList('baidu'), expectedDraft);
    }
});

bounded('queued topic multi-add preserves all accepted additions and pending ownership', async () => {
    const f = fixture(); f.patch({hot: {tab: 'baidu', baidu: [], weibo: [{t: 'Other list', s: 1}], zhihu: []}});
    const a = await f.page(), gate = f.pauseNextWrite();
    const first = a.context.addHotTopic('baidu', 'First', 1); await gate.entered;
    assert.equal(a.context.window.settingsFormView.pending, true);
    const second = a.context.addHotTopic('baidu', 'Second', 2);
    same(a.context.collectHotTopicsFromList('baidu'), [{t: 'First', s: 1}, {t: 'Second', s: 2}]);
    gate.resume(); await Promise.all([first, second]); success(a);
    same(f.state().hot.baidu, [{t: 'First', s: 1}, {t: 'Second', s: 2}]);
    same(f.state().hot.weibo, [{t: 'Other list', s: 1}]);
    assert.equal(a.context.window.settingsFormView.pending, false);
    assert.equal(a.context.window.settingsFormView.hasUncommittedWork(), false);
    a.field('quote-text').value = 'After queued topics'; await a.save(); success(a);
});

bounded('failed topic helper retains accepted draft for retry and only clears accepted Add input', async () => {
    const f = fixture(); f.patch({hot: {tab: 'baidu', baidu: [], weibo: [], zhihu: []}});
    const a = await f.page(), section = a.document.createElement('div'); section.id = 'baidu-topics'; section.className = 'topic-list';
    const title = a.document.createElement('input'); title.className = 'topic-title-input';
    const score = a.document.createElement('input'); score.className = 'topic-score-input';
    const add = a.document.createElement('button'); add.className = 'add-topic-btn'; section.append(title, score, add); a.document.body.append(section);
    a.context.setupEventListeners();
    title.value = '  '; score.value = '2'; add.dispatch('click');
    assert.equal(title.value, '  '); assert.equal(score.value, '2'); assert.equal(f.writes.length, 0);
    title.value = 'Must retain on failure'; score.value = '7';
    f.hooks.write = async () => { throw new Error('topic write unavailable'); };
    add.dispatch('click'); assert.equal(title.value, ''); assert.equal(score.value, '');
    await vm.runInContext('settingsSaveQueue', a.context);
    assert.equal(a.messages.at(-1).type, 'error'); assert.equal(f.writes.length, 0);
    same(a.context.collectHotTopicsFromList('baidu'), [{t: 'Must retain on failure', s: 7}]);
    assert.equal(a.context.window.settingsFormView.hasUncommittedWork(), true);
    f.hooks.write = null; await a.save(); success(a);
    same(f.state().hot.baidu, [{t: 'Must retain on failure', s: 7}]);
    assert.equal(a.context.window.settingsFormView.hasUncommittedWork(), false);
});

bounded('topic helper does not resurrect a detached row action after list re-render', async () => {
    const f = fixture(); f.patch({hot: {tab: 'baidu', baidu: [{t: 'First', s: 1}], weibo: [], zhihu: []}});
    const a = await f.page(), obsoleteDelete = a.document.querySelector('#baidu-list .delete-topic-btn');
    await a.context.addHotTopic('baidu', 'Second', 2); const before = f.state(), count = f.writes.length;
    obsoleteDelete.dispatch('click'); await vm.runInContext('settingsSaveQueue', a.context);
    same(f.state(), before); assert.equal(f.writes.length, count);
});

bounded('poster upload pending state protects departure and queued general Save preserves the asset', async () => {
    const f = fixture(); f.patch({movie: {...f.state().movie, poster: IMAGE}});
    const a = await f.page(), reader = a.readFileLater();
    const uploading = a.context.handleMoviePosterUpload({type: 'image/png', size: 3}); await reader.started;
    assert.equal(a.context.window.settingsFormView.pending, true);
    assert.equal(a.context.window.settingsFormView.hasUncommittedWork(), true);
    a.field('movie-title').value = 'Title during poster read'; const saving = a.save();
    reader.finish(); await Promise.all([uploading, saving]); success(a);
    assert.equal(f.state().movie.poster, NEW_IMAGE); assert.equal(f.state().movie.title, 'Title during poster read');
    assert.equal(a.field('movie-title').value, 'Title during poster read');
    assert.equal(a.field('movie-preview-img').src, NEW_IMAGE);
    assert.equal(a.context.window.settingsFormView.pending, false);
    assert.equal(a.context.window.settingsFormView.hasUncommittedWork(), false);
});

bounded('poster upload then queued removal uses latest own baseline and unrelated Save cannot restore it', async () => {
    const f = fixture(); f.patch({movie: {...f.state().movie, poster: IMAGE}});
    const a = await f.page(), reader = a.readFileLater();
    const uploading = a.context.handleMoviePosterUpload({type: 'image/png', size: 3}); await reader.started;
    const removing = a.context.removeMoviePoster(); reader.finish(); await Promise.all([uploading, removing]); success(a);
    assert.equal(f.state().movie.poster, ''); assert.equal(a.field('movie-poster-preview').style.display, 'none');
    a.field('movie-note').value = 'Note after removal'; await a.save(); success(a);
    assert.equal(f.state().movie.poster, ''); assert.equal(f.state().movie.note, 'Note after removal');
    assert.equal(a.context.window.settingsFormView.pending, false);
});

bounded('stale poster upload/removal reject concurrent asset changes without rewriting title or preview', async () => {
    for (const operation of ['upload', 'remove']) {
        const f = fixture(); f.patch({movie: {...f.state().movie, poster: IMAGE}});
        const a = await f.page(), b = await f.page();
        b.context.FileReader = class {readAsDataURL() { this.result = NEW_IMAGE; this.onload(); }};
        await b.context.handleMoviePosterUpload({type: 'image/png', size: 3}); success(b);
        const before = f.state(), count = f.writes.length;
        if (operation === 'upload') {
            a.context.FileReader = class {readAsDataURL() { this.result = 'data:image/png;base64,Q09ORkxJQ1Q='; this.onload(); }};
            await a.context.handleMoviePosterUpload({type: 'image/png', size: 3});
        } else await a.context.removeMoviePoster();
        conflict(a); same(f.state(), before); assert.equal(f.writes.length, count);
        assert.equal(a.field('movie-preview-img').src, IMAGE, 'conflicted helper cannot repaint the preview as saved');
        a.field('movie-title').value = 'Independent title'; await a.save(); success(a);
        assert.equal(f.state().movie.poster, NEW_IMAGE); assert.equal(f.state().movie.title, 'Independent title');
    }
});

bounded('own import invalidates a pending poster FileReader and queued removal', async () => {
    const f = fixture(); f.patch({movie: {...f.state().movie, poster: IMAGE}});
    const a = await f.page(), reader = a.readFileLater();
    const upload = a.context.handleMoviePosterUpload({type: 'image/png', size: 3}); await reader.started;
    const removing = a.context.removeMoviePoster();
    const confirmed = deferred(); a.context.confirm = () => { confirmed.resolve(); return true; };
    const replacement = f.state(); replacement.movie.title = 'Restored movie';
    const importing = a.import(replacement); await confirmed.promise;
    reader.finish(); await Promise.all([upload, removing, importing]); success(a);
    assert.equal(f.state().movie.poster, IMAGE); assert.equal(f.state().movie.title, 'Restored movie');
    assert.equal(f.writes.some(write => write.movie?.poster === NEW_IMAGE || write.movie?.poster === ''), false);
    assert.equal(a.messages.some(message => /Movie poster (uploaded|removed)\./.test(message.text)), false);
    assert.equal(a.context.window.settingsFormView.pending, false);
});

bounded('failed poster upload and removal keep baseline and preview available for retry', async () => {
    const f = fixture(); f.patch({movie: {...f.state().movie, poster: IMAGE}});
    const a = await f.page(); a.context.FileReader = class {readAsDataURL() { this.result = NEW_IMAGE; this.onload(); }};
    f.hooks.write = async () => { throw new Error('poster write unavailable'); };
    await a.context.handleMoviePosterUpload({type: 'image/png', size: 3}); assert.equal(a.messages.at(-1).type, 'error');
    assert.equal(f.state().movie.poster, IMAGE); assert.equal(a.field('movie-preview-img').src, IMAGE);
    assert.equal(a.context.window.settingsFormView.pending, false);
    f.hooks.write = null; await a.context.handleMoviePosterUpload({type: 'image/png', size: 3}); success(a);
    assert.equal(f.state().movie.poster, NEW_IMAGE);
    f.hooks.write = async () => { throw new Error('poster removal unavailable'); };
    await a.context.removeMoviePoster(); assert.equal(a.messages.at(-1).type, 'error');
    assert.equal(f.state().movie.poster, NEW_IMAGE); assert.equal(a.field('movie-preview-img').src, NEW_IMAGE);
    f.hooks.write = null; await a.context.removeMoviePoster(); success(a); assert.equal(f.state().movie.poster, '');
});

bounded('Finder shortcut checkbox saves independently and stale unrelated UI saves preserve it', async () => {
    const f = fixture(), a = await f.page(), b = await f.page();
    assert.equal(a.field('finder-shortcut-enabled').checked, true);
    a.field('finder-shortcut-enabled').checked = false; await a.save(); success(a);
    assert.equal(f.state().ui.finderShortcutEnabled, false);
    b.field('show-shortcut-titles').checked = false; await b.save(); success(b);
    assert.equal(f.state().ui.finderShortcutEnabled, false);
    assert.equal(f.state().ui.showShortcutTitles, false);
    const c = await f.page(); assert.equal(c.field('finder-shortcut-enabled').checked, false);
    c.field('finder-shortcut-enabled').checked = true; await c.save(); success(c);
    assert.equal(f.state().ui.finderShortcutEnabled, true);
    assert.equal(f.state().ui.showShortcutTitles, false);
});
bounded('Finder preference draft survives whole-restore conflict and defaults reset enables it', async () => {
    const f = fixture(), a = await f.page(), b = await f.page();
    a.field('finder-shortcut-enabled').checked = false;
    assert.equal(a.context.window.settingsFormView.hasUncommittedWork(), true);
    await b.import(f.state()); success(b);
    const before = f.state(); await a.save(); conflict(a); same(f.state(), before);
    assert.equal(a.field('finder-shortcut-enabled').checked, false);
    const c = await f.page(); c.field('finder-shortcut-enabled').checked = false; await c.save(); success(c);
    await c.context.resetAllSettings(); assert.equal((await c.storage.getAll()).ui.finderShortcutEnabled, true);
});
bounded('Finder checkbox uses ordinary debounced autosave and keeps a newer draft during pending save', async () => {
    const f = fixture(), a = await f.page();
    a.context.setupAutoSave();
    a.field('finder-shortcut-enabled').checked = false;
    a.field('finder-shortcut-enabled').dispatch('change');
    assert.equal(a.timers.size, 1);
    const entered = deferred(), release = deferred();
    f.hooks.write = async () => { entered.resolve(); await release.promise; };
    const pending = [...a.timers.values()][0]();
    await entered.promise;
    a.field('finder-shortcut-enabled').checked = true;
    release.resolve(); await pending;
    assert.equal(f.state().ui.finderShortcutEnabled, false);
    assert.equal(a.field('finder-shortcut-enabled').checked, true);
    assert.equal(a.context.window.settingsFormView.hasUncommittedWork(), true);
    f.hooks.write = null; await a.save(); success(a);
    assert.equal(f.state().ui.finderShortcutEnabled, true);
});
