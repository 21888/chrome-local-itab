const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');
const tasks = require('../shared/local-tasks-store.js');
const { Controller } = require('../shared/local-tasks-controller.js');
const clone = value => structuredClone(value);
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { await tick(); await tick(); await tick(); }
function initial() {
    return tasks.validate({ schemaVersion: 1, revision: 4, enabled: true, pinnedId: 'task_0001', receipts: ['prior_operation'],
        records: Array.from({ length: 7 }, (_, i) => ({ id: `task_000${i}`, version: `version_${i}`,
            text: i < 2 ? '  duplicate 中文 😀\ntext  ' : `Synthetic task ${i}`, state: i === 5 ? 'done' : i === 6 ? 'removed' : 'active',
            removedFrom: i === 6 ? 'done' : null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' })),
        recovery: [{ id: 'recovery_1', createdAt: '2026-10-03T00:00:00.000Z', content: { records: [], pinnedId: null } }] });
}
// These are deliberate mutable-public-field boundary probes, not a model of
// normal workspace navigation. Every Controller result comes from real I/O.
// The synthetic backend captures a fixed target for each lock callback, so
// workspace-field injection cannot reroute that transaction's verification.
function model({ state = initial(), workspace = { id: 'workspace_0001', generation: 'generation_0001' }, prefix = 'original' } = {}) {
    const identities = new WeakMap(), sources = new Map(), listeners = new Set();
    let identity = 0, queue = Promise.resolve(), operation = 0, seed = clone(state), activeTarget = null;
    const backend = {
        workspace, requests: 0, reads: 0, writes: 0, mode: null, writeGate: null, nextReadFails: false,
        lock(fn) { const target = source(); const next = queue.then(async () => { activeTarget = target; try { return await fn(); } finally { activeTarget = null; } }); queue = next.catch(() => {}); return next; },
        async read() { backend.reads++; if (backend.nextReadFails) { backend.nextReadFails = false; throw Error('synthetic read failure'); } return clone((activeTarget || source()).raw); },
        async write(value) {
            backend.writes++; const target = activeTarget || source(), gate = backend.writeGate, mode = backend.mode;
            backend.writeGate = null; backend.mode = null; if (gate) await gate.promise;
            if (mode === 'false') return false; if (mode === 'drop') return;
            target.raw = clone(value); if (mode === 'ack') throw Error('synthetic lost acknowledgement');
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        raw: () => clone(source().raw), allRaw: () => clone([...sources.entries()]),
        seedNewSources(value) { seed = clone(value); }
    };
    function source() {
        const current = backend.workspace;
        if (current && !identities.has(current)) identities.set(current, ++identity);
        const key = current ? `${identities.get(current)}:${current.id}:${current.generation}` : 'legacy';
        if (!sources.has(key)) sources.set(key, { raw: clone(seed) });
        return sources.get(key);
    }
    const store = new tasks.Store(backend, { id: () => `${prefix}_operation_${++operation}`, now: () => '2026-10-18T04:00:00.000Z' });
    const request = store.request.bind(store); store.request = (...args) => { backend.requests++; return request(...args); };
    const controller = new Controller(store), remote = new tasks.Store(backend), api = { ...tasks, Controller };
    const document = createDocument({ blurUnavailableFocus: true }), host = document.createElement('article'), search = document.createElement('input');
    document.body.append(search, host); search.focus();
    const window = { LocalItabTasks: api, LocalItabWorkspaces: { session: workspace }, LocalItabContentLifecycle: { departing: false } };
    const context = vm.createContext({ window, document, crypto: webcrypto, URL, Blob, setTimeout, console });
    for (const file of ['dialog-focus.js', 'local-tasks-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared', file), 'utf8'), context);
    const view = api.mount(host, { controller });
    return { backend, store, remote, controller, document, host, search, window, view };
}
const record = (h, id = 'task_0000') => h.backend.raw().records.find(task => task.id === id);
const row = (h, id = 'task_0000') => h.host.querySelectorAll('[data-task-id]').find(node => node.dataset.taskId === id);
const button = (parent, label) => parent?.querySelectorAll('button').find(node => node.textContent === label);
const modal = h => h.document.querySelector('.tasks-dialog');
const input = (node, value) => { node.value = value; node.dispatch('input'); };
const io = h => ({ requests: h.backend.requests, reads: h.backend.reads, writes: h.backend.writes });
const delta = (before, after) => Object.fromEntries(Object.keys(before).map(key => [key, after[key] - before[key]]));
const feedback = h => ({ state: h.controller.state, error: h.controller.error, retry: h.controller.retryCommand, status: h.controller.status });
function sameFeedback(h, before) {
    assert.strictEqual(h.controller.state, before.state); assert.strictEqual(h.controller.error, before.error);
    assert.strictEqual(h.controller.retryCommand, before.retry); assert.equal(h.controller.status, before.status);
}
function capture(h) { return { workspace: h.backend.workspace, id: h.backend.workspace?.id, generation: h.backend.workspace?.generation, session: h.window.LocalItabWorkspaces.session }; }
function restore(h, owner) {
    h.view.controller = h.controller; h.controller.store = h.store; h.store.backend = h.backend; h.view.host = h.host;
    h.backend.workspace = owner.workspace;
    if (owner.workspace) { owner.workspace.id = owner.id; owner.workspace.generation = owner.generation; }
    h.window.LocalItabWorkspaces.session = owner.session;
}
function change(h, kind, foreign) {
    if (kind === 'controller') h.view.controller = foreign.controller;
    else if (kind === 'store') h.controller.store = foreign.store;
    else if (kind === 'backend') h.store.backend = foreign.backend;
    else if (kind === 'workspace') { h.backend.workspace = { ...h.backend.workspace }; h.window.LocalItabWorkspaces.session = h.backend.workspace; }
    else if (kind === 'id') h.backend.workspace.id = 'workspace_0002';
    else if (kind === 'generation') h.backend.workspace.generation = 'generation_0002';
    else if (kind === 'session') h.window.LocalItabWorkspaces.session = { ...h.backend.workspace };
    else if (kind === 'host') { const replacement = h.document.createElement('article'); h.document.body.append(replacement); h.view.host = replacement; }
}
const sources = ['controller', 'store', 'backend', 'workspace', 'id', 'generation', 'session', 'host'];
const text = '  quick 中文 😀\nplain <b>text</b>  ';
const routes = ['button', 'form', 'Enter'];
function add(h, route = 'button') {
    return route === 'button' ? h.view.addButton.dispatch('click') : route === 'form' ? h.view.form.dispatch('submit') : h.view.input.dispatch('keydown', { key: 'Enter' });
}
async function pair() {
    const h = model(); await settle(); const owner = capture(h);
    const foreign = model({ state: h.backend.raw(), workspace: owner.workspace, prefix: 'foreign' }); await settle();
    return { h, owner, foreign };
}
function cleanup(h, owner, foreign) { restore(h, owner); h.view.destroy(); foreign?.view.destroy(); }
function draft(h) { return { value: h.view.input.value, generation: h.view.draftGeneration, composing: h.view.quickEntryComposing,
    settling: h.view.quickEntryCompositionSettling, epoch: h.view.quickEntryCompositionEpoch, focus: h.document.activeElement,
    effect: h.view.retryEffect, failure: h.view.retryFailure, operationId: h.view.retryEffectOperationId, undo: h.view.undo, action: h.view.actionGeneration }; }
function sameDraft(h, before) { for (const [key, value] of Object.entries(before)) assert.strictEqual(draft(h)[key], value, `draft/effect ${key}`); }
function added(h, command, value = text) {
    const raw = h.backend.raw(); assert.equal(raw.records.filter(task => task.id === command.operationId).length, 1);
    assert.equal(raw.records.find(task => task.id === command.operationId).text, value);
    assert.equal(raw.receipts.filter(id => id === command.operationId).length, 1);
    assert.deepEqual(raw.records.slice(0, initial().records.length), initial().records);
    assert.deepEqual(raw.recovery, initial().recovery); assert.equal(raw.pinnedId, initial().pinnedId);
}

for (const source of sources) for (const route of routes) test(`quick ${route} Add refuses ${source} substitution before request and resumes original source`, async t => {
    const { h, owner, foreign } = await pair();
    try {
        input(h.view.input, text); h.view.input.focus(); change(h, source, foreign); h.backend.raw();
        const own = io(h), other = io(foreign), ownRaw = h.backend.allRaw(), otherRaw = foreign.backend.allRaw(), before = draft(h), ownFeedback = feedback(h), otherFeedback = feedback(foreign);
        add(h, route); await settle();
        t.diagnostic(JSON.stringify({ source, route, own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert.deepEqual(io(h), own, 'rejected quick Add constructs no original command'); assert.deepEqual(io(foreign), other);
        assert.deepEqual(h.backend.allRaw(), ownRaw); assert.deepEqual(foreign.backend.allRaw(), otherRaw); sameFeedback(h, ownFeedback); sameFeedback(foreign, otherFeedback); sameDraft(h, before);
        restore(h, owner); h.view.render(); const counts = io(h); add(h, route); const command = h.controller.retryCommand; assert(command); await settle();
        added(h, command); assert.equal(h.backend.requests, counts.requests + 1); assert.equal(h.backend.writes, counts.writes + 1); assert.equal(h.view.input.value, '');
    } finally { cleanup(h, owner, foreign); }
});

for (const source of sources) test(`quick Add rechecks ${source} substitution during request return before captured dispatch`, async t => {
    const { h, owner, foreign } = await pair(), request = h.store.request;
    try {
        input(h.view.input, text); const before = draft(h); let observed = 0;
        h.store.request = (...args) => { const command = request(...args); observed++; change(h, source, foreign); return command; };
        const own = io(h), other = io(foreign), ownFeedback = feedback(h), otherFeedback = feedback(foreign), ownRaw = h.backend.allRaw(), otherRaw = foreign.backend.allRaw();
        add(h, 'form'); await settle();
        t.diagnostic(JSON.stringify({ source, observed, own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert.equal(observed, 1); assert.deepEqual(delta(own, io(h)), { requests: 1, reads: 0, writes: 0 }); assert.deepEqual(io(foreign), other);
        // Reading a new synthetic source creates its empty adapter slot only; no transaction wrote it.
        assert.deepEqual(h.backend.allRaw(), ownRaw); assert.deepEqual(foreign.backend.allRaw(), otherRaw); sameFeedback(h, ownFeedback); sameFeedback(foreign, otherFeedback); sameDraft(h, before);
        h.store.request = request; restore(h, owner); add(h); const command = h.controller.retryCommand; await settle(); added(h, command);
    } finally { h.store.request = request; cleanup(h, owner, foreign); }
});

for (const mode of ['false', 'drop', 'ack']) for (const source of sources) test(`quick exact Retry refuses ${source} gap after ${mode} and preserves original command and receipt`, async t => {
    const { h, owner, foreign } = await pair();
    try {
        input(h.view.input, text); h.backend.mode = mode; add(h, 'Enter'); await settle(); const command = h.controller.retryCommand; assert(command);
        assert.equal(h.controller.error.code, mode === 'drop' ? 'VERIFY' : 'WRITE');
        h.backend.seedNewSources(h.backend.raw()); change(h, source, foreign); h.backend.raw();
        const own = io(h), other = io(foreign), ownRaw = h.backend.allRaw(), otherRaw = foreign.backend.allRaw(), before = draft(h), ownFeedback = feedback(h), otherFeedback = feedback(foreign);
        await h.view.retryLast(); await settle();
        t.diagnostic(JSON.stringify({ mode, source, own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); assert.deepEqual(h.backend.allRaw(), ownRaw); assert.deepEqual(foreign.backend.allRaw(), otherRaw);
        sameFeedback(h, ownFeedback); sameFeedback(foreign, otherFeedback); sameDraft(h, before);
        restore(h, owner); h.view.render(); const resumed = io(h); await h.view.retryLast(); await settle(); added(h, command);
        assert.equal(h.backend.requests, resumed.requests); assert.equal(h.backend.writes, resumed.writes + (mode === 'ack' ? 0 : 1)); assert.equal(h.view.input.value, '');
    } finally { cleanup(h, owner, foreign); }
});

for (const mode of ['success', 'false', 'drop', 'ack']) for (const source of sources) test(`issued quick Add ${mode} preserves source-gap original draft and foreign feedback (${source})`, async t => {
    const { h, owner, foreign } = await pair(), gate = deferred();
    try {
        input(h.view.input, text); h.view.input.focus(); h.backend.writeGate = gate; if (mode !== 'success') h.backend.mode = mode;
        add(h); await settle(); const command = h.controller.retryCommand; assert(command); assert(h.controller.pending);
        // Same exact command in a real foreign failed transaction may not be mistaken for ours.
        foreign.backend.mode = 'false'; await assert.rejects(foreign.controller.run(command));
        const other = io(foreign), otherFeedback = feedback(foreign), otherRaw = foreign.backend.allRaw(); change(h, source, foreign);
        const before = draft(h); gate.resolve(); await settle();
        t.diagnostic(JSON.stringify({ mode, source, originalStatus: h.controller.status, originalError: h.controller.error?.code || null, foreign: delta(other, io(foreign)) }));
        assert.equal(h.controller.status, mode === 'success' ? 'saved' : 'error');
        assert.equal(h.controller.error?.code, mode === 'success' ? undefined : mode === 'drop' ? 'VERIFY' : 'WRITE');
        assert.strictEqual(h.controller.retryCommand, mode === 'success' ? null : command);
        sameFeedback(foreign, otherFeedback); assert.deepEqual(io(foreign), other); assert.deepEqual(foreign.backend.allRaw(), otherRaw); sameDraft(h, before);
        restore(h, owner); h.view.render(); const counts = io(h);
        if (mode !== 'success') { await h.view.retryLast(); await settle(); assert.equal(h.view.input.value, ''); }
        added(h, command); assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + (mode === 'false' || mode === 'drop' ? 1 : 0));
        if (mode === 'success') assert.equal(h.view.input.value, text, 'merely returning never acknowledges or resubmits the old draft');
    } finally { gate.resolve(); cleanup(h, owner, foreign); }
});

for (const mode of ['success', 'false', 'drop', 'ack']) for (const newer of ['same-text-generation', 'composition', 'new-text']) test(`issued quick ${mode} preserves ${newer} draft and focus through a whole Controller gap`, async () => {
    const { h, owner, foreign } = await pair(), gate = deferred();
    try {
        input(h.view.input, text); h.backend.writeGate = gate; if (mode !== 'success') h.backend.mode = mode;
        add(h, 'form'); await settle(); const command = h.controller.retryCommand; change(h, 'controller', foreign);
        if (newer === 'composition') h.view.input.dispatch('compositionstart'); else input(h.view.input, newer === 'new-text' ? 'newer independent draft' : text);
        h.view.input.focus(); const before = draft(h); gate.resolve(); await settle(); sameDraft(h, before);
        restore(h, owner); h.view.render(); const counts = io(h);
        if (mode !== 'success') await h.view.retryLast(); await settle();
        added(h, command); assert.equal(h.view.input.value, before.value); assert.equal(h.view.draftGeneration, before.generation); assert.equal(h.view.quickEntryComposing, before.composing);
        assert.strictEqual(h.document.activeElement, before.focus); assert.equal(h.backend.requests, counts.requests);
    } finally { gate.resolve(); cleanup(h, owner, foreign); }
});

for (const mode of ['false', 'drop', 'ack']) test(`same-source quick Add ${mode} retries exact receipt once while deliberate new Add is independent`, async () => {
    const h = model(); await settle(); const owner = capture(h);
    try {
        input(h.view.input, text); h.backend.mode = mode; add(h); await settle(); const command = h.controller.retryCommand, counts = io(h);
        await h.view.retryLast(); await settle(); added(h, command); assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + (mode === 'ack' ? 0 : 1));
        input(h.view.input, 'new explicit Add'); h.backend.mode = mode; add(h); await settle(); const previous = h.controller.retryCommand;
        input(h.view.input, 'independent next Add'); const nextCounts = io(h); add(h); const next = h.controller.retryCommand; await settle();
        assert.notStrictEqual(next, previous); assert.equal(next.text, 'independent next Add'); assert.equal(h.backend.requests, nextCounts.requests + 1); assert.equal(h.backend.writes, nextCounts.writes + 1);
        assert.equal(h.backend.raw().records.filter(task => task.id === next.operationId).length, 1); assert.equal(h.view.input.value, '');
    } finally { cleanup(h, owner); }
});

for (const mode of ['success', 'false']) test(`retained quick ${mode} attempt never replaces genuine READ Retry or foreign no-command refresh`, async () => {
    const { h, owner, foreign } = await pair(), gate = deferred();
    try {
        input(h.view.input, text); h.backend.writeGate = gate; if (mode === 'false') h.backend.mode = mode;
        add(h); await settle(); const command = h.controller.retryCommand; change(h, 'controller', foreign); gate.resolve(); await settle();
        if (mode === 'false') h.controller.dismissRetry(command.operationId);
        h.backend.nextReadFails = true; await assert.rejects(h.controller.refresh()); assert.equal(h.controller.error.code, 'READ'); assert.equal(h.controller.retryCommand, null);
        const own = io(h), other = io(foreign), ownFeedback = feedback(h), otherFeedback = feedback(foreign);
        await h.view.retryLast(); await settle(); assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); sameFeedback(h, ownFeedback); sameFeedback(foreign, otherFeedback);
        restore(h, owner); h.view.render(); const counts = io(h), run = h.controller.run.bind(h.controller); let runs = 0;
        h.controller.run = command => { runs++; return run(command); }; await h.view.retryLast(); await settle();
        assert.equal(runs, 0); assert.deepEqual(delta(counts, io(h)), { requests: 0, reads: 1, writes: 0 }); assert.equal(h.controller.status, 'ready'); assert.equal(h.controller.error, null); assert.equal(h.view.input.value, text);
    } finally { gate.resolve(); cleanup(h, owner, foreign); }
});

for (const mode of ['success', 'false', 'drop', 'ack']) test(`original host detachment keeps issued quick Add ${mode} on original Store`, async () => {
    const h = model(); await settle(); const owner = capture(h), gate = deferred();
    try {
        input(h.view.input, text); h.backend.writeGate = gate; if (mode !== 'success') h.backend.mode = mode;
        add(h); await settle(); const command = h.controller.retryCommand; assert(h.controller.pending); h.host.remove(); gate.resolve(); await settle();
        assert.equal(h.controller.status, mode === 'success' ? 'saved' : 'error'); const counts = io(h);
        if (mode !== 'success') await h.view.retryLast(); await settle(); added(h, command);
        assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + (mode === 'false' || mode === 'drop' ? 1 : 0)); assert.equal(h.view.input.value, '');
    } finally { gate.resolve(); cleanup(h, owner); }
});

for (const mode of ['false', 'drop', 'ack']) for (const action of ['reuse', 'batch']) test(`older quick ${mode} attempt never takes over real ${action} exact Retry`, async () => {
    const h = model(); await settle(); const owner = capture(h);
    try {
        input(h.view.input, text); h.backend.mode = mode; add(h); await settle(); const quick = h.controller.retryCommand;
        h.controller.dismissRetry(quick.operationId); const before = h.backend.raw();
        if (action === 'reuse') {
            row(h).querySelector('.tasks-row-menu').open = true; button(row(h), 'New task from text').dispatch('click');
            assert(modal(h)); input(modal(h).querySelector('.tasks-editor'), 'reuse independent exact text'); h.backend.mode = mode; button(modal(h), 'Add').dispatch('click');
        } else {
            h.view.batchButton.dispatch('click'); assert(modal(h)); input(modal(h).querySelector('.tasks-editor'), 'first batch task\nsecond batch task');
            button(modal(h), 'Review tasks').dispatch('click'); await settle(); h.backend.mode = mode; button(modal(h), 'Add reviewed tasks (2)').dispatch('click');
        }
        await settle(); const command = h.controller.retryCommand; assert(command); assert.notStrictEqual(command, quick); assert.equal(command.kind, action === 'reuse' ? 'add' : 'addBatch');
        const counts = io(h), beforeRetry = feedback(h); await h.view.retryLast(); await settle();
        assert.deepEqual(io(h), counts, 'global Retry must not adopt a dialog-owned command'); sameFeedback(h, beforeRetry);
        button(modal(h), action === 'reuse' ? 'Retry previous add' : 'Retry previous add (2)').dispatch('click'); await settle();
        assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + (mode === 'ack' ? 0 : 1));
        assert.equal(h.backend.raw().records.length, before.records.length + (action === 'reuse' ? 1 : 2)); assert.equal(h.backend.raw().receipts.filter(id => id === command.operationId).length, 1);
        assert.equal(h.controller.retryCommand, null); assert.equal(h.controller.error, null); assert.equal(h.view.input.value, text); assert.equal(modal(h), null);
    } finally { cleanup(h, owner); }
});

for (const backgroundReadFailure of [false, true]) test(`new real quick Retry replaces its previous failed quick attempt (background READ=${backgroundReadFailure})`, async () => {
    const h = model(); await settle(); const owner = capture(h);
    try {
        input(h.view.input, 'first failed draft'); h.backend.mode = 'false'; add(h); await settle(); const first = h.controller.retryCommand;
        input(h.view.input, text); h.backend.mode = 'false'; add(h, 'Enter'); await settle(); const second = h.controller.retryCommand; assert.notStrictEqual(second, first);
        if (backgroundReadFailure) { h.backend.nextReadFails = true; await assert.rejects(h.controller.refresh()); assert.equal(h.controller.error.code, 'READ'); }
        const counts = io(h); await h.view.retryLast(); await settle(); added(h, second);
        assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + 1); assert.equal(h.backend.raw().records.some(task => task.id === first.operationId), false); assert.equal(h.view.input.value, '');
    } finally { cleanup(h, owner); }
});

test('newer real Remove Undo and effects survive an older quick Add final-notification continuation', async () => {
    const h = model(); await settle(); const owner = capture(h);
    try {
        input(h.view.input, text); const off = h.controller.subscribe(() => {
            if (h.controller.status !== 'saved' || h.controller.pending) return;
            off(); row(h).querySelector('.tasks-row-menu').open = true; button(row(h), 'Remove').dispatch('click');
        });
        add(h); await settle(); assert.equal(h.view.undo.id, 'task_0000'); assert.equal(h.view.undo.state, 'removed'); assert.equal(h.view.input.value, text);
        h.view.undoButton.dispatch('click'); await settle(); assert.equal(record(h).state, 'active'); assert.equal(h.view.undo, null);
    } finally { cleanup(h, owner); }
});

test('newer real quick Add begun in final notification retains its exact failed command and draft effect', async () => {
    const h = model(); await settle(); const owner = capture(h);
    try {
        input(h.view.input, 'first saved draft'); const off = h.controller.subscribe(() => {
            if (h.controller.status !== 'saved' || h.controller.pending) return;
            off(); input(h.view.input, text); h.backend.mode = 'false'; add(h, 'form');
        });
        add(h); await settle(); const command = h.controller.retryCommand; assert.equal(command.text, text); assert.equal(h.view.input.value, text);
        const counts = io(h); await h.view.retryLast(); await settle(); added(h, command); assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + 1); assert.equal(h.view.input.value, '');
    } finally { cleanup(h, owner); }
});

for (const newer of ['same-text-generation', 'composition', 'different-text']) test(`quick request-return ${newer} does not grant the old text a newer draft`, async () => {
    const h = model(); await settle(); const owner = capture(h), request = h.store.request;
    try {
        input(h.view.input, text); h.store.request = (...args) => {
            const command = request(...args); if (newer === 'composition') h.view.input.dispatch('compositionstart'); else input(h.view.input, newer === 'different-text' ? 'new text inside request' : text); return command;
        };
        add(h); const command = h.controller.retryCommand; await settle(); added(h, command);
        assert.equal(h.view.input.value, newer === 'different-text' ? 'new text inside request' : text); assert.equal(h.view.quickEntryComposing, newer === 'composition');
    } finally { h.store.request = request; cleanup(h, owner); }
});

for (const availability of ['suspended', 'invalidated', 'closed', 'retired']) test(`quick Add checks construction availability before request (${availability})`, async () => {
    const h = model(); await settle(); const owner = capture(h);
    try {
        input(h.view.input, text);
        if (availability === 'suspended') h.backend.workspace._suspended = true;
        else if (availability === 'invalidated') h.backend.workspace.invalidated = true;
        else if (availability === 'closed') h.controller.destroy();
        else { h.view.destroy(); h.view.destroyed = false; }
        const before = io(h), raw = h.backend.raw(), beforeFeedback = feedback(h); add(h); await settle();
        assert.deepEqual(io(h), before); assert.deepEqual(h.backend.raw(), raw); sameFeedback(h, beforeFeedback); assert.equal(h.view.input.value, text);
    } finally { delete owner.workspace._suspended; delete owner.workspace.invalidated; cleanup(h, owner); }
});

test('legacy quick entry retains its real Store path without a workspace', async () => {
    const h = model({ workspace: null }); await settle(); const owner = capture(h);
    try { input(h.view.input, text); add(h, 'Enter'); const command = h.controller.retryCommand; await settle(); added(h, command); assert.equal(h.view.input.value, ''); }
    finally { cleanup(h, owner); }
});

test('remote hidden preference keeps failed quick draft and same-text IME through exact Retry', async () => {
    const h = model(); await settle(); const owner = capture(h);
    try {
        input(h.view.input, text); h.backend.mode = 'false'; add(h); await settle(); const command = h.controller.retryCommand;
        await h.remote.mutate(h.remote.request('enable', { enabled: false })); await h.controller.refresh(); await settle(); assert.equal(h.host.hidden, false);
        h.view.input.focus(); h.view.input.dispatch('compositionstart'); const generation = h.view.draftGeneration; await h.view.retryLast(); await settle();
        added(h, command); assert.equal(h.backend.raw().enabled, false); assert.equal(h.host.hidden, false); assert.equal(h.view.input.value, text); assert.equal(h.view.draftGeneration, generation); assert.equal(h.view.quickEntryComposing, true); assert.strictEqual(h.document.activeElement, h.view.input);
        h.view.input.dispatch('compositionend'); input(h.view.input, ''); await settle(); assert.equal(h.host.hidden, true);
    } finally { cleanup(h, owner); }
});
