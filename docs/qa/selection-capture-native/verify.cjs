'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const base=__dirname, args=process.argv.slice(2), sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert(args.length===0||(args.length===2&&args[0]==='--runtime-dir'),'Usage: node verify.cjs [--runtime-dir /path/to/runtime]');
const manifest=JSON.parse(fs.readFileSync(path.join(base,'evidence-manifest.json'))),results={};
for(const [name,expected] of Object.entries(manifest.files)){const b=fs.readFileSync(path.join(base,name));assert.equal(b.length,expected.bytes,name);assert.equal(sha(b),expected.sha256,name);}
const downloads=[2,3,4,5].map(n=>JSON.parse(fs.readFileSync(path.join(base,'exports',`local-itab-ai-collection (${n}).json`),'utf8')));
for(const d of downloads){assert.equal(d.format,'local-itab-ai-collections');assert.equal(d.schemaVersion,1);assert.deepEqual(d.recovery,[]);}
assert.deepEqual(downloads[0].content,{records:[]});assert.deepEqual(downloads[1].content,downloads[0].content);
assert.equal(downloads[2].content.records.length,1);const r=downloads[2].content.records[0];
assert.equal(r.id,'3bb6c5fa-aee6-413c-8021-dfd2fb05d394');assert.equal(r.title,'native captured aurora');assert.equal(r.body,'Aurora <b>literal</b> & plain   const café = "星 ⭐"; 끝 — exact.');assert.equal(r.sourceUrl,'http://127.0.0.1:8873/');assert.equal(r.revision,1);assert.equal(r.history.length,1);assert.equal(r.history[0].body,r.body);assert.equal(r.currentVersionId,r.history[0].id);
assert.deepEqual(downloads[3].content,downloads[2].content);
let integrity={status:'skipped',reason:'No --runtime-dir supplied; standalone evidence verified.'};
if(args.length){const hashes=JSON.parse(fs.readFileSync(path.join(base,'source-hashes.json'))).files;for(const [name,hash]of Object.entries(hashes))assert.equal(sha(fs.readFileSync(path.join(args[1],name))),hash,name);integrity={status:'passed',filesChecked:Object.keys(hashes).length};}
console.log(JSON.stringify({passed:true,evidenceFilesChecked:Object.keys(manifest.files).length,sourceIntegrity:integrity,checks:{emptyBaseline:true,unsavedCaptureDoesNotPersist:true,explicitSavePersistsOneRecord:true,literalMarkupUnicodeRetained:true,sourceOptInSanitized:true,editableDuplicateAndReloadDoNotChangeDurableRecord:true},limitation:'Chrome-provided selectionText flattened original preformatted newlines; this verifies its actual captured text, not original source formatting.'},null,2));
