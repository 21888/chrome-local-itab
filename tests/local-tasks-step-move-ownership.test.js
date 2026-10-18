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
const order = state => state.records.filter(record => record.state === 'active').map(record => record.id);
function initial() {
    const states = ['done', 'active', 'removed', 'active', 'active', 'done', 'active', 'removed', 'active', 'active'];
    return tasks.validate({ schemaVersion: 1, revision: 4, enabled: true, pinnedId: 'task_0004', receipts: ['previous_1'],
        records: states.map((state, index) => ({ id: `task_000${index}`, version: `version_${index}`,
            text: [1, 4, 9].includes(index) ? '  duplicate 中文 😀\ntext  ' : `Synthetic task ${index}`,
            state, removedFrom: state === 'removed' ? 'active' : null,
            createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' })),
        recovery: [{ id: 'recovery_1', createdAt: '2026-10-03T00:00:00.000Z', content: { records: [], pinnedId: null } }] });
}
// Independent synthetic storage/DOM fixture, using the real Store/Controller/View.
// Each workspace object/ID/generation routes to its own identical starting data.
// These are modeled ownership probes, not native Chrome or event-timing evidence.
function model({ legacy = false, legacyAvailability = false, locale = 'en', sessionMode = 'matching', identityMode = 'full' } = {}) {
    const sources = new Map(), identities = new WeakMap(), listeners = new Set();
    let identity = 0, queue = Promise.resolve(), operation = 0;
    const backend = {
        workspace: legacy ? undefined : legacyAvailability ? { invalidated: false, _suspended: false } : { ...(identityMode !== 'generation-only' ? { id: 'workspace_0001' } : {}), ...(identityMode !== 'id-only' ? { generation: 'generation_0001' } : {}) },
        reads: 0, writes: 0, requests: 0, mode: null, delay: null, notifications: true, nextReadFails: false,
        lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() {
            backend.reads++;
            if (backend.nextReadFails) { backend.nextReadFails = false; throw Error('synthetic read failure'); }
            return clone(source().raw);
        },
        async write(value) {
            backend.writes++;
            if (backend.delay) await backend.delay;
            if (backend.mode === 'false') return false;
            if (backend.mode === 'drop') return;
            source().raw = clone(value);
            if (backend.notifications) listeners.forEach(fn => fn());
            if (backend.mode === 'ack') throw Error('synthetic acknowledgement failure');
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        raw: () => clone(source().raw)
    };
    function source() {
        const workspace = backend.workspace;
        if (workspace && !identities.has(workspace)) identities.set(workspace, ++identity);
        const key = workspace ? `${identities.get(workspace)}:${workspace.id}:${workspace.generation}` : 'legacy';
        if (!sources.has(key)) sources.set(key, { raw: initial() });
        return sources.get(key);
    }
    const store = new tasks.Store(backend, { id: () => `operation_${++operation}`, now: () => '2026-10-17T23:00:00.000Z' });
    const request = store.request.bind(store);
    store.request = (...args) => { backend.requests++; return request(...args); };
    const remote = new tasks.Store(backend), controller = new Controller(store);
    const document = createDocument({ blurUnavailableFocus: true }), host = document.createElement('article'), search = document.createElement('input');
    document.body.append(search, host); search.focus();
    const api = { ...tasks, Controller }, window = { LocalItabTasks: api, LocalItabContentLifecycle: { departing: false },
        LocalItabWorkspaces: { session: sessionMode === 'missing' ? undefined : sessionMode === 'wrong' ? {} : backend.workspace },
        getComputedStyle(node) { return { display: node.style.display || 'block', visibility: node.style.visibility || 'visible' }; } };
    if (legacyAvailability || sessionMode === 'absent') delete window.LocalItabWorkspaces;
    if (locale !== 'fallback') {
        const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../_locales', locale, 'messages.json'), 'utf8'));
        window.i18n = { t: key => catalog[key]?.message || key };
    }
    const context = vm.createContext({ window, document, crypto: webcrypto, URL, Blob, setTimeout, console });
    for (const name of ['dialog-focus.js', 'local-tasks-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared', name), 'utf8'), context);
    const view = api.mount(host, { controller });
    return { backend, store, remote, controller, document, host, search, window, view };
}
const row = (h, id = 'task_0003') => h.host.querySelectorAll('[data-task-id]').find(node => node.dataset.taskId === id);
const button = (node, label) => node?.querySelectorAll('button').find(node => node.textContent === label);
function moveButton(h, direction, id = 'task_0003', label = direction === -1 ? 'Move up' : 'Move down') {
    const item = row(h, id); assert(item, `rendered row ${id}`);
    item.querySelector('.tasks-row-menu').open = true;
    const action = button(item, label); assert(action, `step-move button ${id}`); return action;
}
const input = (node, value) => { node.value = value; node.dispatch('input'); };
const command = (store, kind, record, values = {}) => store.request(kind, { id: record.id, version: record.version, ...values });
function redraw(h) { h.view.renderedRevision = -1; h.view.render(); }
async function rejectsWithoutIO(h, action) {
    const before = h.backend.raw(), reads = h.backend.reads, writes = h.backend.writes, requests = h.backend.requests;
    action.dispatch('click'); await settle();
    const counts = JSON.stringify({ reads: [reads, h.backend.reads], writes: [writes, h.backend.writes], requests: [requests, h.backend.requests] });
    assert.equal(h.backend.writes, writes, `stale source must not write ${counts}`);
    assert.equal(h.backend.reads, reads, `stale source must not read ${counts}`);
    assert.equal(h.backend.requests, requests, `stale source must not create a replacement request ${counts}`);
    assert.deepEqual(h.backend.raw(), before);
}

const sourceChanges = {
    object(h) { h.backend.workspace = { ...h.backend.workspace }; h.window.LocalItabWorkspaces.session = h.backend.workspace; },
    id(h) { h.backend.workspace.id = 'workspace_0002'; },
    generation(h) { h.backend.workspace.generation = 'generation_0002'; },
    session(h) { h.window.LocalItabWorkspaces.session = { ...h.backend.workspace }; }
};
function movedOrder(state, id, direction) {
    const expected = order(state), index = expected.indexOf(id);
    [expected[index], expected[index + direction]] = [expected[index + direction], expected[index]];
    return expected;
}

// These first 30 probes form the retained, pre-production RED snapshot.
for (const direction of [-1, 1]) {
    const name = direction === -1 ? 'up' : 'down';
    test(`RED: ${name} current original row performs one step-move write`, async () => {
        const h = model(); await settle();
        try {
            const before = h.backend.raw(); moveButton(h, direction).dispatch('click'); await settle();
            assert.equal(h.backend.writes, 1); assert.deepEqual(order(h.backend.raw()), movedOrder(before, 'task_0003', direction));
        } finally { h.view.destroy(); }
    });
    test(`RED: ${name} construction source cannot change before the first asynchronous row render`, async () => {
        const h = model(), workspace = h.backend.workspace, session = h.window.LocalItabWorkspaces.session;
        try {
            sourceChanges.object(h); await settle(); const counts = { reads: h.backend.reads, writes: h.backend.writes, requests: h.backend.requests }, before = h.backend.raw();
            // A changed construction source is rejected before rows gain authority.
            assert.equal(h.host.querySelectorAll('[data-task-id]').length, 0); assert.equal(h.view.renderedRevision, undefined);
            assert.equal(counts.requests, 0); assert.equal(counts.writes, 0);
            h.view.render(); await settle(); assert.deepEqual({ reads: h.backend.reads, writes: h.backend.writes, requests: h.backend.requests }, counts); assert.deepEqual(h.backend.raw(), before);
            h.backend.workspace = workspace; h.window.LocalItabWorkspaces.session = session; await h.controller.refresh(); await settle();
            const original = h.backend.raw(); moveButton(h, direction).dispatch('click'); await settle(); const after = h.backend.raw();
            assert.equal(h.backend.writes, counts.writes + 1); assert.equal(h.backend.requests, counts.requests + 1); assert.equal(h.controller.status, 'saved');
            assert.deepEqual(order(after), movedOrder(original, 'task_0003', direction));
            assert.deepEqual(after.records.slice().sort((a, b) => a.id.localeCompare(b.id)), original.records.slice().sort((a, b) => a.id.localeCompare(b.id)));
            assert.equal(after.pinnedId, original.pinnedId); assert.deepEqual(after.recovery, original.recovery); assert.equal(h.view.undo, null);
        } finally { h.backend.workspace = workspace; h.window.LocalItabWorkspaces.session = session; h.view.destroy(); }
    });
    test(`RED: ${name} redrawn row cannot adopt an identical replacement workspace`, async () => {
        const h = model(); await settle();
        try {
            const before = h.backend.raw(); sourceChanges.object(h); assert.deepEqual(h.backend.raw(), before);
            redraw(h); await rejectsWithoutIO(h, moveButton(h, direction));
        } finally { h.view.destroy(); }
    });
    for (const change of ['backend', 'store']) for (const fresh of [false, true]) test(`RED: ${name} ${change} replacement with independent data and original workspace identity rejects ${fresh ? 'redrawn' : 'original'} row`, async () => {
        const h = model(), foreign = model(); await settle();
        try {
            foreign.backend.workspace = h.backend.workspace; foreign.window.LocalItabWorkspaces.session = h.backend.workspace;
            assert.deepEqual(foreign.backend.raw(), h.backend.raw());
            let action = moveButton(h, direction);
            if (change === 'store') h.controller.store = foreign.store; else h.store.backend = foreign.backend;
            if (fresh) { redraw(h); action = moveButton(h, direction); }
            const before = foreign.backend.raw(), reads = foreign.backend.reads, writes = foreign.backend.writes;
            const ownReads = h.backend.reads, ownWrites = h.backend.writes;
            action.dispatch('click'); await settle();
            const counts = JSON.stringify({ foreignReads: [reads, foreign.backend.reads], foreignWrites: [writes, foreign.backend.writes], ownReads: [ownReads, h.backend.reads], ownWrites: [ownWrites, h.backend.writes] });
            assert.equal(foreign.backend.writes, writes, `replacement destination must not write ${counts}`);
            assert.equal(foreign.backend.reads, reads, `replacement destination must not read ${counts}`);
            assert.deepEqual(foreign.backend.raw(), before); assert.equal(h.backend.reads, ownReads); assert.equal(h.backend.writes, ownWrites);
        } finally { h.controller.store = h.store; h.store.backend = h.backend; h.view.destroy(); foreign.view.destroy(); }
    });
    for (const [mode, change] of [['false', 'workspace'], ['drop', 'workspace'], ['ack', 'workspace'], ['ack', 'store'], ['ack', 'backend']]) test(`RED: ${name} original ${mode} Retry rejects ${change} replacement and resumes at original source`, async () => {
        const h = model(), foreign = model(); await settle(); h.backend.notifications = false;
        try {
            h.backend.mode = mode; moveButton(h, direction).dispatch('click'); await settle();
            const request = h.controller.retryCommand; assert.equal(request.kind, 'move'); assert.equal(request.direction, direction);
            assert.equal(h.controller.error.code, mode === 'drop' ? 'VERIFY' : 'WRITE');
            const workspace = h.backend.workspace; h.backend.mode = null;
            foreign.backend.workspace = workspace; foreign.window.LocalItabWorkspaces.session = workspace;
            let destination = h.backend;
            if (change === 'workspace') sourceChanges.object(h);
            else if (change === 'store') { h.controller.store = foreign.store; destination = foreign.backend; }
            else { h.store.backend = foreign.backend; destination = foreign.backend; }
            const before = destination.raw(), reads = destination.reads, writes = destination.writes;
            h.view.retry.dispatch('click'); await settle();
            const counts = JSON.stringify({ reads: [reads, destination.reads], writes: [writes, destination.writes] });
            assert.equal(destination.writes, writes, `original Retry must not write to a changed source ${counts}`);
            assert.equal(destination.reads, reads, `original Retry must not read from a changed source ${counts}`);
            assert.deepEqual(destination.raw(), before); assert.strictEqual(h.controller.retryCommand, request);
            h.controller.store = h.store; h.store.backend = h.backend; h.backend.workspace = workspace; h.window.LocalItabWorkspaces.session = workspace;
            const originalWrites = h.backend.writes;
            h.view.retry.dispatch('click'); await settle();
            assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, originalWrites + (mode === 'ack' ? 0 : 1));
            assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
        } finally { h.controller.store = h.store; h.store.backend = h.backend; h.view.destroy(); foreign.view.destroy(); }
    });
    test(`RED: ${name} old complete row cannot regain ownership by reattachment after redraw`, async () => {
        const h = model(); await settle();
        try {
            const action = moveButton(h, direction), old = row(h); redraw(h); row(h).replaceWith(old);
            assert.equal(old.isConnected, true); old.querySelector('.tasks-row-menu').open = true;
            await rejectsWithoutIO(h, action);
        } finally { h.view.destroy(); }
    });
    for (const change of ['hidden', 'raw-filter']) test(`RED: ${name} preexisting ${change} state blocks request creation`, async () => {
        const h = model(); await settle();
        try {
            const action = moveButton(h, direction);
            if (change === 'hidden') h.document.hidden = true;
            else h.view.filterInput.value = 'unapplied synthetic filter';
            await rejectsWithoutIO(h, action);
        } finally { h.view.destroy(); }
    });
}

for (const direction of [-1, 1]) {
    const stepTest = (name, fn) => test(`${direction === -1 ? 'up' : 'down'}: ${name}`, fn);
    const stepButton = (h, id = 'task_0003', text) => moveButton(h, direction, id, text);
    const label = locale => locale === 'zh_CN' ? (direction === -1 ? '上移' : '下移') : (direction === -1 ? 'Move up' : 'Move down');
// Expanded ownership, eligibility, compatibility and original-Retry coverage.
for (const change of ['expand', 'collapse', 'filter', 'rerender', 'dispose']) stepTest(`old step-move row remains rejected after ${change} and complete-row reattachment`, async () => {
    const h = model(); await settle();
    try {
        if (change === 'collapse') h.view.more.dispatch('click');
        const action = stepButton(h), old = row(h), list = h.view.list;
        if (change === 'expand' || change === 'collapse') h.view.more.dispatch('click');
        else if (change === 'filter') { input(h.view.filterInput, 'duplicate'); h.view.filterClear.dispatch('click'); }
        else if (change === 'rerender') redraw(h);
        else h.view.destroy();
        await rejectsWithoutIO(h, action);
        if (change === 'dispose') list.append(old); else row(h).replaceWith(old);
        assert.equal(old.isConnected, true); old.querySelector('.tasks-row-menu').open = true;
        await rejectsWithoutIO(h, action);
    } finally { h.view.destroy(); }
});


for (const [name, change] of Object.entries(sourceChanges)) for (const freshRow of [false, true]) {
    stepTest(`original view rejects changed workspace ${name} with identical records (${freshRow ? 'redrawn' : 'original'} row)`, async () => {
        const h = model(); await settle();
        try {
            let action = stepButton(h); const before = h.backend.raw(); change(h);
            assert.deepEqual(h.backend.raw(), before, 'distinct source contains identical synthetic records');
            if (freshRow) { redraw(h); action = stepButton(h); }
            await rejectsWithoutIO(h, action);
        } finally { h.view.destroy(); }
    });
}

stepTest('view construction owns its workspace before the first async load renders rows', async () => {
    const h = model(), workspace = h.backend.workspace, session = h.window.LocalItabWorkspaces.session;
    try {
        sourceChanges.object(h); await settle(); const counts = { reads: h.backend.reads, writes: h.backend.writes, requests: h.backend.requests }, before = h.backend.raw();
        // A changed construction source is rejected before rows gain authority.
        assert.equal(h.host.querySelectorAll('[data-task-id]').length, 0); assert.equal(h.view.renderedRevision, undefined);
        assert.equal(counts.requests, 0); assert.equal(counts.writes, 0);
        h.view.render(); await settle(); assert.deepEqual({ reads: h.backend.reads, writes: h.backend.writes, requests: h.backend.requests }, counts); assert.deepEqual(h.backend.raw(), before);
        h.backend.workspace = workspace; h.window.LocalItabWorkspaces.session = session; await h.controller.refresh(); await settle();
        const original = h.backend.raw(); stepButton(h).dispatch('click'); await settle(); const after = h.backend.raw();
        assert.equal(h.backend.writes, counts.writes + 1); assert.equal(h.backend.requests, counts.requests + 1); assert.equal(h.controller.status, 'saved');
        assert.deepEqual(order(after), movedOrder(original, 'task_0003', direction));
        assert.deepEqual(after.records.slice().sort((a, b) => a.id.localeCompare(b.id)), original.records.slice().sort((a, b) => a.id.localeCompare(b.id)));
        assert.equal(after.pinnedId, original.pinnedId); assert.deepEqual(after.recovery, original.recovery); assert.equal(h.view.undo, null);
    } finally { h.backend.workspace = workspace; h.window.LocalItabWorkspaces.session = session; h.view.destroy(); }
});

for (const mode of ['false', 'drop', 'ack']) stepTest(`unresolved ${mode} write keeps the exact retry when a fresh step-move is clicked`, async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        h.backend.mode = mode; stepButton(h, 'task_0004').dispatch('click'); await settle();
        assert.equal(h.controller.status, 'error');
        assert.equal(h.controller.error.code, mode === 'drop' ? 'VERIFY' : 'WRITE');
        const request = h.controller.retryCommand; assert.equal(request.kind, 'move'); assert.equal(h.view.retry.hidden, false);
        h.backend.mode = null; const before = h.backend.raw();
        await rejectsWithoutIO(h, stepButton(h));
        assert.strictEqual(h.controller.retryCommand, request, 'fresh movement must not replace the unresolved operation');
        h.view.retry.dispatch('click'); await settle();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.controller.retryCommand, null);
        assert.deepEqual(order(h.backend.raw()), movedOrder(initial(), 'task_0004', direction));
        assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
        assert.equal(h.backend.writes, mode === 'ack' ? 1 : 2);
        if (mode === 'ack') assert.deepEqual(h.backend.raw(), before);
    } finally { h.view.destroy(); }
});

for (const legacy of [false, true]) stepTest(`current original ${legacy ? 'legacy' : 'workspace'} row retains one-write move, pin, draft and focus`, async () => {
    const h = model({ legacy }); await settle();
    try {
        const before = h.backend.raw(); input(h.view.input, 'unsaved 中文 draft'); h.view.input.focus();
        stepButton(h, 'task_0004').dispatch('click'); await settle(); const after = h.backend.raw();
        assert.equal(h.backend.writes, 1); assert.equal(after.revision, before.revision + 1);
        assert.deepEqual(order(after), movedOrder(initial(), 'task_0004', direction));
        assert.equal(after.pinnedId, before.pinnedId); assert.deepEqual(after.recovery, before.recovery);
        for (const task of before.records) assert.deepEqual(after.records.find(record => record.id === task.id), task);
        assert.equal(h.view.input.value, 'unsaved 中文 draft'); assert.equal(h.document.activeElement, h.view.input);
    } finally { h.view.destroy(); }
});

stepTest('legacy null/undefined restoration permits the original row after temporary unavailable sources', async () => {
    const h = model({ legacy: true }); await settle();
    try {
        const action = stepButton(h);
        h.backend.workspace = { invalidated: true }; await rejectsWithoutIO(h, action);
        h.backend.workspace = { _suspended: true }; await rejectsWithoutIO(h, action);
        h.backend.workspace = null; button(row(h), 'Edit').dispatch('click'); await rejectsWithoutIO(h, action);
        button(h.document.body, 'Cancel').dispatch('click'); action.dispatch('click'); await settle();
        assert.equal(h.backend.writes, 1); assert.deepEqual(order(h.backend.raw()), movedOrder(initial(), 'task_0003', direction));
    } finally { h.view.destroy(); }
});

stepTest('real conflict refresh permits a new explicit current-row move without reviving its old row', async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        const old = stepButton(h), oldRow = row(h), state = h.backend.raw();
        await h.remote.mutate(command(h.remote, 'edit', state.records[3], { text: 'new reviewed synthetic text' }));
        old.dispatch('click'); await settle(); assert.equal(h.controller.error.code, 'CONFLICT'); assert.equal(h.view.retry.hidden, true);
        const previous = h.controller.retryCommand, current = stepButton(h), currentRow = row(h);
        currentRow.replaceWith(oldRow); await rejectsWithoutIO(h, old);
        oldRow.replaceWith(currentRow); current.dispatch('click'); await settle();
        assert.equal(h.controller.status, 'saved'); assert.deepEqual(order(h.backend.raw()), movedOrder(initial(), 'task_0003', direction));
        assert.notEqual(h.backend.raw().receipts.at(-1), previous.operationId);
        assert.equal(h.backend.raw().records.find(record => record.id === 'task_0003').text, 'new reviewed synthetic text');
    } finally { h.view.destroy(); }
});

const denied = {
    'disabled property': (h, action) => { action.disabled = true; },
    'disabled attribute': (h, action) => action.setAttribute('disabled', ''),
    'aria-disabled action': (h, action) => action.setAttribute('aria-disabled', 'true'),
    'hidden action': (h, action) => { action.hidden = true; },
    'inert action': (h, action) => { action.inert = true; },
    'zero action rect': (h, action) => { action.getClientRects = () => []; },
    'zero title rect': h => { row(h).querySelector('.tasks-text').getClientRects = () => []; },
    'replaced action': (h, action) => { const next = h.document.createElement('button'); next.textContent = action.textContent; action.replaceWith(next); },
    'replaced menu': h => { const menu = row(h).querySelector('.tasks-row-menu'), next = h.document.createElement('details'); next.open = true; menu.replaceWith(next); },
    'reparented menu': h => { const menu = row(h).querySelector('.tasks-row-menu'); menu.remove(); h.host.append(menu); },
    'removed row': h => row(h).remove(),
    'changed row ID': h => { row(h).dataset.taskId = 'task_0004'; },
    'replaced view list': h => { h.view.list = h.document.createElement('ul'); },
    'replaced filter input': h => { h.view.filterInput = h.document.createElement('input'); },
    'disabled ancestor': h => { h.host.disabled = true; },
    'style hidden ancestor': h => { h.document.body.style.visibility = 'collapse'; },
    'display none action': (h, action) => { action.style.display = 'none'; },
    'in-place target state': h => { h.controller.state.records[3].state = 'done'; },

    'hidden title': h => { row(h).querySelector('.tasks-text').hidden = true; },
    'inert title': h => { row(h).querySelector('.tasks-text').inert = true; },
    'aria-hidden title': h => row(h).querySelector('.tasks-text').setAttribute('aria-hidden', 'true'),
    'hidden row top': h => { row(h).querySelector('.tasks-row-main').hidden = true; },
    'aria-hidden row top': h => row(h).querySelector('.tasks-row-main').setAttribute('aria-hidden', 'true'),
    'style-hidden title': h => { row(h).querySelector('.tasks-text').style.visibility = 'hidden'; },
    'display-none title': h => { row(h).querySelector('.tasks-text').style.display = 'none'; },
    'hidden host': h => { h.host.hidden = true; },
    'inert host': h => { h.host.inert = true; },
    'aria-hidden ancestor': h => h.document.body.setAttribute('aria-hidden', 'true'),
    'closed menu': h => { row(h).querySelector('.tasks-row-menu').open = false; },
    'changed title': h => { row(h).querySelector('.tasks-text').textContent = 'synthetic other title'; },
    'title child': h => row(h).querySelector('.tasks-text').append(h.document.createElement('span')),
    'replaced title': h => { const title = row(h).querySelector('.tasks-text'), replacement = h.document.createElement('span'); replacement.className = title.className; replacement.textContent = title.textContent; title.replaceWith(replacement); },
    'reparented title': h => { const title = row(h).querySelector('.tasks-text'); title.remove(); row(h).append(title); },
    'reparented action': (h, action) => { action.remove(); row(h).append(action); },
    'reparented actions': h => { const actions = row(h).querySelector('.tasks-row-actions'); actions.remove(); row(h).append(actions); },
    'replaced summary': h => row(h).querySelector('summary').replaceWith(h.document.createElement('summary')),
    'foreign title document': h => { row(h).querySelector('.tasks-text').ownerDocument = createDocument(); },
    'foreign action document': (h, action) => { action.ownerDocument = createDocument(); },
    'duplicate original ID before source': h => { const duplicate = h.document.createElement('li'); duplicate.dataset.taskId = 'task_0003'; h.view.list.children.unshift(duplicate); duplicate.parentElement = h.view.list; },
    'reparented mounted host': h => { const wrapper = h.document.createElement('div'); h.document.body.append(wrapper); h.host.remove(); wrapper.append(h.host); },
    'reparented mounted list': h => { const wrapper = h.document.createElement('div'); h.host.append(wrapper); h.view.list.remove(); wrapper.append(h.view.list); },
    'unapplied filter': h => { h.view.filterInput.value = 'duplicate'; },
    'filter composition': h => { h.view.filterComposing = true; },
    'document hidden': h => { h.document.hidden = true; },
    'document visibility': h => { h.document.visibilityState = 'hidden'; },
    'pending controller': h => { h.controller.pending = Promise.resolve(); },
    'closed controller': h => { h.controller.closed = true; },
    'loading controller': h => { h.controller.status = 'loading'; },
    'saving controller': h => { h.controller.status = 'saving'; },
    'error controller': h => { h.controller.status = 'error'; },
    'READ error': h => { h.controller.error = tasks.fault('READ'); },
    'WRITE error': h => { h.controller.error = tasks.fault('WRITE'); },
    'VERIFY error': h => { h.controller.error = tasks.fault('VERIFY'); },
    'outstanding receipt': h => { h.controller.retryCommand = h.store.request('enable', { enabled: false }); },
    'local error': h => { h.view.localError = tasks.fault('FILE'); },
    'pending review': h => { h.view.pendingReview = true; },
    'batch session': h => { h.view.batchSession = {}; },
    'reuse session': h => { h.view.reuseSession = {}; },
    'completion session': h => { h.view.completionSession = {}; },
    'restoration session': h => { h.view.restorationSession = {}; },
    'departure': h => { h.window.LocalItabContentLifecycle.departing = true; },
    'invalid workspace': h => { h.backend.workspace.invalidated = true; },
    'suspended workspace': h => { h.backend.workspace._suspended = true; },
    'missing live state': h => { h.controller.state = null; },
    'in-place target version': h => { h.controller.state.records[3].version = 'changed_version'; },
    'in-place target text': h => { h.controller.state.records[3].text = 'new synthetic text'; },
    'in-place active order': h => { const records = h.controller.state.records; [records[8], records[9]] = [records[9], records[8]]; }
};
for (const [name, change] of Object.entries(denied)) stepTest(`step-move rejects ${name} without creating a request or performing I/O`, async () => {
    const h = model(); await settle();
    try { const action = stepButton(h); change(h, action); await rejectsWithoutIO(h, action); }
    finally { h.view.destroy(); }
});

for (const name of ['controller', 'store', 'backend']) for (const freshRow of [false, true]) stepTest(`construction-owned ${name} cannot be replaced (${freshRow ? 'redrawn' : 'original'} row)`, async () => {
    const h = model(); await settle();
    try {
        let action = stepButton(h);
        if (name === 'controller') h.view.controller = { ...h.controller };
        else if (name === 'store') h.controller.store = new tasks.Store(h.backend);
        else h.store.backend = { ...h.backend };
        if (freshRow) { redraw(h); action = stepButton(h); }
        await rejectsWithoutIO(h, action);
    } finally { h.view.controller = h.controller; h.controller.store = h.store; h.store.backend = h.backend; h.view.destroy(); }
});

const expandedLateChanges = {
    ...sourceChanges,
    restorationSession: h => { h.view.restorationSession = {}; },
    dialog: h => { h.view.dialogs.add({ close() {} }); },
    filterComposition: h => { h.view.filterComposing = true; },
    suspended: h => { h.backend.workspace._suspended = true; },
    order: h => { const records = h.controller.state.records; [records[8], records[9]] = [records[9], records[8]]; },
    hidden: h => { h.document.hidden = true; },
    visibility: h => { h.document.visibilityState = 'hidden'; },
    filter: h => { h.view.filterInput.value = 'new filter not yet applied'; },
    pending: h => { h.controller.pending = Promise.resolve(); },
    error: h => { h.controller.error = tasks.fault('WRITE'); },
    receipt: h => { h.controller.retryCommand = { kind: 'enable', operationId: 'unknown_receipt' }; },
    loading: h => { h.controller.status = 'loading'; },
    departure: h => { h.window.LocalItabContentLifecycle.departing = true; },
    invalidation: h => { h.backend.workspace.invalidated = true; },
    version: h => { h.controller.state.records[3].version = 'late_version'; },
    text: h => { h.controller.state.records[3].text = 'late synthetic text'; },
    state: h => { h.controller.state = { ...h.controller.state, records: h.controller.state.records.filter(task => task.id !== 'task_0003') }; }
};
for (const [name, change] of Object.entries(expandedLateChanges)) stepTest(`final layout getter changing ${name} is rechecked before request creation`, async () => {
    const h = model(); await settle(); let rootReads = 0;
    try {
        const action = stepButton(h), getStyle = h.window.getComputedStyle;
        h.window.getComputedStyle = node => {
            const style = getStyle(node);
            // Both action and title paths end at the document root. Change the
            // source on the final modeled layout read, after initial checks.
            if (node === h.document.documentElement && ++rootReads === 2) change(h);
            return style;
        };
        await rejectsWithoutIO(h, action); assert.equal(rootReads, 2, 'probe reached the final layout read');
    } finally { h.view.destroy(); }
});

for (const fields of [{ defaultPrevented: true }, { detail: 2 }, { repeat: true }, { isComposing: true }, { keyCode: 229 }]) stepTest(`step-move rejects blocked activation ${JSON.stringify(fields)}`, async () => {
    const h = model(); await settle();
    try {
        const action = stepButton(h), reads = h.backend.reads;
        action.dispatch('click', fields); await settle();
        assert.equal(h.backend.requests, 0); assert.equal(h.backend.writes, 0); assert.equal(h.backend.reads, reads);
    } finally { h.view.destroy(); }
});
for (const key of ['Enter', ' ']) stepTest(`step-move ${JSON.stringify(key)} repeat and IME guard permits ordinary native-button activation`, async () => {
    const h = model(); await settle();
    try {
        const action = stepButton(h);
        for (const fields of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) assert.equal(action.dispatch('keydown', { key, ...fields }).prevented, true);
        assert.equal(action.dispatch('keydown', { key }).prevented, false); assert.equal(h.backend.requests, 0);
        action.dispatch('click', { detail: 0 }); await settle(); assert.equal(h.backend.writes, 1);
    } finally { h.view.destroy(); }
});

for (const sessionMode of ['missing', 'wrong']) stepTest(`a workspace created with ${sessionMode} session remains unavailable after redraw`, async () => {
    const h = model({ sessionMode }); await settle();
    try { await rejectsWithoutIO(h, stepButton(h)); redraw(h); await rejectsWithoutIO(h, stepButton(h)); }
    finally { h.view.destroy(); }
});

for (const locale of ['en', 'zh_CN', 'fallback']) stepTest(`current action stays independent of sibling controls and quick-entry composition (${locale})`, async () => {
    const h = model({ locale }); await settle();
    try {
        const actionLabel = label(locale), action = stepButton(h, 'task_0003', actionLabel);
        const actions = row(h).querySelector('.tasks-row-actions');
        for (const sibling of [...actions.children]) if (sibling !== action) sibling.remove();
        input(h.view.input, '正在输入的草稿'); h.view.input.focus(); h.view.input.dispatch('compositionstart');
        action.dispatch('click'); await settle(); assert.equal(h.backend.writes, 1);
        assert.equal(h.view.input.value, '正在输入的草稿'); assert.equal(h.view.quickEntryComposing, true); assert.equal(h.document.activeElement, h.view.input);
    } finally { h.view.destroy(); }
});

stepTest('real pending move coalesces with exact receipt while newer draft and search focus survive', async () => {
    const h = model(); await settle(); const gate = deferred();
    try {
        h.backend.delay = gate.promise; const action = stepButton(h, 'task_0004'); action.focus(); action.dispatch('click'); await settle();
        const request = h.controller.retryCommand; assert.equal(h.controller.status, 'saving'); assert.equal(h.backend.writes, 1);
        action.dispatch('click'); stepButton(h).dispatch('click'); assert.strictEqual(h.controller.retryCommand, request); assert.equal(h.backend.requests, 1);
        input(h.view.input, 'later draft'); h.search.focus(); gate.resolve(); await settle();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, 1); assert.equal(h.document.activeElement, h.search); assert.equal(h.view.input.value, 'later draft');
    } finally { gate.resolve(); h.view.destroy(); }
});

for (const mode of ['false', 'drop', 'ack']) for (const change of ['object', 'id', 'generation', 'session', 'store', 'backend']) {
    stepTest(`step-move Retry source boundary rejects ${change} after ${mode} failure`, async () => {
        const h = model(), foreign = model(); await settle();
        h.backend.notifications = false; foreign.backend.notifications = false;
        try {
            h.backend.mode = mode; stepButton(h, 'task_0004').dispatch('click'); await settle();
            assert.equal(h.controller.error.code, mode === 'drop' ? 'VERIFY' : 'WRITE');
            const request = h.controller.retryCommand; assert.equal(request.kind, 'move'); assert.equal(h.view.retry.hidden, false);
            h.backend.mode = null;
            const workspace = h.backend.workspace, workspaceId = workspace.id, generation = workspace.generation, session = h.window.LocalItabWorkspaces.session;
            let destination = h.backend;
            if (change === 'store') { h.controller.store = foreign.store; destination = foreign.backend; }
            else if (change === 'backend') { h.store.backend = foreign.backend; destination = foreign.backend; }
            else sourceChanges[change](h);
            const before = destination.raw(), reads = destination.reads, writes = destination.writes;
            const originalBefore = h.backend.raw(), originalReads = h.backend.reads, originalWrites = h.backend.writes;
            h.view.retry.dispatch('click'); await settle();
            assert.equal(destination.writes, writes, 'original Retry must not write to a changed source');
            assert.equal(destination.reads, reads, 'original Retry must not read from a changed source');
            assert.deepEqual(destination.raw(), before);
            assert.equal(h.backend.writes, originalWrites); assert.equal(h.backend.reads, originalReads); assert.deepEqual(h.backend.raw(), originalBefore);
            assert.strictEqual(h.controller.retryCommand, request, 'changed source must not replace or clear the exact original Retry');
            h.controller.store = h.store; h.store.backend = h.backend; h.backend.workspace = workspace;
            workspace.id = workspaceId; workspace.generation = generation; h.window.LocalItabWorkspaces.session = session;
            const retryWrites = h.backend.writes; h.view.retry.dispatch('click'); await settle();
            assert.equal(h.controller.status, 'saved'); assert.equal(h.controller.retryCommand, null);
            assert.equal(h.backend.writes, retryWrites + (mode === 'ack' ? 0 : 1));
            assert.deepEqual(order(h.backend.raw()), movedOrder(initial(), 'task_0004', direction));
            assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
        } finally {
            h.controller.store = h.store; h.store.backend = h.backend; h.view.destroy(); foreign.view.destroy();
        }
    });
}

stepTest('same-source acknowledgement Retry survives reload, redraw and changed displayed order without a second write', async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        h.backend.mode = 'ack'; stepButton(h, 'task_0004').dispatch('click'); await settle();
        const request = h.controller.retryCommand, after = h.backend.raw(); assert.equal(h.controller.error.code, 'WRITE');
        h.backend.mode = null; await h.controller.refresh(); redraw(h); h.view.more.dispatch('click');
        assert.deepEqual(order(h.controller.state), movedOrder(initial(), 'task_0004', direction)); assert.equal(stepButton(h, 'task_0004').disabled, false);
        input(h.view.input, 'draft while acknowledging'); h.view.input.focus(); h.view.retry.dispatch('click'); await settle();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.controller.retryCommand, null); assert.equal(h.backend.writes, 1);
        assert.deepEqual(h.backend.raw(), after); assert.equal(after.receipts.at(-1), request.operationId);
        assert.equal(h.view.input.value, 'draft while acknowledging'); assert.equal(h.document.activeElement, h.view.input);
    } finally { h.view.destroy(); }
});

for (const mode of ['false', 'drop']) stepTest(`same-source ${mode} Retry after unrelated remote edit retains the exact request and latest other record`, async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        h.backend.mode = mode; stepButton(h, 'task_0004').dispatch('click'); await settle(); const request = h.controller.retryCommand;
        h.backend.mode = null; const before = h.backend.raw();
        await h.remote.mutate(command(h.remote, 'edit', before.records[3], { text: 'new unrelated synthetic record' }));
        const edited = h.backend.raw().records.find(task => task.id === 'task_0003'); await h.controller.refresh(); redraw(h);
        assert.strictEqual(h.controller.retryCommand, request); const writes = h.backend.writes;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes + 1);
        assert.deepEqual(h.backend.raw().records.find(task => task.id === 'task_0003'), edited);
        assert.deepEqual(order(h.backend.raw()), movedOrder(initial(), 'task_0004', direction)); assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
    } finally { h.view.destroy(); }
});

stepTest('same-source acknowledgement Retry after a later unrelated edit reaches receipt validation and conflicts without another write', async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        h.backend.mode = 'ack'; stepButton(h, 'task_0004').dispatch('click'); await settle(); const request = h.controller.retryCommand;
        h.backend.mode = null; const before = h.backend.raw();
        await h.remote.mutate(command(h.remote, 'edit', before.records.find(task => task.id === 'task_0003'), { text: 'later unrelated synthetic record' }));
        await h.controller.refresh(); redraw(h); const latest = h.backend.raw(), reads = h.backend.reads, writes = h.backend.writes;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.error.code, 'CONFLICT');
        assert(h.backend.reads > reads, 'same-source retry reached receipt validation'); assert.equal(h.backend.writes, writes);
        assert.deepEqual(h.backend.raw(), latest); assert.strictEqual(h.controller.retryCommand, request);
    } finally { h.view.destroy(); }
});

for (const mode of ['false', 'drop', 'ack']) stepTest(`legacy ${mode} Retry stays available after temporary unavailability and nullish source restoration`, async () => {
    const h = model({ legacy: true }); await settle(); h.backend.notifications = false;
    try {
        h.backend.mode = mode; stepButton(h, 'task_0004').dispatch('click'); await settle(); const request = h.controller.retryCommand;
        h.backend.mode = null; h.backend.workspace = { invalidated: true };
        const reads = h.backend.reads, writes = h.backend.writes; h.view.retry.dispatch('click'); await settle();
        assert.equal(h.backend.reads, reads); assert.equal(h.backend.writes, writes); assert.strictEqual(h.controller.retryCommand, request);
        h.backend.workspace = null; h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved');
        assert.equal(h.backend.writes, writes + (mode === 'ack' ? 0 : 1)); assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
    } finally { h.view.destroy(); }
});

stepTest('original anonymous availability object without a workspace service retains current-row movement', async () => {
    const h = model({ legacyAvailability: true }); await settle();
    try {
        assert.equal(h.window.LocalItabWorkspaces, undefined); assert.equal(h.backend.workspace.id, undefined); assert.equal(h.backend.workspace.generation, undefined);
        const before = h.backend.raw(); input(h.view.input, 'legacy availability draft'); h.view.input.focus();
        stepButton(h, 'task_0004').dispatch('click'); await settle();
        assert.equal(h.backend.writes, 1); assert.deepEqual(order(h.backend.raw()), movedOrder(initial(), 'task_0004', direction));
        assert.equal(h.backend.raw().pinnedId, before.pinnedId); assert.deepEqual(h.backend.raw().recovery, before.recovery);
        assert.equal(h.view.input.value, 'legacy availability draft'); assert.equal(h.document.activeElement, h.view.input);
    } finally { h.view.destroy(); }
});

for (const mode of ['false', 'drop', 'ack']) stepTest(`original anonymous availability object retains same-source ${mode} Retry`, async () => {
    const h = model({ legacyAvailability: true }); await settle(); h.backend.notifications = false;
    try {
        h.backend.mode = mode; stepButton(h, 'task_0004').dispatch('click'); await settle();
        assert.equal(h.controller.error.code, mode === 'drop' ? 'VERIFY' : 'WRITE'); const request = h.controller.retryCommand;
        h.backend.mode = null; await h.controller.refresh(); redraw(h); const writes = h.backend.writes;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved');
        assert.equal(h.backend.writes, writes + (mode === 'ack' ? 0 : 1)); assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
        assert.deepEqual(order(h.backend.raw()), movedOrder(initial(), 'task_0004', direction));
    } finally { h.view.destroy(); }
});

const availabilityChanges = {
    'new empty service': h => { h.window.LocalItabWorkspaces = {}; },
    'new matching session service': h => { h.window.LocalItabWorkspaces = { session: h.backend.workspace }; },
    'replaced availability object': h => { h.backend.workspace = { ...h.backend.workspace }; },
    'new workspace ID': h => { h.backend.workspace.id = 'workspace_0002'; },
    'new workspace generation': h => { h.backend.workspace.generation = 'generation_0002'; },
    'invalidated original': h => { h.backend.workspace.invalidated = true; },
    'suspended original': h => { h.backend.workspace._suspended = true; }
};
for (const [name, change] of Object.entries(availabilityChanges)) for (const freshRow of [false, true]) stepTest(`anonymous availability rejects ${name} (${freshRow ? 'redrawn' : 'original'} row)`, async () => {
    const h = model({ legacyAvailability: true }); await settle();
    try {
        let action = stepButton(h); change(h);
        if (freshRow) { redraw(h); action = stepButton(h); }
        await rejectsWithoutIO(h, action);
    } finally { h.view.destroy(); }
});

for (const [name, change] of Object.entries(availabilityChanges)) for (const mode of ['false', 'drop', 'ack']) stepTest(`anonymous availability ${mode} Retry rejects ${name} until the original source returns`, async () => {
    const h = model({ legacyAvailability: true }); await settle(); h.backend.notifications = false;
    try {
        const availability = h.backend.workspace;
        h.backend.mode = mode; stepButton(h, 'task_0004').dispatch('click'); await settle();
        const request = h.controller.retryCommand; assert.equal(request.kind, 'move'); h.backend.mode = null; change(h);
        const before = h.backend.raw(), reads = h.backend.reads, writes = h.backend.writes;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.backend.reads, reads); assert.equal(h.backend.writes, writes);
        assert.deepEqual(h.backend.raw(), before); assert.strictEqual(h.controller.retryCommand, request);
        h.backend.workspace = availability; delete availability.id; delete availability.generation;
        availability.invalidated = false; availability._suspended = false; delete h.window.LocalItabWorkspaces;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved');
        assert.equal(h.backend.writes, writes + (mode === 'ack' ? 0 : 1)); assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
    } finally { h.view.destroy(); }
});

stepTest('identified workspace without any service is never treated as an anonymous availability object', async () => {
    const h = model({ sessionMode: 'absent' }); await settle();
    try {
        await rejectsWithoutIO(h, stepButton(h)); redraw(h); await rejectsWithoutIO(h, stepButton(h));
        h.window.LocalItabWorkspaces = { session: h.backend.workspace }; redraw(h); await rejectsWithoutIO(h, stepButton(h));
    } finally { h.view.destroy(); }
});

for (const property of ['hidden', 'filter']) for (const change of ['pending', 'state']) stepTest(`final ${property} getter cannot hide a late ${change} change from the final eligibility check`, async () => {
    const h = model(); await settle(); let reads = 0;
    try {
        const action = stepButton(h), target = property === 'hidden' ? h.document : h.view.filterInput;
        const key = property === 'hidden' ? 'hidden' : 'value', value = property === 'hidden' ? false : '';
        Object.defineProperty(target, key, { configurable: true, get() {
            if (++reads === 3) {
                if (change === 'pending') h.controller.pending = Promise.resolve();
                else h.controller.state = { ...h.controller.state, records: h.controller.state.records.filter(task => task.id !== 'task_0003') };
            }
            return value;
        } });
        await rejectsWithoutIO(h, action); assert.equal(reads, 3, 'final post-layout page/filter read reached');
    } finally { h.view.destroy(); }
});

for (const mode of ['read', 'false', 'drop', 'ack']) for (const locale of ['en', 'zh_CN', 'fallback']) stepTest(`step-move ${mode} failure uses safe localized feedback (${locale})`, async () => {
    const h = model({ locale }); await settle(); h.backend.notifications = false;
    try {
        if (mode === 'read') h.backend.nextReadFails = true; else h.backend.mode = mode;
        stepButton(h, 'task_0004', label(locale)).dispatch('click'); await settle();
        assert.equal(h.controller.status, 'error'); assert.equal(h.controller.retryCommand.kind, 'move');
        assert.equal(h.view.retry.hidden, false); assert.equal(h.view.status.getAttribute('role'), 'status');
        const key = mode === 'read' ? 'tasksErrorRead' : 'tasksErrorWrite';
        const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../_locales', locale === 'fallback' ? 'en' : locale, 'messages.json'), 'utf8'));
        assert.equal(h.view.status.textContent, catalog[key].message);
        for (const unsafe of ['synthetic read failure', 'synthetic acknowledgement failure', 'task_0004', 'duplicate 中文', 'workspace_0001']) assert.equal(h.view.status.textContent.includes(unsafe), false);
    } finally { h.view.destroy(); }
});

for (const locale of ['en', 'zh_CN', 'fallback']) stepTest(`native boundary and applied-filter disabling remains localized (${locale})`, async () => {
    const h = model({ locale }); await settle();
    try {
        h.view.more.dispatch('click');
        const boundaryId = direction === -1 ? 'task_0001' : 'task_0009', text = label(locale);
        const action = stepButton(h, boundaryId, text);
        assert.equal(action.tagName, 'BUTTON'); assert.equal(action.type, 'button'); assert.equal(action.disabled, true);
        // Neighbor validation must still reject even if the disabled DOM flag is removed.
        action.disabled = false; await rejectsWithoutIO(h, action);
        input(h.view.filterInput, 'duplicate'); const filtered = stepButton(h, 'task_0004', text);
        assert.equal(filtered.disabled, true);
        assert.equal(filtered.title, locale === 'zh_CN' ? '清除筛选后可调整任务顺序。' : 'Clear the filter to reorder tasks.');
        filtered.disabled = false; await rejectsWithoutIO(h, filtered);
    } finally { h.view.destroy(); }
});

for (const identityMode of ['id-only', 'generation-only']) stepTest(`${identityMode} workspace with no service is not anonymous legacy compatibility`, async () => {
    const h = model({ sessionMode: 'absent', identityMode }); await settle();
    try {
        await rejectsWithoutIO(h, stepButton(h)); redraw(h); await rejectsWithoutIO(h, stepButton(h));
        h.window.LocalItabWorkspaces = { session: h.backend.workspace }; redraw(h); await rejectsWithoutIO(h, stepButton(h));
    } finally { h.view.destroy(); }
});

for (const identity of ['target', 'currentTarget']) stepTest(`foreign event ${identity} cannot activate original button`, async () => {
    const h = model(); await settle();
    try {
        const action = stepButton(h), reads = h.backend.reads;
        action.dispatch('click', { [identity]: h.document.createElement('span') }); await settle();
        assert.equal(h.backend.requests, 0); assert.equal(h.backend.writes, 0); assert.equal(h.backend.reads, reads);
    } finally { h.view.destroy(); }
});

stepTest('unresolved READ preserves its exact command against new moves and resumes only at original source', async () => {
    const h = model(); await settle();
    try {
        h.backend.nextReadFails = true; stepButton(h).dispatch('click'); await settle();
        const original = h.controller.retryCommand, workspace = h.backend.workspace;
        assert.equal(h.controller.error.code, 'READ'); assert.equal(original.kind, 'move'); assert.equal(original.direction, direction);
        await rejectsWithoutIO(h, stepButton(h, 'task_0004')); assert.strictEqual(h.controller.retryCommand, original);
        sourceChanges.object(h); await rejectsWithoutIO(h, h.view.retry); assert.strictEqual(h.controller.retryCommand, original);
        h.backend.workspace = workspace; h.window.LocalItabWorkspaces.session = workspace;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.backend.writes, 1); assert.equal(h.controller.status, 'saved');
        assert.deepEqual(order(h.backend.raw()), movedOrder(initial(), 'task_0003', direction));
    } finally { h.view.destroy(); }
});

stepTest('same-source acknowledged receipt confirms even when original movement is now at its boundary', async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        h.view.more.dispatch('click'); const id = direction === -1 ? 'task_0003' : 'task_0008';
        h.backend.mode = 'ack'; stepButton(h, id).dispatch('click'); await settle(); const request = h.controller.retryCommand;
        h.backend.mode = null; await h.controller.refresh(); redraw(h);
        assert.equal(stepButton(h, id).disabled, true); const before = h.backend.raw(), writes = h.backend.writes;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes);
        assert.deepEqual(h.backend.raw(), before); assert.equal(before.receipts.at(-1), request.operationId);
    } finally { h.view.destroy(); }
});

stepTest('real pending write prevents further request creation and keeps unrelated editor draft and focus', async () => {
    const h = model(); await settle(); const gate = deferred();
    try {
        h.backend.delay = gate.promise; stepButton(h).dispatch('click'); await settle();
        const request = h.controller.retryCommand;
        button(row(h, 'task_0004'), 'Edit').dispatch('click'); const editor = h.document.body.querySelector('.tasks-editor');
        input(editor, 'independent editor draft 中文'); editor.focus();
        await rejectsWithoutIO(h, stepButton(h, 'task_0004')); assert.strictEqual(h.controller.retryCommand, request);
        gate.resolve(); await settle();
        assert.equal(h.backend.writes, 1); assert.equal(editor.value, 'independent editor draft 中文'); assert.equal(h.document.activeElement, editor);
    } finally { gate.resolve(); h.view.destroy(); }
});

stepTest('movement preserves Next up, existing Undo and independent quick-entry draft', async () => {
    const h = model(); await settle();
    try {
        row(h, 'task_0006').querySelector('.tasks-row-menu').open = true;
        assert(button(row(h, 'task_0006'), 'Remove').getClientRects().length, 'Undo is seeded through visible Remove');
        button(row(h, 'task_0006'), 'Remove').dispatch('click'); await settle();
        assert.equal(h.backend.raw().records.find(record => record.id === 'task_0006').state, 'removed');
        assert.equal(h.backend.raw().records.find(record => record.id === 'task_0006').removedFrom, 'active');
        assert.equal(h.view.undo.id, 'task_0006'); assert.equal(h.view.undo.state, 'removed');
        const undo = h.view.undo, before = h.backend.raw(); input(h.view.input, 'independent draft'); h.view.input.focus();
        stepButton(h).dispatch('click'); await settle();
        assert.deepEqual(order(h.backend.raw()), movedOrder(before, 'task_0003', direction));
        assert.strictEqual(h.view.undo, undo); assert.equal(h.view.undoButton.hidden, false);
        assert.equal(h.backend.raw().pinnedId, before.pinnedId);
        assert.equal(h.view.next.querySelector('.tasks-next-text').textContent, `Next up: ${before.records.find(task => task.id === before.pinnedId).text}`);
        assert.equal(h.view.input.value, 'independent draft'); assert.equal(h.document.activeElement, h.view.input);
        h.view.undoButton.dispatch('click'); await settle(); assert.equal(h.backend.raw().records.find(task => task.id === undo.id).state, 'active');
    } finally { h.view.destroy(); }
});

stepTest('pending old copy result is invalidated by movement without replacing newer focus', async () => {
    const h = model(); await settle(); const gate = deferred(), calls = [];
    try {
        h.view.clipboard = { writeText(text) { calls.push(text); return gate.promise; } };
        stepButton(h); const oldStatus = row(h).querySelector('.tasks-row-copy-status');
        button(row(h), 'Copy text').dispatch('click'); assert.equal(calls.length, 1); assert.equal(oldStatus.hidden, false);
        stepButton(h).dispatch('click'); await settle(); h.search.focus(); gate.resolve(); await settle();
        assert.equal(h.backend.writes, 1); assert.equal(oldStatus.hidden, true); assert.equal(oldStatus.textContent, '');
        assert.equal(h.document.activeElement, h.search); assert.equal(row(h).querySelector('.tasks-row-copy-status').hidden, true);
    } finally { gate.resolve(); h.view.destroy(); }
});

stepTest('focused source reaches boundary or leaves collapsed preview with existing focus fallback', async () => {
    const h = model(); await settle();
    try {
        const id = direction === -1 ? 'task_0003' : 'task_0006', action = stepButton(h, id); action.focus();
        action.dispatch('click'); await settle(); assert.equal(h.backend.writes, 1); assert.equal(h.view.expanded, false);
        assert.equal(h.document.activeElement, direction === -1 ? row(h, id).querySelector('summary') : h.view.input);
        assert.equal(h.view.next.querySelector('.tasks-next-text').textContent, `Next up: ${initial().records[4].text}`);
    } finally { h.view.destroy(); }
});

}
