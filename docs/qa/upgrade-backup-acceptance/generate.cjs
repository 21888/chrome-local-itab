'use strict';
// Generates synthetic model exports only. Does not launch or drive a browser.
const fs=require('node:fs'),path=require('node:path');
const {synthetic,accepted}=require('../../../tests/helpers/complete-backup-acceptance.js');
(async()=>{
    const directory=process.argv[2]; if(!directory)throw Error('Usage: node generate.cjs OUTPUT_DIRECTORY');
    fs.mkdirSync(directory,{recursive:true});
    let tick=Date.parse('2026-10-11T12:00:00.000Z');
    const source=await synthetic('source'),target=await synthetic('target',{clock:()=>new Date(tick++).toISOString()});
    const files={'source.json':await source.store.export(),'baseline.json':await target.store.export()};
    await target.store.restore(await target.store.review(files['source.json'],null,accepted),{confirmed:true});
    files['restored.json']=await target.store.export();files['recovery.json']=await target.store.recovery();
    for(const [name,contents] of Object.entries(files))fs.writeFileSync(path.join(directory,name),contents+'\n',{flag:'wx'});
    console.log('Created synthetic seven-module model exports in '+directory);
})().catch(error=>{console.error(error);process.exitCode=1;});
