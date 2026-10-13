const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-ai-collections-store.js');
const { setup, settle } = require('./helpers/collections-harness.js');
const { createDocument } = require('./helpers/task-dom-model.js');
async function mount(locale = 'en') {
    const h = setup(), doc = createDocument({ blurUnavailableFocus: true });
    const host = doc.createElement('div'); doc.body.append(host);
    const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));
    const root = { LocalItabAICollections: Core, i18n: { t: key => messages[key]?.message || key } };
    vm.runInNewContext(fs.readFileSync('shared/local-ai-collections-view.js', 'utf8'), { window: root });
    const view = new root.LocalItabCollectionsView.View({ host, controller: h.controller });
    for (const [title, tags, type, tool, body] of [
        ['Exact', ['a', 'Research, planning', '保留，原始 🧪', '<b>literal</b>'], 'code', 'Example', 'needle'],
        ['Prefix', ['ab'], 'code', 'Example', 'needle'],
        ['Wrong type', ['a'], 'answer', 'Example', 'needle'],
        ['Wrong tool', ['a'], 'code', 'Other', 'needle'],
        ['Wrong query', ['a'], 'code', 'Example', 'different']
    ]) await h.store.mutate(h.store.request('add', { title, tags, type, tool, body }));
    await h.controller.start();
    h.controller.select(h.controller.state.records.find(record => record.title === 'Exact').id);
    return { h, c: h.controller, view, host, doc };
}
const buttons = view => view.main.querySelectorAll('.prompt-tag-filter');
const click = (view, tag) => buttons(view).find(button => button.dataset.collectionTag === tag).dispatch('click');
for (const locale of ['en', 'zh_CN']) test(`saved tag buttons preserve exact values and intersect all filters (${locale})`, async () => {
    const { h, c, view, doc } = await mount(locale), writes = h.writes, state = await h.store.read();
    c.filter({ query: 'needle', type: 'code', tool: 'Example' });
    const detail = view.main.children.slice(), generation = view.detailGeneration, selected = c.selected;
    const meta = view.main.querySelector('.prompt-meta');
    assert.deepEqual(meta.children.filter(node => node.tagName === 'SPAN').map(node => node.textContent), [locale === 'en' ? 'Code' : '代码', 'Example']);
    assert.equal(buttons(view).length, 4);
    const button = buttons(view)[0]; assert.equal(button.type, 'button'); button.focus();
    assert.equal(button.getAttribute('aria-label'), locale === 'en' ? 'Filter by tag: a' : '按标签筛选: a');
    click(view, 'a'); click(view, 'a');
    assert.deepEqual(c.results().map(item => item.record.title), ['Exact'], 'a does not match ab; query, type and tool intersect');
    assert.equal(doc.activeElement, button); assert.equal(view.detailGeneration, generation);
    assert.equal(view.main.children.length, detail.length); view.main.children.forEach((node, index) => assert.ok(node === detail[index], 'detail node preserved')); assert.equal(c.selected, selected);
    for (const tag of ['Research, planning', '保留，原始 🧪', '<b>literal</b>']) {
        click(view, tag); assert.equal(c.filters.tag, tag); assert.equal(view.filters.tag.value, tag);
        assert.deepEqual(c.results().map(item => item.record.title), ['Exact']);
        assert.deepEqual(buttons(view).map(node => node.getAttribute('aria-pressed')), buttons(view).map(node => String(node.dataset.collectionTag === tag)));
    }
    assert.equal(view.main.querySelectorAll('b, script').length, 0);
    view.filters.tag.value = 'a'; view.filters.tag.dispatch('change'); assert.equal(button.getAttribute('aria-pressed'), 'true');
    c.filter({ query: 'absent' }); assert.equal(c.results().length, 0); assert.equal(view.main.children.length, detail.length); view.main.children.forEach((node, index) => assert.ok(node === detail[index], 'detail node preserved'));
    view.clearFilters.dispatch('click'); assert.ok(buttons(view).every(node => node.getAttribute('aria-pressed') === 'false'));
    assert.deepEqual(await h.store.read(), state); assert.equal(h.writes, writes); c.dispose();
});
test('archived tag filtering preserves mode, proposals, other drafts and current detail', async () => {
    const { h, c, view, doc } = await mount(); const selected = c.selected;
    await c.action('remove'); await settle(c); c.filter({ mode: 'trash', query: 'needle', type: 'code', tool: 'Example' }); c.select(selected);
    c.create(); c.update('title', 'Unsaved'); c.update('body', 'draft body'); c.select(selected);
    const draft = JSON.stringify([...c.drafts]), detail = view.main.children.slice();
    view.proposals.set(selected, 'unsaved proposal'); view.revisionDraft = 'temporary revision';
    const writes = h.writes, state = await h.store.read(); buttons(view)[0].focus(); const focused = doc.activeElement;
    click(view, 'a'); assert.equal(c.filters.mode, 'trash'); assert.equal(c.results()[0].record.id, selected);
    assert.equal(c.selected, selected); assert.equal(view.main.children.length, detail.length); view.main.children.forEach((node, index) => assert.ok(node === detail[index], 'detail node preserved')); assert.equal(doc.activeElement, focused);
    assert.equal(JSON.stringify([...c.drafts]), draft); assert.equal(view.proposals.get(selected), 'unsaved proposal'); assert.equal(view.revisionDraft, 'temporary revision');
    assert.equal(h.writes, writes); assert.deepEqual(await h.store.read(), state); c.dispose();
});
test('busy, pending, modal, disabled, detached, stale and disposed buttons cannot change filters or write', async () => {
    const { h, c, view } = await mount(), writes = h.writes;
    const button = buttons(view)[0], before = JSON.stringify(c.filters), generation = c.interactionGeneration;
    for (const [object, key, value] of [[c, 'busy', true], [c, 'pendingCommand', {}], [view, 'openDialog', true], [button, 'disabled', true]]) {
        const original = object[key]; object[key] = value; button.dispatch('click'); object[key] = original;
        assert.equal(JSON.stringify(c.filters), before); assert.equal(c.interactionGeneration, generation);
    }
    c.edit(); button.dispatch('click'); assert.equal(JSON.stringify(c.filters), before); c.discard();
    const stale = buttons(view)[0]; view.render(); stale.dispatch('click'); assert.equal(JSON.stringify(c.filters), before);
    const current = buttons(view)[0]; current.remove(); current.dispatch('click'); assert.equal(JSON.stringify(c.filters), before);
    view.render(); const disposed = buttons(view)[0]; c.dispose(); disposed.dispatch('click');
    assert.equal(JSON.stringify(c.filters), before); assert.equal(h.writes, writes);
});
