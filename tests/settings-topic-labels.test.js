'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createDocument} = require('./helpers/task-dom-model');

const html = fs.readFileSync('options.html', 'utf8');
const groups = ['baidu', 'weibo', 'zhihu'];

function topicSection(group) {
    const fragment = html.match(new RegExp(`<div class="topic-list" id="${group}-topics"[\\s\\S]*?<\\/button>\\s*<\\/div>`))?.[0];
    assert.ok(fragment, 'materialize the actual production section');
    const document = createDocument(), stack = [document.body];
    for (const token of fragment.matchAll(/<\/(\w+)\s*>|<(\w+)\b([^>]*)>|([^<]+)/g)) {
        if (token[1]) { stack.pop(); continue; }
        if (token[2]) {
            const node = document.createElement(token[2]);
            for (const [, name, value] of token[3].matchAll(/([\w-]+)="([^"]*)"/g)) {
                node.setAttribute(name, value);
                if (['id', 'type', 'class'].includes(name)) node[name === 'class' ? 'className' : name] = value;
                if (name.startsWith('data-')) node.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
            }
            stack.at(-1).append(node);
            if (token[2] !== 'input') stack.push(node);
        } else if (token[4].trim()) stack.at(-1).textContent = token[4];
    }
    return document;
}

for (const [locale, expected] of [['en', ['Topic title', 'Score']], ['zh_CN', ['热榜标题', '分数']]]) {
    for (const group of groups) test(`${locale}/${group}: filled topic fields keep visible associated labels without changing drafts`, () => {
        const document = topicSection(group);
        const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        let io = 0;
        const unexpectedIO = () => { ++io; assert.fail('label localization performs no I/O'); };
        const context = vm.createContext({document, window: {}, fetch: unexpectedIO,
            chrome: {i18n: {getMessage: key => messages[key]?.message || ''}, storage: {local: {get: unexpectedIO, set: unexpectedIO}}}});
        vm.runInContext(fs.readFileSync('i18n.js', 'utf8'), context);
        const inputs = ['title', 'score'].map(kind => document.querySelector(`.topic-${kind}-input`));
        inputs[0].value = '  Synthetic $& <raw> 中文  '; inputs[1].value = '42'; inputs[1].focus();
        const drafts = inputs.map(input => input.value), focused = document.activeElement;
        for (let pass = 0; pass < 2; ++pass) {
            context.window.i18n.localizeDocument(document);
            for (const [index, kind] of ['title', 'score'].entries()) {
                const input = inputs[index], id = `${group}-topic-${kind}`;
                assert.equal(input.id, id, 'stable unique ID for native label association');
                assert.equal([...html.matchAll(/\bid="([^"]+)"/g)].filter(match => match[1] === id).length, 1);
                const label = document.querySelector(`label[for="${id}"]`);
                assert.ok(label, 'a real visible label, not only a disappearing placeholder');
                assert.equal(label.textContent, expected[index]);
                assert.equal(label.className, 'form-label');
                assert.ok(label.getAttribute('hidden') == null);
                assert.ok(label.getAttribute('aria-hidden') == null);
                assert.ok(label.getAttribute('style') == null);
                assert.equal(input.getAttribute('placeholder'), expected[index]);
                assert.equal(input.type, index ? 'number' : 'text');
                assert.equal(input.className, `form-input topic-${kind}-input`);
            }
            assert.deepEqual(inputs.map(input => input.value), drafts);
            assert.ok(document.activeElement === focused);
        }
        const add = document.querySelector('.add-topic-btn');
        assert.equal(add.type, 'button'); assert.equal(add.textContent, messages.add.message);
        assert.equal(document.querySelectorAll('.add-topic-btn').length, 1);
        assert.equal(io, 0);
    });
}
