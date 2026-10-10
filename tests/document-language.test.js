const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('i18n.js', 'utf8');
const catalogs = Object.fromEntries(['en', 'zh_CN'].map(locale =>
    [locale, JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'))]));
function element() {
    const attributes = {'data-i18n': 'saveSettings', 'data-i18n-title': 'saveSettings',
        'data-i18n-placeholder': 'saveSettings', 'data-i18n-aria-label': 'saveSettings'};
    return {textContent: '', attributes, getAttribute: key => attributes[key],
        setAttribute(key, value) { attributes[key] = value; }};
}
function documentModel() {
    const label = element();
    return {documentElement: {lang: 'en'}, label, querySelectorAll: () => [label]};
}
function fixture(locale = 'en', api) {
    const document = documentModel();
    const blocked = () => { throw new Error('Unexpected I/O or browser locale access'); };
    let active = locale;
    const context = {document, window: {}, navigator: {get language() { return blocked(); }},
        fetch: blocked, XMLHttpRequest: blocked, localStorage: new Proxy({}, {get: blocked})};
    if (api !== null) context.chrome = {i18n: api || {
        getMessage: key => catalogs[active][key]?.message || '', getUILanguage: blocked
    }, storage: new Proxy({}, {get: blocked}), runtime: new Proxy({}, {get: blocked})};
    vm.runInNewContext(source, context);
    return {document, helper: context.window.i18n, locale: value => { active = value; }};
}
for (const [locale, expected] of [['en', 'en'], ['zh_CN', 'zh-CN']]) {
    test(`initial ${locale} localization sets language and preserves text/attribute semantics`, () => {
        const f = fixture(locale);
        f.helper.localizeDocument();
        assert.equal(f.document.documentElement.lang, expected);
        assert.equal(f.document.label.textContent, catalogs[locale].saveSettings.message);
        for (const key of ['title', 'placeholder', 'aria-label']) {
            assert.equal(f.document.label.attributes[key], catalogs[locale].saveSettings.message);
        }
        assert.equal(f.helper.t('missing-key'), 'missing-key');
    });
}
test('repeated whole-document localization follows changed catalog without I/O', () => {
    const f = fixture();
    for (const [locale, expected] of [['zh_CN', 'zh-CN'], ['en', 'en'], ['zh_CN', 'zh-CN']]) {
        f.locale(locale); f.helper.localizeDocument(f.document);
        assert.equal(f.document.documentElement.lang, expected);
    }
});
test('unsupported Chinese UI locale with English catalog remains English', () => {
    const f = fixture('en', {getMessage: key => catalogs.en[key]?.message || '', getUILanguage: () => 'zh-TW'});
    f.helper.localizeDocument();
    assert.equal(f.document.documentElement.lang, 'en');
    assert.equal(f.document.label.textContent, 'Save Settings');
});
test('missing and throwing APIs safely restore English metadata', () => {
    for (const api of [null, {}, {getMessage() { throw new Error('unavailable'); }}]) {
        const f = fixture('en', api); f.document.documentElement.lang = 'zh-CN';
        f.helper.localizeDocument();
        assert.equal(f.document.documentElement.lang, 'en');
        assert.equal(f.document.label.textContent, 'saveSettings');
    }
});
test('absent, invalid and unsupported catalog codes fall back to English', () => {
    for (const code of ['', null, undefined, {}, 3, '@@ui_locale', 'documentLanguage', 'zh_CN', 'zh-TW', 'en<script>', ' zh-CN ']) {
        const f = fixture('en', {getMessage: key => key === 'documentLanguage' ? code : ''});
        f.document.documentElement.lang = 'zh-CN'; f.helper.localizeDocument();
        assert.equal(f.document.documentElement.lang, 'en');
    }
});
test('scoped element and fragment localization updates only their owner document', () => {
    for (const nodeType of [1, 11]) {
        const f = fixture('zh_CN'); const owner = documentModel(); const label = element();
        const root = {nodeType, ownerDocument: owner, querySelectorAll: () => [label]};
        f.helper.localizeDocument(root);
        assert.equal(owner.documentElement.lang, 'zh-CN');
        assert.equal(f.document.documentElement.lang, 'en');
        assert.equal(label.textContent, catalogs.zh_CN.saveSettings.message);
        assert.equal(owner.label.textContent, '');
    }
});
test('explicit other document root updates that document only', () => {
    const f = fixture('zh_CN'); const other = documentModel();
    f.helper.localizeDocument(other);
    assert.equal(other.documentElement.lang, 'zh-CN');
    assert.equal(f.document.documentElement.lang, 'en');
});
test('inert roots and document models without an HTML element remain safe', () => {
    const f = fixture('zh_CN');
    for (const root of [{}, {querySelectorAll: true}, {querySelectorAll: () => []},
        {ownerDocument: {}, querySelectorAll: () => []}]) {
        assert.doesNotThrow(() => f.helper.localizeDocument(root));
        assert.equal(f.document.documentElement.lang, 'en');
    }
    f.helper.localizeDocument(null);
    assert.equal(f.document.documentElement.lang, 'zh-CN');
});
test('both production pages load the actual helper and localize their document', () => {
    for (const page of ['newtab', 'options']) {
        const html = fs.readFileSync(`${page}.html`, 'utf8');
        assert.match(html, /<html\b[^>]*lang="en"/);
        assert(html.indexOf('src="i18n.js"') < html.indexOf(`src="${page}.js"`));
        assert.match(fs.readFileSync(`${page}.js`, 'utf8'), /window\.i18n\.localizeDocument\(document\)/);
    }
});
