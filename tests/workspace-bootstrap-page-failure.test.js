const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {createDocument}=require('./helpers/task-dom-model');
const test=require('node:test');
// Actual page startup with synthetic DOM/API boundaries, not installed Chrome.
for(const page of ['newtab','options']) test(`${page}: missing workspace bootstrap retains data and failure exits`,async()=>{
 const document=createDocument({aggregateTextContent:true}), calls=[],timers=[],opened=[],errors=[];
 const raw={quote:'Synthetic retained quote',__localItabWorkspaceRegistryV1:{synthetic:'retained'},__localItabPersonalTasksV1:{synthetic:'retained'}};const before=JSON.stringify(raw);
 const proto=Object.getPrototypeOf(document.body);Object.defineProperty(proto,'parentNode',{configurable:true,get(){return this.parentElement;}});proto.removeChild=function(n){n.remove();};proto.prepend=function(n){this.append(n);};
 const add=(tag,id,cls,parent=document.body)=>{const e=document.createElement(tag);if(id)e.id=id;if(cls)e.className=cls;parent.append(e);return e;};
 const skip=add('a',null,'skip-link'),switcher=add('section','workspace-switcher','workspace-bar');
 const html=fs.readFileSync(page+'.html','utf8'), recovery=add('a',null,'spaces-manage',switcher);assert(html.includes('href="recovery.html"'));recovery.href='recovery.html';recovery.target='_blank';recovery.rel='noopener';
 const settings=add('button','open-options'),category=add('button','manage-categories');
 const container=add('div',null,'options-container'),main=add('main',null,'options-main',container),footer=add('div',null,'options-footer',container),input=add('input','quote-text',null,main),save=add('button','save-settings',null,footer),back=add('button','back-to-dashboard',null,container);
 input.value='Synthetic untouched input';
 for(const id of ['local-tasks-card','local-focus-card','local-countdown-card','local-scratchpad-card'])add('section',id);
 const c={document,URL,TextEncoder,TextDecoder,structuredClone,crypto:require('node:crypto').webcrypto,console:{log(){},warn(){},error(...a){errors.push(a.map(x=>x?.code||String(x)).join(' '));}},navigator:{locks:{request:async(n,o,f)=>(f||o)()}},chrome:{storage:{local:{get:async()=>{calls.push('get');return structuredClone(raw);},set:async v=>{calls.push('set');Object.assign(raw,v);}},sync:{get:async()=>{calls.push('sync');return{};}},onChanged:{addListener(){}}},runtime:{getURL:f=>'chrome-extension://synthetic/'+f}},location:{href:'chrome-extension://synthetic/'+page+'.html'},localStorage:{getItem:()=>null,setItem:()=>{calls.push('localStorage.set');}},setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length;},clearTimeout(){},addEventListener(){},removeEventListener(){},open:(...a)=>opened.push(a)};c.window=c;c.globalThis=c;vm.createContext(c);
 for(const f of [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(x=>x[1])){if(f==='shared/workspaces.js')continue;vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});if(f==='storage.js')break;}
 for(const name of ['tasks','focus','scratchpad','countdown']) {
  for(const kind of ['controller','view']) {
   const file=`shared/local-${name}-${kind}.js`;
   vm.runInContext(fs.readFileSync(file,'utf8'),c,{filename:file});
  }
 }
 for(const name of ['Tasks','Focus','Scratchpad','Countdown']) assert.equal(typeof c[`LocalItab${name}`].mount,'function');
 for(const f of ['shared/local-content-lifecycle.js','shared/workspaces-view.js',page+'.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c,{filename:f});
 await document.listeners.get('DOMContentLoaded')({type:'DOMContentLoaded'});
 if(page==='newtab'){settings.dispatch('click');category.dispatch('click');}else back.dispatch('click');
 for(const t of [...timers])if(t.delay===100||t.delay===5000)t.fn();
 await new Promise(setImmediate);await new Promise(setImmediate);
 assert.equal(JSON.stringify(raw),before);assert.deepEqual(calls,[]);
 assert(document.getElementById(page==='newtab'?'dashboard-load-failed':'settings-unloaded-notice'));
 assert.equal(input.value,'Synthetic untouched input');
 assert.equal(recovery.hidden,false); assert.equal(switcher.inert,false);
 assert.deepEqual(['localTasksView','localFocusView','localCountdownView','localScratchpadView'].filter(k=>!!c[k]),[]);
 if(page==='newtab') {
  assert.deepEqual(opened.map(args=>args[0]),['chrome-extension://synthetic/options.html','chrome-extension://synthetic/options.html#category-settings']);
  assert.equal(c.categoryNavigation.categories.length,0,'failed category read must not render fallback categories');
  assert(errors.some(message=>message.includes('Error initializing category navigation: WORKSPACE_UNAVAILABLE')));
 } else {
  assert.equal(main.inert,true); assert.equal(footer.inert,true);
  assert.equal(input.disabled,true); assert.equal(save.disabled,true);
  assert.equal(c.location.href,'newtab.html');
 }
});
