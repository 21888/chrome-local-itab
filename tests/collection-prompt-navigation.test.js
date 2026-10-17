const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-ai-collections-store.js');
const Prompts = require('../shared/local-prompts-store.js');
const Search = require('../shared/local-ai-search.js');
const { Controller } = require('../shared/local-ai-collections-controller.js');
const { setup, settle } = require('./helpers/collections-harness.js');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

async function mount(language = 'en', historical = false) {
    const h = setup(), events = new Map(), effects = { promptReads: 0, collectionReads: 0, clipboard: 0, network: 0, provider: 0, navigation: 0 };
    let promptRaw, sequence = 0;
    const promptStore = new Prompts.Store({ lock: action => action(), read: async () => clone(promptRaw), write: async value => { promptRaw = clone(value); }, subscribe: () => () => {} },
        { id: () => `prompt_test_${++sequence}`, now: () => '2026-10-17T00:00:00.000Z' });
    let state = await promptStore.mutate(promptStore.request('add', { title: 'Synthetic prompt', body: '  Exact original\r\n{{topic}} <b>literal</b> 🧪  ' }));
    const original = clone(state.records[0]);
    state = await promptStore.mutate(promptStore.request('edit', { id: original.id, version: original.version, title: 'Current prompt title', body: 'Current template {{topic}}' }));
    const reference = { promptId: original.id, bodyVersionId: historical ? original.currentVersionId : state.records[0].currentVersionId };
    const read = h.backend.read.bind(h.backend); h.backend.read = async () => { effects.collectionReads++; return read(); };
    const c = new Controller({ store: h.store, promptStore: { read: async () => { effects.promptReads++; return clone(promptRaw); }, subscribe: () => () => {} } });
    const doc = createDocument({ blurUnavailableFocus: true, aggregateTextContent: true }), host = doc.createElement('div'); doc.body.append(host);
    const root = { document: doc, LocalItabAICollections: Core, LocalItabAISearch: Search,
        navigator: { clipboard: { writeText() { effects.clipboard++; } } }, fetch() { effects.network++; },
        LocalItabAIModel: { run() { effects.provider++; } }, location: { assign() { effects.navigation++; } },
        addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
    // Browser page code shares a realm with its controllers and strict data validators.
    // Keep that invariant without changing shared helpers or global.window.
    for (const file of ['dialog-focus', 'local-ai-collections-view']) {
        const install = vm.runInThisContext('(function(window) {\n' + fs.readFileSync(`${__dirname}/../shared/${file}.js`, 'utf8') + '\n})');
        install(root);
    }
    const messages = language === 'fallback' ? {} : JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${language}/messages.json`, 'utf8'));
    const label = (key, fallback) => messages[`collections${key}`]?.message || fallback;
    const view = new root.LocalItabCollectionsView.View({ host, controller: c, translate: label });
    view.render(); await c.start();
    const command = h.store.request('add', { title: 'Synthetic result', body: '  Exact result\r\n<script>text only</script>  ', type: 'answer', notes: 'Saved annotation', promptRef: reference });
    await h.store.mutate(command); await c.refresh(); c.select(command.operationId); await settle(c);
    return { h, c, view, doc, host, root, effects, events, original, reference, label, promptStore, get promptRaw() { return clone(promptRaw); }, setPrompt(state) { promptRaw = clone(state); } };
}
function link(h) { return h.view.promptPanel?.linked.querySelector('a.collection-open-prompt'); }
function dispatch(node, type = 'click') { return node.dispatch(type, type === 'auxclick' ? { button: 1 } : {}); }
function quiet(h) { return { effects: { ...h.effects }, raw: h.h.raw, writes: h.h.writes, prompts: h.promptRaw, selected: h.c.selected, drafts: [...h.c.drafts], record: clone(h.c.record()) }; }

// This first assertion exercises the mounted saved-detail entry, not a standalone helper.
test('saved detail exposes current prompt navigation through its exact link panel', async () => {
    const h = await mount(), anchor = link(h);
    assert.ok(anchor, 'saved exact prompt panel must offer current-details navigation');
    assert.equal(anchor.tagName, 'A'); assert.equal(anchor.href, Search.href('prompt', h.reference.promptId));
    assert.equal(anchor.target, '_blank'); assert.equal(anchor.rel, 'noopener noreferrer');
    assert.equal(dispatch(anchor).prevented, false); assert.equal(dispatch(anchor, 'auxclick').prevented, false);
    h.c.dispose();
});

for (const language of ['en', 'zh_CN', 'fallback']) for (const historical of [false, true]) test(`${language}: ${historical ? 'old' : 'current'} exact version opens current details without changing either library`, async () => {
    const h = await mount(language, historical), anchor = link(h), before = quiet(h);
    assert.equal(anchor.textContent, h.label('OpenPromptCurrent', 'Open current details in prompt library (new tab)'));
    assert.ok(h.view.promptPanel.linked.textContent.includes(h.label('OpenPromptCurrentHelp', 'Opens this prompt’s current saved details in a new tab. The exact historical version linked here and this excerpt stay unchanged; no version is selected for use.')));
    const exact = h.c.promptResolution(h.reference).version.body;
    assert.ok(h.view.promptPanel.linked.querySelectorAll('pre').some(node => node.textContent === exact));
    assert.equal(anchor.href, `prompts.html?record=${h.reference.promptId}`); assert.equal(anchor.href.includes(h.reference.bodyVersionId), false);
    h.view.search.focus(); h.view.search.value = 'retained query'; h.view.search.selectionStart = 2; h.view.search.selectionEnd = 5;
    for (const type of ['click', 'auxclick']) assert.equal(dispatch(anchor, type).prevented, false);
    assert.deepEqual(quiet(h), before); assert.equal(h.doc.activeElement, h.view.search); assert.equal(h.view.search.selectionStart, 2);
    assert.equal(h.view.search.value, 'retained query'); assert.equal(h.host.querySelector('script'), null);
    h.c.dispose();
});

for (const mode of ['archived', 'missing-prompt', 'missing-version', 'recovery-only', 'recovery-version-only', 'missing-state', 'loading', 'read-error', 'helper-missing']) test(`${mode}: unavailable prompt navigation does not replace the retained exact reference`, async () => {
    const h = await mount('en', true), old = link(h), before = clone(h.c.record()); let state = h.promptRaw;
    if (mode === 'archived') {
        const prompt = state.records[0];
        state = await h.promptStore.mutate(h.promptStore.request('remove', { id: prompt.id, version: prompt.version }));
    }
    if (mode === 'missing-prompt') state.records = [];
    if (mode === 'missing-version') state.records[0].history.shift();
    if (mode.startsWith('recovery')) {
        state.recovery = [{ id: 'recovery_test_01', createdAt: '2026-10-17T01:00:00.000Z', content: { records: clone(state.records) } }];
        if (mode === 'recovery-only') state.records = []; else state.records[0].history.shift();
    }
    h.setPrompt(state); await h.c.refreshPrompts();
    assert.equal(h.c.promptError, null, 'fixture must be a valid loaded snapshot, not a read failure');
    if (mode === 'archived') assert.equal(h.c.promptResolution(h.reference).provenance.archived, true);
    if (mode === 'missing-state') h.c.promptState = null;
    if (mode === 'loading') h.c.promptLoading = true;
    if (mode === 'read-error') h.c.promptError = 'READ';
    if (mode === 'helper-missing') delete h.root.LocalItabAISearch;
    h.c.notify('prompts');
    assert.equal(link(h), null); assert.equal(dispatch(old).prevented, true); assert.equal(dispatch(old, 'auxclick').prevented, true);
    assert.deepEqual(h.c.record(), before);
    if (mode.startsWith('recovery')) assert.equal(h.c.promptResolution(h.reference).status, 'resolved', 'a recovery resolution must not authorize current-record navigation');
    h.c.dispose();
});

for (const mode of ['new-draft', 'edit-draft', 'archived-result', 'unlinked-result']) test(`${mode}: no return action is added to editor, preview or inactive detail`, async () => {
    const h = await mount(), old = link(h);
    if (mode === 'new-draft') h.c.create();
    if (mode === 'edit-draft') h.c.edit();
    if (mode === 'archived-result') { await h.c.action('remove'); await settle(h.c); }
    if (mode === 'unlinked-result') { h.c.record().promptRef = null; h.c.notify(); }
    assert.equal(h.view.main.querySelector('a.collection-open-prompt'), null);
    if (h.c.draft()) { h.c.choosePrompt(h.reference.promptId, h.reference.bodyVersionId); assert.equal(h.view.promptPanel.preview.querySelector('a'), null); }
    for (const type of ['click', 'auxclick']) assert.equal(dispatch(old, type).prevented, true);
    h.c.dispose();
});

for (const [name, invalidate] of [
    ['busy', h => { h.c.busy = true; }], ['pending-save', h => { h.c.pendingCommand = {}; }],
    ['read-error', h => { h.c.error = { code: 'READ' }; }], ['pending-read', h => { h.c.pendingReadGeneration = h.c.readGeneration; }],
    ['prompt-read', h => { h.c.promptLoading = true; }], ['prompt-error', h => { h.c.promptError = 'READ'; }],
    ['prompt-generation', h => { h.c.promptGeneration++; }], ['read-generation', h => { h.c.readGeneration++; }],
    ['detail-generation', h => { h.view.detailGeneration++; }], ['state-replaced', h => { h.c.state = clone(h.c.state); }],
    ['prompt-state-replaced', h => { h.c.promptState = clone(h.c.promptState); }], ['record-version', h => { h.c.record().version++; }],
    ['body-version', h => { h.c.record().currentVersionId = 'another_version'; }], ['reference-changed', h => { h.c.record().promptRef.bodyVersionId = 'another_version'; }],
    ['prompt-archived', h => { h.c.promptState.records[0].deletedAt = '2026-10-17T01:00:00.000Z'; }],
    ['exact-history-removed', h => { h.c.promptState.records[0].history = []; }],
    ['modal-state', h => { h.view.openDialog = true; }], ['comparison', h => { h.view.comparison = {}; }],
    ['markdown-review', h => { h.view.exportingMarkdown = true; }], ['revision', h => { h.view.revisionDraft = 'proposed'; }],
    ['external-modal', h => { const modal = h.doc.createElement('dialog'); modal.open = true; h.doc.body.append(modal); }],
    ['hidden-document', h => { h.doc.visibilityState = 'hidden'; }], ['hidden-main', h => { h.view.main.hidden = true; }],
    ['inert-host', h => { h.host.inert = true; }], ['aria-hidden-host', h => { h.host.setAttribute('aria-hidden', 'true'); }],
    ['css-hidden-host', h => { h.host.style.visibility = 'hidden'; }], ['css-collapsed-host', h => { h.host.style.visibility = 'collapse'; }],
    ['display-none', h => { h.host.style.display = 'none'; }], ['host-detached', h => { h.host.remove(); }],
    ['anchor-detached', (h, anchor) => { anchor.remove(); }], ['record-switched', h => { h.c.select('missing_record'); }],
    ['destroyed', h => { h.view.destroy(); }], ['disposed', h => { h.c.dispose(); }]
]) test(`${name}: retained click and auxiliary-click handlers reject invalid detail ownership`, async () => {
    const h = await mount(), anchor = link(h); invalidate(h, anchor); const before = quiet(h);
    for (const type of ['click', 'auxclick']) assert.equal(dispatch(anchor, type).prevented, true, type);
    assert.deepEqual(quiet(h), before); h.c.dispose();
});


test('prompt refresh withdraws old nodes immediately; out-of-order success and failure cannot revive them', async () => {
    const h = await mount('en', true), c = h.c, old = link(h), first = deferred(), second = deferred(); let reads = 0;
    c.promptStore.read = () => (++reads === 1 ? first.promise : second.promise);
    const older = c.refreshPrompts(); assert.equal(link(h), null); assert.equal(dispatch(old).prevented, true);
    const newer = c.refreshPrompts(), current = h.promptRaw;
    second.resolve(current); await newer; const fresh = link(h); assert.ok(fresh); assert.notEqual(fresh, old);
    first.resolve(Promise.reject(new Error('late failed read'))); await older;
    assert.equal(link(h), fresh); assert.equal(dispatch(fresh).prevented, false); assert.equal(dispatch(old, 'auxclick').prevented, true);
    const wait = deferred(); c.promptStore.read = () => wait.promise;
    const reading = c.refreshPrompts(); c.dispose(); wait.resolve(current); await reading;
    assert.equal(link(h), null); assert.equal(dispatch(fresh).prevented, true);
});

test('failed and corrupt prompt reads retain exact text IDs without a return link until a successful refresh', async () => {
    const h = await mount(), c = h.c, ref = clone(c.record().promptRef);
    for (const read of [async () => { throw new Error('read failed'); }, async () => ({ records: [] })]) {
        c.promptStore.read = read; await c.refreshPrompts();
        assert.ok(c.promptError); assert.equal(link(h), null); assert.deepEqual(c.record().promptRef, ref);
    }
    c.promptStore.read = async () => h.promptRaw; await c.refreshPrompts(); assert.ok(link(h)); c.dispose();
});

test('collection read start invalidates old anchor and a failed read cannot be cleared by selecting cached detail', async () => {
    const h = await mount(), c = h.c, old = link(h), wait = deferred(), id = c.selected;
    const read = h.h.backend.read; h.h.backend.read = () => wait.promise;
    const refreshing = c.refresh();
    assert.equal(old.parentElement.hidden, true); assert.equal(dispatch(old).prevented, true); assert.equal(dispatch(old, 'auxclick').prevented, true);
    wait.resolve(Promise.reject(new Error('failed collection read'))); await refreshing;
    assert.equal(link(h), null); c.select(id); assert.equal(c.error, null); assert.equal(c.comparisonReady(), false); assert.equal(link(h), null);
    h.h.backend.read = read; await c.refresh(); assert.ok(link(h)); assert.equal(dispatch(old).prevented, true); c.dispose();
});

test('successful collection refresh and repeat prompt refresh replace old anchor ownership', async () => {
    const h = await mount(), c = h.c, original = clone(c.record());
    for (const refresh of [() => c.refresh(), () => c.refreshPrompts(), () => c.refreshPrompts()]) {
        const old = link(h); await refresh(); const next = link(h); assert.ok(next); assert.notEqual(next, old);
        assert.equal(dispatch(old).prevented, true); assert.equal(dispatch(old, 'auxclick').prevented, true);
        assert.equal(dispatch(next).prevented, false); assert.deepEqual(c.record(), original);
    }
    c.dispose();
});

test('visibility changes and bfcache suspend navigation without changing the exact link or stealing focus', async () => {
    const h = await mount(), anchor = link(h), record = clone(h.c.record()); h.view.search.focus();
    h.doc.visibilityState = 'hidden'; await h.doc.listeners.get('visibilitychange')();
    assert.equal(anchor.parentElement.hidden, true); assert.equal(dispatch(anchor).prevented, true);
    h.doc.visibilityState = 'visible'; await h.doc.listeners.get('visibilitychange')();
    assert.equal(anchor.parentElement.hidden, false); assert.equal(dispatch(anchor).prevented, false); assert.equal(h.doc.activeElement, h.view.search);
    h.events.get('pagehide')({ persisted: true }); assert.equal(dispatch(anchor, 'auxclick').prevented, true);
    h.events.get('pageshow')({ persisted: true }); const fresh = link(h); assert.ok(fresh); assert.notEqual(fresh, anchor);
    assert.equal(dispatch(fresh).prevented, false); assert.equal(dispatch(anchor).prevented, true); assert.deepEqual(h.c.record(), record);
    h.c.dispose();
});

test('a prompt read finishing in a hidden page becomes usable when visible again', async () => {
    const h = await mount(); h.doc.visibilityState = 'hidden'; await h.c.refreshPrompts(); const anchor = link(h);
    assert.ok(anchor); assert.equal(anchor.parentElement.hidden, true); assert.equal(dispatch(anchor).prevented, true);
    h.doc.visibilityState = 'visible'; await h.doc.listeners.get('visibilitychange')();
    assert.equal(anchor.parentElement.hidden, false); assert.equal(dispatch(anchor).prevented, false); h.c.dispose();
});

test('real dialog blocks background activation and refresh preserves modal focus; closing restores current-detail availability', async () => {
    const h = await mount(), old = link(h), pending = h.view.dialog({ title: 'Synthetic review', body: 'Read only', accept: 'Continue' });
    const cancel = h.doc.querySelector('[role="dialog"] button'); cancel.focus();
    assert.equal(dispatch(old).prevented, true); assert.equal(dispatch(old, 'auxclick').prevented, true);
    await h.c.refreshPrompts(); const fresh = link(h); assert.ok(fresh); assert.equal(dispatch(fresh).prevented, true);
    assert.equal(h.doc.activeElement, cancel); assert.equal(h.doc.querySelector('[role="dialog"]').querySelector('a.collection-open-prompt'), null);
    cancel.dispatch('click'); await pending;
    assert.equal(dispatch(fresh).prevented, false); assert.equal(dispatch(old).prevented, true); h.c.dispose();
});

test('drafts elsewhere remain intact; editor, history and historical prompt views do not gain navigation actions', async () => {
    const h = await mount(), c = h.c, id = c.selected;
    c.create(); c.update('title', 'Unsaved other draft'); c.update('body', 'Unsaved other body'); const draft = c.draft();
    c.select(id); const before = quiet(h), anchor = link(h); assert.ok(anchor);
    assert.equal(h.view.main.querySelector('.prompt-history').querySelector('a.collection-open-prompt'), null);
    assert.equal(dispatch(anchor).prevented, false); assert.deepEqual(quiet(h), before); assert.equal(c.drafts.get('new'), draft);
    c.edit(); assert.equal(h.view.main.querySelector('a.collection-open-prompt'), null); assert.equal(dispatch(anchor).prevented, true); c.dispose();
});

test('native destination retains existing current-record missing and archived semantics', async () => {
    const h = await mount('en', true), anchor = link(h), request = Search.target(anchor.href.slice(anchor.href.indexOf('?'))), state = h.promptRaw;
    assert.deepEqual(Search.resolveTarget(state, request), { id: h.reference.promptId });
    assert.notEqual(state.records[0].currentVersionId, h.reference.bodyVersionId);
    state.records[0].deletedAt = state.records[0].updatedAt; assert.equal(Search.resolveTarget(state, request).error, 'archived');
    state.records = []; assert.equal(Search.resolveTarget(state, request).error, 'missing'); h.c.dispose();
});

test('new labels are distinct locale keys and both exact-version and current-detail boundaries are translated', () => {
    for (const locale of ['en', 'zh_CN']) {
        const entries = JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${locale}/messages.json`, 'utf8'));
        const keys = Object.keys(entries).map(key => key.toLowerCase()); assert.equal(keys.length, new Set(keys).size);
        for (const name of ['collectionsOpenPromptCurrent', 'collectionsOpenPromptCurrentHelp']) assert.ok(entries[name]?.message);
        assert.match(entries.collectionsOpenPromptCurrentHelp.message, locale === 'en' ? /current saved details.*exact historical version.*unchanged/ : /当前已保存的详情.*精确历史版本.*保持不变/);
    }
});

test('late successful prompt reads do not override a newer failure or restore an old anchor', async () => {
    const h = await mount(), c = h.c, old = link(h), first = deferred(), second = deferred(); let reads = 0;
    c.promptStore.read = () => (++reads === 1 ? first.promise : second.promise);
    const older = c.refreshPrompts(), newer = c.refreshPrompts();
    second.resolve(Promise.reject(new Error('newer failed read'))); await newer;
    first.resolve(h.promptRaw); await older;
    assert.ok(c.promptError); assert.equal(link(h), null); assert.equal(dispatch(old).prevented, true); assert.equal(dispatch(old, 'auxclick').prevented, true); c.dispose();
});

test('historical question review keeps its own scope and contains no current-prompt action', async () => {
    const h = await mount('en', true), question = 'Synthetic historical question', sources = [{ id: 'synthetic_source', label: 'Synthetic source', text: 'Historical source text' }];
    const command = h.h.store.request('add', { title: 'Synthetic snapshot result', body: 'Saved answer', type: 'answer', promptRef: h.reference,
        contextSnapshot: { schemaVersion: 1, question, sources, endpoint: 'https://model.example/v1/chat/completions', model: 'synthetic', prompt: 'Synthetic instruction\n' + JSON.stringify({ question, sources }) } });
    await h.h.store.mutate(command); await h.c.refresh(); h.c.select(command.operationId); await settle(h.c);
    const panel = h.view.main.querySelector('.collection-historical-prompt'), open = h.view.main.querySelectorAll('button').find(button => button.textContent === h.label('HistoricalPromptReview', 'Review historical full prompt'));
    open.dispatch('click'); assert.equal(panel.hidden, false); assert.equal(panel.querySelector('a.collection-open-prompt'), null);
    assert.equal(h.view.main.querySelectorAll('a.collection-open-prompt').length, 1); assert.equal(link(h).closest('.collection-prompt-link'), h.view.promptPanel.box);
    h.c.dispose();
});
