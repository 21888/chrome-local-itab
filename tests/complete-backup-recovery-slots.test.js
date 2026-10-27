'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {Backup,Workspaces,DEFER,clone,fixture,withGlobals,seed,boot,backupFor,storageFor}=require('./helpers/complete-import-receipt-fixture');
const KEY=Backup.WORKSPACE_RECOVERY_KEY, slots=Backup.RECOVERY_SLOTS[KEY];
const bounded=(name,fn)=>test(name,{timeout:8000},fn);
async function setup(f){
 const b=await boot(f), source=await b.store.export(Backup.SCOPED_MODULES);
 const prior={source,checksum:await b.storage.fingerprint(source)};f.raw[KEY]=clone(prior);
 await b.session.local.set({quote:'Current saved B after retained recovery A'});
 const incoming=await b.store.export(Backup.SCOPED_MODULES), preview=await b.store.review(incoming);
 return{...b,prior,incoming,preview};
}
for(const phase of ['candidate','previous','main'])for(const mode of ['reject','drop','corrupt','read','lost-ack']) bounded(`${phase} ${mode} preserves discoverable prior recovery and blocks target mutation`,async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{
  const b=await setup(f),before=clone(f.raw),key=phase==='main'?KEY:slots[phase];let submitted=false;
  f.hooks.set=(written,raw,apply)=>{
   if(!Object.hasOwn(written,key))return DEFER;
   if(mode==='reject')throw Error('Synthetic quota failure');if(mode==='drop')return;
   apply(written);submitted=true;
   if(mode==='corrupt')raw[key].checksum='bad';
   if(mode==='lost-ack')throw Error('Synthetic acknowledgement lost');
  };
  f.hooks.get=keys=>{if(mode==='read'&&submitted&&keys?.includes(key))throw Error('Synthetic readback failed');return DEFER;};
  await assert.rejects(b.store.restore(b.preview,{confirmed:true}),e=>e.code==='RECOVERY');
  f.hooks.set=f.hooks.get=null;
  assert.deepEqual(f.raw[Workspaces.REGISTRY_KEY],before[Workspaces.REGISTRY_KEY]);
  for(const [name,value]of Object.entries(before))if(name!==KEY)assert.deepEqual(f.raw[name],value,name);
  if(phase!=='main'||['reject','drop'].includes(mode)){
   assert.deepEqual(f.raw[KEY],b.prior);assert.equal(await b.store.recovery(),b.prior.source);
  }else{
   assert.deepEqual(f.raw[slots.previous],b.prior);assert.equal(await b.store.recovery('previous'),b.prior.source);
  }
  if(phase==='main')assert.equal(await b.store.recovery('candidate'),f.raw[slots.candidate].source);
  assert.equal(f.providers.length,0);
 });
});
bounded('normal publication preserves flat legacy main and explicit previous/candidate downloads',async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{
  const b=await setup(f),start=f.writes.length;
  await b.store.restore(b.preview,{confirmed:true});
  assert.deepEqual(Object.keys(f.raw[KEY]).sort(),['checksum','source']);
  assert.equal(await b.store.recovery('previous'),b.prior.source);
  assert.equal(await b.store.recovery('candidate'),await b.store.recovery());
  const keys=f.writes.slice(start).flatMap(Object.keys);
  assert(keys.indexOf(slots.candidate)<keys.indexOf(slots.previous));
  assert(keys.indexOf(slots.previous)<keys.indexOf(KEY));
  assert(keys.indexOf(KEY)<keys.indexOf(Workspaces.REGISTRY_KEY));
 });
});
bounded('different unpublished candidate refuses capture without deleting or overwriting any slot',async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{
  const b=await setup(f),source=b.prior.source.replaceAll('Synthetic before-import configuration','Separate unpublished candidate');
  f.raw[slots.candidate]={source,checksum:await b.storage.fingerprint(source)};
  const before=clone(f.raw),writes=f.writes.length;
  await assert.rejects(b.store.restore(b.preview,{confirmed:true}),e=>e.code==='RECOVERY_STAGE_OCCUPIED');
  assert.deepEqual(f.raw,before);assert.equal(f.writes.length,writes);
  assert.equal(await b.store.recovery('candidate'),source);
  assert.equal(await b.store.recovery(),b.prior.source);
 });
});
for(const slot of ['main','previous','candidate'])bounded(`corrupt ${slot} cannot be overwritten to make space`,async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{
  const b=await setup(f),key=slot==='main'?KEY:slots[slot];f.raw[key]={source:b.prior.source,checksum:'bad'};
  const before=clone(f.raw),writes=f.writes.length;
  await assert.rejects(b.store.restore(b.preview,{confirmed:true}),e=>e.code==='RECOVERY');
  assert.deepEqual(f.raw,before);assert.equal(f.writes.length,writes);
 });
});
bounded('byte-identical unpublished candidate can be reverified and published without rewriting it',async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{
  const b=await setup(f),source=b.incoming;f.raw[slots.candidate]={source,checksum:await b.storage.fingerprint(source)};
  const start=f.writes.length;await b.store.restore(b.preview,{confirmed:true});
  assert.equal(f.writes.slice(start).some(write=>Object.hasOwn(write,slots.candidate)),false);
  assert.equal(await b.store.recovery('previous'),b.prior.source);
 });
});
bounded('two store instances serialize capture and stale review cannot rotate any recovery slot',async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{
  const b=await setup(f),other=backupFor(f,storageFor(f,b.session),b.manager);
  const preview=await other.review(b.incoming);let enter,release;
  const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);
  f.hooks.set=async(written,raw,apply)=>{if(Object.hasOwn(written,slots.candidate)){apply(written);enter();await gate;return;}return DEFER;};
  const first=b.store.restore(b.preview,{confirmed:true});await entered;
  const writes=f.writes.length,second=other.restore(preview,{confirmed:true});
  const rejected=assert.rejects(second,e=>e.code==='CONFLICT');
  for(let i=0;i<10;i++)await Promise.resolve();assert.equal(f.writes.length,writes,'second capture waits for the real workspace lock');
  release();await first;const before=clone(f.raw),afterWrites=f.writes.length;await rejected;
  assert.deepEqual(f.raw,before);assert.equal(f.writes.length,afterWrites);
 });
});

bounded('unchanged candidate retry reuses its original export time after the clock advances',async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{
  const b=await setup(f);f.raw[slots.candidate]={source:b.incoming,checksum:await b.storage.fingerprint(b.incoming)};
  b.store.now=()=> '2026-10-16T00:00:00.000Z';
  await b.store.restore(b.preview,{confirmed:true});
  assert.equal(await b.store.recovery(),b.incoming);
  assert.equal(await b.store.recovery('previous'),b.prior.source);
 });
});
bounded('combined Prompt/Collection transaction uses the exact reused recovery checksum after time advances',async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{
  const b=await boot(f),incoming=await b.store.export(Backup.MODULES);
  const accepted={promptTarget:'global-library',collectionTarget:'global-collections'};
  const preview=await b.store.review(incoming,null,accepted);
  f.hooks.set=written=>{if(Object.hasOwn(written,KEY))throw Error('synthetic publication rejected');return DEFER;};
  await assert.rejects(b.store.restore(preview,{confirmed:true}),e=>e.code==='RECOVERY');
  f.hooks.set=null;const retained=clone(f.raw[slots.candidate]);
  b.store.now=()=> '2026-10-16T00:00:00.000Z';
  await b.store.restore(await b.store.review(incoming,null,accepted),{confirmed:true});
  assert.equal(await b.store.recovery(),retained.source);assert.equal(f.raw[KEY].checksum,retained.checksum);
  assert.equal(f.providers.length,0);
 });
});
bounded('timestamp alignment never ignores actual candidate content differences',async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{
  const b=await setup(f),source=b.incoming.replaceAll('Current saved B after retained recovery A','Distinct saved candidate');
  f.raw[slots.candidate]={source,checksum:await b.storage.fingerprint(source)};
  b.store.now=()=> '2026-10-16T00:00:00.000Z';const before=clone(f.raw),writes=f.writes.length;
  await assert.rejects(b.store.restore(b.preview,{confirmed:true}),e=>e.code==='RECOVERY_STAGE_OCCUPIED');
  assert.deepEqual(f.raw,before);assert.equal(f.writes.length,writes);
 });
});
bounded('legacy flat recovery remains compatible and rotates through its own verified slots',async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{
  const storage=storageFor(f),store=backupFor(f,storage),key=Backup.RECOVERY_KEY,legacy=Backup.RECOVERY_SLOTS[key];
  const source=await store.export(Backup.SCOPED_MODULES),prior={source,checksum:await storage.fingerprint(source)};f.raw[key]=clone(prior);
  f.raw.quote='Changed legacy configuration';const incoming=await store.export(Backup.SCOPED_MODULES);
  await store.restore(await store.review(incoming),{confirmed:true});
  assert.equal(await store.recovery('previous'),source);assert.deepEqual(f.raw[legacy.previous],prior);
  assert.equal(await store.recovery(),incoming);assert.equal(await store.recovery('candidate'),incoming);
 });
});
bounded('first workspace recovery preserves a verified legacy fallback before publishing the compatible v2 main',async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{
  const storage=storageFor(f),legacy=backupFor(f,storage),source=await legacy.export(Backup.SCOPED_MODULES);
  const prior={source,checksum:await storage.fingerprint(source)};f.raw[Backup.RECOVERY_KEY]=clone(prior);
  const b=await boot(f),incoming=await b.store.export(Backup.SCOPED_MODULES);
  await b.store.restore(await b.store.review(incoming),{confirmed:true});
  assert.deepEqual(f.raw[Backup.RECOVERY_KEY],prior);assert.equal(await b.store.recovery('previous'),source);
  assert.equal(await b.store.recovery(),incoming);
 });
});
bounded('a fully verified identical published main is reused without overwriting unrelated damaged companion slots',async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{
  const b=await setup(f);f.raw[KEY]={source:b.incoming,checksum:await b.storage.fingerprint(b.incoming)};
  f.raw[slots.previous]={source:'retained previous bytes',checksum:'bad'};
  f.raw[slots.candidate]={source:'retained candidate bytes',checksum:'bad'};
  const prior=clone(f.raw[slots.previous]),candidate=clone(f.raw[slots.candidate]),start=f.writes.length;
  await b.store.restore(b.preview,{confirmed:true});
  assert.equal(await b.store.recovery(),b.incoming);
  assert.deepEqual(f.raw[slots.previous],prior);assert.deepEqual(f.raw[slots.candidate],candidate);
  assert(!f.writes.slice(start).some(write=>[KEY,slots.previous,slots.candidate].some(key=>Object.hasOwn(write,key))));
 });
});
