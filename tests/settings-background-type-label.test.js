'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createDocument} = require('./helpers/task-dom-model');
const html = fs.readFileSync('options.html', 'utf8');
for (const locale of ['en', 'zh_CN']) {
    test(`${locale}: background type visible label names the unchanged select`, () => {
        const fragment = html.match(/<label[^>]*data-i18n="bgType"[^>]*>[\s\S]*?<\/select>/)?.[0];
        assert.ok(fragment);
        const document = createDocument();
        let select;
        for (const [, tag, attributes, text] of fragment.matchAll(/<(label|select|option)\b([^>]*)>([^<]*)/g)) {
            const node = document.createElement(tag);
            for (const [, name, value] of attributes.matchAll(/([\w-]+)="([^"]*)"/g)) {
                node.setAttribute(name, value);
                if (['id', 'class', 'value'].includes(name)) node[name === 'class' ? 'className' : name] = value;
                if (name === 'data-i18n') node.dataset.i18n = value;
            }
            node.textContent = text;
            if (tag === 'option') select.append(node);
            else document.body.append(node);
            if (tag === 'select') select = node;
        }
        assert.equal([...html.matchAll(/\bid="bg-type"/g)].length, 1);
        assert.equal(select.id, 'bg-type');
        assert.equal(select.className, 'form-select');
        assert.deepEqual([...select.children].map(n => n.value), ['gradient', 'color', 'image']);
        const label = document.querySelector('label[for="bg-type"]');
        assert.ok(label, 'visible label must reference existing select');
        assert.equal(label.className, 'form-label');
        for (const name of ['hidden', 'aria-hidden', 'style']) assert.ok(label.getAttribute(name) == null);
        const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        const unexpectedIO = () => assert.fail('localization must not access network or storage');
        const context = vm.createContext({document, window: {}, fetch: unexpectedIO,
            chrome: {i18n: {getMessage: key => messages[key]?.message || ''}, storage: {local: {get: unexpectedIO, set: unexpectedIO}}}});
        vm.runInContext(fs.readFileSync('i18n.js', 'utf8'), context);
        select.value = 'color'; select.focus();
        for (let pass = 0; pass < 2; pass++) {
            context.window.i18n.localizeDocument(document);
            assert.equal(label.textContent, messages.bgType.message);
            assert.equal(select.value, 'color');
            assert.ok(document.activeElement === select);
            assert.equal(label.getAttribute('for'), select.id);
        }
    });
}
