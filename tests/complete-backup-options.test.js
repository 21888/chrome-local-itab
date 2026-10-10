const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createDocument,deferred}=require('./helpers/task-dom-model');
function model(){
    const document=createDocument(),host=document.createElement('div');host.id='complete-backup';document.body.append(host);
    const calls=[];let options;
    const window={LocalItabCompleteBackup:{Store:class{async restore(p,o){calls.push([p,o]);return {applied:true};}}},LocalItabCompleteBackupView:{mount(h,o){assert.equal(h,host);options=o;return {};}}};
    const ctx={document,window,storageManager:{},console,setTimeout,clearTimeout};vm.createContext(ctx);vm.runInContext(fs.readFileSync('options.js','utf8'),ctx);
    vm.runInContext('settingsHasUncommittedWork=()=>false;worldClockHasUncommittedWork=()=>false;',ctx);ctx.setupCompleteBackup();
    return {ctx,window,calls,options};
}
test('Settings complete restore preserves drafts and never nests confirmation or reload',async()=>{
    for(const view of ['localScratchpadSettingsView','localCountdownSettingsView','localFocusSettingsView']){
        const m=model(),draft={private:'still here'};m.window[view]={draft,hasUncommittedWork:()=>true};await assert.rejects(m.options.restore({},()=>true),e=>e.code==='DIRTY');assert.equal(m.calls.length,0);assert.equal(m.window[view].draft,draft);
    }
    const m=model();vm.runInContext('settingsHasUncommittedWork=()=>true;',m.ctx);await assert.rejects(m.options.restore({},()=>true),e=>e.code==='DIRTY');assert.equal(m.calls.length,0);
});
test('single explicit confirmation delegates immutable preview and rechecks drafts/current ownership before commit',async()=>{
    const m=model(),preview={selected:['tasks']};await m.options.restore(preview,()=>true);assert.equal(m.calls.length,1);assert.equal(m.calls[0][0],preview);assert.equal(m.calls[0][1].confirmed,true);assert.equal(m.calls[0][1].isCurrent(),true);
    m.window.localScratchpadSettingsView={hasUncommittedWork:()=>true};assert.equal(m.calls[0][1].isCurrent(),false);
    await assert.rejects(m.options.restore(preview,()=>false),e=>e.code==='CANCELLED');assert.equal(m.calls.length,1);
});
test('required scripts follow all local stores; independent exports remain; departure guard includes review',()=>{
    const html=fs.readFileSync('options.html','utf8');for(const name of ['local-tasks-store','local-focus-store','local-scratchpad-store','local-countdown-store'])assert(html.indexOf(name+'.js')<html.indexOf('shared/complete-backup.js'));
    for(const id of ['export-settings','export-bookmarks-html','bookmark-import','complete-backup'])assert(html.includes('id="'+id+'"'));
    assert(fs.readFileSync('shared/local-content-lifecycle.js','utf8').includes('root.completeBackupView?.hasUncommittedWork()'));
});
