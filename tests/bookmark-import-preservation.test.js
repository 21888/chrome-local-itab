const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const StorageManager = require('../storage.js');
const Identity = require('../shared/layout-identity.js');
const Tasks = require('../shared/local-tasks-store.js');
const Focus = require('../shared/local-focus-store.js');
const { createHarness } = require('./helpers/dashboard-harness.js');

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const existingPositionKey = 'all|https://existing.example/';
const importedURL = 'https://new.example/path';
const input = `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><DT><A HREF="${importedURL}">New bookmark</A></DL>`;

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

// Separate queues model Web Locks: configuration writes serialize together,
// while the dedicated Tasks and Focus stores can commit during an import.
function fixture(identity) {
    const manager = new StorageManager();
    const state = clone(manager.defaultConfig);
    const hooks = {};
    const queues = new Map();
    let nextIdentity = 0;
    state.links = [{ title: 'Existing', url: 'https://existing.example/', icon: '🌐', category: 'work' }];
    state.layout.autoArrange = false;
    state.layout.alignToGrid = false;
    state.layout.positions = {
        [existingPositionKey]: { x: 13.25, y: 83.5 },
        'hidden|orphan': { x: 234.5, y: -22 }
    };
    if (identity) {
        const id = `l_${'a'.repeat(32)}`;
        state.links[0].layoutId = id;
        state.layout.identityVersion = 1;
        state.layout.positionsById = {
            [id]: { all: { x: 13.25, y: 83.5 }, hidden: { x: 250, y: -2 } }
        };
    }
    state[Tasks.KEY] = Tasks.initial();
    state[Focus.KEY] = Focus.initial();

    const locks = {
        request(name, options, callback) {
            const operation = callback || options;
            const result = (queues.get(name) || Promise.resolve()).then(operation);
            queues.set(name, result.catch(() => {}));
            return result;
        }
    };
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks } });
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
    globalThis.chrome = {
        storage: {
            local: {
                async get(keys) {
                    return clone(keys === null ? state : Object.fromEntries(
                        keys.filter(key => Object.hasOwn(state, key)).map(key => [key, state[key]])
                    ));
                },
                async set(values) {
                    await hooks.beforeWrite?.(values);
                    Object.assign(state, clone(values));
                },
                async remove(keys) {
                    for (const key of keys) delete state[key];
                }
            }
        }
    };
    globalThis.fetch = () => { throw new Error('Network is forbidden in preservation tests'); };
    manager._syncInitialized = true;
    manager.ensureSyncInitialized = async () => {};
    manager.createLayoutIdentity = () => `l_${(++nextIdentity).toString(16).padStart(32, '0')}`;
    return {
        manager,
        state,
        hooks,
        snapshot: () => manager.getBookmarkImportSnapshot(),
        append: snapshot => manager.appendBookmarkImport({
            text: input,
            expectedSnapshot: snapshot,
            expectedPrivacy: snapshot.privacy,
            batchId: 'preservation',
            rootLabel: 'Imported bookmarks'
        })
    };
}

function pauseFirstWrite(fixture) {
    const entered = deferred();
    const release = deferred();
    let count = 0;
    fixture.hooks.beforeWrite = async () => {
        if (++count !== 1) return;
        entered.resolve();
        await release.promise;
    };
    return { entered: entered.promise, release: release.resolve };
}

for (const identity of [false, true]) {
    const mode = identity ? 'identity' : 'legacy';

    for (const operation of ['reset', 'restore']) {
        for (const first of ['import', 'other']) {
            test(`${mode}: ${operation} and import serialize with ${first} first`, async () => {
                const f = fixture(identity);
                const snapshot = await f.snapshot();
                const prior = clone(f.state);
                const replacement = clone(f.manager.defaultConfig);
                replacement.links = [{ title: 'Restored', url: 'https://restored.example/', icon: 'R', category: 'work' }];
                const other = () => operation === 'reset' ? f.manager.clear() : f.manager.setAll(replacement, {
                    confirmedRestore: true,
                    skipSyncInitialization: true,
                    skipSyncSideEffects: true
                });
                const gate = pauseFirstWrite(f);
                const leading = first === 'import' ? f.append(snapshot) : other();
                await gate.entered;
                const trailing = first === 'import' ? other() : f.append(snapshot);
                const outcome = trailing.then(value => ({ value }), error => ({ error }));
                gate.release();
                await leading;
                const result = await outcome;

                if (first === 'other') assert.equal(result.error?.code, 'BOOKMARK_IMPORT_CONFLICT');
                else assert.equal(result.value, true);
                assert.deepEqual(f.state[Tasks.KEY], prior[Tasks.KEY]);
                assert.deepEqual(f.state[Focus.KEY], prior[Focus.KEY]);
                if (operation === 'reset') assert.equal(f.state.links, undefined);
                else assert.deepEqual(f.state.links, replacement.links);
                // A later explicit restore replaces the imported list by design,
                // but its recovery snapshot must include the completed import.
                if (operation === 'restore' && first === 'import') {
                    assert(f.state.__localItabRestoreRecovery.payload.data.links.some(link => link.url === importedURL));
                }
            });
        }
    }

    test(`${mode}: imported manual positions initialize once without changing historic coordinates`, async () => {
        const f = fixture(identity);
        const prior = clone(f.state);
        await f.append(await f.snapshot());
        const h = createHarness(f.state.links);
        const component = h.component;
        h.context.window.LocalItabIdentity = Identity;
        h.context.window.categoryNavigation.currentCategory = 'all';
        h.context.window.categoryNavigation.filterShortcuts({ reflow: false });
        component.layout = clone(f.state.layout);
        component.positions = component.layout.positions;
        component.identityPositions = component.layout.positionsById || {};
        const expected = await f.manager.getLayoutSnapshotForUpdate();
        let saved;
        component.saveLayoutDebounced = (positions, identityPositions) => {
            saved = f.manager.applyLayoutPatch({}, positions, expected, () => {}, identityPositions);
        };
        component.initializeMissingPositions();
        assert(saved);
        await saved;

        assert.deepEqual(f.state.layout.positions[existingPositionKey], prior.layout.positions[existingPositionKey]);
        assert.deepEqual(f.state.layout.positions['hidden|orphan'], prior.layout.positions['hidden|orphan']);
        const imported = f.state.links.at(-1);
        const point = identity ? f.state.layout.positionsById[imported.layoutId].all : f.state.layout.positions[`all|${imported.url}`];
        // Existing y=83.5 + modeled tile height=80 + gap=16.
        assert.deepEqual(point, { x: 0, y: 179.5 });
        if (identity) {
            const id = prior.links[0].layoutId;
            assert.deepEqual(f.state.layout.positionsById[id], prior.layout.positionsById[id]);
        }
        component.layout = clone(f.state.layout);
        component.positions = component.layout.positions;
        component.identityPositions = component.layout.positionsById || {};
        saved = null;
        component.initializeMissingPositions();
        assert.equal(saved, null, 'already initialized coordinates must not enqueue another write');
    });

    test(`${mode}: Tasks and running Focus updates survive a blocked bookmark commit`, async () => {
        const f = fixture(identity);
        const snapshot = await f.snapshot();
        const entered = deferred();
        const release = deferred();
        f.hooks.beforeWrite = async values => {
            if (!values.links) return;
            entered.resolve();
            await release.promise;
        };
        const pending = f.append(snapshot);
        await entered.promise;
        const tasks = new Tasks.Store();
        const focus = new Focus.Store(undefined, { now: () => 12345, id: () => 'session-123456' });
        await tasks.mutate(tasks.request('add', { text: 'Concurrent task' }));
        await focus.mutate({ kind: 'start', revision: 0 });
        const taskState = clone(f.state[Tasks.KEY]);
        const focusState = clone(f.state[Focus.KEY]);
        release.resolve();
        await pending;
        assert.deepEqual(f.state[Tasks.KEY], taskState);
        assert.deepEqual(f.state[Focus.KEY], focusState);
    });

    for (const first of ['import', 'position']) {
        test(`${mode}: pending position write cannot overwrite import with ${first} first`, async () => {
            const f = fixture(identity);
            const snapshot = await f.snapshot();
            const baseline = await f.manager.getLayoutSnapshotForUpdate();
            const id = f.state.links[0].layoutId;
            const point = { x: 66.25, y: 99.5 };
            const move = () => f.manager.applyLayoutPatch(
                {},
                identity ? {} : { [existingPositionKey]: point },
                baseline,
                () => {},
                identity ? { [Identity.key(id, 'all')]: point } : {}
            );
            const gate = pauseFirstWrite(f);
            const leading = first === 'import' ? f.append(snapshot) : move();
            await gate.entered;
            const trailing = first === 'import' ? move() : f.append(snapshot);
            const outcome = trailing.then(value => ({ value }), error => ({ error }));
            gate.release();
            await leading;
            const result = await outcome;

            assert.equal(f.state.links.length, 2);
            assert.equal(f.state.links.at(-1).url, importedURL);
            const actual = identity ? f.state.layout.positionsById[id].all : f.state.layout.positions[existingPositionKey];
            if (first === 'import') {
                assert.equal(result.error?.code, 'LAYOUT_CONTEXT_CHANGED');
                assert.deepEqual(actual, { x: 13.25, y: 83.5 });
            } else {
                assert.equal(result.value.applied, true);
                assert.deepEqual(actual, point);
            }
        });
    }
}

test('legacy duplicate identity allocation after import preserves old positions and every shortcut', async () => {
    const f = fixture(false);
    f.state.links.push({ ...f.state.links[0], title: 'Legacy twin' });
    await f.append(await f.snapshot());
    const baseline = await f.manager.getLayoutSnapshotForUpdate();
    const previous = clone(f.state.layout.positions);
    const result = await f.manager.applyLayoutPatch({ autoArrange: false }, {}, baseline);
    assert.equal(result.links.length, 3);
    assert.equal(new Set(result.links.map(link => link.layoutId)).size, 3);
    assert.deepEqual(f.state.layout.positions, previous);
    for (const link of result.links.slice(0, 2)) {
        assert.deepEqual(result.layout.positionsById[link.layoutId].all, previous[existingPositionKey]);
    }
    // A newly allocated identity may omit its map until its first view position.
    assert.deepEqual(result.layout.positionsById[result.links.at(-1).layoutId] || {}, {});
});
