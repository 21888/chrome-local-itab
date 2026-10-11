const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createDocument,deferred}=require('./helpers/task-dom-model');
const templates=require('../shared/dashboard-template-registry');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function model() {
 const document=createDocument(),events=new Set();const appearance=document.createElement('div');appearance.id='options-appearance';document.body.append(appearance);
 const host=document.createElement('section');document.body.append(host);
 const fake={calls:0,writes:0,async prepare(template){this.calls++;return {template,before:{tasks:{enabled:false},focus:{enabled:false}}};},async apply(preview,isCurrent){if(!isCurrent())throw Object.assign(Error(),{code:'CANCELLED'});this.writes++;}};
 const window={storageManager:{onLocalChanged(fn){events.add(fn);return()=>events.delete(fn);}},LocalItabTemplates:templates,LocalItabWorkspace:{},appearanceController:{confirmed:{template:'studio'},pending:0},chrome:{storage:{onChanged:{addListener:fn=>events.add(fn),removeListener:fn=>events.delete(fn)}}},location:{reload(){window.reloads=(window.reloads||0)+1;}}};
 vm.runInNewContext(fs.readFileSync('shared/workspace-presets-view.js','utf8'),{window});
 const view=window.LocalItabWorkspace.mount(host,{store:fake});window.workspacePresetsView=view;
 const [review,apply,cancel]=host.querySelectorAll('button');
 for(const button of [review,apply,cancel]){const dispatch=button.dispatch.bind(button);button.dispatch=(type,fields)=>{if(type==='click'&&!button.disabled)button.focus();return dispatch(type,fields);};}
 const panel=host.querySelector('div'),status=host.querySelector('[role="status"]');
 return {document,window,host,appearance,view,fake,review,apply,cancel,panel,status,events};
}
test('DOM model: preview only, distinct apply, unchanged rows visible, Escape/Cancel, and repeat suppression',async()=>{
 const m=model();assert.equal(m.fake.calls,0);assert(m.panel.hidden);
 m.review.dispatch('click');m.review.dispatch('click');await flush();assert.equal(m.fake.calls,1);assert.equal(m.fake.writes,0);assert(!m.panel.hidden);
 assert.deepEqual(m.host.querySelectorAll('li').map(x=>x.textContent),['Tasks: Hidden → Shown','Focus timer: Hidden → Shown']);
 assert(m.view.hasUncommittedWork());assert.equal(m.document.activeElement,m.panel.querySelector('p'));
 assert(m.apply.dispatch('keydown',{key:'Enter',repeat:true}).prevented);
 m.cancel.dispatch('click');assert(m.panel.hidden);assert.equal(m.document.activeElement,m.review);assert(!m.view.hasUncommittedWork());
 m.review.dispatch('click');await flush();m.host.dispatch('keydown',{key:'Escape'});assert(m.panel.hidden);assert.equal(m.fake.writes,0);
 m.review.dispatch('click');await flush();m.apply.dispatch('click');m.apply.dispatch('click');await flush();assert.equal(m.fake.writes,1);assert(m.panel.hidden);assert.match(m.status.textContent,/saved/);
});
test('DOM model: cancel delayed preview never reopens; changing templates invalidates stale preview',async()=>{
 const m=model(),wait=deferred();m.fake.prepare=async template=>{await wait.promise;return {template,before:{tasks:{enabled:false},focus:{enabled:false}}};};
 m.review.dispatch('click');await flush();assert(!m.panel.hidden);assert(!m.cancel.disabled);m.cancel.dispatch('click');wait.resolve();await flush();assert(m.panel.hidden);assert.equal(m.fake.writes,0);
 m.review.dispatch('click');await flush();m.appearance.dispatch('change');assert(m.panel.hidden);m.apply.dispatch('click');await flush();assert.equal(m.fake.writes,0);
 m.review.dispatch('click');await flush();for(const fn of m.events)fn({appearance:{newValue:{template:'quiet'}}},'local');assert(m.panel.hidden);assert.match(m.status.textContent,/cancelled/);
});
test('DOM model: applying disables cancel, surfaces conflicts/uncertain outcomes without retry, restores usable focus',async()=>{
 const m=model();m.review.dispatch('click');await flush();const wait=deferred();m.fake.apply=async()=>{m.fake.writes++;await wait.promise;throw Object.assign(Error(),{code:'CONFLICT'});};
 m.apply.dispatch('click');await flush();assert(m.cancel.disabled);m.cancel.dispatch('click');assert(!m.panel.hidden);wait.resolve();await flush();assert(m.panel.hidden);assert.match(m.status.textContent,/changed/);assert.equal(m.document.activeElement,m.status);assert(!m.review.disabled);
 m.fake.apply=async()=>{m.fake.writes++;throw Object.assign(Error(),{code:'UNCONFIRMED'});};m.review.dispatch('click');await flush();m.apply.dispatch('click');await flush();assert.match(m.status.textContent,/may have saved/);assert.equal(m.fake.writes,2);assert(m.panel.hidden);
});
test('DOM model: save-in-progress, disposal and deferred settings reload respect lifecycle',async()=>{
 const m=model();m.window.appearanceController.pending=1;m.review.dispatch('click');await flush();assert.equal(m.fake.calls,0);assert.match(m.status.textContent,/finish saving/);
 m.window.appearanceController.pending=0;m.review.dispatch('click');await flush();
 m.document.body.prepend=(...nodes)=>m.document.body.append(...nodes);
 vm.runInNewContext(fs.readFileSync('shared/local-content-lifecycle.js','utf8'),{window:m.window,document:m.document});
 assert.equal(m.window.LocalItabContentLifecycle.reload(),false);assert(!m.window.reloads);
 m.cancel.dispatch('click');assert.equal(m.window.LocalItabContentLifecycle.reload(),true);assert.equal(m.window.reloads,1);
 const wait=deferred();m.fake.prepare=async()=>{await wait.promise;return {template:'studio',before:{tasks:{enabled:false},focus:{enabled:false}}};};
 m.review.dispatch('click');await flush();m.view.destroy();wait.resolve();await flush();assert(m.panel.hidden);assert.equal(m.events.size,0);assert.equal(m.fake.writes,0);
});
test('wiring and localized UI coverage keep visual selection separate',()=>{
 const html=fs.readFileSync('options.html','utf8');for(const name of ['workspace-presets.js','workspace-presets-view.js'])assert(html.includes(`shared/${name}`));
 const appearance=fs.readFileSync('shared/appearance.js','utf8');assert(!appearance.includes('recommendedWorkspace'));assert(!appearance.includes('LocalItabWorkspace'));
 const source=fs.readFileSync('shared/workspace-presets-view.js','utf8');const keys=[...source.matchAll(/t\('(workspacePreset\w+)'/g)].map(x=>x[1]);
 for(const locale of ['en','zh_CN']){const messages=JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));for(const key of keys)assert(messages[key]?.message,key);}
});
test('actual appearance Controller: unresolved external refresh blocks review; later template changes reject apply',async()=>{
 const m=model(),wait=deferred();m.window.document=m.document;
 vm.runInNewContext(fs.readFileSync('shared/appearance.js','utf8'),{window:m.window});
 m.window.appearanceController=new m.window.LocalItabAppearance.Controller({initial:{template:'studio',colorMode:'light'},storage:{validateAppearanceConfig:x=>x,getAppearanceForUpdate:()=>wait.promise}});
 const refreshing=m.window.appearanceController.refresh();assert.equal(m.window.appearanceController.refreshing,1);
 for(const fn of m.events)fn({appearance:{newValue:{template:'quiet',colorMode:'light'}}},'local');
 m.review.dispatch('click');await flush();assert.equal(m.fake.calls,0);assert(m.panel.hidden);m.apply.dispatch('click');await flush();assert.equal(m.fake.writes,0);
 wait.resolve({template:'quiet',colorMode:'light'});await refreshing;assert.equal(m.window.appearanceController.refreshing,0);
 m.review.dispatch('click');await flush();assert.match(m.panel.querySelector('p').textContent,/Quiet/);
 m.window.appearanceController.confirmed={template:'studio',colorMode:'light'};m.apply.dispatch('click');await flush();assert.equal(m.fake.writes,0);assert.match(m.status.textContent,/cancelled/);
});
test('appearance acceptance during delayed prepare or lock-waiting apply invalidates recommendation',async()=>{
 const m=model(),wait=deferred();m.fake.prepare=async template=>{await wait.promise;return {template,before:{tasks:{enabled:false},focus:{enabled:false}}};};
 m.review.dispatch('click');await flush();m.window.appearanceController.confirmed.template='quiet';wait.resolve();await flush();assert(m.panel.hidden);assert.match(m.status.textContent,/cancelled/);
 m.review.dispatch('click');await flush();const locked=deferred();m.fake.apply=async(p,isCurrent)=>{await locked.promise;if(!isCurrent())throw Object.assign(Error(),{code:'CANCELLED'});m.fake.writes++;};
 m.apply.dispatch('click');await flush();m.window.appearanceController.refreshing=1;locked.resolve();await flush();assert.equal(m.fake.writes,0);assert.match(m.status.textContent,/cancelled/);
});
for(const phase of ['preview','apply','error'])test(`delayed ${phase} preserves newer focus, hidden-page intent and pointer cancellation`,async()=>{
 const m=model(),wait=deferred(),other=m.document.createElement('input');m.document.body.append(other);
 if(phase==='preview')m.fake.prepare=async template=>{await wait.promise;return {template,before:{tasks:{enabled:false},focus:{enabled:false}}};};
 else {m.review.dispatch('click');await flush();m.fake.apply=async()=>{await wait.promise;if(phase==='error')throw Error('failure');};}
 (phase==='preview'?m.review:m.apply).dispatch('click');await flush();other.focus();wait.resolve();await flush();assert.equal(m.document.activeElement,other);
 // Keyboard/pointer/visibility intent must invalidate ownership even when disabled controls leave body focused.
 const next=deferred();m.fake.prepare=async template=>{await next.promise;return {template,before:{tasks:{enabled:false},focus:{enabled:false}}};};
 m.review.dispatch('click');await flush();m.document.listeners.get('pointerdown')({target:m.document.body});m.document.activeElement=m.document.body;next.resolve();await flush();assert.equal(m.document.activeElement,m.document.body);
 const hidden=deferred();m.fake.prepare=async template=>{await hidden.promise;return {template,before:{tasks:{enabled:false},focus:{enabled:false}}};};
 m.review.dispatch('click');await flush();m.document.hidden=true;hidden.resolve();await flush();assert.notEqual(m.document.activeElement,m.panel.querySelector('p'));
});
