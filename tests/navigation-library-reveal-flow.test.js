const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const StorageManager = require('../storage.js');
const { createDocument } = require('./helpers/task-dom-model');
const tick = () => new Promise(setImmediate);

function flow({ free = false } = {}) {
    const document = createDocument({ blurUnavailableFocus: true }); document.documentElement.lang = 'en';
    // Extend only this fixture's selector model for the production grid's :not.
    const elements = Object.getPrototypeOf(document.body), matches = elements.matches;
    elements.matches = function(selector) { return selector.split(',').some(raw => {
        const excluded = raw.match(/:not\(([^)]+)\)/);
        return (!excluded || !matches.call(this, excluded[1])) && matches.call(this, raw.replace(/:not\([^)]+\)/g, ''));
    }); };
    const container = document.createElement('section'); container.id = 'shortcuts-container';
    const categoryList = document.createElement('div'); categoryList.id = 'category-list'; document.body.append(categoryList, container);
    const raw = { links: [{ title: 'Existing work site', url: 'https://example.com/', icon: 'E', category: 'work' }],
        categories: [{ id: 'work', name: 'Work' }, { id: 'reading', name: 'Reading' }], layout: { autoArrange: true, positions: {} },
        privacy: { onlineFavicons: false }, sync: { enabled: false } };
    if (free) {
        const id = 'l_' + '1'.repeat(32); raw.links[0].layoutId = id; raw.schemaVersion = 2;
        raw.layout = { ...raw.layout, autoArrange: false, identityVersion: 1, positionsById: { [id]: { work: { x: 0, y: 0 } } } };
    }
    const writes = [], preferences = [], opened = [], errors = [], results = [], storageListeners = new Set();
    const storage = new StorageManager(); storage._syncInitialized = true; let queue = Promise.resolve();
    storage.withLocalWriteLock = action => { const result = queue.then(action); queue = result.catch(() => {}); return result; };
    Object.defineProperty(storage, '_local', { value: { async get() { return structuredClone(raw); }, async set(value) { writes.push(structuredClone(value)); const changes = Object.fromEntries(Object.entries(value).map(([key, next]) => [key, { oldValue: structuredClone(raw[key]), newValue: structuredClone(next) }])); Object.assign(raw, structuredClone(value)); for (const listener of storageListeners) listener(changes, 'local'); } } });
    storage.onLocalChanged = listener => { storageListeners.add(listener); return () => storageListeners.delete(listener); };
    storage.scheduleShortcutUndoSync = async () => {};
    const context = { document, storageManager: storage, URL, Intl, console, setTimeout, clearTimeout, window: null,
        addEventListener() {}, removeEventListener() {}, open: url => opened.push(url),
        getComputedStyle: node => ({ visibility: node.style.visibility || 'visible' }),
        localStorage: { getItem() { return 'work'; }, setItem(...args) { preferences.push(args); } },
        LocalItabWorkspaces: { session: { id: 'synthetic-workspace', generation: 1 } } };
    context.window = context; vm.createContext(context);
    for (const file of ['shared/dialog-focus.js', 'shared/stored-shortcut-url.js', 'shared/navigation-catalog.js', 'shared/navigation-sites.js', 'shared/navigation-library-view.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    if (free) for (const file of ['shared/layout-identity.js', 'shared/layout.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    vm.runInContext(fs.readFileSync('newtab.js', 'utf8') + '\nthis.ShortcutsComponent=ShortcutsComponent; this.CategoryNavigation=CategoryNavigation;', context);
    context.showErrorMessage = message => errors.push(message);
    const component = context.shortcutsComponentInstance = new context.ShortcutsComponent(structuredClone(raw.links), raw.layout, raw.categories, free ? storage.layoutSnapshot(raw) : undefined);
    // Real grid/card rendering and filtering; layout geometry and unrelated edit
    // modal setup are outside this DOM-model flow.
    if (!free) component.applyLayoutMode = () => {}; component.createModal = () => {};
    const navigation = context.categoryNavigation = Object.create(context.CategoryNavigation.prototype);
    navigation.currentCategory = 'work'; navigation.storageKey = 'currentCategory'; navigation.categories = raw.categories;
    component.render(); navigation.render({ reflow: false });
    const add = component.addCatalogShortcut.bind(component); component.addCatalogShortcut = async request => { try { const result = await add(request); results.push(result); return result; } catch (error) { errors.push(error.stack); throw error; } };
    const grid = document.getElementById('shortcuts-grid');
    return { document, raw, writes, preferences, opened, errors, results, storage, context, component, navigation, grid, view: component.navigationLibraryView,
        tile(index) { return grid.querySelectorAll('.shortcut-item:not(.add-shortcut)').find(node => node.dataset.index === String(index)); } };
}
async function addToReading(h, destinationId = 'reading') {
    await h.view.open(); const search = h.document.querySelector('.navigation-library-search input'); search.value = 'chatgpt'; search.dispatch('input');
    const destination = h.document.querySelector('.navigation-library-destination select'); destination.value = destinationId; destination.dispatch('change');
    h.document.querySelector('.navigation-library-add').dispatch('click'); await tick(); await tick();
}

test('discover → search → add to another category → explicit home reveal reaches the exact added card', async () => {
    const h = flow(); await addToReading(h); assert.equal(h.errors.length, 0, h.errors.join('\n'));
    assert.equal(h.writes.length, 1); assert.equal(h.raw.links[1].title, 'ChatGPT'); assert.equal(h.raw.links[1].category, 'reading');
    assert.equal(h.navigation.currentCategory, 'work'); assert.equal(h.preferences.length, 0); assert.equal(h.tile(1).getClientRects().length, 0);
    const reveal = h.document.querySelector('.navigation-library-reveal'); assert.ok(reveal, 'verified add needs an explicit route to its hidden home card');
    reveal.dispatch('click');
    assert.equal(h.document.querySelector('.navigation-library-overlay'), null); assert.equal(h.navigation.currentCategory, 'reading');
    assert.equal(h.document.activeElement, h.tile(1).querySelector('.shortcut-launch')); assert.equal(h.opened.length, 0); assert.equal(h.writes.length, 1);
    assert.deepEqual(h.preferences, [['currentCategory', 'reading']]);
});
for (const boundary of ['deleted', 'replaced-same-url', 'changed-url', 'changed-title', 'category-removed', 'workspace', 'workspace-generation', 'navigation', 'component', 'grid-removed', 'rendered-card-replaced', 'hidden-page', 'layout-invalidated']) test(`old add receipt refuses ${boundary} without changing category or opening a site`, async () => {
    const h = flow(); await addToReading(h); const reveal = h.document.querySelector('.navigation-library-reveal');
    assert.equal(reveal.hidden, false); const original = h.component.links[1];
    if (boundary === 'deleted') h.component.links.splice(1, 1);
    if (boundary === 'replaced-same-url') h.component.links[1] = { ...original };
    if (boundary === 'changed-url') original.url = 'https://example.org/';
    if (boundary === 'changed-title') original.title = 'Changed card';
    if (boundary === 'category-removed') h.navigation.categories = h.navigation.categories.filter(c => c.id !== 'reading');
    if (boundary === 'workspace') h.context.LocalItabWorkspaces.session = { id: 'other-workspace', generation: 1 };
    if (boundary === 'workspace-generation') h.context.LocalItabWorkspaces.session.generation++;
    if (boundary === 'navigation') h.context.categoryNavigation = { ...h.navigation };
    if (boundary === 'component') h.context.shortcutsComponentInstance = {};
    if (boundary === 'grid-removed') h.grid.remove();
    if (boundary === 'rendered-card-replaced') { const card = h.tile(1); card.replaceChildren(h.document.createElement('button')); }
    if (boundary === 'hidden-page') h.document.hidden = true;
    if (boundary === 'layout-invalidated') h.component.layoutController = { invalidated: true };
    reveal.dispatch('click');
    assert.ok(h.document.querySelector('.navigation-library-overlay')); assert.match(h.document.querySelector('.navigation-library-status').textContent, /Could not locate/);
    assert.equal(h.navigation.currentCategory, 'work'); assert.equal(h.preferences.length, 0); assert.equal(h.opened.length, 0); assert.equal(h.writes.length, 1);
    h.view.close();
});
test('retained reveal from a closed opening cannot dismiss a new library or change its category', async () => {
    const h = flow(); await addToReading(h); const old = h.document.querySelector('.navigation-library-reveal'); h.view.close(); await h.view.open();
    old.dispatch('click'); assert.ok(h.document.querySelector('.navigation-library-overlay')); assert.equal(h.navigation.currentCategory, 'work'); assert.equal(h.preferences.length, 0); assert.equal(h.writes.length, 1); h.view.close();
});
test('receipt cannot be replaced by a copied result or a guessed matching URL', async () => {
    const h = flow(); await addToReading(h); const result = h.results[0];
    assert.equal(h.component.canRevealCatalogShortcut(structuredClone(result)), false);
    assert.equal(h.component.revealCatalogShortcut({ links: [{ url: 'https://chatgpt.com/' }] }), false);
    assert.equal(h.preferences.length, 0); assert.equal(h.opened.length, 0); h.view.close();
});
test('dismissal callback that changes workspace does not switch category or focus the old card', async () => {
    const h = flow(); await addToReading(h);
    assert.equal(h.component.revealCatalogShortcut(h.results[0], () => { h.view.close(); h.context.LocalItabWorkspaces.session = { id: 'other', generation: 1 }; }), false);
    assert.equal(h.navigation.currentCategory, 'work'); assert.equal(h.preferences.length, 0); assert.equal(h.opened.length, 0); assert.notEqual(h.document.activeElement, h.tile(1).querySelector('.shortcut-launch'));
});
test('normal category switching may schedule existing layout persistence without losing exact focus', async () => {
    const h = flow();
    const controller = h.component.layoutController = { async flush() {}, holdShortcutMutation() {}, releaseShortcutMutation() {}, adoptOwnShortcutSnapshot() {}, refreshControls() {} };
    await addToReading(h); let reflows = 0; h.component.reflowVisibleLayout = () => { reflows++; controller.timer = 1; };
    h.document.querySelector('.navigation-library-reveal').dispatch('click');
    assert.equal(reflows, 1); assert.equal(h.navigation.currentCategory, 'reading'); assert.equal(h.document.activeElement, h.tile(1).querySelector('.shortcut-launch'));
    assert.equal(h.opened.length, 0); assert.equal(h.writes.length, 1); controller.timer = null;
});
for (const operation of ['category', 'focus', 'scroll']) test(`explicit reveal reports ${operation} exceptions without opening a site or claiming success`, async () => {
    const h = flow(); await addToReading(h); const fail = () => { throw new Error('synthetic unavailable ' + operation); };
    if (operation === 'category') h.navigation.selectCategory = fail;
    if (operation === 'focus') h.tile(1).querySelector('.shortcut-launch').focus = fail;
    if (operation === 'scroll') h.tile(1).querySelector('.shortcut-launch').scrollIntoView = fail;
    assert.doesNotThrow(() => h.document.querySelector('.navigation-library-reveal').dispatch('click'));
    assert.equal(h.errors.length, 1); assert.match(h.errors[0], /Could not locate/); assert.equal(h.opened.length, 0); assert.equal(h.writes.length, 1);
});
for (const change of ['workspace-after-dismiss', 'different-category', 'new-snapshot', 'workspace-during-focus']) test(`reveal reports synchronous ${change} rather than a false success`, async () => {
    const h = flow(); await addToReading(h);
    const reveal = h.component.revealCatalogShortcut.bind(h.component);
    if (change === 'workspace-after-dismiss') h.component.revealCatalogShortcut = (result, dismiss) => reveal(result, () => { const closed = dismiss(); h.context.LocalItabWorkspaces.session = { id: 'new', generation: 1 }; return closed; });
    if (change === 'different-category' || change === 'new-snapshot') {
        const select = h.navigation.selectCategory.bind(h.navigation);
        h.navigation.selectCategory = category => { select(category); if (change === 'different-category') select('work'); else h.component.links = h.component.links.map(link => ({ ...link })); };
    }
    if (change === 'workspace-during-focus') {
        const target = h.tile(1).querySelector('.shortcut-launch'), focus = target.focus.bind(target);
        target.focus = () => { focus(); h.context.LocalItabWorkspaces.session = { id: 'new', generation: 1 }; };
    }
    h.document.querySelector('.navigation-library-reveal').dispatch('click');
    assert.equal(h.errors.length, 1); assert.match(h.errors[0], /Could not locate/); assert.equal(h.opened.length, 0); assert.equal(h.writes.length, 1);
    if (change === 'workspace-after-dismiss') { assert.equal(h.preferences.length, 0); assert.equal(h.navigation.currentCategory, 'work'); }
});
test('new-category batch review adds only confirmed sites and explicitly reveals the first added card', async () => {
    const h = flow(); await h.view.open();
    h.document.querySelector('.navigation-library-new-category').dispatch('click');
    const name = h.document.querySelector('.navigation-library-new-category-panel input'); name.value = 'Discovery reading'; name.dispatch('input');
    for (const id of ['chatgpt', 'github']) {
        const card = h.document.querySelectorAll('article').find(node => node.dataset.site === id), checkbox = card.querySelector('input');
        checkbox.checked = true; checkbox.dispatch('change');
    }
    h.document.querySelector('.navigation-library-batch-review').dispatch('click'); assert.equal(h.writes.length, 0);
    h.document.querySelector('.navigation-library-batch-confirm').dispatch('click'); await tick(); await tick();
    assert.equal(h.writes.length, 1); assert.equal(h.raw.links.length, 3); const destination = h.raw.categories.find(category => category.name === 'Discovery reading').id;
    assert.equal(h.navigation.currentCategory, 'work'); const reveal = h.document.querySelector('.navigation-library-reveal'); assert.match(reveal.textContent, /first added/); assert.equal(reveal.hidden, false);
    reveal.dispatch('click'); assert.equal(h.navigation.currentCategory, destination); assert.equal(h.document.activeElement, h.tile(1).querySelector('.shortcut-launch')); assert.equal(h.opened.length, 0); assert.equal(h.writes.length, 1);
});
test('changing the next-add destination does not retarget the last verified reveal', async () => {
    const h = flow(); await addToReading(h); const destination = h.document.querySelector('.navigation-library-destination select'); destination.value = 'work'; destination.dispatch('change');
    h.document.querySelector('.navigation-library-reveal').dispatch('click'); assert.equal(h.navigation.currentCategory, 'reading'); assert.equal(h.document.activeElement, h.tile(1).querySelector('.shortcut-launch')); assert.equal(h.writes.length, 1);
});
test('an all-duplicate transaction issues no reveal for an existing same-URL card', async () => {
    const h = flow(); await addToReading(h); h.view.close(); const baseline = await h.storage.readNavigationLibrarySnapshot();
    const result = await h.component.addCatalogShortcut({ baseline: baseline.state, site: { name: 'ChatGPT', url: 'https://chatgpt.com/', icon: '✦' }, destination: 'work' });
    assert.equal(result.duplicate, true); assert.equal(h.component.canRevealCatalogShortcut(result), false); assert.equal(h.component.revealCatalogShortcut(result), false); assert.equal(h.writes.length, 1); assert.equal(h.preferences.length, 0);
});
for (const mismatch of ['count', 'prefix', 'adopted-target']) test(`receipt refuses unproven ${mismatch} even after a successful storage response`, async () => {
    const h = flow(); const original = h.storage.addCatalogShortcut.bind(h.storage);
    if (mismatch !== 'adopted-target') h.storage.addCatalogShortcut = async request => {
        const saved = await original(request);
        if (mismatch === 'count') saved.duplicate = true;
        else saved.links[0].title = 'Unexpected prefix';
        return saved;
    };
    else { const adopt = h.component.adoptShortcutSnapshot.bind(h.component); h.component.adoptShortcutSnapshot = snapshot => { adopt(snapshot); h.component.links[h.component.links.length - 1].title = 'Changed during adoption'; }; }
    await addToReading(h); assert.equal(h.writes.length, 1); assert.equal(h.component.canRevealCatalogShortcut(h.results[0]), false); assert.equal(h.document.querySelector('.navigation-library-reveal').hidden, true); assert.equal(h.preferences.length, 0); h.view.close();
});
test('free-layout current-category add makes reveal available after its normal missing-position save settles', async () => {
    const h = flow({ free: true }); await addToReading(h, 'work');
    assert.equal(h.errors.length, 0, h.errors.join('\n')); const controller = h.component.layoutController;
    assert.equal(h.raw.links.length, 2); assert(controller.timer || controller.pending, 'real layout controller schedules the newly visible card position');
    await new Promise(resolve => setTimeout(resolve, 350)); await controller.queue; await tick();
    assert.equal(controller.pending, 0); assert.equal(controller.timer, null); assert.equal(controller.failedChange, null);
    const reveal = h.document.querySelector('.navigation-library-reveal'); assert.equal(reveal.hidden, false, 'settled normal layout work must not leave reveal permanently hidden');
    reveal.dispatch('click'); assert.equal(h.document.activeElement, h.tile(1).querySelector('.shortcut-launch')); assert.equal(h.opened.length, 0);
    assert.equal(h.raw.links[1].title, 'ChatGPT'); assert.equal(Object.keys(h.raw.layout.positionsById[h.raw.links[1].layoutId]).includes('work'), true);
});
test('delayed delivery of a verified free-layout add cannot permanently hide reveal after layout settlement', async () => {
    const h = flow({ free: true }), add = h.component.addCatalogShortcut.bind(h.component);
    h.component.addCatalogShortcut = async request => { const saved = await add(request); await tick(); return saved; };
    await addToReading(h, 'work'); assert(h.component.layoutController.timer || h.component.layoutController.pending);
    await new Promise(resolve => setTimeout(resolve, 350)); await h.component.layoutController.queue; await tick();
    assert.equal(h.component.canRevealCatalogShortcut(h.results[0]), true);
    const reveal = h.document.querySelector('.navigation-library-reveal'); assert.equal(reveal.hidden, false, 'receipt became safe after its original completion UI was rendered');
    reveal.dispatch('click'); assert.equal(h.document.activeElement, h.tile(1).querySelector('.shortcut-launch')); assert.equal(h.opened.length, 0);
});
test('free-layout other-category add reveals its exact card and lets normal target positions settle', async () => {
    const h = flow({ free: true }); await addToReading(h); const reveal = h.document.querySelector('.navigation-library-reveal');
    assert.equal(reveal.hidden, false); assert.equal(h.navigation.currentCategory, 'work'); reveal.dispatch('click');
    assert.equal(h.navigation.currentCategory, 'reading'); assert.equal(h.document.activeElement, h.tile(1).querySelector('.shortcut-launch')); assert.equal(h.opened.length, 0);
    await new Promise(resolve => setTimeout(resolve, 350)); await h.component.layoutController.queue; await tick();
    assert.equal(h.raw.links[1].title, 'ChatGPT'); assert.equal(h.raw.links[1].category, 'reading');
    assert.ok(h.raw.layout.positionsById[h.raw.links[1].layoutId].reading); assert.equal(h.component.layoutController.failedChange, null);
});
test('queued layout refresh is cancelled by close and cannot alter a newer opening', async () => {
    const h = flow(); await addToReading(h); const old = h.document.querySelector('.navigation-library-reveal');
    h.view.refreshRevealAfterLayout(); h.view.close(); await h.view.open(); await new Promise(resolve => setTimeout(resolve, 5));
    const current = h.document.querySelector('.navigation-library-reveal'); assert.notEqual(current, old); assert.equal(current.hidden, true); assert.equal(h.navigation.currentCategory, 'work'); assert.equal(h.preferences.length, 0); h.view.destroy();
});
test('layout availability refresh coalesces without moving focus and destroy cancels the pending turn', async () => {
    const h = flow(); await addToReading(h); const timers = new Map(); let serial = 0;
    h.context.setTimeout = fn => { const id = ++serial; timers.set(id, fn); return id; }; h.context.clearTimeout = id => timers.delete(id);
    const focused = h.document.activeElement, writes = h.writes.length;
    h.view.refreshRevealAfterLayout(); h.view.refreshRevealAfterLayout(); h.view.refreshRevealAfterLayout(); assert.equal(timers.size, 1);
    for (const fn of timers.values()) fn(); timers.clear(); assert.equal(h.document.activeElement, focused); assert.equal(h.writes.length, writes);
    h.view.refreshRevealAfterLayout(); assert.equal(timers.size, 1); h.view.destroy(); assert.equal(timers.size, 0);
});
test('a replaced layout controller cannot schedule reveal refresh through its retained render callback', async () => {
    const h = flow({ free: true }); await h.view.open(); const old = h.component.layoutController;
    let refreshes = 0; h.view.refreshRevealAfterLayout = () => { refreshes++; }; h.component.layoutController = {};
    old.render(old.confirmed, 'saved'); assert.equal(refreshes, 0); h.view.close();
});
