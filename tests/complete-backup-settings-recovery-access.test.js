'use strict';
// Production Settings startup, StorageManager, Backup Store/View and lifecycle.
// The only boundaries replaced are DOM/events, RAM Chrome storage/locks, and
// downloads/reload. Store's constructor is bound to those real fixture backends;
// getAll(), ensureSyncInitialized() and recovery transactions are never stubbed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const StorageManager = require('../storage.js');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const {synthetic, fixture, accepted, Backup, Workspaces, Prompts, Collections, copy} = require('./helpers/complete-backup-acceptance');
const source = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
async function until(predicate) {
    const deadline = Date.now() + 2000;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1));
    assert(predicate(), 'expected production recovery UI state to settle');
}

async function interrupted() {
    const incoming = await synthetic('source'), target = await synthetic('target');
    const preview = await target.store.review(await incoming.store.export(), null, accepted);
    target.hooks.set = (values, raw) => {
        Object.assign(raw, copy(values));
        if (values[Workspaces.RESTORE_TRANSACTION_KEY]?.status === 'prepared') throw Error('Synthetic lost acknowledgement');
    };
    await assert.rejects(target.store.restore(preview, {confirmed: true}), error => error.code === 'UNCONFIRMED');
    assert.equal(target.raw[Workspaces.RESTORE_TRANSACTION_KEY].status, 'prepared');
    // Reconstruct all managers and tickets from persisted JSON, as after restart.
    return fixture({persisted: JSON.parse(JSON.stringify(target.raw))});
}

function model(f, workspaceId = 'work', {mountWorkspaces = false, tabsAvailable = true, unrequested = false, simulateDepartureCancellation = false} = {}) {
    const calls = {mounts: [], stores: [], downloads: [], reloads: 0, fileReads: 0,
        localReads: 0, localRemoves: 0, providerReads: 0, providerWrites: 0, providerRemoves: 0,
        reviews: 0, exports: 0, restores: 0, inspections: 0, recoveries: 0,
        recoveryDownloads: 0, recoverySettled: 0, candidateExports: 0, readKeys: [], errors: [],
        tabQueries: [], currentTabRequests: 0, activeTabId: 42, tabUpdates: [], locationAssignments: [], confirmations: 0, cancelledDepartures: 0};
    const read = f.chrome.storage.local.get;
    f.chrome.storage.local.get = (...args) => { calls.localReads++; calls.readKeys.push(copy(args[0])); return read(...args); };
    f.chrome.storage.local.remove = async () => { calls.localRemoves++; throw Error('Unexpected local remove'); };
    f.chrome.storage.sync = {
        async get() { calls.providerReads++; throw Error('Unexpected Sync read'); },
        async getBytesInUse() { calls.providerReads++; throw Error('Unexpected Sync quota read'); },
        async set() { calls.providerWrites++; throw Error('Unexpected Sync write'); },
        async remove() { calls.providerRemoves++; throw Error('Unexpected Sync remove'); }
    };
    const chromeListeners = new Set();
    f.chrome.storage.onChanged = {addListener: fn => chromeListeners.add(fn), removeListener: fn => chromeListeners.delete(fn)};
    f.chrome.runtime = {getURL: file => 'chrome-extension://synthetic/' + file};
    if (tabsAvailable) f.chrome.tabs = {
        getCurrent(callback) { calls.currentTabRequests++; callback({id: 17}); },
        query(query, callback) { calls.tabQueries.push(copy(query)); callback([{id: calls.activeTabId}]); },
        update(id, changes) { calls.tabUpdates.push({id, ...copy(changes)}); }
    };
    const requestedId = unrequested ? undefined : workspaceId;
    const manager = new StorageManager({workspace: f.workspaceManager.capture(requestedId)});
    assert.equal(manager.getAll, StorageManager.prototype.getAll);
    assert.equal(manager.ensureSyncInitialized, StorageManager.prototype.ensureSyncInitialized);
    const document = createDocument({blurUnavailableFocus: true, aggregateTextContent: true});
    // Local primitives for production notices and their normal toast cleanup.
    Object.defineProperty(Object.getPrototypeOf(document.body), 'parentNode', {get() { return this.parentElement; }});
    document.body.removeChild = function(node) { node.remove(); return node; };
    document.body.prepend = function(node) { node.parentElement = this; this.children.unshift(node); };
    const skip = document.createElement('a'); skip.className = 'skip-link'; skip.textContent = 'Skip to settings';
    // Reflect this anchor's href like the browser, whether production assigns
    // the property or attribute. The shared small DOM does not do URL reflection.
    Object.defineProperty(skip, 'href', {get() { return this.getAttribute('href'); }, set(value) { this.setAttribute('href', value); }});
    skip.href = '#settings-search-input'; document.body.append(skip);
    const container = document.createElement('div'); container.className = 'options-container';
    container.prepend = document.body.prepend;
    const header = document.createElement('header'); header.className = 'options-header';
    const headerTop = document.createElement('div'); headerTop.className = 'header-top';
    const back = document.createElement('button'); back.id = 'back-to-dashboard'; back.className = 'back-button'; back.textContent = 'Back to Dashboard';
    headerTop.append(back); header.append(headerTop);
    const main = document.createElement('main'); main.className = 'options-main';
    const normalHost = document.createElement('div'); normalHost.id = 'complete-backup';
    const controls = ['input', 'textarea', 'select', 'button'].map(tag => document.createElement(tag));
    controls[0].id = 'quote-text'; controls[1].id = 'world-clock-label';
    const searchSection = document.createElement('section'); searchSection.id = 'settings-search'; searchSection.className = 'settings-search';
    const searchControls = document.createElement('div'); searchControls.className = 'settings-search-controls';
    const searchInput = document.createElement('input'); searchInput.id = 'settings-search-input'; searchInput.type = 'search';
    searchControls.append(searchInput); searchSection.append(searchControls);
    // The real category editor must mount even when tests edit another field:
    // production records its clean baseline only after both these nodes exist.
    const categorySection = document.createElement('section'); categorySection.id = 'category-settings';
    const categoryList = document.createElement('ul'); categoryList.id = 'category-manage-list'; categoryList.className = 'category-manage-list';
    const addCategory = document.createElement('button'); addCategory.id = 'add-category'; addCategory.type = 'button'; addCategory.textContent = 'Add Category';
    categorySection.append(categoryList, addCategory);
    main.append(searchSection, ...controls, categorySection, normalHost);
    const switcher = document.createElement('div'); switcher.id = 'workspace-switcher';
    const selectWorkspace = document.createElement('select'); switcher.append(selectWorkspace);
    // Match options.html: footer is a sibling, never a descendant of main.
    const footer = document.createElement('footer'); footer.className = 'options-footer';
    const footerActions = document.createElement('div'); footerActions.className = 'footer-actions';
    const save = document.createElement('button'); save.id = 'save-settings';
    const reset = document.createElement('button'); reset.id = 'reset-settings';
    footerActions.append(save, reset); footer.append(footerActions);
    header.append(switcher); container.append(header, main, footer); document.body.append(container);
    const handlers = new Map();
    const window = {LocalItabPrompts: Prompts, LocalItabAICollections: Collections,
        location: {reload() { calls.reloads++; }}, confirm() { calls.confirmations++; throw Error('Unexpected confirmation'); },
        addEventListener(type, fn) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); },
        removeEventListener(type, fn) { handlers.get(type)?.delete(fn); }};
    let pageUrl = 'chrome-extension://synthetic/options.html' + (requestedId === undefined ? '' : '?workspace=' + encodeURIComponent(requestedId));
    const initialUrl = pageUrl;
    Object.defineProperty(window.location, 'href', {get() { return pageUrl; }, set(value) {
        calls.locationAssignments.push(value);
        const destination = new URL(value, pageUrl).href;
        // Optional model of a browser honoring the real beforeunload guard and
        // the user choosing Stay. This does not claim Chrome always shows it.
        if (simulateDepartureCancellation) {
            const event = {preventDefault() { this.prevented = true; }};
            for (const fn of handlers.get('beforeunload') || []) fn(event);
            if (event.prevented) { calls.cancelledDepartures++; return; }
        }
        pageUrl = destination;
    }});
    if (mountWorkspaces) {
        Object.assign(window, {document, chrome: f.chrome, LocalItabWorkspaces: {manager: f.workspaceManager, session: manager.workspace}});
    }
    let sequence = 0;
    class BoundStore extends Backup.Store {
        constructor(storage) {
            super(storage, Backup.createBackend(storage, f.chrome, f.locks), {workspaceManager: f.workspaceManager, id: () => `recovery_test_${++sequence}`});
            calls.stores.push(this);
        }
        review(...args) { calls.reviews++; return super.review(...args); }
        export(...args) { calls.exports++; return super.export(...args); }
        restore(...args) { calls.restores++; return super.restore(...args); }
        inspectInterruptedRestore(...args) { calls.inspections++; return super.inspectInterruptedRestore(...args); }
        recoverInterruptedRestore(...args) { calls.recoveries++; return super.recoverInterruptedRestore(...args); }
        recovery(...args) { calls.recoveryDownloads++; return super.recovery(...args).finally(() => { calls.recoverySettled++; }); }
        exportInterruptedCandidates(...args) { calls.candidateExports++; return super.exportInterruptedCandidates(...args); }
    }
    window.LocalItabCompleteBackup = {...Backup, Store: BoundStore};
    const timers = new Set(), timerCallbacks = new Map();
    const ctx = {window, document, storageManager: manager, chrome: f.chrome, URL, Blob, console: {log() {}, error(...args) { calls.errors.push(args); }, warn() {}},
        setTimeout(fn, ms) { const timer = setTimeout(fn, ms); timers.add(timer); timerCallbacks.set(timer, {fn, ms}); return timer; }, clearTimeout};
    vm.createContext(ctx);
    vm.runInContext(source('shared/complete-backup-view.js'), ctx);
    const mount = window.LocalItabCompleteBackupView.mount;
    window.LocalItabCompleteBackupView.mount = (host, options) => {
        calls.mounts.push({host, options});
        return mount(host, {...options, download: async (...args) => { calls.downloads.push(args); }});
    };
    vm.runInContext(source('shared/local-content-lifecycle.js'), ctx);
    if (mountWorkspaces) vm.runInContext(source('shared/workspaces-view.js'), ctx);
    vm.runInContext(source('options.js'), ctx);
    const get = name => document.getElementById('interrupted-settings-recovery')?.querySelector('.complete-backup-' + name);
    const dispatchWindow = (type, event = {}) => { for (const fn of handlers.get(type) || []) fn(event); };
    const listenerCount = () => [...handlers.values()].reduce((sum, set) => sum + set.size, 0) + chromeListeners.size;
    return {f, calls, ctx, window, manager, document, initialUrl, skip, searchInput, container, main, footer, save, reset, back, normalHost, switcher, controls: [...controls, searchInput, addCategory, selectWorkspace, save, reset],
        get, dispatchWindow, listenerCount, get view() { return window.interruptedSettingsRecoveryView; },
        async start() { await document.listeners.get('DOMContentLoaded')({type: 'DOMContentLoaded'}); },
        expireTimers(ms) { for (const [timer, task] of timerCallbacks) if (task.ms <= ms) { clearTimeout(timer); timerCallbacks.delete(timer); task.fn(); } },
        close() { this.view?.destroy(); window.workspacesView?.destroy(); for (const timer of timers) clearTimeout(timer); }};
}

function isolated(m, {initialized = false} = {}) {
    assert.equal(m.main.parentElement, m.footer.parentElement, 'footer models the real sibling layout');
    assert.equal(m.main.contains(m.footer), false);
    for (const root of [m.main, m.footer, m.switcher]) {
        assert.equal(root.hidden, true, 'ordinary Settings and workspace selection stay hidden');
        assert.equal(root.inert, true, 'ordinary Settings and workspace selection stay inert');
    }
    for (const control of m.controls) assert.equal(control.disabled, true, 'unloaded ordinary controls must be disabled');
    if (!initialized) {
        assert.equal(m.controls[0].value, '', 'failed initialization must not populate an editable default');
        assert.equal(m.window.completeBackupView, undefined, 'ordinary Backup view is never mounted');
        assert.equal(m.window.settingsFormView, undefined, 'ordinary Settings handlers are never initialized');
        assert.equal(m.normalHost.children.length, 0);
    }
    const host = m.document.getElementById('interrupted-settings-recovery');
    assert(host?.isConnected && !host.hidden && !host.closest('[inert]'), 'recovery is reachable outside isolated Settings');
    assert.equal(host.parentElement, m.container, 'recovery stays in the real options layout above the page backdrop');
    assert.equal(m.container.hidden, false); assert.equal(m.container.inert, false);
    for (const name of ['recovery', 'download-interrupted']) {
        assert.equal(m.get(name).hidden, false, 'recovery downloads remain visible');
        assert(m.get(name).getClientRects().length > 0, 'recovery downloads have visible layout');
    }
}
function noProviderEffects(m) {
    assert.deepEqual([m.calls.providerReads, m.calls.providerWrites, m.calls.providerRemoves, m.calls.localRemoves], [0, 0, 0, 0]);
}
function unchanged(m, before, writes = 0) {
    assert.deepEqual(m.f.raw, before, 'all persisted bytes remain unchanged');
    assert.equal(m.f.writes.length, writes, 'no implicit local writes'); noProviderEffects(m);
}
async function inspected(m) {
    m.get('inspect-interrupted').dispatch('click');
    await until(() => !m.get('recover-interrupted').hidden && !m.get('recover-interrupted').disabled);
}
function ordinaryEvents(m) {
    const file = m.get('file');
    file.files = [{size: 2, text: async () => { m.calls.fileReads++; return '{}'; }}];
    file.dispatch('change');
    for (const name of ['export', 'choose', 'apply', 'select-all', 'clear-selection', 'large', 'download-export']) m.get(name).dispatch('click');
    for (const control of m.document.getElementById('interrupted-settings-recovery').querySelectorAll('[data-module]')) {
        control.checked = !control.checked; control.dispatch('change');
    }
    for (const name of ['target', 'prompt-target', 'collection-target']) { m.get(name).value = 'synthetic'; m.get(name).dispatch('change'); }
}

test('limited recovery startup API rejects unrelated errors outside its explicit allowlist', async t => {
    const m = model(fixture()); t.after(() => m.close());
    assert.equal(typeof m.ctx.setupInterruptedSettingsRecovery, 'function');
    const before = copy(m.f.raw), listeners = m.listenerCount();
    for (const error of [null, new Error('Synthetic failure'), ...['WORKSPACE_CORRUPT', 'WORKSPACE_CONFLICT', 'WORKSPACE_INVALID', 'WORKSPACE_READ', 'WORKSPACE_WRITE', 'WORKSPACE_UNAVAILABLE', 'WORKSPACE_VERSION_EXTRA', 'WORKSPACE_RESTORE_PENDING_EXTRA', 'UNCONFIRMED'].map(code => ({code}))]) {
        assert.equal(await m.ctx.setupInterruptedSettingsRecovery(error), false);
    }
    assert.equal(m.calls.mounts.length, 0); assert.equal(m.listenerCount(), listeners);
    assert.equal(m.document.getElementById('interrupted-settings-recovery'), null);
    assert.equal(m.main.hidden, false); assert.equal(m.main.inert, false); unchanged(m, before);
});

test('ordinary Settings startup keeps the first Skip link pointing to the reachable search input', async t => {
    const html = source('options.html');
    assert.match(html, /<body>\s*<a class="skip-link" href="#settings-search-input">/);
    const m = model(fixture()); t.after(() => m.close()); const before = copy(m.f.raw);
    // Ordinary startup also reports quota. Supply the RAM boundary in this
    // offline-provider case; recovery tests keep Sync available and fenced.
    m.f.chrome.storage.local.getBytesInUse = async () => 0;
    delete m.f.chrome.storage.sync;
    assert.equal(m.document.body.children[0], m.skip);
    await m.start();
    assert(m.window.settingsFormView, 'normal production initialization must finish');
    assert.equal(m.view, undefined);
    assert.equal(m.skip.getAttribute('href'), '#settings-search-input');
    assert.equal(m.searchInput.disabled, undefined);
    assert(m.searchInput.getClientRects().length && !m.searchInput.closest('[inert]'));
    m.searchInput.focus(); assert.equal(m.document.activeElement, m.searchInput);
    assert.equal(await m.ctx.setupInterruptedSettingsRecovery({code: 'WORKSPACE_CORRUPT'}), false);
    assert.equal(m.skip.getAttribute('href'), '#settings-search-input'); unchanged(m, before);
});

for (const workspaceId of ['default', 'work']) test(`${workspaceId}: recovery Skip link targets one focusable recovery host through repeat entry and cancel`, async t => {
    const m = model(await interrupted(), workspaceId); t.after(() => m.close()); const before = copy(m.f.raw);
    assert.equal(m.skip.getAttribute('href'), '#settings-search-input');
    await m.start(); assert(m.view, 'production startup must expose recovery');
    const host = m.document.getElementById('interrupted-settings-recovery');
    assert.equal(m.document.body.children[0], m.skip, 'Skip remains the first page element');
    assert.equal(m.skip.getAttribute('href'), '#interrupted-settings-recovery');
    assert.equal(host.tabIndex, -1);
    assert.equal(host._tabIndex, -1, 'the host explicitly opts into programmatic focus');
    assert.equal(m.searchInput.disabled, true);
    assert.equal(m.searchInput.getClientRects().length, 0);
    host.focus(); assert.equal(m.document.activeElement, host);
    m.searchInput.focus(); assert.equal(m.document.activeElement, host, 'the old search target stays isolated');
    const domListenerCount = () => [m.skip, host, ...host.querySelectorAll('*')].reduce((total, node) => total + [...node.listeners.values()].reduce((sum, listeners) => sum + listeners.length, 0), 0);
    const counts = {reads: m.calls.localReads, listeners: m.listenerCount(), domListeners: domListenerCount()};
    const view = m.view;
    await m.ctx.setupInterruptedSettingsRecovery({code: 'WORKSPACE_RESTORE_PENDING'});
    await m.ctx.setupInterruptedSettingsRecovery({code: 'WORKSPACE_RESTORE_PENDING'});
    assert.equal(m.view, view); assert.equal(m.calls.mounts.length, 1);
    assert.equal(m.document.querySelectorAll('#interrupted-settings-recovery').length, 1);
    assert.equal(m.calls.localReads, counts.reads, 'retargeting Skip cannot reread saved data');
    assert.equal(m.listenerCount(), counts.listeners); assert.equal(domListenerCount(), counts.domListeners);
    await inspected(m); const readsAfterInspection = m.calls.localReads;
    m.get('cancel-interrupted').dispatch('click');
    assert.equal(m.skip.getAttribute('href'), '#interrupted-settings-recovery');
    assert.equal(m.document.querySelector(m.skip.getAttribute('href')), host);
    host.focus(); assert.equal(m.document.activeElement, host);
    assert.equal(m.calls.localReads, readsAfterInspection, 'cancel and focus do not touch storage');
    isolated(m); unchanged(m, before);
});

for (const workspaceId of ['default', 'work']) test(`${workspaceId}: real startup fence exposes one isolated read-only recovery view without Sync or default edits`, async t => {
    const m = model(await interrupted(), workspaceId); t.after(() => m.close());
    const before = copy(m.f.raw);
    await assert.rejects(m.ctx.initializeOptionsPage(), error => error.code === 'WORKSPACE_RESTORE_PENDING');
    assert.equal(m.calls.mounts.length, 0); unchanged(m, before);
    await m.start();
    assert(m.view, 'DOMContentLoaded must expose recovery after the real getAll rejection');
    isolated(m); unchanged(m, before);
    assert.equal(m.calls.mounts.length, 1); assert.equal(m.calls.stores.length, 1);
    assert.equal(m.calls.mounts[0].options.recoveryOnly, true);
    assert(m.calls.stores[0] instanceof Backup.Store);
    const view = m.view, listeners = m.listenerCount();
    await m.ctx.setupInterruptedSettingsRecovery({code: 'WORKSPACE_RESTORE_PENDING'});
    await m.ctx.setupInterruptedSettingsRecovery({code: 'WORKSPACE_RESTORE_PENDING'});
    assert.equal(m.view, view); assert.equal(m.calls.mounts.length, 1); assert.equal(m.listenerCount(), listeners);
    assert.equal(m.document.querySelectorAll('#interrupted-settings-recovery').length, 1);
    assert.equal(m.get('inspect-interrupted').listeners.get('click').length, 1);
    await inspected(m); assert(m.calls.inspections >= 1); unchanged(m, before);
    m.get('cancel-interrupted').dispatch('click'); ordinaryEvents(m); await tick();
    isolated(m); unchanged(m, before);
    for (const name of ['export', 'choose', 'file', 'apply']) assert.equal(m.get(name).disabled, true, `${name} cannot be revived by cancel/events`);
    assert.equal(m.get('modules').hidden, true); assert.equal(m.get('actions').hidden, true);
    // Exercise recoveryOnly event guards independently of disabled rendering:
    // synthetic events must not turn hidden ordinary controls into authority.
    for (const name of ['export', 'choose', 'file', 'apply', 'select-all', 'clear-selection', 'large', 'download-export', 'target', 'prompt-target', 'collection-target']) m.get(name).disabled = false;
    for (const input of m.document.getElementById('interrupted-settings-recovery').querySelectorAll('[data-module]')) input.disabled = false;
    ordinaryEvents(m); await tick(); m.view.cancel();
    assert.deepEqual([m.calls.fileReads, m.calls.reviews, m.calls.exports, m.calls.restores, m.calls.recoveries], [0, 0, 0, 0, 0]);
    isolated(m); unchanged(m, before);
    for (const name of ['recovery', 'download-interrupted']) {
        m.get(name).dispatch('click'); await until(() => !m.view.pending);
        assert.equal(m.calls.downloads.length, name === 'recovery' ? 1 : 2);
        assert.doesNotThrow(() => JSON.parse(m.calls.downloads.at(-1)[0]));
        assert(!m.calls.downloads.at(-1)[0].includes('SECRET_PROVIDER'));
        assert(!m.calls.downloads.at(-1)[0].includes('SECRET_AUTH'));
        isolated(m); unchanged(m, before);
    }
});

test('late pending restore isolates the sibling footer even after real initialization attached Save and Reset listeners', async t => {
    const pending = await interrupted(), f = await synthetic('target');
    // A separate production transaction's persisted result arrives only after
    // this page has read its ordinary Settings and attached the real listeners.
    const m = model(f); t.after(() => m.close()); const priorWrites = f.writes.length;
    const expectedQuote = f.values('work').quote;
    const status = m.document.createElement('div'); status.id = 'cloud-sync-status'; m.main.append(status);
    let reachedLateStartup = false, pendingBefore;
    f.chrome.storage.local.getBytesInUse = async () => {
        reachedLateStartup = true;
        assert(m.window.settingsFormView, 'production populateFormFields finished');
        assert(m.window.completeBackupView, 'ordinary Backup mounted before the late failure');
        assert.equal(m.save.listeners.get('click')?.length, 1, 'production setupEventListeners attached Save');
        assert.equal(m.reset.listeners.get('click')?.length, 1, 'production setupEventListeners attached Reset');
        assert.equal(m.document.getElementById('quote-text').value, expectedQuote);
        assert.equal(m.footer.hidden, false);
        for (const key of Object.keys(f.raw)) delete f.raw[key];
        Object.assign(f.raw, copy(pending.raw)); pendingBefore = copy(f.raw);
        // The error still originates in the real restore fence. displayStorageInfo
        // catches its first read error; the following real renderSyncStatus call
        // reaches the same pending fence and triggers the DOMContentLoaded catch.
        await f.workspaceManager.assertRestoreSettled();
        assert.fail('pending fixture must remain fenced');
    };
    await m.start();
    assert.equal(reachedLateStartup, true, 'test must not pass through an early initialization failure');
    assert(m.view, 'the later Sync-status failure must expose recovery');
    assert.equal(m.calls.mounts.length, 2, 'one ordinary view and one isolated recovery view');
    assert.equal(m.calls.mounts[0].options.recoveryOnly, undefined);
    assert.equal(m.calls.mounts[1].options.recoveryOnly, true);
    isolated(m, {initialized: true}); unchanged(m, pendingBefore, priorWrites);
    assert.equal(m.document.getElementById('quote-text').value, expectedQuote, 'loaded values are retained, never reset to defaults');
    // Native activation cannot reach disabled, inert or hidden controls. The
    // tiny DOM's raw dispatch intentionally bypasses those browser semantics.
    for (const control of [m.save, m.reset]) {
        assert.equal(control.getClientRects().length, 0);
        control.focus(); assert.notEqual(m.document.activeElement, control);
        assert(control.disabled && control.closest('[inert]'));
        assert.equal(control.listeners.get('click').length, 1, 'the test retains the already attached real listener');
    }
    m.get('inspect-interrupted').dispatch('click');
    await until(() => !m.get('recover-interrupted').disabled);
    m.get('cancel-interrupted').dispatch('click');
    isolated(m, {initialized: true}); unchanged(m, pendingBefore, priorWrites);
});

test('queued recovery rechecks current ownership and real page-local draft guards before invoking Store', async t => {
    const m = model(await interrupted()); t.after(() => m.close()); await m.start();
    assert(m.view, 'recovery view must be mounted'); const before = copy(m.f.raw);
    const {store, recoverInterruptedRestore} = m.calls.mounts[0].options;
    for (const reason of ['cancelled', 'draft']) {
        const report = await store.inspectInterruptedRestore(), gate = deferred(); let current = true;
        const waiting = m.ctx.queueSettingsWrite(() => gate.promise);
        const attempt = recoverInterruptedRestore(report, () => current);
        const rejected = assert.rejects(attempt, error => error.code === (reason === 'cancelled' ? 'CANCELLED' : 'DIRTY'));
        if (reason === 'cancelled') current = false;
        else m.window.localScratchpadSettingsView = {hasUncommittedWork: () => true};
        gate.resolve(); await waiting; await rejected;
        delete m.window.localScratchpadSettingsView;
        assert.equal(m.calls.recoveries, 0); isolated(m); unchanged(m, before);
    }
});

test('a real field draft appearing during portable recovery validation blocks the first repair write', async t => {
    const m = model(await interrupted()); t.after(() => m.close()); await m.start();
    assert(m.view, 'recovery view must be mounted'); const before = copy(m.f.raw);
    const {store, recoverInterruptedRestore} = m.calls.mounts[0].options;
    const report = await store.inspectInterruptedRestore(), gate = deferred(); let entered = false;
    m.f.hooks.read = async (keys, raw) => {
        if (Array.isArray(keys) && keys.includes(Backup.WORKSPACE_RECOVERY_KEY)) { entered = true; await gate.promise; }
        return copy(keys === null ? raw : Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]])));
    };
    const attempt = recoverInterruptedRestore(report, () => true);
    const rejected = assert.rejects(attempt, error => error.code === 'CANCELLED');
    await until(() => entered);
    m.document.getElementById('world-clock-label').value = 'Synthetic newer page-local draft';
    gate.resolve(); await rejected; delete m.f.hooks.read;
    assert.equal(m.calls.recoveries, 1, 'production Store performs portable recovery validation');
    assert.equal(m.document.getElementById('world-clock-label').value, 'Synthetic newer page-local draft');
    isolated(m); unchanged(m, before);
});

test('recovery participates in lifecycle guards and only explicit verified recovery enables Reload, never ordinary controls', async t => {
    const m = model(await interrupted()); t.after(() => m.close()); await m.start();
    assert(m.view, 'recovery view must be mounted'); await inspected(m);
    const life = m.window.LocalItabContentLifecycle;
    assert.equal(life.hasUncommittedWork(), true);
    const departure = {preventDefault() { this.prevented = true; }};
    m.dispatchWindow('beforeunload', departure); assert.equal(departure.prevented, true);
    const gate = deferred(); let entered = false;
    m.f.hooks.set = async (values, raw) => { entered = true; await gate.promise; Object.assign(raw, copy(values)); };
    m.get('recover-interrupted').dispatch('click'); m.get('recover-interrupted').dispatch('click');
    await until(() => entered);
    assert.equal(m.calls.recoveries, 1); assert.equal(life.pending(), true);
    await assert.rejects(life.waitForPending({timeout: 0}), error => error.code === 'WORKSPACE_BUSY');
    assert.equal(m.calls.reloads, 0); isolated(m); noProviderEffects(m);
    gate.resolve(); await until(() => !m.view.pending && !m.get('reload').hidden);
    delete m.f.hooks.set;
    assert.equal(m.f.raw[Workspaces.RESTORE_TRANSACTION_KEY].status, 'recovered');
    assert.equal(m.f.writes.length, 2, 'only the two production verified recovery writes occurred');
    assert.match(m.get('status').textContent, /restored and verified/i);
    assert.equal(life.pending(), false); assert.equal(life.hasUncommittedWork(), false);
    const recovered = copy(m.f.raw); ordinaryEvents(m); m.view.cancel(); await tick();
    isolated(m); unchanged(m, recovered, 2); assert.equal(m.calls.reloads, 0);
    assert.equal(m.get('reload').hidden, false, 'cancel cannot erase the explicit Reload path');
    m.get('reload').dispatch('click'); assert.equal(m.calls.reloads, 1);
});

let completedRestore;
async function damagedSettings(kind) {
    if (!completedRestore) completedRestore = (async () => {
        const incoming = await synthetic('source'), target = await synthetic('target');
        await target.store.restore(await target.store.review(await incoming.store.export(), null, accepted), {confirmed: true});
        return {raw: JSON.parse(JSON.stringify(target.raw)), partial: await incoming.store.export(['scratchpad'])};
    })();
    const saved = await completedRestore, raw = copy(saved.raw);
    if (kind === 'registry schema 99') raw[Workspaces.REGISTRY_KEY].schemaVersion = 99;
    else {
        const id = kind === 'missing Default bundle' ? 'default' : 'removed';
        delete raw[Workspaces.bundleKey(raw[Workspaces.REGISTRY_KEY].workspaces.find(entry => entry.id === id))];
    }
    return {...fixture({persisted: raw}), recoverySource: raw[Backup.WORKSPACE_RECOVERY_KEY].source, partialArchive: saved.partial};
}

function downloadOnlyIsolation(m) {
    for (const area of [m.main, m.footer, m.switcher]) {
        assert.equal(area.hidden, true, 'ordinary Settings must be hidden after a structural startup failure');
        assert.equal(area.inert, true);
    }
    for (const control of m.controls) assert.equal(control.disabled, true);
    assert.equal(m.normalHost.children.length, 0); assert.equal(m.window.completeBackupView, undefined);
    assert.equal(m.window.settingsFormView, undefined);
    const host = m.document.getElementById('interrupted-settings-recovery');
    assert(host?.getClientRects().length && !host.closest('[inert]'));
    assert.equal(host.parentElement, m.container); assert.equal(m.container.hidden, false); assert.equal(m.container.inert, false);
    assert.equal(m.skip.getAttribute('href'), '#interrupted-settings-recovery');
    assert.equal(host.tabIndex, -1); host.focus(); assert.equal(m.document.activeElement, host);
    assert(m.get('recovery').getClientRects().length && !m.get('recovery').disabled);
    assert.deepEqual(host.querySelectorAll('button').filter(button => button.getClientRects().length), [m.get('recovery')], 'only the validated retained-copy download is offered');
    const visibleText = host.querySelectorAll('p').filter(node => node.getClientRects().length).map(node => node.textContent).join(' ');
    assert.match(visibleText, /can contain private notes|keep.*private/i);
    assert.match(visibleText, /does not diagnose or resolve.*upgrade data.loss incident/i);
    assert.doesNotMatch(visibleText, /Use Inspect interrupted restore|then choose that JSON file here/i, 'download-only guidance must not suggest a hidden import or repair action');
    for (const name of ['download-interrupted', 'inspect-interrupted', 'recover-interrupted', 'reload']) {
        assert.equal(m.get(name).hidden, true, `${name} is not offered in download-only mode`);
        assert.equal(m.get(name).disabled, true, `${name} is disabled in download-only mode`);
    }
}

async function rejectDownloadOnlyEvents(m) {
    const before = copy(m.f.raw), reads = m.calls.localReads, downloads = m.calls.downloads.length;
    // Raw synthetic events deliberately bypass native hidden/disabled behavior;
    // force-enabled controls still cannot acquire mutation or inspection rights.
    for (const name of ['export', 'choose', 'file', 'apply', 'select-all', 'clear-selection', 'large', 'download-export', 'target', 'prompt-target', 'collection-target', 'download-interrupted', 'inspect-interrupted', 'recover-interrupted', 'reload']) m.get(name).disabled = false;
    for (const input of m.document.getElementById('interrupted-settings-recovery').querySelectorAll('[data-module]')) input.disabled = false;
    ordinaryEvents(m);
    for (const name of ['download-interrupted', 'inspect-interrupted', 'recover-interrupted', 'reload', 'cancel-interrupted']) m.get(name).dispatch('click');
    await tick(); m.view.cancel();
    assert.deepEqual([m.calls.fileReads, m.calls.reviews, m.calls.exports, m.calls.restores, m.calls.inspections, m.calls.recoveries, m.calls.candidateExports, m.calls.reloads], [0, 0, 0, 0, 0, 0, 0, 0]);
    assert.equal(m.calls.localReads, reads); assert.equal(m.calls.downloads.length, downloads);
    downloadOnlyIsolation(m); unchanged(m, before);
}

for (const damage of ['missing Default bundle', 'missing Trash bundle', 'registry schema 99']) test(`${damage}: real Work Settings failure preserves an isolated download-only route to the verified root recovery copy`, async t => {
    const f = await damagedSettings(damage), m = model(f, 'work', {mountWorkspaces: true}); t.after(() => m.close());
    const before = copy(f.raw), expectedError = damage === 'registry schema 99' ? 'WORKSPACE_VERSION' : 'WORKSPACE_BUNDLE_MISSING';
    await m.start();
    assert(m.calls.errors.some(args => args.some(error => error?.code === expectedError)), 'real StorageManager must reject the structurally damaged registry/bundle while requesting intact Work');
    assert.equal(m.calls.downloads.length, 0); assert.equal(m.calls.recoveryDownloads, 0); assert.equal(m.calls.reloads, 0);
    assert(!m.calls.readKeys.some(keys => keys === null || keys.includes(Backup.WORKSPACE_RECOVERY_KEY)), 'startup must not read or validate the retained copy before the explicit download');
    unchanged(m, before);
    assert(m.view, 'structural startup errors need a limited retained-copy download entry');
    downloadOnlyIsolation(m);
    assert.equal(m.calls.mounts.length, 1); assert.equal(m.calls.mounts[0].options.downloadOnly, true);
    const view = m.view, listeners = m.listenerCount(), reads = m.calls.localReads;
    assert.equal(m.ctx.setupInterruptedSettingsRecovery({code: expectedError}), true);
    assert.equal(m.ctx.setupInterruptedSettingsRecovery({code: 'WORKSPACE_RESTORE_PENDING'}), true);
    assert.equal(m.view, view); assert.equal(m.calls.mounts.length, 1); assert.equal(m.listenerCount(), listeners); assert.equal(m.calls.localReads, reads);
    downloadOnlyIsolation(m); // A later pending report cannot expand this view's authority.
    const readsBeforeDownload = m.calls.readKeys.length;
    m.get('recovery').dispatch('click'); await until(() => !m.view.pending);
    assert.equal(m.calls.downloads.length, 1); assert.equal(m.calls.recoveryDownloads, 1);
    assert.equal(m.calls.downloads[0][0], f.recoverySource, 'download the exact fully validated retained source');
    assert.deepEqual(m.calls.readKeys.slice(readsBeforeDownload), [[Backup.WORKSPACE_RECOVERY_KEY]], 'download independently reads only the root retained copy');
    assert.doesNotThrow(() => Backup.parse(m.calls.downloads[0][0], m.manager));
    assert(!m.calls.downloads[0][0].includes('SECRET_PROVIDER')); assert(!m.calls.downloads[0][0].includes('SECRET_AUTH'));
    downloadOnlyIsolation(m); unchanged(m, before);
    await rejectDownloadOnlyEvents(m);
});

test('download-only view forces ordinary-operation isolation even without the caller setting recoveryOnly', async t => {
    const m = model(await damagedSettings('missing Trash bundle')); t.after(() => m.close()); const before = copy(m.f.raw);
    // Directly exercise the production View option, independently of Options
    // also passing recoveryOnly. Only mounting/downloads use the existing hook.
    const host = m.document.createElement('section'); host.id = 'interrupted-settings-recovery'; m.container.append(host);
    const store = new m.window.LocalItabCompleteBackup.Store(m.manager);
    m.window.interruptedSettingsRecoveryView = m.window.LocalItabCompleteBackupView.mount(host, {store, downloadOnly: true, recoveryOnly: false});
    assert.equal(m.get('modules').hidden, true); assert.equal(m.get('actions').hidden, true);
    for (const name of ['export', 'choose', 'file', 'apply', 'select-all', 'clear-selection', 'large', 'download-export', 'target', 'prompt-target', 'collection-target', 'download-interrupted', 'inspect-interrupted', 'recover-interrupted', 'reload']) {
        assert.equal(m.get(name).disabled, true); m.get(name).disabled = false;
    }
    ordinaryEvents(m);
    for (const name of ['download-interrupted', 'inspect-interrupted', 'recover-interrupted', 'reload']) m.get(name).dispatch('click');
    await tick(); m.view.cancel();
    assert.deepEqual([m.calls.fileReads, m.calls.reviews, m.calls.exports, m.calls.restores, m.calls.inspections, m.calls.recoveries, m.calls.candidateExports, m.calls.reloads, m.calls.localReads, m.calls.downloads.length], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    unchanged(m, before);
});

test('download-only startup refuses invalid or missing retained copies without claiming download success', async t => {
    const f = await damagedSettings('missing Trash bundle'), m = model(f, 'work', {mountWorkspaces: true}); t.after(() => m.close());
    await m.start(); assert(m.view, 'real damaged startup must expose the download-only view');
    const retained = copy(f.raw[Backup.WORKSPACE_RECOVERY_KEY]);
    const variants = [
        ['checksum mismatch', {...copy(retained), checksum: '0'.repeat(64)}],
        ['unsupported archive', {source: '{}', checksum: await m.manager.fingerprint('{}')}],
        ['partial archive', {source: f.partialArchive, checksum: await m.manager.fingerprint(f.partialArchive)}],
        ['extra envelope field', {...copy(retained), unexpected: true}],
        ['missing copy', null]
    ];
    for (const [label, saved] of variants) {
        if (saved) f.raw[Backup.WORKSPACE_RECOVERY_KEY] = saved; else delete f.raw[Backup.WORKSPACE_RECOVERY_KEY];
        const before = copy(f.raw), reads = m.calls.readKeys.length;
        m.get('recovery').dispatch('click'); await until(() => !m.view.pending);
        assert.equal(m.calls.downloads.length, 0, `${label}: invalid data must never reach the download boundary`);
        assert.match(m.get('status').textContent, /no valid.*recovery copy/i, label);
        assert.doesNotMatch(m.get('status').textContent, /download requested|restored and verified/i, label);
        // Store.recovery has an existing read-only V1 compatibility lookup only
        // when V2 is absent. Invalid V2 must never fall through to another copy.
        assert.deepEqual(m.calls.readKeys.slice(reads), saved ? [[Backup.WORKSPACE_RECOVERY_KEY]] : [[Backup.WORKSPACE_RECOVERY_KEY], [Backup.RECOVERY_KEY]], label);
        downloadOnlyIsolation(m); unchanged(m, before);
    }
    assert.equal(m.calls.recoveryDownloads, variants.length);
    assert.deepEqual([m.calls.inspections, m.calls.recoveries, m.calls.candidateExports, m.calls.reloads], [0, 0, 0, 0]);
});

test('a real unrelated storage read failure does not enter structural retained-copy mode', async t => {
    const m = model(fixture(), 'work', {mountWorkspaces: true}); t.after(() => m.close()); const before = copy(m.f.raw);
    m.f.hooks.read = async () => { throw Error('Synthetic unrelated storage read failure'); };
    await m.start();
    assert(m.calls.errors.some(args => args.some(error => error?.code === 'WORKSPACE_READ')));
    assert.equal(m.view, undefined); assert.equal(m.calls.mounts.length, 0);
    assert.equal(m.document.getElementById('interrupted-settings-recovery'), null);
    assert.equal(m.main.hidden, false); assert.equal(m.main.inert, true, 'unloaded ordinary form is isolated without granting recovery authority');
    assert.equal(m.calls.recoveryDownloads, 0); assert.equal(m.calls.downloads.length, 0); unchanged(m, before);
});

for (const departure of ['cancel', 'destroy']) test(`${departure}: a late validated retained-copy read cannot download or reclaim focus after leaving download-only review`, async t => {
    const m = model(await damagedSettings('missing Default bundle'), 'work', {mountWorkspaces: true}); t.after(() => m.close());
    await m.start(); assert(m.view); const before = copy(m.f.raw), gate = deferred(); let entered = false;
    m.f.hooks.read = async (keys, raw) => {
        if (keys.includes(Backup.WORKSPACE_RECOVERY_KEY)) { entered = true; await gate.promise; }
        return copy(Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]])));
    };
    const status = m.get('status'), reads = m.calls.readKeys.length;
    m.get('recovery').focus(); m.get('recovery').dispatch('click');
    try {
        await until(() => entered); assert.equal(m.view.pending, true);
        if (departure === 'cancel') m.view.cancel(); else assert.equal(m.view.destroy(), true);
        const other = m.document.createElement('button'); other.textContent = 'Synthetic newer focus owner'; m.container.append(other); other.focus();
        const statusAfterDeparture = status.textContent;
        gate.resolve(); await until(() => m.calls.recoverySettled === 1); await tick();
        assert.equal(m.calls.downloads.length, 0); assert.equal(m.document.activeElement, other);
        assert.equal(status.textContent, statusAfterDeparture, 'late validation cannot publish new feedback');
        assert.deepEqual(m.calls.readKeys.slice(reads), [[Backup.WORKSPACE_RECOVERY_KEY]]);
        assert.equal(m.calls.recoveryDownloads, 1); assert.equal(m.calls.recoveries, 0); assert.equal(m.calls.reloads, 0);
        for (const area of [m.main, m.footer, m.switcher]) assert(area.hidden && area.inert);
        for (const control of m.controls) assert.equal(control.disabled, true);
        if (departure === 'cancel') downloadOnlyIsolation(m);
        unchanged(m, before);
    } finally { gate.resolve(); delete m.f.hooks.read; }
});

function noDashboardNavigation(m) {
    assert.deepEqual([m.calls.currentTabRequests, m.calls.tabQueries.length, m.calls.tabUpdates.length, m.calls.locationAssignments.length], [0, 0, 0, 0], 'loading Settings must never request navigation');
}
function blockedDashboard(m, {count = 0} = {}) {
    assert.deepEqual([m.calls.currentTabRequests, m.calls.tabQueries.length, m.calls.tabUpdates.length], [0, 0, 0]);
    assert.equal(m.calls.locationAssignments.length, count, 'unfinished work must not request Back navigation');
    const notice = m.document.querySelectorAll('.message-error').at(-1);
    assert(notice?.getClientRects().length && !notice.closest('[inert]'), 'blocked Back explains the next step outside isolated Settings');
    assert.equal(notice.getAttribute('role'), 'alert');
    assert.match(notice.textContent, /finish.*current action.*cancel.*review.*save or discard.*drafts/i);
    assert.equal(m.calls.confirmations, 0, 'Back never asks to discard unfinished work');
    assert.equal(m.window.LocalItabContentLifecycle.departing, false, 'Back never pre-authorizes departure');
}
function dashboardDestination(m, {count = 1, workspaceId = 'work'} = {}) {
    assert.deepEqual([m.calls.tabQueries.length, m.calls.currentTabRequests, m.calls.tabUpdates.length], [0, 0, 0], 'Back navigates only this page, without selecting or updating any browser tab');
    assert.equal(m.calls.locationAssignments.length, count, 'one explicit click requests one current-page navigation');
    assert.equal(new URL(m.initialUrl).pathname, '/options.html');
    for (const destination of m.calls.locationAssignments) {
        const url = new URL(destination, m.initialUrl);
        assert.equal(url.protocol, 'chrome-extension:'); assert.equal(url.host, 'synthetic'); assert.equal(url.pathname, '/newtab.html');
        assert.equal(url.searchParams.get('workspace'), workspaceId);
        assert.deepEqual([...url.searchParams.keys()], ['workspace']); assert.equal(url.hash, '');
    }
}

test('Back to Dashboard waits for an open recovery review to be cancelled without retiring or confirming it', async t => {
    const m = model(await interrupted(), 'work', {mountWorkspaces: true}); t.after(() => m.close()); const before = copy(m.f.raw);
    await m.start(); assert(m.view); isolated(m); noDashboardNavigation(m);
    assert.equal(m.manager.workspace.id, 'work');
    assert(m.back.getClientRects().length && !m.back.disabled && !m.back.closest('[inert]'));
    const gate = deferred(); let entered = false;
    m.f.hooks.read = async (keys, raw) => {
        entered = true; await gate.promise;
        return copy(keys === null ? raw : Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]])));
    };
    m.get('inspect-interrupted').dispatch('click');
    try {
        await until(() => entered);
        assert.equal(m.document.getElementById('interrupted-settings-recovery').querySelector('.complete-backup').getAttribute('aria-busy'), 'true');
        assert.equal(m.view.pending, false, 'a real Inspect read is not exposed as a write-pending phase');
        const reads = m.calls.localReads;
        m.back.dispatch('click'); blockedDashboard(m);
        assert.equal(m.calls.localReads, reads); unchanged(m, before);
    } finally { gate.resolve(); delete m.f.hooks.read; }
    await until(() => !m.get('recover-interrupted').hidden && !m.get('recover-interrupted').disabled);
    assert.equal(m.window.LocalItabContentLifecycle.hasUncommittedWork(), true);
    const reads = m.calls.localReads, view = m.view;
    m.back.focus(); m.back.dispatch('click'); blockedDashboard(m);
    assert.equal(m.calls.localReads, reads, 'Back navigation must not read or repair protected storage');
    assert.equal(m.view, view); assert.equal(m.view.hasUncommittedWork(), true);
    assert.equal(m.window.LocalItabContentLifecycle.departing, false, 'navigation cannot pre-authorize departure or discard reviews');
    const departure = {preventDefault() { this.prevented = true; }};
    m.dispatchWindow('beforeunload', departure); assert.equal(departure.prevented, true, 'the real native-departure guard remains registered');
    assert.equal(m.calls.confirmations, 0);
    m.get('cancel-interrupted').dispatch('click'); assert.equal(m.view.hasUncommittedWork(), false);
    m.back.dispatch('click'); dashboardDestination(m);
    assert.equal(m.calls.localReads, reads); assert.equal(m.window.LocalItabContentLifecycle.departing, false);
    unchanged(m, before);
});

test('Back to Dashboard keeps requested Work without tabs APIs after real structural startup fails before identity capture', async t => {
    const m = model(await damagedSettings('missing Default bundle'), 'work', {mountWorkspaces: true, tabsAvailable: false}); t.after(() => m.close()); const before = copy(m.f.raw);
    await m.start(); assert(m.view); downloadOnlyIsolation(m); noDashboardNavigation(m);
    assert.equal(m.manager.workspace.id, null); assert.equal(m.manager.workspace.requestedId, 'work');
    assert(m.back.getClientRects().length && !m.back.closest('[inert]'));
    const reads = m.calls.localReads; m.back.dispatch('click'); dashboardDestination(m);
    assert.equal(m.calls.localReads, reads); assert.equal(m.calls.recoveryDownloads, 0); unchanged(m, before);
});

test('Back to Dashboard waits for the first real startup read, then preserves Work after protected startup fails', async t => {
    const m = model(await interrupted(), 'work', {mountWorkspaces: true}); t.after(() => m.close()); const before = copy(m.f.raw);
    const gate = deferred(), entered = deferred();
    m.f.hooks.read = async (keys, raw) => {
        entered.resolve(); await gate.promise;
        return copy(keys === null ? raw : Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]])));
    };
    const loading = m.start();
    try {
        await entered.promise; noDashboardNavigation(m);
        assert.equal(m.manager.workspace.id, null); assert.equal(m.manager.workspace.requestedId, 'work');
        assert.throws(() => m.f.workspaceManager.capture('work&workspace=default'), error => error.code === 'WORKSPACE_NOT_FOUND', 'identity fallback retains real Session token validation');
        const reads = m.calls.localReads;
        m.back.dispatch('click'); blockedDashboard(m);
        assert.equal(m.calls.confirmations, 0); assert.equal(m.window.LocalItabContentLifecycle.departing, false);
        assert.equal(m.calls.localReads, reads); unchanged(m, before);
    } finally { gate.resolve(); await loading; delete m.f.hooks.read; }
    assert(m.view, 'real getAll still reaches its pending restore fence after the read resumes');
    noDashboardNavigation(m); m.back.dispatch('click'); dashboardDestination(m); unchanged(m, before);
});

test('Back to Dashboard binds once across repeated ordinary Settings startup and never navigates before a click', async t => {
    assert.match(source('options.html'), /<div class="header-top">\s*<button id="back-to-dashboard" class="back-button"/);
    const m = model(fixture(), 'work', {mountWorkspaces: true}); t.after(() => m.close()); const before = copy(m.f.raw);
    m.f.chrome.storage.local.getBytesInUse = async () => 0; delete m.f.chrome.storage.sync;
    await m.start(); assert(m.window.settingsFormView); noDashboardNavigation(m);
    await m.start(); assert(m.window.settingsFormView); noDashboardNavigation(m);
    assert.equal(m.document.getElementById('category-manage-list').dataset.categoryBound, 'true', 'the real category editor initializes its baseline');
    assert.equal(m.ctx.bookmarkCategoryFormClean(), true);
    assert.equal(m.window.settingsFormView.hasUncommittedWork(), false, 'complete ordinary form starts clean');
    assert.equal(m.back.listeners.get('click')?.length, 1, 'repeated startup must not duplicate the Back handler');
    const reads = m.calls.localReads; m.back.dispatch('click'); dashboardDestination(m);
    const quote = m.document.getElementById('quote-text'), savedQuote = quote.value; quote.value = 'Synthetic newer unsaved quote';
    assert.equal(m.window.settingsFormView.hasUncommittedWork(), true, 'use a real form draft and its production dirty-path comparison');
    m.back.dispatch('click'); blockedDashboard(m, {count: 1});
    assert.equal(quote.value, 'Synthetic newer unsaved quote'); assert.equal(m.window.settingsFormView.hasUncommittedWork(), true);
    assert.equal(m.window.LocalItabContentLifecycle.departing, false);
    const departure = {preventDefault() { this.prevented = true; }};
    m.dispatchWindow('beforeunload', departure); assert.equal(departure.prevented, true);
    assert.equal(m.calls.confirmations, 0);
    quote.value = savedQuote; assert.equal(m.window.settingsFormView.hasUncommittedWork(), false);
    m.back.dispatch('click'); dashboardDestination(m, {count: 2});
    assert.equal(m.calls.localReads, reads); unchanged(m, before);
});

test('Back to Dashboard blocks during a real recovery download and only navigates after it settles cleanly', async t => {
    const m = model(await interrupted(), 'work', {mountWorkspaces: true}); t.after(() => m.close()); const before = copy(m.f.raw);
    await m.start(); assert(m.view); noDashboardNavigation(m);
    const gate = deferred(); let entered = false;
    m.f.hooks.read = async (keys, raw) => {
        if (keys.includes(Backup.WORKSPACE_RECOVERY_KEY)) { entered = true; await gate.promise; }
        return copy(Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]])));
    };
    m.get('recovery').dispatch('click');
    try {
        await until(() => entered); const reads = m.calls.localReads;
        assert.equal(m.view.pending, true); assert.equal(m.window.LocalItabContentLifecycle.pending(), true);
        m.back.dispatch('click'); blockedDashboard(m);
        assert.equal(m.view.pending, true, 'Back must not cancel or settle the current action');
        assert.equal(m.window.LocalItabContentLifecycle.departing, false);
        const departure = {preventDefault() { this.prevented = true; }};
        m.dispatchWindow('beforeunload', departure); assert.equal(departure.prevented, true);
        assert.equal(m.calls.confirmations, 0); assert.equal(m.calls.localReads, reads); unchanged(m, before);
        gate.resolve(); await until(() => m.calls.recoverySettled === 1 && !m.view.pending); await tick();
        assert.equal(m.calls.downloads.length, 1); assert.equal(m.view.hasUncommittedWork(), false);
        m.back.dispatch('click'); dashboardDestination(m);
        assert.equal(m.calls.confirmations, 0); assert.equal(m.window.LocalItabContentLifecycle.departing, false); unchanged(m, before);
    } finally { gate.resolve(); delete m.f.hooks.read; }
});

test('Back to Dashboard targets its own page even when another tab is active and tabs APIs are available', async t => {
    const m = model(await interrupted(), 'work', {mountWorkspaces: true}); t.after(() => m.close()); const before = copy(m.f.raw);
    await m.start(); assert(m.view); noDashboardNavigation(m);
    // An active-tab query would return another page (99), while getCurrent
    // would itself be asynchronous. Neither API belongs in current-page routing.
    m.calls.activeTabId = 99;
    m.f.chrome.tabs.getCurrent = () => { m.calls.currentTabRequests++; };
    const reads = m.calls.localReads;
    m.back.dispatch('click'); dashboardDestination(m);
    assert.equal(m.calls.localReads, reads); assert.equal(m.calls.confirmations, 0); unchanged(m, before);
});

test('Back to Dashboard keeps the real captured Work identity after the last-used workspace changes', async t => {
    const m = model(fixture(), 'work', {mountWorkspaces: true, unrequested: true}); t.after(() => m.close());
    assert.equal(m.manager.workspace.id, null); assert.equal(m.manager.workspace.requestedId, undefined);
    m.f.chrome.storage.local.getBytesInUse = async () => 0; delete m.f.chrome.storage.sync;
    await m.start(); assert(m.window.settingsFormView); assert.equal(m.manager.workspace.id, 'work');
    await m.f.workspaceManager.select('default'); await tick();
    assert.equal(m.f.raw[Workspaces.REGISTRY_KEY].lastUsedId, 'default');
    const before = copy(m.f.raw), writes = m.f.writes.length, reads = m.calls.localReads;
    noDashboardNavigation(m); m.back.dispatch('click'); dashboardDestination(m);
    assert.equal(m.calls.localReads, reads); unchanged(m, before, writes);
});

test('an independent ordinary departure can still be cancelled by the modeled browser without discarding a real Settings draft', async t => {
    const m = model(fixture(), 'work', {mountWorkspaces: true, simulateDepartureCancellation: true}); t.after(() => m.close()); const before = copy(m.f.raw);
    m.f.chrome.storage.local.getBytesInUse = async () => 0; delete m.f.chrome.storage.sync;
    await m.start(); assert(m.window.settingsFormView); noDashboardNavigation(m);
    const originalUrl = m.window.location.href, quote = m.document.getElementById('quote-text');
    quote.value = 'Synthetic draft retained after choosing Stay';
    assert.equal(m.window.settingsFormView.hasUncommittedWork(), true);
    const reads = m.calls.localReads;
    // This is an independent browser departure, not the guarded Back action.
    // Preserve the existing beforeunload model without treating it as a safety
    // guarantee for programmatic Back navigation.
    m.window.location.href = 'newtab.html?workspace=work'; dashboardDestination(m);
    assert.equal(m.calls.cancelledDepartures, 1); assert.equal(m.window.location.href, originalUrl);
    assert.equal(quote.value, 'Synthetic draft retained after choosing Stay');
    assert.equal(m.window.settingsFormView.hasUncommittedWork(), true);
    assert.equal(m.window.LocalItabContentLifecycle.departing, false); assert.equal(m.calls.confirmations, 0);
    assert.equal(m.calls.localReads, reads); unchanged(m, before);
});

for (const failure of ['invalid Work quote', 'unrelated local read']) test(`${failure}: an early real Settings failure disables unloaded form controls without widening recovery access`, async t => {
    const f = fixture();
    if (failure === 'invalid Work quote') f.values('work').quote = 42;
    const m = model(f, 'work', {mountWorkspaces: true}); t.after(() => m.close()); const before = copy(f.raw);
    if (failure === 'unrelated local read') f.hooks.read = async () => { throw Error('Synthetic early unrelated read failure'); };
    const expectedCode = failure === 'invalid Work quote' ? 'WORKSPACE_CORRUPT' : 'WORKSPACE_READ';
    const label = m.document.getElementById('world-clock-label'); label.value = 'Synthetic displayed value before loading';
    const originalLabel = label.value;
    await m.start();
    assert(m.calls.errors.some(args => args.some(error => error?.code === expectedCode)), 'the real startup error remains observable');
    assert.equal(m.window.settingsFormView, undefined, 'the failed startup never installed form draft ownership');
    assert.equal(m.window.completeBackupView, undefined); assert.equal(m.view, undefined);
    assert.equal(m.calls.mounts.length, 0); assert.equal(m.document.getElementById('interrupted-settings-recovery'), null);
    assert.equal(m.save.listeners.get('click')?.length || 0, 0, 'Save is uninitialized, not a successful no-op save');
    noDashboardNavigation(m);
    const notice = m.document.getElementById('settings-unloaded-notice');
    assert(notice?.getClientRects().length && !notice.closest('[inert]'));
    assert.equal(notice.getAttribute('role'), 'alert');
    assert.equal(m.skip.getAttribute('href'), '#settings-unloaded-notice', 'Skip must bypass the disabled search field');
    assert.equal(notice.tabIndex, -1); assert.equal(notice._tabIndex, -1, 'the notice explicitly accepts programmatic fragment focus');
    assert.equal(m.document.querySelector(m.skip.getAttribute('href')), notice);
    notice.focus(); assert.equal(m.document.activeElement, notice);
    assert.match(notice.textContent, /defaults or incomplete.*not a verified copy.*editing and saving are unavailable/i);
    assert.equal(m.container.hidden, false); assert.equal(m.container.inert, false);
    assert.equal(label.value, originalLabel, 'failure isolation preserves displayed values without claiming they were loaded');
    await m.start();
    assert.equal(m.document.getElementById('settings-unloaded-notice'), notice);
    assert.equal(m.document.querySelectorAll('#settings-unloaded-notice').length, 1, 'repeated failure does not duplicate the persistent notice');
    assert.equal(m.skip.getAttribute('href'), '#settings-unloaded-notice');
    assert.equal(m.back.listeners.get('click')?.length, 1);
    m.expireTimers(3000);
    assert.equal(m.document.querySelectorAll('.message-error').length, 0, 'the real transient error toasts expired');
    assert(notice.isConnected && notice.getClientRects().length, 'unloaded-form warning outlives toast cleanup');
    noDashboardNavigation(m);
    const reads = m.calls.localReads;
    // Model native input only when the control can actually receive it. Direct
    // script assignments to disabled controls are not browser user input.
    label.focus();
    if (m.document.activeElement === label && !label.disabled && !label.closest('[inert]')) {
        label.value = 'Synthetic unprotected early draft'; label.dispatch('input');
    }
    assert.equal(m.calls.localReads, reads); assert.equal(m.calls.confirmations, 0); unchanged(m, before);
    assert.equal(label.value, originalLabel, 'a failed, unloaded form must not accept an unowned draft');
    for (const area of [m.main, m.footer]) {
        assert.equal(area.hidden, false); assert.equal(area.inert, true);
        for (const control of area.querySelectorAll('input, textarea, select, button')) {
            assert.equal(control.disabled, true, 'every unloaded ordinary form control is disabled');
            control.focus(); assert.notEqual(m.document.activeElement, control);
        }
    }
    m.back.focus(); assert.equal(m.document.activeElement, m.back, 'the safe page exit remains outside isolated form areas');
    m.back.dispatch('click'); dashboardDestination(m);
    assert.equal(m.calls.localReads, reads); assert.equal(m.calls.confirmations, 0);
    assert.equal(m.calls.recoveryDownloads, 0); assert.equal(m.calls.restores, 0); assert.equal(m.calls.recoveries, 0);
    unchanged(m, before);
});

test('an unrelated late startup read failure preserves initialized form drafts and their lifecycle guard', async t => {
    const f = fixture(), m = model(f, 'work', {mountWorkspaces: true}); t.after(() => m.close()); const before = copy(f.raw);
    delete f.chrome.storage.sync;
    const status = m.document.createElement('div'); status.id = 'cloud-sync-status'; m.main.append(status);
    const quote = m.document.getElementById('quote-text');
    let reachedLateStartup = false, form;
    f.chrome.storage.local.getBytesInUse = async () => {
        reachedLateStartup = true; form = m.window.settingsFormView;
        assert(form, 'the production form and baseline initialized before the failure');
        assert(m.window.completeBackupView); assert.equal(m.save.listeners.get('click')?.length, 1);
        assert.equal(form.hasUncommittedWork(), false);
        quote.value = 'Synthetic draft before late startup failure'; quote.dispatch('input');
        assert.equal(form.hasUncommittedWork(), true);
        // Only fail the real Chrome read boundary. The following production
        // Sync-status read reaches StorageManager and the startup error handler.
        f.hooks.read = async () => { throw Error('Synthetic late unrelated read failure'); };
        return 0;
    };
    await m.start();
    assert.equal(reachedLateStartup, true);
    assert(m.calls.errors.some(args => args.some(error => error?.code === 'WORKSPACE_READ')));
    assert.equal(m.view, undefined); assert.equal(m.calls.mounts.length, 1, 'unknown errors cannot grant recovery authority');
    assert.equal(m.document.getElementById('settings-unloaded-notice'), null, 'an owned late-stage form is not described as unloaded');
    assert.equal(m.skip.getAttribute('href'), '#settings-search-input', 'the initialized late-failure form keeps its ordinary Skip target');
    assert.equal(m.window.settingsFormView, form); assert.equal(quote.value, 'Synthetic draft before late startup failure');
    assert.equal(m.main.hidden, false); assert.equal(m.main.inert, false); assert.notEqual(quote.disabled, true);
    assert.equal(m.footer.hidden, false); assert.notEqual(m.save.disabled, true);
    assert.equal(m.save.listeners.get('click')?.length, 1, 'the existing ordinary save path remains owned');
    assert.equal(form.hasUncommittedWork(), true); assert.equal(m.window.LocalItabContentLifecycle.hasUncommittedWork(), true);
    noDashboardNavigation(m); const reads = m.calls.localReads;
    m.back.dispatch('click'); blockedDashboard(m);
    const departure = {preventDefault() { this.prevented = true; }};
    m.dispatchWindow('beforeunload', departure); assert.equal(departure.prevented, true);
    assert.equal(quote.value, 'Synthetic draft before late startup failure'); assert.equal(m.calls.localReads, reads);
    unchanged(m, before);
});
