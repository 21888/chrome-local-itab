const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Controller, catalogLookup } = require('../shared/shortcut-finder');
const catalog = require('../shared/navigation-catalog');
const sites = require('../shared/navigation-sites');
const { createDocument, deferred } = require('./helpers/finder-dom-model');
const clone = value => JSON.parse(JSON.stringify(value));
const deepL = sites.find(site => site.id === 'deepl');
const saved = (url = deepL.url, n = 1) => ({ title: 'Saved tool', url, category: 'work', layoutId: `saved_${n}` });
function label(locale) {
    const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    return tag => messages[`navigationTag${tag.split(/[-_]/).map(part => part[0].toUpperCase() + part.slice(1)).join('')}`]?.message || tag.replace(/[-_]/g, ' ');
}
function setup(links = [saved()], locale = 'zh_CN', extra = {}) {
    const snapshot = { links, categories: [{ id: 'work', name: 'Work' }] };
    const c = new Controller({ getSnapshot: () => snapshot, getCatalogFields: catalogLookup(catalog, sites, label(locale)), activate() {}, ...extra });
    return { c, snapshot };
}
test('exact saved catalog URLs gain raw and localized uses without modifying records or catalog', () => {
    const { c, snapshot } = setup(); const before = JSON.stringify(snapshot), catalogBefore = JSON.stringify(sites);
    for (const query of ['翻译', 'translation', 'text-translation']) {
        const result = c.search(query); assert.equal(result.total, 1); assert(result.rows[0].catalogMatches.length);
        assert.equal(result.rows[0].token.reference, snapshot.links[0]);
    }
    assert.equal(c.search('Saved tool').rows[0].catalogMatches.length, 0);
    assert.equal(setup([], 'en').c.search('translation').total, 0);
    assert.equal(JSON.stringify(snapshot), before); assert.equal(JSON.stringify(sites), catalogBefore);
});
test('canonical association preserves full path, query, fragment, scheme and authority', () => {
    const exact = 'https://WWW.DEEPL.COM:443/translator';
    const variants = [deepL.url + '/', deepL.url + '?x=1', deepL.url + '#x', 'https://www.deepl.com/', 'http://www.deepl.com/translator', 'https://deepl.com/translator', 'www.deepl.com/translator', 'https://user@www.deepl.com/translator', 'https://www.deepl.com.evil.invalid/translator'];
    const { c } = setup([saved(exact), ...variants.map((url, i) => saved(url, i + 2))]);
    assert.deepEqual(c.search('翻译').rows.map(row => row.url), [exact, 'www.deepl.com/translator']);
    assert.equal(c.search('translator').total, 9, 'ordinary URL searching remains unchanged');
});
test('phrase stays within individual fields; all words may span original and built-in fields', () => {
    const { c } = setup();
    assert.equal(c.search('Saved 翻译').total, 0);
    assert.equal(c.search('Saved 翻译', 0, '', 'all-words').total, 1);
    assert.equal(c.search('translation document-translation', 0, '', 'phrase').total, 0);
    assert.equal(c.search('translation document-translation', 0, '', 'all-words').total, 1);
    for (const query of ['"翻译"', '翻译 OR-not', '-翻译', 'translation|']) assert.equal(c.search(query, 0, '', 'all-words').total, 0);
    assert.equal(c.search('翻译 unknown', 0, '', 'all-words').total, 0);
    assert.equal(c.search('翻译 OR', 0, '', 'all-words').total, 1);
    assert.equal(c.search('翻译 OR', 0, '', 'phrase').total, 0);
    c.getSnapshot().categories[0].name = 'Jobs';
    assert.equal(c.search('翻译 OR', 0, '', 'all-words').total, 1, 'translator URL also contains literal or');
    assert(deepL.url.toLowerCase().includes('or'));
    assert.equal(c.search('翻译 Work', 0, '', 'all-words').total, 0);
});
test('current workspace, categories, saved ordering and fifty-row paging remain intact', () => {
    const links = Array.from({ length: 103 }, (_, i) => saved(deepL.url, i));
    const { c, snapshot } = setup(links);
    let result = c.search('翻译'); assert.equal(result.total, 103); assert.equal(result.rows.length, 50); assert.equal(result.categoryOptions[0].count, 103);
    result = c.search('翻译', 2); assert.equal(result.rows.length, 3); assert.equal(result.rows[0].token.reference, links[100]);
    assert.equal(c.search('翻译', 0, 'missing').total, 0);
    snapshot.links = []; assert.equal(c.search('翻译').total, 0);
});
test('missing or invalid catalog falls back to ordinary saved-site search', () => {
    for (const [api, entries] of [[undefined, undefined], [catalog, []], [catalog, [...sites, sites[0]]]]) {
        const { c } = setup(undefined, 'en', { getCatalogFields: catalogLookup(api, entries) });
        assert.equal(c.search('翻译').total, 0); assert.equal(c.search('Saved tool').total, 1);
    }
});
test('catalog matches retain stale/fresh identity and cancellation protections', async () => {
    for (const mutation of [links => links.splice(0), links => { links[0].url += '?changed'; }, links => { links[0].title = 'changed'; }]) {
        const fresh = [saved()]; let opens = 0, closes = 0;
        const { c } = setup([saved()], 'zh_CN', { readSnapshot: async () => ({ links: fresh }), reserve: () => ({ open() { opens++; }, close() { closes++; } }) });
        const row = c.search('翻译').rows[0]; mutation(fresh);
        assert.equal(await c.activate(row.token), 'stale'); assert.equal(opens, 0); assert.equal(closes, 1);
    }
    const wait = deferred(); let opens = 0, closes = 0;
    const { c, snapshot } = setup([saved()], 'zh_CN', { readSnapshot: () => wait.promise, reserve: () => ({ open() { opens++; }, close() { closes++; } }) });
    const action = c.activate(c.search('翻译').rows[0].token); c.clear(); wait.resolve(clone(snapshot));
    assert.equal(await action, 'cancelled'); assert.equal(opens, 0); assert.equal(closes, 1);
    const legacy = { title: 'Saved tool', url: deepL.url };
    const duplicate = setup([legacy, { ...legacy }]);
    assert.equal(await duplicate.c.activate(duplicate.c.search('翻译').rows[0].token), 'stale');
});
test('actual view renders localized provenance as text only when built-in fields contribute', () => {
    for (const locale of ['en', 'zh_CN']) {
        const document = createDocument(), host = document.createElement('header'); document.body.append(host);
        const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        const context = { window: null, document, URL, i18n: { t: key => messages[key]?.message || key }, LocalItabNavigationCatalog: catalog, LocalItabNavigationSites: sites };
        context.window = context; vm.createContext(context);
        for (const file of ['dialog-focus', 'shortcut-finder', 'shortcut-finder-view']) vm.runInContext(fs.readFileSync(`shared/${file}.js`, 'utf8'), context);
        const view = context.LocalItabFinder.mount(host, { getSnapshot: () => ({ links: [saved()], categories: [] }), getCatalogFields: catalogLookup(catalog, sites, label(locale)) });
        host.querySelector('button').dispatch('click'); const input = document.querySelector('input');
        input.value = locale === 'en' ? 'translation' : '翻译'; input.dispatch('input');
        const provenance = document.querySelector('.finder-catalog-match'); assert(provenance); assert(provenance.textContent.startsWith(messages.finderCatalogMatch.message + ': '));
        input.value = 'Saved'; input.dispatch('input'); assert.equal(document.querySelector('.finder-catalog-match'), null);
        view.destroy();
    }
});
test('site aliases require the exact catalog path and never extend to other pages on the same host', () => {
    for (const [id, alias] of [['google', '谷歌'], ['linkedin-jobs', '领英']]) {
        const site = sites.find(entry => entry.id === id);
        const other = new URL('/unlisted-page', site.url).href;
        const { c } = setup([saved(site.url), saved(other, 2)]);
        const result = c.search(alias);
        assert.equal(result.total, 1);
        assert.equal(result.rows[0].url, site.url);
        assert(result.rows[0].catalogMatches.includes(alias));
    }
});
