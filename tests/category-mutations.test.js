const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createDashboard(save, category = 'work') {
    const grid = { items: [], replaceChildren(items) { this.items = items; } };
    const document = {
        addEventListener() {},
        getElementById(id) { return id === 'shortcuts-grid' ? grid : null; },
        querySelectorAll() { return grid.items; }
    };
    const context = {
        document, window: { addEventListener() {} },
        console: { log() {}, warn() {}, error() {} },
        storageManager: { defaultConfig: { layout: { columns: 6 } }, set: save },
        localStorage: { getItem() { return category; } }
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('newtab.js', 'utf8') + '\nthis.ShortcutsComponent = ShortcutsComponent; this.CategoryNavigation = CategoryNavigation; showErrorMessage = () => {};', context);
    const component = new context.ShortcutsComponent([
        { title: 'A', url: 'https://example.com/a', category: 'work' },
        { title: 'B', url: 'https://example.com/b', category: 'work' },
        { title: 'C', url: 'https://example.com/c', category: 'social' }
    ]);
    const navigation = Object.create(context.CategoryNavigation.prototype);
    navigation.currentCategory = category;
    context.window.shortcutsComponentInstance = component;
    context.window.categoryNavigation = navigation;
    const visible = () => grid.items.filter(item => item.style.display !== 'none').map(item => component.links[Number(item.dataset.index)].title);
    const layoutSnapshots = [];
    component.buildShortcutsFragment = () => component.links.map((_, index) => ({ dataset: { index: String(index) }, style: {} }));
    component.applyLayoutMode = () => { layoutSnapshots.push(visible()); };
    component.cleanupDragState = () => {};
    component.updateGrid();
    return { component, navigation, visible, layoutSnapshots };
}

(async () => {
    for (const outcome of ['success', 'false', 'throw']) {
        const save = async () => { if (outcome === 'throw') throw new Error('storage unavailable'); return outcome === 'success'; };
        for (const category of ['work', 'social', 'all', 'empty']) {
            const deleted = createDashboard(save, category);
            await deleted.component.deleteShortcut(0);
            const remaining = outcome === 'success' ? ['B'] : ['A', 'B'];
            const expected = category === 'work' ? remaining : category === 'social' ? ['C'] : category === 'all' ? [...remaining, 'C'] : [];
            assert.deepEqual(deleted.visible(), expected, `delete ${outcome}/${category}`);
            assert.deepEqual(deleted.layoutSnapshots.at(-1), expected, 'layout sees only filtered shortcuts');

            const reordered = createDashboard(save, category);
            reordered.component.draggedIndex = 0;
            await reordered.component.handleDrop({ preventDefault() {}, target: { closest() { return { dataset: { index: '1' } }; } } });
            const order = outcome === 'success' ? ['B', 'A'] : ['A', 'B'];
            const expectedOrder = category === 'work' ? order : category === 'social' ? ['C'] : category === 'all' ? [...order, 'C'] : [];
            assert.deepEqual(reordered.visible(), expectedOrder, `reorder ${outcome}/${category}`);
            assert.deepEqual(reordered.layoutSnapshots.at(-1), expectedOrder);
            assert.equal(reordered.component.draggedIndex, null);
        }
    }
    const lastInCategory = createDashboard(async () => true, 'social');
    await lastInCategory.component.deleteShortcut(2);
    assert.deepEqual(lastInCategory.visible(), []);
    assert.equal(lastInCategory.navigation.currentCategory, 'social');
    let reflows = 0;
    lastInCategory.component.reflowVisibleLayout = () => { reflows++; };
    lastInCategory.navigation.filterShortcuts();
    assert.equal(reflows, 1, 'normal category changes still reflow free layout');
    lastInCategory.component.updateGrid();
    assert.equal(reflows, 1, 'grid mutations do not perform an extra pre-layout reflow');
    console.log('category mutation tests ok (DOM model)');
})().catch(error => { console.error(error); process.exitCode = 1; });
