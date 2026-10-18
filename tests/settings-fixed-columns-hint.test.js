const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const source = fs.readFileSync('options.html', 'utf8');
const words = {
    en: 'Grid mode keeps this fixed number of shortcuts per row, even in narrow windows. Choose a smaller number for wider tiles and more readable titles. Free placement ignores this setting.',
    zh_CN: '网格模式固定每行的快捷方式数量，窄窗口也会保持。可调小数量，让卡片更宽、标题更易读。自由摆放不使用此设置。'
};
function controls() {
    const document = createDocument();
    const tags = [source.match(/<label\b[^>]*for="layout-columns"[^>]*>[^<]*<\/label>/)?.[0],
        source.match(/<input\b[^>]*id="layout-columns"[^>]*>/)?.[0],
        source.match(/<small\b[^>]*data-i18n="shortcutsPerRowDesc"[^>]*>[^<]*<\/small>/)?.[0]];
    const nodes = tags.map(markup => {
        assert(markup, 'use the actual settings markup');
        const node = document.createElement(markup.match(/^<(\w+)/)[1]);
        for (const [, name, value] of markup.matchAll(/([\w-]+)="([^"]*)"/g)) {
            node.setAttribute(name, value); if (name === 'id' || name === 'value' || name === 'type') node[name] = value;
            if (name.startsWith('data-')) node.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
        }
        node.textContent = markup.match(/>([^<]*)<\//)?.[1] || '';
        document.body.append(node); return node;
    });
    return { document, label: nodes[0], input: nodes[1], hint: nodes[2] };
}
test('fixed-column input describes its unchanged range/default through the visible English hint', () => {
    const {document, label, input, hint} = controls();
    assert.equal(label.getAttribute('for'), input.id);
    assert.equal(input.getAttribute('aria-describedby'), 'layout-columns-hint');
    assert.equal(document.getElementById(input.getAttribute('aria-describedby')), hint);
    assert.equal(hint.textContent, words.en);
    for (const [key, value] of Object.entries({type:'number',min:'1',max:'10',step:'1',value:'6'})) assert.equal(input.getAttribute(key), value);
    assert.equal(hint.getAttribute('hidden') ?? null, null); assert.equal(hint.getAttribute('aria-hidden') ?? null, null);
    assert.equal(hint.getAttribute('class'), 'form-hint');
    assert.equal(source.match(/id="layout-columns-hint"/g)?.length, 1);
});
for (const locale of ['en', 'zh_CN']) test(`${locale}: actual i18n localizes the associated fixed-column hint without changing draft or storage`, () => {
    const {document, input, hint} = controls();
    input.value = '4'; input.focus();
    const catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const calls = [];
    const chrome = {i18n:{getMessage:key=>catalog[key]?.message || ''},storage:{local:{get(){calls.push('get');throw Error('unexpected read');},set(){calls.push('set');throw Error('unexpected write');}}}};
    const window = {document};
    vm.runInNewContext(fs.readFileSync('i18n.js','utf8'), {window,document,chrome,fetch(){throw Error('unexpected network');}});
    window.i18n.localizeDocument(document);
    assert.equal(hint.textContent, words[locale]);
    assert.equal(document.getElementById(input.getAttribute('aria-describedby')), hint);
    assert.equal(input.value, '4'); assert.equal(document.activeElement, input);
    assert.deepEqual(calls, []);
});
