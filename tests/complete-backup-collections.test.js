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
const accepted = {promptTarget:'global-library',collectionTarget:'global-collections'};
const Collections = require('../shared/local-ai-collections-store.js');
async function save(f, title='Result', body='Saved answer', seed='collection_id') { let i=0; const store=new Collections.Store(f.workspaceManager.createCollectionBackend(Collections),{now:()=>now,id:()=>`${seed}_${++i}`});const state=await store.mutate(store.request('add',{title,body}));return {store,record:state.records[0]}; }

test('collections full archive exact identities, history and user metadata; no device secrets',async()=>{
 const f=fixture(),{record,store}=await save(f);const review=await store.reviewRevision({id:record.id,version:record.version,body:'Second answer'});await store.mutate(store.request('revise',review));
 const file=Backup.parse(await f.store.export(),f.manager);assert.equal(file.schemaVersion,4);assert.deepEqual(file.globals.collections.content.records,Collections.content(f.raw[Collections.KEY]).records);assert.equal(file.globals.collections.content.records[0].history.length,2);assert(!JSON.stringify(file).includes('SECRET'));assert(file.workspaces.every(b=>!Object.hasOwn(b.modules,'collections')));
});
test('explicit collection target required and public preview cannot change private selection',async()=>{
 const incoming=fixture(),f=fixture();await save(incoming);await save(f,'Previous','Earlier','previous_id'); const source=await incoming.store.export(['collections']); const missing=await f.store.review(source);assert(missing.requiresCollectionTarget);assert.throws(()=>f.store.restore(missing,{confirmed:true}),code('CONFLICT'));
 const preview=await f.store.review(source,null,accepted);preview.selected=[];preview.collections.conflicts=[];await f.store.restore(preview,{confirmed:true});assert.equal(f.raw[Collections.KEY].records[0].title,'Result');assert.equal(f.raw[Collections.KEY].recovery[0].content.records[0].title,'Previous');assert.equal(Backup.parse(await f.store.recovery(),f.manager).globals.collections.content.records[0].title,'Previous');
});
test('v1 v2 v3 and deselected collection imports preserve exact collection authority',async()=>{
 const incoming=fixture(),f=fixture();await save(f);await add(incoming);const before=copy(f.raw[Collections.KEY]);
 for(const names of [['tasks'],['prompts'],Backup.MODULES.filter(n=>n!=='collections')]){const source=await incoming.store.export(names);const file=Backup.parse(source,f.manager);assert.equal(file.schemaVersion,names.includes('prompts')?3:2);await f.store.restore(await f.store.review(source,null,accepted),{confirmed:true});assert.deepEqual(f.raw[Collections.KEY],before);}
 await f.store.restore(await f.store.review(await legacySource(),['tasks'],{targetWorkspaceId:'default'}),{confirmed:true});assert.deepEqual(f.raw[Collections.KEY],before);
 const full=await incoming.store.export();await f.store.restore(await f.store.review(full,['prompts'],accepted),{confirmed:true});assert.deepEqual(f.raw[Collections.KEY],before);
});
test('collection-only restore preserves prompt bytes, workspace bundles and exact body identity',async()=>{
 const incoming=fixture(),f=fixture();const {record}=await save(incoming);await add(f);const prompt=copy(f.raw[Prompts.KEY]),snapshot=await f.workspaceManager.exportSnapshot();await f.store.restore(await f.store.review(await incoming.store.export(['collections']),null,accepted),{confirmed:true});assert.deepEqual(f.raw[Prompts.KEY],prompt);assert.deepEqual((await f.workspaceManager.exportSnapshot()).bundles,snapshot.bundles);assert.deepEqual(f.raw[Collections.KEY].records[0].history,record.history);assert.equal(f.raw[Collections.KEY].records[0].currentVersionId,record.currentVersionId);
});
test('collection mutation invalidates reviewed replacement without recovery writes',async()=>{
 const f=fixture(),incoming=fixture();await save(incoming);const local=await save(f);const plan=await f.store.review(await incoming.store.export(),null,accepted);await local.store.mutate(local.store.request('edit',{id:local.record.id,version:local.record.version,title:'Newer'}));f.writes.length=0;await assert.rejects(f.store.restore(plan,{confirmed:true}),code('CONFLICT'));assert.equal(f.writes.length,0);
});
for(const mode of ['throwBefore','throwAfter','collectionOnly','registryOnly','drop'])test('uncertain collection combined restore '+mode+' fences both writers and recovers reviewed prior state',async()=>{
 const f=fixture(),incoming=fixture();await save(incoming,'Incoming','New','incoming_id');const local=await save(f,'Original','Old','previous_id');await add(f);const before=copy(f.raw);const plan=await f.store.review(await incoming.store.export(),null,accepted);f.hooks.set=(values,raw)=>{if(Object.hasOwn(values,Workspaces.REGISTRY_KEY)){if(mode==='throwBefore')throw Error('fail');if(mode==='throwAfter'){Object.assign(raw,copy(values));throw Error('fail');}if(mode==='collectionOnly')raw[Collections.KEY]=copy(values[Collections.KEY]);if(mode==='registryOnly')raw[Workspaces.REGISTRY_KEY]=copy(values[Workspaces.REGISTRY_KEY]);return;}Object.assign(raw,copy(values));};
 await assert.rejects(f.store.restore(plan,{confirmed:true}),code('UNCONFIRMED'));f.hooks.set=null;const n=f.writes.length;
 await assert.rejects(local.store.mutate(local.store.request('add',{title:'Blocked',body:'Body'})),e=>['WORKSPACE_RESTORE_PENDING','RESTORE_PENDING','WRITE'].includes(e.code));
 const direct=new Collections.Store(Collections.createChromeBackend(f.chrome,f.locks),{now:()=>now,id:()=> 'blocked_operation'});await assert.rejects(direct.mutate(direct.request('add',{title:'Blocked',body:'Body'})),code('RESTORE_PENDING'));
 const directPrompt=new Prompts.Store(Prompts.createChromeBackend(f.chrome,f.locks));await assert.rejects(directPrompt.read(),code('RESTORE_PENDING'));assert.equal(f.writes.length,n);
 const recovery=await f.store.inspectInterruptedRestore();assert(recovery.pending&&recovery.canRecover);await f.store.recoverInterruptedRestore(recovery,{confirmed:true});assert.deepEqual(f.raw[Collections.KEY],before[Collections.KEY]);assert.deepEqual(f.raw[Prompts.KEY],before[Prompts.KEY]);assert.equal(f.raw[Workspaces.RESTORE_TRANSACTION_KEY].status,'recovered');
});
test('concurrent direct collection, coordinated collection and complete restore lock ordering completes',async()=>{
 const f=fixture(),incoming=fixture();await save(incoming);const local=await save(f);const direct=new Collections.Store(Collections.createChromeBackend(f.chrome,f.locks),{now:()=>now,id:()=> 'direct_operation'});
 const outcomes=await Promise.race([Promise.allSettled([direct.read(),local.store.read(),f.store.export(),f.store.review(await incoming.store.export(),null,accepted)]),new Promise((_,reject)=>setTimeout(()=>reject(Error('deadlock')),1500))]);assert(outcomes.every(r=>r.status==='fulfilled'));
});

test('optional reviewed context snapshot survives full archive parse and restore without device secrets', async () => {
    const incoming = fixture(), target = fixture();
    const { store } = await save(incoming);
    const packed = require('../shared/ai-context').pack('Exact synthetic question', [{ id: 'collection:synthetic', label: 'Synthetic source', text: 'Edited source excerpt' }]);
    const contextSnapshot = { schemaVersion: 1, question: packed.question, sources: packed.sources, prompt: packed.prompt, endpoint: 'https://model.example/v1/chat/completions', model: 'mock' };
    const saved = await store.mutate(store.request('add', { title: 'Answer with snapshot', body: 'Synthetic response', contextSnapshot }));
    const source = await incoming.store.export(), parsed = Backup.parse(source, incoming.manager);
    assert.deepEqual(parsed.globals.collections.content.records[1].contextSnapshot, contextSnapshot);
    assert.equal(JSON.stringify(parsed).includes('SECRET'), false);
    await target.store.restore(await target.store.review(source, null, accepted), { confirmed: true });
    const restored = target.raw[Collections.KEY].records[1];
    assert.deepEqual(restored.contextSnapshot, contextSnapshot);
    assert.deepEqual(restored.history, saved.records[1].history);
    const forged = JSON.parse(source), incomingRecord = forged.globals.collections.content.records[1];
    incomingRecord.currentVersionId = 'forged_first_version'; incomingRecord.body = 'Unrelated answer';
    incomingRecord.history = [{ id: incomingRecord.currentVersionId, body: incomingRecord.body, createdAt: incomingRecord.createdAt }];
    const writes = target.writes.length;
    await assert.rejects(target.store.review(JSON.stringify(forged), null, accepted));
    assert.equal(target.writes.length, writes);
    const malformed = JSON.parse(source); malformed.globals.collections.content.records[1].contextSnapshot.key = 'not-allowed';
    assert.throws(() => Backup.parse(JSON.stringify(malformed), target.manager));
});

test('complete collection restore accepts receipt history but never restores historical confirmations', async () => {
 const f=fixture(); const {store}=await save(f); const command=store.request('add',{title:'Synthetic evidence',body:'Synthetic exact answer'}); await store.mutate(command);
 const state=await store.read(); assert.equal(state.receipts.length,2); assert.equal((await store.inspectOperation(command)).committed,true);
 const restored=f.store.collectionReplacement(state,f.store.collectionArchive(state)); assert.deepEqual(restored.receipts,[]);
 f.raw[Collections.KEY]=restored;
 assert.equal((await store.inspectOperation(command)).committed,false);
 assert.equal(restored.records.some(record=>record.id===command.operationId),true);
});

test('complete archive duplicate keys fail before review or restore writes, even in deselected globals', async () => {
    const incoming = fixture(), target = fixture();
    await save(incoming, 'First'); await add(incoming);
    const source = await incoming.store.export();
    const before = copy(target.raw), writes = target.writes.length;
    for (const malformed of [
        source.replace('"title":"First"', '"title":"Ignored","title":"First"'),
        source.replace('"title":"First"', '"t\\u0069tle":"Ignored","title":"First"'),
        source.replace('"title":"Explain"', '"title":"Ignored","title":"Explain"'),
        source.replace('"schemaVersion":4', '"schemaVersion":1,"schemaVersion":4'),
        source.replace('"globals":{', '"globals":{},"globals":{')
    ]) {
        assert.notEqual(malformed, source);
        assert.throws(() => target.store.review(malformed, ['tasks'], accepted), code('DUPLICATE_KEY'));
        assert.throws(() => target.store.restore(target.store.review(malformed, null, accepted), {confirmed:true}), code('DUPLICATE_KEY'));
        assert.equal(target.writes.length, writes); assert.deepEqual(target.raw, before);
    }
    // Rejected input cannot poison the parse cache or prevent a valid round trip.
    await target.store.restore(await target.store.review(source, null, accepted), {confirmed:true});
    assert.equal(target.raw[Collections.KEY].records[0].title, 'First');
    assert.deepEqual(Backup.parse(source, target.manager), JSON.parse(source));
});
