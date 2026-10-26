'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createDocument}=require('./helpers/dashboard-harness');
const source=fs.readFileSync('newtab.js','utf8');
const categories=[{id:'work',name:'Work',icon:'W'},{id:'reading',name:'Reading',icon:'R'}];
async function page(shared,id,generation='generation-one',options={}){
 const document=createDocument(),list=document.createElement('div'),grid=document.createElement('div');list.id='category-list';grid.id='shortcuts-grid';document.body.append(list,grid);
 const links=[{title:'Synthetic Work',category:'work'},{title:'Synthetic Reading',category:'reading'}];for(let i=0;i<links.length;i++){const tile=document.createElement('div');tile.className='shortcut-item';tile.dataset.index=String(i);grid.append(tile);}
 const session=options.session||{id,generation},writes=[];
 const window={addEventListener(){},LocalItabWorkspaces:{session},shortcutsComponentInstance:{links,reflowVisibleLayout(){}},getComputedStyle:()=>({visibility:'visible',display:'block'})};
 const context={window,document,console,setTimeout(){},storageManager:options.store||{getDefaultValue:()=>structuredClone(categories),get:async()=>structuredClone(options.categories||categories)},localStorage:{getItem:key=>shared.get(key)||null,setItem:(key,value)=>{writes.push([key,value]);shared.set(key,value);}}};
 vm.createContext(context);vm.runInContext(source+'\nthis.CategoryNavigation=CategoryNavigation;',context);const navigation=new context.CategoryNavigation();await new Promise(r=>setImmediate(r));
 return{navigation,window,session,writes,context,list,visible:()=>grid.children.filter(n=>n.style.display!=='none').map(n=>links[Number(n.dataset.index)].title)};
}
test('workspace category journey: A Work, B Reading, return to A retains its own category and cards',async()=>{
 const shared=new Map();const a=await page(shared,'default');a.navigation.selectCategory('work');const b=await page(shared,'second');b.navigation.selectCategory('reading');const returned=await page(shared,'default');
 assert.equal(returned.navigation.currentCategory,'work');assert.deepEqual(returned.visible(),['Synthetic Work']);assert.equal((await page(shared,'second')).navigation.currentCategory,'reading');
});
test('a new non-default workspace does not inherit a same-named legacy category preference',async()=>{
 const shared=new Map([['currentCategory','reading']]);const b=await page(shared,'second');assert.equal(b.navigation.currentCategory,'all');assert.deepEqual(b.visible(),['Synthetic Work','Synthetic Reading']);assert.deepEqual(b.writes,[]);
});
test('recreated workspace generation does not adopt its prior generation category preference',async()=>{
 const shared=new Map();const old=await page(shared,'second','old-generation');old.navigation.selectCategory('reading');const fresh=await page(shared,'second','new-generation');assert.equal(fresh.navigation.currentCategory,'all');assert.deepEqual(fresh.writes,[]);
});
test('Default keeps its legacy preference until explicitly choosing an independent scoped preference',async()=>{
 const shared=new Map([['currentCategory','reading']]);const a=await page(shared,'default');assert.equal(a.navigation.currentCategory,'reading');assert.deepEqual(a.writes,[]);a.navigation.selectCategory('work');assert.equal(shared.get('currentCategory'),'reading');
 assert.equal((await page(shared,'default')).navigation.currentCategory,'work');assert.equal((await page(shared,'other')).navigation.currentCategory,'all');
});
test('deleted category falls back to All without rewriting preference or hiding unrelated cards',async()=>{
 const shared=new Map();const a=await page(shared,'second');a.navigation.selectCategory('reading');const saved=[...shared];const next=await page(shared,'second','generation-one',{categories:categories.slice(0,1)});
 assert.equal(next.navigation.currentCategory,'all');assert.deepEqual(next.visible(),['Synthetic Work','Synthetic Reading']);assert.deepEqual([...shared],saved);assert.deepEqual(next.writes,[]);
});
for(const change of ['session','generation','invalidated','store'])test(`retired category controls do not change selection or preference after ${change} change`,async()=>{
 const shared=new Map(),a=await page(shared,'second');a.navigation.selectCategory('work');const before=[...shared];
 if(change==='session')a.window.LocalItabWorkspaces.session={...a.session};if(change==='generation')a.session.generation='replacement';if(change==='invalidated')a.session.invalidated=true;if(change==='store')a.context.storageManager={...a.context.storageManager};
 a.navigation.selectCategory('reading');assert.equal(a.navigation.currentCategory,'work');assert.deepEqual([...shared],before);
});
test('late category read cannot render or read a preference for a replacement workspace',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);const shared=new Map();const a=await page(shared,'second','generation-one',{store:{getDefaultValue:()=>categories,get:()=>pending}});
 a.window.LocalItabWorkspaces.session={id:'third',generation:'new'};resolve(categories);await new Promise(r=>setImmediate(r));assert.equal(a.list.children.length,0);assert.equal(a.navigation.storageKey,null);assert.deepEqual(a.writes,[]);
});
test('identity that becomes ready during the original category read selects the final stable workspace key',async()=>{
 const session={id:null,generation:null};const a=await page(new Map(),'unused','unused',{session,store:{getDefaultValue:()=>categories,get:async()=>{session.id='resolved';session.generation='stable';return categories;}}});
 a.navigation.selectCategory('reading');assert.match(a.writes[0][0],/resolved.*stable/);
});
test('real Manager/Session + StorageManager: ordinary edits, rename, switch and fresh page retain generation and scoped category',async()=>{
 const Workspaces=require('../shared/workspaces'),StorageManager=require('../storage');
 const raw={...new StorageManager().cloneDefaultConfig(),categories:structuredClone(categories)},listeners=new Set(),queues=new Map();let serial=0,writes=0;
 const clone=structuredClone;
 const local={async get(keys){if(keys==null)return clone(raw);if(typeof keys==='string')keys=[keys];if(!Array.isArray(keys))keys=Object.keys(keys);return clone(Object.fromEntries(keys.filter(k=>k in raw).map(k=>[k,raw[k]])));},async set(values){writes++;const changes=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,{oldValue:clone(raw[k]),newValue:clone(v)}]));Object.assign(raw,clone(values));for(const fn of listeners)fn(changes,'local');},async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete raw[k];},async getBytesInUse(){return JSON.stringify(raw).length;}};
 const locks={request(name,options,action){const run=action||options;const p=(queues.get(name)||Promise.resolve()).then(run);queues.set(name,p.catch(()=>{}));return p;}};
 const chrome={storage:{local,onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}}};
 const manager=Workspaces.createManager({chrome,locks,now:()=> '2026-10-26T20:00:00.000Z',id:()=>`synthetic_identity_${++serial}`});await manager.ready();const second=await manager.create('Second');
 const aSession=manager.capture('default');await aSession.ready();const bSession=manager.capture(second.id);await bSession.ready();await bSession.local.set({categories:structuredClone(categories)});
 const shared=new Map(),a=await page(shared,'default','ignored',{session:aSession,store:new StorageManager({workspace:aSession})});const initial=aSession.generation;
 let before=clone(raw),count=writes;a.navigation.selectCategory('work');assert.deepEqual(raw,before);assert.equal(writes,count);
 await aSession.local.set({quote:'Synthetic ordinary edit'});await manager.rename('default','Renamed Default');await manager.select(second.id);
 const b=await page(shared,second.id,'ignored',{session:bSession,store:new StorageManager({workspace:bSession})});b.navigation.selectCategory('reading');await manager.select('default');
 const reopened=manager.capture('default');await reopened.ready();assert.equal(reopened.generation,initial);const returned=await page(shared,'default','ignored',{session:reopened,store:new StorageManager({workspace:reopened})});assert.equal(returned.navigation.currentCategory,'work');assert.deepEqual(returned.visible(),['Synthetic Work']);
 const oldGeneration=bSession.generation;await manager.trash(second.id);await manager.restore(second.id);const restored=manager.capture(second.id);await restored.ready();assert.notEqual(restored.generation,oldGeneration);const fresh=await page(shared,second.id,'ignored',{session:restored,store:new StorageManager({workspace:restored})});assert.equal(fresh.navigation.currentCategory,'all');
});
test('selection before category initialization finishes cannot persist a null preference key',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r),shared=new Map();const a=await page(shared,'second','generation-one',{store:{getDefaultValue:()=>categories,get:()=>pending}});
 a.navigation.selectCategory('reading');assert.equal(a.navigation.currentCategory,'all');assert.deepEqual([...shared],[]);resolve(categories);await new Promise(r=>setImmediate(r));
});
test('a ready identity changed during category loading cannot adopt the prior read under its new generation',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r),shared=new Map();const a=await page(shared,'second','generation-one',{store:{getDefaultValue:()=>categories,get:()=>pending}});
 a.session.generation='changed';resolve(categories);await new Promise(r=>setImmediate(r));assert.equal(a.list.children.length,0);assert.equal(a.navigation.storageKey,null);
});
