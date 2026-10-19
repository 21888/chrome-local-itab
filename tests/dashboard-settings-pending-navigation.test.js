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

function model(f, workspaceId, {locale} = {}) {
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
    // The real transient-toast timeout uses DOM parentNode/removeChild. Model
    // those locally so advancing its 5000ms cleanup actually removes the toast.
    const elementPrototype = Object.getPrototypeOf(document.body);
    Object.defineProperty(elementPrototype, 'parentNode', {get() { return this.parentElement; }});
    elementPrototype.removeChild = function (child) {
        assert.equal(child.parentElement, this); child.remove(); return child;
    };
    const tabIndex = Object.getOwnPropertyDescriptor(elementPrototype, 'tabIndex');
    Object.defineProperty(elementPrototype, 'tabIndex', {...tabIndex, set(value) {
        tabIndex.set.call(this, value); this.attributes.tabindex = String(value);
    }});
    const skip = document.createElement('a'); skip.className = 'skip-link';
    // Native attributes and properties share values. Reflect only the two
    // properties needed by the real Skip link and production localization.
    Object.defineProperty(skip.dataset, 'i18n', {get() { return skip.getAttribute('data-i18n'); }, set(value) { skip.setAttribute('data-i18n', value); }});
    Object.defineProperty(skip, 'href', {get() { return new URL(skip.getAttribute('href'), 'chrome-extension://synthetic/newtab.html').href; }, set(value) { skip.setAttribute('href', value); }});
    skip.setAttribute('href', '#shortcuts-container'); skip.setAttribute('data-i18n', 'dashboardSkipShortcuts'); skip.textContent = 'Skip to shortcuts';
    const settings = document.createElement('button'); settings.id = 'open-options'; settings.className = 'settings-button';
    const categories = document.createElement('button'); categories.id = 'manage-categories'; categories.className = 'category-manage-btn';
    const switcher = document.createElement('section'); switcher.id = 'workspace-switcher'; switcher.className = 'workspace-bar';
    const recovery = document.createElement('a'); recovery.className = 'spaces-manage'; recovery.href = 'recovery.html'; recovery.target = '_blank'; recovery.rel = 'noopener';
    recovery.textContent = 'Inspect saved copies (read-only)'; switcher.append(recovery);
    const draft = document.createElement('input'); draft.value = 'Synthetic unchanged page query';
    document.body.append(skip, categories, switcher, settings, draft);
    const window = {document, chrome: f.chrome, LocalItabWorkspaces: {manager: f.workspaceManager, session},
        addEventListener() {}, removeEventListener() {},
        open(...args) { calls.opened.push(args); return null; },
        location: {href: 'chrome-extension://synthetic/newtab.html' + (workspaceId ? '?workspace=' + encodeURIComponent(workspaceId) : ''), assign: url => calls.assignments.push(url)}};
    const ctx = {window, document, chrome: f.chrome, storageManager, URL,
        console: {log() {}, warn() {}, error(...args) { calls.errors.push(args); }},
        setTimeout(fn, delay) { calls.timers.push({fn, delay}); return calls.timers.length; }, clearTimeout() {}};
    vm.createContext(ctx);
    if (locale) {
        const messages = JSON.parse(source(`_locales/${locale}/messages.json`));
        f.chrome.i18n = {getMessage: key => messages[key]?.message || ''};
        vm.runInContext(source('i18n.js'), ctx); ctx.i18n = window.i18n;
    }
    vm.runInContext(source('shared/workspaces-view.js'), ctx);
    vm.runInContext(source('newtab.js'), ctx);
    const effects = () => ({reads: calls.reads, writes: f.writes.length, removes: calls.removes,
        providerReads: calls.providerReads, providerWrites: calls.providerWrites, providerRemoves: calls.providerRemoves});
    return {f, calls, session, storageManager, document, skip, settings, categories, switcher, recovery, draft, window, ctx, effects,
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

function pendingStartupError(m) {
    const error = m.calls.errors.find(args => args[0] === 'Error in initializeDashboard:')?.[1];
    assert.equal(error?.code, 'WORKSPACE_RESTORE_PENDING', 'the actual protected getAll, not a stubbed initialization, supplies the pending error');
    return error;
}
function noticeLinks(m, notice, workspaceId) {
    const links = notice.querySelectorAll('a');
    assert.equal(links.length, 2, 'the notice provides Settings and a separate read-only recovery destination');
    assert.equal(notice.querySelectorAll('button,input,select,textarea').length, 0, 'a read-only notice exposes no repair or editing action');
    const byPage = new Map(links.map(link => [new URL(link.href, m.window.location.href).pathname, link]));
    for (const page of ['/options.html', '/recovery.html']) {
        const link = byPage.get(page); assert(link, `missing ${page} destination`);
        const url = new URL(link.href, m.window.location.href);
        assert.equal(url.protocol, 'chrome-extension:'); assert.equal(url.host, 'synthetic');
        assert.equal(url.searchParams.get('workspace'), workspaceId);
        assert.deepEqual([...url.searchParams.keys()], ['workspace']);
        assert.equal(url.hash, ''); assert.equal(link.target, '_blank'); assert.equal(link.rel, 'noopener');
        assert(link.getClientRects().length, 'the native link remains visible');
        assert.equal(link.listeners.get('click')?.length || 0, 0, 'native navigation needs no extra mutation handler');
    }
    assert.match(byPage.get('/recovery.html').textContent, /read.only/i);
    return links;
}
function noticeListeners(m) {
    return [m.document.body, ...m.document.querySelectorAll('*')].reduce((count, node) =>
        count + [...node.listeners.values()].reduce((sum, listeners) => sum + listeners.length, 0), 0);
}
function expireTransientToasts(m) {
    const timers = m.calls.timers.filter(timer => timer.delay === 5000 && !timer.ran);
    assert(timers.length, 'at least the deliberately created real transient toast must be cleaned up');
    for (const timer of timers) { timer.ran = true; timer.fn(); }
    assert.equal(m.document.querySelectorAll('.error-message').length, 0, 'the production 5-second cleanup really removed every transient toast');
}

for (const workspaceId of ['default', 'work']) test(`${workspaceId}: interrupted dashboard startup keeps a persistent read-only recovery notice after transient error cleanup`, async t => {
    const m = model(await prepared(), workspaceId); t.after(() => m.close()); const before = copy(m.f.raw);
    m.draft.focus(); const focused = m.document.activeElement, draft = m.draft.value;
    // Exercise the existing production timeout even if pending handling no
    // longer creates its own generic toast. Do not run unrelated 100ms tasks.
    m.ctx.showErrorMessage('Synthetic transient notification');
    await m.start(); const error = pendingStartupError(m);
    assert.equal(m.calls.opened.length, 0); assert.equal(m.calls.assignments.length, 0);
    assert.equal(m.document.activeElement, focused, 'startup must not steal focus for a notice');
    assert.equal(m.switcher.querySelector('.spaces-load-error').hidden, true,
        'registry/list really succeeded: its own load-error banner did not explain this later protected read failure');
    const notice = m.document.getElementById('dashboard-restore-pending');
    assert(notice, 'the pending error needs its own persistent dashboard notice');
    assert.equal(notice.parentElement, m.switcher); assert.equal(notice.getAttribute('role'), 'alert');
    assert(notice.getClientRects().length); assert.equal(notice.inert, false);
    assert.match(notice.textContent, /(?:interrupted|unverified|pending).{0,80}(?:restore|recovery)|(?:restore|recovery).{0,80}(?:interrupted|unverified|pending)/i);
    assert.match(notice.textContent, /(?:not|haven.t|hasn.t).{0,50}loaded/i, 'unloaded ordinary content is explained');
    assert.match(notice.textContent, /(?:not|doesn.t).{0,70}(?:mean|confirm|prove).{0,70}(?:deleted|lost)/i, 'an empty shell is not presented as evidence of deletion');
    const links = noticeLinks(m, notice, workspaceId), startupEffects = m.effects();
    expireTransientToasts(m);
    assert.equal(m.document.getElementById('dashboard-restore-pending'), notice);
    assert(notice.getClientRects().length, 'the persistent notice survives real 5000ms cleanup');
    assert.deepEqual(m.effects(), startupEffects); unchanged(m, before);

    // The model dispatches handlers but does not pretend to perform the browser's
    // native anchor default action. Its exact encoded destination is checked above.
    for (const link of links) { link.focus(); assert.equal(m.document.activeElement, link); assert.equal(link.dispatch('click').prevented, false); }
    assert.deepEqual(m.effects(), startupEffects, 'notice link clicks must add no local/provider I/O');
    assert.equal(m.calls.opened.length, 0, 'native links need no additional scripted opening');
    const focusedLink = m.document.activeElement, listenerCount = noticeListeners(m), timerCount = m.calls.timers.length;
    m.ctx.showDashboardRestorePending(error);
    assert.equal(m.document.querySelectorAll('#dashboard-restore-pending').length, 1);
    assert.equal(m.document.getElementById('dashboard-restore-pending'), notice);
    assert.deepEqual(m.effects(), startupEffects, 're-reporting the error adds no reads, writes or repair');
    assert.equal(noticeListeners(m), listenerCount); assert.equal(m.calls.timers.length, timerCount);
    assert.equal(m.document.activeElement, focusedLink);
    await m.start(); pendingStartupError(m);
    assert.equal(m.document.querySelectorAll('#dashboard-restore-pending').length, 1);
    assert.equal(m.document.getElementById('dashboard-restore-pending'), notice);
    assert.equal(noticeListeners(m), listenerCount, 'repeated real startup adds neither a notice nor listeners');
    assert.equal(m.settings.listeners.get('click').length, 1); assert.equal(m.categories.listeners.get('click').length, 1);
    assert.equal(m.document.activeElement, focusedLink); assert.equal(m.draft.value, draft);
    assert.equal(m.calls.opened.length, 0); assert.equal(m.calls.assignments.length, 0); unchanged(m, before);
});

test('creating the pending notice from a real protected-read error adds no I/O, timers, listeners, focus change or repair', async t => {
    const m = model(await prepared(), 'work'); t.after(() => m.close()); const before = copy(m.f.raw);
    let pending;
    await assert.rejects(m.storageManager.getAll(), error => { pending = error; return error.code === 'WORKSPACE_RESTORE_PENDING'; });
    m.draft.focus(); const baseline = m.effects(), listeners = noticeListeners(m), timerCount = m.calls.timers.length;
    assert.equal(typeof m.ctx.showDashboardRestorePending, 'function', 'a narrow presentation helper must handle only this proven pending error');
    for (const unrelated of [undefined, new Error('Synthetic unknown error'), {code: 'WORKSPACE_READ'}, {code: 'WORKSPACE_RESTORE_PENDING_EXTRA'}]) {
        assert.equal(m.ctx.showDashboardRestorePending(unrelated), false);
        assert.equal(m.document.getElementById('dashboard-restore-pending'), null);
    }
    m.ctx.showDashboardRestorePending(pending);
    const notice = m.document.getElementById('dashboard-restore-pending'); assert(notice?.getClientRects().length);
    noticeLinks(m, notice, 'work');
    assert.equal(noticeListeners(m), listeners); assert.equal(m.calls.timers.length, timerCount);
    assert.deepEqual(m.effects(), baseline, 'creating the notice is presentation only, with no additional storage access');
    assert.equal(m.document.activeElement, m.draft); assert.equal(m.calls.opened.length, 0); assert.equal(m.calls.assignments.length, 0);
    assert.equal(m.f.raw[Workspaces.RESTORE_TRANSACTION_KEY].status, 'prepared'); unchanged(m, before);
});

test('a genuine unrelated Chrome read failure never receives interrupted-restore instructions', async t => {
    const m = model(fixture(), 'work'); t.after(() => m.close()); const before = copy(m.f.raw);
    m.f.hooks.read = async () => { throw Error('Synthetic unrelated Chrome read failure'); };
    m.draft.focus(); await m.start();
    const error = m.calls.errors.find(args => args[0] === 'Error in initializeDashboard:')?.[1];
    assert(error, 'the real StorageManager startup must fail'); assert.notEqual(error.code, 'WORKSPACE_RESTORE_PENDING');
    assert.equal(m.document.getElementById('dashboard-restore-pending'), null);
    assert(m.document.querySelector('.error-message')?.getClientRects().length, 'ordinary startup errors retain their existing feedback');
    const baseline = m.effects(); expireTransientToasts(m);
    assert.equal(m.document.getElementById('dashboard-restore-pending'), null);
    assert.deepEqual(m.effects(), baseline); assert.equal(m.document.activeElement, m.draft);
    assert.equal(m.calls.opened.length, 0); assert.equal(m.calls.assignments.length, 0); unchanged(m, before);
});

function ordinaryDashboardNotice(m) {
    const notice = m.document.getElementById('dashboard-load-failed');
    assert(notice, 'a failed ordinary startup needs a persistent explanation after transient feedback expires');
    assert(notice.parentElement === m.switcher); assert.equal(notice.getAttribute('role'), 'alert');
    assert(notice.getClientRects().length && !notice.closest('[inert]'));
    assert.match(notice.textContent, /(?:not|haven.t|hasn.t).{0,50}loaded/i);
    assert.match(notice.textContent, /(?:not|doesn.t).{0,70}(?:mean|confirm|prove).{0,70}(?:deleted|lost)/i);
    assert.doesNotMatch(notice.textContent, /interrupted|unverified restore|restore needs review|Synthetic private/i,
        'generic failure text neither diagnoses a restore nor exposes the underlying error');
    assert.equal(notice.querySelectorAll('button,input,select,textarea,a').length, 0,
        'the explanation adds no repair, editing, retry or navigation control');
    assert.equal(m.document.getElementById('dashboard-restore-pending'), null);
    return notice;
}

for (const failure of ['corrupt Work values', 'Chrome read failure']) test(`${failure}: ordinary dashboard failure notice survives the real toast timeout and repeated startup`, async t => {
    const f = fixture(); if (failure === 'corrupt Work values') f.values('work').quote = 42;
    const m = model(f, 'work'); t.after(() => m.close()); const before = copy(f.raw);
    if (failure === 'Chrome read failure') f.hooks.read = async (keys, raw) => {
        // Let the real registry/list and Session capture finish, then fail the
        // actual Chrome boundary used by getAll. Never replace getAll itself.
        if (m.switcher.querySelector('.spaces-switch')?.textContent.includes('Work') && m.switcher.querySelector('.spaces-status')?.textContent === '')
            throw Error('Synthetic private Chrome read failure');
        return copy(keys === null ? raw : Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]])));
    };
    m.draft.focus(); const draft = m.draft.value;
    await m.start();
    const error = m.calls.errors.find(args => args[0] === 'Error in initializeDashboard:')?.[1];
    assert.equal(error?.code, failure === 'corrupt Work values' ? 'WORKSPACE_CORRUPT' : 'WORKSPACE_READ');
    assert(m.calls.errors.some(args => args[0] === 'Error initializing dashboard:' && args[1] === error), 'original error remains reported');
    assert.equal(m.session.id, 'work'); assert.equal(m.switcher.querySelector('.spaces-load-error').hidden, true);
    assert(m.document.querySelector('.error-message')?.getClientRects().length, 'ordinary errors keep their original transient feedback');
    const notice = ordinaryDashboardNotice(m), startupEffects = m.effects();
    assert(m.document.activeElement === m.draft); assert.equal(m.calls.opened.length, 0); assert.equal(m.calls.assignments.length, 0);
    expireTransientToasts(m); assert(ordinaryDashboardNotice(m) === notice);
    assert.deepEqual(m.effects(), startupEffects); unchanged(m, before);

    const listeners = noticeListeners(m), timerCount = m.calls.timers.length;
    m.ctx.showDashboardLoadFailed(error); m.ctx.showDashboardLoadFailed(error);
    assert(ordinaryDashboardNotice(m) === notice); assert.equal(m.document.querySelectorAll('#dashboard-load-failed').length, 1);
    assert.equal(noticeListeners(m), listeners); assert.equal(m.calls.timers.length, timerCount); assert.deepEqual(m.effects(), startupEffects);
    assert(m.document.activeElement === m.draft);
    await m.start(); expireTransientToasts(m);
    assert(ordinaryDashboardNotice(m) === notice); assert.equal(m.document.querySelectorAll('#dashboard-load-failed').length, 1);
    assert.equal(noticeListeners(m), listeners); assert(m.document.activeElement === m.draft); assert.equal(m.draft.value, draft);
    assert.equal(m.calls.opened.length, 0); assert.equal(m.calls.assignments.length, 0); unchanged(m, before);

    const repeatedEffects = m.effects();
    m.settings.focus(); m.settings.dispatch('click'); m.categories.focus(); m.categories.dispatch('click'); destinations(m);
    assert(m.recovery.getClientRects().length); m.recovery.focus(); assert(m.document.activeElement === m.recovery);
    assert.equal(m.recovery.href, 'recovery.html'); assert.equal(m.recovery.dispatch('click').prevented, false);
    assert.deepEqual(m.effects(), repeatedEffects, 'existing exits add no local/provider I/O'); unchanged(m, before);
    t.diagnostic(JSON.stringify({failure, startupEffects, repeatedEffects, clickEffects: m.effects(), rawUnchanged: true}));
});

for (const failure of ['corrupt Work values', 'Chrome read failure']) test(`${failure}: creating an ordinary dashboard failure notice from a real getAll error is presentation only`, async t => {
    const f = fixture(); if (failure === 'corrupt Work values') f.values('work').quote = 42;
    const m = model(f, 'work'); t.after(() => m.close()); const before = copy(f.raw);
    if (failure === 'Chrome read failure') f.hooks.read = async () => { throw Error('Synthetic private Chrome read failure'); };
    let failed;
    await assert.rejects(m.storageManager.getAll(), error => { failed = error; return error.code === (failure === 'corrupt Work values' ? 'WORKSPACE_CORRUPT' : 'WORKSPACE_READ'); });
    m.draft.focus(); const baseline = m.effects(), listeners = noticeListeners(m), timerCount = m.calls.timers.length;
    assert.equal(m.ctx.showDashboardRestorePending(failed), false, 'the pending helper keeps its exact error whitelist');
    assert.equal(typeof m.ctx.showDashboardLoadFailed, 'function');
    m.ctx.showDashboardLoadFailed(failed); const notice = ordinaryDashboardNotice(m);
    m.ctx.showDashboardLoadFailed(failed); assert(ordinaryDashboardNotice(m) === notice);
    assert.equal(m.document.querySelectorAll('#dashboard-load-failed').length, 1);
    assert.equal(noticeListeners(m), listeners); assert.equal(m.calls.timers.length, timerCount);
    assert.deepEqual(m.effects(), baseline); assert(m.document.activeElement === m.draft);
    assert.equal(m.calls.opened.length, 0); assert.equal(m.calls.assignments.length, 0); unchanged(m, before);
});

test('prepared restore startup keeps only its dedicated notice and is refused by the ordinary failure helper', async t => {
    for (const workspaceId of ['default', 'work']) {
        const m = model(await prepared(), workspaceId); t.after(() => m.close()); const before = copy(m.f.raw);
        m.draft.focus(); await m.start(); const error = pendingStartupError(m);
        const notice = m.document.getElementById('dashboard-restore-pending'); assert(notice?.getClientRects().length);
        noticeLinks(m, notice, workspaceId); assert.equal(m.document.getElementById('dashboard-load-failed'), null);
        const baseline = m.effects(), listeners = noticeListeners(m), timerCount = m.calls.timers.length;
        assert.equal(typeof m.ctx.showDashboardLoadFailed, 'function');
        assert.equal(m.ctx.showDashboardLoadFailed(error), false);
        assert.equal(m.document.getElementById('dashboard-load-failed'), null);
        assert(m.document.getElementById('dashboard-restore-pending') === notice);
        assert.deepEqual(m.effects(), baseline); assert.equal(noticeListeners(m), listeners); assert.equal(m.calls.timers.length, timerCount);
        assert(m.document.activeElement === m.draft); assert.equal(m.calls.opened.length, 0); assert.equal(m.calls.assignments.length, 0);
        unchanged(m, before);
    }
});

async function skipFailureModel(failure, locale) {
    const f = failure === 'pending restore' ? await prepared() : fixture();
    if (failure === 'corrupt Work values') f.values('work').quote = 42;
    const m = model(f, 'work', {locale});
    if (failure === 'Chrome read failure') f.hooks.read = async () => { throw Error('Synthetic Skip Chrome read failure'); };
    return m;
}
function assertFailureSkip(m, failure, locale) {
    const id = failure === 'pending restore' ? 'dashboard-restore-pending' : 'dashboard-load-failed';
    const notice = m.document.getElementById(id); assert(notice?.getClientRects().length);
    assert.equal(m.skip.getAttribute('href'), '#' + id, 'failed startup routes Skip to the visible explanation');
    assert.equal(notice.getAttribute('tabindex'), '-1', 'the section must be explicitly focusable as a native fragment target');
    assert.equal(notice.tabIndex, -1);
    const key = m.skip.getAttribute('data-i18n'); assert(key && key !== 'dashboardSkipShortcuts');
    const messages = JSON.parse(source(`_locales/${locale}/messages.json`));
    assert(messages[key]?.message, 'the replacement Skip label exists in each supported catalog');
    assert.equal(m.skip.textContent, messages[key].message);
    assert.match(m.skip.textContent, locale === 'en' ? /skip.*(?:status|notice|message|error)/i : /(?:跳转|跳到|跳至|跳过).*(?:状态|提示|说明|错误)/);
    assert.doesNotMatch(m.skip.textContent, /shortcuts|快捷方式|快捷链接/i);
    return notice;
}

for (const locale of ['en', 'zh_CN']) for (const failure of ['corrupt Work values', 'Chrome read failure', 'pending restore'])
    test(`${locale}/${failure}: dashboard failure Skip targets the notice without stealing focus or losing its localized label`, async t => {
        const m = await skipFailureModel(failure, locale); t.after(() => m.close()); const before = copy(m.f.raw);
        m.draft.focus(); await m.start();
        const error = m.calls.errors.find(args => args[0] === 'Error in initializeDashboard:')?.[1];
        assert.equal(error?.code, failure === 'pending restore' ? 'WORKSPACE_RESTORE_PENDING' : failure === 'corrupt Work values' ? 'WORKSPACE_CORRUPT' : 'WORKSPACE_READ');
        const notice = assertFailureSkip(m, failure, locale), baseline = m.effects();
        assert(m.document.activeElement === m.draft, 'presenting the notice does not move focus');
        const listeners = noticeListeners(m), timerCount = m.calls.timers.length;
        const show = failure === 'pending restore' ? m.ctx.showDashboardRestorePending : m.ctx.showDashboardLoadFailed;
        show(error); show(error);
        m.window.i18n.localizeDocument(m.document);
        assert(assertFailureSkip(m, failure, locale) === notice);
        assert.equal(m.document.querySelectorAll('#' + notice.id).length, 1);
        assert.equal(noticeListeners(m), listeners); assert.equal(m.calls.timers.length, timerCount); assert.deepEqual(m.effects(), baseline);
        assert(m.document.activeElement === m.draft);
        await m.start(); assert(assertFailureSkip(m, failure, locale) === notice);
        assert.equal(noticeListeners(m), listeners); assert(m.document.activeElement === m.draft);
        assert.equal(m.calls.opened.length, 0); assert.equal(m.calls.assignments.length, 0); unchanged(m, before);
        // Programmatic focusability only: native hash navigation/Enter behavior
        // is intentionally left to the separate browser verification.
        const repeatedEffects = m.effects(); notice.focus(); assert(m.document.activeElement === notice);
        assert.deepEqual(m.effects(), repeatedEffects); unchanged(m, before);
    });

test('normal dashboard Skip markup and rejected notice helpers retain the original bilingual destination and label', t => {
    assert.match(source('newtab.html'), /<body>\s*<a class="skip-link" href="#shortcuts-container" data-i18n="dashboardSkipShortcuts">Skip to shortcuts<\/a>/);
    for (const locale of ['en', 'zh_CN']) {
        const m = model(fixture(), 'work', {locale}); t.after(() => m.close()); const before = copy(m.f.raw), baseline = m.effects();
        m.draft.focus(); m.window.i18n.localizeDocument(m.document);
        const expected = JSON.parse(source(`_locales/${locale}/messages.json`)).dashboardSkipShortcuts.message;
        m.ctx.setupSettingsNavigation(); m.ctx.setupSettingsNavigation();
        for (const error of [undefined, new Error('Synthetic unrelated error'), {code: 'WORKSPACE_CORRUPT'}, {code: 'WORKSPACE_RESTORE_PENDING_EXTRA'}])
            assert.equal(m.ctx.showDashboardRestorePending(error), false);
        assert.equal(m.ctx.showDashboardLoadFailed({code: 'WORKSPACE_RESTORE_PENDING'}), false);
        m.window.i18n.localizeDocument(m.document);
        assert.equal(m.skip.getAttribute('href'), '#shortcuts-container'); assert.equal(m.skip.getAttribute('data-i18n'), 'dashboardSkipShortcuts');
        assert.equal(m.skip.textContent, expected); assert(m.document.activeElement === m.draft);
        assert.equal(m.document.getElementById('dashboard-load-failed'), null); assert.equal(m.document.getElementById('dashboard-restore-pending'), null);
        assert.deepEqual(m.effects(), baseline); assert.equal(m.calls.opened.length, 0); assert.equal(m.calls.assignments.length, 0); unchanged(m, before);
    }
});

test('dashboard failure notices remain safe when the optional Skip link is absent', async t => {
    for (const failure of ['corrupt Work values', 'Chrome read failure', 'pending restore']) {
        const m = await skipFailureModel(failure, 'en'); t.after(() => m.close()); const before = copy(m.f.raw);
        m.skip.remove(); m.draft.focus(); await m.start();
        const id = failure === 'pending restore' ? 'dashboard-restore-pending' : 'dashboard-load-failed';
        const notice = m.document.getElementById(id); assert(notice?.getClientRects().length);
        assert.equal(notice.getAttribute('tabindex'), '-1'); assert.equal(m.document.querySelector('.skip-link'), null);
        assert(m.calls.errors.every(args => args[1]?.code?.startsWith('WORKSPACE_')), 'no Skip wiring exception replaces the original storage error');
        const error = m.calls.errors.find(args => args[0] === 'Error in initializeDashboard:')?.[1], baseline = m.effects();
        (failure === 'pending restore' ? m.ctx.showDashboardRestorePending : m.ctx.showDashboardLoadFailed)(error);
        assert(m.document.getElementById(id) === notice); assert(m.document.activeElement === m.draft);
        assert.equal(m.calls.opened.length, 0); assert.equal(m.calls.assignments.length, 0); assert.deepEqual(m.effects(), baseline); unchanged(m, before);
    }
});
