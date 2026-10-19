'use strict';
// Production View + Store/StorageManager/workspaces; RAM-only synthetic data.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const {fixture, synthetic, Backup, Workspaces, Prompts, Collections, Tasks, Scratchpad, Focus, copy} = require('./helpers/complete-backup-acceptance');
const viewSource = fs.readFileSync('shared/complete-backup-view.js', 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
async function until(predicate) {
    const deadline = Date.now() + 2000;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1));
    assert(predicate(), 'expected export summary state');
}
function mount(t, store, {locale, download, observer = false, allowReview = false, clipboard, crypto = {subtle:{digest:async(_,bytes)=>Uint8Array.from(require("node:crypto").createHash("sha256").update(bytes).digest()).buffer}}} = {}) {
    const document = createDocument({blurUnavailableFocus:true, aggregateTextContent:true});
    const host = document.createElement('div'); document.body.append(host);
    const catalog = locale && JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));
    const events = new Map(), observers = [];
    class Observer {
        constructor(callback) {this.callback=callback;this.records=[];this.active=false;observers.push(this);}
        observe() {this.active=true;}
        disconnect() {this.active=false;this.records=[];}
        takeRecords() {const records=this.records;this.records=[];return records;}
        removed(node) {if(this.active)this.records.push({removedNodes:[node]});}
        flush() {this.callback(this.takeRecords());}
    }
    const window = {LocalItabCompleteBackup:Backup, LocalItabPrompts:Prompts, LocalItabAICollections:Collections,
        i18n:{t:key => catalog?.[key]?.message || key},
        addEventListener:(name, fn) => events.set(name, fn), removeEventListener:(name, fn) => {if (events.get(name) === fn) events.delete(name);}};
    window.crypto = crypto; window.navigator = {clipboard};
    if(observer)window.MutationObserver=Observer;
    const calls = {exports:[], sources:[], downloads:[], reviews:0};
    const realExport = store.export.bind(store);
    store.export = async ids => { calls.exports.push([...ids]); const source = await realExport(ids); calls.sources.push(source); return source; };
    const review=store.review.bind(store);
    store.review = (...args) => {calls.reviews++; if(allowReview)return review(...args); assert.fail('export must not create a restore ticket');};
    vm.runInNewContext(viewSource, {window, setTimeout, URL, Blob, TextEncoder});
    const view = window.LocalItabCompleteBackupView.mount(host, {store, download: (...args) => {calls.downloads.push(args); return download?.(...args);}, reload:() => assert.fail('no reload')});
    t.after(() => view.destroy());
    const get = name => host.querySelector('.complete-backup-' + name);
    const input = id => host.querySelector(`[data-module="${id}"]`);
    const select = ids => {for (const id of Backup.MODULES) {input(id).checked=ids.includes(id); input(id).dispatch('change');}};
    const click = name => { const el=get(name); assert(el && !el.hidden && !el.disabled, name); el.focus(); el.dispatch('click'); };
    return {document, host, window, events, observers, view, calls, get, input, select, click};
}

test('real Store preparation is read-only and zero-download; explicit download uses exactly one saved snapshot', async t => {
    const f = fixture(), m = mount(t, f.store); m.select(['scratchpad']);
    const before = copy(f.raw); m.click('export'); await until(() => !m.view.pending);
    assert(m.get('export-summary'), 'a separate ordinary-export summary must exist');
    assert.equal(m.get('export-summary').hidden, false);
    assert.equal(m.calls.exports.length, 1); assert.equal(m.calls.downloads.length, 0);
    assert.match(m.get('export-summary').textContent, /saved snapshot|Saved snapshot/);
    assert.match(m.get('export-summary').textContent, /2026-10-10T12:00:00.000Z/);
    assert.deepEqual(f.raw, before); assert.equal(f.writes.length, 0); assert.equal(m.calls.reviews, 0);
    const prepared = m.calls.sources[0];
    f.values('default')[Scratchpad.KEY].content = 'Later saved 中文 🧪';
    m.click('download-export'); await until(() => !m.view.pending);
    assert.equal(m.calls.downloads.length, 1); assert.equal(m.calls.downloads[0][0], prepared);
    assert.equal(m.calls.exports.length, 1); assert.equal(f.writes.length, 0);
    assert.match(m.get('status').textContent, /Download requested.*completion cannot be verified/);
});

const Countdown = require('../shared/local-countdown-store');
function withPrivateImages(f) {
    const image = 'data:image/png;base64,QUJD';
    for (const entry of f.raw[Workspaces.REGISTRY_KEY].workspaces) {
        entry.name = 'PRIVATE workspace ' + entry.id;
        const v = f.values(entry.id);
        v.bg = {type:'image', value:image}; v.movie = {title:'PRIVATE movie', note:'PRIVATE note', poster:image};
        v.links = [1,2].map(n => ({title:'PRIVATE site ' + n, url:`https://example.com/PRIVATE/${n}`, category:'work', icon:image}));
        v[Scratchpad.KEY].content = 'PRIVATE 便笺🧪👨‍👩‍👧‍👦';
        v[Countdown.KEY] = {...Countdown.initial(), enabled:entry.id === 'work', title:'PRIVATE倒计时🧪', targetDate:'2027-02-28'};
        v[Focus.KEY].enabled = entry.id === 'work';
    }
}
// Independent expected counts from the precise JSON sent to download, rather
// than reusing View/Store aggregate methods as the oracle.
function expectedRows(file) {
    const names = file.schemaVersion === 1 ? Object.keys(file.modules) : file.modules;
    const bundles = file.schemaVersion === 1 ? [{modules:file.modules}] : [...file.workspaces,...file.trash];
    return Object.fromEntries(names.map(id => {
        const values = bundles.map(bundle => bundle.modules[id]);
        const sum = fn => values.reduce((n,v) => n+fn(v), 0);
        if (id === 'config') return [id, `Sites: ${sum(v=>v.data.links.length)} · Categories: ${sum(v=>v.data.categories.length)} · Local images: ${sum(v=>v.data.links.filter(x=>x.icon?.startsWith('data:')).length + Number(v.data.bg.type==='image' && !!v.data.bg.value) + Number(!!v.data.movie.poster))}`];
        if (id === 'tasks') return [id, ['active','done','removed'].map((state,i)=>`${['Active tasks','Completed tasks','Removed tasks'][i]}: ${sum(v=>v.records.filter(r=>r.state===state).length)}`).concat(`Saved history copies: ${sum(v=>v.recovery.length)}`).join(' · ')];
        if (id === 'scratchpad') return [id, `Characters: ${sum(v=>Array.from(v.content).length)}`];
        if (id === 'countdown' || id === 'focus') {
            const enabled = values.some(v=>v.enabled) ? 'Yes' : 'No';
            const label = `${file.schemaVersion===1 ? 'Enabled' : 'Enabled in at least one workspace'}: ${enabled}`;
            return [id, file.schemaVersion!==1 ? label : id==='countdown' ? `${label} · Title characters: ${Array.from(values[0].title).length}` : `${label} · Focus minutes: ${values[0].durations.focus} · Break minutes: ${values[0].durations.break}`];
        }
        const g = file.globals[id], kind = id==='prompts' ? ['Active prompts','Archived prompts'] : ['Saved excerpts','Archived excerpts'];
        return [id, `${kind[0]}: ${g.content.records.filter(r=>r.deletedAt===null).length} · ${kind[1]}: ${g.content.records.filter(r=>r.deletedAt!==null).length} · Saved history copies: ${g.recovery.length} · Saved body versions: ${g.content.records.reduce((n,r)=>n+r.history.length,0)}`];
    }));
}
function assertSummary(m, text) {
    const file = JSON.parse(text), panel = m.get('export-summary'), meta = m.get('export-meta').textContent;
    assert(m.get('export-digest').textContent.includes(require('node:crypto').createHash('sha256').update(text).digest('hex')));
    assert.equal(panel.hidden, false); assert.equal(m.get('preview').hidden, true); assert.equal(m.get('apply').disabled, true);
    assert(meta.includes(file.exportedAt)); assert(meta.includes(`UTF-8 bytes): ${Buffer.byteLength(text)}.`));
    if(file.schemaVersion===1)assert.match(meta,/Single-workspace contents: 1.*Live\/Trash identities are not recorded/);
    else {assert(meta.includes(`Live workspace identities in this file: ${file.workspaces.length}.`));assert(meta.includes(`Trash workspace identities in this file: ${file.trash.length}.`));}
    const expected = expectedRows(file), rows = m.get('export-counts').children;
    assert.equal(rows.length, Object.keys(expected).length);
    for (const row of rows) assert.equal(row.children[1].textContent, expected[row.dataset.module], row.dataset.module);
    for (const secret of ['PRIVATE','2027-02-28','https://','data:image/','{{topic}}','original answer','source revised']) assert(!panel.textContent.includes(secret), secret);
    if (file.schemaVersion>1 && file.modules.every(id=>['prompts','collections'].includes(id))) assert.match(m.get('export-scope').textContent,/No workspace module contents.*identity metadata.*once/);
    else if(file.schemaVersion===1)assert.match(m.get('export-scope').textContent,/single-workspace file.*references.*repeats/);
    else assert.match(m.get('export-scope').textContent,/live workspaces and Trash.*references.*repeats.*once/);
}

test('schema 2/3/4: all 127 nonempty selections use real Store once, exact UTF-8, live/Trash counts and each global library once', async t => {
    const f = await synthetic(); withPrivateImages(f);
    const baseline = copy(f.raw), writes = f.writes.length;
    let reads = 0, exportedReads = 0;
    const read = f.chrome.storage.local.get; f.chrome.storage.local.get = async (...args) => {reads++;return read(...args);};
    const exportSaved = f.store.export.bind(f.store); f.store.export = async ids => {const text=await exportSaved(ids);exportedReads=reads;return text;};
    const m = mount(t, f.store);
    for (let mask=1; mask<128; mask++) {
        const ids = Backup.MODULES.filter((_,i)=>mask & (1<<i)); m.select(ids); m.click('export'); await until(()=>!m.view.pending);
        const text = m.calls.sources.at(-1); assert(text); assertSummary(m,text);
        assert.equal(reads, exportedReads, 'summary must not reread storage'); assert.equal(m.calls.exports.length,mask);
        assert.equal(m.calls.downloads.length,mask-1); assert.equal(m.calls.reviews,0);
        m.click('download-export'); m.get('download-export').dispatch('click'); await until(()=>!m.view.pending);
        assert.equal(m.calls.downloads.length,mask); assert.equal(m.calls.downloads.at(-1)[0],text); assert.equal(m.calls.exports.length,mask); assert.equal(reads,exportedReads);
    }
    assert.equal(f.writes.length,writes); assert.deepEqual(f.raw,baseline);
});

test('legacy schema 1 real Store summaries count title characters without retaining title/date, and zero images remain zero', async t => {
    const f = await synthetic(); withPrivateImages(f);
    f.store.workspaces = null;
    const raw = copy(f.values('default')); let reads=0;
    f.store.backend.read = async keys => {reads++;return Object.fromEntries(keys.filter(key=>Object.hasOwn(raw,key)).map(key=>[key,copy(raw[key])]));};
    const m = mount(t,f.store), baseline=copy(raw), writes=f.writes.length;
    for (const ids of [Backup.SCOPED_MODULES, ['countdown'], ['focus'], ['config'], ['scratchpad','tasks']]) {
        m.select(ids);m.click('export');await until(()=>!m.view.pending);
        assertSummary(m,m.calls.sources.at(-1));const n=reads;
        m.click('cancel-export');assert.equal(reads,n);assert.equal(m.calls.downloads.length,0);
        assert.match(m.get('status').textContent,/No download was requested/);
    }
    raw.bg = {type:'color',value:'#ffffff'};raw.movie.poster='';for(const link of raw.links)link.icon='';
    m.select(['config']);m.click('export');await until(()=>!m.view.pending);assertSummary(m,m.calls.sources.at(-1));
    assert.match(m.get('export-counts').textContent,/Local images: 0/);assert.equal(f.writes.length,writes);
    assert.equal(baseline[Countdown.KEY].title,'PRIVATE倒计时🧪');
});

for (const locale of ['en','zh_CN']) test(`localized summary and live status expose no contents (${locale})`, async t => {
    const f=await synthetic();withPrivateImages(f);const m=mount(t,f.store,{locale});
    m.click('export');await until(()=>!m.view.pending);
    const catalog=JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));
    assert.equal(m.get('export').textContent,catalog.completeBackupExport.message);
    assert.equal(m.get('download-export').textContent,catalog.completeBackupExportDownload.message);
    assert.equal(m.get('status').textContent,catalog.completeBackupExportReady.message);
    assert.equal(m.get('status').getAttribute('aria-live'),'polite');assert.equal(m.get('status').getAttribute('aria-atomic'),'true');
    for(const node of [m.get('status'),m.get('export-summary')])assert(!/PRIVATE|https:\/\/|data:image|{{topic}}/.test(node.textContent));
    assert(m.view.hasUncommittedWork());assert(!m.view.pending);assert.equal(m.calls.downloads.length,0);
});

for(const action of ['cancel','Escape','module','clear selection','new file','recovery','interrupted copies','destroy','host detached','pagehide']) test(`prepared snapshot is unusable after ${action}`,async t=>{
    const f=fixture(),m=mount(t,f.store);m.select(['scratchpad']);
    m.click('export');await until(()=>!m.view.pending);
    const oldDownload=m.get('download-export'),oldShell=m.host.querySelector('.complete-backup');
    if(action==='cancel')m.click('cancel-export');
    if(action==='Escape')m.get('download-export').dispatch('keydown',{key:'Escape'});
    if(action==='module'){m.input('tasks').checked=true;m.input('tasks').dispatch('change');}
    if(action==='clear selection')m.click('clear-selection');
    if(action==='new file'){m.get('file').files=[{size:Backup.LIMITS.bytes+1}];m.get('file').dispatch('change');}
    if(action==='recovery'){m.click('recovery');await until(()=>!m.view.pending);}
    if(action==='interrupted copies'){f.store.exportInterruptedCandidates=async()=>{throw {code:'NO_RECOVERY'};};m.get('download-interrupted').hidden=false;m.click('download-interrupted');await until(()=>!m.view.pending);}
    if(action==='destroy'){assert(m.view.destroy());m.host.append(oldShell);}
    if(action==='host detached'){m.host.remove();oldDownload.dispatch('click');m.document.body.append(m.host);}
    if(action==='pagehide')m.events.get('pagehide')();
    oldDownload.dispatch('click');await tick();assert.equal(m.calls.downloads.length,0);assert.equal(m.calls.exports.length,1);assert.equal(f.writes.length,0);assert.equal(m.calls.reviews,0);
    assert(m.get('export-summary').hidden);assert(m.get('download-export').disabled || action==='destroy');
});

for(const action of ['cancel','Escape','destroy','host detached','pagehide'])test(`late preparation after ${action} cannot revive bytes or steal newer focus`,async t=>{
    const f=fixture(),wait=deferred(),original=f.store.export.bind(f.store);let entered=false;
    f.store.export=async ids=>{entered=true;const text=await original(ids);await wait.promise;return text;};
    const m=mount(t,f.store);m.select(['scratchpad']);m.click('export');await until(()=>entered);
    const oldShell=m.host.querySelector('.complete-backup'),oldDownload=m.get('download-export');
    if(action==='cancel')m.click('cancel-export');
    if(action==='Escape')oldDownload.dispatch('keydown',{key:'Escape'});
    if(action==='destroy'){assert(m.view.destroy());m.host.append(oldShell);}
    if(action==='host detached'){m.host.remove();oldDownload.dispatch('click');m.document.body.append(m.host);}
    if(action==='pagehide')m.events.get('pagehide')();
    const outside=m.document.createElement('textarea');m.document.body.append(outside);outside.focus();
    wait.resolve();await tick();oldDownload.dispatch('click');assert.equal(m.calls.downloads.length,0);assert.equal(m.document.activeElement,outside);assert(m.get('export-summary').hidden);assert.equal(f.writes.length,0);
});

test('cancelled preparation cannot overwrite a new summary, and saved selection mismatch without an event blocks download',async t=>{
    const f=fixture(),wait=deferred(),original=f.store.export.bind(f.store);let entered=false;
    f.store.export=async ids=>{const text=await original(ids);if(!entered){entered=true;await wait.promise;}return text;};
    const m=mount(t,f.store);m.select(['scratchpad']);m.click('export');await until(()=>entered);m.click('cancel-export');
    m.select(['tasks']);m.click('export');await until(()=>!m.view.pending);const before=m.get('export-summary').textContent;
    wait.resolve();await tick();assert.equal(m.get('export-summary').textContent,before);
    m.input('scratchpad').checked=true;m.click('download-export');assert.equal(m.calls.downloads.length,0);assert(m.get('export-summary').hidden);
});

for(const failure of ['read','oversize','malformed'])test(`${failure} preparation cannot claim success or download and does not retry`,async t=>{
    const f=fixture();let calls=0;
    if(failure==='read')f.store.backend.read=()=>{throw {code:'READ'};};
    // Workspaces read through their own backend; fail the actual RAM storage.
    if(failure==='read')f.chrome.storage.local.get=async()=>{calls++;throw Error('PRIVATE read failure');};
    if(failure==='oversize')f.store.export=async()=> ' '.repeat(Backup.LIMITS.bytes+1);
    if(failure==='malformed')f.store.export=async()=>'{"PRIVATE":"invalid"}';
    const m=mount(t,f.store);m.select(['scratchpad']);m.click('export');await until(()=>!m.view.pending);await tick();
    assert(m.get('export-summary').hidden);assert(m.get('download-export').disabled);assert.equal(m.calls.exports.length,1);assert.equal(m.calls.downloads.length,0);assert.equal(f.writes.length,0);assert(!/PRIVATE|Download requested/.test(m.get('status').textContent));
    assert.match(m.get('status').textContent,/could not be read safely|size limit|not a supported/);
});

for(const failure of [false,true])test(`ordinary download ${failure?'failure':'success'} consumes snapshot, holds its own lock and never claims cancellation`,async t=>{
    const f=fixture(),wait=deferred(),m=mount(t,f.store,{download:async()=>{await wait.promise;if(failure)throw Error('PRIVATE download error');}});m.select(['scratchpad']);m.click('export');await until(()=>!m.view.pending);
    m.click('download-export');m.get('download-export').dispatch('click');m.get('export').dispatch('click');
    assert.equal(m.calls.downloads.length,1);assert.equal(m.calls.exports.length,1);assert(m.view.pending);assert(m.view.hasUncommittedWork());
    m.get('cancel-export').dispatch('click');m.view.cancel();m.get('download-export').dispatch('keydown',{key:'Escape'});assert.equal(m.view.destroy(),false);
    assert.match(m.get('status').textContent,/cannot be withdrawn/);assert(!m.get('export-summary').textContent.includes('No download has been requested'));
    for(const key of ['download-export','cancel-export','export','choose','select-all','clear-selection','recovery'])assert(m.get(key).disabled,key);
    const outside=m.document.createElement('textarea');m.document.body.append(outside);outside.focus();
    wait.resolve();await until(()=>!m.view.pending);
    assert.equal(m.document.activeElement,outside);assert(!m.view.hasUncommittedWork());assert(m.get('export-summary').hidden);
    assert.match(m.get('status').textContent,failure?/could not be verified.*no automatic retry/:/Download requested.*completion cannot be verified/);
    m.get('download-export').dispatch('click');await tick();assert.equal(m.calls.downloads.length,1);assert.equal(m.calls.exports.length,1);assert.equal(f.writes.length,0);
});

test('repeat/IME Enter and Space do not activate; composition Escape keeps summary, ordinary Escape cancels',async t=>{
    const f=fixture(),m=mount(t,f.store);m.select(['scratchpad']);m.click('export');await until(()=>!m.view.pending);
    for(const key of ['Enter',' ','Spacebar'])for(const flags of [{repeat:true},{isComposing:true},{keyCode:229}]){
        const event=m.get('download-export').dispatch('keydown',{key,...flags});assert(event.prevented);
    }
    for(const flags of [{repeat:true},{isComposing:true},{keyCode:229}])m.get('download-export').dispatch('keydown',{key:'Escape',...flags});
    assert(!m.get('export-summary').hidden);assert.equal(m.calls.downloads.length,0);
    m.get('download-export').dispatch('keydown',{key:'Escape'});assert(m.get('export-summary').hidden);assert.equal(m.document.activeElement,m.get('export'));
    m.click('clear-selection');m.click('export');assert.equal(m.calls.exports.length,1);assert.equal(m.calls.downloads.length,0);assert.match(m.get('status').textContent,/Select at least one/);
});

for(const failure of [false,true])test(`submitted download settles while detached (${failure?'failure':'success'}): release local lock without reviving feedback or bytes`,async t=>{
    const f=fixture(),wait=deferred(),m=mount(t,f.store,{download:async()=>{await wait.promise;if(failure)throw Error('synthetic failure');}});
    m.select(['scratchpad']);m.click('export');await until(()=>!m.view.pending);m.click('download-export');
    const old=m.get('download-export');m.host.remove();assert(m.view.pending);assert.equal(m.view.destroy(),false);
    wait.resolve();await tick();assert.equal(m.view.pending,false,'settled request must release its local lock even offscreen');
    m.document.body.append(m.host);old.dispatch('click');assert.equal(m.calls.downloads.length,1);assert(!/Download requested|cancelled/.test(m.get('status').textContent));
    assert.equal(m.view.hasUncommittedWork(),false);assert.equal(m.view.destroy(),true);
});

for(const phase of ['preparing','ready','submitted'])for(const delivery of ['callback','takeRecords'])test(`removed-and-reattached host cannot revive ${phase} export (${delivery})`,async t=>{
    const f=fixture(),wait=deferred(),original=f.store.export.bind(f.store);let entered=false;
    if(phase==='preparing')f.store.export=async ids=>{entered=true;const text=await original(ids);await wait.promise;return text;};
    const m=mount(t,f.store,{observer:true, download:phase==='submitted'?()=>wait.promise:undefined});
    m.select(['scratchpad']);m.click('export');await until(()=>phase==='preparing'?entered:!m.view.pending);
    if(phase==='submitted')m.click('download-export');
    const old=m.get('download-export');m.host.remove();m.observers[0].removed(m.host);m.document.body.append(m.host);
    if(delivery==='callback')m.observers[0].flush();else old.dispatch('click');
    const outside=m.document.createElement('textarea');m.document.body.append(outside);outside.focus();
    if(phase==='submitted'){assert(m.view.pending);assert.equal(m.view.destroy(),false);}
    wait.resolve();await tick();old.dispatch('click');assert.equal(m.calls.downloads.length,Number(phase==='submitted'));
    assert.equal(m.view.pending,false);assert(m.get('export-summary').hidden);assert(!m.view.hasUncommittedWork());assert.equal(m.document.activeElement,outside);
    assert(!/Download requested|Summary ready/.test(m.get('status').textContent));assert.equal(f.writes.length,0);
});

test('ordinary preparation retires real restore ticket and old interrupted UI without granting replacement or rereading',async t=>{
    const f=fixture(),source=await f.store.export(['scratchpad']);let recovered=0;
    // Synthetic inspect report only; the ordinary restore preview is a real
    // Store ticket. No export may implicitly use either recovery authority.
    f.store.inspectInterruptedRestore=async()=>({pending:true,canRecover:true});
    f.store.recoverInterruptedRestore=async()=>{recovered++;};
    const m=mount(t,f.store,{allowReview:true});
    m.get('file').files=[{size:Buffer.byteLength(source),text:async()=>source}];m.get('file').dispatch('change');await until(()=>!m.get('apply').disabled);
    assert.equal(m.calls.reviews,1);m.click('export');assert(m.get('preview').hidden);assert(m.get('apply').disabled);await until(()=>!m.view.pending);
    m.get('apply').dispatch('click');assert.equal(f.writes.length,0);assert.equal(m.calls.reviews,1);m.click('cancel-export');
    m.click('inspect-interrupted');await until(()=>!m.get('recover-interrupted').disabled);assert(!m.get('interrupted-summary').hidden);
    m.click('export');assert(m.get('interrupted-summary').hidden);assert(m.get('recover-interrupted').hidden);assert(m.get('recover-interrupted').disabled);
    await until(()=>!m.view.pending);m.get('recover-interrupted').dispatch('click');assert.equal(recovered,0);assert.equal(f.writes.length,0);assert.equal(m.calls.downloads.length,0);
});

test('late preparation preserves unrelated focus; no-change bulk selection preserves the snapshot',async t=>{
    const f=fixture(),wait=deferred(),original=f.store.export.bind(f.store);let entered=false;
    f.store.export=async ids=>{const text=await original(ids);entered=true;await wait.promise;return text;};
    const m=mount(t,f.store);m.click('export');await until(()=>entered);
    const outside=m.document.createElement('textarea');m.document.body.append(outside);outside.focus();wait.resolve();await until(()=>!m.view.pending);
    assert.equal(m.document.activeElement,outside);const text=m.get('export-summary').textContent;m.click('select-all');assert.equal(m.get('export-summary').textContent,text);assert(!m.get('download-export').disabled);assert.equal(m.calls.exports.length,1);
});

for (const mode of ['missing', 'rejected', 'invalid-length']) test(`digest ${mode} preserves read-only explicit backup download`, async t => {
    const f=fixture(); const crypto=mode==='missing'?null:{subtle:{digest:async()=>{if(mode==='rejected')throw new Error('PRIVATE digest error');return new ArrayBuffer(3);}}};
    const m=mount(t,f.store,{crypto});m.select(['scratchpad']);m.click('export');await until(()=>!m.view.pending);
    assert.match(m.get('export-digest').textContent,/Unavailable/);assert(!m.get('export-summary').textContent.includes('PRIVATE'));
    assert.equal(m.calls.downloads.length,0);m.click('download-export');await until(()=>!m.view.pending);
    assert.equal(m.calls.downloads[0][0],m.calls.sources[0]);assert.equal(m.calls.exports.length,1);assert.equal(f.writes.length,0);
});

for (const action of ['cancel-export','change','pagehide','destroy']) test(`delayed SHA-256 cannot revive export after ${action}`,async t=>{
    const wait=deferred(),f=fixture();let bytes,entered=false;
    const crypto={subtle:{digest:async(algorithm,input)=>{assert.equal(algorithm,'SHA-256');bytes=Buffer.from(input);entered=true;return wait.promise;}}};
    const m=mount(t,f.store,{crypto});m.select(['scratchpad']);m.click('export');await until(()=>entered);
    assert.equal(bytes.toString('utf8'),m.calls.sources[0]);assert(!m.get('download-export').disabled);
    const oldDownload=m.get('download-export'),panel=m.get('export-summary'),digest=m.get('export-digest');
    if(action==='change')m.select(['tasks']);else if(action==='pagehide')m.events.get('pagehide')();else if(action==='destroy')m.view.destroy();else m.click(action);
    wait.resolve(new ArrayBuffer(32));await tick();oldDownload.dispatch('click');
    assert(panel.hidden);assert.equal(digest.textContent,'');assert.equal(m.calls.downloads.length,0);assert.equal(f.writes.length,0);
});


test('never-settling digest does not block download and old result cannot change a newer summary',async t=>{
    const wait=deferred(),f=fixture();let calls=0;
    const crypto={subtle:{digest:()=>++calls===1?wait.promise:Promise.resolve(new Uint8Array(32).fill(1).buffer)}};
    const m=mount(t,f.store,{crypto});m.select(['scratchpad']);m.click('export');await until(()=>!m.view.pending);
    assert.match(m.get('export-digest').textContent,/Calculating/);assert(!m.get('download-export').disabled);
    m.click('download-export');await until(()=>!m.view.pending);assert.equal(m.calls.downloads[0][0],m.calls.sources[0]);
    m.select(['tasks']);m.click('export');await until(()=>!m.view.pending);const digest=m.get('export-digest').textContent;
    assert(digest.endsWith('01'.repeat(32)));wait.resolve(new ArrayBuffer(32));await tick();assert.equal(m.get('export-digest').textContent,digest);
    assert.equal(f.writes.length,0);assert.equal(m.calls.downloads.length,1);
});


test('real Web Crypto fingerprints exactly the downloaded Unicode JSON bytes',async t=>{
    const f=await synthetic();withPrivateImages(f);const writes=f.writes.length,m=mount(t,f.store,{crypto:require('node:crypto').webcrypto});
    assert(writes > 0, 'synthetic setup writes are recorded before export');
    m.click('export');await until(()=>!m.view.pending);await until(()=>!m.get('export-digest').textContent.includes('Calculating'));
    const source=m.calls.sources[0],expected=require('node:crypto').createHash('sha256').update(Buffer.from(source,'utf8')).digest('hex');
    assert(m.get('export-digest').textContent.endsWith(expected));m.click('download-export');await until(()=>!m.view.pending);
    assert.equal(m.calls.downloads[0][0],source);assert.equal(f.writes.length,writes);
});

for (const locale of ['en','zh_CN']) test(`copy fingerprint requires explicit click and copies only 64 hex characters (${locale})`,async t=>{
    const f=fixture(),writes=[],m=mount(t,f.store,{locale,clipboard:{writeText:text=>{writes.push(text);return Promise.resolve();}}});
    assert(m.get('copy-digest').disabled);m.select(['scratchpad']);m.click('export');await until(()=>!m.view.pending);
    assert.equal(writes.length,0);assert(!m.get('copy-digest').disabled);const expected=require('node:crypto').createHash('sha256').update(m.calls.sources[0]).digest('hex');
    m.click('copy-digest');m.get('copy-digest').dispatch('click');await tick();assert.deepEqual(writes,[expected]);assert.equal(m.calls.downloads.length,0);
    assert.equal(m.document.activeElement===m.get('copy-digest'),true);assert(!m.get('download-export').disabled);assert.equal(f.writes.length,0);
    const catalog=JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));assert.equal(m.get('copy-feedback').textContent,catalog.completeBackupExportCopySuccess.message);
});

for(const mode of ['missing','throw','reject'])test(`clipboard ${mode} leaves manual fingerprint and backup download available`,async t=>{
    const f=fixture(),m=mount(t,f.store,{clipboard:mode==='missing'?null:{writeText:()=>{if(mode==='throw')throw Error('PRIVATE');return Promise.reject(Error('PRIVATE'));}}});
    m.click('export');await until(()=>!m.view.pending);const digest=m.get('export-digest').textContent;m.click('copy-digest');await tick();
    assert.match(m.get('copy-feedback').textContent,/Could not copy/);assert(!m.get('copy-feedback').textContent.includes('PRIVATE'));assert.equal(m.get('export-digest').textContent,digest);assert(!m.get('copy-digest').disabled);
    m.click('download-export');await until(()=>!m.view.pending);assert.equal(m.calls.downloads.length,1);assert.equal(f.writes.length,0);
});

for(const action of ['cancel-export','change','pagehide','destroy','download-export'])test(`late clipboard result after ${action} cannot revive status or take focus`,async t=>{
    const f=fixture(),wait=deferred(),writes=[],m=mount(t,f.store,{clipboard:{writeText:text=>{writes.push(text);return wait.promise;}}});
    m.click('export');await until(()=>!m.view.pending);m.click('copy-digest');assert.equal(m.get('copy-digest').getAttribute('aria-disabled'),'true');assert(!m.get('download-export').disabled);
    const feedback=m.get('copy-feedback');if(action==='change'){m.select(['tasks']);m.click('export');await until(()=>!m.view.pending);}else if(action==='pagehide')m.events.get('pagehide')();else if(action==='destroy')m.view.destroy();else m.click(action);
    const outside=m.document.createElement('textarea');m.document.body.append(outside);outside.focus();await until(()=>!m.view.pending);const before=feedback.textContent;
    wait.resolve();await tick();assert.equal(feedback.textContent,before);assert.equal(m.document.activeElement,outside);assert.equal(writes.length,1);assert.equal(f.writes.length,0);
});

test('pending or unavailable fingerprint cannot be copied and download remains independent',async t=>{
    for(const crypto of [null,{subtle:{digest:()=>new Promise(()=>{})}}]){
        const f=fixture(),writes=[],m=mount(t,f.store,{crypto,clipboard:{writeText:text=>writes.push(text)}});m.click('export');await until(()=>!m.view.pending);
        assert(m.get('copy-digest').disabled);m.get('copy-digest').dispatch('click');assert.equal(writes.length,0);m.click('download-export');await until(()=>!m.view.pending);assert.equal(m.calls.downloads.length,1);
    }
});

for(const mode of ['silent-selection','hidden-document','clipboard-getter-cancel'])test(`copy rechecks authority before writing (${mode})`,async t=>{
    const f=fixture(),writes=[],clipboard={writeText:text=>writes.push(text)},m=mount(t,f.store,{clipboard});
    m.select(['scratchpad']);m.click('export');await until(()=>!m.view.pending);
    if(mode==='silent-selection')m.input('tasks').checked=true;
    else if(mode==='hidden-document')m.document.hidden=true;
    else Object.defineProperty(m.window.navigator,'clipboard',{get:()=>{m.click('cancel-export');return clipboard;}});
    m.get('copy-digest').dispatch('click');await tick();assert.equal(writes.length,0);assert.equal(f.writes.length,0);
});
