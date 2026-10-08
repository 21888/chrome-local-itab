const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDocument } = require('./helpers/finder-dom-model');
test('configuration reload preserves Finder open query and pending validation; explicit discard stays available', () => {
    const document = createDocument(); let reloaded = 0, confirmed = 0;
    // Lifecycle uses prepend; model implements it here rather than involving production.
    document.body.prepend = node => document.body.append(node);
    const finder = { pending: false, hasUncommittedWork: () => true };
    const context = { window: null, document, shortcutsComponentInstance: { finderView: finder }, location: { reload() { reloaded++; } }, confirm() { confirmed++; return true; } };
    context.window = context; vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared/local-content-lifecycle.js'), 'utf8'), context);
    assert.equal(context.LocalItabContentLifecycle.reload(), false); assert.equal(reloaded, 0);
    const reload = document.querySelector('button'); finder.pending = true; reload.dispatch('click'); assert.equal(reloaded, 0); assert.equal(confirmed, 0);
    finder.pending = false; reload.dispatch('click'); assert.equal(reloaded, 1); assert.equal(confirmed, 1);
    finder.hasUncommittedWork = () => false; assert.equal(context.LocalItabContentLifecycle.reload(), true); assert.equal(reloaded, 2);
});
