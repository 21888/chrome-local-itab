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
const NOW = '2026-10-18T07:00:00.000Z';
function initial() {
    return tasks.validate({ schemaVersion: 1, revision: 4, enabled: true, pinnedId: 'task_0001', receipts: ['operation_prior'],
        records: Array.from({ length: 7 }, (_, i) => ({ id: `task_000${i}`, version: `version_${i}`,
            text: `Synthetic task ${i} 中文 😀`, state: i === 5 ? 'done' : i === 6 ? 'removed' : 'active',
            removedFrom: i === 6 ? 'done' : null, createdAt: NOW, updatedAt: NOW })),
        recovery: [{ id: 'recovery_prior', createdAt: NOW, content: { records: [], pinnedId: null } }] });
}
// These deliberate public-source substitutions probe a boundary, not normal
// workspace navigation or the historical loss report. Each real Store lock owns
// a fixed storage target even if workspace identity changes while it is pending.
function model({ state = initial(), workspace = { id: 'workspace_original', generation: 'generation_original' }, prefix = 'original' } = {}) {
    const identities = new WeakMap(), sources = new Map(), listeners = new Set();
    let identity = 0, queue = Promise.resolve(), activeTarget = null, serial = 0;
    const backend = { workspace, requests: 0, reads: 0, writes: 0, mode: null, writeGate: null, readGate: null, nextReadFails: false,
        lock(fn) { const target = source(); const next = queue.then(async () => { activeTarget = target; try { return await fn(); } finally { activeTarget = null; } }); queue = next.catch(() => {}); return next; },
        async read() { backend.reads++; const target = activeTarget || source(), gate = backend.readGate, fail = backend.nextReadFails;
            backend.readGate = null; backend.nextReadFails = false; if (gate) { gate.entered.resolve(); await gate.release.promise; }
            if (fail) throw Error('Synthetic read failure'); return clone(target.raw); },
        async write(value) { backend.writes++; const target = activeTarget || source(), gate = backend.writeGate, mode = backend.mode;
            backend.writeGate = null; backend.mode = null; if (gate) { gate.entered.resolve(); await gate.release.promise; }
            if (mode === 'false') return false; if (mode === 'drop') return; target.raw = clone(value); if (mode === 'ack') throw Error('Synthetic lost acknowledgement'); },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        raw: () => clone(source().raw), allRaw: () => clone([...sources.entries()])
    };
    function source() {
        const current = backend.workspace;
        if (current && !identities.has(current)) identities.set(current, ++identity);
        const key = current ? `${identities.get(current)}:${current.id}:${current.generation}` : 'legacy';
        if (!sources.has(key)) sources.set(key, { raw: clone(state) }); return sources.get(key);
    }
    const originalTarget = source(); backend.originalRaw = () => clone(originalTarget.raw);
    const store = new tasks.Store(backend, { id: () => `${prefix}_operation_${++serial}`, now: () => NOW });
    const request = store.request.bind(store); store.request = (...args) => { backend.requests++; return request(...args); };
    const controller = new Controller(store), remote = new tasks.Store(backend), api = { ...tasks, Controller };
    const document = createDocument({ blurUnavailableFocus: true }), host = document.createElement('article'), search = document.createElement('input');
    document.body.append(search, host); search.focus();
    const window = { LocalItabTasks: api, LocalItabWorkspaces: { session: workspace }, LocalItabContentLifecycle: { departing: false } };
    const context = vm.createContext({ window, document, crypto: webcrypto, URL, Blob, setTimeout, console });
    for (const file of ['dialog-focus.js', 'local-tasks-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared', file), 'utf8'), context);
    const view = api.mount(host, { controller }); return { backend, store, remote, controller, document, host, search, window, view };
}
const row = (h, id) => h.host.querySelectorAll('[data-task-id]').find(node => node.dataset.taskId === id);
const button = (node, label) => node.querySelectorAll('button').find(control => control.textContent === label);
const io = h => ({ requests: h.backend.requests, reads: h.backend.reads, writes: h.backend.writes });
const delta = (before, after) => Object.fromEntries(Object.keys(before).map(key => [key, after[key] - before[key]]));
const feedback = h => ({ state: h.controller.state, status: h.controller.status, error: h.controller.error, retry: h.controller.retryCommand, pending: h.controller.pending });
function sameFeedback(h, before) { for (const key of ['state', 'error', 'pending']) assert(h.controller[key] === before[key], `same ${key} identity`); assert(h.controller.retryCommand === before.retry, 'same exact Retry'); assert.equal(h.controller.status, before.status); }
const ui = h => ({ undo: h.view.undo, effect: h.view.retryEffect, failure: h.view.retryFailure, operation: h.view.retryEffectOperationId,
    generation: h.view.actionGeneration, localError: h.view.localError, draft: h.view.input.value, focus: h.document.activeElement,
    status: h.view.status.textContent, retryHidden: h.view.retry.hidden, rows: h.host.querySelectorAll('.tasks-row').map(node => node.dataset.taskId).join(',') });
function sameUI(h, before) { const after = ui(h); for (const key of Object.keys(before)) assert(after[key] === before[key], `unchanged View ${key}`); }
function capture(h) { return { workspace: h.backend.workspace, id: h.backend.workspace.id, generation: h.backend.workspace.generation, session: h.window.LocalItabWorkspaces.session }; }
function restore(h, owner) { h.view.controller = h.controller; h.controller.store = h.store; h.store.backend = h.backend; h.view.host = h.host;
    h.backend.workspace = owner.workspace; owner.workspace.id = owner.id; owner.workspace.generation = owner.generation; h.window.LocalItabWorkspaces.session = owner.session; }
function change(h, kind, foreign) {
    if (kind === 'controller') h.view.controller = foreign.controller;
    else if (kind === 'store') h.controller.store = foreign.store;
    else if (kind === 'backend') h.store.backend = foreign.backend;
    else if (kind === 'workspace') { h.backend.workspace = { ...h.backend.workspace }; h.window.LocalItabWorkspaces.session = h.backend.workspace; }
    else if (kind === 'id') h.backend.workspace.id = 'workspace_other';
    else if (kind === 'generation') h.backend.workspace.generation = 'generation_other';
    else if (kind === 'session') h.window.LocalItabWorkspaces.session = { ...h.backend.workspace };
    else { const replacement = h.document.createElement('article'); h.document.body.append(replacement); h.view.host = replacement; }
}
const sources = ['controller', 'store', 'backend', 'workspace', 'id', 'generation', 'session', 'host'];
const routes = ['complete', 'reopen', 'restore', 'remove-active', 'remove-done', 'pin', 'up', 'down', 'moveFirst', 'moveLast', 'completePinned'];
const routeId = route => route === 'completePinned' ? 'task_0001' : route === 'reopen' || route === 'remove-done' ? 'task_0005' : route === 'restore' ? 'task_0006' : ['up', 'moveFirst'].includes(route) ? 'task_0002' : 'task_0000';
function control(h, route) {
    if (route === 'completePinned') return h.view.nextComplete;
    if (['reopen', 'remove-done'].includes(route)) h.view.completed.box.open = true;
    if (route === 'restore') h.view.removed.box.open = true;
    const item = row(h, routeId(route)); assert(item, `real ${route} row`); const menu = item.querySelector('.tasks-row-menu'); if (menu) menu.open = true;
    const result = ['complete', 'reopen'].includes(route) ? item.querySelector('.tasks-check') : button(item, { restore: 'Restore', 'remove-active': 'Remove', 'remove-done': 'Remove', pin: 'Pin next', up: 'Move up', down: 'Move down', moveFirst: 'Move to list start', moveLast: 'Move to list end' }[route]);
    assert(result && result.getClientRects().length && !result.disabled, `visible enabled ${route} control`); return result;
}
function commandFor(h, route) { const id = routeId(route), state = h.controller.state, record = state.records.find(task => task.id === id);
    const kind = route.startsWith('remove-') ? 'remove' : ['up', 'down'].includes(route) ? 'move' : route;
    return h.store.request(kind, { id, version: record.version, ...(['pin', 'completePinned'].includes(route) ? { expectedPin: state.pinnedId } : {}),
        ...(['up', 'down', 'moveFirst', 'moveLast'].includes(route) ? { order: state.records.filter(task => task.state === 'active').map(task => task.id) } : {}),
        ...(['up', 'down'].includes(route) ? { direction: route === 'up' ? -1 : 1 } : {}) });
}
function outcome(h, route, command) { const state = h.backend.originalRaw(), record = state.records.find(task => task.id === routeId(route));
    assert.equal(state.receipts.filter(id => id === command.operationId).length, 1);
    if (['complete', 'completePinned'].includes(route)) assert.equal(record.state, 'done');
    else if (route === 'reopen') assert.equal(record.state, 'active');
    else if (route === 'restore') { assert.equal(record.state, 'done'); assert.equal(record.removedFrom, null); }
    else if (route.startsWith('remove-')) assert.equal(record.state, 'removed');
    else if (route === 'pin') assert.equal(state.pinnedId, record.id);
    else { const active = state.records.filter(task => task.state === 'active').map(task => task.id), index = active.indexOf(record.id);
        assert.equal(index, route === 'up' ? 1 : route === 'down' ? 1 : route === 'moveFirst' ? 0 : 4); }
    assert.equal(state.records.length, 7); assert.deepEqual(state.recovery, initial().recovery);
}
async function pair({ undo = false } = {}) { const h = model(); await settle(); if (undo) { control(h, 'completePinned').dispatch('click'); await settle(); assert(h.view.undo); }
    const owner = capture(h), foreign = model({ state: h.backend.originalRaw(), workspace: owner.workspace, prefix: 'foreign' }); await settle(); return { h, owner, foreign }; }
function cleanup(h, owner, foreign) { restore(h, owner); h.view.destroy(); foreign?.view.destroy(); }
const gateAt = (b, stage = 'write') => { const gate = { entered: deferred(), release: deferred() }; b[`${stage}Gate`] = gate; return gate; };

for (const route of routes) for (const source of sources) test(`${route} request-return ${source} gap cannot dispatch or replace generic effects`, async t => {
    const { h, owner, foreign } = await pair(), request = h.store.request;
    try { const action = control(h, route), before = ui(h), own = io(h), other = io(foreign), a = feedback(h), b = feedback(foreign), raw = h.backend.originalRaw(), fraw = foreign.backend.originalRaw(); let requests = 0;
        h.store.request = (...args) => { const command = request(...args); requests++; change(h, source, foreign); return command; };
        action.dispatch('click'); await settle();
        t.diagnostic(JSON.stringify({ route, source, own: delta(own, io(h)), foreign: delta(other, io(foreign)), generation: h.view.actionGeneration - before.generation }));
        assert.equal(requests, 1); assert.deepEqual(delta(own, io(h)), { requests: 1, reads: 0, writes: 0 }); assert.deepEqual(io(foreign), other);
        sameFeedback(h, a); sameFeedback(foreign, b); assert.deepEqual(h.backend.originalRaw(), raw); assert.deepEqual(foreign.backend.originalRaw(), fraw);
        assert.equal(h.view.actionGeneration, before.generation); assert(h.view.retryEffect === before.effect); assert(h.view.retryFailure === before.failure); assert.equal(h.view.retryEffectOperationId, before.operation);
        h.store.request = request; restore(h, owner); h.view.render(); action && control(h, route).dispatch('click'); const command = h.controller.retryCommand; await settle(); assert(command); outcome(h, route, command);
    } finally { h.store.request = request; cleanup(h, owner, foreign); }
});

for (const route of routes) for (const mode of ['success', 'false', 'drop', 'ack']) test(`original ${route} ${mode} keeps exact generic Retry and receipt`, async () => {
    const { h, owner, foreign } = await pair();
    try { h.backend.mode = mode; control(h, route).dispatch('click'); const command = h.controller.retryCommand; assert(command); await settle();
        if (mode !== 'success') { assert.equal(h.controller.error.code, mode === 'drop' ? 'VERIFY' : 'WRITE'); assert(h.controller.retryCommand === command); const counts = io(h);
            h.view.filterInput.value = 'Synthetic'; h.view.applyFilter(); h.view.completed.box.open = false; h.view.removed.box.open = false;
            await h.view.retryLast(); await settle(); assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + (mode === 'ack' ? 0 : 1)); }
        outcome(h, route, command); assert.equal(h.controller.error, null); assert.equal(h.controller.retryCommand, null);
        if (['complete', 'completePinned', 'remove-active', 'remove-done'].includes(route)) assert(h.view.undo && h.view.undo.id === routeId(route));
    } finally { cleanup(h, owner, foreign); }
});

for (const source of sources) test(`generic effect setup rechecks ${source} before captured dispatch`, async () => {
    const { h, owner, foreign } = await pair(), command = commandFor(h, 'complete'); let value = h.view.retryEffect, armed = true;
    try { Object.defineProperty(h.view, 'retryEffect', { configurable: true, get: () => value, set(next) { value = next; if (armed) { armed = false; change(h, source, foreign); } } });
        const own = io(h), other = io(foreign), a = feedback(h), b = feedback(foreign); await h.view.perform(command, () => {});
        assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); sameFeedback(h, a); sameFeedback(foreign, b);
    } finally { Object.defineProperty(h.view, 'retryEffect', { configurable: true, writable: true, value }); cleanup(h, owner, foreign); }
});

for (const mode of ['success', 'false', 'drop', 'ack']) for (const source of sources) test(`issued generic ${mode} ${source} gap keeps original result without late effects`, async t => {
    const { h, owner, foreign } = await pair({ undo: true }), gate = gateAt(h.backend); let success = 0, failure = 0;
    try { const command = commandFor(h, 'complete'); h.backend.mode = mode;
        const pending = h.view.perform(command, () => { success++; h.view.input.value = 'OLD success'; }, () => { failure++; h.view.input.value = 'OLD failure'; }); await gate.entered.promise;
        foreign.backend.mode = 'false'; await assert.rejects(foreign.controller.run(command)); const b = feedback(foreign), other = io(foreign), fraw = foreign.backend.originalRaw();
        change(h, source, foreign); h.view.input.value = 'newer untouched draft'; h.view.input.focus(); const before = ui(h); gate.release.resolve(); await pending; await settle();
        t.diagnostic(JSON.stringify({ mode, source, status: h.controller.status, error: h.controller.error?.code || null, success, failure }));
        assert.equal(h.controller.status, mode === 'success' ? 'saved' : 'error'); assert.equal(h.controller.error?.code, mode === 'success' ? undefined : mode === 'drop' ? 'VERIFY' : 'WRITE');
        assert(h.controller.retryCommand === (mode === 'success' ? null : command)); assert.equal(success, 0); assert.equal(failure, 0); sameUI(h, before); sameFeedback(foreign, b); assert.deepEqual(io(foreign), other); assert.deepEqual(foreign.backend.originalRaw(), fraw);
        const raw = h.backend.originalRaw(); assert.equal(raw.records.find(task => task.id === 'task_0000').state, ['success', 'ack'].includes(mode) ? 'done' : 'active');
        restore(h, owner); h.view.render(); const counts = io(h); if (mode === 'success') await h.view.perform(command, () => success++); else await h.view.retryLast(); await settle();
        outcome(h, 'complete', command); assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + (['false', 'drop'].includes(mode) ? 1 : 0)); assert.equal(success, 1); assert.equal(failure, 0);
    } finally { gate.release.resolve(); cleanup(h, owner, foreign); }
});

for (const source of sources) test(`no-attempt genuine null READ Retry cannot refresh ${source} substitution`, async () => {
    const { h, owner, foreign } = await pair();
    try { h.backend.nextReadFails = true; await assert.rejects(h.controller.refresh(), { code: 'READ' }); foreign.backend.nextReadFails = true; await assert.rejects(foreign.controller.refresh(), { code: 'READ' });
        assert.equal(h.controller.retryCommand, null); change(h, source, foreign); const own = io(h), other = io(foreign), a = feedback(h), b = feedback(foreign), before = ui(h);
        await h.view.retryLast(); await settle(); assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); sameFeedback(h, a); sameFeedback(foreign, b); sameUI(h, before);
        restore(h, owner); const counts = io(h); await h.view.retryLast(); assert.equal(h.backend.reads, counts.reads + 1); assert.equal(h.backend.writes, counts.writes); assert.equal(h.controller.error, null); sameFeedback(foreign, b);
    } finally { cleanup(h, owner, foreign); }
});

for (const source of sources) test(`null READ Retry setup rechecks ${source} before refresh`, async () => {
    const { h, owner, foreign } = await pair(); let value = h.view.localError, armed = true;
    try { h.backend.nextReadFails = true; await assert.rejects(h.controller.refresh(), { code: 'READ' });
        Object.defineProperty(h.view, 'localError', { configurable: true, get: () => value, set(next) { value = next; if (armed) { armed = false; change(h, source, foreign); } } });
        const own = io(h), other = io(foreign), a = feedback(h), b = feedback(foreign); await h.view.retryLast();
        assert.deepEqual(io(h), own); assert.deepEqual(io(foreign), other); sameFeedback(h, a); sameFeedback(foreign, b);
    } finally { Object.defineProperty(h.view, 'localError', { configurable: true, writable: true, value }); cleanup(h, owner, foreign); }
});

for (const source of sources) test(`issued null READ Retry ${source} gap cannot invoke late generic render`, async () => {
    const { h, owner, foreign } = await pair(), render = h.view.render; let renders = 0;
    try { h.backend.nextReadFails = true; await assert.rejects(h.controller.refresh(), { code: 'READ' }); const gate = gateAt(h.backend, 'read');
        const pending = h.view.retryLast(); await gate.entered.promise; change(h, source, foreign); h.view.render = function (...args) { renders++; return render.apply(this, args); };
        const other = io(foreign), b = feedback(foreign); gate.release.resolve(); await pending; assert.equal(renders, 0); assert.deepEqual(io(foreign), other); sameFeedback(foreign, b);
    } finally { h.view.render = render; cleanup(h, owner, foreign); }
});

for (const route of routes) test(`unrelated direct generic ${route} retains original source without kind-only row routing`, async () => {
    const { h, owner, foreign } = await pair(); let effects = 0;
    try { const command = commandFor(h, route); h.view.filterInput.value = 'no matching rows'; h.view.applyFilter(); h.view.completed.box.open = false; h.view.removed.box.open = false;
        await h.view.perform(command, () => effects++); outcome(h, route, command); assert.equal(effects, 1); assert.equal(h.controller.error, null);
    } finally { cleanup(h, owner, foreign); }
});

for (const exact of [false, true]) test(`older generic failure cannot call effect while newer ${exact ? 'same exact' : 'same-ID distinct'} command is pending`, async () => {
    const { h, owner, foreign } = await pair(), command = commandFor(h, 'complete'), newer = exact ? command : { ...command, id: 'task_0002', version: 'version_2' }; let oldFailure = 0, next;
    const gate = { entered: deferred(), release: deferred() }; let off;
    try { h.backend.mode = 'false'; off = h.controller.subscribe(() => { if (next || h.controller.pending || h.controller.status !== 'error') return; off(); h.backend.writeGate = gate; next = h.controller.run(newer); });
        await h.view.perform(command, null, () => oldFailure++); await gate.entered.promise; assert(h.controller.retryCommand === newer); assert(h.controller.pending); assert.equal(oldFailure, 0);
        gate.release.resolve(); await next;
    } finally { off?.(); gate.release.resolve(); await next?.catch(() => {}); cleanup(h, owner, foreign); }
});

test('generic Retry rejects a newer distinct command even when its operation ID matches', async () => {
    const { h, owner, foreign } = await pair(); let effects = 0;
    try { const command = commandFor(h, 'complete'); h.backend.mode = 'false'; await h.view.perform(command, () => effects++);
        const newer = { ...command, id: 'task_0002', version: 'version_2' }; h.backend.mode = 'false'; await assert.rejects(h.controller.run(newer)); const counts = io(h), before = feedback(h);
        await h.view.retryLast(); assert.deepEqual(io(h), counts); sameFeedback(h, before); assert.equal(effects, 0);
    } finally { cleanup(h, owner, foreign); }
});

for (const mode of ['success', 'false', 'drop', 'ack']) for (const boundary of ['detach', 'close', 'destroy']) test(`already-issued generic ${mode} keeps original transaction after ${boundary}`, async () => {
    const { h, owner, foreign } = await pair(), gate = gateAt(h.backend); let effects = 0;
    try { const command = commandFor(h, 'complete'); h.backend.mode = mode; const pending = h.view.perform(command, () => effects++); await gate.entered.promise;
        if (boundary === 'detach') h.host.remove(); else if (boundary === 'close') h.controller.destroy(); else h.view.destroy(); gate.release.resolve(); await pending;
        assert.equal(h.controller.pending, null); const state = h.backend.originalRaw(); assert.equal(state.records.find(task => task.id === 'task_0000').state, ['success', 'ack'].includes(mode) ? 'done' : 'active');
        assert.equal(state.receipts.includes(command.operationId), ['success', 'ack'].includes(mode)); assert.equal(foreign.backend.writes, 0);
        if (boundary === 'destroy') assert.equal(effects, 0); if (boundary === 'detach' && mode === 'success') assert.equal(effects, 1);
    } finally { gate.release.resolve(); cleanup(h, owner, foreign); }
});

test('saved generic receipt cannot capture genuine null READ refresh', async () => {
    const { h, owner, foreign } = await pair(); let effects = 0;
    try { const command = commandFor(h, 'complete'); await h.view.perform(command, () => effects++); assert.equal(effects, 1);
        h.backend.nextReadFails = true; await assert.rejects(h.controller.refresh(), { code: 'READ' }); assert.equal(h.controller.retryCommand, null); const counts = io(h);
        await h.view.retryLast(); assert.deepEqual(delta(counts, io(h)), { requests: 0, reads: 1, writes: 0 }); assert.equal(effects, 1); assert.equal(h.controller.error, null);
    } finally { cleanup(h, owner, foreign); }
});

test('real completion Undo Retry retains its receipt after filtered rows and unrelated ordering', async () => {
    const { h, owner, foreign } = await pair();
    try { control(h, 'complete').dispatch('click'); await settle(); assert(h.view.undo); h.backend.mode = 'ack'; h.view.undoLast(); await settle(); const command = h.controller.retryCommand;
        assert.equal(command.kind, 'reopen'); h.view.filterInput.value = 'no matches'; h.view.applyFilter(); h.view.completed.box.open = false;
        const counts = io(h); await h.view.retryLast(); assert.equal(h.backend.writes, counts.writes); assert.equal(h.backend.requests, counts.requests);
        assert.equal(h.backend.originalRaw().records.find(task => task.id === 'task_0000').state, 'active'); assert.equal(h.view.undo, null); assert.equal(h.controller.error, null);
    } finally { cleanup(h, owner, foreign); }
});

for (const availability of ['suspended', 'invalidated', 'closed']) test(`generic original ${availability} availability keeps real failure and null READ behavior`, async () => {
    const { h, owner, foreign } = await pair(); let failures = 0;
    try { if (availability === 'suspended') h.backend.workspace._suspended = true; else if (availability === 'invalidated') h.backend.workspace.invalidated = true; else h.controller.destroy();
        const command = commandFor(h, 'complete'), counts = io(h); h.backend.nextReadFails = true; await h.view.perform(command, null, () => failures++);
        if (availability === 'closed') { assert.deepEqual(io(h), { ...counts, requests: counts.requests }); assert.equal(failures, 0); }
        else { assert.equal(h.controller.error.code, 'READ'); assert(h.controller.retryCommand === command); assert.equal(failures, 1);
            h.controller.dismissRetry(command.operationId); h.backend.nextReadFails = true; await assert.rejects(h.controller.refresh(), { code: 'READ' });
            const before = io(h); await h.view.retryLast(); assert.equal(h.backend.reads, before.reads + 1); assert.equal(h.controller.error, null); }
    } finally { cleanup(h, owner, foreign); }
});

for (const hook of ['rememberUndo', 'effect-clear', 'success']) test(`generic ${hook} hook rechecks identity before remaining View effects`, async () => {
    const { h, owner, foreign } = await pair(); const remember = h.view.rememberUndo, render = h.view.render; let renders = 0, success = 0, value, changed = false;
    try { const command = commandFor(h, 'complete');
        const changeSource = () => { changed = true; change(h, 'controller', foreign); h.view.render = function (...args) { renders++; return render.apply(this, args); }; };
        if (hook === 'rememberUndo') h.view.rememberUndo = function (...args) { remember.apply(this, args); changeSource(); };
        if (hook === 'effect-clear') Object.defineProperty(h.view, 'retryEffect', { configurable: true, get: () => value, set(next) { value = next; if (next === null) changeSource(); } });
        const failure = () => {}; await h.view.perform(command, () => { success++; if (hook === 'success') changeSource(); }, failure);
        assert(changed); assert.equal(success, hook === 'success' ? 1 : 0); assert.equal(renders, 0);
        if (hook !== 'success') assert(h.view.retryFailure === failure, 'the source-gap continuation cannot clear remaining Retry effects');
    } finally { h.view.rememberUndo = remember; h.view.render = render; if (hook === 'effect-clear') Object.defineProperty(h.view, 'retryEffect', { configurable: true, writable: true, value }); cleanup(h, owner, foreign); }
});

test('newer real generic action from rememberUndo hook retains its own exact effect', async () => {
    const { h, owner, foreign } = await pair(), remember = h.view.rememberUndo; let next, oldSuccess = 0, newerSuccess = 0;
    try { const command = commandFor(h, 'complete'), newer = commandFor(h, 'remove-done');
        h.view.rememberUndo = function (...args) { remember.apply(this, args); if (next) return; h.view.rememberUndo = remember; h.backend.mode = 'false'; next = this.perform(newer, () => newerSuccess++); };
        await h.view.perform(command, () => oldSuccess++); await next; assert.equal(oldSuccess, 0); assert(h.controller.retryCommand === newer);
        await h.view.retryLast(); assert.equal(newerSuccess, 1); assert.equal(oldSuccess, 0); outcome(h, 'remove-done', newer);
    } finally { h.view.rememberUndo = remember; cleanup(h, owner, foreign); }
});

for (const exact of [true, false]) test(`delayed generic success cannot replace newer real ${exact ? 'same-exact-command' : 'same-ID-command'} READ feedback`, async () => {
    const { h, owner, foreign } = await pair(), run = h.controller.run.bind(h.controller), ready = deferred(), release = deferred(); let effects = 0;
    try { const command = commandFor(h, 'complete'); h.controller.run = async value => { const saved = await run(value); ready.resolve(); await release.promise; return saved; };
        const pending = h.view.perform(command, () => effects++); await ready.promise; h.controller.run = run;
        const newer = exact ? command : { ...command, id: 'task_0002', version: 'version_2' }; h.backend.nextReadFails = true; await assert.rejects(h.controller.run(newer), { code: 'READ' });
        const before = ui(h), own = io(h), originalFeedback = feedback(h), raw = h.backend.originalRaw(); release.resolve(); await pending;
        assert.equal(effects, 0); sameUI(h, before); sameFeedback(h, originalFeedback); assert.deepEqual(io(h), own); assert.deepEqual(h.backend.originalRaw(), raw);
        if (exact) { await h.view.retryLast(); assert.equal(effects, 1); assert.equal(h.backend.writes, own.writes); assert.equal(h.controller.error, null); }
    } finally { release.resolve(); h.controller.run = run; cleanup(h, owner, foreign); }
});

for (const source of sources) test(`Next-up final success layout ${source} gap cannot take focus with foreign identical receipt`, async () => {
    const { h, owner, foreign } = await pair(), gate = gateAt(h.backend), action = control(h, 'completePinned'), rects = h.view.input.getClientRects.bind(h.view.input); let changed = 0;
    try { action.focus(); action.dispatch('click'); await gate.entered.promise; const command = h.controller.retryCommand, pending = h.controller.pending;
        await foreign.controller.run(command); const foreignFeedback = feedback(foreign), other = io(foreign);
        h.view.input.getClientRects = () => { const value = rects(); if (!changed && !h.controller.pending && h.controller.status === 'saved' && h.view.retryEffect === null) { changed++; change(h, source, foreign); } return value; };
        gate.release.resolve(); await pending; await settle(); assert.equal(changed, 1); assert(h.document.activeElement !== h.view.input, 'source-gap focus callback must not focus the quick-entry field');
        outcome(h, 'completePinned', command); sameFeedback(foreign, foreignFeedback); assert.deepEqual(io(foreign), other);
    } finally { gate.release.resolve(); h.view.input.getClientRects = rects; cleanup(h, owner, foreign); }
});

for (const mode of ['success', 'false', 'drop', 'ack']) test(`same-source Next-up ${mode} keeps a fresh successful focus lease`, async () => {
    const { h, owner, foreign } = await pair();
    try { const action = control(h, 'completePinned'); action.focus(); h.backend.mode = mode; action.dispatch('click'); await settle();
        if (mode !== 'success') { assert(h.controller.error); assert(!h.view.retry.hidden); h.view.retry.focus(); assert(h.document.activeElement === h.view.retry); await h.view.retryLast(); await settle(); }
        assert(h.document.activeElement === h.view.input, 'confirmed original completion restores quick-entry focus'); assert.equal(h.controller.error, null); assert.equal(h.view.pinnedFocus, null);
    } finally { cleanup(h, owner, foreign); }
});

test('already-issued successful generic effect keeps original closed-Controller behavior', async () => {
    const { h, owner, foreign } = await pair(), gate = gateAt(h.backend); let effects = 0;
    try { const command = commandFor(h, 'complete'), pending = h.view.perform(command, () => effects++); await gate.entered.promise; h.controller.destroy(); gate.release.resolve(); await pending;
        outcome(h, 'complete', command); assert.equal(effects, 1); assert(h.controller.retryCommand === command); assert.equal(h.controller.error, null); assert.equal(h.controller.pending, null);
    } finally { gate.release.resolve(); cleanup(h, owner, foreign); }
});

test('exact failed Undo Retry survives unrelated real order change and filtered rows', async () => {
    const { h, owner, foreign } = await pair();
    try { control(h, 'complete').dispatch('click'); await settle(); h.backend.mode = 'false'; h.view.undoLast(); await settle(); const undo = h.controller.retryCommand; assert.equal(undo.kind, 'reopen');
        const state = h.backend.originalRaw(), record = state.records.find(task => task.id === 'task_0003'); await h.remote.mutate(h.remote.request('moveFirst', { id: record.id, version: record.version, order: state.records.filter(task => task.state === 'active').map(task => task.id) }));
        await h.controller.refresh(); h.view.filterInput.value = 'no matches'; h.view.applyFilter(); const counts = io(h); await h.view.retryLast();
        assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + 1); assert.equal(h.backend.originalRaw().receipts.at(-1), undo.operationId);
        assert.deepEqual(h.backend.originalRaw().records.filter(task => task.state === 'active' && task.id !== 'task_0000').map(task => task.id), ['task_0003', 'task_0001', 'task_0002', 'task_0004']); assert.equal(h.backend.originalRaw().records.find(task => task.id === 'task_0000').state, 'active'); assert.equal(h.view.undo, null);
    } finally { cleanup(h, owner, foreign); }
});
