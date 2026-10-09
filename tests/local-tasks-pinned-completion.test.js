const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');
const tasks = require('../shared/local-tasks-store.js');
const { Controller } = require('../shared/local-tasks-controller.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { await tick(); await tick(); await tick(); }
function fixture() {
    let raw, queue = Promise.resolve(); const listeners = new Set();
    const backend = {
        writes: 0, fail: false, delay: null, notifications: true, failAfterWrite: false, failVerifyRead: false, drop: false,
        lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() {
            if (backend.readFailure) { backend.readFailure = false; throw new Error('read-back unavailable'); }
            return raw && structuredClone(raw);
        },
        async write(value) {
            backend.writes++;
            if (backend.delay) await backend.delay;
            if (backend.fail) return false;
            if (backend.drop) return;
            raw = structuredClone(value);
            if (backend.notifications) listeners.forEach(fn => fn());
            if (backend.failAfterWrite) { backend.failAfterWrite = false; throw new Error('uncertain acknowledgement'); }
            if (backend.failVerifyRead) { backend.failVerifyRead = false; backend.readFailure = true; }
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        raw: () => structuredClone(raw)
    };
    return { backend, store: new tasks.Store(backend), remote: new tasks.Store(backend) };
}
function model(locale = 'en') {
    const h = fixture(), document = createDocument();
    const host = document.createElement('article'), search = document.createElement('input');
    document.body.append(search, host); search.focus();
    const catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const api = { ...tasks, Controller }, window = { LocalItabTasks: api, i18n: { t: key => catalog[key]?.message || key } };
    const controller = new Controller(h.store), context = vm.createContext({ window, document, crypto: webcrypto, URL, Blob, setTimeout, console });
    vm.runInContext(fs.readFileSync('shared/dialog-focus.js', 'utf8'), context);
    vm.runInContext(fs.readFileSync('shared/local-tasks-view.js', 'utf8'), context);
    const view = api.mount(host, { controller, alwaysVisible: true });
    return { ...h, document, host, search, controller, view, window };
}
const command = (store, kind, task, values = {}) => store.request(kind, { id: task.id, version: task.version, ...values });
async function add(store, text) { return (await store.mutate(store.request('add', { text }))).records.at(-1); }
async function pin(h, task, expectedPin = null) {
    await h.store.mutate(command(h.store, 'pin', task, { expectedPin })); await settle();
}
async function seeded(locale) {
    const h = model(locale); await settle();
    const task = await add(h.store, 'Pinned task <b>中文</b>'); await pin(h, task); return { ...h, task };
}
function input(node, value) { node.value = value; node.dispatch('input'); }
function docEvent(h, type, fields = {}) { h.document.listeners.get(type)?.({ target: h.document.body, ...fields }); }
function focus(h, node) { node.focus(); docEvent(h, 'focusin', { target: node }); }
const nativeKey = (button, key, repeat = false) => {
    const event = button.dispatch('keydown', { key, repeat });
    // This deliberately models default activation; native Enter/Space is a separate browser check.
    if (!event.prevented) button.dispatch('click', { detail: 0 });
    return event;
};

for (const locale of ['en', 'zh_CN']) test(`pinned Task 5: visible localized native control completes exact duplicate-text identity (${locale})`, async () => {
    const h = model(locale); await settle(); const list = [];
    for (let i = 0; i < 5; i++) list.push(await add(h.store, i === 0 || i === 4 ? '<b>same task</b> 中文' : `Task ${i + 1}`));
    await pin(h, list[4]); const action = h.view.nextComplete, before = h.backend.raw();
    assert.equal(h.view.list.children.length, 4); assert(!h.view.list.querySelectorAll('[data-task-id]').some(row => row.dataset.taskId === list[4].id));
    assert.equal(action.tagName, 'BUTTON'); assert.equal(action.type, 'button');
    assert.equal(action.textContent, locale === 'en' ? 'Complete' : '完成');
    assert.equal(action.getAttribute('aria-label'), `${action.textContent}: ${list[4].text}`);
    const text = h.view.next.querySelector('.tasks-next-text');
    assert.equal(text.tagName, 'SPAN'); assert.equal(text.children.length, 0); assert.equal(text.tabIndex, -1);
    assert.equal(text.listeners.size, 0); text.dispatch('click'); text.dispatch('dblclick');
    assert.deepEqual(h.backend.raw(), before, 'plain text remains noninteractive');
    input(h.view.input, 'Keep my draft'); action.focus(); nativeKey(action, 'Enter'); await settle();
    const after = h.backend.raw(); assert.equal(after.records[4].state, 'done'); assert.equal(after.records[0].state, 'active');
    assert.equal(after.pinnedId, null); assert.equal(h.view.nextComplete, null); assert.equal(h.view.next.querySelectorAll('button').length, 0);
    assert.equal(h.view.input.value, 'Keep my draft'); assert.equal(h.document.activeElement, h.view.input);
    assert.deepEqual(after.records.map(t => t.id), before.records.map(t => t.id)); assert.equal(h.view.expanded, false);
    assert.equal(after.schemaVersion, before.schemaVersion); assert.deepEqual(after.recovery, before.recovery);
    h.view.destroy();
});

test('pin guard is atomic after lock wait; row completion remains independent of the pin', async () => {
    for (const change of ['repin', 'unpin', 'edit', 'remove', 'complete']) {
        const h = fixture(), task = await add(h.store, 'same'), other = await add(h.store, 'same'); await pin(h, task);
        const request = command(h.store, 'completePinned', task, { expectedPin: task.id }), gate = deferred();
        const lock = h.backend.lock(() => gate.promise);
        const remote = h.remote.mutate(change === 'repin' ? command(h.remote, 'pin', other, { expectedPin: task.id }) :
            change === 'unpin' ? command(h.remote, 'pin', task, { expectedPin: task.id }) : command(h.remote, change, task, { text: 'new text' }));
        const local = h.store.mutate(request); gate.resolve(); await lock; await remote;
        const before = h.backend.raw(), writes = h.backend.writes;
        await assert.rejects(local, { code: 'CONFLICT' });
        assert.deepEqual(h.backend.raw(), before, change); assert.equal(h.backend.writes, writes, change);
        if (change === 'repin' || change === 'unpin') {
            assert.equal(before.records[0].version, task.version, 'pin-only change deliberately leaves version untouched');
            const result = await h.store.mutate(command(h.store, 'complete', task));
            assert.equal(result.records[0].state, 'done'); assert.equal(result.pinnedId, change === 'repin' ? other.id : null);
        }
    }
});

test('pinned completion requires both expected pin identity and version, allowing unrelated task changes', async () => {
    const h = fixture(), task = await add(h.store, 'same'), other = await add(h.store, 'same'); await pin(h, task);
    for (const values of [{}, { expectedPin: null }, { expectedPin: other.id }, { expectedPin: task.id, version: other.version }, { expectedPin: task.id, id: other.id }]) {
        const before = h.backend.raw(), writes = h.backend.writes;
        await assert.rejects(() => h.store.mutate(command(h.store, 'completePinned', task, values)), { code: 'CONFLICT' });
        assert.deepEqual(h.backend.raw(), before); assert.equal(h.backend.writes, writes);
    }
    await h.remote.mutate(command(h.remote, 'edit', other, { text: 'independent edit' }));
    const result = await h.store.mutate(command(h.store, 'completePinned', task, { expectedPin: task.id }));
    assert.equal(result.records[0].state, 'done'); assert.equal(result.records[1].text, 'independent edit'); assert.equal(result.pinnedId, null);
});

for (const notifications of [true, false]) test(`stale pinned actions refuse remote changes with notifications=${notifications}`, async () => {
    for (const change of ['repin', 'unpin', 'edit', 'remove', 'complete']) {
        const h = await seeded(), other = await add(h.store, 'Pinned task <b>中文</b>'); await settle();
        const old = h.view.nextComplete; old.focus(); h.backend.notifications = notifications;
        await h.remote.mutate(change === 'repin' ? command(h.remote, 'pin', other, { expectedPin: h.task.id }) :
            change === 'unpin' ? command(h.remote, 'pin', h.task, { expectedPin: h.task.id }) : command(h.remote, change, h.task, { text: 'remote edit' }));
        await settle(); const before = h.backend.raw(), writes = h.backend.writes;
        old.dispatch('click'); await settle(); assert.deepEqual(h.backend.raw(), before, change); assert.equal(h.backend.writes, writes, change);
        assert.notEqual(h.document.activeElement, h.view.input, 'remote update/conflict never claims quick-entry focus');
        if (notifications) assert.equal(old.isConnected, false);
        else assert.equal(h.controller.error.code, 'CONFLICT');
        h.view.destroy();
    }
});

test('pending, duplicate, detached and held-key activations cannot complete another task', async () => {
    const h = await seeded(), other = await add(h.store, 'second'); await settle();
    const action = h.view.nextComplete, gate = deferred(), writes = h.backend.writes; h.backend.delay = gate.promise;
    action.focus(); nativeKey(action, ' '); action.dispatch('click'); action.dispatch('click', { detail: 2 });
    assert.equal(action.getAttribute('aria-disabled'), 'true');
    assert(nativeKey(action, 'Enter', true).prevented); assert(nativeKey(action, ' ', true).prevented);
    await tick(); assert.equal(h.backend.writes, writes + 1); gate.resolve(); await settle(); h.backend.delay = null;
    assert.equal(h.backend.writes, writes + 1); assert.equal(h.backend.raw().records[0].state, 'done');
    await pin(h, other); action.dispatch('click'); nativeKey(action, 'Enter', true); await settle();
    assert.equal(h.backend.raw().records[1].state, 'active'); assert.equal(h.backend.raw().pinnedId, other.id);
    h.view.nextComplete.dispatch('click', { detail: 2 }); await settle(); assert.equal(h.backend.raw().records[1].state, 'active');
    h.view.destroy(); h.view.nextComplete.dispatch('click'); await settle(); assert.equal(h.backend.raw().records[1].state, 'active');
});

test('filter, expansion, order, drafts and open sections survive pinned completion', async () => {
    for (const expanded of [false, true]) {
        const h = model(); await settle(); const list = [];
        for (let i = 0; i < 6; i++) list.push(await add(h.store, `Task ${i + 1}`));
        await pin(h, list[4]); if (expanded) h.view.more.dispatch('click');
        const button = h.view.nextComplete; input(h.view.filterInput, 'Task 1');
        assert.equal(h.view.nextComplete, button, 'filter leaves active pin action stable');
        input(h.view.input, 'draft entry'); h.view.edit(list[1]);
        const editor = h.document.querySelector('.tasks-editor'); input(editor, 'draft edit');
        h.view.completed.box.open = true; h.view.removed.box.open = true;
        // Programmatic click models an action that does not own current editor focus.
        editor.focus(); button.dispatch('click'); await settle();
        assert.equal(h.view.filterInput.value, 'Task 1'); assert.equal(h.view.filterQuery, 'task 1'); assert.equal(h.view.expanded, expanded);
        assert.equal(h.view.list.children.length, 1); assert.equal(h.view.input.value, 'draft entry'); assert.equal(editor.value, 'draft edit');
        assert.equal(h.document.activeElement, editor); assert.equal(h.view.completed.box.open, true); assert.equal(h.view.removed.box.open, true);
        assert.deepEqual(h.backend.raw().records.map(t => t.id), list.map(t => t.id));
        h.view.filterClear.dispatch('click'); assert.equal(h.view.list.children.length, expanded ? 5 : 4); h.view.destroy();
    }
});

test('focus moves only after confirmed success; failed/uncertain writes and read-back retry safely', async () => {
    for (const failure of ['write', 'uncertain', 'read', 'verify']) {
        const h = await seeded(), action = h.view.nextComplete, before = h.backend.raw(), writes = h.backend.writes;
        if (failure === 'write') h.backend.fail = true;
        if (failure === 'uncertain') h.backend.failAfterWrite = true;
        if (failure === 'read') h.backend.failVerifyRead = true;
        if (failure === 'verify') h.backend.drop = true;
        action.focus(); action.dispatch('click'); await settle();
        assert.notEqual(h.document.activeElement, h.view.input); assert.equal(h.controller.error.code, { write: 'WRITE', uncertain: 'WRITE', read: 'READ', verify: 'VERIFY' }[failure]); assert.equal(h.view.retry.hidden, false);
        if (failure === 'write' || failure === 'verify') assert.deepEqual(h.backend.raw(), before);
        else { assert.equal(h.backend.raw().records[0].state, 'done'); assert.equal(h.view.nextComplete, null); }
        const request = h.controller.retryCommand; h.backend.fail = false; h.backend.drop = false; h.view.retry.focus();
        assert(nativeKey(h.view.retry, 'Enter', true).prevented); assert(nativeKey(h.view.retry, ' ', true).prevented);
        h.view.retry.dispatch('click', { detail: 2 }); await settle(); assert.equal(h.controller.retryCommand, request);
        nativeKey(h.view.retry, 'Enter'); await settle();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.raw().records[0].state, 'done');
        assert.equal(h.backend.raw().pinnedId, null); assert.equal(h.backend.writes, writes + (failure === 'write' || failure === 'verify' ? 2 : 1));
        assert.equal(h.document.activeElement, h.view.input); assert.equal(h.controller.retryCommand, null);
        assert.equal(h.document.listeners.size, 0, 'temporary focus ownership listeners are released'); h.view.destroy();
    }
});

for (const change of ['repin', 'unpin', 'edit', 'remove', 'complete']) test(`failed pinned completion retry cannot override remote ${change}`, async () => {
    const h = await seeded(), other = await add(h.store, 'other'); await settle(); h.backend.fail = true;
    h.view.nextComplete.focus(); h.view.nextComplete.dispatch('click'); await settle(); h.backend.fail = false;
    await h.remote.mutate(change === 'repin' ? command(h.remote, 'pin', other, { expectedPin: h.task.id }) :
        change === 'unpin' ? command(h.remote, 'pin', h.task, { expectedPin: h.task.id }) : command(h.remote, change, h.task, { text: 'latest' }));
    await settle(); const before = h.backend.raw(), writes = h.backend.writes;
    h.view.retry.focus(); await h.view.retryLast(); await settle();
    assert.deepEqual(h.backend.raw(), before); assert.equal(h.backend.writes, writes); assert.equal(h.controller.error.code, 'CONFLICT');
    assert.notEqual(h.document.activeElement, h.view.input); h.view.destroy();
});

for (const change of ['focus', 'focus-away-back', 'body-focus', 'pointer', 'key', 'hidden', 'hidden-return', 'detached', 'destroy', 'newer-state', 'dialog']) test(`confirmed pinned completion respects newer ${change} ownership`, async () => {
    const h = await seeded(), action = h.view.nextComplete, gate = deferred(); h.backend.delay = gate.promise;
    action.focus(); action.dispatch('click'); await tick();
    assert.equal(h.document.activeElement, action, 'pending action remains mounted and focusable');
    if (change === 'focus') focus(h, h.search);
    if (change === 'focus-away-back') { focus(h, h.search); focus(h, action); }
    if (change === 'body-focus') focus(h, h.document.body);
    if (change === 'pointer') docEvent(h, 'pointerdown');
    if (change === 'key') docEvent(h, 'keydown', { key: 'Tab' });
    if (change === 'hidden') h.document.hidden = true;
    if (change === 'hidden-return') { h.document.hidden = true; docEvent(h, 'visibilitychange'); h.document.hidden = false; }
    if (change === 'detached') h.host.remove();
    if (change === 'destroy') h.view.destroy();
    if (change === 'dialog') { h.view.edit(h.task); focus(h, h.document.querySelector('.tasks-editor')); }
    if (change === 'newer-state') {
        // A controller may have observed a later remote revision before this promise settles.
        // This action is already running. Inject the later observation on its final emit.
        const off = h.controller.subscribe(() => {
            if (h.controller.status === 'saved' && !h.controller.pending) {
                off(); h.controller.state = { ...h.controller.state, revision: h.controller.state.revision + 1,
                    receipts: [...h.controller.state.receipts, 'remote_operation'] }; h.view.render();
            }
        });
    }
    gate.resolve(); await settle(); assert.equal(h.backend.raw().records[0].state, 'done');
    assert.notEqual(h.document.activeElement, h.view.input); assert.equal(h.document.listeners.size, 0);
    h.view.destroy();
});

test('an unrelated remote revision preserves the current Next up control without stealing focus', async () => {
    const h = await seeded(), action = h.view.nextComplete; action.focus(); await add(h.remote, 'remote new task'); await settle();
    assert.equal(h.view.nextComplete, action); assert.equal(h.document.activeElement, action); assert.equal(h.backend.raw().records[0].state, 'active');
    h.search.focus(); action.dispatch('click'); await settle(); assert.equal(h.document.activeElement, h.search); h.view.destroy();
});

test('an unobserved remote commit queued before completion may save but cannot reclaim focus', async () => {
    const h = await seeded(), gate = deferred(), action = h.view.nextComplete;
    const locked = h.backend.lock(() => gate.promise);
    const remote = add(h.remote, 'queued independent change');
    action.focus(); action.dispatch('click'); gate.resolve(); await locked; await remote; await settle();
    assert.equal(h.backend.raw().records[0].state, 'done'); assert.equal(h.backend.raw().records[1].text, 'queued independent change');
    assert.notEqual(h.document.activeElement, h.view.input); h.view.destroy();
});
