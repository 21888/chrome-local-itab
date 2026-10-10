'use strict';
// Offline comparison of actual native browser downloads, never a browser driver.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const directory=fs.existsSync(path.join(__dirname,'exports'))?path.join(__dirname,'exports'):__dirname;
const names=['source-a.json','baseline-b.json','after-cancel-dirty-refusal.json','after-selected-restore-c.json','pre-restore-recovery.json'];
const archive=name=>JSON.parse(fs.readFileSync(path.join(directory,name),'utf8'));
const files=names.map(archive),[a,b,d,c,r]=files.map(f=>f.modules);
for(const file of files){assert.equal(file.format,'local-itab-complete-backup');assert.equal(file.schemaVersion,1);assert.deepEqual(Object.keys(file.modules).sort(),['config','countdown','focus','scratchpad','tasks']);for(const name of ['tasks','scratchpad','countdown','focus'])assert(!Object.hasOwn(file.modules[name],'revision'));assert(!Object.hasOwn(file.modules.tasks,'receipts'));assert(!Object.hasOwn(file.modules.focus,'session'));}
for(const name of Object.keys(a))assert.notDeepEqual(a[name],b[name],`source and destination ${name} differ`);
assert.deepEqual(d,b,'cancel/draft-refusal sequence preserves all saved portable modules');
assert.deepEqual(r,b,'complete pre-restore recovery preserves destination B');
assert.deepEqual(c.config,a.config,'selected configuration/image restored exactly');assert.deepEqual(c.scratchpad,a.scratchpad,'selected note restored exactly');
assert.deepEqual(c.countdown,b.countdown,'unselected Countdown preserved exactly');assert.deepEqual(c.focus,b.focus,'unselected Focus preferences preserved exactly');
assert.deepEqual(c.tasks.recovery,a.tasks.recovery,'saved Tasks history preserved exactly');assert.equal(c.tasks.pinnedId,a.tasks.pinnedId);assert.equal(c.tasks.enabled,a.tasks.enabled);assert.equal(c.tasks.records.length,a.tasks.records.length);
for(let i=0;i<a.tasks.records.length;i++){const {version:av,...aa}=a.tasks.records[i],{version:cv,...cc}=c.tasks.records[i];assert.deepEqual(cc,aa,'Task identities/order/content/states/timestamps retained');assert.notEqual(cv,av,'live Task versions refreshed');}
assert.equal(a.config.data.links[0].url,'https://example.com/');assert.equal(a.tasks.records.length,4);assert.equal(b.tasks.records.length,5);assert.equal(a.tasks.recovery.length,2);assert.equal(a.scratchpad.content,'source a note\n第二行 😀 <literal>\n');
const imageDirectory=fs.existsSync(path.join(__dirname,'fixtures'))?path.join(__dirname,'fixtures'):__dirname;
const png=fs.readFileSync(path.join(imageDirectory,'synthetic-background.png'));assert.deepEqual(Buffer.from(a.config.data.bg.value.split(',')[1],'base64'),png);assert.equal(a.config.data.bg.value,c.config.data.bg.value);
const selectivePath=path.join(directory,'final-selective-export.json');assert(fs.existsSync(selectivePath),'final selective export must be present');let selective=null;
{const f=JSON.parse(fs.readFileSync(selectivePath,'utf8'));assert.deepEqual(Object.keys(f.modules),['scratchpad']);assert.deepEqual(f.modules.scratchpad,c.scratchpad);selective={module:'scratchpad',matchesRestoredNote:true};names.push('final-selective-export.json');}
const result={format:'native-complete-backup-comparison-v1',passed:true,sourceCounts:{sites:a.config.data.links.length,categories:a.config.data.categories.length,tasks:a.tasks.records.length,taskHistory:a.tasks.recovery.length},checks:{cancelAndDirtyRefusalPreserveBaseline:true,recoveryMatchesAllBaselineModules:true,selectedConfigAndImageExact:true,selectedScratchpadExact:true,selectedTaskFieldsAndHistoryExact:true,allLiveTaskVersionsRefreshed:true,unselectedCountdownExact:true,unselectedFocusPreferencesExact:true,portableRuntimeMetadataExcluded:true,inputImageBytesExact:true},selectiveExport:selective,files:Object.fromEntries(names.map(name=>{const buf=fs.readFileSync(path.join(directory,name));return[name,{bytes:buf.length,sha256:crypto.createHash('sha256').update(buf).digest('hex')}]}))};
if(process.argv.includes('--write'))fs.writeFileSync(path.join(__dirname,'comparison.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
