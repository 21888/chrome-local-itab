'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const Workspaces = require('../shared/workspaces');
const Countdown = require('../shared/local-countdown-store');
const { Controller } = require('../shared/local-countdown-controller');
const copy = value => structuredClone(value);
const state = title => ({ ...Countdown.initial(), enabled: true, title, targetDate: '2030-01-01' });

// Real Manager/Session and Countdown controller/store, with synthetic storage,
// locks and DOM only. No browser profile, provider or native navigation is used.
function fixture() {
    const raw = {}, writes = [], listeners = new Set(), queues = new Map();
    let serial = 0;
    const local = {
        async get(keys) {
            if (keys == null) return copy(raw);
            return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => Object.hasOwn(raw, key)).map(key => [key, copy(raw[key])]));
        },
        async set(values) {
            writes.push(copy(values));
            const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { oldValue: copy(raw[key]), newValue: copy(value) }]));
            Object.assign(raw, copy(values)); listeners.forEach(fn => fn(changes, 'local'));
        },
        async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete raw[key]; }
    };
    const locks = { request(name, options, action) {
        action ||= options;
        const next = (queues.get(name) || Promise.resolve()).then(action);
        queues.set(name, next.catch(() => {})); return next;
    } };
    const chrome = { runtime: { getURL: path => `chrome-extension://synthetic/${path}` }, storage: {
        local, onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) }
    } };
    const manager = Workspaces.createManager({ chrome, locks, now: () => '2026-10-16T00:00:00.000Z', id: () => `synthetic_${++serial}` });
    return { raw, writes, chrome, manager };
}

function card(session, controller, { helper = true, runtime = true } = {}) {
    const document = createDocument(), api = { ...Countdown, Controller };
    const window = { document, LocalItabCountdown: api, LocalItabWorkspaces: { session },
        chrome: runtime ? { runtime: { getURL: path => `chrome-extension://synthetic/${path}` } } : undefined,
        setTimeout() { return 1; }, clearTimeout() {}, addEventListener() {}, removeEventListener() {} };
    // Match the page's script order: both definitions exist before the card mounts.
    vm.runInNewContext(fs.readFileSync(require.resolve('../shared/local-countdown-view'), 'utf8'), { window, document });
    const helperCalls = [];
    if (helper) {
        vm.runInNewContext(fs.readFileSync(require.resolve('../shared/workspaces-view'), 'utf8'), { window, document });
        const settingsUrl = window.LocalItabWorkspacesView.settingsUrl;
        window.LocalItabWorkspacesView.settingsUrl = (...args) => { helperCalls.push(args); return settingsUrl(...args); };
    }
    const host = document.createElement('article'); document.body.append(host);
    const view = api.mount(host, { controller });
    return { view, helperCalls };
}

for (const named of [false, true]) test(`Countdown Edit keeps the captured ${named ? 'named A' : 'Default A'} session when another page selects B`, async t => {
    const f = fixture(); await f.manager.ready();
    const aId = named ? (await f.manager.create('Synthetic A')).id : Workspaces.DEFAULT_ID;
    const a = f.manager.capture(aId); await a.ready();
    const b = f.manager.capture((await f.manager.create('Synthetic B')).id); await b.ready();
    await a.local.set({ [Countdown.KEY]: state('Synthetic A milestone') });
    await b.local.set({ [Countdown.KEY]: state('Synthetic B milestone') });
    await f.manager.select(a.id);
    const controller = new Controller(new Countdown.Store(a.createBackend(Countdown.KEY)));
    const { view, helperCalls } = card(a, controller); t.after(() => view.destroy()); await controller.init();
    await f.manager.select(b.id); view.render();
    assert.equal(a.id, aId); assert.equal((await f.manager.list()).lastUsedId, b.id);
    const beforeClick = copy(f.raw), writeCount = f.writes.length;
    const event = view.edit.dispatch('click');
    assert.equal(event.prevented, false); assert.equal(view.edit.tagName, 'A');
    assert.equal(view.edit.target, '_blank'); assert.equal(view.edit.rel, 'noopener');
    assert.deepEqual(f.raw, beforeClick); assert.equal(f.writes.length, writeCount, 'link activation must not write or select a workspace');
    const url = new URL(view.edit.href);
    assert.equal(url.hash, '#countdown-settings'); assert.equal(url.searchParams.get('workspace'), a.id);
    assert.deepEqual(helperCalls, [[a.id, 'countdown-settings']], 'use the existing real settings URL helper');
    const target = f.manager.capture(url.searchParams.get('workspace') || undefined); await target.ready();
    const settings = new Controller(new Countdown.Store(target.createBackend(Countdown.KEY))); t.after(() => settings.destroy()); await settings.init();
    assert.equal(target.id, a.id); assert.equal(settings.state.title, 'Synthetic A milestone');
    assert.deepEqual(f.raw, beforeClick); assert.equal(f.writes.length, writeCount, 'opening the linked session is read-only');
    settings.setDraft({ title: 'Edited A milestone' }); await settings.save();
    assert.equal((await a.local.get([Countdown.KEY]))[Countdown.KEY].title, 'Edited A milestone');
    assert.deepEqual((await b.local.get([Countdown.KEY]))[Countdown.KEY], state('Synthetic B milestone'));
    assert.equal((await f.manager.list()).lastUsedId, b.id, 'editing A must not change the next-new-tab preference');
});

for (const runtime of [false, true]) test(`Countdown Edit fallback preserves a known workspace (${runtime ? 'extension' : 'relative'} URL)`, async t => {
    const controller = new Controller(new Countdown.Store({ lock: action => action(), async read() { return state('Synthetic milestone'); }, subscribe() { return () => {}; } }));
    const id = 'synthetic_A';
    const { view } = card({ id }, controller, { helper: false, runtime }); t.after(() => view.destroy()); await controller.init();
    const base = runtime ? 'chrome-extension://synthetic/' : '';
    assert.equal(view.edit.href, `${base}options.html?workspace=${encodeURIComponent(id)}#countdown-settings`);
    assert.equal(view.edit.target, '_blank'); assert.equal(view.edit.rel, 'noopener');
});

test('Countdown Edit remains compatible without a workspace session or runtime helper', async t => {
    const controller = new Controller(new Countdown.Store({ lock: action => action(), async read() { return state('Synthetic milestone'); }, subscribe() { return () => {}; } }));
    const { view } = card(undefined, controller, { helper: false, runtime: false }); t.after(() => view.destroy()); await controller.init();
    assert.equal(view.edit.href, 'options.html#countdown-settings');
});
