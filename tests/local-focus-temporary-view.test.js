const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const { harness } = require('./focus-timer-helpers');
function model() {
    const h = harness(), document = createDocument({ blurUnavailableFocus: true }), events = new Map(), scrolls = [];
    const api = { ...require('../shared/local-focus-store'), ...require('../shared/local-focus-controller') };
    const window = { LocalItabFocus: api, LocalItabWorkspaces: { session: { id: 'synthetic-workspace' } },
        setTimeout: () => 1, clearTimeout() {}, scrollX: 3, scrollY: 360,
        scrollTo(value) { scrolls.push(value); },
        addEventListener(type, fn) { const set = events.get(type) || new Set(); set.add(fn); events.set(type, set); },
        removeEventListener(type, fn) { events.get(type)?.delete(fn); } };
    vm.runInNewContext(fs.readFileSync(require.resolve('../shared/local-focus-view'), 'utf8'), { window, document });
    const dashboard = document.createElement('div'); dashboard.id = 'dashboard'; document.body.append(dashboard);
    const host = document.createElement('article'); host.id = 'local-focus-card'; dashboard.append(host);
    const notes = document.createElement('textarea'); notes.value = 'Synthetic retained note'; dashboard.append(notes);
    const c = h.controller(), view = new api.View(host, { controller: c }); window.localFocusView = view;
    const key = fields => { const e = { key: 'Escape', target: document.activeElement, preventDefault() { this.defaultPrevented = true; }, ...fields }; for (const fn of events.get('keydown') || []) fn(e); return e; };
    return { h, document, window, events, scrolls, dashboard, host, notes, c, view, key,
        async ready() { await h.flush(); await c.action('visibility', true); } };
}
function active(m, value = true) {
    assert.equal(Boolean(m.view.temporaryFocus), value);
    assert.equal(m.document.body.classList.contains('temporary-focus-view'), value);
    assert.equal(m.view.focusViewButton.getAttribute('aria-pressed'), String(value));
}
test('temporary view: explicit entry and exit retain nodes, values, focus and scroll with zero writes', async () => {
    const m = model(); await m.ready(); const state = m.h.state, writes = m.h.writes, children = [...m.host.children];
    m.view.focusViewButton.focus(); assert.equal(m.view.enterTemporaryFocus(), true); active(m);
    assert.equal(m.view.focusViewButton.textContent, 'Exit focus view');
    assert.equal(m.scrolls.at(-1).top, 0); assert.equal(m.view.enterTemporaryFocus(), false);
    m.view.focusViewButton.dispatch('click'); active(m, false);
    assert.equal(m.scrolls.at(-1).top, 360); assert.equal(m.scrolls.at(-1).left, 3);
    assert.equal(m.document.activeElement, m.view.focusViewButton);
    assert.equal(m.notes.value, 'Synthetic retained note'); assert.equal(m.notes.hidden, false);
    assert.deepEqual(m.host.children, children); assert.deepEqual(m.h.state, state); assert.equal(m.h.writes, writes);
    m.view.destroy();
});
test('temporary view: hidden preference, unloaded/disabled timer and disconnected host never enter', async () => {
    const m = model(); assert.equal(m.view.enterTemporaryFocus(), false); await m.h.flush();
    assert.equal(m.view.enterTemporaryFocus(), false); await m.ready();
    m.window.dashboardHiddenState = true; assert.equal(m.view.enterTemporaryFocus(), false);
    m.window.dashboardHiddenState = false; m.document.body.classList.add('dashboard-hidden'); assert.equal(m.view.enterTemporaryFocus(), false);
    assert.equal(m.document.body.classList.contains('dashboard-hidden'), true);
    m.document.body.classList.remove('dashboard-hidden'); m.host.remove(); assert.equal(m.view.enterTemporaryFocus(), false);
    m.view.destroy();
});
test('temporary view: drafts, pending writes, inert ancestry and open dialogs block without saving or closing them', async () => {
    for (const kind of ['minutes', 'scratchpad', 'lifecycle', 'departing', 'pending', 'preview', 'preview-busy', 'dialog', 'menu', 'inert']) {
        const m = model(); await m.ready(); const writes = m.h.writes;
        if (kind === 'minutes') { m.view.minutes.value = '33'; m.view.minutes.dispatch('input'); }
        if (kind === 'scratchpad') m.window.localScratchpadView = { hasUncommittedWork: () => true };
        if (kind === 'lifecycle') m.window.LocalItabContentLifecycle = { hasUncommittedWork: () => true };
        if (kind === 'departing') m.window.LocalItabContentLifecycle = { hasUncommittedWork: () => false, departing: true };
        if (kind === 'pending') m.c.pending = {};
        if (kind === 'preview') m.window.appearanceController = { previewGuard: {} };
        if (kind === 'preview-busy') m.window.appearanceController = { previewBusy: true };
        if (kind === 'inert') m.dashboard.inert = true;
        if (kind === 'dialog' || kind === 'menu') { const dialog = m.document.createElement('div'); dialog.setAttribute('role', kind); m.document.body.append(dialog); }
        assert.equal(m.view.enterTemporaryFocus(), false, kind); active(m, false);
        assert.match(m.view.focusViewNotice.textContent, /Finish or save/); m.view.render(); assert.equal(m.view.focusViewNotice.hidden, false); assert.equal(m.h.writes, writes);
        if (kind === 'minutes') assert.equal(m.view.minutes.value, '33');
        m.c.pending = null; m.view.destroy();
    }
});
test('temporary view: saved notes and hidden dialogs do not block entry', async () => {
    const m = model(); await m.ready(); m.window.localScratchpadView = { hasUncommittedWork: () => false };
    const dialog = m.document.createElement('div'); dialog.setAttribute('role', 'dialog'); dialog.hidden = true; m.document.body.append(dialog);
    const overlay = m.document.createElement('div'); overlay.setAttribute('aria-hidden', 'true');
    const panel = m.document.createElement('div'); panel.setAttribute('role', 'dialog'); overlay.append(panel); m.document.body.append(overlay);
    assert.equal(m.view.enterTemporaryFocus(), true); active(m); m.view.destroy();
});
test('temporary view: Start/Pause/Resume use unchanged timer; Stop restores without an extra write', async () => {
    const m = model(); await m.ready(); const writes = m.h.writes; m.view.enterTemporaryFocus();
    for (const action of ['start', 'pause', 'resume']) { await m.c.action(action); active(m); }
    await m.c.action('reset'); active(m, false); assert.equal(m.h.writes, writes + 4);
    assert.equal(m.c.snapshot().session.status, 'ready');
    // Reset preserves the old session ID; entering ready must still survive a fresh Start.
    m.view.enterTemporaryFocus(); await m.c.action('start'); active(m); m.view.destroy();
});
test('temporary view: completion, uncertainty, disabling and replacement sessions restore automatically', async () => {
    for (const kind of ['complete', 'uncertain', 'disable', 'replacement']) {
        const m = model(); await m.ready(); await m.c.action('start'); m.view.enterTemporaryFocus();
        const outside = m.document.createElement('button'); m.document.body.append(outside); outside.focus(); const count = m.scrolls.length;
        if (kind === 'complete') { m.h.advance(1500000); m.c.tick(); await m.h.flush(); }
        if (kind === 'uncertain') { m.h.wall(999999); m.c.tick(); await m.h.flush(); }
        if (kind === 'disable') await m.c.action('visibility', false);
        if (kind === 'replacement') { const state = m.h.state; state.revision++; state.session.id = 'replacement'; m.h.state = state; await m.c.refresh(); }
        active(m, false); assert.equal(m.document.activeElement, outside); assert.equal(m.scrolls.length, count); m.view.destroy();
    }
});
test('temporary view: explicit exit leaves running deadline untouched', async () => {
    const m = model(); await m.ready(); await m.c.action('start'); m.view.enterTemporaryFocus();
    const state = m.h.state, writes = m.h.writes; m.key(); active(m, false);
    assert.deepEqual(m.h.state, state); assert.equal(m.h.writes, writes); m.view.destroy();
});
test('temporary view: Escape honors nested details, open dialog, native select, repeat and IME', async () => {
    const m = model(); await m.ready(); m.view.enterTemporaryFocus();
    for (const fields of [{ defaultPrevented: true }, { repeat: true }, { isComposing: true }, { keyCode: 229 }, { key: 'Enter' }, { target: m.view.phase }]) { m.key(fields); active(m); }
    const details = m.host.querySelector('details'); details.open = true; const summary = details.querySelector('summary'); summary.focus();
    assert.equal(m.key().defaultPrevented, true); assert.equal(details.open, false); active(m); assert.equal(m.document.activeElement, summary);
    const dialog = m.document.createElement('div'); dialog.setAttribute('role', 'dialog'); m.document.body.append(dialog); m.key(); active(m); dialog.remove();
    m.key(); active(m, false); m.view.destroy();
});
test('temporary view: pending timer writes keep Exit available, failure never traps the view', async () => {
    const m = model(); await m.ready(); m.view.enterTemporaryFocus(); m.h.failWrite(true);
    const action = m.c.action('start').catch(() => {}); assert.equal(m.view.focusViewButton.disabled, false);
    m.view.focusViewButton.dispatch('click'); active(m, false); await action; active(m, false); m.view.destroy();
});
test('temporary view: workspace replacement, pagehide and destroy clear only local presentation', async () => {
    for (const kind of ['workspace', 'pagehide', 'destroy', 'detached']) {
        const m = model(); await m.ready(); m.view.enterTemporaryFocus(); const writes = m.h.writes;
        if (kind === 'workspace') { m.window.LocalItabWorkspaces.session.id = 'next-workspace'; m.view.render(); }
        if (kind === 'pagehide') for (const fn of m.events.get('pagehide')) fn();
        if (kind === 'destroy') m.view.destroy();
        if (kind === 'detached') { m.host.remove(); m.view.render(); }
        active(m, false); assert.equal(m.h.writes, writes); m.view.destroy();
        assert.equal(m.events.get('keydown').size, 0); assert.equal(m.events.get('pagehide').size, 0);
    }
});
test('temporary view: persistent dashboard hide path is blocked while temporary mode owns presentation', async () => {
    const source = fs.readFileSync(require.resolve('../newtab.js'), 'utf8');
    const start = source.indexOf('function setDashboardHidden(hidden) {'), end = source.indexOf('\n/**', start);
    const window = { localFocusView: { temporaryFocus: {} } }; const context = vm.createContext({ window, Promise });
    vm.runInContext(source.slice(start, end), context);
    assert.equal(await vm.runInContext('setDashboardHidden(true)', context), false);
    assert.equal(await vm.runInContext('setDashboardHidden(false)', context), false);
});

test('temporary view: CSS also hides the skip link whose shortcut target is temporarily absent', () => {
    const css = fs.readFileSync(require.resolve('../local-focus.css'), 'utf8');
    assert.match(css, /body\.temporary-focus-view > \.skip-link,[\s\S]*?:not\(#local-focus-card\) \{ display: none !important; \}/);
});
