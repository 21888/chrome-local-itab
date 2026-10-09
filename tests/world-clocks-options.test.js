const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const StorageManager = require('../storage.js');
const WorldClocks = require('../shared/world-clocks');
const source = fs.readFileSync('options.js', 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function harness(entries = [], locale = 'en') {
    const document = createDocument(); document.body.prepend = (...children) => document.body.append(...children);
    for (const [tag,id] of [['ul','world-clock-list'],['input','world-clock-zone'],['input','world-clock-label'],['button','world-clock-add'],['button','world-clock-save'],['p','world-clock-error'],['input','hour12-format'],['input','show-seconds'],['ul','category-manage-list']]) {
        const el=document.createElement(tag);el.id=id;document.body.append(el);
    }
    document.getElementById('show-seconds').checked=true;
    const baseline = {hour12:false,showSeconds:true,worldClocks:clone(entries)};
    let saved=clone(baseline), pause=null;
    const writes=[], messages=[];
    const catalog=JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`,'utf8'));
    const window={i18n:{t:key=>catalog[key]?.message},WorldClocks,addEventListener(){},location:{reload(){window.reloads=(window.reloads||0)+1}},confirm:()=>false};
    const manager = new StorageManager();
    const context={window,i18n:window.i18n,document,console,Intl,JSON,setTimeout,clearTimeout,chrome:{}, storageManager:{
        defaultConfig:{clock:clone(baseline)}, settingsFormPaths: manager.settingsFormPaths,
        settingsPathValue: manager.settingsPathValue.bind(manager), setSettingsPath: manager.setSettingsPath.bind(manager), validateData: manager.validateData.bind(manager), async clear(){saved=clone(baseline);return true;},
        async setAll(settings,options) {
            if(pause){const gate=pause;pause=null;gate.entered.resolve();await gate.resume.promise;}
            if(settings.clock && options.expectedClock && JSON.stringify(saved)!==JSON.stringify(options.expectedClock)) throw new Error('Clock settings changed in another tab.');
            writes.push(clone({settings,options}));if(settings.clock)saved=clone(settings.clock);return true;
        }
    },messages};
    vm.createContext(context);
    vm.runInContext(source+`\nclockBaseline=${JSON.stringify(baseline)}; clockFormInitialized=true; worldClockDraft=clockBaseline.worldClocks.map(entry=>({...entry}));
    collectFormData=()=>({clock:clockFormSnapshot(),quote:'unrelated'});
    settingsBaseline={generation:null,values:{quote:'unrelated'}}; settingsFormConfig=collectFormData(); settingsFormBaseline=collectFormData();
    showMessage=(text,type)=>messages.push({text,type});displayStorageInfo=async()=>{};setupWorldClocks();renderWorldClockDraft();`,context);
    vm.runInContext(fs.readFileSync('shared/local-content-lifecycle.js','utf8'),context);
    const get=id=>document.getElementById(id);
    const add=(zone,label='')=>{get('world-clock-zone').value=zone;get('world-clock-label').value=label;get('world-clock-add').dispatch('click')};
    return {context,window,document,get,add,writes,messages,get saved(){return saved},set saved(v){saved=clone(v)},set pause(v){pause=v}};
}
const {test} = require('node:test');
const entries = ['UTC', 'Asia/Tokyo', 'Europe/London', 'Asia/Kathmandu'].map((timeZone, index) => ({timeZone, label: `Clock ${index + 1}`}));
const action = (h, row, name) => h.get('world-clock-list').children[row].querySelector(`[data-clock-action="${name}"]`);
const draft = h => clone(vm.runInContext('worldClockDraft', h.context));
test('clock reorder initializes empty/single/four rows with localized contextual native controls', () => {
    for (const locale of ['en', 'zh_CN']) for (const count of [0, 1, 4]) {
        const h = harness(entries.slice(0, count), locale);
        assert.equal(h.get('world-clock-list').children.length, count);
        for (let index = 0; index < count; index++) {
            for (const direction of ['up', 'down']) {
                const button = action(h, index, direction);
                assert.equal(button.tagName, 'BUTTON'); assert.equal(button.type, 'button');
                assert.equal(button.textContent, locale === 'en' ? `Move ${direction}` : direction === 'up' ? '上移' : '下移');
                assert.equal(button.getAttribute('aria-label'), `${button.textContent}: ${entries[index].label} · ${entries[index].timeZone}`);
                assert.equal(button.disabled, direction === 'up' ? index === 0 : index === count - 1);
            }
        }
        if (count) {
            action(h, 0, 'up').dispatch('click'); action(h, count - 1, 'down').dispatch('click');
            assert.deepEqual(draft(h), entries.slice(0, count));
        }
        assert.equal(h.writes.length, 0); assert(!h.window.worldClockSettingsView.hasUncommittedWork());
    }
});
test('adjacent moves preserve entries, follow focus, reverse cleanly, and save only explicitly', async () => {
    const h = harness(entries);
    action(h, 1, 'down').dispatch('click');
    assert.deepEqual(draft(h), [entries[0], entries[2], entries[1], entries[3]]);
    assert.equal(h.document.activeElement, action(h, 2, 'down'));
    action(h, 2, 'down').dispatch('click');
    assert.equal(h.document.activeElement, action(h, 3, 'up'));
    action(h, 3, 'up').dispatch('click'); action(h, 2, 'up').dispatch('click');
    assert.deepEqual(draft(h), entries); assert(!h.window.worldClockSettingsView.hasUncommittedWork());
    action(h, 1, 'up').dispatch('click');
    assert.equal(h.document.activeElement, action(h, 0, 'down'));
    assert.equal(h.writes.length, 0); assert(h.window.LocalItabContentLifecycle.hasUncommittedWork());
    assert.equal(h.window.LocalItabContentLifecycle.reload(), false);
    await h.context.saveAllSettings();
    assert.deepEqual(h.saved.worldClocks, entries); assert(!('clock' in h.writes.at(-1).settings));
    const focused = h.document.activeElement;
    h.get('world-clock-save').dispatch('click'); await vm.runInContext('settingsSaveQueue', h.context);
    assert.deepEqual(h.saved.worldClocks, [entries[1], entries[0], entries[2], entries[3]]);
    assert.equal(h.document.activeElement, focused); assert(focused.isConnected);
    assert(!h.window.worldClockSettingsView.hasUncommittedWork());
});
test('remove focus uses explicit actions and obsolete row handlers cannot alter the draft', () => {
    const h = harness(entries);
    const staleRow = h.get('world-clock-list').children[1];
    const staleUp = action(h, 1, 'up'), staleRemove = action(h, 1, 'remove');
    action(h, 2, 'down').dispatch('click');
    const expected = draft(h);
    staleUp.dispatch('click'); staleRemove.dispatch('click');
    assert.deepEqual(draft(h), expected);
    // Even reattaching an old row at its old index does not revive its handler.
    const list = h.get('world-clock-list'), currentRows = [...list.children];
    list.replaceChildren(currentRows[0], staleRow, currentRows[2], currentRows[3]);
    staleUp.dispatch('click'); staleRemove.dispatch('click'); assert.deepEqual(draft(h), expected);
    vm.runInContext('renderWorldClockDraft()', h.context);
    action(h, 1, 'remove').dispatch('click'); assert.equal(h.document.activeElement, action(h, 1, 'remove'));
    action(h, 2, 'remove').dispatch('click'); assert.equal(h.document.activeElement, action(h, 1, 'remove'));
    action(h, 0, 'remove').dispatch('click'); assert.equal(h.document.activeElement, action(h, 0, 'remove'));
    action(h, 0, 'remove').dispatch('click'); assert.equal(h.document.activeElement, h.get('world-clock-zone'));
    assert.equal(h.writes.length, 0);
});
test('clock action keys suppress repeat and composition without replacing native activation', () => {
    const h = harness(entries);
    // Model only the browser default: an uncancelled Enter activates the focused button.
    const enter = (button, fields = {}) => {
        const event = button.dispatch('keydown', {key: 'Enter', ...fields});
        if (!event.prevented) button.dispatch('click');
        return event;
    };
    const firstMove = action(h, 1, 'up');
    assert(!enter(firstMove).prevented);
    assert.equal(h.document.activeElement, action(h, 0, 'down'));
    const moved = draft(h);
    assert(enter(h.document.activeElement, {repeat: true}).prevented);
    assert.deepEqual(draft(h), moved, 'held Enter must not bounce back after boundary focus changes');
    assert(!enter(action(h, 0, 'remove')).prevented);
    const removed = draft(h);
    assert.equal(h.document.activeElement, action(h, 0, 'remove'));
    assert(enter(h.document.activeElement, {repeat: true}).prevented);
    assert.deepEqual(draft(h), removed, 'held Enter must not remove the next focused row');
    for (const name of ['up', 'down', 'remove']) {
        const button = action(h, 1, name);
        for (const key of ['Enter', ' ', 'Spacebar']) {
            for (const fields of [{repeat: true}, {isComposing: true}, {keyCode: 229}]) {
                assert(button.dispatch('keydown', {key, ...fields}).prevented);
            }
            assert(!button.dispatch('keydown', {key}).prevented, 'ordinary native activation remains available');
        }
        assert(!button.dispatch('keydown', {key: 'Tab', repeat: true}).prevented);
    }
    assert.deepEqual(draft(h), removed); assert.equal(h.writes.length, 0);
});
test('delayed explicit save retains newer reordered draft, focus and baseline-only autosaves', async () => {
    const h = harness(entries); action(h, 1, 'up').dispatch('click'); const submitted = draft(h);
    const entered = deferred(), resume = deferred(); h.pause = {entered, resume};
    const saving = h.context.saveAllSettings(true); await entered.promise;
    action(h, 2, 'down').dispatch('click'); const newer = draft(h), focused = h.document.activeElement;
    const unrelated = h.context.saveAllSettings(); resume.resolve(); await Promise.all([saving, unrelated]);
    assert.deepEqual(h.saved.worldClocks, submitted); assert.deepEqual(draft(h), newer);
    assert.equal(h.document.activeElement, focused); assert(focused.isConnected);
    assert(h.window.worldClockSettingsView.hasUncommittedWork());
    await h.context.saveAllSettings(true); assert.deepEqual(h.saved.worldClocks, newer);
    assert(!h.window.worldClockSettingsView.hasUncommittedWork());
});
test('remote order conflict retains local draft and atomically rejects other submitted fields', async () => {
    const h = harness(entries); action(h, 1, 'up').dispatch('click'); const local = draft(h);
    const remote = {...h.saved, worldClocks: [...entries].reverse()}; h.saved = remote;
    await h.context.saveAllSettings(true);
    assert.deepEqual(h.saved, remote); assert.deepEqual(draft(h), local); assert.equal(h.writes.length, 0);
    assert.match(h.messages.at(-1).text, /changed in another tab/); assert(h.window.worldClockSettingsView.hasUncommittedWork());
});
(async()=>{
    const h=harness();
    h.add('Invalid/Zone');assert.match(h.get('world-clock-error').textContent,/valid IANA/);assert.equal(h.document.activeElement,h.get('world-clock-zone'));
    h.add('Asia/Kathmandu','Family');assert.equal(h.get('world-clock-list').children.length,1);assert.equal(h.writes.length,0);
    assert(h.window.LocalItabContentLifecycle.hasUncommittedWork());assert.equal(h.window.LocalItabContentLifecycle.reload(),false);assert.equal(h.window.reloads,undefined);
    await h.context.saveAllSettings();assert.deepEqual(h.saved.worldClocks,[],'unrelated auto-save does not apply draft');assert(!('clock' in h.writes.at(-1).settings));
    await h.context.saveAllSettings(true);assert.equal(h.saved.worldClocks[0].label,'Family');assert(!h.window.LocalItabContentLifecycle.hasUncommittedWork());
    h.get('world-clock-zone').value='Europe/London';const enter=h.get('world-clock-zone').dispatch('keydown',{key:'Enter'});assert(enter.prevented);assert.equal(h.get('world-clock-list').children.length,2);
    h.get('world-clock-list').querySelectorAll('[data-clock-action="remove"]')[1].dispatch('click');assert.equal(h.document.activeElement,h.get('world-clock-list').querySelector('[data-clock-action="remove"]'));
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
