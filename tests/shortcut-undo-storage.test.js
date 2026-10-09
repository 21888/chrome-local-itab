const assert = require('node:assert/strict');
const StorageManager = require('../storage.js');
const clone = value => JSON.parse(JSON.stringify(value));
const links = ['A', 'B', 'C'].map(title => ({ title, url: `https://example.com/${title}`, icon: '🌐', category: 'work' }));
const id = n => `l_${String(n).padStart(32, '0')}`;
let state, reads, writes, failSet, failReadback, afterSet, inLock = false, queue = Promise.resolve();
const originalChrome = global.chrome, originalNavigator = Object.getOwnPropertyDescriptor(global, 'navigator');
const originalCrypto = Object.getOwnPropertyDescriptor(global, 'crypto');
Object.defineProperty(global, 'crypto', { configurable: true, value: require('node:crypto').webcrypto });
Object.defineProperty(global, 'navigator', { configurable: true, value: { locks: { request(name, work) {
    assert.equal(name, 'local-itab-local-write');
    const result = queue.then(async () => { inLock = true; try { return await work(); } finally { inLock = false; } });
    queue = result.catch(() => {}); return result;
} } } });
global.chrome = { storage: { local: {
    async get(keys) {
        if (keys !== null) return { sync: state.sync };
        assert.ok(inLock); reads++;
        if (failReadback && reads >= failReadback) throw new Error('readback unavailable');
        return clone(state);
    },
    async set(values) {
        assert.ok(inLock); writes++;
        if (failSet === 'before') throw new Error('set failed');
        Object.assign(state, clone(values));
        afterSet?.();
        if (failSet === 'after') throw new Error('set outcome unknown');
    }
} } };
const manager = () => { const manager = new StorageManager(); manager._syncInitialized = true; return manager; };
const reset = extra => { state = { links: clone(links), ...clone(extra || {}) }; reads = writes = 0; failSet = failReadback = afterSet = null; };
const remove = (m, index) => m.deleteShortcutWithUndo(index, { expectedLinks: clone(state.links), expectedLayoutGeneration: state[m.layoutGenerationKey] || null });
(async () => {
    try {
        for (const index of [0, 1, 2]) {
            reset(); const m = manager(); const before = clone(state);
            const deleted = await remove(m, index);
            assert.equal(reads, 2, 'receipt comes from deletion lock read and verification');
            assert.equal(writes, 1); assert.equal(state.links.length, 2);
            await m.undoShortcutDeletion(deleted.receipt);
            assert.deepEqual(state, before); assert.equal(writes, 2);
            await assert.rejects(m.undoShortcutDeletion(deleted.receipt), { code: 'SHORTCUT_UNDO_INVALID' });
        }
        reset({ categories: [{ id: 'work', name: 'Work', icon: 'W', extra: { nested: 1 } }],
            layout: { autoArrange: false, alignToGrid: false, gridSize: 96, columns: 6, positions: { 'all|https://example.com/B': { x: 10, y: 20 }, 'hidden|https://example.com/B': { x: 55, y: 66 } }, unknown: { keep: true } } });
        state.links[1].unknown = { nested: ['preserve', 4] };
        let m = manager(), before = clone(state), deleted = await remove(m, 1);
        await m.undoShortcutDeletion(deleted.receipt); assert.deepEqual(state, before, 'all unknown record/layout/category fields survive');

        for (const count of [2, 3]) {
            reset({ links: Array.from({ length: count }, () => ({ ...clone(links[0]), unknown: { nested: ['preserve'] } })), schemaVersion: 1,
                layout: { autoArrange: false, alignToGrid: false, gridSize: 96, columns: 6, positions: {
                    [`all|${links[0].url}`]: { x: 10, y: 20 }, [`hidden|${links[0].url}`]: { x: 30, y: 40 }
                } } });
            m = manager(); deleted = await remove(m, 1);
            const survivorIds = state.links.map(link => link.layoutId);
            await m.undoShortcutDeletion(deleted.receipt);
            assert.equal(state.links.length, count);
            assert.equal(new Set(state.links.map(link => link.layoutId)).size, count);
            state.links.forEach(link => assert.deepEqual(state.layout.positionsById[link.layoutId], { all: { x: 10, y: 20 }, hidden: { x: 30, y: 40 } }));
            if (count === 3) assert.deepEqual([state.links[0].layoutId, state.links[2].layoutId], survivorIds);
            assert.equal(state.schemaVersion, 2);
            state.links.forEach(link => assert.deepEqual(link.unknown, { nested: ['preserve'] }));
        }
        reset({ links: [1, 2, 3].map(n => ({ ...links[0], layoutId: id(n) })), schemaVersion: 2,
            layout: { autoArrange: false, identityVersion: 1, positions: {}, positionsById: Object.fromEntries([1, 2, 3].map(n => [id(n), { all: { x: n, y: n }, hidden: { x: n * 2, y: n * 3 } }])) } });
        m = manager(); before = clone(state); deleted = await remove(m, 1);
        await m.undoShortcutDeletion(deleted.receipt); assert.deepEqual(state, before, 'identical twins recover original identity and all views');

        // Import, restore, reset and Sync replacement invalidate via existing generation.
        for (const mutation of [
            state => state.links.reverse(), state => state.links[0].title = 'changed',
            state => state.categories = [], state => state.layout = {},
            ...['import', 'restore', 'reset', 'sync'].map(kind => state => state.__localItabLayoutGeneration = kind),
            state => state.schemaVersion = 1
        ]) {
            reset(); m = manager(); deleted = await remove(m, 1); mutation(state); const changed = clone(state);
            await assert.rejects(m.undoShortcutDeletion(deleted.receipt), { code: 'SHORTCUT_UNDO_CONFLICT' });
            assert.deepEqual(state, changed); assert.equal(writes, 1);
            await assert.rejects(m.undoShortcutDeletion(deleted.receipt), { code: 'SHORTCUT_UNDO_INVALID' });
        }
        reset(); m = manager(); deleted = await remove(m, 1); before = clone(state);
        state.links = []; state = clone(before); // ABA is intentionally accepted.
        state.links = state.links.map(link => Object.fromEntries(Object.entries(link).reverse()));
        await m.undoShortcutDeletion(deleted.receipt); assert.deepEqual(state.links, links);

        reset(); m = manager(); deleted = await remove(m, 0); const second = await remove(m, 0);
        await assert.rejects(m.undoShortcutDeletion(deleted.receipt), { code: 'SHORTCUT_UNDO_INVALID' });
        // An invalid old token must not consume the valid newer token.
        await m.undoShortcutDeletion(second.receipt); assert.deepEqual(state.links, links.slice(1));

        reset(); m = manager(); deleted = await remove(m, 1);
        const concurrent = await Promise.allSettled([m.undoShortcutDeletion(deleted.receipt), m.undoShortcutDeletion(deleted.receipt)]);
        assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1); assert.equal(writes, 2);
        reset(); m = manager(); deleted = await remove(m, 1);
        await assert.rejects(manager().undoShortcutDeletion(deleted.receipt), { code: 'SHORTCUT_UNDO_INVALID' });

        for (const phase of ['delete', 'undo']) for (const failure of ['before', 'after', 'readback', 'mismatch']) {
            reset(); m = manager(); if (phase === 'undo') deleted = await remove(m, 1);
            if (failure === 'readback') failReadback = reads + 2;
            else if (failure === 'mismatch') afterSet = () => { state.links = []; };
            else failSet = failure;
            const writeCount = writes;
            await assert.rejects(phase === 'delete' ? remove(m, 1) : m.undoShortcutDeletion(deleted.receipt), error => error.code === 'SHORTCUT_UNDO_UNVERIFIED' && error.mayHaveCommitted);
            assert.equal(writes, writeCount + 1, 'no rollback or blind retry');
            assert.equal(m._shortcutUndoTicket, null);
        }
        // A failed second deletion must preserve the last verified deletion
        // when no write was attempted and its context is still unchanged.
        reset(); m = manager(); deleted = await remove(m, 0);
        const goodGet = chrome.storage.local.get;
        chrome.storage.local.get = async () => { throw new Error('read unavailable'); };
        await assert.rejects(remove(m, 0), /read unavailable/);
        chrome.storage.local.get = goodGet;
        assert.equal(writes, 1);
        await m.undoShortcutDeletion(deleted.receipt); assert.deepEqual(state.links, links);

        for (const failure of ['conflict', 'invalid-generation', 'set-after', 'readback']) {
            reset(); m = manager(); deleted = await remove(m, 0);
            if (failure === 'invalid-generation') state[m.layoutGenerationKey] = 42;
            if (failure === 'set-after') failSet = 'after';
            if (failure === 'readback') failReadback = reads + 2;
            const attempt = failure === 'conflict' ? m.deleteShortcutWithUndo(0, { expectedLinks: links }) : remove(m, 0);
            await assert.rejects(attempt, error => error.invalidatesShortcutUndo === true);
            await assert.rejects(m.undoShortcutDeletion(deleted.receipt), { code: 'SHORTCUT_UNDO_INVALID' });
        }

        // A second page cannot interleave between deletion read, set and readback.
        reset(); m = manager();
        let entered, release;
        const didEnter = new Promise(resolve => { entered = resolve; });
        const gate = new Promise(resolve => { release = resolve; });
        const originalSet = chrome.storage.local.set;
        chrome.storage.local.set = async values => { entered(); await gate; return originalSet(values); };
        const firstPage = remove(m, 1);
        await didEnter;
        const secondPage = manager().deleteShortcutWithUndo(0, { expectedLinks: clone(links) });
        const secondRejected = assert.rejects(secondPage, { code: 'LINKS_CONFLICT' });
        await new Promise(setImmediate); assert.equal(reads, 1);
        release(); deleted = await firstPage; await secondRejected;
        chrome.storage.local.set = originalSet;
        assert.equal(writes, 1);
        await m.undoShortcutDeletion(deleted.receipt); assert.deepEqual(state.links, links);

        // Existing replacement APIs actually rotate the checked generation.
        for (const replace of ['restore', 'reset']) {
            reset(); m = manager(); deleted = await remove(m, 1);
            const postDelete = clone(state);
            chrome.storage.local.remove = async keys => { for (const key of keys) delete state[key]; };
            if (replace === 'restore') await m.setAll({ links: postDelete.links });
            else await m.clear();
            assert.notEqual(state[m.layoutGenerationKey], postDelete[m.layoutGenerationKey]);
            await assert.rejects(m.undoShortcutDeletion(deleted.receipt), { code: 'SHORTCUT_UNDO_CONFLICT' });
        }

        reset({ categories: [] }); m = manager(); deleted = await remove(m, 1);
        await assert.rejects(m.undoShortcutDeletion(deleted.receipt), { code: 'SHORTCUT_UNDO_CONFLICT' });
        assert.equal(writes, 1, 'orphan categories are never silently reassigned');
        reset(); m = manager();
        const locks = navigator.locks; navigator.locks = undefined;
        await assert.rejects(remove(m, 1), { code: 'LINKS_LOCK_UNAVAILABLE' });
        assert.equal(writes, 0); navigator.locks = locks;
        reset(); m = manager(); const get = chrome.storage.local.get;
        chrome.storage.local.get = async () => { throw new Error('authoritative read failed'); };
        await assert.rejects(remove(m, 1), /authoritative read failed/);
        assert.equal(writes, 0); assert.equal(m._shortcutUndoTicket, null);
        chrome.storage.local.get = get;
        reset(); m = manager(); state.links[1].title = ' B ';
        await assert.rejects(remove(m, 1), { code: 'SHORTCUT_UNDO_INVALID' }); assert.equal(writes, 0);
        reset({ sync: { enabled: true } }); m = manager();
        m.scheduleSyncPush = () => { assert.equal(inLock, false); throw new Error('scheduler unavailable'); };
        const warn = console.warn; console.warn = () => {};
        try { deleted = await remove(m, 1); await m.undoShortcutDeletion(deleted.receipt); } finally { console.warn = warn; }
        assert.deepEqual(state.links, links);
        console.log('shortcut undo storage: passed');
    } finally {
        global.chrome = originalChrome;
        if (originalNavigator) Object.defineProperty(global, 'navigator', originalNavigator); else delete global.navigator;
        if (originalCrypto) Object.defineProperty(global, 'crypto', originalCrypto); else delete global.crypto;
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
