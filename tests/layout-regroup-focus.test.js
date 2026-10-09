const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const registry = require('../shared/dashboard-template-registry');
const { createHarness } = require('./helpers/dashboard-harness');
const clone = value => JSON.parse(JSON.stringify(value));
const links = [
    { title: 'Work A', url: 'https://example.com/a', category: 'work' },
    { title: 'Social B', url: 'https://example.com/b', category: 'social' },
    { title: 'Work C', url: 'https://example.com/c', category: 'work' }
];

function page(template, width = 288) {
    const h = createHarness(links);
    vm.runInContext(fs.readFileSync('shared/dashboard-template-registry.js', 'utf8'), h.context);
    h.document.documentElement.dataset.dashboardTemplate = template;
    h.context.window.categoryNavigation.currentCategory = 'all';
    h.component.applyLayoutMode = h.context.ShortcutsComponent.prototype.applyLayoutMode;
    h.grid.rect.width = width;
    h.component.positions = Object.fromEntries(h.component.links.map((link, index) =>
        [h.component.getPositionKey(link), { x: 37.25 + index * 400, y: 53.75 + index * 100 }]));
    h.component.layout.positions = h.component.positions;
    h.component.saveLayoutDebounced = () => assert.fail('Regrouping must not write existing positions');
    h.component.updateGrid();
    return h;
}
function placement(h, autoArrange, alignToGrid = false) {
    h.component.layout.autoArrange = autoArrange;
    h.component.layout.alignToGrid = alignToGrid;
    h.component.applyLayoutMode();
}

// DOM/layout model, not a claim of native focus painting or CSS viewport testing.
// Settings/another tab can change placement while this page owns shortcut focus.
for (const template of registry.ids) {
    for (const width of [240, 640, 1200]) {
        const h = page(template, width), positions = clone(h.component.positions);
        for (const action of ['open', 'more', 'add']) {
            const target = () => action === 'add' ? h.add() : h.control(1, action);
            target().focus();
            for (const [auto, snap] of [[false, false], [true, false], [false, true], [true, true]]) {
                placement(h, auto, snap);
                assert.equal(h.document.activeElement === target(), true, `${template}: ${action} focus after placement change`);
                assert.deepEqual(clone(h.component.positions), positions);
                if (!auto) {
                    assert.equal(h.grid.querySelector('.shortcut-collection'), null);
                    assert.equal(h.tile(1).style.left, `${Math.min(437.25, width - 80)}px`);
                }
            }
        }
        h.search.focus();
        for (const auto of [false, true]) {
            placement(h, auto);
            assert.equal(h.document.activeElement === h.search, true, `${template}: outside focus is not stolen`);
        }
    }
}

// Existing template switching must preserve the same logical control as grouping changes.
{
    const h = page('clarity');
    h.control(1, 'more').focus();
    for (const template of [...registry.ids, ...registry.ids.slice().reverse()]) {
        h.document.documentElement.dataset.dashboardTemplate = template;
        h.component.refreshTemplate();
        assert.equal(h.document.activeElement === h.control(1, 'more'), true, `${template}: template switch retains focus`);
    }
}

// Free placement keeps one plane and its exact saved points through every style.
// Fitting a narrow canvas is display-only; widening restores the saved x.
{
    const h = page('clarity', 240), positions = clone(h.component.positions);
    placement(h, false);
    h.control(1, 'more').focus();
    for (const template of registry.ids) {
        h.document.documentElement.dataset.dashboardTemplate = template;
        h.component.refreshTemplate();
        assert.equal(h.document.activeElement === h.control(1, 'more'), true);
        assert.equal(h.grid.querySelector('.shortcut-collection'), null);
        assert.equal(h.tile(1).style.left, '160px');
        assert.deepEqual(clone(h.component.positions), positions);
    }
    h.grid.rect.width = 1200;
    h.component.refreshTemplate();
    assert.equal(h.tile(1).style.left, '437.25px');
    assert.deepEqual(clone(h.component.positions), positions);
}

// Reuse the established primary-control fallback when the old shortcut disappeared.
for (const template of registry.ids.filter(id => registry.usesCollections(id))) {
    const h = page(template);
    h.control(1, 'more').focus();
    h.component.links.splice(1, 1);
    placement(h, false);
    assert.equal(h.document.activeElement === h.control(1), true, `${template}: removed target falls back to remaining primary`);
    h.control(0).focus();
    h.component.links = [];
    placement(h, true);
    assert.equal(h.document.activeElement === h.add(), true, `${template}: no shortcuts falls back to Add`);
}

// Identity recovery takes an early return before attaching dragging. It must also
// restore focus, without triggering an automatic retry from an error repaint.
{
    const h = page('graphite');
    h.control(0, 'more').focus();
    h.context.window.LocalItabIdentity = { needs: () => true };
    h.component.ensureLayoutController = () => ({ change: () => assert.fail('Error repaint must not retry identity migration') });
    h.component.layout.autoArrange = false;
    h.component.applyLayoutMode({ persistMissing: false });
    assert.equal(h.document.activeElement === h.control(0, 'more'), true);
    assert.equal(h.component._freeDragAttached, undefined);
}
console.log('layout regroup focus tests ok (15 templates, 3 modeled widths, placement/template transitions and fallbacks)');
