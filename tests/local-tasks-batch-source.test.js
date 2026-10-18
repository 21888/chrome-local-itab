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
            text: i < 2 ? '  duplicate 中文 😀\r\ntext\r  ' : `Synthetic task ${i}`, state: i === 5 ? 'done' : i === 6 ? 'removed' : 'active',
            removedFrom: i === 6 ? 'done' : null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' })),
        recovery: [{ id: 'recovery_1', createdAt: '2026-10-03T00:00:00.000Z', content: { records: [], pinnedId: null } }] });
}
// These are deliberate mutable-public-field boundary probes, not a model of
// normal workspace navigation. Every Controller result comes from real I/O.
// The synthetic backend captures a fixed target for each lock callback, so
// workspace-field injection cannot reroute that transaction's verification.
function model({ state = initial(), workspace = { id: 'workspace_0001', generation: 'generation_0001' }, prefix = 'original', normalizeTextarea = false } = {}) {
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
    const subscriptions = { adds: 0, removes: 0 };
    const subscribe = controller.subscribe.bind(controller); controller.subscribe = listener => { subscriptions.adds++; const off = subscribe(listener); return () => { subscriptions.removes++; off(); }; };
    const document = createDocument({ blurUnavailableFocus: true });
    if (normalizeTextarea) { const create = document.createElement; document.createElement = tag => { const node = create(tag); if (tag === 'textarea') { let value = ''; Object.defineProperty(node, 'value', { get: () => value, set: next => { value = String(next).replace(/\r\n|\r/g, '\n'); } }); } return node; }; }
    const host = document.createElement('article'), search = document.createElement('input');
    document.body.append(search, host); search.focus();
    const window = { LocalItabTasks: api, LocalItabWorkspaces: { session: workspace }, LocalItabContentLifecycle: { departing: false } };
    const context = vm.createContext({ window, document, crypto: webcrypto, URL, Blob, setTimeout, console });
    for (const file of ['dialog-focus.js', 'local-tasks-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared', file), 'utf8'), context);
    const view = api.mount(host, { controller });
    return { backend, store, remote, controller, document, host, search, window, view, subscriptions };
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
const text = initial().records[0].text;
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

const batchText = '  - first  \r\n\n中文 😀\r* literal\nsame\nsame\n<b>plain</b>';
const batchTexts = ['  - first  ', '中文 😀', '* literal', 'same', 'same', '<b>plain</b>'];
const editor = h => modal(h)?.querySelector('.tasks-batch-editor');
const control = (h, label) => modal(h)?.querySelectorAll('button').find(node => node.textContent.startsWith(label));
function click(h, label) { const node = control(h, label); assert(node, label); node.dispatch('click'); return node; }
function open(h, value = batchText) { h.view.batchButton.focus(); h.view.batchButton.dispatch('click'); assert(editor(h), 'real batch entry opens popup'); input(editor(h), value); return { panel: modal(h), editor: editor(h), session: h.view.batchSession }; }
async function review(h) { click(h, 'Review tasks'); await settle(); }
async function ready(h) { open(h); await review(h); assert(!control(h, 'Add reviewed tasks').hidden, 'real asynchronous review finished'); }
function resume(h, owner) { restore(h, owner); h.controller.emit(); }
const preview = h => modal(h)?.querySelector('.tasks-batch-preview');
const previewTexts = h => preview(h)?.querySelector('ol').children.map(node => node.textContent);
const ui = h => ({ panel: modal(h), editor: editor(h), value: editor(h)?.value, session: h.view.batchSession, operation: h.view.batchOperationId,
    quick: h.view.input.value, quickGeneration: h.view.draftGeneration, effect: h.view.retryEffect, failure: h.view.retryFailure,
    effectOperation: h.view.retryEffectOperationId, action: h.view.actionGeneration, undo: h.view.undo, focus: h.document.activeElement,
    controls: JSON.stringify(modal(h)?.querySelectorAll('button').map(node => [node.textContent, node.disabled, node.hidden])),
    preview: JSON.stringify([preview(h)?.hidden, previewTexts(h)]) });
function sameUI(h, before) { for (const [key, value] of Object.entries(before)) assert(Object.is(ui(h)[key], value), `unchanged ${key}`); }
function ownOutcome(h, command, mode) { assert.equal(h.controller.status, mode === 'success' ? 'saved' : 'error'); assert.equal(h.controller.error?.code, mode === 'success' ? undefined : mode === 'drop' ? 'VERIFY' : 'WRITE'); assert(h.controller.retryCommand === (mode === 'success' ? null : command)); }
function added(h, command) { const raw = h.backend.raw(); assert.deepEqual(raw.records.slice(initial().records.length).map(task => task.text), batchTexts);
    assert.equal(raw.receipts.filter(id => id === command.operationId).length, 1); assert.deepEqual(raw.records.slice(0, initial().records.length), initial().records);
    assert.deepEqual(raw.recovery, initial().recovery); assert.equal(raw.pinnedId, initial().pinnedId); }

for (const source of sources) test(`batch entry refuses construction ${source} substitution before popup/subscription`, async t => {
    const { h, owner, foreign } = await pair();
    try { change(h, source, foreign); const own = io(h), other = io(foreign), a = feedback(h), b = feedback(foreign), subscriptions = { ...foreign.subscriptions };
        h.view.batchButton.dispatch('click'); await settle(); t.diagnostic(JSON.stringify({ source, own: delta(own, io(h)), foreign: delta(other, io(foreign)), opened: !!modal(h) }));
        assert(!modal(h), 'no foreign-source popup'); assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); sameFeedback(h, a); sameFeedback(foreign, b); assert.deepEqual(foreign.subscriptions, subscriptions);
        resume(h, owner); await ready(h); click(h, 'Add reviewed tasks'); const command = h.controller.retryCommand; await settle(); added(h, command);
    } finally { cleanup(h, owner, foreign); }
});
for (const source of sources) for (const stage of ['review', 'confirm']) test(`batch ${stage} rejects ${source} before dispatch and keeps draft`, async t => {
    const { h, owner, foreign } = await pair();
    try { open(h); if (stage === 'confirm') await review(h); change(h, source, foreign);
        const own = io(h), other = io(foreign), before = ui(h), a = feedback(h), b = feedback(foreign); click(h, stage === 'review' ? 'Review tasks' : 'Add reviewed tasks'); await settle();
        t.diagnostic(JSON.stringify({ source, stage, own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); sameFeedback(h, a); sameFeedback(foreign, b); sameUI(h, before);
        resume(h, owner); if (stage === 'review') await review(h); click(h, 'Add reviewed tasks'); const command = h.controller.retryCommand; await settle(); added(h, command);
    } finally { cleanup(h, owner, foreign); }
});
for (const source of sources) for (const boundary of ['review-return', 'request-hook']) test(`batch ${boundary} source ${source} cannot publish its old numbered review`, async t => {
    const { h, owner, foreign } = await pair(), gate = deferred(), original = h.store.reviewBatch.bind(h.store), request = h.store.request;
    try { open(h); if (boundary === 'review-return') h.store.reviewBatch = async text => { const value = await original(text); await gate.promise; return value; };
        else h.store.request = (...args) => { const command = request(...args); change(h, source, foreign); return command; };
        const own = io(h), other = io(foreign); click(h, 'Review tasks'); await settle();
        if (boundary === 'review-return') change(h, source, foreign); const before = ui(h); gate.resolve(); await settle();
        t.diagnostic(JSON.stringify({ source, boundary, own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert.deepEqual(delta(own, io(h)), { requests: 1, reads: 1, writes: 0 }, 'issued review is read-only on its captured backend'); assert.deepEqual(io(foreign), other);
        assert.equal(preview(h).hidden, true, 'source-gap result cannot publish preview'); assert.equal(control(h, 'Add reviewed tasks').hidden, true); if (boundary === 'review-return') sameUI(h, before);
        h.store.reviewBatch = original; h.store.request = request; resume(h, owner); await review(h); click(h, 'Add reviewed tasks'); const command = h.controller.retryCommand; await settle(); added(h, command);
    } finally { gate.resolve(); h.store.reviewBatch = original; h.store.request = request; cleanup(h, owner, foreign); }
});
for (const mode of ['false', 'drop', 'ack']) for (const source of sources) test(`batch exact Retry after ${mode} refuses ${source} and retains original numbered texts`, async t => {
    const { h, owner, foreign } = await pair();
    try { await ready(h); h.backend.mode = mode; click(h, 'Add reviewed tasks'); await settle(); const command = h.controller.retryCommand; assert(command); ownOutcome(h, command, mode);
        input(editor(h), 'new current draft'); assert.deepEqual(previewTexts(h), batchTexts); foreign.backend.mode = 'false'; await assert.rejects(foreign.controller.run(command)); change(h, source, foreign);
        const own = io(h), other = io(foreign), before = ui(h), a = feedback(h), b = feedback(foreign); click(h, 'Retry previous add'); await settle();
        t.diagnostic(JSON.stringify({ mode, source, own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); sameFeedback(h, a); sameFeedback(foreign, b); sameUI(h, before);
        resume(h, owner); const resumed = io(h); click(h, 'Retry previous add'); await settle(); added(h, command); assert.equal(h.backend.requests, resumed.requests); assert.equal(h.backend.writes, resumed.writes + (mode === 'ack' ? 0 : 1)); assert.equal(editor(h).value, 'new current draft'); sameFeedback(foreign, b);
    } finally { cleanup(h, owner, foreign); }
});
for (const mode of ['success', 'false', 'drop', 'ack']) for (const source of sources) test(`issued batch ${mode} during ${source} gap keeps original attempt for explicit receipt Retry`, async t => {
    const { h, owner, foreign } = await pair(), gate = deferred();
    try { await ready(h); h.backend.writeGate = gate; if (mode !== 'success') h.backend.mode = mode; click(h, 'Add reviewed tasks'); await settle(); const command = h.controller.retryCommand; assert(command); assert(h.controller.pending);
        foreign.backend.mode = 'false'; await assert.rejects(foreign.controller.run(command)); const other = io(foreign), b = feedback(foreign), raw = foreign.backend.allRaw(); change(h, source, foreign); const before = ui(h);
        gate.resolve(); await settle(); t.diagnostic(JSON.stringify({ mode, source, status: h.controller.status, error: h.controller.error?.code || null, foreign: delta(other, io(foreign)) }));
        ownOutcome(h, command, mode); assert.deepEqual(io(foreign), other); sameFeedback(foreign, b); assert.deepEqual(foreign.backend.allRaw(), raw); sameUI(h, before);
        resume(h, owner); const resumed = io(h); assert.equal(control(h, 'Retry previous add').hidden, false, 'original attempt remains explicitly recoverable'); assert.deepEqual(previewTexts(h), batchTexts);
        click(h, 'Retry previous add'); await settle(); added(h, command); assert.equal(h.backend.requests, resumed.requests); assert.equal(h.backend.writes, resumed.writes + (['false', 'drop'].includes(mode) ? 1 : 0)); assert(!modal(h)); sameFeedback(foreign, b);
    } finally { gate.resolve(); cleanup(h, owner, foreign); }
});
for (const mode of ['false', 'drop', 'ack']) for (const source of sources) test(`batch Cancel during ${source} gap dismisses only captured ${mode} command`, async () => {
    const { h, owner, foreign } = await pair();
    try { await ready(h); h.backend.mode = mode; click(h, 'Add reviewed tasks'); await settle(); const command = h.controller.retryCommand;
        foreign.backend.mode = 'false'; await assert.rejects(foreign.controller.run(command)); const other = io(foreign), b = feedback(foreign), subscriptions = { ...foreign.subscriptions }; change(h, source, foreign);
        click(h, 'Cancel'); await settle(); assert(!modal(h)); assert(h.document.activeElement === h.document.body, 'source-gap Cancel cannot restore focus'); sameFeedback(foreign, b); assert.deepEqual(io(foreign), other); assert.deepEqual(foreign.subscriptions, subscriptions); assert.equal(h.subscriptions.removes, 1); assert.equal(h.controller.retryCommand, null);
    } finally { cleanup(h, owner, foreign); }
});
for (const foreignRead of [false, true]) test(`no-attempt batch Cancel preserves genuine ${foreignRead ? 'foreign' : 'original'} READ feedback`, async () => {
    const { h, owner, foreign } = await pair();
    try { open(h); const target = foreignRead ? foreign : h; target.backend.nextReadFails = true; await assert.rejects(target.controller.refresh()); const before = feedback(target), subscriptions = { ...foreign.subscriptions };
        if (foreignRead) change(h, 'controller', foreign); click(h, 'Cancel'); sameFeedback(target, before); assert.deepEqual(foreign.subscriptions, subscriptions); assert.equal(h.subscriptions.removes, 1);
        resume(h, owner); const counts = io(target); target.view.retry.dispatch('click'); await settle(); assert.equal(target.backend.reads, counts.reads + 1); assert.equal(target.backend.writes, counts.writes); assert.equal(target.controller.error, null);
    } finally { cleanup(h, owner, foreign); }
});
for (const source of sources) test(`batch source-gap subscription cannot take focused Review control (${source})`, async () => {
    const { h, owner, foreign } = await pair();
    try { open(h); control(h, 'Review tasks').focus(); change(h, source, foreign); const before = ui(h); h.controller.emit(); sameUI(h, before); assert.match(modal(h).querySelector('.tasks-dialog-feedback').textContent, /changed in another page/);
    } finally { cleanup(h, owner, foreign); }
});
for (const stage of ['entry', 'review', 'confirm']) for (const unavailable of ['suspended', 'invalidated', 'closed', 'retired']) test(`batch ${stage} respects ${unavailable} source availability`, async () => {
    const h = model(); await settle(); const owner = capture(h);
    try { if (stage !== 'entry') open(h); if (stage === 'confirm') await review(h);
        if (unavailable === 'suspended') h.backend.workspace._suspended = true; else if (unavailable === 'invalidated') h.backend.workspace.invalidated = true;
        else if (unavailable === 'closed') h.controller.destroy(); else { h.view.destroy(); h.view.destroyed = false; h.controller.closed = false; }
        const own = io(h), before = feedback(h); if (stage === 'entry') h.view.batchButton.dispatch('click'); else if (modal(h)) click(h, stage === 'review' ? 'Review tasks' : 'Add reviewed tasks');
        await settle(); assert.deepEqual(io(h), own); sameFeedback(h, before); if (stage === 'entry' || unavailable === 'retired') assert(!modal(h));
    } finally { delete owner.workspace._suspended; delete owner.workspace.invalidated; cleanup(h, owner); }
});
for (const stage of ['review', 'confirm']) test(`batch ${stage} rechecks source after focus/control hook before dispatch`, async () => {
    const { h, owner, foreign } = await pair();
    try { open(h); if (stage === 'confirm') await review(h); const area = editor(h), focus = area.focus.bind(area); area.focus = () => { focus(); change(h, 'controller', foreign); };
        control(h, stage === 'review' ? 'Review tasks' : 'Add reviewed tasks').focus(); const own = io(h), other = io(foreign); click(h, stage === 'review' ? 'Review tasks' : 'Add reviewed tasks'); await settle();
        assert.deepEqual(io(h), own, 'source changed before dispatch'); assert.deepEqual(io(foreign), other); assert.equal(h.controller.retryCommand, null);
    } finally { cleanup(h, owner, foreign); }
});
for (const newer of ['same-text', 'ABA', 'composition', 'new-text']) for (const mode of ['success', 'false', 'drop', 'ack']) test(`batch ${mode} source gap preserves newer ${newer} through exact Retry`, async () => {
    const { h, owner, foreign } = await pair(), gate = deferred();
    try { await ready(h); h.backend.writeGate = gate; if (mode !== 'success') h.backend.mode = mode; click(h, 'Add reviewed tasks'); await settle(); const command = h.controller.retryCommand; change(h, 'controller', foreign);
        if (newer === 'composition') editor(h).dispatch('compositionstart'); else { if (newer === 'ABA') input(editor(h), 'temporary'); input(editor(h), newer === 'new-text' ? 'new draft' : batchText); }
        const before = ui(h); gate.resolve(); await settle(); sameUI(h, before); ownOutcome(h, command, mode); resume(h, owner);
        if (newer === 'composition') { click(h, 'Retry previous add'); assert.equal(h.backend.requests, 1); editor(h).dispatch('compositionend'); }
        click(h, 'Retry previous add'); await settle(); added(h, command); assert.equal(editor(h).value, before.value); assert.equal(h.backend.requests, 1); assert.match(modal(h).querySelector('.tasks-dialog-feedback').textContent, /current draft is still here/);
    } finally { gate.resolve(); cleanup(h, owner, foreign); }
});
for (const mode of ['success', 'false']) for (const next of ['batch', 'reuse']) test(`closed batch late ${mode} preserves newer real ${next} popup and foreign exact error`, async () => {
    const { h, owner, foreign } = await pair(), gate = deferred();
    try { await ready(h); h.backend.writeGate = gate; if (mode !== 'success') h.backend.mode = mode; click(h, 'Add reviewed tasks'); await settle(); const command = h.controller.retryCommand;
        foreign.backend.mode = 'false'; await assert.rejects(foreign.controller.run(command)); const b = feedback(foreign); let current, area, outside, before, message;
        const off = h.controller.subscribe(() => {
            if (h.controller.pending) return; off(); click(h, 'Cancel');
            if (next === 'batch') open(h, 'new batch draft'); else { const item = row(h); item.querySelector('.tasks-row-menu').open = true; button(item, 'New task from text').dispatch('click'); }
            current = modal(h); area = current?.querySelector('textarea'); assert(area, 'new real popup opened after original transaction finished'); input(area, 'new popup draft');
            outside = h.document.createElement('input'); h.document.body.append(outside); outside.focus(); change(h, 'controller', foreign); h.controller.emit();
            // The new popup owns its source-gap notification before the old await resumes.
            before = ui(h); message = current.querySelector('.tasks-dialog-feedback').textContent;
        });
        gate.resolve(); await settle(); assert(current, 'final notification ran'); assert(modal(h) === current); assert.equal(area.value, 'new popup draft'); assert.equal(current.querySelector('.tasks-dialog-feedback').textContent, message); assert(h.document.activeElement === outside); sameFeedback(foreign, b); assert.equal(h.view.batchOperationId, before.operation);
    } finally { gate.resolve(); cleanup(h, owner, foreign); }
});
test('batch global Retry stays separate from exact modal Retry', async () => {
    const h = model(); await settle(); const owner = capture(h);
    try { await ready(h); h.backend.mode = 'false'; click(h, 'Add reviewed tasks'); await settle(); const before = io(h), outcome = feedback(h); h.view.retry.dispatch('click'); await settle(); assert.deepEqual(io(h), before); sameFeedback(h, outcome); click(h, 'Retry previous add'); await settle(); added(h, outcome.retry);
    } finally { cleanup(h, owner); }
});
test('new distinct original Controller retry blocks old batch modal Retry and Cancel', async () => {
    const h = model(); await settle(); const owner = capture(h);
    try { await ready(h); h.backend.mode = 'false'; click(h, 'Add reviewed tasks'); await settle(); const old = h.controller.retryCommand;
        const newer = h.store.request('add', { text: 'newer explicit operation' }); h.backend.mode = 'false'; await assert.rejects(h.controller.run(newer)); const before = io(h), outcome = feedback(h);
        click(h, 'Retry previous add'); await settle(); assert.deepEqual(io(h), before); sameFeedback(h, outcome); click(h, 'Cancel'); sameFeedback(h, outcome); assert(old !== newer);
    } finally { cleanup(h, owner); }
});
test('legacy no-workspace batch preserves exact CRLF parsing and receipt Retry', async () => {
    const h = model({ workspace: null }); await settle(); const owner = capture(h);
    try { await ready(h); assert.deepEqual(previewTexts(h), batchTexts); h.backend.mode = 'ack'; click(h, 'Add reviewed tasks'); await settle(); const command = h.controller.retryCommand, before = io(h); click(h, 'Retry previous add'); await settle(); added(h, command); assert.equal(h.backend.requests, before.requests); assert.equal(h.backend.writes, before.writes); assert(!modal(h));
    } finally { cleanup(h, owner); }
});
test('issued batch may finish after original host detaches', async () => {
    const h = model(); await settle(); const owner = capture(h), gate = deferred();
    try { await ready(h); h.backend.writeGate = gate; click(h, 'Add reviewed tasks'); await settle(); const command = h.controller.retryCommand; h.host.remove(); gate.resolve(); await settle(); added(h, command); assert(!modal(h)); assert(h.document.activeElement === h.document.body);
    } finally { gate.resolve(); cleanup(h, owner); }
});

for (const newer of ['quick-add', 'remove-undo', 'batch']) test(`newer ${newer} failure in batch final notification keeps its real error, exact Retry and metadata`, async () => {
    const h = model(); await settle(); const owner = capture(h);
    try { await ready(h); const off = h.controller.subscribe(() => {
            if (h.controller.status !== 'saved' || h.controller.pending) return; off(); click(h, 'Cancel');
            if (newer === 'quick-add') { input(h.view.input, 'new quick draft'); h.backend.mode = 'false'; add(h); }
            else if (newer === 'remove-undo') { row(h).querySelector('.tasks-row-menu').open = true; button(row(h), 'Remove').dispatch('click'); }
            else { open(h, 'new batch draft'); click(h, 'Review tasks'); }
        });
        click(h, 'Add reviewed tasks'); await settle();
        if (newer === 'batch') { h.backend.mode = 'false'; click(h, 'Add reviewed tasks'); await settle(); }
        if (newer === 'remove-undo') { assert.equal(h.view.undo.id, 'task_0000'); h.backend.mode = 'false'; h.view.undoButton.dispatch('click'); await settle(); }
        const command = h.controller.retryCommand; assert(command); assert.equal(h.controller.error.code, 'WRITE'); const counts = io(h), effect = h.view.retryEffect, op = h.view.retryEffectOperationId;
        if (newer === 'batch') click(h, 'Retry previous add'); else h.view.retry.dispatch('click'); await settle();
        assert.equal(h.controller.error, null); assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + 1);
        if (newer === 'quick-add') { assert.equal(command.text, 'new quick draft'); assert.equal(h.view.input.value, ''); assert.equal(op, command.operationId); assert.equal(typeof effect, 'function'); }
        if (newer === 'remove-undo') { assert.equal(record(h).state, 'active'); assert.equal(h.view.undo, null); }
    } finally { cleanup(h, owner); }
});
for (const mode of ['resolve', 'reject']) test(`older ${mode} review cannot replace reopened batch preview, controls or focus`, async () => {
    const h = model(); await settle(); const owner = capture(h), gate = deferred(), original = h.store.reviewBatch.bind(h.store); let first = true;
    try { open(h); h.store.reviewBatch = async text => { const value = await original(text); if (first) { first = false; await gate.promise; if (mode === 'reject') throw tasks.fault('READ'); } return value; };
        click(h, 'Review tasks'); await settle(); click(h, 'Cancel'); open(h, 'new preview'); await review(h); const before = ui(h), message = modal(h).querySelector('.tasks-dialog-feedback').textContent;
        gate.resolve(); await settle(); sameUI(h, before); assert.equal(modal(h).querySelector('.tasks-dialog-feedback').textContent, message);
    } finally { gate.resolve(); cleanup(h, owner); }
});
for (const observed of [false, true]) test(`batch preserves existing append protocol after ${observed ? 'observed' : 'unobserved'} remote edit`, async () => {
    const h = model(); await settle(); const owner = capture(h);
    try { await ready(h); const task = record(h); await h.remote.mutate(h.remote.request('edit', { id: task.id, version: task.version, text: 'remote exact edit' })); if (observed) await h.controller.refresh();
        const before = h.backend.raw(), own = io(h); click(h, 'Add reviewed tasks'); await settle();
        if (observed) { assert.equal(h.backend.writes, own.writes); assert(preview(h).hidden); await review(h); click(h, 'Add reviewed tasks'); await settle(); }
        assert.deepEqual(h.backend.raw().records.slice(0, before.records.length), before.records); assert.deepEqual(h.backend.raw().records.slice(before.records.length).map(task => task.text), batchTexts);
    } finally { cleanup(h, owner); }
});
test('Cancel rechecks source after captured dismissal before restoring focus', async () => {
    const { h, owner, foreign } = await pair(), dismiss = h.controller.dismissRetry.bind(h.controller);
    try { await ready(h); h.backend.mode = 'false'; click(h, 'Add reviewed tasks'); await settle(); h.controller.dismissRetry = id => { dismiss(id); change(h, 'controller', foreign); };
        click(h, 'Cancel'); assert(!modal(h)); assert(h.document.activeElement === h.document.body);
    } finally { h.controller.dismissRetry = dismiss; cleanup(h, owner, foreign); }
});
