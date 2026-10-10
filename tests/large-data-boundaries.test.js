'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const tasks = require('../shared/local-tasks-store');
const { Controller } = require('../shared/local-tasks-controller');
const { createDocument } = require('./helpers/task-dom-model');
const importer = require('../shared/bookmark-import');
const exporter = require('../shared/bookmark-export');
const StorageManager = require('../storage');
const Identity = require('../shared/layout-identity');
const date = '2026-10-10T00:00:00.000Z';
const id = i => `l_${i.toString(16).padStart(32, '0')}`;
function maxTasks() {
    const state = tasks.initial(); state.enabled = true;
    state.records = Array.from({length: 500}, (_, i) => {
        const prefix = `Batch ${i % 10} 中文😀 Café ${i}: `;
        const text = prefix + 'x'.repeat(1000 - Array.from(prefix).length);
        return {id: `task_${i.toString().padStart(5,'0')}`, version: `version_${i}`, text,
            state: ['active','done','removed'][i % 3], removedFrom: i % 3 === 2 ? 'active' : null, createdAt: date, updatedAt: date};
    }); state.pinnedId = state.records[0].id; return tasks.validate(state);
}
function taskStore(initial) {
    let raw = structuredClone(initial), queue = Promise.resolve(), sequence = 0, writes = 0;
    const backend = { lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() { return structuredClone(raw); }, async write(value) { raw = structuredClone(value); writes++; }, subscribe() { return () => {}; } };
    const store = new tasks.Store(backend, {now: () => date, id: () => `mutation_${++sequence}`});
    return {store, get raw() { return raw; }, get writes() { return writes; }};
}
test('500 Tasks at 1,000 code points each: exact counts, safe capacity refusal, roundtrip and stable task IDs', async t => {
    const state = maxTasks(), source = taskStore(state);
    assert.deepEqual(tasks.counts(state), {active: 167, done: 167, removed: 166, recovery: 0});
    assert(state.records.every(record => Array.from(record.text).length === 1000));
    const json = await source.store.export(); assert(Buffer.byteLength(json) < tasks.LIMITS.bytes);
    const file = tasks.parseBackup(json); assert.deepEqual(file.content.records, state.records); assert.equal(file.content.pinnedId, state.pinnedId);
    await assert.rejects(source.store.mutate(source.store.request('add', {text: '501st'})), {code: 'CAPACITY'});
    assert.equal(source.writes, 0); assert.deepEqual(source.raw, state);
    const destination = taskStore(undefined), review = await destination.store.review(json);
    assert.equal(destination.writes, 0); assert.deepEqual(review.incoming, {active: 167, done: 167, removed: 166, recovery: 0});
    const migrated = await destination.store.mutate(destination.store.request('replace', review));
    const stripVersions = records => records.map(({version, ...rest}) => rest);
    assert.deepEqual(stripVersions(migrated.records), stripVersions(state.records)); assert.equal(migrated.pinnedId, state.pinnedId);
    assert.equal(new Set(migrated.records.map(t => t.id)).size, 500); assert.equal(migrated.recovery.length, 1);
    assert(migrated.records.every((record, i) => record.version !== state.records[i].version));
    const roundtrip = tasks.parseBackup(await destination.store.export()); assert.deepEqual(roundtrip.content.records, migrated.records);
    const before = structuredClone(destination.raw), writes = destination.writes;
    await assert.rejects(destination.store.mutate(destination.store.request('edit', {id: migrated.records[0].id, version: migrated.records[0].version, text: '中'.repeat(1001)})), {code: 'TEXT_LIMIT'});
    assert.equal(destination.writes, writes); assert.deepEqual(destination.raw, before);
    t.diagnostic(`Synthetic task export: ${Buffer.byteLength(json)} UTF-8 bytes; all 500 records remain exact.`);
});
test('500 Tasks: actual view model filters all states, keeps exact counts and remains bounded by 500 rows', async () => {
    const fixture = taskStore(maxTasks()), controller = new Controller(fixture.store);
    const document = createDocument(), host = document.createElement('article'); document.body.append(host);
    const api = {...tasks, Controller}, context = {window: {LocalItabTasks: api}, document, crypto: webcrypto, setTimeout, URL, Blob};
    vm.createContext(context);
    for (const file of ['dialog-focus', 'local-tasks-view']) vm.runInContext(fs.readFileSync(require.resolve(`../shared/${file}`), 'utf8'), context);
    const view = api.mount(host, {controller, alwaysVisible: true}); await controller.refresh();
    assert.equal(view.list.querySelectorAll('[data-task-id]').length, 4);
    assert.equal(view.completed.summary.textContent, 'Completed (167)'); assert.equal(view.removed.summary.textContent, 'Removed (166)');
    const filter = query => { view.filterInput.value = query; view.filterInput.dispatch('input'); };
    filter('中文😀'); assert.equal(view.filterStatus.textContent, 'Matching tasks: 500');
    assert.equal(host.querySelectorAll('[data-task-id]').length, 500); assert.equal(view.more.hidden, true);
    filter('Batch 9 '); assert.equal(view.filterStatus.textContent, 'Matching tasks: 50');
    const expected = fixture.raw.records.filter(record => record.text.includes('Batch 9 '));
    assert.deepEqual(new Set(host.querySelectorAll('[data-task-id]').map(node => node.dataset.taskId)), new Set(expected.map(record => record.id)));
    assert.equal(view.completed.summary.textContent, `Completed (${expected.filter(r => r.state === 'done').length})`);
    assert.equal(view.removed.summary.textContent, `Removed (${expected.filter(r => r.state === 'removed').length})`);
    filter('never-present'); assert.equal(host.querySelectorAll('[data-task-id]').length, 0); assert.match(view.filterStatus.textContent, /No matching tasks/);
    view.filterClear.dispatch('click'); assert.equal(view.list.querySelectorAll('[data-task-id]').length, 4); assert.equal(fixture.writes, 0);
    view.destroy();
});
const folder = (name, body) => `<DT><H3>${name}</H3><DL>${body}</DL>`;
const anchor = (url, title = 'Synthetic') => `<DT><A HREF="${url}">${title}</A>`;
function maximumBatch() {
    return '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL>' + Array.from({length: 200}, (_, f) => folder(`Imported ${f}`,
        Array.from({length: 10}, (_, j) => anchor(`https://new${f * 10 + j}.invalid/`, `中文 Café ${f * 10 + j}`)).join('') +
        Array.from({length: 20}, (_, j) => anchor(`https://saved${f * 20 + j}.invalid/`)).join('') +
        Array.from({length: 10}, (_, j) => anchor(`https://new${f * 10 + j}.invalid/`)).join('') +
        Array.from({length: 10}, () => anchor('javascript:invalid')).join(''))).join('') + '</DL>';
}
function savedCollection(size = 18000, categories = 1800) {
    return {links: Array.from({length: size}, (_, i) => ({title: `Saved ${i}`, url: `https://saved${i}.invalid/`, category: `c${i % categories}`, layoutId: id(i + 1), icon: '🌐'})),
        categories: Array.from({length: categories}, (_, i) => ({id: `c${i}`, name: `Folder ${i}`, icon: '📁'}))};
}
function bookmarkStore(collection) {
    const manager = new StorageManager(); let queue = Promise.resolve(), writes = 0, sequence = 18000;
    const state = {...structuredClone(manager.defaultConfig), ...structuredClone(collection)};
    state.layout = {...state.layout, identityVersion: 1, positionsById: Object.fromEntries(collection.links.map(link => [link.layoutId, {}]))};
    state.layout.positionsById[id(99999)] = {orphan: {x: 20, y: 30}}; state.schemaVersion = 2;
    Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {locks: { request(name, fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; }}}});
    Object.defineProperty(globalThis, 'crypto', {configurable: true, value: webcrypto});
    globalThis.chrome = {storage: {local: {async get(keys) { return structuredClone(Object.fromEntries(keys.filter(key => Object.hasOwn(state, key)).map(key => [key, state[key]]))); },
        async set(values) { writes++; Object.assign(state, structuredClone(values)); }}}};
    globalThis.fetch = () => assert.fail('network forbidden'); manager._syncInitialized = true;
    manager.ensureSyncInitialized = async () => assert.fail('providers forbidden'); manager.scheduleSyncPush = () => assert.fail('unexpected sync');
    manager.createLayoutIdentity = () => id(++sequence);
    return {manager, state, get writes() { return writes; }};
}
test('10,000-bookmark batch: 2,000 additions/200 categories reach supported 20,000/2,000 storage caps', async t => {
    const collection = savedCollection(), html = maximumBatch(), before = structuredClone(collection);
    const plan = importer.planImport(html, collection, {createCategoryId: ({index}) => `import_scale_${index}`});
    assert.deepEqual(collection, before); assert.equal(plan.preview.encounteredBookmarks, 10000);
    assert.equal(plan.preview.validBookmarks, 8000); assert.equal(plan.preview.addedBookmarks, 2000); assert.equal(plan.preview.newCategories, 200);
    assert.equal(plan.preview.skippedBookmarks, 8000); assert.equal(plan.preview.skippedReasons.duplicate_url, 6000); assert.equal(plan.preview.skippedReasons.invalid_url, 2000);
    assert.equal(plan.preview.skipExamples.length, 50); assert.equal(plan.preview.omittedSkipExamples, 7950); assert.equal(plan.preview.folderMapping.length, 200);
    const f = bookmarkStore(collection), snapshot = await f.manager.getBookmarkImportSnapshot();
    const result = await f.manager.appendBookmarkImport({text: html, expectedSnapshot: snapshot, expectedPrivacy: snapshot.privacy, batchId: 'scale', rootLabel: 'Imported bookmarks'});
    assert.equal(result.applied, true); assert.equal(f.writes, 1); assert.equal(f.state.links.length, 20000); assert.equal(f.state.categories.length, 2000);
    assert.deepEqual(f.state.links.slice(0, 18000), before.links); assert.deepEqual(f.state.categories.slice(0, 1800), before.categories);
    assert.equal(new Set(f.state.links.map(link => link.layoutId)).size, 20000); Identity.validateBundle(f.state);
    assert.deepEqual(f.state.layout.positionsById[id(99999)], {orphan: {x: 20, y: 30}});
    const current = await f.manager.getBookmarkImportSnapshot();
    const duplicate = await f.manager.appendBookmarkImport({text: html, expectedSnapshot: current, expectedPrivacy: current.privacy, batchId: 'duplicate', rootLabel: 'Imported bookmarks'});
    assert.equal(duplicate.applied, false); assert.equal(duplicate.preview.skippedBookmarks, 10000); assert.equal(f.writes, 1);
    const exportHTML = exporter.serialize(f.state); assert.equal((exportHTML.match(/HREF=/g) || []).length, 20000); assert.equal((exportHTML.match(/<H3>/g) || []).length, 2000);
    assert.throws(() => importer.parse(exportHTML), {code: 'BOOKMARK_LIMIT'}, 'documented export/import caps differ');
    await assert.rejects(f.manager.appendBookmarkImport({text: '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL>' + anchor('https://overflow.invalid/') + '</DL>', expectedSnapshot: current, expectedPrivacy: current.privacy, batchId: 'overflow', rootLabel: 'Imported bookmarks'}), {code: 'BOOKMARK_IMPORT_STATE_LIMIT'});
    assert.equal(f.writes, 1); assert.deepEqual(f.state.links, result.snapshot.links);
    t.diagnostic(`Synthetic import ${Buffer.byteLength(html)} bytes; max export ${Buffer.byteLength(exportHTML)} bytes. Storage uses modeled Chrome APIs.`);
});
test('2,000-bookmark/200-folder HTML roundtrip retains full URLs, titles, folder order and within-folder order', () => {
    const collection = savedCollection(2000, 200);
    for (const link of collection.links) { link.title = `中文 Café & ${link.title}`; link.url += '?a=1&b=2#full'; }
    const html = exporter.serialize(collection), parsed = importer.parse(html);
    assert.equal(parsed.encountered, 2000); assert.equal(parsed.skipped.total, 0);
    const plan = importer.planImport(html, {links: [], categories: []}, {createCategoryId: ({index}) => `restored_${index}`});
    assert.equal(plan.preview.addedBookmarks, 2000); assert.equal(plan.preview.newCategories, 200);
    assert.deepEqual(plan.additions.categories.map(c => c.name), collection.categories.map(c => c.name));
    const originalByCategory = collection.categories.flatMap(c => collection.links.filter(l => l.category === c.id).map(l => [l.title, l.url, c.name]));
    const categoryNames = new Map(plan.additions.categories.map(c => [c.id, c.name]));
    assert.deepEqual(plan.additions.links.map(l => [l.title, l.url, categoryNames.get(l.category)]), originalByCategory);
});
