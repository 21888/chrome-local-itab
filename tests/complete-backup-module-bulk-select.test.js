'use strict';
// Production view with synthetic DOM events; this is not native Chrome QA.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const {createDocument} = require('./helpers/task-dom-model');

test('module fieldset offers native Select all available and Clear selection buttons', () => {
    const document = createDocument(), host = document.createElement('div'); document.body.append(host);
    const window = {};
    vm.runInNewContext(fs.readFileSync('shared/complete-backup-view.js', 'utf8'), {window, document, setTimeout, clearTimeout});
    const view = window.LocalItabCompleteBackupView.mount(host, {store: {}});
    try {
        const choices = host.querySelector('.complete-backup-modules');
        const selectAll = choices.querySelector('.complete-backup-select-all');
        assert(selectAll, 'the module fieldset needs Select all available modules');
        const clear = choices.querySelector('.complete-backup-clear-selection');
        assert(clear, 'the module fieldset needs Clear selection');
        assert.equal(selectAll.type, 'button'); assert.equal(clear.type, 'button');
        assert.equal(selectAll.textContent, 'Select all available modules'); assert.equal(clear.textContent, 'Clear selection');
    } finally { view.destroy(); }
});

const {deferred} = require('./helpers/task-dom-model');
const {Backup, clone, fixture, withGlobals, seed, boot} = require('./helpers/complete-import-receipt-fixture');
const {fixture: exportFixture, Prompts, Collections} = require('./helpers/complete-backup-acceptance');
const MODULES = [...Backup.MODULES], SCOPED = [...Backup.SCOPED_MODULES];
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
async function until(predicate) {
    const deadline = Date.now() + 3000;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1));
    assert(predicate(), 'expected production backup view state');
}
function result(modules = SCOPED, selected = modules, options = {}) {
    return {schemaVersion: modules.includes('collections') ? 4 : modules.includes('prompts') ? 3 : 2,
        modules: [...modules], selected: [...selected], incoming: {}, current: {},
        workspaces: {scope: SCOPED.every(id => selected.includes(id)) ? 'all' : selected.some(id => SCOPED.includes(id)) ? 'matching' : 'global-only',
            current: [{id: 'default', name: 'Synthetic before'}], currentTrash: [], currentTrashCount: 0,
            incoming: [{id: 'default', name: 'Synthetic after'}], incomingTrash: [], incomingTrashCount: 0},
        ...(modules.includes('prompts') ? {prompts: {conflicts: []}, requiresPromptTarget: selected.includes('prompts') && options.promptTarget !== 'global-library'} : {}),
        ...(modules.includes('collections') ? {collections: {conflicts: []}, requiresCollectionTarget: selected.includes('collections') && options.collectionTarget !== 'global-collections'} : {})};
}
function mount(t, {modules = SCOPED, store: supplied, locale} = {}) {
    const document = createDocument({blurUnavailableFocus: true, aggregateTextContent: true});
    const host = document.createElement('div'); document.body.append(host);
    const catalog = locale ? JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`)) : null;
    const window = {LocalItabCompleteBackup: Backup, LocalItabPrompts:Prompts, LocalItabAICollections:Collections, i18n: {t: key => catalog?.[key]?.message || key}};
    vm.runInNewContext(fs.readFileSync('shared/complete-backup-view.js', 'utf8'), {window, setTimeout, clearTimeout, URL, Blob});
    const exportStore = exportFixture().store;
    const backend = supplied || {async review(text, selection = modules, options) { return result(modules, selection, options); },
        async export(ids) { return exportStore.export(ids); }, async restore() {}, async recovery() { return 'SYNTHETIC RECOVERY'; }};
    const calls = {reviews: [], results: [], exports: [], restores: [], recoveries: [], downloads: []}, store = {manager:backend.manager || exportStore.manager, counts:(backend.counts || exportStore.counts).bind(backend.counts ? backend : exportStore), workspaceCounts:(backend.workspaceCounts || exportStore.workspaceCounts).bind(backend.workspaceCounts ? backend : exportStore)};
    for (const [method, key] of [['review', 'reviews'], ['export', 'exports'], ['restore', 'restores'], ['recovery', 'recoveries']]) {
        if (typeof backend[method] === 'function') store[method] = async (...args) => {
            calls[key].push(args); const value = await backend[method](...args);
            if (method === 'review') calls.results.push(value); return value;
        };
    }
    const view = window.LocalItabCompleteBackupView.mount(host, {store, download: async (...args) => calls.downloads.push(args), reload: () => assert.fail('no automatic reload')});
    t.after(() => view.destroy());
    const get = name => host.querySelector('.complete-backup-' + name);
    const input = id => host.querySelector(`[data-module="${id}"]`);
    const click = name => {
        const el = get(name); if (!el?.isConnected || !el.getClientRects().length || el.disabled) return false;
        el.focus(); el.dispatch('click'); return true;
    };
    const toggle = id => { const el = input(id); assert(el.isConnected && !el.disabled); el.focus(); el.checked = !el.checked; el.dispatch('change'); };
    const select = (text = 'SYNTHETIC FILE', options = {}) => {
        assert(!get('file').disabled); get('choose').focus(); get('file').files = [{size: Buffer.byteLength(text), text: async () => text, ...options}]; get('file').dispatch('change');
    };
    const destination = (name, value) => { const el = get(name); assert(!el.disabled && el.getClientRects().length); el.focus(); el.value = value; el.dispatch('change'); };
    const checked = () => MODULES.filter(id => input(id).checked);
    return {document, host, backend, store, view, calls, get, input, click, toggle, select, destination, checked};
}
function bulkEnabled(m, enabled) {
    for (const name of ['select-all', 'clear-selection']) assert.equal(m.get(name).disabled, !enabled, name);
}
function available(m, modules) {
    for (const id of MODULES) assert.equal(m.input(id).disabled, !modules.includes(id), id);
}
function cleared(m) {
    assert(m.get('apply').disabled); assert(m.get('workspace-impact').hidden); assert.equal(m.get('workspace-impact').open, false);
    assert.equal(m.get('workspace-impact-content').children.length, 0); assert.equal(m.get('counts').children.length, 0);
}
async function settled(m) { await until(() => m.host.querySelector('.complete-backup').getAttribute('aria-busy') === 'false'); }
async function ready(m, text) { m.select(text); await until(() => !m.get('apply').disabled); }
function noWriteActions(m) { assert.equal(m.calls.restores.length, 0); assert.equal(m.calls.exports.length, 0); assert.equal(m.calls.downloads.length, 0); assert.equal(m.calls.recoveries.length, 0); }
async function ram(t, action) {
    const f = fixture(seed());
    await withGlobals(f, async () => {
        const b = await boot(f);
        try { await action(f, b); }
        finally { assert.deepEqual(f.providers, [], 'no provider, identity, permission or network calls'); }
    });
}

for (const [locale, all, clear] of [['en', 'Select all available modules', 'Clear selection'], ['zh_CN', '全选可用模块', '全部取消']]) {
    test(`bulk buttons have localized native labels (${locale})`, t => {
        const m = mount(t, {locale}), choices = m.get('modules');
        for (const [name, label] of [['select-all', all], ['clear-selection', clear]]) {
            const el = m.get(name); assert(choices.contains(el)); assert.equal(el.tagName, 'BUTTON'); assert.equal(el.type, 'button');
            assert.equal(el.textContent, label); assert(el.classList.contains('btn-secondary')); assert.equal(el.tabIndex, 0);
            assert.equal(el.getAttribute('role'), undefined); assert.equal(el.getAttribute('aria-pressed'), undefined);
        }
    });
}

test('without a file, bulk controls only change seven checks and empty Export retains None protection', async t => {
    const m = mount(t); const feedback = m.get('status').textContent; bulkEnabled(m, true);
    assert(m.click('select-all')); assert.deepEqual(m.checked(), MODULES); assert.equal(m.document.activeElement, m.get('select-all'));
    assert(m.click('clear-selection')); assert.deepEqual(m.checked(), []); assert.equal(m.get('status').textContent, feedback);
    assert(m.click('clear-selection')); assert.equal(m.document.activeElement, m.get('clear-selection'));
    assert(m.click('export')); assert.match(m.get('status').textContent, /Select at least one/);
    const none = m.get('status').textContent;
    assert(m.click('select-all')); assert.deepEqual(m.checked(), MODULES); assert.equal(m.get('status').textContent, none);
    assert(m.click('clear-selection')); m.toggle('scratchpad'); assert.deepEqual(m.checked(), ['scratchpad']);
    await tick(); assert.equal(m.calls.reviews.length, 0); noWriteActions(m); assert.equal(m.view.hasUncommittedWork(), false);
});

test('real partial file bulk selection retains available modules and creates one fresh single/all-available review', t => ram(t, async (f, b) => {
    const text = await b.store.export(['config', 'scratchpad']), before = clone(f.raw), writes = f.writes.length;
    const m = mount(t, {store: b.store}); await ready(m, text); available(m, ['config', 'scratchpad']);
    assert(m.click('clear-selection')); cleared(m); assert.deepEqual(m.checked(), []); assert.equal(m.calls.reviews.length, 1);
    assert(m.click('clear-selection')); available(m, ['config', 'scratchpad']); assert.equal(m.calls.reviews.length, 1);
    m.toggle('scratchpad'); await settled(m); assert.deepEqual(Array.from(m.calls.reviews.at(-1)[1]), ['scratchpad']);
    assert(m.click('select-all')); assert(m.get('apply').disabled); await settled(m);
    assert.equal(m.calls.reviews.length, 3); assert.deepEqual(m.checked(), ['config', 'scratchpad']);
    assert.deepEqual(Array.from(m.calls.reviews.at(-1)[1]), ['config', 'scratchpad']); assert.equal(m.calls.reviews.at(-1)[0], text);
    assert.equal(m.calls.results.at(-1).workspaces.scope, 'matching'); assert(m.get('workspace-impact').hidden);
    available(m, ['config', 'scratchpad']); noWriteActions(m); assert.deepEqual(f.raw, before); assert.equal(f.writes.length, writes);
}));

test('real complete-file bulk selection refreshes all-workspace impact and keeps both global targets explicit', t => ram(t, async (f, b) => {
    const data = JSON.parse(await b.store.export(MODULES)); data.registry.entries[0].name = 'Synthetic incoming workspace';
    const text = JSON.stringify(data), before = clone(f.raw), writes = f.writes.length;
    const m = mount(t, {store: b.store}); m.select(text); await settled(m);
    assert(m.get('apply').disabled); assert(!m.get('workspace-impact').hidden); m.get('workspace-impact').open = true;
    assert(m.click('clear-selection')); cleared(m); assert.equal(m.calls.reviews.length, 1); assert(m.view.hasUncommittedWork());
    m.toggle('scratchpad'); await settled(m); assert.equal(m.calls.results.at(-1).workspaces.scope, 'matching'); assert(!m.get('apply').disabled);
    assert(m.click('select-all')); cleared(m); await settled(m);
    assert.equal(m.calls.reviews.length, 3); assert.deepEqual(Array.from(m.calls.reviews.at(-1)[1]), MODULES);
    assert.equal(m.calls.results.at(-1).workspaces.scope, 'all'); assert(!m.get('workspace-impact').hidden); assert.equal(m.get('workspace-impact').open, false);
    assert.match(m.get('workspace-impact-content').textContent, /Synthetic incoming workspace/);
    assert.equal(m.get('prompt-target').value, ''); assert.equal(m.get('collection-target').value, ''); assert(m.get('apply').disabled);
    assert.equal(m.click('apply'), false);
    m.destination('prompt-target', 'global-library'); await settled(m); assert(m.get('apply').disabled);
    assert.equal(m.calls.reviews.at(-1)[2].collectionTarget, undefined);
    m.destination('collection-target', 'global-collections'); await settled(m); assert(!m.get('apply').disabled);
    const count = m.calls.reviews.length; m.click('clear-selection'); cleared(m); assert.equal(m.calls.reviews.length, count);
    m.click('select-all'); await settled(m); assert.equal(m.calls.reviews.length, count + 1); assert(!m.get('apply').disabled);
    assert.equal(m.calls.reviews.at(-1)[0], text);
    assert.deepEqual({...m.calls.reviews.at(-1)[2]}, {promptTarget: 'global-library', collectionTarget: 'global-collections'});
    assert.equal(m.get('prompt-target').value, 'global-library'); assert.equal(m.get('collection-target').value, 'global-collections');
    m.select(text); await settled(m); assert.equal(m.get('prompt-target').value, ''); assert.equal(m.get('collection-target').value, ''); assert(m.get('apply').disabled);
    noWriteActions(m); assert.deepEqual(f.raw, before); assert.equal(f.writes.length, writes);
}));

test('legacy workspace destination survives bulk clear/reselect but is never invented', async t => {
    const m = mount(t, {modules: ['scratchpad']});
    m.backend.review = async (text, selection = ['scratchpad'], options = {}) => ({...result(['scratchpad'], selection), schemaVersion: 1,
        destinations: [{id: 'default', name: 'Default'}], requiresTarget: !options.targetWorkspaceId,
        targetWorkspace: options.targetWorkspaceId ? {id: 'default', name: 'Default'} : null});
    m.select(); await settled(m); m.click('clear-selection'); m.click('select-all'); await settled(m);
    assert(m.get('apply').disabled); assert.equal(m.calls.reviews.at(-1)[2].targetWorkspaceId, undefined);
    m.destination('target', 'default'); await settled(m); assert(!m.get('apply').disabled);
    m.click('clear-selection'); m.click('select-all'); await settled(m);
    assert.equal(m.calls.reviews.at(-1)[2].targetWorkspaceId, 'default'); assert.equal(m.get('target').value, 'default'); noWriteActions(m);
});

test('bulk all keeps active Focus protection and clearing permits a fresh non-Focus review', async t => {
    const m = mount(t); m.backend.review = async (text, selection = SCOPED) => ({...result(SCOPED, selection), current: {focus: {activeSession: true}}});
    m.select(); await settled(m); assert(m.get('apply').disabled); assert.match(m.get('status').textContent, /running, paused or interrupted/);
    m.click('clear-selection'); m.toggle('scratchpad'); await settled(m); assert(!m.get('apply').disabled); assert(m.get('warning').hidden);
    const count = m.calls.reviews.length; m.click('select-all'); await settled(m);
    assert.equal(m.calls.reviews.length, count + 1); assert(m.get('apply').disabled); assert(!m.get('warning').hidden); assert.equal(m.click('apply'), false); noWriteActions(m);
});

for (const stage of ['file text', 'first review', 'large confirmation']) test(`bulk controls share checkbox locks during ${stage}`, async t => {
    const m = mount(t), wait = deferred(); let entered = false, reads = 0;
    if (stage === 'first review') m.backend.review = async () => { entered = true; await wait.promise; return result(); };
    m.select('SYNTHETIC', {size: stage === 'large confirmation' ? 11 * 1024 * 1024 : 9,
        text: () => { reads++; return stage === 'file text' ? wait.promise : Promise.resolve('SYNTHETIC'); }});
    if (stage === 'first review') await until(() => entered);
    bulkEnabled(m, false); for (const id of MODULES) assert(m.input(id).disabled);
    const count = m.calls.reviews.length, selection = m.checked(), feedback = m.get('status').textContent;
    assert.equal(m.click('select-all'), false); assert.equal(m.click('clear-selection'), false);
    // Forced synthetic dispatch tests the handler guard, not native disabled activation.
    m.get('clear-selection').dispatch('click'); m.get('select-all').dispatch('click');
    assert.deepEqual(m.checked(), selection); assert.equal(m.calls.reviews.length, count); assert.equal(m.get('status').textContent, feedback);
    assert(!m.get('export').disabled); assert(!m.get('choose').disabled); assert(!m.get('cancel').disabled);
    if (stage === 'large confirmation') { assert.equal(reads, 0); m.click('large'); }
    wait.resolve('SYNTHETIC'); await until(() => !m.get('apply').disabled); bulkEnabled(m, true); available(m, SCOPED); noWriteActions(m);
});

test('known-scope bulk changes invalidate old review and empty selection synchronously retires its preview', async t => {
    const m = mount(t, {modules: ['config', 'scratchpad']}); await ready(m);
    const wait = deferred(); let entered = false;
    m.backend.review = async (text, selection) => { if (selection.length === 1) { entered = true; await wait.promise; } return result(['config', 'scratchpad'], selection); };
    m.toggle('config'); await until(() => entered); bulkEnabled(m, true); available(m, ['config', 'scratchpad']);
    const count = m.calls.reviews.length; m.click('select-all'); await settled(m);
    assert.equal(m.calls.reviews.length, count + 1); assert.deepEqual(m.checked(), ['config', 'scratchpad']);
    m.click('clear-selection'); cleared(m); const emptyCount = m.calls.reviews.length;
    wait.resolve(); await tick(); assert.deepEqual(m.checked(), []); cleared(m); assert.equal(m.calls.reviews.length, emptyCount);
    assert.match(m.get('status').textContent, /Select at least one/); noWriteActions(m);
});

test('repeated same-value bulk activation preserves feedback, focus and the in-flight review generation', async t => {
    const m = mount(t); await ready(m); m.click('clear-selection');
    const wait = deferred(); let entered = false;
    m.backend.review = async (text, selection) => { entered = true; await wait.promise; return result(SCOPED, selection); };
    m.click('select-all'); await until(() => entered);
    const count = m.calls.reviews.length, feedback = m.get('status').textContent;
    m.click('select-all'); m.click('select-all'); assert.equal(m.calls.reviews.length, count);
    assert.equal(m.get('status').textContent, feedback); assert.equal(m.document.activeElement, m.get('select-all')); bulkEnabled(m, true);
    wait.resolve(); await settled(m); assert(!m.get('apply').disabled, 'no-op must not invalidate the only current review');
    assert(!m.get('workspace-impact').hidden); const readyFeedback = m.get('status').textContent;
    m.click('select-all'); assert.equal(m.document.activeElement, m.get('select-all')); assert.equal(m.get('status').textContent, readyFeedback);
    m.click('clear-selection'); const none = m.get('status').textContent; m.click('clear-selection');
    assert.equal(m.document.activeElement, m.get('clear-selection')); assert.equal(m.get('status').textContent, none); assert.equal(m.calls.reviews.length, count); noWriteActions(m);
});

for (const action of ['Cancel', 'Escape', 'new file', 'destroy']) test(`late bulk review cannot revive controls or impact after ${action}`, async t => {
    const m = mount(t); await ready(m); m.click('clear-selection');
    const wait = deferred(), ordinary = m.backend.review; let entered = false;
    m.backend.review = async (...args) => { entered = true; await wait.promise; return ordinary(...args); };
    m.click('select-all'); await until(() => entered);
    const oldAll = m.get('select-all'), oldClear = m.get('clear-selection'), oldInputs = MODULES.map(m.input), oldImpact = m.get('workspace-impact');
    if (action === 'Cancel') m.click('cancel');
    else if (action === 'Escape') m.get('select-all').dispatch('keydown', {key: 'Escape'});
    else if (action === 'destroy') assert.equal(m.view.destroy(), true);
    else { m.backend.review = async () => result(['scratchpad']); m.select('SYNTHETIC NEW'); await settled(m); }
    const count = m.calls.reviews.length, checks = oldInputs.map(el => el.checked);
    wait.resolve(); await tick(); assert.equal(m.calls.reviews.length, count); assert.deepEqual(oldInputs.map(el => el.checked), checks);
    assert(oldImpact.hidden); assert.equal(oldImpact.querySelector('.complete-backup-workspace-impact-content').children.length, 0);
    if (action === 'destroy') { oldAll.dispatch('click'); oldClear.dispatch('click'); assert.deepEqual(oldInputs.map(el => el.checked), checks); }
    else if (action === 'new file') { assert.deepEqual(m.checked(), ['scratchpad']); available(m, ['scratchpad']); }
    else { assert(m.get('preview').hidden); bulkEnabled(m, true); available(m, MODULES); assert.equal(m.view.hasUncommittedWork(), false); }
    noWriteActions(m);
});

test('read failure releases bulk controls without retaining source or the previous impact', async t => {
    const m = mount(t); await ready(m); m.get('workspace-impact').open = true;
    m.select('BAD', {text: async () => { throw Error('synthetic read failure'); }}); await settled(m); cleared(m);
    bulkEnabled(m, true); available(m, MODULES); assert.match(m.get('status').textContent, /Could not read/);
    const count = m.calls.reviews.length; m.click('clear-selection'); m.click('select-all'); await tick();
    assert.equal(m.calls.reviews.length, count); assert.deepEqual(m.checked(), MODULES); assert.equal(m.view.hasUncommittedWork(), false); noWriteActions(m);
});

for (const operation of ['export', 'apply']) test(`${operation} locks both bulk buttons until the existing operation finishes`, async t => {
    const m = mount(t), wait = deferred(); let entered = false;
    if (operation === 'apply') { await ready(m); m.backend.restore = async () => { entered = true; await wait.promise; }; }
    else { const original = m.backend.export; m.backend.export = async ids => { entered = true; await wait.promise; return original(ids); }; }
    m.click(operation); await until(() => entered); bulkEnabled(m, false);
    const checks = m.checked(), count = m.calls.reviews.length;
    assert.equal(m.click('clear-selection'), false); m.get('clear-selection').dispatch('click'); m.get('select-all').dispatch('click');
    assert.deepEqual(m.checked(), checks); assert.equal(m.calls.reviews.length, count);
    wait.resolve(); await settled(m); bulkEnabled(m, true);
    assert.equal(m.calls.restores.length, Number(operation === 'apply')); assert.equal(m.calls.exports.length, Number(operation === 'export'));
    if (operation === 'export') { assert(!m.get('export-summary').hidden); assert(!m.get('download-export').disabled); assert.equal(m.calls.downloads.length, 0); }
});

test('detached host rejects old bulk controls without changing checks or calling the Store', async t => {
    const m = mount(t); await ready(m); const clear = m.get('clear-selection'), all = m.get('select-all'), inputs = MODULES.map(m.input);
    const checks = inputs.map(el => el.checked), count = m.calls.reviews.length;
    m.host.remove(); clear.dispatch('click'); all.dispatch('click'); await tick();
    assert.deepEqual(inputs.map(el => el.checked), checks); assert.equal(m.calls.reviews.length, count); noWriteActions(m);
});

test('a delayed bulk review uses the existing focus owner and does not steal a newer focus', async t => {
    const m = mount(t); await ready(m); m.click('clear-selection');
    const wait = deferred(); let entered = false;
    m.backend.review = async (text, selection) => { entered = true; await wait.promise; return result(SCOPED, selection); };
    m.click('select-all'); await until(() => entered);
    const elsewhere = m.document.createElement('button'); m.document.body.append(elsewhere); elsewhere.focus();
    wait.resolve(); await settled(m); assert.equal(m.document.activeElement, elsewhere); assert(!m.get('apply').disabled); noWriteActions(m);
});
