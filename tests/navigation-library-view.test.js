const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createDocument,deferred}=require('./helpers/task-dom-model');
const tick=()=>new Promise(setImmediate);
function model({locale='en'}={}) {
    const document=createDocument({blurUnavailableFocus:true});document.documentElement.lang=locale;
    const host=document.createElement('header');document.body.append(host);let read,write,reads=0,calls=0;
    const snapshot={links:[],categories:[{id:'work',name:'Work'},{id:'personal',name:'Personal'}],privacy:{syncEnabled:false,onlineFavicons:false},state:{links:[]}};
    const component={layoutController:{async flush(){}},async addCatalogShortcut(request){calls++;if(write)return write.promise;const site=request.site; snapshot.links.push({title:site.name,url:site.url,icon:site.icon,category:request.destination});return structuredClone(snapshot);}};
    const dictionary=JSON.parse(fs.readFileSync(`_locales/${locale==='zh-CN'?'zh_CN':'en'}/messages.json`));
    const context={document,URL,Intl,console,setTimeout,window:null,addEventListener(){},storageManager:{async readNavigationLibrarySnapshot(){reads++;return read?read.promise:structuredClone(snapshot);}},i18n:{t(key){return dictionary[key]?.message||key;}},shortcutsComponentInstance:component};context.window=context;vm.createContext(context);
    for(const file of ['shared/dialog-focus.js','shared/navigation-catalog.js','shared/navigation-sites.js','shared/navigation-library-view.js','shared/local-content-lifecycle.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
    const view=component.navigationLibraryView=context.LocalItabNavigationLibrary.mount(host,component);
    component.hasUncommittedShortcutWork=()=>view.hasUncommittedWork();
    const button=text=>document.querySelectorAll('button').find(b=>b.textContent===text);
    const click=text=>button(text).dispatch('click',{detail:1});
    return {document,host,component,context,view,snapshot,button,click,get calls(){return calls;},get reads(){return reads;},set read(v){read=v;},set write(v){write=v;},
      firstAdd(){return document.querySelector('.navigation-library-add');},search(value){const el=document.querySelector('input');el.value=value;el.dispatch('input');}};
}
test('browse, search, clear and close never mutate saved shortcuts',async()=>{
 const h=model();await h.view.open();assert.equal(h.calls,0);assert.ok(h.document.querySelectorAll('article').length>=45);h.search('no-matching-site-9387492');assert.ok(h.document.querySelector('.navigation-library-empty'));h.click('Clear filters');assert.ok(h.document.querySelectorAll('article').length>=45);h.view.close();assert.equal(h.calls,0);assert.equal(h.view.hasUncommittedWork(),false);assert.equal(h.document.querySelector('.navigation-library-overlay'),null);
});
test('single add targets chosen personal category and becomes an honest added state',async()=>{
 const h=model();await h.view.open();const select=h.document.querySelector('.navigation-library-destination select');select.value='personal';select.dispatch('change');const b=h.firstAdd();b.dispatch('click');await tick();assert.equal(h.calls,1);assert.equal(h.snapshot.links[0].category,'personal');assert.equal(h.firstAdd().disabled,true);assert.match(h.document.querySelector('.navigation-library-status').textContent,/Added to Personal/);assert.equal(h.document.activeElement.tagName,'ARTICLE');
});
test('saved URL disables add across all personal categories',async()=>{
 const h=model();h.snapshot.links=[{title:'My renamed ChatGPT',url:'https://chatgpt.com/',category:'personal'}];await h.view.open();assert.equal(h.firstAdd().disabled,true);assert.equal(h.firstAdd().textContent,'✓ Added');assert.equal(h.calls,0);
});
test('pending write suppresses repeat, prevents dismissal, owns focus and lifecycle',async()=>{
 const h=model(),pending=deferred();h.write=pending;await h.view.open();const b=h.firstAdd();b.dispatch('click');b.dispatch('click');assert.equal(h.calls,1);assert.equal(h.view.close(),false);assert.equal(h.context.LocalItabContentLifecycle.pending(),true);assert.equal(h.document.activeElement.className,'navigation-library-panel');pending.resolve({...h.snapshot,duplicate:true});await tick();assert.equal(h.view.pending,false);assert.match(h.document.querySelector('.navigation-library-status').textContent,/Already/);assert.equal(h.view.close(),true);
});
test('close while reading ignores a stale result and reopening starts fresh',async()=>{
 const h=model(),pending=deferred();h.read=pending;const opening=h.view.open();await tick();assert.equal(h.view.close(),true);pending.resolve(h.snapshot);await opening;assert.equal(h.document.querySelector('article'),null);h.read=null;await h.view.open();assert.equal(h.reads,2);assert.ok(h.document.querySelector('article'));
});
test('conflict and uncertain writes block repeat until close and fresh read',async()=>{
 for(const code of ['CATALOG_CONFLICT','CATALOG_UNVERIFIED']){const h=model();h.component.addCatalogShortcut=async()=>{throw Object.assign(new Error(),{code});};await h.view.open();h.firstAdd().dispatch('click');await tick();assert.equal(h.firstAdd().disabled,true);assert.match(h.document.querySelector('.navigation-library-status').textContent,/Close and reopen/);h.view.close();await h.view.open();assert.equal(h.firstAdd().disabled,false);}
});
test('known unchanged failure can retry and missing category cannot add',async()=>{
 const h=model();let calls=0;h.component.addCatalogShortcut=async()=>{calls++;if(calls===1)throw Object.assign(new Error(),{code:'CATALOG_FAILED'});return {...h.snapshot,duplicate:true};};await h.view.open();h.firstAdd().dispatch('click');await tick();assert.equal(h.firstAdd().disabled,false);h.firstAdd().dispatch('click');await tick();assert.equal(calls,2);
 const empty=model();empty.snapshot.categories=[];await empty.view.open();assert.equal(empty.firstAdd().disabled,true);assert.match(empty.document.querySelector('.navigation-library-status').textContent,/Create a personal/);
});
test('all categories and advanced filters are usable and category change clears stale purpose',async()=>{
 const h=model();await h.view.open();h.click('More filters');assert.equal(h.document.querySelector('.navigation-library-filters').hidden,false);const selects=h.document.querySelectorAll('.navigation-library-filters select');selects[0].value='chat';selects[0].dispatch('change');assert.ok(h.document.querySelectorAll('article').length);const games=h.document.querySelectorAll('.navigation-library-category').find(b=>b.dataset.category==='games');games.dispatch('click');assert.equal(selects[0].value,'');assert.ok(h.document.querySelectorAll('article').length);assert.equal(games.getAttribute('aria-pressed'),'true');
});
test('Chinese library is translated and untrusted catalog text stays text',async()=>{
 const h=model({locale:'zh-CN'});h.context.LocalItabNavigationSites[0]={...h.context.LocalItabNavigationSites[0],name:'<img src=x onerror=alert(1)>'};await h.view.open();assert.equal(h.document.querySelectorAll('img').length,0);assert.equal(h.button('更多筛选').textContent,'更多筛选');assert.equal(h.document.querySelector('article h3').textContent,'<img src=x onerror=alert(1)>');assert.match(h.document.querySelector('h2').textContent,/发现好网站/);
});
test('Escape closes browse mode and restores opener; IME Escape stays inside the dialog',async()=>{
 const h=model();h.button('Discover sites').focus();await h.view.open();const input=h.document.querySelector('input');input.dispatch('compositionstart');input.dispatch('keydown',{key:'Escape'});assert.ok(h.document.querySelector('.navigation-library-overlay'));input.dispatch('compositionend');input.dispatch('keydown',{key:'Escape'});assert.equal(h.document.querySelector('.navigation-library-overlay'),null);assert.equal(h.document.activeElement,h.button('Discover sites'));assert.equal(h.calls,0);
});
test('reading errors remain dismissible and failed layout prevents any snapshot read',async()=>{
 const h=model();h.component.layoutController.failedChange={positions:{}};await h.view.open();assert.equal(h.reads,0);assert.match(h.document.querySelector('.navigation-library-status').textContent,/layout change/);assert.equal(h.view.close(),true);
 const read=model();read.context.storageManager.readNavigationLibrarySnapshot=async()=>{throw new Error('unavailable');};await read.view.open();assert.match(read.document.querySelector('.navigation-library-status').textContent,/Could not read/);assert.equal(read.view.close(),true);assert.equal(read.calls,0);
});
test('category labels and official links render without emoji-dependent icons',async()=>{
 const h=model();await h.view.open();for(const node of h.document.querySelectorAll('.navigation-library-category'))assert.doesNotMatch(node.textContent,/[↗▶⚙\uFE0E\uFE0F]/u);
 for(const node of h.document.querySelectorAll('.navigation-library-visit'))assert.equal(node.textContent,'Official site');
 assert.equal(h.document.querySelector('.navigation-library-search-icon').textContent,'');
 const css=fs.readFileSync('navigation-library.css','utf8');assert.match(css,/navigation-library-visit::after[^}]*border-top:/);assert.match(css,/navigation-library-visit::before[^}]*transform: rotate\(-45deg\)/);
});
test('result count uses English singular only for one site and keeps Chinese count wording',async()=>{
 for(const [locale,one,many] of [['en','site','sites'],['zh-CN','个网站','个网站']]){
  const h=model({locale});h.context.LocalItabNavigationSites=h.context.LocalItabNavigationSites.slice(0,2);await h.view.open();
  const count=()=>h.document.querySelector('.navigation-library-count').textContent;
  assert.equal(count(),`2 ${many}`);h.search('chatgpt');assert.equal(count(),`1 ${one}`);h.search('no-result-84923');assert.equal(count(),`0 ${many}`);
 }
});

// The shared DOM model does not reflect href properties into attributes or
// native anchor tabIndex. Mirror those native properties for these boundary
// tests; selector matching stays unchanged. Deliberately keep rectangles for
// collapsed source links to catch layout-only visibility assumptions.
function reflectNativeLinks(document) {
 for(const link of document.querySelectorAll('a')) {
  link.setAttribute('href',link.href);link.tabIndex=0;
  // Native closed-details descendants may retain nonzero layout rectangles.
  link.getClientRects=()=>link.isConnected ? [{}] : [];
 }
}
test('single result keeps its collapsed source summary inside forward and reverse Tab boundaries',async()=>{
 const h=model();await h.view.open();h.search('chatgpt');reflectNativeLinks(h.document);
 assert.equal(h.document.querySelectorAll('article').length,1);
 const summary=h.document.querySelector('summary'),close=h.document.querySelector('.navigation-library-close');
 h.firstAdd().focus();assert.equal(h.firstAdd().dispatch('keydown',{key:'Tab'}).prevented,false);
 assert.equal(summary.getAttribute('tabindex'),'0');
 // Native Tab advances to summary; the synthetic DOM does not emulate it.
 summary.focus();assert.equal(summary.dispatch('keydown',{key:'Tab'}).prevented,true);
 assert.ok(h.document.activeElement === close);
 assert.equal(close.dispatch('keydown',{key:'Tab',shiftKey:true}).prevented,true);
 assert.ok(h.document.activeElement === summary);
 assert.equal(summary.dispatch('keydown',{key:'Tab',shiftKey:true}).prevented,false);
});
test('already-added single result still exposes source summary after its official link',async()=>{
 const h=model();h.snapshot.links=[{title:'ChatGPT',url:'https://chatgpt.com/',category:'personal'}];
 await h.view.open();h.search('chatgpt');reflectNativeLinks(h.document);
 const visit=h.document.querySelector('.navigation-library-visit'),summary=h.document.querySelector('summary'),close=h.document.querySelector('.navigation-library-close');
 assert.equal(h.firstAdd().disabled,true);
 visit.focus();assert.equal(visit.dispatch('keydown',{key:'Tab'}).prevented,false);
 summary.focus();assert.equal(summary.dispatch('keydown',{key:'Tab'}).prevented,true);
 assert.ok(h.document.activeElement === close);
 close.dispatch('keydown',{key:'Tab',shiftKey:true});assert.ok(h.document.activeElement === summary);
});
test('expanded source links own the Tab boundary and collapse restores it to summary',async()=>{
 const h=model();await h.view.open();h.search('chatgpt');reflectNativeLinks(h.document);
 const details=h.document.querySelector('details'),summary=h.document.querySelector('summary'),close=h.document.querySelector('.navigation-library-close');
 const links=details.querySelectorAll('a'),last=links[links.length-1];assert.ok(links.length);
 details.open=true;summary.focus();assert.equal(summary.dispatch('keydown',{key:'Tab'}).prevented,false);
 last.focus();assert.equal(last.dispatch('keydown',{key:'Tab'}).prevented,true);assert.ok(h.document.activeElement === close);
 close.dispatch('keydown',{key:'Tab',shiftKey:true});assert.ok(h.document.activeElement === last);
 details.open=false;close.focus();close.dispatch('keydown',{key:'Tab',shiftKey:true});assert.ok(h.document.activeElement === summary);
});

const savedControl=(h,value)=>h.document.querySelectorAll('.navigation-library-saved-filter').find(node=>node.dataset.savedState===value);
const cards=h=>h.document.querySelectorAll('article');
const assertSavedCounts=(h,total,added)=>{
 assert.match(savedControl(h,'').textContent,new RegExp(`\\(${total}\\)$`));
 assert.match(savedControl(h,'new').textContent,new RegExp(`\\(${total-added}\\)$`));
 assert.match(savedControl(h,'added').textContent,new RegExp(`\\(${added}\\)$`));
};
test('saved filters count canonical URL matches once across categories and ignore unrelated URLs',async()=>{
 const h=model();h.snapshot.links=[{url:'https://CHATGPT.com:443',category:'personal'},{url:'https://chatgpt.com/',category:'work'},{url:'https://chatgpt.com/?other=1'},{url:'javascript:alert(1)'}];
 await h.view.open();assertSavedCounts(h,108,1);
 savedControl(h,'added').dispatch('click');assert.equal(cards(h).length,1);assert.equal(h.firstAdd().disabled,true);assert.equal(cards(h)[0].dataset.site,'chatgpt');
 savedControl(h,'new').dispatch('click');assert.equal(cards(h).length,107);assert.ok(cards(h).every(card=>card.dataset.site!=='chatgpt'));
 savedControl(h,'').dispatch('click');assert.equal(cards(h).length,108);assert.equal(h.calls,0);
});
test('saved filters combine with all discovery criteria and show contextual counts',async()=>{
 const h=model();const site=h.context.LocalItabNavigationSites[0];h.snapshot.links=[{url:site.url}];await h.view.open();
 h.document.querySelectorAll('.navigation-library-category').find(node=>node.dataset.category===site.categories[0]).dispatch('click');
 h.click('More filters');const selects=h.document.querySelectorAll('.navigation-library-filters select');
 for(const [select,value] of selects.map((select,i)=>[select,[site.tags[0],site.country,site.company,site.pricing][i]])){select.value=value;select.dispatch('change');}
 h.search(site.name);assertSavedCounts(h,1,1);savedControl(h,'new').dispatch('click');assert.equal(cards(h).length,0);assert.ok(h.document.querySelector('.navigation-library-empty'));assert.equal(h.document.querySelector('.navigation-library-count').textContent,'0 sites');
 savedControl(h,'added').dispatch('click');assert.equal(cards(h).length,1);assert.equal(savedControl(h,'added').getAttribute('aria-pressed'),'true');
 h.click('Clear filters');assertSavedCounts(h,108,1);assert.equal(cards(h).length,108);assert.equal(savedControl(h,'').getAttribute('aria-pressed'),'true');assert.equal(h.document.activeElement,h.document.querySelector('input'));assert.equal(h.calls,0);
});
test('adding in Not added removes only saved card, updates counts and focuses next card',async()=>{
 const h=model();await h.view.open();savedControl(h,'new').dispatch('click');const before=cards(h).map(card=>card.dataset.site);
 cards(h)[2].querySelector('.navigation-library-add').dispatch('click');await tick();
 assertSavedCounts(h,108,1);assert.equal(cards(h).length,107);assert.ok(!cards(h).some(card=>card.dataset.site===before[2]));assert.equal(h.document.activeElement.dataset.site,before[3]);
 assert.match(h.document.querySelector('.navigation-library-status').textContent,/Added to Work/);assert.equal(savedControl(h,'new').getAttribute('aria-pressed'),'true');
 savedControl(h,'added').dispatch('click');assert.equal(cards(h).length,1);assert.equal(cards(h)[0].dataset.site,before[2]);assert.equal(h.firstAdd().disabled,true);
});
test('adding the last Not added result preserves confirmation and focuses the empty result',async()=>{
 const h=model();await h.view.open();h.search('chatgpt');savedControl(h,'new').dispatch('click');h.firstAdd().dispatch('click');await tick();
 assertSavedCounts(h,1,1);assert.equal(cards(h).length,0);assert.equal(h.document.activeElement,h.document.querySelector('.navigation-library-empty'));assert.match(h.document.querySelector('.navigation-library-status').textContent,/ChatGPT.*Added to Work/);
 savedControl(h,'added').dispatch('click');assert.equal(cards(h).length,1);assert.equal(h.calls,1);
});
test('Not added failure retains card and counts, then successful retry removes it',async()=>{
 const h=model();const original=h.component.addCatalogShortcut;let fail=true;h.component.addCatalogShortcut=async request=>{if(fail){fail=false;throw Object.assign(new Error(),{code:'CATALOG_FAILED'});}return original(request);};
 await h.view.open();h.search('chatgpt');savedControl(h,'new').dispatch('click');h.firstAdd().dispatch('click');await tick();
 assertSavedCounts(h,1,0);assert.equal(cards(h).length,1);assert.equal(h.firstAdd().disabled,false);assert.equal(h.document.activeElement,cards(h)[0]);assert.match(h.document.querySelector('.navigation-library-status').textContent,/Nothing was added/);
 h.firstAdd().dispatch('click');await tick();assertSavedCounts(h,1,1);assert.equal(cards(h).length,0);
});
test('saved filter state remains local to dialog; fresh workspace snapshot owns all counts',async()=>{
 const h=model();h.snapshot.links=[{url:'https://chatgpt.com/'}];await h.view.open();savedControl(h,'added').dispatch('click');assertSavedCounts(h,108,1);
 assert.equal(h.view.close(),true);h.snapshot.links=[{url:'https://github.com/'}];await h.view.open();assert.equal(savedControl(h,'').getAttribute('aria-pressed'),'true');
 savedControl(h,'added').dispatch('click');assertSavedCounts(h,108,1);assert.equal(cards(h)[0].dataset.site,'github');assert.equal(h.calls,0);
});
test('cancelled old workspace read cannot overwrite the newly opened saved filter',async()=>{
 const h=model(),pending=deferred();h.read=pending;const oldOpen=h.view.open();await tick();h.view.close();
 h.read=null;h.snapshot.links=[{url:'https://github.com/'}];await h.view.open();savedControl(h,'added').dispatch('click');
 pending.resolve({...h.snapshot,links:[{url:'https://chatgpt.com/'}]});await oldOpen;
 assertSavedCounts(h,108,1);assert.equal(cards(h).length,1);assert.equal(cards(h)[0].dataset.site,'github');assert.equal(savedControl(h,'added').getAttribute('aria-pressed'),'true');assert.equal(h.calls,0);
});
test('pending filtered save locks controls and cancellation until verified late callback',async()=>{
 const h=model(),pending=deferred();h.write=pending;await h.view.open();h.search('chatgpt');savedControl(h,'new').dispatch('click');h.firstAdd().dispatch('click');
 assert.ok(h.document.querySelectorAll('.navigation-library-saved-filter').every(control=>control.disabled));assert.equal(h.view.close(),false);h.view.destroy();assert.ok(h.document.querySelector('.navigation-library-overlay'));assert.equal(h.calls,1);
 pending.resolve({...h.snapshot,links:[{url:'https://chatgpt.com/'}]});await tick();assertSavedCounts(h,1,1);assert.equal(cards(h).length,0);assert.equal(h.document.activeElement,h.document.querySelector('.navigation-library-empty'));assert.ok(h.document.querySelectorAll('.navigation-library-saved-filter').every(control=>!control.disabled));assert.equal(h.view.close(),true);
});
test('saved filter labels and group description are bilingual, including empty Added view',async()=>{
 for(const [locale,group,all,fresh,added] of [['en','Saved in this workspace','All','Not added','Added'],['zh-CN','当前工作空间添加状态','全部','未添加','已添加']]){
  const h=model({locale});await h.view.open();assert.equal(h.document.querySelector('.navigation-library-saved-filters').getAttribute('aria-label'),group);
  assert.equal(savedControl(h,'').textContent,`${all} (108)`);assert.equal(savedControl(h,'new').textContent,`${fresh} (108)`);assert.equal(savedControl(h,'added').textContent,`${added} (0)`);
  savedControl(h,'added').dispatch('click');assert.ok(h.document.querySelector('.navigation-library-empty'));assertSavedCounts(h,108,0);assert.equal(h.calls,0);
 }
});
test('adding the final card focuses its previous neighbor and duplicate callback is reflected honestly',async()=>{
 const h=model();h.context.LocalItabNavigationSites=h.context.LocalItabNavigationSites.slice(0,2);await h.view.open();savedControl(h,'new').dispatch('click');const first=cards(h)[0].dataset.site;
 const finalSite=h.context.LocalItabNavigationSites[1];h.component.addCatalogShortcut=async()=>({...h.snapshot,links:[{url:finalSite.url}],duplicate:true});
 cards(h)[1].querySelector('.navigation-library-add').dispatch('click');await tick();assertSavedCounts(h,2,1);assert.equal(h.document.activeElement.dataset.site,first);assert.match(h.document.querySelector('.navigation-library-status').textContent,/Already in your shortcuts/);
});
test('failure after an earlier successful addition focuses the attempted card, not the old success',async()=>{
 const h=model();await h.view.open();h.firstAdd().dispatch('click');await tick();
 h.component.addCatalogShortcut=async()=>{throw Object.assign(new Error(),{code:'CATALOG_FAILED'});};const attempted=cards(h)[2].dataset.site;
 cards(h)[2].querySelector('.navigation-library-add').dispatch('click');await tick();assert.equal(h.document.activeElement.dataset.site,attempted);assertSavedCounts(h,108,1);
});
test('conflict does not falsely move a Not added card into Added',async()=>{
 const h=model();h.component.addCatalogShortcut=async()=>{throw Object.assign(new Error(),{code:'CATALOG_CONFLICT'});};await h.view.open();h.search('chatgpt');savedControl(h,'new').dispatch('click');h.firstAdd().dispatch('click');await tick();
 assertSavedCounts(h,1,0);assert.equal(cards(h).length,1);assert.equal(h.firstAdd().disabled,true);assert.match(h.document.querySelector('.navigation-library-status').textContent,/Close and reopen/);
 savedControl(h,'added').dispatch('click');assert.equal(cards(h).length,0);assertSavedCounts(h,1,0);
});

test('new bilingual use filters show canonical existing sites only once across catalog categories',async()=>{
 for(const [locale,more,useLabel] of [['en','More filters','PSD editing'],['zh-CN','更多筛选','PSD 编辑']]){
  const h=model({locale});h.snapshot.links=[{title:'Renamed editor',url:'https://WWW.PHOTOPEA.com:443',category:'personal'},{title:'Other category',url:'https://www.photopea.com/',category:'work'}];
  await h.view.open();h.click(more);
  const use=h.document.querySelector('.navigation-library-filters select');
  const option=use.querySelectorAll('option').find(option=>option.value==='psd-editing');assert.equal(option.textContent,useLabel);
  use.value='psd-editing';use.dispatch('change');assertSavedCounts(h,1,1);assert.equal(cards(h).length,1);assert.equal(cards(h)[0].dataset.site,'photopea');assert.equal(h.firstAdd().disabled,true);
  for(const category of ['design','utilities']){h.document.querySelectorAll('.navigation-library-category').find(button=>button.dataset.category===category).dispatch('click');h.search('PSD');assert.equal(cards(h).length,1);assert.equal(cards(h)[0].dataset.site,'photopea');assert.equal(h.firstAdd().disabled,true);}
  assert.equal(h.calls,0);
 }
});
test('adding a new catalog entry updates saved-state counts and cannot add again',async()=>{
 const h=model();await h.view.open();h.search('JSON Crack');assertSavedCounts(h,1,0);assert.equal(cards(h)[0].dataset.site,'json-crack');savedControl(h,'new').dispatch('click');h.firstAdd().dispatch('click');await tick();
 assertSavedCounts(h,1,1);assert.equal(cards(h).length,0);savedControl(h,'added').dispatch('click');assert.equal(cards(h).length,1);assert.equal(h.firstAdd().disabled,true);assert.equal(h.snapshot.links[0].url,'https://jsoncrack.com/');assert.equal(h.calls,1);
});

const textTree=node=>[node.textContent||'',...node.children.map(textTree)].join(' ');
const pickSite=(h,id,value=true)=>{const pick=cards(h).find(card=>card.dataset.site===id).querySelector('input');pick.checked=value;pick.dispatch('change');};
const selectionCount=h=>h.document.querySelector('.navigation-library-batch span').textContent;
function batchWriter(h){let calls=0,request;h.component.addCatalogShortcut=async r=>{calls++;request=r;for(const site of r.sites)h.snapshot.links.push({title:site.name,url:site.url,category:r.destination});return {...structuredClone(h.snapshot),addedCount:r.sites.length,skippedCount:0};};return{get calls(){return calls;},get request(){return request;}};}
test('explicit batch picks survive filters; review lists every selection and chosen destination with zero writes until confirmation',async()=>{
 const h=model(),writer=batchWriter(h);await h.view.open();pickSite(h,'chatgpt');pickSite(h,'github');h.search('chatgpt');assert.equal(cards(h).length,1);assert.equal(selectionCount(h),'2 / 20 selected');
 const destination=h.document.querySelector('.navigation-library-destination select');destination.value='personal';destination.dispatch('change');h.click('Review selected');const review=h.document.querySelector('.navigation-library-review');
 assert.equal(review.hidden,false);assert.match(textTree(review),/ChatGPT/);assert.match(textTree(review),/GitHub/);assert.match(textTree(review),/Personal/);assert.equal(writer.calls,0);
 h.click('Back to browsing');assert.equal(review.hidden,true);assert.equal(selectionCount(h),'2 / 20 selected');assert.equal(writer.calls,0);
 h.click('Review selected');h.click('Confirm and add');await tick();assert.equal(writer.calls,1);assert.equal(writer.request.destination,'personal');assert.equal(writer.request.sites.length,2);assert.equal(selectionCount(h),'0 / 20 selected');assert.match(h.document.querySelector('.navigation-library-status').textContent,/2.*Added to Personal/);
 assertSavedCounts(h,1,1);assert.equal(h.firstAdd().disabled,true);assert.equal(h.document.activeElement.dataset.site,'chatgpt');
});
test('selection cap disables only additional picks; deselect and clear remain zero-write; close discards selections',async()=>{
 const h=model();await h.view.open();const ids=cards(h).slice(0,21).map(card=>card.dataset.site);for(const id of ids.slice(0,20))pickSite(h,id);
 assert.equal(selectionCount(h),'20 / 20 selected');assert.equal(cards(h)[20].querySelector('input').disabled,true);assert.equal(cards(h)[0].querySelector('input').disabled,false);
 pickSite(h,ids[0],false);assert.equal(cards(h)[20].querySelector('input').disabled,false);assert.equal(selectionCount(h),'19 / 20 selected');h.click('Clear selection');assert.equal(selectionCount(h),'0 / 20 selected');assert.equal(h.document.activeElement,h.document.querySelector('input'));
 pickSite(h,ids[1]);h.click('Review selected');h.view.close();await h.view.open();assert.equal(selectionCount(h),'0 / 20 selected');assert.equal(h.document.querySelector('.navigation-library-review').hidden,true);assert.equal(h.calls,0);
});
test('changing destination or filters invalidates visible review and cannot submit stale confirmation',async()=>{
 const h=model(),writer=batchWriter(h);await h.view.open();pickSite(h,'chatgpt');h.click('Review selected');const old=h.button('Confirm and add');
 const destination=h.document.querySelector('.navigation-library-destination select');destination.value='personal';destination.dispatch('change');assert.equal(h.document.querySelector('.navigation-library-review').hidden,true);old.dispatch('click');assert.equal(writer.calls,0);
 h.click('Review selected');assert.match(textTree(h.document.querySelector('.navigation-library-review')),/Personal/);h.search('github');assert.equal(h.document.querySelector('.navigation-library-review').hidden,true);assert.equal(selectionCount(h),'1 / 20 selected');
});
test('pending batch locks picks, target, filters and confirmation; no double submit or close until readback',async()=>{
 const h=model(),pending=deferred();let calls=0;h.component.addCatalogShortcut=async()=>{calls++;return pending.promise;};await h.view.open();pickSite(h,'chatgpt');pickSite(h,'github');h.click('Review selected');const confirm=h.button('Confirm and add');confirm.dispatch('click');confirm.dispatch('click');
 assert.equal(calls,1);assert.equal(h.view.close(),false);assert.equal(h.document.activeElement.className,'navigation-library-panel');assert.ok(h.document.querySelectorAll('input, select, button').filter(node=>node.className!=='navigation-library-opener').every(node=>node.disabled));
 pending.resolve({...h.snapshot,links:[{url:'https://chatgpt.com/'},{url:'https://github.com/'}],addedCount:1,skippedCount:1});await tick();assert.equal(selectionCount(h),'0 / 20 selected');assert.match(h.document.querySelector('.navigation-library-status').textContent,/1.*Added to Work.*1 already added, skipped/);assert.equal(h.view.close(),true);
});
for(const code of ['CATALOG_FAILED','CATALOG_CONFLICT','CATALOG_UNVERIFIED'])test(`batch ${code} retains selections without false success or automatic retry`,async()=>{
 const h=model();let calls=0;h.component.addCatalogShortcut=async()=>{calls++;throw Object.assign(new Error(),{code});};await h.view.open();pickSite(h,'chatgpt');h.click('Review selected');h.click('Confirm and add');await tick();assert.equal(calls,1);assert.equal(selectionCount(h),'1 / 20 selected');assertSavedCounts(h,108,0);assert.equal(h.document.querySelector('.navigation-library-review').hidden,true);
 assert.equal(h.button('Review selected').disabled,code!=='CATALOG_FAILED');assert.match(h.document.querySelector('.navigation-library-status').textContent,code==='CATALOG_FAILED'?/Nothing was added/:/Close and reopen/);
 if(code==='CATALOG_FAILED'){h.click('Review selected');assert.equal(calls,1);h.click('Confirm and add');await tick();assert.equal(calls,2);}
});
test('batch selection and review are bilingual and saved sites cannot be selected',async()=>{
 const h=model({locale:'zh-CN'});h.snapshot.links=[{url:'https://github.com/'}];await h.view.open();assert.equal(cards(h).find(card=>card.dataset.site==='github').querySelector('input').disabled,true);pickSite(h,'chatgpt');assert.equal(selectionCount(h),'1 / 20 已选');h.click('检查所选');assert.match(textTree(h.document.querySelector('.navigation-library-review')),/确认所选网站/);assert.equal(h.button('确认并添加'),h.document.activeElement);h.click('返回浏览');assert.equal(h.document.activeElement,h.button('检查所选'));assert.equal(h.calls,0);
});
test('batch in Not added updates counts and focuses remaining or empty results',async()=>{
 for(const size of [2,3]){const h=model(),writer=batchWriter(h);h.context.LocalItabNavigationSites=h.context.LocalItabNavigationSites.slice(0,size);await h.view.open();savedControl(h,'new').dispatch('click');const ids=cards(h).slice(0,2).map(card=>card.dataset.site);for(const id of ids)pickSite(h,id);h.click('Review selected');h.click('Confirm and add');await tick();assert.equal(writer.calls,1);assertSavedCounts(h,size,2);assert.equal(cards(h).length,size-2);assert.equal(h.document.activeElement,size===2?h.document.querySelector('.navigation-library-empty'):cards(h)[0]);}
});

test('bilingual normalized search and aliases remain offline, read-only and safe through clear and reopen',async()=>{
 for(const locale of ['en','zh-CN']){
  const h=model({locale});await h.view.open();
  for(const [query,id] of [['ＣＨＡＴ－ＧＰＴ','chatgpt'],['googlefonts','google-fonts'],['谷歌','google'],['必应','bing'],['JSON Crack','json-crack']]){
   h.search(query);assert.ok(cards(h).some(card=>card.dataset.site===id),`${locale}: ${query}`);
  }
  h.search('＜img src=x onerror=alert(1)＞');assert.equal(cards(h).length,0);assert.equal(h.document.querySelectorAll('img').length,0);
  h.search(`${'chatgpt '.repeat(1000)}no-matching-suffix`);assert.equal(cards(h).length,0);
  h.click(locale==='en'?'Clear filters':'清除筛选');assert.equal(cards(h).length,108);assert.equal(h.document.querySelector('input').value,'');
  h.search('谷歌');assert.equal(cards(h)[0].querySelector('h3').textContent,'Google');
  assert.equal(h.calls,0);assert.equal(h.snapshot.links.length,0);
  h.view.close();assert.equal(h.view.hasUncommittedWork(),false);await h.view.open();assert.equal(cards(h).length,108);assert.equal(h.calls,0);
 }
});
