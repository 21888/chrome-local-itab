'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const {createDocument}=require('./helpers/task-dom-model');
const StorageManager=require('../storage'),Tasks=require('../shared/local-tasks-store'),{Controller:TasksController}=require('../shared/local-tasks-controller');
const tick=()=>new Promise(r=>setImmediate(r));
async function model(){
 const document=createDocument(),handlers=new Map(),listeners=new Set();let reloads=0,confirmations=0,accept=false,raw,gate=null,taskWrites=0,failWrite=false;
 const storage=new StorageManager();storage.onLocalChanged=()=>()=>{};let layout={layout:structuredClone(storage.defaultConfig.layout),generation:'initial',links:[]};storage.getLayoutSnapshotForUpdate=async()=>structuredClone(layout);
 const backend={lock:fn=>Promise.resolve().then(fn),read:async()=>structuredClone(raw),write:async value=>{if(gate)await gate;if(failWrite)throw Error('Synthetic write failure');raw=structuredClone(value);taskWrites++;for(const fn of listeners)fn();},subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
 const window={storageManager:storage,LocalItabTasks:{...Tasks,Controller:TasksController},location:{reload(){reloads++;}},confirm(){confirmations++;return accept;},addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:name=>handlers.delete(name)};
 document.body.prepend=(...nodes)=>document.body.append(...nodes);
 const context=vm.createContext({window,document,console,setTimeout,clearTimeout,crypto:webcrypto});
 for(const file of ['dialog-focus','local-tasks-view','layout','local-content-lifecycle'])vm.runInContext(fs.readFileSync(`shared/${file}.js`,'utf8'),context);
 const tasksHost=document.createElement('article'),layoutHost=document.createElement('div');document.body.append(tasksHost,layoutHost);
 const tasksController=new TasksController(new Tasks.Store(backend));const tasksView=window.localTasksView=window.LocalItabTasks.mount(tasksHost,{controller:tasksController,alwaysVisible:true});await tick();await tick();
 const controller=window.layoutController=new window.LocalItabLayout.Controller({storage,initial:layout.layout,baseline:layout});window.LocalItabLayout.mount(layoutHost,controller);
 const button=(parent,label)=>parent.querySelectorAll('button').find(n=>n.textContent===label);
 return{window,document,controller,tasksView,tasksController,layoutHost,tasksHost,button,
  get reloads(){return reloads;},get confirmations(){return confirmations;},get taskWrites(){return taskWrites;},get raw(){return raw;},setAccept:v=>accept=v,setFailure:v=>failWrite=v,
  edit(text){tasksView.input.value=text;tasksView.input.dispatch('input');},
  hold(){let release;gate=new Promise(r=>release=r);return()=>{gate=null;release();};},
  async invalidate(){layout={...layout,generation:'changed'};await controller.refresh();assert(controller.invalidated);assert.equal(layoutHost.dataset.saveState,'reload');},
  reloadButton(){return button(layoutHost,'Reload page');},noticeButton(){const notice=document.getElementById('local-content-reload-notice');return notice&&button(notice,'Reload page');},close(){tasksView.destroy();}};
}
test('actual invalidated layout Reload preserves an unsaved task and requires the existing discard confirmation',async()=>{
 const h=await model();try{h.edit('Synthetic unsaved task draft');await h.invalidate();h.reloadButton().dispatch('click');assert.equal(h.reloads,0);assert.equal(h.tasksView.input.value,'Synthetic unsaved task draft');assert(h.noticeButton());h.noticeButton().dispatch('click');assert.equal(h.confirmations,1);assert.equal(h.reloads,0);h.setAccept(true);h.noticeButton().dispatch('click');assert.equal(h.reloads,1);assert.equal(h.taskWrites,0);}finally{h.close();}
});
test('actual invalidated layout Reload cannot unload during a submitted task write',async()=>{
 const h=await model();let release;try{await h.invalidate();h.edit('Synthetic pending task');release=h.hold();h.tasksView.add();await tick();assert(h.tasksController.pending);h.reloadButton().dispatch('click');assert.equal(h.reloads,0);assert(h.noticeButton());h.noticeButton().dispatch('click');assert.equal(h.reloads,0);assert.equal(h.confirmations,0);release();release=null;await tick();await tick();assert.equal(h.taskWrites,1);h.noticeButton().dispatch('click');assert.equal(h.reloads,1);assert.equal(h.raw.records[0].text,'Synthetic pending task');}finally{release?.();h.close();}
});
test('clean invalidated layout still reloads normally without confirmation or writes',async()=>{
 const h=await model();try{await h.invalidate();h.reloadButton().dispatch('click');assert.equal(h.reloads,1);assert.equal(h.confirmations,0);assert.equal(h.taskWrites,0);}finally{h.close();}
});
test('failed submitted task write keeps its original draft; cancelling reload then explicit task Retry saves once',async()=>{
 const h=await model();let release;try{await h.invalidate();h.edit('Synthetic retained after rejection');release=h.hold();h.setFailure(true);h.tasksView.add();await tick();h.reloadButton().dispatch('click');release();release=null;await tick();await tick();assert(h.tasksController.error);assert.equal(h.tasksView.input.value,'Synthetic retained after rejection');h.noticeButton().dispatch('click');assert.equal(h.reloads,0);assert.equal(h.confirmations,1);h.setFailure(false);assert(!h.tasksView.retry.hidden);h.tasksView.retry.dispatch('click');await tick();await tick();assert.equal(h.taskWrites,1);assert.equal(h.raw.records[0].text,'Synthetic retained after rejection');h.noticeButton().dispatch('click');assert.equal(h.reloads,1);}finally{release?.();h.close();}
});
test('a newly submitted write after a deferred reload notice is rechecked instead of discarded',async()=>{
 const h=await model();let release;try{h.edit('Synthetic newer pending task');await h.invalidate();h.reloadButton().dispatch('click');assert(h.noticeButton());release=h.hold();h.tasksView.add();await tick();h.setAccept(true);h.noticeButton().dispatch('click');assert.equal(h.confirmations,0);assert.equal(h.reloads,0);release();release=null;await tick();await tick();h.noticeButton().dispatch('click');assert.equal(h.reloads,1);assert.equal(h.taskWrites,1);}finally{release?.();h.close();}
});
test('standalone hosts without the content lifecycle retain the existing reload fallback',async()=>{
 const h=await model();try{delete h.window.LocalItabContentLifecycle;await h.invalidate();h.reloadButton().dispatch('click');assert.equal(h.reloads,1);assert.equal(h.confirmations,0);}finally{h.close();}
});
