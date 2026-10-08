const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const StorageManager = require('../storage');
const { createHarness } = require('./helpers/dashboard-harness');
const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { resolve, reject, promise }; };
const manager = new StorageManager();
const baseline = { autoArrange: false, alignToGrid: false, gridSize: 192, columns: 4, positions: {
    'all|https://example.com/a': { x: 37.25, y: 53.75 },
    'work|https://example.com/a': { x: 904.5, y: 301.125 },
    'hidden|https://example.com/h': { x: 45.5, y: 87.75 }
} };
function controllerHarness(initial = baseline) {
    const data = { layout: clone(initial), appearance: { template: 'folio', colorMode: 'dark' }, links: ['untouched'] };
    const writes = [], paints = [], states = [], errors = [], timers = new Map();
    let timerId = 0;
    const storage = new StorageManager();
    storage.getLayoutForUpdate = async () => clone(data.layout);
    storage.set = async (key, value) => { writes.push(clone(value)); data[key] = clone(value); return true; };
    storage.getLayoutSnapshotForUpdate = async () => ({ layout: await storage.getLayoutForUpdate(), generation: null, links: [] });
    storage.applyLayoutPatch = async (patch, positions, expected, onWrite) => {
        const previous = await storage.getLayoutForUpdate();
        const value = storage.validateLayoutConfig({ ...previous, ...patch, positions: { ...previous.positions, ...positions } });
        onWrite(value);
        if (!(await storage.set('layout', value))) throw new Error('Layout save failed');
        return { layout: value, generation: null, links: [] };
    };
    const context = { window: {}, console, setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('shared/layout.js', 'utf8'), context);
    const api = context.window.LocalItabLayout;
    const controller = new api.Controller({ storage, initial, baseline: { generation: null, links: [] }, render: (value, state) => states.push({ value: clone(value), state }), onApply: (value, state) => paints.push({ value: clone(value), state }), onError: error => errors.push(error) });
    return { api, context, data, controller, storage, writes, paints, states, errors, timers };
}
function dashboardHarness(initial = baseline) {
    const h = createHarness([
        { title: 'A', url: 'https://example.com/a', category: 'work' },
        { title: 'B', url: 'https://example.com/b', category: 'work' },
        { title: 'C', url: 'https://example.com/c', category: 'social' }
    ]);
    const data = { layout: clone(initial) };
    const writes = [], events = [];
    Object.assign(h.storageManager, {
        defaultConfig: manager.defaultConfig,
        validateLayoutConfig: manager.validateLayoutConfig.bind(manager),
        getLayoutForUpdate: async () => clone(data.layout),
        set: async (key, value) => { writes.push(clone(value)); data[key] = clone(value); events.forEach(fn => fn({ layout: { newValue: clone(value) } }, 'local')); return true; }
    });
    Object.assign(h.context.window, { document: h.document, storageManager: h.storageManager, chrome: { storage: { onChanged: { addListener(fn) { events.push(fn); } } } } });
    vm.runInContext(fs.readFileSync('shared/layout.js', 'utf8'), h.context);
    h.storageManager.getLayoutSnapshotForUpdate = async () => ({ layout: await h.storageManager.getLayoutForUpdate(), generation: null, links: clone(h.component.links) });
    h.storageManager.applyLayoutPatch = async (patch, positions, expected, onWrite) => {
        const previous = await h.storageManager.getLayoutForUpdate();
        const value = h.storageManager.validateLayoutConfig({ ...previous, ...patch, positions: { ...previous.positions, ...positions } });
        onWrite(value);
        if (!(await h.storageManager.set('layout', value))) throw new Error('Layout save failed');
        return { layout: value, generation: null, links: clone(h.component.links) };
    };
    h.component.layoutBaseline = { generation: null, links: clone(h.component.links) };
    h.component.layout = clone(initial); h.component.positions = h.component.layout.positions;
    h.component.applyLayoutMode = h.context.ShortcutsComponent.prototype.applyLayoutMode;
    h.component.reflowVisibleLayout = h.context.ShortcutsComponent.prototype.reflowVisibleLayout;
    h.context.window.categoryNavigation.currentCategory = 'all';
    h.context.window.categoryNavigation.filterShortcuts({ reflow: false });
    const host = h.document.createElement('div'); h.document.body.append(host);
    h.context.window.LocalItabLayout.mount(host, h.component.ensureLayoutController(), { onSelect: mode => h.component.setLayoutMode(mode) });
    return { ...h, data, writes, host, events, controller: h.component.layoutController };
}

(async () => {
    const h = controllerHarness();
    assert.equal(h.api.mode(manager.defaultConfig.layout), 'grid');
    assert.equal(h.api.mode({ autoArrange: false, alignToGrid: true }), 'snap');
    assert.equal(h.api.mode({ autoArrange: false, alignToGrid: false }), 'free');
    for (const mode of ['grid', 'free', 'grid', 'snap', 'free']) {
        assert.equal(await h.controller.select(mode), true);
        assert.equal(h.api.mode(h.data.layout), mode);
        assert.deepEqual(h.data.layout.positions, baseline.positions);
        for (const payload of [h.data, { settings: h.data }, { version: '1.0', data: h.data }, manager.buildManualExportPayload({ ...h.data, links: [] })]) {
            const valid = { ...payload };
            if (valid.links) valid.links = [];
            if (valid.settings) valid.settings = { ...valid.settings, links: [] };
            if (valid.data) valid.data = { ...valid.data, links: [] };
            assert.deepEqual(manager.validateImportPayload(valid).layout, h.data.layout);
        }
        const reloaded = controllerHarness(h.data.layout);
        assert.deepEqual(clone(reloaded.controller.confirmed), h.data.layout);
    }
    assert.deepEqual(h.data.appearance, { template: 'folio', colorMode: 'dark' });
    assert.deepEqual(h.data.links, ['untouched']);
    assert.equal(await h.controller.select('invalid'), false);

    // Authoritative read errors and corrupt values fail without a write/default.
    let raw = { layout: clone(baseline) }, readError = false;
    global.chrome = { storage: { local: { get: async () => { if (readError) throw new Error('read failed'); return clone(raw); } } } };
    assert.deepEqual(await manager.getLayoutForUpdate(), baseline);
    const read = await manager.getLayoutForUpdate(); read.positions['new'] = { x: 0, y: 0 };
    assert.equal('new' in raw.layout.positions, false);
    for (const value of [null, [], false, { positions: [] }, { positions: { bad: { x: '3', y: 4 } } }, { autoArrange: 'false' }, { columns: '4' }]) {
        raw = { layout: value }; await assert.rejects(() => manager.getLayoutForUpdate(), /invalid/);
    }
    raw = {}; assert.deepEqual(await manager.getLayoutForUpdate(), manager.defaultConfig.layout);
    readError = true; await assert.rejects(() => manager.getLayoutForUpdate(), /read failed/);

    for (const failure of ['read', 'false', 'throw']) {
        const h = controllerHarness();
        const originalRead = h.storage.getLayoutForUpdate, originalSet = h.storage.set;
        if (failure === 'read') h.storage.getLayoutForUpdate = async () => { throw new Error('read'); };
        else h.storage.set = async () => { if (failure === 'throw') throw new Error('write'); return false; };
        assert.equal(await h.controller.select('grid'), false);
        assert.deepEqual(h.data.layout, baseline);
        assert.deepEqual(h.states.at(-1), { value: baseline, state: 'error' });
        assert.deepEqual(h.paints.at(-1), { value: baseline, state: 'error' });
        assert.equal(h.controller.modePending, false);
        h.storage.getLayoutForUpdate = originalRead; h.storage.set = originalSet;
        assert.equal(await h.controller.select('grid'), true);
        assert.deepEqual(h.data.layout.positions, baseline.positions);
    }

    // Retry belongs to the currently displayed error, never an older failed intent.
    {
        const h = controllerHarness();
        h.storage.set = async () => false;
        await h.controller.select('grid'); assert(h.controller.failedChange);
        h.data.layout = { ...clone(baseline), alignToGrid: true };
        await h.controller.refresh(); assert.equal(h.controller.failedChange, null);
        const read = h.storage.getLayoutForUpdate;
        h.storage.getLayoutForUpdate = async () => { throw new Error('refresh read'); };
        await h.controller.refresh();
        h.storage.getLayoutForUpdate = read;
        await h.controller.retry();
        assert.equal(h.api.mode(h.states.at(-1).value), 'snap');
        assert.equal(h.writes.length, 0);
    }

    // A mode change flushes a pending drag's exact delta in the same candidate.
    {
        const h = controllerHarness();
        const positions = { 'all|https://example.com/a': { x: 63.625, y: 81.375 } };
        await h.controller.change({}, positions, { debounce: true });
        positions['all|https://example.com/a'].x = 999; // caller mutation cannot alias the queued delta
        assert.equal(h.writes.length, 0); assert.equal(h.timers.size, 1);
        await h.controller.select('grid');
        assert.equal(h.timers.size, 0); assert.equal(h.writes.length, 1);
        assert.equal(h.data.layout.autoArrange, true);
        assert.deepEqual(h.data.layout.positions['all|https://example.com/a'], { x: 63.625, y: 81.375 });
        assert.deepEqual(h.data.layout.positions['work|https://example.com/a'], baseline.positions['work|https://example.com/a']);
    }

    {
        const h = controllerHarness();
        h.controller.change({}, { a: { x: 1.25, y: 2.5 } }, { debounce: true });
        const one = h.controller.flush(), two = h.controller.flush();
        await one; await two;
        assert.equal(h.writes.length, 1, 'visibility/pagehide flushes cannot duplicate the same intent');
    }

    // Unstarted work is skipped. In-flight writes finish before the next read;
    // old completions do not paint, even when a newer mode eventually fails.
    for (const failure of [false, true]) {
        const h = controllerHarness(), gate = deferred();
        let entered = 0;
        h.storage.set = async (key, value) => {
            h.writes.push(clone(value));
            if (++entered === 1) await gate.promise;
            else if (failure) return false;
            h.data[key] = clone(value); return true;
        };
        const first = h.controller.select('snap'); await tick();
        assert.equal(entered, 1);
        const second = h.controller.select('grid');
        assert.equal(h.controller.modePending, true);
        gate.resolve(); await first; await second;
        assert.equal(h.paints.length, 1);
        assert.equal(h.api.mode(h.data.layout), failure ? 'snap' : 'grid');
        assert.equal(h.api.mode(h.paints[0].value), failure ? 'snap' : 'grid');
        assert.equal(h.states.at(-1).state, failure ? 'error' : 'saved');
        assert.deepEqual(h.data.layout.positions, baseline.positions);
    }
    {
        const h = controllerHarness(), gate = deferred();
        h.storage.getLayoutForUpdate = async () => { await gate.promise; return clone(h.data.layout); };
        const old = h.controller.select('snap'); await tick();
        const latest = h.controller.select('grid'); gate.resolve();
        await old; await latest;
        assert.equal(h.writes.length, 2); assert.equal(h.paints.length, 1);
        assert.equal(h.data.layout.autoArrange, true);
    }
    {
        const h = controllerHarness();
        const first = h.controller.select('snap'), latest = h.controller.select('grid');
        await first; await latest; assert.equal(h.writes.length, 1);
    }
    {
        const h = controllerHarness(), gate = deferred();
        let count = 0;
        h.storage.getLayoutForUpdate = async () => ++count === 1 ? gate.promise : clone(h.data.layout);
        const oldRefresh = h.controller.refresh();
        await h.controller.select('grid'); gate.resolve(clone(baseline)); await oldRefresh;
        assert.equal(h.states.at(-1).value.autoArrange, true, 'late refresh cannot overwrite a new mode');
    }
    {
        const h = controllerHarness(), gate = deferred();
        h.storage.set = async (key, value) => { await gate.promise; h.data[key] = clone(value); return true; };
        h.controller.change({}, { a: { x: 1.25, y: 2.5 } }, { debounce: true });
        const first = h.controller.flush(); await tick();
        h.controller.change({}, { b: { x: 3.5, y: 4.25 } }, { debounce: true });
        gate.resolve(); await first;
        assert.equal(h.paints.length, 0, 'pending second drag keeps its visual ownership');
        await h.controller.flush();
        assert.deepEqual(h.data.layout.positions.a, { x: 1.25, y: 2.5 });
        assert.deepEqual(h.data.layout.positions.b, { x: 3.5, y: 4.25 });
    }

    // Model actual dashboard mode rendering, missing-key geometry and events.
    for (const template of ['clarity', 'graphite', 'folio']) {
        const initial = { ...clone(baseline), autoArrange: true };
        const h = dashboardHarness(initial);
        h.document.documentElement.dataset.dashboardTemplate = template;
        h.component.applyLayoutMode();
        const before = clone(initial.positions);
        assert.equal(h.grid.querySelectorAll('.shortcut-collection').length, template === 'clarity' ? 0 : 2);
        h.tile(0).rect = { left: 999, top: 999, width: 120, height: 100 };
        await h.component.setLayoutMode('free');
        assert.equal(h.grid.querySelector('.shortcut-collection'), null);
        await h.controller.flush();
        for (const [key, value] of Object.entries(before)) assert.deepEqual(h.data.layout.positions[key], value);
        const a = h.component.positions['all|https://example.com/a'];
        const b = h.component.positions['all|https://example.com/b'];
        const c = h.component.positions['all|https://example.com/c'];
        assert(b.y >= a.y + 80 + 16); assert.equal(c.y, b.y); assert(c.x >= b.x + 80 + 16);
        assert.equal('social|https://example.com/c' in h.data.layout.positions, false, 'hidden view maps initialize only on visit');
        const saved = clone(h.data.layout.positions);
        await h.component.setLayoutMode('grid'); await h.component.setLayoutMode('free'); await h.controller.flush();
        assert.deepEqual(h.data.layout.positions, saved);
        h.context.window.categoryNavigation.currentCategory = 'social';
        h.context.window.categoryNavigation.filterShortcuts(); await h.controller.flush();
        assert.deepEqual(h.data.layout.positions['social|https://example.com/c'], { x: 0, y: 0 });
        for (const [key, value] of Object.entries(saved)) assert.deepEqual(h.data.layout.positions[key], value);
    }
    {
        const h = dashboardHarness();
        h.component.applyLayoutMode(); await h.controller.flush();
        const saved = clone(h.data.layout);
        const select = h.host.querySelector('select');
        const gate = deferred(); h.storageManager.set = () => gate.promise;
        const pending = h.component.setLayoutMode('grid'); await tick();
        assert.equal(select.value, 'grid');
        const event = { button: 0, target: h.control(0), preventDefault() { this.prevented = true; }, stopPropagation() {} };
        h.component.onPointerDown(event); assert.equal(h.component._cancelFreeDrag, undefined);
        h.component.handleDragStart(event); assert.equal(event.prevented, true);
        gate.resolve(false); await pending;
        assert.equal(select.value, 'free');
        assert.deepEqual(clone(h.component.layout), saved);
        assert.equal(h.host.dataset.saveState, 'error');
        assert.deepEqual(h.data.layout, saved);
    }
    {
        const h = dashboardHarness({ ...clone(baseline), autoArrange: true, positions: {} });
        let count = 0;
        h.storageManager.set = async (key, value) => {
            if (++count === 2) return false;
            h.data[key] = clone(value);
            h.events.forEach(fn => fn({ layout: { newValue: clone(value) } }, 'local'));
            return true;
        };
        await h.component.setLayoutMode('free');
        assert.equal(h.host.dataset.saveState, 'saving', 'mode success cannot cover a pending initializer');
        await h.controller.flush(); await tick();
        assert.equal(h.host.dataset.saveState, 'error');
        assert.equal(count, 2, 'own notifications must not silently retry a failed initializer');
        assert.deepEqual(h.data.layout.positions, {});
        assert.equal(h.component.layout.autoArrange, false);
        assert(h.tile(0).style.position === 'absolute');
        const retry = h.host.querySelector('.layout-retry');
        assert.equal(retry.hidden, false);
        retry.dispatch('click'); await h.controller.queue; await h.controller.flush();
        assert.equal(h.host.dataset.saveState, 'saved');
        assert.equal(retry.hidden, true);
        assert.equal(Object.keys(h.data.layout.positions).length, 3);
    }

    // A successful earlier position write cannot cancel the next live gesture.
    for (const end of ['pointerup', 'pointercancel']) {
        const h = dashboardHarness(); h.component.applyLayoutMode(); await h.controller.flush();
        const gate = deferred(), originalSet = h.storageManager.set;
        h.storageManager.set = async (...args) => { await gate.promise; return originalSet(...args); };
        h.controller.change({}, { 'all|https://example.com/a': { x: 51.25, y: 71.75 } }, { debounce: true });
        const first = h.controller.flush(); await tick();
        const event = { pointerId: 12, button: 0, isPrimary: true, clientX: 10, clientY: 10, target: h.tile(1), preventDefault() {}, stopPropagation() {} };
        h.component.onPointerDown(event);
        h.document.listeners.get('pointermove')({ ...event, clientX: 53.5, clientY: 81.25 });
        const active = h.component._cancelFreeDrag;
        gate.resolve(); await first;
        assert.equal(h.component._cancelFreeDrag, active, 'earlier successful save leaves the active pointer owned');
        h.document.listeners.get(end)(event); await h.controller.flush();
        assert.equal(h.component._cancelFreeDrag, null);
        assert.deepEqual(h.data.layout.positions['all|https://example.com/a'], { x: 51.25, y: 71.75 });
        if (end === 'pointerup') assert.deepEqual(h.data.layout.positions['all|https://example.com/b'], { x: 43.5, y: 71.25 });
        assert.equal(h.component._repaintAfterFreeDrag, false);
    }

    // Settings controls expose only applicable dimensions and save immediately.
    {
        const h = dashboardHarness();
        const host = h.document.createElement('div'), columns = h.document.createElement('input'), gridSize = h.document.createElement('input');
        h.document.body.append(host, columns, gridSize);
        h.context.window.LocalItabLayout.mount(host, h.controller, { columns, gridSize });
        assert.equal(columns.disabled, true); assert.equal(gridSize.disabled, true);
        const select = host.querySelector('select');
        select.value = 'grid'; select.dispatch('change'); await h.controller.queue; await h.controller.flush();
        assert.equal(columns.disabled, false); assert.equal(gridSize.disabled, true);
        columns.value = '8'; columns.dispatch('change'); await h.controller.queue;
        assert.equal(h.data.layout.columns, 8);
        select.value = 'snap'; select.dispatch('change'); await h.controller.queue; await h.controller.flush();
        assert.equal(columns.disabled, true); assert.equal(gridSize.disabled, false);
        gridSize.value = '48'; gridSize.dispatch('change'); await h.controller.queue;
        assert.equal(h.data.layout.gridSize, 48);
    }

    // Real shortcut helper + mounted controls: adopting a saved snapshot under
    // a hold must not leave Placement disabled after Edit or Grid reorder.
    for (const kind of ['edit', 'reorder', 'false', 'throw']) {
        const h = dashboardHarness({ ...clone(baseline), autoArrange: kind === 'reorder' });
        const select = h.host.querySelector('select'), entered = deferred(), release = deferred();
        const previous = clone(h.component.links), next = clone(previous);
        if (kind === 'reorder') next.unshift(next.pop()); else next[0].title = 'Renamed A';
        h.storageManager.set = async (key, value, options) => {
            assert.equal(key, 'links'); assert.equal(options.operation.type, kind === 'reorder' ? 'reorder' : 'edit');
            entered.resolve(); await release.promise;
            if (kind === 'false') return false;
            if (kind === 'throw') throw new Error('shortcut write failed');
            return { links: clone(value), layout: clone(h.component.layout), generation: null };
        };
        const saving = h.component.saveShortcutLinks(next, previous, kind === 'reorder' ? { type: 'reorder', from: 2, to: 0 } : { type: 'edit', index: 0 });
        await entered.promise;
        assert.equal(select.disabled, true); assert.equal(h.host.getAttribute('aria-busy'), 'true');
        release.resolve();
        if (kind === 'throw') await assert.rejects(saving, /shortcut write failed/); else await saving;
        assert.equal(select.disabled, false, kind); assert.equal(h.host.getAttribute('aria-busy'), 'false');
        assert.equal(h.controller.externalHold, 0);
        assert.equal(h.host.dataset.saveState, ['false', 'throw'].includes(kind) ? '' : 'saved');
        if (kind === 'edit' || kind === 'reorder') assert.deepEqual(clone(h.component.links), next);
        else assert.deepEqual(clone(h.component.links), previous);
        assert.deepEqual(clone(h.component.layout.positions), baseline.positions);
    }
    {
        const h = dashboardHarness(), select = h.host.querySelector('select');
        h.controller.holdShortcutMutation(); h.controller.holdShortcutMutation();
        h.controller.releaseShortcutMutation(); assert.equal(select.disabled, true, 'an earlier owner cannot release a newer hold');
        h.controller.releaseShortcutMutation(); assert.equal(select.disabled, false, 'cancelled final owner restores idle controls');
        assert.equal(h.host.dataset.saveState, '');
        h.controller.failedChange = { patch: { columns: 4 }, positions: {} };
        h.controller.holdShortcutMutation(); h.controller.releaseShortcutMutation();
        assert.equal(h.host.dataset.saveState, 'error'); assert.equal(h.host.querySelector('.layout-retry').hidden, false);
        h.controller.invalidated = true;
        h.controller.holdShortcutMutation(); h.controller.releaseShortcutMutation();
        assert.equal(select.disabled, true); assert.equal(h.host.dataset.saveState, 'reload', 'teardown cannot reauthorize a stale page');
    }

    // A notification delayed by a shortcut hold is still refreshed after release,
    // without needing that asynchronous read to re-enable the mounted selector.
    {
        const h = dashboardHarness(), gate = deferred();
        const select = h.host.querySelector('select');
        let reads = 0;
        h.storageManager.getLayoutSnapshotForUpdate = async () => {
            reads++;
            await gate.promise;
            return { layout: clone(baseline), generation: null, links: clone(h.component.links) };
        };
        h.controller.holdShortcutMutation();
        await h.controller.refresh();
        assert.equal(reads, 0); assert.equal(h.controller.externalChange, true);
        h.controller.adoptOwnShortcutSnapshot({ layout: clone(baseline), generation: null, links: clone(h.component.links) });
        h.controller.releaseShortcutMutation();
        assert.equal(reads, 1); assert.equal(select.disabled, false);
        assert.equal(h.host.getAttribute('aria-busy'), 'false');
        gate.resolve(); await tick();
        assert.equal(h.controller.externalChange, false); assert.equal(select.disabled, false);
        h.controller.holdShortcutMutation(); h.controller.releaseShortcutMutation();
        assert.equal(h.host.dataset.saveState, '', 'a later cancelled operation cannot inherit an earlier Saved state');
    }

    // Ordinary Save Settings must never send an old layout snapshot back.
    const settingsContext = { document: { addEventListener() {}, getElementById() { return null; }, querySelectorAll() { return []; } }, window: {}, storageManager: manager, console };
    vm.createContext(settingsContext);
    vm.runInContext(fs.readFileSync('options.js', 'utf8'), settingsContext);
    manager.getAll = async () => manager.cloneDefaultConfig();
    assert.equal('layout' in await settingsContext.collectFormData(), false);
    for (const page of ['newtab.html', 'options.html']) assert(fs.readFileSync(page, 'utf8').includes('shared/layout.js'));
    const options = fs.readFileSync('options.html', 'utf8');
    assert(!options.includes('id="layout-auto-arrange"')); assert(!options.includes('id="layout-align-grid"'));
    console.log('layout modes tests ok (controller and DOM/layout model)');
})().catch(error => { console.error(error); process.exitCode = 1; });
