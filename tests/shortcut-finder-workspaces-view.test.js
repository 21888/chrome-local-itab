'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { fixture, W, F, clone, id } = require('./helpers/finder-workspaces-fixture');
const { createDocument, deferred } = require('./helpers/finder-copy-dom-model');
const tick = () => new Promise(setImmediate);
async function setup(locale = 'en', { hideSourceOnReserve = false } = {}) {
    const f = await fixture(), document = createDocument({ blurUnavailableFocus: true }), host = document.createElement('header'); document.body.append(host);
    const currentReads = [], currentSubscribers = new Set(), tabs = [], navigated = [], sourceListeners = new Map(), sourceListenerGroups = new Map();
    const messages = JSON.parse(fs.readFileSync(path.join(__dirname, '../_locales', locale, 'messages.json')));
    const component = { links: [{ title: 'Unsaved tile edit', url: 'https://unsaved.test/' }], categories: [], layout: { x: 47, y: 81 }, draft: 'Unsaved draft',
        openShortcutRecord(record, tab) { assert.deepEqual(Object.keys(record), ['url']); assert.deepEqual(f.calls.held, [...F.LOCKS]); tab.location.replace(record.url); return true; } };
    const untouched = JSON.stringify(component);
    const context = { window: null, document, MutationObserver: document.MutationObserver, URL, TextEncoder, setTimeout, clearTimeout,
        addEventListener(type, listener) {
            if (!sourceListenerGroups.has(type)) sourceListenerGroups.set(type, new Set());
            sourceListenerGroups.get(type).add(listener);
            sourceListeners.set(type, () => { for (const callback of [...sourceListenerGroups.get(type) || []]) callback(); });
        },
        removeEventListener(type, listener) {
            sourceListenerGroups.get(type)?.delete(listener);
            if (!sourceListenerGroups.get(type)?.size) { sourceListenerGroups.delete(type); sourceListeners.delete(type); }
        },
        navigator: { locks: f.locks }, chrome: f.chrome,
        LocalItabWorkspaces: W, LocalItabPrompts: require('../shared/local-prompts-store'), LocalItabAICollections: require('../shared/local-ai-collections-store'),
        i18n: { t: key => messages[key]?.message || key },
        storageManager: { workspace: f.session, local: { async get(keys) { currentReads.push([...keys]); return clone({ links: f.defaultValues().links, categories: f.defaultValues().categories }); } },
            onLocalChanged(listener) { currentSubscribers.add(listener); return () => currentSubscribers.delete(listener); } },
        open(url, target) {
            const targetEvents = () => ({ listeners: new Map(), addEventListener(type, listener) { this.listeners.set(type, listener); },
                removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type); },
                emit(type) { this.listeners.get(type)?.(); } });
            const blank = { ...targetEvents(), hidden: false, visibilityState: 'visible' };
            const tab = { ...targetEvents(), document: blank, opener: 'parent', closed: false, closeCalls: 0,
                location: { href: url, replace(value) { assert.deepEqual(f.calls.held, [...F.LOCKS]); tab.emit('beforeunload'); tab.emit('pagehide'); this.href = value; navigated.push(value); } },
                close() { this.closeCalls++; this.closed = true; blank.hidden = true; blank.visibilityState = 'hidden'; blank.emit('visibilitychange'); this.emit('pagehide'); } };
            tabs.push(tab); assert.equal(url, 'about:blank'); assert.equal(target, '_blank');
            if (hideSourceOnReserve) queueMicrotask(() => { document.hidden = true; document.visibilityState = 'hidden'; document.listeners.get('visibilitychange')?.(); });
            return tab;
        } };
    context.window = context; vm.createContext(context);
    for (const file of ['shared/dialog-focus.js', 'shared/stored-shortcut-url.js', 'shared/shortcut-finder-workspaces.js', 'shared/shortcut-finder.js', 'shared/shortcut-finder-view.js', 'shared/shortcut-finder-host.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
    const view = context.LocalItabFinder.mountForShortcuts(host, component);
    const open = async () => { host.querySelector('button').dispatch('click'); await tick(); };
    const scope = value => { const select = document.querySelector('.finder-workspace-scope'); select.value = value; select.dispatch('change'); };
    const query = value => { const input = document.querySelector('input'); input.value = value; input.dispatch('input'); };
    const status = () => document.querySelectorAll('.finder-meta').find(item => item.getAttribute('role') === 'status')?.textContent;
    return { ...f, document, host, view, sourceListeners, sourceListenerGroups, currentReads, currentSubscribers, tabs, navigated, component, untouched, context, open, scope, query, status };
}
test('actual host/view Current default adds zero All native reads, byte calls, locks or subscriptions; close/reopen starts Current', async () => {
    const f = await setup(); await f.open(); f.query('Synthetic');
    assert.equal(f.document.querySelectorAll('.finder-result').length, 1); assert.equal(f.document.querySelector('.finder-workspace-scope').value, 'current');
    assert.equal(f.currentReads.length, 1); assert.equal(f.currentSubscribers.size, 1); assert.deepEqual([...f.sourceListenerGroups.keys()].sort(), ['pagehide', 'pageshow']); assert(f.sourceListenerGroups.get('pagehide').size === 1 && f.sourceListenerGroups.get('pageshow').size === 1, 'only the view’s copy lifecycle hooks remain');
    assert.equal(f.calls.get.length + f.calls.bytes.length + f.calls.locks.length + f.listeners.size, 0);
    f.scope('all'); await tick(); assert.equal(f.document.querySelectorAll('.finder-result').length, 2); assert.equal(f.listeners.size, 1);
    const reads = f.calls.get.length; f.view.close(); assert.equal(f.listeners.size, 0); await f.open();
    assert.equal(f.document.querySelector('.finder-workspace-scope').value, 'current'); assert.equal(f.calls.get.length, reads);
    assert.equal(JSON.stringify(f.component), f.untouched); assert.equal(f.calls.writers + f.calls.manager, 0); f.view.destroy(); assert.equal(f.currentSubscribers.size, 0); assert.equal(f.sourceListeners.size, 0); assert.equal(f.sourceListenerGroups.size, 0); assert.equal(f.document.listeners.size, 0);
});
test('same IDs in different workspaces are separate literal rows and exact categories, no icons/tasks/source component changes', async () => {
    const f = await setup(); f.defaultValues().links[0].layoutId = f.namedValues().links[0].layoutId = id(1);
    f.defaultValues().links[0].icon = 'SYNTHETIC_PRIVATE_ICON'; f.namedValues().__localItabPersonalTasksV1 = { text: 'SYNTHETIC_PRIVATE_TASK' };
    const before = JSON.stringify(f.raw); f.component.openShortcutRecord = () => { throw Error('All must not call the live component'); };
    await f.open(); f.query('Synthetic'); f.scope('all'); await tick();
    const results = f.document.querySelectorAll('.finder-result'); assert.equal(results.length, 2); assert.equal(f.document.querySelectorAll('.finder-workspace').length, 2);
    assert.notEqual(f.document.querySelectorAll('.finder-workspace')[0].textContent, f.document.querySelectorAll('.finder-workspace')[1].textContent);
    const category = f.document.querySelector('.finder-category'); assert(category.children.slice(1).every(option => option.textContent.includes(' · ')));
    category.value = category.children[2].value; category.dispatch('change'); assert.equal(f.document.querySelectorAll('.finder-result').length, 1);
    f.document.querySelector('.finder-result').dispatch('click'); assert.equal(f.tabs.length, 1, 'blank reservation happens before any await'); assert.equal(f.tabs[0].opener, null);
    await tick(); assert.deepEqual(f.navigated, ['https://named.test/']); assert.equal(f.tabs[0].closed, false);
    assert.equal(JSON.stringify(f.component), f.untouched); assert.equal(JSON.stringify(f.raw), before); assert.equal(f.calls.writers + f.calls.manager, 0);
    const rendered = node => [node.textContent || '', ...node.children.map(rendered)].join(' '); assert(!rendered(f.document.body).includes('SYNTHETIC_PRIVATE')); f.view.destroy();
});
test('a missing or unreadable active space shows honest unavailable, never empty or a partial all-searched total', async () => {
    const f = await setup(); await f.open(); f.query('Synthetic'); delete f.raw[W.bundleKey(f.named)]; f.scope('all'); await tick();
    assert.match(f.status(), /unavailable|could not be checked/i); assert.equal(f.document.querySelectorAll('.finder-result').length, 0);
    assert.doesNotMatch(f.status(), /No saved sites|No matching|Results:/); f.query('other'); assert.match(f.status(), /unavailable/);
    f.scope('current'); await tick(); f.query('Synthetic'); assert.equal(f.document.querySelectorAll('.finder-result').length, 1); f.view.destroy();
});
test('All pending query/category/match/Clear changes retire previous preparation; late callbacks never publish', async () => {
    for (const change of [f => f.query('named'), f => { const s = f.document.querySelector('.finder-category'); s.value = 'missing'; s.dispatch('change'); },
        f => { const s = f.document.querySelector('.finder-match-mode'); s.value = 'all-words'; s.dispatch('change'); },
        f => f.document.querySelectorAll('button').find(button => button.textContent === 'Clear').dispatch('click')]) {
        const f = await setup(); await f.open(); f.query('Synthetic'); const gate = deferred(); let paused = false;
        f.hook(async (type, keys) => { if (type === 'get' && !paused) { paused = true; await gate.promise; } });
        f.scope('all'); await tick(); assert.equal(f.document.querySelectorAll('.finder-result').length, 0);
        change(f); await tick(); const latest = f.status(), current = f.document.querySelectorAll('.finder-result').map(node => node.children[0].textContent);
        gate.resolve(); await tick(); assert.equal(f.status(), latest); assert.deepEqual(f.document.querySelectorAll('.finder-result').map(node => node.children[0].textContent), current);
        assert(f.calls.get.filter(keys => keys.length === 3).length >= 2, 'new view obtains a new admission'); assert.equal(f.tabs.length, 0); f.view.destroy();
    }
});
test('pending All scan cancelled by Current/Close/hidden/IME cannot republish later or steal focus', async () => {
    for (const action of ['current', 'close', 'hidden', 'ime']) {
        const f = await setup(); await f.open(); f.query('Synthetic'); const gate = deferred(); let paused = false;
        f.hook(async type => { if (type === 'get' && !paused) { paused = true; await gate.promise; } }); f.scope('all'); await tick();
        const input = f.document.querySelector('input');
        if (action === 'current') f.scope('current');
        if (action === 'close') f.view.close();
        if (action === 'hidden') { f.document.hidden = true; f.document.visibilityState = 'hidden'; f.document.listeners.get('visibilitychange')(); }
        if (action === 'ime') { input.dispatch('compositionstart'); input.value = 'named'; input.dispatch('input'); }
        gate.resolve(); await tick();
        if (action === 'close') assert.equal(f.document.querySelector('.finder-overlay'), null);
        else if (action === 'current') assert.equal(f.document.querySelectorAll('.finder-result').length, 1);
        else assert.equal(f.document.querySelectorAll('.finder-result').length, 0);
        if (action === 'ime') { input.dispatch('compositionend'); await tick(); assert.equal(f.document.querySelectorAll('.finder-result').length, 1); }
        assert.equal(f.tabs.length, 0); f.view.destroy();
    }
});
test('pending owned blank is immediately cancelled by query/scope/Close/source/hidden/IME; late completion cannot navigate', async () => {
    for (const action of ['query', 'scope', 'close', 'source', 'hidden', 'ime']) {
        const f = await setup(); await f.open(); f.query('Synthetic'); f.scope('all'); await tick();
        const gate = deferred(); let paused = false; f.hook(async type => { if (type === 'get' && !paused) { paused = true; await gate.promise; } });
        const result = f.document.querySelector('.finder-result'); result.focus(); result.dispatch('click'); assert.equal(f.tabs.length, 1); assert.equal(f.tabs[0].closed, false);
        assert.equal(f.document.activeElement, f.document.querySelector('input')); await tick();
        if (action === 'query') f.query('named');
        if (action === 'scope') f.scope('current');
        if (action === 'close') f.document.activeElement.dispatch('keydown', { key: 'Escape' });
        if (action === 'source') f.emit(W.STAGE_KEY);
        if (action === 'hidden') {
            f.tabs[0].document.hidden = true; f.tabs[0].document.visibilityState = 'hidden'; f.tabs[0].document.emit('visibilitychange');
            f.document.hidden = true; f.document.listeners.get('visibilitychange')();
        }
        if (action === 'ime') f.document.querySelector('input').dispatch('compositionstart');
        assert.equal(f.tabs[0].closed, true, action); gate.resolve(); await tick(); assert.equal(f.navigated.length, 0); assert.equal(f.calls.writers + f.calls.manager, 0); f.view.destroy();
    }
});
test('duplicate trusted activation owns one blank; cancellation never closes or overwrites a user-navigated tab', async () => {
    const f = await setup(); await f.open(); f.query('Synthetic'); f.scope('all'); await tick();
    const gate = deferred(); let paused = false; f.hook(async type => { if (type === 'get' && !paused) { paused = true; await gate.promise; } });
    const button = f.document.querySelector('.finder-result'); button.dispatch('click'); button.dispatch('click'); assert.equal(f.tabs.length, 1);
    await tick(); f.tabs[0].location.href = 'https://user-choice.test/'; f.view.close(); assert.equal(f.tabs[0].closed, false); gate.resolve(); await tick(); assert.equal(f.navigated.length, 0); f.view.destroy();
});
test('late old source callback after close cannot clear a reopened All snapshot; old query tokens cannot activate', async () => {
    const f = await setup(); await f.open(); f.query('Synthetic'); f.scope('all'); await tick();
    const old = f.document.querySelector('.finder-result'), retired = [...f.listeners][0];
    f.query('named'); old.dispatch('click'); await tick(); assert.equal(f.tabs.length, 0);
    f.view.close(); await f.open(); f.query('Synthetic'); f.scope('all'); await tick();
    const calls = f.calls.get.length; retired({ [W.REGISTRY_KEY]: {} }, 'local'); await tick();
    assert.equal(f.calls.get.length, calls); assert.equal(f.document.querySelectorAll('.finder-result').length, 2); f.view.destroy();
});
test('unannounced edit during final combined get is refused and refreshes the displayed result', async () => {
    const f = await setup(); await f.open(); f.query('Synthetic'); f.scope('all'); await tick();
    f.hook((type, keys) => { if (type === 'get' && keys.length === 31) f.namedValues().links[0].url = 'https://edited.test/'; });
    f.document.querySelectorAll('.finder-result')[1].dispatch('click'); await tick();
    assert.equal(f.navigated.length, 0); assert.equal(f.tabs[0].closed, true);
    assert.equal(f.document.querySelectorAll('.finder-url')[1].textContent, 'https://edited.test/'); f.view.destroy();
});
test('All workspace native selector has explicit translated label and current default in both shipped locales', async () => {
    for (const locale of ['en', 'zh_CN']) {
        const f = await setup(locale); await f.open(); const select = f.document.querySelector('.finder-workspace-scope');
        assert.equal(select.value, 'current'); assert(f.document.querySelectorAll('label').some(label => label.htmlFor === select.id));
        const messages = JSON.parse(fs.readFileSync(path.join(__dirname, '../_locales', locale, 'messages.json')));
        for (const key of ['finderWorkspaceScope', 'finderCurrentWorkspace', 'finderAllWorkspaces', 'finderAllWorkspaceHint', 'finderAllUnavailable']) assert(messages[key]?.message);
        f.view.destroy();
    }
});
test('actual newtab HTML boot order provides both journal validators in browser realm, including legitimate terminal journals', async () => {
    const f = await fixture();
    const context = { window: null, chrome: f.chrome, navigator: { locks: f.locks }, URL, TextEncoder, crypto: require('node:crypto').webcrypto, location: { href: 'https://extension.test/newtab.html' } };
    context.window = context; vm.createContext(context);
    context.readBridge = keys => f.local.get(keys);
    context.bytesBridge = keys => f.local.getBytesInUse(keys);
    vm.runInContext('chrome.storage.local = { get: async keys => JSON.parse(JSON.stringify(await readBridge(keys))), getBytesInUse: keys => bytesBridge(keys) };', context);
    const scripts = [...fs.readFileSync(path.join(__dirname, '../newtab.html'), 'utf8').matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
    const needed = ['shared/workspaces.js', 'shared/local-prompts-store.js', 'shared/local-ai-collections-store.js', 'shared/stored-shortcut-url.js', 'shared/shortcut-finder-workspaces.js'];
    for (const dependency of needed.slice(0, -1)) assert(scripts.indexOf(dependency) < scripts.indexOf(needed.at(-1)), dependency);
    for (const file of scripts.filter(file => needed.includes(file))) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
    await context.LocalItabWorkspaces.session.ready();
    const authority = { [W.REGISTRY_KEY]: clone(f.raw[W.REGISTRY_KEY]), [W.PROMPTS_KEY]: context.LocalItabPrompts.initial(), [W.COLLECTIONS_KEY]: context.LocalItabAICollections.initial() };
    f.raw[W.RESTORE_TRANSACTION_KEY] = { schemaVersion: 1, id: 'terminal', createdAt: '2026-10-15T00:00:00Z', status: 'verified',
        prior: authority, next: clone(authority), recoveryKey: '__localItabCompleteRecoveryV2', recoveryChecksum: 'a'.repeat(64), priorWorkspaceDigest: 'b'.repeat(64) };
    const reader = context.LocalItabFinderWorkspaces.createReader({ local: context.chrome.storage.local, locks: f.locks, changes: f.changes, getSession: () => context.LocalItabWorkspaces.session });
    assert.equal((await reader.scan()).links.length, 2); reader.stop();
});
test('credential-bearing saved URL stays out of All DOM and errors and leaves the raw record unchanged', async () => {
    const f = await setup(); await f.open(); f.query('Synthetic');
    f.namedValues().links[0].url = 'https://SYNTHETIC_PRIVATE_USER:SYNTHETIC_PRIVATE_PASSWORD@example.test/';
    const before = JSON.stringify(f.raw); f.scope('all'); await tick();
    const rendered = node => [node.textContent || '', ...node.children.map(rendered)].join(' ');
    assert(!rendered(f.document.body).includes('SYNTHETIC_PRIVATE')); assert.equal(f.document.querySelectorAll('.finder-result').length, 0);
    assert.match(f.status(), /unavailable/); assert.equal(JSON.stringify(f.raw), before); f.view.destroy();
});
test('foreground owned blank may hide its opener during activation, then opens synchronously and removes its temporary listeners', async () => {
    const f = await setup('en', { hideSourceOnReserve: true }); await f.open(); f.query('Synthetic'); f.scope('all'); await tick();
    f.document.querySelectorAll('.finder-result')[1].dispatch('click'); assert.equal(f.tabs.length, 1); await tick();
    assert.equal(f.document.hidden, true); assert.equal(f.tabs[0].document.visibilityState, 'visible');
    assert.deepEqual(f.navigated, ['https://named.test/']); assert.equal(f.tabs[0].closed, false);
    assert.equal(f.tabs[0].document.listeners.size + f.tabs[0].listeners.size, 0); assert.equal(f.calls.writers + f.calls.manager, 0); f.view.destroy();
});
test('owned blank hidden, navigated, closed, document-replaced or no longer readable cancels even while original source stays hidden', async () => {
    for (const action of ['hidden', 'navigate', 'close', 'replace-document', 'inaccessible']) {
        const f = await setup('en', { hideSourceOnReserve: true }); await f.open(); f.query('Synthetic'); f.scope('all'); await tick();
        const gate = deferred(); let paused = false; f.hook(async type => { if (type === 'get' && !paused) { paused = true; await gate.promise; } });
        f.document.querySelector('.finder-result').dispatch('click'); await tick(); const tab = f.tabs[0], blank = tab.document;
        assert.equal(f.document.hidden, true); assert.equal(tab.closed, false);
        if (action === 'hidden') { blank.hidden = true; blank.visibilityState = 'hidden'; blank.emit('visibilitychange'); assert.equal(tab.closed, true); }
        if (action === 'navigate') { tab.emit('beforeunload'); tab.location.href = 'https://user-choice.test/'; assert.equal(tab.closed, false); }
        if (action === 'close') { tab.close(); }
        if (action === 'replace-document') tab.document = { ...blank };
        if (action === 'inaccessible') Object.defineProperty(tab, 'document', { get() { throw Error('Cross-origin document'); } });
        gate.resolve(); await tick(); assert.equal(f.navigated.length, 0);
        f.view.close(); f.view.close();
        if (['navigate', 'replace-document', 'inaccessible'].includes(action)) assert.equal(tab.closed, false, 'relinquished blank is never closed');
        else assert.equal(tab.closeCalls, 1, 'owned close is idempotent');
        assert.equal(blank.listeners.size + tab.listeners.size, 0); f.view.destroy();
    }
});
test('temporary activation exception never permits hidden All scans or adoption of their results', async () => {
    const f = await setup('en', { hideSourceOnReserve: true }); await f.open(); f.query('Synthetic'); f.scope('all'); await tick();
    const gate = deferred(); let paused = false; f.hook(async type => { if (type === 'get' && !paused) { paused = true; await gate.promise; } });
    f.document.querySelector('.finder-result').dispatch('click'); await tick(); assert.equal(f.document.hidden, true);
    f.emit(W.REGISTRY_KEY); assert.equal(f.tabs[0].closed, true); const reads = f.calls.get.length;
    gate.resolve(); await tick(); assert.equal(f.calls.get.length, reads, 'refresh scan stays blocked while source is hidden');
    assert.equal(f.document.querySelectorAll('.finder-result').length, 0); assert.match(f.status(), /unavailable/); assert.equal(f.navigated.length, 0); f.view.destroy();
});
test('Current reservation adds no blank document/lifecycle inspection or hidden-page exception', async () => {
    const f = await setup('en', { hideSourceOnReserve: true }); await f.open(); f.query('Synthetic');
    f.component.openShortcutRecord = (record, tab) => { tab.location.href = record.url; return true; };
    const originalOpen = f.context.open;
    f.context.open = (...args) => { const tab = originalOpen(...args); Object.defineProperty(tab, 'document', { get() { throw Error('Current must not inspect a blank document'); } }); return tab; };
    f.document.querySelector('.finder-result').dispatch('click'); await tick(); assert.equal(f.tabs[0].closed, false); assert.equal(f.tabs[0].location.href, f.defaultValues().links[0].url);
    assert.equal(f.calls.get.length + f.calls.bytes.length + f.calls.locks.length + f.listeners.size, 0); f.view.destroy();
});
test('a previously visible blank that becomes hidden without a delivered event is rejected even if the source is now visible', async () => {
    const f = await setup(); await f.open(); f.query('Synthetic'); f.scope('all'); await tick();
    const gate = deferred(); let paused = false; f.hook(async type => { if (type === 'get' && !paused) { paused = true; await gate.promise; } });
    f.document.querySelector('.finder-result').dispatch('click'); await tick(); const tab = f.tabs[0];
    tab.document.hidden = true; tab.document.visibilityState = 'hidden';
    gate.resolve(); await tick(); assert.equal(f.navigated.length, 0); assert.equal(tab.closed, true); assert.equal(tab.closeCalls, 1); f.view.destroy();
});
test('source pagehide cancels visible or already-hidden source activations and starts no replacement reads', async () => {
    for (const hidden of [false, true]) {
        const f = await setup('en', { hideSourceOnReserve: hidden }); await f.open(); f.query('Synthetic'); f.scope('all'); await tick();
        const gate = deferred(); let paused = false; f.hook(async type => { if (type === 'get' && !paused) { paused = true; await gate.promise; } });
        f.document.querySelector('.finder-result').dispatch('click'); await tick(); const tab = f.tabs[0];
        assert.equal(Boolean(f.document.hidden), hidden); assert.equal(tab.document.visibilityState, 'visible');
        const reads = f.calls.get.length, bytes = f.calls.bytes.length, locks = f.calls.locks.length;
        const departure = f.sourceListeners.get('pagehide'); assert.equal(typeof departure, 'function'); departure({ persisted: true });
        assert.equal(tab.closed, true); assert.equal(f.listeners.size, 0); assert.deepEqual([...f.sourceListenerGroups.keys()].sort(), ['pagehide', 'pageshow']); assert(f.sourceListenerGroups.get('pagehide').size === 1 && f.sourceListenerGroups.get('pageshow').size === 1, 'only the view’s copy lifecycle hooks remain');
        gate.resolve(); await tick(); assert.equal(f.navigated.length, 0); assert.equal(f.calls.get.length, reads); assert.equal(f.calls.bytes.length, bytes); assert.equal(f.calls.locks.length, locks);
        assert.equal(f.document.querySelectorAll('.finder-result').length, 0); assert.match(f.status(), /unavailable/);
        f.view.close(); assert.equal(tab.closeCalls, 1); f.view.destroy();
    }
});
test('source pagehide cancels a pending scan, retires its hooks, and never closes a manually navigated tab', async () => {
    const f = await setup(); await f.open(); f.query('Synthetic'); const gate = deferred(); let paused = false;
    f.hook(async type => { if (type === 'get' && !paused) { paused = true; await gate.promise; } }); f.scope('all'); await tick();
    const reads = f.calls.get.length; f.sourceListeners.get('pagehide')({ persisted: false }); gate.resolve(); await tick();
    assert.equal(f.calls.get.length, reads); assert.equal(f.document.querySelectorAll('.finder-result').length, 0); assert.equal(f.tabs.length, 0);
    f.hook(null); f.scope('current'); await tick(); f.scope('all'); await tick();
    const second = deferred(); paused = false; f.hook(async type => { if (type === 'get' && !paused) { paused = true; await second.promise; } });
    f.document.querySelector('.finder-result').dispatch('click'); await tick(); f.tabs[0].location.href = 'https://user-choice.test/';
    f.sourceListeners.get('pagehide')({ persisted: true }); second.resolve(); await tick();
    assert.equal(f.tabs[0].closed, false); assert.equal(f.navigated.length, 0); f.view.destroy();
});

test('actual host All copy uses only loaded row raw URL, with no additional storage, locks, tabs or active workspace changes', async () => {
    const f = await setup(), copied = []; f.context.navigator.clipboard = { writeText(value) { copied.push(value); return Promise.resolve(); } };
    f.namedValues().links[0].url = 'example.test/中文?b=%2f&a=1#片段';
    await f.open(); f.query('Synthetic'); f.scope('all'); await tick();
    const before = { gets: f.calls.get.length, bytes: f.calls.bytes.length, locks: f.calls.locks.length, reads: f.currentReads.length, raw: JSON.stringify(f.raw) };
    const copies = f.document.querySelectorAll('.finder-copy-url'); assert.equal(copies.length, 2); copies[1].dispatch('click');
    assert.deepEqual(copied, ['example.test/中文?b=%2f&a=1#片段']); await tick();
    assert.equal(f.calls.get.length, before.gets); assert.equal(f.calls.bytes.length, before.bytes); assert.equal(f.calls.locks.length, before.locks); assert.equal(f.currentReads.length, before.reads);
    assert.equal(f.tabs.length + f.navigated.length + f.calls.writers + f.calls.manager, 0); assert.equal(JSON.stringify(f.raw), before.raw); assert.equal(JSON.stringify(f.component), f.untouched);
    f.view.destroy(); assert.equal(f.sourceListenerGroups.size, 0); assert.equal(f.document.listeners.size, 0);
});
test('actual host destroy/remount preserves Finder-wide system write ownership and releases the new view only after settlement', async () => {
    const f = await setup(), gate = deferred(), writes = []; let count = 0;
    f.context.navigator.clipboard = { writeText(value) { writes.push(value); return count++ ? Promise.resolve() : gate.promise; } };
    await f.open(); f.query('Synthetic'); const oldCopy = f.document.querySelector('.finder-copy-url'), oldStatus = f.document.querySelector('.finder-copy-status');
    oldCopy.dispatch('click'); assert.equal(writes.length, 1); f.view.destroy(); assert.equal(f.sourceListenerGroups.size, 0); assert.equal(f.document.listeners.size, 0);
    const replacement = f.context.LocalItabFinder.mountForShortcuts(f.host, f.component); await f.open(); f.query('Synthetic');
    const newCopy = f.document.querySelector('.finder-copy-url'), input = f.document.querySelector('input'); assert.equal(newCopy.getAttribute('aria-disabled'), 'true');
    newCopy.dispatch('click'); oldCopy.dispatch('click'); assert.equal(writes.length, 1); input.focus();
    gate.resolve(); await tick(); assert.equal(newCopy.getAttribute('aria-disabled'), 'false'); assert.equal(f.document.querySelector('.finder-copy-status').textContent || '', ''); assert.equal(oldStatus.textContent || '', ''); assert.equal(f.document.activeElement, input);
    newCopy.dispatch('click'); await tick(); assert.equal(writes.length, 2); assert.match(f.document.querySelector('.finder-copy-status').textContent, /copied/);
    assert.equal(f.tabs.length + f.navigated.length + f.calls.writers + f.calls.manager, 0); replacement.destroy(); assert.equal(f.sourceListenerGroups.size, 0); assert.equal(f.document.listeners.size, 0);
});
