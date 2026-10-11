const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const source = fs.readFileSync('shared/complete-backup-view.js', 'utf8');
const flush = async () => { await new Promise(resolve => setTimeout(resolve, 10)); };
const modules = ['config','tasks','scratchpad','countdown','focus'];
function model() {
    const document = createDocument({blurUnavailableFocus:true}); const host = document.createElement('div'); document.body.append(host);
    const calls = {reviews:[],restores:[],exports:[],downloads:[]};
    const store = {
        async review(text, selected = modules) { calls.reviews.push([text, selected]); return {modules,selected,incoming:{config:{shortcuts:5,categories:2,dataUrlIcons:1},tasks:{active:2,done:3,removed:1,recovery:4},scratchpad:{characters:15},focus:{enabled:true,durations:{focus:25,break:5}}},current:{}}; },
        async restore(preview) { calls.restores.push(preview); },
        async export(selected) { calls.exports.push(selected); return 'JSON'; }, async recovery() { return 'RECOVERY'; }
    };
    const window = {LocalItabCompleteBackup:{LIMITS:{bytes:32*1024*1024}}};
    vm.runInNewContext(source,{window,setTimeout,URL,Blob});
    const view = window.LocalItabCompleteBackupView.mount(host,{store,restore:p=>store.restore(p),download:async (...args)=>calls.downloads.push(args),reload:()=>{calls.reloads=(calls.reloads||0)+1;}});
    const get = cls => host.querySelector('.complete-backup-'+cls);
    const file=get('file'); file.click=()=>{};
    const select = (text='saved', options={}) => { get('choose').focus(); file.files=[{size:text.length,text:async()=>text,...options}]; file.dispatch('change'); };
    return {document,host,store,view,calls,get,file,select};
}
test('saved module export requests download without asserting completion; no automatic restore or reload',async()=>{
    const m=model();m.get('export').dispatch('click');await flush();assert.equal(m.calls.exports.length,1);assert.equal(m.calls.downloads.length,1);assert.match(m.get('status').textContent,/Download requested.*completion cannot be verified/);assert.equal(m.calls.restores.length,0);assert(!m.calls.reloads);
});
test('preview shows selected module counts and destructive Focus consequence before one explicit apply',async()=>{
    const m=model();m.select();await flush();assert.equal(m.calls.restores.length,0);assert.equal(m.get('preview').hidden,false);assert.match(m.get('warning').textContent,/blocked while an affected workspace has a running, paused or interrupted/);assert(m.host.querySelectorAll('li').some(li=>li.children.some(n=>n.textContent?.includes('Saved history copies: 4'))));
    m.get('apply').dispatch('click');m.get('apply').dispatch('click');await flush();assert.equal(m.calls.restores.length,1);assert.match(m.get('status').textContent,/restored and verified/);assert(!m.calls.reloads);m.get('reload').dispatch('click');assert.equal(m.calls.reloads,1);
});
test('module changes invalidate prior preview and remove Focus warning when deselected',async()=>{
    const m=model();m.select();await flush();const focus=m.host.querySelector('[data-module="focus"]');focus.checked=false;focus.dispatch('change');assert(m.get('apply').disabled);await flush();assert.equal(m.calls.reviews.length,2);assert(!m.calls.reviews[1][1].includes('focus'));assert(m.get('warning').hidden);
});
test('Cancel during delayed read makes no preview, save or focus theft; a newer file owns its source',async()=>{
    const m=model(),wait=deferred();m.select('old',{text:()=>wait.promise});m.get('cancel').dispatch('click');assert.equal(m.document.activeElement,m.get('choose'));m.select('new');await flush();wait.resolve('old');await flush();assert.equal(m.calls.reviews.length,1);assert.equal(m.calls.reviews[0][0],'new');assert.equal(m.calls.restores.length,0);
});
test('oversize/read rejection are nonmutating; uncertain apply never claims unchanged data',async()=>{
    const m=model();let read=0;m.select('x',{size:32*1024*1024+1,text:()=>{read++;}});await flush();assert.equal(read,0);assert.match(m.get('status').textContent,/size limit/);m.select('x',{text:async()=>{throw Error('secret path');}});await flush();assert.match(m.get('status').textContent,/Could not read the local file/);assert(!m.get('status').textContent.includes('secret'));
    m.select();await flush();m.store.restore=async()=>{throw {code:'UNCONFIRMED',mayHaveCommitted:true};};m.get('apply').dispatch('click');await flush();assert.match(m.get('status').textContent,/Some data may have changed/);assert(m.get('reload').hidden);assert(!m.calls.reloads);
});
test('delayed preview cannot overwrite a newer selection; detached view never applies',async()=>{
    const m=model(),wait=deferred(),real=m.store.review;m.store.review=()=>wait.promise;m.select('old');await flush();m.get('cancel').dispatch('click');m.store.review=real;m.select('new');await flush();wait.resolve({modules,selected:modules,incoming:{},current:{}});await flush();assert.equal(m.calls.reviews[0][0],'new');const apply=m.get('apply');m.view.destroy();apply.dispatch('click');assert.equal(m.calls.restores.length,0);
});
test('CN and EN catalogs cover every fallback key, public search indexes labels only',()=>{
    const keys=[...source.matchAll(/^    "(\w+)":/gm)].map(m=>'completeBackup'+m[1]);assert(keys.length>40);for(const locale of ['en','zh_CN']){const catalog=JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));for(const key of keys)assert(catalog[key]?.message,key);}
    const search=fs.readFileSync('shared/settings-search.js','utf8');assert(search.includes('"completeBackupTitle"'));assert(!search.includes('completeBackupView'));
});
test('empty selection makes no invalid core call and permits selection again',async()=>{
    const m=model();m.select();await flush();for(const input of m.host.querySelectorAll('[data-module]'))input.checked=false;m.host.querySelector('[data-module="config"]').dispatch('change');await flush();assert.equal(m.calls.reviews.length,1);assert(m.get('apply').disabled);assert.match(m.get('status').textContent,/Select at least one/);const input=m.host.querySelector('[data-module="tasks"]');input.checked=true;input.dispatch('change');await flush();assert.equal(m.calls.reviews.length,2);assert.deepEqual(Array.from(m.calls.reviews[1][1]),['tasks']);
});
test('unfinished destination Focus session prevents confirmation and can be deselected',async()=>{
    const m=model(),real=m.store.review;m.store.review=async(...args)=>{const p=await real(...args);p.current.focus={activeSession:true,enabled:true,durations:{focus:25,break:5}};return p;};m.select();await flush();assert(m.get('apply').disabled);assert.match(m.get('status').textContent,/interrupted Focus session/);const input=m.host.querySelector('[data-module="focus"]');input.checked=false;input.dispatch('change');await flush();assert(!m.get('apply').disabled);
});
test('Cancel alone and user focus movement survive delayed async results',async()=>{
    const m=model(),wait=deferred();m.select('old',{text:()=>wait.promise});m.get('cancel').dispatch('click');wait.resolve('old');await flush();assert.equal(m.document.activeElement,m.get('choose'));assert(m.get('preview').hidden);
    const next=deferred();m.select('next',{text:()=>next.promise});const outside=m.document.createElement('input');m.document.body.append(outside);outside.focus();next.resolve('next');await flush();assert.equal(m.document.activeElement,outside);
});
test('late restore result does not steal focus from unrelated new edits',async()=>{
    const m=model(),wait=deferred();m.select();await flush();m.store.restore=()=>wait.promise;m.get('apply').dispatch('click');const outside=m.document.createElement('input');m.document.body.append(outside);outside.focus();wait.resolve({applied:true});await flush();assert.equal(m.document.activeElement,outside);assert(!m.calls.reloads);
});
test('files above 10 MiB require explicit permission before reading; cancel is nonmutating',async()=>{
    const m=model();let reads=0;m.select('large',{size:11*1024*1024,text:async()=>{reads++;return 'large';}});await flush();assert.equal(reads,0);assert(!m.get('large').hidden);assert(m.get('apply').disabled);assert.match(m.get('status').textContent,/larger than 10 MiB/);m.get('cancel').dispatch('click');m.get('large').dispatch('click');await flush();assert.equal(reads,0);
    m.select('large',{size:11*1024*1024,text:async()=>{reads++;return 'large';}});m.get('large').dispatch('click');m.get('large').dispatch('click');await flush();assert.equal(reads,1);assert.equal(m.calls.reviews.length,1);assert.equal(m.calls.restores.length,0);
});
test('Escape cancels the large-file prompt before read',async()=>{
    const m=model();let reads=0;m.select('x',{size:11*1024*1024,text:async()=>{reads++;return 'x';}});m.get('large').dispatch('keydown',{key:'Escape'});m.get('large').dispatch('click');await flush();assert.equal(reads,0);assert(m.get('preview').hidden);assert.equal(m.document.activeElement,m.get('choose'));
});
test('recovery download retains an existing review and reports unavailable recovery honestly',async()=>{
    const m=model();m.select();await flush();m.get('recovery').dispatch('click');await flush();assert(!m.get('preview').hidden);assert(!m.get('apply').disabled);assert.equal(m.calls.downloads[0][0],'RECOVERY');m.store.recovery=async()=>{throw {code:'INVALID'};};m.get('recovery').dispatch('click');await flush();assert.match(m.get('status').textContent,/No valid pre-restore recovery copy/);assert(!m.get('preview').hidden);
});

test('older single-workspace files require a deliberate destination selection before apply',async()=>{
    const m=model();m.store.review=async(text,selected=modules,options={})=>{m.calls.reviews.push([text,selected,options]);return {schemaVersion:1,modules,selected,incoming:{},current:{},requiresTarget:!options.targetWorkspaceId,destinations:[{id:'default',name:'Default'},{id:'work',name:'Work'}],targetWorkspace:options.targetWorkspaceId?{id:options.targetWorkspaceId,name:'Work'}:null};};
    m.select('legacy');await flush();assert(!m.get('destination').hidden);assert.equal(m.get('target').value,'');assert(m.get('apply').disabled);assert.match(m.get('status').textContent,/Choose the workspace/);assert.equal(m.calls.restores.length,0);
    m.get('target').value='work';m.get('target').dispatch('change');assert(m.get('apply').disabled);await flush();assert.equal(m.calls.reviews[1][2].targetWorkspaceId,'work');assert(!m.get('apply').disabled);assert.match(m.get('preview').children.find(el=>el.tagName==='P').textContent,/Work/);m.get('apply').dispatch('click');await flush();assert.equal(m.calls.restores.length,1);assert.equal(m.calls.restores[0].targetWorkspace.id,'work');
});
test('changing a legacy destination invalidates the previous ticket and cancel forgets destination',async()=>{
    const m=model();m.store.review=async(text,selected=modules,options={})=>{m.calls.reviews.push([text,selected,options]);return {schemaVersion:1,modules,selected,incoming:{},current:{},requiresTarget:!options.targetWorkspaceId,destinations:[{id:'default',name:'Default'},{id:'work',name:'Work'}],targetWorkspace:options.targetWorkspaceId?{id:options.targetWorkspaceId,name:options.targetWorkspaceId}:null};};
    m.select('legacy');await flush();m.get('target').value='work';m.get('target').dispatch('change');await flush();m.get('target').value='default';m.get('target').dispatch('change');assert(m.get('apply').disabled);await flush();assert.equal(m.calls.reviews.at(-1)[2].targetWorkspaceId,'default');m.get('cancel').dispatch('click');m.select('next');await flush();assert.equal(m.get('target').value,'');assert(m.get('apply').disabled);assert.equal(m.calls.reviews.at(-1)[2].targetWorkspaceId,undefined);
});
test('v2 full registry scope explicitly lists live names, Trash counts and destructive replacement',async()=>{
    const m=model(),real=m.store.review;m.store.review=async(...args)=>({...await real(...args),schemaVersion:2,workspaces:{incoming:[{id:'default',name:'Default'},{id:'work',name:'Work'}],current:[{id:'default',name:'Default'}],incomingTrashCount:3,currentTrashCount:1,scope:'all'}});
    m.select('v2');await flush();assert(m.get('destination').hidden);assert(!m.get('workspaces').hidden);assert.match(m.get('workspaces').textContent,/Default, Work/);assert.match(m.get('workspaces').textContent,/Trash: 3/);assert.match(m.get('preview').children.find(el=>el.tagName==='P').textContent,/replaces the live workspace list and Trash/);
});
test('partial topology mismatch explains how to obtain a compatible full archive without enabling apply',async()=>{
    const m=model();m.store.review=async()=>{throw {code:'TOPOLOGY'};};m.select('partial');await flush();assert(m.get('apply').disabled);assert.match(m.get('status').textContent,/Export all modules/);assert.equal(m.calls.restores.length,0);
});
