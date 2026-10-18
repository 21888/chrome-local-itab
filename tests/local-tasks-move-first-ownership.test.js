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
function model({ legacy = false, legacyAvailability = false, locale = 'en', sessionMode = 'matching' } = {}) {
    const sources = new Map(), identities = new WeakMap(), listeners = new Set();
    let identity = 0, queue = Promise.resolve(), operation = 0;
    const backend = {
        workspace: legacy ? undefined : legacyAvailability ? { invalidated: false, _suspended: false } : { id: 'workspace_0001', generation: 'generation_0001' },
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
function moveButton(h, id = 'task_0003', label = 'Move to list start') {
    const item = row(h, id); assert(item, `rendered row ${id}`);
    item.querySelector('.tasks-row-menu').open = true;
    const action = button(item, label); assert(action, `move-to-start button ${id}`); return action;
}
const input = (node, value) => { node.value = value; node.dispatch('input'); };
const command = (store, kind, record, values = {}) => store.request(kind, { id: record.id, version: record.version, ...values });
function redraw(h) { h.view.renderedRevision = -1; h.view.render(); }
async function rejectsWithoutIO(h, action) {
    const before = h.backend.raw(), reads = h.backend.reads, writes = h.backend.writes, requests = h.backend.requests;
    action.dispatch('click'); await settle();
    assert.equal(h.backend.writes, writes, 'stale source must not write');
    assert.equal(h.backend.reads, reads, 'stale source must not read');
    assert.equal(h.backend.requests, requests, 'stale source must not create a replacement request');
    assert.deepEqual(h.backend.raw(), before);
}

for (const change of ['expand', 'collapse', 'filter', 'rerender', 'dispose']) test(`old moveFirst row remains rejected after ${change} and complete-row reattachment`, async () => {
    const h = model(); await settle();
    try {
        if (change === 'collapse') h.view.more.dispatch('click');
        const action = moveButton(h), old = row(h), list = h.view.list;
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

const sourceChanges = {
    object(h) { h.backend.workspace = { ...h.backend.workspace }; h.window.LocalItabWorkspaces.session = h.backend.workspace; },
    id(h) { h.backend.workspace.id = 'workspace_0002'; },
    generation(h) { h.backend.workspace.generation = 'generation_0002'; },
    session(h) { h.window.LocalItabWorkspaces.session = { ...h.backend.workspace }; }
};
for (const [name, change] of Object.entries(sourceChanges)) for (const freshRow of [false, true]) {
    test(`original view rejects changed workspace ${name} with identical records (${freshRow ? 'redrawn' : 'original'} row)`, async () => {
        const h = model(); await settle();
        try {
            let action = moveButton(h); const before = h.backend.raw(); change(h);
            assert.deepEqual(h.backend.raw(), before, 'distinct source contains identical synthetic records');
            if (freshRow) { redraw(h); action = moveButton(h); }
            await rejectsWithoutIO(h, action);
        } finally { h.view.destroy(); }
    });
}

test('view construction owns its workspace before the first async load renders rows', async () => {
    const h = model();
    try { sourceChanges.object(h); await settle(); await rejectsWithoutIO(h, moveButton(h)); }
    finally { h.view.destroy(); }
});

for (const mode of ['false', 'drop', 'ack']) test(`unresolved ${mode} write keeps the exact retry when a fresh moveFirst is clicked`, async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        h.backend.mode = mode; moveButton(h, 'task_0004').dispatch('click'); await settle();
        assert.equal(h.controller.status, 'error');
        assert.equal(h.controller.error.code, mode === 'drop' ? 'VERIFY' : 'WRITE');
        const request = h.controller.retryCommand; assert.equal(request.kind, 'moveFirst'); assert.equal(h.view.retry.hidden, false);
        h.backend.mode = null; const before = h.backend.raw();
        await rejectsWithoutIO(h, moveButton(h));
        assert.strictEqual(h.controller.retryCommand, request, 'fresh movement must not replace the unresolved operation');
        h.view.retry.dispatch('click'); await settle();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.controller.retryCommand, null);
        assert.deepEqual(order(h.backend.raw()), ['task_0004', 'task_0001', 'task_0003', 'task_0006', 'task_0008', 'task_0009']);
        assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
        assert.equal(h.backend.writes, mode === 'ack' ? 1 : 2);
        if (mode === 'ack') assert.deepEqual(h.backend.raw(), before);
    } finally { h.view.destroy(); }
});

for (const legacy of [false, true]) test(`current original ${legacy ? 'legacy' : 'workspace'} row retains one-write move, pin, draft and focus`, async () => {
    const h = model({ legacy }); await settle();
    try {
        const before = h.backend.raw(); input(h.view.input, 'unsaved 中文 draft'); h.view.input.focus();
        moveButton(h, 'task_0004').dispatch('click'); await settle(); const after = h.backend.raw();
        assert.equal(h.backend.writes, 1); assert.equal(after.revision, before.revision + 1);
        assert.deepEqual(order(after), ['task_0004', 'task_0001', 'task_0003', 'task_0006', 'task_0008', 'task_0009']);
        assert.equal(after.pinnedId, before.pinnedId); assert.deepEqual(after.recovery, before.recovery);
        for (const task of before.records) assert.deepEqual(after.records.find(record => record.id === task.id), task);
        assert.equal(h.view.input.value, 'unsaved 中文 draft'); assert.equal(h.document.activeElement, h.view.input);
    } finally { h.view.destroy(); }
});

test('legacy null/undefined restoration permits the original row after temporary unavailable sources', async () => {
    const h = model({ legacy: true }); await settle();
    try {
        const action = moveButton(h);
        h.backend.workspace = { invalidated: true }; await rejectsWithoutIO(h, action);
        h.backend.workspace = { _suspended: true }; await rejectsWithoutIO(h, action);
        h.backend.workspace = null; button(row(h), 'Edit').dispatch('click'); await rejectsWithoutIO(h, action);
        button(h.document.body, 'Cancel').dispatch('click'); action.dispatch('click'); await settle();
        assert.equal(h.backend.writes, 1); assert.equal(order(h.backend.raw())[0], 'task_0003');
    } finally { h.view.destroy(); }
});

test('real conflict refresh permits a new explicit current-row move without reviving its old row', async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        const old = moveButton(h), oldRow = row(h), state = h.backend.raw();
        await h.remote.mutate(command(h.remote, 'edit', state.records[3], { text: 'new reviewed synthetic text' }));
        old.dispatch('click'); await settle(); assert.equal(h.controller.error.code, 'CONFLICT'); assert.equal(h.view.retry.hidden, true);
        const previous = h.controller.retryCommand, current = moveButton(h), currentRow = row(h);
        currentRow.replaceWith(oldRow); await rejectsWithoutIO(h, old);
        oldRow.replaceWith(currentRow); current.dispatch('click'); await settle();
        assert.equal(h.controller.status, 'saved'); assert.equal(order(h.backend.raw())[0], 'task_0003');
        assert.notEqual(h.backend.raw().receipts.at(-1), previous.operationId);
        assert.equal(h.backend.raw().records.find(record => record.id === 'task_0003').text, 'new reviewed synthetic text');
    } finally { h.view.destroy(); }
});

const denied = {
    'disabled property': (h, action) => { action.disabled = true; },
    'disabled attribute': (h, action) => action.setAttribute('disabled', ''),
    'aria-disabled action': (h, action) => action.setAttribute('aria-disabled', 'true'),
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
    'reparented first': (h, action) => { action.remove(); row(h).append(action); },
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
for (const [name, change] of Object.entries(denied)) test(`moveFirst rejects ${name} without creating a request or performing I/O`, async () => {
    const h = model(); await settle();
    try { const action = moveButton(h); change(h, action); await rejectsWithoutIO(h, action); }
    finally { h.view.destroy(); }
});

for (const name of ['controller', 'store', 'backend']) for (const freshRow of [false, true]) test(`construction-owned ${name} cannot be replaced (${freshRow ? 'redrawn' : 'original'} row)`, async () => {
    const h = model(); await settle();
    try {
        let action = moveButton(h);
        if (name === 'controller') h.view.controller = { ...h.controller };
        else if (name === 'store') h.controller.store = new tasks.Store(h.backend);
        else h.store.backend = { ...h.backend };
        if (freshRow) { redraw(h); action = moveButton(h); }
        await rejectsWithoutIO(h, action);
    } finally { h.view.controller = h.controller; h.controller.store = h.store; h.store.backend = h.backend; h.view.destroy(); }
});

const lateChanges = {
    ...sourceChanges,
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
for (const [name, change] of Object.entries(lateChanges)) test(`final layout getter changing ${name} is rechecked before request creation`, async () => {
    const h = model(); await settle(); let rootReads = 0;
    try {
        const action = moveButton(h), getStyle = h.window.getComputedStyle;
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

for (const fields of [{ defaultPrevented: true }, { detail: 2 }, { repeat: true }, { isComposing: true }, { keyCode: 229 }]) test(`moveFirst rejects blocked activation ${JSON.stringify(fields)}`, async () => {
    const h = model(); await settle();
    try {
        const action = moveButton(h), reads = h.backend.reads;
        action.dispatch('click', fields); await settle();
        assert.equal(h.backend.requests, 0); assert.equal(h.backend.writes, 0); assert.equal(h.backend.reads, reads);
    } finally { h.view.destroy(); }
});
for (const key of ['Enter', ' ']) test(`moveFirst ${JSON.stringify(key)} repeat and IME guard permits ordinary native-button activation`, async () => {
    const h = model(); await settle();
    try {
        const action = moveButton(h);
        for (const fields of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) assert.equal(action.dispatch('keydown', { key, ...fields }).prevented, true);
        assert.equal(action.dispatch('keydown', { key }).prevented, false); assert.equal(h.backend.requests, 0);
        action.dispatch('click', { detail: 0 }); await settle(); assert.equal(h.backend.writes, 1);
    } finally { h.view.destroy(); }
});

for (const sessionMode of ['missing', 'wrong']) test(`a workspace created with ${sessionMode} session remains unavailable after redraw`, async () => {
    const h = model({ sessionMode }); await settle();
    try { await rejectsWithoutIO(h, moveButton(h)); redraw(h); await rejectsWithoutIO(h, moveButton(h)); }
    finally { h.view.destroy(); }
});

for (const locale of ['en', 'zh_CN', 'fallback']) test(`current action stays independent of sibling controls and quick-entry composition (${locale})`, async () => {
    const h = model({ locale }); await settle();
    try {
        const label = locale === 'zh_CN' ? '移到列表首位' : 'Move to list start', action = moveButton(h, 'task_0003', label);
        const actions = row(h).querySelector('.tasks-row-actions');
        for (const sibling of [...actions.children]) if (sibling !== action) sibling.remove();
        input(h.view.input, '正在输入的草稿'); h.view.input.focus(); h.view.input.dispatch('compositionstart');
        action.dispatch('click'); await settle(); assert.equal(h.backend.writes, 1);
        assert.equal(h.view.input.value, '正在输入的草稿'); assert.equal(h.view.quickEntryComposing, true); assert.equal(h.document.activeElement, h.view.input);
    } finally { h.view.destroy(); }
});

test('real pending move coalesces with exact receipt while newer draft and search focus survive', async () => {
    const h = model(); await settle(); const gate = deferred();
    try {
        h.backend.delay = gate.promise; const action = moveButton(h, 'task_0004'); action.focus(); action.dispatch('click'); await settle();
        const request = h.controller.retryCommand; assert.equal(h.controller.status, 'saving'); assert.equal(h.backend.writes, 1);
        action.dispatch('click'); moveButton(h).dispatch('click'); assert.strictEqual(h.controller.retryCommand, request); assert.equal(h.backend.requests, 1);
        input(h.view.input, 'later draft'); h.search.focus(); gate.resolve(); await settle();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, 1); assert.equal(h.document.activeElement, h.search); assert.equal(h.view.input.value, 'later draft');
    } finally { gate.resolve(); h.view.destroy(); }
});

for (const mode of ['false', 'drop', 'ack']) for (const change of ['object', 'id', 'generation', 'session', 'store', 'backend']) {
    test(`moveFirst Retry source boundary rejects ${change} after ${mode} failure`, async () => {
        const h = model(), foreign = model(); await settle();
        h.backend.notifications = false; foreign.backend.notifications = false;
        try {
            h.backend.mode = mode; moveButton(h, 'task_0004').dispatch('click'); await settle();
            assert.equal(h.controller.error.code, mode === 'drop' ? 'VERIFY' : 'WRITE');
            const request = h.controller.retryCommand; assert.equal(request.kind, 'moveFirst'); assert.equal(h.view.retry.hidden, false);
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
            assert.deepEqual(order(h.backend.raw()), ['task_0004', 'task_0001', 'task_0003', 'task_0006', 'task_0008', 'task_0009']);
            assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
        } finally {
            h.controller.store = h.store; h.store.backend = h.backend; h.view.destroy(); foreign.view.destroy();
        }
    });
}

test('same-source acknowledgement Retry survives reload, redraw and changed displayed order without a second write', async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        h.backend.mode = 'ack'; moveButton(h, 'task_0004').dispatch('click'); await settle();
        const request = h.controller.retryCommand, after = h.backend.raw(); assert.equal(h.controller.error.code, 'WRITE');
        h.backend.mode = null; await h.controller.refresh(); redraw(h); h.view.more.dispatch('click');
        assert.equal(order(h.controller.state)[0], 'task_0004'); assert.equal(moveButton(h, 'task_0004').disabled, true);
        input(h.view.input, 'draft while acknowledging'); h.view.input.focus(); h.view.retry.dispatch('click'); await settle();
        assert.equal(h.controller.status, 'saved'); assert.equal(h.controller.retryCommand, null); assert.equal(h.backend.writes, 1);
        assert.deepEqual(h.backend.raw(), after); assert.equal(after.receipts.at(-1), request.operationId);
        assert.equal(h.view.input.value, 'draft while acknowledging'); assert.equal(h.document.activeElement, h.view.input);
    } finally { h.view.destroy(); }
});

for (const mode of ['false', 'drop']) test(`same-source ${mode} Retry after unrelated remote edit retains the exact request and latest other record`, async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        h.backend.mode = mode; moveButton(h, 'task_0004').dispatch('click'); await settle(); const request = h.controller.retryCommand;
        h.backend.mode = null; const before = h.backend.raw();
        await h.remote.mutate(command(h.remote, 'edit', before.records[3], { text: 'new unrelated synthetic record' }));
        const edited = h.backend.raw().records.find(task => task.id === 'task_0003'); await h.controller.refresh(); redraw(h);
        assert.strictEqual(h.controller.retryCommand, request); const writes = h.backend.writes;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved'); assert.equal(h.backend.writes, writes + 1);
        assert.deepEqual(h.backend.raw().records.find(task => task.id === 'task_0003'), edited);
        assert.equal(order(h.backend.raw())[0], 'task_0004'); assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
    } finally { h.view.destroy(); }
});

test('same-source acknowledgement Retry after a later unrelated edit reaches receipt validation and conflicts without another write', async () => {
    const h = model(); await settle(); h.backend.notifications = false;
    try {
        h.backend.mode = 'ack'; moveButton(h, 'task_0004').dispatch('click'); await settle(); const request = h.controller.retryCommand;
        h.backend.mode = null; const before = h.backend.raw();
        await h.remote.mutate(command(h.remote, 'edit', before.records.find(task => task.id === 'task_0003'), { text: 'later unrelated synthetic record' }));
        await h.controller.refresh(); redraw(h); const latest = h.backend.raw(), reads = h.backend.reads, writes = h.backend.writes;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.error.code, 'CONFLICT');
        assert(h.backend.reads > reads, 'same-source retry reached receipt validation'); assert.equal(h.backend.writes, writes);
        assert.deepEqual(h.backend.raw(), latest); assert.strictEqual(h.controller.retryCommand, request);
    } finally { h.view.destroy(); }
});

for (const mode of ['false', 'drop', 'ack']) test(`legacy ${mode} Retry stays available after temporary unavailability and nullish source restoration`, async () => {
    const h = model({ legacy: true }); await settle(); h.backend.notifications = false;
    try {
        h.backend.mode = mode; moveButton(h, 'task_0004').dispatch('click'); await settle(); const request = h.controller.retryCommand;
        h.backend.mode = null; h.backend.workspace = { invalidated: true };
        const reads = h.backend.reads, writes = h.backend.writes; h.view.retry.dispatch('click'); await settle();
        assert.equal(h.backend.reads, reads); assert.equal(h.backend.writes, writes); assert.strictEqual(h.controller.retryCommand, request);
        h.backend.workspace = null; h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved');
        assert.equal(h.backend.writes, writes + (mode === 'ack' ? 0 : 1)); assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
    } finally { h.view.destroy(); }
});

test('original anonymous availability object without a workspace service retains current-row movement', async () => {
    const h = model({ legacyAvailability: true }); await settle();
    try {
        assert.equal(h.window.LocalItabWorkspaces, undefined); assert.equal(h.backend.workspace.id, undefined); assert.equal(h.backend.workspace.generation, undefined);
        const before = h.backend.raw(); input(h.view.input, 'legacy availability draft'); h.view.input.focus();
        moveButton(h, 'task_0004').dispatch('click'); await settle();
        assert.equal(h.backend.writes, 1); assert.equal(order(h.backend.raw())[0], 'task_0004');
        assert.equal(h.backend.raw().pinnedId, before.pinnedId); assert.deepEqual(h.backend.raw().recovery, before.recovery);
        assert.equal(h.view.input.value, 'legacy availability draft'); assert.equal(h.document.activeElement, h.view.input);
    } finally { h.view.destroy(); }
});

for (const mode of ['false', 'drop', 'ack']) test(`original anonymous availability object retains same-source ${mode} Retry`, async () => {
    const h = model({ legacyAvailability: true }); await settle(); h.backend.notifications = false;
    try {
        h.backend.mode = mode; moveButton(h, 'task_0004').dispatch('click'); await settle();
        assert.equal(h.controller.error.code, mode === 'drop' ? 'VERIFY' : 'WRITE'); const request = h.controller.retryCommand;
        h.backend.mode = null; await h.controller.refresh(); redraw(h); const writes = h.backend.writes;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved');
        assert.equal(h.backend.writes, writes + (mode === 'ack' ? 0 : 1)); assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
        assert.equal(order(h.backend.raw())[0], 'task_0004');
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
for (const [name, change] of Object.entries(availabilityChanges)) for (const freshRow of [false, true]) test(`anonymous availability rejects ${name} (${freshRow ? 'redrawn' : 'original'} row)`, async () => {
    const h = model({ legacyAvailability: true }); await settle();
    try {
        let action = moveButton(h); change(h);
        if (freshRow) { redraw(h); action = moveButton(h); }
        await rejectsWithoutIO(h, action);
    } finally { h.view.destroy(); }
});

for (const [name, change] of Object.entries(availabilityChanges)) for (const mode of ['false', 'drop', 'ack']) test(`anonymous availability ${mode} Retry rejects ${name} until the original source returns`, async () => {
    const h = model({ legacyAvailability: true }); await settle(); h.backend.notifications = false;
    try {
        const availability = h.backend.workspace;
        h.backend.mode = mode; moveButton(h, 'task_0004').dispatch('click'); await settle();
        const request = h.controller.retryCommand; assert.equal(request.kind, 'moveFirst'); h.backend.mode = null; change(h);
        const before = h.backend.raw(), reads = h.backend.reads, writes = h.backend.writes;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.backend.reads, reads); assert.equal(h.backend.writes, writes);
        assert.deepEqual(h.backend.raw(), before); assert.strictEqual(h.controller.retryCommand, request);
        h.backend.workspace = availability; delete availability.id; delete availability.generation;
        availability.invalidated = false; availability._suspended = false; delete h.window.LocalItabWorkspaces;
        h.view.retry.dispatch('click'); await settle(); assert.equal(h.controller.status, 'saved');
        assert.equal(h.backend.writes, writes + (mode === 'ack' ? 0 : 1)); assert.equal(h.backend.raw().receipts.at(-1), request.operationId);
    } finally { h.view.destroy(); }
});

test('identified workspace without any service is never treated as an anonymous availability object', async () => {
    const h = model({ sessionMode: 'absent' }); await settle();
    try {
        await rejectsWithoutIO(h, moveButton(h)); redraw(h); await rejectsWithoutIO(h, moveButton(h));
        h.window.LocalItabWorkspaces = { session: h.backend.workspace }; redraw(h); await rejectsWithoutIO(h, moveButton(h));
    } finally { h.view.destroy(); }
});
