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
    const state = tasks.initial(); state.enabled = true; state.revision = 12;
    state.records = Array.from({ length: 9 }, (_, i) => ({
        id: `task_${String(i).padStart(4, '0')}`, version: `version_${String(i).padStart(4, '0')}`,
        text: i === 5 ? '😀'.repeat(1000) : i === 1 ? '  duplicate 中文  ' : i === 2 ? '  duplicate 中文  ' : `  中文😀 ${i}\r\n<b>literal HTML</b>\n trailing  `,
        state: i < 6 ? 'active' : i < 8 ? 'done' : 'removed', removedFrom: i < 8 ? null : 'done',
        createdAt: '2021-01-02T03:04:05.000Z', updatedAt: '2022-03-04T05:06:07.000Z'
    }));
    state.pinnedId = state.records[1].id; state.receipts = ['historic_operation_0001'];
    state.recovery = [{ id: 'recovery_0001', createdAt: '2023-04-05T06:07:08.000Z', content: { records: structuredClone(state.records.slice(0, 2)), pinnedId: null } }];
    return tasks.validate(state);
}
function model(options = {}) {
    let raw = structuredClone(options.state || initial()), queue = Promise.resolve(); const listeners = new Set(), events = new Map(), observers = new Set();
    const backend = {
        reads: 0, writes: 0, fail: false, delay: null, workspace: { invalidated: false, _suspended: false },
        lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() { backend.reads++; return structuredClone(raw); },
        async write(value) { backend.writes++; if (backend.delay) await backend.delay; if (backend.fail) return false; raw = structuredClone(value); listeners.forEach(fn => fn()); },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, raw: () => structuredClone(raw)
    };
    const store = new tasks.Store(backend), controller = new Controller(store), document = createDocument({ blurUnavailableFocus: true });
    const workspace = document.createElement('section'), host = document.createElement('article'), search = document.createElement('input');
    workspace.append(host); document.body.append(search, workspace); search.focus();
    const api = { ...tasks, Controller }, calls = [], clipboard = options.clipboard === undefined ? { writeText(text) { calls.push(text); return Promise.resolve(); } } : options.clipboard;
    const window = { LocalItabTasks: api, LocalItabContentLifecycle: { departing: false }, navigator: { clipboard },
        addEventListener(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
        removeEventListener(type, fn) { events.get(type)?.delete(fn); },
        getComputedStyle(node) { for (let current = node; current; current = current.parentElement) if (current.style.visibility) return { visibility: current.style.visibility }; return { visibility: 'visible' }; },
        // Explicit observer records model mutation delivery; this does not claim native timing.
        MutationObserver: class {
            constructor(callback) { this.callback = callback; this.records = []; }
            observe() { observers.add(this); }
            disconnect() { observers.delete(this); }
            takeRecords() { const records = this.records; this.records = []; return records; }
        }
    };
    if (options.locale) { const messages = JSON.parse(fs.readFileSync(path.join(__dirname, '../_locales', options.locale, 'messages.json'))); window.i18n = { t: key => messages[key]?.message || key }; }
    const context = vm.createContext({ window, document, crypto: webcrypto, setTimeout, URL, Blob, console });
    for (const file of ['dialog-focus.js', 'local-tasks-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared', file), 'utf8'), context);
    const view = api.mount(host, { controller, ...(options.inject ? { clipboard } : {}) });
    return { backend, store, controller, document, host, workspace, search, view, window, calls, events, observers,
        emit(type) { for (const fn of events.get(type) || []) fn(); },
        mutations(records) { for (const observer of [...observers]) observer.callback(records); },
        queueMutations(records) { for (const observer of observers) observer.records.push(...records); } };
}
const button = (parent, label) => parent?.querySelectorAll('button').find(node => node.textContent === label);
const row = (h, id) => h.host.querySelectorAll('[data-task-id]').find(node => node.dataset.taskId === id);
const input = (node, text) => { node.value = text; node.dispatch('input'); };
function copyButton(h, id, label = 'Copy text') {
    const item = row(h, id); assert(item, `rendered row ${id}`);
    for (let ancestor = item; ancestor; ancestor = ancestor.parentElement) if (ancestor.tagName === 'DETAILS') ancestor.open = true;
    const menu = item.querySelector('.tasks-row-menu'); if (menu) menu.open = true;
    const result = button(item, label); assert(result, `copy button for ${id}`); return result;
}
const feedback = (h, id) => row(h, id)?.querySelector('.tasks-row-copy-status');
function unchanged(h, before, reads, writes) { assert.deepEqual(h.backend.raw(), before); assert.equal(h.backend.reads, reads); assert.equal(h.backend.writes, writes); }
function clean(h) { h.view.destroy(); assert.equal(h.observers.size, 0); for (const type of ['blur', 'pagehide']) assert.equal(h.events.get(type)?.size || 0, 0); }

test('copy exact saved text in active, completed and removed rows without storage I/O', async () => {
    const h = model(); await settle(); const before = h.backend.raw(), reads = h.backend.reads;
    for (const id of ['task_0000', 'task_0006', 'task_0008']) {
        const origin = copyButton(h, id); assert.equal(origin.tagName, 'BUTTON'); assert.equal(origin.type, 'button'); assert.equal(origin.tabIndex, 0);
        origin.focus(); origin.dispatch('click');
        assert.equal(h.calls.at(-1), before.records.find(task => task.id === id).text, 'clipboard called synchronously with saved text');
        await settle(); assert.equal(feedback(h, id).textContent, 'Task text copied.'); assert.equal(feedback(h, id).getAttribute('role'), 'status');
        assert.equal(h.document.activeElement, origin); assert.equal(row(h, id).querySelector('.tasks-text').children.length, 0);
    }
    unchanged(h, before, reads, 0); clean(h);
});

test('expanded and filtered rows copy only the clicked identity, including duplicates and 1,000 Unicode characters', async () => {
    const h = model({ inject: true }); await settle(); const before = h.backend.raw(), reads = h.backend.reads;
    input(h.view.input, 'unsaved quick-entry draft'); h.view.more.dispatch('click');
    for (const id of ['task_0001', 'task_0002', 'task_0005']) {
        copyButton(h, id).dispatch('click'); await settle(); assert.equal(h.calls.at(-1), before.records.find(task => task.id === id).text);
        assert.equal(feedback(h, id).textContent, 'Task text copied.');
    }
    assert.equal(Array.from(h.calls.at(-1)).length, 1000);
    const old = copyButton(h, 'task_0005'); input(h.view.filterInput, '<b>literal html</b>');
    copyButton(h, 'task_0004').dispatch('click'); await settle(); const count = h.calls.length;
    old.dispatch('click'); await settle(); assert.equal(h.calls.length, count); assert.equal(h.calls.at(-1), before.records[4].text);
    assert.equal(h.view.filterQuery, '<b>literal html</b>'); assert.equal(h.view.expanded, true); assert.equal(h.view.input.value, 'unsaved quick-entry draft');
    unchanged(h, before, reads, 0); clean(h);
});

test('saved maximum-length text also stays exact in completed and removed rows', async () => {
    const state = initial();
    for (const id of ['task_0006', 'task_0008']) state.records.find(task => task.id === id).text = '中😀'.repeat(500);
    const h = model({ state: tasks.validate(state) }); await settle(); const reads = h.backend.reads, before = h.backend.raw();
    for (const id of ['task_0006', 'task_0008']) { copyButton(h, id).dispatch('click'); await settle(); assert.equal(h.calls.at(-1), '中😀'.repeat(500)); }
    unchanged(h, before, reads, 0); clean(h);
});

test('one unresolved clipboard call blocks double clicks, repeated activation and another row across redraws', async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    const before = h.backend.raw(), reads = h.backend.reads, first = copyButton(h, 'task_0000'), second = copyButton(h, 'task_0001');
    first.focus(); first.dispatch('click'); assert.equal(calls.length, 1); assert.equal(first.getAttribute('aria-disabled'), 'true');
    first.dispatch('click', { detail: 2 }); first.dispatch('click'); second.dispatch('click'); assert.equal(calls.length, 1);
    assert.equal(h.document.activeElement, first, 'aria-disabled does not blur a native focused button');
    h.view.more.dispatch('click'); const replacement = copyButton(h, 'task_0000'); replacement.dispatch('click'); assert.equal(calls.length, 1);
    h.search.focus(); wait.resolve(); await settle(); assert.equal(feedback(h, 'task_0000').textContent, undefined); assert.equal(h.document.activeElement, h.search);
    assert.equal(replacement.getAttribute('aria-disabled'), 'false'); replacement.dispatch('click'); await settle(); assert.equal(calls.length, 2);
    unchanged(h, before, reads, 0); clean(h);
});

for (const failure of ['missing-api', 'synchronous-throw', 'asynchronous-reject']) test(`copy failure stays independent and manually selectable: ${failure}`, async () => {
    let calls = 0; const clipboard = failure === 'missing-api' ? null : { writeText() { calls++; if (failure === 'synchronous-throw') throw new Error('private error must not leak'); return Promise.reject(new Error('private rejection')); } };
    const h = model({ clipboard }); await settle(); const before = h.backend.raw(), reads = h.backend.reads;
    h.view.localError = tasks.fault('FILE'); h.view.undo = { ...h.controller.state.records[8] }; h.view.render();
    const message = h.view.status.textContent, undo = h.view.undo, origin = copyButton(h, 'task_0000'); origin.focus(); origin.dispatch('click'); await settle();
    assert.equal(feedback(h, 'task_0000').textContent, 'Could not copy. Select the task text to copy it manually.'); assert.equal(feedback(h, 'task_0000').classList.contains('is-error'), true);
    assert.equal(row(h, 'task_0000').querySelector('.tasks-text').textContent, before.records[0].text); assert.equal(h.view.status.textContent, message); assert.equal(h.view.localError.code, 'FILE');
    assert.equal(h.view.undo, undo); assert.equal(h.view.undoButton.hidden, false); assert.equal(h.document.activeElement, origin);
    await settle(); assert.equal(calls, failure === 'missing-api' ? 0 : 1, 'no automatic retry'); unchanged(h, before, reads, 0); clean(h);
});

for (const state of ['pending', 'closed', 'loading', 'saving', 'error', 'READ', 'WRITE', 'VERIFY', 'WORKSPACE_INVALIDATED']) test(`unavailable controller refuses copying synchronously: ${state}`, async () => {
    const h = model(); await settle(); const origin = copyButton(h, 'task_0000'), before = h.backend.raw(), reads = h.backend.reads;
    const retry = { kind: 'edit', operationId: 'operation_0001' }; h.controller.retryCommand = retry; h.view.retryEffectOperationId = retry.operationId;
    if (state === 'pending') h.controller.pending = Promise.resolve();
    else if (state === 'closed') h.controller.closed = true;
    else if (['loading', 'saving', 'error'].includes(state)) h.controller.status = state;
    else { h.controller.error = tasks.fault(state); h.controller.status = 'ready'; }
    h.view.render(); const status = h.view.status.textContent, retryHidden = h.view.retry.hidden;
    assert.equal(origin.getAttribute('aria-disabled'), 'true'); origin.dispatch('click'); await settle();
    assert.equal(h.calls.length, 0); assert.equal(h.view.status.textContent, status); assert.equal(h.controller.retryCommand, retry); assert.equal(h.view.retry.hidden, retryHidden);
    unchanged(h, before, reads, 0); clean(h);
});

test('saved-row validation rejects unrendered version, identity, state, text and title changes without I/O', async () => {
    const h = model(); await settle(); const original = structuredClone(h.controller.state), reads = h.backend.reads, before = h.backend.raw();
    const origin = copyButton(h, 'task_0000'), item = row(h, 'task_0000'), title = item.querySelector('.tasks-text');
    for (const mutate of [
        task => { task.version = 'new_version_0000'; }, task => { task.id = 'new_identity_0000'; },
        task => { task.state = 'done'; }, task => { task.text = 'changed but not rendered'; },
        () => { h.controller.state.revision++; }, () => { title.textContent = 'tampered title'; }, () => { item.dataset.taskId = 'other_identity'; }
    ]) {
        h.controller.state = structuredClone(original); title.textContent = original.records[0].text; item.dataset.taskId = original.records[0].id;
        mutate(h.controller.state.records[0]); origin.dispatch('click'); assert.equal(h.calls.length, 0);
    }
    unchanged(h, before, reads, 0); clean(h);
});

for (const unavailable of ['closed-menu', 'closed-section', 'hidden-host', 'inert-workspace', 'hidden-workspace', 'css-hidden', 'detached-host', 'document-hidden', 'departing', 'invalidated-workspace', 'suspended-workspace']) test(`ineligible visible/lifecycle context refuses old button: ${unavailable}`, async () => {
    const h = model(); await settle(); const id = unavailable === 'closed-section' ? 'task_0006' : 'task_0000', origin = copyButton(h, id);
    const before = h.backend.raw(), reads = h.backend.reads;
    if (unavailable === 'closed-menu') row(h, id).querySelector('.tasks-row-menu').open = false;
    if (unavailable === 'closed-section') h.view.completed.box.open = false;
    if (unavailable.startsWith('closed-')) origin.getClientRects = () => [{}];
    if (unavailable === 'hidden-host') h.host.hidden = true;
    if (unavailable === 'inert-workspace') h.workspace.inert = true;
    if (unavailable === 'hidden-workspace') h.workspace.hidden = true;
    if (unavailable === 'css-hidden') h.workspace.style.visibility = 'hidden';
    if (unavailable === 'detached-host') h.host.remove();
    if (unavailable === 'document-hidden') h.document.hidden = true;
    if (unavailable === 'departing') h.window.LocalItabContentLifecycle.departing = true;
    if (unavailable === 'invalidated-workspace') h.backend.workspace.invalidated = true;
    if (unavailable === 'suspended-workspace') h.backend.workspace._suspended = true;
    origin.dispatch('click'); await settle(); assert.equal(h.calls.length, 0); unchanged(h, before, reads, 0); clean(h);
});

for (const interruption of ['filter', 'render', 'editor', 'remove', 'edit', 'hide-return', 'detach-return', 'blur-return', 'visibility-return', 'pagehide', 'departing', 'invalidated-workspace', 'destroy']) test(`late clipboard completion cannot report into new UI or reclaim focus: ${interruption}`, async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    const task = h.controller.state.records[0], origin = copyButton(h, task.id), oldStatus = feedback(h, task.id), reads = h.backend.reads, before = h.backend.raw();
    origin.dispatch('click'); assert.equal(calls.length, 1);
    if (interruption === 'filter') input(h.view.filterInput, 'no matches');
    if (interruption === 'render') h.view.render();
    if (interruption === 'editor') { h.view.edit(task); input(h.document.querySelector('.tasks-editor'), 'unsaved editor draft'); }
    if (interruption === 'remove' || interruption === 'edit') await h.controller.action(interruption, { id: task.id, version: task.version, ...(interruption === 'edit' ? { text: 'new saved text' } : {}) });
    if (interruption === 'hide-return') { h.workspace.hidden = true; h.workspace.hidden = false; h.mutations([{ type: 'attributes', target: h.workspace, attributeName: 'hidden' }]); }
    if (interruption === 'detach-return') { h.host.remove(); h.workspace.append(h.host); h.mutations([{ type: 'childList', target: h.workspace, removedNodes: [h.host] }]); }
    if (interruption === 'blur-return') h.emit('blur');
    if (interruption === 'visibility-return') { h.document.hidden = true; await h.document.listeners.get('visibilitychange')?.(); h.document.hidden = false; }
    if (interruption === 'pagehide') h.emit('pagehide');
    if (interruption === 'departing') h.window.LocalItabContentLifecycle.departing = true;
    if (interruption === 'invalidated-workspace') h.backend.workspace.invalidated = true;
    if (interruption === 'destroy') h.view.destroy();
    const focus = interruption === 'editor' ? h.document.querySelector('.tasks-editor') : h.search; focus.focus();
    const status = h.view.status.textContent, retry = h.controller.retryCommand, undo = h.view.undo;
    wait.resolve(); await settle(); assert.equal(calls.length, 1, 'issued system write may still complete; no retry');
    assert.notEqual(oldStatus.textContent, 'Task text copied.'); assert.equal(h.document.activeElement, focus); assert.equal(h.view.status.textContent, status); assert.equal(h.controller.retryCommand, retry); assert.equal(h.view.undo, undo);
    if (!['remove', 'edit'].includes(interruption)) unchanged(h, before, reads, 0);
    if (interruption === 'editor') assert.equal(focus.value, 'unsaved editor draft'); clean(h);
});

test('late rejection after a new editor is ignored and saved text never includes editor draft', async () => {
    let reject, calls = []; const pending = new Promise((_, fail) => { reject = fail; });
    const h = model({ clipboard: { writeText(text) { calls.push(text); return pending; } } }); await settle(); const task = h.controller.state.records[0];
    const origin = copyButton(h, task.id); origin.dispatch('click'); h.view.edit(task); const editor = h.document.querySelector('.tasks-editor'); input(editor, 'unsaved private draft');
    origin.dispatch('click'); reject(new Error('late failure')); await settle(); assert.deepEqual(calls, [task.text]); assert.equal(h.document.activeElement, editor); assert.equal(editor.value, 'unsaved private draft');
    assert.equal(feedback(h, task.id).textContent, ''); assert.equal(feedback(h, task.id).hidden, true); origin.dispatch('click'); assert.deepEqual(calls, [task.text], 'open editor still rejects copying after the lock settles'); clean(h);
});

for (const locale of ['en', 'zh_CN']) test(`copy labels and independent success/failure feedback are translated: ${locale}`, async () => {
    let fail = false; const h = model({ locale, clipboard: { writeText() { return fail ? Promise.reject(new Error('blocked')) : Promise.resolve(); } } }); await settle();
    const label = locale === 'en' ? 'Copy text' : '复制原文', origin = copyButton(h, 'task_0000', label);
    origin.dispatch('click'); await settle(); assert.equal(feedback(h, 'task_0000').textContent, locale === 'en' ? 'Task text copied.' : '已复制待办原文。');
    fail = true; origin.dispatch('click'); await settle(); assert.equal(feedback(h, 'task_0000').textContent, locale === 'en' ? 'Could not copy. Select the task text to copy it manually.' : '未能复制。可选中待办原文手动复制。'); clean(h);
});

test('queued hide/restore mutations invalidate before clipboard microtask even without observer delivery', async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    const origin = copyButton(h, 'task_0000'); origin.dispatch('click');
    h.workspace.hidden = true; h.workspace.hidden = false;
    h.queueMutations([{ type: 'attributes', target: h.workspace, attributeName: 'hidden' }]);
    wait.resolve(); await settle(); assert.equal(feedback(h, 'task_0000').textContent, ''); assert.equal(calls.length, 1); clean(h);
});

test('unrelated DOM mutations do not cancel a copy or change focus', async () => {
    const wait = deferred(); const h = model({ clipboard: { writeText() { return wait.promise; } } }); await settle();
    const origin = copyButton(h, 'task_0000'); origin.focus(); origin.dispatch('click');
    h.mutations([{ type: 'attributes', target: h.search, attributeName: 'class' }, { type: 'childList', target: h.document.body, removedNodes: [h.document.createElement('aside')] }]);
    wait.resolve(); await settle(); assert.equal(feedback(h, 'task_0000').textContent, 'Task text copied.'); assert.equal(h.document.activeElement, origin); clean(h);
});

test('copy preserves a real completion Undo and refuses a failed save without consuming its exact Retry', async () => {
    const h = model(); await settle(); button(row(h, 'task_0000'), '○').dispatch('click'); await settle();
    const undo = h.view.undo; assert.equal(undo.id, 'task_0000'); assert.equal(h.view.undoButton.hidden, false);
    input(h.view.filterInput, '中文'); input(h.view.input, 'unsaved quick task'); const before = h.backend.raw(), reads = h.backend.reads, writes = h.backend.writes;
    copyButton(h, undo.id).dispatch('click'); await settle(); unchanged(h, before, reads, writes); assert.equal(h.view.undo, undo); assert.equal(h.view.undoButton.hidden, false);
    assert.equal(h.view.input.value, 'unsaved quick task'); assert.equal(h.view.filterQuery, '中文');
    h.backend.fail = true; h.view.add(); await settle(); const retry = h.controller.retryCommand, status = h.view.status.textContent;
    const afterFailure = h.backend.raw(), afterReads = h.backend.reads, afterWrites = h.backend.writes;
    assert.equal(h.view.retry.hidden, false); copyButton(h, undo.id).dispatch('click'); await settle();
    assert.equal(h.calls.length, 1); assert.equal(h.controller.retryCommand, retry); assert.equal(h.view.retry.hidden, false); assert.equal(h.view.status.textContent, status); assert.equal(h.view.undo, undo);
    unchanged(h, afterFailure, afterReads, afterWrites); clean(h);
});

test('opening an import file read invalidates pending copy and keeps the shared lock through cancellation', async () => {
    const clipboard = deferred(), file = deferred(), calls = [];
    const h = model({ clipboard: { writeText(text) { calls.push(text); return clipboard.promise; } } }); await settle();
    const origin = copyButton(h, 'task_0000'); origin.dispatch('click'); h.view.fileInput.files = [{ size: 10, text: () => file.promise }]; const loading = h.view.importFile();
    assert.equal(h.view.pendingReview, true); origin.dispatch('click'); assert.equal(calls.length, 1);
    file.resolve('not a task backup'); await loading; assert.equal(h.view.pendingReview, false); assert(h.view.localError);
    origin.dispatch('click'); assert.equal(calls.length, 1); const status = h.view.status.textContent;
    clipboard.resolve(); await settle(); assert.equal(feedback(h, 'task_0000').textContent, ''); assert.equal(h.view.status.textContent, status); clean(h);
});
