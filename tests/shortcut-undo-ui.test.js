const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { createHarness, deferred } = require('./helpers/dashboard-harness');
const clone = value => JSON.parse(JSON.stringify(value));
const links = ['A', 'Hidden', 'B'].map((title, index) => ({ title, url: `https://example.com/${index}`, category: index === 1 ? 'social' : 'work', layoutId: `id-${index}` }));
function setup() {
    const h = createHarness(links);
    let saved = clone(links), receipt, before, calls = 0;
    h.storageManager.deleteShortcutWithUndo = async (index, options) => {
        assert.deepEqual(clone(options.expectedLinks), saved);
        before = clone(saved); saved.splice(index, 1); receipt = {};
        return { snapshot: snapshot(), receipt };
    };
    const snapshot = () => ({ links: clone(saved), layout: { autoArrange: true, positions: {}, positionsById: {} }, generation: 'generation' });
    h.storageManager.undoShortcutDeletion = async token => {
        calls++; assert.equal(token, receipt); saved = before; return snapshot();
    };
    return Object.assign(h, { calls: () => calls });
}
(async () => {
    {
        const h = setup(); h.search.focus();
        assert.equal(h.component._shortcutUndoBar.hidden, true);
        assert.equal(await h.component.deleteShortcut(0), true);
        assert.equal(h.document.activeElement, h.search);
        assert.equal(h.component._shortcutUndoBar.hidden, false);
        assert.equal(h.component._shortcutUndoButton.disabled, false);
        assert.match(h.component._shortcutUndoStatus.textContent, /only on this page/);
        assert.equal(await h.component.undoShortcutDeletion(), true);
        assert.deepEqual(clone(h.component.links), links);
        assert.equal(h.document.activeElement, h.search);
        assert.equal(h.context.window.categoryNavigation.currentCategory, 'work');
        assert.equal(h.tile(1).hidden || h.tile(1).style.display === 'none', true);
        assert.equal(h.component._shortcutUndoBar.hidden, true);
        assert.equal(await h.component.undoShortcutDeletion(), false);
        assert.equal(h.calls(), 1);
    }
    {
        const h = setup(); await h.component.deleteShortcut(0);
        const old = h.component._shortcutUndoReceipt;
        await h.component.deleteShortcut(1);
        assert.notEqual(h.component._shortcutUndoReceipt, old);
        await h.component.undoShortcutDeletion();
        assert.deepEqual(clone(h.component.links).map(x => x.title), ['Hidden', 'B']);
    }
    for (const key of ['_shortcutWritesPending', '_isSaving', '_pendingSave', '_pendingDelete', '_shortcutOrderPending', '_cancelFreeDrag', 'dragState', 'confirmDialog']) {
        const h = setup(); await h.component.deleteShortcut(0);
        h.component[key] = true; h.component.refreshShortcutUndo();
        assert.equal(h.component._shortcutUndoButton.disabled, true, key);
        assert.equal(await h.component.undoShortcutDeletion(), false, key);
        assert.equal(h.calls(), 0); assert(h.component._shortcutUndoReceipt);
    }
    for (const key of ['modePending', 'pending', 'timer', 'failedChange']) {
        const h = setup(); await h.component.deleteShortcut(0);
        h.component.layoutController = { [key]: true };
        assert.equal(await h.component.undoShortcutDeletion(), false, key);
        assert.equal(h.calls(), 0);
    }
    {
        const h = setup(); await h.component.deleteShortcut(0);
        h.component.openEditModal(1);
        assert.equal(h.component._shortcutUndoButton.disabled, true);
        assert.equal(await h.component.undoShortcutDeletion(), false);
        h.component.hideModal(); assert.equal(h.component._shortcutUndoButton.disabled, false);
        h.component.confirmDelete(1);
        assert.equal(h.component._shortcutUndoButton.disabled, true);
        h.component._closeConfirmDialog(); assert.equal(h.component._shortcutUndoButton.disabled, false);
    }
    for (const withIdentity of [true, false]) for (const destination of ['search', 'editor', 'button', 'grid']) {
        const h = setup(); await h.component.deleteShortcut(0);
        const restored = clone(links);
        if (!withIdentity) { h.component.links.forEach(link => delete link.layoutId); restored.forEach(link => delete link.layoutId); h.component.updateGrid(); }
        const pending = deferred(); let calls = 0;
        h.storageManager.undoShortcutDeletion = () => { calls++; return pending.promise; };
        h.component._shortcutUndoButton.focus();
        const undo = h.component.undoShortcutDeletion();
        assert.equal(await h.component.undoShortcutDeletion(), false); assert.equal(calls, 1);
        assert.equal(await h.component.deleteShortcut(1), false);
        if (destination === 'search') h.search.focus();
        if (destination === 'grid') h.control(1).focus();
        if (destination === 'editor') { h.component.openEditModal(1); h.component.modal.querySelector('#shortcut-title').value = 'My draft'; }
        const focused = h.document.activeElement;
        pending.resolve({ links: restored, layout: { autoArrange: true, positions: {}, positionsById: {} }, generation: 'undo' });
        assert.equal(await undo, true);
        if (destination === 'button') assert.equal(h.document.activeElement, h.control(0));
        else if (destination === 'grid') assert.equal(h.document.activeElement, h.control(2));
        else assert.equal(h.document.activeElement, focused);
        if (destination === 'editor') {
            assert.equal(h.component.currentEditIndex, 2);
            assert.equal(h.component.modal.querySelector('#shortcut-title').value, 'My draft');
            assert.equal(h.component.modal.querySelector('#save-btn').disabled, false);
        }
    }
    for (const code of ['SHORTCUT_UNDO_CONFLICT', 'SHORTCUT_UNDO_UNVERIFIED', 'SHORTCUT_UNDO_INVALID']) {
        const h = setup(); await h.component.deleteShortcut(0); const before = clone(h.component.links);
        const errors = []; h.context.showErrorMessage = message => errors.push(message);
        let calls = 0; h.storageManager.undoShortcutDeletion = async () => { calls++; throw Object.assign(new Error(code), { code, mayHaveCommitted: code.endsWith('UNVERIFIED') }); };
        assert.equal(await h.component.undoShortcutDeletion(), false);
        assert.deepEqual(clone(h.component.links), before);
        assert.equal(h.component._shortcutUndoReceipt, null); assert.match(errors[0], /Refresh/);
        assert.equal(await h.component.undoShortcutDeletion(), false); assert.equal(calls, 1);
    }
    {
        const h = setup(); await h.component.deleteShortcut(0); const before = clone(h.component.links);
        h.storageManager.deleteShortcutWithUndo = async () => { throw Object.assign(new Error('unknown'), { code: 'SHORTCUT_UNDO_UNVERIFIED', mayHaveCommitted: true }); };
        assert.equal(await h.component.deleteShortcut(1), false);
        assert.deepEqual(clone(h.component.links), before); assert.equal(h.component._shortcutUndoReceipt, null);
        const fresh = setup(); assert.equal(fresh.component._shortcutUndoReceipt, null);
    }
    for (const code of ['read', 'LINKS_CONFLICT', 'invalid-generation']) {
        const h = setup(); await h.component.deleteShortcut(0);
        const receipt = h.component._shortcutUndoReceipt;
        h.storageManager.deleteShortcutWithUndo = async () => { throw Object.assign(new Error(code), {
            code, latestLinks: clone(h.component.links), invalidatesShortcutUndo: code === 'invalid-generation'
        }); };
        assert.equal(await h.component.deleteShortcut(0), false);
        assert.equal(h.component._shortcutUndoReceipt, code === 'read' ? receipt : null);
        assert.equal(h.component._shortcutUndoButton.disabled, code !== 'read');
    }
    {
        const h = setup(); await h.component.deleteShortcut(0);
        h.component.recoverShortcutWrite({ code: 'LINKS_CONFLICT', latestLinks: clone(h.component.links) }, h.component.links);
        assert.equal(h.component._shortcutUndoReceipt, null, 'edit/add conflicts also consume stale UI receipts');
    }
    {
        const h = setup(); const live = h.component._shortcutUndoLiveStatus;
        assert.equal(live.getAttribute('role'), 'status');
        assert.equal(live.getAttribute('aria-live'), 'polite');
        assert.equal(live.getAttribute('aria-atomic'), 'true');
        assert.equal(live.classList.contains('sr-only'), true);
        assert.equal(live.parentElement === h.component.container, true);
        assert.equal(h.component._shortcutUndoBar.contains(live), false);
        assert.notEqual(live.hidden, true);
        assert.equal(live.textContent, '');
        assert.equal(h.component._shortcutUndoStatus.getAttribute('role') == null, true);
        assert.equal(h.component._shortcutUndoStatus.getAttribute('aria-live') == null, true);
        await h.component.deleteShortcut(0);
        const notice = live.textContent; assert.match(notice, /only on this page/);
        // Unrelated renders must not refill/reannounce the live node.
        live.textContent = 'sentinel'; h.component.refreshShortcutUndo();
        assert.equal(live.textContent, 'sentinel');
        assert.equal(await h.component.deleteShortcut(-1), false);
        assert.equal(live.textContent, 'sentinel', 'rejected action does not clear live text');
        const actualDelete = h.storageManager.deleteShortcutWithUndo;
        const gate = deferred();
        h.storageManager.deleteShortcutWithUndo = async (...args) => { await gate.promise; return actualDelete(...args); };
        h.search.focus(); const pending = h.component.deleteShortcut(0);
        assert.equal(live.textContent, '', 'a real deletion clears the previous announcement before awaiting');
        assert.equal(live.parentElement === h.component.container, true);
        gate.resolve(); assert.equal(await pending, true);
        assert.equal(live.textContent, notice, 'new verified deletion repopulates the already mounted region');
        assert.equal(h.document.activeElement, h.search);
        h.storageManager.deleteShortcutWithUndo = async () => { throw new Error('read failed'); };
        assert.equal(await h.component.deleteShortcut(0), false);
        assert.equal(live.textContent, '', 'failed deletion never announces success');
        assert.equal(h.document.activeElement, h.search);
    }
    for (const locale of ['en', 'zh_CN']) {
        const catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        const calls = [];
        const context = { window: {}, chrome: { i18n: { getMessage(key) { calls.push(key); return catalog[key]?.message || ''; } } } };
        vm.createContext(context);
        vm.runInContext(fs.readFileSync('i18n.js', 'utf8'), context);
        for (const key of ['shortcutUndoNotice', 'shortcutUndoAction', 'shortcutUndoInvalidData', 'shortcutUndoUnverified', 'shortcutUndoUnavailable']) {
            assert.ok(catalog[key]?.message);
            assert.equal(context.window.i18n.t(key), catalog[key].message);
            assert.equal(calls.at(-1), key, 'undo uses standard Chrome localization');
        }
        assert.equal(context.window.i18n.t('shortcutUndoAction'), locale === 'zh_CN' ? '撤销删除' : 'Undo delete');
    }
    console.log('shortcut undo UI tests ok (DOM model; native smoke pending)');
})().catch(error => { console.error(error); process.exitCode = 1; });
