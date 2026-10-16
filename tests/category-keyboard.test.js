'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument, nativeActivation } = require('./helpers/dashboard-harness');

// Production category rendering and handlers in the existing DOM/event model.
// This does not simulate Chrome layout, native key dispatch or screen readers.
function harness(count = 4) {
    const document = createDocument();
    const list = document.createElement('div'); list.id = 'category-list';
    const search = document.createElement('input'); search.value = 'Unsubmitted search';
    const grid = document.createElement('div'); grid.id = 'shortcuts-grid';
    document.body.append(search, list, grid);
    const writes = [], reflows = [];
    const links = Array.from({ length: count }, (_, index) => ({ category: `group-${index}` }));
    for (let index = 0; index < links.length; index++) {
        const tile = document.createElement('div'); tile.className = 'shortcut-item'; tile.dataset.index = String(index);
        grid.append(tile);
    }
    const window = {
        addEventListener() {},
        getComputedStyle: element => ({
            flexDirection: element.style.flexDirection || 'row',
            direction: element.style.direction || 'ltr',
            visibility: element.style.visibility || 'visible'
        }),
        shortcutsComponentInstance: { links, reflowVisibleLayout: () => reflows.push('reflow') }
    };
    const context = {
        window, document, console, setTimeout() {},
        localStorage: { setItem: (...args) => writes.push(args) }
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('newtab.js', 'utf8') + '\nthis.CategoryNavigation = CategoryNavigation;', context);
    const navigation = Object.create(context.CategoryNavigation.prototype);
    navigation.storageKey = 'currentCategory'; navigation.currentCategory = 'all';
    navigation.categories = links.map((link, index) => ({ id: link.category, name: `Category ${index}`, icon: '●' }));
    window.categoryNavigation = navigation;
    navigation.render(); reflows.length = 0;
    const buttons = () => list.querySelectorAll('.category-item');
    const focusedIndex = () => buttons().indexOf(document.activeElement);
    const key = (value, fields = {}) => document.activeElement.dispatch('keydown', { key: value, ...fields });
    const visible = () => grid.children.filter(tile => tile.style.display !== 'none').map(tile => tile.dataset.index);
    return { document, list, search, grid, writes, reflows, window, navigation, buttons, focusedIndex, key, visible };
}

test('horizontal arrows wrap category focus without selecting or rebuilding shortcuts', () => {
    const h = harness(); const tiles = [...h.grid.children];
    h.buttons()[0].focus();
    for (let index = 1; index <= 5; index++) {
        const event = h.key('ArrowRight');
        assert(event.prevented); assert(event.stopped); assert.equal(h.focusedIndex(), index % 5);
    }
    assert(h.key('ArrowLeft').prevented); assert.equal(h.focusedIndex(), 4);
    assert.equal(h.navigation.currentCategory, 'all');
    assert.deepEqual(h.writes, []); assert.deepEqual(h.reflows, []);
    assert.deepEqual(h.grid.children, tiles); assert.deepEqual(h.visible(), ['0', '1', '2', '3']);
    assert(h.buttons().every(button => button.tabIndex === 0), 'ordinary Tab traversal stays intact');
    assert.equal(h.buttons()[0].getAttribute('aria-current'), 'page');
    assert.equal(h.search.value, 'Unsubmitted search');
});

test('current computed flex direction controls arrows after responsive/template changes', () => {
    const h = harness(); h.list.style.flexDirection = 'column'; h.buttons()[0].focus();
    assert.equal(h.key('ArrowRight').prevented, false); assert.equal(h.focusedIndex(), 0);
    assert(h.key('ArrowDown').prevented); assert.equal(h.focusedIndex(), 1);
    assert(h.key('ArrowUp').prevented); assert.equal(h.focusedIndex(), 0);
    assert(h.key('ArrowUp').prevented); assert.equal(h.focusedIndex(), 4);
    h.list.style.flexDirection = 'row';
    assert.equal(h.key('ArrowDown').prevented, false); assert.equal(h.focusedIndex(), 4);
    assert(h.key('ArrowRight').prevented); assert.equal(h.focusedIndex(), 0);
});

test('Home and End reach visible endpoints and do not activate them', () => {
    const h = harness(); h.buttons()[2].focus();
    assert(h.key('End').prevented); assert.equal(h.focusedIndex(), 4);
    assert(h.key('Home').prevented); assert.equal(h.focusedIndex(), 0);
    h.list.style.flexDirection = 'column';
    assert(h.key('End').prevented); assert.equal(h.focusedIndex(), 4);
    assert.deepEqual(h.writes, []);
});

test('navigation skips disabled, hidden, inert and non-visible category controls', () => {
    const h = harness(8); const buttons = h.buttons();
    buttons[1].disabled = true;
    buttons[2].style.display = 'none';
    buttons[3].setAttribute('hidden', ''); buttons[3].hidden = true;
    buttons[4].inert = true;
    buttons[5].style.visibility = 'hidden';
    buttons[6].style.visibility = 'collapse';
    buttons[8].disabled = true;
    buttons[0].focus();
    assert(h.key('ArrowRight').prevented); assert.equal(h.focusedIndex(), 7);
    assert(h.key('ArrowRight').prevented); assert.equal(h.focusedIndex(), 0);
    assert(h.key('End').prevented); assert.equal(h.focusedIndex(), 7);
    assert(h.key('Home').prevented); assert.equal(h.focusedIndex(), 0);
});

test('native activation alone selects a focused category and preserves filtering', () => {
    const h = harness(); h.buttons()[0].focus();
    h.key('ArrowRight'); h.key('ArrowRight');
    assert.equal(h.focusedIndex(), 2); assert.equal(h.navigation.currentCategory, 'all');
    assert.equal(nativeActivation(h.document.activeElement, 'Enter').prevented, false);
    assert.equal(h.navigation.currentCategory, 'group-1'); assert.deepEqual(h.visible(), ['1']);
    assert.deepEqual(h.writes, [['currentCategory', 'group-1']]);
    assert.equal(h.buttons()[2].getAttribute('aria-current'), 'page');
    h.key('ArrowRight');
    assert.deepEqual(h.visible(), ['1']);
    assert.equal(nativeActivation(h.document.activeElement, ' ').prevented, false);
    assert.equal(h.navigation.currentCategory, 'group-2'); assert.deepEqual(h.visible(), ['2']);
    assert.deepEqual(h.writes, [['currentCategory', 'group-1'], ['currentCategory', 'group-2']]);
});

test('modified, composing, cancelled and unrelated keys keep browser behavior', () => {
    const h = harness(); h.buttons()[1].focus();
    for (const fields of [
        { altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true },
        { isComposing: true }, { keyCode: 229 }, { defaultPrevented: true }
    ]) {
        assert.equal(h.key('ArrowRight', fields).prevented, false); assert.equal(h.focusedIndex(), 1);
        assert.equal(h.key('End', fields).prevented, false); assert.equal(h.focusedIndex(), 1);
    }
    for (const key of ['Tab', 'Enter', ' ', 'Escape', 'ArrowDown', 'ArrowUp', 'a', 'Delete']) {
        assert.equal(h.key(key).prevented, false); assert.equal(h.focusedIndex(), 1);
    }
    assert(h.key('ArrowRight', { repeat: true }).prevented); assert.equal(h.focusedIndex(), 2);
    assert.deepEqual(h.writes, []);
});

test('descendant editing controls and labels cannot route category navigation', () => {
    const h = harness(); const button = h.buttons()[1]; button.focus();
    const input = h.document.createElement('input'); button.append(input); input.value = 'Draft'; input.focus();
    assert.equal(input.dispatch('keydown', { key: 'Home' }).prevented, false);
    assert.equal(h.document.activeElement, input); assert.equal(input.value, 'Draft');
    button.focus();
    assert.equal(button.querySelector('.category-name').dispatch('keydown', { key: 'End' }).prevented, false);
    assert.equal(h.document.activeElement, button);
});

test('old, disconnected and foreign category buttons cannot move newer focus', () => {
    const h = harness(); const old = h.buttons()[1]; old.focus(); h.navigation.render();
    h.buttons()[1].focus();
    assert.equal(old.dispatch('keydown', { key: 'End' }).prevented, false); assert.equal(h.focusedIndex(), 1);
    const current = h.buttons()[1]; h.search.focus();
    assert.equal(current.dispatch('keydown', { key: 'End' }).prevented, false);
    assert.equal(h.document.activeElement, h.search);
    const foreign = h.navigation.createNavItem({ id: 'outside', name: 'Outside' });
    h.document.body.append(foreign); foreign.focus();
    assert.equal(foreign.dispatch('keydown', { key: 'End' }).prevented, false);
    assert.equal(h.document.activeElement, foreign);
    current.focus(); h.list.remove();
    assert.equal(current.dispatch('keydown', { key: 'End' }).prevented, false);
});

test('inert or hidden navigation cannot steal focus from a dialog', () => {
    for (const hidden of ['inert', 'hidden', 'display', 'visibility']) {
        const h = harness(); h.buttons()[1].focus();
        if (hidden === 'inert') h.list.inert = true;
        else if (hidden === 'hidden') { h.list.setAttribute('hidden', ''); h.list.hidden = true; }
        else if (hidden === 'display') h.list.style.display = 'none';
        else h.buttons()[1].style.visibility = 'hidden';
        assert.equal(h.key('End').prevented, false); assert.equal(h.focusedIndex(), 1);
    }
});

test('horizontal direction respects RTL and reverse rows, vertical direction respects reverse columns', () => {
    for (const [flexDirection, direction, forward, backward] of [
        ['row', 'ltr', 'ArrowRight', 'ArrowLeft'],
        ['row', 'rtl', 'ArrowLeft', 'ArrowRight'],
        ['row-reverse', 'ltr', 'ArrowLeft', 'ArrowRight'],
        ['row-reverse', 'rtl', 'ArrowRight', 'ArrowLeft'],
        ['column', 'rtl', 'ArrowDown', 'ArrowUp'],
        ['column-reverse', 'ltr', 'ArrowUp', 'ArrowDown']
    ]) {
        const h = harness(); h.list.style.flexDirection = flexDirection; h.list.style.direction = direction;
        h.buttons()[0].focus();
        assert(h.key(forward).prevented, `${flexDirection}/${direction}`); assert.equal(h.focusedIndex(), 1);
        assert(h.key(backward).prevented); assert.equal(h.focusedIndex(), 0);
        assert(h.key('End').prevented); assert.equal(h.focusedIndex(), 4);
        assert(h.key('Home').prevented); assert.equal(h.focusedIndex(), 0);
    }
});

test('a single eligible category remains usable and all-unavailable states are inert', () => {
    const h = harness(0); h.buttons()[0].focus();
    for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
        assert(h.key(key).prevented); assert.equal(h.focusedIndex(), 0);
    }
    h.buttons()[0].disabled = true;
    assert.equal(h.key('End').prevented, false); assert.deepEqual(h.writes, []);
});

test('newly rendered categories navigate once without keeping old listeners or stale order', () => {
    const h = harness(); const old = h.buttons();
    h.navigation.categories.reverse(); h.navigation.render(); h.navigation.render();
    h.buttons()[0].focus(); h.key('ArrowRight');
    assert.equal(h.focusedIndex(), 1); assert.equal(h.document.activeElement.dataset.category, 'group-3');
    assert.equal(h.document.activeElement.listeners.get('keydown').length, 1);
    assert(old.every(button => !button.isConnected)); assert.deepEqual(h.writes, []);
});
