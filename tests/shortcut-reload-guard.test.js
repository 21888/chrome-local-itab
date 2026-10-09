const assert = require('node:assert/strict');
const {createDocument} = require('./helpers/task-dom-model');
const fs = require('node:fs');
const vm = require('node:vm');
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };

function createEditor() {
    const pending = [], writes = [], departureListeners = [];
    const context = {
        document: createDocument(),
        window: { addEventListener(type, listener) { if (type === 'beforeunload') departureListeners.push(listener); }, LocalItabDialog: { open(overlay) { overlay.classList.add('active'); return () => overlay.classList.remove('active'); } } },
        storageManager: { defaultConfig: { layout: { columns: 6 } }, set(key, value, options) {
            const request = deferred(); pending.push(request); writes.push({ key, value: clone(value), expected: clone(options.expectedLinks) }); return request.promise;
        } },
        console: { log() {}, error() {}, warn() {} }, URL
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('newtab.js', 'utf8') + '\nthis.ShortcutsComponent = ShortcutsComponent; this.errors = []; showErrorMessage = value => errors.push(value);', context);
    const component = new context.ShortcutsComponent(['A', 'B'].map(title => ({ title, url: `https://example.com/${title}`, icon: '🌐', category: 'work' })));
    const fields = new Map(['shortcut-title', 'shortcut-url', 'shortcut-icon', 'shortcut-category', 'save-btn', 'title-error', 'url-error'].map(id => [`#${id}`, { value: '', textContent: '', focus() {}, classList: { toggle() {} } }]));
    fields.set('.modal-title', { textContent: '' });
    const classes = new Set();
    component.modal = {
        classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) },
        querySelector: selector => fields.get(selector),
        querySelectorAll: () => [fields.get('#title-error'), fields.get('#url-error')]
    };
    component.updateCategoryOptions = () => {};
    component.updateGrid = () => {};
    context.window.shortcutsComponentInstance = component;
    let reloads = 0, confirms = 0, permit = false;
    context.document.body.prepend = (...nodes) => context.document.body.append(...nodes);
    context.window.location = { reload() { reloads++; } };
    context.window.confirm = () => { confirms++; return permit; };
    vm.runInContext(fs.readFileSync('shared/local-content-lifecycle.js','utf8'), context);
    const lifecycle = context.window.LocalItabContentLifecycle;
    return { component, fields, pending, writes, context, lifecycle, departureListeners, get reloads(){return reloads}, get confirms(){return confirms}, allow(){permit=true} };
}
const submit = component => component.handleFormSubmit({ preventDefault() {} });


(async () => {
    for (const mode of ['add-empty', 'add-dirty', 'edit-unchanged', 'edit-dirty']) {
        const h=createEditor(); const {component,fields,lifecycle}=h;
        if(mode.startsWith('add'))component.openAddModal(); else component.openEditModal(0);
        if(mode.endsWith('dirty'))fields.get('#shortcut-title').value='UNSAVED DRAFT';
        assert.equal(lifecycle.reload(),false,mode); assert.equal(h.reloads,0);
        const reload=h.context.document.querySelector('button');
        reload.dispatch('click'); assert.equal(h.confirms,1); assert.equal(h.reloads,0);
        assert.equal(component.modal.classList.contains('active'),true);
        component.hideModal(); assert.equal(lifecycle.hasUncommittedWork(),false);
        assert.equal(lifecycle.reload(),true); assert.equal(h.reloads,1);
    }
    for (const outcome of ['success','false','throw']) for(const reopen of [false,true]) {
        const h=createEditor(); const {component,fields,pending,lifecycle}=h;
        component.openEditModal(0); fields.get('#shortcut-title').value='SAVE A';
        const saving=submit(component);
        assert.equal(lifecycle.reload(),false); assert.equal(h.reloads,0);
        component.hideModal(); assert.equal(lifecycle.reload(),false,'closing editor does not release pending save');
        const reload=h.context.document.querySelector('button'); h.allow(); reload.dispatch('click');
        assert.equal(h.confirms,0,'pending save cannot ask discard'); assert.equal(h.reloads,0);
        if(reopen){component.openEditModal(1); fields.get('#shortcut-title').value='NEWER B';}
        if(outcome==='throw')pending[0].reject(new Error('write unavailable'));else pending[0].resolve(outcome==='success');
        await saving; assert.equal(component._pendingSave,null);
        assert.equal(lifecycle.hasUncommittedWork(),reopen,'stale completion cannot release newer editor');
        if(reopen){assert.equal(fields.get('#shortcut-title').value,'NEWER B'); reload.dispatch('click');assert.equal(h.confirms,1);assert.equal(h.reloads,1)}
        else {assert.equal(lifecycle.reload(),true);assert.equal(h.reloads,1)}
    }
    {
        const h=createEditor(); h.component.openEditModal(0); const saving=submit(h.component);
        h.pending[0].resolve(true); await saving;
        assert.equal(h.lifecycle.hasUncommittedWork(),false,'successful current save closes editor and releases guard');
    }
    // Local content/config events do not themselves invoke the Sync reload path.
    {
        const h=createEditor(), events=[]; let pulls=0;
        Object.assign(h.context.storageManager,{syncMetaKey:'meta',syncChunkPrefix:'chunk',syncIdentityStateKey:'guard',getSyncCompatibilityStatus:async()=>null,shouldIgnoreRemoteSyncChange:async()=>false,pullFromSync:async()=>{pulls++;return{applied:true}}});
        h.context.window.storageManager=h.context.storageManager;
        h.context.chrome={storage:{onChanged:{addListener:f=>events.push(f)}}};
        h.context.setupCloudSyncChangeListener(); h.component.openAddModal();
        for(const key of ['links','categories','__localItabPersonalTasksV1','__localItabFocusV1','__localItabScratchpadV1'])await events[0]({[key]:{newValue:[]}},'local');
        assert.equal(pulls,0);assert.equal(h.reloads,0);
        await events[0]({meta:{newValue:{}}},'sync'); assert.equal(pulls,1);assert.equal(h.reloads,0);
    }
    // Shortcuts do not gain a departure warning when the shared Tasks guard expands.
    for(const file of ['newtab.js','options.js'])assert(!/beforeunload/.test(fs.readFileSync(file,'utf8')));
    {
        const h = createEditor(); h.component.openAddModal();
        h.fields.get('#shortcut-title').value = 'UNSAVED SHORTCUT';
        assert.equal(h.departureListeners.length, 1, 'one shared departure hook');
        const event = { returnValue: undefined, preventDefault() { assert.fail('shortcut-only work must not expand the departure guard'); } };
        h.departureListeners[0](event); assert.equal(event.returnValue, undefined);
    }
    console.log('PASS: Add/Edit empty/dirty/open; pending closed save; Cancel/current Save release; stale success/false/rejection ownership; explicit discard once; local events versus applied Sync reload; no duplicate beforeunload hook.');
})().catch(e=>{console.error(e);process.exitCode=1});
