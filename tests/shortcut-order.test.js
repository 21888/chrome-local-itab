const assert = require('node:assert/strict');
const { menuAction, createHarness, deferred, nativeActivation } = require('./helpers/dashboard-harness');
const clone = value => JSON.parse(JSON.stringify(value));
const links = ['A', 'Hidden', 'B', 'C'].map((title, index) => ({ title, url: `https://example.com/${title}`, category: index === 1 ? 'social' : 'work', layoutId: `id-${index}` }));
(async () => {
    {
        const h = createHarness(links); const writes = [];
        h.storageManager.set = async (...args) => { writes.push(clone(args)); return true; };
        h.component.identityPositions = { 'id-0': { all: { x: 83, y: 54 } } };
        const positions = clone(h.component.identityPositions);
        assert.equal(h.component.getShortcutOrderTarget(0, -1), -1);
        assert.equal(h.component.getShortcutOrderTarget(0, 1), 2);
        assert.equal(h.component.getShortcutOrderTarget(1, 1), -1, 'hidden origin is refused');
        h.control(0).focus(); assert.equal(await h.component.moveShortcut(0, 1), true);
        assert.deepEqual(clone(h.component.links).map(x => x.title), ['Hidden', 'B', 'A', 'C']);
        assert.equal(h.document.activeElement, h.control(2));
        assert.deepEqual(writes[0][2].operation, { type: 'reorder', from: 0, to: 2 });
        assert.deepEqual(writes[0][2].expectedLinks, links);
        assert.deepEqual(clone(h.component.identityPositions), positions);
        assert.equal(h.component.links[2].layoutId, 'id-0');
        assert.equal(await h.component.moveShortcut(3, 1), false); assert.equal(writes.length, 1);
    }
    {
        const h = createHarness(links); h.context.window.categoryNavigation.currentCategory = 'all';
        assert.equal(h.component.getShortcutOrderTarget(0, 1), 1);
        h.component.usesCollections = () => true;
        assert.equal(h.component.getShortcutOrderTarget(0, 1), 2);
        assert.equal(h.component.getShortcutOrderTarget(1, 1), -1, 'single-item collection has no move');
        for (const key of ['_shortcutOrderPending', '_isSaving']) { h.component[key] = true; assert.equal(h.component.getShortcutOrderTarget(0, 1), -1); h.component[key] = false; }
        h.component.layoutController = { modePending: true }; assert.equal(await h.component.moveShortcut(0, 1), false);
        h.component.layoutController = null;
        h.component.layout.autoArrange = false; assert.equal(await h.component.moveShortcut(0, 1), false);
        assert.equal(h.component.getShortcutOrderTarget(0, 0), -1); assert.equal(h.component.getShortcutOrderTarget(0.5, 1), -1);
    }
    for (const destination of ['same', 'search', 'editor']) {
        const h = createHarness(links); const pending = deferred(); let writes = 0;
        h.storageManager.set = () => { writes++; return pending.promise; };
        h.control(0).focus(); const move = h.component.moveShortcut(0, 1);
        assert.equal(await h.component.moveShortcut(0, 1), false); assert.equal(writes, 1);
        let prevented = false; h.component.handleDragStart({ preventDefault() { prevented = true; } }); assert(prevented);
        if (destination === 'search') h.search.focus();
        if (destination === 'editor') { nativeActivation(h.add(), 'Enter'); h.component.modal.querySelector('#shortcut-title').value = 'Keep draft'; }
        const focus = h.document.activeElement; pending.resolve(true); await move;
        assert.equal(h.document.activeElement, destination === 'same' ? h.control(2) : focus);
        if (destination === 'editor') assert.equal(focus.value, 'Keep draft');
        assert.equal(h.component._shortcutOrderPending, false);
    }
    for (const [from, direction, editing, expected] of [[0, 1, 0, 2], [0, 1, 2, 1], [2, -1, 0, 1], [2, -1, 2, 0]]) {
        const h = createHarness(links); const pending = deferred(); let writes = 0;
        h.storageManager.set = () => { writes++; return pending.promise; };
        h.control(from).focus(); const move = h.component.moveShortcut(from, direction);
        menuAction(h, editing, 'edit');
        const input = h.component.modal.querySelector('#shortcut-title'); input.value = 'Draft survives';
        assert.equal(h.component.modal.querySelector('#save-btn').disabled, true);
        await h.component.handleFormSubmit({ preventDefault() {} }); assert.equal(writes, 1);
        pending.resolve(true); await move;
        assert.equal(h.component.currentEditIndex, expected); assert.equal(input.value, 'Draft survives');
        assert.equal(h.component.modal.querySelector('#save-btn').disabled, false);
        assert.equal(h.component.links[expected].layoutId, links[editing].layoutId);
    }
    for (const ids of [true, false]) for (const draft of ['edit', 'add']) {
        for (const [from, direction, opener, expected] of [[0, 1, 0, 1], [0, 1, 1, 0], [1, -1, 0, 1], [1, -1, 1, 0]]) {
            const twins = [0, 1].map(index => ({ title: 'Twin', url: 'https://example.com', category: 'work', ...(ids ? { layoutId: `twin-${index}` } : {}) }));
            const h = createHarness(twins); const pending = deferred(); h.storageManager.set = () => pending.promise;
            h.control(from).focus(); const move = h.component.moveShortcut(from, direction);
            h.control(opener, 'more').focus();
            if (draft === 'edit') h.component.openEditModal(opener); else h.component.openAddModal();
            pending.resolve(true); await move;
            assert.equal(h.component._modalFocusOrigin.index, expected);
            assert.equal(h.component.currentEditIndex, draft === 'edit' ? expected : -1);
            h.component.hideModal();
            assert.equal(h.document.activeElement, h.control(expected, 'more'), 'closing a pending draft returns to the exact opener twin');
        }
    }
    for (const ids of [true, false]) for (const action of ['open', 'more']) {
        const twins = [0, 1, 2].map(index => ({ title: 'Twin', url: 'https://example.com', category: 'work', ...(ids ? { layoutId: `twin-${index}` } : {}) }));
        const h = createHarness(twins); const pending = deferred(); h.storageManager.set = () => pending.promise;
        h.control(0).focus(); const move = h.component.moveShortcut(0, 1);
        h.control(1, action).focus(); pending.resolve(true); await move;
        assert.equal(h.document.activeElement, h.control(0, action), 'newer focus stays on its exact twin after reorder');
    }
    {
        const h = createHarness(links); const pending = deferred(); let writes = 0;
        h.storageManager.set = () => { writes++; return pending.promise; };
        const move = h.component.moveShortcut(0, 1);
        assert.equal(await h.component.deleteShortcut(0), false);
        assert.equal(h.component.confirmDelete(0), false);
        assert.deepEqual(clone(h.component.links), links); assert.equal(writes, 1);
        h.component.openEditModal(0); pending.resolve(true); await move;
        assert.equal(h.component.currentEditIndex, 2); assert.equal(h.component.links[2].layoutId, links[0].layoutId);
    }
    {
        const h = createHarness(links); const pending = deferred(); let writes = 0;
        h.storageManager.set = () => { writes++; return pending.promise; };
        const deletion = h.component.deleteShortcut(0);
        assert.equal(await h.component.moveShortcut(1, 1), false, 'a pending earlier mutation blocks ordering');
        assert.equal(writes, 1); pending.resolve(true); await deletion;
        assert.equal(h.component._shortcutWritesPending, 0);
    }
    for (const draft of ['add', 'edit']) {
        const h = createHarness(links); const pending = deferred(); h.storageManager.set = () => pending.promise;
        const move = h.component.moveShortcut(0, 1);
        if (draft === 'add') h.component.openAddModal(); else h.component.openEditModal(0);
        assert.equal(h.component._isSaving, true); h.component.hideModal();
        pending.resolve(true); await move;
        assert.equal(h.component._isSaving, false); assert.equal(h.component._shortcutWritesPending, 0);
        assert.notEqual(h.component.getShortcutOrderTarget(1, 1), -1, 'closing a pending draft does not strand order controls');
    }
    for (const failure of ['false', 'throw', 'conflict']) {
        const h = createHarness(links); h.control(0).focus();
        h.storageManager.set = async () => { if (failure === 'false') return false; const e = new Error('failure'); if (failure === 'conflict') { e.code = 'LINKS_CONFLICT'; e.latestLinks = [links[2]]; } throw e; };
        assert.equal(await h.component.moveShortcut(0, 1), false);
        assert.deepEqual(clone(h.component.links), failure === 'conflict' ? [links[2]] : links);
        assert.equal(h.component._shortcutOrderPending, false); assert.equal(h.document.activeElement, h.control(0));
    }
    for (const ids of [true, false]) {
        const twins = [0, 1, 2].map(index => ({ title: 'Twin', url: 'https://example.com', category: 'work', ...(ids ? { layoutId: `twin-${index}` } : {}) }));
        const h = createHarness(twins); h.control(0).focus(); await h.component.moveShortcut(0, 1);
        assert.equal(h.document.activeElement, h.control(1), 'exact moved twin owns focus');
        if (ids) assert.deepEqual(clone(h.component.links).map(x => x.layoutId), ['twin-1', 'twin-0', 'twin-2']);
    }
    console.log('shortcut order tests ok (DOM model; native smoke pending)');
})().catch(error => { console.error(error); process.exitCode = 1; });
