// One complete synthetic import journey. Real workspace sessions, Options,
// File reader, planner, storage writer and Finder subscription; no native UI.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { File } = require('node:buffer');
const { fixture, withGlobals, seed, boot, storageFor, values, clone, Workspaces } = require('./helpers/complete-import-receipt-fixture');
const { createDocument } = require('./helpers/task-dom-model');
const { createDocument: finderDocument } = require('./helpers/finder-dom-model');
const Tasks = require('../shared/local-tasks-store');
const Parser = require('../shared/bookmark-import');
const tick = () => new Promise(setImmediate);
const text = node => (node.textContent || '') + [...node.children].map(text).join(' ');
const read = path => fs.readFileSync(path, 'utf8');
function optionsPage(f, storage, config) {
    const document = createDocument();
    for (const [tag, id] of [['ul', 'category-manage-list'], ['button', 'add-category'], ['div', 'bookmark-import']]) {
        const node = document.createElement(tag); node.id = id; document.body.append(node);
    }
    const context = { document, window: { LocalItabBookmarkImport: Parser, addEventListener() {} }, chrome: f.chrome,
        navigator: { locks: f.locks }, crypto, storageManager: storage, console, URL, setTimeout, clearTimeout, confirm: () => false };
    vm.createContext(context);
    vm.runInContext(read('options.js') + '\nshowMessage = () => {}; displayStorageInfo = async () => {};', context);
    context.initialConfig = clone(config); context.setupCategoryManagement(clone(config.categories));
    vm.runInContext('settingsFormConfig = initialConfig; settingsBaseline = storageManager.settingsSnapshot(initialConfig); settingsFormBaseline = collectFormData();', context);
    vm.runInContext(read('shared/bookmark-import-view.js'), context); context.setupBookmarkImport();
    return { context, document, view: context.window.bookmarkImportView };
}
function finderPage(f, storage, config) {
    const document = finderDocument(), host = document.createElement('header'); document.body.append(host);
    const context = { document, storageManager: storage, chrome: f.chrome, navigator: { locks: f.locks }, URL, console,
        setTimeout, clearTimeout, addEventListener() {}, removeEventListener() {},
        open() { assert.fail('This journey must not navigate to imported sites'); },
        getComputedStyle: node => ({ visibility: node.style.visibility || 'visible' }) };
    context.window = context; vm.createContext(context);
    for (const name of ['dialog-focus', 'shortcut-finder', 'shortcut-finder-view', 'shortcut-finder-host']) vm.runInContext(read(`shared/${name}.js`), context);
    vm.runInContext(read('newtab.js') + '\nthis.ActualShortcuts = ShortcutsComponent;', context);
    const component = new context.ActualShortcuts(config.links, config.layout, config.categories, config._layoutBaseline);
    const view = context.LocalItabFinder.mountForShortcuts(host, component);
    host.querySelector('button').dispatch('click');
    return { document, component, view };
}
test('named-workspace file import updates an already-open Finder without adopting tiles or changing other workspace content', async t => {
    const f = fixture(seed());
    await withGlobals(f, async () => {
        const initial = await boot(f), created = await initial.manager.create('Import destination');
        const session = initial.manager.capture(created.id); await session.ready();
        const config = seed(); config.categories = [{ id: 'work', name: 'Research', icon: 'R' }];
        config.links = [{ title: 'Retained site', url: 'https://retained.example/', category: 'work', icon: 'R' }];
        config.quote = 'Keep this nonempty local module'; await session.local.set(Object.fromEntries(Object.entries(config).filter(([key]) => Workspaces.SCOPED_KEYS.includes(key))));
        const tasks = new Tasks.Store(session.createBackend(Tasks.KEY), { id: f.nextId, now: () => '2026-10-24T00:00:00.000Z' });
        await tasks.mutate(tasks.request('add', { text: 'Keep this existing task' }));
        const storage = storageFor(f, session), current = await storage.getAll();
        const dashboardStorage = storageFor(f, initial.manager.capture(created.id)); await dashboardStorage.workspace.ready();
        const options = optionsPage(f, storage, current), finder = finderPage(f, dashboardStorage, current);
        t.after(() => { options.view.destroy(); finder.view.destroy(); }); await tick();
        const query = finder.document.querySelector('.finder-input'); query.value = 'Imported unique'; query.dispatch('input');
        assert.equal(finder.document.querySelectorAll('.finder-result').length, 0);
        const originalTiles = finder.component.links, before = clone(values(f, created.id));
        const defaultBefore = clone(values(f)), writes = f.writes.length;
        const file = options.document.querySelector('.bookmark-import-file');
        file.files = [new File(['<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><DT><H3>Research</H3><DL><DT><A HREF="https://new.example/path?q=synthetic#part">Imported unique</A></DL></DL>'], 'synthetic.html', { type: 'text/html' })];
        file.dispatch('change'); await options.view.pending;
        assert.equal(f.writes.length, writes); assert.deepEqual(values(f, created.id), before);
        assert.match(text(options.document.querySelector('.bookmark-import-mapping')), /Research \(2\)/);
        options.document.querySelector('.bookmark-import-apply').dispatch('click'); await options.view.pending; await tick();
        assert.match(options.document.querySelector('.bookmark-import-status').textContent, /^Bookmarks added: 1/);
        const after = values(f, created.id), row = finder.document.querySelector('.finder-result');
        assert.ok(row, 'real Session notification updates the already-open Finder without manual refresh');
        assert.match(text(row), /Imported unique/); assert.match(text(row), /Research \(2\)/);
        assert.match(text(row), /https:\/\/new.example\/path\?q=synthetic#part/);
        assert.deepEqual(after.links.slice(0, before.links.length), before.links);
        assert.deepEqual(after.categories.slice(0, before.categories.length), before.categories);
        assert.notEqual(after.categories.at(-1).id, 'work'); assert.equal(after.categories.at(-1).name, 'Research (2)');
        const allowed = new Set(['links', 'categories', storage.layoutGenerationKey]);
        for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) if (!allowed.has(key)) assert.deepEqual(after[key], before[key], key);
        assert.deepEqual(values(f), defaultBefore); assert.equal(finder.component.links, originalTiles);
        assert.deepEqual(finder.component.links, current.links, 'Finder deliberately does not adopt records into the open tile editor');
        assert.equal(f.providers.length, 0); assert.equal(f.writes.length, writes + 1);
        assert.ok(Object.hasOwn(f.writes.at(-1), Workspaces.bundleKey(created)));
    });
});
