const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto'), fs = require('node:fs');
const sites = require('../shared/navigation-sites').map(require('./helpers/navigation-ai-pricing-review').beforeAiPricingReview), Catalog = require('../shared/navigation-catalog');
const added = sites.slice(141, 146);
const ids = ['datawrapper', 'wikimedia-commons', 'worldcat', 'typst', 'pdf24-tools'];
const key = tag => 'navigationTag' + tag.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('');

test('report and research tools preserve all 141 prior records and append five unique reviewed entries', () => {
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(sites.slice(0, 141))).digest('hex'), '421b2cc0359df964537317904b6b1859f9f47987b2196f2296b9fabbebd1dfc2');
    assert.deepEqual(added.map(site => site.id), ids);
    assert.equal(sites.length, 149);
    assert.equal(new Set(sites.map(site => site.id)).size, 149);
    assert.equal(new Set(sites.map(site => Catalog.canonicalURL(site.url))).size, 149);
    assert.equal(Catalog.categories.length, 18);
    assert.equal(new Set(sites.flatMap(site => site.tags)).size, 218);
    assert.equal(Catalog.validate(sites), true);
    const oldTags = new Set(sites.slice(0, 141).flatMap(site => site.tags));
    assert.deepEqual([...new Set(added.flatMap(site => site.tags).filter(tag => !oldTags.has(tag)))], ['charts', 'map-visualization', 'media-assets', 'open-licensed-media', 'library-search', 'typesetting', 'pdf-ocr', 'pdf-comparison']);
    for (const site of added) {
        assert.equal(site.verifiedOn, '2026-10-13');
        assert.equal(site.language, 'unknown'); assert.equal(site.signup, 'unknown');
        assert.match(site.icon, /^[A-Z]{2}$/);
        assert.equal(new Set(site.sources).size, site.sources.length);
        assert.ok(site.sources.every(source => source.startsWith('https://') && !/[?&](utm_|src=)/.test(source)));
    }
});

test('new names, Chinese aliases and every bilingual purpose compose with exact filters and AND search', () => {
    for (const [locale, language] of [['en', 'en'], ['zh_CN', 'zh']]) {
        const dictionary = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));
        const label = tag => dictionary[key(tag)]?.message;
        for (const site of added) {
            for (const query of [site.name, ...site.searchAliases]) assert.ok(Catalog.filter(sites, {query}, language, label).some(result => result.id === site.id), query);
            for (const tag of site.tags) {
                assert.ok(label(tag), `${locale}/${tag}`);
                const criteria = {query: label(tag), tag, category: site.categories[0], company: site.company, country: site.country, pricing: site.pricing};
                assert.deepEqual(Catalog.filter(sites, criteria, language, label), [site]);
                for (const field of ['category', 'tag', 'company', 'country', 'pricing']) assert.deepEqual(Catalog.filter(sites, {...criteria, [field]: 'nonmatching84920912'}, language, label), []);
                assert.deepEqual(Catalog.filter(sites, {...criteria, query: criteria.query + ' missing84920912'}, language, label), []);
            }
        }
    }
    for (const [query, id] of [['Datawrapper maps', ids[0]], ['维基共享资源', ids[1]], ['WorldCat editions', ids[2]], ['全球图书馆目录', ids[2]], ['Typst 排版', ids[3]], ['PDF24 扫描', ids[4]]]) assert.ok(Catalog.filter(sites, {query}, 'zh').some(site => site.id === id), query);
});

test('official pricing and privacy descriptions distinguish scope, licenses and hosted services', () => {
    const [datawrapper, commons, worldcat, typst, pdf24] = added;
    assert.deepEqual(added.map(site => site.country), ['DE', 'US', 'US', 'DE', 'DE']);
    assert.deepEqual(added.map(site => site.pricing), ['freemium', 'free', 'free', 'freemium', 'free']);
    assert.match(datawrapper.pricingNote.en, /with attribution.*Paid plans.*API usage beyond included free allowances is billed separately/);
    assert.match(commons.pricingNote.en, /each file’s license.*attribution or share-alike/i);
    assert.match(commons.pricingNote.zh, /每个文件的许可.*署名/);
    assert.match(worldcat.pricingNote.en, /search is free.*full-text access.*depend/);
    assert.match(worldcat.pricingNote.zh, /全文访问.*提供方决定/);
    assert.match(typst.pricingNote.en, /free web plan.*limits.*Paid plans.*open-source compiler is free/);
    assert.match(pdf24.pricingNote.en, /Some online tools upload files.*comparison tool runs in the browser.*Windows Creator.*offline/);
    assert.match(pdf24.pricingNote.zh, /部分在线工具会上传文件.*对比工具在浏览器中运行/);
    for (const [site, source] of [[datawrapper, 'https://www.datawrapper.de/pricing'], [commons, 'https://commons.wikimedia.org/wiki/Commons:Welcome'], [worldcat, 'https://www.oclc.org/en/annual-report/2025/home.html'], [typst, 'https://typst.app/pricing/'], [pdf24, 'https://tools.pdf24.org/en/compare-pdf']]) assert.ok(site.sources.includes(source));
});
