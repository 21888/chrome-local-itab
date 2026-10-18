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
function initial(pinned = false) {
    const states = ['done', 'active', 'removed', 'active', 'active', 'done', 'active', 'removed', 'active', 'active'];
    return tasks.validate({ schemaVersion: 1, revision: 4, enabled: true, pinnedId: pinned ? 'task_0003' : 'task_0004', receipts: ['previous_1'],
        records: states.map((state, index) => ({ id: `task_000${index}`, version: `version_${index}`,
            text: [1, 4, 9].includes(index) ? '  duplicate 中文 😀\ntext  ' : `Synthetic task ${index}`,
            state, removedFrom: state === 'removed' ? 'active' : null,
            createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' })),
        recovery: [{ id: 'recovery_1', createdAt: '2026-10-03T00:00:00.000Z', content: { records: [], pinnedId: null } }] });
}
// Independent synthetic storage/DOM fixture, using the real Store/Controller/View.
// Each workspace object/ID/generation routes to its own identical starting data.
// These are modeled ownership probes, not native Chrome or event-timing evidence.
function model({ pinned = false, legacy = false, legacyAvailability = false, locale = 'en', sessionMode = 'matching', identityMode = 'full' } = {}) {
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
        if (!sources.has(key)) sources.set(key, { raw: initial(pinned) });
        return sources.get(key);
    }
    const store = new tasks.Store(backend, { id: () => `operation_${++operation}`, now: () => '2026-10-18T01:00:00.000Z' });
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
function pinButton(h, id = 'task_0003', text) {
    const item = row(h, id); assert(item, `rendered row ${id}`);
    item.querySelector('.tasks-row-menu').open = true;
    const label = text || (h.controller.state.pinnedId === id ? 'Unpin' : 'Pin next');
    const action = button(item, label); assert(action, `pin button ${id} (${label})`); return action;
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
function failNext(h, mode) { if (mode === 'READ') h.backend.nextReadFails = true; else h.backend.mode = mode; }
const errorCode = mode => mode === 'READ' ? 'READ' : mode === 'drop' ? 'VERIFY' : 'WRITE';

// Retain this exact first-run RED suite before changing production.
for (const pinned of [false, true]) {
    const name = pinned ? 'unpin' : 'pin';
    test(`RED: ${name} current original row performs one pin write`, async () => {
        const h = model({ pinned }); await settle();
        try {
            const before = h.backend.raw(); pinButton(h).dispatch('click'); await settle();
            assert.equal(h.backend.writes, 1); assert.equal(h.backend.raw().pinnedId, pinned ? null : 'task_0003');
            assert.deepEqual(h.backend.raw().records, before.records); assert.deepEqual(h.backend.raw().recovery, before.recovery);
        } finally { h.view.destroy(); }
    });
    test(`RED: ${name} construction source cannot change before the first asynchronous row render`, async () => {
        const h = model({ pinned });
        try { sourceChanges.object(h); await settle(); await rejectsWithoutIO(h, pinButton(h)); }
        finally { h.view.destroy(); }
    });
    test(`RED: ${name} redrawn row cannot adopt an identical replacement workspace`, async () => {
        const h = model({ pinned }); await settle();
        try {
            const before = h.backend.raw(); sourceChanges.object(h); assert.deepEqual(h.backend.raw(), before);
            redraw(h); await rejectsWithoutIO(h, pinButton(h));
        } finally { h.view.destroy(); }
    });
    for (const change of ['backend', 'store']) for (const fresh of [false, true]) test(`RED: ${name} ${change} replacement with independent data and original workspace identity rejects ${fresh ? 'redrawn' : 'original'} row`, async () => {
        const h = model({ pinned }), foreign = model({ pinned }); await settle();
        try {
            foreign.backend.workspace = h.backend.workspace; foreign.window.LocalItabWorkspaces.session = h.backend.workspace;
            assert.deepEqual(foreign.backend.raw(), h.backend.raw());
            let action = pinButton(h);
            if (change === 'store') h.controller.store = foreign.store; else h.store.backend = foreign.backend;
            if (fresh) { redraw(h); action = pinButton(h); }
            const before = foreign.backend.raw(), reads = foreign.backend.reads, writes = foreign.backend.writes;
            const ownReads = h.backend.reads, ownWrites = h.backend.writes;
            action.dispatch('click'); await settle();
            const counts = JSON.stringify({ foreignReads: [reads, foreign.backend.reads], foreignWrites: [writes, foreign.backend.writes], ownReads: [ownReads, h.backend.reads], ownWrites: [ownWrites, h.backend.writes] });
            assert.equal(foreign.backend.writes, writes, `replacement destination must not write ${counts}`);
            assert.equal(foreign.backend.reads, reads, `replacement destination must not read ${counts}`);
            assert.deepEqual(foreign.backend.raw(), before); assert.equal(h.backend.reads, ownReads); assert.equal(h.backend.writes, ownWrites);
        } finally { h.controller.store = h.store; h.store.backend = h.backend; h.view.destroy(); foreign.view.destroy(); }
    });
    for (const [mode, change] of [['READ', 'workspace'], ['false', 'workspace'], ['drop', 'workspace'], ['ack', 'workspace'], ['ack', 'store'], ['ack', 'backend']]) test(`RED: ${name} original ${mode} Retry rejects ${change} replacement and resumes at original source`, async () => {
        const h = model({ pinned }), foreign = model({ pinned }); await settle(); h.backend.notifications = false;
        try {
            failNext(h, mode); pinButton(h).dispatch('click'); await settle();
            const request = h.controller.retryCommand; assert.equal(request.kind, 'pin'); assert.equal(request.expectedPin, initial(pinned).pinnedId);
            assert.equal(h.controller.error.code, errorCode(mode));
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
            assert.equal(h.backend.raw().receipts.at(-1), request.operationId); assert.equal(h.backend.raw().pinnedId, pinned ? null : 'task_0003');
        } finally { h.controller.store = h.store; h.store.backend = h.backend; h.view.destroy(); foreign.view.destroy(); }
    });
    test(`RED: ${name} old complete row cannot regain ownership by reattachment after redraw`, async () => {
        const h = model({ pinned }); await settle();
        try {
            const action = pinButton(h), old = row(h); redraw(h); row(h).replaceWith(old);
            assert.equal(old.isConnected, true); old.querySelector('.tasks-row-menu').open = true;
            await rejectsWithoutIO(h, action);
        } finally { h.view.destroy(); }
    });
}

for (const pinned of [false, true]) {
    const pinTest = (name, fn) => test(`${pinned ? 'unpin' : 'pin'}: ${name}`, fn);
    for (const [name, change] of Object.entries(sourceChanges)) for (const fresh of [false, true]) pinTest(`workspace ${name} rejects ${fresh ? 'redrawn' : 'original'} row`, async () => {
        const h = model({ pinned }); await settle();
        try { let action = pinButton(h); change(h); if (fresh) { redraw(h); action = pinButton(h); } await rejectsWithoutIO(h, action); }
        finally { h.view.destroy(); }
    });
    for (const name of ['controller', 'store', 'backend']) for (const fresh of [false, true]) pinTest(`construction-owned ${name} rejects ${fresh ? 'redrawn' : 'original'} row replacement`, async () => {
        const h = model({ pinned }); await settle();
        try {
            let action = pinButton(h);
            if (name === 'controller') h.view.controller = { ...h.controller };
            else if (name === 'store') h.controller.store = new tasks.Store(h.backend);
            else h.store.backend = { ...h.backend };
            if (fresh) { redraw(h); action = pinButton(h); }
            await rejectsWithoutIO(h, action);
        } finally { h.view.controller = h.controller; h.controller.store = h.store; h.store.backend = h.backend; h.view.destroy(); }
    });
    for (const change of ['expand', 'collapse', 'filter', 'rerender', 'dispose']) pinTest(`old row cannot revive after ${change} and perfect reattachment`, async () => {
        const h = model({ pinned }); await settle();
        try {
            if (change === 'collapse') h.view.more.dispatch('click');
            const action = pinButton(h), old = row(h), list = h.view.list;
            if (change === 'expand' || change === 'collapse') h.view.more.dispatch('click');
            else if (change === 'filter') { input(h.view.filterInput, 'duplicate'); h.view.filterClear.dispatch('click'); }
            else if (change === 'rerender') redraw(h);
            else h.view.destroy();
            await rejectsWithoutIO(h, action);
            if (change === 'dispose') list.append(old); else row(h).replaceWith(old);
            old.querySelector('.tasks-row-menu').open = true; assert.equal(old.isConnected, true); await rejectsWithoutIO(h, action);
        } finally { h.view.destroy(); }
    });
    for (const mode of ['READ', 'false', 'drop', 'ack']) pinTest(`unknown ${mode} attempt cannot be replaced by a fresh pin or unpin choice`, async () => {
        const h = model({ pinned }); await settle(); h.backend.notifications = false;
        try {
            failNext(h, mode); pinButton(h).dispatch('click'); await settle();
            const request = h.controller.retryCommand, error = h.controller.error; assert.equal(error.code, errorCode(mode));
            h.backend.mode = null; await h.controller.refresh(); redraw(h);
            await rejectsWithoutIO(h, pinButton(h)); await rejectsWithoutIO(h, pinButton(h, 'task_0004'));
            assert.strictEqual(h.controller.retryCommand, request); assert.strictEqual(h.controller.error, error);
            const writes = h.backend.writes; h.view.retry.dispatch('click'); await settle();
            assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes + (mode === 'ack' ? 0 : 1));
            assert.equal(h.backend.raw().pinnedId, pinned ? null : 'task_0003'); assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
        } finally { h.view.destroy(); }
    });
    pinTest('newer pin rejects the detached and perfectly reattached old action without altering error, Retry, Undo or saved state', async () => {
        const h = model({ pinned }); await settle();
        try {
            const action = pinButton(h), old = row(h), before = h.backend.raw();
            await h.controller.action('pin', { id: 'task_0006', version: before.records[6].version, expectedPin: before.pinnedId }); await settle();
            const latest = h.backend.raw(), error = h.controller.error, retry = h.controller.retryCommand, undo = h.view.undo, status = h.controller.status;
            await rejectsWithoutIO(h, action); row(h).replaceWith(old); old.querySelector('.tasks-row-menu').open = true; await rejectsWithoutIO(h, action);
            assert.deepEqual(h.backend.raw(), latest); assert.strictEqual(h.controller.error, error); assert.strictEqual(h.controller.retryCommand, retry);
            assert.strictEqual(h.view.undo, undo); assert.equal(h.controller.status, status);
            redraw(h); pinButton(h).dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.raw().pinnedId, 'task_0003');
        } finally { h.view.destroy(); }
    });
    pinTest('current filtered row pins or unpins and keeps exact filter, independent draft and IME', async () => {
        const h = model({ pinned }); await settle();
        try {
            input(h.view.filterInput, '  SYNTHETIC TASK 3  '); const action = pinButton(h);
            assert.equal(action.disabled, undefined); assert.equal(h.view.list.querySelectorAll('[data-task-id]').length, 1);
            input(h.view.input, '正在输入的草稿'); h.view.input.focus(); h.view.input.dispatch('compositionstart');
            const before = h.backend.raw(); action.dispatch('click'); await settle();
            assert.equal(h.backend.writes, 1); assert.equal(h.backend.raw().pinnedId, pinned ? null : 'task_0003');
            assert.deepEqual(h.backend.raw().records, before.records); assert.equal(h.view.filterInput.value, '  SYNTHETIC TASK 3  ');
            assert.equal(h.view.filterQuery, 'synthetic task 3'); assert.equal(h.view.input.value, '正在输入的草稿');
            assert.equal(h.view.quickEntryComposing, true); assert.equal(h.document.activeElement, h.view.input);
        } finally { h.view.destroy(); }
    });
    pinTest('old filter result stays invalid when its complete row is attached to a new filter result', async () => {
        const h = model({ pinned }); await settle();
        try {
            input(h.view.filterInput, 'task 3'); const old = row(h), action = pinButton(h);
            input(h.view.filterInput, 'synthetic'); row(h).replaceWith(old); old.querySelector('.tasks-row-menu').open = true;
            await rejectsWithoutIO(h, action); redraw(h); pinButton(h).dispatch('click'); await settle(); assert.equal(h.backend.writes, 1);
        } finally { h.view.destroy(); }
    });
    pinTest('unrelated current-state and remote active-order changes do not lock pin to the entire order', async () => {
        const h = model({ pinned }); await settle(); h.backend.notifications = false;
        try {
            const action = pinButton(h), before = h.backend.raw();
            await h.remote.mutate(command(h.remote, 'move', before.records[9], { order: order(before), direction: -1 }));
            const latest = h.backend.raw(), records = h.controller.state.records;
            [records[8], records[9]] = [records[9], records[8]];
            const writes = h.backend.writes; action.dispatch('click'); await settle();
            assert.equal(h.backend.writes, writes + 1); assert.equal(h.backend.raw().pinnedId, pinned ? null : 'task_0003');
            assert.deepEqual(h.backend.raw().records, latest.records);
        } finally { h.view.destroy(); }
    });
    pinTest('real Store CAS conflict refresh permits a new explicit choice while keeping old row rejected', async () => {
        const h = model({ pinned }); await settle(); h.backend.notifications = false;
        try {
            const old = row(h), action = pinButton(h), before = h.backend.raw();
            await h.remote.mutate(command(h.remote, 'pin', before.records[6], { expectedPin: before.pinnedId }));
            action.dispatch('click'); await settle(); assert.equal(h.controller.error.code, 'CONFLICT'); assert.equal(h.view.retry.hidden, true);
            const retry = h.controller.retryCommand, current = row(h), fresh = pinButton(h);
            current.replaceWith(old); old.querySelector('.tasks-row-menu').open = true; await rejectsWithoutIO(h, action);
            assert.strictEqual(h.controller.retryCommand, retry); old.replaceWith(current); fresh.dispatch('click'); await settle();
            assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.raw().pinnedId, 'task_0003'); assert.notEqual(h.backend.raw().receipts.at(-1), retry.operationId);
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
    'in-place expected pin': h => { h.controller.state.pinnedId = 'task_0006'; },
    'in-place target updatedAt': h => { h.controller.state.records[3].updatedAt = '2026-10-18T00:00:00.000Z'; },
    'in-place target createdAt': h => { h.controller.state.records[3].createdAt = '2026-09-01T00:00:00.000Z'; },
    'in-place removedFrom': h => { h.controller.state.records[3].removedFrom = 'done'; },
    'wrong action label': (h, action) => { action.textContent = pinned ? 'Pin next' : 'Unpin'; },
    'wrong aria pressed': (h, action) => action.setAttribute('aria-pressed', String(!pinned)),
    'wrong aria label': (h, action) => action.setAttribute('aria-label', pinned ? 'Pin next' : 'Unpin'),
    'wrong action dataset': (h, action) => { action.dataset.taskAction = 'Complete'; },
    'wrong row pinned UI': h => row(h).classList.toggle('is-pinned', !pinned),
    'child action label': (h, action) => action.append(h.document.createElement('span'))
};
for (const [name, change] of Object.entries(denied)) pinTest(`pin rejects ${name} without creating a request or performing I/O`, async () => {
    const h = model({ pinned }); await settle();
    try { const action = pinButton(h); change(h, action); await rejectsWithoutIO(h, action); }
    finally { h.view.destroy(); }
});


const expandedLateChanges = {
    ...sourceChanges,
    restorationSession: h => { h.view.restorationSession = {}; },
    dialog: h => { h.view.dialogs.add({ close() {} }); },
    filterComposition: h => { h.view.filterComposing = true; },
    suspended: h => { h.backend.workspace._suspended = true; },
    pin: h => { h.controller.state.pinnedId = 'task_0006'; },
    updatedAt: h => { h.controller.state.records[3].updatedAt = '2026-10-18T00:00:00.000Z'; },
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
for (const [name, change] of Object.entries(expandedLateChanges)) pinTest(`final layout getter changing ${name} is rechecked before request creation`, async () => {
    const h = model({ pinned }); await settle(); let rootReads = 0;
    try {
        const action = pinButton(h), getStyle = h.window.getComputedStyle;
        h.window.getComputedStyle = node => {
            const style = getStyle(node);
            // Both action and title paths end at the document root. Change the
            // source on the final modeled layout read, after initial checks.
            if (node === h.document.documentElement && ++rootReads === 2) change(h);
            return style;
        };
        await rejectsWithoutIO(h, action); assert.equal(rootReads, name === 'pin' ? 3 : 2, 'second row layout read reached; a changed pin also checks visible conflict feedback');
    } finally { h.view.destroy(); }
});

for (const fields of [{ defaultPrevented: true }, { detail: 2 }, { repeat: true }, { isComposing: true }, { keyCode: 229 }]) pinTest(`pin rejects blocked activation ${JSON.stringify(fields)}`, async () => {
    const h = model({ pinned }); await settle();
    try {
        const action = pinButton(h), reads = h.backend.reads;
        action.dispatch('click', fields); await settle();
        assert.equal(h.backend.requests, 0); assert.equal(h.backend.writes, 0); assert.equal(h.backend.reads, reads);
    } finally { h.view.destroy(); }
});
for (const key of ['Enter', ' ']) pinTest(`pin ${JSON.stringify(key)} repeat and IME guard permits ordinary native-button activation`, async () => {
    const h = model({ pinned }); await settle();
    try {
        const action = pinButton(h);
        for (const fields of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) assert.equal(action.dispatch('keydown', { key, ...fields }).prevented, true);
        assert.equal(action.dispatch('keydown', { key }).prevented, false); assert.equal(h.backend.requests, 0);
        action.dispatch('click', { detail: 0 }); await settle(); assert.equal(h.backend.writes, 1);
    } finally { h.view.destroy(); }
});

for (const sessionMode of ['missing', 'wrong']) pinTest(`a workspace created with ${sessionMode} session remains unavailable after redraw`, async () => {
    const h = model({ pinned, sessionMode }); await settle();
    try { await rejectsWithoutIO(h, pinButton(h)); redraw(h); await rejectsWithoutIO(h, pinButton(h)); }
    finally { h.view.destroy(); }
});

    for (const locale of ['en', 'zh_CN', 'fallback']) pinTest(`original action semantics and independent draft survive ${locale}`, async () => {
        const h = model({ pinned, locale }); await settle();
        try {
            const label = locale === 'zh_CN' ? (pinned ? '取消置顶' : '设为下一项') : pinned ? 'Unpin' : 'Pin next';
            // Resolve the translated public label from the same shipped catalog.
            const catalog = locale === 'zh_CN' ? JSON.parse(fs.readFileSync(path.join(__dirname, '../_locales/zh_CN/messages.json'), 'utf8')) : null;
            const action = pinButton(h, 'task_0003', catalog ? catalog[pinned ? 'tasksUnpin' : 'tasksPin'].message : label);
            assert.equal(action.getAttribute('aria-pressed'), String(pinned));
            const actions = row(h).querySelector('.tasks-row-actions'); for (const sibling of [...actions.children]) if (sibling !== action) sibling.remove();
            input(h.view.input, '独立草稿'); h.view.input.focus(); h.view.input.dispatch('compositionstart'); action.dispatch('click'); await settle();
            assert.equal(h.backend.writes, 1); assert.equal(h.backend.raw().pinnedId, pinned ? null : 'task_0003');
            assert.equal(h.view.input.value, '独立草稿'); assert.equal(h.view.quickEntryComposing, true); assert.equal(h.document.activeElement, h.view.input);
            const next = pinButton(h, 'task_0003', catalog ? catalog[pinned ? 'tasksPin' : 'tasksUnpin'].message : pinned ? 'Pin next' : 'Unpin');
            assert.equal(next.getAttribute('aria-pressed'), String(!pinned)); assert.equal(row(h).classList.contains('is-pinned'), !pinned);
        } finally { h.view.destroy(); }
    });
    for (const id of ['task_0001', 'task_0009']) pinTest(`first and last active positions support explicit ${id} pin selection`, async () => {
        const h = model({ pinned }); await settle();
        try {
            h.view.more.dispatch('click');
            if (pinned) { const before = h.backend.raw(); await h.controller.action('pin', { id, version: before.records.find(task => task.id === id).version, expectedPin: before.pinnedId }); await settle(); }
            const before = h.backend.raw(), writes = h.backend.writes; pinButton(h, id).dispatch('click'); await settle();
            assert.equal(h.backend.writes, writes + 1); assert.equal(h.backend.raw().pinnedId, pinned ? null : id); assert.deepEqual(h.backend.raw().records, before.records);
        } finally { h.view.destroy(); }
    });
    pinTest('real delayed pin preserves the exact pending request and independent newer draft and focus', async () => {
        const h = model({ pinned }); await settle(); const gate = deferred();
        try {
            h.backend.delay = gate.promise; const action = pinButton(h); action.focus(); action.dispatch('click'); await settle();
            const request = h.controller.retryCommand; assert.equal(h.controller.status, 'saving'); assert.equal(h.backend.writes, 1);
            action.dispatch('click'); pinButton(h, 'task_0004').dispatch('click'); assert.strictEqual(h.controller.retryCommand, request); assert.equal(h.backend.requests, 1);
            input(h.view.input, 'later draft'); h.search.focus(); gate.resolve(); await settle();
            assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, 1); assert.equal(h.document.activeElement, h.search); assert.equal(h.view.input.value, 'later draft');
        } finally { gate.resolve(); h.view.destroy(); }
    });
    for (const mode of ['READ', 'false', 'drop', 'ack']) for (const change of ['object', 'id', 'generation', 'session', 'store', 'backend', 'controller']) pinTest(`original ${mode} Retry rejects changed ${change} and restores exact command at original source`, async () => {
        const h = model({ pinned }), foreign = model({ pinned }); await settle(); h.backend.notifications = false; foreign.backend.notifications = false;
        try {
            failNext(h, mode); pinButton(h).dispatch('click'); await settle();
            const request = h.controller.retryCommand; assert.equal(request.kind, 'pin'); assert.equal(h.controller.error.code, errorCode(mode)); h.backend.mode = null;
            const workspace = h.backend.workspace, id = workspace.id, generation = workspace.generation, session = h.window.LocalItabWorkspaces.session;
            foreign.backend.workspace = workspace; foreign.window.LocalItabWorkspaces.session = workspace;
            let destination = h.backend;
            if (change === 'store') { h.controller.store = foreign.store; destination = foreign.backend; }
            else if (change === 'backend') { h.store.backend = foreign.backend; destination = foreign.backend; }
            else if (change === 'controller') h.view.controller = { ...h.controller };
            else sourceChanges[change](h);
            const before = destination.raw(), reads = destination.reads, writes = destination.writes;
            const original = h.backend.raw(), ownReads = h.backend.reads, ownWrites = h.backend.writes;
            h.view.retry.dispatch('click'); await settle();
            assert.equal(destination.reads, reads); assert.equal(destination.writes, writes); assert.deepEqual(destination.raw(), before);
            assert.equal(h.backend.reads, ownReads); assert.equal(h.backend.writes, ownWrites); assert.deepEqual(h.backend.raw(), original); assert.strictEqual(h.controller.retryCommand, request);
            h.view.controller = h.controller; h.controller.store = h.store; h.store.backend = h.backend; h.backend.workspace = workspace;
            workspace.id = id; workspace.generation = generation; h.window.LocalItabWorkspaces.session = session;
            const priorWrites = h.backend.writes; h.view.retry.dispatch('click'); await settle();
            assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, priorWrites + (mode === 'ack' ? 0 : 1));
            assert.equal(h.backend.raw().pinnedId, pinned ? null : 'task_0003'); assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
        } finally { h.view.controller = h.controller; h.controller.store = h.store; h.store.backend = h.backend; h.view.destroy(); foreign.view.destroy(); }
    });
    pinTest('latest acknowledged receipt confirms after reload, filter and row replacement with zero new writes', async () => {
        const h = model({ pinned }); await settle(); h.backend.notifications = false;
        try {
            h.backend.mode = 'ack'; pinButton(h).dispatch('click'); await settle(); const request = h.controller.retryCommand, after = h.backend.raw();
            h.backend.mode = null; await h.controller.refresh(); redraw(h); input(h.view.filterInput, 'duplicate');
            input(h.view.input, 'draft while acknowledging'); h.view.input.focus(); const reads = h.backend.reads;
            h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved'); assert.equal(h.controller.retryCommand, null);
            assert.equal(h.backend.writes, 1); assert(h.backend.reads > reads); assert.deepEqual(h.backend.raw(), after); assert.equal(after.receipts.at(-1), request.operationId);
            assert.equal(h.view.input.value, 'draft while acknowledging'); assert.equal(h.document.activeElement, h.view.input);
        } finally { h.view.destroy(); }
    });
    for (const mode of ['READ', 'false', 'drop']) pinTest(`uncommitted ${mode} Retry merges an unrelated latest edit while original expectedPin stays unchanged`, async () => {
        const h = model({ pinned }); await settle(); h.backend.notifications = false;
        try {
            failNext(h, mode); pinButton(h).dispatch('click'); await settle(); const request = h.controller.retryCommand; h.backend.mode = null;
            const before = h.backend.raw(); await h.remote.mutate(command(h.remote, 'edit', before.records[4], { text: 'new unrelated synthetic record' }));
            const edited = h.backend.raw().records[4]; await h.controller.refresh(); redraw(h); assert.strictEqual(h.controller.retryCommand, request);
            const writes = h.backend.writes; h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes + 1);
            assert.equal(h.backend.raw().pinnedId, pinned ? null : 'task_0003'); assert.deepEqual(h.backend.raw().records[4], edited); assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
        } finally { h.view.destroy(); }
    });
    for (const mode of ['READ', 'false', 'drop', 'ack']) pinTest(`original ${mode} Retry reaches Store and conflicts without writes after a changed expectedPin`, async () => {
        const h = model({ pinned }); await settle(); h.backend.notifications = false;
        try {
            failNext(h, mode); pinButton(h).dispatch('click'); await settle(); const request = h.controller.retryCommand; h.backend.mode = null;
            const before = h.backend.raw(); await h.remote.mutate(command(h.remote, 'pin', before.records[6], { expectedPin: before.pinnedId }));
            await h.controller.refresh(); redraw(h); const latest = h.backend.raw(), reads = h.backend.reads, writes = h.backend.writes;
            h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.error.code, 'CONFLICT'); assert(h.backend.reads > reads);
            assert.equal(h.backend.writes, writes); assert.deepEqual(h.backend.raw(), latest); assert.strictEqual(h.controller.retryCommand, request);
        } finally { h.view.destroy(); }
    });
    pinTest('acknowledged receipt followed by unrelated edit conflicts through Store even with unchanged resulting pin', async () => {
        const h = model({ pinned }); await settle(); h.backend.notifications = false;
        try {
            h.backend.mode = 'ack'; pinButton(h).dispatch('click'); await settle(); const request = h.controller.retryCommand; h.backend.mode = null;
            const before = h.backend.raw(); await h.remote.mutate(command(h.remote, 'edit', before.records[4], { text: 'later unrelated edit' }));
            await h.controller.refresh(); redraw(h); const latest = h.backend.raw(), reads = h.backend.reads, writes = h.backend.writes;
            h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.error.code, 'CONFLICT'); assert(h.backend.reads > reads);
            assert.equal(h.backend.writes, writes); assert.deepEqual(h.backend.raw(), latest); assert.strictEqual(h.controller.retryCommand, request);
        } finally { h.view.destroy(); }
    });

for (const mode of ['READ', 'false', 'drop', 'ack']) pinTest(`legacy ${mode} Retry stays available after temporary unavailability and nullish source restoration`, async () => {
    const h = model({ pinned, legacy: true }); await settle(); h.backend.notifications = false;
    try {
        failNext(h, mode); pinButton(h).dispatch('click'); await settle(); const request = h.controller.retryCommand;
        h.backend.mode = null; h.backend.workspace = { invalidated: true };
        const reads = h.backend.reads, writes = h.backend.writes; h.view.retry.dispatch('click'); await settle();
        assert.equal(h.backend.reads, reads); assert.equal(h.backend.writes, writes); assert.strictEqual(h.controller.retryCommand, request);
        h.backend.workspace = null; h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved');
        assert.equal(h.backend.writes, writes + (mode === 'ack' ? 0 : 1)); assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
    } finally { h.view.destroy(); }
});

pinTest('original anonymous availability object without a workspace service retains current-row pin choice', async () => {
    const h = model({ pinned, legacyAvailability: true }); await settle();
    try {
        assert.equal(h.window.LocalItabWorkspaces, undefined); assert.equal(h.backend.workspace.id, undefined); assert.equal(h.backend.workspace.generation, undefined);
        const before = h.backend.raw(); input(h.view.input, 'legacy availability draft'); h.view.input.focus();
        pinButton(h).dispatch('click'); await settle();
        assert.equal(h.backend.writes, 1); assert.equal(h.backend.raw().pinnedId, pinned ? null : 'task_0003');
        assert.deepEqual(h.backend.raw().records, before.records); assert.deepEqual(h.backend.raw().recovery, before.recovery);
        assert.equal(h.view.input.value, 'legacy availability draft'); assert.equal(h.document.activeElement, h.view.input);
    } finally { h.view.destroy(); }
});

for (const mode of ['READ', 'false', 'drop', 'ack']) pinTest(`original anonymous availability object retains same-source ${mode} Retry`, async () => {
    const h = model({ pinned, legacyAvailability: true }); await settle(); h.backend.notifications = false;
    try {
        failNext(h, mode); pinButton(h).dispatch('click'); await settle();
        assert.equal(h.controller.error.code, errorCode(mode)); const request = h.controller.retryCommand;
        h.backend.mode = null; await h.controller.refresh(); redraw(h); const writes = h.backend.writes;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved');
        assert.equal(h.backend.writes, writes + (mode === 'ack' ? 0 : 1)); assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
        assert.equal(h.backend.raw().pinnedId, pinned ? null : 'task_0003');
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
for (const [name, change] of Object.entries(availabilityChanges)) for (const freshRow of [false, true]) pinTest(`anonymous availability rejects ${name} (${freshRow ? 'redrawn' : 'original'} row)`, async () => {
    const h = model({ pinned, legacyAvailability: true }); await settle();
    try {
        let action = pinButton(h); change(h);
        if (freshRow) { redraw(h); action = pinButton(h); }
        await rejectsWithoutIO(h, action);
    } finally { h.view.destroy(); }
});

for (const [name, change] of Object.entries(availabilityChanges)) for (const mode of ['READ', 'false', 'drop', 'ack']) pinTest(`anonymous availability ${mode} Retry rejects ${name} until the original source returns`, async () => {
    const h = model({ pinned, legacyAvailability: true }); await settle(); h.backend.notifications = false;
    try {
        const availability = h.backend.workspace;
        failNext(h, mode); pinButton(h).dispatch('click'); await settle();
        const request = h.controller.retryCommand; assert.equal(request.kind, 'pin'); h.backend.mode = null; change(h);
        const before = h.backend.raw(), reads = h.backend.reads, writes = h.backend.writes;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.backend.reads, reads); assert.equal(h.backend.writes, writes);
        assert.deepEqual(h.backend.raw(), before); assert.strictEqual(h.controller.retryCommand, request);
        h.backend.workspace = availability; delete availability.id; delete availability.generation;
        availability.invalidated = false; availability._suspended = false; delete h.window.LocalItabWorkspaces;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved');
        assert.equal(h.backend.writes, writes + (mode === 'ack' ? 0 : 1)); assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
    } finally { h.view.destroy(); }
});

pinTest('identified workspace without any service is never treated as an anonymous availability object', async () => {
    const h = model({ pinned, sessionMode: 'absent' }); await settle();
    try {
        await rejectsWithoutIO(h, pinButton(h)); redraw(h); await rejectsWithoutIO(h, pinButton(h));
        h.window.LocalItabWorkspaces = { session: h.backend.workspace }; redraw(h); await rejectsWithoutIO(h, pinButton(h));
    } finally { h.view.destroy(); }
});

    for (const identityMode of ['full', 'id-only', 'generation-only']) for (const sessionMode of ['absent', 'missing', 'wrong']) pinTest(`${identityMode} source never adopts a repaired ${sessionMode} session`, async () => {
        const h = model({ pinned, identityMode, sessionMode }); await settle();
        try {
            await rejectsWithoutIO(h, pinButton(h)); redraw(h); await rejectsWithoutIO(h, pinButton(h));
            h.window.LocalItabWorkspaces = { session: h.backend.workspace }; redraw(h); await rejectsWithoutIO(h, pinButton(h));
        } finally { h.view.destroy(); }
    });
    for (const identity of ['target', 'currentTarget']) pinTest(`foreign event ${identity} cannot activate the original action`, async () => {
        const h = model({ pinned }); await settle();
        try {
            const action = pinButton(h), reads = h.backend.reads;
            action.dispatch('click', { [identity]: h.document.createElement('span') }); await settle();
            assert.equal(h.backend.reads, reads); assert.equal(h.backend.writes, 0); assert.equal(h.backend.requests, 0);
        } finally { h.view.destroy(); }
    });
    for (const property of ['hidden', 'filter']) for (const change of ['pending', 'state', 'pin']) pinTest(`final ${property} getter cannot conceal late ${change} state`, async () => {
        const h = model({ pinned }); await settle(); let reads = 0;
        try {
            const action = pinButton(h), target = property === 'hidden' ? h.document : h.view.filterInput;
            const key = property === 'hidden' ? 'hidden' : 'value', value = property === 'hidden' ? false : '';
            Object.defineProperty(target, key, { configurable: true, get() {
                if (++reads === 3) {
                    if (change === 'pending') h.controller.pending = Promise.resolve();
                    else if (change === 'pin') h.controller.state.pinnedId = 'task_0006';
                    else h.controller.state = { ...h.controller.state, records: h.controller.state.records.filter(task => task.id !== 'task_0003') };
                }
                return value;
            } });
            await rejectsWithoutIO(h, action); assert(reads >= 3, 'final post-layout page/filter getter reached');
        } finally { h.view.destroy(); }
    });
    for (const locale of ['en', 'zh_CN', 'fallback']) pinTest(`stale expectedPin gives exact visible ${locale} conflict feedback without simulating a Controller failure`, async () => {
        const h = model({ pinned, locale }); await settle();
        try {
            const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../_locales', locale === 'fallback' ? 'en' : locale, 'messages.json'), 'utf8'));
            const action = pinButton(h, 'task_0003', catalog[pinned ? 'tasksUnpin' : 'tasksPin'].message), before = h.backend.raw();
            await h.controller.action('pin', { id: 'task_0006', version: before.records[6].version, expectedPin: before.pinnedId }); await settle();
            const saved = h.controller.state, error = h.controller.error, retry = h.controller.retryCommand, status = h.controller.status, undo = h.view.undo;
            await rejectsWithoutIO(h, action);
            assert.strictEqual(h.controller.state, saved); assert.strictEqual(h.controller.error, error); assert.strictEqual(h.controller.retryCommand, retry);
            assert.equal(h.controller.status, status); assert.strictEqual(h.view.undo, undo); assert.equal(h.view.localError, null);
            assert.equal(h.view.status.textContent, catalog.tasksConflict.message); assert.equal(h.view.feedback.classList.contains('is-error'), true);
            assert.equal(h.view.status.getAttribute('role'), 'status'); assert.equal(h.view.status.getAttribute('aria-live'), 'polite');
            assert.equal(h.view.retry.hidden, true); assert(h.view.status.getClientRects().length); assert.equal(h.view.status.isConnected, true);
            pinButton(h, 'task_0003', catalog.tasksPin.message).dispatch('click'); await settle();
            assert.equal(h.backend.raw().pinnedId, 'task_0003'); assert.equal(h.controller.status, 'saved'); assert.equal(h.view.feedback.classList.contains('is-error'), false);
            assert.notEqual(h.view.status.textContent, catalog.tasksConflict.message);
        } finally { h.view.destroy(); }
    });
    const feedbackChanges = {
        source: h => sourceChanges.object(h),
        pending: h => { h.controller.pending = Promise.resolve(); },
        error: h => { h.controller.error = tasks.fault('WRITE'); },
        receipt: h => { h.controller.retryCommand = h.store.request('enable', { enabled: false }); },
        localError: h => { h.view.localError = tasks.fault('FILE'); },
        dialog: h => { h.view.dialogs.add({ close() {} }); },
        departure: h => { h.window.LocalItabContentLifecycle.departing = true; },
        hidden: h => { h.host.hidden = true; },
        statusReplaced: h => h.view.status.replaceWith(h.document.createElement('span')),
        statusProperty: h => { h.view.status = h.document.createElement('span'); },
        feedbackProperty: h => { h.view.feedback = h.document.createElement('div'); },
        feedbackReparented: h => { h.view.feedback.remove(); h.document.body.append(h.view.feedback); },
        statusHidden: h => { h.view.status.hidden = true; },
        statusAriaHidden: h => h.view.status.setAttribute('aria-hidden', 'true')
    };
    for (const [name, change] of Object.entries(feedbackChanges)) pinTest(`stale conflict must not replace feedback during ${name}`, async () => {
        const h = model({ pinned }); await settle();
        try {
            const action = pinButton(h), before = h.backend.raw();
            await h.controller.action('pin', { id: 'task_0006', version: before.records[6].version, expectedPin: before.pinnedId }); await settle();
            const displayed = h.view.status; displayed.textContent = 'original visible feedback'; change(h);
            const error = h.controller.error, retry = h.controller.retryCommand, localError = h.view.localError, status = h.controller.status;
            await rejectsWithoutIO(h, action); assert.equal(displayed.textContent, 'original visible feedback');
            assert.strictEqual(h.controller.error, error); assert.strictEqual(h.controller.retryCommand, retry); assert.strictEqual(h.view.localError, localError); assert.equal(h.controller.status, status);
        } finally { h.view.destroy(); }
    });
    pinTest('pin preserves existing Undo, active order and independent draft', async () => {
        const h = model({ pinned }); await settle();
        try {
            button(row(h, 'task_0006'), 'Remove').dispatch('click'); await settle(); const undo = h.view.undo, before = h.backend.raw();
            input(h.view.input, 'independent draft'); h.view.input.focus(); pinButton(h).dispatch('click'); await settle();
            assert.strictEqual(h.view.undo, undo); assert.equal(h.view.undoButton.hidden, false); assert.deepEqual(h.backend.raw().records, before.records);
            assert.equal(h.backend.raw().pinnedId, pinned ? null : 'task_0003'); assert.equal(h.view.input.value, 'independent draft'); assert.equal(h.document.activeElement, h.view.input);
            h.view.undoButton.dispatch('click'); await settle(); assert.equal(h.backend.raw().records.find(task => task.id === undo.id).state, 'active');
        } finally { h.view.destroy(); }
    });
    pinTest('pending old copy result is invalidated by pin without replacing newer focus', async () => {
        const h = model({ pinned }); await settle(); const gate = deferred(), calls = [];
        try {
            h.view.clipboard = { writeText(text) { calls.push(text); return gate.promise; } };
            pinButton(h); const oldStatus = row(h).querySelector('.tasks-row-copy-status'); button(row(h), 'Copy text').dispatch('click'); assert.equal(calls.length, 1);
            pinButton(h).dispatch('click'); await settle(); h.search.focus(); gate.resolve(); await settle();
            assert.equal(h.backend.writes, 1); assert.equal(oldStatus.hidden, true); assert.equal(oldStatus.textContent, ''); assert.equal(h.document.activeElement, h.search);
        } finally { gate.resolve(); h.view.destroy(); }
    });
    const latePresentationChanges = {
        label: (h, action) => { action.textContent = pinned ? 'Pin next' : 'Unpin'; },
        pressed: (h, action) => action.setAttribute('aria-pressed', String(!pinned)),
        ariaLabel: (h, action) => action.setAttribute('aria-label', 'changed direction'),
        rowPinClass: h => row(h).classList.toggle('is-pinned', !pinned)
    };
    for (const [name, change] of Object.entries(latePresentationChanges)) pinTest(`final row layout cannot hide changed ${name} semantics`, async () => {
        const h = model({ pinned }); await settle(); let reads = 0;
        try {
            const action = pinButton(h), getStyle = h.window.getComputedStyle;
            h.window.getComputedStyle = node => { const style = getStyle(node); if (node === h.document.documentElement && ++reads === 2) change(h, action); return style; };
            await rejectsWithoutIO(h, action); assert.equal(reads, 2);
        } finally { h.view.destroy(); }
    });
    for (const change of ['source', 'pending', 'statusProperty', 'feedbackReparented']) pinTest(`last feedback layout check rejects late ${change} without publishing a conflict`, async () => {
        const h = model({ pinned }); await settle(); let reads = 0;
        try {
            const action = pinButton(h), before = h.backend.raw();
            await h.controller.action('pin', { id: 'task_0006', version: before.records[6].version, expectedPin: before.pinnedId }); await settle();
            const displayed = h.view.status, getStyle = h.window.getComputedStyle; displayed.textContent = 'original visible feedback';
            const originalWorkspace = h.backend.workspace, originalSession = h.window.LocalItabWorkspaces.session, originalData = h.backend.raw();
            const replacementWorkspace = { ...originalWorkspace }; h.backend.workspace = replacementWorkspace;
            const replacementData = h.backend.raw(); h.backend.workspace = originalWorkspace;
            assert.notDeepEqual(originalData, replacementData, 'independent replacement retains its own initial data');
            const io = { reads: h.backend.reads, writes: h.backend.writes, requests: h.backend.requests };
            h.window.getComputedStyle = node => {
                const style = getStyle(node);
                if (node === h.document.documentElement && ++reads === 1) {
                    if (change === 'source') { h.backend.workspace = replacementWorkspace; h.window.LocalItabWorkspaces.session = replacementWorkspace; }
                    else feedbackChanges[change](h);
                }
                return style;
            };
            action.dispatch('click'); await settle();
            assert.deepEqual({ reads: h.backend.reads, writes: h.backend.writes, requests: h.backend.requests }, io, 'late feedback rejection performs no I/O');
            if (change === 'source') assert.deepEqual(h.backend.raw(), replacementData, 'replacement storage stays unchanged');
            h.backend.workspace = originalWorkspace; h.window.LocalItabWorkspaces.session = originalSession;
            assert.deepEqual(h.backend.raw(), originalData, 'original storage stays unchanged');
            h.backend.workspace = replacementWorkspace; assert.deepEqual(h.backend.raw(), replacementData, 'independent replacement stays unchanged');
            h.backend.workspace = originalWorkspace;
            assert.equal(reads, 1); assert.equal(displayed.textContent, 'original visible feedback');
        } finally { h.view.destroy(); }
    });
}
