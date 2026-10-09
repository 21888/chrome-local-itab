'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createHarness, nativeActivation} = require('./helpers/dashboard-harness');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const route = 'options.html#import-settings-btn';
const extensionUrl = `chrome-extension://test-extension/${route}`;
const flush = () => new Promise(resolve => setImmediate(resolve));
function dashboard() {
    const h = createHarness([]), calls = [], errors = [];
    h.context.chrome = {runtime: {getURL(path) { assert.equal(path, route); return extensionUrl; }, openOptionsPage() { throw new Error('Import must not use generic Settings'); }}};
    h.context.showErrorMessage = message => errors.push(message);
    h.button = () => h.grid.querySelector('[data-action="open-import"]');
    h.context.chrome.tabs = {create(options, callback) { calls.push(options); callback({id: 42}); }};
    h.storageManager.set = () => { throw new Error('Navigation must not save'); };
    return Object.assign(h, {calls, errors});
}
test('actual rendered empty action opens exact local import deep link once with callback/Promise APIs', async () => {
    for (const mode of ['callback', 'promise', 'both']) {
        const h = dashboard();
        h.context.chrome.tabs.create = (options, callback) => {
            h.calls.push(options);
            if (mode !== 'promise') callback({id: 42});
            if (mode !== 'callback') return Promise.resolve({id: 42});
        };
        const button = h.button(); assert.equal(button.type, 'button');
        nativeActivation(button, 'Enter');
        assert(nativeActivation(button, 'Enter', true).prevented);
        button.dispatch('click'); // Pending duplicate in the same turn.
        await flush();
        button.dispatch('click', {detail: 2}); // Second click in a double-click.
        await flush();
        assert.deepEqual(h.calls.map(call => ({...call})), [{url: extensionUrl, active: true}]);
        assert.deepEqual(h.errors, []); assert.equal(h.opened.length, 0);
        assert.ok(h.document.activeElement === button, "expected focus ownership");
        nativeActivation(button, ' '); await flush(); assert.equal(h.calls.length, 2, 'later explicit activation can open again');
    }
});
test('pending create is shared across grid rebuild; failure cannot steal newer focus and explicit retry works', async () => {
    const h = dashboard(); let callback;
    h.context.chrome.tabs.create = (options, done) => { h.calls.push(options); callback = done; };
    h.button().focus(); h.button().dispatch('click');
    const before = h.button(); h.component.refreshTemplate();
    assert.notEqual(h.button(), before); assert.ok(h.document.activeElement === h.button(), "expected focus ownership");
    h.button().dispatch('click'); assert.equal(h.calls.length, 1);
    h.search.focus(); h.context.chrome.runtime.lastError = {message: 'private diagnostic'}; callback();
    delete h.context.chrome.runtime.lastError; await flush();
    assert.ok(h.document.activeElement === h.search, "expected focus ownership"); assert.equal(h.errors.length, 1);
    assert.match(h.errors[0], /Could not open/); assert.ok(!h.errors[0].includes('private'));
    h.button().dispatch('click'); callback({id: 43}); await flush(); assert.equal(h.calls.length, 2);
});
test('API throw, rejection and callback error never trigger fallback or an unhandled rejection', async () => {
    for (const mode of ['throw', 'reject', 'lastError', 'callback-and-reject']) {
        const h = dashboard();
        h.context.chrome.tabs.create = (options, callback) => {
            h.calls.push(options);
            if (mode === 'throw') throw new Error('private');
            if (mode === 'lastError') {
                h.context.chrome.runtime.lastError = {message: 'private'}; callback(); delete h.context.chrome.runtime.lastError;
            } else if (mode === 'callback-and-reject') { callback({id: 42}); return Promise.reject(new Error('private')); }
            else return Promise.reject(new Error('private'));
        };
        h.button().dispatch('click'); await flush();
        assert.equal(h.calls.length, 1); assert.equal(h.opened.length, 0);
        assert.equal(h.errors.length, mode === 'callback-and-reject' ? 0 : 1);
        assert.equal(h.component._importSettingsOpening, false);
    }
});
test('missing tab creation API uses one local window fallback; ambiguous handles never auto-retry', async () => {
    for (const mode of ['opened', 'null', 'closed', 'getter', 'throw', 'no-chrome']) {
        const h = dashboard(); delete h.context.chrome.tabs;
        if (mode === 'no-chrome') delete h.context.chrome;
        h.context.window.open = (...args) => {
            h.calls.push(args);
            if (mode === 'throw') throw new Error('private');
            if (mode === 'null') return null;
            if (mode === 'getter') return {get closed() { throw new Error('private'); }};
            return {closed: mode === 'closed'};
        };
        h.button().dispatch('click'); await flush();
        assert.deepEqual(h.calls, [[mode === 'no-chrome' ? route : extensionUrl, '_blank']]);
        if (['opened', 'no-chrome'].includes(mode)) assert.deepEqual(h.errors, []);
        else assert.match(h.errors[0], mode === 'throw' ? /Could not open/ : /Unable to confirm/);
        assert.ok(h.document.activeElement === h.document.body, "expected focus ownership");
    }
});
test('unobservable callback result and URL creation error are reported without duplicate attempts', async () => {
    const h = dashboard(); h.context.chrome.tabs.create = (options, callback) => { h.calls.push(options); callback(); };
    h.button().dispatch('click'); await flush(); assert.match(h.errors[0], /Unable to confirm/);
    h.context.chrome.runtime.getURL = () => { throw new Error('private'); };
    h.button().dispatch('click'); await flush(); assert.equal(h.calls.length, 1); assert.match(h.errors[1], /Could not open/);
});
test('detached, hidden, disabled, replaced and composing source actions cannot create tabs', async () => {
    for (const mode of ['detached', 'hidden', 'disabled', 'replaced-grid', 'composing']) {
        const h = dashboard(), button = h.button();
        if (mode === 'detached') h.component.updateGrid();
        if (mode === 'hidden') button.style.display = 'none';
        if (mode === 'disabled') button.disabled = true;
        if (mode === 'replaced-grid') { h.grid.remove(); const grid = h.document.createElement('div'); grid.id = 'shortcuts-grid'; h.document.body.append(grid); }
        h.grid.dispatch('click', {target: button, isComposing: mode === 'composing'}); await flush(); assert.equal(h.calls.length, 0, mode);
    }
});
test('empty Import focus follows template rerenders and falls back to Add when empty state disappears', () => {
    const h = dashboard(); h.button().focus();
    for (const template of ['graphite', 'folio', 'clarity']) {
        h.document.documentElement.dataset.dashboardTemplate = template; h.component.refreshTemplate();
        assert.ok(h.document.activeElement === h.button(), "expected focus ownership");
    }
    h.search.focus(); h.component.updateGrid(); assert.ok(h.document.activeElement === h.search, "expected focus ownership");
    h.button().focus(); h.component.links = [{title: 'New', url: 'https://example.com/', category: 'work'}]; h.component.updateGrid();
    assert.ok(h.document.activeElement === h.add(), "expected focus ownership");
});
test('obsolete grid completion does not report on or focus a replacement dashboard', async () => {
    const h = dashboard(); let callback;
    h.context.chrome.tabs.create = (options, done) => { callback = done; };
    h.button().dispatch('click'); h.component.render(); h.search.focus();
    h.context.chrome.runtime.lastError = {message: 'private'}; callback(); delete h.context.chrome.runtime.lastError; await flush();
    assert.deepEqual(h.errors, []); assert.ok(h.document.activeElement === h.search, "expected focus ownership");
});
test('source Import action suppresses held and composing keys before native click synthesis', async () => {
    const h = dashboard();
    for (const key of ['Enter', ' ']) for (const fields of [{repeat: true}, {isComposing: true}, {keyCode: 229}]) {
        const event = h.button().dispatch('keydown', {key, ...fields}); assert(event.prevented);
        if (!event.prevented) h.button().dispatch('click');
    }
    await flush(); assert.equal(h.calls.length, 0);
});
test('normal Settings button still uses the original options-page entrypoint', async () => {
    const document = createDocument(), listeners = [];
    document.addEventListener = (type, fn) => { if (type === 'DOMContentLoaded') listeners.push(fn); };
    const settings = document.createElement('button'); settings.id = 'open-options'; document.body.append(settings);
    let options = 0;
    const context = {document, window: {addEventListener() {}}, chrome: {runtime: {openOptionsPage() { options++; }}},
        console: {log() {}, error() {}}, URL, setTimeout() {}};
    vm.createContext(context); vm.runInContext(fs.readFileSync('newtab.js', 'utf8'), context);
    context.initializeDashboard = async () => ({});
    for (const name of ['setupDashboardVisibilityToggle', 'setupThemeChangeListener', 'setupClockPreferenceListener', 'setupDashboardAppearance', 'setupCloudSyncChangeListener', 'setupPerformanceGuards', 'setupExtremeCompactMode']) context[name] = () => {};
    context.showErrorMessage = message => assert.fail(message);
    await listeners[0](); settings.dispatch('click'); assert.equal(options, 1);
});

function settings(hash = '#import-settings-btn', compact = false) {
    const document = createDocument(), timers = [], scrolls = [], errors = [], ready = deferred();
    const html = fs.readFileSync('options.html', 'utf8');
    const tablist = document.createElement('aside'); tablist.className = 'options-tabs'; document.body.append(tablist);
    const content = document.createElement('div'); content.className = 'options-content'; document.body.append(content);
    const tabs = [], panels = {};
    for (const [, name] of html.matchAll(/class="tab-button[^\"]*" data-tab="([^\"]+)"/g)) {
        const tab = document.createElement('button'); tab.className = 'tab-button'; tab.dataset.tab = name; tablist.append(tab); tabs.push(tab);
        assert(html.includes(`id="tab-${name}" data-tab="${name}" role="tabpanel"`));
        const panel = document.createElement('div'); panel.className = 'tab-panel'; panel.id = `tab-${name}`; panel.dataset.tab = name; content.append(panel); panels[name] = panel;
    }
    assert.equal(tabs.length, 6);
    assert.match(html, /id="tab-data"[\s\S]*id="data-settings"[\s\S]*id="import-settings"[\s\S]*<button id="import-settings-btn"/);
    const section = document.createElement('section'); section.id = 'data-settings'; panels.data.append(section);
    const button = document.createElement('button'); button.id = 'import-settings-btn'; section.append(button);
    const input = document.createElement('input'); input.id = 'import-settings'; input.style.display = 'none'; section.append(input);
    const other = document.createElement('input'); document.body.append(other);
    let pickers = 0, imports = 0, writes = 0;
    input.click = () => { pickers++; };
    for (const target of [section, button]) target.scrollIntoView = options => scrolls.push({target, options});
    const window = {location: {hash}, matchMedia: () => ({matches: compact, addEventListener() {}}), getComputedStyle: element => ({visibility: element.style.visibility || 'visible'})};
    const context = {document, window, chrome: {}, setTimeout: (fn, delay) => timers.push({fn, delay}), console: {log() {}, warn() {}, error() {}}};
    vm.createContext(context); vm.runInContext(fs.readFileSync('options.js', 'utf8'), context);
    context.initializeOptionsPage = () => ready.promise;
    for (const name of ['displayStorageInfo', 'renderSyncStatus', 'renderDriveBackupPanel', 'renderRecoveryControls']) context[name] = async () => {};
    context.importSettings = () => { imports++; };
    context.saveAllSettings = () => { writes++; };
    context.showErrorMessage = error => errors.push(error);
    const loaded = document.listeners.get('DOMContentLoaded')();
    return {document, window, context, tabs, panels, section, button, input, other, ready, loaded, timers, scrolls, errors,
        runTimers() { timers.splice(0).forEach(({fn}) => fn()); }, get pickers() { return pickers; }, get imports() { return imports; }, get writes() { return writes; }};
}
test('actual Options DOM-ready flow waits for initialization, selects Data, and focuses Import without activation', async () => {
    for (const compact of [false, true]) {
        const h = settings('#import-settings-btn', compact);
        assert.equal(h.timers.length, 0); assert.equal(h.button.listeners.size, 0); assert.ok(h.document.activeElement === h.document.body, "expected focus ownership");
        h.ready.resolve(); await h.loaded; assert.deepEqual(h.errors, []);
        assert(h.panels.data.classList.contains('active')); assert.equal(h.tabs.find(tab => tab.getAttribute('aria-selected') === 'true').dataset.tab, 'data');
        assert.ok(h.document.activeElement === h.document.body, "expected focus ownership"); h.runTimers();
        assert.ok(h.document.activeElement === h.button, "expected focus ownership"); assert.equal(h.scrolls.at(-1).target, h.button);
        assert.equal(h.pickers, 0); assert.equal(h.imports, 0); assert.equal(h.writes, 0);
        assert.equal(h.input.style.display, 'none');
        nativeActivation(h.button, 'Enter'); assert.equal(h.pickers, 1);
        nativeActivation(h.button, ' '); assert.equal(h.pickers, 2);
        assert.equal(h.imports, 0); assert.equal(h.writes, 0);
    }
});
test('held/composing keys and duplicate clicks on destination cannot trigger automatic file selection', async () => {
    const h = settings(); h.ready.resolve(); await h.loaded; h.runTimers();
    for (const key of ['Enter', ' ']) for (const flag of [{repeat: true}, {isComposing: true}, {keyCode: 229}]) {
        const event = h.button.dispatch('keydown', {key, ...flag}); assert(event.prevented);
        if (!event.prevented) h.button.dispatch('click');
    }
    for (const fields of [{detail: 2}, {repeat: true}, {isComposing: true}]) h.button.dispatch('click', fields);
    assert.equal(h.pickers, 0); assert.equal(h.imports, 0); assert.equal(h.writes, 0);
});
test('delayed Import focus/scroll is cancelled by newer navigation, focus, hash, hidden or replaced targets', async () => {
    for (const mode of ['tab', 'tab-back', 'focus', 'hash', 'detached', 'replaced', 'panel-detached', 'panel-moved', 'hidden', 'inert', 'disabled', 'invisible']) {
        const h = settings(); h.ready.resolve(); await h.loaded;
        if (mode.startsWith('tab')) { h.tabs[0].dispatch('click'); if (mode === 'tab-back') h.tabs.at(-1).dispatch('click'); }
        if (mode === 'focus') h.other.focus();
        if (mode === 'hash') h.window.location.hash = '#data-settings';
        if (mode === 'detached') h.button.remove();
        if (mode === 'replaced') { h.button.remove(); const newButton = h.document.createElement('button'); newButton.id = h.button.id; h.section.append(newButton); }
        if (mode === 'panel-detached') h.panels.data.remove();
        if (mode === 'panel-moved') { h.button.remove(); h.panels[Object.keys(h.panels)[0]].append(h.button); }
        if (mode === 'hidden') h.section.hidden = true;
        if (mode === 'inert') h.section.inert = true;
        if (mode === 'disabled') h.button.disabled = true;
        if (mode === 'invisible') h.button.style.visibility = 'hidden';
        const focused = h.document.activeElement; h.runTimers();
        assert.ok(h.document.activeElement === focused, mode); assert.equal(h.scrolls.length, 0, mode);
        assert.equal(h.pickers, 0); assert.equal(h.imports, 0); assert.equal(h.writes, 0);
    }
});
test('normal and section-only Settings entries preserve selection/focus behavior; locale feedback exists', async () => {
    for (const hash of ['', '#data-settings', '#missing-destination']) {
        const h = settings(hash); h.ready.resolve(); await h.loaded; h.runTimers();
        assert.equal(h.tabs.find(tab => tab.getAttribute('aria-selected') === 'true').dataset.tab, hash === '#data-settings' ? 'data' : h.tabs[0].dataset.tab);
        assert.ok(h.document.activeElement === h.document.body, "expected focus ownership"); assert.equal(h.pickers, 0);
        assert.equal(h.scrolls.length, hash === '#data-settings' ? 1 : 0);
    }
    for (const locale of ['en', 'zh_CN']) {
        const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        for (const key of ['importSettingsOpenFailed', 'importSettingsOpenUnknown']) assert.ok(messages[key].message);
    }
});
