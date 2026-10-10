const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');

// Synthetic bubbling events exercise the production helper and shortcut methods.
// They cannot validate a platform IME, its event order, or candidate-window UI.
function model() {
    const document = createDocument();
    const context = vm.createContext({ document, window: { addEventListener() {} }, URL,
        console: { log() {}, error() {}, warn() {} },
        setTimeout() { throw new Error('Dialog ownership must not depend on a timer'); } });
    vm.runInContext(fs.readFileSync('shared/dialog-focus.js', 'utf8'), context);
    const opener = document.createElement('button'); document.body.append(opener); opener.focus();
    const makeOverlay = () => {
        const overlay = document.createElement('div'), input = document.createElement('input'), last = document.createElement('button');
        overlay.className = 'modal-overlay'; overlay.append(input, last); document.body.append(overlay);
        let cleanup, closes = 0;
        return { overlay, input, last, get closes() { return closes; },
            open() { cleanup = context.window.LocalItabDialog.open(overlay, input, () => { closes++; cleanup(); }); return cleanup; } };
    };
    return { document, context, opener, makeOverlay };
}
const expectProtected = (h, dialog, event, draft = '未保存的草稿') => {
    assert.equal(event.prevented, false, 'native IME cancellation must remain available');
    assert.equal(event.stopped, true, 'IME Escape cannot reach another modal/global handler');
    assert.equal(dialog.closes, 0);
    assert.equal(dialog.overlay.classList.contains('active'), true);
    assert.equal(dialog.overlay.getAttribute('aria-hidden'), 'false');
    assert.equal(h.document.activeElement, dialog.input);
    assert.equal(dialog.input.value, draft);
    assert.equal(h.opener.inert, true);
};

for (const [label, fields] of [['isComposing', { isComposing: true }], ['legacy 229', { keyCode: 229 }]]) {
    test(`DOM model: ${label} Escape preserves the dialog draft without cancelling IME default`, () => {
        const h = model(), dialog = h.makeOverlay(); dialog.open(); dialog.input.value = '未保存的草稿';
        expectProtected(h, dialog, dialog.input.dispatch('keydown', { key: 'Escape', ...fields }));
        const normal = dialog.input.dispatch('keydown', { key: 'Escape' });
        assert.equal(normal.prevented, true); assert.equal(dialog.closes, 1); assert.equal(h.document.activeElement, h.opener);
    });
}

test('DOM model: unflagged Escape follows composition lifecycle and ignores another field’s end', () => {
    const h = model(), dialog = h.makeOverlay(); dialog.open(); dialog.input.value = '未保存的草稿';
    dialog.input.dispatch('compositionstart');
    expectProtected(h, dialog, dialog.input.dispatch('keydown', { key: 'Escape' }));
    dialog.last.dispatch('compositionend');
    expectProtected(h, dialog, dialog.input.dispatch('keydown', { key: 'Escape', isComposing: false, keyCode: 27 }));
    dialog.input.dispatch('compositionend');
    dialog.input.dispatch('keydown', { key: 'Escape' });
    assert.equal(dialog.closes, 1); assert.equal(h.document.activeElement, h.opener);
});

for (const change of ['blur and return', 'focus without end', 'remove composing field']) {
    test(`DOM model: ${change} releases stale composition without a timer`, () => {
        const h = model(), dialog = h.makeOverlay(); dialog.open(); dialog.input.dispatch('compositionstart');
        if (change === 'blur and return') {
            dialog.input.dispatch('focusout', { relatedTarget: dialog.last }); dialog.last.focus(); dialog.input.focus();
        } else if (change === 'focus without end') dialog.last.focus();
        else { dialog.input.remove(); dialog.last.focus(); }
        h.document.activeElement.dispatch('keydown', { key: 'Escape' });
        assert.equal(dialog.closes, 1); assert.equal(h.document.activeElement, h.opener);
    });
}

test('DOM model: closing removes all listeners; stale cleanup/events cannot affect a reopened overlay', () => {
    const h = model(), dialog = h.makeOverlay(), closeOld = dialog.open();
    dialog.input.dispatch('compositionstart');
    const oldListeners = Object.fromEntries([...dialog.overlay.listeners].map(([type, callbacks]) => [type, callbacks[0]]));
    closeOld();
    for (const callbacks of dialog.overlay.listeners.values()) assert.equal(callbacks.length, 0);
    dialog.open(); dialog.input.value = '新的草稿'; dialog.input.dispatch('compositionstart');
    closeOld(); oldListeners.compositionend({ target: dialog.input }); oldListeners.focusout({ target: dialog.input });
    oldListeners.keydown({ key: 'Escape', preventDefault() { assert.fail('retired key handler ran'); } });
    expectProtected(h, dialog, dialog.input.dispatch('keydown', { key: 'Escape' }), '新的草稿');
    dialog.input.dispatch('compositionend'); dialog.input.dispatch('keydown', { key: 'Escape' });
    assert.equal(dialog.closes, 1); assert.equal(h.document.activeElement, h.opener);
    dialog.open(); dialog.input.dispatch('keydown', { key: 'Escape' });
    assert.equal(dialog.closes, 2, 'composition does not carry over to a later opening');
});

test('DOM model: composition protection leaves Tab trapping and held Enter suppression unchanged', () => {
    const h = model(), dialog = h.makeOverlay(); dialog.open(); dialog.input.dispatch('compositionstart');
    const tab = dialog.input.dispatch('keydown', { key: 'Tab', shiftKey: true, isComposing: true });
    assert.equal(tab.prevented, true); assert.equal(h.document.activeElement, dialog.last);
    assert.equal(dialog.last.dispatch('keydown', { key: 'Tab' }).prevented, true); assert.equal(h.document.activeElement, dialog.input);
    assert.equal(dialog.input.dispatch('keydown', { key: 'Enter', repeat: true }).prevented, true);
    assert.equal(dialog.input.dispatch('keydown', { key: 'Enter' }).prevented, false); assert.equal(dialog.closes, 0);
});

test('DOM model: stacked dialogs keep composition and focus restoration owned by their opening', () => {
    const h = model(), outer = h.makeOverlay(); outer.open(); outer.input.dispatch('compositionstart');
    outer.input.dispatch('focusout'); // Native focus movement to the inner overlay blurs this input.
    const inner = h.makeOverlay(); inner.open(); inner.input.value = '未保存的草稿'; inner.input.dispatch('compositionstart');
    let escaped = 0; h.document.body.addEventListener('keydown', () => escaped++);
    expectProtected(h, inner, inner.input.dispatch('keydown', { key: 'Escape' }));
    assert.equal(outer.closes, 0); assert.equal(outer.overlay.inert, true); assert.equal(escaped, 0);
    inner.input.dispatch('compositionend'); inner.input.dispatch('keydown', { key: 'Escape' });
    assert.equal(inner.closes, 1); assert.equal(outer.closes, 0); assert.equal(outer.overlay.inert, false);
    assert.equal(h.document.activeElement, outer.input); assert.equal(h.opener.inert, true);
    outer.input.dispatch('keydown', { key: 'Escape' }); assert.equal(outer.closes, 1); assert.equal(h.document.activeElement, h.opener);
});

function shortcutModel() {
    const h = model(), writes = [], pending = [];
    h.context.storageManager = { defaultConfig: { layout: { columns: 6 } }, set(key, value) {
        const request = deferred(); writes.push({ key, value: structuredClone(value) }); pending.push(request); return request.promise;
    } };
    vm.runInContext(fs.readFileSync('newtab.js', 'utf8') + '\nthis.ShortcutsComponent = ShortcutsComponent;', h.context);
    const component = new h.context.ShortcutsComponent(['A', 'B'].map(title => ({ title, url: `https://example.com/${title}`, icon: '🌐', category: 'work' })));
    const overlay = h.document.createElement('div'); overlay.className = 'modal-overlay';
    const heading = h.document.createElement('h3'); heading.className = 'modal-title'; overlay.append(heading);
    for (const [id, tag] of [['shortcut-title', 'input'], ['shortcut-url', 'input'], ['shortcut-icon', 'input'], ['shortcut-category', 'select'], ['save-btn', 'button'], ['title-error', 'div'], ['url-error', 'div']]) {
        const field = h.document.createElement(tag); field.id = id; if (id.endsWith('-error')) field.className = 'form-error'; overlay.append(field);
    }
    h.document.body.append(overlay); component.modal = overlay;
    return { ...h, component, overlay, input: overlay.querySelector('#shortcut-title'), writes, pending };
}

for (const protection of ['flag', '229', 'lifecycle']) {
    test(`DOM model: real shortcut editor retains ${protection} IME Escape draft, then dismisses normally`, () => {
        const h = shortcutModel(); h.component.openEditModal(0); h.input.value = '网站草稿';
        const session = h.component._modalSession;
        if (protection === 'lifecycle') h.input.dispatch('compositionstart');
        const event = h.input.dispatch('keydown', { key: 'Escape', ...(protection === 'flag' ? { isComposing: true } : protection === '229' ? { keyCode: 229 } : {}) });
        assert.equal(event.prevented, false); assert.equal(h.component._modalSession, session);
        assert.equal(h.component.currentEditIndex, 0); assert.equal(h.overlay.classList.contains('active'), true);
        assert.equal(h.input.value, '网站草稿'); assert.equal(h.document.activeElement, h.input);
        assert.equal(h.component.links[0].title, 'A'); assert.equal(h.writes.length, 0);
        h.input.dispatch('compositionend'); h.input.dispatch('keydown', { key: 'Escape' });
        assert.equal(h.overlay.classList.contains('active'), false); assert.equal(h.component.currentEditIndex, -1);
        assert.equal(h.document.activeElement, h.opener);
    });
}

test('DOM model: shortcut pending-save ownership survives IME cancellation and reopening', async () => {
    const h = shortcutModel(); h.component.openEditModal(0); h.input.value = 'Saved A';
    const save = h.component.handleFormSubmit({ preventDefault() {} }); assert.equal(h.writes.length, 1);
    h.input.dispatch('compositionstart'); h.input.dispatch('keydown', { key: 'Escape' });
    assert.equal(h.overlay.classList.contains('active'), true); assert(h.component._pendingSave);
    h.input.dispatch('compositionend'); h.input.dispatch('keydown', { key: 'Escape' });
    h.component.openEditModal(1); h.input.value = '新网站草稿'; h.input.dispatch('compositionstart');
    h.pending[0].resolve(true); await save;
    assert.equal(h.component.links[0].title, 'Saved A'); assert.equal(h.component.links[1].title, 'B');
    assert.equal(h.overlay.classList.contains('active'), true); assert.equal(h.input.value, '新网站草稿');
    assert.equal(h.document.activeElement, h.input); assert.equal(h.component._pendingSave, null);
    h.input.dispatch('keydown', { key: 'Escape' }); assert.equal(h.overlay.classList.contains('active'), true);
    h.input.dispatch('compositionend'); h.input.dispatch('keydown', { key: 'Escape' });
    assert.equal(h.overlay.classList.contains('active'), false); assert.equal(h.writes.length, 1);
});
