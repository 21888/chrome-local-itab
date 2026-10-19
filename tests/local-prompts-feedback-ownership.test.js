const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Controller } = require('../shared/local-prompts-controller.js');
const { fixture, Backup, Workspaces, Prompts, Scratchpad, copy } = require('./helpers/complete-backup-acceptance.js');
const { setup, add, tick } = require('./helpers/prompts-harness.js');
const { createDocument } = require('./helpers/task-dom-model.js');
const text = node => [node.textContent || '', ...node.children.map(text)].join('');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function settled() { for (let n = 0; n < 8; n++) await tick(); }

// Exercise production Manager/backend/Store/Controller/View and reviewed restore
// recovery. Only Chrome storage, its change events, locks and the DOM are modeled.
function cleanFixture() {
    const f = fixture({ extra: false, trash: false });
    delete f.raw.__auth; f.raw.sync = { enabled: false }; f.raw.privacy = { onlineFavicons: false };
    return f;
}
async function seed(f, name) {
    let serial = 0;
    const store = new Prompts.Store(f.workspaceManager.createPromptBackend(Prompts), {
        id: () => `${name}_token_${++serial}`, now: () => '2026-10-19T20:00:00.000Z'
    });
    await store.mutate(store.request('add', { title: `Synthetic ${name}`, body: 'Synthetic exact saved body', favorite: false }));
    return store;
}
async function mount(t) {
    const f = cleanFixture(), listeners = new Set(), events = [];
    f.chrome.storage.onChanged = { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) };
    const set = f.chrome.storage.local.set;
    f.chrome.storage.local.set = async values => {
        const before = copy(f.raw); await set(values);
        const changes = Object.fromEntries(Object.keys(values).filter(key => !Workspaces.same(before[key], f.raw[key])).map(key => [key, {
            ...(before[key] === undefined ? {} : { oldValue: before[key] }), newValue: copy(f.raw[key])
        }]));
        if (Object.keys(changes).length) {
            events.push({ keys: Object.keys(changes), marker: f.raw[Workspaces.RESTORE_TRANSACTION_KEY]?.status || null });
            for (const listener of [...listeners]) listener(copy(changes), 'local');
        }
    };
    const store = await seed(f, 'original'), c = new Controller({ store }); t.after(() => c.dispose());
    const doc = createDocument({ blurUnavailableFocus: true }), host = doc.createElement('div'); doc.body.append(host);
    const root = { document: doc, LocalItabPrompts: Prompts, addEventListener() {}, removeEventListener() {} };
    const context = vm.createContext({ window: root, Intl, Date, Object, Array, Boolean, String, Promise });
    for (const file of ['dialog-focus', 'local-prompts-view']) vm.runInContext(fs.readFileSync(`${__dirname}/../shared/${file}.js`, 'utf8'), context);
    const view = new root.LocalItabPromptsView.View({ host, controller: c }), trace = [], render = c.onChange;
    c.onChange = kind => { render(kind); trace.push({ kind, error: c.error, status: text(view.status) }); };
    let refreshes = 0; const refresh = c.refresh.bind(c);
    c.refresh = (...args) => { refreshes++; return refresh(...args); };
    view.render(); await c.start(); await settled();
    return { ...f, c, view, trace, events, promptStore: store, get refreshes() { return refreshes; } };
}
async function interruptRestore(h) {
    const incoming = cleanFixture(); await seed(incoming, 'incoming');
    incoming.values('default')[Scratchpad.KEY].content = 'Synthetic incoming note';
    const plan = await h.store.review(await incoming.store.export(Backup.MODULES.filter(name => name !== 'collections')), null, { promptTarget: 'global-library' });
    let current = true;
    h.hooks.set = (values, raw) => {
        Object.assign(raw, copy(values));
        if (values[Workspaces.RESTORE_TRANSACTION_KEY]?.status === 'prepared') current = false;
    };
    await assert.rejects(h.store.restore(plan, { confirmed: true, isCurrent: () => current }), { code: 'UNCONFIRMED' });
    delete h.hooks.set; await settled();
    assert.equal(h.raw[Workspaces.RESTORE_TRANSACTION_KEY].status, 'prepared');
}
async function failedFavorite(h) {
    const before = copy(h.raw), writes = h.writes.length, start = h.trace.length;
    const button = h.view.main.querySelector('[data-prompt-focus="favorite-action"]');
    assert.ok(button); assert.equal(button.disabled, false);
    let action; const original = h.c.action.bind(h.c);
    h.c.action = (...args) => (action = original(...args));
    button.dispatch('click'); assert.equal(await action, false); await settled();
    h.c.action = original;
    const failure = h.trace.slice(start).find(row => row.error?.scope === 'favorite');
    assert.deepEqual(failure?.error, { code: 'WORKSPACE_RESTORE_PENDING', scope: 'favorite' });
    assert.equal(h.writes.length, writes, 'rejected Favorite submits zero storage writes');
    assert.deepEqual(h.raw, before, 'rejected Favorite preserves all raw storage');
    assert.equal(h.c.record().favorite, false); assert.equal(h.c.pendingCommand, null);
    assert.equal(h.c.notice, ''); assert.equal(h.c.hasUncommittedWork(), false);
    return failure;
}
async function recover(h) {
    const beforeEvents = h.events.length, beforeRefreshes = h.refreshes;
    const review = await h.store.inspectInterruptedRestore(); assert.equal(review.outcome, 'previous-present');
    assert.equal((await h.store.recoverInterruptedRestore(review, { confirmed: true })).recovered, true);
    await settled();
    assert.deepEqual(h.events.slice(beforeEvents), [{ keys: [Workspaces.RESTORE_TRANSACTION_KEY], marker: 'recovered' }]);
    assert.equal(h.refreshes, beforeRefreshes + 1, 'real recovery marker alone schedules one prompt refresh');
}

test('failed Favorite owns its feedback through the automatic failed read without writes', async t => {
    const h = await mount(t); await interruptRestore(h); const failure = await failedFavorite(h);
    assert.equal(h.c.linkedPromptUnavailable, true); assert.equal(h.c.pendingReadGeneration, null);
    assert.equal(h.c.sessionReady(), false); assert.equal(h.c.preview().complete, false);
    assert.equal(h.c.error, failure.error, 'read failure must not replace the Favorite-owned error');
    assert.equal(text(h.view.status), failure.status); assert.equal(h.view.status.classList.contains('error'), true);
    assert.doesNotMatch(text(h.view.status), /Favorite updated|Saved on this device/);
});

test('real reviewed recovery refreshes confirmed state but retains the failed Favorite feedback', async t => {
    const h = await mount(t); await interruptRestore(h); const failure = await failedFavorite(h);
    const confirmed = h.c.state, promptBytes = JSON.stringify(h.raw[Prompts.KEY]); await recover(h);
    assert.notEqual(h.c.state, confirmed, 'recovery notification accepts a fresh confirmed snapshot');
    assert.deepEqual(h.c.state, h.raw[Prompts.KEY]); assert.equal(JSON.stringify(h.raw[Prompts.KEY]), promptBytes);
    assert.equal(h.c.record().favorite, false); assert.equal(h.c.linkedPromptUnavailable, false);
    assert.equal(h.c.pendingCommand, null); assert.equal(h.c.pendingReadGeneration, null); assert.equal(h.c.notice, '');
    assert.equal(h.c.error, failure.error, 'recovery is not success of the rejected Favorite');
    assert.equal(text(h.view.status), failure.status); assert.equal(h.view.status.classList.contains('error'), true);
});

test('main read-only retry remains reachable with Favorite-owned feedback and unavailable prompt data', async t => {
    const h = await mount(t); await interruptRestore(h); const failure = await failedFavorite(h);
    const retry = h.view.main.querySelectorAll('button').find(button => button.textContent === 'Read results again');
    assert.ok(retry); assert.equal(Boolean(retry.disabled), false);
    const before = copy(h.raw), writes = h.writes.length, refreshes = h.refreshes;
    retry.dispatch('click'); await settled();
    assert.equal(h.refreshes, refreshes + 1); assert.equal(h.writes.length, writes); assert.deepEqual(h.raw, before);
    assert.equal(h.c.linkedPromptUnavailable, true); assert.equal(h.c.error, failure.error);
    assert.equal(h.c.pendingCommand, null); assert.equal(h.c.record().favorite, false);
});

test('missing-record Read again remains read-only and preserves feedback with a retained preview session', async t => {
    const h = await mount(t); await interruptRestore(h); const failure = await failedFavorite(h); await recover(h);
    const selected = h.c.selected; assert.equal(h.c.activeSessions.has(selected), true);
    const incoming = cleanFixture(), incomingStore = await seed(incoming, 'replacement');
    await h.promptStore.mutate(h.promptStore.request('replace', await h.promptStore.review(await incomingStore.export()))); await settled();
    assert.equal(h.c.selected, selected); assert.equal(h.c.record(), null); assert.equal(h.c.activeSessions.has(selected), true);
    const retry = h.view.main.querySelectorAll('button').find(button => button.textContent === 'Read again');
    assert.ok(retry); assert.equal(Boolean(retry.disabled), false);
    const before = copy(h.raw), writes = h.writes.length, refreshes = h.refreshes;
    retry.dispatch('click'); await settled();
    assert.equal(h.refreshes, refreshes + 1); assert.equal(h.writes.length, writes); assert.deepEqual(h.raw, before);
    assert.equal(h.c.error, failure.error); assert.equal(h.c.pendingCommand, null); assert.equal(h.c.selected, selected);
});

for (const next of ['select', 'action']) test(`explicit ${next} clears recovered Favorite failure according to the existing contract`, async t => {
    const h = await mount(t); await interruptRestore(h); await failedFavorite(h); await recover(h);
    const before = copy(h.raw), writes = h.writes.length;
    if (next === 'select') {
        assert.equal(h.c.select(h.c.selected), true); assert.deepEqual(h.raw, before); assert.equal(h.writes.length, writes);
        assert.equal(h.c.record().favorite, false); assert.equal(h.c.notice, ''); assert.equal(text(h.view.status), '');
    } else {
        assert.equal(await h.c.action('favorite'), true); await settled();
        assert.equal(h.writes.length, writes + 1); assert.equal(h.c.record().favorite, true);
        assert.equal(h.raw[Prompts.KEY].records[0].favorite, true); assert.equal(h.c.notice, 'favorite');
        assert.match(text(h.view.status), /Favorite updated/);
    }
    assert.equal(h.c.error, null); assert.equal(h.c.pendingCommand, null);
});

test('read-owned failure with no rejected mutation clears on the real recovery notification', async t => {
    const h = await mount(t); await interruptRestore(h);
    assert.deepEqual(h.c.error, { code: 'WORKSPACE_RESTORE_PENDING', scope: 'read' });
    assert.equal(h.c.linkedPromptUnavailable, true);
    assert.ok(h.view.status.querySelectorAll('button').find(button => button.textContent === 'Read again'));
    await recover(h);
    assert.equal(h.c.error, null); assert.equal(h.c.linkedPromptUnavailable, false);
    assert.equal(h.c.notice, ''); assert.equal(text(h.view.status), ''); assert.equal(h.c.record().favorite, false);
});

test('failed background reads preserve validation-owned save feedback and its exact draft', async t => {
    const h = setup(), c = h.controller; t.after(() => c.dispose()); await c.start(); await add(c);
    c.edit(); c.update('title', ' '); assert.equal(await c.save(), false); await settled();
    const failure = c.error, draft = JSON.stringify(c.draft()), raw = h.raw, writes = h.writes, read = h.backend.read;
    assert.equal(failure.scope, 'save'); h.backend.read = async () => { throw new Error('Synthetic failed read'); };
    await c.refresh(); assert.equal(c.linkedPromptUnavailable, true);
    assert.equal(c.error, failure); assert.equal(JSON.stringify(c.draft()), draft);
    h.backend.read = read; await c.refresh(); assert.equal(c.linkedPromptUnavailable, false); assert.equal(c.error, failure);
    assert.equal(JSON.stringify(c.draft()), draft); assert.deepEqual(h.raw, raw); assert.equal(h.writes, writes);
});

for (const outcome of ['success', 'failure']) test(`late superseded ${outcome} cannot change current feedback, snapshot or read eligibility`, async t => {
    const h = setup(), c = h.controller; t.after(() => c.dispose()); await c.start(); await add(c);
    c.edit(); c.update('title', ' '); assert.equal(await c.save(), false); await settled();
    const failure = c.error, oldState = copy(c.state), wait = deferred(), read = c.store.read.bind(c.store);
    c.store.read = () => wait.promise; const old = c.refresh();
    c.store.read = outcome === 'success' ? async () => { throw Prompts.fault('READ'); } : read;
    await c.refresh();
    const current = c.state, generation = c.readGeneration, unavailable = c.linkedPromptUnavailable;
    if (outcome === 'success') { oldState.revision += 100; wait.resolve(oldState); } else wait.reject(Prompts.fault('READ'));
    await old;
    assert.equal(c.readGeneration, generation); assert.equal(c.pendingReadGeneration, null);
    assert.equal(c.state, current); assert.equal(c.linkedPromptUnavailable, unavailable);
    assert.equal(c.error, failure); assert.equal(c.draft().input.title, ' ');
});

test('read recovery cannot clear an uncertain Favorite command or weaken exact retry guards', async t => {
    const h = setup(), c = h.controller; t.after(() => c.dispose()); await c.start(); await add(c);
    h.failOnce(); assert.equal(await c.action('favorite'), false); await settled();
    const operation = c.pendingCommand, failure = c.error, read = h.backend.read, writes = h.writes;
    assert.ok(operation); assert.equal(failure.scope, 'favorite'); assert.ok(Object.isFrozen(operation.command));
    const raw = h.raw;
    h.backend.read = async () => { throw new Error('Synthetic unavailable storage'); };
    await c.refresh(); assert.equal(c.linkedPromptUnavailable, true); assert.equal(c.pendingCommand, operation);
    assert.equal(c.error, failure); assert.equal(c.select(c.selected), true); assert.equal(c.error, failure);
    assert.equal(await c.action('favorite'), false); assert.equal(await c.save(), false); assert.equal(c.create(), false); assert.equal(c.discard(), false);
    h.backend.read = read; await c.refresh();
    assert.equal(c.linkedPromptUnavailable, false); assert.equal(c.pendingCommand, operation); assert.equal(c.error, failure);
    assert.equal(c.hasUncommittedWork(), true); assert.equal(c.pendingInspection, false);
    assert.equal(await c.retry(), true); await settled();
    assert.equal(c.pendingCommand, null); assert.equal(c.error, null); assert.equal(c.record().favorite, true);
    assert.equal(h.writes, writes, 'exact retry finds the receipt instead of toggling or writing again'); assert.deepEqual(h.raw, raw);
});
