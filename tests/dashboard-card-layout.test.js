const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const StorageManager = require('../storage.js');
const Workspaces = require('../shared/workspaces.js');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const source = name => fs.readFileSync(name, 'utf8');
const IDS = ['local-tasks-card', 'local-focus-card', 'local-scratchpad-card', 'local-countdown-card', 'world-clocks-card', 'weather-container', 'hot-container', 'movie-container'];
function fixture() {
    const raw = new StorageManager().cloneDefaultConfig(), writes = [], listeners = [], queues = new Map();
    raw.layout = { autoArrange: false, columns: 3, positions: { 'work|https://example.com/': { x: 23, y: 61 } } };
    const locks = { request(name, options, fn) { fn ||= options; const promise = (queues.get(name) || Promise.resolve()).then(fn); queues.set(name, promise.catch(() => {})); return promise; } };
    const local = { async get(keys) { return keys == null ? copy(raw) : Object.fromEntries(keys.filter(key => key in raw).map(key => [key, copy(raw[key])])); },
        async set(values) { writes.push(copy(values)); Object.assign(raw, copy(values)); for (const fn of listeners) fn(Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }])), 'local'); },
        async remove(keys) { for (const key of keys) delete raw[key]; } };
    const chrome = { storage: { local, onChanged: { addListener(fn) { listeners.push(fn); } } } };
    Object.defineProperty(global, 'navigator', { configurable: true, value: { locks } });
    global.chrome = chrome; global.crypto = webcrypto;
    const storage = new StorageManager(); storage._syncInitialized = true;
    return { raw, writes, storage, chrome, locks };
}
function page(f) {
    const document = createDocument({ blurUnavailableFocus: true }), dashboard = document.createElement('main'), container = document.createElement('section'), host = document.createElement('div');
    dashboard.id = 'dashboard'; container.id = 'info-cards-container'; dashboard.append(container); document.body.append(dashboard, host);
    // Model native append's node-move semantics without changing shared fixtures.
    container.appendChild = node => { if (node.parentElement) node.parentElement.children = node.parentElement.children.filter(child => child !== node); container.append(node); };
    for (const id of IDS) { const card = document.createElement('article'); card.id = id; card.hidden = true; container.append(card); }
    const input = document.createElement('textarea'); input.value = 'unsaved synthetic note'; container.children[2].append(input);
    const window = { document, storageManager: f.storage }, context = vm.createContext({ window, console });
    for (const file of ['shared/dialog-focus.js', 'shared/dashboard-card-layout.js', 'shared/dashboard-customization.js', 'shared/appearance.js']) vm.runInContext(source(file), context);
    window.LocalItabAppearance.mount(host, { storage: f.storage, initial: f.raw.appearance, baseline: { generation: null } });
    const launch = host.querySelector('.customize-launch');
    return { document, dashboard, container, input, api: window.LocalItabCardLayout, customization: window.LocalItabCustomization,
        async open() { launch.dispatch('click'); await tick(); },
        row(id) { return document.querySelector(`[data-card-layout-id="${id}"]`); },
        order() { return container.children.map(node => node.id); },
        earlier(id) { this.row(id).children[1].dispatch('click'); },
        span(id, value) { const select = document.querySelector(`[data-card-span="${id}"]`); select.value = value; select.dispatch('change'); },
        button(text) { return document.querySelectorAll('button').find(node => node.textContent === text); }
    };
}

test('strict schema rejects partial, duplicate, unknown, inherited-looking IDs and malformed spans in backups', () => {
    const s = new StorageManager();
    const sparse = [...IDS]; delete sparse[3];
    const invalid = [{ cardOrder: sparse }, { cardOrder: [] }, { cardOrder: IDS.slice(1) }, { cardOrder: [...IDS.slice(0, -1), IDS[0]] }, { cardOrder: [...IDS.slice(0, -1), 'unknown'] }, { cardOrder: {} }, { cardSpans: [] }, { cardSpans: 'wide' }, { cardSpans: { unknown: 2 } }, { cardSpans: { 'local-tasks-card': 0 } }, { cardSpans: { 'local-tasks-card': 5 } }, { cardSpans: { 'local-tasks-card': 1.5 } }, { cardSpans: { 'local-tasks-card': '2' } }, { cardSpans: JSON.parse('{"__proto__":2}') }];
    for (const value of invalid) {
        assert.throws(() => s.validateDashboardCustomization(value));
        assert.throws(() => s.validateImportPayload({ links: [], appearance: { customization: value } }), /Invalid backup/);
    }
    const config = s.cloneDefaultConfig(); config.appearance.customization = s.validateDashboardCustomization({ cardOrder: [...IDS].reverse(), cardSpans: { 'movie-container': 4, 'local-tasks-card': 2 } });
    for (const payload of [config, s.buildManualExportPayload(config), s.buildDriveBackupPayload(config)]) assert.deepEqual(s.validateImportPayload(payload).appearance.customization, config.appearance.customization);
    const draft = { cardOrder: [...IDS], cardSpans: { 'local-tasks-card': 2 } }, normalized = s.validateDashboardCustomization(draft);
    draft.cardOrder.reverse(); draft.cardSpans['local-tasks-card'] = 4;
    assert.deepEqual(normalized.cardOrder, IDS); assert.equal(normalized.cardSpans['local-tasks-card'], 2);
});

test('structural field CAS merges order, spans and unrelated appearance without losing Free positions', async () => {
    const f = fixture(), before = copy(f.raw), baseline = { generation: null, customization: {} };
    await Promise.all([f.storage.patchDashboardCustomization({ cardOrder: [...IDS].reverse() }, baseline), f.storage.patchDashboardCustomization({ cardSpans: { 'local-tasks-card': 2 } }, baseline), f.storage.patchDashboardCustomization({ cardGap: 21 }, baseline)]);
    assert.deepEqual(f.raw.appearance.customization.cardOrder, [...IDS].reverse());
    assert.equal(f.raw.appearance.customization.cardSpans['local-tasks-card'], 2);
    assert.equal(f.raw.appearance.customization.cardGap, 21);
    assert.deepEqual({ ...f.raw, appearance: before.appearance }, before);
    await f.storage.patchDashboardCustomization({ cardOrder: [...IDS].reverse() }, baseline); // equal values, distinct objects
    await assert.rejects(f.storage.patchDashboardCustomization({ cardOrder: IDS }, baseline), { code: 'APPEARANCE_CONFLICT' });
    const next = { generation: null, customization: copy(f.raw.appearance.customization) };
    await f.storage.patchDashboardCustomization({ cardSpans: { 'movie-container': 4, 'local-tasks-card': 2 } }, next);
    await f.storage.patchDashboardCustomization({ cardSpans: { 'local-tasks-card': 2, 'movie-container': 4 } }, next); // map key order isn't a conflict
    assert(f.writes.every(value => Object.keys(value).join() === 'appearance'));
});

test('preview and Cancel move existing hidden nodes, preserve unsaved content and restore saved reading order', async () => {
    const f = fixture(), p = page(f), originalNodes = [...p.container.children]; await p.open();
    p.earlier('local-focus-card'); p.span('local-focus-card', '4');
    assert.deepEqual(p.order(), [IDS[1], IDS[0], ...IDS.slice(2)]); assert.equal(p.dashboard.dataset.customCardLayout, 'true');
    assert.equal(p.container.children[0] === originalNodes[1], true); assert.equal(p.input.value, 'unsaved synthetic note'); assert.equal(f.writes.length, 0);
    p.container.children[0].hidden = false; assert.equal(p.container.children[0].style['--card-layout-span'], '4');
    p.button('Cancel').dispatch('click'); assert.deepEqual(p.order(), IDS); assert.equal(p.dashboard.dataset.customCardLayout, 'false');
    assert.equal(p.input.value, 'unsaved synthetic note'); assert.equal(f.writes.length, 0);
    p.input.parentElement.hidden = false; p.input.focus(); p.api.paint({ cardOrder: [...IDS].reverse() }); assert.equal(p.document.activeElement === p.input, true);
    assert.equal(p.container.children.length, IDS.length);
});

test('Save/reopen and card-only reset preserve appearance; Cancel restores latest external card layout', async () => {
    const f = fixture(), p = page(f); await p.open(); p.earlier(IDS[1]); p.span(IDS[1], '3');
    p.button('Save').dispatch('click'); await tick(); await tick();
    assert.equal(f.raw.appearance.customization.cardSpans[IDS[1]], 3);
    await p.open(); p.button('Restore card order and widths').dispatch('click'); assert.deepEqual(p.order(), IDS);
    assert.equal(p.dashboard.dataset.customCardLayout, 'false'); p.button('Cancel').dispatch('click'); assert.equal(p.order()[0], IDS[1]);
    await p.open(); p.span(IDS[0], '2');
    await f.storage.patchDashboardCustomization({ cardOrder: [...IDS].reverse() }, { generation: null, customization: copy(f.raw.appearance.customization) }); await tick();
    p.button('Cancel').dispatch('click'); assert.deepEqual(p.order(), [...IDS].reverse());
    await p.open(); p.button('Restore card order and widths').dispatch('click'); p.button('Save').dispatch('click'); await tick(); await tick();
    assert.equal(f.raw.appearance.customization.cardOrder, null); assert.equal(f.raw.appearance.customization.cardSpans, null);
});

test('pending Save locks card actions and conflicting Save retains the preview', async () => {
    const f = fixture(), p = page(f); await p.open(); p.span(IDS[0], '4');
    await f.storage.patchDashboardCustomization({ cardSpans: { [IDS[0]]: 2 } }, { generation: null, customization: {} }); await tick();
    p.button('Save').dispatch('click'); await tick(); await tick();
    assert.equal(p.document.querySelector(`[data-card-span="${IDS[0]}"]`).value, '4'); assert.match(p.document.querySelector('.customize-status').textContent, /changed/);
    p.button('Cancel').dispatch('click'); assert.equal(p.container.children[0].style['--card-layout-span'], '2');
    await p.open(); p.earlier(IDS[1]); const gate = deferred(), save = f.storage.patchDashboardCustomization.bind(f.storage); let calls = 0;
    f.storage.patchDashboardCustomization = async (...args) => { calls++; await gate.promise; return save(...args); };
    p.button('Save').dispatch('click'); p.earlier(IDS[2]); p.span(IDS[0], '1'); p.button('Restore card order and widths').dispatch('click'); p.button('Save').dispatch('click');
    assert.equal(calls, 1); assert.deepEqual(p.order(), [IDS[1], IDS[0], ...IDS.slice(2)]);
    gate.resolve(); await tick(); await tick(); assert.equal(f.raw.appearance.customization.cardSpans[IDS[0]], 2);
});

test('responsive span calculation clamps widths and CSS retains auto rows without dense placement', () => {
    const p = page(fixture()); assert.deepEqual(copy(p.api.ids), IDS);
    for (const cols of [null, 1, 2, 3, 4]) for (const width of [360, 620, 621, 1000, 1001, 1600]) for (const span of [1, 2, 3, 4]) {
        const expected = Math.min(span, cols ?? 3, width <= 620 ? 1 : width <= 1000 ? 2 : 4);
        assert.equal(p.api.effectiveSpan(span, cols, width), expected);
    }
    const css = source('dashboard-customization.css'); assert.match(css, /grid-column: span min\(var\(--card-layout-span, 1\), var\(--card-layout-available\)\)/);
    assert.match(css, /grid-auto-flow: row;/); assert.equal(css.includes('grid-auto-flow: dense'), false);
    for (const locale of ['en', 'zh_CN']) { const messages = JSON.parse(source(`_locales/${locale}/messages.json`)); for (const key of [...source('shared/dashboard-card-layout.js').matchAll(/'(cardLayout\w+)'/g)].map(match => match[1])) assert(messages[key], `${locale}: ${key}`); }
    for (const name of ['newtab.html', 'options.html']) { const html = source(name); assert(html.indexOf('shared/dashboard-card-layout.js') < html.indexOf('shared/dashboard-customization.js')); }
    assert(source('tools/package_extension.py').includes('"shared/dashboard-card-layout.js"'));
});

test('workspace activation changes do not retarget card saves; deleted sessions fail closed', async () => {
    const f = fixture(); let serial = 0;
    const manager = Workspaces.createManager({ chrome: f.chrome, locks: f.locks, id: () => `synthetic_cards_${++serial}` });
    await manager.ready(); const a = await manager.create('Cards A'), b = await manager.create('Cards B');
    const session = manager.capture(a.id); await session.ready();
    const storage = new StorageManager({ workspace: session }); storage._syncInitialized = true;
    const appearance = await storage.getAppearanceForUpdate();
    const baseline = { ...storage.settingsSnapshot(await session.local.get([storage.settingsGenerationKey])), customization: appearance.customization };
    await manager.select(b.id);
    await storage.patchDashboardCustomization({ cardOrder: [...IDS].reverse() }, { generation: baseline.generation, customization: baseline.customization });
    assert.deepEqual((await session.local.get(['appearance'])).appearance.customization.cardOrder, [...IDS].reverse());
    assert.equal((await manager.capture(b.id).local.get(['appearance'])).appearance?.customization?.cardOrder, undefined);
    await manager.trash(a.id);
    await assert.rejects(storage.patchDashboardCustomization({ cardSpans: { [IDS[0]]: 2 } }, { generation: baseline.generation, customization: baseline.customization }), error => error.code.startsWith('WORKSPACE_'));
});


test('boundary reorder arrows keep focus inside the dialog and Escape still cancels', async () => {
    const f = fixture(), p = page(f); await p.open();
    const up = p.row(IDS[1]).children[1]; up.focus(); up.dispatch('click');
    assert.equal(up.getAttribute('aria-disabled'), 'true'); assert.equal(up.disabled, false);
    assert.equal(p.document.activeElement === up, true);
    up.dispatch('click'); assert.equal(p.order()[0], IDS[1]);
    p.document.activeElement.dispatch('keydown', { key: 'Escape' });
    assert.equal(Boolean(p.document.querySelector('.customize-overlay')), false); assert.deepEqual(p.order(), IDS);
    await p.open(); const down = p.row(IDS[6]).children[2]; down.focus(); down.dispatch('click');
    assert.equal(down.getAttribute('aria-disabled'), 'true'); assert.equal(p.document.activeElement === down, true);
    p.document.activeElement.dispatch('keydown', { key: 'Escape' }); assert.equal(f.writes.length, 0);
});


test('pending and failed Save keep native-like keyboard focus inside the modal', async () => {
    const f = fixture(), p = page(f); await p.open(); p.span(IDS[0], '2');
    const gate = deferred(); f.storage.patchDashboardCustomization = async () => { await gate.promise; throw new Error('synthetic save failure'); };
    const save = p.button('Save'); save.focus(); save.dispatch('click');
    assert.equal(p.document.querySelector('.customize-panel').contains(p.document.activeElement), true);
    p.document.activeElement.dispatch('keydown', { key: 'Escape' }); assert.equal(Boolean(p.document.querySelector('.customize-overlay')), true);
    gate.resolve(); await tick(); await tick(); assert.equal(p.document.activeElement === save, true);
    p.document.activeElement.dispatch('keydown', { key: 'Escape' }); assert.equal(Boolean(p.document.querySelector('.customize-overlay')), false); assert.equal(f.writes.length, 0);
});
