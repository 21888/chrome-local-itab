const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const tasks = require('../shared/local-tasks-store');
const { Controller } = require('../shared/local-tasks-controller');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { await tick(); await tick(); await tick(); }
function initial() {
    const state = tasks.initial(); state.enabled = true;
    state.records = Array.from({ length: 8 }, (_, i) => ({ id: `task_identity_${i}`, version: `task_version_${i}`,
        text: i < 2 ? '  中文 😀\r\n<b>literal</b>  ' : `task ${i}`, state: i < 6 ? 'active' : i === 6 ? 'done' : 'removed',
        removedFrom: i === 7 ? 'done' : null, createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' }));
    state.pinnedId = state.records[0].id; return state;
}
function model(locale = 'en') {
    let raw = initial(), queue = Promise.resolve(); const listeners = new Set(), events = new Map();
    const backend = { writes: 0, notifications: true, workspace: { invalidated: false, _suspended: false },
        lock(fn) { const next = queue.then(() => { if (backend.workspace.invalidated) throw tasks.fault('WORKSPACE_INVALIDATED'); return fn(); }); queue = next.catch(() => {}); return next; },
        async read() { if (backend.failRead || backend.readOnce) { backend.readOnce = false; throw Error('read'); } return structuredClone(raw); },
        async write(next) { backend.writes++; if (backend.delay) await backend.delay; if (backend.fail) return false; if (backend.drop) return;
            raw = structuredClone(next); if (backend.notifications) listeners.forEach(fn => fn());
            if (backend.failAfter) { backend.failAfter = false; throw Error('ack lost'); }
            if (backend.failVerify) { backend.failVerify = false; backend.readOnce = true; }
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, raw: () => structuredClone(raw)
    };
    const store = new tasks.Store(backend), remote = new tasks.Store(backend), controller = new Controller(store);
    const document = createDocument({ blurUnavailableFocus: true }), host = document.createElement('article'), search = document.createElement('input');
    document.body.append(search, host); search.focus();
    const catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const api = { ...tasks, Controller }, window = { LocalItabTasks: api, i18n: { t: key => catalog[key]?.message || key },
        addEventListener(type, fn) { const set = events.get(type) || new Set(); set.add(fn); events.set(type, set); },
        removeEventListener(type, fn) { events.get(type)?.delete(fn); },
        getComputedStyle(node) { for (let current = node; current; current = current.parentElement) if (current.style.visibility) return { visibility: current.style.visibility }; return { visibility: 'visible' }; } };
    const context = vm.createContext({ window, document, crypto: webcrypto, setTimeout, URL, Blob, console });
    for (const file of ['dialog-focus', 'local-tasks-view', 'local-content-lifecycle']) vm.runInContext(fs.readFileSync(`shared/${file}.js`, 'utf8'), context);
    const view = api.mount(host, { controller }); window.localTasksView = view;
    return { backend, store, remote, controller, document, host, search, view, window, events,
        t: key => catalog[key]?.message || key,
        guarded() { const event = { prevented: false, preventDefault() { this.prevented = true; } }; for (const fn of events.get('beforeunload') || []) fn(event); return event.prevented; } };
}
const modal = h => h.document.querySelector('.tasks-dialog');
const find = (h, className) => modal(h)?.querySelector(`.${className}`);
const click = (h, className, fields = {}) => { const node = find(h, className); assert(node, className); node.dispatch('click', fields); return node; };
const checkboxes = h => modal(h).querySelectorAll('.tasks-complete-checkbox');
const check = (h, index, value = true) => { const node = checkboxes(h)[index]; node.checked = value; node.dispatch('change'); };
const open = h => { h.view.completeBatchButton.focus(); h.view.completeBatchButton.dispatch('click'); };
const prepare = async h => { click(h, 'tasks-complete-review'); await settle(); };
const input = (node, value) => { node.value = value; node.dispatch('input'); };
const command = (store, kind, record, extra = {}) => store.request(kind, { id: record.id, version: record.version, ...extra });

for (const locale of ['en', 'zh_CN']) test(`selection completion ${locale} previews exact visible originals, then saves and undoes one batch`, async () => {
    const h = model(locale); await settle();
    assert(h.view.completeBatchButton, 'mounted explicit selection entry');
    input(h.view.input, 'quick draft'); const before = h.backend.raw(); open(h);
    assert.equal(h.guarded(), true); assert.equal(checkboxes(h).length, 4); assert(checkboxes(h).every(node => !node.checked));
    assert.deepEqual(find(h, 'tasks-complete-selection').querySelectorAll('.tasks-recovery-text').map(node => node.textContent), before.records.slice(0, 4).map(task => task.text));
    click(h, 'tasks-complete-select-all'); check(h, 2, false); check(h, 3, false); await prepare(h);
    assert.equal(h.backend.writes, 0); assert.deepEqual(h.backend.raw(), before);
    assert.deepEqual(find(h, 'tasks-complete-preview').querySelectorAll('li').map(node => node.textContent), before.records.slice(0, 2).map(task => task.text));
    assert.match(find(h, 'tasks-complete-confirm').textContent, /2/);
    click(h, 'tasks-complete-confirm'); await settle();
    assert.equal(h.backend.writes, 1); assert.equal(modal(h), null); assert.equal(h.view.undo.records.length, 2);
    assert.equal(h.view.undoButton.hidden, false); assert.match(h.view.undoButton.textContent, /2/);
    assert.equal(h.backend.raw().pinnedId, null); assert.deepEqual(h.backend.raw().records.slice(2), before.records.slice(2));
    h.view.undoButton.dispatch('click'); await settle(); assert.equal(h.backend.writes, 2);
    assert(h.backend.raw().records.slice(0, 2).every(record => record.state === 'active')); assert.equal(h.backend.raw().pinnedId, null);
    assert.equal(h.view.undo, null); assert.equal(h.view.input.value, 'quick draft'); h.view.destroy();
});

for (const scope of ['collapsed', 'expanded', 'filtered', 'zero']) test(`selection candidates are exactly the displayed active rows (${scope})`, async () => {
    const h = model(); await settle(); h.view.completed.box.open = true; h.view.removed.box.open = true;
    if (scope === 'expanded') h.view.more.dispatch('click');
    if (scope === 'filtered') input(h.view.filterInput, 'task');
    if (scope === 'zero') input(h.view.filterInput, 'no match');
    const expected = h.view.visibleTasks.map(t => t.text), before = h.backend.raw(); open(h);
    if (scope === 'zero') { assert.equal(modal(h), null); assert.equal(h.view.completeBatchButton.getAttribute('aria-disabled'), 'true'); }
    else {
        assert.deepEqual(find(h, 'tasks-complete-selection').querySelectorAll('.tasks-recovery-text').map(node => node.textContent), expected);
        assert.equal(checkboxes(h).length, scope === 'expanded' ? 6 : 4);
        click(h, 'tasks-complete-select-all'); assert(checkboxes(h).every(node => node.checked));
        click(h, 'tasks-complete-clear'); assert(checkboxes(h).every(node => !node.checked));
        assert.equal(find(h, 'tasks-complete-review').disabled, true); await prepare(h);
        assert.equal(find(h, 'tasks-complete-preview').hidden, true);
        click(h, 'tasks-complete-cancel');
    }
    assert.deepEqual(h.backend.raw(), before); assert.equal(h.backend.writes, 0); h.view.destroy();
});

test('an unselected Next up is explicitly preserved; confirmation is one write despite repeated activation', async () => {
    const h = model(); await settle(); open(h); check(h, 2); check(h, 3); await prepare(h);
    assert.equal(find(h, 'tasks-complete-preview').querySelector('p').textContent, h.t('tasksCompleteKeepsPin'));
    const confirm = find(h, 'tasks-complete-confirm'), gate = deferred(); h.backend.delay = gate.promise;
    confirm.focus(); confirm.dispatch('click'); confirm.dispatch('click'); confirm.dispatch('click', { detail: 2 }); await tick();
    assert.equal(confirm.dispatch('keydown', { key: ' ', repeat: true }).prevented, true);
    assert.equal(confirm.dispatch('keydown', { key: 'Enter', repeat: true }).prevented, true);
    assert.equal(h.backend.writes, 1); assert.equal(h.document.activeElement, find(h, 'tasks-complete-cancel')); assert.equal(h.guarded(), true);
    gate.resolve(); await settle(); assert.equal(modal(h), null); assert.equal(h.backend.writes, 1); assert.equal(h.backend.raw().pinnedId, 'task_identity_0');
    assert.equal(h.document.activeElement, h.view.completeBatchButton); h.view.destroy();
});

test('selection changes invalidate the numbered preview and preserve the previous single-task Undo until confirmation', async () => {
    const h = model(); await settle(); const original = h.backend.raw().records[5];
    await h.view.perform(command(h.store, 'complete', original)); const oldUndo = h.view.undo, writes = h.backend.writes;
    open(h); check(h, 0); check(h, 1); await prepare(h); const confirm = find(h, 'tasks-complete-confirm');
    assert.strictEqual(h.view.undo, oldUndo); check(h, 1, false); assert.equal(find(h, 'tasks-complete-preview').hidden, true);
    confirm.dispatch('click'); await settle(); assert.equal(h.backend.writes, writes); assert.strictEqual(h.view.undo, oldUndo);
    await prepare(h); click(h, 'tasks-complete-cancel'); assert.strictEqual(h.view.undo, oldUndo); assert.equal(h.backend.writes, writes);
    open(h); check(h, 0); check(h, 1); await prepare(h); click(h, 'tasks-complete-confirm'); await settle(); assert.equal(h.view.undo.kind, 'completeBatch');
    const remaining = h.backend.raw().records[2]; await h.view.perform(command(h.store, 'remove', remaining));
    assert.equal(h.view.undo.id, remaining.id); assert.equal(h.view.undo.state, 'removed'); h.view.undoButton.dispatch('click'); await settle();
    assert.equal(h.backend.raw().records[2].state, 'active'); assert.equal(h.view.undo, null); h.view.destroy();
});

for (const mode of ['change', 'cancel', 'reopen', 'destroy', 'detach', 'newer-review']) test(`read-only preview callbacks cannot affect a ${mode} owner`, async () => {
    const h = model(); await settle(); open(h); check(h, 0); const gate = deferred(), original = h.store.reviewCompletion.bind(h.store);
    let first = true; h.store.reviewCompletion = async targets => { const review = await original(targets); if (first) { first = false; await gate.promise; } return review; };
    click(h, 'tasks-complete-review'); await tick();
    if (['change', 'newer-review'].includes(mode)) check(h, 1);
    if (mode === 'newer-review') await prepare(h);
    if (['cancel', 'reopen'].includes(mode)) click(h, 'tasks-complete-cancel');
    if (mode === 'reopen') { open(h); check(h, 2); }
    if (mode === 'destroy') h.view.destroy();
    if (mode === 'detach') modal(h).remove();
    const current = modal(h), focus = h.document.activeElement; gate.resolve(); await settle();
    assert.equal(modal(h), current); assert.equal(h.document.activeElement, focus); assert.equal(h.backend.writes, 0);
    if (['change', 'reopen'].includes(mode)) assert.equal(find(h, 'tasks-complete-preview').hidden, true);
    if (mode === 'newer-review') assert.equal(find(h, 'tasks-complete-preview').querySelectorAll('li').length, 2);
    h.view.destroy();
});

test('observed pin changes invalidate the preview, including a delayed review, before any confirmation', async () => {
    const h = model(); await settle(); open(h); check(h, 0); check(h, 1); await prepare(h);
    const confirm = find(h, 'tasks-complete-confirm'), other = h.backend.raw().records[3];
    await h.remote.mutate(command(h.remote, 'pin', other, { expectedPin: 'task_identity_0' })); await settle();
    assert.equal(find(h, 'tasks-complete-preview').hidden, true); confirm.dispatch('click'); await settle(); assert.equal(h.backend.writes, 1);
    const gate = deferred(), original = h.store.reviewCompletion.bind(h.store);
    h.store.reviewCompletion = async targets => { const review = await original(targets); await gate.promise; return review; };
    click(h, 'tasks-complete-review'); await tick(); await h.remote.mutate(command(h.remote, 'pin', other, { expectedPin: other.id }));
    await settle(); gate.resolve(); await settle(); assert.equal(find(h, 'tasks-complete-preview').hidden, true); assert.equal(h.backend.writes, 2);
    assert.equal(h.view.undo, null); h.view.destroy();
});

for (const mode of ['invalidated', 'suspended', 'departing', 'hidden-page', 'hidden-dialog', 'css-hidden-dialog', 'inert-dialog', 'detached-dialog', 'detached-host']) test(`retained review/confirm callbacks cannot start a write after ${mode}`, async () => {
    const h = model(); await settle(); open(h); check(h, 0); check(h, 1); await prepare(h);
    const confirm = find(h, 'tasks-complete-confirm'), review = find(h, 'tasks-complete-review');
    if (mode === 'invalidated') h.backend.workspace.invalidated = true;
    if (mode === 'suspended') h.backend.workspace._suspended = true;
    if (mode === 'departing') h.window.LocalItabContentLifecycle.allowDeparture();
    if (mode === 'hidden-page') h.document.hidden = true;
    if (mode === 'hidden-dialog') modal(h).hidden = true;
    if (mode === 'css-hidden-dialog') modal(h).style.visibility = 'hidden';
    if (mode === 'inert-dialog') modal(h).inert = true;
    if (mode === 'detached-dialog') modal(h).remove();
    if (mode === 'detached-host') h.host.remove();
    confirm.dispatch('click'); review.dispatch('click'); await settle(); assert.equal(h.backend.writes, 0); h.view.destroy();
});

for (const [failure, saved] of [['failRead', false], ['fail', false], ['drop', false], ['failAfter', true], ['failVerify', true]]) test(`uncertain ${failure} retains immutable reviewed identities even after changing selection`, async () => {
    const h = model(); await settle(); open(h); check(h, 0); check(h, 1); await prepare(h); h.backend[failure] = true;
    click(h, 'tasks-complete-confirm'); await settle(); const original = h.controller.retryCommand, writes = h.backend.writes;
    assert.equal(h.view.undo, null); assert.equal(find(h, 'tasks-complete-retry').hidden, false);
    assert.equal(h.backend.raw().records.filter(task => task.state === 'done').length, saved ? 3 : 1);
    check(h, 0, false); check(h, 2); await prepare(h);
    assert.strictEqual(h.controller.retryCommand, original); assert.equal(h.backend.writes, writes);
    assert.deepEqual(find(h, 'tasks-complete-preview').querySelectorAll('li').map(node => node.textContent), initial().records.slice(0, 2).map(task => task.text));
    h.backend[failure] = false; click(h, 'tasks-complete-retry'); await settle();
    assert.equal(h.backend.writes, writes + (saved ? 0 : 1)); assert.equal(h.backend.raw().records[0].state, 'done'); assert.equal(h.backend.raw().records[1].state, 'done'); assert.equal(h.backend.raw().records[2].state, 'active');
    assert(modal(h), 'new selection remains open'); assert.equal(h.view.undo.records.length, 2); assert.equal(h.controller.retryCommand, null);
    h.view.destroy();
});

test('closing an uncertain completion retains card Retry and a late retry cannot dismiss a newer draft', async () => {
    const h = model(); await settle(); open(h); check(h, 0); check(h, 1); await prepare(h); h.backend.failAfter = true;
    click(h, 'tasks-complete-confirm'); await settle(); const command = h.controller.retryCommand, writes = h.backend.writes;
    click(h, 'tasks-complete-cancel'); assert.strictEqual(h.controller.retryCommand, command); assert.equal(h.view.retry.hidden, false);
    h.view.batchButton.dispatch('click'); const draft = h.document.querySelector('.tasks-batch-editor'); input(draft, 'new batch draft'); draft.focus();
    await h.view.retryLast(); await settle(); assert.equal(h.backend.writes, writes); assert.equal(h.document.querySelector('.tasks-batch-editor'), draft);
    assert.equal(draft.value, 'new batch draft'); assert.equal(h.document.activeElement, draft); assert.equal(h.view.undo.records.length, 2); h.view.destroy();
});

test('a sent completion survives Cancel but cannot close a new modal or steal its focus', async () => {
    const h = model(); await settle(); open(h); check(h, 0); check(h, 1); await prepare(h);
    const gate = deferred(); h.backend.delay = gate.promise; click(h, 'tasks-complete-confirm'); await tick();
    click(h, 'tasks-complete-cancel'); assert.equal(h.guarded(), true); h.view.addBatch(); const editor = h.document.querySelector('.tasks-batch-editor'); input(editor, 'new draft'); editor.focus();
    gate.resolve(); await settle(); assert.equal(h.backend.writes, 1); assert.equal(h.document.querySelector('.tasks-batch-editor'), editor);
    assert.equal(h.document.activeElement, editor); assert.equal(editor.value, 'new draft'); assert.equal(h.view.undo.records.length, 2); h.view.destroy();
});

test('a newer action from the final notification owns Undo and Retry instead of the older batch callback', async () => {
    const h = model(); await settle(); open(h); check(h, 0); check(h, 1); await prepare(h);
    let started = false;
    const unsubscribe = h.controller.subscribe(() => {
        if (!started && !h.controller.pending && h.controller.status === 'saved') {
            started = true; h.view.perform(command(h.store, 'remove', h.controller.state.records[2]));
        }
    });
    click(h, 'tasks-complete-confirm'); await settle(); await settle();
    assert.equal(h.backend.writes, 2); assert.equal(h.view.undo.id, 'task_identity_2'); assert.equal(h.view.undo.state, 'removed');
    assert.equal(find(h, 'tasks-complete-preview').hidden, true); assert.equal(h.controller.retryCommand, null); unsubscribe(); h.view.destroy();
});

test('a newer failed action owns the retry callback rather than an older batch success', async () => {
    const h = model(); await settle(); open(h); check(h, 0); check(h, 1); await prepare(h); let started = false;
    const unsubscribe = h.controller.subscribe(() => {
        if (!started && !h.controller.pending && h.controller.status === 'saved') {
            started = true; h.backend.fail = true; h.view.perform(command(h.store, 'remove', h.controller.state.records[2]));
        }
    });
    click(h, 'tasks-complete-confirm'); await settle(); assert.equal(h.view.undo, null); assert.equal(h.controller.retryCommand.kind, 'remove');
    const original = h.controller.retryCommand; h.backend.fail = false; await h.view.retryLast(); await settle();
    assert.equal(h.backend.raw().receipts.at(-1), original.operationId); assert.equal(h.view.undo.id, 'task_identity_2'); unsubscribe(); h.view.destroy();
});

test('a confirmed old result already superseded in controller state cannot create batch Undo', async () => {
    const h = model(); await settle(); open(h); check(h, 0); check(h, 1); await prepare(h);
    const original = h.store.mutate.bind(h.store), gate = deferred(); h.store.mutate = async command => { const state = await original(command); await gate.promise; return state; };
    click(h, 'tasks-complete-confirm'); await tick(); await tick();
    await h.remote.mutate(h.remote.request('enable', { enabled: true })); await settle(); gate.resolve(); await settle();
    assert.equal(h.view.undo, null); assert(modal(h)); assert.equal(find(h, 'tasks-complete-preview').hidden, true); h.view.destroy();
});

test('uncertain completion followed by a later mutation stops retry and keeps the old Undo', async () => {
    const h = model(); await settle(); await h.view.perform(command(h.store, 'complete', h.backend.raw().records[5])); const oldUndo = h.view.undo;
    open(h); check(h, 0); check(h, 1); await prepare(h); h.backend.failAfter = true; click(h, 'tasks-complete-confirm'); await settle();
    await h.remote.mutate(h.remote.request('enable', { enabled: true })); await settle(); const before = h.backend.raw(), writes = h.backend.writes;
    click(h, 'tasks-complete-retry'); await settle(); assert.equal(h.backend.writes, writes); assert.deepEqual(h.backend.raw(), before);
    assert.strictEqual(h.view.undo, oldUndo); assert.equal(find(h, 'tasks-complete-confirm').hidden, true); assert.equal(find(h, 'tasks-complete-retry').hidden, true); h.view.destroy();
});

for (const notifications of [false, true]) test(`whole-batch Undo preserves a newer pin and refuses one changed member (notifications=${notifications})`, async () => {
    const h = model(); await settle(); open(h); check(h, 0); check(h, 1); await prepare(h); click(h, 'tasks-complete-confirm'); await settle();
    const done = h.backend.raw(); await h.remote.mutate(command(h.remote, 'pin', done.records[3], { expectedPin: null })); await settle();
    h.backend.notifications = notifications; await h.remote.mutate(command(h.remote, 'edit', done.records[1], { text: 'changed member' })); await settle();
    const before = h.backend.raw(), writes = h.backend.writes; h.view.undoButton.dispatch('click'); await settle();
    assert.equal(h.backend.writes, writes); assert.deepEqual(h.backend.raw(), before); assert.equal(h.backend.raw().records[0].state, 'done');
    assert.equal(h.backend.raw().pinnedId, done.records[3].id); if (!notifications) assert.equal(h.controller.error.code, 'CONFLICT'); h.view.destroy();
});

test('confirmed batch Undo is all-or-nothing, keeps a later pin and safely retries an uncertain save', async () => {
    const h = model(); await settle(); open(h); check(h, 0); check(h, 1); await prepare(h); click(h, 'tasks-complete-confirm'); await settle();
    const other = h.backend.raw().records[3]; await h.remote.mutate(command(h.remote, 'pin', other, { expectedPin: null })); await settle();
    h.backend.failAfter = true; h.view.undoButton.dispatch('click'); await settle(); const original = h.controller.retryCommand, writes = h.backend.writes;
    assert.equal(original.kind, 'reopenBatch'); assert.equal(h.view.undoButton.hidden, true); assert.equal(h.backend.raw().pinnedId, other.id);
    await h.view.retryLast(); await settle(); assert.equal(h.backend.writes, writes); assert.equal(h.view.undo, null);
    assert(h.backend.raw().records.slice(0, 2).every(task => task.state === 'active')); assert.equal(h.backend.raw().pinnedId, other.id); h.view.destroy();
});

test('remote hide retains an open selection and quick draft, then honors the saved preference without writing it', async () => {
    const h = model(); await settle(); input(h.view.input, 'retained draft'); input(h.view.filterInput, 'task'); h.view.expanded = true;
    open(h); check(h, 0); await h.remote.mutate(h.remote.request('enable', { enabled: false })); await settle();
    assert.equal(h.host.hidden, false); assert.equal(h.backend.raw().enabled, false); assert.equal(h.guarded(), true);
    await prepare(h); click(h, 'tasks-complete-cancel'); assert.equal(h.host.hidden, false);
    assert.equal(h.view.input.value, 'retained draft'); assert.equal(h.view.filterQuery, 'task'); assert.equal(h.view.expanded, true);
    input(h.view.input, ''); assert.equal(h.host.hidden, true); assert.equal(h.backend.writes, 1); h.view.destroy();
});

test('shared modal IME Escape and disabled-control focus routing stay inside this opening', async () => {
    const h = model(); await settle(); open(h); const first = checkboxes(h)[0]; first.focus(); first.dispatch('compositionstart');
    const ime = first.dispatch('keydown', { key: 'Escape' }); assert.equal(ime.prevented, false); assert(modal(h)); first.dispatch('compositionend');
    check(h, 0); await prepare(h); const confirm = find(h, 'tasks-complete-confirm'); confirm.focus();
    await h.remote.mutate(h.remote.request('enable', { enabled: true })); await settle();
    assert.equal(h.document.activeElement, find(h, 'tasks-complete-cancel')); h.document.activeElement.dispatch('keydown', { key: 'Escape' });
    assert.equal(modal(h), null); assert.equal(h.document.activeElement, h.view.completeBatchButton); h.view.destroy();
});

test('an owned uncertain completion stays reachable after remote hide and Cancel, until its original Retry resolves', async () => {
    const h = model(); await settle(); open(h); check(h, 0); check(h, 1);
    await h.remote.mutate(h.remote.request('enable', { enabled: false })); await settle(); await prepare(h);
    h.backend.failAfter = true; click(h, 'tasks-complete-confirm'); await settle(); const original = h.controller.retryCommand, writes = h.backend.writes;
    click(h, 'tasks-complete-cancel'); assert.equal(h.backend.raw().enabled, false); assert.equal(h.host.hidden, false);
    assert.equal(h.view.retry.hidden, false); assert.strictEqual(h.controller.retryCommand, original);
    await h.view.retryLast(); await settle(); assert.equal(h.backend.writes, writes); assert.equal(h.backend.raw().enabled, false);
    assert.equal(h.host.hidden, true); assert.equal(h.view.undo.records.length, 2); h.view.destroy();
});
