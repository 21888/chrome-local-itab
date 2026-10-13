const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sites = require('../shared/navigation-sites');
const Catalog = require('../shared/navigation-catalog');
const { review, beforeChineseAliasReview } = require('./helpers/navigation-chinese-alias-review');
const cases = [
    ['amazon', '亚马逊', '亚马', 'amazon'],
    ['linkedin-jobs', '领英', '领', 'LinkedIn'],
    ['khan-academy', '可汗学院', '可汗', 'Khan'],
    ['google-scholar', 'Google 学术搜索', 'Google学术', 'Scholar'],
    ['imf-data', '国际货币基金组织', '国际货币基金', 'IMF']
];

test('five exact reviewed alias/evidence additions preserve every field of all 120 original records', () => {
    assert.equal(sites.length, 146);
    assert.equal(review.verifiedOn, '2026-10-12');
    assert.deepEqual(review.changes.map(change => [change.id, change.searchAliases]), cases.map(([id, alias]) => [id, [alias]]));
    const preserved = sites.slice(0, 120).map(beforeChineseAliasReview);
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(preserved)).digest('hex'), review.preservedSha256,
        'Only the five exact searchAliases and explicitly appended official sources may change');
    assert.equal(Catalog.validate(sites), true);
    for (const [id] of cases) {
        const original = sites.find(site => site.id === id);
        assert.throws(() => beforeChineseAliasReview({...original, searchAliases: [...original.searchAliases, 'unreviewed']}));
        assert.throws(() => beforeChineseAliasReview({...original, sources: [...original.sources, 'https://example.com/']}));
    }
});

test('official Chinese queries, substrings, abbreviations and mixed-script normalization work in both languages', () => {
    const before = JSON.stringify(sites);
    for (const language of ['en', 'zh']) for (const [id, alias, substring, abbreviation] of cases) {
        const site = sites.find(site => site.id === id);
        for (const query of [alias, substring, abbreviation, `${alias} ${abbreviation}`, `  ${alias}\t\n`])
            assert.ok(Catalog.filter(sites, {query}, language).includes(site), `${language}/${id}/${query}`);
    }
    for (const query of ['Ｇｏｏｇｌｅ 学术搜索', 'google-学术搜索', 'Google学术搜索'])
        assert.deepEqual(Catalog.filter(sites, {query}), [sites.find(site => site.id === 'google-scholar')]);
    assert.equal(JSON.stringify(sites), before, 'Search cannot mutate the catalog');
});

test('every Chinese alias composes with exact selectors and rejects nonmatching or regional substitutes', () => {
    for (const language of ['en', 'zh']) for (const [id, query] of cases) {
        const site = sites.find(site => site.id === id);
        const criteria = {query, category: site.categories[0], tag: site.tags[0], country: site.country,
            company: site.company, pricing: site.pricing};
        assert.deepEqual(Catalog.filter(sites, criteria, language), [site]);
        for (const key of ['category', 'tag', 'country', 'company', 'pricing'])
            assert.deepEqual(Catalog.filter(sites, {...criteria, [key]: 'nonmatching84920912'}, language), [], `${id}/${key}`);
        assert.deepEqual(Catalog.filter(sites, {...criteria, query: `${query} missing84920912`}, language), []);
    }
    for (const query of ['谷歌学术', '可画', '千问', '亚马逊 领英', '可汗学院 国际货币基金组织', '亚马孙', '领瑛'])
        assert.deepEqual(Catalog.filter(sites, {query}), [], query);
    assert.equal(sites.find(site => site.id === 'amazon').url, 'https://www.amazon.com/');
    assert.equal(sites.find(site => site.id === 'linkedin-jobs').url, 'https://www.linkedin.com/jobs/');
    assert.equal(sites.find(site => site.id === 'imf-data').url, 'https://data.imf.org/');
    assert.equal(sites.find(site => site.id === 'canva').searchAliases, undefined);
    assert.equal(sites.find(site => site.id === 'qwen').searchAliases, undefined);
});
