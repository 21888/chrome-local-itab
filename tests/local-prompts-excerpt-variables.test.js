const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const Core = require('../shared/local-prompts-store.js');
const { Controller } = require('../shared/local-prompts-controller.js');
const { setup, add, tick } = require('./helpers/prompts-harness.js');
const Collections = require('./helpers/collections-harness.js');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');
async function fixture(language = 'en', body = '{{topic}} / {{reader}}') {
    const h = setup(), collections = Collections.setup();
    const c = new Controller({ store: h.store, collectionStore: { read: () => collections.store.read(), subscribe: fn => collections.store.subscribe(fn) } });
    await c.start(); await add(c, 'Synthetic prompt', body);
    const command = collections.store.request('add', { title: '<b>Synthetic excerpt</b>', body: '中文 🌊 <script>literal()</script> {{reader}}\n  exact', notes: 'EXCLUDED NOTES', sourceUrl: 'https://example.com/private', tool: 'EXCLUDED TOOL' });
    await collections.store.mutate(command); await tick();
    const record = (await collections.store.read()).records[0];
    const doc = createDocument({ blurUnavailableFocus: true }), host = doc.createElement('div'); doc.body.append(host);
    const events = new Map(), root = { LocalItabPrompts: Core, addEventListener: (name, fn) => events.set(name, fn), navigator: { clipboard: { writeText() { throw Error('Forbidden'); } } } };
    const context = vm.createContext({ window: root, Intl, Date, Object, Array, Boolean, String, Promise });
    for (const file of ['dialog-focus', 'local-prompts-view']) vm.runInContext(fs.readFileSync(`${__dirname}/../shared/${file}.js`, 'utf8'), context);
    const messages = JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${language}/messages.json`));
    const view = new root.LocalItabPromptsView.View({ host, controller: c, translate: (name, fallback) => messages[`prompts${name}`]?.message || fallback }); view.render();
    const review = () => { const context = c.excerptContext('topic'); return c.reviewExcerpt(context, c.excerptRows(context)[0]); };
    return { h, c, collections, record, view, doc, events, review };
}
const revise = async (store, record, body) => store.mutate(store.request('revise', await store.reviewRevision({ id: record.id, version: record.version, body })));
const text = node => [node.textContent || '', ...node.children.map(text)].join(' ');
const choose = h => h.view.main.querySelector('[data-prompt-focus="excerpt-topic"]');
const overlay = h => h.doc.body.querySelector('.prompt-dialog-overlay');
const apply = h => overlay(h).querySelector('.prompt-primary');
test('explicit review applies only literal body to one in-memory variable, preserving template, notes and writes', async () => {
    const h = await fixture(), { c } = h; c.setVariable('reader', 'retained'); c.setVariable('topic', 'previous nonempty');
    const before = [h.h.writes, h.collections.writes], input = h.view.main.querySelector('[data-prompt-focus="variable-topic"]');
    choose(h).focus(); choose(h).dispatch('click'); await tick();
    assert.equal(apply(h).disabled, true); overlay(h).querySelector('.prompt-excerpt-choice').dispatch('click');
    assert.match(text(overlay(h)), /previous nonempty/); assert.match(text(overlay(h)), /中文 🌊/);
    assert.doesNotMatch(text(overlay(h)), /EXCLUDED NOTES|EXCLUDED TOOL|https:\/\/example/); assert.equal(overlay(h).querySelectorAll('script, b').length, 0);
    apply(h).dispatch('click'); await tick();
    assert.equal(overlay(h), null); assert.equal(input.value, h.record.body); assert.equal(c.session().values.topic, h.record.body); assert.equal(c.session().values.reader, 'retained');
    assert.equal(c.preview().text, `${h.record.body} / retained`); assert.equal(c.record().body, '{{topic}} / {{reader}}'); assert.deepEqual([h.h.writes, h.collections.writes], before); assert.equal(h.doc.activeElement, choose(h)); c.dispose();
});
test('cancel and IME-aware Escape preserve values and restore keyboard focus without blur', async () => {
    const h = await fixture('zh_CN'); h.c.setVariable('topic', 'keep'); choose(h).focus(); choose(h).dispatch('click'); await tick();
    assert.match(text(overlay(h)), /选择已收藏摘录/); const cancel = overlay(h).querySelector('.prompt-actions button');
    cancel.dispatch('keydown', { key: 'Escape', isComposing: true }); assert.ok(overlay(h));
    cancel.dispatch('keydown', { key: 'Tab', shiftKey: true }); assert.ok(h.doc.activeElement === cancel);
    cancel.dispatch('keydown', { key: 'Escape' }); assert.equal(overlay(h), null); assert.equal(h.c.session().values.topic, 'keep'); assert.equal(h.doc.activeElement, choose(h)); h.c.dispose();
});
test('cancel during initial async read leaves no late dialog or application', async () => {
    const h = await fixture(), wait = deferred(), state = await h.collections.store.read(); h.c.collectionStore.read = () => wait.promise;
    choose(h).dispatch('click'); overlay(h).querySelector('.prompt-actions button').dispatch('click'); wait.resolve(state); await tick(); assert.equal(overlay(h), null); assert.deepEqual(Object.keys(h.c.session().values), []); h.c.dispose();
});
test('navigation away and back, session resets, value edits and disposal invalidate exact review even during apply', async () => {
    for (const change of [c => { const id = c.selected; c.select(null); c.select(id); }, c => c.clearVariables(), c => c.setVariable('reader', 'changed'), c => c.setLiteral(true), c => c.dispose()]) {
        const h = await fixture(), review = h.review(), state = await h.collections.store.read(), wait = deferred(); h.c.collectionStore.read = () => wait.promise;
        const pending = h.c.applyExcerpt(review); change(h.c); wait.resolve(state); assert.equal((await pending).ok, false); assert.equal(review.context.session.values.topic, undefined); h.c.dispose();
    }
});
test('unsignaled source body changes, archive and prompt changes reject reread without persistence', async () => {
    for (const change of ['body', 'archive', 'prompt']) {
        const h = await fixture(), review = h.review(); h.c.unsubscribeCollections(); h.c.unsubscribe();
        if (change === 'prompt') await h.h.store.mutate(h.h.store.request('edit', { id: h.c.record().id, version: h.c.record().version, body: 'New {{topic}}' }));
        else if (change === 'body') await revise(h.collections.store, h.record, 'different');
        else await h.collections.store.mutate(h.collections.store.request('remove', { id: h.record.id, version: h.record.version }));
        assert.equal((await h.c.applyExcerpt(review)).ok, false); assert.equal(h.c.session().values.topic, undefined); h.c.dispose();
    }
});
test('collection refresh invalidates visible review; archived records are absent from fresh chooser', async () => {
    const h = await fixture(); choose(h).dispatch('click'); await tick(); overlay(h).querySelector('.prompt-excerpt-choice').dispatch('click');
    await h.collections.store.mutate(h.collections.store.request('remove', { id: h.record.id, version: h.record.version })); await tick();
    assert.equal(apply(h).disabled, true); assert.match(text(overlay(h)), /Cancel and choose again/); overlay(h).querySelector('.prompt-actions button').dispatch('click');
    choose(h).dispatch('click'); await tick(); assert.match(text(overlay(h)), /No active saved excerpts/); assert.equal(overlay(h).querySelectorAll('.prompt-excerpt-choice').length, 0); h.view.cancelExcerptDialog(); h.c.dispose();
});
test('read errors and completed preview expansion limits cannot alter values', async () => {
    const h = await fixture('en', '{{topic}}'.repeat(9));
    await revise(h.collections.store, h.record, 'a'.repeat(Core.LIMITS.value)); await tick();
    const review = h.review(); const result = await h.c.applyExcerpt(review); assert.equal(result.code, 'PREVIEW_LIMIT'); assert.equal(h.c.session().values.topic, undefined);
    h.c.collectionStore.read = async () => { throw Error('PRIVATE DETAIL'); }; const next = h.review(); assert.equal((await h.c.applyExcerpt(next)).code, 'READ'); assert.equal(h.c.session().values.topic, undefined); h.c.dispose();
});
test('duplicate apply and cancel during apply are fenced', async () => {
    const h = await fixture(), review = h.review(), wait = deferred(), state = await h.collections.store.read(); h.c.collectionStore.read = () => wait.promise;
    const pending = h.c.applyExcerpt(review); assert.equal((await h.c.applyExcerpt(review)).ok, false); review.context.cancelled = true; wait.resolve(state); assert.equal((await pending).ok, false); assert.equal(h.c.session().values.topic, undefined); h.c.dispose();
});
test('retained preview version receives the excerpt without switching to latest saved body', async () => {
    const h = await fixture(), original = h.c.record(); h.c.setVariable('reader', 'old-session');
    await h.h.store.mutate(h.h.store.request('edit', { id: original.id, version: original.version, body: 'LATEST {{topic}}' })); await tick();
    assert.equal(h.c.session().versionId, original.currentVersionId);
    const before = [h.h.writes, h.collections.writes];
    assert.equal((await h.c.applyExcerpt(h.review())).ok, true);
    assert.equal(h.c.preview().text, `${h.record.body} / old-session`);
    assert.equal(h.c.session().versionId, original.currentVersionId);
    assert.equal(h.c.record().body, 'LATEST {{topic}}'); assert.deepEqual([h.h.writes, h.collections.writes], before); h.c.dispose();
});
test('applying a reviewed excerpt locks further choices until completion', async () => {
    const h = await fixture(); await h.collections.store.mutate(h.collections.store.request('add', { title: 'Other synthetic excerpt', body: 'OTHER' })); await tick();
    choose(h).dispatch('click'); await tick(); const buttons = overlay(h).querySelectorAll('.prompt-excerpt-choice'); buttons[0].dispatch('click');
    const state = await h.collections.store.read(), wait = deferred(); h.c.collectionStore.read = () => wait.promise;
    apply(h).focus(); apply(h).dispatch('click'); assert.equal(h.doc.activeElement === overlay(h).querySelector('.prompt-actions button'), true); assert.equal(buttons[0].disabled, true); assert.equal(buttons[1].disabled, true);
    buttons[1].dispatch('click'); assert.doesNotMatch(text(overlay(h).querySelector('.prompt-readonly')), /OTHER/);
    wait.resolve(state); await tick(); assert.equal(h.c.session().values.topic, h.record.body); assert.equal(overlay(h), null); h.c.dispose();
});
test('page departure cancels an in-flight apply without retaining late variable values', async () => {
    const h = await fixture(); choose(h).dispatch('click'); await tick(); overlay(h).querySelector('.prompt-excerpt-choice').dispatch('click');
    const state = await h.collections.store.read(), wait = deferred(); h.c.collectionStore.read = () => wait.promise;
    apply(h).dispatch('click'); h.events.get('pagehide')(); wait.resolve(state); await tick();
    assert.equal(overlay(h), null); assert.equal(h.c.session().values.topic, undefined); h.c.dispose();
});
test('prompt pending reads, errors, drafts, archive and literal mode cannot issue a selection', async () => {
    const h = await fixture(), state = await h.h.store.read(), wait = deferred(); h.c.store.read = () => wait.promise;
    const pending = h.c.refresh(); assert.equal(h.c.excerptContext('topic'), null); wait.resolve(state); await pending;
    h.c.store.read = async () => { throw Error('Private'); }; await h.c.refresh(); assert.equal(h.c.excerptContext('topic'), null);
    h.c.store.read = async () => state; await h.c.refresh(); h.c.edit(); assert.equal(h.c.excerptContext('topic'), null); h.c.discard();
    h.c.setLiteral(true); assert.equal(h.c.excerptContext('topic'), null); h.c.setLiteral(false);
    assert.equal(h.c.excerptContext('unknown'), null); h.c.record().deletedAt = '2026-10-10T00:00:00.000Z'; assert.equal(h.c.excerptContext('topic'), null); h.c.dispose();
});
test('initial read failure or corrupt data cannot display saved excerpts as an empty list', async () => {
    for (const mode of ['error', 'corrupt']) {
        const h = await fixture(); h.c.collectionStore.read = async () => { if (mode === 'error') throw Error('PRIVATE FAILURE'); return { invalid: true }; };
        choose(h).dispatch('click'); await tick(); assert.match(text(overlay(h)), /could not be read safely/); assert.doesNotMatch(text(overlay(h)), /No active saved excerpts|PRIVATE FAILURE/);
        assert.equal(apply(h).disabled, true); assert.equal(overlay(h).querySelectorAll('.prompt-excerpt-choice').length, 0); h.view.cancelExcerptDialog(); h.c.dispose();
    }
});
test('older collection read cannot repopulate a newer empty chooser', async () => {
    const h = await fixture(), state = await h.collections.store.read(), wait = deferred(); let reads = 0;
    h.c.collectionStore.read = () => ++reads === 1 ? wait.promise : Promise.resolve({ ...state, records: [] });
    choose(h).dispatch('click'); await h.c.refreshCollections(); wait.resolve(state); await tick();
    assert.equal(overlay(h).querySelectorAll('.prompt-excerpt-choice').length, 0); assert.equal(apply(h).disabled, true); h.view.cancelExcerptDialog(); h.c.dispose();
});
test('failed prompt reread and refreshed collection generation reject application unchanged', async () => {
    for (const mode of ['prompt-error', 'collection-refresh']) {
        const h = await fixture(), review = h.review();
        if (mode === 'prompt-error') h.c.store.read = async () => { throw Error('PRIVATE'); };
        else await h.c.refreshCollections();
        assert.equal((await h.c.applyExcerpt(review)).ok, false); assert.equal(h.c.session().values.topic, undefined); h.c.dispose();
    }
});

test('stale invalidation preserves keyboard cancellation when Apply or a choice had focus', async () => {
    for (const focused of ['apply', 'choice']) {
        const h = await fixture(); choose(h).dispatch('click'); await tick(); const choice = overlay(h).querySelector('.prompt-excerpt-choice'); choice.dispatch('click');
        (focused === 'apply' ? apply(h) : choice).focus(); await h.c.refreshCollections();
        assert.equal(h.doc.activeElement === overlay(h).querySelector('.prompt-actions button'), true);
        h.doc.activeElement.dispatch('keydown', { key: 'Escape' }); assert.equal(overlay(h), null); assert.equal(h.c.session().values.topic, undefined); h.c.dispose();
    }
});
