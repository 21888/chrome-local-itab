'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createDocument} = require('./helpers/task-dom-model');

const html = fs.readFileSync('options.html', 'utf8');

for (const [locale, expected] of [['en', 'Quote Text'], ['zh_CN', '引用文案']]) {
    test(`${locale}: persistent quote label names the existing input without changing its draft`, () => {
        const fragment = html.match(/<label[^>]*data-i18n="quoteText"[^>]*>[\s\S]*?<\/small>/)?.[0];
        assert.ok(fragment, 'use the actual quote field markup');
        const document = createDocument();
        for (const [, tag, attributes, text] of fragment.matchAll(/<(label|input|small)\b([^>]*)>([^<]*)/g)) {
            const node = document.createElement(tag);
            for (const [, name, value] of attributes.matchAll(/([\w-]+)="([^"]*)"/g)) {
                node.setAttribute(name, value);
                if (['id', 'type', 'class'].includes(name)) node[name === 'class' ? 'className' : name] = value;
                if (name.startsWith('data-')) node.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
            }
            node.textContent = text; document.body.append(node);
        }
        const input = document.querySelector('#quote-text');
        assert.ok(input);
        assert.equal([...html.matchAll(/\bid="quote-text"/g)].length, 1);
        assert.equal(input.type, 'text');
        assert.equal(input.className, 'form-input');
        assert.equal(input.getAttribute('placeholder'), 'Your inspirational quote');
        assert.ok(input.getAttribute('aria-label') == null);
        assert.ok(input.getAttribute('aria-labelledby') == null);
        const label = document.querySelector('label[for="quote-text"]');
        assert.ok(label, 'visible label must be associated with the quote field');
        assert.equal(label.className, 'form-label');
        for (const name of ['hidden', 'aria-hidden', 'style']) assert.ok(label.getAttribute(name) == null);
        const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        const unexpectedIO = () => assert.fail('localization must not read or save content');
        const context = vm.createContext({document, window: {}, fetch: unexpectedIO,
            chrome: {i18n: {getMessage: key => messages[key]?.message || ''}, storage: {local: {get: unexpectedIO, set: unexpectedIO}}}});
        vm.runInContext(fs.readFileSync('i18n.js', 'utf8'), context);
        input.value = '  Synthetic $& <raw> 中文 🧪  '; input.focus();
        for (let pass = 0; pass < 2; ++pass) {
            context.window.i18n.localizeDocument(document);
            assert.equal(label.textContent, expected);
            assert.equal(document.querySelector('small').textContent, messages.quoteTextHint.message);
            assert.equal(input.value, '  Synthetic $& <raw> 中文 🧪  ');
            assert.ok(document.activeElement === input);
            assert.equal(label.getAttribute('for'), input.id);
        }
    });
}
