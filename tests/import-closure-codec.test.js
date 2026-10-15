'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const C = require('../shared/import-closure.js');
const { Storage, Workspaces, Backup, fixture, withGlobals, seed, boot, values, clone } = require('./helpers/complete-import-receipt-fixture');
const crypto = webcrypto;
async function envelope() {
    const current = { quote: 'Synthetic current', privacy: { onlineFavicons: false }, __localItabSettingsGeneration: 'synthetic_fence' };
    const recovery = { reason: 'beforeRestore', payload: { quote: 'Synthetic original' }, providerState: { enabled: false, deviceId: 'synthetic_local_only' }, previousRecovery: { untouched: true } };
    const receipt = { version: 1, status: 'pending', request: 'a'.repeat(64), target: 'b'.repeat(64), recovery: await C.digest(recovery, { crypto }) };
    const body = { action: C.ACTION, reviewedAt: '2026-10-15T00:00:00.000Z', decidedAt: '2026-10-15T00:01:00.000Z', owner: { migrationId: 'synthetic_lineage', workspaceId: 'default', generation: 'synthetic_generation', label: 'Synthetic' }, receipt, current, recovery,
        receiptDigest: await C.digest(receipt, { crypto }), currentDigest: await C.digest(current, { crypto }), recoveryDigest: receipt.recovery };
    return { schemaVersion: 1, body, id: await C.digest(body, { crypto }) };
}
test('strict codec hashes exactly like production StorageManager and retains complete evidence', async () => {
    const f = fixture(); await withGlobals(f, async () => {
        const e = await envelope(), v = await C.validate(e, { crypto }), storage = new Storage();
        for (const value of [e.body, e.body.receipt, e.body.current, e.body.recovery]) assert.equal(await C.digest(value, { crypto }), await storage.fingerprint(value));
        assert.deepEqual(v, e); assert(Object.isFrozen(v.body.recovery.providerState));
        assert(C.matches(v, { migrationId: 'synthetic_lineage', workspaceId: 'default', receipt: e.body.receipt }));
        assert(!C.matches(e, { migrationId: 'synthetic_lineage', workspaceId: 'default', receipt: e.body.receipt }));
        assert(!C.matches(v, { migrationId: 'other', workspaceId: 'default', receipt: e.body.receipt }));
        assert.deepEqual(C.inventory(seed()), storage.restoreReceiptState(seed()));
        assert(!C.TARGET_KEYS.includes('sync')); assert(!Workspaces.GLOBAL_KEYS.includes(C.KEY)); assert(!Workspaces.SCOPED_KEYS.includes(C.KEY));
    });
});
test('strict JSON never invokes or discards accessors, hidden keys, symbols, holes, or forbidden names', () => {
    const bad = [{ a: undefined }, { a: NaN }, { a: -0 }, new Date(), [1,,2], Object.assign([1], { extra: 3 }), JSON.parse('{"__proto__":1}'), Object.defineProperty({}, 'hidden', { value: 1 }), { [Symbol('private')]: 1 }, Object.defineProperty({}, 'getter', { enumerable: true, get() { assert.fail('getter invoked'); } })];
    bad.push(Object.create({ inherited: true }), Object.create(Object.create(null)));
    const forgedPrototype=Object.assign(Object.create(null), { constructor: Object, inherited: true });bad.push(Object.create(forgedPrototype));
    const accessorConstructor=Object.create(null);Object.defineProperty(accessorConstructor,'constructor',{value:{get name(){assert.fail('constructor name getter invoked');}}});bad.push(Object.create(accessorConstructor));
    assert.throws(() => C.inventory(Object.defineProperty({}, 'quote', { value: 'hidden' })));
    const cycle = {}; cycle.me = cycle; bad.push(cycle);
    for (const value of bad) assert.throws(() => C.copy(value));
    let deep = {}; for (let n=0;n<66;n++) deep={deep}; assert.throws(() => C.copy(deep), /SIZE_LIMIT/);
    assert.throws(() => C.copy('a'.repeat(C.LIMITS.bytes)), /SIZE_LIMIT/);
    assert.throws(() => C.copy(Array(C.LIMITS.nodes).fill(null)), /SIZE_LIMIT/);
});
test('invalid, unsupported, missing and changed envelopes have no authority', async () => {
    const e = await envelope();
    assert.equal((await C.inspect(undefined, { present: false })).status, 'empty');
    assert.equal((await C.inspect({ ...e, schemaVersion: 2 }, { crypto })).status, 'unsupported');
    for (const mutate of [v=>v.body.receipt.status='verified',v=>v.body.current.quote='changed',v=>v.body.recovery.providerState.deviceId='changed',v=>v.body.extra=1,v=>v.id='0'.repeat(64)]) {
        const broken=clone(e); mutate(broken); assert.equal((await C.inspect(broken,{crypto})).status,'invalid');
    }
    assert.equal((await C.inspect(e,{crypto:null})).status,'invalid');
});
test('stage-one root evidence is protected from generic writes, reset and legacy migration', async () => {
    const retained = { schemaVersion: 99, opaque: ['Synthetic future evidence'] }, f=fixture({...seed(),[C.KEY]:retained});
    await withGlobals(f,async()=>{
        const legacy = new Storage(); legacy._syncInitialized=true;
        for(const action of [()=>legacy.set(C.KEY,{}),()=>legacy.setAll({[C.KEY]:{}}),()=>legacy.writeLocalValues({[C.KEY]:{}})]) await assert.rejects(action(),e=>e.code==='IMPORT_CLOSURE_BOUNDARY');
        const b=await boot(f); assert(!Object.hasOwn(f.raw[Workspaces.SNAPSHOT_KEY].values,C.KEY));
        await assert.rejects(b.manager.verifiedSet({[C.KEY]:{}}),e=>e.code==='WORKSPACE_BOUNDARY');
        await assert.rejects(b.session.local.set({[C.KEY]:{}}),e=>e.code==='WORKSPACE_BOUNDARY');
        await assert.rejects(b.session.local.remove([C.KEY]),e=>e.code==='WORKSPACE_BOUNDARY');
        await b.storage.clear(); assert.deepEqual(f.raw[C.KEY],retained);
        assert(!JSON.stringify(await b.store.export(['config'])).includes('Synthetic future evidence'));
        const preset=require('../shared/workspace-presets.js').createBackend(f.chrome,f.locks);
        assert.throws(()=>preset.write({[C.KEY]:{}}),e=>e.code==='IMPORT_CLOSURE_BOUNDARY');
        const backend=Backup.createBackend(legacy,f.chrome,f.locks);
        assert.throws(()=>backend.write({[C.KEY]:{}}),e=>e.code==='BOUNDARY');
    });
    const root=fixture({...seed(),[C.KEY]:retained});
    await withGlobals(root,async()=>{
        root.chrome.storage.local.remove=async keys=>{ for(const key of keys) delete root.raw[key]; };
        const s=new Storage();s._syncInitialized=true;assert(await s.clear());assert.deepEqual(root.raw[C.KEY],retained);
    });
});
module.exports={envelope};

test('workspace labels retain eighty Unicode code points exactly',async()=>{const e=await envelope();e.body.owner.label='😀'.repeat(80);e.id=await C.digest(e.body,{crypto});assert.equal((await C.validate(e,{crypto})).body.owner.label,e.body.owner.label);});
