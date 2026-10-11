const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-prompts-store.js');
const { Controller, SESSION_LIMIT, SESSION_VALUE_LIMIT } = require('../shared/local-prompts-controller.js');
const { setup, add, tick } = require('./helpers/prompts-harness.js');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');
const collections = require('./helpers/collections-harness.js');
const text = node => [node.textContent || '', ...node.children.map(text)].join(' ');
const button = (h, label) => h.view.main.querySelectorAll('button').find(node => node.textContent === label);
async function fixture() {
    const h = setup(), results = collections.setup();
    const c = new Controller({ store: h.store, collectionStore: results.store });
    const doc = createDocument({ blurUnavailableFocus: true }), host = doc.createElement('div'); doc.body.append(host);
    const copied = [], root = { document: doc, LocalItabPrompts: Core, LocalItabAISearch: require('../shared/local-ai-search.js'), LocalItabPromptDraft: require('../shared/collection-prompt-draft.js'), navigator: { clipboard: { writeText: async value => copied.push(value) } } };
    vm.runInNewContext(fs.readFileSync(`${__dirname}/../shared/local-prompts-view.js`, 'utf8'), { window: root, Intl, Date, Object, Array, Boolean, String, Promise });
    const view = new root.LocalItabPromptsView.View({ host, controller: c, confirm: async () => true }); view.render(); await c.start();
    const old = await add(c, 'Synthetic history', 'Old {{first}}');
    c.edit(); c.update('body', 'Current {{second}}'); await c.save(); await tick();
    return { h, c, doc, host, view, copied, results, old, current: c.record(), oldVersion: old.currentVersionId };
}
test('history row selection is read-only; explicit Use and Return retain exact per-version input and literal mode', async () => {
    const h = await fixture(), { c } = h; c.setVariable('second', 'current input');
    const before = JSON.stringify(h.h.raw), writes = h.h.writes;
    h.view.main.querySelector('.prompt-history-list').children[0].dispatch('click');
    assert.equal(c.preview().text, 'Current current input');
    button(h, 'Use this version').dispatch('click'); assert.equal(c.session().versionId, h.oldVersion);
    assert.deepEqual(c.variables(), ['first']); assert.equal(c.session().values.second, undefined);
    c.setVariable('first', 'old input'); await h.view.copy(); assert.deepEqual(h.copied, ['Old old input']);
    c.setLiteral(true); button(h, 'Return to current version').dispatch('click');
    assert.equal(c.preview().text, 'Current current input'); assert.equal(c.session().literal, false);
    c.useVersion(h.oldVersion); assert.equal(c.session().literal, true); c.setLiteral(false); assert.equal(c.preview().text, 'Old old input');
    assert.equal(h.h.writes, writes); assert.equal(JSON.stringify(h.h.raw), before); assert.equal(c.drafts.size, 0); c.dispose();
});
test('empty variable values and literal bodies stay pinned through refresh and navigation', async () => {
    const h = await fixture(), { c } = h; c.useVersion(h.oldVersion); c.setVariable('first', '');
    const second = await add(c, 'Other', 'literal body'); c.select(h.old.id); assert.equal(c.preview().text, 'Old ');
    c.useVersion(h.current.currentVersionId); c.setLiteral(true); await c.refresh(); assert.equal(c.preview().text, 'Current {{second}}');
    c.select(second.id); assert.equal(c.preview().text, 'literal body'); c.select(h.old.id); assert.equal(c.session().literal, true); c.dispose();
});
test('explicit empty and literal historical bodies need no entered value to stay active', async () => {
    const h = await fixture(), { c } = h;
    c.onChange = () => {};
    // Empty-body historical fixtures exercise the session even if editor save requires content.
    for (const body of ['', 'literal\nbody']) {
        const record = c.record(); record.history[0].body = body;
        assert.equal(c.useVersion(h.oldVersion, body), true); assert.equal(c.preview().text, body);
        assert.equal(c.session().body, body); assert.equal(c.preview().complete, true);
        c.returnToCurrent(); assert.equal(c.session().body, 'Current {{second}}');
    }
    c.dispose();
});
test('Clear resets active and current values without resurrecting cached input; other versions survive', async () => {
    const h = await fixture(), { c } = h; c.setVariable('second', 'current'); c.useVersion(h.oldVersion); c.setVariable('first', 'old');
    c.edit(); c.update('body', 'Newest {{third}}'); await c.save(); await tick(); const newest = c.record().currentVersionId;
    c.returnToCurrent(); c.setVariable('third', 'newest'); c.useVersion(h.oldVersion); c.clearVariables();
    assert.equal(c.session().versionId, newest); assert.deepEqual(Object.keys(c.session().values), []);
    c.useVersion(h.oldVersion); assert.deepEqual(Object.keys(c.session().values), []);
    c.useVersion(h.current.currentVersionId); assert.equal(c.session().values.second, 'current'); c.dispose();
});
test('legacy entered old session remains after cross-tab body update and Clear adopts latest', async () => {
    const h = await fixture(), { c } = h; c.setVariable('second', 'keep');
    await h.h.store.mutate(h.h.store.request('edit', { id: c.record().id, version: c.record().version, body: 'Remote {{remote}}' })); await tick();
    assert.equal(c.preview().text, 'Current keep'); c.clearVariables(); assert.equal(c.session().body, 'Remote {{remote}}'); c.dispose();
});
test('missing or replaced immutable body remains visible but blocked until explicit recovery', async () => {
    for (const mode of ['missing', 'replaced', 'archived']) {
        const h = await fixture(), { c } = h; c.useVersion(h.oldVersion); c.setVariable('first', 'preserve');
        const state = JSON.parse(JSON.stringify(c.state)); state.revision++;
        if (mode === 'missing') state.records[0].history.shift();
        if (mode === 'replaced') state.records[0].history[0].body = 'Replacement {{other}}';
        if (mode === 'archived') state.records[0].deletedAt = state.records[0].updatedAt;
        c.accept(state); c.notify(); assert.equal(c.session().body, 'Old {{first}}'); assert.equal(c.preview().text, 'Old preserve');
        assert.equal(c.preview().complete, false); assert.equal(c.excerptContext('first'), null);
        assert.equal(c.setVariable('first', 'lost'), false); assert.equal(c.session().values.first, 'preserve');
        await h.view.copy(); assert.deepEqual(h.copied, []);
        if (mode !== 'archived') { assert.equal(c.returnToCurrent(), true); assert.equal(c.session().body, 'Current {{second}}'); }
        c.dispose();
    }
});
test('same-ID backup replacement cannot reuse old values for the replacement template', async () => {
    const h = await fixture(), { c } = h; c.setVariable('second', 'private input');
    const state = JSON.parse(JSON.stringify(c.state)); state.revision++;
    state.records[0].body = 'Replacement {{second}}'; state.records[0].history[1].body = state.records[0].body;
    c.accept(state); assert.equal(c.preview().complete, false); assert.equal(c.session().values.second, 'private input');
    assert.equal(c.returnToCurrent(), true); assert.equal(c.session().values.second, undefined); assert.equal(c.preview().text, 'Replacement {{second}}'); c.dispose();
});
test('in-flight read blocks switching/copy and chooser; late reads cannot overwrite disposed cache', async () => {
    const h = await fixture(), { c } = h; c.setVariable('second', 'keep'); const wait = deferred(), original = await h.h.store.read();
    c.store.read = () => wait.promise; const pending = c.refresh();
    assert.equal(c.useVersion(h.oldVersion), false); assert.equal(c.excerptContext('second'), null); await h.view.copy(); assert.deepEqual(h.copied, []);
    c.dispose(); wait.resolve(original); await pending; assert.equal(c.sessions.size, 0); assert.equal(c.activeSessions.size, 0); assert.equal(c.useVersion(h.oldVersion), false);
});
test('version switching invalidates reviewed excerpts and aligns linked results plus result-draft links', async () => {
    const h = await fixture(), { c } = h;
    for (const [version, title] of [[h.oldVersion, 'Old result'], [h.current.currentVersionId, 'Current result']]) await h.results.store.mutate(h.results.store.request('add', { title, body: 'Synthetic excerpt', promptRef: { promptId: h.old.id, bodyVersionId: version } }));
    await tick(); const context = c.excerptContext('second'), row = c.excerptRows(context)[0], review = c.reviewExcerpt(context, row);
    const staleLink = h.view.main.querySelector('.prompt-result-draft'); c.useVersion(h.oldVersion);
    assert.equal((await c.applyExcerpt(review)).code, 'STALE'); assert.equal(staleLink.dispatch('click').prevented, true);
    const linked = h.view.main.querySelector('.prompt-linked-results'); assert.match(text(linked), /Old result/); assert.doesNotMatch(text(linked), /Current result/);
    const link = linked.querySelector('.prompt-result-draft'); assert.match(link.href, new RegExp(h.oldVersion));
    const oldContext = c.excerptContext('first'), oldReview = c.reviewExcerpt(oldContext, c.excerptRows(oldContext)[0]);
    assert.equal((await c.applyExcerpt(oldReview)).ok, true); assert.equal(c.preview().text, 'Old Synthetic excerpt'); c.dispose();
});
test('stale history action is inert after navigation or replacement; missing selected record has recovery state', async () => {
    const h = await fixture(), { c } = h; h.view.main.querySelector('.prompt-history-list').children[0].dispatch('click'); const stale = button(h, 'Use this version');
    const other = await add(c, 'Other', 'other'); stale.dispatch('click'); assert.equal(c.selected, other.id); assert.equal(c.session().body, 'other');
    c.select(h.old.id); c.setVariable('second', 'retain'); const state = JSON.parse(JSON.stringify(c.state)); state.revision++; state.records = state.records.filter(record => record.id !== h.old.id);
    c.accept(state); c.notify(); assert.match(text(h.view.main), /no longer available/); assert.ok(button(h, 'Read again')); assert.equal(c.hasUncommittedWork(), true); c.dispose();
});
test('session capacity refuses switches without losing values and has explicit tab-only recovery', async () => {
    const h = await fixture(), { c } = h; c.setVariable('second', 'keep');
    while (c.sessions.size < SESSION_LIMIT) c.sessions.set(`synthetic-${c.sessions.size}`, { values: { x: 'keep' }, body: 'x', versionId: 'synthetic', literal: false });
    // Old empty session is reclaimed before capacity refusal; fill all again.
    c.sessions.delete(JSON.stringify([h.old.id, h.oldVersion, h.old.body]));
    while (c.sessions.size < SESSION_LIMIT) c.sessions.set(`full-${c.sessions.size}`, { values: { x: 'keep' }, body: 'x', versionId: 'synthetic', literal: false });
    assert.equal(c.useVersion(h.oldVersion), false); assert.equal(c.sessions.size, SESSION_LIMIT); assert.equal(c.session().values.second, 'keep');
    assert.ok(button(h, 'Clear all preview values in this tab')); const writes = h.h.writes;
    c.clearPreviewSessions(); assert.equal(c.sessions.size, 1); assert.equal(c.useVersion(h.oldVersion), true); assert.equal(h.h.writes, writes); c.dispose();
});
test('aggregate value limit reports excerpt failure rather than false success', async () => {
    const h = await fixture(), { c } = h;
    await h.results.store.mutate(h.results.store.request('add', { title: 'Excerpt', body: 'too much' })); await tick();
    c.sessions.set('synthetic-budget', { values: { x: 'x'.repeat(SESSION_VALUE_LIMIT) }, body: 'x', versionId: 'synthetic', literal: false });
    const context = c.excerptContext('second'), review = c.reviewExcerpt(context, c.excerptRows(context)[0]);
    assert.equal((await c.applyExcerpt(review)).code, 'SESSION_LIMIT'); assert.equal(c.session().values.second, undefined); c.dispose();
});
test('reviewed full-library restore keeps removed preview values blocked instead of using recovery history', async () => {
    const h = await fixture(), { c } = h; c.setVariable('second', 'before backup'); const backup = await h.h.store.export();
    c.edit(); c.update('body', 'After backup {{later}}'); await c.save(); await tick(); c.returnToCurrent(); c.setVariable('later', 'retain after restore');
    const priorSession = c.session(), plan = await h.h.store.review(backup);
    await h.h.store.mutate(h.h.store.request('replace', plan)); await tick();
    assert.equal(c.session(), priorSession); assert.equal(c.preview().text, 'After backup retain after restore'); assert.equal(c.preview().complete, false);
    assert.equal(c.state.recovery.length, 1); assert.equal(c.excerptContext('later'), null);
    const writes = h.h.writes; assert.equal(c.returnToCurrent(), true); assert.equal(c.preview().text, 'Current before backup'); assert.equal(h.h.writes, writes); c.dispose();
});
