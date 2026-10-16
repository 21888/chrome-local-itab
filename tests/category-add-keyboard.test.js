const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const StorageManager = require('../storage.js');
const {createDocument, deferred} = require('./helpers/task-dom-model');

const source = fs.readFileSync('options.js', 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const baseline = [{id: 'work', name: 'Work', icon: '📁'}, {id: 'reading', name: 'Reading', icon: '📚'}];
async function fixture(locale = 'en', consumeKey = () => false) {
    const state = {...new StorageManager().cloneDefaultConfig(), categories: clone(baseline),
        links: [{title: 'Synthetic work', url: 'https://example.com/work', category: 'work', icon: '🌐'}],
        __localItabPersonalTasksV1: {synthetic: 'unchanged task sentinel'},
        __localItabRestoreRecovery: {synthetic: 'unchanged recovery sentinel'}};
    const writes = [], queues = new Map(); let gate = null;
    const locks = {request(name, fn) {
        const result = (queues.get(name) || Promise.resolve()).then(fn);
        queues.set(name, result.catch(() => {})); return result;
    }};
    Object.defineProperty(global, 'navigator', {configurable: true, value: {locks}});
    global.crypto = require('node:crypto').webcrypto;
    global.chrome = {storage: {local: {
        async get(keys) { return clone(keys === null ? state : Object.fromEntries(keys.filter(key => key in state).map(key => [key, state[key]]))); },
        async set(values) {
            if (gate) { const pending = gate; gate = null; pending.entered.resolve(); await pending.resume.promise; }
            writes.push(clone(values)); Object.assign(state, clone(values));
        }
    }}};
    const document = createDocument(); document.body.prepend = (...nodes) => document.body.append(...nodes);
    for (const [tag, id] of [['ul', 'category-manage-list'], ['button', 'add-category'], ['input', 'quote-text'],
        ['input', 'hour12-format'], ['input', 'show-seconds']]) {
        const node = document.createElement(tag); node.id = id;
        if (tag === 'button') node.type = 'button';
        document.body.append(node);
    }
    const add = document.getElementById('add-category'), list = document.getElementById('category-manage-list');
    add.addEventListener('keydown', event => { if (consumeKey(event)) event.preventDefault(); });
    const storage = new StorageManager(); storage._syncInitialized = true;
    const timers = new Map(), messages = []; let timer = 0, clock = 1800000000000;
    const catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const window = {addEventListener() {}, i18n: {t: key => catalog[key]?.message || key}};
    const context = vm.createContext({document, window, i18n: window.i18n, storageManager: storage, chrome, navigator, crypto, URL,
        Date: class extends Date { static now() { return clock += 50; } }, messages,
        console: {log() {}, warn() {}, error() {}},
        setTimeout(fn, delay) { timers.set(++timer, {fn, delay}); return timer; }, clearTimeout(id) { timers.delete(id); }});
    vm.runInContext(source + '\nshowMessage = (text, type) => messages.push({text, type}); displayStorageInfo = async () => {};', context);
    await context.populateFormFields(await storage.getAll()); context.setupCategoryManagement(state.categories);

    // Explicit default-action model, not browser execution. Chromium's button
    // delegates to HandleKeyboardActivation: Enter keypress dispatches click;
    // uncancelled Space keydown arms a click for keyup. A cancelled keydown
    // suppresses its keypress/default. See the primary sources in the record.
    // Spacebar is tested only as the app's existing compatibility alias.
    let armedSpace = null;
    const cancelled = event => event.prevented || event.defaultPrevented;
    const button = target => target?.tagName === 'BUTTON' && target.type === 'button' && !target.disabled && target.isConnected;
    function down(key, fields = {}) {
        const target = document.activeElement, event = target.dispatch('keydown', {key, ...fields});
        if (!cancelled(event) && button(target)) {
            if (key === 'Enter') {
                const press = target.dispatch('keypress', {key, charCode: 13, ...fields});
                if (!cancelled(press)) target.dispatch('click');
            } else if (key === ' ' || key === 'Spacebar') armedSpace = target;
        }
        return event;
    }
    function up(key, fields = {}) {
        const target = document.activeElement, event = target.dispatch('keyup', {key, ...fields});
        if (key === ' ' || key === 'Spacebar') {
            if (!cancelled(event) && armedSpace === target && button(target)) target.dispatch('click');
            armedSpace = null;
        }
        return event;
    }
    return {context, document, add, list, timers, messages, writes, down, up,
        state: () => clone(state),
        pause() { gate = {entered: deferred(), resume: deferred()}; return gate; },
        async autosave() {
            for (const [id, entry] of [...timers]) if (entry.delay === 800) { timers.delete(id); entry.fn(); }
            await vm.runInContext('settingsSaveQueue', context); await Promise.resolve();
        }};
}
const bounded = (name, fn) => test(name, {timeout: 8000}, fn);
const autosaves = page => [...page.timers.values()].filter(timer => timer.delay === 800).length;
function untouchedContent(after, before) {
    for (const key of ['links', 'layout', '__localItabPersonalTasksV1', '__localItabRestoreRecovery']) assert.deepEqual(after[key], before[key], key);
}

bounded('category Add: held Enter appends and autosaves exactly one row while Add retains focus', async () => {
    const p = await fixture(), before = p.state(); p.add.focus();
    assert(!p.down('Enter').prevented);
    for (let repeat = 0; repeat < 3; repeat++) p.down('Enter', {repeat: true});
    p.up('Enter');
    const renderedRows = p.list.children.length;
    assert.equal(p.document.activeElement, p.add); assert(!p.add.disabled);
    assert.equal(p.writes.length, 0); assert.equal(autosaves(p), 1); assert(p.context.settingsHasUncommittedWork());
    await p.autosave();
    assert.deepEqual({renderedRows, savedRows: p.state().categories.length, writes: p.writes.length},
        {renderedRows: 3, savedRows: 3, writes: 1}, 'a held key adds and saves one row, not four');
    assert.deepEqual(p.state().categories.slice(0, 2), baseline); untouchedContent(p.state(), before);
    assert.equal(p.messages.at(-1).type, 'success'); assert(!p.context.settingsHasUncommittedWork());
    assert.equal(p.document.activeElement, p.add);
});

for (const fields of [{repeat: true}, {isComposing: true}, {keyCode: 229}]) bounded(`category Add: activation key ownership ${JSON.stringify(fields)} leaves the saved list untouched`, async () => {
    for (const key of ['Enter', ' ', 'Spacebar']) {
        const p = await fixture(), before = p.state(); p.add.focus();
        assert(p.down(key, fields).prevented, `${key}: unwanted button activation is cancelled`); p.up(key);
        assert.equal(p.list.children.length, 2); assert.equal(p.document.activeElement, p.add);
        assert.equal(autosaves(p), 0); await p.autosave(); assert.equal(p.writes.length, 0);
        assert.deepEqual(p.state(), before); assert.equal(p.messages.length, 0); assert(!p.context.settingsHasUncommittedWork());
    }
});

bounded('category Add: already consumed activation keys never acquire a second Add action', async () => {
    for (const key of ['Enter', ' ', 'Spacebar']) {
        let consumed = true;
        const p = await fixture('en', () => consumed); p.add.focus();
        assert(p.down(key).prevented); p.up(key);
        assert.equal(p.list.children.length, 2); assert.equal(autosaves(p), 0);
        consumed = false; assert(!p.down(key).prevented); p.up(key);
        assert.equal(p.list.children.length, 3); await p.autosave(); assert.equal(p.state().categories.length, 3);
    }
});

bounded('category Add: mouse clicks and separate Enter/Space activations remain repeatable in both locales', async () => {
    for (const locale of ['en', 'zh_CN']) for (const key of ['click', 'Enter', ' ', 'Spacebar']) {
        const p = await fixture(locale); p.add.focus();
        for (let activation = 0; activation < 2; activation++) {
            if (key === 'click') p.add.dispatch('click');
            else {
                assert(!p.down(key).prevented);
                if (key !== 'Enter') assert.equal(p.list.children.length, 2 + activation, 'Space adds only on release');
                p.up(key);
            }
            assert.equal(p.list.children.length, 3 + activation); assert.equal(p.document.activeElement, p.add);
        }
        assert.equal(p.writes.length, 0); assert.equal(autosaves(p), 1);
        await p.autosave(); assert.equal(p.state().categories.length, 4); assert.equal(p.writes.length, 1);
    }
});

bounded('category Add: held Space keeps its original release activation and adds no extra rows', async () => {
    for (const key of [' ', 'Spacebar']) {
        const p = await fixture(); p.add.focus(); assert(!p.down(key).prevented);
        for (let repeat = 0; repeat < 3; repeat++) assert(p.down(key, {repeat: true}).prevented);
        assert.equal(p.list.children.length, 2); assert.equal(autosaves(p), 0);
        p.up(key); assert.equal(p.list.children.length, 3); await p.autosave(); assert.equal(p.state().categories.length, 3);
        assert(!p.down(key).prevented); p.up(key); await p.autosave(); assert.equal(p.state().categories.length, 4);
    }
});

bounded('category Add: ordinary modifier keys and unrelated keys retain their existing native contract', async () => {
    const p = await fixture(); p.add.focus();
    for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) for (const key of ['Enter', ' ', 'Spacebar']) {
        // Do not invent which modifier combinations a platform activates.
        // The app must neither prevent them nor synthesize a click itself.
        assert(!p.add.dispatch('keydown', {key, [modifier]: true}).prevented);
    }
    for (const key of ['Tab', 'Escape', 'ArrowDown', 'a']) for (const fields of [{repeat: true}, {isComposing: true}, {keyCode: 229}]) {
        assert(!p.add.dispatch('keydown', {key, ...fields}).prevented);
    }
    const name = p.list.children[0].querySelector('.cat-name'); name.focus();
    assert(!name.dispatch('keydown', {key: 'Enter', isComposing: true}).prevented);
    assert.equal(p.list.children.length, 2); assert.equal(autosaves(p), 0); assert.equal(p.writes.length, 0);
});

bounded('category Add: reinitializing the same form keeps one Add action and keyboard guard', async () => {
    const html = fs.readFileSync('options.html', 'utf8'), markup = html.match(/<button\b[^>]*\bid="add-category"[^>]*>/)?.[0];
    assert(markup); assert.match(markup, /\btype="button"/); assert.doesNotMatch(markup, /\b(?:disabled|hidden|tabindex)\b/);
    const p = await fixture(); p.context.setupCategoryManagement(p.state().categories); p.context.setupCategoryManagement(p.state().categories);
    p.add.focus(); assert(!p.down('Enter').prevented); assert(p.down('Enter', {repeat: true}).prevented); p.up('Enter');
    assert.equal(p.list.children.length, 3); assert.equal(autosaves(p), 1);
    await p.autosave(); assert.equal(p.state().categories.length, 3); assert.equal(p.writes.length, 1);
});

bounded('category Add: a newer discrete activation survives an older autosave without held-key duplicates', async () => {
    const p = await fixture(); p.add.focus(); p.down('Enter'); p.up('Enter');
    const gate = p.pause(), first = p.autosave(); await gate.entered.promise;
    assert(!p.down('Enter').prevented);
    for (let repeat = 0; repeat < 3; repeat++) p.down('Enter', {repeat: true});
    p.up('Enter'); gate.resume.resolve(); await first;
    assert.equal(p.state().categories.length, 3); assert.equal(p.list.children.length, 4);
    assert(p.context.settingsHasUncommittedWork()); assert.equal(p.document.activeElement, p.add);
    await p.autosave(); assert.equal(p.state().categories.length, 4); assert.equal(p.writes.length, 2);
    assert(!p.context.settingsHasUncommittedWork()); assert.equal(p.document.activeElement, p.add);
});
