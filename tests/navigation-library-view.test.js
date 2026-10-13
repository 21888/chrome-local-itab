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
 await h.view.open();assertSavedCounts(h,136,1);
 savedControl(h,'added').dispatch('click');assert.equal(cards(h).length,1);assert.equal(h.firstAdd().disabled,true);assert.equal(cards(h)[0].dataset.site,'chatgpt');
 savedControl(h,'new').dispatch('click');assert.equal(cards(h).length,135);assert.ok(cards(h).every(card=>card.dataset.site!=='chatgpt'));
 savedControl(h,'').dispatch('click');assert.equal(cards(h).length,136);assert.equal(h.calls,0);
});
test('saved filters combine with all discovery criteria and show contextual counts',async()=>{
 const h=model();const site=h.context.LocalItabNavigationSites[0];h.snapshot.links=[{url:site.url}];await h.view.open();
 h.document.querySelectorAll('.navigation-library-category').find(node=>node.dataset.category===site.categories[0]).dispatch('click');
 h.click('More filters');const selects=h.document.querySelectorAll('.navigation-library-filters select');
 for(const [select,value] of selects.map((select,i)=>[select,[site.tags[0],site.country,site.company,site.pricing][i]])){select.value=value;select.dispatch('change');}
 h.search(site.name);assertSavedCounts(h,1,1);savedControl(h,'new').dispatch('click');assert.equal(cards(h).length,0);assert.ok(h.document.querySelector('.navigation-library-empty'));assert.equal(h.document.querySelector('.navigation-library-count').textContent,'0 sites');
 savedControl(h,'added').dispatch('click');assert.equal(cards(h).length,1);assert.equal(savedControl(h,'added').getAttribute('aria-pressed'),'true');
 h.click('Clear filters');assertSavedCounts(h,136,1);assert.equal(cards(h).length,136);assert.equal(savedControl(h,'').getAttribute('aria-pressed'),'true');assert.equal(h.document.activeElement,h.document.querySelector('input'));assert.equal(h.calls,0);
});
test('adding in Not added removes only saved card, updates counts and focuses next card',async()=>{
 const h=model();await h.view.open();savedControl(h,'new').dispatch('click');const before=cards(h).map(card=>card.dataset.site);
 cards(h)[2].querySelector('.navigation-library-add').dispatch('click');await tick();
 assertSavedCounts(h,136,1);assert.equal(cards(h).length,135);assert.ok(!cards(h).some(card=>card.dataset.site===before[2]));assert.equal(h.document.activeElement.dataset.site,before[3]);
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
 const h=model();h.snapshot.links=[{url:'https://chatgpt.com/'}];await h.view.open();savedControl(h,'added').dispatch('click');assertSavedCounts(h,136,1);
 assert.equal(h.view.close(),true);h.snapshot.links=[{url:'https://github.com/'}];await h.view.open();assert.equal(savedControl(h,'').getAttribute('aria-pressed'),'true');
 savedControl(h,'added').dispatch('click');assertSavedCounts(h,136,1);assert.equal(cards(h)[0].dataset.site,'github');assert.equal(h.calls,0);
});
test('cancelled old workspace read cannot overwrite the newly opened saved filter',async()=>{
 const h=model(),pending=deferred();h.read=pending;const oldOpen=h.view.open();await tick();h.view.close();
 h.read=null;h.snapshot.links=[{url:'https://github.com/'}];await h.view.open();savedControl(h,'added').dispatch('click');
 pending.resolve({...h.snapshot,links:[{url:'https://chatgpt.com/'}]});await oldOpen;
 assertSavedCounts(h,136,1);assert.equal(cards(h).length,1);assert.equal(cards(h)[0].dataset.site,'github');assert.equal(savedControl(h,'added').getAttribute('aria-pressed'),'true');assert.equal(h.calls,0);
});
test('pending filtered save locks controls and cancellation until verified late callback',async()=>{
 const h=model(),pending=deferred();h.write=pending;await h.view.open();h.search('chatgpt');savedControl(h,'new').dispatch('click');h.firstAdd().dispatch('click');
 assert.ok(h.document.querySelectorAll('.navigation-library-saved-filter').every(control=>control.disabled));assert.equal(h.view.close(),false);h.view.destroy();assert.ok(h.document.querySelector('.navigation-library-overlay'));assert.equal(h.calls,1);
 pending.resolve({...h.snapshot,links:[{url:'https://chatgpt.com/'}]});await tick();assertSavedCounts(h,1,1);assert.equal(cards(h).length,0);assert.equal(h.document.activeElement,h.document.querySelector('.navigation-library-empty'));assert.ok(h.document.querySelectorAll('.navigation-library-saved-filter').every(control=>!control.disabled));assert.equal(h.view.close(),true);
});
test('saved filter labels and group description are bilingual, including empty Added view',async()=>{
 for(const [locale,group,all,fresh,added] of [['en','Saved in this workspace','All','Not added','Added'],['zh-CN','当前工作空间添加状态','全部','未添加','已添加']]){
  const h=model({locale});await h.view.open();assert.equal(h.document.querySelector('.navigation-library-saved-filters').getAttribute('aria-label'),group);
  assert.equal(savedControl(h,'').textContent,`${all} (136)`);assert.equal(savedControl(h,'new').textContent,`${fresh} (136)`);assert.equal(savedControl(h,'added').textContent,`${added} (0)`);
  savedControl(h,'added').dispatch('click');assert.ok(h.document.querySelector('.navigation-library-empty'));assertSavedCounts(h,136,0);assert.equal(h.calls,0);
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
 cards(h)[2].querySelector('.navigation-library-add').dispatch('click');await tick();assert.equal(h.document.activeElement.dataset.site,attempted);assertSavedCounts(h,136,1);
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
 const h=model();let calls=0;h.component.addCatalogShortcut=async()=>{calls++;throw Object.assign(new Error(),{code});};await h.view.open();pickSite(h,'chatgpt');h.click('Review selected');h.click('Confirm and add');await tick();assert.equal(calls,1);assert.equal(selectionCount(h),'1 / 20 selected');assertSavedCounts(h,136,0);assert.equal(h.document.querySelector('.navigation-library-review').hidden,true);
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
  h.click(locale==='en'?'Clear filters':'清除筛选');assert.equal(cards(h).length,136);assert.equal(h.document.querySelector('input').value,'');
  h.search('谷歌');assert.equal(cards(h)[0].querySelector('h3').textContent,'Google');
  assert.equal(h.calls,0);assert.equal(h.snapshot.links.length,0);
  h.view.close();assert.equal(h.view.hasUncommittedWork(),false);await h.view.open();assert.equal(cards(h).length,136);assert.equal(h.calls,0);
 }
});

const selectResults=h=>h.document.querySelector('.navigation-library-select-results');
const selectionHelp=h=>h.document.querySelector('.navigation-library-selection-help');
test('current-results selection counts only new picks, handles zero and Added-only results without writes',async()=>{
 const h=model();h.context.LocalItabNavigationSites=h.context.LocalItabNavigationSites.slice(0,3);h.snapshot.links=[{url:h.context.LocalItabNavigationSites[0].url}];await h.view.open();
 assert.equal(selectResults(h).textContent,'Select current results (2)');assert.equal(selectResults(h).getAttribute('aria-describedby'),selectionHelp(h).id);
 savedControl(h,'added').dispatch('click');assert.equal(selectResults(h).textContent,'Select current results (0)');assert.equal(selectResults(h).disabled,true);selectResults(h).dispatch('click');assert.equal(selectionCount(h),'0 / 20 selected');
 h.search('no-result-987');assert.equal(cards(h).length,0);assert.equal(selectResults(h).disabled,true);selectResults(h).dispatch('click');assert.equal(selectionCount(h),'0 / 20 selected');
 h.click('Clear filters');selectResults(h).focus();selectResults(h).dispatch('click');assert.equal(selectionCount(h),'2 / 20 selected');assert.equal(selectResults(h).textContent,'Select current results (0)');assert.equal(selectResults(h).disabled,true);assert.equal(h.document.activeElement,h.button('Review selected'));assert.equal(h.document.querySelector('.navigation-library-review').hidden,true);
 selectResults(h).dispatch('click');assert.equal(selectionCount(h),'2 / 20 selected');assert.equal(cards(h)[0].querySelector('input').checked,false);assert.equal(h.calls,0);
 h.click('Clear selection');assert.equal(selectResults(h).textContent,'Select current results (2)');assert.equal(h.document.activeElement,h.document.querySelector('input'));
});
test('current results merge hidden picks and overlapping selections exactly once; full review retains destination',async()=>{
 const h=model(),writer=batchWriter(h);h.context.LocalItabNavigationSites=h.context.LocalItabNavigationSites.filter(site=>['github','chatgpt'].includes(site.id));await h.view.open();h.search('github');selectResults(h).dispatch('click');h.search('chatgpt');selectResults(h).dispatch('click');assert.equal(selectionCount(h),'2 / 20 selected');
 h.search('github');assert.equal(selectResults(h).textContent,'Select current results (0)');selectResults(h).dispatch('click');assert.equal(selectionCount(h),'2 / 20 selected');
 const destination=h.document.querySelector('.navigation-library-destination select');destination.value='personal';destination.dispatch('change');h.click('Review selected');assert.match(textTree(h.document.querySelector('.navigation-library-review')),/GitHub/);assert.match(textTree(h.document.querySelector('.navigation-library-review')),/ChatGPT/);assert.match(textTree(h.document.querySelector('.navigation-library-review')),/Personal/);assert.equal(writer.calls,0);
 h.click('Back to browsing');assert.equal(h.document.activeElement,h.button('Review selected'));assert.equal(selectionCount(h),'2 / 20 selected');h.click('Review selected');h.click('Confirm and add');await tick();assert.equal(writer.calls,1);assert.equal(writer.request.sites.length,2);assert.equal(writer.request.destination,'personal');
});
test('current results never truncate 21 picks and accept exact 20 including hidden selections',async()=>{
 for(const size of [20,21]){
  const h=model();h.context.LocalItabNavigationSites=h.context.LocalItabNavigationSites.slice(0,size).map((site,i)=>({...site,description:{en:i?'visible group':'hidden group',zh:i?'visible group':'hidden group'},tags:['group'],aliases:[]}));await h.view.open();
  assert.equal(selectResults(h).disabled,size===21);assert.equal(selectResults(h).textContent,`Select current results (${size})`);
  if(size===21){assert.match(selectionHelp(h).textContent,/Narrow the filters first/);selectResults(h).dispatch('click');assert.equal(selectionCount(h),'0 / 20 selected');}
  pickSite(h,h.context.LocalItabNavigationSites[0].id);h.search('visible group');assert.equal(cards(h).length,size-1);assert.equal(selectResults(h).disabled,size===21);selectResults(h).dispatch('click');assert.equal(selectionCount(h),`${size===20?20:1} / 20 selected`);assert.equal(h.calls,0);
  if(size===21){h.search(h.context.LocalItabNavigationSites[1].name);assert.equal(selectResults(h).disabled,false);selectResults(h).dispatch('click');assert.equal(selectionCount(h),'2 / 20 selected');}
 }
});
test('current results respect category, search, tag, company, country, pricing and saved filters together',async()=>{
 const h=model();const site=h.context.LocalItabNavigationSites[0];await h.view.open();
 h.document.querySelectorAll('.navigation-library-category').find(node=>node.dataset.category===site.categories[0]).dispatch('click');h.click('More filters');
 const selects=h.document.querySelectorAll('.navigation-library-filters select');for(const [select,value] of selects.map((select,i)=>[select,[site.tags[0],site.country,site.company,site.pricing][i]])){select.value=value;select.dispatch('change');}
 h.search(site.name);savedControl(h,'new').dispatch('click');assert.equal(cards(h).length,1);assert.equal(selectResults(h).textContent,'Select current results (1)');selectResults(h).dispatch('click');assert.equal(selectionCount(h),'1 / 20 selected');h.click('Clear filters');assert.equal(selectionCount(h),'1 / 20 selected');assert.equal(h.calls,0);
});
test('current-results action cannot change review or pending save and restores availability after cancel',async()=>{
 const h=model(),pending=deferred();let calls=0;h.component.addCatalogShortcut=async()=>{calls++;return pending.promise;};h.context.LocalItabNavigationSites=h.context.LocalItabNavigationSites.slice(0,3);await h.view.open();pickSite(h,h.context.LocalItabNavigationSites[0].id);h.click('Review selected');
 assert.equal(selectResults(h).disabled,true);selectResults(h).dispatch('click');assert.equal(selectionCount(h),'1 / 20 selected');assert.equal(h.document.querySelector('.navigation-library-review').hidden,false);
 h.click('Back to browsing');assert.equal(selectResults(h).disabled,false);assert.equal(h.document.activeElement,h.button('Review selected'));selectResults(h).dispatch('click');assert.equal(selectionCount(h),'3 / 20 selected');
 h.click('Review selected');h.click('Confirm and add');assert.equal(selectResults(h).disabled,true);selectResults(h).dispatch('click');assert.equal(calls,1);assert.equal(selectionCount(h),'3 / 20 selected');assert.equal(h.document.activeElement.className,'navigation-library-panel');
 pending.resolve({...h.snapshot,links:h.context.LocalItabNavigationSites.map(site=>({url:site.url})),addedCount:3,skippedCount:0});await tick();assert.equal(selectionCount(h),'0 / 20 selected');assert.equal(selectResults(h).disabled,true);
});
test('current-results action is blocked after uncertain saves and translated without relying on English fallback',async()=>{
 const h=model({locale:'zh-CN'});await h.view.open();assert.equal(selectResults(h).textContent,'选择当前结果 (136)');assert.match(selectionHelp(h).textContent,/先收窄筛选/);h.search('chatgpt');assert.equal(selectResults(h).textContent,'选择当前结果 (1)');selectResults(h).dispatch('click');assert.equal(h.document.activeElement,h.button('检查所选'));h.click('清空选择');assert.equal(selectionCount(h),'0 / 20 已选');
 h.component.addCatalogShortcut=async()=>{throw Object.assign(new Error(),{code:'CATALOG_UNVERIFIED'});};h.firstAdd().dispatch('click');await tick();assert.equal(selectResults(h).disabled,true);selectResults(h).dispatch('click');assert.equal(selectionCount(h),'0 / 20 已选');
});

const newName=h=>h.document.querySelector('.navigation-library-new-category-panel input');
function enterNewName(h,name){if(h.document.querySelector('.navigation-library-new-category-panel').hidden)h.document.querySelector('.navigation-library-new-category').dispatch('click');const input=newName(h);input.value=name;input.dispatch('input');return input;}
function newCategoryWriter(h){let request,calls=0;h.component.addCatalogShortcut=async r=>{calls++;request=r;const category={id:'new-personal',name:r.newCategory.name};const sites=r.sites||[r.site];h.snapshot.categories.push(category);h.snapshot.links.push(...sites.map(site=>({title:site.name,url:site.url,category:category.id})));return {...structuredClone(h.snapshot),createdCategory:category,destination:category.id,addedCount:sites.length,skippedCount:0};};return{get request(){return request;},get calls(){return calls;}};}
test('new-category single review excludes other picks, freezes normalized name and baseline, and refreshes destination',async()=>{
 const h=model(),writer=newCategoryWriter(h);await h.view.open();pickSite(h,'github');enterNewName(h,'  Cafe\u0301  ');h.search('chatgpt');h.firstAdd().dispatch('click');
 const review=h.document.querySelector('.navigation-library-review');assert.match(textTree(review),/Will create personal category: Café/);assert.match(textTree(review),/ChatGPT.*https:\/\/chatgpt.com\//);assert.doesNotMatch(textTree(review),/GitHub/);assert.match(textTree(review),/Chrome Sync: Off.*Online icons: Off/);assert.equal(writer.calls,0);
 h.snapshot.state.links.push({url:'https://later.example/'});h.document.querySelector('.navigation-library-batch-confirm').dispatch('click');await tick();assert.equal(writer.calls,1);assert.equal(writer.request.site.name,'ChatGPT');assert.equal(writer.request.sites,undefined);assert.equal(writer.request.destination,undefined);assert.equal(writer.request.newCategory.name,'Café');assert.equal(writer.request.confirmedNewCategory,true);assert.equal(writer.request.baseline.links.length,0);
 assert.equal(h.document.querySelector('.navigation-library-destination select').value,'new-personal');assert.equal(newName(h).value,'');assert.equal(h.document.querySelector('.navigation-library-new-category-panel').hidden,true);assert.equal(selectionCount(h),'1 / 20 selected');assert.match(h.document.querySelector('.navigation-library-status').textContent,/Added to Café/);
});
test('new-category draft survives filters and target changes; Back and close remain zero-write',async()=>{
 const h=model();await h.view.open();pickSite(h,'chatgpt');enterNewName(h,'Reading');h.search('github');h.click('Clear filters');assert.equal(newName(h).value,'Reading');assert.equal(selectionCount(h),'1 / 20 selected');h.click('Use existing category');assert.equal(h.document.querySelector('.navigation-library-new-category-panel').hidden,true);h.click('New personal category');assert.equal(newName(h).value,'Reading');h.click('Review selected');h.click('Back to browsing');assert.equal(newName(h).value,'Reading');assert.equal(h.calls,0);h.view.close();await h.view.open();h.click('New personal category');assert.equal(newName(h).value,'');assert.equal(selectionCount(h),'0 / 20 selected');assert.equal(h.calls,0);
});
test('new-category input is empty initially and works without existing categories',async()=>{
 const h=model(),writer=newCategoryWriter(h);h.snapshot.categories=[];await h.view.open();h.click('New personal category');assert.equal(newName(h).value,'');assert.equal(h.document.activeElement,newName(h));assert.equal(h.button('Use existing category').disabled,true);h.firstAdd().dispatch('click');assert.equal(writer.calls,0);assert.match(h.document.querySelector('.navigation-library-category-error').textContent,/1–80/);enterNewName(h,'First');h.firstAdd().dispatch('click');h.document.querySelector('.navigation-library-batch-confirm').dispatch('click');await tick();assert.equal(writer.calls,1);assert.equal(h.document.querySelector('.navigation-library-destination select').value,'new-personal');h.click('New personal category');assert.equal(h.button('Use existing category').disabled,false);h.click('Use existing category');assert.equal(h.document.querySelector('.navigation-library-new-category-panel').hidden,true);
});
test('new-category Unicode validation rejects controls and normalized duplicates; permits exact 80 code points',async()=>{
 for(const name of ['', '   ', 'wOrK', ' Work ', '\tNew', 'New\u0000', 'New\u0085', '😀'.repeat(81)]){
  const h=model();await h.view.open();enterNewName(h,name);h.firstAdd().dispatch('click');assert.equal(h.document.querySelector('.navigation-library-review').hidden,true,name);assert.equal(newName(h).getAttribute('aria-invalid'),'true');assert.equal(h.calls,0);assert.ok(h.document.querySelector('.navigation-library-category-error').textContent);
 }
 const duplicate=model();duplicate.snapshot.categories.push({id:'cafe',name:'Café'});await duplicate.view.open();enterNewName(duplicate,'CAFE\u0301');duplicate.firstAdd().dispatch('click');assert.match(duplicate.document.querySelector('.navigation-library-category-error').textContent,/already exists/);
 const h=model(),writer=newCategoryWriter(h);await h.view.open();enterNewName(h,'😀'.repeat(80));h.firstAdd().dispatch('click');h.document.querySelector('.navigation-library-batch-confirm').dispatch('click');await tick();assert.equal([...writer.request.newCategory.name].length,80);
});
test('stale confirmations cannot authorize replacement reviews or edited site lists',async()=>{
 const h=model(),writer=newCategoryWriter(h);await h.view.open();enterNewName(h,'One');pickSite(h,'chatgpt');h.click('Review selected');const old=h.document.querySelector('.navigation-library-batch-confirm');enterNewName(h,'Two');h.click('Review selected');old.dispatch('click');assert.equal(writer.calls,0);const second=h.document.querySelector('.navigation-library-batch-confirm');pickSite(h,'github');h.click('Review selected');second.dispatch('click');assert.equal(writer.calls,0);h.document.querySelector('.navigation-library-batch-confirm').dispatch('click');await tick();assert.equal(writer.request.newCategory.name,'Two');assert.equal(writer.request.sites.length,2);
});
test('new-category IME, pending and detached controls never bypass review or submit twice',async()=>{
 const h=model(),pending=deferred();let calls=0,request;h.component.addCatalogShortcut=async r=>{calls++;request=r;return pending.promise;};await h.view.open();const input=enterNewName(h,'IME');input.dispatch('compositionstart');h.firstAdd().dispatch('click');assert.equal(h.document.querySelector('.navigation-library-review').hidden,true);input.dispatch('keydown',{key:'Escape',isComposing:true});assert.ok(h.document.querySelector('.navigation-library-overlay'));input.dispatch('compositionend');h.firstAdd().dispatch('click');const confirm=h.document.querySelector('.navigation-library-batch-confirm');confirm.dispatch('click',{isComposing:true});assert.equal(calls,0);confirm.dispatch('click');confirm.dispatch('click');assert.equal(calls,1);assert.equal(h.view.close(),false);assert.equal(input.disabled,true);assert.equal(h.document.activeElement.className,'navigation-library-panel');pending.resolve({...h.snapshot,createdCategory:{id:'ime',name:request.newCategory.name},destination:'ime',categories:[...h.snapshot.categories,{id:'ime',name:'IME'}],links:[{url:request.site.url}]});await tick();assert.equal(h.view.pending,false);
});
for(const code of ['CATALOG_CATEGORY_NAME','CATALOG_CATEGORY_EXISTS','CATALOG_FAILED'])test(`new-category ${code} permits editing but always requires a fresh review`,async()=>{
 const h=model();let calls=0;h.component.addCatalogShortcut=async()=>{calls++;throw Object.assign(new Error(),{code});};await h.view.open();enterNewName(h,'One');h.firstAdd().dispatch('click');const old=h.document.querySelector('.navigation-library-batch-confirm');old.dispatch('click');await tick();assert.equal(calls,1);assert.equal(h.document.querySelector('.navigation-library-review').hidden,true);enterNewName(h,'Two');h.firstAdd().dispatch('click');old.dispatch('click');assert.equal(calls,1);h.document.querySelector('.navigation-library-batch-confirm').dispatch('click');await tick();assert.equal(calls,2);
});
test('new-category all-duplicate result creates no destination and reports no category creation',async()=>{
 const h=model();h.component.addCatalogShortcut=async()=>({...h.snapshot,createdCategory:null,destination:null,duplicate:true,addedCount:0,skippedCount:1});await h.view.open();enterNewName(h,'Unused');h.firstAdd().dispatch('click');h.document.querySelector('.navigation-library-batch-confirm').dispatch('click');await tick();assert.equal(h.document.querySelector('.navigation-library-destination select').children.length,2);assert.match(h.document.querySelector('.navigation-library-status').textContent,/No category was created/);assert.equal(newName(h).value,'Unused');assert.equal(h.document.querySelector('.navigation-library-new-category-panel').hidden,false);
});
test('new-category Chinese labels and review render category text safely',async()=>{
 const h=model({locale:'zh-CN'});await h.view.open();assert.ok(h.button('新建个人分类'));enterNewName(h,'<img src=x onerror=alert(1)>');h.firstAdd().dispatch('click');assert.match(textTree(h.document.querySelector('.navigation-library-review')),/将新建个人分类: <img/);assert.equal(h.document.querySelectorAll('img').length,0);assert.ok(h.button('使用已有分类'));assert.equal(h.calls,0);
});

const removeControls=h=>h.document.querySelectorAll('.navigation-library-review-remove');
test('review removes hidden selection while preserving filters, destination and fresh confirmation ownership',async()=>{
 const h=model(),writer=batchWriter(h);await h.view.open();for(const id of ['chatgpt','github','figma'])pickSite(h,id);
 const dest=h.document.querySelector('.navigation-library-destination select');dest.value='personal';dest.dispatch('change');
 h.search('figma');savedControl(h,'new').dispatch('click');h.click('Review selected');
 const staleConfirm=h.button('Confirm and add'),staleCancel=h.button('Back to browsing'),staleRemove=removeControls(h)[0];
 const removedName=staleRemove.getAttribute('aria-label').split(': ')[1];
 staleRemove.dispatch('click',{detail:1});assert.equal(selectionCount(h),'2 / 20 selected');assert.equal(cards(h).length,1);assert.equal(h.document.querySelector('input').value,'figma');assert.equal(dest.value,'personal');assert.equal(savedControl(h,'new').getAttribute('aria-pressed'),'true');
 assert.equal(h.document.activeElement,removeControls(h)[0]);assert.notEqual(h.button('Confirm and add'),staleConfirm);
 staleConfirm.dispatch('click');staleCancel.dispatch('click');staleRemove.dispatch('click');staleRemove.dispatch('click',{detail:2});
 assert.equal(writer.calls,0);assert.equal(selectionCount(h),'2 / 20 selected');assert.equal(h.document.querySelector('.navigation-library-review').hidden,false);
 h.button('Confirm and add').dispatch('click');await tick();assert.equal(writer.calls,1);assert.equal(writer.request.sites.length,2);assert(!writer.request.sites.some(site=>site.name===removedName));assert.equal(writer.request.destination,'personal');assert(Object.isFrozen(writer.request.sites));assert(Object.isFrozen(writer.request.sites[0]));assert(Object.isFrozen(writer.request.baseline));
});
test('removal keeps normalized new category draft and creates only remaining sites',async()=>{
 const h=model(),writer=newCategoryWriter(h);await h.view.open();pickSite(h,'chatgpt');pickSite(h,'github');enterNewName(h,'  Cafe\u0301  ');h.search('no-visible-site');h.click('Review selected');
 const old=h.document.querySelector('.navigation-library-batch-confirm');removeControls(h)[1].dispatch('click');
 assert.equal(newName(h).value,'  Cafe\u0301  ');assert.equal(h.document.querySelector('.navigation-library-new-category-panel').hidden,false);assert.equal(h.document.querySelector('input').value,'no-visible-site');assert.equal(h.document.activeElement,removeControls(h)[0]);
 assert.match(h.document.querySelector('.navigation-library-batch-confirm').textContent,/\(1\)/);old.dispatch('click');assert.equal(writer.calls,0);
 h.document.querySelector('.navigation-library-batch-confirm').dispatch('click');await tick();assert.equal(writer.request.sites.length,1);assert.equal(writer.request.sites[0].name,'ChatGPT');assert.equal(writer.request.newCategory.name,'Café');
});
test('last removal exits review, focuses search, keeps draft, and old controls cannot act after reselection',async()=>{
 const h=model();await h.view.open();pickSite(h,'chatgpt');enterNewName(h,'Reading');h.search('github');h.click('Review selected');
 const oldConfirm=h.document.querySelector('.navigation-library-batch-confirm'),oldRemove=removeControls(h)[0];oldRemove.dispatch('click');
 assert.equal(selectionCount(h),'0 / 20 selected');assert.equal(h.document.querySelector('.navigation-library-review').hidden,true);assert.equal(h.document.activeElement,h.document.querySelector('input'));assert.equal(newName(h).value,'Reading');assert.equal(h.button('Review selected').disabled,true);
 pickSite(h,'github');h.click('Review selected');oldConfirm.dispatch('click');oldRemove.dispatch('click');assert.equal(h.calls,0);assert.equal(selectionCount(h),'1 / 20 selected');
});
test('review removal releases full selection capacity and repeated or composing activation is harmless',async()=>{
 const h=model();await h.view.open();for(const site of h.context.LocalItabNavigationSites.slice(0,20))pickSite(h,site.id);h.click('Review selected');const remove=removeControls(h)[0];
 for(const key of ['Enter',' '])assert.equal(remove.dispatch('keydown',{key,repeat:true}).prevented,true);assert.equal(remove.dispatch('keydown',{key:'Tab',repeat:true}).prevented,false);
 for(const fields of [{detail:2},{repeat:true},{isComposing:true},{keyCode:229}])remove.dispatch('click',fields);assert.equal(selectionCount(h),'20 / 20 selected');
 remove.dispatch('click');remove.dispatch('click');assert.equal(selectionCount(h),'19 / 20 selected');h.click('Back to browsing');
 const site=h.context.LocalItabNavigationSites[20];assert.equal(cards(h).find(card=>card.dataset.site===site.id).querySelector('input').disabled,false);pickSite(h,site.id);assert.equal(selectionCount(h),'20 / 20 selected');assert.equal(h.calls,0);
});
test('pending confirmation disables removal and does not change reviewed sites',async()=>{
 const h=model(),pending=deferred();let request,calls=0;h.component.addCatalogShortcut=async r=>{request=r;calls++;return pending.promise;};await h.view.open();pickSite(h,'chatgpt');pickSite(h,'github');h.click('Review selected');const removes=removeControls(h);h.click('Confirm and add');
 assert(removes.every(node=>node.disabled));removes[0].dispatch('click');assert.equal(selectionCount(h),'2 / 20 selected');assert.equal(request.sites.length,2);assert.equal(calls,1);assert.equal(h.document.activeElement.className,'navigation-library-panel');
 pending.resolve({...h.snapshot,links:request.sites.map(site=>({url:site.url})),addedCount:2,skippedCount:0});await tick();assert.equal(selectionCount(h),'0 / 20 selected');
});
test('single new category review stays read-only and removal text is translated and safely rendered',async()=>{
 const single=model();await single.view.open();pickSite(single,'github');enterNewName(single,'Single');single.firstAdd().dispatch('click');assert.equal(removeControls(single).length,0);assert.equal(selectionCount(single),'1 / 20 selected');
 const h=model({locale:'zh-CN'});h.context.LocalItabNavigationSites[0]={...h.context.LocalItabNavigationSites[0],name:'<img src=x onerror=alert(1)>'};await h.view.open();pickSite(h,'chatgpt');h.click('检查所选');assert.equal(removeControls(h)[0].textContent,'移出所选');assert.equal(removeControls(h)[0].getAttribute('aria-label'),'移出所选: <img src=x onerror=alert(1)>');assert.equal(h.document.querySelectorAll('img').length,0);removeControls(h)[0].dispatch('click');assert.equal(selectionCount(h),'0 / 20 已选');
});

test('six service additions support local bilingual discovery, review cancellation and one explicit batch save',async()=>{
 for(const locale of ['en','zh-CN']){
  const h=model({locale}),writer=batchWriter(h);await h.view.open();
  const ids=['google-scholar','tunein','stack-exchange','ebay','rome2rio','17track'];
  const queries=locale==='en'?['scholarly','radio','cooking','pre-owned','ferries','package']:['学术','广播','烹饪','二手','轮渡','包裹'];
  for(const [index,id] of ids.entries()){h.search(queries[index]);assert.ok(cards(h).some(card=>card.dataset.site===id),id);pickSite(h,id);}
  h.click(locale==='en'?'Review selected':'检查所选');assert.equal(writer.calls,0);
  h.click(locale==='en'?'Back to browsing':'返回浏览');assert.equal(writer.calls,0);
  h.click(locale==='en'?'Review selected':'检查所选');h.click(locale==='en'?'Confirm and add':'确认并添加');await tick();
  assert.equal(writer.calls,1);assert.deepEqual(Array.from(writer.request.sites,site=>site.url),ids.map(id=>h.context.LocalItabNavigationSites.find(site=>site.id===id).url));
  h.click(locale==='en'?'Clear filters':'清除筛选');assertSavedCounts(h,136,6);
  savedControl(h,'added').dispatch('click');assert.equal(cards(h).length,6);assert.ok(cards(h).every(card=>card.querySelector('.navigation-library-add').disabled));
 }
});

test('folded active filters expose localized values, individual removal and predictable focus', async () => {
 for (const locale of ['en','zh-CN']) {
  const h=model({locale});await h.view.open();
  const selects=h.document.querySelectorAll('.navigation-library-filters select');
  for(const [index,value] of [[0,'chat'],[1,'US'],[2,'OpenAI'],[3,'freemium']]) {
   selects[index].value=value;selects[index].dispatch('change');
  }
  const toggle=h.document.querySelector('.navigation-library-filter-toggle');
  assert.match(toggle.textContent,/\(4\)$/);
  const group=h.document.querySelector('.navigation-library-active-filters');
  assert.equal(group.hidden,false);assert.equal(h.document.querySelector('.navigation-library-filters').hidden,true);
  const chips=()=>group.querySelectorAll('button');
  assert.match(chips()[1].children[0].textContent,/\(US\)/);
  assert.match(chips()[2].children[0].textContent,/OpenAI/);
  assert.match(chips()[3].children[0].textContent,locale==='en'?/Free \+ paid plans/:/免费/);
  assert.match(chips()[0].getAttribute('aria-label'),locale==='en'?/^Remove filter: Use:/:/^移除筛选: 用途:/);
  chips()[1].focus();const retired=chips()[1];retired.dispatch('click');
  assert.equal(selects[1].value,'');assert.equal(h.document.activeElement.dataset.filter,'company');
  assert.equal(chips().length,3);retired.dispatch('click');assert.equal(chips().length,3);
  chips()[2].dispatch('click');assert.equal(h.document.activeElement.dataset.filter,'company');
  chips()[0].dispatch('click');assert.equal(h.document.activeElement.dataset.filter,'company');
  chips()[0].dispatch('click');assert.equal(h.document.activeElement,toggle);
  assert.equal(group.hidden,true);assert.doesNotMatch(toggle.textContent,/\(\d+\)/);assert.equal(h.calls,0);
 }
});

test('switching category retires only the purpose chip and exposes restrictive folded filters',async()=>{
 const h=model();await h.view.open();
 const selects=h.document.querySelectorAll('.navigation-library-filters select');
 for(const [index,value] of [[0,'chat'],[1,'US'],[2,'OpenAI']]) {selects[index].value=value;selects[index].dispatch('change');}
 h.document.querySelectorAll('.navigation-library-category').find(node=>node.dataset.category==='shopping').dispatch('click');
 assert.equal(h.document.querySelector('.navigation-library-empty')!==null,true);
 const chips=()=>h.document.querySelectorAll('.navigation-library-active-filter');
 assert.deepEqual(chips().map(node=>node.dataset.filter),['country','company']);
 assert.match(h.document.querySelector('.navigation-library-filter-toggle').textContent,/\(2\)$/);
 chips()[1].dispatch('click');
 assert.ok(h.document.querySelectorAll('article').length);
 assert.equal(selects[1].value,'US');
 assert.equal(h.document.querySelectorAll('.navigation-library-category').find(node=>node.dataset.category==='shopping').getAttribute('aria-pressed'),'true');
 h.click('Clear filters');assert.equal(chips().length,0);assert.equal(h.calls,0);
});

test('active filter labels render hostile long company text literally and wrap in either theme',async()=>{
 const h=model(),company='<img src=x onerror=alert(1)>'+ 'SyntheticCompany'.repeat(30);
 h.context.LocalItabNavigationSites[0]={...h.context.LocalItabNavigationSites[0],company};
 await h.view.open();const select=h.document.querySelectorAll('.navigation-library-filters select')[2];
 select.value=company;select.dispatch('change');
 const chip=h.document.querySelector('.navigation-library-active-filter');
 assert.ok(chip.children[0].textContent.includes(company));assert.equal(h.document.querySelectorAll('img').length,0);
 const css=fs.readFileSync('navigation-library.css','utf8');
 assert.match(css,/navigation-library-active-filters \{[^}]*flex-wrap: wrap/);
 assert.match(css,/navigation-library-active-filter \{[^}]*max-width: 100%[^}]*background: var\(--nl-selected\)[^}]*color: var\(--nl-accent\)/);
 assert.match(css,/navigation-library-active-filter > span:first-child \{[^}]*overflow-wrap: anywhere; white-space: normal/);
});

test('active filter removal ignores IME, repeats, pending writes and detached controls',async()=>{
 const h=model();await h.view.open();
 const select=h.document.querySelectorAll('.navigation-library-filters select')[1];select.value='US';select.dispatch('change');
 const chip=h.document.querySelector('.navigation-library-active-filter');
 for(const event of [{isComposing:true},{repeat:true},{detail:2}]) chip.dispatch('click',event);
 assert.equal(select.value,'US');
 let prevented=false;chip.dispatch('keydown',{key:'Enter',repeat:true,preventDefault(){prevented=true;}});assert.equal(prevented,true);
 h.document.querySelector('.navigation-library-panel').dispatch('compositionstart');chip.dispatch('click');assert.equal(select.value,'US');
 h.document.querySelector('.navigation-library-panel').dispatch('compositionend');
 const pending=deferred();h.write=pending;h.firstAdd().dispatch('click');assert.equal(chip.disabled,true);chip.dispatch('click');assert.equal(select.value,'US');
 pending.resolve({...h.snapshot,duplicate:true});await tick();
 h.view.close();await h.view.open();chip.dispatch('click');
 assert.equal(h.document.querySelector('.navigation-library-active-filters').hidden,true);assert.equal(h.calls,1);
});

test('six specialized services support local bilingual discovery, review cancellation and one explicit batch save',async()=>{
 for(const locale of ['en','zh-CN']){
  const h=model({locale}),writer=batchWriter(h);await h.view.open();
  const ids=['phet','wave','onet-online','we-work-remotely','google-dataset-search','google-ads-transparency'];
  const queries=locale==='en'?['physics','accessibility','occupations','remote roles','datasets','advertiser']:['物理','无障碍','职业','远程','数据集','广告主'];
  for(const [index,id] of ids.entries()){h.search(queries[index]);assert.ok(cards(h).some(card=>card.dataset.site===id),id);pickSite(h,id);}
  h.click(locale==='en'?'Review selected':'检查所选');assert.equal(writer.calls,0);
  h.click(locale==='en'?'Back to browsing':'返回浏览');assert.equal(writer.calls,0);
  h.click(locale==='en'?'Review selected':'检查所选');h.click(locale==='en'?'Confirm and add':'确认并添加');await tick();
  assert.equal(writer.calls,1);assert.deepEqual(Array.from(writer.request.sites,site=>site.url),ids.map(id=>h.context.LocalItabNavigationSites.find(site=>site.id===id).url));
  h.click(locale==='en'?'Clear filters':'清除筛选');assertSavedCounts(h,136,6);
  savedControl(h,'added').dispatch('click');assert.equal(cards(h).length,6);assert.ok(cards(h).every(card=>card.querySelector('.navigation-library-add').disabled));
 }
});

test('every catalog card discloses all localized purposes and category memberships',async()=>{
 for(const locale of ['en','zh-CN']) {
  const h=model({locale}),language=locale==='en'?'en':'zh';await h.view.open();
  const dictionary=JSON.parse(fs.readFileSync(`_locales/${language==='zh'?'zh_CN':'en'}/messages.json`));
  for(const card of h.document.querySelectorAll('article')) {
   const site=h.context.LocalItabNavigationSites.find(site=>site.id===card.dataset.site),details=card.querySelector('details');
   assert.equal(Boolean(details.open),false);
   const labels=details.querySelectorAll('dt').map(node=>node.textContent),values=details.querySelectorAll('dd').map(node=>node.textContent);
   assert.deepEqual(labels,locale==='en'?['All uses','Categories']:['完整用途','所属分类']);
   const purposes=site.tags.map(tag=>dictionary[`navigationTag${tag.split(/[-_]/).map(part=>part[0]?.toUpperCase()+part.slice(1)).join('')}`]?.message||tag.replace(/[-_]/g,' '));
   assert.deepEqual(details.querySelectorAll('.navigation-library-tag').map(node=>node.textContent),Array.from(purposes));
   assert.equal(values[1],site.categories.map(id=>h.context.LocalItabNavigationCatalog.categories.find(category=>category.id===id)[language]).join(' · '));
   const badge=card.querySelector('.navigation-library-more-uses');
   assert.equal(Boolean(badge),site.tags.length>2);
   if(badge)assert.equal(badge.textContent,`+${site.tags.length-2} ${locale==='en'?(site.tags.length===3?'more use in details':'more uses in details'):'项用途见详情'}`);
   assert.equal(card.querySelector('.navigation-library-tags').children.length,Math.min(2,site.tags.length)+1+(site.tags.length>2?1:0));
   assert.ok(details.querySelectorAll('p').some(node=>node.textContent.startsWith(locale==='en'?'Pricing:':'定价:')));
  }
  assert.equal(h.calls,0);
 }
});
test('one or two purposes never render an empty more-uses hint',async()=>{
 for(const tags of [['chat'],['chat','writing']]){
  const h=model();h.context.LocalItabNavigationSites=[{...h.context.LocalItabNavigationSites[0],tags}];await h.view.open();
  assert.equal(h.document.querySelector('.navigation-library-more-uses'),null);
  assert.equal(h.document.querySelectorAll('details .navigation-library-tag').map(node=>node.textContent).join(' · '),tags.map(tag=>tag==='chat'?'Chat assistants':'Writing').join(' · '));
 }
});
test('searching and filtering a third purpose leaves that purpose available in card details',async()=>{
 for(const locale of ['en','zh-CN']){
  const h=model({locale});h.context.LocalItabNavigationSites=[{...h.context.LocalItabNavigationSites[0],tags:['chat','search','writing'],categories:['ai','office']}];await h.view.open();
  h.search(locale==='en'?'writing':'写作');
  assert.equal(h.document.querySelectorAll('article').length,1);
  assert.match(h.document.querySelectorAll('details .navigation-library-tag').map(node=>node.textContent).join(' · '),locale==='en'?/Writing/:/写作/);
  h.search('');const select=h.document.querySelector('.navigation-library-filters select');select.value='writing';select.dispatch('change');
  const card=h.document.querySelector('article');assert.ok(card);
  assert.match(card.querySelectorAll('details .navigation-library-tag').map(node=>node.textContent).join(' · '),locale==='en'?/Writing/:/写作/);
  assert.equal(card.querySelectorAll('details dd')[1].textContent,locale==='en'?'AI · Productivity':'AI 工具 · 办公');
  assert.equal(h.calls,0);
 }
});
test('complete purpose and category metadata remains literal, wrapping local purpose buttons without extra links',async()=>{
 const h=model(),hostile='<img src=x onerror=alert(1)>'+ 'x'.repeat(400);
 h.context.LocalItabNavigationSites=[{...h.context.LocalItabNavigationSites[0],tags:['chat','search',hostile],categories:['ai','office']}];await h.view.open();
 const details=h.document.querySelector('details');assert.equal(h.document.querySelectorAll('img').length,0);
 assert.ok(details.querySelectorAll('.navigation-library-tag').some(node=>node.textContent===hostile));
 assert.equal(details.querySelectorAll('dd')[1].textContent,'AI · Productivity');
 assert.equal(details.querySelectorAll('button, input, select').length,3);
 assert.equal(details.querySelectorAll('a').length,h.context.LocalItabNavigationSites[0].sources.length);
 const css=fs.readFileSync('navigation-library.css','utf8');
 assert.match(css,/\.navigation-library-tags span\s*\{[^}]*max-width: 100%[^}]*overflow-wrap: anywhere/);
 assert.match(css,/\.navigation-library-metadata dd\s*\{[^}]*margin: 2px 0 0[^}]*overflow-wrap: anywhere/);
 assert.doesNotMatch(fs.readFileSync('shared/navigation-library-view.js','utf8'),/innerHTML|insertAdjacentHTML/);
 assert.equal(h.calls,0);
});


const countrySelect = h => h.document.querySelectorAll('.navigation-library-filters select')[1];
const countryDetail = (card, label) => card.querySelectorAll('details p').find(node => node.textContent.startsWith(`${label}: `));
test('operator country names agree in options, active chips and details while ISO filtering stays unchanged', async () => {
 for (const [locale, expected] of [['en', 'United States (US)'], ['zh-CN', '美国 (US)']]) {
  const h = model({locale});
  const dictionary = JSON.parse(fs.readFileSync(`_locales/${locale === 'zh-CN' ? 'zh_CN' : 'en'}/messages.json`));
  const countryTitle = dictionary.navigationLibraryCountry.message;
  const original = JSON.stringify(h.context.LocalItabNavigationSites);
  await h.view.open();
  const select = countrySelect(h), option = select.querySelectorAll('option').find(node => node.value === 'US');
  assert.equal(option.textContent, expected);
  select.value = 'US'; select.dispatch('change');
  assert.equal(select.value, 'US');
  const expectedSites = h.context.LocalItabNavigationSites.filter(site => site.country === 'US');
  assert.deepEqual(cards(h).map(card => card.dataset.site), Array.from(expectedSites, site => site.id));
  for (const card of cards(h)) assert.equal(countryDetail(card, countryTitle).textContent, `${countryTitle}: ${expected}`);
  const chip = h.document.querySelectorAll('.navigation-library-active-filter').find(node => node.dataset.filter === 'country');
  assert.equal(chip.querySelector('span').textContent, `${countryTitle}: ${expected}`);
  h.search('chatgpt'); assert.equal(cards(h).length, 1); assert.equal(cards(h)[0].dataset.site, 'chatgpt');
  h.document.querySelectorAll('.navigation-library-active-filter').find(node => node.dataset.filter === 'country').dispatch('click'); assert.equal(select.value, '');
  assert.equal(JSON.stringify(h.context.LocalItabNavigationSites), original); assert.equal(h.calls, 0);
 }
});
test('unknown operator country uses translated unknown everywhere without querying Intl', async () => {
 for (const locale of ['en', 'zh-CN']) {
  const h = model({locale}); h.context.LocalItabNavigationSites = [{...h.context.LocalItabNavigationSites[0], country: 'unknown'}];
  let calls = 0; h.context.Intl = {DisplayNames: class { constructor() { calls++; throw new Error('unexpected'); } }};
  await h.view.open(); const select = countrySelect(h), expected = h.context.i18n.t('navigationLibraryUnknown'), title = h.context.i18n.t('navigationLibraryCountry');
  assert.equal(select.querySelectorAll('option')[1].textContent, expected);
  assert.equal(countryDetail(cards(h)[0], title).textContent, `${title}: ${expected}`);
  select.value = 'unknown'; select.dispatch('change');
  assert.equal(h.document.querySelector('.navigation-library-active-filter span').textContent, `${title}: ${expected}`);
  assert.equal(cards(h).length, 1); assert.equal(select.value, 'unknown'); assert.equal(calls, 0);
 }
});
test('missing, throwing and malformed Intl region names fall back safely to the ISO value', async () => {
 const broken = [undefined, {}, {DisplayNames: null}, {DisplayNames: class {constructor(){throw new Error('unsupported');}}},
  {DisplayNames: class {of(){throw new Error('invalid region');}}},
  ...[undefined, null, '', '  ', 12, {}, {toString(){throw new Error('must not coerce');}}, 'US'].map(name => ({DisplayNames: class {of(){return name;}}}))];
 for (const intl of broken) {
  const h = model(); h.context.Intl = intl; h.context.LocalItabNavigationSites = [{...h.context.LocalItabNavigationSites[0], country: 'US'}];
  assert.equal(await h.view.open(), true);
  const select = countrySelect(h); assert.equal(select.querySelectorAll('option')[1].textContent, 'US');
  assert.equal(countryDetail(cards(h)[0], 'Operator location').textContent, 'Operator location: US');
  select.value = 'US'; select.dispatch('change');
  assert.equal(h.document.querySelector('.navigation-library-active-filter span').textContent, 'Operator location: US');
  assert.equal(cards(h).length, 1); assert.equal(select.value, 'US'); assert.equal(h.calls, 0);
 }
});
test('region display names remain literal text in every country label', async () => {
 const h = model(), name = '<img src=x onerror=alert(1)>';
 h.context.Intl = {DisplayNames: class {of(){return name;}}};
 h.context.LocalItabNavigationSites = [{...h.context.LocalItabNavigationSites[0], country: 'US'}];
 await h.view.open(); const select = countrySelect(h); assert.equal(select.querySelectorAll('option')[1].textContent, `${name} (US)`);
 assert.equal(countryDetail(cards(h)[0], 'Operator location').textContent, `Operator location: ${name} (US)`);
 select.value = 'US'; select.dispatch('change');
 assert.equal(h.document.querySelector('.navigation-library-active-filter span').textContent, `Operator location: ${name} (US)`);
 assert.equal(h.document.querySelectorAll('img').length, 0);
 assert.doesNotMatch(fs.readFileSync('shared/navigation-library-view.js', 'utf8'), /innerHTML|insertAdjacentHTML/);
});

function sourceDetails(h, id) {
 return h.document.querySelectorAll('article').find(card=>card.dataset.site===id)?.querySelector('details');
}
function toggleDetails(node, open, deliver=true) {
 node.open=open;
 if(deliver)node.dispatch('toggle');
}
test('multiple source disclosures survive selection and target edits without stealing input focus',async()=>{
 const h=model();h.context.LocalItabNavigationSites=h.context.LocalItabNavigationSites.slice(0,3);await h.view.open();
 const [first,second,third]=h.context.LocalItabNavigationSites.map(site=>site.id);
 toggleDetails(sourceDetails(h,first),true);toggleDetails(sourceDetails(h,second),true);
 const pick=h.document.querySelector('article input');pick.checked=true;pick.dispatch('change');
 assert.equal(sourceDetails(h,first).open,true);assert.equal(sourceDetails(h,second).open,true);assert.equal(sourceDetails(h,third).open,false);
 assert.ok(h.document.activeElement===h.document.querySelector('article input'));
 const target=h.document.querySelector('.navigation-library-destination select');target.focus();target.value='personal';target.dispatch('change');
 assert.ok(h.document.activeElement===target);assert.equal(sourceDetails(h,first).open,true);assert.equal(sourceDetails(h,second).open,true);
 h.click('New personal category');const name=h.document.querySelector('.navigation-library-new-category-panel input');
 for(const value of ['R','Research']){name.value=value;name.dispatch('input');assert.ok(h.document.activeElement===name);assert.equal(sourceDetails(h,first).open,true);assert.equal(sourceDetails(h,second).open,true);}
 h.click('Use existing category');assert.ok(h.document.activeElement===target);assert.equal(sourceDetails(h,first).open,true);
 h.click('Clear selection');assert.equal(sourceDetails(h,second).open,true);assert.equal(h.calls,0);
});
test('source disclosures follow stable site IDs through hidden and zero results, not result positions',async()=>{
 const h=model();h.context.LocalItabNavigationSites=h.context.LocalItabNavigationSites.slice(0,3);await h.view.open();
 const [first,second,third]=h.context.LocalItabNavigationSites.map(site=>site.id);
 toggleDetails(sourceDetails(h,first),true);toggleDetails(sourceDetails(h,second),true);
 const input=h.document.querySelector('input');input.focus();h.search('no-match-837284');assert.ok(h.document.activeElement===input);
 assert.equal(h.document.querySelectorAll('details').length,0);
 h.context.LocalItabNavigationSites.reverse();h.search('');
 assert.equal(sourceDetails(h,first).open,true);assert.equal(sourceDetails(h,second).open,true);assert.equal(sourceDetails(h,third).open,false);
 toggleDetails(sourceDetails(h,second),false);h.search('no-match-837284');h.search('');
 assert.equal(sourceDetails(h,first).open,true);assert.equal(sourceDetails(h,second).open,false);assert.equal(h.calls,0);
});
test('queued native toggles preserve the latest live open property before a synchronous rerender',async()=>{
 const h=model();await h.view.open();const id=h.context.LocalItabNavigationSites[0].id;
 const original=sourceDetails(h,id);toggleDetails(original,true,false);h.search('chatgpt');
 assert.equal(sourceDetails(h,id).open,true);
 original.open=false;original.dispatch('toggle');h.search('');assert.equal(sourceDetails(h,id).open,true);
 const current=sourceDetails(h,id);toggleDetails(current,false,false);h.search('chatgpt');
 assert.equal(sourceDetails(h,id).open,false);
 current.open=true;current.dispatch('toggle');h.search('');assert.equal(sourceDetails(h,id).open,false);
});
test('closing and reopening clears disclosure state and ignores late old-session toggles and selection',async()=>{
 const h=model();await h.view.open();const id=h.context.LocalItabNavigationSites[0].id;
 const old=sourceDetails(h,id),oldPick=h.document.querySelector('article input');toggleDetails(old,true);
 h.view.close();old.dispatch('toggle');await h.view.open();assert.equal(sourceDetails(h,id).open,false);
 old.dispatch('toggle');oldPick.checked=true;oldPick.dispatch('change');h.search('chatgpt');
 assert.equal(sourceDetails(h,id).open,false);assert.equal(h.document.querySelector('article input').checked,false);
 toggleDetails(sourceDetails(h,id),true);old.open=false;old.dispatch('toggle');h.search('');
 assert.equal(sourceDetails(h,id).open,true);assert.equal(h.calls,0);
});
test('rerender preserves source summary and source-link focus, with safe fallback for removed results',async()=>{
 const h=model();await h.view.open();const id=h.context.LocalItabNavigationSites[0].id;
 let details=sourceDetails(h,id);details.querySelector('summary').focus();h.search('chatgpt');
 assert.ok(h.document.activeElement===sourceDetails(h,id).querySelector('summary'));
 details=sourceDetails(h,id);toggleDetails(details,true);details.querySelectorAll('a')[1].focus();h.search('');
 assert.ok(h.document.activeElement===sourceDetails(h,id).querySelectorAll('a')[1]);
 h.search('no-match-98792');assert.ok(h.document.activeElement===h.document.querySelector('.navigation-library-empty'));
 h.search('');details=sourceDetails(h,id);details.querySelector('summary').focus();h.search('claude');
 assert.ok(h.document.activeElement===h.document.querySelector('input'));
 assert.equal(h.calls,0);
});

test('four daily utilities support local bilingual discovery, review cancellation and one explicit batch save',async()=>{
 for(const locale of ['en','zh-CN']){
  const h=model({locale}),writer=batchWriter(h);await h.view.open();
  const ids=['usa-gov','ifixit','lichess','buffer'];
  const queries=locale==='en'?['government','repair','chess','scheduling']:['政府','维修','国际象棋','排期'];
  for(const [index,id] of ids.entries()){h.search(queries[index]);assert.ok(cards(h).some(card=>card.dataset.site===id),id);pickSite(h,id);}
  h.click(locale==='en'?'Review selected':'检查所选');assert.equal(writer.calls,0);
  h.click(locale==='en'?'Back to browsing':'返回浏览');assert.equal(writer.calls,0);
  h.click(locale==='en'?'Review selected':'检查所选');h.click(locale==='en'?'Confirm and add':'确认并添加');await tick();
  assert.equal(writer.calls,1);assert.deepEqual(Array.from(writer.request.sites,site=>site.url),ids.map(id=>h.context.LocalItabNavigationSites.find(site=>site.id===id).url));
  h.click(locale==='en'?'Clear filters':'清除筛选');assertSavedCounts(h,136,4);
  savedControl(h,'added').dispatch('click');assert.equal(cards(h).length,4);assert.ok(cards(h).every(card=>card.querySelector('.navigation-library-add').disabled));
 }
});

const purpose = (h, tag, location='card') => h.document.querySelectorAll('.navigation-library-tag').find(node=>node.dataset.tag===tag && node.dataset.location===location);
const activePurpose = h => h.document.querySelector('.navigation-library-active-filter[data-filter="tag"]');
test('purpose buttons share dropdown filters, preserve AND criteria, destination and cross-filter selections',async()=>{
 const h=model();await h.view.open();pickSite(h,'chatgpt');
 const category=h.document.querySelectorAll('.navigation-library-category').find(node=>node.dataset.category==='ai');category.dispatch('click');
 h.search('chatgpt');const target=h.document.querySelector('.navigation-library-destination select');target.value='personal';target.dispatch('change');
 const selects=h.document.querySelectorAll('.navigation-library-filters select'),site=h.context.LocalItabNavigationSites.find(site=>site.id==='chatgpt');
 for(const [index,value] of [[1,site.country],[2,site.company],[3,site.pricing]]){selects[index].value=value;selects[index].dispatch('change');}
 const old=purpose(h,site.tags[0]);old.focus();old.dispatch('click',{detail:1});
 assert.equal(selects[0].value,site.tags[0]);assert.equal(activePurpose(h).dataset.filter,'tag');assert.equal(purpose(h,site.tags[0]).getAttribute('aria-pressed'),'true');
 assert.ok(h.document.activeElement===purpose(h,site.tags[0]));assert.equal(target.value,'personal');assert.equal(h.document.querySelector('input').value,'chatgpt');assert.equal(category.getAttribute('aria-pressed'),'true');assert.equal(cards(h).length,1);assert.equal(cards(h)[0].querySelector('input').checked,true);
 const price=selects[3];price.value=site.pricing==='paid'?'free':'paid';price.dispatch('change');assert.ok(h.document.querySelector('.navigation-library-empty'));assert.ok(activePurpose(h));
 activePurpose(h).dispatch('click');assert.equal(selects[0].value,'');assert.equal(activePurpose(h),null);assert.equal(price.value,site.pricing==='paid'?'free':'paid');
 old.dispatch('click');assert.equal(selects[0].value,'');
 h.click('Clear filters');assert.equal(cards(h).find(card=>card.dataset.site==='chatgpt').querySelector('input').checked,true);assert.equal(target.value,'personal');assert.equal(h.calls,0);
});
test('detail purpose click keeps expansion, exact button focus, draft target and local-only semantics in English, Chinese and Spanish locale fallback',async()=>{
 for(const locale of ['en','zh-CN','es-ES']){
  const h=model({locale});const long='long-use-'+ 'verylong'.repeat(40);h.context.LocalItabNavigationSites=[{...h.context.LocalItabNavigationSites[0],tags:['chat','search',long]}];await h.view.open();
  h.document.querySelector('.navigation-library-new-category').dispatch('click');const name=h.document.querySelector('.navigation-library-new-category-panel input');name.value='Research';name.dispatch('input');
  const details=h.document.querySelector('details');details.open=true;const control=purpose(h,long,'details');control.focus();control.dispatch('click');
  assert.equal(h.document.querySelector('details').open,true);assert.ok(h.document.activeElement===purpose(h,long,'details'));assert.equal(name.value,'Research');assert.equal(h.document.querySelector('.navigation-library-new-category-panel').hidden,false);
  assert.equal(h.document.querySelector('.navigation-library-filters select').value,long);assert.equal(purpose(h,long,'details').type,'button');assert.equal(purpose(h,long,'details').href,undefined);
  assert.equal(purpose(h,long,'details').textContent,long.replace(/-/g,' '));assert.equal(h.calls,0);
  activePurpose(h).dispatch('click');assert.equal(h.document.querySelector('details').open,true);assert.equal(purpose(h,long,'details').getAttribute('aria-pressed'),'false');
 }
 const css=fs.readFileSync('navigation-library.css','utf8');assert.match(css,/\.navigation-library-panel \.navigation-library-tag \{[^}]*max-width: 100%[^}]*overflow-wrap: anywhere[^}]*white-space: normal/);assert.match(css,/navigation-library-tag:hover:not\(:disabled\)/);assert.match(css,/navigation-library-tag\[aria-pressed="true"\]/);assert.match(css,/navigation-library-panel :focus-visible/);
});
test('purpose events reject retired nodes, departed sessions, IME, repeats and pending writes',async()=>{
 const h=model();await h.view.open();const old=purpose(h,'chat');h.search('chatgpt');old.dispatch('click');assert.equal(activePurpose(h),null);
 const current=purpose(h,'chat');current.dispatch('click',{repeat:true});current.dispatch('click',{detail:2});current.dispatch('click',{isComposing:true});assert.equal(activePurpose(h),null);
 assert.equal(current.dispatch('keydown',{key:'Enter',repeat:true}).prevented,true);
 const lifecycle=h.context.LocalItabContentLifecycle;h.context.LocalItabContentLifecycle={departing:true};current.dispatch('click');assert.equal(activePurpose(h),null);h.context.LocalItabContentLifecycle=lifecycle;
 h.view.close();await h.view.open();current.dispatch('click');assert.equal(activePurpose(h),null);
 const pending=deferred();h.write=pending;const before=purpose(h,'chat');h.firstAdd().dispatch('click');assert.equal(before.disabled,true);before.dispatch('click');assert.equal(activePurpose(h),null);assert.equal(h.calls,1);
 pending.resolve({...h.snapshot,duplicate:true});await tick();assert.equal(purpose(h,'chat').disabled,false);
 purpose(h,'chat').dispatch('click');assert.ok(activePurpose(h));assert.equal(h.calls,1);
 h.view.destroy();before.dispatch('click');assert.equal(h.document.querySelector('.navigation-library-overlay'),null);
});

function searchShortcut(h) {
 const panel=h.document.querySelector('.navigation-library-panel'),input=panel.querySelector('input'),source=panel.querySelector('.navigation-library-filter-toggle');
 let selections=0;input.select=()=>{selections++;};
 const press=(target=source,fields={})=>target.dispatch('keydown',{key:'/',...fields});
 source.focus();return {panel,input,source,press,get selections(){return selections;}};
}
test('navigation slash focuses/selects exact query with bilingual hint and preserves all browsing state without reads or writes',async()=>{
 for(const locale of ['en','zh-CN']) {
  const h=model({locale});await h.view.open();const k=searchShortcut(h);
  h.search('  chatgpt  ');
  const target=h.document.querySelector('.navigation-library-destination select');target.value='personal';target.dispatch('change');
  const tag=h.document.querySelector('.navigation-library-filters select');tag.value='chat';tag.dispatch('change');
  const company=h.document.querySelectorAll('.navigation-library-filters select')[2];company.value='OpenAI';company.dispatch('change');
  const saved=h.document.querySelectorAll('.navigation-library-saved-filter').find(node=>node.dataset.savedState==='new');saved.dispatch('click');
  h.document.querySelector('.navigation-library-pick input').checked=true;h.document.querySelector('.navigation-library-pick input').dispatch('change');
  h.document.querySelector('.navigation-library-new-category').dispatch('click');
  const draft=h.document.querySelector('.navigation-library-new-category-panel input');draft.value=' Draft 🧪 ';draft.dispatch('input');
  const details=h.document.querySelector('details');details.open=true;
  const nodes=[...h.document.querySelectorAll('article')],count=h.document.querySelector('.navigation-library-count').textContent,batch=h.document.querySelector('.navigation-library-batch').textContent;
  const reads=h.reads;k.source.focus();assert.equal(k.press().prevented,true);assert.equal(h.document.activeElement,k.input);assert.equal(k.selections,1);
  assert.equal(target.value,'personal');assert.equal(tag.value,'chat');assert.equal(company.value,'OpenAI');assert.equal(saved.getAttribute('aria-pressed'),'true');
  assert.equal(k.input.value,'  chatgpt  ');assert.equal(draft.value,' Draft 🧪 ');assert.equal(details.open,true);assert.equal(h.document.querySelector('details'),details);
  assert.deepEqual(h.document.querySelectorAll('article'),nodes);assert.equal(h.document.querySelector('.navigation-library-pick input').checked,true);
  assert.equal(h.document.querySelector('.navigation-library-count').textContent,count);assert.equal(h.document.querySelector('.navigation-library-batch').textContent,batch);
  assert.equal(h.reads,reads);assert.equal(h.calls,0);assert.equal(k.input.getAttribute('aria-keyshortcuts'),'/');
  assert.equal(h.document.getElementById(k.input.getAttribute('aria-describedby')).textContent,locale==='en'?'Press / to search while browsing, outside editing fields.':'浏览时在编辑框外按 / 搜索。');
 }
});
test('navigation slash ignores editable fields, editable ancestors, custom widgets and shadow edit paths',async()=>{
 const h=model();await h.view.open();const k=searchShortcut(h);
 for(const tag of ['input','textarea','select','audio','video','iframe','object','embed']){
  const node=h.document.createElement(tag);k.panel.append(node);node.focus();assert.equal(k.press(node).prevented,false);k.source.focus();assert.equal(k.press(node).prevented,false);node.focus();assert.equal(k.press().prevented,false);node.remove();
 }
 for(const attrs of [{contenteditable:'plaintext-only'},{contenteditable:'false'},{role:'textbox'},{role:'combobox'},{role:'listbox'},{role:'slider'},{role:'spinbutton'}]){
  const editor=h.document.createElement('div'),child=h.document.createElement('span');Object.entries(attrs).forEach(([key,value])=>editor.setAttribute(key,value));editor.append(child);k.panel.append(editor);child.focus();assert.equal(k.press(child).prevented,false);editor.remove();
 }
 k.input.focus();assert.equal(k.press(k.input).prevented,false);k.source.focus();const inner=h.document.createElement('input');assert.equal(k.press(k.source,{composedPath:()=>[inner,k.source,k.panel]}).prevented,false);
 h.document.designMode='on';assert.equal(k.press().prevented,false);h.document.designMode='off';assert.equal(k.selections,0);assert.equal(h.calls,0);assert.equal(h.reads,1);
});
test('navigation slash respects IME, repeat, modifiers and consumed events, and matches typed slash on non-US keyboards',async()=>{
 const h=model();await h.view.open();const k=searchShortcut(h);
 for(const fields of [{isComposing:true},{keyCode:229},{repeat:true},{ctrlKey:true},{metaKey:true},{altKey:true},{getModifierState:key=>key==='AltGraph'},{defaultPrevented:true},{key:'?',code:'Slash',shiftKey:true},{key:'f',ctrlKey:true},{key:'s',metaKey:true},{key:'Dead'}])assert.equal(k.press(k.source,fields).prevented,false);
 k.source.dispatch('compositionstart');assert.equal(k.press().prevented,false);k.source.dispatch('compositionend');assert.equal(k.selections,0);
 for(const fields of [{key:'/',code:'Digit7',shiftKey:true},{key:'/',code:'NumpadDivide'}]){k.source.focus();assert.equal(k.press(k.source,fields).prevented,true);}
 assert.equal(k.selections,2);assert.equal(h.calls,0);assert.equal(h.reads,1);
});
test('navigation slash declines review without changing confirmation or selections',async()=>{
 const h=model();await h.view.open();const k=searchShortcut(h);const pick=h.document.querySelector('.navigation-library-pick input');pick.checked=true;pick.dispatch('change');
 h.document.querySelector('.navigation-library-batch-review').dispatch('click');const review=h.document.querySelector('.navigation-library-review'),confirm=h.document.querySelector('.navigation-library-batch-confirm'),children=[...review.children];
 assert.equal(k.press(confirm).prevented,false);assert.equal(h.document.activeElement,confirm);assert.equal(review.hidden,false);assert.deepEqual(review.children,children);assert.equal(h.document.querySelector('.navigation-library-pick input').checked,true);
 assert.equal(k.selections,0);assert.equal(h.calls,0);assert.equal(h.reads,1);
});
test('navigation slash declines hidden/inert nodes, document, disabled search and other dialogs while allowing its own dialog',async()=>{
 const h=model();await h.view.open();const k=searchShortcut(h);
 for(const node of [k.panel,k.input,k.source,k.panel.parentElement]) {
  for(const prop of ['hidden','inert']){node[prop]=true;assert.equal(k.press().prevented,false);node[prop]=false;k.source.focus();}
  node.setAttribute('aria-hidden','true');assert.equal(k.press().prevented,false);node.setAttribute('aria-hidden','false');
  for(const [prop,value] of [['display','none'],['visibility','hidden'],['visibility','collapse']]){node.style[prop]=value;assert.equal(k.press().prevented,false);delete node.style[prop];}
 }
 k.input.disabled=true;assert.equal(k.press().prevented,false);k.input.disabled=false;
 h.document.hidden=true;assert.equal(k.press().prevented,false);h.document.hidden=false;h.document.visibilityState='hidden';assert.equal(k.press().prevented,false);h.document.visibilityState='visible';
 for(const role of ['dialog','alertdialog','menu']){const modal=h.document.createElement('section');modal.setAttribute('role',role);h.document.body.append(modal);assert.equal(k.press().prevented,false);modal.hidden=true;assert.equal(k.press().prevented,true);k.source.focus();modal.remove();}
 const native=h.document.createElement('dialog');native.open=true;h.document.body.append(native);assert.equal(k.press().prevented,false);native.remove();
 const overlay=h.document.createElement('div');overlay.className='modal-overlay active';h.document.body.append(overlay);assert.equal(k.press().prevented,false);overlay.remove();
 k.source.focus();assert.equal(k.press().prevented,true);assert.equal(h.reads,1);assert.equal(h.calls,0);
});
test('navigation slash declines pending component/layout changes, departure, loading, writing and blocked saves',async()=>{
 const h=model();await h.view.open();const k=searchShortcut(h);
 for(const prop of ['_shortcutWritesPending','_pendingSave','_pendingDelete','_shortcutOrderPending']){h.component[prop]=true;assert.equal(k.press().prevented,false);h.component[prop]=false;}
 for(const prop of ['failedChange','invalidated','pending','timer','modePending']){h.component.layoutController[prop]=true;assert.equal(k.press().prevented,false);h.component.layoutController[prop]=false;}
 h.context.LocalItabContentLifecycle={departing:true};assert.equal(k.press().prevented,false);h.context.LocalItabContentLifecycle.departing=false;
 h.component.modal=h.document.createElement('div');h.component.modal.className='active';assert.equal(k.press().prevented,false);h.component.modal.className='';
 const pending=deferred();h.write=pending;h.firstAdd().dispatch('click');const reads=h.reads,calls=h.calls;assert.equal(k.press(k.panel).prevented,false);assert.equal(k.selections,0);assert.equal(h.reads,reads);assert.equal(h.calls,calls);pending.resolve({...h.snapshot,duplicate:true});await tick();
 h.component.addCatalogShortcut=async()=>{throw Object.assign(new Error(),{code:'CATALOG_CONFLICT'});};h.firstAdd().dispatch('click');await tick();k.source.focus();assert.equal(k.press().prevented,false);
 const loading=model(),read=deferred();loading.read=read;const opening=loading.view.open();await tick();const panel=loading.document.querySelector('.navigation-library-panel');assert.equal(panel.dispatch('keydown',{key:'/'}).prevented,false);assert.equal(loading.calls,0);read.resolve(loading.snapshot);await opening;
});
test('navigation slash listener is panel-local and retired panels/search/result nodes cannot act after close or reopening',async()=>{
 const h=model();await h.view.open();const old=searchShortcut(h),oldHandler=old.panel.listeners.get('keydown')[0],card=h.document.querySelector('article');
 h.search('chatgpt');old.source.focus();assert.equal(old.press(card).prevented,false);assert.equal(h.document.body.dispatch('keydown',{key:'/'}).prevented,false);
 old.input.remove();assert.equal(old.press().prevented,false);old.panel.append(old.input);h.view.close();assert.equal(old.panel.listeners.get('keydown').length,0);assert.equal(old.press().prevented,false);
 await h.view.open();const current=searchShortcut(h);h.document.body.append(old.panel);old.source.focus();assert.equal(old.press().prevented,false);
 const event={key:'/',target:old.source,preventDefault(){throw new Error('stale handler consumed input');}};oldHandler(event);assert.equal(current.selections,0);assert.equal(old.selections,0);
 old.panel.remove();current.source.focus();assert.equal(current.press().prevented,true);assert.equal(current.selections,1);assert.equal(h.reads,2);assert.equal(h.calls,0);
});
test('navigation slash cannot originate in a closed disclosure even if it retains a layout rectangle',async()=>{
 const h=model();await h.view.open();const k=searchShortcut(h),details=h.document.querySelector('details'),link=details.querySelector('a');
 link.getClientRects=()=>[{}];h.document.activeElement=link;assert.equal(k.press(link).prevented,false);assert.equal(k.selections,0);
 const summary=details.querySelector('summary');summary.focus();assert.equal(k.press(summary).prevented,true);assert.equal(k.selections,1);assert.equal(details.open,false);assert.equal(h.calls,0);assert.equal(h.reads,1);
});
test('navigation slash releases the shared IME target on blur, removal or changed focus and only consumes a successful focus',async()=>{
 const h=model();await h.view.open();const k=searchShortcut(h);
 k.source.dispatch('compositionstart');k.source.dispatch('focusout');assert.equal(k.press().prevented,true);
 const temporary=h.document.createElement('button');k.panel.append(temporary);temporary.focus();temporary.dispatch('compositionstart');temporary.remove();k.source.focus();assert.equal(k.press().prevented,true);
 temporary.parentElement=null;k.panel.append(temporary);temporary.focus();temporary.dispatch('compositionstart');k.source.focus();assert.equal(k.press().prevented,true);
 k.source.focus();const original=k.input.focus;k.input.focus=()=>{};const before=k.selections;assert.equal(k.press().prevented,false);assert.equal(k.selections,before);k.input.focus=original;
 assert.equal(h.calls,0);assert.equal(h.reads,1);
});

test('navigation composition blur recovers buttons as well as slash without writing',async()=>{
 const h=model();await h.view.open();const k=searchShortcut(h),toggle=h.document.querySelector('.navigation-library-filter-toggle'),filters=h.document.querySelector('.navigation-library-filters');
 k.input.focus();k.input.dispatch('compositionstart');k.input.dispatch('focusout');toggle.focus();
 assert.equal(k.press(toggle).prevented,true);toggle.dispatch('click');assert.equal(filters.hidden,false);
 k.input.dispatch('compositionend');toggle.dispatch('click');assert.equal(filters.hidden,true);
 assert.equal(h.calls,0);assert.equal(h.reads,1);
});

test('retired navigation composition callbacks cannot invalidate a fresh review or clear a new composition',async()=>{
 const h=model();await h.view.open();const old=searchShortcut(h);
 const callbacks=Object.fromEntries(['compositionstart','compositionend','focusout'].map(type=>[type,[...old.panel.listeners.get(type)]]));
 old.input.focus();old.input.dispatch('compositionstart');h.view.close();
 for(const type of Object.keys(callbacks))assert.equal(old.panel.listeners.get(type).length,0);
 await h.view.open();const current=searchShortcut(h),pick=h.document.querySelector('.navigation-library-pick input');pick.checked=true;pick.dispatch('change');
 h.document.querySelector('.navigation-library-batch-review').dispatch('click');const review=h.document.querySelector('.navigation-library-review'),confirm=h.document.querySelector('.navigation-library-batch-confirm');
 assert.equal(review.hidden,false);
 // Even references invoked directly or a retired panel reattached to the DOM
 // cannot acquire ownership of the next opening.
 h.document.body.append(old.panel);
 for(const type of Object.keys(callbacks)){old.input.dispatch(type);for(const callback of callbacks[type])callback({target:current.input});}
 assert.equal(review.hidden,false);assert.equal(h.document.querySelector('.navigation-library-batch-confirm'),confirm);
 current.input.focus();current.input.dispatch('compositionstart');assert.equal(review.hidden,true);
 for(const type of ['compositionend','focusout']){old.input.dispatch(type);for(const callback of callbacks[type])callback({target:current.input});}
 h.firstAdd().dispatch('click');h.document.querySelector('.navigation-library-batch-review').dispatch('click');confirm.dispatch('click');
 assert.equal(h.calls,0);assert.equal(review.hidden,true);
 current.input.dispatch('keydown',{key:'Escape'});assert.ok(h.document.querySelector('.navigation-library-overlay'));
 old.panel.remove();current.input.dispatch('compositionend');h.document.querySelector('.navigation-library-batch-review').dispatch('click');
 assert.equal(review.hidden,false);h.view.close();assert.equal(h.calls,0);
});

test('navigation current composition target survives unrelated end and blur, recovers on removal or lost blur',async()=>{
 const h=model();await h.view.open();const k=searchShortcut(h),toggle=h.document.querySelector('.navigation-library-filter-toggle'),filters=h.document.querySelector('.navigation-library-filters');
 const other=h.document.createElement('input');k.panel.append(other);
 k.input.focus();k.input.dispatch('compositionstart');other.focus();other.dispatch('compositionstart');
 k.input.dispatch('compositionend');k.input.dispatch('focusout');
 toggle.dispatch('click');h.firstAdd().dispatch('click');assert.equal(filters.hidden,true);assert.equal(h.calls,0);
 other.dispatch('keydown',{key:'Escape'});assert.ok(h.document.querySelector('.navigation-library-overlay'));
 other.remove();toggle.focus();toggle.dispatch('click');assert.equal(filters.hidden,false);
 // No focusout or end was delivered, but the old target no longer owns focus.
 k.input.focus();k.input.dispatch('compositionstart');toggle.focus();toggle.dispatch('click');assert.equal(filters.hidden,true);
 assert.equal(h.calls,0);assert.equal(h.reads,1);h.view.close();
});

test('navigation close while reading retires composition before a later opening builds',async()=>{
 const h=model(),pending=deferred();h.read=pending;const opening=h.view.open();await tick();
 const old=h.document.querySelector('.navigation-library-panel'),start=old.listeners.get('compositionstart')[0];old.dispatch('compositionstart');h.view.close();
 h.read=null;await h.view.open();const k=searchShortcut(h);k.input.focus();k.input.dispatch('compositionstart');
 start({target:k.input});old.dispatch('compositionend');pending.resolve(h.snapshot);assert.equal(await opening,false);
 h.firstAdd().dispatch('click');assert.equal(h.calls,0);k.input.dispatch('compositionend');
 const toggle=h.document.querySelector('.navigation-library-filter-toggle');toggle.dispatch('click');assert.equal(h.document.querySelector('.navigation-library-filters').hidden,false);assert.equal(h.calls,0);h.view.close();
});

const selectedToggle=h=>h.document.querySelector('.navigation-library-selected-only');
const hiddenSelected=h=>h.document.querySelector('.navigation-library-hidden-selected').textContent;
test('selected-only combines all filters, reports hidden selections, and reviews the entire selection without writes',async()=>{
 const h=model();await h.view.open();pickSite(h,'chatgpt');pickSite(h,'github');selectedToggle(h).dispatch('click');
 assert.equal(selectedToggle(h).getAttribute('aria-pressed'),'true');assert.equal(cards(h).length,2);assert.equal(hiddenSelected(h),'Hidden by filters: 0');
 const site=h.context.LocalItabNavigationSites.find(site=>site.id==='chatgpt');
 h.document.querySelectorAll('.navigation-library-category').find(node=>node.dataset.category===site.categories[0]).dispatch('click');
 for(const [i,value] of [site.tags[0],site.country,site.company,site.pricing].entries()){
  const control=h.document.querySelectorAll('.navigation-library-filters select')[i];control.value=value;control.dispatch('change');
 }
 h.search('chatgpt');assert.equal(cards(h).length,1);assert.equal(selectionCount(h),'2 / 20 selected');assert.equal(hiddenSelected(h),'Hidden by filters: 1');
 savedControl(h,'added').dispatch('click');assert.equal(cards(h).length,0);assert.equal(hiddenSelected(h),'Hidden by filters: 2');
 h.click('Review selected');assert.equal(h.document.querySelectorAll('.navigation-library-review li').length,2);const old=h.button('Confirm and add');
 selectedToggle(h).dispatch('click');assert.equal(h.document.querySelector('.navigation-library-review').hidden,true);old.dispatch('click');assert.equal(h.calls,0);
 h.click('Clear filters');assert.equal(selectedToggle(h).getAttribute('aria-pressed'),'false');assert.equal(cards(h).length,136);assert.equal(selectionCount(h),'2 / 20 selected');assert.equal(hiddenSelected(h),'Hidden by filters: 0');
});
test('selected-only needs no target, preserves complete cards and details, and remains escapable when empty',async()=>{
 const h=model();h.snapshot.categories=[];await h.view.open();pickSite(h,'chatgpt');pickSite(h,'github');
 const details=cards(h).find(node=>node.dataset.site==='chatgpt').querySelector('details');details.open=true;
 selectedToggle(h).dispatch('click');assert.equal(cards(h).length,2);assert.equal(cards(h)[0].querySelector('details').open,true);
 assert.ok(cards(h)[0].querySelector('.navigation-library-visit'));assert.ok(cards(h)[0].querySelector('.navigation-library-description'));assert.ok(cards(h)[0].querySelector('.navigation-library-tag'));
 assert.equal(h.document.querySelector('.navigation-library-batch-review').disabled,true);assert.equal(selectedToggle(h).disabled,false);
 h.click('Clear selection');assert.equal(cards(h).length,0);assert.ok(h.document.querySelector('.navigation-library-empty'));assert.equal(selectedToggle(h).getAttribute('aria-pressed'),'true');assert.equal(h.document.activeElement,selectedToggle(h));
 selectedToggle(h).dispatch('click');assert.equal(cards(h).length,136);assert.equal(h.calls,0);
});
test('deselecting selected-only cards focuses next then previous checkbox, and finally the view toggle',async()=>{
 const h=model();await h.view.open();const ids=cards(h).slice(0,3).map(card=>card.dataset.site);for(const id of ids)pickSite(h,id);selectedToggle(h).dispatch('click');
 const stale=cards(h)[1].querySelector('input');pickSite(h,ids[1],false);assert.equal(h.document.activeElement,cards(h)[1].querySelector('input'));
 stale.checked=true;stale.dispatch('change');assert.equal(selectionCount(h),'2 / 20 selected');
 pickSite(h,ids[2],false);assert.equal(h.document.activeElement,cards(h)[0].querySelector('input'));
 pickSite(h,ids[0],false);assert.equal(cards(h).length,0);assert.equal(h.document.activeElement,selectedToggle(h));assert.equal(h.calls,0);
});
test('selected-only preserves selection cap, empty filters clear only the view, and old-session controls cannot act',async()=>{
 const h=model();await h.view.open();const ids=cards(h).slice(0,21).map(card=>card.dataset.site);for(const id of ids.slice(0,20))pickSite(h,id);
 const old=selectedToggle(h);old.dispatch('click');assert.equal(cards(h).length,20);assert.equal(h.document.querySelector('.navigation-library-select-results').disabled,true);
 h.search('absent-923849');assert.equal(hiddenSelected(h),'Hidden by filters: 20');h.click('Clear filters');assert.equal(selectionCount(h),'20 / 20 selected');assert.equal(cards(h).find(card=>card.dataset.site===ids[20]).querySelector('input').disabled,true);
 h.view.close();await h.view.open();old.dispatch('click');assert.equal(selectedToggle(h).getAttribute('aria-pressed'),'false');assert.equal(selectionCount(h),'0 / 20 selected');assert.equal(h.calls,0);
});
test('selected-only ignores composition and repeat, and blocks pending writes, external pending work and conflicts',async()=>{
 const h=model();await h.view.open();pickSite(h,'chatgpt');const toggle=selectedToggle(h);
 for(const event of [{repeat:true},{detail:2},{isComposing:true},{keyCode:229}])toggle.dispatch('click',event);
 assert.equal(toggle.getAttribute('aria-pressed'),'false');
 for(const key of ['_pendingSave','_pendingDelete','_shortcutWritesPending','_shortcutOrderPending']){
  h.component[key]=true;h.search('chatgpt');assert.equal(toggle.disabled,true);toggle.dispatch('click');assert.equal(toggle.getAttribute('aria-pressed'),'false');h.component[key]=false;
 }
 h.search('chatgpt');assert.equal(toggle.disabled,false);let reject;const pending={promise:new Promise((resolve,rejectFn)=>{reject=rejectFn;})};h.write=pending;h.firstAdd().dispatch('click');assert.equal(toggle.disabled,true);toggle.dispatch('click');assert.equal(toggle.getAttribute('aria-pressed'),'false');
 reject(Object.assign(new Error(),{code:'CATALOG_CONFLICT'}));await tick();assert.equal(toggle.disabled,true);toggle.dispatch('click');assert.equal(toggle.getAttribute('aria-pressed'),'false');assert.equal(h.calls,1);
});
test('selected-only bilingual labels and hidden counts remain plain text',async()=>{
 const h=model({locale:'zh-CN'});await h.view.open();pickSite(h,'chatgpt');h.search('github');assert.equal(selectedToggle(h).textContent,'只看已选');assert.equal(hiddenSelected(h),'被筛选隐藏: 1');
 selectedToggle(h).dispatch('click');assert.equal(cards(h).length,0);h.click('清除筛选');assert.equal(selectedToggle(h).getAttribute('aria-pressed'),'false');assert.equal(selectionCount(h),'1 / 20 已选');assert.equal(h.calls,0);
});

test('four learning resources remain local, preserve hidden selections and cancel without saving in both locales',async()=>{
 for(const locale of ['en','zh-CN']){
  const h=model({locale});await h.view.open();
  const ids=['project-gutenberg','smithsonian-open-access','openlearn','british-council-learnenglish'];
  for(const id of ids){const site=h.context.LocalItabNavigationSites.find(site=>site.id===id);h.search(site.name);assert.equal(cards(h).length,1);assert.equal(cards(h)[0].dataset.site,id);assert.match(textTree(cards(h)[0].querySelector('details')),/2026-10-13/);pickSite(h,id);}
  selectedToggle(h).dispatch('click');assert.equal(cards(h).length,1);assert.match(hiddenSelected(h),/3$/);
  h.click(locale==='en'?'Review selected':'检查所选');assert.equal(h.document.querySelectorAll('.navigation-library-review li').length,4);assert.equal(h.calls,0);
  h.view.close();await h.view.open();assert.equal(cards(h).length,136);assert.equal(h.calls,0);assert.equal(h.snapshot.links.length,0);assert.match(selectionCount(h),/^0 \/ 20/);assert.equal(h.document.querySelector('.navigation-library-review').hidden,true);
  h.view.close();
 }
});

const emptyRecover=h=>h.document.querySelector('.navigation-library-empty-recover');
test('empty selected-only explains no selection in both languages and recovers without clearing other filters',async()=>{
 for(const [locale,title,label] of [['en','No sites selected yet.','Turn off selected-only view'],['zh-CN','还没有选择网站。','关闭只看已选']]){
  const h=model({locale});await h.view.open();h.search('github');selectedToggle(h).dispatch('click');
  assert.equal(h.document.querySelector('.navigation-library-empty h3').textContent,title);assert.equal(emptyRecover(h).textContent,label);
  assert.equal(h.document.querySelectorAll('.navigation-library-empty button').length,1);
  emptyRecover(h).dispatch('click');assert.equal(cards(h).length,3);assert.ok(cards(h).some(card=>card.dataset.site==='github'));
  assert.equal(h.document.querySelector('.navigation-library-search input').value,'github');assert.equal(h.document.activeElement,selectedToggle(h));assert.equal(h.calls,0);
 }
});
test('empty hidden-selection recovery counts all hidden sites, preserves targets and retires review in both languages',async()=>{
 for(const locale of ['en','zh-CN'])for(const newTarget of [false,true]){
  const h=model({locale});await h.view.open();pickSite(h,'chatgpt');pickSite(h,'github');
  const target=h.document.querySelector('.navigation-library-destination select');target.value='personal';target.dispatch('change');
  if(newTarget){h.document.querySelector('.navigation-library-new-category').dispatch('click');const name=h.document.querySelector('.navigation-library-new-category-panel input');name.value='Synthetic draft';name.dispatch('input');}
  selectedToggle(h).dispatch('click');h.search('absent-93827');
  const empty=h.document.querySelector('.navigation-library-empty');assert.match(empty.querySelectorAll('p').map(node=>node.textContent).join(' '),/Hidden by filters: 2|被筛选隐藏: 2/);assert.match(empty.querySelector('h3').textContent,/hidden by filters|当前筛选隐藏/);
  h.document.querySelector('.navigation-library-batch-review').dispatch('click');const old=h.document.querySelector('.navigation-library-batch-confirm');
  emptyRecover(h).dispatch('click');assert.equal(selectionCount(h),locale==='en'?'2 / 20 selected':'2 / 20 已选');
  assert.equal(h.document.querySelector('.navigation-library-review').hidden,true);old.dispatch('click');assert.equal(h.calls,0);
  assert.equal(target.value,'personal');if(newTarget){assert.equal(h.document.querySelector('.navigation-library-new-category-panel').hidden,false);assert.equal(h.document.querySelector('.navigation-library-new-category-panel input').value,'Synthetic draft');}
  assert.equal(h.document.activeElement,h.document.querySelector('.navigation-library-search input'));assert.ok(cards(h).length>2);
 }
});
test('ordinary zero-match uses one clear-filter recovery and does not imply missing selections',async()=>{
 const h=model();await h.view.open();h.search('absent-93827');assert.equal(h.document.querySelector('.navigation-library-empty h3').textContent,'No sites match these filters.');
 assert.equal(emptyRecover(h).textContent,'Clear filters');emptyRecover(h).dispatch('click');assert.equal(cards(h).length,136);assert.equal(h.calls,0);
});
test('empty catalog and unavailable catalog are distinct from unmatched filters and saved-site read failure',async()=>{
 for(const locale of ['en','zh-CN']){
  const h=model({locale});h.context.LocalItabNavigationSites=[];await h.view.open();assert.match(h.document.querySelector('.navigation-library-empty h3').textContent,/library has no sites|网站库暂无/);assert.equal(emptyRecover(h),null);selectedToggle(h).dispatch('click');assert.match(h.document.querySelector('.navigation-library-empty h3').textContent,/library has no sites|网站库暂无/);assert.equal(h.calls,0);
  const missing=model({locale});missing.context.LocalItabNavigationSites=null;assert.equal(await missing.view.open(),false);assert.match(missing.document.querySelector('.navigation-library-status').textContent,/load the built-in library|加载内置网站库/);assert.equal(emptyRecover(missing),null);
  const failed=model({locale}),pending={};pending.promise=new Promise((resolve,reject)=>{pending.resolve=resolve;pending.reject=reject;});failed.read=pending;const opening=failed.view.open();pending.reject(new Error('synthetic read failure'));assert.equal(await opening,false);assert.match(failed.document.querySelector('.navigation-library-status').textContent,/read your saved sites|读取/);assert.equal(emptyRecover(failed),null);
 }
});
test('retired empty recovery nodes cannot clear newer filters or reopened session state',async()=>{
 const h=model();await h.view.open();h.search('absent-93827');const old=emptyRecover(h);h.search('github');old.dispatch('click');assert.equal(cards(h).length,3);assert.equal(h.document.querySelector('.navigation-library-search input').value,'github');
 h.search('absent-93827');const retired=emptyRecover(h);h.view.close();await h.view.open();h.search('github');retired.dispatch('click');assert.equal(cards(h).length,3);assert.equal(selectionCount(h),'0 / 20 selected');assert.equal(h.calls,0);
});
test('empty recovery is inert during external pending work, composition and repeat events',async()=>{
 const h=model();await h.view.open();selectedToggle(h).dispatch('click');const recover=emptyRecover(h);
 for(const event of [{repeat:true},{detail:2},{isComposing:true},{keyCode:229}])recover.dispatch('click',event);
 assert.equal(selectedToggle(h).getAttribute('aria-pressed'),'true');assert.equal(recover.dispatch('keydown',{key:'Enter',repeat:true}).prevented,true);
 const input=h.document.querySelector('.navigation-library-search input');input.focus();input.dispatch('compositionstart');recover.dispatch('click');assert.equal(selectedToggle(h).getAttribute('aria-pressed'),'true');input.dispatch('compositionend');
 for(const key of ['_pendingSave','_pendingDelete','_shortcutWritesPending','_shortcutOrderPending']){
  h.component[key]=true;h.search('');assert.equal(emptyRecover(h).disabled,true);emptyRecover(h).dispatch('click');assert.equal(selectedToggle(h).getAttribute('aria-pressed'),'true');h.component[key]=false;
 }
 h.search('');assert.equal(emptyRecover(h).disabled,false);emptyRecover(h).dispatch('click');assert.equal(cards(h).length,136);assert.equal(h.calls,0);
});
test('empty recovery stays disabled throughout a write and after uncertain failure',async()=>{
 const h=model(),pending={};pending.promise=new Promise((resolve,reject)=>{pending.resolve=resolve;pending.reject=reject;});h.write=pending;await h.view.open();pickSite(h,'chatgpt');h.search('absent-93827');h.click('Review selected');h.click('Confirm and add');
 assert.equal(h.calls,1);assert.equal(emptyRecover(h).disabled,true);emptyRecover(h).dispatch('click');assert.equal(cards(h).length,0);
 pending.reject(Object.assign(new Error('synthetic uncertainty'),{code:'CATALOG_UNVERIFIED'}));await tick();assert.equal(emptyRecover(h).disabled,true);emptyRecover(h).dispatch('click');assert.equal(cards(h).length,0);assert.equal(h.calls,1);
 h.view.close();await h.view.open();h.search('absent-93827');assert.equal(emptyRecover(h).disabled,false);emptyRecover(h).dispatch('click');assert.equal(cards(h).length,136);
});

const deselectResults=h=>h.document.querySelector('.navigation-library-deselect-results');
test('deselect current results preserves hidden selection, destination and new-category draft in both locales',async()=>{
 for(const [locale,label] of [['en','Deselect current results'],['zh-CN','取消当前结果的选择']])for(const newTarget of [false,true]){
  const h=model({locale});await h.view.open();pickSite(h,'github');h.search('canva');
  const group=cards(h).map(card=>card.dataset.site);assert.ok(group.length>1);
  h.document.querySelector('.navigation-library-select-results').dispatch('click');
  const target=h.document.querySelector('.navigation-library-destination select');target.value='personal';target.dispatch('change');
  if(newTarget){h.document.querySelector('.navigation-library-new-category').dispatch('click');const name=h.document.querySelector('.navigation-library-new-category-panel input');name.value='Synthetic draft';name.dispatch('input');}
  const action=deselectResults(h);assert.equal(action.textContent,`${label} (${group.length})`);assert.equal(action.disabled,false);
  action.focus();action.dispatch('click');action.dispatch('click');
  assert.match(selectionCount(h),/^1 \/ 20/);assert.match(hiddenSelected(h),/1$/);assert.equal(action.textContent,`${label} (0)`);assert.equal(action.disabled,true);
  assert.ok(cards(h).every(card=>!card.querySelector('input').checked));assert.equal(h.document.querySelector('.navigation-library-search input').value,'canva');
  assert.equal(target.value,'personal');assert.equal(h.document.activeElement,selectedToggle(h));
  if(newTarget){assert.equal(h.document.querySelector('.navigation-library-new-category-panel').hidden,false);assert.equal(h.document.querySelector('.navigation-library-new-category-panel input').value,'Synthetic draft');}
  h.search('github');assert.equal(cards(h).find(card=>card.dataset.site==='github').querySelector('input').checked,true);assert.equal(h.calls,0);
 }
});
test('deselect uses final combined filters including saved-state and selected-only, keeps every filter and stable focus',async()=>{
 const h=model();await h.view.open();pickSite(h,'chatgpt');pickSite(h,'github');selectedToggle(h).dispatch('click');
 const site=h.context.LocalItabNavigationSites.find(site=>site.id==='chatgpt');
 h.document.querySelectorAll('.navigation-library-category').find(node=>node.dataset.category===site.categories[0]).dispatch('click');
 const values=[site.tags[0],site.country,site.company,site.pricing];
 for(const [i,value] of values.entries()){const control=h.document.querySelectorAll('.navigation-library-filters select')[i];control.value=value;control.dispatch('change');}
 h.search('chatgpt');savedControl(h,'added').dispatch('click');assert.equal(deselectResults(h).disabled,true);deselectResults(h).dispatch('click');assert.equal(selectionCount(h),'2 / 20 selected');
 savedControl(h,'new').dispatch('click');assert.equal(deselectResults(h).textContent,'Deselect current results (1)');deselectResults(h).dispatch('click');
 assert.equal(cards(h).length,0);assert.equal(selectionCount(h),'1 / 20 selected');assert.equal(h.document.activeElement,selectedToggle(h));assert.equal(selectedToggle(h).getAttribute('aria-pressed'),'true');
 assert.equal(h.document.querySelector('.navigation-library-search input').value,'chatgpt');assert.deepEqual(h.document.querySelectorAll('.navigation-library-filters select').map(node=>node.value),values);
 assert.equal(savedControl(h,'new').getAttribute('aria-pressed'),'true');assert.equal(h.document.querySelectorAll('.navigation-library-category').find(node=>node.dataset.category===site.categories[0]).getAttribute('aria-pressed'),'true');assert.equal(h.calls,0);
});
test('deselect works without a target, releases selection cap and is inert with zero visible selections',async()=>{
 const h=model();h.snapshot.categories=[];await h.view.open();const ids=cards(h).slice(0,21).map(card=>card.dataset.site);
 for(const id of ids.slice(0,20))pickSite(h,id);
 assert.equal(cards(h)[20].querySelector('input').disabled,true);h.search('absent-93827');assert.equal(deselectResults(h).disabled,true);deselectResults(h).dispatch('click');assert.equal(selectionCount(h),'20 / 20 selected');
 h.search('');selectedToggle(h).dispatch('click');assert.equal(deselectResults(h).textContent,'Deselect current results (20)');deselectResults(h).dispatch('click');
 assert.equal(cards(h).length,0);assert.equal(selectionCount(h),'0 / 20 selected');assert.equal(h.document.activeElement,selectedToggle(h));selectedToggle(h).dispatch('click');assert.equal(cards(h)[20].querySelector('input').disabled,false);assert.equal(h.calls,0);
});
test('deselect rejects removed nodes, old sessions, repeated and composing activation',async()=>{
 const h=model();await h.view.open();pickSite(h,'chatgpt');let action=deselectResults(h);
 for(const event of [{repeat:true},{detail:2},{isComposing:true},{keyCode:229}])action.dispatch('click',event);
 for(const key of ['Enter',' '])assert.equal(action.dispatch('keydown',{key,repeat:true}).prevented,true);
 assert.equal(selectionCount(h),'1 / 20 selected');
 const input=h.document.querySelector('.navigation-library-search input');input.focus();input.dispatch('compositionstart');assert.equal(action.disabled,true);action.dispatch('click');assert.equal(selectionCount(h),'1 / 20 selected');input.dispatch('compositionend');assert.equal(action.disabled,false);
 action.remove();action.dispatch('click');assert.equal(selectionCount(h),'1 / 20 selected');
 h.view.close();await h.view.open();pickSite(h,'github');action.dispatch('click');assert.equal(selectionCount(h),'1 / 20 selected');
 action=deselectResults(h);h.view.close();await h.view.open();pickSite(h,'chatgpt');action.dispatch('click');assert.equal(selectionCount(h),'1 / 20 selected');assert.equal(h.calls,0);
});
test('deselect disabled and handler share all component, layout, modal and departure guards',async()=>{
 const h=model();await h.view.open();pickSite(h,'chatgpt');const action=deselectResults(h);h.context.LocalItabContentLifecycle={departing:false};
 const locks=[...['_pendingSave','_pendingDelete','_shortcutWritesPending','_shortcutOrderPending'].map(key=>[h.component,key]),...['failedChange','invalidated','pending','timer','modePending'].map(key=>[h.component.layoutController,key]),[h.context.LocalItabContentLifecycle,'departing']];
 for(const [object,key] of locks){
  object[key]=true;action.dispatch('click');assert.equal(selectionCount(h),'1 / 20 selected');
  h.search('');assert.equal(action.disabled,true,key);action.dispatch('click');assert.equal(selectionCount(h),'1 / 20 selected');
  object[key]=false;h.search('');assert.equal(action.disabled,false,key);
 }
 h.component.modal=h.document.createElement('div');h.component.modal.classList.add('active');action.dispatch('click');assert.equal(selectionCount(h),'1 / 20 selected');h.search('');assert.equal(action.disabled,true);h.component.modal.classList.remove('active');h.search('');assert.equal(action.disabled,false);assert.equal(h.calls,0);
});
test('deselect cannot alter frozen review or pending and conflicted saves',async()=>{
 for(const code of ['CATALOG_CONFLICT','CATALOG_UNVERIFIED']){
  const h=model(),pending={};pending.promise=new Promise((resolve,reject)=>{pending.resolve=resolve;pending.reject=reject;});h.write=pending;await h.view.open();pickSite(h,'chatgpt');h.click('Review selected');
  const action=deselectResults(h),confirm=h.document.querySelector('.navigation-library-batch-confirm');assert.equal(action.disabled,true);action.dispatch('click');assert.equal(selectionCount(h),'1 / 20 selected');assert.equal(h.document.querySelector('.navigation-library-batch-confirm'),confirm);
  h.click('Back to browsing');assert.equal(action.disabled,false);h.click('Review selected');confirm.dispatch('click'); // Retired review cannot save.
  assert.equal(h.calls,0);h.document.querySelector('.navigation-library-batch-confirm').dispatch('click');assert.equal(h.calls,1);assert.equal(action.disabled,true);action.dispatch('click');assert.equal(selectionCount(h),'1 / 20 selected');
  pending.reject(Object.assign(new Error('Synthetic failure'),{code}));await tick();assert.equal(action.disabled,true);action.dispatch('click');assert.equal(selectionCount(h),'1 / 20 selected');assert.equal(h.calls,1);
 }
});

test('four daily discovery resources remain local, preserve hidden selections and cancel without saving in both locales',async()=>{
 for(const locale of ['en','zh-CN']){
  const h=model({locale});await h.view.open();
  const ids=['cfpb-consumer-resources','ftc-shopping-guides','board-game-arena','alltrails'];
  for(const id of ids){const site=h.context.LocalItabNavigationSites.find(site=>site.id===id);h.search(site.name);assert.equal(cards(h).length,1);assert.equal(cards(h)[0].dataset.site,id);assert.match(textTree(cards(h)[0].querySelector('details')),/2026-10-13/);pickSite(h,id);}
  selectedToggle(h).dispatch('click');assert.equal(cards(h).length,1);assert.match(hiddenSelected(h),/3$/);
  h.click(locale==='en'?'Review selected':'检查所选');assert.equal(h.document.querySelectorAll('.navigation-library-review li').length,4);assert.equal(h.calls,0);
  h.view.close();await h.view.open();assert.equal(cards(h).length,136);assert.equal(h.calls,0);assert.equal(h.snapshot.links.length,0);assert.match(selectionCount(h),/^0 \/ 20/);assert.equal(h.document.querySelector('.navigation-library-review').hidden,true);
  h.view.close();
 }
});
