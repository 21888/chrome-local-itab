const test = require('node:test');
const A = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
globalThis.crypto ||= webcrypto;
const path = require('node:path');
const core = require(process.env.COLLECTION_CORE || path.resolve(__dirname, '../shared/local-ai-collections-store.js'));
const clone = x => x === undefined ? x : structuredClone(x);
let scope = 0;
function fixture() {
 let state, queue = Promise.resolve(), serial = 0, now = '2026-10-10T12:00:00.000Z'; const prefix = ++scope;
 const backend = { writes: 0, failNextRead: false, commitThenThrow: false,
  lock(fn) { const p = queue.then(fn); queue = p.catch(() => {}); return p; },
  async read() { if (this.failNextRead) { this.failNextRead = false; throw Error('secret backend detail'); } return clone(state); },
  async write(next) { this.writes++; state = clone(next); if (this.commitThenThrow) { this.commitThenThrow = false; throw Error('secret backend detail'); } },
  subscribe() { return () => {}; }, raw: () => clone(state), corrupt: x => state = clone(x) };
 const options = {id: () => `audit_${prefix}_${++serial}`, now: () => now};
 return {backend, store: new core.Store(backend, options), other: new core.Store(backend, options), time: t => now=t};
}
const add = (s, body='body', extras={}) => s.mutate(s.request('add', {title:'title', body, ...extras}));
const revise = async (s,r,body) => s.mutate(s.request('revise', await s.reviewRevision({id:r.id,version:r.version,body})));
const edit = (s,r,data) => s.mutate(s.request('edit',{id:r.id,version:r.version,...data}));
const replace = async(s,source) => s.mutate(s.request('replace',await s.review(source)));

test('exact composed/decomposed Unicode, CRLF, tabs and markup survive reviewed history and import', async()=>{
 const {store:s}=fixture(); const text=' e\u0301 ≠ é\r\n\t<script>bad()</script> 👨‍👩‍👧‍👦 ';
 const first=(await add(s,text,{notes:'  annotation\r\n'})).records[0];
 const r=(await revise(s,first,text+'!')).records[0];
 const target=fixture().store; const out=await replace(target,await s.export());
 A.equal(out.records[0].body,text+'!'); A.deepEqual(out.records[0].history,r.history);
 A.equal(core.getVersion(out,first.id,first.currentVersionId).body,text);
 A.equal(core.findDuplicates(out,{body:text+'!',sourceUrl:''}).length,1);
 A.equal(core.findDuplicates(out,{body:(text+'!').normalize('NFC'),sourceUrl:''}).length,0);
});

test('prompt reference fails closed for wrong identity, asynchronous and accessor resolvers',async()=>{
 const {store:s}=fixture(); const ref={promptId:'prompt_123',bodyVersionId:'version_123'};
 const r=(await add(s,'saved',{promptRef:ref})).records[0];
 A.deepEqual(core.resolvePromptReference(r).reference,ref);
 A.equal(core.resolvePromptReference(r,()=>undefined).status,'unresolved');
 for(const id of ['version_999','version_123']) {
  const result={recordId:id==='version_123'?'prompt_999':ref.promptId,id,body:'new',createdAt:r.createdAt};
  A.throws(()=>core.resolvePromptReference(r,()=>result));
 }
 A.throws(()=>core.resolvePromptReference(r,async()=>null));
 let calls=0; const bad={get recordId(){calls++;return ref.promptId;}};
 A.throws(()=>core.resolvePromptReference(r,()=>bad)); A.equal(calls,0);
});

test('own descriptor hostility rejected before getter or toJSON execution',async()=>{
 const {store:s,backend:b}=fixture(); let calls=0;
 for(const input of [Object.defineProperty({body:'x'},'title',{get(){calls++;return 'x';},enumerable:true}),
 {title:'x',body:'x',toJSON(){calls++;return {};}},Object.assign(Object.create({title:'x'}),{body:'x'}),
 Object.defineProperty({title:'x',body:'x'},'hidden',{value:'x'}), {title:'x',body:'x',tags:Array(2)}])
 A.throws(()=>s.request('add',input));
 A.equal(calls,0);A.equal(b.writes,0);
});

test('JSON duplicate escaped keys and prototype keys rejected without writes',async()=>{
 const {store:s,backend:b}=fixture(); const valid=await s.export();
 for(const bad of [valid.replace('"schemaVersion":1','"schemaVersion":1,"schema\\u0056ersion":1'),
 valid.replace('"content":','"__proto__":{},"content":')]) await A.rejects(()=>s.review(bad));
 A.equal(b.writes,0);
});

test('URLs reject scripting, credentials, authority ambiguity and canonicalize actual host',()=>{
 for(const u of ['javascript:alert(1)','data:text/html,x','//example.com','https:///example.com','https://@example.com','https://user:password@example.com','https://example.com\\@evil.com',' https://example.com','https://example.com/\u202eabc']) A.throws(()=>core.sourceMetadata(u),u);
 const m=core.sourceMetadata('HTTPS://例子.测试:8443/path?q=1'); A.equal(m.host,'xn--fsqu00a.xn--0zwm56d:8443');
});

test('all Unicode Bidi_Control code points are rejected in source URLs',()=>{
 for(const cp of [0x061c,0x200e,0x200f,0x202a,0x202b,0x202c,0x202d,0x202e,0x2066,0x2067,0x2068,0x2069])
 A.throws(()=>core.sourceMetadata('https://example.com/'+String.fromCodePoint(cp)+'file'),`accepted U+${cp.toString(16)}`);
});

test('commit-then-throw retry is idempotent with same operation and reordered properties',async()=>{
 const {store:s,other,backend:b}=fixture(); const cmd=s.request('add',{title:'t',body:'exact'});b.commitThenThrow=true;
 await A.rejects(()=>s.mutate(cmd),{code:'WRITE'}); A.equal(b.writes,1);
 const reverse=Object.fromEntries(Object.entries(cmd).reverse()); const state=await other.mutate(reverse);
 A.equal(state.records.length,1); A.equal(b.writes,1);
 await A.rejects(()=>s.mutate({...cmd,body:'altered'}),{code:'CONFLICT'});
 await edit(s,state.records[0],{notes:'new'});
 await A.rejects(()=>s.mutate(cmd),{code:'CONFLICT'});A.equal((await s.read()).records.length,1);
});

test('receipt does not confirm saved state that was externally changed',async()=>{
 const {store:s,backend:b}=fixture(); const cmd=s.request('add',{title:'t',body:'x'}); await s.mutate(cmd);
 const altered=b.raw(); altered.records[0].notes='modified after save';b.corrupt(altered);
 await A.rejects(()=>s.mutate(cmd),{code:'CONFLICT'});A.equal(b.writes,1);
});

test('concurrent same-record editor fences produce one winner; independent records both persist',async()=>{
 const {store:s,other}=fixture(); const first=(await add(s)).records[0];
 const results=await Promise.allSettled([edit(s,first,{notes:'one'}),edit(other,first,{notes:'two'})]);
 A.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const state=await add(s,'second');const [a,b]=state.records;
 await Promise.all([edit(s,a,{title:'one'}),edit(other,b,{title:'two'})]);
 A.deepEqual((await s.read()).records.map(r=>r.title),['one','two']);
});

test('review plans are instance-bound, exact, stale after metadata edit, and expire after 16 newer plans',async()=>{
 const {store:s,other}=fixture();const r=(await add(s)).records[0];
 const p=await s.reviewRevision({id:r.id,version:r.version,body:'next'});
 await A.rejects(()=>other.mutate(other.request('revise',p)),{code:'REVIEW_REQUIRED'});
 await A.rejects(()=>s.mutate(s.request('revise',{...p,body:'tampered'})),{code:'REVIEW_REQUIRED'});
 for(let n=0;n<16;n++) await s.reviewRevision({id:r.id,version:r.version,body:'other'+n});
 await A.rejects(()=>s.mutate(s.request('revise',p)),{code:'REVIEW_REQUIRED'});
 const q=await s.reviewRevision({id:r.id,version:r.version,body:'next'});await edit(s,r,{notes:'changed'});
 await A.rejects(()=>s.mutate(s.request('revise',q)),{code:'CONFLICT'});
});

test('reviewed history restore appends, monotonic clock survives rollback, and full history refuses growth',async()=>{
 const {store:s,time,backend:b}=fixture();let r=(await add(s,'zero')).records[0];const first=r;
 time('2026-10-09T12:00:00.000Z');
 for(let n=1;n<19;n++)r=(await revise(s,r,'body'+n)).records[0];
 r=(await s.mutate(s.request('revise',await s.reviewVersionRestore({id:r.id,version:r.version,versionId:first.currentVersionId})))).records[0];
 A.equal(r.history.length,20); A.equal(r.body,'zero'); A.notEqual(r.currentVersionId,first.currentVersionId);
 A.equal(r.updatedAt,first.updatedAt); A.ok(r.history.every(x=>x.createdAt===first.createdAt));
 const before=b.raw(),writes=b.writes; await A.rejects(()=>s.reviewRevision({id:r.id,version:r.version,body:'overflow'}),{code:'HISTORY_LIMIT'});
 A.deepEqual(b.raw(),before);A.equal(b.writes,writes);
});

test('archive counts toward capacity and overflow preserves every record',async()=>{
 const {store:s,backend:b}=fixture();let state;
 for(let n=0;n<200;n++)state=await add(s,'body'+n);
 const first=state.records[0];await s.mutate(s.request('remove',{id:first.id,version:first.version}));
 const before=b.raw(),writes=b.writes;await A.rejects(()=>add(s,'overflow'),{code:'CAPACITY'});
 A.equal(b.writes,writes);A.deepEqual(b.raw(),before);
});

test('replacement preserves displaced data, recovery swaps without eviction, and stale review refuses',async()=>{
 const {store:s,backend:b}=fixture();const first=(await add(s,'original')).records[0];
 const source=await fixture().store.export(); const p=await s.review(source);await edit(s,first,{notes:'new notes'});
 await A.rejects(()=>s.mutate(s.request('replace',p)),{code:'CONFLICT'});
 let state=await replace(s,source);A.equal(state.records.length,0);A.equal(state.recovery[0].content.records[0].notes,'new notes');
 state=await s.mutate(s.request('recover',{id:state.recovery[0].id,revision:state.revision}));
 A.equal(state.records[0].body,'original'); A.equal(state.recovery.length,1);A.equal(state.recovery[0].content.records.length,0);
 A.equal(core.getVersion(state,first.id,first.currentVersionId).body,'original');
});

test('backend lock failures do not disclose implementation error details',async()=>{
 const backend={lock(){throw Error('secret backend detail: credential=example-secret');}};
 const s=new core.Store(backend);
 try{await s.read();A.fail('expected failure');}catch(e){A.ok(!e.message.includes('example-secret'),e.message);}
});

test('immutable history identities reject changed bytes, owner and date across recovery snapshots',async()=>{
 const {store:s,backend:b}=fixture();const r=(await add(s,'original')).records[0];const source=JSON.parse(await s.export());
 for(const field of ['body','owner','date']){
  const file=clone(source), changed=clone(r);
  if(field==='body'){changed.body='different';changed.history[0].body='different';}
  if(field==='owner')changed.id='other_owner';
  if(field==='date'){changed.createdAt='2026-10-10T11:00:00.000Z';changed.history[0].createdAt=changed.createdAt;}
  file.recovery=[{id:'snapshot_123',createdAt:r.updatedAt,content:{records:[changed]}}];
  A.throws(()=>core.parseBackup(JSON.stringify(file)),{code:'IDENTITY_CONFLICT'});
 }
 A.equal(b.writes,1);
});

test('incoming live and recovery prompt links are all explicitly unresolved in review',async()=>{
 const {store:s}=fixture();await add(s,'a',{promptRef:{promptId:'prompt_live',bodyVersionId:'version_live'}});
 await replace(s,await fixture().store.export());await add(s,'b',{promptRef:{promptId:'prompt_other',bodyVersionId:'version_other'}});
 const dst=fixture(); const p=await dst.store.review(await s.export());
 A.equal(p.promptReferences.length,2);A.ok(p.promptReferences.every(x=>x.status==='unresolved'));
 A.deepEqual(p.promptReferences.map(x=>x.location).sort(),['live','recovery']);A.equal(dst.backend.writes,0);
});

test('8-snapshot recovery limit refuses replacement but still permits non-evicting swaps',async()=>{
 const {store:s,backend:b}=fixture();const empty=await fixture().store.export();
 for(let n=0;n<8;n++){await add(s,'snapshot'+n);await replace(s,empty);}
 let state=await add(s,'current');A.equal(state.recovery.length,8);const before=b.raw(),writes=b.writes;
 await A.rejects(()=>s.review(empty),{code:'RECOVERY_LIMIT'});A.deepEqual(b.raw(),before);A.equal(b.writes,writes);
 const preserved=state.recovery.flatMap(x=>x.content.records).map(x=>x.body).concat('current').sort();
 state=await s.mutate(s.request('recover',{id:state.recovery[0].id,revision:state.revision}));
 A.equal(state.recovery.length,8);
 A.deepEqual([...state.records,...state.recovery.flatMap(x=>x.content.records)].map(x=>x.body).sort(),preserved);
});

test('serialized capacity rejection keeps data unchanged and never evicts histories',async()=>{
 const {store:s,backend:b}=fixture();let rejected=false;
 for(let n=0;n<60;n++){
  const before=b.raw(),writes=b.writes;
  try{await add(s,'😀'.repeat(30000),{notes:'n'.repeat(15000)});}catch(e){
   A.ok(['SIZE_LIMIT','INPUT_LIMIT'].includes(e.code),e.code);A.equal(b.writes,writes);A.deepEqual(b.raw(),before);rejected=true;break;
  }
 }
 A.equal(rejected,true);const state=await s.read();A.ok(state.records.length>0);A.ok(state.records.every(x=>x.history.length===1&&x.body==='😀'.repeat(30000)));
});

test('invalid stored data blocks all mutations without overwriting',async()=>{
 const {store:s,backend:b}=fixture();await add(s);const raw=b.raw();raw.schemaVersion=999;b.corrupt(raw);
 await A.rejects(()=>add(s,'new'),{code:'VERSION'});A.equal(b.writes,1);A.deepEqual(b.raw(),raw);
});

test('async lock acquisition errors are sanitized for read, mutate and review entry points',async()=>{
 const base=fixture(),state=await add(base.store);const record=state.records[0];const file=await base.store.export();
 const failing=new core.Store({lock:async()=>{throw Error('private-lock-credential');}}, {id:()=> 'operation_123'});
 for(const run of [()=>failing.read(),()=>failing.mutate(failing.request('add',{title:'t',body:'x'})),()=>failing.review(file),
 ()=>failing.reviewRevision({id:record.id,version:record.version,body:'next'}),
 ()=>failing.reviewVersionRestore({id:record.id,version:record.version,versionId:record.currentVersionId})]){
  try{await run();A.fail('expected lock rejection');}catch(e){A.ok(!e.message.includes('private-lock-credential'),e.message);}
 }
});
