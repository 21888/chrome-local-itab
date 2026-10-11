const test = require('node:test');
const assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
const Backup = require('../shared/complete-backup.js');
const Workspaces = require('../shared/workspaces.js');
const Manager = require('../storage.js');
const Tasks = require('../shared/local-tasks-store.js');
const Scratchpad = require('../shared/local-scratchpad-store.js');
const Prompts = require('../shared/local-prompts-store.js');
const Focus = require('../shared/local-focus-store.js');
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
test('global prompt module exports once with saved history and excludes device fields', async()=>{
    const f=fixture(), {store,record}=await add(f);
    await store.mutate(store.request('edit',{id:record.id,version:record.version,body:'Second {{topic}}'}));
    const source=await f.store.export(), file=Backup.parse(source,f.manager);
    assert.equal(file.schemaVersion,3); assert.deepEqual(file.modules,Backup.MODULES);
    assert.equal(file.globals.prompts.content.records[0].history.length,2);
    assert(file.workspaces.every(item=>!Object.hasOwn(item.modules,'prompts')));
    assert.equal(file.globals.prompts.content.records[0].id,record.id);
    for(const key of ['enabled','receipts','privacy','sync','provider','credentials']) assert(!Object.hasOwn(file.globals.prompts,key));
    assert(!source.includes('SECRET'));
});
test('explicit global target and immutable reviewed replacement are required',async()=>{
    const incoming=fixture(),f=fixture();await add(incoming);
    const source=await incoming.store.export(['prompts']), undecided=await f.store.review(source);
    assert(undecided.requiresPromptTarget); assert.equal(undecided.workspaces.scope,'global-only');
    assert.throws(()=>f.store.restore(undecided,{confirmed:true}),code('CONFLICT'));
    await assert.rejects(f.store.review(source,null,{promptTarget:'default'}),code('TARGET'));
    const plan=await f.store.review(source,null,accepted); assert.equal(plan.incoming.prompts.active,1);
    plan.prompts.target='default'; await f.store.restore(plan,{confirmed:true});
    assert.equal(f.raw[Prompts.KEY].records.length,1);
    assert.equal(f.raw[Prompts.KEY].enabled,false);
});
test('combined restore submits both authorities once after complete verified recovery; retains old generations',async()=>{
    const incoming=fixture(),f=fixture({extra:false,trash:false});await add(incoming,'Imported','New body','incoming_id');await add(f,'Existing','Old body','existing_id');
    const before=copy(f.raw), plan=await f.store.review(await incoming.store.export(),null,accepted); f.writes.length=0;
    await f.store.restore(plan,{confirmed:true});
    const submit=f.writes.filter(write=>Object.hasOwn(write,Workspaces.REGISTRY_KEY));assert.equal(submit.length,1);
    assert(Object.hasOwn(submit[0],Prompts.KEY));assert(Object.hasOwn(submit[0],Workspaces.RESTORE_TRANSACTION_KEY));
    assert.equal(f.raw[Workspaces.RESTORE_TRANSACTION_KEY].status,'verified');
    const recovery=Backup.parse(await f.store.recovery(),f.manager);assert.equal(recovery.schemaVersion,3);assert.equal(recovery.globals.prompts.content.records[0].title,'Existing');
    assert.equal(recovery.registry.entries.length,1);assert.equal(f.raw[Prompts.KEY].recovery[0].content.records[0].title,'Existing');
    for(const key of ['privacy','sync','__auth','__updatePreferences'])assert.deepEqual(f.raw[key],before[key]);
    for(const entry of before[Workspaces.REGISTRY_KEY].workspaces)assert.deepEqual(f.raw[Workspaces.bundleKey(entry)],before[Workspaces.bundleKey(entry)]);
});
test('global-only prompts restore ignores foreign workspace topology and preserves scoped data',async()=>{
    const incoming=fixture({extra:false,trash:false}),f=fixture();await add(incoming);const before=await f.workspaceManager.exportSnapshot();
    await f.store.restore(await f.store.review(await incoming.store.export(['prompts']),null,accepted),{confirmed:true});
    const after=await f.workspaceManager.exportSnapshot();assert.deepEqual(after.bundles,before.bundles);assert.deepEqual(after.registry.workspaces,before.registry.workspaces);
});
test('v1/v2 archives never replace or erase global prompts',async()=>{
    for(const legacy of [true,false]) {const f=fixture();await add(f);const before=copy(f.raw[Prompts.KEY]);const source=legacy?await legacySource():await fixture().store.export(Backup.SCOPED_MODULES);
        const plan=await f.store.review(source,null,legacy?{targetWorkspaceId:'work'}:{});await f.store.restore(plan,{confirmed:true});assert.deepEqual(f.raw[Prompts.KEY],before);
    }
});
test('deselecting prompts leaves exact saved state untouched and excludes it from recovery',async()=>{
    const f=fixture(),incoming=fixture();await add(f);await add(incoming,'Imported','Other','incoming_id');const before=copy(f.raw[Prompts.KEY]);
    const plan=await f.store.review(await incoming.store.export(),['scratchpad']);await f.store.restore(plan,{confirmed:true});assert.deepEqual(f.raw[Prompts.KEY],before);assert.equal(Backup.parse(await f.store.recovery(),f.manager).schemaVersion,2);
});
test('prompt-only export ignores corrupt unselected scoped content',async()=>{
    const f=fixture();await add(f);f.values('work')[Tasks.KEY]={schemaVersion:99};const source=await f.store.export(['prompts']);assert.equal(Backup.parse(source,f.manager).globals.prompts.content.records.length,1);
});
test('selected prompt corruption fails closed while unselected prompt corruption does not block scoped export/restore',async()=>{
    const f=fixture();f.raw[Prompts.KEY]={schemaVersion:99};await assert.rejects(f.store.export(['prompts']),code('CORRUPT'));
    const source=await f.store.export(['scratchpad']);await f.store.restore(await f.store.review(source),{confirmed:true});assert.deepEqual(f.raw[Prompts.KEY],{schemaVersion:99});
});
for(const mutate of [file=>file.globals.prompts.future=true,file=>file.globals.privacy={},file=>file.globals.prompts.content.records.push(copy(file.globals.prompts.content.records[0])),file=>file.globals.prompts.content.records[0].history[0].body='Wrong body',file=>file.workspaces[0].modules.prompts={}])test('strict prompt archive rejects malformed input '+mutate.toString(),async()=>{
    const f=fixture();await add(f);const file=JSON.parse(await f.store.export());mutate(file);f.writes.length=0;assert.throws(()=>f.store.review(JSON.stringify(file),['scratchpad']));assert.equal(f.writes.length,0);
});
test('same-ID body-version identity conflict rejects review before writing',async()=>{
    const f=fixture();await add(f);const file=JSON.parse(await f.store.export());const record=file.globals.prompts.content.records[0];record.body='Different identity';record.history[0].body=record.body;
    f.writes.length=0;await assert.rejects(f.store.review(JSON.stringify(file),['prompts'],accepted),code('IDENTITY_CONFLICT'));assert.equal(f.writes.length,0);
});
test('prompt mutation after review invalidates combined plan before recovery writes',async()=>{
    const f=fixture();const {store,record}=await add(f);const plan=await f.store.review(await f.store.export(),null,accepted);
    await store.mutate(store.request('edit',{id:record.id,version:record.version,title:'Changed'}));f.writes.length=0;
    await assert.rejects(f.store.restore(plan,{confirmed:true}),code('CONFLICT'));assert.equal(f.writes.length,0);
});
for(const mode of ['throwBefore','throwAfter','drop','promptOnly','registryOnly','readback'])test('uncertain combined authority '+mode+' preserves recovery and blocks all retries/writers',async()=>{
    const incoming=fixture(),f=fixture({extra:false,trash:false});await add(incoming,'Incoming','New','incoming_id');const {store,record}=await add(f,'Existing','Old','existing_id');const before=copy(f.raw),plan=await f.store.review(await incoming.store.export(),null,accepted);f.writes.length=0;
    f.hooks.set=(values,raw)=>{if(Object.hasOwn(values,Workspaces.REGISTRY_KEY)){if(mode==='throwBefore')throw Error('write');if(mode==='drop')return;if(mode==='promptOnly'){raw[Prompts.KEY]=copy(values[Prompts.KEY]);return;}if(mode==='registryOnly'){raw[Workspaces.REGISTRY_KEY]=copy(values[Workspaces.REGISTRY_KEY]);return;}Object.assign(raw,copy(values));if(mode==='throwAfter')throw Error('ack');if(mode==='readback')f.hooks.read=()=>{throw Error('read');};}else Object.assign(raw,copy(values));};
    await assert.rejects(f.store.restore(plan,{confirmed:true}),error=>error.code==='UNCONFIRMED'&&error.mayHaveCommitted);delete f.hooks.read;delete f.hooks.set;
    assert.equal(f.writes.filter(write=>Object.hasOwn(write,Workspaces.REGISTRY_KEY)).length,1);assert.equal(Backup.parse(await f.store.recovery(),f.manager).globals.prompts.content.records[0].title,'Existing');
    await assert.rejects(store.mutate(store.request('edit',{id:record.id,version:record.version,title:'No'})),code('WORKSPACE_RESTORE_PENDING'));
    const direct=new Prompts.Store(Prompts.createChromeBackend(f.chrome,f.locks),{now:()=>now,id:()=>crypto.randomUUID()});await assert.rejects(direct.mutate(direct.request('enable',{enabled:true,revision:0})),code('RESTORE_PENDING'));
    await assert.rejects(f.workspaceManager.rename('default','No'),code('WORKSPACE_RESTORE_PENDING'));
    const report=await f.workspaceManager.inspectRestoreTransaction();assert(report.pending);assert.equal(report.target,'previous-complete-state');
    await f.workspaceManager.recoverInterruptedRestore(report,{confirmed:true});assert.deepEqual(f.raw[Prompts.KEY],before[Prompts.KEY]);assert.deepEqual(f.raw[Workspaces.REGISTRY_KEY],before[Workspaces.REGISTRY_KEY]);
    await f.workspaceManager.rename('default','Recovered');
});
test('failed pre-restore recovery never stages combined transaction',async()=>{
    const f=fixture();await add(f);const plan=await f.store.review(await f.store.export(),null,accepted);f.writes.length=0;f.hooks.set=()=>{};
    await assert.rejects(f.store.restore(plan,{confirmed:true}),code('RECOVERY'));assert.equal(f.writes.length,1);assert(!f.raw[Workspaces.RESTORE_TRANSACTION_KEY]);
});
test('default prompt backend races safely against combined restore under workspace then prompt lock',async()=>{
    const f=fixture();const {record}=await add(f);const direct=new Prompts.Store(Prompts.createChromeBackend(f.chrome,f.locks),{now:()=>now,id:()=>crypto.randomUUID()});
    const plan=await f.store.review(await f.store.export(),null,accepted);
    let entered,release;const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});
    f.hooks.set=async(values,raw)=>{if(Object.hasOwn(values,Prompts.KEY)&&!Object.hasOwn(values,Workspaces.REGISTRY_KEY)){entered();await gate;}Object.assign(raw,copy(values));};
    const edit=direct.mutate(direct.request('edit',{id:record.id,version:record.version,title:'Concurrent'}));await started;
    const restore=f.store.restore(plan,{confirmed:true});release();
    const result=await Promise.allSettled([edit,restore]);assert.equal(result[0].status,'fulfilled');assert.equal(result[1].status,'rejected');assert.equal(result[1].reason.code,'CONFLICT');assert.equal(f.raw[Prompts.KEY].records[0].title,'Concurrent');
});
test('transient fence read errors do not create a permanent lockout',async()=>{
    const f=fixture();const {store}=await add(f);f.hooks.read=()=>{throw Error('temporary');};await assert.rejects(store.read());delete f.hooks.read;assert.equal((await store.read()).records.length,1);assert(!f.raw[Workspaces.RESTORE_TRANSACTION_KEY]);
});

test('changed retained generations block recovery instead of restoring altered prior data',async()=>{
    const incoming=fixture(),f=fixture({extra:false,trash:false});await add(incoming,'Imported','New','incoming_id');await add(f,'Existing','Old','existing_id');
    const old=copy(f.raw[Workspaces.REGISTRY_KEY]),plan=await f.store.review(await incoming.store.export(),null,accepted);
    f.hooks.set=(values,raw)=>{if(Object.hasOwn(values,Workspaces.REGISTRY_KEY)){Object.assign(raw,copy(values));throw Error('ack');}Object.assign(raw,copy(values));};await assert.rejects(f.store.restore(plan,{confirmed:true}));delete f.hooks.set;
    f.raw[Workspaces.bundleKey(old.workspaces[0])].values[Scratchpad.KEY].content='Changed retained data';const review=await f.workspaceManager.inspectRestoreTransaction(),before=copy(f.raw[Workspaces.REGISTRY_KEY]);
    await assert.rejects(f.workspaceManager.recoverInterruptedRestore(review,{confirmed:true}),code('WORKSPACE_RECOVERY'));assert.deepEqual(f.raw[Workspaces.REGISTRY_KEY],before);
});
test('recovery preview flags changed retained data, exposes both safe candidates and cannot repair',async()=>{
    const incoming=fixture(),f=fixture({extra:false,trash:false});await add(incoming,'Imported','New','incoming_id');await add(f,'Existing','Old','existing_id');
    const old=copy(f.raw[Workspaces.REGISTRY_KEY]),plan=await f.store.review(await incoming.store.export(),null,accepted);
    f.hooks.set=(values,raw)=>{Object.assign(raw,copy(values));if(Object.hasOwn(values,Workspaces.REGISTRY_KEY))throw Error('ack');};await assert.rejects(f.store.restore(plan,{confirmed:true}));delete f.hooks.set;
    f.raw[Workspaces.bundleKey(old.workspaces[0])].values[Scratchpad.KEY].content='New external copy';
    const review=await f.store.inspectInterruptedRestore();assert.equal(review.priorIntact,false);assert.equal(review.canRecover,false);
    const source=await f.store.exportInterruptedCandidates(),file=JSON.parse(source);assert.equal(file.before.globals.prompts.content.records[0].title,'Existing');assert.equal(file.current.globals.prompts.content.records[0].title,'Imported');assert(!source.includes('SECRET'));assert(!source.includes('providerToken'));
    const writes=f.writes.length;await assert.rejects(f.store.recoverInterruptedRestore(review,{confirmed:true}));assert.equal(f.writes.length,writes);
});
test('current candidate content changed after recovery preview blocks rollback without overwriting it',async()=>{
    const incoming=fixture(),f=fixture({extra:false,trash:false});await add(incoming,'Imported','New','incoming_id');await add(f,'Existing','Old','existing_id');
    const plan=await f.store.review(await incoming.store.export(),null,accepted);f.hooks.set=(values,raw)=>{Object.assign(raw,copy(values));if(Object.hasOwn(values,Workspaces.REGISTRY_KEY))throw Error('ack');};await assert.rejects(f.store.restore(plan,{confirmed:true}));delete f.hooks.set;
    const review=await f.store.inspectInterruptedRestore();assert(review.canRecover);f.values('work')[Scratchpad.KEY].content='Newest current copy';const before=copy(f.raw[Workspaces.REGISTRY_KEY]),writes=f.writes.length;
    await assert.rejects(f.store.recoverInterruptedRestore(review,{confirmed:true}),code('CONFLICT'));assert.equal(f.writes.length,writes);assert.deepEqual(f.raw[Workspaces.REGISTRY_KEY],before);assert.equal(f.values('work')[Scratchpad.KEY].content,'Newest current copy');
});
test('cancellation after durable prepared fence makes no authority submission and remains explicitly recoverable',async()=>{
    const f=fixture();await add(f);const plan=await f.store.review(await f.store.export(),null,accepted);const before=copy(f.raw[Workspaces.REGISTRY_KEY]);let current=true;f.writes.length=0;
    f.hooks.set=(values,raw)=>{Object.assign(raw,copy(values));if(values[Workspaces.RESTORE_TRANSACTION_KEY]?.status==='prepared')current=false;};
    await assert.rejects(f.store.restore(plan,{confirmed:true,isCurrent:()=>current}),code('UNCONFIRMED'));delete f.hooks.set;
    assert.deepEqual(f.raw[Workspaces.REGISTRY_KEY],before);assert(!f.writes.some(write=>Object.hasOwn(write,Workspaces.REGISTRY_KEY)));const review=await f.store.inspectInterruptedRestore();assert(review.pending&&review.canRecover);await f.store.recoverInterruptedRestore(review,{confirmed:true});
});
test('recovery cancellation during async verification does not switch authorities',async()=>{
    const f=fixture();await add(f);const plan=await f.store.review(await f.store.export(),null,accepted);f.hooks.set=(values,raw)=>{Object.assign(raw,copy(values));if(Object.hasOwn(values,Workspaces.REGISTRY_KEY))throw Error('ack');};await assert.rejects(f.store.restore(plan,{confirmed:true}));delete f.hooks.set;
    const review=await f.store.inspectInterruptedRestore();let current=true;const original=f.chrome.storage.local.get;
    f.chrome.storage.local.get=async keys=>{const value=await original(keys);if(keys.includes(Backup.WORKSPACE_RECOVERY_KEY))current=false;return value;};const writes=f.writes.length;
    await assert.rejects(f.store.recoverInterruptedRestore(review,{confirmed:true,isCurrent:()=>current}));assert.equal(f.writes.length,writes);f.chrome.storage.local.get=original;
});
