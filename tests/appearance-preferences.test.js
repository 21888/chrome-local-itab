const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const StorageManager = require('../storage.js');
const clone = value => JSON.parse(JSON.stringify(value));
const defer = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const manager = new StorageManager();
const fresh = { template: 'clarity', colorMode: 'light' };

for (const themePreset of [undefined, 'ink-paper', 'aurora-glass', 'warm-studio', 'signal-pop']) {
    const raw = { links: [{ title: 'Existing', url: 'https://example.com/', category: 'custom' }] };
    if (themePreset) raw.themePreset = themePreset;
    const expected = { template: 'clarity', colorMode: themePreset && themePreset !== 'ink-paper' ? 'dark' : 'light' };
    for (const payload of [raw, { settings: raw }, { version: '1.0', data: raw }, manager.buildManualExportPayload(raw), manager.buildDriveBackupPayload(raw)]) {
        assert.deepEqual(manager.validateImportPayload(payload).appearance, expected);
    }
    assert.deepEqual(manager.validateConfigObject(raw).appearance, expected);
    if (themePreset) assert.equal(manager.validateConfigObject(raw).themePreset, themePreset);
}
assert.deepEqual(manager.validateConfigObject({}).appearance, fresh);
for (const malformed of [null, [], 'graphite', { template: 'unknown' }, { colorMode: 'system' }, { template: false }]) {
    assert.throws(() => manager.validateImportPayload({ links: [], appearance: malformed }), /Invalid backup:/);
}
assert.deepEqual(manager.validateData('appearance', { template: 'unknown', colorMode: 'invalid' }), fresh);
assert.deepEqual(manager.validateImportPayload({ links: [], appearance: { template: 'folio' } }).appearance, { template: 'folio', colorMode: 'light' });

const fixture = manager.cloneDefaultConfig();
fixture.links = [{ title: 'Work A', url: 'https://example.com/', icon: 'A', category: 'custom' }, { title: 'Work A', url: 'https://example.com/', icon: 'B', category: 'custom' }];
fixture.categories = [{ id: 'custom', name: 'My collection', icon: 'C' }];
fixture.layout = { autoArrange: false, alignToGrid: false, gridSize: 144, columns: 3, positions: { 'custom|https://example.com/': { x: 37, y: 53 } } };
fixture.bg = { type: 'image', value: 'data:image/png;base64,QUJD' };
fixture.movie.poster = 'data:image/png;base64,REVG';
fixture.ui.dashboardPadding = { top: 9, left: 10, right: 12, bottom: 13 };
fixture.ui.showShortcutTitles = false;
fixture.search = { engine: 'custom', custom: 'https://example.com/?q=%s#results' };
fixture.sync = { enabled: true, lastSync: 'local', lastError: '', includeLargeAssets: true };
for (const template of ['clarity', 'graphite', 'folio']) {
    for (const colorMode of ['light', 'dark']) {
        const config = { ...fixture, appearance: { template, colorMode } };
        const restored = manager.prepareRestoredConfig(manager.buildManualExportPayload(config), fixture);
        assert.deepEqual(restored, { ...config, sync: manager.validateSyncConfig(config.sync) });
    }
}

function controllerHarness(initial = fresh) {
    const data = { ...clone(fixture), appearance: clone(initial) };
    const writes = [], paints = [], renders = [], errors = [];
    const document = { documentElement: { dataset: {} } };
    const storage = new StorageManager();
    storage.getAppearanceForUpdate = async () => clone(data.appearance);
    storage.set = async (key, value) => { assert.equal(key, 'appearance'); writes.push(clone(value)); data[key] = clone(value); return true; };
    // UI-only fake for the atomic storage API; actual cross-page transactions
    // are exercised separately in appearance-concurrency.test.js.
    storage.patchAppearance = async patch => {
        const value = { ...await storage.getAppearanceForUpdate(), ...patch };
        return await storage.set('appearance', value) ? value : false;
    };
    const context = { window: { document }, console };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('shared/appearance.js', 'utf8'), context);
    const controller = new context.window.LocalItabAppearance.Controller({ storage, initial,
        render: (value, state) => renders.push({ value: clone(value), state }),
        onApply: value => paints.push(clone(value)), onError: error => errors.push(error) });
    return { controller, storage, data, writes, paints, renders, errors, document };
}

(async () => {
    let raw = {}, writeCount = 0, failRead = false;
    global.chrome = { storage: { local: {
        get: async keys => {
            if (failRead) throw new Error('Read failed');
            return keys ? Object.fromEntries(keys.filter(key => key in raw).map(key => [key, clone(raw[key])])) : clone(raw);
        },
        set: async values => { writeCount++; Object.assign(raw, clone(values)); }
    } } };
    Object.defineProperty(global, 'navigator', {configurable: true, value: {locks: {request: (_name, operation) => operation()}}});
    manager.ensureSyncInitialized = async () => {};
    for (const config of [{}, { links: [] }, { themePreset: 'ink-paper' }, { themePreset: 'warm-studio' }, { appearance: { template: 'graphite', colorMode: 'light' } }]) {
        raw = clone(config);
        const before = JSON.stringify(raw);
        assert.deepEqual((await manager.getAll()).appearance, manager.resolveAppearance(config));
        assert.deepEqual(await manager.getAppearanceForUpdate(), manager.resolveAppearance(config));
        assert.equal(JSON.stringify(raw), before);
    }
    assert.equal(writeCount, 0, 'loading a legacy setting never writes a migration');
    failRead = true;
    await assert.rejects(() => manager.getAppearanceForUpdate(), /Read failed/);
    failRead = false;
    const settingsContext = { document: { addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } }, window: {}, storageManager: manager, chrome: global.chrome, console };
    vm.createContext(settingsContext);
    vm.runInContext(fs.readFileSync('options.js', 'utf8') + '\nshowMessage = () => {}; displayStorageInfo = async () => {};', settingsContext);
    for (const preset of [undefined, 'ink-paper', 'aurora-glass', 'warm-studio', 'signal-pop']) {
        raw = preset ? { themePreset: preset } : {};
        const expected = manager.resolveAppearance(raw);
        settingsContext.initialConfig = await manager.getAll();
        vm.runInContext('settingsFormConfig = initialConfig; settingsBaseline = initialConfig._settingsBaseline; settingsFormBaseline = collectFormData();', settingsContext);
        const form = await settingsContext.collectFormData();
        assert.equal('appearance' in form, false);
        assert.equal('themePreset' in form, false);
        await settingsContext.saveAllSettings();
        assert.deepEqual(await manager.getAppearanceForUpdate(), expected, 'unrelated save cannot create a legacy-dark preference');
        assert.deepEqual((await manager.getAll()).appearance, expected);
        assert.equal(raw.themePreset, preset);
    }


    const h = controllerHarness();
    const unchanged = clone(h.data); delete unchanged.appearance;
    for (const template of ['graphite', 'folio', 'clarity']) assert.equal(await h.controller.select('template', template), true);
    await h.controller.select('colorMode', 'dark');
    await h.controller.select('template', 'folio');
    assert.deepEqual(h.data.appearance, { template: 'folio', colorMode: 'dark' });
    const after = clone(h.data); delete after.appearance; assert.deepEqual(after, unchanged);
    assert.equal(await h.controller.select('other', 'value'), false);

    for (const failure of ['false', 'throw', 'read']) {
        const test = controllerHarness({ template: 'graphite', colorMode: 'dark' });
        const oldSet = test.storage.set, oldRead = test.storage.getAppearanceForUpdate;
        if (failure === 'read') test.storage.getAppearanceForUpdate = async () => { throw new Error('read'); };
        else test.storage.set = async () => { if (failure === 'throw') throw new Error('save'); return false; };
        assert.equal(await test.controller.select('template', 'folio'), false);
        assert.deepEqual(test.data.appearance, { template: 'graphite', colorMode: 'dark' });
        assert.deepEqual(test.renders.at(-1), { value: test.data.appearance, state: 'error' });
        assert.equal(test.paints.length, 0); assert.equal(test.errors.length, 1);
        test.storage.set = oldSet; test.storage.getAppearanceForUpdate = oldRead;
        assert.equal(await test.controller.select('template', 'folio'), true);
    }
    // Coalesce requests that have not started, retaining both independent axes.
    const rapid = controllerHarness();
    const first = rapid.controller.select('template', 'graphite');
    const second = rapid.controller.select('colorMode', 'dark');
    const third = rapid.controller.select('template', 'folio');
    await Promise.all([first, second, third]);
    assert.deepEqual(rapid.writes, [{ template: 'folio', colorMode: 'dark' }]);
    assert.deepEqual(rapid.paints, rapid.writes);

    // An older started write must finish before the next; its late paint is suppressed.
    const pending = controllerHarness();
    const gate = defer(); let calls = 0;
    const realSet = pending.storage.set;
    pending.storage.set = async (key, value) => { if (++calls === 1) await gate.promise; return realSet(key, value); };
    const old = pending.controller.select('template', 'graphite'); await tick();
    const next = pending.controller.select('colorMode', 'dark');
    assert.equal(calls, 1); gate.resolve(); await Promise.all([old, next]);
    assert.deepEqual(pending.writes, [{ template: 'graphite', colorMode: 'light' }, { template: 'graphite', colorMode: 'dark' }]);
    assert.deepEqual(pending.paints, [{ template: 'graphite', colorMode: 'dark' }]);

    const recovery = controllerHarness(); const saved = defer(); let attempts = 0;
    const recoverSet = recovery.storage.set;
    recovery.storage.set = async (key, value) => { if (++attempts === 1) { await saved.promise; return recoverSet(key, value); } return false; };
    const saving = recovery.controller.select('template', 'graphite'); await tick();
    const failed = recovery.controller.select('template', 'folio'); saved.resolve(); await Promise.all([saving, failed]);
    assert.deepEqual(recovery.data.appearance, { template: 'graphite', colorMode: 'light' });
    assert.deepEqual(recovery.renders.at(-1), { value: recovery.data.appearance, state: 'error' });
    assert.deepEqual(recovery.paints, [recovery.data.appearance]);

    // Refresh only this setting, and ignore an older refresh when a local intent begins.
    const refresh = controllerHarness(); const read = defer();
    const currentRead = refresh.storage.getAppearanceForUpdate;
    refresh.storage.getAppearanceForUpdate = () => read.promise;
    const refreshing = refresh.controller.refresh();
    refresh.storage.getAppearanceForUpdate = currentRead;
    await refresh.controller.select('template', 'folio');
    read.resolve({ template: 'graphite', colorMode: 'dark' }); await refreshing;
    assert.deepEqual(refresh.paints, [{ template: 'folio', colorMode: 'light' }]);
    refresh.data.appearance = { template: 'graphite', colorMode: 'dark' };
    await refresh.controller.refresh();
    assert.deepEqual(refresh.paints.at(-1), refresh.data.appearance);
    console.log('appearance preference tests ok (storage/controller model)');
})().catch(error => { console.error(error); process.exitCode = 1; });
