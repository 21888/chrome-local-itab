'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { createHarness, deferred, menuAction, submit } = require('./helpers/dashboard-harness');
const clone = value => JSON.parse(JSON.stringify(value));
const links = ['Alpha', 'Beta', 'Gamma'].map((title, index) => ({
    title, url: `https://${title.toLowerCase()}.example.test/`, icon: title[0],
    category: 'work', layoutId: `l_${String(index).repeat(32)}`
}));
const tick = () => new Promise(setImmediate);
function drag(h, from, to) {
    h.control(from).dispatch('dragstart', { dataTransfer: { setData() {} } });
    return h.component.handleDrop({ target: h.tile(to), preventDefault() {} });
}
function errors(h) {
    h.context.errors = [];
    vm.runInContext('showErrorMessage = message => errors.push(message);', h.context);
    return h.context.errors;
}

// Real dashboard handlers with a synthetic DOM and deferred local storage.
// This does not exercise native Chrome drag events or browser focus painting.
test('pending grid drag opens and edits the still-visible site, then remaps its draft after a saved snapshot', async () => {
    const h = createHarness(links), c = h.component, flush = deferred(), write = deferred();
    const writes = [];
    h.storageManager.set = (...args) => { writes.push(clone(args)); return write.promise; };
    c.layoutController = {
        modePending: false, generation: 'synthetic-generation',
        holdShortcutMutation() { this.modePending = true; }, flush: () => flush.promise,
        releaseShortcutMutation() { this.modePending = false; }, adoptOwnShortcutSnapshot() {}
    };
    const alpha = h.control(0);
    const pending = drag(h, 0, 1);
    assert.equal(h.control(0), alpha);
    assert.equal(h.tile(0).querySelector('.shortcut-title').textContent, 'Alpha');
    alpha.dispatch('click', { detail: 1 });
    assert.deepEqual(h.opened, [links[0].url], 'the visible Alpha must not open Beta while layout flush is pending');
    assert.equal(writes.length, 0);
    flush.resolve(true); await tick();
    alpha.dispatch('click', { detail: 1 });
    assert.deepEqual(h.opened, [links[0].url, links[0].url], 'the same visible Alpha stays accurate while storage is pending');
    assert.deepEqual(clone(c.links), links);
    menuAction(h, 0, 'edit');
    const input = c.modal.querySelector('#shortcut-title');
    assert.equal(input.value, 'Alpha'); input.value = 'Keep Alpha draft';
    assert.equal(c.modal.querySelector('#save-btn').disabled, true);
    await submit(c); assert.equal(writes.length, 1);
    assert.deepEqual(writes[0][2].expectedLinks, links);
    assert.deepEqual(writes[0][2].operation, { type: 'reorder', from: 0, to: 1 });
    assert.equal(writes[0][2].expectedLayoutGeneration, 'synthetic-generation');
    write.resolve({ links: [links[1], links[0], links[2]], layout: { autoArrange: true, positions: {}, positionsById: {} } });
    await pending;
    assert.equal(c.currentEditIndex, 1); assert.equal(c._modalFocusOrigin.index, 1);
    assert.equal(c.links[1].layoutId, links[0].layoutId);
    assert.equal(input.value, 'Keep Alpha draft'); assert.equal(h.document.activeElement, input);
    assert.equal(c.modal.querySelector('#save-btn').disabled, false);
    c.hideModal(); assert.equal(h.document.activeElement, h.control(1, 'more'));
    assert.equal(c._shortcutOrderPending, false); assert.equal(c._shortcutWritesPending, 0);
    assert.equal(c.layoutController.modePending, false);
});

test('pending grid drag rejects a second drag and deletion even without a layout controller', async () => {
    const h = createHarness(links), c = h.component, write = deferred(); let writes = 0;
    h.storageManager.set = () => { writes++; return write.promise; };
    const pending = drag(h, 0, 2);
    const secondStart = h.control(1).dispatch('dragstart', { dataTransfer: { setData() {} } });
    assert.equal(secondStart.prevented, true);
    // A late drop from an earlier event must not get another transaction.
    c.draggedIndex = 1;
    await c.handleDrop({ target: h.tile(2), preventDefault() {} });
    assert.equal(c.confirmDelete(0), false); assert.equal(await c.deleteShortcut(0), false);
    assert.equal(c.confirmDialog, null); assert.equal(writes, 1);
    assert.deepEqual(clone(c.links), links);
    write.resolve(true); await pending;
    assert.deepEqual(Array.from(c.links, link => link.title), ['Beta', 'Gamma', 'Alpha']);
    assert.equal(c.draggedIndex, null); assert.equal(c._shortcutWritesPending, 0);
});

test('grid drag keeps existing failure, unverified and conflict handling without retargeting an open draft', async () => {
    for (const outcome of ['false', 'failed', 'unverified', 'conflict']) {
        const h = createHarness(links), c = h.component, write = deferred(), notices = errors(h); let writes = 0;
        h.storageManager.set = async () => {
            writes++; await write.promise;
            if (outcome === 'false') return false;
            throw Object.assign(new Error('Synthetic failure'), outcome === 'conflict'
                ? { code: 'LINKS_CONFLICT', latestLinks: [links[2]] }
                : outcome === 'unverified' ? { code: 'LAYOUT_UNVERIFIED', mayHaveCommitted: true } : {});
        };
        const pending = drag(h, 0, 1);
        menuAction(h, 0, 'edit');
        const input = c.modal.querySelector('#shortcut-title');
        assert.equal(input.value, 'Alpha', outcome); input.value = 'Keep unsaved Alpha';
        write.resolve(); await pending;
        assert.deepEqual(clone(c.links), outcome === 'conflict' ? [links[2]] : links, outcome);
        assert.equal(input.value, 'Keep unsaved Alpha', outcome); assert.equal(c.currentEditIndex, 0);
        assert.equal(c.modal.querySelector('#save-btn').disabled, ['unverified', 'conflict'].includes(outcome), outcome);
        assert.equal(notices.length, 1, outcome);
        if (outcome === 'unverified') assert.match(notices[0], /Could not verify/);
        if (outcome === 'conflict') assert.match(notices[0], /draft is still here/);
        assert.equal(writes, 1); assert.equal(c._shortcutOrderPending, false); assert.equal(c._shortcutWritesPending, 0);
    }
});

test('grid drag retains exact drop index and categories, including cross-collection targets', async () => {
    const records = clone(links); records[1].category = 'social';
    const h = createHarness(records), c = h.component, writes = [];
    h.context.window.categoryNavigation.currentCategory = 'all';
    c.usesCollections = () => true; c.updateGrid();
    h.storageManager.set = async (...args) => { writes.push(clone(args)); return true; };
    await drag(h, 0, 1);
    assert.deepEqual(clone(c.links), [records[1], records[0], records[2]], 'drag uses its actual target, not the keyboard next-in-collection target');
    assert.deepEqual(writes[0][2].operation, { type: 'reorder', from: 0, to: 1 });
    await drag(h, 2, 0);
    assert.deepEqual(clone(c.links), [records[2], records[1], records[0]]);
    assert.deepEqual(writes[1][2].operation, { type: 'reorder', from: 2, to: 0 });
});

test('pending deletion blocks drag and a completed drag does not steal newer search focus', async () => {
    const h = createHarness(links), c = h.component, write = deferred(); let writes = 0;
    h.storageManager.set = () => { writes++; return write.promise; };
    const deletion = c.deleteShortcut(0);
    assert.equal(h.control(1).dispatch('dragstart', { dataTransfer: { setData() {} } }).prevented, true);
    c.draggedIndex = 1; await c.handleDrop({ target: h.tile(2), preventDefault() {} });
    assert.equal(writes, 1); write.resolve(true); await deletion;
    const next = deferred(); h.storageManager.set = () => next.promise;
    const pending = drag(h, 0, 1); h.search.focus(); next.resolve(true); await pending;
    assert.equal(h.document.activeElement, h.search);
    assert.deepEqual(Array.from(c.links, link => link.title), ['Gamma', 'Beta']);
});
