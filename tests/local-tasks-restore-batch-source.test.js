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
    return tasks.validate({ schemaVersion: 1, revision: 4, enabled: true, pinnedId: 'task_0004', receipts: ['prior_operation'],
        records: Array.from({ length: 9 }, (_, i) => ({ id: `task_000${i}`, version: `version_${i}`,
            text: i < 2 ? '  duplicate 中文 😀\r\ntext\r  ' : `Synthetic task ${i}`, state: i < 4 ? 'removed' : i < 8 ? 'active' : 'done',
            removedFrom: i < 4 ? (i % 2 ? 'done' : 'active') : null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' })),
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
const routes = ['restore'];
const method = route => 'reviewRestoration';
const ctl = (h, route, name) => modal(h)?.querySelector(`.tasks-${route}-${name}`);
const choices = (h, route) => modal(h)?.querySelectorAll(`.tasks-${route}-checkbox`);
const click = (h, route, name) => { const node = ctl(h, route, name); assert(node, `${route} ${name}`); node.dispatch('click'); return node; };
function open(h, route) {
    h.view.removed.box.open = true; h.view.removed.box.dispatch('toggle');
    const origin = h.view.restoreBatchButton;
    origin.focus(); origin.dispatch('click'); assert(modal(h), 'real selection popup opened');
    assert(choices(h, route).every(node => !node.checked), 'nothing selected initially');
}
function check(h, route, index, value = true) { const node = choices(h, route)[index]; node.checked = value; node.dispatch('change'); }
async function review(h, route) { click(h, route, 'review'); await settle(); }
async function ready(h, route) { open(h, route); check(h, route, 0); check(h, route, 1); await review(h, route); assert(!ctl(h, route, 'confirm').hidden, 'real numbered review'); }
function resume(h, owner) { restore(h, owner); h.controller.emit(); }
const texts = (h, route) => ctl(h, route, 'preview')?.querySelectorAll('.tasks-recovery-text').map(node => node.textContent);
const ui = (h, route) => ({ panel: modal(h), session: h.view.restorationSession, quick: h.view.input.value,
    effect: h.view.retryEffect, failure: h.view.retryFailure, operation: h.view.retryEffectOperationId, action: h.view.actionGeneration,
    undo: h.view.undo, restorationAttempt: h.view.restorationAttempt, focus: h.document.activeElement, selected: JSON.stringify(choices(h, route)?.map(node => node.checked)),
    controls: JSON.stringify(modal(h)?.querySelectorAll('button').map(node => [node.textContent, node.disabled, node.hidden])),
    preview: JSON.stringify([ctl(h, route, 'preview')?.hidden, texts(h, route)]) });
function sameUI(h, route, before, omit = []) { const now = ui(h, route); for (const [key, value] of Object.entries(before)) if (!omit.includes(key)) assert(Object.is(now[key], value), `unchanged ${key}`); }
function ownOutcome(h, command, mode) { assert.equal(h.controller.status, mode === 'success' ? 'saved' : 'error'); assert.equal(h.controller.error?.code, mode === 'success' ? undefined : mode === 'drop' ? 'VERIFY' : 'WRITE'); assert(h.controller.retryCommand === (mode === 'success' ? null : command), 'actual exact outcome'); }
function transitioned(h, route, command) {
    const raw = h.backend.raw(), before = initial(), ids = command.targets.map(target => target.id);
    assert.equal(raw.records.length, before.records.length); assert.deepEqual(raw.records.map(task => task.id), before.records.map(task => task.id));
    for (const task of raw.records) { const target = command.targets.find(t => t.id === task.id), old = before.records.find(t => t.id === task.id);
        if (target) { assert.equal(task.state, target.removedFrom); assert.equal(task.version, target.nextVersion); assert.equal(task.text, old.text); assert.equal(task.removedFrom, null); }
        else assert.deepEqual(task, old);
    }
    assert.deepEqual(raw.recovery, before.recovery); assert.equal(raw.enabled, before.enabled);
    assert.equal(raw.pinnedId, before.pinnedId);
    assert.equal(raw.receipts.filter(id => id === command.operationId).length, 1);
}
function undoResult(h) { assert.equal(h.view.undo, null); }

for (const route of routes) for (const source of sources) test(`${route} entry rejects construction ${source} before popup/subscription`, async t => {
    const { h, owner, foreign } = await pair();
    try { h.view.removed.box.open = true; h.view.removed.box.dispatch('toggle'); change(h, source, foreign); const own = io(h), other = io(foreign), a = feedback(h), b = feedback(foreign), subs = { ...foreign.subscriptions };
        (h.view.restoreBatchButton).dispatch('click'); await settle();
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
        resume(h, owner); if (stage === 'review' || ctl(h, route, 'confirm').hidden) await review(h, route); click(h, route, 'confirm'); const command = h.controller.retryCommand; await settle(); transitioned(h, route, command);
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
for (const route of routes) for (const source of sources) test(`${route} source-gap ${source} subscription and Cancel cannot steal focus or foreign exact WRITE`, async () => {
    const { h, owner, foreign } = await pair();
    try { await ready(h, route); h.backend.mode = 'false'; click(h, route, 'confirm'); await settle(); const command = h.controller.retryCommand;
        foreign.backend.mode = 'false'; await assert.rejects(foreign.controller.run(command)); const b = feedback(foreign), other = io(foreign), subs = { ...foreign.subscriptions }; ctl(h, route, 'retry').focus(); change(h, source, foreign); const before = ui(h, route);
        h.controller.emit(); sameUI(h, route, before); assert.match(modal(h).querySelector('.tasks-dialog-feedback').textContent, /changed in another page/);
        click(h, route, 'cancel'); assert(!modal(h)); assert(h.document.activeElement === h.document.body, 'no source-gap return focus'); sameFeedback(foreign, b); assert.deepEqual(io(foreign), other); assert.deepEqual(foreign.subscriptions, subs); assert.equal(h.subscriptions.removes, 1); assert(h.controller.retryCommand === command, 'close retains uncertain card command');
        resume(h, owner); h.view.retry.dispatch('click'); await settle(); transitioned(h, route, command); undoResult(h, route);
    } finally { cleanup(h, owner, foreign); }
});
for (const route of routes) for (const stage of ['review', 'confirm', 'retry']) for (const source of sources) test(`${route} ${stage} rechecks ${source} focused control hook before dispatch`, async () => {
    const { h, owner, foreign } = await pair();
    try { open(h, route); check(h, route, 0); check(h, route, 1); if (stage !== 'review') await review(h, route); if (stage === 'retry') { h.backend.mode = 'false'; click(h, route, 'confirm'); await settle(); } const cancel = ctl(h, route, 'cancel'), focus = cancel.focus.bind(cancel);
        cancel.focus = () => { focus(); change(h, source, foreign); }; ctl(h, route, stage).focus(); const own = io(h), other = io(foreign); click(h, route, stage); await settle();
        assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); if (stage !== 'retry') assert.equal(h.controller.retryCommand, null);
    } finally { cleanup(h, owner, foreign); }
});
for (const route of routes) for (const source of sources) test(`${route} post-construction hook rejects ${source} before original or foreign subscription`, async () => {
    const { h, owner, foreign } = await pair(), create = h.view.createDialog.bind(h.view);
    try { h.view.createDialog = (...args) => { const value = create(...args); change(h, source, foreign); return value; }; h.view.removed.box.open = true; h.view.removed.box.dispatch('toggle');
        const own = io(h), other = io(foreign), subs = { ...h.subscriptions }, fs = { ...foreign.subscriptions }; (h.view.restoreBatchButton).dispatch('click'); await settle();
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
for (const route of routes) for (const mode of ['success', 'false', 'drop', 'ack']) test(`${route} original closed-popup ${mode} preserves unrelated Undo and card Retry`, async () => {
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
            else { const item = row(h, 'task_0005'); item.querySelector('.tasks-row-menu').open = true; button(item, 'Remove').dispatch('click'); }
            next = h.controller.retryCommand;
        });
        click(h, route, 'confirm'); await settle(); assert(next);
        if (newer === 'quick-add') { assert(h.controller.retryCommand === next); assert.equal(h.controller.error.code, 'WRITE'); assert.equal(h.view.undo, null); const counts = io(h); h.view.retry.dispatch('click'); await settle(); assert.equal(h.backend.requests, counts.requests); assert.equal(h.view.input.value, ''); }
        else { assert.equal(h.view.undo.id, 'task_0005'); assert.equal(h.view.undo.state, 'removed'); }
    } finally { cleanup(h, owner); }
});
for (const route of routes) for (const stage of ['entry', 'review', 'confirm']) for (const unavailable of ['suspended', 'invalidated', 'closed', 'hidden', 'departing', 'detach']) test(`${route} ${stage} preserves existing ${unavailable} admission`, async () => {
    const h = model(); await settle(); const owner = capture(h);
    try { if (stage !== 'entry') { open(h, route); check(h, route, 0); } else { h.view.removed.box.open = true; h.view.removed.box.dispatch('toggle'); } if (stage === 'confirm') await review(h, route);
        if (unavailable === 'suspended') h.backend.workspace._suspended = true; if (unavailable === 'invalidated') h.backend.workspace.invalidated = true; if (unavailable === 'closed') h.controller.destroy();
        if (unavailable === 'hidden') h.document.hidden = true; if (unavailable === 'departing') h.window.LocalItabContentLifecycle.departing = true; if (unavailable === 'detach') h.host.remove();
        const counts = io(h); if (stage === 'entry') (h.view.restoreBatchButton).dispatch('click'); else click(h, route, stage); await settle(); assert.deepEqual(io(h), counts); if (stage === 'entry') assert(!modal(h));
    } finally { delete owner.workspace._suspended; delete owner.workspace.invalidated; cleanup(h, owner); }
});
for (const route of routes) test(`${route} reviewed revision conflict preserves original destinations, order, pin and unrelated Undo`, async () => {
    const h = model(); await settle(); const owner = capture(h);
    try { const active = record(h, 'task_0007'); await h.view.perform(h.store.request('complete', { id: active.id, version: active.version })); const undo = h.view.undo;
        await ready(h, route); const other = record(h, 'task_0006'); await h.remote.mutate(h.remote.request('edit', { id: other.id, version: other.version, text: 'unrelated edit' })); const counts = io(h), before = h.backend.raw();
        click(h, route, 'confirm'); await settle(); assert.equal(h.backend.writes, counts.writes); assert.deepEqual(h.backend.raw(), before); assert(ctl(h, route, 'preview').hidden);
        await review(h, route); click(h, route, 'confirm'); await settle(); assert(h.view.undo === undo); assert.equal(record(h).state, 'active'); assert.equal(record(h, 'task_0001').state, 'done'); assert.equal(h.backend.raw().pinnedId, 'task_0004');
        h.view.undoLast(); await settle(); assert.equal(record(h, 'task_0007').state, 'active');
    } finally { cleanup(h, owner); }
});

for (const stage of ['review', 'confirm', 'retry']) for (const source of sources) test(`restore ${stage} rechecks ${source} control property hook before I/O`, async () => {
    const { h, owner, foreign } = await pair();
    try { open(h, 'restore'); check(h, 'restore', 0); check(h, 'restore', 1); if (stage !== 'review') await review(h, 'restore');
        if (stage === 'retry') { h.backend.mode = 'false'; click(h, 'restore', 'confirm'); await settle(); }
        const node = choices(h, 'restore')[0], descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'disabled');
        Object.defineProperty(node, 'disabled', { configurable: true, get() { return descriptor.get.call(this); }, set(value) { descriptor.set.call(this, value); change(h, source, foreign); } });
        const own = io(h), other = io(foreign), a = feedback(h), b = feedback(foreign); click(h, 'restore', stage); await settle();
        assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); sameFeedback(h, a); sameFeedback(foreign, b);
    } finally { cleanup(h, owner, foreign); }
});
for (const unavailable of ['hidden', 'departing', 'suspended', 'invalidated']) for (const path of ['modal', 'card']) test(`restore ${path} exact Retry keeps historical ${unavailable} availability gate`, async () => {
    const h = model(); await settle(); const owner = capture(h);
    try { await ready(h, 'restore'); h.backend.mode = 'false'; click(h, 'restore', 'confirm'); await settle(); const command = h.controller.retryCommand;
        if (path === 'card') click(h, 'restore', 'cancel'); if (unavailable === 'hidden') h.document.hidden = true; if (unavailable === 'departing') h.window.LocalItabContentLifecycle.departing = true;
        if (unavailable === 'suspended') owner.workspace._suspended = true; if (unavailable === 'invalidated') owner.workspace.invalidated = true;
        const own = io(h), a = feedback(h); if (path === 'card') await h.view.retryLast(); else click(h, 'restore', 'retry'); await settle(); assert.deepEqual(io(h), own); sameFeedback(h, a);
        h.document.hidden = false; h.window.LocalItabContentLifecycle.departing = false; delete owner.workspace._suspended; delete owner.workspace.invalidated;
        if (path === 'card') await h.view.retryLast(); else click(h, 'restore', 'retry'); await settle(); transitioned(h, 'restore', command);
    } finally { delete owner.workspace._suspended; delete owner.workspace.invalidated; cleanup(h, owner); }
});
test('restore closed-card exact Retry retains its historical detached-host admission', async () => {
    const h = model(); await settle(); const owner = capture(h);
    try { await ready(h, 'restore'); h.backend.mode = 'false'; click(h, 'restore', 'confirm'); await settle(); const command = h.controller.retryCommand; click(h, 'restore', 'cancel'); h.host.remove();
        const counts = io(h); await h.view.retryLast(); await settle(); transitioned(h, 'restore', command); assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + 1);
    } finally { cleanup(h, owner); }
});
test('restore late review belongs to original modal after restoration-session reuse', async () => {
    const h = model(); await settle(); const owner = capture(h), gate = deferred(), original = h.store.reviewRestoration.bind(h.store); let first = true;
    try { open(h, 'restore'); check(h, 'restore', 0); h.store.reviewRestoration = async targets => { const value = await original(targets); if (first) { first = false; await gate.promise; } return value; };
        click(h, 'restore', 'review'); await settle(); click(h, 'restore', 'cancel'); open(h, 'restore'); check(h, 'restore', 1); await review(h, 'restore'); const before = ui(h, 'restore');
        gate.resolve(); await settle(); sameUI(h, 'restore', before); click(h, 'restore', 'confirm'); await settle(); assert.equal(record(h).state, 'removed'); assert.equal(record(h, 'task_0001').state, 'done');
    } finally { gate.resolve(); cleanup(h, owner); }
});
test('restore final notification may open a new restoration session without old preview or focus effects', async () => {
    const h = model(); await settle(); const owner = capture(h); let nextPanel, nextFocus;
    try { await ready(h, 'restore'); const off = h.controller.subscribe(() => { if (h.controller.status !== 'saved' || h.controller.pending) return; off(); click(h, 'restore', 'cancel'); open(h, 'restore'); check(h, 'restore', 0); nextPanel = modal(h); nextFocus = h.document.activeElement; });
        click(h, 'restore', 'confirm'); await settle(); assert(modal(h) === nextPanel); assert(h.document.activeElement === nextFocus); assert(choices(h, 'restore')[0].checked); assert(ctl(h, 'restore', 'preview').hidden);
        await review(h, 'restore'); click(h, 'restore', 'confirm'); await settle(); assert.equal(record(h, 'task_0002').state, 'active'); assert.equal(record(h, 'task_0003').state, 'removed'); assert.equal(h.view.restorationAttempt, null);
    } finally { cleanup(h, owner); }
});
test('restore old modal Retry cannot replace a newer distinct same-kind real WRITE', async () => {
    const h = model(); await settle(); const owner = capture(h);
    try { await ready(h, 'restore'); h.backend.mode = 'false'; click(h, 'restore', 'confirm'); await settle(); const old = h.controller.retryCommand;
        const task = record(h, 'task_0002'), value = await h.store.reviewRestoration([{ id: task.id, version: task.version, removedFrom: task.removedFrom }]); h.backend.mode = 'false'; await assert.rejects(h.controller.run(value.command));
        assert(value.command !== old); assert.equal(value.command.kind, old.kind); const before = feedback(h), counts = io(h); click(h, 'restore', 'retry'); await settle(); sameFeedback(h, before); assert.deepEqual(io(h), counts); click(h, 'restore', 'cancel'); sameFeedback(h, before);
        await h.controller.retry(); await settle(); assert.equal(record(h).state, 'removed'); assert.equal(record(h, 'task_0002').state, 'active');
    } finally { cleanup(h, owner); }
});
test('restore private attempt routing does not claim an unrelated same-kind generic perform', async () => {
    const h = model(); await settle(); const owner = capture(h);
    try { await ready(h, 'restore'); click(h, 'restore', 'confirm'); await settle(); const task = record(h, 'task_0002'), value = await h.store.reviewRestoration([{ id: task.id, version: task.version, removedFrom: task.removedFrom }]); let called = 0;
        await h.view.perform(value.command, () => { called++; }); await settle(); assert.equal(called, 1); assert.equal(record(h, 'task_0002').state, 'active'); assert.equal(h.view.undo, null);
    } finally { cleanup(h, owner); }
});

for (const source of sources) test(`restore final review admission ${source} layout hook cannot redirect captured Store`, async t => {
    const { h, owner, foreign } = await pair();
    try { open(h, 'restore'); check(h, 'restore', 0); const popup = modal(h), original = popup.getClientRects.bind(popup); let layouts = 0;
        popup.getClientRects = () => { const boxes = original(); if (++layouts === 4) change(h, source, foreign); return boxes; };
        const own = io(h), other = io(foreign); click(h, 'restore', 'review'); await settle(); assert(layouts >= 4, 'final layout hook ran');
        t.diagnostic(JSON.stringify({ source, own: delta(own, io(h)), foreign: delta(other, io(foreign)) }));
        assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); assert(ctl(h, 'restore', 'preview').hidden);
    } finally { cleanup(h, owner, foreign); }
});
for (const source of sources) test(`restore review publication rechecks ${source} after original source-title layout`, async () => {
    const { h, owner, foreign } = await pair(), original = h.store.reviewRestoration.bind(h.store); let hooked = false;
    try { open(h, 'restore'); check(h, 'restore', 0); check(h, 'restore', 1);
        h.store.reviewRestoration = async targets => { const value = await original(targets); const title = h.view.removed.list.children.at(-1).querySelector('.tasks-text'), layout = title.getClientRects.bind(title);
            title.getClientRects = () => { const boxes = layout(); if (!hooked) { hooked = true; change(h, source, foreign); } return boxes; }; return value; };
        const own = io(h), other = io(foreign); click(h, 'restore', 'review'); await settle(); assert(hooked, 'final source-title layout hook ran');
        assert.deepEqual(delta(own, io(h)), { requests: 1, reads: 1, writes: 0 }); assert.deepEqual(io(foreign), other); assert(ctl(h, 'restore', 'preview').hidden); assert(ctl(h, 'restore', 'confirm').hidden);
    } finally { cleanup(h, owner, foreign); }
});
for (const source of sources) test(`restore ${source} gap composition preserves original reviewed selection and preview`, async () => {
    const { h, owner, foreign } = await pair();
    try { await ready(h, 'restore'); change(h, source, foreign); const before = ui(h, 'restore'), own = io(h), other = io(foreign);
        modal(h).dispatch('compositionstart'); modal(h).dispatch('compositionend'); await settle(); sameUI(h, 'restore', before); assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other);
        resume(h, owner); click(h, 'restore', 'confirm'); const command = h.controller.retryCommand; await settle(); transitioned(h, 'restore', command);
    } finally { cleanup(h, owner, foreign); }
});
test('restore original-source composition still invalidates review and blocks activation until end and re-review', async () => {
    const h = model(); await settle(); const owner = capture(h);
    try { await ready(h, 'restore'); const counts = io(h); modal(h).dispatch('compositionstart'); assert(ctl(h, 'restore', 'preview').hidden); assert(choices(h, 'restore').slice(0, 2).every(node => node.checked));
        click(h, 'restore', 'confirm'); click(h, 'restore', 'review'); await settle(); assert.deepEqual(io(h), counts); modal(h).dispatch('compositionend'); await review(h, 'restore'); click(h, 'restore', 'confirm'); const command = h.controller.retryCommand; await settle(); transitioned(h, 'restore', command);
    } finally { cleanup(h, owner); }
});
for (const boundary of ['source-snapshot', 'final-availability']) test(`restore subscription ${boundary} layout gap cannot clear reviewed preview`, async () => {
    const { h, owner, foreign } = await pair(); let hooked = false;
    try { await ready(h, 'restore'); const node = boundary === 'source-snapshot' ? h.view.removed.list.children.at(-1).querySelector('.tasks-text') : modal(h), layout = node.getClientRects.bind(node); let calls = 0;
        node.getClientRects = () => { const boxes = layout(); if (!hooked && (boundary === 'source-snapshot' || ++calls === 2)) { hooked = true; change(h, 'backend', foreign); } return boxes; };
        const before = ui(h, 'restore'), own = io(h), other = io(foreign); h.controller.emit(); await settle(); assert(hooked); sameUI(h, 'restore', before); assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other);
    } finally { cleanup(h, owner, foreign); }
});
