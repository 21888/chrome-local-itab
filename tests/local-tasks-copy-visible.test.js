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

const visibleButton = h => h.host.querySelector('.tasks-copy-visible');
const visibleFeedback = h => h.host.querySelector('.tasks-visible-copy-status');
const numbered = records => records.map((task, index) => `${index + 1}. ${task.text}`).join('\n');

test('visible task copy uses the real mounted button and the collapsed active rows only', async () => {
    const h = model(); await settle();
    try {
        const origin = visibleButton(h); assert(origin, 'visible task copy button is mounted beside the active list');
        assert.equal(origin.textContent, 'Copy visible tasks (4)'); assert.equal(origin.tagName, 'BUTTON');
        assert.equal(origin.type, 'button'); assert.equal(origin.tabIndex, 0); assert.equal(origin.disabled, false);
        const before = h.backend.raw(), reads = h.backend.reads;
        h.view.completed.box.open = true; h.view.removed.box.open = true;
        origin.focus(); origin.dispatch('click');
        assert.deepEqual(h.calls, [numbered(before.records.slice(0, 4))], 'synchronous clipboard entry uses only four active rows, without a duplicate Next up');
        assert.equal(visibleFeedback(h).textContent, 'Copying visible tasks…');
        await settle(); assert.equal(visibleFeedback(h).textContent, 'Visible tasks copied.');
        assert.equal(visibleFeedback(h).getAttribute('role'), 'status'); assert.equal(visibleFeedback(h).getAttribute('aria-live'), 'polite');
        assert.equal(h.document.activeElement, origin); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

test('expanded, filtered and cleared ranges follow active DOM order and preserve every saved string', async () => {
    const h = model({ inject: true }); await settle(); const before = h.backend.raw(), reads = h.backend.reads;
    try {
        input(h.view.input, 'unsaved quick-entry draft'); h.view.more.dispatch('click');
        assert.equal(visibleButton(h).textContent, 'Copy visible tasks (6)');
        visibleButton(h).dispatch('click'); assert.equal(h.calls.at(-1), numbered(before.records.slice(0, 6))); await settle();
        assert(h.calls.at(-1).includes('😀'.repeat(1000))); assert(h.calls.at(-1).includes('\r\n<b>literal HTML</b>\n trailing  '));
        input(h.view.filterInput, '  DUPLICATE 中文  ');
        assert.equal(visibleButton(h).textContent, 'Copy visible tasks (2)'); visibleButton(h).dispatch('click');
        assert.equal(h.calls.at(-1), '1.   duplicate 中文  \n2.   duplicate 中文  '); await settle();
        input(h.view.filterInput, '<B>LITERAL HTML</B>');
        assert.equal(h.view.filterStatus.textContent, 'Matching tasks: 6'); assert.equal(visibleButton(h).textContent, 'Copy visible tasks (3)');
        h.view.completed.box.open = true; h.view.removed.box.open = true; visibleButton(h).dispatch('click');
        assert.equal(h.calls.at(-1), numbered([before.records[0], before.records[3], before.records[4]])); await settle();
        h.view.filterClear.dispatch('click'); assert.equal(visibleButton(h).textContent, 'Copy visible tasks (6)');
        h.view.more.dispatch('click'); assert.equal(visibleButton(h).textContent, 'Copy visible tasks (4)');
        visibleButton(h).dispatch('click'); assert.equal(h.calls.at(-1), numbered(before.records.slice(0, 4))); await settle();
        assert.equal(h.view.input.value, 'unsaved quick-entry draft'); assert.equal(h.view.expanded, false); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

test('filter shows all matching active rows even when the prior list was collapsed', async () => {
    const state = initial(); state.records.forEach(task => { task.text = `matching ${Array.from(task.text).slice(0, 990).join('')}`; });
    const h = model({ state }); await settle();
    try {
        input(h.view.filterInput, 'matching'); assert.equal(h.view.expanded, false); assert.equal(h.view.more.hidden, true);
        assert.equal(visibleButton(h).textContent, 'Copy visible tasks (6)'); visibleButton(h).dispatch('click');
        assert.equal(h.calls[0], numbered(state.records.slice(0, 6))); await settle();
        h.view.filterClear.dispatch('click'); assert.equal(visibleButton(h).textContent, 'Copy visible tasks (4)');
    } finally { clean(h); }
});

for (const mode of ['empty', 'archived-only', 'no-match', 'done-only-match', 'removed-only-match']) test(`zero active rows disables visible copy: ${mode}`, async () => {
    const state = initial();
    if (mode === 'empty') { state.records = []; state.pinnedId = null; }
    if (mode === 'archived-only') { state.records = state.records.slice(6); state.pinnedId = null; }
    const h = model({ state }); await settle();
    try {
        if (mode === 'no-match') input(h.view.filterInput, 'definitely no match');
        if (mode === 'done-only-match') input(h.view.filterInput, '😀 6');
        if (mode === 'removed-only-match') input(h.view.filterInput, '😀 8');
        h.view.completed.box.open = true; h.view.removed.box.open = true;
        const before = h.backend.raw(), reads = h.backend.reads, origin = visibleButton(h);
        assert.equal(origin.textContent, 'Copy visible tasks (0)'); assert.equal(origin.disabled, true); assert.equal(origin.getAttribute('aria-disabled'), 'true');
        origin.dispatch('click'); await settle(); assert.deepEqual(h.calls, []); assert.equal(visibleFeedback(h).hidden, true); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

test('Next up outside the active preview is not copied and moving a row first changes only the subsequent copied order', async () => {
    const state = initial(); state.pinnedId = 'task_0005'; const h = model({ state }); await settle();
    try {
        visibleButton(h).dispatch('click'); await settle(); assert.equal(h.calls[0], numbered(state.records.slice(0, 4)));
        const item = row(h, 'task_0003'); item.querySelector('.tasks-row-menu').open = true;
        button(item, 'Move to list start').dispatch('click'); await settle();
        const before = h.backend.raw(), reads = h.backend.reads, writes = h.backend.writes;
        visibleButton(h).dispatch('click'); await settle(); assert.equal(h.calls.at(-1), numbered([state.records[3], ...state.records.slice(0, 3)]));
        assert.equal(before.pinnedId, 'task_0005'); assert.equal(h.view.nextTask.id, 'task_0005'); unchanged(h, before, reads, writes);
    } finally { clean(h); }
});

for (const firstKind of ['visible', 'single']) test(`one shared unresolved lock across repeated clicks, redraws and both copy actions: ${firstKind} starts`, async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    try {
        const single = copyButton(h, 'task_0000'), bulk = visibleButton(h), origin = firstKind === 'visible' ? bulk : single;
        const before = h.backend.raw(), reads = h.backend.reads;
        origin.focus(); origin.dispatch('click'); assert.equal(calls.length, 1);
        const attempt = h.view.copyAttempt; assert.equal(bulk.getAttribute('aria-disabled'), 'true'); assert.equal(single.getAttribute('aria-disabled'), 'true');
        bulk.dispatch('click', { detail: 2 }); bulk.dispatch('click'); single.dispatch('click'); assert.equal(calls.length, 1); assert.equal(h.document.activeElement, origin);
        h.view.more.dispatch('click'); const replacement = copyButton(h, 'task_0000');
        assert.equal(h.view.copyAttempt, attempt); assert.equal(attempt.valid, false);
        bulk.dispatch('click'); replacement.dispatch('click'); assert.equal(calls.length, 1, 'invalidation cannot cancel an issued system write or release the lock');
        h.search.focus(); wait.resolve(); await settle();
        assert.equal(h.view.copyAttempt, null); assert.equal(bulk.getAttribute('aria-disabled'), 'false'); assert.equal(replacement.getAttribute('aria-disabled'), 'false');
        assert.equal(h.document.activeElement, h.search); bulk.dispatch('click'); await settle(); assert.equal(calls.length, 2); assert.equal(calls[1], numbered(before.records.slice(0, 6)));
        replacement.dispatch('click'); await settle(); assert.equal(calls.length, 3); assert.equal(calls[2], before.records[0].text); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

for (const failure of ['missing-api', 'synchronous-throw', 'asynchronous-reject']) test(`bulk clipboard failure is local, content-free and never retries: ${failure}`, async () => {
    let calls = 0; const clipboard = failure === 'missing-api' ? null : { writeText() { calls++; if (failure === 'synchronous-throw') throw new Error('private clipboard error'); return Promise.reject(new Error('private clipboard rejection')); } };
    const h = model({ clipboard }); await settle();
    try {
        input(h.view.input, 'unsaved quick-entry draft'); h.view.localError = tasks.fault('FILE'); h.view.undo = { ...h.controller.state.records[8] }; h.view.render();
        const before = h.backend.raw(), reads = h.backend.reads, message = h.view.status.textContent, undo = h.view.undo, origin = visibleButton(h);
        origin.focus(); origin.dispatch('click'); await settle();
        assert.equal(visibleFeedback(h).textContent, 'Could not copy. Select the visible task text to copy it manually.'); assert.equal(visibleFeedback(h).classList.contains('is-error'), true);
        assert.equal(h.view.status.textContent, message); assert.equal(h.view.localError.code, 'FILE'); assert.equal(h.view.undo, undo); assert.equal(h.view.undoButton.hidden, false);
        assert.equal(h.view.input.value, 'unsaved quick-entry draft'); assert.equal(h.document.activeElement, origin);
        await settle(); assert.equal(calls, failure === 'missing-api' ? 0 : 1); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

for (const state of ['no-state', 'pending', 'closed', 'loading', 'saving', 'error', 'READ', 'WRITE', 'VERIFY', 'WORKSPACE_INVALIDATED']) test(`controller gate refuses the real bulk button synchronously: ${state}`, async () => {
    const h = model(); await settle();
    try {
        const origin = visibleButton(h), before = h.backend.raw(), reads = h.backend.reads;
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

for (const unavailable of ['hidden-host', 'inert-workspace', 'hidden-workspace', 'css-hidden', 'detached-host', 'document-hidden', 'visibility-hidden', 'departing', 'invalidated-workspace', 'suspended-workspace', 'editor', 'batch-editor', 'pending-review']) test(`visible copy refuses unavailable context: ${unavailable}`, async () => {
    const h = model(); await settle();
    try {
        const origin = visibleButton(h), before = h.backend.raw(), reads = h.backend.reads;
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
        if (unavailable === 'editor') h.view.edit(h.controller.state.records[0]);
        if (unavailable === 'batch-editor') h.view.batchButton.dispatch('click');
        if (unavailable === 'pending-review') h.view.pendingReview = true;
        origin.dispatch('click'); await settle(); assert.equal(h.calls.length, 0); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

for (const mutation of ['id', 'version', 'text', 'state', 'revision', 'state-order', 'filter', 'expand', 'title', 'row-id', 'dom-order', 'missing-row', 'extra-row', 'hidden-row', 'hidden-list']) test(`unrendered or changed current rows refuse bulk copy without I/O: ${mutation}`, async () => {
    const h = model(); await settle();
    try {
        const origin = visibleButton(h), before = h.backend.raw(), reads = h.backend.reads, task = h.controller.state.records[0], item = row(h, task.id);
        if (mutation === 'id') task.id = 'different_id';
        if (mutation === 'version') task.version = 'different_version';
        if (mutation === 'text') task.text = 'unrendered text';
        if (mutation === 'state') task.state = 'done';
        if (mutation === 'revision') h.controller.state.revision++;
        if (mutation === 'state-order') h.controller.state.records.reverse();
        if (mutation === 'filter') h.view.filterQuery = 'duplicate';
        if (mutation === 'expand') h.view.expanded = true;
        if (mutation === 'title') item.querySelector('.tasks-text').textContent = 'unrendered title';
        if (mutation === 'row-id') item.dataset.taskId = 'different_id';
        if (mutation === 'dom-order') h.view.list.replaceChildren(...Array.from(h.view.list.children).reverse());
        if (mutation === 'missing-row') item.remove();
        if (mutation === 'extra-row') h.view.list.append(h.document.createElement('li'));
        if (mutation === 'hidden-row') item.hidden = true;
        if (mutation === 'hidden-list') h.view.list.hidden = true;
        origin.dispatch('click'); await settle(); assert.equal(h.calls.length, 0); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

for (const outcome of ['resolve', 'reject']) for (const interruption of ['filter', 'expand', 'render', 'editor', 'remove', 'edit', 'hide-return', 'detach-return', 'list-detach-return', 'row-hide-return', 'text-change-return', 'blur-return', 'visibility-return', 'pagehide', 'departing', 'invalidated-workspace', 'suspended-workspace', 'replace-workspace', 'destroy']) test(`late ${outcome} drops bulk feedback and keeps focus after ${interruption}`, async () => {
    let resolve, reject; const promise = new Promise((pass, fail) => { resolve = pass; reject = fail; }), calls = [];
    const h = model({ clipboard: { writeText(text) { calls.push(text); return promise; } } }); await settle();
    try {
        const task = h.controller.state.records[0], origin = visibleButton(h), oldStatus = visibleFeedback(h), before = h.backend.raw(), reads = h.backend.reads;
        origin.dispatch('click'); assert.equal(calls.length, 1);
        if (interruption === 'filter') input(h.view.filterInput, 'no matches');
        if (interruption === 'expand') h.view.more.dispatch('click');
        if (interruption === 'render') h.view.render();
        if (interruption === 'editor') { h.view.edit(task); input(h.document.querySelector('.tasks-editor'), 'new unsaved editor draft'); }
        if (interruption === 'remove' || interruption === 'edit') await h.controller.action(interruption, { id: task.id, version: task.version, ...(interruption === 'edit' ? { text: 'new saved text' } : {}) });
        if (interruption === 'hide-return') { h.workspace.hidden = true; h.workspace.hidden = false; h.mutations([{ type: 'attributes', target: h.workspace, attributeName: 'hidden' }]); }
        if (interruption === 'detach-return') { h.host.remove(); h.workspace.append(h.host); h.queueMutations([{ type: 'childList', target: h.workspace, removedNodes: [h.host] }]); }
        if (interruption === 'list-detach-return') { h.view.list.remove(); h.host.append(h.view.list); h.queueMutations([{ type: 'childList', target: h.host, removedNodes: [h.view.list] }]); }
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
        origin.dispatch('click'); assert.equal(calls.length, 1, 'lock remains before settlement');
        if (outcome === 'resolve') resolve(); else reject(new Error('late private failure')); await settle();
        assert.equal(oldStatus.hidden, true); assert.equal(oldStatus.textContent, ''); assert.equal(h.view.copyAttempt, null);
        assert.equal(h.document.activeElement, focus); assert.equal(h.view.status.textContent, message); assert.equal(h.controller.retryCommand, retry); assert.equal(h.view.undo, undo);
        if (interruption === 'editor') assert.equal(focus.value, 'new unsaved editor draft');
        if (!['remove', 'edit'].includes(interruption)) unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

test('unrelated DOM changes and an independent quick-entry value leave bulk copy scope unchanged', async () => {
    const wait = deferred(); const h = model({ clipboard: { writeText() { return wait.promise; } } }); await settle();
    try {
        const origin = visibleButton(h); origin.focus(); origin.dispatch('click'); h.view.input.value = 'new local draft';
        h.mutations([{ type: 'attributes', target: h.search, attributeName: 'class' }, { type: 'childList', target: h.document.body, removedNodes: [h.document.createElement('aside')] }]);
        wait.resolve(); await settle(); assert.equal(visibleFeedback(h).textContent, 'Visible tasks copied.'); assert.equal(h.document.activeElement, origin); assert.equal(h.view.input.value, 'new local draft');
    } finally { clean(h); }
});

for (const failure of ['READ', 'WRITE', 'VERIFY', 'after-write']) test(`real storage ${failure} and the exact Retry/receipt survive pending bulk copy`, async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    try {
        button(row(h, 'task_0000'), '○').dispatch('click'); await settle();
        const undo = h.view.undo; assert.equal(undo.id, 'task_0000'); assert.equal(h.view.undoButton.hidden, false);
        input(h.view.input, 'synthetic saved task'); input(h.view.filterInput, '中文'); visibleButton(h).dispatch('click'); assert.equal(calls.length, 1);
        if (failure === 'READ') h.backend.failRead = true;
        if (failure === 'WRITE') h.backend.fail = true;
        if (failure === 'VERIFY') h.backend.skipWrite = true;
        if (failure === 'after-write') h.backend.failAfterWrite = true;
        h.view.add(); await settle(); assert.equal(h.controller.error.code, failure === 'after-write' ? 'WRITE' : failure);
        const retry = h.controller.retryCommand, message = h.view.status.textContent, before = h.backend.raw(), reads = h.backend.reads, writes = h.backend.writes;
        assert.equal(h.view.retry.hidden, false); input(h.view.input, 'newer quick-entry draft');
        visibleButton(h).dispatch('click'); copyButton(h, 'task_0001').dispatch('click'); assert.equal(calls.length, 1);
        wait.resolve(); await settle(); assert.equal(visibleFeedback(h).hidden, true); assert.equal(h.view.status.textContent, message); assert.equal(h.controller.retryCommand, retry);
        visibleButton(h).dispatch('click'); assert.equal(calls.length, 1, 'save error still blocks after copy lock settles');
        assert.equal(h.view.undo, undo); assert.equal(h.view.undoButton.hidden, false); assert.equal(h.view.input.value, 'newer quick-entry draft'); unchanged(h, before, reads, writes);
        h.backend.failRead = false; h.backend.fail = false; h.backend.skipWrite = false; h.view.retry.dispatch('click'); await settle();
        const saved = h.backend.raw(); assert.equal(saved.receipts.filter(id => id === retry.operationId).length, 1); assert.equal(saved.records.filter(task => task.text === 'synthetic saved task').length, 1);
        assert.equal(h.view.input.value, 'newer quick-entry draft'); assert.equal(h.view.undo, undo); assert.equal(h.controller.retryCommand, null);
        const afterReads = h.backend.reads, afterWrites = h.backend.writes; visibleButton(h).dispatch('click'); await settle(); assert.equal(calls.length, 2); unchanged(h, saved, afterReads, afterWrites);
    } finally { clean(h); }
});

test('initial backend read failure exposes Retry but no bulk clipboard request', async () => {
    const h = model(); h.backend.failRead = true; await settle();
    try {
        // Trigger the real read failure after mount in case its first synchronous read already completed.
        h.controller.state = null; await h.controller.refresh().catch(() => {}); assert.equal(h.controller.error.code, 'READ');
        const reads = h.backend.reads; visibleButton(h).dispatch('click'); await settle(); assert.equal(h.calls.length, 0); assert.equal(h.backend.reads, reads); assert.equal(h.backend.writes, 0); assert.equal(h.view.retry.hidden, false);
    } finally { clean(h); }
});

test('import file reading invalidates bulk copy without releasing its issued write lock', async () => {
    const clipboard = deferred(), file = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return clipboard.promise; } } }); await settle();
    try {
        const before = h.backend.raw(), reads = h.backend.reads; visibleButton(h).dispatch('click');
        h.view.fileInput.files = [{ size: 10, text: () => file.promise }]; const loading = h.view.importFile();
        assert.equal(h.view.pendingReview, true); visibleButton(h).dispatch('click'); assert.equal(calls.length, 1);
        file.resolve('not a task backup'); await loading; assert.equal(h.view.pendingReview, false); assert(h.view.localError);
        visibleButton(h).dispatch('click'); assert.equal(calls.length, 1); const message = h.view.status.textContent;
        clipboard.resolve(); await settle(); assert.equal(visibleFeedback(h).hidden, true); assert.equal(h.view.status.textContent, message); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

for (const locale of ['en', 'zh_CN', 'fallback']) test(`count, busy, success and safe failure use the selected catalog: ${locale}`, async () => {
    let fail = false; const wait = deferred(); const h = model({ locale: locale === 'fallback' ? undefined : locale, clipboard: { writeText() { return fail ? Promise.reject(new Error('blocked')) : wait.promise; } } }); await settle();
    try {
        const zh = locale === 'zh_CN', origin = visibleButton(h);
        assert.equal(origin.textContent, zh ? '复制当前显示的待办（4）' : 'Copy visible tasks (4)'); origin.dispatch('click');
        assert.equal(visibleFeedback(h).textContent, zh ? '正在复制当前显示的待办…' : 'Copying visible tasks…');
        wait.resolve(); await settle(); assert.equal(visibleFeedback(h).textContent, zh ? '已复制当时显示的待办。' : 'Visible tasks copied.');
        fail = true; origin.dispatch('click'); await settle(); assert.equal(visibleFeedback(h).textContent, zh ? '未能复制。可选中当前显示的待办原文手动复制。' : 'Could not copy. Select the visible task text to copy it manually.');
    } finally { clean(h); }
});

test('completed copy status remains a historical result after a later filter and single-row copy', async () => {
    const h = model(); await settle();
    try {
        visibleButton(h).dispatch('click'); await settle(); assert.equal(visibleFeedback(h).textContent, 'Visible tasks copied.');
        input(h.view.filterInput, 'duplicate'); copyButton(h, 'task_0001').dispatch('click'); await settle();
        assert.equal(visibleFeedback(h).textContent, 'Visible tasks copied.'); assert.equal(h.calls.length, 2); assert.equal(h.calls[1], initial().records[1].text);
    } finally { clean(h); }
});

test('a real pending save blocks new bulk requests and preserves its newer draft and confirmed receipt', async () => {
    const h = model(); await settle(); const wait = deferred();
    try {
        input(h.view.input, 'synthetic pending add'); h.backend.delay = wait.promise; h.view.add(); await settle(); assert(h.controller.pending);
        const operation = h.controller.retryCommand.operationId; visibleButton(h).dispatch('click'); copyButton(h, 'task_0001').dispatch('click'); assert.equal(h.calls.length, 0);
        input(h.view.input, 'new draft while saving'); wait.resolve(); await settle(); assert.equal(h.controller.pending, null);
        assert.equal(h.backend.raw().receipts.at(-1), operation); assert.equal(h.view.input.value, 'new draft while saving');
        const before = h.backend.raw(), reads = h.backend.reads, writes = h.backend.writes;
        visibleButton(h).dispatch('click'); await settle(); assert.equal(h.calls.length, 1); unchanged(h, before, reads, writes);
    } finally { wait.resolve(); clean(h); }
});

test('reusing saved text cancels bulk feedback, keeps the system-write lock, and preserves both drafts', async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    try {
        input(h.view.input, 'independent quick-entry draft'); const before = h.backend.raw(), reads = h.backend.reads;
        visibleButton(h).dispatch('click'); copyButton(h, 'task_0001'); button(row(h, 'task_0001'), 'New task from text').dispatch('click');
        const editor = h.document.querySelector('.tasks-reuse-editor'); assert(editor); input(editor, 'independent reuse draft');
        visibleButton(h).dispatch('click'); assert.equal(calls.length, 1); wait.resolve(); await settle();
        assert.equal(visibleFeedback(h).hidden, true); assert.equal(editor.value, 'independent reuse draft'); assert.equal(h.view.input.value, 'independent quick-entry draft');
        assert.equal(h.document.activeElement, editor); visibleButton(h).dispatch('click'); assert.equal(calls.length, 1, 'open reuse editor remains ineligible'); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

test('a valid import review blocks bulk copy until cancel, without copying its incoming tasks', async () => {
    const h = model(); await settle();
    try {
        const source = await h.store.export(); h.view.fileInput.files = [{ size: source.length, text: async () => source }]; await h.view.importFile();
        assert.equal(h.view.dialogs.size, 1); assert.equal(h.view.pendingReview, false);
        const before = h.backend.raw(), reads = h.backend.reads; visibleButton(h).dispatch('click'); await settle(); assert.equal(h.calls.length, 0); unchanged(h, before, reads, 0);
        button(h.document.querySelector('.tasks-dialog'), 'Cancel').dispatch('click'); visibleButton(h).dispatch('click'); await settle();
        assert.equal(h.calls.length, 1); assert.equal(h.calls[0], numbered(before.records.slice(0, 4))); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});
