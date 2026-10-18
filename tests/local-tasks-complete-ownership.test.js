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
    return { backend, store, remote, controller, document, host, search, window, view };
}

const row = (h, id = 'task_0003') => h.view.list.querySelectorAll('[data-task-id]').find(node => node.dataset.taskId === id);
function completeButton(h, id = 'task_0003') {
    const item = row(h, id); assert(item, `rendered active row ${id}`);
    const action = item.querySelector('.tasks-check'); assert.equal(action.textContent, '○'); return action;
}
const input = (node, value) => { node.value = value; node.dispatch('input'); };
const command = (store, kind, record, values = {}) => store.request(kind, { id: record.id, version: record.version, ...values });
function redraw(h) { h.view.renderedRevision = -1; h.view.render(); }
const io = h => ({ reads: h.backend.reads, writes: h.backend.writes, requests: h.backend.requests });
async function rejectsWithoutIO(h, action, fields = {}) {
    const before = h.backend.raw(), counts = io(h);
    action.dispatch('click', fields); await settle();
    assert.deepEqual(io(h), counts, `rejected complete must have zero I/O ${JSON.stringify({ before: counts, after: io(h) })}`);
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

// This first-run RED suite is frozen in the evidence directory before production edits.
for (const pinned of [false, true]) test(`RED: original ${pinned ? 'pinned' : 'filtered unpinned'} active row completes exactly once`, async () => {
    const h = model({ pinned }); await settle();
    try {
        if (!pinned) { input(h.view.filterInput, '  SYNTHETIC TASK 3  '); input(h.view.input, '独立草稿'); h.view.input.focus(); h.view.input.dispatch('compositionstart'); }
        const before = h.backend.raw(); completeButton(h).dispatch('click'); await settle();
        const after = h.backend.raw(); assert.equal(h.backend.writes, 1); assert.equal(after.records[3].state, 'done');
        assert.equal(after.pinnedId, pinned ? null : before.pinnedId); assert.deepEqual(after.recovery, before.recovery);
        assert.deepEqual(after.records.filter(r => r.id !== 'task_0003'), before.records.filter(r => r.id !== 'task_0003'));
        assert.equal(after.records[3].text, before.records[3].text); assert.equal(h.view.undo.id, 'task_0003');
        if (!pinned) { assert.equal(h.view.filterInput.value, '  SYNTHETIC TASK 3  '); assert.equal(h.view.input.value, '独立草稿'); assert.equal(h.view.quickEntryComposing, true); assert.equal(h.document.activeElement, h.view.input); }
    } finally { h.view.destroy(); }
});
test('RED: construction source cannot change before the first asynchronous row render', async () => {
    const h = model();
    try { sourceChanges.object(h); await settle(); await rejectsWithoutIO(h, completeButton(h)); }
    finally { h.view.destroy(); }
});
for (const [name, change] of Object.entries(sourceChanges)) test(`RED: fresh redraw cannot adopt replacement workspace ${name}`, async () => {
    const h = model(); await settle();
    try { change(h); redraw(h); await rejectsWithoutIO(h, completeButton(h)); }
    finally { h.view.destroy(); }
});
for (const change of ['backend', 'store']) for (const fresh of [false, true]) test(`RED: ${change} replacement has independent data with same workspace; reject ${fresh ? 'redrawn' : 'old'} row`, async () => {
    const h = model(), foreign = model(); await settle();
    try {
        foreign.backend.workspace = h.backend.workspace; foreign.window.LocalItabWorkspaces.session = h.backend.workspace;
        assert.deepEqual(foreign.backend.raw(), h.backend.raw()); let action = completeButton(h);
        if (change === 'store') h.controller.store = foreign.store; else h.store.backend = foreign.backend;
        if (fresh) { redraw(h); action = completeButton(h); }
        const before = foreign.backend.raw(), ownCounts = io(h), foreignCounts = io(foreign);
        action.dispatch('click'); await settle();
        assert.deepEqual({ own: io(h), foreign: io(foreign) }, { own: ownCounts, foreign: foreignCounts }, `replacement must have zero I/O ${JSON.stringify({ own: [ownCounts, io(h)], foreign: [foreignCounts, io(foreign)] })}`);
        assert.deepEqual(foreign.backend.raw(), before);
    } finally { restoreSource(h, h.backend.workspace); h.view.destroy(); foreign.view.destroy(); }
});
test('RED: controller replacement cannot own a freshly drawn row', async () => {
    const h = model(); await settle(); const other = new Controller(h.store); await other.refresh();
    try { h.view.controller = other; redraw(h); await rejectsWithoutIO(h, completeButton(h)); }
    finally { h.view.controller = h.controller; other.destroy(); h.view.destroy(); }
});
test('RED: perfect reattachment of entire old row cannot revive its original complete callback', async () => {
    const h = model(); await settle();
    try { const old = row(h), action = completeButton(h); redraw(h); row(h).replaceWith(old); assert.equal(old.isConnected, true); await rejectsWithoutIO(h, action); }
    finally { h.view.destroy(); }
});
for (const [mode, change] of [['READ', 'workspace'], ['false', 'workspace'], ['drop', 'workspace'], ['ack', 'workspace'], ['ack', 'store'], ['ack', 'backend']]) test(`RED: original ${mode} Retry rejects ${change} replacement and resumes only at original source`, async () => {
    const h = model(), foreign = model(); await settle(); h.backend.notifications = false;
    const workspace = h.backend.workspace;
    try {
        failNext(h, mode); completeButton(h).dispatch('click'); await settle();
        const request = h.controller.retryCommand; assert.equal(request.kind, 'complete'); assert.equal(request.version, initial().records[3].version);
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
        assert.equal(h.backend.raw().receipts.at(-1), request.operationId); assert.equal(h.backend.raw().records[3].state, 'done');
    } finally { restoreSource(h, workspace); h.view.destroy(); foreign.view.destroy(); }
});
for (const mode of ['READ', 'false', 'drop', 'ack']) test(`RED: unknown ${mode} completion keeps original Retry instead of accepting another active choice`, async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        const old = completeButton(h); failNext(h, mode); old.dispatch('click'); await settle();
        const request = h.controller.retryCommand, error = h.controller.error; assert.equal(error.code, errorCode(mode)); h.backend.mode = null;
        await rejectsWithoutIO(h, old); await h.controller.refresh(); redraw(h);
        // An acknowledged complete can render DONE ↶; its independent behavior is outside this feature.
        if (mode !== 'ack') await rejectsWithoutIO(h, completeButton(h));
        await rejectsWithoutIO(h, completeButton(h, 'task_0004'));
        assert.strictEqual(h.controller.retryCommand, request); assert.strictEqual(h.controller.error, error);
        const writes = h.backend.writes; h.view.retry.dispatch('click'); await settle();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes + (mode === 'ack' ? 0 : 1)); assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
    } finally { h.view.destroy(); }
});
test('RED: repeated, cancelled, composing and foreign-target complete events are rejected', async () => {
    for (const fields of [{ detail: 2 }, { repeat: true }, { defaultPrevented: true }, { isComposing: true }, { keyCode: 229 }, { target: {} }, { currentTarget: {} }]) {
        const h = model(); await settle();
        try { await rejectsWithoutIO(h, completeButton(h), fields); }
        finally { h.view.destroy(); }
    }
});
test('RED: invisible, altered and replaced original row controls are rejected', async () => {
    const changes = [
        (h, a) => { a.hidden = true; }, (h, a) => { a.inert = true; }, (h, a) => { a.textContent = '↶'; },
        (h, a) => { a.title = 'Reopen'; }, (h, a) => a.setAttribute('aria-label', 'Complete: another task'),
        (h, a) => { a.dataset.taskAction = 'changed'; }, h => { row(h).dataset.taskId = 'task_0004'; },
        h => { row(h).querySelector('.tasks-text').textContent = 'Different visible original'; },
        h => { const title = row(h).querySelector('.tasks-text'), next = h.document.createElement('span'); next.className = 'tasks-text'; next.textContent = title.textContent; title.replaceWith(next); },
        h => { h.view.host.hidden = true; }, h => { h.view.list.inert = true; },
        h => { h.view.filterInput.value = 'not currently rendered'; }
    ];
    for (const change of changes) { const h = model(); await settle(); try { const action = completeButton(h); change(h, action); await rejectsWithoutIO(h, action); } finally { h.view.destroy(); } }
});
test('RED: final layout observation must be followed by rechecking visible original text and source', async () => {
    const h = model(); await settle();
    try {
        const action = completeButton(h), original = h.window.getComputedStyle; let fired = false;
        h.window.getComputedStyle = node => { const result = original(node); if (!fired && node === h.document.documentElement) { fired = true; row(h).querySelector('.tasks-text').textContent = 'Changed at layout read'; } return result; };
        const before = io(h); action.dispatch('click'); await settle(); assert.equal(fired, true, 'visibility must be inspected');
        assert.deepEqual(io(h), before, `post-layout mutation must have zero I/O ${JSON.stringify({ before, after: io(h) })}`);
    } finally { h.view.destroy(); }
});
test('RED: latest committed completion receipt Retry confirms with zero new writes and preserves original operation', async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        failNext(h, 'ack'); completeButton(h).dispatch('click'); await settle(); const request = h.controller.retryCommand;
        const saved = h.backend.raw(), writes = h.backend.writes, requests = h.backend.requests; h.backend.mode = null;
        await h.controller.refresh(); redraw(h); h.view.retry.dispatch('click'); await settle();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes); assert.equal(h.backend.requests, requests); assert.deepEqual(h.backend.raw(), saved);
        assert.equal(saved.receipts.at(-1), request.operationId); assert.equal(h.view.undo.id, 'task_0003');
    } finally { h.view.destroy(); }
});
test('RED: later receipt makes original completed Retry conflict without another write', async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        failNext(h, 'ack'); completeButton(h).dispatch('click'); await settle(); const request = h.controller.retryCommand; h.backend.mode = null;
        await h.remote.mutate(command(h.remote, 'edit', h.backend.raw().records[1], { text: 'unrelated later edit' }));
        const before = h.backend.raw(), writes = h.backend.writes, requests = h.backend.requests;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.error.code, 'CONFLICT'); assert.strictEqual(h.controller.retryCommand, request);
        assert.equal(h.backend.writes, writes); assert.equal(h.backend.requests, requests); assert.deepEqual(h.backend.raw(), before);
    } finally { h.view.destroy(); }
});
test('RED: uncommitted original Retry merges unrelated edit, order and pin without new command', async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        failNext(h, 'false'); completeButton(h).dispatch('click'); await settle(); const request = h.controller.retryCommand; h.backend.mode = null;
        await h.remote.mutate(command(h.remote, 'edit', h.backend.raw().records[1], { text: 'unrelated edit before retry' }));
        await h.remote.mutate(command(h.remote, 'moveLast', h.backend.raw().records[1], { order: order(h.backend.raw()) }));
        await h.remote.mutate(command(h.remote, 'pin', h.backend.raw().records.find(r => r.id === 'task_0006'), { expectedPin: h.backend.raw().pinnedId }));
        const before = h.backend.raw(), writes = h.backend.writes, requests = h.backend.requests;
        await h.controller.refresh(); redraw(h); h.view.retry.dispatch('click'); await settle(); const after = h.backend.raw();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes + 1); assert.equal(h.backend.requests, requests);
        assert.equal(after.receipts.at(-1), request.operationId); assert.equal(after.pinnedId, before.pinnedId); assert.deepEqual(after.records.map(r => r.id), before.records.map(r => r.id));
        assert.deepEqual(after.records.filter(r => r.id !== 'task_0003'), before.records.filter(r => r.id !== 'task_0003')); assert.equal(after.records.find(r => r.id === 'task_0003').state, 'done');
    } finally { h.view.destroy(); }
});

// Current-row coverage below supplements the immutable first RED snapshot.
const denied = {
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
    'replaced view list': h => { h.view.list = h.document.createElement('ul'); },
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
    'duplicate original ID before source': h => { const duplicate = h.document.createElement('li'); duplicate.dataset.taskId = 'task_0003'; h.view.list.children.unshift(duplicate); duplicate.parentElement = h.view.list; },
    'reparented mounted host': h => { const wrapper = h.document.createElement('div'); h.document.body.append(wrapper); h.host.remove(); wrapper.append(h.host); },
    'reparented mounted list': h => { const wrapper = h.document.createElement('div'); h.host.append(wrapper); h.view.list.remove(); wrapper.append(h.view.list); },
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
    'wrong glyph': (h, a) => { a.textContent = '↶'; },
    'wrong title': (h, a) => { a.title = 'Reopen'; },
    'wrong aria label': (h, a) => a.setAttribute('aria-label', 'Complete: another text'),
    'wrong dataset': (h, a) => { a.dataset.taskAction = 'Complete'; },
    'child action label': (h, a) => a.append(h.document.createElement('span'))
};
for (const [name, change] of Object.entries(denied)) test(`complete rejects ${name} without requests or storage I/O`, async () => {
    const h = model(); await settle();
    try { const action = completeButton(h); change(h, action); await rejectsWithoutIO(h, action); }
    finally { h.view.destroy(); }
});

const lateChanges = {
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
    taskVersion(h) { h.controller.state.records[3].version = 'late_version'; },
    taskText(h) { h.controller.state.records[3].text = 'late changed text'; },
    taskState(h) { h.controller.state.records[3].state = 'done'; },
    taskCreatedAt(h) { h.controller.state.records[3].createdAt = '2026-09-01T00:00:00.000Z'; },
    taskUpdatedAt(h) { h.controller.state.records[3].updatedAt = '2026-10-18T00:00:00.000Z'; },
    taskRemovedFrom(h) { h.controller.state.records[3].removedFrom = 'done'; }
};
for (const [name, change] of Object.entries(lateChanges)) test(`complete reacquires ${name} after final modeled layout read`, async () => {
    const h = model(); await settle(); let rootReads = 0;
    try {
        const action = completeButton(h), getStyle = h.window.getComputedStyle;
        h.window.getComputedStyle = node => { const result = getStyle(node); if (node === h.document.documentElement && ++rootReads === 2) change(h, action); return result; };
        await rejectsWithoutIO(h, action); assert.equal(rootReads, 2, 'mutation reached the final original-title ancestry layout lookup');
    } finally { h.view.destroy(); }
});
for (const [name, change] of Object.entries(sourceChanges)) for (const fresh of [false, true]) test(`complete original construction rejects ${name} source change on ${fresh ? 'fresh' : 'old'} row`, async () => {
    const h = model(); await settle();
    try { let action = completeButton(h); change(h); if (fresh) { redraw(h); action = completeButton(h); } await rejectsWithoutIO(h, action); }
    finally { h.view.destroy(); }
});
for (const change of ['expand', 'collapse', 'filter', 'rerender', 'dispose']) test(`whole old complete row cannot revive after ${change}`, async () => {
    const h = model(); await settle();
    try {
        if (change === 'collapse') h.view.more.dispatch('click');
        const old = row(h), action = completeButton(h), list = h.view.list;
        if (change === 'expand' || change === 'collapse') h.view.more.dispatch('click');
        else if (change === 'filter') { input(h.view.filterInput, 'task 3'); h.view.filterClear.dispatch('click'); }
        else if (change === 'dispose') h.view.destroy(); else redraw(h);
        await rejectsWithoutIO(h, action); if (change === 'dispose') { old.remove(); list.append(old); } else row(h).replaceWith(old);
        assert.equal(old.isConnected, true); await rejectsWithoutIO(h, action);
    } finally { h.view.destroy(); }
});
for (const fields of [{ defaultPrevented: true }, { detail: 2 }, { repeat: true }, { isComposing: true }, { keyCode: 229 }, { target: {} }, { currentTarget: {} }]) test(`complete rejects invalid event ${JSON.stringify(fields)}`, async () => {
    const h = model(); await settle(); try { await rejectsWithoutIO(h, completeButton(h), fields); } finally { h.view.destroy(); }
});
for (const key of ['Enter', ' ']) test(`complete ${JSON.stringify(key)} blocks held keys and IME tails but preserves ordinary native activation`, async () => {
    const h = model(); await settle();
    try {
        const action = completeButton(h);
        for (const fields of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) assert.equal(action.dispatch('keydown', { key, ...fields }).prevented, true);
        assert.equal(action.dispatch('keydown', { key }).prevented, false); assert.equal(h.backend.requests, 0);
        action.dispatch('click', { detail: 0 }); await settle(); assert.equal(h.backend.writes, 1); assert.equal(h.backend.raw().records[3].state, 'done');
    } finally { h.view.destroy(); }
});
for (const locale of ['en', 'zh_CN', 'fallback']) test(`complete preserves translated title and aria label in ${locale}`, async () => {
    const h = model({ locale }); await settle();
    try {
        const before = h.backend.raw(), action = completeButton(h); const label = locale === 'zh_CN' ? JSON.parse(fs.readFileSync(path.join(__dirname, '../_locales/zh_CN/messages.json'), 'utf8')).tasksComplete.message : 'Complete';
        assert.equal(action.title, label); assert.equal(action.getAttribute('aria-label'), `${label}: ${before.records[3].text}`); assert.equal(action.dataset.taskAction, '○');
        action.dispatch('click'); await settle(); assert.equal(h.backend.writes, 1); assert.equal(h.backend.raw().records[3].state, 'done');
    } finally { h.view.destroy(); }
});
for (const id of ['task_0001', 'task_0009']) test(`complete resolves exact duplicate-text identity in first/last active position ${id}`, async () => {
    const h = model(); await settle();
    try {
        h.view.more.dispatch('click'); const before = h.backend.raw(); completeButton(h, id).dispatch('click'); await settle(); const after = h.backend.raw();
        assert.equal(after.records.find(r => r.id === id).state, 'done'); assert.equal(after.records.find(r => r.id === id).text, before.records.find(r => r.id === id).text);
        assert.deepEqual(after.records.filter(r => r.id !== id), before.records.filter(r => r.id !== id)); assert.equal(h.backend.writes, 1);
    } finally { h.view.destroy(); }
});
test('current ordinary complete merges unobserved unrelated edit, active-order and independent pin changes', async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        const action = completeButton(h);
        await h.remote.mutate(command(h.remote, 'edit', h.backend.raw().records[1], { text: 'unrelated changed task' }));
        await h.remote.mutate(command(h.remote, 'moveLast', h.backend.raw().records[1], { order: order(h.backend.raw()) }));
        await h.remote.mutate(command(h.remote, 'pin', h.backend.raw().records.find(r => r.id === 'task_0006'), { expectedPin: h.backend.raw().pinnedId }));
        const before = h.backend.raw(), writes = h.backend.writes; action.dispatch('click'); await settle(); const after = h.backend.raw();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes + 1); assert.equal(after.pinnedId, before.pinnedId);
        assert.deepEqual(after.records.map(r => r.id), before.records.map(r => r.id)); assert.deepEqual(after.records.filter(r => r.id !== 'task_0003'), before.records.filter(r => r.id !== 'task_0003'));
        assert.equal(after.records.find(r => r.id === 'task_0003').state, 'done');
    } finally { h.view.destroy(); }
});
test('real Store task CAS conflict refresh allows new explicit current-row completion, never an old reattached choice', async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        const old = row(h), action = completeButton(h); await h.remote.mutate(command(h.remote, 'edit', h.backend.raw().records[3], { text: 'genuine newer task text' }));
        const writes = h.backend.writes; action.dispatch('click'); await settle(); assert.equal(h.controller.error.code, 'CONFLICT'); assert.equal(h.backend.writes, writes);
        const request = h.controller.retryCommand, current = row(h), fresh = completeButton(h); current.replaceWith(old); await rejectsWithoutIO(h, action);
        assert.strictEqual(h.controller.retryCommand, request); old.replaceWith(current); fresh.dispatch('click'); await settle();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes + 1); assert.equal(h.backend.raw().records[3].text, 'genuine newer task text');
        assert.equal(h.backend.raw().records[3].state, 'done'); assert.notEqual(h.backend.raw().receipts.at(-1), request.operationId);
    } finally { h.view.destroy(); }
});
test('delayed ordinary completion owns its request while independent new draft and focus survive', async () => {
    const h = model(); await settle(); let release; const gate = new Promise(resolve => { release = resolve; });
    try {
        h.backend.delay = gate; const action = completeButton(h); action.focus(); action.dispatch('click'); await settle(); const request = h.controller.retryCommand;
        assert.equal(h.controller.status, 'saving'); assert.equal(h.backend.writes, 1);
        await rejectsWithoutIO(h, action); await rejectsWithoutIO(h, completeButton(h, 'task_0004')); assert.strictEqual(h.controller.retryCommand, request);
        input(h.view.input, 'newer independent draft'); h.search.focus(); release(); await settle();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, 1); assert.equal(h.document.activeElement, h.search); assert.equal(h.view.input.value, 'newer independent draft');
    } finally { release(); h.view.destroy(); }
});
for (const mode of ['READ', 'false', 'drop', 'ack']) for (const change of ['object', 'id', 'generation', 'session', 'store', 'backend', 'controller']) test(`original complete ${mode} Retry refuses ${change} until original source returns`, async () => {
    const h = model(), foreign = model(); await settle(); h.backend.notifications = false; foreign.backend.notifications = false;
    const workspace = h.backend.workspace, id = workspace.id, generation = workspace.generation;
    try {
        failNext(h, mode); completeButton(h).dispatch('click'); await settle(); const request = h.controller.retryCommand; assert.equal(h.controller.error.code, errorCode(mode)); h.backend.mode = null;
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
        assert.equal(h.backend.raw().receipts.at(-1), request.operationId); assert.equal(h.backend.raw().records[3].state, 'done');
    } finally { workspace.id = id; workspace.generation = generation; restoreSource(h, workspace); h.view.destroy(); foreign.view.destroy(); }
});
for (const mode of ['READ', 'false', 'drop']) test(`uncommitted ${mode} complete Retry retains original task CAS after a remote target edit`, async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        failNext(h, mode); completeButton(h).dispatch('click'); await settle(); const request = h.controller.retryCommand; h.backend.mode = null;
        await h.remote.mutate(command(h.remote, 'edit', h.backend.raw().records[3], { text: 'new target original' })); await h.controller.refresh(); redraw(h);
        const before = h.backend.raw(), writes = h.backend.writes, requests = h.backend.requests;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.error.code, 'CONFLICT'); assert.strictEqual(h.controller.retryCommand, request);
        assert.equal(h.backend.writes, writes); assert.equal(h.backend.requests, requests); assert.deepEqual(h.backend.raw(), before);
    } finally { h.view.destroy(); }
});
for (const mode of ['READ', 'false', 'drop', 'ack']) test(`legacy nullish source retains original ${mode} complete Retry after temporary unavailability`, async () => {
    const h = model({ legacy: true }); await settle(); h.backend.notifications = false;
    try {
        failNext(h, mode); completeButton(h).dispatch('click'); await settle(); const request = h.controller.retryCommand; h.backend.mode = null;
        h.backend.workspace = { invalidated: true }; const reads = h.backend.reads, writes = h.backend.writes;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.backend.reads, reads); assert.equal(h.backend.writes, writes); assert.strictEqual(h.controller.retryCommand, request);
        h.backend.workspace = null; h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved');
        assert.equal(h.backend.writes, writes + (mode === 'ack' ? 0 : 1)); assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
    } finally { h.view.destroy(); }
});
for (const mode of ['READ', 'false', 'drop', 'ack']) test(`original anonymous availability retains same-source ${mode} complete Retry`, async () => {
    const h = model({ legacyAvailability: true }); await settle(); h.backend.notifications = false;
    try {
        failNext(h, mode); completeButton(h).dispatch('click'); await settle(); const request = h.controller.retryCommand; assert.equal(h.controller.error.code, errorCode(mode));
        h.backend.mode = null; await h.controller.refresh(); redraw(h); const writes = h.backend.writes;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes + (mode === 'ack' ? 0 : 1));
        assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
    } finally { h.view.destroy(); }
});
test('original anonymous availability without workspace service permits current-row ordinary completion', async () => {
    const h = model({ legacyAvailability: true }); await settle();
    try { completeButton(h).dispatch('click'); await settle(); assert.equal(h.backend.writes, 1); assert.equal(h.backend.raw().records[3].state, 'done'); }
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
for (const [name, change] of Object.entries(availabilityChanges)) for (const fresh of [false, true]) test(`anonymous complete source rejects ${name} on ${fresh ? 'redrawn' : 'original'} row`, async () => {
    const h = model({ legacyAvailability: true }); await settle();
    try { let action = completeButton(h); change(h); if (fresh) { redraw(h); action = completeButton(h); } await rejectsWithoutIO(h, action); }
    finally { h.view.destroy(); }
});
for (const [name, change] of Object.entries(availabilityChanges)) for (const mode of ['READ', 'false', 'drop', 'ack']) test(`anonymous original ${mode} complete Retry rejects ${name} and resumes at original availability`, async () => {
    const h = model({ legacyAvailability: true }); await settle(); h.backend.notifications = false; const workspace = h.backend.workspace;
    try {
        failNext(h, mode); completeButton(h).dispatch('click'); await settle(); const request = h.controller.retryCommand; h.backend.mode = null; change(h);
        const before = h.backend.raw(), counts = io(h); h.view.retry.dispatch('click'); await settle(); assert.deepEqual(io(h), counts); assert.deepEqual(h.backend.raw(), before); assert.strictEqual(h.controller.retryCommand, request);
        delete workspace.id; delete workspace.generation; workspace.invalidated = false; workspace._suspended = false; h.backend.workspace = workspace; delete h.window.LocalItabWorkspaces;
        const writes = h.backend.writes; h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes + (mode === 'ack' ? 0 : 1)); assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
    } finally { h.view.destroy(); }
});
for (const identityMode of ['full', 'id-only', 'generation-only']) for (const sessionMode of ['missing', 'wrong', 'absent']) test(`identified ${identityMode} source with ${sessionMode} session remains unavailable before and after redraw`, async () => {
    const h = model({ identityMode, sessionMode }); await settle();
    try { await rejectsWithoutIO(h, completeButton(h)); redraw(h); await rejectsWithoutIO(h, completeButton(h)); }
    finally { h.view.destroy(); }
});
test('confirmed ordinary completion Undo remains reopen and is independent of the complete Retry source gate', async () => {
    const h = model(); await settle();
    try {
        completeButton(h).dispatch('click'); await settle(); assert.equal(h.view.undo.id, 'task_0003'); h.backend.notifications = false; h.backend.mode = 'false';
        h.view.undoButton.dispatch('click'); await settle(); const request = h.controller.retryCommand; assert.equal(request.kind, 'reopen'); h.backend.mode = null;
        // Only kind=complete owns this source fence. A benign view-owner mismatch cannot gate reopen Retry.
        const owner = h.view.completeOwner; h.view.completeOwner = {}; h.view.retry.dispatch('click'); await settle(); h.view.completeOwner = owner;
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.raw().records[3].state, 'active'); assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
    } finally { h.view.destroy(); }
});
test('actual open editor makes its background complete ineligible until the editor closes', async () => {
    const h = model(); await settle();
    try {
        const action = completeButton(h); input(h.view.input, 'independent quick draft'); h.view.edit(h.controller.state.records[4]);
        const editor = h.document.querySelector('.tasks-editor'); input(editor, 'independent editor draft'); editor.focus();
        const error = h.controller.error, retry = h.controller.retryCommand, undo = h.view.undo, status = h.controller.status;
        await rejectsWithoutIO(h, action); assert.equal(h.document.activeElement, editor); assert.equal(editor.value, 'independent editor draft');
        assert.strictEqual(h.controller.error, error); assert.strictEqual(h.controller.retryCommand, retry); assert.strictEqual(h.view.undo, undo); assert.equal(h.controller.status, status);
        h.document.querySelector('.tasks-overlay').dispatch('keydown', { key: 'Escape' });
        completeButton(h).dispatch('click'); await settle(); assert.equal(h.backend.writes, 1); assert.equal(h.view.input.value, 'independent quick draft');
    } finally { h.view.destroy(); }
});
test('confirming latest original receipt permits a later independent current active-row completion', async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        failNext(h, 'ack'); completeButton(h).dispatch('click'); await settle(); const request = h.controller.retryCommand; h.backend.mode = null;
        await h.controller.refresh(); await rejectsWithoutIO(h, completeButton(h, 'task_0004'));
        const writes = h.backend.writes; h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes);
        completeButton(h, 'task_0004').dispatch('click'); await settle(); assert.equal(h.backend.writes, writes + 1); assert.equal(h.backend.raw().records[4].state, 'done');
        assert.notEqual(h.backend.raw().receipts.at(-1), request.operationId);
    } finally { h.view.destroy(); }
});
