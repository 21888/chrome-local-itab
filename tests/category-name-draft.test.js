const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const StorageManager = require('../storage.js');
const {createDocument, deferred} = require('./helpers/task-dom-model');

// Production Options, StorageManager and departure protection, with synthetic
// DOM/events, timers, Chrome storage and serialized Web Locks. No native browser,
// OS input method, screen-reader or browser-dialog behavior is exercised here.
const optionsSource = fs.readFileSync('options.js', 'utf8');
const lifecycleSource = fs.readFileSync('shared/local-content-lifecycle.js', 'utf8');
const catalogs = Object.fromEntries(['en', 'zh_CN'].map(locale =>
    [locale, JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'))]));
const clone = value => JSON.parse(JSON.stringify(value));
const baseline = [{id: 'work', name: 'Work', icon: '📁'}, {id: 'reading', name: 'Reading', icon: '📚'}];
function fixture(schema = 2) {
    const identity = 'l_' + 'a'.repeat(32);
    const state = {...new StorageManager().cloneDefaultConfig(), schemaVersion: schema, categories: clone(baseline),
        links: [{title: 'Synthetic related shortcut', url: 'https://example.com/work', icon: '🌐', category: 'work'}],
        __localItabPersonalTasksV1: {synthetic: 'private content sentinel'},
        __localItabIdentityRecovery: {synthetic: 'original recovery sentinel'},
        __localItabRestoreRecovery: {synthetic: 'restore recovery sentinel', previousRecovery: {synthetic: 'older sentinel'}}};
    state.layout = {...state.layout, positions: {'work|https://example.com/work': {x: 17, y: 29}}};
    if (schema === 2) {
        state.links[0].layoutId = identity;
        state.layout.identityVersion = 1;
        state.layout.positionsById = {[identity]: {all: {x: 9, y: 15}, work: {x: 21, y: 30}}};
    }
    const writes = [], queues = new Map(); let writeGate = null, failWrite = false;
    const locks = {request(name, operation) {
        const result = (queues.get(name) || Promise.resolve()).then(operation);
        queues.set(name, result.catch(() => {})); return result;
    }};
    Object.defineProperty(global, 'navigator', {configurable: true, value: {locks}});
    global.crypto = require('node:crypto').webcrypto;
    global.chrome = {storage: {local: {
        async get(keys) { return clone(keys === null ? state : Object.fromEntries(keys.filter(key => key in state).map(key => [key, state[key]]))); },
        async set(values) {
            if (writeGate) { const gate = writeGate; writeGate = null; gate.entered.resolve(); await gate.resume.promise; }
            if (failWrite) throw new Error('Synthetic write failure');
            writes.push(clone(values)); Object.assign(state, clone(values));
        }
    }}};
    async function page(locale = 'en') {
        const document = createDocument(); document.body.prepend = (...nodes) => document.body.append(...nodes);
        for (const [tag, id] of [['ul', 'category-manage-list'], ['button', 'add-category'], ['input', 'quote-text'],
            ['input', 'hour12-format'], ['input', 'show-seconds'], ['input', 'bg-type'], ['input', 'bg-color'], ['input', 'bg-color-text']]) {
            const node = document.createElement(tag); node.id = id; document.body.append(node);
        }
        const storage = new StorageManager(); storage._syncInitialized = true;
        const timers = new Map(), messages = [], windowEvents = new Map(); let timerId = 0, reloads = 0;
        const i18n = {t: key => catalogs[locale][key]?.message || key};
        const window = {document, i18n, addEventListener(type, fn) { windowEvents.set(type, fn); },
            location: {reload() { reloads++; }}, confirm: () => false};
        const context = vm.createContext({document, window, i18n, storageManager: storage,
            chrome: global.chrome, navigator: global.navigator, crypto, URL, console: {log() {}, warn() {}, error() {}},
            setTimeout(fn, delay) { const id = ++timerId; timers.set(id, {fn, delay}); return id; },
            clearTimeout(id) { timers.delete(id); }, messages});
        vm.runInContext(optionsSource + '\nshowMessage = (text, type) => messages.push({text, type}); displayStorageInfo = async () => {};', context);
        const config = await storage.getAll();
        await context.populateFormFields(config); context.setupCategoryManagement(config.categories);
        vm.runInContext(lifecycleSource, context);
        const list = document.getElementById('category-manage-list');
        return {context, document, window, messages, timers, list, storage,
            input(index = 0) { return list.children[index].querySelector('.cat-name'); },
            field: id => document.getElementById(id),
            async autosave() {
                for (const [id, timer] of [...timers]) if (timer.delay === 800) { timers.delete(id); timer.fn(); }
                await vm.runInContext('settingsSaveQueue', context); await Promise.resolve();
            },
            save: () => context.saveAllSettings(),
            beforeunload() { const event = {prevented: false, preventDefault() { this.prevented = true; }}; windowEvents.get('beforeunload')(event); return event; },
            get reloads() { return reloads; }};
    }
    return {page, writes, state: () => clone(state), fail(value) { failWrite = value; },
        patch(values) { Object.assign(state, clone(values)); },
        pause() { writeGate = {entered: deferred(), resume: deferred()}; return writeGate; }};
}
function edit(page, value, index = 0) { const input = page.input(index); input.focus(); input.value = value; input.dispatch('input'); return input; }
function protectedDraft(page) {
    assert(page.context.settingsHasUncommittedWork()); assert(page.window.LocalItabContentLifecycle.hasUncommittedWork());
    assert(page.beforeunload().prevented); assert.equal(page.window.LocalItabContentLifecycle.reload(), false); assert.equal(page.reloads, 0);
}
function failure(page, locale = 'en') {
    assert.equal(page.messages.at(-1).type, 'error');
    assert.match(page.messages.at(-1).text, locale === 'en' ? /name.*categor|categor.*name/i : /分类.*名称/);
}
function preservedContent(after, before) {
    for (const key of ['links', 'layout', '__localItabPersonalTasksV1', '__localItabIdentityRecovery', '__localItabRestoreRecovery']) {
        assert.deepEqual(after[key], before[key], key);
    }
}
const bounded = (name, fn) => test(name, {timeout: 8000}, fn);
for (const schema of [1, 2]) for (const locale of ['en', 'zh_CN']) for (const empty of ['', ' \t ', '\u00a0']) {
    bounded(`schema ${schema}/${locale}: empty ${JSON.stringify(empty)} rename autosave keeps the category and draft`, async () => {
        const f = fixture(schema), p = await f.page(locale), before = f.state();
        const input = edit(p, empty); await p.autosave();
        assert.deepEqual(f.state(), before, 'no classification, shortcut, layout, recovery or private data may be written');
        assert.equal(f.writes.length, 0); assert.equal(p.input(), input); assert.equal(input.value, empty);
        assert.equal(p.document.activeElement, input); failure(p, locale); protectedDraft(p);
        await p.save(); await p.save(); assert.equal(f.writes.length, 0); failure(p, locale); protectedDraft(p);
    });
}
bounded('empty new category is still an unfinished draft rather than a successful omitted row', async () => {
    const f = fixture(), p = await f.page(); p.field('add-category').dispatch('click');
    const input = edit(p, '', 2); await p.autosave();
    assert.equal(f.writes.length, 0); assert.equal(p.list.children.length, 3); assert.equal(p.input(2), input);
    failure(p); protectedDraft(p);
});
bounded('ordinary Save holds all edited fields until the category name is complete', async () => {
    const f = fixture(), p = await f.page(), before = f.state();
    p.field('quote-text').value = 'Keep this quote draft'; p.field('hour12-format').checked = !before.clock.hour12;
    const input = edit(p, ''); await p.save();
    assert.deepEqual(f.state(), before); assert.equal(f.writes.length, 0); failure(p); protectedDraft(p);
    assert.equal(p.field('quote-text').value, 'Keep this quote draft'); assert.equal(p.field('hour12-format').checked, !before.clock.hour12);
    input.value = '  Projects  '; input.dispatch('input'); await p.autosave();
    assert.equal(f.state().categories[0].name, 'Projects'); assert.equal(f.state().quote, 'Keep this quote draft');
    assert.equal(f.state().clock.hour12, !before.clock.hour12); preservedContent(f.state(), before);
    assert.equal(input.value, '  Projects  '); assert.equal(p.document.activeElement, input);
    assert.equal(p.messages.at(-1).type, 'success'); assert(!p.context.settingsHasUncommittedWork()); assert(!p.beforeunload().prevented);
});
bounded('explicit Delete of the empty row retains ordinary deletion and related shortcuts', async () => {
    const f = fixture(), p = await f.page(), before = f.state();
    edit(p, ''); await p.autosave(); failure(p);
    p.field('quote-text').value = 'Saved with explicit deletion';
    p.list.children[0].querySelector('.cat-delete').dispatch('click'); await p.autosave();
    assert.deepEqual(f.state().categories, [baseline[1]]); preservedContent(f.state(), before);
    assert.equal(f.state().links[0].category, 'work'); assert.equal(f.state().quote, 'Saved with explicit deletion');
    assert.equal(p.messages.at(-1).type, 'success'); assert(!p.context.settingsHasUncommittedWork());
});
bounded('an older successful save cannot acknowledge a later empty name as clean', async () => {
    const f = fixture(), p = await f.page(); edit(p, 'Submitted');
    const gate = f.pause(), saving = p.autosave(); await gate.entered.promise;
    const input = edit(p, ''); gate.resume.resolve(); await saving;
    assert.equal(f.state().categories[0].name, 'Submitted'); assert.equal(input.value, ''); protectedDraft(p);
    const committed = f.state(), count = f.writes.length; await p.autosave();
    assert.deepEqual(f.state(), committed); assert.equal(f.writes.length, count); failure(p); protectedDraft(p);
});
bounded('queued invalid submission stays invalid while a later complete submission uses the original CAS chain', async () => {
    const f = fixture(), p = await f.page(); edit(p, 'First');
    const gate = f.pause(), first = p.save(); await gate.entered.promise;
    edit(p, ''); const invalid = p.save(); edit(p, 'Latest'); const latest = p.save();
    gate.resume.resolve(); await Promise.all([first, invalid, latest]);
    assert.deepEqual(f.writes.filter(value => value.categories).map(value => value.categories[0].name), ['First', 'Latest']);
    assert.equal(f.state().categories[0].name, 'Latest'); assert.equal(p.input().value, 'Latest');
    assert(p.messages.some(message => message.type === 'error' && /name.*categor|categor.*name/i.test(message.text)));
    assert.equal(p.messages.at(-1).type, 'success'); assert(!p.context.settingsHasUncommittedWork());
});
for (const mutation of ['add', 'rename', 'delete']) bounded(`an invalid draft does not advance the baseline after another tab's ${mutation}`, async () => {
    const f = fixture(), a = await f.page(), b = await f.page();
    if (mutation === 'add') b.field('add-category').dispatch('click');
    if (mutation === 'rename') edit(b, 'Remote work');
    if (mutation === 'delete') b.list.children[1].querySelector('.cat-delete').dispatch('click');
    await b.save(); const remote = f.state(), count = f.writes.length;
    edit(a, ''); await a.autosave(); assert.deepEqual(f.state(), remote); assert.equal(f.writes.length, count); failure(a);
    edit(a, 'Local draft'); await a.save(); await a.save();
    assert.deepEqual(f.state(), remote); assert.equal(f.writes.length, count); assert.equal(a.input().value, 'Local draft');
    assert.match(a.messages.at(-1).text, /Categories changed in another tab/); protectedDraft(a);
});
bounded('failed valid writes retain the old baseline across an intervening empty-name draft', async () => {
    const f = fixture(), p = await f.page(), before = f.state(); edit(p, 'First attempt'); f.fail(true); await p.save();
    assert.deepEqual(f.state(), before); assert.equal(p.messages.at(-1).type, 'error'); protectedDraft(p);
    f.fail(false); edit(p, ''); await p.autosave(); failure(p); assert.deepEqual(f.state(), before);
    edit(p, 'Retry'); await p.save(); assert.equal(f.state().categories[0].name, 'Retry');
    preservedContent(f.state(), before); assert(!p.context.settingsHasUncommittedWork());
});
bounded('an untouched stale form still omits categories and saves unrelated fields', async () => {
    const f = fixture(), a = await f.page(), b = await f.page(); edit(b, 'Remote'); await b.save();
    a.field('quote-text').value = 'Independent quote'; await a.save();
    assert.equal(f.state().categories[0].name, 'Remote'); assert.equal(f.state().quote, 'Independent quote');
    assert(!Object.hasOwn(f.writes.at(-1), 'categories')); assert.equal(a.messages.at(-1).type, 'success');
});
bounded('dedicated background saving does not adopt or discard the unfinished category', async () => {
    const f = fixture(), p = await f.page(), before = f.state(); edit(p, '');
    p.field('bg-type').value = 'color'; p.field('bg-color').value = '#123456'; p.field('bg-color-text').value = '#123456';
    await p.context.saveBackgroundSettings();
    assert.equal(f.state().bg.value, '#123456'); assert.deepEqual(f.state().categories, before.categories);
    assert.equal(p.input().value, ''); preservedContent(f.state(), before); protectedDraft(p);
    const saved = f.state(); await p.save(); assert.deepEqual(f.state(), saved); failure(p); protectedDraft(p);
});
bounded('empty icon remains a supported fallback and a complete trimmed name remains saveable', async () => {
    const f = fixture(), p = await f.page();
    p.list.children[0].querySelector('.cat-icon').value = ''; edit(p, '  Renamed  '); await p.autosave();
    assert.deepEqual(f.state().categories[0], {id: 'work', name: 'Renamed', icon: '📁'});
    assert.equal(p.input().value, '  Renamed  '); assert.equal(p.messages.at(-1).type, 'success');
    assert(!p.context.settingsHasUncommittedWork());
});
bounded('hidden category panel and lifecycle Save still preserve the unfinished name', async () => {
    const f = fixture(), p = await f.page(); edit(p, ''); p.list.hidden = true;
    assert.equal(await p.window.LocalItabContentLifecycle.saveDrafts(), false);
    assert.equal(f.writes.length, 0); failure(p); protectedDraft(p); assert.equal(p.input().value, '');
});
bounded('explicitly deleting every row still permits an empty category list', async () => {
    const f = fixture(), p = await f.page(), before = f.state();
    while (p.list.children.length) p.list.children[0].querySelector('.cat-delete').dispatch('click');
    await p.autosave(); assert.deepEqual(f.state().categories, []); preservedContent(f.state(), before);
    assert.equal(p.messages.at(-1).type, 'success'); assert(!p.context.settingsHasUncommittedWork());
});
bounded('an initially empty category list does not block unrelated Settings saving', async () => {
    const f = fixture(); f.patch({categories: []}); const p = await f.page();
    p.field('quote-text').value = 'Still empty'; await p.save();
    assert.deepEqual(f.state().categories, []); assert.equal(f.state().quote, 'Still empty');
    assert.equal(p.messages.at(-1).type, 'success'); assert(!p.context.settingsHasUncommittedWork());
});
bounded('non-trimmed zero-width category names keep their established validation behavior', async () => {
    const f = fixture(), p = await f.page(); edit(p, '\u200b'); await p.autosave();
    assert.equal(f.state().categories[0].name, '\u200b'); assert.equal(p.messages.at(-1).type, 'success');
    assert(!p.context.settingsHasUncommittedWork());
});
