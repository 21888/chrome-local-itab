const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const StorageManager = require('../storage.js');
const Catalog = require('../shared/navigation-catalog');
const { createDocument } = require('./helpers/task-dom-model');
const tick = () => new Promise(setImmediate);

// Synthetic DOM, real view -> StorageManager contract. No browser/network.
function flow(categories, locale = 'en') {
    const document = createDocument({ blurUnavailableFocus: true }); document.documentElement.lang = locale;
    const host = document.createElement('header'); document.body.append(host);
    const raw = { links: [], categories: structuredClone(categories), layout: { positions: {}, autoArrange: false },
        privacy: { onlineFavicons: false }, sync: { enabled: false }, unknown: { keep: true } };
    const writes = [], requests = [], storage = new StorageManager(); storage._syncInitialized = true;
    let queue = Promise.resolve();
    storage.withLocalWriteLock = action => { const result = queue.then(action); queue = result.catch(() => {}); return result; };
    Object.defineProperty(storage, '_local', { value: {
        async get() { return structuredClone(raw); },
        async set(values) { writes.push(structuredClone(values)); Object.assign(raw, structuredClone(values)); }
    } });
    storage.scheduleShortcutUndoSync = async () => {};
    const component = { layoutController: { async flush() {} }, async addCatalogShortcut(request) {
        requests.push(request); return storage.addCatalogShortcut(request);
    } };
    const dictionary = JSON.parse(fs.readFileSync(`_locales/${locale === 'zh-CN' ? 'zh_CN' : 'en'}/messages.json`));
    const context = { document, URL, Intl, console, setTimeout, window: null, addEventListener() {}, storageManager: storage,
        shortcutsComponentInstance: component, i18n: { t: key => dictionary[key]?.message || key } };
    context.window = context; vm.createContext(context);
    for (const file of ['shared/dialog-focus.js', 'shared/stored-shortcut-url.js', 'shared/navigation-catalog.js', 'shared/navigation-sites.js', 'shared/navigation-library-view.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    context.LocalItabNavigationSites = context.LocalItabNavigationSites.slice(0, 3);
    const view = component.navigationLibraryView = context.LocalItabNavigationLibrary.mount(host, component);
    const q = selector => document.querySelector(selector), select = () => q('.navigation-library-destination select');
    const chooseDestination = id => { select().value = id; select().dispatch('change'); };
    const optionLabels = () => Object.fromEntries(select().querySelectorAll('option').map(option => [option.value, option.textContent]));
    const chooseSite = id => { const card = document.querySelectorAll('article').find(node => node.dataset.site === id); const check = card.querySelector('input'); check.checked = true; check.dispatch('change'); };
    const refresh = async () => { q('.navigation-library-refresh-saved').dispatch('click'); await tick(); };
    return { document, raw, writes, requests, storage, component, context, view, q, select, chooseDestination, optionLabels, chooseSite, refresh };
}
const twins = [{ id: 'same-a', name: 'Same', keep: 1 }, { id: 'same-b', name: 'Same', keep: 2 }];

for (const locale of ['en', 'zh-CN']) for (const id of ['same-a', 'same-b']) test(`real batch uses one consistent category identity in ${locale}, target ${id}`, async () => {
    const h = flow(twins, locale); await h.view.open(); h.chooseDestination(id); h.chooseSite('chatgpt');
    const options = h.optionLabels();
    h.q('.navigation-library-batch-review').dispatch('click');
    const review = h.q('.navigation-library-review p').textContent;
    assert.equal(h.writes.length, 0);
    h.q('.navigation-library-batch-confirm').dispatch('click'); await tick();
    assert.equal(h.writes.length, 1); assert.equal(h.requests[0].destination, id);
    assert.equal(h.raw.links.length, 1); assert.equal(h.raw.links[0].category, id);
    assert.deepEqual(h.raw.categories, twins); assert.deepEqual(h.raw.unknown, { keep: true });
    const label = `Same (${id})`;
    assert.notEqual(options['same-a'], options['same-b']); assert.equal(options[id], label);
    assert(review.includes(label)); assert(h.q('.navigation-library-status').textContent.includes(label));
    assert.equal(h.q('.navigation-library-saved-locations li').textContent, label);
    assert.deepEqual(h.optionLabels(), options);
});

for (const id of ['same-a', 'same-b']) test(`real single add reports and renders the same target label for ${id}`, async () => {
    const h = flow(twins); await h.view.open(); h.chooseDestination(id);
    h.q('.navigation-library-add').dispatch('click'); await tick();
    assert.equal(h.raw.links[0].category, id); assert.equal(h.writes.length, 1); assert.deepEqual(h.raw.categories, twins);
    const label = `Same (${id})`;
    assert(h.q('.navigation-library-status').textContent.includes(label));
    assert.equal(h.q('.navigation-library-saved-locations li').textContent, label);
});

test('saved location labels use the whole category snapshot even when the site exists in only one twin', async () => {
    const h = flow(twins); h.raw.links = [{ title: 'Synthetic ChatGPT', url: 'https://chatgpt.com/', icon: 'C', category: 'same-b' }];
    const before = structuredClone(h.raw); await h.view.open();
    assert.equal(h.q('.navigation-library-saved-locations li').textContent, 'Same (same-b)');
    assert.deepEqual(h.raw, before); assert.equal(h.writes.length, 0);
});

test('category label map preserves raw names, stable IDs, order independence and ordinary unique labels', () => {
    const categories = [...twins, { id: 'unique', name: 'Unique' }, { id: 'cafe-a', name: ' Café ' }, { id: 'cafe-b', name: 'CAFE\u0301' }];
    const original = structuredClone(categories), labels = Catalog.personalCategoryLabels(categories);
    assert.equal(labels.get('same-a'), 'Same (same-a)'); assert.equal(labels.get('same-b'), 'Same (same-b)');
    assert.equal(labels.get('unique'), 'Unique'); assert.equal(labels.get('cafe-a'), ' Café  (cafe-a)'); assert.equal(labels.get('cafe-b'), 'CAFE\u0301 (cafe-b)');
    const reordered = Catalog.personalCategoryLabels([...categories].reverse());
    for (const category of categories) assert.equal(labels.get(category.id), reordered.get(category.id));
    assert.deepEqual(categories, original); assert.equal(Catalog.personalCategoryLabels([]).size, 0);
});

test('literal names that imitate generated labels remain distinguishable without changing user data', async () => {
    const categories = [...twins, { id: 'literal', name: 'Same (same-a)' }, { id: 'next', name: 'Same (same-a) (literal)' }];
    const h = flow(categories); await h.view.open(); const labels = h.optionLabels();
    assert.equal(new Set(Object.values(labels)).size, categories.length);
    assert.equal(labels['same-a'], 'Same (same-a)'); assert.equal(labels.literal, 'Same (same-a) (literal)');
    assert.equal(labels.next, 'Same (same-a) (literal) (next)');
    h.chooseDestination('literal'); h.chooseSite('chatgpt'); h.q('.navigation-library-batch-review').dispatch('click');
    assert(h.q('.navigation-library-review p').textContent.includes(labels.literal));
    h.q('.navigation-library-batch-confirm').dispatch('click'); await tick();
    assert.equal(h.raw.links[0].category, 'literal'); assert.deepEqual(h.raw.categories, categories);
    assert.equal(h.q('.navigation-library-saved-locations li').textContent, labels.literal);
});

test('unusual legacy IDs cannot collide with another decorated label, and hostile names remain text', async () => {
    const categories = [{ id: 'x) (y', name: 'Same' }, { id: 'other', name: 'Same' },
        { id: 'y', name: 'Same (x)' }, { id: 'other-2', name: 'Same (x)' },
        { id: 'hostile-a', name: '<img src=x onerror=alert(1)>' }, { id: 'hostile-b', name: '<img src=x onerror=alert(1)>' }];
    const h = flow(categories); await h.view.open(); const labels = h.optionLabels();
    assert.equal(new Set(Object.values(labels)).size, categories.length);
    assert.equal(h.document.querySelectorAll('img').length, 0); assert.deepEqual(h.raw.categories, categories); assert.equal(h.writes.length, 0);
});

test('external reorder, rename and collision introduction refresh one coherent display map while retaining target ID', async () => {
    const h = flow(twins); h.raw.links = [{ title: 'ChatGPT', url: 'https://chatgpt.com/', icon: 'C', category: 'same-b' }];
    await h.view.open(); h.chooseDestination('same-b'); const first = h.optionLabels();
    h.raw.categories.reverse(); await h.refresh(); assert.deepEqual(h.optionLabels(), { 'same-b': first['same-b'], 'same-a': first['same-a'] });
    h.raw.categories.find(category => category.id === 'same-a').name = 'Renamed'; await h.refresh();
    assert.equal(h.select().value, 'same-b'); assert.equal(h.optionLabels()['same-b'], 'Same');
    assert.equal(h.q('.navigation-library-saved-locations li').textContent, 'Same');
    h.raw.categories.push({ id: 'same-c', name: 'Same' }); await h.refresh();
    assert.equal(h.optionLabels()['same-b'], 'Same (same-b)'); assert.equal(h.q('.navigation-library-saved-locations li').textContent, 'Same (same-b)');
    assert.equal(h.select().value, 'same-b'); assert.equal(h.writes.length, 0);
});

test('deleted target refresh stays blocked until explicit valid selection and clears only its obsolete missing warning', async () => {
    const h = flow(twins); await h.view.open(); h.chooseDestination('same-b');
    h.raw.categories = h.raw.categories.filter(category => category.id !== 'same-b'); await h.refresh();
    assert.equal(h.select().value, 'same-b'); assert.equal(h.q('.navigation-library-add').disabled, true);
    assert.match(h.q('.navigation-library-status').textContent, /no longer available/);
    h.q('.navigation-library-add').dispatch('click'); await tick(); assert.equal(h.writes.length, 0);
    h.chooseDestination('same-a');
    assert.equal(h.q('.navigation-library-add').disabled, false);
    assert.doesNotMatch(h.q('.navigation-library-status').textContent, /no longer available/);
    assert.match(h.q('.navigation-library-status').textContent, /Saved state refreshed/);
    h.q('.navigation-library-add').dispatch('click'); await tick();
    assert.equal(h.writes.length, 1); assert.equal(h.raw.links[0].category, 'same-a');
});

test('choosing a valid target leaves newer error feedback untouched', async () => {
    const h = flow(twins); await h.view.open(); h.chooseDestination('same-b'); h.raw.categories.pop(); await h.refresh();
    h.q('.navigation-library-status').textContent = 'SYNTHETIC newer conflict feedback';
    h.chooseDestination('same-a'); assert.equal(h.q('.navigation-library-status').textContent, 'SYNTHETIC newer conflict feedback'); assert.equal(h.writes.length, 0);
});

test('valid selection removes only missing-target feedback while retaining real layout read-only guidance', async () => {
    const h = flow(twins); h.context.clearTimeout = clearTimeout;
    vm.runInContext(fs.readFileSync('shared/layout.js', 'utf8'), h.context);
    let generation = 'initial'; const layout = { autoArrange: true };
    const storage = { defaultConfig: { layout }, validateLayoutConfig: value => value,
        async getLayoutSnapshotForUpdate() { return { layout, links: [], generation }; } };
    const controller = new h.context.LocalItabLayout.Controller({ storage, initial: layout, baseline: { generation, links: [] }, getLinks: () => [] });
    h.component.layoutController = controller;
    await h.view.open(); h.chooseDestination('same-b'); h.raw.categories.pop();
    generation = 'external-category-delete'; await controller.refresh(); assert.equal(controller.invalidated, true);
    await h.refresh(); const status = h.q('.navigation-library-status');
    assert.match(status.textContent, /no longer available/);
    h.chooseDestination('same-a');
    assert.doesNotMatch(status.textContent, /no longer available/);
    assert.match(status.textContent, /reload this page before adding sites/); assert.equal(h.q('.navigation-library-add').disabled, true);
    h.q('.navigation-library-add').dispatch('click'); await tick(); assert.equal(h.writes.length, 0);
});

test('failed refresh retains labels and its error after a valid target change', async () => {
    const h = flow(twins); await h.view.open(); h.chooseDestination('same-b'); h.raw.categories.pop(); await h.refresh();
    const labels = h.optionLabels();
    h.storage.readNavigationLibrarySnapshot = async () => { throw new Error('synthetic read failure'); };
    await h.refresh(); const failure = h.q('.navigation-library-status').textContent;
    assert.match(failure, /Could not refresh/);
    h.chooseDestination('same-a'); assert.equal(h.q('.navigation-library-status').textContent, failure);
    assert.deepEqual(h.optionLabels(), labels); assert.equal(h.writes.length, 0);
});

test('a retired review cannot save to the deleted category after refresh or close/reopen', async () => {
    const h = flow(twins); await h.view.open(); h.chooseDestination('same-b'); h.chooseSite('chatgpt');
    h.q('.navigation-library-batch-review').dispatch('click'); const old = h.q('.navigation-library-batch-confirm');
    h.q('.navigation-library-review-cancel').dispatch('click'); h.raw.categories.pop(); await h.refresh();
    old.dispatch('click'); await tick(); assert.equal(h.writes.length, 0);
    h.chooseDestination('same-a'); old.dispatch('click'); await tick(); assert.equal(h.writes.length, 0);
    h.view.close(); await h.view.open(); old.dispatch('click'); await tick(); assert.equal(h.writes.length, 0);
    assert.equal(h.optionLabels()['same-a'], 'Same');
});

test('category labels handle the full 2000-category bound and prototype-looking identities deterministically', () => {
    const categories = Array.from({ length: 1997 }, (_, index) => ({ id: `category-${index}`, name: 'Same' }));
    for (const id of ['__proto__', 'constructor', 'toString']) categories.push({ id, name: 'Same' });
    const labels = Catalog.personalCategoryLabels(categories), reordered = Catalog.personalCategoryLabels([...categories].reverse());
    assert.equal(labels.size, 2000); assert.equal(new Set(labels.values()).size, 2000);
    for (const category of categories) assert.equal(labels.get(category.id), reordered.get(category.id));
    assert.equal(labels.get('__proto__'), 'Same (__proto__)');
});
