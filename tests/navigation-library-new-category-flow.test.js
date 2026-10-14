const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const StorageManager = require('../storage.js');
const { createDocument } = require('./helpers/task-dom-model');
const tick = () => new Promise(setImmediate);

// Exercise the real view-to-storage request contract. The DOM model never opens
// a browser or loads a remote resource; all user content here is synthetic.
function flow(categories = [], links = []) {
    const document = createDocument({ blurUnavailableFocus: true });
    document.documentElement.lang = 'en';
    const host = document.createElement('header'); document.body.append(host);
    const raw = { links, categories, layout: { positions: {}, autoArrange: false },
        privacy: { onlineFavicons: false }, sync: { enabled: false }, unknown: { keep: true } };
    const writes = [], requests = [];
    const storage = new StorageManager(); storage._syncInitialized = true;
    let queue = Promise.resolve();
    storage.withLocalWriteLock = action => { const result = queue.then(action); queue = result.catch(() => {}); return result; };
    Object.defineProperty(storage, '_local', { value: {
        async get() { return structuredClone(raw); },
        async set(values) { writes.push(structuredClone(values)); Object.assign(raw, structuredClone(values)); }
    } });
    storage.scheduleShortcutUndoSync = async () => {};
    storage.createCatalogCategoryIdentity = () => 'cat_library_' + 'a'.repeat(32);
    const component = { layoutController: { async flush() {} }, async addCatalogShortcut(request) {
        requests.push(request); return storage.addCatalogShortcut(request);
    } };
    const context = { document, URL, Intl, console, setTimeout, window: null, addEventListener() {}, storageManager: storage,
        shortcutsComponentInstance: component };
    context.window = context; vm.createContext(context);
    for (const file of ['shared/dialog-focus.js', 'shared/navigation-catalog.js', 'shared/navigation-sites.js', 'shared/navigation-library-view.js']) {
        vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    }
    const view = component.navigationLibraryView = context.LocalItabNavigationLibrary.mount(host, component);
    return { document, raw, writes, requests, storage, view, context,
        button(text) { return document.querySelectorAll('button').find(node => node.textContent === text); } };
}
function begin(h, name) {
    h.document.querySelector('.navigation-library-new-category').dispatch('click');
    const input = h.document.querySelector('.navigation-library-new-category-panel input');
    input.value = name; input.dispatch('input'); return input;
}
function choose(h, id) {
    const card = h.document.querySelectorAll('article').find(node => node.dataset.site === id);
    const input = card.querySelector('input'); input.checked = true; input.dispatch('change');
}

test('real empty-category single confirmation writes category and only the reviewed website together', async () => {
    const h = flow(); await h.view.open(); choose(h, 'github'); begin(h, '  Cafe\u0301  ');
    const card = h.document.querySelectorAll('article').find(node => node.dataset.site === 'chatgpt');
    card.querySelector('.navigation-library-add').dispatch('click');
    assert.equal(h.writes.length, 0);
    h.document.querySelector('.navigation-library-batch-confirm').dispatch('click'); await tick();
    assert.equal(h.writes.length, 1); assert.equal(h.requests.length, 1);
    assert.equal(h.raw.categories[0].name, 'Café'); assert.equal(h.raw.links.length, 1);
    assert.equal(h.raw.links[0].category, h.raw.categories[0].id); assert.equal(h.raw.links[0].title, 'ChatGPT');
    assert.equal(h.requests[0].confirmedNewCategory, true); assert(!Object.hasOwn(h.requests[0], 'destination'));
    assert.deepEqual(h.raw.unknown, { keep: true }); assert.deepEqual(h.raw.layout, { positions: {}, autoArrange: false });
    assert.equal(h.document.querySelector('.navigation-library-destination select').value, h.raw.categories[0].id);
    assert(h.document.querySelectorAll('article').find(node => node.dataset.site === 'github').querySelector('input').checked);
});

test('real new-category batch draft cancel and stale confirmation remain zero-write; current confirmation commits', async () => {
    const h = flow([{ id: 'work', name: 'Work', extra: 1 }]); await h.view.open();
    const input = begin(h, 'Research'); choose(h, 'chatgpt'); choose(h, 'github');
    h.document.querySelector('.navigation-library-batch-review').dispatch('click');
    const old = h.document.querySelector('.navigation-library-batch-confirm');
    input.value = 'Design'; input.dispatch('input'); old.dispatch('click'); await tick();
    assert.equal(h.writes.length, 0);
    h.document.querySelector('.navigation-library-batch-review').dispatch('click');
    h.document.querySelector('.navigation-library-review-cancel').dispatch('click');
    assert.equal(h.writes.length, 0); assert.equal(input.value, 'Design');
    h.document.querySelector('.navigation-library-batch-review').dispatch('click');
    h.document.querySelector('.navigation-library-batch-confirm').dispatch('click'); await tick();
    assert.equal(h.writes.length, 1); assert.equal(h.raw.links.length, 2); assert.equal(h.raw.categories[1].name, 'Design');
    assert.deepEqual(h.raw.categories[0], { id: 'work', name: 'Work', extra: 1 });
});

test('real concurrent privacy change refuses the new-category confirmation without any write', async () => {
    const h = flow(); await h.view.open(); begin(h, 'AI');
    h.document.querySelector('.navigation-library-add').dispatch('click');
    h.raw.privacy.onlineFavicons = true;
    h.document.querySelector('.navigation-library-batch-confirm').dispatch('click'); await tick();
    assert.equal(h.writes.length, 0); assert.equal(h.raw.categories.length, 0); assert.equal(h.raw.links.length, 0);
    assert.match(h.document.querySelector('.navigation-library-status').textContent, /Close and reopen/);
});

test('real new-category review removal remains zero-write until a fresh reduced confirmation commits', async () => {
    const h = flow([{ id: 'work', name: 'Work' }]); await h.view.open();
    begin(h, 'Selected research'); choose(h, 'chatgpt'); choose(h, 'github');
    const search = h.document.querySelector('.navigation-library-search input'); search.value = 'figma'; search.dispatch('input');
    h.document.querySelector('.navigation-library-batch-review').dispatch('click');
    const stale = h.document.querySelector('.navigation-library-batch-confirm');
    h.document.querySelectorAll('.navigation-library-review-remove')[0].dispatch('click');
    stale.dispatch('click'); await tick(); assert.equal(h.requests.length, 0); assert.equal(h.writes.length, 0);
    h.document.querySelector('.navigation-library-batch-confirm').dispatch('click'); await tick();
    assert.equal(h.requests.length, 1); assert.equal(h.writes.length, 1);
    assert.equal(h.raw.links.length, 1); assert.equal(h.raw.links[0].title, 'GitHub');
    assert.equal(h.raw.categories.length, 2); assert.equal(h.raw.categories[1].name, 'Selected research');
    assert.equal(h.raw.links[0].category, h.raw.categories[1].id); assert.equal(search.value, 'figma');
    assert(Object.isFrozen(h.requests[0].sites)); assert(Object.isFrozen(h.requests[0].baseline));
});

test('real active-filter removal preserves unrelated browse and target drafts and retires review without writes',async()=>{
 const h=flow([{id:'work',name:'Work'},{id:'personal',name:'Personal'}]);await h.view.open();
 const target=h.document.querySelector('.navigation-library-destination select');target.value='personal';target.dispatch('change');
 choose(h,'chatgpt');const name=begin(h,'Synthetic draft');
 const search=h.document.querySelector('.navigation-library-search input');search.value='chatgpt';search.dispatch('input');
 const category=h.document.querySelectorAll('.navigation-library-category').find(node=>node.dataset.category==='ai');category.dispatch('click');
 const selects=h.document.querySelectorAll('.navigation-library-filters select');
 for(const [index,value] of [[0,'chat'],[1,'US'],[2,'OpenAI'],[3,'freemium']]) {selects[index].value=value;selects[index].dispatch('change');}
 const saved=h.document.querySelectorAll('.navigation-library-saved-filter').find(node=>node.dataset.savedState==='new');saved.dispatch('click');
 h.document.querySelector('.navigation-library-batch-review').dispatch('click');
 const old=h.document.querySelector('.navigation-library-batch-confirm');assert.ok(old);
 const before=structuredClone(h.raw);
 h.document.querySelectorAll('.navigation-library-active-filter').find(node=>node.dataset.filter==='company').dispatch('click');
 old.dispatch('click');await tick();
 assert.equal(h.document.querySelector('.navigation-library-review').hidden,true);
 assert.equal(search.value,'chatgpt');assert.equal(category.getAttribute('aria-pressed'),'true');assert.equal(saved.getAttribute('aria-pressed'),'true');
 assert.equal(selects[0].value,'chat');assert.equal(selects[1].value,'US');assert.equal(selects[2].value,'');assert.equal(selects[3].value,'freemium');
 assert.equal(target.value,'personal');assert.equal(name.value,'Synthetic draft');
 assert.equal(h.document.querySelector('.navigation-library-new-category-panel').hidden,false);
 assert.match(h.document.querySelector('.navigation-library-batch').children[0].textContent,/1 \/ 20 selected/);
 assert.equal(h.requests.length,0);assert.equal(h.writes.length,0);assert.deepEqual(h.raw,before);
 h.document.querySelector('.navigation-library-use-existing').dispatch('click');assert.equal(target.value,'personal');
});

for (const omitted of [['icon'], ['category'], ['icon', 'category']]) {
    test(`real view reads legacy omitted ${omitted.join('/')} and saves without migration`, async () => {
        const link = { title: 'Saved ChatGPT', url: 'https://chatgpt.com/', icon: 'C', category: 'work', extra: { keep: true } };
        for (const field of omitted) delete link[field];
        const h = flow([{ id: 'work', name: 'Work' }], [link]);
        const before = structuredClone(h.raw);
        assert.equal(await h.view.open(), true);
        assert.equal(h.document.querySelectorAll('article').length, h.context.LocalItabNavigationSites.length);
        const saved = h.document.querySelectorAll('article').find(node => node.dataset.site === 'chatgpt');
        assert.equal(saved.querySelector('.navigation-library-add').disabled, true);
        assert.equal(saved.querySelector('.navigation-library-saved-locations li').textContent, 'Work');
        assert.deepEqual(h.raw, before); assert.equal(h.writes.length, 0);
        const card = h.document.querySelectorAll('article').find(node => node.dataset.site === 'github');
        card.querySelector('.navigation-library-add').dispatch('click'); await tick();
        assert.equal(h.writes.length, 1); assert.equal(h.raw.links.length, 2);
        assert.deepEqual(h.raw.links[0], before.links[0]);
        assert.deepEqual(h.raw.layout, before.layout); assert.deepEqual(h.raw.categories, before.categories);
        assert.deepEqual(h.raw.unknown, before.unknown); assert(!Object.hasOwn(h.raw, 'schemaVersion'));
        assert.equal(card.querySelector('.navigation-library-add').disabled, true);
        h.view.close(); assert.equal(await h.view.open(), true);
        assert.equal(h.writes.length, 1); assert.deepEqual(h.raw.links[0], before.links[0]);
    });
}
