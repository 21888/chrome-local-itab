'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const registry = require('../shared/dashboard-template-registry');
const { createDocument, nativeActivation } = require('./helpers/dashboard-harness');
function setup(language = 'en') {
    const document = createDocument();
    document.documentElement.lang = language;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const choices = [];
    const context = { window: { LocalItabTemplates: registry, chrome: { i18n: { getUILanguage: () => language } } } };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('shared/dashboard-template-gallery.js', 'utf8'), context);
    return { document, host, choices, gallery: context.window.LocalItabTemplateGallery.mount(host, id => choices.push(id)) };
}
test('gallery offers all presets with inert diagrams and no write on browsing/closing', () => {
    const h = setup(), details = h.host.querySelector('details');
    const buttons = h.host.querySelectorAll('button');
    assert.equal(buttons.length, 21);
    assert.equal(h.host.querySelectorAll('[aria-hidden="true"]').length, 21);
    assert.equal(h.choices.length, 0);
    details.open = true;
    details.open = false;
    assert.equal(h.choices.length, 0);
    for (const [index, button] of buttons.entries()) {
        nativeActivation(button, index % 2 ? ' ' : 'Enter');
        assert.equal(h.choices.at(-1), registry.ids[index]);
    }
});
test('render uses current saved selection without rebuilding keyboard focus, including rollback', () => {
    const h = setup();
    const buttons = h.host.querySelectorAll('button');
    buttons[17].focus();
    for (const id of ['clarity', 'today', 'today', 'clarity']) {
        h.gallery.render({ template: id });
        assert.equal(h.host.querySelectorAll('[aria-pressed="true"]').length, 1);
        assert.equal(h.host.querySelector('[aria-pressed="true"]').dataset.templateChoice, id);
        assert.equal(h.document.activeElement === buttons[17], true);
        assert.equal(h.host.querySelectorAll('button')[17] === buttons[17], true);
    }
    assert.equal(h.choices.length, 0);
});
test('escape closes the native disclosure and restores summary focus without selecting', () => {
    const h = setup('zh-CN'), details = h.host.querySelector('details');
    assert.match(h.host.querySelector('summary').textContent, /21 种布局/);
    assert.equal(h.host.querySelector('strong').textContent, '清晰');
    details.open = true;
    details.dispatch('keydown', { key: 'Escape' });
    assert.equal(details.open, false);
    assert.equal(h.document.activeElement === h.host.querySelector('summary'), true);
    assert.equal(h.choices.length, 0);
});
