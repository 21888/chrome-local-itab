'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../shared/dashboard-template-registry');
const { createHarness, menuAction, mountContextMenu, nativeActivation, submit, deferred } = require('./helpers/dashboard-harness');
const grouped = registry.ids.filter(id => registry.usesCollections(id));
const clone = value => JSON.parse(JSON.stringify(value));
const links = [
    { title: 'Work A', url: 'https://a.invalid/', icon: 'A', category: 'work', layoutId: 'a' },
    { title: 'Social B', url: 'https://b.invalid/', icon: 'B', category: 'social', layoutId: 'b' },
    { title: 'Work C', url: 'https://c.invalid/', icon: 'C', category: 'work', layoutId: 'c' },
    { title: 'Orphan', url: 'https://orphan.invalid/', icon: 'O', category: 'unknown', layoutId: 'o' }
];
function page(records = links) {
    const h = createHarness(records), c = h.component;
    h.context.window.LocalItabTemplates = registry;
    c.categories = [{ id: 'work', name: 'Work' }, { id: 'social', name: 'Social' }, { id: 'empty', name: 'Empty' }];
    h.context.window.categoryNavigation.categories = c.categories;
    h.context.window.categoryNavigation.currentCategory = 'all';
    // Exercise production layout and reflow, not the general harness stubs.
    c.applyLayoutMode = h.context.ShortcutsComponent.prototype.applyLayoutMode;
    c.reflowVisibleLayout = h.context.ShortcutsComponent.prototype.reflowVisibleLayout;
    h.document.documentElement.dataset.dashboardTemplate = grouped[0];
    c.updateGrid();
    h.storageManager.set = async () => assert.fail('Template presentation must not save data');
    return h;
}
function switchTemplate(h, template) {
    h.document.documentElement.dataset.dashboardTemplate = template;
    h.component.refreshTemplate();
}
function count(h, method) {
    const original = h.component[method];
    let calls = 0;
    h.component[method] = function (...args) { calls++; return original.apply(this, args); };
    return () => calls;
}
const tiles = h => h.grid.querySelectorAll('.shortcut-item');
const sameNodes = (actual, expected) => {
    assert.equal(actual.length, expected.length);
    actual.forEach((node, index) => assert.equal(node === expected[index], true, `node ${index} stays attached`));
};
const order = h => h.grid.querySelectorAll('.shortcut-item:not(.add-shortcut)').map(tile => Number(tile.dataset.index));

// DOM-operation evidence only; no native paint, timing or focus-event claim.
test('equivalent grouped styles retain controls and focus without rebuilding or restoring focus', () => {
    for (const category of ['all', 'work', 'social', 'unknown', 'empty']) {
        const h = page(), c = h.component, nav = h.context.window.categoryNavigation;
        nav.selectCategory(category);
        const original = tiles(h), sections = h.grid.querySelectorAll('.shortcut-collection');
        const data = clone({ links: c.links, layout: c.layout, categories: c.categories });
        const build = count(h, 'buildShortcutsFragment'), create = count(h, 'createShortcutItem');
        const restore = count(h, 'restoreGridFocus');
        const visible = category === 'social' ? 1 : category === 'unknown' ? 3 : 0;
        const controls = [h.add(), h.search, ...(category === 'empty' ? [] : [h.control(visible), h.control(visible, 'more')])];
        for (const control of controls) {
            control.focus();
            for (const template of [...grouped, ...grouped.slice().reverse()]) {
                switchTemplate(h, template);
                assert.equal(build(), 0);
                assert.equal(h.document.activeElement === control, true, `${template}: ${category} focus is untouched`);
                sameNodes(tiles(h), original);
                sameNodes(h.grid.querySelectorAll('.shortcut-collection'), sections);
                assert.equal(nav.currentCategory, category);
                assert.equal(h.grid.querySelector('.category-empty-state').hidden, category !== 'empty');
                assert.deepEqual(order(h), [0, 2, 1, 3]);
            }
        }
        assert.equal(build(), 0); assert.equal(create(), 0); assert.equal(restore(), 0);
        assert.deepEqual(clone({ links: c.links, layout: c.layout, categories: c.categories }), data);
    }
});

test('direct link changes and category header/order changes invalidate reuse without a new cache', () => {
    const changes = [
        c => { c.links[0].title = 'Changed title'; },
        c => { c.links[0].url = 'https://changed.invalid/'; },
        c => { c.links[0].icon = 'Changed icon'; },
        c => { c.links[0].category = 'social'; },
        c => { c.links[0].layoutId = 'changed-id'; },
        c => { c.links[0] = { ...c.links[0] }; },
        c => { c.links.reverse(); },
        c => { c.links.splice(1, 1); },
        c => { c.links.push({ title: 'New', url: 'https://new.invalid/', category: 'work' }); },
        c => { c.links = []; },
        c => { c.categories[0].name = 'Renamed work'; },
        c => { c.categories.reverse(); },
        c => { c.categories.unshift({ id: 'unknown', name: 'Adopted orphan' }); },
        c => { c.categories.splice(0, 1); }
    ];
    for (const change of changes) {
        const h = page(), c = h.component, old = h.control(0, 'more');
        const build = count(h, 'buildShortcutsFragment'), create = count(h, 'createShortcutItem');
        change(c);
        switchTemplate(h, 'folio');
        assert.equal(build(), 1, change.toString()); assert.equal(create(), c.links.length);
        assert.equal(old.isConnected, false);
        assert.equal(c.canReuseCollections(), true, 'rebuilt records/headers match current data');
        for (let index = 0; index < c.links.length; index++) {
            assert.equal(h.tile(index).querySelector('.shortcut-title').textContent, c.links[index].title);
            assert.equal(c.isCurrentShortcutMenuSource(h.control(index, 'more')), true);
        }
        const data = clone(c.links);
        switchTemplate(h, 'graphite');
        assert.equal(build(), 1, 'unchanged data reuses the newly built nodes');
        assert.deepEqual(clone(c.links), data);
    }
});

test('a changed category filter rebuilds when needed and keeps the existing focus fallback', () => {
    const h = page(), c = h.component, build = count(h, 'buildShortcutsFragment');
    h.control(1, 'more').focus();
    h.context.window.categoryNavigation.currentCategory = 'work';
    switchTemplate(h, 'folio');
    assert.equal(build(), 1);
    assert.equal(h.tile(1).style.display, 'none');
    assert.equal(h.document.activeElement === h.control(2), true);
    assert.equal(h.document.getElementById('shortcuts-heading').textContent, 'Work · 2');
    switchTemplate(h, 'graphite'); assert.equal(build(), 1);
});

test('grouped template refresh preserves an editor draft, opener and pending-save outcomes', async () => {
    for (const succeed of [true, false]) {
        const h = page(), c = h.component;
        menuAction(h, 2, 'edit');
        const overlay = c.modal, input = overlay.querySelector('#shortcut-title'), opener = h.control(2, 'more');
        input.value = 'Unsaved C';
        const original = tiles(h);
        switchTemplate(h, 'folio');
        sameNodes(tiles(h), original); assert.equal(c.modal === overlay, true);
        assert.equal(h.document.activeElement === input, true); assert.equal(input.value, 'Unsaved C');
        assert.equal(c.currentEditIndex, 2);
        c.hideModal(); assert.equal(h.document.activeElement === opener, true);
        menuAction(h, 2, 'edit'); input.value = 'Saved C';
        const pending = deferred(); h.storageManager.set = () => pending.promise;
        const saving = submit(c);
        switchTemplate(h, 'graphite');
        assert.equal(c.modal === overlay, true); assert.equal(h.document.activeElement === input, true);
        assert.equal(input.value, 'Saved C'); assert.equal(c.currentEditIndex, 2);
        pending.resolve(succeed); await saving;
        assert.equal(c.links[2].title, succeed ? 'Saved C' : 'Work C');
        if (!succeed) {
            assert.equal(h.document.activeElement === input, true); assert.equal(input.value, 'Saved C');
            c.hideModal();
        }
        assert.equal(h.document.activeElement === h.control(2, 'more'), true);
    }
});

const openMenu = (h, entry) => {
    if (entry === 'more') nativeActivation(h.control(0, 'more'), 'Enter');
    else h.document.listeners.get('contextmenu')({ target: h.control(0), clientX: 16, clientY: 24, preventDefault() {} });
    return h.document.querySelector('.context-menu');
};

test('open menus retain rebuild invalidation through grouped template changes and round trips', () => {
    for (const entry of ['more', 'right-click']) {
        for (const templates of [['folio', 'graphite'], ['folio'], ['folio', 'graphite', 'folio', 'graphite']]) {
            for (const action of [0, 1, 2, 4]) {
                const h = page(); mountContextMenu(h);
                let writes = 0; h.storageManager.set = async () => { writes++; return true; };
                const source = h.control(0, 'more');
                const old = openMenu(h, entry).querySelectorAll('.ctx-item')[action];
                for (const template of templates) switchTemplate(h, template);
                old.dispatch('click');
                assert.equal(h.document.querySelector('.context-menu'), null);
                assert.equal(h.opened.length, 0); assert.equal(h.component.currentEditIndex, -1);
                assert.equal(h.component.confirmDialog, null); assert.equal(writes, 0);
                assert.equal(source.isConnected, false, 'open menus retain the original target-detachment path');
                assert.deepEqual(clone(h.component.links), links);
                nativeActivation(h.control(0, 'more'), 'Enter');
                nativeActivation(h.document.querySelector('.context-menu').querySelectorAll('.ctx-item')[0], 'Enter');
                assert.deepEqual(h.opened, [links[0].url]);
            }
        }
    }
});

test('old menu buttons cannot dismiss or activate a fresh session after grouped template round trips', () => {
    for (const entry of ['more', 'right-click']) for (const action of [0, 1, 2, 4]) {
        const h = page(); mountContextMenu(h);
        const old = openMenu(h, entry).querySelectorAll('.ctx-item')[action];
        switchTemplate(h, 'folio'); switchTemplate(h, 'graphite');
        const current = openMenu(h, 'more'), focus = h.document.activeElement;
        assert.equal(old.isConnected, false);
        old.dispatch('click');
        assert.equal(h.document.querySelector('.context-menu') === current, true);
        assert.equal(h.document.activeElement === focus, true);
        assert.equal(h.opened.length, 0); assert.equal(h.component.currentEditIndex, -1);
        assert.equal(h.component.confirmDialog, null); assert.deepEqual(clone(h.component.links), links);
        nativeActivation(current.querySelectorAll('.ctx-item')[0], 'Enter');
        assert.deepEqual(h.opened, [links[0].url]);
    }
});

test('grouped refresh retains the native drag source and pending optimistic reorder rebuilds', async () => {
    const h = page(), c = h.component;
    h.context.setTimeout = fn => { fn(); return 0; };
    const source = h.tile(0), target = h.tile(2);
    const dataTransfer = { setData() {} };
    h.control(0).dispatch('dragstart', { dataTransfer });
    target.dispatch('dragenter');
    assert.equal(source.classList.contains('dragging'), true);
    switchTemplate(h, 'folio');
    assert.equal(h.tile(0) === source, true); assert.equal(h.tile(2) === target, true);
    assert.equal(source.classList.contains('dragging'), true); assert.equal(c.draggedIndex, 0);
    c.handleDragEnd();
    assert.equal(source.classList.contains('dragging'), false);
    assert.equal(target.classList.contains('drag-over'), false); assert.equal(c.draggedIndex, null);

    const pending = deferred(); let writes = 0;
    h.storageManager.set = () => { writes++; return pending.promise; };
    h.control(0).dispatch('dragstart', { dataTransfer });
    const drop = c.handleDrop({ target, preventDefault() {} });
    assert.equal(c._shortcutWritesPending, 1);
    assert.deepEqual(Array.from(c.links, link => link.title), ['Social B', 'Work C', 'Work A', 'Orphan']);
    const build = count(h, 'buildShortcutsFragment');
    switchTemplate(h, 'graphite');
    assert.equal(build(), 1); assert.equal(source.isConnected, false);
    assert.deepEqual(order(h), [1, 2, 0, 3]);
    pending.resolve(true); await drop;
    assert.equal(writes, 1); assert.equal(c._shortcutWritesPending, 0); assert.equal(c.draggedIndex, null);
    assert.equal(c.canReuseCollections(), true);
});

test('empty grouped views reuse, while grouped/flat and grid/free transitions still rebuild and restore focus', () => {
    const empty = page([]), add = empty.add(), state = empty.grid.querySelector('.shortcuts-empty-state');
    add.focus(); switchTemplate(empty, 'folio');
    assert.equal(empty.add() === add, true); assert.equal(empty.grid.querySelector('.shortcuts-empty-state') === state, true);
    assert.equal(empty.document.activeElement === add, true);
    const h = page(), c = h.component, build = count(h, 'buildShortcutsFragment');
    h.control(1, 'more').focus();
    switchTemplate(h, 'clarity');
    assert.equal(build(), 1); assert.deepEqual(order(h), [0, 1, 2, 3]);
    assert.equal(h.document.activeElement === h.control(1, 'more'), true);
    switchTemplate(h, 'folio'); assert.equal(build(), 2);
    assert.equal(h.document.activeElement === h.control(1, 'more'), true);
    c.identityPositions = Object.fromEntries(c.links.map(link => [link.layoutId, { all: { x: 24, y: 48 } }]));
    const positions = clone(c.identityPositions);
    c.layout.autoArrange = false; c.applyLayoutMode({ persistMissing: false });
    assert.equal(build(), 3); assert.equal(h.grid.querySelector('.shortcut-collection'), null);
    const freeTiles = tiles(h); switchTemplate(h, 'graphite');
    assert.equal(build(), 3); sameNodes(tiles(h), freeTiles);
    assert.deepEqual(clone(c.identityPositions), positions);
    assert.equal(h.document.activeElement === h.control(1, 'more'), true);
    c.layout.autoArrange = true; c.applyLayoutMode();
    assert.equal(build(), 4); assert.equal(h.document.activeElement === h.control(1, 'more'), true);
    switchTemplate(h, 'folio'); assert.equal(build(), 4);
});
