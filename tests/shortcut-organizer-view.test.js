const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createDocument,deferred}=require('./helpers/task-dom-model');
const tick=()=>new Promise(setImmediate);
function model() {
    const document=createDocument({blurUnavailableFocus:true}),host=document.createElement('header');document.body.append(host);
    let calls=0,request,write,read,reads=0; const beforeUnload=[];
    const snapshot={links:[{title:'<b>Twin</b>',url:'https://example.com/<literal>',category:'work'},{title:'<b>Twin</b>',url:'https://example.com/<literal>',category:'orphan'}],categories:[{id:'work',name:'Work'},{id:'personal',name:'Personal'}],state:{links:[]}};
    const component={async moveReviewedShortcuts(p){calls++;request=p;if(write)return write.promise;},layoutController:{async flush(){}}};
    const context={document,URL,console,setTimeout,window:null,addEventListener(type,fn){if(type==='beforeunload')beforeUnload.push(fn);},storageManager:{async readShortcutOrganizerSnapshot(){reads++;return read?read.promise:snapshot;}},shortcutsComponentInstance:component};context.window=context;vm.createContext(context);
    for(const file of ['shared/dialog-focus.js','shared/shortcut-organizer.js','shared/shortcut-organizer-view.js','shared/local-content-lifecycle.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
    const view=component.organizerView=context.LocalItabOrganizer.mount(host,component);
    component.hasUncommittedShortcutWork=()=>view.hasUncommittedWork();
    const button=text=>document.querySelectorAll('button').find(b=>b.textContent===text);
    const click=text=>button(text).dispatch('click',{detail:1});
    return {document,host,component,context,view,snapshot,button,click,beforeUnload,get calls(){return calls;},get request(){return request;},get reads(){return reads;},set write(v){write=v;},set read(v){read=v;},
        select(){const select=document.querySelector('select');select.value='personal';select.dispatch('change');const checks=document.querySelectorAll('input').filter(input => input.type === 'checkbox');checks[1].checked=true;checks[1].dispatch('change');},
        async review(){await view.open();this.select();click('Review move');}};
}
test('selection and exact escaped review target only chosen identical twin; cancel writes nothing',async()=>{
    const h=model();await h.review();assert.equal(h.calls,0);assert.equal(h.document.querySelectorAll('li').length,1);assert.equal(h.document.querySelector('li').querySelector('strong').textContent,'2. <b>Twin</b>');assert.equal(h.document.querySelectorAll('b').length,0);
    h.click('Back');assert.equal(h.document.querySelectorAll('input').filter(input => input.type === 'checkbox')[1].checked,true);h.click('Review move');h.click('Cancel');assert.equal(h.calls,0);assert.equal(h.view.hasUncommittedWork(),false);
});
test('pending guarded submit ignores repeats, prevents cancellation and protects workspace departure',async()=>{
    const h=model(),pending=deferred();h.write=pending;await h.review();h.click('Move reviewed sites');h.click('Move reviewed sites');assert.equal(h.calls,1);assert.equal(h.view.close(),false);assert.equal(h.view.pending,true);assert.equal(h.context.LocalItabContentLifecycle.pending(),true);
    const e={preventDefault(){this.prevented=true;}};h.beforeUnload[0](e);assert.equal(e.prevented,true);assert.deepEqual(Array.from(h.request.indices),[1]);
    pending.resolve();await tick();assert.equal(h.view.pending,false);assert.equal(h.view.hasUncommittedWork(),false);assert.equal(h.context.LocalItabContentLifecycle.hasUncommittedWork(),false);
});
test('uncertain failure keeps exact review identity for safe retry',async()=>{
    const h=model();let fail=true;h.component.moveReviewedShortcuts=async p=>{if(fail){h.component.first=p;const e=new Error();e.code='ORGANIZER_UNVERIFIED';throw e;}assert.equal(p,h.component.first);};await h.review();h.click('Move reviewed sites');await tick();assert.equal(h.button('Back'),undefined);assert.match(h.document.querySelector('[role="status"]').textContent,/Retry checks/);fail=false;h.click('Retry reviewed move');await tick();assert.equal(h.view.hasUncommittedWork(),false);
});
test('stale destination and workspace errors do not offer another mutation',async()=>{
    for(const code of ['ORGANIZER_CONFLICT','WORKSPACE_STALE']) {const h=model();h.component.moveReviewedShortcuts=async()=>{const e=new Error();e.code=code;throw e;};await h.review();h.click('Move reviewed sites');await tick();assert.equal(h.button('Retry reviewed move').disabled,true);h.click('Cancel');assert.equal(h.view.hasUncommittedWork(),false);}
});
test('cancelled delayed read cannot reopen or overwrite newer organizer session',async()=>{
    const h=model(),read=deferred();h.read=read;const first=h.view.open();await tick();h.click('Cancel');assert.equal(h.view.hasUncommittedWork(),false);h.read=null;await h.view.open();h.select();read.resolve({links:[],categories:[],state:{}});await first;assert.equal(h.document.querySelectorAll('input').filter(input => input.type === 'checkbox').length,2);assert.equal(h.document.querySelectorAll('input').filter(input => input.type === 'checkbox')[1].checked,true);
});
test('read error permits close and subsequent successful open',async()=>{
    const h=model();h.context.storageManager.readShortcutOrganizerSnapshot=async()=>{throw new Error();};await h.view.open();assert.match(h.document.querySelector('[role="status"]').textContent,/Could not read/);h.click('Cancel');assert.equal(h.view.pending,false);
});
test('destination change removes no-op selections and orphan group stays readable',async()=>{
    const h=model();await h.view.open();assert(h.document.querySelectorAll('h3').some(n=>n.textContent.includes('orphan')));const input=h.document.querySelectorAll('input').find(input => input.type === 'checkbox');input.checked=true;input.dispatch('change');let select=h.document.querySelector('select');select.value='work';select.dispatch('change');assert.equal(h.document.querySelectorAll('input').find(input => input.type === 'checkbox').checked,false);assert.equal(h.document.querySelectorAll('input').find(input => input.type === 'checkbox').disabled,true);assert.equal(h.button('Review move').disabled,true);
});
test('open review defers automatic reload and never saves on workspace Save action',async()=>{
    const h=model();await h.review();assert.equal(h.context.LocalItabContentLifecycle.hasUncommittedWork(),true);assert.equal(await h.context.LocalItabContentLifecycle.saveDrafts(),false);assert.equal(h.calls,0);
});
test('failed layout flush blocks review reads and preserves retry intent',async()=>{
    for(const mode of ['existing','new','invalidated']){const h=model(),intent={positions:{a:{x:1,y:2}}};if(mode==='existing')h.component.layoutController.failedChange=intent;if(mode==='invalidated')h.component.layoutController.invalidated=true;if(mode==='new')h.component.layoutController.flush=async()=>{h.component.layoutController.failedChange=intent;return false;};
        await h.view.open();assert.equal(h.reads,0);assert.match(h.document.querySelector('[role="status"]').textContent,/layout change/);if(mode!=='invalidated')assert.equal(h.component.layoutController.failedChange,intent);h.click('Cancel');assert.equal(h.view.hasUncommittedWork(),false);}
});
test('pending write retains focus inside dialog after disabling its controls',async()=>{
    const h=model(),pending=deferred();h.write=pending;await h.review();h.button('Move reviewed sites').focus();h.click('Move reviewed sites');const panel=h.document.querySelector('.organizer-panel');assert.equal(h.document.activeElement,panel);const event=panel.dispatch('keydown',{key:'Tab'});assert.equal(event.prevented,true);pending.resolve();await tick();
});

for (const code of ['ORGANIZER_CONFLICT', 'WORKSPACE_INVALIDATED', 'WORKSPACE_SWITCH_PENDING', 'WORKSPACE_STALE', 'ORGANIZER_LAYOUT_PENDING', undefined]) {
    test(`non-retryable ${code || 'unexpected'} move failure keeps keyboard focus on Cancel`, async () => {
        const h = model(), pending = deferred();
        let calls = 0;
        h.component.moveReviewedShortcuts = async () => {
            calls++;
            await pending.promise;
            throw Object.assign(new Error('Move unavailable'), { code });
        };
        const opener = h.button('Organize saved sites'); opener.focus();
        await h.review(); h.click('Move reviewed sites');
        assert.equal(h.document.activeElement, h.document.querySelector('.organizer-panel'));
        pending.resolve(); await tick();
        const retry = h.button('Retry reviewed move'), cancel = h.button('Cancel');
        assert.equal(retry.disabled, true);
        assert.equal(Boolean(cancel.disabled), false);
        assert.equal(h.document.activeElement === cancel, true, 'Cancel must own focus before keyboard input');
        // Send keyboard input from the current focus, never the old submit.
        const tab = h.document.activeElement.dispatch('keydown', { key: 'Tab' });
        assert.equal(tab.prevented, true); assert.equal(h.document.activeElement, cancel);
        h.click('Retry reviewed move'); assert.equal(calls, 1);
        const escape = h.document.activeElement.dispatch('keydown', { key: 'Escape' });
        assert.equal(escape.prevented, true); assert.equal(h.view.hasUncommittedWork(), false);
        assert.equal(h.document.activeElement, opener);
        await h.view.open();
        assert.equal(h.document.querySelector('select').value, '');
        assert.equal(h.document.querySelectorAll('input').some(input => input.type === 'checkbox' && input.checked), false);
        assert.equal(h.button('Review move').disabled, true); assert.equal(h.button('Retry reviewed move'), undefined);
        h.click('Cancel'); assert.equal(h.document.activeElement, opener);
    });
}

for (const code of ['ORGANIZER_FAILED', 'ORGANIZER_UNVERIFIED']) {
    test(`retryable ${code} keeps the enabled retry focused and the same reviewed request`, async () => {
        const h = model(), pending = deferred();
        let calls = 0, originalRequest;
        h.component.moveReviewedShortcuts = async request => {
            calls++;
            if (!originalRequest) originalRequest = request;
            else assert.equal(request, originalRequest);
            if (calls === 1) { await pending.promise; throw Object.assign(new Error('Retry available'), { code }); }
        };
        const opener = h.button('Organize saved sites'); opener.focus();
        await h.review(); h.click('Move reviewed sites'); pending.resolve(); await tick();
        const retry = h.button('Retry reviewed move');
        assert.equal(Boolean(retry.disabled), false); assert.equal(h.document.activeElement, retry);
        assert.equal(h.button('Back'), undefined);
        h.click('Retry reviewed move'); await tick();
        assert.equal(calls, 2); assert.equal(h.view.hasUncommittedWork(), false);
        assert.equal(h.document.activeElement, opener);
    });
}

test('a real stale storage snapshot returns keyboard control to Cancel and a fresh review can succeed', async () => {
    const StorageManager = require('../storage.js');
    const clone = value => JSON.parse(JSON.stringify(value));
    const h = model(), manager = new StorageManager();
    const state = {
        links: ['work', 'orphan'].map(category => ({ title: 'Twin', url: 'https://example.com/twin', icon: '★', category })),
        categories: clone(h.snapshot.categories), layout: { positions: {} }
    };
    let writes = 0;
    manager._syncInitialized = true;
    manager.withLocalWriteLock = work => Promise.resolve().then(work);
    manager.scheduleShortcutUndoSync = async () => {};
    Object.defineProperty(manager, '_local', { value: {
        async get() { return clone(state); },
        async set(values) { writes++; Object.assign(state, clone(values)); }
    } });
    h.context.storageManager = manager;
    h.component.moveReviewedShortcuts = request => manager.moveShortcutsToCategory(request);
    const opener = h.button('Organize saved sites'); opener.focus();
    await h.review();
    // Another tab can rename the destination after this review was captured.
    state.categories[1].name = 'Renamed destination';
    const changed = clone(state);
    h.click('Move reviewed sites'); await tick();
    assert.equal(writes, 0); assert.deepEqual(state, changed);
    assert.match(h.document.querySelector('[role="status"]').textContent, /changed/);
    assert.equal(h.document.activeElement === h.button('Cancel'), true, 'The real conflict must focus Cancel');
    assert.equal(h.button('Retry reviewed move').disabled, true);
    h.document.activeElement.dispatch('keydown', { key: 'Escape' });
    assert.equal(h.document.activeElement, opener);
    await h.review();
    assert.equal(h.document.activeElement, h.button('Move reviewed sites'));
    h.click('Move reviewed sites'); await tick();
    const moved = clone(changed); moved.links[1].category = 'personal';
    assert.equal(writes, 1); assert.deepEqual(state, moved);
    assert.equal(h.view.hasUncommittedWork(), false); assert.equal(h.document.activeElement, opener);
});

test('retiring an organizer during its read removes the old dialog and late read cannot steal new focus', async () => {
    const h = model(), read = deferred(); h.read = read;
    const opening = h.view.open(); await tick();
    assert.equal(h.view.pending, true);
    h.view.destroy(); h.host.remove();
    const newer = h.document.createElement('button'); newer.textContent = 'New dashboard action'; h.document.body.append(newer); newer.focus();
    assert.equal(h.document.querySelector('.organizer-overlay'), null, 'retired loading dialog must not remain over the new dashboard');
    read.resolve(h.snapshot); await opening;
    assert.equal(h.document.querySelector('.organizer-overlay'), null);
    assert.equal(h.document.activeElement, newer); assert.equal(h.calls, 0);
    assert.equal(h.view.hasUncommittedWork(), false);
});

test('real shortcuts render retires an organizer waiting for its original read before mounting another', async () => {
    const h = model(), read = deferred(); h.read = read;
    const container = h.document.createElement('section'); container.id = 'shortcuts-container'; h.document.body.append(container); container.append(h.host);
    vm.runInContext(fs.readFileSync('newtab.js', 'utf8') + '\nthis.ShortcutsComponent = ShortcutsComponent;', h.context);
    const component = new h.context.ShortcutsComponent([], { autoArrange: true }, h.snapshot.categories);
    component.applyLayoutMode = () => {}; component.createModal = () => {};
    component.organizerView = h.view;
    const opening = h.view.open(); await tick();
    component.render();
    assert.notEqual(component.organizerView, h.view);
    assert.equal(h.document.querySelector('.organizer-overlay'), null, 'render must not leave the retired overlay on body');
    h.read = null; await component.organizerView.open();
    const freshSearch = h.document.querySelector('.organizer-search-input'); freshSearch.value = 'new query'; freshSearch.dispatch('input'); freshSearch.focus();
    read.resolve({ links: [], categories: [], state: {} }); await opening;
    assert.equal(h.document.querySelectorAll('.organizer-overlay').length, 1);
    assert.equal(h.document.querySelector('.organizer-search-input'), freshSearch);
    assert.equal(freshSearch.value, 'new query'); assert.equal(h.document.activeElement, freshSearch);
    assert.equal(h.calls, 0); component.organizerView.close();
});

function rejectable() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

for (const settle of ['resolve', 'reject']) test(`destroy during layout preparation stops a late ${settle} before any snapshot read`, async () => {
    const h = model(), flush = rejectable(); h.component.layoutController.flush = () => flush.promise;
    const opening = h.view.open(); assert.equal(h.reads, 0);
    assert.equal(h.view.destroy(), true);
    let replacementReads = 0; h.context.storageManager = { async readShortcutOrganizerSnapshot() { replacementReads++; return h.snapshot; } };
    const newer = h.document.createElement('button'); h.document.body.append(newer); newer.focus();
    settle === 'resolve' ? flush.resolve(true) : flush.reject(new Error('Late flush failure'));
    assert.equal(await opening, false); assert.equal(h.reads, 0); assert.equal(replacementReads, 0);
    assert.equal(h.document.querySelector('.organizer-overlay'), null); assert.equal(h.document.activeElement, newer);
    assert.equal(await h.view.open(), false); assert.equal(h.calls, 0);
});

test('a destroyed read rejection cannot paint an error or reopen via retained public open', async () => {
    const h = model(), read = rejectable(); h.read = read;
    const opening = h.view.open(); await tick(); h.view.destroy();
    read.reject(new Error('Late read failure')); assert.equal(await opening, false);
    assert.equal(await h.view.open(), false); assert.equal(h.document.querySelector('.organizer-overlay'), null);
    assert.equal(h.view.pending, false); assert.equal(h.view.hasUncommittedWork(), false); assert.equal(h.calls, 0);
});

for (const stage of ['flush', 'read']) test(`storage replacement during ${stage} retires preparation rather than showing the previous source`, async () => {
    const h = model(), pending = rejectable();
    if (stage === 'flush') h.component.layoutController.flush = () => pending.promise;
    else h.read = pending;
    const opening = h.view.open(); await tick();
    let replacementReads = 0; h.context.storageManager = { async readShortcutOrganizerSnapshot() { replacementReads++; return h.snapshot; } };
    pending.resolve(stage === 'flush' ? true : h.snapshot); assert.equal(await opening, false);
    assert.equal(replacementReads, 0); assert.equal(h.document.querySelector('.organizer-overlay'), null); assert.equal(h.calls, 0);
});

test('ordinary Cancel during preparation remains reusable and old flush cannot read into the new opening', async () => {
    const h = model(), flush = rejectable(); h.component.layoutController.flush = () => flush.promise;
    const old = h.view.open(); assert.equal(h.view.close(), true);
    h.component.layoutController.flush = async () => true;
    assert.equal(await h.view.open(), true); const search = h.document.querySelector('.organizer-search-input'); search.value = 'Twin'; search.dispatch('input'); search.focus();
    assert.equal(h.reads, 1); flush.resolve(true); assert.equal(await old, false);
    assert.equal(h.reads, 1); assert.equal(h.document.activeElement, search); assert.equal(search.value, 'Twin'); h.view.close();
});

for (const outcome of ['success', 'retryable']) test(`destroy cannot cancel a submitted write before ${outcome} settlement`, async () => {
    const h = model(), write = rejectable(); h.write = write; await h.review(); h.click('Move reviewed sites');
    const panel = h.document.querySelector('.organizer-panel');
    assert.equal(h.view.destroy(), false); assert.equal(h.view.close(), false);
    assert.equal(h.view.pending, true); assert.equal(h.document.querySelector('.organizer-panel'), panel); assert.equal(h.calls, 1);
    if (outcome === 'success') write.resolve();
    else write.reject(Object.assign(new Error('Synthetic write failure'), { code: 'ORGANIZER_FAILED' }));
    await tick(); assert.equal(h.view.pending, false);
    if (outcome === 'retryable') {
        assert.equal(h.button('Retry reviewed move').disabled, false);
        assert.equal(h.document.activeElement, h.button('Retry reviewed move'));
        assert.deepEqual(Array.from(h.request.indices), [1]);
    }
    assert.equal(h.view.destroy(), true); assert.equal(await h.view.open(), false); assert.equal(h.calls, 1);
});

for (const outcome of ['resolve', 'reject']) for (const stage of ['flush', 'read']) for (const change of ['workspace-object', 'workspace-id', 'workspace-generation', 'session-object', 'session-id', 'session-generation', 'layout-controller']) test(`${stage} ${outcome} preparation refuses changed ${change} within the same store and host`, async () => {
    const h = model(), pending = rejectable();
    h.context.storageManager.workspace = { id: 'original', generation: 1 };
    h.context.LocalItabWorkspaces = { session: { id: 'original', generation: 1 } };
    if (stage === 'flush') h.component.layoutController.flush = () => pending.promise;
    else h.read = pending;
    const opening = h.view.open(); await tick();
    const target = change.startsWith('workspace') ? h.context.storageManager.workspace : h.context.LocalItabWorkspaces.session;
    if (change === 'workspace-object') h.context.storageManager.workspace = { ...target };
    else if (change === 'session-object') h.context.LocalItabWorkspaces.session = { ...target };
    else if (change.endsWith('-id')) target.id = 'replacement';
    else if (change.endsWith('-generation')) target.generation++;
    else h.component.layoutController = { async flush() {} };
    const newer = h.document.createElement('button'); h.document.body.append(newer); newer.focus();
    if (outcome === 'resolve') pending.resolve(stage === 'flush' ? true : h.snapshot);
    else pending.reject(new Error('Late original-source failure'));
    assert.equal(await opening, false); assert.equal(h.reads, stage === 'flush' ? 0 : 1);
    assert.equal(h.document.querySelector('.organizer-overlay'), null); assert.equal(h.document.activeElement, newer); assert.equal(h.calls, 0);
});
