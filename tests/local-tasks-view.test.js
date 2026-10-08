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
function model(options = {}) {
    let raw, queue = Promise.resolve(); const listeners = new Set();
    const b = { fail: false, delay: null, failRead: options.failRead,
        lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() { if (b.failRead) throw new Error("Storage unavailable"); return raw && structuredClone(raw); },
        async write(value) { if (b.delay) await b.delay; if (b.fail) return false; raw = structuredClone(value); listeners.forEach(fn => fn()); },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, raw: () => raw
    };
    const store = new tasks.Store(b), controller = new Controller(store);
    const document = createDocument(), host = document.createElement('article'), search = document.createElement('input');
    document.body.append(search, host); search.focus();
    const api = { ...tasks, Controller }, window = { LocalItabTasks: api };
    const context = vm.createContext({ window, document, crypto: webcrypto, setTimeout, URL, Blob, console });
    const dialogPath = path.resolve(__dirname, '../shared/dialog-focus.js');
    vm.runInContext(fs.readFileSync(fs.existsSync(dialogPath) ? dialogPath : path.resolve(__dirname, '../source-model/shared/dialog-focus.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../shared/local-tasks-view.js'), 'utf8'), context);
    const view = api.mount(host, { controller, alwaysVisible: options.alwaysVisible ?? true, onVisibility: options.onVisibility });
    return { b, store, controller, document, host, search, api, view };
}
const button = (parent, text) => parent.querySelectorAll('button').find(node => node.textContent === text);
const click = (parent, text) => { const node = button(parent, text); assert(node, `button ${text}`); node.dispatch('click'); return node; };
const setInput = (input, value) => { input.value = value; input.dispatch('input'); };
const modal = h => h.document.querySelector('.tasks-dialog');
const editor = h => h.document.querySelector('.tasks-editor');
async function seed(h, text = 'first') { await h.controller.action('add', { text }); await settle(); return h.controller.state.records.at(-1); }

test('DOM model: mount reuse, no search focus steal, IME/Enter/repeat and text-safe rendering', async () => {
    const h = model(); await settle(); assert.equal(h.document.activeElement, h.search); assert.equal(h.api.mount(h.host), h.view);
    setInput(h.view.input, '<img src=x onerror=alert(1)> 中文');
    h.view.input.dispatch('keydown', { key: 'Enter', isComposing: true }); await settle(); assert.equal(h.controller.state.records.length, 0);
    h.view.input.dispatch('keydown', { key: 'Enter', isComposing: false }); h.view.input.dispatch('keydown', { key: 'Enter', repeat: true }); await settle();
    assert.equal(h.controller.state.records.length, 1); assert.equal(h.view.input.value, '');
    const text = h.host.querySelector('.tasks-text'); assert.equal(text.textContent, '<img src=x onerror=alert(1)> 中文'); assert.equal(text.children.length, 0);
    h.view.destroy();
});

test('DOM model: late add preserves newer draft/focus; failed add retries exact request once', async () => {
    const h = model(); await settle(); const wait = deferred(); h.b.delay = wait.promise;
    setInput(h.view.input, 'submitted'); h.view.add(); setInput(h.view.input, 'newer draft'); h.view.input.focus();
    assert.equal(h.view.hasUncommittedWork(), true); wait.resolve(); await settle();
    assert.equal(h.view.input.value, 'newer draft'); assert.equal(h.document.activeElement, h.view.input);
    h.b.delay = null; h.b.fail = true; h.view.add(); await settle(); assert.equal(h.view.input.value, 'newer draft'); assert.equal(h.controller.status, 'error');
    h.b.fail = false; await h.view.retryLast(); await settle(); assert.equal(h.controller.state.records.length, 2); assert.equal(h.view.input.value, '');
    h.view.destroy();
});

test('DOM model: failed late edit never reuses an older command over newer draft', async () => {
    const h = model(); await settle(); const task = await seed(h); h.view.edit(task);
    const input = editor(h); setInput(input, 'submitted edit'); const wait = deferred(); h.b.delay = wait.promise; h.b.fail = true;
    click(modal(h), 'Save task'); setInput(input, 'newer edit'); wait.resolve(); await settle();
    assert.equal(editor(h).value, 'newer edit'); h.b.delay = null; h.b.fail = false;
    click(modal(h), 'Save task'); await settle(); assert.equal(h.controller.state.records[0].text, 'newer edit'); assert.equal(modal(h), null);
    h.view.destroy();
});

test('DOM model: old dismissed save cannot close/focus a new edit; guards clear on Escape', async () => {
    const h = model(); await settle(); const task = await seed(h); h.view.edit(task);
    const input = editor(h); setInput(input, 'first edit'); const wait = deferred(); h.b.delay = wait.promise;
    click(modal(h), 'Save task'); h.document.querySelector('.tasks-overlay').dispatch('keydown', { key: 'Escape' });
    assert.equal(h.view.dialogs.size, 0); assert.equal(h.view.hasUncommittedWork(), true, 'pending save still guards reload');
    h.view.edit(task); const newInput = editor(h); setInput(newInput, 'second draft'); newInput.focus();
    wait.resolve(); await settle(); assert.equal(editor(h), newInput); assert.equal(newInput.value, 'second draft'); assert.equal(h.document.activeElement, newInput);
    h.document.querySelector('.tasks-overlay').dispatch('keydown', { key: 'Escape' }); assert.equal(h.view.hasUncommittedWork(), false);
    h.view.destroy();
});

test('DOM model: overwrite is bound to the exact displayed conflict version', async () => {
    const h = model(); await settle(); const task = await seed(h); h.view.edit(task); setInput(editor(h), 'my draft');
    await h.store.mutate(h.store.request('edit', { id: task.id, version: task.version, text: 'remote A' })); await settle();
    click(modal(h), 'Save task'); await settle(); assert.match(modal(h).querySelector('.tasks-latest').textContent, /remote A/);
    const latest = (await h.store.read()).records[0]; await h.store.mutate(h.store.request('edit', { id: latest.id, version: latest.version, text: 'remote B' })); await settle();
    click(modal(h), 'Replace latest with my edit'); await settle(); assert.equal((await h.store.read()).records[0].text, 'remote B');
    assert.match(modal(h).querySelector('.tasks-latest').textContent, /remote B/);
    click(modal(h), 'Replace latest with my edit'); await settle(); assert.equal((await h.store.read()).records[0].text, 'my draft');
    h.view.destroy();
});

test('DOM model: stale detached pin cannot bless a newer pin', async () => {
    const h = model(); await settle(); const one = await seed(h, 'one'), two = await seed(h, 'two');
    const oldButton = button(h.host.querySelectorAll('[data-task-id]').find(node => node.dataset.taskId === one.id), 'Pin next');
    await h.controller.action('pin', { id: two.id, version: two.version, expectedPin: null }); await settle();
    oldButton.dispatch('click'); await settle(); assert.equal(h.controller.state.pinnedId, two.id); assert.equal(h.controller.error.code, 'CONFLICT');
    h.view.destroy();
});

test('DOM model: delayed old import cannot open a second dialog or replace an editor', async () => {
    const h = model(); await settle(); const task = await seed(h), source = await h.store.export(), slow = deferred();
    h.view.fileInput.files = [{ size: source.length, text: () => slow.promise }]; const first = h.view.importFile();
    h.view.fileInput.files = [{ size: source.length, text: async () => source }]; await h.view.importFile();
    assert.equal(h.view.dialogs.size, 1); slow.resolve(source); await first; assert.equal(h.document.querySelectorAll('.tasks-dialog').length, 1);
    click(modal(h), 'Cancel'); assert.equal(h.view.dialogs.size, 0); assert.equal(h.controller.state.recovery.length, 0);
    const pending = deferred(); h.view.fileInput.files = [{ size: source.length, text: () => pending.promise }]; const load = h.view.importFile();
    h.view.edit(task); pending.resolve(source); await load; assert(editor(h)); assert.equal(h.view.dialogs.size, 1);
    h.view.destroy();
});

test('DOM model: dialog retry cannot consume another draft’s success callback; cancellation clears only its own failure', async () => {
    const h = model(); await settle(); const task = await seed(h); setInput(h.view.input, 'unsaved quick draft'); h.b.fail = true;
    h.view.add(); await settle(); assert.equal(h.view.input.value, 'unsaved quick draft');
    h.view.edit(task); setInput(editor(h), 'unsaved edit'); click(modal(h), 'Save task'); await settle();
    assert.equal(h.view.retry.hidden, true, 'page retry must not take over a dialog-owned edit');
    click(modal(h), 'Cancel'); assert.equal(h.controller.retryCommand, null); assert.equal(h.view.input.value, 'unsaved quick draft');
    assert.equal(h.view.hasUncommittedWork(), true); h.view.destroy();
});

test('DOM model: uncertain edit retry after newer commit preserves draft and opens conflict review', async () => {
    const h = model(); await settle(); const task = await seed(h); h.view.edit(task); setInput(editor(h), 'uncertain editor draft');
    const write = h.b.write; let failOnce = true;
    h.b.write = async value => { await write(value); if (failOnce) { failOnce = false; throw new Error('uncertain'); } };
    click(modal(h), 'Save task'); await settle(); assert.equal(editor(h).value, 'uncertain editor draft');
    const latest = (await h.store.read()).records[0]; await h.store.mutate(h.store.request('edit', { id: latest.id, version: latest.version, text: 'newest remote text' })); await settle();
    click(modal(h), 'Save task'); await settle(); assert(editor(h)); assert.equal(editor(h).value, 'uncertain editor draft');
    assert.match(modal(h).querySelector('.tasks-latest').textContent, /newest remote text/); assert.equal((await h.store.read()).records[0].text, 'newest remote text');
    h.view.destroy();
});


test('DOM model: initial read error exposes retry without persisting visibility', async () => {
    const visibility = [], h = model({ alwaysVisible: false, failRead: true, onVisibility: value => visibility.push(value) });
    await settle(); assert.equal(h.controller.error.code, 'READ'); assert.equal(h.host.hidden, false); assert.equal(h.view.retry.hidden, false);
    assert.equal(visibility.at(-1), true); assert.equal(h.b.raw(), undefined);
    h.b.failRead = false; await h.view.retryLast(); await settle(); assert.equal(h.host.hidden, true); assert.equal(visibility.at(-1), false); assert.equal(h.b.raw(), undefined);
    h.view.destroy();
});

test('DOM model: completion focuses visible input rather than closed completed section', async () => {
    const h = model(); await settle(); await seed(h);
    const complete = button(h.host, '○'); complete.focus(); complete.dispatch('click'); await settle();
    assert.ok(h.document.activeElement === h.view.input, 'focus returns to visible quick entry'); assert.equal(h.view.completed.box.open, false);
    h.view.destroy();
});

test('DOM model: Actions summary keeps focus on unrelated revision update', async () => {
    const h = model(); await settle(); const task = await seed(h);
    h.host.querySelector('.tasks-row-menu summary').focus(); await h.controller.action('add', { text: 'independent change' }); await settle();
    assert.equal(h.document.activeElement.tagName, 'SUMMARY'); assert.equal(h.document.activeElement.closest('[data-task-id]').dataset.taskId, task.id);
    h.view.destroy();
});
