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
    for (const outcome of ['success', 'false', 'throw']) {
        const { component, fields, pending, writes, context } = createEditor();
        component.openEditModal(0);
        fields.get('#shortcut-title').value = 'Saved A';
        const firstSave = submit(component);
        assert.equal(writes.length, 1);
        assert.equal(component.links[0].title, 'A', 'pending writes must not mutate the visible list');
        component.hideModal();
        component.openEditModal(1);
        fields.get('#shortcut-title').value = 'New draft B';
        assert.equal(fields.get('#save-btn').disabled, true, 'new editor waits for earlier save');
        await submit(component);
        assert.equal(writes.length, 1, 'reopening cannot launch a duplicate overlapping save');
        if (outcome === 'throw') pending[0].reject(new Error('storage unavailable'));
        else pending[0].resolve(outcome === 'success');
        await firstSave;
        assert.equal(component.modal.classList.contains('active'), true, 'old completion cannot close a newer editor');
        assert.equal(fields.get('#shortcut-title').value, 'New draft B');
        assert.equal(fields.get('#url-error').textContent, '', 'old errors do not attach to a newer form');
        assert.equal(fields.get('#save-btn').disabled, false);
        assert.equal(component.links[0].title, outcome === 'success' ? 'Saved A' : 'A');
        assert.equal(context.errors.length, outcome === 'success' ? 0 : 1);
        const secondSave = submit(component);
        assert.equal(writes.length, 2);
        pending[1].resolve(true);
        await secondSave;
        assert.equal(component.modal.classList.contains('active'), false);
        assert.equal(component.links[1].title, 'New draft B');
        assert.equal(component._pendingSave, null);
    }
    for (const stayOpen of [true, false]) {
        const { component, fields, pending, context } = createEditor();
        component.openAddModal();
        fields.get('#shortcut-title').value = 'New site';
        fields.get('#shortcut-url').value = 'https://new.example/';
        const saving = submit(component);
        if (!stayOpen) component.hideModal();
        pending[0].resolve(false);
        await saving;
        assert.equal(component.links.length, 2);
        assert.equal(component.modal.classList.contains('active'), stayOpen);
        assert.equal(Boolean(fields.get('#url-error').textContent), stayOpen);
        assert.equal(context.errors.length, stayOpen ? 0 : 1);
        assert.equal(component._isSaving, false);
    }
    const conflicted = createEditor();
    conflicted.component.openEditModal(0);
    const oldSave = submit(conflicted.component);
    conflicted.component.hideModal();
    conflicted.component.openEditModal(1);
    conflicted.fields.get('#shortcut-title').value = 'Keep this newer draft';
    const conflict = new Error('another tab removed B');
    conflict.code = 'LINKS_CONFLICT';
    conflict.latestLinks = [clone(conflicted.component.links[0])];
    conflicted.pending[0].reject(conflict);
    await oldSave;
    assert.equal(conflicted.component.modal.classList.contains('active'), true);
    assert.equal(conflicted.fields.get('#shortcut-title').value, 'Keep this newer draft');
    assert.equal(conflicted.fields.get('#url-error').textContent, '');
    assert.equal(conflicted.fields.get('#save-btn').disabled, true);
    await submit(conflicted.component);
    assert.equal(conflicted.writes.length, 1, 'a removed index must stay blocked even after old save cleanup');
    conflicted.component.openEditModal(0);
    assert.equal(conflicted.fields.get('#save-btn').disabled, false);
    console.log('shortcut save session tests ok (DOM model)');
})().catch(error => { console.error(error); process.exitCode = 1; });
