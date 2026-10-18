const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');
const tasks = require('../shared/local-tasks-store.js');
const { Controller } = require('../shared/local-tasks-controller.js');
const Workspaces = require('../shared/workspaces.js');
const clone = value => structuredClone(value);
const NOW = '2026-10-18T08:00:00.000Z';
const tick = () => new Promise(resolve => setImmediate(resolve));
async function settle() { await tick(); await tick(); await tick(); }
function initial() {
    return tasks.validate({ schemaVersion: 1, revision: 7, enabled: true, pinnedId: 'task_0001', receipts: ['receipt_prior'],
        records: ['active', 'active', 'done', 'removed'].map((state, i) => ({ id: `task_000${i}`, version: `version_${i}`,
            text: ['  Exact 中文 😀\nsecond line  ', '<b>plain & literal</b>', 'Completed café e\u0301', 'Removed 🧪\nkeep order'][i],
            state, removedFrom: state === 'removed' ? 'done' : null, createdAt: NOW, updatedAt: NOW })),
        recovery: [{ id: 'recovery_prior', createdAt: NOW, content: { records: [{ id: 'old_task_1', version: 'old_version_1',
            text: 'Previous 中文 copy', state: 'active', removedFrom: null, createdAt: NOW, updatedAt: NOW }], pinnedId: 'old_task_1' } }] });
}
// Real, independent Stores and Controllers start with identical legal state and
// even the same workspace object. Public-field substitutions are deliberate
// source-boundary fault injection, not normal workspace navigation or data loss.
function backend(workspace = { id: 'workspace_original', generation: 'generation_original' }) {
    let raw = initial(), queue = Promise.resolve(); const listeners = new Set();
    const b = { workspace, reads: 0, writes: 0, locks: 0, readGate: null, readError: false,
        lock(action) { b.locks++; const pending = queue.then(action); queue = pending.catch(() => {}); return pending; },
        async read() { b.reads++; const value = clone(raw), gate = b.readGate, error = b.readError; b.readGate = null; b.readError = false;
            if (gate) { gate.entered.resolve(); await gate.release.promise; } if (error) throw Error('Synthetic storage read failure'); return value; },
        async write(value) { b.writes++; raw = clone(value); },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, raw: () => clone(raw) };
    return b;
}
function source(b = backend()) { let serial = 0; const store = new tasks.Store(b, { id: () => `operation_${++serial}`, now: () => NOW });
    return { backend: b, store, controller: new Controller(store) }; }
function model(own = source()) {
    const document = createDocument({ aggregateTextContent: true }), host = document.createElement('article'); document.body.append(host);
    const api = { ...tasks, Controller }, window = { LocalItabTasks: api, LocalItabWorkspaces: { session: own.backend.workspace } };
    const files = { hooks: {}, blobs: [], urls: [], links: [], clicks: [], revoked: [], timers: [], events: [] };
    const hook = stage => { files.events.push(stage); const callback = files.hooks[stage]; if (callback) { delete files.hooks[stage]; callback(); } };
    class FileBlob extends Blob { constructor(parts, options) { super(parts, options); files.blobs.push(this); hook('blob'); } }
    const URL = { createObjectURL(blob) { const url = `blob:synthetic-export-${files.urls.length + 1}`; files.urls.push({ url, blob }); hook('url'); return url; },
        revokeObjectURL(url) { files.revoked.push(url); hook('revoke'); } };
    const create = document.createElement;
    document.createElement = tag => {
        const node = create(tag); if (tag !== 'a') return node;
        node.removes = 0; const remove = node.remove.bind(node);
        node.remove = () => { node.removes++; remove(); hook('remove'); };
        for (const name of ['href', 'download']) Object.defineProperty(node, name, { configurable: true,
            get() { return this[`_${name}`]; }, set(value) { this[`_${name}`] = value; hook(name); } });
        Object.defineProperty(node, 'click', { configurable: true, get() { hook('clickProperty'); return function () {
            assert.strictEqual(this, node); hook('click'); files.clicks.push({ link: node, href: node.href, download: node.download });
        }; } });
        hook('link'); files.links.push(node); return node;
    };
    const append = document.body.append.bind(document.body);
    document.body.append = (...nodes) => { append(...nodes); if (nodes.some(node => node.tagName === 'A')) hook('append'); };
    const context = vm.createContext({ window, document, crypto: webcrypto, URL, Blob: FileBlob,
        setTimeout(fn, delay) { files.timers.push({ fn, delay }); hook('timer'); }, console });
    for (const name of ['dialog-focus.js', 'local-tasks-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared', name), 'utf8'), context);
    const view = api.mount(host, { controller: own.controller, alwaysVisible: true });
    return { ...own, document, host, window, view, files };
}
async function pair() { const h = model(), foreign = source(backend(h.backend.workspace)); await foreign.controller.refresh(); await settle();
    assert.deepEqual(h.controller.state, foreign.controller.state); return { h, foreign }; }
function dispose(h, foreign) { h.view.destroy(); foreign?.controller.destroy(); }
const io = h => ({ locks: h.backend.locks, reads: h.backend.reads, writes: h.backend.writes });
const ui = h => ({ error: h.view.localError, status: h.view.status.textContent, failed: h.view.feedback.classList.contains('is-error'),
    retry: h.view.retry.hidden, draft: h.view.input.value, revision: h.view.renderedRevision });
function gateAt(b) { const gate = { entered: deferred(), release: deferred() }; b.readGate = gate; return gate; }
async function invalidImport(h) { h.view.fileInput.files = [{ size: 2, text: async () => '{}' }]; await h.view.importFile();
    assert.equal(h.view.localError.code, 'INVALID'); return h.view.localError; }
function oversizedImport(h) { h.view.fileInput.files = [{ size: tasks.LIMITS.bytes + 1, text: async () => '{}' }]; return h.view.importFile(); }
const substitutions = {
    controller(h, foreign) { h.view.controller = foreign.controller; return () => { h.view.controller = h.controller; }; },
    store(h, foreign) { h.controller.store = foreign.store; return () => { h.controller.store = h.store; }; },
    backend(h, foreign) { h.store.backend = foreign.backend; return () => { h.store.backend = h.backend; }; },
    workspace(h) { const prior = h.backend.workspace; h.backend.workspace = { ...prior }; return () => { h.backend.workspace = prior; }; },
    workspaceId(h) { const prior = h.backend.workspace.id; h.backend.workspace.id = 'workspace_replaced'; return () => { h.backend.workspace.id = prior; }; },
    workspaceGeneration(h) { const prior = h.backend.workspace.generation; h.backend.workspace.generation = 'generation_replaced'; return () => { h.backend.workspace.generation = prior; }; },
    session(h) { const prior = h.window.LocalItabWorkspaces.session; h.window.LocalItabWorkspaces.session = { ...prior }; return () => { h.window.LocalItabWorkspaces.session = prior; }; },
    host(h) { const replacement = h.document.createElement('article'); h.document.body.append(replacement); h.view.host = replacement; return () => { h.view.host = h.host; }; }
};
function cleaned(h, { downloaded = false } = {}) {
    assert.equal(h.document.querySelectorAll('a').length, 0, 'no temporary anchors remain');
    assert.ok(h.files.links.every(link => link.removes === 1), 'each allocated anchor is removed exactly once');
    if (downloaded) { assert.equal(h.files.timers.length, h.files.clicks.length); h.files.timers.forEach(timer => { assert.equal(timer.delay, 60000); timer.fn(); }); }
    assert.deepEqual(h.files.revoked.slice().sort(), h.files.urls.map(item => item.url).sort(), 'only exact allocated URLs are revoked once');
}

for (const [name, substitute] of Object.entries(substitutions)) test(`export entry rejects construction ${name} substitution without any read or file`, async () => {
    const { h, foreign } = await pair(); let restore;
    try { await invalidImport(h); const before = ui(h), own = io(h), other = io(foreign), original = h.backend.raw(), second = foreign.backend.raw();
        restore = substitute(h, foreign); await h.view.export();
        assert.deepEqual(io(h), own, 'original read is not dispatched from a foreign View'); assert.deepEqual(io(foreign), other, 'foreign source is never read');
        assert.equal(h.files.clicks.length, 0); assert.equal(h.files.blobs.length, 0); assert.deepEqual(ui(h), before);
        assert.deepEqual(h.backend.raw(), original); assert.deepEqual(foreign.backend.raw(), second);
    } finally { restore?.(); dispose(h, foreign); }
});

for (const [name, substitute] of Object.entries(substitutions)) for (const outcome of ['success', 'READ'])
    test(`export original ${outcome} cannot download or publish after ${name} changes during read`, async () => {
        const { h, foreign } = await pair(); let restore; const gate = gateAt(h.backend);
        try { const before = ui(h), own = io(h), other = io(foreign); h.backend.readError = outcome === 'READ';
            const pending = h.view.export(); await gate.entered.promise; restore = substitute(h, foreign); gate.release.resolve(); await pending;
            assert.equal(h.backend.reads, own.reads + 1, 'dispatched original read completes'); assert.deepEqual(io(foreign), other);
            assert.equal(h.files.clicks.length, 0, 'late original bytes must not be downloaded'); assert.equal(h.files.blobs.length, 0);
            assert.deepEqual(ui(h), before, 'late original feedback must not overwrite another source');
        } finally { gate.release.resolve(); restore?.(); dispose(h, foreign); }
    });

for (const stage of ['blob', 'url', 'link', 'href', 'download', 'append', 'clickProperty'])
    for (const [name, substitute] of Object.entries(substitutions)) test(`export ${stage} hook cannot activate a file after ${name} substitution`, async () => {
        const { h, foreign } = await pair(); let restore;
        try { await invalidImport(h); const before = ui(h), other = io(foreign);
            h.files.hooks[stage] = () => { restore = substitute(h, foreign); }; await h.view.export();
            assert.equal(h.files.clicks.length, 0, 'source ownership is checked after file/DOM hooks and before activation');
            assert.deepEqual(ui(h), before); assert.deepEqual(io(foreign), other); cleaned(h);
        } finally { restore?.(); dispose(h, foreign); }
    });

for (const stage of ['entry', 'read', 'url', 'append', 'clickProperty']) for (const revive of [false, true])
    test(`export ${stage} destruction${revive ? ' with public destroyed flag reset' : ''} cannot revive file effects`, async () => {
        const { h, foreign } = await pair(); const retire = () => { h.view.destroy(); if (revive) h.view.destroyed = false; };
        const gate = stage === 'read' ? gateAt(h.backend) : null;
        try { await invalidImport(h); const before = ui(h), start = io(h);
            if (stage === 'entry') retire(); else if (stage !== 'read') h.files.hooks[stage] = retire;
            const pending = h.view.export(); if (gate) { await gate.entered.promise; retire(); gate.release.resolve(); } await pending;
            assert.equal(h.files.clicks.length, 0); assert.deepEqual(ui(h), before); if (stage === 'entry') assert.deepEqual(io(h), start); cleaned(h);
        } finally { gate?.release.resolve(); dispose(h, foreign); }
    });

for (const stage of ['blob', 'url', 'link', 'href', 'download', 'append', 'click'])
    test(`export ${stage} failure after a source gap cannot overwrite actual local feedback`, async () => {
        const { h, foreign } = await pair(); let restore;
        try { await invalidImport(h); const before = ui(h);
            h.files.hooks[stage] = () => { restore = substitutions.controller(h, foreign); throw Error('Synthetic file failure'); };
            await h.view.export(); assert.deepEqual(ui(h), before); assert.equal(h.files.clicks.length, 0);
            // A throwing URL allocator never returns its URL to its caller.
            if (stage !== 'url') cleaned(h); else assert.equal(h.files.revoked.length, 0);
        } finally { restore?.(); dispose(h, foreign); }
    });

for (const outcome of ['success', 'READ', 'FILE']) test(`late original ${outcome} preserves newer actual import feedback on the same source`, async () => {
    const { h, foreign } = await pair(); const gate = gateAt(h.backend);
    try { h.backend.readError = outcome === 'READ'; if (outcome === 'FILE') h.files.hooks.click = () => { throw Error('Synthetic activation failure'); };
        const pending = h.view.export(); await gate.entered.promise; const newer = await invalidImport(h), before = ui(h); gate.release.resolve(); await pending;
        assert.strictEqual(h.view.localError, newer); assert.deepEqual(ui(h), before);
        assert.equal(h.files.clicks.length, outcome === 'success' ? 1 : 0, 'same-source downloads are independent of feedback ownership');
        cleaned(h, { downloaded: outcome === 'success' });
    } finally { gate.release.resolve(); dispose(h, foreign); }
});

for (const stage of ['url', 'append', 'click']) for (const fail of [false, true])
    test(`export ${stage} ${fail ? 'failure' : 'success'} preserves actual reentrant newer file error`, async () => {
        const { h, foreign } = await pair(); let newer, importing;
        try { h.files.hooks[stage] = () => { importing = oversizedImport(h); newer = h.view.localError; assert.equal(newer.code, 'SIZE_LIMIT');
                if (fail) throw Error('Synthetic file activation failure'); };
            await h.view.export(); await importing; assert.strictEqual(h.view.localError, newer); assert.match(h.view.status.textContent, /2 MB/);
            if (!(fail && stage === 'url')) cleaned(h, { downloaded: !fail });
        } finally { dispose(h, foreign); }
    });

test('successful original export preserves exact validated schema, text, order, pin, recovery and drafts', async () => {
    const { h, foreign } = await pair();
    try { await invalidImport(h); const state = h.backend.raw(), other = io(foreign); h.view.input.value = 'Unsaved quick draft';
        h.view.edit(h.controller.state.records[0]); const editor = h.document.querySelector('.tasks-editor'); editor.value = 'Unsaved editor draft';
        await h.view.export(); assert.equal(h.files.clicks.length, 1); assert.equal(h.files.blobs[0].type, 'application/json');
        const bytes = await h.files.blobs[0].text(), parsed = JSON.parse(bytes), checked = tasks.parseBackup(bytes);
        assert.deepEqual(Object.keys(parsed), ['format', 'schemaVersion', 'exportedAt', 'content', 'recovery']);
        assert.equal(parsed.format, tasks.FORMAT); assert.equal(parsed.schemaVersion, 1); assert.equal(parsed.exportedAt, NOW);
        assert.deepEqual(checked.content, { records: state.records, pinnedId: state.pinnedId }); assert.deepEqual(checked.recovery, state.recovery);
        assert.deepEqual(h.backend.raw(), state); assert.deepEqual(io(foreign), other); assert.equal(h.view.input.value, 'Unsaved quick draft');
        assert.equal(editor.value, 'Unsaved editor draft'); assert.equal(h.view.localError, null);
        assert.match(h.files.clicks[0].download, /^local-itab-tasks-\d{4}-\d{2}-\d{2}\.json$/); cleaned(h, { downloaded: true });
    } finally { dispose(h, foreign); }
});

test('two explicit original exports both download their actual snapshots and own their URL cleanup', async () => {
    const { h, foreign } = await pair(); const gate = gateAt(h.backend);
    try { const first = h.view.export(); await gate.entered.promise;
        const command = h.store.request('edit', { id: 'task_0000', version: 'version_0', text: 'Second exact export 中文 😀' });
        const changing = h.controller.run(command), second = h.view.export(); gate.release.resolve(); await Promise.all([first, changing, second]);
        assert.equal(h.files.clicks.length, 2, 'a newer explicit export does not cancel an older download');
        const files = await Promise.all(h.files.urls.map(async item => JSON.parse(await item.blob.text())));
        assert.equal(files[0].content.records[0].text, initial().records[0].text); assert.equal(files[1].content.records[0].text, 'Second exact export 中文 😀');
        assert.notEqual(h.files.clicks[0].href, h.files.clicks[1].href); cleaned(h, { downloaded: true });
    } finally { gate.release.resolve(); dispose(h, foreign); }
});

for (const mode of ['hidden', 'departing', 'detached', 'invalidated', 'suspended']) test(`original ${mode} availability does not acquire a new blanket export ban`, async () => {
    const { h, foreign } = await pair();
    try { if (mode === 'hidden') { h.host.hidden = true; h.document.hidden = true; }
        else if (mode === 'detached') h.host.remove(); else if (mode === 'departing') h.view.departing = true;
        else if (mode === 'invalidated') h.backend.workspace.invalidated = true; else h.backend.workspace._suspended = true;
        await h.view.export(); assert.equal(h.files.clicks.length, 1); assert.equal(h.view.localError, null); cleaned(h, { downloaded: true });
    } finally { dispose(h, foreign); }
});

async function sessionModel() {
    const entry = { id: 'workspace_original', generation: 'generation_original', deletedAt: null }; let raw = initial();
    const manager = { chrome: { storage: { onChanged: { addListener() {} } } }, subscribe() {}, async ready() {},
        async registry() { return { lastUsedId: entry.id, workspaces: [clone(entry)] }; },
        locks: { request(name, options, action) { return Promise.resolve().then(action); } }, async assertRestoreSettled() {},
        async readBundle() { return { [tasks.KEY]: clone(raw) }; }, async writeBundle(entry, next) { raw = clone(next[tasks.KEY]); } };
    const session = new Workspaces.Session(manager, entry.id); await session.ready();
    return { ...model(source(tasks.createChromeBackend(null, null, session))), session, entry, raw: () => clone(raw) };
}
for (const mode of ['suspended', 'invalidated']) test(`original real Session ${mode} still reaches storage and reports its actual export result`, async () => {
    const h = await sessionModel(); await settle();
    try { if (mode === 'suspended') h.session.suspendWrites(); else h.entry.generation = 'generation_retired';
        let expected; try { expected = await h.store.export(); } catch (error) { expected = error; }
        await h.view.export();
        if (typeof expected === 'string') { assert.equal(h.files.clicks.length, 1); assert.equal(await h.files.blobs[0].text(), expected); cleaned(h, { downloaded: true }); }
        else { assert.equal(h.view.localError.code, expected.code); assert.equal(h.files.clicks.length, 0); assert.equal(h.view.feedback.classList.contains('is-error'), true); }
    } finally { dispose(h); }
});
