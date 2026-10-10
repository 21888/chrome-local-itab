const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const StorageManager = require('../storage.js');
const {createHarness} = require('./helpers/dashboard-harness');

test('Finder shortcut is enabled for legacy/missing UI; strict backup types and manual/Drive round trips preserve false', () => {
    const manager = new StorageManager();
    for (const raw of [{}, {finderShortcutEnabled: 'false'}, {finderShortcutEnabled: 0}]) {
        assert.equal(manager.validateUiConfig(raw).finderShortcutEnabled, true);
    }
    assert.equal(manager.cloneDefaultConfig().ui.finderShortcutEnabled, true);
    for (const enabled of [false, true]) {
        const config = manager.cloneDefaultConfig(); config.ui.finderShortcutEnabled = enabled;
        assert.equal(manager.prepareSyncPayload(config).payload.ui.finderShortcutEnabled, enabled);
        for (const payload of [manager.buildManualExportPayload(config), manager.buildDriveBackupPayload(config)]) {
            assert.equal(payload.data.ui.finderShortcutEnabled, enabled);
            assert.equal(manager.validateImportPayload(JSON.parse(JSON.stringify(payload))).ui.finderShortcutEnabled, enabled);
        }
    }
    const legacy = manager.cloneDefaultConfig(); delete legacy.ui.finderShortcutEnabled;
    assert.equal(manager.validateImportPayload(legacy).ui.finderShortcutEnabled, true);
    for (const invalid of ['false', 0, null, {}, []]) {
        const config = manager.cloneDefaultConfig(); config.ui.finderShortcutEnabled = invalid;
        assert.throws(() => manager.validateImportPayload(config), /finderShortcutEnabled/);
    }
});
test('actual dashboard initialization supplies the preference before mounting and retains it on rerender', () => {
    const h = createHarness();
    h.context.ShortcutsComponent.prototype.createModal = function () {};
    const values = []; let mounted;
    h.context.window.LocalItabFinder = {mountForShortcuts(host, component) {
        mounted = component; values.push(component.finderShortcutEnabled); return {destroy() {}};
    }};
    for (const ui of [{finderShortcutEnabled: false}, {finderShortcutEnabled: true}, undefined]) {
        h.context.initializeShortcutsComponent([], {autoArrange: true}, [], undefined, ui);
        assert.equal(values.at(-1), ui?.finderShortcutEnabled !== false);
        mounted.render(); assert.equal(values.at(-1), ui?.finderShortcutEnabled !== false);
    }
    const source = fs.readFileSync('newtab.js', 'utf8');
    assert.match(source, /initializeShortcutsComponent\(config.links, config.layout, config.categories, config._layoutBaseline, config.ui\)/);
});
test('Settings checkbox uses both catalogs, associated description and existing searchable settings structure', () => {
    const html = fs.readFileSync('options.html', 'utf8');
    assert.match(html, /id="finder-shortcut-enabled" class="setting-checkbox" aria-describedby="finder-shortcut-description"/);
    assert.match(html, /id="finder-shortcut-description" data-i18n="finderShortcutSettingDesc"/);
    for (const locale of ['en', 'zh_CN']) {
        const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        assert.ok(messages.finderShortcutSetting.message.includes('/'));
        assert.ok(messages.finderShortcutSettingDesc.message);
    }
});
