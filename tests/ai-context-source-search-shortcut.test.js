// Synthetic DOM routing over the real context view, controller, stores and dialog.
// Native keyboard layout/IME, focus painting and browser selection need separate QA.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { webcrypto } = require('node:crypto'); global.crypto ||= webcrypto;
const { createDocument, deferred } = require('./helpers/task-dom-model');
const Context = require('../shared/ai-context'), Tasks = require('../shared/local-tasks-store');
const Collections = require('../shared/local-ai-collections-store'), Prompts = require('../shared/local-prompts-store');
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
function backend() {
    let raw;
    return { reads: 0, writes: 0, fail: false, lock: action => action(), subscribe: () => () => {},
        async read() { this.reads++; return structuredClone(raw); },
        async write(value) { this.writes++; raw = structuredClone(value); if (this.fail) throw Error('Synthetic unconfirmed write'); },
        snapshot: () => structuredClone(raw) };
}
function rootEvents(root) {
    const events = new Map();
    root.addEventListener = (type, fn) => { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); };
    root.removeEventListener = (type, fn) => events.get(type)?.delete(fn);
    root.emit = type => { for (const fn of [...events.get(type) || []]) fn({}); };
    return root;
}
// Extend only this test's event path: the shared model omits document bubbling,
// native defaultPrevented and selection ranges. Do not change shared helpers.
function dispatch(h, type = 'keydown', fields = {}, target = h.document.activeElement) {
    const event = target.dispatch(type, { key: '/', defaultPrevented: false,
        preventDefault() { this.defaultPrevented = this.prevented = true; }, ...fields });
    if (!event.stopped) h.document.listeners.get(type)?.(event);
    return event;
}
async function page(locale = 'en') {
    const document = createDocument({ blurUnavailableFocus: true }), trigger = document.createElement('button');
    trigger.id = 'ai-context-entry'; document.body.append(trigger);
    const b = backend(), c = backend(), p = backend(), counters = { sourceReads: 0, activeChecks: 0, network: 0, permissions: 0, copies: 0 };
    let mounted, controller, reply = 'Synthetic answer', discard = true;
    const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const window = rootEvents({ document, chrome: { permissions: {} }, LocalItabPrompts: Prompts,
        LocalItabWorkspaces: { session: { invalidated: false } }, LocalItabContentLifecycle: { departing: false },
        i18n: { t: key => messages[key]?.message || key }, getComputedStyle: node => node.style,
        confirm: () => discard,
        LocalItabAIContext: { createController() {
            controller = new Context.Controller({ ensureActive: async () => { counters.activeChecks++; },
                readSources: async () => { counters.sourceReads++; return [
                    { id: 'collection:synthetic', label: 'Synthetic title', text: 'Saved\r\nexcerpt 🧪', scope: 'library' },
                    { id: 'note:synthetic', label: 'Workspace note', text: 'Saved note', scope: 'workspace' }
                ]; }, taskStore: new Tasks.Store(b), collectionStore: new Collections.Store(c),
                transport: { review: input => ({ ...input, origin: 'https://mock.example', permission: 'https://mock.example:443/*' }),
                    run: async () => { counters.network++; return { text: await reply }; } },
                permissions: { request: async () => { counters.permissions++; return true; }, contains: async () => { counters.permissions++; return true; } } });
            const review = controller.review.bind(controller); controller.review = input => review(JSON.parse(JSON.stringify(input)));
            return controller;
        } } });
    const context = vm.createContext({ window });
    for (const file of ['shared/dialog-focus.js', 'shared/ai-context-view.js', 'ai-context.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    const mount = window.LocalItabAIContextView.mount;
    window.LocalItabAIContextView.mount = (host, options) => (mounted = mount(host, { ...options, presetStore: null,
        promptStore: new Prompts.Store(p), clipboard: { writeText: async () => { counters.copies++; } } }));
    const q = selector => document.querySelector(selector);
    const instrumentSearch = () => { const search = q('.ai-context-source-search'); search.selections = 0;
        search.select = () => { search.selections++; search.selectionStart = 0; search.selectionEnd = search.value.length; }; };
    const open = async () => { trigger.focus(); trigger.dispatch('click'); await mounted.ready; instrumentSearch(); };
    await open();
    return { document, window, trigger, open, q, b, c, p, counters, messages,
        get view() { return mounted; }, get controller() { return controller; },
        setReply: value => { reply = value; }, setDiscard: value => { discard = value; },
        input(node, value) { node.value = value; node.dispatch('input'); },
        click(key) { const node = q('.ai-context').querySelectorAll('button').find(item => item.textContent === messages[`aiContext${key}`]?.message || (key === 'Confirm' && item.textContent.startsWith(messages.aiContextConfirm.message + ' ('))); assert(node, key); assert(!node.disabled, key); node.dispatch('click'); },
        io() { return JSON.stringify({ counters, reads: [b.reads, c.reads, p.reads], writes: [b.writes, c.writes, p.writes] }); } };
}
function useShortcut(h, fields) {
    h.q('.ai-context-close').focus();
    return dispatch(h, 'keydown', fields);
}
async function review(h) {
    h.q('.ai-context-connection').open = true;
    h.input(h.q('.ai-context-endpoint'), 'https://mock.example/v1/chat/completions');
    h.input(h.q('.ai-context-model'), 'synthetic'); h.input(h.q('.ai-context-question'), 'Synthetic question');
    h.click('ReviewLocal'); await settle(); assert(h.controller.localReview);
    const local = h.controller.localReview, before = h.io();
    assert.equal(useShortcut(h).defaultPrevented, true); assert.equal(h.controller.localReview, local); assert.equal(h.io(), before);
    h.click('Review'); await settle(); assert(h.controller.reviewed);
}
for (const locale of ['en', 'zh_CN']) test(`source slash: ${locale} owns initial dialog focus, selects exact query and exposes a visible accessible hint`, async () => {
    const h = await page(locale), search = h.q('.ai-context-source-search');
    h.input(search, '  中文 / 🧪  '); const draft = h.view.captureDraft(), before = h.io();
    assert.equal(useShortcut(h).defaultPrevented, true); assert.equal(h.document.activeElement, search);
    assert.equal(search.selectionStart, 0); assert.equal(search.selectionEnd, search.value.length); assert.equal(search.selections, 1);
    assert.equal(search.value, '  中文 / 🧪  '); assert.equal(draft(), true); assert.equal(h.io(), before);
    assert.equal(search.getAttribute('aria-keyshortcuts'), '/');
    const hint = h.q('.ai-context-source-search-shortcut'); assert(hint); assert(hint.getClientRects().length);
    assert.equal(hint.textContent, locale === 'en' ? 'Press / to search sources when not editing text.' : '未编辑文字时，按 / 搜索来源。');
    assert(search.getAttribute('aria-describedby').split(/\s+/).includes(hint.id));
    h.view.destroy();
});
test('source slash: editors, editable ancestors, active editor and unrelated focus leave literal keys unhandled', async () => {
    const h = await page(), box = h.q('.ai-context'), search = h.q('.ai-context-source-search');
    for (const tag of ['input', 'textarea', 'select']) {
        const field = h.document.createElement(tag); box.append(field); field.focus(); field.value = 'literal';
        assert.equal(dispatch(h).defaultPrevented, false); assert.equal(field.value, 'literal'); assert.equal(h.document.activeElement, field);
        assert.equal(dispatch(h, 'keydown', {}, h.q('.ai-context-close')).defaultPrevented, false, 'active editor also guards retargeted events');
        h.q('.ai-context-close').focus(); assert.equal(dispatch(h, 'keydown', {}, field).defaultPrevented, false, 'editable target independently guards');
    }
    for (const value of ['', 'true', 'plaintext-only']) {
        const editor = h.document.createElement('div'), child = h.document.createElement('span'); editor.setAttribute('contenteditable', value); editor.append(child); box.append(editor); child.focus();
        assert.equal(dispatch(h).defaultPrevented, false); assert.equal(h.document.activeElement, child);
    }
    const shadowEditor = h.document.createElement('textarea');
    assert.equal(useShortcut(h, { composedPath: () => [shadowEditor, box] }).defaultPrevented, false, 'retargeted editor path');
    h.document.designMode = 'on'; assert.equal(useShortcut(h).defaultPrevented, false); h.document.designMode = 'off';
    search.focus(); assert.equal(dispatch(h).defaultPrevented, false, 'slash in search stays literal');
    h.document.activeElement = h.trigger; assert.equal(dispatch(h, 'keydown', {}, h.q('.ai-context-close')).defaultPrevented, false, 'focus outside current panel');
    h.q('.ai-context-close').focus(); assert.equal(dispatch(h, 'keydown', {}, h.trigger).defaultPrevented, false, 'outside target is not locally owned');
    assert.equal(search.selections, 0); h.view.destroy();
});
test('source slash: IME flags and lifecycle, modifiers, repeats and consumed events remain untouched', async () => {
    const h = await page(), search = h.q('.ai-context-source-search'), close = h.q('.ai-context-close');
    for (const fields of [{ isComposing: true }, { keyCode: 229 }, { repeat: true }, { ctrlKey: true }, { metaKey: true },
        { altKey: true }, { getModifierState: key => key === 'AltGraph' }, { key: '?' }, { key: 'f', ctrlKey: true }]) {
        assert.equal(useShortcut(h, fields).defaultPrevented, false);
    }
    useShortcut(h, { defaultPrevented: true }); assert.equal(search.selections, 0);
    assert.equal(useShortcut(h, { shiftKey: true }).defaultPrevented, true, 'a keyboard layout may use Shift to produce literal /');
    close.focus(); dispatch(h, 'compositionstart'); assert.equal(dispatch(h).defaultPrevented, false);
    dispatch(h, 'compositionend'); assert.equal(dispatch(h).defaultPrevented, true);
    close.focus(); dispatch(h, 'compositionstart'); dispatch(h, 'focusout'); assert.equal(dispatch(h).defaultPrevented, true);
    const temporary = h.document.createElement('button'); h.q('.ai-context').append(temporary); temporary.focus(); dispatch(h, 'compositionstart'); temporary.remove();
    assert.equal(useShortcut(h).defaultPrevented, true, 'removed IME target cannot strand shortcut');
    close.focus(); dispatch(h, 'compositionstart'); h.q('.ai-context-status').focus(); assert.equal(dispatch(h).defaultPrevented, true, 'missed blur is recovered');
    h.view.destroy();
});
test('source slash: hidden, disconnected, inert, disabled, failed-focus, departing and stale session guards do not swallow keys', async () => {
    const h = await page(), search = h.q('.ai-context-source-search'), box = h.q('.ai-context'), panel = h.q('.ai-context-dialog');
    const probes = [
        [h.document, 'visibilityState', 'hidden'], [h.document, 'hidden', true], [box, 'hidden', true], [panel, 'inert', true],
        [search, 'disabled', true], [search.style, 'visibility', 'hidden'], [panel.style, 'display', 'none'],
        [h.window.LocalItabContentLifecycle, 'departing', true], [h.window.LocalItabWorkspaces.session, 'invalidated', true], [h.controller, 'closed', true]
    ];
    for (const [object, key, value] of probes) {
        h.q('.ai-context-close').focus(); const previous = object[key]; object[key] = value;
        assert.equal(dispatch(h, 'keydown', {}, h.q('.ai-context-close')).defaultPrevented, false, key); object[key] = previous;
    }
    const original = h.window.LocalItabWorkspaces.session; h.window.LocalItabWorkspaces.session = {};
    assert.equal(useShortcut(h).defaultPrevented, false); h.window.LocalItabWorkspaces.session = original;
    const focus = search.focus; search.focus = () => {}; assert.equal(useShortcut(h).defaultPrevented, false); search.focus = focus;
    const parent = search.parentElement; search.remove(); assert.equal(useShortcut(h).defaultPrevented, false); parent.append(search);
    assert.equal(search.selections, 0); assert.equal(useShortcut(h).defaultPrevented, true);
    h.view.destroy();
});
test('source slash: prompt picker and other visible modals block, but own wrapper and hidden/nonmodal elements do not', async () => {
    const h = await page(); h.click('PromptReuse'); await settle();
    assert.equal(h.q('.ai-context-prompt-picker').hidden, false); assert.equal(useShortcut(h).defaultPrevented, false);
    h.click('PromptClose'); assert.equal(useShortcut(h).defaultPrevented, true);
    for (const kind of ['dialog', 'alertdialog', 'native']) {
        const modal = h.document.createElement(kind === 'native' ? 'dialog' : 'section');
        if (kind === 'native') modal.open = true; else { modal.setAttribute('role', kind); modal.setAttribute('aria-modal', 'true'); }
        h.document.body.append(modal); assert.equal(useShortcut(h).defaultPrevented, false, kind);
        modal.hidden = true; assert.equal(useShortcut(h).defaultPrevented, true, `hidden ${kind}`);
        modal.hidden = false; modal.style.visibility = 'hidden'; assert.equal(useShortcut(h).defaultPrevented, true, `CSS-hidden ${kind}`); modal.remove();
    }
    const nonmodal = h.document.createElement('section'); nonmodal.setAttribute('role', 'dialog'); h.document.body.append(nonmodal);
    assert.equal(useShortcut(h).defaultPrevented, true); h.view.destroy();
});
test('source slash: filters, hidden selection, exact reviews, request, answer snapshot and unconfirmed receipt remain unchanged with zero extra I/O', async () => {
    const h = await page(), row = h.q('.ai-context-source'), check = row.querySelector('input'), text = row.querySelector('textarea');
    check.checked = true; check.dispatch('change'); h.input(text, 'Edited synthetic excerpt');
    h.input(h.q('.ai-context-source-search'), 'no visible match'); h.q('.ai-context-source-scope').value = 'library'; h.q('.ai-context-source-scope').dispatch('change');
    h.click('SourceSelectedOnly'); const excerptOption = h.q('.ai-context-source-search-excerpts'); excerptOption.checked = true; excerptOption.dispatch('change');
    await review(h);
    const unchanged = () => {
        const draft = h.view.captureDraft(), before = h.io(), reviewed = h.controller.reviewed, local = h.controller.localReview,
            result = h.controller.result, resultReview = h.controller.resultReview, command = h.controller.saveCommand, state = h.c.snapshot();
        const snapshot = result ? h.controller.answerSnapshot() : null;
        assert.equal(useShortcut(h).defaultPrevented, true); assert.equal(draft(), true); assert.equal(h.io(), before);
        assert.equal(h.controller.reviewed, reviewed); assert.equal(h.controller.localReview, local); assert.equal(h.controller.result, result);
        assert.equal(h.controller.resultReview, resultReview); assert.equal(h.controller.saveCommand, command); assert.deepEqual(h.c.snapshot(), state);
        if (snapshot) assert.deepEqual(h.controller.answerSnapshot(), snapshot);
        assert.equal(row.hidden, true); assert.equal(check.checked, true); assert.equal(text.value, 'Edited synthetic excerpt'); assert.equal(excerptOption.checked, true);
    };
    unchanged(); const request = deferred(); h.setReply(request.promise); h.click('Send'); await settle();
    assert.equal(h.controller.busy, true); unchanged(); request.resolve('Synthetic answer'); await settle(); assert(h.controller.result); unchanged();
    h.q('.ai-context-save-context').querySelector('input').checked = true; h.q('.ai-context-save-context').querySelector('input').dispatch('change');
    h.c.fail = true; let operation; const save = h.controller.saveAnswer.bind(h.controller);
    h.controller.saveAnswer = (...args) => (operation = save(...args)); h.click('Save'); await operation.catch(() => {}); await settle();
    assert(h.controller.saveCommand); assert.equal(h.controller.saveUncertain, true); unchanged(); h.view.destroy();
});
test('source slash: Tab, IME Escape, canceled dismissal, opener restore and reopened listener ownership stay intact', async () => {
    const h = await page(), oldPanel = h.q('.ai-context-dialog'), oldSearch = h.q('.ai-context-source-search');
    assert.equal(useShortcut(h).defaultPrevented, true);
    const close = h.q('.ai-context-close'), connection = h.q('.ai-context-connection');
    connection.querySelector('summary').focus(); assert.equal(dispatch(h, 'keydown', { key: 'Tab' }).defaultPrevented, true); assert.equal(h.document.activeElement, close);
    assert.equal(dispatch(h, 'keydown', { key: 'Tab', shiftKey: true }).defaultPrevented, true); assert.equal(h.document.activeElement, connection.querySelector('summary'));
    assert.equal(dispatch(h, 'keydown', { key: 'Escape', isComposing: true }).defaultPrevented, false); assert(oldPanel.isConnected);
    h.input(h.q('.ai-context-question'), 'Keep this draft'); h.setDiscard(false); dispatch(h, 'keydown', { key: 'Escape' }); assert(oldPanel.isConnected);
    assert.equal(useShortcut(h).defaultPrevented, true); h.setDiscard(true); dispatch(h, 'keydown', { key: 'Escape' });
    assert.equal(oldPanel.isConnected, false); assert.equal(h.document.activeElement, h.trigger);
    for (const type of ['keydown', 'compositionstart', 'compositionend', 'focusout']) assert.equal(oldPanel.listeners.get(type)?.length || 0, 0);
    await h.open(); const fresh = h.q('.ai-context-source-search'); assert.notEqual(fresh, oldSearch);
    const selected = oldSearch.selections; assert.equal(useShortcut(h).defaultPrevented, true); assert.equal(fresh.selections, 1); assert.equal(oldSearch.selections, selected);
    h.window.emit('pagehide'); assert.equal(h.q('.ai-context-dialog'), null); assert.equal(h.window.aiContextView, null);
});


test('source slash: hidden-page composition resets, standalone mounts stay local and teardown removes every listener', async () => {
    const h = await page(), close = h.q('.ai-context-close'); close.focus(); dispatch(h, 'compositionstart');
    h.document.visibilityState = 'hidden'; await h.document.listeners.get('visibilitychange')();
    assert.equal(dispatch(h).defaultPrevented, false);
    h.document.visibilityState = 'visible'; await h.document.listeners.get('visibilitychange')();
    assert.equal(useShortcut(h).defaultPrevented, true);
    h.window.aiContextView.destroy();
    const host = h.document.createElement('div'); h.document.body.append(host);
    const controller = h.window.LocalItabAIContext.createController();
    const view = h.window.LocalItabAIContextView.mount(host, { controller }); await view.ready;
    const box = host.querySelector('.ai-context'), search = host.querySelector('.ai-context-source-search');
    let selections = 0; search.select = () => { selections++; };
    host.querySelector('.ai-context-status').focus(); assert.equal(dispatch(h).defaultPrevented, true); assert.equal(selections, 1);
    const outside = h.document.createElement('button'); h.document.body.append(outside); outside.focus();
    assert.equal(dispatch(h).defaultPrevented, false); assert.equal(selections, 1);
    view.destroy(); view.destroy();
    for (const type of ['keydown', 'compositionstart', 'compositionend', 'focusout']) assert.equal(box.listeners.get(type)?.length || 0, 0);
});
test('source slash: task selection, review and uncertain task-batch receipt are unchanged without reads or writes', async () => {
    const h = await page(), mode = h.q('.ai-context-mode'); mode.value = 'tasks'; mode.dispatch('change');
    h.setReply('{"tasks":["Synthetic first task","Synthetic second task"]}'); await review(h); h.click('Send'); await settle();
    const choices = h.q('.ai-context-task-choices').querySelectorAll('input'); choices[1].checked = false; choices[1].dispatch('change');
    h.click('ReviewTasks'); await settle(); assert(h.controller.taskReview);
    const assertUnchanged = () => {
        const draft = h.view.captureDraft(), before = h.io(), review = h.controller.taskReview, selection = h.controller.taskSelection,
            command = h.controller.taskCommand, raw = h.b.snapshot();
        assert.equal(useShortcut(h).defaultPrevented, true); assert.equal(draft(), true); assert.equal(h.io(), before);
        assert.equal(h.controller.taskReview, review); assert.equal(h.controller.taskSelection, selection); assert.equal(h.controller.taskCommand, command);
        assert.deepEqual(h.b.snapshot(), raw); assert.equal(choices[1].checked, false);
    };
    assertUnchanged(); h.b.fail = true; let operation; const confirm = h.controller.confirmTasks.bind(h.controller);
    h.controller.confirmTasks = (...args) => (operation = confirm(...args)); h.click('Confirm'); await operation.catch(() => {}); await settle();
    assert.equal(h.controller.taskUncertain, true); assert(h.controller.taskCommand); assertUnchanged(); h.view.destroy();
});
