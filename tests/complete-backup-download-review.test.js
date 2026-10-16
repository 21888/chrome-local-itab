'use strict';
// Production backup view + Store/StorageManager/workspaces in synthetic DOM and
// RAM storage. Read-only recovery export never grants authority to an old ticket.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const {Backup, clone, fixture, withGlobals, seed, boot, uncertainImport} = require('./helpers/complete-import-receipt-fixture');
const source = fs.readFileSync('shared/complete-backup-view.js', 'utf8');
const waitFor = async predicate => {
    const deadline = Date.now() + 3000;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1));
    assert(predicate(), 'production backup UI settled');
};
function mount(store) {
    const document = createDocument({blurUnavailableFocus: true}), host = document.createElement('div'); document.body.append(host);
    const window = {LocalItabCompleteBackup: Backup};
    vm.runInNewContext(source, {window, setTimeout, URL, Blob});
    const downloads = [];
    const view = window.LocalItabCompleteBackupView.mount(host, {store, download: (...args) => downloads.push(args), reload: () => assert.fail('No automatic reload')});
    const get = suffix => host.querySelector('.complete-backup-' + suffix);
    const select = text => { get('file').files = [{size: text.length, text: async () => text}]; get('file').dispatch('change'); };
    return {view, get, select, downloads};
}

for (const change of ['saved configuration', 'unverified import']) test(`a recovery download cannot authorize a stale real ticket after ${change}`, {timeout: 10000}, async () => {
    const f = fixture(seed());
    await withGlobals(f, async () => {
        const b = await boot(f), archive = await b.store.export(['config']);
        const wait = deferred(), original = b.store.exportInterruptedCandidates.bind(b.store);
        // Delay only the read-only export call, then use the real recovery reader.
        b.store.exportInterruptedCandidates = async () => { await wait.promise; return original(); };
        const ui = mount(b.store); ui.select(archive); await waitFor(() => !ui.get('apply').disabled);
        const reviews = b.store.review.bind(b.store); let rereviews = 0;
        b.store.review = (...args) => { rereviews++; return reviews(...args); };
        ui.get('download-interrupted').dispatch('click');
        if (change === 'saved configuration') await b.session.local.set({quote: 'Synthetic newer saved quote'});
        else await uncertainImport(f, b.storage, b.session, {...b.storage.cloneDefaultConfig(), quote: 'Synthetic unverified newer import'});
        const before = clone(f.raw), writes = f.writes.length;
        wait.resolve(); await waitFor(() => !ui.get('download-interrupted').disabled);
        assert.equal(ui.get('apply').disabled, false, 'the existing ticket remains available for an explicit attempt');
        assert.equal(rereviews, 0, 'downloading cannot silently create a fresh approval baseline');
        assert.equal(ui.downloads.length, 0, 'no interrupted recovery is available in this fixture');
        assert.equal(f.writes.length, writes); assert.deepEqual(f.raw, before);
        ui.get('apply').dispatch('click'); ui.get('apply').dispatch('click');
        await waitFor(() => ui.get('preview').hidden && !ui.view.pending);
        assert.match(ui.get('status').textContent, change === 'saved configuration' ? /changed|replaced/i : /unverified configuration import/);
        assert.equal(ui.get('apply').disabled, true); assert.equal(ui.get('reload').hidden, true);
        assert.equal(f.writes.length, writes); assert.deepEqual(f.raw, before); assert.deepEqual(f.providers, []);
        ui.view.destroy();
    });
});
