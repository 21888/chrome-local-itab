const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), crypto = require('node:crypto');
const Catalog = require('../shared/navigation-catalog'), sites = require('../shared/navigation-sites');
const { beforeChineseAliasReview } = require('./helpers/navigation-chinese-alias-review');
const added = sites.slice(114, 120);
const ids = ['phet','wave','onet-online','we-work-remotely','google-dataset-search','google-ads-transparency'];
const key = tag => 'navigationTag' + tag.split('-').map(part => part[0].toUpperCase()+part.slice(1)).join('');
test('specialized services preserve every original record and append six sites with twelve new uses', () => {
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(sites.slice(0,114).map(beforeChineseAliasReview))).digest('hex'), '0da3d5a424fc0293c8f736b6330e59d9e0c2c243ae46e952e430bbd0e45cf7df');
    assert.deepEqual(added.map(site=>site.id), ids);
    assert.equal(sites.length,132); assert.equal(Catalog.categories.length,18);
    assert.equal(new Set(sites.flatMap(site=>site.tags)).size,193);
    const oldTags=new Set(sites.slice(0,114).flatMap(site=>site.tags));
    assert.equal(new Set(added.flatMap(site=>site.tags).filter(tag=>!oldTags.has(tag))).size,12);
    assert.equal(Catalog.validate(sites),true);
    for(const site of added){
        assert.deepEqual(Object.keys(site).sort(),Object.keys(beforeChineseAliasReview(sites[108])).sort());
        assert.equal(site.language,'unknown');assert.equal(site.signup,'unknown');assert.equal(site.verifiedOn,'2026-10-12');
    }
});
test('specialized bilingual task queries and exact compound selectors find every new service', () => {
    for(const [locale,language] of [['en','en'],['zh_CN','zh']]){
        const dictionary=JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));
        const label=tag=>dictionary[key(tag)]?.message;
        for(const site of added)for(const tag of site.tags){
            assert.ok(label(tag),`${locale}/${tag}`);
            const criteria={query:label(tag),tag,category:site.categories[0],company:site.company,country:site.country,pricing:site.pricing};
            assert.deepEqual(Catalog.filter(sites,criteria,language,label),[site]);
            assert.deepEqual(Catalog.filter(sites,{...criteria,query:criteria.query+' missing84920912'},language,label),[]);
        }
    }
    for(const [query,id] of [['物理 化学','phet'],['网页 无障碍','wave'],['职业 技能','onet-online'],['远程 职位','we-work-remotely'],['数据集 来源','google-dataset-search'],['广告主 日期','google-ads-transparency'],['WeWorkRemotely','we-work-remotely'],['GoogleDatasetSearch','google-dataset-search'],['Ｏ＊ＮＥＴ','onet-online']])
        assert.ok(Catalog.filter(sites,{query},'zh').some(site=>site.id===id),query);
});
test('specialized pricing and operator metadata retain scoped privacy and commitment limits', () => {
    const byId=id=>added.find(site=>site.id===id);
    assert.deepEqual(added.map(site=>site.pricing),['free','free','free','freemium','unknown','unknown']);
    assert.deepEqual(added.map(site=>site.country),['US','US','US','unknown','unknown','unknown']);
    assert.match(byId('phet').pricingNote.en,/website simulations only/);
    assert.match(byId('wave').pricingNote.en,/processed by WAVE servers/);
    assert.match(byId('wave').pricingNote.en,/human evaluation/);
    assert.match(byId('onet-online').description.en,/U.S. occupations/);
    assert.match(byId('we-work-remotely').pricingNote.en,/annual commitments/);
    assert.match(byId('we-work-remotely').pricingNote.en,/payments due after cancellation/);
    assert.match(byId('google-dataset-search').pricingNote.en,/licenses.*checked separately/);
    assert.match(byId('google-ads-transparency').pricingNote.en,/separate from ad buying/);
    for(const site of added)for(const text of Object.values(site.pricingNote))assert.doesNotMatch(text,/\d|unlimited|guaranteed|不限量|保证/);
});
