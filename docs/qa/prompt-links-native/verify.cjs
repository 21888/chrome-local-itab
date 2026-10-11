'use strict';
// Offline verification only: unmodified native-browser download, no browser storage reads.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const base=__dirname,name='local-itab-complete-2026-10-10 (16).json',bytes=fs.readFileSync(path.join(base,'exports',name));
const args=process.argv.slice(2);
assert(args.length===0 || (args.length===2 && args[0]==='--runtime-dir'),'Usage: node verify.cjs [--runtime-dir /path/to/runtime]');
const digest=crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(bytes.length,3649);assert.equal(digest,'e1e3880f4af61f6342e58aa57b6161344fb29b2f1ba19c3365d15f99227208bc','Original download hash');
const b=JSON.parse(bytes.toString('utf8'));
assert.equal(b.format,'local-itab-complete-backup');assert.equal(b.schemaVersion,4);
assert.deepEqual(b.modules,['config','tasks','scratchpad','countdown','focus','prompts','collections']);
const ps=b.globals.prompts.content.records,cs=b.globals.collections.content.records;assert.equal(ps.length,1);assert.equal(cs.length,1);
const p=ps[0],c=cs[0];
assert.equal(p.id,'07f5df28-d9b7-46c5-a8d7-f8e3fe826e89');assert.equal(p.title,'renamed native prompt');assert(p.deletedAt);
assert.deepEqual(p.history.map(v=>v.body),['v1 <b>literal</b>\n  keep {{topic}} exact.','v2 newer body {{topic}}','v3 latest body']);
assert.equal(p.body,p.history[2].body);assert.equal(p.currentVersionId,p.history[2].id);
assert.deepEqual(c.promptRef,{promptId:p.id,bodyVersionId:p.history[0].id});
assert.equal(c.promptRef.bodyVersionId,'ecb950da-d779-4a1d-98fa-84b287f64d42');assert.notEqual(c.promptRef.bodyVersionId,p.currentVersionId);
assert.equal(c.body,'original excerpt <b>kept</b>');assert.equal(c.history.length,1);assert.equal(c.history[0].body,c.body);assert.equal(c.currentVersionId,c.history[0].id);
assert.equal(c.revision,2);assert.equal(c.deletedAt,null);
assert(b.workspaces.every(w=>!('prompts' in w.modules)&&!('collections' in w.modules)));
let sourceIntegrity={status:'skipped',filesChecked:0,reason:'No --runtime-dir supplied; download verification is standalone.'};
if(args.length){
 const runtime=path.resolve(args[1]);
 const manifest=JSON.parse(fs.readFileSync(path.join(base,'source-hashes.json')));let checked=0;
 for(const [f,hash] of Object.entries(manifest.files)){assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(runtime,f))).digest('hex'),hash,f);checked++;}
 sourceIntegrity={status:'passed',filesChecked:checked};
}
const result={passed:true,sourceIntegrity,download:{name,bytes:bytes.length,sha256:digest},checks:{exactOlderPromptAndBodyVersionIDs:true,threeExactPromptBodiesRetained:true,newerCurrentBodyDoesNotRebind:true,renamedArchivedPromptRetained:true,collectionBodyAndSingleHistoryUnchanged:true,unappliedSelectionAndDiscardDoNotWrite:true},promptId:p.id,linkedBodyVersionId:c.promptRef.bodyVersionId,currentBodyVersionId:p.currentVersionId,collectionId:c.id};
console.log(JSON.stringify(result,null,2));
