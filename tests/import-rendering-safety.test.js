'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const StorageManager = require('../storage.js');
const { createHarness } = require('./helpers/dashboard-harness.js');
const { createDocument } = require('./helpers/task-dom-model.js');
const tasks = require('../shared/local-tasks-store.js');
const { Controller } = require('../shared/local-tasks-controller.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
function denyHtml(document) {
    const proto = Object.getPrototypeOf(document.body);
    for (const key of ['innerHTML', 'outerHTML']) Object.defineProperty(proto, key, {
        set() { throw new Error(`Unexpected HTML sink: ${key}`); }
    });
    proto.insertAdjacentHTML = () => { throw new Error('Unexpected HTML parsing'); };
}

test('settings import to dashboard renders hostile labels literally and remote icons stay offline by default (DOM model)', async () => {
    const manager = new StorageManager();
    const hostile = '<img src="https://invalid.example/tracker" onerror="alert(1)">';
    const icons = [hostile, 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=',
        'https://invalid.example/icon', 'https://www.google.com/s2/favicons?domain=invalid.example&sz=64'];
    const source = JSON.stringify({ links: icons.map((icon, index) => ({ title: hostile, icon,
        url: `https://example.com/${index}?text=%3Csvg%3E`, category: 'quoted"category' })),
        categories: [{ id: 'quoted"category', name: hostile, icon: hostile }] });
    const config = manager.validateImportPayload(JSON.parse(source));
    assert.equal(config.privacy.onlineFavicons, false);
    const h = createHarness(config.links); denyHtml(h.document);
    let networkCalls = 0;
    h.context.fetch = () => { networkCalls++; throw new Error('No real network allowed'); };
    h.context.indexedDB = { open() { throw new Error('Empty isolated cache'); } };
    vm.runInContext(fs.readFileSync('favicon-cache.js', 'utf8'), h.context);
    h.context.window.faviconCache.setOnlineEnabled(config.privacy.onlineFavicons);
    const nav = h.context.window.categoryNavigation;
    nav.categories = config.categories; nav.currentCategory = 'all';
    h.component.categories = config.categories;
    const list = h.document.createElement('div'); list.id = 'category-list'; h.document.body.append(list);
    nav.render(); h.document.documentElement.dataset.dashboardTemplate = 'folio'; h.component.refreshTemplate();
    await tick(); await tick();
    assert.equal(networkCalls, 0);
    for (let index = 0; index < config.links.length; index++) {
        const title = h.tile(index).querySelector('.shortcut-title');
        assert.equal(title.textContent, hostile); assert.equal(title.children.length, 0);
    }
    const name = list.querySelectorAll('.category-name').at(-1);
    assert.equal(name.textContent, hostile); assert.equal(name.children.length, 0);
    const icon = list.querySelectorAll('.category-icon').at(-1);
    assert.equal(icon.textContent, hostile); assert.equal(icon.children.length, 0);
    assert.equal(h.document.querySelectorAll('img, iframe, script, object').length, 0);
    assert.equal(h.opened.length, 0, 'import/render does not open shortcut addresses');
    for (const url of ['javascript:alert(1)', 'data:text/html,<svg>', 'file:///tmp/secret', 'chrome://settings', 'vbscript:msgbox(1)']) {
        assert.throws(() => manager.validateImportPayload({ links: [{ title: hostile, url }] }), /Invalid backup:/);
    }
});

test('task backup review/replace to rows and pinned text stays inert (DOM and storage model)', async () => {
    const document = createDocument(); denyHtml(document);
    const host = document.createElement('article'); document.body.append(host);
    const text = '<svg onload="alert(1)"><image href="https://invalid.example/tracker"></svg> javascript:alert(1)';
    const date = '2026-10-10T00:00:00.000Z';
    const file = { format: tasks.FORMAT, schemaVersion: 1, exportedAt: date, recovery: [],
        content: { pinnedId: 'task_import_1', records: [{ id: 'task_import_1', version: 'version_1', text,
            state: 'active', removedFrom: null, createdAt: date, updatedAt: date }] } };
    let raw, writes = 0, sequence = 0;
    const backend = { lock: fn => fn(), read: async () => raw && structuredClone(raw),
        write: async value => { writes++; raw = structuredClone(value); }, subscribe: () => () => {} };
    const store = new tasks.Store(backend, { id: () => `identity_${++sequence}`, now: () => date });
    const review = await store.review(JSON.stringify(file));
    assert.equal(writes, 0, 'review never writes');
    await store.mutate(store.request('replace', review));
    assert.equal(writes, 1);
    const api = { ...tasks, Controller }, controller = new Controller(store);
    const context = vm.createContext({ document, window: { LocalItabTasks: api }, setTimeout, URL, Blob, console });
    for (const key of ['fetch', 'XMLHttpRequest', 'Image', 'DOMParser']) Object.defineProperty(context, key, {
        get() { throw new Error(`Unexpected network/parsing API: ${key}`); }
    });
    vm.runInContext(fs.readFileSync('shared/dialog-focus.js', 'utf8'), context);
    vm.runInContext(fs.readFileSync('shared/local-tasks-view.js', 'utf8'), context);
    const view = api.mount(host, { controller, alwaysVisible: true });
    await tick(); await tick();
    for (const selector of ['.tasks-text', '.tasks-next-text']) {
        const node = host.querySelector(selector); assert(node, selector);
        assert.equal(node.textContent, selector === '.tasks-next-text' ? `Next up: ${text}` : text); assert.equal(node.children.length, 0);
    }
    assert.equal(host.querySelectorAll('img, svg, iframe, script, object, a').length, 0);
    assert.equal(writes, 1, 'render has no storage side effects');
    view.destroy();
});
