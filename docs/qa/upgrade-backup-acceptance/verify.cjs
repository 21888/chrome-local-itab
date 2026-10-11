'use strict';
// Pure file comparison: works on synthetic harness or independently saved
// schema-4 exports with matching source/baseline/restored/recovery filenames.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const Backup=require('../../../shared/complete-backup.js'),Manager=require('../../../storage.js');
const {compareRestore,compareRecovery}=require('../../../tests/helpers/complete-backup-comparison.js');
const directory=process.argv[2];if(!directory)throw Error('Usage: node verify.cjs EXPORT_DIRECTORY [selected,module,names]');
const manager=new Manager(),read=name=>Backup.parse(fs.readFileSync(path.join(directory,name+'.json'),'utf8'),manager);
const [source,baseline,restored,recovery]=['source','baseline','restored','recovery'].map(read);
for(const file of [source,baseline,restored])assert.equal(file.schemaVersion,4);
const selected=process.argv[3]?process.argv[3].split(','):Backup.MODULES;
assert(selected.length && new Set(selected).size===selected.length && selected.every(x=>Backup.MODULES.includes(x)));
compareRestore(source,baseline,restored,selected,recovery);compareRecovery(baseline,recovery,selected);
console.log(JSON.stringify({passed:true,selected,workspaceTimestampPolicy:selected.some(name=>Backup.SCOPED_MODULES.includes(name))?'staged-within-window':'exact-baseline',workspaceTimestampWindow:{from:recovery.exportedAt,through:restored.exportedAt},liveWorkspaces:restored.registry.entries.length,trash:restored.trash.length,evidence:'File payload comparison only; provenance must be established separately.'},null,2));
