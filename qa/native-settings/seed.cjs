'use strict';
const fs=require('node:fs'),path=require('node:path');
async function generate(sourceRoot, outputRoot){
 const src=path.resolve(sourceRoot)+path.sep; const out=path.resolve(outputRoot);
 const F=require(src+'tests/helpers/complete-import-receipt-fixture.js');
 const write=(name,content)=>fs.writeFileSync(path.join(out,name),content);

 const seed=F.seed();seed.quote='QA initial synthetic quote';
 for(const n of ['tasks','focus','scratchpad','countdown']){const api=require(src+'shared/local-'+n+'-store.js'),value=api.initial();
 if(n==='tasks')value.records.push({id:'synthetic_task_001',version:'synthetic_version_001',text:'Synthetic preserved task',state:'active',removedFrom:null,createdAt:F.NOW,updatedAt:F.NOW});
 if(n==='scratchpad')value.content='Synthetic preserved scratchpad';
 if(n==='countdown'){value.title='Synthetic countdown';value.targetDate='2030-01-01'}
 api.validate(value);seed[api.KEY]=value;
 }
 for(const n of ['prompts','ai-collections']){const api=require(src+'shared/local-'+n+'-store.js');seed[api.KEY]=api.initial()}
 const f=F.fixture(seed);await F.withGlobals(f,async()=>{
 let serial=0;
 for(const n of ['prompts','ai-collections']){
  const api=require(src+'shared/local-'+n+'-store.js');
  const backend={lock:fn=>fn(),read:async()=>f.raw[api.KEY],write:async value=>{f.raw[api.KEY]=structuredClone(value)},subscribe:()=>()=>{}};
  const store=new api.Store(backend,{id:()=> 'synthetic_global_'+n.replace(/-/g,'_')+'_'+(++serial),now:()=>F.NOW});
  await store.mutate(store.request('add',{title:'Synthetic preserved '+n,body:'Purely synthetic '+n+' body; no personal data.',tags:['synthetic'],tool:'Synthetic QA'}));
  api.validate(f.raw[api.KEY]);
 }
 const {manager}=await F.boot(f);const other=await manager.create('Synthetic untouched workspace');await manager.writeBundle(other,{quote:'Synthetic other workspace quote',schemaVersion:1,__localItabScratchpadV1:{...seed.__localItabScratchpadV1,content:'Synthetic OTHER workspace preserved scratchpad'},__localItabPersonalTasksV1:structuredClone(seed.__localItabPersonalTasksV1)});});
 const audit={syntheticOnly:true,globalRecords:{},workspacePersonal:{}};
 for(const n of ['prompts','ai-collections']){const api=require(src+'shared/local-'+n+'-store.js');api.validate(f.raw[api.KEY]);audit.globalRecords[api.KEY]=f.raw[api.KEY].records.length;}
 for(const e of f.raw[F.Workspaces.REGISTRY_KEY].workspaces){const v=f.raw[F.Workspaces.bundleKey(e)].values;for(const n of ['tasks','focus','scratchpad','countdown']){const api=require(src+'shared/local-'+n+'-store.js');if(v[api.KEY]){api.validate(v[api.KEY]);audit.workspacePersonal[e.id+':'+api.KEY]='schema-valid';}}}
 write('RICH2-SEED-VALIDATION.json',JSON.stringify(audit,null,2));
 write('qa-rich2-data.js','window.QA_RICH_SEED='+JSON.stringify(f.raw)+';');
 write('synthetic-import-rich2.json',JSON.stringify({...seed,quote:'Synthetic imported replacement'}));
 write('seed-rich2-preservation-baseline.json',JSON.stringify(f.raw,null,2));
}
module.exports={generate};
if(require.main===module){
 if(process.argv.length!==4)throw Error('Usage: node seed.cjs SOURCE_ROOT OUTPUT_ROOT');
 generate(process.argv[2],process.argv[3]).catch(error=>{console.error(error);process.exitCode=1});
}

