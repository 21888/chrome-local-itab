const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const {createDocument,deferred}=require('./helpers/task-dom-model');
const Workspaces=require('../shared/workspaces'),Tasks=require('../shared/local-tasks-store');
const {Controller}=require('../shared/local-tasks-controller');
const copy=value=>structuredClone(value),NOW='2026-10-28T23:00:00Z',DEFER=Symbol('normal');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(){for(let i=0;i<8;i++)await tick();}
function fixture(initial = {}) {
    const raw = copy(initial), writes = [], removals = [], reads = [], hooks = {}, providers = [];
    const queues = new Map(), locksState = new Map(), listeners = new Set(), lockNames = [];
    let serial = 0;
    const locks = { request(name, options, action) {
        action ||= options; lockNames.push(name);
        const mode = options?.mode === 'shared' ? 'shared' : 'exclusive';
        if (!locksState.has(name)) locksState.set(name, { active: 0, exclusive: false, waiting: [] });
        const state = locksState.get(name);
        const drain = () => {
            if (state.exclusive || !state.waiting.length) return;
            if (state.active && state.waiting[0].mode === 'exclusive') return;
            do {
                const next = state.waiting.shift(); state.active++; state.exclusive = next.mode === 'exclusive';
                Promise.resolve().then(next.action).then(next.resolve, next.reject).finally(() => { state.active--; if (next.mode === 'exclusive') state.exclusive = false; drain(); });
            } while (!state.exclusive && state.waiting[0]?.mode === 'shared');
        };
        const next = new Promise((resolve, reject) => { state.waiting.push({ mode, action, resolve, reject }); drain(); });
        queues.set(name, next.catch(() => {})); return next;
    } };
    const extract = keys => {
        if (keys === null || keys === undefined) return copy(raw);
        if (typeof keys === 'string') keys = [keys];
        if (!Array.isArray(keys)) return Object.fromEntries(Object.entries(keys).map(([key, value]) => [key, copy(Object.hasOwn(raw, key) ? raw[key] : value)]));
        return Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, copy(raw[key])]));
    };
    const notify = changes => { for (const fn of listeners) fn(copy(changes), 'local'); };
    const apply = values => {
        const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { oldValue: copy(raw[key]), newValue: copy(value) }]));
        Object.assign(raw, copy(values)); notify(changes);
    };
    const local = {
        async get(keys) {
            reads.push(copy(keys));
            if (hooks.get) { const result = await hooks.get(keys, raw); if (result !== DEFER) return result; }
            return extract(keys);
        },
        async set(values) {
            writes.push(copy(values));
            if (hooks.set) { const result = await hooks.set(values, raw, apply); if (result !== DEFER) return result; }
            apply(values);
        },
        async remove(keys) {
            if (!Array.isArray(keys)) keys = [keys]; removals.push(copy(keys));
            if (hooks.remove) { const result = await hooks.remove(keys, raw); if (result !== DEFER) return result; }
            const changes = Object.fromEntries(keys.map(key => [key, { oldValue: copy(raw[key]) }]));
            for (const key of keys) delete raw[key]; notify(changes);
        },
        async getBytesInUse() { return Buffer.byteLength(JSON.stringify(raw)); },
        QUOTA_BYTES: 10 * 1024 * 1024
    };
    const forbidden = name => async (...args) => { providers.push([name, copy(args)]); throw Error(`Provider access forbidden: ${name}`); };
    const chrome = { storage: { local,
        sync: { get: forbidden('sync.get'), set: forbidden('sync.set'), remove: forbidden('sync.remove') },
        onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) }
    }, identity: { getAuthToken: forbidden('identity.getAuthToken') }, permissions: { request: forbidden('permissions.request') },
    runtime: { getManifest: () => ({ version: '1.1.21' }) } };
    const manager = () => Workspaces.createManager({ chrome, locks, now: () => NOW, id: () => `synthetic_workspace_${++serial}` });
    return { raw, writes, removals, reads, hooks, providers, locks, lockNames, chrome, manager, apply, extract,
        async settled() { await Promise.all([...queues.values()]); await new Promise(resolve => setImmediate(resolve)); }
    };
}

async function model(t,{settings=false,locale='en',fail=true}={}){
 const initial={...Tasks.initial(),enabled:true,revision:4,receipts:['receipt_prior'],
  records:[{id:'task_original',version:'version_original',text:'Original 中文 😀',state:'active',removedFrom:null,createdAt:NOW,updatedAt:NOW}],
  recovery:[{id:'recovery_prior',createdAt:NOW,content:{records:[],pinnedId:null}}]};
 Tasks.validate(initial);const f=fixture({[Tasks.KEY]:initial,quote:'Unchanged quote'}),manager=f.manager();
 await manager.ready();const second=await manager.create('Second'),session=manager.capture('default');await session.ready();
 const other=copy(await manager.capture(second.id).local.get(null));
 const document=createDocument(),host=document.createElement('article');document.body.append(host);
 const messages=JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`,'utf8'));
 const window={LocalItabTasks:{...Tasks,Controller},LocalItabWorkspaces:{session},i18n:{t:key=>messages[key]?.message||key},addEventListener(){},removeEventListener(){}};
 const context={window,document,crypto:webcrypto,setTimeout,URL,Blob};vm.createContext(context);
 for(const file of ['shared/dialog-focus.js','shared/local-tasks-view.js','shared/local-content-lifecycle.js','shared/workspaces-view.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
 const controller=new Controller(new Tasks.Store(session.createBackend(Tasks.KEY)));
 if(fail)f.hooks.get=async()=>{throw Error('synthetic unavailable local read')};
 const view=settings?window.LocalItabTasks.mountSettings(host,{controller}):window.LocalItabTasks.mount(host,{controller});
 window[settings?'localTasksSettingsController':'localTasksView']=settings?controller:view;
 t.after(()=>{if(!settings)view.destroy();controller.destroy();});await settle();
 return{f,manager,session,second,other,initial,controller,view,host,document,window,messages,
  retry:settings?host.querySelector('button'):view.retry,
  feedback:settings?host.querySelector('[role="status"]'):view.status,
  async recover(){f.hooks.get=null;await controller.retry();await settle();}};
}

test('actual workspace initial read failure offers the dashboard read Retry without changing storage',async t=>{
 const h=await model(t),before=copy(h.f.raw),writes=h.f.writes.length;
 assert.equal(h.controller.error?.code,'WORKSPACE_READ');assert.equal(h.controller.state,null);
 assert(!h.host.hidden);assert.equal(h.view.retry.hidden,false,'a transient workspace-backed read failure needs the read-only Retry');
 assert.equal(h.view.status.textContent,h.messages.tasksErrorRead.message);
 assert.deepEqual(h.f.raw,before);assert.equal(h.f.writes.length,writes);assert.deepEqual(h.f.providers,[]);
});

test('actual workspace settings read Retry clears its recovered error instead of leaving a false save failure',async t=>{
 const h=await model(t,{settings:true}),before=copy(h.f.raw),writes=h.f.writes.length;
 assert.equal(h.controller.error?.code,'WORKSPACE_READ');assert(!h.retry.hidden);
 h.f.hooks.get=null;h.retry.dispatch('click');await settle();
 assert.deepEqual(h.controller.state,h.initial,'the real read recovered the original saved task state');
 assert.equal(h.controller.error,null,'the successful owned read must acknowledge its own failure');
 assert(h.retry.hidden);assert(!h.host.querySelector('input').disabled);
 assert.deepEqual(h.f.raw,before);assert.equal(h.f.writes.length,writes);assert.deepEqual(h.f.providers,[]);
});


for(const locale of ['en','zh_CN'])for(const settings of [false,true])test(`workspace read failure remains retryable without blank replacement: ${locale} ${settings?'settings':'card'}`,async t=>{
 const h=await model(t,{locale,settings}),before=copy(h.f.raw),writes=h.f.writes.length;
 assert.equal(h.feedback.textContent,h.messages.tasksErrorRead.message);assert(!h.retry.hidden);
 if(!settings){h.view.input.value='Unsaved task 中文';h.view.input.dispatch('input');}
 h.retry.dispatch('click');await settle();assert.equal(h.controller.error?.code,'WORKSPACE_READ');assert(!h.retry.hidden);
 assert.deepEqual(h.f.raw,before);assert.equal(h.f.writes.length,writes);
 h.f.hooks.get=null;h.retry.dispatch('click');await settle();
 assert.equal(h.controller.error,null);assert.equal(h.controller.status,'ready');assert(h.retry.hidden);
 assert.deepEqual(h.controller.state,h.initial);assert.deepEqual(h.f.raw,before);assert.equal(h.f.writes.length,writes);
 if(!settings)assert.equal(h.view.input.value,'Unsaved task 中文');assert.deepEqual(h.f.providers,[]);
});

function holdReadDelivery(store){
 const read=store.read,entered=deferred(),release=deferred();let first=true;
 store.read=function(){const result=read.call(this);if(!first)return result;first=false;
  return result.then(async state=>{entered.resolve();await release.promise;return state;},async error=>{entered.resolve();await release.promise;throw error;});};
 return{entered,release};
}
for(const oldFailure of [false,true])test(`workspace read ${oldFailure?'old failure cannot replace newer success':'old success cannot clear newer failure'}`,async t=>{
 const h=await model(t),gate=holdReadDelivery(h.controller.store);t.after(()=>gate.release.resolve());
 h.f.hooks.get=oldFailure?async()=>{throw Error('older real read failure')}:null;
 const older=h.controller.retry(),observed=older.catch(error=>error);await gate.entered.promise;
 h.f.hooks.get=oldFailure?null:async()=>{throw Error('newer real read failure')};
 if(oldFailure)await h.controller.retry();else await assert.rejects(h.controller.retry(),{code:'WORKSPACE_READ'});
 const error=h.controller.error,state=h.controller.state,status=h.controller.status;
 gate.release.resolve();await observed;await settle();
 assert.strictEqual(h.controller.error,error);assert.strictEqual(h.controller.state,state);assert.equal(h.controller.status,status);
 assert.equal(error?.code,oldFailure?undefined:'WORKSPACE_READ');assert.equal(h.retry.hidden,oldFailure);
});

for(const settings of [false,true])test(`workspace failed mutation is not reclassified or acknowledged by read success: ${settings?'settings':'card'}`,async t=>{
 const h=await model(t,{settings,fail:false}),writes=h.f.writes.length,before=copy(h.f.raw);
 h.f.hooks.get=async()=>{throw Error('real read failure before mutation')};
 const command=h.controller.store.request(settings?'enable':'add',settings?{enabled:false}:{text:'Explicit original command'});
 await assert.rejects(h.controller.run(command),{code:'WORKSPACE_READ'});const error=h.controller.error;
 assert.equal(h.feedback.textContent,h.messages.tasksErrorWrite.message,'an owned failed save must not promise nothing changed');
 assert.strictEqual(h.controller.retryCommand,command);h.f.hooks.get=null;await h.controller.refresh();
 assert.strictEqual(h.controller.error,error);assert.strictEqual(h.controller.retryCommand,command);
 assert.equal(h.feedback.textContent,h.messages.tasksErrorWrite.message);assert.deepEqual(h.f.raw,before);assert.equal(h.f.writes.length,writes);
 await h.controller.retry();await settle();assert.equal(h.controller.error,null);assert.equal(h.controller.retryCommand,null);
 const saved=(await h.session.local.get([Tasks.KEY]))[Tasks.KEY];assert.deepEqual(saved.recovery,h.initial.recovery);
 assert.deepEqual(saved.records[0],h.initial.records[0]);assert.equal(saved.receipts.filter(id=>id===command.operationId).length,1);
 assert.equal(h.f.writes.length-writes,1);assert.deepEqual(h.f.providers,[]);
});

test('recovered workspace read keeps a newer page-local export error and the unsaved quick-entry draft',async t=>{
 const h=await model(t);h.view.input.value='Unsaved alongside export error';h.view.input.dispatch('input');
 const error=h.view.localError=Tasks.fault('FILE');h.view.render();await h.recover();
 assert.equal(h.controller.error,null);assert.strictEqual(h.view.localError,error);
 assert.equal(h.view.status.textContent,h.messages.tasksErrorFile.message);assert.equal(h.view.input.value,'Unsaved alongside export error');
});

test('workspace read recovery preserves genuine revision conflict and its exact retry command',async t=>{
 const h=await model(t,{fail:false}),store=h.controller.store;
 const stale=store.request('edit',{id:'task_original',version:'version_original',text:'Local conflicting edit'});
 await new Tasks.Store(h.session.createBackend(Tasks.KEY)).mutate(store.request('edit',{id:'task_original',version:'version_original',text:'Other saved edit'}));
 await assert.rejects(h.controller.run(stale),{code:'CONFLICT'});const error=h.controller.error,before=copy(h.f.raw),writes=h.f.writes.length;
 await h.controller.refresh();assert.strictEqual(h.controller.error,error);assert.strictEqual(h.controller.retryCommand,stale);
 assert.equal(h.controller.state.records[0].text,'Other saved edit');assert.deepEqual(h.f.raw,before);assert.equal(h.f.writes.length,writes);
});

test('actual workspace complete recovery: keep draft, Retry, Stay, Save and switch, then return to original tasks',async t=>{
 const h=await model(t),writes=h.f.writes.length,before=copy(h.f.raw),draft='Recovered draft 中文 😀';
 h.view.input.value=draft;h.view.input.dispatch('input');h.f.hooks.get=null;h.retry.dispatch('click');await settle();
 assert.equal(h.controller.error,null);assert.equal(h.view.input.value,draft);assert.deepEqual(h.f.raw,before);assert.equal(h.f.writes.length,writes);
 const navigations=[],switcher=h.document.createElement('section'),managerHost=h.document.createElement('section');h.document.body.append(switcher,managerHost);
 const picker=h.window.LocalItabWorkspacesView.mount({switcher,managerHost,manager:h.manager,session:h.session,lifecycle:h.window.LocalItabContentLifecycle,navigate:id=>navigations.push(id)});t.after(()=>picker.destroy());await picker.ready;
 const button=text=>{const node=h.document.querySelectorAll('button').find(n=>n.textContent===text);assert(node,text);return node;};
 await picker.requestSwitch(h.second.id);assert.deepEqual(navigations,[]);button('Stay here').dispatch('click');assert.equal(h.view.input.value,draft);
 await picker.requestSwitch(h.second.id);button('Save and switch').dispatch('click');
 for(let i=0;i<20&&!navigations.length;i++)await new Promise(r=>setTimeout(r,10));
 assert.deepEqual(navigations,[h.second.id]);
 const saved=(await h.session.local.get([Tasks.KEY]))[Tasks.KEY];assert.equal(saved.records.at(-1).text,draft);
 assert.deepEqual(saved.records[0],h.initial.records[0]);assert.deepEqual(saved.recovery,h.initial.recovery);
 assert.deepEqual(await h.manager.capture(h.second.id).local.get(null),h.other);
 picker.destroy();h.view.destroy();
 async function openPage(id){
  const session=h.manager.capture(id);await session.ready();h.window.LocalItabWorkspaces.session=session;
  const host=h.document.createElement('article');h.document.body.append(host);
  const controller=new Controller(new Tasks.Store(session.createBackend(Tasks.KEY))),view=h.window.LocalItabTasks.mount(host,{controller});
  h.window.localTasksView=view;t.after(()=>view.destroy());await settle();
  return{session,controller,view,host};
 }
 const otherPage=await openPage(h.second.id);assert.deepEqual(await otherPage.session.local.get(null),h.other);
 const otherPicker=h.window.LocalItabWorkspacesView.mount({switcher:h.document.createElement('section'),managerHost:h.document.createElement('section'),manager:h.manager,session:otherPage.session,lifecycle:h.window.LocalItabContentLifecycle,navigate:id=>navigations.push(id)});
 t.after(()=>otherPicker.destroy());await otherPicker.ready;await otherPicker.requestSwitch('default');
 assert.deepEqual(navigations,[h.second.id,'default']);otherPicker.destroy();otherPage.view.destroy();
 const returned=await openPage('default');assert.deepEqual(returned.controller.state,saved);assert.equal(returned.controller.error,null);
 assert.equal(returned.controller.state.records.length,2);assert(returned.host.querySelectorAll('.tasks-text').some(node=>node.textContent===draft));assert.deepEqual(h.f.providers,[]);
});

for(const settings of [false,true])test(`workspace read-back failure after a real commit keeps uncertain-save feedback and receipt Retry: ${settings?'settings':'card'}`,async t=>{
 const h=await model(t,{settings,fail:false}),backend=h.controller.store.backend,write=backend.write.bind(backend),writes=h.f.writes.length;
 backend.write=async value=>{await write(value);h.f.hooks.get=async()=>{throw Error('synthetic read-back transport failure')};};
 const command=h.controller.store.request(settings?'enable':'add',settings?{enabled:false}:{text:'Committed but unacknowledged'});
 await assert.rejects(h.controller.run(command),{code:'WORKSPACE_READ'});await settle();const error=h.controller.error;
 assert.equal(h.feedback.textContent,h.messages.tasksErrorWrite.message);assert.strictEqual(h.controller.retryCommand,command);
 h.f.hooks.get=null;backend.write=write;const committed=(await h.session.local.get([Tasks.KEY]))[Tasks.KEY];
 assert.equal(committed.receipts.filter(id=>id===command.operationId).length,1);assert.equal(h.f.writes.length-writes,1);
 await h.controller.refresh();assert.strictEqual(h.controller.error,error);assert.strictEqual(h.controller.retryCommand,command);
 assert.equal(h.feedback.textContent,h.messages.tasksErrorWrite.message);await h.controller.retry();await settle();
 assert.equal(h.controller.error,null);assert.equal(h.controller.retryCommand,null);assert.equal(h.f.writes.length-writes,1,'receipt acknowledgement must not replay a committed write');
 assert.deepEqual((await h.session.local.get([Tasks.KEY]))[Tasks.KEY],committed);assert.deepEqual(h.f.providers,[]);
});
