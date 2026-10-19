'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const StorageManager = require('../storage');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const source = fs.readFileSync('options.js', 'utf8');
const html = fs.readFileSync('options.html', 'utf8');
const clone = value => structuredClone(value);

// Production Options event/tab/save paths and real Store, with synthetic RAM
// Chrome storage. The local model supplies native click/visibility semantics;
// this does not prove browser scroll geometry or screen-reader announcements.
async function fixture(locale = 'en') {
    const raw = {...new StorageManager().cloneDefaultConfig(),
        __localItabPersonalTasksV1: {synthetic: 'untouched tasks'},
        __localItabRestoreRecovery: {synthetic: 'untouched recovery'}};
    const reads = [], writes = [], queues = new Map(); let writeGate = null;
    const locks = {request(name, fn) {
        const result = (queues.get(name) || Promise.resolve()).then(fn);
        queues.set(name, result.catch(() => {})); return result;
    }};
    Object.defineProperty(global, 'navigator', {configurable: true, value: {locks}});
    const crypto = require('node:crypto').webcrypto;
    global.chrome = {storage: {local: {
        async get(keys) { reads.push(clone(keys)); return clone(keys === null ? raw : Object.fromEntries(keys.filter(key => key in raw).map(key => [key, raw[key]]))); },
        async set(value) {
            if (writeGate) { const gate = writeGate; writeGate = null; gate.entered.resolve(); await gate.resume.promise; throw new Error('Synthetic write rejected'); }
            writes.push(clone(value)); Object.assign(raw, clone(value));
        }
    }}};
    const document = createDocument(), field = id => document.getElementById(id);
    const node = (tag, id, parent = document.body) => { const el = document.createElement(tag); if (id) el.id = id; parent.append(el); return el; };
    const tablist = node('aside'); tablist.className = 'options-tabs';
    const content = node('div'); content.className = 'options-content';
    const tabs = {}, panels = {};
    for (const [, name] of html.matchAll(/class="tab-button[^\"]*" data-tab="([^\"]+)"/g)) {
        const button = node('button', '', tablist); button.className = 'tab-button'; button.dataset.tab = name;
        button.setAttribute('role', 'tab'); button.click = () => button.dispatch('click'); tabs[name] = button;
        const panel = node('section', `tab-${name}`, content); panel.className = 'tab-panel'; panel.dataset.tab = name; panels[name] = panel;
    }
    const search = node('section', 'search-settings', panels.content);
    for (const id of ['hour12-format', 'show-seconds', 'show-clock', 'show-search', 'show-shortcuts',
        'show-weather', 'show-hot', 'show-movie', 'show-shortcut-titles', 'finder-shortcut-enabled', 'quote-text',
        'search-engine', 'search-custom', 'privacy-online-favicons', 'weather-city', 'weather-temp', 'weather-condition',
        'weather-aqi-label', 'weather-aqi', 'weather-low', 'weather-high', 'hot-topics-tab', 'movie-title', 'movie-note',
        'bg-type', 'bg-color', 'bg-color-text', 'shortcuts-gap-x', 'shortcuts-gap-y', 'shortcut-icon-size', 'shortcut-title-size']) {
        node('input', id, id.startsWith('search-') ? search : panels.appearance);
    }
    const url = field('search-custom'), engine = field('search-engine');
    const nativeRects = url.getClientRects.bind(url);
    url.getClientRects = () => panels.content.classList.contains('active') ? nativeRects() : [];
    const scrolls = []; url.scrollIntoView = options => scrolls.push(clone(options));
    node('ul', 'category-manage-list', panels.content); node('button', 'add-category', panels.content);
    for (const id of ['baidu-list', 'weibo-list', 'zhihu-list']) node('div', id, panels.content);
    const save = node('button', 'save-settings'), other = node('input', 'unrelated-draft', panels.appearance);
    other.value = '  Keep literal 中文 <draft>  ';
    const storage = new StorageManager(); storage._syncInitialized = true;
    const catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));
    const messages = [], timers = new Map(); let timer = 0;
    const window = {document, location: {hash: ''}, addEventListener() {}, i18n: {t: key => catalog[key]?.message || key}};
    const context = vm.createContext({window, document, storageManager: storage, chrome, navigator, crypto, URL,
        i18n: window.i18n, console: {log() {}, warn() {}, error() {}},
        setTimeout(fn, delay) { timers.set(++timer, {fn, delay}); return timer; }, clearTimeout(id) { timers.delete(id); }, messages});
    vm.runInContext(source + '\nshowMessage = (text, type) => messages.push({text, type}); displayStorageInfo = async () => {};', context);
    await context.populateFormFields(await storage.getAll()); context.setupCategoryManagement(raw.categories);
    context.setupEventListeners(); context.setupSettingsTabs();
    reads.length = 0; writes.length = 0;
    const settle = async () => { await vm.runInContext('settingsSaveQueue', context); await Promise.resolve(); };
    return {raw, reads, writes, document, field, save, other, url, engine, tabs, panels, scrolls, messages, context,
        settle, submit() { save.focus(); save.dispatch('click'); return settle(); },
        blockQueue() { const gate = deferred(); context.queueSettingsWrite(() => gate.promise); return gate; },
        rejectWriteLater() { writeGate = {entered: deferred(), resume: deferred()}; return writeGate; }};
}
const invalid = (f, value = 'ftp://example.test/?q=%s') => { f.engine.value = 'custom'; f.url.value = value; };
const error = f => assert.equal(f.messages.at(-1)?.type, 'error');
function untouched(f, before) {
    assert.deepEqual(f.raw, before); assert.equal(f.writes.length, 0); assert.equal(f.reads.length, 0);
    assert.equal(f.other.value, '  Keep literal 中文 <draft>  ');
}
for (const locale of ['en', 'zh_CN']) for (const value of ['', 'ftp://example.test/?q=%s']) {
    test(`${locale}: explicit Save reveals and focuses the unchanged ${value ? 'unsafe' : 'empty'} custom URL`, async () => {
        const f = await fixture(locale), before = clone(f.raw); invalid(f, value);
        assert(f.panels.appearance.classList.contains('active')); assert.equal(f.url.getClientRects().length, 0);
        await f.submit(); error(f); untouched(f, before);
        assert.ok(f.document.activeElement === f.url, "focus is on url"); assert(f.panels.content.classList.contains('active'));
        assert.equal(f.tabs.content.getAttribute('aria-selected'), 'true'); assert.equal(f.tabs.content.tabIndex, 0);
        assert.equal(f.url.value, value); assert.equal(f.engine.value, 'custom'); assert.equal(f.scrolls.length, 1);
        assert.match(f.messages.at(-1).text, locale === 'en' ? /Custom search URL is required|valid HTTP or HTTPS/ : /自定义搜索网址|HTTP|HTTPS/);
    });
}
test('correcting the same input saves only the normal search mutation once', async () => {
    const f = await fixture(); invalid(f); await f.submit(); error(f);
    const before = clone(f.raw); f.url.value = ' https://example.test/?q=%s ';
    await f.submit(); assert.equal(f.messages.at(-1).type, 'success');
    assert.ok(f.document.activeElement === f.save, "focus is on save"); assert.equal(f.scrolls.length, 1); assert.equal(f.writes.length, 1);
    assert.deepEqual(Object.keys(f.writes[0]), ['search']);
    assert.deepEqual(f.raw, {...before, search: {engine: 'custom', custom: 'https://example.test/?q=%s'}});
    assert.equal(f.url.value, ' https://example.test/?q=%s '); assert.equal(f.other.value, '  Keep literal 中文 <draft>  ');
});
test('ordinary auto-save reports the same error without changing the selected tab or focus', async () => {
    const f = await fixture(), before = clone(f.raw); invalid(f); f.other.focus();
    await f.context.saveAllSettings(); error(f); untouched(f, before);
    assert.ok(f.document.activeElement === f.other, "focus is on other"); assert(f.panels.appearance.classList.contains('active')); assert.equal(f.scrolls.length, 0);
});
for (const change of ['new focus', 'new URL draft', 'new engine', 'replacement input', 'hidden document']) {
    test(`queued explicit validation does not reclaim ${change}`, async () => {
        const f = await fixture(), before = clone(f.raw); invalid(f); const gate = f.blockQueue();
        const done = f.submit();
        if (change === 'new focus') f.other.focus();
        if (change === 'new URL draft') f.url.value = 'https://example.test/new?q=%s';
        if (change === 'new engine') f.engine.value = 'google';
        if (change === 'replacement input') { f.url.remove(); const next = f.document.createElement('input'); next.id = 'search-custom'; next.value = 'new owner'; f.panels.content.append(next); }
        if (change === 'hidden document') f.document.visibilityState = 'hidden';
        gate.resolve(); await done; error(f); untouched(f, before);
        assert.ok(f.document.activeElement === (change === 'new focus' ? f.other : f.save), 'newer focus remains authoritative');
        assert(f.panels.appearance.classList.contains('active')); assert.equal(f.scrolls.length, 0);
    });
}
test('real asynchronous Store rejection never redirects a valid field or a newer draft focus', async () => {
    const f = await fixture(), before = clone(f.raw); f.engine.value = 'custom'; f.url.value = 'https://example.test/?q=%s';
    const gate = f.rejectWriteLater(), done = f.submit(); await gate.entered.promise; f.other.focus(); gate.resume.resolve(); await done;
    error(f); assert.deepEqual(f.raw, before); assert.equal(f.writes.length, 0); assert.ok(f.document.activeElement === f.other, "focus is on other");
    assert(f.panels.appearance.classList.contains('active')); assert.equal(f.scrolls.length, 0);
    assert.equal(f.url.value, 'https://example.test/?q=%s');
});
test('an earlier category validation error does not misidentify the custom URL', async () => {
    const f = await fixture(), before = clone(f.raw); invalid(f); f.document.querySelector('#category-manage-list .cat-name').value = '';
    await f.submit(); error(f); untouched(f, before); assert.ok(f.document.activeElement === f.save, "focus is on save"); assert.equal(f.scrolls.length, 0);
    assert.match(f.messages.at(-1).text, /name for every category/);
});
