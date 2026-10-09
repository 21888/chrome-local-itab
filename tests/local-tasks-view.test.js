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

test('DOM model: local filter finds all states beyond the preview, treats text literally and never writes', async () => {
    const h = model(); await settle();
    for (let i = 0; i < 5; i++) await seed(h, `other ${i}`);
    const active = await seed(h, 'Plan <b>中文</b>'), done = await seed(h, 'PLAN finished'), removed = await seed(h, 'plan removed');
    await h.controller.action('complete', { id: done.id, version: done.version });
    await h.controller.action('remove', { id: removed.id, version: removed.version });
    await h.controller.action('pin', { id: active.id, version: active.version, expectedPin: null }); await settle();
    const before = structuredClone(h.b.raw());
    h.view.filterInput.focus(); setInput(h.view.filterInput, '  PLAN  ');
    assert.equal(h.view.list.querySelectorAll('[data-task-id]').length, 1);
    assert.equal(h.view.list.querySelector('[data-task-id]').dataset.taskId, active.id);
    assert.equal(h.view.completed.summary.textContent, 'Completed (1)'); assert.equal(h.view.removed.summary.textContent, 'Removed (1)');
    assert.equal(h.view.filterStatus.textContent, 'Matching tasks: 3'); assert.equal(h.view.more.hidden, true);
    assert.equal(h.document.activeElement, h.view.filterInput); assert.equal(h.view.hasUncommittedWork(), false);
    setInput(h.view.filterInput, '<b>中文</b>'); assert.equal(h.view.list.querySelectorAll('[data-task-id]').length, 1);
    assert.equal(h.view.list.querySelector('.tasks-text').children.length, 0);
    setInput(h.view.filterInput, '.*'); assert.equal(h.view.list.children.length, 0); assert.match(h.view.filterStatus.textContent, /No matching tasks/);
    assert.equal(h.view.completed.box.hidden, true); assert.equal(h.view.removed.box.hidden, true);
    h.view.filterClear.focus(); h.view.filterClear.dispatch('click');
    assert.equal(h.document.activeElement, h.view.filterInput); assert.equal(h.view.list.querySelectorAll('[data-task-id]').length, 4);
    assert.equal(h.view.filterStatus.hidden, true); assert.equal(h.view.more.hidden, false);
    assert.deepEqual(h.b.raw(), before); h.view.destroy();
});

test('DOM model: filter IME defers result updates; empty/whitespace query and Show all retain view semantics', async () => {
    const h = model(); await settle(); assert.match(h.view.list.textContent || h.view.list.children[0].textContent, /A clear list/);
    setInput(h.view.filterInput, 'missing'); assert.match(h.view.filterStatus.textContent, /No matching tasks/);
    setInput(h.view.filterInput, '   '); assert.equal(h.view.filterStatus.hidden, true); assert.equal(h.view.hasUncommittedWork(), false);
    for (let i = 0; i < 5; i++) await seed(h, `中文 ${i}`);
    click(h.host, 'Show all tasks'); assert.equal(h.view.list.children.length, 5);
    h.view.filterInput.dispatch('compositionstart'); h.view.filterInput.value = 'nothing'; h.view.filterInput.dispatch('input', { isComposing: true });
    assert.equal(h.view.list.children.length, 5); await seed(h, '中文 new'); assert.equal(h.view.list.children.length, 6);
    h.view.filterInput.value = '中文 4'; h.view.filterInput.dispatch('compositionend');
    assert.equal(h.view.list.children.length, 1); h.view.filterClear.dispatch('click'); assert.equal(h.view.list.children.length, 6);
    h.view.destroy();
});

test('DOM model: filtering keeps add/edit drafts, pending saves, retry ownership and external focus', async () => {
    const h = model(); await settle(); const task = await seed(h, 'first');
    setInput(h.view.input, 'submitted'); const wait = deferred(); h.b.delay = wait.promise; h.view.add();
    setInput(h.view.input, 'new draft'); setInput(h.view.filterInput, 'first');
    assert.equal(h.view.hasUncommittedWork(), true); assert.equal(h.view.addButton.disabled, true);
    h.view.edit(task); const input = editor(h); setInput(input, 'editor draft'); input.focus();
    setInput(h.view.filterInput, 'no matches'); assert.equal(h.document.activeElement, input); assert.equal(input.value, 'editor draft');
    wait.resolve(); await settle(); assert.equal(h.view.input.value, 'new draft'); assert.equal(editor(h), input); assert.equal(h.document.activeElement, input);
    h.view.filterClear.dispatch('click'); assert.equal(h.document.activeElement, input);
    click(modal(h), 'Cancel'); h.b.delay = null; h.b.fail = true; h.view.add(); await settle();
    const retry = h.controller.retryCommand; setInput(h.view.filterInput, 'first'); assert.equal(h.controller.retryCommand, retry);
    h.search.focus(); h.b.fail = false; await h.view.retryLast(); await settle(); assert.equal(h.document.activeElement, h.search);
    assert.equal(h.view.input.value, ''); assert.equal(h.view.filterInput.value, 'first'); assert.equal(h.view.hasUncommittedWork(), false); h.view.destroy();
});

test('DOM model: filtered rows disable hidden-neighbor reordering and keep focus ownership across updates', async () => {
    const h = model(); await settle(); const first = await seed(h, 'unmatched'), second = await seed(h, 'matching');
    setInput(h.view.filterInput, 'matching');
    const row = h.view.list.querySelector('[data-task-id]'), menu = row.querySelector('.tasks-row-menu'); menu.open = true;
    const up = button(row, 'Move up'); assert.equal(up.disabled, true); assert.equal(button(row, 'Move down').disabled, true);
    assert.match(up.title, /Clear the filter/);
    assert.deepEqual(h.controller.state.records.map(t => t.id), [first.id, second.id]);
    h.view.filterClear.dispatch('click');
    const unfilteredRow = h.view.list.querySelectorAll('[data-task-id]').find(node => node.dataset.taskId === second.id);
    const enabledUp = button(unfilteredRow, 'Move up'); assert.equal(enabledUp.disabled, false); enabledUp.focus(); enabledUp.dispatch('click'); await settle();
    assert.deepEqual(h.controller.state.records.filter(t => t.state === 'active').map(t => t.id), [second.id, first.id]);
    assert.equal(h.document.activeElement.tagName, 'SUMMARY'); assert.equal(h.document.activeElement.closest('[data-task-id]').dataset.taskId, second.id);
    h.view.filterInput.focus(); await seed(h, 'matching new'); assert.equal(h.document.activeElement, h.view.filterInput);
    h.view.destroy();
});
