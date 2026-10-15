const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');
const tasks = require('../shared/local-tasks-store.js');
const { Controller } = require('../shared/local-tasks-controller.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { await tick(); await tick(); await tick(); }

function initial() {
    const state = tasks.initial(); state.enabled = true; state.revision = 20;
    state.records = Array.from({ length: 500 }, (_, i) => ({
        id: `task_${String(i).padStart(4, '0')}`, version: `version_${String(i).padStart(4, '0')}`,
        text: `  ${i < 300 ? 'Active' : i < 400 ? 'Completed' : 'Removed'} synthetic ${i} <b>中文</b>  `,
        state: i < 300 ? 'active' : i < 400 ? 'done' : 'removed', removedFrom: i < 400 ? null : 'done',
        createdAt: '2021-01-02T03:04:05.000Z', updatedAt: '2022-03-04T05:06:07.000Z'
    }));
    state.records[0].text = state.records[2].text; // Deliberate duplicate; identity must win.
    state.pinnedId = state.records[1].id;
    state.receipts = ['historic_operation_0001', 'historic_operation_0002'];
    state.recovery = Array.from({ length: 8 }, (_, i) => ({
        id: `recovery_${i}`, createdAt: '2023-04-05T06:07:08.000Z',
        content: { records: structuredClone(state.records.slice(i, i + 5)), pinnedId: null }
    }));
    return tasks.validate(state);
}
function model(options = {}) {
    let raw = initial(), queue = Promise.resolve(); const listeners = new Set(), windowListeners = new Map();
    const backend = {
        writes: 0, fail: false, uncertain: false, delay: null, notifications: options.notifications !== false,
        lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() { return structuredClone(raw); },
        async write(value) {
            backend.writes++; if (backend.delay) await backend.delay; if (backend.fail) return false;
            raw = structuredClone(value); if (backend.notifications) listeners.forEach(fn => fn());
            if (backend.uncertain) { backend.uncertain = false; throw new Error('uncertain acknowledgement'); }
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, raw: () => structuredClone(raw)
    };
    const store = new tasks.Store(backend), controller = new Controller(store), document = createDocument({ blurUnavailableFocus: true });
    const shell = document.createElement('main'), workspace = document.createElement('section'), host = document.createElement('article'), search = document.createElement('input');
    workspace.append(host); shell.append(workspace); document.body.append(search, shell); search.focus();
    const api = { ...tasks, Controller }, window = { LocalItabTasks: api,
        addEventListener(type, fn) { windowListeners.set(type, fn); },
        removeEventListener(type, fn) { if (windowListeners.get(type) === fn) windowListeners.delete(type); }
    };
    const context = vm.createContext({ window, document, crypto: webcrypto, setTimeout, URL, Blob, console });
    for (const file of ['dialog-focus.js', 'local-tasks-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared', file), 'utf8'), context);
    const view = api.mount(host, { controller });
    return { backend, store, controller, document, host, search, workspace, windowListeners, view };
}
const button = (parent, text) => parent?.querySelectorAll('button').find(node => node.textContent === text);
const row = (h, id) => h.host.querySelectorAll('[data-task-id]').find(node => node.dataset.taskId === id);
const modal = h => h.document.querySelector('.tasks-dialog');
const editor = h => h.document.querySelector('.tasks-editor');
const input = (node, text) => { node.value = text; node.dispatch('input'); };
// The model does not emit document focusin automatically. Dispatch it explicitly
// after focus changes; native event ordering remains a separate browser check.
const focus = (h, node) => { node.focus(); h.document.listeners.get('focusin')?.({ target: h.document.activeElement }); };
function openRow(h, id) {
    const item = row(h, id); assert(item); item.querySelector('.tasks-row-menu').open = true;
    const origin = button(item, 'Edit'); focus(h, origin); origin.dispatch('click'); assert(editor(h)); return origin;
}
function save(h, text) { input(editor(h), text); const action = button(modal(h), 'Save task'); focus(h, action); action.dispatch('click'); }
function outside(h) { const node = h.document.createElement('input'); h.document.body.append(node); focus(h, node); return node; }
function clean(h) {
    assert.equal(h.document.listeners.has('focusin'), false); assert.equal(h.document.listeners.has('visibilitychange'), false);
    assert.equal(h.windowListeners.has('blur'), false); h.view.destroy();
}
function assertPreserved(before, after, id, text) {
    assert.equal(after.records.length, 500); assert.equal(after.schemaVersion, before.schemaVersion);
    assert.equal(after.enabled, before.enabled); assert.equal(after.pinnedId, before.pinnedId);
    assert.equal(JSON.stringify(after.records.filter(record => record.id !== id)), JSON.stringify(before.records.filter(record => record.id !== id)));
    assert.equal(JSON.stringify(after.recovery), JSON.stringify(before.recovery));
    assert.equal(JSON.stringify(after.receipts.slice(0, before.receipts.length)), JSON.stringify(before.receipts));
    const old = before.records.find(record => record.id === id), current = after.records.find(record => record.id === id);
    assert.equal(current.text, text); assert.equal(current.createdAt, old.createdAt); assert.equal(current.state, old.state);
    assert.equal(current.removedFrom, old.removedFrom); assert.notEqual(current.version, old.version);
}

for (const scenario of ['preview', 'expanded-300th', 'filtered', 'completed']) for (const notifications of [true, false]) {
    test(`edit save restores same visible Edit: ${scenario}, notifications=${notifications}`, async () => {
        const h = model({ notifications }); await settle(); let id = 'task_0002';
        if (scenario === 'expanded-300th') { h.view.more.dispatch('click'); id = 'task_0299'; }
        if (scenario === 'filtered') { input(h.view.filterInput, 'synthetic 299'); id = 'task_0299'; }
        if (scenario === 'completed') { h.view.completed.box.open = true; id = 'task_0399'; }
        const before = h.backend.raw(), origin = openRow(h, id), text = `${before.records.find(record => record.id === id).text} revised`;
        save(h, text); await settle(); const target = button(row(h, id), 'Edit');
        assert.equal(modal(h), null); assert.equal(origin.isConnected, false); assert.notEqual(target, origin);
        assert.ok(h.document.activeElement === target, 'focus stays with its current owner'); assert.equal(row(h, id).querySelector('.tasks-row-menu').open, true);
        assertPreserved(before, h.backend.raw(), id, text); assert.equal(h.backend.writes, 1); clean(h);
    });
}

for (const route of ['outside', 'outside-removed', 'body-explicit', 'native-body', 'return-to-editor', 'window-blur', 'document-hidden']) {
    test(`pending edit success respects focus ownership: ${route}`, async () => {
        const h = model(); await settle(); openRow(h, 'task_0002'); const gate = deferred(); h.backend.delay = gate.promise;
        save(h, 'saved after delay'); const currentEditor = editor(h); let moved;
        if (route.startsWith('outside') || route === 'return-to-editor') moved = outside(h);
        if (route === 'outside-removed') moved.remove();
        if (route === 'body-explicit') focus(h, h.document.body);
        if (route === 'native-body') h.document.activeElement = h.document.body;
        if (route === 'return-to-editor') focus(h, currentEditor);
        if (route === 'window-blur') h.windowListeners.get('blur')?.();
        if (route === 'document-hidden') { h.document.hidden = true; h.document.listeners.get('visibilitychange')?.(); }
        gate.resolve(); await settle(); assert.equal(modal(h), null);
        const expected = ['native-body', 'return-to-editor'].includes(route) ? button(row(h, 'task_0002'), 'Edit') : route === 'outside' ? moved : h.document.body;
        assert.ok(h.document.activeElement === expected, 'focus stays with its current owner'); clean(h);
    });
}

for (const unavailable of ['edited-out-of-filter', 'changed-filter', 'collapsed-preview', 'closed-menu', 'closed-completed', 'hidden-row', 'hidden-host', 'hidden-workspace', 'inert-workspace', 'detached-host']) {
    test(`pending edit has no eligible row target: ${unavailable}`, async () => {
        const h = model(); await settle(); let id = 'task_0002';
        if (unavailable === 'collapsed-preview') { h.view.more.dispatch('click'); id = 'task_0299'; }
        if (unavailable === 'closed-completed') { h.view.completed.box.open = true; id = 'task_0399'; }
        if (unavailable === 'edited-out-of-filter') input(h.view.filterInput, 'synthetic 2');
        openRow(h, id); const gate = deferred(); h.backend.delay = gate.promise; save(h, 'saved changed text');
        if (unavailable === 'changed-filter') input(h.view.filterInput, 'does not exist');
        if (unavailable === 'collapsed-preview') h.view.more.dispatch('click');
        if (unavailable === 'closed-menu') row(h, id).querySelector('.tasks-row-menu').open = false;
        if (unavailable === 'closed-completed') h.view.completed.box.open = false;
        if (unavailable === 'hidden-workspace') h.workspace.hidden = true;
        if (unavailable === 'inert-workspace') h.workspace.inert = true;
        if (unavailable === 'detached-host') h.host.remove();
        // These mutations occur after each actual view rerender. Give closed
        // details a layout box to exercise the explicit Chromium visibility guard.
        const stop = h.controller.subscribe(() => {
            const current = row(h, id);
            if (unavailable === 'hidden-row' && current) current.hidden = true;
            if (unavailable === 'hidden-host') h.host.hidden = true;
            if (unavailable === 'closed-menu' || unavailable === 'closed-completed') {
                const target = button(current, 'Edit'); if (target) target.getClientRects = () => [{}];
            }
        });
        gate.resolve(); await settle(); assert.equal(modal(h), null);
        const failClosed = ['hidden-host', 'hidden-workspace', 'inert-workspace', 'detached-host'].includes(unavailable);
        assert.ok(h.document.activeElement === failClosed ? h.document.body : h.view.input, 'focus stays with its current owner');
        assert.equal(h.backend.raw().records.find(record => record.id === id).text, 'saved changed text'); stop(); clean(h);
    });
}

test('a removal arriving before the edit continuation never focuses a different task', async () => {
    const h = model(); await settle(); openRow(h, 'task_0002');
    const run = h.controller.run.bind(h.controller);
    h.controller.run = async command => {
        const saved = await run(command), task = saved.records.find(record => record.id === command.id);
        await h.store.mutate(h.store.request('remove', { id: task.id, version: task.version })); await settle(); return saved;
    };
    save(h, 'saved before removal'); await settle(); await settle();
    assert.equal(modal(h), null); assert.equal(h.backend.raw().records[2].state, 'removed');
    assert.equal(button(row(h, 'task_0002'), 'Edit'), undefined); assert.ok(h.document.activeElement === h.view.input, 'focus stays with its current owner'); clean(h);
});

for (const failure of ['write', 'uncertain']) test(`failed ${failure} edit retains draft and exact retry, then restores the same row`, async () => {
    const h = model(); await settle(); const before = h.backend.raw(); openRow(h, 'task_0002');
    h.backend.fail = failure === 'write'; h.backend.uncertain = failure === 'uncertain'; save(h, 'exact retry draft'); await settle();
    assert.equal(editor(h).value, 'exact retry draft'); assert.ok(h.document.activeElement === editor(h), 'focus stays with its current owner');
    const operation = h.controller.retryCommand.operationId; h.backend.fail = false;
    // Real focus returning to the editor after an external interaction must permit
    // the next successful save to restore its row, rather than permanently lock it.
    outside(h); focus(h, editor(h)); const saveButton = button(modal(h), 'Save task'); focus(h, saveButton); saveButton.dispatch('click'); await settle();
    assert.equal(modal(h), null); assert.ok(h.document.activeElement === button(row(h, 'task_0002'), 'Edit'), 'focus stays with its current owner');
    const after = h.backend.raw(); assertPreserved(before, after, 'task_0002', 'exact retry draft');
    assert.equal(after.receipts.filter(id => id === operation).length, 1); assert.equal(after.revision, before.revision + 1); clean(h);
});

for (const cancel of ['button', 'Escape']) test(`cancel ${cancel} preserves the original row return and all data`, async () => {
    const h = model(); await settle(); const before = h.backend.raw(), origin = openRow(h, 'task_0002'); input(editor(h), 'unsaved draft');
    if (cancel === 'button') button(modal(h), 'Cancel').dispatch('click'); else editor(h).dispatch('keydown', { key: 'Escape' });
    assert.ok(h.document.activeElement === origin, 'focus stays with its current owner'); assert.equal(h.backend.writes, 0); assert.deepEqual(h.backend.raw(), before); clean(h);
});

test('cancel after an unrelated revision returns to the same current row Edit', async () => {
    const h = model(); await settle(); openRow(h, 'task_0002'); input(editor(h), 'unsaved draft');
    await h.controller.action('enable', { enabled: true }); await settle(); const before = h.backend.raw();
    button(modal(h), 'Cancel').dispatch('click'); assert.ok(h.document.activeElement === button(row(h, 'task_0002'), 'Edit'), 'focus stays with its current owner');
    assert.deepEqual(h.backend.raw(), before); clean(h);
});

for (const outcome of ['success', 'failure']) test(`dismissed pending edit ${outcome} cannot focus or close a newer editor`, async () => {
    const h = model(); await settle(); openRow(h, 'task_0002'); const gate = deferred(); h.backend.delay = gate.promise; h.backend.fail = outcome === 'failure';
    save(h, 'older saved text'); editor(h).dispatch('keydown', { key: 'Escape' }); openRow(h, 'task_0002');
    const newer = editor(h); input(newer, 'newer draft'); focus(h, newer); gate.resolve(); await settle();
    assert.equal(editor(h), newer); assert.ok(h.document.activeElement === newer, 'focus stays with its current owner'); assert.equal(newer.value, 'newer draft');
    button(modal(h), 'Cancel').dispatch('click'); clean(h);
});

for (const move of [false, true]) test(`non-row editor preserves its original return path and newer external focus: move=${move}`, async () => {
    const h = model(); await settle(); h.view.edit(h.controller.state.records[2]); const gate = deferred(); h.backend.delay = gate.promise;
    save(h, 'non-row edit'); const next = move ? outside(h) : h.search; gate.resolve(); await settle();
    assert.equal(modal(h), null); assert.ok(h.document.activeElement === next, 'focus stays with its current owner'); clean(h);
});

for (const cancel of ['button', 'Escape']) for (const destination of ['row', 'outside', 'departed-body', 'hidden-workspace']) {
    test(`cancel after row rebuild respects current ownership: ${cancel}, ${destination}`, async () => {
        const h = model(); await settle(); openRow(h, 'task_0002'); input(editor(h), 'unsaved draft');
        await h.controller.action('enable', { enabled: true }); await settle(); const before = h.backend.raw();
        let newer;
        if (destination === 'outside' || destination === 'departed-body') newer = outside(h);
        if (destination === 'departed-body') newer.remove();
        if (destination === 'hidden-workspace') h.workspace.hidden = true;
        if (cancel === 'button') button(modal(h), 'Cancel').dispatch('click');
        else editor(h).dispatch('keydown', { key: 'Escape' });
        const expected = destination === 'row' ? button(row(h, 'task_0002'), 'Edit') : destination === 'outside' ? newer : h.document.body;
        assert.ok(h.document.activeElement === expected, 'focus stays with its current owner'); assert.deepEqual(h.backend.raw(), before); clean(h);
    });
}

test('explicit conflict replacement returns to the same current row and preserves all other content', async () => {
    const h = model(); await settle(); openRow(h, 'task_0002'); input(editor(h), 'my reviewed replacement');
    const old = h.controller.state.records[2];
    await h.store.mutate(h.store.request('edit', { id: old.id, version: old.version, text: 'newer remote task' })); await settle();
    button(modal(h), 'Save task').dispatch('click'); await settle();
    assert.equal(h.controller.error.code, 'CONFLICT'); assert.match(modal(h).querySelector('.tasks-latest').textContent, /newer remote task/);
    const before = h.backend.raw(), replace = button(modal(h), 'Replace latest with my edit'); focus(h, replace); replace.dispatch('click'); await settle();
    assert.equal(modal(h), null); assert.ok(h.document.activeElement === button(row(h, old.id), 'Edit'), 'focus stays with its current owner');
    assertPreserved(before, h.backend.raw(), old.id, 'my reviewed replacement'); clean(h);
});

test('destroying the view during a pending edit removes ownership tracking and leaves newer focus alone', async () => {
    const h = model(); await settle(); openRow(h, 'task_0002'); const gate = deferred(); h.backend.delay = gate.promise;
    save(h, 'last committed edit'); const next = outside(h); h.view.destroy(); gate.resolve(); await settle();
    assert.equal(modal(h), null); assert.ok(h.document.activeElement === next, 'focus stays with its current owner');
    assert.equal(h.document.listeners.has('focusin'), false); assert.equal(h.document.listeners.has('visibilitychange'), false);
    assert.equal(h.windowListeners.has('blur'), false);
});
