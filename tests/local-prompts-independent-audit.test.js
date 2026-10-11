const path = require('node:path');
const SOURCE_ROOT = process.env.PROMPT_AUDIT_SOURCE || path.resolve(__dirname, '..');
const {webcrypto} = require('node:crypto'); global.crypto=webcrypto;
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require(path.join(SOURCE_ROOT, 'shared/local-prompts-store.js'));
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


test('replayed exact command succeeds; changed title with same receipt is rejected',async()=>{
    const {a,b}=fixture(),request=a.request('add',{title:'Original',body:'Body'});
    await a.mutate(request);const before=b.raw(),writes=b.writes;
    assert.deepEqual(await a.mutate(Object.fromEntries(Object.entries(request).reverse())),before);
    await assert.rejects(a.mutate({...request,title:'Different'}),{code:'CONFLICT'});
    assert.deepEqual(b.raw(),before);assert.equal(b.writes,writes);
});

test('receipt binds kind, record target, body, metadata, unknown keys and enabled flag',async()=>{
    for(const altered of [c=>({...c,kind:'edit'}),c=>({...c,body:'Other'}),c=>({...c,id:'another_record'}),c=>({...c,favorite:true}),c=>({...c,extra:true})]){
        const {a,b}=fixture(),request=a.request('add',{title:'Title',body:'Body'});await a.mutate(request);const before=b.raw();
        await assert.rejects(a.mutate(altered(request)),{code:'CONFLICT'});assert.deepEqual(b.raw(),before);
    }
    const {a}=fixture(),request=a.request('enable',{revision:0,enabled:true});await a.mutate(request);
    await assert.rejects(a.mutate({...request,enabled:false}),{code:'CONFLICT'});
});

for(const entry of ['request','mutate','preview-values','preview-options','search-options','validate-state','validate-record','validate-content','counts','content','createDraft'])test('no getter execution at '+entry+' boundary',async()=>{
    const {a}=fixture(),state=await add(a),record=state.records[0];let fired=0;
    const getter=(base,key)=>Object.defineProperty(base,key,{enumerable:true,configurable:true,get(){fired++;return 'Executed';}});
    let call;
    if(entry==='request')call=()=>a.request('add',getter({body:'Body'},'title'));
    if(entry==='mutate')call=()=>a.mutate(getter({kind:'add',title:'Title',body:'Body'},'operationId'));
    if(entry==='preview-values')call=()=>api.previewTemplate('{{name}}',getter({},'name'));
    if(entry==='preview-options')call=()=>api.previewTemplate('Body',{},getter({},'literal'));
    if(entry==='search-options')call=()=>api.search(state,'',getter({},'favorite'));
    if(entry==='validate-state')call=()=>api.validate(getter({...state},'records'));
    if(entry==='validate-record')call=()=>api.validateRecord(getter({...record},'body'));
    if(entry==='validate-content')call=()=>api.validateContent(getter({},'records'));
    if(entry==='counts')call=()=>api.counts(getter({...state},'records'));
    if(entry==='content')call=()=>api.content(getter({...state},'records'));
    if(entry==='createDraft')call=()=>api.createDraft(getter({...record},'body'));
    try{await call();}catch(_){}
    assert.equal(fired,0,'Executed caller getter before rejecting it');
});

for(const mutation of ['toJSON-value','toJSON-getter','nested-getter','hidden','symbol','class','date','map','sparse','cycle'])test('request rejects executable/non-data '+mutation+' input without hooks',()=>{
    const {a}=fixture();let fired=0,values={title:'Title',body:'Body'};
    if(mutation==='toJSON-value')values.toJSON=()=>{fired++;return {title:'Executed',body:'Body'};};
    if(mutation==='toJSON-getter')Object.defineProperty(values,'toJSON',{enumerable:true,get(){fired++;return ()=>values;}});
    if(mutation==='nested-getter'){values.tags=[];Object.defineProperty(values.tags,'0',{enumerable:true,get(){fired++;return 'Tag';}});}
    if(mutation==='hidden')Object.defineProperty(values,'hidden',{value:'No',enumerable:false});
    if(mutation==='symbol')values[Symbol('extra')]='No';
    if(mutation==='class')values=new(class Draft{constructor(){this.title='Title';this.body='Body';}})();
    if(mutation==='date')values=new Date();if(mutation==='map')values=new Map();
    if(mutation==='sparse')values.tags=new Array(2);
    if(mutation==='cycle')values.self=values;
    assert.throws(()=>a.request('add',values));assert.equal(fired,0);
});

test('same version ID with changed bytes is rejected even when version exists only in recovery',async()=>{
    const {a,b}=fixture();await add(a,'Body one');const source=await a.export();await replace(a,source);
    const file=JSON.parse(await a.export());file.content.records=[];
    file.recovery[0].content.records[0].body='Changed historical body';file.recovery[0].content.records[0].history[0].body='Changed historical body';
    const before=b.raw();await assert.rejects(a.review(JSON.stringify(file)),{code:'IDENTITY_CONFLICT'});assert.deepEqual(b.raw(),before);
});

test('cross-record version identity cannot be reassigned through portable backup',async()=>{
    const {a,b}=fixture();await add(a);const file=JSON.parse(await a.export());file.content.records[0].id='different_record';
    const before=b.raw();await assert.rejects(a.review(JSON.stringify(file)),{code:'IDENTITY_CONFLICT'});assert.deepEqual(b.raw(),before);
});
