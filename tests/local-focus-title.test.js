const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const { harness } = require('./focus-timer-helpers');
function model({ locale = 'en' } = {}) {
    const h = harness(), document = createDocument(), events = new Map(), timers = new Map(), titleWrites = []; let tid = 0;
    const title = document.createElement('title'); title.setAttribute('data-i18n', 'newTabTitle'); title.dataset.i18n = 'newTabTitle'; title.textContent = 'New Tab'; document.body.append(title);
    Object.defineProperty(document, 'title', { get: () => document.querySelector('title')?.textContent || '', set: value => { titleWrites.push(value); document.querySelector('title').textContent = value; } });
    const messages = JSON.parse(fs.readFileSync(require.resolve(`../_locales/${locale}/messages.json`), 'utf8'));
    const chrome = { i18n: { getMessage: key => messages[key]?.message || '' } };
    const api = { ...require('../shared/local-focus-store'), ...require('../shared/local-focus-controller') };
    const window = { LocalItabFocus: api, LocalItabWorkspaces: { session: { id: 'synthetic-private-workspace' } },
        setTimeout(fn) { timers.set(++tid, fn); return tid; }, clearTimeout(id) { timers.delete(id); },
        addEventListener(type, fn) { const set = events.get(type) || new Set(); set.add(fn); events.set(type, set); },
        removeEventListener(type, fn) { events.get(type)?.delete(fn); } };
    const context = vm.createContext({ window, document, chrome, setTimeout: () => 1, clearTimeout() {}, console: { log() {}, error() {} } });
    vm.runInContext(fs.readFileSync(require.resolve('../i18n.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(require.resolve('../shared/local-focus-view'), 'utf8'), context);
    const dashboard = document.createElement('div'); dashboard.id = 'dashboard'; document.body.append(dashboard);
    const host = document.createElement('article'); dashboard.append(host); const c = h.controller();
    const view = new api.View(host, { controller: c }); window.localFocusView = view;
    return { h, document, title, window, events, timers, titleWrites, host, c, view, context,
        emit(type) { for (const fn of events.get(type) || []) fn(); },
        async ready() { await h.flush(); await c.action('visibility', true); window.i18n.localizeDocument(document); },
        async visible(hidden) { document.hidden = hidden; await document.listeners.get('visibilitychange')({}); await h.flush(); } };
}
test('title: disabled by default and opt-in is restricted to the localized newtab shell', async () => {
    const m = model(); await m.ready(); const original = m.document.title; await m.c.action('start');
    assert.equal(m.document.title, original); assert.equal(m.titleWrites.length, 0);
    m.title.setAttribute('data-i18n', 'optionsTitle'); m.title.dataset.i18n = 'optionsTitle'; assert.equal(m.view.attachDocumentTitle(), false);
    m.title.setAttribute('data-i18n', 'newTabTitle'); m.title.dataset.i18n = 'newTabTitle'; m.document.title = 'Another owner'; assert.equal(m.view.attachDocumentTitle(), false);
    m.document.title = original; assert.equal(m.view.attachDocumentTitle(), true); assert.equal(m.document.title, '25:00 · Focus');
    assert.equal(m.view.attachDocumentTitle(), false); m.view.destroy(); assert.equal(m.document.title, original);
});
test('title: running countdown deduplicates same-second writes and includes no workspace, task or original-title text', async () => {
    const m = model(); await m.ready(); m.view.attachDocumentTitle(); const writes = m.h.writes;
    await m.c.action('start'); const count = m.titleWrites.length;
    m.view.render(); m.view.render(); assert.equal(m.titleWrites.length, count);
    m.h.advance(1000); m.c.tick(); assert.equal(m.document.title, '24:59 · Focus'); assert.equal(m.titleWrites.length, count + 1);
    assert.equal(m.h.writes, writes + 1); assert(!m.document.title.includes('private')); m.view.destroy();
});
test('title: pause, reset, completion, uncertainty, disabled timer and read failure restore original', async () => {
    for (const reason of ['pause', 'reset', 'complete', 'uncertain', 'disabled', 'read-error']) {
        const m = model(); await m.ready(); const original = m.document.title; m.view.attachDocumentTitle(); await m.c.action('start');
        if (reason === 'pause' || reason === 'reset') await m.c.action(reason);
        if (reason === 'complete') { m.h.advance(1500000); m.c.tick(); await m.h.flush(); }
        if (reason === 'uncertain') { m.h.wall(999999); m.c.tick(); await m.h.flush(); }
        if (reason === 'disabled') await m.c.action('visibility', false);
        if (reason === 'read-error') { m.h.failRead(true); await m.c.refresh().catch(() => {}); }
        assert.equal(m.document.title, original, reason); m.view.destroy();
    }
});
test('title: resume and break reuse the existing timer, without presentation persistence', async () => {
    const m = model(); await m.ready(); m.view.attachDocumentTitle(); const writes = m.h.writes;
    await m.c.action('phase', 'break'); await m.c.action('start'); assert.equal(m.document.title, '5:00 · Break');
    await m.c.action('pause'); await m.c.action('resume'); assert.equal(m.document.title, '5:00 · Break');
    assert.equal(m.h.writes, writes + 4); m.view.destroy();
});
test('title: hidden page drops numeric and running claims with no background ticker; returning rechecks completion', async () => {
    const m = model(); await m.ready(); const original = m.document.title; m.view.attachDocumentTitle(); await m.c.action('start');
    await m.visible(true); assert.equal(m.document.title, 'Focus · Timer in background'); assert.equal(m.timers.size, 0);
    const writes = m.h.writes, titleWrites = m.titleWrites.length;
    m.h.advance(1800000); assert.equal(m.document.title, 'Focus · Timer in background');
    assert(!/\d|running/i.test(m.document.title)); assert.equal(m.h.writes, writes); assert.equal(m.titleWrites.length, titleWrites);
    await m.visible(false); assert.equal(m.document.title, original); assert.equal(m.c.snapshot().session.status, 'completed'); m.view.destroy();
});
test('title: hidden remote pause restores original without inventing background polling', async () => {
    const m = model(); await m.ready(); const original = m.document.title; m.view.attachDocumentTitle(); await m.c.action('start'); await m.visible(true);
    const other = m.h.controller(); await other.refresh(); await other.action('pause'); await m.h.flush();
    assert.equal(m.document.title, original); assert.equal(m.timers.size, 0); other.destroy(); m.view.destroy();
});
test('title: another writer permanently takes ownership, including while paused or hidden', async () => {
    for (const when of ['running', 'paused', 'hidden']) {
        const m = model(); await m.ready(); m.view.attachDocumentTitle(); await m.c.action('start');
        if (when === 'paused') await m.c.action('pause');
        if (when === 'hidden') await m.visible(true);
        m.document.title = 'Other page owner'; m.view.render(); assert.equal(m.document.title, 'Other page owner');
        if (when === 'paused') await m.c.action('resume');
        await m.c.action('reset'); await m.c.action('start'); m.emit('pagehide'); m.emit('pageshow'); m.view.destroy();
        assert.equal(m.document.title, 'Other page owner', when);
    }
});
test('title: replacement title node is a new owner even when its string matches our last write', async () => {
    const m = model(); await m.ready(); m.view.attachDocumentTitle(); await m.c.action('start');
    const replacement = m.document.createElement('title'); replacement.setAttribute('data-i18n', 'newTabTitle'); replacement.dataset.i18n = 'newTabTitle'; replacement.textContent = m.document.title;
    m.title.replaceWith(replacement); const value = m.document.title; m.h.advance(1000); m.c.tick(); m.view.destroy(); assert.equal(m.document.title, value);
});
test('title: workspace change, departure, detachment, pagehide and destroy restore only their own title', async () => {
    for (const reason of ['workspace', 'departure', 'detach', 'pagehide', 'destroy']) {
        const m = model(); await m.ready(); const original = m.document.title; m.view.attachDocumentTitle(); await m.c.action('start');
        if (reason === 'workspace') m.window.LocalItabWorkspaces.session.id = 'another-workspace';
        if (reason === 'departure') m.window.LocalItabContentLifecycle = { departing: true };
        if (reason === 'detach') m.host.remove();
        if (reason === 'pagehide') m.emit('pagehide');
        if (reason === 'destroy') m.view.destroy(); else m.view.render();
        assert.equal(m.document.title, original, reason); m.view.destroy();
        assert.equal(m.events.get('pagehide').size, 0); assert.equal(m.events.get('pageshow').size, 0);
    }
});
test('title: persisted-page restoration recomputes instead of restoring a cached countdown', async () => {
    const m = model(); await m.ready(); const original = m.document.title; m.view.attachDocumentTitle(); await m.c.action('start');
    m.emit('pagehide'); assert.equal(m.document.title, original); m.h.advance(5000); m.emit('pageshow'); assert.equal(m.document.title, '24:55 · Focus'); m.view.destroy();
});
test('title: actual newtab DOMContentLoaded localizes twice before opt-in, including an already running Chinese timer', async () => {
    const m = model({ locale: 'zh_CN' }); await m.h.flush(); await m.c.action('visibility', true); await m.c.action('start');
    const localized = [], originalLocalize = m.window.i18n.localizeDocument;
    m.window.i18n.localizeDocument = doc => { originalLocalize(doc); localized.push(doc.title); };
    vm.runInContext(fs.readFileSync(require.resolve('../newtab.js'), 'utf8'), m.context);
    m.context.initializeDashboard = async () => { assert.equal(localized.length, 1); m.view.render(); assert.equal(m.document.title, localized[0]); return { themePreset: 'aurora-glass' }; };
    for (const name of ['setupDashboardVisibilityToggle', 'setupThemeChangeListener', 'setupClockPreferenceListener', 'setupDashboardAppearance', 'setupCloudSyncChangeListener', 'setupPerformanceGuards', 'setupExtremeCompactMode']) m.context[name] = () => {};
    await m.document.listeners.get('DOMContentLoaded')();
    assert.equal(localized.length, 2); assert.equal(localized[0], localized[1]); assert.equal(m.document.title, '25:00 · 专注');
    await m.visible(true); assert.equal(m.document.title, '专注 · 后台计时页');
    await m.c.action('pause'); assert.equal(m.document.title, localized[1]); m.view.destroy();
});
test('title: late localization and unobserved external changes survive teardown without reclamation', async () => {
    for (const change of ['localize', 'external']) {
        const m = model(); await m.ready(); const original = m.document.title; m.view.attachDocumentTitle(); await m.c.action('start');
        if (change === 'localize') m.window.i18n.localizeDocument(m.document); else m.document.title = 'New owner';
        const title = m.document.title; m.emit('pagehide'); m.emit('pageshow'); await m.c.action('pause'); await m.c.action('resume'); m.view.destroy();
        assert.equal(m.document.title, title); if (change === 'localize') assert.equal(title, original);
    }
});

test('title: another first title node blocks acquisition and is never overwritten even with identical text', async () => {
    for (const when of ['before-attach', 'after-attach']) {
        const m = model(); await m.ready();
        if (when === 'after-attach') { m.view.attachDocumentTitle(); await m.c.action('start'); }
        const other = m.document.createElement('title'); other.textContent = m.document.title;
        other.parentElement = m.document.body; m.document.body.children.unshift(other);
        if (when === 'before-attach') assert.equal(m.view.attachDocumentTitle(), false);
        const value = other.textContent; m.h.advance(1000); m.c.tick(); m.view.destroy();
        assert.equal(other.textContent, value);
    }
});
