const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const settle = async () => { for (let i=0;i<5;i++) await new Promise(setImmediate); };
for (const failed of ['Focus', 'Countdown']) for (const locale of ['en', 'zh_CN']) test(`dashboard preserves other real personal cards after ${failed} registration failure: ${locale}`, async t => {
    const document = createDocument(), timers = new Map(); let timer = 0, writes = 0;
    for (const name of ['focus','countdown','scratchpad']) { const e=document.createElement('section');e.id=`local-${name}-card`;document.body.append(e); }
    const quote=document.createElement('p');quote.id='quote-container';document.body.append(quote);
    const c={document,URL,TextEncoder,TextDecoder,structuredClone,performance,console:{log(){},error(){},warn(){}},addEventListener(){},removeEventListener(){},setTimeout(fn){timers.set(++timer,fn);return timer;},clearTimeout(id){timers.delete(id);},setInterval(){return 0;},clearInterval(){}};c.window=c;c.globalThis=c;
    const messages=JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`,'utf8'));c.i18n={t:key=>messages[key]?.message||key};
    vm.createContext(c);
    for (const name of ['focus','countdown','scratchpad']) for (const part of ['store','controller','view']) vm.runInContext(fs.readFileSync(`shared/local-${name}-${part}.js`,'utf8'),c);
    const raw={}, reads={};let broken=true;
    for (const name of ['Focus','Countdown','Scratchpad']) {const api=c['LocalItab'+name];raw[api.KEY]=api.initial();}
    raw[c.LocalItabScratchpad.KEY].content='Independent saved note';raw[c.LocalItabScratchpad.KEY].enabled=true;
    const before=JSON.stringify(raw);
    c.LocalItabWorkspaces={session:{createBackend(key){const listeners=new Set();return {lock:fn=>Promise.resolve().then(fn),read:async()=>{reads[key]=(reads[key]||0)+1;return structuredClone(raw[key]);},write:async v=>{writes++;raw[key]=structuredClone(v);listeners.forEach(fn=>fn());},subscribe(fn){if(broken&&key===c['LocalItab'+failed].KEY)throw Error('synthetic registration failure');listeners.add(fn);return()=>listeners.delete(fn);}};}}};
    c.storageManager={getAll:async()=>({show:{},quote:'Original quote'})};
    vm.runInContext(fs.readFileSync('newtab.js','utf8'),c);
    // Non-personal styling/network boundaries only. Real dashboard initializer,
    // module mount functions, default Controllers and Stores remain unmodified.
    for(const name of ['applyThemePreset','updateTemplateIntro','applyBackgroundSettings','applyModuleVisibility','initializeLocalInfoCards'])c[name]=()=>{};
    c.getEffectivePrivacyConfig=async()=>({});
    t.after(()=>{for(const name of ['Focus','Countdown','Scratchpad'])c['local'+name+'View']?.destroy();});
    await assert.doesNotReject(()=>c.initializeDashboard());await settle();
    for(const name of ['Focus','Countdown','Scratchpad']) assert(c['local'+name+'View'],`${name} actually mounted`);
    const view=c['local'+failed+'View'];assert.equal(view.controller.error?.code,'SUBSCRIPTION');
    assert.equal(reads[c['LocalItab'+failed].KEY]||0,0);assert(view.retry.hidden);
    assert.equal(c.localScratchpadView.textarea.value,'Independent saved note');
    assert.equal(quote.children[0].textContent,'Original quote');
    assert.equal((view.feedback||view.status).textContent,messages[failed.toLowerCase()+'SubscriptionError'].message);
    const settingsHost=document.createElement('section');document.body.append(settingsHost);
    const settings=c['LocalItab'+failed].mountSettings(settingsHost);t.after(()=>settings.destroy());await settle();
    assert(settingsHost.querySelector('input').disabled);
    assert.equal((failed==='Focus'?settingsHost.querySelector('.focus-feedback'):settings.status).textContent,messages[failed.toLowerCase()+'SubscriptionError'].message);
    assert((failed==='Focus'?settingsHost.querySelector('button'):settings.retry).hidden);
    assert.equal(JSON.stringify(raw),before);assert.equal(writes,0);
    broken=false;
    await assert.rejects(view.controller.refresh(),{code:'SUBSCRIPTION'});
    if(failed==='Focus') await assert.rejects(view.controller.action('visibility',true),{code:'SUBSCRIPTION'});
    else for(const call of [()=>view.controller.init(),()=>view.controller.retry(),()=>view.controller.useSaved(),()=>view.controller.run('save',{enabled:true,title:'unsafe',targetDate:'2030-01-01'},0)]) await assert.rejects(call(),{code:'SUBSCRIPTION'});
    const fresh=new c['LocalItab'+failed].Controller();
    t.after(()=>fresh.destroy());await (fresh.init?fresh.init():fresh.refresh());
    assert(fresh.state);assert.equal(JSON.stringify(raw),before);assert.equal(writes,0);
});
