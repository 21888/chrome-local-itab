'use strict';
// Real View + Settings restore controller + Store/StorageManager/workspaces.
// Synthetic DOM and RAM storage only; no native browser or provider access.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const {Backup, clone, fixture, withGlobals, seed, boot, values} = require('./helpers/complete-import-receipt-fixture');
const Scratchpad = require('../shared/local-scratchpad-store');
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
async function until(predicate) {
    const deadline = Date.now() + 3000;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1));
    assert(predicate(), 'expected production backup UI state');
}
function mount(b, failDownload = false) {
    const document = createDocument({blurUnavailableFocus: true}), host = document.createElement('div');
    host.id = 'complete-backup'; document.body.append(host);
    const calls = {reviews: [], restores: [], downloads: [], reloads: 0};
    const review = b.store.review.bind(b.store), restore = b.store.restore.bind(b.store);
    b.store.review = async (...args) => {
        const result = await review(...args); calls.reviews.push({args, result}); return result;
    };
    b.store.restore = (...args) => { calls.restores.push(args); return restore(...args); };
    const window = {LocalItabCompleteBackup: {...Backup, Store: class { constructor() { return b.store; } }},
        location: {reload() { calls.reloads++; }} };
    const ctx = {window, document, storageManager: b.storage, setTimeout, clearTimeout, URL, Blob, console};
    vm.createContext(ctx); vm.runInContext(fs.readFileSync('shared/complete-backup-view.js', 'utf8'), ctx);
    const originalMount = window.LocalItabCompleteBackupView.mount;
    window.LocalItabCompleteBackupView.mount = (element, options) => originalMount(element, {...options, download: (...args) => {
        calls.downloads.push(args); if (failDownload) throw Error('Synthetic download failure');
    }});
    vm.runInContext(fs.readFileSync('options.js', 'utf8'), ctx);
    vm.runInContext('settingsHasUncommittedWork=()=>false;worldClockHasUncommittedWork=()=>false;', ctx);
    ctx.setupCompleteBackup();
    const get = suffix => host.querySelector('.complete-backup-' + suffix);
    const input = module => host.querySelector('[data-module="' + module + '"]');
    const select = (text, file = {}) => {
        assert(!get('file').disabled); get('file').files = [{size: Buffer.byteLength(text), text: async () => text, ...file}];
        get('file').dispatch('change');
    };
    const target = (suffix, value) => {
        const el = get(suffix); assert(el.getClientRects().length && !el.disabled); el.value = value; el.dispatch('change');
    };
    const download = async () => { get('recovery').dispatch('click'); await until(() => !window.completeBackupView.pending); };
    const apply = async () => { assert(!get('apply').disabled); get('apply').dispatch('click'); await until(() => !window.completeBackupView.pending); };
    return {window, document, host, get, input, select, target, download, apply, calls, view: window.completeBackupView};
}
async function run(action, {recovery = true, failDownload = false} = {}) {
    const f = fixture({...seed(), [Scratchpad.KEY]: {...Scratchpad.initial(), content: 'Synthetic original note'}});
    await withGlobals(f, async () => {
        let b = await boot(f);
        if (recovery) {
            await b.store.restore(await b.store.review(await b.store.export(Backup.SCOPED_MODULES)), {confirmed: true});
            b = await boot(f); // The setup restore retires its old workspace session.
        }
        const ui = mount(b, failDownload);
        try { await action(f, b, ui); }
        finally { assert.deepEqual(f.providers, []); assert.equal(ui.calls.reloads, 0); ui.view.destroy(); }
    });
}
function legacy(b, f) {
    const data = b.store.snapshot(values(f), ['config', 'scratchpad']).file;
    data.modules.config.data.quote = 'Synthetic incoming configuration';
    data.modules.scratchpad.content = 'Synthetic incoming note';
    return JSON.stringify(data);
}
async function narrowedTarget(f, b, ui) {
    const text = legacy(b, f); ui.select(text);
    await until(() => !ui.get('destination').hidden && !ui.get('target').disabled);
    assert(!ui.input('config').disabled); ui.input('config').checked = false; ui.input('config').dispatch('change');
    await until(() => !ui.get('destination').hidden && !ui.get('target').disabled);
    assert.deepEqual(Array.from(ui.calls.reviews.at(-1).result.selected), ['scratchpad']);
    assert(ui.get('apply').disabled); return text;
}
function unchanged(f, before, writes) { assert.deepEqual(f.raw, before); assert.equal(f.writes.length, writes); }
function retained(ui, rows, reviews) {
    assert.equal(ui.get('preview').hidden, false, 'settled review remains visible');
    assert.equal(ui.view.hasUncommittedWork(), true, 'the selected source remains owned by this review');
    assert.equal(ui.calls.reviews.length, reviews, 'download must not issue a fresh review or approval baseline');
    assert.equal(ui.get('counts').children.length, rows.length);
    rows.forEach((row, index) => assert.equal(ui.get('counts').children[index], row));
}

for (const outcome of ['success', 'missing recovery', 'download failure']) {
    test(`ordinary recovery ${outcome} retains the narrowed schema1 review awaiting a workspace`, () => run(async (f, b, ui) => {
        const text = await narrowedTarget(f, b, ui), rows = [...ui.get('counts').children], options = [...ui.get('target').children];
        const before = clone(f.raw), writes = f.writes.length, reviews = ui.calls.reviews.length;
        ui.get('recovery').dispatch('click'); ui.get('recovery').dispatch('click'); ui.get('apply').dispatch('click');
        await until(() => !ui.view.pending);
        retained(ui, rows, reviews); assert(ui.get('apply').disabled); assert(!ui.get('target').disabled);
        assert.equal(ui.get('destination').hidden, false); assert.equal(ui.get('target').value, '');
        options.forEach((option, index) => assert.equal(ui.get('target').children[index], option));
        assert.equal(ui.input('config').checked, false); assert.equal(ui.input('scratchpad').checked, true);
        for (const module of Backup.MODULES) assert.equal(ui.input(module).disabled, !['config', 'scratchpad'].includes(module));
        assert.equal(ui.calls.restores.length, 0); unchanged(f, before, writes);
        assert.equal(ui.calls.downloads.length, outcome === 'missing recovery' ? 0 : 1);
        assert.match(ui.get('status').textContent, outcome === 'success' ? /Download requested/ : /No valid pre-restore recovery copy/);
        if (outcome !== 'success') return;
        assert.equal(ui.calls.downloads[0][0], await b.store.recovery());
        ui.target('target', 'default'); await until(() => !ui.get('apply').disabled);
        assert.equal(ui.calls.reviews.at(-1).args[0], text);
        assert.deepEqual(Array.from(ui.calls.reviews.at(-1).args[1]), ['scratchpad']);
        const ticket = ui.calls.reviews.at(-1).result, readyRows = [...ui.get('counts').children], readyReviews = ui.calls.reviews.length;
        await ui.download(); retained(ui, readyRows, readyReviews);
        assert.equal(ui.get('target').value, 'default'); assert(!ui.get('apply').disabled); unchanged(f, before, writes);
        await ui.apply(); assert.equal(ui.calls.restores.length, 1); assert.equal(ui.calls.restores[0][0], ticket);
        assert.equal(values(f).quote, 'Synthetic before-import configuration');
        assert.equal(values(f)[Scratchpad.KEY].content, 'Synthetic incoming note');
    }, {recovery: outcome !== 'missing recovery', failDownload: outcome === 'download failure'}));
}

test('ordinary recovery preserves unchosen and partially chosen global destinations', () => run(async (f, b, ui) => {
    ui.select(await b.store.export(['prompts', 'collections']));
    await until(() => !ui.get('collection-destination').hidden && !ui.get('collection-target').disabled);
    const before = clone(f.raw), writes = f.writes.length;
    for (const promptTarget of ['', 'global-library']) {
        if (promptTarget) { ui.target('prompt-target', promptTarget); await until(() => !ui.get('prompt-target').disabled); }
        const rows = [...ui.get('counts').children], reviews = ui.calls.reviews.length;
        await ui.download(); retained(ui, rows, reviews);
        assert.equal(ui.get('prompt-target').value, promptTarget); assert.equal(ui.get('collection-target').value, '');
        assert(!ui.get('prompt-destination').hidden); assert(!ui.get('collection-destination').hidden);
        assert(!ui.get('prompt-target').disabled); assert(!ui.get('collection-target').disabled);
        assert(ui.get('apply').disabled); ui.get('apply').dispatch('click');
        assert.equal(ui.calls.restores.length, 0); unchanged(f, before, writes);
    }
    ui.target('collection-target', 'global-collections'); await until(() => !ui.get('apply').disabled);
    assert.equal(ui.calls.reviews.at(-1).args[2].promptTarget, 'global-library');
    assert.equal(ui.calls.reviews.at(-1).args[2].collectionTarget, 'global-collections');
    assert.equal(ui.calls.restores.length, 0); unchanged(f, before, writes);
}));

test('ordinary recovery retains the real ready ticket and stale saved state still fails CAS', () => run(async (f, b, ui) => {
    await narrowedTarget(f, b, ui); ui.target('target', 'default'); await until(() => !ui.get('apply').disabled);
    const ticket = ui.calls.reviews.at(-1).result, rows = [...ui.get('counts').children], reviews = ui.calls.reviews.length;
    const wait = deferred(), recovery = b.store.recovery.bind(b.store); let entered = false;
    b.store.recovery = async () => { entered = true; await wait.promise; return recovery(); };
    ui.get('recovery').dispatch('click'); await until(() => entered);
    await b.session.local.set({[Scratchpad.KEY]: {...values(f)[Scratchpad.KEY], revision: values(f)[Scratchpad.KEY].revision + 1, content: 'Synthetic newer saved note'}});
    const before = clone(f.raw), writes = f.writes.length;
    wait.resolve(); await until(() => !ui.view.pending); retained(ui, rows, reviews);
    assert(b.store.tickets.has(ticket)); assert(!ui.get('apply').disabled); unchanged(f, before, writes);
    await ui.apply(); assert.equal(ui.calls.restores[0][0], ticket);
    assert.match(ui.get('status').textContent, /changed|replaced/i); assert(ui.get('reload').hidden);
    assert.equal(ui.calls.reviews.length, reviews); unchanged(f, before, writes);
}));

test('ordinary recovery leaves newer draft focus intact and Settings still blocks the explicit restore', () => run(async (f, b, ui) => {
    await narrowedTarget(f, b, ui); ui.target('target', 'default'); await until(() => !ui.get('apply').disabled);
    const wait = deferred(), recovery = b.store.recovery.bind(b.store); let entered = false;
    b.store.recovery = async () => { entered = true; await wait.promise; return recovery(); };
    ui.get('recovery').focus(); ui.get('recovery').dispatch('click'); await until(() => entered);
    const draft = ui.document.createElement('textarea'); draft.value = 'Synthetic unsaved draft'; ui.document.body.append(draft); draft.focus();
    ui.window.localScratchpadSettingsView = {draft, controller: {pending: false}, hasUncommittedWork: () => true};
    const before = clone(f.raw), writes = f.writes.length, reviews = ui.calls.reviews.length;
    wait.resolve(); await until(() => !ui.view.pending); assert.equal(ui.document.activeElement, draft); assert(!ui.get('apply').disabled);
    await ui.apply(); assert.match(ui.get('status').textContent, /draft|Finish/i);
    assert.equal(draft.value, 'Synthetic unsaved draft'); assert.equal(ui.calls.restores.length, 0);
    assert.equal(ui.calls.reviews.length, reviews); unchanged(f, before, writes);
}));

for (const transition of ['cancel', 'new file', 'destroy']) {
    test(`late ordinary recovery cannot revive the pending target after ${transition}`, () => run(async (f, b, ui) => {
        await narrowedTarget(f, b, ui);
        const wait = deferred(), recovery = b.store.recovery.bind(b.store); let entered = false;
        b.store.recovery = async () => { entered = true; await wait.promise; return recovery(); };
        ui.get('recovery').dispatch('click'); await until(() => entered);
        if (transition === 'destroy') assert.equal(ui.view.destroy(), true);
        else ui.get('cancel').dispatch('click');
        if (transition === 'new file') { ui.select(await b.store.export(['scratchpad'])); await until(() => !ui.get('apply').disabled); }
        const before = clone(f.raw), writes = f.writes.length, status = ui.get('status')?.textContent, focused = ui.document.activeElement;
        wait.resolve(); await tick();
        assert.equal(ui.calls.downloads.length, 0); assert.equal(ui.calls.restores.length, 0); unchanged(f, before, writes);
        assert.equal(ui.document.activeElement, focused);
        if (transition === 'destroy') { assert.equal(ui.host.children.length, 0); return; }
        assert.equal(ui.get('status').textContent, status);
        assert.equal(ui.get('preview').hidden, transition === 'cancel');
        assert.equal(ui.get('apply').disabled, transition === 'cancel');
        assert.equal(ui.get('destination').hidden, true);
        if (transition === 'new file') assert.deepEqual(Array.from(ui.calls.reviews.at(-1).result.selected), ['scratchpad']);
        else assert.equal(ui.view.hasUncommittedWork(), false);
    }));
}

test('ordinary Export still cancels a pending target and exports only its narrowed scope', () => run(async (f, b, ui) => {
    await narrowedTarget(f, b, ui); const before = clone(f.raw), writes = f.writes.length;
    ui.get('export').dispatch('click'); await until(() => !ui.view.pending);
    assert(ui.get('preview').hidden); assert(ui.get('apply').disabled); assert.equal(ui.view.hasUncommittedWork(), false);
    const data = Backup.parse(ui.calls.downloads[0][0], b.storage);
    assert.deepEqual(data.modules, ['scratchpad']); assert.equal(ui.calls.restores.length, 0); unchanged(f, before, writes);
}));

test('ordinary recovery still cancels an unconfirmed large file without reading it', () => run(async (f, b, ui) => {
    let reads = 0; const text = legacy(b, f), before = clone(f.raw), writes = f.writes.length;
    ui.select(text, {size: 11 * 1024 * 1024, text: async () => { reads++; return text; }});
    assert(!ui.get('large').hidden); await ui.download();
    ui.get('large').dispatch('click'); await tick();
    assert.equal(reads, 0); assert(ui.get('preview').hidden); assert(ui.get('apply').disabled);
    assert.equal(ui.view.hasUncommittedWork(), false); assert.equal(ui.calls.reviews.length, 0);
    assert.equal(ui.calls.restores.length, 0); unchanged(f, before, writes);
}));
