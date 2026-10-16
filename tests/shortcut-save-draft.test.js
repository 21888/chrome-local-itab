'use strict';
// Production shortcut UI + storage over synthetic memory-only Chrome storage.
// Deferred writes and bubbling events model ownership, not native Chrome/IME.
const test = require('node:test');
const assert = require('node:assert/strict');
const Storage = require('../storage');
const { createHarness, menuAction, nativeActivation, submit, sampleLinks, deferred } = require('./helpers/dashboard-harness');
const clone = value => JSON.parse(JSON.stringify(value));
const image = 'data:image/png;base64,' + 'A'.repeat(240);
const identity = n => 'l_' + String(n).padStart(32, '0');

function editor(mode = 'edit', schema = 2) {
    const state = new Storage().cloneDefaultConfig();
    state.links = clone(sampleLinks); state.schemaVersion = schema;
    state.categories = [{ id: 'work', name: 'Work' }, { id: 'social', name: 'Social' }];
    if (schema === 2) {
        state.links.forEach((link, index) => { link.layoutId = identity(index + 1); });
        state.layout.identityVersion = 1; state.layout.positionsById = Object.fromEntries(state.links.map(link => [link.layoutId, {}]));
    }
    const queues = new Map(), writes = [], attempts = [], gate = deferred();
    global.chrome = { storage: { local: {
        async get(keys) { return clone(keys === null ? state : Object.fromEntries(
            (typeof keys === 'string' ? [keys] : keys).filter(key => key in state).map(key => [key, state[key]]))); },
        async set(values) { writes.push(clone(values)); Object.assign(state, clone(values)); },
        async remove() { assert.fail('unexpected removal'); }
    } } };
    Object.defineProperty(global, 'navigator', { configurable: true, value: { locks: {
        request(name, options, action) { const next = (queues.get(name) || Promise.resolve()).then(action || options);
            queues.set(name, next.catch(() => {})); return next; }
    } } });
    Object.defineProperty(global, 'crypto', { configurable: true, value: require('node:crypto').webcrypto });
    const storage = new Storage(); storage._syncInitialized = true;
    storage.scheduleSyncPush = () => assert.fail('unexpected Sync request');
    const h = createHarness(state.links);
    h.field = name => h.component.modal.querySelector(`#shortcut-${name}`);
    for (const id of ['modal-close', 'cancel-btn', 'fetch-icon-btn', 'refresh-icon-btn', 'shortcut-form', 'shortcut-edit-preview', 'shortcut-preview-hidden']) {
        const element = h.document.createElement(id === 'shortcut-form' ? 'form' : id.startsWith('shortcut-') ? 'div' : 'button');
        element.id = id; h.component.modal.append(element);
    }
    h.component.attachModalEventListeners();
    h.storageManager.set = async (key, next, options) => {
        attempts.push(clone({ key, next, options }));
        if (attempts.length === 1) await gate.promise;
        return storage.set(key, next, options);
    };
    if (mode === 'add') {
        nativeActivation(h.add(), 'Enter');
        h.field('title').value = 'Submitted new shortcut'; h.field('url').value = 'example.com/new';
    } else {
        menuAction(h, 0, 'edit'); h.field('title').value = 'Submitted edit';
    }
    const index = mode === 'add' ? state.links.length : 0;
    return Object.assign(h, { state, storage, writes, attempts, gate, index });
}
test.afterEach(() => { delete global.chrome; delete global.navigator; delete global.crypto; });

for (const mode of ['add', 'edit']) for (const [name, value, event] of [
    ['title', 'Newer title draft', 'input'], ['url', 'https://example.com/newer', 'change'],
    ['icon', '✨', null], ['category', 'social', 'change']
]) {
    test(`${mode}: successful pending save preserves newer ${name}, focus, baseline and correct second-save target`, async () => {
        const h = editor(mode), submitted = clone(h.component.readShortcutDraft());
        const saving = submit(h.component);
        assert.equal(h.attempts.length, 1); assert.equal(h.component.modal.querySelector('#save-btn').disabled, true);
        const field = h.field(name); assert.equal(Boolean(field.disabled || field.readOnly), false);
        field.focus(); field.value = value; if (event) field.dispatch(event);
        h.gate.resolve(); await saving;
        assert.equal(h.component.modal.classList.contains('active'), true, 'newer editable draft must stay open');
        assert.equal(h.document.activeElement, field); assert.equal(field.value, value);
        assert.equal(h.component.currentEditIndex, h.index);
        assert.equal(h.component.modal.querySelector('.modal-title').textContent, 'Edit Shortcut');
        assert.deepEqual(clone(h.component._shortcutDraftBaseline.values), submitted);
        assert.equal(h.component.hasUncommittedShortcutWork(), true);
        assert.equal(h.component.modal.querySelector('#save-btn').disabled, false);
        const firstSaved = clone(h.state.links), committedId = firstSaved[h.index].layoutId;
        assert.equal(firstSaved.length, mode === 'add' ? 4 : 3);
        await submit(h.component);
        assert.equal(h.attempts.length, 2);
        assert.deepEqual(h.attempts[1].options.expectedLinks, firstSaved);
        assert.deepEqual(h.attempts[1].options.operation, { type: 'edit', index: h.index });
        assert.equal(h.state.links.length, firstSaved.length, 'a retained Add becomes Edit, not a duplicate Add');
        assert.equal(h.state.links[h.index][name], value);
        assert.equal(h.state.links[h.index].layoutId, committedId);
        assert.equal(h.component.modal.classList.contains('active'), false);
        assert.equal(h.component.hasUncommittedShortcutWork(), false);
    });
}

for (const schema of [1, 2]) for (const mode of ['add', 'edit']) {
    test(`schema ${schema}/${mode}: storage-allocated identity survives a retained draft and second save`, async () => {
        const h = editor(mode, schema);
        if (mode === 'add') h.field('url').value = sampleLinks[0].url; // A duplicate URL needs identity allocation.
        const saving = submit(h.component);
        h.field('title').value = 'Later title'; h.field('title').dispatch('input');
        h.gate.resolve(); await saving;
        const first = clone(h.state.links), id = first[h.index].layoutId;
        assert.match(id, /^l_[a-f0-9]{32}$/);
        assert.equal(h.component.modal.classList.contains('active'), true);
        await submit(h.component);
        assert.equal(h.state.links[h.index].title, 'Later title');
        assert.equal(h.state.links[h.index].layoutId, id); assert.equal(h.state.links.length, first.length);
        assert.deepEqual(h.attempts[1].options.expectedLinks, first);
        assert.deepEqual(h.state.links.filter((_, index) => index !== h.index), first.filter((_, index) => index !== h.index));
    });
}

for (const name of ['title', 'url', 'icon']) {
    test(`compositionstart on ${name} before its first input retains the current save's editor`, async () => {
        const h = editor(), saving = submit(h.component), field = h.field(name);
        field.focus(); field.dispatch('compositionstart'); h.gate.resolve(); await saving;
        assert.equal(h.component.modal.classList.contains('active'), true);
        assert.equal(h.document.activeElement, field); assert.equal(h.component.hasUncommittedShortcutWork(), false);
        field.value = name === 'url' ? 'https://example.com/composing' : '组字草稿'; field.dispatch('input', { isComposing: true });
        assert.equal(h.component.hasUncommittedShortcutWork(), true);
        field.dispatch('keydown', { key: 'Escape', isComposing: true });
        assert.equal(h.component.modal.classList.contains('active'), true);
        field.dispatch('compositionend'); field.dispatch('keydown', { key: 'Escape' });
        assert.equal(h.component.modal.classList.contains('active'), false);
    });
}

test('editing then exactly restoring submitted raw fields keeps intent but needs no departure warning', async () => {
    const h = editor(); h.field('title').value = '  Submitted edit  '; h.field('url').value = ' example.com/path ';
    const submitted = clone(h.component.readShortcutDraft()), saving = submit(h.component);
    h.field('title').value = 'temporary'; h.field('title').dispatch('input');
    h.field('title').value = submitted[0]; h.field('title').dispatch('input');
    h.gate.resolve(); await saving;
    assert.equal(h.component.modal.classList.contains('active'), true);
    assert.deepEqual(clone(h.component.readShortcutDraft()), submitted);
    assert.equal(h.state.links[0].title, 'Submitted edit'); assert.equal(h.state.links[0].url, 'https://example.com/path');
    assert.equal(h.component.hasUncommittedShortcutWork(), false);
});

test('reverting to the opening value after submission remains dirty against the committed draft', async () => {
    const h = editor(), saving = submit(h.component);
    h.field('title').value = sampleLinks[0].title; h.field('title').dispatch('input');
    h.gate.resolve(); await saving;
    assert.equal(h.component.modal.classList.contains('active'), true);
    assert.equal(h.state.links[0].title, 'Submitted edit'); assert.equal(h.component.hasUncommittedShortcutWork(), true);
    await submit(h.component); assert.equal(h.state.links[0].title, sampleLinks[0].title);
});

test('explicit favicon completion during saving preserves its newer icon field without an input event', async () => {
    const h = editor(), icon = deferred();
    h.context.window.localItabPrivacy.onlineFavicons = true;
    h.component.fetchFaviconAsDataUrl = () => icon.promise;
    const fetching = h.component.fetchWebsiteIcon(), saving = submit(h.component);
    icon.resolve(image); await fetching; h.gate.resolve(); await saving;
    assert.equal(h.component.modal.classList.contains('active'), true);
    assert.equal(h.field('icon').value, image); assert.notEqual(h.state.links[0].icon, image);
    assert.equal(h.component.hasUncommittedShortcutWork(), true);
    await submit(h.component); assert.equal(h.state.links[0].icon, image);
});

test('unchanged pending editor still closes after success; a pristine new opening remains untouched', async () => {
    const h = editor(), saving = submit(h.component); h.gate.resolve(); await saving;
    assert.equal(h.component.modal.classList.contains('active'), false);
    h.component.openEditModal(1); assert.equal(h.component.hasUncommittedShortcutWork(), false);
});

test('external conflict on the second save retains the newer draft and refuses stale target reuse', async () => {
    const h = editor('add'), saving = submit(h.component);
    h.field('title').value = 'Newer add draft'; h.field('title').dispatch('input'); h.gate.resolve(); await saving;
    assert.equal(h.component.modal.classList.contains('active'), true);
    h.state.links.shift(); const externallyChanged = clone(h.state.links);
    await submit(h.component);
    assert.deepEqual(h.state.links, externallyChanged); assert.equal(h.component.modal.classList.contains('active'), true);
    assert.equal(h.field('title').value, 'Newer add draft'); assert.equal(h.component._hasShortcutConflict, true);
    assert.equal(h.component.hasUncommittedShortcutWork(), true);
    assert.equal(h.component.modal.querySelector('#save-btn').disabled, true);
    await submit(h.component); assert.equal(h.attempts.length, 2);
});
