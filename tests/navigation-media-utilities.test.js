const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), crypto = require('node:crypto');
const Catalog = require('../shared/navigation-catalog'), sites = require('../shared/navigation-sites');
const added = sites.slice(124, 128);
const ids = ['ezgif', 'cloudconvert', 'audiomass', 'google-maps'];
const key = tag => 'navigationTag' + tag.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('');

test('media utilities append four reviewed sites while preserving all 124 previous records', () => {
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(sites.slice(0, 124))).digest('hex'), '7eeece45d2752240ede5e180955302baa4735728c05a222d99024e0932584e39');
    assert.deepEqual(added.map(site => site.id), ids);
    assert.equal(sites.length, 139);
    assert.equal(new Set(sites.map(site => site.id)).size, 139);
    assert.equal(new Set(sites.map(site => Catalog.canonicalURL(site.url))).size, 139);
    assert.equal(Catalog.categories.length, 18);
    assert.equal(new Set(sites.flatMap(site => site.tags)).size, 204);
    assert.equal(Catalog.validate(sites), true);
    const oldTags = new Set(sites.slice(0, 124).flatMap(site => site.tags));
    assert.deepEqual([...new Set(added.flatMap(site => site.tags).filter(tag => !oldTags.has(tag)))], ['gif-editing', 'animated-images', 'audio-editing', 'audio-effects']);
    for (const site of added) {
        assert.equal(site.verifiedOn, '2026-10-13');
        assert.equal(site.language, 'unknown'); assert.equal(site.signup, 'unknown');
        assert.match(site.icon, /^[A-Z]{2}$/);
        assert.equal(new Set(site.sources).size, site.sources.length);
        assert.ok(site.sources.every(source => source.startsWith('https://')));
    }
});

test('media utilities compose bilingual uses and mixed brand queries with every exact selector', () => {
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
    for (const [query, id] of [['EZ GIF', 'ezgif'], ['ＧＩＦ 动画', 'ezgif'], ['Cloud Convert', 'cloudconvert'], ['文件 转换', 'cloudconvert'], ['Audio Mass', 'audiomass'], ['音频 剪辑', 'audiomass'], ['GoogleMaps', 'google-maps'], ['谷歌 地图', 'google-maps']])
        assert.ok(Catalog.filter(sites, {query}, 'zh').some(site => site.id === id), query);
});

test('media pricing and privacy distinguish local audio, server uploads and consumer maps', () => {
    const byId = id => added.find(site => site.id === id);
    assert.deepEqual(added.map(site => site.country), ['LV', 'DE', 'unknown', 'unknown']);
    assert.deepEqual(added.map(site => site.pricing), ['free', 'freemium', 'free', 'free']);
    assert.match(byId('ezgif').pricingNote.en, /advertis/i);
    assert.match(byId('ezgif').pricingNote.en, /servers.*1 hour/);
    assert.match(byId('cloudconvert').pricingNote.en, /10 credits.*day.*1 GB.*5 minutes/);
    assert.match(byId('cloudconvert').pricingNote.en, /24 hours/);
    assert.doesNotMatch(byId('cloudconvert').pricingNote.en, /25 conversions/);
    assert.match(byId('audiomass').pricingNote.en, /locally.*browser.*not uploaded/);
    assert.match(byId('google-maps').pricingNote.en, /consumer.*free.*API/i);
    assert.match(byId('google-maps').pricingNote.en, /permissions.*region/i);
    assert.match(byId('google-maps').pricingNote.en, /operator.*region/i);
    for (const site of added) assert.doesNotMatch(site.pricingNote.en, /no data collection|unlimited|guaranteed/i);
});
