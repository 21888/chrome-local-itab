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
    const states = ['done', 'active', 'removed', 'active', 'active', 'done', 'active', 'removed', 'removed', 'removed'];
    return tasks.validate({ schemaVersion: 1, revision: 4, enabled: true, pinnedId: pinned ? 'task_0003' : 'task_0004', receipts: ['previous_1'],
        records: states.map((state, index) => ({ id: `task_000${index}`, version: `version_${index}`,
            text: [1, 4, 9].includes(index) ? '  duplicate 中文 😀\ntext  ' : `Synthetic task ${index}`,
            state, removedFrom: state === 'removed' ? ([7, 9].includes(index) ? 'done' : 'active') : null,
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
    view.completed.box.open = true; view.removed.box.open = true;
    return { backend, store, remote, controller, document, host, search, window, view };
}

const targetId = state => state === 'active' ? 'task_0002' : 'task_0007';
const otherId = state => state === 'active' ? 'task_0008' : 'task_0009';
const row = (h, state = 'active', id = targetId(state)) => h.view.removed.list.querySelectorAll('[data-task-id]').find(node => node.dataset.taskId === id);
function restoreButton(h, state = 'active', id = targetId(state)) {
    const item = row(h, state, id); assert(item, `rendered removed-from-${state} row ${id}`);
    const action = item.querySelectorAll('button').find(node => node.textContent === (h.window.i18n?.t('tasksRestore') || 'Restore'));
    assert(action, 'real direct Restore button'); assert.equal(action.parentElement, item.querySelector('.tasks-row-actions'));
    assert.equal(item.querySelector('.tasks-row-menu'), null); return action;
}
function removeButton(h, state) {
    const id = state === 'active' ? 'task_0003' : 'task_0000', list = state === 'active' ? h.view.list : h.view.completed.list;
    const item = list.querySelectorAll('[data-task-id]').find(node => node.dataset.taskId === id); assert(item);
    item.querySelector('.tasks-row-menu').open = true;
    return item.querySelectorAll('button').find(node => node.textContent === (h.window.i18n?.t('tasksRemove') || 'Remove'));
}
const input = (node, value) => { node.value = value; node.dispatch('input'); };
const command = (store, kind, record, values = {}) => store.request(kind, { id: record.id, version: record.version, ...values });
function redraw(h) { h.view.renderedRevision = -1; h.view.render(); }
const io = h => ({ reads: h.backend.reads, writes: h.backend.writes, requests: h.backend.requests });
const delta = (before, after) => Object.fromEntries(Object.keys(before).map(key => [key, after[key] - before[key]]));
async function rejectsWithoutIO(h, action, fields = {}) {
    const before = h.backend.raw(), counts = io(h);
    action.dispatch('click', fields); await settle();
    assert.deepEqual(io(h), counts, `rejected Restore delta ${JSON.stringify(delta(counts, io(h)))}`);
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

// This bounded RED section is frozen before any production edit.
for (const state of ['active', 'done']) {
    test(`RED: current visible Restore to ${state} preserves text, original destination and unrelated pin`, async () => {
        const h = model(); await settle();
        try {
            input(h.view.input, '独立草稿'); h.view.input.focus(); h.view.input.dispatch('compositionstart');
            const before = h.backend.raw(), id = targetId(state); restoreButton(h, state).dispatch('click'); await settle();
            const after = h.backend.raw(), saved = after.records.find(record => record.id === id);
            assert.equal(saved.state, state); assert.equal(saved.removedFrom, null); assert.equal(h.backend.writes, 1);
            assert.equal(after.pinnedId, before.pinnedId); assert.deepEqual(after.recovery, before.recovery);
            assert.deepEqual(after.records.filter(record => record.id !== id), before.records.filter(record => record.id !== id));
            assert.equal(saved.text, before.records.find(record => record.id === id).text); assert.equal(h.view.undo, null);
            assert.equal(h.view.input.value, '独立草稿'); assert.equal(h.document.activeElement, h.view.input); assert.equal(h.view.quickEntryComposing, true);
        } finally { h.view.destroy(); }
    });
    test(`RED: Restore to ${state} construction source cannot change before first async row render`, async () => {
        const h = model(), workspace = h.backend.workspace, session = h.window.LocalItabWorkspaces.session;
        try {
            sourceChanges.object(h); await settle(); const counts = io(h), before = h.backend.raw();
            // A changed construction source is rejected before rows gain authority.
            assert.equal(h.host.querySelectorAll('[data-task-id]').length, 0); assert.equal(h.view.renderedRevision, undefined);
            assert.equal(counts.requests, 0); assert.equal(counts.writes, 0);
            h.view.render(); await settle(); assert.deepEqual(io(h), counts); assert.deepEqual(h.backend.raw(), before);
            h.backend.workspace = workspace; h.window.LocalItabWorkspaces.session = session; await h.controller.refresh(); await settle();
            const original = h.backend.raw(); restoreButton(h, state).dispatch('click'); await settle(); const after = h.backend.raw();
            assert.equal(h.backend.writes, counts.writes + 1); assert.equal(h.backend.requests, counts.requests + 1); assert.equal(h.controller.status, 'saved');
            const id = targetId(state), saved = after.records.find(record => record.id === id);
            assert.equal(saved.state, state); assert.equal(saved.removedFrom, null); assert.equal(saved.text, original.records.find(record => record.id === id).text); assert.equal(h.view.undo, null);
            assert.deepEqual(after.records.filter(record => record.id !== id), original.records.filter(record => record.id !== id));
            assert.deepEqual(after.records.map(record => record.id), original.records.map(record => record.id)); assert.equal(after.pinnedId, original.pinnedId); assert.deepEqual(after.recovery, original.recovery);
        } finally { h.backend.workspace = workspace; h.window.LocalItabWorkspaces.session = session; h.view.destroy(); }
    });
    for (const [name, change] of Object.entries(sourceChanges)) test(`RED: fresh Restore to ${state} cannot adopt replacement ${name}`, async () => {
        const h = model(); await settle();
        try { change(h); redraw(h); await rejectsWithoutIO(h, restoreButton(h, state)); }
        finally { h.view.destroy(); }
    });
    for (const kind of ['backend', 'store']) test(`RED: Restore to ${state} fresh ${kind} replacement shares original workspace but independent data`, async () => {
        const h = model(), foreign = model(); await settle(); const workspace = h.backend.workspace;
        try {
            foreign.backend.workspace = workspace; foreign.window.LocalItabWorkspaces.session = workspace;
            assert.deepEqual(foreign.backend.raw(), h.backend.raw());
            if (kind === 'backend') h.store.backend = foreign.backend; else h.controller.store = foreign.store;
            redraw(h); const action = restoreButton(h, state), counts = io(h), foreignCounts = io(foreign), before = foreign.backend.raw();
            action.dispatch('click'); await settle();
            assert.deepEqual({ own: io(h), foreign: io(foreign) }, { own: counts, foreign: foreignCounts }, `replacement delta ${JSON.stringify({ own: delta(counts, io(h)), foreign: delta(foreignCounts, io(foreign)) })}`);
            assert.deepEqual(foreign.backend.raw(), before);
        } finally { restoreSource(h, workspace); h.view.destroy(); foreign.view.destroy(); }
    });
    test(`RED: retired entire Restore-to-${state} row cannot revive with restored mutable references`, async () => {
        const h = model(); await settle();
        try {
            const old = row(h, state), action = restoreButton(h, state), refs = { host: h.view.host, removed: h.view.removed, filter: h.view.filter, filterInput: h.view.filterInput };
            redraw(h); row(h, state).replaceWith(old); Object.assign(h.view, refs); assert.equal(old.isConnected, true);
            await rejectsWithoutIO(h, action);
        } finally { h.view.destroy(); }
    });
    test(`RED: closed Removed section cannot start Restore to ${state}`, async () => {
        const h = model(); await settle();
        try { const action = restoreButton(h, state); h.view.removed.box.open = false; await rejectsWithoutIO(h, action); }
        finally { h.view.destroy(); }
    });
    for (const mode of ['READ', 'false', 'drop', 'ack']) test(`RED: Restore-to-${state} original ${mode} Retry cannot cross workspace`, async () => {
        const h = model(); await settle(); h.backend.notifications = false; const workspace = h.backend.workspace;
        try {
            failNext(h, mode); restoreButton(h, state).dispatch('click'); await settle();
            const original = h.controller.retryCommand; assert.equal(original.kind, 'restore'); assert.equal(h.controller.error.code, errorCode(mode));
            h.backend.mode = null; sourceChanges.object(h);
            await rejectsWithoutIO(h, h.view.retry); assert.strictEqual(h.controller.retryCommand, original);
            restoreSource(h, workspace); const counts = io(h); h.view.retry.dispatch('click'); await settle();
            assert.equal(h.backend.writes, counts.writes + (mode === 'ack' ? 0 : 1)); assert.equal(h.backend.requests, counts.requests);
            assert.equal(h.backend.raw().receipts.at(-1), original.operationId); assert.equal(h.backend.raw().records.find(r => r.id === targetId(state)).state, state);
        } finally { restoreSource(h, workspace); h.view.destroy(); }
    });
    for (const mode of ['READ', 'false', 'drop', 'ack']) for (const choice of ['old', 'fresh-other']) test(`RED: Restore-to-${state} ${choice} row cannot supersede intact unknown ${mode}`, async () => {
        const h = model(); await settle(); h.backend.notifications = false;
        try {
            const old = restoreButton(h, state); failNext(h, mode); old.dispatch('click'); await settle();
            const original = h.controller.retryCommand, error = h.controller.error; assert.equal(error.code, errorCode(mode)); h.backend.mode = null;
            // Every choice has its own original unknown receipt. No old callback precedes a fresh-other probe.
            let action = old;
            if (choice === 'fresh-other') { await h.controller.refresh(); redraw(h); action = restoreButton(h, state, otherId(state)); }
            await rejectsWithoutIO(h, action); assert.strictEqual(h.controller.retryCommand, original); assert.strictEqual(h.controller.error, error);
        } finally { h.view.destroy(); }
    });
}
test('RED: original Remove Undo restore Retry remains independent after earlier successful row Restore', async () => {
    for (const state of ['active', 'done']) for (const mode of ['READ', 'false', 'drop', 'ack']) {
        const h = model(); await settle(); h.backend.notifications = false;
        try {
            restoreButton(h, state).dispatch('click'); await settle(); assert.equal(h.backend.raw().records.find(r => r.id === targetId(state)).state, state);
            removeButton(h, state).dispatch('click'); await settle(); const id = state === 'active' ? 'task_0003' : 'task_0000'; assert.equal(h.view.undo.id, id);
            failNext(h, mode); h.view.undoButton.dispatch('click'); await settle();
            const original = h.controller.retryCommand; assert.equal(original.kind, 'restore'); assert.equal(h.controller.error.code, errorCode(mode));
            h.backend.mode = null;
            // Undo rejects a changed session, independently of the older row attempt.
            const undoSource = { controller: h.view.controller, store: h.controller.store, backend: h.store.backend, host: h.view.host,
                workspace: h.backend.workspace, id: h.backend.workspace?.id, generation: h.backend.workspace?.generation, session: h.window.LocalItabWorkspaces.session };
            const gap = { io: { requests: h.backend.requests, reads: h.backend.reads, writes: h.backend.writes }, raw: h.backend.raw(), error: h.controller.error,
                retry: h.controller.retryCommand, state: h.controller.state, undo: h.view.undo, rowAttempt: h.view.rowRestoreAttempt };
            h.window.LocalItabWorkspaces.session = {}; h.view.retry.dispatch('click'); await settle();
            assert.deepEqual({ requests: h.backend.requests, reads: h.backend.reads, writes: h.backend.writes }, gap.io); assert.deepEqual(h.backend.raw(), gap.raw);
            assert.strictEqual(h.controller.error, gap.error); assert.strictEqual(h.controller.retryCommand, gap.retry); assert.strictEqual(h.controller.state, gap.state);
            assert.strictEqual(h.view.undo, gap.undo); assert.strictEqual(h.view.rowRestoreAttempt, gap.rowAttempt);
            h.window.LocalItabWorkspaces.session = undoSource.session;
            // Invalidate only the row's section wrapper; keep the original Undo source and DOM.
            const section = h.view.removed, nodes = h.host.querySelectorAll('*'), draft = h.view.input.value, focused = h.document.activeElement;
            h.view.removed = { ...section };
            assert.strictEqual(h.view.removed.box, section.box); assert.strictEqual(h.view.removed.summary, section.summary); assert.strictEqual(h.view.removed.list, section.list);
            assert.equal(h.host.querySelectorAll('*').length, nodes.length); assert(h.host.querySelectorAll('*').every((node, index) => node === nodes[index]));
            assert.equal(h.view.input.value, draft); assert.strictEqual(h.document.activeElement, focused);
            assert.equal(h.view.rowRestoreSourceCurrent(h.view.rowRestoreOwner), false);
            assert.strictEqual(h.view.controller, undoSource.controller); assert.strictEqual(h.controller.store, undoSource.store); assert.strictEqual(h.store.backend, undoSource.backend);
            assert.strictEqual(h.view.host, undoSource.host); assert.strictEqual(h.backend.workspace, undoSource.workspace);
            assert.equal(h.backend.workspace?.id, undoSource.id); assert.equal(h.backend.workspace?.generation, undoSource.generation); assert.strictEqual(h.window.LocalItabWorkspaces.session, undoSource.session);
            const counts = io(h);
            h.view.retry.dispatch('click'); await settle();
            assert.equal(h.backend.writes, counts.writes + (mode === 'ack' ? 0 : 1)); assert.equal(h.backend.requests, counts.requests);
            assert.equal(h.backend.raw().receipts.at(-1), original.operationId); assert.equal(h.backend.raw().records.find(r => r.id === id).state, state); assert.equal(h.view.undo, null);
        } finally { h.view.destroy(); }
    }
});

// Regression matrix added only after preserving the complete pre-production RED suite.
const denied = {
    'closed Removed section': h => { h.view.removed.box.open = false; },
    'hidden Removed section': h => { h.view.removed.box.hidden = true; },
    'inert Removed section': h => { h.view.removed.box.inert = true; },
    'detached Removed section': h => h.view.removed.box.remove(),
    'replaced Removed object': h => { h.view.removed = { ...h.view.removed }; },
    'replaced Removed box': h => { h.view.removed.box = h.document.createElement('details'); },
    'replaced Removed list': h => { h.view.removed.list = h.document.createElement('ul'); },
    'replaced Removed summary': h => { h.view.removed.summary = h.document.createElement('summary'); },
    'detached original summary': h => h.view.removed.summary.remove(),
    'replaced actions container': (h, a) => a.closest('.tasks-row-actions').replaceWith(h.document.createElement('div')),
    'reparented actions into menu': (h, a, s) => { const actions = a.parentElement, menu = h.document.createElement('details'); menu.open = true; actions.remove(); menu.append(actions); row(h, s).append(menu); },
    'changed direct action order': (h, a) => { const actions = a.parentElement, copy = actions.children[0]; copy.remove(); actions.append(copy); },
    'replaced Copy identity': (h, a) => a.parentElement.children[0].replaceWith(h.document.createElement('button')),
    'replaced Reuse identity': (h, a) => a.parentElement.children[1].replaceWith(h.document.createElement('button')),
    'disabled action': (h, a) => { a.disabled = true; },
    'disabled attribute': (h, a) => a.setAttribute('disabled', ''),
    'aria-disabled action': (h, a) => a.setAttribute('aria-disabled', 'true'),
    'hidden action': (h, a) => { a.hidden = true; },
    'inert action': (h, a) => { a.inert = true; },
    'zero action rect': (h, a) => { a.getClientRects = () => []; },
    'zero title rect': (h, a, s) => { row(h, s).querySelector('.tasks-text').getClientRects = () => []; },
    'changed action label': (h, a) => { a.textContent = 'Remove'; },
    'changed action dataset': (h, a) => { a.dataset.taskAction = 'Remove'; },
    'changed action title': (h, a) => { a.title = 'different'; },
    'changed action aria': (h, a) => a.setAttribute('aria-label', 'different task'),
    'changed action type': (h, a) => { a.type = 'submit'; },
    'action child': (h, a) => a.append(h.document.createElement('span')),
    'replaced action': (h, a) => a.replaceWith(h.document.createElement('button')),
    'foreign action document': (h, a) => { a.ownerDocument = createDocument(); },
    'reparented action': (h, a, s) => { a.remove(); row(h, s).append(a); },
    'removed row': (h, a, s) => row(h, s).remove(),
    'changed row ID': (h, a, s) => { row(h, s).dataset.taskId = otherId(s); },
    'replaced row main': (h, a, s) => row(h, s).querySelector('.tasks-row-main').replaceWith(h.document.createElement('div')),
    'extra main child': (h, a, s) => row(h, s).querySelector('.tasks-row-main').append(h.document.createElement('button')),
    'replaced title': (h, a, s) => row(h, s).querySelector('.tasks-text').replaceWith(h.document.createElement('span')),
    'changed title text': (h, a, s) => { row(h, s).querySelector('.tasks-text').textContent = 'different removed original'; },
    'title child': (h, a, s) => row(h, s).querySelector('.tasks-text').append(h.document.createElement('span')),
    'unexpected done class': (h, a, s) => row(h, s).querySelector('.tasks-text').classList.add('is-done'),
    'hidden title': (h, a, s) => { row(h, s).querySelector('.tasks-text').hidden = true; },
    'inert title': (h, a, s) => { row(h, s).querySelector('.tasks-text').inert = true; },
    'aria hidden title': (h, a, s) => row(h, s).querySelector('.tasks-text').setAttribute('aria-hidden', 'true'),
    'style hidden title': (h, a, s) => { row(h, s).querySelector('.tasks-text').style.visibility = 'hidden'; },
    'foreign title document': (h, a, s) => { row(h, s).querySelector('.tasks-text').ownerDocument = createDocument(); },
    'reparented title': (h, a, s) => { const title = row(h, s).querySelector('.tasks-text'); title.remove(); row(h, s).append(title); },
    'hidden host': h => { h.host.hidden = true; },
    'disabled host': h => { h.host.disabled = true; },
    'inert ancestor': h => { h.document.body.inert = true; },
    'aria-hidden ancestor': h => h.document.body.setAttribute('aria-hidden', 'true'),
    'style display none ancestor': h => { h.document.body.style.display = 'none'; },
    'style visibility collapse ancestor': h => { h.document.body.style.visibility = 'collapse'; },
    'reparented host': h => { const wrapper = h.document.createElement('div'); h.document.body.append(wrapper); h.host.remove(); wrapper.append(h.host); },
    'replaced filter container': h => { h.view.filter = h.document.createElement('div'); },
    'replaced filter input': h => { h.view.filterInput = h.document.createElement('input'); },
    'detached original filter': h => h.view.filterInput.remove(),
    'unapplied filter': h => { h.view.filterInput.value = 'different'; },
    'composing filter': h => h.view.filterInput.dispatch('compositionstart'),
    'hidden document': h => { h.document.hidden = true; },
    'hidden document visibility': h => { h.document.visibilityState = 'hidden'; },
    'closed controller': h => h.controller.destroy(),
    'pending review': h => { h.view.pendingReview = true; },
    'batch session': h => { h.view.batchSession = {}; },
    'reuse session': h => { h.view.reuseSession = {}; },
    'completion session': h => { h.view.completionSession = {}; },
    'restoration session': h => { h.view.restorationSession = {}; },
    'content departure': h => { h.window.LocalItabContentLifecycle.departing = true; },
    'invalidated workspace': h => { h.backend.workspace.invalidated = true; },
    'suspended workspace': h => { h.backend.workspace._suspended = true; }
};
const changedTasks = {
    'task version': (h, a, s) => { h.controller.state.records.find(r => r.id === targetId(s)).version = 'late_version'; },
    'task text': (h, a, s) => { h.controller.state.records.find(r => r.id === targetId(s)).text = 'late text'; },
    'task state': (h, a, s) => { h.controller.state.records.find(r => r.id === targetId(s)).state = s; },
    'task removedFrom': (h, a, s) => { h.controller.state.records.find(r => r.id === targetId(s)).removedFrom = s === 'active' ? 'done' : 'active'; },
    'task createdAt': (h, a, s) => { h.controller.state.records.find(r => r.id === targetId(s)).createdAt = '2026-09-01T00:00:00.000Z'; },
    'task updatedAt': (h, a, s) => { h.controller.state.records.find(r => r.id === targetId(s)).updatedAt = '2026-10-18T00:00:00.000Z'; }
};
for (const state of ['active', 'done']) for (const [name, change] of Object.entries({ ...denied, ...changedTasks })) test(`Restore to ${state} rejects ${name} with zero requests/reads/writes`, async () => {
    const h = model(); await settle();
    try { const action = restoreButton(h, state); change(h, action, state); await rejectsWithoutIO(h, action); }
    finally { h.view.destroy(); }
});
const lateChanges = {
    ...sourceChanges,
    controller: h => { h.view.controller = new Proxy(h.controller, {}); },
    store: h => { h.controller.store = new Proxy(h.store, {}); },
    backend: h => { h.store.backend = new Proxy(h.backend, {}); },
    ...Object.fromEntries(Object.entries(denied).filter(([name]) => !['zero action rect', 'zero title rect', 'closed controller'].includes(name))),
    ...changedTasks,
    'retired full row': (h, a, s) => { const old = row(h, s), refs = { host: h.view.host, removed: h.view.removed, filter: h.view.filter, filterInput: h.view.filterInput }; redraw(h); row(h, s).replaceWith(old); Object.assign(h.view, refs); }
};
for (const state of ['active', 'done']) for (const [name, change] of Object.entries(lateChanges)) test(`Restore to ${state} repeats ${name} check after actual final modeled layout getter`, async () => {
    const h = model(); await settle(); let rootReads = 0;
    try {
        const action = restoreButton(h, state), getStyle = h.window.getComputedStyle, before = h.backend.raw(), counts = io(h);
        h.window.getComputedStyle = node => { const result = getStyle(node); if (node === h.document.documentElement && ++rootReads === 2) change(h, action, state); return result; };
        action.dispatch('click'); await settle();
        assert.equal(rootReads, 2, 'actual final original-title ancestry getter must execute before rejection is counted');
        assert.deepEqual(io(h), counts); assert.deepEqual(h.backend.raw(), before);
    } finally { h.view.controller = h.controller; h.controller.store = h.store; h.store.backend = h.backend; h.view.destroy(); }
});
for (const state of ['active', 'done']) for (const fields of [{ defaultPrevented: true }, { detail: 2 }, { repeat: true }, { isComposing: true }, { keyCode: 229 }, { target: {} }, { currentTarget: {} }]) test(`Restore to ${state} rejects invalid event ${JSON.stringify(fields)}`, async () => {
    const h = model(); await settle(); try { await rejectsWithoutIO(h, restoreButton(h, state), fields); } finally { h.view.destroy(); }
});
for (const state of ['active', 'done']) for (const key of ['Enter', ' ']) test(`Restore to ${state} ${JSON.stringify(key)} suppresses held/IME key tails but preserves native click`, async () => {
    const h = model(); await settle();
    try {
        const action = restoreButton(h, state);
        for (const fields of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) assert.equal(action.dispatch('keydown', { key, ...fields }).prevented, true);
        assert.equal(action.dispatch('keydown', { key }).prevented, false); assert.equal(h.backend.requests, 0);
        action.dispatch('click', { detail: 0 }); await settle(); assert.equal(h.backend.writes, 1); assert.equal(h.backend.raw().records.find(r => r.id === targetId(state)).state, state);
    } finally { h.view.destroy(); }
});
for (const state of ['active', 'done']) for (const mode of ['READ', 'false', 'drop', 'ack']) for (const notifications of [false, true]) for (const choice of ['old', 'fresh-other']) test(`Restore to ${state} unknown ${mode} notifications=${notifications} retains exact original against ${choice}`, async () => {
    const h = model(); await settle(); h.backend.notifications = notifications;
    try {
        const old = restoreButton(h, state); failNext(h, mode); old.dispatch('click'); await settle();
        const original = h.controller.retryCommand, error = h.controller.error, effect = h.view.retryEffect; assert.equal(error.code, errorCode(mode)); h.backend.mode = null;
        let action = old;
        if (choice === 'fresh-other') { await h.controller.refresh(); redraw(h); action = restoreButton(h, state, otherId(state)); }
        await rejectsWithoutIO(h, action); assert.strictEqual(h.controller.retryCommand, original); assert.strictEqual(h.controller.error, error); assert.strictEqual(h.view.retryEffect, effect);
        h.view.removed.box.open = false; input(h.view.filterInput, 'no row matches this synthetic filter');
        const counts = io(h); h.view.retry.dispatch('click'); await settle();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + (mode === 'ack' ? 0 : 1));
        assert.equal(h.backend.raw().receipts.at(-1), original.operationId); assert.equal(h.backend.raw().records.find(r => r.id === targetId(state)).state, state); assert.equal(h.view.undo, null);
    } finally { h.view.destroy(); }
});
for (const state of ['active', 'done']) for (const mode of ['READ', 'false', 'drop', 'ack']) for (const change of ['object', 'id', 'generation', 'session', 'store', 'backend', 'controller']) test(`Restore to ${state} exact ${mode} Retry rejects ${change} and resumes original source`, async () => {
    const h = model(), foreign = model(); await settle(); h.backend.notifications = false; foreign.backend.notifications = false;
    const workspace = h.backend.workspace, id = workspace.id, generation = workspace.generation;
    try {
        failNext(h, mode); restoreButton(h, state).dispatch('click'); await settle(); const original = h.controller.retryCommand, effect = h.view.retryEffect;
        assert.equal(h.controller.error.code, errorCode(mode)); h.backend.mode = null;
        foreign.backend.workspace = workspace; foreign.window.LocalItabWorkspaces.session = workspace;
        if (change === 'store') h.controller.store = foreign.store; else if (change === 'backend') h.store.backend = foreign.backend;
        else if (change === 'controller') h.view.controller = new Proxy(h.controller, {}); else sourceChanges[change](h);
        const before = { own: h.backend.raw(), foreign: foreign.backend.raw() }, counts = { own: io(h), foreign: io(foreign) };
        h.view.retry.dispatch('click'); await settle(); assert.deepEqual({ own: io(h), foreign: io(foreign) }, counts);
        assert.deepEqual({ own: h.backend.raw(), foreign: foreign.backend.raw() }, before); assert.strictEqual(h.controller.retryCommand, original); assert.strictEqual(h.view.retryEffect, effect);
        workspace.id = id; workspace.generation = generation; restoreSource(h, workspace); const own = io(h);
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.requests, own.requests);
        assert.equal(h.backend.writes, own.writes + (mode === 'ack' ? 0 : 1)); assert.equal(h.backend.raw().receipts.at(-1), original.operationId);
        assert.equal(h.backend.raw().records.find(r => r.id === targetId(state)).state, state);
    } finally { workspace.id = id; workspace.generation = generation; restoreSource(h, workspace); h.view.destroy(); foreign.view.destroy(); }
});
for (const state of ['active', 'done']) for (const mode of ['READ', 'false', 'drop']) test(`Restore to ${state} ${mode} original Retry merges unrelated edit/order/pin without broad CAS`, async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        failNext(h, mode); restoreButton(h, state).dispatch('click'); await settle(); const original = h.controller.retryCommand; h.backend.mode = null;
        await h.remote.mutate(command(h.remote, 'edit', h.backend.raw().records[1], { text: 'unrelated changed task' }));
        await h.remote.mutate(command(h.remote, 'moveLast', h.backend.raw().records[1], { order: order(h.backend.raw()) }));
        await h.remote.mutate(command(h.remote, 'pin', h.backend.raw().records.find(r => r.id === 'task_0006'), { expectedPin: h.backend.raw().pinnedId }));
        await h.controller.refresh(); redraw(h); h.view.removed.box.open = false; input(h.view.filterInput, 'hide original');
        const before = h.backend.raw(), counts = io(h); h.view.retry.dispatch('click'); await settle(); const after = h.backend.raw();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + 1);
        assert.equal(after.receipts.at(-1), original.operationId); assert.equal(after.pinnedId, before.pinnedId); assert.deepEqual(after.records.map(r => r.id), before.records.map(r => r.id));
        assert.deepEqual(after.records.filter(r => r.id !== targetId(state)), before.records.filter(r => r.id !== targetId(state)));
        assert.equal(after.records.find(r => r.id === targetId(state)).state, state); assert.equal(after.records.find(r => r.id === targetId(state)).removedFrom, null);
    } finally { h.view.destroy(); }
});
for (const state of ['active', 'done']) for (const later of [false, true]) test(`Restore to ${state} latest unknown ack receipt is read-only; later=${later}`, async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        failNext(h, 'ack'); restoreButton(h, state).dispatch('click'); await settle(); const original = h.controller.retryCommand; h.backend.mode = null;
        if (later) await h.remote.mutate(command(h.remote, 'edit', h.backend.raw().records[1], { text: 'later receipt original' }));
        await h.controller.refresh(); redraw(h); h.view.removed.box.open = false; input(h.view.filterInput, 'hidden restored target');
        const before = h.backend.raw(), counts = io(h); h.view.retry.dispatch('click'); await settle();
        assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes); assert.equal(h.backend.reads, counts.reads + (later ? 2 : 1)); assert.deepEqual(h.backend.raw(), before);
        if (later) { assert.equal(h.controller.error.code, 'CONFLICT'); assert.strictEqual(h.controller.retryCommand, original); }
        else { assert.equal(h.controller.status, 'saved'); assert.equal(h.view.undo, null); }
    } finally { h.view.destroy(); }
});
for (const state of ['active', 'done']) test(`Restore to ${state} real restore-remove Store CAS conflict permits fresh reviewed row and retires old`, async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        const old = row(h, state), action = restoreButton(h, state), id = targetId(state), originalVersion = h.backend.raw().records.find(r => r.id === id).version;
        await h.remote.mutate(command(h.remote, 'restore', h.backend.raw().records.find(r => r.id === id)));
        await h.remote.mutate(command(h.remote, 'edit', h.backend.raw().records.find(r => r.id === id), { text: 'genuine newer original text' }));
        await h.remote.mutate(command(h.remote, 'remove', h.backend.raw().records.find(r => r.id === id)));
        const latest = h.backend.raw().records.find(r => r.id === id); assert.equal(latest.state, 'removed'); assert.equal(latest.removedFrom, state); assert.notEqual(latest.version, originalVersion);
        const writes = h.backend.writes; action.dispatch('click'); await settle(); assert.equal(h.controller.error.code, 'CONFLICT'); assert.equal(h.backend.writes, writes);
        const original = h.controller.retryCommand, current = row(h, state), fresh = restoreButton(h, state); current.replaceWith(old); await rejectsWithoutIO(h, action);
        assert.strictEqual(h.controller.retryCommand, original); old.replaceWith(current); fresh.dispatch('click'); await settle();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes + 1); assert.notEqual(h.backend.raw().receipts.at(-1), original.operationId);
        assert.equal(h.backend.raw().records.find(r => r.id === id).text, 'genuine newer original text');
        assert.equal(h.backend.raw().records.find(r => r.id === id).state, state); assert.equal(h.backend.raw().records.find(r => r.id === id).removedFrom, null);
    } finally { h.view.destroy(); }
});
for (const state of ['active', 'done']) test(`Restore to ${state} actual editor first blocks background action with zero I/O and unchanged ownership`, async () => {
    const h = model(); await settle();
    try {
        const action = restoreButton(h, state), other = h.controller.state.records.find(r => r.id === 'task_0004'); h.view.edit(other);
        const editor = h.document.querySelector('.tasks-editor'); assert(editor); input(editor, 'newer editor draft'); editor.focus();
        const before = { state: h.controller.state, status: h.controller.status, error: h.controller.error, retry: h.controller.retryCommand, undo: h.view.undo };
        await rejectsWithoutIO(h, action);
        assert.strictEqual(h.controller.state, before.state); assert.equal(h.controller.status, before.status); assert.strictEqual(h.controller.error, before.error);
        assert.strictEqual(h.controller.retryCommand, before.retry); assert.strictEqual(h.view.undo, before.undo); assert.equal(editor.value, 'newer editor draft'); assert.equal(h.document.activeElement, editor);
    } finally { h.view.destroy(); }
});
for (const state of ['active', 'done']) test(`Visible Restore to ${state} started before later editor finishes without stealing draft or focus`, async () => {
    const h = model(); await settle(); let release; const gate = new Promise(resolve => { release = resolve; });
    try {
        const action = restoreButton(h, state); action.focus(); h.backend.delay = gate; action.dispatch('click'); await settle();
        const original = h.controller.retryCommand; assert.equal(original.kind, 'restore'); assert.equal(h.backend.writes, 1); assert(h.controller.pending); assert.equal(h.controller.status, 'saving');
        h.view.edit(h.controller.state.records.find(r => r.id === 'task_0004')); const editor = h.document.querySelector('.tasks-editor'); assert(editor);
        input(editor, 'newer editor draft'); editor.focus(); release(); await settle();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, 1); assert.equal(h.backend.raw().receipts.at(-1), original.operationId);
        assert.equal(editor.value, 'newer editor draft'); assert.equal(h.document.activeElement, editor); assert.equal(h.view.undo, null);
    } finally { release(); h.view.destroy(); }
});
for (const state of ['active', 'done']) for (const locale of ['en', 'zh_CN', 'fallback']) test(`Restore to ${state} translated ${locale} works with normalized filter and direct Copy/Reuse order`, async () => {
    const h = model({ locale }); await settle();
    try {
        const query = state === 'active' ? '  SYNTHETIC TASK 2  ' : '  SYNTHETIC TASK 7  '; input(h.view.filterInput, query);
        const action = restoreButton(h, state), label = locale === 'zh_CN' ? h.window.i18n.t('tasksRestore') : 'Restore';
        assert.equal(action.textContent, label); assert.equal(action.dataset.taskAction, label);
        assert.equal(action.parentElement.children[0].classList.contains('tasks-copy-text'), true); assert.equal(action.parentElement.children[1].classList.contains('tasks-reuse-text'), true);
        assert.strictEqual(action.parentElement.children[2], action); action.dispatch('click'); await settle();
        assert.equal(h.backend.writes, 1); assert.equal(h.backend.raw().records.find(r => r.id === targetId(state)).state, state); assert.equal(h.view.filterInput.value, query);
    } finally { h.view.destroy(); }
});
for (const state of ['active', 'done']) for (const legacy of ['null', 'undefined', 'anonymous']) test(`Restore to ${state} preserves original ${legacy} workspace compatibility`, async () => {
    const h = model(legacy === 'anonymous' ? { legacyAvailability: true } : { legacy: true }); if (legacy === 'null') h.backend.workspace = null; await settle();
    try { restoreButton(h, state).dispatch('click'); await settle(); assert.equal(h.backend.writes, 1); assert.equal(h.backend.raw().records.find(r => r.id === targetId(state)).state, state); }
    finally { h.view.destroy(); }
});
for (const state of ['active', 'done']) for (const identityMode of ['full', 'id-only', 'generation-only']) for (const sessionMode of ['missing', 'wrong', 'absent']) test(`Restore to ${state} identified ${identityMode} rejects ${sessionMode} workspace session`, async () => {
    const h = model({ identityMode, sessionMode }); await settle(); try { await rejectsWithoutIO(h, restoreButton(h, state)); } finally { h.view.destroy(); }
});
for (const state of ['active', 'done']) for (const mode of ['false', 'ack']) for (const moved of ['host', 'list', 'filter', 'summary']) test(`Restore to ${state} ${mode} original Retry refuses moved construction ${moved} until original ancestry returns`, async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        failNext(h, mode); restoreButton(h, state).dispatch('click'); await settle(); const original = h.controller.retryCommand, effect = h.view.retryEffect; h.backend.mode = null;
        const node = moved === 'host' ? h.host : moved === 'list' ? h.view.removed.list : moved === 'filter' ? h.view.filter : h.view.removed.summary;
        const parent = node.parentElement, wrapper = h.document.createElement('div'); h.document.body.append(wrapper); node.remove(); wrapper.append(node);
        await rejectsWithoutIO(h, h.view.retry); assert.strictEqual(h.controller.retryCommand, original); assert.strictEqual(h.view.retryEffect, effect);
        node.remove(); parent.append(node); h.view.removed.box.open = false; input(h.view.filterInput, 'target remains hidden'); const counts = io(h);
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + (mode === 'ack' ? 0 : 1));
        assert.equal(h.backend.raw().receipts.at(-1), original.operationId); assert.equal(h.backend.raw().records.find(r => r.id === targetId(state)).state, state);
    } finally { h.view.destroy(); }
});
for (const state of ['active', 'done']) for (const selectOther of [false, true]) test(`Restore to ${state} exact duplicate text identity other=${selectOther}`, async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        const ids = [targetId(state), otherId(state)];
        for (const id of ids) {
            await h.remote.mutate(command(h.remote, 'restore', h.backend.raw().records.find(r => r.id === id)));
            await h.remote.mutate(command(h.remote, 'edit', h.backend.raw().records.find(r => r.id === id), { text: 'duplicate removed 中文 😀\ntext' }));
            await h.remote.mutate(command(h.remote, 'remove', h.backend.raw().records.find(r => r.id === id)));
        }
        await h.controller.refresh(); input(h.view.filterInput, 'duplicate removed'); const before = h.backend.raw(), id = ids[selectOther ? 1 : 0];
        restoreButton(h, state, id).dispatch('click'); await settle(); const after = h.backend.raw();
        assert.deepEqual(after.records.filter(r => r.id !== id), before.records.filter(r => r.id !== id));
        assert.equal(after.records.find(r => r.id === id).state, state); assert.equal(after.records.find(r => r.id === id).text, before.records.find(r => r.id === id).text); assert.equal(h.view.undo, null);
    } finally { h.view.destroy(); }
});
for (const state of ['active', 'done']) test(`Fresh visible Restore to ${state} merges unobserved unrelated revision/order/pin`, async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        const action = restoreButton(h, state);
        await h.remote.mutate(command(h.remote, 'edit', h.backend.raw().records[1], { text: 'unrelated independent edit' }));
        await h.remote.mutate(command(h.remote, 'moveLast', h.backend.raw().records[1], { order: order(h.backend.raw()) }));
        await h.remote.mutate(command(h.remote, 'pin', h.backend.raw().records.find(r => r.id === 'task_0006'), { expectedPin: h.backend.raw().pinnedId }));
        const before = h.backend.raw(), counts = io(h); action.dispatch('click'); await settle(); const after = h.backend.raw();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.requests, counts.requests + 1); assert.equal(h.backend.writes, counts.writes + 1);
        assert.equal(after.pinnedId, before.pinnedId); assert.deepEqual(after.records.map(r => r.id), before.records.map(r => r.id));
        assert.deepEqual(after.records.filter(r => r.id !== targetId(state)), before.records.filter(r => r.id !== targetId(state)));
        assert.equal(after.records.find(r => r.id === targetId(state)).state, state); assert.equal(after.records.find(r => r.id === targetId(state)).removedFrom, null);
    } finally { h.view.destroy(); }
});
for (const state of ['active', 'done']) test(`Restore to ${state} pending write blocks original and other row with zero additional request or I/O`, async () => {
    const h = model(); await settle(); let release; h.backend.delay = new Promise(resolve => { release = resolve; });
    try {
        const old = restoreButton(h, state), other = restoreButton(h, state, otherId(state)); old.dispatch('click'); await settle();
        const original = h.controller.retryCommand; assert(h.controller.pending); assert.equal(h.backend.writes, 1);
        await rejectsWithoutIO(h, old); assert.strictEqual(h.controller.retryCommand, original);
        await rejectsWithoutIO(h, other); assert.strictEqual(h.controller.retryCommand, original);
        release(); await settle(); assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, 1); assert.equal(h.backend.raw().receipts.at(-1), original.operationId);
    } finally { release(); h.view.destroy(); }
});
for (const state of ['active', 'done']) test(`Confirmed latest Restore-to-${state} receipt allows later independent current row action`, async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        failNext(h, 'ack'); restoreButton(h, state).dispatch('click'); await settle(); const original = h.controller.retryCommand; h.backend.mode = null;
        await h.controller.refresh(); await rejectsWithoutIO(h, restoreButton(h, state, otherId(state))); assert.strictEqual(h.controller.retryCommand, original);
        const writes = h.backend.writes; h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes);
        restoreButton(h, state, otherId(state)).dispatch('click'); await settle(); assert.equal(h.backend.writes, writes + 1);
        assert.equal(h.backend.raw().records.find(r => r.id === otherId(state)).state, state); assert.notEqual(h.backend.raw().receipts.at(-1), original.operationId);
    } finally { h.view.destroy(); }
});
for (const state of ['active', 'done']) for (const mode of ['READ', 'false', 'drop', 'ack']) test(`Original Remove Undo to ${state} keeps delayed ${mode} callback and Retry after saved row Restore identity`, async () => {
    const h = model(); await settle(); h.backend.notifications = false; let release;
    try {
        restoreButton(h, state).dispatch('click'); await settle(); const earlierAttempt = h.view.rowRestoreAttempt;
        assert.equal(earlierAttempt.command.kind, 'restore'); assert.equal(h.controller.status, 'saved');
        removeButton(h, state).dispatch('click'); await settle(); const id = state === 'active' ? 'task_0003' : 'task_0000';
        assert.equal(h.view.undo.id, id); const read = h.backend.read, gate = new Promise(resolve => { release = resolve; }); let intercepted = false;
        h.backend.read = async () => { if (!intercepted) { intercepted = true; await gate; } return read(); };
        failNext(h, mode); h.view.undoButton.dispatch('click'); await settle();
        const original = h.controller.retryCommand; assert.equal(original.kind, 'restore'); assert.notStrictEqual(original, earlierAttempt.command);
        assert.strictEqual(h.view.rowRestoreAttempt, earlierAttempt); assert(h.controller.pending); assert.equal(h.view.undo.id, id);
        release(); await settle(); assert.equal(h.controller.error.code, errorCode(mode)); assert.equal(h.view.undo.id, id);
        h.backend.mode = null;
        // Undo rejects a changed session, independently of the older row attempt.
        const undoSource = { controller: h.view.controller, store: h.controller.store, backend: h.store.backend, host: h.view.host,
            workspace: h.backend.workspace, id: h.backend.workspace?.id, generation: h.backend.workspace?.generation, session: h.window.LocalItabWorkspaces.session };
        const gap = { io: { requests: h.backend.requests, reads: h.backend.reads, writes: h.backend.writes }, raw: h.backend.raw(), error: h.controller.error,
            retry: h.controller.retryCommand, state: h.controller.state, undo: h.view.undo, rowAttempt: h.view.rowRestoreAttempt };
        h.window.LocalItabWorkspaces.session = {}; h.view.retry.dispatch('click'); await settle();
        assert.deepEqual({ requests: h.backend.requests, reads: h.backend.reads, writes: h.backend.writes }, gap.io); assert.deepEqual(h.backend.raw(), gap.raw);
        assert.strictEqual(h.controller.error, gap.error); assert.strictEqual(h.controller.retryCommand, gap.retry); assert.strictEqual(h.controller.state, gap.state);
        assert.strictEqual(h.view.undo, gap.undo); assert.strictEqual(h.view.rowRestoreAttempt, gap.rowAttempt);
        h.window.LocalItabWorkspaces.session = undoSource.session;
        // Invalidate only the row's section wrapper; keep the original Undo source and DOM.
        const section = h.view.removed, nodes = h.host.querySelectorAll('*'), draft = h.view.input.value, focused = h.document.activeElement;
        h.view.removed = { ...section };
        assert.strictEqual(h.view.removed.box, section.box); assert.strictEqual(h.view.removed.summary, section.summary); assert.strictEqual(h.view.removed.list, section.list);
        assert.equal(h.host.querySelectorAll('*').length, nodes.length); assert(h.host.querySelectorAll('*').every((node, index) => node === nodes[index]));
        assert.equal(h.view.input.value, draft); assert.strictEqual(h.document.activeElement, focused);
        assert.equal(h.view.rowRestoreSourceCurrent(h.view.rowRestoreOwner), false);
        assert.strictEqual(h.view.controller, undoSource.controller); assert.strictEqual(h.controller.store, undoSource.store); assert.strictEqual(h.store.backend, undoSource.backend);
        assert.strictEqual(h.view.host, undoSource.host); assert.strictEqual(h.backend.workspace, undoSource.workspace);
        assert.equal(h.backend.workspace?.id, undoSource.id); assert.equal(h.backend.workspace?.generation, undoSource.generation); assert.strictEqual(h.window.LocalItabWorkspaces.session, undoSource.session);
        const counts = io(h);
        h.view.retry.dispatch('click'); await settle();
        assert.equal(h.backend.requests, counts.requests); assert.equal(h.backend.writes, counts.writes + (mode === 'ack' ? 0 : 1));
        assert.equal(h.controller.status, 'saved'); assert.equal(h.view.undo, null); assert.equal(h.backend.raw().receipts.at(-1), original.operationId);
        assert.equal(h.backend.raw().records.find(r => r.id === id).state, state); assert.strictEqual(h.view.rowRestoreAttempt, earlierAttempt);
    } finally { release?.(); h.view.destroy(); }
});
for (const state of ['active', 'done']) test(`Anonymous original Restore to ${state} cannot adopt another anonymous workspace`, async () => {
    const h = model({ legacyAvailability: true }); await settle();
    try { h.backend.workspace = { invalidated: false, _suspended: false }; redraw(h); await rejectsWithoutIO(h, restoreButton(h, state)); }
    finally { h.view.destroy(); }
});
for (const state of ['active', 'done']) test(`Restore to ${state} never recreates a previous pin and preserves an unrelated existing Undo`, async () => {
    const h = model({ pinned: true }); await settle();
    try {
        removeButton(h, 'active').dispatch('click'); await settle(); const undo = h.view.undo, before = h.backend.raw();
        assert.equal(undo.id, 'task_0003'); assert.equal(before.pinnedId, null); assert.equal(before.records.find(r => r.id === 'task_0003').state, 'removed');
        restoreButton(h, state).dispatch('click'); await settle();
        assert.strictEqual(h.view.undo, undo); assert.equal(h.backend.raw().pinnedId, null); assert.equal(h.backend.raw().records.find(r => r.id === targetId(state)).state, state);
        restoreButton(h, 'active', 'task_0003').dispatch('click'); await settle();
        assert.equal(h.backend.raw().records.find(r => r.id === 'task_0003').state, 'active'); assert.equal(h.backend.raw().pinnedId, null);
    } finally { h.view.destroy(); }
});
