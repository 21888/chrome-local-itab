/* Synthetic browser-realm tests: real page scripts, stores, workspace locks and host. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const Context = require('../shared/ai-context');
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
async function page({ initialized = true, normalize = true, autoBoot = true } = {}) {
    const document = createDocument({ blurUnavailableFocus: true }), create = document.createElement;
    if (normalize) document.createElement = tag => { const node = create(tag); if (tag === 'textarea') {
        let value = ''; Object.defineProperty(node, 'value', { get: () => value, set: next => { value = String(next).replace(/\r\n?/g, '\n'); } });
    } return node; };
    document.documentElement = { dataset: {} };
    const host = document.createElement('div'); host.id = 'collection-library'; document.body.append(host);
    const raw = {}, writes = [], listeners = new Set(), events = new Map(), queues = new Map(), copies = [], grants = [], sends = [];
    let confirm = true, readHook = null; const confirmations = [];
    const chrome = { permissions: { request: async value => { grants.push(value); return true; }, contains: async () => true }, storage: {
        local: { async get(keys) { if (readHook) await readHook(keys); return structuredClone(keys == null ? raw : Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]]))); }, async set(values) {
            writes.push(structuredClone(values)); const changes = {};
            for (const [key, value] of Object.entries(values)) { changes[key] = { oldValue: raw[key], newValue: structuredClone(value) }; raw[key] = structuredClone(value); }
            for (const listener of [...listeners]) listener(changes, 'local');
        } }, onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) }
    }, runtime: { sendMessage: async () => null } };
    const locks = { request(name, options, action) { action ||= options; const next = (queues.get(name) || Promise.resolve()).then(action); queues.set(name, next.catch(() => {})); return next; } };
    const window = { document, chrome, navigator: { locks, clipboard: { writeText: async text => copies.push(text) } }, crypto: webcrypto,
        URL, URLSearchParams, TextEncoder, TextDecoder, AbortController, setTimeout, clearTimeout, Intl, console,
        location: { href: 'chrome-extension://synthetic/collections.html', search: '', pathname: '/collections.html', assign() {} }, history: { replaceState() {} },
        i18n: { t: key => key, localizeDocument() {} }, confirm: message => { confirmations.push(message); return confirm; },
        addEventListener(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
        removeEventListener(type, fn) { events.get(type)?.delete(fn); }, fetch: async (...args) => { sends.push(args); throw Error('No network in tests'); } };
    window.window = window; const context = vm.createContext(window), run = code => vm.runInContext(code, context);
    const scripts = [...fs.readFileSync('collections.html', 'utf8').matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
    for (const script of scripts.filter(script => !['i18n.js', 'collections.js'].includes(script))) run(fs.readFileSync(script, 'utf8'));
    run('const originalContextFactory = LocalItabAIContext.createController; LocalItabAIContext.createController = options => (globalThis.contextController = originalContextFactory(options));');
    if (initialized) await run('LocalItabWorkspaces.manager.ready()');
    await run(`globalThis.seedStore = new LocalItabAICollections.Store(LocalItabWorkspaces.manager.createCollectionBackend(LocalItabAICollections));
        seedStore.mutate(seedStore.request('add', { title: '<b>Synthetic excerpt</b>', body: 'first\\rsecond\\r\\nthird\\n🧪', sourceUrl: 'https://source.example/exact', notes: 'Do not include annotations' }))`);
    const record = await run('(async () => (await seedStore.read()).records[0])()');
    // Reopen the collection with a fresh Manager, as a real separate browser page does.
    // No initialized manager or activated legacy listener leaks in from fixture setup.
    listeners.clear();
    run(`LocalItabWorkspaces.manager = LocalItabWorkspaces.createManager(); LocalItabWorkspaces.session = LocalItabWorkspaces.manager.capture();
        window.storageManager = new StorageManager();`);
    if (autoBoot) { run(fs.readFileSync('collections.js', 'utf8')); await settle(); }
    writes.length = 0;
    const q = selector => document.querySelector(selector), button = text => document.querySelectorAll('button').find(node => (node.textContent || '').startsWith(text));
    const click = text => { const node = button(text); assert(node, text); assert.equal(Boolean(node.disabled), false, text); node.dispatch('click'); };
    const open = async () => { click('Continue asking'); await settle(); };
    return { window, context, run, document, raw, record, writes, copies, grants, sends, confirmations, events, q, button, click, open,
        setConfirm: value => { confirm = value; }, setReadHook: fn => { readHook = fn; }, emit: type => { for (const fn of events.get(type) || []) fn({}); },
        input(selector, value) { const node = q(selector); node.value = value; node.dispatch('input'); },
        reference: () => run('({ id: localCollectionsView.controller.record().id, version: localCollectionsView.controller.record().version, currentVersionId: localCollectionsView.controller.record().currentVersionId })') };
}
function quiet(h) { assert.equal(h.writes.length, 0); assert.equal(h.copies.length + h.grants.length + h.sends.length, 0); }
function checks(h) { return h.document.querySelectorAll('.ai-context-source').filter(row => row.querySelector('input').checked); }

test('reference boundary accepts only three own ID/version data values', () => {
    const ref = { id: 'record_0001', version: 'record_v001', currentVersionId: 'body_v0001' };
    assert.deepEqual(Context.collectionReference(ref), ref);
    for (const value of [null, {}, { ...ref, text: 'private' }, { ...ref, version: 'old' }, { ...ref, id: 'x'.repeat(101) }]) assert.equal(Context.collectionReference(value), null);
    let accessed = false; assert.equal(Context.collectionReference({ ...ref, get id() { accessed = true; return 'record_0001'; } }), null); assert.equal(accessed, false);
});

test('actual collection page loads complete adapters and reviews exact current source without any side effect', async () => {
    const h = await page(); await h.open();
    assert(h.q('.ai-context-dialog')); assert.match(h.q('.ai-context-collection-status').textContent, /not selected yet/);
    assert.equal(checks(h).length, 0); assert.equal(h.q('.ai-context-question').value, '');
    assert.equal(h.q('.ai-context-collection-text').textContent, h.record.body.replace(/\r\n?/g, '\n'));
    const info = h.q('.ai-context-collection-info').textContent;
    for (const value of [h.record.id, h.record.version, h.record.currentVersionId, h.record.sourceUrl]) assert(info.includes(value));
    assert.equal(h.q('.ai-context-collection-text').textContent.includes(h.record.notes), false);
    assert.equal(h.document.querySelectorAll('b').length, 0); quiet(h);
    h.click('Use this excerpt'); await settle(); assert.equal(checks(h).length, 1);
    h.input('.ai-context-question', 'Explain it'); h.click('Review prompt locally'); await settle();
    assert.equal(h.window.aiContextView.pending, false);
    assert(h.q('.ai-context-local-prompt').value.includes(JSON.stringify(h.record.body)));
    quiet(h);
});

for (const condition of ['empty', 'interrupted', 'legacy-conflict', 'restore-pending']) test(`actual new host refuses ${condition} workspace with zero writes`, async () => {
    const h = await page({ initialized: condition !== 'empty' && condition !== 'interrupted' });
    if (condition === 'interrupted') h.raw.__localItabWorkspacePreMigrationV1 = { schemaVersion: 1 };
    if (condition === 'legacy-conflict') h.raw.clock = { stale: true };
    if (condition === 'restore-pending') h.raw.__localItabCombinedRestoreV1 = { schemaVersion: 1, id: 'restore_001', status: 'submitted' };
    await h.open(); assert.equal(h.q('.ai-context-dialog'), null); assert.match(h.window.localCollectionsView.status.textContent, /normal new-tab/); quiet(h);
});

for (const change of ['revise', 'metadata', 'archive', 'unreadable']) test(`final apply freshly refuses ${change} without substituting current or historical source`, async () => {
    const h = await page(); await h.open();
    if (change === 'unreadable') h.setReadHook(keys => { if (keys.includes('__localItabAICollectionsV1')) throw Error('read denied'); });
    else {
        const record = h.raw.__localItabAICollectionsV1.records[0];
        if (change === 'revise') { record.body = record.history.at(-1).body = 'New body'; record.version = 'new_version_0001'; }
        if (change === 'metadata') { record.title = 'New title'; record.version = 'new_version_0001'; }
        if (change === 'archive') record.deletedAt = '2026-10-14T00:00:00.000Z';
    }
    h.click('Use this excerpt'); await settle(); assert.equal(checks(h).length, 0); assert.match(h.q('.ai-context-collection-status').textContent, /unavailable/); quiet(h);
});

test('cancel/restore preserve raw CRLF and CR through later local review', async () => {
    const h = await page(); await h.open(); h.click('Use this excerpt'); await settle();
    let editor = h.q('.ai-context-source').querySelector('textarea'); editor.value = 'edited'; editor.dispatch('input');
    editor.value = h.record.body; editor.dispatch('input');
    h.click('Restore original'); h.input('.ai-context-question', 'Check'); h.click('Review prompt locally'); await settle();
    assert(h.q('.ai-context-local-prompt').value.includes(JSON.stringify(h.record.body)));
    h.click('Cancel / clear'); assert.equal(checks(h).length, 0); assert.equal(h.q('.ai-context-collection-review').hidden, true);
    const check = h.q('.ai-context-source').querySelector('input'); check.checked = true; check.dispatch('change');
    h.input('.ai-context-question', 'Again'); h.click('Review prompt locally'); await settle();
    assert(h.q('.ai-context-local-prompt').value.includes(JSON.stringify(h.record.body))); quiet(h);
});

test('already-open draft cancellation preserves the same DOM, question, selections and review without reads', async () => {
    const h = await page(); await h.open(); h.click('Use this excerpt'); await settle(); h.input('.ai-context-question', 'Keep me'); h.click('Review prompt locally'); await settle();
    h.setConfirm(false); const dialog = h.q('.ai-context-dialog'), prompt = h.q('.ai-context-local-prompt').value;
    let reads = 0; h.setReadHook(() => { reads++; });
    assert.equal(await h.window.LocalItabAIContextEntry.openCollection(h.reference()), false);
    assert.equal(reads, 0); assert.equal(h.q('.ai-context-dialog'), dialog); assert.equal(h.q('.ai-context-question').value, 'Keep me');
    assert.equal(h.q('.ai-context-local-prompt').value, prompt); assert.equal(checks(h).length, 1); quiet(h);
});

for (const lock of ['busy', 'pendingCommand', 'pendingReadGeneration', 'error']) test(`collection admission retains 128 ${lock} guard`, async () => {
    const h = await page(), c = h.window.localCollectionsView.controller;
    c[lock] = lock === 'pendingReadGeneration' ? c.readGeneration : lock === 'error' ? { code: 'READ' } : true;
    assert.equal(await h.window.LocalItabAIContextEntry.openCollection(h.reference()), false); assert.equal(h.q('.ai-context-dialog'), null); quiet(h);
});

test('pending preview invalidates on hide/show and never delivers a late ticket', async () => {
    const h = await page(), gate = deferred(); let reads = 0;
    h.setReadHook(async keys => { if (keys.includes('__localItabAICollectionsV1') && ++reads === 2) await gate.promise; });
    h.click('Continue asking'); await settle();
    h.document.visibilityState = 'hidden'; h.document.listeners.get('visibilitychange')({}); h.document.visibilityState = 'visible'; h.document.listeners.get('visibilitychange')({});
    gate.resolve(); await settle(); assert.equal(h.button('Use this excerpt').disabled, true); assert.equal(checks(h).length, 0); quiet(h);
});

test('actual collection host can explicitly confirm extracted tasks through real workspace validator and fences', async () => {
    const h = await page(); await h.open();
    h.run(`LocalItabAIModel.run = async () => ({ text: '{"tasks":["Synthetic task"]}' });`);
    h.input('.ai-context-question', 'Extract'); h.input('.ai-context-endpoint', 'https://mock.example/v1/chat/completions'); h.input('.ai-context-model', 'synthetic');
    const mode = h.q('.ai-context-mode'); mode.value = 'tasks'; mode.dispatch('change'); h.click('Review exact'); await settle(); h.click('Send reviewed'); await settle();
    h.click('Review extracted'); await settle(); quiet(h); h.click('Add these tasks'); await settle();
    assert.equal(h.writes.length, 1); assert(h.writes[0][Object.keys(h.writes[0])[0]].values.__localItabPersonalTasksV1.records.some(record => record.text === 'Synthetic task'));
});

for (const lock of ['busy', 'saveCommand', 'taskCommand']) test(`existing context ${lock} cannot be replaced or selected through the handoff`, async () => {
    const h = await page(); await h.open(); const dialog = h.q('.ai-context-dialog');
    h.window.contextController[lock] = true;
    assert.equal(await h.window.LocalItabAIContextEntry.openCollection(h.reference()), false);
    h.button('Use this excerpt').dispatch('click'); await settle();
    assert.equal(h.q('.ai-context-dialog'), dialog); assert.equal(checks(h).length, 0); assert.equal(h.confirmations.length, 0); quiet(h);
});

for (const change of ['refresh', 'uncertain', 'dispose']) test(`parent collection ${change} while final read is pending refuses selection`, async () => {
    const h = await page(); await h.open(); const gate = deferred(); let held = false;
    h.setReadHook(async keys => { if (!held && keys.includes('__localItabAICollectionsV1')) { held = true; await gate.promise; } });
    h.click('Use this excerpt'); await settle();
    const c = h.window.localCollectionsView.controller;
    if (change === 'refresh') void c.refresh();
    if (change === 'uncertain') c.pendingCommand = true;
    if (change === 'dispose') c.dispose();
    gate.resolve(); await settle(); assert.equal(checks(h).length, 0); assert.match(h.q('.ai-context-collection-status').textContent, /unavailable/); quiet(h);
});

for (const phase of [1, 2]) test(`hide/show before initial collection read ${phase} finishes cannot revive this handoff`, async () => {
    const h = await page(), gate = deferred(); let reads = 0;
    h.setReadHook(async keys => { if (keys.includes('__localItabAICollectionsV1') && ++reads === phase) await gate.promise; });
    h.click('Continue asking'); await settle();
    h.document.visibilityState = 'hidden'; h.document.listeners.get('visibilitychange')({});
    h.document.visibilityState = 'visible'; h.document.listeners.get('visibilitychange')({}); gate.resolve(); await settle();
    assert.equal(h.button('Use this excerpt').disabled, true); assert.equal(checks(h).length, 0); quiet(h);
});

test('session replacement while read-only preflight waits cannot enter a new unprepared session', async () => {
    const h = await page(), gate = deferred(), original = h.window.LocalItabWorkspaces.session;
    original.readyExisting = () => gate.promise;
    const opening = h.window.LocalItabAIContextEntry.openCollection(h.reference());
    h.run('LocalItabWorkspaces.session = LocalItabWorkspaces.manager.capture()');
    gate.resolve(); assert.equal(await opening, false); assert.equal(h.q('.ai-context-dialog'), null); assert.equal(h.window.LocalItabWorkspaces.session.id, null); quiet(h);
});

test('failed read-only readiness can retry after normal setup without stale rejected promise', async () => {
    const h = await page({ initialized: false }); await h.open(); assert.equal(h.q('.ai-context-dialog'), null); quiet(h);
    await h.run('LocalItabWorkspaces.manager.ready()'); await settle(); h.writes.length = 0;
    await h.open(); assert.match(h.q('.ai-context-collection-status').textContent, /not selected yet/); quiet(h);
});

test('explicit discard replaces one existing context only after confirmation', async () => {
    const h = await page(); await h.open(); h.input('.ai-context-question', 'Old draft'); const old = h.q('.ai-context-dialog');
    assert.equal(await h.window.LocalItabAIContextEntry.openCollection(h.reference()), true); await settle();
    assert.notEqual(h.q('.ai-context-dialog'), old); assert.equal(h.document.querySelectorAll('.ai-context-dialog').length, 1);
    assert.equal(h.q('.ai-context-question').value, ''); assert.equal(checks(h).length, 0); assert.equal(h.confirmations.length, 1); quiet(h);
});

test('saved prompt reuse stays compatible and keeps exact selected source in both reviews', async () => {
    const h = await page();
    await h.run(`(async () => { const store = new LocalItabPrompts.Store(LocalItabWorkspaces.manager.createPromptBackend(LocalItabPrompts)); await store.mutate(store.request('add', {title: 'Synthetic template', body: 'Explain {{topic}}\\r\\n'})); globalThis.templateId = (await store.read()).records[0].id; })()`); h.writes.length = 0;
    await h.open(); h.click('Use this excerpt'); await settle(); h.click('Use a saved prompt'); await settle();
    const select = h.q('.ai-context-prompt-select'); select.value = h.window.templateId; select.dispatch('change');
    const variable = h.q('.ai-context-prompt-variables').querySelector('textarea'); variable.value = 'synthetic'; variable.dispatch('input');
    h.click('Preview replacement'); h.click('Replace this question'); await settle();
    h.click('Review prompt locally'); await settle();
    assert.equal(h.window.contextController.localReview.packed.question, 'Explain synthetic\r\n'); assert.equal(h.window.contextController.localReview.packed.sources[0].text, h.record.body);
    h.input('.ai-context-endpoint', 'https://mock.example/v1/chat/completions'); h.input('.ai-context-model', 'synthetic'); h.click('Review exact'); await settle();
    assert.equal(h.window.contextController.reviewed.packed.question, 'Explain synthetic\r\n'); assert.equal(h.window.contextController.reviewed.packed.sources[0].text, h.record.body); quiet(h);
});

for (const field of ['question', 'title']) test(`confirmed replacement cannot discard a newer ${field} edit during workspace readiness`, async () => {
    const h = await page(); await h.open(); h.input('.ai-context-question', 'Original');
    const dialog = h.q('.ai-context-dialog'), gate = deferred(); h.window.LocalItabWorkspaces.session.readyExisting = () => gate.promise;
    const opening = h.window.LocalItabAIContextEntry.openCollection(h.reference());
    const selector = field === 'question' ? '.ai-context-question' : '.ai-context-savetitle';
    h.input(selector, 'New unsaved value'); gate.resolve();
    assert.equal(await opening, false); assert.equal(h.q('.ai-context-dialog'), dialog); assert.equal(h.q(selector).value, 'New unsaved value'); quiet(h);
});

test('legacy drift after read-only admission is rejected without creating a conflict write', async () => {
    const h = await page(); assert.notEqual(h.window.LocalItabWorkspaces.manager._activated, true); await h.open();
    h.raw.quote = { text: 'Changed legacy data after opening' }; h.click('Use this excerpt'); await settle();
    assert.equal(checks(h).length, 0); assert.match(h.q('.ai-context-collection-status').textContent, /unavailable/); quiet(h);
});

for (const lifecycle of ['hide-show', 'persisted-pagehide']) test(`host readiness cannot revive a handoff after ${lifecycle} before the first dialog exists`, async () => {
    const h = await page(), gate = deferred(); let held = false;
    h.setReadHook(async keys => { if (!held && keys.length === 3 && keys.includes('__localItabWorkspaceRegistryV1')) { held = true; await gate.promise; } });
    const opening = h.window.LocalItabAIContextEntry.openCollection(h.reference()); await settle();
    assert.equal(held, true); assert.equal(h.q('.ai-context-dialog'), null);
    if (lifecycle === 'hide-show') {
        h.document.visibilityState = 'hidden'; h.document.listeners.get('visibilitychange')({});
        h.document.visibilityState = 'visible'; h.document.listeners.get('visibilitychange')({});
    } else for (const fn of [...h.events.get('pagehide') || []]) fn({ persisted: true });
    gate.resolve(); assert.equal(await opening, false); await settle();
    assert.equal(h.q('.ai-context-dialog'), null); quiet(h);
    // The invalid request does not poison a fresh, explicit foreground entry.
    h.setReadHook(null); assert.equal(await h.window.LocalItabAIContextEntry.openCollection(h.reference()), true); await settle();
    assert.match(h.q('.ai-context-collection-status').textContent, /not selected yet/); quiet(h);
});

for (const condition of ['restore', 'legacy', 'activation', 'generation', 'bundle', 'invalidated']) test(`reused read-only readiness preserves the existing draft when ${condition} changes`, async () => {
    const h = await page(); await h.open(); h.click('Use this excerpt'); await settle();
    h.input('.ai-context-question', 'SYNTHETIC keep this draft');
    const editor = h.q('.ai-context-source').querySelector('textarea'); editor.value = 'SYNTHETIC edited source'; editor.dispatch('input');
    h.click('Review prompt locally'); await settle();
    const dialog = h.q('.ai-context-dialog'), review = h.window.contextController.localReview, W = h.window.LocalItabWorkspaces;
    const rawBefore = structuredClone(h.raw);
    if (condition === 'restore') h.raw[W.RESTORE_TRANSACTION_KEY] = { schemaVersion: 1, id: 'synthetic_restore', status: 'prepared' };
    if (condition === 'legacy') h.raw.quote = 'SYNTHETIC legacy drift';
    if (condition === 'activation') delete h.raw[W.ACTIVATION_KEY];
    if (condition === 'generation') h.raw[W.REGISTRY_KEY].workspaces[0].generation = 'synthetic_new_generation';
    if (condition === 'bundle') delete h.raw[W.bundleKey(W.session)];
    if (condition === 'invalidated') W.session.invalidated = true;
    assert.equal(await h.window.LocalItabAIContextEntry.openCollection(h.reference()), false); await settle();
    assert.equal(h.q('.ai-context-dialog'), dialog); assert.equal(h.window.contextController.localReview, review);
    assert.equal(h.q('.ai-context-question').value, 'SYNTHETIC keep this draft'); assert.equal(editor.value, 'SYNTHETIC edited source');
    assert.equal(checks(h).length, 1); assert.match(h.window.localCollectionsView.status.textContent, /normal new-tab/); quiet(h);
    // Readiness failures leave the cached successful identity usable after a transient read/restore failure is repaired.
    if (condition !== 'invalidated' && condition !== 'generation') {
        for (const key of Object.keys(h.raw)) delete h.raw[key]; Object.assign(h.raw, rawBefore);
        assert.equal(await h.window.LocalItabAIContextEntry.openCollection(h.reference()), true); await settle();
        assert.notEqual(h.q('.ai-context-dialog'), dialog); assert.match(h.q('.ai-context-collection-status').textContent, /not selected yet/); quiet(h);
    }
});

test('approved handoff cannot discard a newer extracted-task selection while readiness waits', async () => {
    const h = await page(); await h.open();
    h.run(`contextController.result = Object.freeze({ text: '{"tasks":["SYNTHETIC first task","SYNTHETIC second task"]}', mode: 'tasks', model: 'synthetic', origin: 'https://example.com' });`);
    h.input('.ai-context-question', 'SYNTHETIC task question');
    const choices = h.q('.ai-context-task-choices').querySelectorAll('input'); assert.equal(choices.length, 2);
    const dialog = h.q('.ai-context-dialog'), gate = deferred(); let held = false;
    h.setReadHook(async keys => { if (!held && keys.length === 3 && keys.includes('__localItabWorkspaceRegistryV1')) { held = true; await gate.promise; } });
    const opening = h.window.LocalItabAIContextEntry.openCollection(h.reference()); await settle(); assert.equal(held, true);
    choices[1].checked = false; choices[1].dispatch('change'); const selection = h.window.contextController.taskSelection;
    assert.deepEqual([...selection.selected], [true, false]); gate.resolve();
    assert.equal(await opening, false); assert.equal(h.q('.ai-context-dialog'), dialog);
    assert.equal(h.window.contextController.taskSelection, selection); assert.equal(choices[1].checked, false); quiet(h);
});

test('reused read-only session stays pinned after another workspace becomes last used', async () => {
    const h = await page(); await h.open(); const W = h.window.LocalItabWorkspaces, identity = await W.session.readyExisting();
    const registry = h.raw[W.REGISTRY_KEY], previous = registry.workspaces[0];
    const other = { ...previous, id: 'synthetic_other_workspace', generation: 'synthetic_other_generation', name: 'SYNTHETIC other workspace', order: 1 };
    registry.workspaces.push(other); registry.lastUsedId = other.id; registry.revision++;
    h.raw[W.bundleKey(other)] = { schemaVersion: 1, id: other.id, generation: other.generation, values: {} };
    const identities = await Promise.all([W.session.readyExisting(), W.session.readyExisting(), W.session.ready()]);
    for (const actual of identities) assert.deepEqual(actual, identity);
    assert.equal(W.session.id, previous.id); assert.equal(W.manager._activated, false); quiet(h);
});

for (const previousAdmission of [false, true]) test(`read-only admission rejects registry changes during its snapshot read (already pinned: ${previousAdmission})`, async () => {
    const h = await page(), W = h.window.LocalItabWorkspaces;
    if (previousAdmission) await W.session.readyExisting();
    const originalGeneration = h.raw[W.REGISTRY_KEY].workspaces[0].generation;
    const gate = deferred(); let held = false;
    h.setReadHook(async keys => { if (!held && keys.length === 1 && keys[0].startsWith(W.PREFIX)) { held = true; await gate.promise; } });
    const admission = W.session.readyExisting(); await settle(); assert.equal(held, true);
    h.raw[W.REGISTRY_KEY].workspaces[0].generation = 'synthetic_concurrent_generation';
    gate.resolve(); await assert.rejects(admission, error => /WORKSPACE_(INVALIDATED|CONFLICT)/.test(error.code));
    if (previousAdmission) {
        h.raw[W.REGISTRY_KEY].workspaces[0].generation = originalGeneration;
        await assert.rejects(W.session.readyExisting(), error => error.code === 'WORKSPACE_INVALIDATED');
    }
    if (!previousAdmission) assert.equal(W.session.id, null); quiet(h);
});

test('handoff selection changes only its exact source and keeps other global and workspace edits', async () => {
    const h = await page();
    await h.run(`seedStore.mutate(seedStore.request('add', { title: 'SYNTHETIC second source', body: 'SYNTHETIC second body' }))`); await settle();
    const W = h.window.LocalItabWorkspaces, entry = h.raw[W.REGISTRY_KEY].workspaces[0];
    h.raw[W.bundleKey(entry)].values.__localItabScratchpadV1 = { schemaVersion: 1, revision: 1, enabled: true, content: 'SYNTHETIC saved workspace note' };
    h.writes.length = 0; await h.open(); const rows = h.document.querySelectorAll('.ai-context-source'); assert.equal(rows.length, 3);
    const others = rows.slice(1);
    for (let i = 0; i < others.length; i++) { const check = others[i].querySelector('input'); check.checked = i === 0; check.dispatch('change'); const editor = others[i].querySelector('textarea'); editor.value = `SYNTHETIC kept outgoing ${i}`; editor.dispatch('input'); }
    h.click('Use this excerpt'); await settle();
    for (let i = 0; i < others.length; i++) { assert.equal(others[i].querySelector('textarea').value, `SYNTHETIC kept outgoing ${i}`); assert.equal(others[i].querySelector('input').checked, i === 0); }
    h.input('.ai-context-question', 'SYNTHETIC combined question'); h.click('Review prompt locally'); await settle();
    assert.equal(h.window.contextController.localReview.packed.sources.length, 2); quiet(h);
});

for (const change of ['source-edit', 'source-selection', 'prompt-choice']) test(`incoming handoff keeps a newer ${change} made during readiness`, async () => {
    const h = await page();
    if (change === 'prompt-choice') {
        await h.run(`(async () => { const store = new LocalItabPrompts.Store(LocalItabWorkspaces.manager.createPromptBackend(LocalItabPrompts)); await store.mutate(store.request('add', { title: 'SYNTHETIC template', body: 'SYNTHETIC question' })); globalThis.syntheticPromptId = (await store.read()).records[0].id; })()`); h.writes.length = 0;
    }
    await h.open(); h.input('.ai-context-question', 'SYNTHETIC existing question');
    if (change === 'prompt-choice') { h.click('Use a saved prompt'); await settle(); }
    const dialog = h.q('.ai-context-dialog'), gate = deferred(); let held = false;
    h.setReadHook(async keys => { if (!held && keys.length === 3 && keys.includes('__localItabWorkspaceRegistryV1')) { held = true; await gate.promise; } });
    const opening = h.window.LocalItabAIContextEntry.openCollection(h.reference()); await settle(); assert.equal(held, true);
    if (change === 'source-edit') { const input = h.q('.ai-context-source').querySelector('textarea'); input.value = 'SYNTHETIC newest excerpt'; input.dispatch('input'); }
    if (change === 'source-selection') { const check = h.q('.ai-context-source').querySelector('input'); check.checked = true; check.dispatch('change'); }
    if (change === 'prompt-choice') { const select = h.q('.ai-context-prompt-select'); select.value = h.window.syntheticPromptId; select.dispatch('change'); h.click('Preview replacement'); }
    gate.resolve(); assert.equal(await opening, false); assert.equal(h.q('.ai-context-dialog'), dialog); quiet(h);
});

for (const condition of ['restore', 'legacy']) test(`read-only admission rechecks ${condition} after snapshot awaits`, async () => {
    const h = await page(), W = h.window.LocalItabWorkspaces, gate = deferred(); let held = false;
    h.setReadHook(async keys => { if (!held && keys.length === 1 && keys[0].startsWith(W.PREFIX)) { held = true; await gate.promise; } });
    const admission = W.session.readyExisting(); await settle(); assert.equal(held, true);
    if (condition === 'restore') h.raw[W.RESTORE_TRANSACTION_KEY] = { schemaVersion: 1, id: 'synthetic_delayed_restore', status: 'prepared' };
    else h.raw.quote = 'SYNTHETIC delayed legacy drift';
    gate.resolve(); await assert.rejects(admission, error => /WORKSPACE_(RESTORE_PENDING|LEGACY_CONFLICT)/.test(error.code));
    assert.equal(W.session.id, null); quiet(h);
});

test('handoff rechecks synchronous session invalidation after readiness returns', async () => {
    const h = await page(); await h.open(); h.input('.ai-context-question', 'SYNTHETIC keep pinned draft');
    const dialog = h.q('.ai-context-dialog'), session = h.window.LocalItabWorkspaces.session, ready = session.readyExisting.bind(session);
    session.readyExisting = async () => { const identity = await ready(); session.invalidated = true; return identity; };
    assert.equal(await h.window.LocalItabAIContextEntry.openCollection(h.reference()), false);
    assert.equal(h.q('.ai-context-dialog'), dialog); assert.equal(h.q('.ai-context-question').value, 'SYNTHETIC keep pinned draft'); quiet(h);
});

for (const removal of ['clear all', 'visible deselect', 'checkbox', 'reload']) test(`handoff status follows ${removal} and explicit reuse freshly selects the reviewed version`, async () => {
    const h = await page(); await h.open(); h.click('Use this excerpt'); await settle();
    h.input('.ai-context-question', 'SYNTHETIC keep this question');
    const info = h.q('.ai-context-collection-info').textContent, body = h.q('.ai-context-collection-text').textContent;
    if (removal === 'checkbox') { const check = checks(h)[0].querySelector('input'); check.checked = false; check.dispatch('change'); }
    else { h.click(removal === 'clear all' ? 'Clear all selections' : removal === 'visible deselect' ? 'Deselect visible selected' : 'Reload saved sources'); await settle(); }
    assert.equal(checks(h).length, 0);
    assert.match(h.q('.ai-context-collection-status').textContent, /not selected for this question/);
    assert.equal(h.button('Use this excerpt').disabled, false);
    assert.match(h.button('Use this excerpt').textContent, /again/);
    assert.equal(h.q('.ai-context-collection-info').textContent, info); assert.equal(h.q('.ai-context-collection-text').textContent, body);
    h.click('Review prompt locally'); await settle(); assert.equal(h.window.contextController.localReview.packed.sources.length, 0);
    let reads = 0; h.setReadHook(keys => { if (keys.includes('__localItabAICollectionsV1')) reads++; });
    h.click('Use this excerpt'); await settle(); assert(reads > 0, 'every reuse checks the current saved record');
    assert.equal(checks(h).length, 1); assert.equal(h.window.contextController.localReview, null);
    assert.equal(h.q('.ai-context-question').value, 'SYNTHETIC keep this question');
    assert.match(h.q('.ai-context-collection-status').textContent, /exact reviewed excerpt is selected/);
    assert.equal(h.button('Use this excerpt').disabled, true);
    h.click('Review prompt locally'); await settle(); assert.equal(h.window.contextController.localReview.packed.sources[0].text, h.record.body); quiet(h);
});

test('edited selected excerpt is distinguished from the retained review; explicit reuse confirms replacement', async () => {
    const h = await page(); await h.open(); h.click('Use this excerpt'); await settle();
    const editor = checks(h)[0].querySelector('textarea'); editor.value = 'SYNTHETIC outgoing edit'; editor.dispatch('input');
    h.input('.ai-context-question', 'SYNTHETIC question'); h.click('Review prompt locally'); await settle();
    const reviewed = h.window.contextController.localReview, body = h.q('.ai-context-collection-text').textContent;
    assert.match(h.q('.ai-context-collection-status').textContent, /differs from the reviewed body/);
    assert.equal(h.button('Use this excerpt').disabled, false);
    h.setConfirm(false); let reads = 0; h.setReadHook(() => reads++); h.click('Use this excerpt'); await settle();
    assert.equal(reads, 0); assert.equal(h.window.contextController.localReview, reviewed); assert.equal(editor.value, 'SYNTHETIC outgoing edit');
    h.setConfirm(true); h.click('Use this excerpt'); await settle();
    assert.equal(checks(h).length, 1); assert.equal(checks(h)[0].querySelector('textarea').value, body);
    assert.equal(h.window.contextController.localReview, null); assert.equal(h.q('.ai-context-collection-text').textContent, body);
    h.click('Review prompt locally'); await settle(); assert.equal(h.window.contextController.localReview.packed.sources[0].text, h.record.body); quiet(h);
});

for (const state of ['selected', 'cleared', 'reloaded']) test(`collection notification after use preserves ${state} draft and blocks stale reuse`, async () => {
    const h = await page(); await h.open(); h.click('Use this excerpt'); await settle();
    if (state === 'cleared') h.click('Clear all selections');
    if (state === 'reloaded') { h.click('Reload saved sources'); await settle(); }
    const before = checks(h).length, body = h.q('.ai-context-collection-text').textContent;
    await h.run(`(async () => { const r = (await seedStore.read()).records[0]; const plan = await seedStore.reviewRevision({ id: r.id, version: r.version, body: 'SYNTHETIC newer saved body' }); await seedStore.mutate(seedStore.request('revise', plan)); })()`); await settle(); h.writes.length = 0;
    assert.match(h.q('.ai-context-collection-status').textContent, /unavailable/);
    assert.equal(h.button('Use this excerpt').disabled, true); assert.equal(checks(h).length, before);
    h.button('Use this excerpt').dispatch('click'); await settle(); assert.equal(checks(h).length, before);
    assert.equal(h.q('.ai-context-collection-text').textContent, body); quiet(h);
});

for (const change of ['revise', 'metadata', 'body identity', 'archive', 'unreadable', 'workspace']) test(`explicit reuse freshly refuses silent ${change} without selecting or replacing the snapshot`, async () => {
    const h = await page(); await h.open(); h.click('Use this excerpt'); await settle(); h.click('Clear all selections');
    const body = h.q('.ai-context-collection-text').textContent;
    const record = h.raw.__localItabAICollectionsV1.records[0];
    if (change === 'revise') { record.body = record.history.at(-1).body = 'SYNTHETIC changed body'; record.version = 'synthetic_new_version'; }
    if (change === 'metadata') { record.title = 'SYNTHETIC changed title'; record.version = 'synthetic_new_version'; }
    if (change === 'body identity') record.currentVersionId = 'synthetic_new_body';
    if (change === 'archive') record.deletedAt = '2026-10-14T00:00:00.000Z';
    if (change === 'unreadable') h.setReadHook(keys => { if (keys.includes('__localItabAICollectionsV1')) throw Error('Synthetic read failure'); });
    if (change === 'workspace') h.raw.quote = 'SYNTHETIC legacy drift';
    h.click('Use this excerpt'); await settle();
    assert.equal(checks(h).length, 0); assert.match(h.q('.ai-context-collection-status').textContent, /not selected for this question/);
    assert.match(h.q('.ai-context-collection-status').textContent, /unavailable/); assert.equal(h.button('Use this excerpt').disabled, true);
    assert.equal(h.q('.ai-context-collection-text').textContent, body); quiet(h);
});

for (const pending of [false, true]) test(`hide/show after initial use invalidates ${pending ? 'pending' : 'available'} reuse without selecting`, async () => {
    const h = await page(); await h.open(); h.click('Use this excerpt'); await settle(); h.click('Clear all selections');
    const gate = deferred(); let held = false;
    if (pending) {
        h.setReadHook(async keys => { if (!held && keys.includes('__localItabAICollectionsV1')) { held = true; await gate.promise; } });
        h.click('Use this excerpt'); await settle(); assert.equal(held, true);
    }
    h.document.visibilityState = 'hidden'; h.document.listeners.get('visibilitychange')({});
    h.document.visibilityState = 'visible'; h.document.listeners.get('visibilitychange')({});
    gate.resolve(); await settle();
    assert.equal(checks(h).length, 0); assert.equal(h.button('Use this excerpt').disabled, true);
    assert.match(h.q('.ai-context-collection-status').textContent, /not selected for this question/);
    h.button('Use this excerpt').dispatch('click'); await settle(); assert.equal(checks(h).length, 0); quiet(h);
});

for (const reuse of [false, true]) for (const newerFocus of [false, true]) test(`focused ${reuse ? 'reuse' : 'initial use'} read failure keeps ${newerFocus ? 'newer external' : 'local status'} focus`, async () => {
    const h = await page(); await h.open();
    if (reuse) { h.click('Use this excerpt'); await settle(); h.click('Clear all selections'); }
    const gate = deferred(); let held = false;
    h.setReadHook(async keys => { if (!held && keys.includes('__localItabAICollectionsV1')) { held = true; await gate.promise; throw Error('Synthetic failed read'); } });
    h.button('Use this excerpt').focus(); h.click('Use this excerpt'); await settle(); assert.equal(held, true);
    assert.equal(h.document.activeElement, h.q('.ai-context-collection-status'));
    const external = h.document.createElement('button'); h.document.body.append(external);
    if (newerFocus) external.focus();
    gate.resolve(); await settle();
    assert.equal(h.document.activeElement, newerFocus ? external : h.q('.ai-context-collection-status'));
    assert.equal(h.button('Use this excerpt').disabled, true); assert.equal(checks(h).length, 0); quiet(h);
});

test('collection notification moves only the newly disabled focused reuse button to its status', async () => {
    const h = await page(); await h.open(); h.click('Use this excerpt'); await settle(); h.click('Clear all selections');
    h.button('Use this excerpt').focus();
    await h.run(`(async () => { const r = (await seedStore.read()).records[0]; const plan = await seedStore.reviewRevision({ id: r.id, version: r.version, body: 'SYNTHETIC revised while button focused' }); await seedStore.mutate(seedStore.request('revise', plan)); })()`); await settle(); h.writes.length = 0;
    assert.equal(h.document.activeElement, h.q('.ai-context-collection-status'));
    assert.equal(h.button('Use this excerpt').disabled, true); assert.equal(checks(h).length, 0); quiet(h);
});

test('successful explicit reuse returns focus to the unchanged question', async () => {
    const h = await page(); await h.open(); h.click('Use this excerpt'); await settle(); h.click('Clear all selections');
    h.input('.ai-context-question', 'SYNTHETIC unchanged question'); h.button('Use this excerpt').focus();
    h.click('Use this excerpt'); await settle();
    assert.equal(h.document.activeElement, h.q('.ai-context-question'));
    assert.equal(h.q('.ai-context-question').value, 'SYNTHETIC unchanged question'); quiet(h);
});

for (const previous of ['reload', 'local review', 'failed reload']) test(`successful explicit reuse replaces obsolete ${previous} feedback with selection feedback`, async () => {
    const h = await page(); await h.open(); h.click('Use this excerpt'); await settle();
    h.click('Reload saved sources'); await settle();
    h.input('.ai-context-question', 'SYNTHETIC unchanged question');
    // Set the old status after the question edit, which separately clears it.
    if (previous === 'reload') { h.click('Reload saved sources'); await settle(); }
    else if (previous === 'failed reload') {
        h.setReadHook(keys => { if (keys.includes('__localItabAICollectionsV1')) throw Error('Synthetic reload error'); });
        h.click('Reload saved sources'); await settle(); h.setReadHook(null);
    } else { h.click('Review prompt locally'); await settle(); assert(h.window.contextController.localReview); }
    assert.match(h.q('.ai-context-status').textContent, previous === 'reload' ? /Saved sources reloaded and left unselected/ : previous === 'failed reload' ? /Could not load saved sources/ : /Local prompt ready/);
    h.click('Use this excerpt'); await settle();
    assert.equal(checks(h).length, 1); assert.equal(h.window.contextController.localReview, null);
    assert.match(h.q('.ai-context-status').textContent, /Selection changed\. Review the exact request again/);
    assert.doesNotMatch(h.q('.ai-context-status').textContent, /Saved sources reloaded and left unselected|Local prompt ready/);
    assert.equal(h.q('.ai-context-question').value, 'SYNTHETIC unchanged question'); quiet(h);
});

for (const result of ['success', 'read failure', 'stale generation']) test(`reuse ${result} does not overwrite newer generic feedback during its read`, async () => {
    const h = await page(); await h.open(); h.click('Use this excerpt'); await settle();
    h.click('Reload saved sources'); await settle();
    const gate = deferred(); let held = false;
    h.setReadHook(async keys => { if (!held && keys.includes('__localItabAICollectionsV1')) { held = true; await gate.promise; if (result === 'read failure') throw Error('Synthetic failure'); } });
    h.click('Use this excerpt'); await settle(); assert.equal(held, true);
    if (result === 'stale generation') h.input('.ai-context-question', 'SYNTHETIC newer draft');
    h.q('.ai-context-status').textContent = 'SYNTHETIC newer feedback owned by another step';
    gate.resolve(); await settle();
    assert.equal(h.q('.ai-context-status').textContent, 'SYNTHETIC newer feedback owned by another step');
    assert.equal(checks(h).length, result === 'success' ? 1 : 0); quiet(h);
});

for (const blocker of ['busy', 'saveCommand', 'taskCommand']) test(`blocked ${blocker} reuse preserves generic error feedback`, async () => {
    const h = await page(); await h.open(); h.click('Use this excerpt'); await settle(); h.click('Clear all selections');
    h.q('.ai-context-status').textContent = 'SYNTHETIC unresolved operation feedback';
    h.window.contextController[blocker] = true;
    h.button('Use this excerpt').dispatch('click'); await settle();
    assert.equal(h.q('.ai-context-status').textContent, 'SYNTHETIC unresolved operation feedback');
    assert.equal(checks(h).length, 0); quiet(h);
});

test('failed reuse leaves the earlier truthful reload feedback unchanged', async () => {
    const h = await page(); await h.open(); h.click('Use this excerpt'); await settle(); h.click('Reload saved sources'); await settle();
    const before = h.q('.ai-context-status').textContent;
    h.setReadHook(keys => { if (keys.includes('__localItabAICollectionsV1')) throw Error('Synthetic failed reuse'); });
    h.click('Use this excerpt'); await settle();
    assert.equal(h.q('.ai-context-status').textContent, before); assert.equal(checks(h).length, 0); quiet(h);
});

test('cancelling edited-excerpt reuse retains its existing reviewed feedback', async () => {
    const h = await page(); await h.open(); h.click('Use this excerpt'); await settle();
    const editor = checks(h)[0].querySelector('textarea'); editor.value = 'SYNTHETIC edited excerpt'; editor.dispatch('input');
    h.input('.ai-context-question', 'SYNTHETIC retained question'); h.click('Review prompt locally'); await settle();
    const before = h.q('.ai-context-status').textContent, review = h.window.contextController.localReview;
    h.setConfirm(false); h.click('Use this excerpt'); await settle();
    assert.equal(h.q('.ai-context-status').textContent, before); assert.equal(h.window.contextController.localReview, review); quiet(h);
});

test('actual read-only collection workspace supports temporary manual sources without migration or persistent writes', async () => {
    const h = await page(); await h.open(); const before = JSON.stringify(h.raw);
    h.q('.ai-context-manual').open = true;
    h.input('.ai-context-manualtitle', 'Synthetic temporary title'); h.input('.ai-context-manualbody', 'Synthetic temporary body'); h.click('Add temporary excerpt'); await settle();
    const row = h.q('.ai-context-manual-sources').querySelector('.ai-context-source'); assert(row); assert.equal(row.querySelector('input').checked, false);
    row.querySelector('input').checked = true; row.querySelector('input').dispatch('change');
    h.input('.ai-context-question', 'Synthetic manual question'); h.click('Review prompt locally'); await settle();
    const source = h.window.contextController.localReview.packed.sources[0]; assert.match(source.id, /^manual:/); assert.equal(source.text, 'Synthetic temporary body');
    h.click('Reload saved sources'); await settle(); assert.equal(h.q('.ai-context-manual-sources').querySelector('.ai-context-source'), row); assert.equal(row.querySelector('input').checked, true);
    assert.equal(JSON.stringify(h.raw), before); quiet(h);
    h.click('Cancel / clear draft'); assert.equal(h.q('.ai-context-manual-sources').querySelectorAll('.ai-context-source').length, 0); assert.equal(JSON.stringify(h.raw), before); quiet(h);
});

async function changeSavedSource(h, action = 'revise') {
    await h.run(`(async () => {
        const r = (await seedStore.read()).records[0];
        if ('${action}' === 'archive') await seedStore.mutate(seedStore.request('remove', { id: r.id, version: r.version }));
        else if ('${action}' === 'metadata') await seedStore.mutate(seedStore.request('edit', { id: r.id, version: r.version, title: 'SYNTHETIC newer title' }));
        else { const plan = await seedStore.reviewRevision({ id: r.id, version: r.version, body: 'SYNTHETIC newer saved body' }); await seedStore.mutate(seedStore.request('revise', plan)); }
    })()`);
    await settle(); h.writes.length = 0;
}

test('stale collection preview exposes the existing safe reload without reviving its exact-version handoff', async () => {
    const h = await page(); await h.open();
    const recovery = h.q('.ai-context-collection-recovery'), reload = h.q('.ai-context-collection-reload');
    assert.equal(recovery.hidden, true); assert.equal(reload.disabled, true);
    let reads = 0; h.setReadHook(() => reads++); reload.dispatch('click'); await settle(); assert.equal(reads, 0); h.setReadHook(null);
    h.click('Use this excerpt'); await settle();
    h.input('.ai-context-question', 'SYNTHETIC retained question');
    h.input('.ai-context-endpoint', 'https://synthetic.example/v1/chat/completions'); h.input('.ai-context-model', 'synthetic');
    h.q('.ai-context-external-tasks').open = true; h.input('.ai-context-external-input', 'SYNTHETIC previous answer'); h.click('Load answer for review'); await settle();
    h.input('.ai-context-savetitle', 'SYNTHETIC saved title'); h.input('.ai-context-external-input', 'SYNTHETIC pasted draft');
    h.q('.ai-context-manual').open = true;
    h.input('.ai-context-manualtitle', 'SYNTHETIC temporary title'); h.input('.ai-context-manualbody', 'SYNTHETIC temporary text'); h.click('Add temporary excerpt'); await settle();
    const manual = h.q('.ai-context-manual-sources').querySelector('.ai-context-source');
    manual.querySelector('input').checked = true; manual.querySelector('input').dispatch('change');
    manual.querySelector('textarea').value = 'SYNTHETIC edited temporary text'; manual.querySelector('textarea').dispatch('input');
    h.input('.ai-context-manualtitle', 'SYNTHETIC unadded title'); h.input('.ai-context-manualbody', 'SYNTHETIC unadded body');
    h.input('.ai-context-source-search', 'no matching synthetic title');
    h.click('Review prompt locally'); await settle();
    const result = h.window.contextController.result, preview = h.q('.ai-context-collection-text').textContent, info = h.q('.ai-context-collection-info').textContent;
    await changeSavedSource(h);
    assert.equal(recovery.hidden, false); assert.equal(reload.disabled, false); assert.equal(h.q('.ai-context-source-help').open, false);
    const before = JSON.stringify(h.raw); reload.focus(); reload.dispatch('click'); await settle();
    assert.equal(h.confirmations.length, 1); assert.match(h.confirmations[0], /hidden and unselected saved excerpts/);
    assert.equal(h.q('.ai-context-saved-sources').querySelector('.ai-context-source').querySelector('textarea').value, 'SYNTHETIC newer saved body');
    assert.equal(h.q('.ai-context-saved-sources').querySelector('.ai-context-source').querySelector('input').checked, false);
    assert.equal(h.q('.ai-context-manual-sources').querySelector('.ai-context-source'), manual); assert.equal(manual.querySelector('input').checked, true);
    assert.equal(manual.querySelector('textarea').value, 'SYNTHETIC edited temporary text');
    for (const [selector, value] of [['.ai-context-question', 'SYNTHETIC retained question'], ['.ai-context-savetitle', 'SYNTHETIC saved title'],
        ['.ai-context-manualtitle', 'SYNTHETIC unadded title'], ['.ai-context-manualbody', 'SYNTHETIC unadded body'],
        ['.ai-context-external-input', 'SYNTHETIC pasted draft'], ['.ai-context-endpoint', 'https://synthetic.example/v1/chat/completions'],
        ['.ai-context-model', 'synthetic'], ['.ai-context-source-search', 'no matching synthetic title']]) assert.equal(h.q(selector).value, value);
    assert.equal(h.window.contextController.result, result); assert.equal(h.window.contextController.localReview, null);
    assert.equal(h.q('.ai-context-collection-text').textContent, preview); assert.equal(h.q('.ai-context-collection-info').textContent, info);
    assert.equal(h.button('Use this excerpt').disabled, true);
    assert.match(h.q('.ai-context-collection-reload-status').textContent, /left unselected.*Select the excerpts.*earlier preview is still unavailable/);
    assert.equal(h.document.activeElement, h.q('.ai-context-source-count')); assert.match(h.q('.ai-context-source-count').textContent, /Showing: 0/);
    h.button('Use this excerpt').dispatch('click'); await settle(); assert.equal(checks(h).length, 1, 'only the retained manual source remains selected');
    assert.equal(JSON.stringify(h.raw), before); quiet(h);
});

for (const action of ['metadata', 'archive']) test(`stale preview reload handles ${action} without guessing or selecting a replacement`, async () => {
    const h = await page(); await h.open(); const preview = h.q('.ai-context-collection-text').textContent;
    await changeSavedSource(h, action); h.click('Load latest saved sources'); await settle();
    const rows = h.q('.ai-context-saved-sources').querySelectorAll('.ai-context-source');
    assert.equal(rows.length, action === 'archive' ? 0 : 1); assert.equal(checks(h).length, 0); assert.equal(h.confirmations.length, 0);
    if (action === 'metadata') assert.match(rows[0].querySelector('span').textContent, /SYNTHETIC newer title$/);
    assert.equal(h.q('.ai-context-collection-text').textContent, preview); assert.equal(h.button('Use this excerpt').disabled, true); quiet(h);
});

test('cancelled stale-preview reload keeps the edited hidden source, local review, status and focus without reads', async () => {
    const h = await page(); await h.open(); h.click('Use this excerpt'); await settle();
    const row = checks(h)[0], editor = row.querySelector('textarea'); editor.value = 'SYNTHETIC retained outgoing edit'; editor.dispatch('input');
    h.input('.ai-context-question', 'SYNTHETIC retained question'); h.input('.ai-context-source-search', 'no match'); h.click('Review prompt locally'); await settle();
    await changeSavedSource(h); const review = h.window.contextController.localReview, status = h.q('.ai-context-status').textContent;
    let reads = 0; h.setReadHook(() => reads++); h.setConfirm(false);
    const reload = h.q('.ai-context-collection-reload'); reload.focus(); reload.dispatch('click'); await settle();
    assert.equal(reads, 0); assert.equal(checks(h)[0], row); assert.equal(editor.value, 'SYNTHETIC retained outgoing edit');
    assert.equal(h.window.contextController.localReview, review); assert.equal(h.q('.ai-context-status').textContent, status);
    assert.equal(h.q('.ai-context-collection-reload-status').textContent, ''); assert.equal(h.document.activeElement, reload); quiet(h);
});

for (const newerFocus of [false, true]) test(`failed stale-preview reload preserves the full draft and ${newerFocus ? 'newer' : 'local'} focus; an explicit retry can recover`, async () => {
    const h = await page(); await h.open(); h.click('Use this excerpt'); await settle();
    const row = checks(h)[0], editor = row.querySelector('textarea'); editor.value = 'SYNTHETIC retained outgoing edit'; editor.dispatch('input');
    h.input('.ai-context-question', 'SYNTHETIC retained question'); h.click('Review prompt locally'); await settle(); await changeSavedSource(h);
    const review = h.window.contextController.localReview, gate = deferred(); let held = false;
    h.setReadHook(async keys => { if (!held && keys.includes('__localItabAICollectionsV1')) { held = true; await gate.promise; throw Error('Synthetic failed reload'); } });
    const reload = h.q('.ai-context-collection-reload'), feedback = h.q('.ai-context-collection-reload-status');
    reload.focus(); reload.dispatch('click'); await settle(); assert.equal(held, true); assert.equal(reload.disabled, true);
    assert.equal(h.document.activeElement, feedback); assert.match(feedback.textContent, /Reading the latest/);
    const external = h.document.createElement('button'); h.document.body.append(external); if (newerFocus) external.focus();
    gate.resolve(); await settle();
    assert.equal(checks(h)[0], row); assert.equal(editor.value, 'SYNTHETIC retained outgoing edit'); assert.equal(h.window.contextController.localReview, review);
    assert.equal(h.q('.ai-context-question').value, 'SYNTHETIC retained question'); assert.equal(reload.disabled, false);
    assert.match(feedback.textContent, /Could not load.*unchanged/); assert.equal(h.document.activeElement, newerFocus ? external : feedback); quiet(h);
    h.setReadHook(null); reload.focus(); reload.dispatch('click'); await settle();
    assert.equal(checks(h).length, 0); assert.equal(h.button('Use this excerpt').disabled, true);
    assert.match(feedback.textContent, /Latest saved sources loaded/); assert.equal(h.document.activeElement, h.q('.ai-context-source-count')); quiet(h);
});

for (const change of ['hide-show', 'close', 'draft', 'newer focus']) test(`pending stale-preview reload cannot override ${change}; repeated clicks start no second read`, async () => {
    const h = await page(); await h.open(); await changeSavedSource(h);
    const row = h.q('.ai-context-saved-sources').querySelector('.ai-context-source'), gate = deferred(); let reads = 0;
    h.setReadHook(async keys => { if (keys.includes('__localItabAICollectionsV1') && ++reads === 1) await gate.promise; });
    const reload = h.q('.ai-context-collection-reload'), feedback = h.q('.ai-context-collection-reload-status');
    reload.focus(); reload.dispatch('click'); await settle(); assert.equal(reads, 1);
    reload.dispatch('click'); await settle(); assert.equal(reads, 1);
    let external;
    if (change === 'hide-show') { h.document.visibilityState = 'hidden'; h.document.listeners.get('visibilitychange')({}); h.document.visibilityState = 'visible'; h.document.listeners.get('visibilitychange')({}); }
    if (change === 'close') h.window.aiContextView.destroy();
    if (change === 'draft') h.input('.ai-context-question', 'SYNTHETIC newer draft');
    if (change === 'newer focus') { external = h.document.createElement('button'); h.document.body.append(external); external.focus(); }
    gate.resolve(); await settle();
    assert.equal(feedback.textContent.includes('Reading the latest'), false);
    if (change === 'newer focus') { assert.match(feedback.textContent, /Latest saved sources loaded/); assert.equal(h.document.activeElement, external); }
    else {
        assert.doesNotMatch(feedback.textContent, /Latest saved sources loaded/);
        if (change === 'close') { assert.equal(h.q('.ai-context-dialog'), null); assert.equal(reload.disabled, true); }
        else { assert.equal(h.q('.ai-context-saved-sources').querySelector('.ai-context-source'), row); if (change === 'draft') assert.equal(h.q('.ai-context-question').value, 'SYNTHETIC newer draft'); }
    }
    assert.equal(checks(h).length, 0); quiet(h);
});

for (const blocker of ['busy', 'saveCommand', 'taskCommand', 'clear', 'hidden']) test(`stale-preview recovery rechecks ${blocker} even with an old enabled button`, async () => {
    const h = await page(); await h.open(); await changeSavedSource(h);
    const reload = h.q('.ai-context-collection-reload'); assert.equal(reload.disabled, false);
    if (blocker === 'clear') h.click('Cancel / clear');
    else if (blocker === 'hidden') h.document.visibilityState = 'hidden';
    else h.window.contextController[blocker] = true;
    let reads = 0; h.setReadHook(() => reads++); reload.dispatch('click'); await settle();
    assert.equal(reads, 0); assert.equal(h.confirmations.length, 0); assert.equal(checks(h).length, 0); quiet(h);
});

test('stale-preview recovery copy is localized and never promises to restore its old preview', () => {
    for (const locale of ['en', 'zh_CN']) {
        const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        for (const key of ['CollectionReload', 'CollectionReloadHelp', 'CollectionReloaded', 'SourceReloadLoading']) assert(messages[`aiContext${key}`]?.message);
        assert.match(messages.aiContextCollectionUnavailable.message, locale === 'en' ? /preview stays unchanged and cannot be reused/ : /旧预览保持不变，不能再次使用/);
        assert.match(messages.aiContextCollectionReloaded.message, locale === 'en' ? /left unselected/ : /均未选中/);
    }
});

test('failed initial source read can recover in the same question without fabricating an exact preview', async () => {
    const h = await page(); h.setReadHook(keys => { if (keys.includes('__localItabAICollectionsV1')) throw Error('Synthetic initial read failure'); });
    await h.open(); assert.equal(h.q('.ai-context-collection-recovery').hidden, false);
    assert.equal(h.q('.ai-context-collection-text').textContent, ''); assert.equal(h.q('.ai-context-saved-sources').children.length, 0);
    h.input('.ai-context-question', 'SYNTHETIC retain initial question'); h.setReadHook(null); h.click('Load latest saved sources'); await settle();
    assert.equal(h.q('.ai-context-saved-sources').children.length, 1); assert.equal(checks(h).length, 0);
    assert.equal(h.q('.ai-context-collection-text').textContent, ''); assert.equal(h.button('Use this excerpt').disabled, true);
    assert.equal(h.q('.ai-context-question').value, 'SYNTHETIC retain initial question'); quiet(h);
});

test('another saved-source notification clears earlier reload feedback and leaves a fresh explicit recovery available', async () => {
    const h = await page(); await h.open(); await changeSavedSource(h); h.click('Load latest saved sources'); await settle();
    assert.match(h.q('.ai-context-collection-reload-status').textContent, /Latest saved sources loaded/);
    const row = h.q('.ai-context-saved-sources').querySelector('.ai-context-source');
    await changeSavedSource(h, 'metadata');
    assert.equal(h.q('.ai-context-collection-reload-status').textContent, ''); assert.equal(h.q('.ai-context-collection-reload').disabled, false);
    assert.equal(h.q('.ai-context-saved-sources').querySelector('.ai-context-source'), row); assert.equal(checks(h).length, 0); quiet(h);
});
