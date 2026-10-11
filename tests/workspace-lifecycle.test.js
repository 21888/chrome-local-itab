const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createDocument,deferred}=require('./helpers/task-dom-model');
const source=fs.readFileSync('shared/local-content-lifecycle.js','utf8');
function model(){const document=createDocument(),events={};document.body.prepend=(...nodes)=>document.body.append(...nodes);const calls=[];const window={document,addEventListener(type,fn){events[type]=fn;},location:{reload(){calls.push('reload')}},confirm(){calls.push('confirm');return false;}};vm.runInNewContext(source,{window,document,setTimeout});return{window,document,events,calls,api:window.LocalItabContentLifecycle};}
test('pending settings, appearance and layout queues finish before switch lifecycle resolves',async()=>{
 const m=model(),wait=deferred();let pending=true;m.window.settingsFormView={flush:()=>wait.promise,get pending(){return pending}};let settled=false;const task=m.api.waitForPending().then(()=>{settled=true});await new Promise(r=>setTimeout(r,5));assert(!settled);pending=false;wait.resolve();await task;assert(settled);
});
test('save uses ordinary draft APIs and refuses open import reviews or unresolved conflicts',async()=>{
 const m=model();let dirty=true,imports=0,saves=0;m.window.localScratchpadView={controller:{hasUncommittedWork:()=>dirty,save:async()=>{saves++;dirty=false}},hasUncommittedWork:()=>dirty};m.window.bookmarkImportView={hasUncommittedWork:()=>true,apply(){imports++}};assert.equal(await m.api.saveDrafts(),false);assert.equal(saves,1);assert.equal(imports,0);m.window.bookmarkImportView=null;assert.equal(await m.api.saveDrafts(),true);
});
test('paused autosave cancels scheduled Scratchpad and category writes; Stay resumes scheduling',()=>{
 const m=model(),calls=[];m.window.localScratchpadView={controller:{cancelTimer(){calls.push('cancel')},schedule(){calls.push('schedule')}}};m.window.settingsFormView={pauseAutosave(){calls.push('categories')}};m.api.pauseAutosave();assert(m.api.autosavePaused);assert.deepEqual(calls,['cancel','categories']);m.api.resumeAutosave();assert(!m.api.autosavePaused);assert.deepEqual(calls,['cancel','categories','schedule']);
});
test('workspace management drafts defer automatic reload and pending management cannot be discarded',()=>{
 const m=model();m.window.workspacesView={pending:true,hasUncommittedWork:()=>true};assert.equal(m.api.reload(),false);assert(!m.calls.includes('reload'));m.document.querySelector('button').dispatch('click');assert(!m.calls.includes('confirm'));m.window.workspacesView.pending=false;m.document.querySelector('button').dispatch('click');assert(m.calls.includes('confirm'));assert(!m.calls.includes('reload'));
});
test('only explicit departure suppresses native warning; failed navigation can restore protection',()=>{
 const m=model();m.window.settingsFormView={hasUncommittedWork:()=>true};let prevented=0;const event={preventDefault(){prevented++}};m.events.beforeunload(event);assert.equal(prevented,1);m.api.allowDeparture();m.events.beforeunload(event);assert.equal(prevented,1);m.api.cancelDeparture();m.events.beforeunload(event);assert.equal(prevented,2);
});
test('workspace script boot order defines all migration validators before first storage read',()=>{
 for(const filename of ['newtab.html','options.html']){const html=fs.readFileSync(filename,'utf8');for(const name of ['tasks','focus','scratchpad','countdown'])assert(html.indexOf(`shared/local-${name}-store.js`)<html.indexOf('shared/workspaces.js'));assert(html.indexOf('shared/workspaces.js')<html.indexOf('src="storage.js"'));assert(html.indexOf('shared/workspaces-view.js')<html.indexOf(`src="${filename.replace('.html','.js')}"`));}
});
test('destructive enabled, hovered and disabled light/dark actions exceed text contrast 4.5:1',()=>{
 const lum=hex=>{const rgb=hex.match(/[a-f\d]{2}/gi).map(c=>parseInt(c,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};
 const pairs=[['ffffff','a52823'],['ffffff','871f1b'],['4b5563','e5e7eb'],['ffd8d2','67231d'],['ffd8d2','823129'],['cbd5e1','374151']];for(const [fg,bg]of pairs){const a=lum(fg),b=lum(bg);assert((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,fg+'/'+bg);}
 const css=fs.readFileSync('workspaces.css','utf8');assert(css.includes(':focus-visible'));assert(css.includes('prefers-reduced-motion'));assert(css.includes('grid-template-columns: minmax(0, 1fr)'));
});
