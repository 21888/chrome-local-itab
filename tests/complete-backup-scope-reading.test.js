'use strict';
// Production view + Settings restore controller + Store/StorageManager, with
// synthetic DOM/File events and RAM-only data. This is not native Chrome QA.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const {Backup, clone, fixture, withGlobals, seed, boot, values, uncertainImport} = require('./helpers/complete-import-receipt-fixture');
const Scratchpad = require('../shared/local-scratchpad-store');
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
async function until(predicate) {
    const deadline = Date.now() + 3000;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1));
    assert(predicate(), 'expected production view/controller/store state');
}
function mount(b) {
    const document = createDocument({blurUnavailableFocus: true}), host = document.createElement('div');
    host.id = 'complete-backup'; document.body.append(host);
    const calls = {reviews: [], restores: [], exports: [], downloads: [], reloads: 0};
    for (const [method, key] of [['review', 'reviews'], ['restore', 'restores'], ['export', 'exports']]) {
        const original = b.store[method].bind(b.store);
        b.store[method] = (...args) => { calls[key].push(args); return original(...args); };
    }
    const window = {LocalItabCompleteBackup: {...Backup, Store: class { constructor() { return b.store; } }},
        location: {reload() { calls.reloads++; }} };
    const ctx = {window, document, storageManager: b.storage, setTimeout, clearTimeout, URL, Blob, console};
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync('shared/complete-backup-view.js', 'utf8'), ctx);
    const mountView = window.LocalItabCompleteBackupView.mount;
    window.LocalItabCompleteBackupView.mount = (element, options) => mountView(element, {...options, download: (...args) => calls.downloads.push(args)});
    vm.runInContext(fs.readFileSync('options.js', 'utf8'), ctx);
    vm.runInContext('settingsHasUncommittedWork=()=>false;worldClockHasUncommittedWork=()=>false;', ctx);
    ctx.setupCompleteBackup();
    const get = suffix => host.querySelector('.complete-backup-' + suffix);
    const input = module => host.querySelector('[data-module="' + module + '"]');
    const select = (text, options = {}) => {
        assert(!get('file').disabled); get('file').files = [{size: Buffer.byteLength(text), text: async () => text, ...options}]; get('file').dispatch('change');
    };
    // Model the native activation default only for reachable, enabled controls.
    // In particular, never assign checked or dispatch change on a disabled input.
    const toggle = (module, method = 'pointer') => {
        const el = input(module);
        if (!el.isConnected || !el.getClientRects().length || el.disabled) return false;
        el.focus();
        if (method === 'pointer') el.dispatch('pointerdown');
        else {
            if (document.activeElement !== el) return false;
            const event = document.activeElement.dispatch('keydown', {key: ' '});
            if (event.prevented) return false;
            document.activeElement.dispatch('keyup', {key: ' '});
        }
        if (el.dispatch('click').prevented) return false;
        el.checked = !el.checked; el.dispatch('input'); el.dispatch('change'); return true;
    };
    const destination = (kind, value) => { const el = get(kind); assert(el.getClientRects().length && !el.disabled); el.value = value; el.dispatch('change'); };
    const apply = async () => { assert(!get('apply').disabled); get('apply').dispatch('click'); await until(() => !window.completeBackupView.pending); };
    return {ctx, window, document, host, get, input, toggle, select, destination, apply, calls, view: window.completeBackupView};
}
async function run(action) {
    const initial = seed(); initial[Scratchpad.KEY] = {...Scratchpad.initial(), content: 'Synthetic original note'};
    const f = fixture(initial);
    return withGlobals(f, async () => {
        const b = await boot(f), ui = mount(b);
        try { await action(f, b, ui); }
        finally { assert.deepEqual(f.providers, [], 'no provider, identity, permission or network access'); assert.equal(ui.calls.reloads, 0); ui.view.destroy(); }
    });
}
async function archive(b, modules = ['config', 'scratchpad'], suffix = 'A') {
    const data = JSON.parse(await b.store.export(modules));
    for (const space of data.workspaces) {
        if (space.modules.config) space.modules.config.data.quote = 'Synthetic incoming quote ' + suffix;
        if (space.modules.scratchpad) space.modules.scratchpad.content = 'Synthetic incoming note ' + suffix;
    }
    return JSON.stringify(data);
}
function unchanged(f, before, writes) { assert.deepEqual(f.raw, before); assert.equal(f.writes.length, writes); }
function locked(ui) { for (const module of Backup.MODULES) assert.equal(ui.input(module).disabled, true, module + ' waits for the first available-module list'); }
function available(ui, modules) { for (const module of Backup.MODULES) assert.equal(ui.input(module).disabled, !modules.includes(module), module + ' follows the current file'); }
async function pending(ui, b, text, stage) {
    const wait = deferred(); let reads = 0;
    if (stage === 'first review') {
        const review = b.store.review.bind(b.store); let entered = false;
        b.store.review = async (...args) => { const result = await review(...args); if (args[1] === undefined) { entered = true; await wait.promise; } return result; };
        ui.select(text); await until(() => entered);
    } else {
        ui.select(text, {size: stage === 'large prompt' ? 11 * 1024 * 1024 : Buffer.byteLength(text), text: () => { reads++; return wait.promise; }});
    }
    return {wait, reads: () => reads, finish() { if (stage === 'large prompt') ui.get('large').dispatch('click'); wait.resolve(text); }};
}

for (const stage of ['file text', 'first review', 'large prompt']) for (const method of ['pointer', 'Space']) {
    test(`${stage} blocks ${method} scope activation until the available modules are known`, () => run(async (f, b, ui) => {
        const text = await archive(b), before = clone(f.raw), writes = f.writes.length;
        const p = await pending(ui, b, text, stage);
        assert.equal(ui.toggle('config', method), false, 'an unavailable scope must not accept a user edit');
        assert.equal(ui.input('config').checked, true); locked(ui);
        assert.equal(ui.get('apply').disabled, true); assert.equal(ui.get('choose').disabled, false); assert.equal(ui.get('cancel').disabled, false);
        assert.equal(ui.get('export').disabled, false); assert.equal(ui.get('recovery').disabled, false);
        if (stage === 'large prompt') assert.equal(p.reads(), 0);
        p.finish(); await until(() => !ui.get('apply').disabled); available(ui, ['config', 'scratchpad']);
        assert.equal(ui.calls.reviews.length, 1); assert.equal(ui.calls.restores.length, 0); unchanged(f, before, writes);
        assert.equal(ui.toggle('config', method), true); await until(() => !ui.get('apply').disabled);
        assert.deepEqual(Array.from(ui.calls.reviews.at(-1)[1]), ['scratchpad']);
        await ui.apply();
        assert.equal(values(f).quote, 'Synthetic before-import configuration');
        assert.equal(values(f)[Scratchpad.KEY].content, 'Synthetic incoming note A');
        assert.deepEqual(Array.from(ui.calls.restores[0][0].selected), ['scratchpad']);
        const recovery = Backup.parse(await b.store.recovery(), b.storage);
        assert.equal(recovery.workspaces[0].modules.config.data.quote, 'Synthetic before-import configuration');
        assert.equal(recovery.workspaces[0].modules.scratchpad.content, 'Synthetic original note');
    }));
}

for (const stage of ['file text', 'first review', 'large prompt']) test(`ordinary Export cancels ${stage} and preserves the visible export selection`, () => run(async (f, b, ui) => {
    const text = await archive(b);
    for (const module of Backup.MODULES) if (module !== 'scratchpad') assert(ui.toggle(module));
    const before = clone(f.raw), writes = f.writes.length, exports = ui.calls.exports.length;
    const p = await pending(ui, b, text, stage); locked(ui);
    ui.get('export').dispatch('click'); await until(() => ui.calls.downloads.length === 1 && !ui.view.pending);
    assert.equal(ui.calls.exports.length, exports + 1); assert.deepEqual(Array.from(ui.calls.exports.at(-1)[0]), ['scratchpad']);
    const exported = Backup.parse(ui.calls.downloads[0][0], b.storage);
    assert.deepEqual(Object.keys(exported.workspaces[0].modules), ['scratchpad']);
    assert(ui.get('preview').hidden); available(ui, Backup.MODULES);
    p.finish(); await tick(); assert(ui.get('preview').hidden); assert(ui.get('apply').disabled);
    assert.equal(ui.calls.restores.length, 0); if (stage === 'large prompt') assert.equal(p.reads(), 0); unchanged(f, before, writes);
}));

for (const stage of ['file text', 'first review']) for (const action of ['Cancel', 'Escape', 'new file', 'destroy']) {
    test(`late ${stage} cannot unlock or revive controls after ${action}`, () => run(async (f, b, ui) => {
        const old = await archive(b), next = await archive(b, ['scratchpad'], 'NEW'), before = clone(f.raw), writes = f.writes.length;
        const p = await pending(ui, b, old, stage), inputs = Backup.MODULES.map(ui.input);
        if (action === 'Cancel') ui.get('cancel').dispatch('click');
        else if (action === 'Escape') ui.get('choose').dispatch('keydown', {key: 'Escape'});
        else if (action === 'destroy') assert.equal(ui.view.destroy(), true);
        const nextRead = deferred();
        if (action === 'new file') ui.select(next, {text: () => nextRead.promise});
        p.finish(); await tick();
        if (action === 'new file') { locked(ui); assert(ui.get('apply').disabled); nextRead.resolve(next); await until(() => !ui.get('apply').disabled); available(ui, ['scratchpad']); }
        else if (action === 'destroy') { for (const input of inputs) assert.equal(input.isConnected, false); }
        else { available(ui, Backup.MODULES); assert(ui.get('preview').hidden); assert(ui.get('apply').disabled); assert.equal(ui.view.hasUncommittedWork(), false); }
        assert.equal(ui.calls.restores.length, 0); unchanged(f, before, writes);
    }));
}

for (const failure of ['file read', 'initial review', 'oversize']) test(`${failure} releases initial scope controls without retaining an apply ticket`, () => run(async (f, b, ui) => {
    const text = await archive(b), before = clone(f.raw), writes = f.writes.length;
    if (failure === 'initial review') b.store.review = async (...args) => { ui.calls.reviews.push(args); throw {code: 'INVALID'}; };
    ui.select(text, failure === 'file read' ? {text: async () => { throw Error('Synthetic read failure'); }} : failure === 'oversize' ? {size: 33 * 1024 * 1024} : {});
    await until(() => ui.get('preview').hidden && /Could not read|not a supported|size limit/.test(ui.get('status').textContent));
    available(ui, Backup.MODULES); assert(ui.get('apply').disabled); unchanged(f, before, writes);
    assert.equal(ui.view.hasUncommittedWork(), failure === 'initial review', 'a read source retains the existing explicit retry path');
    const reviews = ui.calls.reviews.length; assert(ui.toggle('config')); await tick();
    assert.equal(ui.calls.reviews.length, reviews + Number(failure === 'initial review'), 'only a read source can be explicitly retried; no ticket is invented');
    assert(ui.get('apply').disabled);
    ui.get('export').dispatch('click'); await until(() => ui.calls.downloads.length === 1 && !ui.view.pending);
    assert.deepEqual(Array.from(ui.calls.exports.at(-1)[0]), Backup.MODULES.filter(module => module !== 'config')); unchanged(f, before, writes);
}));

test('known modules stay editable during rereview, absent modules stay disabled, and latest scope wins', () => run(async (f, b, ui) => {
    ui.select(await archive(b)); await until(() => !ui.get('apply').disabled);
    const review = b.store.review.bind(b.store), wait = deferred(); let entered = false;
    b.store.review = async (...args) => { const result = await review(...args); if (args[1]?.length === 1 && args[1][0] === 'scratchpad') { entered = true; await wait.promise; } return result; };
    assert(ui.toggle('config')); await until(() => entered); available(ui, ['config', 'scratchpad']);
    assert.equal(ui.toggle('tasks'), false); assert.equal(ui.toggle('prompts', 'Space'), false);
    assert(ui.toggle('config', 'Space')); assert(ui.toggle('scratchpad')); await until(() => !ui.get('apply').disabled);
    wait.resolve(); await tick(); available(ui, ['config', 'scratchpad']);
    assert.equal(ui.input('config').checked, true); assert.equal(ui.input('scratchpad').checked, false);
    await ui.apply(); assert.deepEqual(Array.from(ui.calls.restores[0][0].selected), ['config']);
    assert.equal(values(f).quote, 'Synthetic incoming quote A'); assert.equal(values(f)[Scratchpad.KEY].content, 'Synthetic original note');
}));

test('deselecting everything makes no invalid review and retains only available modules for reselection', () => run(async (f, b, ui) => {
    ui.select(await archive(b)); await until(() => !ui.get('apply').disabled); const reviews = ui.calls.reviews.length;
    assert(ui.toggle('config')); assert(ui.toggle('scratchpad', 'Space')); await tick();
    assert(ui.get('apply').disabled); assert.match(ui.get('status').textContent, /Select at least one/);
    assert.equal(ui.calls.reviews.length, reviews); available(ui, ['config', 'scratchpad']);
    assert(ui.toggle('scratchpad')); await until(() => !ui.get('apply').disabled);
    assert.deepEqual(Array.from(ui.calls.reviews.at(-1)[1]), ['scratchpad']); assert.equal(ui.calls.restores.length, 0);
}));

test('large authorization remains one read and does not carry across Cancel or a new file', () => run(async (f, b, ui) => {
    const text = await archive(b); let reads = 0;
    const file = {size: 11 * 1024 * 1024, text: async () => { reads++; return text; }};
    ui.select(text, file); locked(ui); ui.get('cancel').dispatch('click'); available(ui, Backup.MODULES);
    ui.get('large').dispatch('click'); assert.equal(reads, 0);
    ui.select(text, file); locked(ui); ui.get('large').dispatch('click'); ui.get('large').dispatch('click');
    await until(() => !ui.get('apply').disabled); assert.equal(reads, 1);
    ui.select(text, file); locked(ui); await tick(); assert.equal(reads, 1); assert.equal(ui.calls.restores.length, 0);
}));

test('legacy destination remains explicit and resets when another file begins', () => run(async (f, b, ui) => {
    const text = b.store.snapshot(values(f), ['scratchpad']).source;
    ui.select(text); await until(() => !ui.get('destination').hidden); available(ui, ['scratchpad']); assert(ui.get('apply').disabled);
    ui.destination('target', 'default'); await until(() => !ui.get('apply').disabled);
    const wait = deferred(); ui.select(text, {text: () => wait.promise}); locked(ui); wait.resolve(text);
    await until(() => !ui.get('destination').hidden); assert.equal(ui.get('target').value, ''); assert(ui.get('apply').disabled); assert.equal(ui.calls.restores.length, 0);
}));

test('both global destinations remain explicit after the first module list unlocks', () => run(async (f, b, ui) => {
    const text = await archive(b, ['prompts', 'collections']); ui.select(text);
    await until(() => !ui.get('prompt-destination').hidden); available(ui, ['prompts', 'collections']); assert(ui.get('apply').disabled);
    ui.destination('prompt-target', 'global-library'); await until(() => !ui.get('prompt-target').disabled); assert(ui.get('apply').disabled);
    ui.destination('collection-target', 'global-collections'); await until(() => !ui.get('apply').disabled);
    ui.get('cancel').dispatch('click'); ui.select(text); await until(() => !ui.get('prompt-destination').hidden);
    assert.equal(ui.get('prompt-target').value, ''); assert.equal(ui.get('collection-target').value, ''); assert(ui.get('apply').disabled); assert.equal(ui.calls.restores.length, 0);
}));

for (const download of ['recovery', 'download-interrupted']) test(`${download} retains a settled scope without silently rereviewing`, () => run(async (f, b, ui) => {
    // Establish a real pre-restore recovery snapshot, entirely in RAM.
    await b.store.restore(await b.store.review(await archive(b), ['scratchpad']), {confirmed: true});
    ui.select(await archive(b)); await until(() => !ui.get('apply').disabled); assert(ui.toggle('config')); await until(() => !ui.get('apply').disabled);
    const reviews = ui.calls.reviews.length, restores = ui.calls.restores.length, before = clone(f.raw), writes = f.writes.length;
    ui.get(download).dispatch('click'); await until(() => !ui.view.pending);
    assert.equal(ui.get('apply').disabled, false); assert.equal(ui.input('config').checked, false); available(ui, ['config', 'scratchpad']);
    assert.equal(ui.calls.reviews.length, reviews); assert.equal(ui.calls.restores.length, restores); unchanged(f, before, writes);
}));

test('recovery download cancels an initial read without leaving selection disabled', () => run(async (f, b, ui) => {
    const text = await archive(b), p = await pending(ui, b, text, 'file text'); locked(ui);
    ui.get('recovery').dispatch('click'); await until(() => !ui.view.pending); available(ui, Backup.MODULES);
    p.finish(); await tick(); assert(ui.get('preview').hidden); assert(ui.get('apply').disabled); assert.equal(ui.calls.restores.length, 0);
}));

test('DIRTY refusal after an unlocked scope preserves drafts, storage and the recovery snapshot', () => run(async (f, b, ui) => {
    ui.select(await archive(b)); await until(() => !ui.get('apply').disabled); assert(ui.toggle('config')); await until(() => !ui.get('apply').disabled);
    const draft = {value: 'Synthetic unsaved draft'};
    ui.window.localScratchpadSettingsView = {controller: {pending: false}, hasUncommittedWork: () => true, draft};
    const before = clone(f.raw), writes = f.writes.length;
    await ui.apply(); assert.match(ui.get('status').textContent, /draft|Finish/i); unchanged(f, before, writes);
    assert.equal(draft.value, 'Synthetic unsaved draft'); assert.equal(ui.calls.restores.length, 0); assert(ui.get('apply').disabled); available(ui, Backup.MODULES);
}));


test('configuration-import refusal retains the protected scope retry without accepting edits during that retry', () => run(async (f, b, ui) => {
    const text = await archive(b, Backup.MODULES);
    await uncertainImport(f, b.storage, b.session, {...b.storage.cloneDefaultConfig(), quote: 'Synthetic unverified configuration'});
    const before = clone(f.raw), writes = f.writes.length;
    ui.select(text); await until(() => !ui.get('config-inspection').hidden);
    assert(ui.get('apply').disabled); assert(ui.toggle('config'));
    locked(ui); assert.equal(ui.toggle('scratchpad', 'Space'), false);
    await until(() => !ui.get('prompt-destination').hidden && !ui.get('prompt-target').disabled);
    available(ui, Backup.MODULES); assert(ui.get('config-inspection').hidden);
    for (const module of ['tasks', 'countdown', 'focus', 'prompts', 'collections']) assert(ui.toggle(module));
    await until(() => !ui.get('apply').disabled);
    assert.deepEqual(Array.from(ui.calls.reviews.at(-1)[1]), ['scratchpad']);
    ui.get('cancel').dispatch('click'); unchanged(f, before, writes); assert.equal(ui.calls.restores.length, 0);
}));

test('ordinary export captures known selected modules once and keeps all mutating controls locked while busy', () => run(async (f, b, ui) => {
    ui.select(await archive(b)); await until(() => !ui.get('apply').disabled);
    assert(ui.toggle('config')); await until(() => !ui.get('apply').disabled);
    const exporting = b.store.export.bind(b.store), wait = deferred(); let entered = 0;
    b.store.export = async (...args) => { entered++; await wait.promise; return exporting(...args); };
    const before = clone(f.raw), writes = f.writes.length;
    ui.get('export').dispatch('click'); ui.get('export').dispatch('click'); await until(() => entered === 1);
    locked(ui); assert.equal(ui.toggle('scratchpad'), false); assert.equal(ui.toggle('config', 'Space'), false);
    assert(ui.get('apply').disabled); assert(ui.get('export').disabled); assert(ui.get('file').disabled);
    ui.get('apply').dispatch('click'); assert.equal(ui.calls.restores.length, 0);
    wait.resolve(); await until(() => !ui.view.pending && ui.calls.downloads.length === 1);
    assert.equal(entered, 1); assert.deepEqual(Array.from(ui.calls.exports.at(-1)[0]), ['scratchpad']);
    available(ui, Backup.MODULES); unchanged(f, before, writes);
}));


test('a transient initial review failure retains the existing explicit smaller-scope retry', () => run(async (f, b, ui) => {
    const text = await archive(b, Backup.MODULES), review = b.store.review.bind(b.store); let rejectFirst = true;
    b.store.review = (...args) => { if (rejectFirst) { rejectFirst = false; ui.calls.reviews.push(args); throw {code: 'READ'}; } return review(...args); };
    const before = clone(f.raw), writes = f.writes.length;
    ui.select(text); await until(() => /could not be read safely/.test(ui.get('status').textContent));
    available(ui, Backup.MODULES); assert(ui.get('apply').disabled); assert(ui.view.hasUncommittedWork());
    assert(ui.toggle('config')); locked(ui);
    await until(() => !ui.get('prompt-destination').hidden && !ui.get('prompt-target').disabled);
    available(ui, Backup.MODULES); assert.equal(ui.input('config').checked, false); assert(ui.get('apply').disabled);
    assert.deepEqual(Array.from(ui.calls.reviews.at(-1)[1]), Backup.MODULES.filter(module => module !== 'config'));
    assert.equal(ui.calls.restores.length, 0); unchanged(f, before, writes);
}));
