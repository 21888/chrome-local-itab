const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const source = fs.readFileSync('shared/complete-backup-view.js', 'utf8');
const flush = async () => { await new Promise(resolve => setTimeout(resolve, 10)); };
const modules = ['config','tasks','scratchpad','countdown','focus','prompts'];
function model(extra = {}) {
    const document = createDocument({blurUnavailableFocus:true}); const host = document.createElement('div'); document.body.append(host);
    const calls = {reviews:[],restores:[],exports:[],downloads:[]};
    const store = {
        async review(text, selected = modules) { calls.reviews.push([text, selected]); return {modules,selected,incoming:{config:{shortcuts:5,categories:2,dataUrlIcons:1},tasks:{active:2,done:3,removed:1,recovery:4},scratchpad:{characters:15},focus:{enabled:true,durations:{focus:25,break:5}}},current:{}}; },
        async restore(preview) { calls.restores.push(preview); },
        async export(selected) { calls.exports.push(selected); return 'JSON'; }, async recovery() { return 'RECOVERY'; }
    };
    Object.assign(store, extra);
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
    m.get('inspect-interrupted').dispatch('click');await flush();assert.equal(inspected,1);assert.equal(repaired,0);assert(!m.get('recover-interrupted').hidden);assert.match(m.get('interrupted-summary').textContent,/all affected workspaces, Trash and selected global libraries/);
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

for(const action of ['button','Escape'])for(const canRecover of [true,false])test(`interrupted inspection can be dismissed through ${action} (recoverable=${canRecover})`,async()=>{
    let repaired=0;
    const m=model({inspectInterruptedRestore:async()=>({pending:true,canRecover,id:'transaction'}),recoverInterruptedRestore:async()=>{repaired++;}});
    m.get('inspect-interrupted').focus();m.get('inspect-interrupted').dispatch('click');await flush();
    assert(m.get('preview').hidden,'ordinary import panel is not the recovery cancel surface');
    const cancel=m.get('cancel-interrupted');assert(cancel&&!cancel.hidden&&!cancel.disabled&&cancel.getClientRects().length,'visible recovery Cancel');
    assert(m.view.hasUncommittedWork());
    if(action==='button'){cancel.focus();cancel.dispatch('click');}else m.get('inspect-interrupted').dispatch('keydown',{key:'Escape'});
    assert(m.get('interrupted-summary').hidden);assert(m.get('recover-interrupted').hidden);assert(cancel.hidden);
    assert.equal(m.document.activeElement,m.get('inspect-interrupted'));assert(!m.view.hasUncommittedWork());
    m.get('recover-interrupted').dispatch('click');await flush();assert.equal(repaired,0);assert.equal(m.calls.restores.length,0);assert.equal(m.calls.downloads.length,0);
});

for(const action of ['button','Escape'])test(`cancel pending interruption inspection through ${action} ignores late result`,async()=>{
    const wait=deferred();let repaired=0;
    const m=model({inspectInterruptedRestore:()=>wait.promise,recoverInterruptedRestore:async()=>{repaired++;}});
    m.get('inspect-interrupted').focus();m.get('inspect-interrupted').dispatch('click');
    const cancel=m.get('cancel-interrupted');assert(!cancel.hidden&&!cancel.disabled);assert(m.view.hasUncommittedWork());
    if(action==='button')cancel.dispatch('click');else m.get('inspect-interrupted').dispatch('keydown',{key:'Escape'});
    const outside=m.document.createElement('textarea');m.document.body.append(outside);outside.focus();
    wait.resolve({pending:true,canRecover:true,id:'late'});await flush();
    assert(m.get('interrupted-summary').hidden);assert(m.get('recover-interrupted').hidden);assert(cancel.hidden);assert(!m.view.hasUncommittedWork());
    assert.equal(m.document.activeElement,outside);m.get('recover-interrupted').dispatch('click');await flush();assert.equal(repaired,0);
});

test('reinspection retires old explanation and action even if the new read fails',async()=>{
    const m=model({inspectInterruptedRestore:async()=>({pending:true,canRecover:true,id:'old'})});
    m.get('inspect-interrupted').dispatch('click');await flush();assert(!m.get('interrupted-summary').hidden);
    const wait=deferred();m.store.inspectInterruptedRestore=async()=>{await wait.promise;throw {code:'READ'};};m.get('inspect-interrupted').dispatch('click');
    assert(m.get('interrupted-summary').hidden);assert(m.get('recover-interrupted').hidden);assert(!m.get('cancel-interrupted').hidden);
    wait.resolve();await flush();assert(m.get('interrupted-summary').hidden);assert(m.get('recover-interrupted').hidden);assert(m.get('cancel-interrupted').hidden);assert(!m.view.hasUncommittedWork());
    assert.match(m.get('status').textContent,/could not be read safely/);
});

for(const failure of [false,true])test(`submitted interrupted repair cannot be canceled (${failure?'uncertain':'success'})`,async()=>{
    const wait=deferred();let calls=0;
    const m=model({inspectInterruptedRestore:async()=>({pending:true,canRecover:true,id:'old'}),recoverInterruptedRestore:async()=>{calls++;await wait.promise;if(failure)throw {code:'UNCONFIRMED',mayHaveCommitted:true};}});
    m.get('inspect-interrupted').dispatch('click');await flush();m.get('recover-interrupted').dispatch('click');
    assert(m.get('cancel-interrupted').disabled);m.get('cancel-interrupted').dispatch('click');m.get('recover-interrupted').dispatch('keydown',{key:'Escape'});m.view.cancel();
    assert(m.view.pending);assert.equal(calls,1);assert.equal(m.view.destroy(),false);
    wait.resolve();await flush();assert(!m.view.pending);assert.equal(calls,1);
    assert(m.get('cancel-interrupted').hidden);assert(!m.view.hasUncommittedWork());
    if(failure){assert.match(m.get('status').textContent,/Some data may have changed/);assert(m.get('interrupted-summary').hidden);assert(!/Saved data and drafts were not changed/.test(m.get('status').textContent));}
});

test('repeat and composition Escape leave interruption review visible; no pending report leaves no dismiss action',async()=>{
    const m=model({inspectInterruptedRestore:async()=>({pending:true,canRecover:false})});m.get('inspect-interrupted').dispatch('click');await flush();
    for(const flags of [{repeat:true},{isComposing:true},{keyCode:229}]){m.get('inspect-interrupted').dispatch('keydown',{key:'Escape',...flags});assert(!m.get('interrupted-summary').hidden);}
    m.store.inspectInterruptedRestore=async()=>({pending:false});m.get('inspect-interrupted').dispatch('click');await flush();
    assert(m.get('cancel-interrupted').hidden);assert(m.get('interrupted-summary').hidden);assert(!m.view.hasUncommittedWork());
});

for(const kind of ['valid','oversize','read failure','large confirmation'])test(`new ${kind} file retires the prior interruption review`,async()=>{
    let repaired=0;const m=model({inspectInterruptedRestore:async()=>({pending:true,canRecover:true,id:'old'}),recoverInterruptedRestore:async()=>{repaired++;}});
    m.get('inspect-interrupted').dispatch('click');await flush();assert(!m.get('recover-interrupted').hidden);
    const options=kind==='oversize'?{size:33*1024*1024}:kind==='large confirmation'?{size:11*1024*1024}:kind==='read failure'?{text:async()=>{throw Error('synthetic');}}:{};
    m.select('new',options);assert(m.get('interrupted-summary').hidden);assert(m.get('recover-interrupted').hidden);assert(m.get('cancel-interrupted').hidden);
    await flush();m.get('recover-interrupted').dispatch('click');await flush();assert.equal(repaired,0);
    if(['oversize','read failure'].includes(kind))assert(!m.view.hasUncommittedWork());
});

test('new file wins over a delayed interruption inspection without stale controls or focus',async()=>{
    const wait=deferred();const m=model({inspectInterruptedRestore:()=>wait.promise});
    m.get('inspect-interrupted').dispatch('click');m.select('new');await flush();
    const outside=m.document.createElement('textarea');m.document.body.append(outside);outside.focus();
    wait.resolve({pending:true,canRecover:true,id:'late'});await flush();
    assert(m.get('interrupted-summary').hidden);assert(m.get('recover-interrupted').hidden);assert(m.get('cancel-interrupted').hidden);
    assert(!m.get('apply').disabled);assert.equal(m.document.activeElement,outside);assert.equal(m.calls.reviews[0][0],'new');
});
