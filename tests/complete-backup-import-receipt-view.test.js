'use strict';
// Production UI + production Store/StorageManager/Workspace methods, with a
// synthetic DOM and RAM storage. This is not an installed-extension test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const { Backup, clone, fixture, withGlobals, seed, storageFor, boot, values, uncertainImport } = require('./helpers/complete-import-receipt-fixture');
const RECEIPT = '__localItabRestoreReceiptV1';
const source = fs.readFileSync('shared/complete-backup-view.js', 'utf8');
const waitFor = async predicate => {
    const deadline = Date.now() + 3000;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1));
    assert(predicate(), 'production backup UI settled');
};
function mount(store, locale) {
    const document = createDocument({ blurUnavailableFocus: true }), host = document.createElement('div'); document.body.append(host);
    const catalog = locale && JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const window = { LocalItabCompleteBackup: Backup, ...(catalog ? { i18n: { t: key => catalog[key]?.message || key } } : {}) };
    vm.runInNewContext(source, { window, setTimeout, URL, Blob });
    const view = window.LocalItabCompleteBackupView.mount(host, { store, download: () => assert.fail('No automatic download'), reload: () => assert.fail('No automatic reload') });
    const get = suffix => host.querySelector('.complete-backup-' + suffix);
    const select = (text, read = async () => text) => { get('file').files = [{ size: text.length, text: read }]; get('file').dispatch('change'); };
    return { document, host, view, get, select, catalog };
}
const expectedText = (ui, kind) => ui.catalog?.['completeBackup' + (kind === 'pending' ? 'ConfigImportPending' : 'ConfigImportReceiptInvalid')]?.message;

for (const locale of ['en', 'zh_CN', null]) for (const kind of ['pending', 'edited', 'invalid', 'future']) test(`real preview shows actionable read-only refusal (${locale || 'fallback'}, ${kind})`, { timeout: 10000 }, async () => {
    const f = fixture(seed());
    await withGlobals(f, async () => {
        const b = await boot(f), named = await b.manager.create('Synthetic pending target'), session = b.manager.capture(named.id); await session.ready();
        const storage = storageFor(f, session), incoming = { ...storage.cloneDefaultConfig(), quote: 'Synthetic pending UI import' };
        await uncertainImport(f, storage, session, incoming);
        if (kind === 'edited') await session.local.set({ quote: 'Synthetic later UI edit' });
        if (kind === 'invalid') delete values(f, named.id)[RECEIPT].request;
        if (kind === 'future') values(f, named.id)[RECEIPT].version = 99;
        const archive = await b.store.export(['config']), ui = mount(b.store, locale), before = clone(f.raw), writes = f.writes.length;
        ui.select(archive); await waitFor(() => !ui.get('config-inspection').hidden);
        const expected = expectedText(ui, ['pending', 'edited'].includes(kind) ? 'pending' : 'invalid');
        if (expected) assert.equal(ui.get('status').textContent, expected);
        else assert.match(ui.get('status').textContent, /unverified configuration import|invalid or unsupported configuration-import receipt/);
        assert.equal(ui.get('apply').disabled, true); assert.equal(ui.get('preview').hidden, true); assert.equal(ui.get('reload').hidden, true);
        assert.equal(ui.get('config-inspection').href, `recovery.html?workspace=${named.id}`);
        assert.equal(ui.get('config-inspection').target, '_blank'); assert.equal(ui.get('config-inspection').rel, 'noopener');
        ui.get('apply').dispatch('click'); ui.get('apply').dispatch('click');
        assert.equal(f.writes.length, writes); assert.deepEqual(f.raw, before); assert.deepEqual(f.providers, []);
        ui.view.destroy();
    });
});

for (const locale of ['en', 'zh_CN']) test(`real UI stale approval cannot replace newly pending import (${locale})`, { timeout: 10000 }, async () => {
    const f = fixture(seed());
    await withGlobals(f, async () => {
        const b = await boot(f), ui = mount(b.store, locale), archive = await b.store.export(['config']);
        ui.select(archive); await waitFor(() => !ui.get('apply').disabled);
        await uncertainImport(f, b.storage, b.session, { ...b.storage.cloneDefaultConfig(), quote: 'Synthetic concurrent UI import' });
        const before = clone(f.raw), writes = f.writes.length;
        ui.get('apply').dispatch('click'); ui.get('apply').dispatch('click');
        await waitFor(() => !ui.get('config-inspection').hidden);
        assert.equal(ui.get('status').textContent, expectedText(ui, 'pending'));
        assert.equal(ui.get('config-inspection').href, 'recovery.html?workspace=default');
        assert.equal(ui.get('apply').disabled, true); assert.equal(ui.get('reload').hidden, true);
        assert.equal(f.writes.length, writes); assert.deepEqual(f.raw, before); assert.deepEqual(f.providers, []);
    });
});

test('real UI can deselect config after refusal; next personal-only review clears the link, and Cancel writes nothing', { timeout: 10000 }, async () => {
    const f = fixture(seed());
    await withGlobals(f, async () => {
        const b = await boot(f), ui = mount(b.store, 'en');
        await uncertainImport(f, b.storage, b.session, { ...b.storage.cloneDefaultConfig(), quote: 'Synthetic module selection import' });
        const archive = await b.store.export(Backup.SCOPED_MODULES), before = clone(f.raw), writes = f.writes.length;
        ui.select(archive); await waitFor(() => !ui.get('config-inspection').hidden);
        for (const input of ui.host.querySelectorAll('[data-module]')) input.checked = input.dataset.module === 'scratchpad';
        ui.host.querySelector('[data-module="config"]').dispatch('change');
        await waitFor(() => !ui.get('apply').disabled);
        assert.equal(ui.get('config-inspection').hidden, true);
        ui.get('cancel').dispatch('click'); assert.equal(ui.get('apply').disabled, true);
        assert.equal(f.writes.length, writes); assert.deepEqual(f.raw, before);
        ui.select(archive); await waitFor(() => !ui.get('config-inspection').hidden);
        assert.equal(f.writes.length, writes); assert.deepEqual(f.raw, before); assert.deepEqual(f.providers, []);
    });
});

test('a delayed earlier pending-file review cannot reattach a stale inspection link after cancellation', { timeout: 10000 }, async () => {
    const f = fixture(seed());
    await withGlobals(f, async () => {
        const b = await boot(f), ui = mount(b.store, 'en');
        await uncertainImport(f, b.storage, b.session, { ...b.storage.cloneDefaultConfig(), quote: 'Synthetic delayed UI import' });
        const archive = await b.store.export(['config']), before = clone(f.raw), writes = f.writes.length;
        let resolve; const read = new Promise(done => { resolve = done; });
        ui.select(archive, () => read); ui.get('cancel').dispatch('click'); resolve(archive);
        await new Promise(done => setTimeout(done, 20));
        assert.equal(ui.get('config-inspection').hidden, true); assert.equal(ui.get('apply').disabled, true);
        assert.equal(f.writes.length, writes); assert.deepEqual(f.raw, before); assert.deepEqual(f.providers, []);
    });
});
