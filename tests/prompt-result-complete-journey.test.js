'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const P=require('../shared/local-prompts-store'),C=require('../shared/local-ai-collections-store'),Route=require('../shared/collection-prompt-draft'),Search=require('../shared/local-ai-search');
const {Controller:PC}=require('../shared/local-prompts-controller'),{Controller:CC}=require('../shared/local-ai-collections-controller');
const ph=require('./helpers/prompts-harness'),ch=require('./helpers/collections-harness'),{createDocument}=require('./helpers/task-dom-model');
function mount(kind,controller){const doc=createDocument({blurUnavailableFocus:true,aggregateTextContent:true}),host=doc.createElement('div');doc.body.append(host);const root={document:doc,LocalItabPrompts:P,LocalItabAICollections:C,LocalItabPromptDraft:Route,LocalItabAISearch:Search,navigator:{clipboard:{writeText:async()=>{}}},addEventListener(){},removeEventListener(){}};for(const file of ['dialog-focus',kind==='prompts'?'local-prompts-view':'local-ai-collections-view'])vm.runInThisContext('(function(window){\n'+fs.readFileSync('shared/'+file+'.js','utf8')+'\n})')(root);const View=kind==='prompts'?root.LocalItabPromptsView.View:root.LocalItabCollectionsView.View;const view=new View({host,controller,confirm:async()=>false});view.render();return{doc,host,view};}
const button=(host,label)=>host.querySelectorAll('button').find(b=>b.textContent===label);
test('complete local Prompt v1 -> v2 -> explicitly use historical v1 -> preview -> exact result handoff -> saved association',async()=>{
 const p=ph.setup(),c=ch.setup();p.controller.dispose();c.controller.dispose();c.backend.readPromptState=()=>p.store.read();
 const pc=new PC({store:p.store,collectionStore:c.store});const pv=mount('prompts',pc);let cc;
 try{
 await pc.start();const original=await ph.add(pc,'Synthetic complete journey','Original {{topic}}\n原文 🧪');const v1=original.currentVersionId;
 pc.edit();pc.update('body','Current {{topic}} version two');assert.equal(await pc.save(),true);await ph.settle(pc);const v2=pc.record().currentVersionId;assert.notEqual(v1,v2);assert.equal(p.writes,2);
 pv.view.main.querySelectorAll('.prompt-history-list button').find(b=>b.dataset.versionId===v1).dispatch('click');assert.equal(pc.session().versionId,v2,'browsing history does not select it for use');
 button(pv.view.main,'Use this version').dispatch('click');assert.equal(pc.session().versionId,v1);pc.setVariable('topic','Synthetic example');assert.equal(pc.preview().text,'Original Synthetic example\n原文 🧪');
 const link=pv.view.main.querySelector('a.prompt-result-draft');assert(link);assert.equal(link.dispatch('click').prevented,false);const request=Route.target(new URL(link.href,'https://synthetic.invalid/').search);assert.deepEqual(request,{promptId:original.id,bodyVersionId:v1});assert.equal(c.writes,0);
 cc=new CC({store:c.store,promptStore:{read:()=>p.store.read(),subscribe:fn=>p.store.subscribe(fn)}});const handoff=new Route.Handoff({controller:cc,request});const cv=mount('collections',cc);await cc.start();assert.equal(await handoff.run(),true);assert.equal(cc.draft().input.body,'');assert.equal(cc.draft().input.title,'');assert.equal(c.writes,0);
 cc.update('title','Synthetic saved exact result');cc.update('body','Synthetic result for the reviewed historical template');assert.equal(await cc.save(),true);await ch.settle(cc);await ph.tick();await pc.refreshCollections();assert.equal(c.writes,1);assert.deepEqual(cc.record().promptRef,{promptId:original.id,bodyVersionId:v1});assert.equal(cc.promptResolution(cc.record().promptRef).version.body,'Original {{topic}}\n原文 🧪');
 assert.equal(pc.linkedResults(original.id,v1).length,1);assert.equal(pc.linkedResults(original.id,v2).length,0);assert.equal(pc.session().values.topic,'Synthetic example');assert.equal(pc.record().body,'Current {{topic}} version two');assert.equal(p.writes,2);assert(cv.host.textContent.includes('Synthetic saved exact result'));
 }finally{pc.dispose();cc?.dispose();}
});
