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
 for(const [muted,card,bg,accent,selected] of [['#667286','#ffffff','#f7f9fc','#3c54cb','#edf0ff'],['#a9b4c7','#222c40','#172034','#b0bfff','#303e64']]){
  for(const color of [muted,bg,accent,selected])assert.ok(css.includes(color));
  assert.ok(ratio(muted,card)>=4.5);assert.ok(ratio(muted,bg)>=4.5);assert.ok(ratio(accent,selected)>=4.5);
 }
 assert.match(css,/@media \(max-width: 520px\)[\s\S]*grid-template-columns: 1fr/);assert.match(css,/:focus-visible/);assert.match(css,/prefers-reduced-motion/);
});
test('every fine-grained use label and pricing note is bilingual; duplicate sites share categories',()=>{
 const en=JSON.parse(fs.readFileSync('_locales/en/messages.json')),zh=JSON.parse(fs.readFileSync('_locales/zh_CN/messages.json'));
 for(const site of sites){assert.ok(site.pricingNote.en&&site.pricingNote.zh);for(const tag of site.tags){const key='navigationTag'+tag.split(/[-_]/).map(s=>s[0].toUpperCase()+s.slice(1)).join('');assert.ok(en[key]?.message,key);assert.ok(zh[key]?.message,key);}}
 assert.ok(new Set(sites.flatMap(site=>site.tags)).size>=100);assert.ok(sites.find(site=>site.id==='deepl').categories.length>1);
 assert.equal(sites.find(site=>site.id==='pika').pricing,'unknown');assert.equal(sites.find(site=>site.id==='qwen').pricing,'unknown');
});
