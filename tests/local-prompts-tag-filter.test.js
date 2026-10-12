const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-prompts-store.js');
const { setup, settle } = require('./helpers/prompts-harness.js');
const { createDocument } = require('./helpers/task-dom-model.js');

async function mount(language = 'en') {
    const h = setup(), c = h.controller;
    const inputs = [
        { title: 'Exact', body: 'Explain {{topic}}', tags: ['alpha,beta', '中文，逗号', ' spaced ', 'AI', '<script>'], category: 'Work', favorite: true },
        { title: 'Body only', body: 'alpha,beta 中文，逗号 AI', tags: ['alpha', 'beta', 'ai'], category: 'Work' },
        { title: 'Other category', body: 'Explain sample', tags: ['alpha,beta'], category: 'Home' },
        { title: 'Trash', body: 'Discarded', tags: ['removed-only'], category: 'Work' }
    ];
    for (const input of inputs) await h.store.mutate(h.store.request('add', input));
    await c.start(); await settle(c);
    c.select(c.state.records.find(r => r.title === 'Trash').id); await c.action('remove'); await settle(c);
    c.select(c.state.records.find(r => r.title === 'Exact').id);
    const doc = createDocument({ blurUnavailableFocus: true }), host = doc.createElement('div'); doc.body.append(host);
    const messages = JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${language}/messages.json`, 'utf8'));
    const root = { document: doc, LocalItabPrompts: Core, addEventListener() {}, removeEventListener() {} };
    vm.runInNewContext(fs.readFileSync(`${__dirname}/../shared/local-prompts-view.js`, 'utf8'), { window: root, Intl });
    const view = new root.LocalItabPromptsView.View({ host, controller: c, translate: (key, fallback) => messages[`prompts${key}`]?.message || fallback });
    view.render();
    return { ...h, c, doc, host, view, writesNow: () => h.writes };
}
const titles = c => c.results().map(({ record }) => record.title).sort();
const options = view => view.tag.children.map(option => option.value);

test('tag match is exact, case-sensitive and independent of matching body text; filters intersect', async () => {
    const h = await mount(), { c } = h, raw = h.raw, writes = h.writesNow();
    c.filter({ tag: 'alpha,beta' }); assert.deepEqual(titles(c), ['Exact', 'Other category']);
    c.filter({ category: 'Work' }); assert.deepEqual(titles(c), ['Exact']);
    c.filter({ query: 'Discarded' }); assert.deepEqual(titles(c), []);
    c.filter({ query: 'Explain' }); assert.deepEqual(titles(c), ['Exact']);
    c.filter({ tag: 'AI' }); assert.deepEqual(titles(c), ['Exact']);
    c.filter({ tag: 'ai', query: '' }); assert.deepEqual(titles(c), ['Body only']);
    c.filter({ tag: 'alpha,beta ', category: '' }); assert.deepEqual(titles(c), []);
    c.filter({ tag: ' spaced ' }); assert.deepEqual(titles(c), ['Exact']);
    assert.deepEqual(h.raw, raw); assert.equal(h.writesNow(), writes); c.dispose();
});

for (const language of ['en', 'zh_CN']) test(`localized native tag controls preserve literal Unicode and zero-result choices (${language})`, async () => {
    const { c, view, host, doc } = await mount(language);
    assert.equal(doc.querySelector('label[for="prompt-tag-filter"]')?.textContent || host.querySelectorAll('label').find(label => label.htmlFor === 'prompt-tag-filter').textContent, language === 'en' ? 'Tag' : '标签');
    assert.equal(view.tag.children[0].textContent, language === 'en' ? 'All tags' : '全部标签');
    for (const tag of ['alpha,beta', '中文，逗号', ' spaced ', '<script>']) assert.ok(options(view).includes(tag));
    assert.equal(options(view).includes('removed-only'), false);
    const chip = view.main.querySelectorAll('[data-prompt-tag]').find(button => button.dataset.promptTag === '中文，逗号');
    assert.equal(chip.type, 'button'); assert.equal(chip.textContent, '中文，逗号');
    assert.equal(chip.getAttribute('aria-label'), `${language === 'en' ? 'Filter by tag' : '按标签筛选'}: 中文，逗号`);
    chip.focus(); chip.dispatch('click');
    assert.equal(c.filters.tag, '中文，逗号'); assert.equal(chip.getAttribute('aria-pressed'), 'true'); assert.equal(doc.activeElement, chip);
    assert.equal(host.querySelectorAll('script').length, 0); assert.equal(host.querySelectorAll('button').some(button => button.querySelector('button')), false);
    view.search.value = 'missing'; view.search.dispatch('input'); assert.equal(c.results().length, 0); assert.equal(view.clearButton.hidden, false);
    assert.equal(view.tag.value, '中文，逗号'); assert.ok(options(view).includes('中文，逗号'));
    view.clearButton.dispatch('click'); assert.deepEqual(c.filters, { query: '', mode: 'all', category: '', tag: '' });
    assert.equal(chip.getAttribute('aria-pressed'), 'false'); assert.equal(view.clearButton.hidden, true); c.dispose();
});

test('favorites/trash switch option scope without silently dropping an exact selection', async () => {
    const { c, view } = await mount();
    view.tag.value = 'ai'; view.tag.dispatch('change'); assert.deepEqual(titles(c), ['Body only']);
    view.nav.favorites.dispatch('click'); assert.deepEqual(titles(c), []);
    assert.ok(options(view).includes('ai'), 'selected absent tag stays clearable'); assert.equal(options(view).includes('alpha'), false);
    view.tag.value = 'alpha,beta'; view.tag.dispatch('change'); assert.deepEqual(titles(c), ['Exact']);
    view.nav.trash.dispatch('click'); assert.deepEqual(titles(c), []);
    assert.deepEqual(options(view), ['', 'removed-only', 'alpha,beta']);
    assert.match(view.list.textContent + view.list.children.map(el => el.textContent).join(' '), /No matching prompts/);
    view.tag.value = 'removed-only'; view.tag.dispatch('change'); assert.deepEqual(titles(c), ['Trash']);
    view.nav.all.dispatch('click'); assert.deepEqual(titles(c), []); assert.ok(options(view).includes('removed-only'));
    view.clearButton.dispatch('click'); assert.equal(options(view).includes('removed-only'), false); c.dispose();
});

test('filter lifecycle retains selection, preview variables, drafts and attached AI output DOM without writes', async () => {
    const h = await mount(), { c, view } = h, original = c.selected;
    c.setVariable('topic', 'private in-memory value');
    const session = c.session(), preview = view.previewElements, aiOutput = view.el('pre', 'test-ai-output', 'Unsaved synthetic answer'); view.main.append(aiOutput);
    const writes = h.writesNow(), raw = h.raw;
    for (const patch of [{ tag: 'missing' }, { mode: 'favorites' }, { mode: 'trash' }, { query: 'nothing', category: 'Home' }, { query: '', category: '', tag: '', mode: 'all' }]) c.filter(patch);
    assert.equal(c.selected, original); assert.equal(c.session(), session); assert.equal(c.session().values.topic, 'private in-memory value');
    assert.equal(view.previewElements, preview); assert.equal(view.main.contains(aiOutput), true);
    c.edit(); c.update('body', 'Unsaved draft'); const draft = c.draft(), editor = view.editorElements;
    c.filter({ tag: 'missing', mode: 'trash' }); view.clearButton.dispatch('click');
    assert.equal(c.draft(), draft); assert.equal(c.draft().input.body, 'Unsaved draft'); assert.equal(view.editorElements, editor);
    assert.equal(h.writesNow(), writes); assert.deepEqual(h.raw, raw);
    c.discard(); c.filter({ tag: 'alpha,beta' }); await c.action('remove'); await settle(c);
    assert.deepEqual(titles(c), ['Other category']); c.filter({ mode: 'trash' }); assert.deepEqual(titles(c), ['Exact']);
    await c.action('restore'); await settle(c); assert.deepEqual(titles(c), []);
    assert.equal(c.filters.tag, 'alpha,beta'); c.filter({ mode: 'all' }); assert.deepEqual(titles(c), ['Exact', 'Other category']);
    await c.refresh(); assert.equal(c.filters.tag, 'alpha,beta'); assert.equal(c.session().values.topic, 'private in-memory value'); c.dispose();
});
