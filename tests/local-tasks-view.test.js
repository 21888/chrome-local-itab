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
    const document = createDocument({ blurUnavailableFocus: options.blurUnavailableFocus }), host = document.createElement('article'), search = document.createElement('input');
    document.body.append(search, host); search.focus();
    const api = { ...tasks, Controller }, window = { LocalItabTasks: api, i18n: options.i18n };
    const context = vm.createContext({ window, document, crypto: webcrypto, setTimeout: options.setTimeout || setTimeout, URL: options.URL || URL, Blob, console });
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

for (const protection of ['flag', '229', 'lifecycle']) {
    test(`DOM model: task editor preserves ${protection} IME Escape draft and reload guard`, async () => {
        const h = model(); await settle(); const task = await seed(h); h.view.edit(task);
        const input = editor(h); setInput(input, '任务草稿');
        if (protection === 'lifecycle') input.dispatch('compositionstart');
        const event = input.dispatch('keydown', { key: 'Escape', ...(protection === 'flag' ? { isComposing: true } : protection === '229' ? { keyCode: 229 } : {}) });
        assert.equal(event.prevented, false, 'leave native IME cancellation available');
        assert.equal(event.stopped, true); assert.equal(editor(h), input); assert.equal(input.value, '任务草稿');
        assert.equal(h.document.activeElement, input); assert.equal(h.view.hasUncommittedWork(), true);
        assert.equal(h.view.dialogs.size, 1); assert.equal(h.b.raw().records[0].text, 'first');
        input.dispatch('compositionend'); input.dispatch('keydown', { key: 'Escape' });
        assert.equal(modal(h), null); assert.equal(h.view.hasUncommittedWork(), false); assert.equal(h.document.activeElement, h.search);
        h.view.edit(task); editor(h).dispatch('keydown', { key: 'Escape' });
        assert.equal(modal(h), null, 'reopened editor must not inherit composition'); h.view.destroy();
    });
}

test('DOM model: IME Escape leaves a pending task save and newer draft owned by the editor', async () => {
    const h = model(); await settle(); const task = await seed(h); h.view.edit(task);
    const input = editor(h); setInput(input, 'submitted edit'); const wait = deferred(); h.b.delay = wait.promise;
    click(modal(h), 'Save task'); setInput(input, '更新的草稿'); input.dispatch('compositionstart');
    input.dispatch('keydown', { key: 'Escape' });
    assert.ok(editor(h) === input, 'IME cancellation must retain the pending editor');
    assert.equal(h.view.hasUncommittedWork(), true); assert(h.controller.pending);
    wait.resolve(); await settle();
    assert.equal(h.b.raw().records[0].text, 'submitted edit'); assert.equal(editor(h), input);
    assert.equal(input.value, '更新的草稿'); assert.equal(h.document.activeElement, input);
    assert.equal(h.view.hasUncommittedWork(), true); assert.equal(Boolean(h.controller.pending), false);
    input.dispatch('keydown', { key: 'Escape' }); assert.equal(editor(h), input);
    input.dispatch('compositionend'); input.dispatch('keydown', { key: 'Escape' });
    assert.equal(modal(h), null); assert.equal(h.view.hasUncommittedWork(), false); h.view.destroy();
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

// Dispatch keyboard events to current focus, including native-like Tab/Enter
// defaults, so disabling a button cannot leave a misleading old-target test.
function activeEditKey(h, key, fields = {}) {
    const target = h.document.activeElement, event = target.dispatch('keydown', { key, ...fields });
    if (!event.prevented && key === 'Enter' && target.tagName === 'BUTTON' && !target.disabled) target.dispatch('click', { detail: 0 });
    if (!event.prevented && key === 'Tab') {
        const nodes = modal(h)?.querySelectorAll('button, input, textarea').filter(node => !node.disabled && !node.closest('[hidden], [inert]') && node.getClientRects().length) || [];
        nodes[nodes.indexOf(target) + (fields.shiftKey ? -1 : 1)]?.focus();
    }
    return event;
}
function tabToEditButton(h, label) {
    for (let i = 0; i < 8 && h.document.activeElement !== button(modal(h), label); i++) activeEditKey(h, 'Tab');
    assert.ok(h.document.activeElement === button(modal(h), label));
}

for (const value of ['', 'x'.repeat(1001), 'invalid\u0000text']) test(`keyboard edit validation keeps immediate Escape available (${value.length})`, async () => {
    const h = model({ blurUnavailableFocus: true }); await settle(); const task = await seed(h); h.view.edit(task); setInput(editor(h), value);
    tabToEditButton(h, 'Save task'); activeEditKey(h, 'Enter');
    assert.ok(h.document.activeElement === editor(h), 'transfer before disabling Save'); await settle();
    assert.match(modal(h).querySelector('.tasks-dialog-feedback').textContent, /nonempty plain-text/);
    activeEditKey(h, 'Escape'); assert.ok(modal(h) === null); assert.ok(h.document.activeElement === h.search);
    assert.equal(h.b.raw().records[0].text, 'first'); h.view.destroy();
});

for (const action of ['save', 'retry', 'overwrite']) test(`keyboard edit ${action} keeps pending and failed focus inside`, async () => {
    const h = model({ blurUnavailableFocus: true }); await settle(); const task = await seed(h); h.view.edit(task); setInput(editor(h), 'my edit');
    if (action === 'retry') { h.b.fail = true; click(modal(h), 'Save task'); await settle(); }
    if (action === 'overwrite') {
        await h.store.mutate(h.store.request('edit', { id: task.id, version: task.version, text: 'remote' })); await settle();
        click(modal(h), 'Save task'); await settle();
    }
    const previous = h.controller.retryCommand, wait = deferred(); h.b.delay = wait.promise; h.b.fail = true;
    tabToEditButton(h, action === 'overwrite' ? 'Replace latest with my edit' : 'Save task'); activeEditKey(h, 'Enter');
    assert.ok(h.document.activeElement === editor(h));
    const event = activeEditKey(h, 'Tab', { shiftKey: true }); assert.equal(event.prevented, true);
    assert.ok(h.document.activeElement === button(modal(h), 'Cancel'));
    wait.resolve(); await settle(); assert.ok(h.document.activeElement === button(modal(h), 'Cancel'), 'late error does not reclaim focus');
    assert.equal(h.controller.error.code, 'WRITE');
    if (action === 'retry') assert.equal(h.controller.retryCommand.operationId, previous.operationId, 'retry preserves exact request');
    activeEditKey(h, 'Escape'); assert.ok(modal(h) === null); h.view.destroy();
});

for (const outcome of ['success', 'failure']) test(`keyboard late edit ${outcome} respects newer draft and IME focus`, async () => {
    const h = model({ blurUnavailableFocus: true }); await settle(); const task = await seed(h); h.view.edit(task); setInput(editor(h), 'submitted');
    const wait = deferred(); h.b.delay = wait.promise; h.b.fail = outcome === 'failure'; tabToEditButton(h, 'Save task'); activeEditKey(h, 'Enter');
    const input = editor(h); assert.ok(h.document.activeElement === input); setInput(input, 'newer 中文'); input.dispatch('compositionstart');
    wait.resolve(); await settle(); assert.equal(editor(h), input); assert.ok(h.document.activeElement === input); assert.equal(input.value, 'newer 中文');
    activeEditKey(h, 'Escape'); assert.equal(editor(h), input); input.dispatch('compositionend'); activeEditKey(h, 'Escape'); assert.ok(modal(h) === null); h.view.destroy();
});

for (const outcome of ['success', 'failure']) test(`keyboard late edit ${outcome} never steals reopened dialog focus`, async () => {
    const h = model({ blurUnavailableFocus: true }); await settle(); const task = await seed(h); h.view.edit(task); setInput(editor(h), 'submitted');
    const wait = deferred(); h.b.delay = wait.promise; h.b.fail = outcome === 'failure'; tabToEditButton(h, 'Save task'); activeEditKey(h, 'Enter');
    activeEditKey(h, 'Escape'); assert.ok(modal(h) === null); h.view.edit(task); const newer = editor(h); setInput(newer, 'reopened draft');
    wait.resolve(); await settle(); assert.equal(editor(h), newer); assert.equal(newer.value, 'reopened draft'); assert.ok(h.document.activeElement === newer);
    activeEditKey(h, 'Escape'); assert.ok(modal(h) === null); h.view.destroy();
});

test('keyboard valid edit still saves and restores previous focus', async () => {
    const h = model({ blurUnavailableFocus: true }); await settle(); const task = await seed(h); h.view.edit(task); setInput(editor(h), 'saved edit');
    tabToEditButton(h, 'Save task'); activeEditKey(h, 'Enter'); await settle(); assert.ok(modal(h) === null);
    assert.equal(h.b.raw().records[0].text, 'saved edit'); assert.ok(h.document.activeElement === h.search); h.view.destroy();
});


test('DOM model: task export download DOMException is reported as a file failure, not a save failure', async () => {
    const h = model({ URL: { createObjectURL() { throw new DOMException('Blocked download', 'SecurityError'); } } });
    await settle(); await seed(h, 'saved task'); setInput(h.view.input, 'unsent draft');
    const before = structuredClone(h.b.raw());
    await h.view.export();
    assert.equal(h.view.input.value, 'unsent draft');
    assert.deepEqual(h.b.raw(), before);
    assert.equal(h.view.status.textContent, 'Could not read or download the task file. Please try again.');
    h.view.destroy();
});

test('DOM model: task export failed link activation releases anchor and blob URL', async () => {
    const revoked = [];
    const h = model({ URL: { createObjectURL() { return 'blob:audit'; }, revokeObjectURL(url) { revoked.push(url); } } });
    await settle(); await seed(h);
    const create = h.document.createElement;
    h.document.createElement = tag => { const node = create(tag); if (tag === 'a') node.click = () => { throw new Error('Activation failed'); }; return node; };
    await h.view.export();
    assert.match(h.view.status.textContent, /download the task file/);
    assert.equal(h.document.querySelectorAll('a').length, 0);
    assert.deepEqual(revoked, ['blob:audit']);
    h.view.destroy();
});


test('DOM model: task export read failure retains storage feedback and never starts a download', async () => {
    let created = 0;
    const h = model({ URL: { createObjectURL() { created++; return 'blob:audit'; } } });
    await settle(); await seed(h); setInput(h.view.input, 'keep unsent text');
    h.b.failRead = true; await h.view.export();
    assert.equal(created, 0); assert.equal(h.view.localError.code, 'READ');
    assert.match(h.view.status.textContent, /Could not read local tasks/);
    assert.equal(h.view.input.value, 'keep unsent text'); h.view.destroy();
});

test('DOM model: task export keeps current edit and quick-entry drafts, downloads saved JSON and releases resources', async () => {
    const blobs = [], revoked = [], timers = [], clicked = [];
    const h = model({ URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:audit'; }, revokeObjectURL(url) { revoked.push(url); } },
        setTimeout(fn, delay) { timers.push({ fn, delay }); } });
    await settle(); const task = await seed(h, 'saved task');
    setInput(h.view.input, 'unsent draft'); h.view.edit(task); setInput(editor(h), 'unsaved edit');
    const before = structuredClone(h.b.raw()), create = h.document.createElement;
    h.document.createElement = tag => { const node = create(tag); if (tag === 'a') node.click = () => clicked.push(node); return node; };
    await h.view.export();
    const parsed = JSON.parse(await blobs[0].text()), stored = JSON.parse(await h.store.export());
    assert.deepEqual(parsed.content, stored.content); assert.deepEqual(parsed.recovery, stored.recovery);
    assert.deepEqual(h.b.raw(), before); assert.equal(h.view.input.value, 'unsent draft'); assert.equal(editor(h).value, 'unsaved edit');
    assert.equal(h.view.hasUncommittedWork(), true); assert.equal(h.view.localError, null);
    assert.equal(clicked.length, 1); assert.match(clicked[0].download, /^local-itab-tasks-.*\.json$/);
    assert.equal(clicked[0].isConnected, false); assert.equal(h.document.querySelectorAll('a').length, 0);
    assert.deepEqual(revoked, []); assert.equal(timers.length, 1); assert.equal(timers[0].delay, 60000);
    timers[0].fn(); assert.deepEqual(revoked, ['blob:audit']); h.view.destroy();
});

async function openTaskReplacement(h, source) {
    const review = await h.store.review(source);
    h.view.reviewReplacement(review, () => h.store.request('replace', { source, revision: review.revision }));
    return modal(h).querySelectorAll('button').at(-1);
}

test('keyboard full-history replacement refusal retains Cancel focus and immediate Escape', async () => {
    const h = model({ blurUnavailableFocus: true }); await settle(); await seed(h, 'preserve local');
    const original = await h.store.export();
    for (let i = 0; i < tasks.LIMITS.recovery; i++) await h.store.mutate(h.store.request('replace', await h.store.review(original)));
    await settle(); const before = structuredClone(h.b.raw());
    const confirm = await openTaskReplacement(h, await h.store.export()); confirm.focus(); activeEditKey(h, 'Enter');
    assert.ok(h.document.activeElement === button(modal(h), 'Cancel'), 'transfer before disabling confirmation');
    await settle(); assert.equal(h.controller.error.code, 'RECOVERY_LIMIT'); assert.deepEqual(h.b.raw(), before);
    activeEditKey(h, 'Escape'); assert.equal(modal(h), null); h.view.destroy();
});

test('keyboard stale replacement review keeps Escape after confirmation is hidden', async () => {
    const h = model({ blurUnavailableFocus: true }); await settle(); await seed(h);
    const confirm = await openTaskReplacement(h, await h.store.export()); await seed(h, 'newer task');
    const before = structuredClone(h.b.raw()); confirm.focus(); activeEditKey(h, 'Enter'); await settle();
    assert.equal(h.controller.error.code, 'CONFLICT'); assert.equal(confirm.hidden, true);
    assert.ok(h.document.activeElement === button(modal(h), 'Cancel')); assert.deepEqual(h.b.raw(), before);
    activeEditKey(h, 'Escape'); assert.equal(modal(h), null); h.view.destroy();
});

for (const outcome of ['success', 'failure']) test(`keyboard replacement late ${outcome} cannot steal reopened editor focus`, async () => {
    const h = model({ blurUnavailableFocus: true }); await settle(); const task = await seed(h);
    const confirm = await openTaskReplacement(h, await h.store.export()); const wait = deferred(); h.b.delay = wait.promise; h.b.fail = outcome === 'failure';
    confirm.focus(); activeEditKey(h, 'Enter'); await settle();
    assert.ok(h.document.activeElement === button(modal(h), 'Cancel')); activeEditKey(h, 'Escape'); assert.equal(modal(h), null);
    h.view.edit(task); const newer = editor(h); setInput(newer, 'newer draft');
    wait.resolve(); await settle(); assert.equal(editor(h), newer); assert.equal(newer.value, 'newer draft'); assert.ok(h.document.activeElement === newer);
    activeEditKey(h, 'Escape'); h.view.destroy();
});

test('replacement activation preserves other focus and ignores closed confirmation', async () => {
    const h = model({ blurUnavailableFocus: true }); await settle(); await seed(h);
    const confirm = await openTaskReplacement(h, await h.store.export());
    const before = structuredClone(h.b.raw()); activeEditKey(h, 'Escape'); confirm.dispatch('click'); await settle();
    assert.deepEqual(h.b.raw(), before); assert.ok(h.document.activeElement === h.search);
    const next = await openTaskReplacement(h, await h.store.export()), activeCancel = button(modal(h), 'Cancel');
    h.b.fail = true; next.dispatch('click'); await settle(); assert.ok(h.document.activeElement === activeCancel);
    assert.equal(h.controller.error.code, 'WRITE'); activeEditKey(h, 'Escape'); h.view.destroy();
});

test('keyboard recovery write failure keeps Cancel and retry restores without dropping current copy', async () => {
    const h = model({ blurUnavailableFocus: true }); await settle(); await seed(h, 'original');
    const original = await h.store.export(); await seed(h, 'retained in recovery');
    await h.store.mutate(h.store.request('replace', await h.store.review(original))); await settle();
    const before = structuredClone(h.b.raw()); await h.view.reviewRecovery(before.recovery[0].id);
    const confirm = modal(h).querySelectorAll('button').at(-1); h.b.fail = true; confirm.focus(); activeEditKey(h, 'Enter'); await settle();
    assert.equal(h.controller.error.code, 'WRITE'); assert.deepEqual(h.b.raw(), before);
    assert.ok(h.document.activeElement === button(modal(h), 'Cancel'));
    const retry = h.controller.retryCommand.operationId; h.b.fail = false; confirm.focus(); activeEditKey(h, 'Enter'); await settle();
    assert.equal(modal(h), null); assert.deepEqual(h.b.raw().records.map(record => record.text), ['original', 'retained in recovery']);
    assert.equal(h.b.raw().recovery.length, 1); assert.deepEqual(h.b.raw().recovery[0].content.records, before.records);
    assert.ok(h.b.raw().receipts.includes(retry)); h.view.destroy();
});

async function invalidImportBeforeRecovery(h) {
    await settle();
    // Seed through the real Store, leaving this page's status at Ready rather
    // than borrowing Saved from an unrelated controller action.
    await h.store.mutate(h.store.request('add', { text: 'synthetic current task' }));
    const original = await h.store.export();
    const added = await h.store.mutate(h.store.request('add', { text: 'synthetic recoverable task' }));
    const task = added.records.at(-1);
    await h.store.mutate(h.store.request('pin', { id: task.id, version: task.version, expectedPin: null }));
    await h.store.mutate(h.store.request('replace', await h.store.review(original))); await settle();
    const before = structuredClone(h.b.raw());
    let writes = 0; const write = h.b.write;
    h.b.write = value => { writes++; return write(value); };
    h.view.fileInput.files = [{ size: 2, text: async () => '{}' }]; await h.view.importFile();
    assert.equal(h.view.localError.code, 'INVALID'); assert.match(h.view.status.textContent, /Nothing was replaced/);
    assert.deepEqual(h.b.raw(), before); assert.equal(writes, 0);
    return { before, copy: before.recovery[0], writes: () => writes };
}

test('recovery feedback: invalid import then confirmed restore shows Saved and retains recovery semantics', async t => {
    const h = model(); t.after(() => h.view.destroy()); const { before, copy, writes } = await invalidImportBeforeRecovery(h);
    await h.view.reviewRecovery(copy.id);
    assert.deepEqual(h.b.raw(), before); assert.equal(writes(), 0);
    click(modal(h), 'Replace tasks'); await settle();
    assert.equal(modal(h), null); assert.equal(writes(), 1);
    const after = h.b.raw(), withoutVersion = ({ version, ...record }) => record;
    assert.deepEqual(after.records.map(withoutVersion), copy.content.records.map(withoutVersion));
    assert(after.records.every((record, i) => record.version !== copy.content.records[i].version));
    assert.equal(after.pinnedId, copy.content.pinnedId); assert.equal(after.recovery.length, 1);
    assert.deepEqual(after.recovery[0].content, { records: before.records, pinnedId: before.pinnedId });
    assert.equal(h.controller.status, 'saved'); assert.equal(h.controller.error, null);
    assert.equal(h.view.status.textContent, 'Saved on this device'); assert.equal(h.view.feedback.classList.contains('is-error'), false);
});

test('recovery feedback: cancelling a Ready-state preview clears stale file feedback without writing or changing status', async t => {
    const h = model(); t.after(() => h.view.destroy()); const { before, copy, writes } = await invalidImportBeforeRecovery(h);
    await h.view.reviewRecovery(copy.id); click(modal(h), 'Cancel');
    assert.equal(modal(h), null); assert.equal(writes(), 0); assert.deepEqual(h.b.raw(), before);
    assert.equal(h.controller.status, 'ready'); assert.equal(h.view.status.textContent, 'Local tasks ready');
    assert.equal(h.view.localError, null); assert.equal(h.view.hasUncommittedWork(), false);
});

for (const failure of ['READ', 'CONFLICT']) test(`recovery feedback: failed ${failure} preview replaces the old invalid-import error`, async t => {
    const h = model(); t.after(() => h.view.destroy()); const { before, copy, writes } = await invalidImportBeforeRecovery(h);
    h.b.failRead = failure === 'READ';
    await h.view.reviewRecovery(failure === 'CONFLICT' ? 'missing_copy' : copy.id);
    assert.equal(modal(h), null); assert.equal(h.view.localError.code, failure);
    assert.match(h.view.status.textContent, failure === 'READ' ? /Could not read local tasks/ : /changed in another page/);
    assert.equal(h.view.feedback.classList.contains('is-error'), true); assert.equal(writes(), 0); assert.deepEqual(h.b.raw(), before);
});

for (const failure of ['WRITE', 'CONFLICT']) test(`recovery feedback: confirmation ${failure} stays visible after an invalid import`, async t => {
    const h = model(); t.after(() => h.view.destroy()); const { copy, writes } = await invalidImportBeforeRecovery(h);
    await h.view.reviewRecovery(copy.id);
    if (failure === 'CONFLICT') await h.store.mutate(h.store.request('add', { text: 'synthetic newer task' }));
    else h.b.fail = true;
    const before = structuredClone(h.b.raw()), writesBefore = writes();
    click(modal(h), 'Replace tasks'); await settle();
    const expected = failure === 'WRITE' ? /Could not confirm the save/ : /changed in another page/;
    assert.equal(h.controller.error.code, failure); assert.match(h.view.status.textContent, expected);
    assert.match(modal(h).querySelector('.tasks-dialog-feedback').textContent, expected); assert.deepEqual(h.b.raw(), before);
    assert.equal(writes(), writesBefore + (failure === 'WRITE' ? 1 : 0));
    if (failure === 'CONFLICT') assert.equal(button(modal(h), 'Replace tasks').hidden, true);
    else {
        const operationId = h.controller.retryCommand.operationId; h.b.fail = false;
        click(modal(h), 'Replace tasks'); await settle();
        assert.equal(modal(h), null); assert.equal(h.b.raw().receipts.at(-1), operationId);
        assert.equal(h.view.status.textContent, 'Saved on this device');
    }
});

test('recovery feedback: late preview and save preserve a newer export error', async t => {
    const h = model({ URL: { createObjectURL() { throw new Error('Synthetic download failure'); } } });
    t.after(() => h.view.destroy()); const { copy } = await invalidImportBeforeRecovery(h);
    await h.view.export(); const previous = h.view.localError; assert.equal(previous.code, 'FILE');
    const wait = deferred(), read = h.store.read.bind(h.store);
    h.store.read = () => { h.store.read = read; return wait.promise.then(read); };
    const reviewing = h.view.reviewRecovery(copy.id);
    await h.view.export(); const newer = h.view.localError; assert.equal(newer.code, 'FILE'); assert.notEqual(newer, previous);
    wait.resolve(); await reviewing;
    assert(modal(h)); assert.equal(h.view.localError, newer); assert.match(h.view.status.textContent, /download the task file/);
    // Let an export requested before confirmation finish while the write is
    // pending, without waiting for a read behind that write's storage lock.
    const exporting = deferred(), source = await h.store.export(); h.store.export = () => exporting.promise;
    const downloading = h.view.export(), saving = deferred(); h.b.delay = saving.promise; click(modal(h), 'Replace tasks');
    exporting.resolve(source); await downloading; const newest = h.view.localError; assert.notEqual(newest, newer);
    saving.resolve(); await settle();
    assert.equal(modal(h), null); assert.equal(h.controller.status, 'saved'); assert.equal(h.view.localError, newest);
    assert.match(h.view.status.textContent, /download the task file/); assert.equal(h.view.feedback.classList.contains('is-error'), true);
});

test('recovery feedback: preview cancellation and restore keep quick draft and Undo ownership', async t => {
    const h = model(); t.after(() => h.view.destroy()); const { copy } = await invalidImportBeforeRecovery(h);
    const task = h.controller.state.records[0];
    await h.view.perform(h.store.request('complete', { id: task.id, version: task.version }));
    const undo = h.view.undo; assert(undo); setInput(h.view.input, 'synthetic unsaved draft');
    h.view.fileInput.files = [{ size: 2, text: async () => '{}' }]; await h.view.importFile();
    const before = structuredClone(h.b.raw());
    await h.view.reviewRecovery(copy.id); click(modal(h), 'Cancel');
    assert.equal(h.view.input.value, 'synthetic unsaved draft'); assert.equal(h.view.undo, undo);
    assert.equal(h.view.undoButton.hidden, false); assert.deepEqual(h.b.raw(), before);
    await h.view.reviewRecovery(copy.id); click(modal(h), 'Replace tasks'); await settle();
    assert.equal(h.view.input.value, 'synthetic unsaved draft'); assert.equal(h.view.undo, undo);
    assert.equal(h.view.undoButton.hidden, true, 'the previous Undo cannot act on regenerated task versions');
    assert.equal(h.view.status.textContent, 'Last task saved. Your current draft is not saved yet.');
    assert.equal(h.view.hasUncommittedWork(), true);
});

for (const route of ['Enter', 'Add', 'submit', 'direct']) {
    test(`DOM model: quick-entry composition guards ${route} until compositionend`, async () => {
        const h = model(); await settle(); h.view.input.focus();
        h.view.input.dispatch('compositionstart'); setInput(h.view.input, '中文草稿');
        const invoke = () => route === 'Enter' ? h.view.input.dispatch('keydown', { key: 'Enter' }) :
            route === 'Add' ? h.view.addButton.dispatch('click') : route === 'submit' ? h.view.form.dispatch('submit') : h.view.add();
        const event = invoke(); await settle();
        if (route === 'Enter') assert.equal(event.prevented, false, 'native candidate confirmation stays available');
        assert.equal(h.b.raw(), undefined); assert.equal(h.controller.pending, null);
        assert.equal(h.view.input.value, '中文草稿'); assert.equal(h.view.hasUncommittedWork(), true);
        assert.equal(h.view.addButton.disabled, true);
        h.view.input.dispatch('compositionend'); setInput(h.view.input, '中文任务');
        invoke(); invoke(); await settle();
        assert.equal(h.controller.state.records.length, 1); assert.equal(h.controller.state.records[0].text, '中文任务');
        assert.equal(h.view.input.value, ''); assert.equal(h.view.hasUncommittedWork(), false); h.view.destroy();
    });
}

test('DOM model: quick-entry fallback flags, Shift and repeat preserve draft after composition', async () => {
    const h = model(); await settle(); setInput(h.view.input, 'draft');
    for (const fields of [{ isComposing: true }, { keyCode: 229 }, { shiftKey: true }, { repeat: true }]) {
        h.view.input.dispatch('keydown', { key: 'Enter', ...fields }); await settle();
        assert.equal(h.controller.state.records.length, 0); assert.equal(h.view.input.value, 'draft');
    }
    h.view.input.dispatch('keydown', { key: 'Enter' }); await settle();
    assert.equal(h.controller.state.records.length, 1); h.view.destroy();
});

test('DOM model: quick-entry blur waits for final IME input and cancellation releases an empty draft', async () => {
    const callbacks = [], h = model({ setTimeout: fn => callbacks.push(fn) }); await settle();
    h.view.input.dispatch('compositionstart'); setInput(h.view.input, '拼');
    h.view.input.dispatch('focusout'); h.view.addButton.dispatch('click');
    assert.equal(h.b.raw(), undefined); assert.equal(h.view.hasUncommittedWork(), true);
    setInput(h.view.input, '拼音'); h.view.input.dispatch('compositionend');
    while (callbacks.length) callbacks.shift()(); assert.equal(h.view.input.value, '拼音');
    h.view.add(); await settle(); assert.equal(h.controller.state.records[0].text, '拼音');
    h.view.input.dispatch('compositionstart'); h.view.input.dispatch('focusout');
    assert.equal(h.view.hasUncommittedWork(), true); callbacks.shift()();
    assert.equal(h.view.hasUncommittedWork(), false); assert.equal(h.view.addButton.disabled, false);
    h.view.input.dispatch('compositionstart'); h.view.input.dispatch('focusout');
    h.view.input.dispatch('compositionstart'); callbacks.shift()();
    assert.equal(h.view.hasUncommittedWork(), true, 'old blur cannot release a newer composition');
    h.view.input.dispatch('compositionend'); while (callbacks.length) callbacks.shift()(); assert.equal(h.view.hasUncommittedWork(), false);
    h.view.input.dispatch('compositionstart'); h.view.input.dispatch('focusout'); h.view.destroy(); callbacks.shift()();
    assert.equal(h.view.hasUncommittedWork(), false); h.view.add();
    assert.equal(h.controller.state.records.length, 1, 'destroyed view cannot add');
});

test('DOM model: a new composition protects same-text draft from an older pending add', async () => {
    const h = model(); await settle(); setInput(h.view.input, '任务');
    const wait = deferred(); h.b.delay = wait.promise; h.view.add();
    h.view.input.dispatch('compositionstart'); wait.resolve(); await settle();
    assert.equal(h.view.input.value, '任务'); assert.equal(h.view.hasUncommittedWork(), true);
    h.view.input.dispatch('compositionend'); setInput(h.view.input, '更新任务'); h.b.delay = null;
    h.view.add(); await settle(); assert.equal(h.controller.state.records.length, 2);
    assert.equal(h.controller.state.records[1].text, '更新任务'); h.view.destroy();
});

test('DOM model: remote hide cannot hide empty active quick-entry composition', async () => {
    const callbacks = [], h = model({ alwaysVisible: false, setTimeout: fn => callbacks.push(fn) }); await settle(); await h.controller.action('enable', { enabled: true });
    h.view.input.focus(); h.view.input.dispatch('compositionstart');
    await h.controller.action('enable', { enabled: false }); await settle();
    assert.equal(h.host.hidden, false); assert.equal(h.view.hasUncommittedWork(), true);
    h.view.input.dispatch('compositionend'); assert.equal(h.host.hidden, false, 'wait for final input');
    setInput(h.view.input, '最终任务'); while (callbacks.length) callbacks.shift()();
    assert.equal(h.host.hidden, false); assert.equal(h.view.hasUncommittedWork(), true);
    h.view.add(); await settle(); assert.equal(h.host.hidden, true); h.view.destroy();
});

test('DOM model: quick-entry refocus retains composition; later blur cancels and Add remains usable', async () => {
    const callbacks = [], h = model({ setTimeout: fn => callbacks.push(fn) }); await settle();
    h.view.input.focus(); h.view.input.dispatch('compositionstart'); setInput(h.view.input, '草稿');
    h.search.focus(); h.view.input.dispatch('focusout'); h.view.input.focus(); callbacks.shift()();
    h.view.add(); assert.equal(h.b.raw(), undefined, 'refocused active composition is not released');
    h.search.focus(); h.view.input.dispatch('focusout'); callbacks.shift()();
    h.view.input.focus(); h.view.addButton.dispatch('click'); await settle();
    assert.equal(h.controller.state.records[0].text, '草稿'); assert.equal(h.view.input.value, '');
    h.view.input.dispatch('compositionstart'); h.search.focus(); h.view.input.dispatch('focusout'); callbacks.shift()();
    h.view.input.value = '迟来的输入'; h.view.input.dispatch('input', { isComposing: true });
    h.view.add(); assert.equal(h.controller.state.records.length, 1);
    h.view.input.dispatch('compositionend'); h.view.add(); await settle();
    while (callbacks.length) callbacks.shift()();
    assert.equal(h.controller.state.records.length, 2, 'deliberate post-composition Add works without waiting');
    assert.equal(h.view.input.value, ''); h.view.destroy();
});

test('DOM model: flagged final input after blur retains a fenced omitted-end cancellation fallback', async () => {
    const callbacks = [], h = model({ setTimeout: fn => callbacks.push(fn) }); await settle();
    h.view.input.focus(); h.view.input.dispatch('compositionstart');
    h.search.focus(); h.view.input.dispatch('focusout');
    h.view.input.value = '最终草稿'; h.view.input.dispatch('input', { isComposing: true });
    h.view.add(); assert.equal(h.b.raw(), undefined, 'same-turn add stays guarded');
    while (callbacks.length) callbacks.shift()();
    h.view.input.dispatch('input', { isComposing: false }); h.view.input.focus(); h.view.add(); await settle();
    assert.equal(h.controller.state.records.length, 1); assert.equal(h.controller.state.records[0].text, '最终草稿');
    assert.equal(h.view.hasUncommittedWork(), false); h.view.destroy();
});

async function recoveryPreviewFixture(h) {
    await settle(); const empty = await h.store.export();
    const duplicate = '  第一行 🧭\r\n第二行 <img src=x onerror=alert(1)>\r末行  ';
    for (const text of [duplicate, '<script>literal & completed</script>', 'removed while active', duplicate, 'removed after completion']) {
        await h.store.mutate(h.store.request('add', { text }));
    }
    const act = async (index, kind) => {
        const task = (await h.store.read()).records[index];
        await h.store.mutate(h.store.request(kind, { id: task.id, version: task.version, ...(kind === 'pin' ? { expectedPin: null } : {}) }));
    };
    await act(1, 'complete'); await act(2, 'remove'); await act(4, 'complete'); await act(4, 'remove'); await act(3, 'pin');
    await h.store.mutate(h.store.request('replace', await h.store.review(empty)));
    await seed(h, 'current list only'); return structuredClone(h.b.raw().recovery[0]);
}
const recoveryPreviewTexts = panel => panel.querySelectorAll('.tasks-recovery-text').map(node => node.textContent);

test('recovery preview: collapsed read-only original order, exact text, states and pin; toggling and cancelling do no I/O', async t => {
    const h = model(); t.after(() => h.view.destroy()); const copy = await recoveryPreviewFixture(h);
    const task = h.controller.state.records[0]; await h.view.perform(h.store.request('complete', { id: task.id, version: task.version }));
    const undo = h.view.undo; setInput(h.view.input, 'new quick-entry draft');
    const before = structuredClone(h.b.raw()), read = h.store.read.bind(h.store), write = h.b.write;
    let reads = 0, writes = 0; h.store.read = () => { reads++; return read(); }; h.b.write = value => { writes++; return write(value); };
    await h.view.reviewRecovery(copy.id);
    const panel = modal(h), preview = panel.querySelector('.tasks-recovery-preview'); assert(preview, 'selected recovery copy needs a text preview');
    assert.equal(preview.tagName, 'DETAILS'); assert.equal(preview.open, false);
    assert.equal(preview.querySelector('summary').textContent, 'Contents of this local copy');
    assert.match(preview.querySelector('.tasks-help').textContent, /selected copy.*replace the current list/);
    assert.deepEqual(recoveryPreviewTexts(panel), copy.content.records.map(record => record.text));
    assert.equal(preview.querySelectorAll('li').length, 5);
    assert.deepEqual(preview.querySelectorAll('.tasks-recovery-state').map(node => node.textContent), [
        'Active', 'Completed', 'Removed · Removed from: Active', 'Active · Next up', 'Removed · Removed from: Completed'
    ]);
    assert.equal(preview.querySelectorAll('button, input, textarea, a, [data-task-id], img, script').length, 0);
    assert(preview.querySelectorAll('.tasks-recovery-text').every(node => node.children.length === 0));
    assert(!recoveryPreviewTexts(panel).includes('current list only'));
    const summary = preview.querySelector('summary'), confirmLoop = button(panel, 'Replace tasks');
    assert.equal(summary.getAttribute('tabindex'), '0');
    confirmLoop.focus(); assert.equal(confirmLoop.dispatch('keydown', { key: 'Tab' }).prevented, true); assert.equal(h.document.activeElement, summary);
    assert.equal(summary.dispatch('keydown', { key: 'Tab', shiftKey: true }).prevented, true); assert.equal(h.document.activeElement, confirmLoop);
    preview.open = true; preview.dispatch('toggle'); preview.open = false; preview.dispatch('toggle');
    const confirm = button(panel, 'Replace tasks'); click(panel, 'Cancel'); confirm.dispatch('click'); await settle();
    assert.equal(modal(h), null); assert.equal(reads, 1); assert.equal(writes, 0); assert.deepEqual(h.b.raw(), before);
    assert.equal(h.view.input.value, 'new quick-entry draft'); assert.equal(h.view.undo, undo); assert.equal(h.view.undoButton.hidden, false);
    assert.equal(h.document.activeElement, h.search);
});

test('recovery preview: identical counts still distinguish complete saved texts and preserve long content', async t => {
    const h = model(); t.after(() => h.view.destroy()); await settle(); const empty = await h.store.export();
    const first = '甲'.repeat(998) + ' 🧭', second = '乙'.repeat(998) + ' 🧭';
    await seed(h, first); await h.store.mutate(h.store.request('replace', await h.store.review(empty)));
    await seed(h, second); await h.store.mutate(h.store.request('replace', await h.store.review(empty))); await settle();
    const before = structuredClone(h.b.raw()), [one, two] = before.recovery;
    assert.deepEqual(tasks.counts(one.content), tasks.counts(two.content));
    await h.view.reviewRecovery(one.id); assert.deepEqual(recoveryPreviewTexts(modal(h)), [first]); click(modal(h), 'Cancel');
    await h.view.reviewRecovery(two.id); assert.deepEqual(recoveryPreviewTexts(modal(h)), [second]); click(modal(h), 'Cancel');
    assert.deepEqual(h.b.raw(), before);
});

test('recovery preview: same-read immutable snapshot retains original revision after another page consumes the source', async t => {
    const h = model({ blurUnavailableFocus: true }); t.after(() => h.view.destroy()); const copy = await recoveryPreviewFixture(h);
    const snapshot = await h.store.read(), revision = snapshot.revision, read = h.store.read.bind(h.store);
    h.store.read = async () => snapshot; await h.view.reviewRecovery(copy.id); h.store.read = read;
    const preview = modal(h).querySelector('.tasks-recovery-preview'); assert(preview);
    // Another page restores this copy, so the old id is no longer available.
    await h.store.mutate(h.store.request('recover', { id: copy.id, revision })); await settle();
    const before = structuredClone(h.b.raw()); assert(!before.recovery.some(item => item.id === copy.id));
    // A producer retaining its read result cannot rewrite the reviewed command.
    snapshot.revision = before.revision; snapshot.recovery[0].content.records[0].text = 'mutated read result'; snapshot.recovery[0].content.pinnedId = null;
    preview.open = true; preview.dispatch('toggle'); assert.deepEqual(recoveryPreviewTexts(modal(h)), copy.content.records.map(record => record.text));
    const run = h.controller.run.bind(h.controller), commands = []; h.controller.run = command => { commands.push(command); return run(command); };
    const confirm = button(modal(h), 'Replace tasks'); confirm.focus(); activeEditKey(h, 'Enter'); await settle();
    assert.equal(commands.length, 1); assert.equal(commands[0].revision, revision); assert.equal(commands[0].id, copy.id);
    assert.equal(h.controller.error.code, 'CONFLICT'); assert.equal(confirm.hidden, true); assert.deepEqual(h.b.raw(), before);
    assert.deepEqual(recoveryPreviewTexts(modal(h)), copy.content.records.map(record => record.text));
    assert.equal(h.document.activeElement, button(modal(h), 'Cancel')); activeEditKey(h, 'Escape'); assert.equal(modal(h), null);
});

test('recovery preview: late reads cannot revive closed reviews, replace newer dialogs or outlive destroy', async t => {
    const h = model(); t.after(() => h.view.destroy()); const copy = await recoveryPreviewFixture(h), read = h.store.read.bind(h.store);
    const wait = deferred(); h.store.read = () => { h.store.read = read; return wait.promise; };
    const older = h.view.reviewRecovery(copy.id); await h.view.reviewRecovery(copy.id);
    assert(modal(h).querySelector('.tasks-recovery-preview')); click(modal(h), 'Cancel');
    wait.resolve(await read()); await older; assert.equal(modal(h), null);
    const editing = deferred(); h.store.read = () => { h.store.read = read; return editing.promise; };
    const pending = h.view.reviewRecovery(copy.id); h.view.edit(h.controller.state.records[0]); const input = editor(h); setInput(input, 'newer editor');
    editing.resolve(await read()); await pending; assert.equal(editor(h), input); assert.equal(modal(h).querySelector('.tasks-recovery-preview'), null);
    assert.equal(input.value, 'newer editor'); click(modal(h), 'Cancel');
    const dying = deferred(); h.store.read = () => { h.store.read = read; return dying.promise; };
    const last = h.view.reviewRecovery(copy.id), before = structuredClone(h.b.raw()); h.view.destroy(); dying.resolve(before); await last;
    assert.equal(modal(h), null); assert.equal(h.view.pendingReview, false); assert.deepEqual(h.b.raw(), before);
});

test('recovery preview: full eight-copy uncertain restore retries the exact command and retains the previous current list', async t => {
    const h = model({ blurUnavailableFocus: true }); t.after(() => h.view.destroy()); const copy = await recoveryPreviewFixture(h);
    const source = await h.store.export();
    for (let i = 1; i < tasks.LIMITS.recovery; i++) await h.store.mutate(h.store.request('replace', await h.store.review(source)));
    await settle(); const before = structuredClone(h.b.raw()); assert.equal(before.recovery.length, 8);
    await h.view.reviewRecovery(copy.id); assert.deepEqual(recoveryPreviewTexts(modal(h)), copy.content.records.map(record => record.text));
    const run = h.controller.run.bind(h.controller), commands = []; h.controller.run = command => { commands.push(command); return run(command); };
    const write = h.b.write; let writes = 0; h.b.write = async value => { writes++; await write(value); throw new Error('synthetic uncertain save'); };
    const confirm = button(modal(h), 'Replace tasks'); confirm.focus(); activeEditKey(h, 'Enter'); await settle();
    assert.equal(h.controller.error.code, 'WRITE'); assert.equal(writes, 1); assert.equal(h.document.activeElement, button(modal(h), 'Cancel'));
    assert.deepEqual(recoveryPreviewTexts(modal(h)), copy.content.records.map(record => record.text));
    const saved = structuredClone(h.b.raw()); h.b.write = async value => { writes++; return write(value); };
    confirm.focus(); activeEditKey(h, 'Enter'); await settle();
    assert.equal(modal(h), null); assert.equal(commands.length, 2); assert.equal(commands[0], commands[1]); assert.equal(writes, 1);
    assert.deepEqual(h.b.raw(), saved); assert.equal(saved.recovery.length, 8);
    assert.deepEqual(saved.recovery.slice(0, -1), before.recovery.filter(item => item.id !== copy.id));
    assert.deepEqual(saved.recovery.at(-1).content, { records: before.records, pinnedId: before.pinnedId });
    const withoutVersion = ({ version, ...record }) => record;
    assert.deepEqual(saved.records.map(withoutVersion), copy.content.records.map(withoutVersion)); assert.equal(saved.pinnedId, copy.content.pinnedId);
    assert(saved.records.every((record, i) => record.version !== copy.content.records[i].version));
});

test('recovery preview: empty local copies are explicit and file-import review stays unchanged', async t => {
    const h = model(); t.after(() => h.view.destroy()); await settle();
    const empty = await h.store.export(); await h.store.mutate(h.store.request('replace', await h.store.review(empty))); await settle();
    await h.view.reviewRecovery(h.b.raw().recovery[0].id);
    const preview = modal(h).querySelector('.tasks-recovery-preview'); assert(preview); assert.equal(preview.querySelector('ol'), null);
    assert.equal(preview.querySelector('.tasks-empty').textContent, 'This copy contains no tasks.'); click(modal(h), 'Cancel');
    const before = structuredClone(h.b.raw()); await openTaskReplacement(h, await h.store.export());
    assert.equal(modal(h).querySelector('.tasks-recovery-preview'), null); assert.equal(modal(h).querySelector('h2').textContent, 'Replace local tasks?');
    assert.equal(modal(h).querySelectorAll('button').length, 2); click(modal(h), 'Cancel'); assert.deepEqual(h.b.raw(), before);
});

test('recovery preview: Chinese catalog labels describe snapshot states and removed-from semantics', async t => {
    const messages = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../_locales/zh_CN/messages.json'), 'utf8'));
    const h = model({ i18n: { t: key => messages[key]?.message || key } }); t.after(() => h.view.destroy()); const copy = await recoveryPreviewFixture(h);
    await h.view.reviewRecovery(copy.id); const preview = modal(h).querySelector('.tasks-recovery-preview'); assert(preview);
    assert.equal(preview.querySelector('summary').textContent, '这份本地副本的内容');
    assert.deepEqual(preview.querySelectorAll('.tasks-recovery-state').map(node => node.textContent), [
        '未完成', '已完成', '已移除 · 移除前：未完成', '未完成 · 下一件事', '已移除 · 移除前：已完成'
    ]);
    assert.match(preview.querySelector('.tasks-help').textContent, /已移除.*保持已移除/);
    assert.deepEqual(recoveryPreviewTexts(modal(h)), copy.content.records.map(record => record.text));
});
