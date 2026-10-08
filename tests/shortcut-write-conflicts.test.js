const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const StorageManager = require('../storage.js');
const clone = value => JSON.parse(JSON.stringify(value));
const links = ['A', 'B', 'C'].map(title => ({ title, url: `https://example.com/${title}`, icon: '🌐', category: 'work' }));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function createLocks() {
    const queues = new Map();
    return { request(name, operation) {
        const result = (queues.get(name) || Promise.resolve()).then(operation);
        queues.set(name, result.catch(() => {}));
        return result;
    } };
}
function manager() { const value = new StorageManager(); value._syncInitialized = true; return value; }
function createComponent(storage, initialLinks) {
    const context = {
        document: { addEventListener() {}, getElementById() { return null; } },
        window: { addEventListener() {}, LocalItabDialog: { open() { return () => {}; } } },
        console: { error() {}, log() {}, warn() {} }, storageManager: storage, URL
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('newtab.js', 'utf8') + '\nthis.ShortcutsComponent = ShortcutsComponent; this.errors = []; showErrorMessage = message => errors.push(message);', context);
    const component = new context.ShortcutsComponent(clone(initialLinks));
    component.updateGrid = () => {};
    component.cleanupDragState = () => {};
    return { component, context };
}

(async () => {
    const previousChrome = global.chrome;
    const previousNavigator = Object.getOwnPropertyDescriptor(global, 'navigator');
    const previousError = console.error;
    let state, writes, linkReads, readError = false, writeError = false, onRead = null;
    const reset = value => { state = { links: clone(value) }; writes = 0; linkReads = 0; readError = false; writeError = false; onRead = null; };
    global.chrome = { storage: { local: {
        async get(keys) {
            if (keys === null || keys.includes('links')) {
                linkReads++;
                if (readError) throw new Error('storage read unavailable');
                const snapshot = clone(state);
                await onRead?.();
                return snapshot;
            }
            return { sync: state.sync };
        },
        async set(values) { if (writeError) throw new Error('storage write unavailable'); writes++; Object.assign(state, clone(values)); },
        async clear() { writes++; state = {}; },
        async remove(keys) { for (const key of keys) delete state[key]; }
    } } };
    Object.defineProperty(global, 'navigator', { configurable: true, value: { locks: createLocks() } });
    console.error = () => {};
    try {
        reset(links);
        const tabA = manager(), tabB = manager();
        assert.equal(await tabA.set('links', links.slice(1), { expectedLinks: links }), true);
        await assert.rejects(tabB.set('links', [links[0], links[2]], { expectedLinks: links }), error => error.code === 'LINKS_CONFLICT' && error.latestLinks.length === 2);
        assert.deepEqual(state.links.map(link => link.title), ['B', 'C']);
        assert.equal(writes, 1);

        // Deterministically hold A between its authoritative read and write.
        // B cannot read the old list while A owns the shared origin lock.
        reset(links);
        const entered = deferred(), release = deferred();
        onRead = async () => { entered.resolve(); await release.promise; };
        const writeA = tabA.set('links', links.slice(1), { expectedLinks: links });
        await entered.promise;
        const writeB = tabB.set('links', [links[0], links[2]], { expectedLinks: links });
        const caughtB = assert.rejects(writeB, error => error.code === 'LINKS_CONFLICT');
        await new Promise(setImmediate);
        assert.equal(linkReads, 1);
        assert.equal(writes, 0);
        release.resolve();
        assert.equal(await writeA, true);
        await caughtB;
        assert.deepEqual(state.links.map(link => link.title), ['B', 'C']);
        assert.equal(writes, 1);
        onRead = null;
        assert.equal(await tabB.set('links', [links[2]], { expectedLinks: links.slice(1) }), true);
        assert.deepEqual(state.links.map(link => link.title), ['C']);

        // Intentional full restore and reset share the same critical section.
        for (const replace of [() => tabB.setAll({ links: [] }), () => tabB.clear()]) {
            reset(links);
            const entered = deferred(), release = deferred();
            onRead = async () => { entered.resolve(); await release.promise; };
            const guarded = tabA.set('links', links.slice(1), { expectedLinks: links });
            await entered.promise;
            const replacement = replace();
            await new Promise(setImmediate);
            assert.equal(writes, 0, 'replacement must wait for guarded write');
            release.resolve();
            await guarded;
            assert.equal(await replacement, true);
            assert.equal(writes, 2);
            assert.equal((state.links || []).length, 0);
        }

        for (const failure of ['read', 'write', 'corrupt']) {
            reset(links);
            if (failure === 'read') readError = true;
            if (failure === 'write') writeError = true;
            if (failure === 'corrupt') state.links = [links[0], null];
            assert.equal(await tabA.set('links', [], { expectedLinks: links }), false);
            assert.equal(writes, 0);
        }
        reset([]);
        assert.equal(await tabA.set('links', [links[0]], { expectedLinks: [] }), true);
        reset([]);
        navigator.locks = undefined;
        await assert.rejects(tabA.set('links', [links[0]], { expectedLinks: [] }), error => error.code === 'LINKS_LOCK_UNAVAILABLE');
        assert.equal(writes, 0);
        navigator.locks = createLocks();

        // The actual dashboard delete/reorder paths refresh a stale tab without
        // resurrecting removed entries. Retrying uses the refreshed snapshot.
        for (const action of ['delete', 'reorder', 'starter']) {
            reset(action === 'starter' ? [links[2]] : links.slice(1));
            const { component, context } = createComponent(manager(), action === 'starter' ? [] : links);
            if (action === 'delete') await component.deleteShortcut(1);
            if (action === 'reorder') {
                component.draggedIndex = 0;
                await component.handleDrop({ preventDefault() {}, target: { closest() { return { dataset: { index: '1' } }; } } });
            }
            if (action === 'starter') await component.createStarterSet();
            assert.equal(writes, 0, action);
            assert.deepEqual(clone(component.links), state.links, action);
            assert.equal(context.errors.length, 1);
        }
        reset([]);
        const starter = createComponent(manager(), []).component;
        writeError = true;
        await starter.createStarterSet();
        assert.equal(starter.links.length, 0, 'failed transaction rolls back before retry');
        writeError = false;
        await starter.createStarterSet();
        assert.equal(state.links.length, 5);

        reset(links.slice(1));
        const editor = createComponent(manager(), links).component;
        const fields = new Map([
            ['#shortcut-title', { value: 'Unsaved draft' }], ['#shortcut-url', { value: 'https://draft.example/' }],
            ['#shortcut-icon', { value: '🌐' }], ['#shortcut-category', { value: 'work' }],
            ['#save-btn', { disabled: false, classList: { toggle() {} } }], ['.modal-title', {}]
        ]);
        editor.modal = { classList: { contains() { return true; } }, querySelector(selector) { return fields.get(selector); } };
        editor.currentEditIndex = 0;
        editor.validateForm = () => true;
        editor.showFormError = () => {};
        editor.clearFormErrors = () => {};
        editor.updateCategoryOptions = () => {};
        await editor.handleFormSubmit({ preventDefault() {} });
        assert.equal(writes, 0);
        assert.equal(fields.get('#shortcut-title').value, 'Unsaved draft');
        assert.equal(editor._hasShortcutConflict, true);
        assert.equal(fields.get('#save-btn').disabled, true);
        await editor.handleFormSubmit({ preventDefault() {} });
        assert.equal(writes, 0, 'old form index must not target the refreshed list');
        editor.openEditModal(0);
        assert.equal(editor._hasShortcutConflict, false);
        assert.equal(fields.get('#shortcut-title').value, 'B');
        assert.equal(fields.get('#save-btn').disabled, false);
        console.log('shortcut write conflict tests ok (simulated shared Web Locks)');
    } finally {
        global.chrome = previousChrome;
        if (previousNavigator) Object.defineProperty(global, 'navigator', previousNavigator); else delete global.navigator;
        console.error = previousError;
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
