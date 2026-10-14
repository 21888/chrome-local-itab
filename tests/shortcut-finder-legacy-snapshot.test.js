'use strict';
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const ROOT = require('node:path').resolve(__dirname, '..');
const test = require('node:test');
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: require('node:crypto').webcrypto });
const Workspaces = require(ROOT + '/shared/workspaces.js');
const StorageManager = require(ROOT + '/storage.js');
const Backup = require(ROOT + '/shared/complete-backup.js');
const { createDocument } = require(ROOT + '/tests/helpers/finder-dom-model.js');
const clone = v => structuredClone(v);
async function run(label, record) {
  const original = { links: [record], categories: [{ id: 'work', name: 'Work' }] };
  const raw = clone(original), writes = [], queues = new Map(), listeners = new Set();
  let serial = 0;
  const locks = { request(name, opts, fn) { if (typeof opts === 'function') fn = opts; const p = (queues.get(name) || Promise.resolve()).then(fn); queues.set(name, p.catch(() => {})); return p; } };
  const chrome = { storage: { local: {
    async get(keys) { return clone(keys == null ? raw : Object.fromEntries(keys.filter(k => Object.hasOwn(raw, k)).map(k => [k, raw[k]]))); },
    async set(values) { writes.push(clone(values)); const changes = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { oldValue: clone(raw[k]), newValue: clone(v) }])); Object.assign(raw, clone(values)); for (const listener of listeners) listener(changes, 'local'); }
  }, onChanged: { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); } } } };
  const workspaces = new Workspaces.Manager({ chrome, locks, now: () => '2026-10-14T12:00:00.000Z', id: () => `synthetic_${++serial}` });
  const manager = new StorageManager({ workspace: workspaces.capture('default') });
  manager.ensureSyncInitialized = async () => {};
  const config = await manager.getAll();
  const stored = await manager.local.get(['links', 'categories']);
  assert.deepEqual(stored, original);
  const writesAfterMigration = writes.length, exactRaw = JSON.stringify(raw);
  const document = createDocument(), host = document.createElement('header'); document.body.append(host);
  const tabs = [], opened = [];
  const context = { window: null, document, storageManager: manager, URL, console, setTimeout, clearTimeout,
    addEventListener() {}, getComputedStyle(el) { return { visibility: el.style.visibility || 'visible' }; },
    open(url, target) { const tab = { closed: false, opener: null, location: { href: url, replace(url) { this.href = url; opened.push(url); } }, close() { this.closed = true; } }; tabs.push(tab); return tab; }
  };
  context.window = context; vm.createContext(context);
  for (const file of ['shared/dialog-focus.js', 'shared/shortcut-finder.js', 'shared/shortcut-finder-view.js', 'shared/shortcut-finder-host.js']) vm.runInContext(fs.readFileSync(ROOT + '/' + file, 'utf8'), context);
  vm.runInContext(fs.readFileSync(ROOT + '/newtab.js', 'utf8') + '\nthis.ActualShortcuts = ShortcutsComponent;', context);
  const component = new context.ActualShortcuts(config.links, config.layout, config.categories, config._layoutBaseline);
  const view = context.LocalItabFinder.mountForShortcuts(host, component);
  host.querySelector('button').dispatch('click');
  await new Promise(setImmediate);
  const input = document.querySelector('.finder-input'); input.value = 'Legacy'; input.dispatch('input');
  assert.equal(document.querySelectorAll('.finder-result').length, 1);
  document.querySelector('.finder-result').dispatch('click'); await new Promise(setImmediate);
  const first = { opened: opened.length, reserved: tabs.length, closed: tabs[0].closed, alert: document.querySelector('.finder-alert').textContent };
  document.querySelector('.finder-result').dispatch('click'); await new Promise(setImmediate);
  const second = { opened: opened.length, reserved: tabs.length, closed: tabs[1]?.closed ?? null, alert: document.querySelector('.finder-alert').textContent };
  assert.equal(first.opened, 1); assert.equal(first.closed, false);
  assert.equal(second.opened, 2); assert.equal(second.closed, false);
  const manual = manager.buildManualExportPayload(await manager.getAllForBackup());
  assert.deepEqual(manual.data.links, config.links);
  const store = new Backup.Store(manager, Backup.createBackend(manager, chrome, locks));
  const archive = await store.export(['config']), parsed = Backup.parse(archive, manager);
  assert.deepEqual(parsed.workspaces[0].modules.config.data.links, [{ icon: '🌐', category: 'work', ...record }]);
  const review = await store.review(archive, ['config']);
  assert.equal(review.current.config.shortcuts, 1); assert.equal(review.incoming.config.shortcuts, 1);
  assert.equal(writes.length, writesAfterMigration); assert.equal(JSON.stringify(raw), exactRaw);
  view.destroy();

}
test('real workspace legacy raw records open on first and repeated explicit clicks without writes', async () => {
  for (const [label, record] of [
    ['missing_icon_and_category', {title: 'Legacy site', url: 'https://example.test/'}],
    ['missing_icon_only', {title: 'Legacy site', url: 'https://example.test/', category: 'work'}],
    ['missing_category_only', {title: 'Legacy site', url: 'https://example.test/', icon: '🌐'}],
    ['canonical_control', {title: 'Legacy site', url: 'https://example.test/', icon: '🌐', category: 'work'}],
    ['different_property_order', {category: 'work', icon: '🌐', url: 'https://example.test/', title: 'Legacy site'}]
  ]) await run(label, record);
});

const tick = () => new Promise(setImmediate);
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; }
function delayedFixture() {
  const document = createDocument(), host = document.createElement('header'); document.body.append(host);
  const reads = [], opened = [], tabs = []; let notify;
  const component = {links: [{title: 'Normalized', url: 'https://normalized.test/', icon: '🌐', category: 'work'}], categories: [],
    openShortcutRecord(link) { opened.push(link); return true; }};
  const before = JSON.stringify(component);
  const context = {window: null, document, URL, console, setTimeout, clearTimeout,
    storageManager: {local: {get(keys) { assert.deepEqual(Array.from(keys), ['links', 'categories']); const d = deferred(); reads.push(d); return d.promise; }},
      onLocalChanged(fn) { notify = fn; return () => { notify = null; }; }},
    open() { const tab = {opener: 'parent', closed: false, location: {href: 'about:blank'}, close() { this.closed = true; }}; tabs.push(tab); return tab; }};
  context.window = context; vm.createContext(context);
  for (const file of ['shared/dialog-focus.js', 'shared/shortcut-finder.js', 'shared/shortcut-finder-view.js', 'shared/shortcut-finder-host.js']) vm.runInContext(fs.readFileSync(ROOT + '/' + file, 'utf8'), context);
  const view = context.LocalItabFinder.mountForShortcuts(host, component);
  const open = () => { host.querySelector('button').dispatch('click'); const input = document.querySelector('.finder-input'); input.value = 'site'; input.dispatch('input'); return input; };
  return {document, reads, opened, tabs, component, before, view, open, notify: changes => notify(changes, 'local')};
}
const rawSites = () => ({links: [{title: 'Legacy site', url: 'https://legacy.test/'}], categories: [{id: 'work', name: 'Work'}]});

test('initial native read is visibly pending, respects typed query and IME, and never displays normalized tokens', async () => {
  const f = delayedFixture(); const input = f.open(); await tick();
  assert.equal(f.document.querySelectorAll('.finder-result').length, 0);
  assert.match(f.document.querySelectorAll('.finder-meta').find(node => node.getAttribute('role') === 'status').textContent, /Checking/);
  assert.equal(f.document.querySelector('.finder-list').getAttribute('aria-busy'), 'true');
  input.dispatch('compositionstart'); f.reads[0].resolve(rawSites()); await tick();
  assert.equal(f.document.querySelectorAll('.finder-result').length, 0);
  input.dispatch('compositionend'); assert.equal(f.document.querySelectorAll('.finder-result').length, 1);
  assert.equal(JSON.stringify(f.component), f.before); assert.equal(f.tabs.length, 0); f.view.destroy();
});

test('failed initial read stays an error through typing and Clear; closing and reopening retries', async () => {
  const f = delayedFixture(); const input = f.open(); await tick(); f.reads[0].reject(Error('synthetic read failure')); await tick();
  assert.match(f.document.querySelectorAll('.finder-meta').find(node => node.getAttribute('role') === 'status').textContent, /Could not verify/);
  input.value = 'changed'; input.dispatch('input');
  f.document.querySelectorAll('button').find(button => button.textContent === 'Clear').dispatch('click');
  assert.match(f.document.querySelectorAll('.finder-meta').find(node => node.getAttribute('role') === 'status').textContent, /Could not verify/);
  assert.equal(f.document.querySelector('.finder-list').getAttribute('aria-busy'), 'false');
  f.view.close(); f.open(); await tick(); f.reads[1].resolve(rawSites()); await tick();
  assert.equal(f.document.querySelectorAll('.finder-result').length, 1); assert.equal(f.tabs.length, 0); f.view.destroy();
});

test('close/reopen and destroy discard older initial reads without overwriting the owned overlay', async () => {
  const f = delayedFixture(); f.open(); await tick(); f.view.close(); f.open(); await tick();
  f.reads[1].resolve(rawSites()); await tick(); f.reads[0].resolve({links: [], categories: []}); await tick();
  assert.equal(f.document.querySelectorAll('.finder-result').length, 1); assert.equal(f.reads.length, 2);
  f.view.close(); f.open(); await tick(); f.view.destroy(); f.reads[2].resolve(rawSites()); await tick();
  assert.equal(f.document.querySelector('.finder-overlay'), null); assert.equal(f.reads.length, 3); assert.equal(f.tabs.length, 0);
});

test('partial onChanged during initial read forces a current full read before displaying any results', async () => {
  const f = delayedFixture(); f.open(); await tick();
  f.notify({categories: {newValue: [{id: 'work', name: 'New category'}]}});
  f.reads[0].resolve(rawSites()); await tick(); assert.equal(f.reads.length, 2);
  assert.equal(f.document.querySelectorAll('.finder-result').length, 0);
  const current = rawSites(); current.categories[0].name = 'New category'; f.reads[1].resolve(current); await tick();
  assert.match(f.document.querySelector('.finder-result .finder-meta').textContent, /New category/);
  assert.equal(JSON.stringify(f.component), f.before); f.view.destroy();
});

test('fresh raw reorder, icon edit, omitted-field addition and duplicate legacy URL remain stale', async () => {
  for (const change of ['reorder', 'icon', 'category', 'duplicate']) {
    const f = delayedFixture(); f.open(); await tick();
    const initial = rawSites(); initial.links.push({title: 'Other site', url: 'https://other.test/'});
    f.reads[0].resolve(clone(initial)); await tick();
    f.document.querySelector('.finder-result').dispatch('click'); await tick();
    const next = clone(initial);
    if (change === 'reorder') next.links.reverse();
    if (change === 'icon') next.links[0].icon = '🌐';
    if (change === 'category') next.links[0].category = 'work';
    if (change === 'duplicate') next.links.push({...next.links[0]});
    f.reads[1].resolve(next); await tick();
    assert.equal(f.opened.length, 0, change); assert.equal(f.tabs[0].closed, true, change);
    assert.match(f.document.querySelector('.finder-alert').textContent, /changed/); f.view.destroy();
  }
});
