const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), crypto = require('node:crypto');
const Catalog = require('../shared/navigation-catalog'), sites = require('../shared/navigation-sites');
const added = sites.slice(128, 132);
const ids = ['project-gutenberg', 'smithsonian-open-access', 'openlearn', 'british-council-learnenglish'];
const key = tag => 'navigationTag' + tag.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('');

test('open learning appends four reviewed records and preserves every previous record', () => {
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(sites.slice(0, 128))).digest('hex'), '0b81996ae82fa11f01275695fc41dd88dc26e25ddedda1d1cbd67fd76b2aca99');
    assert.deepEqual(added.map(site => site.id), ids);
    assert.equal(sites.length, 139);
    assert.equal(new Set(sites.map(site => site.id)).size, 139);
    assert.equal(new Set(sites.map(site => Catalog.canonicalURL(site.url))).size, 139);
    assert.equal(new Set(sites.flatMap(site => site.tags)).size, 204);
    assert.equal(Catalog.categories.length, 18);
    assert.equal(Catalog.validate(sites), true);
    const oldTags = new Set(sites.slice(0, 128).flatMap(site => site.tags));
    assert.deepEqual([...new Set(added.flatMap(site => site.tags).filter(tag => !oldTags.has(tag)))], ['ebooks', 'cultural-collections', 'english-learning']);
    for (const site of added) {
        assert.equal(site.verifiedOn, '2026-10-13');
        assert.equal(site.language, 'unknown'); assert.equal(site.signup, 'unknown');
        assert.deepEqual(site.categories, ['learning']);
        assert.match(site.icon, /^[A-Z]{2}$/);
        assert.equal(new Set(site.sources).size, site.sources.length);
        assert.ok(site.sources.every(source => source.startsWith('https://')));
    }
});

test('open learning supports bilingual discovery and all exact filters without mixing country with access', () => {
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
    for (const [query, id] of [['Project Gutenberg', ids[0]], ['Ｇｕｔｅｎｂｅｒｇ', ids[0]], ['电子书 阅读', ids[0]], ['Smithsonian Open Access', ids[1]], ['文化 馆藏', ids[1]], ['Open Learn', ids[2]], ['免费 课程', ids[2]], ['British Council LearnEnglish', ids[3]], ['英语 学习', ids[3]]])
        assert.ok(Catalog.filter(sites, {query}, 'zh').some(site => site.id === id), query);
});

test('learning notes scope public domain, CC0, course credit and separate paid products', () => {
    const byId = id => added.find(site => site.id === id);
    assert.deepEqual(added.map(site => site.country), ['US', 'US', 'GB', 'GB']);
    assert.deepEqual(added.map(site => site.pricing), ['free', 'free', 'free', 'freemium']);
    assert.match(byId(ids[0]).pricingNote.en, /United States/);
    assert.match(byId(ids[0]).pricingNote.en, /outside|other countries/i);
    assert.match(byId(ids[1]).pricingNote.en, /CC0/);
    assert.match(byId(ids[1]).pricingNote.en, /third.party/i);
    assert.match(byId(ids[2]).pricingNote.en, /account/i);
    assert.match(byId(ids[2]).pricingNote.en, /not.*formal.*credit/i);
    assert.match(byId(ids[3]).pricingNote.en, /separate.*paid/i);
    assert.match(byId(ids[3]).pricingNote.en, /no longer.*new/i);
    for (const site of added) assert.doesNotMatch(site.pricingNote.en, /guaranteed|unlimited|no data collection/i);
    const docs = fs.readFileSync('docs/navigation-open-learning.md', 'utf8');
    assert.match(docs, /not legal advice/i);
    assert.match(docs, /不构成法律建议/);
});
