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
        reads: 0, writes: 0, fail: false, failAfter: false, failRead: false, failVerify: false, drop: false, notifications: true, delay: null, workspace: { invalidated: false, _suspended: false },
        lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() { backend.reads++; if (backend.failRead || backend.readOnce) { backend.readOnce = false; throw Error('unavailable'); } return structuredClone(raw); },
        async write(value) {
            backend.writes++; if (backend.delay) await backend.delay; if (backend.fail) return false; if (backend.drop) return;
            raw = structuredClone(value); if (backend.notifications) listeners.forEach(fn => fn());
            if (backend.failAfter) { backend.failAfter = false; throw Error('uncertain'); }
            if (backend.failVerify) { backend.failVerify = false; backend.readOnce = true; }
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, raw: () => structuredClone(raw), seed: value => { raw = structuredClone(value); }
    };
    const store = new tasks.Store(backend), controller = new Controller(store), document = createDocument({ blurUnavailableFocus: true });
    // Optional explicit value normalization models the HTML textarea contract only, not Chrome events.
    if (options.normalizeTextarea) {
        const create = document.createElement; document.createElement = tag => {
            const node = create(tag); if (tag === 'textarea') { let value = ''; Object.defineProperty(node, 'value', { get: () => value, set: next => { value = String(next).replace(/\r\n|\r/g, '\n'); } }); } return node;
        };
    }
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
    for (const file of ['dialog-focus.js', 'local-tasks-view.js', 'local-content-lifecycle.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared', file), 'utf8'), context);
    const view = api.mount(host, { controller, ...(options.inject ? { clipboard } : {}) }); window.localTasksView = view;
    const remote = new tasks.Store(backend), requests = [], request = store.request.bind(store);
    store.request = (kind, values) => { const command = request(kind, values); requests.push(command); return command; };
    return { backend, store, remote, requests, controller, document, host, workspace, search, view, window, calls, events, observers,
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
    const result = button(item, label); assert(result, `button ${label} for ${id}`); return result;
}
const focus = (h, node) => { node.focus(); h.document.listeners.get('focusin')?.({ target: h.document.activeElement }); };
const modal = h => h.document.querySelector('.tasks-dialog');
const editor = h => modal(h)?.querySelector('.tasks-editor');
function reuseButton(h, id = 'task_0000') { return copyButton(h, id, 'New task from text'); }
function open(h, id = 'task_0000') { const origin = reuseButton(h, id); focus(h, origin); origin.dispatch('click'); assert(editor(h)); return origin; }
function click(h, label, event = {}) { const node = button(modal(h), label); assert(node, label); node.dispatch('click', event); return node; }
function clean(h) { h.view.destroy(); assert.equal(h.document.listeners.has('focusin'), false); assert.equal(h.document.listeners.has('visibilitychange'), false); for (const type of ['blur', 'pagehide']) assert.equal(h.events.get(type)?.size || 0, 0); }
const feedback = h => modal(h)?.querySelector('.tasks-dialog-feedback').textContent;
function guarded(h) { const event = { prevented: false, preventDefault() { this.prevented = true; } }; for (const fn of h.events.get('beforeunload') || []) fn(event); return event.prevented; }
function preserved(before, after) { assert.deepEqual(after.records.slice(0, before.records.length), before.records); for (const key of ['schemaVersion', 'enabled', 'pinnedId', 'recovery']) assert.deepEqual(after[key], before[key], key); }

test('new task from text opens an independent editable draft and cancels without writes or clipboard', async () => {
    const h = model(); await settle(); const before = h.backend.raw(), reads = h.backend.reads;
    input(h.view.input, 'keep quick-entry draft'); open(h);
    assert.equal(editor(h).value, before.records[0].text);
    assert.equal(editor(h).disabled, undefined); assert.equal(modal(h).getAttribute('role'), 'dialog');
    assert.equal(h.view.hasUncommittedWork(), true);
    input(editor(h), 'new draft only'); click(h, 'Cancel');
    assert.equal(modal(h), null); assert.equal(h.view.input.value, 'keep quick-entry draft');
    assert.deepEqual(h.backend.raw(), before); assert.equal(h.backend.writes, 0); assert.equal(h.backend.reads, reads); assert.deepEqual(h.calls, []); clean(h);
});

for (const id of ['task_0000', 'task_0006', 'task_0008']) test(`explicit Add creates one active task from ${id}, preserving source, order, pin, recovery, Undo and quick-entry`, async () => {
    const h = model(); await settle();
    h.view.undo = { ...h.controller.state.records[8] }; h.view.render(); const undo = h.view.undo;
    input(h.view.input, 'quick draft'); input(h.view.filterInput, 'literal html');
    const before = h.backend.raw(), origin = open(h, id), source = before.records.find(task => task.id === id);
    assert.equal(h.backend.writes, 0); assert.equal(h.requests.length, 0);
    const add = click(h, 'Add'); add.dispatch('click'); add.dispatch('click', { detail: 2 }); await settle();
    const after = h.backend.raw(), created = after.records.at(-1);
    assert.equal(after.records.length, before.records.length + 1); assert.equal(created.text, source.text);
    assert.equal(created.state, 'active'); assert.equal(created.removedFrom, null); assert.notEqual(created.id, source.id); assert.notEqual(created.version, source.version);
    assert.equal(created.id, h.requests[0].operationId); assert.equal(h.requests.length, 1); assert.equal(h.requests[0].kind, 'add');
    assert.equal(after.revision, before.revision + 1); assert.equal(after.receipts.at(-1), h.requests[0].operationId); preserved(before, after);
    assert.equal(h.view.undo, undo); assert.equal(h.view.undoButton.hidden, false); assert.equal(h.view.input.value, 'quick draft'); assert.equal(h.view.filterQuery, 'literal html');
    assert.equal(h.backend.writes, 1); assert.deepEqual(h.calls, []); assert.equal(modal(h), null); assert.equal(origin.isConnected, false);
    assert.equal(h.document.activeElement, row(h, id).querySelector('.tasks-reuse-text')); clean(h);
});

for (const edit of [false, true]) test(`line breaks stay one task; native-value normalization contract, edited=${edit}`, async () => {
    const state = initial(); state.records[0].text = '  \r\n中文😀\r<b>literal</b>\nend  ';
    const h = model({ state, normalizeTextarea: true }); await settle(); open(h);
    assert.equal(editor(h).value, state.records[0].text.replace(/\r\n|\r/g, '\n'));
    if (edit) input(editor(h), `${editor(h).value}\r\nedited`);
    const expected = edit ? editor(h).value : state.records[0].text; click(h, 'Add'); await settle();
    assert.equal(h.backend.raw().records.at(-1).text, expected); assert.equal(h.backend.raw().records.length, state.records.length + 1); preserved(state, h.backend.raw()); clean(h);
});

test('source changes after opening never overwrite the independent draft or add a source-version conflict', async () => {
    const h = model(); await settle(); open(h); const source = editor(h).value;
    const original = h.backend.raw().records[0];
    await h.remote.mutate(h.remote.request('edit', { id: original.id, version: original.version, text: 'changed elsewhere' })); await settle();
    assert.equal(editor(h).value, source); const before = h.backend.raw(); click(h, 'Add'); await settle();
    assert.equal(h.backend.raw().records.at(-1).text, source); preserved(before, h.backend.raw()); assert.equal(modal(h), null); clean(h);
});

test('opening, cancelling and lifecycle saveDrafts never add either draft; modal defers reload/departure', async () => {
    const h = model(); await settle(); input(h.view.input, 'quick draft'); open(h); input(editor(h), 'dialog draft');
    assert.equal(guarded(h), true); assert.equal(h.window.LocalItabContentLifecycle.hasUncommittedWork(), true);
    assert.equal(await h.window.LocalItabContentLifecycle.saveDrafts(), false); assert.equal(h.backend.writes, 0); assert.equal(h.requests.length, 0);
    click(h, 'Cancel'); assert.equal(h.view.input.value, 'quick draft'); assert.equal(h.backend.writes, 0);
    input(h.view.input, ''); assert.equal(guarded(h), false); clean(h);
});

for (const reason of ['pending', 'closed', 'error', 'loading', 'saving', 'local-error', 'dialog', 'review', 'departing', 'invalidated', 'suspended']) test(`unavailable new-draft entry refuses ${reason}`, async () => {
    const h = model(); await settle(); const origin = reuseButton(h), before = h.backend.raw(), reads = h.backend.reads;
    if (reason === 'pending') h.controller.pending = Promise.resolve();
    if (reason === 'closed') h.controller.closed = true;
    if (reason === 'error') h.controller.error = tasks.fault('WRITE');
    if (['loading', 'saving'].includes(reason)) h.controller.status = reason;
    if (reason === 'local-error') h.view.localError = tasks.fault('FILE');
    if (reason === 'dialog') h.view.addBatch();
    if (reason === 'review') h.view.pendingReview = true;
    if (reason === 'departing') h.window.LocalItabContentLifecycle.allowDeparture();
    if (reason === 'invalidated') h.backend.workspace.invalidated = true;
    if (reason === 'suspended') h.backend.workspace._suspended = true;
    h.view.render(); origin.dispatch('click'); await settle();
    assert.equal(h.document.querySelector('.tasks-reuse-editor'), null); assert.equal(h.backend.writes, 0); assert.deepEqual(h.backend.raw(), before); assert.equal(h.backend.reads, reads); clean(h);
});

test('entry rejects stale, hidden, detached and closed-details rows, even if layout boxes are reported', async () => {
    const h = model(); await settle(); const baseline = structuredClone(h.controller.state), reads = h.backend.reads;
    const origin = reuseButton(h), item = row(h, 'task_0000'), title = item.querySelector('.tasks-text'), menu = item.querySelector('.tasks-row-menu');
    const validRects = origin.getClientRects.bind(origin); origin.getClientRects = () => [{}];
    for (const change of [
        () => { h.controller.state.records[0].version = 'different_version'; }, () => { h.controller.state.records[0].text = 'new text'; },
        () => { h.controller.state.records[0].state = 'done'; }, () => { h.controller.state.revision++; }, () => { title.textContent = 'different title'; },
        () => { item.dataset.taskId = 'different_id'; }, () => { item.hidden = true; }, () => { h.workspace.inert = true; },
        () => { menu.open = false; }, () => { h.document.hidden = true; }, () => { origin.style.visibility = 'hidden'; }
    ]) {
        h.controller.state = structuredClone(baseline); title.textContent = baseline.records[0].text; item.dataset.taskId = baseline.records[0].id;
        item.hidden = h.workspace.inert = h.document.hidden = false; menu.open = true; origin.style.visibility = '';
        change(); origin.dispatch('click'); assert.equal(modal(h), null);
    }
    h.controller.state = structuredClone(baseline); h.document.hidden = false; origin.style.visibility = ''; origin.getClientRects = validRects;
    item.remove(); origin.dispatch('click'); assert.equal(modal(h), null); assert.equal(h.backend.reads, reads); assert.equal(h.backend.writes, 0); clean(h);
});

for (const failure of ['write', 'uncertain', 'read-back', 'verify', 'read-before']) test(`${failure} keeps exact old add retry across newer draft, without duplicate original or automatic current add`, async () => {
    const h = model(); await settle(); open(h); const oldText = editor(h).value, before = h.backend.raw();
    const gate = deferred(); h.backend.delay = gate.promise;
    if (failure === 'write') h.backend.fail = true;
    if (failure === 'uncertain') h.backend.failAfter = true;
    if (failure === 'read-back') h.backend.failVerify = true;
    if (failure === 'verify') h.backend.drop = true;
    if (failure === 'read-before') h.backend.failRead = true;
    const add = click(h, 'Add'); input(editor(h), 'new current draft'); add.dispatch('click'); gate.resolve(); await settle();
    const command = h.controller.retryCommand; assert(command); assert.equal(command.text, oldText); assert.equal(command.kind, 'add');
    assert.equal(button(modal(h), 'Add').disabled, true); assert.equal(button(modal(h), 'Retry previous add').hidden, false);
    assert.equal(modal(h).querySelector('.tasks-reuse-previous').hidden, false); assert.equal(modal(h).querySelector('.tasks-latest').textContent, oldText);
    assert.equal(h.view.retry.hidden, true); const writes = h.backend.writes; click(h, 'Add'); await settle(); assert.equal(h.backend.writes, writes);
    input(editor(h), 'even newer draft'); assert.equal(h.controller.retryCommand, command); assert.equal(command.text, oldText);
    h.backend.delay = null; h.backend.fail = h.backend.failRead = h.backend.drop = false;
    const retry = click(h, 'Retry previous add'); retry.dispatch('click'); retry.dispatch('click', { detail: 2 }); await settle();
    assert.equal(h.backend.raw().records.length, before.records.length + 1); assert.equal(h.backend.raw().records.at(-1).text, oldText);
    assert.equal(editor(h).value, 'even newer draft'); assert.equal(h.requests.length, 1); assert.equal(h.controller.retryCommand, null); assert.match(feedback(h), /current draft is still here/);
    assert.equal(button(modal(h), 'Retry previous add').hidden, true); assert.equal(button(modal(h), 'Add').disabled, false);
    click(h, 'Add'); await settle(); assert.equal(h.requests.length, 2); assert.equal(h.backend.raw().records.at(-1).text, 'even newer draft'); assert.equal(h.backend.raw().records.length, before.records.length + 2); clean(h);
});

for (const change of ['new-text', 'ABA', 'composition-only']) test(`late successful add cannot close a newer ${change} draft`, async () => {
    const h = model(); await settle(); open(h); const text = editor(h).value, gate = deferred(); h.backend.delay = gate.promise;
    const add = button(modal(h), 'Add'); focus(h, add); add.dispatch('click'); assert.equal(h.document.activeElement, editor(h));
    if (change === 'new-text') input(editor(h), 'new draft');
    if (change === 'ABA') { input(editor(h), 'temporary draft'); input(editor(h), text); }
    if (change === 'composition-only') editor(h).dispatch('compositionstart');
    gate.resolve(); await settle(); assert(editor(h)); assert.equal(h.backend.raw().records.at(-1).text, text); assert.match(feedback(h), /current draft is still here/);
    assert.equal(editor(h).value, change === 'new-text' ? 'new draft' : text); assert.equal(guarded(h), true); clean(h);
});

test('an unchanged failed draft retry confirms its original receipt and closes once', async () => {
    const h = model(); await settle(); open(h); h.backend.failAfter = true; click(h, 'Add'); await settle();
    const command = h.controller.retryCommand, saved = h.backend.raw(); click(h, 'Retry previous add'); await settle();
    assert.equal(modal(h), null); assert.deepEqual(h.backend.raw(), saved); assert.equal(h.backend.writes, 1); assert.equal(saved.receipts.at(-1), command.operationId); clean(h);
});

test('later confirmed operation makes an old uncertain retry conflict, retains the draft, and never automatically re-adds', async () => {
    const h = model(); await settle(); open(h); h.backend.failAfter = true; click(h, 'Add'); await settle();
    const command = h.controller.retryCommand; input(editor(h), 'new draft after uncertain save');
    await h.remote.mutate(h.remote.request('add', { text: 'later confirmed task' })); await settle(); const before = h.backend.raw(), writes = h.backend.writes;
    click(h, 'Retry previous add'); await settle(); assert.deepEqual(h.backend.raw(), before); assert.equal(h.backend.writes, writes);
    assert.equal(editor(h).value, 'new draft after uncertain save'); assert.match(feedback(h), /changed in another page/); assert.equal(h.controller.retryCommand, null);
    assert.equal(button(modal(h), 'Retry previous add').hidden, true); assert.equal(h.requests.length, 1);
    click(h, 'Add'); await settle(); assert.equal(h.backend.raw().records.at(-1).text, 'new draft after uncertain save'); assert.notEqual(h.requests[1].operationId, command.operationId); clean(h);
});

test('final controller notification followed by a later mutation cannot close the original draft', async () => {
    const h = model(); await settle(); open(h); let later;
    const unsubscribe = h.controller.subscribe(() => {
        if (!later && h.controller.status === 'saved') later = h.controller.run(h.store.request('add', { text: 'subsequent task' }));
    });
    click(h, 'Add'); await settle(); unsubscribe(); await later; await settle();
    assert(editor(h)); assert.match(feedback(h), /current draft is still here/); assert.equal(h.backend.raw().records.length, initial().records.length + 2); clean(h);
});

for (const state of ['invalidated', '_suspended', 'different-workspace', 'closed', 'departing']) test(`open draft stays guarded and refuses Add after workspace/lifecycle retirement: ${state}`, async () => {
    const h = model(); await settle(); open(h); const before = h.backend.raw(), reads = h.backend.reads;
    if (['invalidated', '_suspended'].includes(state)) h.backend.workspace[state] = true;
    if (state === 'different-workspace') h.backend.workspace = { invalidated: false, _suspended: false };
    if (state === 'closed') h.controller.closed = true;
    if (state === 'departing') h.window.LocalItabContentLifecycle.allowDeparture();
    click(h, 'Add'); await settle(); assert(editor(h)); assert.equal(h.view.hasUncommittedWork(), true); assert.equal(h.backend.writes, 0); assert.equal(h.backend.reads, reads); assert.deepEqual(h.backend.raw(), before); clean(h);
});

test('remote hide keeps open editor and pending add visible; closing does not cancel its already issued write', async () => {
    const h = model(); await settle(); open(h);
    await h.remote.mutate(h.remote.request('enable', { enabled: false })); await settle(); assert.equal(h.host.hidden, false);
    const gate = deferred(); h.backend.delay = gate.promise; click(h, 'Add'); await tick(); click(h, 'Cancel');
    assert.equal(modal(h), null); assert.equal(h.host.hidden, false); assert.equal(guarded(h), true);
    gate.resolve(); await settle(); assert.equal(h.backend.raw().enabled, false); assert.equal(h.backend.raw().records.length, initial().records.length + 1); assert.equal(h.host.hidden, true); assert.equal(guarded(h), false); clean(h);
});

for (const failure of [false, true]) test(`closed pending dialog late ${failure ? 'failure' : 'success'} leaves newer modal and external focus untouched`, async () => {
    const h = model(); await settle(); open(h); const gate = deferred(); h.backend.delay = gate.promise; h.backend.fail = failure;
    click(h, 'Add'); await tick(); click(h, 'Cancel');
    h.view.addBatch(); const newEditor = h.document.querySelector('.tasks-batch-editor'); input(newEditor, 'new independent modal');
    const outside = h.document.createElement('input'); h.document.body.append(outside); focus(h, outside);
    gate.resolve(); await settle(); assert.equal(h.document.activeElement, outside); assert.equal(h.document.querySelector('.tasks-batch-editor'), newEditor);
    assert.equal(newEditor.value, 'new independent modal'); assert.equal(h.controller.retryCommand, null); clean(h);
});

for (const route of ['current-row', 'filtered-away', 'closed-menu', 'outside', 'outside-removed', 'window-blur']) test(`focus return is owned and resolves current source row: ${route}`, async () => {
    const h = model(); await settle(); open(h); const gate = deferred(); h.backend.delay = gate.promise; click(h, 'Add'); let outside;
    if (route === 'filtered-away') input(h.view.filterInput, 'nothing matches');
    if (route === 'closed-menu') row(h, 'task_0000').querySelector('.tasks-row-menu').open = false;
    if (route.startsWith('outside')) { outside = h.document.createElement('input'); h.document.body.append(outside); focus(h, outside); if (route === 'outside-removed') outside.remove(); }
    if (route === 'window-blur') h.emit('blur');
    gate.resolve(); await settle(); assert.equal(modal(h), null);
    const expected = route === 'current-row' ? row(h, 'task_0000').querySelector('.tasks-reuse-text') : ['filtered-away', 'closed-menu'].includes(route) ? h.view.input : route === 'outside' ? outside : h.document.body;
    assert.equal(h.document.activeElement, expected); clean(h);
});

test('IME Enter/Escape, repeated keys and blur without compositionend protect drafts without trapping later activation', async () => {
    const h = model(); await settle(); open(h); const area = editor(h), add = button(modal(h), 'Add');
    area.dispatch('compositionstart'); area.dispatch('keydown', { key: 'Enter', keyCode: 229 });
    const escape = area.dispatch('keydown', { key: 'Escape' }); assert.equal(escape.stopped, true); assert(editor(h));
    click(h, 'Add'); assert.equal(h.backend.writes, 0);
    assert.equal(add.dispatch('keydown', { key: 'Enter', isComposing: true }).prevented, true);
    assert.equal(add.dispatch('keydown', { key: ' ', repeat: true }).prevented, true);
    const cancel = button(modal(h), 'Cancel'); focus(h, cancel); area.dispatch('focusout'); click(h, 'Add'); assert.equal(h.backend.writes, 0);
    await new Promise(resolve => setTimeout(resolve, 5)); assert.equal(add.disabled, false);
    focus(h, area); const normal = area.dispatch('keydown', { key: 'Enter' }); assert.equal(normal.prevented, false); assert.equal(h.backend.writes, 0);
    assert.equal(area.dispatch('keydown', { key: 'Enter', repeat: true }).prevented, true);
    cancel.dispatch('keydown', { key: 'Escape' }); assert.equal(modal(h), null); assert.equal(h.backend.writes, 0); clean(h);
});

test('IME composition after a failed command does not abandon the original retry or replace its text', async () => {
    const h = model(); await settle(); open(h); h.backend.fail = true; click(h, 'Add'); await settle(); const command = h.controller.retryCommand;
    editor(h).dispatch('compositionstart'); click(h, 'Retry previous add'); assert.equal(h.controller.retryCommand, command);
    editor(h).dispatch('compositionend'); h.backend.fail = false; click(h, 'Retry previous add'); await settle();
    assert(editor(h)); assert.equal(h.backend.raw().records.at(-1).text, command.text); assert.equal(h.requests.length, 1); clean(h);
});

for (const limit of ['records', 'text', 'empty', 'bytes']) test(`${limit} capacity refusal preserves current draft and every source record without truncation`, async () => {
    const state = initial();
    if (limit === 'records') state.records = Array.from({ length: 500 }, (_, i) => ({ ...state.records[0], id: `capacity_task_${i}`, version: `capacity_version_${i}` }));
    if (limit === 'records') { state.records[0].id = 'task_0000'; state.pinnedId = null; }
    if (limit === 'bytes') {
        state.recovery = [{ id: 'large_synthetic_copy', createdAt: '2023-04-05T06:07:08.000Z', content: { records: [], pinnedId: null } }];
        const records = state.recovery[0].content.records, budget = tasks.LIMITS.bytes - 4096;
        while (Buffer.byteLength(JSON.stringify(state)) < budget - 1000) {
            const i = records.length, record = { ...state.records[0], id: `copy_task_${i}`, version: `copy_version_${i}`, text: 'x' };
            records.push(record); const remaining = budget - Buffer.byteLength(JSON.stringify(state)) - 500;
            record.text = '😀'.repeat(Math.min(1000, Math.max(1, Math.floor(remaining / 4))));
        }
    }
    const h = model({ state: tasks.validate(state) }); await settle(); const before = h.backend.raw(); open(h);
    const value = limit === 'text' ? '😀'.repeat(1001) : limit === 'empty' ? ' \n ' : limit === 'bytes' ? '😀'.repeat(1000) : 'cannot fit';
    input(editor(h), value); const add = button(modal(h), 'Add'); focus(h, add); add.dispatch('click'); await settle();
    assert.equal(editor(h).value, value); assert.equal(h.backend.writes, 0); assert.deepEqual(h.backend.raw(), before);
    assert.equal(h.controller.retryCommand, null); assert.equal(button(modal(h), 'Retry previous add').hidden, true); assert.equal(h.document.activeElement, editor(h));
    assert.match(feedback(h), limit === 'records' ? /500/ : limit === 'bytes' ? /too large/ : /1,000/); clean(h);
});

test('a saved 1,000 Unicode character task is reusable without truncation', async () => {
    const h = model(); await settle(); h.view.more.dispatch('click'); open(h, 'task_0005'); click(h, 'Add'); await settle();
    assert.equal(h.backend.raw().records.at(-1).text, '😀'.repeat(1000)); assert.equal(modal(h), null); clean(h);
});

for (const locale of ['en', 'zh_CN', 'fallback']) test(`localized entry, dialog and retry are complete with ${locale} fallback`, async () => {
    const h = model({ locale: locale === 'fallback' ? undefined : locale }); await settle(); const zh = locale === 'zh_CN', entry = zh ? '用原文新建' : 'New task from text';
    const origin = copyButton(h, 'task_0000', entry); origin.focus(); origin.dispatch('click'); assert(editor(h));
    assert.equal(editor(h).getAttribute('aria-label'), entry); assert(editor(h).getAttribute('aria-describedby'));
    assert.equal(modal(h).getAttribute('aria-modal'), 'true'); assert.match(modal(h).querySelector('.tasks-help').textContent, zh ? /独立草稿/ : /independent draft/);
    h.backend.fail = true; click(h, zh ? '添加' : 'Add'); await settle();
    assert.equal(button(modal(h), zh ? '重试上次添加' : 'Retry previous add').hidden, false);
    assert.match(feedback(h), zh ? /上次添加结果尚未确认/ : /previous add could not be confirmed/);
    clean(h);
});

test('closing an unsubmitted draft never dismisses an unrelated read error', async () => {
    const h = model(); await settle(); open(h); h.controller.error = tasks.fault('READ'); h.controller.status = 'error'; h.controller.emit();
    click(h, 'Cancel'); assert.equal(h.controller.error.code, 'READ'); assert.equal(h.view.retry.hidden, false); assert.equal(h.backend.writes, 0); clean(h);
});
