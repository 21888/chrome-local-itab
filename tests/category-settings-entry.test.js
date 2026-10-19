'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createDocument} = require('./helpers/task-dom-model');

const source = fs.readFileSync('newtab.js', 'utf8');
const start = source.indexOf('const settingsNavigationButtons = new WeakSet();');
const end = source.indexOf("document.addEventListener('DOMContentLoaded'", start);
assert.ok(start >= 0 && end > start, 'use the actual idempotent dashboard settings bindings');
const bindings = source.slice(start, end) + '\nsetupSettingsNavigation();';
const workspaceView = fs.readFileSync('shared/workspaces-view.js', 'utf8');

function fixture(id, optionsAPI, categoryButton = true) {
    const document = createDocument(), opened = [], io = [];
    const settings = document.createElement('button'); settings.id = 'open-options';
    const categories = document.createElement('button'); categories.id = 'manage-categories';
    const draft = document.createElement('input'); draft.value = '  unchanged query 中文 & text  ';
    document.body.append(settings, draft);
    if (categoryButton) document.body.append(categories);
    const forbidden = name => () => { io.push(name); throw new Error(`Unexpected ${name}`); };
    const chrome = {runtime: {getURL: path => `chrome-extension://synthetic/${path}`},
        storage: {local: {get: forbidden('read'), set: forbidden('write'), remove: forbidden('remove')}}};
    if (optionsAPI) chrome.runtime.openOptionsPage = forbidden('openOptionsPage');
    const session = {id};
    const window = {document, chrome, LocalItabWorkspaces: {session},
        open: (...args) => { opened.push(args); return null; }};
    const context = vm.createContext({window, document, chrome});
    // Execute the real URL helper and the real click bindings. Only Chrome's
    // opening surface and the DOM are modeled; no handler is reimplemented.
    vm.runInContext(workspaceView, context);
    vm.runInContext(bindings, context);
    return {document, settings, categories, draft, opened, io, session};
}

for (const id of ['default', 'synthetic named & workspace']) {
    for (const optionsAPI of [true, false]) {
        test(`category settings entry retains ${id} and category destination, options API=${optionsAPI}`, () => {
            const f = fixture(id, optionsAPI), original = f.draft.value;
            f.categories.focus(); f.categories.dispatch('click');
            assert.equal(f.opened.length, 1);
            const [destination, target, features] = f.opened[0], url = new URL(destination);
            assert.equal(url.protocol, 'chrome-extension:');
            assert.equal(url.host, 'synthetic'); assert.equal(url.pathname, '/options.html');
            assert.equal(url.searchParams.get('workspace'), id);
            assert.equal(url.hash, '#category-settings');
            assert.equal(target, '_blank'); assert.equal(features, 'noopener');
            assert.equal(f.session.id, id); assert.equal(f.draft.value, original);
            assert.equal(f.document.activeElement, f.categories);
            assert.deepEqual(f.io, [], 'navigation must not read/write storage or open generic options');
        });
    }
}

for (const optionsAPI of [true, false]) test(`ordinary Settings keeps its unanchored destination, options API=${optionsAPI}`, () => {
    const f = fixture('synthetic workspace', optionsAPI);
    f.settings.focus(); f.settings.dispatch('click');
    assert.deepEqual(f.opened, [['chrome-extension://synthetic/options.html?workspace=synthetic%20workspace', '_blank', 'noopener']]);
    assert.equal(f.document.activeElement, f.settings);
    assert.equal(f.draft.value, '  unchanged query 中文 & text  ');
    assert.deepEqual(f.io, []);
});

test('missing category entry does not affect the ordinary Settings binding', () => {
    const f = fixture('default', true, false);
    assert.equal(f.opened.length, 0); f.settings.dispatch('click');
    assert.deepEqual(f.opened, [['chrome-extension://synthetic/options.html?workspace=default', '_blank', 'noopener']]);
    assert.deepEqual(f.io, []);
});
