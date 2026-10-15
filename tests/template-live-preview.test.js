'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const StorageManager = require('../storage');
const registry = require('../shared/dashboard-template-registry');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const { createHarness } = require('./helpers/dashboard-harness');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const source = file => fs.readFileSync(file, 'utf8');

function fixture({ immediate = false, language = 'en', initial, current = () => true } = {}) {
    const manager = new StorageManager();
    const state = initial ? clone(initial) : { ...manager.cloneDefaultConfig(), __localItabSettingsGeneration: 'settings-one' };
    const listeners = [], writes = [], hooks = {}, events = new Map(), sync = [];
    let queue = Promise.resolve(), held = false;
    Object.defineProperty(global, 'navigator', { configurable: true, value: { locks: { request(name, fn) {
        const result = queue.then(async () => { held = true; try { return await fn(); } finally { held = false; } });
        queue = result.catch(() => {}); return result;
    } } } });
    global.chrome = { storage: { local: {
        async get(keys) { await hooks.get?.(keys); return keys == null ? clone(state) : Object.fromEntries(keys.filter(key => key in state).map(key => [key, clone(state[key])])); },
        async set(values) {
            assert(held, 'every template write is under the existing local lock');
            await hooks.set?.(values);
            const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { oldValue: clone(state[key]), newValue: clone(value) }]));
            Object.assign(state, clone(values)); writes.push(clone(values));
            for (const fn of listeners) fn(changes, 'local');
            await hooks.afterSet?.(values);
        }
    }, onChanged: { addListener(fn) { listeners.push(fn); }, removeListener() {} } } };
    manager.ensureSyncInitialized = async () => assert.fail('Preview must not initialize Sync');
    manager.isSyncEnabledLocally = async () => { sync.push('enabled-check'); return state.sync?.enabled === true; };
    manager.scheduleSyncPush = () => { sync.push('scheduled'); };
    const document = createDocument(), host = document.createElement('div'); document.body.append(host);
    const draft = document.createElement('textarea'); draft.value = 'Unsubmitted task / scratchpad draft'; document.body.append(draft);
    const messages = JSON.parse(source(`_locales/${language}/messages.json`));
    const window = { document, storageManager: manager, LocalItabTemplates: registry,
        chrome: { i18n: { getUILanguage: () => language } }, i18n: { t: key => messages[key]?.message || key },
        addEventListener(type, fn) { const handlers = events.get(type) || []; handlers.push(fn); events.set(type, handlers); } };
    const context = { window, console }; vm.createContext(context);
    for (const file of ['shared/dashboard-template-gallery.js', 'shared/appearance.js']) vm.runInContext(source(file), context);
    let starts = 0, ends = 0;
    const controller = window.LocalItabAppearance.mount(host, { storage: manager, initial: manager.resolveAppearance(state),
        baseline: { generation: state.__localItabSettingsGeneration ?? null }, previewEnabled: !immediate,
        onPreviewStart: () => { starts++; return true; }, onPreviewEnd: () => { ends++; }, isPreviewCurrent: current });
    const details = host.querySelector('details'); details.open = true;
    return { manager, state, writes, hooks, sync, document, draft, host, details, controller,
        get starts() { return starts; }, get ends() { return ends; },
        event(type, event = {}) { for (const fn of events.get(type) || []) fn(event); },
        notify(changes) { for (const fn of listeners) fn(changes, 'local'); },
        async settle() { for (let i = 0; i < 6; i++) { await tick(); await queue; } } };
}

test('new-tab gallery previews A/B/C real root without writes, and Cancel rereads saved state preserving unrelated drafts', async () => {
    const h = fixture(), original = clone(h.state);
    for (const id of ['graphite', 'folio', 'today']) {
        assert(await h.controller.previewTemplate(id));
        assert.equal(h.document.documentElement.dataset.dashboardTemplate, id);
    }
    assert.equal(h.starts, 1); assert.equal(h.writes.length, 0); assert.equal(h.sync.length, 0);
    assert(h.host.querySelector('[data-appearance-field="template"]').disabled);
    h.state.appearance = { template: 'paper', colorMode: 'dark' }; // missed notification: Cancel must read again
    await h.controller.cancelTemplatePreview();
    assert.equal(h.document.documentElement.dataset.dashboardTemplate, 'paper');
    assert.equal(h.document.documentElement.dataset.colorMode, 'dark');
    assert.equal(h.draft.value, 'Unsubmitted task / scratchpad draft');
    assert.equal(h.writes.length, 0); assert.equal(h.sync.length, 0); assert.equal(h.ends, 1);
    delete original.appearance; const after = clone(h.state); delete after.appearance; assert.deepEqual(after, original);
    assert.equal(h.host.querySelector('.template-preview-actions').hidden, true);
});

test('Apply is explicit, repeat-safe, template-only and confirmed before success; opted-in Sync schedules afterward', async () => {
    const h = fixture(); h.state.sync.enabled = true;
    h.state.appearance = { template: 'clarity', colorMode: 'dark', future: { keep: true }, customization: { cardPadding: 22 } };
    const before = clone(h.state);
    await h.controller.previewTemplate('folio');
    const gate = deferred(), entered = deferred(); h.hooks.set = async () => { entered.resolve(); await gate.promise; };
    const apply = h.controller.applyTemplatePreview(); await entered.promise;
    assert.equal(await h.controller.applyTemplatePreview(), false);
    assert.equal(h.writes.length, 0); assert.equal(h.sync.length, 0);
    assert.equal(h.host.dataset.saveState, 'preview-saving'); gate.resolve();
    assert.equal(await apply, true); await h.settle();
    assert.deepEqual(h.state, { ...before, appearance: { ...before.appearance, template: 'folio' } });
    assert.equal(h.writes.length, 1); assert.deepEqual(h.sync, ['enabled-check', 'scheduled']);
    assert.equal(h.controller.preview, null); assert.equal(h.ends, 1);
});

test('source changes and settings replacement invalidate preview without replaying old snapshots', async () => {
    for (const key of ['appearance', '__localItabSettingsGeneration', 'links', 'layout']) {
        const h = fixture(); await h.controller.previewTemplate('folio');
        const next = key === 'appearance' ? { template: 'paper', colorMode: 'dark' } : key === '__localItabSettingsGeneration' ? 'replacement' : clone(h.state[key]);
        h.state[key] = next; h.notify({ [key]: { newValue: next } }); await h.settle();
        assert.equal(h.controller.preview, null); assert.equal(await h.controller.applyTemplatePreview(), false);
        assert.equal(h.writes.length, 0); assert.equal(h.sync.length, 0);
        assert.equal(h.document.documentElement.dataset.dashboardTemplate, h.state.appearance.template);
    }
});

test('external appearance while Apply waits for lock cancels; it is never mistaken for our own event', async () => {
    const h = fixture(); await h.controller.previewTemplate('folio');
    const gate = deferred(), entered = deferred();
    const hold = navigator.locks.request('local-itab-local-write', async () => { entered.resolve(); await gate.promise; });
    await entered.promise;
    const result = h.controller.applyTemplatePreview();
    h.state.appearance = { template: 'today', colorMode: 'dark' };
    h.notify({ appearance: { newValue: clone(h.state.appearance) } });
    gate.resolve(); await hold;
    assert.equal(await result, false); await h.settle();
    assert.equal(h.writes.length, 0); assert.equal(h.document.documentElement.dataset.dashboardTemplate, 'today');
});

test('Close, disclosure collapse and Escape invalidate a delayed admission without late paint or write', async () => {
    for (const close of ['button', 'toggle', 'escape']) {
        const h = fixture(), gate = deferred(), entered = deferred(); let first = true;
        h.hooks.get = async () => { if (first) { first = false; entered.resolve(); await gate.promise; } };
        const pending = h.controller.previewTemplate('folio'); await entered.promise;
        if (close === 'button') h.host.querySelector('.template-preview-close').dispatch('click');
        if (close === 'toggle') { h.details.open = false; h.details.dispatch('toggle'); }
        if (close === 'escape') h.event('keydown', { key: 'Escape', preventDefault() {} });
        gate.resolve(); assert.equal(await pending, false); await h.settle();
        assert.equal(h.document.documentElement.dataset.dashboardTemplate, 'clarity');
        assert.equal(h.writes.length, 0); assert.equal(h.ends, 1); assert.equal(h.controller.preview, null);
    }
});

test('pagehide drops volatile preview and blocks queued Apply; pageshow never revives the candidate', async () => {
    const h = fixture(); await h.controller.previewTemplate('folio');
    const gate = deferred(), entered = deferred();
    const hold = navigator.locks.request('local-itab-local-write', async () => { entered.resolve(); await gate.promise; }); await entered.promise;
    const apply = h.controller.applyTemplatePreview(); h.event('pagehide');
    assert.equal(h.document.documentElement.dataset.dashboardTemplate, 'clarity'); gate.resolve(); await hold;
    assert.equal(await apply, false); await h.settle(); assert.equal(h.writes.length, 0);
    h.event('pageshow'); await h.settle(); assert.equal(h.document.documentElement.dataset.dashboardTemplate, 'clarity');
});

test('readback failure keeps committed bytes, reports unconfirmed, retires ticket, and never rolls back', async () => {
    const h = fixture(); await h.controller.previewTemplate('folio');
    h.hooks.afterSet = () => { h.hooks.get = () => { throw new Error('readback unavailable'); }; };
    assert.equal(await h.controller.applyTemplatePreview(), false); await h.settle();
    assert.equal(h.state.appearance.template, 'folio'); assert.equal(h.writes.length, 1); assert.equal(h.sync.length, 0);
    assert.equal(h.controller.preview, null); assert.equal(h.controller.saveError.code, 'APPEARANCE_SAVE_UNCONFIRMED');
    assert.match(h.host.querySelector('.appearance-status').textContent, /may have completed/);
    assert.equal(await h.controller.applyTemplatePreview(), false); assert.equal(h.writes.length, 1);
    delete h.hooks.get; delete h.hooks.afterSet;
    assert(await h.controller.previewTemplate('paper')); assert.equal(h.controller.confirmed.template, 'folio');
    await h.controller.cancelTemplatePreview(); assert.equal(h.document.documentElement.dataset.dashboardTemplate, 'folio');
});

test('failed write is never success; a new preview uses fresh saved state, and pending ordinary saves reject admission', async () => {
    const h = fixture(); await h.controller.previewTemplate('folio');
    h.hooks.set = () => { throw new Error('write failed'); };
    assert.equal(await h.controller.applyTemplatePreview(), false); assert.equal(h.state.appearance.template, 'clarity');
    assert.equal(h.writes.length, 0); assert.equal(h.controller.preview, null);
    h.controller.pending = 1; assert.equal(await h.controller.previewTemplate('paper'), false); h.controller.pending = 0;
    delete h.hooks.set; assert(await h.controller.previewTemplate('paper')); await h.controller.cancelTemplatePreview();
});

test('changed page Session/current owner cannot apply a storage ticket from the former dashboard', async () => {
    let valid = true; const h = fixture({ current: () => valid }); await h.controller.previewTemplate('folio');
    valid = false; assert.equal(await h.controller.applyTemplatePreview(), false); assert.equal(h.writes.length, 0);
});

test('Settings gallery retains direct-save semantics and truthful schematic copy in English and Chinese', async () => {
    for (const language of ['en', 'zh_CN']) {
        const h = fixture({ immediate: true, language });
        h.manager.ensureSyncInitialized = async () => {};
        h.host.querySelector('[data-template-choice="folio"]').dispatch('click'); await h.controller.queue;
        assert.equal(h.writes.length, 1); assert.equal(h.state.appearance.template, 'folio');
        assert.equal(h.host.querySelector('.template-preview-actions'), null);
        assert.match(h.host.querySelector('.template-gallery-help').textContent, language === 'en' ? /Choose a template to save/ : /点击模板即保存/);
    }
});

function dashboard({ free = false } = {}) {
    const h = createHarness([{ title: 'One', url: 'https://example.com/one', icon: 'O', category: 'work', layoutId: 'one' },
        { title: 'Two', url: 'https://example.com/two', icon: 'T', category: 'social', layoutId: 'two' }]);
    const c = h.component;
    h.context.window.LocalItabTemplates = registry;
    h.context.window.categoryNavigation.currentCategory = 'all';
    c.layout = { autoArrange: !free, alignToGrid: false, columns: 4, gridSize: 96, positions: {}, positionsById: { one: { hidden: { x: 887.5, y: -5.125 } } } };
    c.positions = c.layout.positions; c.identityPositions = c.layout.positionsById;
    c.applyLayoutMode = h.context.ShortcutsComponent.prototype.applyLayoutMode;
    c.reflowVisibleLayout = h.context.ShortcutsComponent.prototype.reflowVisibleLayout;
    const providers = [], peek = [];
    h.context.window.faviconCache = { getOriginFromUrl: url => new URL(url).origin,
        peekIconDataUrl: async url => { peek.push(url); return null; },
        getIconDataUrl() { providers.push('fetch/cache'); return null; }, getIconDataUrlByUrl() { providers.push('fetch/cache'); return null; } };
    h.context.localStorage = { setItem: () => assert.fail('preview must not save category') };
    return { ...h, providers, peek };
}

test('Free preview, late layout refresh, category/resize/reflow and Cancel do not initialize or leak any coordinates', async () => {
    const h = dashboard({ free: true }), c = h.component;
    const before = clone({ layout: c.layout, positions: c.positions, identity: c.identityPositions, links: c.links });
    c.ensureLayoutController = () => assert.fail('preview cannot initiate layout persistence or identity migration');
    assert(c.beginTemplatePreview());
    for (const width of [320, 1440, 480]) for (const template of ['graphite', 'folio', 'today', 'clarity']) {
        h.grid.rect.width = width; h.document.documentElement.dataset.dashboardTemplate = template;
        c.refreshTemplate(); c.reflowVisibleLayout(); c.applyLayoutMode(); c.initializeMissingPositions();
        h.context.window.categoryNavigation.selectCategory('social');
        assert.equal(await c.saveLayoutDebounced({ new: { x: 1, y: 2 } }), false);
        assert.equal(await c.setLayout({ autoArrange: true }), false);
    }
    assert.equal(h.context.window.categoryNavigation.currentCategory, 'all');
    assert.deepEqual(clone({ layout: c.layout, positions: c.positions, identity: c.identityPositions, links: c.links }), before);
    c.endTemplatePreview(); assert.equal(c.container.inert, false); assert.equal(h.providers.length, 0);
    assert.deepEqual(clone(c.identityPositions), before.identity);
});

test('Grid preview and Cancel regroup real shortcuts with cache-only icons and preserve module draft nodes', async () => {
    const h = dashboard(), c = h.component, draft = h.search; draft.value = 'Keep draft';
    assert(c.beginTemplatePreview());
    for (const template of ['folio', 'clarity', 'graphite', 'clarity']) {
        h.document.documentElement.dataset.dashboardTemplate = template; c.refreshTemplate();
        assert.equal(c.usesCollections(), registry.usesCollections(template));
        assert.equal(h.document.body.contains(draft), true); assert.equal(draft.value, 'Keep draft');
    }
    await tick(); assert(h.peek.length > 0); assert.equal(h.providers.length, 0);
    c.endTemplatePreview();
    h.document.documentElement.dataset.dashboardTemplate = 'folio'; c.refreshTemplate();
    assert(h.providers.length > 0, 'normal favicon behavior resumes outside preview');
});

test('preview refuses incompatible shortcut/layout work without dropping it', () => {
    for (const field of ['_pendingSave', '_pendingDelete', '_shortcutOrderPending', '_shortcutUndoPending', '_shortcutWritesPending']) {
        const h = dashboard(); h.component[field] = true;
        assert.equal(h.component.beginTemplatePreview(), false); assert.equal(h.component[field], true);
    }
    const h = dashboard(); h.component.modal.classList.add('active');
    assert.equal(h.component.beginTemplatePreview(), false); assert(h.component.modal.classList.contains('active'));
});

test('late Grid-to-Free read reconciles grouped markup while preview still blocks every missing-position write', () => {
    const h = dashboard(), c = h.component;
    h.document.documentElement.dataset.dashboardTemplate = 'graphite';
    assert(c.beginTemplatePreview()); c.refreshTemplate();
    assert(h.grid.querySelector('.shortcut-collection'));
    c.layout.autoArrange = false;
    c.applyLayoutMode();
    h.document.documentElement.dataset.dashboardTemplate = 'clarity'; c.refreshTemplate(); c.endTemplatePreview();
    assert.equal(h.grid.querySelector('.shortcut-collection'), null);
    assert.equal(c.usesCollections(), false); assert(h.grid.classList.contains('free-layout'));
    assert.deepEqual(clone(c.layout.positions), {});
});

test('cache-only favicon reads can finish on the current restored node after Cancel, but detached previews stay retired', async () => {
    const h = dashboard(), c = h.component, reads = [];
    const image = 'data:image/png;base64,' + 'A'.repeat(240);
    h.context.isSafeImageDataUrl = () => true;
    h.context.window.faviconCache.peekIconDataUrl = () => { const gate = deferred(); reads.push(gate); return gate.promise; };
    assert(c.beginTemplatePreview()); h.document.documentElement.dataset.dashboardTemplate = 'folio'; c.refreshTemplate();
    const retired = h.grid.querySelector('.shortcut-icon'); const oldReads = [...reads];
    h.document.documentElement.dataset.dashboardTemplate = 'clarity'; c.refreshTemplate();
    const restored = h.grid.querySelector('.shortcut-icon'); const currentReads = reads.slice(oldReads.length);
    c.endTemplatePreview();
    for (const gate of [...oldReads, ...currentReads]) gate.resolve(image);
    await tick();
    assert.equal(retired.querySelector('img'), null);
    assert.equal(restored.querySelector('img')?.src, image);
    assert.equal(h.providers.length, 0);
});
