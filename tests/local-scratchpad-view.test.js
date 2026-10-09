const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const storeApi = require('../shared/local-scratchpad-store');
const { Controller } = require('../shared/local-scratchpad-controller');
function model({fail=false}={}) {
    const document=createDocument(), events=new Map(), blobs=[];
    let raw, failRead=fail, failWrite=false, tail=Promise.resolve(), hold, writes=0;
    const listeners=new Set(), backend={
        lock(fn){const p=tail.then(fn);tail=p.catch(()=>{});return p;},
        async read(){if(failRead)throw Error();return structuredClone(raw);},
        async write(v){if(hold)await hold;if(failWrite)throw Error();raw=structuredClone(v);writes++;listeners.forEach(fn=>fn());},
        subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}
    };
    const api={...storeApi,Controller};
    const window={LocalItabScratchpad:api, Blob, URL:{createObjectURL(blob){blobs.push(blob);return'blob:test';},revokeObjectURL(){}}, setTimeout(fn){fn();},addEventListener:(type,fn)=>events.set(type,fn),removeEventListener:type=>events.delete(type)};
    const create=document.createElement;document.createElement=tag=>{const node=create(tag);node.click=()=>node.dispatch('click');return node;};
    vm.runInNewContext(fs.readFileSync(require.resolve('../shared/local-scratchpad-view'),'utf8'),{window,document});
    const host=document.createElement('article');document.body.append(host);const controller=new Controller(new api.Store(backend),{delay:5});
    const view=new api.View(host,{controller});
    return {window,document,host,controller,view,api,events,blobs,backend,get raw(){return raw;},get writes(){return writes;},readFail:v=>failRead=v,writeFail:v=>failWrite=v,hold:p=>hold=p,flush:()=>new Promise(r=>setTimeout(r,25))};
}
test('DOM model: initial off state distinct from load failure, readonly Retry then off without writing',async()=>{
    const m=model({fail:true});await m.flush();assert(!m.host.hidden);assert(m.view.textarea.readOnly);assert(!m.view.retry.hidden);assert.equal(m.writes,0);
    m.readFail(false);m.view.retry.dispatch('click');await m.flush();assert(m.host.hidden);assert(!m.view.textarea.readOnly);assert.equal(m.writes,0);m.view.destroy();
});
test('DOM model: plain textarea, IME/new pending edits stay accessible; export exact current draft',async()=>{
    const m=model();await m.flush();await m.controller.setEnabled(true);assert(!m.host.hidden);
    const draft=' \t<script>alert(1)</script> 😀\n';m.view.textarea.dispatch('compositionstart');m.view.textarea.value=draft;m.view.textarea.dispatch('input');await m.flush();assert.equal(m.raw.content,'');
    m.view.exportButton.dispatch('click');assert.equal(await m.blobs[0].text(),draft);
    let release;m.hold(new Promise(r=>release=r));m.view.textarea.dispatch('compositionend');await new Promise(r=>setTimeout(r,10));assert(m.controller.pending);
    m.view.textarea.value=draft+'more';m.view.textarea.dispatch('input');assert.equal(m.view.textarea.value,draft+'more');assert(!m.host.hidden);assert.match(m.view.status.textContent,/Saving/);
    release();m.hold(null);await m.flush();assert.equal(m.raw.content,draft+'more');assert.match(m.view.status.textContent,/Saved/);assert.equal(m.view.status.getAttribute('aria-live'),'polite');assert.equal(m.view.exportButton.type,'button');m.view.destroy();
});
test('DOM model: other-page hide cannot hide unsaved draft; conflict preview and explicit discard',async()=>{
    const m=model();await m.flush();await m.controller.setEnabled(true);m.controller.setComposing(true);m.view.textarea.value='retain';m.view.textarea.dispatch('input');
    await new m.api.Store(m.backend).mutate({kind:'visibility',value:false,revision:m.raw.revision});await m.flush();assert(!m.host.hidden);assert(m.controller.conflict);assert(!m.view.savedPreview.hidden);assert(m.view.savedPreview.readOnly);assert.equal(m.view.textarea.value,'retain');
    m.view.textarea.dispatch('compositionend');m.view.useSaved.dispatch('click');await m.flush();assert(m.host.hidden);assert.equal(m.view.textarea.value,'');m.view.destroy();
});
test('DOM model: failed draft survives export and beforeunload guarded only while unsettled',async()=>{
    const m=model();await m.flush();await m.controller.setEnabled(true);m.writeFail(true);m.view.textarea.value='draft';m.view.textarea.dispatch('input');await m.flush();assert(!m.view.retry.hidden);assert(!m.host.hidden);
    const event={preventDefault(){this.prevented=true;}};m.events.get('beforeunload')(event);assert(event.prevented);
    m.view.exportText();assert.equal(await m.blobs[0].text(),'draft');m.writeFail(false);m.view.retry.dispatch('click');await m.flush();assert.equal(m.raw.content,'draft');
    const clean={preventDefault(){this.prevented=true;}};m.events.get('beforeunload')(clean);assert(!clean.prevented);m.view.destroy();assert(!m.events.has('beforeunload'));
});
test('DOM model: keyboard-native labelled textarea and settings toggle stay separate from configuration',async()=>{
    const m=model();await m.flush();const host=m.document.createElement('div');m.document.body.append(host);
    const c=new Controller(new m.api.Store(m.backend));const settings=m.api.mountSettings(host,{controller:c});await m.flush();const input=host.querySelector('input');assert.equal(input.type,'checkbox');assert.equal(input.checked,false);input.checked=true;input.dispatch('change');await m.flush();assert.equal(m.raw.enabled,true);assert(!m.host.hidden);
    assert.equal(m.view.textarea.getAttribute('aria-label'),'Scratchpad text');assert(m.view.textarea.getAttribute('maxlength') == null);assert.equal(m.view.savedPreview.getAttribute('aria-label'),'Latest saved text');settings.destroy();m.view.destroy();
});
test('DOM model: corrupt later read makes retained draft readonly until valid retry',async()=>{
    const m=model();await m.flush();await m.controller.setEnabled(true);m.controller.setComposing(true);m.controller.setDraft('retained');m.controller.setComposing(false);m.controller.cancelTimer();
    await m.backend.write({...m.raw,content:42});await m.flush();assert(m.view.textarea.readOnly);assert.equal(m.controller.draft,'retained');
    await m.backend.write({...m.api.initial(),enabled:true,revision:2});await m.flush();await m.controller.retry();assert(!m.view.textarea.readOnly);assert.equal(m.controller.draft,'retained');m.view.destroy();
});
test('DOM model: export preserves stored CRLF and rejects lossy invalid Unicode without rejecting long text',async()=>{
    const m=model();await m.flush();await m.backend.write({...m.api.initial(),enabled:true,revision:1,content:'a\r\nb\rc'});await m.flush();m.view.textarea.value='a\nb\nc';m.view.exportText();assert.equal(await m.blobs[0].text(),'a\r\nb\rc');
    m.controller.setDraft('a\uD800b');m.view.exportText();assert.equal(m.blobs.length,1);assert.match(m.view.status.textContent,/cannot be saved or exported exactly/);
    m.controller.setDraft('x'.repeat(32001));m.view.exportText();assert.equal((await m.blobs[1].text()).length,32001);assert.equal(m.view.count.getAttribute('aria-live'),undefined);m.view.destroy();
});
test('integration: unsettled Scratchpad blocks dashboard hide; saved follows normal visibility',()=>{
    const source=fs.readFileSync(require.resolve('../newtab.js'),'utf8');const start=source.indexOf('function setDashboardHidden(hidden)');const end=source.indexOf('\n}',start)+2;
    for(const unsettled of [true,false]) {
        const context={window:{localScratchpadView:{hasUncommittedWork:()=>unsettled}},dashboardHiddenState:false,currentUiState:{},applied:null,applyDashboardHiddenState(value){this.applied=value;}};
        vm.createContext(context);vm.runInContext(source.slice(start,end)+';setDashboardHidden(true);',context);assert.equal(context.dashboardHiddenState,!unsettled);
    }
    assert(source.includes('.local-scratchpad-card'));
});
test('integration: configuration reload defers dirty, failed, conflict and pending Scratchpad',()=>{
    const lifecycle=fs.readFileSync(require.resolve('../shared/local-content-lifecycle'),'utf8');
    for(const state of ['dirty','error','conflict','pending']) {
        const document=createDocument();document.body.prepend=(...nodes)=>document.body.append(...nodes);let reloads=0;
        const window={localScratchpadView:{controller:{pending:state==='pending'},hasUncommittedWork:()=>true},location:{reload(){reloads++;}},addEventListener(){}};
        vm.runInNewContext(lifecycle,{window,document});assert.equal(window.LocalItabContentLifecycle.reload(),false);assert.equal(reloads,0);
    }
});
test('DOM model: conflict read failure retains Retry and ongoing IME completion',async()=>{
    const m=model();await m.flush();await m.controller.setEnabled(true);m.controller.setComposing(true);m.controller.setDraft('draft');
    await new m.api.Store(m.backend).mutate({kind:'content',value:'other',revision:m.raw.revision});await m.flush();assert(m.controller.conflict);
    m.readFail(true);await assert.rejects(m.controller.refresh());assert(!m.view.retry.hidden);assert(m.view.replace.disabled);assert(m.view.textarea.readOnly);
    m.view.textarea.value='draft 完成';m.view.textarea.dispatch('compositionend');assert.equal(m.controller.draft,'draft 完成');assert.equal(m.view.textarea.value,'draft 完成');assert.equal(m.raw.content,'other');m.view.destroy();
});
