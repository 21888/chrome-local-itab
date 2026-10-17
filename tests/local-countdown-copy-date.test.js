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
