const assert = require('node:assert/strict');
const fs = require('node:fs');
const { menuAction, createHarness, nativeActivation, submit, deferred } = require('./helpers/dashboard-harness');
const links = [
    { title: 'Work A', url: 'https://example.com/a', icon: 'A', category: 'work' },
    { title: 'Social C', url: 'https://example.com/c', icon: 'C', category: 'social' },
    { title: 'Work B', url: 'https://example.com/b', icon: 'B', category: 'work' }
];
const order = h => h.grid.querySelectorAll('.shortcut-item:not(.add-shortcut)').map(item => Number(item.dataset.index));
const json = value => JSON.parse(JSON.stringify(value));
// Defaults resolve on the dashboard/surface rather than an adaptive root alias;
// user-supplied inline title colors keep their normal higher precedence.
const templateCss = fs.readFileSync('dashboard-templates.css', 'utf8');
assert.match(templateCss, /--shortcut-title-color: var\(--template-text\)/);
assert.match(templateCss, /#shortcuts-grid\.free-layout > \.shortcut-item\s*\{[^}]*background: var\(--glass-bg\)/);
assert.match(templateCss, /body:is\(\.bg-color, \.bg-image\) #shortcuts-grid > \.add-shortcut\s*\{\s*background: var\(--template-surface\)/);
const paletteCss = fs.readFileSync('appearance.css', 'utf8');
assert.match(paletteCss, /color-scheme: light;\s*--overlay-color: rgba\(245, 247, 247, \.88\)/);
assert.match(paletteCss, /color-scheme: dark;\s*--overlay-color: rgba\(16, 19, 20, \.85\)/);


// Source/token regression only; actual native popup painting has a separate
// browser check because operating-system menus are not represented by this DOM.
assert.match(paletteCss, /:root\[data-dashboard-template\] select\s*\{\s*color-scheme: inherit;\s*color: var\(--template-text\);\s*background-color: var\(--template-surface\);/);
assert.match(paletteCss, /:root\[data-dashboard-template\] select :is\(option, optgroup\)\s*\{\s*color: var\(--template-text\);\s*background-color: var\(--template-surface\);/);
const luminance = hex => hex.match(/[a-f0-9]{2}/gi).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
const paletteRules = [...paletteCss.matchAll(/:root\[data-dashboard-template[^{}]+\{([^}]+)\}/g)]
    .filter(match => match[1].includes('--template-text:') && match[1].includes('--template-surface:'));
assert.equal(paletteRules.length, 6);
for (const [, body] of paletteRules) {
    const foreground = luminance(body.match(/--template-text: (#[a-f0-9]+);/i)[1]);
    const background = luminance(body.match(/--template-surface: (#[a-f0-9]+);/i)[1]);
    assert((Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) >= 4.5);
}


// Back navigation belongs to normal header flow at every viewport. Keep the
// existing padded header instead of putting an absolute control over its title.
const optionsCss = fs.readFileSync('options.css', 'utf8');
const headerTopRule = optionsCss.match(/\.header-top\s*\{([^}]+)\}/)[1];
assert.match(headerTopRule, /position: relative;/);
assert.match(headerTopRule, /margin-bottom: var\(--spacing-md\);/);
assert.doesNotMatch(headerTopRule, /(?:top|left):/);
for (const [, body] of optionsCss.matchAll(/\.options-header\s*\{([^}]+)\}/g)) {
    assert.doesNotMatch(body, /padding-top: 0(?:px)?;/);
}


(async () => {
    const h = createHarness(links);
    h.component.categories = [{ id: 'work', name: 'Work' }, { id: 'social', name: 'Social' }, { id: 'empty', name: 'Empty' }];
    const nav = h.context.window.categoryNavigation;
    nav.categories = h.component.categories;
    nav.currentCategory = 'all';
    let writes = 0;
    h.storageManager.set = async () => { writes++; return true; };
    const original = json(h.component.links);
    for (const template of ['graphite', 'folio', 'clarity', 'graphite']) {
        h.document.documentElement.dataset.dashboardTemplate = template;
        h.component.refreshTemplate();
        assert.deepEqual(order(h), template === 'clarity' ? [0, 1, 2] : [0, 2, 1]);
        assert.deepEqual(json(h.component.links), original);
        assert.equal(writes, 0, 'presentation never saves link order');
        nativeActivation(h.control(1), 'Enter');
        assert.equal(h.opened.at(-1), links[1].url);
    }
    const groups = h.grid.querySelectorAll('.shortcut-collection');
    assert.deepEqual(groups.map(group => group.querySelector('.collection-count').textContent), ['2', '1']);
    nav.selectCategory('social');
    assert.equal(groups[0].hidden, true); assert.equal(groups[1].hidden, false);
    assert.equal(h.control(0).getClientRects().length, 0);
    menuAction(h, 1, 'edit');
    assert.equal(h.component.currentEditIndex, 1);
    h.component.modal.querySelector('#shortcut-icon').value = 'Changed C';
    await submit(h.component);
    assert.equal(h.component.links[1].icon, 'Changed C');
    assert.equal(h.component.links[2].icon, 'B');
    nav.selectCategory('empty');
    assert.equal(h.grid.querySelector('.category-empty-state').hidden, false);
    assert(h.grid.querySelectorAll('.shortcut-collection').every(group => group.hidden));
    assert(h.add().getClientRects().length);
    nativeActivation(h.grid.querySelector('[data-action="show-all"]'), 'Enter');
    assert.equal(nav.currentCategory, 'all');
    assert.equal(h.grid.querySelector('.category-empty-state').hidden, true);

    // Group rebuilds retain editor drafts and native focus; original data-index survives.
    menuAction(h, 2, 'edit');
    const input = h.component.modal.querySelector('#shortcut-title'); input.value = 'Unsaved B draft';
    const overlay = h.component.modal;
    h.document.documentElement.dataset.dashboardTemplate = 'folio'; h.component.refreshTemplate();
    assert.equal(h.component.modal, overlay); assert.equal(input.value, 'Unsaved B draft');
    assert.equal(h.document.activeElement, input); assert.equal(h.component.currentEditIndex, 2);
    h.component.hideModal();
    assert.equal(h.document.activeElement, h.control(2, 'more'));

    const saving = deferred();
    h.storageManager.set = () => saving.promise;
    menuAction(h, 2, 'edit'); input.value = 'Saved B';
    const pending = submit(h.component);
    h.document.documentElement.dataset.dashboardTemplate = 'clarity'; h.component.refreshTemplate();
    saving.resolve(true); await pending;
    assert.equal(h.component.links[2].title, 'Saved B'); assert.equal(h.component.links[1].title, 'Social C');
    assert.equal(h.document.activeElement, h.control(2, 'more'));

    // Real layout routines flatten grouping, resolve explicit indices, and never
    // write positions merely because a template or viewport changes.
    h.component.applyLayoutMode = h.context.ShortcutsComponent.prototype.applyLayoutMode;
    h.component.layout.autoArrange = false;
    h.component.layout.alignToGrid = false;
    h.component.positions = {
        [h.component.getPositionKey(h.component.links[0])]: { x: 37, y: 53 },
        [h.component.getPositionKey(h.component.links[1])]: { x: 800, y: 140 },
        [h.component.getPositionKey(h.component.links[2])]: { x: 150, y: 260 }
    };
    const positions = json(h.component.positions);
    h.component.layout.positions = h.component.positions;
    h.storageManager.set = async () => { throw new Error('Template must not save a layout'); };
    h.component.updateGrid();
    assert.equal(h.grid.querySelector('.shortcut-collection'), null);
    let cancelled = 0;
    for (const template of ['graphite', 'folio', 'clarity']) {
        h.component._cancelFreeDrag = () => { cancelled++; h.component._cancelFreeDrag = null; };
        h.document.documentElement.dataset.dashboardTemplate = template;
        h.component.refreshTemplate();
        assert.deepEqual(json(h.component.positions), positions);
        assert.deepEqual(order(h), [0, 1, 2]);
        assert.equal(h.tile(0).style.left, '37px');
        assert.equal(h.tile(1).style.left, '208px', 'display fits narrow canvas, saved x remains 800');
        assert.equal(h.tile(2).style.top, '260px');
    }
    assert.equal(cancelled, 3);
    h.grid.rect.width = 1000; h.component.refreshTemplate();
    assert.equal(h.tile(1).style.left, '800px', 'wider canvas restores original coordinate');
    assert.deepEqual(json(h.component.positions), positions);
    h.component.layout.autoArrange = true;
    h.document.documentElement.dataset.dashboardTemplate = 'folio';
    h.component.applyLayoutMode();
    assert.equal(h.grid.querySelectorAll('.shortcut-collection').length, 2);
    assert.deepEqual(order(h), [0, 2, 1]);
    assert.deepEqual(json(h.component.positions), positions);

    // An orphan saved category is still shown honestly, not dropped or reassigned.
    const orphan = createHarness([{ title: 'Orphan', url: 'https://example.com/', category: 'custom <name>' }]);
    orphan.context.window.categoryNavigation.currentCategory = 'all';
    orphan.document.documentElement.dataset.dashboardTemplate = 'folio'; orphan.component.refreshTemplate();
    assert.equal(orphan.grid.querySelector('.shortcut-collection').querySelector('h3').textContent, 'custom <name>');
    assert.equal(orphan.component.links[0].category, 'custom <name>');
    console.log('template rendering tests ok (DOM/layout model)');
})().catch(error => { console.error(error); process.exitCode = 1; });
