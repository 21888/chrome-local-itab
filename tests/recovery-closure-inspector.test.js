'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const Inspector = require('../shared/recovery-inspector');
const Closure = require('../shared/import-closure');
const Storage = require('../storage');
const NOW = '2026-10-15T04:00:00.000Z';
const clone = value => structuredClone(value);
const OWNER = { migrationId: 'origin1', workspaceId: 'default', generation: 'gen1', label: 'Saved source' };
const bundleKey = '__localItabWorkspaceV1:default:gen1';
const digest = value => Closure.digest(value, { crypto: webcrypto });
async function fixture({ current = true, registry = true, privacy = true } = {}) {
    const rawCurrent = new Storage().cloneDefaultConfig(); delete rawCurrent.sync;
    Object.assign(rawCurrent, { schemaVersion: 2, __localItabLayoutGeneration: 'layout1', __localItabSettingsGeneration: 'settings1', quote: 'Synthetic decision-time current' });
    const original = clone(rawCurrent); original.quote = 'Synthetic original';
    const recovery = { reason: 'beforeRestore', rawConfiguration: original, rawConfigurationChecksum: await digest(original), providerState: { secret: 'SYNTHETIC_ARCHIVE_PROVIDER_SECRET' } };
    const receipt = { version: 1, status: 'pending', request: await digest('synthetic file'), target: await digest({ ...rawCurrent, quote: 'Synthetic intended target' }), recovery: await digest(recovery) };
    const body = { action: Closure.ACTION, reviewedAt: NOW, decidedAt: NOW, owner: clone(OWNER), receipt,
        current: rawCurrent, recovery, receiptDigest: await digest(receipt), currentDigest: await digest(rawCurrent), recoveryDigest: await digest(recovery) };
    const archive = { schemaVersion: 1, id: await digest(body), body };
    const raw = { [Closure.KEY]: archive }, reads = [], writes = [];
    if (privacy) raw.privacy = clone(rawCurrent.privacy);
    if (registry) {
        raw[Inspector.KEYS.registry] = { schemaVersion: 1, revision: 0, defaultId: 'default', lastUsedId: 'default', migrationId: 'origin1', workspaces: [
            { id: 'default', generation: 'gen1', name: 'Current source', order: 0, createdAt: NOW, updatedAt: NOW, deletedAt: null }
        ] };
        raw[Inspector.KEYS.activation] = { schemaVersion: 1, migrationId: 'origin1', defaultId: 'default' };
    }
    if (current) { const values = clone(rawCurrent); delete values.privacy; values.__localItabRestoreReceiptV1 = clone(receipt); values[Inspector.KEYS.restore] = clone(recovery);
        raw[bundleKey] = { schemaVersion: 1, id: 'default', generation: 'gen1', values }; }
    const local = { async get(keys) { assert(Array.isArray(keys) && keys.length === 1); assert(keys.every(key => Inspector.BASE_KEYS.includes(key) || /^__localItabWorkspaceV1:[\w-]+:[\w-]+$/.test(key))); reads.push([...keys]); return Object.fromEntries(keys.filter(key => Object.hasOwn(raw,key)).map(key => [key,clone(raw[key]) ])); },
        async set(value) { writes.push(value); assert.fail('Forbidden inspector write'); }, async remove() { assert.fail('Forbidden remove'); }, async clear() { assert.fail('Forbidden clear'); } };
    return { raw, reads, writes, archive, local, api: Inspector.createInspector({ local, crypto: webcrypto, now: () => NOW }) };
}
test('root closure is historical evidence while exact current pending operation is separately marked closed', async () => {
    const f = await fixture(), before = clone(f.raw), report = await f.api.inspect();
    assert.equal(report.closure.status,'valid'); assert.equal(report.closure.active,true); assert.equal(report.closure.currentRelation,'sameOperation');
    assert.equal(report.imports[0].status,'pending'); assert.equal(report.imports[0].closureStatus,'closed');
    const archived = report.entries.filter(row => row.source.closureArchiveId);
    assert.equal(archived.length,2); assert(archived.every(row => row.source.identityStatus === 'historical'));
    assert.deepEqual(archived.map(row => row.source.closurePart),['current','originalRecovery']);
    assert(!JSON.stringify(report).includes('SYNTHETIC_ARCHIVE_PROVIDER_SECRET'));
    assert(!JSON.stringify(report).includes('Synthetic decision-time current'));
    for (const row of archived) assert(!f.api.exportEntry(report,row.id).includes('SYNTHETIC_ARCHIVE_PROVIDER_SECRET'));
    await assert.rejects(() => f.api.reviewRecovery(report,archived[0].id));
    assert.deepEqual(f.raw,before); assert.deepEqual(f.writes,[]);
});
for (const kind of ['missing registry','owner absent','generation change','different receipt','different lineage']) test(`fixed root archive survives ${kind} without invented current attribution`, async () => {
    const f = await fixture();
    if (kind==='missing registry') {delete f.raw[Inspector.KEYS.registry];delete f.raw[Inspector.KEYS.activation];}
    if (kind==='owner absent') {f.raw[Closure.KEY].body.owner.workspaceId='gone';f.raw[Closure.KEY].id=await digest(f.raw[Closure.KEY].body);}
    if (kind==='generation change') {f.raw[Inspector.KEYS.registry].workspaces[0].generation='gen2';f.raw['__localItabWorkspaceV1:default:gen2']={...clone(f.raw[bundleKey]),generation:'gen2'};}
    if (kind==='different receipt') f.raw[bundleKey].values.__localItabRestoreReceiptV1.target='a'.repeat(64);
    if (kind==='different lineage') {f.raw[Inspector.KEYS.registry].migrationId='origin2';f.raw[Inspector.KEYS.activation].migrationId='origin2';}
    const report = await f.api.inspect(); assert.equal(report.closure.status,'valid');
    assert.equal(report.closure.active,kind==='generation change');
    assert.equal(report.entries.filter(row=>row.source.closureArchiveId).length,2);
    assert.equal(report.closure.owner.originGeneration,'gen1');
    assert(f.reads.some(keys=>keys[0]===Closure.KEY)); assert.deepEqual(f.writes,[]);
});
for (const kind of ['null','unknown version','checksum damage','missing recovery','hidden projection']) test(`invalid archive ${kind} never supplies closure authority or recovery entries`, async () => {
    const f = await fixture();
    if(kind==='null') f.raw[Closure.KEY]=null;
    if(kind==='unknown version') f.raw[Closure.KEY].schemaVersion=2;
    if(kind==='checksum damage') f.raw[Closure.KEY].id='0'.repeat(64);
    if(kind==='missing recovery') delete f.raw[Closure.KEY].body.recovery;
    if(kind==='hidden projection') {const get=f.local.get;f.local.get=async keys=>{const result=await get(keys);if(keys[0]===Closure.KEY)Object.defineProperty(result[Closure.KEY].body,'hidden',{value:'private',enumerable:false});return result;};}
    const report=await f.api.inspect(); assert.notEqual(report.closure.status,'valid');
    assert(!report.imports.some(row=>row.closureStatus==='closed'));assert(!report.entries.some(row=>row.source.closureArchiveId));
});
test('archive mutation during its digest invalidates the whole inspection',async()=>{
    const f=await fixture();let mutated=false;
    const crypto={subtle:{digest:async(algorithm,data)=>{const text=new TextDecoder().decode(data);if(!mutated&&text.includes('abandon-unverified-keep-current')){mutated=true;f.raw[Closure.KEY].id='b'.repeat(64);}return webcrypto.subtle.digest(algorithm,data);}}};
    await assert.rejects(()=>Inspector.createInspector({local:f.local,crypto,now:()=>NOW}).inspect(),error=>error.code==='CHANGED');assert(mutated);assert.deepEqual(f.writes,[]);
});
test('no root archive yields a distinct absent status with no new authority',async()=>{
    const f=await fixture();delete f.raw[Closure.KEY];const report=await f.api.inspect();assert.equal(report.closure.status,'absent');assert(!report.imports.some(row=>row.closureStatus==='closed'));
});
test('archived original still uses the independent strict recovery-file gate and never exports the envelope',async()=>{
    const f=await fixture();
    const body=f.raw[Closure.KEY].body;
    body.recovery.rawConfiguration.schemaVersion=1;
    body.recovery.rawConfigurationChecksum=await digest(body.recovery.rawConfiguration);
    body.recoveryDigest=await digest(body.recovery);body.receipt.recovery=body.recoveryDigest;body.receiptDigest=await digest(body.receipt);
    f.raw[Closure.KEY].id=await digest(body);
    const report=await f.api.inspect(), original=report.entries.find(row=>row.source.closurePart==='originalRecovery');
    const review=await f.api.reviewRecovery(report,original.id), text=f.api.exportRecovery(report,original.id,review);
    assert(!text.includes('SYNTHETIC_ARCHIVE_PROVIDER_SECRET'));assert(!text.includes(Closure.KEY));assert(!text.includes(body.receipt.request));
    assert(!text.includes('abandon-unverified-keep-current'));assert(text.includes('Synthetic original'));
});
test('fixed archive gets row priority when ordinary current recovery histories exhaust the entry budget',async()=>{
    const f=await fixture();let chain;
    for(let depth=0;depth<31;depth++) {const rawConfiguration={quote:`Synthetic history ${depth}`};chain={reason:'beforeRestore',rawConfiguration,rawConfigurationChecksum:await digest(rawConfiguration),...(chain?{previousRecovery:chain}:{})};}
    const registry=f.raw[Inspector.KEYS.registry];
    for(let index=0;index<18;index++){
        const id=index?'named'+index:'default',generation=index?'named_gen'+index:'gen1';
        if(index)registry.workspaces.push({...clone(registry.workspaces[0]),id,generation,name:'History '+index,order:index});
        const values=clone(f.raw[bundleKey].values);values[Inspector.KEYS.restore]=clone(chain);
        f.raw[`__localItabWorkspaceV1:${id}:${generation}`]={schemaVersion:1,id,generation,values};
    }
    const report=await f.api.inspect();assert.equal(report.entries.length,Inspector.LIMITS.entries);assert(report.warnings.includes('CHAIN_LIMIT'));
    assert.equal(report.closure.status,'valid');assert.equal(report.entries.filter(row=>row.source.closureArchiveId).length,2);
    assert(report.entries.slice(0,2).every(row=>row.source.closureArchiveId));
    assert(f.reads.findIndex(keys=>keys[0]===Closure.KEY)<f.reads.findIndex(keys=>keys[0]===bundleKey));
});
test('fixed archive is read before root legacy configurations can exhaust the shared byte budget',async()=>{
    const f=await fixture();f.raw.quote='x'.repeat(Inspector.LIMITS.bytes+1);
    const report=await f.api.inspect();assert.equal(report.closure.status,'valid');assert.equal(report.entries.filter(row=>row.source.closureArchiveId).length,2);
    assert(report.warnings.includes('SIZE_LIMIT'));assert(f.reads.findIndex(keys=>keys[0]===Closure.KEY)<f.reads.findIndex(keys=>keys[0]==='quote'));
});
