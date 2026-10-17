'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createDocument, deferred} = require('./helpers/task-dom-model.js');
const api = require('../shared/bookmark-export.js');
const source = fs.readFileSync('options.js', 'utf8');
const saved = {categories: [{id: 'a', name: 'Saved'}], links: [{title: 'Saved title', url: 'https://example.com/?token=private', category: 'a'}]};
function harness(locale) {
    const document = createDocument({aggregateTextContent: true, blurUnavailableFocus: true}), windowEvents = new Map(); document.visibilityState = 'visible';
    const host = document.createElement('div'), button = document.createElement('button'), panel = document.createElement('div');
    host.className = 'setting-group'; button.id = 'export-bookmarks-html'; panel.id = 'bookmark-export-preview'; panel.hidden = true;
    host.append(button, panel); document.body.append(host);
    const state = {consent: true, reads: 0, prompts: [], blobs: [], clicks: [], revoked: [], timers: [], messages: [], error: null, gate: null, clickError: false,
        config: structuredClone(saved), observers: [], writes: 0};
    const create = document.createElement.bind(document);
    document.createElement = tag => { const element = create(tag); if (tag === 'a') element.click = () => { if (state.clickError) throw new Error('sensitive click detail'); state.clicks.push({href: element.href, filename: element.download}); }; return element; };
    class Observer {
        constructor(callback) { this.callback = callback; this.records = []; this.targets = []; state.observers.push(this); }
        observe(target, options) { this.targets.push({target, options}); }
        takeRecords() { return this.records.splice(0); }
        disconnect() { this.disconnected = true; this.records = []; }
    }
    const window = {LocalItabBookmarkExport: {...api}, MutationObserver: Observer,
        addEventListener(type, fn) { if (!windowEvents.has(type)) windowEvents.set(type, new Set()); windowEvents.get(type).add(fn); },
        removeEventListener(type, fn) { windowEvents.get(type)?.delete(fn); }};
    const context = {document, window,
        storageManager: {async getAllForBackup() { state.reads++; if (state.gate) await state.gate.promise; if (state.error) throw state.error; return state.config; }},
        confirm(text) { state.prompts.push(text); return state.consent; }, Blob,
        URL: {createObjectURL(blob) { state.blobs.push(blob); return 'blob:local'; }, revokeObjectURL(url) { state.revoked.push(url); }},
        setTimeout(fn, delay) { state.timers.push(fn); state.lastDelay = delay; },
        console: {log() {}, warn() {}, error() { throw new Error('Unexpected private logging'); }},
        capture: (text, type) => state.messages.push({text, type})};
    if (locale) {
        const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        context.i18n = window.i18n = {t(key, values = []) { return values.reduce((text, value, index) => text.replaceAll('$' + (index + 1), String(value)), messages[key]?.message || key); }};
    }
    vm.createContext(context); vm.runInContext(source + '\nshowMessage = capture; saveAllSettings = () => { throw new Error("Export must not save settings"); };', context);
    context.setupBookmarkExport(); context.setupBookmarkExport();
    assert.equal(button.listeners.get('click').length, 1);
    const invoke = (id, event = 'click') => document.getElementById(id).listeners.get(event)[0]();
    return {state, button, panel, host, document, context, window, click: () => button.listeners.get('click')[0](),
        download: () => invoke('bookmark-export-download'), cancel: () => invoke('bookmark-export-cancel'),
        choose(value) { document.getElementById('bookmark-export-category').value = String(value); return invoke('bookmark-export-category', 'change'); },
        emit: (type, event = {}) => Promise.all([...(windowEvents.get(type) || [])].map(fn => fn(event))),
        mutation(record, queued = false) { for (const observer of state.observers) { if (queued) observer.records.push(record); else observer.callback([record]); } }};
}
test('actual bound event cancels before read, blob creation or download', async () => {
    const h = harness(); h.state.consent = false; await h.click();
    assert.equal(h.state.reads, 0); assert.equal(h.state.blobs.length, 0); assert.equal(h.state.clicks.length, 0); assert.equal(h.button.disabled, false);
    assert.match(h.state.prompts[0], /full URLs/); assert.match(h.state.prompts[0], /private query parameters/); assert.match(h.state.prompts[0], /Unsaved edits, icons, settings, Tasks, Focus, Scratchpad and Countdown/);
});
test('saved state only, HTML MIME, fixed filename, delayed cleanup and repeated export', async () => {
    const h = harness(); h.context.unsavedEdits = {title: 'Unsaved secret'}; await h.click(); await h.download();
    assert.equal(h.state.reads, 2); assert.equal(h.state.blobs[0].type, 'text/html;charset=utf-8');
    const text = await h.state.blobs[0].text(); assert.match(text, /Saved title/); assert.ok(!text.includes('Unsaved secret'));
    assert.equal(h.state.clicks[0].filename, 'local-itab-bookmarks.html'); assert.equal(h.document.querySelectorAll('a').length, 0);
    assert.equal(h.state.revoked.length, 0); h.state.timers.forEach(fn => fn()); assert.deepEqual(h.state.revoked, ['blob:local']);
    assert.equal(h.button.disabled, false); assert.equal(h.state.lastDelay, 1000); await h.click(); await h.download(); assert.equal(h.state.clicks.length, 2);
});
test('read in flight prevents overlapping clicks and confirmation', async () => {
    const h = harness(); h.state.gate = deferred(); const first = h.click();
    assert.equal(h.button.disabled, true); await h.click(); assert.equal(h.state.reads, 1); assert.equal(h.state.prompts.length, 1);
    h.state.gate.resolve(); await first; assert.equal(h.state.clicks.length, 0); assert.equal(h.button.disabled, true);
    await h.download(); assert.equal(h.state.clicks.length, 1); assert.equal(h.button.disabled, false);
});
test('read failures and unsafe data fail closed; generic feedback and retry', async () => {
    const h = harness(); h.state.error = new Error('Private full URL must not be exposed'); await h.click();
    assert.equal(h.state.blobs.length, 0); assert.equal(h.state.clicks.length, 0); assert.equal(h.button.disabled, false);
    assert.equal(h.state.messages[0].type, 'error'); assert.ok(!JSON.stringify(h.state.messages).includes('Private full URL'));
    h.state.error = null; await h.click(); await h.download(); assert.equal(h.state.clicks.length, 1);
    const bad = harness(); bad.context.storageManager.getAllForBackup = async () => ({categories: [], links: [{title: 'Bad', url: 'javascript:alert(1)', category: ''}]});
    await bad.click(); assert.equal(bad.state.blobs.length, 0); assert.equal(bad.button.disabled, false);
});
test('download click error removes anchor, revokes URL, releases button and permits retry', async () => {
    const h = harness(); h.state.clickError = true; await h.click(); await h.download();
    assert.deepEqual(h.state.revoked, ['blob:local']); assert.equal(h.document.querySelectorAll('a').length, 0); assert.equal(h.button.disabled, false);
    assert.equal(h.state.messages[0].type, 'error'); assert.ok(!JSON.stringify(h.state.messages).includes('sensitive click detail'));
    h.state.clickError = false; await h.click(); await h.download(); assert.equal(h.state.clicks.length, 1);
});
test('actual event setup and shipped HTML/locales wire the feature', () => {
    assert.match(source, /function setupEventListeners\(\)[\s\S]*?setupBookmarkExport\(\);/);
    const html = fs.readFileSync('options.html', 'utf8');
    assert.equal((html.match(/id="export-bookmarks-html"/g) || []).length, 1);
    assert.ok(html.indexOf('shared/bookmark-export.js') < html.indexOf('src="options.js"'));
    for (const locale of ['en', 'zh_CN']) {
        const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        for (const key of ['bookmarkExportButton', 'bookmarkExportScope', 'bookmarkExportConfirm', 'bookmarkExportStarted', 'bookmarkExportFailed']) assert.ok(messages[key].message);
    }
});
test('scope preview requires a separate explicit download action', async () => {
    const h = harness(); await h.click();
    assert.equal(h.state.reads, 1); assert.equal(h.state.blobs.length, 0); assert.equal(h.state.clicks.length, 0);
    assert.equal(h.document.getElementById('bookmark-export-preview').hidden, false);
});
test('scope selector uses indexes distinguishes same names and real all identity resets every preview', async () => {
    const h = harness(); h.state.config = {categories: [{id: 'all', name: '相同 <&>'}, {id: '-1', name: '相同 <&>'}, {id: 'empty', name: '空分类'}],
        links: [{title: 'First', url: 'https://example.com/?secret=1&x=2#frag', category: 'all'},
            {title: 'Duplicate', url: 'https://example.com/?secret=1&x=2#frag', category: 'all'},
            {title: 'Other', url: 'https://example.org/', category: '-1'}, {title: 'Root', url: 'https://example.net/', category: 'missing'}]};
    await h.click(); const select = h.document.getElementById('bookmark-export-category');
    assert.deepEqual(select.children.map(option => option.value), ['-1', '0', '1', '2']);
    assert.deepEqual(select.children.slice(1).map(option => option.textContent), ['相同 <&> (ID: all)', '相同 <&> (ID: -1)', '空分类']);
    assert.equal(select.value, '-1'); assert.equal(h.document.getElementById('bookmark-export-counts').textContent, 'Sites: 4 · Folders: 3');
    h.choose(0); assert.equal(h.document.getElementById('bookmark-export-counts').textContent, 'Sites: 2 · Folders: 1');
    assert.equal(h.state.reads, 1); assert.equal(h.state.blobs.length, 0); await h.download();
    const html = await h.state.blobs[0].text();
    assert.equal(html, api.prepare(h.state.config, {kind: 'category', id: 'all'}).html);
    assert.ok(!html.includes('Other')); assert.ok(!html.includes('Root')); assert.match(html, /secret=1&amp;x=2#frag/);
    await h.click(); assert.equal(select.value, '-1'); h.choose(2);
    assert.equal(h.document.getElementById('bookmark-export-counts').textContent, 'Sites: 0 · Folders: 1'); await h.download();
    assert.match(await h.state.blobs[1].text(), new RegExp('<H3>空分类</H3>'));
    await h.click(); assert.equal(select.value, '-1'); h.cancel(); assert.equal(select.children.length, 0); assert.equal(h.window.bookmarkExportView.hasUncommittedWork(), false);
});
test('all preview and downloaded HTML remain byte identical to original serializer', async () => {
    const h = harness(); h.state.config.categories.push({id: 'empty', name: 'Empty'});
    h.state.config.links.push({title: 'Root', url: 'https://example.org/', category: 'missing'});
    const expected = api.serialize(h.state.config); await h.click(); await h.download();
    assert.equal(await h.state.blobs[0].text(), expected);
});
test('every exported field and ordering is rechecked including unselected records', async () => {
    for (const mutate of [data => { data.links[0].title += '!'; }, data => { data.links[0].url += '#changed'; },
        data => { data.links[0].category = 'b'; }, data => { data.categories[0].id += '!'; },
        data => { data.categories[0].name += '!'; }, data => { data.categories.reverse(); }, data => { data.links.reverse(); }]) {
        const h = harness(); h.state.config.categories.push({id: 'b', name: 'Other'});
        h.state.config.links.push({title: 'Other', url: 'https://example.org/', category: 'b'});
        await h.click(); h.choose(1); mutate(h.state.config); await h.download();
        assert.equal(h.state.blobs.length, 0); assert.equal(h.state.clicks.length, 0); assert.equal(h.panel.hidden, true);
        assert.equal(h.window.bookmarkExportView.hasUncommittedWork(), false); assert.equal(h.state.messages.at(-1).type, 'error');
        await h.download(); assert.equal(h.state.reads, 2, 'expired button cannot silently re-preview');
    }
});
test('non-export changes do not invalidate or regenerate reviewed HTML and unrelated private fields stay unread', async () => {
    const h = harness(); const trap = {get() { throw new Error('PRIVATE_FIELD'); }};
    for (const key of ['background', 'tasks', 'focus', 'scratchpad', 'countdown']) Object.defineProperty(h.state.config, key, trap);
    Object.defineProperty(h.state.config.links[0], 'icon', trap); Object.defineProperty(h.state.config.categories[0], 'icon', trap);
    await h.click(); h.state.config.appearance = {theme: 'changed'};
    // Final verification must use the already reviewed HTML, never serialize again.
    h.context.window.LocalItabBookmarkExport.prepare = () => { throw new Error('must use reviewed HTML'); };
    await h.download(); assert.equal(h.state.clicks.length, 1);
    assert.equal(await h.state.blobs[0].text(), api.serialize(saved));
});
test('verification read failure retires old permission and a retry requires a new preview', async () => {
    const h = harness(); await h.click(); h.state.error = new Error('PRIVATE_READ_ERROR'); await h.download();
    assert.equal(h.state.blobs.length, 0); assert.equal(h.panel.hidden, true); assert.equal(h.button.disabled, false);
    assert.ok(!JSON.stringify(h.state.messages).includes('PRIVATE_READ_ERROR'));
    h.state.error = null; await h.download(); assert.equal(h.state.reads, 2);
    await h.click(); assert.equal(h.state.blobs.length, 0); await h.download(); assert.equal(h.state.clicks.length, 1);
});
test('cancel during initial read or verification prevents late download and cannot retire a newer preview', async () => {
    for (const phase of ['read', 'verify']) {
        const h = harness(); if (phase === 'verify') await h.click();
        const gate = h.state.gate = deferred(); const old = phase === 'read' ? h.click() : h.download();
        assert.equal(h.window.bookmarkExportView.pending, true); h.cancel();
        assert.equal(h.window.bookmarkExportView.pending, false); assert.equal(h.panel.hidden, true);
        h.state.gate = null; await h.click(); h.choose(0); gate.resolve(); await old;
        assert.equal(h.state.clicks.length, 0); assert.equal(h.state.blobs.length, 0);
        assert.equal(h.panel.hidden, false); assert.equal(h.document.getElementById('bookmark-export-category').value, '0');
        await h.download(); assert.equal(h.state.clicks.length, 1);
    }
});
test('scope change during verification invalidates its generation and repeated clicks do not overlap reads', async () => {
    const h = harness(); await h.click(); const gate = h.state.gate = deferred(); const old = h.download();
    assert.equal(h.state.reads, 2); await h.download(); await h.click(); assert.equal(h.state.reads, 2); assert.equal(h.state.prompts.length, 1);
    h.choose(0); gate.resolve(); await old; assert.equal(h.state.blobs.length, 0); assert.equal(h.panel.hidden, false);
    h.state.gate = null; await h.download(); assert.equal(h.state.clicks.length, 1);
});
test('unannounced or invalid selector values cannot reuse a different reviewed scope', async () => {
    for (const value of ['0', '999', 'all']) {
        const h = harness(); await h.click(); h.document.getElementById('bookmark-export-category').value = value; await h.download();
        assert.equal(h.state.reads, 1); assert.equal(h.state.clicks.length, 0); assert.equal(h.panel.hidden, true);
    }
});
test('hidden detached destroyed pagehide and departing owners block asynchronous read and verify completions', async () => {
    const transitions = [h => { h.document.visibilityState = 'hidden'; h.document.listeners.get('visibilitychange')(); },
        h => { h.host.hidden = true; }, h => { h.panel.hidden = true; }, h => { h.host.remove(); },
        h => { h.window.bookmarkExportView.destroy(); }, h => { h.emit('pagehide'); },
        h => { h.window.LocalItabContentLifecycle = {departing: true}; },
        h => { const replacement = h.document.createElement('div'); replacement.id = h.panel.id; h.panel.replaceWith(replacement); }];
    for (const phase of ['read', 'verify']) for (const transition of transitions) {
        const h = harness(); if (phase === 'verify') await h.click();
        const gate = h.state.gate = deferred(); const pending = phase === 'read' ? h.click() : h.download(); transition(h);
        gate.resolve(); await pending; assert.equal(h.state.blobs.length, 0); assert.equal(h.state.clicks.length, 0);
        assert.equal(h.window.bookmarkExportView.hasUncommittedWork(), false);
    }
});
test('hide-show and detach-reinsert observation history revoke previews including queued records before click', async () => {
    for (const queued of [false, true]) for (const type of ['attributes', 'childList']) {
        const h = harness(); await h.click();
        const observer = h.state.observers[0]; assert.ok(observer.targets.some(({target, options}) => target === h.panel && options.attributes));
        assert.ok(observer.targets.some(({target, options}) => target === h.host && options.childList));
        if (type === 'attributes') { h.host.hidden = true; h.host.hidden = false; h.mutation({type, target: h.host, attributeName: 'hidden'}, queued); }
        else { h.host.remove(); h.document.body.append(h.host); h.mutation({type, target: h.document.body, removedNodes: [h.host]}, queued); }
        await h.download(); assert.equal(h.state.reads, 1); assert.equal(h.state.blobs.length, 0); assert.equal(h.panel.hidden, true);
    }
});
test('workspace references identity invalidation suspension and settings replacement fence the review', async () => {
    for (const change of [h => { h.context.storageManager.workspace.invalidated = true; },
        h => { h.context.storageManager.workspace._suspended = true; },
        h => { h.context.storageManager.workspace.id = 'other'; }, h => { h.context.storageManager.workspace.generation = 'g2'; },
        h => { h.context.storageManager.workspace = {...h.context.storageManager.workspace}; },
        h => { h.window.LocalItabWorkspaces.session = {...h.window.LocalItabWorkspaces.session}; },
        h => { vm.runInContext('++settingsSession;', h.context); },
        h => { vm.runInContext('settingsReplacementPending = true;', h.context); }]) {
        for (const phase of ['read', 'verify']) {
            const h = harness(), workspace = {id: 'workspace', generation: 'g1', invalidated: false};
            h.context.storageManager.workspace = workspace; h.window.LocalItabWorkspaces = {session: workspace};
            if (phase === 'verify') await h.click(); const gate = h.state.gate = deferred();
            const pending = phase === 'read' ? h.click() : h.download(); change(h); gate.resolve(); await pending;
            assert.equal(h.state.blobs.length, 0); assert.equal(h.window.bookmarkExportView.hasUncommittedWork(), false);
        }
    }
});
test('invalid initial workspace or departing hidden host does not read saved content', async () => {
    for (const change of [h => { h.context.storageManager.workspace = {id: 'x', generation: 'g', invalidated: true}; },
        h => { h.context.storageManager.workspace = {id: null, generation: null}; },
        h => { h.window.LocalItabContentLifecycle = {departing: true}; }, h => { h.host.hidden = true; }]) {
        const h = harness(); change(h); await h.click(); assert.equal(h.state.reads, 0); assert.equal(h.state.blobs.length, 0);
    }
});
test('late cancellation after URL creation still removes anchor and revokes without requesting a download', async () => {
    const h = harness(); await h.click(); h.context.URL.createObjectURL = blob => { h.state.blobs.push(blob); h.cancel(); return 'blob:cancelled'; };
    await h.download(); assert.equal(h.state.clicks.length, 0); assert.equal(h.document.querySelectorAll('a').length, 0);
    assert.deepEqual(h.state.revoked, ['blob:cancelled']); assert.equal(h.state.timers.length, 0);
});
test('preview lifecycle blocks reload restore and save-drafts never downloads; departure clears the view', async () => {
    const h = harness(); h.window.location = {reload() { throw new Error('must defer reload'); }};
    h.document.body.prepend = (...nodes) => h.document.body.append(...nodes);
    vm.runInContext(fs.readFileSync('shared/local-content-lifecycle.js', 'utf8'), h.context);
    vm.runInContext('settingsHasUncommittedWork = () => false; worldClockHasUncommittedWork = () => false;', h.context);
    const lifecycle = h.window.LocalItabContentLifecycle;
    await h.click(); assert.equal(lifecycle.pending(), false); assert.equal(lifecycle.hasUncommittedWork(), true);
    assert.equal(h.context.completeBackupHasDrafts(), true); assert.equal(await lifecycle.saveDrafts(), false);
    assert.equal(h.state.clicks.length, 0); assert.equal(lifecycle.reload(), false);
    let prevented = false; const event = {preventDefault() { prevented = true; }};
    // beforeunload alone does not erase a review when a user stays on the page.
    await h.emit('beforeunload', event);
    assert.equal(prevented, true); assert.equal(event.returnValue, '');
    lifecycle.allowDeparture(); assert.equal(h.window.bookmarkExportView.hasUncommittedWork(), false); assert.equal(h.panel.hidden, true);
    await h.download(); assert.equal(h.state.clicks.length, 0);
});
test('pending read integrates lifecycle and escape/cancel restore focus without touching saved settings', async () => {
    const h = harness(); vm.runInContext(fs.readFileSync('shared/local-content-lifecycle.js', 'utf8'), h.context);
    const gate = h.state.gate = deferred(); const pending = h.click();
    assert.equal(h.window.LocalItabContentLifecycle.pending(), true); assert.equal(h.window.LocalItabContentLifecycle.hasUncommittedWork(), true);
    const event = h.panel.dispatch('keydown', {key: 'Escape'}); assert.equal(event.prevented, true); assert.equal(h.document.activeElement, h.button);
    gate.resolve(); await pending; assert.equal(h.state.reads, 1); assert.equal(h.state.clicks.length, 0);
    assert.equal(h.window.LocalItabContentLifecycle.pending(), false);
});
test('EN ZH and missing-locale fallbacks expose explicit counts scope privacy and download labels', async () => {
    for (const locale of [undefined, 'en', 'zh_CN']) {
        const h = harness(locale); await h.click();
        const count = h.document.getElementById('bookmark-export-counts').textContent;
        const privacy = h.document.getElementById('bookmark-export-privacy').textContent;
        const download = h.document.getElementById('bookmark-export-download').textContent;
        assert.match(count, locale === 'zh_CN' ? /1 个网站 · 1 个文件夹/ : /Sites: 1 · Folders: 1/);
        assert.match(privacy, locale === 'zh_CN' ? /完整网址.*私人查询参数和片段/ : /full URLs.*private query parameters and fragments/);
        assert.equal(download, locale === 'zh_CN' ? '下载已预览范围' : 'Download reviewed scope');
        assert.equal(h.panel.getAttribute('role'), 'group');
        assert.equal(h.document.getElementById('bookmark-export-category').getAttribute('aria-describedby'), 'bookmark-export-counts bookmark-export-privacy');
    }
});
test('appearance-only root style repaint keeps preview but display hide-show history still retires it', async () => {
    for (const queued of [false, true]) {
        const h = harness(); await h.click(); const root = h.document.documentElement;
        root.setAttribute('style', '--custom-background: #123; --custom-card-gap: 20px; --custom-card-opacity: 80%;');
        h.mutation({type: 'attributes', target: root, attributeName: 'style', oldValue: '--custom-background: #fff; --custom-card-gap: 10px;'}, queued);
        await h.download(); assert.equal(h.state.clicks.length, 1);
        await h.click(); root.setAttribute('style', '--custom-background: #456; display: block;');
        h.mutation({type: 'attributes', target: root, attributeName: 'style', oldValue: '--custom-background: #123; display: none;'}, queued);
        await h.download(); assert.equal(h.state.clicks.length, 1); assert.equal(h.panel.hidden, true);
    }
});
test('focused download preserves cancellable focus and returns it after success or failure without stealing outside focus', async () => {
    for (const fail of [false, true]) for (const moveOutside of [false, true]) {
        const h = harness(); await h.click(); h.document.getElementById('bookmark-export-download').focus();
        const gate = h.state.gate = deferred(); const pending = h.download();
        assert.equal(h.document.activeElement.id, 'bookmark-export-cancel');
        const outside = h.document.createElement('button'); h.document.body.append(outside);
        if (moveOutside) outside.focus(); if (fail) h.state.error = new Error('synthetic read failure');
        gate.resolve(); await pending;
        assert.equal(h.document.activeElement, moveOutside ? outside : h.button);
        assert.equal(h.state.clicks.length, fail ? 0 : 1);
    }
    const cancelled = harness(); cancelled.button.focus(); cancelled.state.consent = false; await cancelled.click();
    assert.equal(cancelled.document.activeElement, cancelled.button); assert.equal(cancelled.state.reads, 0);
});
