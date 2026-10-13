const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model.js');

// Match EventTarget ownership: multiple callbacks per event, exact removal,
// and a stable dispatch snapshot when a listener removes itself.
function eventTarget(target) {
    const listeners = new Map();
    target.addEventListener = (type, listener) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(listener);
    };
    target.removeEventListener = (type, listener) => {
        const current = listeners.get(type); current?.delete(listener);
        if (!current?.size) listeners.delete(type);
    };
    target.emit = (type, event) => { for (const listener of [...listeners.get(type) || []]) listener(event); };
    target.listenerCount = type => listeners.get(type)?.size || 0;
    target.listeners = listeners;
    return target;
}

async function mount(library, language = 'en', shared = null) {
    const prompts = library === 'prompts';
    const h = require(prompts ? './helpers/prompts-harness.js' : './helpers/collections-harness.js').setup();
    const core = require(prompts ? '../shared/local-prompts-store.js' : '../shared/local-ai-collections-store.js');
    const doc = shared?.doc || eventTarget(createDocument({ blurUnavailableFocus: true })), host = doc.createElement('div');
    doc.body.append(host);
    const messages = JSON.parse(fs.readFileSync(`_locales/${language}/messages.json`, 'utf8'));
    const root = shared?.root || eventTarget({ document: doc, location: { assign() {} },
        LocalItabPrompts: core, LocalItabAICollections: core });
    const context = vm.createContext({ window: root });
    for (const file of ['dialog-focus', prompts ? 'local-prompts-view' : 'local-ai-collections-view']) {
        vm.runInContext(fs.readFileSync(`shared/${file}.js`, 'utf8'), context);
    }
    const View = (prompts ? root.LocalItabPromptsView : root.LocalItabCollectionsView).View;
    const view = new View({ host, controller: h.controller, translate: (key, fallback) => messages[`${prompts ? 'prompts' : 'collections'}${key}`]?.message || fallback });
    view.render(); await h.controller.start();
    let selections = 0;
    view.search.select = () => { selections++; };
    const dispatch = (type, fields = {}) => {
        const event = { key: '/', target: doc.activeElement, defaultPrevented: false,
            preventDefault() { this.defaultPrevented = true; }, ...fields };
        doc.emit(type, event); return event;
    };
    return { ...h, doc, host, view, root, dispatch, get writes() { return h.writes; }, get selections() { return selections; } };
}

for (const library of ['prompts', 'collections']) {
    test(`${library}: slash focuses/selects exact current query without filtering or writes; hint is accessible in both locales`, async () => {
        for (const language of ['en', 'zh_CN']) {
            const h = await mount(library, language), c = h.controller;
            c.filter({ query: '  中文 / 🧪  ' });
            const before = h.writes, filters = JSON.stringify(c.filters), value = h.view.search.value;
            h.view.newButton.focus();
            assert.equal(h.dispatch('keydown').defaultPrevented, true);
            assert.equal(h.doc.activeElement, h.view.search); assert.equal(h.selections, 1);
            assert.equal(h.view.search.value, value); assert.equal(JSON.stringify(c.filters), filters); assert.equal(h.writes, before);
            assert.equal(h.view.search.getAttribute('aria-keyshortcuts'), '/');
            assert.equal(h.doc.getElementById(h.view.search.getAttribute('aria-describedby')).textContent,
                language === 'en' ? 'Press / to search' : '按 / 搜索');
            c.dispose();
        }
    });
    test(`${library}: slash leaves every editable target/active element and contenteditable descendant alone`, async () => {
        const h = await mount(library);
        for (const tag of ['input', 'textarea', 'select', 'div']) {
            const field = h.doc.createElement(tag); h.host.append(field);
            if (tag === 'div') { field.setAttribute('contenteditable', 'plaintext-only'); const child = h.doc.createElement('span'); field.append(child); child.focus(); }
            else field.focus();
            assert.equal(h.dispatch('keydown').defaultPrevented, false);
            assert.equal(h.dispatch('keydown', { target: h.doc.body }).defaultPrevented, false);
        }
        h.view.search.focus(); assert.equal(h.dispatch('keydown').defaultPrevented, false);
        assert.equal(h.selections, 0); h.controller.dispose();
    });
    test(`${library}: IME, repeat, modifiers, browser find/save and consumed events are untouched`, async () => {
        const h = await mount(library); h.view.newButton.focus();
        for (const fields of [{ isComposing: true }, { keyCode: 229 }, { repeat: true }, { ctrlKey: true }, { metaKey: true },
            { altKey: true }, { key: 'f', ctrlKey: true }, { key: 'f', metaKey: true }, { key: 's', ctrlKey: true },
            { key: 's', metaKey: true }, { key: '?' }]) {
            assert.equal(h.dispatch('keydown', fields).defaultPrevented, false);
        }
        h.dispatch('keydown', { defaultPrevented: true }); assert.equal(h.selections, 0);
        h.dispatch('compositionstart'); assert.equal(h.dispatch('keydown').defaultPrevented, false);
        h.dispatch('compositionend'); assert.equal(h.dispatch('keydown').defaultPrevented, true);
        h.view.newButton.focus(); h.dispatch('compositionstart'); h.dispatch('focusout');
        assert.equal(h.dispatch('keydown').defaultPrevented, true);
        h.controller.dispose();
    });
    test(`${library}: dialogs, comparison, export, inert/disconnected/disabled hosts and disposal do not steal focus`, async () => {
        const h = await mount(library);
        for (const property of ['openDialog', 'comparison', 'exportingMarkdown']) {
            h.view.newButton.focus(); h.view[property] = true;
            assert.equal(h.dispatch('keydown').defaultPrevented, false); h.view[property] = false;
        }
        const dialog = h.doc.createElement('section'); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); h.doc.body.append(dialog);
        assert.equal(h.dispatch('keydown').defaultPrevented, false); dialog.remove();
        const native = h.doc.createElement('dialog'); native.open = true; h.doc.body.append(native);
        assert.equal(h.dispatch('keydown').defaultPrevented, false); native.remove();
        h.host.inert = true; assert.equal(h.dispatch('keydown').defaultPrevented, false); h.host.inert = false;
        h.view.search.disabled = true; assert.equal(h.dispatch('keydown').defaultPrevented, false); h.view.search.disabled = false;
        h.controller.dispose(); assert.equal(h.dispatch('keydown').defaultPrevented, false); assert.equal(h.selections, 0);
        const fresh = await mount(library); fresh.host.remove();
        assert.equal(fresh.dispatch('keydown').defaultPrevented, false); fresh.controller.dispose();
    });
    test(`${library}: closing real dialog restores shortcut; pagehide teardown is idempotent and bfcache-safe`, async () => {
        const h = await mount(library); h.view.newButton.focus();
        const pending = h.view.dialog({ title: 'Synthetic confirmation', body: 'Synthetic only', accept: 'OK' });
        assert.equal(h.dispatch('keydown', { target: h.doc.body }).defaultPrevented, false);
        h.doc.body.querySelector('.prompt-dialog-overlay button').dispatch('click');
        assert.equal(await pending, false);
        assert.equal(h.dispatch('keydown').defaultPrevented, true);
        h.root.emit('pagehide', { persisted: true }); h.view.newButton.focus();
        assert.equal(h.dispatch('keydown').defaultPrevented, true);
        h.root.emit('pagehide', { persisted: false });
        for (const type of ['keydown', 'compositionstart', 'compositionend', 'focusout']) assert.equal(h.doc.listeners.has(type), false);
        h.view.detachSearchShortcut(); h.view.newButton.focus();
        assert.equal(h.dispatch('keydown').defaultPrevented, false); h.controller.dispose();
    });
}

for (const library of ['prompts', 'collections']) {
    const types = ['keydown', 'compositionstart', 'compositionend', 'focusout'];
    test(`${library}: disposal releases every owned listener and isolates other mounted views`, async () => {
        const a = await mount(library), b = await mount(library, 'en', a);
        a.view.attachDepartureGuard(); b.view.attachDepartureGuard();
        for (let i = 0; i < 10; i++) a.view.attachSearchShortcut();
        for (const type of types) assert.equal(a.doc.listenerCount(type), 2);
        assert.equal(a.root.listenerCount('pagehide'), 2);
        const c = a.controller;
        c.create(); c.update('title', 'Synthetic draft 🧪'); c.update('body', 'Synthetic unchanged body');
        const draft = JSON.stringify(c.draft()), writes = a.writes;
        a.root.emit('pagehide', { persisted: true });
        for (const type of types) assert.equal(a.doc.listenerCount(type), 2);
        assert.equal(a.root.listenerCount('pagehide'), 2);
        assert.equal(JSON.stringify(c.draft()), draft); assert.equal(a.writes, writes);
        c.dispose(); c.dispose(); a.view.destroy(); a.host.remove(); a.view.attachSearchShortcut();
        for (const type of types) assert.equal(a.doc.listenerCount(type), 1);
        assert.equal(a.root.listenerCount('pagehide'), 1);
        assert.equal(a.root.listenerCount('beforeunload'), 1);
        assert.equal(JSON.stringify(c.draft()), draft); assert.equal(a.writes, writes);
        b.view.newButton.focus(); assert.equal(b.dispatch('keydown').defaultPrevented, true);
        assert.equal(b.doc.activeElement, b.view.search);
        b.controller.dispose(); b.controller.dispose(); b.host.remove();
        for (const type of types) assert.equal(a.doc.listenerCount(type), 0);
        assert.equal(a.root.listenerCount('pagehide'), 0);
        assert.equal(a.root.listenerCount('beforeunload'), 0);
    });
    test(`${library}: non-persisted pagehide destroys each view once without restoring listeners`, async () => {
        const a = await mount(library), b = await mount(library, 'en', a);
        a.view.attachDepartureGuard(); b.view.attachDepartureGuard();
        a.root.emit('pagehide', { persisted: false });
        const generation = a.view.markdownGeneration;
        a.root.emit('pagehide', { persisted: false }); a.view.destroy();
        a.view.attachSearchShortcut(); b.view.attachSearchShortcut();
        assert.equal(a.view.markdownGeneration, generation);
        for (const type of types) assert.equal(a.doc.listenerCount(type), 0);
        assert.equal(a.root.listenerCount('pagehide'), 0);
        assert.equal(a.root.listenerCount('beforeunload'), 0);
        a.controller.dispose(); b.controller.dispose();
    });
}

for (const library of ['prompts', 'collections']) {
    test(`${library}: failing store cleanup still releases the view and notifies disposal once`, async () => {
        const h = await mount(library), c = h.controller;
        let primary = 0, secondary = 0, notifications = 0;
        const onChange = c.onChange;
        c.onChange = kind => { if (kind === 'dispose') notifications++; onChange(kind); };
        c.unsubscribe = () => { primary++; throw new Error('Synthetic unsubscribe failure'); };
        c[library === 'prompts' ? 'unsubscribeCollections' : 'unsubscribePrompts'] = () => { secondary++; };
        c.dispose(); c.dispose();
        assert.equal(primary, 1); assert.equal(secondary, 1); assert.equal(notifications, 1);
        for (const type of ['keydown', 'compositionstart', 'compositionend', 'focusout']) assert.equal(h.doc.listenerCount(type), 0);
        assert.equal(h.root.listenerCount('pagehide'), 0);
        h.view.attachDepartureGuard(); h.view.attachSearchShortcut();
        assert.equal(h.root.listenerCount('beforeunload'), 0);
        assert.equal(h.doc.listenerCount('keydown'), 0);
    });
}
