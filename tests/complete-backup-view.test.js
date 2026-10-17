const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const {fixture, Backup, Prompts, Collections} = require('./helpers/complete-backup-acceptance');
const source = fs.readFileSync('shared/complete-backup-view.js', 'utf8');
const flush = async () => { await new Promise(resolve => setTimeout(resolve, 10)); };
const waitFor = async (predicate) => {
    const deadline = Date.now() + 2000;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1));
    assert(predicate(), 'expected backup UI state settled');
};
const modules = ['config','tasks','scratchpad','countdown','focus'];
function model(locale, options = {}) {
    const document = createDocument({blurUnavailableFocus:true}); const host = document.createElement('div'); document.body.append(host);
    const calls = {reviews:[],restores:[],exports:[],downloads:[]};
    const exportStore = fixture().store;
    const store = {
        manager:exportStore.manager, counts:exportStore.counts.bind(exportStore), workspaceCounts:exportStore.workspaceCounts.bind(exportStore),
        async review(text, selected = modules) { calls.reviews.push([text, selected]); return {modules,selected,incoming:{config:{shortcuts:5,categories:2,dataUrlIcons:1},tasks:{active:2,done:3,removed:1,recovery:4},scratchpad:{characters:15},focus:{enabled:true,durations:{focus:25,break:5}}},current:{}}; },
        async restore(preview) { calls.restores.push(preview); },
        async export(selected) { calls.exports.push(selected); return exportStore.export(selected); }, async recovery() { return 'RECOVERY'; },
        ...options.store
    };
    const window = {LocalItabCompleteBackup:Backup, LocalItabPrompts:Prompts, LocalItabAICollections:Collections};
    if (locale) { const catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`)); window.i18n = {t:key=>catalog[key]?.message || key}; }
    vm.runInNewContext(source,{window,setTimeout,URL,Blob});
    const view = window.LocalItabCompleteBackupView.mount(host,{store,restore:p=>store.restore(p),download:async (...args)=>{calls.downloads.push(args);if(options.download)await options.download(...args);},reload:()=>{calls.reloads=(calls.reloads||0)+1;}});
    const get = cls => host.querySelector('.complete-backup-'+cls);
    const file=get('file'); file.click=()=>{};
    const select = (text='saved', options={}) => { get('choose').focus(); file.files=[{size:text.length,text:async()=>text,...options}]; file.dispatch('change'); };
    return {document,host,store,view,calls,get,file,select};
}
test('saved module export prepares a summary before explicit download; no completion claim, automatic restore or reload',async()=>{
    const m=model();m.get('export').dispatch('click');await waitFor(()=>!m.get('download-export').disabled);assert.equal(m.calls.downloads.length,0);m.get('download-export').dispatch('click');await waitFor(()=>/Download requested/.test(m.get('status').textContent));assert.equal(m.calls.exports.length,1);assert.equal(m.calls.downloads.length,1);assert.match(m.get('status').textContent,/Download requested.*completion cannot be verified/);assert.equal(m.calls.restores.length,0);assert(!m.calls.reloads);
});
test('preview shows selected module counts and destructive Focus consequence before one explicit apply',async()=>{
    const m=model();m.select();await waitFor(()=>!m.get('apply').disabled);assert.equal(m.calls.restores.length,0);assert.equal(m.get('preview').hidden,false);assert.match(m.get('warning').textContent,/blocked while an affected workspace has a running, paused or interrupted/);assert(m.host.querySelectorAll('li').some(li=>li.children.some(n=>n.textContent?.includes('Saved history copies: 4'))));
    m.get('apply').dispatch('click');m.get('apply').dispatch('click');await waitFor(()=>/restored and verified/.test(m.get('status').textContent));assert.equal(m.calls.restores.length,1);assert.match(m.get('status').textContent,/restored and verified/);assert(!m.calls.reloads);m.get('reload').dispatch('click');assert.equal(m.calls.reloads,1);
});
test('module changes invalidate prior preview and remove Focus warning when deselected',async()=>{
    const m=model();m.select();await waitFor(()=>!m.get('apply').disabled);const focus=m.host.querySelector('[data-module="focus"]');focus.checked=false;focus.dispatch('change');assert(m.get('apply').disabled);await waitFor(()=>!m.get('apply').disabled);assert.equal(m.calls.reviews.length,2);assert(!m.calls.reviews[1][1].includes('focus'));assert(m.get('warning').hidden);
});
test('Cancel during delayed read makes no preview, save or focus theft; a newer file owns its source',async()=>{
    const m=model(),wait=deferred();m.select('old',{text:()=>wait.promise});m.get('cancel').dispatch('click');assert.equal(m.document.activeElement,m.get('choose'));m.select('new');await waitFor(()=>!m.get('apply').disabled);wait.resolve('old');await flush();assert.equal(m.calls.reviews.length,1);assert.equal(m.calls.reviews[0][0],'new');assert.equal(m.calls.restores.length,0);
});
test('oversize/read rejection are nonmutating; uncertain apply never claims unchanged data',async()=>{
    const m=model();let read=0;m.select('x',{size:32*1024*1024+1,text:()=>{read++;}});await flush();assert.equal(read,0);assert.match(m.get('status').textContent,/size limit/);m.select('x',{text:async()=>{throw Error('secret path');}});await flush();assert.match(m.get('status').textContent,/Could not read the local file/);assert(!m.get('status').textContent.includes('secret'));
    m.select();await waitFor(()=>!m.get('apply').disabled);m.store.restore=async()=>{throw {code:'UNCONFIRMED',mayHaveCommitted:true};};m.get('apply').dispatch('click');await waitFor(()=>/Some data may have changed/.test(m.get('status').textContent));assert.match(m.get('status').textContent,/Some data may have changed/);assert(m.get('reload').hidden);assert(!m.calls.reloads);
});
test('delayed preview cannot overwrite a newer selection; detached view never applies',async()=>{
    const m=model(),wait=deferred(),real=m.store.review;let entered=false;m.store.review=()=>{entered=true;return wait.promise;};m.select('old');await waitFor(()=>entered);m.get('cancel').dispatch('click');m.store.review=real;m.select('new');await waitFor(()=>!m.get('apply').disabled);wait.resolve({modules,selected:modules,incoming:{},current:{}});await flush();assert.equal(m.calls.reviews[0][0],'new');const apply=m.get('apply');m.view.destroy();apply.dispatch('click');assert.equal(m.calls.restores.length,0);
});
test('CN and EN catalogs cover every fallback key, public search indexes labels only',()=>{
    const keys=[...source.matchAll(/^    "(\w+)":/gm)].map(m=>'completeBackup'+m[1]);assert(keys.length>40);for(const locale of ['en','zh_CN']){const catalog=JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));for(const key of keys)assert(catalog[key]?.message,key);}
    const search=fs.readFileSync('shared/settings-search.js','utf8');assert(search.includes('"completeBackupTitle"'));assert(!search.includes('completeBackupView'));
});
test('empty selection makes no invalid core call and permits selection again',async()=>{
    const m=model();m.select();await waitFor(()=>!m.get('apply').disabled);for(const input of m.host.querySelectorAll('[data-module]'))input.checked=false;m.host.querySelector('[data-module="config"]').dispatch('change');await flush();assert.equal(m.calls.reviews.length,1);assert(m.get('apply').disabled);assert.match(m.get('status').textContent,/Select at least one/);const input=m.host.querySelector('[data-module="tasks"]');input.checked=true;input.dispatch('change');await waitFor(()=>!m.get('apply').disabled);assert.equal(m.calls.reviews.length,2);assert.deepEqual(Array.from(m.calls.reviews[1][1]),['tasks']);
});
test('unfinished destination Focus session prevents confirmation and can be deselected',async()=>{
    const m=model(),real=m.store.review;m.store.review=async(...args)=>{const p=await real(...args);p.current.focus={activeSession:true,enabled:true,durations:{focus:25,break:5}};return p;};m.select();await waitFor(()=>/interrupted Focus session/.test(m.get('status').textContent));assert(m.get('apply').disabled);assert.match(m.get('status').textContent,/interrupted Focus session/);const input=m.host.querySelector('[data-module="focus"]');input.checked=false;input.dispatch('change');await waitFor(()=>!m.get('apply').disabled);assert(!m.get('apply').disabled);
});
test('Cancel alone and user focus movement survive delayed async results',async()=>{
    const m=model(),wait=deferred();m.select('old',{text:()=>wait.promise});m.get('cancel').dispatch('click');wait.resolve('old');await flush();assert.equal(m.document.activeElement,m.get('choose'));assert(m.get('preview').hidden);
    const next=deferred();m.select('next',{text:()=>next.promise});const outside=m.document.createElement('input');m.document.body.append(outside);outside.focus();next.resolve('next');await waitFor(()=>!m.get('apply').disabled);assert.equal(m.document.activeElement,outside);
});
test('late restore result does not steal focus from unrelated new edits',async()=>{
    const m=model(),wait=deferred();m.select();await waitFor(()=>!m.get('apply').disabled);m.store.restore=()=>wait.promise;m.get('apply').dispatch('click');const outside=m.document.createElement('input');m.document.body.append(outside);outside.focus();wait.resolve({applied:true});await waitFor(()=>/restored and verified/.test(m.get('status').textContent));assert.equal(m.document.activeElement,outside);assert(!m.calls.reloads);
});
test('files above 10 MiB require explicit permission before reading; cancel is nonmutating',async()=>{
    const m=model();let reads=0;m.select('large',{size:11*1024*1024,text:async()=>{reads++;return 'large';}});await flush();assert.equal(reads,0);assert(!m.get('large').hidden);assert(m.get('apply').disabled);assert.match(m.get('status').textContent,/larger than 10 MiB/);m.get('cancel').dispatch('click');m.get('large').dispatch('click');await flush();assert.equal(reads,0);
    m.select('large',{size:11*1024*1024,text:async()=>{reads++;return 'large';}});m.get('large').dispatch('click');m.get('large').dispatch('click');await waitFor(()=>!m.get('apply').disabled);assert.equal(reads,1);assert.equal(m.calls.reviews.length,1);assert.equal(m.calls.restores.length,0);
});
test('Escape cancels the large-file prompt before read',async()=>{
    const m=model();let reads=0;m.select('x',{size:11*1024*1024,text:async()=>{reads++;return 'x';}});m.get('large').dispatch('keydown',{key:'Escape'});m.get('large').dispatch('click');await flush();assert.equal(reads,0);assert(m.get('preview').hidden);assert.equal(m.document.activeElement,m.get('choose'));
});
test('recovery download retains an existing review and reports unavailable recovery honestly',async()=>{
    const m=model();
    // Wait for the actual review, including delayed file reading and paint yields.
    m.select('saved', {text: () => new Promise(resolve => setTimeout(() => resolve('saved'), 25))});
    await waitFor(() => !m.get('apply').disabled);
    m.get('recovery').dispatch('click');
    await waitFor(() => m.calls.downloads.length === 1 && !m.get('recovery').disabled);
    assert(!m.get('preview').hidden);assert(!m.get('apply').disabled);assert.equal(m.calls.downloads[0][0],'RECOVERY');
    m.store.recovery=async()=>{throw {code:'INVALID'};};m.get('recovery').dispatch('click');
    await waitFor(() => !m.get('recovery').disabled);
    assert.match(m.get('status').textContent,/No valid pre-restore recovery copy/);assert(!m.get('preview').hidden);
});

test('older single-workspace files require a deliberate destination selection before apply',async()=>{
    const m=model();m.store.review=async(text,selected=modules,options={})=>{m.calls.reviews.push([text,selected,options]);await new Promise(resolve=>setTimeout(resolve,25));return {schemaVersion:1,modules,selected,incoming:{},current:{},requiresTarget:!options.targetWorkspaceId,destinations:[{id:'default',name:'Default'},{id:'work',name:'Work'}],targetWorkspace:options.targetWorkspaceId?{id:options.targetWorkspaceId,name:'Work'}:null};};
    m.select('legacy',{text:()=>new Promise(resolve=>setTimeout(()=>resolve('legacy'),25))});await waitFor(()=>!m.get('destination').hidden && /Choose the workspace/.test(m.get('status').textContent));assert(!m.get('destination').hidden);assert.equal(m.get('target').value,'');assert(m.get('apply').disabled);assert.match(m.get('status').textContent,/Choose the workspace/);assert.equal(m.calls.restores.length,0);
    m.get('target').value='work';m.get('target').dispatch('change');assert(m.get('apply').disabled);await waitFor(()=>!m.get('apply').disabled);assert.equal(m.calls.reviews[1][2].targetWorkspaceId,'work');assert(!m.get('apply').disabled);assert.match(m.get('preview').children.find(el=>el.tagName==='P').textContent,/Work/);m.get('apply').dispatch('click');await waitFor(()=>/restored and verified/.test(m.get('status').textContent));assert.equal(m.calls.restores.length,1);assert.equal(m.calls.restores[0].targetWorkspace.id,'work');
});
test('changing a legacy destination invalidates the previous ticket and cancel forgets destination',async()=>{
    const m=model();m.store.review=async(text,selected=modules,options={})=>{m.calls.reviews.push([text,selected,options]);return {schemaVersion:1,modules,selected,incoming:{},current:{},requiresTarget:!options.targetWorkspaceId,destinations:[{id:'default',name:'Default'},{id:'work',name:'Work'}],targetWorkspace:options.targetWorkspaceId?{id:options.targetWorkspaceId,name:options.targetWorkspaceId}:null};};
    m.select('legacy');await waitFor(()=>!m.get('destination').hidden && /Choose the workspace/.test(m.get('status').textContent));m.get('target').value='work';m.get('target').dispatch('change');await waitFor(()=>!m.get('apply').disabled);m.get('target').value='default';m.get('target').dispatch('change');assert(m.get('apply').disabled);await waitFor(()=>!m.get('apply').disabled);assert.equal(m.calls.reviews.at(-1)[2].targetWorkspaceId,'default');m.get('cancel').dispatch('click');m.select('next');await waitFor(()=>!m.get('destination').hidden && /Choose the workspace/.test(m.get('status').textContent));assert.equal(m.get('target').value,'');assert(m.get('apply').disabled);assert.equal(m.calls.reviews.at(-1)[2].targetWorkspaceId,undefined);
});
test('v2 full registry scope explicitly lists live names, Trash counts and destructive replacement',async()=>{
    const m=model(),real=m.store.review;m.store.review=async(...args)=>({...await real(...args),schemaVersion:2,workspaces:{incoming:[{id:'default',name:'Default'},{id:'work',name:'Work'}],current:[{id:'default',name:'Default'}],incomingTrashCount:3,currentTrashCount:1,scope:'all'}});
    m.select('v2');await waitFor(()=>!m.get('apply').disabled && !m.get('workspaces').hidden);assert(m.get('destination').hidden);assert(!m.get('workspaces').hidden);assert.match(m.get('workspaces').textContent,/Default, Work/);assert.match(m.get('workspaces').textContent,/Trash: 3/);assert.match(m.get('preview').children.find(el=>el.tagName==='P').textContent,/replaces the live workspace list and Trash/);
});
test('partial topology mismatch explains how to obtain a compatible full archive without enabling apply',async()=>{
    const m=model();m.store.review=async()=>{throw {code:'TOPOLOGY'};};m.select('partial');await waitFor(()=>/Export all modules/.test(m.get('status').textContent));assert(m.get('apply').disabled);assert.match(m.get('status').textContent,/Export all modules/);assert.equal(m.calls.restores.length,0);
});

for (const locale of ['en', 'zh_CN']) test(`duplicate JSON keys show a specific pre-restore error in ${locale}`, async () => {
    const m = model(locale);
    m.store.review = async () => { throw {code:'DUPLICATE_KEY'}; };
    m.select('malformed');
    const expected = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`)).completeBackupDuplicateKey.message;
    await waitFor(() => m.get('status').textContent === expected);
    assert.equal(m.get('preview').hidden, true);
    assert.equal(m.get('apply').disabled, true);
    assert.equal(m.calls.restores.length, 0);
    assert.equal(m.document.activeElement === m.get('status'), true);
});

for (const outcome of ['success', 'read failure', 'download failure']) test(`interrupted-copy download ${outcome} retains a ready restore review`, async () => {
    const m = model(undefined, {store: {async exportInterruptedCandidates() {
        if (outcome === 'read failure') throw {code: 'RECOVERY'};
        return 'INTERRUPTED COPIES';
    }}, download: async () => { if (outcome === 'download failure') throw {code: 'FILE'}; }});
    m.select('reviewed file'); await waitFor(() => !m.get('apply').disabled);
    const rows = [...m.get('counts').children];
    const reviewCount = m.calls.reviews.length;
    m.get('download-interrupted').dispatch('click');
    await waitFor(() => !m.get('download-interrupted').disabled);
    assert.equal(m.get('preview').hidden, false);
    assert.equal(m.get('apply').disabled, false, 'read-only recovery download must not strand the reviewed replacement');
    assert.deepEqual(m.get('counts').children, rows);
    assert.equal(m.calls.reviews.length, reviewCount);
    assert.equal(m.calls.restores.length, 0);
    if (outcome === 'success') assert.match(m.get('status').textContent, /Download requested/);
    else assert.match(m.get('status').textContent, outcome === 'read failure' ? /recovery copy/ : /Could not read the local file/);
    m.get('apply').dispatch('click');
    await waitFor(() => m.calls.restores.length === 1);
});

test('interrupted-copy download blocks repeat actions but keeps later focus and allows a fresh retry', async () => {
    const wait = deferred(); let exports = 0;
    const m = model(undefined, {store: {async exportInterruptedCandidates() { exports++; return wait.promise; }}});
    m.select(); await waitFor(() => !m.get('apply').disabled);
    m.get('download-interrupted').dispatch('click'); m.get('download-interrupted').dispatch('click');
    m.get('apply').dispatch('click');
    assert.equal(exports, 1); assert.equal(m.calls.restores.length, 0);
    assert.equal(m.host.querySelector('.complete-backup').getAttribute('aria-busy'), 'true');
    const outside = m.document.createElement('textarea'); outside.value = 'Synthetic newer draft'; m.document.body.append(outside); outside.focus();
    wait.resolve('COPIES'); await waitFor(() => !m.get('download-interrupted').disabled);
    assert.equal(m.document.activeElement, outside); assert.equal(outside.value, 'Synthetic newer draft');
    assert.equal(m.get('apply').disabled, false);
    m.get('download-interrupted').dispatch('click'); await waitFor(() => !m.get('download-interrupted').disabled);
    assert.equal(exports, 2); assert.equal(m.calls.downloads.length, 2); assert.equal(m.calls.restores.length, 0);
});

for (const transition of ['cancel', 'new file', 'new selection', 'destroy']) test(`interrupted-copy download cannot revive an old review after ${transition}`, async () => {
    const wait = deferred();
    const m = model(undefined, {store: {exportInterruptedCandidates: () => wait.promise}});
    m.select('old'); await waitFor(() => !m.get('apply').disabled);
    const oldRows = [...m.get('counts').children];
    m.get('download-interrupted').dispatch('click');
    if (transition === 'destroy') m.view.destroy();
    else m.get('cancel').dispatch('click');
    if (transition === 'new file' || transition === 'new selection') {
        m.select('new'); await waitFor(() => !m.get('apply').disabled);
        if (transition === 'new selection') {
            const focus = m.host.querySelector('[data-module="focus"]'); focus.checked = false; focus.dispatch('change');
            await waitFor(() => !m.get('apply').disabled);
        }
    }
    const status = m.get('status')?.textContent, focused = m.document.activeElement;
    wait.resolve('OLD COPIES'); await flush();
    assert.equal(m.calls.downloads.length, 0); assert.equal(m.calls.restores.length, 0); assert.equal(m.document.activeElement, focused);
    if (transition === 'destroy') { assert.equal(m.host.children.length, 0); return; }
    assert.equal(m.get('status').textContent, status);
    if (transition === 'cancel') { assert.equal(m.get('preview').hidden, true); assert.equal(m.get('apply').disabled, true); }
    else {
        assert.equal(m.get('apply').disabled, false); assert.notDeepEqual(m.get('counts').children, oldRows);
        assert.equal(m.calls.reviews.at(-1)[0], 'new');
        if (transition === 'new selection') assert.equal(m.calls.reviews.at(-1)[1].includes('focus'), false);
    }
});

test('interrupted-copy download never bypasses an unchosen global destination', async () => {
    const m = model(undefined, {store: {async exportInterruptedCandidates() { return 'COPIES'; },
        async review(text, selected = [...modules, 'prompts'], options = {}) { return {modules: [...modules, 'prompts'], selected, incoming: {}, current: {}, requiresPromptTarget: !options.promptTarget, prompts: {conflicts: []}}; }}});
    m.select(); await waitFor(() => !m.get('prompt-destination').hidden);
    m.get('download-interrupted').dispatch('click'); await waitFor(() => !m.get('download-interrupted').disabled);
    assert.equal(m.get('apply').disabled, true); assert.equal(m.get('prompt-target').value, ''); assert.equal(m.get('prompt-target').disabled, false);
    m.get('apply').dispatch('click'); assert.equal(m.calls.restores.length, 0);
    m.get('prompt-target').value = 'global-library'; m.get('prompt-target').dispatch('change');
    await waitFor(() => !m.get('apply').disabled);
});

for (const kind of ['file', 'review']) test(`interrupted-copy download cannot retire an in-progress ${kind} read`, async () => {
    const wait = deferred(); let exports = 0;
    const m = model(undefined, {store: {async exportInterruptedCandidates() { exports++; return 'COPIES'; }}});
    if (kind === 'review') { const review = m.store.review; m.store.review = async (...args) => { await wait.promise; return review(...args); }; }
    m.select('reading', kind === 'file' ? {text: () => wait.promise} : {});
    assert.equal(m.get('download-interrupted').disabled, true);
    m.get('download-interrupted').dispatch('click'); assert.equal(exports, 0);
    wait.resolve('reading'); await waitFor(() => !m.get('apply').disabled);
    assert.equal(m.calls.reviews.length, 1); assert.equal(m.get('download-interrupted').disabled, false);
});

test('interrupted-copy download preserves the large-file confirmation without reading or authorizing it', async () => {
    const wait = deferred(); let reads = 0;
    const m = model(undefined, {store: {exportInterruptedCandidates: () => wait.promise}});
    m.select('large', {size: 11 * 1024 * 1024, text: async () => { reads++; return 'large'; }});
    m.get('download-interrupted').dispatch('click');
    assert.equal(m.get('large').disabled, true); m.get('large').dispatch('click');
    assert.equal(reads, 0); assert.equal(m.get('apply').disabled, true);
    wait.resolve('COPIES'); await waitFor(() => !m.get('download-interrupted').disabled);
    assert.equal(m.get('large').hidden, false); assert.equal(m.get('large').disabled, false); assert.equal(reads, 0);
    assert.equal(m.get('apply').disabled, true); assert.equal(m.calls.restores.length, 0);
    assert.match(m.get('status').textContent, /Download requested.*larger than 10 MiB/);
    m.get('large').dispatch('click'); await waitFor(() => !m.get('apply').disabled); assert.equal(reads, 1);
});

for (const prior of ['empty', 'uncertain restore']) test(`interrupted-copy download does not create a ready ticket after ${prior}`, async () => {
    const m = model(undefined, {store: {async exportInterruptedCandidates() { return 'COPIES'; }}});
    if (prior === 'uncertain restore') {
        m.select(); await waitFor(() => !m.get('apply').disabled);
        m.store.restore = async () => { throw {code: 'UNCONFIRMED', mayHaveCommitted: true}; };
        m.get('apply').dispatch('click'); await waitFor(() => /Some data may have changed/.test(m.get('status').textContent));
    }
    m.get('download-interrupted').dispatch('click'); await waitFor(() => !m.get('download-interrupted').disabled);
    assert.equal(m.get('apply').disabled, true); assert.equal(m.get('preview').hidden, true); assert.equal(m.get('reload').hidden, true);
});

test('interrupted-copy download cannot bypass an affected active Focus session', async () => {
    const m = model(undefined, {store: {async exportInterruptedCandidates() { return 'COPIES'; }}});
    const review = m.store.review;
    m.store.review = async (...args) => ({...await review(...args), current: {focus: {activeSession: true}}});
    m.select(); await waitFor(() => /interrupted Focus session/.test(m.get('status').textContent));
    m.get('download-interrupted').dispatch('click'); await waitFor(() => !m.get('download-interrupted').disabled);
    assert.equal(m.get('apply').disabled, true); m.get('apply').dispatch('click'); assert.equal(m.calls.restores.length, 0);
});

test('cancelled large-file recovery download cannot resurrect permission to read', async () => {
    const wait = deferred(); let reads = 0;
    const m = model(undefined, {store: {exportInterruptedCandidates: () => wait.promise}});
    m.select('large', {size: 11 * 1024 * 1024, text: async () => { reads++; return 'large'; }});
    m.get('download-interrupted').dispatch('click'); m.get('cancel').dispatch('click');
    wait.resolve('OLD COPIES'); await flush();
    m.get('large').dispatch('click'); assert.equal(reads, 0); assert.equal(m.calls.downloads.length, 0);
    assert.equal(m.get('preview').hidden, true); assert.equal(m.get('apply').disabled, true);
});

test('completion of an already requested download cannot overwrite a newer file review', async () => {
    const wait = deferred();
    const m = model(undefined, {store: {async exportInterruptedCandidates() { return 'COPIES'; }}, download: () => wait.promise});
    m.select('old'); await waitFor(() => !m.get('apply').disabled);
    m.get('download-interrupted').dispatch('click'); await waitFor(() => m.calls.downloads.length === 1);
    m.get('cancel').dispatch('click'); m.select('new'); await waitFor(() => !m.get('apply').disabled);
    const status = m.get('status').textContent, rows = [...m.get('counts').children];
    wait.resolve(); await flush();
    assert.equal(m.get('status').textContent, status); assert.deepEqual(m.get('counts').children, rows);
    assert.equal(m.get('apply').disabled, false); assert.equal(m.calls.reviews.at(-1)[0], 'new');
    assert.equal(m.calls.downloads.length, 1); assert.equal(m.calls.restores.length, 0);
});
