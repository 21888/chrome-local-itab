'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const Storage = require('../storage');
const Workspaces = require('../shared/workspaces');
const clone = value => structuredClone(value);
const now = '2026-10-14T00:00:00.000Z';
function config(raw = false, enabled = true) {
    const value = new Storage().cloneDefaultConfig();
    value.links = (raw ? ['https://example.com', 'https://example.com/', 'example.com'] : ['https://canonical.example/']).map((url, index) => ({ title: `Synthetic ${index}`, url, icon: 'S', category: 'work' }));
    value.layout.positions = Object.fromEntries(value.links.map((link, index) => [`all|${link.url}`, { x: 11.25 + index * 100, y: 9.5 + index * 20 }]));
    value.sync.enabled = enabled; value.quote = 'Original synthetic quote'; return value;
}
async function fixture(localConfig, cloudConfig = null) {
    const raw = clone(localConfig), cloud = {}, localWrites = [], cloudWrites = [], hooks = {}, queues = new Map(), listeners = new Set();
    let sequence = 0, cloudReads = 0;
    const pick = (values, keys) => keys == null ? clone(values) : Object.fromEntries((typeof keys === 'string' ? [keys] : keys).filter(key => Object.hasOwn(values, key)).map(key => [key, clone(values[key])]));
    const local = { async get(keys) { return pick(raw, keys); }, async set(values) { localWrites.push(clone(values)); const changes = {};
        for (const [key, value] of Object.entries(values)) { changes[key] = { oldValue: clone(raw[key]), newValue: clone(value) }; raw[key] = clone(value); }
        for (const listener of listeners) listener(changes, 'local');
    }, async remove() { assert.fail('No local data deletion'); }, async getBytesInUse() { return 0; } };
    const sync = { async get(keys) { cloudReads++; if (hooks.cloudGet) await hooks.cloudGet(cloudReads, keys); return pick(cloud, keys); },
        async set(values) { cloudWrites.push(['set', clone(values)]); Object.assign(cloud, clone(values)); },
        async remove(keys) { cloudWrites.push(['remove', clone(keys)]); for (const key of keys) delete cloud[key]; }, async getBytesInUse() { return 0; } };
    const chrome = { storage: { local, sync, onChanged: { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); } } } };
    const locks = { request(name, options, fn) { const action = fn || options, prior = queues.get(name) || Promise.resolve(); const next = prior.catch(() => {}).then(action); queues.set(name, next); return next; } };
    const globals = ['chrome', 'navigator', 'crypto'], before = Object.fromEntries(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries({ chrome, navigator: { locks }, crypto: webcrypto })) Object.defineProperty(globalThis, key, { value, configurable: true });
    const manager = Workspaces.createManager({ chrome, locks, now: () => now, id: () => `synthetic_${++sequence}` });
    const session = manager.capture(); await session.ready(); const storage = new Storage({ workspace: session });
    if (cloudConfig) {
        const payload = clone(cloudConfig); delete payload.sync;
        const schema = payload.layout.identityVersion === 1 ? 2 : 1, payloadHash = await storage.fingerprint({ schema, payload });
        cloud[storage.syncMetaKey] = { enabled: true, version: 2, configurationSchemaVersion: schema, revision: 'synthetic-cloud', payloadHash, updatedAt: now, chunkCount: 1, payloadBytes: JSON.stringify(payload).length };
        cloud[storage.syncChunkPrefix + '0'] = JSON.stringify(payload);
    }
    localWrites.length = 0;
    return { raw, cloud, storage, session, localWrites, cloudWrites, hooks, reads: () => cloudReads,
        current: () => session.local.get(null), reset() { localWrites.length = 0; cloudWrites.length = 0; cloudReads = 0; },
        close() { storage.cancelSyncPush(); manager.destroy?.(); for (const key of globals) { if (before[key]) Object.defineProperty(globalThis, key, before[key]); else delete globalThis[key]; } } };
}
const refused = error => error.code === 'SYNC_IDENTITY_COMPATIBILITY' && error.kind === 'stored-url';
const content = value => Object.fromEntries(Object.keys(new Storage().defaultConfig).filter(key => key !== 'sync').map(key => [key, value[key]]));

for (const enabled of [false, true]) test(`initialization preserves raw identity and the local enabled=${enabled} preference without cloud reads`, async()=>{
    const f = await fixture(config(true, enabled), config());
    try { const before = await f.current(); await f.storage.ensureSyncInitialized(); const after = await f.current();
        assert.deepEqual(content(after), content(before)); assert.equal(after.sync.enabled, enabled); assert.equal(f.reads(), 0); assert.deepEqual(f.cloudWrites, []);
        if (enabled) assert.equal(after[f.storage.syncIdentityStateKey].blocked.kind, 'stored-url'); else assert.equal(f.localWrites.length, 0);
    } finally { f.close(); }
});
for (const enabled of [false, true]) test(`an empty cloud cannot authorize a raw-URL upload, enabled=${enabled}`, async()=>{
    const f = await fixture(config(true, enabled));
    try { const before = await f.current(); await assert.rejects(f.storage.pushToSync(), refused); const after = await f.current();
        assert.deepEqual(content(after), content(before)); assert.equal(after.sync.enabled, enabled); assert.deepEqual(f.cloudWrites, []);
    } finally { f.close(); }
});
for (const mode of ['ordinary', 'confirmed', 'own', 'ack']) test(`remote raw URLs cannot replace a canonical local copy via ${mode}`, async()=>{
    const f = await fixture(config(), config(true));
    try { f.storage._syncInitialized = true; const remote = await f.storage.readSyncSnapshot();
        if (mode === 'own' || mode === 'ack') await f.session.local.set({ [f.storage.syncIdentityStateKey]: mode === 'own' ? { ownWrites: [{ fingerprint: remote.fingerprint, revision: remote.revision, schema: remote.schema }] } : { ack: { fingerprint: remote.fingerprint, revision: remote.revision, schema: remote.schema } } });
        const before = await f.current(), oldCloud = clone(f.cloud); f.reset();
        const preview = await f.storage.previewCloudReplacement(); assert.equal(preview.shortcuts, 3);
        await assert.rejects(f.storage.pullFromSync(mode === 'confirmed' ? { confirmedReplacement: true, expectedRemote: preview } : {}), refused);
        const after = await f.current(); assert.deepEqual(content(after), content(before)); assert.equal(after.sync.enabled, before.sync.enabled); assert.deepEqual(f.cloud, oldCloud); assert.deepEqual(f.cloudWrites, []);
    } finally { f.close(); }
});
test('an explicit confirmed pull cannot overwrite a local raw-URL copy', async()=>{
    const f = await fixture(config(true), config());
    try { f.storage._syncInitialized = true; const before = await f.current(), preview = await f.storage.previewCloudReplacement();
        await assert.rejects(f.storage.pullFromSync({ confirmedReplacement: true, expectedRemote: preview }), refused);
        assert.deepEqual(content(await f.current()), content(before)); assert.deepEqual(f.cloudWrites, []);
    } finally { f.close(); }
});
test('the final upload admission rechecks URL spelling after its ticket was prepared', async()=>{
    const f = await fixture(config());
    try { f.storage._syncInitialized = true; let injected = false;
        f.hooks.cloudGet = async count => { if (count === 2) { injected = true; await f.session.local.set({ links: config(true).links, layout: config(true).layout }); } };
        await assert.rejects(f.storage.pushToSync(), refused); assert(injected); assert.deepEqual(f.cloudWrites, []);
        assert.deepEqual((await f.current()).links, config(true).links);
    } finally { f.close(); }
});
test('canonical-only first upload remains available under the existing contract', async()=>{
    const f = await fixture(config());
    try { f.storage._syncInitialized = true; await f.storage.pushToSync(); assert(f.cloudWrites.some(([kind])=>kind === 'set')); assert.equal((await f.current()).sync.enabled, true); }
    finally { f.close(); }
});
test('cloud clearing retains exact raw cloud configuration in a versioned verified recovery first', async()=>{
    const f = await fixture(config(), config(true));
    try { f.storage._syncInitialized = true; const before = await f.current(), payload = JSON.parse(f.cloud[f.storage.syncChunkPrefix+'0']);
        await f.storage.clearSync(); const after = await f.current(), recovery = after[f.storage.restoreRecoveryKey];
        assert.deepEqual(content(after), content(before)); assert.deepEqual(recovery.rawConfiguration, payload);
        assert.equal(recovery.payload.version,'2.0'); assert.equal(recovery.payload.urlIdentityVersion,1);
        assert.equal(recovery.rawConfigurationChecksum,await f.storage.fingerprint(payload));
        assert.deepEqual(f.storage.validateImportPayload(await f.storage.getRecoveryBackup()).links,payload.links);
        assert(f.cloudWrites.some(([kind])=>kind==='remove'));
    } finally { f.close(); }
});
test('stored URL classification and serialization reject accessors without executing them',()=>{
    const storage = new Storage(); let called=0; const value={};Object.defineProperty(value,'links',{enumerable:true,get(){called++;return[];}});
    assert.throws(()=>storage.hasLegacyURLSpelling(value));assert.throws(()=>storage.prepareSyncPayload(value));assert.throws(()=>storage.validateStoredConfigObject(value));assert.equal(called,0);
    const schema2=config();schema2.layout={identityVersion:1,positionsById:{}};Object.defineProperty(schema2.links[0],'url',{enumerable:true,get(){called++;return'https://example.com';}});
    assert.throws(()=>storage.validateStoredConfigObject(schema2));assert.equal(called,0);
});

test('affected exports bind the version and URL-identity marker; unknown or mixed declarations fail closed',()=>{
 const storage=new Storage(),raw=config(true),payload=storage.buildManualExportPayload(raw);
 assert.equal(payload.version,'2.0');assert.equal(payload.urlIdentityVersion,1);assert.deepEqual(storage.validateImportPayload(payload).links,raw.links);
 const corruptions=[p=>{p.version='1.0';},p=>{delete p.version;},p=>{delete p.urlIdentityVersion;},p=>{p.urlIdentityVersion=2;},p=>{p.urlIdentityVersion='1';},p=>{p.schemaVersion=3;},p=>{p.app='unknown';},p=>{p.type='unknown';},p=>{p.unknown=true;},p=>{p.data.unknown=true;},p=>{p.data.links[0].unknown=true;}];
 for(const corrupt of corruptions){const next=clone(payload);corrupt(next);assert.throws(()=>storage.validateImportPayload(next));}
 const ordinary=storage.buildManualExportPayload(config());assert.equal(ordinary.version,'1.0');assert(!Object.hasOwn(ordinary,'urlIdentityVersion'));
 const declared={...ordinary,version:'2.0',urlIdentityVersion:1,type:'backupSnapshot',app:'local-itab'};assert.deepEqual(storage.validateImportPayload(declared).links,ordinary.data.links);
 const drive=storage.buildDriveBackupPayload(raw);assert.equal(drive.version,'2.0');assert.equal(drive.metadata.urlIdentityVersion,1);assert.deepEqual(storage.validateImportPayload(drive).layout,raw.layout);
 for(const mutate of [p=>{delete p.metadata.urlIdentityVersion;},p=>{p.metadata.schemaVersion=2;},p=>{p.metadata.app='other';},p=>{p.metadata.unknown=true;}]){const next=clone(drive);mutate(next);assert.throws(()=>storage.validateImportPayload(next));}
});

test('canonical URL behavior and strict new-input normalization are not broadened or globally tightened',()=>{
 const storage=new Storage();for(const url of ['https://synthetic:password@example.com/','https://example.com/%ZZ']){
   const links=[{title:'Canonical old contract',url,icon:'S',category:'work'}];assert.equal(storage.validateLinksConfig(links)[0].url,url);assert.equal(storage.validateStoredLinksConfig(links)[0].url,url);
 }
 assert.equal(storage.validateLinksConfig([{title:'New input',url:'example.com'}])[0].url,'https://example.com/');
 for(const url of ['https://EXAMPLE.com/%ZZ','https://synthetic:password@EXAMPLE.com','HTTPS://example.com','example.com:8080'])assert.throws(()=>storage.validateStoredLinksConfig([{title:'New legacy exception',url,icon:'S',category:'work'}]));
});

test('runtime configuration copying retains the existing workspace capacity rather than bookmark byte estimates',()=>{
 const storage=new Storage(),raw=config(),quote='x'.repeat(12*1024*1024);raw.quote=quote;
 assert.equal(storage.validateStoredConfigObject(raw).quote,quote);
 assert.equal(storage.completeBackupConfigFromRaw(raw).data.quote,quote);
 assert.equal(storage.validateImportPayload(raw).quote,quote);
 const budget={nodes:0,chars:128*1024*1024-1};assert.equal(storage.copyStoredValue('x',0,new Set(),budget),'x');assert.throws(()=>storage.copyStoredValue('x',0,new Set(),budget));
 let read=0;Object.defineProperty(raw,'__syntheticAuth',{enumerable:true,get(){read++;throw Error('must not read unrelated fields');}});
 assert.equal(storage.validateStoredConfigObject(raw).quote,quote);assert.equal(read,0);
});

test('new stored-URL refusals never enter standalone read default-writing fallbacks',async()=>{
 const before=Object.getOwnPropertyDescriptor(globalThis,'chrome'),original=config();original.links[0].url='//unsupported.example/';const raw=clone(original);let writes=0;
 Object.defineProperty(globalThis,'chrome',{configurable:true,value:{storage:{local:{async get(keys){return keys==null?clone(raw):Object.fromEntries(keys.filter(key=>Object.hasOwn(raw,key)).map(key=>[key,clone(raw[key])]));},async set(){writes++;throw Error('Forbidden fallback write');}}}}});
 try {const storage=new Storage();storage._syncInitialized=true;await assert.rejects(storage.get('links'),error=>error.code==='STORED_CONFIG_INVALID');await assert.rejects(storage.getAll(),error=>error.code==='STORED_CONFIG_INVALID');assert.equal(writes,0);assert.deepEqual(raw,original);}
 finally {if(before)Object.defineProperty(globalThis,'chrome',before);else delete globalThis.chrome;}
});

for(const kind of ['unknown-legacy-field','accessor','copy-limit'])test(`standalone ${kind} refusal preserves its source and makes no fallback write`,async()=>{
 const before=Object.getOwnPropertyDescriptor(globalThis,'chrome'),raw=config(true);let writes=0,reads=0;
 if(kind==='unknown-legacy-field')raw.links[0].unknown={meaning:'must retain'};
 if(kind==='accessor')Object.defineProperty(raw.links[0],'url',{enumerable:true,get(){reads++;return'https://example.com';}});
 if(kind==='copy-limit')raw.links=Array(250001).fill(null);
 const originalLinks=raw.links;Object.defineProperty(globalThis,'chrome',{configurable:true,value:{storage:{local:{async get(keys){return keys==null?raw:Object.fromEntries(keys.filter(key=>Object.hasOwn(raw,key)).map(key=>[key,raw[key]]));},async set(){writes++;throw Error('Forbidden fallback write');}}}}});
 try{const storage=new Storage();storage._syncInitialized=true;for(const read of [()=>storage.get('links'),()=>storage.getAll()])await assert.rejects(read,error=>error.code==='STORED_CONFIG_INVALID');assert.equal(writes,0);assert.equal(reads,0);assert.equal(raw.links===originalLinks,true);if(kind==='unknown-legacy-field')assert.deepEqual(raw.links[0].unknown,{meaning:'must retain'});}
 finally{if(before)Object.defineProperty(globalThis,'chrome',before);else delete globalThis.chrome;}
});
