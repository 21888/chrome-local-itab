const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), crypto = require('node:crypto');
const Catalog = require('../shared/navigation-catalog'), sites = require('../shared/navigation-sites');
const added = sites.slice(132,136), ids = ['cfpb-consumer-resources', 'ftc-shopping-guides', 'board-game-arena', 'alltrails'];
const key = tag => 'navigationTag' + tag.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('');
test('daily discovery preserves 132 previous records and adds four reviewed sites and seven uses', () => {
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(sites.slice(0,132))).digest('hex'),'022320e9aae5e3fd80fa4225bb7d4b8a9f1c2a69cd3e563d48425c19958d3005');
 assert.deepEqual(added.map(site=>site.id),ids);assert.equal(sites.length,141);assert.equal(new Set(sites.map(site=>site.id)).size,141);assert.equal(new Set(sites.map(site=>Catalog.canonicalURL(site.url))).size,141);
 assert.equal(Catalog.validate(sites),true);assert.equal(Catalog.categories.length,18);assert.equal(new Set(sites.flatMap(site=>site.tags)).size,210);
 const oldTags=new Set(sites.slice(0,132).flatMap(site=>site.tags));assert.deepEqual([...new Set(added.flatMap(site=>site.tags).filter(tag=>!oldTags.has(tag)))],['personal-finance','financial-education','shopping-guides','scam-awareness','online-board-games','multiplayer-games','hiking-trails']);
 for(const site of added){assert.equal(site.verifiedOn,'2026-10-13');assert.equal(site.language,'unknown');assert.equal(site.signup,'unknown');assert.match(site.icon,/^[A-Z]{2}$/);assert.equal(new Set(site.sources).size,site.sources.length);for(const source of site.sources){assert.ok(Catalog.canonicalURL(source));assert.ok(source.startsWith('https://'));assert.doesNotMatch(source,/[?&](utm_\w+|src)=/i);}}
});
test('daily discovery bilingual use search composes with every exact selector and AND semantics',()=>{
 for(const [locale,language] of [['en','en'],['zh_CN','zh']]){
  const dictionary=JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));const label=tag=>dictionary[key(tag)]?.message;
  for(const site of added)for(const tag of site.tags){assert.ok(label(tag));const criteria={query:label(tag),tag,category:site.categories[0],company:site.company,country:site.country,pricing:site.pricing};assert.deepEqual(Catalog.filter(sites,criteria,language,label),[site]);for(const field of ['category','tag','company','country','pricing'])assert.deepEqual(Catalog.filter(sites,{...criteria,[field]:'absent84920912'},language,label),[]);assert.deepEqual(Catalog.filter(sites,{...criteria,query:criteria.query+' absent84920912'},language,label),[]);}
 }
 for(const [query,id] of [['CFPB',ids[0]],['Consumer Financial Protection Bureau',ids[0]],['美国 信用',ids[0]],['FTC',ids[1]],['购物 诈骗',ids[1]],['BGA',ids[2]],['BoardGameArena',ids[2]],['在线 桌游',ids[2]],['AllTrails',ids[3]],['徒步 步道',ids[3]]])assert.ok(Catalog.filter(sites,{query},'zh').some(site=>site.id===id),query);
});
test('daily discovery scopes government guidance, Premium tables and trail subscriptions and safety',()=>{
 assert.deepEqual(added.map(site=>site.country),['US','US','FR','US']);assert.deepEqual(added.map(site=>site.pricing),['free','free','freemium','freemium']);assert.deepEqual(added.map(site=>site.company),['Consumer Financial Protection Bureau','Federal Trade Commission','AD2G Studio SAS','AllTrails, LLC']);
 assert.deepEqual(added.map(site=>site.categories),[['finance','public-services'],['shopping','public-services'],['games'],['travel','lifestyle']]);
 assert.match(added[0].pricingNote.en,/not personalized financial or legal advice/);assert.match(added[0].pricingNote.en,/United States/);assert.match(added[1].pricingNote.en,/not a purchase or complaint-submission/);assert.match(added[1].pricingNote.en,/United States/);
 assert.match(added[2].pricingNote.en,/invite free members/);assert.match(added[2].pricingNote.en,/personal-data processing/);assert.match(added[2].pricingNote.en,/renewal/);
 assert.match(added[3].pricingNote.en,/Base membership is free/);assert.match(added[3].pricingNote.en,/Plus and Peak are paid/);assert.match(added[3].pricingNote.en,/offline map downloads require a paid plan/);assert.match(added[3].pricingNote.en,/app-only/);assert.match(added[3].pricingNote.en,/not a guarantee.*safety/);
 for(const site of added)assert.doesNotMatch(site.pricingNote.en,/unlimited|no data collection/i);
 const docs=fs.readFileSync('docs/navigation-daily-discovery.md','utf8');assert.match(docs,/official search index/);assert.match(docs,/legal terms/);assert.match(docs,/not personalized financial or legal advice/);
});
