const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const StorageManager = require('../storage.js');
const manager = new StorageManager();
const link = { title: 'Saved site', url: 'https://example.com/', category: 'work' };
const valid = { links: [link], quote: 'Keep my local data' };
const malformed = [
    null, [], 'settings', {}, { unrelated: true }, { quote: 'missing shortcuts' },
    { links: 'corrupt' }, { links: [link, null] }, { links: [link, []] },
    { links: [link, { title: 'Invalid', url: 'javascript:alert(1)' }] },
    { links: [{ title: '', url: 'https://example.com/' }] },
    { links: [], categories: [null] }, { links: [], categories: [{ name: '' }] },
    { links: [], clock: [] }, { links: [], quote: false },
    { links: [], hot: { baidu: 'corrupt' } }, { links: [], hot: { weibo: [null] } },
    { links: [], hot: { zhihu: [{ s: 1 }] } },
    { version: '1.0', data: null }, { settings: [] },
    { schemaVersion: 999, data: valid }, { schemaVersion: '1', data: valid },
    { type: 'another-app', data: valid }, { app: 'another-app', data: valid },
    { data: valid, settings: { links: [] } },
    { version: '99.0', data: valid }, { app: 'foreign', links: [] }, { type: 'foreign', links: [] },
    { links: [], bg: { type: 'image', value: 'corrupted-base64' } },
    { links: [], movie: { title: 'Keep', poster: 'corrupted-base64' } },
    { links: [], show: { clock: 'false' } }, { links: [], clock: { hour12: 'yes' } },
    { links: [], hot: { baidu: [{ t: 'Keep', s: 'many' }] } },
    { links: [], layout: { positions: [] } }, { links: [], layout: { positions: { a: { x: '0', y: 0 } } } },
    { links: [], ui: { dashboardPadding: { top: 'large' } } },
    { links: [], ui: { shortcutsStyle: { gapX: 'wide' } } },
    { links: [], search: { custom: 'javascript:alert(1)' } },
    { links: [], themePreset: 'unsupported' }

];
for (const value of malformed) {
    assert.throws(() => manager.validateImportPayload(value), /Invalid backup:/, JSON.stringify(value));
}
// Preserve the formats already supported by previous exports.
for (const payload of [valid, { settings: valid }, { version: '1.0', data: valid },
    manager.buildManualExportPayload(valid), manager.buildDriveBackupPayload(valid)]) {
    const before = JSON.stringify(payload);
    const result = manager.validateImportPayload(payload);
    assert.equal(result.links.length, 1);
    assert.equal(result.links[0].url, link.url);
    assert.equal(result.quote, valid.quote);
    assert.equal(result.sync.enabled, false);
    assert.equal(JSON.stringify(payload), before, 'validation must not mutate input');
}
for (const payload of [{ links: [] }, manager.buildManualExportPayload(manager.cloneDefaultConfig())]) {
    assert.deepEqual(manager.validateImportPayload(payload).links, []);
}
const assets = manager.cloneDefaultConfig();
assets.bg = { type: 'image', value: 'data:image/png;base64,QUJD' };
assets.movie.poster = 'data:image/jpeg;base64,QUJD';
assets.ui.dashboardPadding = { top: 12, right: null, bottom: 8, left: 10 };
assets.layout.positions = { example: { x: 0, y: 96 } };
const restoredAssets = manager.validateImportPayload(manager.buildManualExportPayload(assets));
assert.deepEqual(restoredAssets.bg, assets.bg);
assert.equal(restoredAssets.movie.poster, assets.movie.poster);
assert.deepEqual(restoredAssets.ui.dashboardPadding, assets.ui.dashboardPadding);
assert.deepEqual(restoredAssets.layout.positions, assets.layout.positions);
assert.equal(manager.validateImportPayload({ links: [], ui: { dashboardPadding: 8 } }).ui.dashboardPadding.top, 8);
assert.equal(manager.validateImportPayload({ links: [{ title: 'Old site', url: 'example.com' }] }).links[0].url, 'https://example.com/');
const providerState = { sync: { enabled: true, lastSync: 'local marker', lastError: '', includeLargeAssets: false } };
assert.deepEqual(manager.prepareRestoredConfig(valid, providerState).sync, providerState.sync);

// Exercise the actual settings import path: invalid input cannot reach confirm,
// setAll, or reload; a valid empty backup is still an intentional replacement.
(async () => {
    let writes = 0, confirmations = 0;
    const feedback = [];
    manager.getLocalProviderState = async () => providerState;
    manager.setAll = async (data, options) => {
        writes++;
        assert.deepEqual(data.sync, providerState.sync);
        assert.equal(options.skipSyncSideEffects, true);
        return true;
    };
    const context = {
        storageManager: manager,
        document: { addEventListener() {}, getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; } },
        window: {}, console: { error() {}, log() {} }, setTimeout() {},
        confirm() { confirmations++; return true; },
        localStorage: { getItem() { return null; } }, URL, Blob
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('options.js', 'utf8'), context);
    context.showImportExportFeedback = (operation, state, message) => feedback.push({ operation, state, message });
    for (const payload of malformed) {
        await context.importSettings({ name: 'backup.json', size: 100, text: async () => JSON.stringify(payload) });
        assert.equal(feedback.at(-1).state, 'error');
    }
    assert.equal(writes, 0);
    assert.equal(confirmations, 0);
    await context.importSettings({ name: 'backup.json', size: 100, text: async () => JSON.stringify({ links: [] }) });
    assert.equal(writes, 1);
    assert.equal(confirmations, 1);
    assert.equal(feedback.at(-1).state, 'success');
    console.log('import safety tests ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
