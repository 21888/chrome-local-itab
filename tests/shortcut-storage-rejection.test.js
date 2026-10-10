const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const clone = value => JSON.parse(JSON.stringify(value));

// Actual editor and StorageManager over atomic, rejecting local-storage writes.
// This complements the deferred persistence stubs in shortcut-save-session.test.js.
function createEditor(storage) {
    const context = {
        document: { addEventListener() {}, getElementById() { return null; } },
        window: { addEventListener() {}, LocalItabDialog: { open(overlay) { overlay.classList.add('active'); return () => overlay.classList.remove('active'); } } },
        storageManager: storage,
        console: { log() {}, error() {}, warn() {} }, URL
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('newtab.js', 'utf8') + '\nthis.ShortcutsComponent = ShortcutsComponent;', context);
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
    return { component, fields };
}
const submit = component => component.handleFormSubmit({ preventDefault() {} });


const StorageManager = require('../storage.js');
test('actual shortcut editor retains drafts and retries after rejected local writes', async () => {
    Object.defineProperty(global, 'navigator', { configurable: true, value: { locks: { request: async (_, fn) => fn() } } });
    for (const failure of ['write rejected', 'QUOTA_EXCEEDED', 'Resource::kQuotaBytes quota exceeded']) {
        for (const action of ['edit', 'add']) {
            let state = new StorageManager().cloneDefaultConfig(), rejectWrite = true, writes = 0;
            state.links = ['A', 'B'].map(title => ({title, url: `https://example.com/${title}`, icon: '🌐', category: 'work'}));
            global.chrome = {storage: {local: {
                async get(keys) { return keys === null ? clone(state) : Object.fromEntries(keys.filter(key => key in state).map(key => [key, clone(state[key])])); },
                async set(values) { if (rejectWrite) throw new Error(failure); writes++; Object.assign(state, clone(values)); }
            }}};
            const storage = new StorageManager(); storage._syncInitialized = true;
            const {component, fields} = createEditor(storage);
            if (action === 'edit') component.openEditModal(0); else component.openAddModal();
            fields.get('#shortcut-title').value = 'Retain my draft';
            fields.get('#shortcut-url').value = 'https://draft.example/';
            fields.get('#shortcut-category').value = 'work';
            const before = clone(state);
            await submit(component);
            assert.deepEqual(state, before);
            assert.equal(writes, 0);
            assert.equal(component.modal.classList.contains('active'), true);
            assert.equal(fields.get('#shortcut-title').value, 'Retain my draft');
            assert.equal(fields.get('#shortcut-url').value, 'https://draft.example/');
            assert.equal(fields.get('#save-btn').disabled, false);
            assert.ok(fields.get('#url-error').textContent);
            assert.deepEqual(clone(component.links), before.links);
            rejectWrite = false;
            await submit(component);
            assert.equal(writes, 1);
            assert.equal(component.modal.classList.contains('active'), false);
            assert.equal(state.links[action === 'edit' ? 0 : 2].title, 'Retain my draft');
        }
    }
    console.log('Actual shortcut editor + StorageManager: 6 rejection/quota and explicit retry cases passed');
});
