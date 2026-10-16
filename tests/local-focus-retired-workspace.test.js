'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const W = require('../shared/workspaces');
const F = require('../shared/local-focus-store');
const { Controller } = require('../shared/local-focus-controller');
const { createDocument, deferred } = require('./helpers/task-dom-model');

// Real workspace/session/store/controller/view notifications over synthetic storage.
// No manual render is used to deliver a registry invalidation.
async function model({ locale } = {}) {
    const raw = {}, listeners = new Set(), queues = new Map(), writes = [], heldNotifications = [];
    let holdNotifications = false;
    const clone = value => structuredClone(value);
    const locks = { request(name, options, action) {
        action ||= options; const task = (queues.get(name) || Promise.resolve()).then(action);
        queues.set(name, task.catch(() => {})); return task;
    } };
    const chrome = { storage: { local: {
        async get(keys) { return keys == null ? clone(raw) : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(k => Object.hasOwn(raw, k)).map(k => [k, clone(raw[k])])); },
        async set(values) {
            writes.push(clone(values));
            const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { oldValue: clone(raw[key]), newValue: clone(value) }]));
            Object.assign(raw, clone(values));
            const notify = () => { for (const fn of [...listeners]) fn(clone(changes), 'local'); };
            if (holdNotifications) heldNotifications.push(notify); else notify();
        }
    }, onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } } };
    let wall = 1791633600000, mono = 0, serial = 0, timerId = 0;
    const options = { chrome, locks, now: () => new Date(wall).toISOString(), id: () => `synthetic_${++serial}` };
    const settle = async () => { for (let n = 0; n < 10; n++) await new Promise(resolve => setImmediate(resolve)); };
    const manager = W.createManager(options); await manager.ready();
    const workspace = await manager.create('Synthetic focus');
    const session = manager.capture(workspace.id); await session.ready();
    const api = { ...F, Controller };
    const controllerFor = session => new Controller(new F.Store(session.createBackend(F.KEY), { now: () => wall, id: () => `synthetic_run_${++serial}` }), { wall: () => wall, monotonic: () => mono });
    const controller = controllerFor(session), document = createDocument({ blurUnavailableFocus: true }), events = new Map(), timers = new Map();
    const title = document.createElement('title'); title.setAttribute('data-i18n', 'newTabTitle'); title.dataset.i18n = 'newTabTitle'; title.textContent = 'New Tab'; document.body.append(title);
    Object.defineProperty(document, 'title', { get: () => title.textContent, set: value => { title.textContent = value; } });
    const dashboard = document.createElement('div'); dashboard.id = 'dashboard'; document.body.append(dashboard);
    const wrapper = document.createElement('div'); wrapper.className = 'main-content-wrapper'; dashboard.append(wrapper);
    const switcher = document.createElement('section'); switcher.id = 'workspace-switcher'; wrapper.append(switcher);
    const main = document.createElement('main'); main.className = 'dashboard-main'; wrapper.append(main);
    const cards = document.createElement('section'); cards.id = 'info-cards-container'; main.append(cards);
    const host = document.createElement('article'); host.id = 'local-focus-card'; cards.append(host);
    const window = { document, chrome, location: { href: 'chrome-extension://synthetic/newtab.html' }, LocalItabFocus: api, LocalItabWorkspaces: { session, manager },
        setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
        addEventListener(type, fn) { const list = events.get(type) || new Set(); list.add(fn); events.set(type, list); }, removeEventListener(type, fn) { events.get(type)?.delete(fn); } };
    if (locale) {
        const messages = JSON.parse(fs.readFileSync(require.resolve(`../_locales/${locale}/messages.json`), 'utf8'));
        chrome.i18n = { getMessage: key => messages[key]?.message || '' };
    }
    const context = vm.createContext({ window, document, chrome, URL });
    if (locale) vm.runInContext(fs.readFileSync(require.resolve('../i18n.js'), 'utf8'), context);
    for (const file of ['local-focus-view', 'local-content-lifecycle', 'workspaces-view']) vm.runInContext(fs.readFileSync(require.resolve(`../shared/${file}`), 'utf8'), context);
    const spaces = window.workspacesView = window.LocalItabWorkspacesView.mount({ switcher, manager, session }); await spaces.ready;
    const view = window.localFocusView = new api.View(host, { controller }); await settle();
    await controller.action('visibility', true); await controller.action('duration', 1);
    if (locale) window.i18n.localizeDocument(document);
    const originalTitle = document.title;
    const other = W.createManager(options); await other.ready();
    return { api, raw, writes, manager, other, workspace, session, controller, controllerFor, document, window, events, timers, host, switcher, view, settle, originalTitle,
        advance(ms) { wall += ms; mono += ms; },
        shiftWall(ms) { wall += ms; },
        holdNotifications() { holdNotifications = true; },
        releaseNotifications() { holdNotifications = false; for (const notify of heldNotifications.splice(0)) notify(); },
        emit(type) { for (const fn of [...events.get(type) || []]) fn(); },
        async start() { await controller.action('start'); assert(view.attachDocumentTitle()); assert(view.enterTemporaryFocus()); },
        async saved() { const entry = (await other.list()).workspaces.find(item => item.id === workspace.id); return (await other.readBundle(entry))[F.KEY]; },
        destroy() { spaces.destroy(); view.destroy(); }
    };
}
function retired(m) {
    assert.equal(m.view.temporaryFocus, null, 'registry notification exits temporary focus immediately');
    assert.equal(m.document.body.classList.contains('temporary-focus-view'), false);
    assert.equal(m.document.title, m.originalTitle);
    assert.equal(m.view.remaining.textContent, '—:—', 'no stale numeric countdown');
    assert.equal(m.view.status.textContent, m.window.i18n?.t('focusWorkspaceUnavailable') || 'Timer unavailable in this tab');
    assert.equal(m.view.workspaceNotice.hidden, false);
    assert.equal(m.view.workspaceNotice.textContent, m.window.i18n?.t('focusWorkspaceReopen') || 'Reopen the workspace to read its saved timer. Any unsaved minutes remain on this page.');
    for (const control of ['start', 'reset', 'phase', 'minutes', 'saveMinutes', 'retry', 'focusViewButton']) assert.equal(m.view[control].disabled, true, control);
    assert.equal(m.timers.size, 0, 'retired view stops its presentation ticker');
}

test('retired Focus: real remote Trash immediately releases title/focus and hides the stale running snapshot', async () => {
    const m = await model(); await m.start(); m.advance(10000); m.controller.tick();
    assert.equal(m.view.remaining.textContent, '0:50');
    await m.other.trash(m.workspace.id); await m.settle();
    assert.equal(m.session.invalidated, true); retired(m);
    const saved = await m.saved(); assert.equal(saved.session.status, 'paused'); assert.equal(saved.session.remainingMs, 50000);
    assert.equal(m.switcher.querySelector('.spaces-invalid').hidden, false);
    const writes = m.writes.length; m.advance(5000); m.controller.tick(); await m.settle(); retired(m);
    assert.equal(m.writes.length, writes); assert.deepEqual(await m.saved(), saved);
    m.destroy();
});

test('retired Focus: Restore never revives the old session; a fresh View reads the paused saved timer', async () => {
    const m = await model(); await m.start(); m.advance(10000); await m.other.trash(m.workspace.id); await m.settle();
    await m.other.restore(m.workspace.id); await m.settle(); retired(m); assert.equal(m.session.invalidated, true);
    const saved = await m.saved(), session = m.manager.capture(m.workspace.id); await session.ready();
    m.view.destroy(); m.window.LocalItabWorkspaces.session = session;
    const controller = m.controllerFor(session), next = m.window.localFocusView = new m.api.View(m.host, { controller }); await m.settle();
    assert.equal(next.status.textContent, 'Paused'); assert.equal(next.remaining.textContent, '0:50'); assert.equal(next.start.disabled, false);
    assert.equal(next.enterTemporaryFocus(), true); assert(next.attachDocumentTitle());
    assert.deepEqual(await m.saved(), saved, 'reopening does not resume or write');
    await controller.action('resume'); assert.equal(next.status.textContent, 'Running'); assert.equal(m.document.title, '0:50 · Focus');
    next.destroy(); m.destroy();
});

test('retired Focus: a real snapshot replacement with the same workspace id retires its prior generation', async () => {
    const m = await model(); await m.start();
    const snapshot = await m.other.exportSnapshot();
    const focus = snapshot.bundles.find(item => item.id === m.workspace.id).values[F.KEY]; focus.enabled = false; focus.revision++;
    await m.other.replaceSnapshot(snapshot); await m.settle();
    assert.equal(m.session.invalidated, true); retired(m); assert.equal((await m.saved()).enabled, false); m.destroy();
});

test('retired Focus: hidden/paused views react to the manager without a timer tick', async () => {
    const m = await model(); await m.start(); await m.controller.action('pause');
    m.document.hidden = true; await m.document.listeners.get('visibilitychange')();
    await m.other.trash(m.workspace.id); await m.settle(); retired(m);
    m.document.hidden = false; await m.document.listeners.get('visibilitychange')(); await m.settle(); retired(m); m.destroy();
});

test('retired Focus: ready minutes and failure evidence survive, while stale control events cannot change the timer', async () => {
    const m = await model(); m.view.minutes.value = '030'; m.view.minutes.dispatch('input');
    const error = Object.assign(new Error('Synthetic uncertain write'), { code: 'WRITE' }); m.controller.error = error;
    await m.other.trash(m.workspace.id); await m.settle(); retired(m);
    assert.equal(m.view.minutes.value, '030'); assert.equal(m.view.durationDrafts.get('focus'), '030'); assert.equal(m.view.hasUncommittedWork(), true);
    assert.equal(m.controller.error, error); assert.equal(m.view.feedback.textContent, 'The previous timer operation could not be confirmed. Reopen the workspace to check its saved state.');
    let actions = 0, refreshes = 0; const action = m.controller.action, refresh = m.controller.refresh;
    m.controller.action = (...args) => { actions++; return action.apply(m.controller, args); };
    m.controller.refresh = (...args) => { refreshes++; return refresh.apply(m.controller, args); };
    const writes = m.writes.length;
    for (const name of ['start', 'reset', 'saveMinutes', 'retry', 'focusViewButton']) m.view[name].dispatch('click');
    m.view.phase.value = 'break'; m.view.phase.dispatch('change'); m.view.minutes.dispatch('change');
    await m.view.run('reset'); await m.window.LocalItabContentLifecycle.saveDrafts();
    m.emit('pageshow'); await m.document.listeners.get('visibilitychange')(); await m.settle();
    assert.equal(actions, 0); assert.equal(refreshes, 0); assert.equal(m.writes.length, writes); assert.equal(m.controller.error, error);
    assert.equal(m.view.durationDrafts.get('focus'), '030'); retired(m);
    const event = { preventDefault() { this.prevented = true; } }; for (const fn of m.events.get('beforeunload')) fn(event);
    assert.equal(event.prevented, true, 'retirement keeps draft departure protection'); m.destroy();
});

test('retired Focus: another workspace or rename leaves a valid timer running', async () => {
    const m = await model(); await m.start();
    await m.other.rename(m.workspace.id, 'Synthetic renamed');
    const second = await m.other.create('Synthetic other'); await m.other.trash(second.id); await m.settle();
    assert.equal(m.session.invalidated, false); assert(m.view.temporaryFocus); assert.equal(m.view.status.textContent, 'Running');
    assert.equal(m.view.start.disabled, false); assert.equal(m.view.remaining.textContent, '1:00'); m.destroy();
});

test('retired Focus: replacing the page session object, even with the same id, cannot adopt its timer', async () => {
    for (const trigger of ['manager', 'ticker', 'action', 'pageshow']) {
        const m = await model(); await m.start(); const next = m.manager.capture(m.workspace.id); await next.ready();
        assert.equal(next.id, m.session.id); m.window.LocalItabWorkspaces.session = next;
        if (trigger === 'manager') await m.other.rename(m.workspace.id, 'Synthetic changed');
        if (trigger === 'ticker') { const [id, callback] = [...m.timers][0]; m.timers.delete(id); callback(); }
        if (trigger === 'action') await m.view.run('reset');
        if (trigger === 'pageshow') m.emit('pageshow');
        await m.settle(); retired(m); assert.equal((await m.saved()).session.status, 'running');
        m.window.LocalItabWorkspaces.session = m.session; m.controller.emit(); retired(m); m.destroy();
    }
});

test('retired Focus: English, Chinese and fallback render the reopen guidance', async () => {
    for (const locale of ['en', 'zh_CN', undefined]) {
        const m = await model({ locale }); await m.start(); await m.other.trash(m.workspace.id); await m.settle(); retired(m); m.destroy();
    }
});

test('retired Focus: destroy releases the manager subscription and late callbacks cannot alter a new View', async () => {
    const m = await model(); await m.start();
    const callbacks = [...m.manager._listeners], timer = [...m.timers.values()][0], before = m.manager._listeners.size;
    const gate = deferred(), read = m.controller.store.read.bind(m.controller.store), saved = await read();
    m.controller.store.read = async () => { await gate.promise; return saved; };
    const pending = m.controller.refresh();
    m.view.destroy(); assert.equal(m.manager._listeners.size, before - 1);
    const session = m.manager.capture(m.workspace.id); await session.ready(); m.window.LocalItabWorkspaces.session = session;
    const controller = m.controllerFor(session), next = m.window.localFocusView = new m.api.View(m.host, { controller }); await m.settle();
    assert(next.attachDocumentTitle()); assert(next.enterTemporaryFocus()); const title = m.document.title;
    let ticks = 0; m.controller.tick = () => { ticks++; };
    for (const callback of callbacks) callback(await m.other.list()); timer(); gate.resolve(); await pending; await m.settle();
    assert.equal(ticks, 0, 'a canceled old timeout cannot tick'); assert.equal(m.document.title, title);
    assert(next.temporaryFocus); assert.equal(m.document.body.classList.contains('temporary-focus-view'), true); assert.equal(next.status.textContent, 'Running');
    assert.equal(m.document.activeElement, next.focusViewButton); next.destroy(); m.destroy();
});

test('retired Focus: an already pending uncertain write stays guarded and is never replayed or acknowledged by retirement', async () => {
    const m = await model();
    const next = m.manager.capture(m.workspace.id); await next.ready();
    const gate = deferred(), reached = deferred(), backend = m.controller.store.backend, write = backend.write;
    let submitted = 0; m.holdNotifications();
    backend.write = async value => { submitted++; await write(value); reached.resolve(); await gate.promise; throw new Error('Synthetic lost acknowledgement'); };
    m.view.minutes.value = '030'; m.view.minutes.dispatch('input'); m.view.saveMinutes.focus(); m.view.saveMinutes.dispatch('click');
    await reached.promise; const pending = m.controller.pending; assert(pending);
    m.window.LocalItabWorkspaces.session = next; m.emit('pageshow'); retired(m);
    assert.equal(m.controller.pending, pending); assert.equal(m.view.hasUncommittedWork(), true);
    assert.equal(m.view.feedback.textContent, 'Saving timer…'); assert.equal(m.view.minutes.value, '030');
    gate.resolve(); await pending.catch(() => {}); await m.settle();
    retired(m); assert.equal(m.controller.pending, null); assert.equal(m.controller.error.code, 'WRITE');
    assert.equal(m.view.feedback.textContent, 'The previous timer operation could not be confirmed. Reopen the workspace to check its saved state.'); assert.equal(submitted, 1);
    assert.equal((await m.saved()).durations.focus, 30, 'uncertain acknowledgement does not mean the write failed');
    assert.equal(m.view.durationDrafts.get('focus'), '030'); assert.notEqual(m.document.activeElement, m.view.start);
    m.view.retry.dispatch('click'); m.view.saveMinutes.dispatch('click'); await m.settle(); assert.equal(submitted, 1);
    m.releaseNotifications(); await m.settle(); retired(m); assert.equal(submitted, 1); m.destroy();
});

test('retired Focus: existing clock uncertainty and another title owner are preserved', async () => {
    const m = await model(); await m.start();
    m.document.title = 'Synthetic other title owner';
    const gate = deferred(), reached = deferred(), backend = m.controller.store.backend;
    backend.write = async () => { reached.resolve(); await gate.promise; throw new Error('Synthetic write failure'); };
    m.shiftWall(10000); m.controller.tick(); await reached.promise;
    assert.equal(m.controller.clockUncertain, true); const pending = m.controller.pending;
    // A same-id page Session replacement can be observed before this pending
    // writer releases its lock. Retirement must leave its evidence untouched.
    const session = m.manager.capture(m.workspace.id); await session.ready(); m.window.LocalItabWorkspaces.session = session;
    m.emit('pageshow'); assert.equal(m.document.title, 'Synthetic other title owner');
    assert.equal(m.controller.clockUncertain, true); assert.equal(m.controller.pending, pending);
    assert.equal(m.view.remaining.textContent, '—:—'); assert.equal(m.view.temporaryFocus, null);
    gate.resolve(); await pending.catch(() => {}); await m.settle();
    assert.equal(m.controller.clockUncertain, true); assert.equal(m.controller.error.code, 'WRITE');
    assert.equal(m.document.title, 'Synthetic other title owner'); assert.equal(m.view.feedback.textContent, 'The previous timer operation could not be confirmed. Reopen the workspace to check its saved state.');
    assert.equal(m.view.start.disabled, true); m.destroy(); assert.equal(m.document.title, 'Synthetic other title owner');
});

test('retired Focus: failed operations direct every locale to reopen without claiming fresh state or retry in this tab', async () => {
    for (const locale of ['en', 'zh_CN', undefined]) for (const code of ['CONFLICT', 'WRITE', 'READ']) {
        const m = await model({ locale });
        const error = Object.assign(new Error('Synthetic operation failure'), { code }); m.controller.error = error;
        await m.other.trash(m.workspace.id); await m.settle(); retired(m);
        assert.equal(m.controller.error, error);
        assert.equal(m.view.feedback.textContent, locale === 'zh_CN' ? '此前的计时器操作尚未确认。请重新打开工作区，查看已保存的状态。' : 'The previous timer operation could not be confirmed. Reopen the workspace to check its saved state.');
        assert.equal(m.view.retry.disabled, true); assert.equal(m.view.start.disabled, true);
        m.destroy();
    }
});
