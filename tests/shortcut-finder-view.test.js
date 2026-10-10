const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDocument } = require('./helpers/finder-dom-model');
const base = path.join(__dirname, '..');
function setup({ opened = true, locale, shortcutEnabled } = {}) {
    const document = createDocument(); const host = document.createElement('header'); document.body.append(host);
    const calls = []; const links = [{ title: '中文 Café', url: 'https://a.test', category: 'work', layoutId: 'l_11111111111111111111111111111111' }, { title: '中文 Café', url: 'https://a.test', category: 'learn', layoutId: 'l_22222222222222222222222222222222' }];
    const messages = locale && JSON.parse(fs.readFileSync(path.join(base, '_locales', locale, 'messages.json'), 'utf8'));
    let notify; const context = { window: null, document, URL, i18n: { t: key => messages?.[key]?.message || key } }; context.window = context; vm.createContext(context);
    for (const file of ['../shared/dialog-focus.js', '../shared/shortcut-finder.js', '../shared/shortcut-finder-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context);
    const view = context.LocalItabFinder.mount(host, { shortcutEnabled, getSnapshot: () => ({ links, categories: [] }), activate: link => calls.push(link), subscribe(fn) { notify = fn; return () => { notify = null; }; } });
    const opener = host.querySelector('button'); if (opened) { opener.focus(); opener.dispatch('click'); }
    return { document, host, links, calls, view, opener, context, notify: () => notify?.(), input: document.querySelector('input') };
}
test('input, navigation, clearing, refresh, dismissal never activate; native click activates one exact occurrence', async () => {
    const f = setup(); const before = JSON.stringify(f.links);
    f.input.value = '中文'; f.input.dispatch('input');
    const results = f.document.querySelectorAll('.finder-result'); assert.equal(results.length, 2);
    f.input.dispatch('keydown', { key: 'ArrowDown' }); assert.equal(f.document.activeElement, results[0]);
    results[0].dispatch('keydown', { key: 'ArrowDown' }); assert.equal(f.document.activeElement, results[1]);
    // Model does not synthesize native clicks; keydown itself must not launch.
    results[1].dispatch('keydown', { key: 'Enter' }); assert.equal(f.calls.length, 0);
    results[1].dispatch('click', { detail: 0 }); await new Promise(setImmediate); assert.equal(f.calls.length, 1); assert.equal(f.calls[0], f.links[1]);
    f.notify(); assert.equal(f.document.activeElement, f.input);
    f.view.close(); assert.equal(f.document.activeElement, f.opener); assert.equal(f.host.inert, false);
    assert.equal(JSON.stringify(f.links), before); f.view.destroy(); assert.equal(f.host.children.length, 0);
});
test('stale result does not launch another index; no interpolation; IME defers results', async () => {
    const f = setup(); f.input.value = 'cafe'; f.input.dispatch('input');
    const stale = f.document.querySelectorAll('.finder-result')[1]; f.links.pop(); stale.dispatch('click'); await new Promise(setImmediate);
    assert.equal(f.calls.length, 0); assert.equal(f.document.querySelectorAll('.finder-result').length, 1);
    f.input.dispatch('compositionstart'); f.input.value = 'missing'; f.input.dispatch('input');
    assert.equal(f.document.querySelectorAll('.finder-result').length, 1);
    f.document.querySelector('.finder-result').dispatch('click', { detail: 0 }); assert.equal(f.calls.length, 0);
    f.input.dispatch('compositionend'); assert.equal(f.document.querySelectorAll('.finder-result').length, 0);
    f.view.close();
});
test('source contract: local-only reads, text-safe rendering, no document-level keys, native result activation', () => {
    const source = ['shared/shortcut-finder.js', 'shared/shortcut-finder-view.js'].map(file => fs.readFileSync(path.join(base, file), 'utf8')).join('\n');
    for (const pattern of [/fetch\s*\(/, /XMLHttpRequest/, /chrome\.(history|tabs|bookmarks)/, /localStorage/, /\.storage\./, /innerHTML/, /buildSearchUrl/, /navigator\.clipboard/, /document\.addEventListener/]) assert.doesNotMatch(source, pattern);
    assert.match(source, /textContent/); assert.match(source, /event\.repeat/); assert.match(source, /stopImmediatePropagation/);
});
test('host adapter observes only local links/categories and never mutates active component/editor', () => {
    let handler; let removed; let options;
    const context = { window: null, chrome: { storage: { onChanged: { addListener(fn) { handler = fn; }, removeListener(fn) { removed = fn; } } } }, LocalItabFinder: { mount(host, value) { options = value; return value; } } };
    context.window = context; vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(base, 'shared/shortcut-finder-host.js'), 'utf8'), context);
    const component = { links: [{ title: 'Old', url: 'https://old.test' }], categories: [], currentEditIndex: 0, draft: 'unsaved', openShortcutRecord(link) { this.opened = link; } };
    const before = JSON.stringify(component); let refreshes = 0;
    context.LocalItabFinder.mountForShortcuts({}, component); const unsubscribe = options.subscribe(() => refreshes++);
    handler({ links: { newValue: [{ title: 'Remote', url: 'https://new.test' }] } }, 'sync'); assert.equal(refreshes, 0);
    handler({ tasks: { newValue: 'private' } }, 'local'); assert.equal(refreshes, 0);
    const newest = [{ title: 'New', url: 'https://new.test' }]; handler({ links: { newValue: newest } }, 'local');
    assert.equal(refreshes, 1); assert.equal(options.getSnapshot().links, newest); assert.equal(JSON.stringify(component), before);
    unsubscribe(); assert.equal(removed, handler);
});
test('IME Enter/Space/Escape and keyCode 229 do not activate or dismiss; ordinary Escape restores opener', () => {
    const f = setup(); f.input.value = 'cafe'; f.input.dispatch('input');
    for (const fields of [{ key: 'Escape', isComposing: true }, { key: 'Escape', keyCode: 229 }, { key: 'Enter', isComposing: true }]) {
        f.input.dispatch('keydown', fields); assert.ok(f.document.querySelector('.finder-overlay'));
    }
    const result = f.document.querySelector('.finder-result');
    for (const key of ['Enter', ' ']) assert.equal(result.dispatch('keydown', { key, isComposing: true }).prevented, true);
    assert.equal(f.calls.length, 0); assert.equal(f.view.hasUncommittedWork(), true);
    f.input.dispatch('keydown', { key: 'Escape' }); assert.equal(f.view.hasUncommittedWork(), false); assert.equal(f.document.activeElement, f.opener);
});
test('host reserves only its own blank tab, severs opener and relinquishes ownership after success', async () => {
    let options, target; const calls = [];
    const context = { window: null, open(url, name) { calls.push([url, name]); target = { opener: 'parent', closed: false, location: { href: 'about:blank' }, close() { this.closed = true; calls.push('close'); } }; return target; },
        chrome: { storage: { local: { async get(keys) { calls.push(keys); return { links: [{ title: 'fresh', url: 'https://fresh.test' }] }; } }, onChanged: { addListener() {}, removeListener() {} } } },
        LocalItabFinder: { mount(host, value) { options = value; return value; } } };
    context.window = context; vm.createContext(context); vm.runInContext(fs.readFileSync(path.join(base, 'shared/shortcut-finder-host.js'), 'utf8'), context);
    context.LocalItabFinder.mountForShortcuts({}, { links: [], categories: [], openShortcutRecord(link, tab) { assert.equal(tab.opener, null); calls.push(link.url); return true; } });
    const lease = options.reserve(); assert.equal(target.opener, null); assert.equal(calls[0][0], 'about:blank');
    const fresh = await options.readSnapshot(); assert.equal(fresh.links[0].title, 'fresh');
    lease.open(fresh.links[0]); lease.close(); assert.equal(target.closed, false); assert.equal(calls.filter(value => value === 'close').length, 0);
    const cancelled = options.reserve(); cancelled.close(); cancelled.close(); assert.equal(calls.filter(value => value === 'close').length, 1);
    const userNavigated = options.reserve(); target.location.href = 'https://user-choice.test'; userNavigated.close(); assert.equal(target.closed, false); assert.equal(userNavigated.open(fresh.links[0]), false);
});

test('page Slash opens the existing Finder with hidden search, preserves data and restores the actual prior focus', () => {
    const f = setup({ opened: false });
    const search = f.document.createElement('section'); search.hidden = true;
    const webInput = f.document.createElement('input'); search.append(webInput); f.document.body.append(search);
    const origin = f.document.createElement('div'); origin.tabIndex = 0; f.document.body.append(origin); origin.focus();
    const before = JSON.stringify(f.links);
    assert.equal(origin.dispatch('keydown', { key: '/', code: 'Slash' }).prevented, true);
    const input = f.document.querySelector('.finder-input');
    assert.ok(input); assert.equal(f.document.activeElement, input); assert.equal(input.value, '');
    assert.equal(f.view.hasUncommittedWork(), true);
    input.value = '中文'; input.dispatch('input'); assert.equal(f.document.querySelectorAll('.finder-result').length, 2);
    assert.equal(f.calls.length, 0); assert.equal(JSON.stringify(f.links), before);
    input.dispatch('keydown', { key: 'Escape' });
    assert.equal(f.document.activeElement, origin); assert.equal(f.view.hasUncommittedWork(), false);
    assert.equal(f.document.querySelector('.finder-overlay'), null);
    f.view.destroy();
});
test('Slash follows the typed character, including shifted non-US keys, but never modifier/browser shortcuts', () => {
    const f = setup({ opened: false });
    for (const fields of [
        { key: '?', code: 'Slash', shiftKey: true }, { key: 'Dead', code: 'Slash' },
        { key: '/', ctrlKey: true }, { key: '/', altKey: true }, { key: '/', metaKey: true },
        { key: '/', ctrlKey: true, altKey: true }, { key: '/', repeat: true },
        { key: '/', isComposing: true }, { key: '/', keyCode: 229 }, { key: '/', defaultPrevented: true }
    ]) {
        assert.equal(f.document.body.dispatch('keydown', fields).prevented, false, JSON.stringify(fields));
        assert.equal(f.document.querySelector('.finder-overlay'), null);
    }
    for (const fields of [{ key: '/', code: 'Digit7', shiftKey: true }, { key: '/', code: 'NumpadDivide' }]) {
        assert.equal(f.document.body.dispatch('keydown', fields).prevented, true);
        assert.equal(f.document.querySelectorAll('.finder-overlay').length, 1);
        f.view.close();
    }
    f.view.destroy();
});
test('page composition, nested editable content and native controls keep their Slash interaction', () => {
    const f = setup({ opened: false });
    f.document.body.dispatch('compositionstart');
    assert.equal(f.document.body.dispatch('keydown', { key: '/' }).prevented, false);
    f.document.body.dispatch('compositionend');
    const cases = ['input', 'textarea', 'select', 'audio', 'video', 'iframe', 'object', 'embed'];
    for (const tag of cases) {
        const node = f.document.createElement(tag); if (tag === 'a') node.setAttribute('href', 'https://example.test');
        f.document.body.append(node); node.focus();
        assert.equal(node.dispatch('keydown', { key: '/' }).prevented, false, tag);
        assert.equal(f.document.querySelector('.finder-overlay'), null, tag); node.remove();
    }
    for (const attribute of ['true', '', 'plaintext-only', 'false']) {
        const editor = f.document.createElement('div'); editor.setAttribute('contenteditable', attribute);
        const child = f.document.createElement('span'); editor.append(child); f.document.body.append(editor);
        assert.equal(child.dispatch('keydown', { key: '/' }).prevented, false); editor.remove();
    }
    for (const role of ['textbox', 'combobox', 'listbox', 'slider', 'spinbutton']) {
        const widget = f.document.createElement('div'); widget.setAttribute('role', role); f.document.body.append(widget);
        assert.equal(widget.dispatch('keydown', { key: '/' }).prevented, false, role); widget.remove();
    }
    f.document.designMode = 'on';
    assert.equal(f.document.body.dispatch('keydown', { key: '/' }).prevented, false);
    f.document.designMode = 'off';
    assert.equal(f.document.body.dispatch('keydown', { key: '/' }).prevented, true);
    f.view.destroy();
});
test('retargeted events and active editable elements cannot bypass the editing guard', () => {
    const f = setup({ opened: false }); const input = f.document.createElement('input'); f.document.body.append(input);
    assert.equal(f.document.body.dispatch('keydown', { key: '/', composedPath: () => [input, f.document.body] }).prevented, false);
    input.focus();
    assert.equal(f.document.body.dispatch('keydown', { key: '/' }).prevented, false);
    input.remove();
    const editable = f.document.createElement('div'); editable.isContentEditable = true; f.document.body.append(editable);
    assert.equal(editable.dispatch('keydown', { key: '/' }).prevented, false);
    f.view.destroy();
});
test('visible dialogs, menus and inert content block Slash even when focus remains outside', () => {
    const f = setup({ opened: false });
    for (const role of ['dialog', 'alertdialog', 'menu']) {
        const wrapper = f.document.createElement('div'); const panel = f.document.createElement('section');
        panel.setAttribute('role', role); wrapper.append(panel); f.document.body.append(wrapper);
        assert.equal(f.document.body.dispatch('keydown', { key: '/' }).prevented, false, role);
        wrapper.hidden = true;
        assert.equal(f.document.body.dispatch('keydown', { key: '/' }).prevented, true); f.view.close();
        wrapper.hidden = false; wrapper.setAttribute('aria-hidden', 'true');
        assert.equal(f.document.body.dispatch('keydown', { key: '/' }).prevented, true); f.view.close();
        wrapper.remove();
    }
    const nativeDialog = f.document.createElement('dialog'); nativeDialog.open = true; f.document.body.append(nativeDialog);
    assert.equal(f.document.body.dispatch('keydown', { key: '/' }).prevented, false); nativeDialog.remove();
    const modal = f.document.createElement('div'); modal.className = 'modal-overlay active'; f.document.body.append(modal);
    assert.equal(f.document.body.dispatch('keydown', { key: '/' }).prevented, false); modal.remove();
    const inert = f.document.createElement('div'); inert.inert = true; f.document.body.append(inert);
    assert.equal(inert.dispatch('keydown', { key: '/' }).prevented, false);
    f.view.destroy();
});
test('open Finder does not reopen or eat query slashes, and destroy/remount removes exactly the owned listeners', () => {
    const f = setup({ opened: false });
    const foreign = () => {}; f.document.body.addEventListener('keydown', foreign);
    f.document.body.dispatch('keydown', { key: '/' });
    const input = f.document.querySelector('.finder-input');
    input.value = 'https://a.test/';
    assert.equal(input.dispatch('keydown', { key: '/' }).prevented, false);
    assert.equal(input.dispatch('keydown', { key: '/', repeat: true }).prevented, false);
    assert.equal(f.document.querySelector('.finder-input'), input); assert.equal(input.value, 'https://a.test/');
    assert.equal(f.document.querySelectorAll('.finder-overlay').length, 1);
    f.view.destroy();
    assert.deepEqual(f.document.body.listeners.get('keydown'), [foreign]);
    assert.equal(f.document.body.listeners.get('compositionstart').length, 0);
    assert.equal(f.document.body.listeners.get('compositionend').length, 0);
    assert.equal(f.document.body.dispatch('keydown', { key: '/' }).prevented, false);
    const view = f.context.LocalItabFinder.mount(f.host, { getSnapshot: () => ({ links: f.links, categories: [] }) });
    assert.equal(f.document.body.listeners.get('keydown').length, 2);
    assert.equal(f.document.body.dispatch('keydown', { key: '/' }).prevented, true);
    assert.equal(f.document.querySelectorAll('.finder-overlay').length, 1); view.destroy();
});
test('localized quiet key hint has a descriptive accessible shortcut and preserves mouse-open focus semantics', () => {
    for (const locale of ['en', 'zh_CN']) {
        const f = setup({ opened: false, locale });
        const messages = JSON.parse(fs.readFileSync(path.join(base, '_locales', locale, 'messages.json'), 'utf8'));
        assert.equal(f.opener.textContent, messages.finderOpen.message);
        assert.equal(f.opener.getAttribute('aria-keyshortcuts'), '/');
        assert.equal(f.opener.getAttribute('aria-description'), messages.finderShortcutHint.message);
        assert.equal(f.opener.title, messages.finderShortcutHint.message);
        const hint = f.opener.querySelector('kbd'); assert.equal(hint.textContent, '/'); assert.equal(hint.getAttribute('aria-hidden'), 'true');
        f.opener.focus(); f.opener.dispatch('click');
        f.document.querySelector('.finder-input').dispatch('keydown', { key: 'Escape' });
        assert.equal(f.document.activeElement, f.opener);
        f.view.destroy();
    }
});

test('Slash from normal site buttons, links and Finder opener returns Escape to the exact control', () => {
    const f = setup({ opened: false });
    const button = f.document.createElement('button'); button.className = 'shortcut-launch';
    const link = f.document.createElement('a'); link.setAttribute('href', 'https://a.test/');
    f.document.body.append(button, link);
    for (const origin of [button, link, f.opener]) {
        origin.focus();
        assert.equal(origin.dispatch('keydown', { key: '/' }).prevented, true);
        const input = f.document.querySelector('.finder-input'); assert.equal(f.document.activeElement, input);
        input.dispatch('keydown', { key: 'Escape' });
        assert.equal(f.document.activeElement, origin);
    }
    assert.equal(f.calls.length, 0); f.view.destroy();
});

// Native Event supplies real defaultPrevented semantics; traverse the page route
// including document, while keeping layout/focus in the existing DOM model.
function emitPage(target, type = 'keydown', fields = { key: '/' }) {
    const route = [];
    for (let node = target; node; node = node.parentElement) route.push(node);
    if (route.includes(target.ownerDocument?.documentElement)) route.push(target.ownerDocument);
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'target', { value: target });
    Object.defineProperty(event, 'composedPath', { value: () => route });
    Object.assign(event, fields);
    for (const node of route) {
        const listeners = node.listeners.get(type);
        for (const listener of typeof listeners === 'function' ? [listeners] : [...(listeners || [])]) listener(event);
        if (event.cancelBubble) break;
    }
    return event;
}
test('real cancellation and body-to-document propagation preserve prior handlers and expose accepted Slash', () => {
    const f = setup({ opened: false }); const origin = f.document.createElement('button'); f.document.body.append(origin); origin.focus();
    let observed;
    f.document.addEventListener('keydown', event => { observed = event.defaultPrevented; });
    const cancel = event => event.preventDefault(); origin.addEventListener('keydown', cancel);
    assert.equal(emitPage(origin).defaultPrevented, true); assert.equal(observed, true);
    assert.equal(f.document.querySelector('.finder-overlay'), null);
    origin.removeEventListener('keydown', cancel); observed = false;
    assert.equal(emitPage(origin).defaultPrevented, true); assert.equal(observed, true);
    assert.ok(f.document.querySelector('.finder-overlay'));
    emitPage(f.document.querySelector('.finder-input'), 'keydown', { key: 'Escape' });
    assert.equal(f.document.activeElement, origin); f.view.destroy();
});
test('AltGraph-only, hidden document and detached host cannot open Finder', () => {
    const f = setup({ opened: false });
    assert.equal(emitPage(f.document.body, 'keydown', { key: '/', getModifierState: key => key === 'AltGraph' }).defaultPrevented, false);
    f.document.hidden = true;
    assert.equal(emitPage(f.document.body).defaultPrevented, false);
    f.document.hidden = false; f.document.visibilityState = 'hidden';
    assert.equal(emitPage(f.document.body).defaultPrevented, false);
    f.document.visibilityState = 'visible'; f.host.remove();
    assert.equal(emitPage(f.document.body).defaultPrevented, false);
    assert.equal(f.document.querySelector('.finder-overlay'), null);
    f.document.body.append(f.host); assert.equal(emitPage(f.document.body).defaultPrevented, true);
    f.view.destroy();
});
test('interrupted composition releases Slash after removal or focus departure without stealing active composition', () => {
    for (const interruption of ['removed', 'focus', 'focus-without-focusin']) {
        const f = setup({ opened: false });
        const input = f.document.createElement('input'), button = f.document.createElement('button');
        f.document.body.append(input, button); input.focus(); emitPage(input, 'compositionstart', {});
        assert.equal(emitPage(input).defaultPrevented, false);
        assert.equal(f.document.querySelector('.finder-overlay'), null);
        if (interruption === 'removed') {
            input.remove(); emitPage(input, 'compositionend', {});
        } else {
            button.focus();
            if (interruption === 'focus') emitPage(button, 'focusin', {});
        }
        assert.equal(emitPage(interruption === 'removed' ? f.document.body : button).defaultPrevented, true, interruption);
        f.view.destroy(); assert.equal(f.document.body.listeners.get('focusin').length, 0);
    }
    // An active composition on a focusable non-input element is guarded too.
    const f = setup({ opened: false }); const region = f.document.createElement('div'); region.tabIndex = 0;
    f.document.body.append(region); region.focus(); emitPage(region, 'compositionstart', {});
    assert.equal(emitPage(region).defaultPrevented, false);
    emitPage(region, 'compositionend', {});
    assert.equal(emitPage(region).defaultPrevented, true);
    f.view.destroy();
});

test('disabled Slash is not canceled or advertised; localized visible opener and explicit results still work', async () => {
    for (const locale of ['en', 'zh_CN']) {
        const f = setup({ opened: false, locale, shortcutEnabled: false });
        assert.equal(emitPage(f.document.body).defaultPrevented, false);
        assert.equal(f.document.querySelector('.finder-overlay'), null);
        assert.equal(f.opener.getAttribute('aria-keyshortcuts'), undefined);
        assert.equal(f.opener.getAttribute('aria-description'), undefined);
        assert.ok(!f.opener.title); assert.equal(f.opener.querySelector('kbd'), null);
        f.opener.focus(); assert.equal(emitPage(f.opener).defaultPrevented, false);
        f.opener.dispatch('click');
        const input = f.document.querySelector('.finder-input');
        assert.ok(input); assert.equal(emitPage(input).defaultPrevented, false);
        input.value = 'cafe'; input.dispatch('input');
        emitPage(input, 'keydown', {key: 'Enter'}); assert.equal(f.calls.length, 0);
        f.document.querySelector('.finder-result').dispatch('click', {detail: 0});
        await new Promise(setImmediate); assert.equal(f.calls.length, 1);
        input.dispatch('keydown', {key: 'Escape'}); assert.equal(f.document.activeElement, f.opener);
        f.view.destroy();
    }
});

test('host consumes the loaded preference; recreated Finder re-enables Slash without a live config listener', () => {
    const f = setup({opened: false, shortcutEnabled: false});
    f.view.destroy();
    f.context.chrome = {storage: {onChanged: {addListener() {}, removeListener() {}}}};
    vm.runInContext(fs.readFileSync(path.join(base, 'shared/shortcut-finder-host.js'), 'utf8'), f.context);
    const component = {links: f.links, categories: [], finderShortcutEnabled: false};
    let view = f.context.LocalItabFinder.mountForShortcuts(f.host, component);
    assert.equal(emitPage(f.document.body).defaultPrevented, false);
    view.destroy(); component.finderShortcutEnabled = true;
    view = f.context.LocalItabFinder.mountForShortcuts(f.host, component);
    assert.equal(f.host.querySelector('button').getAttribute('aria-keyshortcuts'), '/');
    assert.equal(emitPage(f.document.body).defaultPrevented, true);
    assert.ok(f.document.querySelector('.finder-overlay')); view.destroy();
});
