const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-prompts-store.js');
const { setup, add, settle } = require('./helpers/prompts-harness.js');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');
async function mount(language = 'en') {
    const h = setup(), doc = createDocument({ blurUnavailableFocus: true });
    const host = doc.createElement('div'); doc.body.append(host);
    const events = new Map(), root = { document: doc, LocalItabPrompts: Core,
        addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
    const context = vm.createContext({ window: root, Intl, Date, Object, Array, Boolean, String, Promise });
    for (const file of ['dialog-focus', 'local-prompts-view']) vm.runInContext(fs.readFileSync(`${__dirname}/../shared/${file}.js`, 'utf8'), context);
    const messages = JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${language}/messages.json`, 'utf8'));
    const view = new root.LocalItabPromptsView.View({ host, controller: h.controller,
        translate: (key, fallback) => messages[`prompts${key}`]?.message || fallback });
    view.render(); await h.controller.start(); await settle(h.controller);
    return { ...h, h, doc, host, view, events };
}
async function pendingSave(h, outcome = 'success', action = 'copy') {
    const c = h.controller, original = await add(c, 'Synthetic original', 'Saved body');
    if (action === 'new') { c.create(); c.update('title', 'Synthetic new'); } else c.edit();
    c.update('body', 'Synthetic draft'); c.update('category', 'Synthetic category'); c.update('tagsText', 'Synthetic tag');
    const snapshot = JSON.stringify(c.draft().input), writes = h.h.writes;
    const gate = deferred(), entered = deferred(), write = h.backend.write.bind(h.backend), mutate = h.store.mutate.bind(h.store);
    // Success and uncertain acknowledgement use the real Store and its write/readback.
    // A definitive pre-write capacity fault is injected at the Store API boundary.
    if (outcome === 'capacity') h.store.mutate = async () => { entered.resolve(); await gate.promise; throw Core.fault('CAPACITY'); };
    else h.backend.write = async state => { entered.resolve(); await gate.promise; return write(state); };
    if (outcome === 'uncertain') h.h.failOnce();
    let saving;
    const save = c.save.bind(c); c.save = (...args) => (saving = save(...args));
    const origin = action === 'copy' ? h.view.editorElements.saveCopy : action === 'edit' ? h.view.main.querySelector('[data-prompt-focus="body"]') : h.view.editorElements.save;
    origin.focus();
    if (action === 'copy') origin.dispatch('click');
    else if (action === 'edit') origin.dispatch('keydown', { key: 's', ctrlKey: true });
    else h.view.main.querySelector('form').dispatch('submit');
    await entered.promise;
    assert.equal(c.busy, true); assert.equal(h.doc.activeElement, h.doc.body);
    return { gate, original, snapshot, writes, action, outcome,
        finish: async () => { gate.resolve(); await saving; await settle(c); h.store.mutate = mutate; },
        check() {
            assert.equal(h.h.writes, writes + (outcome === 'capacity' ? 0 : 1));
            if (outcome === 'success') { assert.equal(c.draft(), undefined); assert.equal(c.record().body, 'Synthetic draft'); }
            else { assert.equal(JSON.stringify(c.draft().input), snapshot); assert.equal(Boolean(c.pendingCommand), outcome === 'uncertain'); }
            if (action !== 'edit') assert.equal(JSON.stringify(h.h.raw.records.find(record => record.id === original.id)), JSON.stringify(original));
        }
    };
}
async function documentEvent(h, type, fields = {}) {
    await h.doc.listeners.get(type)?.({ target: h.doc.activeElement, key: '', preventDefault() {}, ...fields });
}
for (const language of ['en', 'zh_CN']) for (const action of ['copy', 'new', 'edit']) for (const outcome of ['success', 'capacity', 'uncertain']) {
    test(`${language}: pending prompt ${action} ${outcome} preserves newer search focus and query`, async () => {
        const h = await mount(language), c = h.controller, pending = await pendingSave(h, outcome, action);
        h.view.search.focus(); h.view.search.value = 'Synthetic'; h.view.search.dispatch('input');
        await pending.finish();
        assert.ok(h.doc.activeElement === h.view.search, 'the newer search field owns focus');
        assert.equal(h.view.search.value, 'Synthetic'); assert.equal(c.filters.query, 'Synthetic'); pending.check(); c.dispose();
    });
}
for (const outcome of ['success', 'capacity']) for (const target of ['search', 'category', 'tag', 'favorites']) {
    test(`pending prompt copy ${outcome} keeps ${target} focus through result/list refresh`, async () => {
        const h = await mount(), c = h.controller, pending = await pendingSave(h, outcome);
        const control = target === 'favorites' ? h.view.nav.favorites : h.view[target]; control.focus();
        if (target === 'favorites') control.dispatch('click');
        else if (target === 'category' || target === 'tag') { control.value = 'Synthetic filter'; control.dispatch('change'); }
        await pending.finish();
        assert.ok(h.doc.activeElement === control); pending.check();
        await c.refresh(); assert.ok(h.doc.activeElement === control); c.dispose();
    });
}
for (const outcome of ['success', 'capacity']) for (const interaction of ['focus round trip', 'pointer', 'key', 'blur', 'visibility round trip', 'persisted pagehide']) {
    test(`pending prompt ${outcome} does not reacquire abandoned focus after ${interaction}`, async () => {
        const h = await mount(), c = h.controller, pending = await pendingSave(h, outcome);
        if (interaction === 'focus round trip') {
            h.view.search.focus(); await documentEvent(h, 'focusin'); h.doc.body.focus();
        } else if (interaction === 'pointer') await documentEvent(h, 'pointerdown', { target: h.doc.body });
        else if (interaction === 'key') await documentEvent(h, 'keydown', { key: 'Escape' });
        else if (interaction === 'blur') h.events.get('blur')?.({});
        else if (interaction === 'visibility round trip') { h.doc.hidden = true; await documentEvent(h, 'visibilitychange'); h.doc.hidden = false; }
        else h.events.get('pagehide')({ persisted: true });
        await pending.finish();
        assert.ok(h.doc.activeElement === h.doc.body, 'abandoned save focus must remain abandoned'); pending.check(); c.dispose();
    });
}
for (const outcome of ['success', 'capacity', 'uncertain']) {
    test(`pending prompt ${outcome} retains existing completion behavior without newer interaction`, async () => {
        const h = await mount(), c = h.controller, pending = await pendingSave(h, outcome);
        await pending.finish(); pending.check();
        const expected = outcome === 'success' ? h.view.main.querySelector('.prompt-detail-heading') : outcome === 'capacity' ? h.view.editorElements.saveCopy : h.doc.body;
        assert.ok(h.doc.activeElement === expected);
        assert.equal(h.view.pendingFocus, null);
        assert.equal(h.doc.listeners.has('focusin'), false); assert.equal(h.doc.listeners.has('pointerdown'), false);
        assert.equal(h.doc.listeners.has('visibilitychange'), false); assert.equal(h.events.has('blur'), false);
        c.dispose(); assert.equal(h.doc.listeners.has('keydown'), false);
    });
}
test('uncertain copy permits browsing before exact retry without duplicate writes or stealing newer search focus', async () => {
    const h = await mount(), c = h.controller, other = await add(c, 'Other synthetic', 'Other body');
    const pending = await pendingSave(h, 'uncertain');
    const disabledCard = h.view.list.querySelector('button'); assert.equal(disabledCard.disabled, true);
    disabledCard.dispatch('click'); assert.equal(c.selected, pending.original.id, 'controller also blocks synthetic clicks while busy');
    await pending.finish(); pending.check(); const operation = c.pendingCommand, writes = h.h.writes;
    const otherCard = h.view.list.querySelectorAll('button').find(button => button.children[0].textContent === other.title);
    assert.equal(otherCard.disabled, false); otherCard.focus(); otherCard.dispatch('click');
    assert.equal(c.selected, other.id); assert.equal(JSON.stringify(c.drafts.get(pending.original.id).input), pending.snapshot);
    const gate = deferred(), entered = deferred(), mutate = h.store.mutate.bind(h.store);
    let retrying; c.retry = () => (retrying = c.execute(c.pendingCommand, c.pendingInspection));
    h.store.mutate = async command => { assert.deepEqual(command, operation.command); entered.resolve(); await gate.promise; return mutate(command); };
    const retry = h.view.status.querySelector('button'); retry.focus(); retry.dispatch('click'); await entered.promise;
    h.view.search.focus(); h.view.search.value = 'Other'; h.view.search.dispatch('input');
    gate.resolve(); await retrying; await settle(c);
    assert.ok(h.doc.activeElement === h.view.search); assert.equal(h.h.writes, writes);
    assert.equal(c.pendingCommand, null); assert.equal(c.record().id, operation.command.operationId);
    assert.equal(c.record().body, 'Synthetic draft'); assert.equal(c.drafts.has(pending.original.id), false); c.dispose();
});
test('dispose during pending real write releases focus listeners and late completion cannot focus the old page', async () => {
    const h = await mount(), c = h.controller, pending = await pendingSave(h);
    c.dispose();
    assert.equal(h.view.pendingFocus, null); assert.equal(h.doc.listeners.has('focusin'), false);
    assert.equal(h.doc.listeners.has('pointerdown'), false); assert.equal(h.doc.listeners.has('keydown'), false);
    assert.equal(h.events.has('blur'), false);
    await pending.finish(); assert.ok(h.doc.activeElement === h.doc.body);
});
