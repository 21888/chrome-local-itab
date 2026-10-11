// Synthetic in-memory storage only; never a native-browser migration harness.
const {webcrypto} = require('node:crypto');
const Backup = require('../../shared/complete-backup.js');
const Workspaces = require('../../shared/workspaces.js');
const Manager = require('../../storage.js');
const Tasks = require('../../shared/local-tasks-store.js');
const Scratchpad = require('../../shared/local-scratchpad-store.js');
const Prompts = require('../../shared/local-prompts-store.js');
const Focus = require('../../shared/local-focus-store.js');
global.crypto = webcrypto;
const now = '2026-10-10T12:00:00.000Z';
const copy = value => structuredClone(value);
function fixture({extra = true, trash = true, active = false, persisted = null, clock = () => now} = {}) {
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
    if (persisted) { for (const key of Object.keys(raw)) delete raw[key]; Object.assign(raw, copy(persisted)); }
    const locks = {request(name,options,fn) { if(typeof options === 'function') fn=options; const next=(queues.get(name)||Promise.resolve()).then(fn); queues.set(name,next.catch(()=>{})); return next; }};
    const chrome = {storage:{local:{
        async get(keys) { if(hooks.read) return hooks.read(keys,raw); return copy(keys === null ? raw : Object.fromEntries(keys.filter(key=>Object.hasOwn(raw,key)).map(key=>[key,raw[key]]))); },
        async set(values) { writes.push(copy(values)); if(hooks.set) return hooks.set(values,raw); Object.assign(raw,copy(values)); }
    },onChanged:{addListener(){},removeListener(){}}}};
    const workspaceManager = new Workspaces.Manager({chrome,locks,now:clock,id:()=>`new_generation_${++id}`});
    const manager = new Manager(); manager.ensureSyncInitialized = () => {throw Error('Provider forbidden');}; manager.scheduleSyncPush=()=>{throw Error('Provider forbidden');};
    workspaceManager.configureValidation(values => { manager.completeBackupConfigFromRaw(values); for (const api of [Tasks, Scratchpad, Focus]) if (Object.hasOwn(values, api.KEY)) api.validate(values[api.KEY]); });
    const backend = Backup.createBackend(manager,chrome,locks);
    const store = new Backup.Store(manager,backend,{workspaceManager,now:clock,id:()=>`backup_token_${++id}`});
    const values = id => {const entry=raw[Workspaces.REGISTRY_KEY].workspaces.find(entry=>entry.id===id);return raw[Workspaces.bundleKey(entry)].values;};
    return {raw,writes,hooks,store,manager,workspaceManager,backend,values,chrome,locks};
}

const Countdown = require('../../shared/local-countdown-store.js');
const Collections = require('../../shared/local-ai-collections-store.js');
const accepted = {promptTarget:'global-library',collectionTarget:'global-collections'};
async function synthetic(seed = 'source', {clock = () => now} = {}) {
    const f = fixture({clock}); let sequence = 0;
    f.raw[Workspaces.REGISTRY_KEY].lastUsedId = seed === 'source' ? 'default' : 'work';
    const options = {now:clock,id:()=>`${seed}_global_${++sequence}`};
    for (const entry of f.raw[Workspaces.REGISTRY_KEY].workspaces) {
        entry.name = `${seed} ${entry.name}`;
        const value = f.values(entry.id), task = value[Tasks.KEY];
        value[Focus.KEY].enabled = seed === 'source';
        value[Focus.KEY].durations = seed === 'source' ? {focus:35,break:7} : {focus:20,break:4};
        value[Focus.KEY].session.remainingMs = value[Focus.KEY].durations.focus * 60000;
        Focus.validate(value[Focus.KEY]);
        value.quote = `${seed} ${entry.name}`;
        value[Scratchpad.KEY].content = `${seed} ${entry.name}\n中文 · Español 🧪 <literal>\n`;
        value[Countdown.KEY] = {...Countdown.initial(), enabled:true, title:`${seed} date`, targetDate:'2027-02-28'};
        task.enabled = true; task.records[0].text = `${seed} active`;
        task.records.push(...['done','removed'].map(state=>({...copy(task.records[0]),id:`${seed}_${entry.id}_${state}`,version:`${seed}_${entry.id}_${state}_v`,text:`${seed} ${state}`,state,removedFrom:state === 'removed' ? 'done' : null})));
        task.pinnedId = task.records[0].id;
        task.recovery = [{id:`${seed}_${entry.id}_history`,createdAt:now,content:{records:copy(task.records),pinnedId:task.pinnedId}}];
        Tasks.validate(task);
    }
    const prompts = new Prompts.Store(f.workspaceManager.createPromptBackend(Prompts), options);
    let state = await prompts.mutate(prompts.request('add',{title:`${seed} prompt`,body:`${seed} original {{topic}}\n保留 exact 🧪`}));
    const original = copy(state.records[0]);
    await prompts.mutate(prompts.request('edit',{id:original.id,version:original.version,title:`${seed} renamed`,body:`${seed} revised {{topic}}`}));
    const collections = new Collections.Store(f.workspaceManager.createCollectionBackend(Collections), options);
    state = await collections.mutate(collections.request('add',{title:`${seed} answer`,body:`${seed} original answer`,sourceUrl:'https://example.com/synthetic',notes:'Synthetic data only',promptRef:{promptId:original.id,bodyVersionId:original.currentVersionId}}));
    const record = state.records[0];
    await collections.mutate(collections.request('revise',await collections.reviewRevision({id:record.id,version:record.version,body:`${seed} revised answer`})));
    for (const [name,store] of [['prompt',prompts],['collection',collections]]) {
        const state = await store.mutate(store.request('add',{title:`${seed} archived ${name}`,body:`${seed} archived body`}));
        const archived = state.records.at(-1);
        await store.mutate(store.request('remove',{id:archived.id,version:archived.version}));
        // A supported reviewed self-import creates a real displaced-content
        // recovery entry without fabricating global state schema fields.
        await store.mutate(store.request('replace',await store.review(await store.export())));
    }
    return {...f,original,prompts,collections};
}
module.exports = {fixture,synthetic,accepted,Backup,Workspaces,Prompts,Collections,Tasks,Scratchpad,Focus,copy};
