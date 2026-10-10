'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const {createDocument} = require('./helpers/task-dom-model');
const html = fs.readFileSync('options.html', 'utf8');
const optionsSource = fs.readFileSync('options.js', 'utf8');
const backupHtml = html.slice(html.indexOf('<div id="update-backup-shortcuts"'), html.indexOf('<div class="setting-group full-width update-instructions">'));
const destinations = {'data-settings': 'data', 'countdown-settings': 'content'};
function harness(locale = 'en', compact = false, hash = '') {
    const document = createDocument(), timers = [], scrolls = [], actions = [];
    const catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));
    const append = (parent, tag, id, cls = '') => { const node = document.createElement(tag); node.id = id; node.className = cls; parent.append(node); return node; };
    const tabs = {}, panels = {}, fields = {}, targets = {}, headings = {};
    const tablist = append(document.body, 'aside', '', 'options-tabs');
    const content = append(document.body, 'div', '', 'options-content');
    for (const [, name] of html.matchAll(/class="tab-button[^\"]*" data-tab="([^\"]+)"/g)) {
        tabs[name] = append(tablist, 'button', '', 'tab-button'); tabs[name].dataset.tab = name;
        panels[name] = append(content, 'div', `tab-${name}`, 'tab-panel'); panels[name].dataset.tab = name;
        fields[name] = append(panels[name], 'input', `draft-${name}`); fields[name].value = `UNSAVED ${name}`; fields[name].checked = true;
        fields[name].selectionStart = 3; fields[name].selectionEnd = 6;
    }
    const visibleRects = node => {
        const rects = node.getClientRects.bind(node);
        node.getClientRects = () => node.closest('.tab-panel')?.classList.contains('active') ? rects() : [];
    };
    for (const [id, tab] of Object.entries(destinations)) {
        assert(html.includes(`id="${id}"`));
        targets[id] = append(panels[tab], 'section', id, 'settings-section'); visibleRects(targets[id]);
        const header = append(targets[id], 'div', '', 'section-header');
        headings[id] = append(header, 'h2', '', 'section-title'); visibleRects(headings[id]);
        targets[id].scrollIntoView = options => scrolls.push({id, ...options});
        const action = append(targets[id], 'button', id === 'data-settings' ? 'export-settings' : 'countdown-export');
        action.addEventListener('click', () => actions.push(id));
    }
    const version = append(panels.privacy, 'section', 'version-update-settings', 'settings-section');
    const title = append(version, 'h2', 'update-title', 'section-title'); title.textContent = catalog.updateTitle.message;
    version.scrollIntoView = () => scrolls.push({id: version.id});
    const host = append(version, 'div', 'update-backup-shortcuts');
    const buttons = [];
    for (const match of backupHtml.matchAll(/<button\s+([^>]+)>([^<]+)<\/button>/g)) {
        const button = append(host, 'button');
        for (const [, name, value] of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) {
            button.setAttribute(name, value);
            if (name === 'type') button.type = value;
            if (name === 'data-update-backup-target') button.dataset.updateBackupTarget = value;
            if (name === 'data-i18n') button.textContent = catalog[value].message;
        }
        visibleRects(button); buttons.push(button);
    }
    const search = append(document.body, 'section', 'settings-search');
    const input = append(search, 'input', 'settings-search-input');
    append(search, 'button', 'settings-search-clear');
    const results = append(search, 'ul', 'settings-search-results'); append(search, 'p', 'settings-search-status');
    const pending = {}, scratchpad = {draft: 'PRIVATE_NOTE'}, countdown = {draft: {title: 'PRIVATE_COUNTDOWN'}, pending};
    const window = {location: {hash}, matchMedia: () => ({matches: compact, addEventListener() {}}),
        getComputedStyle: node => ({visibility: node.style.visibility || 'visible'}),
        i18n: {t: key => catalog[key]?.message || key}, localTasksSettingsController: {pending},
        localScratchpadSettingsView: scratchpad, localCountdownSettingsView: countdown};
    const context = {document, window, console, setTimeout: fn => timers.push(fn), chrome: {storage: {local: {set: () => assert.fail('navigation saved data')}}}};
    vm.createContext(context); vm.runInContext(optionsSource, context);
    for (const key of ['initializeOptionsPage', 'populateFormFields', 'saveAllSettings', 'exportSettings', 'importSettings']) context[key] = () => assert.fail(`${key} called by navigation`);
    const navigation = context.setupSettingsTabs();
    vm.runInContext(fs.readFileSync('shared/settings-search.js', 'utf8'), context);
    window.LocalItabSettingsSearch.mount(search, navigation);
    return {catalog, document, window, context, tabs, panels, fields, host, buttons, targets, headings, search, input, results, pending, scratchpad, countdown, timers, scrolls, actions, navigation};
}
function activate(button, key = 'Enter', fields = {}) {
    button.focus();
    const event = button.dispatch('keydown', {key, ...fields});
    if (!event.prevented) button.dispatch('click', {detail: 0, ...fields});
    return event;
}
test('two truthful section shortcuts are localized, have explicit non-submit semantics and verified export destinations', () => {
    for (const locale of ['en', 'zh_CN']) {
        const h = harness(locale); assert.equal(h.buttons.length, 2);
        for (const button of h.buttons) {
            assert.equal(button.type, 'button'); assert.equal(button.getAttribute('aria-controls'), button.dataset.updateBackupTarget);
            assert.equal(button.getAttribute('aria-describedby'), 'update-backup-navigation'); assert(button.textContent.length > 0);
        }
        const catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));
        for (const [, key] of backupHtml.matchAll(/data-i18n="([^"]+)"/g)) assert(catalog[key]?.message);
        for (const key of ['tasksData', 'tasksExport', 'scratchpadExport', 'tabLayout', 'moduleVisibility']) assert(catalog.updateBackupCards.message.includes(catalog[key].message));
    }
    assert.match(html, /id="data-settings"[\s\S]*<button id="export-settings"/);
    assert.match(html, /id="countdown-settings"[\s\S]*id="local-countdown-settings"/);
    assert.match(optionsSource, /LocalItabCountdown\.mountSettings\(countdownHost\)/);
    assert.match(fs.readFileSync('shared/local-countdown-view.js', 'utf8'), /this\.exportButton = button\('countdownExport', \(\) => this\.exportText\(\)\)/);
    assert(!backupHtml.includes('newtab.html')); assert(!backupHtml.includes('data-update-backup-target="local-tasks'));
});
test('Enter/Space/click navigate in place with heading focus and no download, save, remount or draft/filter changes', () => {
    for (const locale of ['en', 'zh_CN']) for (const compact of [false, true]) {
        const h = harness(locale, compact), hash = h.window.location.hash;
        h.input.value = h.catalog.countdownTitle.message; h.input.dispatch('input'); const result = h.results.children[0];
        assert(result, 'real setting-name search has a result');
        const nodes = {...h.fields};
        for (const button of h.buttons) for (const key of ['Enter', ' ']) {
            h.tabs.privacy.dispatch('click');
            assert(!activate(button, key).prevented);
            const id = button.dataset.updateBackupTarget;
            assert(h.panels[destinations[id]].classList.contains('active'));
            assert.equal(h.document.activeElement, h.headings[id]); assert.equal(h.headings[id].tabIndex, -1);
            assert.deepEqual(h.scrolls.at(-1), {id, behavior: 'instant', block: 'start'});
            assert.equal(h.tabs[destinations[id]].getAttribute('aria-selected'), 'true');
            assert.equal(Object.values(h.tabs).filter(node => node.tabIndex === 0).length, 1);
            assert.equal(h.window.location.hash, hash); assert.equal(h.input.value, h.catalog.countdownTitle.message); assert.equal(h.results.children[0], result);
            assert.equal(h.window.localTasksSettingsController.pending, h.pending);
            assert.equal(h.window.localCountdownSettingsView, h.countdown); assert.equal(h.countdown.draft.title, 'PRIVATE_COUNTDOWN');
            assert.equal(h.window.localScratchpadSettingsView, h.scratchpad); assert.equal(h.scratchpad.draft, 'PRIVATE_NOTE');
            for (const [name, field] of Object.entries(h.fields)) {
                assert.equal(field, nodes[name]); assert.equal(field.value, `UNSAVED ${name}`); assert(field.checked);
                assert.equal(field.selectionStart, 3); assert.equal(field.selectionEnd, 6);
            }
            assert.deepEqual(h.actions, []);
            // The destination is not an export control, even if the user keeps holding Enter/Space.
            h.document.activeElement.dispatch('keydown', {key, repeat: true}); assert.deepEqual(h.actions, []);
        }
        h.tabs.privacy.dispatch('click'); h.buttons[0].dispatch('click'); assert.equal(h.document.activeElement, h.headings['data-settings']);
        // Export remains a separate, explicit user action at the destination.
        h.document.getElementById('export-settings').dispatch('click'); assert.deepEqual(h.actions, ['data-settings']);
        h.results.querySelector('button').dispatch('click'); assert.equal(h.document.activeElement, h.headings['countdown-settings']);
    }
});
test('held/composing/modified activation is blocked while ordinary keyboard navigation stays native', () => {
    const h = harness(); h.tabs.privacy.dispatch('click'); const button = h.buttons[0];
    for (const key of ['Enter', ' ', 'Spacebar']) for (const flag of ['repeat', 'isComposing', 'ctrlKey', 'altKey', 'metaKey', 'shiftKey']) {
        assert(activate(button, key, {[flag]: true}).prevented);
        button.dispatch('click', {[flag]: true}); assert.equal(h.scrolls.length, 0);
    }
    assert(activate(button, 'Enter', {keyCode: 229}).prevented);
    button.dispatch('click', {detail: 2}); assert.equal(h.scrolls.length, 0);
    for (const key of ['Tab', 'ArrowDown', 'Escape']) assert(!button.dispatch('keydown', {key}).prevented);
});
test('stale/hidden/inert source and missing/moved/hidden destinations never trigger an export or unsafe focus', () => {
    for (const mode of ['source-detached', 'source-hidden', 'source-disabled', 'source-inert', 'host-replaced', 'source-inactive', 'missing', 'moved', 'target-hidden', 'target-inert', 'heading-missing']) {
        const h = harness(); h.tabs.privacy.dispatch('click'); const button = h.buttons[0], target = h.targets['data-settings']; button.focus();
        if (mode === 'source-detached') button.remove();
        if (mode === 'source-hidden') h.host.hidden = true;
        if (mode === 'source-disabled') button.disabled = true;
        if (mode === 'source-inert') h.host.inert = true;
        if (mode === 'host-replaced') { h.host.remove(); const replacement = h.document.createElement('div'); replacement.id = h.host.id; h.panels.privacy.append(replacement); }
        if (mode === 'source-inactive') h.tabs.appearance.dispatch('click');
        if (mode === 'missing') target.remove();
        if (mode === 'moved') { target.remove(); h.panels.content.append(target); }
        if (mode === 'target-hidden') target.hidden = true;
        if (mode === 'target-inert') target.inert = true;
        if (mode === 'heading-missing') h.headings['data-settings'].remove();
        const focused = h.document.activeElement; button.dispatch('click');
        assert.equal(h.document.activeElement, focused, mode); assert.equal(h.scrolls.length, 0, mode); assert.deepEqual(h.actions, [], mode);
    }
});
test('new shortcut navigation invalidates delayed deep-link focus; later tab selection keeps ownership', () => {
    const h = harness('en', false, '#data-settings'); assert.equal(h.timers.length, 1);
    h.tabs.privacy.dispatch('click'); h.buttons[1].dispatch('click');
    assert.equal(h.scrolls.length, 1); assert.equal(h.document.activeElement, h.headings['countdown-settings']);
    const count = h.scrolls.length; h.tabs.appearance.dispatch('click'); h.tabs.appearance.focus();
    h.timers.forEach(fn => fn());
    assert.equal(h.scrolls.length, count); assert.equal(h.document.activeElement, h.tabs.appearance);
    assert(h.panels.appearance.classList.contains('active')); assert.deepEqual(h.actions, []);
});
