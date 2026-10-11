'use strict';
// Offline only: compare original native UI downloads. No browser access.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const base=path.join(__dirname,'exports');
const names=['source-a.json','changed-b.json','restored-c.json','recovery-b.json'];
const files=names.map(n=>JSON.parse(fs.readFileSync(path.join(base,n),'utf8')));
const [a,b,c,r]=files;
for(const f of files){assert.equal(f.format,'local-itab-complete-backup');assert.equal(f.schemaVersion,3);assert.deepEqual(f.modules,['config','tasks','scratchpad','countdown','focus','prompts']);assert.equal(f.globals.prompts.content.records.length,1);assert(f.workspaces.every(w=>!Object.hasOwn(w.modules,'prompts')));}
const rec=f=>f.globals.prompts.content.records[0];
const clean=o=>{const {version,revision,...portable}=o;return portable;};
assert.equal(rec(a).history[0].body,'Explain {{topic}} to {{reader}}. Again {{topic}}.\n  <script>literal</script>');
assert.equal(rec(a).history[1].body,'Explain stars to . Again stars.\n  <script>literal</script>');
assert.equal(rec(a).history.length,4);
assert.equal(rec(b).history.length,5);
assert.equal(rec(b).body,rec(a).body+'\nBackup changed C');
assert.equal(rec(b).category,'QA');assert.deepEqual(rec(b).tags,['blue','green']);
assert.deepEqual(clean(rec(c)),clean(rec(a)),'restored prompt equals incoming content/identity/history');
assert.notEqual(rec(c).version,rec(a).version,'restore renews editor fence');
assert.deepEqual(r.workspaces,b.workspaces,'complete recovery preserves pre-restore workspace content');
assert.deepEqual(r.globals.prompts.content,b.globals.prompts.content,'complete recovery preserves pre-restore prompt');
assert.deepEqual(c.workspaces,a.workspaces,'restored scoped content matches source');
assert.deepEqual(c.globals.prompts.recovery.at(-1).content.records.map(clean),b.globals.prompts.content.records.map(clean),'displaced prompt retained inside prompt recovery');
assert(!JSON.stringify(c).includes('Stale draft A'));
const result={passed:true,checks:{singleGlobalPromptLibrary:true,exactPlaintext:true,clipboardCompletedText:true,sourceHistory:4,changedHistory:5,restoredIdentityContentHistory:true,renewedEditorFence:true,completeRecoveryMatchesBefore:true,displacedPromptRecovery:true,unsavedDraftExcluded:true},files:Object.fromEntries(names.map(n=>{const v=fs.readFileSync(path.join(base,n));return[n,{bytes:v.length,sha256:crypto.createHash('sha256').update(v).digest('hex')}]}))};
fs.writeFileSync(path.join(__dirname,'comparison.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
