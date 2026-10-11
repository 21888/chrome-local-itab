const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Prompts = require('../shared/local-prompts-store.js');
const Core = require('../shared/local-ai-collections-store.js');
const Workspaces = require('../shared/workspaces.js');
const { Controller } = require('../shared/local-ai-collections-controller.js');
const { setup, add, tick } = require('./helpers/collections-harness.js');
const { createDocument } = require('./helpers/task-dom-model.js');
const clone = value => value === undefined ? undefined : structuredClone(value);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const text = node => [node.textContent || '', ...node.children.map(text)].join(' ');
async function fixture() {
    let raw, sequence = 0, writes = 0;
    const listeners = new Set();
    const backend = { lock: action => action(), read: async () => clone(raw), write: async value => { raw = clone(value); writes++; listeners.forEach(fn => fn()); }, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } };
    const store = new Prompts.Store(backend, { id: () => `prompt_id_${++sequence}`, now: () => '2026-10-10T12:00:00.000Z' });
    let state = await store.mutate(store.request('add', { title: '<b>Original</b>', body: '  <script>literal</script>\r\n{{topic}} 🧪  ' }));
    const original = clone(state.records[0]);
    state = await store.mutate(store.request('edit', { id: original.id, version: original.version, title: 'Renamed', body: 'New body' }));
    const h = setup(), c = new Controller({ store: h.store, promptStore: { read: () => store.read(), subscribe: fn => store.subscribe(fn) } });
    h.controller = c; await c.start();
    return { ...h, h, c, promptStore: store, original, backend, listeners, get promptWrites() { return writes; }, get promptState() { return clone(raw); }, setRaw(state) { raw = clone(state); } };
}
async function mount(h, i18n) {
    const doc = createDocument({ blurUnavailableFocus: true }), host = doc.createElement('div'); doc.body.append(host);
    const root = { document: doc, LocalItabAICollections: Core, i18n, addEventListener() {} };
    const context = vm.createContext({ window: root, Intl, Date, Object, Array, Boolean, String, Promise, Map });
    vm.runInContext(fs.readFileSync('shared/local-ai-collections-view.js', 'utf8'), context);
    const view = new root.LocalItabCollectionsView.View({ host, controller: h.c, confirm: async () => true }); view.render();
    return { view, doc, host };
}
const reference = record => ({ promptId: record.id, bodyVersionId: record.currentVersionId });

test('picker offers current and old immutable versions; Apply only changes both draft IDs, Save persists', async () => {
    const h = await fixture(), c = h.c; c.create(); c.update('title', 'Result'); c.update('body', 'Excerpt');
    assert.equal(c.promptOptions().length, 2); assert.equal(c.promptOptions().filter(item => item.current).length, 1);
    const writes = h.h.writes, promptWrites = h.promptWrites;
    c.choosePrompt(h.original.id, h.original.currentVersionId);
    assert.equal(c.draft().input.promptId, '');
    assert.equal(await c.applyPrompt(), true);
    assert.equal(h.h.writes, writes); assert.equal(h.promptWrites, promptWrites);
    assert.equal(c.draft().input.promptId, h.original.id); assert.equal(c.draft().input.bodyVersionId, h.original.currentVersionId);
    assert.equal(c.draft().input.body, 'Excerpt');
    assert.equal(await c.save(), true); await tick();
    assert.deepEqual(c.record().promptRef, reference(h.original));
    assert.equal(c.promptResolution(c.record().promptRef).version.body, h.original.body);
    let current = h.promptState.records[0];
    await h.promptStore.mutate(h.promptStore.request('edit', { id: current.id, version: current.version, title: 'Again renamed', body: 'Third body' })); await tick();
    assert.equal(c.promptResolution(c.record().promptRef).version.body, h.original.body);
    c.dispose();
});

test('archived and recovery-only exact versions resolve with provenance; missing keeps original IDs', async () => {
    const h = await fixture(), c = h.c, ref = reference(h.original);
    let current = h.promptState.records[0];
    await h.promptStore.mutate(h.promptStore.request('remove', { id: current.id, version: current.version })); await tick();
    assert.equal(c.promptResolution(ref).provenance.archived, true);
    const state = h.promptState;
    state.recovery = [{ id: 'recovery_snapshot', createdAt: '2026-10-10T12:00:00.000Z', content: { records: state.records } }]; state.records = [];
    h.setRaw(state); await c.refreshPrompts();
    assert.equal(c.promptResolution(ref).version.body, h.original.body);
    assert.equal(c.promptResolution(ref).provenance.recoveryId, 'recovery_snapshot');
    c.create(); c.update('title', 'Result'); c.update('body', 'body'); c.choosePrompt(ref.promptId, ref.bodyVersionId); assert.equal(await c.applyPrompt(), true);
    state.recovery = []; h.setRaw(state); await c.refreshPrompts();
    assert.equal(c.promptResolution(ref).status, 'unresolved');
    assert.equal(c.draft().input.promptId, ref.promptId); assert.equal(c.draft().input.bodyVersionId, ref.bodyVersionId);
    assert.equal(await c.applyPrompt(), false); await c.save(); assert.deepEqual(c.record().promptRef, ref);
    c.dispose();
});

test('read failures are unavailable, not missing; restore fences block prompt reading and applying', async () => {
    const h = await fixture(), c = h.c, ref = reference(h.original); c.create(); c.choosePrompt(ref.promptId, ref.bodyVersionId);
    const originalRead = c.promptStore.read;
    c.promptStore.read = async () => { throw Prompts.fault('READ'); }; await c.refreshPrompts();
    assert.equal(c.promptResolution(ref).status, 'unavailable'); assert.equal(c.promptError, 'READ'); assert.equal(await c.applyPrompt(), false);
    for (const status of ['prepared', 'submitted']) {
        const chrome = { storage: { local: { async get() { return { [Workspaces.RESTORE_TRANSACTION_KEY]: { schemaVersion: 1, id: 'restore_marker', status } }; } }, onChanged: { addListener() {}, removeListener() {} } } };
        const manager = new Workspaces.Manager({ chrome, locks: { request: (name, options, action) => action() } });
        const store = new Prompts.Store(manager.createPromptBackend(Prompts)); c.promptStore.read = () => store.read();
        await c.refreshPrompts(); assert.equal(c.promptError, 'WORKSPACE_RESTORE_PENDING'); assert.equal(c.promptResolution(ref).status, 'unavailable'); assert.equal(await c.applyPrompt(), false);
    }
    c.promptStore.read = originalRead; await c.refreshPrompts(); assert.equal(c.promptResolution(ref).status, 'resolved'); c.dispose();
});

test('out-of-order and disposed reads cannot publish stale prompt content or errors', async () => {
    const h = await fixture(), c = h.c, first = deferred(), second = deferred(); let calls = 0;
    c.promptStore.read = () => (++calls === 1 ? first.promise : second.promise);
    const old = c.refreshPrompts(), newest = c.refreshPrompts(), state = h.promptState; state.records[0].title = 'Newest';
    second.resolve(state); await newest; first.reject(Prompts.fault('READ')); await old;
    assert.equal(c.promptState.records[0].title, 'Newest'); assert.equal(c.promptError, null);
    const delayed = deferred(); c.promptStore.read = () => delayed.promise; const pending = c.refreshPrompts(); c.dispose();
    delayed.resolve(h.promptState); await pending; assert.equal(c.promptState.records[0].title, 'Newest'); assert.equal(h.listeners.size, 0);
});

test('Apply freshly checks exact availability and never replaces a newer unlink or selected draft', async () => {
    const h = await fixture(), c = h.c, ref = reference(h.original); await add(c); const saved = c.record(); c.edit(); c.choosePrompt(ref.promptId, ref.bodyVersionId);
    let delayed = deferred(); c.promptStore.read = () => delayed.promise;
    let pending = c.applyPrompt(); c.unlinkPrompt(); delayed.resolve(h.promptState); assert.equal(await pending, false); assert.equal(c.draft().input.promptId, '');
    delayed = deferred(); c.promptStore.read = () => delayed.promise; pending = c.applyPrompt(); c.create(); delayed.resolve(h.promptState); assert.equal(await pending, false); assert.equal(c.draft().input.promptId, '');
    c.select(saved.id); delayed = deferred(); c.promptStore.read = () => delayed.promise; pending = c.applyPrompt();
    const missing = h.promptState; missing.records = []; delayed.resolve(missing); assert.equal(await pending, false); assert.equal(c.draft().input.promptId, ''); c.dispose();
});

test('prompt refresh preserves editor nodes, focus, caret and literal body; unlink and Apply disabled during uncertain save', async () => {
    const h = await fixture(), c = h.c; c.create(); c.update('title', 'Result'); c.update('body', 'draft body');
    const { view, doc, host } = await mount(h), input = view.editor.fields.notes; input.value = 'unfinished notes'; input.dispatch('input'); input.focus(); input.selectionStart = 4; input.selectionEnd = 7;
    c.choosePrompt(h.original.id, h.original.currentVersionId); await c.refreshPrompts();
    assert.equal(view.editor.fields.notes, input); assert.equal(doc.activeElement, input); assert.equal(input.selectionStart, 4); assert.equal(input.selectionEnd, 7);
    assert.ok(text(view.promptPanel.preview).includes(h.original.body)); assert.equal(host.querySelector('script'), null);
    assert.equal(view.editor.fields.promptId, undefined); assert.equal(view.editor.fields.bodyVersionId, undefined);
    assert.equal(view.promptPanel.version.children.length, 3); assert.equal(await c.applyPrompt(), true);
    h.h.failOnce(); assert.equal(await c.save(), false); assert.ok(c.pendingCommand);
    const before = clone(c.draft().input); assert.equal(c.choosePrompt('other_prompt', 'other_version'), false); assert.equal(await c.applyPrompt(), false); assert.equal(c.unlinkPrompt(), false); assert.deepEqual(c.draft().input, before);
    assert.equal(view.promptPanel.apply.disabled, true); assert.equal(view.promptPanel.unlink.disabled, true); c.dispose();
});

for (const locale of ['en', 'zh_CN']) test(`picker has distinct case-insensitive locale labels (${locale})`, async () => {
    const h = await fixture(), catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8')), normalized = new Map();
    for (const [key, value] of Object.entries(catalog)) { assert.equal(normalized.has(key.toLowerCase()), false, key); normalized.set(key.toLowerCase(), value.message); }
    h.c.create(); const { view } = await mount(h, { t: key => normalized.get(key.toLowerCase()) || key });
    assert.equal(view.promptPanel.prompt.parentElement.querySelector('span').textContent, catalog.collectionsPromptPickerLabel.message);
    assert.equal(view.promptPanel.version.parentElement.querySelector('span').textContent, catalog.collectionsPromptVersionLabel.message);
    assert.equal(view.editor.fields.title.parentElement.querySelector('span').textContent, locale === 'en' ? 'Title' : '标题'); h.c.dispose();
});

test('bootstrap exposes only fenced prompt reads and does not expand page permissions', () => {
    const boot = fs.readFileSync('collections.js', 'utf8'), html = fs.readFileSync('collections.html', 'utf8');
    assert.match(boot, /createPromptBackend\(root.LocalItabPrompts\)/); assert.match(boot, /promptStore = \{ read: \(\) => prompts.read\(\), subscribe:/);
    assert.ok(html.indexOf('shared/local-prompts-store.js') < html.indexOf('shared/local-ai-collections-controller.js'));
});

test('native-select model events stage current and historical versions without persisting or changing the excerpt', async () => {
    const h = await fixture(), c = h.c; c.create(); c.update('title', 'Result'); c.update('body', 'Kept excerpt');
    const { view } = await mount(h), p = view.promptPanel, writes = h.h.writes;
    p.prompt.value = h.original.id; p.prompt.dispatch('change');
    assert.equal(p.version.value, ''); assert.equal(p.apply.disabled, true);
    p.version.value = h.promptState.records[0].currentVersionId; p.version.dispatch('change');
    assert.equal(p.apply.disabled, false); assert.match(text(p.preview), /New body/); assert.equal(c.draft().input.promptId, '');
    p.apply.dispatch('click'); await tick(); assert.equal(c.draft().input.bodyVersionId, h.promptState.records[0].currentVersionId);
    p.version.value = h.original.currentVersionId; p.version.dispatch('change'); assert.equal(c.draft().input.bodyVersionId, h.promptState.records[0].currentVersionId);
    p.apply.dispatch('click'); await tick(); assert.equal(c.draft().input.bodyVersionId, h.original.currentVersionId);
    assert.equal(c.draft().input.body, 'Kept excerpt'); assert.equal(h.h.writes, writes); c.dispose();
});

test('a newer prompt refresh fences an Apply continuation even after its read resolved', async () => {
    const h = await fixture(), c = h.c; c.create(); c.choosePrompt(h.original.id, h.original.currentVersionId);
    const later = deferred(); let calls = 0, next;
    c.promptStore.read = () => ++calls === 1 ? Promise.resolve(h.promptState) : later.promise;
    c.onChange = kind => { if (kind === 'prompts' && !c.promptLoading && calls === 1) next = c.refreshPrompts(); };
    assert.equal(await c.applyPrompt(), false); assert.equal(c.draft().input.promptId, '');
    later.resolve(h.promptState); await next; c.dispose();
});
