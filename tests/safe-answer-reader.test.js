const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), crypto = require('node:crypto');
const { createDocument } = require('./helpers/task-dom-model');
function setup() {
    const doc = createDocument(), root = { marked: require('../vendor/marked/marked.umd.js') };
    const forbidden = () => { throw Error('Network or HTML renderer must not run'); };
    vm.runInNewContext(fs.readFileSync('shared/safe-answer-reader.js', 'utf8'), { window: root, fetch: forbidden, XMLHttpRequest: forbidden, WebSocket: forbidden });
    return { doc, api: root.LocalItabSafeAnswerReader, root };
}
const text = node => (node.textContent || '') + node.children.map(text).join('');
test('reader creates semantic whitelist blocks, inline text, inert links/images and scroll wrappers', () => {
    const { doc, api } = setup();
    const source = '# Heading\n\nA **strong** and *emphasis* `code`.\n\n> Quote\n\n3. First\n4. Second\n\n- [x] Done\n\n```js\nconst x = "<script>";\n```\n\n| Column | Value |\n| --- | --- |\n| A | B |\n\n[link](javascript:alert(1)) ![alt](https://invalid.example/tracker.png)';
    const result = api.render(doc, source); assert.equal(result.fallback, false);
    for (const tag of ['h1', 'p', 'strong', 'em', 'code', 'blockquote', 'ol', 'ul', 'li', 'pre', 'table', 'th', 'td']) assert(result.node.querySelector(tag), tag);
    assert.equal(result.node.querySelector('ol').start, 3);
    assert.equal(result.node.querySelector('pre').tabIndex, 0);
    assert.equal(result.node.querySelector('.answer-reader-table').tabIndex, 0);
    assert(text(result.node).includes('javascript:alert(1)')); assert(text(result.node).includes('https://invalid.example/tracker.png'));
    assert.equal(result.node.querySelectorAll('a,img,script,iframe,svg,math,style,input').length, 0);
});
test('HTML, dangerous URLs, entity text and escaped markup cannot create attributes or requests', () => {
    const { doc, api } = setup();
    const source = '<svg onload=alert(1)><script>bad()</script></svg>\n\n<img src=x onerror=alert(1)>\n\n[x](data:text/html,evil) [x](file:///tmp/x) [x](javascript:alert(1))\n\n![pixel](https://invalid.example/a) &lt;img&gt; \\*literal\\*';
    const result = api.render(doc, source); assert.equal(result.fallback, false);
    assert(text(result.node).includes('<svg onload=alert(1)>'));
    for (const node of [result.node, ...result.node.querySelectorAll('*')]) {
        assert(!['A', 'IMG', 'SCRIPT', 'SVG', 'MATH', 'IFRAME', 'STYLE'].includes(node.tagName));
        assert.equal(node.href, undefined); assert.equal(node.src, undefined);
        assert.deepEqual(node.attributes, {});
    }
});
test('32k plain response, incomplete fence, wide table stay complete; hostile nesting and punctuation fall back fast', () => {
    const { doc, api } = setup();
    for (const source of ['a'.repeat(32000), '```\n<svg>unclosed', '| A | B |\n| --- | --- |\n| '+ 'wide'.repeat(7000) + ' | value |']) {
        const result = api.render(doc, source); assert.equal(result.fallback, false); assert(text(result.node).includes(source.startsWith('|') ? 'wide'.repeat(7000) : source.startsWith('```') ? '<svg>unclosed' : source));
    }
    for (const source of ['> '.repeat(100) + 'deep', '*a '.repeat(10000), '['.repeat(16000) + ']'.repeat(16000), 'x'.repeat(32001)]) {
        const start = Date.now(), result = api.render(doc, source);
        assert.equal(result.fallback, true); assert.equal(result.node.textContent, source); assert(Date.now() - start < 1000);
    }
});
test('token, nesting and DOM budgets fail closed with entire original; parser failure does too', () => {
    const { doc, api, root } = setup(), original = root.marked;
    for (const tokens of [Array.from({ length: 6001 }, () => ({ type: 'text', text: 'x' })), [{ type: 'table', header: [], rows: Array.from({ length: 8100 }, () => []) }]]) {
        root.marked = { Lexer: class { lex() { return tokens; } } };
        const result = api.render(doc, 'exact\r\noriginal'); assert.equal(result.fallback, true); assert.equal(result.node.textContent, 'exact\r\noriginal');
    }
    root.marked = { Lexer: class { lex() { throw Error('failure'); } } }; assert.equal(api.render(doc, 'untouched').node.textContent, 'untouched');
    root.marked = original;
});
test('reading/original toggles do not reparse or mutate source; detached/destroyed actions are inert', () => {
    const { doc, api, root } = setup(); let calls = 0;
    const Lexer = root.marked.Lexer; root.marked = { Lexer: class extends Lexer { lex(source) { calls++; return super.lex(source); } } };
    const source = '  # Exact\r\n\n**raw** 中文 🧪\t  ', reader = api.create(doc, source);
    doc.body.append(reader.node); const [read, raw] = reader.node.querySelectorAll('button');
    assert.equal(calls, 1); raw.dispatch('click');
    assert.equal(reader.node.querySelector('.answer-reader-source').textContent, source);
    assert.equal(raw.getAttribute('aria-pressed'), 'true'); read.dispatch('click'); raw.dispatch('click'); assert.equal(calls, 1);
    reader.destroy(); read.dispatch('click'); assert.equal(reader.node.children.length, 0); assert.equal(calls, 1);
});
test('fixed official dependency, complete MIT license and exact package allowlist remain verifiable', () => {
    const provenance = JSON.parse(fs.readFileSync('vendor/marked/PROVENANCE.json'));
    assert.equal(provenance.version, '18.1.1');
    assert.equal(provenance.source, 'https://registry.npmjs.org/marked/-/marked-18.1.1.tgz');
    const bytes = fs.readFileSync('vendor/marked/marked.umd.js');
    assert.equal(bytes.length, provenance.vendoredBytes);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), provenance.vendoredSha256);
    const license = fs.readFileSync('vendor/marked/LICENSE');
    assert.match(license.toString(), /Permission is hereby granted, free of charge/);
    assert.equal(crypto.createHash('sha256').update(license).digest('hex'), provenance.licenseSha256);
    for (const page of ['newtab.html', 'collections.html', 'prompts.html']) {
        const html = fs.readFileSync(page, 'utf8'); assert(html.indexOf('vendor/marked/marked.umd.js') < html.indexOf('shared/safe-answer-reader.js'));
    }
});
