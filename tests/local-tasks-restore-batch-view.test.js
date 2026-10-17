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
        text: i < 2 ? '  中文 😀\r\n<b>literal</b>  ' : `task ${i}`, state: i < 6 ? 'removed' : i === 6 ? 'active' : 'done',
        removedFrom: i < 6 ? (i % 2 ? 'done' : 'active') : null, createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' }));
    state.pinnedId = state.records[6].id; return state;
}
function model(locale = 'en') {
    let raw = initial(), queue = Promise.resolve(); const listeners = new Set(), events = new Map(), observers = new Set();
    const backend = { writes: 0, notifications: true, workspace: { id: 'workspace_one', generation: 1, invalidated: false, _suspended: false },
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
    // Limited reflected-attribute observer model. It exercises the actual dialog
    // helper's inert writes and observer queues; it is not native browser timing.
    const emit = record => { for (const observer of observers) {
        if (!observer.filter?.includes(record.attributeName)) continue;
        observer.records.push(record);
        if (!observer.scheduled) { observer.scheduled = true; queueMicrotask(() => {
            observer.scheduled = false; if (observers.has(observer)) { const records = observer.takeRecords(); if (records.length) observer.callback(records); }
        }); }
    } };
    const instrument = node => {
        for (const name of ['inert', 'hidden', 'disabled', 'open']) {
            const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), name);
            let value = node[name];
            Object.defineProperty(node, name, { configurable: true,
                get() { return descriptor?.get ? descriptor.get.call(this) : value; },
                set(next) { const before = !!this[name]; if (descriptor?.set) descriptor.set.call(this, next); else value = next;
                    if (this.isConnected && (before !== !!next || !!next)) emit({ type: 'attributes', target: this, attributeName: name, oldValue: before ? '' : null }); }
            });
        }
        return node;
    };
    [document.body, document.documentElement, host, search].forEach(instrument);
    const create = document.createElement; document.createElement = tag => instrument(create(tag));
    const catalog = JSON.parse(fs.readFileSync(`_locales/${locale === 'fallback' ? 'en' : locale}/messages.json`, 'utf8'));
    const api = { ...tasks, Controller }, clipboardCalls = [], window = { LocalItabTasks: api, LocalItabWorkspaces: { session: backend.workspace }, navigator: { clipboard: { writeText(text) { clipboardCalls.push(text); return Promise.resolve(); } } },
        MutationObserver: class { constructor(callback) { this.callback = callback; this.records = []; } observe(_node, options) { this.filter = options.attributeFilter; observers.add(this); } disconnect() { observers.delete(this); } takeRecords() { return this.records.splice(0); } }, i18n: locale === 'fallback' ? undefined : { t: key => catalog[key]?.message || key },
        addEventListener(type, fn) { const set = events.get(type) || new Set(); set.add(fn); events.set(type, set); },
        removeEventListener(type, fn) { events.get(type)?.delete(fn); },
        getComputedStyle(node) { for (let current = node; current; current = current.parentElement) if (current.style.visibility) return { visibility: current.style.visibility }; return { visibility: 'visible' }; } };
    const context = vm.createContext({ window, document, crypto: webcrypto, setTimeout, URL, Blob, console });
    for (const file of ['dialog-focus', 'local-tasks-view', 'local-content-lifecycle']) vm.runInContext(fs.readFileSync(`shared/${file}.js`, 'utf8'), context);
    const view = api.mount(host, { controller }); window.localTasksView = view;
    return { backend, store, remote, controller, document, host, search, view, window, events, clipboardCalls, observers,
        mutations(records) { for (const observer of [...observers]) observer.callback(records); },
        t: key => catalog[key]?.message || key,
        guarded() { const event = { prevented: false, preventDefault() { this.prevented = true; } }; for (const fn of events.get('beforeunload') || []) fn(event); return event.prevented; } };
}
const modal = h => h.document.querySelector('.tasks-dialog');
const find = (h, className) => modal(h)?.querySelector(`.${className}`);
const click = (h, className, fields = {}) => { const node = find(h, className); assert(node, className); node.dispatch('click', fields); return node; };
const checkboxes = h => modal(h).querySelectorAll('.tasks-restore-checkbox');
const check = (h, index, value = true) => { const node = checkboxes(h)[index]; node.checked = value; node.dispatch('change'); };
const expand = h => { h.view.removed.box.open = true; h.view.removed.box.dispatch('toggle'); };
const open = h => { expand(h); h.view.restoreBatchButton.focus(); h.view.restoreBatchButton.dispatch('click'); };
const prepare = async h => { click(h, 'tasks-restore-review'); await settle(); };
const input = (node, value) => { node.value = value; node.dispatch('input'); };
const command = (store, kind, record, extra = {}) => store.request(kind, { id: record.id, version: record.version, ...extra });

const originals = (h, name = 'tasks-restore-preview') => find(h, name).querySelectorAll('.tasks-recovery-text').map(node => node.textContent);
const destinations = h => find(h, 'tasks-restore-preview').querySelectorAll('.tasks-restore-destination').map(node => node.textContent);

for (const locale of ['en', 'zh_CN', 'fallback']) test(`restoration ${locale} has no default selection, exact originals and per-item destinations in one save`, async () => {
    const h = model(locale); await settle(); const before = h.backend.raw(); input(h.view.input, 'unsaved quick draft'); open(h);
    assert.equal(modal(h).querySelector('h2').textContent, h.t('tasksRestoreBatch'));
    assert.equal(h.guarded(), true); assert.equal(checkboxes(h).length, 6); assert(checkboxes(h).every(node => !node.checked));
    assert.deepEqual(originals(h, 'tasks-restore-selection'), before.records.slice(0, 6).map(t => t.text));
    click(h, 'tasks-restore-select-all'); click(h, 'tasks-restore-clear'); assert(checkboxes(h).every(node => !node.checked));
    check(h, 0); check(h, 1); await prepare(h); assert.equal(h.backend.writes, 0); assert.deepEqual(h.backend.raw(), before);
    assert.deepEqual(originals(h), before.records.slice(0, 2).map(t => t.text));
    assert.deepEqual(destinations(h), [h.t('tasksRestoreToActive'), h.t('tasksRestoreToDone')]);
    assert.equal(find(h, 'tasks-restore-confirm').textContent, h.t('tasksRestoreConfirm').replace('{count}', '2'));
    click(h, 'tasks-restore-confirm'); await settle(); const saved = h.backend.raw();
    assert.equal(h.backend.writes, 1); assert.equal(modal(h), null); assert.equal(saved.records[0].state, 'active'); assert.equal(saved.records[1].state, 'done');
    assert(saved.records.slice(0, 2).every(t => t.removedFrom === null)); assert.deepEqual(saved.records.slice(2), before.records.slice(2));
    assert.equal(saved.pinnedId, before.pinnedId); assert.deepEqual(saved.records.map(t => t.text), before.records.map(t => t.text));
    assert.equal(h.view.input.value, 'unsaved quick draft'); assert.equal(h.view.undo, null); assert.equal(h.document.activeElement, h.view.restoreBatchButton);
    assert.deepEqual(h.clipboardCalls, []); h.view.destroy(); assert.equal(h.observers.size, 0);
});

test('real dialog helper background inert survives normal render, cancel/reopen and save/redraw/reopen', async () => {
    const h = model(); await settle(); open(h); assert.equal(h.host.inert, true); h.view.render(); await settle();
    check(h, 0); await prepare(h); assert.equal(find(h, 'tasks-restore-confirm').hidden, false); click(h, 'tasks-restore-cancel'); await settle();
    assert.equal(h.host.inert, false); open(h); check(h, 0); await prepare(h); click(h, 'tasks-restore-confirm'); await settle();
    assert.equal(h.backend.writes, 1); assert.equal(h.host.inert, false); open(h); check(h, 0); await prepare(h);
    assert.equal(find(h, 'tasks-restore-confirm').hidden, false); click(h, 'tasks-restore-cancel'); await settle(); h.view.destroy();
});

test('filter sets exact displayed removed scope in stored order; Cancel and empty selection write nothing', async () => {
    const h = model(); await settle(); input(h.view.filterInput, '  中文  '); open(h); assert.equal(checkboxes(h).length, 2);
    const before = h.backend.raw(); await prepare(h); assert.equal(find(h, 'tasks-restore-preview').hidden, true);
    check(h, 1); await prepare(h); assert.deepEqual(originals(h), [before.records[1].text]);
    click(h, 'tasks-restore-cancel'); assert.deepEqual(h.backend.raw(), before); assert.equal(h.backend.writes, 0);
    assert.equal(h.view.filterInput.value, '  中文  '); assert.equal(h.view.removed.box.open, true); h.view.destroy();
});

for (const invalid of ['closed', 'hidden-origin', 'inert-origin', 'disabled-origin', 'aria-disabled-origin', 'css-hidden-origin', 'detached-origin',
    'hidden-host', 'inert-host', 'detached-host', 'hidden-page', 'invalidated', 'suspended', 'workspace-id', 'workspace-generation', 'workspace-session',
    'workspace-object', 'workspace-missing-session', 'departing', 'pending', 'error', 'local-error', 'retry', 'composing-filter', 'stale-filter', 'raw-filter', 'stale-revision',
    'stale-text', 'stale-version', 'stale-state', 'stale-destination', 'stale-order', 'missing-row', 'replaced-title', 'replaced-summary', 'replaced-section',
    'replaced-button-property', 'foreign-document', 'reparent-controls', 'hidden-title', 'inert-title', 'css-hidden-title', 'hidden-list', 'hidden-summary']) test(`restoration entry rejects ${invalid}`, async () => {
    const h = model(); await settle(); expand(h); const origin = h.view.restoreBatchButton, section = h.view.removed;
    const title = section.list.children[0].querySelector('.tasks-text');
    if (invalid === 'closed') section.box.open = false;
    if (invalid === 'hidden-origin') origin.hidden = true;
    if (invalid === 'inert-origin') origin.inert = true;
    if (invalid === 'disabled-origin') origin.disabled = true;
    if (invalid === 'aria-disabled-origin') origin.setAttribute('aria-disabled', 'true');
    if (invalid === 'css-hidden-origin') origin.style.visibility = 'hidden';
    if (invalid === 'detached-origin') origin.remove();
    if (invalid === 'hidden-host') h.host.hidden = true;
    if (invalid === 'inert-host') h.host.inert = true;
    if (invalid === 'detached-host') h.host.remove();
    if (invalid === 'hidden-page') h.document.hidden = true;
    if (invalid === 'invalidated') h.backend.workspace.invalidated = true;
    if (invalid === 'suspended') h.backend.workspace._suspended = true;
    if (invalid === 'workspace-id') h.backend.workspace.id = 'workspace_two';
    if (invalid === 'workspace-generation') h.backend.workspace.generation++;
    if (invalid === 'workspace-session') h.window.LocalItabWorkspaces.session = {};
    if (invalid === 'workspace-object') h.backend.workspace = { ...h.backend.workspace };
    if (invalid === 'workspace-missing-session') delete h.window.LocalItabWorkspaces.session;
    if (invalid === 'departing') h.window.LocalItabContentLifecycle.allowDeparture();
    if (invalid === 'pending') h.controller.pending = Promise.resolve();
    if (invalid === 'error') h.controller.error = tasks.fault('READ');
    if (invalid === 'local-error') h.view.localError = tasks.fault('FILE');
    if (invalid === 'retry') h.controller.retryCommand = h.store.request('enable', { enabled: true });
    if (invalid === 'composing-filter') h.view.filterComposing = true;
    if (invalid === 'stale-filter') h.view.filterQuery = 'task';
    if (invalid === 'raw-filter') h.view.filterInput.value = 'task';
    if (invalid === 'stale-revision') h.controller.state.revision++;
    if (invalid === 'stale-text') title.textContent = 'stale text';
    if (invalid === 'stale-version') h.controller.state.records[0].version = 'changed_version';
    if (invalid === 'stale-state') h.controller.state.records[0].state = 'active';
    if (invalid === 'stale-destination') h.controller.state.records[0].removedFrom = 'done';
    if (invalid === 'stale-order') h.controller.state.records.reverse();
    if (invalid === 'missing-row') section.list.children[0].remove();
    if (invalid === 'replaced-title') { const node = h.document.createElement('span'); node.className = 'tasks-text'; node.textContent = title.textContent; title.replaceWith(node); }
    if (invalid === 'replaced-summary') section.summary = h.document.createElement('summary');
    if (invalid === 'replaced-section') h.view.removed = { ...section };
    if (invalid === 'replaced-button-property') h.view.restoreBatchButton = h.document.createElement('button');
    if (invalid === 'foreign-document') title.ownerDocument = {};
    if (invalid === 'reparent-controls') { origin.remove(); section.box.append(origin); }
    if (invalid === 'hidden-title') title.hidden = true;
    if (invalid === 'inert-title') title.inert = true;
    if (invalid === 'css-hidden-title') title.style.visibility = 'hidden';
    if (invalid === 'hidden-list') section.list.hidden = true;
    if (invalid === 'hidden-summary') section.summary.hidden = true;
    origin.dispatch('click'); await settle(); assert.equal(modal(h), null); assert.equal(h.backend.writes, 0); h.view.destroy();
});

for (const target of ['origin', 'host', 'row', 'title']) test(`removed and reattached ${target} cannot revive an old restoration owner`, async () => {
    const h = model(); await settle(); expand(h); const node = target === 'origin' ? h.view.restoreBatchButton : target === 'host' ? h.host :
        target === 'row' ? h.view.removed.list.children[0] : h.view.removed.list.children[0].querySelector('.tasks-text');
    const parent = node.parentElement; node.remove(); parent.append(node);
    h.mutations([{ type: 'childList', target: parent, removedNodes: [node] }]); h.view.restoreBatchButton.dispatch('click');
    await settle(); assert.equal(modal(h), null); assert.equal(h.backend.writes, 0); h.view.destroy();
});

for (const mutation of ['disabled-aba', 'external-inert-aba', 'source-text', 'dialog-reattach']) test(`prepared restoration loses authority after ${mutation}`, async () => {
    const h = model(); await settle(); open(h); check(h, 0); await prepare(h); const confirm = find(h, 'tasks-restore-confirm');
    if (mutation === 'disabled-aba') { h.view.restoreBatchButton.disabled = true; h.view.restoreBatchButton.disabled = false; }
    if (mutation === 'external-inert-aba') { h.host.inert = false; h.host.inert = true; }
    if (mutation === 'source-text') { const title = h.view.removed.list.children[0].querySelector('.tasks-text'); title.textContent += ' changed'; h.mutations([{ type: 'characterData', target: title }]); }
    if (mutation === 'dialog-reattach') { const panel = modal(h), parent = panel.parentElement; panel.remove(); parent.append(panel); h.mutations([{ type: 'childList', target: parent, removedNodes: [panel] }]); }
    confirm.dispatch('click'); await settle(); assert.equal(h.backend.writes, 0); h.view.destroy();
});

for (const fields of [{ detail: 2 }, { repeat: true }, { isComposing: true }, { keyCode: 229 }, { defaultPrevented: true }]) test(`repeated/composing restoration activation is ignored ${JSON.stringify(fields)}`, async () => {
    const h = model(); await settle(); expand(h); h.view.restoreBatchButton.dispatch('click', fields); assert.equal(modal(h), null);
    open(h); check(h, 0); await prepare(h); find(h, 'tasks-restore-confirm').dispatch('click', fields); await settle(); assert.equal(h.backend.writes, 0); h.view.destroy();
});

test('selection changes invalidate a preview; cancellation preserves an unrelated Undo', async () => {
    const h = model(); await settle(); await h.view.perform(command(h.store, 'complete', h.backend.raw().records[6])); const undo = h.view.undo;
    open(h); check(h, 0); check(h, 1); await prepare(h); const confirm = find(h, 'tasks-restore-confirm');
    check(h, 1, false); assert.equal(find(h, 'tasks-restore-preview').hidden, true); confirm.dispatch('click'); await settle(); assert.equal(h.backend.writes, 1);
    await prepare(h); click(h, 'tasks-restore-cancel'); assert.strictEqual(h.view.undo, undo); open(h); check(h, 0); await prepare(h); click(h, 'tasks-restore-confirm'); await settle();
    assert.strictEqual(h.view.undo, undo); assert.equal(h.view.undoButton.hidden, false); h.view.undoLast(); await settle(); assert.equal(h.backend.raw().records[6].state, 'active'); h.view.destroy();
});

test('restoring the previous removal invalidates its old Undo without replacing it', async () => {
    const h = model(); await settle(); await h.view.perform(command(h.store, 'remove', h.backend.raw().records[6])); const undo = h.view.undo;
    open(h); check(h, 6); await prepare(h); click(h, 'tasks-restore-confirm'); await settle();
    assert.strictEqual(h.view.undo, undo); assert.equal(h.view.undoButton.hidden, true); const writes = h.backend.writes;
    h.view.undoLast(); await settle(); assert.equal(h.backend.writes, writes); h.view.destroy();
});

for (const mode of ['change', 'cancel', 'reopen', 'destroy', 'detach', 'newer-review']) test(`late review cannot change a ${mode} owner`, async () => {
    const h = model(); await settle(); open(h); check(h, 0); const gate = deferred(), original = h.store.reviewRestoration.bind(h.store);
    let first = true; h.store.reviewRestoration = async selected => { const value = await original(selected); if (first) { first = false; await gate.promise; } return value; };
    click(h, 'tasks-restore-review'); await tick();
    if (['change', 'newer-review'].includes(mode)) check(h, 1);
    if (mode === 'newer-review') await prepare(h);
    if (['cancel', 'reopen'].includes(mode)) click(h, 'tasks-restore-cancel');
    if (mode === 'reopen') { open(h); check(h, 2); }
    if (mode === 'destroy') h.view.destroy(); if (mode === 'detach') modal(h).remove();
    const current = modal(h), focus = h.document.activeElement; gate.resolve(); await settle();
    assert.equal(modal(h), current); assert.equal(h.document.activeElement, focus); assert.equal(h.backend.writes, 0);
    if (['change', 'reopen'].includes(mode)) assert.equal(find(h, 'tasks-restore-preview').hidden, true);
    if (mode === 'newer-review') assert.equal(originals(h).length, 2); h.view.destroy();
});

for (const observed of [false, true]) test(`new pin rejects reviewed restoration observed=${observed}`, async () => {
    const h = model(); await settle(); open(h); check(h, 0); await prepare(h); const confirm = find(h, 'tasks-restore-confirm'); h.backend.notifications = observed;
    await h.remote.mutate(command(h.remote, 'pin', h.backend.raw().records[6], { expectedPin: 'task_identity_6' })); await settle();
    if (observed) assert.equal(find(h, 'tasks-restore-preview').hidden, true);
    confirm.dispatch('click'); await settle(); assert.equal(h.backend.writes, 1); assert.equal(h.backend.raw().records[0].state, 'removed'); h.view.destroy();
});

for (const [failure, saved] of [['failRead', false], ['fail', false], ['drop', false], ['failAfter', true], ['failVerify', true]]) test(`uncertain ${failure} preserves immutable originals through changed selection and exact retry`, async () => {
    const h = model(); await settle(); open(h); check(h, 0); check(h, 1); await prepare(h); h.backend[failure] = true;
    click(h, 'tasks-restore-confirm'); await settle(); const original = h.controller.retryCommand, writes = h.backend.writes;
    assert.equal(original.kind, 'restoreBatch'); assert(Object.isFrozen(original)); assert.equal(find(h, 'tasks-restore-retry').hidden, false);
    check(h, 0, false); check(h, 2); await prepare(h); assert.strictEqual(h.controller.retryCommand, original); assert.equal(h.backend.writes, writes);
    assert.deepEqual(originals(h), initial().records.slice(0, 2).map(t => t.text)); assert.deepEqual(destinations(h), [h.t('tasksRestoreToActive'), h.t('tasksRestoreToDone')]);
    h.backend[failure] = false; click(h, 'tasks-restore-retry'); await settle(); assert.equal(h.backend.writes, writes + (saved ? 0 : 1));
    assert.equal(h.backend.raw().records[0].state, 'active'); assert.equal(h.backend.raw().records[1].state, 'done'); assert.equal(h.backend.raw().records[2].state, 'removed');
    assert(modal(h)); assert.equal(h.controller.retryCommand, null); h.view.destroy();
});

for (const pending of [false, true]) test(`closing a ${pending ? 'pending' : 'uncertain'} save preserves its original and newer dialog focus`, async () => {
    const h = model(); await settle(); open(h); check(h, 0); await prepare(h); const gate = deferred();
    if (pending) h.backend.delay = gate.promise; else h.backend.failAfter = true;
    click(h, 'tasks-restore-confirm'); if (pending) await tick(); else await settle();
    const original = h.controller.retryCommand; click(h, 'tasks-restore-cancel'); assert.strictEqual(h.controller.retryCommand, original);
    h.view.addBatch(); const draft = h.document.querySelector('.tasks-batch-editor'); input(draft, 'newer draft'); draft.focus();
    if (pending) gate.resolve(); else await h.view.retryLast(); await settle();
    assert.equal(h.backend.writes, 1); assert.equal(h.document.querySelector('.tasks-batch-editor'), draft); assert.equal(h.document.activeElement, draft);
    assert.equal(draft.value, 'newer draft'); assert.equal(h.view.undo, null); h.view.destroy();
});

test('remote hide retains the selection, explicit re-review and card retry without writing the preference back', async () => {
    const h = model(); await settle(); open(h); check(h, 0); check(h, 1);
    await h.remote.mutate(h.remote.request('enable', { enabled: false })); await settle(); assert.equal(h.host.hidden, false); await prepare(h);
    h.backend.failAfter = true; click(h, 'tasks-restore-confirm'); await settle(); const original = h.controller.retryCommand, writes = h.backend.writes;
    assert(original); click(h, 'tasks-restore-cancel'); assert.equal(h.host.hidden, false); assert.equal(h.view.retry.hidden, false);
    await h.view.retryLast(); await settle(); assert.equal(h.backend.writes, writes); assert.equal(h.backend.raw().enabled, false); assert.equal(h.host.hidden, true); h.view.destroy();
});

for (const mode of ['all', 'collapsed', 'blur']) test(`confirmed restoration routes only owned focus ${mode}`, async () => {
    const h = model(); await settle(); open(h); if (mode === 'all') click(h, 'tasks-restore-select-all'); else check(h, 0); await prepare(h);
    const gate = deferred(); h.backend.delay = gate.promise; click(h, 'tasks-restore-confirm'); await tick();
    if (mode === 'collapsed') h.view.removed.box.open = false;
    if (mode === 'blur') { for (const fn of h.events.get('blur') || []) fn(); }
    gate.resolve(); await settle(); assert.equal(h.backend.writes, 1); assert.equal(modal(h), null);
    if (mode !== 'blur') assert.equal(h.document.activeElement, h.view.input); else assert.notEqual(h.document.activeElement, h.view.restoreBatchButton);
    h.view.destroy();
});

test('restoration dialog and redraw never release an already issued clipboard write', async () => {
    const h = model(); await settle(); expand(h); const gate = deferred(); let calls = 0; h.view.clipboard = { writeText() { calls++; return gate.promise; } };
    h.view.copyRemovedButton.dispatch('click'); assert.equal(calls, 1); const copy = h.view.copyAttempt;
    open(h); check(h, 0); await prepare(h); click(h, 'tasks-restore-confirm'); await settle(); assert.equal(h.backend.writes, 1);
    assert.strictEqual(h.view.copyAttempt, copy); h.view.copyRemovedButton.dispatch('click'); assert.equal(calls, 1);
    gate.resolve(); await settle(); assert.equal(h.view.copyAttempt, null); h.view.destroy();
});

for (const mode of ['object', 'id', 'generation', 'session', 'missing-session', 'unchanged']) test(`a formal redraw cannot reauthorize an old View across workspace ${mode}`, async () => {
    const h = model(); await settle(); const original = h.backend.workspace;
    if (mode === 'object') { h.backend.workspace = { ...original }; h.window.LocalItabWorkspaces.session = h.backend.workspace; }
    if (mode === 'id') original.id = 'workspace_reassigned';
    if (mode === 'generation') original.generation++;
    if (mode === 'session') h.window.LocalItabWorkspaces.session = { ...original };
    if (mode === 'missing-session') delete h.window.LocalItabWorkspaces.session;
    const value = h.backend.raw(); value.revision++; h.backend.seed(value); await h.controller.refresh(); await settle();
    open(h);
    if (mode === 'unchanged') { assert(modal(h)); check(h, 0); await prepare(h); assert.equal(find(h, 'tasks-restore-confirm').hidden, false); }
    else assert.equal(modal(h), null);
    assert.equal(h.backend.writes, 0); h.view.destroy();
});
