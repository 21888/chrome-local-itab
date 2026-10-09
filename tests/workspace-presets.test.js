const { test } = require('node:test');
const assert = require('node:assert/strict');
const tasks = require('../shared/local-tasks-store');
const focus = require('../shared/local-focus-store');
const presets = require('../shared/workspace-presets');
const templates = require('../shared/dashboard-template-registry');
const StorageManager = require('../storage');
const clone = value => structuredClone(value);
function harness() {
    const data = {}, listeners = new Set(), queues = new Map(), writes = [], remote = [], locksUsed = [];
    let fail = '', readFailure = false;
    const locks = { request(name, options, fn) { fn ||= options; locksUsed.push(name); const next = (queues.get(name) || Promise.resolve()).then(fn); queues.set(name, next.catch(() => {})); return next; } };
    const chrome = { storage: { local: {
        async get(keys) { if (readFailure) throw Error('read'); return keys === null ? clone(data) : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).filter(key => key in data).map(key => [key, clone(data[key])])); },
        async set(values) {
            writes.push(clone(values)); if (fail === 'before') throw Error('write');
            const changes = {}; for (const [key, value] of Object.entries(values)) { data[key] = clone(value); changes[key] = {newValue: clone(value)}; if (fail === 'partial') throw Error('partial'); }
            listeners.forEach(fn => fn(changes, 'local')); if (fail === 'after') throw Error('ack');
        },
        async remove(keys) { for (const key of keys) delete data[key]; }
    }, sync: { async get() { remote.push('get'); return {}; }, async set() { remote.push('set'); }, async remove() { remote.push('remove'); } }, onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } } };
    const store = new presets.Store(presets.createBackend(chrome, locks));
    return { data, writes, locks, locksUsed, chrome, store, remote, fail: value => fail = value, failRead: value => readFailure = value };
}
async function seed(h) {
    const taskStore = new tasks.Store(tasks.createChromeBackend(h.chrome, h.locks), { id: () => 'task-version-0001', now: () => '2026-10-09T00:00:00.000Z' });
    await taskStore.mutate({kind: 'add', text: 'PRIVATE_TASK_SENTINEL', operationId: 'task-operation-0001'});
    const timer = new focus.Store(focus.createChromeBackend(h.chrome, h.locks), { now: () => 10000, id: () => 'PRIVATE_SESSION_SENTINEL' });
    await timer.mutate({kind: 'start', revision: 0});
    h.data.appearance = {template: 'folio', colorMode: 'dark'};
    h.data.links = [{title: 'Keep', url: 'https://example.com'}];
    h.data.layout = {autoArrange: false, positions: {'keep': {x: 42, y: 19}}};
    h.data.sync = {enabled: true}; return {taskStore, timer};
}
test('15 explicit presets change only visibility/revision; no-op repeat writes nothing; hidden timer continues', async () => {
    const h = harness(); await seed(h); const original = clone(h.data);
    for (const entry of templates.all) {
        assert(Object.isFrozen(entry.recommendedWorkspace));
        const preview = await h.store.prepare(entry.id); await h.store.apply(preview);
        for (const [name, api] of [['tasks',tasks],['focus',focus]]) {
            assert.equal(h.data[api.KEY].enabled,entry.recommendedWorkspace[name]);
            const current = clone(h.data[api.KEY]), before = clone(original[api.KEY]); delete current.enabled; delete current.revision; delete before.enabled; delete before.revision;
            assert.deepEqual(current,before);
        }
        for (const key of ['appearance','links','layout','sync']) assert.deepEqual(h.data[key],original[key]);
        const count = h.writes.length; assert.equal((await h.store.apply(await h.store.prepare(entry.id))).changed,false); assert.equal(h.writes.length,count);
    }
    await h.store.apply(await h.store.prepare('clarity'));
    assert.equal(focus.project(h.data[focus.KEY], 30000).session.remainingMs,1480000);
    assert.equal(h.data[focus.KEY].session.status,'running'); assert.equal(h.data[focus.KEY].enabled,false);
    assert.deepEqual(h.remote,[]);
});
test('preview/cancel writes nothing, rejects invalid IDs and queued cancellation',async()=>{
 const h=harness(), p=await h.store.prepare('studio'); assert.equal(h.writes.length,0);
 await assert.rejects(h.store.apply(p,()=>false),{code:'CANCELLED'}); await assert.rejects(h.store.prepare('unknown'),{code:'INVALID'}); assert.equal(h.writes.length,0);
 assert.deepEqual(h.locksUsed.slice(0,2),[tasks.LOCK,focus.LOCK]);
});
test('task edits, timer transitions, stale previews and competing preset writes are not overwritten',async()=>{
 const h=harness(),{taskStore,timer}=await seed(h); const p=await h.store.prepare('studio');
 await taskStore.mutate({kind:'add',text:'Newer task',operationId:'task-operation-0002'});
 await assert.rejects(h.store.apply(p),{code:'CONFLICT'});
 const q=await h.store.prepare('studio'); await timer.mutate({kind:'pause',revision:h.data[focus.KEY].revision});
 await assert.rejects(h.store.apply(q),{code:'CONFLICT'});
 const a=await h.store.prepare('studio'),b=await h.store.prepare('studio');
 const outcomes=await Promise.allSettled([h.store.apply(a),h.store.apply(b)]);
 assert.equal(outcomes[0].status,'fulfilled'); assert.equal(outcomes[1].reason.code,'CONFLICT');
 assert.equal(h.data[tasks.KEY].records.length,2); assert.equal(h.data[focus.KEY].session.status,'paused');
});
for(const failure of ['before','partial','after'])test(`uncertain ${failure} write is not retried or rolled back; fresh preview reflects saved state`,async()=>{
 const h=harness(),p=await h.store.prepare('studio'); h.fail(failure);
 await assert.rejects(h.store.apply(p),{code:'UNCONFIRMED'}); assert.equal(h.writes.length,1);
 h.fail('');const latest=await h.store.prepare('studio');
 assert.equal(latest.before.tasks.enabled,failure!=='before'); assert.equal(latest.before.focus.enabled,failure==='after');
 await h.store.apply(latest); assert.equal(h.data[tasks.KEY].enabled,true);assert.equal(h.data[focus.KEY].enabled,true);
});
test('corrupt/future state, failed reads and missing locks fail closed',async()=>{
 const h=harness(); h.data[focus.KEY]={schemaVersion:99}; await assert.rejects(h.store.prepare('studio')); assert.equal(h.writes.length,0);
 delete h.data[focus.KEY]; const p=await h.store.prepare('studio');h.failRead(true);await assert.rejects(h.store.apply(p));assert.equal(h.writes.length,0);
 assert.throws(()=>presets.createBackend(h.chrome,{}),{code:'UNAVAILABLE'});
});
test('settings export, Drive, Sync, restore and reset keep the established personal-data boundary',async()=>{
 const h=harness();await seed(h);await h.store.apply(await h.store.prepare('studio'));
 const oldChrome=global.chrome, oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');global.chrome=h.chrome;Object.defineProperty(globalThis,'navigator',{value:{locks:h.locks},configurable:true});
 try {
  const manager=new StorageManager(); const saved=clone(h.data);
  for(const payload of [manager.sanitizeConfigForBackup(h.data),manager.buildManualExportPayload(h.data),manager.buildDriveBackupPayload(h.data),manager.prepareSyncPayload(h.data),await manager.makeRecovery(h.data,'beforeRestore')]) {
   for(const sentinel of [tasks.KEY,focus.KEY,'PRIVATE_TASK_SENTINEL','PRIVATE_SESSION_SENTINEL'])assert(!JSON.stringify(payload).includes(sentinel));
  }
  const restored=manager.prepareRestoredConfig(manager.buildManualExportPayload(manager.cloneDefaultConfig()),{sync:{enabled:false}});
  assert.equal(await manager.setAll(restored,{skipSyncInitialization:true,skipSyncSideEffects:true,confirmedRestore:true}),true);
  assert.deepEqual(h.data[tasks.KEY],saved[tasks.KEY]);assert.deepEqual(h.data[focus.KEY],saved[focus.KEY]);
  h.data.sync={enabled:false};assert.equal(await manager.clear(),true);
  assert.deepEqual(h.data[tasks.KEY],saved[tasks.KEY]);assert.deepEqual(h.data[focus.KEY],saved[focus.KEY]);assert.deepEqual(h.remote,[]);
 }finally{global.chrome=oldChrome;if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;}
});
module.exports = {harness};
