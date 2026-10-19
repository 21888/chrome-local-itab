const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHarness, submit, deferred } = require('./helpers/dashboard-harness');

function editor() {
    const h = createHarness();
    h.component.openAddModal();
    h.field = name => h.component.modal.querySelector(`#shortcut-${name}`);
    h.error = name => h.component.modal.querySelector(`#${name}-error`);
    h.save = h.component.modal.querySelector('#save-btn');
    h.raw = () => ['title', 'url', 'icon', 'category'].map(name => h.field(name).value);
    h.writes = [];
    h.storageManager.set = async (...args) => { h.writes.push(args); return true; };
    h.context.fetch = () => assert.fail('validation must not request network');
    return h;
}

test('actual editor markup associates each validated field with its existing error', () => {
    const source = fs.readFileSync('newtab.js', 'utf8');
    for (const field of ['title', 'url']) {
        const markup = source.match(new RegExp(`<input[^>]+id="shortcut-${field}"[^>]*>`))?.[0];
        assert.ok(markup);
        assert.match(markup, new RegExp(`aria-describedby="${field}-error"`));
        assert.match(markup, /aria-invalid="false"/);
        assert.equal((source.match(new RegExp(`id="${field}-error"`, 'g')) || []).length, 1);
    }
});

for (const [name, title, url, first, invalid] of [
    ['empty form', '', '', 'title', ['title', 'url']],
    ['unsafe URL', '  Synthetic title  ', 'javascript:alert(1)', 'url', ['url']],
    ['long title', 'x'.repeat(51), 'https://example.com/synthetic', 'title', ['title']],
    ['both fields invalid', 'x'.repeat(51), 'data:text/html,no', 'title', ['title', 'url']]
]) test(`${name}: failed Save focuses first invalid field without mutating draft or records`, async () => {
    const h = editor();
    h.field('title').value = title; h.field('url').value = url;
    h.field('icon').value = ' 🧪 '; h.field('category').value = 'social';
    const raw = h.raw(), records = JSON.stringify(h.component.links);
    h.save.focus(); await submit(h.component);
    assert.ok(h.document.activeElement === h.field(first), "focus must remain on the expected node");
    for (const field of ['title', 'url']) {
        assert.equal(Boolean(h.error(field).textContent), invalid.includes(field));
        assert.equal(h.field(field).getAttribute('aria-invalid'), String(invalid.includes(field)));
    }
    assert.deepEqual(h.raw(), raw); assert.equal(JSON.stringify(h.component.links), records);
    assert.equal(h.writes.length, 0); assert.equal(h.component.modal.classList.contains('active'), true);
});

test('correcting one field clears its invalid state and focuses the remaining invalid URL', async () => {
    const h = editor(); h.save.focus(); await submit(h.component);
    h.field('title').value = '  Corrected title  '; h.save.focus(); await submit(h.component);
    assert.ok(h.document.activeElement === h.field('url'), "focus must remain on the expected node");
    assert.equal(h.error('title').textContent, '');
    assert.equal(h.field('title').getAttribute('aria-invalid'), 'false');
    assert.equal(h.field('url').getAttribute('aria-invalid'), 'true');
    assert.equal(h.field('title').value, '  Corrected title  ');
    assert.equal(h.writes.length, 0);
});

test('corrected valid form keeps existing normalization and commits exactly once', async () => {
    const h = editor(); h.save.focus(); await submit(h.component);
    h.field('title').value = '  Synthetic <note> & 台账  ';
    h.field('url').value = 'example.com/synthetic-editor?value=1';
    h.field('icon').value = ' 🧪 '; h.field('category').value = 'social';
    h.save.focus(); await submit(h.component);
    assert.equal(h.writes.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(h.component.links.at(-1))), {
        title: 'Synthetic <note> & 台账', url: 'https://example.com/synthetic-editor?value=1', icon: '🧪', category: 'social'
    });
    assert.equal(h.component.modal.classList.contains('active'), false);
    for (const field of ['title', 'url']) assert.equal(h.field(field).getAttribute('aria-invalid'), 'false');
});

test('validation invoked outside the current editor does not steal unrelated focus', () => {
    const h = editor(); h.component.hideModal(); h.search.focus();
    assert.equal(h.component.validateForm('', ''), false);
    assert.ok(h.document.activeElement === h.search, "focus must remain on the expected node"); assert.equal(h.writes.length, 0);
});

test('clearing feedback resets invalid attributes without changing draft or focus', () => {
    const h = editor(); h.field('title').value = '  unchanged draft  ';
    h.component.showFormError('title', 'Invalid title'); h.component.showFormError('url', 'Invalid URL');
    const raw = h.raw(); h.field('icon').focus(); h.component.clearFormErrors();
    for (const field of ['title', 'url']) {
        assert.equal(h.error(field).textContent, '');
        assert.equal(h.field(field).getAttribute('aria-invalid'), 'false');
    }
    assert.ok(h.document.activeElement === h.field('icon'), "focus must remain on the expected node"); assert.deepEqual(h.raw(), raw);
    assert.equal(h.writes.length, 0);
});

test('late save failure exposes associated error without marking valid URL invalid or moving newer focus', async () => {
    const h = editor(), pending = deferred();
    h.field('title').value = '  Synthetic pending draft  '; h.field('url').value = 'https://example.com/pending';
    h.storageManager.set = async (...args) => { h.writes.push(args); return pending.promise; };
    const raw = h.raw(), records = JSON.stringify(h.component.links);
    h.save.focus(); const saving = submit(h.component); h.field('icon').focus(); pending.resolve(false); await saving;
    assert.ok(h.document.activeElement === h.field('icon'), "focus must remain on the expected node"); assert.deepEqual(h.raw(), raw);
    assert.equal(JSON.stringify(h.component.links), records); assert.equal(h.writes.length, 1);
    assert.match(h.error('url').textContent, /Failed to save/);
    assert.equal(h.field('url').getAttribute('aria-invalid'), 'false');
    assert.equal(h.component.modal.classList.contains('active'), true);
});
