const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createHarness } = require('./helpers/dashboard-harness');
const registry = require('../shared/dashboard-template-registry');
const clone = value => JSON.parse(JSON.stringify(value));

// DOM/geometry model: exercise the actual render/filter/placement entrypoints.
// Browser CSS painting is a separate native acceptance check.
for (const template of registry.ids) for (const alignToGrid of [false, true]) {
    for (const categoryEmpty of [false, true]) {
        const h = createHarness(categoryEmpty ? [
            { title: 'Synthetic work link', url: 'https://example.com/work', category: 'work' }
        ] : []);
        vm.runInContext(fs.readFileSync('shared/dashboard-template-registry.js', 'utf8'), h.context);
        h.document.documentElement.dataset.dashboardTemplate = template;
        h.context.window.categoryNavigation.currentCategory = categoryEmpty ? 'social' : 'all';
        h.component.layout = { autoArrange: false, alignToGrid, positions: {}, positionsById: {} };
        h.component.positions = {}; h.component.identityPositions = {};
        h.component.applyLayoutMode = h.context.ShortcutsComponent.prototype.applyLayoutMode;
        h.component.reflowVisibleLayout = h.context.ShortcutsComponent.prototype.reflowVisibleLayout;
        h.component.saveLayoutDebounced = () => assert.fail('Empty placement must not persist positions');
        h.component.updateGrid();
        const empty = h.grid.querySelector('.shortcuts-empty-state');
        assert.equal(Boolean(empty.hidden), false);
        const baseline = clone(h.component.layout);
        // Long translations and narrow canvases can grow the message beyond 320px.
        for (const height of [210, 410, 265]) {
            empty.rect = { left: 0, top: 24, width: 288, height };
            h.component.reflowVisibleLayout();
            assert.equal(h.add().style.top, `${24 + height + 16}px`, `${template}: Add follows ${categoryEmpty ? 'filtered' : 'global'} empty message`);
            assert.equal(h.grid.style.minHeight, `${Math.max(320, 24 + height + 16 + 80)}px`);
            h.component.refreshTemplate();
            assert.equal(h.add().style.top, `${24 + height + 16}px`, 'template refresh preserves separation');
            assert.deepEqual(clone(h.component.layout), baseline);
        }
        if (categoryEmpty) {
            // Returning to All must stop reserving the now-hidden empty message.
            h.component.positions['all|https://example.com/work'] = { x: 0, y: 0 };
            h.context.window.categoryNavigation.currentCategory = 'all';
            h.context.window.categoryNavigation.filterShortcuts();
            assert.equal(empty.hidden, true);
            assert.equal(h.add().style.top, '96px');
            h.context.window.categoryNavigation.currentCategory = 'social';
            h.context.window.categoryNavigation.filterShortcuts();
            assert.equal(empty.hidden, false);
            assert.equal(h.add().style.top, '305px');
        }
    }
}
console.log('Free-layout empty-state placement passed');
