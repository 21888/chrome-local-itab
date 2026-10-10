const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { createDocument } = require('./helpers/task-dom-model.js');
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
const row = (h, id) => h.host.querySelectorAll('[data-task-id]').find(node => node.dataset.taskId === id);
const named = (parent, text) => parent.querySelectorAll('button').find(node => node.textContent === text);
const complete = (h, pinned) => pinned ? h.view.nextComplete.dispatch('click') : row(h, h.task.id).querySelector('.tasks-check').dispatch('click');

for (const locale of ['en', 'zh_CN']) for (const pinned of [false, true]) test(`completion Undo reopens exact identity, keeps draft/filter/focus and newer pin (${locale}, pinned=${pinned})`, async () => {
    const h = await seeded(locale), other = await add(h.store, h.task.text); await settle();
    input(h.view.input, 'draft'); h.view.edit(other); const editor = h.document.querySelector('.tasks-editor'); input(editor, 'edit draft');
    editor.focus(); complete(h, pinned); await settle();
    const done = h.backend.raw().records[0];
    assert.equal(h.view.undo.id, h.task.id); assert.equal(h.view.undo.version, done.version);
    assert.equal(h.view.undoButton.hidden, false); assert.equal(h.view.undoButton.textContent, locale === 'en' ? 'Undo completion' : '撤销完成');
    await pin(h, other); input(h.view.filterInput, 'no matches');
    h.view.undoButton.dispatch('click'); h.view.undoButton.dispatch('click'); await settle();
    const saved = h.backend.raw(); assert.equal(saved.records[0].state, 'active'); assert.equal(saved.records[1].state, 'active');
    assert.equal(saved.pinnedId, other.id); assert.equal(h.view.undoButton.hidden, true);
    assert.equal(h.view.input.value, 'draft'); assert.equal(editor.value, 'edit draft'); assert.equal(h.document.activeElement, editor);
    assert.equal(h.view.filterQuery, 'no matches'); assert.equal(h.view.completed.box.open, false); h.view.destroy();
});

for (const notifications of [false, true]) for (const change of ['edit', 'remove', 'reopen']) test(`Undo refuses changed completion (${change}, notifications=${notifications})`, async () => {
    const h = await seeded(); complete(h, true); await settle(); const done = h.backend.raw().records[0];
    h.backend.notifications = notifications;
    await h.remote.mutate(command(h.remote, change, done, { text: 'remote edit' })); await settle();
    const before = h.backend.raw(), writes = h.backend.writes;
    h.view.undoButton.dispatch('click'); await settle(); assert.deepEqual(h.backend.raw(), before); assert.equal(h.backend.writes, writes);
    if (notifications) assert.equal(h.view.undoButton.hidden, true); else assert.equal(h.controller.error.code, 'CONFLICT'); h.view.destroy();
});

for (const pinned of [false, true]) for (const failure of ['fail', 'failAfterWrite', 'failVerifyRead', 'drop']) test(`unconfirmed completion offers no Undo or silent replay (${failure}, pinned=${pinned})`, async () => {
    const h = await seeded(); h.backend[failure] = true; complete(h, pinned); await settle();
    assert.equal(h.view.undo, null); assert.equal(h.view.undoButton.hidden, true); assert.equal(h.view.retry.hidden, false);
    const request = h.controller.retryCommand, writes = h.backend.writes; await settle(); assert.equal(h.backend.writes, writes);
    h.backend[failure] = false; await h.view.retryLast(); await settle();
    assert.equal(h.view.undoButton.hidden, false); assert.equal(h.view.undo.state, 'done'); assert.equal(h.view.undo.version, h.backend.raw().records[0].version);
    assert.equal(h.backend.raw().receipts.at(-1), request.operationId); h.view.destroy();
});

for (const change of ['none', 'edit']) test(`uncertain Undo only retries original command and cannot overwrite ${change}`, async () => {
    const h = await seeded(); complete(h, true); await settle(); h.backend.failAfterWrite = true;
    h.view.undoButton.dispatch('click'); await settle(); const request = h.controller.retryCommand, writes = h.backend.writes;
    assert.equal(h.view.undoButton.hidden, true); assert.equal(h.backend.raw().records[0].state, 'active');
    if (change === 'edit') await h.remote.mutate(command(h.remote, 'edit', h.backend.raw().records[0], { text: 'new remote text' }));
    const before = h.backend.raw(); await h.view.retryLast(); await settle();
    assert.deepEqual(h.backend.raw(), before); assert.equal(h.backend.writes, writes + (change === 'edit' ? 1 : 0));
    assert.equal(h.controller.error?.code, change === 'edit' ? 'CONFLICT' : undefined);
    if (change === 'none') assert.equal(h.view.undo, null); else assert.equal(h.controller.retryCommand.operationId, request.operationId);
    h.view.destroy();
});

test('latest completion/removal share one Undo slot and restoring a removed completed task keeps it completed', async () => {
    const h = await seeded(), other = await add(h.store, 'other'); await settle();
    complete(h, true); await settle(); named(row(h, other.id), 'Remove').dispatch('click'); await settle();
    assert.equal(h.view.undo.id, other.id); assert.equal(h.view.undoButton.textContent, 'Undo removal');
    h.view.undoButton.dispatch('click'); await settle(); assert.equal(h.backend.raw().records[1].state, 'active');
    named(row(h, h.task.id), 'Remove').dispatch('click'); await settle(); h.view.undoButton.dispatch('click'); await settle();
    assert.equal(h.backend.raw().records[0].state, 'done'); assert.equal(h.view.undoButton.hidden, true);
    row(h, other.id).querySelector('.tasks-check').dispatch('click'); await settle(); assert.equal(h.view.undo.id, other.id); h.view.destroy();
});

for (const first of ['complete', 'undo', 'retry']) test(`a newer action started during final notification keeps its Undo/retry ownership (${first})`, async () => {
    const h = await seeded(), other = await add(h.store, 'other'); await settle();
    if (first === 'undo') { complete(h, true); await settle(); }
    if (first === 'retry') { h.backend.fail = true; complete(h, true); await settle(); h.backend.fail = false; }
    const off = h.controller.subscribe(() => {
        if (h.controller.status !== 'saved' || h.controller.pending) return;
        off(); h.backend.fail = true;
        h.view.perform(command(h.store, 'remove', other));
    });
    if (first === 'undo') h.view.undoButton.dispatch('click'); else if (first === 'retry') await h.view.retryLast(); else complete(h, true);
    await settle(); const request = h.controller.retryCommand;
    assert.equal(request.kind, 'remove'); assert.equal(h.view.retryEffectOperationId, request.operationId); assert.equal(h.view.retry.hidden, false);
    h.backend.fail = false; await h.view.retryLast(); await settle();
    assert.equal(h.view.undo.id, other.id); assert.equal(h.view.undo.state, 'removed'); h.view.destroy();
});

test('late completion never captures a remotely edited result or restores Undo after destroy', async () => {
    for (const destroy of [false, true]) {
        const h = await seeded();
        const off = h.controller.subscribe(() => {
            if (h.controller.status !== 'saved' || h.controller.pending) return;
            off();
            if (destroy) h.view.destroy();
            else { h.controller.state = structuredClone(h.controller.state); h.controller.state.revision++; h.controller.state.records[0].version = 'remote-version'; h.view.render(); }
        });
        complete(h, true); await settle(); assert.equal(h.view.undo, null); h.view.destroy();
    }
});

test('success callback starting a newer action retains that action’s retry effect', async () => {
    const h = await seeded(), other = await add(h.store, 'other'); await settle();
    let completed = 0;
    await h.view.perform(command(h.store, 'complete', h.task), () => {
        h.backend.fail = true;
        h.view.perform(command(h.store, 'remove', other), () => { completed++; });
    });
    await settle(); assert.equal(h.controller.retryCommand.kind, 'remove');
    h.backend.fail = false; await h.view.retryLast(); await settle();
    assert.equal(completed, 1); assert.equal(h.view.undo.id, other.id); h.view.destroy();
});
