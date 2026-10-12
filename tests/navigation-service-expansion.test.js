const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const Catalog = require('../shared/navigation-catalog'), sites = require('../shared/navigation-sites');
const { beforeChineseAliasReview } = require('./helpers/navigation-chinese-alias-review');
const ids = ['google-scholar', 'tunein', 'stack-exchange', 'ebay', 'rome2rio', '17track'];
const added = sites.slice(108, 114);
const key = tag => 'navigationTag' + tag.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('');
test('six useful services append to the reviewed catalog without new categories or metadata schema', () => {
    assert.deepEqual(added.map(site => site.id), ids);
    assert.equal(sites.length, 124); assert.equal(Catalog.categories.length, 18);
    assert.equal(new Set(sites.flatMap(site => site.tags)).size, 186);
    const fields = ['id','name','url','company','country','categories','description','tags','pricing','pricingNote','language','signup','sources','verifiedOn','icon'].sort();
    for (const site of added) {
        assert.deepEqual(Object.keys(beforeChineseAliasReview(site)).sort(), fields, site.id);
        assert.equal(site.verifiedOn, '2026-10-12');
        assert.equal(site.language, 'unknown'); assert.equal(site.signup, 'unknown');
    }
    assert.equal(Catalog.validate(sites), true);
});
test('each new use has bilingual labels and combines with exact category, company, country and pricing filters', () => {
    for (const [locale, language] of [['en','en'], ['zh_CN','zh']]) {
        const dictionary = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));
        const label = tag => dictionary[key(tag)]?.message;
        for (const site of added) for (const tag of site.tags) {
            assert.ok(label(tag), `${locale}/${tag}`);
            assert.deepEqual(Catalog.filter(sites, {query: label(tag), tag, company: site.company,
                country: site.country, pricing: site.pricing, category: site.categories[0]}, language, label), [site]);
        }
    }
    for (const [query,id] of [['学术 论文','google-scholar'],['网络 广播','tunein'],['专题 问答','stack-exchange'],['二手 收藏','ebay'],['火车 轮渡','rome2rio'],['包裹 物流','17track'],['GoogleScholar','google-scholar'],['Rome 2 Rio','rome2rio'],['１７ＴＲＡＣＫ','17track']])
        assert.ok(Catalog.filter(sites,{query},'zh').some(site => site.id === id), query);
});
test('service pricing stays scoped and regional privacy entities do not become a global operator claim', () => {
    assert.deepEqual(added.map(site => site.pricing), ['unknown','freemium','free','not_applicable','unknown','freemium']);
    const byId = id => added.find(site => site.id === id);
    assert.match(byId('google-scholar').pricingNote.en, /full text is not always free/);
    assert.match(byId('stack-exchange').pricingNote.en, /excludes enterprise/);
    assert.match(byId('ebay').pricingNote.en, /purchase commitment/);
    assert.match(byId('rome2rio').pricingNote.en, /Confirm fares, schedules/);
    assert.equal(byId('17track').country, 'unknown'); assert.equal(byId('17track').company, '17TRACK');
    assert.match(byId('17track').pricingNote.en, /separate plans and limits/);
    for (const site of added) for (const text of Object.values(site.pricingNote)) assert.doesNotMatch(text, /\d|unlimited|guaranteed|不限量|保证/);
});
