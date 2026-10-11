'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(path.join(__dirname,p)),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=JSON.parse(read('evidence-manifest.json'));
for(const [p,v] of Object.entries(files)){const b=read(p);assert.equal(b.length,v.bytes,p);assert.equal(sha(b),v.sha256,p);}
const v1=read('reference/v1-local-itab-prompt.md').toString('utf8'),v2=read('exports/local-itab-prompt (1).md').toString('utf8');
assert.equal(sha(Buffer.from(v1)),'3f2e9fe34f0f0c0794e37a6d3345f1692759af7ffecfd457726737813f0fdcbd');
assert.equal(v2,v1.replace('8108443b-91a2-4b96-a1f3-b576f92dbef0','541d6693-ba56-4983-9b26-76fe921d5a51'));
assert(v2.includes('Summarize {{topic}} for {{audience}}.\n  Keep <b>literal</b> and ``` fences.'));
for(const forbidden of ['Source URL','EPHEMERAL_VALUE_MUST_NOT_EXPORT','OLD_HISTORY_MUST_NOT_EXPORT','unrelated_record_must_not_export','## ID','## Created at','## Updated at'])assert(!v2.includes(forbidden),forbidden);
let runtime={status:'skipped',filesChecked:0};const i=process.argv.indexOf('--runtime-dir');
if(i>=0){const r=process.argv[i+1];assert(r);const hashes=JSON.parse(read('runtime-sha256.json'));for(const [p,h]of Object.entries(hashes))assert.equal(sha(fs.readFileSync(path.join(r,p))),h,p);runtime={status:'passed',filesChecked:Object.keys(hashes).length};}
console.log(JSON.stringify({passed:true,evidenceFilesChecked:Object.keys(files).length,v2OriginalDownloads:1,referenceOriginalDownloads:1,contentComparison:'Exact title/body/fences/omissions; expected new body-version ID only. No claim of byte identity to V1.',runtime},null,2));
