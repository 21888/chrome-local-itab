const path = require('node:path');
const SOURCE_ROOT = process.env.PROMPT_AUDIT_SOURCE || path.resolve(__dirname, '..');
const test = require('node:test');
const assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
const Backup = require(path.join(SOURCE_ROOT, 'shared/complete-backup.js'));
const Workspaces = require(path.join(SOURCE_ROOT, 'shared/workspaces.js'));
const Manager = require(path.join(SOURCE_ROOT, 'storage.js'));
const Tasks = require(path.join(SOURCE_ROOT, 'shared/local-tasks-store.js'));
const Scratchpad = require(path.join(SOURCE_ROOT, 'shared/local-scratchpad-store.js'));
const Prompts = require(path.join(SOURCE_ROOT, 'shared/local-prompts-store.js'));
const Focus = require(path.join(SOURCE_ROOT, 'shared/local-focus-store.js'));
global.crypto = webcrypto;
const now = '2026-10-10T12:00:00.000Z';
const copy = value => structuredClone(value);
const code = expected => error => error.code === expected;
function fixture({extra = true, trash = true, active = false} = {}) {
    const raw = {privacy:{onlineFavicons:true},sync:{enabled:true,providerToken:'SECRET_PROVIDER'},__auth:'SECRET_AUTH',__updatePreferences:{channel:'stable'}}, writes = [], hooks = {}, queues = new Map(); let id = 0;
    const entries = [{id:'default',name:'Default'}, ...(extra ? [{id:'work',name:'Work'}] : []), ...(trash ? [{id:'removed',name:'Retired',deletedAt:now}] : [])].map((entry,order) => ({...entry,generation:'initial_'+entry.id,createdAt:now,updatedAt:now,deletedAt:entry.deletedAt || null,order}));
    const registry = {schemaVersion:1,revision:4,defaultId:'default',lastUsedId:extra ? 'work' : 'default',migrationId:'original_migration',workspaces:entries};
    raw[Workspaces.REGISTRY_KEY] = registry;
    raw[Workspaces.SNAPSHOT_KEY] = {schemaVersion:1,id:registry.migrationId,createdAt:now,values:{}};
    raw[Workspaces.ACTIVATION_KEY] = {schemaVersion:1,migrationId:registry.migrationId,defaultId:'default'};
    for (const entry of entries) {
        const tasks = Tasks.initial(); tasks.records = [{id:'task_'+entry.id,version:'version_'+entry.id,text:entry.name,state:'active',removedFrom:null,createdAt:now,updatedAt:now}];
        tasks.receipts = ['saved_receipt'];
        const focus = Focus.initial();
        if (active && entry.id === 'work') focus.session = {id:'active_focus',phase:'focus',status:'running',remainingMs:1500000,startedAt:1,deadline:1500001};
        raw[Workspaces.bundleKey(entry)] = {schemaVersion:1,id:entry.id,generation:entry.generation,values:{quote:entry.name,[Tasks.KEY]:tasks,[Scratchpad.KEY]:{...Scratchpad.initial(),content:'Note '+entry.name},[Focus.KEY]:focus}};
    }
    const locks = {request(name,options,fn) { if(typeof options === 'function') fn=options; const next=(queues.get(name)||Promise.resolve()).then(fn); queues.set(name,next.catch(()=>{})); return next; }};
    const chrome = {storage:{local:{
        async get(keys) { if(hooks.read) return hooks.read(keys,raw); return copy(keys === null ? raw : Object.fromEntries(keys.filter(key=>Object.hasOwn(raw,key)).map(key=>[key,raw[key]]))); },
        async set(values) { writes.push(copy(values)); if(hooks.set) return hooks.set(values,raw); Object.assign(raw,copy(values)); }
    },onChanged:{addListener(){},removeListener(){}}}};
    const workspaceManager = new Workspaces.Manager({chrome,locks,now:()=>now,id:()=>`new_generation_${++id}`});
    const manager = new Manager(); manager.ensureSyncInitialized = () => {throw Error('Provider forbidden');}; manager.scheduleSyncPush=()=>{throw Error('Provider forbidden');};
    workspaceManager.configureValidation(values => { manager.completeBackupConfigFromRaw(values); for (const api of [Tasks, Scratchpad, Focus]) if (Object.hasOwn(values, api.KEY)) api.validate(values[api.KEY]); });
    const backend = Backup.createBackend(manager,chrome,locks);
    const store = new Backup.Store(manager,backend,{workspaceManager,now:()=>now,id:()=>`backup_token_${++id}`});
    const values = id => {const entry=raw[Workspaces.REGISTRY_KEY].workspaces.find(entry=>entry.id===id);return raw[Workspaces.bundleKey(entry)].values;};
    return {raw,writes,hooks,store,manager,workspaceManager,backend,values,chrome,locks};
}
async function legacySource() {
    const f=fixture({extra:false,trash:false});const snapshot=await f.workspaceManager.exportSnapshot();return f.store.snapshot(snapshot.bundles[0].values).source;
}


async function add(f, title = 'Explain', body = 'Explain {{topic}}', seed = 'prompt_token') {
    let id = 0;
    const store = new Prompts.Store(f.workspaceManager.createPromptBackend(Prompts), {now:()=>now,id:()=>`${seed}_${++id}`});
    const state = await store.mutate(store.request('add', {title,body}));
    return {store,record:state.records.at(-1)};
}
const accepted = {promptTarget:'global-library'};

async function changedPlan(f) {
    const incoming=fixture({extra:false,trash:false});
    await add(incoming,'Incoming','New body','incoming_id');
    incoming.values('default')[Scratchpad.KEY].content='New incoming note';
    return f.store.review(await incoming.store.export(),null,accepted);
}
async function pendingFixture() {
    const f=fixture({extra:false,trash:false});
    const added=await add(f,'Existing','Old body','existing_id');
    const before=copy(f.raw),plan=await changedPlan(f);
    f.hooks.set=(values,raw)=>{if(Object.hasOwn(values,Workspaces.REGISTRY_KEY)){Object.assign(raw,copy(values));throw Error('ack lost');}Object.assign(raw,copy(values));};
    await assert.rejects(f.store.restore(plan,{confirmed:true}),code('UNCONFIRMED'));
    delete f.hooks.set; return {...f,promptStore:added.store,record:added.record,before};
}
async function blocked(f) {
    await assert.rejects(f.workspaceManager.rename('default','Blocked'),code('WORKSPACE_RESTORE_PENDING'));
    const direct=new Prompts.Store(Prompts.createChromeBackend(f.chrome,f.locks));
    await assert.rejects(direct.mutate(direct.request('enable',{enabled:true,revision:0})),code('RESTORE_PENDING'));
    await assert.rejects(f.store.mutate(f.store.request('edit',{id:f.record.id,version:f.record.version,title:'Blocked'})),code('WORKSPACE_RESTORE_PENDING'));
}

test('cancel immediately after durable prepared fence keeps previous authorities and blocks writers until explicit recovery',async()=>{
    const f=fixture({extra:false,trash:false});const {store:promptStore,record}=await add(f,'Existing','Old','existing_id');
    const before=copy(f.raw),plan=await changedPlan(f);let current=true;
    f.hooks.set=(values,raw)=>{Object.assign(raw,copy(values));if(values[Workspaces.RESTORE_TRANSACTION_KEY]?.status==='prepared')current=false;};
    await assert.rejects(f.store.restore(plan,{confirmed:true,isCurrent:()=>current}),error=>error.code==='UNCONFIRMED'&&error.mayHaveCommitted);
    delete f.hooks.set;
    assert.deepEqual(f.raw[Workspaces.REGISTRY_KEY],before[Workspaces.REGISTRY_KEY]);assert.deepEqual(f.raw[Prompts.KEY],before[Prompts.KEY]);
    assert.equal(f.raw[Workspaces.RESTORE_TRANSACTION_KEY].status,'prepared');
    await blocked({...f,store:promptStore,record});
    const review=await f.store.inspectInterruptedRestore();assert.equal(review.outcome,'previous-present');
    const recovered=await f.store.recoverInterruptedRestore(review,{confirmed:true});assert(recovered.recovered);assert.equal(f.raw[Workspaces.RESTORE_TRANSACTION_KEY].status,'recovered');
});

for(const mode of ['drop','false','throwBefore','throwAfter','readback'])test('final verified marker '+mode+' reports exact readable pending state',async()=>{
    const f=fixture({extra:false,trash:false});await add(f,'Existing','Old','existing_id');const plan=await changedPlan(f);
    f.hooks.set=(values,raw)=>{
        if(values[Workspaces.RESTORE_TRANSACTION_KEY]?.status==='verified'){
            if(mode==='drop')return;if(mode==='false')return false;if(mode==='throwBefore')throw Error('marker write');
            Object.assign(raw,copy(values));if(mode==='throwAfter')throw Error('marker ack');
            if(mode==='readback')f.hooks.read=()=>{throw Error('marker read');};return;
        }Object.assign(raw,copy(values));
    };
    await assert.rejects(f.store.restore(plan,{confirmed:true}),error=>error.code==='UNCONFIRMED'&&error.mayHaveCommitted);
    delete f.hooks.set;delete f.hooks.read;
    const review=await f.store.inspectInterruptedRestore();
    assert.equal(review.pending,!['throwAfter','readback'].includes(mode));
    if(review.pending){assert.equal(review.outcome,'replacement-present');await f.store.recoverInterruptedRestore(review,{confirmed:true});}
    else await f.workspaceManager.rename('default','Writer after durable final marker');
});

test('recovery rejects authority changes after review without writes',async()=>{
    const f=await pendingFixture(),review=await f.store.inspectInterruptedRestore();
    f.raw[Prompts.KEY].revision++;f.writes.length=0;
    await assert.rejects(f.store.recoverInterruptedRestore(review,{confirmed:true}),code('CONFLICT'));
    assert.equal(f.writes.length,0);assert.equal(f.raw[Workspaces.RESTORE_TRANSACTION_KEY].status,'submitted');
});

test('recovery rejects marker changes after review without writes',async()=>{
    const f=await pendingFixture(),review=await f.store.inspectInterruptedRestore();
    f.raw[Workspaces.RESTORE_TRANSACTION_KEY].id='changed_marker_id';f.writes.length=0;
    await assert.rejects(f.store.recoverInterruptedRestore(review,{confirmed:true}),code('CONFLICT'));assert.equal(f.writes.length,0);
});

test('recovery rejects corrupted portable recovery bytes before authority writes',async()=>{
    const f=await pendingFixture(),review=await f.store.inspectInterruptedRestore();
    const key=f.raw[Workspaces.RESTORE_TRANSACTION_KEY].recoveryKey;f.raw[key].source+=' ';f.writes.length=0;
    await assert.rejects(f.store.recoverInterruptedRestore(review,{confirmed:true}),code('RECOVERY'));assert.equal(f.writes.length,0);
});

test('recovery must not silently restore later-mutated retained prior-generation content',async()=>{
    const f=await pendingFixture(),review=await f.store.inspectInterruptedRestore();
    const oldEntry=f.before[Workspaces.REGISTRY_KEY].workspaces[0],key=Workspaces.bundleKey(oldEntry);
    f.raw[key].values[Scratchpad.KEY].content='Later unrelated data';f.writes.length=0;
    let outcome;try{outcome=await f.store.recoverInterruptedRestore(review,{confirmed:true});}catch(error){outcome=error.code;}
    assert.notEqual(outcome?.recovered,true,'Returned recovered:true while exposing later-mutated old content');
});

for(const mode of ['drop','false','promptOnly','registryOnly','throwAfter'])test('partial explicit recovery '+mode+' retains pending fence and needs fresh review',async()=>{
    const f=await pendingFixture(),review=await f.store.inspectInterruptedRestore();
    f.hooks.set=(values,raw)=>{
        if(Object.hasOwn(values,Workspaces.REGISTRY_KEY)){
            if(mode==='drop')return;if(mode==='false')return false;
            if(mode==='promptOnly'){raw[Prompts.KEY]=copy(values[Prompts.KEY]);return;}
            if(mode==='registryOnly'){raw[Workspaces.REGISTRY_KEY]=copy(values[Workspaces.REGISTRY_KEY]);return;}
            Object.assign(raw,copy(values));throw Error('recovery ack');
        }Object.assign(raw,copy(values));
    };
    await assert.rejects(f.store.recoverInterruptedRestore(review,{confirmed:true}),code('UNCONFIRMED'));
    delete f.hooks.set;
    assert.equal(f.raw[Workspaces.RESTORE_TRANSACTION_KEY].status,'submitted');
    await assert.rejects(f.workspaceManager.rename('default','Still blocked'),code('WORKSPACE_RESTORE_PENDING'));
    await assert.rejects(f.store.recoverInterruptedRestore(review,{confirmed:true}));
    const newer=await f.store.inspectInterruptedRestore();await f.store.recoverInterruptedRestore(newer,{confirmed:true});
    assert.deepEqual(f.raw[Prompts.KEY],f.before[Prompts.KEY]);assert.deepEqual(f.raw[Workspaces.REGISTRY_KEY],f.before[Workspaces.REGISTRY_KEY]);
});

test('recovery rejects current workspace content changed after inspected review',async()=>{
    const f=await pendingFixture(),review=await f.store.inspectInterruptedRestore();
    f.values('default')[Scratchpad.KEY].content='Current generation edit after review';f.writes.length=0;
    let outcome;try{outcome=await f.store.recoverInterruptedRestore(review,{confirmed:true});}catch(error){outcome=error.code;}
    assert.notEqual(outcome?.recovered,true,'Returned recovered:true and replaced later workspace content without a fresh review');
    assert.equal(f.writes.length,0);
});

const {AsyncLocalStorage}=require('node:async_hooks');
function trackLocks(f){
    const context=new AsyncLocalStorage(),original=f.locks.request.bind(f.locks),edges=[];
    f.locks.request=(name,options,fn)=>{
        if(typeof options==='function'){fn=options;options={};}
        const held=context.getStore()||[];
        assert(!held.includes(name),'Reentrant lock request: '+[...held,name].join(' → '));
        for(const from of held)edges.push([from,name]);
        return original(name,options,()=>context.run([...held,name],fn));
    };return edges;
}
for(const first of ['direct','restore','coordinated'])test('contention between '+first+'-first direct/coordinated/restore writers has no lock inversion',async()=>{
    const f=fixture({extra:false,trash:false}),{record,store:coordinated}=await add(f,'Existing','Old','existing_id'),plan=await changedPlan(f);
    const edges=trackLocks(f),direct=new Prompts.Store(Prompts.createChromeBackend(f.chrome,f.locks));
    const work={direct:()=>direct.mutate(direct.request('edit',{id:record.id,version:record.version,title:'Direct edit'})),coordinated:()=>coordinated.mutate(coordinated.request('edit',{id:record.id,version:record.version,title:'Coordinated edit'})),restore:()=>f.store.restore(plan,{confirmed:true})};
    let timer;
    const results=await Promise.race([Promise.allSettled([work[first](),...Object.keys(work).filter(x=>x!==first).map(x=>work[x]())]),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Potential deadlock after 2 seconds')),2000);})]);clearTimeout(timer);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert(!edges.some(([from,to])=>from===Prompts.LOCK&&to===Workspaces.LOCK));
    assert(edges.some(([from,to])=>from===Workspaces.LOCK&&to===Prompts.LOCK));
});

test('pending combined marker blocks existing session writes and lifecycle writers with zero writes',async()=>{
    const f=fixture();await add(f,'Existing','Old','existing_id');
    const session=f.workspaceManager.capture('default');await session.ready();const plan=await changedPlan(f);
    f.hooks.set=(values,raw)=>{Object.assign(raw,copy(values));if(Object.hasOwn(values,Workspaces.REGISTRY_KEY))throw Error('lost ack');};
    await assert.rejects(f.store.restore(plan,{confirmed:true}),code('UNCONFIRMED'));delete f.hooks.set;f.writes.length=0;
    const attempts=[()=>session.local.set({quote:'Blocked'}),()=>session.local.set({privacy:{onlineFavicons:false}}),()=>session.local.remove(['quote']),()=>session.createBackend(Tasks.KEY).write(Tasks.initial()),()=>f.workspaceManager.create('Blocked'),()=>f.workspaceManager.duplicate('default','Blocked'),()=>f.workspaceManager.trash('work'),()=>f.workspaceManager.restore('removed'),()=>f.workspaceManager.select('work')];
    for(const action of attempts)await assert.rejects(action(),code('WORKSPACE_RESTORE_PENDING'));
    assert.equal(f.writes.length,0);
});

for(const cancelAt of [1,2,3,4])test('explicit recovery cancellation gate '+cancelAt+' never submits authorities',async()=>{
    const f=await pendingFixture(),review=await f.store.inspectInterruptedRestore();f.writes.length=0;let calls=0;
    await assert.rejects(f.store.recoverInterruptedRestore(review,{confirmed:true,isCurrent:()=>++calls<cancelAt}));
    assert.equal(f.writes.length,0);assert.equal(f.raw[Workspaces.RESTORE_TRANSACTION_KEY].status,'submitted');
});

test('cancellation during authority acknowledgement settles already submitted combined state once',async()=>{
    const f=fixture({extra:false,trash:false});await add(f,'Existing','Old','existing_id');const plan=await changedPlan(f);let current=true;
    f.hooks.set=(values,raw)=>{Object.assign(raw,copy(values));if(Object.hasOwn(values,Workspaces.REGISTRY_KEY))current=false;};f.writes.length=0;
    const result=await f.store.restore(plan,{confirmed:true,isCurrent:()=>current});delete f.hooks.set;
    assert(result.changed);assert.equal(f.writes.filter(w=>Object.hasOwn(w,Workspaces.REGISTRY_KEY)).length,1);assert.equal(f.raw[Workspaces.RESTORE_TRANSACTION_KEY].status,'verified');
});
