const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHarness } = require('./helpers/dashboard-harness');
const clone = value => JSON.parse(JSON.stringify(value));

for (const template of ['clarity', 'graphite', 'folio']) {
    for (const mode of ['grid', 'free', 'snap']) {
        const h = createHarness();
        h.document.documentElement.dataset.dashboardTemplate = template;
        h.component.layout = { ...h.component.layout, autoArrange: mode === 'grid', alignToGrid: mode === 'snap', positions: { saved: { x: 31.5, y: 76.25 } } };
        const before = clone({ links: h.component.links, layout: h.component.layout, categories: h.component.categories });
        let mounts = 0, destroys = 0;
        h.context.window.LocalItabFinder = { mountForShortcuts(host, component) {
            assert.equal(host.className, 'shortcuts-header'); assert.equal(component, h.component);
            mounts++; return { destroy() { destroys++; } };
        } };
        h.component.render(); h.component.render();
        assert.equal(mounts, 2); assert.equal(destroys, 1, 'rerender tears down the prior Finder/listener');
        assert.deepEqual(clone({ links: h.component.links, layout: h.component.layout, categories: h.component.categories }), before);
        const link = { title: 'Exact record', url: 'https://example.test/path?q=ok#section' };
        let replaced;
        const reserved = { closed: false, location: { replace(url) { replaced = url; } } };
        assert.equal(h.component.openShortcutRecord(link, reserved), true); assert.equal(replaced, link.url); assert.equal(h.opened.length, 0);
        assert.equal(h.component.openShortcutRecord({ url: 'javascript:alert(1)' }, reserved), false); assert.equal(replaced, link.url);
        reserved.closed = true;
        assert.equal(h.component.openShortcutRecord({ url: 'https://other.test/' }, reserved), false); assert.equal(replaced, link.url);
        h.component.openShortcut(0); assert.equal(h.opened.length, 1, 'existing tile opener still follows the same path');
    }
}
const html = fs.readFileSync('newtab.html', 'utf8');
let previous = html.indexOf('shared/dialog-focus.js');
for (const script of ['shortcut-finder.js', 'shortcut-finder-view.js', 'shortcut-finder-host.js', 'newtab.js']) {
    const index = html.indexOf(script); assert(index > previous, `script order ${script}`); previous = index;
}
for (const locale of ['en', 'zh_CN']) {
    const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    for (const key of ['finderOpen', 'finderScope', 'finderLabel', 'finderHint', 'finderChanged', 'finderReadError', 'workspaceReloadDeferred', 'workspaceReloadConfirm']) assert(messages[key]?.message);
}
console.log('finder integration tests ok (actual shortcut renderer/opener and modeled layout; native browser validation separate)');
