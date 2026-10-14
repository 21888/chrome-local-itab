const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const Core = require('../shared/local-ai-collections-store');
const Context = require('../shared/ai-context');
const { comparisonCandidates } = require('../shared/local-ai-collections-controller');
const { setup, add, tick } = require('./helpers/collections-harness');
const { createDocument } = require('./helpers/task-dom-model');
const text = node => [node.textContent || '', ...node.children.map(text)].join(' ');
const ref = { promptId: 'prompt_0001', bodyVersionId: 'version_0001' };
const manualTitle = 'Compare any saved excerpts';

async function mount({ locale = 'en', fixtures = true } = {}) {
    const h = setup(), c = h.controller, doc = createDocument({ blurUnavailableFocus: true }), events = new Map();
    const host = doc.createElement('main'); doc.body.append(host);
    const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const calls = { network: 0, clipboard: 0, grant: 0 };
    const root = { document: doc, LocalItabAICollections: Core, i18n: { t: key => messages[key]?.message || key },
        addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key),
        fetch: () => { calls.network++; }, navigator: { clipboard: { writeText: () => { calls.clipboard++; } } },
        chrome: { permissions: { request: () => { calls.grant++; } } } };
    const context = vm.createContext({ window: root });
    for (const file of ['dialog-focus.js', 'local-ai-collections-view.js']) vm.runInContext(fs.readFileSync(`shared/${file}`, 'utf8'), context);
    const view = new root.LocalItabCollectionsView.View({ host, controller: c }); view.render(); await c.start();
    const save = async fields => {
        const command = h.store.request('add', fields); await h.store.mutate(command); await tick();
        return c.record(command.operationId);
    };
    let a, b, linked, archived;
    if (fixtures) {
        const packed = Context.pack('Private synthetic question', [{ id: 'collection:synthetic', label: 'Synthetic source', text: 'Snapshot-only synthetic text' }]);
        a = await save({ title: 'Context answer <script>literal</script>', body: 'first\r\nsecond\rthird\n  中文 😀\t', sourceUrl: 'https://first.example/source',
            contextSnapshot: { schemaVersion: 1, question: packed.question, sources: packed.sources, prompt: packed.prompt, endpoint: 'https://provider.example/v1/chat/completions', model: 'synthetic' } });
        b = await save({ title: 'Manual excerpt', body: '<img src=x onerror=bad>\n```\nexact\n```\r\n', tool: 'Other tool', sourceUrl: 'https://second.example/user-provided?q=synthetic' });
        linked = await save({ title: 'Linked result', body: 'Linked saved body', promptRef: ref });
        archived = await save({ title: 'Archived result', body: 'Archived text' });
        await h.store.mutate(h.store.request('remove', { id: archived.id, version: archived.version })); await tick();
        c.select(a.id);
    }
    const open = (id = a?.id, scope = 'manual') => {
        view.compareSaved(id, scope);
        const overlay = doc.querySelector('.prompt-dialog-overlay');
        return { overlay, chooser: overlay?.querySelector('select'), bodies: () => overlay.querySelectorAll('pre') };
    };
    const choose = (dialog, id) => { dialog.chooser.value = id; dialog.chooser.dispatch('change'); };
    return { ...h, h, c, view, doc, host, events, calls, root, save, a, b, linked, archived, open, choose };
}

test('manual candidates include unlinked and differently linked active saved records only; unknown scopes fail closed', () => {
    const source = { id: 'context', promptRef: null }, plain = { id: 'plain' }, linked = { id: 'linked', promptRef: ref },
        different = { id: 'different', promptRef: { ...ref, bodyVersionId: 'different-version' } };
    const state = { records: [source, plain, linked, different, { id: 'archived', deletedAt: 'now' }], recovery: [{ content: { records: [{ id: 'recovery' }] } }] };
    assert.deepEqual(comparisonCandidates(state, source.id, 'manual'), [plain, linked, different]);
    assert.deepEqual(comparisonCandidates(state, linked.id), []);
    for (const scope of [null, '', 'all', false]) assert.deepEqual(comparisonCandidates(state, source.id, scope), []);
    for (const id of ['missing', 'archived']) assert.deepEqual(comparisonCandidates(state, id, 'manual'), []);
    source.deletedAt = 'now'; assert.deepEqual(comparisonCandidates(state, source.id, 'manual'), []);
});

test('unlinked context answer has a manual entry and explicit chooser, with exact saved text and independent provenance', async () => {
    const h = await mount(), { c, view, doc, a, b, linked } = h;
    const before = JSON.stringify(c.state), writes = h.h.writes;
    assert.equal(view.main.querySelectorAll('button').some(node => node.textContent === 'Compare saved results'), false);
    const trigger = view.main.querySelectorAll('button').find(node => node.textContent === manualTitle); assert.ok(trigger);
    trigger.focus(); trigger.dispatch('click'); trigger.dispatch('click');
    const overlay = doc.querySelector('.prompt-dialog-overlay'), chooser = overlay.querySelector('select');
    assert.equal(doc.querySelectorAll('.prompt-dialog-overlay').length, 1); assert.equal(chooser.value, '');
    assert.deepEqual(chooser.children.map(node => node.value), ['', b.id, linked.id]);
    assert.equal(overlay.querySelectorAll('pre').length, 1); assert.equal(doc.activeElement, chooser);
    assert.match(text(overlay), /no shared prompt or provenance is assumed/); assert.match(text(overlay), /No saved prompt-version link/);
    assert.match(text(overlay), /historical input for its first answer version/); assert.ok(text(overlay).includes(a.history[0].id));
    assert.equal(text(overlay).includes('Snapshot-only synthetic text'), false); assert.equal(text(overlay).includes('Private synthetic question'), false);
    chooser.value = b.id; chooser.dispatch('change');
    assert.deepEqual(overlay.querySelectorAll('pre').map(node => node.textContent), [a.body, b.body]);
    for (const item of [a, b]) { assert.ok(text(overlay).includes(item.id)); assert.ok(text(overlay).includes(item.currentVersionId)); assert.ok(text(overlay).includes(item.sourceUrl)); }
    assert.equal(overlay.querySelectorAll('a, script, iframe, img').length, 0);
    assert.equal(JSON.stringify(c.state), before); assert.equal(h.h.writes, writes); assert.deepEqual(h.calls, { network: 0, clipboard: 0, grant: 0 });
    chooser.dispatch('keydown', { key: 'Escape', isComposing: true }); assert.equal(view.openDialog, true);
    chooser.dispatch('keydown', { key: 'Escape' }); assert.equal(view.openDialog, false); assert.equal(doc.activeElement, trigger); c.dispose();
});

test('manual selection includes all active saved records despite sidebar filters and preserves unrelated drafts', async () => {
    const h = await mount(); h.c.edit(h.b.id); h.c.update('body', 'UNSAVED BODY'); const draft = h.c.draft();
    h.c.select(h.a.id); h.c.filter({ query: 'no results', tag: 'no tag', type: 'code', tool: 'no tool' });
    const d = h.open(); h.choose(d, h.b.id);
    assert.deepEqual(d.bodies().map(node => node.textContent), [h.a.body, h.b.body]);
    assert.equal(text(d.overlay).includes('UNSAVED BODY'), false); assert.match(text(d.overlay), /regardless of sidebar filters/);
    h.view.closeComparison(); assert.equal(h.c.drafts.get(h.b.id), draft); assert.equal(draft.input.body, 'UNSAVED BODY'); h.c.dispose();
});

test('exact linked comparison stays separate and cannot silently expand to manual candidates', async () => {
    const h = await mount(), same = await h.save({ title: 'Same link', body: 'Same link body', promptRef: ref }); h.c.select(h.linked.id);
    const buttons = h.view.main.querySelectorAll('button').map(node => node.textContent);
    assert.ok(buttons.includes(manualTitle)); assert.ok(buttons.includes('Compare saved results'));
    let d = h.open(h.linked.id, 'prompt');
    assert.deepEqual(d.chooser.children.map(node => node.value), ['', same.id]);
    assert.match(text(d.overlay), /same exact prompt and version/); assert.match(text(d.overlay), /Matching uses saved link IDs only/);
    h.choose(d, h.b.id); assert.equal(d.bodies().length, 1); h.view.closeComparison();
    d = h.open(h.linked.id); h.choose(d, h.b.id); assert.equal(d.bodies().length, 2);
    assert.ok(text(d.overlay).includes(`${ref.promptId} / ${ref.bodyVersionId}`)); assert.match(text(d.overlay), /No saved prompt-version link/);
    h.c.dispose();
});

test('only current bodies are compared after revision, with historical input explicitly tied to the first version', async () => {
    const h = await mount();
    await h.store.mutate(h.store.request('revise', await h.store.reviewRevision({ id: h.a.id, version: h.a.version, body: 'Current revised excerpt' }))); await tick();
    const current = h.c.record(h.a.id), d = h.open(); h.choose(d, h.b.id);
    assert.equal(d.bodies()[0].textContent, 'Current revised excerpt'); assert.ok(text(d.overlay).includes(current.currentVersionId));
    assert.ok(text(d.overlay).includes(h.a.currentVersionId)); assert.match(text(d.overlay), /may differ from the current revised excerpt/);
    assert.equal(d.bodies().some(node => node.textContent === h.a.body), false); h.c.dispose();
});

test('identical saved text is reported exactly, and a selected unknown or archived ID cannot substitute text', async () => {
    const h = await mount(), equal = await h.save({ title: 'Identical', body: h.a.body }); h.c.select(h.a.id);
    const d = h.open(); h.choose(d, equal.id); assert.match(text(d.overlay), /exactly identical/);
    for (const id of ['missing', h.archived.id, h.a.id, '']) { h.choose(d, id); assert.deepEqual(d.bodies().map(node => node.textContent), [h.a.body]); assert.doesNotMatch(text(d.overlay), /exactly identical/); }
    h.c.dispose();
});

test('one saved record has an honest empty state with Close focused, and reopening never auto-selects newly saved candidates', async () => {
    const h = await mount({ fixtures: false }), one = await add(h.c, 'One', 'One saved body');
    let d = h.open(one.id); assert.equal(d.chooser.disabled, true); assert.match(text(d.overlay), /No other current unarchived saved excerpt/);
    assert.equal(h.doc.activeElement.textContent, 'Close comparison'); h.view.closeComparison();
    const two = await add(h.c, 'Two', 'Second saved body'); h.c.select(one.id); d = h.open(one.id);
    assert.equal(d.chooser.value, ''); assert.equal(d.chooser.disabled, false); assert.deepEqual(d.chooser.children.map(node => node.value), ['', two.id]); assert.equal(d.bodies().length, 1); h.c.dispose();
});

for (const target of ['source', 'candidate']) for (const change of ['archive', 'metadata', 'body']) test(`${target} ${change} invalidates manual text and requires a new explicit choice`, async () => {
    const h = await mount(), d = h.open(); h.choose(d, h.b.id); const item = target === 'source' ? h.a : h.b;
    if (change === 'archive') await h.store.mutate(h.store.request('remove', { id: item.id, version: item.version }));
    if (change === 'metadata') await h.store.mutate(h.store.request('edit', { id: item.id, version: item.version, sourceUrl: 'https://changed.example/source' }));
    if (change === 'body') await h.store.mutate(h.store.request('revise', await h.store.reviewRevision({ id: item.id, version: item.version, body: 'New exact body' })));
    await tick(); assert.equal(d.bodies().length, 0); assert.equal(d.chooser.disabled, true); assert.match(text(d.overlay), /comparison has been cleared/);
    assert.equal(h.doc.activeElement.textContent, 'Close comparison'); d.chooser.dispatch('change'); assert.equal(d.bodies().length, 0);
    h.view.closeComparison(); const next = h.open();
    if (target === 'source' && change === 'archive') { assert.equal(next.overlay, null); assert.equal(h.view.main.querySelectorAll('button').some(node => node.textContent === manualTitle), false); }
    else { assert.equal(next.chooser.value, ''); assert.equal(next.bodies().length, 1); if (change === 'archive') assert.equal(next.chooser.children.some(node => node.value === h.b.id), false); }
    h.c.dispose();
});

test('read failure clears comparison before the await and cached records cannot reopen it until a successful fresh read', async () => {
    const h = await mount(), d = h.open(); h.choose(d, h.b.id);
    const read = h.store.read.bind(h.store); let reject;
    h.store.read = () => new Promise((_, no) => { reject = no; });
    const pending = h.c.refresh(); assert.equal(d.bodies().length, 0); assert.equal(d.chooser.disabled, true);
    reject(new Error('synthetic unavailable read')); await pending; assert.ok(h.c.state);
    h.view.closeComparison(); assert.equal(h.open().overlay, null);
    h.store.read = read; await h.c.refresh(); const next = h.open(); assert.equal(next.chooser.value, ''); assert.equal(next.bodies().length, 1); h.c.dispose();
});

for (const reset of ['select', 'create-discard', 'edit-update-discard']) test(`a failed read stays fenced after ${reset} clears its ordinary error notice`, async () => {
    const h = await mount(), read = h.store.read.bind(h.store);
    h.store.read = async () => { throw new Error('synthetic read failure'); }; await h.c.refresh();
    if (reset === 'select') { h.c.select(h.b.id); h.c.select(h.a.id); }
    if (reset === 'create-discard') { h.c.create(); h.c.discard(); h.c.select(h.a.id); }
    if (reset === 'edit-update-discard') { h.c.edit(); h.c.update('notes', 'unsaved'); h.c.discard(); }
    assert.equal(h.c.error, null); assert.equal(h.c.comparisonReady(), false); assert.deepEqual(h.c.comparisonCandidates(h.a.id, 'manual'), []);
    assert.equal(h.open().overlay, null); assert.match(text(h.view.main), /Refresh saved data successfully before comparing/);
    const refresh = h.view.main.querySelectorAll('button').find(node => node.textContent === 'Refresh saved data'); assert.ok(refresh);
    h.store.read = read; refresh.dispatch('click'); await tick(); assert.equal(h.c.comparisonReady(), true); assert.ok(h.open().overlay); h.c.dispose();
});

test('a lower-revision read cannot reverify cached current records, even after selection clears its error', async () => {
    const h = await mount(), cached = h.c.state, read = h.store.read.bind(h.store);
    h.store.read = async () => ({ ...cached, revision: cached.revision - 1 }); await h.c.refresh();
    assert.equal(h.c.state, cached); assert.equal(h.c.error.code, 'READ'); assert.equal(h.c.comparisonReady(), false);
    h.c.select(h.a.id); assert.equal(h.c.error, null); assert.equal(h.open().overlay, null);
    h.store.read = read; await h.c.refresh(); assert.equal(h.c.comparisonReady(), true); h.c.dispose();
});

test('a verified save can supply current comparison state when its backend does not notify subscribers', async () => {
    const h = await mount(), read = h.store.read.bind(h.store);
    h.store.read = async () => { throw new Error('synthetic read failure'); }; await h.c.refresh();
    h.store.read = read; h.c.unsubscribe();
    const saved = await add(h.c, 'Verified acknowledgement', 'Read back by the fenced store');
    assert.equal(h.c.comparisonReady(), true); assert.ok(h.open(saved.id).overlay); h.c.dispose();
});

test('out-of-order reads never revive cleared manual comparison or silently choose the previous item', async () => {
    const h = await mount(), d = h.open(); h.choose(d, h.b.id);
    const read = h.store.read.bind(h.store), old = h.c.state; let resolve;
    h.store.read = () => new Promise(done => { resolve = done; }); const pending = h.c.refresh();
    h.store.read = read; await h.c.refresh(); resolve(old); await pending;
    assert.equal(d.bodies().length, 0); assert.equal(d.chooser.disabled, true); d.chooser.dispatch('change'); assert.equal(d.bodies().length, 0);
    h.view.closeComparison(); assert.equal(h.open().chooser.value, ''); h.c.dispose();
});

test('Close clears detached bodies and old chooser callbacks cannot alter a reopened comparison', async () => {
    const h = await mount(), old = h.open(); h.choose(old, h.b.id); h.view.closeComparison();
    assert.equal(old.bodies().length, 0); assert.equal(old.chooser.disabled, true);
    const next = h.open(); h.choose(old, h.linked.id);
    assert.equal(old.bodies().length, 0); assert.equal(next.chooser.value, ''); assert.deepEqual(next.bodies().map(node => node.textContent), [h.a.body]); h.c.dispose();
});

for (const cause of ['busy', 'uncertain', 'read-pending', 'read-error', 'draft', 'hidden', 'detached', 'disposed', 'invalid-scope']) test(`${cause} blocks a new manual comparison`, async () => {
    const h = await mount();
    if (cause === 'busy') h.c.busy = true;
    if (cause === 'uncertain') h.c.pendingCommand = {};
    if (cause === 'read-pending') h.c.pendingReadGeneration = h.c.readGeneration;
    if (cause === 'read-error') h.c.error = { code: 'READ' };
    if (cause === 'draft') h.c.edit();
    if (cause === 'hidden') h.doc.visibilityState = 'hidden';
    if (cause === 'detached') h.host.remove();
    if (cause === 'disposed') h.c.dispose();
    assert.equal(h.open(h.a.id, cause === 'invalid-scope' ? 'all' : 'manual').overlay, null); h.c.dispose();
});

for (const cause of ['selection', 'edit', 'busy', 'pagehide', 'bfcache', 'dispose']) test(`${cause} invalidates an open manual comparison`, async () => {
    const h = await mount(), d = h.open(); h.choose(d, h.b.id);
    if (cause === 'selection') h.c.select(h.b.id);
    if (cause === 'edit') h.c.edit();
    if (cause === 'busy') { h.c.busy = true; h.c.notify(); }
    if (cause === 'pagehide') h.events.get('pagehide')({ persisted: false });
    if (cause === 'bfcache') { h.events.get('pagehide')({ persisted: true }); h.events.get('pageshow')({ persisted: true }); }
    if (cause === 'dispose') h.c.dispose();
    assert.equal(d.bodies().length, 0); d.chooser.dispatch('change'); assert.equal(d.bodies().length, 0);
    if (['pagehide', 'bfcache', 'dispose'].includes(cause)) { assert.equal(h.view.openDialog, false); assert.equal(h.host.inert, false); }
    h.c.dispose();
});

test('Chinese labels describe arbitrary excerpt scope and each independent source', async () => {
    const h = await mount({ locale: 'zh_CN' }), d = h.open(); h.choose(d, h.b.id);
    assert.match(text(d.overlay), /手动对照任意收藏摘录/); assert.match(text(d.overlay), /不假定共有提示词或来源/);
    assert.match(text(d.overlay), /用户提供的来源网址（未经核验）/); assert.match(text(d.overlay), /没有已保存的提示词版本关联/);
    assert.match(text(d.overlay), /首版回答的历史输入/); h.c.dispose();
});

test('responsive comparison layout remains side-by-side with a narrow-screen stack and scrollable exact bodies', () => {
    const css = fs.readFileSync('collections.css', 'utf8');
    assert.match(css, /collection-comparison-grid[^}]+grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(css, /collection-comparison-grid \.prompt-readonly[^}]+overflow: auto; white-space: pre-wrap/);
    assert.match(css, /@media \(max-width: 700px\)[^}]+grid-template-columns: minmax\(0, 1fr\)/);
});
