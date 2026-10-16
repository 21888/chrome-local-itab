'use strict';
// Production shortcut methods with modeled DOM events and deferred results.
// Existing-text composition can start/update without an input event; see the
// pinned Chromium source/test in docs/shortcut-icon-composition-validation.md.
// This is not a native OS/Chrome IME reproduction.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./helpers/dashboard-harness');
const image = 'data:image/png;base64,' + 'A'.repeat(240);
const nextTask = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
};
function editor(mode = 'edit') {
    const h = createHarness();
    h.field = name => h.component.modal.querySelector(`#shortcut-${name}`);
    for (const id of ['modal-close', 'cancel-btn', 'fetch-icon-btn', 'refresh-icon-btn', 'shortcut-form', 'shortcut-edit-preview', 'shortcut-preview-hidden']) {
        const element = h.document.createElement(id === 'shortcut-form' ? 'form' : id.startsWith('shortcut-') ? 'div' : 'button');
        element.id = id; h.component.modal.append(element);
    }
    h.button = h.component.modal.querySelector('#fetch-icon-btn');
    h.button.disabled = false; h.button.innerHTML = 'Fetch icon'; h.button.style.animation = 'none';
    h.notices = []; h.context.showErrorMessage = message => h.notices.push(message);
    h.storageManager.set = () => assert.fail('no implicit storage write');
    h.context.fetch = () => assert.fail('no real network');
    h.component.attachModalEventListeners();
    if (mode === 'edit') h.component.openEditModal(0);
    else {
        h.component.openAddModal();
        h.field('title').value = 'Synthetic new shortcut';
        h.field('url').value = 'https://example.com/new';
        h.field('icon').value = 'Icon';
        h.component.updateShortcutPreview();
    }
    h.context.window.localItabPrivacy.onlineFavicons = true;
    h.requests = [];
    h.component.fetchFaviconAsDataUrl = () => { const gate = deferred(); h.requests.push(gate); return gate.promise; };
    h.startComposition = name => {
        const field = h.field(name); field.focus();
        const start = field.dispatch('compositionstart', { data: '' });
        // Match existing-text reconversion: mark text without changing it.
        const update = field.dispatch('compositionupdate', { data: field.value });
        assert.equal(start.prevented, false); assert.equal(update.prevented, false);
        return field;
    };
    return h;
}
function settle(gate, outcome) {
    if (outcome === 'failure') gate.reject(new Error('Synthetic icon failure'));
    else gate.resolve(image);
}
function assertRestored(h) {
    assert.equal(h.button.disabled, false);
    assert.equal(h.button.innerHTML, 'Fetch icon');
    assert.equal(h.button.style.animation, 'none');
}

for (const mode of ['add', 'edit']) for (const field of ['url', 'icon']) for (const outcome of ['success', 'failure']) {
    test(`${mode}/${field}: composition before input discards old fetch ${outcome}`, async () => {
        const h = editor(mode), before = [...h.component.readShortcutDraft()];
        let inputs = 0; h.field(field).addEventListener('input', () => { inputs++; });
        const preview = h.field('edit-preview').children[0];
        const fetching = h.component.fetchWebsiteIcon(); assert.equal(h.button.disabled, true);
        const focused = h.startComposition(field);
        // Resolve on a later task, not by pretending a network task interrupts
        // a synchronous sequence of native editing events.
        await nextTask(); settle(h.requests[0], outcome); await fetching;
        assert.deepEqual([...h.component.readShortcutDraft()], before, 'old fetch must not replace composition-owned text');
        assert.equal(h.component.modal.querySelector('#url-error').textContent, '', 'stale failure is silent');
        assert.equal(h.document.activeElement, focused); assert.equal(inputs, 0);
        assert.equal(h.field('edit-preview').children[0], preview, 'no unnecessary preview repaint');
        assert.equal(h.requests.length, 1); assertRestored(h);
    });
}

for (const field of ['url', 'icon']) for (const completion of ['end', 'cancel']) {
    test(`${field}: ${completion} with unchanged text cannot revive the old fetch`, async () => {
        const h = editor(), before = [...h.component.readShortcutDraft()];
        const fetching = h.component.fetchWebsiteIcon(), input = h.startComposition(field);
        if (completion === 'cancel') input.dispatch('compositionupdate', { data: '' });
        input.dispatch('compositionend', { data: completion === 'cancel' ? '' : input.value });
        await nextTask(); h.requests[0].resolve(image); await fetching;
        assert.deepEqual([...h.component.readShortcutDraft()], before); assertRestored(h);
    });
}

for (const field of ['url', 'icon']) for (const oldOutcome of ['success', 'failure']) {
    test(`${field}: old ${oldOutcome} leaves a newer explicit fetch in control`, async () => {
        const h = editor(), before = [...h.component.readShortcutDraft()];
        const first = h.component.fetchWebsiteIcon(), input = h.startComposition(field);
        assertRestored(h);
        input.dispatch('compositionend', { data: input.value });
        h.button.focus(); h.button.dispatch('click');
        assert.equal(h.requests.length, 2, 'only explicit Fetch starts the next request');
        const current = h.component._iconRequest, spinner = h.button.innerHTML;
        await nextTask(); settle(h.requests[0], oldOutcome); await first;
        assert.equal(h.component._iconRequest, current); assert.equal(h.button.disabled, true);
        assert.equal(h.button.innerHTML, spinner); assert.equal(h.button.style.animation, 'spin 1s linear infinite');
        assert.deepEqual([...h.component.readShortcutDraft()], before);
        assert.equal(h.component.modal.querySelector('#url-error').textContent, '');
        h.requests[1].resolve(image); await nextTask();
        assert.equal(h.field('icon').value, image); assert.equal(h.field('edit-preview').querySelector('img').src, image);
        assertRestored(h);
    });
}

for (const unrelated of ['title', 'category']) {
    test(`${unrelated} intent does not cancel a URL/icon fetch`, async () => {
        const h = editor(), fetching = h.component.fetchWebsiteIcon();
        if (unrelated === 'title') h.startComposition('title');
        else { h.field('category').value = 'social'; h.field('category').dispatch('change'); }
        assert.equal(h.button.disabled, true);
        h.requests[0].resolve(image); await fetching;
        assert.equal(h.field('icon').value, image); assertRestored(h);
    });
}

for (const field of ['url', 'icon']) {
    test(`${field}: composition alone performs no fetch, preview read or write`, () => {
        const h = editor(), preview = h.field('edit-preview').children[0];
        h.context.window.faviconCache = { peekIconDataUrl() { assert.fail('no extra preview cache read'); } };
        const input = h.startComposition(field);
        input.dispatch('compositionend', { data: input.value }); h.startComposition(field);
        assert.equal(h.requests.length, 0); assert.equal(h.field('edit-preview').children[0], preview);
        assertRestored(h);
    });
    test(`${field}: composition also invalidates a pending explicit cache refresh`, async () => {
        const h = editor(), gate = deferred(), before = [...h.component.readShortcutDraft()];
        h.context.window.faviconCache = { getOriginFromUrl: () => 'https://example.com', invalidate: () => gate.promise };
        h.component.modal.querySelector('#refresh-icon-btn').dispatch('click');
        h.startComposition(field); gate.resolve(); await nextTask();
        assert.deepEqual([...h.component.readShortcutDraft()], before); assert.deepEqual(h.notices, []);
        assert.equal(h.requests.length, 0);
    });
}

test('a fresh explicit fetch after composition still reports its own failure and respects privacy', async () => {
    const h = editor(), input = h.startComposition('icon'); input.dispatch('compositionend', { data: input.value });
    h.button.dispatch('click'); assert.equal(h.requests.length, 1);
    h.requests[0].reject(new Error('Current failure')); await nextTask();
    assert.equal(h.component.modal.querySelector('#url-error').textContent, 'Could not fetch the icon. Please try again.');
    assertRestored(h);
    h.context.window.localItabPrivacy.onlineFavicons = false;
    h.button.dispatch('click'); await nextTask();
    assert.equal(h.requests.length, 1);
    assert.equal(h.component.modal.querySelector('#url-error').textContent, 'Enable online icon fetching in Settings > Privacy first.');
});
