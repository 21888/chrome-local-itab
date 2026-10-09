const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const StorageManager = require('../storage.js');
const {createDocument, deferred} = require('./helpers/task-dom-model.js');
const source = fs.readFileSync('options.js', 'utf8');
const watchdog = setTimeout(() => { console.error('Category conflict model did not settle.'); process.exit(1); }, 10000);
const clone = value => JSON.parse(JSON.stringify(value));
const baseline = [{id: 'work', name: 'Work', icon: '📁'}, {id: 'reading', name: 'Reading', icon: '📚'}];
let state, writes, failWrite, pauseWrite;
const queues = new Map();
const locks = {request(name, operation) {
    const result = (queues.get(name) || Promise.resolve()).then(operation);
    queues.set(name, result.catch(() => {})); return result;
}};
Object.defineProperty(global, 'navigator', {configurable: true, value: {locks}});
global.crypto = require('node:crypto').webcrypto;
global.chrome = {storage: {local: {
    async get(keys) { if (keys === null) return clone(state); return Object.fromEntries(keys.filter(key => key in state).map(key => [key, clone(state[key])])); },
    async set(values) {
        if (pauseWrite) { const gate = pauseWrite; pauseWrite = null; gate.entered.resolve(); await gate.resume.promise; }
        if (failWrite) throw new Error('storage unavailable');
        writes.push(clone(values)); Object.assign(state, clone(values));
    },
    async remove(keys) { for (const key of keys) delete state[key]; }
}}};
function reset() {
    state = {...new StorageManager().cloneDefaultConfig(), categories: clone(baseline), links: [{title: 'Saved reading', url: 'https://example.com/', icon: '🌐', category: 'reading'}]};
    writes = []; failWrite = false; pauseWrite = null;
}
function tab() {
    const document = createDocument();
    const list = document.createElement('ul'); list.id = 'category-manage-list';
    const add = document.createElement('button'); add.id = 'add-category';
    const clock = document.createElement('input'); clock.id = 'hour12-format'; clock.checked = false;
    document.body.append(list, add, clock);
    const storage = new StorageManager(); storage._syncInitialized = true;
    const messages = [], timers = new Map(); let timer = 0, reloads = 0;
    const context = {document, window: {addEventListener() {}, LocalItabContentLifecycle: {reload() { reloads++; }}}, chrome: global.chrome, navigator: global.navigator, crypto, storageManager: storage,
        console: {log() {}, warn() {}, error() {}}, URL, setTimeout(fn) { timers.set(++timer, fn); return timer; }, clearTimeout(id) { timers.delete(id); }, messages, confirm: () => true};
    vm.createContext(context);
    vm.runInContext(source + '\nshowMessage = (text, type) => messages.push({text, type}); displayStorageInfo = async () => {};', context);
    context.setupCategoryManagement(clone(baseline));
    context.initialConfig = clone(state);
    vm.runInContext("clockBaseline = copyClock(initialConfig.clock); clockFormInitialized = true; settingsFormConfig = initialConfig; settingsBaseline = storageManager.settingsSnapshot(initialConfig); settingsFormBaseline = collectFormData();", context);
    return {context, storage, document, clock, list, messages, timers, get reloads() { return reloads; }};
}
function edit(t, mutation) {
    if (mutation === 'add') t.document.getElementById('add-category').dispatch('click');
    if (mutation === 'rename') t.list.children[0].querySelector('.cat-name').value = 'Projects';
    if (mutation === 'delete') t.list.children[1].remove();
}
(async () => {
    for (const mutation of ['add', 'rename', 'delete']) {
        reset();
        const identity = 'l_' + 'a'.repeat(32);
        state.links[0].layoutId = identity;
        state.layout = {...state.layout, identityVersion: 1, positions: {'reading|https://example.com/': {x: 20, y: 40}},
            positionsById: {[identity]: {all: {x: 17.5, y: -3}, reading: {x: 99, y: 7}}}};
        const a = tab(), b = tab(); const links = clone(state.links), layout = clone(state.layout);
        edit(b, mutation); await b.context.saveAllSettings(); const afterB = clone(state.categories);
        assert.notDeepEqual(afterB, baseline);
        a.clock.checked = true; await a.context.saveAllSettings();
        assert.deepEqual(state.categories, afterB, `untouched stale categories survive ${mutation}`);
        assert.equal(state.clock.hour12, true); assert.equal('categories' in writes.at(-1), false);
        assert.deepEqual(state.links, links); assert.deepEqual(state.layout, layout);
        assert.equal(a.messages.at(-1).text, 'Settings saved.');
        edit(a, 'rename'); const dirty = clone(a.context.getCategoriesFromDOM()); const count = writes.length;
        await a.context.saveAllSettings(); await a.context.saveAllSettings();
        assert.equal(writes.length, count, 'conflicts reject the entire write, including repeated saves');
        assert.deepEqual(state.categories, afterB); assert.deepEqual(clone(a.context.getCategoriesFromDOM()), dirty);
        assert.match(a.messages.at(-1).text, /Categories changed in another tab/);
    }
    reset(); const a = tab(); edit(a, 'rename'); failWrite = true;
    await a.context.saveAllSettings(); assert.deepEqual(state.categories, baseline);
    failWrite = false; await a.context.saveAllSettings(); assert.equal(state.categories[0].name, 'Projects');
    assert.equal(a.messages.at(-1).text, 'Settings saved.');
    a.list.children[0].querySelector('.cat-name').value = 'Next';
    const entered = deferred(), resume = deferred(); pauseWrite = {entered, resume};
    const first = a.context.saveAllSettings(); await entered.promise;
    a.list.children[0].querySelector('.cat-name').value = 'Newest';
    const second = a.context.saveAllSettings(); resume.resolve(); await Promise.all([first, second]);
    assert.equal(state.categories[0].name, 'Newest');
    assert.equal(a.list.children[0].querySelector('.cat-name').value, 'Newest');
    // A successful own write advances only its baseline, never the newer input.
    const entered2 = deferred(), resume2 = deferred(); pauseWrite = {entered: entered2, resume: resume2};
    a.list.children[0].querySelector('.cat-name').value = 'Submitted';
    const pending = a.context.saveAllSettings(); await entered2.promise;
    a.list.children[0].querySelector('.cat-name').value = 'Unsaved'; resume2.resolve(); await pending;
    assert.equal(state.categories[0].name, 'Submitted'); assert.equal(a.list.children[0].querySelector('.cat-name').value, 'Unsaved');
    await a.context.saveAllSettings(); assert.equal(state.categories[0].name, 'Unsaved');
    // Reset invalidates pending saves before clearing, with no stale success/rewrite.
    const entered3 = deferred(), resume3 = deferred(); pauseWrite = {entered: entered3, resume: resume3};
    a.list.children[0].querySelector('.cat-name').value = 'Before reset';
    const saving = a.context.saveAllSettings(); await entered3.promise;
    const resetting = a.context.resetAllSettings(); const ignored = a.context.saveAllSettings();
    resume3.resolve(); await Promise.all([saving, resetting, ignored]);
    assert.equal(state.categories, undefined); assert.equal(a.reloads, 1);
    await a.context.saveAllSettings(); assert.equal(state.categories, undefined);
    // A committed own save remains the baseline if the subsequent reset fails.
    reset(); const interrupted = tab(); edit(interrupted, 'rename');
    const committedEntered = deferred(), committedResume = deferred(); pauseWrite = {entered: committedEntered, resume: committedResume};
    const ownSave = interrupted.context.saveAllSettings(); await committedEntered.promise;
    const originalSet = chrome.storage.local.set;
    chrome.storage.local.set = async values => {
        if (interrupted.storage.settingsGenerationKey in values && interrupted.storage.layoutGenerationKey in values) throw new Error('reset unavailable');
        return originalSet(values);
    };
    const failedReset = interrupted.context.resetAllSettings(); committedResume.resolve(); await Promise.all([ownSave, failedReset]);
    chrome.storage.local.set = originalSet;
    assert.equal(state.categories[0].name, 'Projects');
    interrupted.list.children[0].querySelector('.cat-name').value = 'After failed reset';
    await interrupted.context.saveAllSettings(); assert.equal(state.categories[0].name, 'After failed reset');
    // Failed and cancelled replacements leave category edits available for retry.
    reset(); const b = tab(); edit(b, 'rename'); failWrite = true;
    await b.context.resetAllSettings(); failWrite = false;
    await b.context.saveAllSettings(); assert.equal(state.categories[0].name, 'Projects');
    b.context.confirm = () => false;
    vm.runInContext('showImportExportFeedback = () => {};', b.context);
    await b.context.importSettings({name: 'backup.json', size: 10, text: async () => JSON.stringify({links: [], categories: baseline})});
    b.list.children[0].querySelector('.cat-name').value = 'After cancellation';
    await b.context.saveAllSettings(); assert.equal(state.categories[0].name, 'After cancellation');
    // Import takes ownership after confirmation; pending/in-flight saves cannot
    // restore the old form during its delayed reload window.
    reset(); const importing = tab(); edit(importing, 'rename');
    const importFeedback = [];
    importing.context.showImportExportFeedback = (...args) => importFeedback.push(args);
    const importEntered = deferred(), importResume = deferred(); pauseWrite = {entered: importEntered, resume: importResume};
    const oldSave = importing.context.saveAllSettings(); await importEntered.promise;
    const importedCategories = [{id: 'restored', name: 'Restored', icon: '📁'}];
    const confirmedImport = deferred();
    importing.context.confirm = () => { confirmedImport.resolve(); return true; };
    const importOperation = importing.context.importSettings({name: 'backup.json', size: 10, text: async () => JSON.stringify({links: [], categories: importedCategories})});
    await confirmedImport.promise;
    importResume.resolve(); await Promise.all([oldSave, importOperation]);
    assert.deepEqual(state.categories, importedCategories); assert.equal(importFeedback.at(-1)[1], 'success');
    await importing.context.saveAllSettings(); assert.deepEqual(state.categories, importedCategories);
    // A failed import does not advance the local category baseline.
    reset(); const failedImport = tab(); edit(failedImport, 'rename');
    failedImport.context.showImportExportFeedback = () => {};
    failWrite = true;
    await failedImport.context.importSettings({name: 'backup.json', size: 10, text: async () => JSON.stringify({links: [], categories: importedCategories})});
    failWrite = false; await failedImport.context.saveAllSettings();
    assert.equal(state.categories[0].name, 'Projects');
    // A failed locked read cannot turn a missing baseline into a replacement.
    reset(); const failedRead = tab(); edit(failedRead, 'rename');
    const originalGet = chrome.storage.local.get;
    chrome.storage.local.get = async keys => { if (keys === null) throw new Error('read unavailable'); return originalGet(keys); };
    await failedRead.context.saveAllSettings(); assert.equal(writes.length, 0); assert.deepEqual(state.categories, baseline);
    chrome.storage.local.get = originalGet;
    await failedRead.context.saveAllSettings(); assert.equal(state.categories[0].name, 'Projects');
    // All guarded category entry points share the lock and report conflicts.
    reset(); const direct = new StorageManager(); direct._syncInitialized = true;
    await direct.set('categories', importedCategories);
    await assert.rejects(direct.set('categories', baseline, {expectedCategories: baseline}), {code: 'CATEGORIES_CONFLICT'});
    await assert.rejects(direct.setAll({categories: baseline}, {expectedCategories: baseline}), {code: 'CATEGORIES_CONFLICT'});
    assert.deepEqual(state.categories, importedCategories);
    // Display normalization must never authorize losing malformed stored records.
    for (const damaged of [
        [...baseline, {id: 'damaged', name: '', icon: '📁'}],
        [...baseline, {name: 'Missing ID', icon: '📁'}],
        [...baseline, {...baseline[0]}],
        [...baseline, {id: 'x', name: 'Extra', icon: '📁', custom: 'keep'}],
        [...baseline, {id: 'x', name: ' Extra ', icon: '📁'}],
        [...baseline, {id: 'x', name: 'No icon'}],
        null, {}, [null]
    ]) {
        reset(); const damagedTab = tab(); edit(damagedTab, 'rename'); state.categories = clone(damaged);
        await damagedTab.context.saveAllSettings();
        assert.equal(writes.length, 0); assert.deepEqual(state.categories, damaged);
        assert.equal(damagedTab.list.children[0].querySelector('.cat-name').value, 'Projects');
        assert.match(damagedTab.messages.at(-1).text, /Categories could not be safely compared|Failed to save settings/);
    }
    reset();
    await assert.rejects(direct.setAll({categories: baseline}, {expectedCategories: [...baseline, baseline[0]]}), {code: 'CATEGORIES_CONFLICT'});
    assert.equal(writes.length, 0);
    // CAS fails closed without cross-tab lock support.
    reset(); const c = tab(); edit(c, 'rename'); delete global.navigator.locks;
    await c.context.saveAllSettings(); assert.deepEqual(state.categories, baseline); assert.equal(writes.length, 0);
    global.navigator.locks = locks;
    console.log('category save conflict tests ok (actual Options + Storage, shared two-tab DOM model)');
})().then(() => clearTimeout(watchdog), error => { clearTimeout(watchdog); console.error(error); process.exitCode = 1; });
