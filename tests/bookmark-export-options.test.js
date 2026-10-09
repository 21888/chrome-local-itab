'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createDocument, deferred} = require('./helpers/task-dom-model.js');
const api = require('../shared/bookmark-export.js');
const source = fs.readFileSync('options.js', 'utf8');
const saved = {categories: [{id: 'a', name: 'Saved'}], links: [{title: 'Saved title', url: 'https://example.com/?token=private', category: 'a'}]};
function harness() {
    const document = createDocument(); const button = document.createElement('button'); button.id = 'export-bookmarks-html'; document.body.append(button);
    const state = {consent: true, reads: 0, prompts: [], blobs: [], clicks: [], revoked: [], timers: [], messages: [], error: null, gate: null, clickError: false};
    const create = document.createElement.bind(document);
    document.createElement = tag => { const element = create(tag); if (tag === 'a') element.click = () => { if (state.clickError) throw new Error('sensitive click detail'); state.clicks.push({href: element.href, filename: element.download}); }; return element; };
    const context = {document, window: {addEventListener() {}, LocalItabBookmarkExport: api},
        storageManager: {async getAllForBackup() { state.reads++; if (state.gate) await state.gate.promise; if (state.error) throw state.error; return saved; }},
        confirm(text) { state.prompts.push(text); return state.consent; }, Blob,
        URL: {createObjectURL(blob) { state.blobs.push(blob); return 'blob:local'; }, revokeObjectURL(url) { state.revoked.push(url); }},
        setTimeout(fn) { state.timers.push(fn); }, console: {log() {}, warn() {}, error() { throw new Error('Unexpected private logging'); }},
        capture: (text, type) => state.messages.push({text, type})};
    vm.createContext(context); vm.runInContext(source + '\nshowMessage = capture;', context);
    context.setupBookmarkExport(); context.setupBookmarkExport();
    assert.equal(button.listeners.get('click').length, 1);
    return {state, button, document, click: () => button.listeners.get('click')[0](), context};
}
test('actual bound event cancels before read, blob creation or download', async () => {
    const h = harness(); h.state.consent = false; await h.click();
    assert.equal(h.state.reads, 0); assert.equal(h.state.blobs.length, 0); assert.equal(h.state.clicks.length, 0); assert.equal(h.button.disabled, false);
    assert.match(h.state.prompts[0], /full URLs/); assert.match(h.state.prompts[0], /private query parameters/); assert.match(h.state.prompts[0], /Unsaved edits, icons, settings, Tasks, Focus, Scratchpad and Countdown/);
});
test('saved state only, HTML MIME, fixed filename, delayed cleanup and repeated export', async () => {
    const h = harness(); h.context.unsavedEdits = {title: 'Unsaved secret'}; await h.click();
    assert.equal(h.state.reads, 1); assert.equal(h.state.blobs[0].type, 'text/html;charset=utf-8');
    const text = await h.state.blobs[0].text(); assert.match(text, /Saved title/); assert.ok(!text.includes('Unsaved secret'));
    assert.equal(h.state.clicks[0].filename, 'local-itab-bookmarks.html'); assert.equal(h.document.querySelectorAll('a').length, 0);
    assert.equal(h.state.revoked.length, 0); h.state.timers.forEach(fn => fn()); assert.deepEqual(h.state.revoked, ['blob:local']);
    assert.equal(h.button.disabled, false); await h.click(); assert.equal(h.state.clicks.length, 2);
});
test('read in flight prevents overlapping clicks and confirmation', async () => {
    const h = harness(); h.state.gate = deferred(); const first = h.click();
    assert.equal(h.button.disabled, true); await h.click(); assert.equal(h.state.reads, 1); assert.equal(h.state.prompts.length, 1);
    h.state.gate.resolve(); await first; assert.equal(h.state.clicks.length, 1); assert.equal(h.button.disabled, false);
});
test('read failures and unsafe data fail closed; generic feedback and retry', async () => {
    const h = harness(); h.state.error = new Error('Private full URL must not be exposed'); await h.click();
    assert.equal(h.state.blobs.length, 0); assert.equal(h.state.clicks.length, 0); assert.equal(h.button.disabled, false);
    assert.equal(h.state.messages[0].type, 'error'); assert.ok(!JSON.stringify(h.state.messages).includes('Private full URL'));
    h.state.error = null; await h.click(); assert.equal(h.state.clicks.length, 1);
    const bad = harness(); bad.context.storageManager.getAllForBackup = async () => ({categories: [], links: [{title: 'Bad', url: 'javascript:alert(1)', category: ''}]});
    await bad.click(); assert.equal(bad.state.blobs.length, 0); assert.equal(bad.button.disabled, false);
});
test('download click error removes anchor, revokes URL, releases button and permits retry', async () => {
    const h = harness(); h.state.clickError = true; await h.click();
    assert.deepEqual(h.state.revoked, ['blob:local']); assert.equal(h.document.querySelectorAll('a').length, 0); assert.equal(h.button.disabled, false);
    assert.equal(h.state.messages[0].type, 'error'); assert.ok(!JSON.stringify(h.state.messages).includes('sensitive click detail'));
    h.state.clickError = false; await h.click(); assert.equal(h.state.clicks.length, 1);
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
