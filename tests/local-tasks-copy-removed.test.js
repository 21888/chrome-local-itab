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
        text: i === 8 ? '😀'.repeat(1000) : [3, 4].includes(i) ? '  duplicate 中文  ' : `  中文😀 ${i}\r\n<b>literal HTML</b>\nline\rfinal\u2028\u2029 trailing  `,
        state: i < 2 ? 'active' : i < 9 ? 'removed' : 'done', removedFrom: i >= 2 && i < 9 ? (i % 2 ? 'done' : 'active') : null,
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
    const external = { network: 0, permissions: 0 };
    const window = { fetch() { external.network++; throw Error('unexpected network'); }, chrome: { permissions: { request() { external.permissions++; throw Error('unexpected permission request'); } } }, LocalItabTasks: api, LocalItabContentLifecycle: { departing: false }, navigator: { clipboard },
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
    const context = vm.createContext({ window, document, crypto: webcrypto, setTimeout, URL, Blob, console, fetch: window.fetch });
    for (const file of ['dialog-focus.js', 'local-tasks-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared', file), 'utf8'), context);
    const view = api.mount(host, { controller, ...(options.inject ? { clipboard } : {}) });
    return { backend, store, controller, document, host, workspace, search, view, window, calls, events, observers, external,
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
function clean(h) { assert.deepEqual(h.external, { network: 0, permissions: 0 }); h.view.destroy(); assert.equal(h.observers.size, 0); for (const type of ['blur', 'pagehide']) assert.equal(h.events.get(type)?.size || 0, 0); }

const removedButton = h => h.host.querySelector('.tasks-copy-removed');
const removedFeedback = h => h.host.querySelector('.tasks-removed-copy-status');
const numbered = records => records.map((task, index) => `${index + 1}. ${task.text}`).join('\n');
const removed = state => state.records.filter(task => task.state === 'removed');
const expand = h => { h.view.removed.box.open = true; h.view.removed.box.dispatch('toggle'); };
const expandCompleted = h => { h.view.completed.box.open = true; h.view.completed.box.dispatch('toggle'); };
const move = (node, parent) => { node.remove(); parent.append(node); };
async function action(h, kind, id, extra = {}) {
    const task = h.controller.state.records.find(record => record.id === id);
    await h.controller.action(kind, { id, version: task.version, ...extra }); await settle();
}

test('removed copy is an independent native control inside Removed and synchronously copies exact saved originals', async () => {
    const h = model(); await settle();
    try {
        const origin = removedButton(h), before = h.backend.raw(), reads = h.backend.reads;
        assert(origin); assert(h.view.removed.box.contains(origin)); assert(!h.view.removed.summary.contains(origin));
        assert.equal(origin.tagName, 'BUTTON'); assert.equal(origin.type, 'button'); assert.equal(origin.tabIndex, 0);
        assert.equal(origin.textContent, 'Copy visible removed tasks (7)'); assert.equal(origin.getAttribute('aria-disabled'), 'true');
        origin.dispatch('click'); assert.deepEqual(h.calls, []); assert.equal(removedFeedback(h).hidden, true);
        input(h.view.input, 'unsaved quick-entry draft'); expandCompleted(h); expand(h); origin.focus(); origin.dispatch('click');
        assert.deepEqual(h.calls, [numbered(removed(before))]); assert.equal(removedFeedback(h).textContent, 'Copying visible removed tasks…');
        assert(h.calls[0].includes('😀'.repeat(1000))); assert(h.calls[0].includes('\r\n<b>literal HTML</b>\nline\rfinal\u2028\u2029 trailing  '));
        assert.equal(h.calls[0].endsWith('\n'), false); assert(removed(before).some(task => task.removedFrom === 'active')); assert(removed(before).some(task => task.removedFrom === 'done'));
        for (const excluded of ['task_0002', 'version_0002', '2021-01-02', 'Removed from', 'unsaved quick-entry draft', 'historic_operation', 'recovery_0001']) assert(!h.calls[0].includes(excluded));
        assert.equal(removedFeedback(h).getAttribute('role'), 'status'); assert.equal(removedFeedback(h).getAttribute('aria-live'), 'polite');
        assert.equal(h.view.copyVisibleStatus.hidden, true); assert.equal(h.view.copyCompletedStatus.hidden, true); await settle();
        assert.equal(removedFeedback(h).textContent, 'Visible removed tasks copied.'); assert(h.document.activeElement === origin);
        assert.equal(h.view.input.value, 'unsaved quick-entry draft'); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

test('filtered removed matches keep exact duplicates and full saved order independently of active expansion', async () => {
    const h = model({ inject: true }); await settle();
    try {
        expand(h); const origin = removedButton(h), before = h.backend.raw(), reads = h.backend.reads;
        input(h.view.filterInput, '  DUPLICATE 中文  '); assert.equal(origin.textContent, 'Copy visible removed tasks (2)'); origin.dispatch('click');
        assert.equal(h.calls.at(-1), '1.   duplicate 中文  \n2.   duplicate 中文  '); await settle();
        input(h.view.filterInput, '<B>LITERAL HTML</B>'); assert.equal(h.view.filterStatus.textContent, 'Matching tasks: 8');
        assert.equal(origin.textContent, 'Copy visible removed tasks (4)'); origin.dispatch('click');
        assert.equal(h.calls.at(-1), numbered(removed(before).filter(task => task.text.includes('<b>')))); await settle();
        h.view.filterClear.dispatch('click'); h.view.more.dispatch('click'); assert.equal(origin.textContent, 'Copy visible removed tasks (7)');
        assert(removedButton(h) === origin); origin.dispatch('click'); await settle(); assert.equal(h.calls.at(-1), numbered(removed(before))); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

for (const mode of ['empty', 'active-only', 'completed-only', 'no-match', 'active-only-match', 'completed-only-match']) test(`zero visible removed tasks disables without a write: ${mode}`, async () => {
    const state = initial();
    if (mode === 'empty') { state.records = []; state.pinnedId = null; }
    if (mode === 'active-only') state.records = state.records.slice(0, 2);
    if (mode === 'completed-only') { state.records = state.records.slice(9); state.pinnedId = null; }
    const h = model({ state }); await settle();
    try {
        if (mode === 'no-match') input(h.view.filterInput, 'no matching task');
        if (mode === 'active-only-match') input(h.view.filterInput, '😀 0');
        if (mode === 'completed-only-match') input(h.view.filterInput, '😀 9');
        expand(h); const before = h.backend.raw(), reads = h.backend.reads, origin = removedButton(h);
        assert.equal(origin.textContent, 'Copy visible removed tasks (0)'); assert.equal(origin.disabled, true);
        assert.equal(origin.getAttribute('aria-disabled'), 'true'); assert.equal(h.view.removed.box.hidden, true);
        origin.dispatch('click'); await settle(); assert.deepEqual(h.calls, []); assert.equal(removedFeedback(h).hidden, true); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

test('maximum 500-record collection copies every removed row in saved order without writes or truncation', async () => {
    const state = initial(); state.pinnedId = null;
    state.records = Array.from({ length: 500 }, (_, index) => ({ ...state.records[2], id: `task_${String(index).padStart(4, '0')}`, version: `version_${String(index).padStart(4, '0')}`, text: `  synthetic ${index} 中文😀  `, removedFrom: index % 2 ? 'active' : 'done' }));
    const h = model({ state: tasks.validate(state) }); await settle();
    try {
        expand(h); const before = h.backend.raw(), reads = h.backend.reads;
        assert.equal(removedButton(h).textContent, 'Copy visible removed tasks (500)'); removedButton(h).dispatch('click');
        assert.equal(h.calls[0], numbered(before.records)); assert(h.calls[0].endsWith('500.   synthetic 499 中文😀  ')); await settle(); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

test('actual remove and restore preserve origin states and produce fresh snapshots and counts', async () => {
    const h = model(); await settle();
    try {
        expand(h); const origin = removedButton(h), original = h.backend.raw();
        for (const [kind, id] of [['remove', 'task_0000'], ['remove', 'task_0009'], ['restore', 'task_0002'], ['restore', 'task_0003'], ['remove', 'task_0002'], ['remove', 'task_0003']]) {
            await action(h, kind, id);
            const before = h.backend.raw(), reads = h.backend.reads, writes = h.backend.writes;
            assert.equal(origin.textContent, `Copy visible removed tasks (${removed(before).length})`); assert(removedButton(h) === origin);
            if (kind === 'restore') assert.equal(before.records.find(task => task.id === id).state, original.records.find(task => task.id === id).removedFrom);
            origin.dispatch('click'); assert.equal(h.calls.at(-1), numbered(removed(before))); await settle(); unchanged(h, before, reads, writes);
        }
        assert.notEqual(h.backend.raw().records[2].version, original.records[2].version);
    } finally { clean(h); }
});

for (const first of ['removed', 'completed', 'active', 'single-active', 'single-completed', 'single-removed']) test(`all bulk and per-row routes retain one per-view lock when ${first} starts`, async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    try {
        expand(h); expandCompleted(h); const controls = [removedButton(h), h.view.copyCompletedButton, h.view.copyVisibleButton, copyButton(h, 'task_0000'), copyButton(h, 'task_0009'), copyButton(h, 'task_0002')];
        const origin = controls[['removed', 'completed', 'active', 'single-active', 'single-completed', 'single-removed'].indexOf(first)];
        const before = h.backend.raw(), reads = h.backend.reads; origin.focus(); origin.dispatch('click'); const attempt = h.view.copyAttempt;
        assert.equal(calls.length, 1); for (const control of controls) { assert.equal(control.getAttribute('aria-disabled'), 'true'); control.dispatch('click'); }
        assert.equal(calls.length, 1); assert(h.document.activeElement === origin); h.view.render(); assert.equal(attempt.valid, false);
        assert(h.window.LocalItabTasks.mount(h.host, { controller: h.controller }) === h.view, 'repeat mount reuses the same view');
        for (const control of controls) control.dispatch('click'); assert.equal(calls.length, 1); assert(h.view.copyAttempt === attempt);
        h.search.focus(); wait.resolve(); await settle(); assert.equal(h.view.copyAttempt, null); assert(h.document.activeElement === h.search);
        for (const control of [removedButton(h), h.view.copyCompletedButton, h.view.copyVisibleButton, copyButton(h, 'task_0002')]) { control.dispatch('click'); await settle(); }
        assert.equal(calls.length, 5); assert.equal(calls[1], numbered(removed(before))); assert.equal(calls[2], numbered(before.records.slice(9)));
        assert.equal(calls[3], numbered(before.records.slice(0, 2))); assert.equal(calls[4], before.records[2].text); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

// This dispatcher emulates native default activation only when the key event was not cancelled.
// It does not claim real browser event generation, IME timing or keyboard focus painting.
function nativeKey(node, fields) {
    const key = node.dispatch('keydown', { repeat: false, isComposing: false, keyCode: 0, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; this.prevented = true; }, ...fields });
    if (!key.defaultPrevented && ['Enter', ' '].includes(key.key)) node.dispatch('click', { detail: 0 });
    return key;
}
for (const outcome of ['success', 'failure']) test(`new removed action guards native-shaped keys and double-click tails after fast ${outcome}`, async () => {
    let calls = 0; const h = model({ clipboard: { writeText() { calls++; return outcome === 'success' ? Promise.resolve() : Promise.reject(Error('blocked')); } } }); await settle();
    try {
        expand(h); const origin = removedButton(h), before = h.backend.raw(), reads = h.backend.reads; origin.focus(); origin.dispatch('click', { detail: 1 }); await settle();
        for (const fields of [{ detail: 2 }, { detail: 3 }, { defaultPrevented: true }, { isComposing: true }, { keyCode: 229 }, { repeat: true }]) origin.dispatch('click', fields);
        assert.equal(calls, 1);
        for (const key of ['Enter', ' ']) {
            for (const flags of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }, { defaultPrevented: true }]) {
                assert.equal(nativeKey(origin, { key, ...flags }).defaultPrevented, true); assert.equal(calls, key === 'Enter' ? 1 : 2);
            }
            assert.equal(nativeKey(origin, { key }).defaultPrevented, false); await settle();
        }
        assert.equal(nativeKey(origin, { key: 'Tab', repeat: true }).defaultPrevented, false); assert.equal(calls, 3);
        assert(h.document.activeElement === origin); assert(removedButton(h) === origin); assert.equal(origin.disabled, false); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

for (const failure of ['missing-api', 'synchronous-throw', 'asynchronous-reject']) test(`removed copy ${failure} preserves exact selectable originals and only explicitly retries`, async () => {
    let calls = 0, recover = false; const clipboard = failure === 'missing-api' ? null : { writeText() { calls++; if (recover) return Promise.resolve(); if (failure === 'synchronous-throw') throw Error('private failure'); return Promise.reject(Error('private rejection')); } };
    const h = model({ clipboard }); await settle();
    try {
        button(row(h, 'task_0000'), '○').dispatch('click'); await settle(); const undo = h.view.undo;
        h.view.localError = tasks.fault('FILE'); input(h.view.input, 'independent draft'); expand(h);
        const before = h.backend.raw(), reads = h.backend.reads, writes = h.backend.writes, message = h.view.status.textContent, origin = removedButton(h);
        const titles = h.view.removed.list.children.map(item => item.querySelector('.tasks-text')); origin.focus(); origin.dispatch('click'); await settle();
        assert.equal(removedFeedback(h).textContent, 'Could not copy. Select the visible removed task text to copy it manually.'); assert.equal(removedFeedback(h).classList.contains('is-error'), true);
        assert.deepEqual(titles.map(title => title.textContent), removed(before).map(task => task.text)); assert(titles.every(title => title.isConnected && title.getClientRects().length));
        assert.equal(h.view.status.textContent, message); assert.equal(h.view.localError.code, 'FILE'); assert(h.view.undo === undo); assert.equal(h.view.undoButton.hidden, false);
        assert.equal(h.view.input.value, 'independent draft'); assert(h.document.activeElement === origin); assert.equal(h.view.copyVisibleStatus.hidden, true); assert.equal(h.view.copyCompletedStatus.hidden, true);
        await settle(); assert.equal(calls, failure === 'missing-api' ? 0 : 1); unchanged(h, before, reads, writes);
        recover = true; if (!clipboard) h.view.clipboard = { writeText() { calls++; return Promise.resolve(); } };
        origin.dispatch('click', { detail: 1 }); await settle(); assert.equal(calls, failure === 'missing-api' ? 1 : 2); assert.equal(removedFeedback(h).textContent, 'Visible removed tasks copied.');
        assert.equal(removedFeedback(h).classList.contains('is-error'), false); unchanged(h, before, reads, writes);
    } finally { clean(h); }
});

for (const state of ['no-state', 'pending', 'closed', 'loading', 'saving', 'error', 'READ', 'WRITE', 'VERIFY', 'WORKSPACE_INVALIDATED']) test(`removed copy refuses controller ${state} and leaves Retry alone`, async () => {
    const h = model(); await settle();
    try {
        expand(h); const origin = removedButton(h), before = h.backend.raw(), reads = h.backend.reads;
        const retry = { kind: 'edit', operationId: 'operation_0001' }; h.controller.retryCommand = retry; h.view.retryEffectOperationId = retry.operationId;
        if (state === 'no-state') h.controller.state = null;
        else if (state === 'pending') h.controller.pending = Promise.resolve();
        else if (state === 'closed') h.controller.closed = true;
        else if (['loading', 'saving', 'error'].includes(state)) h.controller.status = state;
        else { h.controller.error = tasks.fault(state); h.controller.status = 'ready'; }
        h.view.render(); const message = h.view.status.textContent, retryHidden = h.view.retry.hidden;
        assert.equal(origin.getAttribute('aria-disabled'), 'true'); origin.dispatch('click'); await settle(); assert.equal(h.calls.length, 0);
        assert.equal(h.view.status.textContent, message); assert(h.controller.retryCommand === retry); assert.equal(h.view.retry.hidden, retryHidden); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

for (const unavailable of ['closed-section', 'hidden-host', 'inert-workspace', 'hidden-workspace', 'css-hidden', 'detached-host', 'document-hidden', 'visibility-hidden', 'departing', 'invalidated-workspace', 'suspended-workspace', 'editor', 'batch-editor', 'reopen-dialog', 'pending-review']) test(`removed copy refuses unavailable ${unavailable}`, async () => {
    const h = model(); await settle();
    try {
        expand(h); const origin = removedButton(h), before = h.backend.raw(), reads = h.backend.reads;
        if (unavailable === 'closed-section') h.view.removed.box.open = false;
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
        if (unavailable === 'reopen-dialog') { expandCompleted(h); h.view.reopenBatchButton.dispatch('click'); }
        if (unavailable === 'pending-review') h.view.pendingReview = true;
        origin.dispatch('click'); await settle(); assert.equal(h.calls.length, 0); assert.equal(removedFeedback(h).hidden, true); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

for (const mutation of ['disabled-origin', 'foreign-box', 'foreign-summary', 'foreign-controls', 'foreign-origin', 'foreign-status', 'foreign-list', 'foreign-row', 'foreign-title', 'id', 'version', 'text', 'state', 'removed-from', 'revision', 'state-order', 'filter', 'title', 'row-id', 'dom-order', 'missing-row', 'extra-row', 'hidden-row', 'hidden-list', 'hidden-title', 'snapshot', 'replacement-row', 'replacement-title', 'reparent-origin', 'reparent-controls', 'reparent-list', 'reparent-section', 'replace-list-property', 'replace-section-property', 'replace-origin-property', 'replace-status-property', 'replace-summary-property']) test(`stale removed data or DOM cannot be copied: ${mutation}`, async () => {
    const h = model(); await settle();
    try {
        expand(h); const origin = removedButton(h), before = h.backend.raw(), reads = h.backend.reads, task = h.controller.state.records[2], item = row(h, task.id), section = h.view.removed;
        if (mutation === 'disabled-origin') origin.disabled = true;
        const foreign = { 'foreign-box': section.box, 'foreign-summary': section.summary, 'foreign-controls': origin.parentElement,
            'foreign-origin': origin, 'foreign-status': h.view.copyRemovedStatus, 'foreign-list': section.list, 'foreign-row': item, 'foreign-title': item.querySelector('.tasks-text') }[mutation];
        if (foreign) foreign.ownerDocument = {};
        if (mutation === 'id') task.id = 'different_id';
        if (mutation === 'version') task.version = 'different_version';
        if (mutation === 'text') task.text = 'unrendered text';
        if (mutation === 'state') task.state = 'active';
        if (mutation === 'removed-from') task.removedFrom = 'done';
        if (mutation === 'revision') h.controller.state.revision++;
        if (mutation === 'state-order') h.controller.state.records.reverse();
        if (mutation === 'filter') h.view.filterQuery = 'duplicate';
        if (mutation === 'title') item.querySelector('.tasks-text').textContent = 'unrendered title';
        if (mutation === 'row-id') item.dataset.taskId = 'different_id';
        if (mutation === 'dom-order') section.list.replaceChildren(...Array.from(section.list.children).reverse());
        if (mutation === 'missing-row') item.remove();
        if (mutation === 'extra-row') section.list.append(h.document.createElement('li'));
        if (mutation === 'hidden-row') item.hidden = true;
        if (mutation === 'hidden-list') section.list.hidden = true;
        if (mutation === 'hidden-title') item.querySelector('.tasks-text').hidden = true;
        if (mutation === 'snapshot') h.view.visibleRemovedTasks = h.view.visibleRemovedTasks.slice(1);
        if (mutation === 'replacement-row') item.replaceWith(h.view.row(task, -1, []));
        if (mutation === 'replacement-title') { const replacement = h.document.createElement('span'); replacement.className = 'tasks-text'; replacement.textContent = task.text; item.querySelector('.tasks-text').replaceWith(replacement); }
        if (mutation === 'reparent-origin') move(origin, h.host);
        if (mutation === 'reparent-controls') move(origin.parentElement, h.host);
        if (mutation === 'reparent-list') move(section.list, h.host);
        if (mutation === 'reparent-section') { const wrapper = h.document.createElement('div'); h.host.append(wrapper); move(section.box, wrapper); }
        if (mutation === 'replace-list-property') { const replacement = h.document.createElement('ul'); for (const child of [...section.list.children]) move(child, replacement); section.list.replaceWith(replacement); section.list = replacement; }
        if (mutation === 'replace-section-property') { const replacement = h.document.createElement('details'); replacement.open = true; for (const child of [...section.box.children]) move(child, replacement); section.box.replaceWith(replacement); section.box = replacement; }
        if (mutation === 'replace-origin-property') { const replacement = h.document.createElement('button'); origin.replaceWith(replacement); h.view.copyRemovedButton = replacement; origin.dispatch('click'); move(origin, h.host); }
        if (mutation === 'replace-status-property') { const replacement = h.document.createElement('p'); h.view.copyRemovedStatus.replaceWith(replacement); h.view.copyRemovedStatus = replacement; }
        if (mutation === 'replace-summary-property') { const replacement = h.document.createElement('summary'); section.summary.replaceWith(replacement); section.summary = replacement; }
        origin.dispatch('click'); await settle(); assert.equal(h.calls.length, 0); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

for (const outcome of ['resolve', 'reject']) for (const interruption of ['fold', 'fold-reopen', 'fold-reopen-queued', 'filter', 'active-expand', 'render', 'editor', 'reopen-dialog', 'restore-active', 'restore-completed', 'restore-re-remove', 'hide-return', 'detach-return', 'section-detach-return', 'controls-detach-return', 'origin-detach-return', 'list-detach-return', 'row-hide-return', 'text-change-return', 'title-replace-return', 'row-replace-return', 'state-replace', 'blur-return', 'visibility-return', 'pagehide', 'departing', 'invalidated-workspace', 'suspended-workspace', 'replace-workspace', 'destroy']) test(`late removed ${outcome} discards feedback but retains lock after ${interruption}`, async () => {
    let resolve, reject; const promise = new Promise((pass, fail) => { resolve = pass; reject = fail; }), calls = [];
    const h = model({ clipboard: { writeText(text) { calls.push(text); return promise; } } }); await settle();
    try {
        expand(h); expandCompleted(h); const task = h.controller.state.records[2], origin = removedButton(h), single = copyButton(h, 'task_0000'), status = removedFeedback(h), before = h.backend.raw(), reads = h.backend.reads;
        origin.dispatch('click'); const attempt = h.view.copyAttempt; assert.equal(calls.length, 1);
        if (interruption.startsWith('fold')) {
            h.view.removed.box.open = false;
            if (interruption !== 'fold-reopen-queued') h.view.removed.box.dispatch('toggle');
            if (interruption !== 'fold') expand(h);
            const records = [{ type: 'attributes', target: h.view.removed.box, attributeName: 'open' }];
            if (interruption === 'fold-reopen-queued') h.queueMutations(records); else h.mutations(records);
        }
        if (interruption === 'filter') input(h.view.filterInput, 'duplicate');
        if (interruption === 'active-expand') h.view.more.dispatch('click');
        if (interruption === 'render') h.view.render();
        if (interruption === 'editor') { h.view.edit(h.controller.state.records[0]); input(h.document.querySelector('.tasks-editor'), 'new unsaved editor draft'); }
        if (interruption === 'reopen-dialog') { h.view.reopenBatchButton.dispatch('click'); button(h.document.querySelector('.tasks-dialog'), 'Cancel').dispatch('click'); }
        if (interruption === 'restore-active' || interruption === 'restore-re-remove') await action(h, 'restore', task.id);
        if (interruption === 'restore-completed') await action(h, 'restore', 'task_0003');
        if (interruption === 'restore-re-remove') { await action(h, 'remove', task.id); assert.equal(h.controller.state.records[2].state, 'removed'); assert.notEqual(h.controller.state.records[2].version, task.version); }
        if (interruption === 'hide-return') { h.workspace.hidden = true; h.workspace.hidden = false; h.mutations([{ type: 'attributes', target: h.workspace, attributeName: 'hidden' }]); }
        const detached = { 'detach-return': h.host, 'section-detach-return': h.view.removed.box, 'controls-detach-return': origin.parentElement, 'origin-detach-return': origin, 'list-detach-return': h.view.removed.list }[interruption];
        if (detached) { const parent = detached.parentElement; move(detached, parent); h.queueMutations([{ type: 'childList', target: parent, removedNodes: [detached] }]); }
        if (interruption === 'row-hide-return') { const item = row(h, task.id); item.hidden = true; item.hidden = false; h.queueMutations([{ type: 'attributes', target: item, attributeName: 'hidden' }]); }
        if (interruption === 'text-change-return') { const title = row(h, task.id).querySelector('.tasks-text'); title.textContent = 'temporary'; title.textContent = task.text; h.queueMutations([{ type: 'childList', target: title, removedNodes: [] }]); }
        if (interruption === 'title-replace-return' || interruption === 'row-replace-return') {
            const old = interruption === 'title-replace-return' ? row(h, task.id).querySelector('.tasks-text') : row(h, task.id), parent = old.parentElement, replacement = h.document.createElement(old.tagName);
            old.replaceWith(replacement); replacement.replaceWith(old); h.queueMutations([{ type: 'childList', target: parent, removedNodes: [old] }]);
        }
        if (interruption === 'state-replace') h.controller.state = structuredClone(h.controller.state);
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
        for (const control of [origin, h.view.copyVisibleButton, h.view.copyCompletedButton, single]) control.dispatch('click'); assert.equal(calls.length, 1);
        assert(h.view.copyAttempt === attempt); if (outcome === 'resolve') resolve(); else reject(Error('late private failure')); await settle();
        assert.equal(status.hidden, true); assert.equal(status.textContent, ''); assert.equal(h.view.copyAttempt, null);
        assert(h.document.activeElement === focus); assert.equal(h.view.status.textContent, message); assert(h.controller.retryCommand === retry); assert(h.view.undo === undo);
        if (interruption === 'editor') assert.equal(focus.value, 'new unsaved editor draft');
        if (!interruption.startsWith('restore')) unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

test('independent draft composition and unrelated DOM changes keep a saved removed snapshot eligible', async () => {
    const wait = deferred(); const h = model({ clipboard: { writeText() { return wait.promise; } } }); await settle();
    try {
        input(h.view.input, 'independent draft'); h.view.input.dispatch('compositionstart'); expand(h);
        const before = h.backend.raw(), reads = h.backend.reads, origin = removedButton(h); origin.focus(); origin.dispatch('click'); assert(h.view.copyAttempt);
        h.view.input.value = 'new local draft'; h.mutations([{ type: 'attributes', target: h.search, attributeName: 'class' }, { type: 'childList', target: h.document.body, removedNodes: [h.document.createElement('aside')] }]);
        wait.resolve(); await settle(); assert.equal(removedFeedback(h).textContent, 'Visible removed tasks copied.'); assert(h.document.activeElement === origin);
        assert.equal(h.view.input.value, 'new local draft'); assert.equal(h.view.quickEntryComposing, true); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

for (const failure of ['READ', 'WRITE', 'VERIFY', 'after-write']) test(`real ${failure} retains Save, Retry, Undo and receipts while removed copy settles`, async () => {
    const wait = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return wait.promise; } } }); await settle();
    try {
        button(row(h, 'task_0000'), '○').dispatch('click'); await settle(); const undo = h.view.undo; assert.equal(h.view.undoButton.hidden, false);
        input(h.view.input, 'synthetic saved task'); expand(h); removedButton(h).dispatch('click'); assert.equal(calls.length, 1);
        if (failure === 'READ') h.backend.failRead = true;
        if (failure === 'WRITE') h.backend.fail = true;
        if (failure === 'VERIFY') h.backend.skipWrite = true;
        if (failure === 'after-write') h.backend.failAfterWrite = true;
        h.view.add(); await settle(); assert.equal(h.controller.error.code, failure === 'after-write' ? 'WRITE' : failure);
        const retry = h.controller.retryCommand, message = h.view.status.textContent, before = h.backend.raw(), reads = h.backend.reads, writes = h.backend.writes;
        assert.equal(h.view.retry.hidden, false); input(h.view.input, 'newer quick-entry draft'); removedButton(h).dispatch('click'); assert.equal(calls.length, 1);
        wait.resolve(); await settle(); assert.equal(removedFeedback(h).hidden, true); assert.equal(h.view.status.textContent, message); assert(h.controller.retryCommand === retry);
        removedButton(h).dispatch('click'); assert.equal(calls.length, 1); assert(h.view.undo === undo); assert.equal(h.view.undoButton.hidden, false); unchanged(h, before, reads, writes);
        h.backend.failRead = false; h.backend.fail = false; h.backend.skipWrite = false; h.view.retry.dispatch('click'); await settle();
        const saved = h.backend.raw(); assert.equal(saved.receipts.filter(id => id === retry.operationId).length, 1); assert.equal(saved.records.filter(task => task.text === 'synthetic saved task').length, 1);
        assert.equal(h.view.input.value, 'newer quick-entry draft'); assert(h.view.undo === undo); assert.equal(h.controller.retryCommand, null);
        const afterReads = h.backend.reads, afterWrites = h.backend.writes; removedButton(h).dispatch('click'); await settle(); assert.equal(calls.length, 2); unchanged(h, saved, afterReads, afterWrites);
    } finally { clean(h); }
});

test('import loading and review discard old removed feedback but retain its issued write lock', async () => {
    const clipboard = deferred(), file = deferred(), calls = []; const h = model({ clipboard: { writeText(text) { calls.push(text); return clipboard.promise; } } }); await settle();
    try {
        const source = await h.store.export(); expand(h); const before = h.backend.raw(), reads = h.backend.reads;
        removedButton(h).dispatch('click'); h.view.fileInput.files = [{ size: source.length, text: () => file.promise }]; const loading = h.view.importFile();
        assert.equal(h.view.pendingReview, true); removedButton(h).dispatch('click'); assert.equal(calls.length, 1); file.resolve(source); await loading;
        assert.equal(h.view.dialogs.size, 1); assert.equal(h.backend.reads, reads + 1); const reviewReads = h.backend.reads;
        button(h.document.querySelector('.tasks-dialog'), 'Cancel').dispatch('click');
        removedButton(h).dispatch('click'); assert.equal(calls.length, 1); clipboard.resolve(); await settle(); assert.equal(removedFeedback(h).hidden, true);
        removedButton(h).dispatch('click'); await settle(); assert.equal(calls.length, 2); assert.equal(calls[1], numbered(removed(before))); unchanged(h, before, reviewReads, 0);
    } finally { clean(h); }
});

for (const locale of ['en', 'zh_CN', 'fallback']) test(`removed count and independent busy/success/failure use ${locale}`, async () => {
    let fail = false; const wait = deferred(); const h = model({ locale: locale === 'fallback' ? undefined : locale, clipboard: { writeText() { return fail ? Promise.reject(Error('blocked')) : wait.promise; } } }); await settle();
    try {
        expand(h); const zh = locale === 'zh_CN', origin = removedButton(h);
        assert.equal(origin.textContent, zh ? '复制可见已移除任务（7）' : 'Copy visible removed tasks (7)'); origin.dispatch('click');
        assert.equal(removedFeedback(h).textContent, zh ? '正在复制可见已移除任务…' : 'Copying visible removed tasks…');
        wait.resolve(); await settle(); assert.equal(removedFeedback(h).textContent, zh ? '已复制当时可见的已移除任务。' : 'Visible removed tasks copied.');
        fail = true; origin.dispatch('click'); await settle(); assert.equal(removedFeedback(h).textContent, zh ? '未能复制。可选中可见已移除任务原文手动复制。' : 'Could not copy. Select the visible removed task text to copy it manually.');
    } finally { clean(h); }
});

test('all bulk statuses stay independent historical results across filtering, per-row copy and drafts', async () => {
    const h = model(); await settle();
    try {
        expand(h); expandCompleted(h); const origin = removedButton(h); origin.focus(); origin.dispatch('click'); await settle();
        h.view.copyCompletedButton.dispatch('click'); await settle(); h.view.copyVisibleButton.dispatch('click'); await settle();
        input(h.view.input, 'separate draft'); input(h.view.filterInput, 'duplicate'); copyButton(h, 'task_0003').dispatch('click'); await settle();
        assert.equal(removedFeedback(h).textContent, 'Visible removed tasks copied.'); assert.equal(h.view.copyCompletedStatus.textContent, 'Visible completed tasks copied.');
        assert.equal(h.view.copyVisibleStatus.textContent, 'Visible tasks copied.'); assert.equal(row(h, 'task_0003').querySelector('.tasks-row-copy-status').textContent, 'Task text copied.');
        assert.equal(h.calls.length, 4); assert.equal(h.calls[3], initial().records[3].text); assert(removedButton(h) === origin); assert(h.document.activeElement === origin);
        assert.equal(h.view.input.value, 'separate draft'); assert.equal(h.view.filterInput.value, 'duplicate');
    } finally { clean(h); }
});

test('an actual pending save blocks removed copy and keeps the newer draft and exactly one receipt', async () => {
    const h = model(); await settle(); const wait = deferred();
    try {
        expand(h); input(h.view.input, 'synthetic pending add'); h.backend.delay = wait.promise; h.view.add(); await settle(); assert(h.controller.pending);
        const operation = h.controller.retryCommand.operationId; removedButton(h).dispatch('click'); h.view.copyVisibleButton.dispatch('click'); copyButton(h, 'task_0002').dispatch('click'); assert.equal(h.calls.length, 0);
        input(h.view.input, 'new draft while saving'); wait.resolve(); await settle(); assert.equal(h.controller.pending, null);
        assert.equal(h.backend.raw().receipts.at(-1), operation); assert.equal(h.view.input.value, 'new draft while saving');
        const before = h.backend.raw(), reads = h.backend.reads, writes = h.backend.writes;
        removedButton(h).dispatch('click'); await settle(); assert.equal(h.calls.length, 1); assert.equal(h.calls[0], numbered(removed(before))); unchanged(h, before, reads, writes);
    } finally { wait.resolve(); clean(h); }
});

for (const suffix of ['\n', '\r', '\r\n']) test(`a saved final ${JSON.stringify(suffix)} remains exact without an added separator`, async () => {
    const state = initial(); state.records[8].text = `  final original${suffix}`;
    const h = model({ state }); await settle();
    try {
        expand(h); const before = h.backend.raw(), reads = h.backend.reads; removedButton(h).dispatch('click');
        assert.equal(h.calls[0], numbered(removed(before))); assert(h.calls[0].endsWith(`7.   final original${suffix}`)); await settle(); unchanged(h, before, reads, 0);
    } finally { clean(h); }
});

test('removing unrelated copy buttons does not borrow their ownership or add a cross-view lock', async () => {
    const h = model(), other = model(); await settle();
    try {
        expand(h); expand(other); h.view.copyVisibleButton.remove(); h.view.copyCompletedButton.remove();
        for (const node of h.host.querySelectorAll('.tasks-copy-text')) node.remove();
        const wait = deferred(); h.view.clipboard = { writeText(text) { h.calls.push(text); return wait.promise; } };
        removedButton(h).dispatch('click'); assert.equal(h.calls.length, 1);
        removedButton(other).dispatch('click'); await settle(); assert.equal(other.calls.length, 1); assert.equal(removedFeedback(other).textContent, 'Visible removed tasks copied.');
        wait.resolve(); await settle(); assert.equal(removedFeedback(h).textContent, 'Visible removed tasks copied.');
    } finally { clean(h); clean(other); }
});
