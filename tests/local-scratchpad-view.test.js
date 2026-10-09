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
    const window={LocalItabScratchpad:api, Blob, TextDecoder, URL:{createObjectURL(blob){blobs.push(blob);return'blob:test';},revokeObjectURL(){}}, setTimeout(fn){fn();},addEventListener:(type,fn)=>events.set(type,fn),removeEventListener:type=>events.delete(type)};
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

for (const recovery of ['unchanged refresh', 'changed refresh', 'changed retry']) {
    test(`DOM model privacy: hidden saved text stays hidden through passive failure and ${recovery}`, async () => {
        const m = model(); await m.flush();
        await m.backend.write({ ...m.api.initial(), revision: 1, content: 'private saved note' }); await m.flush();
        assert(m.host.hidden); assert(!m.controller.hasUncommittedWork());
        m.readFail(true); await assert.rejects(m.controller.refresh());
        assert(m.host.hidden, 'a passive read failure must not reveal saved text');
        assert(!m.controller.hasUncommittedWork(), 'passive errors must not block clean reloads');
        m.readFail(false);
        if (recovery.startsWith('changed')) {
            // Avoid a subscription refresh so Retry itself must reconcile the clean state.
            const read = m.controller.store.read.bind(m.controller.store);
            m.controller.store.read = async () => ({ ...(await read()), revision: 2, content: 'new hidden saved note' });
        }
        const visibility = []; const unsubscribe = m.controller.subscribe(() => visibility.push(m.host.hidden));
        await (recovery.endsWith('retry') ? m.controller.retry() : m.controller.refresh());
        assert(m.host.hidden); assert(visibility.every(Boolean)); assert(!m.controller.conflict);
        assert(!m.controller.error); assert(!m.controller.hasUncommittedWork()); assert(m.view.savedPreview.hidden);
        assert.equal(m.controller.draft, recovery.startsWith('changed') ? 'new hidden saved note' : 'private saved note');
        unsubscribe(); m.view.destroy();
    });
}
test('DOM model privacy: failed owned Hide survives a later passive read error until acknowledged', async () => {
    const m = model(); await m.flush(); await m.controller.setEnabled(true);
    m.controller.setDraft('saved private note'); await m.controller.save();
    // The write committed, but its acknowledgement was lost.
    const mutate = m.controller.store.mutate.bind(m.controller.store);
    m.controller.store.mutate = async command => { await mutate(command); throw m.api.fault('VERIFY'); };
    await assert.rejects(m.controller.setEnabled(false)); await m.flush();
    assert.equal(m.controller.state.enabled, false); assert(!m.host.hidden); assert(m.controller.hasUncommittedWork());
    m.readFail(true); await assert.rejects(m.controller.refresh());
    assert(!m.host.hidden); assert(m.controller.hasUncommittedWork()); assert(m.view.textarea.readOnly);
    m.readFail(false); await m.controller.retry();
    assert(m.host.hidden); assert(!m.controller.hasUncommittedWork()); assert(!m.controller.conflict); m.view.destroy();
});
test('DOM model privacy: genuine dirty draft remains accessible across passive failure and remote hide', async () => {
    const m = model(); await m.flush(); await m.controller.setEnabled(true);
    m.controller.setComposing(true); m.controller.setDraft('owned local draft');
    m.readFail(true); await assert.rejects(m.controller.refresh()); assert(!m.host.hidden); assert(m.view.textarea.readOnly);
    m.readFail(false); await m.backend.write({ ...m.raw, revision: m.raw.revision + 1, enabled: false, content: 'remote saved note' }); await m.flush();
    assert(!m.host.hidden); assert(m.controller.conflict); assert(m.controller.hasUncommittedWork());
    assert.equal(m.controller.draft, 'owned local draft'); assert.equal(m.view.savedPreview.value, 'remote saved note');
    m.controller.setComposing(false); await m.controller.useSaved(); assert(m.host.hidden); assert(!m.controller.hasUncommittedWork()); m.view.destroy();
});
test('DOM model privacy: owned pending Hide stays accessible until confirmed, then hides', async () => {
    const m = model(); await m.flush(); await m.controller.setEnabled(true);
    let release; m.hold(new Promise(resolve => { release = resolve; }));
    const pending = m.controller.setEnabled(false); await new Promise(resolve => setImmediate(resolve));
    assert(m.controller.pendingWrite); assert(m.controller.hasUncommittedWork()); assert(!m.host.hidden);
    release(); await pending; await m.flush(); assert(m.host.hidden); assert(!m.controller.hasUncommittedWork()); m.view.destroy();
});
test('DOM model privacy: correcting a rejected draft to saved content relinquishes write ownership', async () => {
    const m = model(); await m.flush(); await m.controller.setEnabled(true);
    m.controller.setDraft('saved note'); await m.controller.save();
    m.controller.setDraft('x'.repeat(32001)); await assert.rejects(m.controller.save());
    assert(m.controller.writeError); m.controller.setDraft('saved note');
    assert(!m.controller.hasUncommittedWork()); assert(!m.controller.error);
    await m.backend.write({ ...m.raw, revision: m.raw.revision + 1, enabled: false }); await m.flush();
    assert(m.host.hidden); assert(!m.controller.conflict); m.view.destroy();
});

function importFile(m, text, overrides = {}) {
    const bytes = new TextEncoder().encode(text);
    m.view.chooseImport(); m.view.importFile.files = [{ name: 'copy.txt', size: bytes.length, arrayBuffer: async () => bytes.buffer, ...overrides }];
    return m.view.readImport();
}
async function importModel() { const m = model(); await m.flush(); await m.controller.setEnabled(true); return m; }
test('Import text: own TXT roundtrip preserves exact Unicode, BOM, newlines, whitespace and literal HTML', async () => {
    const m = await importModel(), text = '\uFEFF \t中文 😀\r\n<script>not markup</script>\rb\n\n';
    m.controller.setDraft(text); await m.controller.save(); m.view.exportText(); const blob = m.blobs[0];
    m.controller.setDraft('old'); await m.controller.save(); const writes = m.writes;
    await importFile(m, '', { name: '<img onerror=x>.txt', size: blob.size, arrayBuffer: () => blob.arrayBuffer() });
    assert.equal(m.writes, writes); assert.equal(m.raw.content, 'old'); assert.equal(m.view.importPreview.textContent, text);
    assert.match(m.view.importInfo.textContent, /^<img onerror=x>\.txt/); assert.equal(m.view.importPreview.children.length, 0);
    assert.equal(m.document.activeElement, m.view.importCancel); assert(!m.view.exportButton.disabled);
    m.view.importApply.dispatch('click'); await m.flush(); assert.equal(m.raw.content, text); assert.match(m.view.status.textContent, /Saved/);
    assert.equal(m.document.activeElement, m.view.textarea); m.view.destroy();
});
test('Import text: Cancel, Escape and picker dismissal write nothing and clear preview', async () => {
    const m = await importModel(), writes = m.writes;
    await importFile(m, 'new'); m.view.importCancel.dispatch('click'); assert.equal(m.document.activeElement, m.view.importButton);
    await importFile(m, 'new'); m.view.importPanel.dispatch('keydown', { key: 'Escape', preventDefault() {} });
    assert(m.view.importPanel.hidden); m.view.chooseImport(); m.view.importFile.dispatch('cancel');
    assert.equal(m.writes, writes); assert.equal(m.raw.content, ''); assert(!m.view.importSession); m.view.destroy();
});
for (const [name, text, overrides] of [
    ['oversize before read', '', { size: 131073, arrayBuffer() { throw Error('must not read'); } }],
    ['too many characters', 'x'.repeat(32001), {}],
    ['invalid UTF8', '', { size: 2, arrayBuffer: async () => new Uint8Array([0xC3, 0x28]).buffer }],
    ['read failure', '', { arrayBuffer: async () => { throw Error('read'); } }],
    ['wrong extension', '', { name: 'copy.html' }],
    ['oversize returned buffer', '', { arrayBuffer: async () => new ArrayBuffer(131073) }]
]) test(`Import text rejects ${name} without changing text`, async () => {
    const m = await importModel(), writes = m.writes; await importFile(m, text, overrides);
    assert(m.view.importApply.disabled); assert.match(m.view.importInfo.textContent, /Could not read/);
    m.view.applyImport(); assert.equal(m.writes, writes); assert.equal(m.controller.draft, ''); m.view.destroy();
});
for (const change of ['edit undo', 'IME', 'remote', 'refresh', 'read error', 'cancel', 'destroy', 'new chooser']) {
    test(`Import text: stale asynchronous completion cannot apply after ${change}`, async () => {
        const m = await importModel(); let resolve; const buffer = new TextEncoder().encode('import').buffer;
        const pending = importFile(m, '', { arrayBuffer: () => new Promise(r => resolve = r) });
        if (change === 'edit undo') { m.controller.setDraft('a'); m.controller.setDraft(''); }
        if (change === 'IME') { m.controller.setComposing(true); m.controller.setComposing(false); }
        if (change === 'remote') { await new m.api.Store(m.backend).mutate({ kind: 'content', value: 'remote', revision: m.raw.revision }); await m.flush(); }
        if (change === 'refresh') await m.controller.refresh();
        if (change === 'read error') { m.readFail(true); await assert.rejects(m.controller.refresh()); }
        if (change === 'cancel') m.view.cancelImport(true);
        if (change === 'destroy') m.view.destroy();
        if (change === 'new chooser') m.view.chooseImport();
        resolve(buffer); await pending; m.view.applyImport(); await m.flush();
        assert.notEqual(m.controller.draft, 'import'); assert.notEqual(m.raw.content, 'import'); m.view.destroy();
    });
}
test('Import text: settled gates, empty replacement, save failure and Retry use existing controller recovery', async () => {
    const m = await importModel(); m.controller.setComposing(true); m.view.chooseImport(); assert(!m.view.importSession);
    m.controller.setComposing(false); m.controller.setDraft('old'); m.view.chooseImport(); assert(!m.view.importSession); await m.controller.save();
    await importFile(m, 'imported'); m.writeFail(true); m.view.applyImport(); await m.flush();
    assert.equal(m.controller.draft, 'imported'); assert.equal(m.raw.content, 'old'); assert(!m.view.retry.hidden); assert.match(m.view.status.textContent, /Could not confirm/);
    m.view.exportText(); assert.equal(await m.blobs[0].text(), 'imported'); m.writeFail(false); await m.controller.retry(); assert.equal(m.raw.content, 'imported');
    await importFile(m, ''); m.view.applyImport(); await m.flush(); assert.equal(m.raw.content, ''); m.view.destroy();
});
test('Import text: unseen concurrent write is rejected by store CAS and retains imported draft', async () => {
    const m = await importModel(); await importFile(m, 'imported');
    m.controller.unsubscribe(); m.controller.unsubscribe = null;
    await new m.api.Store(m.backend).mutate({kind:'content',value:'remote',revision:m.raw.revision});
    m.view.applyImport(); await m.flush(); assert.equal(m.raw.content, 'remote'); assert.equal(m.controller.draft, 'imported'); assert(m.controller.conflict); m.view.destroy();
});
test('Import text: failed readback never claims Saved; Retry verifies a committed draft', async () => {
    const m = await importModel(); await importFile(m, 'imported');
    const mutate = m.controller.store.mutate.bind(m.controller.store);
    m.controller.store.mutate = async command => { await mutate(command); throw m.api.fault('VERIFY'); };
    m.view.applyImport(); await m.flush(); assert.equal(m.raw.content, 'imported'); assert.doesNotMatch(m.view.status.textContent, /^Saved/); assert(m.controller.writeError);
    await m.controller.retry(); assert.match(m.view.status.textContent, /Saved/); assert(!m.controller.hasUncommittedWork()); m.view.destroy();
});
test('Import text: exact character limit accepted; byte gate rejects before reading; multiple files rejected', async () => {
    const m = await importModel(); await importFile(m, '😀'.repeat(32000)); assert(!m.view.importApply.disabled);
    let reads = 0; await importFile(m, '', { size: 131073, arrayBuffer() { reads++; return Promise.resolve(new ArrayBuffer(0)); } });
    assert.equal(reads, 0); assert(m.view.importApply.disabled);
    m.view.chooseImport(); m.view.importFile.files = [1, 2].map(() => ({ name: 'a.txt', size: 0, arrayBuffer: async () => { reads++; return new ArrayBuffer(0); } }));
    await m.view.readImport(); assert.equal(reads, 0); assert(m.view.importApply.disabled); m.view.destroy();
});
test('Import text: completed preview invalidates on edits and remote hide without leaking ownership', async () => {
    const m = await importModel(); await importFile(m, 'imported'); m.controller.setDraft(''); assert(m.view.importPanel.hidden);
    await importFile(m, 'imported'); await new m.api.Store(m.backend).mutate({kind:'visibility',value:false,revision:m.raw.revision}); await m.flush();
    assert(m.view.importPanel.hidden); assert(m.host.hidden); assert(!m.view.hasUncommittedWork()); m.view.applyImport(); assert.equal(m.raw.content, ''); m.view.destroy();
});
test('Import text adds no network, storage keys or permissions and uses controller save', () => {
    const view = fs.readFileSync(require.resolve('../shared/local-scratchpad-view'), 'utf8');
    const importCode = view.slice(view.indexOf('        canImport()'), view.indexOf('        exportText()'));
    assert(!/fetch\(|XMLHttpRequest|chrome\.storage|localStorage|sessionStorage/.test(importCode));
    assert(importCode.includes('this.controller.setDraft(text)')); assert(importCode.includes('this.controller.save()'));
});
