'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const StorageManager = require('../storage');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const clone = value => structuredClone(value);
const source = fs.readFileSync('options.js', 'utf8');
const categories = [
    {id: 'work', name: 'Work', icon: '📁'},
    {id: 'reading', name: 'Reading', icon: '📚'},
    {id: 'tools', name: 'Tools', icon: '🔧'}
];

async function fixture(count = 3) {
    const raw = {...new StorageManager().cloneDefaultConfig(), categories: clone(categories.slice(0, count)),
        links: [{title: 'Synthetic original', url: 'https://example.com/original', category: 'work', icon: '🌐'}],
        __localItabRestoreRecovery: {synthetic: 'unchanged recovery'},
        __localItabPersonalTasksV1: {synthetic: 'unchanged tasks'}};
    const writes = [], queues = new Map(); let gate = null;
    const locks = {request(name, fn) {
        const result = (queues.get(name) || Promise.resolve()).then(fn);
        queues.set(name, result.catch(() => {})); return result;
    }};
    Object.defineProperty(global, 'navigator', {configurable: true, value: {locks}});
    const crypto = require('node:crypto').webcrypto;
    global.chrome = {storage: {local: {
        async get(keys) { return clone(keys === null ? raw : Object.fromEntries(keys.filter(key => key in raw).map(key => [key, raw[key]]))); },
        async set(value) {
            if (gate) { const pending = gate; gate = null; pending.entered.resolve(); await pending.resume.promise; if (pending.fail) throw new Error('Synthetic write failure'); }
            writes.push(clone(value)); Object.assign(raw, clone(value));
        }
    }}};
    const document = createDocument();
    for (const [tag, id] of [['ul', 'category-manage-list'], ['button', 'add-category'], ['input', 'quote-text'],
        ['input', 'hour12-format'], ['input', 'show-seconds']]) {
        const node = document.createElement(tag); node.id = id; document.body.append(node);
    }
    const list = document.getElementById('category-manage-list'), add = document.getElementById('add-category');
    const other = document.createElement('input'); other.value = '  unrelated draft 中文  '; document.body.append(other);
    const storage = new StorageManager(); storage._syncInitialized = true;
    const timers = new Map(), messages = []; let timer = 0, afterMove = () => {};
    const window = {document, addEventListener() {}};
    const context = vm.createContext({window, document, storageManager: storage, chrome, navigator, crypto, URL,
        console: {log() {}, warn() {}, error() {}},
        setTimeout(fn, delay) { timers.set(++timer, {fn, delay}); return timer; }, clearTimeout(id) { timers.delete(id); }, messages});
    vm.runInContext(source + '\nshowMessage = (text, type) => messages.push({text, type}); displayStorageInfo = async () => {};', context);
    await context.populateFormFields(await storage.getAll()); context.setupCategoryManagement(raw.categories);
    for (const row of list.children) {
        Object.defineProperty(row, 'previousElementSibling', {get() { return this.parentElement?.children[this.parentElement.children.indexOf(this) - 1] || null; }});
        Object.defineProperty(row, 'nextElementSibling', {get() { return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] || null; }});
    }
    // Explicit local DOM-model supplement: native insertBefore removes an
    // already-connected node before moving it. Chrome's actual baseline lost
    // focus to BODY when that node contained the focused Move up control.
    // The shared model/helpers are deliberately unchanged.
    list.insertBefore = (node, before) => {
        node.remove();
        const index = list.children.indexOf(before); assert.ok(index >= 0);
        list.children.splice(index, 0, node); node.parentElement = list; afterMove();
    };
    writes.length = 0;
    return {document, list, add, other, raw, writes, messages, context,
        afterMove: fn => { afterMove = fn; },
        row: id => list.children.find(row => row.dataset.id === id),
        order: () => list.children.map(row => row.dataset.id),
        pause(fail = false) { gate = {entered: deferred(), resume: deferred(), fail}; return gate; },
        async autosave() {
            for (const [id, entry] of [...timers]) if (entry.delay === 800) { timers.delete(id); entry.fn(); }
            await vm.runInContext('settingsSaveQueue', context); await Promise.resolve();
        }};
}

function unchangedOutsideCategories(f, before) {
    const {categories: currentCategories, __localItabLayoutGeneration: generation, ...afterRest} = f.raw;
    const {categories: oldCategories, __localItabLayoutGeneration: oldGeneration, ...beforeRest} = before;
    assert.deepEqual(afterRest, beforeRest);
    assert.equal(typeof generation, 'string'); assert.ok(generation); assert.notEqual(generation, oldGeneration);
    assert.deepEqual(Object.keys(f.writes[0]).sort(), ['__localItabLayoutGeneration', 'categories']);
}

for (const [action, order] of [['up', ['reading', 'work', 'tools']], ['down', ['work', 'tools', 'reading']]]) {
    test(`category ${action} preserves the exact focused button and draft, then saves once`, async () => {
        const f = await fixture(), before = clone(f.raw), row = f.row('reading');
        const name = row.querySelector('.cat-name'); name.value = '  Reading 中文 <raw>  ';
        const button = row.querySelector(`.cat-${action}`); button.focus(); button.dispatch('click');
        assert.ok(f.document.activeElement === button, "expected focused control"); assert.deepEqual(f.order(), order);
        assert.equal(name.value, '  Reading 中文 <raw>  '); assert.equal(f.other.value, '  unrelated draft 中文  ');
        await f.autosave(); assert.equal(f.writes.length, 1);
        assert.deepEqual(f.raw.categories.map(x => x.id), order);
        assert.equal(f.raw.categories.find(x => x.id === 'reading').name, 'Reading 中文 <raw>');
        unchangedOutsideCategories(f, before);
    });
}

for (const [count, deleted, next] of [[3, 'reading', 'tools'], [3, 'tools', 'reading'], [1, 'work', null]]) {
    test(`category Delete ${deleted}/${count} focuses ${next || 'Add'} through a non-destructive destination`, async () => {
        const f = await fixture(count), before = clone(f.raw), row = f.row(deleted);
        const destination = next ? f.row(next).querySelector('.cat-name') : f.add;
        const button = row.querySelector('.cat-delete'); button.focus(); button.dispatch('click');
        assert.ok(f.document.activeElement === destination, "expected focused control");
        assert.ok(!f.row(deleted)); assert.equal(destination.classList.contains('cat-delete'), false);
        assert.equal(destination.tagName, next ? 'INPUT' : 'BUTTON');
        const remaining = f.order();
        // A held activation cannot run another Delete on the new focus target.
        const held = destination.dispatch('keydown', {key: 'Enter', repeat: true});
        if (!next) assert.equal(held.prevented, true, 'existing Add repeat guard remains active');
        assert.deepEqual(f.order(), remaining);
        await f.autosave(); assert.equal(f.writes.length, 1);
        assert.deepEqual(f.raw.categories.map(x => x.id), remaining);
        unchangedOutsideCategories(f, before);
    });
}

for (const action of ['up', 'delete']) test(`unfocused ${action} does not take focus from another draft`, async () => {
    const f = await fixture(); f.other.focus();
    f.row('reading').querySelector(`.cat-${action}`).dispatch('click');
    assert.ok(f.document.activeElement === f.other, "expected focused control"); assert.equal(f.other.value, '  unrelated draft 中文  ');
});

test('a newer focus during a row move is not reclaimed', async () => {
    const f = await fixture(), button = f.row('reading').querySelector('.cat-up');
    f.afterMove(() => f.other.focus()); button.focus(); button.dispatch('click');
    assert.ok(f.document.activeElement === f.other, "expected focused control"); assert.deepEqual(f.order(), ['reading', 'work', 'tools']);
});

test('later autosave failure keeps the reordered draft and newer focus without changing raw data', async () => {
    const f = await fixture(), before = clone(f.raw), button = f.row('reading').querySelector('.cat-up');
    button.focus(); button.dispatch('click'); assert.ok(f.document.activeElement === button, "expected focused control");
    const gate = f.pause(true), save = f.autosave(); await gate.entered.promise;
    f.other.focus(); gate.resume.resolve(); await save;
    assert.deepEqual(f.raw, before); assert.equal(f.writes.length, 0);
    assert.equal(f.messages.at(-1).type, 'error');
    assert.ok(f.document.activeElement === f.other, "expected focused control");
    assert.deepEqual(f.order(), ['reading', 'work', 'tools']);
    assert.equal(f.other.value, '  unrelated draft 中文  ');
});
