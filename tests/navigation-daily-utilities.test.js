const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), crypto = require('node:crypto');
const Catalog = require('../shared/navigation-catalog'), sites = require('../shared/navigation-sites').map(require('./helpers/navigation-ai-pricing-review').beforeAiPricingReview);
const added = sites.slice(120, 124);
const ids = ['usa-gov', 'ifixit', 'lichess', 'buffer'];
const key = tag => 'navigationTag' + tag.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('');

test('daily utilities append four reviewed sites without changing any original record', () => {
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(sites.slice(0, 120))).digest('hex'), '5c2b22fe9c94bb43e6f76823344a1692b8475d0f5c5f313fea0645ab8644e9b2');
    assert.deepEqual(added.map(site => site.id), ids);
    assert.equal(sites.length, 146);
    assert.equal(new Set(sites.map(site => site.id)).size, 146);
    assert.equal(new Set(sites.map(site => Catalog.canonicalURL(site.url))).size, 146);
    assert.equal(Catalog.categories.length, 18);
    const oldTags = new Set(sites.slice(0, 120).flatMap(site => site.tags));
    assert.deepEqual([...new Set(added.flatMap(site => site.tags).filter(tag => !oldTags.has(tag)))], ['repair-guides', 'device-repair', 'online-chess', 'chess-practice', 'social-scheduling', 'social-publishing']);
    assert.equal(new Set(sites.flatMap(site => site.tags)).size, 218);
    assert.equal(Catalog.validate(sites), true);
    for (const site of added) {
        assert.equal(site.verifiedOn, '2026-10-12');
        assert.equal(site.language, 'unknown'); assert.equal(site.signup, 'unknown');
        assert.match(site.icon, /^[A-Z]{2}$/);
        assert.equal(new Set(site.sources).size, site.sources.length);
        assert.ok(site.sources.every(source => source.startsWith('https://')));
    }
    assert.ok(!sites.some(site => /openfoodfacts/i.test(site.url)));
});

test('daily utility names, aliases and bilingual purposes compose with all exact filters', () => {
    for (const [locale, language] of [['en', 'en'], ['zh_CN', 'zh']]) {
        const dictionary = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));
        const label = tag => dictionary[key(tag)]?.message;
        for (const site of added) for (const tag of site.tags) {
            assert.ok(label(tag), `${locale}/${tag}`);
            const criteria = {query: label(tag), tag, category: site.categories[0], company: site.company, country: site.country, pricing: site.pricing};
            assert.deepEqual(Catalog.filter(sites, criteria, language, label), [site]);
            for (const field of ['category', 'tag', 'company', 'country', 'pricing'])
                assert.deepEqual(Catalog.filter(sites, {...criteria, [field]: 'nonmatching84920912'}, language, label), []);
            assert.deepEqual(Catalog.filter(sites, {...criteria, query: criteria.query + ' missing84920912'}, language, label), []);
        }
    }
    for (const [query, id] of [['USA gov', 'usa-gov'], ['ＵＳＡ ｇｏｖ', 'usa-gov'], ['美国 政府', 'usa-gov'], ['iFixit', 'ifixit'], ['维修 指南', 'ifixit'], ['Lichess', 'lichess'], ['国际象棋 对弈', 'lichess'], ['Buffer', 'buffer'], ['社交 排期', 'buffer']])
        assert.ok(Catalog.filter(sites, {query}, 'zh').some(site => site.id === id), query);
});

test('daily utilities retain scoped pricing, eligibility and privacy limits', () => {
    const byId = id => added.find(site => site.id === id);
    assert.deepEqual(added.map(site => site.country), ['US', 'US', 'FR', 'US']);
    assert.deepEqual(added.map(site => site.pricing), ['not_applicable', 'free', 'free', 'freemium']);
    assert.match(byId('usa-gov').pricingNote.en, /eligibility and fees.*agency/);
    assert.match(byId('ifixit').pricingNote.en, /guides.*free.*tools and parts.*paid/i);
    assert.match(byId('lichess').pricingNote.en, /no ads.*donations.*voluntary/i);
    assert.match(byId('lichess').pricingNote.en, /data processing/i);
    assert.match(byId('buffer').pricingNote.en, /3 channels.*10.*per channel.*1 user/);
    assert.match(byId('buffer').pricingNote.en, /not a monthly/);
    assert.deepEqual(added.map(site => site.categories), [['public-services'], ['lifestyle'], ['games'], ['marketing']]);
    assert.deepEqual(byId('usa-gov').searchAliases, ['USA gov', 'USAGov']);
    for (const [id, source] of [['usa-gov', 'https://www.usa.gov/privacy-security'], ['ifixit', 'https://www.ifixit.com/Info/Privacy'], ['ifixit', 'https://www.ifixit.com/Info/Terms_of_Use'], ['lichess', 'https://lichess.org/privacy'], ['lichess', 'https://lichess.org/terms-of-service'], ['buffer', 'https://buffer.com/legal#terms'], ['buffer', 'https://buffer.com/legal#privacy-policy']]) assert.ok(byId(id).sources.includes(source));
    for (const site of added) assert.doesNotMatch(site.pricingNote.en, /no data collection|unlimited/i);
});
