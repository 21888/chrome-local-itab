const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {createDocument}=require('./helpers/task-dom-model');
const Workspaces=require('../shared/workspaces');
const Scratchpad=require('../shared/local-scratchpad-store');
const copy=value=>structuredClone(value),NOW='2026-10-26T19:00:00Z',DEFER=Symbol('normal');
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

async function model(){
 const f=fixture({[Scratchpad.KEY]:{...Scratchpad.initial(),enabled:true,content:'Synthetic original note'}});
 const manager=f.manager();await manager.ready();const second=await manager.create('Second');
 const navigations=[];
 async function page(id){
  const session=manager.capture(id);await session.ready();
  const document=createDocument({blurUnavailableFocus:true});
  const window={document,LocalItabScratchpad:{...Scratchpad},LocalItabWorkspaces:{session},setTimeout,clearTimeout,
   addEventListener(){},removeEventListener(){},location:{href:'https://example.invalid/newtab.html'},URL,Blob};
  const context={window,document,setTimeout,clearTimeout,URL,Blob,console};vm.createContext(context);
  for(const file of ['shared/local-scratchpad-controller.js','shared/local-scratchpad-view.js','shared/local-content-lifecycle.js','shared/dialog-focus.js','shared/workspaces-view.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
  const host=document.createElement('article');document.body.append(host);
  const controller=new window.LocalItabScratchpad.Controller(new Scratchpad.Store(session.createBackend(Scratchpad.KEY)),{delay:60000});
  const view=window.localScratchpadView=new window.LocalItabScratchpad.View(host,{controller});await controller.init();
  const switcher=document.createElement('section'),managerHost=document.createElement('section');document.body.append(switcher,managerHost);
  const picker=window.workspacesView=window.LocalItabWorkspacesView.mount({switcher,managerHost,manager,session,lifecycle:window.LocalItabContentLifecycle,navigate:id=>navigations.push(id)});await picker.ready;
  return{session,document,window,controller,view,picker,button(text){return document.querySelectorAll('button').find(n=>n.textContent===text)},edit(value){view.textarea.value=value;view.textarea.dispatch('input');},close(){picker.destroy();view.destroy();}};
 }
 return{f,manager,second,navigations,page};
}
const tick=()=>new Promise(r=>setTimeout(r,20));
test('actual workspace picker/lifecycle/Scratchpad: Stay retains draft, Save and switch persists exact text across return',async()=>{
 const m=await model(),a=await m.page('default');
 const untouched=copy((await m.manager.capture(m.second.id).local.get(null)));
 const draft='Synthetic edit \n中文 👩‍💻';a.edit(draft);await a.picker.requestSwitch(m.second.id);
 assert.equal(m.navigations.length,0);assert.equal(a.controller.draft,draft);
 a.button('Stay here').dispatch('click');assert.equal(a.controller.draft,draft);
 await a.picker.requestSwitch(m.second.id);a.button('Save and switch').dispatch('click');await tick();
 assert.deepEqual(m.navigations,[m.second.id]);assert.equal(a.controller.draft,draft);a.close();
 assert.deepEqual(await m.manager.capture(m.second.id).local.get(null),untouched);
 const b=await m.page(m.second.id);assert.notEqual(b.controller.draft,draft);await b.picker.requestSwitch('default');assert.deepEqual(m.navigations,[m.second.id,'default']);b.close();
 const returned=await m.page('default');assert.equal(returned.controller.draft,draft);assert.equal(returned.view.textarea.value,draft);returned.close();assert.deepEqual(m.f.providers,[]);
});

test('actual Save and switch: failed storage retains original workspace draft and never navigates',async()=>{
 const m=await model(),a=await m.page('default');a.edit('Synthetic unsaved after failure');
 await a.picker.requestSwitch(m.second.id);
 m.f.hooks.set=async()=>{throw Error('synthetic storage failure')};
 a.button('Save and switch').dispatch('click');await tick();
 assert.deepEqual(m.navigations,[]);assert.equal(a.controller.draft,'Synthetic unsaved after failure');assert(a.controller.writeError);
 assert(a.button('Stay here'));assert(!a.button('Stay here').disabled);a.close();
});

test('actual Save and switch: newer typing during submitted write is retained and prevents departure',async()=>{
 const m=await model(),a=await m.page('default');a.edit('Synthetic first draft');await a.picker.requestSwitch(m.second.id);
 let release,entered;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 m.f.hooks.set=async(values)=>{if(Object.keys(values).some(k=>k.startsWith(Workspaces.PREFIX))){entered();await gate;}return DEFER;};
 a.button('Save and switch').dispatch('click');await started;
 const submitted=m.f.writes.length;a.button('Save and switch').dispatch('click');assert.equal(m.f.writes.length,submitted);
 a.edit('Synthetic newer draft');release();await tick();
 assert.deepEqual(m.navigations,[]);assert.equal(a.controller.draft,'Synthetic newer draft');assert(a.controller.dirty());
 assert.equal((await a.session.local.get([Scratchpad.KEY]))[Scratchpad.KEY].content,'Synthetic first draft');
 assert(a.button('Stay here'));assert(!a.button('Stay here').disabled);
 m.f.hooks.set=null;a.button('Save and switch').dispatch('click');await tick();
 assert.deepEqual(m.navigations,[m.second.id]);assert.equal((await a.session.local.get([Scratchpad.KEY]))[Scratchpad.KEY].content,'Synthetic newer draft');a.close();
});
