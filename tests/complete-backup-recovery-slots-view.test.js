'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createDocument,deferred}=require('./helpers/task-dom-model');
const {Backup,DEFER,clone,fixture,withGlobals,seed,boot}=require('./helpers/complete-import-receipt-fixture');
const source=fs.readFileSync('shared/complete-backup-view.js','utf8'),KEY=Backup.WORKSPACE_RECOVERY_KEY,slots=Backup.RECOVERY_SLOTS[KEY];
const waitFor=async(predicate)=>{const until=Date.now()+2000;while(!predicate()&&Date.now()<until)await new Promise(r=>setTimeout(r,1));assert(predicate(),'view settled');};
async function setup(f){
 const b=await boot(f),texts={};
 for(const kind of ['latest','previous','candidate']){
  const text=(await b.store.export(Backup.SCOPED_MODULES)).replaceAll('Synthetic before-import configuration',`Synthetic ${kind} copy`);
  texts[kind]=text;f.raw[kind==='latest'?KEY:slots[kind]]={source:text,checksum:await b.storage.fingerprint(text)};
 }
 const document=createDocument({blurUnavailableFocus:true}),host=document.createElement('div');document.body.append(host);
 const window={LocalItabCompleteBackup:Backup},downloads=[];
 vm.runInNewContext(source,{window,setTimeout,URL,Blob});
 const view=window.LocalItabCompleteBackupView.mount(host,{store:b.store,downloadOnly:true,download:async(text,name)=>downloads.push({text,name}),restore:()=>assert.fail('read-only view must not restore'),reload:()=>assert.fail('read-only view must not reload')});
 return{...b,texts,document,host,view,downloads,get:cls=>host.querySelector('.complete-backup-'+cls)};
}
for(const kind of ['latest','previous','candidate'])test(`real Store/View exports only verified ${kind} copy without changing any bytes`,async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{
  const m=await setup(f),before=clone(f.raw),writes=f.writes.length,button=m.get(kind==='latest'?'recovery':`recovery-${kind}`);
  button.focus();button.dispatch('click');button.dispatch('click');await waitFor(()=>!button.disabled);
  assert.equal(m.downloads.length,1);assert.equal(m.downloads[0].text,m.texts[kind]);
  assert.equal(m.downloads[0].name,'local-itab-pre-restore'+(kind==='latest'?'':`-${kind}`));
  assert.deepEqual(f.raw,before);assert.equal(f.writes.length,writes);assert.equal(f.providers.length,0);
  assert(m.get('apply').disabled);if(kind==='candidate')assert.match(m.get('status').textContent,/not evidence.*does not clear or unlock/);
  m.view.destroy();
 });
});
for(const kind of ['previous','candidate'])for(const fault of ['missing','corrupt','read'])test(`real ${kind} ${fault} reports its own unavailable slot without touching other copies`,async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{
  const m=await setup(f),key=slots[kind];if(fault==='missing')delete f.raw[key];if(fault==='corrupt')f.raw[key].checksum='bad';
  if(fault==='read')f.hooks.get=keys=>{if(keys?.includes(key))throw Error('synthetic read failure');return DEFER;};
  const before=clone(f.raw),writes=f.writes.length,button=m.get(`recovery-${kind}`);button.dispatch('click');await waitFor(()=>!button.disabled);
  assert.equal(m.downloads.length,0);assert.match(m.get('status').textContent,/missing, unreadable or failed integrity checks/);
  assert.match(m.get('status').textContent,kind==='previous'?/Main and candidate copies were not changed/:/Main and previous copies were not changed/);
  assert.deepEqual(f.raw,before);assert.equal(f.writes.length,writes);m.view.destroy();
 });
});
for(const retire of ['destroy','detach'])test(`late candidate read after ${retire} cannot trigger a download`,async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{
  const m=await setup(f),gate=deferred();let entered=false;
  f.hooks.get=async keys=>{if(keys?.includes(slots.candidate)){entered=true;await gate.promise;}return DEFER;};
  m.get('recovery-candidate').dispatch('click');await waitFor(()=>entered);
  if(retire==='destroy')m.view.destroy();else m.host.remove();gate.resolve();
  await new Promise(r=>setTimeout(r,20));assert.equal(m.downloads.length,0);
 });
});
test('downloading an occupied candidate does not clear it or authorize a different restore',async()=>{
 const f=fixture(seed());await withGlobals(f,async()=>{
  const m=await setup(f),incoming=await m.store.export(Backup.SCOPED_MODULES),before=clone(f.raw),writes=f.writes.length;
  m.get('recovery-candidate').dispatch('click');await waitFor(()=>!m.get('recovery-candidate').disabled);
  assert.equal(m.downloads[0].text,m.texts.candidate);
  await assert.rejects(m.store.restore(await m.store.review(incoming),{confirmed:true}),e=>e.code==='RECOVERY_STAGE_OCCUPIED');
  assert.deepEqual(f.raw,before);assert.equal(f.writes.length,writes);m.view.destroy();
 });
});
