const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const registry = require('../shared/dashboard-template-registry');
const { createHarness, mountContextMenu, menuAction, nativeActivation, submit, deferred } = require('./helpers/dashboard-harness');
const clone = value => JSON.parse(JSON.stringify(value));
const menu = h => h.document.querySelector('.context-menu');
const items = h => menu(h)?.querySelectorAll('.ctx-item') || [];
const setup = links => { const h = createHarness(links); mountContextMenu(h); return h; };
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test('real rendered More is the single localized, native menu entrypoint in every template and placement', () => {
    for (const template of registry.ids) for (const autoArrange of [true, false]) for (const locale of ['en', 'zh_CN']) {
        const h = setup();
        h.context.window.LocalItabTemplates = registry;
        const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        h.context.window.i18n = h.context.i18n = { t: key => messages[key]?.message || '' };
        h.document.documentElement.dataset.dashboardTemplate = template;
        h.component.layout.autoArrange = autoArrange; h.component.updateGrid();
        const more = h.control(0, 'more');
        assert.equal(more.tagName, 'BUTTON'); assert.equal(more.type, 'button'); assert.equal(more.tabIndex, 0);
        assert.equal(more.draggable, false); assert.equal(more.getAttribute('aria-haspopup'), 'menu');
        assert.equal(more.getAttribute('aria-expanded'), 'false');
        assert.equal(more.getAttribute('aria-label'), `${messages.shortcutMoreActions.message}: ${h.component.links[0].title}`);
        assert.equal(h.tile(0).querySelectorAll('.shortcut-action-btn').length, 1);
        assert.equal(h.control(0).querySelector('button'), null);
        nativeActivation(more, 'Enter');
        assert.equal(h.opened.length, 0); assert.equal(items(h).length, 5);
        assert.equal(menu(h).getAttribute('role'), 'menu');
        assert.equal(menu(h).getAttribute('aria-label'), more.getAttribute('aria-label'));
        assert.equal(more.getAttribute('aria-controls'), menu(h).id); assert.equal(more.getAttribute('aria-expanded'), 'true');
        assert.equal(items(h)[3].disabled, true); assert.equal(items(h)[4].disabled, !autoArrange);
        items(h)[0].dispatch('keydown', { key: 'Escape' });
        assert.equal(h.document.activeElement === more, true); assert.equal(menu(h), null);
        assert.equal(more.getAttribute('aria-expanded'), 'false'); assert.equal(more.getAttribute('aria-controls'), undefined);
    }
});

test('native Enter and Space open once, with held/IME and repeated click suppression on both surfaces', () => {
    for (const key of ['Enter', ' ']) {
        for (const fields of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }]) {
            const h = setup(), more = h.control(0, 'more');
            const keydown = more.dispatch('keydown', { key, ...fields });
            assert.equal(keydown.prevented, true); assert.equal(menu(h), null);
            nativeActivation(more, key); const original = menu(h), first = items(h)[0];
            assert.equal(first.dispatch('keydown', { key, ...fields }).prevented, true);
            first.dispatch('click', fields); assert.equal(h.opened.length, 0); assert.equal(menu(h) === original, true);
            more.dispatch('click', fields); assert.equal(menu(h) === original, true);
            first.dispatch('keydown', { key: 'Escape', isComposing: true }); assert.equal(menu(h) === original, true);
            nativeActivation(first, key); assert.equal(h.opened.length, 1); assert.equal(menu(h), null);
        }
        const h = setup(); nativeActivation(h.control(0, 'more'), key);
        const original = menu(h); h.control(0, 'more').dispatch('click', { detail: 2 });
        assert.equal(menu(h) === original, true); items(h)[0].dispatch('click', { detail: 2 }); assert.equal(h.opened.length, 0);
    }
});

test('More never launches or enters native/free drag, including nested glyph hits', () => {
    const h = setup(), more = h.control(0, 'more');
    const glyph = h.document.createElement('span'); more.append(glyph);
    const event = glyph.dispatch('click'); assert.equal(event.stopped, true); assert.equal(h.opened.length, 0); assert(menu(h));
    items(h)[0].dispatch('keydown', { key: 'Escape' });
    const drag = glyph.dispatch('dragstart'); assert.equal(drag.prevented, true); assert.equal(h.component.draggedIndex, undefined);
    h.component.layout.autoArrange = false;
    h.component.onPointerDown({ target: glyph, button: 0, pointerId: 1, preventDefault() { throw new Error('More started free drag'); } });
    assert.equal(Boolean(h.component._cancelFreeDrag), false);
    h.component._suppressClickUntil = Date.now() + 1000; more.dispatch('click'); assert.equal(menu(h), null);
});

test('actual entrypoint refuses detached, hidden, disabled, replaced, mutated and wrong-grid rendered sources', () => {
    const changes = [
        h => h.tile(0).remove(), h => { h.tile(0).style.display = 'none'; },
        h => { h.control(0, 'more').disabled = true; }, h => { h.control(0, 'more').inert = true; },
        h => { h.control(0, 'more').style.visibility = 'hidden'; },
        h => { h.component.links.reverse(); }, h => { h.component.links[0] = { ...h.component.links[0] }; },
        h => { h.component.links[0].title = 'Replaced'; }, h => { h.component.links[0].icon = 'Different'; },
        h => { h.tile(0).dataset.index = '1'; }, h => { h.control(0, 'more').dataset.index = '1'; },
        h => { h.component.updateGrid(); }, h => { h.context.window.shortcutsComponentInstance = { ...h.component }; },
        h => { h.grid.id = 'retired-grid'; }, h => { h.component.gridEl = h.document.createElement('div'); }
    ];
    for (const change of changes) {
        const h = setup(), source = h.control(0, 'more'); change(h);
        source.dispatch('click'); assert.equal(menu(h), null, change.toString());
        assert.equal(h.component.openShortcutMenu(source), false); assert.equal(h.opened.length, 0);
    }
});

test('an open menu never retargets after a template, category, record or trigger changes', () => {
    for (const change of [
        h => { h.document.documentElement.dataset.dashboardTemplate = 'folio'; },
        h => { h.context.window.categoryNavigation.currentCategory = 'all'; },
        h => { h.context.window.categoryNavigation.categories[0].name = 'Changed'; },
        h => { h.component.links.reverse(); }, h => { h.component.links[0] = { ...h.component.links[0] }; },
        h => { h.component.links[0].title = 'Changed'; }, h => h.control(0, 'more').remove(), h => h.component.updateGrid()
    ]) {
        for (const actionIndex of [0, 1, 2, 4]) {
            const h = setup(); let mutations = 0;
            h.component.openShortcut = h.component.openEditModal = h.component.confirmDelete = h.component.moveShortcut = () => { mutations++; };
            nativeActivation(h.control(0, 'more'), 'Enter'); const old = items(h)[actionIndex]; change(h); old.dispatch('click');
            assert.equal(mutations, 0, change.toString()); assert.equal(menu(h), null);
        }
    }
});

test('outside pointer/focus dismissal never steals newer focus and stale buttons cannot retire a new session', () => {
    const h = setup(), more = h.control(0, 'more'); nativeActivation(more, 'Enter'); const stale = items(h)[0];
    h.document.listeners.get('pointerdown')({ target: h.search }); h.search.focus();
    assert.equal(menu(h), null); assert.equal(h.document.activeElement === h.search, true);
    assert.equal(more.getAttribute('aria-expanded'), 'false');
    nativeActivation(more, ' '); h.search.focus();
    assert.equal(menu(h), null); assert.equal(h.document.activeElement === h.search, true);
    nativeActivation(h.control(1, 'more'), 'Enter'); const current = menu(h), focus = h.document.activeElement;
    stale.dispatch('click'); assert.equal(menu(h) === current, true); assert.equal(h.document.activeElement === focus, true);
    assert.equal(h.control(1, 'more').getAttribute('aria-expanded'), 'true');
});

test('Tab/Shift+Tab retire the menu at its owned More trigger without trapping native traversal', () => {
    for (const shiftKey of [false, true]) {
        const h = setup(), more = h.control(0, 'more'); nativeActivation(more, 'Enter');
        const event = items(h)[0].dispatch('keydown', { key: 'Tab', shiftKey });
        assert.equal(event.prevented, false); assert.equal(menu(h), null); assert.equal(h.document.activeElement === more, true);
    }
});

test('real menu Edit preserves More focus through cancel and successful save', async () => {
    const h = setup(); menuAction(h, 1, 'edit');
    assert.equal(h.component.currentEditIndex, 1); h.component.hideModal();
    assert.equal(h.document.activeElement === h.control(1, 'more'), true);
    menuAction(h, 1, 'edit', ' '); h.component.modal.querySelector('#shortcut-title').value = 'Saved B';
    await submit(h.component);
    assert.equal(h.component.links[1].title, 'Saved B'); assert.equal(h.document.activeElement === h.control(1, 'more'), true);
    assert.equal(h.control(1, 'more').getAttribute('aria-label'), 'More actions: Saved B');
});

test('real menu Delete still requires confirmation and exposes existing undo after one saved deletion', async () => {
    const h = setup(), original = clone(h.component.links);
    menuAction(h, 0, 'delete'); assert.equal(h.component.links.length, 3);
    h.document.getElementById('confirm-cancel').dispatch('click');
    assert.equal(h.document.activeElement === h.control(0, 'more'), true); assert.equal(h.component.links.length, 3);
    menuAction(h, 0, 'delete', ' '); h.document.getElementById('confirm-delete').dispatch('click'); await tick();
    assert.equal(h.component.links.length, 2); assert.equal(h.component._shortcutUndoBar.hidden, false);
    assert.equal(h.document.activeElement === h.control(0), true);
    // The same undo controller remains the sole restore path.
    h.storageManager.undoShortcutDeletion = async () => ({ links: original, layout: { autoArrange: true, positions: {}, positionsById: {} } });
    assert.equal(await h.component.undoShortcutDeletion(), true); assert.deepEqual(clone(h.component.links), original);
});

test('real menu reordering follows More after save while preserving a newer focus owner', async () => {
    for (const newerFocus of [false, true]) {
        const h = setup(), saved = deferred(); h.storageManager.set = () => saved.promise;
        menuAction(h, 0, 'move_later'); assert.equal(h.component._shortcutOrderPending, true);
        if (newerFocus) h.search.focus();
        saved.resolve(true); await tick();
        assert.equal(h.component.links[1].title.startsWith('A'), true);
        assert.equal(h.document.activeElement === (newerFocus ? h.search : h.control(1, 'more')), true);
    }
});

test('CSS keeps More visible on narrow screens, inset focused and clear of compact and row content', () => {
    const base = fs.readFileSync('newtab.css', 'utf8'), css = fs.readFileSync('dashboard-templates.css', 'utf8');
    for (const [, selector, body] of base.matchAll(/([^{}]+)\{([^}]+)\}/g)) {
        if (selector.includes('.shortcut-actions') && !selector.includes('.add-shortcut')) assert.doesNotMatch(body, /display:\s*none/);
    }
    assert.match(css, /#dashboard \.shortcut-actions\s*\{\s*display: flex;\s*opacity: 1;/);
    assert.match(css, /\.shortcut-action-btn\.more\s*\{[^}]*flex: 0 0 26px;[^}]*background: var\(--template-surface\);/);
    assert.match(css, /\.shortcut-action-btn:focus-visible\s*\{\s*outline: 3px solid var\(--template-focus\);\s*outline-offset: -3px;/);
    assert.match(css, /\.shortcut-item:not\(\.add-shortcut\) \.shortcut-launch\s*\{\s*padding-block-start: 20px;/);
    const rowRules = css.slice(css.indexOf('/* Collection rows'));
    for (const template of ['graphite', 'folio', 'console', 'library', 'ledger', 'terrace', 'column', 'horizon']) {
        assert(rowRules.includes(`[data-dashboard-template="${template}"]`));
    }
    assert.match(rowRules, /padding-inline-end: 34px;/);
    assert.match(rowRules, /top: 50%;\s*right: 4px;\s*transform: translateY\(-50%\);/);
    // This is source-level coverage, not a screenshot or native keyboard claim.
    assert.doesNotMatch(rowRules, /(?:left|width|height):|positionsById/);
});
