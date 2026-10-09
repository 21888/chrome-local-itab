const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const snapshot=path.resolve(__dirname,'..');process.chdir(snapshot);
const registry=require('../shared/dashboard-template-registry.js');
const StorageManager=require(path.join(snapshot,'storage.js'));const manager=new StorageManager();
const clone=value=>JSON.parse(JSON.stringify(value));
const original=manager.cloneDefaultConfig();original.links=[{id:'saved-link',title:'Saved',url:'https://example.com',category:'work'}];original.layout={autoArrange:false,alignToGrid:false,gridSize:144,columns:4,positions:{'saved-link':{x:37,y:53}}};original.__localItabPersonalTasksV1={items:[{id:'task-1',title:'Keep this'}]};
(async()=>{
 const source=fs.readFileSync('newtab.js','utf8');
 const intro=source.slice(source.indexOf('function updateTemplateIntro('),source.indexOf('function setupDashboardAppearance('));
 const captured={};const introContext={window:{LocalItabTemplates:registry,i18n:{t:key=>'existing translation: '+key}},document:{getElementById:id=>id},setText:(id,value)=>{captured[id]=value;}};
 vm.createContext(introContext);vm.runInContext(intro,introContext);
 for(const id of ['clarity','graphite','folio']){
  introContext.updateTemplateIntro(id);
  const key='template'+id[0].toUpperCase()+id.slice(1);
  assert.equal(captured['template-heading'],'existing translation: '+key+'Heading');
  assert.equal(captured['template-description'],'existing translation: '+key+'Intro');
  for(const [locale,language] of [['en','en'],['zh_CN','zh']]){
   const messages=JSON.parse(fs.readFileSync('_locales/'+locale+'/messages.json','utf8'));
   assert.equal(registry.get(id).heading[language],messages[key+'Heading'].message);
   assert.equal(registry.get(id).description[language],messages[key+'Intro'].message);
  }
 }

 for(const template of registry.ids)for(const colorMode of ['light','dark']){
  assert.equal(manager.validateAppearanceConfig({template,colorMode}).template,template);
  assert.equal(manager.validateImportPayload({links:[],appearance:{template,colorMode}}).appearance.template,template);
 }
 const data=clone(original),writes=[];data.appearance={template:'clarity',colorMode:'light'};
 const storage={validateAppearanceConfig:manager.validateAppearanceConfig.bind(manager),getAppearanceForUpdate:async()=>clone(data.appearance),patchAppearance:async patch=>{data.appearance={...data.appearance,...clone(patch)};writes.push('appearance');return clone(data.appearance);}};
 const context={window:{document:{documentElement:{dataset:{},lang:'zh-CN'}}},console};vm.createContext(context);
 vm.runInContext(fs.readFileSync('shared/dashboard-template-registry.js','utf8'),context);
 vm.runInContext(fs.readFileSync('shared/appearance.js','utf8'),context);
 const ctrl=new context.window.LocalItabAppearance.Controller({storage,initial:data.appearance});
 for(const id of registry.ids){assert(await ctrl.select('template',id));assert.equal(data.appearance.template,id);}
 for(const key of ['links','layout','__localItabPersonalTasksV1'])assert.deepEqual(data[key],original[key]);
 assert.equal(writes.length,15);
 const {createHarness}=require(path.join(snapshot,'tests/helpers/dashboard-harness'));
 const h=createHarness([{title:'A',url:'https://example.com/a',icon:'A',category:'work'},{title:'B',url:'https://example.com/b',icon:'B',category:'social'}]);
 vm.runInContext(fs.readFileSync('shared/dashboard-template-registry.js','utf8'),h.context);
 h.component.categories=[{id:'work',name:'Work'},{id:'social',name:'Social'}];
 let mutations=0;h.storageManager.set=async()=>{mutations++;return true};const links=clone(h.component.links);
 for(const id of registry.ids){h.document.documentElement.dataset.dashboardTemplate=id;h.component.refreshTemplate();assert.equal(h.component.usesCollections(),registry.usesCollections(id));assert.deepEqual(clone(h.component.links),links);}
 assert.equal(mutations,0);
 console.log('PASS: ABC translation path and CN/EN copy parity, 30 storage/import roundtrips, 15 style-only selections preserve links/tasks/free coordinates, 15 DOM grouping transitions never write data');
})().catch(error=>{console.error(error);process.exitCode=1});
