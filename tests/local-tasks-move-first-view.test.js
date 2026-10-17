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
    const states = ['done', 'active', 'removed', 'active', 'active', 'done', 'active', 'removed', 'active', 'active'];
    return tasks.validate({ schemaVersion: 1, revision: 4, enabled: true, receipts: [], pinnedId: 'task_0004',
        records: states.map((state, i) => ({ id: `task_000${i}`, version: `version_${i}`, text: [1, 4, 9].includes(i) ? '  duplicate 中文 😀\ntext  ' : `Task ${i}`,
            state, removedFrom: state === 'removed' ? 'active' : null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' })),
        recovery: [{ id: 'recovery_1', createdAt: '2026-10-03T00:00:00.000Z', content: { records: [], pinnedId: null } }] });
}
function model({ locale = 'en', state = initial() } = {}) {
    let raw = structuredClone(state), queue = Promise.resolve(); const listeners = new Set();
    const backend = {
        reads: 0, writes: 0, delay: null, fail: false, failAfterWrite: false, notifications: true,
        lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() { backend.reads++; return structuredClone(raw); },
        async write(value) {
            backend.writes++; if (backend.delay) await backend.delay; if (backend.fail) return false;
            raw = structuredClone(value); if (backend.notifications) listeners.forEach(fn => fn());
            if (backend.failAfterWrite) { backend.failAfterWrite = false; throw new Error('uncertain acknowledgement'); }
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, raw: () => structuredClone(raw)
    };
    const store = new tasks.Store(backend), remote = new tasks.Store(backend), controller = new Controller(store);
    const document = createDocument({ blurUnavailableFocus: true }), host = document.createElement('article'), search = document.createElement('input');
    document.body.append(search, host); search.focus();
    const api = { ...tasks, Controller }, window = { LocalItabTasks: api };
    if (locale !== 'fallback') {
        const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../_locales', locale, 'messages.json'), 'utf8'));
        window.i18n = { t: key => catalog[key]?.message || key };
    }
    const context = vm.createContext({ window, document, crypto: webcrypto, URL, Blob, setTimeout, console });
    for (const name of ['dialog-focus.js', 'local-tasks-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared', name), 'utf8'), context);
    const view = api.mount(host, { controller });
    return { backend, store, remote, controller, document, host, search, view };
}
const row = (h, id) => h.host.querySelectorAll('[data-task-id]').find(item => item.dataset.taskId === id);
const button = (node, label) => node?.querySelectorAll('button').find(item => item.textContent === label);
function moveButton(h, id, label = 'Move to list start') {
    const item = row(h, id); assert(item, `rendered row ${id}`);
    const menu = item.querySelector('.tasks-row-menu'); if (menu) menu.open = true;
    const action = button(item, label); assert(action, `move-to-start button for ${id}`); return action;
}
const input = (node, text) => { node.value = text; node.dispatch('input'); };
const order = state => state.records.filter(task => task.state === 'active').map(task => task.id);
const displayed = h => h.view.list.children.map(item => item.dataset.taskId);
const command = (store, kind, task, values = {}) => store.request(kind, { id: task.id, version: task.version, ...values });

test('active task Actions exposes Move to list start', async () => {
    const h = model(); await settle();
    try {
        const action = moveButton(h, 'task_0003');
        assert.equal(action.tagName, 'BUTTON'); assert.equal(action.type, 'button'); assert.equal(action.disabled, false);
    } finally { h.view.destroy(); }
});

for (const locale of ['en', 'zh_CN', 'fallback']) test(`localized active-only action and first-row/filter explanations (${locale})`, async () => {
    const h = model({ locale }); await settle(); const label = locale === 'zh_CN' ? '移到列表首位' : 'Move to list start';
    const first = moveButton(h, 'task_0001', label), second = moveButton(h, 'task_0003', label), before = h.backend.raw();
    assert.equal(first.disabled, true); assert.equal(second.disabled, false);
    assert.equal(second.title, locale === 'zh_CN' ? '将此待办移到列表首位，不改变“下一件事”。' : 'Moves this task to the start of the list without changing Next up.');
    assert.equal(second.tabIndex, 0); assert.equal(second.dataset.taskAction, label);
    for (const id of ['task_0000', 'task_0002']) assert.equal(button(row(h, id), label), undefined, 'not exposed for inactive rows');
    first.dispatch('click'); await settle(); assert.deepEqual(h.backend.raw(), before); assert.equal(h.backend.writes, 0);
    input(h.view.filterInput, 'duplicate'); const filtered = moveButton(h, 'task_0009', label);
    assert.equal(filtered.disabled, true); assert.equal(filtered.title, locale === 'zh_CN' ? '清除筛选后可调整任务顺序。' : 'Clear the filter to reorder tasks.');
    filtered.dispatch('click'); await settle(); assert.deepEqual(h.backend.raw(), before); assert.equal(h.backend.writes, 0);
    h.view.destroy();
});

test('last duplicate identity moves once, remains in collapsed preview after reload, and keeps Next up and drafts', async () => {
    const h = model(); await settle(); const before = h.backend.raw();
    assert.equal(h.view.list.children.length, 4); assert.equal(row(h, 'task_0009'), undefined);
    input(h.view.input, 'unsaved new task\n中文'); h.view.more.dispatch('click'); const action = moveButton(h, 'task_0009');
    action.focus(); action.dispatch('click'); await settle(); const after = h.backend.raw();
    assert.deepEqual(order(after), ['task_0009', 'task_0001', 'task_0003', 'task_0004', 'task_0006', 'task_0008']);
    assert.equal(h.backend.writes, 1); assert.equal(after.pinnedId, before.pinnedId); assert.deepEqual(after.recovery, before.recovery);
    assert.equal(h.view.next.querySelector('.tasks-next-text').textContent, `Next up: ${before.records[4].text}`);
    assert.equal(h.view.input.value, 'unsaved new task\n中文'); assert.equal(h.view.expanded, true);
    assert.equal(moveButton(h, 'task_0009').disabled, true); assert.equal(h.document.activeElement, row(h, 'task_0009').querySelector('summary'));
    h.view.more.dispatch('click'); assert.deepEqual(displayed(h), ['task_0009', 'task_0001', 'task_0003', 'task_0004']);
    h.view.destroy(); const reload = model({ state: after }); await settle();
    assert.equal(reload.view.expanded, false); assert.deepEqual(displayed(reload), ['task_0009', 'task_0001', 'task_0003', 'task_0004']);
    assert.equal(reload.controller.state.pinnedId, before.pinnedId); reload.view.destroy();
});

test('moving the pinned middle row keeps the pin and falls back to that row summary', async () => {
    const h = model(); await settle(); const action = moveButton(h, 'task_0004'), before = h.backend.raw();
    action.focus(); action.dispatch('click'); await settle();
    assert.equal(h.backend.raw().pinnedId, 'task_0004'); assert.equal(displayed(h)[0], 'task_0004'); assert.equal(h.view.expanded, false);
    assert.equal(h.document.activeElement, row(h, 'task_0004').querySelector('summary')); assert.equal(row(h, 'task_0004').querySelector('.tasks-row-menu').open, true);
    assert.deepEqual(h.backend.raw().records.find(task => task.id === 'task_0004'), before.records[4]);
    assert.equal(button(row(h, 'task_0004'), 'Unpin').getAttribute('aria-pressed'), 'true'); h.view.destroy();
});

for (const focus of ['draft', 'search']) test(`pending action coalesces and confirmed move does not steal newer ${focus} focus`, async () => {
    const h = model(); await settle(); const wait = deferred(); h.backend.delay = wait.promise;
    const action = moveButton(h, 'task_0004'), other = moveButton(h, 'task_0003'); action.focus(); action.dispatch('click'); await settle();
    assert.equal(h.controller.status, 'saving'); assert.equal(action.disabled, false); assert.equal(action.getAttribute('aria-disabled'), 'true'); assert.equal(h.document.activeElement, action);
    const original = h.controller.retryCommand; action.dispatch('click'); action.dispatch('click', { detail: 2 }); other.dispatch('click');
    assert.equal(h.controller.retryCommand, original); assert.equal(h.backend.writes, 1);
    input(h.view.input, 'a newer draft'); const nextFocus = focus === 'draft' ? h.view.input : h.search; nextFocus.focus();
    wait.resolve(); await settle(); assert.equal(h.backend.writes, 1); assert.equal(h.document.activeElement, nextFocus); assert.equal(h.view.input.value, 'a newer draft');
    assert.equal(h.controller.status, 'saved'); assert.equal(displayed(h)[0], 'task_0004'); h.view.destroy();
});

test('old row controls cannot issue an action after redraw, filtering, reorder or disposal', async () => {
    const h = model(); await settle(); const original = moveButton(h, 'task_0003');
    h.view.more.dispatch('click'); original.dispatch('click'); await settle(); assert.equal(h.backend.writes, 0);
    input(h.view.filterInput, 'duplicate'); const filtered = moveButton(h, 'task_0009');
    h.view.filterClear.dispatch('click'); filtered.dispatch('click'); await settle(); assert.equal(h.backend.writes, 0);
    const old = moveButton(h, 'task_0009'); old.dispatch('click'); await settle(); const before = h.backend.raw(), writes = h.backend.writes;
    old.dispatch('click'); old.dispatch('click', { detail: 2 }); moveButton(h, 'task_0009').dispatch('click'); await settle();
    assert.deepEqual(h.backend.raw(), before); assert.equal(h.backend.writes, writes);
    const live = moveButton(h, 'task_0003'); h.view.destroy(); live.dispatch('click'); await settle(); assert.equal(h.backend.writes, writes);
});

test('new action ignores closed/hidden/inert menus, dialogs and an unavailable workspace', async () => {
    const h = model(); await settle(); const action = moveButton(h, 'task_0003'), menu = row(h, 'task_0003').querySelector('.tasks-row-menu');
    menu.open = false; action.dispatch('click'); menu.open = true;
    h.host.hidden = true; action.dispatch('click'); h.host.hidden = false;
    h.host.inert = true; action.dispatch('click'); h.host.inert = false;
    h.document.hidden = true; action.dispatch('click'); h.document.hidden = false;
    h.backend.workspace = { invalidated: true }; action.dispatch('click'); h.backend.workspace = { _suspended: true }; action.dispatch('click'); h.backend.workspace = null;
    button(row(h, 'task_0003'), 'Edit').dispatch('click'); action.dispatch('click'); await settle(); assert.equal(h.backend.writes, 0);
    button(h.document.body, 'Cancel').dispatch('click'); action.dispatch('click'); await settle(); assert.equal(h.backend.writes, 1); h.view.destroy();
});

for (const change of ['edit', 'complete', 'move']) test(`unobserved remote ${change} conflicts through real Store/Controller and preserves draft/focus`, async () => {
    const h = model(); await settle(); h.backend.notifications = false; const action = moveButton(h, 'task_0004'), stale = h.backend.raw();
    await h.remote.mutate(command(h.remote, change, stale.records[4], change === 'edit' ? { text: 'remote revised task' } : change === 'move' ? { order: order(stale), direction: 1 } : {}));
    const latest = h.backend.raw(), writes = h.backend.writes; input(h.view.input, 'keep local draft'); h.view.input.focus(); action.dispatch('click'); await settle();
    assert.equal(h.controller.error.code, 'CONFLICT'); assert.equal(h.controller.retryCommand.kind, 'moveFirst'); assert.deepEqual(h.backend.raw(), latest); assert.equal(h.backend.writes, writes);
    assert.equal(h.view.input.value, 'keep local draft'); assert.equal(h.document.activeElement, h.view.input); assert.equal(h.view.retry.hidden, true, 'existing conflict flow requires review rather than blind retry');
    assert.equal(h.view.status.textContent, 'This task list changed in another page. Your draft is still here. Review the latest version before retrying.'); h.view.destroy();
});

for (const committed of [false, true]) test(`view ${committed ? 'uncertain acknowledgement' : 'write failure'} retains exact retry without duplicate rotation`, async () => {
    const h = model(); await settle(); h.backend.notifications = false; h.backend[committed ? 'failAfterWrite' : 'fail'] = true;
    const before = h.backend.raw(), action = moveButton(h, 'task_0004'); action.dispatch('click'); await settle();
    assert.equal(h.controller.status, 'error'); const request = h.controller.retryCommand; assert.equal(request.kind, 'moveFirst'); assert.equal(h.view.retry.hidden, false);
    if (!committed) assert.deepEqual(h.backend.raw(), before);
    h.backend.fail = false; const writes = h.backend.writes; input(h.view.input, 'new draft while retrying'); h.view.input.focus();
    h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved'); assert.equal(h.controller.retryCommand, null);
    assert.equal(h.backend.writes, writes + (committed ? 0 : 1)); assert.deepEqual(order(h.backend.raw()), ['task_0004', 'task_0001', 'task_0003', 'task_0006', 'task_0008', 'task_0009']);
    assert.equal(h.document.activeElement, h.view.input); assert.equal(h.view.input.value, 'new draft while retrying'); assert.equal(h.backend.raw().receipts.at(-1), request.operationId); h.view.destroy();
});

test('retry after a later receipt reports conflict and never reorders the newer list', async () => {
    const h = model(); await settle(); h.backend.notifications = false; h.backend.failAfterWrite = true;
    moveButton(h, 'task_0004').dispatch('click'); await settle();
    const state = h.backend.raw(); await h.remote.mutate(command(h.remote, 'move', state.records.find(task => task.id === 'task_0004'), { order: order(state), direction: 1 }));
    const latest = h.backend.raw(), writes = h.backend.writes; h.view.retry.dispatch('click'); await settle();
    assert.equal(h.controller.error.code, 'CONFLICT'); assert.deepEqual(h.backend.raw(), latest); assert.equal(h.backend.writes, writes); h.view.destroy();
});
