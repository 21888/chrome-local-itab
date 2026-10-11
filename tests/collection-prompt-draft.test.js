const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Route = require('../shared/collection-prompt-draft.js');
const Prompts = require('../shared/local-prompts-store.js');
const Core = require('../shared/local-ai-collections-store.js');
const { Controller } = require('../shared/local-ai-collections-controller.js');
const prompts = require('./helpers/prompts-harness.js');
const collections = require('./helpers/collections-harness.js');
const { createDocument } = require('./helpers/task-dom-model.js');
const clone = value => structuredClone(value);
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { resolve, promise }; };
const text = node => [node.textContent || '', ...node.children.map(text)].join(' ');
async function fixture() {
    const p = prompts.setup(); await p.controller.start(); const record = await prompts.add(p.controller, 'Synthetic prompt', 'Original {{topic}}');
    const h = collections.setup(); h.backend.readPromptState = async () => p.raw;
    const c = new Controller({ store: h.store, promptStore: { read: () => p.store.read(), subscribe: fn => p.store.subscribe(fn) } });
    const request = { promptId: record.id, bodyVersionId: record.currentVersionId };
    const page = new Route.Handoff({ controller: c, request }); await c.start();
    return { p, h, c, record, request, page, dispose() { p.controller.dispose(); c.dispose(); } };
}
test('route accepts only one exact valid ID pair and refuses every conflicting destination', () => {
    const pair = '?promptId=prompt_01&bodyVersionId=version_01';
    assert.deepEqual(Route.target(pair), { promptId: 'prompt_01', bodyVersionId: 'version_01' });
    assert.equal(Route.href('prompt_01', 'version_01'), 'collections.html' + pair);
    for (const bad of ['?promptId=prompt_01', '?bodyVersionId=version_01', '?promptId=&bodyVersionId=version_01', '?promptId=%20prompt_01&bodyVersionId=version_01', '?promptId=%00prompt_01&bodyVersionId=version_01', '?promptId=short&bodyVersionId=version_01', pair + '&promptId=prompt_01', pair + '&bodyVersionId=version_02', pair + '&record=result_01', pair + '&record=', pair + '&capture=' + 'a'.repeat(32), pair + '&captureError=expired', pair + '&unknown=1', '?record=result_01&capture=' + 'a'.repeat(32), '?captureError=expired&capture=' + 'a'.repeat(32), '?record=result_01&captureError=expired', '?record=result_01&record=result_01', '?captureError=expired&captureError=invalid']) assert.deepEqual(Route.target(bad), { error: 'invalid' }, bad);
    assert.equal(Route.target('?record=result_01'), null); assert.equal(Route.href('bad/id', 'version_01'), null);
});
test('exact handoff creates blank unsaved dirty draft with visible exact version review; Save alone writes', async () => {
    const f = await fixture(), { c, h } = f; assert.equal(await f.page.run(), true);
    assert.equal(c.draft().input.title, ''); assert.equal(c.draft().input.body, ''); assert.equal(c.draft().input.promptId, f.record.id); assert.equal(c.draft().input.bodyVersionId, f.record.currentVersionId); assert.equal(c.dirty(), true); assert.equal(c.hasUncommittedWork(), true); assert.equal(h.writes, 0);
    const doc = createDocument(), host = doc.createElement('div'); doc.body.append(host);
    const root = { LocalItabAICollections: Core, document: doc, addEventListener() {}, navigator: { clipboard: { readText() { throw Error('clipboard forbidden'); }, writeText() { throw Error('clipboard forbidden'); } } } };
    vm.runInNewContext(fs.readFileSync('shared/local-ai-collections-view.js', 'utf8'), { window: root });
    const view = new root.LocalItabCollectionsView.View({ host, controller: c }); view.render();
    assert.match(text(host), /new draft is unsaved/); assert.match(text(host), /Original \{\{topic\}\}/); assert.match(text(host), new RegExp(f.record.currentVersionId));
    c.update('title', 'Synthetic result'); c.update('body', 'Synthetic answer'); assert.equal(await c.save(), true); assert.equal(h.writes, 1); assert.deepEqual(c.record().promptRef, f.request); f.dispose();
});
test('missing, archived, recovery-only and unavailable versions never choose another target', async () => {
    for (const mode of ['missing', 'archived', 'recovery', 'version', 'read']) {
        const f = await fixture(), state = clone(f.p.raw);
        if (mode === 'missing') state.records = [];
        if (mode === 'archived') state.records[0].deletedAt = state.records[0].updatedAt;
        if (mode === 'recovery') { state.recovery = [{ id: 'recovery_01', createdAt: state.records[0].updatedAt, content: { records: clone(state.records) } }]; state.records = []; }
        if (mode === 'version') f.page.request.bodyVersionId = 'missing_version';
        f.c.promptStore.read = async () => { if (mode === 'read') throw Error('PRIVATE'); return state; };
        assert.equal(await f.page.run(), false, mode); assert.equal(f.c.selected, ''); assert.equal(f.c.drafts.size, 0); assert.equal(f.h.writes, 0); f.dispose();
    }
});
test('late handoffs protect pristine drafts, navigation, create/discard, filters, reviews and disposed pages', async () => {
    for (const change of [c => c.create(), c => c.select('newer_id'), c => { c.create(); c.discard(); }, c => c.filter({ query: 'new' }), c => { c.busy = true; }, c => { c.pendingCommand = {}; }, c => c.dispose()]) {
        const f = await fixture(), wait = deferred(); f.c.promptStore.read = () => wait.promise;
        const pending = f.page.run(); change(f.c); const before = clone([...f.c.drafts]); wait.resolve(f.p.raw);
        assert.equal(await pending, false); assert.deepEqual([...f.c.drafts], before); assert.equal(f.h.writes, 0); f.dispose();
    }
    const f = await fixture(); f.page.blocked = () => true; assert.equal(await f.page.run(), false); assert.equal(f.c.drafts.size, 0); f.dispose();
});
test('superseded prompt reads and collection read errors fail closed', async () => {
    const f = await fixture(), wait = deferred(); f.c.promptStore.read = () => wait.promise; const pending = f.page.run();
    f.c.promptStore.read = async () => f.p.raw; await f.c.refreshPrompts(); wait.resolve(f.p.raw); assert.equal(await pending, false); assert.equal(f.c.drafts.size, 0); f.dispose();
    const other = await fixture(); other.c.error = { code: 'READ', scope: 'read' }; assert.equal(await other.page.run(), false); other.dispose();
});
test('Save revalidates active exact version inside mutation lock; missing backend and malformed reads fail closed', async () => {
    for (const mode of ['archive', 'missing', 'read', 'malformed', 'backend']) {
        const f = await fixture(); await f.page.run(); f.c.update('title', 'Result'); f.c.update('body', 'Answer');
        const oldLock = f.h.backend.lock;
        f.h.backend.lock = action => oldLock(async () => {
            const state = clone(f.p.raw);
            if (mode === 'archive') state.records[0].deletedAt = state.records[0].updatedAt;
            if (mode === 'missing') state.records = [];
            f.h.backend.readPromptState = async () => { if (mode === 'read') throw Error('private read error'); return mode === 'malformed' ? {} : state; };
            if (mode === 'backend') delete f.h.backend.readPromptState;
            return action();
        });
        assert.equal(await f.c.save(), false, mode); assert.equal(f.h.writes, 0); assert.equal(f.c.draft().input.body, 'Answer'); f.dispose();
    }
});
test('confirmed receipt retry survives later archive; uncertain pre-write read retries retain guard', async () => {
    const f = await fixture(); await f.page.run(); f.c.update('title', 'Result'); f.c.update('body', 'Answer'); f.h.failOnce();
    assert.equal(await f.c.save(), false); assert.equal(f.h.writes, 1); const id = f.c.pendingCommand.command.operationId;
    f.h.backend.readPromptState = async () => { throw Error('later archive/read'); };
    assert.equal(await f.c.retry(), true); assert.equal(f.c.record().id, id); assert.equal(f.h.writes, 1); f.dispose();
    const g = await fixture(); await g.page.run(); g.c.update('title', 'Result'); g.c.update('body', 'Answer');
    g.h.backend.readPromptState = async () => { throw Error('read'); }; assert.equal(await g.c.save(), false); assert.ok(g.c.pendingCommand.validatePrompt);
    const state = clone(g.p.raw); state.records = []; g.h.backend.readPromptState = async () => state;
    assert.equal(await g.c.retry(), false); assert.equal(g.h.writes, 0); g.dispose();
});
test('bootstrap routes conflicts before both record navigation and capture; package includes helper and no permission expansion', () => {
    const source = fs.readFileSync('collections.js', 'utf8');
    assert.match(source, /if \(!resultRequest\) root.LocalItabAISearch.prepareTarget/); assert.match(source, /capture = resultRequest \? null/);
    assert.match(fs.readFileSync('tools/package_extension.py', 'utf8'), /"shared\/collection-prompt-draft.js"/);
    assert.deepEqual(JSON.parse(fs.readFileSync('manifest.json')).permissions, ['storage', 'unlimitedStorage', 'identity', 'contextMenus']);
    assert.doesNotMatch(fs.readFileSync('shared/collection-prompt-draft.js', 'utf8'), /clipboard|fetch\(|sendMessage|storage/);
});
test('workspace fenced guard reads raw prompt snapshot without recursive lock; queued archive wins and restore marker blocks save', async () => {
    const Workspaces = require('../shared/workspaces.js');
    const raw = {}, queues = new Map(), held = new Set(), events = [];
    const locks = { request(name, options, action) {
        const prior = queues.get(name) || Promise.resolve();
        const run = prior.then(async () => { assert.equal(held.has(name), false); held.add(name); events.push(name); try { return await action(); } finally { held.delete(name); } });
        queues.set(name, run.catch(() => {})); return run;
    } };
    const chrome = { storage: { local: { async get(keys) { return Object.fromEntries(keys.filter(key => raw[key] !== undefined).map(key => [key, clone(raw[key])])); }, async set(values) { Object.assign(raw, clone(values)); } }, onChanged: { addListener() {}, removeListener() {} } } };
    const manager = new Workspaces.Manager({ chrome, locks }); let sequence = 0;
    const options = { id: () => `fence_id_${++sequence}`, now: () => '2026-10-11T12:00:00.000Z' };
    const promptStore = new Prompts.Store(manager.createPromptBackend(Prompts), options);
    const collectionStore = new Core.Store(manager.createCollectionBackend(Core), options);
    const state = await promptStore.mutate(promptStore.request('add', { title: 'Synthetic', body: 'Synthetic body' })), record = state.records[0];
    const request = { promptId: record.id, bodyVersionId: record.currentVersionId };
    const c = new Controller({ store: collectionStore, promptStore }); const page = new Route.Handoff({ controller: c, request });
    await c.start(); assert.equal(await page.run(), true); c.update('title', 'Result'); c.update('body', 'Answer');
    const archive = promptStore.mutate(promptStore.request('remove', { id: record.id, version: record.version }));
    await archive; assert.equal(await c.save(), false); assert.equal(raw[Core.KEY], undefined);
    const archived = (await promptStore.read()).records[0]; await promptStore.mutate(promptStore.request('restore', { id: archived.id, version: archived.version }));
    raw[Workspaces.RESTORE_TRANSACTION_KEY] = { schemaVersion: 1, id: 'restore_marker', status: 'prepared' };
    assert.equal(await c.save(), false); assert.equal(raw[Core.KEY], undefined);
    delete raw[Workspaces.RESTORE_TRANSACTION_KEY];
    assert.equal(await c.save(), true); assert.deepEqual(c.record().promptRef, request);
    assert.ok(events.includes(Prompts.LOCK)); assert.ok(events.includes(Core.LOCK)); c.dispose();
});

test('constructing a handoff around an existing user draft cannot change selection or fields', async () => {
    const f = await fixture(); f.c.create(); f.c.update('body', 'existing unsaved text');
    const before = clone([...f.c.drafts]), selected = f.c.selected;
    const late = new Route.Handoff({ controller: f.c, request: f.request });
    assert.equal(f.c.selected, selected); assert.equal(await late.run(), false); assert.deepEqual([...f.c.drafts], before); assert.equal(f.h.writes, 0); f.dispose();
});
test('destination links retained old history version after a newer body is saved, without filling title or result', async () => {
    const f = await fixture();
    const record = f.p.controller.record();
    f.p.controller.edit(); f.p.controller.update('body', 'New current body'); assert.equal(await f.p.controller.save(), true);
    assert.notEqual(f.p.controller.record().currentVersionId, f.request.bodyVersionId);
    assert.equal(await f.page.run(), true); assert.equal(f.c.draft().input.bodyVersionId, f.request.bodyVersionId);
    assert.equal(f.c.promptResolution(f.request).version.body, record.body);
    assert.equal(f.c.draft().input.body, ''); assert.equal(f.c.draft().input.title, ''); assert.equal(f.h.writes, 0); f.dispose();
});
