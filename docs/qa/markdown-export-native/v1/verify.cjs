'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base=__dirname, read=p=>fs.readFileSync(path.join(base,p)), sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const evidence=JSON.parse(read('evidence-manifest.json'));
for(const [p,v] of Object.entries(evidence)){const b=read(p);assert.equal(b.length,v.bytes,p+' byte count');assert.equal(sha(b),v.sha256,p+' SHA-256');}
const prompt=read('exports/local-itab-prompt.md').toString('utf8'), omitted=read('exports/local-itab-collection.md').toString('utf8'),included=read('exports/local-itab-collection (1).md').toString('utf8');
const backup=JSON.parse(read('exports/local-itab-ai-collection (6).json'));
const section=(label,value)=>{let fence='`'.repeat(Math.max(3,...[...value.matchAll(/`+/g)].map(m=>m[0].length+1)));return `## ${label}\n\n${fence}text\n${value}\n${fence}\n\n`;};
const promptBody='Summarize {{topic}} for {{audience}}.\n  Keep <b>literal</b> and ``` fences.';
assert.equal(prompt,'# Saved prompt\n\n'+section('Title','Native Markdown template')+section('Body',promptBody)+section('Body version','8108443b-91a2-4b96-a1f3-b576f92dbef0'));
assert.equal(backup.format,'local-itab-ai-collections');assert.equal(backup.schemaVersion,1);assert.equal(backup.content.records.length,1);assert.deepEqual(backup.recovery,[]);
const record=backup.content.records[0];
assert.equal(record.title,'Native Markdown excerpt');assert.equal(record.body,'Exact excerpt <b>literal</b>\n  Keep ``` fences.');assert.equal(record.notes,'Synthetic annotation: retain {{topic}} literally.');assert.equal(record.sourceUrl,'https://example.com/conversation/native-markdown?token=synthetic%2Bonly&view=raw#literal-fragment');assert.equal(record.revision,1);assert.equal(record.history.length,1);assert.equal(record.history[0].body,record.body);assert.equal(record.history[0].id,record.currentVersionId);
const expected='# Saved collection\n\n'+section('Title',record.title)+section('Body',record.body)+section('Body version',record.currentVersionId)+section('Type',record.type)+section('Notes',record.notes);
assert.equal(omitted,expected);assert.equal(included,expected+section('Source URL',record.sourceUrl));assert(!omitted.includes('Source URL'));assert(!omitted.includes(record.sourceUrl));
for(const md of [prompt,omitted,included])for(const marker of ['EPHEMERAL_VALUE_MUST_NOT_EXPORT','synthetic readers','OLD_HISTORY_MUST_NOT_EXPORT','unrelated_record_must_not_export','unrelated markdown sentinel','## ID','## Created at','## Updated at','history'])assert(!md.includes(marker),'Unexpected exported marker: '+marker);
const arg=process.argv.indexOf('--runtime-dir');let runtime={status:'skipped',filesChecked:0};
if(arg>=0){const root=process.argv[arg+1];assert(root,'--runtime-dir requires a path');const hashes=JSON.parse(read('runtime-sha256.json'));for(const [p,h] of Object.entries(hashes))assert.equal(sha(fs.readFileSync(path.join(root,p))),h,'runtime '+p);runtime={status:'passed',filesChecked:Object.keys(hashes).length};}
console.log(JSON.stringify({passed:true,evidenceFilesChecked:Object.keys(evidence).length,originalDownloads:4,checks:['Original file byte counts and SHA-256','Exact saved prompt template with literal variables, markup, indentation and fence','No ephemeral values, unrelated prompt or older history in Markdown','Exact collection excerpt and annotation against original JSON','Default source omitted; opt-in exact URL with query and fragment','JSON parses once with collection history and recovery envelope retained'],runtime},null,2));
