const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Storage=require('../storage'),{fixture,Workspaces,copy}=require('./helpers/complete-backup-acceptance');
const {createDocument,deferred}=require('./helpers/task-dom-model');
const IDS=['local-tasks-card','local-focus-card','local-scratchpad-card','local-countdown-card','world-clocks-card','weather-container','hot-container','movie-container'];
async function settle(){for(let i=0;i<12;i++)await new Promise(setImmediate);}
async function page(t,{persisted=null,id='work'}={}){
 const f=fixture({persisted});delete f.raw.__auth;f.raw.sync={enabled:false};f.raw.privacy={onlineFavicons:false};
 const listeners=new Set();f.chrome.storage.onChanged={addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)};
 const set=f.chrome.storage.local.set;f.chrome.storage.local.set=async values=>{const old=copy(f.raw);await set(values);const changes=Object.fromEntries(Object.keys(values).map(k=>[k,{oldValue:old[k],newValue:copy(f.raw[k])}]));for(const fn of listeners)fn(changes,'local');};
 const providers=[];f.chrome.storage.sync=Object.fromEntries(['get','set','remove'].map(name=>[name,async()=>{providers.push(name);throw Error('Provider forbidden')} ]));
 const manager=new Workspaces.Manager({chrome:f.chrome,locks:f.locks}),session=manager.capture(id),storage=new Storage({workspace:session}),config=await storage.getAll();
 const document=createDocument({blurUnavailableFocus:true}),dashboard=document.createElement('main'),cards=document.createElement('section'),host=document.createElement('div');
 dashboard.id='dashboard';cards.id='info-cards-container';dashboard.append(cards);document.body.append(dashboard,host);
 document.body.prepend=node=>{node.parentElement=document.body;document.body.children.unshift(node);};
 cards.appendChild=node=>{if(node.parentElement)node.parentElement.children=node.parentElement.children.filter(x=>x!==node);cards.append(node);};
 for(const id of IDS){const n=document.createElement('article');n.id=id;cards.append(n);}
 const note=document.createElement('textarea');note.value='Synthetic unsaved module text';cards.children[2].append(note);
 const events=new Map(),reloads=[],navigations=[],confirmations=[];let accept=false;
 const window={document,storageManager:storage,LocalItabWorkspaces:{session,manager},
  addEventListener(type,fn){if(!events.has(type))events.set(type,new Set());events.get(type).add(fn)},removeEventListener(type,fn){events.get(type)?.delete(fn)},
  location:{reload(){reloads.push('reload')}},confirm(message){confirmations.push(message);return accept}};
 const context=vm.createContext({window,document,console,setTimeout,clearTimeout});
 for(const file of ['shared/dialog-focus.js','shared/dashboard-card-layout.js','shared/dashboard-customization.js','shared/appearance.js','shared/local-content-lifecycle.js','shared/workspaces-view.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
 const appearance=window.appearanceController=window.LocalItabAppearance.mount(host,{storage,initial:config.appearance,baseline:config._settingsBaseline,previewEnabled:true});
 const switcher=document.createElement('section'),managerHost=document.createElement('section');document.body.append(switcher,managerHost);
 const picker=window.workspacesView=window.LocalItabWorkspacesView.mount({switcher,managerHost,manager,session,lifecycle:window.LocalItabContentLifecycle,navigate:id=>navigations.push(id)});await picker.ready;
 t.after(()=>{appearance.closed=true;picker.destroy();});
 const button=label=>{const b=document.querySelectorAll('button').find(n=>n.textContent===label);assert(b,label);return b;};
 return{f,manager,session,storage,document,window,appearance,picker,cards,note,providers,reloads,navigations,confirmations,button,
  accept(value){accept=value},field(key,value,validity){const input=document.querySelector(`[data-customize-field="${key}"]`);assert(input&&!input.disabled);input.value=value;if(validity)input.validity=validity;input.dispatch('input');return input;},async open(){host.querySelector('.customize-launch').dispatch('click');await settle();assert(document.querySelector('.customize-overlay'));},
  span(id,value){const select=document.querySelector(`[data-card-span="${id}"]`);assert(select&&!select.disabled);select.value=value;select.dispatch('change');},
  departure(){const event={prevented:0,preventDefault(){this.prevented++}};for(const fn of events.get('beforeunload')||[])fn(event);return event;}};
}

test('real Customize draft is not discarded by the shared configuration reload path',async t=>{
 const h=await page(t);await h.open();h.span(IDS[2],'2');const raw=copy(h.f.raw),writes=h.f.writes.length;
 assert.equal(h.document.querySelector(`[data-card-span="${IDS[2]}"]`).value,'2');
 const reloaded=h.window.LocalItabContentLifecycle.reload();
 assert.equal(reloaded,false,'a configuration reload must defer while the actual customization editor owns the unsaved preview');
 assert.deepEqual(h.reloads,[]);assert.deepEqual(h.f.raw,raw);assert.equal(h.f.writes.length,writes);assert.equal(h.note.value,'Synthetic unsaved module text');
});

test('real submitted Customize Save requests departure warning while its Workspace write is pending',async t=>{
 const h=await page(t);await h.open();h.span(IDS[2],'2');const entered=deferred(),release=deferred();
 h.f.hooks.set=async(values,raw)=>{entered.resolve();await release.promise;Object.assign(raw,copy(values));};
 h.button('Save').dispatch('click');await entered.promise;
 try{
  assert.equal(h.appearance.pending,0,'the separate outer appearance controller does not own this save');
  const raw=copy(h.f.raw),writes=h.f.writes.length,event=h.departure();
  assert.equal(event.prevented,1,'the existing beforeunload boundary must account for the actual customization write');
  assert.equal(event.returnValue,'');assert.deepEqual(h.f.raw,raw);assert.equal(h.f.writes.length,writes);assert.deepEqual(h.providers,[]);
 }finally{release.resolve();await settle();}
});

test('clean opening, restored numeric value, Reset preview and Cancel do not leave a stale lifecycle guard',async t=>{
 const h=await page(t),before=copy(h.f.raw);await h.open();
 const lifecycle=h.window.LocalItabContentLifecycle;
 assert.equal(lifecycle.hasUncommittedWork(),false);assert.equal(h.departure().prevented,0);
 h.field('cardGap','24');assert(lifecycle.hasUncommittedWork());assert.equal(h.departure().prevented,1);
 h.field('cardGap','');assert.equal(lifecycle.hasUncommittedWork(),false);assert.equal(h.departure().prevented,0);
 h.span(IDS[2],'2');assert(lifecycle.hasUncommittedWork());h.button('Reset preview').dispatch('click');
 assert.equal(lifecycle.hasUncommittedWork(),false);h.field('cardGap','20');h.button('Cancel').dispatch('click');
 assert.equal(h.window.LocalItabCustomization.pending,false);assert.equal(lifecycle.hasUncommittedWork(),false);assert.equal(h.departure().prevented,0);
 assert.deepEqual(h.f.raw,before);assert.equal(h.f.writes.length,0);assert.deepEqual(h.providers,[]);
 assert.equal(lifecycle.reload(),true);assert.deepEqual(h.reloads,['reload']);assert.deepEqual(h.confirmations,[]);
});

test('raw invalid number is protected even when the validated customization has not changed',async t=>{
 const h=await page(t);await h.open();const before=copy(h.f.raw),lifecycle=h.window.LocalItabContentLifecycle;
 const field=h.field('cardGap','',{badInput:true});assert.equal(h.button('Save').disabled,true);
 assert(lifecycle.hasUncommittedWork());assert.equal(h.departure().prevented,1);
 assert.equal(lifecycle.reload(),false);assert.deepEqual(h.reloads,[]);assert.equal(field.value,'');
 h.field('cardGap','',{badInput:false});assert.equal(h.button('Save').disabled,false);
 assert.equal(lifecycle.hasUncommittedWork(),false);assert.equal(h.departure().prevented,0);assert.deepEqual(h.f.raw,before);
 h.button('Cancel').dispatch('click');assert.deepEqual(h.providers,[]);
});

test('Save and switch never implicitly submits or clears a Customize preview',async t=>{
 const h=await page(t);await h.open();h.span(IDS[2],'2');const before=copy(h.f.raw),writes=h.f.writes.length;
 assert.equal(await h.window.LocalItabContentLifecycle.saveDrafts(),false);
 assert.equal(h.document.querySelector(`[data-card-span="${IDS[2]}"]`).value,'2');assert.deepEqual(h.f.raw,before);assert.equal(h.f.writes.length,writes);
 h.button('Cancel').dispatch('click');assert.equal(await h.window.LocalItabContentLifecycle.saveDrafts(),true);assert.deepEqual(h.providers,[]);
});

test('actual rejected customization write retains edit and warning; explicit Save retry commits only the intended workspace',async t=>{
 const h=await page(t);await h.open();h.span(IDS[2],'2');const before=copy(h.f.raw),other=copy(h.f.values('default'));
 h.f.hooks.set=async()=>{throw Error('Synthetic customization write rejected')};h.button('Save').dispatch('click');await settle();
 assert.match(h.document.querySelector('.customize-status').textContent,/Could not save/);
 assert.equal(h.window.LocalItabCustomization.pending,false);assert(h.window.LocalItabContentLifecycle.hasUncommittedWork());assert.equal(h.departure().prevented,1);
 assert.deepEqual(h.f.raw,before);assert.equal(h.document.querySelector(`[data-card-span="${IDS[2]}"]`).value,'2');
 h.f.hooks.set=null;h.button('Save').dispatch('click');await settle();
 assert.equal(h.document.querySelector('.customize-overlay'),null);assert.equal(h.f.values('work').appearance.customization.cardSpans[IDS[2]],2);
 assert.equal(h.window.LocalItabContentLifecycle.hasUncommittedWork(),false);assert.equal(h.departure().prevented,0);
 assert.deepEqual(h.f.values('default'),other);assert.deepEqual(h.providers,[]);
});

test('actual same-field conflict keeps the draft guarded, Cancel restores latest, and a new explicit edit can save',async t=>{
 const h=await page(t);await h.open();h.span(IDS[2],'2');
 const other=new Storage({workspace:h.manager.capture('work')}),current=await other.getAll();
 await other.patchDashboardCustomization({cardSpans:{[IDS[2]]:3},cardLayoutMode:'grid'},{generation:current._settingsBaseline.generation,customization:current.appearance.customization});await settle();
 const before=copy(h.f.raw),writes=h.f.writes.length;h.button('Save').dispatch('click');await settle();
 assert.match(h.document.querySelector('.customize-status').textContent,/changed/);assert(h.window.LocalItabContentLifecycle.hasUncommittedWork());assert.equal(h.departure().prevented,1);
 assert.equal(h.document.querySelector(`[data-card-span="${IDS[2]}"]`).value,'2');assert.deepEqual(h.f.raw,before);assert.equal(h.f.writes.length,writes);
 h.button('Cancel').dispatch('click');assert.equal(h.cards.children.find(n=>n.id===IDS[2]).style['--card-layout-span'],'3');assert.equal(h.departure().prevented,0);
 await h.open();h.span(IDS[2],'4');h.button('Save').dispatch('click');await settle();
 assert.equal(h.f.values('work').appearance.customization.cardSpans[IDS[2]],4);assert.equal(h.f.writes.length,writes+1);assert.equal(h.departure().prevented,0);
});

test('Cancel and explicit Save retain exact content through actual workspace selection away and fresh-page return',async t=>{
 const h=await page(t),initial=copy(h.f.raw),originalWork=copy(h.f.values('work')),originalDefault=copy(h.f.values('default'));
 const defaultProjection=await h.manager.capture('default').local.get(null);
 await h.open();h.span(IDS[2],'2');h.button('Cancel').dispatch('click');assert.deepEqual(h.f.raw,initial);
 await h.open();h.span(IDS[2],'2');h.button('Save').dispatch('click');await settle();assert.equal(h.f.writes.length,1);
 const saved=copy(h.f.values('work')),savedProjection=await h.session.local.get(null);assert.deepEqual(Object.fromEntries(Object.entries(saved).filter(([k])=>k!=='appearance')),originalWork);
 await h.open();h.span(IDS[2],'3');h.button('Cancel').dispatch('click');assert.deepEqual(h.f.values('work'),saved);assert.equal(h.f.writes.length,1);
 const node=h.cards.children.find(n=>n.id===IDS[2]);assert.equal(h.note.parentElement,node);assert.equal(h.note.value,'Synthetic unsaved module text');
 await h.picker.requestSwitch('default');assert.deepEqual(h.navigations,['default']);assert.deepEqual(h.f.values('work'),saved);assert.deepEqual(h.f.values('default'),originalDefault);
 h.appearance.closed=true;h.picker.destroy();
 const away=await page(t,{persisted:copy(h.f.raw),id:'default'});assert.deepEqual(await away.session.local.get(null),defaultProjection);
 await away.picker.requestSwitch('work');assert.deepEqual(away.navigations,['work']);away.appearance.closed=true;away.picker.destroy();
 const returned=await page(t,{persisted:copy(away.f.raw),id:'work'});await returned.open();
 assert.equal(returned.document.querySelector(`[data-card-span="${IDS[2]}"]`).value,'2');assert.equal(returned.document.querySelector('[data-card-layout-mode]').value,'grid');
 assert.deepEqual(await returned.session.local.get(null),savedProjection);assert.deepEqual(returned.f.values('default'),originalDefault);
 for(const key of [Workspaces.SNAPSHOT_KEY,Workspaces.ACTIVATION_KEY,'privacy','sync','__updatePreferences'])assert.deepEqual(returned.f.raw[key],initial[key]);
 assert.equal(returned.window.LocalItabContentLifecycle.hasUncommittedWork(),false);returned.button('Cancel').dispatch('click');assert.deepEqual(returned.providers,[]);
});

test('pending customization remains guarded until real settlement, then a workspace switch proceeds without an extra save',async t=>{
 const h=await page(t);await h.open();h.span(IDS[2],'2');const entered=deferred(),release=deferred();
 h.f.hooks.set=async(values,raw)=>{entered.resolve();await release.promise;Object.assign(raw,copy(values));};
 h.button('Save').dispatch('click');await entered.promise;
 try{
  assert.equal(h.window.LocalItabContentLifecycle.pending(),true);let settled=false;
  const waiting=h.window.LocalItabContentLifecycle.waitForPending().then(()=>{settled=true});await settle();assert.equal(settled,false);
  assert.equal(h.window.LocalItabContentLifecycle.reload(),false);assert.deepEqual(h.reloads,[]);assert.equal(h.confirmations.length,0);
  release.resolve();await waiting;await settle();assert.equal(h.window.LocalItabContentLifecycle.pending(),false);
  h.f.hooks.set=null;const writes=h.f.writes.length;await h.picker.requestSwitch('default');assert.deepEqual(h.navigations,['default']);
  assert.equal(h.f.writes.length,writes+1,'only normal workspace-selection registry write, not a second customization save');
  assert.equal(h.f.values('work').appearance.customization.cardSpans[IDS[2]],2);
 }finally{release.resolve();await settle();}
});

test('explicit departure permission and cancellation retain the shared warning contract for a customization draft',async t=>{
 const h=await page(t);await h.open();h.span(IDS[2],'2');const before=copy(h.f.raw),lifecycle=h.window.LocalItabContentLifecycle;
 assert.equal(h.departure().prevented,1);lifecycle.allowDeparture();assert.equal(h.departure().prevented,0);lifecycle.cancelDeparture();assert.equal(h.departure().prevented,1);
 h.button('Cancel').dispatch('click');assert.equal(h.departure().prevented,0);assert.deepEqual(h.f.raw,before);
});

test('a newer workspace selection cannot retarget an already-open customization save or release its draft guard',async t=>{
 const h=await page(t);await h.open();h.span(IDS[2],'2');const other=copy(h.f.values('default'));
 await h.manager.select('default');await settle();assert.equal(h.session.id,'work');
 assert.equal(h.f.raw[Workspaces.REGISTRY_KEY].lastUsedId,'default');assert(h.window.LocalItabContentLifecycle.hasUncommittedWork());assert.equal(h.departure().prevented,1);
 const writes=h.f.writes.length;h.button('Save').dispatch('click');await settle();
 assert.equal(h.f.writes.length,writes+1);assert.equal(h.f.values('work').appearance.customization.cardSpans[IDS[2]],2);assert.deepEqual(h.f.values('default'),other);
 assert.equal(h.f.raw[Workspaces.REGISTRY_KEY].lastUsedId,'default');assert.equal(h.window.LocalItabContentLifecycle.hasUncommittedWork(),false);assert.equal(h.departure().prevented,0);
 assert.deepEqual(h.providers,[]);
});

test('a retired original workspace rejects Save while retaining the preview until explicit Cancel',async t=>{
 const h=await page(t);await h.open();h.span(IDS[2],'2');const other=copy(h.f.values('default'));
 await h.manager.trash('work');await settle();const before=copy(h.f.raw),writes=h.f.writes.length;
 h.button('Save').dispatch('click');await settle();assert.equal(h.document.querySelector(`[data-card-span="${IDS[2]}"]`).value,'2');
 assert(h.window.LocalItabContentLifecycle.hasUncommittedWork());assert.equal(h.window.LocalItabCustomization.pending,false);assert.equal(h.departure().prevented,1);
 assert.deepEqual(h.f.raw,before);assert.equal(h.f.writes.length,writes);assert.deepEqual(h.f.values('default'),other);
 h.button('Cancel').dispatch('click');assert.equal(h.window.LocalItabCustomization.hasUncommittedWork(),false);assert.equal(h.departure().prevented,0);
});

test('failed pending Save releases only pending ownership, not the draft or reload protection',async t=>{
 const h=await page(t);await h.open();h.span(IDS[2],'2');const before=copy(h.f.raw),entered=deferred(),release=deferred();
 h.f.hooks.set=async()=>{entered.resolve();await release.promise;throw Error('Synthetic delayed failure')};
 h.button('Save').dispatch('click');await entered.promise;
 try{
  const lifecycle=h.window.LocalItabContentLifecycle;assert(lifecycle.pending());assert.equal(h.departure().prevented,1);
  let settled=false;const waiting=lifecycle.waitForPending().then(()=>{settled=true});await settle();assert.equal(settled,false);
  release.resolve();await waiting;await settle();assert.equal(lifecycle.pending(),false);assert(lifecycle.hasUncommittedWork());assert.equal(h.departure().prevented,1);
  assert.equal(lifecycle.reload(),false);assert.deepEqual(h.reloads,[]);assert.deepEqual(h.f.raw,before);
  h.button('Cancel').dispatch('click');assert.equal(lifecycle.hasUncommittedWork(),false);assert.equal(h.departure().prevented,0);assert.equal(lifecycle.reload(),true);
 }finally{release.resolve();await settle();}
});
