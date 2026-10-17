'use strict';
// Production view, synthetic DOM, and a bounded RAM Store projection check.
// Native details keyboard/rendering and installed-extension upgrades are not simulated.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const {fixture, Backup, Workspaces, copy} = require('./helpers/complete-backup-acceptance');
const source = fs.readFileSync('shared/complete-backup-view.js', 'utf8');
const modules = ['config', 'tasks', 'scratchpad', 'countdown', 'focus'];
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
async function until(predicate) {
    const deadline = Date.now() + 2000;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1));
    assert(predicate(), 'expected backup view state');
}
const space = (id, name = id) => ({id, name});
function sample() {
    return {schemaVersion: 2, modules, selected: modules, incoming: {}, current: {}, workspaces: {
        scope: 'all',
        current: [space('default', 'Default'), space('renamed', 'Old'), space('to_trash', 'Move'), space('combined', 'Before'), space('gone_live', 'Twin')],
        currentTrash: [space('from_trash', 'Return'), space('gone_trash', 'Twin')],
        incoming: [space('default', 'Default'), space('renamed', 'New'), space('from_trash', 'Return'), space('new_live', 'Twin')],
        incomingTrash: [space('to_trash', 'Move'), space('combined', 'After'), space('new_trash', 'Twin')],
        incomingTrashCount: 3, currentTrashCount: 2
    }};
}
function mount({locale = 'en', store: supplied, result = sample(), download} = {}) {
    const document = createDocument({blurUnavailableFocus: true, aggregateTextContent: true});
    const host = document.createElement('div'); document.body.append(host);
    // Missing UI catalogs use the production English fallback, not a claimed third locale.
    const catalog = ['en', 'zh_CN'].includes(locale) ? JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`)) : null;
    const window = {LocalItabCompleteBackup: Backup, i18n: {t: key => catalog?.[key]?.message || key}};
    vm.runInNewContext(source, {window, setTimeout, URL, Blob});
    const calls = {review: [], restore: [], export: [], recovery: [], downloads: [], inspect: [], interrupted: []};
    const original = supplied || {
        async review(text, selection = result.selected) { return {...copy(result), selected: [...selection]}; },
        async restore() {}, async export() { return 'SYNTHETIC EXPORT'; }, async recovery() { return 'SYNTHETIC RECOVERY'; },
        async inspectInterruptedRestore() { return {pending: false}; }, async exportInterruptedCandidates() { return 'SYNTHETIC COPIES'; }
    };
    const store = {};
    for (const [method, key] of [['review', 'review'], ['restore', 'restore'], ['export', 'export'], ['recovery', 'recovery'], ['inspectInterruptedRestore', 'inspect'], ['exportInterruptedCandidates', 'interrupted']]) {
        if (typeof original[method] === 'function') store[method] = (...args) => { calls[key].push(args); return original[method](...args); };
    }
    const view = window.LocalItabCompleteBackupView.mount(host, {store, download: async (...args) => { calls.downloads.push(args); if (download) await download(...args); }, reload: () => assert.fail('no automatic reload')});
    const get = name => host.querySelector('.complete-backup-' + name);
    const select = (text = 'synthetic', chosen = {}) => {
        get('choose').focus(); get('file').files = [{size: Buffer.byteLength(text), text: async () => text, ...chosen}]; get('file').dispatch('change');
    };
    const t = key => catalog?.['completeBackup' + key]?.message || JSON.parse(fs.readFileSync('_locales/en/messages.json'))['completeBackup' + key]?.message;
    return {document, host, view, store, calls, get, select, t};
}
function impact(m) { const node = m.get('workspace-impact'); assert(node, 'workspace impact disclosure exists'); return node; }
function group(m, kind) { const node = impact(m).querySelector(`[data-impact-group="${kind}"]`); assert(node, `${kind} impact group exists`); return node; }
function rows(m, kind) { return group(m, kind).querySelectorAll('li'); }
function ids(m, kind) { return rows(m, kind).map(row => row.children[0].textContent.slice(m.t('WorkspaceImpactId').length + 2)); }
function counts(m, expected) {
    for (const [kind, count] of Object.entries(expected)) {
        const key = {added: 'WorkspaceImpactAdded', removed: 'WorkspaceImpactRemoved', changed: 'WorkspaceImpactChanged'}[kind];
        const item = group(m, kind), label = item.children[0];
        // Keep the existing full label/count contract at the first child. The
        // nonempty group's label is now the native disclosure activation target.
        assert.equal(label.textContent, `${m.t(key)}: ${count}`);
        assert.equal(item.tagName, count ? 'DETAILS' : 'SECTION');
        assert.equal(label.tagName, count ? 'SUMMARY' : 'H5');
        assert.equal(rows(m, kind).length, count);
        if (!count) assert.equal(item.querySelectorAll('details,summary,ul').length, 0);
    }
}
function rowText(m, kind, id) {
    const row = rows(m, kind).find(row => row.children[0].textContent === `${m.t('WorkspaceImpactId')}: ${id}`);
    assert(row, 'full stable identity has a row: ' + id); return row.children.map(child => child.textContent);
}
function openAllGroups(m) {
    const node = impact(m); node.open = true;
    const groups = node.querySelectorAll('details');
    for (const item of groups) item.open = true;
    return groups;
}
function cleared(node, oldGroups = []) {
    assert.equal(node.hidden, true); assert.equal(node.open, false);
    assert.equal(node.querySelector('.complete-backup-workspace-impact-content').children.length, 0, 'old names/statuses removed synchronously');
    for (const item of oldGroups) { assert.equal(item.open, false); assert.equal(item.isConnected, false); }
}
async function ready(m, text) { m.select(text); await until(() => !m.get('apply').disabled); return impact(m); }

for (const locale of ['en', 'zh_CN', 'missing-catalog']) test(`names and destinations use exact identities and exclusive groups (${locale})`, async t => {
    const m = mount({locale}); t.after(() => m.view.destroy()); const node = await ready(m);
    assert.equal(node.tagName, 'DETAILS'); assert.equal(node.open, false); assert.equal(node.hidden, false);
    assert.equal(node.children[0].tagName, 'SUMMARY'); assert.equal(node.children[0].textContent, m.t('WorkspaceImpact'));
    assert.equal(node.querySelector('.form-hint').textContent, m.t('WorkspaceImpactHelp'));
    counts(m, {added: 2, removed: 2, changed: 4});
    assert.deepEqual(ids(m, 'added'), ['new_live', 'new_trash']); assert.deepEqual(ids(m, 'removed'), ['gone_live', 'gone_trash']);
    assert.deepEqual(ids(m, 'changed'), ['renamed', 'to_trash', 'combined', 'from_trash']);
    for (const [id, before, after] of [
        ['renamed', `Old (${m.t('WorkspaceImpactLive')})`, `New (${m.t('WorkspaceImpactLive')})`],
        ['to_trash', `Move (${m.t('WorkspaceImpactLive')})`, `Move (${m.t('WorkspaceImpactTrash')})`],
        ['combined', `Before (${m.t('WorkspaceImpactLive')})`, `After (${m.t('WorkspaceImpactTrash')})`],
        ['from_trash', `Return (${m.t('WorkspaceImpactTrash')})`, `Return (${m.t('WorkspaceImpactLive')})`]
    ]) assert.deepEqual(rowText(m, 'changed', id).slice(1), [`${m.t('WorkspaceImpactCurrent')}: ${before}`, `${m.t('WorkspaceImpactAfter')}: ${after}`]);
    for (const [kind, id, state] of [['added', 'new_live', 'Live'], ['added', 'new_trash', 'Trash'], ['removed', 'gone_live', 'Live'], ['removed', 'gone_trash', 'Trash']]) {
        const row = rowText(m, kind, id); const present = `Twin (${m.t('WorkspaceImpact' + state)})`;
        assert.equal(row[1], `${m.t('WorkspaceImpactCurrent')}: ${kind === 'added' ? m.t('WorkspaceImpactAbsent') : present}`);
        assert.equal(row[2], `${m.t('WorkspaceImpactAfter')}: ${kind === 'removed' ? m.t('WorkspaceImpactAbsent') : present}`);
    }
    for (const item of node.querySelectorAll('details')) assert.equal(item.open, false);
    assert.equal(node.querySelectorAll('li').length, 8, 'combined rename and status change occurs once');
    assert.equal(m.calls.review.length, 1); assert.equal(m.calls.restore.length, 0);
    assert.equal(m.get('counts').children.length, 5, 'the original module counts remain the primary list');
});

test('group navigation exposes three counts before any rows and opens nonempty groups independently', async t => {
    const m = mount(); t.after(() => m.view.destroy()); const node = await ready(m);
    node.open = true;
    const groups = ['added', 'removed', 'changed'].map(kind => group(m, kind));
    for (const item of groups) {
        assert.equal(item.tagName, 'DETAILS'); assert.equal(item.open, false);
        assert.equal(item.children[0].tagName, 'SUMMARY');
        assert.equal(item.children[0].getClientRects().length, 1, 'group label and count are available before rows');
        assert.equal(item.querySelector('li').getClientRects().length, 0, 'rows begin collapsed');
    }
    counts(m, {added: 2, removed: 2, changed: 4});
    groups[1].open = true;
    assert.equal(groups[1].querySelector('li').getClientRects().length, 1);
    assert.equal(groups[0].open, false); assert.equal(groups[2].open, false);
    groups[2].open = true; groups[1].open = false;
    assert.equal(groups[2].open, true, 'collapsing one group does not collapse another');
    assert.equal(m.calls.review.length, 1); assert.equal(m.calls.restore.length, 0);
});

test('zero-count groups are labeled static sections without empty disclosure controls or lists', async t => {
    const result = sample(), spaces = result.workspaces;
    spaces.incoming = copy(spaces.current); spaces.incomingTrash = copy(spaces.currentTrash);
    const m = mount({result}); t.after(() => m.view.destroy()); const node = await ready(m); node.open = true;
    counts(m, {added: 0, removed: 0, changed: 0});
    for (const kind of ['added', 'removed', 'changed']) {
        const item = group(m, kind);
        assert.equal(item.tagName, 'SECTION'); assert.equal(item.children[0].tagName, 'H5');
        assert.equal(item.children[0].getClientRects().length, 1);
        assert.equal(item.querySelectorAll('details,summary,ul').length, 0);
    }
    assert.equal(node.querySelectorAll('details').length, 0);
    assert.equal(m.get('workspace-impact-unchanged').textContent, m.t('WorkspaceImpactUnchanged'));
});

for (const kind of ['identical', 'order and last-used only']) test(`${kind} previews do not claim contents/order are unchanged`, async t => {
    const result = sample(), spaces = result.workspaces;
    spaces.current = [space('default', 'Default'), space('second', 'Second')]; spaces.currentTrash = [space('old', 'Old')];
    spaces.incoming = copy(spaces.current); spaces.incomingTrash = copy(spaces.currentTrash);
    if (kind !== 'identical') { spaces.incoming.reverse(); result.incomingLastUsedId = 'second'; }
    result.incoming = {scratchpad: {characters: 80}}; result.current = {scratchpad: {characters: 5}};
    const m = mount({result}); t.after(() => m.view.destroy()); await ready(m);
    counts(m, {added: 0, removed: 0, changed: 0});
    assert.equal(m.get('workspace-impact-unchanged').textContent, m.t('WorkspaceImpactUnchanged'));
    assert.match(m.t('WorkspaceImpactUnchanged'), /selected module contents will still be replaced/);
});

for (const kind of ['schema 1', 'matching', 'global-only', 'missing incomingTrash', 'missing currentTrash', 'nonarray incoming', 'nonarray current']) {
    test(`impact list is absent for ${kind}`, async t => {
        const result = sample();
        if (kind === 'schema 1') { result.schemaVersion = 1; result.destinations = [space('default', 'Default')]; result.targetWorkspace = space('default', 'Default'); }
        else if (['matching', 'global-only'].includes(kind)) result.workspaces.scope = kind;
        else if (kind.startsWith('missing ')) delete result.workspaces[kind.split(' ')[1]];
        // Existing summary requires map(); exercise the disclosure gate without changing that contract.
        else result.workspaces[kind.split(' ')[1]] = {map: () => []};
        const m = mount({result});
        if (kind.startsWith('nonarray ')) m.store.review = async () => result;
        t.after(() => m.view.destroy()); await ready(m); cleared(impact(m));
    });
}
for (const schemaVersion of [3, 4]) test(`complete workspace scope in schema ${schemaVersion} gets the same list`, async t => {
    const result = sample(); result.schemaVersion = schemaVersion;
    const m = mount({result}); t.after(() => m.view.destroy()); await ready(m); counts(m, {added: 2, removed: 2, changed: 4});
});

test('all 200 union identities are shown without merging equal names or truncating', async t => {
    const result = sample();
    for (const [key, prefix] of [['current', 'old_live'], ['currentTrash', 'old_trash'], ['incoming', 'new_live'], ['incomingTrash', 'new_trash']]) {
        result.workspaces[key] = Array.from({length: 50}, (_, i) => space(`${prefix}_${String(i).padStart(3, '0')}`, 'Same name'));
    }
    const m = mount({result}); t.after(() => m.view.destroy()); await ready(m);
    counts(m, {added: 100, removed: 100, changed: 0});
    assert.equal(new Set([...ids(m, 'added'), ...ids(m, 'removed')]).size, 200);
    assert.equal(ids(m, 'added').at(-1), 'new_trash_049'); assert.equal(ids(m, 'removed').at(-1), 'old_trash_049');
    impact(m).open = true;
    for (const kind of ['added', 'removed', 'changed']) assert.equal(group(m, kind).children[0].getClientRects().length, 1);
    assert.equal(rows(m, 'added')[0].getClientRects().length, 0);
    group(m, 'removed').open = true;
    assert.equal(rows(m, 'removed').at(-1).getClientRects().length, 1, 'last removed identity is reachable without opening added rows');
    assert.equal(group(m, 'added').open, false);
});

test('prototype-like IDs, HTML and Unicode names remain full text with no executable children', async t => {
    const result = sample(); const name = '<img src=x onerror="alert(1)"> 中文 🧪 e\u0301 & <script>bad()</script> ' + '長'.repeat(100);
    const id = 'identity_' + 'x'.repeat(90);
    Object.assign(result.workspaces, {current: [space('__proto__', 'Old'), space('constructor', name)], currentTrash: [],
        incoming: [space('__proto__', name), space(id, name)], incomingTrash: [space('constructor', name)]});
    const m = mount({result}); t.after(() => m.view.destroy()); await ready(m);
    counts(m, {added: 1, removed: 0, changed: 2});
    assert(rowText(m, 'changed', '__proto__')[2].includes(name)); assert(rowText(m, 'changed', 'constructor')[1].includes(name));
    assert.equal(ids(m, 'added')[0], id); assert(rowText(m, 'added', id)[2].includes(name));
    for (const tag of ['img', 'script', 'a', 'input', 'button']) assert.equal(impact(m).querySelectorAll(tag).length, 0);
    assert.equal(impact(m).querySelectorAll('li').every(row => row.children.every(node => node.children.length === 0)), true);
    assert(!source.includes('innerHTML')); assert(!source.includes('insertAdjacentHTML'));
});

test('expanding and collapsing is native markup with no new Store call, write or focus movement', async t => {
    const m = mount(); t.after(() => m.view.destroy()); const node = await ready(m), summary = node.children[0];
    const before = JSON.stringify(m.calls); summary.focus();
    for (const key of ['Enter', ' ']) assert.equal(summary.dispatch('keydown', {key}).prevented, false);
    for (const open of [true, false, true, false]) { node.open = open; node.dispatch('toggle'); assert.equal(m.document.activeElement, summary); }
    assert.equal(JSON.stringify(m.calls), before); assert.equal(node.listeners.size, 0); assert.equal(summary.listeners.size, 0);
    assert.equal(summary.getAttribute('role'), undefined); assert.equal(summary.getAttribute('tabindex'), undefined);
    node.open = true;
    const feedback = m.get('status').textContent;
    for (const item of node.querySelectorAll('details')) {
        const label = item.children[0]; label.focus(); assert.equal(m.document.activeElement, label);
        for (const key of ['Enter', ' ']) assert.equal(label.dispatch('keydown', {key}).prevented, false);
        for (const open of [true, false, true, false]) { item.open = open; item.dispatch('toggle'); assert.equal(m.document.activeElement, label); }
        assert.equal(item.listeners.size, 0); assert.equal(label.listeners.size, 0);
        for (const attribute of ['role', 'tabindex', 'aria-live']) assert.equal(label.getAttribute(attribute), undefined);
        assert.equal(item.getAttribute('name'), undefined, 'groups do not form an exclusive accordion');
    }
    assert.equal(JSON.stringify(m.calls), before); assert.equal(m.get('status').textContent, feedback);
    assert.equal(node.querySelectorAll('[aria-live]').length, 0, 'private names and IDs are outside live regions');
});

for (const action of ['module change', 'empty selection', 'new file', 'large file', 'Cancel', 'Escape', 'export', 'inspect interrupted', 'destroy']) {
    test(`${action} synchronously removes and collapses the prior details`, async t => {
        const m = mount(); t.after(() => m.view.destroy()); const node = await ready(m), oldGroups = openAllGroups(m);
        const wait = deferred(); const oldReview = m.store.review; m.store.review = () => wait.promise;
        if (action === 'module change' || action === 'empty selection') {
            if (action === 'empty selection') for (const input of m.host.querySelectorAll('[data-module]')) input.checked = false;
            else m.host.querySelector('[data-module="focus"]').checked = false;
            m.host.querySelector('[data-module="focus"]').dispatch('change');
        } else if (action === 'new file') m.select('next', {text: () => wait.promise});
        else if (action === 'large file') m.select('large', {size: 11 * 1024 * 1024, text: () => wait.promise});
        else if (action === 'Cancel') m.get('cancel').dispatch('click');
        else if (action === 'Escape') node.children[0].dispatch('keydown', {key: 'Escape'});
        else if (action === 'export') m.get('export').dispatch('click');
        else if (action === 'inspect interrupted') m.get('inspect-interrupted').dispatch('click');
        else assert.equal(m.view.destroy(), true);
        cleared(node, oldGroups); assert.equal(m.calls.restore.length, 0);
        if (action !== 'destroy') m.view.cancel();
        wait.resolve(sample()); await tick(); cleared(node, oldGroups); m.store.review = oldReview;
    });
}

for (const failure of ['read', 'review', 'oversize', 'apply']) test(`${failure} failure cannot retain old names or open state`, async t => {
    const m = mount(); t.after(() => m.view.destroy()); const node = await ready(m), oldGroups = openAllGroups(m);
    if (failure === 'apply') { m.store.restore = async () => { throw {code: 'CONFLICT'}; }; m.get('apply').dispatch('click'); }
    else if (failure === 'review') { m.store.review = async () => { throw {code: 'READ'}; }; m.select('bad'); }
    else m.select('bad', failure === 'oversize' ? {size: 33 * 1024 * 1024} : {text: async () => { throw Error('synthetic'); }});
    await until(() => m.get('preview').hidden); cleared(node, oldGroups); assert.equal(m.get('apply').disabled, true);
});

test('switching all to matching and back uses fresh collapsed details with the original review arguments', async t => {
    const m = mount(); t.after(() => m.view.destroy()); let node = await ready(m); const oldGroups = openAllGroups(m);
    const original = m.store.review;
    m.store.review = async (...args) => { const result = await original(...args); result.workspaces.scope = args[1].length === 5 ? 'all' : 'matching'; return result; };
    const focus = m.host.querySelector('[data-module="focus"]'); focus.checked = false; focus.dispatch('change'); cleared(node, oldGroups);
    await until(() => !m.get('apply').disabled); cleared(node);
    focus.checked = true; focus.dispatch('change'); await until(() => !m.get('apply').disabled);
    node = impact(m); assert.equal(node.open, false); assert.equal(node.hidden, false);
    for (const item of node.querySelectorAll('details')) { assert.equal(item.open, false); assert(!oldGroups.includes(item)); }
    assert.deepEqual(m.calls.review.map(args => [args[0], args[1] ? Array.from(args[1]) : undefined, Object.keys(args[2])]), [
        ['synthetic', undefined, []], ['synthetic', modules.slice(0, 4), []], ['synthetic', modules, []]
    ]);
    assert.equal(m.calls.restore.length, 0);
});

for (const stage of ['file', 'review']) for (const action of ['Cancel', 'new file', 'destroy']) {
    test(`stale ${stage} resolution cannot revive details after ${action}`, async t => {
        const m = mount(); t.after(() => m.view.destroy()); const node = await ready(m), oldGroups = openAllGroups(m);
        const wait = deferred(), original = m.store.review; let entered = false;
        if (stage === 'review') m.store.review = () => { entered = true; return wait.promise; };
        m.select('stale', stage === 'file' ? {text: () => wait.promise} : {}); cleared(node, oldGroups);
        if (stage === 'review') await until(() => entered);
        if (action === 'Cancel') m.get('cancel').dispatch('click');
        else if (action === 'destroy') m.view.destroy();
        else { m.store.review = original; m.select('fresh'); await until(() => !m.get('apply').disabled); }
        const before = node.textContent, outside = m.document.createElement('input'); m.document.body.append(outside); outside.focus();
        wait.resolve(stage === 'file' ? 'STALE FILE' : sample()); await tick();
        assert.equal(node.textContent, before); assert.equal(m.document.activeElement, outside);
        if (action !== 'new file') cleared(node, oldGroups); else { assert.equal(node.hidden, false); assert.equal(node.open, false); for (const item of node.querySelectorAll('details')) assert.equal(item.open, false); }
        assert.equal(m.calls.restore.length, 0);
    });
}

test('out-of-order scope reviews cannot revive old all-scope names after a newer matching result', async t => {
    const m = mount(); t.after(() => m.view.destroy()); const node = await ready(m), oldGroups = openAllGroups(m);
    const wait = deferred(); let entered = false, turn = 0;
    m.store.review = async (_text, selected) => {
        const result = sample(); result.selected = selected;
        if (++turn === 1) { entered = true; return wait.promise; }
        result.workspaces.scope = 'matching'; return result;
    };
    const focus = m.host.querySelector('[data-module="focus"]'); focus.checked = false; focus.dispatch('change'); await until(() => entered);
    const tasks = m.host.querySelector('[data-module="tasks"]'); tasks.checked = false; tasks.dispatch('change');
    await until(() => !m.get('apply').disabled); cleared(node, oldGroups); wait.resolve(sample()); await tick(); cleared(node, oldGroups);
    assert.deepEqual(Array.from(m.host.querySelectorAll('[data-module]').filter(input => input.checked).map(input => input.dataset.module)), ['config', 'scratchpad', 'countdown']);
});

for (const outcome of ['success', 'missing recovery', 'download failure']) test(`settled recovery ${outcome} keeps the exact review, ticket and mixed group state`, async t => {
    const ticket = sample();
    const store = {async review() { return ticket; }, async restore() {}, async recovery() {
        if (outcome === 'missing recovery') throw {code: 'NO_RECOVERY'};
        return 'SYNTHETIC RECOVERY';
    }};
    const m = mount({store, download: outcome === 'download failure' ? async () => { throw Error('Synthetic download failure'); } : undefined});
    t.after(() => m.view.destroy()); const node = await ready(m); node.open = true;
    group(m, 'removed').open = true; group(m, 'changed').open = true;
    const retained = ['added', 'removed', 'changed'].map(kind => group(m, kind));
    const before = node.textContent, firstReview = m.calls.review[0];
    m.get('recovery').dispatch('click'); await until(() => !m.view.pending);
    assert.equal(node.textContent, before); assert.equal(node.open, true); assert.equal(m.calls.review.length, 1); assert.equal(m.calls.review[0], firstReview);
    assert.equal(m.calls.restore.length, 0); assert.equal(m.calls.downloads.length, outcome === 'missing recovery' ? 0 : 1); assert.equal(m.get('apply').disabled, false);
    retained.forEach((item, index) => { assert.equal(group(m, ['added', 'removed', 'changed'][index]), item); assert.equal(item.open, index !== 0); });
    m.get('apply').dispatch('click'); await until(() => !m.view.pending);
    assert.equal(m.calls.restore.length, 1); assert.equal(m.calls.restore[0][0], ticket);
    cleared(node, retained);
});

for (const [target, value, field] of [['prompt-target', 'global-library', 'promptTarget'], ['collection-target', 'global-collections', 'collectionTarget']]) {
    test(`${target} change clears opened groups and late target review cannot revive them after Cancel`, async t => {
        const result = sample(); result.schemaVersion = 4; result.modules = result.selected = [...modules, 'prompts', 'collections'];
        result.prompts = result.collections = {conflicts: []};
        const m = mount({result}); t.after(() => m.view.destroy()); const node = await ready(m), oldGroups = openAllGroups(m);
        const wait = deferred(); let args;
        m.store.review = (...received) => { args = received; return wait.promise; };
        const control = m.get(target); assert.equal(control.getClientRects().length, 1); assert.equal(control.disabled, false);
        control.value = value; control.dispatch('change'); cleared(node, oldGroups);
        await until(() => args); assert.equal(args[2][field], value);
        m.get('cancel').dispatch('click'); wait.resolve(result); await tick(); cleared(node, oldGroups);
        assert.equal(m.calls.restore.length, 0);
    });
}

function topology(f, rows) {
    const old = copy(f.raw[Workspaces.REGISTRY_KEY].workspaces[0]), values = copy(f.values('default'));
    f.raw[Workspaces.REGISTRY_KEY].lastUsedId = 'default';
    f.raw[Workspaces.REGISTRY_KEY].workspaces = rows.map(([id, name, state], order) => {
        const entry = {...old, id, name, generation: 'synthetic_' + id, order, deletedAt: state === 'trash' ? old.updatedAt : null};
        f.raw[Workspaces.bundleKey(entry)] = {schemaVersion: 1, id, generation: entry.generation, values: copy(values)}; return entry;
    });
}
const projected = registry => registry.workspaces.map(({id, name, deletedAt}) => ({id, name, state: deletedAt === null ? 'live' : 'trash'}));

test('finite real Store projection matches the displayed after-state and retains the complete pre-restore copy', async t => {
    const incoming = fixture(), current = fixture();
    const currentRows = [['default', 'Default', 'live'], ['return', 'Return', 'trash'], ['combined', 'Old', 'live'], ['gone', 'Twin', 'trash']];
    const incomingRows = [['default', 'Renamed Default', 'live'], ['return', 'Return', 'live'], ['new', 'Twin', 'live'], ['combined', 'New', 'trash']];
    topology(current, currentRows); topology(incoming, incomingRows);
    const file = await incoming.store.export(modules), before = copy(current.raw), beforeRegistry = projected(current.raw[Workspaces.REGISTRY_KEY]);
    let reads = 0; current.hooks.read = (keys, raw) => { reads++; return copy(keys === null ? raw : Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]]))); };
    const m = mount({store: current.store}); t.after(() => m.view.destroy()); const node = await ready(m, file); counts(m, {added: 1, removed: 1, changed: 3});
    const readCount = reads; node.children[0].focus(); for (const open of [true, false, true]) { node.open = open; node.dispatch('toggle'); }
    assert.equal(reads, readCount); assert.deepEqual(current.raw, before); assert.equal(current.writes.length, 0); assert.equal(incoming.writes.length, 0);
    const expected = incomingRows.map(([id, name, state]) => ({id, name, state}));
    for (const item of expected) {
        const row = rowText(m, item.id === 'new' ? 'added' : 'changed', item.id);
        assert.equal(row[2], `${m.t('WorkspaceImpactAfter')}: ${item.name} (${m.t(item.state === 'live' ? 'WorkspaceImpactLive' : 'WorkspaceImpactTrash')})`);
    }
    m.get('apply').dispatch('click'); await until(() => !m.view.pending);
    assert.equal(m.get('status').textContent, m.t('Success')); cleared(node); assert.equal(m.calls.restore.length, 1);
    assert.equal(m.calls.restore[0][1].confirmed, true); assert.equal(typeof m.calls.restore[0][1].isCurrent, 'function');
    assert.deepEqual(projected(current.raw[Workspaces.REGISTRY_KEY]), expected);
    const recovery = Backup.parse(await current.store.recovery(), current.manager);
    const retained = [...recovery.registry.entries.map(({id, name}) => ({id, name, state: 'live'})), ...recovery.trash.map(({id, name}) => ({id, name, state: 'trash'}))];
    assert.deepEqual(retained.sort((a, b) => a.id.localeCompare(b.id)), beforeRegistry.sort((a, b) => a.id.localeCompare(b.id)));
});

test('a real saved-registry change after opening the list still rejects the original ticket without writes', async t => {
    const f = fixture(), text = await f.store.export(modules), m = mount({store: f.store}); t.after(() => m.view.destroy());
    const node = await ready(m, text); node.open = true;
    f.raw[Workspaces.REGISTRY_KEY].workspaces[1].name = 'Synthetic newer name'; f.raw[Workspaces.REGISTRY_KEY].revision++;
    const before = copy(f.raw); m.get('apply').dispatch('click'); await until(() => !m.view.pending);
    assert.equal(m.get('status').textContent, m.t('Conflict')); cleared(node); assert.deepEqual(f.raw, before); assert.equal(f.writes.length, 0);
    assert.equal(m.calls.review.length, 1); assert.equal(m.calls.restore.length, 1); assert.equal(m.get('reload').hidden, true);
});
