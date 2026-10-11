'use strict';
// Offline verification of original synthetic native-browser downloads only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base=path.join(__dirname,'exports');
const names=['local-itab-ai-collection.json','local-itab-ai-collection (1).json','local-itab-complete-2026-10-10 (13).json','local-itab-complete-2026-10-10 (14).json','local-itab-complete-2026-10-10 (15).json','local-itab-pre-restore-2026-10-10 (3).json'];
const [normal,omit,a,b,c,r]=names.map(n=>JSON.parse(fs.readFileSync(path.join(base,n),'utf8')));
const body='<script>literal</script>\n  const answer = 42;';
const clean=o=>{const {version,revision,...rest}=o;return rest;};
for(const f of [normal,omit]){assert.equal(typeof f,'object');assert.equal(f.format,'local-itab-ai-collections');assert.equal(f.schemaVersion,1);assert.equal(f.content.records.length,1);}
const n=normal.content.records[0],o=omit.content.records[0];
assert.equal(n.body,body);assert.equal(n.history.length,3);assert.equal(n.history[0].body,body);assert.equal(n.history[1].body,body+'\nReviewed revision B.');assert.equal(n.history[2].body,body);
assert.equal(n.notes,'Metadata edited only.');assert.equal(n.title,'Saved B');assert.equal(n.type,'code');assert.equal(n.tool,'Testing');assert.deepEqual(n.tags,['blue','green']);assert.equal(n.deletedAt,null);assert.equal(n.sourceUrl,'https://example.com:8443/source?qa=1');assert.deepEqual(o,{...n,sourceUrl:''});assert.deepEqual(normal.recovery,omit.recovery);
for(const f of [a,b,c,r]){assert.equal(f.format,'local-itab-complete-backup');assert.equal(f.schemaVersion,4);assert.deepEqual(f.modules,['config','tasks','scratchpad','countdown','focus','prompts','collections']);assert.equal(f.globals.collections.content.records.length,1);assert(f.workspaces.every(w=>!Object.hasOwn(w.modules,'collections')));}
const rec=f=>f.globals.collections.content.records[0];
assert.deepEqual(rec(a),n,'standalone source omission did not mutate saved record');
assert.equal(rec(b).body,body+'\nBackup changed C.');assert.equal(rec(b).history.length,4);
assert.deepEqual(clean(rec(c)),clean(rec(a)),'exact restored identity, metadata, source, history and body');assert.notEqual(rec(c).version,rec(a).version,'new editor version fence');
for(const key of ['prompts','collections']) { const {exportedAt:rt,...rg}=r.globals[key],{exportedAt:bt,...bg}=b.globals[key];assert.deepEqual(rg,bg,'pre-restore recovery matches global content apart from export timestamp');}assert.deepEqual(r.workspaces,b.workspaces,'pre-restore recovery matches workspace content');assert.deepEqual(c.workspaces,a.workspaces,'restored workspace content');
assert.deepEqual(c.globals.collections.recovery.at(-1).content,b.globals.collections.content,'displaced collection retained exactly in recovery');
for(const f of [normal,omit,a,b,c,r])assert(!JSON.stringify(f).includes('Stale draft A'),'unsaved stale draft excluded');
const result={passed:true,checks:{singleParseStandaloneObject:true,exactLiteralPlaintext:true,metadataOnlyBodyPreserved:true,reviewedVersionAndHistoricRestore:true,sourceHistory:3,changedHistory:4,sourceOmissionOnlyExportCopy:true,savedRecordUnchangedAfterOmit:true,singleGlobalCollection:true,restoredIdentityBodyMetadataHistory:true,renewedEditorFence:true,completeRecoveryMatchesBefore:true,displacedCollectionRecoveryExact:true,unsavedStaleDraftExcluded:true},files:Object.fromEntries(names.map(n=>{const v=fs.readFileSync(path.join(base,n));return[n,{bytes:v.length,sha256:crypto.createHash('sha256').update(v).digest('hex')}]}))};
fs.writeFileSync(path.join(__dirname,'comparison.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
