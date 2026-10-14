const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const StorageManager = require('../storage.js');
const { createDocument } = require('./helpers/task-dom-model');
const tick = () => new Promise(setImmediate);

// Real Store -> ShortcutsComponent -> Layout.Controller, with synthetic local
// storage notifications arriving both during the write and after adoption.
for (const omitted of [['icon'], ['category'], ['icon', 'category']]) {
    for (const timing of ['during-write', 'after-adoption']) for (const identity of [false, true]) {
        test(`legacy ${omitted.join('/')} layout remains usable: ${timing}, identity=${identity}`, async () => {
            const raw = { links: [{ title: 'Synthetic old', url: 'https://example.invalid/old', icon: 'O', category: 'work', extra: { keep: true } }],
                categories: [{ id: 'work', name: 'Work', icon: 'W' }], layout: { autoArrange: true, positions: {} },
                privacy: { onlineFavicons: false }, sync: { enabled: false } };
            for (const field of omitted) delete raw.links[0][field];
            const id = n => 'l_' + String(n).padStart(32, '0');
            if (identity) {
                raw.schemaVersion = 2; raw.links[0].layoutId = id(1);
                raw.layout.identityVersion = 1; raw.layout.positionsById = { [id(1)]: { work: { x: 12, y: 34 } } };
            }
            const before = structuredClone(raw), storage = new StorageManager();
            storage._syncInitialized = true;
            let queue = Promise.resolve(), controller, writes = 0, serial = 1;
            storage.createLayoutIdentity = () => id(++serial);
            storage.withLocalWriteLock = work => { const result = queue.then(work); queue = result.catch(() => {}); return result; };
            Object.defineProperty(storage, '_local', { value: {
                async get() { return structuredClone(raw); },
                async set(value) {
                    writes++; Object.assign(raw, structuredClone(value));
                    if (timing === 'during-write') void controller.refresh();
                }
            } });
            storage.scheduleShortcutUndoSync = async () => {};
            const document = createDocument(), context = { document, storageManager: storage, URL, console, setTimeout, clearTimeout, addEventListener() {} };
            context.window = context; vm.createContext(context);
            vm.runInContext(fs.readFileSync('shared/layout.js', 'utf8'), context);
            vm.runInContext(fs.readFileSync('newtab.js', 'utf8') + '\nthis.ShortcutsComponent=ShortcutsComponent;', context);
            const initial = storage.layoutSnapshot(raw), component = new context.ShortcutsComponent(initial.links);
            component.refreshShortcutUndo = () => {}; component.updateGrid = () => {};
            controller = component.layoutController = new context.LocalItabLayout.Controller({ storage, initial: initial.layout,
                baseline: initial, getLinks: () => component.links });
            for (const suffix of ['first', 'second']) {
                const baseline = (await storage.readNavigationLibrarySnapshot()).state;
                const saved = await component.addCatalogShortcut({ baseline, destination: 'work',
                    site: { name: suffix, url: `https://example.invalid/${suffix}`, icon: 'N' } });
                if (timing === 'after-adoption') await controller.refresh();
                await tick(); await tick();
                assert.equal(controller.invalidated, false);
                assert.equal(controller.failedChange, null);
                assert.deepEqual(component.links, storage.validateLinksConfig(raw.links));
                assert.deepEqual(saved.links[0], before.links[0]); assert.deepEqual(saved.state.links[0], before.links[0]);
                assert.deepEqual(raw.links[0], before.links[0]);
                assert.equal(await controller.flush(), undefined);
                const duplicate = await component.addCatalogShortcut({ baseline: saved.state, destination: 'work',
                    site: { name: suffix, url: `https://example.invalid/${suffix}`, icon: 'N' } });
                assert.equal(duplicate.duplicate, true);
                await controller.refresh();
                assert.equal(controller.invalidated, false);
                assert.deepEqual(duplicate.links[0], before.links[0]);
            }
            assert.equal(writes, 2); assert.deepEqual(raw.categories, before.categories);
            if (identity) assert.deepEqual(raw.layout.positionsById[id(1)], before.layout.positionsById[id(1)]);
            else assert.deepEqual(raw.layout, before.layout);
        });
    }
}
