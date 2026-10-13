const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const Catalog = require('../shared/navigation-catalog'), sites = require('../shared/navigation-sites');
test('offline catalog has safe official URLs, stable IDs, bilingual descriptions and 18 populated categories', () => {
    assert.equal(Catalog.validate(sites), true);
    assert.equal(Catalog.categories.length, 18);
    for (const category of Catalog.categories) assert.ok(sites.some(site => site.categories.includes(category.id)), category.id);
    assert.equal(sites[0].categories[0], 'ai');
    assert.ok(sites.every(site => site.sources.every(source => !/[?&](src|utm_\w+)=/i.test(source))));
});
test('search is case-insensitive multi-term and searches names, domains, uses and translated categories', () => {
    assert.ok(Catalog.filter(sites, { query: 'OpenAI chat' }).some(site => site.id === 'chatgpt'));
    assert.ok(Catalog.filter(sites, { query: '开发 github' }, 'zh').some(site => site.id === 'github'));
    assert.equal(Catalog.filter(sites, { query: 'not-present-84920912' }).length, 0);
});
test('all filters combine without mixing operator location with accessibility', () => {
    const site = sites.find(site => site.id === 'chatgpt');
    assert.deepEqual(Catalog.filter(sites, { category: 'ai', tag: 'chat', country: site.country, company: site.company, pricing: site.pricing }), [site]);
    assert.equal(Catalog.filter(sites, { category: 'games', company: 'OpenAI' }).length, 0);
    for (const country of new Set(sites.map(site => site.country))) assert.ok(Catalog.filter(sites, { country }).length);
    assert.equal(Catalog.filter(sites, { pricing: 'unknown' }).every(site => site.pricing === 'unknown'), true);
});
test('URL matching retains query/hash distinctions and matches harmless URL normalization', () => {
    assert.equal(Catalog.canonicalURL('https://EXAMPLE.com:443'), 'https://example.com/');
    assert.notEqual(Catalog.canonicalURL('https://example.com/#a'), Catalog.canonicalURL('https://example.com/#b'));
    for (const value of ['javascript:alert(1)', 'https://user@host/', 'https://@host/', 'https://example.com/\\x', 'https://example.com/%zz', 'https://example.com/ a']) assert.equal(Catalog.canonicalURL(value), null);
    assert.equal(Catalog.savedURLs([{url:'https://EXAMPLE.com'}]).has('https://example.com/'), true);
});
test('library assets contain no runtime remote catalog or image fetches', () => {
    for (const file of ['shared/navigation-catalog.js','shared/navigation-sites.js','shared/navigation-library-view.js','navigation-library.css']) {
        const text=fs.readFileSync(file,'utf8'); assert.doesNotMatch(text,/\bfetch\s*\(|new\s+Image|XMLHttpRequest|url\(\s*https?:|createElement\(['"]img/);
    }
    const html=fs.readFileSync('newtab.html','utf8'), pack=fs.readFileSync('tools/package_extension.py','utf8');
    for (const file of ['shared/navigation-catalog.js','shared/navigation-sites.js','shared/navigation-library-view.js','navigation-library.css']) { assert.ok(html.includes(file));assert.ok(pack.includes(file)); }
});
test('catalog rejects missing provenance, unsafe URLs and invented categories', () => {
    for (const patch of [{url:'javascript:alert(1)'},{id:sites[1].id},{sources:[]},{country:'global'},{pricing:'unlimited-free'},{categories:['not-a-category']},{description:{en:''}}]) {
        assert.throws(()=>Catalog.validate([{...sites[0],...patch},sites[1]]));
    }
});
test('library text palettes meet AA contrast in both color modes and narrow layout has one column',()=>{
 const css=fs.readFileSync('navigation-library.css','utf8');
 const luminance=hex=>{const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb.reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);};
 const ratio=(a,b)=>{const [lo,hi]=[luminance(a),luminance(b)].sort((a,b)=>a-b);return(hi+.05)/(lo+.05);};
 for(const [muted,card,bg,accent,selected] of [['#626e82','#ffffff','#f7f9fc','#3c54cb','#edf0ff'],['#a9b4c7','#222c40','#172034','#b0bfff','#303e64']]){
  for(const color of [muted,bg,accent,selected])assert.ok(css.includes(color));
  assert.ok(ratio(muted,card)>=4.5);assert.ok(ratio(muted,bg)>=4.5);assert.ok(ratio(muted,selected)>=4.5);assert.ok(ratio(accent,selected)>=4.5);
 }
 assert.match(css,/@media \(max-width: 520px\)[\s\S]*grid-template-columns: 1fr/);assert.match(css,/:focus-visible/);assert.match(css,/prefers-reduced-motion/);
});
test('every fine-grained use label and pricing note is bilingual; duplicate sites share categories',()=>{
 const en=JSON.parse(fs.readFileSync('_locales/en/messages.json')),zh=JSON.parse(fs.readFileSync('_locales/zh_CN/messages.json'));
 for(const site of sites){assert.ok(site.pricingNote.en&&site.pricingNote.zh);for(const tag of site.tags){const key='navigationTag'+tag.split(/[-_]/).map(s=>s[0].toUpperCase()+s.slice(1)).join('');assert.ok(en[key]?.message,key);assert.ok(zh[key]?.message,key);}}
 assert.ok(new Set(sites.flatMap(site=>site.tags)).size>=100);assert.ok(sites.find(site=>site.id==='deepl').categories.length>1);
 assert.equal(sites.find(site=>site.id==='pika').pricing,'unknown');assert.equal(sites.find(site=>site.id==='qwen').pricing,'unknown');
});

test('expanded catalog has 139 unique sites, 204 bilingual uses and the same 18 categories',()=>{
 assert.equal(sites.length,139);assert.equal(new Set(sites.map(site=>site.id)).size,139);
 assert.equal(new Set(sites.map(site=>Catalog.canonicalURL(site.url))).size,139);
 assert.equal(new Set(sites.flatMap(site=>site.tags)).size,204);
 for(const id of ['squoosh','photopea','regex101','cyberchef','caniuse','hoppscotch','google-fonts','lucide','adobe-color','excalidraw','drawio','freecodecamp','the-odin-project','exercism','mit-ocw','javascript-info','geogebra','overleaf','zotero','china-laws','china-standards','w3c-validator','crontab-guru','json-crack']){
  const site=sites.find(site=>site.id===id);assert.ok(site,id);assert.equal(site.verifiedOn,'2026-10-12');assert.equal(site.language,'unknown');assert.equal(site.signup,'unknown');
 }
});
test('task searches find expanded entries through bilingual descriptions and localized use labels',()=>{
 const cases=[['regex-testing','regex101'],['psd-editing','photopea'],['api-testing','hoppscotch'],['json-tools','json-crack'],['reference-management','zotero'],['standards-search','china-standards'],['html-validation','w3c-validator'],['cron-schedules','crontab-guru']];
 for(const [locale,lang] of [['en','en'],['zh_CN','zh']]){
  const dictionary=JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));
  const label=tag=>dictionary['navigationTag'+tag.split(/[-_]/).map(s=>s[0].toUpperCase()+s.slice(1)).join('')].message;
  for(const [tag,id] of cases){const site=sites.find(s=>s.id===id);assert.deepEqual(Catalog.filter(sites,{query:label(tag),tag,company:site.company},lang,label),[site]);}
 }
 for(const [query,id] of [['PSD 图层','photopea'],['JSON YAML','json-crack'],['国家 行业 标准','china-standards'],['LaTeX papers','overleaf'],['cron 定时','crontab-guru']])assert.ok(Catalog.filter(sites,{query},'zh').some(s=>s.id===id),query);
});
test('expanded metadata preserves scoped pricing, unknown countries and migrated standards destination',()=>{
 const byId=id=>sites.find(s=>s.id===id);
 for(const id of ['regex101','photopea','excalidraw','overleaf','zotero','hoppscotch'])assert.equal(byId(id).pricing,'freemium');
 for(const id of ['squoosh','cyberchef','caniuse','adobe-color','javascript-info','crontab-guru'])assert.equal(byId(id).pricing,'unknown');
 assert.equal(byId('json-crack').pricing,'free');assert.match(byId('json-crack').pricingNote.en,/separately on ToDiagram/);
 assert.match(byId('geogebra').pricingNote.en,/non-commercial/);
 assert.equal(byId('china-standards').url,'https://std.samr.gov.cn/');assert.match(byId('china-standards').pricingNote.en,/not available for every standard/);
 for(const id of ['photopea','regex101','json-crack','google-fonts','mit-ocw'])assert.equal(byId(id).country,'unknown');
 const original=byId('photopea');assert.throws(()=>Catalog.validate([original,{...original,id:'photopea-copy',url:'https://WWW.PHOTOPEA.com:443'}]));
});

test('search normalizes full-width text and brand spacing without changing displayed metadata', () => {
 const before=JSON.stringify(sites);
 const cases=[['Chat GPT','chatgpt'],['chat-gpt','chatgpt'],['ＣｈａｔＧＰＴ','chatgpt'],['Git Hub','github'],['ＧＩＴ－ＨＵＢ','github'],['JSONCrack','json-crack'],['JSON Crack','json-crack'],['json-crack','json-crack'],['googlefonts','google-fonts'],['  gItHuB\t\n','github'],['谷歌','google'],['必应','bing'],['ＰＳＤ 图层','photopea']];
 for(const language of ['en','zh'])for(const [query,id] of cases)assert.ok(Catalog.filter(sites,{query},language).some(site=>site.id===id),`${language}: ${query}`);
 assert.equal(JSON.stringify(sites),before);
 assert.deepEqual(sites.filter(site=>site.searchAliases).map(site=>[site.id,site.searchAliases]),[['amazon',['亚马逊']],['linkedin-jobs',['领英']],['bing',['必应']],['google',['谷歌']],['imf-data',['国际货币基金组织']],['khan-academy',['可汗学院']],['google-scholar',['Google 学术搜索']],['usa-gov',['USA gov','USAGov']],['cfpb-consumer-resources',['CFPB','Consumer Financial Protection Bureau']],['ftc-shopping-guides',['FTC','Federal Trade Commission']],['board-game-arena',['BGA','BoardGameArena']],['inoreader',['RSS 阅读器']],['hacker-news',['HN','黑客新闻']],['mastodon',['长毛象']]]);
});
test('name compaction keeps AND semantics, exact selectors and meaningful punctuation', () => {
 const site=sites.find(site=>site.id==='chatgpt');
 assert.deepEqual(Catalog.filter(sites,{query:'ＣＨＡＴ－ＧＰＴ OpenAI',category:'ai',tag:'chat',country:'US',company:'OpenAI',pricing:'freemium'}),[site]);
 for(const [key,value] of [['category','AI'],['tag','CHAT'],['country','us'],['company','openai'],['pricing','FREEMIUM']])assert.equal(Catalog.filter(sites,{query:'chat-gpt',[key]:value}).length,0,key);
 for(const query of ['chat-gpt not-present-84920912','chatgpt github','chatgpt freepaid','chat.gpt','chagpt','油管'])assert.equal(Catalog.filter(sites,{query}).length,0,query);
 const isolated={...site,name:'Alpha Beta',url:'https://example.com/',company:'Example',description:{en:'red blue',zh:'红 蓝'},tags:[],categories:[]};
 assert.deepEqual(Catalog.filter([isolated],{query:'alpha-beta'}),[isolated]);
 for(const query of ['redblue','betaexample','-','---'])assert.deepEqual(Catalog.filter([isolated],{query}),[],query);
});
test('search aliases are optional bounded strings; long queries retain every term', () => {
 const site=sites[0];
 for(const searchAliases of [null,'word',[null],[1],[''],['  '],['x'.repeat(81)],Array(9).fill('word'),['a\u0000b']])assert.throws(()=>Catalog.validate([{...site,searchAliases}]));
 assert.equal(Catalog.validate([{...site,searchAliases:[]}]),true);
 assert.equal(Catalog.validate([{...site,searchAliases:['x'.repeat(80)]}]),true);
 for(const query of ['x'.repeat(10000),`${'chatgpt '.repeat(1000)}no-matching-suffix`,'＜img src=x onerror=alert(1)＞'])assert.equal(Catalog.filter(sites,{query}).length,0);
 for(const query of [null,undefined,42,{},[]])assert.doesNotThrow(()=>Catalog.filter(sites,{query}));
});
