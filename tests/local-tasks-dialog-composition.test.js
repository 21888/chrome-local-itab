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

function model() {
    let raw, queue = Promise.resolve(); const listeners = new Set();
    const backend = {
        delay: null, writes: 0, fail: false, failAfter: false,
        lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() { return raw && structuredClone(raw); },
        async write(value) {
            backend.writes++; if (backend.delay) await backend.delay; if (backend.fail) return false;
            raw = structuredClone(value); listeners.forEach(fn => fn());
            if (backend.failAfter) { backend.failAfter = false; throw Error('Uncertain acknowledgement'); }
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        raw: () => raw && structuredClone(raw)
    };
    const store = new tasks.Store(backend), controller = new Controller(store);
    const document = createDocument({ blurUnavailableFocus: true });
    const host = document.createElement('article'), search = document.createElement('input'); document.body.append(search, host); search.focus();
    const api = { ...tasks, Controller }, window = { LocalItabTasks: api };
    const context = vm.createContext({ window, document, crypto: webcrypto, setTimeout, URL, Blob, console });
    for (const file of ['dialog-focus', 'local-tasks-view']) vm.runInContext(fs.readFileSync(`shared/${file}.js`, 'utf8'), context);
    const view = api.mount(host, { controller, alwaysVisible: true });
    return { backend, store, controller, document, host, search, view };
}
const modal = h => h.document.querySelector('.tasks-dialog');
const editor = h => modal(h)?.querySelector('.tasks-editor');
const button = (h, label) => modal(h).querySelectorAll('button').find(node => node.textContent.startsWith(label));
const click = (h, label) => { const node = button(h, label); assert(node, label); node.dispatch('click'); return node; };
const input = (node, value) => { node.value = value; node.dispatch('input'); };
async function open(h, kind) {
    await settle();
    if (kind === 'edit') { await h.controller.action('add', { text: 'original' }); await settle(); h.view.edit(h.controller.state.records[0]); }
    else h.view.addBatch();
    input(editor(h), kind === 'edit' ? 'submitted edit' : 'one\ntwo');
    if (kind === 'batch') { click(h, 'Review tasks'); await settle(); }
}

for (const kind of ['edit', 'batch']) test(`${kind}: a new composition before text input owns the dialog across an older save`, async () => {
    const h = model(); await open(h, kind); const field = editor(h), gate = deferred(); h.backend.delay = gate.promise;
    click(h, kind === 'edit' ? 'Save task' : 'Add reviewed tasks');
    field.focus(); field.dispatch('compositionstart');
    gate.resolve(); await settle();
    assert.ok(editor(h) === field, 'the older save must not dismiss a newer composition before its first input');
    assert.equal(h.document.activeElement, field); assert.equal(h.view.hasUncommittedWork(), true);
    assert.deepEqual(h.backend.raw().records.map(task => task.text), kind === 'edit' ? ['submitted edit'] : ['one', 'two']);
    input(field, '新的草稿'); field.dispatch('compositionend');
    h.backend.delay = null;
    if (kind === 'batch') { click(h, 'Review tasks'); await settle(); }
    click(h, kind === 'edit' ? 'Save task' : 'Add reviewed tasks'); await settle();
    assert.deepEqual(h.backend.raw().records.map(task => task.text), kind === 'edit' ? ['新的草稿'] : ['one', 'two', '新的草稿']);
    assert.equal(modal(h), null); h.view.destroy();
});

test('batch: starting composition invalidates a prior numbered review before first text input', async () => {
    const h = model(); await open(h, 'batch'); const field = editor(h), preview = modal(h).querySelector('.tasks-batch-preview');
    field.dispatch('compositionstart');
    assert.equal(preview.hidden, true, 'an earlier review must not remain attached to a newly owned draft');
    field.dispatch('compositionend');
    assert.equal(button(h, 'Add reviewed tasks').hidden, true);
    click(h, 'Add reviewed tasks'); await settle(); assert.equal(h.backend.writes, 0);
    click(h, 'Review tasks'); await settle(); assert.equal(button(h, 'Add reviewed tasks').hidden, false); h.view.destroy();
});

test('batch: a pending review cannot publish after a new composition starts before text input', async () => {
    const h = model(); await settle(); h.view.addBatch(); input(editor(h), 'one\ntwo');
    const original = h.store.reviewBatch.bind(h.store), gate = deferred();
    h.store.reviewBatch = async source => { const value = await original(source); await gate.promise; return value; };
    click(h, 'Review tasks'); await tick(); const field = editor(h); field.dispatch('compositionstart');
    gate.resolve(); await settle();
    assert.equal(modal(h).querySelector('.tasks-batch-preview').hidden, true, 'the earlier review callback must not attach a preview to the composition');
    field.dispatch('compositionend'); assert.equal(button(h, 'Review tasks').disabled, false);
    assert.equal(button(h, 'Add reviewed tasks').hidden, true); assert.equal(h.backend.writes, 0); h.view.destroy();
});

for (const kind of ['edit', 'batch']) for (const boundary of ['end', 'blur']) test(`${kind}: composition ${boundary} without input still fences an older save`, async () => {
    const h = model(); await open(h, kind); const field = editor(h), original = field.value, gate = deferred(); h.backend.delay = gate.promise;
    click(h, kind === 'edit' ? 'Save task' : 'Add reviewed tasks'); field.dispatch('compositionstart');
    if (boundary === 'end') field.dispatch('compositionend');
    else { button(h, 'Cancel').focus(); field.dispatch('focusout'); }
    const focus = h.document.activeElement; gate.resolve(); await settle();
    assert.ok(editor(h) === field, 'ending or cancelling composition cannot restore the older save’s ownership');
    assert.equal(field.value, original); assert.equal(h.document.activeElement, focus); assert.equal(h.view.hasUncommittedWork(), true);
    assert.deepEqual(h.backend.raw().records.map(task => task.text), kind === 'edit' ? ['submitted edit'] : ['one', 'two']);
    click(h, 'Cancel'); assert.equal(modal(h), null); assert.equal(h.view.hasUncommittedWork(), false); h.view.destroy();
});

for (const kind of ['edit', 'batch']) test(`${kind}: a truly unchanged dialog still closes after its own confirmed save`, async () => {
    const h = model(); await open(h, kind);
    click(h, kind === 'edit' ? 'Save task' : 'Add reviewed tasks'); await settle();
    assert.equal(modal(h), null); assert.equal(h.view.hasUncommittedWork(), false);
    assert.deepEqual(h.backend.raw().records.map(task => task.text), kind === 'edit' ? ['submitted edit'] : ['one', 'two']); h.view.destroy();
});

for (const kind of ['edit', 'batch']) for (const failure of ['write', 'uncertain']) test(`${kind}: a new composition fences an exact ${failure} retry result`, async () => {
    const h = model(); await open(h, kind); const initialWrites = h.backend.writes;
    h.backend[failure === 'write' ? 'fail' : 'failAfter'] = true;
    click(h, kind === 'edit' ? 'Save task' : 'Add reviewed tasks'); await settle();
    const command = h.controller.retryCommand; assert(command);
    h.backend.fail = false; const field = editor(h), gate = deferred(); h.backend.delay = gate.promise;
    click(h, kind === 'edit' ? 'Save task' : 'Retry previous add');
    assert.equal(h.controller.retryCommand, command, 'the retry must keep the exact failed operation');
    field.focus(); field.dispatch('compositionstart'); gate.resolve(); await settle();
    assert.ok(editor(h) === field, 'the retry result cannot close the newer composition');
    assert.equal(h.document.activeElement, field); assert.equal(h.controller.retryCommand, null);
    assert.deepEqual(h.backend.raw().records.map(task => task.text), kind === 'edit' ? ['submitted edit'] : ['one', 'two']);
    assert.equal(h.backend.writes - initialWrites, failure === 'write' ? 2 : 1, 'acknowledged uncertain writes must not repeat');
    if (kind === 'batch') assert.equal(modal(h).querySelector('.tasks-batch-preview').hidden, true);
    field.dispatch('compositionend'); click(h, 'Cancel'); assert.equal(h.view.hasUncommittedWork(), false); h.view.destroy();
});

for (const failure of ['write', 'uncertain']) test(`batch: composition preserves the previous immutable ${failure} batch until retry resolves`, async () => {
    const h = model(); await open(h, 'batch'); const field = editor(h), gate = deferred(); h.backend.delay = gate.promise;
    h.backend[failure === 'write' ? 'fail' : 'failAfter'] = true;
    click(h, 'Add reviewed tasks'); const command = h.controller.retryCommand; field.dispatch('compositionstart');
    gate.resolve(); await settle();
    assert.ok(editor(h) === field); assert.equal(button(h, 'Retry previous add').disabled, true);
    assert.deepEqual(modal(h).querySelector('.tasks-batch-preview').querySelector('ol').children.map(node => node.textContent), ['one', 'two']);
    field.dispatch('compositionend'); assert.equal(button(h, 'Review tasks').disabled, true);
    const writes = h.backend.writes; click(h, 'Review tasks'); await settle(); assert.equal(h.backend.writes, writes);
    h.backend.fail = false; h.backend.delay = null; click(h, 'Retry previous add'); assert.equal(h.controller.retryCommand, command); await settle();
    assert.ok(editor(h) === field); assert.equal(field.value, 'one\ntwo'); assert.equal(h.view.hasUncommittedWork(), true);
    assert.equal(modal(h).querySelector('.tasks-batch-preview').hidden, true); assert.equal(button(h, 'Add reviewed tasks').hidden, true);
    assert.deepEqual(h.backend.raw().records.map(task => task.text), ['one', 'two']);
    click(h, 'Cancel'); h.view.destroy();
});

for (const kind of ['edit', 'batch']) for (const boundary of ['cancel-reopen', 'destroy']) test(`${kind}: ${boundary} retires composition and late save ownership`, async () => {
    const h = model(); await open(h, kind); const old = editor(h), gate = deferred(); h.backend.delay = gate.promise;
    click(h, kind === 'edit' ? 'Save task' : 'Add reviewed tasks'); old.dispatch('compositionstart');
    if (boundary === 'destroy') h.view.destroy();
    else {
        old.dispatch('compositionend'); click(h, 'Cancel');
        if (kind === 'edit') h.view.edit(h.controller.state.records[0]); else h.view.addBatch();
        input(editor(h), 'reopened draft');
    }
    const current = editor(h), focus = h.document.activeElement; gate.resolve(); await settle();
    old.dispatch('compositionstart'); old.dispatch('compositionend');
    assert.ok(editor(h) === current); assert.equal(h.document.activeElement, focus);
    if (current) { assert.equal(current.value, 'reopened draft'); current.dispatch('keydown', { key: 'Escape' }); assert.equal(modal(h), null); }
    assert.deepEqual(h.backend.raw().records.map(task => task.text), kind === 'edit' ? ['submitted edit'] : ['one', 'two']); h.view.destroy();
});

for (const outcome of ['ready', 'read-error']) test(`batch: late old review ${outcome} cannot replace a post-composition review`, async () => {
    const h = model(); await settle(); h.view.addBatch(); input(editor(h), 'one\ntwo');
    const original = h.store.reviewBatch.bind(h.store), gate = deferred(); let first = true;
    h.store.reviewBatch = async source => {
        const value = await original(source);
        if (first) { first = false; await gate.promise; if (outcome === 'read-error') throw tasks.fault('READ'); }
        return value;
    };
    click(h, 'Review tasks'); await tick(); const field = editor(h); field.dispatch('compositionstart'); field.dispatch('compositionend');
    assert.equal(button(h, 'Review tasks').disabled, false, 'a fresh explicit review must not wait for the obsolete callback');
    click(h, 'Review tasks'); await settle(); const feedback = modal(h).querySelector('.tasks-dialog-feedback').textContent;
    gate.resolve(); await settle();
    assert.deepEqual(modal(h).querySelector('.tasks-batch-preview').querySelector('ol').children.map(node => node.textContent), ['one', 'two']);
    assert.equal(modal(h).querySelector('.tasks-dialog-feedback').textContent, feedback);
    assert.equal(button(h, 'Add reviewed tasks').hidden, false); assert.equal(h.backend.writes, 0); h.view.destroy();
});

for (const timing of ['pending', 'after-failure']) test(`edit: composition ${timing} preserves version conflict after an uncertain save`, async () => {
    const h = model(); await open(h, 'edit'); const field = editor(h), gate = deferred(); h.backend.delay = gate.promise; h.backend.failAfter = true;
    click(h, 'Save task'); const oldCommand = h.controller.retryCommand;
    if (timing === 'pending') { field.dispatch('compositionstart'); field.dispatch('compositionend'); }
    gate.resolve(); await settle();
    if (timing === 'after-failure') { field.dispatch('compositionstart'); field.dispatch('compositionend'); }
    assert.ok(editor(h) === field); assert.equal(h.controller.retryCommand, oldCommand);
    const saved = h.backend.raw(), writes = h.backend.writes; h.backend.delay = null;
    click(h, 'Save task'); await settle();
    assert.ok(editor(h) === field, 'new composition must not silently reuse an older uncertain edit');
    assert.equal(h.controller.error.code, 'CONFLICT'); assert.notEqual(h.controller.retryCommand.operationId, oldCommand.operationId);
    assert.equal(h.backend.writes, writes); assert.deepEqual(h.backend.raw(), saved);
    assert.match(modal(h).querySelector('.tasks-latest').textContent, /submitted edit/);
    input(field, 'reviewed newer edit'); click(h, 'Replace latest with my edit'); await settle();
    assert.equal(modal(h), null); assert.equal(h.backend.writes, writes + 1);
    assert.deepEqual(h.backend.raw().records.map(task => task.text), ['reviewed newer edit']); h.view.destroy();
});
