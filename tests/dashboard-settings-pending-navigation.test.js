'use strict';
// Real newtab DOMContentLoaded + initializeDashboard + StorageManager +
// workspaces-view routing. Only DOM, RAM Chrome/locks, timers and window.open
// are modeled. Startup may read storage; explicit navigation must add no I/O.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const StorageManager = require('../storage.js');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const {synthetic, fixture, accepted, Workspaces, copy} = require('./helpers/complete-backup-acceptance');
const source = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

async function interrupt(target) {
    const incoming = await synthetic('source');
    const review = await target.store.review(await incoming.store.export(), null, accepted);
    target.hooks.set = (values, raw) => {
        Object.assign(raw, copy(values));
        if (values[Workspaces.RESTORE_TRANSACTION_KEY]?.status === 'prepared') throw Error('Synthetic lost acknowledgement');
    };
    await assert.rejects(target.store.restore(review, {confirmed: true}), error => error.code === 'UNCONFIRMED');
    assert.equal(target.raw[Workspaces.RESTORE_TRANSACTION_KEY].status, 'prepared');
    delete target.hooks.set;
    return target;
}
async function prepared() {
    const target = await interrupt(await synthetic('target'));
    // Fresh managers have no old identity or review ticket after reconstruction.
    return fixture({persisted: JSON.parse(JSON.stringify(target.raw))});
}

function model(f, workspaceId) {
    const calls = {reads: 0, removes: 0, providerReads: 0, providerWrites: 0, providerRemoves: 0, opened: [], errors: [], assignments: [], timers: []};
    const read = f.chrome.storage.local.get;
    f.chrome.storage.local.get = (...args) => { calls.reads++; return read(...args); };
    f.chrome.storage.local.remove = async () => { calls.removes++; throw Error('Unexpected removal'); };
    f.chrome.storage.sync = {
        async get() { calls.providerReads++; throw Error('Unexpected provider read'); },
        async set() { calls.providerWrites++; throw Error('Unexpected provider write'); },
        async remove() { calls.providerRemoves++; throw Error('Unexpected provider remove'); }
    };
    f.chrome.runtime = {getURL: file => 'chrome-extension://synthetic/' + file,
        openOptionsPage() { throw Error('Navigation must retain its exact workspace destination'); }};
    const session = f.workspaceManager.capture(workspaceId), storageManager = new StorageManager({workspace: session});
    assert.equal(storageManager.getAll, StorageManager.prototype.getAll);
    assert.equal(storageManager.ensureSyncInitialized, StorageManager.prototype.ensureSyncInitialized);
    const document = createDocument({aggregateTextContent: true});
    const settings = document.createElement('button'); settings.id = 'open-options'; settings.className = 'settings-button';
    const categories = document.createElement('button'); categories.id = 'manage-categories'; categories.className = 'category-manage-btn';
    const switcher = document.createElement('section'); switcher.id = 'workspace-switcher'; switcher.className = 'workspace-bar';
    const recovery = document.createElement('a'); recovery.className = 'spaces-manage'; recovery.href = 'recovery.html'; recovery.target = '_blank'; recovery.rel = 'noopener';
    recovery.textContent = 'Inspect saved copies (read-only)'; switcher.append(recovery);
    const draft = document.createElement('input'); draft.value = 'Synthetic unchanged page query';
    document.body.append(categories, switcher, settings, draft);
    const window = {document, chrome: f.chrome, LocalItabWorkspaces: {manager: f.workspaceManager, session},
        addEventListener() {}, removeEventListener() {},
        open(...args) { calls.opened.push(args); return null; },
        location: {href: 'chrome-extension://synthetic/newtab.html' + (workspaceId ? '?workspace=' + encodeURIComponent(workspaceId) : ''), assign: url => calls.assignments.push(url)}};
    const ctx = {window, document, chrome: f.chrome, storageManager, URL,
        console: {log() {}, warn() {}, error(...args) { calls.errors.push(args); }},
        setTimeout(fn, delay) { calls.timers.push({fn, delay}); return calls.timers.length; }, clearTimeout() {}};
    vm.createContext(ctx);
    vm.runInContext(source('shared/workspaces-view.js'), ctx);
    vm.runInContext(source('newtab.js'), ctx);
    const effects = () => ({reads: calls.reads, writes: f.writes.length, removes: calls.removes,
        providerReads: calls.providerReads, providerWrites: calls.providerWrites, providerRemoves: calls.providerRemoves});
    return {f, calls, session, storageManager, document, settings, categories, switcher, recovery, draft, window, ctx, effects,
        async start() {
            // Both production DOM-ready listeners run. Banner cleanup and the
            // separate 100ms CategoryNavigation task are recorded, not assumed
            // to perform no I/O later. Navigation assertions use a fresh baseline.
            await document.listeners.get('DOMContentLoaded')({type: 'DOMContentLoaded'});
        },
        close() { window.workspacesView?.destroy(); }};
}

function unchanged(m, before, writes = 0) {
    assert.deepEqual(m.f.raw, before);
    assert.equal(m.f.writes.length, writes);
    assert.deepEqual([m.calls.removes, m.calls.providerReads, m.calls.providerWrites, m.calls.providerRemoves], [0, 0, 0, 0]);
}
function destinations(m, start = 0) {
    const actual = m.calls.opened.slice(start);
    assert.equal(actual.length, 2, 'two explicit clicks must each open their intended Settings destination once');
    for (const [index, args] of actual.entries()) {
        const [destination, target, features] = args, url = new URL(destination);
        assert.equal(url.protocol, 'chrome-extension:'); assert.equal(url.host, 'synthetic'); assert.equal(url.pathname, '/options.html');
        const expectedWorkspace = m.session.id || m.session.requestedId || null;
        assert.equal(url.searchParams.get('workspace'), expectedWorkspace, 'keep the captured identity or the explicitly requested workspace');
        assert.deepEqual([...url.searchParams.keys()], expectedWorkspace ? ['workspace'] : [], 'workspace occupies one encoded query parameter');
        assert.equal(url.hash, index === 0 ? '' : '#category-settings');
        assert.equal(target, '_blank'); assert.equal(features, 'noopener');
    }
}

for (const workspaceId of ['default', 'work']) test(`${workspaceId}: prepared restore leaves explicit dashboard Settings/category navigation reachable and read-only`, async t => {
    const m = model(await prepared(), workspaceId); t.after(() => m.close()); const before = copy(m.f.raw);
    assert.equal(m.session.id, null, 'do not fake an already-loaded workspace');
    assert.equal(m.session.requestedId, workspaceId);
    await m.start();
    assert(m.calls.errors.some(args => args[0] === 'Error in initializeDashboard:' && args[1]?.code === 'WORKSPACE_RESTORE_PENDING'), 'the actual getAll startup path must hit the real restore fence');
    assert.equal(m.calls.opened.length, 0, 'startup cannot open Settings automatically');
    assert.equal(m.calls.assignments.length, 0);
    assert(m.calls.reads > 0, 'production startup reads are counted, not treated as navigation side effects');
    assert(m.calls.timers.some(timer => timer.delay === 100), 'the other production startup listener remains scheduled');
    assert.equal(m.recovery.href, 'recovery.html'); assert(m.recovery.isConnected && m.recovery.getClientRects().length);
    const manage = m.switcher.querySelectorAll('a').find(link => link.textContent === 'Manage workspaces');
    assert(manage?.getClientRects().length, 'the separate Manage workspaces exit remains available');
    assert.equal(new URL(manage.href).hash, '#workspace-settings');
    unchanged(m, before);
    const startupEffects = m.effects(), draft = m.draft.value;
    m.settings.focus(); m.settings.dispatch('click');
    m.categories.focus(); m.categories.dispatch('click');
    destinations(m);
    assert.deepEqual(m.effects(), startupEffects, 'only explicit navigation is required to add no storage I/O');
    assert.equal(m.draft.value, draft); assert.equal(m.document.activeElement, m.categories);
    unchanged(m, before);

    await m.start();
    assert.equal(m.calls.opened.length, 2, 'a repeated startup must not automatically navigate');
    assert.equal(m.settings.listeners.get('click')?.length, 1);
    assert.equal(m.categories.listeners.get('click')?.length, 1);
    const repeatedEffects = m.effects();
    m.settings.dispatch('click'); m.categories.dispatch('click'); destinations(m, 2);
    assert.deepEqual(m.effects(), repeatedEffects, 'repeat startup cannot make clicks perform I/O or duplicate navigation');
    unchanged(m, before);

    await assert.rejects(m.storageManager.setAll({quote: 'Synthetic blocked replacement'}), error => error.code === 'WORKSPACE_RESTORE_PENDING');
    assert.equal(m.f.raw[Workspaces.RESTORE_TRANSACTION_KEY].status, 'prepared');
    const report = await m.f.store.inspectInterruptedRestore(); assert(report.pending && report.canRecover);
    unchanged(m, before);
});

test('a genuinely captured workspace stays the navigation target after another workspace becomes last used', async t => {
    const f = await synthetic('target'), m = model(f); t.after(() => m.close());
    await m.session.ready(); assert.equal(m.session.id, 'work');
    await f.workspaceManager.select('default');
    assert.equal(f.raw[Workspaces.REGISTRY_KEY].lastUsedId, 'default');
    await interrupt(f);
    const before = copy(f.raw), writes = f.writes.length;
    await m.start(); assert.equal(m.calls.opened.length, 0);
    assert(m.calls.errors.some(args => args[0] === 'Error in initializeDashboard:' && args[1]?.code === 'WORKSPACE_RESTORE_PENDING'));
    const baseline = m.effects(); m.settings.dispatch('click'); m.categories.dispatch('click');
    destinations(m); assert.deepEqual(m.effects(), baseline);
    assert.equal(new URL(m.calls.opened[0][0]).searchParams.get('workspace'), 'work');
    unchanged(m, before, writes);
});

for (const workspaceId of [undefined, 'default', 'work']) test(`${workspaceId || 'unrequested'}: early explicit navigation uses only available identity while the first real startup read is pending`, async t => {
    const m = model(await prepared(), workspaceId); t.after(() => m.close()); const before = copy(m.f.raw);
    const gate = deferred(), entered = deferred();
    m.f.hooks.read = async (keys, raw) => {
        entered.resolve(); await gate.promise;
        return copy(keys === null ? raw : Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]])));
    };
    const loading = m.start();
    try {
        await entered.promise;
        assert.equal(m.session.requestedId, workspaceId); assert.equal(m.session.id, null, 'the real Session has not captured its identity yet');
        assert.equal(m.calls.opened.length, 0, 'even early binding must not navigate automatically');
        const baseline = m.effects(); m.settings.dispatch('click'); m.categories.dispatch('click');
        destinations(m); assert.deepEqual(m.effects(), baseline); unchanged(m, before);
        if (workspaceId === undefined) assert.equal(new URL(m.calls.opened[0][0]).search, '', 'no captured/requested identity means no guessed Default parameter');
    } finally { gate.resolve(); await loading; delete m.f.hooks.read; }
    assert(m.calls.errors.some(args => args[0] === 'Error in initializeDashboard:' && args[1]?.code === 'WORKSPACE_RESTORE_PENDING'));
    assert.equal(m.calls.opened.length, 2, 'finishing startup cannot repeat the explicit navigation'); unchanged(m, before);
});

for (const [id, expected] of [['removed', 'WORKSPACE_DELETED'], ['missing_workspace', 'WORKSPACE_NOT_FOUND']]) test(`${id}: navigation retains the rejected requested ID without creating a workspace or falling back to Default`, async t => {
    const m = model(fixture(), id); t.after(() => m.close()); const before = copy(m.f.raw);
    await m.start(); assert.equal(m.calls.opened.length, 0);
    assert(m.calls.errors.some(args => args[0] === 'Error in initializeDashboard:' && args[1]?.code === expected));
    const baseline = m.effects(); m.settings.dispatch('click'); m.categories.dispatch('click');
    destinations(m); assert.deepEqual(m.effects(), baseline);
    // The destination retains the original Session admission error. URL routing
    // does not create identities, repair storage, or admit a deleted workspace.
    const destination = new StorageManager({workspace: m.f.workspaceManager.capture(id)});
    await assert.rejects(destination.getAll(), error => error.code === expected);
    unchanged(m, before);
});

test('empty and malformed workspace IDs remain rejected by the real Session constructor', () => {
    const f = fixture(), before = copy(f.raw);
    for (const id of ['', 'work&workspace=default', 'work#category-settings', 'synthetic named workspace']) {
        assert.throws(() => f.workspaceManager.capture(id), error => error.code === 'WORKSPACE_NOT_FOUND');
    }
    assert.deepEqual(f.raw, before); assert.equal(f.writes.length, 0);
});

test('the production URL helper encodes its workspace into one parameter without admitting an invalid identity', t => {
    const m = model(fixture()); t.after(() => m.close()); const before = copy(m.f.raw), baseline = m.effects();
    const text = 'synthetic named & workspace#fragment';
    // Test serialization directly, not a fake Session carrying an illegal ID.
    const url = new URL(m.window.LocalItabWorkspacesView.settingsUrl(text, 'category-settings'));
    assert.equal(url.searchParams.get('workspace'), text);
    assert.deepEqual([...url.searchParams.keys()], ['workspace']);
    assert.equal(url.hash, '#category-settings');
    assert.throws(() => m.f.workspaceManager.capture(text), error => error.code === 'WORKSPACE_NOT_FOUND');
    assert.equal(m.calls.opened.length, 0); assert.deepEqual(m.effects(), baseline); unchanged(m, before);
});

test('dashboard fixture uses the production static Settings/category buttons and independent recovery link', () => {
    const html = source('newtab.html');
    assert.match(html, /<button id="open-options" class="settings-button/);
    assert.match(html, /<button id="manage-categories" class="category-manage-btn/);
    assert.match(html, /<a class="spaces-manage" href="recovery\.html" target="_blank" rel="noopener"/);
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map(match => match[1]);
    const workspaceIndex = scripts.findIndex(attrs => /src="shared\/workspaces-view\.js"/.test(attrs));
    const dashboardIndex = scripts.findIndex(attrs => /src="newtab\.js"/.test(attrs));
    assert(workspaceIndex >= 0 && dashboardIndex > workspaceIndex, 'the real workspace navigation API loads before early newtab binding');
    for (const index of [workspaceIndex, dashboardIndex]) {
        assert(!/\b(?:async|defer)\b/i.test(scripts[index]), 'navigation dependencies remain synchronous classic scripts');
        assert(!/\btype\s*=\s*["']module["']/i.test(scripts[index]), 'module/deferred ordering is not the current startup contract');
    }
});
