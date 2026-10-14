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
