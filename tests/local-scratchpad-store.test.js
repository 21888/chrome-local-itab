const { test } = require('node:test');
const assert = require('node:assert/strict');
const api = require('../shared/local-scratchpad-store');
const { Controller } = require('../shared/local-scratchpad-controller');
function harness() {
    let raw, writes = 0, failRead = false, failWrite = false, verify = false, tail = Promise.resolve(), hold;
    const listeners = new Set();
    const backend = {
        lock(fn) { const result = tail.then(fn); tail = result.catch(() => {}); return result; },
        async read() { if (failRead) throw Error(); return structuredClone(raw); },
        async write(value) { if (hold) await hold; if (failWrite) throw Error(); raw = structuredClone(value); writes++; if (verify) raw.content += '!'; listeners.forEach(fn => fn()); },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    };
    return { backend, store: () => new api.Store(backend), controller: () => new Controller(new api.Store(backend), { delay: 5 }),
        get raw() { return raw; }, set raw(v) { raw = v; }, get writes() { return writes; }, readFail(v) { failRead = v; }, writeFail(v) { failWrite = v; }, verifyFail(v) { verify = v; }, hold(p) { hold = p; },
        notify() { listeners.forEach(fn => fn()); }, flush: () => new Promise(r => setTimeout(r, 30)) };
}
test('scratchpad starts off, validates Unicode code points, whitespace and limits without truncation', async () => {
    const h = harness(), s = h.store(); assert.deepEqual(await s.read(), api.initial()); assert.equal(h.writes, 0);
    const value = ' \t\n<script>x</script>\n[link](https://example.com) 😀\r\n';
    let state = await s.mutate({kind:'content', value, revision:0}); assert.equal(state.content, value);
    state = await s.mutate({kind:'content',value:'😀'.repeat(32000),revision:1}); assert.equal(Array.from(state.content).length,32000);
    for (const value of ['x'.repeat(32001),'😀'.repeat(32001),'\uD800']) await assert.rejects(s.mutate({kind:'content',value,revision:2}));
    assert.equal(h.writes,2); assert.equal(api.LIMITS.bytes,131072);
});
test('corrupt saved data is never replaced by blank or visibility command', async () => {
    for (const bad of [null,{}, {...api.initial(), content: 4}, {...api.initial(),revision:-1}, {...api.initial(),extra:1}, {...api.initial(), content:'x'.repeat(32001)}]) {
        const h=harness(); h.raw=bad; await assert.rejects(h.store().read()); await assert.rejects(h.store().mutate({kind:'visibility',value:true,revision:0})); assert.equal(h.writes,0);
    }
});
test('revision CAS serializes writers and verifies exact readback', async () => {
    const h=harness(); const result=await Promise.allSettled(['a','b'].map(value=>h.store().mutate({kind:'content',value,revision:0})));
    assert.equal(result.filter(r=>r.status==='fulfilled').length,1); assert.equal(h.writes,1);
    h.verifyFail(true); await assert.rejects(h.store().mutate({kind:'content',value:'c',revision:1}),{code:'VERIFY'});
    h.verifyFail(false); h.writeFail(true); await assert.rejects(h.store().mutate({kind:'visibility',value:true,revision:2}),{code:'WRITE'});
});
test('pending new edits stay visible and save serially; composing prevents autosave', async () => {
    const h=harness(),c=h.controller(); await c.init(); c.setComposing(true); c.setDraft('first'); await h.flush(); assert.equal(h.writes,0);
    let release; h.hold(new Promise(r=>release=r)); c.setComposing(false); await new Promise(r=>setTimeout(r,10)); assert.equal(c.pending,true);
    c.setDraft('second'); assert.equal(c.draft,'second'); assert(c.hasUncommittedWork()); release(); h.hold(null); await h.flush();
    assert.equal(h.raw.content,'second'); assert.equal(c.status,'saved'); assert.equal(c.hasUncommittedWork(),false); assert.equal(h.writes,2); c.destroy();
});
test('clean other-tab changes load, dirty changes conflict; replace cannot overwrite further unseen update', async () => {
    const h=harness(),a=h.controller(),b=h.controller(); await Promise.all([a.init(),b.init()]);
    a.setDraft('saved'); await h.flush(); assert.equal(b.draft,'saved');
    b.setComposing(true); b.setDraft('local draft'); a.setDraft('remote'); await h.flush(); assert.equal(b.draft,'local draft'); assert(b.conflict);
    b.setComposing(false); await h.flush(); assert.equal(h.raw.content,'remote');
    // Simulate an update committed before its change notification reaches this page.
    h.raw={...h.raw,revision:h.raw.revision+1,content:'newer'};
    await assert.rejects(b.replaceWithDraft(),{code:'CONFLICT'}); assert.equal(h.raw.content,'newer'); assert.equal(b.draft,'local draft');
    await b.replaceWithDraft(); assert.equal(h.raw.content,'local draft'); a.destroy(); b.destroy();
});
test('failed load retry, failed write retains draft, explicit use saved, no hidden dirty editor', async () => {
    const h=harness(),c=h.controller(); h.readFail(true); await assert.rejects(c.init()); assert.equal(c.loaded,false); assert.equal(h.writes,0);
    h.readFail(false); await c.retry(); c.setDraft('keep'); h.writeFail(true); await h.flush(); assert(c.error); assert.equal(c.draft,'keep'); assert(c.hasUncommittedWork());
    h.writeFail(false); await c.retry(); assert.equal(h.raw.content,'keep'); assert.equal(c.error,null);
    c.setComposing(true); c.setDraft('dirty'); await h.store().mutate({kind:'visibility',value:false,revision:h.raw.revision}); await h.flush();
    assert(c.conflict); assert(c.hasUncommittedWork()); assert.equal(c.draft,'dirty'); c.setComposing(false); await c.useSaved(); assert.equal(c.draft,'keep'); assert(!c.hasUncommittedWork()); c.destroy();
});
test('uncertain acknowledgement requires retry and verifies saved draft without replay', async () => {
    const h=harness(),c=h.controller(); await c.init();
    const original=h.backend.write; h.backend.write=async v=>{await original(v); h.readFail(true);}; c.setDraft('already written'); await h.flush(); assert(c.error); assert.equal(h.writes,1);
    h.readFail(false); h.backend.write=original; await c.retry(); assert.equal(h.writes,1); assert.equal(c.status,'saved'); assert(!c.hasUncommittedWork()); c.destroy();
});
