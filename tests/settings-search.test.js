const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const {createDocument} = require('./helpers/task-dom-model');
const html = fs.readFileSync('options.html', 'utf8');
const searchSource = fs.readFileSync('shared/settings-search.js', 'utf8');
const optionsSource = fs.readFileSync('options.js', 'utf8');
const locales = Object.fromEntries(['en', 'zh_CN'].map(locale => [locale, JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'))]));
const names = [...html.matchAll(/class="tab-button[^\"]*" data-tab="([^\"]+)"/g)].map(match => match[1]);
const privateValues = ['PRIVATE_NOTE_SENTINEL', 'PRIVATE_TASK_SENTINEL', 'PRIVATE_COUNTDOWN_SENTINEL',
    'PRIVATE_CATEGORY_SENTINEL', 'PRIVATE_DEVICE_SENTINEL', 'PRIVATE_CREDENTIAL_SENTINEL', 'https://private.example/secret'];
function harness(locale = 'en', compact = false, hash = '') {
    const document = createDocument(), timers = [], scrolls = [], keys = [];
    const host = document.createElement('section'); host.id = 'settings-search'; document.body.append(host);
    const el = (tag, id) => { const node = document.createElement(tag); node.id = id; host.append(node); return node; };
    const input = el('input', 'settings-search-input'), clear = el('button', 'settings-search-clear');
    const results = el('ul', 'settings-search-results'), status = el('p', 'settings-search-status');
    const tablist = document.createElement('aside'); tablist.className = 'options-tabs'; document.body.append(tablist);
    const content = document.createElement('div'); content.className = 'options-content'; document.body.append(content);
    const tabs = [], panels = {};
    for (const name of names) {
        const button = document.createElement('button'); button.dataset.tab = name; button.className = 'tab-button'; tablist.append(button); tabs.push(button);
        const panel = document.createElement('div'); panel.dataset.tab = name; panel.className = 'tab-panel'; content.append(panel); panels[name] = panel;
    }
    let writes = 0, refreshes = 0;
    const pending = {}, drafts = {clock: ['UNSAVED_CLOCK'], countdown: {title: 'UNSAVED_COUNTDOWN'}, scratchpad: 'UNSAVED_NOTE'};
    const window = {location: {hash}, matchMedia: () => ({matches: compact, addEventListener(){}}),
        i18n: {t(key) { keys.push(key); assert(locales[locale][key], `missing ${locale} key ${key}`); return locales[locale][key].message; }},
        localTasksSettingsController: {pending}, localCountdownSettingsView: {draft: drafts.countdown}, localScratchpadSettingsView: {draft: drafts.scratchpad}};
    const context = {document, window, console, setTimeout: fn => timers.push(fn),
        chrome: {storage: {local: {set() { writes++; }}}}};
    vm.createContext(context); vm.runInContext(optionsSource, context); vm.runInContext(searchSource, context);
    const api = window.LocalItabSettingsSearch, entries = api.index(), nodes = {};
    for (const entry of entries) {
        assert(html.includes(`id="${entry.target}"`), `missing HTML destination ${entry.target}`);
        const target = document.createElement(/^local-(tasks|focus|scratchpad)-settings$/.test(entry.target) ? 'div' : 'section'); target.id = entry.target;
        if (!/^local-(tasks|focus|scratchpad)-settings$/.test(entry.target)) target.className = 'settings-section';
        (/^local-(tasks|focus|scratchpad)-settings$/.test(entry.target) ? nodes['visibility-settings'] : panels[entry.tab]).append(target);
        target.scrollIntoView = options => scrolls.push({id: target.id, options});
        // Model inactive-panel CSS plus conditional/hidden ancestors.
        const rects = target.getClientRects.bind(target);
        target.getClientRects = () => target.closest('.tab-panel')?.classList.contains('active') ? rects() : [];
        if (!/^local-(tasks|focus|scratchpad)-settings$/.test(entry.target)) {
            const heading = document.createElement('h2'); heading.className = 'section-title'; heading.textContent = entry.title; target.append(heading);
            heading.getClientRects = () => target.getClientRects();
        }
        // Dynamic content, status and user values are deliberately toxic to search.
        for (const [index, value] of privateValues.entries()) {
            const field = document.createElement(index % 2 ? 'pre' : 'input'); field.value = value; field.textContent = value;
            field.setAttribute('aria-label', value); field.setAttribute('placeholder', value); target.append(field);
        }
        Object.defineProperty(target, 'textContent', {get() { throw new Error('Search read private container text'); }});
        nodes[entry.target] = target;
    }
    context.initializeOptionsPage = () => { refreshes++; };
    context.populateFormFields = () => { refreshes++; };
    context.saveAllSettings = () => { writes++; };
    const navigation = context.setupSettingsTabs();
    const mounted = api.mount(host, navigation);
    const listenerCounts = [...input.listeners.values(), ...clear.listeners.values()].map(listeners => listeners.length);
    assert.equal(api.mount(host, navigation), mounted);
    assert.deepEqual([...input.listeners.values(), ...clear.listeners.values()].map(listeners => listeners.length), listenerCounts, 'repeat mount is idempotent');
    const query = value => { input.value = value; input.dispatch('input'); };
    const buttons = () => results.querySelectorAll('button');
    const title = button => button.querySelector('.settings-search-result-title').textContent;
    const resultFor = entry => buttons().find(button => title(button) === `${entry.tabLabel} › ${entry.title}`);
    return {context, window, document, host, input, clear, results, status, nodes, entries, tabs, panels, timers, scrolls, keys,
        api, query, buttons, resultFor, pending, drafts, navigation, get writes() { return writes; }, get refreshes() { return refreshes; }};
}
for (const locale of ['en', 'zh_CN']) for (const compact of [false, true]) {
    const h = harness(locale, compact);
    assert.equal(h.entries.length, 17); assert.equal(new Set(h.entries.map(entry => entry.tab)).size, 6);
    assert(h.results.hidden); assert(h.clear.disabled); assert.equal(h.status.textContent, '');
    const snapshots = new Map(h.entries.map(entry => [entry.target, h.nodes[entry.target]]));
    for (const entry of h.entries) {
        h.query(entry.title);
        const button = h.resultFor(entry); assert(button, `find ${locale} ${entry.title}`);
        button.dispatch('click');
        assert(h.panels[entry.tab].classList.contains('active'));
        assert.equal(h.tabs.filter(tab => tab.getAttribute('aria-selected') === 'true').length, 1);
        assert.equal(h.tabs.filter(tab => tab.tabIndex === 0).length, 1);
        const focused = h.document.activeElement;
        assert(['H2', 'DIV', 'SECTION'].includes(focused.tagName)); assert.equal(focused.tabIndex, -1);
        assert.equal(h.scrolls.at(-1).id, entry.target); assert.equal(h.scrolls.at(-1).options.behavior, 'instant');
        assert.equal(h.nodes[entry.target], snapshots.get(entry.target));
        for (const field of entry.fields) assert(h.api.find(field).some(found => found.target === entry.target));
    }
    for (const value of privateValues) { h.query(value); assert.equal(h.buttons().length, 0); assert.equal(h.status.textContent, locales[locale].settingsSearchEmpty.message); }
    h.query('<img src=x onerror=alert(1)>'); assert.equal(h.buttons().length, 0);
    h.query('   '); assert(h.results.hidden); assert.equal(h.status.textContent, ''); assert(!h.clear.disabled);
    h.clear.dispatch('click'); assert.equal(h.input.value, ''); assert.equal(h.document.activeElement, h.input); assert(h.clear.disabled);
    assert.equal(h.window.localTasksSettingsController.pending, h.pending);
    assert.equal(h.window.localCountdownSettingsView.draft, h.drafts.countdown);
    assert.equal(h.window.localScratchpadSettingsView.draft, h.drafts.scratchpad);
    for (const target of Object.values(h.nodes)) {
        const fields = target.children.filter(child => ['INPUT', 'PRE'].includes(child.tagName));
        assert.deepEqual(fields.map(field => field.value), privateValues);
    }
    assert.equal(h.writes, 0); assert.equal(h.refreshes, 0);
}
{
    const h = harness(), initial = h.tabs.find(tab => tab.getAttribute('aria-selected') === 'true');
    h.query('  WORLD   CLOCKS '); assert.equal(h.buttons().length, 1);
    assert.equal(h.tabs.find(tab => tab.getAttribute('aria-selected') === 'true'), initial, 'typing never navigates');
    assert(!h.input.dispatch('keydown', {key: 'Enter'}).prevented); assert.equal(h.scrolls.length, 0);
    const button = h.buttons()[0];
    for (const key of ['Enter', ' ']) for (const flag of ['isComposing', 'repeat', 'altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
        assert(button.dispatch('keydown', {key, [flag]: true}).prevented);
        button.dispatch('click', {[flag]: true}); assert.equal(h.scrolls.length, 0);
    }
    assert(button.dispatch('keydown', {key: 'Enter', keyCode: 229}).prevented);
    for (const key of ['Tab', 'Enter', ' ', 'ArrowDown']) assert(!button.dispatch('keydown', {key}).prevented);
    h.input.dispatch('compositionstart'); h.input.value = 'Tasks'; h.input.dispatch('input', {isComposing: true});
    assert.equal(h.buttons()[0], button); button.dispatch('click'); assert.equal(h.scrolls.length, 0);
    h.clear.dispatch('click'); assert.equal(h.input.value, 'Tasks');
    h.input.dispatch('compositionend'); assert(h.buttons().some(b => b.querySelector('.settings-search-result-title').textContent.includes('Tasks')));
    h.query('Ｆｏｃｕｓ'); assert.equal(h.buttons().length, 1, 'NFKC normalization');
    h.buttons()[0].dispatch('click'); assert.equal(h.document.activeElement, h.nodes['local-focus-settings']);
    assert.equal(h.document.activeElement.getAttribute('aria-label'), 'Focus timer');
    // Invalid IDs do not deselect all tabs or scroll; detached/reparented targets are not navigable.
    const before = h.scrolls.length; assert.equal(h.navigation.activateTab('not-a-tab'), false);
    h.query('World clocks'); const stale = h.buttons()[0]; h.nodes['world-clock-settings'].remove(); stale.dispatch('click'); assert.equal(h.scrolls.length, before);
    h.query('Countdown'); const moved = h.buttons()[0]; h.nodes['countdown-settings'].remove(); h.panels.data.append(h.nodes['countdown-settings']); moved.dispatch('click'); assert.equal(h.scrolls.length, before);
    h.query('Countdown'); assert.equal(h.buttons().length, 0);
    // Conditional host stays hidden and resolves to the containing visible heading.
    h.nodes['local-focus-settings'].hidden = true; h.query('Focus'); h.buttons()[0].dispatch('click');
    assert.equal(h.scrolls.at(-1).id, 'visibility-settings'); assert.equal(h.document.activeElement.tagName, 'H2'); assert(h.nodes['local-focus-settings'].hidden);
    assert.equal(h.writes, 0); assert.equal(h.refreshes, 0);
}
{
    const h = harness('en', false, '#data-settings');
    assert(h.panels.data.classList.contains('active')); assert.equal(h.document.activeElement, h.document.body);
    h.query('Privacy'); h.buttons()[0].dispatch('click'); assert(h.panels.privacy.classList.contains('active'));
}
// Static integration constraints; native visual layout and key synthesis are separate QA.
assert(html.includes('for="settings-search-input"')); assert(html.includes('role="status" aria-live="polite" aria-atomic="true"'));
assert(html.indexOf('shared/settings-search.js') < html.indexOf('src="options.js"'));
assert(optionsSource.indexOf('window.LocalItabSettingsSearch.mount') > optionsSource.indexOf('window.i18n.localizeDocument(document)'));
const css = fs.readFileSync('options.css', 'utf8');
assert.match(css, /\.options-main\s*\{[^}]*flex-direction:\s*column/);
assert.match(css, /\.options-main\s*>\s*\.options-layout\s*\{[^}]*width:\s*100%/);
for (const token of ['--glass-bg', '--glass-border', '--text-primary', '--text-muted', '--text-accent']) assert(css.slice(css.indexOf('/* Settings-only search:')).includes(token));
assert(css.includes('.settings-search-results[hidden]')); assert(css.includes('.settings-search-controls { align-items: stretch; flex-direction: column; }'));
assert(!/localStorage|sessionStorage|fetch\(|chrome\.storage|console\.|\.innerHTML|\.value\s*=.*entry/.test(searchSource));
assert(fs.readFileSync('tools/package_extension.py', 'utf8').includes('"shared/settings-search.js"'));
console.log('PASS Settings search: static translated labels, all six tabs/17 destinations in en/zh, normalization, hidden panels, IME/modifier/repeat guards, no Enter-in-input, safe focus, conditional/stale targets, draft identity, private sentinels, zero writes/remounts, theme/narrow integration. Native layout and key synthesis not modeled.');
