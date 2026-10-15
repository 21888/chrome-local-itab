'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../shared/import-closure.js');
const { Storage, Workspaces: W, Backup, DEFER, clone, code, fixture, withGlobals, seed, storageFor, backupFor, boot, values, restoreOptions, uncertainImport } = require('./helpers/complete-import-receipt-fixture');
const bounded = (name, action) => test(name, { timeout: 10000 }, action);
const deferred = () => { let resolve; const promise = new Promise(yes=>resolve=yes);return {promise,resolve}; };
async function conflict(f, named=false) {
    const b=await boot(f);
    if(named){b.session=b.manager.capture((await b.manager.create('Synthetic owner')).id);await b.session.ready();b.storage=storageFor(f,b.session);}
    await uncertainImport(f,b.storage,b.session,{...b.storage.cloneDefaultConfig(),quote:'Synthetic imported settings'});
    await b.session.local.set({quote:'Synthetic chosen current settings'});return b;
}
async function close(f,b) {const r=await b.storage.reviewImportClosure();assert.equal(r.status,'READY');const outcome=await b.storage.commitImportClosure(r,{confirmed:true});assert.equal(outcome.status,'RECORDED');return clone(f.raw[C.KEY]);}
const noWrites=async(f,action)=>{const n=f.writes.length,old=clone(f.raw);await action();assert.equal(f.writes.length,n);assert.deepEqual(f.raw,old);};

for(const named of [false,true]) bounded(`explicit review writes exactly one root key and preserves complete source named=${named}`,async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{const b=await conflict(f,named);const before=clone(f.raw),n=f.writes.length;
 const review=await b.storage.reviewImportClosure();assert(Object.isFrozen(review));assert.equal(f.writes.length,n);assert(!JSON.stringify(review).includes('Synthetic chosen'));
 assert.equal((await b.storage.commitImportClosure(review,{confirmed:true})).status,'RECORDED');assert.equal(f.writes.length,n+1);assert.deepEqual(Object.keys(f.writes[n]),[C.KEY]);
 const raw=clone(f.raw);delete raw[C.KEY];assert.deepEqual(raw,before);const e=await C.validate(f.raw[C.KEY]);
 const original=values(f,b.session.id);assert.deepEqual(e.body.receipt,original[b.storage.restoreReceiptKey]);assert.equal(e.body.receipt.status,'pending');assert.deepEqual(e.body.recovery,original[b.storage.restoreRecoveryKey]);
 assert.deepEqual(e.body.current,b.storage.restoreReceiptState({...original,privacy:f.raw.privacy}));assert.deepEqual(f.providers,[]);
 await noWrites(f,async()=>{assert.equal((await b.storage.recheckImportClosure()).relation,'active');assert.equal((await b.storage.reviewImportClosure()).status,'ALREADY_CLOSED');});
 });
});
for(const behavior of ['false-applied','throw-applied','false-missing','throw-missing','readback-fails','readback-corrupt']) bounded(`single write uncertainty ${behavior}`,async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{const b=await conflict(f),review=await b.storage.reviewImportClosure();const before=clone(f.raw);let submitted=false;
 f.hooks.set=(written,raw,apply)=>{if(!Object.hasOwn(written,C.KEY))return DEFER;submitted=true;if(behavior.includes('applied')||behavior.startsWith('readback'))apply(written);if(behavior.startsWith('throw'))throw Error('Synthetic lost acknowledgment');return false;};
 f.hooks.get=(keys,raw)=>{if(submitted&&keys?.includes(C.KEY)){if(behavior==='readback-fails')throw Error('Synthetic unavailable');if(behavior==='readback-corrupt')return {[C.KEY]:{schemaVersion:99}};}return DEFER;};
 const n=f.writes.length,outcome=await b.storage.commitImportClosure(review,{confirmed:true});assert.equal(f.writes.length,n+1);assert.equal(outcome.status,behavior.includes('applied')?'RECORDED':'UNCERTAIN');
 f.hooks.get=f.hooks.set=null;const after=clone(f.raw);delete after[C.KEY];assert.deepEqual(after,before);
 await noWrites(f,async()=>{const recheck=await b.storage.recheckImportClosure();assert.equal(recheck.status,behavior.includes('missing')?'EMPTY':'RECORDED');});
 await assert.rejects(b.storage.commitImportClosure(review,{confirmed:true}),code('IMPORT_CLOSURE_REVIEW_REQUIRED'));assert.equal(f.writes.length,n+1);
 });
});
bounded('post-submission external source change is recorded honestly without rollback',async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{const b=await conflict(f),review=await b.storage.reviewImportClosure();f.hooks.set=(written,raw,apply)=>{if(!Object.hasOwn(written,C.KEY))return DEFER;apply(written);values(f).quote='Synthetic later external edit';return DEFER;};
 assert.equal((await b.storage.commitImportClosure(review,{confirmed:true})).status,'RECORDED_LIVE_CHANGED');f.hooks.set=null;assert.equal((await b.storage.reviewImportClosure()).status,'ALREADY_CLOSED_HISTORY_ONLY');assert.equal((await b.storage.recheckImportClosure()).relation,'active');
 });
});
for(const mutate of ['config','privacy','recovery','receipt','generation','cancel','new-review']) bounded(`review freshness refuses ${mutate} before installation`,async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{const b=await conflict(f),review=await b.storage.reviewImportClosure();
 if(mutate==='config')values(f).quote='Changed';if(mutate==='privacy')f.raw.privacy={onlineFavicons:!f.raw.privacy.onlineFavicons};if(mutate==='recovery')values(f)[b.storage.restoreRecoveryKey].extra=true;
 if(mutate==='receipt')values(f)[b.storage.restoreReceiptKey].request='f'.repeat(64);if(mutate==='generation')f.raw[W.REGISTRY_KEY].workspaces[0].generation='changed';if(mutate==='cancel')b.storage.cancelImportClosure(review);if(mutate==='new-review')await b.storage.reviewImportClosure();
 await noWrites(f,()=>assert.rejects(b.storage.commitImportClosure(review,{confirmed:true})));assert(!Object.hasOwn(f.raw,C.KEY));
 });
});
for(const value of [null,{schemaVersion:99}, {schemaVersion:1,id:'broken'}]) bounded(`occupied unknown/corrupt slot refuses without cleanup ${JSON.stringify(value)}`,async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{const b=await conflict(f);f.raw[C.KEY]=clone(value);await noWrites(f,async()=>{const r=await b.storage.reviewImportClosure();assert.equal(r.eligible,false);assert(['SLOT_INVALID','SLOT_UNSUPPORTED'].includes(r.status));});await b.storage.clear();assert.deepEqual(f.raw[C.KEY],value);});
});
bounded('two independent tabs archive an equivalent source once, retaining first decision time',async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{const a=await conflict(f),otherManager=f.manager(),session=otherManager.capture(a.session.id);const other=storageFor(f,session);await session.readyExisting();
 const [ra,rb]=await Promise.all([a.storage.reviewImportClosure(),other.reviewImportClosure()]);const n=f.writes.length;
 const results=await Promise.all([a.storage.commitImportClosure(ra,{confirmed:true}),other.commitImportClosure(rb,{confirmed:true})]);assert.deepEqual(results.map(x=>x.status).sort(),['ALREADY_CLOSED','RECORDED']);assert.equal(f.writes.length,n+1);
 });
});
for(const sameFile of [false,true]) bounded(`closed Manual/Drive import requires fresh private capability sameFile=${sameFile}`,async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{const b=await conflict(f),archive=await close(f,b),old=clone(values(f)[b.storage.restoreReceiptKey]);const input={...b.storage.cloneDefaultConfig(),quote:sameFile?'Synthetic imported settings':'Synthetic new import'};
 let review;await noWrites(f,async()=>{for(const options of [{},{newRestoreOperation:true},{closedRestoreTicket:{}}])await assert.rejects(b.storage.setAll(input,{...restoreOptions,...options}),e=>{assert.equal(e.code,'RESTORE_CLOSED_RECONFIRM');review=e.closureReview;return true;});});
 const ticket=await b.storage.confirmClosedRestore(review,{confirmed:true});assert(Object.isFrozen(ticket));await b.storage.setAll(input,{...restoreOptions,closedRestoreTicket:ticket});
 assert.equal(values(f).quote,input.quote);assert.equal(values(f)[b.storage.restoreReceiptKey].status,'verified');assert.notDeepEqual(values(f)[b.storage.restoreReceiptKey],old);assert.deepEqual(f.raw[C.KEY],archive);
 assert.equal(values(f)[b.storage.restoreRecoveryKey].payload.data.quote,'Synthetic chosen current settings');assert.deepEqual(f.providers,[]);
 });
});
for(const during of ['makeRecovery','validateBundle','slot']) bounded(`new-import capability is rechecked after awaited ${during}`,async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{const b=await conflict(f);await close(f,b);const input={...b.storage.cloneDefaultConfig(),quote:'Synthetic new operation'};let review;
 await assert.rejects(b.storage.setAll(input,restoreOptions),e=>{review=e.closureReview;return e.code==='RESTORE_CLOSED_RECONFIRM';});const ticket=await b.storage.confirmClosedRestore(review,{confirmed:true});
 if(during==='makeRecovery'){const original=b.storage.makeRecovery.bind(b.storage);b.storage.makeRecovery=async(...args)=>{const result=await original(...args);values(f).quote='External newer edit';return result;};}
 if(during==='validateBundle'){const original=b.manager.validateBundle.bind(b.manager);let changed=false;b.manager.validateBundle=async(...args)=>{await original(...args);if(!changed){changed=true;values(f).quote='External edit during writer validation';}};}
 if(during==='slot'){const original=b.storage.makeRecovery.bind(b.storage);b.storage.makeRecovery=async(...args)=>{const result=await original(...args);f.raw[C.KEY].body.current.quote='Synthetic corruption';return result;};}
 const n=f.writes.length;await assert.rejects(b.storage.setAll(input,{...restoreOptions,closedRestoreTicket:ticket}));assert.equal(f.writes.length,n);assert.equal(values(f)[b.storage.restoreReceiptKey].status,'pending');
 });
});
bounded('closed source Duplicate strips operation identity while retaining exact source and root archive',async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{const b=await conflict(f),archive=await close(f,b),source=clone(values(f));const duplicate=await b.manager.duplicate('default','Synthetic duplicate');
 assert.deepEqual(values(f),source);assert.deepEqual(f.raw[C.KEY],archive);assert(!Object.hasOwn(values(f,duplicate.id),b.storage.restoreReceiptKey));assert.deepEqual(values(f,duplicate.id)[b.storage.restoreRecoveryKey],source[b.storage.restoreRecoveryKey]);
 });
});
bounded('Complete explicit ticket admits exactly closed source and protects archive through owner removal and rotations',async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{const initial=await boot(f),source=await initial.store.export(Backup.SCOPED_MODULES);const b=await conflict(f,true),archive=await close(f,b);const store=backupFor(f,storageFor(f),b.manager);
 await store.restore(await store.review(source),{confirmed:true});assert(!f.raw[W.REGISTRY_KEY].workspaces.some(x=>x.id===b.session.id));assert.deepEqual(f.raw[C.KEY],archive);
 for(let n=0;n<3;n++){const current=await store.export(Backup.SCOPED_MODULES);await store.restore(await store.review(current),{confirmed:true});assert.deepEqual(f.raw[C.KEY],archive);}
 assert.equal((await b.storage.recheckImportClosure()).relation,'historical');assert(!JSON.stringify(await store.export(Backup.SCOPED_MODULES)).includes('abandon-unverified-keep-current'));
 });
});
bounded('Trash and restored generation retain exact same-operation authority after restart',async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{const b=await conflict(f,true),archive=await close(f,b);await b.manager.trash(b.session.id);await b.manager.restore(b.session.id);const manager=f.manager(),session=manager.capture(b.session.id),storage=storageFor(f,session);await session.readyExisting();
 assert.notEqual(session.generation,archive.body.owner.generation);assert.equal((await storage.recheckImportClosure()).relation,'active');const d=await manager.duplicate(session.id,'Synthetic after restart');assert(!Object.hasOwn(values(f,d.id),storage.restoreReceiptKey));assert.deepEqual(f.raw[C.KEY],archive);
 });
});
bounded('Complete rejects closure mutation during async recovery preparation before any write',async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{const b=await conflict(f);await close(f,b);const source=await b.store.export(['config']),review=await b.store.review(source);const original=b.storage.fingerprint.bind(b.storage);let touched=false;
 b.storage.fingerprint=async value=>{const hash=await original(value);if(typeof value==='string'&&!touched){touched=true;f.raw[C.KEY].id='0'.repeat(64);}return hash;};const n=f.writes.length;await assert.rejects(b.store.restore(review,{confirmed:true}));assert(touched);assert.equal(f.writes.length,n);
 });
});
bounded('closure commit serializes workspace privacy and legacy config writes under audited lock order',async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{const b=await conflict(f),review=await b.storage.reviewImportClosure();const entered=deferred(),release=deferred();let paused=false;
 f.hooks.set=async written=>{if(Object.hasOwn(written,C.KEY)&&!paused){paused=true;entered.resolve();await release.promise;}return DEFER;};const saving=b.storage.commitImportClosure(review,{confirmed:true});await entered.promise;
 const privacy=b.session.local.set({privacy:{onlineFavicons:true}});let privacyDone=false;privacy.then(()=>privacyDone=true);
 const legacy=f.locks.request('local-itab-local-write',async()=>{});let legacyDone=false;legacy.then(()=>legacyDone=true);await new Promise(resolve=>setImmediate(resolve));assert(!privacyDone&&!legacyDone);
 release.resolve();assert.equal((await saving).status,'RECORDED');await privacy;await legacy;assert.deepEqual(f.providers,[]);
 });
});
bounded('Options recheck never attributes another workspace archive to this page',async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{const b=await conflict(f);await close(f,b);const other=b.manager.capture((await b.manager.create('Synthetic other')).id);await other.ready();const storage=storageFor(f,other);assert.equal((await storage.recheckImportClosure()).relation,'historical');});
});
for(const mutation of ['lineage','generation','slot']) bounded(`recheck never reports active from mixed ${mutation} reads`,async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{const b=await conflict(f);await close(f,b);let changed=false;f.hooks.get=keys=>{if(!changed&&keys?.includes(C.KEY)&&keys.some(key=>key.startsWith(W.PREFIX))){changed=true;if(mutation==='lineage'){f.raw[W.REGISTRY_KEY].migrationId='new_lineage';f.raw[W.ACTIVATION_KEY].migrationId='new_lineage';}if(mutation==='generation')f.raw[W.REGISTRY_KEY].workspaces[0].generation='new_generation';if(mutation==='slot')f.raw[C.KEY].id='0'.repeat(64);}return DEFER;};const checked=await b.storage.recheckImportClosure();assert(changed);assert.notEqual(checked.relation,'active');});
});
bounded('raw legacy local facades cannot write, remove, or clear the independent slot',async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{const storage=new Storage();for(const local of [storage.local,storage._local]){assert.throws(()=>local.set({[C.KEY]:{}}),code('IMPORT_CLOSURE_BOUNDARY'));assert.throws(()=>local.remove(C.KEY),code('IMPORT_CLOSURE_BOUNDARY'));assert.throws(()=>local.clear(),code('IMPORT_CLOSURE_BOUNDARY'));}assert.equal(f.writes.length,0);});
});
for(const mutation of ['missing-recovery','changed-recovery','matching-target','future-receipt','oversized']) bounded(`eligibility fails closed for ${mutation}`,async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{const b=await conflict(f),raw=values(f);if(mutation==='missing-recovery')delete raw[b.storage.restoreRecoveryKey];if(mutation==='changed-recovery')raw[b.storage.restoreRecoveryKey].extra=true;if(mutation==='matching-target')raw[b.storage.restoreReceiptKey].target=await b.storage.fingerprint(b.storage.restoreReceiptState({...raw,privacy:f.raw.privacy}));if(mutation==='future-receipt')raw[b.storage.restoreReceiptKey].version=99;if(mutation==='oversized'){raw[b.storage.restoreRecoveryKey].large='x'.repeat(C.LIMITS.bytes);raw[b.storage.restoreReceiptKey].recovery=await b.storage.fingerprint(raw[b.storage.restoreRecoveryKey]);}
 await noWrites(f,async()=>{try{const result=await b.storage.reviewImportClosure();assert.equal(result.eligible,false);if(mutation==='matching-target')assert.equal(result.status,'NORMAL_VERIFICATION_REQUIRED');else assert.equal(result.status,'ORIGINAL_RECOVERY_UNAVAILABLE');}catch(error){assert(['future-receipt','oversized'].includes(mutation));}});
 });
});
bounded('a newer failed import cannot borrow the old closure authority',async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{const b=await conflict(f),archive=await close(f,b);const incoming={...b.storage.cloneDefaultConfig(),quote:'Synthetic second attempt'};let r;await assert.rejects(b.storage.setAll(incoming,restoreOptions),e=>{r=e.closureReview;return e.code==='RESTORE_CLOSED_RECONFIRM';});const ticket=await b.storage.confirmClosedRestore(r,{confirmed:true});
 let submitted=false;const key=W.bundleKey(b.session);f.hooks.set=written=>{if(Object.hasOwn(written,key))submitted=true;return DEFER;};f.hooks.get=keys=>{if(submitted&&keys?.includes(key))throw Error('Synthetic lost second acknowledgment');return DEFER;};await assert.rejects(b.storage.setAll(incoming,{...restoreOptions,closedRestoreTicket:ticket}));f.hooks.get=f.hooks.set=null;assert.equal(values(f)[b.storage.restoreReceiptKey].status,'pending');assert.notDeepEqual(values(f)[b.storage.restoreReceiptKey],archive.body.receipt);values(f).quote='Synthetic after second failure';await noWrites(f,()=>assert.rejects(b.manager.duplicate('default','Blocked second'),code('WORKSPACE_IMPORT_PENDING')));assert.deepEqual(f.raw[C.KEY],archive);
 });
});
for(const mutation of ['corrupt','missing','read-fails','source-invalid']) bounded(`final combined post-submit proof distinguishes ${mutation}`,async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{const b=await conflict(f),review=await b.storage.reviewImportClosure();let submitted=false,changed=false;
 f.hooks.set=written=>{if(Object.hasOwn(written,C.KEY))submitted=true;return DEFER;};f.hooks.get=keys=>{if(submitted&&!changed&&keys?.includes(C.KEY)&&keys?.includes(W.REGISTRY_KEY)){changed=true;if(mutation==='corrupt')f.raw[C.KEY].id='0'.repeat(64);if(mutation==='missing')delete f.raw[C.KEY];if(mutation==='read-fails')throw Error('Synthetic proof read failure');if(mutation==='source-invalid')f.raw[W.REGISTRY_KEY].schemaVersion=99;}return DEFER;};
 const n=f.writes.length,outcome=await b.storage.commitImportClosure(review,{confirmed:true});assert(changed);assert.equal(outcome.status,mutation==='source-invalid'?'RECORDED_LIVE_CHANGED':'UNCERTAIN');assert.equal(outcome.recorded,mutation==='source-invalid');assert.equal(f.writes.length,n+1);
 });
});
for(const relation of ['new-operation','new-lineage']) bounded(`valid occupied slot does not impose closure-only JSON bounds on ${relation}`,async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{const b=await conflict(f),archive=await close(f,b),raw=values(f),incoming={...b.storage.cloneDefaultConfig(),quote:'Synthetic unrelated request'};
 Object.defineProperty(raw[b.storage.restoreRecoveryKey], 'constructor', { value:'Synthetic ordinary opaque recovery field', enumerable:true, writable:true, configurable:true });
 if(relation==='new-lineage'){f.raw[W.REGISTRY_KEY].migrationId='synthetic_different_lineage';f.raw[W.ACTIVATION_KEY].migrationId='synthetic_different_lineage';await assert.rejects(b.storage.setAll(incoming,restoreOptions),code('RESTORE_PENDING_CONFLICT'));}
 else {raw[b.storage.restoreReceiptKey]={version:1,status:'pending',request:await b.storage.restoreRequestHash(incoming),recovery:await b.storage.fingerprint(raw[b.storage.restoreRecoveryKey]),target:await b.storage.fingerprint(b.storage.restoreReceiptState({...raw,privacy:f.raw.privacy}))};await b.storage.setAll(incoming,restoreOptions);assert.equal(values(f)[b.storage.restoreReceiptKey].status,'verified');}
 assert.deepEqual(f.raw[C.KEY],archive);
 });
});
bounded('native i18n string-key contract preserves the dedicated closed-import error and review capability',async()=>{
 const f=fixture(seed()),keys=[];f.chrome.i18n={getMessage(key){assert.equal(typeof key,'string','chrome.i18n.getMessage requires a messageName string');keys.push(key);return key==='restoreClosedReconfirm'?'Synthetic localized reconfirmation':'';}};
 await withGlobals(f,async()=>{const b=await conflict(f);
 const expected={RESTORE_CLOSED_RECONFIRM:'restoreClosedReconfirm',RESTORE_UNCERTAIN:'restoreUncertain',RESTORE_PENDING_CONFLICT:'restorePendingConflict',RESTORE_RETRY_CONFLICT:'restoreRetryConflict',RESTORE_RECONFIRM:'restoreReconfirm',RESTORE_RECEIPT_INVALID:'restoreReceiptInvalid'};
 for(const [code,key] of Object.entries(expected)){const error=b.storage.restoreReceiptError(code);assert.equal(error.code,code);assert.equal(keys.at(-1),key,`${code} uses its native locale key`);assert(error.message.length>0);}
 await close(f,b);let review;await noWrites(f,()=>assert.rejects(b.storage.setAll({...b.storage.cloneDefaultConfig(),quote:'Synthetic next file'},restoreOptions),error=>{assert.equal(error.code,'RESTORE_CLOSED_RECONFIRM');assert.equal(error.message,'Synthetic localized reconfirmation');assert(error.closureReview);review=error.closureReview;return true;}));assert(keys.includes('restoreClosedReconfirm'));assert(await b.storage.confirmClosedRestore(review,{confirmed:true}));});
});
