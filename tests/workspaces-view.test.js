const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const {createDocument,deferred} = require('./helpers/task-dom-model');
const source=fs.readFileSync('shared/workspaces-view.js','utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
const clone=value=>JSON.parse(JSON.stringify(value));
function model(options = {}) {
    const document=createDocument({blurUnavailableFocus:true}),create=document.createElement;
    document.createElement=tag=>{const el=create(tag);el.removeAttribute=name=>{delete el.attributes[name]};return el;};
    const switcher=document.createElement('section'),managerHost=document.createElement('section');document.body.append(switcher,managerHost);
    let registry={schemaVersion:1,defaultId:'default',lastUsedId:'default',revision:0,workspaces:[{id:'default',name:'Default',order:0,generation:'g0',deletedAt:null},{id:'work',name:'Work',order:1,generation:'g1',deletedAt:null}]};
    const calls=[],listeners=new Set();const record=(method,...args)=>calls.push([method,...args]);
    const manager={list:async()=>{if(options.listError)throw options.listError;return clone(registry)},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
        create:async name=>{record('create',name);registry.workspaces.push({id:'new',name,order:2,generation:'newg',deletedAt:null});},
        rename:async(id,name)=>{record('rename',id,name);registry.workspaces.find(w=>w.id===id).name=name;},
        duplicate:async(id,name)=>{record('duplicate',id,name);registry.workspaces.push({id:'copy',name,order:2,generation:'copyg',deletedAt:null});},
        trash:async id=>{record('trash',id);registry.workspaces.find(w=>w.id===id).deletedAt=123;},
        restore:async id=>{record('restore',id);const w=registry.workspaces.find(w=>w.id===id);w.deletedAt=null;w.generation+='restored';},
        select:async id=>{record('select',id);registry.lastUsedId=id;}};
    const session={requestedId:options.requestedId,id:options.readyError?null:'default',generation:options.readyError?null:'g0',ready:async()=>{if(options.readyGate)await options.readyGate;if(options.readyError)throw options.readyError;return{id:'default',generation:'g0'}},flush:async()=>record('flush'),suspendWrites:()=>record('suspend'),resumeWrites:()=>record('resume')};
    let dirty=false;const lifecycle={waitForPending:async()=>record('wait'),hasUncommittedWork:()=>dirty,saveDrafts:async()=>{record('save');dirty=false;return true;},pauseAutosave:()=>record('pause'),resumeAutosave:()=>record('resume-auto'),allowDeparture:()=>record('depart'),cancelDeparture:()=>record('cancel-depart')};
    const window={document,location:{href:'chrome-extension://unit/newtab.html'},chrome:{runtime:{getURL:p=>'chrome-extension://unit/'+p}},i18n:{t:key=>options.locale?JSON.parse(fs.readFileSync(`_locales/${options.locale}/messages.json`))[key]?.message||key:key}};
    vm.runInNewContext(fs.readFileSync('shared/dialog-focus.js','utf8'),{window});
    vm.runInNewContext(source,{window,URL,Blob,setTimeout});
    const view=window.LocalItabWorkspacesView.mount({switcher,managerHost,manager,session,lifecycle,navigate:id=>record('navigate',id),download:async(...args)=>record('download',...args)});
    const find=(text,host=document.body)=>host.querySelectorAll('button').find(b=>b.textContent===text);
    return {document,window,switcher,managerHost,manager,session,lifecycle,view,calls,find,registry,dirty(value=true){dirty=value;},notify(event=registry){listeners.forEach(fn=>fn(event));},dialog:()=>document.querySelector('.spaces-dialog'),input:()=>document.querySelector('.spaces-name-input')};
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
 const m=model();await m.view.ready;const normalList=m.manager.list;let conflict=true;m.session.invalidated=true;m.manager.list=async()=>{if(conflict)throw {code:'WORKSPACE_LEGACY_CONFLICT'};return normalList();};m.manager.reviewLegacyConflict=async()=>({id:'review',detectedAt:'2026-10-10T19:00:00Z',legacy:{sites:2,tasks:1,scratchpadCharacters:5},workspaces:{count:2,trash:1,sites:3,tasks:4,scratchpadCharacters:6}});m.manager.resolveLegacyConflict=async(review,options)=>{m.calls.push(['resolve',review.id,options.confirmed]);conflict=false;return{resolved:true,reloadRequired:true};};m.notify();await tick();m.find('Review recovery choice').dispatch('click');await tick();assert(m.dialog().querySelectorAll('li').some(n=>n.textContent==='Sites: 2'));assert(!m.calls.some(c=>c[0]==='resolve'));m.find('Keep current workspaces and retain older-tab copy').dispatch('click');m.find('Keep current workspaces and retain older-tab copy')?.dispatch('click');await tick();assert.equal(m.calls.filter(c=>c[0]==='resolve').length,1);assert(!m.calls.some(c=>c[0]==='navigate'));assert(!m.dialog());assert(m.switcher.querySelector('.spaces-invalid').hidden);assert(!m.switcher.querySelector('.spaces-load-error').hidden);assert.match(m.managerHost.querySelector('.spaces-status').textContent,/Current workspaces are kept.*old page still cannot save/);
});
test('stale legacy review refuses reuse; cancel while reading cannot reopen or resolve',async()=>{
 const m=model();await m.view.ready;m.manager.list=async()=>{throw {code:'WORKSPACE_LEGACY_CONFLICT'}};const wait=deferred();m.manager.reviewLegacyConflict=()=>wait.promise;m.notify();await tick();m.find('Review recovery choice').dispatch('click');m.find('Cancel',m.dialog()).dispatch('click');wait.resolve({id:'old',legacy:{},workspaces:{}});await tick();assert(!m.dialog());
 m.manager.reviewLegacyConflict=async()=>({id:'new',detectedAt:1,legacy:{},workspaces:{}});m.manager.resolveLegacyConflict=async()=>{throw {code:'WORKSPACE_CONFLICT'}};m.find('Review recovery choice').dispatch('click');await tick();m.find('Keep current workspaces and retain older-tab copy').dispatch('click');await tick();assert(m.find('Keep current workspaces and retain older-tab copy').disabled);assert(!m.find('Review again').disabled);assert(m.dialog().querySelectorAll('p').some(p=>p.textContent.includes('Saved copies changed')));
});

for (const code of ['WORKSPACE_READ', 'WORKSPACE_WRITE', 'WORKSPACE_CORRUPT', 'WORKSPACE_UNAVAILABLE', 'WORKSPACE_MIGRATION_INCOMPLETE']) test(`startup ${code} is not evidence that a workspace was deleted`, async () => {
 const error=Object.assign(new Error('Sensitive synthetic details must not be displayed'),{code});
 const m=model({readyError:error,listError:error});await m.view.ready;
 assert(m.switcher.querySelector('.spaces-invalid').hidden);
 const banner=m.switcher.querySelector('.spaces-load-error');assert(!banner.hidden);
 assert(banner.querySelectorAll('p').some(p=>p.textContent.endsWith(code)));
 assert(!banner.querySelectorAll('p').some(p=>p.textContent.includes('Sensitive synthetic')));
 assert.equal(m.switcher.querySelector('.spaces-switch').textContent,'Workspace unavailable');
 assert(m.switcher.querySelector('.spaces-switch').disabled);assert(m.find('New workspace').disabled);
 assert(!m.calls.some(c=>['create','select','navigate','save'].includes(c[0])));
});
test('a list recovered after uncaptured startup does not pretend Default was loaded or deleted',async()=>{
 const m=model({readyError:{code:'WORKSPACE_READ'}});await m.view.ready;
 assert.equal(m.session.id,null);assert(m.switcher.querySelector('.spaces-invalid').hidden);
 assert(!m.switcher.querySelector('.spaces-load-error').hidden);
 assert.equal(m.switcher.querySelector('.spaces-switch').textContent,'Workspace unavailable');
 assert(m.switcher.querySelector('.spaces-switch').disabled);
});
test('startup failure preserves page drafts and exports text only after the user requests it',async()=>{
 const error={code:'WORKSPACE_CORRUPT'},m=model({readyError:error,listError:error});
 const draft=m.document.createElement('textarea');draft.value='Synthetic saved-on-page draft';m.document.body.append(draft);
 await m.view.ready;assert.equal(draft.value,'Synthetic saved-on-page draft');assert(!m.calls.some(c=>c[0]==='download'));
 m.find('Export page text',m.switcher.querySelector('.spaces-load-error')).dispatch('click');await tick();
 assert(m.calls.some(c=>c[0]==='download'&&c[1].includes(draft.value)));assert.equal(draft.value,'Synthetic saved-on-page draft');
});
test('unknown startup exceptions expose only a fixed diagnostic code and no exception contents',async()=>{
 const error={code:'PRIVATE_SYNTHETIC_DETAILS',message:'PRIVATE_SYNTHETIC_MESSAGE'},m=model({readyError:error,listError:error});await m.view.ready;
 const paragraphs=m.switcher.querySelector('.spaces-load-error').querySelectorAll('p').map(p=>p.textContent).join(' ');
 assert(paragraphs.includes('WORKSPACE_STARTUP'));assert(!paragraphs.includes('PRIVATE_SYNTHETIC'));
});
test('later transient list failure is generic and a successful explicit refresh clears it',async()=>{
 const m=model();await m.view.ready;const original=m.manager.list;m.manager.list=async()=>{throw{code:'WORKSPACE_READ'}};
 await m.view.refresh();assert(m.switcher.querySelector('.spaces-invalid').hidden);assert(!m.switcher.querySelector('.spaces-load-error').hidden);
 m.manager.list=original;await m.view.refresh();assert(m.switcher.querySelector('.spaces-load-error').hidden);
 assert(!m.switcher.querySelector('.spaces-switch').disabled);assert.equal(m.managerHost.querySelector('.spaces-status').textContent,'');
});
test('session invalidation without deletion evidence is reported generically and remains unable to save drafts',async()=>{
 const m=model();await m.view.ready;m.session.invalidated=true;m.notify();await tick();
 assert(m.switcher.querySelector('.spaces-invalid').hidden);assert(!m.switcher.querySelector('.spaces-load-error').hidden);
 m.dirty();await m.view.requestSwitch('work');assert(m.find('Save and switch').disabled);
});
test('dashboard static localization precedes the first fallible workspace initialization',()=>{
 const dashboard=fs.readFileSync('newtab.js','utf8');const start=dashboard.indexOf("document.addEventListener('DOMContentLoaded', async function");
 assert(dashboard.indexOf('window.i18n?.localizeDocument(document)',start)<dashboard.indexOf('await window.LocalItabWorkspacesView?.mountPage()',start));
});

test('an explicitly requested workspace confirmed deleted at startup retains the real deletion warning',async()=>{
 const m=model({readyError:{code:'WORKSPACE_DELETED'},requestedId:'work'});m.registry.workspaces[1].deletedAt=123;
 await m.view.ready;assert.equal(m.session.id,null);assert(!m.switcher.querySelector('.spaces-invalid').hidden);
 assert(m.switcher.querySelector('.spaces-load-error').hidden);assert(m.switcher.querySelector('.spaces-switch').disabled);
});

for (const locale of ['en','zh_CN']) test(`first-open legacy conflict ends Loading in visible and accessible labels (${locale})`, async () => {
 const error={code:'WORKSPACE_LEGACY_CONFLICT'},m=model({readyError:error,listError:error,locale});await m.view.ready;
 const catalog=JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`)),button=m.switcher.querySelector('.spaces-switch');
 assert.equal(button.textContent,catalog.spacesUnavailable.message);assert.equal(button.getAttribute('aria-label'),catalog.spacesUnavailable.message);assert(button.disabled);
 assert.equal(m.managerHost.querySelector('.spaces-status').textContent,catalog.spacesLegacyPaused.message);
 assert(!m.switcher.querySelector('.spaces-legacy').hidden);assert(m.switcher.querySelector('.spaces-invalid').hidden);assert(m.switcher.querySelector('.spaces-load-error').hidden);
 assert(!m.calls.some(c=>['create','select','navigate','save','resume-auto'].includes(c[0])));
});

test('a successful list cannot invent an identity after first-open legacy conflict or leave Loading behind', async()=>{
 const m=model({readyError:{code:'WORKSPACE_LEGACY_CONFLICT'}});await m.view.ready;
 assert.equal(m.session.id,null);assert.equal(m.switcher.querySelector('.spaces-switch').textContent,'Workspace unavailable');assert(m.switcher.querySelector('.spaces-switch').disabled);
 assert(m.switcher.querySelector('.spaces-invalid').hidden);assert(!m.switcher.querySelector('.spaces-load-error').hidden);
 assert.equal(m.managerHost.querySelector('.spaces-status').textContent,'Could not load workspaces. Your current page is unchanged.');
 assert(!m.calls.some(c=>['create','select','navigate','save','resume-auto'].includes(c[0])));
});

test('late older list results cannot replace a newer conflict status or enable actions', async()=>{
 const m=model();await m.view.ready;const late=deferred();m.manager.list=()=>late.promise;const older=m.view.refresh();
 m.manager.list=async()=>{throw {code:'WORKSPACE_LEGACY_CONFLICT'}};m.notify({error:{code:'WORKSPACE_LEGACY_CONFLICT'}});await tick();
 const status=m.managerHost.querySelector('.spaces-status');assert.match(status.textContent,/Saving is paused/);
 late.resolve(clone(m.registry));await older;assert.match(status.textContent,/Saving is paused/);assert(!m.switcher.querySelector('.spaces-legacy').hidden);assert(m.switcher.querySelector('.spaces-switch').disabled);
 assert(!m.calls.some(c=>['select','navigate','save','resume-auto'].includes(c[0])));
});

test('terminal conflict status takes disabled-control focus but never steals a draft caret', async()=>{
 for(const draftFocused of [false,true]){const m=model();await m.view.ready;const draft=m.document.createElement('textarea');draft.value='UNSAVED';m.document.body.append(draft);
 const switchButton=m.switcher.querySelector('.spaces-switch');(draftFocused?draft:switchButton).focus();m.manager.list=async()=>{throw {code:'WORKSPACE_LEGACY_CONFLICT'}};m.notify({error:{code:'WORKSPACE_LEGACY_CONFLICT'}});await tick();
 assert.equal(m.document.activeElement===(draftFocused?draft:m.managerHost.querySelector('.spaces-status')),true);assert.equal(draft.value,'UNSAVED');}
});

test('destroyed view ignores a late conflict error without changing its status or focus', async()=>{
 const m=model();await m.view.ready;const late=deferred();m.manager.list=async()=>{await late.promise;throw {code:'WORKSPACE_LEGACY_CONFLICT'};};const pending=m.view.refresh();
 const status=m.managerHost.querySelector('.spaces-status'),before=status.textContent;const draft=m.document.createElement('textarea');m.document.body.append(draft);draft.focus();m.view.destroy();
 late.resolve();await pending;assert.equal(status.textContent,before);assert.equal(m.document.activeElement===draft,true);
});

test('startup completion cannot erase a conflict reported after an earlier list succeeded', async()=>{
 const gate=deferred(),m=model({readyGate:gate.promise});m.notify();await tick();
 assert.equal(m.managerHost.querySelectorAll('.spaces-row').length,2);
 m.manager.list=async()=>{throw {code:'WORKSPACE_LEGACY_CONFLICT'}};gate.resolve();await m.view.ready;
 assert.match(m.managerHost.querySelector('.spaces-status').textContent,/Saving is paused/);
 assert(!m.switcher.querySelector('.spaces-legacy').hidden);assert(m.switcher.querySelector('.spaces-switch').disabled);
});

test('external conflict resolution leaves an invalidated captured tab unavailable without claiming review is still pending', async()=>{
 const m=model();await m.view.ready;const original=m.manager.list;m.session.invalidated=true;
 m.manager.list=async()=>{throw {code:'WORKSPACE_LEGACY_CONFLICT'}};m.notify({error:{code:'WORKSPACE_LEGACY_CONFLICT'}});await tick();
 assert.match(m.managerHost.querySelector('.spaces-status').textContent,/Saving is paused/);
 const draft=m.document.createElement('textarea');draft.value='NEWER UNSAVED DRAFT';m.document.body.append(draft);draft.focus();
 m.manager.list=original;await m.view.refresh();
 assert(m.switcher.querySelector('.spaces-legacy').hidden);assert(m.switcher.querySelector('.spaces-invalid').hidden);
 const banner=m.switcher.querySelector('.spaces-load-error');assert(!banner.hidden);assert(banner.querySelectorAll('p').some(p=>p.textContent.endsWith('WORKSPACE_INVALIDATED')));
 assert.equal(m.managerHost.querySelector('.spaces-status').textContent,'Could not load workspaces. Your current page is unchanged.');
 assert(m.switcher.querySelector('.spaces-switch').disabled);assert(m.find('New workspace').disabled);assert.equal(m.document.activeElement===draft,true);assert.equal(draft.value,'NEWER UNSAVED DRAFT');
 assert(!m.calls.some(c=>['select','navigate','save','resume-auto','resume'].includes(c[0])));
});

for (const locale of ['en', 'zh_CN']) for (const code of ['WORKSPACE_IMPORT_PENDING', 'WORKSPACE_IMPORT_RECEIPT_INVALID']) test(`duplicate import guard keeps name draft and offers scoped inspection (${locale}/${code})`, async () => {
 const m=model({locale});await m.view.ready;
 m.manager.duplicate=async()=>{throw Object.assign(Error('private internal details'),{code});};
 m.managerHost.querySelector('[data-workspace-id="work"][data-workspace-action="duplicate"]').dispatch('click');m.input().value='Keep this name';
 const submit=m.dialog().querySelectorAll('button').find(button=>button.textContent=== (locale==='en'?'Duplicate':'复制'));
 assert(submit);submit.dispatch('click');await tick();
 assert(m.dialog());assert.equal(m.input().value,'Keep this name');assert(!m.input().disabled);
 const notice=m.dialog().querySelector('.spaces-status').textContent;
 assert(!notice.includes('private internal details'));
 assert(notice.includes(locale==='en'?(code==='WORKSPACE_IMPORT_PENDING'?'unverified configuration import':'unsupported or invalid import record'):(code==='WORKSPACE_IMPORT_PENDING'?'配置导入尚未核验':'导入记录不受支持或无效')));
 const link=m.dialog().querySelector('a');assert(!link.hidden);assert.equal(link.href,'chrome-extension://unit/recovery.html?workspace=work');assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener');
 const cancel=m.dialog().querySelectorAll('button').find(button=>button.textContent===(locale==='en'?'Cancel':'取消'));cancel.dispatch('click');assert(!m.dialog());assert(!m.calls.some(call=>call[0]==='navigate'));
});

for (const kind of ['create', 'rename', 'duplicate']) for (const dismiss of ['Cancel', 'Escape']) test(`${kind} name draft survives list refresh and ${dismiss} returns to the current opener`, async () => {
 const m=model();await m.view.ready;
 const opener=()=>kind==='create'?m.find('New workspace'):m.managerHost.querySelector(`[data-workspace-id="work"][data-workspace-action="${kind}"]`);
 const original=opener();original.focus();original.dispatch('click');
 const input=m.input(),staleSubmit=m.find({create:'New workspace',rename:'Rename',duplicate:'Duplicate'}[kind],m.dialog());
 input.value='Synthetic unsaved name';input.focus();
 m.registry.workspaces[1].name='Updated elsewhere';m.registry.workspaces[1].order=-1;await m.view.refresh();
 assert.equal(m.input(),input);assert.equal(input.value,'Synthetic unsaved name');assert.equal(m.document.activeElement,input);
 const current=opener();if(kind!=='create')assert.notEqual(current,original);
 if(dismiss==='Cancel')m.find('Cancel',m.dialog()).dispatch('click');else input.dispatch('keydown',{key:'Escape'});
 assert(!m.dialog());assert.equal(m.document.activeElement===current,true,'dismissal must return focus to the same action in the refreshed list');
 staleSubmit.dispatch('click');input.dispatch('keydown',{key:'Enter'});await tick();
 assert.equal(m.calls.length,0,'dismissed controls cannot submit the old draft');
 current.dispatch('click');assert.equal(m.input().value,kind==='rename'?'Updated elsewhere':'');
});

for (const kind of ['rename', 'duplicate']) test(`${kind} cancellation falls back safely when its current row action is gone`, async () => {
 const m=model();await m.view.ready;
 const origin=m.managerHost.querySelector(`[data-workspace-id="work"][data-workspace-action="${kind}"]`);
 origin.focus();origin.dispatch('click');m.input().value='Synthetic draft';
 m.registry.workspaces[1].deletedAt=123;await m.view.refresh();
 m.find('Cancel',m.dialog()).dispatch('click');
 assert(!m.dialog());assert.equal(m.document.activeElement,m.find('New workspace'));assert.equal(m.calls.length,0);
});

for (const kind of ['rename', 'duplicate']) for (const mode of ['hidden', 'destroyed', 'newer focus']) test(`${kind} dismissal after list refresh respects ${mode}`, async () => {
 const m=model();await m.view.ready;
 const origin=m.managerHost.querySelector(`[data-workspace-id="work"][data-workspace-action="${kind}"]`);
 origin.focus();origin.dispatch('click');const cancel=m.find('Cancel',m.dialog());
 await m.view.refresh();
 const newer=m.document.createElement('textarea');newer.value='Synthetic newer draft';m.document.body.append(newer);
 if(mode==='hidden')m.document.hidden=true;
 else if(mode==='newer focus')newer.focus();
 if(mode==='destroyed')m.view.destroy();else cancel.dispatch('click');
 assert(!m.dialog());assert.equal(m.document.activeElement,mode==='newer focus'?newer:m.document.body);
 newer.focus();cancel.dispatch('click');assert.equal(m.document.activeElement,newer,'a second close cannot reclaim focus');
 assert.equal(newer.value,'Synthetic newer draft');assert.equal(m.calls.length,0);
});

for (const kind of ['create', 'rename', 'duplicate']) test(`${kind} pending name write handles IME and double activation, then preserves a failed draft for retry`, async () => {
 const m=model();await m.view.ready;
 const origin=kind==='create'?m.find('New workspace'):m.managerHost.querySelector(`[data-workspace-id="work"][data-workspace-action="${kind}"]`);
 origin.focus();origin.dispatch('click');const input=m.input(),dialog=m.dialog(),submit=m.find({create:'New workspace',rename:'Rename',duplicate:'Duplicate'}[kind],dialog);
 input.value='Synthetic attempted name';input.dispatch('compositionstart');
 input.dispatch('keydown',{key:'Enter',isComposing:true});input.dispatch('keydown',{key:'Enter',keyCode:229});input.dispatch('keydown',{key:'Enter',repeat:true});input.dispatch('keydown',{key:'Escape'});
 assert.equal(m.dialog(),dialog);assert.equal(m.calls.length,0);input.dispatch('compositionend');
 const wait=deferred(),original=m.manager[kind],attempts=[];
 m.manager[kind]=async(...args)=>{attempts.push(args);if(attempts.length===1){await wait.promise;throw Error('Private synthetic failure');}return original(...args);};
 input.dispatch('keydown',{key:'Enter'});submit.dispatch('click');submit.dispatch('click');dialog.dispatch('keydown',{key:'Escape'});
 assert.equal(attempts.length,1);assert.equal(m.dialog(),dialog);assert(input.disabled);assert(submit.disabled);
 await m.view.refresh();assert.equal(input.value,'Synthetic attempted name');
 wait.resolve();await tick();
 assert.equal(m.dialog(),dialog);assert.equal(input.value,'Synthetic attempted name');assert(!input.disabled);assert(!submit.disabled);assert.equal(m.document.activeElement,input);
 assert.match(dialog.querySelector('.spaces-status').textContent,/Your draft is still here/);assert(!dialog.querySelector('.spaces-status').textContent.includes('Private synthetic failure'));
 input.value='Synthetic corrected name';input.dispatch('keydown',{key:'Enter'});await tick();
 assert(!m.dialog());assert.deepEqual(attempts,[kind==='create'?['Synthetic attempted name']:['work','Synthetic attempted name'],kind==='create'?['Synthetic corrected name']:['work','Synthetic corrected name']]);
 assert.equal(m.document.activeElement,kind==='create'?origin:m.managerHost.querySelector(`[data-workspace-id="work"][data-workspace-action="${kind}"]`));
 assert(!m.calls.some(call=>['select','navigate'].includes(call[0])));
});

for (const kind of ['create', 'rename', 'duplicate']) test(`${kind} late list read after cancellation preserves the next name draft and focus`, async () => {
 const m=model();await m.view.ready;
 const opener=()=>kind==='create'?m.find('New workspace'):m.managerHost.querySelector(`[data-workspace-id="work"][data-workspace-action="${kind}"]`);
 opener().focus();opener().dispatch('click');m.input().value='Synthetic cancelled draft';
 const late=deferred();m.manager.list=()=>late.promise;const reading=m.view.refresh();
 m.find('Cancel',m.dialog()).dispatch('click');opener().dispatch('click');const newer=m.input();newer.value='Synthetic current draft';newer.focus();
 late.resolve(clone(m.registry));await reading;
 assert.equal(m.input(),newer);assert.equal(newer.value,'Synthetic current draft');assert.equal(m.document.activeElement,newer);assert.equal(m.calls.length,0);
});

for (const kind of ['create', 'rename', 'duplicate']) for (const outcome of ['success', 'failure']) test(`${kind} late ${outcome} write completion after destruction leaves newer focus alone`, async () => {
 const m=model();await m.view.ready;
 const origin=kind==='create'?m.find('New workspace'):m.managerHost.querySelector(`[data-workspace-id="work"][data-workspace-action="${kind}"]`);
 origin.focus();origin.dispatch('click');m.input().value='Synthetic submitted name';
 const wait=deferred();let attempts=0;m.manager[kind]=async()=>{attempts++;await wait.promise;if(outcome==='failure')throw Error('Synthetic write failure');};
 m.input().dispatch('keydown',{key:'Enter'});m.view.destroy();
 const newer=m.document.createElement('textarea');newer.value='Synthetic unrelated draft';m.document.body.append(newer);newer.focus();
 const status=m.managerHost.querySelector('.spaces-status'),before=status.textContent;
 wait.resolve();await tick();
 assert.equal(attempts,1);assert(!m.dialog());assert.equal(status.textContent,before);assert.equal(m.document.activeElement,newer);assert.equal(newer.value,'Synthetic unrelated draft');assert(!m.view.pending);
});
