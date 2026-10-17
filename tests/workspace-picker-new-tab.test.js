/* Synthetic DOM and real Manager tests. No native navigation or browser QA. */
const { test: nodeTest } = require('node:test');
const test = (name, fn) => nodeTest(name, { timeout: 5000 }, fn);
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const Workspaces = require('../shared/workspaces.js');
const source = fs.readFileSync('shared/workspaces-view.js', 'utf8');
const copy = value => structuredClone(value);
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
const entry = (id, name, order, deletedAt = null) => ({ id, name, order, deletedAt, generation: 'g-' + id });
function model({ locale = 'en', runtime = true } = {}) {
    const document = createDocument({ blurUnavailableFocus: true });
    const switcher = document.createElement('section'); document.body.append(switcher);
    const catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const registry = { lastUsedId: 'b', defaultId: 'default', workspaces: [
        entry('default', 'Default', 0), entry('a', 'Twin 🧭', 1), entry('b', 'Twin 🧭', 2), entry('trash', 'Trash', 3, 100)
    ] };
    const calls = [], listeners = new Set();
    const record = name => (...args) => { calls.push([name, ...args]); };
    const manager = { list: async () => { calls.push(['list']); return copy(registry); },
        select: record('select'), subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
    const session = { id: 'default', generation: 'g-default', ready: async () => {},
        flush: record('flush'), suspendWrites: record('suspend'), resumeWrites: record('resume') };
    const draft = document.createElement('textarea'); draft.value = 'Synthetic unsaved original page'; document.body.append(draft);
    const focus = { status: 'running', sessionId: 'synthetic-focus', remainingMs: 123400 };
    const window = { document, location: { href: 'chrome-extension://synthetic/options.html?workspace=default&unrelated=private#focus' },
        i18n: { t: key => catalog[key]?.message || key }, open: record('window.open'),
        chrome: { runtime: runtime ? { getURL: path => 'chrome-extension://synthetic/' + path } : {},
            storage: { local: { get: record('storage-get'), set: record('storage-set') } }, permissions: { request: record('permission') } },
        localScratchpadView: { hasUncommittedWork: () => true, controller: {
            hasUncommittedWork: () => true, cancelTimer: record('cancelTimer'), schedule: record('schedule'), save: record('save')
        } }, localFocusView: { controller: focus } };
    vm.runInNewContext(fs.readFileSync('shared/local-content-lifecycle.js', 'utf8'), { window, document, setTimeout });
    const lifecycle = window.LocalItabContentLifecycle;
    for (const name of ['waitForPending', 'hasUncommittedWork', 'saveDrafts', 'pauseAutosave', 'resumeAutosave', 'allowDeparture', 'cancelDeparture']) {
        const original = lifecycle[name]; lifecycle[name] = (...args) => { calls.push([name]); return original(...args); };
    }
    vm.runInNewContext(fs.readFileSync('shared/dialog-focus.js', 'utf8'), { window });
    vm.runInNewContext(source, { window, URL, Blob, setTimeout });
    const view = window.LocalItabWorkspacesView.mount({ switcher, manager, session, lifecycle, navigate: record('navigate'), download: record('download') });
    const dialog = () => document.querySelector('.spaces-dialog');
    const input = () => dialog()?.querySelector('.spaces-picker-search');
    const links = () => dialog()?.querySelectorAll('.spaces-picker-newtab') || [];
    const link = id => links().find(node => node.dataset.workspaceId === id);
    const button = id => dialog()?.querySelectorAll('.spaces-picker .spaces-button').find(node => node.dataset.workspaceId === id);
    const open = () => { const trigger = switcher.querySelector('.spaces-switch'); trigger.focus(); trigger.dispatch('click'); };
    const search = query => { input().value = query; input().dispatch('input'); };
    const close = () => dialog().querySelectorAll('button').find(node => node.textContent === catalog.spacesClose.message).dispatch('click');
    return { document, switcher, catalog, registry, calls, manager, session, window, lifecycle, view, draft, focus,
        dialog, input, links, link, button, open, search, close, notify: event => listeners.forEach(fn => fn(event || copy(registry))) };
}
function revoked(link) {
    assert(link, 'Expected a native workspace new-tab link');
    assert.equal(link.getAttribute('href'), undefined);
    assert.equal(link.getAttribute('aria-disabled'), 'true'); assert.equal(link.tabIndex, -1);
    for (const type of ['click', 'auxclick', 'contextmenu']) assert.equal(link.dispatch(type, { button: type === 'auxclick' ? 1 : 0 }).prevented, true, type);
}

for (const locale of ['en', 'zh_CN']) test(`workspace new tab: each active exact ID has a labelled native link (${locale})`, async () => {
    const m = model({ locale }); await m.view.ready; m.calls.length = 0; m.open();
    assert.equal(m.links().length, 3); assert.equal(m.link('trash'), undefined);
    assert(m.catalog.spacesOpenNewTab?.message); assert(m.catalog.spacesOpenNewTabHelp?.message);
    for (const id of ['default', 'a', 'b']) {
        const link = m.link(id); assert.equal(link.tagName, 'A');
        assert.equal(link.getAttribute('href'), `chrome-extension://synthetic/newtab.html?workspace=${encodeURIComponent(id)}`);
        assert.equal(link.target, '_blank'); assert.equal(link.rel, 'noopener');
        assert.equal(link.textContent, m.catalog.spacesOpenNewTab.message);
        assert.equal(link.getAttribute('aria-label'), `${m.catalog.spacesOpenNewTab.message}: ${m.registry.workspaces.find(item => item.id === id).name}`);
        assert.equal(link.parentElement, m.button(id).parentElement); assert.equal(link.tabIndex, 0);
    }
    assert.equal(m.button('default').disabled, true);
    assert.deepEqual(m.calls, []);
});

test('workspace new tab: uses a fresh encoded homepage path without inheriting query/hash, including fallback', async () => {
    const m = model({ runtime: false }); m.registry.workspaces[1].id = 'synthetic /?&中文#'; await m.view.ready; m.open();
    const link = m.links()[1]; assert(link);
    assert.equal(link.getAttribute('href'), 'newtab.html?workspace=' + encodeURIComponent('synthetic /?&中文#'));
    assert(!link.getAttribute('href').includes('unrelated')); assert(!link.getAttribute('href').includes('#'));
});

test('workspace new tab: native click, modified click, middle click, context menu and Enter leave dirty page and Focus alone', async () => {
    const m = model(); await m.view.ready; m.open(); const link = m.link('b'); assert(link);
    const panel = m.dialog(), before = copy(m.focus); m.calls.length = 0;
    for (const [type, fields] of [['click', {}], ['click', { ctrlKey: true }], ['click', { metaKey: true }], ['click', { shiftKey: true }],
        ['auxclick', { button: 1 }], ['contextmenu', { button: 2 }], ['keydown', { key: 'Enter' }], ['keydown', { key: ' ' }]]) {
        assert.equal(link.dispatch(type, fields).prevented, false, type);
    }
    assert.equal(m.dialog(), panel); assert.equal(m.draft.value, 'Synthetic unsaved original page');
    assert.deepEqual(m.focus, before); assert.equal(m.lifecycle.autosavePaused, false); assert.equal(m.lifecycle.departing, false);
    assert.deepEqual(m.calls, []); assert.equal(m.registry.lastUsedId, 'b');
});

test('workspace new tab: name snapshot and current/same-name identities survive filtering; retired DOM loses href', async () => {
    const m = model(); await m.view.ready; m.open(); const old = m.link('a'); assert(old); const row = old.parentElement;
    m.calls.length = 0; m.search('Twin'); revoked(old);
    assert.deepEqual(m.links().map(node => node.dataset.workspaceId), ['a', 'b']);
    m.dialog().querySelector('.spaces-picker').append(row); revoked(old);
    m.search('none'); assert.equal(m.links().length, 0); m.search('');
    assert.deepEqual(m.links().map(node => node.dataset.workspaceId), ['default', 'a', 'b']);
    assert.notEqual(m.link('a'), old); assert.deepEqual(m.calls, []);
});

for (const change of ['deleted', 'generation', 'missing']) test(`workspace new tab: known ${change} target cannot revive after restore/filter/reattach`, async () => {
    const m = model(); await m.view.ready; m.open(); const old = m.link('a'); assert(old); const button = m.button('a');
    const original = copy(m.registry.workspaces[1]);
    if (change === 'deleted') m.registry.workspaces[1].deletedAt = 123;
    if (change === 'generation') m.registry.workspaces[1].generation = 'replacement';
    if (change === 'missing') m.registry.workspaces.splice(1, 1);
    const gate = deferred(), list = m.manager.list; m.manager.list = () => gate.promise;
    m.calls.length = 0; m.notify(); revoked(old); assert.equal(button.disabled, true);
    button.dispatch('click'); assert.deepEqual(m.calls, []);
    gate.resolve(copy(m.registry)); await tick();
    m.registry.workspaces = m.registry.workspaces.filter(item => item.id !== 'a'); m.registry.workspaces.push(original);
    m.manager.list = list; await m.view.refresh(); m.search('Twin'); revoked(m.link('a'));
    assert(m.link('b').getAttribute('href')); m.dialog().querySelector('.spaces-picker').append(old.parentElement); revoked(old);
    m.close(); m.open(); assert(m.link('a').getAttribute('href'), 'Only a fresh opening can use a restored registry');
});

test('workspace new tab: rename/reorder refresh preserves original name, order, query and caret with live ID links', async () => {
    const m = model(); await m.view.ready; m.open(); m.search('Twin'); const input = m.input(), link = m.link('a'); assert(link);
    input.selectionStart = 1; input.selectionEnd = 2; m.registry.workspaces[1].name = 'Renamed'; m.registry.workspaces[1].order = 99;
    await m.view.refresh(); assert.equal(m.input(), input); assert.equal(input.value, 'Twin');
    assert.equal(input.selectionStart, 1); assert.equal(input.selectionEnd, 2); assert.equal(m.link('a'), link);
    assert.deepEqual(m.links().map(node => node.dataset.workspaceId), ['a', 'b']); assert(link.getAttribute('aria-label').endsWith('Twin 🧭'));
    m.close(); m.open(); assert.deepEqual(m.links().map(node => node.dataset.workspaceId), ['default', 'b', 'a']);
    assert(m.link('a').getAttribute('aria-label').endsWith('Renamed'));
});

for (const code of ['WORKSPACE_READ', 'WORKSPACE_LEGACY_CONFLICT']) test(`workspace new tab: ${code} permanently revokes this opening, even after a successful refresh`, async () => {
    const m = model(); await m.view.ready; m.open(); const links = m.links(), buttons = links.map(link => m.button(link.dataset.workspaceId));
    assert.equal(links.length, 3); const list = m.manager.list; m.manager.list = async () => { throw { code }; };
    await m.view.refresh(); for (const link of links) revoked(link);
    for (const button of buttons) assert.equal(button.disabled, true);
    m.manager.list = list; await m.view.refresh(); m.search('Twin'); for (const link of m.links()) revoked(link);
    m.close(); m.open(); assert(m.link('a').getAttribute('href'));
});

test('workspace new tab: an error notification immediately revokes links before a delayed list refresh', async () => {
    const m = model(); await m.view.ready; m.open(); const links = m.links(); assert.equal(links.length, 3);
    const gate = deferred(); m.manager.list = () => gate.promise; m.notify({ error: { code: 'WORKSPACE_CORRUPT' } });
    for (const link of links) revoked(link); gate.resolve(copy(m.registry)); await tick();
    for (const link of links) revoked(link);
});

test('workspace new tab: IME, repeat and already-prevented events never activate or start a switch', async () => {
    const m = model(); await m.view.ready; m.open(); let link = m.link('a'); assert(link); m.calls.length = 0;
    for (const fields of [{ isComposing: true }, { keyCode: 229 }, { repeat: true }, { defaultPrevented: true }]) {
        for (const type of ['click', 'auxclick', 'contextmenu', 'keydown']) assert.equal(link.dispatch(type, { key: 'Enter', ...fields }).prevented, true);
    }
    for (const getNode of [m.input, () => link]) {
        const node = getNode(); node.dispatch('compositionstart');
        assert.equal(link.dispatch('click').prevented, true); assert.equal(link.dispatch('keydown', { key: 'Enter' }).prevented, true);
        node.dispatch('compositionend'); link = m.link('a'); assert.equal(link.dispatch('click').prevented, false);
    }
    assert.deepEqual(m.calls, []);
});

test('workspace new tab: hidden/inert controls and detached row or wrong parent block native default', async () => {
    const m = model(); await m.view.ready; m.open(); const link = m.link('a'); assert(link); const row = link.parentElement;
    m.calls.length = 0;
    for (const mode of ['document', 'overlay', 'aria', 'inert', 'display', 'disabled']) {
        const overlay = m.dialog().parentElement;
        if (mode === 'document') m.document.hidden = true;
        if (mode === 'overlay') overlay.classList.remove('active');
        if (mode === 'aria') overlay.setAttribute('aria-hidden', 'true');
        if (mode === 'inert') row.inert = true;
        if (mode === 'display') row.style.display = 'none';
        if (mode === 'disabled') link.setAttribute('aria-disabled', 'true');
        for (const type of ['click', 'auxclick', 'contextmenu']) assert.equal(link.dispatch(type).prevented, true, mode);
        m.document.hidden = false; overlay.classList.add('active'); overlay.setAttribute('aria-hidden', 'false');
        row.inert = false; row.style.display = ''; link.removeAttribute('aria-disabled');
    }
    row.remove(); revokedAfterEvent(link); m.dialog().querySelector('.spaces-picker').append(row); revoked(link);
    m.search('Twin'); const moved = m.link('b'); moved.remove(); m.dialog().append(moved); revokedAfterEvent(moved);
    assert.deepEqual(m.calls, []);
});
function revokedAfterEvent(link) { assert.equal(link.dispatch('contextmenu').prevented, true); revoked(link); }

test('workspace new tab: pending in-tab switch blocks native activation without adding another operation', async () => {
    const m = model(); await m.view.ready; m.open(); const link = m.link('a'); assert(link);
    const gate = deferred(); m.lifecycle.waitForPending = () => gate.promise;
    const pending = m.view.requestSwitch('b'); assert.equal(m.view.pending, true); m.calls.length = 0;
    for (const type of ['click', 'auxclick', 'contextmenu']) assert.equal(link.dispatch(type).prevented, true);
    assert.deepEqual(m.calls, []); gate.resolve(); await pending;
    assert.equal(m.view.pending, false); assert.equal(link.dispatch('click').prevented, false);
    assert(!m.calls.some(call => ['select', 'navigate', 'saveDrafts', 'allowDeparture'].includes(call[0])));
});

test('workspace new tab: close, reopen and destroy revoke old hrefs and cannot affect newer input or focus', async () => {
    const m = model(); await m.view.ready; m.open(); const old = m.link('a'); assert(old); const row = old.parentElement;
    m.close(); revoked(old); assert.equal(m.document.activeElement, m.switcher.querySelector('.spaces-switch'));
    m.open(); m.search('Twin'); const input = m.input(); m.dialog().querySelector('.spaces-picker').append(row); m.calls.length = 0;
    revoked(old); assert.equal(m.input(), input); assert.equal(input.value, 'Twin'); assert.equal(m.document.activeElement, input);
    const links = m.links(); m.view.destroy(); for (const link of links) revoked(link);
    assert.deepEqual(m.calls, []);
});

test('workspace new tab: anchors participate in the shared dynamic focus trap and invalidating focused target keeps focus inside', async () => {
    const m = model(); await m.view.ready; m.open(); const link = m.link('a'); assert(link);
    const eligible = () => m.dialog().querySelectorAll('button, input, a[href], [tabindex]').filter(node => !node.disabled && node.tabIndex >= 0);
    assert(eligible().includes(link)); link.focus(); m.registry.workspaces[1].deletedAt = 123; await m.view.refresh();
    assert.equal(m.document.activeElement, m.input()); assert(!eligible().includes(link));
    m.input().dispatch('keydown', { key: 'Tab', shiftKey: true }); assert.equal(m.document.activeElement.textContent, m.catalog.spacesClose.message);
    m.document.activeElement.dispatch('keydown', { key: 'Tab' }); assert.equal(m.document.activeElement, m.input());
});

const REGISTRY = '__localItabWorkspaceRegistryV1', PREFIX = '__localItabWorkspaceV1:';
function store() {
    const date = '2026-10-17T12:00:00.000Z';
    const entries = [entry('default', 'Default', 0), entry('a', 'Twin', 1), entry('b', 'Twin', 2), entry('trash', 'Trash', 3, date)]
        .map(item => ({ ...item, createdAt: date, updatedAt: date }));
    const raw = {
        [REGISTRY]: { schemaVersion: 1, revision: 1, migrationId: 'migration-synthetic', defaultId: 'default', lastUsedId: 'b', workspaces: entries },
        __localItabWorkspaceActivationV1: { schemaVersion: 1, migrationId: 'migration-synthetic', defaultId: 'default' },
        __localItabWorkspacePreMigrationV1: { schemaVersion: 1, id: 'migration-synthetic', createdAt: date, values: {} }
    };
    for (const item of entries) raw[PREFIX + item.id + ':' + item.generation] = { schemaVersion: 1, id: item.id, generation: item.generation, values: {} };
    const writes = [], calls = [];
    const chrome = { storage: { local: {
        async get(keys) { return copy(keys == null ? raw : Object.fromEntries((typeof keys === 'string' ? [keys] : keys).filter(key => key in raw).map(key => [key, raw[key]]))); },
        async set(values) { writes.push(copy(values)); Object.assign(raw, copy(values)); },
        async remove() { assert.fail('Unexpected storage removal'); }
    }, onChanged: { addListener() {} } } };
    const queues = new Map(); const locks = { request(name, options, action) { const next = (queues.get(name) || Promise.resolve()).then(action || options); queues.set(name, next.catch(() => {})); return next; } };
    const manager = Workspaces.createManager({ chrome, locks });
    manager.select = (...args) => { calls.push(args); assert.fail('Explicit page capture must not select'); };
    return { manager, raw, writes, calls };
}

test('workspace new tab: generated same-name link captures exactly its ID with the real Manager, without select or lastUsed writes', async () => {
    const m = model(); await m.view.ready; m.open(); const link = m.link('a'); assert(link);
    const f = store(); await f.manager.ready(); const original = f.manager.capture('default'); await original.ready();
    const before = copy(f.raw); f.writes.length = 0;
    const requested = new URL(link.getAttribute('href')).searchParams.get('workspace');
    const opened = f.manager.capture(requested); assert.deepEqual(await opened.ready(), { id: 'a', generation: 'g-a' });
    assert.equal(original.id, 'default'); assert.equal(f.raw[REGISTRY].lastUsedId, 'b');
    assert.equal((await f.manager.capture().ready()).id, 'b');
    assert.deepEqual(f.raw, before); assert.deepEqual(f.writes, []); assert.deepEqual(f.calls, []);
});

for (const target of ['missing', 'trash']) test(`workspace new tab: real Manager rejects explicit ${target} ID without fallback or writes`, async () => {
    const f = store(); await f.manager.ready(); const before = copy(f.raw); f.writes.length = 0;
    const session = f.manager.capture(target);
    await assert.rejects(session.ready(), error => error.code === (target === 'missing' ? 'WORKSPACE_NOT_FOUND' : 'WORKSPACE_DELETED'));
    assert.equal(session.id, null); assert.equal(session.requestedId, target); assert.deepEqual(f.raw, before);
    assert.deepEqual(f.writes, []); assert.deepEqual(f.calls, []);
});

test('workspace new tab: deletion after link activation is rejected by destination validation, not claimed atomic', async () => {
    const m = model(); await m.view.ready; m.open(); const link = m.link('a'); assert(link); assert.equal(link.dispatch('click').prevented, false);
    const f = store(); await f.manager.ready(); f.raw[REGISTRY].workspaces.find(item => item.id === 'a').deletedAt = '2026-10-17T12:01:00.000Z';
    const before = copy(f.raw); f.writes.length = 0;
    const session = f.manager.capture(new URL(link.getAttribute('href')).searchParams.get('workspace'));
    await assert.rejects(session.ready(), error => error.code === 'WORKSPACE_DELETED');
    assert.equal(session.id, null); assert.deepEqual(f.raw, before); assert.deepEqual(f.writes, []); assert.deepEqual(f.calls, []);
});

test('workspace new tab: responsive rows reuse template colors and shared focus styling', () => {
    const css = fs.readFileSync('workspaces.css', 'utf8');
    assert.match(css, /\.spaces-picker-row\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) auto/);
    assert.match(css, /\.spaces-picker-newtab\s*\{[^}]*min-width: 0[^}]*overflow-wrap: anywhere/);
    assert.match(css, /\.spaces-picker-row\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(css, /\.spaces-overlay :focus-visible/);
});
