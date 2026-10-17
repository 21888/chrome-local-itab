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
        text: i < 2 ? '  中文 😀\r\n<b>literal</b>  ' : `task ${i}`, state: i < 6 ? 'done' : i === 6 ? 'active' : 'removed',
        removedFrom: i === 7 ? 'done' : null, createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' }));
    state.pinnedId = state.records[6].id; return state;
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
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, raw: () => structuredClone(raw), seed: value => { raw = structuredClone(value); }
    };
    const store = new tasks.Store(backend), remote = new tasks.Store(backend), controller = new Controller(store);
    const document = createDocument({ blurUnavailableFocus: true }), host = document.createElement('article'), search = document.createElement('input');
    document.body.append(search, host); search.focus();
    const catalog = JSON.parse(fs.readFileSync(`_locales/${locale === 'fallback' ? 'en' : locale}/messages.json`, 'utf8'));
    const api = { ...tasks, Controller }, window = { LocalItabTasks: api, i18n: locale === 'fallback' ? undefined : { t: key => catalog[key]?.message || key },
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
const checkboxes = h => modal(h).querySelectorAll('.tasks-reopen-checkbox');
const check = (h, index, value = true) => { const node = checkboxes(h)[index]; node.checked = value; node.dispatch('change'); };
const expand = h => { h.view.completed.box.open = true; h.view.completed.box.dispatch('toggle'); };
const open = h => { expand(h); h.view.reopenBatchButton.focus(); h.view.reopenBatchButton.dispatch('click'); };
const prepare = async h => { click(h, 'tasks-reopen-review'); await settle(); };
const input = (node, value) => { node.value = value; node.dispatch('input'); };
const command = (store, kind, record, extra = {}) => store.request(kind, { id: record.id, version: record.version, ...extra });

for (const locale of ['en', 'zh_CN', 'fallback']) test(`completed selection ${locale} previews exact original text then reopens one explicit batch`, async () => {
    const h = model(locale); await settle(); const before = h.backend.raw(); input(h.view.input, 'unsaved quick draft'); open(h);
    assert.equal(modal(h).querySelector('h2').textContent, h.t('tasksReopenBatch'));
    assert.equal(h.guarded(), true); assert.equal(checkboxes(h).length, 6); assert(checkboxes(h).every(node => !node.checked));
    assert.deepEqual(find(h, 'tasks-reopen-selection').querySelectorAll('.tasks-recovery-text').map(node => node.textContent), before.records.slice(0, 6).map(t => t.text));
    click(h, 'tasks-reopen-select-all'); for (let i = 2; i < 6; i++) check(h, i, false); await prepare(h);
    assert.equal(h.backend.writes, 0); assert.deepEqual(h.backend.raw(), before);
    assert.deepEqual(find(h, 'tasks-reopen-preview').querySelectorAll('li').map(node => node.textContent), before.records.slice(0, 2).map(t => t.text));
    assert.equal(find(h, 'tasks-reopen-confirm').textContent, h.t('tasksReopenConfirm').replace('{count}', '2'));
    assert.equal(find(h, 'tasks-reopen-preview').querySelector('p').textContent, h.t('tasksReopenKeepsPin'));
    click(h, 'tasks-reopen-confirm'); await settle(); assert.equal(h.backend.writes, 1); assert.equal(modal(h), null);
    const saved = h.backend.raw(); assert(saved.records.slice(0, 2).every(t => t.state === 'active'));
    assert.deepEqual(saved.records.slice(2), before.records.slice(2)); assert.equal(saved.pinnedId, before.pinnedId);
    assert.deepEqual(saved.records.map(t => t.text), before.records.map(t => t.text)); assert.equal(h.view.undo, null);
    assert.equal(h.view.undoButton.hidden, true); assert.equal(h.view.input.value, 'unsaved quick draft');
    assert.equal(h.document.activeElement, h.view.reopenBatchButton); h.view.destroy();
});

for (const scope of ['unfiltered', 'filtered', 'duplicate', 'zero']) test(`completed candidates use only displayed completed matches (${scope})`, async () => {
    const h = model(); await settle(); h.view.removed.box.open = true; h.view.more.dispatch('click');
    if (scope === 'filtered') input(h.view.filterInput, 'task');
    if (scope === 'duplicate') input(h.view.filterInput, '中文');
    if (scope === 'zero') input(h.view.filterInput, 'no match');
    const before = h.backend.raw(), expected = before.records.filter(t => t.state === 'done' && t.text.toLowerCase().includes(h.view.filterQuery)); open(h);
    if (!expected.length) { assert.equal(modal(h), null); assert.equal(h.view.reopenBatchButton.getAttribute('aria-disabled'), 'true'); }
    else {
        assert.deepEqual(find(h, 'tasks-reopen-selection').querySelectorAll('.tasks-recovery-text').map(node => node.textContent), expected.map(t => t.text));
        click(h, 'tasks-reopen-select-all'); assert(checkboxes(h).every(node => node.checked));
        click(h, 'tasks-reopen-clear'); assert(checkboxes(h).every(node => !node.checked));
        assert.equal(find(h, 'tasks-reopen-review').disabled, true); await prepare(h);
        assert.equal(find(h, 'tasks-reopen-preview').hidden, true); click(h, 'tasks-reopen-cancel');
    }
    assert.equal(h.backend.writes, 0); assert.deepEqual(h.backend.raw(), before); h.view.destroy();
});

for (const invalid of ['closed', 'hidden-origin', 'inert-origin', 'css-hidden-origin', 'detached-origin', 'hidden-host', 'detached-host', 'hidden-page',
    'invalidated', 'suspended', 'departing', 'pending', 'error', 'stale-filter', 'stale-revision', 'stale-text', 'stale-version', 'stale-state', 'stale-order', 'missing-row']) test(`retained completed entry cannot select from ${invalid}`, async () => {
    const h = model(); await settle(); expand(h); const origin = h.view.reopenBatchButton;
    if (invalid === 'closed') h.view.completed.box.open = false;
    if (invalid === 'hidden-origin') origin.hidden = true;
    if (invalid === 'inert-origin') origin.inert = true;
    if (invalid === 'css-hidden-origin') origin.style.visibility = 'hidden';
    if (invalid === 'detached-origin') origin.remove();
    if (invalid === 'hidden-host') h.host.hidden = true;
    if (invalid === 'detached-host') h.host.remove();
    if (invalid === 'hidden-page') h.document.hidden = true;
    if (invalid === 'invalidated') h.backend.workspace.invalidated = true;
    if (invalid === 'suspended') h.backend.workspace._suspended = true;
    if (invalid === 'departing') h.window.LocalItabContentLifecycle.allowDeparture();
    if (invalid === 'pending') h.controller.pending = Promise.resolve();
    if (invalid === 'error') h.controller.error = tasks.fault('READ');
    if (invalid === 'stale-filter') h.view.filterQuery = 'task';
    if (invalid === 'stale-revision') h.controller.state.revision++;
    if (invalid === 'stale-text') h.view.completed.list.children[0].querySelector('.tasks-text').textContent = 'stale text';
    if (invalid === 'stale-version') h.controller.state.records[0].version = 'changed_version';
    if (invalid === 'stale-state') h.controller.state.records[0].state = 'active';
    if (invalid === 'stale-order') [h.controller.state.records[0], h.controller.state.records[1]] = [h.controller.state.records[1], h.controller.state.records[0]];
    if (invalid === 'missing-row') h.view.completed.list.children[0].remove();
    origin.dispatch('click'); await settle(); assert.equal(modal(h), null); assert.equal(h.backend.writes, 0); h.view.destroy();
});

test('selection changes invalidate preview and cancel preserves an unrelated existing Undo', async () => {
    const h = model(); await settle(); await h.view.perform(command(h.store, 'complete', h.backend.raw().records[6]));
    const oldUndo = h.view.undo, writes = h.backend.writes; open(h); check(h, 0); check(h, 1); await prepare(h);
    const confirm = find(h, 'tasks-reopen-confirm'); check(h, 1, false); assert.equal(find(h, 'tasks-reopen-preview').hidden, true);
    confirm.dispatch('click'); await settle(); assert.equal(h.backend.writes, writes); assert.strictEqual(h.view.undo, oldUndo);
    await prepare(h); click(h, 'tasks-reopen-cancel'); assert.strictEqual(h.view.undo, oldUndo); assert.equal(h.backend.writes, writes);
    open(h); check(h, 0); check(h, 1); await prepare(h); click(h, 'tasks-reopen-confirm'); await settle();
    assert.strictEqual(h.view.undo, oldUndo); assert.equal(h.view.undoButton.hidden, false);
    h.view.undoButton.dispatch('click'); await settle(); assert.equal(h.backend.raw().records[6].state, 'active'); assert.equal(h.view.undo, null); h.view.destroy();
});

test('reopening a member of the existing batch Undo hides that old slot and creates no new Undo', async () => {
    const h = model(); await settle(); const value = h.backend.raw(); value.records[0].state = 'active'; value.revision++; h.backend.seed(value); await h.controller.refresh();
    h.view.completeBatchButton.dispatch('click');
    const first = modal(h).querySelector('.tasks-complete-checkbox'); first.checked = true; first.dispatch('change');
    click(h, 'tasks-complete-review'); await settle(); click(h, 'tasks-complete-confirm'); await settle();
    const oldUndo = h.view.undo; assert.equal(oldUndo.kind, 'completeBatch');
    open(h); check(h, 0); await prepare(h); click(h, 'tasks-reopen-confirm'); await settle();
    assert.strictEqual(h.view.undo, oldUndo); assert.equal(h.view.undoButton.hidden, true); const writes = h.backend.writes;
    h.view.undoButton.dispatch('click'); await settle(); assert.equal(h.backend.writes, writes); h.view.destroy();
});

test('one pending confirmation ignores repeated activation, guards departure and returns owned focus', async () => {
    const h = model(); await settle(); open(h); check(h, 0); check(h, 1); await prepare(h);
    const confirm = find(h, 'tasks-reopen-confirm'), gate = deferred(); h.backend.delay = gate.promise; confirm.focus();
    confirm.dispatch('click'); confirm.dispatch('click'); confirm.dispatch('click', { detail: 2 }); await tick();
    assert.equal(confirm.dispatch('keydown', { key: 'Enter', repeat: true }).prevented, true);
    assert.equal(confirm.dispatch('keydown', { key: ' ', repeat: true }).prevented, true);
    assert.equal(h.backend.writes, 1); assert.equal(h.guarded(), true); assert.equal(h.document.activeElement, find(h, 'tasks-reopen-cancel'));
    gate.resolve(); await settle(); assert.equal(h.backend.writes, 1); assert.equal(modal(h), null);
    assert.equal(h.document.activeElement, h.view.reopenBatchButton); h.view.destroy();
});

for (const closeDetails of [false, true]) test(`last completed batch returns focus to quick entry when origin is unavailable (close=${closeDetails})`, async () => {
    const h = model(); await settle(); open(h); click(h, 'tasks-reopen-select-all'); await prepare(h);
    if (closeDetails) h.view.completed.box.open = false;
    click(h, 'tasks-reopen-confirm'); await settle(); assert.equal(modal(h), null); assert.equal(h.view.completed.box.hidden, true);
    assert.equal(h.document.activeElement, h.view.input); h.view.destroy();
});

for (const mode of ['change', 'cancel', 'reopen', 'destroy', 'detach', 'newer-review']) test(`delayed reopening preview cannot affect a ${mode} owner`, async () => {
    const h = model(); await settle(); open(h); check(h, 0); const gate = deferred(), original = h.store.reviewReopening.bind(h.store);
    let first = true; h.store.reviewReopening = async selected => { const review = await original(selected); if (first) { first = false; await gate.promise; } return review; };
    click(h, 'tasks-reopen-review'); await tick();
    if (['change', 'newer-review'].includes(mode)) check(h, 1);
    if (mode === 'newer-review') await prepare(h);
    if (['cancel', 'reopen'].includes(mode)) click(h, 'tasks-reopen-cancel');
    if (mode === 'reopen') { open(h); check(h, 2); }
    if (mode === 'destroy') h.view.destroy();
    if (mode === 'detach') modal(h).remove();
    const current = modal(h), focus = h.document.activeElement; gate.resolve(); await settle();
    assert.equal(modal(h), current); assert.equal(h.document.activeElement, focus); assert.equal(h.backend.writes, 0);
    if (['change', 'reopen'].includes(mode)) assert.equal(find(h, 'tasks-reopen-preview').hidden, true);
    if (mode === 'newer-review') assert.equal(find(h, 'tasks-reopen-preview').querySelectorAll('li').length, 2);
    h.view.destroy();
});

for (const observed of [false, true]) test(`newer pin/list changes stop reviewed reopening (observed=${observed})`, async () => {
    const h = model(); await settle(); open(h); check(h, 0); check(h, 1); await prepare(h);
    const confirm = find(h, 'tasks-reopen-confirm'); h.backend.notifications = observed;
    await h.remote.mutate(command(h.remote, 'pin', h.backend.raw().records[6], { expectedPin: 'task_identity_6' })); await settle();
    if (observed) assert.equal(find(h, 'tasks-reopen-preview').hidden, true);
    confirm.dispatch('click'); await settle(); assert.equal(h.backend.writes, 1); assert.equal(h.backend.raw().records[0].state, 'done');
    assert.equal(find(h, 'tasks-reopen-preview').hidden, true); assert.equal(h.view.undo, null); h.view.destroy();
});

for (const mode of ['invalidated', 'suspended', 'departing', 'hidden-page', 'hidden-dialog', 'css-hidden-dialog', 'inert-dialog', 'detached-dialog', 'detached-host']) test(`retained reopening controls cannot write after ${mode}`, async () => {
    const h = model(); await settle(); open(h); check(h, 0); check(h, 1); await prepare(h);
    const confirm = find(h, 'tasks-reopen-confirm'), review = find(h, 'tasks-reopen-review');
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

for (const [failure, saved] of [['failRead', false], ['fail', false], ['drop', false], ['failAfter', true], ['failVerify', true]]) test(`uncertain reopening ${failure} retains original review/command after checkbox changes`, async () => {
    const h = model(); await settle(); open(h); check(h, 0); check(h, 1); await prepare(h); h.backend[failure] = true;
    click(h, 'tasks-reopen-confirm'); await settle(); const original = h.controller.retryCommand, writes = h.backend.writes;
    assert.equal(original.kind, 'reopenBatch'); assert.equal(original.revision, 0); assert.equal(h.view.undo, null); assert.equal(find(h, 'tasks-reopen-retry').hidden, false);
    assert.equal(h.backend.raw().records.filter(t => t.state === 'active').length, saved ? 3 : 1);
    check(h, 0, false); check(h, 2); await prepare(h); assert.strictEqual(h.controller.retryCommand, original); assert.equal(h.backend.writes, writes);
    assert.deepEqual(find(h, 'tasks-reopen-preview').querySelectorAll('li').map(node => node.textContent), initial().records.slice(0, 2).map(t => t.text));
    assert.equal(find(h, 'tasks-reopen-retry').textContent, h.t('tasksReopenRetry').replace('{count}', '2'));
    h.backend[failure] = false; click(h, 'tasks-reopen-retry'); await settle();
    assert.equal(h.backend.writes, writes + (saved ? 0 : 1)); assert.equal(h.backend.raw().records[0].state, 'active');
    assert.equal(h.backend.raw().records[1].state, 'active'); assert.equal(h.backend.raw().records[2].state, 'done');
    assert(modal(h), 'changed selection remains open'); assert.equal(h.view.undo, null); assert.equal(h.controller.retryCommand, null); h.view.destroy();
});

test('closing uncertain reopening preserves card Retry and cannot dismiss or steal focus from a newer draft', async () => {
    const h = model(); await settle(); open(h); check(h, 0); check(h, 1); await prepare(h); h.backend.failAfter = true;
    click(h, 'tasks-reopen-confirm'); await settle(); const original = h.controller.retryCommand, writes = h.backend.writes;
    click(h, 'tasks-reopen-cancel'); assert.strictEqual(h.controller.retryCommand, original); assert.equal(h.view.retry.hidden, false);
    h.view.addBatch(); const draft = h.document.querySelector('.tasks-batch-editor'); input(draft, 'newer draft'); draft.focus();
    await h.view.retryLast(); await settle(); assert.equal(h.backend.writes, writes); assert.equal(h.document.querySelector('.tasks-batch-editor'), draft);
    assert.equal(h.document.activeElement, draft); assert.equal(draft.value, 'newer draft'); assert.equal(h.view.undo, null); h.view.destroy();
});

test('a sent reopening survives Cancel without affecting the next modal or its focus', async () => {
    const h = model(); await settle(); open(h); check(h, 0); check(h, 1); await prepare(h);
    const gate = deferred(); h.backend.delay = gate.promise; click(h, 'tasks-reopen-confirm'); await tick(); click(h, 'tasks-reopen-cancel');
    assert.equal(h.guarded(), true); h.view.addBatch(); const draft = h.document.querySelector('.tasks-batch-editor'); input(draft, 'new draft'); draft.focus();
    gate.resolve(); await settle(); assert.equal(h.backend.writes, 1); assert.equal(h.document.querySelector('.tasks-batch-editor'), draft);
    assert.equal(h.document.activeElement, draft); assert.equal(draft.value, 'new draft'); assert.equal(h.view.undo, null); h.view.destroy();
});

test('a newer action owns Undo and Retry over the older reopening completion callback', async () => {
    const h = model(); await settle(); open(h); check(h, 0); check(h, 1); await prepare(h); let started = false;
    const unsubscribe = h.controller.subscribe(() => {
        if (!started && !h.controller.pending && h.controller.status === 'saved') {
            started = true; h.view.perform(command(h.store, 'remove', h.controller.state.records[2]));
        }
    });
    click(h, 'tasks-reopen-confirm'); await settle(); await settle(); assert.equal(h.backend.writes, 2);
    assert.equal(h.view.undo.id, 'task_identity_2'); assert.equal(h.view.undo.state, 'removed'); assert.equal(h.controller.retryCommand, null);
    assert.equal(find(h, 'tasks-reopen-preview').hidden, true); unsubscribe(); h.view.destroy();
});

test('uncertain reopening followed by a later mutation refuses retry and preserves unrelated Undo', async () => {
    const h = model(); await settle(); await h.view.perform(command(h.store, 'complete', h.backend.raw().records[6])); const oldUndo = h.view.undo;
    open(h); check(h, 0); check(h, 1); await prepare(h); h.backend.failAfter = true; click(h, 'tasks-reopen-confirm'); await settle();
    await h.remote.mutate(h.remote.request('enable', { enabled: true })); await settle(); const before = h.backend.raw(), writes = h.backend.writes;
    click(h, 'tasks-reopen-retry'); await settle(); assert.equal(h.backend.writes, writes); assert.deepEqual(h.backend.raw(), before);
    assert.strictEqual(h.view.undo, oldUndo); assert.equal(find(h, 'tasks-reopen-retry').hidden, true); assert.equal(find(h, 'tasks-reopen-confirm').hidden, true); h.view.destroy();
});

test('remote hide keeps selection and uncertain Retry reachable, then honors the saved hidden preference', async () => {
    const h = model(); await settle(); open(h); check(h, 0); check(h, 1);
    await h.remote.mutate(h.remote.request('enable', { enabled: false })); await settle(); assert.equal(h.host.hidden, false); await prepare(h);
    h.backend.failAfter = true; click(h, 'tasks-reopen-confirm'); await settle(); const original = h.controller.retryCommand, writes = h.backend.writes;
    click(h, 'tasks-reopen-cancel'); assert.equal(h.backend.raw().enabled, false); assert.equal(h.host.hidden, false);
    assert.equal(h.view.retry.hidden, false); assert.strictEqual(h.controller.retryCommand, original);
    await h.view.retryLast(); await settle(); assert.equal(h.backend.writes, writes); assert.equal(h.backend.raw().enabled, false);
    assert.equal(h.host.hidden, true); assert.equal(h.view.undo, null); h.view.destroy();
});

test('shared modal IME Escape and invalidated-control focus route safely', async () => {
    const h = model(); await settle(); open(h); const first = checkboxes(h)[0]; first.focus(); first.dispatch('compositionstart');
    assert.equal(first.dispatch('keydown', { key: 'Escape' }).prevented, false); assert(modal(h)); first.dispatch('compositionend');
    check(h, 0); await prepare(h); find(h, 'tasks-reopen-confirm').focus();
    await h.remote.mutate(h.remote.request('enable', { enabled: true })); await settle();
    assert.equal(h.document.activeElement, find(h, 'tasks-reopen-cancel')); h.document.activeElement.dispatch('keydown', { key: 'Escape' });
    assert.equal(modal(h), null); assert.equal(h.document.activeElement, h.view.reopenBatchButton); h.view.destroy();
});

for (const targetOldUndo of [false, true]) test(`existing batch Undo remains usable only when reopening leaves its members untouched (target=${targetOldUndo})`, async () => {
    const h = model(); await settle(); h.view.completeBatchButton.dispatch('click');
    const first = modal(h).querySelector('.tasks-complete-checkbox'); first.checked = true; first.dispatch('change');
    click(h, 'tasks-complete-review'); await settle(); click(h, 'tasks-complete-confirm'); await settle();
    const oldUndo = h.view.undo; assert.equal(oldUndo.kind, 'completeBatch'); assert.equal(oldUndo.records[0].id, 'task_identity_6');
    open(h); check(h, targetOldUndo ? 6 : 0); await prepare(h); click(h, 'tasks-reopen-confirm'); await settle();
    assert.strictEqual(h.view.undo, oldUndo); assert.equal(h.view.undoButton.hidden, targetOldUndo); const writes = h.backend.writes;
    h.view.undoButton.dispatch('click'); await settle(); assert.equal(h.backend.writes, writes + (targetOldUndo ? 0 : 1));
    assert.equal(h.backend.raw().records[6].state, 'active'); h.view.destroy();
});

test('reopening a single-completion Undo member hides the stale Undo without replacing it', async () => {
    const h = model(); await settle(); await h.view.perform(command(h.store, 'complete', h.backend.raw().records[6]));
    const oldUndo = h.view.undo; open(h); check(h, 6); await prepare(h); click(h, 'tasks-reopen-confirm'); await settle();
    assert.strictEqual(h.view.undo, oldUndo); assert.equal(h.view.undoButton.hidden, true); const writes = h.backend.writes;
    h.view.undoButton.dispatch('click'); await settle(); assert.equal(h.backend.writes, writes); h.view.destroy();
});

test('collapsing Completed during a pending save returns focus outside the closed section', async () => {
    const h = model(); await settle(); open(h); check(h, 0); await prepare(h);
    const gate = deferred(); h.backend.delay = gate.promise; click(h, 'tasks-reopen-confirm'); await tick();
    h.view.completed.box.open = false; gate.resolve(); await settle(); assert.equal(h.backend.writes, 1);
    assert.equal(h.view.completed.box.hidden, false); assert.equal(modal(h), null); assert.equal(h.document.activeElement, h.view.input); h.view.destroy();
});
