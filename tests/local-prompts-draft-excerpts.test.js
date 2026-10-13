const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const Core = require('../shared/local-prompts-store.js');
const { Controller, SESSION_VALUE_LIMIT } = require('../shared/local-prompts-controller.js');
const { setup, add, tick } = require('./helpers/prompts-harness.js');
const Collections = require('./helpers/collections-harness.js');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');
async function fixture(language = 'en', body = '{{topic}} / {{reader}}') {
    const h = setup(), collections = Collections.setup();
    const c = new Controller({ store: h.store, collectionStore: { read: () => collections.store.read(), subscribe: fn => collections.store.subscribe(fn) } });
    await c.start(); c.create(); c.update('title', 'Synthetic draft'); c.update('body', body); c.startDraftPreview();
    const command = collections.store.request('add', { title: '<b>Synthetic excerpt</b>', body: '中文 🌊 <script>literal()</script> {{reader}}\n  exact', notes: 'EXCLUDED NOTES', sourceUrl: 'https://example.com/private', tool: 'EXCLUDED TOOL' });
    await collections.store.mutate(command); await tick();
    const record = (await collections.store.read()).records[0];
    const doc = createDocument({ blurUnavailableFocus: true }), host = doc.createElement('div'); doc.body.append(host);
    const events = new Map(), root = { LocalItabPrompts: Core, addEventListener: (name, fn) => events.set(name, fn), navigator: { clipboard: { writeText() { throw Error('Forbidden'); } } } };
    const context = vm.createContext({ window: root, Intl, Date, Object, Array, Boolean, String, Promise });
    for (const file of ['dialog-focus', 'local-prompts-view']) vm.runInContext(fs.readFileSync(`${__dirname}/../shared/${file}.js`, 'utf8'), context);
    const messages = JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${language}/messages.json`));
    const view = new root.LocalItabPromptsView.View({ host, controller: c, translate: (name, fallback) => messages[`prompts${name}`]?.message || fallback }); view.render();
    const review = () => { const context = c.draftExcerptContext('topic'); return c.reviewExcerpt(context, c.excerptRows(context)[0]); };
    return { h, c, collections, record, view, doc, events, review };
}
const revise = async (store, record, body) => store.mutate(store.request('revise', await store.reviewRevision({ id: record.id, version: record.version, body })));
const text = node => [node.textContent || '', ...node.children.map(text)].join(' ');
const choose = h => h.view.main.querySelector('[data-prompt-focus="draft-excerpt-topic"]');
const overlay = h => h.doc.body.querySelector('.prompt-dialog-overlay');
const apply = h => overlay(h).querySelector('.prompt-primary');
for (const language of ['en', 'zh_CN']) test(`${language}: draft explicitly reviews body and previous value, replaces one variable without persistence or copying`, async () => {
    const h = await fixture(language), c = h.c; c.setDraftVariable('topic', 'old'); c.setDraftVariable('reader', 'kept');
    const snapshot = JSON.stringify(c.draft().input), writes = [h.h.writes, h.collections.writes];
    assert.equal(c.sessionReady(), false); assert.equal(c.excerptContext('topic'), null);
    choose(h).focus(); choose(h).dispatch('click'); await tick(); assert.equal(apply(h).disabled, true);
    overlay(h).querySelector('.prompt-excerpt-choice').dispatch('click'); assert.match(text(overlay(h)), /old/); assert.match(text(overlay(h)), /中文 🌊/);
    assert.match(text(overlay(h)), language === 'en' ? /Nothing is saved, copied or sent/ : /不会自动保存、复制或发送/);
    assert.doesNotMatch(text(overlay(h)), /EXCLUDED|https:\/\/example/); assert.equal(overlay(h).querySelectorAll('script,b').length, 0);
    apply(h).dispatch('click'); await tick(); assert.equal(overlay(h), null);
    assert.equal(c.draftPreview.values.topic, h.record.body); assert.equal(c.draftPreview.values.reader, 'kept');
    assert.equal(h.view.draftPreviewElements.variables.querySelector('[data-prompt-focus="draft-variable-topic"]').value, h.record.body);
    assert.equal(c.draftPreviewResult().text, `${h.record.body} / kept`); assert.equal(JSON.stringify(c.draft().input), snapshot);
    assert.deepEqual([h.h.writes, h.collections.writes], writes); assert.equal(c.state.records.length, 0); assert.equal(h.doc.activeElement, choose(h)); c.dispose();
});
for (const change of ['edit-revert', 'value-revert', 'restart', 'switch', 'discard', 'save', 'dispose', 'cancel', 'pagehide', 'literal', 'literal-round-trip']) test(`deferred apply cannot fill draft after ${change}`, async () => {
    const h = await fixture(), c = h.c; c.setDraftVariable('topic', 'old'); c.setDraftVariable('reader', 'keep');
    const review = h.review(), values = review.context.session.values, state = await h.collections.store.read(), wait = deferred(); c.collectionStore.read = () => wait.promise;
    const pending = c.applyExcerpt(review);
    if (change.startsWith('literal')) { c.setDraftLiteral(true); if (change === 'literal-round-trip') c.setDraftLiteral(false); }
    if (change === 'edit-revert') { c.update('category', 'changed'); c.update('category', ''); }
    if (change === 'value-revert') { c.setDraftVariable('reader', 'changed'); c.setDraftVariable('reader', 'keep'); }
    if (change === 'restart') c.startDraftPreview();
    if (change === 'switch') { c.select(null); c.select('new'); }
    if (change === 'discard') c.discard();
    if (change === 'save') await c.save();
    if (change === 'dispose') c.dispose();
    if (change === 'cancel') review.context.cancelled = true;
    if (change === 'pagehide') h.view.pageHide({ persisted: true });
    wait.resolve(state); assert.equal((await pending).ok, false); assert.equal(values.topic, 'old'); assert.equal(values.reader, 'keep'); c.dispose();
});
for (const change of ['revise', 'archive', 'corrupt', 'reject', 'refresh']) test(`draft application rejects ${change} with all old values intact`, async () => {
    const h = await fixture(), c = h.c; c.setDraftVariable('topic', 'old'); c.setDraftVariable('reader', 'keep'); const session = c.draftPreview, before = JSON.stringify(session.values), review = h.review();
    c.unsubscribeCollections();
    if (change === 'revise') await revise(h.collections.store, h.record, 'changed');
    if (change === 'archive') await h.collections.store.mutate(h.collections.store.request('remove', { id: h.record.id, version: h.record.version }));
    if (change === 'corrupt') c.collectionStore.read = async () => ({ records: [{}] });
    if (change === 'reject') c.collectionStore.read = async () => { throw Error('unavailable'); };
    if (change === 'refresh') await c.refreshCollections();
    assert.equal((await c.applyExcerpt(review)).ok, false); assert.equal(JSON.stringify(session.values), before); c.dispose();
});
test('draft replacement preflights expansion and shared UTF-16 budget atomically, accepting exact limits', async () => {
    for (const kind of ['expansion', 'budget', 'exact-budget', 'unicode']) {
        const h = await fixture('en', kind === 'expansion' ? '{{topic}}'.repeat(9) + '{{reader}}' : '{{topic}}/{{reader}}'), c = h.c;
        c.setDraftVariable('topic', 'old'); c.setDraftVariable('reader', 'keep');
        const body = kind === 'expansion' ? 'x'.repeat(32000) : kind === 'unicode' ? '😀'.repeat(32000) : 'body';
        await revise(h.collections.store, h.record, body); await tick(); await c.refreshCollections();
        if (kind.includes('budget')) c.sessions.set('synthetic-budget', { values: { value: 'x'.repeat(SESSION_VALUE_LIMIT - 4 - body.length + (kind === 'budget' ? 1 : 0)) } });
        const review = h.review(), session = c.draftPreview, oldValues = session.values, result = await c.applyExcerpt(review);
        assert.equal(result.ok, kind === 'exact-budget' || kind === 'unicode');
        if (!result.ok) { assert.equal(session.values, oldValues); assert.equal(session.values.topic, 'old'); assert.equal(session.error, null); }
        else assert.equal(session.values.topic, body);
        assert.equal(session.values.reader, 'keep'); c.dispose();
    }
});
test('oversized source cannot pass real collection validation; rejected read preserves old values', async () => {
    const h = await fixture(), c = h.c; c.setDraftVariable('topic', 'old');
    await assert.rejects(revise(h.collections.store, h.record, 'x'.repeat(Core.LIMITS.value + 1)), { code: 'TEXT_LIMIT' });
    const review = h.review(), state = await h.collections.store.read(), values = c.draftPreview.values;
    state.records[0].body = 'x'.repeat(Core.LIMITS.value + 1); c.collectionStore.read = async () => state;
    c.setDraftVariable = () => { throw Error('must not call'); };
    assert.equal((await c.applyExcerpt(review)).ok, false); assert.equal(c.draftPreview.values, values); assert.equal(values.topic, 'old'); c.dispose();
});
test('IME Escape, cancelling initial read and cancelling Apply leave no late insertion', async () => {
    for (const phase of ['initial', 'apply']) {
        const h = await fixture(), c = h.c; c.setDraftVariable('topic', 'keep'); const state = await h.collections.store.read(), wait = deferred();
        if (phase === 'initial') c.collectionStore.read = () => wait.promise;
        choose(h).focus(); choose(h).dispatch('click');
        if (phase === 'apply') { await tick(); overlay(h).querySelector('.prompt-excerpt-choice').dispatch('click'); c.collectionStore.read = () => wait.promise; apply(h).dispatch('click'); }
        const cancel = overlay(h).querySelector('.prompt-actions button'); cancel.dispatch('keydown', { key: 'Escape', isComposing: true }); assert.ok(overlay(h));
        cancel.dispatch('keydown', { key: 'Escape' }); assert.equal(overlay(h), null); wait.resolve(state); await tick(); assert.equal(c.draftPreview.values.topic, 'keep'); c.dispose();
    }
});
test('duplicate Apply and stale full render synchronize only current controls', async () => {
    const h = await fixture(), c = h.c; c.setDraftVariable('topic', 'old');
    choose(h).dispatch('click'); await tick(); overlay(h).querySelector('.prompt-excerpt-choice').dispatch('click');
    const oldInput = h.view.draftPreviewElements.variables.querySelector('textarea'), oldText = oldInput.value; h.view.render(); assert.equal(oldInput.isConnected, false);
    const state = await h.collections.store.read(), wait = deferred(); let reads = 0; c.collectionStore.read = () => { reads++; return wait.promise; };
    apply(h).dispatch('click'); apply(h).dispatch('click'); wait.resolve(state); await tick(); assert.equal(reads, 1);
    assert.equal(oldInput.value, oldText); assert.equal(h.view.draftPreviewElements.variables.querySelector('textarea').value, h.record.body); c.dispose();
});
test('empty library is distinct from corrupt/unavailable reads; older read cannot replace newer list', async () => {
    for (const mode of ['empty', 'corrupt', 'reject', 'reordered']) {
        const h = await fixture(), c = h.c, state = await h.collections.store.read(), wait = deferred(); let reads = 0;
        c.collectionStore.read = async () => {
            if (mode === 'corrupt') return { records: [{}] };
            if (mode === 'reject') throw Error('PRIVATE failure');
            if (mode === 'reordered' && ++reads === 1) return wait.promise;
            return { ...state, records: [] };
        };
        choose(h).dispatch('click'); if (mode === 'reordered') { await c.refreshCollections(); wait.resolve(state); } await tick();
        assert.equal(overlay(h).querySelectorAll('.prompt-excerpt-choice').length, 0); assert.equal(apply(h).disabled, true);
        assert.match(text(overlay(h)), mode === 'empty' || mode === 'reordered' ? /No active saved excerpts/ : /could not be read safely/);
        assert.doesNotMatch(text(overlay(h)), /PRIVATE failure/); h.view.cancelExcerptDialog(); c.dispose();
    }
});
test('CRLF, prototype-named variables and literal markup round-trip exactly; no prompt read required', async () => {
    const h = await fixture('en', '{{__proto__}}/{{reader}}'), c = h.c, body = ' \r\n😀<b>literal</b>{{reader}}\r\n ';
    await revise(h.collections.store, h.record, body); await tick(); await c.refreshCollections(); c.setDraftVariable('reader', 'kept');
    const context = c.draftExcerptContext('__proto__'), review = c.reviewExcerpt(context, c.excerptRows(context)[0]);
    c.store.read = () => { throw Error('new draft has no persisted source'); };
    assert.equal((await c.applyExcerpt(review)).ok, true); assert.equal(Object.getPrototypeOf(c.draftPreview.values), null);
    assert.equal(c.draftPreviewResult().text, `${body}/kept`); assert.equal((await c.applyExcerpt(review)).ok, false); c.dispose();
});
test('saved-record editor and absent/invalid new previews cannot issue draft excerpt tickets', async () => {
    const h = await fixture(), c = h.c; assert.equal(c.draftExcerptContext('unknown'), null); c.invalidateDraftPreview(); assert.equal(c.draftExcerptContext('topic'), null);
    const saved = await add(c, 'Saved synthetic', '{{topic}}'); c.edit(saved.id); assert.equal(c.draftExcerptContext('topic'), null); assert.equal(c.excerptContext('topic'), null); c.dispose();
});

test('applying one excerpt preserves another variable’s rejected manual text in the current UI', async () => {
    const h = await fixture(), c = h.c, input = h.view.draftPreviewElements.variables.querySelector('[data-prompt-focus="draft-variable-reader"]');
    input.value = 'x'.repeat(Core.LIMITS.value + 1); input.dispatch('input'); const previous = input.value;
    choose(h).dispatch('click'); await tick(); overlay(h).querySelector('.prompt-excerpt-choice').dispatch('click'); apply(h).dispatch('click'); await tick();
    assert.equal(input.value, previous); assert.equal(c.draftPreview.values.reader, undefined); assert.equal(c.draftPreview.values.topic, h.record.body); c.dispose();
});
