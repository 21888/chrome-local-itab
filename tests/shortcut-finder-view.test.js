const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDocument } = require('./helpers/finder-dom-model');
const base = path.join(__dirname, '..');
function setup() {
    const document = createDocument(); const host = document.createElement('header'); document.body.append(host);
    const calls = []; const links = [{ title: '中文 Café', url: 'https://a.test', category: 'work', layoutId: 'l_11111111111111111111111111111111' }, { title: '中文 Café', url: 'https://a.test', category: 'learn', layoutId: 'l_22222222222222222222222222222222' }];
    let notify; const context = { window: null, document, URL }; context.window = context; vm.createContext(context);
    for (const file of ['../shared/dialog-focus.js', '../shared/shortcut-finder.js', '../shared/shortcut-finder-view.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context);
    const view = context.LocalItabFinder.mount(host, { getSnapshot: () => ({ links, categories: [] }), activate: link => calls.push(link), subscribe(fn) { notify = fn; return () => { notify = null; }; } });
    const opener = host.querySelector('button'); opener.focus(); opener.dispatch('click');
    return { document, host, links, calls, view, opener, notify: () => notify?.(), input: document.querySelector('input') };
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
test('source contract: local-only reads, text-safe rendering, no global keys, native result activation', () => {
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
