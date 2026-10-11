const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../shared/local-prompts-store.js');
const copy = value => value === undefined ? undefined : structuredClone(value);
function backend() {
    let raw, queue = Promise.resolve(); const listeners = new Set();
    return {
        writes: 0, failRead: false, failWrite: false, throwWrite: false, failVerify: false, corruptWrite: false, delay: null,
        lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() { if (this.failRead) throw Error('private detail'); return copy(raw); },
        async write(value) {
            this.writes++; if (this.delay) await this.delay;
            if (this.throwWrite) throw Error('private detail'); if (this.failWrite) return false;
            raw = copy(value); if (this.corruptWrite) raw.enabled = !raw.enabled;
            if (this.failVerify) { this.failVerify = false; this.failRead = true; }
            listeners.forEach(fn => fn());
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        raw() { return copy(raw); }, corrupt(value) { raw = copy(value); }
    };
}
let fixtureId = 0;
function fixture() {
    const b = backend(), prefix = ++fixtureId; let sequence = 0, time = '2026-10-10T19:00:00.000Z';
    const options = { id: () => `identity_${prefix}_${++sequence}`, now: () => time };
    return { b, a: new api.Store(b, options), c: new api.Store(b, options), setTime(value) { time = value; } };
}
const add = (store, body = 'Write about {{topic}}', rest = {}) => store.mutate(store.request('add', { title: 'Prompt', body, ...rest }));
const command = (store, kind, record, rest = {}) => store.request(kind, { id: record.id, version: record.version, ...rest });
const replace = async (store, source) => store.mutate(store.request('replace', await store.review(source)));


test('request rejects own getters and toJSON without executing them',()=>{
    const {a}=fixture();let calls=0;
    for(const values of [{title:'A',get body(){calls++;return 'body';}},{title:'A',body:'body',toJSON(){calls++;return {};}}]) assert.throws(()=>a.request('add',values));
    assert.equal(calls,0);
});
test('raw validation, template preview, search, counts and draft cloning reject accessors without running them',async()=>{
    const {a}=fixture();const state=await add(a);let calls=0;
    const evil=()=>{const value=copy(state);Object.defineProperty(value.records[0],'body',{enumerable:true,get(){calls++;return 'secret';}});return value;};
    for(const action of [()=>api.validate(evil()),()=>api.search(evil()),()=>api.counts(evil()),()=>api.createDraft(evil().records[0]),()=>api.getVersion(evil(),'record_id','version_id'),()=>api.content(evil()),()=>api.previewTemplate('{{x}}',{get x(){calls++;return 'secret';}}),()=>api.previewTemplate('x',{}, {get literal(){calls++;return true;}})])assert.throws(action);
    assert.equal(calls,0);
});
test('nonplain, cyclic, sparse, function, symbol and hidden inputs fail before storage',async()=>{
    const {a,b}=fixture();const cyclic={};cyclic.self=cyclic;const hidden={title:'A',body:'B'};Object.defineProperty(hidden,'secret',{value:'hidden'});
    const symbol={title:'A',body:'B',[Symbol('x')]:'x'};
    for(const tags of [new Array(2),[()=>{}],new Date(),cyclic,new (class X {})()])assert.throws(()=>a.request('add',{title:'A',body:'B',tags}));
    assert.throws(()=>a.request('add',hidden));assert.throws(()=>a.request('add',symbol));assert.equal(b.writes,0);
});
test('committed operation ID cannot be substituted with a different payload; exact owned command retries remain valid',async()=>{
    const {a,c,b}=fixture(),request=a.request('add',{title:'A',body:'body'});const first=await a.mutate(request),writes=b.writes;
    await assert.rejects(a.mutate({...request,title:'different'}),error=>error.code==='CONFLICT');assert.equal(b.writes,writes);
    assert.deepEqual(await c.mutate({...request}),first);assert.equal(b.writes,writes);
    const reordered={body:request.body,title:request.title,kind:request.kind,operationId:request.operationId};assert.deepEqual(await a.mutate(reordered),first);
});
test('mutation rejects a getter on operationId before accessing it',async()=>{
    const {a,b}=fixture();let calls=0;await assert.rejects(a.mutate({get operationId(){calls++;return 'operation_id';},kind:'add',title:'A',body:'B'}));assert.equal(calls,0);assert.equal(b.writes,0);
});
