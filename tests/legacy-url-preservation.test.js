'use strict';
// Stored URL identity regression gate.
// Run explicitly with: node --test tests/legacy-url-preservation.test.js
// Every profile, record, URL and provider is synthetic and memory-only.
const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const Storage = require('../storage.js');
const Workspaces = require('../shared/workspaces.js');
const Identity = require('../shared/layout-identity.js');
const { createHarness } = require('./helpers/dashboard-harness');
const clone = value => structuredClone(value);
const id = value => `l_${value.repeat(32)}`;

function fixture(input) {
    const raw = clone(input), writes = [], providers = [], listeners = new Set(); let serial = 0;
    const pick = keys => keys === null || keys === undefined ? clone(raw) : Object.fromEntries(
        (typeof keys === 'string' ? [keys] : keys).filter(key => Object.hasOwn(raw, key)).map(key => [key, clone(raw[key])]));
    const local = {
        async get(keys) { return pick(keys); },
        async set(values) {
            writes.push(clone(values)); const changes = {};
            for (const [key, value] of Object.entries(values)) { changes[key] = { oldValue: clone(raw[key]), newValue: clone(value) }; raw[key] = clone(value); }
            for (const listener of listeners) listener(changes, 'local');
        },
        async remove() { assert.fail('compatibility must not delete stored data'); }
    };
    const forbidden = label => async () => { providers.push(label); throw Error('No provider access in this research'); };
    const chrome = { storage: { local, sync: { get: forbidden('sync.get'), set: forbidden('sync.set') },
        onChanged: { addListener: listener => listeners.add(listener), removeListener: listener => listeners.delete(listener) } },
        identity: { getAuthToken: forbidden('identity') }, permissions: { request: forbidden('permissions') } };
    // These tests are sequential. Lock interleavings belong to the existing
    // production queue/fault-injection matrix, not this migration-shape probe.
    const locks = { request(name, options, action) { return Promise.resolve().then(action || options); } };
    return { raw, writes, providers, chrome, locks,
        manager: () => Workspaces.createManager({ chrome, locks, now: () => '2026-10-14T00:00:00.000Z', id: () => `synthetic_${++serial}` }) };
}
async function withGlobals(f, fn) {
    const names = ['chrome', 'navigator', 'crypto'], before = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    for (const [name, value] of Object.entries({ chrome: f.chrome, navigator: { locks: f.locks }, crypto: webcrypto })) Object.defineProperty(globalThis, name, { configurable: true, value });
    try { return await fn(); } finally { for (const name of names) if (before[name]) Object.defineProperty(globalThis, name, before[name]); else delete globalThis[name]; }
}
function seeded(urls = ['https://example.com', 'https://example.com/'], identified = false) {
    const raw = new Storage().cloneDefaultConfig();
    raw.links = urls.map((url, index) => ({ title: `Synthetic saved link ${index}`, url, icon: '🔖', category: index ? 'social' : 'work', ...(identified ? { layoutId: id(String(index + 1)) } : {}) }));
    raw.layout = { ...raw.layout, autoArrange: false, alignToGrid: false,
        positions: Object.fromEntries(urls.flatMap((url, index) => [
            [`all|${url}`, { x: index * 100 + 11.25, y: -index * 20 - 7.5 }],
            [`hidden|view|${url}`, { x: index * 100 + 31.5, y: index * 20 + 9.25 }]
        ]).concat([['orphan|https://deleted.example/', { x: -17.5, y: 80.25 }]])) };
    if (identified) {
        raw.schemaVersion = 2; raw.layout.identityVersion = 1;
        raw.layout.positionsById = Object.fromEntries(raw.links.map((link, index) => [link.layoutId, {
            all: { x: index * 200 + 45.5, y: -index * 50 - 10.25 }, hidden: { x: index * 10 + 5, y: index * 20 + 6 }
        }]).concat([[id('f'), { orphaned: { x: 20.5, y: -90.75 } }]]));
    }
    raw.quote = 'Synthetic Unicode note 中文 🧭';
    raw.__syntheticOpaque = { retain: ['original', 1] };
    return raw;
}

for (const url of ['https://example.com', 'example.com']) test(`historically legal ${url} can start without rewriting original or recovery`, async () => {
    const original = seeded([url]), f = fixture(original), manager = f.manager(), session = manager.capture(); let failure;
    try { await session.ready(); } catch (error) { failure = error; }
    if (failure) { assert.deepEqual(f.raw, original); assert.equal(f.writes.length, 0); }
    assert.equal(failure?.code, undefined, 'legacy URL spelling must not be mistaken for corrupt content');
    for (const [key, value] of Object.entries(original)) assert.deepEqual(f.raw[key], value);
    assert.deepEqual(f.raw[Workspaces.SNAPSHOT_KEY].values, original);
    assert.deepEqual((await session.local.get(['links', 'layout'])), { links: original.links, layout: original.layout });
    assert.deepEqual(f.providers, []);
});

test('stored read projection preserves per-spelling coordinates in All and hidden views', async () => {
    const original = seeded(), f = fixture(original);
    await withGlobals(f, async () => {
        const storage = new Storage(); storage._syncInitialized = true;
        const config = await storage.getAll();
        assert.deepEqual(f.raw, original); assert.equal(f.writes.length, 0);
        const h = createHarness(config.links); h.component.positions = clone(config.layout.positions);
        for (const view of ['all', 'hidden|view']) for (let index = 0; index < original.links.length; index++) {
            assert.deepEqual(h.component.getSavedPosition(config.links[index], view), original.layout.positions[`${view}|${original.links[index].url}`]);
        }
        assert.deepEqual(await storage.get('links'), original.links, 'subsequent readers must preserve the same raw identity association');
    });
    assert.deepEqual(f.raw, original); assert.equal(f.writes.length, 0); assert.deepEqual(f.providers, []);
});

test('explicit URL-edit collision allocation must copy each original URL coordinate association', () => {
    const original = seeded(), storage = new Storage(), snapshot = storage.layoutSnapshot(original);
    let sequence = 2;
    const next = clone(snapshot.links); next[0].url = 'https://example.com/'; // Explicit URL edit colliding with the second record.
    const assignment = Identity.allocate(next, snapshot.layout, snapshot.links, { type: 'edit', index: 0 }, () => id(String(++sequence)));
    for (let index = 0; index < original.links.length; index++) {
        const link = assignment.links[index]; assert(link.layoutId, 'independent identities are required after a canonical collision');
        for (const view of ['all', 'hidden|view']) assert.deepEqual(assignment.layout.positionsById[link.layoutId][view], original.layout.positions[`${view}|${original.links[index].url}`]);
    }
    assert.deepEqual(assignment.layout.positions, original.layout.positions, 'orphan and legacy coordinates must also remain available');
});

test('title-only editor save preserves an unchanged historical URL and unrelated records', async () => {
    const original = seeded(), h = createHarness(original.links), writes = [];
    h.storageManager.set = async (...args) => { writes.push(args); return true; };
    h.component.openEditModal(0);
    h.component.modal.querySelector('#shortcut-title').value = 'Changed title only';
    assert.equal(h.component.modal.querySelector('#shortcut-url').value, original.links[0].url);
    await h.component.handleFormSubmit({ preventDefault() {} });
    assert.equal(writes.length, 1);
    assert.equal(h.component.links[0].url, original.links[0].url, 'a title edit must not rewrite the coordinate identity');
    assert.deepEqual(JSON.parse(JSON.stringify(h.component.links[1])), original.links[1]);
});

test('exact legacy links and layout survive portable export validation and re-import', () => {
    const original = seeded(), storage = new Storage();
    const archive = storage.completeBackupConfigFromRaw(original);
    const checked = storage.validateCompleteBackupConfig(archive);
    assert.deepEqual(checked.data.links, original.links);
    assert.deepEqual(checked.data.layout, original.layout);
    assert.deepEqual(storage.validateImportPayload(checked).links, original.links);
    assert.deepEqual(storage.validateImportPayload(checked).layout, original.layout);
});

test('existing schema-2 IDs and reserved/hidden positions remain exact with legacy URL spelling', async () => {
    const original = seeded(['https://example.com', 'https://example.com/'], true), f = fixture(original), manager = f.manager(), session = manager.capture();
    await session.ready();
    const data = await session.local.get(['links', 'layout']);
    assert.deepEqual(data.links, original.links); assert.deepEqual(data.layout, original.layout);
    assert.deepEqual(f.raw[Workspaces.SNAPSHOT_KEY].values, original); assert.deepEqual(f.providers, []);
});

for (const url of ['javascript:alert(1)', 'data:text/html,synthetic', '//example.com', 'https://exa mple.com', 'https:\\example.com']) test(`control: unsupported legacy spelling remains fail-closed (${url})`, async () => {
    const original = seeded([url]), f = fixture(original);
    await assert.rejects(f.manager().capture().ready());
    assert.deepEqual(f.raw, original); assert.equal(f.writes.length, 0); assert.deepEqual(f.providers, []);
});

test('control: unknown link fields are not dropped to make an upgrade succeed', async () => {
    const original = seeded(['https://example.com/']); original.links[0].unknownMeaning = { keep: true };
    const f = fixture(original); await assert.rejects(f.manager().capture().ready());
    assert.deepEqual(f.raw, original); assert.equal(f.writes.length, 0);
});

for (const operation of ['shortcut edit', 'layout patch']) test(`${operation} detects a concurrent raw URL spelling change before any write`, async () => {
    const original = seeded(['https://example.com']), f = fixture(original);
    await withGlobals(f, async () => {
        const storage = new Storage(); storage._syncInitialized = true;
        const expected = { links: clone(original.links), layout: clone(original.layout), generation: null };
        f.raw.links[0].url = 'https://example.com/'; const concurrent = clone(f.raw); let failure;
        try {
            if (operation === 'shortcut edit') await storage.set('links', [{ ...original.links[0], title: 'Synthetic pending edit' }], {
                expectedLinks: expected.links, expectedLayoutGeneration: null, operation: { type: 'edit', index: 0 }
            });
            else await storage.applyLayoutPatch({}, { 'all|https://example.com': { x: 500, y: 600 } }, expected);
        } catch (error) { failure = error; }
        assert.equal(failure?.code, operation === 'shortcut edit' ? 'LINKS_CONFLICT' : 'LAYOUT_CONTEXT_CHANGED');
        assert.deepEqual(f.raw, concurrent); assert.equal(f.writes.length, 0);
    });
});

test('delete then explicit Undo restores exact historical URL rows and every position', async () => {
    const original = seeded(), f = fixture(original);
    await withGlobals(f, async () => {
        const storage = new Storage(); storage._syncInitialized = true;
        const deleted = await storage.deleteShortcutWithUndo(0, { expectedLinks: original.links, expectedLayoutGeneration: null });
        assert.deepEqual(f.raw.links, [original.links[1]]); assert.deepEqual(f.raw.layout, original.layout);
        await storage.undoShortcutDeletion(deleted.receipt);
        assert.deepEqual(f.raw.links, original.links); assert.deepEqual(f.raw.layout, original.layout);
    });
    assert.deepEqual(f.providers, []);
});

test('category move changes only the selected category, retaining raw URL and hidden layout', async () => {
    const original = seeded(), f = fixture(original);
    await withGlobals(f, async () => {
        const storage = new Storage(); storage._syncInitialized = true;
        const snapshot = await storage.readShortcutOrganizerSnapshot();
        await storage.moveShortcutsToCategory({ indices: [0], destination: 'social', baseline: snapshot.state });
        assert.deepEqual(f.raw.links, [{ ...original.links[0], category: 'social' }, original.links[1]]);
        assert.deepEqual(f.raw.layout, original.layout);
    });
    assert.deepEqual(f.providers, []);
});

test('manual JSON export and recovery preserve original URL-to-position associations', async () => {
    const original = seeded(), storage = new Storage();
    const exported = storage.buildManualExportPayload(original);
    assert.deepEqual(exported.data.links, original.links); assert.deepEqual(exported.data.layout, original.layout);
    const restored = storage.validateImportPayload(exported);
    assert.deepEqual(restored.links, original.links); assert.deepEqual(restored.layout, original.layout);
    const before = clone(original), recovery = await storage.makeRecovery(original, 'synthetic-test');
    assert.deepEqual(recovery.payload.data.links, original.links); assert.deepEqual(recovery.payload.data.layout, original.layout);
    assert.deepEqual(original, before);
});

test('existing-state bookmark admission preserves a schemeless saved row', async () => {
    const original = seeded(['example.com']), f = fixture(original);
    await withGlobals(f, async () => {
        const storage = new Storage(); storage._syncInitialized = true;
        const snapshot = await storage.getBookmarkImportSnapshot();
        assert.deepEqual(snapshot.links, original.links); assert.deepEqual(snapshot.layout, original.layout);
    });
    assert.deepEqual(f.raw, original); assert.equal(f.writes.length, 0);
});

test('catalog detects schemeless saved destinations without changing stored rows', () => {
    const catalog = require('../shared/navigation-catalog.js'), original = seeded(['example.com']), before = clone(original);
    assert(catalog.savedURLs(original.links).has('https://example.com/'));
    assert.deepEqual(catalog.savedLocations(original.links, original.categories).get('https://example.com/'), [{ id: 'work', name: 'Work' }]);
    assert.deepEqual(original, before);
});

test('bookmark HTML derives an absolute safe destination while JSON identity remains untouched', () => {
    const exporter = require('../shared/bookmark-export.js'), original = seeded(['example.com']), before = clone(original);
    const html = exporter.serialize(original);
    assert(html.includes('HREF="https://example.com/"'));
    assert.deepEqual(original, before);
});
