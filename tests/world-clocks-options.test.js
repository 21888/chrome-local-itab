const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const WorldClocks = require('../shared/world-clocks');
const source = fs.readFileSync('options.js', 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function harness() {
    const document = createDocument(); document.body.prepend = (...children) => document.body.append(...children);
    for (const [tag,id] of [['ul','world-clock-list'],['input','world-clock-zone'],['input','world-clock-label'],['button','world-clock-add'],['button','world-clock-save'],['p','world-clock-error'],['input','hour12-format'],['input','show-seconds'],['ul','category-manage-list']]) {
        const el=document.createElement(tag);el.id=id;document.body.append(el);
    }
    document.getElementById('show-seconds').checked=true;
    const baseline = {hour12:false,showSeconds:true,worldClocks:[]};
    let saved=clone(baseline), pause=null;
    const writes=[], messages=[];
    const window={WorldClocks,addEventListener(){},location:{reload(){window.reloads=(window.reloads||0)+1}},confirm:()=>false};
    const context={window,document,console,Intl,JSON,setTimeout,clearTimeout,chrome:{}, storageManager:{
        defaultConfig:{clock:clone(baseline)}, async clear(){saved=clone(baseline);return true;},
        async setAll(settings,options) {
            if(pause){const gate=pause;pause=null;gate.entered.resolve();await gate.resume.promise;}
            if(settings.clock && options.expectedClock && JSON.stringify(saved)!==JSON.stringify(options.expectedClock)) throw new Error('Clock settings changed in another tab.');
            writes.push(clone({settings,options}));if(settings.clock)saved=clone(settings.clock);return true;
        }
    },messages};
    vm.createContext(context);
    vm.runInContext(source+`\nclockBaseline=${JSON.stringify(baseline)}; clockFormInitialized=true;
    collectFormData=async()=>({clock:clockFormSnapshot(),quote:'unrelated'});
    showMessage=(text,type)=>messages.push({text,type});displayStorageInfo=async()=>{};setupWorldClocks();`,context);
    vm.runInContext(fs.readFileSync('shared/local-content-lifecycle.js','utf8'),context);
    const get=id=>document.getElementById(id);
    const add=(zone,label='')=>{get('world-clock-zone').value=zone;get('world-clock-label').value=label;get('world-clock-add').dispatch('click')};
    return {context,window,document,get,add,writes,messages,get saved(){return saved},set saved(v){saved=clone(v)},set pause(v){pause=v}};
}
(async()=>{
    const h=harness();
    h.add('Invalid/Zone');assert.match(h.get('world-clock-error').textContent,/valid IANA/);assert.equal(h.document.activeElement,h.get('world-clock-zone'));
    h.add('Asia/Kathmandu','Family');assert.equal(h.get('world-clock-list').children.length,1);assert.equal(h.writes.length,0);
    assert(h.window.LocalItabContentLifecycle.hasUncommittedWork());assert.equal(h.window.LocalItabContentLifecycle.reload(),false);assert.equal(h.window.reloads,undefined);
    await h.context.saveAllSettings();assert.deepEqual(h.saved.worldClocks,[],'unrelated auto-save does not apply draft');assert(!('clock' in h.writes.at(-1).settings));
    await h.context.saveAllSettings(true);assert.equal(h.saved.worldClocks[0].label,'Family');assert(!h.window.LocalItabContentLifecycle.hasUncommittedWork());
    h.get('world-clock-zone').value='Europe/London';const enter=h.get('world-clock-zone').dispatch('keydown',{key:'Enter'});assert(enter.prevented);assert.equal(h.get('world-clock-list').children.length,2);
    h.get('world-clock-list').querySelectorAll('button')[1].dispatch('click');assert.equal(h.document.activeElement,h.get('world-clock-list').querySelector('button'));
    // Remote clock change is preserved on unrelated save; own clock edits conflict atomically.
    h.saved={hour12:false,showSeconds:true,worldClocks:[{timeZone:'UTC',label:'Remote'}]};
    await h.context.saveAllSettings();assert.equal(h.saved.worldClocks[0].label,'Remote');
    h.get('hour12-format').checked=true;const count=h.writes.length;await h.context.saveAllSettings(true);
    assert.equal(h.writes.length,count);assert.match(h.messages.at(-1).text,/changed in another tab/);assert(h.window.LocalItabContentLifecycle.hasUncommittedWork());
    // Submitted data owns only its baseline; a later draft survives async completion.
    const a=harness();a.add('UTC','Submitted');const entered=deferred(),resume=deferred();a.pause={entered,resume};
    const saving=a.context.saveAllSettings(true);await entered.promise;
    assert(a.window.worldClockSettingsView.pending);a.add('Asia/Tokyo','New draft');
    const unrelated=a.context.saveAllSettings();resume.resolve();await Promise.all([saving,unrelated]);
    assert.deepEqual(a.saved.worldClocks,[{timeZone:'UTC',label:'Submitted'}]);assert.equal(a.get('world-clock-list').children.length,2);assert(a.window.LocalItabContentLifecycle.hasUncommittedWork());
    await a.context.saveAllSettings(true);assert.equal(a.saved.worldClocks.length,2);assert(!a.window.worldClockSettingsView.pending);
    assert(!a.window.LocalItabContentLifecycle.hasUncommittedWork());
    a.get('world-clock-label').value='Unadded input';assert(a.window.LocalItabContentLifecycle.hasUncommittedWork());
    // Failed read baseline never turns default values into an authoritative write.
    vm.runInContext('clockBaseline=null;clockFormInitialized=true;',a.context);const before=a.writes.length;await a.context.saveAllSettings(true);assert.equal(a.writes.length,before);assert.match(a.messages.at(-1).text,/could not be read safely/);
    const r=harness();r.add('UTC','Draft');r.get('world-clock-zone').value='Unadded';await r.context.resetAllSettings();assert.deepEqual(r.saved.worldClocks,[]);assert.equal(r.window.reloads,1);assert.equal(r.get('world-clock-list').children.length,0);
    const html=fs.readFileSync('options.html','utf8');for(const id of ['world-clock-zone','world-clock-label'])assert(html.includes(`for="${id}"`));
    assert(html.includes('id="world-clock-suggestions"'));assert(fs.readFileSync('options.css','utf8').includes('.world-clock-inputs > div { flex: 1 1 180px; min-width: 0; }'));
    console.log('PASS world-clock Settings DOM model: Add/Remove/Enter/focus, explicit save, unrelated preservation, remote CAS conflict, async draft ownership, missing-read guard, reload protection and narrow layout source checks.');
})().catch(error=>{console.error(error);process.exitCode=1});
