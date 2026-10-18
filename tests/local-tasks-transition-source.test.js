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
        records: Array.from({ length: 9 }, (_, i) => ({ id: `task_000${i}`, version: `version_${i}`,
            text: i < 2 ? '  duplicate 中文 😀\r\ntext\r  ' : `Synthetic task ${i}`, state: i < 4 ? 'active' : i < 8 ? 'done' : 'removed',
            removedFrom: i === 8 ? 'done' : null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' })),
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
    assert(h.controller.state === before.state, 'same state reference'); assert(h.controller.error === before.error, 'same error reference');
    assert(h.controller.retryCommand === before.retry, 'same command reference'); assert.equal(h.controller.status, before.status);
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
function add(h, route = 'button') {
    return route === 'button' ? h.view.addButton.dispatch('click') : route === 'form' ? h.view.form.dispatch('submit') : h.view.input.dispatch('keydown', { key: 'Enter' });
}
async function pair() {
    const h = model(); await settle(); const owner = capture(h);
    const foreign = model({ state: h.backend.raw(), workspace: owner.workspace, prefix: 'foreign' }); await settle();
    return { h, owner, foreign };
}
function cleanup(h, owner, foreign) { restore(h, owner); h.view.destroy(); foreign?.view.destroy(); }
const routes = ['complete', 'reopen'];
const method = route => route === 'complete' ? 'reviewCompletion' : 'reviewReopening';
const ctl = (h, route, name) => modal(h)?.querySelector(`.tasks-${route}-${name}`);
const choices = (h, route) => modal(h)?.querySelectorAll(`.tasks-${route}-checkbox`);
const click = (h, route, name) => { const node = ctl(h, route, name); assert(node, `${route} ${name}`); node.dispatch('click'); return node; };
function open(h, route) {
    if (route === 'reopen') h.view.completed.box.open = true;
    const origin = route === 'complete' ? h.view.completeBatchButton : h.view.reopenBatchButton;
    origin.focus(); origin.dispatch('click'); assert(modal(h), 'real selection popup opened');
    assert(choices(h, route).every(node => !node.checked), 'nothing selected initially');
}
function check(h, route, index, value = true) { const node = choices(h, route)[index]; node.checked = value; node.dispatch('change'); }
async function review(h, route) { click(h, route, 'review'); await settle(); }
async function ready(h, route) { open(h, route); check(h, route, 0); check(h, route, 1); await review(h, route); assert(!ctl(h, route, 'confirm').hidden, 'real numbered review'); }
function resume(h, owner) { restore(h, owner); h.controller.emit(); }
const texts = (h, route) => ctl(h, route, 'preview')?.querySelectorAll('li').map(node => node.textContent);
const ui = (h, route) => ({ panel: modal(h), session: h.view.completionSession, quick: h.view.input.value,
    effect: h.view.retryEffect, failure: h.view.retryFailure, operation: h.view.retryEffectOperationId, action: h.view.actionGeneration,
    undo: h.view.undo, focus: h.document.activeElement, selected: JSON.stringify(choices(h, route)?.map(node => node.checked)),
    controls: JSON.stringify(modal(h)?.querySelectorAll('button').map(node => [node.textContent, node.disabled, node.hidden])),
    preview: JSON.stringify([ctl(h, route, 'preview')?.hidden, texts(h, route)]) });
function sameUI(h, route, before, omit = []) { const now = ui(h, route); for (const [key, value] of Object.entries(before)) if (!omit.includes(key)) assert(Object.is(now[key], value), `unchanged ${key}`); }
function ownOutcome(h, command, mode) { assert.equal(h.controller.status, mode === 'success' ? 'saved' : 'error'); assert.equal(h.controller.error?.code, mode === 'success' ? undefined : mode === 'drop' ? 'VERIFY' : 'WRITE'); assert(h.controller.retryCommand === (mode === 'success' ? null : command), 'actual exact outcome'); }
function transitioned(h, route, command) {
    const raw = h.backend.raw(), before = initial(), ids = command.targets.map(target => target.id);
    assert.equal(raw.records.length, before.records.length); assert.deepEqual(raw.records.map(task => task.id), before.records.map(task => task.id));
    for (const task of raw.records) { const target = command.targets.find(t => t.id === task.id), old = before.records.find(t => t.id === task.id);
        if (target) { assert.equal(task.state, route === 'complete' ? 'done' : 'active'); assert.equal(task.version, target.nextVersion); assert.equal(task.text, old.text); }
        else assert.deepEqual(task, old);
    }
    assert.deepEqual(raw.recovery, before.recovery); assert.equal(raw.enabled, before.enabled);
    assert.equal(raw.pinnedId, route === 'complete' && ids.includes(before.pinnedId) ? null : before.pinnedId);
    assert.equal(raw.receipts.filter(id => id === command.operationId).length, 1);
}
function undoResult(h, route) { if (route === 'complete') { assert.equal(h.view.undo?.kind, 'completeBatch'); assert.equal(h.view.undo.records.length, 2); } else assert.equal(h.view.undo, null); }

for (const route of routes) for (const source of sources) test(`${route} entry rejects construction ${source} before popup/subscription`, async t => {
    const { h, owner, foreign } = await pair();
    try { if (route === 'reopen') h.view.completed.box.open = true; change(h, source, foreign); const own = io(h), other = io(foreign), a = feedback(h), b = feedback(foreign), subs = { ...foreign.subscriptions };
        (route === 'complete' ? h.view.completeBatchButton : h.view.reopenBatchButton).dispatch('click'); await settle();
        t.diagnostic(JSON.stringify({ route, source, opened: !!modal(h), own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert(!modal(h), 'no source-gap popup'); assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); sameFeedback(h, a); sameFeedback(foreign, b); assert.deepEqual(foreign.subscriptions, subs);
        resume(h, owner); await ready(h, route); click(h, route, 'confirm'); const command = h.controller.retryCommand; await settle(); transitioned(h, route, command); undoResult(h, route);
    } finally { cleanup(h, owner, foreign); }
});
for (const route of routes) for (const source of sources) for (const action of ['checkbox', 'select-all', 'clear']) test(`${route} selection ${action} cannot adopt ${source}`, async () => {
    const { h, owner, foreign } = await pair();
    try { open(h, route); check(h, route, 0); change(h, source, foreign); const before = ui(h, route), own = io(h), other = io(foreign);
        if (action === 'checkbox') check(h, route, 1); else click(h, route, action); await settle();
        sameUI(h, route, before); assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other);
        resume(h, owner); check(h, route, 1); await review(h, route); click(h, route, 'confirm'); const command = h.controller.retryCommand; await settle(); transitioned(h, route, command);
    } finally { cleanup(h, owner, foreign); }
});
for (const route of routes) for (const source of sources) for (const stage of ['review', 'confirm']) test(`${route} ${stage} rejects ${source} before I/O`, async t => {
    const { h, owner, foreign } = await pair();
    try { open(h, route); check(h, route, 0); check(h, route, 1); if (stage === 'confirm') await review(h, route); change(h, source, foreign);
        const before = ui(h, route), own = io(h), other = io(foreign), a = feedback(h), b = feedback(foreign); click(h, route, stage); await settle();
        t.diagnostic(JSON.stringify({ route, source, stage, own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); sameFeedback(h, a); sameFeedback(foreign, b); sameUI(h, route, before);
        resume(h, owner); if (stage === 'review') await review(h, route); click(h, route, 'confirm'); const command = h.controller.retryCommand; await settle(); transitioned(h, route, command);
    } finally { cleanup(h, owner, foreign); }
});
for (const route of routes) for (const source of sources) for (const boundary of ['return', 'request-hook']) test(`${route} dispatched review ${boundary} rejects late ${source} preview`, async t => {
    const { h, owner, foreign } = await pair(), gate = deferred(), original = h.store[method(route)].bind(h.store), request = h.store.request;
    try { open(h, route); check(h, route, 0); check(h, route, 1);
        if (boundary === 'return') h.store[method(route)] = async targets => { const value = await original(targets); await gate.promise; return value; };
        else h.store.request = (...args) => { const value = request(...args); change(h, source, foreign); return value; };
        const own = io(h), other = io(foreign); click(h, route, 'review'); await settle(); if (boundary === 'return') change(h, source, foreign); const before = ui(h, route);
        gate.resolve(); await settle(); t.diagnostic(JSON.stringify({ route, source, boundary, own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert.deepEqual(delta(own, io(h)), { requests: 1, reads: 1, writes: 0 }); assert.deepEqual(io(foreign), other); assert(ctl(h, route, 'preview').hidden); assert(ctl(h, route, 'confirm').hidden); sameUI(h, route, before);
        h.store[method(route)] = original; h.store.request = request; resume(h, owner); await review(h, route); click(h, route, 'confirm'); const command = h.controller.retryCommand; await settle(); transitioned(h, route, command);
    } finally { gate.resolve(); h.store[method(route)] = original; h.store.request = request; cleanup(h, owner, foreign); }
});
for (const route of routes) for (const source of sources) for (const path of ['modal', 'card']) for (const mode of ['false', 'drop', 'ack']) test(`${route} ${path} exact ${mode} Retry refuses ${source} and returns to original`, async () => {
    const { h, owner, foreign } = await pair();
    try { await ready(h, route); h.backend.mode = mode; click(h, route, 'confirm'); await settle(); const command = h.controller.retryCommand; assert(command);
        if (path === 'card') click(h, route, 'cancel'); change(h, source, foreign); const own = io(h), other = io(foreign), a = feedback(h), b = feedback(foreign), before = ui(h, route);
        if (path === 'card') h.view.retry.dispatch('click'); else click(h, route, 'retry'); await settle();
        assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); sameFeedback(h, a); sameFeedback(foreign, b); sameUI(h, route, before);
        resume(h, owner); const resumed = io(h); if (path === 'card') { assert(!h.view.retry.hidden, 'real card Retry is visible'); h.view.retry.dispatch('click'); } else click(h, route, 'retry'); await settle();
        transitioned(h, route, command); undoResult(h, route); assert.equal(h.backend.requests, resumed.requests); assert.equal(h.backend.writes, resumed.writes + (mode === 'ack' ? 0 : 1));
    } finally { cleanup(h, owner, foreign); }
});
for (const route of routes) for (const source of sources) for (const mode of ['success', 'false', 'drop', 'ack']) test(`${route} issued ${mode} in ${source} gap retains original result and modal receipt path`, async t => {
    const { h, owner, foreign } = await pair(), gate = deferred();
    try { await ready(h, route); h.backend.writeGate = gate; if (mode !== 'success') h.backend.mode = mode; click(h, route, 'confirm'); await settle(); const command = h.controller.retryCommand; assert(command); assert(h.controller.pending);
        foreign.backend.mode = 'false'; await assert.rejects(foreign.controller.run(command)); const other = io(foreign), b = feedback(foreign), raw = foreign.backend.allRaw();
        change(h, source, foreign); const before = ui(h, route); gate.resolve(); await settle();
        t.diagnostic(JSON.stringify({ route, source, mode, actualStatus: h.controller.status, actualError: h.controller.error?.code || null }));
        ownOutcome(h, command, mode); sameUI(h, route, before); sameFeedback(foreign, b); assert.deepEqual(io(foreign), other); assert.deepEqual(foreign.backend.allRaw(), raw);
        resume(h, owner); const resumed = io(h); assert(!ctl(h, route, 'retry').hidden, 'exact original receipt remains explicit'); click(h, route, 'retry'); await settle();
        transitioned(h, route, command); undoResult(h, route); assert.equal(h.backend.requests, resumed.requests); assert.equal(h.backend.writes, resumed.writes + (['false', 'drop'].includes(mode) ? 1 : 0)); sameFeedback(foreign, b); assert(!modal(h));
    } finally { gate.resolve(); cleanup(h, owner, foreign); }
});
for (const route of routes) for (const source of sources) test(`${route} source-gap subscription and Cancel cannot steal focus or foreign exact WRITE`, async () => {
    const { h, owner, foreign } = await pair();
    try { await ready(h, route); h.backend.mode = 'false'; click(h, route, 'confirm'); await settle(); const command = h.controller.retryCommand;
        foreign.backend.mode = 'false'; await assert.rejects(foreign.controller.run(command)); const b = feedback(foreign), other = io(foreign), subs = { ...foreign.subscriptions }; ctl(h, route, 'retry').focus(); change(h, source, foreign); const before = ui(h, route);
        h.controller.emit(); sameUI(h, route, before); assert.match(modal(h).querySelector('.tasks-dialog-feedback').textContent, /changed in another page/);
        click(h, route, 'cancel'); assert(!modal(h)); assert(h.document.activeElement === h.document.body, 'no source-gap return focus'); sameFeedback(foreign, b); assert.deepEqual(io(foreign), other); assert.deepEqual(foreign.subscriptions, subs); assert.equal(h.subscriptions.removes, 1); assert(h.controller.retryCommand === command, 'close retains uncertain card command');
        resume(h, owner); h.view.retry.dispatch('click'); await settle(); transitioned(h, route, command); undoResult(h, route);
    } finally { cleanup(h, owner, foreign); }
});
for (const route of routes) for (const stage of ['review', 'confirm']) test(`${route} ${stage} rechecks a focused control hook before dispatch`, async () => {
    const { h, owner, foreign } = await pair();
    try { open(h, route); check(h, route, 0); check(h, route, 1); if (stage === 'confirm') await review(h, route); const cancel = ctl(h, route, 'cancel'), focus = cancel.focus.bind(cancel);
        cancel.focus = () => { focus(); change(h, 'controller', foreign); }; ctl(h, route, stage).focus(); const own = io(h), other = io(foreign); click(h, route, stage); await settle();
        assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); assert.equal(h.controller.retryCommand, null);
    } finally { cleanup(h, owner, foreign); }
});
for (const route of routes) for (const source of sources) test(`${route} post-construction hook rejects ${source} before original or foreign subscription`, async () => {
    const { h, owner, foreign } = await pair(), create = h.view.createDialog.bind(h.view);
    try { h.view.createDialog = (...args) => { const value = create(...args); change(h, source, foreign); return value; }; if (route === 'reopen') h.view.completed.box.open = true;
        const own = io(h), other = io(foreign), subs = { ...h.subscriptions }, fs = { ...foreign.subscriptions }; (route === 'complete' ? h.view.completeBatchButton : h.view.reopenBatchButton).dispatch('click'); await settle();
        assert(!modal(h)); assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); assert.deepEqual(h.subscriptions, subs); assert.deepEqual(foreign.subscriptions, fs);
    } finally { h.view.createDialog = create; cleanup(h, owner, foreign); }
});

for (const route of routes) for (const foreignRead of [false, true]) test(`${route} no-command Cancel preserves genuine ${foreignRead ? 'foreign' : 'original'} READ`, async () => {
    const { h, owner, foreign } = await pair();
    try { open(h, route); const target = foreignRead ? foreign : h; target.backend.nextReadFails = true; await assert.rejects(target.controller.refresh()); const before = feedback(target);
        if (foreignRead) change(h, 'controller', foreign); click(h, route, 'cancel'); sameFeedback(target, before); assert.equal(h.subscriptions.removes, 1);
        resume(h, owner); const counts = io(target); target.view.retry.dispatch('click'); await settle(); assert.equal(target.backend.reads, counts.reads + 1); assert.equal(target.backend.writes, counts.writes); assert.equal(target.controller.error, null);
    } finally { cleanup(h, owner, foreign); }
});
for (const route of routes) for (const mode of ['success', 'false', 'drop', 'ack']) test(`${route} original closed-popup ${mode} preserves real completion Undo and card Retry`, async () => {
    const h = model(); await settle(); const owner = capture(h), gate = deferred();
    try { await ready(h, route); h.backend.writeGate = gate; if (mode !== 'success') h.backend.mode = mode; click(h, route, 'confirm'); await settle(); const command = h.controller.retryCommand;
        click(h, route, 'cancel'); h.view.batchButton.dispatch('click'); const area = modal(h).querySelector('textarea'); input(area, 'new independent draft'); area.focus(); gate.resolve(); await settle();
        assert(h.document.activeElement === area); assert.equal(area.value, 'new independent draft'); ownOutcome(h, command, mode);
        if (mode !== 'success') { const counts = io(h); h.view.retry.dispatch('click'); await settle(); assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + (mode === 'ack' ? 0 : 1)); }
        transitioned(h, route, command); undoResult(h, route); assert(h.document.activeElement === area); assert.equal(area.value, 'new independent draft');
    } finally { gate.resolve(); cleanup(h, owner); }
});
for (const route of routes) for (const mode of ['success', 'false', 'drop', 'ack']) test(`${route} closed-popup late ${mode} in Controller gap keeps foreign feedback and original return path`, async () => {
    const { h, owner, foreign } = await pair(), gate = deferred();
    try { await ready(h, route); h.backend.writeGate = gate; if (mode !== 'success') h.backend.mode = mode; click(h, route, 'confirm'); await settle(); const command = h.controller.retryCommand; click(h, route, 'cancel');
        foreign.backend.mode = 'false'; await assert.rejects(foreign.controller.run(command)); const b = feedback(foreign); change(h, 'controller', foreign); const before = ui(h, route); gate.resolve(); await settle(); ownOutcome(h, command, mode); sameUI(h, route, before); sameFeedback(foreign, b);
        resume(h, owner); const counts = io(h); if (mode !== 'success') { h.view.retry.dispatch('click'); await settle(); undoResult(h, route); }
        else { assert.equal(h.view.undo, null); assert(h.view.retry.hidden); h.backend.nextReadFails = true; await assert.rejects(h.controller.refresh()); h.view.retry.dispatch('click'); await settle(); assert.equal(h.backend.reads, counts.reads + 2); assert.equal(h.view.undo, null); }
        transitioned(h, route, command); assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + (['false', 'drop'].includes(mode) ? 1 : 0)); sameFeedback(foreign, b);
    } finally { gate.resolve(); cleanup(h, owner, foreign); }
});
for (const route of routes) test(`${route} saved attempt cannot capture genuine READ Retry or source-gap foreign refresh`, async () => {
    const { h, owner, foreign } = await pair();
    try { await ready(h, route); click(h, route, 'confirm'); await settle(); const undo = h.view.undo; h.backend.nextReadFails = true; await assert.rejects(h.controller.refresh()); const own = io(h), other = io(foreign), a = feedback(h), b = feedback(foreign);
        change(h, 'controller', foreign); h.view.retry.dispatch('click'); await settle(); assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); sameFeedback(h, a); sameFeedback(foreign, b);
        resume(h, owner); h.view.retry.dispatch('click'); await settle(); assert.equal(h.backend.reads, own.reads + 1); assert.equal(h.backend.writes, own.writes); assert.equal(h.backend.requests, own.requests); assert(h.view.undo === undo); assert.equal(h.controller.error, null);
    } finally { cleanup(h, owner, foreign); }
});
for (const route of routes) test(`${route} old exact modal Retry and Cancel preserve newer distinct real WRITE command`, async () => {
    const h = model(); await settle(); const owner = capture(h);
    try { await ready(h, route); h.backend.mode = 'false'; click(h, route, 'confirm'); await settle(); const old = h.controller.retryCommand;
        input(h.view.input, 'newer quick task'); h.backend.mode = 'false'; h.view.addButton.dispatch('click'); await settle(); const command = h.controller.retryCommand; assert(command && command !== old); const counts = io(h), before = feedback(h), effect = h.view.retryEffect;
        click(h, route, 'retry'); await settle(); assert.deepEqual(io(h), counts); sameFeedback(h, before); assert(h.view.retryEffect === effect); click(h, route, 'cancel'); sameFeedback(h, before);
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.error, null); assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + 1); assert.equal(h.view.input.value, ''); assert.equal(h.backend.raw().records.at(-1).text, 'newer quick task');
    } finally { cleanup(h, owner); }
});
for (const route of routes) for (const newer of ['quick-add', 'remove']) test(`${route} final notification preserves newer real ${newer} Undo/Retry`, async () => {
    const h = model(); await settle(); const owner = capture(h);
    try { await ready(h, route); let next;
        const off = h.controller.subscribe(() => { if (h.controller.status !== 'saved' || h.controller.pending) return; off(); click(h, route, 'cancel');
            if (newer === 'quick-add') { input(h.view.input, 'newest quick draft'); h.backend.mode = 'false'; h.view.addButton.dispatch('click'); }
            else { const item = row(h, 'task_0003'); item.querySelector('.tasks-row-menu').open = true; button(item, 'Remove').dispatch('click'); }
            next = h.controller.retryCommand;
        });
        click(h, route, 'confirm'); await settle(); assert(next);
        if (newer === 'quick-add') { assert(h.controller.retryCommand === next); assert.equal(h.controller.error.code, 'WRITE'); assert.equal(h.view.undo, null); const counts = io(h); h.view.retry.dispatch('click'); await settle(); assert.equal(h.backend.requests, counts.requests); assert.equal(h.view.input.value, ''); }
        else { assert.equal(h.view.undo.id, 'task_0003'); assert.equal(h.view.undo.state, 'removed'); }
    } finally { cleanup(h, owner); }
});
for (const route of routes) for (const stage of ['entry', 'review', 'confirm']) for (const unavailable of ['suspended', 'invalidated', 'closed', 'hidden', 'departing', 'detach']) test(`${route} ${stage} preserves existing ${unavailable} admission`, async () => {
    const h = model(); await settle(); const owner = capture(h);
    try { if (stage !== 'entry') { open(h, route); check(h, route, 0); } else if (route === 'reopen') h.view.completed.box.open = true; if (stage === 'confirm') await review(h, route);
        if (unavailable === 'suspended') h.backend.workspace._suspended = true; if (unavailable === 'invalidated') h.backend.workspace.invalidated = true; if (unavailable === 'closed') h.controller.destroy();
        if (unavailable === 'hidden') h.document.hidden = true; if (unavailable === 'departing') h.window.LocalItabContentLifecycle.departing = true; if (unavailable === 'detach') h.host.remove();
        const counts = io(h); if (stage === 'entry') (route === 'complete' ? h.view.completeBatchButton : h.view.reopenBatchButton).dispatch('click'); else click(h, route, stage); await settle(); assert.deepEqual(io(h), counts); if (stage === 'entry') assert(!modal(h));
    } finally { delete owner.workspace._suspended; delete owner.workspace.invalidated; cleanup(h, owner); }
});
for (const route of routes) test(`${route} reviewed revision conflicts on unrelated edit while completion Undo remains revision-free`, async () => {
    const h = model(); await settle(); const owner = capture(h);
    try { await ready(h, route); const other = record(h, 'task_0003'); await h.remote.mutate(h.remote.request('edit', { id: other.id, version: other.version, text: 'unrelated edit' })); const counts = io(h), before = h.backend.raw();
        click(h, route, 'confirm'); await settle(); assert.equal(h.backend.writes, counts.writes); assert.deepEqual(h.backend.raw(), before); assert(ctl(h, route, 'preview').hidden); await review(h, route); click(h, route, 'confirm'); await settle();
        if (route === 'complete') { const pin = record(h, 'task_0002'); await h.remote.mutate(h.remote.request('pin', { id: pin.id, version: pin.version, expectedPin: null })); await h.controller.refresh(); h.view.undoButton.dispatch('click'); const command = h.controller.retryCommand; assert.equal(command.kind, 'reopenBatch'); assert(!Object.hasOwn(command, 'revision')); await settle(); assert.equal(h.backend.raw().pinnedId, pin.id); assert.equal(record(h).state, 'active'); }
        else assert.equal(h.view.undo, null);
    } finally { cleanup(h, owner); }
});
