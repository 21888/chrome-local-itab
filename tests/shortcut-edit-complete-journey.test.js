'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),StorageManager=require('../storage');
const {createHarness,submit}=require('./helpers/dashboard-harness');
const clone=x=>structuredClone(x);
test('actual shortcut persistence: edit exact duplicate across category, delete it, then Undo restores original order and edited bytes',async()=>{
 const links=[{title:'Twin',url:'https://example.com/twin',icon:'A',category:'work'},{title:'Twin',url:'https://example.com/twin',icon:'B',category:'work'},{title:'Social unchanged',url:'https://example.org/',icon:'S',category:'social'}];
 links.forEach((link,index)=>link.layoutId='l_'+String(index+1).repeat(32));
 const h=createHarness(links),raw={schemaVersion:2,links:clone(links),categories:[{id:'work',name:'Work'},{id:'social',name:'Social'}],layout:{autoArrange:true,identityVersion:1,positions:{},positionsById:Object.fromEntries(links.map(x=>[x.layoutId,{}]))},privacy:{onlineFavicons:false},sync:{enabled:false}},writes=[];
 const storage=new StorageManager();storage._syncInitialized=true;let queue=Promise.resolve();storage.withLocalWriteLock=fn=>{const run=queue.then(fn);queue=run.catch(()=>{});return run;};Object.defineProperty(storage,'_local',{value:{get:async()=>clone(raw),set:async value=>{writes.push(clone(value));Object.assign(raw,clone(value));}}});storage.scheduleShortcutUndoSync=async()=>{};
 h.context.storageManager=storage;h.context.window.storageManager=storage;h.context.window.shortcutsComponentInstance=h.component;h.context.localStorage={setItem(){}};
 h.component.openEditModal(1);h.component.modal.querySelector('#shortcut-title').value='Edited exact second twin';h.component.modal.querySelector('#shortcut-category').value='social';await submit(h.component);
 assert.equal(writes.length,1);assert.deepEqual(raw.links[0],links[0]);assert.deepEqual(raw.links[2],links[2]);assert.equal(raw.links[1].title,'Edited exact second twin');assert.equal(raw.links[1].icon,'B');assert.equal(raw.links[1].url,links[1].url);assert.equal(h.context.window.categoryNavigation.currentCategory,'work');assert.equal(h.tile(1).getClientRects().length,0);
 h.context.window.categoryNavigation.selectCategory('social');assert(h.tile(1).getClientRects().length);const edited=clone(raw.links);assert.equal(await h.component.deleteShortcut(1),true);assert.equal(writes.length,2);assert.deepEqual(raw.links,[edited[0],edited[2]]);assert.equal(await h.component.undoShortcutDeletion(),true);assert.equal(writes.length,3);assert.deepEqual(raw.links,edited);assert.equal(h.context.window.categoryNavigation.currentCategory,'social');assert(h.tile(1).getClientRects().length);assert.equal(h.opened.length,0);assert.deepEqual(raw.privacy,{onlineFavicons:false});assert.deepEqual(raw.sync,{enabled:false});
});
