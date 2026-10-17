const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const clone = value => structuredClone(value);
const tick = () => new Promise(resolve => setTimeout(resolve, 5));
function model({ locale = 'en', count = 3 } = {}) {
    const document = createDocument({ blurUnavailableFocus: true });
    const catalog = locale ? JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`)) : {};
    const switcher = document.createElement('section'), managerHost = document.createElement('section');
    document.body.append(switcher, managerHost);
    const registry = { schemaVersion: 1, revision: 9, defaultId: 'default', lastUsedId: 'default', workspaces: [
        { id: 'default', name: 'Default', order: 10, generation: 'g0', deletedAt: null },
        { id: 'a', name: 'Twin 🧭', order: 30, generation: 'g1', deletedAt: null },
        { id: 'b', name: 'Twin 🧭', order: 50, generation: 'g2', deletedAt: null }
    ].slice(0, count).concat({ id: 'trash', name: 'Trash', order: 20, generation: 'g3', deletedAt: 123 }) };
    const calls = [], listeners = new Set();
    const manager = {
        list: async () => { calls.push(['list']); return clone(registry); },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        move: async (id, direction, options) => {
            calls.push(['move', id, direction, clone(options)]);
            if (options.expectedRevision !== registry.revision) throw { code: 'WORKSPACE_CONFLICT' };
            const active = registry.workspaces.filter(item => item.deletedAt === null).sort((a, b) => a.order - b.order);
            const index = active.findIndex(item => item.id === id), neighbor = active[index + (direction === 'up' ? -1 : 1)];
            if (neighbor) { [active[index].order, neighbor.order] = [neighbor.order, active[index].order]; registry.revision++; }
        }
    };
    const session = { id: 'default', generation: 'g0', ready: async () => {}, flush: () => calls.push(['flush']) };
    const lifecycle = { pauseAutosave: () => calls.push(['pause']), hasUncommittedWork: () => true };
    const windowListeners = new Map();
    const window = { addEventListener: (type, fn) => windowListeners.set(type, fn), removeEventListener: type => windowListeners.delete(type), document, location: { href: 'chrome-extension://synthetic/options.html' }, i18n: { t: key => catalog[key]?.message || key } };
    vm.runInNewContext(fs.readFileSync('shared/dialog-focus.js', 'utf8'), { window });
    vm.runInNewContext(fs.readFileSync('shared/workspaces-view.js', 'utf8'), { window, URL, Blob, setTimeout });
    const view = window.LocalItabWorkspacesView.mount({ switcher, managerHost, manager, session, lifecycle, navigate: id => calls.push(['navigate', id]) });
    const control = (id, action) => managerHost.querySelector(`[data-workspace-id="${id}"][data-workspace-action="${action}"]`);
    return { document, window, windowListeners, catalog, manager, session, registry, view, calls, managerHost, switcher, control,
        notify: () => listeners.forEach(fn => fn(registry)),
        ids: () => managerHost.querySelector('.spaces-list').children.map(row => row.querySelector('button').dataset.workspaceId) };
}

test('workspace reorder: Settings exposes labelled native up and down buttons', async () => {
    const m = model(); await m.view.ready;
    assert(m.control('a', 'move-up'), 'Missing Move up button in the active workspace row');
    assert(m.control('a', 'move-down'), 'Missing Move down button in the active workspace row');
});

const moves = m => m.calls.filter(call => call[0] === 'move');
const docEvent = (m, type, fields = {}) => m.document.listeners.get(type)?.({ target: m.document.body, ...fields });
for (const locale of ['en', 'zh_CN', null]) test(`workspace reorder: ${locale || 'fallback'} labels, default/trash boundaries and native buttons`, async () => {
    const m = model({ locale }); await m.view.ready;
    assert.equal(m.control('a', 'move-up').textContent, locale === 'zh_CN' ? '上移' : 'Move up');
    assert.equal(m.control('a', 'move-down').textContent, locale === 'zh_CN' ? '下移' : 'Move down');
    assert.equal(m.control('a', 'move-up').tagName, 'BUTTON'); assert.equal(m.control('a', 'move-up').type, 'button');
    assert.equal(m.control('default', 'move-up').disabled, true); assert.equal(m.control('b', 'move-down').disabled, true);
    assert.equal(m.control('default', 'move-down').disabled, false); assert.equal(m.control('default', 'delete').disabled, true);
    assert.equal(m.control('trash', 'move-up'), null); assert.equal(m.control('trash', 'move-down'), null);
    assert.equal(m.control('a', 'move-up').dataset.workspaceId, 'a'); assert.equal(m.control('b', 'move-up').dataset.workspaceId, 'b');
    m.control('default', 'move-up').dispatch('click'); m.control('b', 'move-down').dispatch('click'); assert.deepEqual(moves(m), []);
});

test('workspace reorder: one active workspace keeps both boundaries disabled across refresh', async () => {
    const m = model({ count: 1 }); await m.view.ready; await m.view.refresh();
    assert(m.control('default', 'move-up').disabled); assert(m.control('default', 'move-down').disabled);
    m.control('default', 'move-up').dispatch('click'); m.control('default', 'move-down').dispatch('click'); assert.deepEqual(moves(m), []);
});

test('workspace reorder: moves by actual ID and rendered revision, preserves drafts and does not switch', async () => {
    const m = model(); await m.view.ready; m.calls.length = 0;
    const draft = m.document.createElement('textarea'); draft.value = 'Synthetic unsaved draft'; m.document.body.append(draft);
    m.control('b', 'move-up').focus(); m.control('b', 'move-up').dispatch('click'); await tick();
    assert.deepEqual(moves(m), [['move', 'b', 'up', { expectedRevision: 9 }]]);
    assert.deepEqual(m.ids(), ['default', 'b', 'a']); assert.equal(draft.value, 'Synthetic unsaved draft');
    assert.equal(m.document.activeElement, m.control('b', 'move-up'));
    assert(!m.calls.some(call => ['navigate', 'pause', 'flush', 'select'].includes(call[0])));
    assert.match(m.managerHost.querySelector('.spaces-status').textContent, /order saved/);
});

test('workspace reorder: moving to a boundary returns focus to the same row available direction', async () => {
    const m = model(); await m.view.ready;
    m.control('a', 'move-up').focus(); m.control('a', 'move-up').dispatch('click'); await tick();
    assert(m.control('a', 'move-up').disabled); assert.equal(m.document.activeElement, m.control('a', 'move-down'));
    m.control('a', 'move-down').dispatch('click'); await tick();
    m.control('a', 'move-down').focus(); m.control('a', 'move-down').dispatch('click'); await tick();
    assert(m.control('a', 'move-down').disabled); assert.equal(m.document.activeElement, m.control('a', 'move-up'));
});

test('workspace reorder: busy repeated clicks and detached row controls cannot issue a second move', async () => {
    const m = model(); await m.view.ready; const gate = deferred(), original = m.manager.move;
    m.manager.move = async (...args) => { await gate.promise; return original(...args); };
    const button = m.control('a', 'move-up'); button.focus(); button.dispatch('click'); button.dispatch('click');
    assert(m.view.pending); assert(m.control('a', 'move-down').disabled); m.control('a', 'move-down').dispatch('click');
    gate.resolve(); await tick(); button.dispatch('click'); assert.equal(moves(m).length, 1); assert.equal(m.view.pending, false);
    assert(m.control('a', 'move-up').disabled); assert(!m.control('a', 'move-down').disabled);
});

for (const kind of ['hidden-document', 'hidden-host', 'inert-host', 'aria-hidden-host', 'no-rects', 'detached', 'dialog', 'external-dialog', 'destroyed']) test(`workspace reorder: rejects ${kind} controls`, async () => {
    const m = model(); await m.view.ready; const button = m.control('a', 'move-up');
    if (kind === 'hidden-document') m.document.hidden = true;
    if (kind === 'hidden-host') m.managerHost.hidden = true;
    if (kind === 'inert-host') m.managerHost.inert = true;
    if (kind === 'aria-hidden-host') m.managerHost.setAttribute('aria-hidden', 'true');
    if (kind === 'no-rects') button.getClientRects = () => [];
    if (kind === 'detached') await m.view.refresh();
    if (kind === 'dialog') m.control('a', 'rename').dispatch('click');
    if (kind === 'external-dialog') { const dialog = m.document.createElement('section'); dialog.setAttribute('aria-modal', 'true'); m.document.body.append(dialog); }
    if (kind === 'destroyed') m.view.destroy();
    button.dispatch('click'); await tick(); assert.deepEqual(moves(m), []);
});

test('workspace reorder: IME, composition and repeated keyboard activation are guarded', async () => {
    const m = model(); await m.view.ready; const button = m.control('a', 'move-up');
    for (const fields of [{ isComposing: true }, { keyCode: 229 }, { repeat: true }]) {
        assert(button.dispatch('keydown', { key: 'Enter', ...fields }).prevented);
        assert(button.dispatch('keydown', { key: ' ', ...fields }).prevented);
        button.dispatch('click', fields);
    }
    button.dispatch('compositionstart'); assert(button.dispatch('keydown', { key: 'Enter' }).prevented); button.dispatch('click');
    assert.deepEqual(moves(m), []); button.dispatch('compositionend'); button.dispatch('click'); await tick(); assert.equal(moves(m).length, 1);
});

for (const other of ['create', 'trash', 'restore', 'reorder']) test(`workspace reorder: stale ${other} refuses once, refreshes and requires a fresh user action`, async () => {
    const m = model(); await m.view.ready;
    if (other === 'create') m.registry.workspaces.push({ id: 'new', name: 'New', order: 100, generation: 'g4', deletedAt: null });
    if (other === 'trash') m.registry.workspaces.find(item => item.id === 'b').deletedAt = 123;
    if (other === 'restore') m.registry.workspaces.find(item => item.id === 'trash').deletedAt = null;
    if (other === 'reorder') [m.registry.workspaces[0].order, m.registry.workspaces[2].order] = [50, 10];
    m.registry.revision++; const before = clone(m.registry);
    m.control('a', 'move-up').focus(); m.control('a', 'move-up').dispatch('click'); await tick();
    assert.deepEqual(m.registry, before); assert.deepEqual(moves(m), [['move', 'a', 'up', { expectedRevision: 9 }]]);
    assert.match(m.managerHost.querySelector('.spaces-status').textContent, /Could not confirm the new order/);
    assert.equal(m.view.pending, false);
});

for (const afterWrite of [false, true]) test(`workspace reorder: ${afterWrite ? 'uncertain successful write' : 'write failure'} never retries automatically`, async () => {
    const m = model(); await m.view.ready; const original = m.manager.move; let attempts = 0;
    m.manager.move = async (...args) => { attempts++; if (afterWrite) await original(...args); throw { code: afterWrite ? 'WORKSPACE_VERIFY' : 'WORKSPACE_WRITE' }; };
    m.control('a', 'move-up').focus(); m.control('a', 'move-up').dispatch('click'); await tick(); await tick();
    assert.equal(attempts, 1); assert.deepEqual(m.ids(), afterWrite ? ['a', 'default', 'b'] : ['default', 'a', 'b']);
    assert.match(m.managerHost.querySelector('.spaces-status').textContent, /Could not confirm/);
    assert(!m.document.querySelector('.spaces-dialog'));
});

for (const loss of ['new-focus', 'new-focus-then-body', 'pointer', 'keyboard', 'window-blur', 'hidden-then-visible', 'host-hidden', 'external-dialog', 'destroyed', 'unfocused-click']) test(`workspace reorder: async completion does not steal focus after ${loss}`, async () => {
    const m = model(); await m.view.ready; const gate = deferred(), original = m.manager.move;
    const field = m.document.createElement('textarea'); field.value = 'A newer draft'; m.document.body.append(field);
    m.manager.move = async (...args) => { await gate.promise; return original(...args); };
    if (loss !== 'unfocused-click') m.control('a', 'move-up').focus();
    m.control('a', 'move-up').dispatch('click');
    if (loss.startsWith('new-focus')) { field.focus(); docEvent(m, 'focusin', { target: field }); if (loss === 'new-focus-then-body') m.document.activeElement = m.document.body; }
    if (loss === 'pointer') docEvent(m, 'pointerdown');
    if (loss === 'keyboard') docEvent(m, 'keydown', { key: 'Tab' });
    if (loss === 'window-blur') m.windowListeners.get('blur')();
    if (loss === 'hidden-then-visible') { m.document.hidden = true; docEvent(m, 'visibilitychange'); m.document.hidden = false; }
    if (loss === 'host-hidden') m.managerHost.hidden = true;
    if (loss === 'external-dialog') { const dialog = m.document.createElement('section'); dialog.setAttribute('aria-modal', 'true'); m.document.body.append(dialog); }
    if (loss === 'destroyed') m.view.destroy();
    const expected = m.document.activeElement; gate.resolve(); await tick();
    assert.equal(m.document.activeElement, expected); assert.equal(field.value, 'A newer draft');
    for (const event of ['focusin', 'pointerdown', 'keydown', 'visibilitychange']) assert.equal(m.document.listeners.has(event), false, event + ' listener leaked');
    assert.equal(m.windowListeners.size, 0);
});

test('workspace reorder: an open picker keeps its ordered snapshot and reopening uses the new order', async () => {
    const m = model(); await m.view.ready;
    const open = () => m.switcher.querySelector('.spaces-switch').dispatch('click');
    const ids = () => m.document.querySelector('.spaces-picker').children.map(button => button.dataset.workspaceId);
    const close = () => m.document.querySelector('.spaces-dialog').querySelectorAll('button').find(button => button.textContent === 'Close').dispatch('click');
    open(); assert.deepEqual(ids(), ['default', 'a', 'b']);
    const input = m.document.querySelector('.spaces-picker-search'); input.value = 'Twin'; input.dispatch('input');
    await m.manager.move('b', 'up', { expectedRevision: 9 }); m.notify(); await tick();
    assert.deepEqual(ids(), ['a', 'b']); assert.equal(input.value, 'Twin');
    close(); open(); assert.deepEqual(ids(), ['default', 'b', 'a']); assert.equal(m.document.querySelector('.spaces-picker-search').value, '');
});


test('workspace reorder: failed refresh after an unconfirmed move disables stale controls', async () => {
    const m = model(); await m.view.ready; let attempts = 0;
    m.manager.move = async () => { attempts++; throw { code: 'WORKSPACE_WRITE' }; };
    m.manager.list = async () => { throw { code: 'WORKSPACE_READ' }; };
    m.control('a', 'move-up').focus(); m.control('a', 'move-up').dispatch('click'); await tick();
    assert(m.control('a', 'move-up').disabled); assert(m.control('a', 'move-down').disabled);
    m.control('a', 'move-up').dispatch('click'); await tick(); assert.equal(attempts, 1);
    assert.equal(m.view.pending, false); assert.equal(m.windowListeners.size, 0);
});
