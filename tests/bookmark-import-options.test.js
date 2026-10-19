const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const StorageManager = require('../storage.js');
const {createDocument, deferred} = require('./helpers/task-dom-model.js');
const BookmarkImport = require('../shared/bookmark-import.js');
const Finder = require('../shared/shortcut-finder.js');
const {File} = require('node:buffer');
const source = fs.readFileSync('options.js', 'utf8');
const watchdog = setTimeout(() => { console.error('Bookmark options model did not settle.'); process.exit(1); }, 10000);
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
    const context = {document, window: {LocalItabBookmarkImport: BookmarkImport, addEventListener() {}, LocalItabContentLifecycle: {reload() { reloads++; }}}, chrome: global.chrome, navigator: global.navigator, crypto, storageManager: storage,
        console: {log() {}, warn() {}, error() {}}, URL, setTimeout(fn) { timers.set(++timer, fn); return timer; }, clearTimeout(id) { timers.delete(id); }, messages, confirm: () => true};
    vm.createContext(context);
    vm.runInContext(source + '\nshowMessage = (text, type) => messages.push({text, type}); displayStorageInfo = async () => {};', context);
    context.setupCategoryManagement(clone(baseline));
    context.initialConfig = clone(state);
    vm.runInContext("clockBaseline = copyClock(initialConfig.clock); clockFormInitialized = true; settingsFormConfig = initialConfig; settingsBaseline = storageManager.settingsSnapshot(initialConfig); settingsFormBaseline = collectFormData();", context);
    return {context, storage, document, clock, list, messages, timers, get reloads() { return reloads; }};
}

const html = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><DT><H3>Imported work</H3><DL><DT><A HREF="https://new.example/">New</A></DL></DL>';
async function bookmarkDepartureRegression() {
    // Reuse this file's form-initialized Options/StorageManager fixture. Unlike
    // its earlier tests, mount the real View and lifecycle, with actual Node
    // File reads and a gate inside Chrome local.set. No native prompt is modeled.
    reset(); const a = tab(), window = a.context.window, events = new Map(), rows = [], gates = [];
    const before = clone(state), local = global.chrome.storage.local, get = local.get, set = local.set;
    const io = {reads: 0, sets: 0};
    local.get = (...args) => { io.reads++; return get(...args); };
    local.set = (...args) => { io.sets++; return set(...args); };
    window.addEventListener = (type, fn) => { const list = events.get(type) || []; list.push(fn); events.set(type, list); };
    window.removeEventListener = (type, fn) => events.set(type, (events.get(type) || []).filter(handler => handler !== fn));
    window.confirm = a.context.confirm = () => assert.fail('departure events must not confirm or save');
    window.location = {reload() { assert.fail('departure events must not reload'); }};
    const host = a.document.createElement('div'); host.id = 'bookmark-import'; a.document.body.append(host);
    vm.runInContext(fs.readFileSync('shared/bookmark-import-view.js', 'utf8'), a.context);
    vm.runInContext(fs.readFileSync('shared/local-content-lifecycle.js', 'utf8'), a.context);
    a.context.setupBookmarkImport(); const view = window.bookmarkImportView; a.context.setupBookmarkImport();
    assert(view === window.bookmarkImportView); assert.equal(host.querySelectorAll('.bookmark-import').length, 1);
    assert.equal(events.get('beforeunload').length, 1);
    assert.equal(a.storage.getBookmarkImportSnapshot, StorageManager.prototype.getBookmarkImportSnapshot);
    assert.equal(a.storage.appendBookmarkImport, StorageManager.prototype.appendBookmarkImport);
    const lifecycle = window.LocalItabContentLifecycle, file = host.querySelector('.bookmark-import-file');
    const choose = host.querySelector('.bookmark-import-choose'), apply = host.querySelector('.bookmark-import-apply'), cancel = host.querySelector('.bookmark-import-cancel');
    file.click = () => assert.fail('regression must not open a file chooser');
    function select(gate, content = html) {
        const selected = new File([content], 'synthetic-bookmarks.html', {type: 'text/html', lastModified: 0});
        if (gate) { const read = selected.text.bind(selected); selected.text = async () => { gate.entered.resolve(); await gate.resume.promise; if (gate.error) throw gate.error; return read(); }; }
        choose.focus(); file.files = [selected]; file.dispatch('change'); return view.pending;
    }
    function gate() { const value = {entered: deferred(), resume: deferred()}; gates.push(value); return value; }
    function capture(stage, expected) {
        const raw = clone(state), calls = {...io}, writeCount = writes.length;
        const event = {prevented: false, preventDefault() { this.prevented = true; }};
        for (const listener of events.get('beforeunload')) listener(event);
        assert.deepEqual(state, raw); assert.deepEqual(io, calls); assert.equal(writes.length, writeCount);
        assert.equal(a.context.settingsHasUncommittedWork(), false, 'ordinary form cannot hide an omitted bookmark guard');
        rows.push({stage, expected, prevented: event.prevented, returnValueSet: Object.hasOwn(event, 'returnValue'),
            pending: lifecycle.pending(), hasWork: lifecycle.hasUncommittedWork(), departing: lifecycle.departing});
        if (event.prevented) assert.equal(event.returnValue, '');
    }
    try {
        capture('idle', false);
        const reading = gate(), readWork = select(reading); await reading.entered.promise;
        assert(view.pending && view.hasUncommittedWork() && lifecycle.pending()); capture('reading File.text', true);
        reading.resume.resolve(); await readWork;
        assert(!view.pending && view.hasUncommittedWork() && !apply.disabled); capture('review ready', true);
        lifecycle.allowDeparture(); assert.equal(lifecycle.departing, true); capture('explicit allowDeparture', false);
        lifecycle.cancelDeparture(); assert.equal(lifecycle.departing, false); capture('cancelDeparture restores review guard', true);
        cancel.dispatch('click'); assert.equal(view.hasUncommittedWork(), false); capture('review cancelled', false);
        assert.deepEqual(state, before); assert.equal(writes.length, 0);

        const obsolete = gate(), obsoleteWork = select(obsolete); await obsolete.entered.promise;
        cancel.dispatch('click'); capture('reading cancelled', false);
        obsolete.resume.resolve(); await obsoleteWork;
        assert.equal(view.hasUncommittedWork(), false); capture('cancelled read completed late', false);
        assert.deepEqual(state, before); assert.equal(writes.length, 0);

        const failedRead = gate(); failedRead.error = new Error('Synthetic local File.text failure');
        const failedReadCalls = {...io}, failedReadWork = select(failedRead); await failedRead.entered.promise;
        failedRead.resume.resolve(); await failedReadWork;
        assert.match(host.querySelector('.bookmark-import-status').textContent, /Could not read this local file/);
        assert(!view.pending && !view.hasUncommittedWork()); assert.equal(host.querySelector('.bookmark-import-preview').hidden, true);
        capture('file read failed without a review', false); assert.deepEqual(io, failedReadCalls);
        assert.deepEqual(state, before); assert.equal(writes.length, 0);
        await select(undefined, '<div>Synthetic non-bookmark document</div>');
        assert.match(host.querySelector('.bookmark-import-status').textContent, /could not be imported safely/);
        assert(!view.pending && !view.hasUncommittedWork()); assert.equal(host.querySelector('.bookmark-import-preview').hidden, true);
        capture('parsing failed without a review', false); assert.deepEqual(state, before); assert.equal(writes.length, 0);

        await select(); assert(view.hasUncommittedWork() && !apply.disabled);
        const saving = gate(); pauseWrite = saving; apply.dispatch('click'); const applying = view.pending;
        await saving.entered.promise;
        assert.equal(io.sets, 1, 'Apply really reached Chrome local.set'); assert.deepEqual(state, before); assert.equal(writes.length, 0);
        assert(view.pending && lifecycle.pending()); assert.equal(cancel.disabled, true); assert.equal(view.close(), false);
        capture('applying at Chrome local.set', true);
        saving.resume.resolve(); await applying;
        assert.match(host.querySelector('.bookmark-import-status').textContent, /^Bookmarks added: 1/);
        assert.equal(writes.length, 1); assert.equal(state.links.length, before.links.length + 1);
        assert.deepEqual(state.links.slice(0, before.links.length), before.links); capture('apply settled', false);
        console.log('Bookmark departure stages:', JSON.stringify(rows));
        for (const row of rows) {
            assert.equal(row.prevented, row.expected, row.stage + ' beforeunload protection');
            assert.equal(row.returnValueSet, row.expected, row.stage + ' native-warning request');
        }
    } finally {
        for (const value of gates) value.resume.resolve();
        if (view.pending) await view.pending;
        view.destroy(); local.get = get; local.set = set;
    }
}
(async () => {
    reset(); let a = tab(); const before = clone(state);
    let prepared = await a.context.prepareBookmarkImport(html);
    assert.equal(writes.length, 0, 'preview is read-only');
    assert.equal(prepared.plan.preview.addedBookmarks, 1);
    const result = await a.context.applyBookmarkImport(prepared);
    assert.equal(result.applied, true);
    assert.deepEqual(state.links.slice(0, before.links.length), before.links);
    assert.deepEqual(state.categories.slice(0, before.categories.length), before.categories);
    assert.deepEqual(clone(a.context.getCategoriesFromDOM()), state.categories);
    assert.equal(a.context.bookmarkCategoryFormClean(), true);
    const finder = new Finder.Controller({getSnapshot: () => state});
    const found = finder.search('Imported work');
    assert.equal(found.total, 1); assert.equal(found.rows[0].url, 'https://new.example/');
    assert.equal(finder.resolve(found.rows[0].token, clone(state.links), true).title, 'New');
    // A stale second Settings tab cannot remove the imported categories on unrelated Save.
    const stale = tab(); stale.clock.checked = true; await stale.context.saveAllSettings();
    assert.equal(state.categories.length, before.categories.length + 1);
    // Duplicate-only import is a no-write and keeps every field intact.
    const duplicate = await a.context.prepareBookmarkImport(html); const count = writes.length;
    const noOp = await a.context.applyBookmarkImport(duplicate);
    assert.equal(noOp.applied, false); assert.equal(writes.length, count);
    // Raw form edits must not disappear through category filtering or trimming.
    for (const kind of ['name', 'blank', 'icon']) {
        reset(); a = tab();
        const row = a.list.children[0];
        if (kind === 'name') row.querySelector('.cat-name').value = 'Unsaved';
        if (kind === 'blank') row.querySelector('.cat-name').value = '';
        if (kind === 'icon') row.querySelector('.cat-icon').value = ' 📁 ';
        await assert.rejects(a.context.prepareBookmarkImport(html), /category edits/);
        assert.equal(writes.length, 0);
    }
    // Successful normalized saves own their raw submitted form, not just its
    // canonical storage values. Saving whitespace/default icons must unblock import.
    for (const kind of ['name', 'icon', 'emptyIcon']) {
        reset(); a = tab(); const row = a.list.children[0];
        if (kind === 'name') row.querySelector('.cat-name').value = ' Work ';
        if (kind === 'icon') row.querySelector('.cat-icon').value = ' 📁 ';
        if (kind === 'emptyIcon') row.querySelector('.cat-icon').value = '';
        assert.equal(a.context.bookmarkCategoryFormClean(), false);
        await a.context.saveAllSettings();
        assert.equal(a.context.bookmarkCategoryFormClean(), true, kind + ' clean after successful save');
        const normalizedPreview = await a.context.prepareBookmarkImport(html);
        await a.context.applyBookmarkImport(normalizedPreview);
        assert.equal(state.categories[0].name, 'Work'); assert.equal(state.categories[0].icon, '📁');
        assert.equal(state.categories.length, baseline.length + 1);
    }
    // A pending normalized save owns only its submission, never later raw edits.
    reset(); a = tab(); a.list.children[0].querySelector('.cat-name').value = ' Work '; a.clock.checked = true;
    const normalizedEntered = deferred(), normalizedResume = deferred();
    pauseWrite = {entered: normalizedEntered, resume: normalizedResume};
    const normalizing = a.context.saveAllSettings(); await normalizedEntered.promise;
    a.list.children[0].querySelector('.cat-name').value = ' Newer work ';
    normalizedResume.resolve(); await normalizing;
    assert.equal(a.context.bookmarkCategoryFormClean(), false);
    await assert.rejects(a.context.prepareBookmarkImport(html), /category edits/);
    assert.equal(a.list.children[0].querySelector('.cat-name').value, ' Newer work ');
    await a.context.saveAllSettings();
    assert.equal(a.context.bookmarkCategoryFormClean(), true);
    assert.equal(state.categories[0].name, 'Newer work');
    reset(); a = tab(); prepared = await a.context.prepareBookmarkImport(html);
    a.list.children[0].querySelector('.cat-name').value = 'Newer input';
    await assert.rejects(a.context.applyBookmarkImport(prepared), /category edits/);
    assert.equal(writes.length, 0);
    // Input changed while a write is pending remains visible; old CAS baseline
    // prevents a future save from accidentally deleting imported categories.
    reset(); a = tab(); prepared = await a.context.prepareBookmarkImport(html);
    const entered = deferred(), resume = deferred(); pauseWrite = {entered, resume};
    const applying = a.context.applyBookmarkImport(prepared); await entered.promise;
    assert.equal(a.list.children[0].querySelector('.cat-name').disabled, true);
    a.list.children[0].querySelector('.cat-name').value = 'Programmatic newer input';
    await assert.rejects(a.context.applyBookmarkImport(prepared), /still running/);
    const pendingCount = writes.length; await a.context.saveAllSettings(); assert.equal(writes.length, pendingCount);
    resume.resolve(); await applying;
    assert.equal(a.list.children[0].querySelector('.cat-name').value, 'Programmatic newer input');
    const committed = clone(state.categories); await a.context.saveAllSettings();
    assert.deepEqual(state.categories, committed);
    assert.match(a.messages.at(-1).text, /Categories changed in another tab/);
    // An unrelated auto-save/manual Save during import runs after the owned
    // category refresh, retaining both the user's ordinary edit and new categories.
    reset(); a = tab(); prepared = await a.context.prepareBookmarkImport(html);
    const enteredSave = deferred(), resumeSave = deferred(); pauseWrite = {entered: enteredSave, resume: resumeSave};
    const importingWithSave = a.context.applyBookmarkImport(prepared); await enteredSave.promise;
    a.clock.checked = true;
    await a.context.saveAllSettings(); await a.context.saveAllSettings();
    assert.equal(writes.length, 0, 'ordinary writes remain deferred while import writes');
    resumeSave.resolve(); await importingWithSave;
    assert.equal(state.clock.hour12, true, 'deferred ordinary field edit persists');
    assert.equal(state.categories.length, baseline.length + 1);
    assert.equal(a.context.bookmarkCategoryFormClean(), true);
    // A queued preference change is observed at Apply, requiring a fresh preview.
    reset(); a = tab(); prepared = await a.context.prepareBookmarkImport(html);
    state.privacy.onlineFavicons = true;
    await assert.rejects(a.context.applyBookmarkImport(prepared)); assert.equal(writes.length, 0);
    // Storage rejection does not refresh the form or claim success.
    reset(); a = tab(); prepared = await a.context.prepareBookmarkImport(html); failWrite = true;
    await assert.rejects(a.context.applyBookmarkImport(prepared));
    assert.deepEqual(clone(a.context.getCategoriesFromDOM()), baseline);
    // A successful own category Save queued before preview is settled first.
    reset(); a = tab(); a.list.children[0].querySelector('.cat-name').value = 'Saved first';
    const saving = a.context.saveAllSettings(); prepared = await a.context.prepareBookmarkImport(html); await saving;
    assert.equal(prepared.snapshot.categories[0].name, 'Saved first');
    await a.context.applyBookmarkImport(prepared);
    assert.equal(state.categories[0].name, 'Saved first');
    await bookmarkDepartureRegression();
    // Source wiring leaves JSON backup UI untouched and loads parser before Storage.
    const page = fs.readFileSync('options.html', 'utf8');
    assert.match(page, /id="import-settings"[^>]*accept=".json"/);
    assert(page.indexOf('shared/bookmark-import.js') < page.indexOf('src="storage.js"'));
    assert(page.indexOf('shared/bookmark-import-view.js') < page.indexOf('src="options.js"'));
    assert.match(fs.readFileSync('shared/local-content-lifecycle.js', 'utf8'), /bookmarkImportView\?\.hasUncommittedWork/);
    console.log('Bookmark Options integration passed: additive, no-op, stale forms, raw edits, pending writes, preferences, failures and wiring.');
})().finally(() => clearTimeout(watchdog)).catch(error => { console.error(error); process.exitCode = 1; });
