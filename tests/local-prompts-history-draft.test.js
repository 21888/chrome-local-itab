const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-prompts-store.js');
const { setup, add, tick, settle } = require('./helpers/prompts-harness.js');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');
const exactBody = '原文 🧪 {{topic}}\r\n  {{topic}}\n末行\r';
const source = (record, version = record.history[0]) => ({ promptId: record.id, recordVersion: record.version, versionId: version.id, body: version.body });
async function versions(c) {
    await add(c, 'Old title', exactBody);
    c.edit(); c.update('body', 'Preview {{topic}}'); await c.save(); await tick();
    c.edit(); c.update('body', 'Current {{topic}}'); c.update('title', 'Saved current title'); c.update('category', 'Current category'); c.update('tool', 'Current tool'); c.update('favorite', true); await c.save(); await tick();
    await c.store.mutate(c.store.request('edit', { id: c.record().id, version: c.record().version, tags: ['comma,inside', '中文，标签', 'plain'] })); await tick();
    return c.record();
}
async function mount(language = 'en') {
    const h = setup(), doc = createDocument({ blurUnavailableFocus: true }); doc.documentElement.lang = language === 'zh_CN' ? 'zh-CN' : 'en';
    const host = doc.createElement('div'); doc.body.append(host);
    const events = new Map(), messages = JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${language}/messages.json`, 'utf8'));
    const root = { document: doc, navigator: { clipboard: { writeText: async () => {} } }, LocalItabPrompts: Core, addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name), location: { assign() {} } };
    const context = vm.createContext({ window: root, Intl, Date, Object, Array, Boolean, String, Promise });
    vm.runInContext(fs.readFileSync(`${__dirname}/../shared/dialog-focus.js`, 'utf8'), context);
    vm.runInContext(fs.readFileSync(`${__dirname}/../shared/local-prompts-view.js`, 'utf8'), context);
    const view = new root.LocalItabPromptsView.View({ host, controller: h.controller, confirm: async () => false, translate: (key, fallback) => messages[`prompts${key}`]?.message || fallback });
    view.attachDepartureGuard(); view.render(); await h.controller.start(); await settle(h.controller);
    return { h, doc, host, view, events, c: h.controller };
}
const text = element => [element.textContent || '', ...element.children.map(text)].join(' ');
const historyButton = view => view.main.querySelector('[data-prompt-focus="history-new-draft"]');
const continueButton = view => view.main.querySelector('[data-prompt-focus="history-continue-draft"]');
const choose = (view, version) => view.main.querySelectorAll('.prompt-history-list button').find(button => button.dataset.versionId === version.id).dispatch('click');

test('history draft copies selected exact body and current metadata in memory, preserving all sessions and other drafts', async () => {
    const h = setup(), c = h.controller; await c.start();
    const other = await add(c, 'Other', 'Other body'); c.edit(); c.update('body', 'Other unsaved body'); const otherDraft = c.draft();
    const record = await versions(c); c.useVersion(record.history[1].id); c.setVariable('topic', 'PREVIEW VALUE'); c.setLiteral(true);
    const session = c.session(), sessions = JSON.stringify([...c.sessions]), active = JSON.stringify([...c.activeSessions]), saved = JSON.stringify(h.raw), writes = h.writes;
    let reads = 0; const read = h.backend.read; h.backend.read = () => { reads++; return read(); };
    assert.equal(c.createFromHistory(source(record)), true);
    const draft = c.draft(); assert.equal(c.selected, 'new'); assert.equal(draft.id, undefined); assert.equal(draft.version, undefined);
    assert.equal(draft.input.body, exactBody); for (const field of ['title', 'category', 'tool', 'favorite']) assert.equal(draft.input[field], record[field]);
    assert.deepEqual(draft.originalTags, record.tags); assert.notEqual(draft.originalTags, record.tags);
    assert.equal(draft.baseline.body, ''); assert.equal(draft.baseline.title, ''); assert.equal(c.dirty(), true); assert.equal(c.hasUncommittedWork(), true);
    assert.equal(c.drafts.get(other.id), otherDraft); assert.equal(JSON.stringify([...c.sessions]), sessions); assert.equal(JSON.stringify([...c.activeSessions]), active);
    assert.equal(JSON.stringify(h.raw), saved); assert.equal(h.writes, writes); assert.equal(reads, 0);
    assert.equal(c.startDraftPreview(), true); const revision = draft.revision; draft.input.body = 'Edited'; assert.equal(draft.revision > revision, true); assert.equal(c.draftPreview, null);
    c.select(record.id); assert.equal(c.session(), session); assert.equal(session.values.topic, 'PREVIEW VALUE'); c.dispose();
});

test('history draft is a separate ordinary add with one version and exact comma-bearing tags', async () => {
    const h = setup(), c = h.controller; await c.start(); const record = await versions(c), before = JSON.stringify(record);
    assert.equal(c.createFromHistory(source(record)), true); assert.equal(await c.save(), true); await tick();
    const saved = c.record(); assert.notEqual(saved.id, record.id); assert.notEqual(saved.currentVersionId, record.history[0].id);
    assert.equal(saved.body, exactBody); assert.equal(saved.history.length, 1); assert.equal(saved.history[0].body, exactBody);
    assert.deepEqual(saved.tags, record.tags); assert.equal(saved.promptRef, undefined); assert.equal(JSON.stringify(h.raw.records.find(row => row.id === record.id)), before); c.dispose();
});

for (const mode of ['archived', 'missing', 'version', 'history ID', 'body', 'selected', 'editor', 'busy', 'pending', 'reading', 'unreadable', 'read error', 'disposed']) test(`history draft rejects ${mode} source without touching drafts or preview`, async () => {
    const h = setup(), c = h.controller; await c.start(); const record = await versions(c), review = source(record);
    c.useVersion(record.history[1].id); c.setVariable('topic', 'retained');
    if (mode === 'archived') c.record().deletedAt = '2026-10-17T00:00:00.000Z';
    if (mode === 'missing') c.state.records = [];
    if (mode === 'version') c.record().version = 'replacement_version';
    if (mode === 'history ID') c.record().history[0].id = 'replacement_history';
    if (mode === 'body') c.record().history[0].body = 'replaced same ID';
    if (mode === 'selected') c.selected = null;
    if (mode === 'editor') { c.edit(); c.update('body', 'unsaved source editor'); }
    if (mode === 'busy') c.busy = true;
    if (mode === 'pending') c.pendingCommand = { action: 'save' };
    if (mode === 'reading') c.pendingReadGeneration = 99;
    if (mode === 'unreadable') c.linkedPromptUnavailable = true;
    if (mode === 'read error') c.error = { code: 'READ', scope: 'read' };
    if (mode === 'disposed') c.dispose();
    const drafts = JSON.stringify([...c.drafts]), sessions = JSON.stringify([...c.sessions]), active = JSON.stringify([...c.activeSessions]), writes = h.writes;
    assert.equal(c.createFromHistory(review), false); assert.equal(JSON.stringify([...c.drafts]), drafts); assert.equal(JSON.stringify([...c.sessions]), sessions); assert.equal(JSON.stringify([...c.activeSessions]), active); assert.equal(h.writes, writes); c.dispose();
});

test('history draft validates its explicit source tuple and protects the single existing new draft', async () => {
    const h = setup(), c = h.controller;
    assert.equal(c.createFromHistory(null), false); await c.start(); const record = await versions(c), review = source(record);
    for (const input of [null, {}, { ...review, promptId: 'wrong' }, { ...review, recordVersion: 'wrong' }, { ...review, versionId: record.history[1].id }, { ...review, body: 'wrong' }]) assert.equal(c.createFromHistory(input), false);
    c.create(); const empty = c.draft(); c.select(record.id); assert.equal(c.createFromHistory(review), true); assert.notEqual(c.draft(), empty);
    const draft = c.draft(), data = JSON.stringify(draft); c.select(record.id);
    assert.equal(c.createFromHistory({ ...review, versionId: record.history[1].id, body: record.history[1].body }), false);
    assert.equal(c.drafts.get('new'), draft); assert.equal(JSON.stringify(draft), data); c.create(); assert.equal(c.draft(), draft); c.dispose();
});

for (const change of ['remove', 'replace']) test(`independent history snapshot saves after source ${change}`, async () => {
    const h = setup(), c = h.controller; await c.start(); const record = await versions(c); assert.equal(c.createFromHistory(source(record)), true);
    if (change === 'remove') await h.store.mutate(h.store.request('remove', { id: record.id, version: record.version }));
    else await h.store.mutate(h.store.request('edit', { id: record.id, version: record.version, body: 'Source now changed', title: 'New source title' }));
    await tick(); assert.equal(c.draft().conflict, false); assert.equal(await c.save(), true); await tick();
    assert.equal(c.record().body, exactBody); assert.equal(c.record().title, record.title); assert.equal(c.record().history.length, 1); c.dispose();
});

test('history draft capacity failure preserves the draft and ordinary uncertain save retries one immutable add', async () => {
    const h = setup(), c = h.controller; await c.start(); const record = await versions(c); c.createFromHistory(source(record));
    const full = h.raw;
    for (let n = 1; n < Core.LIMITS.records; n++) { const id = `capacity_record_${n}`, version = `capacity_version_${n}`; full.records.push({ ...record, id, version, currentVersionId: version, history: [{ ...record.history[0], id: version, body: record.body }] }); }
    full.revision++; await h.backend.write(Core.validate(full)); await tick();
    const draft = c.draft(), before = JSON.stringify(draft), writes = h.writes; assert.equal(await c.save(), false); await tick();
    assert.equal(c.error.code, 'CAPACITY'); assert.equal(c.pendingCommand, null); assert.equal(JSON.stringify(draft), before); assert.equal(h.writes, writes);
    const reduced = h.raw; reduced.records = [reduced.records[0]]; reduced.revision++; await h.backend.write(Core.validate(reduced)); await tick();
    h.failOnce(); const saving = c.save(); assert.equal(await c.save(), false); assert.equal(await saving, false); await tick();
    const operation = c.pendingCommand; assert.equal(operation.command.kind, 'add'); c.update('body', 'blocked'); assert.equal(c.draft(), draft); assert.equal(draft.input.body, exactBody);
    assert.equal(await c.retry(), true); await tick(); assert.equal(c.pendingCommand, null); assert.equal(h.raw.records.length, 2); assert.equal(c.record().id, operation.command.operationId); assert.equal(c.record().history.length, 1); c.dispose();
});

for (const language of ['en', 'zh_CN']) test(`${language}: selected v1 creates titled draft while preview v2 and current v3 stay independent; Ctrl+S saves`, async () => {
    const { h, doc, view, c, events } = await mount(language), record = await versions(c);
    c.useVersion(record.history[1].id); c.setVariable('topic', 'TEMPORARY'); const session = c.session();
    choose(view, record.history[0]); assert.equal(c.session(), session); assert.equal(c.session().body, record.history[1].body);
    view.main.querySelector('[data-prompt-focus="compare-open"]').dispatch('click'); assert.equal(c.session(), session);
    const button = historyButton(view); assert.ok(button); assert.equal(button.type, 'button'); assert.equal(button.disabled, false);
    assert.equal(button.textContent, language === 'en' ? 'New draft from this body version' : '从此正文版本新建草稿');
    const help = doc.getElementById(button.getAttribute('aria-describedby')); assert.ok(help); assert.match(help.textContent, language === 'en' ? /currently saved prompt/ : /当前已保存提示词/);
    const writes = h.writes; button.dispatch('click'); assert.equal(h.writes, writes); assert.equal(c.draft().input.body, exactBody); assert.equal(c.draft().input.title, record.title); assert.equal(doc.activeElement.dataset.promptFocus, 'title'); assert.equal(view.editorElements.saveCopy, null);
    const leaving = { preventDefault() { this.prevented = true; } }; events.get('beforeunload')(leaving); assert.equal(leaving.prevented, true);
    const body = view.main.querySelector('[data-prompt-focus="body"]'); body.dispatch('keydown', { key: 's', ctrlKey: true }); await settle(c); assert.equal(c.record().body, exactBody); assert.equal(c.record().history.length, 1);
    c.select(record.id); assert.equal(c.session(), session); assert.equal(session.values.topic, 'TEMPORARY'); c.dispose();
});

for (const language of ['en', 'zh_CN']) test(`${language}: existing new draft is visibly protected and continued without changing source session`, async () => {
    const { h, doc, view, c } = await mount(language), record = await versions(c);
    c.create(); c.update('title', 'Existing new draft'); c.update('body', 'Keep {{value}}'); const draft = c.draft(); c.select(record.id); c.useVersion(record.history[1].id); c.setVariable('topic', 'Keep preview');
    const session = c.session(), sessions = JSON.stringify([...c.sessions]), writes = h.writes; choose(view, record.history[0]);
    const button = historyButton(view), resume = continueButton(view); assert.equal(button.disabled, true); assert.ok(resume); assert.equal(resume.textContent, language === 'en' ? 'Continue existing draft' : '继续已有草稿');
    button.dispatch('click'); assert.equal(c.selected, record.id); assert.equal(c.drafts.get('new'), draft);
    resume.dispatch('click'); assert.equal(c.draft(), draft); assert.equal(doc.activeElement.dataset.promptFocus, 'title'); assert.equal(JSON.stringify([...c.sessions]), sessions); assert.equal(h.writes, writes);
    c.select(record.id); assert.equal(c.session(), session); c.dispose();
});

test('history actions become disabled during read and reject previously captured controls', async () => {
    const { h, view, c } = await mount(), record = await versions(c); choose(view, record.history[0]);
    const button = historyButton(view), wait = deferred(), read = h.backend.read; h.backend.read = () => wait.promise;
    const refresh = c.refresh(); assert.equal(button.disabled, true); button.dispatch('click'); assert.equal(c.drafts.has('new'), false);
    wait.resolve(h.raw); await refresh; h.backend.read = read; assert.equal(historyButton(view).disabled, false);
    assert.equal(button.isConnected, false); button.dispatch('click'); assert.equal(c.drafts.has('new'), false);
    c.dispose();
});

for (const mode of ['busy', 'pending', 'read error', 'archived', 'missing', 'version', 'exact body', 'navigation', 'rerender', 'disposed']) test(`old history controls reject ${mode} at activation`, async () => {
    const { view, c } = await mount(), record = await versions(c); choose(view, record.history[0]); const button = historyButton(view);
    if (mode === 'busy') c.busy = true;
    if (mode === 'pending') c.pendingCommand = {};
    if (mode === 'read error') c.error = { code: 'READ', scope: 'read' };
    if (mode === 'archived') c.record().deletedAt = '2026-10-17T00:00:00.000Z';
    if (mode === 'missing') c.state.records = [];
    if (mode === 'version') c.record().version = 'changed_version';
    if (mode === 'exact body') c.record().history[0].body = 'changed same history ID';
    if (mode === 'navigation') { c.select(null); c.select(record.id); }
    if (mode === 'rerender') view.render();
    if (mode === 'disposed') c.dispose();
    button.dispatch('click'); assert.equal(c.drafts.has('new'), false); c.dispose();
});

test('retired continue control cannot navigate back or overwrite an existing new draft', async () => {
    const { view, c } = await mount(), record = await versions(c); c.create(); c.update('body', 'existing'); const draft = c.draft(); c.select(record.id);
    const button = continueButton(view); assert.ok(button); c.select(null); button.dispatch('click'); assert.equal(c.selected, null); assert.equal(c.drafts.get('new'), draft); c.dispose();
});

test('reattached old history panel and rows cannot change the current selected body or create a draft', async () => {
    const { view, c } = await mount(), record = await versions(c);
    choose(view, record.history[0]); const oldPanel = view.main.querySelector('.prompt-history'), oldButton = historyButton(view), oldRows = oldPanel.querySelectorAll('.prompt-history-list button');
    c.select(null); c.select(record.id); choose(view, record.history[1]); const currentButton = historyButton(view), historyId = view.historyId;
    view.main.append(oldPanel); assert.equal(oldPanel.isConnected, true);
    oldRows[0].dispatch('click'); assert.equal(view.historyId, historyId); oldButton.dispatch('click'); assert.equal(c.drafts.has('new'), false);
    currentButton.dispatch('click'); assert.equal(c.draft().input.body, record.history[1].body); c.dispose();
});

test('a mismatched global history selection cannot substitute a different body into the draft', async () => {
    const { view, c } = await mount(), record = await versions(c); choose(view, record.history[0]);
    const button = historyButton(view); view.historyId = record.history[1].id; button.dispatch('click'); assert.equal(c.drafts.has('new'), false); c.dispose();
});

test('history draft required-field failures and explicit discard retain original saved content', async () => {
    const { h, view, c } = await mount(), record = await versions(c); c.createFromHistory(source(record));
    const saved = JSON.stringify(h.raw), writes = h.writes;
    c.update('title', ''); assert.equal(view.editorElements.save.disabled, true); assert.equal(await c.save(), false); await tick(); assert.equal(c.pendingCommand, null);
    c.update('title', 'New title'); c.update('body', ''); assert.equal(view.editorElements.save.disabled, true); assert.equal(await c.save(), false); await tick();
    assert.equal(c.draft().input.title, 'New title'); assert.equal(JSON.stringify(h.raw), saved); assert.equal(h.writes, writes);
    await view.discardDraft(); assert.ok(c.draft()); view.confirm = async () => true; await view.discardDraft(); assert.equal(c.drafts.has('new'), false); assert.equal(JSON.stringify(h.raw), saved); c.dispose();
});

test('metadata is copied from the loaded current record, never from a detached reviewed record object', async () => {
    const h = setup(), c = h.controller; await c.start(); const reviewed = await versions(c), review = source(reviewed);
    const next = h.raw; next.revision++; next.records[0].title = 'Current loaded title'; next.records[0].tags = ['loaded,tag']; c.accept(Core.validate(next));
    assert.equal(c.createFromHistory(review), true); assert.equal(c.draft().input.title, 'Current loaded title'); assert.deepEqual(c.draft().originalTags, ['loaded,tag']); assert.equal(c.draft().input.body, exactBody); c.dispose();
});

for (const existing of [false, true]) test(`persisted pagehide keeps the current history panel usable for ${existing ? 'continuing' : 'creating'} a draft`, async () => {
    const { view, c, events } = await mount(), record = await versions(c);
    if (existing) { c.create(); c.update('body', 'Existing independent draft'); c.select(record.id); }
    const draft = c.drafts.get('new'), panel = view.main.querySelector('.prompt-history');
    events.get('pagehide')({ persisted: true }); assert.equal(view.destroyed, undefined);
    choose(view, record.history[1]); assert.equal(view.historyId, record.history[1].id);
    choose(view, record.history[0]); assert.equal(view.historyId, record.history[0].id); assert.equal(view.main.querySelector('.prompt-history'), panel);
    (existing ? continueButton(view) : historyButton(view)).dispatch('click');
    assert.equal(c.selected, 'new'); if (existing) assert.equal(c.draft(), draft); else assert.equal(c.draft().input.body, exactBody); c.dispose();
});
