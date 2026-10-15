const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), crypto = require('node:crypto');
const Catalog = require('../shared/navigation-catalog'), sites = require('../shared/navigation-sites').map(require('./helpers/navigation-ai-pricing-review').beforeAiPricingReview);
const added = sites.slice(136,139), ids = ['inoreader', 'hacker-news', 'mastodon'];
const key = tag => 'navigationTag' + tag.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('');
test('news and social appends three records without changing the original 136', () => {
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(sites.slice(0, 136))).digest('hex'), '48423fd8a0846b0fdde25e46ed636e94658e719dd9c2159b4bdc522108d96698');
    assert.deepEqual(added.map(site => site.id), ids);
    assert.equal(sites.length, 146); assert.equal(Catalog.validate(sites), true);
    assert.equal(new Set(sites.map(site => site.id)).size, 146);
    assert.equal(new Set(sites.map(site => Catalog.canonicalURL(site.url))).size, 146);
    assert.equal(new Set(sites.flatMap(site => site.tags)).size, 218); assert.equal(Catalog.categories.length, 18);
    const oldTags = new Set(sites.slice(0, 136).flatMap(site => site.tags));
    assert.deepEqual([...new Set(added.flatMap(site => site.tags).filter(tag => !oldTags.has(tag)))], ['rss-reader', 'read-later', 'technology-news', 'federated-social']);
    for (const site of added) {
        assert.equal(site.verifiedOn, '2026-10-13'); assert.equal(site.language, 'unknown'); assert.equal(site.signup, 'unknown');
        assert.match(site.icon, /^[A-Z]{2}$/); assert.equal(new Set(site.sources).size, site.sources.length);
        for (const source of site.sources) { assert.ok(Catalog.canonicalURL(source)); assert.ok(source.startsWith('https://')); }
    }
});
test('news and social bilingual tags and aliases compose with every exact selector and AND search', () => {
    for (const [locale, language] of [['en', 'en'], ['zh_CN', 'zh']]) {
        const dictionary = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));
        const label = tag => dictionary[key(tag)]?.message;
        for (const site of added) for (const tag of site.tags) {
            assert.ok(label(tag));
            const criteria = {query: label(tag), tag, category: site.categories[0], company: site.company, country: site.country, pricing: site.pricing};
            assert.deepEqual(Catalog.filter(sites, criteria, language, label), [site]);
            for (const field of ['category', 'tag', 'company', 'country', 'pricing'])
                assert.deepEqual(Catalog.filter(sites, {...criteria, [field]: 'absent84920912'}, language, label), []);
            assert.deepEqual(Catalog.filter(sites, {...criteria, query: criteria.query + ' absent84920912'}, language, label), []);
        }
    }
    for (const [query, id] of [['Inoreader', ids[0]], ['RSS 阅读器', ids[0]], ['Ｉｎｏｒｅａｄｅｒ', ids[0]], ['HN', ids[1]], ['黑客新闻', ids[1]], ['Hacker News', ids[1]], ['Mastodon', ids[2]], ['长毛象', ids[2]], ['联邦 社交', ids[2]]])
        assert.ok(Catalog.filter(sites, {query}, 'zh').some(site => site.id === id), query);
});
test('operator countries and pricing distinguish accounts, paywalls and independent servers', () => {
    assert.deepEqual(added.map(site => site.company), ['Innologica Ltd', 'Y Combinator Management, LLC', 'Mastodon GmbH']);
    assert.deepEqual(added.map(site => site.country), ['BG', 'US', 'DE']);
    assert.deepEqual(added.map(site => site.pricing), ['freemium', 'free', 'free']);
    assert.deepEqual(added.map(site => site.categories), [['news', 'office'], ['news', 'social'], ['social']]);
    assert.match(added[0].pricingNote.en, /150 RSS feeds/); assert.match(added[0].pricingNote.en, /paid subscriptions renew automatically/i);
    assert.match(added[0].pricingNote.en, /publishers.*own access rules/);
    assert.match(added[1].pricingNote.en, /Public listings and discussions/); assert.match(added[1].pricingNote.en, /feature thresholds/);
    assert.match(added[1].pricingNote.en, /paywalls/); assert.match(added[1].pricingNote.en, /does not include access to every linked article/);
    assert.match(added[2].pricingNote.en, /software and public project directory/); assert.match(added[2].pricingNote.en, /Independent servers.*any charges/);
    assert.match(added[2].pricingNote.en, /self-hosting.*outside this free classification/);
    for (const site of added) assert.doesNotMatch(site.pricingNote.en, /unlimited|no data collection|guaranteed/i);
    assert.deepEqual(fs.readdirSync('_locales').sort(), ['en', 'zh_CN']);
});
