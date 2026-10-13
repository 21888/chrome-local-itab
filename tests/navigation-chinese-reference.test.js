const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto'), fs = require('node:fs');
const sites = require('../shared/navigation-sites'), Catalog = require('../shared/navigation-catalog');
const added = sites.slice(139), ids = ['moe-concised-dictionary','china-consular-services'];
const key = tag => 'navigationTag'+tag.split('-').map(part=>part[0].toUpperCase()+part.slice(1)).join('');
test('Chinese reference additions preserve all 139 records and pin 141 safe unique entries / 210 uses',()=>{
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(sites.slice(0,139))).digest('hex'),'9473712ed854a4195ae19e694316f8bf36b999cd9b70a424675b578702670e24');
 assert.deepEqual(added.map(s=>s.id),ids);assert.equal(sites.length,141);assert.equal(Catalog.validate(sites),true);
 assert.equal(new Set(sites.map(s=>s.id)).size,141);assert.equal(new Set(sites.map(s=>Catalog.canonicalURL(s.url))).size,141);
 assert.equal(Catalog.categories.length,18);assert.equal(new Set(sites.flatMap(s=>s.tags)).size,210);
 const oldTags=new Set(sites.slice(0,139).flatMap(s=>s.tags));assert.deepEqual(added.flatMap(s=>s.tags).filter(t=>!oldTags.has(t)),['chinese-dictionary','pronunciation','language-learning','travel-advisories','destination-guides','consular-guidance']);
 for(const site of added){assert.equal(site.verifiedOn,'2026-10-13');assert.equal(site.language,'unknown');assert.equal(site.signup,'unknown');assert.equal(site.pricing,'not_applicable');assert.equal(new Set(site.sources).size,site.sources.length);}
});
test('Chinese official references retain exact destinations, operators and scoped account / reuse / fee conditions',()=>{
 const [dictionary,consular]=added;
 assert.equal(dictionary.url,'https://dict.concised.moe.edu.tw/');assert.equal(dictionary.country,'TW');assert.equal(dictionary.company,'國家教育研究院（教育部國語辭典）');assert.deepEqual(dictionary.categories,['learning','utilities']);
 assert.match(dictionary.pricingNote.en,/notes require an account/);assert.match(dictionary.pricingNote.en,/Traditional Chinese and Taiwan Mandarin/);assert.match(dictionary.pricingNote.en,/licensing terms/);assert.match(dictionary.pricingNote.zh,/需账号.*繁体中文.*授权条件/);
 assert.ok(dictionary.sources.includes('https://www.naer.edu.tw/PageFaq'));
 assert.equal(consular.url,'https://cs.mfa.gov.cn/');assert.equal(consular.country,'CN');assert.equal(consular.company,'中华人民共和国外交部领事司');assert.deepEqual(consular.categories,['travel','public-services']);
 assert.match(consular.pricingNote.en,/verified account, documents and fees/);assert.match(consular.pricingNote.en,/nationality, destination and consulate/);assert.match(consular.pricingNote.zh,/实名账号、材料与费用.*国籍、目的地和使领馆/);
});
test('Chinese and English aliases and all six localized tags match without weakening exact selectors or AND semantics',()=>{
 for(const [locale,language] of [['en','en'],['zh_CN','zh']]){
  const messages=JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));const label=tag=>messages[key(tag)].message;
  for(const site of added){
   for(const query of [site.name,...site.searchAliases])assert.ok(Catalog.filter(sites,{query},language,label).some(s=>s.id===site.id),query);
   for(const tag of site.tags){assert.ok(messages[key(tag)]?.message);assert.deepEqual(Catalog.filter(sites,{query:label(tag),tag,country:site.country,company:site.company,pricing:site.pricing,category:site.categories[0]},language,label),[site]);}
   assert.equal(Catalog.filter(sites,{query:site.searchAliases[0]+' absent-847391'},language,label).length,0);
   assert.equal(Catalog.filter(sites,{query:site.name,country:site.country.toLowerCase()},language,label).length,0);
  }
 }
 for(const [query,id] of [['ConcisedMandarinChineseDictionary',ids[0]],['Ｃｈｉｎａ Ｃｏｎｓｕｌａｒ Ｓｅｒｖｉｃｅｓ',ids[1]],['字词 读音',ids[0]],['海外 安全',ids[1]]])assert.ok(Catalog.filter(sites,{query},'zh').some(s=>s.id===id),query);
});
