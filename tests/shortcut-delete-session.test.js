const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };

function createEditor() {
    const pending = [], writes = [];
    const context = {
        document: { addEventListener() {}, getElementById() { return null; } },
        window: { addEventListener() {}, LocalItabDialog: { open(overlay) { overlay.classList.add('active'); return () => overlay.classList.remove('active'); } } },
        storageManager: { defaultConfig: { layout: { columns: 6 } }, set(key, value, options) {
            const request = deferred(); pending.push(request); writes.push({ key, value: clone(value), expected: clone(options.expectedLinks) }); return request.promise;
        } },
        console: { log() {}, error() {}, warn() {} }, URL
    };
    // Model the new delete transaction while retaining each test's deferred set hook.
    const store = context.storageManager;
    store.deleteShortcutWithUndo = async (index, options) => {
        const links = options.expectedLinks.filter((_, slot) => slot !== index);
        const result = await store.set('links', links, options);
        if (!result) throw new Error('Storage write returned false');
        return { snapshot: result.links ? result : { links, layout: { autoArrange: true, positions: {}, positionsById: {} } }, receipt: {} };
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('newtab.js', 'utf8') + '\nthis.ShortcutsComponent = ShortcutsComponent; this.errors = []; showErrorMessage = value => errors.push(value);', context);
    const component = new context.ShortcutsComponent(['A', 'B'].map(title => ({ title, url: `https://example.com/${title}`, icon: '🌐', category: 'work' })));
    const fields = new Map(['shortcut-title', 'shortcut-url', 'shortcut-icon', 'shortcut-category', 'save-btn', 'title-error', 'url-error'].map(id => [`#${id}`, { value: '', textContent: '', focus() {}, classList: { toggle() {} } }]));
    fields.set('.modal-title', { textContent: '' });
    const classes = new Set();
    component.modal = {
        classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) },
        querySelector: selector => fields.get(selector),
        querySelectorAll: () => [fields.get('#title-error'), fields.get('#url-error')]
    };
    component.updateCategoryOptions = () => {};
    component.updateGrid = () => {};
    return { component, fields, pending, writes, context };
}
const submit = component => component.handleFormSubmit({ preventDefault() {} });

(async () => {
    for (const outcome of ['success', 'snapshot', 'false', 'throw', 'conflict']) {
        for (const target of [0, 1, 2, -1]) {
            const { component, fields, pending, writes } = createEditor();
            component.links.push({ title: 'C', url: 'https://example.com/C', icon: 'C', category: 'work' });
            let rendered = clone(component.links);
            component.updateGrid = () => { rendered = clone(component.links); };
            const deleting = component.deleteShortcut(0);
            assert.deepEqual(clone(component.links), rendered, 'pending delete keeps model and visible indices aligned');
            assert.deepEqual(writes[0].value.map(x => x.title), ['B', 'C']);
            if (target < 0) component.openAddModal();
            else component.openEditModal(target);
            assert.equal(fields.get('#shortcut-title').value, target < 0 ? '' : ['A', 'B', 'C'][target]);
            fields.get('#shortcut-title').value = 'My draft';
            fields.get('#shortcut-url').value = 'https://draft.example/';
            assert.equal(fields.get('#save-btn').disabled, true);
            await submit(component);
            await component.deleteShortcut(1);
            assert.equal(writes.length, 1, 'no overlapping submit or second deletion');
            component.layout.autoArrange = true;
            component.draggedIndex = 1;
            component.cleanupDragState = () => {};
            await component.handleDrop({ preventDefault() {}, target: { closest: () => ({ dataset: { index: '0' } }) } });
            assert.equal(writes.length, 1, 'an in-flight drop cannot reorder during deletion');
            let blockedDrag = false;
            component.handleDragStart({ preventDefault() { blockedDrag = true; } });
            assert.equal(blockedDrag, true);
            if (outcome === 'throw') pending[0].reject(new Error('storage unavailable'));
            else if (outcome === 'conflict') {
                const error = new Error('conflict'); error.code = 'LINKS_CONFLICT'; error.latestLinks = clone(component.links).slice(2);
                pending[0].reject(error);
            } else if (outcome === 'snapshot') {
                pending[0].resolve({ links: writes[0].value, layout: { positions: {}, positionsById: {} } });
            } else pending[0].resolve(outcome === 'success');
            await deleting;
            assert.equal(component.modal.classList.contains('active'), true);
            assert.equal(fields.get('#shortcut-title').value, 'My draft');
            assert.equal(component._pendingDelete, false);
            const succeeded = ['success', 'snapshot'].includes(outcome);
            const blocked = outcome === 'conflict' || (succeeded && target === 0);
            assert.equal(fields.get('#save-btn').disabled, blocked);
            const saving = submit(component);
            if (blocked) {
                await saving;
                assert.equal(writes.length, 1, 'removed/conflicted drafts cannot overwrite another site');
            } else {
                assert.equal(writes.length, 2);
                const expected = succeeded ? ['B', 'C'] : ['A', 'B', 'C'];
                if (target < 0) expected.push('My draft');
                else expected[target - (succeeded ? 1 : 0)] = 'My draft';
                assert.deepEqual(writes[1].value.map(x => x.title), expected);
                pending[1].resolve(true); await saving;
                assert.deepEqual(clone(component.links).map(x => x.title), expected);
            }
        }
    }
    const reopened = createEditor();
    const deleting = reopened.component.deleteShortcut(0);
    reopened.component.openEditModal(0);
    reopened.component.hideModal();
    reopened.component.openEditModal(1);
    reopened.pending[0].resolve(true); await deleting;
    assert.equal(reopened.component.currentEditIndex, 0, 'latest session is remapped, not earlier deleted draft');
    assert.equal(reopened.fields.get('#shortcut-title').value, 'B');
    assert.equal(reopened.fields.get('#save-btn').disabled, false);
    const saving = submit(reopened.component);
    await reopened.component.deleteShortcut(0);
    assert.equal(reopened.writes.length, 2, 'deletion cannot overlap an existing form save');
    reopened.pending[1].resolve(true); await saving;
    const { createHarness, deferred: hold } = require('./helpers/dashboard-harness');
    for (const ids of [true, false]) {
        for (const destination of ['twin', 'search', 'deleted']) {
            const links = [0, 1, 2].map(i => ({ title: 'Twin', url: 'https://example.com/', category: 'work', ...(ids ? { layoutId: `twin-${i}` } : {}) }));
            const h = createHarness(links), wait = hold();
            h.storageManager.set = () => wait.promise;
            h.control(0).focus(); const deletion = h.component.deleteShortcut(0);
            if (destination === 'twin') h.control(1, 'edit').focus();
            if (destination === 'search') h.search.focus();
            wait.resolve(true); await deletion;
            assert.equal(h.document.activeElement, destination === 'search' ? h.search : h.control(0, destination === 'twin' ? 'edit' : 'open'));
        }
    }
    console.log('shortcut delete session tests ok (DOM model)');
})().catch(error => { console.error(error); process.exitCode = 1; });
