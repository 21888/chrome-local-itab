const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { createDocument } = require('./helpers/task-dom-model.js');
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
    view.completed.box.open = true;
    return { backend, store, remote, controller, document, host, search, window, view };
}

const row = (h, id = 'task_0000') => h.view.completed.list.querySelectorAll('[data-task-id]').find(node => node.dataset.taskId === id);
function reopenButton(h, id = 'task_0000') {
    const item = row(h, id); assert(item, `rendered completed row ${id}`);
    const action = item.querySelector('.tasks-check'); assert.equal(action.textContent, '↶'); return action;
}
const input = (node, value) => { node.value = value; node.dispatch('input'); };
const command = (store, kind, record, values = {}) => store.request(kind, { id: record.id, version: record.version, ...values });
function redraw(h) { h.view.renderedRevision = -1; h.view.render(); }
const io = h => ({ reads: h.backend.reads, writes: h.backend.writes, requests: h.backend.requests });
async function rejectsWithoutIO(h, action, fields = {}) {
    const before = h.backend.raw(), counts = io(h);
    action.dispatch('click', fields); await settle();
    assert.deepEqual(io(h), counts, `rejected row reopen must have zero I/O ${JSON.stringify({ before: counts, after: io(h) })}`);
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
function restoreSource(h, workspace) {
    h.view.controller = h.controller; h.controller.store = h.store; h.store.backend = h.backend;
    h.backend.workspace = workspace; h.window.LocalItabWorkspaces.session = workspace;
}

// Frozen before production edits: real Store/Controller, modeled synthetic DOM only.
for (const filtered of [false, true]) test(`RED: current open completed row ${filtered ? 'with matching filter and independent IME draft' : 'without filter'} reopens once`, async () => {
    const h = model(); await settle();
    try {
        if (filtered) { input(h.view.filterInput, '  SYNTHETIC TASK 0  '); input(h.view.input, '独立草稿'); h.view.input.focus(); h.view.input.dispatch('compositionstart'); }
        const before = h.backend.raw(); reopenButton(h).dispatch('click'); await settle();
        const after = h.backend.raw(); assert.equal(h.backend.writes, 1); assert.equal(after.records[0].state, 'active');
        assert.equal(after.pinnedId, before.pinnedId); assert.deepEqual(after.recovery, before.recovery);
        assert.deepEqual(after.records.filter(r => r.id !== 'task_0000'), before.records.filter(r => r.id !== 'task_0000'));
        assert.equal(after.records[0].text, before.records[0].text); assert.equal(h.view.undo, null);
        if (filtered) { assert.equal(h.view.filterInput.value, '  SYNTHETIC TASK 0  '); assert.equal(h.view.input.value, '独立草稿'); assert.equal(h.view.quickEntryComposing, true); assert.equal(h.document.activeElement, h.view.input); }
    } finally { h.view.destroy(); }
});
test('RED: construction source cannot change before first asynchronous row render', async () => {
    const h = model(), workspace = h.backend.workspace, session = h.window.LocalItabWorkspaces.session;
    try {
        sourceChanges.object(h); await settle(); const counts = io(h), before = h.backend.raw();
        // A changed construction source is rejected before rows gain authority.
        assert.equal(h.host.querySelectorAll('[data-task-id]').length, 0); assert.equal(h.view.renderedRevision, undefined);
        assert.equal(counts.requests, 0); assert.equal(counts.writes, 0);
        h.view.render(); await settle(); assert.deepEqual(io(h), counts); assert.deepEqual(h.backend.raw(), before);
        h.backend.workspace = workspace; h.window.LocalItabWorkspaces.session = session; await h.controller.refresh(); await settle();
        const original = h.backend.raw(); reopenButton(h).dispatch('click'); await settle(); const after = h.backend.raw();
        assert.equal(h.backend.writes, counts.writes + 1); assert.equal(h.backend.requests, counts.requests + 1); assert.equal(h.controller.status, 'saved');
        assert.equal(after.records[0].state, 'active'); assert.equal(after.records[0].text, original.records[0].text); assert.equal(h.view.undo, null);
        assert.deepEqual(after.records.filter(record => record.id !== 'task_0000'), original.records.filter(record => record.id !== 'task_0000'));
        assert.deepEqual(after.records.map(record => record.id), original.records.map(record => record.id)); assert.equal(after.pinnedId, original.pinnedId); assert.deepEqual(after.recovery, original.recovery);
    } finally { h.backend.workspace = workspace; h.window.LocalItabWorkspaces.session = session; h.view.destroy(); }
});
for (const [name, change] of Object.entries(sourceChanges)) test(`RED: fresh redraw cannot adopt replacement workspace ${name}`, async () => {
    const h = model(); await settle();
    try { change(h); redraw(h); await rejectsWithoutIO(h, reopenButton(h)); }
    finally { h.view.destroy(); }
});
for (const change of ['backend', 'store']) for (const fresh of [false, true]) test(`RED: ${change} has independent data with same workspace; reject ${fresh ? 'redrawn' : 'old'} row`, async () => {
    const h = model(), foreign = model(); await settle();
    try {
        foreign.backend.workspace = h.backend.workspace; foreign.window.LocalItabWorkspaces.session = h.backend.workspace;
        assert.deepEqual(foreign.backend.raw(), h.backend.raw()); let action = reopenButton(h);
        if (change === 'store') h.controller.store = foreign.store; else h.store.backend = foreign.backend;
        if (fresh) { redraw(h); action = reopenButton(h); }
        const before = foreign.backend.raw(), ownCounts = io(h), foreignCounts = io(foreign);
        action.dispatch('click'); await settle();
        assert.deepEqual({ own: io(h), foreign: io(foreign) }, { own: ownCounts, foreign: foreignCounts }, `replacement must have zero I/O ${JSON.stringify({ own: [ownCounts, io(h)], foreign: [foreignCounts, io(foreign)] })}`);
        assert.deepEqual(foreign.backend.raw(), before);
    } finally { restoreSource(h, h.backend.workspace); h.view.destroy(); foreign.view.destroy(); }
});
test('RED: controller replacement cannot own a freshly drawn row', async () => {
    const h = model(); await settle(); const other = new Controller(h.store); await other.refresh();
    try { h.view.controller = other; redraw(h); await rejectsWithoutIO(h, reopenButton(h)); }
    finally { h.view.controller = h.controller; other.destroy(); h.view.destroy(); }
});
test('RED: perfect reattachment of entire old row cannot revive original reopen callback', async () => {
    const h = model(); await settle();
    try { const old = row(h), action = reopenButton(h); redraw(h); row(h).replaceWith(old); assert.equal(old.isConnected, true); await rejectsWithoutIO(h, action); }
    finally { h.view.destroy(); }
});
for (const [mode, change] of [['READ', 'workspace'], ['false', 'workspace'], ['drop', 'workspace'], ['ack', 'workspace'], ['ack', 'store'], ['ack', 'backend']]) test(`RED: original ${mode} row Retry rejects ${change} replacement and resumes only at original source`, async () => {
    const h = model(), foreign = model(); await settle(); h.backend.notifications = false;
    const workspace = h.backend.workspace;
    try {
        failNext(h, mode); reopenButton(h).dispatch('click'); await settle();
        const request = h.controller.retryCommand; assert.equal(request.kind, 'reopen'); assert.equal(request.version, initial().records[0].version);
        assert.equal(h.controller.error.code, errorCode(mode)); h.backend.mode = null;
        foreign.backend.workspace = workspace; foreign.window.LocalItabWorkspaces.session = workspace;
        let destination = h;
        if (change === 'workspace') sourceChanges.object(h);
        else if (change === 'store') { h.controller.store = foreign.store; destination = foreign; }
        else { h.store.backend = foreign.backend; destination = foreign; }
        const before = destination.backend.raw(), ownCounts = io(h), destinationCounts = io(destination);
        h.view.retry.dispatch('click'); await settle();
        assert.deepEqual({ own: io(h), destination: io(destination) }, { own: ownCounts, destination: destinationCounts }, `original Retry source changed ${JSON.stringify({ own: [ownCounts, io(h)], destination: [destinationCounts, io(destination)] })}`);
        assert.deepEqual(destination.backend.raw(), before); assert.strictEqual(h.controller.retryCommand, request);
        restoreSource(h, workspace); const writes = h.backend.writes;
        h.view.retry.dispatch('click'); await settle();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes + (mode === 'ack' ? 0 : 1));
        assert.equal(h.backend.raw().receipts.at(-1), request.operationId); assert.equal(h.backend.raw().records[0].state, 'active');
    } finally { restoreSource(h, workspace); h.view.destroy(); foreign.view.destroy(); }
});
for (const mode of ['READ', 'false', 'drop', 'ack']) test(`RED: unresolved ${mode} preserves original row Retry and error against old or another new reopen`, async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        const old = reopenButton(h); failNext(h, mode); old.dispatch('click'); await settle();
        const request = h.controller.retryCommand, error = h.controller.error; assert.equal(error.code, errorCode(mode)); h.backend.mode = null;
        await rejectsWithoutIO(h, old); await h.controller.refresh(); redraw(h);
        if (mode !== 'ack') await rejectsWithoutIO(h, reopenButton(h));
        await rejectsWithoutIO(h, reopenButton(h, 'task_0005'));
        assert.strictEqual(h.controller.retryCommand, request); assert.strictEqual(h.controller.error, error);
        const writes = h.backend.writes; h.view.retry.dispatch('click'); await settle();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes + (mode === 'ack' ? 0 : 1)); assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
    } finally { h.view.destroy(); }
});
function activeComplete(h, id = 'task_0003') {
    return h.view.list.querySelectorAll('[data-task-id]').find(node => node.dataset.taskId === id).querySelector('.tasks-check');
}
test('RED: original Undo completion pending failure and exact Retry keep existing path', async () => {
    for (const mode of ['READ', 'false', 'drop', 'ack']) {
        const h = model(); await settle(); h.backend.notifications = false;
        try {
            activeComplete(h).dispatch('click'); await settle(); const savedUndo = h.view.undo;
            assert.equal(savedUndo.id, 'task_0003'); failNext(h, mode);
            let release;
            if (mode !== 'READ') h.backend.delay = new Promise(resolve => { release = resolve; });
            h.view.undoButton.dispatch('click'); await tick();
            if (release) { assert(h.controller.pending, 'Undo stays pending before failed write resolves'); release(); }
            await settle(); h.backend.delay = null;
            const original = h.controller.retryCommand; assert.equal(original.kind, 'reopen'); assert.equal(h.controller.error.code, errorCode(mode));
            h.backend.mode = null;
            // Undo rejects a changed session, independently of the older row attempt.
            const undoSource = { controller: h.view.controller, store: h.controller.store, backend: h.store.backend, host: h.view.host,
                workspace: h.backend.workspace, id: h.backend.workspace?.id, generation: h.backend.workspace?.generation, session: h.window.LocalItabWorkspaces.session };
            const gap = { io: { requests: h.backend.requests, reads: h.backend.reads, writes: h.backend.writes }, raw: h.backend.raw(), error: h.controller.error,
                retry: h.controller.retryCommand, state: h.controller.state, undo: h.view.undo, rowAttempt: h.view.rowReopenAttempt };
            h.window.LocalItabWorkspaces.session = {}; h.view.retry.dispatch('click'); await settle();
            assert.deepEqual({ requests: h.backend.requests, reads: h.backend.reads, writes: h.backend.writes }, gap.io); assert.deepEqual(h.backend.raw(), gap.raw);
            assert.strictEqual(h.controller.error, gap.error); assert.strictEqual(h.controller.retryCommand, gap.retry); assert.strictEqual(h.controller.state, gap.state);
            assert.strictEqual(h.view.undo, gap.undo); assert.strictEqual(h.view.rowReopenAttempt, gap.rowAttempt);
            h.window.LocalItabWorkspaces.session = undoSource.session;
            // Invalidate only the row's section wrapper; keep the original Undo source and DOM.
            const section = h.view.completed, nodes = h.host.querySelectorAll('*'), draft = h.view.input.value, focused = h.document.activeElement;
            h.view.completed = { ...section };
            assert.strictEqual(h.view.completed.box, section.box); assert.strictEqual(h.view.completed.summary, section.summary); assert.strictEqual(h.view.completed.list, section.list);
            assert.equal(h.host.querySelectorAll('*').length, nodes.length); assert(h.host.querySelectorAll('*').every((node, index) => node === nodes[index]));
            assert.equal(h.view.input.value, draft); assert.strictEqual(h.document.activeElement, focused);
            assert.equal(h.view.rowReopenSourceCurrent(h.view.rowReopenOwner), false);
            assert.strictEqual(h.view.controller, undoSource.controller); assert.strictEqual(h.controller.store, undoSource.store); assert.strictEqual(h.store.backend, undoSource.backend);
            assert.strictEqual(h.view.host, undoSource.host); assert.strictEqual(h.backend.workspace, undoSource.workspace);
            assert.equal(h.backend.workspace?.id, undoSource.id); assert.equal(h.backend.workspace?.generation, undoSource.generation); assert.strictEqual(h.window.LocalItabWorkspaces.session, undoSource.session);
            const writes = h.backend.writes, requests = h.backend.requests;
            h.view.retry.dispatch('click'); await settle();
            assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes + (mode === 'ack' ? 0 : 1));
            assert.equal(h.backend.requests, requests); assert.equal(h.backend.raw().receipts.at(-1), original.operationId);
            assert.equal(h.backend.raw().records[3].state, 'active'); assert.equal(h.view.undo, null);
        } finally { h.view.destroy(); }
    }
});
test('RED: prior row attempt cannot claim subsequent Undo command merely because both kinds are reopen', async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        reopenButton(h).dispatch('click'); await settle();
        activeComplete(h).dispatch('click'); await settle();
        failNext(h, 'false'); h.view.undoButton.dispatch('click'); await settle();
        const original = h.controller.retryCommand; assert.equal(original.kind, 'reopen'); assert.equal(original.id, 'task_0003');
        h.backend.mode = null;
        // Undo rejects a changed session, independently of the older row attempt.
        const undoSource = { controller: h.view.controller, store: h.controller.store, backend: h.store.backend, host: h.view.host,
            workspace: h.backend.workspace, id: h.backend.workspace?.id, generation: h.backend.workspace?.generation, session: h.window.LocalItabWorkspaces.session };
        const gap = { io: { requests: h.backend.requests, reads: h.backend.reads, writes: h.backend.writes }, raw: h.backend.raw(), error: h.controller.error,
            retry: h.controller.retryCommand, state: h.controller.state, undo: h.view.undo, rowAttempt: h.view.rowReopenAttempt };
        h.window.LocalItabWorkspaces.session = {}; h.view.retry.dispatch('click'); await settle();
        assert.deepEqual({ requests: h.backend.requests, reads: h.backend.reads, writes: h.backend.writes }, gap.io); assert.deepEqual(h.backend.raw(), gap.raw);
        assert.strictEqual(h.controller.error, gap.error); assert.strictEqual(h.controller.retryCommand, gap.retry); assert.strictEqual(h.controller.state, gap.state);
        assert.strictEqual(h.view.undo, gap.undo); assert.strictEqual(h.view.rowReopenAttempt, gap.rowAttempt);
        h.window.LocalItabWorkspaces.session = undoSource.session;
        // Invalidate only the row's section wrapper; keep the original Undo source and DOM.
        const section = h.view.completed, nodes = h.host.querySelectorAll('*'), draft = h.view.input.value, focused = h.document.activeElement;
        h.view.completed = { ...section };
        assert.strictEqual(h.view.completed.box, section.box); assert.strictEqual(h.view.completed.summary, section.summary); assert.strictEqual(h.view.completed.list, section.list);
        assert.equal(h.host.querySelectorAll('*').length, nodes.length); assert(h.host.querySelectorAll('*').every((node, index) => node === nodes[index]));
        assert.equal(h.view.input.value, draft); assert.strictEqual(h.document.activeElement, focused);
        assert.equal(h.view.rowReopenSourceCurrent(h.view.rowReopenOwner), false);
        assert.strictEqual(h.view.controller, undoSource.controller); assert.strictEqual(h.controller.store, undoSource.store); assert.strictEqual(h.store.backend, undoSource.backend);
        assert.strictEqual(h.view.host, undoSource.host); assert.strictEqual(h.backend.workspace, undoSource.workspace);
        assert.equal(h.backend.workspace?.id, undoSource.id); assert.equal(h.backend.workspace?.generation, undoSource.generation); assert.strictEqual(h.window.LocalItabWorkspaces.session, undoSource.session);
        h.view.retry.dispatch('click'); await settle();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.raw().receipts.at(-1), original.operationId);
        assert.equal(h.backend.raw().records[3].state, 'active'); assert.equal(h.view.undo, null);
    } finally { h.view.destroy(); }
});

// Current-row coverage below supplements the immutable first RED snapshot.
const denied = {
    'closed completed section': h => { h.view.completed.box.open = false; },
    'hidden completed section': h => { h.view.completed.box.hidden = true; },
    'inert completed section': h => { h.view.completed.box.inert = true; },
    'replaced completed object': h => { h.view.completed = { ...h.view.completed }; },
    'replaced completed box': h => { h.view.completed.box = h.document.createElement('details'); h.view.completed.box.open = true; },
    'replaced completed summary': h => { h.view.completed.summary = h.document.createElement('summary'); },
    'detached completed summary': h => h.view.completed.summary.remove(),
    'detached completed section': h => h.view.completed.box.remove(),
    'missing done class': h => row(h).querySelector('.tasks-text').classList.remove('is-done'),
    'replaced filter container': h => { h.view.filter = h.document.createElement('div'); },
    'disabled property': (h, a) => { a.disabled = true; },
    'disabled attribute': (h, a) => a.setAttribute('disabled', ''),
    'aria-disabled action': (h, a) => a.setAttribute('aria-disabled', 'true'),
    'hidden action': (h, a) => { a.hidden = true; },
    'inert action': (h, a) => { a.inert = true; },
    'zero action rect': (h, a) => { a.getClientRects = () => []; },
    'zero title rect': h => { row(h).querySelector('.tasks-text').getClientRects = () => []; },
    'replaced action': (h, a) => { const replacement = h.document.createElement('button'); replacement.className = a.className; replacement.textContent = a.textContent; a.replaceWith(replacement); },
    'replaced row main': h => { const top = row(h).querySelector('.tasks-row-main'), replacement = h.document.createElement('div'); replacement.className = top.className; top.replaceWith(replacement); },
    'reparented action': (h, a) => { a.remove(); row(h).append(a); },
    'reparented title': h => { const title = row(h).querySelector('.tasks-text'); title.remove(); row(h).append(title); },
    'removed row': h => row(h).remove(),
    'changed row ID': h => { row(h).dataset.taskId = 'task_0004'; },
    'replaced view list': h => { h.view.completed.list = h.document.createElement('ul'); },
    'replaced filter input': h => { h.view.filterInput = h.document.createElement('input'); },
    'detached original filter input': h => h.view.filterInput.remove(),
    'disabled ancestor': h => { h.host.disabled = true; },
    'inert ancestor': h => { h.document.body.inert = true; },
    'style hidden ancestor': h => { h.document.body.style.visibility = 'collapse'; },
    'display none action': (h, a) => { a.style.display = 'none'; },
    'hidden title': h => { row(h).querySelector('.tasks-text').hidden = true; },
    'inert title': h => { row(h).querySelector('.tasks-text').inert = true; },
    'aria-hidden title': h => row(h).querySelector('.tasks-text').setAttribute('aria-hidden', 'true'),
    'hidden row top': h => { row(h).querySelector('.tasks-row-main').hidden = true; },
    'aria-hidden row top': h => row(h).querySelector('.tasks-row-main').setAttribute('aria-hidden', 'true'),
    'style-hidden title': h => { row(h).querySelector('.tasks-text').style.visibility = 'hidden'; },
    'display-none title': h => { row(h).querySelector('.tasks-text').style.display = 'none'; },
    'hidden host': h => { h.host.hidden = true; },
    'aria-hidden ancestor': h => h.document.body.setAttribute('aria-hidden', 'true'),
    'changed original text': h => { row(h).querySelector('.tasks-text').textContent = 'different synthetic task'; },
    'title child': h => row(h).querySelector('.tasks-text').append(h.document.createElement('span')),
    'replaced title': h => { const title = row(h).querySelector('.tasks-text'), replacement = h.document.createElement('span'); replacement.className = title.className; replacement.textContent = title.textContent; title.replaceWith(replacement); },
    'foreign title document': h => { row(h).querySelector('.tasks-text').ownerDocument = createDocument(); },
    'foreign action document': (h, a) => { a.ownerDocument = createDocument(); },
    'duplicate original ID before source': h => { const duplicate = h.document.createElement('li'); duplicate.dataset.taskId = 'task_0000'; h.view.completed.list.children.unshift(duplicate); duplicate.parentElement = h.view.completed.list; },
    'reparented mounted host': h => { const wrapper = h.document.createElement('div'); h.document.body.append(wrapper); h.host.remove(); wrapper.append(h.host); },
    'reparented mounted list': h => { const wrapper = h.document.createElement('div'); h.host.append(wrapper); h.view.completed.list.remove(); wrapper.append(h.view.completed.list); },
    'unapplied filter': h => { h.view.filterInput.value = 'duplicate'; },
    'filter composition': h => h.view.filterInput.dispatch('compositionstart'),
    'document hidden': h => { h.document.hidden = true; },
    'document visibility': h => { h.document.visibilityState = 'hidden'; },
    'closed controller': h => h.controller.destroy(),
    'pending review': h => { h.view.pendingReview = true; },
    'batch session': h => { h.view.batchSession = {}; },
    'reuse session': h => { h.view.reuseSession = {}; },
    'completion session': h => { h.view.completionSession = {}; },
    'restoration session': h => { h.view.restorationSession = {}; },
    'departure': h => { h.window.LocalItabContentLifecycle.departing = true; },
    'invalid workspace': h => { h.backend.workspace.invalidated = true; },
    'suspended workspace': h => { h.backend.workspace._suspended = true; },
    'wrong glyph': (h, a) => { a.textContent = '○'; },
    'wrong title': (h, a) => { a.title = 'Complete'; },
    'wrong aria label': (h, a) => a.setAttribute('aria-label', 'Complete: another text'),
    'wrong dataset': (h, a) => { a.dataset.taskAction = 'Complete'; },
    'child action label': (h, a) => a.append(h.document.createElement('span'))
};
for (const [name, change] of Object.entries(denied)) test(`row reopen rejects ${name} without requests or storage I/O`, async () => {
    const h = model(); await settle();
    try { const action = reopenButton(h); change(h, action); await rejectsWithoutIO(h, action); }
    finally { h.view.destroy(); }
});

const lateChanges = {
    sectionClosed: denied['closed completed section'], sectionHidden: denied['hidden completed section'],
    sectionInert: denied['inert completed section'], sectionObject: denied['replaced completed object'],
    sectionBox: denied['replaced completed box'], sectionSummary: denied['replaced completed summary'],
    summaryDetached: denied['detached completed summary'], sectionDetached: denied['detached completed section'],
    doneClass: denied['missing done class'], list: denied['replaced view list'], filterContainer: denied['replaced filter container'],
    filterInput: denied['replaced filter input'],
    controller(h) { h.view.controller = new Proxy(h.controller, {}); },
    store(h) { h.controller.store = new Proxy(h.store, {}); },
    backend(h) { h.store.backend = new Proxy(h.backend, {}); },
    ...sourceChanges,
    title: denied['changed original text'], titleReplacement: denied['replaced title'], actionReplacement: denied['replaced action'],
    mainReplacement: denied['replaced row main'], rowId: denied['changed row ID'], actionParent: denied['reparented action'],
    glyph: denied['wrong glyph'], actionTitle: denied['wrong title'], ariaLabel: denied['wrong aria label'], dataset: denied['wrong dataset'],
    titleChild: denied['title child'], actionChild: denied['child action label'], titleHidden: denied['hidden title'],
    inert: denied['inert ancestor'], hostHidden: denied['hidden host'], filter: denied['unapplied filter'],
    filterComposition: denied['filter composition'], hidden: denied['document hidden'], visibility: denied['document visibility'],
    suspended: denied['suspended workspace'], invalidated: denied['invalid workspace'], departure: denied.departure,
    pendingReview: denied['pending review'], restorationSession: denied['restoration session'],
    fullOldRowReattachment(h) { const old = row(h); redraw(h); row(h).replaceWith(old); },
    // Changing a current snapshot is adversarial input to the View, never a simulated Controller success.
    taskVersion(h) { h.controller.state.records[0].version = 'late_version'; },
    taskText(h) { h.controller.state.records[0].text = 'late changed text'; },
    taskState(h) { h.controller.state.records[0].state = 'active'; },
    taskCreatedAt(h) { h.controller.state.records[0].createdAt = '2026-09-01T00:00:00.000Z'; },
    taskUpdatedAt(h) { h.controller.state.records[0].updatedAt = '2026-10-18T00:00:00.000Z'; },
    taskRemovedFrom(h) { h.controller.state.records[0].removedFrom = 'done'; }
};
for (const [name, change] of Object.entries(lateChanges)) test(`row reopen reacquires ${name} after final modeled layout read`, async () => {
    const h = model(); await settle(); let rootReads = 0;
    try {
        const action = reopenButton(h), getStyle = h.window.getComputedStyle;
        h.window.getComputedStyle = node => { const result = getStyle(node); if (node === h.document.documentElement && ++rootReads === 2) change(h, action); return result; };
        await rejectsWithoutIO(h, action); assert.equal(rootReads, 2, 'mutation reached the final original-title ancestry layout lookup');
    } finally { h.view.destroy(); }
});
for (const [name, change] of Object.entries(sourceChanges)) for (const fresh of [false, true]) test(`row reopen original construction rejects ${name} source change on ${fresh ? 'fresh' : 'old'} row`, async () => {
    const h = model(); await settle();
    try { let action = reopenButton(h); change(h); if (fresh) { redraw(h); action = reopenButton(h); } await rejectsWithoutIO(h, action); }
    finally { h.view.destroy(); }
});
for (const change of ['expand', 'collapse', 'filter', 'rerender', 'dispose']) test(`whole old reopen row cannot revive after ${change}`, async () => {
    const h = model(); await settle();
    try {
        if (change === 'collapse') h.view.more.dispatch('click');
        const old = row(h), action = reopenButton(h), list = h.view.completed.list;
        if (change === 'expand' || change === 'collapse') h.view.more.dispatch('click');
        else if (change === 'filter') { input(h.view.filterInput, 'task 0'); h.view.filterClear.dispatch('click'); }
        else if (change === 'dispose') h.view.destroy(); else redraw(h);
        await rejectsWithoutIO(h, action); if (change === 'dispose') { old.remove(); list.append(old); } else row(h).replaceWith(old);
        assert.equal(old.isConnected, true); await rejectsWithoutIO(h, action);
    } finally { h.view.destroy(); }
});
for (const fields of [{ defaultPrevented: true }, { detail: 2 }, { repeat: true }, { isComposing: true }, { keyCode: 229 }, { target: {} }, { currentTarget: {} }]) test(`row reopen rejects invalid event ${JSON.stringify(fields)}`, async () => {
    const h = model(); await settle(); try { await rejectsWithoutIO(h, reopenButton(h), fields); } finally { h.view.destroy(); }
});
for (const key of ['Enter', ' ']) test(`reopen ${JSON.stringify(key)} blocks held keys and IME tails but preserves ordinary native activation`, async () => {
    const h = model(); await settle();
    try {
        const action = reopenButton(h);
        for (const fields of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) assert.equal(action.dispatch('keydown', { key, ...fields }).prevented, true);
        assert.equal(action.dispatch('keydown', { key }).prevented, false); assert.equal(h.backend.requests, 0);
        action.dispatch('click', { detail: 0 }); await settle(); assert.equal(h.backend.writes, 1); assert.equal(h.backend.raw().records[0].state, 'active');
    } finally { h.view.destroy(); }
});
for (const locale of ['en', 'zh_CN', 'fallback']) test(`reopen preserves translated title and aria label in ${locale}`, async () => {
    const h = model({ locale }); await settle();
    try {
        const before = h.backend.raw(), action = reopenButton(h); const label = locale === 'zh_CN' ? JSON.parse(fs.readFileSync(path.join(__dirname, '../_locales/zh_CN/messages.json'), 'utf8')).tasksReopen.message : 'Reopen';
        assert.equal(action.title, label); assert.equal(action.getAttribute('aria-label'), `${label}: ${before.records[0].text}`); assert.equal(action.dataset.taskAction, '↶');
        action.dispatch('click'); await settle(); assert.equal(h.backend.writes, 1); assert.equal(h.backend.raw().records[0].state, 'active');
    } finally { h.view.destroy(); }
});
test('current row reopen merges unobserved unrelated edit, active-order and independent pin changes', async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        const action = reopenButton(h);
        await h.remote.mutate(command(h.remote, 'edit', h.backend.raw().records[1], { text: 'unrelated changed task' }));
        await h.remote.mutate(command(h.remote, 'moveLast', h.backend.raw().records[1], { order: order(h.backend.raw()) }));
        await h.remote.mutate(command(h.remote, 'pin', h.backend.raw().records.find(r => r.id === 'task_0006'), { expectedPin: h.backend.raw().pinnedId }));
        const before = h.backend.raw(), writes = h.backend.writes; action.dispatch('click'); await settle(); const after = h.backend.raw();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes + 1); assert.equal(after.pinnedId, before.pinnedId);
        assert.deepEqual(after.records.map(r => r.id), before.records.map(r => r.id)); assert.deepEqual(after.records.filter(r => r.id !== 'task_0000'), before.records.filter(r => r.id !== 'task_0000'));
        assert.equal(after.records.find(r => r.id === 'task_0000').state, 'active');
    } finally { h.view.destroy(); }
});
test('real Store task CAS conflict refresh allows new explicit current-row reopening, never an old reattached choice', async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        const old = row(h), action = reopenButton(h); await h.remote.mutate(command(h.remote, 'edit', h.backend.raw().records[0], { text: 'genuine newer task text' }));
        const writes = h.backend.writes; action.dispatch('click'); await settle(); assert.equal(h.controller.error.code, 'CONFLICT'); assert.equal(h.backend.writes, writes);
        const request = h.controller.retryCommand, current = row(h), fresh = reopenButton(h); current.replaceWith(old); await rejectsWithoutIO(h, action);
        assert.strictEqual(h.controller.retryCommand, request); old.replaceWith(current); fresh.dispatch('click'); await settle();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes + 1); assert.equal(h.backend.raw().records[0].text, 'genuine newer task text');
        assert.equal(h.backend.raw().records[0].state, 'active'); assert.notEqual(h.backend.raw().receipts.at(-1), request.operationId);
    } finally { h.view.destroy(); }
});
test('delayed row reopening owns its request while independent new draft and focus survive', async () => {
    const h = model(); await settle(); let release; const gate = new Promise(resolve => { release = resolve; });
    try {
        h.backend.delay = gate; const action = reopenButton(h); action.focus(); action.dispatch('click'); await settle(); const request = h.controller.retryCommand;
        assert.equal(h.controller.status, 'saving'); assert.equal(h.backend.writes, 1);
        await rejectsWithoutIO(h, action); await rejectsWithoutIO(h, reopenButton(h, 'task_0005')); assert.strictEqual(h.controller.retryCommand, request);
        input(h.view.input, 'newer independent draft'); h.search.focus(); release(); await settle();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, 1); assert.equal(h.document.activeElement, h.search); assert.equal(h.view.input.value, 'newer independent draft');
    } finally { release(); h.view.destroy(); }
});
for (const mode of ['READ', 'false', 'drop', 'ack']) for (const change of ['object', 'id', 'generation', 'session', 'store', 'backend', 'controller']) test(`original row reopen ${mode} Retry refuses ${change} until original source returns`, async () => {
    const h = model(), foreign = model(); await settle(); h.backend.notifications = false; foreign.backend.notifications = false;
    const workspace = h.backend.workspace, id = workspace.id, generation = workspace.generation;
    try {
        failNext(h, mode); reopenButton(h).dispatch('click'); await settle(); const request = h.controller.retryCommand; assert.equal(h.controller.error.code, errorCode(mode)); h.backend.mode = null;
        foreign.backend.workspace = workspace; foreign.window.LocalItabWorkspaces.session = workspace;
        if (change === 'store') h.controller.store = foreign.store;
        else if (change === 'backend') h.store.backend = foreign.backend;
        else if (change === 'controller') h.view.controller = new Proxy(h.controller, {});
        else sourceChanges[change](h);
        const own = h.backend.raw(), alien = foreign.backend.raw(), counts = { own: io(h), foreign: io(foreign) };
        h.view.retry.dispatch('click'); await settle(); assert.deepEqual({ own: io(h), foreign: io(foreign) }, counts);
        assert.deepEqual(h.backend.raw(), own); assert.deepEqual(foreign.backend.raw(), alien); assert.strictEqual(h.controller.retryCommand, request);
        workspace.id = id; workspace.generation = generation; restoreSource(h, workspace); const writes = h.backend.writes;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes + (mode === 'ack' ? 0 : 1));
        assert.equal(h.backend.raw().receipts.at(-1), request.operationId); assert.equal(h.backend.raw().records[0].state, 'active');
    } finally { workspace.id = id; workspace.generation = generation; restoreSource(h, workspace); h.view.destroy(); foreign.view.destroy(); }
});
for (const mode of ['READ', 'false', 'drop']) test(`uncommitted ${mode} row reopen Retry retains original task CAS after a remote target edit`, async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        failNext(h, mode); reopenButton(h).dispatch('click'); await settle(); const request = h.controller.retryCommand; h.backend.mode = null;
        await h.remote.mutate(command(h.remote, 'edit', h.backend.raw().records[0], { text: 'new target original' })); await h.controller.refresh(); redraw(h);
        const before = h.backend.raw(), writes = h.backend.writes, requests = h.backend.requests;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.error.code, 'CONFLICT'); assert.strictEqual(h.controller.retryCommand, request);
        assert.equal(h.backend.writes, writes); assert.equal(h.backend.requests, requests); assert.deepEqual(h.backend.raw(), before);
    } finally { h.view.destroy(); }
});
for (const mode of ['READ', 'false', 'drop', 'ack']) test(`legacy nullish source retains original ${mode} row reopen Retry after temporary unavailability`, async () => {
    const h = model({ legacy: true }); await settle(); h.backend.notifications = false;
    try {
        failNext(h, mode); reopenButton(h).dispatch('click'); await settle(); const request = h.controller.retryCommand; h.backend.mode = null;
        h.backend.workspace = { invalidated: true }; const reads = h.backend.reads, writes = h.backend.writes;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.backend.reads, reads); assert.equal(h.backend.writes, writes); assert.strictEqual(h.controller.retryCommand, request);
        h.backend.workspace = null; h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved');
        assert.equal(h.backend.writes, writes + (mode === 'ack' ? 0 : 1)); assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
    } finally { h.view.destroy(); }
});
for (const mode of ['READ', 'false', 'drop', 'ack']) test(`original anonymous availability retains same-source ${mode} row reopen Retry`, async () => {
    const h = model({ legacyAvailability: true }); await settle(); h.backend.notifications = false;
    try {
        failNext(h, mode); reopenButton(h).dispatch('click'); await settle(); const request = h.controller.retryCommand; assert.equal(h.controller.error.code, errorCode(mode));
        h.backend.mode = null; await h.controller.refresh(); redraw(h); const writes = h.backend.writes;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes + (mode === 'ack' ? 0 : 1));
        assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
    } finally { h.view.destroy(); }
});
test('original anonymous availability without workspace service permits current-row reopening', async () => {
    const h = model({ legacyAvailability: true }); await settle();
    try { reopenButton(h).dispatch('click'); await settle(); assert.equal(h.backend.writes, 1); assert.equal(h.backend.raw().records[0].state, 'active'); }
    finally { h.view.destroy(); }
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
for (const [name, change] of Object.entries(availabilityChanges)) for (const fresh of [false, true]) test(`anonymous row reopen source rejects ${name} on ${fresh ? 'redrawn' : 'original'} row`, async () => {
    const h = model({ legacyAvailability: true }); await settle();
    try { let action = reopenButton(h); change(h); if (fresh) { redraw(h); action = reopenButton(h); } await rejectsWithoutIO(h, action); }
    finally { h.view.destroy(); }
});
for (const [name, change] of Object.entries(availabilityChanges)) for (const mode of ['READ', 'false', 'drop', 'ack']) test(`anonymous original ${mode} row reopen Retry rejects ${name} and resumes at original availability`, async () => {
    const h = model({ legacyAvailability: true }); await settle(); h.backend.notifications = false; const workspace = h.backend.workspace;
    try {
        failNext(h, mode); reopenButton(h).dispatch('click'); await settle(); const request = h.controller.retryCommand; h.backend.mode = null; change(h);
        const before = h.backend.raw(), counts = io(h); h.view.retry.dispatch('click'); await settle(); assert.deepEqual(io(h), counts); assert.deepEqual(h.backend.raw(), before); assert.strictEqual(h.controller.retryCommand, request);
        delete workspace.id; delete workspace.generation; workspace.invalidated = false; workspace._suspended = false; h.backend.workspace = workspace; delete h.window.LocalItabWorkspaces;
        const writes = h.backend.writes; h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes + (mode === 'ack' ? 0 : 1)); assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
    } finally { h.view.destroy(); }
});
for (const identityMode of ['full', 'id-only', 'generation-only']) for (const sessionMode of ['missing', 'wrong', 'absent']) test(`identified ${identityMode} source with ${sessionMode} session remains unavailable before and after redraw`, async () => {
    const h = model({ identityMode, sessionMode }); await settle();
    try { await rejectsWithoutIO(h, reopenButton(h)); redraw(h); await rejectsWithoutIO(h, reopenButton(h)); }
    finally { h.view.destroy(); }
});
test('actual open editor makes its background reopen ineligible until the editor closes', async () => {
    const h = model(); await settle();
    try {
        const action = reopenButton(h); input(h.view.input, 'independent quick draft'); h.view.edit(h.controller.state.records[4]);
        const editor = h.document.querySelector('.tasks-editor'); input(editor, 'independent editor draft'); editor.focus();
        const error = h.controller.error, retry = h.controller.retryCommand, undo = h.view.undo, status = h.controller.status;
        await rejectsWithoutIO(h, action); assert.equal(h.document.activeElement, editor); assert.equal(editor.value, 'independent editor draft');
        assert.strictEqual(h.controller.error, error); assert.strictEqual(h.controller.retryCommand, retry); assert.strictEqual(h.view.undo, undo); assert.equal(h.controller.status, status);
        h.document.querySelector('.tasks-overlay').dispatch('keydown', { key: 'Escape' });
        reopenButton(h).dispatch('click'); await settle(); assert.equal(h.backend.writes, 1); assert.equal(h.view.input.value, 'independent quick draft');
    } finally { h.view.destroy(); }
});
test('confirming latest original receipt permits a later independent current DONE-row reopening', async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        failNext(h, 'ack'); reopenButton(h).dispatch('click'); await settle(); const request = h.controller.retryCommand; h.backend.mode = null;
        await h.controller.refresh(); await rejectsWithoutIO(h, reopenButton(h, 'task_0005'));
        const writes = h.backend.writes; h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes);
        reopenButton(h, 'task_0005').dispatch('click'); await settle(); assert.equal(h.backend.writes, writes + 1); assert.equal(h.backend.raw().records[5].state, 'active');
        assert.notEqual(h.backend.raw().receipts.at(-1), request.operationId);
    } finally { h.view.destroy(); }
});

test('latest acknowledged row receipt confirms with no new writes after filter change and completed section collapse', async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        failNext(h, 'ack'); reopenButton(h).dispatch('click'); await settle();
        const original = h.controller.retryCommand, saved = h.backend.raw(); h.backend.mode = null;
        assert.strictEqual(h.view.rowReopenAttempt.command, original);
        await h.controller.refresh(); input(h.view.filterInput, 'no matching records'); h.view.completed.box.open = false;
        const writes = h.backend.writes, requests = h.backend.requests;
        h.view.retry.dispatch('click'); await settle();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes); assert.equal(h.backend.requests, requests);
        assert.deepEqual(h.backend.raw(), saved); assert.equal(saved.receipts.at(-1), original.operationId); assert.equal(h.view.undo, null);
    } finally { h.view.destroy(); }
});
test('later receipt makes original acknowledged row Retry conflict with zero writes and no replacement command', async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        failNext(h, 'ack'); reopenButton(h).dispatch('click'); await settle(); const original = h.controller.retryCommand; h.backend.mode = null;
        await h.remote.mutate(command(h.remote, 'edit', h.backend.raw().records[1], { text: 'unrelated later change' }));
        const before = h.backend.raw(), writes = h.backend.writes, requests = h.backend.requests;
        h.view.completed.box.open = false; h.view.retry.dispatch('click'); await settle();
        assert.equal(h.controller.error.code, 'CONFLICT'); assert.strictEqual(h.controller.retryCommand, original);
        assert.equal(h.backend.writes, writes); assert.equal(h.backend.requests, requests); assert.deepEqual(h.backend.raw(), before);
    } finally { h.view.destroy(); }
});
for (const mode of ['READ', 'false', 'drop']) test(`uncommitted ${mode} original row Retry merges unrelated edit/order/pin after rows disappear`, async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        failNext(h, mode); reopenButton(h).dispatch('click'); await settle(); const original = h.controller.retryCommand; h.backend.mode = null;
        await h.remote.mutate(command(h.remote, 'edit', h.backend.raw().records[1], { text: 'unrelated edit before retry' }));
        await h.remote.mutate(command(h.remote, 'moveLast', h.backend.raw().records[1], { order: order(h.backend.raw()) }));
        await h.remote.mutate(command(h.remote, 'pin', h.backend.raw().records.find(r => r.id === 'task_0006'), { expectedPin: h.backend.raw().pinnedId }));
        const before = h.backend.raw(), writes = h.backend.writes, requests = h.backend.requests;
        await h.controller.refresh(); input(h.view.filterInput, 'unrelated edit'); h.view.completed.box.open = false;
        h.view.retry.dispatch('click'); await settle(); const after = h.backend.raw();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes + 1); assert.equal(h.backend.requests, requests);
        assert.equal(after.receipts.at(-1), original.operationId); assert.equal(after.pinnedId, before.pinnedId);
        assert.deepEqual(after.records.map(r => r.id), before.records.map(r => r.id));
        assert.deepEqual(after.records.filter(r => r.id !== 'task_0000'), before.records.filter(r => r.id !== 'task_0000'));
        assert.equal(after.records.find(r => r.id === 'task_0000').state, 'active');
    } finally { h.view.destroy(); }
});
for (const id of ['task_0000', 'task_0005']) test(`duplicate completed text reopens exact first/last DONE identity ${id}`, async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        for (const index of [0, 5]) await h.remote.mutate(command(h.remote, 'edit', h.backend.raw().records[index], { text: '  duplicate 中文 😀\ntext  ' }));
        await h.controller.refresh(); input(h.view.filterInput, '  DUPLICATE 中文  ');
        const before = h.backend.raw(); reopenButton(h, id).dispatch('click'); await settle(); const after = h.backend.raw();
        assert.equal(after.records.find(r => r.id === id).state, 'active'); assert.equal(after.records.find(r => r.id === id).text, before.records.find(r => r.id === id).text);
        assert.deepEqual(after.records.filter(r => r.id !== id), before.records.filter(r => r.id !== id));
    } finally { h.view.destroy(); }
});
