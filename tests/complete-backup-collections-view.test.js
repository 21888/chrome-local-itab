const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const source = fs.readFileSync('shared/complete-backup-view.js', 'utf8');
const flush = async () => { await new Promise(resolve => setTimeout(resolve, 10)); };
const modules = ['config','tasks','scratchpad','countdown','focus','prompts','collections'];
function model(i18n) {
    const document = createDocument({blurUnavailableFocus:true}); const host = document.createElement('div'); document.body.append(host);
    const calls = {reviews:[],restores:[],exports:[],downloads:[]};
    const store = {
        async review(text, selected = modules) { calls.reviews.push([text, selected]); return {modules,selected,incoming:{config:{shortcuts:5,categories:2,dataUrlIcons:1},tasks:{active:2,done:3,removed:1,recovery:4},scratchpad:{characters:15},focus:{enabled:true,durations:{focus:25,break:5}}},current:{}}; },
        async restore(preview) { calls.restores.push(preview); },
        async export(selected) { calls.exports.push(selected); return 'JSON'; }, async recovery() { return 'RECOVERY'; }
    };
    const window = {i18n, LocalItabCompleteBackup:{LIMITS:{bytes:32*1024*1024}}};
    vm.runInNewContext(source,{window,setTimeout,URL,Blob});
    const view = window.LocalItabCompleteBackupView.mount(host,{store,restore:p=>store.restore(p),download:async (...args)=>calls.downloads.push(args),reload:()=>{calls.reloads=(calls.reloads||0)+1;}});
    const get = cls => host.querySelector('.complete-backup-'+cls);
    const file=get('file'); file.click=()=>{};
    const select = (text='saved', options={}) => { get('choose').focus(); file.files=[{size:text.length,text:async()=>text,...options}]; file.dispatch('change'); };
    return {document,host,store,view,calls,get,file,select};
}

test('collection target is deliberately selected and counts/conflicts shown before restore',async()=>{
    const m=model();m.store.review=async(text,selected=modules,options={})=>{m.calls.reviews.push([text,selected,options]);return {schemaVersion:4,modules,selected,incoming:{collections:{active:4,removed:2,versions:9,recovery:1}},current:{collections:{active:1,removed:0,versions:2,recovery:0}},requiresCollectionTarget:!options.collectionTarget,collections:{target:'global-collections',conflicts:[{changed:true}]},workspaces:{scope:'global-only',incoming:[],current:[],incomingTrashCount:0,currentTrashCount:0}};};
    m.select();await flush();assert(!m.get('collection-destination').hidden);assert.equal(m.get('collection-target').value,'');assert(m.get('apply').disabled);assert.match(m.get('status').textContent,/Choose the global AI collections/);
    assert.match(m.get('collection-summary').textContent,/including archived records/);assert.match(m.get('collection-summary').textContent,/differs: 1/);
    assert(m.host.querySelectorAll('li').some(li=>li.children.some(item=>item.textContent?.includes('Saved body versions: 9'))));
    m.get('collection-target').value='global-collections';m.get('collection-target').dispatch('change');assert(m.get('apply').disabled);await flush();assert.equal(m.calls.reviews.at(-1)[2].collectionTarget,'global-collections');assert(!m.get('apply').disabled);
    m.get('apply').dispatch('click');await flush();assert.equal(m.calls.restores.length,1);
});
test('Cancel and new files forget global collection target',async()=>{
    const m=model();m.store.review=async(text,selected=modules,options={})=>{m.calls.reviews.push([text,selected,options]);return {schemaVersion:4,modules,selected,incoming:{},current:{},requiresCollectionTarget:!options.collectionTarget,collections:{conflicts:[]}};};
    m.select();await flush();m.get('collection-target').value='global-collections';m.get('collection-target').dispatch('change');await flush();m.get('cancel').dispatch('click');m.select('new');await flush();assert(m.get('apply').disabled);assert.equal(m.get('collection-target').value,'');
});

test('both global destinations require independent explicit choices',async()=>{
 const m=model();m.store.review=async(text,selected=modules,options={})=>({schemaVersion:4,modules,selected,incoming:{},current:{},requiresPromptTarget:!options.promptTarget,requiresCollectionTarget:!options.collectionTarget,prompts:{conflicts:[]},collections:{conflicts:[]}});m.select();await flush();assert(m.get('apply').disabled);m.get('collection-target').value='global-collections';m.get('collection-target').dispatch('change');await flush();assert(m.get('apply').disabled);m.get('prompt-target').value='global-library';m.get('prompt-target').dispatch('change');await flush();assert(!m.get('apply').disabled);
});

for (const locale of ['fallback', 'en', 'zh_CN']) test(`backup preview uses module-specific saved and archived labels (${locale})`, async () => {
    const messages = locale === 'fallback' ? null : JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const catalog = new Map(Object.entries(messages || {}).map(([key, value]) => [key.toLowerCase(), value.message]));
    const m = model(messages ? {t: key => catalog.get(key.toLowerCase()) || key} : undefined);
    const selected = ['tasks', 'prompts', 'collections'];
    const value = {active: 4, removed: 2, versions: 9};
    m.store.review = async () => ({modules: selected, selected, incoming: Object.fromEntries(selected.map(id => [id, value])), current: Object.fromEntries(selected.map(id => [id, {active: 1, removed: 0, versions: 3}]))});
    m.select(); await flush();
    const labels = locale === 'zh_CN' ? [
        ['未完成任务', '已移除任务'], ['使用中的提示词', '已归档提示词'], ['已保存摘录', '已归档摘录']
    ] : [['Active tasks', 'Removed tasks'], ['Active prompts', 'Archived prompts'], ['Saved excerpts', 'Archived excerpts']];
    const rows = m.host.querySelectorAll('li');
    assert.equal(rows.length, 3);
    rows.forEach((row, index) => {
        const [active, archived] = labels[index];
        for (const [childIndex, activeCount, archivedCount] of [[1, 4, 2], [2, 1, 0]]) {
            const text = row.children[childIndex].textContent;
            assert.ok(text.includes(`${active}: ${activeCount}`), text);
            assert.ok(text.includes(`${archived}: ${archivedCount}`), text);
            for (const [otherIndex, otherLabels] of labels.entries()) if (otherIndex !== index) {
                for (const label of otherLabels) assert.ok(!text.includes(label), text);
            }
        }
    });
    if (messages) for (const key of ['completeBackupCountCollectionActive', 'completeBackupCountCollectionRemoved']) assert.ok(messages[key]?.message, key);
    assert.equal(m.calls.restores.length, 0);
});
