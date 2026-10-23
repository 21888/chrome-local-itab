'use strict';
// Cross-entry production Options + Backup View + Store journey. DOM, Chrome
// storage and locks are synthetic; this is not browser/install persistence QA.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const { Backup, Workspaces, clone, fixture, withGlobals, seed, boot, values, uncertainImport } = require('./helpers/complete-import-receipt-fixture');
const Scratchpad = require('../shared/local-scratchpad-store');
const Countdown = require('../shared/local-countdown-store');
const waitFor = async predicate => {
    const until = Date.now() + 3000;
    while (!predicate() && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 1));
    assert(predicate(), 'production UI settled');
};
function page(storage, locale) {
    const document = createDocument({ blurUnavailableFocus: true }); document.visibilityState = 'visible';
    const host = document.createElement('section'); host.id = 'complete-backup'; document.body.append(host);
    const catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const calls = [], window = { document, LocalItabCompleteBackup: Backup,
        i18n: { t: key => catalog[key]?.message || key },
        LocalItabContentLifecycle: { reload: () => calls.push('reload') },
        addEventListener() {}, removeEventListener() {} };
    const context = vm.createContext({ window, document, storageManager: storage, console, setTimeout, clearTimeout, URL, Blob,
        confirm: () => assert.fail('No additional confirmation is expected for exact pending-file verification') });
    vm.runInContext(fs.readFileSync('shared/complete-backup-view.js', 'utf8'), context);
    vm.runInContext(fs.readFileSync('options.js', 'utf8'), context);
    // There is no ordinary Settings editor in this isolated entry-flow model.
    // Keep the real completeBackupHasDrafts, queue and restore callbacks.
    vm.runInContext('settingsHasUncommittedWork = () => false; worldClockHasUncommittedWork = () => false;', context);
    context.setupCompleteBackup();
    const get = suffix => host.querySelector('.complete-backup-' + suffix);
    return { document, host, window, calls, get, context,
        select(text) { get('file').files = [{ size: Buffer.byteLength(text), text: async () => text }]; get('file').dispatch('change'); },
        async selectModules(ids) { for (const input of host.querySelectorAll('input[data-module]')) input.checked = ids.includes(input.dataset.module); host.querySelector('input[data-module="config"]').dispatch('change'); await waitFor(() => !get('apply').disabled); } };
}
for (const locale of ['en', 'zh_CN']) test(`pending import to selected complete restore crosses real Settings and backup UI (${locale})`, { timeout: 10000 }, async () => {
    const f = fixture(seed());
    await withGlobals(f, async () => {
        const b = await boot(f);
        const sourceNote = { ...Scratchpad.initial(), enabled: true, content: 'Synthetic source note\n来源便笺' };
        const sourceDate = { ...Countdown.initial(), enabled: true, title: 'Synthetic source date', targetDate: '2027-01-02' };
        await b.session.local.set({ [Scratchpad.KEY]: sourceNote, [Countdown.KEY]: sourceDate });
        const archive = await b.store.export(['config', 'scratchpad', 'countdown']);
        const keptNote = { ...sourceNote, revision: 1, content: 'Synthetic current note, retained in recovery' };
        const keptDate = { ...sourceDate, revision: 1, title: 'Synthetic unselected date', targetDate: '2027-03-04' };
        await b.session.local.set({ [Scratchpad.KEY]: keptNote, [Countdown.KEY]: keptDate });
        const imported = { ...b.storage.cloneDefaultConfig(), quote: 'Synthetic manual import to verify' };
        await uncertainImport(f, b.storage, b.session, imported);
        const ui = page(b.storage, locale), pendingRaw = clone(f.raw), writes = f.writes.length;
        ui.select(archive); await waitFor(() => !ui.get('config-inspection').hidden);
        assert(ui.get('apply').disabled); assert.deepEqual(f.raw, pendingRaw); assert.equal(f.writes.length, writes);
        // Use the actual Settings same-file save/verification entry, not a receipt edit.
        assert.equal(await ui.context.saveConfirmedRestore(b.storage, imported), true);
        assert.equal(values(f)[b.storage.restoreReceiptKey].status, 'verified');
        const settled = clone(f.raw), settledWrites = f.writes.length;
        const beforeModules = Backup.parse(await b.store.export(Backup.SCOPED_MODULES), b.storage).workspaces.find(item => item.id === 'default').modules;
        const receipt = clone(values(f)[b.storage.restoreReceiptKey]);
        const manualRecovery = clone(values(f)[b.storage.restoreRecoveryKey]);
        // Verification elsewhere cannot silently turn the old refused review into approval.
        assert(ui.get('apply').disabled); ui.get('apply').dispatch('click'); assert.deepEqual(f.raw, settled);
        ui.select(archive); await waitFor(() => !ui.get('apply').disabled);
        assert(ui.get('config-inspection').hidden);
        await ui.selectModules(['config', 'scratchpad']);
        ui.get('cancel').dispatch('click');
        assert.equal(f.writes.length, settledWrites); assert.deepEqual(f.raw, settled);
        assert.equal(ui.document.activeElement, ui.get('choose'));
        ui.select(archive); await waitFor(() => !ui.get('apply').disabled);
        await ui.selectModules(['config', 'scratchpad']);
        // A draft appearing after review must still be checked by the real
        // Options restore callback before it reaches the production Store.
        const draft = { text: 'Synthetic newer unsaved note' };
        ui.window.localScratchpadSettingsView = { draft, hasUncommittedWork: () => true };
        ui.get('apply').dispatch('click');
        await waitFor(() => ui.get('status').textContent === JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8')).completeBackupDirty.message);
        assert.deepEqual(f.raw, settled); assert.equal(f.writes.length, settledWrites);
        assert.equal(draft.text, 'Synthetic newer unsaved note'); assert(ui.get('reload').hidden);
        // The editor is finished explicitly; a new backup review is required.
        ui.window.localScratchpadSettingsView.hasUncommittedWork = () => false;
        assert(ui.get('apply').disabled);
        ui.select(archive); await waitFor(() => !ui.get('apply').disabled);
        await ui.selectModules(['config', 'scratchpad']);
        ui.get('apply').dispatch('click'); ui.get('apply').dispatch('click');
        await waitFor(() => !ui.get('reload').hidden);
        assert.equal(values(f).quote, 'Synthetic before-import configuration');
        assert.equal(f.raw[Workspaces.REGISTRY_KEY].revision, settled[Workspaces.REGISTRY_KEY].revision + 1);
        assert.equal(values(f)[Scratchpad.KEY].content, sourceNote.content);
        assert.deepEqual(values(f)[Countdown.KEY], keptDate);
        assert.deepEqual(ui.calls, []); assert.deepEqual(f.providers, []);
        const recovery = Backup.parse(await b.store.recovery(), b.storage);
        const saved = recovery.workspaces.find(item => item.id === 'default');
        assert.equal(saved.modules.config.data.quote, imported.quote);
        assert.equal(saved.modules.scratchpad.content, keptNote.content);
        assert.equal(saved.modules.countdown.title, keptDate.title);
        assert.deepEqual(saved.modules, beforeModules);
        const afterModules = Backup.parse(await b.store.export(Backup.SCOPED_MODULES), b.storage).workspaces.find(item => item.id === 'default').modules;
        const incomingModules = Backup.parse(archive, b.storage).workspaces.find(item => item.id === 'default').modules;
        for (const id of ['config', 'scratchpad']) assert.deepEqual(afterModules[id], incomingModules[id]);
        for (const id of ['tasks', 'countdown', 'focus']) assert.deepEqual(afterModules[id], beforeModules[id]);
        assert.deepEqual(values(f)[b.storage.restoreReceiptKey], receipt);
        assert.deepEqual(values(f)[b.storage.restoreRecoveryKey], manualRecovery);
        ui.get('reload').dispatch('click'); assert.deepEqual(ui.calls, ['reload']);
        ui.window.completeBackupView.destroy();
    });
});
