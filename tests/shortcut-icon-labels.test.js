const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('newtab.js', 'utf8');
const opening = source.match(/<button type="button" class="icon-fetch-btn" id="refresh-icon-btn"[^\n]+>/)?.[0];

for (const [locale, expected] of [['en', 'Refresh icon from site'], ['zh_CN', '刷新网站图标']]) {
    test(`${locale}: actual refresh-button template has a readable localized title`, () => {
        const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        const calls = [];
        const context = {
            window: {},
            chrome: { i18n: { getMessage(key) { calls.push(key); return messages[key]?.message || ''; } } },
            fetch() { assert.fail('label rendering must not fetch an icon'); }
        };
        vm.createContext(context);
        vm.runInContext(fs.readFileSync('i18n.js', 'utf8'), context);
        context.i18n = context.window.i18n;
        assert.ok(opening, 'use the actual existing button template');
        const rendered = vm.runInContext('`' + opening + '`', context);
        assert.ok(rendered.includes(`title="${expected}"`), rendered);
        assert.ok(!rendered.includes('title="refreshIcon"'));
        assert.deepEqual(calls, ['refreshIcon']);
        assert.equal(messages.refreshIcon.message, expected);
        assert.ok(rendered.includes('type="button"'));
        assert.ok(rendered.includes('id="refresh-icon-btn"'));
    });
}
