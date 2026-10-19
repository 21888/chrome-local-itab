const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Controller } = require('../shared/local-ai-collections-controller.js');
const { fixture, Backup, Workspaces, Collections, Scratchpad, copy } = require('./helpers/complete-backup-acceptance.js');
const { createDocument } = require('./helpers/task-dom-model.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
const text = node => [node.textContent || '', ...node.children.map(text)].join('');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function settled() { for (let n = 0; n < 12; n++) await tick(); }

// Production Manager/createCollectionBackend/Store/Controller/View and reviewed
// complete-backup recovery. Only Chrome storage, events, locks and DOM are modeled.
function cleanFixture() {
    const f = fixture({ extra: false, trash: false });
    delete f.raw.__auth; f.raw.sync = { enabled: false }; f.raw.privacy = { onlineFavicons: false };
    return f;
}
async function seed(f, name) {
    let serial = 0;
    const store = new Collections.Store(f.workspaceManager.createCollectionBackend(Collections), {
        id: () => `${name}_token_${++serial}`, now: () => '2026-10-19T21:00:00.000Z'
    });
    await store.mutate(store.request('add', {
        title: `Synthetic ${name}`, body: '  Synthetic exact saved body\r\n中文 🧪\t',
        notes: 'Synthetic saved annotations', tags: ['Research, planning', '保留，原始标签']
    }));
    return store;
}
async function mount(t, kind = 'remove', start = true) {
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
    const root = { document: doc, LocalItabAICollections: Collections, addEventListener() {}, removeEventListener() {} };
    const context = vm.createContext({ window: root, Intl, Date, Object, Array, Boolean, String, Promise, Map });
    for (const file of ['dialog-focus', 'local-ai-collections-view']) vm.runInContext(fs.readFileSync(`${__dirname}/../shared/${file}.js`, 'utf8'), context);
    const view = new root.LocalItabCollectionsView.View({ host, controller: c }), trace = [], render = c.onChange;
    // Match native status.textContent/replaceChildren without changing the shared
    // DOM model: old own text must not survive replacement with an error subtree.
    let ownStatus = '';
    const replaceStatus = view.status.replaceChildren.bind(view.status);
    view.status.replaceChildren = (...nodes) => { ownStatus = ''; replaceStatus(...nodes); };
    Object.defineProperty(view.status, 'textContent', {
        get() { return ownStatus; }, set(value) { view.status.replaceChildren(); ownStatus = value; }
    });
    c.onChange = change => { render(change); trace.push({ change, error: c.error, status: text(view.status) }); };
    let refreshes = 0; const refresh = c.refresh.bind(c);
    c.refresh = (...args) => { refreshes++; return refresh(...args); };
    view.render(); if (start) { await c.start(); await settled(); }
    if (kind === 'restore') { assert.equal(await c.action('remove'), true); await settled(); c.filter({ mode: 'trash' }); }
    return { ...f, c, view, doc, trace, events, collectionStore: store, get refreshes() { return refreshes; } };
}
async function interruptRestore(h) {
    const incoming = cleanFixture(); await seed(incoming, 'incoming');
    incoming.values('default')[Scratchpad.KEY].content = 'Synthetic incoming note';
    const plan = await h.store.review(await incoming.store.export(Backup.MODULES.filter(name => name !== 'prompts')), null, { collectionTarget: 'global-collections' });
    let current = true;
    h.hooks.set = (values, raw) => {
        Object.assign(raw, copy(values));
        if (values[Workspaces.RESTORE_TRANSACTION_KEY]?.status === 'prepared') current = false;
    };
    await assert.rejects(h.store.restore(plan, { confirmed: true, isCurrent: () => current }), { code: 'UNCONFIRMED' });
    delete h.hooks.set; await settled();
    assert.equal(h.raw[Workspaces.RESTORE_TRANSACTION_KEY].status, 'prepared');
    assert.deepEqual(h.c.error, { code: 'RESTORE_PENDING', scope: 'read' });
}
async function failedAction(h, kind) {
    const before = copy(h.raw), writes = h.writes.length, start = h.trace.length;
    const button = h.view.main.querySelectorAll('button').find(node => node.textContent === (kind === 'remove' ? 'Archive' : 'Restore from archive'));
    assert.ok(button); assert.equal(Boolean(button.disabled), false);
    let action; const original = h.c.action.bind(h.c);
    h.c.action = (...args) => (action = original(...args));
    button.dispatch('click'); assert.equal(await action, false); h.c.action = original; await settled();
    const failure = h.trace.slice(start).find(row => row.error?.scope === kind);
    assert.deepEqual(failure?.error, { code: 'RESTORE_PENDING', scope: kind });
    assert.equal(h.writes.length, writes, 'rejected Archive/Restore submits zero storage writes');
    assert.deepEqual(h.raw, before, 'rejected Archive/Restore preserves all raw storage');
    assert.equal(Boolean(h.c.record().deletedAt), kind === 'restore', 'the requested Archive/Restore intent is still unsatisfied');
    assert.equal(h.c.pendingCommand, null); assert.equal(h.c.pendingInspection, false);
    assert.equal(h.c.notice, ''); assert.equal(h.c.hasUncommittedWork(), false);
    return failure;
}
async function recover(h) {
    const beforeEvents = h.events.length, beforeRefreshes = h.refreshes;
    const before = copy(h.raw), writes = h.writes.length;
    const review = await h.store.inspectInterruptedRestore(); assert.equal(review.outcome, 'previous-present');
    assert.equal((await h.store.recoverInterruptedRestore(review, { confirmed: true })).recovered, true);
    await settled();
    assert.deepEqual(h.events.slice(beforeEvents), [{ keys: [Workspaces.RESTORE_TRANSACTION_KEY], marker: 'recovered' }]);
    assert.equal(h.refreshes, beforeRefreshes + 1, 'real recovery marker alone schedules one collection refresh');
    assert.deepEqual(h.writes.slice(writes), [before[Workspaces.RESTORE_TRANSACTION_KEY].prior, {
        [Workspaces.RESTORE_TRANSACTION_KEY]: h.raw[Workspaces.RESTORE_TRANSACTION_KEY]
    }], 'reviewed recovery restores the same prior authorities, then marks recovery; no user action is replayed');
    assert.deepEqual(h.raw, { ...before, [Workspaces.RESTORE_TRANSACTION_KEY]: h.raw[Workspaces.RESTORE_TRANSACTION_KEY] });
}
function refreshButton(h) {
    const button = h.view.status.querySelectorAll('button').find(node => node.textContent === 'Refresh saved data');
    assert.ok(button, 'read-only refresh stays reachable for operation-owned feedback');
    assert.equal(Boolean(button.disabled), false); assert.equal(button.isConnected, true);
    return button;
}

test('initial, pending and failed first reads cannot authorize replacement before a confirmed snapshot exists', async t => {
    const h = await mount(t, 'remove', false);
    assert.equal(h.c.state, null); assert.equal(h.c.readGeneration, 0); assert.equal(h.c.comparisonReadGeneration, null);
    assert.equal(h.c.pendingReadGeneration, null); assert.equal(h.c.replacementReady(), false); assert.equal(h.view.importButton.disabled, true);
    const wait = deferred(); h.hooks.read = () => wait.promise;
    const starting = h.c.start();
    assert.equal(h.c.state, null); assert.equal(h.c.pendingReadGeneration, h.c.readGeneration);
    assert.equal(h.c.comparisonReadGeneration, null); assert.equal(h.c.replacementReady(), false); assert.equal(h.view.importButton.disabled, true);
    wait.reject(new Error('Synthetic failed first read')); await starting; await settled();
    assert.equal(h.c.state, null); assert.equal(h.c.pendingReadGeneration, null); assert.equal(h.c.comparisonReadGeneration, null);
    assert.equal(h.c.error.scope, 'read'); assert.equal(h.c.replacementReady(), false); assert.equal(h.view.importButton.disabled, true);
    delete h.hooks.read; refreshButton(h).dispatch('click'); await settled();
    assert.deepEqual(h.c.state, h.raw[Collections.KEY]); assert.equal(h.c.error, null);
    assert.equal(h.c.comparisonReadGeneration, h.c.readGeneration); assert.equal(h.c.replacementReady(), true); assert.equal(h.view.importButton.disabled, false);
});

for (const kind of ['remove', 'restore']) {
    test(`rejected ${kind} owns its feedback through the automatic failed read without writes`, async t => {
        const h = await mount(t, kind); await interruptRestore(h); const failure = await failedAction(h, kind);
        assert.equal(h.c.pendingReadGeneration, null);
        assert.notEqual(h.c.comparisonReadGeneration, h.c.readGeneration); assert.equal(h.c.comparisonReady(), false);
        assert.equal(h.c.replacementReady(), false, 'a failed read cannot authorize replacement review');
        assert.equal(h.view.importButton.disabled, true);
        assert.equal(h.c.error, failure.error, 'a background read failure must not replace operation-owned feedback');
        assert.equal(text(h.view.status), failure.status); assert.equal(h.view.status.classList.contains('error'), true);
        assert.doesNotMatch(text(h.view.status), /Saved locally/); refreshButton(h);
    });

    test(`real reviewed recovery refreshes confirmed state but retains rejected ${kind} feedback`, async t => {
        const h = await mount(t, kind); await interruptRestore(h); const failure = await failedAction(h, kind);
        const confirmed = h.c.state, collectionBytes = JSON.stringify(h.raw[Collections.KEY]); await recover(h);
        assert.notEqual(h.c.state, confirmed, 'recovery notification accepts a fresh confirmed snapshot');
        assert.deepEqual(h.c.state, h.raw[Collections.KEY]); assert.equal(JSON.stringify(h.raw[Collections.KEY]), collectionBytes);
        assert.equal(Boolean(h.c.record().deletedAt), kind === 'restore', 'read recovery does not perform the rejected action');
        assert.equal(h.c.pendingCommand, null); assert.equal(h.c.pendingReadGeneration, null); assert.equal(h.c.notice, '');
        assert.equal(h.c.comparisonReadGeneration, h.c.readGeneration, 'saved data was freshly read after recovery');
        assert.equal(h.c.error, failure.error, 'a successful read is not success of the rejected Archive/Restore');
        assert.equal(text(h.view.status), failure.status); assert.equal(h.view.status.classList.contains('error'), true);
    });

    test(`visible read-only refresh with ${kind}-owned feedback never replays the rejected action`, async t => {
        const h = await mount(t, kind); await interruptRestore(h); const failure = await failedAction(h, kind);
        let before = copy(h.raw), writes = h.writes.length, refreshes = h.refreshes;
        refreshButton(h).dispatch('click'); await settled();
        assert.equal(h.refreshes, refreshes + 1); assert.equal(h.writes.length, writes); assert.deepEqual(h.raw, before);
        assert.equal(h.c.error, failure.error); assert.notEqual(h.c.comparisonReadGeneration, h.c.readGeneration);
        await recover(h);
        before = copy(h.raw); writes = h.writes.length; refreshes = h.refreshes;
        refreshButton(h).dispatch('click'); await settled();
        assert.equal(h.refreshes, refreshes + 1); assert.equal(h.writes.length, writes); assert.deepEqual(h.raw, before);
        assert.equal(h.c.error, failure.error); assert.equal(h.c.pendingCommand, null);
        assert.equal(h.c.comparisonReadGeneration, h.c.readGeneration);
        assert.equal(Boolean(h.c.record().deletedAt), kind === 'restore');
        assert.equal(text(h.view.status), failure.status);
    });

    for (const next of ['select', 'action']) test(`explicit ${next} clears recovered ${kind} failure according to the existing contract`, async t => {
        const h = await mount(t, kind); await interruptRestore(h); await failedAction(h, kind); await recover(h);
        const before = copy(h.raw), writes = h.writes.length;
        if (next === 'select') {
            assert.equal(h.c.select(h.c.selected), true); assert.deepEqual(h.raw, before); assert.equal(h.writes.length, writes);
            assert.equal(Boolean(h.c.record().deletedAt), kind === 'restore');
            assert.equal(h.c.notice, ''); assert.equal(text(h.view.status), ''); assert.equal(h.c.comparisonReady(), true);
        } else {
            assert.equal(await h.c.action(kind), true); await settled();
            assert.equal(h.writes.length, writes + 1); assert.equal(Boolean(h.c.record().deletedAt), kind === 'remove');
            assert.equal(Boolean(h.raw[Collections.KEY].records[0].deletedAt), kind === 'remove');
            assert.equal(h.c.notice, kind); assert.match(text(h.view.status), /Saved locally/);
        }
        assert.equal(h.c.error, null); assert.equal(h.c.pendingCommand, null);
    });
}

test('read-owned failure with no rejected mutation clears on the real recovery notification', async t => {
    const h = await mount(t); await interruptRestore(h);
    assert.deepEqual(h.c.error, { code: 'RESTORE_PENDING', scope: 'read' });
    assert.equal(h.c.comparisonReady(), false); refreshButton(h); await recover(h);
    assert.equal(h.c.error, null); assert.equal(h.c.comparisonReady(), true);
    assert.equal(h.c.notice, ''); assert.equal(text(h.view.status), ''); assert.equal(h.c.record().deletedAt, null);
});

for (const clearFeedback of [false, true]) test(`unverified saved state blocks replacement review even with ${clearFeedback ? 'explicitly cleared' : 'retained operation'} feedback`, async t => {
    const h = await mount(t), source = await h.collectionStore.export();
    await interruptRestore(h); await failedAction(h, 'remove');
    if (clearFeedback) { assert.equal(h.c.select(h.c.selected), true); assert.equal(h.c.error, null); }
    const before = copy(h.raw), writes = h.writes.length, review = h.collectionStore.review.bind(h.collectionStore), read = h.collectionStore.read.bind(h.collectionStore);
    let reviews = 0, reads = 0;
    h.collectionStore.review = (...args) => { reviews++; return review(...args); };
    h.collectionStore.read = (...args) => { reads++; return read(...args); };
    assert.notEqual(h.c.comparisonReadGeneration, h.c.readGeneration);
    assert.equal(h.c.replacementReady(), false, 'replacement readiness needs current successful read proof independently of error scope');
    assert.equal(h.view.importButton.disabled, true);
    assert.equal(await h.c.reviewReplacement(source), null); assert.equal(reviews, 0);
    assert.equal(await h.c.reviewReplacement(null, 'synthetic_recovery'), null); assert.equal(reads, 0);
    assert.deepEqual(h.raw, before); assert.equal(h.writes.length, writes);
    await recover(h);
    assert.equal(h.c.comparisonReadGeneration, h.c.readGeneration); assert.equal(h.c.replacementReady(), true);
    assert.equal(h.view.importButton.disabled, false);
    const recovered = copy(h.raw), recoveredWrites = h.writes.length;
    assert.ok(await h.c.reviewReplacement(source)); assert.equal(reviews, 1);
    assert.deepEqual(h.raw, recovered); assert.equal(h.writes.length, recoveredWrites, 'review becomes available after recovery but still never writes');
});

for (const outcome of ['success', 'failure']) test(`superseded ${outcome} cannot alter the current replacement-read proof after operation failure`, async t => {
    const h = await mount(t); await interruptRestore(h); await failedAction(h, 'remove'); await recover(h);
    const oldState = copy(h.c.state), wait = deferred(), read = h.collectionStore.read.bind(h.collectionStore);
    h.collectionStore.read = () => wait.promise; const old = h.c.refresh();
    assert.equal(h.c.replacementReady(), false); assert.equal(h.view.importButton.disabled, true);
    h.collectionStore.read = outcome === 'success' ? async () => { throw Collections.fault('READ'); } : read;
    await h.c.refresh();
    const current = h.c.state, failure = h.c.error, proof = h.c.comparisonReadGeneration, generation = h.c.readGeneration;
    const available = outcome === 'failure';
    assert.equal(h.c.replacementReady(), available); assert.equal(h.view.importButton.disabled, !available);
    if (outcome === 'success') { oldState.revision += 100; wait.resolve(oldState); } else wait.reject(Collections.fault('READ'));
    await old;
    assert.equal(h.c.state, current); assert.equal(h.c.error, failure); assert.equal(h.c.comparisonReadGeneration, proof);
    assert.equal(h.c.readGeneration, generation); assert.equal(h.c.pendingReadGeneration, null);
    assert.equal(h.c.replacementReady(), available); assert.equal(h.view.importButton.disabled, !available);
});

test('real workspace selection cannot clear global collection feedback or authorize an unverified replacement', async t => {
    const h = await mount(t), alternate = await h.workspaceManager.create('Synthetic alternate');
    await settled(); await interruptRestore(h); const failure = await failedAction(h, 'remove'); await recover(h);
    h.hooks.read = async (keys, raw) => {
        if (keys?.includes(Collections.KEY)) throw new Error('Synthetic collection-only read failure');
        return copy(keys === null ? raw : Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]])));
    };
    await h.c.refresh();
    const collection = copy(h.raw[Collections.KEY]), state = h.c.state, generation = h.c.readGeneration, proof = h.c.comparisonReadGeneration;
    const refreshes = h.refreshes, events = h.events.length, writes = h.writes.length;
    assert.equal(h.c.replacementReady(), false);
    await h.workspaceManager.select(alternate.id); await settled();
    assert.equal(h.raw[Workspaces.REGISTRY_KEY].lastUsedId, alternate.id);
    assert.deepEqual(h.events.slice(events), [{ keys: [Workspaces.REGISTRY_KEY], marker: 'recovered' }]);
    assert.deepEqual(h.writes.slice(writes).map(value => Object.keys(value)), [[Workspaces.REGISTRY_KEY]]);
    assert.deepEqual(h.raw[Collections.KEY], collection); assert.equal(h.c.state, state);
    assert.equal(h.refreshes, refreshes, 'global collection backend does not treat workspace selection as a collection read');
    assert.equal(h.c.readGeneration, generation); assert.equal(h.c.comparisonReadGeneration, proof);
    assert.equal(h.c.error, failure.error); assert.equal(h.c.replacementReady(), false); assert.equal(h.view.importButton.disabled, true);
    delete h.hooks.read; refreshButton(h).dispatch('click'); await settled();
    assert.equal(h.c.comparisonReadGeneration, h.c.readGeneration); assert.equal(h.c.replacementReady(), true);
    assert.equal(h.c.error, failure.error); assert.deepEqual(h.raw[Collections.KEY], collection);
});

test('rejected metadata Save retains its exact draft and feedback through real recovery', async t => {
    const h = await mount(t); assert.equal(h.c.edit(), true);
    h.c.update('notes', '  Synthetic UNSAVED annotations\r\n中文 🧪\t');
    h.c.update('title', 'Synthetic revised title'); h.c.update('sourceUrl', 'https://example.com/synthetic');
    const draft = h.c.draft(), draftBytes = JSON.stringify(draft), saved = copy(h.raw[Collections.KEY]);
    await interruptRestore(h); const before = copy(h.raw), writes = h.writes.length, start = h.trace.length;
    assert.equal(await h.c.save(), false); await settled();
    const failure = h.trace.slice(start).find(row => row.error?.scope === 'save');
    assert.deepEqual(failure?.error, { code: 'RESTORE_PENDING', scope: 'save' });
    assert.deepEqual(h.raw, before); assert.equal(h.writes.length, writes);
    assert.equal(h.c.error, failure.error); await recover(h);
    assert.equal(h.c.draft(), draft); assert.equal(JSON.stringify(h.c.draft()), draftBytes);
    assert.deepEqual(h.raw[Collections.KEY], saved); assert.equal(h.c.dirty(), true); assert.equal(h.c.hasUncommittedWork(), true);
    assert.equal(h.c.pendingCommand, null); assert.equal(h.c.error, failure.error); assert.equal(h.c.notice, '');
    assert.equal(text(h.view.status), failure.status); assert.equal(h.view.editor.fields.notes.value, draft.input.notes);
    assert.equal(h.view.editor.fields.body.value, saved.records[0].body);
});

test('failed background reads preserve validation-owned Save feedback and its exact draft', async t => {
    const h = await mount(t); h.c.edit(); h.c.update('title', ' '); h.c.update('notes', '  Synthetic invalid-title draft\r\n🧪');
    assert.equal(await h.c.save(), false); await settled();
    const failure = h.c.error, draft = JSON.stringify(h.c.draft()), before = copy(h.raw), writes = h.writes.length;
    assert.deepEqual(failure, { code: 'TEXT', scope: 'save' });
    h.hooks.read = async () => { throw new Error('Synthetic unavailable storage'); };
    await h.c.refresh(); assert.equal(h.c.error, failure); assert.equal(JSON.stringify(h.c.draft()), draft);
    assert.notEqual(h.c.comparisonReadGeneration, h.c.readGeneration);
    delete h.hooks.read; await h.c.refresh(); assert.equal(h.c.error, failure);
    assert.equal(JSON.stringify(h.c.draft()), draft); assert.deepEqual(h.raw, before); assert.equal(h.writes.length, writes);
    assert.equal(h.c.comparisonReadGeneration, h.c.readGeneration); assert.equal(h.c.pendingCommand, null);
});

for (const outcome of ['success', 'failure']) test(`late superseded read ${outcome} cannot change current feedback, snapshot or read proof`, async t => {
    const h = await mount(t); h.c.edit(); h.c.update('title', ' '); assert.equal(await h.c.save(), false); await settled();
    const failure = h.c.error, oldState = copy(h.c.state), wait = deferred(), read = h.collectionStore.read.bind(h.collectionStore);
    h.collectionStore.read = () => wait.promise; const old = h.c.refresh();
    h.collectionStore.read = outcome === 'success' ? async () => { throw Collections.fault('READ'); } : read;
    await h.c.refresh();
    const current = h.c.state, generation = h.c.readGeneration, proof = h.c.comparisonReadGeneration;
    if (outcome === 'success') { oldState.revision += 100; wait.resolve(oldState); } else wait.reject(Collections.fault('READ'));
    await old;
    assert.equal(h.c.readGeneration, generation); assert.equal(h.c.pendingReadGeneration, null);
    assert.equal(h.c.state, current); assert.equal(h.c.comparisonReadGeneration, proof);
    assert.equal(h.c.error, failure); assert.equal(h.c.draft().input.title, ' ');
});

for (const kind of ['remove', 'restore']) for (const resolution of ['retry', 'verify']) {
    test(`read recovery keeps uncertain ${kind} locked until explicit ${resolution} proves its exact outcome without replay`, async t => {
        const h = await mount(t, kind);
        h.hooks.set = (values, raw) => { Object.assign(raw, copy(values)); delete h.hooks.set; throw new Error('Synthetic lost write acknowledgement'); };
        assert.equal(await h.c.action(kind), false); await settled();
        const operation = h.c.pendingCommand, failure = h.c.error, before = copy(h.raw), writes = h.writes.length;
        assert.ok(operation); assert.equal(failure.scope, kind); assert.ok(Object.isFrozen(operation.command));
        assert.equal(operation.command.kind, kind); assert.equal(operation.command.id, h.c.selected);
        assert.equal(Boolean(h.raw[Collections.KEY].records[0].deletedAt), kind === 'remove');
        const commands = [], inspections = [], mutate = h.collectionStore.mutate.bind(h.collectionStore), inspect = h.collectionStore.inspectOperation.bind(h.collectionStore);
        h.collectionStore.mutate = (...args) => { commands.push(args[0]); return mutate(...args); };
        h.collectionStore.inspectOperation = command => { inspections.push(command); return inspect(command); };
        h.hooks.read = async () => { throw new Error('Synthetic unavailable storage'); };
        await h.c.refresh(); assert.equal(h.c.error, failure); assert.equal(h.c.pendingCommand, operation);
        assert.equal(h.c.select(h.c.selected), true); assert.equal(h.c.error, failure);
        assert.equal(await h.c.action(kind), false); assert.equal(await h.c.save(), false);
        assert.equal(h.c.create(), false); assert.equal(h.c.edit(), false); assert.equal(h.c.discard(), false);
        delete h.hooks.read; refreshButton(h).dispatch('click'); await settled();
        assert.equal(h.c.error, failure); assert.equal(h.c.pendingCommand, operation); assert.equal(h.c.pendingInspection, false);
        assert.equal(h.c.hasUncommittedWork(), true); assert.equal(h.c.notice, '');
        assert.deepEqual(commands, []); assert.deepEqual(inspections, []); assert.deepEqual(h.raw, before); assert.equal(h.writes.length, writes);
        const label = resolution === 'retry' ? 'Check / retry the same save' : 'Check saved outcome (read-only)';
        const button = h.view.status.querySelectorAll('button').find(node => node.textContent === label);
        assert.ok(button); assert.equal(Boolean(button.disabled), false);
        let result; const original = h.c[resolution].bind(h.c);
        h.c[resolution] = () => (result = original()); button.dispatch('click'); assert.equal(await result, true); await settled();
        assert.deepEqual(commands, resolution === 'retry' ? [operation.command] : []);
        assert.deepEqual(inspections, resolution === 'verify' ? [operation.command] : []);
        if (commands.length) assert.equal(commands[0], operation.command, 'retry reuses the original frozen command');
        if (inspections.length) assert.equal(inspections[0], operation.command, 'read-only verification inspects the original frozen command');
        assert.equal(h.c.pendingCommand, null); assert.equal(h.c.error, null); assert.equal(h.c.pendingInspection, false);
        assert.equal(h.c.notice, resolution === 'verify' ? 'reconciled' : kind);
        assert.deepEqual(h.raw, before); assert.equal(h.writes.length, writes, 'receipt proof never replays or repeats the already committed mutation');
    });
}
