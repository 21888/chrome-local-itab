const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Controller, linkedResults } = require('../shared/local-prompts-controller.js');
const Prompts = require('../shared/local-prompts-store.js');
const Collections = require('../shared/local-ai-collections-store.js');
const Search = require('../shared/local-ai-search.js');
const { setup, add, tick } = require('./helpers/prompts-harness.js');
const collections = require('./helpers/collections-harness.js');
const { createDocument } = require('./helpers/task-dom-model.js');
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const text = node => [node.textContent || '', ...node.children.map(text)].join(' ');
async function fixture(language = 'en') {
    const h = setup(), results = collections.setup(), c = new Controller({ store: h.store, collectionStore: { read: () => results.store.read(), subscribe: fn => results.store.subscribe(fn) } });
    const doc = createDocument({ blurUnavailableFocus: true }); doc.documentElement.lang = language;
    const host = doc.createElement('div'); doc.body.append(host);
    const root = { LocalItabPrompts: Prompts, LocalItabAISearch: Search, document: doc, addEventListener() {}, navigator: { clipboard: { writeText() { throw new Error('No clipboard use'); } } } };
    const context = vm.createContext({ window: root, Intl, Date, Object, Array, Boolean, String, Promise });
    vm.runInContext(fs.readFileSync(`${__dirname}/../shared/local-prompts-view.js`, 'utf8'), context);
    const messages = JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${language}/messages.json`, 'utf8'));
    const view = new root.LocalItabPromptsView.View({ host, controller: c, translate: (name, fallback) => messages[`prompts${name}`]?.message || fallback });
    view.render(); await c.start();
    const prompt = await add(c, 'Synthetic prompt', 'Explain {{topic}}');
    async function result(title = 'Synthetic result', ref = { promptId: prompt.id, bodyVersionId: prompt.currentVersionId }, tool = 'Synthetic tool') {
        const command = results.store.request('add', { title, body: 'PRIVATE BODY MUST NOT APPEAR', tool, promptRef: ref });
        await results.store.mutate(command); await tick(); return (await results.store.read()).records.find(record => record.id === command.operationId);
    }
    return { h, results, c, view, doc, host, prompt, result };
}
test('pure reverse lookup matches both immutable IDs and active records only, without full bodies or recovery', () => {
    const row = { id: 'result_01', version: 'record_01', title: 'Title', tool: 'Tool', deletedAt: null, promptRef: { promptId: 'prompt_01', bodyVersionId: 'version_01' }, body: 'private' };
    const state = { records: [row, { ...row, id: 'wrong_p1', promptRef: { ...row.promptRef, promptId: 'prompt_02' } }, { ...row, id: 'wrong_v1', promptRef: { ...row.promptRef, bodyVersionId: 'version_02' } }, { ...row, id: 'archived', deletedAt: '2026-01-01' }, { ...row, id: 'unlinked', promptRef: null }], recovery: [{ content: { records: [{ ...row, id: 'recovery' }] } }] };
    assert.deepEqual(linkedResults(state, 'prompt_01', 'version_01'), [{ id: row.id, version: row.version, title: row.title, tool: row.tool }]);
    assert.deepEqual(linkedResults(state, '', ''), []);
});
test('read-only cards use safe new-tab exact target and literal title/tool; navigation preserves memory', async () => {
    const h = await fixture(), { c, view } = h;
    const result = await h.result('<img src=x onerror=bad()>', undefined, '<script>bad()</script>');
    c.setVariable('topic', 'ephemeral');
    const link = view.main.querySelector('.prompt-linked-card');
    assert.equal(link.href, Search.href('collection', result.id)); assert.equal(link.target, '_blank'); assert.equal(link.rel, 'noopener noreferrer');
    assert.equal(link.dispatch('click').prevented, false); assert.equal(link.dispatch('auxclick', { button: 1 }).prevented, false);
    assert.equal(c.session().values.topic, 'ephemeral'); assert.equal(c.selected, h.prompt.id);
    assert.equal(view.main.querySelectorAll('img, script').length, 0); assert.doesNotMatch(text(view.main), /PRIVATE BODY MUST NOT APPEAR/);
    assert.match(text(view.main), /Exact version used by this preview: v1/); assert.equal(h.results.writes, 1); c.dispose();
});
test('retained variable session binds older version while history selection independently scopes results', async () => {
    const h = await fixture(), { c, view } = h; await h.result('Result v1');
    c.setVariable('topic', 'retained'); c.edit(); c.update('body', 'New {{topic}}'); await c.save(); await tick();
    const second = c.record(); await h.result('Result v2', { promptId: second.id, bodyVersionId: second.currentVersionId });
    const sections = view.main.querySelectorAll('.prompt-linked-results');
    assert.match(text(sections[0]), /preview: v1/); assert.match(text(sections[0]), /Result v1/); assert.doesNotMatch(text(sections[0]), /Result v2/);
    const history = view.main.querySelector('.prompt-history-list'); history.children[1].dispatch('click');
    assert.match(text(sections[1]), /history: v2/); assert.match(text(sections[1]), /Result v2/); assert.doesNotMatch(text(sections[1]), /Result v1/);
    const oldLink = sections[1].querySelector('a'); history.children[0].dispatch('click'); assert.equal(oldLink.dispatch('click').prevented, true);
    assert.match(text(sections[1]), /Result v1/); assert.equal(c.session().values.topic, 'retained');
    c.clearVariables(); assert.match(text(view.main.querySelector('.prompt-linked-results')), /preview: v2/); c.dispose();
});
test('collection loading, failed read and corrupt snapshot never display empty or stale result cards; retry recovers', async () => {
    const h = await fixture(), { c, view } = h; await h.result();
    const oldLink = view.main.querySelector('.prompt-linked-card'), wait = deferred(), original = c.collectionStore.read;
    c.collectionStore.read = () => wait.promise; const pending = c.refreshCollections();
    assert.match(text(view.main), /Reading saved results/); assert.doesNotMatch(text(view.main), /No active saved results/); assert.equal(view.main.querySelectorAll('.prompt-linked-card').length, 0); assert.equal(oldLink.dispatch('click').prevented, true);
    wait.reject(new Error('PRIVATE FAILURE')); await pending;
    assert.match(text(view.main), /could not be read safely/); assert.doesNotMatch(text(view.main), /PRIVATE FAILURE|No active saved results/);
    c.collectionStore.read = async () => ({ records: [] }); await c.refreshCollections(); assert.match(text(view.main), /could not be read safely/);
    c.collectionStore.read = original; await c.refreshCollections(); assert.ok(view.main.querySelector('.prompt-linked-card')); c.dispose();
});
test('superseded success/failure cannot replace newer snapshot; disposal rejects late reads and navigation', async () => {
    for (const outcome of ['success', 'failure']) {
        const h = await fixture(), { c, view } = h; await h.result(); const state = await h.results.store.read(), wait = deferred();
        c.collectionStore.read = () => wait.promise; const old = c.refreshCollections();
        c.collectionStore.read = async () => Collections.initial(); await c.refreshCollections();
        if (outcome === 'success') wait.resolve(state); else wait.reject(new Error('old'));
        await old; assert.match(text(view.main), /No active saved results/); assert.equal(c.collectionError, null);
        c.collectionStore.read = async () => state; await c.refreshCollections(); const link = view.main.querySelector('a.prompt-linked-card');
        const late = deferred(); c.collectionStore.read = () => late.promise; const pending = c.refreshCollections(); const generation = c.collectionGeneration;
        c.dispose(); late.resolve(state); await pending; assert.ok(c.collectionGeneration > generation); assert.equal(c.collectionState, null); assert.equal(link.dispatch('click').prevented, true);
    }
});
test('archive/unlink refresh invalidates old links, keeps focused variable and unsaved draft untouched', async () => {
    const h = await fixture(), { c, view, doc } = h; const result = await h.result();
    const variable = view.main.querySelector('[data-prompt-focus="variable-topic"]'); variable.focus(); variable.value = 'local'; variable.dispatch('input');
    const oldLink = view.main.querySelector('.prompt-linked-card');
    await h.results.store.mutate(h.results.store.request('remove', { id: result.id, version: result.version })); await tick();
    assert.equal(oldLink.dispatch('auxclick').prevented, true); assert.equal(doc.activeElement, variable); assert.match(text(view.main), /No active saved results/);
    const second = await h.result('Next result'); const savedLink = view.main.querySelector('.prompt-linked-card');
    await h.results.store.mutate(h.results.store.request('edit', { id: second.id, version: second.version, promptRef: null })); await tick();
    assert.equal(savedLink.dispatch('click').prevented, true); assert.match(text(view.main), /No active saved results/);
    c.edit(); c.update('body', 'UNSAVED'); const draft = c.draft(), input = view.main.querySelector('[data-prompt-focus="body"]'); input.focus();
    await h.result('While editing'); assert.equal(c.draft(), draft); assert.equal(draft.input.body, 'UNSAVED'); assert.equal(doc.activeElement, input); assert.equal(view.main.querySelectorAll('.prompt-linked-card').length, 0); c.dispose();
});
test('prompt navigation/read invalidation and subscription failure fail closed without collection writes', async () => {
    const h = await fixture(), { c, view } = h; await h.result(); const link = view.main.querySelector('.prompt-linked-card');
    const other = await add(c, 'Other prompt', 'Other body'); assert.equal(link.dispatch('click').prevented, true); assert.equal(c.selected, other.id);
    c.select(h.prompt.id); const active = view.main.querySelector('.prompt-linked-card'), read = c.store.read, wait = deferred(); c.store.read = () => wait.promise;
    const pending = c.refresh(); assert.equal(active.dispatch('click').prevented, true); assert.match(text(view.main), /Reading saved results/);
    wait.reject(new Error('private')); await pending; assert.match(text(view.main), /could not be read safely/);
    c.select(other.id); c.select(h.prompt.id); assert.match(text(view.main), /could not be read safely/); assert.equal(view.main.querySelectorAll('.prompt-linked-card').length, 0); c.store.read = read; await c.refresh(); assert.ok(view.main.querySelector('.prompt-linked-card')); c.dispose();
    let reads = 0; const broken = new Controller({ store: h.h.store, collectionStore: { subscribe() { throw new Error('blocked'); }, read() { reads++; return Collections.initial(); } } }); await broken.start(); assert.equal(reads, 0); assert.equal(broken.collectionError, 'READ'); broken.dispose();
});
test('Chinese result labels localize and bootstrap gives controller only read/subscribe capabilities', async () => {
    const h = await fixture('zh_CN'); await h.result(); assert.match(text(h.view.main), /此版本已保存的结果/); assert.match(text(h.view.main), /当前预览使用的确切版本： v1/); h.c.dispose();
    const boot = fs.readFileSync(`${__dirname}/../prompts.js`, 'utf8'); assert.match(boot, /createCollectionBackend/); assert.match(boot, /collectionStore = \{ read: .*subscribe:/);
    assert.doesNotMatch(boot, /fetch\(|\.mutate\(|\.request\(|storage\.local\.set/);
    const page = fs.readFileSync(`${__dirname}/../prompts.html`, 'utf8'); assert.ok(page.indexOf('local-ai-collections-store.js') < page.indexOf('local-prompts-controller.js'));
});
test('pagehide cleanup exists before a hung collection startup read and persisted pages stay active', async () => {
    const wait = deferred(), listeners = new Map(); let disposed = 0, started = false;
    const root = {
        document: { getElementById: () => ({}) }, location: { search: '' },
        LocalItabPrompts: { Store: class {} }, LocalItabAICollections: { Store: class {} },
        LocalItabWorkspaces: { manager: { createPromptBackend() {}, createCollectionBackend() {} } },
        LocalItabPromptsController: { Controller: class { start() { started = true; return wait.promise; } dispose() { disposed++; } } },
        LocalItabPromptsView: { View: class { attachDepartureGuard() {} render() {} } },
        LocalItabAISearch: { prepareTarget() {} },
        addEventListener: (name, fn) => listeners.set(name, fn)
    };
    vm.runInNewContext(fs.readFileSync(`${__dirname}/../prompts.js`, 'utf8'), { window: root });
    assert.equal(started, true); assert.equal(typeof listeners.get('pagehide'), 'function');
    listeners.get('pagehide')({ persisted: true }); assert.equal(disposed, 0);
    listeners.get('pagehide')({ persisted: false }); assert.equal(disposed, 1);
    wait.resolve(); await tick();
});
test('throwing prompt unsubscribe cannot preserve collection state or prevent independent listener cleanup', async () => {
    const h = await fixture(), { c, view } = h; await h.result(); const link = view.main.querySelector('.prompt-linked-card');
    const generation = c.collectionGeneration; let unsubscribed = 0;
    c.unsubscribe = () => { throw new Error('private cleanup failure'); };
    c.unsubscribeCollections = () => { unsubscribed++; };
    assert.doesNotThrow(() => c.dispose()); assert.equal(c.collectionState, null); assert.ok(c.collectionGeneration > generation); assert.equal(unsubscribed, 1);
    assert.equal(link.dispatch('click').prevented, true);
});
