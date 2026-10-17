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
    state.records = Array.from({ length: 11 }, (_, i) => ({
        id: `task_${String(i).padStart(4, '0')}`, version: `version_${String(i).padStart(4, '0')}`,
        text: i === 8 ? '😀'.repeat(1000) : [3, 4].includes(i) ? '  duplicate 中文  ' : `  中文😀 ${i}\r\n<b>literal HTML</b>\n trailing  `,
        state: i < 2 ? 'active' : i < 9 ? 'done' : 'removed', removedFrom: i < 9 ? null : 'done',
        createdAt: '2021-01-02T03:04:05.000Z', updatedAt: '2022-03-04T05:06:07.000Z'
    }));
    state.pinnedId = state.records[1].id; state.receipts = ['historic_operation_0001'];
    state.recovery = [{ id: 'recovery_0001', createdAt: '2023-04-05T06:07:08.000Z', content: { records: structuredClone(state.records.slice(0, 2)), pinnedId: null } }];
    return tasks.validate(state);
}
function model(options = {}) {
    let raw = structuredClone(options.state || initial()), queue = Promise.resolve(); const listeners = new Set(), events = new Map(), observers = new Set();
    const backend = {
        reads: 0, writes: 0, fail: false, failRead: false, skipWrite: false, failAfterWrite: false, delay: null, workspace: { invalidated: false, _suspended: false },
        lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() { backend.reads++; if (backend.failRead) throw new Error('synthetic storage read failure'); return structuredClone(raw); },
        async write(value) { backend.writes++; if (backend.delay) await backend.delay; if (backend.fail) return false; if (backend.skipWrite) return; raw = structuredClone(value); listeners.forEach(fn => fn()); if (backend.failAfterWrite) { backend.failAfterWrite = false; throw new Error('synthetic lost acknowledgement'); } },
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
function unchanged(h, before, reads, writes) { assert.deepEqual(h.backend.raw(), before); assert.equal(h.backend.reads, reads); assert.equal(h.backend.writes, writes); }
function clean(h) { h.view.destroy(); assert.equal(h.observers.size, 0); for (const type of ['blur', 'pagehide']) assert.equal(h.events.get(type)?.size || 0, 0); }

const completedButton = h => h.host.querySelector('.tasks-copy-completed');
const completedFeedback = h => h.host.querySelector('.tasks-completed-copy-status');
const numbered = records => records.map((task, index) => `${index + 1}. ${task.text}`).join('\n');
const completed = state => state.records.filter(task => task.state === 'done');
const expand = h => { h.view.completed.box.open = true; h.view.completed.box.dispatch('toggle'); };

test('completed bulk copy is a native, independent control inside Completed and copies exact displayed originals synchronously', async () => {
    const h = model(); await settle();
    try {
        const origin = completedButton(h), before = h.backend.raw(), reads = h.backend.reads;
        assert(origin); assert(h.view.completed.box.contains(origin)); assert(!h.view.completed.summary.contains(origin));
        assert.equal(origin.tagName, 'BUTTON'); assert.equal(origin.type, 'button'); assert.equal(origin.tabIndex, 0);
        assert.equal(origin.textContent, 'Copy visible completed tasks (7)'); assert.equal(origin.getAttribute('aria-disabled'), 'true');
        origin.dispatch('click'); assert.deepEqual(h.calls, []); assert.equal(completedFeedback(h).hidden, true);
        input(h.view.input, 'unsaved quick-entry draft'); h.view.removed.box.open = true; expand(h); origin.focus(); origin.dispatch('click');
        assert.deepEqual(h.calls, [numbered(completed(before))]); assert.equal(completedFeedback(h).textContent, 'Copying visible completed tasks…');
        assert(h.calls[0].includes('😀'.repeat(1000))); assert(h.calls[0].includes('\r\n<b>literal HTML</b>\n trailing  '));
        assert.equal(completedFeedback(h).getAttribute('role'), 'status'); assert.equal(completedFeedback(h).getAttribute('aria-live'), 'polite');
        assert.equal(h.view.copyVisibleStatus.hidden, true); await settle(); assert.equal(completedFeedback(h).textContent, 'Visible completed tasks copied.');
        assert.equal(h.document.activeElement, origin); assert.equal(h.view.input.value, 'unsaved quick-entry draft'); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

test('completed matches retain stored order, duplicates and exact strings, independently of active expansion', async () => {
    const h = model({ inject: true }); await settle();
    try {
        expand(h); const origin = completedButton(h), before = h.backend.raw(), reads = h.backend.reads;
        input(h.view.filterInput, '  DUPLICATE 中文  '); assert.equal(origin.textContent, 'Copy visible completed tasks (2)'); origin.dispatch('click');
        assert.equal(h.calls.at(-1), '1.   duplicate 中文  \n2.   duplicate 中文  '); await settle();
        input(h.view.filterInput, '<B>LITERAL HTML</B>'); assert.equal(h.view.filterStatus.textContent, 'Matching tasks: 8');
        assert.equal(origin.textContent, 'Copy visible completed tasks (4)'); origin.dispatch('click');
        assert.equal(h.calls.at(-1), numbered(completed(before).filter(task => task.text.includes('<b>')))); await settle();
        h.view.filterClear.dispatch('click'); h.view.more.dispatch('click'); assert.equal(origin.textContent, 'Copy visible completed tasks (7)');
        assert.equal(completedButton(h), origin); origin.dispatch('click'); await settle(); assert.equal(h.calls.at(-1), numbered(completed(before)));
        unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

for (const mode of ['empty', 'active-only', 'removed-only', 'no-match', 'active-only-match', 'removed-only-match']) test(`zero displayed completed tasks stays disabled without a write: ${mode}`, async () => {
    const state = initial();
    if (mode === 'empty') { state.records = []; state.pinnedId = null; }
    if (mode === 'active-only') state.records = state.records.slice(0, 2);
    if (mode === 'removed-only') { state.records = state.records.slice(9); state.pinnedId = null; }
    const h = model({ state }); await settle();
    try {
        if (mode === 'no-match') input(h.view.filterInput, 'no matching task');
        if (mode === 'active-only-match') input(h.view.filterInput, '😀 0');
        if (mode === 'removed-only-match') input(h.view.filterInput, '😀 9');
        expand(h); const before = h.backend.raw(), reads = h.backend.reads, origin = completedButton(h);
        assert.equal(origin.textContent, 'Copy visible completed tasks (0)'); assert.equal(origin.disabled, true);
        assert.equal(origin.getAttribute('aria-disabled'), 'true'); assert.equal(h.view.completed.box.hidden, true);
        origin.dispatch('click'); await settle(); assert.deepEqual(h.calls, []); assert.equal(completedFeedback(h).hidden, true); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

test('fresh completion, editing, removal and reopening change only subsequent snapshots and counts', async () => {
    const h = model(); await settle();
    try {
        expand(h); const origin = completedButton(h);
        for (const [kind, id, values] of [['complete', 'task_0000', {}], ['edit', 'task_0002', { text: '  newly saved\r\n中文 😀  ' }], ['remove', 'task_0003', {}], ['reopen', 'task_0004', {}]]) {
            const task = h.controller.state.records.find(record => record.id === id);
            await h.controller.action(kind, { id, version: task.version, ...values }); await settle();
            const before = h.backend.raw(), reads = h.backend.reads, writes = h.backend.writes;
            assert.equal(origin.textContent, `Copy visible completed tasks (${completed(before).length})`); assert.equal(completedButton(h), origin);
            origin.dispatch('click'); assert.equal(h.calls.at(-1), numbered(completed(before))); await settle(); unchanged(h, before, reads, writes);
        }
    } finally { clean(h); }
});

for (const first of ['completed', 'active', 'single-active', 'single-completed', 'single-removed']) test(`all three copy routes share the same per-view unresolved lock: ${first} starts`, async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    try {
        expand(h); const controls = [completedButton(h), h.view.copyVisibleButton, copyButton(h, 'task_0000'), copyButton(h, 'task_0002'), copyButton(h, 'task_0009')];
        const origin = controls[['completed', 'active', 'single-active', 'single-completed', 'single-removed'].indexOf(first)];
        const before = h.backend.raw(), reads = h.backend.reads; origin.focus(); origin.dispatch('click'); const attempt = h.view.copyAttempt;
        assert.equal(calls.length, 1); for (const control of controls) { assert.equal(control.getAttribute('aria-disabled'), 'true'); control.dispatch('click'); }
        assert.equal(calls.length, 1); assert.equal(h.document.activeElement, origin); h.view.render(); assert.equal(attempt.valid, false);
        assert.equal(h.window.LocalItabTasks.mount(h.host, { controller: h.controller }), h.view, 'supported repeated mount retains the original view and lock');
        for (const control of controls) control.dispatch('click'); assert.equal(calls.length, 1); assert.equal(h.view.copyAttempt, attempt);
        h.search.focus(); wait.resolve(); await settle(); assert.equal(h.view.copyAttempt, null); assert.equal(h.document.activeElement, h.search);
        for (const control of [completedButton(h), h.view.copyVisibleButton, copyButton(h, 'task_0009')]) { control.dispatch('click'); await settle(); }
        assert.equal(calls.length, 4); assert.equal(calls[1], numbered(completed(before))); assert.equal(calls[2], numbered(before.records.slice(0, 2))); assert.equal(calls[3], before.records[9].text);
        unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

test('quick success still suppresses double-click tails and held native activation without removing focus', async () => {
    const h = model(); await settle();
    try {
        expand(h); const origin = completedButton(h), before = h.backend.raw(), reads = h.backend.reads; origin.focus(); origin.dispatch('click', { detail: 1 }); await settle();
        origin.dispatch('click', { detail: 2 }); origin.dispatch('click', { detail: 3 }); assert.equal(h.calls.length, 1);
        for (const key of ['Enter', ' ']) {
            assert.equal(origin.dispatch('keydown', { key, repeat: true }).prevented, true);
            assert.equal(origin.dispatch('keydown', { key, repeat: false }).prevented, false);
        }
        assert.equal(origin.dispatch('keydown', { key: 'Tab', repeat: true }).prevented, false);
        assert.equal(h.document.activeElement, origin); assert.equal(completedButton(h), origin); assert.equal(origin.disabled, false);
        origin.dispatch('click', { detail: 0 }); await settle(); assert.equal(h.calls.length, 2); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

for (const failure of ['missing-api', 'synchronous-throw', 'asynchronous-reject']) test(`completed copy failure is independent, safe and never retries: ${failure}`, async () => {
    let calls = 0; const clipboard = failure === 'missing-api' ? null : { writeText() { calls++; if (failure === 'synchronous-throw') throw Error('private failure'); return Promise.reject(Error('private rejection')); } };
    const h = model({ clipboard }); await settle();
    try {
        button(row(h, 'task_0000'), '○').dispatch('click'); await settle(); const undo = h.view.undo;
        h.view.localError = tasks.fault('FILE'); input(h.view.input, 'independent draft'); expand(h);
        const before = h.backend.raw(), reads = h.backend.reads, writes = h.backend.writes, message = h.view.status.textContent, origin = completedButton(h);
        origin.focus(); origin.dispatch('click'); await settle();
        assert.equal(completedFeedback(h).textContent, 'Could not copy. Select the visible completed task text to copy it manually.'); assert.equal(completedFeedback(h).classList.contains('is-error'), true);
        assert.equal(h.view.status.textContent, message); assert.equal(h.view.localError.code, 'FILE'); assert.equal(h.view.undo, undo); assert.equal(h.view.undoButton.hidden, false);
        assert.equal(h.view.input.value, 'independent draft'); assert.equal(h.document.activeElement, origin); assert.equal(h.view.copyVisibleStatus.hidden, true);
        await settle(); assert.equal(calls, failure === 'missing-api' ? 0 : 1); unchanged(h, before, reads, writes);
    } finally { clean(h); }
});

for (const state of ['no-state', 'pending', 'closed', 'loading', 'saving', 'error', 'READ', 'WRITE', 'VERIFY', 'WORKSPACE_INVALIDATED']) test(`completed copy refuses controller ${state} without replacing Retry`, async () => {
    const h = model(); await settle();
    try {
        expand(h); const origin = completedButton(h), before = h.backend.raw(), reads = h.backend.reads;
        const retry = { kind: 'edit', operationId: 'operation_0001' }; h.controller.retryCommand = retry; h.view.retryEffectOperationId = retry.operationId;
        if (state === 'no-state') h.controller.state = null;
        else if (state === 'pending') h.controller.pending = Promise.resolve();
        else if (state === 'closed') h.controller.closed = true;
        else if (['loading', 'saving', 'error'].includes(state)) h.controller.status = state;
        else { h.controller.error = tasks.fault(state); h.controller.status = 'ready'; }
        h.view.render(); const message = h.view.status.textContent, retryHidden = h.view.retry.hidden;
        assert.equal(origin.getAttribute('aria-disabled'), 'true'); origin.dispatch('click'); await settle(); assert.equal(h.calls.length, 0);
        assert.equal(h.view.status.textContent, message); assert.equal(h.controller.retryCommand, retry); assert.equal(h.view.retry.hidden, retryHidden); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

for (const unavailable of ['closed-section', 'hidden-host', 'inert-workspace', 'hidden-workspace', 'css-hidden', 'detached-host', 'document-hidden', 'visibility-hidden', 'departing', 'invalidated-workspace', 'suspended-workspace', 'editor', 'batch-editor', 'reopen-dialog', 'pending-review']) test(`completed copy refuses unavailable context: ${unavailable}`, async () => {
    const h = model(); await settle();
    try {
        expand(h); const origin = completedButton(h), before = h.backend.raw(), reads = h.backend.reads;
        if (unavailable === 'closed-section') h.view.completed.box.open = false;
        if (unavailable === 'hidden-host') h.host.hidden = true;
        if (unavailable === 'inert-workspace') h.workspace.inert = true;
        if (unavailable === 'hidden-workspace') h.workspace.hidden = true;
        if (unavailable === 'css-hidden') h.workspace.style.visibility = 'hidden';
        if (unavailable === 'detached-host') h.host.remove();
        if (unavailable === 'document-hidden') h.document.hidden = true;
        if (unavailable === 'visibility-hidden') h.document.visibilityState = 'hidden';
        if (unavailable === 'departing') h.window.LocalItabContentLifecycle.departing = true;
        if (unavailable === 'invalidated-workspace') h.backend.workspace.invalidated = true;
        if (unavailable === 'suspended-workspace') h.backend.workspace._suspended = true;
        if (unavailable === 'editor') h.view.edit(h.controller.state.records[2]);
        if (unavailable === 'batch-editor') h.view.batchButton.dispatch('click');
        if (unavailable === 'reopen-dialog') h.view.reopenBatchButton.dispatch('click');
        if (unavailable === 'pending-review') h.view.pendingReview = true;
        origin.dispatch('click'); await settle(); assert.equal(h.calls.length, 0); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

for (const mutation of ['id', 'version', 'text', 'state', 'revision', 'state-order', 'filter', 'title', 'row-id', 'dom-order', 'missing-row', 'extra-row', 'hidden-row', 'hidden-list', 'snapshot']) test(`stale completed snapshot or changed DOM refuses copying: ${mutation}`, async () => {
    const h = model(); await settle();
    try {
        expand(h); const origin = completedButton(h), before = h.backend.raw(), reads = h.backend.reads, task = h.controller.state.records[2], item = row(h, task.id);
        if (mutation === 'id') task.id = 'different_id';
        if (mutation === 'version') task.version = 'different_version';
        if (mutation === 'text') task.text = 'unrendered text';
        if (mutation === 'state') task.state = 'active';
        if (mutation === 'revision') h.controller.state.revision++;
        if (mutation === 'state-order') h.controller.state.records.reverse();
        if (mutation === 'filter') h.view.filterQuery = 'duplicate';
        if (mutation === 'title') item.querySelector('.tasks-text').textContent = 'unrendered title';
        if (mutation === 'row-id') item.dataset.taskId = 'different_id';
        if (mutation === 'dom-order') h.view.completed.list.replaceChildren(...Array.from(h.view.completed.list.children).reverse());
        if (mutation === 'missing-row') item.remove();
        if (mutation === 'extra-row') h.view.completed.list.append(h.document.createElement('li'));
        if (mutation === 'hidden-row') item.hidden = true;
        if (mutation === 'hidden-list') h.view.completed.list.hidden = true;
        if (mutation === 'snapshot') h.view.visibleCompletedTasks = h.view.visibleCompletedTasks.slice(1);
        origin.dispatch('click'); await settle(); assert.equal(h.calls.length, 0); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

for (const outcome of ['resolve', 'reject']) for (const interruption of ['fold', 'fold-reopen', 'fold-reopen-queued', 'filter', 'active-expand', 'render', 'editor', 'reopen-dialog', 'remove', 'edit', 'reopen', 'hide-return', 'detach-return', 'list-detach-return', 'row-hide-return', 'text-change-return', 'blur-return', 'visibility-return', 'pagehide', 'departing', 'invalidated-workspace', 'suspended-workspace', 'replace-workspace', 'destroy']) test(`late completed ${outcome} discards feedback and retains the write lock after ${interruption}`, async () => {
    let resolve, reject; const promise = new Promise((pass, fail) => { resolve = pass; reject = fail; }), calls = [];
    const h = model({ clipboard: { writeText(text) { calls.push(text); return promise; } } }); await settle();
    try {
        expand(h); const task = h.controller.state.records[2], origin = completedButton(h), single = copyButton(h, 'task_0000'), status = completedFeedback(h), before = h.backend.raw(), reads = h.backend.reads;
        origin.dispatch('click'); assert.equal(calls.length, 1);
        if (interruption.startsWith('fold')) {
            h.view.completed.box.open = false; h.view.completed.box.dispatch('toggle');
            if (interruption !== 'fold') expand(h);
            const records = [{ type: 'attributes', target: h.view.completed.box, attributeName: 'open' }];
            if (interruption === 'fold-reopen-queued') h.queueMutations(records); else h.mutations(records);
        }
        if (interruption === 'filter') input(h.view.filterInput, 'duplicate');
        if (interruption === 'active-expand') h.view.more.dispatch('click');
        if (interruption === 'render') h.view.render();
        if (interruption === 'editor') { h.view.edit(task); input(h.document.querySelector('.tasks-editor'), 'new unsaved editor draft'); }
        if (interruption === 'reopen-dialog') { h.view.reopenBatchButton.dispatch('click'); button(h.document.querySelector('.tasks-dialog'), 'Cancel').dispatch('click'); }
        if (['remove', 'edit', 'reopen'].includes(interruption)) await h.controller.action(interruption, { id: task.id, version: task.version, ...(interruption === 'edit' ? { text: 'new saved text' } : {}) });
        if (interruption === 'hide-return') { h.workspace.hidden = true; h.workspace.hidden = false; h.mutations([{ type: 'attributes', target: h.workspace, attributeName: 'hidden' }]); }
        if (interruption === 'detach-return') { h.host.remove(); h.workspace.append(h.host); h.queueMutations([{ type: 'childList', target: h.workspace, removedNodes: [h.host] }]); }
        if (interruption === 'list-detach-return') { h.view.completed.list.remove(); h.view.completed.box.append(h.view.completed.list); h.queueMutations([{ type: 'childList', target: h.view.completed.box, removedNodes: [h.view.completed.list] }]); }
        if (interruption === 'row-hide-return') { const item = row(h, task.id); item.hidden = true; item.hidden = false; h.queueMutations([{ type: 'attributes', target: item, attributeName: 'hidden' }]); }
        if (interruption === 'text-change-return') { const title = row(h, task.id).querySelector('.tasks-text'); title.textContent = 'temporary'; title.textContent = task.text; h.queueMutations([{ type: 'childList', target: title, removedNodes: [] }]); }
        if (interruption === 'blur-return') h.emit('blur');
        if (interruption === 'visibility-return') { h.document.hidden = true; await h.document.listeners.get('visibilitychange')?.(); h.document.hidden = false; }
        if (interruption === 'pagehide') h.emit('pagehide');
        if (interruption === 'departing') h.window.LocalItabContentLifecycle.departing = true;
        if (interruption === 'invalidated-workspace') h.backend.workspace.invalidated = true;
        if (interruption === 'suspended-workspace') h.backend.workspace._suspended = true;
        if (interruption === 'replace-workspace') h.backend.workspace = { invalidated: false, _suspended: false };
        if (interruption === 'destroy') h.view.destroy();
        const focus = interruption === 'editor' ? h.document.querySelector('.tasks-editor') : h.search; focus.focus();
        const message = h.view.status.textContent, retry = h.controller.retryCommand, undo = h.view.undo;
        origin.dispatch('click'); h.view.copyVisibleButton.dispatch('click'); single.dispatch('click'); assert.equal(calls.length, 1);
        assert(h.view.copyAttempt); if (outcome === 'resolve') resolve(); else reject(Error('late private failure')); await settle();
        assert.equal(status.hidden, true); assert.equal(status.textContent, ''); assert.equal(h.view.copyAttempt, null);
        assert.equal(h.document.activeElement, focus); assert.equal(h.view.status.textContent, message); assert.equal(h.controller.retryCommand, retry); assert.equal(h.view.undo, undo);
        if (interruption === 'editor') assert.equal(focus.value, 'new unsaved editor draft');
        if (!['remove', 'edit', 'reopen'].includes(interruption)) unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

test('unrelated mutations and quick-entry composition do not make saved completed sources ineligible', async () => {
    const wait = deferred(); const h = model({ clipboard: { writeText() { return wait.promise; } } }); await settle();
    try {
        input(h.view.input, 'independent draft'); h.view.input.dispatch('compositionstart'); expand(h);
        const before = h.backend.raw(), reads = h.backend.reads, origin = completedButton(h); origin.focus(); origin.dispatch('click'); assert(h.view.copyAttempt);
        h.view.input.value = 'new local draft'; h.mutations([{ type: 'attributes', target: h.search, attributeName: 'class' }, { type: 'childList', target: h.document.body, removedNodes: [h.document.createElement('aside')] }]);
        wait.resolve(); await settle(); assert.equal(completedFeedback(h).textContent, 'Visible completed tasks copied.'); assert.equal(h.document.activeElement, origin);
        assert.equal(h.view.input.value, 'new local draft'); assert.equal(h.view.quickEntryComposing, true); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

for (const failure of ['READ', 'WRITE', 'VERIFY', 'after-write']) test(`real ${failure} retains Save, Retry, Undo and receipts while completed copy settles`, async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    try {
        button(row(h, 'task_0000'), '○').dispatch('click'); await settle(); const undo = h.view.undo; assert.equal(h.view.undoButton.hidden, false);
        input(h.view.input, 'synthetic saved task'); expand(h); completedButton(h).dispatch('click'); assert.equal(calls.length, 1);
        if (failure === 'READ') h.backend.failRead = true;
        if (failure === 'WRITE') h.backend.fail = true;
        if (failure === 'VERIFY') h.backend.skipWrite = true;
        if (failure === 'after-write') h.backend.failAfterWrite = true;
        h.view.add(); await settle(); assert.equal(h.controller.error.code, failure === 'after-write' ? 'WRITE' : failure);
        const retry = h.controller.retryCommand, message = h.view.status.textContent, before = h.backend.raw(), reads = h.backend.reads, writes = h.backend.writes;
        assert.equal(h.view.retry.hidden, false); input(h.view.input, 'newer quick-entry draft'); completedButton(h).dispatch('click'); assert.equal(calls.length, 1);
        wait.resolve(); await settle(); assert.equal(completedFeedback(h).hidden, true); assert.equal(h.view.status.textContent, message); assert.equal(h.controller.retryCommand, retry);
        completedButton(h).dispatch('click'); assert.equal(calls.length, 1); assert.equal(h.view.undo, undo); assert.equal(h.view.undoButton.hidden, false); unchanged(h, before, reads, writes);
        h.backend.failRead = false; h.backend.fail = false; h.backend.skipWrite = false; h.view.retry.dispatch('click'); await settle();
        const saved = h.backend.raw(); assert.equal(saved.receipts.filter(id => id === retry.operationId).length, 1); assert.equal(saved.records.filter(task => task.text === 'synthetic saved task').length, 1);
        assert.equal(h.view.input.value, 'newer quick-entry draft'); assert.equal(h.view.undo, undo); assert.equal(h.controller.retryCommand, null);
        const afterReads = h.backend.reads, afterWrites = h.backend.writes; completedButton(h).dispatch('click'); await settle(); assert.equal(calls.length, 2); unchanged(h, saved, afterReads, afterWrites);
    } finally { clean(h); }
});

test('import read/review invalidate completed feedback without releasing the pending system write', async () => {
    const clipboard = deferred(), file = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return clipboard.promise; } } }); await settle();
    try {
        const source = await h.store.export(); expand(h); const before = h.backend.raw(), reads = h.backend.reads;
        completedButton(h).dispatch('click'); h.view.fileInput.files = [{ size: source.length, text: () => file.promise }]; const loading = h.view.importFile();
        assert.equal(h.view.pendingReview, true); completedButton(h).dispatch('click'); assert.equal(calls.length, 1); file.resolve(source); await loading;
        assert.equal(h.view.dialogs.size, 1); assert.equal(h.backend.reads, reads + 1, 'import review performs its own read'); const reviewReads = h.backend.reads;
        button(h.document.querySelector('.tasks-dialog'), 'Cancel').dispatch('click');
        completedButton(h).dispatch('click'); assert.equal(calls.length, 1); clipboard.resolve(); await settle(); assert.equal(completedFeedback(h).hidden, true);
        completedButton(h).dispatch('click'); await settle(); assert.equal(calls.length, 2); assert.equal(calls[1], numbered(completed(before))); unchanged(h, before, reviewReads, 0);
    } finally { clean(h); }
});

for (const locale of ['en', 'zh_CN', 'fallback']) test(`completed count and independent busy/success/failure use ${locale}`, async () => {
    let fail = false; const wait = deferred(); const h = model({ locale: locale === 'fallback' ? undefined : locale, clipboard: { writeText() { return fail ? Promise.reject(Error('blocked')) : wait.promise; } } }); await settle();
    try {
        expand(h); const zh = locale === 'zh_CN', origin = completedButton(h);
        assert.equal(origin.textContent, zh ? '复制当前显示的已完成待办（7）' : 'Copy visible completed tasks (7)'); origin.dispatch('click');
        assert.equal(completedFeedback(h).textContent, zh ? '正在复制当前显示的已完成待办…' : 'Copying visible completed tasks…');
        wait.resolve(); await settle(); assert.equal(completedFeedback(h).textContent, zh ? '已复制当时显示的已完成待办。' : 'Visible completed tasks copied.');
        fail = true; origin.dispatch('click'); await settle(); assert.equal(completedFeedback(h).textContent, zh ? '未能复制。可选中当前显示的已完成待办原文手动复制。' : 'Could not copy. Select the visible completed task text to copy it manually.');
    } finally { clean(h); }
});

test('settled copy statuses stay independent historical results across filtering and per-row copy', async () => {
    const h = model(); await settle();
    try {
        expand(h); const origin = completedButton(h); origin.focus(); origin.dispatch('click'); await settle();
        h.view.copyVisibleButton.dispatch('click'); await settle(); input(h.view.filterInput, 'duplicate'); copyButton(h, 'task_0003').dispatch('click'); await settle();
        assert.equal(completedFeedback(h).textContent, 'Visible completed tasks copied.'); assert.equal(h.view.copyVisibleStatus.textContent, 'Visible tasks copied.');
        assert.equal(row(h, 'task_0003').querySelector('.tasks-row-copy-status').textContent, 'Task text copied.');
        assert.equal(h.calls.length, 3); assert.equal(h.calls[2], initial().records[3].text); assert.equal(completedButton(h), origin); assert.equal(h.document.activeElement, origin);
    } finally { clean(h); }
});

test('an actual pending save blocks completed copy and preserves the newer draft and exact receipt', async () => {
    const h = model(); await settle(); const wait = deferred();
    try {
        expand(h); input(h.view.input, 'synthetic pending add'); h.backend.delay = wait.promise; h.view.add(); await settle(); assert(h.controller.pending);
        const operation = h.controller.retryCommand.operationId; completedButton(h).dispatch('click'); h.view.copyVisibleButton.dispatch('click'); copyButton(h, 'task_0002').dispatch('click'); assert.equal(h.calls.length, 0);
        input(h.view.input, 'new draft while saving'); wait.resolve(); await settle(); assert.equal(h.controller.pending, null);
        assert.equal(h.backend.raw().receipts.at(-1), operation); assert.equal(h.view.input.value, 'new draft while saving');
        const before = h.backend.raw(), reads = h.backend.reads, writes = h.backend.writes;
        completedButton(h).dispatch('click'); await settle(); assert.equal(h.calls.length, 1); assert.equal(h.calls[0], numbered(completed(before))); unchanged(h, before, reads, writes);
    } finally { wait.resolve(); clean(h); }
});
