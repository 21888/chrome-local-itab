'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Drive = require('../drive-backup');
const installLocks = require('./helpers/drive-state-lock-model');
const clone = value => structuredClone(value);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
function fixture(t) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'chrome'), restoreLocks = installLocks();
    t.after(() => { restoreLocks(); if (descriptor) Object.defineProperty(globalThis, 'chrome', descriptor); else delete global.chrome; });
    const first = new Drive(), second = new Drive(), key = first.stateKey;
    const raw = {[key]: first.normalizeState({deviceId: 'a', activeDeviceId: 'a', deviceName: 'A', connectedAt: '2026-01-01T00:00:00Z', lastBackupAt: '2026-01-02T00:00:00Z', knownDevices: [{id:'a',name:'A'}, {id:'b',name:'B'}]}), sync: {enabled:true, sentinel:'unrelated'}, quote: 'saved'};
    const writes = []; let readGate = null, failWrite = false, reads = 0;
    global.chrome = {storage:{local:{
        async get(keys) {
            reads++; const copy = Object.fromEntries(keys.filter(k => k in raw).map(k => [k,clone(raw[k])]));
            if (readGate) { const gate = readGate; readGate = null; gate.entered.resolve(); await gate.resume.promise; }
            return copy;
        },
        async set(value) { if (failWrite) { failWrite = false; throw Error('Synthetic write rejected'); } writes.push(clone(value)); Object.assign(raw,clone(value)); }
    }}};
    return {first,second,raw,key,writes,get reads(){return reads;},failNextWrite(){failWrite=true;}, pauseRead(){
        const gate = {entered:deferred(),resume:deferred()}; readGate=gate; return gate;
    }};
}
const bounded = (name, fn) => test(name, {timeout:5000}, fn);
async function concurrent(t, firstAction, secondAction) {
    const f = fixture(t), gate = f.pauseRead(), first = firstAction(f.first);
    await gate.entered.promise;
    const second = secondAction(f.second);
    for (let i=0;i<10;i++) await Promise.resolve();
    assert.equal(f.reads,1,'second mutation must wait before reading shared state');
    gate.resume.resolve(); const results = await Promise.all([first,second]);
    assert.deepEqual(f.raw.sync,{enabled:true,sentinel:'unrelated'}); assert.equal(f.raw.quote,'saved');
    assert.equal(f.raw[f.key].connectedAt,'2026-01-01T00:00:00Z');
    assert.equal(f.raw[f.key].lastBackupAt,'2026-01-02T00:00:00Z');
    assert(f.writes.every(write => Object.keys(write).length===1 && Object.hasOwn(write,f.key)));
    return {...f,results};
}

bounded('restore timestamp and concurrent Add Computer preserve both profiles and newer selection', async t => {
    const f = await concurrent(t,m=>m.markRestored(),m=>m.addDevice('New computer'));
    assert.equal(f.raw[f.key].knownDevices.length,3);
    assert.equal(f.raw[f.key].deviceId,f.results[1].deviceId);
    assert.ok(f.raw[f.key].lastRestoreAt);
});
bounded('two instances adding distinct profiles retain both commands', async t => {
    const f = await concurrent(t,m=>m.addDevice('One'),m=>m.addDevice('Two'));
    assert.deepEqual(f.raw[f.key].knownDevices.map(p=>p.name),['A','B','One','Two']);
    assert.equal(f.raw[f.key].deviceId,f.results[1].deviceId);
});
bounded('concurrent duplicate-name Add selects the one profile rather than creating duplicates', async t => {
    const f = await concurrent(t,m=>m.addDevice('Same'),m=>m.addDevice('same'));
    assert.equal(f.raw[f.key].knownDevices.length,3);
    assert.equal(f.results[0].deviceCreated,true); assert.equal(f.results[1].deviceCreated,false);
    assert.equal(f.results[0].deviceId,f.results[1].deviceId);
});
for (const order of ['rename-first','select-first']) bounded(`rename targets reviewed ID without undoing newer selection (${order})`, async t => {
    const rename = m=>m.renameDevice('Renamed A','a'), select = m=>m.selectDevice('b');
    const f = await concurrent(t,order==='rename-first'?rename:select,order==='rename-first'?select:rename);
    assert.equal(f.raw[f.key].deviceId,'b'); assert.equal(f.raw[f.key].deviceName,'B');
    assert.equal(f.raw[f.key].knownDevices.find(p=>p.id==='a').name,'Renamed A');
});
bounded('initial normalization is serialized and does not create competing default identities', async t => {
    const f=fixture(t); delete f.raw[f.key];
    const [a,b]=await Promise.all([f.first.ensureState(),f.second.ensureState()]);
    assert.equal(a.deviceId,b.deviceId); assert.equal(f.writes.length,1);
});
bounded('failed storage write releases lock and retains the original state for next command', async t => {
    const f=fixture(t), before=clone(f.raw); f.failNextWrite();
    await assert.rejects(f.first.addDevice('Rejected'),/Synthetic write rejected/);
    assert.deepEqual(f.raw,before);
    await f.second.addDevice('Accepted');
    assert.deepEqual(f.raw[f.key].knownDevices.map(p=>p.name),['A','B','Accepted']);
});
bounded('missing target rejects without changing selection or blocking later valid writes', async t => {
    const f=fixture(t), before=clone(f.raw);
    await assert.rejects(f.first.renameDevice('No','missing'),/not found/);
    await assert.rejects(f.first.selectDevice('missing'),/not found/);
    assert.deepEqual(f.raw,before); assert.equal(f.writes.length,0);
    await f.second.markRestored(); assert.ok(f.raw[f.key].lastRestoreAt);
});
for (const method of ['ensureState','markRestored','addDevice','renameDevice','selectDevice','setLastError']) bounded(`missing Web Locks refuses ${method} without a write`, async t => {
    const f=fixture(t), before=clone(f.raw);
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
    await assert.rejects(f.first[method]('a','a'),e=>e.code==='DRIVE_STATE_LOCK_UNAVAILABLE');
    assert.deepEqual(f.raw,before); assert.equal(f.writes.length,0);
});
bounded('queued metadata patch is detached from caller mutation', async t => {
    const f=fixture(t), gate=f.pauseRead(), first=f.first.markRestored(); await gate.entered.promise;
    const patch={lastError:'Original'}, second=f.second.saveState(patch); patch.lastError='Changed';
    gate.resume.resolve(); await Promise.all([first,second]); assert.equal(f.raw[f.key].lastError,'Original');
});

bounded('lock request rejection leaves all state untouched', async t => {
    const f=fixture(t), before=clone(f.raw);
    globalThis.navigator.locks.request=async()=>{throw Error('Synthetic lock unavailable');};
    await assert.rejects(f.first.markRestored(),/Synthetic lock unavailable/);
    assert.deepEqual(f.raw,before); assert.equal(f.writes.length,0); assert.equal(f.reads,0);
});
bounded('failed state read releases lock without fabricating a default profile', async t => {
    const f=fixture(t), before=clone(f.raw), get=chrome.storage.local.get;
    chrome.storage.local.get=async()=>{throw Error('Synthetic state read rejected');};
    await assert.rejects(f.first.ensureState(),/Synthetic state read rejected/);
    assert.deepEqual(f.raw,before); assert.equal(f.writes.length,0);
    chrome.storage.local.get=get; await f.second.addDevice('Accepted after read failure');
    assert.equal(f.raw[f.key].knownDevices.length,3);
});


bounded('committed write with lost acknowledgement is not rolled back or automatically retried', async t => {
    const f=fixture(t), set=chrome.storage.local.set; let lose=true;
    chrome.storage.local.set=async value=>{await set(value); if(lose){lose=false;throw Error('Synthetic acknowledgement lost');}};
    await assert.rejects(f.first.addDevice('Saved despite lost acknowledgement'),/Synthetic acknowledgement lost/);
    assert.equal(f.writes.length,1); assert.equal(f.raw[f.key].knownDevices.length,3);
    const id=f.raw[f.key].deviceId;
    const retry=await f.second.addDevice('Saved despite lost acknowledgement');
    assert.equal(retry.deviceCreated,false); assert.equal(retry.deviceId,id);
    assert.equal(f.raw[f.key].knownDevices.length,3);
});

for (const [label, patch] of Object.entries({
    profiles: {knownDevices:[]}, active: {activeDeviceId:'b'}, legacyId: {deviceId:'b'}, name: {deviceName:'Old'},
    unknown: {futureField:'value'}, invalidValue: {lastError:{}}, null: null, array: []
})) bounded(`status patch rejects ${label} instead of silently ignoring or overwriting it`, async t => {
    const f=fixture(t), before=clone(f.raw);
    await assert.rejects(f.first.saveState(patch),e=>e.code==='DRIVE_STATE_PATCH_INVALID');
    assert.deepEqual(f.raw,before); assert.equal(f.writes.length,0); assert.equal(f.reads,0);
});
bounded('old full-state patch cannot remove a concurrently saved computer through saveState', async t => {
    const f=fixture(t), old=clone(f.raw[f.key]); await f.second.addDevice('New computer');
    const before=clone(f.raw), writes=f.writes.length;
    await assert.rejects(f.first.saveState(old),e=>e.code==='DRIVE_STATE_PATCH_INVALID');
    assert.deepEqual(f.raw,before); assert.equal(f.writes.length,writes);
    assert.equal(f.raw[f.key].knownDevices.length,3);
});
bounded('all existing bookkeeping fields can update without changing any profiles', async t => {
    const f=fixture(t), original=clone(f.raw[f.key]);
    const patch={connectedAt:'Connected',lastBackupAt:'Backup',lastRestoreAt:'Restore',lastError:'Status'};
    await f.first.saveState(patch);
    assert.deepEqual(f.raw[f.key],{...original,...patch});
});
