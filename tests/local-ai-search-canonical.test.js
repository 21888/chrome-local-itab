'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Search=require('../shared/local-ai-search');
const ph=require('./helpers/prompts-harness'),ch=require('./helpers/collections-harness');
const base=(changes={})=>({id:'canonical_record',title:'Saved',body:'Body',tags:[],notes:'',deletedAt:null,...changes});
for(const type of ['prompt','collection'])for(const field of ['title','body','tags',...(type==='collection'?['notes']:[])]){
 test(`${type} ${field} matches canonically equivalent text in both directions without changing original bytes`,()=>{
  for(const [saved,query]of [['Cafe\u0301','Café'],['Café','Cafe\u0301']]){
   const record=base({[field]:field==='tags'?[saved]:saved}),snapshot={[type]:{records:[record]}},before=JSON.stringify(snapshot);
   const rows=Search.search(snapshot,query,type);assert.equal(rows.length,1);assert.equal(rows[0].field,field);assert(rows[0].snippet.includes(saved));assert.equal(rows[0].title,record.title);assert.equal(JSON.stringify(snapshot),before);
  }
 });
}
test('real saved libraries -> canonical search -> exact record target remains read-only',async()=>{
 const p=ph.setup(),c=ch.setup();let search;
 try{
  await p.controller.start();await c.controller.start();const prompt=await ph.add(p.controller,'Cafe\u0301 prompt','Exact Cafe\u0301 body');const collection=await ch.add(c.controller,'Cafe\u0301 result','Exact Cafe\u0301 result');
  search=new Search.Controller({stores:{prompt:p.store,collection:c.store}});await search.start();const before=JSON.stringify([p.raw,c.raw]),writes=[p.writes,c.writes];
  const rows=search.results('Café','all');assert.equal(rows.length,2);
  for(const row of rows){assert(search.current(row));const controller=row.type==='prompt'?p.controller:c.controller;const request=Search.target(new URL(row.href,'https://local.invalid/').search);assert.deepEqual(Search.resolveTarget(controller.state,request),{id:row.type==='prompt'?prompt.id:collection.id});assert.equal(controller.select(request.id),true);assert.equal(controller.record().title,row.title);}
  assert.deepEqual([p.writes,c.writes],writes);assert.equal(JSON.stringify([p.raw,c.raw]),before);
 }finally{search?.dispose();p.controller.dispose();c.controller.dispose();}
});
test('long normalized prefixes retain literal snippets and the matching original text',()=>{
 for(const prefix of ['é'.repeat(300),'e\u0301'.repeat(300),'İ'.repeat(300),'👩‍💻'.repeat(150)]){
  const body=prefix+' target Cafe\u0301 日本語';const row=Search.search({prompt:{records:[base({body})]}},'Café')[0];assert(row);assert(row.snippet.includes('Cafe\u0301 日本語'));assert(row.snippet.startsWith('…'));assert(row.snippet.isWellFormed());assert(!row.snippet.includes('Café'));
 }
});
test('canonical search does not strip accents or compatibility-fold and preserves current-only filters',()=>{
 const snapshot={prompt:{records:[base({body:'Café 日本語 👩‍💻',history:[{body:'hidden-only'}],notes:'private-only'}),base({id:'archived_record',body:'archived-only',deletedAt:'archived'})]}};
 for(const query of ['Cafe','Ｃａｆé','hidden-only','private-only','archived-only'])assert.equal(Search.search(snapshot,query).length,0,query);
 for(const query of ['CAFÉ','日本語','👩‍💻','   '])assert.equal(Search.search(snapshot,query).length,1,query);
 assert.equal(Search.search(snapshot,'Café','collection').length,0);
});
test('canonical Hangul and reordered combining sequences match without rewriting result text',()=>{
 for(const [left,right]of [['가','가'],['a\u0315\u0300','à\u0315']])for(const [saved,query]of [[left,right],[right,left]]){
  const body='prefix '.repeat(80)+saved+' suffix 👩‍💻';const snapshots={collection:{records:[base({body})]}};const before=JSON.stringify(snapshots);const rows=Search.search(snapshots,query,'collection');assert.equal(rows.length,1);assert(rows[0].snippet.includes(saved+' suffix 👩‍💻'));assert.equal(JSON.stringify(snapshots),before);
 }
});
test('canonical matching does not normalize titles for existing stable result order',()=>{
 const a=base({id:'canonical_first',title:'Cafe\u0301',body:'needle'}),b=base({id:'canonical_second',title:'Café',body:'needle'});
 const rows=Search.search({prompt:{records:[b,a]}},'Café');assert.deepEqual(rows.map(r=>r.id),[a.id,b.id]);assert.deepEqual(rows.map(r=>r.title),[a.title,b.title]);
});
test('actual global search view activates exact canonical matches and target controllers load original bytes',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),{createDocument}=require('./helpers/finder-dom-model');
 const p=ph.setup(),c=ch.setup(),targets=[];let view;
 try{
  await p.controller.start();await c.controller.start();await ph.add(p.controller,'Cafe\u0301 prompt','Cafe\u0301 <literal>');await ch.add(c.controller,'Cafe\u0301 collection','Cafe\u0301 result');
  const before=JSON.stringify([p.raw,c.raw]);const document=createDocument(),host=document.createElement('nav');document.body.append(host);const root={document,LocalItabAISearch:Search};root.window=root;vm.createContext(root);
  for(const file of ['shared/dialog-focus.js','shared/local-ai-search-view.js'])vm.runInContext(fs.readFileSync(file,'utf8'),root);
  view=root.LocalItabAISearchView.mount(host,{prompt:p.store,collection:c.store});host.querySelector('button').focus();host.querySelector('button').dispatch('click');await ph.tick();const input=document.querySelector('input');input.value='Café';input.dispatch('input');
  const links=document.querySelectorAll('.ai-search-result');assert.equal(links.length,2);input.dispatch('keydown',{key:'ArrowDown'});assert.equal(document.activeElement,links[0]);
  for(const link of links){assert.equal(link.dispatch('click').prevented,false);assert(link.querySelector('.ai-search-snippet').textContent.includes('Cafe\u0301'));const isPrompt=link.href.startsWith('prompts.html');const Controller=require(isPrompt?'../shared/local-prompts-controller':'../shared/local-ai-collections-controller').Controller;const controller=new Controller({store:isPrompt?p.store:c.store});targets.push(controller);Search.prepareTarget(controller,new URL(link.href,'https://local.invalid/').search);await controller.start();assert.equal(controller.navigationError,null);assert.equal(controller.error,null);assert(controller.record().body.includes('Cafe\u0301'));assert(controller.record().title.includes('Cafe\u0301'));}
  assert.deepEqual([p.writes,c.writes],[1,1]);assert.equal(JSON.stringify([p.raw,c.raw]),before);
  input.dispatch('keydown',{key:'Escape'});assert.equal(document.querySelector('.ai-search-overlay'),null);assert.equal(document.activeElement,host.querySelector('button'));
 }finally{view?.destroy();for(const controller of targets)controller.dispose();p.controller.dispose();c.controller.dispose();}
});

{
const h=ch,S=Search,{Controller}=require('../shared/local-ai-collections-controller');
for(const target of ['valid','missing','invalid'])test(`actual Collection refresh preserves accepted read for ${target} target`,async()=>{
 const f=h.setup();let c;
 try{await f.controller.start();const r=await h.add(f.controller,'Saved','Exact');c=new Controller({store:f.store});S.prepareTarget(c,'?record='+(target==='valid'?r.id:target==='missing'?'missing_record':'bad'));await c.start();assert.equal(c.error,null);assert.equal(c.comparisonReady(),true);assert.equal(c.selected,target==='valid'?r.id:'');assert.equal(c.navigationError,target==='valid'?null:target);assert.equal(c.accept(await f.store.read()),true);assert.equal(f.writes,1);}finally{c?.dispose();f.controller.dispose();}
});
test('actual rejected older revision still returns false and sets READ without replacing state',async()=>{
 const f=h.setup();let c;
 try{await f.controller.start();const r=await h.add(f.controller,'Saved','Exact');c=new Controller({store:f.store});await c.start();const current=c.state;S.prepareTarget(c,'?record='+r.id);const old={...current,revision:current.revision-1};assert.equal(c.accept(old),false);assert.equal(c.state,current);c.store={read:async()=>old};await c.refresh();assert.deepEqual(c.error,{code:'READ',scope:'read'});assert.equal(c.state,current);assert.equal(c.comparisonReady(),false);assert.equal(f.writes,1);}finally{c?.dispose();f.controller.dispose();}
});
test('real read rejection remains fenced with no arbitrary selected record',async()=>{
 const c=new Controller({store:{subscribe:()=>()=>{},read:async()=>{throw Object.assign(new Error('private'),{code:'READ'})}}});S.prepareTarget(c,'?record=valid_record');await c.start();assert.deepEqual(c.error,{code:'READ',scope:'read'});assert.equal(c.selected,'');assert.equal(c.state,null);c.dispose();
});

}
test('delayed accepted Collection read cannot replace a newer user draft or falsely mark READ',async()=>{
 const f=ch.setup();let c;
 try{await f.controller.start();const r=await ch.add(f.controller,'Saved','Exact');const saved=await f.store.read();let release;const pending=new Promise(resolve=>{release=resolve});const Controller=require('../shared/local-ai-collections-controller').Controller;c=new Controller({store:{read:()=>pending,subscribe:()=>()=>{}}});Search.prepareTarget(c,'?record='+r.id);const started=c.start();c.create();c.update('title','Newer user draft');release(saved);await started;assert.equal(c.error,null);assert.equal(c.selected,'new');assert.equal(c.draft().input.title,'Newer user draft');assert.equal(c.state.records[0].id,r.id);assert.equal(f.writes,1);}finally{c?.dispose();f.controller.dispose();}
});
