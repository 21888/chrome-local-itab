const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const {createDocument,deferred} = require('./helpers/task-dom-model');
const source=fs.readFileSync('shared/workspaces-view.js','utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
const clone=value=>JSON.parse(JSON.stringify(value));
function model() {
    const document=createDocument({blurUnavailableFocus:true}),create=document.createElement;
    document.createElement=tag=>{const el=create(tag);el.removeAttribute=name=>{delete el.attributes[name]};return el;};
    const switcher=document.createElement('section'),managerHost=document.createElement('section');document.body.append(switcher,managerHost);
    let registry={schemaVersion:1,defaultId:'default',lastUsedId:'default',revision:0,workspaces:[{id:'default',name:'Default',order:0,generation:'g0',deletedAt:null},{id:'work',name:'Work',order:1,generation:'g1',deletedAt:null}]};
    const calls=[],listeners=new Set();const record=(method,...args)=>calls.push([method,...args]);
    const manager={list:async()=>clone(registry),subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
        create:async name=>{record('create',name);registry.workspaces.push({id:'new',name,order:2,generation:'newg',deletedAt:null});},
        rename:async(id,name)=>{record('rename',id,name);registry.workspaces.find(w=>w.id===id).name=name;},
        duplicate:async(id,name)=>{record('duplicate',id,name);registry.workspaces.push({id:'copy',name,order:2,generation:'copyg',deletedAt:null});},
        trash:async id=>{record('trash',id);registry.workspaces.find(w=>w.id===id).deletedAt=123;},
        restore:async id=>{record('restore',id);const w=registry.workspaces.find(w=>w.id===id);w.deletedAt=null;w.generation+='restored';},
        select:async id=>{record('select',id);registry.lastUsedId=id;}};
    const session={id:'default',generation:'g0',ready:async()=>({id:'default',generation:'g0'}),flush:async()=>record('flush'),suspendWrites:()=>record('suspend'),resumeWrites:()=>record('resume')};
    let dirty=false;const lifecycle={waitForPending:async()=>record('wait'),hasUncommittedWork:()=>dirty,saveDrafts:async()=>{record('save');dirty=false;return true;},pauseAutosave:()=>record('pause'),resumeAutosave:()=>record('resume-auto'),allowDeparture:()=>record('depart'),cancelDeparture:()=>record('cancel-depart')};
    const window={document,location:{href:'chrome-extension://unit/newtab.html'},chrome:{runtime:{getURL:p=>'chrome-extension://unit/'+p}},i18n:{t:key=>key}};
    vm.runInNewContext(fs.readFileSync('shared/dialog-focus.js','utf8'),{window});
    vm.runInNewContext(source,{window,URL,Blob,setTimeout});
    const view=window.LocalItabWorkspacesView.mount({switcher,managerHost,manager,session,lifecycle,navigate:id=>record('navigate',id),download:async(...args)=>record('download',...args)});
    const find=(text,host=document.body)=>host.querySelectorAll('button').find(b=>b.textContent===text);
    return {document,window,switcher,managerHost,manager,session,lifecycle,view,calls,find,registry,dirty(value=true){dirty=value;},notify(){listeners.forEach(fn=>fn(registry));},dialog:()=>document.querySelector('.spaces-dialog'),input:()=>document.querySelector('.spaces-name-input')};
}
test('initialization is nonmutating; separate Default and Work, current and last-used labels',async()=>{
 const m=model();await m.view.ready;assert.equal(m.calls.length,0);assert.match(m.switcher.querySelector('.spaces-switch').textContent,/Default/);assert.equal(m.managerHost.querySelectorAll('.spaces-row').length,2);const del=m.managerHost.querySelector('[data-workspace-id="default"][data-workspace-action="delete"]');assert(del.disabled);del.dispatch('click');assert(!m.dialog());
});
test('create validates, handles IME and repeated Enter, and never switches implicitly',async()=>{
 const m=model();await m.view.ready;m.find('New workspace').dispatch('click');const input=m.input();input.value=' ';m.find('New workspace',m.dialog()).dispatch('click');assert.equal(m.calls.length,0);assert.equal(input.getAttribute('aria-invalid'),'true');
 input.value='Reading';input.dispatch('keydown',{key:'Enter',isComposing:true});input.dispatch('keydown',{key:'Enter',repeat:true});assert.equal(m.calls.length,0);
 const wait=deferred();m.manager.create=async n=>{m.calls.push(['create',n]);await wait.promise;};input.dispatch('keydown',{key:'Enter'});input.dispatch('keydown',{key:'Enter'});await tick();assert.equal(m.calls.filter(c=>c[0]==='create').length,1);m.dialog().dispatch('keydown',{key:'Escape'});assert(m.dialog());wait.resolve();await tick();assert(!m.dialog());assert(!m.calls.some(c=>c[0]==='select'));
});
test('rename and duplicate invoke precise workspace IDs; duplicate explicitly saved-only',async()=>{
 const m=model();await m.view.ready;m.managerHost.querySelector('[data-workspace-id="work"][data-workspace-action="rename"]').dispatch('click');assert.equal(m.input().value,'Work');m.input().value='Design';m.find('Rename',m.dialog()).dispatch('click');await tick();assert.deepEqual(m.calls[0],['rename','work','Design']);
 m.managerHost.querySelector('[data-workspace-id="work"][data-workspace-action="duplicate"]').dispatch('click');assert(m.dialog().querySelectorAll('p').some(p=>/Unsaved drafts are not copied/.test(p.textContent)));m.input().value='Design 2';m.find('Duplicate',m.dialog()).dispatch('click');await tick();assert(m.calls.some(c=>c[0]==='duplicate'&&c[1]==='work'&&c[2]==='Design 2'));
});
test('delete requires explicit dialog, Cancel preserves; restore retains tombstone identity with fresh generation',async()=>{
 const m=model();await m.view.ready;const open=()=>m.managerHost.querySelector('[data-workspace-id="work"][data-workspace-action="delete"]').dispatch('click');open();assert.equal(m.calls.length,0);m.find('Cancel',m.dialog()).dispatch('click');assert.equal(m.calls.length,0);open();m.find('Move to Trash',m.dialog()).dispatch('click');await tick();assert(m.registry.workspaces[1].deletedAt);m.find('Restore').dispatch('click');m.find('Restore').dispatch('click');await tick();assert.equal(m.calls.filter(c=>c[0]==='restore').length,1);assert.equal(m.registry.workspaces[1].deletedAt,null);assert(!m.calls.some(c=>c[0]==='navigate'));
});
test('clean switch waits, flushes, suspends new writes, selects, then navigates explicitly',async()=>{
 const m=model();await m.view.ready;const wait=deferred();m.lifecycle.waitForPending=()=>{m.calls.push(['wait']);return wait.promise;};const switchPromise=m.view.requestSwitch('work');m.view.requestSwitch('work');await tick();assert.deepEqual(m.calls,[['pause'],['wait']]);wait.resolve();await switchPromise;assert.deepEqual(m.calls.map(c=>c[0]),['pause','wait','flush','pause','suspend','flush','select','depart','navigate']);assert.equal(m.calls.at(-1)[1],'work');
});
test('dirty switch offers explicit Stay, validated Save, or Discard; opening it never saves',async()=>{
 const m=model();await m.view.ready;m.dirty();await m.view.requestSwitch('work');assert(m.dialog());assert.equal(m.document.activeElement,m.find('Stay here',m.dialog()));assert(!m.calls.some(c=>c[0]==='save'||c[0]==='select'));m.find('Stay here').dispatch('click');assert(!m.dialog());assert(!m.calls.some(c=>c[0]==='select'));
 await m.view.requestSwitch('work');m.find('Save and switch').dispatch('click');await tick();assert(m.calls.some(c=>c[0]==='save'));assert(m.calls.some(c=>c[0]==='navigate'));
});
test('incomplete or failed Save retains dialog/drafts and cannot select target',async()=>{
 for(const mode of ['incomplete','throw']){const m=model();await m.view.ready;m.dirty();m.lifecycle.saveDrafts=async()=>{if(mode==='throw')throw Error('write failed');return false;};await m.view.requestSwitch('work');m.find('Save and switch').dispatch('click');await tick();assert(m.dialog());assert(!m.calls.some(c=>c[0]==='select'));assert(!m.find('Stay here').disabled);}
});
test('Discard is explicit and does not call save; cancelled dialog cannot later act',async()=>{
 const m=model();await m.view.ready;m.dirty();await m.view.requestSwitch('work');const stale=m.find('Discard drafts and switch');m.find('Stay here').dispatch('click');stale.dispatch('click');await tick();assert(!m.calls.some(c=>c[0]==='select'));await m.view.requestSwitch('work');m.find('Discard drafts and switch').dispatch('click');await tick();assert(!m.calls.some(c=>c[0]==='save'));assert(m.calls.some(c=>c[0]==='select'));
});
test('select failure resumes writes and autosave, never navigates or clears draft',async()=>{
 const m=model();await m.view.ready;m.manager.select=async()=>{throw Error('blocked')};await m.view.requestSwitch('work');assert(m.calls.some(c=>c[0]==='resume'));assert(m.calls.some(c=>c[0]==='resume-auto'));assert(!m.calls.some(c=>c[0]==='navigate'));assert.match(m.managerHost.querySelector('.spaces-status').textContent,/Could not confirm/);
});
test('other-tab deletion and restoration preserve page fields, block Save choice, allow private text export',async()=>{
 const m=model();await m.view.ready;const draft=m.document.createElement('textarea');draft.value='UNSAVED PRIVATE DRAFT';draft.setAttribute('aria-label','Scratchpad');m.document.body.append(draft);m.session.invalidated=true;m.registry.workspaces[0].deletedAt=999;m.notify();await tick();assert.equal(draft.value,'UNSAVED PRIVATE DRAFT');assert(!m.switcher.querySelector('.spaces-invalid').hidden);m.find('Export page text').dispatch('click');await tick();assert(m.calls.some(c=>c[0]==='download'&&c[1].includes('UNSAVED PRIVATE DRAFT')));
 m.registry.workspaces[0].deletedAt=null;m.registry.workspaces[0].generation='restored';m.notify();await tick();assert(!m.switcher.querySelector('.spaces-invalid').hidden);m.dirty();await m.view.requestSwitch('default');assert(m.find('Save and switch').disabled);assert(!m.find('Discard drafts and switch').disabled);
});
test('dialog Escape restores keyboard origin and same-name IDs stay independent',async()=>{
 const m=model();m.registry.workspaces[1].name='Default';await m.view.ready;const trigger=m.find('New workspace');trigger.focus();trigger.dispatch('click');m.dialog().dispatch('keydown',{key:'Escape'});assert(!m.dialog());assert.equal(m.document.activeElement,trigger);assert.equal(m.managerHost.querySelectorAll('[data-workspace-action="rename"]').length,2);
});
test('English and Chinese catalogs cover every public workspace UI label',()=>{
 const window={};vm.runInNewContext(source,{window});for(const locale of ['en','zh_CN']){const catalog=JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));for(const key of Object.keys(window.LocalItabWorkspacesView.copy))assert(catalog['spaces'+key]?.message,locale+':'+key);}
});
test('a draft entered while selection is pending prevents navigation and requests a new decision',async()=>{
 const m=model();await m.view.ready;const wait=deferred();m.manager.select=async()=>{m.calls.push(['select']);await wait.promise;};const switching=m.view.requestSwitch('work');await tick();m.dirty();wait.resolve();await switching;assert(!m.calls.some(c=>c[0]==='navigate'||c[0]==='depart'));assert(m.dialog());assert(m.calls.some(c=>c[0]==='resume'));assert(m.find('Stay here'));
});
test('completed create/rename returns usable focus after disabled-origin blur and row replacement',async()=>{
 const m=model();await m.view.ready;const create=m.find('New workspace');create.focus();create.dispatch('click');m.input().value='Notes';m.find('New workspace',m.dialog()).focus();m.find('New workspace',m.dialog()).dispatch('click');await tick();assert.equal(m.document.activeElement,create);
 const rename=m.managerHost.querySelector('[data-workspace-id="work"][data-workspace-action="rename"]');rename.focus();rename.dispatch('click');m.input().value='Planning';m.find('Rename',m.dialog()).focus();m.find('Rename',m.dialog()).dispatch('click');await tick();assert.equal(m.document.activeElement.dataset.workspaceId,'work');assert.equal(m.document.activeElement.dataset.workspaceAction,'rename');
});
test('legacy-write conflict blocks workspace actions and exports both saved copies without clearing the block',async()=>{
 const m=model();await m.view.ready;m.session.invalidated=true;m.manager.list=async()=>{throw {code:'WORKSPACE_LEGACY_CONFLICT'}};m.manager.exportLegacyConflictRecovery=async()=>({format:'local-itab-workspace-conflict-recovery',legacy:{links:['old']},workspaces:{bundles:['current']}});m.notify();await tick();assert(!m.switcher.querySelector('.spaces-legacy').hidden);assert(m.switcher.querySelector('.spaces-switch').disabled);assert(m.find('New workspace').disabled);
 m.find('Download both saved copies').dispatch('click');await tick();const file=m.calls.find(c=>c[0]==='download');assert(file[1].includes('current')&&file[1].includes('old'));assert(!m.calls.some(c=>c[0]==='select'||c[0]==='navigate'));assert(!m.switcher.querySelector('.spaces-legacy').hidden);
});
test('legacy recovery requires counted review and explicit keep; success never reloads old drafts',async()=>{
 const m=model();await m.view.ready;const normalList=m.manager.list;let conflict=true;m.session.invalidated=true;m.manager.list=async()=>{if(conflict)throw {code:'WORKSPACE_LEGACY_CONFLICT'};return normalList();};m.manager.reviewLegacyConflict=async()=>({id:'review',detectedAt:'2026-10-10T19:00:00Z',legacy:{sites:2,tasks:1,scratchpadCharacters:5},workspaces:{count:2,trash:1,sites:3,tasks:4,scratchpadCharacters:6}});m.manager.resolveLegacyConflict=async(review,options)=>{m.calls.push(['resolve',review.id,options.confirmed]);conflict=false;return{resolved:true,reloadRequired:true};};m.notify();await tick();m.find('Review recovery choice').dispatch('click');await tick();assert(m.dialog().querySelectorAll('li').some(n=>n.textContent==='Sites: 2'));assert(!m.calls.some(c=>c[0]==='resolve'));m.find('Keep current workspaces and retain older-tab copy').dispatch('click');m.find('Keep current workspaces and retain older-tab copy')?.dispatch('click');await tick();assert.equal(m.calls.filter(c=>c[0]==='resolve').length,1);assert(!m.calls.some(c=>c[0]==='navigate'));assert(!m.dialog());assert(!m.switcher.querySelector('.spaces-invalid').hidden);
});
test('stale legacy review refuses reuse; cancel while reading cannot reopen or resolve',async()=>{
 const m=model();await m.view.ready;m.manager.list=async()=>{throw {code:'WORKSPACE_LEGACY_CONFLICT'}};const wait=deferred();m.manager.reviewLegacyConflict=()=>wait.promise;m.notify();await tick();m.find('Review recovery choice').dispatch('click');m.find('Cancel',m.dialog()).dispatch('click');wait.resolve({id:'old',legacy:{},workspaces:{}});await tick();assert(!m.dialog());
 m.manager.reviewLegacyConflict=async()=>({id:'new',detectedAt:1,legacy:{},workspaces:{}});m.manager.resolveLegacyConflict=async()=>{throw {code:'WORKSPACE_CONFLICT'}};m.find('Review recovery choice').dispatch('click');await tick();m.find('Keep current workspaces and retain older-tab copy').dispatch('click');await tick();assert(m.find('Keep current workspaces and retain older-tab copy').disabled);assert(!m.find('Review again').disabled);assert(m.dialog().querySelectorAll('p').some(p=>p.textContent.includes('Saved copies changed')));
});
