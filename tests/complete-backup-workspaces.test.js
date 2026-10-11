const test = require('node:test');
const assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
const Backup = require('../shared/complete-backup.js');
const Workspaces = require('../shared/workspaces.js');
const Manager = require('../storage.js');
const Tasks = require('../shared/local-tasks-store.js');
const Scratchpad = require('../shared/local-scratchpad-store.js');
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
    return {raw,writes,hooks,store,manager,workspaceManager,backend,values};
}
async function legacySource() {
    const f=fixture({extra:false,trash:false});const snapshot=await f.workspaceManager.exportSnapshot();return f.store.snapshot(snapshot.bundles[0].values).source;
}

test('v2 exports every live workspace and recoverable Trash, preserving safe registry metadata only',async()=>{
    const f=fixture(),source=await f.store.export(Backup.SCOPED_MODULES),file=Backup.parse(source,f.manager);
    assert.equal(file.schemaVersion,2);assert.deepEqual(file.modules,Backup.SCOPED_MODULES);assert.deepEqual(file.registry.entries.map(e=>e.name),['Default','Work']);assert.equal(file.trash[0].name,'Retired');assert.equal(file.trash[0].modules.scratchpad.content,'Note Retired');assert.equal(file.registry.lastUsedId,'work');
    for(const word of ['SECRET','privacy','receipts','revision','generation','migrationId','session','__update'])assert(!source.includes(word),word);
    assert.equal(f.writes.length,0);
});
test('partial v2 export omits unselected corrupt content and never includes device global keys',async()=>{
    const f=fixture();f.values('work')[Tasks.KEY]={schemaVersion:99};f.values('removed').quote='q'.repeat(Backup.LIMITS.bytes);
    const source=await f.store.export(['scratchpad']);const file=Backup.parse(source,f.manager);assert.deepEqual(file.modules,['scratchpad']);assert(file.workspaces.every(x=>Object.keys(x.modules).length===1));assert.equal(f.writes.length,0);
    await assert.rejects(f.store.export(Backup.SCOPED_MODULES));
});
test('full restore stages verified bundles then switches one registry, retaining prior complete recovery and raw generations',async()=>{
    const incoming=fixture(),f=fixture({extra:false,trash:false}),before=copy(f.raw),preview=await f.store.review(await incoming.store.export(Backup.SCOPED_MODULES));
    assert.equal(preview.workspaces.scope,'all');assert.equal(preview.workspaces.incomingTrashCount,1);
    await f.store.restore(preview,{confirmed:true});
    assert.deepEqual(f.raw[Workspaces.REGISTRY_KEY].workspaces.map(e=>e.id),['default','work','removed']);
    assert.equal(f.values('work')[Scratchpad.KEY].content,'Note Work');assert.equal(f.values('removed')[Tasks.KEY].records[0].text,'Retired');
    const recovery=Backup.parse(await f.store.recovery(),f.manager);assert.deepEqual(recovery.registry.entries.map(e=>e.id),['default']);assert.equal(recovery.trash.length,0);
    for(const key of ['privacy','sync','__auth','__updatePreferences'])assert.deepEqual(f.raw[key],before[key]);
    const original=before[Workspaces.REGISTRY_KEY].workspaces[0];assert.deepEqual(f.raw[Workspaces.bundleKey(original)],before[Workspaces.bundleKey(original)]);
    assert.equal(f.writes.filter(write=>Object.hasOwn(write,Workspaces.REGISTRY_KEY)).length,1);assert.equal(Object.keys(f.writes.at(-1)).length,1);
});
test('partial topology mismatch rejects before recovery or staging; names cannot be replaced by partial restore',async()=>{
    const incoming=fixture(),f=fixture({extra:false,trash:false});await assert.rejects(f.store.review(await incoming.store.export(['scratchpad'])),code('TOPOLOGY'));assert.equal(f.writes.length,0);
    const same=fixture(),file=JSON.parse(await incoming.store.export(['scratchpad']));file.registry.entries[1].name='Imported rename';
    await same.store.restore(await same.store.review(JSON.stringify(file)),{confirmed:true});assert.equal(same.raw[Workspaces.REGISTRY_KEY].workspaces[1].name,'Work');
});
test('legacy v1 requires explicit reviewed destination and preserves every other workspace including Trash',async()=>{
    const f=fixture(),source=await legacySource(),before=await f.workspaceManager.exportSnapshot();
    const undecided=await f.store.review(source,['scratchpad']);assert(undecided.requiresTarget);assert.deepEqual(undecided.destinations.map(e=>e.id),['default','work']);assert.throws(()=>f.store.restore(undecided,{confirmed:true}),code('CONFLICT'));
    await assert.rejects(f.store.review(source,['scratchpad'],{targetWorkspaceId:'removed'}),code('TARGET'));
    const preview=await f.store.review(source,['scratchpad'],{targetWorkspaceId:'work'});assert.equal(preview.targetWorkspace.name,'Work');preview.targetWorkspace.id='default';
    await f.store.restore(preview,{confirmed:true});assert.equal(f.values('work')[Scratchpad.KEY].content,'Note Default');
    const after=await f.workspaceManager.exportSnapshot();for(const id of ['default','removed'])assert.deepEqual(after.bundles.find(b=>b.id===id),before.bundles.find(b=>b.id===id));
    assert.equal(Backup.parse(await f.store.recovery(),f.manager).registry.entries.length,2);
});
test('selected Focus blocks any full registry restore that could overwrite an active session',async()=>{
    const f=fixture({active:true}),source=await fixture().store.export(Backup.SCOPED_MODULES),preview=await f.store.review(source);assert(preview.current.focus.activeSession);
    await assert.rejects(f.store.restore(preview,{confirmed:true}),code('FOCUS_ACTIVE'));assert.equal(f.writes.length,0);
});
test('unselected Focus remains exact even in the changed workspace and sibling timers are retained',async()=>{
    const f=fixture({active:true}),before=copy(f.values('work')[Focus.KEY]);
    await f.store.restore(await f.store.review(await legacySource(),['scratchpad'],{targetWorkspaceId:'work'}),{confirmed:true});assert.deepEqual(f.values('work')[Focus.KEY],before);
    const partial=JSON.parse(await fixture().store.export(['scratchpad']));partial.workspaces[0].modules.scratchpad.content='Changed';
    await f.store.restore(await f.store.review(JSON.stringify(partial)),{confirmed:true});assert.deepEqual(f.values('work')[Focus.KEY],before);
});
for(const mutate of [f=>{f.schemaVersion=3;},f=>{f.global={privacy:{onlineFavicons:true}};},f=>{f.registry.entries[1].id='default';},f=>{f.registry.lastUsedId='removed';},f=>{f.trash[0].id='default';},f=>{f.workspaces[0].modules.config.data.privacy={onlineFavicons:true};},f=>{f.workspaces[1].modules.tasks.schemaVersion=99;},f=>{f.modules=['scratchpad'];},f=>{f.registry.entries[0].future=true;},f=>{f.registry.entries[0].name='\nname';}])test('malformed v2 schema and unselected corruption fail closed: '+mutate.toString(),async()=>{
    const f=fixture(),file=JSON.parse(await f.store.export(Backup.SCOPED_MODULES));mutate(file);assert.throws(()=>f.store.review(JSON.stringify(file),['scratchpad']));assert.equal(f.writes.length,0);
});
test('registry, other workspace and same-content revision changes all invalidate a legacy target preview',async()=>{
    for(const mutate of [f=>{f.raw[Workspaces.REGISTRY_KEY].revision++;},f=>{f.values('removed')[Scratchpad.KEY].content='New';},f=>{f.values('work')[Scratchpad.KEY].revision++;}]){
        const f=fixture(),preview=await f.store.review(await legacySource(),['scratchpad'],{targetWorkspaceId:'default'});mutate(f);await assert.rejects(f.store.restore(preview,{confirmed:true}),code('CONFLICT'));assert.equal(f.writes.length,0);
    }
});
for(const mode of ['throw','drop','mismatch'])test('portable recovery '+mode+' prevents any staging or registry mutation',async()=>{
    const f=fixture(),preview=await f.store.review(await legacySource(),['scratchpad'],{targetWorkspaceId:'work'}),before=copy(f.raw[Workspaces.REGISTRY_KEY]);
    f.hooks.set=(values,raw)=>{if(mode==='throw')throw Error('quota');if(mode==='drop')return;Object.assign(raw,copy(values));raw[Backup.WORKSPACE_RECOVERY_KEY].checksum='bad';};
    await assert.rejects(f.store.restore(preview,{confirmed:true}),code('RECOVERY'));assert.equal(f.writes.length,1);assert.deepEqual(f.raw[Workspaces.REGISTRY_KEY],before);
});
test('cancel during asynchronous staging prevents registry authority switch',async()=>{
    const f=fixture(),preview=await f.store.review(await legacySource(),['scratchpad'],{targetWorkspaceId:'work'}),before=copy(f.raw[Workspaces.REGISTRY_KEY]);let current=true;
    f.hooks.set=(values,raw)=>{Object.assign(raw,copy(values));if(Object.keys(values).some(key=>key.startsWith(Workspaces.PREFIX)))current=false;};
    await assert.rejects(f.store.restore(preview,{confirmed:true,isCurrent:()=>current}),code('CANCELLED'));assert.deepEqual(f.raw[Workspaces.REGISTRY_KEY],before);assert.equal(f.values('work')[Scratchpad.KEY].content,'Note Work');
});
for(const mode of ['throwBefore','throwAfter','drop','readback'])test('registry switch '+mode+' is uncertain and never retried or rolled back',async()=>{
    const f=fixture(),preview=await f.store.review(await legacySource(),['scratchpad'],{targetWorkspaceId:'work'});
    f.hooks.set=(values,raw)=>{if(Object.hasOwn(values,Workspaces.REGISTRY_KEY)){if(mode==='throwBefore')throw Error('write');if(mode==='drop')return;Object.assign(raw,copy(values));if(mode==='throwAfter')throw Error('acknowledgement');if(mode==='readback')f.hooks.read=()=>{throw Error('read');};}else Object.assign(raw,copy(values));};
    await assert.rejects(f.store.restore(preview,{confirmed:true}),error=>error.code==='UNCONFIRMED'&&error.mayHaveCommitted);assert.equal(f.writes.filter(value=>Object.hasOwn(value,Workspaces.REGISTRY_KEY)).length,1);delete f.hooks.read;assert.equal(Backup.parse(await f.store.recovery(),f.manager).registry.entries.length,2);
});
for(const mode of ['drop','throwAfter'])test('failed staged bundle '+mode+' cannot partially replace authoritative workspaces',async()=>{
    const f=fixture(),preview=await f.store.review(await fixture().store.export(Backup.SCOPED_MODULES)),before=await f.workspaceManager.exportSnapshot();
    f.hooks.set=(values,raw)=>{if(Object.keys(values).some(key=>key.startsWith(Workspaces.PREFIX))){if(mode==='drop')return;Object.assign(raw,copy(values));throw Error('stage acknowledgement');}Object.assign(raw,copy(values));};
    await assert.rejects(f.store.restore(preview,{confirmed:true}),code('UNCONFIRMED'));assert.deepEqual(await f.workspaceManager.exportSnapshot(),before);assert.equal(f.writes.filter(values=>Object.hasOwn(values,Workspaces.REGISTRY_KEY)).length,0);
});
test('out-of-band writes during staging abort the authority switch without erasing newer saved data',async()=>{
    const f=fixture(),preview=await f.store.review(await legacySource(),['scratchpad'],{targetWorkspaceId:'work'}),registry=copy(f.raw[Workspaces.REGISTRY_KEY]);
    f.hooks.set=(values,raw)=>{Object.assign(raw,copy(values));if(Object.keys(values).some(key=>key.startsWith(Workspaces.PREFIX)))f.values('default')[Scratchpad.KEY].content='Newest external note';};
    await assert.rejects(f.store.restore(preview,{confirmed:true}),code('CONFLICT'));assert.deepEqual(f.raw[Workspaces.REGISTRY_KEY],registry);assert.equal(f.values('default')[Scratchpad.KEY].content,'Newest external note');assert.equal(f.values('work')[Scratchpad.KEY].content,'Note Work');
});
test('future workspace schemas and missing authoritative bundles cannot be mistaken for defaults',async()=>{
    for(const mutate of [f=>{f.raw[Workspaces.REGISTRY_KEY].schemaVersion=99;},f=>{delete f.raw[Workspaces.bundleKey(f.raw[Workspaces.REGISTRY_KEY].workspaces[1])];}]){
        const f=fixture();mutate(f);await assert.rejects(f.store.export(['scratchpad']));assert.equal(f.writes.length,0);
    }
});
test('StorageManager captured session automatically selects all-workspace backup mode',async()=>{
    const f=fixture();f.manager.workspace=f.workspaceManager.capture('work');const store=new Backup.Store(f.manager,f.backend,{now:()=>now});
    const file=JSON.parse(await store.export(['scratchpad']));assert.equal(file.schemaVersion,2);assert.equal(file.registry.entries.length,2);assert.equal(file.trash.length,1);
});
test('supported migrated legacy shortcut/category omissions receive portable defaults without changing stored content',async()=>{
    const f=fixture();f.values('work').links=[{title:'Original site',url:'https://example.com/'}];f.values('work').categories=[{id:'work',name:'Work'}];const before=copy(f.values('work'));
    const file=JSON.parse(await f.store.export(Backup.SCOPED_MODULES));const config=file.workspaces.find(entry=>entry.id==='work').modules.config;
    assert.deepEqual(config.data.links,[{icon:'🌐',category:'work',title:'Original site',url:'https://example.com/'}]);assert.equal(config.data.categories[0].icon,'📁');assert.deepEqual(f.values('work'),before);assert.equal(f.writes.length,0);
    for(const invalid of [42,'javascript:bad']) {f.values('work').links[0].url=invalid;await assert.rejects(f.store.export(Backup.SCOPED_MODULES),code('CORRUPT'));}
});
test('Default config restore persists Sync safety block before authority switch and fresh tabs reject remote replay',async()=>{
    const f=fixture(),guardKey=f.manager.syncIdentityStateKey;f.raw[guardKey]={ownWrites:[{fingerprint:'preserved',revision:'previous',schema:1}],otherSafety:'preserve'};const provider=copy(f.raw.sync);
    const source=JSON.parse(await f.store.export(Backup.SCOPED_MODULES));source.workspaces.find(entry=>entry.id==='default').modules.config.data.quote='Local replacement';
    await f.store.restore(await f.store.review(JSON.stringify(source)),{confirmed:true});
    assert.deepEqual(f.raw.sync,provider);assert.equal(f.raw[guardKey].blocked.kind,'restore');assert.equal(f.raw[guardKey].otherSafety,'preserve');assert.equal(f.raw[guardKey].ownWrites[0].revision,'previous');
    const blockWrite=f.writes.findIndex(write=>Object.hasOwn(write,guardKey)),authorityWrite=f.writes.findIndex(write=>Object.hasOwn(write,Workspaces.REGISTRY_KEY));assert(blockWrite>=0&&blockWrite<authorityWrite);
    const fresh=new Manager();assert.throws(()=>fresh.checkSyncIdentity({}, {payload:{},schema:1}, f.raw[guardKey]),error=>error.kind==='restore'||error.code==='SYNC_COMPATIBILITY');
});
test('single non-Default legacy configuration restore leaves Default Sync safety state untouched',async()=>{
    const f=fixture(),guardKey=f.manager.syncIdentityStateKey;f.raw[guardKey]={existing:'preserve'};const before=copy(f.raw[guardKey]);
    await f.store.restore(await f.store.review(await legacySource(),['config'],{targetWorkspaceId:'work'}),{confirmed:true});assert.deepEqual(f.raw[guardKey],before);assert(!f.writes.some(write=>Object.hasOwn(write,guardKey)));
});
test('failed verified Default Sync safety block prevents registry replacement',async()=>{
    const f=fixture(),before=copy(f.raw[Workspaces.REGISTRY_KEY]),source=await f.store.export(Backup.SCOPED_MODULES);
    f.hooks.set=(values,raw)=>{if(Object.hasOwn(values,f.manager.syncIdentityStateKey))return;Object.assign(raw,copy(values));};
    await assert.rejects(f.store.restore(await f.store.review(source),{confirmed:true}),code('UNCONFIRMED'));assert.deepEqual(f.raw[Workspaces.REGISTRY_KEY],before);assert(!f.writes.some(write=>Object.hasOwn(write,Workspaces.REGISTRY_KEY)));
});
test('v2 portable recovery leaves legacy raw scoped recovery unchanged and retains verified v1 fallback reading',async()=>{
    const f=fixture(),source=await legacySource(),legacy={source,checksum:await f.manager.fingerprint(source)};f.raw[Backup.RECOVERY_KEY]=copy(legacy);f.raw[Workspaces.SNAPSHOT_KEY].values[Backup.RECOVERY_KEY]=copy(legacy);
    assert.equal(await f.store.recovery(),source);
    await f.store.restore(await f.store.review(source,['scratchpad'],{targetWorkspaceId:'work'}),{confirmed:true});
    assert.deepEqual(f.raw[Backup.RECOVERY_KEY],legacy);assert(!f.writes.some(write=>Object.hasOwn(write,Backup.RECOVERY_KEY)));
    assert.equal(Backup.parse(await f.store.recovery(),f.manager).schemaVersion,2);assert(f.writes.some(write=>Object.hasOwn(write,Backup.WORKSPACE_RECOVERY_KEY)));await f.workspaceManager.checkLegacySource();
});
