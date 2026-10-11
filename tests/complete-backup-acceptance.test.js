const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture,synthetic,accepted,Backup,Workspaces,Prompts,Collections,copy} = require('./helpers/complete-backup-acceptance.js');
const {withoutTime,compareRestore,compareRecovery} = require('./helpers/complete-backup-comparison.js');
const exported = async f => JSON.parse(await f.store.export());

test('seven-module roundtrip reconstructs stores from serialized storage and retains exact historical prompt links',async()=>{
    const source=await synthetic('source'), target=await synthetic('target');
    const a=await exported(source), b=await exported(target);
    for (const file of [a,b]) for(const name of ['prompts','collections']) {
        assert(file.globals[name].content.records.some(record=>record.deletedAt !== null));
        assert.equal(file.globals[name].recovery.length,1);
    }
    await target.store.restore(await target.store.review(JSON.stringify(a),null,accepted),{confirmed:true});
    const fresh=fixture({persisted:JSON.parse(JSON.stringify(target.raw))});
    const c=await exported(fresh); assert(compareRestore(a,b,c,Backup.MODULES,JSON.parse(await fresh.store.recovery())));
    assert.deepEqual(withoutTime(JSON.parse(await fresh.store.recovery())),withoutTime(b));
    const record=fresh.raw[Collections.KEY].records[0];
    const resolved=Collections.resolvePromptReference(record,(id,version)=>Prompts.getVersion(fresh.raw[Prompts.KEY],id,version));
    assert.equal(resolved.status,'resolved'); assert.equal(resolved.version.body,source.original.body);
    assert.notEqual(record.promptRef.bodyVersionId,fresh.raw[Prompts.KEY].records[0].currentVersionId);
    assert.deepEqual(await exported(fresh),c,'fresh reads do not mutate archives');
});

for (const selected of [Backup.SCOPED_MODULES,['scratchpad'],['collections'],['prompts']]) test(`seven-module selective restore ${selected.join('+')} keeps all deselected payloads exact`,async()=>{
    const source=await synthetic('source'), target=await synthetic('target'), before=copy(target.raw);
    const a=await exported(source), b=await exported(target);
    await target.store.restore(await target.store.review(JSON.stringify(a),selected,accepted),{confirmed:true});
    const fresh=fixture({persisted:JSON.parse(JSON.stringify(target.raw))});
    assert(compareRestore(a,b,await exported(fresh),selected,JSON.parse(await fresh.store.recovery())));
    assert(compareRecovery(b,JSON.parse(await fresh.store.recovery()),selected));
    for (const [name,api] of [['prompts',Prompts],['collections',Collections]]) if(!selected.includes(name)) assert.deepEqual(fresh.raw[api.KEY],before[api.KEY]);
    if(selected.length===1 && selected[0]==='collections') {
        const record=fresh.raw[Collections.KEY].records[0];
        const result=Collections.resolvePromptReference(record,(id,version)=>Prompts.getVersion(fresh.raw[Prompts.KEY],id,version));
        assert.equal(result.status,'unresolved'); assert.deepEqual(result.reference,a.globals.collections.content.records[0].promptRef);
    }
});

test('seven-module cancel before authority switch survives reconstructed stores with exact baseline globals and workspaces',async()=>{
    const source=await synthetic('source'), target=await synthetic('target'), b=await exported(target); let current=true;
    const preview=await target.store.review(await source.store.export(),null,accepted);
    target.hooks.set=(values,raw)=>{Object.assign(raw,copy(values));if(Object.keys(values).some(key=>key.startsWith(Workspaces.PREFIX)))current=false;};
    await assert.rejects(target.store.restore(preview,{confirmed:true,isCurrent:()=>current}),e=>e.code==='CANCELLED');
    const fresh=fixture({persisted:JSON.parse(JSON.stringify(target.raw))});
    assert.deepEqual(withoutTime(await exported(fresh)),withoutTime(b));
    assert.deepEqual(withoutTime(JSON.parse(await fresh.store.recovery())),withoutTime(b));
});

test('comparison rejects body identity, linked version and deselected revision loss rather than normalizing them away',async()=>{
    const source=await synthetic('source'), target=await synthetic('target'), a=await exported(source), b=await exported(target);
    await target.store.restore(await target.store.review(JSON.stringify(a),['scratchpad'],accepted),{confirmed:true});const c=await exported(target), recovery=JSON.parse(await target.store.recovery());
    for(const mutate of [file=>file.globals.collections.content.records[0].promptRef.bodyVersionId='wrong',file=>file.globals.prompts.content.records[0].history[0].body='lost',file=>file.globals.prompts.content.records[0].revision++]) {
        const corrupted=copy(c);mutate(corrupted);assert.throws(()=>compareRestore(a,b,corrupted,['scratchpad'],recovery));
    }
});

test('partial combined submission fences freshly reconstructed stores until separately reviewed recovery',async()=>{
    const source=await synthetic('source'),target=await synthetic('target'),before=copy(target.raw),b=await exported(target);
    const preview=await target.store.review(await source.store.export(),null,accepted);
    target.hooks.set=(values,raw)=>{if(Object.hasOwn(values,Workspaces.REGISTRY_KEY)){raw[Collections.KEY]=copy(values[Collections.KEY]);return;}Object.assign(raw,copy(values));};
    await assert.rejects(target.store.restore(preview,{confirmed:true}),e=>e.code==='UNCONFIRMED');
    const fresh=fixture({persisted:JSON.parse(JSON.stringify(target.raw))});
    const direct=new Collections.Store(Collections.createChromeBackend(fresh.chrome,fresh.locks));
    await assert.rejects(direct.read(),e=>e.code==='RESTORE_PENDING');
    await assert.rejects(direct.mutate(direct.request('add',{title:'Blocked fresh write',body:'Synthetic'})),e=>e.code==='RESTORE_PENDING');
    const inspection=await fresh.store.inspectInterruptedRestore();assert(inspection.pending&&inspection.canRecover);
    await assert.rejects(fresh.store.recoverInterruptedRestore(inspection,{confirmed:false}),e=>e.code==='CONFIRMATION');
    assert.equal(fresh.writes.length,0);
    await fresh.store.recoverInterruptedRestore(inspection,{confirmed:true});
    const reopened=fixture({persisted:JSON.parse(JSON.stringify(fresh.raw))});
    assert.deepEqual(withoutTime(await exported(reopened)),withoutTime(b));
    for(const api of [Prompts,Collections])assert.deepEqual(reopened.raw[api.KEY],before[api.KEY]);
    assert.equal(reopened.raw[Workspaces.RESTORE_TRANSACTION_KEY].status,'recovered');
});

test('comparison accepts collection recovery-only baseline without inventing an empty displaced snapshot',async()=>{
    const source=await synthetic('source'),target=await synthetic('target');
    // A valid recovery-only state is modeled directly to cover the verifier's
    // boundary independently of UI pathways for managing archived records.
    target.raw[Collections.KEY].records=[];target.raw[Collections.KEY].receipts=[];
    Collections.validate(target.raw[Collections.KEY]);
    const a=await exported(source),b=await exported(target);
    await target.store.restore(await target.store.review(JSON.stringify(a),['collections'],accepted),{confirmed:true});
    const c=await exported(target);assert(compareRestore(a,b,c,['collections'],JSON.parse(await target.store.recovery())));
    assert.equal(c.globals.collections.recovery.length,2,'retained baseline and imported history only');
});

const advancingClock = () => { let tick=Date.parse('2026-10-11T12:00:00.000Z');return ()=>new Date(tick++).toISOString(); };
for(const selected of [Backup.MODULES,Backup.SCOPED_MODULES,['scratchpad'],['config'],['prompts'],['collections']]) test(`advancing-clock restore ${selected.join('+')} bounds only staged workspace timestamps`,async()=>{
    const source=await synthetic('source'),clock=advancingClock(),target=await synthetic('target',{clock});
    const a=await exported(source),b=await exported(target);
    await target.store.restore(await target.store.review(JSON.stringify(a),selected,accepted),{confirmed:true});
    const reopened=fixture({persisted:copy(target.raw),clock}),c=await exported(reopened),recovery=JSON.parse(await reopened.store.recovery());
    assert(compareRestore(a,b,c,selected,recovery));assert(compareRecovery(b,recovery,selected));
    const scoped=selected.some(name=>Backup.SCOPED_MODULES.includes(name));
    for(const [group,entries] of [['live',c.registry.entries],['trash',c.trash]]) for(const entry of entries) {
        const previous=(group==='live'?b.registry.entries:b.trash).find(item=>item.id===entry.id);
        if(scoped) {assert.notEqual(entry.updatedAt,previous.updatedAt);assert(Date.parse(entry.updatedAt)>=Date.parse(recovery.exportedAt));assert(Date.parse(entry.updatedAt)<=Date.parse(c.exportedAt));}
        else assert.equal(entry.updatedAt,previous.updatedAt);
    }
    if(scoped) assert.throws(()=>compareRestore(a,b,c,selected),'missing recovery cannot silently weaken the bound');
});

for(const selected of [['scratchpad'],['config']]) test(`identical portable ${selected[0]} still stages revision or generation fences`,async()=>{
    const clock=advancingClock(),target=await synthetic('target',{clock}),b=await exported(target);
    await target.store.restore(await target.store.review(JSON.stringify(b),selected,accepted),{confirmed:true});
    const c=await exported(target),recovery=JSON.parse(await target.store.recovery());
    assert(compareRestore(b,b,c,selected,recovery));
    for(let i=0;i<c.registry.entries.length;i++)assert.notEqual(c.registry.entries[i].updatedAt,b.registry.entries[i].updatedAt);
    assert.notEqual(c.trash[0].updatedAt,b.trash[0].updatedAt);
});

test('timestamp comparison rejects invalid, out-of-window and unrelated metadata changes without altering input files',async()=>{
    const clock=advancingClock(),source=await synthetic('source'),target=await synthetic('target',{clock}),a=await exported(source),b=await exported(target);
    await target.store.restore(await target.store.review(JSON.stringify(a),['scratchpad'],accepted),{confirmed:true});
    const c=await exported(target),recovery=JSON.parse(await target.store.recovery()),pristine=copy({a,b,c,recovery});
    for(const value of ['not-a-date','2026-02-30T12:00:00.000Z',new Date(Date.parse(recovery.exportedAt)-1).toISOString(),new Date(Date.parse(c.exportedAt)+1).toISOString(),b.registry.entries[0].updatedAt]) {
        for(const group of ['live','trash']) {
            const bad=copy(c);(group==='live'?bad.registry.entries:bad.trash)[0].updatedAt=value;
            assert.throws(()=>compareRestore(a,b,bad,['scratchpad'],recovery),`${group}: ${value}`);
        }
    }
    for(const mutate of [file=>file.registry.entries[0].createdAt=c.exportedAt,file=>file.trash[0].deletedAt=c.exportedAt,file=>file.registry.entries[0].name='changed',file=>file.registry.entries.reverse()]) {
        const bad=copy(c);mutate(bad);assert.throws(()=>compareRestore(a,b,bad,['scratchpad'],recovery));
    }
    for(const value of ['invalid',new Date(Date.parse(b.exportedAt)-1).toISOString(),new Date(Date.parse(c.exportedAt)+1).toISOString()]) {
        const bad=copy(recovery);bad.exportedAt=value;assert.throws(()=>compareRestore(a,b,c,['scratchpad'],bad));
    }
    const badRecovery=copy(recovery);badRecovery.registry.entries[0].updatedAt=c.registry.entries[0].updatedAt;
    assert.throws(()=>compareRecovery(b,badRecovery,['scratchpad']));
    assert(compareRestore(a,b,c,['scratchpad'],recovery));assert.deepEqual({a,b,c,recovery},pristine);
});

test('global-only timestamps stay exact even when a forged change falls inside the valid restore window',async()=>{
    const clock=advancingClock(),source=await synthetic('source'),target=await synthetic('target',{clock}),a=await exported(source),b=await exported(target);
    await target.store.restore(await target.store.review(JSON.stringify(a),['prompts'],accepted),{confirmed:true});
    const c=await exported(target),recovery=JSON.parse(await target.store.recovery());
    for(const group of ['live','trash']) {const bad=copy(c);(group==='live'?bad.registry.entries:bad.trash)[0].updatedAt=recovery.exportedAt;assert.throws(()=>compareRestore(a,b,bad,['prompts'],recovery));}
});

test('unchanged direct snapshot replacement retains exact workspace timestamps and bundle generations',async()=>{
    const clock=advancingClock(),target=await synthetic('target',{clock}),before=await target.workspaceManager.exportSnapshot();target.writes.length=0;
    await target.workspaceManager.replaceSnapshot(before);
    const after=await target.workspaceManager.exportSnapshot();
    assert.deepEqual(after.registry.workspaces,before.registry.workspaces);assert.deepEqual(after.bundles,before.bundles);
    assert(!target.writes.some(write=>Object.keys(write).some(key=>key.startsWith(Workspaces.PREFIX))));
});

test('CLI verifies advancing-clock exports without changing input bytes and rejects out-of-window staging',async()=>{
    const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'itab-timestamp-cli-'));
    try {
        const clock=advancingClock(),source=await synthetic('source'),target=await synthetic('target',{clock});
        const a=await exported(source),b=await exported(target);
        await target.store.restore(await target.store.review(JSON.stringify(a),['scratchpad'],accepted),{confirmed:true});
        const files={source:a,baseline:b,restored:await exported(target),recovery:JSON.parse(await target.store.recovery())};
        const bytes=Object.fromEntries(Object.entries(files).map(([name,file])=>[name,JSON.stringify(file)]));
        for(const [name,source] of Object.entries(bytes))fs.writeFileSync(path.join(directory,name+'.json'),source);
        const run=()=>spawnSync(process.execPath,['docs/qa/upgrade-backup-acceptance/verify.cjs',directory,'scratchpad'],{encoding:'utf8'});
        const passed=run();assert.equal(passed.status,0,passed.stderr);assert.equal(JSON.parse(passed.stdout).workspaceTimestampPolicy,'staged-within-window');
        for(const [name,source] of Object.entries(bytes))assert.equal(fs.readFileSync(path.join(directory,name+'.json'),'utf8'),source);
        files.restored.trash[0].updatedAt=new Date(Date.parse(files.restored.exportedAt)+1).toISOString();
        fs.writeFileSync(path.join(directory,'restored.json'),JSON.stringify(files.restored));
        const rejected=run();assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/must be within recovery-export/);
    } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
