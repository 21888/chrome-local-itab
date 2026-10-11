const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createDocument,deferred}=require('./helpers/task-dom-model');
const tick=()=>new Promise(setImmediate);
function model() {
    const document=createDocument({blurUnavailableFocus:true}),host=document.createElement('header');document.body.append(host);
    let calls=0,request,write,read,reads=0; const beforeUnload=[];
    const snapshot={links:[{title:'<b>Twin</b>',url:'https://example.com/<literal>',category:'work'},{title:'<b>Twin</b>',url:'https://example.com/<literal>',category:'orphan'}],categories:[{id:'work',name:'Work'},{id:'personal',name:'Personal'}],state:{links:[]}};
    const component={async moveReviewedShortcuts(p){calls++;request=p;if(write)return write.promise;},layoutController:{async flush(){}}};
    const context={document,URL,console,setTimeout,window:null,addEventListener(type,fn){if(type==='beforeunload')beforeUnload.push(fn);},storageManager:{async readShortcutOrganizerSnapshot(){reads++;return read?read.promise:snapshot;}},shortcutsComponentInstance:component};context.window=context;vm.createContext(context);
    for(const file of ['shared/dialog-focus.js','shared/shortcut-organizer.js','shared/shortcut-organizer-view.js','shared/local-content-lifecycle.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
    const view=component.organizerView=context.LocalItabOrganizer.mount(host,component);
    component.hasUncommittedShortcutWork=()=>view.hasUncommittedWork();
    const button=text=>document.querySelectorAll('button').find(b=>b.textContent===text);
    const click=text=>button(text).dispatch('click',{detail:1});
    return {document,host,component,context,view,snapshot,button,click,beforeUnload,get calls(){return calls;},get request(){return request;},get reads(){return reads;},set write(v){write=v;},set read(v){read=v;},
        select(){const select=document.querySelector('select');select.value='personal';select.dispatch('change');const checks=document.querySelectorAll('input');checks[1].checked=true;checks[1].dispatch('change');},
        async review(){await view.open();this.select();click('Review move');}};
}
test('selection and exact escaped review target only chosen identical twin; cancel writes nothing',async()=>{
    const h=model();await h.review();assert.equal(h.calls,0);assert.equal(h.document.querySelectorAll('li').length,1);assert.equal(h.document.querySelector('li').querySelector('strong').textContent,'2. <b>Twin</b>');assert.equal(h.document.querySelectorAll('b').length,0);
    h.click('Back');assert.equal(h.document.querySelectorAll('input')[1].checked,true);h.click('Review move');h.click('Cancel');assert.equal(h.calls,0);assert.equal(h.view.hasUncommittedWork(),false);
});
test('pending guarded submit ignores repeats, prevents cancellation and protects workspace departure',async()=>{
    const h=model(),pending=deferred();h.write=pending;await h.review();h.click('Move reviewed sites');h.click('Move reviewed sites');assert.equal(h.calls,1);assert.equal(h.view.close(),false);assert.equal(h.view.pending,true);assert.equal(h.context.LocalItabContentLifecycle.pending(),true);
    const e={preventDefault(){this.prevented=true;}};h.beforeUnload[0](e);assert.equal(e.prevented,true);assert.deepEqual(Array.from(h.request.indices),[1]);
    pending.resolve();await tick();assert.equal(h.view.pending,false);assert.equal(h.view.hasUncommittedWork(),false);assert.equal(h.context.LocalItabContentLifecycle.hasUncommittedWork(),false);
});
test('uncertain failure keeps exact review identity for safe retry',async()=>{
    const h=model();let fail=true;h.component.moveReviewedShortcuts=async p=>{if(fail){h.component.first=p;const e=new Error();e.code='ORGANIZER_UNVERIFIED';throw e;}assert.equal(p,h.component.first);};await h.review();h.click('Move reviewed sites');await tick();assert.equal(h.button('Back'),undefined);assert.match(h.document.querySelector('[role="status"]').textContent,/Retry checks/);fail=false;h.click('Retry reviewed move');await tick();assert.equal(h.view.hasUncommittedWork(),false);
});
test('stale destination and workspace errors do not offer another mutation',async()=>{
    for(const code of ['ORGANIZER_CONFLICT','WORKSPACE_STALE']) {const h=model();h.component.moveReviewedShortcuts=async()=>{const e=new Error();e.code=code;throw e;};await h.review();h.click('Move reviewed sites');await tick();assert.equal(h.button('Retry reviewed move').disabled,true);h.click('Cancel');assert.equal(h.view.hasUncommittedWork(),false);}
});
test('cancelled delayed read cannot reopen or overwrite newer organizer session',async()=>{
    const h=model(),read=deferred();h.read=read;const first=h.view.open();await tick();h.click('Cancel');assert.equal(h.view.hasUncommittedWork(),false);h.read=null;await h.view.open();h.select();read.resolve({links:[],categories:[],state:{}});await first;assert.equal(h.document.querySelectorAll('input').length,2);assert.equal(h.document.querySelectorAll('input')[1].checked,true);
});
test('read error permits close and subsequent successful open',async()=>{
    const h=model();h.context.storageManager.readShortcutOrganizerSnapshot=async()=>{throw new Error();};await h.view.open();assert.match(h.document.querySelector('[role="status"]').textContent,/Could not read/);h.click('Cancel');assert.equal(h.view.pending,false);
});
test('destination change removes no-op selections and orphan group stays readable',async()=>{
    const h=model();await h.view.open();assert(h.document.querySelectorAll('h3').some(n=>n.textContent.includes('orphan')));const input=h.document.querySelector('input');input.checked=true;input.dispatch('change');let select=h.document.querySelector('select');select.value='work';select.dispatch('change');assert.equal(h.document.querySelector('input').checked,false);assert.equal(h.document.querySelector('input').disabled,true);assert.equal(h.button('Review move').disabled,true);
});
test('open review defers automatic reload and never saves on workspace Save action',async()=>{
    const h=model();await h.review();assert.equal(h.context.LocalItabContentLifecycle.hasUncommittedWork(),true);assert.equal(await h.context.LocalItabContentLifecycle.saveDrafts(),false);assert.equal(h.calls,0);
});
test('failed layout flush blocks review reads and preserves retry intent',async()=>{
    for(const mode of ['existing','new','invalidated']){const h=model(),intent={positions:{a:{x:1,y:2}}};if(mode==='existing')h.component.layoutController.failedChange=intent;if(mode==='invalidated')h.component.layoutController.invalidated=true;if(mode==='new')h.component.layoutController.flush=async()=>{h.component.layoutController.failedChange=intent;return false;};
        await h.view.open();assert.equal(h.reads,0);assert.match(h.document.querySelector('[role="status"]').textContent,/layout change/);if(mode!=='invalidated')assert.equal(h.component.layoutController.failedChange,intent);h.click('Cancel');assert.equal(h.view.hasUncommittedWork(),false);}
});
test('pending write retains focus inside dialog after disabling its controls',async()=>{
    const h=model(),pending=deferred();h.write=pending;await h.review();h.button('Move reviewed sites').focus();h.click('Move reviewed sites');const panel=h.document.querySelector('.organizer-panel');assert.equal(h.document.activeElement,panel);const event=panel.dispatch('keydown',{key:'Tab'});assert.equal(event.prevented,true);pending.resolve();await tick();
});
