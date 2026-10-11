const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const source = fs.readFileSync('shared/complete-backup-view.js', 'utf8');
const flush = async () => { await new Promise(resolve => setTimeout(resolve, 10)); };
const modules = ['config','tasks','scratchpad','countdown','focus','prompts'];
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

test('prompt target is deliberately selected and counts/conflicts shown before restore',async()=>{
    const m=model();m.store.review=async(text,selected=modules,options={})=>{m.calls.reviews.push([text,selected,options]);return {schemaVersion:3,modules,selected,incoming:{prompts:{active:4,removed:2,versions:9,recovery:1}},current:{prompts:{active:1,removed:0,versions:2,recovery:0}},requiresPromptTarget:!options.promptTarget,prompts:{target:'global-library',conflicts:[{changed:true}]},workspaces:{scope:'global-only',incoming:[],current:[],incomingTrashCount:0,currentTrashCount:0}};};
    m.select();await flush();assert(!m.get('prompt-destination').hidden);assert.equal(m.get('prompt-target').value,'');assert(m.get('apply').disabled);assert.match(m.get('status').textContent,/Choose the global prompt/);
    assert.match(m.get('prompt-summary').textContent,/including archived prompts/);assert.match(m.get('prompt-summary').textContent,/differs: 1/);
    assert(m.host.querySelectorAll('li').some(li=>li.children.some(item=>item.textContent?.includes('Saved body versions: 9'))));
    m.get('prompt-target').value='global-library';m.get('prompt-target').dispatch('change');assert(m.get('apply').disabled);await flush();assert.equal(m.calls.reviews.at(-1)[2].promptTarget,'global-library');assert(!m.get('apply').disabled);
    m.get('apply').dispatch('click');await flush();assert.equal(m.calls.restores.length,1);
});
test('Cancel and new files forget global prompt target',async()=>{
    const m=model();m.store.review=async(text,selected=modules,options={})=>{m.calls.reviews.push([text,selected,options]);return {schemaVersion:3,modules,selected,incoming:{},current:{},requiresPromptTarget:!options.promptTarget,prompts:{conflicts:[]}};};
    m.select();await flush();m.get('prompt-target').value='global-library';m.get('prompt-target').dispatch('change');await flush();m.get('cancel').dispatch('click');m.select('new');await flush();assert(m.get('apply').disabled);assert.equal(m.get('prompt-target').value,'');
});
test('interrupted recovery requires a read-only inspection and separate confirmation',async()=>{
    const m=model();let inspected=0,repaired=0;m.store.inspectInterruptedRestore=async()=>{inspected++;return {pending:true,id:'transaction',target:'previous-complete-state'};};m.store.recoverInterruptedRestore=async()=>{repaired++;};
    m.get('inspect-interrupted').dispatch('click');await flush();assert.equal(inspected,1);assert.equal(repaired,0);assert(!m.get('recover-interrupted').hidden);assert.match(m.get('interrupted-summary').textContent,/all workspaces, Trash and the prompt library/);
    m.get('recover-interrupted').dispatch('click');m.get('recover-interrupted').dispatch('click');await flush();assert.equal(repaired,1);assert.match(m.get('status').textContent,/restored and verified/);assert(!m.get('reload').hidden);
});
test('uncertain recovery never repeats or declares success; Cancel abandons recovery review',async()=>{
    const m=model();let repaired=0;m.store.inspectInterruptedRestore=async()=>({pending:true,id:'transaction'});m.store.recoverInterruptedRestore=async()=>{repaired++;throw {code:'UNCONFIRMED',mayHaveCommitted:true};};
    m.get('inspect-interrupted').dispatch('click');await flush();m.get('recover-interrupted').dispatch('click');await flush();assert.equal(repaired,1);assert.match(m.get('status').textContent,/Some data may have changed/);assert(m.get('recover-interrupted').hidden);
    m.get('inspect-interrupted').dispatch('click');await flush();m.view.cancel();m.get('recover-interrupted').dispatch('click');await flush();assert.equal(repaired,1);
});
test('changed retained state has download guidance without an enabled rollback action',async()=>{
    const m=model();m.store.inspectInterruptedRestore=async()=>({pending:true,canRecover:false,priorIntact:false});m.get('inspect-interrupted').dispatch('click');await flush();assert(m.get('recover-interrupted').hidden);assert.match(m.get('interrupted-summary').textContent,/changed.*Download both/);
});
