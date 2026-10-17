const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-ai-collections-store.js');
const { setup, add, settle } = require('./helpers/collections-harness.js');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');

async function mount(language = 'en') {
    const h = setup(), doc = createDocument({ blurUnavailableFocus: true, aggregateTextContent: true });
    const host = doc.createElement('div'); doc.body.append(host);
    const events = new Map(), effects = { reads: 0, clipboard: 0, network: 0, provider: 0 };
    const read = h.backend.read.bind(h.backend); h.backend.read = async () => { effects.reads++; return read(); };
    const root = { document: doc, LocalItabAICollections: Core,
        navigator: { clipboard: { writeText() { effects.clipboard++; } } },
        fetch() { effects.network++; }, LocalItabAIModel: { run() { effects.provider++; } },
        addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
    const context = vm.createContext({ window: root, Intl, Date, Object, Array, Boolean, String, Promise, Map });
    for (const file of ['dialog-focus', 'local-ai-collections-view']) vm.runInContext(fs.readFileSync(`${__dirname}/../shared/${file}.js`, 'utf8'), context);
    const messages = language === 'fallback' ? {} : JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${language}/messages.json`, 'utf8'));
    const label = (key, fallback) => messages[`collections${key}`]?.message || fallback;
    const view = new root.LocalItabCollectionsView.View({ host, controller: h.controller, translate: label });
    view.render(); view.attachDepartureGuard(); await h.controller.start(); await settle(h.controller);
    return { h, controller: h.controller, host, doc, view, events, effects, label, root };
}
function reuse(h) { return h.view.main.querySelectorAll('button').find(button => button.textContent === h.label('ReuseDraft', 'New draft from this excerpt')); }

test('active saved detail exposes a native secondary new-draft action', async () => {
    const h = await mount(), c = h.controller; await add(c);
    const button = reuse(h);
    assert.ok(button, 'saved detail is missing New draft from this excerpt');
    assert.equal(button.tagName, 'BUTTON'); assert.equal(button.type, 'button');
    assert.equal(button.classList.contains('prompt-primary'), false);
    assert.equal(button.disabled, false); c.dispose();
});

const clone = value => JSON.parse(JSON.stringify(value));
const tags = ['Research, planning', '保留，原始标签'];
async function seed(h, history = 1) {
    const question = 'Synthetic historical question', sources = [{ id: 'synthetic_01', label: 'Old source', text: 'Historical source text' }];
    const data = { title: 'Synthetic source', body: '  <b>literal</b>\r\n中文 🧪\rFinal\n  ', type: 'code', tags,
        notes: '  Annotation\r\nSecond\rThird  ', tool: 'Synthetic tool', sourceUrl: 'https://source.example/excerpt?q=synthetic#section',
        promptRef: { promptId: 'prompt_exact_01', bodyVersionId: 'version_exact_01' },
        contextSnapshot: { schemaVersion: 1, question, sources, endpoint: 'https://model.example/v1/chat/completions', model: 'synthetic', prompt: 'Synthetic instruction\n' + JSON.stringify({ question, sources }) } };
    const command = h.h.store.request('add', data); await h.h.store.mutate(command); await h.controller.refresh(); h.controller.select(command.operationId);
    await settle(h.controller);
    for (let n = 1; n < history; n++) {
        assert.equal(await h.controller.acceptRevision(await h.controller.reviewBody(data.body + `Version ${n}\r\n`)), true);
        await settle(h.controller);
    }
    await settle(h.controller); return h.controller.record();
}
function quietSnapshot(h) { return { effects: { ...h.effects }, writes: h.h.writes, raw: h.h.raw }; }
function assertQuiet(h, before) { assert.deepEqual(h.effects, before.effects); assert.equal(h.h.writes, before.writes); assert.deepEqual(h.h.raw, before.raw); }
function activate(h) { const button = reuse(h); assert.ok(button); button.focus(); button.dispatch('click'); return button; }
function leaveGuard(h) { const event = { preventDefault() { this.prevented = true; } }; h.events.get('beforeunload')(event); return Boolean(event.prevented); }

for (const language of ['en', 'zh_CN', 'fallback']) test(`${language}: activation creates only an editable dirty snapshot with exact fields and no I/O`, async () => {
    const h = await mount(language), c = h.controller, source = await seed(h), before = quietSnapshot(h);
    c.promptState = require('../shared/local-prompts-store.js').initial();
    activate(h); const draft = c.draft();
    assert.equal(c.selected, 'new'); assert.equal(c.drafts.get('new'), draft);
    assert.deepEqual(clone(draft.input), { title: source.title, body: source.body, type: source.type, tool: source.tool,
        sourceUrl: source.sourceUrl, notes: source.notes, tagsText: tags.join(', '), promptId: source.promptRef.promptId, bodyVersionId: source.promptRef.bodyVersionId });
    assert.deepEqual(draft.originalTags, tags); assert.notEqual(draft.originalTags, source.tags);
    assert.deepEqual(clone(draft.baseline), {});
    for (const field of ['id', 'version', 'history', 'currentVersionId', 'deletedAt', 'contextSnapshot', 'exactResult', 'captured', 'captureSource', 'proposal']) assert.equal(Object.hasOwn(draft, field), false, field);
    assert.deepEqual(Object.keys(draft).sort(), ['baseline', 'conflict', 'input', 'originalTags']);
    assert.equal(h.view.editor.fields.body.readOnly, false); assert.equal(h.doc.activeElement, h.view.editor.fields.title);
    assert.equal(c.dirty(), true); assert.equal(c.hasUncommittedWork(), true); assert.equal(leaveGuard(h), true);
    assert(h.view.main.textContent.includes(h.label('ReuseDraftScope', 'This unsaved draft uses the current excerpt, details and exact prompt link. Body history, historical questions and source snapshots are not copied. Review or remove the prompt link below; a missing version is never replaced with the latest.')));
    assert(h.view.main.textContent.includes(source.promptRef.bodyVersionId));
    assert.equal(c.promptResolution(source.promptRef).status, 'unresolved');
    assert(h.view.main.textContent.includes(h.label('PromptMissing', 'This exact prompt version is missing locally. Its IDs are kept; no substitute is used.')));
    assert.equal(h.view.main.textContent.includes(source.contextSnapshot.question), false);
    assertQuiet(h, before); c.select(source.id); c.select('new'); assert.equal(c.draft(), draft); assert.equal(draft.input.body, source.body); c.dispose();
});

test('explicit duplicate cancel keeps the draft; confirmed save makes one independent version and leaves 20 source versions intact', async () => {
    const h = await mount(), c = h.controller, source = await seed(h, 20); activate(h);
    const draft = c.draft(), before = quietSnapshot(h), dialogs = [];
    h.view.confirm = async options => { dialogs.push(options); return false; };
    await h.view.save(); assert.equal(dialogs.length, 1); assert.equal(c.draft(), draft); assert.equal(c.pendingCommand, null); assertQuiet(h, before);
    h.view.confirm = async () => true; await h.view.save(); await settle(c);
    const saved = c.record(); assert.notEqual(saved.id, source.id); assert.equal(saved.history.length, 1); assert.equal(saved.history[0].body, source.body);
    for (const key of ['title', 'body', 'type', 'notes', 'tool', 'sourceUrl', 'tags', 'promptRef']) assert.deepEqual(saved[key], source[key], key);
    assert.equal(Object.hasOwn(saved, 'contextSnapshot'), false); assert.equal(saved.deletedAt, null);
    assert.deepEqual(c.record(source.id), source); assert.equal(c.record(source.id).history.length, 20);
    assert.equal(h.h.writes, before.writes + 1); assert.equal(c.draft(), undefined); assert.equal(leaveGuard(h), false); c.dispose();
});

test('textarea display normalization never rewrites the raw source until an actual edit; intentional tags and unlink follow existing rules', async () => {
    const h = await mount(), c = h.controller, source = await seed(h), createElement = h.doc.createElement;
    h.doc.createElement = tag => {
        const node = createElement(tag);
        if (tag === 'textarea') { let value = ''; Object.defineProperty(node, 'value', { get: () => value, set: next => { value = next.replace(/\r\n?/g, '\n'); } }); }
        return node;
    };
    activate(h); assert.equal(h.view.editor.fields.body.value, source.body.replace(/\r\n?/g, '\n'));
    assert.equal(c.draft().input.body, source.body); assert.equal(c.draft().input.notes, source.notes);
    h.view.confirm = async () => true; await h.view.save(); await settle(c);
    assert.equal(c.record().body, source.body); assert.equal(c.record().notes, source.notes); assert.deepEqual(c.record().tags, tags);
    activate(h);
    for (const [key, value] of [['body', 'Edited\r\nbody\rline'], ['notes', 'Edited\r\nnote'], ['tagsText', 'one，two, three']]) {
        const field = h.view.editor.fields[key]; field.value = value; field.dispatch('input');
    }
    h.view.promptPanel.unlink.dispatch('click');
    await h.view.save(); await settle(c);
    assert.equal(c.record().body, 'Edited\nbody\nline'); assert.equal(c.record().notes, 'Edited\nnote'); assert.deepEqual(c.record().tags, ['one', 'two', 'three']);
    assert.equal(c.record().promptRef, null); assert.deepEqual(c.record(source.id), source); c.dispose();
});

for (const kind of ['ordinary', 'exactResult', 'captured']) test(`existing ${kind} new draft is selected without replacing any fields, flags or baseline`, async () => {
    const h = await mount(), c = h.controller, source = await seed(h); c.create(); c.update('title', 'Existing'); c.update('body', 'Existing text');
    const draft = c.draft(); if (kind !== 'ordinary') draft[kind] = true;
    if (kind === 'captured') draft.captureSource = 'https://capture.example/';
    draft.promptCandidate = { promptId: 'kept_prompt_01', bodyVersionId: 'kept_version_01' };
    const beforeDraft = clone(draft), baseline = draft.baseline, input = draft.input;
    c.select(source.id); const before = quietSnapshot(h); activate(h);
    assert.equal(c.draft(), draft); assert.equal(draft.baseline, baseline); assert.equal(draft.input, input); assert.deepEqual(clone(draft), beforeDraft);
    assert.equal(h.view.status.textContent, h.label('ReuseDraftExisting', 'Finish or discard the existing new-item draft first. It has not been changed.'));
    assert.equal(h.view.reusedDrafts.has(draft), false); assertQuiet(h, before); c.dispose();
});

test('other record drafts and same/other proposals remain untouched; current saved body is used', async () => {
    const h = await mount(), c = h.controller, source = await seed(h), other = await add(c, 'Other', 'Other body');
    c.edit(); c.update('notes', 'Unsaved other annotation'); const otherDraft = c.draft(), snapshot = clone(otherDraft);
    h.view.proposals.set(source.id, 'Different proposal'); h.view.proposals.set(other.id, 'Other proposal'); c.select(source.id);
    const before = quietSnapshot(h); activate(h);
    assert.equal(c.draft().input.body, source.body); assert.equal(c.drafts.get(other.id), otherDraft); assert.deepEqual(otherDraft, snapshot);
    assert.deepEqual([...h.view.proposals], [[source.id, 'Different proposal'], [other.id, 'Other proposal']]); assertQuiet(h, before); c.dispose();
});

const blockers = {
    busy: h => { h.controller.busy = true; },
    pending: h => { h.controller.pendingCommand = { command: { kind: 'add' }, draftKey: 'new', action: 'save' }; h.controller.pendingInspection = true; },
    error: h => { h.controller.error = { code: 'READ', scope: 'read' }; },
    read: h => { h.controller.pendingReadGeneration = h.controller.readGeneration; },
    unverified: h => { h.controller.comparisonReadGeneration = null; },
    draft: h => { h.controller.drafts.set(h.controller.selected, h.controller.makeDraft(h.controller.record())); },
    modal: h => { h.view.openDialog = true; },
    foreignModal: h => { const dialog = h.doc.createElement('div'); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); h.doc.body.append(dialog); },
    comparison: h => { h.view.comparison = {}; },
    exporting: h => { h.view.exportingMarkdown = true; },
    revision: h => { h.view.revisionDraft = 'Synthetic proposal'; },
    hidden: h => { h.doc.visibilityState = 'hidden'; },
    inert: h => { h.host.inert = true; },
    invisible: h => { h.view.main.hidden = true; },
    visibilityHidden: h => { h.host.style.visibility = 'hidden'; },
    visibilityCollapse: h => { h.root.getComputedStyle = node => node === h.host ? { visibility: 'collapse' } : node.style; },
    ariaHidden: h => { h.host.setAttribute('aria-hidden', 'true'); },
    closedDetails: h => { const details = h.doc.createElement('details'); h.host.remove(); details.append(h.host); h.doc.body.append(details); reuse(h).getClientRects = () => [{}]; }
};
for (const [name, block] of Object.entries(blockers)) test(`${name} refuses even a retained enabled detail action without touching state`, async () => {
    const h = await mount(), c = h.controller; await seed(h); const button = reuse(h); block(h);
    const drafts = [...c.drafts], pending = c.pendingCommand, inspection = c.pendingInspection, selected = c.selected, before = quietSnapshot(h);
    button.disabled = false; button.dispatch('click');
    assert.deepEqual([...c.drafts], drafts); assert.equal(c.selected, selected); assert.equal(c.pendingCommand, pending); assert.equal(c.pendingInspection, inspection);
    assertQuiet(h, before); c.dispose();
});

test('refresh invalidates old action immediately; failed reads cannot be cleared into a usable stale source', async () => {
    const h = await mount(), c = h.controller, source = await seed(h), old = reuse(h), gate = deferred();
    const read = h.h.store.read.bind(h.h.store); h.h.store.read = () => gate.promise;
    const refreshing = c.refresh(); assert.equal(old.disabled, true); old.disabled = false; old.dispatch('click'); assert.equal(c.drafts.size, 0);
    gate.resolve(await read()); await refreshing; old.disabled = false; old.dispatch('click'); assert.equal(c.drafts.size, 0);
    h.h.store.read = async () => { throw Core.fault('READ'); }; await c.refresh(); c.select(source.id);
    assert.equal(c.error, null); assert.equal(reuse(h).disabled, true); reuse(h).disabled = false; reuse(h).dispatch('click'); assert.equal(c.drafts.size, 0);
    h.h.store.read = read; await c.refresh(); activate(h); assert.equal(c.selected, 'new'); c.dispose();
});

test('A to B to A, rerender and replaced state cannot reuse a detached or stale record action', async () => {
    const h = await mount(), c = h.controller, source = await seed(h), other = await add(c, 'Other', 'Other'); c.select(source.id);
    let button = reuse(h); c.select(other.id); c.select(source.id); button.dispatch('click'); assert.equal(c.drafts.size, 0);
    button = reuse(h); h.view.render(); button.dispatch('click'); assert.equal(c.drafts.size, 0);
    button = reuse(h); c.state = clone(c.state); button.dispatch('click'); assert.equal(c.drafts.size, 0);
    h.view.render(); activate(h); assert.equal(c.draft().input.body, source.body); c.dispose();
});

for (const lifecycle of ['persisted pagehide', 'pagehide', 'detach', 'destroy']) test(`${lifecycle} prevents old detail action and focus`, async () => {
    const h = await mount(), c = h.controller; await seed(h); const button = reuse(h); button.focus();
    if (lifecycle === 'persisted pagehide') { h.events.get('pagehide')({ persisted: true }); h.events.get('pageshow')({ persisted: true }); }
    else if (lifecycle === 'pagehide') h.events.get('pagehide')({ persisted: false });
    else if (lifecycle === 'detach') h.host.remove();
    else h.view.destroy();
    const before = quietSnapshot(h); h.doc.body.focus(); button.disabled = false; button.dispatch('click');
    assert.equal(c.drafts.size, 0); assert.equal(h.doc.activeElement, h.doc.body); assertQuiet(h, before); c.dispose();
});

test('archived, loading and metadata-editor views have no reuse action', async () => {
    const h = await mount(), c = h.controller; assert.equal(reuse(h), undefined); const source = await seed(h);
    c.edit(); assert.equal(reuse(h), undefined); c.discard(); await c.action('remove'); await settle(c);
    assert.equal(c.record().id, source.id); assert.equal(reuse(h), undefined); c.dispose();
});

test('native Enter/Space default activation stays available; repeated and IME key events are prevented', async () => {
    const h = await mount(), c = h.controller, source = await seed(h);
    for (const key of ['Enter', ' ']) {
        const button = reuse(h); button.focus();
        for (const fields of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) assert.equal(button.dispatch('keydown', { key, ...fields }).prevented, true);
        button.dispatch('compositionstart'); assert.equal(button.dispatch('keydown', { key }).prevented, true); button.dispatch('click'); assert.equal(c.drafts.size, 0);
        button.dispatch('compositionend'); assert.equal(button.dispatch('keydown', { key }).prevented, false);
        for (const fields of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) button.dispatch('click', fields);
        assert.equal(c.drafts.size, 0); button.dispatch('click'); assert.equal(c.selected, 'new'); c.discard(); c.select(source.id);
    }
    c.dispose();
});

test('synchronous newer search focus or selection during render is never stolen', async () => {
    for (const change of ['search', 'selection', 'hidden', 'destroy']) {
        const h = await mount(), c = h.controller, source = await seed(h), render = h.view.render.bind(h.view); let changed = false;
        h.view.render = () => {
            render(); if (changed || c.selected !== 'new') return; changed = true;
            if (change === 'search') h.view.search.focus();
            if (change === 'selection') c.select(source.id);
            if (change === 'hidden') h.doc.visibilityState = 'hidden';
            if (change === 'destroy') h.view.destroy();
        };
        activate(h); assert.equal(c.drafts.has('new'), true);
        assert.equal(h.doc.activeElement, change === 'search' ? h.view.search : h.doc.body); c.dispose();
    }
});

test('source changes after creation do not overwrite or fence the independent draft save', async () => {
    const h = await mount(), c = h.controller, source = await seed(h); activate(h); const draft = c.draft(), input = clone(draft.input);
    await h.h.store.mutate(h.h.store.request('edit', { id: source.id, version: source.version, title: 'Later title' })); await c.refresh();
    let latest = c.record(source.id); await h.h.store.mutate(h.h.store.request('remove', { id: latest.id, version: latest.version })); await c.refresh();
    latest = c.record(source.id); assert.equal(c.draft(), draft); assert.deepEqual(draft.input, input); assert.equal(draft.conflict, false);
    h.view.confirm = async () => true; await h.view.save(); await settle(c);
    assert.notEqual(c.record().id, source.id); assert.equal(c.record().title, source.title); assert.deepEqual(c.record(source.id), latest); c.dispose();
});

for (const outcome of ['capacity', 'uncertain']) test(`${outcome} on explicit Save preserves draft and existing operation safeguards`, async () => {
    const h = await mount(), c = h.controller, source = await seed(h); activate(h); const draft = c.draft(), input = clone(draft.input), writes = h.h.writes;
    h.view.confirm = async () => true;
    if (outcome === 'capacity') h.h.store.mutate = async () => { throw Core.fault('CAPACITY'); };
    else h.h.failOnce();
    await h.view.save(); await settle(c); assert.equal(c.draft(), draft); assert.deepEqual(draft.input, input); assert.deepEqual(c.record(source.id), source); assert.equal(leaveGuard(h), true);
    if (outcome === 'capacity') { assert.equal(c.error.code, 'CAPACITY'); assert.equal(c.pendingCommand, null); assert.equal(h.h.writes, writes); }
    else {
        const pending = c.pendingCommand; assert.ok(pending); assert.equal(pending.command.kind, 'add'); assert.equal(h.view.editor.save.disabled, true);
        await h.view.save(); assert.equal(c.pendingCommand, pending); assert.equal(h.h.writes, writes + 1);
        assert.equal(await c.retry(), true); await settle(c); assert.equal(c.state.records.length, 2); assert.equal(c.record().history.length, 1); assert.equal(h.h.writes, writes + 1);
        assert.deepEqual(c.record(source.id), source);
    }
    c.dispose();
});
