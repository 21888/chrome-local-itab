const test = require('node:test');
const assert = require('node:assert/strict');
const StorageManager = require('../storage.js');
const Organizer = require('../shared/shortcut-organizer.js');
const clone = value => JSON.parse(JSON.stringify(value));
function model(extra = {}) {
    let state = { links: [0,1,2].map(i => ({ title: 'Twin', url: 'https://example.com/', icon: '★', category: i === 2 ? 'orphan' : 'work', extra: { i } })),
        categories: [{ id: 'work', name: 'Work', extra: 1 }, { id: 'personal', name: 'Personal' }],
        layout: { autoArrange: false, positions: {'all|https://example.com/': { x: 9, y: 4 }} }, arbitrary: { untouched: true }, ...extra };
    const m = new StorageManager(); m._syncInitialized = true; let writes = 0, failure, readFailure = false, afterWrite, queue = Promise.resolve();
    m.withLocalWriteLock = work => { const result = queue.then(work); queue = result.catch(() => {}); return result; };
    Object.defineProperty(m, '_local', {value: { async get() { if (readFailure) throw new Error('read unavailable'); return clone(state); }, async set(values) {
        writes++; if (failure === 'before') throw new Error('failed'); Object.assign(state, clone(values)); afterWrite?.(); if (failure === 'after') throw new Error('uncertain');
    } }}); m.scheduleShortcutUndoSync = async () => {};
    return { m, get state() { return state; }, get writes() { return writes; }, set failure(v) { failure = v; }, set readFailure(v) { readFailure = v; }, set afterWrite(v) { afterWrite = v; },
        async plan(indices = [1]) { return Organizer.plan(await m.readShortcutOrganizerSnapshot(), indices, 'personal'); } };
}
test('atomic move preserves full objects, missing IDs, twins, order and source categories', async () => {
    const h = model(), before = clone(h.state), request = await h.plan([1,2]);
    const snapshot = await h.m.moveShortcutsToCategory(request); const expected = clone(before); expected.links[1].category = expected.links[2].category = 'personal';
    assert.deepEqual(h.state, expected); assert.deepEqual(snapshot.links, expected.links); assert.equal(h.writes, 1);
    await h.m.moveShortcutsToCategory(request); assert.equal(h.writes, 1);
    assert.deepEqual(Organizer.groups({links: before.links, categories: before.categories}).map(g => [g.id,g.orphaned]), [['work',false],['orphan',true]]);
});
test('identity-bearing twins preserve all coordinate maps and IDs', async () => {
    const ids = [1,2].map(n => 'l_' + String(n).padStart(32,'0'));
    const h = model({ schemaVersion: 2, links: ids.map(layoutId => ({ title:'Twin',url:'https://example.com/',icon:'★',category:'work',layoutId })),
        layout: { identityVersion: 1, autoArrange: false, positions: {}, positionsById: Object.fromEntries(ids.map(id => [id,{all:{x:1,y:2},work:{x:3,y:4},personal:{x:5,y:6}}])) } });
    const before=clone(h.state), p=await h.plan(); await h.m.moveShortcutsToCategory(p); before.links[1].category='personal'; assert.deepEqual(h.state,before);
});
for (const [name, mutate] of Object.entries({ source:s=>s.links[1].icon='new', reorder:s=>s.links.reverse(), destination:s=>s.categories[1].name='renamed', deleted:s=>s.categories.pop(), imports:s=>s.__localItabLayoutGeneration='new', layout:s=>s.layout.positions.new={x:1,y:2}, schema:s=>s.schemaVersion=8 })) {
    test(`reject stale ${name} without mutation`, async () => { const h=model(),p=await h.plan(); mutate(h.state); const before=clone(h.state); await assert.rejects(h.m.moveShortcutsToCategory(p),{code:'ORGANIZER_CONFLICT'}); assert.deepEqual(h.state,before);assert.equal(h.writes,0); });
}
test('concurrent requests serialize and stale second request cannot overwrite first', async () => {
    const h=model(),a=await h.plan([0]),b=await h.plan([1]); const results=await Promise.allSettled([h.m.moveShortcutsToCategory(a),h.m.moveShortcutsToCategory(b)]);
    assert.equal(results[0].status,'fulfilled');assert.equal(results[1].reason.code,'ORGANIZER_CONFLICT');assert.equal(h.writes,1);
});
test('repeated submit shares delayed write and ignores caller mutation after submission', async () => {
    const h=model(),p=await h.plan(); let release; const original=h.m._local.set; h.m._local.set=async v=>{ await new Promise(r=>release=r); await original(v); };
    const a=h.m.moveShortcutsToCategory(p),b=h.m.moveShortcutsToCategory(p); await new Promise(setImmediate); p.indices=[0]; release(); await Promise.all([a,b]); assert.equal(h.writes,1);assert.equal(h.state.links[1].category,'personal');assert.equal(h.state.links[0].category,'work');
});
test('failed write retries same review, while uncertain successful write is verified without repeat', async () => {
    const h=model(),p=await h.plan(),before=clone(h.state); h.failure='before'; await assert.rejects(h.m.moveShortcutsToCategory(p),{code:'ORGANIZER_FAILED'});assert.deepEqual(h.state,before);
    h.failure='after';await h.m.moveShortcutsToCategory(p);assert.equal(h.writes,2);await h.m.moveShortcutsToCategory(p);assert.equal(h.writes,2);
});
test('readback uncertainty retries read first, never duplicates a committed mutation', async () => {
    const h=model(),p=await h.plan(); h.afterWrite=()=>h.readFailure=true;
    await assert.rejects(h.m.moveShortcutsToCategory(p),{code:'ORGANIZER_UNVERIFIED'}); assert.equal(h.writes,1);
    h.readFailure=false;await h.m.moveShortcutsToCategory(p);assert.equal(h.writes,1);
});
test('a change following uncertain write is never overwritten by retry', async () => {
    const h=model(),p=await h.plan();h.afterWrite=()=>h.state.links[0].title='Concurrent edit';await assert.rejects(h.m.moveShortcutsToCategory(p),{code:'ORGANIZER_UNVERIFIED'});
    const before=clone(h.state);await assert.rejects(h.m.moveShortcutsToCategory(p),{code:'ORGANIZER_CONFLICT'});assert.deepEqual(h.state,before);assert.equal(h.writes,1);
});
test('requires real serialization and valid review selections',async()=>{
    const h=model(),s=await h.m.readShortcutOrganizerSnapshot();assert.throws(()=>Organizer.plan(s,[],'personal'));assert.throws(()=>Organizer.plan(s,[0],'gone'));assert.throws(()=>Organizer.plan(s,[-1],'personal'));
    const prior=Object.getOwnPropertyDescriptor(global,'navigator');Object.defineProperty(global,'navigator',{configurable:true,value:{}});
    try {const m=new StorageManager();m._syncInitialized=true;await assert.rejects(m.readShortcutOrganizerSnapshot(),{code:'LINKS_LOCK_UNAVAILABLE'});}finally{if(prior)Object.defineProperty(global,'navigator',prior);else delete global.navigator;}
});
test('verified review cannot be replayed after an external restore of its old baseline',async()=>{
    const h=model(),before=clone(h.state),p=await h.plan();await h.m.moveShortcutsToCategory(p);Object.assign(h.state,before);
    await assert.rejects(h.m.moveShortcutsToCategory(p),{code:'ORGANIZER_CONFLICT'});assert.deepEqual(h.state,before);assert.equal(h.writes,1);
});
