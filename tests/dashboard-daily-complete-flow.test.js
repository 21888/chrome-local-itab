const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const StorageManager = require('../storage.js');
const { createDocument } = require('./helpers/task-dom-model');
const tick = () => new Promise(setImmediate);
const {webcrypto}=require('node:crypto');

function flow({free=false}={}) {
    const document = createDocument({ blurUnavailableFocus: true }); document.documentElement.lang = 'en';
    // Extend only this fixture's selector model for the production grid's :not.
    const elements = Object.getPrototypeOf(document.body), matches = elements.matches;
    elements.matches = function(selector) { return selector.split(',').some(raw => {
        const excluded = raw.match(/:not\(([^)]+)\)/);
        return (!excluded || !matches.call(this, excluded[1])) && matches.call(this, raw.replace(/:not\([^)]+\)/g, ''));
    }); };
    const container = document.createElement('section'); container.id = 'shortcuts-container';
    const categoryList = document.createElement('div'); categoryList.id = 'category-list'; document.body.append(categoryList, container);
    const raw = { links: [{title:'Twin',url:'https://example.com/twin',icon:'A',category:'work',marker:'first'}, {title:'Twin',url:'https://example.com/twin',icon:'B',category:'work',marker:'second'}, {title:'Reading item',url:'https://example.org/reading',icon:'R',category:'reading'}, {title:'Orphan item',url:'https://example.org/orphan',icon:'O',category:'orphan'}],
        categories: [{ id: 'work', name: 'Work' }, { id: 'reading', name: 'Reading' }, {id:'later',name:'Later'}], layout: { autoArrange: true, positions: {} },
        privacy: { onlineFavicons: false }, sync: { enabled: false } };
    if(free){raw.schemaVersion=2;raw.links.forEach((link,i)=>link.layoutId='l_'+String(i+1).padStart(32,'0'));raw.layout={autoArrange:false,identityVersion:1,positionsById:Object.fromEntries(raw.links.map((link,i)=>[link.layoutId,{[link.category]:{x:i*100,y:0}}]))};}
    const writes = [], preferences = [], opened = [], errors = [], results = [], storageListeners = new Set();
    const storage = new StorageManager(); storage._syncInitialized = true; let queue = Promise.resolve();
    storage.withLocalWriteLock = action => { const result = queue.then(action); queue = result.catch(() => {}); return result; };
    Object.defineProperty(storage, '_local', { value: { async get() { return structuredClone(raw); }, async set(value) { writes.push(structuredClone(value)); const changes = Object.fromEntries(Object.entries(value).map(([key, next]) => [key, { oldValue: structuredClone(raw[key]), newValue: structuredClone(next) }])); Object.assign(raw, structuredClone(value)); for (const listener of storageListeners) listener(changes, 'local'); } } });
    storage.onLocalChanged = listener => { storageListeners.add(listener); return () => storageListeners.delete(listener); };
    storage.scheduleShortcutUndoSync = async () => {};
    const context = { document, storageManager: storage, URL, Intl, console, setTimeout, clearTimeout, crypto:webcrypto, performance, setInterval, clearInterval, window: null,
        addEventListener() {}, removeEventListener() {}, open: url => opened.push(url),
        getComputedStyle: node => ({ visibility: node.style.visibility || 'visible' }),
        localStorage: { getItem() { return 'work'; }, setItem(...args) { preferences.push(args); } },
        LocalItabWorkspaces: null };
    context.window = context; vm.createContext(context);
    for (const file of ['shared/dialog-focus.js', 'shared/stored-shortcut-url.js', 'shared/shortcut-organizer.js', 'shared/shortcut-organizer-view.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    if(free)for(const file of ['shared/layout-identity.js','shared/layout.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
    vm.runInContext(fs.readFileSync('newtab.js', 'utf8') + '\nthis.ShortcutsComponent=ShortcutsComponent; this.CategoryNavigation=CategoryNavigation;', context);
    context.showErrorMessage = message => errors.push(message);
    const component = context.shortcutsComponentInstance = new context.ShortcutsComponent(structuredClone(raw.links), raw.layout, raw.categories,free?storage.layoutSnapshot(raw):undefined);
    // Real grid/card rendering and filtering; layout geometry and unrelated edit
    // modal setup are outside this DOM-model flow.
    if(!free)component.applyLayoutMode = () => {}; component.createModal = () => {};
    const navigation = context.categoryNavigation = Object.create(context.CategoryNavigation.prototype);
    navigation.currentCategory = 'work'; navigation.storageKey = 'currentCategory'; navigation.categories = raw.categories;
    component.render(); navigation.render({ reflow: false });
    const grid = document.getElementById('shortcuts-grid');
    return { document, raw, writes, preferences, opened, errors, results, storage, context, component, navigation, grid, view: component.organizerView,
        tile(index) { return grid.querySelectorAll('.shortcut-item:not(.add-shortcut)').find(node => node.dataset.index === String(index)); } };
}

async function completePage(options){
 const h=flow(options),{context,document,raw,storage}=h;
 raw.appearance={template:'clarity',colorMode:'light'};
 storage.isSyncEnabledLocally=async()=>false;
 for(const name of ['tasks','scratchpad','focus']){
  const api=context['LocalItab'+({tasks:'Tasks',scratchpad:'Scratchpad',focus:'Focus'}[name])]=require('../shared/local-'+name+'-store');
  // Copy the API object: browser view attachment must not mutate module exports.
  context['LocalItab'+({tasks:'Tasks',scratchpad:'Scratchpad',focus:'Focus'}[name])]={...api};
  raw[api.KEY]={...api.initial(),enabled:true};
  for(const part of ['controller','view'])vm.runInContext(fs.readFileSync('shared/local-'+name+'-'+part+'.js','utf8'),context);
 }
 const dashboard=document.createElement('main');dashboard.id='dashboard';document.body.append(dashboard);const cards=document.createElement('section');cards.id='info-cards-container';dashboard.append(cards);
 cards.appendChild=node=>{if(node.parentElement)node.parentElement.children=node.parentElement.children.filter(child=>child!==node);cards.append(node);};
 const modules={};
 for(const [name,apiName]of [['tasks','Tasks'],['scratchpad','Scratchpad'],['focus','Focus']]){
  const api=context['LocalItab'+apiName],host=document.createElement('article');host.id='local-'+name+'-card';cards.append(host);
  const backend={lock:fn=>storage.withLocalWriteLock(fn),read:async()=>structuredClone(raw[api.KEY]),write:async value=>{raw[api.KEY]=structuredClone(value);},subscribe:()=>()=>{}};
  const controller=new api.Controller(new api.Store(backend),{delay:60000});
  const view=name==='tasks'?api.mount(host,{controller,alwaysVisible:true}):new api.View(host,{controller});
  context['local'+apiName+'View']=view;modules[name]={host,controller,view};
 }
 const appearance=document.createElement('div');appearance.id='dashboard-appearance';document.body.append(appearance);
 for(const file of ['shared/dashboard-template-registry.js','shared/dashboard-template-gallery.js','shared/dashboard-card-layout.js','shared/dashboard-customization.js','shared/appearance.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
 context.setupDashboardAppearance({appearance:raw.appearance,_settingsBaseline:{generation:null}});
 for(let i=0;i<5;i++)await tick();
 for(const [name,m]of Object.entries(modules)){assert.equal(m.controller.error,null,name+' initialized without error');assert(m.controller.state,name+' actual state loaded');}
 return {...h,modules,appearance,async settle(){for(let i=0;i<8;i++)await tick();},destroy(){for(const m of Object.values(modules))m.view.destroy();}};
}
test('actual template preview/apply/cancel preserves personal drafts and current-category shortcuts',async(t)=>{
 const h=await completePage();t.after(()=>h.destroy());const {tasks,scratchpad,focus}=h.modules;
 tasks.view.input.value='Synthetic unsubmitted task';tasks.view.input.dispatch('input');
 scratchpad.controller.setComposing(true);scratchpad.view.textarea.value='Synthetic unsaved note';scratchpad.view.textarea.dispatch('input');
 focus.view.minutes.value='31';focus.view.minutes.dispatch('input');
 const before=structuredClone(h.raw),originals={tasks:tasks.view.input,note:scratchpad.view.textarea,minutes:focus.view.minutes};
 const choose=id=>{h.appearance.querySelector('[data-template-choice="'+id+'"]').dispatch('click');};
 h.appearance.querySelector('details').open=true;choose('folio');await h.settle();
 assert.equal(h.context.appearanceController.preview.template,'folio');assert.equal(h.component.getCurrentCategory(),'work');
 assert.equal(tasks.view.input,originals.tasks);assert.equal(tasks.view.input.value,'Synthetic unsubmitted task');assert.equal(scratchpad.view.textarea.value,'Synthetic unsaved note');assert.equal(focus.view.minutes.value,'31');
 h.appearance.querySelector('.template-preview-cancel').dispatch('click');await h.settle();assert.equal(h.raw.appearance.template,'clarity');assert.deepEqual(h.raw,before);
 choose('folio');await h.settle();h.appearance.querySelector('.template-preview-apply').dispatch('click');await h.settle();
 assert.equal(h.raw.appearance.template,'folio');for(const key of Object.keys(before).filter(k=>k!=='appearance'))assert.deepEqual(h.raw[key],before[key],key);
 assert.equal(h.component.getCurrentCategory(),'work');for(const m of Object.values(h.modules))assert(m.host.isConnected&&!m.host.hidden);
 assert.equal(scratchpad.view.textarea,originals.note);assert.equal(focus.view.minutes,originals.minutes);
 tasks.view.input.dispatch('keydown',{key:'Enter'});await h.settle();assert.equal(tasks.controller.state.records.at(-1).text,'Synthetic unsubmitted task');
 scratchpad.controller.setComposing(false);await scratchpad.controller.save();assert.equal(scratchpad.controller.state.content,'Synthetic unsaved note');
 focus.view.minutes.dispatch('change');await h.settle();assert.equal(focus.controller.snapshot().durations.focus,31);focus.view.start.dispatch('click');await h.settle();assert.equal(focus.controller.snapshot().session.status,'running');
 assert.equal(h.grid.querySelectorAll('.shortcut-item:not(.add-shortcut)').length,h.component.links.length);assert(h.tile(0));assert.equal(h.tile(0).style.display==='none',false);assert.equal(h.component.links[0].title,before.links[0].title);h.destroy();
});

test('actual Customize card order preview and Cancel retain live module identities and drafts',async(t)=>{
 const h=await completePage();t.after(()=>h.destroy());const {scratchpad,tasks,focus}=h.modules;
 scratchpad.controller.setComposing(true);scratchpad.view.textarea.value='Synthetic note in layout';scratchpad.view.textarea.dispatch('input');tasks.view.input.value='Synthetic task in layout';tasks.view.input.dispatch('input');focus.view.minutes.value='37';focus.view.minutes.dispatch('input');
 const before=structuredClone(h.raw),cards=h.document.getElementById('info-cards-container'),nodes=[...cards.children];
 h.appearance.querySelector('.customize-launch').dispatch('click');await h.settle();
 const row=h.document.querySelector('[data-card-layout-id="local-scratchpad-card"]');assert(row);row.children[1].dispatch('click');
 assert.notDeepEqual(cards.children.map(n=>n.id),nodes.map(n=>n.id));
 assert.equal(scratchpad.view.textarea.value,'Synthetic note in layout');assert.equal(tasks.view.input.value,'Synthetic task in layout');assert.equal(focus.view.minutes.value,'37');
 h.document.querySelector('.customize-overlay').querySelectorAll('button').find(n=>n.textContent==='Cancel').dispatch('click');await h.settle();
 assert.deepEqual(cards.children.map(n=>n.id),nodes.map(n=>n.id));for(const node of nodes)assert(cards.children.includes(node));assert.deepEqual(h.raw,before);h.destroy();
});

test('Customize Save/reopen with template changes preserves Tasks, Scratchpad and Focus and keeps original card nodes',async()=>{
 const h=await completePage(),before=structuredClone(h.raw),cards=h.document.getElementById('info-cards-container'),nodes=[...cards.children];
 h.appearance.querySelector('.customize-launch').dispatch('click');await h.settle();
 const width=h.document.querySelector('[data-card-span="local-scratchpad-card"]');width.value='2';width.dispatch('change');
 h.document.querySelector('.customize-save').dispatch('click');await h.settle();
 assert.equal(h.document.querySelector('.customize-overlay'),null);assert.equal(h.raw.appearance.customization.cardSpans['local-scratchpad-card'],2);
 for(const id of ['graphite','folio','clarity']){
  h.appearance.querySelector('details').open=true;h.appearance.querySelector('[data-template-choice="'+id+'"]').dispatch('click');await h.settle();h.appearance.querySelector('.template-preview-apply').dispatch('click');await h.settle();
  assert.equal(h.raw.appearance.template,id);assert.equal(h.raw.appearance.customization.cardSpans['local-scratchpad-card'],2);
  for(const node of nodes)assert(cards.children.includes(node)&&node.isConnected&&!node.hidden);
  for(const key of Object.keys(before).filter(k=>k!=='appearance'))assert.deepEqual(h.raw[key],before[key],key);
 }
 h.appearance.querySelector('.customize-launch').dispatch('click');await h.settle();assert.equal(h.document.querySelector('[data-card-span="local-scratchpad-card"]').value,'2');
 h.document.querySelector('.customize-overlay').querySelectorAll('button').find(n=>n.textContent==='Cancel').dispatch('click');await h.settle();h.destroy();
});

test('free shortcut plane survives template preview/cancel/apply and category return with exact saved coordinates',async(t)=>{
 const h=await completePage({free:true});t.after(()=>h.destroy());const before=structuredClone(h.raw);assert(h.component.layoutController,'actual layout controller');
 for(const id of ['folio','graphite','clarity']){
  h.appearance.querySelector('details').open=true;h.appearance.querySelector('[data-template-choice="'+id+'"]').dispatch('click');await h.settle();
  assert(h.component._templatePreview);h.appearance.querySelector('.template-preview-cancel').dispatch('click');await h.settle();assert.deepEqual(h.raw,before);
 }
 h.appearance.querySelector('[data-template-choice="folio"]').dispatch('click');await h.settle();h.appearance.querySelector('.template-preview-apply').dispatch('click');await h.settle();
 h.navigation.selectCategory('reading');h.navigation.selectCategory('work');await h.settle();
 assert.deepEqual(h.raw.links,before.links);assert.deepEqual(h.raw.layout,before.layout);assert.equal(h.component.getCurrentCategory(),'work');assert(h.tile(0)&&h.tile(0).style.display!=='none');assert.equal(h.errors.length,0);assert.equal(Boolean(h.component.layoutController.failedChange),false);assert.equal(h.component.layoutController.timer,null);
 for(const m of Object.values(h.modules))assert(m.host.isConnected&&!m.host.hidden);
});
