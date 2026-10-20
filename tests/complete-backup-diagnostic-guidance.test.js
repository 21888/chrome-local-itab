'use strict';
// Real backup view with synthetic DOM and a read-only export/download boundary.
// This is not native browser, storage durability or upgrade validation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const Backup = require('../shared/complete-backup');
const source = fs.readFileSync('shared/complete-backup-view.js', 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
function model(locale) {
    const document = createDocument();
    const catalog = locale && JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const window = {LocalItabCompleteBackup: Backup, ...(catalog ? {i18n: {t: key => catalog[key]?.message || key}} : {})};
    vm.runInNewContext(source, {window, setTimeout, URL, Blob});
    const mount = (options = {}) => {
        const host = document.createElement('div'); document.body.append(host);
        let exports = 0; const downloads = [];
        const store = {exportInterruptedCandidates: async () => { exports++; return 'SYNTHETIC DIAGNOSTIC'; }, ...options.store};
        const view = window.LocalItabCompleteBackupView.mount(host, {store, ...options, download: async (...args) => { downloads.push(args); await options.download?.(); }});
        return {host, view, downloads, exports: () => exports, get: name => host.querySelector('.complete-backup-' + name)};
    };
    return {mount, catalog};
}
for (const locale of [undefined, 'en', 'zh_CN']) {
    for (const recoveryOnly of [false, true]) test(`diagnostic explanation precedes download and is linked to its control: ${locale || 'fallback'}, recovery=${recoveryOnly}`, async () => {
        const {mount, catalog} = model(locale), m = mount({recoveryOnly});
        const help = m.get('interrupted-download-help'), button = m.get('download-interrupted');
        assert(help, 'explanation is rendered before any action');
        assert.equal(help.hidden, false); assert.equal(button.hidden, false);
        assert(help.id); assert.equal(button.getAttribute('aria-describedby'), help.id);
        assert.match(help.textContent, /before/); assert.match(help.textContent, /current/);
        if (catalog) assert.equal(help.textContent, catalog.completeBackupInterruptedDownloadHelp.message);
        assert.equal(m.exports(), 0); assert.equal(m.downloads.length, 0);
        button.dispatch('click'); await tick();
        assert.equal(m.exports(), 1); assert.equal(m.downloads.length, 1);
        assert.equal(m.downloads[0][0], 'SYNTHETIC DIAGNOSTIC');
        assert.equal(m.downloads[0][1], 'local-itab-interrupted-copies');
        const status = m.get('status').textContent;
        if (catalog) assert.equal(status, catalog.completeBackupInterruptedDownloadRequested.message);
        else { assert.match(status, /diagnostic/i); assert.match(status, /not.*import/i); assert.match(status, /cannot be verified/i); }
        assert.equal(m.view.pending, false); m.view.destroy();
    });
}
test('hidden/unavailable diagnostic action has no visible orphan explanation', () => {
    for (const options of [{downloadOnly:true}, {store:{exportInterruptedCandidates:undefined}}]) {
        const m = model('en').mount(options);
        assert.equal(m.get('download-interrupted').hidden, true);
        assert.equal(m.get('interrupted-download-help')?.hidden, true);
        m.view.destroy();
    }
});
test('two mounts have separate accessible description identities', () => {
    const {mount} = model(); const a = mount(), b = mount();
    assert(a.get('interrupted-download-help')); assert(b.get('interrupted-download-help'));
    assert.notEqual(a.get('interrupted-download-help').id, b.get('interrupted-download-help').id);
    a.view.destroy(); b.view.destroy();
});
test('diagnostic feedback waits for download, excludes repeat actions, and never reports success on failure', async () => {
    const wait = deferred(), {mount, catalog} = model('en');
    const m = mount({download: async () => { await wait.promise; throw {code: 'FILE'}; }});
    const success = catalog.completeBackupInterruptedDownloadRequested.message;
    m.get('download-interrupted').dispatch('click'); await tick();
    m.get('download-interrupted').dispatch('click');
    assert.equal(m.exports(), 1); assert.equal(m.downloads.length, 1);
    assert.notEqual(m.get('status').textContent, success);
    wait.resolve(); await tick();
    assert.notEqual(m.get('status').textContent, success);
    assert.match(m.get('status').textContent, /Could not read/);
    assert.equal(m.view.pending, false); m.view.destroy();
});
