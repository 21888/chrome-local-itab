const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('Settings quote helper uses the active English or Chinese catalog', () => {
    const html = fs.readFileSync('options.html', 'utf8');
    const helper = html.match(/<small\b[^>]*data-i18n="quoteTextHint"[^>]*>([^<]+)<\/small>/);
    assert.ok(helper, 'quote helper is wired to the localization helper');
    assert.equal(helper[1], 'Displayed at the bottom of your dashboard');
    const source = fs.readFileSync('i18n.js', 'utf8');
    for (const [locale, expected] of [['en', 'Displayed at the bottom of your dashboard'], ['zh_CN', '显示在主页底部']]) {
        const catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        const element = {
            textContent: helper[1],
            getAttribute: name => name === 'data-i18n' ? 'quoteTextHint' : null
        };
        const context = {
            window: {},
            chrome: { i18n: { getMessage: key => catalog[key]?.message || '' } },
            document: { querySelectorAll: () => [element] }
        };
        vm.createContext(context);
        vm.runInContext(source, context);
        context.window.i18n.localizeDocument();
        assert.equal(element.textContent, expected);
    }
});
