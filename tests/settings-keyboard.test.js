const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const repo=require('node:path').resolve(__dirname, '..');
const {createDocument}=require(repo+'/tests/helpers/task-dom-model');
function harness(compact=false,hash=''){
 const document=createDocument(),timers=[]; const media={matches:compact,addEventListener(type,fn){this.change=fn}};
 const list=document.createElement('aside');list.className='options-tabs';list.setAttribute('role','tablist');document.body.append(list);
 const content=document.createElement('div');content.className='options-content';document.body.append(content);
 const tabs=[],panels=[],drafts=[];
 const html=fs.readFileSync(repo+'/options.html','utf8');
 const names=[...html.matchAll(/class="tab-button[^\"]*" data-tab="([^\"]+)"/g)].map(m=>m[1]);assert.equal(names.length,7);
 for(const name of names){const tab=document.createElement('button');tab.className='tab-button';tab.dataset.tab=name;tab.setAttribute('role','tab');list.append(tab);tabs.push(tab);
 const panel=document.createElement('div');panel.className='tab-panel';panel.dataset.tab=name;content.append(panel);panels.push(panel);
 const section=document.createElement('section');section.id=name+'-settings';section.scrollIntoView=()=>{};panel.append(section);
 const input=document.createElement('input');input.value='UNSAVED '+name;input.checked=true;section.append(input);drafts.push(input);}
 let writes=0;const pending={};const window={location:{hash},matchMedia(query){assert.equal(query,'(max-width: 960px)');return media;}};
 const context={document,window,console,setTimeout:f=>timers.push(f),chrome:{storage:{local:{set(){writes++}}}}};vm.createContext(context);
 vm.runInContext(fs.readFileSync(repo+'/options.js','utf8'),context);
 context.window.localTasksSettingsController={pending};context.setupSettingsTabs();
 function active(){return tabs.findIndex(t=>t.getAttribute('aria-selected')==='true')}
 function check(index){assert.equal(active(),index);assert.equal(tabs.filter(t=>t.tabIndex===0).length,1);assert.equal(panels.filter(p=>p.classList.contains('active')).length,1);assert(panels[index].classList.contains('active'));}
 function key(key,fields={}){return tabs[active()].dispatch('keydown',{key,...fields})}
 return {document,media,list,tabs,panels,drafts,key,check,active,window,pending,get writes(){return writes},timers};
}
for(const compact of [false,true]){
 const h=harness(compact);h.check(0);h.tabs[0].focus();assert.equal(h.list.getAttribute('aria-orientation'),compact?'horizontal':'vertical');
 const forward=compact?'ArrowRight':'ArrowDown',back=compact?'ArrowLeft':'ArrowUp',orthogonal=compact?'ArrowDown':'ArrowRight';
 for(let i=1;i<=7;i++){assert(h.key(forward).prevented);h.check(i%7);assert.equal(h.document.activeElement,h.tabs[i%7]);}
 assert(h.key(back).prevented);h.check(6);assert(h.key('Home').prevented);h.check(0);assert(h.key('End').prevented);h.check(6);
 for(const modifier of ['altKey','ctrlKey','metaKey','shiftKey','isComposing']){assert(!h.key(back,{[modifier]:true}).prevented);h.check(6);}
 for(const k of [orthogonal,'Tab','Enter',' ']){assert(!h.key(k).prevented);h.check(6);}
 const child=h.document.createElement('input');h.tabs[6].append(child);assert(!child.dispatch('keydown',{key:back}).prevented);h.check(6);
 h.tabs[2].dispatch('click');h.check(2);h.key('Home');h.check(0);
 for(let i=0;i<h.drafts.length;i++){assert.equal(h.drafts[i].value,'UNSAVED '+h.tabs[i].dataset.tab);assert(h.drafts[i].checked);assert.equal(h.drafts[i].parentElement.parentElement,h.panels[i]);}
 assert.equal(h.window.localTasksSettingsController.pending,h.pending);assert.equal(h.writes,0);
 h.media.matches=!compact;h.media.change();assert.equal(h.list.getAttribute('aria-orientation'),compact?'vertical':'horizontal');
 assert(h.key(compact?'ArrowDown':'ArrowRight').prevented);h.check(1);
}
{const h=harness(false,'#data-settings');h.check(6);assert.equal(h.document.activeElement,h.document.body,'hash setup does not steal focus');assert.equal(h.timers.length,1);h.key('Home');h.check(0);}
console.log('PASS: actual seven settings tabs; responsive orientation; arrows/wrap/Home/End focus+selection; modifiers/composition/inputs untouched; native Enter/Space/Tab left alone; click/hash paths; panel nodes, unsaved fields, pending local save identity preserved; zero writes.');
