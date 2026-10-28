const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createDocument}=require('./helpers/task-dom-model');
const Workspaces=require('../shared/workspaces'),Focus=require('../shared/local-focus-store');
const {Controller}=require('../shared/local-focus-controller');
const copy=value=>structuredClone(value),NOW='2026-10-28T23:20:00Z',DEFER=Symbol('normal');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(){for(let i=0;i<10;i++)await tick();}
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

async function model(t,{phase='focus',locale}={}){
 const initial=Focus.initial();initial.enabled=true;initial.session.phase=phase;initial.session.remainingMs=initial.durations[phase]*60000;
 const f=fixture({[Focus.KEY]:initial,quote:'Original workspace quote'}),manager=f.manager();await manager.ready();
 const second=await manager.create('Second'),session=manager.capture('default');await session.ready();
 const otherBefore=copy(await manager.capture(second.id).local.get(null));
 const document=createDocument(),host=document.createElement('article');document.body.append(host);
 let serial=0,timerId=0;const timers=new Map(),navigations=[];
 const controllerFor=s=>new Controller(new Focus.Store(s.createBackend(Focus.KEY),{now:()=>Date.parse(NOW),id:()=>`synthetic_run_${++serial}`}),{wall:()=>Date.parse(NOW),monotonic:()=>0});
 const controller=controllerFor(session),window={LocalItabFocus:{...Focus,Controller},LocalItabWorkspaces:{session},addEventListener(){},removeEventListener(){},
  setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);}};
 const messages=locale?JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`,'utf8')):null;
 if(messages)window.i18n={t:key=>messages[key]?.message||key};
 const context={window,document,setTimeout,clearTimeout};vm.createContext(context);
 for(const file of ['shared/dialog-focus.js','shared/local-focus-view.js','shared/local-content-lifecycle.js','shared/workspaces-view.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
 const view=window.localFocusView=new window.LocalItabFocus.View(host,{controller});await settle();
 const switcher=document.createElement('section'),managerHost=document.createElement('section');document.body.append(switcher,managerHost);
 const picker=window.workspacesView=window.LocalItabWorkspacesView.mount({switcher,managerHost,manager,session,lifecycle:window.LocalItabContentLifecycle,navigate:id=>navigations.push(id)});await picker.ready;
 const otherSession=manager.capture('default');await otherSession.ready();const other=controllerFor(otherSession);await other.refresh();
 t.after(()=>{picker.destroy();view.destroy();other.destroy();});
 return{f,manager,second,session,otherBefore,controller,controllerFor,view,window,document,picker,other,navigations,messages,
  type(value){view.minutes.value=value;view.minutes.dispatch('input');},
  button(text){const n=document.querySelectorAll('button').find(node=>node.textContent===text);assert(n,text);return n;},
  async saved(){return (await session.local.get([Focus.KEY]))[Focus.KEY];}};
}

test('actual Save and switch must not write current Break when the sole retained draft belongs to Focus',async t=>{
 const h=await model(t);h.type('30');await h.other.action('phase','break');await settle();
 assert.equal(h.view.durationDrafts.size,1);assert.equal(h.view.durationDrafts.get('focus'),'30');assert.equal(h.view.minutes.value,'5');
 const before=copy(h.f.raw),writes=h.f.writes.length;
 await h.picker.requestSwitch(h.second.id);h.button('Save and switch').dispatch('click');await settle();
 assert.deepEqual(h.navigations,[]);assert.equal(h.view.durationDrafts.get('focus'),'30');
 assert.equal(h.f.writes.length,writes,'Save and switch cannot submit unchanged Break minutes in place of the retained Focus draft');
 assert.deepEqual(h.f.raw,before);assert(!h.button('Stay here').disabled);assert.deepEqual(h.f.providers,[]);
});


async function chooseSave(h){
 h.button('Save and switch').dispatch('click');
 for(let i=0;i<100&&h.picker.pending;i++)await new Promise(r=>setTimeout(r,5));
 assert(!h.picker.pending,'the bounded save decision must settle');await settle();
}

test('actual Save and switch also refuses the retained Break draft while Focus is current',async t=>{
 const h=await model(t,{phase:'break'});h.type('10');await h.other.action('phase','focus');await settle();
 const before=copy(h.f.raw),writes=h.f.writes.length;await h.picker.requestSwitch(h.second.id);await chooseSave(h);
 assert.equal(h.view.durationDrafts.get('break'),'10');assert.equal(h.view.minutes.value,'25');
 assert.deepEqual(h.f.raw,before);assert.equal(h.f.writes.length,writes);assert.deepEqual(h.navigations,[]);
});

for(const phase of ['focus','break'])test(`actual current ${phase} draft saves once, switches and returns without starting a timer`,async t=>{
 const h=await model(t,{phase}),draft=phase==='focus'?'30':'10',initial=await h.saved();
 const retained=Object.fromEntries(Object.entries(copy(h.f.raw)).filter(([key])=>!key.startsWith(Workspaces.PREFIX)&&key!==Workspaces.REGISTRY_KEY));h.type(draft);
 await h.picker.requestSwitch(h.second.id);await chooseSave(h);assert.deepEqual(h.navigations,[h.second.id]);
 const saved=await h.saved();assert.equal(saved.revision,initial.revision+1);assert.equal(saved.durations[phase],Number(draft));
 assert.equal(saved.durations[phase==='focus'?'break':'focus'],initial.durations[phase==='focus'?'break':'focus']);
 assert.equal(saved.session.status,'ready');assert.equal(saved.session.id,null);assert.equal(saved.session.deadline,null);
 assert.deepEqual(Object.fromEntries(Object.keys(retained).map(key=>[key,h.f.raw[key]])),retained,'legacy values and retained migration/recovery copies remain exact');
 assert.deepEqual(await h.manager.capture(h.second.id).local.get(null),h.otherBefore);
 h.picker.destroy();h.view.destroy();
 async function open(id){
  const session=h.manager.capture(id);await session.ready();h.window.LocalItabWorkspaces.session=session;
  const host=h.document.createElement('article');h.document.body.append(host);const controller=h.controllerFor(session);
  const view=h.window.localFocusView=new h.window.LocalItabFocus.View(host,{controller});t.after(()=>view.destroy());await settle();
  return{session,controller,view};
 }
 const other=await open(h.second.id),picker=h.window.LocalItabWorkspacesView.mount({switcher:h.document.createElement('section'),managerHost:h.document.createElement('section'),manager:h.manager,session:other.session,lifecycle:h.window.LocalItabContentLifecycle,navigate:id=>h.navigations.push(id)});
 t.after(()=>picker.destroy());await picker.ready;await picker.requestSwitch('default');assert.deepEqual(h.navigations,[h.second.id,'default']);picker.destroy();other.view.destroy();
 const returned=await open('default');assert.deepEqual(returned.controller.state,saved);assert.equal(returned.view.minutes.value,draft);assert.equal(returned.view.status.textContent,'Ready to start');
 assert.deepEqual(h.f.providers,[]);
});

test('retained other-phase draft can Stay, return deliberately to its phase, then Save and switch',async t=>{
 const h=await model(t);h.type('030');await h.other.action('phase','break');await settle();
 const before=copy(h.f.raw);await h.picker.requestSwitch(h.second.id);await chooseSave(h);assert.deepEqual(h.f.raw,before);
 h.button('Stay here').dispatch('click');h.view.phase.value='focus';h.view.phase.dispatch('change');await settle();
 assert.equal(h.view.minutes.value,'030');assert.equal(h.view.durationDrafts.get('focus'),'030');
 const ready=await h.saved();await h.picker.requestSwitch(h.second.id);await chooseSave(h);
 const saved=await h.saved();assert.deepEqual(h.navigations,[h.second.id]);assert.equal(saved.revision,ready.revision+1);
 assert.equal(saved.durations.focus,30);assert.equal(saved.durations.break,5);assert.equal(saved.session.status,'ready');assert(!h.view.hasUncommittedWork());
});

test('two phase-bound drafts stay intact until their original editors are deliberately saved',async t=>{
 const h=await model(t);h.type('30');await h.other.action('phase','break');await settle();h.type('10');
 const before=copy(h.f.raw),writes=h.f.writes.length;await h.picker.requestSwitch(h.second.id);await chooseSave(h);
 assert.deepEqual(Array.from(h.view.durationDrafts,([phase,value])=>[phase,value]),[['focus','30'],['break','10']]);assert.deepEqual(h.f.raw,before);assert.equal(h.f.writes.length,writes);assert.deepEqual(h.navigations,[]);
 h.button('Stay here').dispatch('click');h.view.saveMinutes.dispatch('click');await settle();assert.equal((await h.saved()).durations.break,10);
 h.view.phase.value='focus';h.view.phase.dispatch('change');await settle();await h.picker.requestSwitch(h.second.id);await chooseSave(h);
 assert.deepEqual(h.navigations,[h.second.id]);assert.deepEqual((await h.saved()).durations,{focus:30,break:10});
});

for(const value of ['', '0', '181', '1.5'])test(`invalid current minutes ${JSON.stringify(value)} are neither normalized away nor submitted by Save and switch`,async t=>{
 const h=await model(t);h.type(value);const before=copy(h.f.raw),writes=h.f.writes.length;
 await h.picker.requestSwitch(h.second.id);await chooseSave(h);
 assert.equal(h.view.minutes.value,value);assert.equal(h.view.durationDrafts.get('focus'),value);assert.deepEqual(h.navigations,[]);
 assert.equal(h.f.writes.length,writes);assert.deepEqual(h.f.raw,before);assert(!h.button('Stay here').disabled);
});

test('failed current-phase save retains raw minutes and workspace; later explicit Save and switch can recover',async t=>{
 const h=await model(t);h.type('030');const before=copy(h.f.raw),initial=await h.saved();
 await h.picker.requestSwitch(h.second.id);h.f.hooks.set=async()=>{throw Error('synthetic backing write rejection')};await chooseSave(h);
 assert.deepEqual(h.navigations,[]);assert.deepEqual(h.f.raw,before);assert.equal(h.controller.error?.code,'WRITE');assert.equal(h.view.durationDrafts.get('focus'),'030');
 h.f.hooks.set=null;await chooseSave(h);const saved=await h.saved();
 assert.deepEqual(h.navigations,[h.second.id]);assert.equal(saved.revision,initial.revision+1);assert.equal(saved.durations.focus,30);assert.equal(saved.session.status,'ready');
});

test('real stale revision conflict cannot turn a later Save and switch into a wrong-phase write',async t=>{
 const h=await model(t);h.type('30');h.controller.unsubscribe();
 await h.other.action('phase','break');await settle();const before=copy(h.f.raw),writes=h.f.writes.length;
 await h.picker.requestSwitch(h.second.id);await chooseSave(h);assert.equal(h.controller.error?.code,'CONFLICT');
 assert.equal(h.controller.state.session.phase,'break');assert.equal(h.view.durationDrafts.get('focus'),'30');assert.deepEqual(h.navigations,[]);
 await chooseSave(h);assert.equal(h.f.writes.length,writes);assert.deepEqual(h.f.raw,before);assert.equal(h.view.durationDrafts.get('focus'),'30');
});


test('a newer phase change after returning to the draft cannot authorize Save and switch for the old phase',async t=>{
 const h=await model(t);h.type('30');await h.other.action('phase','break');await settle();
 await h.picker.requestSwitch(h.second.id);await chooseSave(h);h.button('Stay here').dispatch('click');
 h.view.phase.value='focus';h.view.phase.dispatch('change');await settle();assert.equal(h.view.minutes.value,'30');
 await h.picker.requestSwitch(h.second.id);await h.other.refresh();await h.other.action('phase','break');await settle();
 const before=copy(h.f.raw),writes=h.f.writes.length,revision=h.controller.state.revision;await chooseSave(h);
 assert.equal(h.controller.state.session.phase,'break');assert.equal(h.controller.state.revision,revision);
 assert.deepEqual(h.f.raw,before);assert.equal(h.f.writes.length,writes);assert.equal(h.view.durationDrafts.get('focus'),'30');assert.deepEqual(h.navigations,[]);
 h.button('Stay here').dispatch('click');h.view.phase.value='focus';h.view.phase.dispatch('change');await settle();const original=await h.saved();
 await h.picker.requestSwitch(h.second.id);await chooseSave(h);const saved=await h.saved();
 assert.deepEqual(h.navigations,[h.second.id]);assert.equal(saved.revision,original.revision+1);assert.equal(saved.session.phase,'focus');assert.equal(saved.durations.focus,30);assert.equal(saved.durations.break,5);
});

for(const locale of ['en','zh_CN'])test(`retained minutes explain the original-interval Save path without applying it automatically: ${locale}`,async t=>{
 const h=await model(t,{locale});h.type('30');await h.other.action('phase','break');await settle();
 const before=copy(h.f.raw),writes=h.f.writes.length;assert.equal(h.view.feedback.textContent,h.messages.focusDraftRetained.message);
 assert(h.view.feedback.textContent.includes(h.messages.focusPhase.message));assert(h.view.feedback.textContent.includes(h.messages.focusSaveMinutes.message));
 assert.equal(await h.window.LocalItabContentLifecycle.saveDrafts(),false);assert.deepEqual(h.f.raw,before);assert.equal(h.f.writes.length,writes);
 h.view.phase.value='focus';h.view.phase.dispatch('change');await settle();assert.equal(h.view.minutes.value,'30');
 h.view.saveMinutes.dispatch('click');await settle();assert.equal((await h.saved()).durations.focus,30);assert(!h.view.hasUncommittedWork());assert.deepEqual(h.f.providers,[]);
});

test('a clean running timer permits workspace departure without pausing, restarting or changing its deadline',async t=>{
 const h=await model(t);h.view.start.dispatch('click');await settle();const running=await h.saved();assert.equal(running.session.status,'running');
 await h.picker.requestSwitch(h.second.id);assert.deepEqual(h.navigations,[h.second.id]);assert.deepEqual(await h.saved(),running);
 assert.deepEqual(await h.manager.capture(h.second.id).local.get(null),h.otherBefore);
 h.picker.destroy();h.view.destroy();const returned=h.manager.capture('default');await returned.ready();const controller=h.controllerFor(returned);t.after(()=>controller.destroy());
 await controller.refresh();assert.deepEqual(controller.state,running);assert.equal(controller.snapshot().session.status,'running');assert.deepEqual(h.f.providers,[]);
});

test('retained minutes during a remotely started interval cannot make Save and switch stop or rewrite the timer',async t=>{
 const h=await model(t);h.type('30');await h.other.action('start');await settle();
 const before=copy(h.f.raw),writes=h.f.writes.length,running=await h.saved();assert.equal(h.controller.state.session.status,'running');
 await h.picker.requestSwitch(h.second.id);await chooseSave(h);
 assert.deepEqual(h.navigations,[]);assert.equal(h.view.durationDrafts.get('focus'),'30');assert.equal(h.view.minutes.value,'25');
 assert.deepEqual(await h.saved(),running);assert.deepEqual(h.f.raw,before);assert.equal(h.f.writes.length,writes);assert(!h.button('Stay here').disabled);
});
