const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');

// Real shortcut methods, modal events, focus helper and shared departure handler.
// Synthetic key events do not prove browser chrome/IME behavior.
function model() {
    const document = createDocument(), pending = [], listeners = [];
    const context = vm.createContext({ document, URL, console: { log() {}, warn() {}, error() {} },
        window: { addEventListener(type, fn) { if (type === 'beforeunload') listeners.push(fn); },
            categoryNavigation: { getCurrentCategory: () => 'personal', getCategoriesForSelect: () =>
                ['work', 'personal'].map(id => ({ id, name: id })) } },
        storageManager: { defaultConfig: { layout: { columns: 6 } }, set() {
            return new Promise((resolve, reject) => pending.push({ resolve, reject }));
        } } });
    vm.runInContext(fs.readFileSync('shared/dialog-focus.js', 'utf8'), context);
    vm.runInContext(fs.readFileSync('newtab.js', 'utf8') + '\nthis.ShortcutsComponent = ShortcutsComponent; showErrorMessage = () => {};', context);
    const component = new context.ShortcutsComponent(['A', 'B'].map(title => ({ title, url: `https://example.com/${title}`, icon: '🌐', category: 'personal' })));
    const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
    const heading = document.createElement('h3'); heading.className = 'modal-title'; overlay.append(heading);
    for (const [id, tag] of [['shortcut-title','input'], ['shortcut-url','input'], ['shortcut-icon','input'], ['shortcut-category','select'], ['save-btn','button'], ['title-error','div'], ['url-error','div'], ['modal-close','button'], ['cancel-btn','button'], ['fetch-icon-btn','button'], ['refresh-icon-btn','button'], ['shortcut-form','form']]) {
        const field = document.createElement(tag); field.id = id;
        if (id.endsWith('-error')) field.className = 'form-error'; overlay.append(field);
    }
    document.body.append(overlay); component.modal = overlay; component.updateGrid = () => {};
    component.attachModalEventListeners(); context.window.shortcutsComponentInstance = component;
    vm.runInContext(fs.readFileSync('shared/local-content-lifecycle.js', 'utf8'), context);
    assert.equal(listeners.length, 1);
    return { component, overlay, pending, context, listeners, field: name => overlay.querySelector(`#shortcut-${name}`),
        submit: () => component.handleFormSubmit({ preventDefault() {} }),
        guard(expected, reason) {
            const event = { prevented: false, returnValue: undefined, preventDefault() { this.prevented = true; } };
            listeners[0](event); assert.equal(event.prevented, expected, reason);
            assert.equal(event.returnValue, expected ? '' : undefined, reason);
        } };
}

for (const mode of ['add', 'edit']) for (const name of ['title', 'url', 'icon', 'category']) {
    test(`departure: ${mode} raw ${name} change and exact reversion`, () => {
        const h = model(); mode === 'add' ? h.component.openAddModal() : h.component.openEditModal(0);
        h.guard(false, 'initialized values including selected category are pristine');
        const field = h.field(name), initial = field.value;
        field.value = name === 'category' ? 'work' : `${initial} `;
        h.guard(true, 'raw differences count without input/change events');
        field.value = initial; h.guard(false, 'exact reversion releases warning');
    });
}

for (const dismissal of ['cancel-btn', 'modal-close', 'backdrop', 'Escape']) {
    test(`departure: explicit ${dismissal} discards dirty draft without new confirmation`, () => {
        const h = model(); h.component.openAddModal(); h.field('title').value = 'unsaved'; h.guard(true);
        if (dismissal === 'Escape') h.field('title').dispatch('keydown', { key: 'Escape' });
        else (dismissal === 'backdrop' ? h.overlay : h.overlay.querySelector(`#${dismissal}`)).dispatch('click');
        assert.equal(h.overlay.classList.contains('active'), false); h.guard(false); assert.equal(h.pending.length, 0);
        h.component.openAddModal(); h.guard(false, 'reopening starts fresh');
    });
}

test('departure: IME composition and keyboard reload are independent of input events', () => {
    const h = model(); h.component.openEditModal(0); const input = h.field('title');
    input.dispatch('compositionstart'); h.guard(false, 'composition alone is not dirty');
    input.value = '网站草稿'; input.dispatch('keydown', { key: 'Escape', isComposing: true });
    assert.equal(h.overlay.classList.contains('active'), true); h.guard(true);
    for (const key of [{key:'r', ctrlKey:true}, {key:'r', metaKey:true}, {key:'F5'}]) {
        assert.equal(input.dispatch('keydown', key).prevented, false, 'page does not intercept native reload key');
        h.guard(true, 'subsequent modeled beforeunload protects draft');
        assert.equal(input.value, '网站草稿');
    }
    input.dispatch('compositionend'); input.dispatch('keydown', { key: 'Escape' }); h.guard(false);
});

for (const outcome of ['success', 'false', 'rejection', 'conflict']) for (const next of ['same', 'closed', 'clean', 'dirty']) {
    test(`departure: ${outcome} pending save with ${next} editor ownership`, async () => {
        const h = model(); h.component.openEditModal(0); h.field('title').value = 'Saved A';
        const saving = h.submit(); h.guard(true);
        if (next !== 'same') { h.component.hideModal(); h.guard(true, 'dismissal cannot release pending write'); }
        if (['clean','dirty'].includes(next)) { h.component.openEditModal(1); if (next === 'dirty') h.field('icon').value = '⭐'; }
        h.guard(true, 'pending owner protects even clean/new/closed dialogs');
        if (outcome === 'rejection' || outcome === 'conflict') {
            const error = new Error('unavailable'); if (outcome === 'conflict') { error.code = 'LINKS_CONFLICT'; error.latestLinks = []; }
            h.pending[0].reject(error);
        } else h.pending[0].resolve(outcome === 'success');
        await saving;
        assert.equal(h.component._pendingSave, null);
        h.guard(next === 'dirty' || (next === 'same' && outcome !== 'success'));
        if (next === 'dirty') { assert.equal(h.field('icon').value, '⭐'); h.field('icon').value = '🌐'; h.guard(false); }
    });
}

test('departure: pristine pending save, failed unchanged save and unrelated flags', async () => {
    const h = model(); h.component.openEditModal(0); const saving = h.submit(); h.guard(true);
    h.pending[0].resolve(false); await saving; h.guard(false, 'failure without draft differences is not dirty');
    h.component._hasShortcutConflict = true; h.component._isSaving = true; h.component._pendingDelete = true;
    h.component._shortcutUndoPending = true; h.guard(false, 'conflict/delete/undo flags alone do not count');
    h.component.links = []; h.component.currentEditIndex = -1; h.guard(false, 'mutable list/index is not the snapshot');
    h.field('title').value = 'changed'; h.guard(true); h.field('title').value = 'A'; h.guard(false);
});

test('departure: retry succeeds and retired snapshot cannot guard a newer opening', async () => {
    const h = model(); h.component.openEditModal(0); h.field('url').value += '/changed';
    let saving = h.submit(); h.pending[0].resolve(false); await saving; h.guard(true);
    saving = h.submit(); h.pending[1].resolve(true); await saving; h.guard(false);
    h.component.openAddModal(); const retired = h.component._shortcutDraftBaseline;
    h.component.hideModal(); h.component.openAddModal(); h.field('title').value = 'new'; h.guard(true);
    h.component._shortcutDraftBaseline = retired; h.guard(false, 'retired snapshot has no ownership');
});

test('departure: actual icon fetch and clear controls update dirtiness without input events', async () => {
    const h = model(); h.context.window.localItabPrivacy.onlineFavicons = true;
    h.component.openEditModal(0); h.guard(false);
    h.component.fetchFaviconAsDataUrl = async () => 'data:image/png;base64,MODEL';
    await h.component.fetchWebsiteIcon();
    assert.equal(h.field('icon').value, 'data:image/png;base64,MODEL'); h.guard(true);
    h.field('icon').value = '🌐'; h.guard(false);
    // Await the real async click binding directly; the tiny DOM dispatcher does
    // not await event-handler promises. No cache backend is needed for clearing.
    await h.overlay.querySelector('#refresh-icon-btn').listeners.get('click')[0]();
    assert.equal(h.field('icon').value, ''); h.guard(true);
    h.field('icon').value = '🌐'; h.guard(false);
});

function reloadNoticeModel() {
    const h = model();
    h.context.document.body.prepend = (...nodes) => h.context.document.body.append(...nodes);
    let confirms = 0, reloads = 0;
    h.context.window.confirm = () => { confirms++; return h.accept; };
    h.context.window.location = { reload() { reloads++; h.onReload?.(); } };
    h.component.openEditModal(0); h.field('title').value = 'dirty';
    assert.equal(h.context.window.LocalItabContentLifecycle.reload(), false);
    const notice = h.context.document.getElementById('local-content-reload-notice');
    return Object.assign(h, { accept: true, click: () => notice.querySelector('button').dispatch('click'),
        counts: () => ({ confirms, reloads }) });
}


test('departure: accepted notice discard can request an additional native warning and retains draft on Stay', () => {
    const h = reloadNoticeModel(); h.onReload = () => h.guard(true, 'native warning remains independent'); h.click();
    assert.deepEqual(h.counts(), { confirms: 1, reloads: 1 });
    assert.equal(h.field('title').value, 'dirty'); assert.equal(h.overlay.classList.contains('active'), true);
    // Model choosing Stay: the document remains, and no bypass state is left.
    h.field('title').dispatch('keydown', { key: 'r', ctrlKey: true }); h.guard(true, 'later keyboard reload still warns');
});

test('departure: canceled notice discard leaves later keyboard departure protected', () => {
    const h = reloadNoticeModel(); h.accept = false; h.click();
    assert.deepEqual(h.counts(), { confirms: 1, reloads: 0 });
    assert.equal(h.field('title').value, 'dirty'); assert.equal(h.overlay.classList.contains('active'), true);
    h.field('title').dispatch('keydown', { key: 'r', ctrlKey: true }); h.guard(true);
});

test('departure: pending save blocks notice reload before either confirmation', async () => {
    const h = reloadNoticeModel(); const saving = h.submit(); h.click();
    assert.deepEqual(h.counts(), { confirms: 0, reloads: 0 }); h.guard(true);
    h.component.hideModal(); h.click(); assert.deepEqual(h.counts(), { confirms: 0, reloads: 0 }); h.guard(true);
    h.pending[0].resolve(true); await saving; h.guard(false);
});
