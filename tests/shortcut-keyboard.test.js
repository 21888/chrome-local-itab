const assert = require('node:assert/strict');
const { createHarness, nativeActivation, submit, sampleLinks, deferred } = require('./helpers/dashboard-harness');

(async () => {
    const h = createHarness();
    assert.equal(h.control(0).tagName, 'BUTTON'); assert.equal(h.control(0).type, 'button'); assert.equal(h.control(0).tabIndex, 0);
    assert.match(h.control(0).getAttribute('aria-label'), /Open in new tab: A <img "quoted">/);
    assert.equal(h.control(0).querySelector('button'), null, 'no nested edit/delete controls');
    assert.equal(h.control(0).querySelector('.shortcut-title').textContent, sampleLinks[0].title);
    assert.match(h.control(0, 'edit').getAttribute('aria-label'), /Edit: A/);
    assert.match(h.control(0, 'delete').getAttribute('aria-label'), /Delete: A/);
    assert.equal(h.add().tagName, 'BUTTON'); assert.equal(h.add().getAttribute('aria-label'), 'Add Shortcut');
    nativeActivation(h.control(0), 'Enter'); assert.equal(h.opened.length, 1);
    assert.equal(nativeActivation(h.control(0), 'Enter', true).prevented, true); assert.equal(h.opened.length, 1);
    nativeActivation(h.control(0), ' '); assert.equal(h.opened.length, 2);
    assert.equal(h.control(2).getClientRects().length, 0); h.control(2).dispatch('click'); assert.equal(h.opened.length, 2);
    h.control(0).disabled = true; h.control(0).dispatch('click'); assert.equal(h.opened.length, 2); h.control(0).disabled = false;
    nativeActivation(h.add(), 'Enter'); assert.equal(h.document.activeElement.id, 'shortcut-title');
    assert.equal(h.document.activeElement.dispatch('keydown', { key: 'Enter', repeat: true }).prevented, true);
    h.component.modal.dispatch('keydown', { key: 'Escape' }); assert.equal(h.document.activeElement, h.add());
    nativeActivation(h.add(), ' '); h.component.hideModal(); assert.equal(h.document.activeElement, h.add());
    nativeActivation(h.control(1, 'edit'), 'Enter');
    h.component.modal.querySelector('#shortcut-title').value = 'Renamed B';
    await submit(h.component);
    assert.equal(h.document.activeElement, h.control(1, 'edit'), 'same-session edit follows its rebuilt control');
    nativeActivation(h.add(), 'Enter');
    h.component.modal.querySelector('#shortcut-title').value = 'New D'; h.component.modal.querySelector('#shortcut-url').value = 'example.com/d';
    await submit(h.component); assert.equal(h.document.activeElement, h.add(), 'successful Add returns to Add');
    h.search.focus(); h.component.updateGrid(); assert.equal(h.document.activeElement, h.search);

    for (const deleted of [0, 1]) {
        const h = createHarness(); h.control(deleted, 'delete').focus(); await h.component.deleteShortcut(deleted);
        assert.equal(h.document.activeElement, h.control(0), 'delete chooses next/previous visible primary, not Delete or hidden category');
    }
    {
        const h = createHarness([sampleLinks[0], sampleLinks[2]]); h.control(0, 'delete').focus(); await h.component.deleteShortcut(0);
        assert.equal(h.document.activeElement, h.add());
    }
    {
        const h = createHarness(); h.control(1, 'edit').focus(); h.component.links = [h.component.links[1], h.component.links[0], h.component.links[2]]; h.component.updateGrid();
        assert.equal(h.document.activeElement, h.control(0, 'edit'), 'duplicate URLs keep title/category identity');
        const create = h.component.createShortcutItem.bind(h.component);
        h.component.createShortcutItem = (link, index) => { const item = create(link, index); item.querySelector('.shortcut-actions').style.display = 'none'; return item; };
        h.component.updateGrid(); assert.equal(h.document.activeElement, h.control(0), 'hidden narrow action falls back to visible launch');
    }
    for (const outcome of [true, false]) {
        for (const destination of ['search', 'new-editor']) {
            const h = createHarness(); const write = deferred(); h.storageManager.set = () => write.promise;
            nativeActivation(h.control(0, 'edit'), 'Enter'); h.component.modal.querySelector('#shortcut-title').value = 'Pending A';
            const saving = submit(h.component); h.component.hideModal();
            if (destination === 'search') h.search.focus();
            else { nativeActivation(h.add(), 'Enter'); h.component.modal.querySelector('#shortcut-title').value = 'Newer draft'; }
            const focus = h.document.activeElement; write.resolve(outcome); await saving;
            assert.equal(h.document.activeElement, focus, 'old completion does not steal focus');
            if (destination === 'new-editor') { assert.equal(focus.value, 'Newer draft'); assert(h.component.modal.classList.contains('active')); }
        }
    }
    {
        const h = createHarness(); h.storageManager.set = async () => false;
        nativeActivation(h.control(0, 'edit'), 'Enter'); const focus = h.document.activeElement;
        await submit(h.component); assert.equal(h.document.activeElement, focus); assert(h.component.modal.classList.contains('active'));
        assert.equal(h.component.modal.querySelector('#save-btn').disabled, false);
    }
    for (const failure of ['false', 'throw', 'conflict']) {
        const h = createHarness();
        h.storageManager.set = async () => {
            if (failure === 'false') return false;
            const error = new Error('save failed');
            if (failure === 'conflict') { error.code = 'LINKS_CONFLICT'; error.latestLinks = [h.component.links[0]]; }
            throw error;
        };
        nativeActivation(h.control(1, 'edit'), 'Enter');
        await submit(h.component);
        assert(h.component.modal.classList.contains('active'));
        h.component.modal.dispatch('keydown', { key: 'Escape' });
        assert.equal(h.document.activeElement, failure === 'conflict' ? h.control(0) : h.control(1, 'edit'), 'failed save dismissal restores a rebuilt visible opener/fallback');
        assert(h.document.activeElement.getClientRects().length > 0);
    }
    {
        const twins = [sampleLinks[0], { ...sampleLinks[0], icon: 'Different icon' }];
        const h = createHarness(twins); h.control(0, 'delete').focus();
        await h.component.deleteShortcut(0);
        assert.equal(h.document.activeElement, h.control(0), 'successful deletion of an exact twin always chooses primary, not its Delete action');
    }
    {
        const h = createHarness(); h.component.layout.autoArrange = false;
        const pointer = target => ({ target, pointerId: 1, button: 0, clientX: 10, clientY: 10, prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {} });
        h.component.onPointerDown(pointer(h.control(0).querySelector('.shortcut-icon'))); assert.equal(typeof h.component._cancelFreeDrag, 'function'); h.component._cancelFreeDrag();
        const action = pointer(h.control(0, 'edit')); h.component.onPointerDown(action); assert.equal(action.prevented, false); assert.equal(h.component._cancelFreeDrag, null);
        h.component.layout.autoArrange = true;
        const data = [];
        h.component.handleDragStart({ target: h.control(0).querySelector('.shortcut-icon'), dataTransfer: { setData: (...args) => data.push(args) }, preventDefault() {} });
        assert.equal(h.component.draggedIndex, 0); assert.deepEqual(data, [['text/plain', '0']]);
    }
    console.log('shortcut keyboard tests ok (DOM/event model; native smoke pending)');
})().catch(error => { console.error(error); process.exitCode = 1; });
