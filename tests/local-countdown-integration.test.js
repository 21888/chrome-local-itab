const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createDocument} = require('./helpers/task-dom-model');
const read = file => fs.readFileSync(file,'utf8');
function context(page) {
    const document=createDocument(),listeners=new Map();document.body.prepend=(...nodes)=>document.body.append(...nodes);
    let reloads=0,confirms=0;const window={location:{reload(){reloads++}},confirm(){confirms++;return true},addEventListener(type,fn){listeners.set(type,fn)}};
    const ctx={document,window,console};vm.createContext(ctx);vm.runInContext(read('shared/local-content-lifecycle.js'),ctx);if(page)vm.runInContext(read(page),ctx);
    return {ctx,document,window,listeners,get reloads(){return reloads},get confirms(){return confirms}};
}
test('countdown drafts and pending writes guard reload without intercepting a clean saved date',()=>{
    for(const key of ['localCountdownView','localCountdownSettingsView']) {
        const h=context();let dirty=true;h.window[key]={controller:{pending:false},hasUncommittedWork:()=>dirty};
        assert.equal(h.window.LocalItabContentLifecycle.reload(),false);assert.equal(h.reloads,0);
        h.window[key].controller.pending=true;h.document.getElementById('local-content-reload-notice').querySelector('button').dispatch('click');assert.equal(h.reloads,0);assert.equal(h.confirms,0);
        h.window[key].controller.pending=false;h.document.getElementById('local-content-reload-notice').querySelector('button').dispatch('click');assert.equal(h.reloads,1);assert.equal(h.confirms,1);
        dirty=false;assert.equal(h.window.LocalItabContentLifecycle.reload(),true);
    }
    const h=context();h.window.localCountdownSettingsView={controller:{pending:false},hasUncommittedWork:()=>true};let prevented=false;const event={preventDefault(){prevented=true}};h.listeners.get('beforeunload')(event);assert(prevented);assert.equal(event.returnValue,'');
});
test('countdown-only card participates in all template grids without enabling configuration widgets',()=>{
    const h=context('newtab.js');const main=h.document.createElement('main');main.className='dashboard-main';const cards=h.document.createElement('section');cards.id='info-cards-container';main.append(cards);h.document.body.append(main);
    const show={clock:false,search:false,shortcuts:false,weather:false,hot:false,movie:false};
    h.ctx.applyModuleVisibility(show);assert(cards.classList.contains('module-hidden'));
    h.window.localItabCountdownVisible=true;h.ctx.applyModuleVisibility(show);assert(!cards.classList.contains('module-hidden'));assert(main.classList.contains('has-info-cards'));assert.deepEqual(JSON.parse(JSON.stringify(h.window.localItabModuleVisibility)),show);
    h.window.localItabCountdownVisible=false;h.ctx.applyModuleVisibility(show);assert(cards.classList.contains('module-hidden'));
    const card=h.document.createElement('article');card.className='local-countdown-card';h.document.body.append(card);assert.equal(h.ctx.shouldToggleFromEvent({target:card}),false);
});
test('countdown is device-only wired, ordered before page code, privately keyed and explicitly packaged',()=>{
    for(const page of ['newtab','options']){
        const html=read(page+'.html');assert(html.includes('local-countdown.css'));
        for(const part of ['store','controller','view']) assert(html.indexOf('shared/local-countdown-'+part+'.js')<html.indexOf('<script src="'+page+'.js"'));
    }
    assert(read('newtab.html').includes('id="local-countdown-card" hidden'));
    assert(read('options.html').includes('id="countdown-settings"'));
    assert(read('options.js').includes('window.localCountdownSettingsView = window.LocalItabCountdown.mountSettings'));
    assert(read('newtab.js').includes('.local-countdown-card,'));
    assert(read('dashboard-templates.css').includes('.local-countdown-card):not(.module-hidden):not([hidden])'));
    assert(read('storage.js').includes("'__localItabCountdownV1'"));
    assert(!read('manifest.json').includes('countdown'));
});
test('countdown catalogs share complete nonempty English and Chinese keys',()=>{
    const catalogs=['en','zh_CN'].map(locale=>Object.fromEntries(Object.entries(JSON.parse(read('_locales/'+locale+'/messages.json'))).filter(([key])=>key.startsWith('countdown'))));
    assert(Object.keys(catalogs[0]).length>15);assert.deepEqual(Object.keys(catalogs[0]).sort(),Object.keys(catalogs[1]).sort());
    for(const entries of catalogs)for(const {message} of Object.values(entries))assert(message.length);
});
