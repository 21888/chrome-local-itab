const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const api = require('../shared/local-ai-search.js');
const { createDocument } = require('./helpers/finder-dom-model');
const tick = () => new Promise(setImmediate);

function fixture() {
    const document = createDocument(), host = document.createElement('nav');
    document.body.append(host);
    const stores = Object.fromEntries(['prompt', 'collection'].map(type => [type, {
        fail: false,
        async read() {
            if (this.fail) throw new Error('Unavailable');
            return { revision: 1, records: [{ id: `${type}_record`, title: 'Saved', body: 'literal body', tags: [], deletedAt: null }] };
        },
        subscribe(listener) { this.listener = listener; return () => { this.listener = null; }; }
    }]));
    const context = { document, LocalItabAISearch: api }; context.window = context;
    vm.createContext(context);
    for (const file of ['shared/dialog-focus.js', 'shared/local-ai-search-view.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
    }
    const view = context.LocalItabAISearchView.mount(host, stores);
    const opener = host.querySelector('button'); opener.focus(); view.open();
    return { document, stores, view, opener, input: document.querySelector('input') };
}

test('IME focusout releases the search composition latch when compositionend is lost', async () => {
    const f = fixture(); await tick();
    try {
        f.input.dispatch('compositionstart');
        const filter = f.document.querySelector('select');
        // Real focus transfer fires focusout. The small DOM model needs it explicitly.
        f.input.dispatch('focusout', { relatedTarget: filter }); filter.focus();
        filter.dispatch('keydown', { key: 'Escape' });
        assert.ok(!f.document.querySelector('.ai-search-overlay'), 'Escape closes after the composing field loses focus');
        assert.ok(f.document.activeElement === f.opener, 'closing restores opener focus');
    } finally { f.view.destroy(); }
});

test('retry retains focus inside the modal while error controls are replaced', async () => {
    const f = fixture(); await tick();
    try {
        f.stores.prompt.fail = true; f.stores.prompt.listener(); await tick();
        const retry = f.document.querySelectorAll('button').find(node => node.textContent === 'Read again');
        assert.ok(retry); retry.focus(); retry.dispatch('click');
        const overlay = f.document.querySelector('.ai-search-overlay');
        assert.ok(overlay.contains(f.document.activeElement), 'retry must not strand keyboard focus on document.body');
        await tick();
        assert.ok(overlay.contains(f.document.activeElement), 'focus remains in the modal after the retry settles');
    } finally { f.view.destroy(); }
});

test('literal snippets never split an emoji surrogate pair at a truncation boundary', () => {
    const body = 'a'.repeat(179) + '😀' + 'tail';
    const rows = api.search({ prompt: { records: [{ id: 'prompt_record', title: 'Saved', body, tags: [], deletedAt: null }] } });
    assert.equal(rows.length, 1);
    assert.ok(rows[0].snippet.isWellFormed(), 'snippet must remain well-formed Unicode');
});

test('snippet match offsets map case-expanded Unicode back to the literal source', () => {
    // U+0130 lowercases to two code points. Its folded offset is not a source offset.
    const body = 'İ'.repeat(250) + ' exact needle suffix';
    const rows = api.search({ prompt: { records: [{ id: 'prompt_record', title: 'Saved', body, tags: [], deletedAt: null }] } }, 'needle');
    assert.equal(rows.length, 1);
    assert.ok(rows[0].snippet.includes('needle'), 'a body match must show the literal matched text');
});
