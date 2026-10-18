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
const clone = value => structuredClone(value);
const NOW = '2026-10-18T08:00:00.000Z';
const DRAFT = '  Synthetic original 中文 😀\nexact draft  ';
const NEW_DRAFT = '  Independent newer draft 中文\nkeep this  ';
function initial() {
    return tasks.validate({ schemaVersion: 1, revision: 4, enabled: true, pinnedId: 'task_0001', receipts: ['receipt_prior'],
        records: ['active', 'active', 'done', 'removed'].map((state, i) => ({ id: `task_000${i}`, version: `version_${i}`,
            text: `Synthetic ${i} 中文 😀`, state, removedFrom: state === 'removed' ? 'done' : null, createdAt: NOW, updatedAt: NOW })),
        recovery: [{ id: 'recovery_prior', createdAt: NOW, content: { records: [], pinnedId: null } }] });
}
// Synthetic storage and DOM, real production Store/Controller/View. Reentry is
// caused only by the public onVisibility callback and real commands/events.
// No Controller state, pending, error, status, or Retry value is manufactured.
function model(options = {}) {
    let bytes = JSON.stringify(options.state || initial()), queue = Promise.resolve(), serial = 0;
    const listeners = new Set(), commands = [];
    const backend = {
        workspace: { id: 'workspace_original', generation: 'generation_original' },
        reads: 0, writes: 0, commits: 0, requests: 0, nextWrite: null, readError: false, notifications: false,
        lock(action) { const next = queue.then(action); queue = next.catch(() => {}); return next; },
        async read() { backend.reads++; if (backend.readError) { backend.readError = false; throw Error('Synthetic read failure'); } return JSON.parse(bytes); },
        async write(value) {
            backend.writes++; const attempt = backend.nextWrite; backend.nextWrite = null;
            if (attempt) { attempt.entered.resolve(); await attempt.release.promise; }
            if (attempt?.outcome === 'false') return false;
            bytes = JSON.stringify(value); backend.commits++;
            if (backend.notifications) for (const listener of [...listeners]) listener();
            if (attempt?.outcome === 'ack') throw Error('Synthetic lost acknowledgement');
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        notify() { for (const listener of [...listeners]) listener(); },
        bytes: () => bytes, raw: () => JSON.parse(bytes)
    };
    const store = new tasks.Store(backend, { id: () => `operation_${++serial}`, now: () => NOW }), request = store.request;
    store.request = function (...args) { backend.requests++; const command = request.apply(this, args); commands.push(command); return command; };
    const controller = new Controller(store), document = createDocument({ blurUnavailableFocus: true, aggregateTextContent: true });
    const host = document.createElement('article'), search = document.createElement('input'); document.body.append(search, host); search.focus();
    const api = { ...tasks, Controller }, window = { LocalItabTasks: api, LocalItabWorkspaces: { session: backend.workspace },
        getComputedStyle(node) { return { display: node.style.display || 'block', visibility: node.style.visibility || 'visible' }; } };
    const context = vm.createContext({ window, document, crypto: webcrypto, setTimeout, URL, Blob, console });
    for (const name of ['dialog-focus.js', 'local-tasks-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared', name), 'utf8'), context);
    const visibility = [], h = { backend, store, controller, document, host, search, window, commands, visibility };
    h.view = api.mount(host, { controller, alwaysVisible: options.alwaysVisible ?? true,
        onVisibility(value) { visibility.push(value); options.onVisibility?.(h, value); } });
    return h;
}
function writeGate(h, outcome = 'success') {
    const gate = { outcome, entered: deferred(), release: deferred() }; h.backend.nextWrite = gate; return gate;
}
function rowAction(h, label, id = 'task_0000') {
    const row = h.host.querySelectorAll('[data-task-id]').find(node => node.dataset.taskId === id);
    assert(row, `original row ${id}`); row.querySelector('.tasks-row-menu').open = true;
    const action = row.querySelectorAll('button').find(node => node.textContent === label);
    assert(action, `original ${label} button`); return action;
}
function start(h, kind) {
    if (kind === 'add') h.view.add(); else rowAction(h, kind === 'remove' ? 'Remove' : 'Pin next').dispatch('click');
    assert(h.controller.pending, `${kind} must dispatch a real Controller operation`);
    return h.controller.pending.catch(error => error);
}
function controls(h) {
    const v = h.view;
    return { add: !!v.addButton.disabled, batch: !!v.batchButton.disabled, undo: !!v.undoButton.disabled, retry: !!v.retry.disabled,
        rows: h.host.querySelectorAll('button[data-task-action]').map(node => node.getAttribute('aria-disabled')),
        next: v.nextComplete?.getAttribute('aria-disabled') ?? null, copy: v.copyVisibleButton.getAttribute('aria-disabled'),
        status: v.status.textContent, error: v.feedback.classList.contains('is-error'), retryHidden: v.retry.hidden,
        revision: v.renderedRevision, filter: v.renderedFilter, draft: v.input.value,
        visible: JSON.stringify([v.visibleTasks, v.visibleCompletedTasks, v.visibleRemovedTasks]) };
}
function assertPending(h, value) {
    assert.equal(value.add, true); assert.equal(value.batch, true); assert.equal(value.undo, true); assert.equal(value.retry, true);
    assert(value.rows.length > 0); assert(value.rows.every(value => value === 'true'));
    assert.equal(value.next, 'true'); assert.equal(value.copy, 'true');
    assert.equal(value.status, 'Saving on this device…'); assert.equal(value.error, false); assert.equal(value.retryHidden, true);
    assert.equal(h.controller.status, 'saving');
}
function assertResult(h, before, kind, command) {
    const raw = h.backend.raw();
    assert.equal(raw.revision, before.revision + 1); assert.equal(h.controller.state.revision, raw.revision);
    assert.equal(h.view.renderedRevision, raw.revision); assert.equal(raw.receipts.filter(id => id === command.operationId).length, 1);
    assert.deepEqual(raw.receipts, [...before.receipts, command.operationId]); assert.deepEqual(raw.recovery, before.recovery);
    if (kind === 'add') {
        assert.deepEqual(raw.records.slice(0, -1), before.records); assert.equal(raw.records.at(-1).text, DRAFT);
        assert.equal(raw.records.at(-1).id, command.operationId); assert.equal(raw.pinnedId, before.pinnedId); assert.equal(h.view.undo, null);
    } else if (kind === 'remove') {
        assert.equal(raw.records[0].state, 'removed'); assert.equal(raw.records[0].text, before.records[0].text);
        assert.deepEqual(raw.records.slice(1), before.records.slice(1)); assert.equal(raw.pinnedId, before.pinnedId);
        assert.equal(h.view.undo.id, 'task_0000'); assert.equal(h.view.undoButton.hidden, false);
    } else {
        assert.deepEqual(raw.records, before.records); assert.equal(raw.pinnedId, 'task_0000'); assert.equal(h.view.undo, null);
    }
    assert.equal(h.backend.commits, 1); assert.equal(h.backend.requests, 1); assert.equal(h.controller.pending, null);
    assert.equal(h.controller.retryCommand, null); assert.equal(h.controller.error, null); assert.equal(h.view.feedback.classList.contains('is-error'), false);
}

for (const kind of ['add', 'remove', 'pin']) for (const outcome of ['success', 'false', 'ack']) {
    test(`same-source visibility ${kind}/${outcome} keeps latest pending controls and exact settlement`, async t => {
        const h = model(); await settle(); const gate = writeGate(h, outcome);
        try {
            const beforeBytes = h.backend.bytes(), before = h.backend.raw(); h.view.input.value = DRAFT; h.view.input.dispatch('input'); h.view.input.focus();
            const origin = h.document.activeElement, visible = h.view.visibleTasks; let calls = 0, observed, inner;
            h.view.onVisibility = () => {
                calls++; if (calls !== 1) return;
                observed = start(h, kind); inner = controls(h);
            };
            h.view.render(); const outer = controls(h);
            assert.equal(calls, 2, 'both original and nested visibility callbacks are delivered');
            assert.strictEqual(h.document.activeElement, origin); assert.strictEqual(h.view.visibleTasks, visible);
            assertPending(h, inner); await gate.entered.promise;
            assert.equal(h.backend.bytes(), beforeBytes, 'no early write before backend release'); assert.equal(h.backend.writes, 1); assert.equal(h.backend.requests, 1);
            const command = h.commands[0]; assert.strictEqual(h.controller.retryCommand, command); assert.equal(command.kind, kind);
            gate.release.resolve(); const result = await observed; await settle();
            if (outcome === 'success') assert.equal(result.revision, 5);
            else {
                assert.equal(result.code, 'WRITE'); assert.strictEqual(h.controller.error, result); assert.strictEqual(h.controller.retryCommand, command);
                assert.equal(h.view.status.textContent, 'Could not confirm the save. Your draft is still here. Retry safely.');
                assert.equal(h.view.feedback.classList.contains('is-error'), true); assert.equal(h.view.retry.hidden, false); assert.equal(h.view.retry.disabled, false);
                assert.equal(h.view.input.value, DRAFT);
                if (outcome === 'false') assert.equal(h.backend.bytes(), beforeBytes); else assert.equal(h.backend.raw().receipts.at(-1), command.operationId);
                await h.view.retryLast(); await settle(); assert.equal(h.backend.requests, 1, 'Retry reuses the original command');
            }
            assertResult(h, before, kind, command); assert.equal(h.backend.writes, outcome === 'false' ? 2 : 1);
            assert.equal(h.view.input.value, kind === 'add' ? '' : DRAFT); assert.strictEqual(h.document.activeElement, origin);
            t.diagnostic(JSON.stringify({ kind, outcome, innerPending: [inner.add, inner.batch, inner.undo, inner.retry, inner.next],
                outerPending: [outer.add, outer.batch, outer.undo, outer.retry, outer.next], writes: h.backend.writes, commits: h.backend.commits, requests: h.backend.requests }));
            assert.deepEqual(outer, inner, 'superseded outer render must not overwrite the latest nested publication');
        } finally { gate.release.resolve(); h.view.destroy(); }
    });
}

test('nested filter render and a newer draft remain latest while original Add settles', async () => {
    const h = model(); await settle(); const gate = writeGate(h);
    try {
        h.view.input.value = DRAFT; h.view.input.dispatch('input'); const original = h.backend.bytes(); let calls = 0, observed, inner;
        h.view.onVisibility = () => {
            calls++;
            if (calls === 1) { observed = start(h, 'add'); inner = controls(h); }
            if (calls === 2) { h.view.filterInput.value = 'synthetic 1'; h.view.filterInput.focus(); h.view.filterInput.dispatch('input'); }
        };
        h.view.render(); const outer = controls(h); assert.equal(calls, 3); assert.equal(h.view.renderedFilter, 'synthetic 1');
        assert.equal(h.view.visibleTasks.length, 1); assert.equal(h.view.visibleTasks[0].id, 'task_0001');
        assert.strictEqual(h.document.activeElement, h.view.filterInput); assert.equal(h.backend.bytes(), original);
        await gate.entered.promise; h.view.input.value = NEW_DRAFT; h.view.input.dispatch('input');
        gate.release.resolve(); await observed; await settle();
        assert.equal(h.view.input.value, NEW_DRAFT); assert.strictEqual(h.document.activeElement, h.view.filterInput);
        assert.equal(h.view.status.textContent, 'Last task saved. Your current draft is not saved yet.');
        assert.equal(h.backend.requests, 1); assert.equal(h.backend.writes, 1); assert.equal(h.backend.commits, 1);
        assert.deepEqual(outer, inner, 'newest nested filter publication retains pending controls');
    } finally { gate.release.resolve(); h.view.destroy(); }
});

test('initial ready visibility callback may start its genuine Add before the old ready render returns', async () => {
    const entered = deferred(); let gate, observed, inner, calls = 0;
    const h = model({ onVisibility(h) {
        if (!h.view || !h.controller.state || calls++) return;
        gate = writeGate(h); h.view.input.value = DRAFT; observed = start(h, 'add'); inner = controls(h); entered.resolve();
    } });
    try {
        await entered.promise; const outer = controls(h); await gate.entered.promise;
        assertPending(h, inner); assert.equal(h.backend.raw().revision, 4); assert.equal(h.backend.commits, 0);
        gate.release.resolve(); await observed; await settle(); assert.equal(h.backend.raw().revision, 5); assert.equal(h.backend.writes, 1);
        assert.deepEqual(outer, inner, 'old initial ready render cannot enable the latest saving UI');
    } finally { gate?.release.resolve(); h.view.destroy(); }
});

for (const mode of ['detached', 'hidden']) test(`original ${mode} host still publishes a real nested Controller result`, async () => {
    const h = model(); await settle(); const gate = writeGate(h);
    try {
        if (mode === 'detached') h.host.remove(); else { h.document.hidden = true; h.document.visibilityState = 'hidden'; }
        const before = h.backend.raw(); let calls = 0, observed, inner;
        h.view.onVisibility = () => {
            calls++; if (calls !== 1) return;
            observed = h.controller.action('pin', { id: 'task_0000', version: 'version_0', expectedPin: 'task_0001' }).catch(error => error);
            inner = controls(h);
        };
        h.view.render(); const outer = controls(h); assert.equal(calls, 2); assertPending(h, inner);
        await gate.entered.promise; gate.release.resolve(); await observed; await settle();
        assertResult(h, before, 'pin', h.commands[0]); assert.equal(h.backend.writes, 1);
        assert.deepEqual(outer, inner, 'availability must not replace same-source latest-render ownership');
    } finally { gate.release.resolve(); h.view.destroy(); }
});

test('ordinary visibility/filter callbacks still render and a genuine READ error can retry', async () => {
    const h = model(); await settle();
    try {
        const before = h.backend.bytes(); let calls = 0;
        h.view.onVisibility = () => { if (++calls === 1) { h.view.filterInput.value = 'synthetic 0'; h.view.filterInput.dispatch('input'); } };
        h.view.render(); assert.equal(calls, 2); assert.equal(h.view.renderedFilter, 'synthetic 0'); assert.equal(h.view.visibleTasks[0].id, 'task_0000');
        assert.equal(h.view.addButton.disabled, false); assert.equal(h.backend.bytes(), before); assert.equal(h.backend.requests, 0); assert.equal(h.backend.writes, 0);
        h.backend.readError = true; await assert.rejects(h.controller.refresh(), { code: 'READ' });
        assert.equal(h.view.status.textContent, 'Could not read local tasks. Nothing was replaced. Retry when storage is available.');
        assert.equal(h.view.retry.hidden, false); await h.view.retryLast(); await settle(); assert.equal(h.controller.error, null);
        assert.equal(h.view.feedback.classList.contains('is-error'), false); assert.equal(h.backend.bytes(), before); assert.equal(h.backend.writes, 0);
    } finally { h.view.destroy(); }
});

test('bounded direct nested renders still deliver every callback without an operation', async () => {
    const h = model(); await settle();
    try {
        const before = h.backend.bytes(), reads = h.backend.reads; h.view.input.value = DRAFT; h.view.input.focus();
        let calls = 0, latest;
        h.view.onVisibility = () => { if (++calls < 3) h.view.render(); else latest = h.view.visibleTasks; };
        h.view.render(); assert.equal(calls, 3); assert.strictEqual(h.view.visibleTasks, latest);
        assert.equal(h.view.addButton.disabled, false); assert.equal(h.view.batchButton.disabled, false);
        assert.equal(h.view.input.value, DRAFT); assert.strictEqual(h.document.activeElement, h.view.input);
        assert.equal(h.backend.bytes(), before); assert.equal(h.backend.reads, reads); assert.equal(h.backend.writes, 0); assert.equal(h.backend.requests, 0);
    } finally { h.view.destroy(); }
});

test('rejected foreign nested render does not supersede an original READ error publication', async () => {
    const h = model(), foreign = model(); await settle();
    try {
        let calls = 0; const before = h.backend.bytes(), other = foreign.backend.bytes();
        h.view.onVisibility = () => { calls++; h.view.controller = foreign.controller; h.view.render(); h.view.controller = h.controller; };
        h.backend.readError = true; await assert.rejects(h.controller.refresh(), { code: 'READ' });
        assert.equal(calls, 1); assert.equal(h.view.feedback.classList.contains('is-error'), true); assert.equal(h.view.retry.hidden, false);
        assert.equal(h.view.status.textContent, 'Could not read local tasks. Nothing was replaced. Retry when storage is available.');
        assert.equal(h.backend.bytes(), before); assert.equal(foreign.backend.bytes(), other); assert.equal(h.backend.writes, 0); assert.equal(foreign.backend.writes, 0);
    } finally { h.view.controller = h.controller; h.view.destroy(); foreign.view.destroy(); }
});

test('nested source substitution and destruction cannot publish or revive the outer render', async () => {
    const h = model(), foreign = model(); await settle();
    try {
        const before = controls(h), foreignBytes = foreign.backend.bytes(); let calls = 0;
        h.view.onVisibility = () => { if (++calls === 1) { h.view.controller = foreign.controller; h.view.render(); } };
        h.view.render(); assert.equal(calls, 1); assert.deepEqual(controls(h), before); assert.equal(foreign.backend.bytes(), foreignBytes); assert.equal(foreign.backend.writes, 0);
        h.view.controller = h.controller; h.view.onVisibility = () => { h.view.destroy(); }; h.view.render();
        assert.deepEqual(controls(h), before); assert.equal(h.controller.closed, true); assert.equal(foreign.controller.closed, false);
        h.view.destroyed = false; h.view.render(); assert.deepEqual(controls(h), before);
    } finally { h.view.controller = h.controller; h.view.destroy(); foreign.view.destroy(); }
});
