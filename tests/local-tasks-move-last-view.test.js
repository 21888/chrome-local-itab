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
function model({ locale = 'en', state = initial(), workspaceMode = 'active' } = {}) {
    let raw = structuredClone(state), queue = Promise.resolve(); const listeners = new Set();
    const backend = {
        workspace: { id: 'workspace_0001', generation: 'generation_0001', invalidated: false, _suspended: false }, reads: 0, writes: 0, delay: null, fail: false, failAfterWrite: false, notifications: true,
        lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() { backend.reads++; return structuredClone(raw); },
        async write(value) {
            backend.writes++; if (backend.delay) await backend.delay; if (backend.fail) return false;
            raw = structuredClone(value); if (backend.notifications) listeners.forEach(fn => fn());
            if (backend.failAfterWrite) { backend.failAfterWrite = false; throw new Error('uncertain acknowledgement'); }
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, raw: () => structuredClone(raw)
    };
    if (workspaceMode === 'none') delete backend.workspace;
    const store = new tasks.Store(backend), remote = new tasks.Store(backend), controller = new Controller(store);
    const document = createDocument({ blurUnavailableFocus: true }), host = document.createElement('article'), search = document.createElement('input');
    document.body.append(search, host); search.focus();
    const api = { ...tasks, Controller }, window = { LocalItabTasks: api, LocalItabContentLifecycle: { departing: false },
        LocalItabWorkspaces: { session: workspaceMode === 'missing-session' ? undefined : workspaceMode === 'wrong-session' ? {} : backend.workspace },
        getComputedStyle(node) { return { display: node.style.display || 'block', visibility: node.style.visibility || 'visible' }; } };
    if (locale !== 'fallback') {
        const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../_locales', locale, 'messages.json'), 'utf8'));
        window.i18n = { t: key => catalog[key]?.message || key };
    }
    const context = vm.createContext({ window, document, crypto: webcrypto, URL, Blob, setTimeout, console });
    for (const name of ['dialog-focus.js', 'local-tasks-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared', name), 'utf8'), context);
    const view = api.mount(host, { controller });
    return { backend, store, remote, controller, document, host, search, view, window };
}
const row = (h, id) => h.host.querySelectorAll('[data-task-id]').find(item => item.dataset.taskId === id);
const button = (node, label) => node?.querySelectorAll('button').find(item => item.textContent === label);
function moveButton(h, id, label = 'Move to list end') {
    const item = row(h, id); assert(item, `rendered row ${id}`);
    const menu = item.querySelector('.tasks-row-menu'); if (menu) menu.open = true;
    const action = button(item, label); assert(action, `move-to-end button for ${id}`); return action;
}
const input = (node, text) => { node.value = text; node.dispatch('input'); };
const order = state => state.records.filter(task => task.state === 'active').map(task => task.id);
const displayed = h => h.view.list.children.map(item => item.dataset.taskId);
const command = (store, kind, task, values = {}) => store.request(kind, { id: task.id, version: task.version, ...values });

// Uses the unchanged shared DOM model with real Store/Controller. Event fields
// and ownership mutations are explicit modeled probes, not native browser QA.
for (const locale of ['en', 'zh_CN', 'fallback']) test(`active-only native Move-to-end button, last/filter disabling and help (${locale})`, async () => {
    const h = model({ locale }); await settle(); h.view.more.dispatch('click');
    const label = locale === 'zh_CN' ? '移到列表末位' : 'Move to list end';
    const first = moveButton(h, 'task_0001', label), last = moveButton(h, 'task_0009', label), before = h.backend.raw();
    assert.equal(first.tagName, 'BUTTON'); assert.equal(first.type, 'button'); assert.equal(first.tabIndex, 0); assert.equal(first.disabled, false);
    assert.equal(first.dataset.taskAction, label); assert.equal(last.disabled, true);
    assert.equal(first.title, locale === 'zh_CN' ? '将此待办移到列表末位，不改变“下一件事”。' : 'Moves this task to the end of the list without changing Next up.');
    for (const id of ['task_0000', 'task_0002']) assert.equal(button(row(h, id), label), undefined);
    last.dispatch('click'); await settle(); assert.equal(h.backend.writes, 0);
    input(h.view.filterInput, 'duplicate'); const filtered = moveButton(h, 'task_0004', label);
    assert.equal(filtered.disabled, true); assert.equal(filtered.title, locale === 'zh_CN' ? '清除筛选后可调整任务顺序。' : 'Clear the filter to reorder tasks.');
    filtered.dispatch('click'); await settle(); assert.deepEqual(h.backend.raw(), before); assert.equal(h.backend.writes, 0); h.view.destroy();
});

for (const id of ['task_0001', 'task_0003', 'task_0004', 'task_0006']) test(`collapsed visible ${id} moves once outside preview without expanding; draft and pin survive reload`, async () => {
    const h = model(); await settle(); const before = h.backend.raw(); input(h.view.input, 'unsaved new task\n中文');
    const action = moveButton(h, id); action.focus(); action.dispatch('click'); await settle(); const after = h.backend.raw();
    const expected = [...order(before).filter(value => value !== id), id]; assert.deepEqual(order(after), expected);
    assert.equal(h.backend.writes, 1); assert.equal(after.revision, before.revision + 1); assert.equal(after.receipts.length, before.receipts.length + 1);
    assert.equal(after.pinnedId, before.pinnedId); assert.deepEqual(after.recovery, before.recovery);
    assert.equal(h.view.next.querySelector('.tasks-next-text').textContent, `Next up: ${before.records[4].text}`);
    for (const task of before.records) assert.deepEqual(after.records.find(record => record.id === task.id), task);
    assert.equal(h.view.input.value, 'unsaved new task\n中文'); assert.equal(h.view.expanded, false);
    assert.deepEqual(displayed(h), expected.slice(0, 4)); assert.equal(row(h, id), undefined); assert.equal(h.document.activeElement, h.view.input);
    h.view.destroy(); const reload = model({ state: after }); await settle();
    assert.equal(reload.view.expanded, false); assert.deepEqual(displayed(reload), expected.slice(0, 4)); assert.equal(reload.controller.state.pinnedId, before.pinnedId); reload.view.destroy();
});

for (const count of [2, 4, 6]) test(`target still visible in ${count}-task list falls back to its original Actions summary`, async () => {
    const state = initial(); const keep = new Set(order(state).slice(0, count)); state.records = state.records.filter(task => task.state !== 'active' || keep.has(task.id));
    if (!keep.has(state.pinnedId)) state.pinnedId = null;
    const h = model({ state }); await settle(); if (count > 4) h.view.more.dispatch('click');
    const action = moveButton(h, 'task_0001'); action.focus(); action.dispatch('click'); await settle();
    assert.equal(order(h.backend.raw()).at(-1), 'task_0001'); assert.equal(h.view.expanded, count > 4);
    assert.equal(moveButton(h, 'task_0001').disabled, true); assert.equal(h.document.activeElement, row(h, 'task_0001').querySelector('summary'));
    assert.equal(row(h, 'task_0001').querySelector('.tasks-row-menu').open, true); h.view.destroy();
});

for (const focus of ['draft', 'search', 'editor']) test(`pending move coalesces without stealing newer ${focus} focus`, async () => {
    const h = model(); await settle(); const wait = deferred(); h.backend.delay = wait.promise;
    const action = moveButton(h, 'task_0004'), other = moveButton(h, 'task_0003'); action.focus(); action.dispatch('click'); await settle();
    assert.equal(h.controller.status, 'saving'); assert.equal(action.disabled, false); assert.equal(action.getAttribute('aria-disabled'), 'true'); assert.equal(h.document.activeElement, action);
    const request = h.controller.retryCommand; action.dispatch('click'); action.dispatch('click', { detail: 2 }); other.dispatch('click');
    assert.equal(h.controller.retryCommand, request); assert.equal(h.backend.writes, 1);
    input(h.view.input, 'a newer draft'); let nextFocus = focus === 'draft' ? h.view.input : h.search;
    if (focus === 'editor') { button(row(h, 'task_0003'), 'Edit').dispatch('click'); nextFocus = h.document.body.querySelector('.tasks-editor'); input(nextFocus, 'new editor draft'); }
    nextFocus.focus(); wait.resolve(); await settle();
    assert.equal(h.backend.writes, 1); assert.equal(h.document.activeElement, nextFocus); assert.equal(h.view.input.value, 'a newer draft');
    if (focus === 'editor') assert.equal(nextFocus.value, 'new editor draft');
    assert.equal(h.controller.status, 'saved'); assert.equal(order(h.backend.raw()).at(-1), 'task_0004'); h.view.destroy();
});

for (const change of ['expand', 'collapse', 'filter', 'rerender', 'dispose']) test(`old row callback cannot revive after ${change}, even reattaching the entire old row`, async () => {
    const h = model(); await settle(); if (change === 'collapse') h.view.more.dispatch('click');
    const action = moveButton(h, 'task_0003'), old = row(h, 'task_0003'), list = h.view.list;
    if (change === 'expand' || change === 'collapse') h.view.more.dispatch('click');
    else if (change === 'filter') { input(h.view.filterInput, 'duplicate'); h.view.filterClear.dispatch('click'); }
    else if (change === 'rerender') { h.view.renderedRevision = -1; h.view.render(); }
    else h.view.destroy();
    action.dispatch('click'); await settle(); assert.equal(h.backend.writes, 0);
    if (change !== 'dispose') row(h, 'task_0003').replaceWith(old); else list.append(old);
    assert.equal(old.isConnected, true); old.querySelector('.tasks-row-menu').open = true; action.dispatch('click'); await settle();
    assert.equal(h.backend.writes, 0); h.view.destroy();
});

const denied = {
    'disabled property': (h, a) => { a.disabled = true; },
    'disabled attribute': (h, a) => a.setAttribute('disabled', ''),
    'aria-disabled': (h, a) => a.setAttribute('aria-disabled', 'true'),
    'closed menu': (h, a) => { a.closest('details').open = false; },
    'hidden button': (h, a) => { a.hidden = true; },
    'hidden title': h => { row(h, 'task_0003').querySelector('.tasks-text').hidden = true; },
    'hidden row top': h => { row(h, 'task_0003').querySelector('.tasks-row-main').hidden = true; },
    'inert title': h => { row(h, 'task_0003').querySelector('.tasks-text').inert = true; },
    'aria-hidden row top': h => row(h, 'task_0003').querySelector('.tasks-row-main').setAttribute('aria-hidden', 'true'),
    'display-none title': h => { row(h, 'task_0003').querySelector('.tasks-text').style.display = 'none'; },
    'visibility-hidden row top': h => { row(h, 'task_0003').querySelector('.tasks-row-main').style.visibility = 'hidden'; },
    'zero-rect title': h => { row(h, 'task_0003').querySelector('.tasks-text').getClientRects = () => []; },
    'hidden host': h => { h.host.hidden = true; },
    'inert ancestor': h => { h.host.inert = true; },
    'aria-hidden ancestor': h => h.host.setAttribute('aria-hidden', 'true'),
    'display-none ancestor': h => { h.host.style.display = 'none'; },
    'visibility-hidden ancestor': h => { h.host.style.visibility = 'hidden'; },
    'visibility-collapse button': (h, a) => { a.style.visibility = 'collapse'; },
    'document hidden': h => { h.document.hidden = true; },
    'document visibility': h => { h.document.visibilityState = 'hidden'; },
    'pending controller': h => { h.controller.pending = Promise.resolve(); },
    'closed controller': h => { h.controller.closed = true; },
    'loading controller': h => { h.controller.status = 'loading'; },
    'saving controller': h => { h.controller.status = 'saving'; },
    'error controller': h => { h.controller.status = 'error'; },
    'READ error': h => { h.controller.error = tasks.fault('READ'); },
    'WRITE error': h => { h.controller.error = tasks.fault('WRITE'); },
    'VERIFY error': h => { h.controller.error = tasks.fault('VERIFY'); },
    'local error': h => { h.view.localError = tasks.fault('FILE'); },
    'outstanding retry': h => { h.controller.retryCommand = h.store.request('enable', { enabled: true }); },
    'missing state': h => { h.controller.state = null; },
    'pending review': h => { h.view.pendingReview = true; },
    'dialog': h => { button(row(h, 'task_0003'), 'Edit').dispatch('click'); },
    'batch session': h => { h.view.batchSession = {}; },
    'reuse session': h => { h.view.reuseSession = {}; },
    'completion session': h => { h.view.completionSession = {}; },
    'departing': h => { h.window.LocalItabContentLifecycle.departing = true; },
    'invalid workspace': h => { h.backend.workspace.invalidated = true; },
    'suspended workspace': h => { h.backend.workspace._suspended = true; },
    'changed workspace ID': h => { h.backend.workspace.id = 'workspace_0002'; },
    'changed workspace generation': h => { h.backend.workspace.generation = 'generation_0002'; },
    'replaced workspace': h => { h.backend.workspace = {}; },
    'replaced session': h => { h.window.LocalItabWorkspaces.session = {}; },
    'unapplied filter': h => { h.view.filterInput.value = 'duplicate'; },
    'filter composition': h => { h.view.filterComposing = true; },
    'removed row': h => row(h, 'task_0003').remove(),
    'changed row ID': h => { row(h, 'task_0003').dataset.taskId = 'task_0001'; },
    'changed title': h => { row(h, 'task_0003').querySelector('.tasks-text').textContent = 'different'; },
    'replaced title': h => { const title = row(h, 'task_0003').querySelector('.tasks-text'), next = h.document.createElement('span'); next.className = 'tasks-text'; next.textContent = title.textContent; title.replaceWith(next); },
    'reparented title': h => { const item = row(h, 'task_0003'), title = item.querySelector('.tasks-text'); title.remove(); item.append(title); },
    'reparented button': (h, a) => { a.remove(); row(h, 'task_0004').querySelector('.tasks-row-actions').append(a); },
    'reparented actions': h => { const item = row(h, 'task_0003'), actions = item.querySelector('.tasks-row-actions'); actions.remove(); item.append(actions); },
    'reparented menu': h => { const item = row(h, 'task_0003'), menu = item.querySelector('.tasks-row-menu'); menu.remove(); h.host.append(menu); },
    'replaced summary': h => row(h, 'task_0003').querySelector('summary').replaceWith(h.document.createElement('summary')),
    'replaced button': (h, a) => { const replacement = h.document.createElement('button'); replacement.className = a.className; replacement.textContent = a.textContent; a.replaceWith(replacement); },
    'foreign ownerDocument': (h, a) => { a.ownerDocument = createDocument(); },
    'foreign title document': h => { row(h, 'task_0003').querySelector('.tasks-text').ownerDocument = createDocument(); },
    'reparented list': h => { const wrap = h.document.createElement('div'); h.host.append(wrap); h.view.list.remove(); wrap.append(h.view.list); },
    'reparented host': h => { const wrap = h.document.createElement('div'); h.document.body.append(wrap); h.host.remove(); wrap.append(h.host); },
    'replaced view list': h => { h.view.list = h.document.createElement('ul'); },
    'replaced view host': h => { h.view.host = h.document.createElement('article'); },
    'changed target version': h => { h.controller.state.records.find(task => task.id === 'task_0003').version = 'different_version'; },
    'changed target text': h => { h.controller.state.records.find(task => task.id === 'task_0003').text = 'changed'; },
    'changed target state': h => { h.controller.state.records.find(task => task.id === 'task_0003').state = 'done'; },
    'changed active suffix': h => { const list = h.controller.state.records; [list[8], list[9]] = [list[9], list[8]]; }
};
for (const [name, change] of Object.entries(denied)) test(`Move-to-end rejects ${name} before storage I/O`, async () => {
    const h = model(); await settle(); const action = moveButton(h, 'task_0003'), before = h.backend.raw(), reads = h.backend.reads;
    change(h, action); action.dispatch('click'); await settle(); assert.deepEqual(h.backend.raw(), before); assert.equal(h.backend.writes, 0); assert.equal(h.backend.reads, reads); h.view.destroy();
});

for (const fields of [{ defaultPrevented: true }, { detail: 2 }, { repeat: true }, { isComposing: true }, { keyCode: 229 }]) test(`rejects synthetic blocked activation ${JSON.stringify(fields)}`, async () => {
    const h = model(); await settle(); const action = moveButton(h, 'task_0003'); action.dispatch('click', fields); await settle(); assert.equal(h.backend.writes, 0); h.view.destroy();
});
for (const key of ['Enter', ' ']) test(`native button ${JSON.stringify(key)} repeat/IME prevention leaves ordinary activation available`, async () => {
    const h = model(); await settle(); const action = moveButton(h, 'task_0003');
    for (const fields of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) assert.equal(action.dispatch('keydown', { key, ...fields }).prevented, true);
    assert.equal(action.dispatch('keydown', { key }).prevented, false); assert.equal(h.backend.writes, 0);
    action.dispatch('click', { detail: 0 }); await settle(); assert.equal(h.backend.writes, 1); h.view.destroy();
});

test('quick-entry composition owns its draft but does not disable independent saved-task movement', async () => {
    const h = model(); await settle(); input(h.view.input, '正在输入'); h.view.input.focus(); h.view.input.dispatch('compositionstart');
    moveButton(h, 'task_0003').dispatch('click'); await settle(); assert.equal(h.backend.writes, 1);
    assert.equal(h.view.quickEntryComposing, true); assert.equal(h.view.input.value, '正在输入'); assert.equal(h.document.activeElement, h.view.input);
    h.view.input.dispatch('compositionend'); h.view.destroy();
});

test('new button ownership remains independent of removed or disabled sibling action buttons', async () => {
    const h = model(); await settle(); const action = moveButton(h, 'task_0003'), item = row(h, 'task_0003');
    for (const label of ['Move up', 'Move down', 'Move to list start', 'Copy text', 'New task from text']) button(item, label).remove();
    action.dispatch('click'); await settle(); assert.equal(h.backend.writes, 1); assert.equal(order(h.backend.raw()).at(-1), 'task_0003'); h.view.destroy();
});

for (const change of ['edit', 'complete', 'remove', 'move']) test(`unobserved remote ${change} conflicts through real Store/Controller, keeping draft and focus`, async () => {
    const h = model(); await settle(); h.backend.notifications = false; const action = moveButton(h, 'task_0004'), stale = h.backend.raw();
    await h.remote.mutate(command(h.remote, change, stale.records[4], change === 'edit' ? { text: 'remote revised task' } : change === 'move' ? { order: order(stale), direction: 1 } : {}));
    const latest = h.backend.raw(), writes = h.backend.writes; input(h.view.input, 'keep local draft'); h.view.input.focus(); action.dispatch('click'); await settle();
    assert.equal(h.controller.error.code, 'CONFLICT'); assert.equal(h.controller.retryCommand.kind, 'moveLast'); assert.deepEqual(h.backend.raw(), latest); assert.equal(h.backend.writes, writes);
    assert.equal(h.view.input.value, 'keep local draft'); assert.equal(h.document.activeElement, h.view.input); assert.equal(h.view.retry.hidden, true); h.view.destroy();
});

for (const committed of [false, true]) test(`view ${committed ? 'uncertain acknowledgement' : 'write failure'} retains exact retry without duplicate rotation`, async () => {
    const h = model(); await settle(); h.backend.notifications = false; h.backend[committed ? 'failAfterWrite' : 'fail'] = true;
    const before = h.backend.raw(); moveButton(h, 'task_0004').dispatch('click'); await settle();
    assert.equal(h.controller.status, 'error'); const request = h.controller.retryCommand; assert.equal(request.kind, 'moveLast'); assert.equal(h.view.retry.hidden, false);
    if (!committed) assert.deepEqual(h.backend.raw(), before);
    h.backend.fail = false; const writes = h.backend.writes; input(h.view.input, 'new draft while retrying'); h.view.input.focus(); h.view.retry.dispatch('click'); await settle();
    assert.equal(h.controller.status, 'saved'); assert.equal(h.controller.retryCommand, null); assert.equal(h.backend.writes, writes + (committed ? 0 : 1));
    assert.deepEqual(order(h.backend.raw()), ['task_0001', 'task_0003', 'task_0006', 'task_0008', 'task_0009', 'task_0004']);
    assert.equal(h.document.activeElement, h.view.input); assert.equal(h.view.input.value, 'new draft while retrying'); assert.equal(h.backend.raw().receipts.at(-1), request.operationId); h.view.destroy();
});

test('retry after a later receipt reports conflict and never reorders newer data', async () => {
    const h = model(); await settle(); h.backend.notifications = false; h.backend.failAfterWrite = true; moveButton(h, 'task_0004').dispatch('click'); await settle();
    const state = h.backend.raw(); await h.remote.mutate(command(h.remote, 'move', state.records.find(task => task.id === 'task_0004'), { order: order(state), direction: -1 }));
    const latest = h.backend.raw(), writes = h.backend.writes; h.view.retry.dispatch('click'); await settle();
    assert.equal(h.controller.error.code, 'CONFLICT'); assert.deepEqual(h.backend.raw(), latest); assert.equal(h.backend.writes, writes); h.view.destroy();
});

for (const workspaceMode of ['missing-session', 'wrong-session']) test(`workspace must match the live session at row creation: ${workspaceMode}`, async () => {
    const h = model({ workspaceMode }); await settle(); const before = h.backend.raw(), reads = h.backend.reads;
    moveButton(h, 'task_0003').dispatch('click'); await settle(); assert.equal(h.backend.writes, 0); assert.equal(h.backend.reads, reads); assert.deepEqual(h.backend.raw(), before); h.view.destroy();
});
test('plain non-workspace backend and fully visible original title remain valid', async () => {
    const h = model({ workspaceMode: 'none' }); await settle(); moveButton(h, 'task_0003').dispatch('click'); await settle();
    assert.equal(h.backend.writes, 1); assert.equal(order(h.backend.raw()).at(-1), 'task_0003'); h.view.destroy();
});

test('a conflict refresh permits a new explicit current-row move while its old callback stays rejected', async () => {
    const h = model(); await settle(); h.backend.notifications = false; const stale = h.backend.raw(), old = moveButton(h, 'task_0003');
    await h.remote.mutate(command(h.remote, 'edit', stale.records[3], { text: 'new saved task text' }));
    old.dispatch('click'); await settle(); assert.equal(h.controller.error.code, 'CONFLICT'); assert.equal(h.view.retry.hidden, true);
    const previous = h.controller.retryCommand, writes = h.backend.writes; old.dispatch('click'); await settle(); assert.equal(h.backend.writes, writes);
    const current = moveButton(h, 'task_0003'); assert.notEqual(current, old); current.dispatch('click'); await settle();
    assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes + 1); assert.equal(order(h.backend.raw()).at(-1), 'task_0003');
    assert.notEqual(h.backend.raw().receipts.at(-1), previous.operationId); assert.equal(h.backend.raw().records.find(task => task.id === 'task_0003').text, 'new saved task text');
    old.dispatch('click'); await settle(); assert.equal(h.backend.writes, writes + 1); h.view.destroy();
});
