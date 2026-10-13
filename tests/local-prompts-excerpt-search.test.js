const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const Core = require('../shared/local-prompts-store.js');
const { Controller } = require('../shared/local-prompts-controller.js');
const { setup, add, tick } = require('./helpers/prompts-harness.js');
const Collections = require('./helpers/collections-harness.js');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');
async function fixture(language = 'en', draft = false) {
    const h = setup(), collections = Collections.setup();
    const c = new Controller({ store: h.store, collectionStore: { read: () => collections.store.read(), subscribe: fn => collections.store.subscribe(fn) } });
    await c.start();
    if (draft) { c.create(); c.update('title', 'Synthetic draft'); c.update('body', '{{topic}} / {{reader}}'); c.startDraftPreview(); }
    else await add(c, 'Synthetic prompt', '{{topic}} / {{reader}}');
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
    return { h, c, collections, record, view, doc, events, review, draft, values: () => draft ? c.draftPreview.values : c.session().values, set: (name, value) => draft ? c.setDraftVariable(name, value) : c.setVariable(name, value) };
}
const revise = async (store, record, body) => store.mutate(store.request('revise', await store.reviewRevision({ id: record.id, version: record.version, body })));
const text = node => [node.textContent || '', ...node.children.map(text)].join(' ');
const choose = h => h.view.main.querySelector(`[data-prompt-focus="${h.draft ? 'draft-' : ''}excerpt-topic"]`);
const overlay = h => h.doc.body.querySelector('.prompt-dialog-overlay');
const apply = h => overlay(h).querySelector('.prompt-primary');

const search = h => overlay(h).querySelector('#excerpt-search');
const choices = h => overlay(h).querySelectorAll('.prompt-excerpt-choice');
const filter = (h, value) => { search(h).value = value; search(h).dispatch('input'); };
const clear = h => overlay(h).querySelector('.prompt-excerpt-filter button');
for (const draft of [false, true]) for (const language of ['en', 'zh_CN']) test(`${draft ? 'draft' : 'saved'} ${language}: local title matching, Unicode, duplicate IDs and cleared reviews`, async () => {
    const h = await fixture(language, draft); h.set('topic', 'KEEP'); h.set('reader', 'OTHER');
    for (const [title, body] of [['ＣＡＦÉ 中文 🌊', 'FIRST exact'], ['ＣＡＦÉ 中文 🌊', 'SECOND exact'], ['Other title', 'CAFÉ body-only']])
        await h.collections.store.mutate(h.collections.store.request('add', { title, body }));
    await tick(); let reads = 0; const read = h.c.collectionStore.read;
    h.c.collectionStore.read = () => { reads++; return read(); };
    choose(h).dispatch('click'); await tick(); const initialReads = reads, writes = [h.h.writes, h.collections.writes];
    assert.equal(choices(h).length, 4); assert.equal(clear(h).disabled, true);
    filter(h, 'cafe\u0301 🌊'); assert.equal(choices(h).length, 2);
    assert.match(text(overlay(h)), language === 'en' ? /2 of 4 excerpts/ : /显示 2 \/ 4 条摘录/);
    const oldButton = choices(h)[0]; oldButton.dispatch('click'); assert.equal(apply(h).disabled, false);
    filter(h, 'body-only'); assert.equal(choices(h).length, 0); assert.equal(apply(h).disabled, true);
    assert.match(text(overlay(h)), language === 'en' ? /No titles match/ : /没有匹配的标题/);
    assert.equal(overlay(h).querySelectorAll('pre').length, 0); oldButton.dispatch('click'); assert.equal(apply(h).disabled, true);
    assert.equal(h.values().topic, 'KEEP'); assert.equal(reads, initialReads);
    clear(h).dispatch('click'); assert.equal(choices(h).length, 4); assert.equal(h.doc.activeElement, search(h)); assert.equal(apply(h).disabled, true);
    filter(h, '中文 café'); const matched = choices(h); assert.equal(matched.length, 2);
    const seen = []; const review = h.c.reviewExcerpt.bind(h.c); h.c.reviewExcerpt = (context, row) => { seen.push(row.id); return review(context, row); };
    matched[0].dispatch('click'); const firstBody = overlay(h).querySelector('pre').textContent;
    matched[1].dispatch('click'); const secondBody = overlay(h).querySelector('pre').textContent;
    assert.notEqual(seen[0], seen[1]); assert.notEqual(firstBody, secondBody);
    apply(h).dispatch('click'); await tick(); assert.equal(overlay(h), null); assert.equal(h.values().topic, secondBody); assert.equal(h.values().reader, 'OTHER');
    assert.deepEqual([h.h.writes, h.collections.writes], writes); h.c.dispose();
});
for (const draft of [false, true]) test(`${draft ? 'draft' : 'saved'}: loading/apply locks, IME and cancellation fence late reads`, async () => {
    const h = await fixture('en', draft); h.set('topic', 'KEEP'); const state = await h.collections.store.read(), wait = deferred();
    h.c.collectionStore.read = () => wait.promise; choose(h).focus(); choose(h).dispatch('click');
    assert.equal(search(h).disabled, true); assert.equal(clear(h).disabled, true); assert.equal(apply(h).disabled, true);
    wait.resolve(state); await tick(); filter(h, 'synthetic'); search(h).focus();
    search(h).dispatch('compositionstart'); search(h).dispatch('keydown', { key: 'Escape' }); assert.ok(overlay(h));
    search(h).dispatch('compositionend'); choices(h)[0].dispatch('click'); const applyWait = deferred(); h.c.collectionStore.read = () => applyWait.promise;
    apply(h).dispatch('click'); assert.equal(search(h).disabled, true); assert.equal(clear(h).disabled, true);
    filter(h, 'nothing'); assert.equal(choices(h).length, 1); assert.equal(apply(h).disabled, true);
    overlay(h).querySelector('.prompt-actions button').dispatch('keydown', { key: 'Escape' }); assert.equal(overlay(h), null);
    applyWait.resolve(state); await tick(); assert.equal(h.values().topic, 'KEEP'); assert.equal(overlay(h), null); h.c.dispose();
});
test('empty library, failed read and stale search remain distinct and cannot restart a review', async () => {
    for (const mode of ['empty', 'error', 'stale']) {
        const h = await fixture();
        if (mode === 'empty') await h.collections.store.mutate(h.collections.store.request('remove', { id: h.record.id, version: h.record.version }));
        if (mode === 'error') h.c.collectionStore.read = async () => { throw Error('PRIVATE'); };
        choose(h).dispatch('click'); await tick();
        if (mode === 'empty') { assert.equal(search(h).disabled, false); filter(h, 'x'); assert.match(text(overlay(h)), /No active saved excerpts/); assert.match(text(overlay(h)), /0 of 0 excerpts/); }
        if (mode === 'error') { assert.equal(search(h).disabled, true); assert.match(text(overlay(h)), /could not be read safely/); assert.doesNotMatch(text(overlay(h)), /No active saved excerpts|PRIVATE/); }
        if (mode === 'stale') { search(h).focus(); await h.c.refreshCollections(); assert.equal(search(h).disabled, true); assert.equal(h.doc.activeElement, overlay(h).querySelector('.prompt-actions button')); filter(h, 'x'); assert.match(text(overlay(h)), /Cancel and choose again/); }
        assert.equal(apply(h).disabled, true); h.view.cancelExcerptDialog(); h.c.dispose();
    }
});

for (const draft of [false, true]) test(`${draft ? 'draft' : 'saved'}: stale focused review returns focus to Cancel before removal`, async () => {
    const h = await fixture('en', draft); choose(h).dispatch('click'); await tick(); choices(h)[0].dispatch('click');
    const pre = overlay(h).querySelector('pre'); pre.focus(); assert.equal(h.doc.activeElement, pre);
    await h.c.refreshCollections(); assert.equal(overlay(h).querySelectorAll('pre').length, 0);
    assert.equal(h.doc.activeElement, overlay(h).querySelector('.prompt-actions button'));
    assert.equal(search(h).disabled, true); assert.equal(apply(h).disabled, true); h.view.cancelExcerptDialog(); h.c.dispose();
});
