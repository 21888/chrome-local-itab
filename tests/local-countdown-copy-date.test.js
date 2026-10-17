'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { createDocument } = require('./helpers/task-dom-model');
const Countdown = require('../shared/local-countdown-store');
const { Controller } = require('../shared/local-countdown-controller');
const Workspaces = require('../shared/workspaces');
const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const saved = (extra = {}) => ({ ...Countdown.initial(), enabled: true, title: 'Synthetic milestone 中😀', targetDate: '2030-01-02', revision: 7, ...extra });
function model(options = {}) {
    const document = createDocument({ blurUnavailableFocus: true }), events = new Map(), observers = new Set(), timers = new Map();
    const session = options.session || { id: 'synthetic_A' }, api = { ...Countdown, Controller };
    const calls = [], clipboard = Object.hasOwn(options, 'clipboard') ? options.clipboard : { writeText(text) { calls.push(text); return Promise.resolve(); } };
    let raw = saved(options.state), reads = 0, writes = 0, holdRead, holdWrite, failRead = false, failWrite = false, now = new Date(2029, 11, 31, 12), serial = 0, tail = Promise.resolve();
    const listeners = new Set(), backend = options.backend || {
        workspace: session,
        lock(action) { const next = tail.then(action); tail = next.catch(() => {}); return next; },
        async read() { reads++; if (holdRead) await holdRead; if (failRead) throw Error('synthetic read failure'); return structuredClone(raw); },
        async write(value) { if (holdWrite) await holdWrite; if (failWrite) throw Error('synthetic write failure'); writes++; raw = structuredClone(value); listeners.forEach(fn => fn()); },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    };
    const window = { LocalItabCountdown: api, LocalItabWorkspaces: { session }, LocalItabContentLifecycle: { departing: false }, navigator: { clipboard },
        getComputedStyle(node) { for (let current = node; current; current = current.parentElement) if (current.style.visibility) return { visibility: current.style.visibility }; return { visibility: 'visible' }; },
        setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); },
        addEventListener(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
        removeEventListener(type, fn) { events.get(type)?.delete(fn); },
        MutationObserver: class {
            constructor(callback) { this.callback = callback; this.records = []; }
            observe() { observers.add(this); }
            disconnect() { observers.delete(this); }
            takeRecords() { const records = this.records; this.records = []; return records; }
        }
    };
    if (options.locale) { const messages = JSON.parse(fs.readFileSync(path.join(__dirname, '../_locales', options.locale, 'messages.json'))); window.i18n = { t: key => messages[key]?.message || key }; }
    vm.runInNewContext(fs.readFileSync(require.resolve('../shared/local-countdown-view'), 'utf8'), { window, document });
    const wrapper = document.createElement('section'), host = document.createElement('article'), search = document.createElement('input');
    document.body.append(search, wrapper); wrapper.append(host); search.focus();
    const controller = new Controller(new Countdown.Store(backend));
    const view = api.mount(host, { controller, now: () => now });
    return { api, document, window, events, observers, timers, wrapper, host, search, backend, controller, view, calls,
        get raw() { return structuredClone(raw); }, get reads() { return reads; }, get writes() { return writes; },
        readHold(value) { holdRead = value; }, writeHold(value) { holdWrite = value; }, readFail(value) { failRead = value; }, writeFail(value) { failWrite = value; },
        now(value) { now = value; },
        emit(type) { for (const fn of events.get(type) || []) fn(); },
        mutations(records, queued = false) { for (const observer of [...observers]) if (queued) observer.records.push(...records); else observer.callback(records); },
        tick() { const item = [...timers].find(([, timer]) => timer.delay === 60000); assert(item); timers.delete(item[0]); item[1].fn(); }
    };
}
function copyButton(h) { const node = h.view.copyButton; assert(node, 'Countdown card needs a Copy date button'); return node; }
function untouched(h, raw, reads, writes = 0) { assert.deepEqual(h.raw, raw); assert.equal(h.reads, reads); assert.equal(h.writes, writes); }
function clean(h) { h.view.destroy(); assert.equal(h.observers.size, 0); }

test('copy exact displayed saved date synchronously, without title, draft, newline or storage I/O', async () => {
    const h = model(); await settle(); const before = h.raw, reads = h.reads;
    h.controller.setDraft({ title: 'Unsaved private title', targetDate: '2040-02-03', enabled: false });
    const draft = structuredClone(h.controller.draft), origin = copyButton(h); origin.focus(); origin.dispatch('click');
    assert.deepEqual(h.calls, ['2030-01-02']); assert.equal(h.calls[0].length, 10);
    assert.equal(origin.tagName, 'BUTTON'); assert.equal(origin.type, 'button'); assert.equal(origin.tabIndex, 0);
    await settle(); assert.equal(h.view.copyStatus.textContent, 'Date copied.'); assert.equal(h.view.copyStatus.getAttribute('role'), 'status');
    assert.equal(h.view.copyStatus.getAttribute('aria-live'), 'polite'); assert.equal(h.document.activeElement, origin);
    assert.equal(h.view.date.textContent, '2030-01-02'); assert.deepEqual(h.controller.draft, draft);
    untouched(h, before, reads); clean(h);
});

for (const targetDate of ['0001-01-01', '0099-12-31', '2000-02-29', '2026-10-17', '9999-12-31']) test(`date stays ten exact ASCII characters: ${targetDate}`, async () => {
    const h = model({ state: { targetDate } }); await settle(); const before = h.raw, reads = h.reads;
    copyButton(h).dispatch('click'); assert.deepEqual(h.calls, [targetDate]); await settle(); untouched(h, before, reads); clean(h);
});

for (const failure of ['missing-api', 'synchronous-throw', 'asynchronous-reject']) test(`independent failure allows explicit retry and keeps selectable date: ${failure}`, async () => {
    let calls = 0;
    const clipboard = failure === 'missing-api' ? null : { writeText() { calls++; if (failure === 'synchronous-throw') throw Error('private failure'); return Promise.reject(Error('private failure')); } };
    const h = model({ clipboard }); await settle(); const before = h.raw, reads = h.reads, origin = copyButton(h);
    h.view.status.textContent = 'Existing export feedback'; origin.focus(); origin.dispatch('click'); await settle();
    assert.equal(h.view.copyStatus.textContent, 'Could not copy. Try Copy date again, or select the date to copy it manually.');
    assert(h.view.copyStatus.classList.contains('countdown-error')); assert.equal(h.view.status.textContent, 'Existing export feedback');
    assert.equal(h.view.date.textContent, '2030-01-02'); assert.equal(h.document.activeElement, origin);
    assert.equal(origin.getAttribute('aria-disabled'), 'false'); assert.equal(h.view.date.children.length, 0);
    assert.equal(calls, failure === 'missing-api' ? 0 : 1);
    const retried = []; h.window.navigator.clipboard = { writeText(value) { retried.push(value); return Promise.resolve(); } };
    origin.dispatch('click'); await settle(); assert.deepEqual(retried, ['2030-01-02']); assert.equal(h.view.copyStatus.textContent, 'Date copied.');
    assert(!h.view.copyStatus.classList.contains('countdown-error')); untouched(h, before, reads); clean(h);
});

for (const condition of ['unloaded', 'pending', 'error', 'read-error', 'conflict', 'composing', 'closed-controller', 'loading-status', 'saving-status', 'error-status',
    'hidden-host', 'hidden-parent', 'inert', 'css-display', 'css-visibility', 'css-collapse', 'detached', 'closed-details', 'document-hidden', 'visibility-hidden',
    'departing', 'suspended', 'invalidated-workspace', 'suspended-workspace', 'wrong-workspace', 'wrong-session', 'changed-session-id', 'wrong-document',
    'changed-date', 'changed-revision', 'changed-state-object', 'changed-date-text', 'changed-date-time', 'changed-title-text', 'disabled-state', 'invalid-date']) test(`copy refuses ineligible context synchronously: ${condition}`, async () => {
    const h = model(); await settle(); const before = h.raw, reads = h.reads, origin = copyButton(h), c = h.controller;
    const changes = {
        unloaded() { c.loaded = false; }, pending() { c.pending = true; }, error() { c.error = Countdown.fault('WRITE'); }, 'read-error'() { c.readError = true; },
        conflict() { c.conflict = true; }, composing() { c.composing = true; }, 'closed-controller'() { c.closed = true; },
        'loading-status'() { c.status = 'loading'; }, 'saving-status'() { c.status = 'saving'; }, 'error-status'() { c.status = 'error'; },
        'hidden-host'() { h.host.hidden = true; }, 'hidden-parent'() { h.wrapper.hidden = true; }, inert() { h.wrapper.inert = true; },
        'css-display'() { h.wrapper.style.display = 'none'; }, 'css-visibility'() { h.wrapper.style.visibility = 'hidden'; }, 'css-collapse'() { h.wrapper.style.visibility = 'collapse'; },
        detached() { h.host.remove(); }, 'closed-details'() { h.wrapper.tagName = 'DETAILS'; h.wrapper.open = false; origin.getClientRects = () => [{}]; },
        'document-hidden'() { h.document.hidden = true; }, 'visibility-hidden'() { h.document.visibilityState = 'hidden'; },
        departing() { h.window.LocalItabContentLifecycle.departing = true; }, suspended() { h.view.suspended = true; },
        'invalidated-workspace'() { h.backend.workspace.invalidated = true; }, 'suspended-workspace'() { h.backend.workspace._suspended = true; },
        'wrong-workspace'() { h.backend.workspace = { id: 'synthetic_B' }; }, 'wrong-session'() { h.window.LocalItabWorkspaces.session = { id: 'synthetic_B' }; },
        'changed-session-id'() { h.backend.workspace.id = 'synthetic_B'; }, 'wrong-document'() { origin.ownerDocument = {}; },
        'changed-date'() { c.state.targetDate = '2031-02-03'; }, 'changed-revision'() { c.state.revision++; }, 'changed-state-object'() { c.state = { ...c.state }; },
        'changed-date-text'() { h.view.date.textContent = '2031-02-03'; }, 'changed-date-time'() { h.view.date.dateTime = '2031-02-03'; }, 'changed-title-text'() { h.view.title.textContent = 'Other'; },
        'disabled-state'() { c.state.enabled = false; }, 'invalid-date'() { c.state.targetDate = '2030-02-30'; h.view.render(); }
    };
    changes[condition](); const status = h.view.status.textContent; origin.dispatch('click'); await settle();
    assert.equal(h.calls.length, 0); assert.equal(h.view.status.textContent, status); untouched(h, before, reads); clean(h);
});

for (const event of [{ isComposing: true }, { keyCode: 229 }]) test(`composition activation is rejected: ${JSON.stringify(event)}`, async () => {
    const h = model(); await settle(); copyButton(h).dispatch('click', event); assert.equal(h.calls.length, 0); clean(h);
});

test('minute and midnight render preserve copy feedback without repeated live text or changed timer behavior', async () => {
    const h = model(); await settle(); const before = h.raw, reads = h.reads;
    copyButton(h).dispatch('click'); await settle(); let text = h.view.copyStatus.textContent, changes = 0;
    Object.defineProperty(h.view.copyStatus, 'textContent', { get: () => text, set(value) { changes++; text = value; }, configurable: true });
    for (const date of [new Date(2029, 11, 31, 12, 1), new Date(2030, 0, 1), new Date(2030, 0, 2)]) {
        h.now(date); h.tick(); assert.equal(text, 'Date copied.'); assert.equal(changes, 0); assert.equal(h.timers.size, 1);
    }
    assert.equal(h.view.remaining.textContent, 'Today'); assert.equal(h.view.remaining.getAttribute('aria-live'), 'off'); untouched(h, before, reads); clean(h);
});

test('single unresolved call blocks repeated activation through timer renders and unlocks only on settle', async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    const origin = copyButton(h); origin.focus(); origin.dispatch('click'); assert.equal(h.view.copyStatus.textContent, 'Copying date…');
    for (let i = 0; i < 3; i++) { h.tick(); origin.dispatch('click'); }
    assert.deepEqual(calls, ['2030-01-02']); assert.equal(origin.getAttribute('aria-disabled'), 'true'); assert.equal(h.document.activeElement, origin);
    wait.resolve(); await settle(); assert.equal(origin.getAttribute('aria-disabled'), 'false'); assert.equal(h.view.copyStatus.textContent, 'Date copied.'); clean(h);
});

for (const interruption of ['refresh', 'state-mutation', 'read-generation', 'draft-composition', 'save-pending', 'save-error', 'read-error', 'conflict',
    'hide', 'hide-failure', 'hide-restore', 'detach-restore', 'queued-hide-restore', 'queued-detach-restore', 'date-ABA', 'document-hide-return', 'blur',
    'pagehide-pageshow', 'departing', 'invalidated-workspace', 'workspace-replaced', 'session-replaced', 'destroy']) for (const rejected of [false, true]) test(`late ${rejected ? 'failure' : 'success'} has no UI receipt or focus claim after ${interruption}`, async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    const origin = copyButton(h); origin.dispatch('click'); assert.equal(calls.length, 1);
    const changes = {
        async refresh() { await h.controller.refresh(); },
        'state-mutation'() { h.controller.state.targetDate = '2030-02-03'; h.view.render(); },
        'read-generation'() { h.controller.readGeneration++; },
        'draft-composition'() { h.controller.setComposing(true); h.controller.setComposing(false); },
        'save-pending'() { h.controller.pending = true; h.controller.emit(); },
        'save-error'() { h.controller.error = Countdown.fault('WRITE'); h.controller.emit(); },
        'read-error'() { h.controller.readError = true; h.controller.emit(); },
        conflict() { h.controller.conflict = true; h.controller.emit(); },
        async hide() { h.view.hideButton.dispatch('click'); await settle(); },
        async 'hide-failure'() { h.writeFail(true); h.view.hideButton.dispatch('click'); await settle(); assert(!h.view.retry.hidden); },
        'hide-restore'() { h.wrapper.hidden = true; h.wrapper.hidden = false; h.mutations([{ type: 'attributes', target: h.wrapper, attributeName: 'hidden' }]); },
        'detach-restore'() { h.host.remove(); h.wrapper.append(h.host); h.mutations([{ type: 'childList', target: h.wrapper, removedNodes: [h.host] }]); },
        'queued-hide-restore'() { h.wrapper.hidden = true; h.wrapper.hidden = false; h.mutations([{ type: 'attributes', target: h.wrapper, attributeName: 'hidden' }], true); },
        'queued-detach-restore'() { h.host.remove(); h.wrapper.append(h.host); h.mutations([{ type: 'childList', target: h.wrapper, removedNodes: [h.host] }], true); },
        'date-ABA'() { h.view.date.textContent = 'Other'; h.view.date.textContent = '2030-01-02'; h.mutations([{ type: 'childList', target: h.view.date, removedNodes: [] }], true); },
        async 'document-hide-return'() { h.document.hidden = true; await h.document.listeners.get('visibilitychange')?.(); h.document.hidden = false; },
        blur() { h.emit('blur'); }, 'pagehide-pageshow'() { h.emit('pagehide'); h.emit('pageshow'); },
        departing() { h.window.LocalItabContentLifecycle.departing = true; },
        'invalidated-workspace'() { h.backend.workspace.invalidated = true; },
        'workspace-replaced'() { h.backend.workspace = { id: 'synthetic_A' }; },
        'session-replaced'() { h.window.LocalItabWorkspaces.session = { id: 'synthetic_A' }; },
        destroy() { h.view.destroy(); }
    };
    await changes[interruption](); const status = h.view.status.textContent, retryHidden = h.view.retry.hidden, draft = structuredClone(h.controller.draft);
    h.search.focus(); origin.dispatch('click'); assert.equal(calls.length, 1);
    if (rejected) wait.reject(Error('late private failure')); else wait.resolve(); await settle();
    assert.equal(h.view.copyStatus.textContent, ''); assert.equal(h.document.activeElement, h.search); assert.equal(h.view.status.textContent, status);
    assert.equal(h.view.retry.hidden, retryHidden); assert.deepEqual(h.controller.draft, draft); clean(h);
});

test('background read already in flight allows only the previously displayed saved snapshot, then invalidates its receipt', async () => {
    const wait = deferred(), read = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    h.readHold(read.promise); const refreshing = h.controller.refresh(); await settle(); const reads = h.reads;
    copyButton(h).dispatch('click'); assert.deepEqual(calls, ['2030-01-02']); assert.equal(h.reads, reads, 'copy never starts a freshness read');
    read.resolve(); await refreshing; wait.resolve(); await settle(); assert.equal(h.view.copyStatus.textContent, ''); clean(h);
});

for (const destroy of [false, true]) test(`module-wide lock survives same-host remount with old owner ${destroy ? 'destroyed' : 'still referenced'}`, async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    const old = h.view, oldButton = copyButton(h); oldButton.dispatch('click'); if (destroy) old.destroy();
    const controller = new Controller(new Countdown.Store(h.backend)), next = h.api.mount(h.host, { controller }); await settle();
    assert.equal(next.copyButton.getAttribute('aria-disabled'), 'true'); next.copyButton.dispatch('click'); oldButton.dispatch('click'); old.render();
    assert.equal(calls.length, 1); assert(h.host.contains(next.copyButton)); assert(!h.host.contains(oldButton));
    h.search.focus(); wait.resolve(); await settle(); assert.equal(next.copyStatus.textContent, ''); assert.equal(old.copyStatus.textContent, '');
    assert.equal(next.copyButton.getAttribute('aria-disabled'), 'false'); assert.equal(h.document.activeElement, h.search);
    next.copyButton.dispatch('click'); await settle(); assert.equal(calls.length, 2); assert.equal(next.copyStatus.textContent, 'Date copied.');
    oldButton.dispatch('click'); assert.equal(calls.length, 2); old.destroy(); next.destroy(); assert.equal(h.observers.size, 0);
});

test('another live card shares the unsettled module lock and gets only its own explicit receipt', async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    const otherHost = h.document.createElement('article'); h.wrapper.append(otherHost);
    const otherController = new Controller(new Countdown.Store(h.backend)), other = h.api.mount(otherHost, { controller: otherController }); await settle();
    copyButton(h).dispatch('click'); assert.equal(other.copyButton.getAttribute('aria-disabled'), 'true'); other.copyButton.dispatch('click'); assert.equal(calls.length, 1);
    wait.resolve(); await settle(); assert.equal(other.copyButton.getAttribute('aria-disabled'), 'false'); assert.equal(other.copyStatus.textContent, '');
    other.copyButton.dispatch('click'); await settle(); assert.equal(calls.length, 2); other.destroy(); clean(h);
});

for (const locale of ['en', 'zh_CN']) test(`labels and separate copy feedback translate: ${locale}`, async () => {
    const h = model({ locale }); await settle(); const origin = copyButton(h);
    assert.equal(origin.textContent, locale === 'en' ? 'Copy date' : '复制日期'); origin.dispatch('click');
    assert.equal(h.view.copyStatus.textContent, locale === 'en' ? 'Copying date…' : '正在复制日期…'); await settle();
    assert.equal(h.view.copyStatus.textContent, locale === 'en' ? 'Date copied.' : '已复制日期。');
    h.window.navigator.clipboard = null; origin.dispatch('click'); await settle();
    assert.equal(h.view.copyStatus.textContent, locale === 'en' ? 'Could not copy. Try Copy date again, or select the date to copy it manually.' : '未能复制。请再次选择“复制日期”，或选中日期手动复制。'); clean(h);
});

test('settings keeps saved-versus-draft ownership and has no Copy date control', async () => {
    const h = model(); await settle(); const settingsHost = h.document.createElement('section'); h.wrapper.append(settingsHost);
    const settingsController = new Controller(new Countdown.Store(h.backend)), settings = h.api.mountSettings(settingsHost, { controller: settingsController }); await settle();
    settings.title.value = 'Unsaved settings title'; settings.title.dispatch('input'); settings.date.value = '2040-01-01'; settings.date.dispatch('input');
    const draft = structuredClone(settingsController.draft), raw = h.raw, reads = h.reads;
    assert.equal(settings.copyButton, undefined); assert.equal(settingsHost.querySelectorAll('button').some(button => button.textContent === 'Copy date'), false);
    copyButton(h).dispatch('click'); await settle(); assert.deepEqual(h.calls, ['2030-01-02']); assert.deepEqual(settingsController.draft, draft);
    assert.equal(settings.date.value, '2040-01-01'); assert.equal(settings.status.textContent, 'Unsaved changes'); untouched(h, raw, reads); settings.destroy(); clean(h);
});

function namespaces() {
    const raw = {}, writes = [], listeners = new Set(), queues = new Map(); let reads = 0, serial = 0;
    const local = {
        async get(keys) { reads++; return keys == null ? structuredClone(raw) : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => Object.hasOwn(raw, key)).map(key => [key, structuredClone(raw[key])])); },
        async set(values) {
            writes.push(structuredClone(values));
            const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { oldValue: structuredClone(raw[key]), newValue: structuredClone(value) }]));
            Object.assign(raw, structuredClone(values)); listeners.forEach(fn => fn(changes, 'local'));
        },
        async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete raw[key]; }
    };
    const locks = { request(name, options, action) { action ||= options; const next = (queues.get(name) || Promise.resolve()).then(action); queues.set(name, next.catch(() => {})); return next; } };
    const chrome = { storage: { local, onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } } };
    const manager = Workspaces.createManager({ chrome, locks, now: () => '2026-10-17T00:00:00.000Z', id: () => `synthetic_${++serial}` });
    return { raw, writes, manager, get reads() { return reads; } };
}
for (const named of [false, true]) test(`real Manager/Session/Controller/Store copies only pinned ${named ? 'named' : 'Default'} A while next-new-tab preference is B`, async () => {
    const f = namespaces(); await f.manager.ready();
    const a = f.manager.capture(named ? (await f.manager.create('Synthetic A')).id : Workspaces.DEFAULT_ID); await a.ready();
    const b = f.manager.capture((await f.manager.create('Synthetic B')).id); await b.ready();
    await a.local.set({ [Countdown.KEY]: saved({ title: 'Synthetic A', targetDate: '2032-02-29' }) });
    await b.local.set({ [Countdown.KEY]: saved({ title: 'Synthetic B', targetDate: '2040-03-01' }) });
    const h = model({ session: a, backend: a.createBackend(Countdown.KEY) }); await settle();
    await f.manager.select(b.id); await settle();
    const settingsController = new Controller(new Countdown.Store(a.createBackend(Countdown.KEY))); await settingsController.init();
    settingsController.setDraft({ targetDate: '2099-12-31', title: 'Unsaved A settings draft' });
    const before = structuredClone(f.raw), reads = f.reads, writes = f.writes.length, draft = structuredClone(settingsController.draft);
    copyButton(h).dispatch('click'); assert.deepEqual(h.calls, ['2032-02-29']); await settle();
    assert.equal(f.reads, reads); assert.equal(f.writes.length, writes); assert.deepEqual(f.raw, before); assert.deepEqual(settingsController.draft, draft);
    h.window.LocalItabWorkspaces.session = b; copyButton(h).dispatch('click'); assert.equal(h.calls.length, 1);
    h.window.LocalItabWorkspaces.session = a; h.backend.workspace = b; copyButton(h).dispatch('click'); assert.equal(h.calls.length, 1);
    assert.deepEqual(f.raw, before); assert.equal(f.reads, reads); assert.equal(f.writes.length, writes);
    settingsController.destroy(); clean(h);
});

test('starting a real background refresh after Copy invalidates its receipt before the held storage read settles', async () => {
    const wait = deferred(), read = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    copyButton(h).dispatch('click'); const before = h.raw;
    h.readHold(read.promise); const refreshing = h.controller.refresh(); await settle(); const reads = h.reads;
    wait.resolve(); await settle(); assert.equal(h.view.copyStatus.textContent, ''); assert.deepEqual(calls, ['2030-01-02']);
    assert.equal(h.reads, reads); assert.deepEqual(h.raw, before); assert.equal(h.writes, 0);
    read.resolve(); await refreshing; clean(h);
});

test('global settlement never enables an unavailable replacement card', async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    copyButton(h).dispatch('click'); h.view.destroy();
    const controller = new Controller(new Countdown.Store(h.backend)), next = h.api.mount(h.host, { controller }); await settle();
    controller.error = Countdown.fault('WRITE'); controller.emit(); const status = next.status.textContent;
    wait.resolve(); await settle(); assert.equal(next.copyButton.getAttribute('aria-disabled'), 'true'); next.copyButton.dispatch('click');
    assert.equal(calls.length, 1); assert.equal(next.copyStatus.textContent, ''); assert.equal(next.status.textContent, status); next.destroy();
});

// Feature 57: append-only milestone coverage. Existing date assertions and the
// shared DOM helper remain unchanged; these are synthetic, not native-key tests.
function milestoneButton(h) { const node = h.view.copyMilestoneButton; assert(node, 'Countdown card needs a Copy milestone button'); return node; }
const milestoneText = h => h.view.title.textContent + '\n' + h.view.date.textContent;
const milestoneFailure = 'Could not copy the milestone. Try Copy milestone again, or select the title and date to copy them manually.';

for (const title of ['Synthetic milestone 中😀', 'Cafe\u0301 / café / 中 / 👩‍💻', '😀'.repeat(80), '<img src=x onerror="synthetic()"> & <b>literal</b> $1']) test(`milestone copies exact saved title and LF/date: ${title}`, async () => {
    const h = model({ state: { title } }); await settle(); const before = h.raw, reads = h.reads;
    h.controller.setDraft({ title: 'Synthetic draft not saved', targetDate: '2040-03-04', enabled: false });
    const draft = structuredClone(h.controller.draft), origin = milestoneButton(h), dateOrigin = copyButton(h);
    h.window.navigator.permissions = { query() { assert.fail('No permission query'); } };
    h.window.navigator.clipboard.readText = () => assert.fail('No clipboard read');
    origin.focus(); origin.dispatch('click');
    assert.deepEqual(h.calls, [title + '\n2030-01-02']); assert.equal(h.calls[0].split('\n').length, 2); assert(!h.calls[0].endsWith('\n'));
    assert.equal(origin.tagName, 'BUTTON'); assert.equal(origin.type, 'button'); assert.equal(origin.tabIndex, 0);
    assert(origin.classList.contains('countdown-button')); assert.equal(origin.parentElement, dateOrigin.parentElement);
    assert(origin.parentElement.classList.contains('countdown-controls')); assert.equal(origin.disabled, undefined);
    assert.equal(h.view.copyStatus.textContent, 'Copying milestone…'); assert.equal(h.document.activeElement, origin);
    await settle(); assert.equal(h.view.copyStatus.textContent, 'Milestone copied.'); assert.equal(h.document.activeElement, origin);
    assert.equal(h.view.title.textContent, title); assert.equal(h.view.title.children.length, 0); assert.deepEqual(h.controller.draft, draft);
    assert.equal(h.view.copyMilestoneButton, origin); assert.equal(h.view.copyButton, dateOrigin);
    untouched(h, before, reads); clean(h);
});

for (const targetDate of ['0001-01-01', '0099-12-31', '2000-02-29', '2026-10-17', '9999-12-31']) test(`milestone preserves exact ISO date: ${targetDate}`, async () => {
    const h = model({ state: { title: 'Synthetic exact date', targetDate } }); await settle(); const before = h.raw, reads = h.reads;
    milestoneButton(h).dispatch('click'); assert.deepEqual(h.calls, ['Synthetic exact date\n' + targetDate]);
    await settle(); untouched(h, before, reads); clean(h);
});

for (const failure of ['missing-api', 'missing-method', 'synchronous-throw', 'asynchronous-reject', 'getter-throw']) test(`milestone API failure stays separate, allows explicit retry: ${failure}`, async () => {
    let count = 0;
    const clipboard = failure === 'missing-api' ? null : failure === 'missing-method' ? {} : {
        writeText() { count++; if (failure === 'synchronous-throw') throw Error('synthetic private error'); return Promise.reject(Error('synthetic private error')); }
    };
    if (failure === 'getter-throw') Object.defineProperty(clipboard, 'writeText', { get() { throw Error('synthetic getter'); } });
    const h = model({ clipboard }); await settle(); const before = h.raw, reads = h.reads, origin = milestoneButton(h);
    h.view.status.textContent = 'Synthetic export result'; origin.focus(); origin.dispatch('click'); await settle();
    assert.equal(h.view.copyStatus.textContent, milestoneFailure); assert(h.view.copyStatus.classList.contains('countdown-error'));
    assert.equal(h.view.status.textContent, 'Synthetic export result'); assert.equal(h.document.activeElement, origin);
    assert.equal(origin.getAttribute('aria-disabled'), 'false'); assert.equal(copyButton(h).getAttribute('aria-disabled'), 'false');
    assert.equal(h.view.title.textContent, before.title); assert.equal(h.view.date.textContent, before.targetDate);
    assert.equal(count, ['synchronous-throw', 'asynchronous-reject'].includes(failure) ? 1 : 0);
    await settle(); assert.equal(count, ['synchronous-throw', 'asynchronous-reject'].includes(failure) ? 1 : 0, 'No automatic retry');
    const calls = []; h.window.navigator.clipboard = { writeText(text) { calls.push(text); return Promise.resolve(); } };
    origin.dispatch('click'); await settle(); assert.deepEqual(calls, [before.title + '\n' + before.targetDate]);
    assert.equal(h.view.copyStatus.textContent, 'Milestone copied.'); assert(!h.view.copyStatus.classList.contains('countdown-error'));
    untouched(h, before, reads); clean(h);
});

for (const first of ['date', 'milestone']) test(`both routes share pending lock and latest explicit feedback: ${first} first`, async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    const before = h.raw, reads = h.reads, origins = { date: copyButton(h), milestone: milestoneButton(h) }, second = first === 'date' ? 'milestone' : 'date';
    h.view.status.textContent = 'Synthetic recovery/export feedback'; origins[first].focus(); origins[first].dispatch('click');
    const pending = first === 'date' ? 'Copying date…' : 'Copying milestone…';
    for (let i = 0; i < 3; i++) { origins[second].dispatch('click'); origins[first].dispatch('click'); h.view.refreshCopyControl(); }
    assert.equal(calls.length, 1); assert.equal(h.view.copyStatus.textContent, pending);
    assert.equal(origins.date.getAttribute('aria-disabled'), 'true'); assert.equal(origins.milestone.getAttribute('aria-disabled'), 'true');
    assert.equal(h.document.activeElement, origins[first]); assert.equal(h.view.status.textContent, 'Synthetic recovery/export feedback');
    wait.resolve(); await settle(); assert.equal(h.view.copyStatus.textContent, first === 'date' ? 'Date copied.' : 'Milestone copied.');
    h.window.navigator.clipboard = { writeText(text) { calls.push(text); return Promise.resolve(); } };
    origins[second].dispatch('click'); assert.equal(h.view.copyStatus.textContent, second === 'date' ? 'Copying date…' : 'Copying milestone…');
    await settle(); assert.equal(h.view.copyStatus.textContent, second === 'date' ? 'Date copied.' : 'Milestone copied.');
    assert.deepEqual(calls, first === 'date' ? [before.targetDate, before.title + '\n' + before.targetDate] : [before.title + '\n' + before.targetDate, before.targetDate]);
    assert.equal(h.view.status.textContent, 'Synthetic recovery/export feedback'); untouched(h, before, reads); clean(h);
});

for (const first of ['date', 'milestone']) test(`synchronous clipboard reentrancy cannot start either route: ${first}`, async () => {
    const h = model(); await settle(); const calls = [], expected = first === 'date' ? h.view.date.textContent : milestoneText(h);
    h.window.navigator.clipboard = { writeText(text) { calls.push(text); copyButton(h).dispatch('click'); milestoneButton(h).dispatch('click'); return Promise.resolve(); } };
    (first === 'date' ? copyButton(h) : milestoneButton(h)).dispatch('click'); assert.deepEqual(calls, [expected]);
    await settle(); assert.equal(calls.length, 1); clean(h);
});

for (const route of ['date', 'milestone']) for (const removal of ['before-activation', 'pending', 'settled']) test(`removing sibling leaves actual ${route} source independent: ${removal}`, async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    const origin = route === 'date' ? copyButton(h) : milestoneButton(h), sibling = route === 'date' ? milestoneButton(h) : copyButton(h), controls = origin.parentElement;
    const removeSibling = () => { sibling.remove(); h.mutations([{ type: 'childList', target: controls, removedNodes: [sibling] }]); };
    if (removal === 'before-activation') removeSibling();
    origin.focus(); origin.dispatch('click'); assert.equal(calls.length, 1);
    if (removal === 'pending') removeSibling();
    wait.resolve(); await settle();
    if (removal === 'settled') removeSibling();
    assert.equal(h.view.copyStatus.textContent, route === 'date' ? 'Date copied.' : 'Milestone copied.');
    assert.equal(origin.getAttribute('aria-disabled'), 'false'); assert.equal(h.document.activeElement, origin);
    assert.deepEqual(calls, [route === 'date' ? h.view.date.textContent : milestoneText(h)]); clean(h);
});

for (const route of ['date', 'milestone']) test(`old ${route} callback cannot borrow a replaced current button`, async () => {
    const h = model(); await settle(); const field = route === 'date' ? 'copyButton' : 'copyMilestoneButton', origin = h.view[field];
    const replacement = h.document.createElement('button'); replacement.type = 'button'; origin.replaceWith(replacement); h.view[field] = replacement;
    origin.dispatch('click'); assert.equal(h.calls.length, 0);
    // Copy date's existing direct entry stays usable against its actual current source.
    if (route === 'date') { await h.view.copyDate(); assert.deepEqual(h.calls, ['2030-01-02']); }
    else { await h.view.copyMilestone(); assert.deepEqual(h.calls, [milestoneText(h)]); }
    origin.dispatch('click'); assert.equal(h.calls.length, 1); clean(h);
});

for (const condition of ['unloaded', 'pending', 'error', 'read-error', 'conflict', 'composing', 'closed-controller', 'loading-status', 'saving-status', 'error-status',
    'hidden-host', 'hidden-parent', 'inert', 'css-display', 'css-visibility', 'css-collapse', 'detached', 'closed-details', 'document-hidden', 'visibility-hidden',
    'departing', 'suspended', 'invalidated-workspace', 'suspended-workspace', 'wrong-workspace', 'wrong-session', 'changed-session-id', 'wrong-document',
    'changed-date', 'changed-revision', 'changed-title', 'changed-schema', 'changed-state-object', 'changed-date-text', 'changed-date-time', 'changed-title-text',
    'disabled-state', 'invalid-date', 'invalid-title', 'source-hidden', 'source-disabled', 'source-detached', 'status-detached']) test(`milestone refuses ineligible context: ${condition}`, async () => {
    const h = model(); await settle(); const before = h.raw, reads = h.reads, origin = milestoneButton(h), c = h.controller;
    const changes = {
        unloaded() { c.loaded = false; }, pending() { c.pending = true; }, error() { c.error = Countdown.fault('WRITE'); }, 'read-error'() { c.readError = true; },
        conflict() { c.conflict = true; }, composing() { c.composing = true; }, 'closed-controller'() { c.closed = true; },
        'loading-status'() { c.status = 'loading'; }, 'saving-status'() { c.status = 'saving'; }, 'error-status'() { c.status = 'error'; },
        'hidden-host'() { h.host.hidden = true; }, 'hidden-parent'() { h.wrapper.hidden = true; }, inert() { h.wrapper.inert = true; },
        'css-display'() { h.wrapper.style.display = 'none'; }, 'css-visibility'() { h.wrapper.style.visibility = 'hidden'; }, 'css-collapse'() { h.wrapper.style.visibility = 'collapse'; },
        detached() { h.host.remove(); }, 'closed-details'() { h.wrapper.tagName = 'DETAILS'; h.wrapper.open = false; origin.getClientRects = () => [{}]; },
        'document-hidden'() { h.document.hidden = true; }, 'visibility-hidden'() { h.document.visibilityState = 'hidden'; },
        departing() { h.window.LocalItabContentLifecycle.departing = true; }, suspended() { h.view.suspended = true; },
        'invalidated-workspace'() { h.backend.workspace.invalidated = true; }, 'suspended-workspace'() { h.backend.workspace._suspended = true; },
        'wrong-workspace'() { h.backend.workspace = { id: 'synthetic_B' }; }, 'wrong-session'() { h.window.LocalItabWorkspaces.session = { id: 'synthetic_B' }; },
        'changed-session-id'() { h.backend.workspace.id = 'synthetic_B'; }, 'wrong-document'() { origin.ownerDocument = {}; },
        'changed-date'() { c.state.targetDate = '2031-02-03'; }, 'changed-revision'() { c.state.revision++; }, 'changed-title'() { c.state.title = 'Other'; },
        'changed-schema'() { c.state.schemaVersion++; }, 'changed-state-object'() { c.state = { ...c.state }; },
        'changed-date-text'() { h.view.date.textContent = '2031-02-03'; }, 'changed-date-time'() { h.view.date.dateTime = '2031-02-03'; }, 'changed-title-text'() { h.view.title.textContent = 'Other'; },
        'disabled-state'() { c.state.enabled = false; }, 'invalid-date'() { c.state.targetDate = '2030-02-30'; h.view.render(); },
        'invalid-title'() { c.state.title = 'invalid\nline'; h.view.render(); }, 'source-hidden'() { origin.hidden = true; }, 'source-disabled'() { origin.disabled = true; },
        'source-detached'() { origin.remove(); }, 'status-detached'() { h.view.copyStatus.remove(); }
    };
    changes[condition](); const status = h.view.status.textContent, draft = structuredClone(c.draft); origin.dispatch('click'); await settle();
    assert.equal(h.calls.length, 0); assert.equal(h.view.status.textContent, status); assert.deepEqual(c.draft, draft); untouched(h, before, reads); clean(h);
});

for (const event of [{ isComposing: true }, { keyCode: 229 }, { defaultPrevented: true }, { repeat: true }, { detail: 2 }, { detail: 3 }]) test(`milestone rejects composition/cancelled/repeated click: ${JSON.stringify(event)}`, async () => {
    const h = model(); await settle(); milestoneButton(h).dispatch('click', event); assert.equal(h.calls.length, 0); clean(h);
});

for (const key of ['Enter', ' ']) for (const fields of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) test(`milestone blocks held/IME native activation key ${JSON.stringify({ key, ...fields })}`, async () => {
    const h = model(); await settle(); const origin = milestoneButton(h); origin.focus();
    const event = h.document.activeElement.dispatch('keydown', { key, ...fields }); assert.equal(event.prevented, true); assert.equal(h.calls.length, 0);
    assert.equal(h.document.activeElement, origin); clean(h);
});

for (const key of ['Enter', ' ']) test(`milestone native button accepts modeled ${JSON.stringify(key)} activation without replacing focus`, async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    const before = h.raw, reads = h.reads, origin = milestoneButton(h); origin.focus(); const event = h.document.activeElement.dispatch('keydown', { key });
    assert.equal(event.prevented, false); assert.equal(calls.length, 0, 'Keydown does not add a duplicate write');
    // Explicit modeled native click; this is not a browser key-synthesis claim.
    h.document.activeElement.dispatch('click', { detail: 0 }); assert.deepEqual(calls, [milestoneText(h)]);
    const repeated = h.document.activeElement.dispatch('keydown', { key, repeat: true }); assert(repeated.prevented);
    assert.equal(h.document.activeElement, origin); assert.equal(origin.getAttribute('aria-disabled'), 'true');
    wait.resolve(); await settle(); assert.equal(h.document.activeElement, origin); assert.equal(h.view.copyMilestoneButton, origin);
    const unrelated = origin.dispatch('keydown', { key: 'x', repeat: true }); assert.equal(unrelated.prevented, false); untouched(h, before, reads); clean(h);
});

test('milestone double-click second activation is rejected even after the first write settles', async () => {
    const h = model(); await settle(); const origin = milestoneButton(h); origin.dispatch('click', { detail: 1 }); await settle();
    origin.dispatch('click', { detail: 2 }); await settle(); assert.deepEqual(h.calls, [milestoneText(h)]);
    origin.dispatch('click', { detail: 1 }); await settle(); assert.equal(h.calls.length, 2, 'Later explicit single click remains available'); clean(h);
});

for (const interruption of ['refresh', 'state-mutation', 'read-generation', 'draft-composition', 'save-pending', 'save-error', 'read-error', 'conflict',
    'hide', 'hide-failure', 'edit', 'hide-restore', 'detach-restore', 'queued-hide-restore', 'queued-detach-restore', 'title-ABA', 'date-ABA', 'text-node-ABA',
    'origin-ABA', 'origin-disabled-ABA', 'origin-replaced', 'title-node-replaced', 'date-node-replaced', 'status-node-replaced',
    'document-hide-return', 'blur', 'pagehide-pageshow', 'departing', 'invalidated-workspace', 'workspace-replaced', 'session-replaced', 'destroy']) for (const rejected of [false, true]) test(`milestone late ${rejected ? 'failure' : 'success'} is discarded after ${interruption}`, async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    const origin = milestoneButton(h); origin.dispatch('click'); assert.equal(calls.length, 1);
    const replaceNode = field => { const old = h.view[field], next = h.document.createElement(old.tagName); next.textContent = old.textContent; next.dateTime = old.dateTime; old.replaceWith(next); h.view[field] = next; };
    const changes = {
        async refresh() { await h.controller.refresh(); }, 'state-mutation'() { h.controller.state.title = 'Synthetic changed'; h.view.render(); },
        'read-generation'() { h.controller.readGeneration++; }, 'draft-composition'() { h.controller.setComposing(true); h.controller.setComposing(false); },
        'save-pending'() { h.controller.pending = true; h.controller.emit(); }, 'save-error'() { h.controller.error = Countdown.fault('WRITE'); h.controller.emit(); },
        'read-error'() { h.controller.readError = true; h.controller.emit(); }, conflict() { h.controller.conflict = true; h.controller.emit(); },
        async hide() { h.view.hideButton.dispatch('click'); await settle(); }, async 'hide-failure'() { h.writeFail(true); h.view.hideButton.dispatch('click'); await settle(); assert(!h.view.retry.hidden); },
        edit() { h.view.edit.dispatch('click'); },
        'hide-restore'() { h.wrapper.hidden = true; h.wrapper.hidden = false; h.mutations([{ type: 'attributes', target: h.wrapper, attributeName: 'hidden' }]); },
        'detach-restore'() { h.host.remove(); h.wrapper.append(h.host); h.mutations([{ type: 'childList', target: h.wrapper, removedNodes: [h.host] }]); },
        'queued-hide-restore'() { h.wrapper.hidden = true; h.wrapper.hidden = false; h.mutations([{ type: 'attributes', target: h.wrapper, attributeName: 'hidden' }], true); },
        'queued-detach-restore'() { h.host.remove(); h.wrapper.append(h.host); h.mutations([{ type: 'childList', target: h.wrapper, removedNodes: [h.host] }], true); },
        'title-ABA'() { const title = h.view.title.textContent; h.view.title.textContent = 'Synthetic temporary'; h.view.title.textContent = title; h.mutations([{ type: 'childList', target: h.view.title, removedNodes: [] }], true); },
        'date-ABA'() { const date = h.view.date.textContent; h.view.date.textContent = '2040-01-01'; h.view.date.textContent = date; h.mutations([{ type: 'childList', target: h.view.date, removedNodes: [] }], true); },
        'text-node-ABA'() { const syntheticText = h.document.createElement('span'); h.view.title.append(syntheticText); h.mutations([{ type: 'characterData', target: syntheticText }], true); },
        'origin-ABA'() { const controls = origin.parentElement; origin.remove(); controls.append(origin); h.mutations([{ type: 'childList', target: controls, removedNodes: [origin] }], true); },
        'origin-disabled-ABA'() { origin.disabled = true; origin.disabled = false; h.mutations([{ type: 'attributes', target: origin, attributeName: 'disabled' }], true); },
        'origin-replaced'() { replaceNode('copyMilestoneButton'); }, 'title-node-replaced'() { replaceNode('title'); }, 'date-node-replaced'() { replaceNode('date'); }, 'status-node-replaced'() { replaceNode('copyStatus'); },
        async 'document-hide-return'() { h.document.hidden = true; await h.document.listeners.get('visibilitychange')?.(); h.document.hidden = false; },
        blur() { h.emit('blur'); }, 'pagehide-pageshow'() { h.emit('pagehide'); h.emit('pageshow'); }, departing() { h.window.LocalItabContentLifecycle.departing = true; },
        'invalidated-workspace'() { h.backend.workspace.invalidated = true; }, 'workspace-replaced'() { h.backend.workspace = { id: 'synthetic_A' }; },
        'session-replaced'() { h.window.LocalItabWorkspaces.session = { id: 'synthetic_A' }; }, destroy() { h.view.destroy(); }
    };
    await changes[interruption](); const status = h.view.status.textContent, retryHidden = h.view.retry.hidden, draft = structuredClone(h.controller.draft);
    h.search.focus(); origin.dispatch('click'); copyButton(h).dispatch('click'); assert.equal(calls.length, 1, 'Invalidation never releases the sent write lock');
    if (rejected) wait.reject(Error('synthetic late failure')); else wait.resolve(); await settle();
    assert.equal(h.view.copyStatus.textContent, ''); assert.equal(h.document.activeElement, h.search); assert.equal(h.view.status.textContent, status);
    assert.equal(h.view.retry.hidden, retryHidden); assert.deepEqual(h.controller.draft, draft); clean(h);
});

for (const rejected of [false, true]) test(`date receipt also closes on explicit Edit before late ${rejected ? 'failure' : 'success'}`, async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    copyButton(h).dispatch('click'); h.view.edit.dispatch('click'); milestoneButton(h).dispatch('click'); assert.deepEqual(calls, ['2030-01-02']);
    assert.equal(h.view.copyStatus.textContent, ''); if (rejected) wait.reject(Error('synthetic')); else wait.resolve();
    await settle(); assert.equal(h.view.copyStatus.textContent, ''); clean(h);
});

for (const route of ['date', 'milestone']) test(`actual ${route} disabled source and queued text mutation fail closed`, async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    const origin = route === 'date' ? copyButton(h) : milestoneButton(h); origin.disabled = true; origin.dispatch('click'); assert.equal(calls.length, 0);
    origin.disabled = false; origin.dispatch('click'); assert.equal(calls.length, 1);
    const syntheticText = h.document.createElement('span'); h.view.date.append(syntheticText);
    h.mutations([{ type: 'characterData', target: syntheticText }], true); wait.resolve(); await settle(); assert.equal(h.view.copyStatus.textContent, ''); clean(h);
});

for (const first of ['date', 'milestone']) for (const destroy of [false, true]) test(`dual-route lock survives remount from ${first}, old owner destroyed=${destroy}`, async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    const old = h.view, oldDate = copyButton(h), oldMilestone = milestoneButton(h);
    (first === 'date' ? oldDate : oldMilestone).dispatch('click'); if (destroy) old.destroy();
    const controller = new Controller(new Countdown.Store(h.backend)), next = h.api.mount(h.host, { controller }); await settle();
    assert.equal(next.copyButton.getAttribute('aria-disabled'), 'true'); assert.equal(next.copyMilestoneButton.getAttribute('aria-disabled'), 'true');
    next.copyButton.dispatch('click'); next.copyMilestoneButton.dispatch('click'); oldDate.dispatch('click'); oldMilestone.dispatch('click'); old.render();
    assert.equal(calls.length, 1); assert(h.host.contains(next.copyMilestoneButton)); assert(!h.host.contains(oldMilestone));
    h.search.focus(); wait.resolve(); await settle(); assert.equal(next.copyStatus.textContent, ''); assert.equal(old.copyStatus.textContent, '');
    assert.equal(next.copyMilestoneButton.getAttribute('aria-disabled'), 'false'); assert.equal(next.copyButton.getAttribute('aria-disabled'), 'false');
    assert.equal(h.document.activeElement, h.search); next.copyMilestoneButton.dispatch('click'); await settle(); assert.equal(calls.length, 2);
    assert.equal(next.copyStatus.textContent, 'Milestone copied.'); oldDate.dispatch('click'); oldMilestone.dispatch('click'); assert.equal(calls.length, 2);
    old.destroy(); next.destroy(); assert.equal(h.observers.size, 0);
});

for (const first of ['date', 'milestone']) test(`another card shares both routes' pending lock from ${first}`, async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    const otherHost = h.document.createElement('article'); h.wrapper.append(otherHost);
    const otherController = new Controller(new Countdown.Store(h.backend)), other = h.api.mount(otherHost, { controller: otherController }); await settle();
    (first === 'date' ? copyButton(h) : milestoneButton(h)).dispatch('click');
    for (const origin of [other.copyButton, other.copyMilestoneButton]) { assert.equal(origin.getAttribute('aria-disabled'), 'true'); origin.dispatch('click'); }
    assert.equal(calls.length, 1); assert.equal(other.copyStatus.textContent, ''); wait.resolve(); await settle();
    assert.equal(other.copyButton.getAttribute('aria-disabled'), 'false'); assert.equal(other.copyMilestoneButton.getAttribute('aria-disabled'), 'false');
    other.copyMilestoneButton.dispatch('click'); await settle(); assert.equal(calls.length, 2); assert.equal(other.copyStatus.textContent, 'Milestone copied.');
    other.destroy(); clean(h);
});

test('settling an old milestone never enables an unavailable replacement card', async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    milestoneButton(h).dispatch('click'); h.view.destroy();
    const controller = new Controller(new Countdown.Store(h.backend)), next = h.api.mount(h.host, { controller }); await settle();
    controller.error = Countdown.fault('WRITE'); controller.emit(); const status = next.status.textContent;
    wait.resolve(); await settle(); assert.equal(next.copyButton.getAttribute('aria-disabled'), 'true'); assert.equal(next.copyMilestoneButton.getAttribute('aria-disabled'), 'true');
    next.copyButton.dispatch('click'); next.copyMilestoneButton.dispatch('click'); assert.equal(calls.length, 1);
    assert.equal(next.copyStatus.textContent, ''); assert.equal(next.status.textContent, status); next.destroy();
});

test('saved card milestone leaves a separate settings draft, focus and status untouched', async () => {
    const h = model(); await settle(); const host = h.document.createElement('section'); h.wrapper.append(host);
    const controller = new Controller(new Countdown.Store(h.backend)), settings = h.api.mountSettings(host, { controller }); await settle();
    settings.title.value = 'Synthetic settings-only title'; settings.title.dispatch('input'); settings.date.value = '2040-01-01'; settings.date.dispatch('input');
    settings.enabled.checked = false; settings.enabled.dispatch('change');
    const draft = structuredClone(controller.draft), before = h.raw, reads = h.reads, status = settings.status.textContent;
    assert.equal(settings.copyMilestoneButton, undefined); assert.equal(host.querySelectorAll('button').some(node => node.textContent === 'Copy milestone'), false);
    settings.date.focus(); milestoneButton(h).dispatch('click'); await settle();
    assert.deepEqual(h.calls, [before.title + '\n' + before.targetDate]); assert.deepEqual(controller.draft, draft);
    assert.equal(settings.title.value, 'Synthetic settings-only title'); assert.equal(settings.date.value, '2040-01-01'); assert.equal(settings.enabled.checked, false);
    assert.equal(settings.status.textContent, status); assert.equal(h.document.activeElement, settings.date); untouched(h, before, reads); settings.destroy(); clean(h);
});

for (const failedOperation of ['read', 'save', 'hide']) test(`real Store ${failedOperation} failure blocks both copy actions until explicit Retry recovers`, async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    milestoneButton(h).dispatch('click');
    if (failedOperation === 'read') { h.readFail(true); await assert.rejects(h.controller.refresh(), error => error.code === 'READ'); }
    else {
        h.writeFail(true);
        if (failedOperation === 'save') { h.controller.setDraft({ title: 'Synthetic new saved value', targetDate: '2042-02-03' }); await assert.rejects(h.controller.save(), error => error.code === 'WRITE'); }
        else await assert.rejects(h.controller.setEnabled(false), error => error.code === 'WRITE');
    }
    assert(!h.view.retry.hidden); const status = h.view.status.textContent, draft = structuredClone(h.controller.draft), reads = h.reads, writes = h.writes, before = h.raw;
    copyButton(h).dispatch('click'); milestoneButton(h).dispatch('click'); wait.reject(Error('synthetic late clipboard error')); await settle();
    assert.equal(calls.length, 1); assert.equal(h.view.copyStatus.textContent, ''); assert.equal(h.view.status.textContent, status);
    assert.deepEqual(h.controller.draft, draft); untouched(h, before, reads, writes); assert(!h.view.retry.hidden);
    h.readFail(false); h.writeFail(false); await h.controller.retry(); assert.equal(h.controller.error, null); assert.equal(h.controller.readError, false);
    if (failedOperation === 'hide') { assert(h.host.hidden); copyButton(h).dispatch('click'); milestoneButton(h).dispatch('click'); assert.equal(calls.length, 1); }
    else {
        const next = [], recovered = h.raw, recoveredReads = h.reads, recoveredWrites = h.writes;
        h.window.navigator.clipboard = { writeText(text) { next.push(text); return Promise.resolve(); } }; milestoneButton(h).dispatch('click'); await settle();
        assert.deepEqual(next, [recovered.title + '\n' + recovered.targetDate]); assert.equal(h.view.copyStatus.textContent, 'Milestone copied.');
        untouched(h, recovered, recoveredReads, recoveredWrites);
    }
    clean(h);
});

test('real competing save invalidates milestone and preserves conflict/recovery ownership', async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    h.controller.setDraft({ title: 'Synthetic unsaved local title' }); milestoneButton(h).dispatch('click');
    const other = new Controller(new Countdown.Store(h.backend)); await other.init(); other.setDraft({ title: 'Synthetic other page saved', targetDate: '2050-02-03' }); await other.save(); await settle();
    assert(h.controller.conflict); assert.equal(h.controller.draft.title, 'Synthetic unsaved local title'); const status = h.view.status.textContent, reads = h.reads, before = h.raw, writes = h.writes;
    copyButton(h).dispatch('click'); milestoneButton(h).dispatch('click'); wait.resolve(); await settle();
    assert.equal(calls.length, 1); assert.equal(h.view.copyStatus.textContent, ''); assert.equal(h.view.status.textContent, status);
    assert.equal(h.view.useSaved.hidden, false); untouched(h, before, reads, writes);
    await h.controller.useSaved(); const next = []; h.window.navigator.clipboard = { writeText(text) { next.push(text); return Promise.resolve(); } };
    milestoneButton(h).dispatch('click'); await settle(); assert.deepEqual(next, ['Synthetic other page saved\n2050-02-03']); other.destroy(); clean(h);
});

for (const readFirst of [false, true]) test(`milestone uses only loaded snapshot with real held background refresh, read first=${readFirst}`, async () => {
    const wait = deferred(), read = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    h.readHold(read.promise); let refreshing;
    if (readFirst) { refreshing = h.controller.refresh(); await settle(); }
    const before = h.raw, reads = h.reads; milestoneButton(h).dispatch('click'); assert.deepEqual(calls, [before.title + '\n' + before.targetDate]);
    assert.equal(h.reads, reads, 'Copy starts no freshness read');
    if (!readFirst) { refreshing = h.controller.refresh(); await settle(); wait.resolve(); await settle(); assert.equal(h.view.copyStatus.textContent, ''); }
    read.resolve(); await refreshing; wait.resolve(); await settle(); assert.equal(h.view.copyStatus.textContent, ''); assert.deepEqual(h.raw, before); assert.equal(h.writes, 0); clean(h);
});

for (const named of [false, true]) test(`real Manager/Session milestone stays pinned to ${named ? 'named' : 'Default'} A with next-new-tab B`, async () => {
    const f = namespaces(); await f.manager.ready();
    const a = f.manager.capture(named ? (await f.manager.create('Synthetic A')).id : Workspaces.DEFAULT_ID); await a.ready();
    const b = f.manager.capture((await f.manager.create('Synthetic B')).id); await b.ready();
    await a.local.set({ [Countdown.KEY]: saved({ title: 'Synthetic A 中😀', targetDate: '2032-02-29' }) });
    await b.local.set({ [Countdown.KEY]: saved({ title: 'Synthetic B', targetDate: '2040-03-01' }) });
    const h = model({ session: a, backend: a.createBackend(Countdown.KEY) }); await settle(); await f.manager.select(b.id); await settle();
    const settingsController = new Controller(new Countdown.Store(a.createBackend(Countdown.KEY))); await settingsController.init();
    settingsController.setDraft({ targetDate: '2099-12-31', title: 'Synthetic A settings draft' });
    const before = structuredClone(f.raw), reads = f.reads, writes = f.writes.length, draft = structuredClone(settingsController.draft);
    milestoneButton(h).dispatch('click'); assert.deepEqual(h.calls, ['Synthetic A 中😀\n2032-02-29']); await settle();
    assert.equal(f.reads, reads); assert.equal(f.writes.length, writes); assert.deepEqual(f.raw, before); assert.deepEqual(settingsController.draft, draft);
    h.window.LocalItabWorkspaces.session = b; milestoneButton(h).dispatch('click'); assert.equal(h.calls.length, 1);
    h.window.LocalItabWorkspaces.session = a; h.backend.workspace = b; milestoneButton(h).dispatch('click'); assert.equal(h.calls.length, 1);
    assert.deepEqual(f.raw, before); assert.equal(f.reads, reads); assert.equal(f.writes.length, writes); settingsController.destroy(); clean(h);
});

test('unchanged milestone minute/midnight render keeps stable controls and live feedback', async () => {
    const h = model(); await settle(); const before = h.raw, reads = h.reads, origin = milestoneButton(h), dateOrigin = copyButton(h);
    origin.focus(); origin.dispatch('click'); await settle(); let value = h.view.copyStatus.textContent, updates = 0;
    Object.defineProperty(h.view.copyStatus, 'textContent', { get: () => value, set(text) { updates++; value = text; }, configurable: true });
    for (const date of [new Date(2029, 11, 31, 12, 1), new Date(2030, 0, 1), new Date(2030, 0, 2)]) {
        h.now(date); h.tick(); assert.equal(value, 'Milestone copied.'); assert.equal(updates, 0); assert.equal(h.timers.size, 1);
        assert.equal(h.view.copyMilestoneButton, origin); assert.equal(h.view.copyButton, dateOrigin); assert.equal(h.document.activeElement, origin);
    }
    assert.equal(h.view.remaining.textContent, 'Today'); assert.equal(h.view.remaining.getAttribute('aria-live'), 'off');
    assert.equal(h.view.copyStatus.getAttribute('role'), 'status'); assert.equal(h.view.copyStatus.getAttribute('aria-live'), 'polite'); untouched(h, before, reads); clean(h);
});

for (const locale of ['en', 'zh_CN', 'fallback']) test(`milestone-specific labels and status have exact ${locale} text`, async () => {
    const h = model(locale === 'fallback' ? {} : { locale }); await settle(); const origin = milestoneButton(h), zh = locale === 'zh_CN';
    assert.equal(origin.textContent, zh ? '复制里程碑' : 'Copy milestone'); origin.dispatch('click');
    assert.equal(h.view.copyStatus.textContent, zh ? '正在复制里程碑…' : 'Copying milestone…'); await settle();
    assert.equal(h.view.copyStatus.textContent, zh ? '已复制里程碑。' : 'Milestone copied.');
    h.window.navigator.clipboard = null; origin.dispatch('click'); await settle();
    assert.equal(h.view.copyStatus.textContent, zh ? '未能复制里程碑。请再次选择“复制里程碑”，或选中标题和日期手动复制。' : milestoneFailure);
    assert.equal(copyButton(h).textContent, zh ? '复制日期' : 'Copy date'); clean(h);
});

test('missing translation keys fall back for the new control and all three statuses', async () => {
    const h = model(); await settle(); h.window.i18n = { t: key => key };
    const nextHost = h.document.createElement('article'); h.wrapper.append(nextHost); const next = h.api.mount(nextHost, { controller: new Controller(new Countdown.Store(h.backend)) }); await settle();
    assert.equal(next.copyMilestoneButton.textContent, 'Copy milestone'); next.copyMilestoneButton.dispatch('click'); assert.equal(next.copyStatus.textContent, 'Copying milestone…');
    await settle(); assert.equal(next.copyStatus.textContent, 'Milestone copied.'); h.window.navigator.clipboard = null; next.copyMilestoneButton.dispatch('click'); await settle();
    assert.equal(next.copyStatus.textContent, milestoneFailure); next.destroy(); clean(h);
});
