const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument, nativeActivation } = require('./helpers/dashboard-harness');
const clone = value => JSON.parse(JSON.stringify(value));
function harness() {
    const document = createDocument(), frames = [], events = new Map(), actions = [], errors = [];
    const originalCreate = document.createElement;
    document.createElement = tag => {
        const element = originalCreate(tag), focus = element.focus.bind(element);
        element.focus = () => {
            focus();
            if (document.activeElement === element) {
                element.dispatch('focusin');
                document.listeners.get('focusin')?.({ target: element });
            }
        };
        return element;
    };
    const search = document.createElement('input'), tail = document.createElement('button');
    const category = document.createElement('button'); category.className = 'category-item'; category.dataset.category = 'work';
    const categoryName = document.createElement('span'); category.append(categoryName);
    const tiles = ['A', 'B'].map((title, index) => {
        const tile = document.createElement('div'); tile.className = 'shortcut-item'; tile.dataset.index = String(index);
        const launch = document.createElement('button'); launch.className = 'shortcut-launch';
        const icon = document.createElement('span'); launch.append(icon);
        const edit = document.createElement('button'); edit.className = 'shortcut-action-btn';
        tile.append(launch, edit); tile.rect = { left: 200 + index * 100, top: 300, width: 90, height: 100 };
        launch.rect = { left: tile.rect.left, top: tile.rect.top, width: 80, height: 90 };
        return { tile, launch, edit, icon };
    });
    document.body.append(search, category, ...tiles.map(item => item.tile), tail); search.focus();
    document.elementFromPoint = () => null;
    const component = { links: ['A', 'B'].map(title => ({ title, url: `https://example.com/${title}`, category: 'work' })),
        layout: { autoArrange: true, alignToGrid: true }, categories: [{ id: 'work', name: 'Work' }], layoutController: { modePending: false } };
    const window = { document, innerWidth: 800, innerHeight: 600, shortcutsComponentInstance: component,
        categoryNavigation: { categories: component.categories }, showErrorMessage: message => errors.push(message),
        addEventListener(type, fn) { events.set(type, fn); }, removeEventListener(type) { events.delete(type); } };
    const context = { document, window, console, requestAnimationFrame: fn => frames.push(fn) };
    vm.createContext(context); vm.runInContext(fs.readFileSync('context-menu.js', 'utf8'), context);
    const api = window.contextMenu;
    api.init({ onAction(action, payload) { actions.push({ action, payload: clone(payload), active: document.activeElement }); } });
    const event = (target, rest = {}) => ({ target, clientX: 210, clientY: 310, prevented: false,
        preventDefault() { this.prevented = true; }, ...rest });
    const open = (target = tiles[0].launch, rest = {}) => {
        const e = event(target, rest); document.listeners.get('contextmenu')?.(e); return e;
    };
    const menu = () => document.body.querySelector('.context-menu');
    const items = () => menu()?.querySelectorAll('.ctx-item') || [];
    const pointer = target => document.listeners.get('pointerdown')?.({ target });
    const flushFrames = () => { for (const fn of frames.splice(0)) fn(); };
    return { document, window, context, component, api, tiles, category, categoryName, search, tail, frames, events, actions, errors, open, menu, items, pointer, flushFrames };
}

{
    const h = harness(); const opened = h.open(h.tiles[0].icon);
    assert.equal(opened.prevented, true);
    assert.equal(h.menu().getAttribute('role'), 'menu');
    assert.equal(h.menu().getAttribute('aria-label'), 'Shortcut actions');
    assert.deepEqual(h.items().map(item => item.tagName), ['BUTTON', 'BUTTON', 'BUTTON', 'BUTTON', 'BUTTON']);
    assert(h.items().every(item => item.type === 'button' && item.getAttribute('role') === 'menuitem'));
    assert.equal(h.menu().querySelector('.ctx-kbd'), null, 'unsupported action shortcuts are not advertised');
    assert.equal(h.document.activeElement, h.items()[0]);
    assert.deepEqual(h.items().map(item => item.tabIndex), [0, -1, -1, -1, -1]);
    h.flushFrames(); assert(h.menu().classList.contains('open'));
    h.items()[0].dispatch('keydown', { key: 'ArrowUp' }); assert.equal(h.document.activeElement, h.items()[2]);
    h.items()[2].dispatch('keydown', { key: 'ArrowDown' }); assert.equal(h.document.activeElement, h.items()[0]);
    h.items()[0].dispatch('keydown', { key: 'End' }); assert.equal(h.document.activeElement, h.items()[2]);
    h.items()[2].dispatch('keydown', { key: 'Home' }); assert.equal(h.document.activeElement, h.items()[0]);
    const escape = h.items()[0].dispatch('keydown', { key: 'Escape' });
    assert.equal(escape.prevented, true); assert.equal(escape.stopped, true);
    assert.equal(h.menu(), null); assert.equal(h.document.activeElement, h.tiles[0].launch);
    assert.equal(h.document.listeners.has('keydown'), false, 'no document-level shortcut listener');
}
for (const key of ['Enter', ' ']) {
    const h = harness(); h.open(); const item = h.items()[1];
    nativeActivation(item, key, true); assert.equal(h.actions.length, 0);
    nativeActivation(item, key); assert.equal(h.actions.length, 1);
    assert.equal(h.actions[0].action, 'edit'); assert.deepEqual(h.actions[0].payload, { type: 'site', index: 0 });
    assert.equal(h.actions[0].active, h.tiles[0].launch, 'origin is restored before opening an action/dialog');
    item.dispatch('click'); assert.equal(h.actions.length, 1, 'retired button cannot activate twice');
}
for (const fields of [
    { key: 'e' }, { key: 'E' }, { key: 'Delete' },
    { key: 'Escape', shiftKey: true }, { key: 'ArrowDown', ctrlKey: true },
    { key: 'Home', metaKey: true }, { key: 'ArrowUp', altKey: true }, { key: 'Tab', ctrlKey: true }
]) {
    const h = harness(); h.open(); const item = h.items()[0];
    const event = item.dispatch('keydown', fields);
    assert.equal(event.prevented, false); assert.equal(event.stopped, false); assert(h.menu());
    assert.equal(h.actions.length, 0); assert.equal(h.document.activeElement, item);
}
for (const shiftKey of [false, true]) {
    const h = harness(); h.open(); const event = h.items()[0].dispatch('keydown', { key: 'Tab', shiftKey });
    assert.equal(event.prevented, false, 'native Tab traversal remains available');
    assert.equal(h.menu(), null); assert.equal(h.document.activeElement, h.tiles[0].launch);
    // The model does not execute browser Tab defaults. Native traversal is a
    // separate smoke check; this test proves dismissal/restoration is synchronous.
}
{
    const h = harness(); h.open(); h.pointer(h.search); h.search.focus();
    assert.equal(h.menu(), null); assert.equal(h.document.activeElement, h.search);
    h.open(); h.tail.focus(); assert.equal(h.menu(), null); assert.equal(h.document.activeElement, h.tail);
}
{
    const h = harness(); h.open(h.tiles[0].edit, { clientX: 0, clientY: 0 });
    h.items()[0].dispatch('keydown', { key: 'Escape' }); assert.equal(h.document.activeElement, h.tiles[0].edit);
    h.open(h.tiles[0].launch, { clientX: 0, clientY: 0 });
    assert.equal(h.menu().style.left, '200px'); assert.equal(h.menu().style.top, '390px');
    h.items()[0].dispatch('keydown', { key: 'Escape' });
    h.open(h.categoryName, { clientX: 0, clientY: 0 });
    assert.equal(h.menu().getAttribute('aria-label'), 'Category actions');
    nativeActivation(h.items()[0], 'Enter');
    assert.deepEqual(h.actions[0].payload, { type: 'category', id: 'work' }); assert.equal(h.document.activeElement, h.category);
}
{
    const h = harness();
    h.open(h.document.body, { clientX: -20, clientY: -50 });
    assert.equal(h.menu().style.left, '8px'); assert.equal(h.menu().style.top, '8px');
    h.open(h.document.body, { clientX: 2000, clientY: 2000 });
    assert.equal(h.menu().style.left, '712px'); assert.equal(h.menu().style.top, '512px');
}
for (const layout of [{ autoArrange: true, alignToGrid: true }, { autoArrange: false, alignToGrid: false }, { autoArrange: false, alignToGrid: true }]) {
    const h = harness(); h.component.layout = layout; h.open(h.document.body);
    const modes = h.items().slice(0, 3);
    assert(modes.every(item => item.getAttribute('role') === 'menuitemradio'));
    assert.deepEqual(modes.map(item => item.getAttribute('aria-checked')), layout.autoArrange ? ['true', 'false', 'false'] : layout.alignToGrid ? ['false', 'false', 'true'] : ['false', 'true', 'false']);
    assert.equal(h.items()[3].getAttribute('role'), 'menuitemcheckbox'); assert.equal(h.items()[3].getAttribute('aria-checked'), 'false');
    nativeActivation(modes[1], 'Enter'); assert.equal(h.actions[0].action, 'layout_free');
}
{
    const h = harness(); h.component.layoutController.modePending = true;
    h.window.dashboardHiddenState = true; h.open(h.document.body);
    assert(h.items().slice(0, 3).every(item => item.disabled));
    assert.equal(h.document.activeElement, h.items()[3]);
    assert.equal(h.items()[3].getAttribute('aria-checked'), 'true');
    h.items()[3].dispatch('keydown', { key: 'ArrowDown' }); assert.equal(h.document.activeElement, h.items()[3]);
    h.items()[0].dispatch('click'); assert.equal(h.actions.length, 0);
    h.component.layoutController.modePending = false;
    nativeActivation(h.items()[3], 'Enter');
    assert.equal(h.actions[0].action, 'dashboard_visibility_toggle', 'unrelated completed layout save does not invalidate Hide');
}
for (const invalidate of [
    h => h.tiles[0].tile.remove(),
    h => { h.tiles[0].tile.style.display = 'none'; },
    h => h.component.links.reverse(),
    h => { h.component.links[0].title = 'Changed'; },
    h => { h.tiles[0].tile.dataset.index = '1'; },
    h => { h.window.shortcutsComponentInstance = { ...h.component }; }
]) {
    const h = harness(); h.open(); const item = h.items()[2]; invalidate(h); item.dispatch('click');
    assert.equal(h.actions.length, 0); assert.equal(h.errors.length, 1); assert.equal(h.menu(), null);
}
{
    const h = harness(); h.open(h.categoryName); const item = h.items()[0]; h.component.categories[0].id = 'other'; item.dispatch('click');
    assert.equal(h.actions.length, 0); assert.equal(h.errors.length, 1);
    h.open(h.document.body); const hide = h.items()[3]; h.window.dashboardHiddenState = true; hide.dispatch('click');
    assert.equal(h.actions.length, 0); assert.equal(h.errors.length, 2);
}
{
    const h = harness(); h.open(); const oldMenu = h.menu(), oldItem = h.items()[0];
    h.items()[0].dispatch('keydown', { key: 'Escape' });
    h.flushFrames(); assert.equal(h.menu(), null, 'closed-before-frame must not throw or reopen');
    h.open(); const stale = h.items()[0]; h.open(h.tiles[1].launch);
    oldItem.dispatch('click'); stale.dispatch('click');
    assert.equal(h.actions.length, 0); assert.notEqual(h.menu(), oldMenu);
    h.flushFrames(); assert(h.menu().classList.contains('open'));
    nativeActivation(h.items()[0], 'Enter'); assert.equal(h.actions[0].payload.index, 1);
    h.open(); h.api.destroy(); h.flushFrames(); assert.equal(h.menu(), null);
    assert.equal(h.document.listeners.has('contextmenu'), false); assert.equal(h.events.size, 0);
    h.api.init({ onAction: (action, payload) => h.actions.push({ action, payload }) });
    h.api.init({ onAction: (action, payload) => h.actions.push({ action, payload }) });
    assert.equal(h.document.body.querySelectorAll('.context-menu-root').length, 1);
}
for (const kind of ['input', 'textarea', 'select', 'editable', 'modal', 'inert']) {
    const h = harness(), element = h.document.createElement(['editable', 'modal', 'inert'].includes(kind) ? 'div' : kind);
    if (kind === 'editable') element.setAttribute('contenteditable', '');
    if (kind === 'modal') element.className = 'modal-overlay';
    if (kind === 'inert') element.inert = true;
    h.document.body.append(element);
    assert.equal(h.open(element).prevented, false, kind); assert.equal(h.menu(), null, kind);
}
{
    const h = harness(); h.document.elementFromPoint = () => h.tiles[1].icon;
    h.open(h.document.body); nativeActivation(h.items()[0], 'Enter'); assert.equal(h.actions[0].payload.index, 1);
    h.document.elementFromPoint = () => null;
    h.open(); h.events.get('blur')(); assert.equal(h.menu(), null);
    h.open(); h.events.get('resize')(); assert.equal(h.menu(), null);
}
{
    const h = harness(); h.open(); const button = h.items()[2];
    const focus = h.tiles[0].launch.focus;
    h.tiles[0].launch.focus = () => { focus(); h.component.links.reverse(); };
    button.dispatch('click');
    assert.equal(h.actions.length, 0, 'target is rechecked after a focus callback can mutate it');
    assert.equal(h.errors.length, 1);
}
{
    const h = harness();
    h.api.init({ onAction(action, payload) { h.actions.push({ action, payload }); h.open(h.tiles[1].launch); } });
    h.open(); const old = h.items()[0]; old.dispatch('click'); h.flushFrames();
    assert.equal(h.actions.length, 1); assert(h.menu()); assert(h.menu().classList.contains('open'));
    old.dispatch('click'); assert.equal(h.actions.length, 1, 'old action cannot reach the reopened session');
}
{
    const h = harness(); h.component.links[1] = { ...h.component.links[0] };
    h.open(); const item = h.items()[2]; h.component.links.reverse(); item.dispatch('click');
    assert.equal(h.actions.length, 0, 'identical-looking records are still distinct in a captured menu');
    assert.equal(h.errors.length, 1);
    h.open(h.document.body); const grid = h.items()[0]; h.component.layout.autoArrange = false; grid.dispatch('click');
    assert.equal(h.actions.length, 0); assert.equal(h.errors.length, 2);
}
{
    const h = harness(); h.open();
    assert.equal(h.open(h.search).prevented, false); assert.equal(h.menu(), null, 'native input menu retires an old custom menu');
}
// Deletion confirmation must preserve the intended record after leaving a menu.
for (const change of [links => links.reverse(), links => links.splice(0, 1), links => { links[0].title = 'Changed'; }, links => { links[0] = { ...links[0] }; }]) {
    const h = harness(); h.context.storageManager = { defaultConfig: { layout: { columns: 6 } } };
    vm.runInContext(fs.readFileSync('newtab.js', 'utf8') + '\nthis.ShortcutsComponent = ShortcutsComponent; this.notices = []; showErrorMessage = message => notices.push(message);', h.context);
    const component = new h.context.ShortcutsComponent(clone(h.component.links));
    let callback, deleted = 0;
    component.showConfirmDialog = (title, message, link, onConfirm) => { callback = onConfirm; };
    component.deleteShortcut = () => { deleted++; };
    component.confirmDelete(0); change(component.links); callback();
    assert.equal(deleted, 0); assert.equal(h.context.notices.length, 1);
}
console.log('context menu tests ok (DOM/event/focus model; native menu traversal still needs smoke verification)');

// New Grid-order entries use the existing native menu ownership and stale guards.
{
    const h = harness();
    h.component.getShortcutOrderTarget = (index, direction) => h.component.layout.autoArrange && !h.component.pending && index + direction >= 0 && index + direction < 2 ? index + direction : -1;
    h.open(h.tiles[0].launch, { clientX: 0, clientY: 0 });
    assert.equal(h.items()[3].disabled, true); assert.equal(h.items()[4].disabled, false);
    h.items()[0].dispatch('keydown', { key: 'End' }); assert.equal(h.document.activeElement, h.items()[4]);
    const old = h.items()[4]; nativeActivation(old, 'Enter'); old.dispatch('click');
    assert.equal(h.actions.length, 1); assert.equal(h.actions[0].action, 'move_later');
    assert.equal(h.actions[0].active, h.tiles[0].launch); assert.equal(h.menu(), null);
    h.open(h.tiles[1].launch); assert.equal(h.items()[3].disabled, false); assert.equal(h.items()[4].disabled, true);
    h.items()[3].dispatch('keydown', { key: 'Enter', repeat: true }); assert.equal(h.actions.length, 1);
    h.component.layout.autoArrange = false; h.items()[3].dispatch('click'); assert.equal(h.actions.length, 1); assert.equal(h.errors.length, 1);
    h.open(); assert(h.items()[3].disabled && h.items()[4].disabled);
}
for (const change of ['pending', 'scope', 'identity']) {
    const h = harness(); h.component.getShortcutOrderTarget = () => h.component.pending ? -1 : 1;
    h.component.getCurrentCategory = () => h.component.scope || 'all';
    h.open(); const move = h.items()[4];
    if (change === 'pending') h.component.pending = true;
    if (change === 'scope') h.component.scope = 'work';
    if (change === 'identity') h.component.links[0].layoutId = 'new-identity';
    move.dispatch('click'); assert.equal(h.actions.length, 0, change); assert.equal(h.errors.length, 1, change);
}
