const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model.js');

async function mount(library, language = 'en') {
    const prompts = library === 'prompts';
    const h = require(prompts ? './helpers/prompts-harness.js' : './helpers/collections-harness.js').setup();
    const core = require(prompts ? '../shared/local-prompts-store.js' : '../shared/local-ai-collections-store.js');
    const doc = createDocument({ blurUnavailableFocus: true }), host = doc.createElement('div'), events = new Map();
    doc.body.append(host);
    const messages = JSON.parse(fs.readFileSync(`_locales/${language}/messages.json`, 'utf8'));
    const root = { document: doc, addEventListener: (key, fn) => events.set(key, fn), location: { assign() {} },
        LocalItabPrompts: core, LocalItabAICollections: core };
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
        doc.listeners.get(type)?.(event); return event;
    };
    return { ...h, doc, host, view, events, dispatch, get selections() { return selections; } };
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
        h.events.get('pagehide')({ persisted: true }); h.view.newButton.focus();
        assert.equal(h.dispatch('keydown').defaultPrevented, true);
        h.events.get('pagehide')({ persisted: false });
        for (const type of ['keydown', 'compositionstart', 'compositionend', 'focusout']) assert.equal(h.doc.listeners.has(type), false);
        h.view.detachSearchShortcut(); h.view.newButton.focus();
        assert.equal(h.dispatch('keydown').defaultPrevented, false); h.controller.dispose();
    });
}
