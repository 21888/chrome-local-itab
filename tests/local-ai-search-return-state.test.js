const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const api = require('../shared/local-ai-search.js');
const { createDocument, deferred } = require('./helpers/finder-dom-model');
const tick = () => new Promise(setImmediate);

function fixture() {
    const document = createDocument(), host = document.createElement('nav'); document.body.append(host);
    const stores = Object.fromEntries(['prompt', 'collection'].map(type => [type, {
        records: [{ id: `${type}_record`, title: 'Saved needle', body: 'Original body', tags: [], deletedAt: null }],
        listeners: new Set(), reads: 0, pending: null,
        async read() { this.reads++; return this.pending ? this.pending.promise : { revision: 1, records: this.records }; },
        subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    }]));
    const context = { document, LocalItabAISearch: api }; context.window = context; vm.createContext(context);
    for (const file of ['shared/dialog-focus.js', 'shared/local-ai-search-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
    const view = context.LocalItabAISearchView.mount(host, stores);
    const opener = host.querySelector('button'); opener.focus(); view.open();
    const input = () => document.querySelector('input'), filter = () => document.querySelector('select');
    const button = text => document.querySelectorAll('button').find(node => node.textContent === text);
    return { document, host, context, stores, view, opener, input, filter, button };
}
function search(f, query, type) {
    f.input().value = query; f.input().dispatch('input');
    f.filter().value = type; f.filter().dispatch('change');
}

test('native record return and repeated close/reopen retain query and type without saving records', async () => {
    const f = fixture(); await tick();
    const before = JSON.stringify(Object.values(f.stores).map(store => store.records));
    try {
        search(f, 'needle', 'collection');
        const link = f.document.querySelector('a');
        assert.equal(link.target, '_blank'); assert.equal(link.dispatch('click').prevented, false);
        // Returning from the native new tab leaves the original dialog intact.
        f.view.open(); assert.equal(f.input().value, 'needle'); assert.equal(f.filter().value, 'collection');
        for (let i = 0; i < 3; i++) {
            f.input().dispatch('keydown', { key: 'Escape' });
            assert.equal(f.document.activeElement, f.opener);
            assert.equal(f.stores.prompt.listeners.size, 0);
            f.opener.dispatch('click'); await tick();
            assert.equal(f.input().value, 'needle'); assert.equal(f.filter().value, 'collection');
            assert.equal(f.document.querySelectorAll('a').length, 1);
            assert.equal(f.stores.prompt.listeners.size, 1);
        }
        assert.equal(f.stores.prompt.reads, 4);
        assert.equal(JSON.stringify(Object.values(f.stores).map(store => store.records)), before);
    } finally { f.view.destroy(); }
});

test('reopen refreshes results and does not resurrect a record removed while closed', async () => {
    const f = fixture(); await tick();
    try {
        search(f, 'needle', 'collection'); f.view.close(); f.stores.collection.records = [];
        f.view.open();
        assert.equal(f.document.querySelectorAll('a').length, 0, 'old snapshots are never shown during fresh reads');
        await tick();
        assert.equal(f.document.querySelectorAll('a').length, 0);
        assert.equal(f.input().value, 'needle'); assert.equal(f.filter().value, 'collection');
    } finally { f.view.destroy(); }
});

test('old dialog controls and late reads cannot change a newer reopened search', async () => {
    const f = fixture(); await tick();
    try {
        search(f, 'old', 'prompt');
        const oldInput = f.input(), oldClear = f.button('Clear'), oldClose = f.button('Close');
        const pending = deferred(); f.stores.prompt.pending = pending;
        for (const listener of f.stores.prompt.listeners) listener(); await tick();
        f.view.close(); f.stores.prompt.pending = null; f.view.open(); await tick();
        search(f, 'needle', 'collection');
        oldClear.dispatch('click'); oldClose.dispatch('click'); oldInput.dispatch('compositionstart');
        pending.resolve({ revision: 9, records: [] }); await tick();
        assert.equal(f.input().value, 'needle'); assert.equal(f.filter().value, 'collection');
        assert.equal(f.document.querySelectorAll('a').length, 1);
        assert.equal(f.document.querySelector('a').dispatch('click').prevented, false, 'detached IME events cannot latch composition');
    } finally { f.view.destroy(); }
});

test('Clear stays cleared on reopening and the most recent filter wins', async () => {
    const f = fixture(); await tick();
    try {
        search(f, 'needle', 'collection'); f.view.close(); f.view.open(); await tick();
        f.button('Clear').dispatch('click'); f.filter().value = 'prompt'; f.filter().dispatch('change');
        f.button('Close').dispatch('click'); f.view.open(); await tick();
        assert.equal(f.input().value, ''); assert.equal(f.filter().value, 'prompt');
        assert.equal(f.document.querySelectorAll('a').length, 1);
    } finally { f.view.destroy(); }
});

test('destroy releases subscriptions, blocks reopening and does not leak state into a new mount', async () => {
    const f = fixture(); await tick(); search(f, 'private needle', 'collection');
    const pending = deferred(); f.stores.prompt.pending = pending;
    for (const listener of f.stores.prompt.listeners) listener(); await tick();
    const oldClear = f.button('Clear');
    f.view.destroy(); f.view.destroy(); f.view.open(); f.opener.dispatch('click'); oldClear.dispatch('click');
    pending.resolve({ revision: 1, records: [] }); await tick();
    assert.equal(f.document.querySelector('.ai-search-overlay'), null);
    assert.equal(f.stores.prompt.listeners.size, 0); assert.equal(f.stores.collection.listeners.size, 0);
    f.stores.prompt.pending = null;
    const fresh = f.context.LocalItabAISearchView.mount(f.host, f.stores);
    try {
        fresh.open(); await tick();
        assert.equal(f.input().value, ''); assert.equal(f.filter().value, 'all');
    } finally { fresh.destroy(); }
});
