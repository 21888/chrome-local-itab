const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createHarness, deferred, submit } = require('./helpers/dashboard-harness');
const image = 'data:image/png;base64,' + 'A'.repeat(240);
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
function editor() {
    const h = createHarness();
    for (const id of ['shortcut-edit-preview', 'shortcut-preview-hidden']) {
        const node = h.document.createElement('div'); node.id = id; h.component.modal.append(node);
    }
    h.field = name => h.component.modal.querySelector(`#shortcut-${name}`);
    h.preview = () => h.field('edit-preview');
    h.writes = [];
    h.storageManager.set = async (...args) => { h.writes.push(args); return true; };
    h.context.fetch = () => { throw new Error('Unexpected network'); };
    h.component.openEditModal(0);
    return h;
}
test('preview is literal, normalized, non-interactive, and makes no writes/network calls', async () => {
    const h = editor(); let reads = 0;
    h.context.window.faviconCache = { getOriginFromUrl: url => new URL(url).origin, peekIconDataUrl: async () => { reads++; return null; }, getIconDataUrl() { assert.fail('online API'); }, getIconDataUrlByUrl() { assert.fail('online API'); } };
    h.field('title').value = '  <img src=x onerror=alert(1)>  ';
    h.field('url').value = ' example.com/new ';
    h.field('icon').value = '  ';
    h.component.updateShortcutPreview(); await tick();
    assert.equal(h.preview().querySelector('.shortcut-title').textContent, '<img src=x onerror=alert(1)>');
    assert.equal(h.preview().querySelector('.shortcut-icon').textContent, '🌐');
    assert.equal(h.preview().querySelectorAll('img,button,a').length, 0);
    assert.equal(h.component.normalizedShortcutDraft().url, 'https://example.com/new');
    assert.ok(reads); assert.equal(h.writes.length, 0); assert.equal(h.component.hasUncommittedShortcutWork(), true);
    h.component.hideModal(); assert.equal(h.writes.length, 0); assert.equal(h.component.links[0].title, 'A <img "quoted">');
});
test('preview uses safe cached images and rejects unsafe cached payloads', async () => {
    for (const payload of [image, 'data:image/svg+xml,<svg onload=alert(1)>', 'https://example.com/icon.png']) {
        const h = editor(); h.field('icon').value = 'https://example.com/icon.png';
        h.context.window.faviconCache = { peekIconDataUrl: async key => { assert.equal(key, 'https://example.com/icon.png'); return payload; } };
        h.component.updateShortcutPreview(); await tick();
        const img = h.preview().querySelector('img');
        assert.equal(Boolean(img), payload === image);
        if (img) { assert.equal(img.src, image); assert.equal(img.draggable, false); }
    }
});
test('late reads cannot overwrite newer input, a reopened editor, or a closed preview', async () => {
    for (const transition of ['input', 'reopen', 'close', 'raw-change']) {
        const h = editor(), pending = deferred();
        h.field('icon').value = 'https://example.com/icon.png';
        h.context.window.faviconCache = { getOriginFromUrl: url => new URL(url).origin, peekIconDataUrl: () => pending.promise };
        h.component.updateShortcutPreview(); const oldIcon = h.preview().querySelector('.shortcut-icon');
        if (transition === 'close') h.component.hideModal();
        else if (transition === 'reopen') { h.component.hideModal(); h.component.openEditModal(1); }
        else { h.field('icon').value = 'new'; if (transition === 'input') h.component.updateShortcutPreview(); }
        pending.resolve(image); await tick(); assert.equal(oldIcon.querySelector('img'), null);
    }
});
test('save and preview share trimmed fields and normalized URL; hidden titles have guidance', async () => {
    const h = editor(); h.document.body.classList.add('hide-shortcut-titles');
    h.field('title').value = '  Sample  '; h.field('url').value = ' example.com/path '; h.field('icon').value = '  ✨ ';
    h.component.updateShortcutPreview();
    assert.equal(h.field('preview-hidden').hidden, false);
    assert.equal(h.preview().querySelector('.shortcut-title').textContent, 'Sample');
    const draft = JSON.parse(JSON.stringify(h.component.normalizedShortcutDraft()));
    await submit(h.component); assert.deepEqual(JSON.parse(JSON.stringify(h.component.links[0])), draft);
    assert.equal(h.writes.length, 1);
});
test('explicit fetch updates the preview only while it owns the editor', async () => {
    const h = editor(); const button = h.document.createElement('button'); button.id = 'fetch-icon-btn'; button.style.animation = ''; h.component.modal.append(button);
    h.context.window.localItabPrivacy.onlineFavicons = true;
    h.component.fetchFaviconAsDataUrl = async () => image;
    await h.component.fetchWebsiteIcon();
    assert.equal(h.preview().querySelector('img').src, image);
});
test('read-only cache does not create databases or refresh stale/missing entries', async () => {
    for (const mode of ['missing-db', 'fresh', 'stale', 'missing-record', 'deleted-race', 'unsupported']) {
        let opens = 0, closed = 0, aborted = 0;
        const indexedDB = { databases: async () => mode === 'missing-db' ? [] : [{ name: 'local_itab_icons' }], open() {
            opens++; const request = {};
            queueMicrotask(() => {
                if (mode === 'deleted-race') { request.transaction = { abort() { aborted++; request.onerror(); } }; request.onupgradeneeded(); return; }
                request.result = { close() { closed++; }, transaction(name, permission) {
                    assert.equal(permission, 'readonly'); assert.equal(name, 'icons');
                    return { objectStore() { return { get() { const read = {}; queueMicrotask(() => { read.result = mode === 'missing-record' ? null : { dataUrl: image, updatedAt: mode === 'stale' ? 1 : Date.now() }; read.onsuccess(); }); return read; } }; } };
                } }; request.onsuccess();
            }); return request;
        } };
        if (mode === 'unsupported') delete indexedDB.databases;
        const context = { window: {}, indexedDB, URL, fetch() { assert.fail('network'); }, caches: { open() { assert.fail('cache creation'); } } };
        vm.runInNewContext(fs.readFileSync('favicon-cache.js', 'utf8'), context);
        const result = await context.window.faviconCache.peekIconDataUrl('https://example.com');
        assert.equal(result, mode === 'fresh' ? image : null);
        assert.equal(opens, ['missing-db', 'unsupported'].includes(mode) ? 0 : 1);
        if (mode === 'deleted-race') assert.equal(aborted, 1);
        if (['fresh', 'stale', 'missing-record'].includes(mode)) assert.equal(closed, 1);
    }
});
test('input and change events refresh title, URL and icon without starting explicit fetch', async () => {
    const h = editor();
    for (const id of ['modal-close', 'cancel-btn', 'shortcut-form', 'fetch-icon-btn', 'refresh-icon-btn']) {
        const node = h.document.createElement('button'); node.id = id; h.component.modal.append(node);
    }
    h.component.fetchWebsiteIcon = () => assert.fail('automatic fetch');
    h.component.attachModalEventListeners();
    for (const event of ['input', 'change']) {
        h.field('title').value = event; h.field('title').dispatch(event);
        assert.equal(h.preview().querySelector('.shortcut-title').textContent, event);
        h.field('icon').value = '✨'; h.field('icon').dispatch(event);
        assert.equal(h.preview().querySelector('.shortcut-icon').textContent, '✨');
        h.field('url').value = 'javascript:alert(1)'; h.field('url').dispatch(event);
        assert.equal(h.component.normalizedShortcutDraft().url, '');
    }
    assert.equal(h.writes.length, 0);
});
test('preview copies dashboard-scoped size and color variables and clears stale overrides', () => {
    const h = editor(); const dashboard = h.document.createElement('section'); dashboard.id = 'dashboard'; h.document.body.append(dashboard);
    const values = { '--shortcut-icon-size': '96px', '--shortcut-icon-font': '48px', '--shortcut-title-size': '24px', '--shortcut-title-color': '#123456' };
    h.context.window.getComputedStyle = element => { assert.equal(element, dashboard); return { getPropertyValue: name => values[name] || '' }; };
    h.component.updateShortcutPreview();
    for (const [name, value] of Object.entries(values)) assert.equal(h.preview().style[name], value);
    delete values['--shortcut-icon-size']; h.component.updateShortcutPreview();
    assert.equal(h.preview().style['--shortcut-icon-size'], undefined);
});
test('category-only changes do not discard a pending content preview', async () => {
    const h = editor(), pending = deferred();
    h.field('icon').value = 'https://example.com/icon.png';
    h.context.window.faviconCache = { peekIconDataUrl: () => pending.promise };
    h.component.updateShortcutPreview(); h.field('category').value = 'social'; h.field('category').dispatch('change');
    pending.resolve(image); await tick(); assert.equal(h.preview().querySelector('img').src, image);
});
