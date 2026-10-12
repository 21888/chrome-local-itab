const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createDocument,deferred}=require('./helpers/task-dom-model');
function model() {
    const document=createDocument(),events=[];
    const context=vm.createContext({document,URL,console:{log(){},warn(){},error(){}},window:{},storageManager:{defaultConfig:{layout:{columns:6}}}});
    vm.runInContext(fs.readFileSync('newtab.js','utf8')+'\nthis.ShortcutsComponent=ShortcutsComponent;',context);
    const component=new context.ShortcutsComponent([{title:'A',url:'https://example.com/',icon:'A',category:'work'}]);
    component.layoutController={holdShortcutMutation(){events.push('hold');},async flush(){events.push('flush');},releaseShortcutMutation(){events.push('release');}};
    component.refreshShortcutUndo=()=>events.push('refresh');component.adoptShortcutSnapshot=()=>events.push('adopt');component.updateGrid=()=>events.push('grid');
    context.storageManager.addCatalogShortcut=async()=>{events.push('write');return {links:[]};};
    return {context,component,events};
}
test('batch mutation holds layout coordination through flush/write/adoption; releases once',async()=>{
    const h=model(),pending=deferred();h.context.storageManager.addCatalogShortcut=async()=>{h.events.push('write');assert.equal(h.component._shortcutWritesPending,1);await pending.promise;return{links:[]};};
    const saving=h.component.addCatalogShortcut({});await new Promise(setImmediate);assert.deepEqual(h.events,['hold','refresh','flush','write']);
    await assert.rejects(h.component.addCatalogShortcut({}));pending.resolve();await saving;assert.deepEqual(h.events,['hold','refresh','flush','write','adopt','grid','release','refresh']);assert.equal(h.component._shortcutWritesPending,0);
});
test('flush and write failures keep UI authoritative and release mutation hold',async()=>{
    for(const stage of ['flush','write']){const h=model();const reject=async()=>{throw new Error('failure');};if(stage==='flush')h.component.layoutController.flush=reject;else h.context.storageManager.addCatalogShortcut=reject;
        await assert.rejects(h.component.addCatalogShortcut({}));assert(!h.events.includes('adopt'));assert(!h.events.includes('grid'));assert.equal(h.component._shortcutWritesPending,0);assert.equal(h.events.filter(x=>x==='release').length,1);}
});
test('HTML includes library dependencies before newtab, Finder remains untouched',()=>{
    const html=fs.readFileSync('newtab.html','utf8');for(const f of ['shared/navigation-catalog.js','shared/navigation-sites.js','shared/navigation-library-view.js','navigation-library.css'])assert(html.includes(f));
    assert(html.indexOf('shared/navigation-catalog.js')<html.indexOf('shared/navigation-library-view.js'));assert(html.indexOf('shared/navigation-library-view.js')<html.indexOf('src="newtab.js"'));
});
for(const failure of ['existing','flush-false','flush-failed-change','invalidated'])test(`unresolved layout ${failure} never loses drag intent or writes`,async()=>{
    const h=model(),intent={positions:{saved:{x:15,y:25}}};
    if(failure==='existing')h.component.layoutController.failedChange=intent;
    if(failure==='invalidated')h.component.layoutController.invalidated=true;
    if(failure.startsWith('flush-'))h.component.layoutController.flush=async()=>{h.component.layoutController.failedChange=intent;return failure==='flush-false'?false:true;};
    await assert.rejects(h.component.addCatalogShortcut({}),{code:'CATALOG_LAYOUT_PENDING'});
    assert(!h.events.includes('write'));assert(!h.events.includes('adopt'));if(failure!=='invalidated')assert.equal(h.component.layoutController.failedChange,intent);assert.equal(h.component._shortcutWritesPending,0);
});
test('catalog category adoption refreshes navigation without selection persistence or an extra layout reflow',async()=>{
 const h=model(),categories=[{id:'work',name:'Work'},{id:'reading',name:'Reading'}];
 h.context.window.categoryNavigation={categories:[],currentCategory:'work',render(options){h.events.push('nav');assert.equal(options.reflow,false);assert.equal(h.component._shortcutWritesPending,1);assert.equal(this.currentCategory,'work');assert.equal(this.categories,categories);}};
 h.context.storageManager.addCatalogShortcut=async()=>{h.events.push('write');return {links:[],categories,createdCategory:categories[1],destination:'reading'};};
 await h.component.addCatalogShortcut({newCategory:{name:'Reading'}});assert.equal(h.component.categories,categories);assert.deepEqual(h.events,['hold','refresh','flush','write','adopt','nav','grid','release','refresh']);
});
test('CategoryNavigation render passes explicit reflow false and retains default true behavior',()=>{
 const h=model();vm.runInContext('this.CategoryNavigation=CategoryNavigation;',h.context);const nav=Object.create(h.context.CategoryNavigation.prototype),list=h.context.document.createElement('div');list.id='category-list';h.context.document.body.append(list);nav.categories=[];nav.createNavItem=()=>h.context.document.createElement('button');nav.updateCategoryUI=()=>{};const reflows=[];nav.filterShortcuts=options=>reflows.push(options.reflow);nav.render({reflow:false});nav.render();assert.deepEqual(reflows,[false,true]);
});
