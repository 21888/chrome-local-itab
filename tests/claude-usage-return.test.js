'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const API = require('../shared/claude-usage-snapshot');
const { createDocument } = require('./helpers/task-dom-model');
const pageHtml = fs.readFileSync('claude-usage-experiment.html', 'utf8');
const optionsHtml = fs.readFileSync('options.html', 'utf8');
const returnHref = pageHtml.match(/<a\b[^>]*id="back"[^>]*href="([^"]+)"/)[1];
const returnHash = new URL(returnHref, 'https://extension.invalid/').hash;
const tick = () => new Promise(setImmediate);
const organizations = [{ id: '11111111-1111-1111-1111-111111111111', name: 'Synthetic return test' }];
const windows = { five_hour: { usedPercent: 4, resetAt: '2026-10-13T10:00:00Z' }, seven_day: null };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function event() { const handlers = new Set(); return { addListener: fn => handlers.add(fn), removeListener: fn => handlers.delete(fn), count: () => handlers.size }; }

// Execute the actual Settings tab router against the existing HTML's destinations.
// Timers/scroll/focus are modeled; browser history and native navigation are not.
function settings(hash = returnHash, compact = false) {
    const document = createDocument(), timers = [], scrolls = [], tabs = {}, panels = {};
    const append = (parent, tag, cls = '') => { const node = document.createElement(tag); node.className = cls; parent.append(node); return node; };
    const tablist = append(document.body, 'aside', 'options-tabs');
    const content = append(document.body, 'div', 'options-content');
    for (const [, name] of optionsHtml.matchAll(/class="tab-button[^\"]*" data-tab="([^\"]+)"/g)) {
        tabs[name] = append(tablist, 'button', 'tab-button'); tabs[name].dataset.tab = name;
        panels[name] = append(content, 'div', 'tab-panel'); panels[name].dataset.tab = name;
    }
    const beforeSection = optionsHtml.slice(0, optionsHtml.indexOf('id="claude-usage-settings"'));
    const owner = [...beforeSection.matchAll(/class="tab-panel[^\"]*" id="tab-([^\"]+)"/g)].at(-1)[1];
    assert.equal(owner, 'privacy');
    const section = append(panels[owner], 'section', 'settings-section'); section.id = 'claude-usage-settings';
    section.scrollIntoView = options => scrolls.push({ target: section, options });
    const rects = section.getClientRects.bind(section);
    section.getClientRects = () => section.closest('.tab-panel')?.classList.contains('active') ? rects() : [];
    const window = { location: { hash }, matchMedia: () => ({ matches: compact, addEventListener() {} }) };
    const context = { document, window, setTimeout: (fn, delay) => timers.push({ fn, delay }) };
    vm.createContext(context); vm.runInContext(fs.readFileSync('options.js', 'utf8'), context);
    context.setupSettingsTabs();
    return { document, window, tabs, panels, section, timers, scrolls, runTimers: () => timers.splice(0).forEach(({ fn }) => fn()) };
}

test('the existing return link has one fixed local Claude Settings destination', () => {
    assert.equal(returnHref, 'options.html#claude-usage-settings');
    assert.match(optionsHtml, /id="claude-usage-open" href="claude-usage-experiment.html"/);
    assert.match(fs.readFileSync('shared/settings-search.js', 'utf8'), /"target": "claude-usage-settings", "tab": "privacy"/);
});
for (const compact of [false, true]) test(`actual return route activates Privacy and scrolls to Claude without activation (${compact ? 'compact' : 'wide'})`, () => {
    const h = settings(returnHash, compact);
    assert.deepEqual(Object.keys(h.panels).filter(name => h.panels[name].classList.contains('active')), ['privacy']);
    assert.deepEqual(Object.keys(h.tabs).filter(name => h.tabs[name].getAttribute('aria-selected') === 'true'), ['privacy']);
    assert.deepEqual(Object.keys(h.tabs).filter(name => h.tabs[name].tabIndex === 0), ['privacy']);
    assert.equal(h.timers.length, 1); assert.equal(h.timers[0].delay, 80); assert.equal(h.scrolls.length, 0);
    h.runTimers(); assert.equal(h.scrolls.length, 1); assert.equal(h.scrolls[0].target, h.section);
    assert.equal(h.scrolls[0].options.block, 'start'); assert.equal(h.document.activeElement, h.document.body);
});
for (const change of ['newer tab', 'tab round trip', 'hash', 'detached', 'replaced', 'moved', 'hidden']) test(`delayed Claude return positioning yields to ${change}`, () => {
    const h = settings();
    if (change === 'newer tab' || change === 'tab round trip') { h.tabs.data.dispatch('click'); h.tabs.data.focus(); }
    if (change === 'tab round trip') { h.tabs.privacy.dispatch('click'); h.tabs.privacy.focus(); }
    if (change === 'hash') h.window.location.hash = '#data-settings';
    if (change === 'detached' || change === 'replaced' || change === 'moved') h.section.remove();
    if (change === 'replaced') { const replacement = h.document.createElement('section'); replacement.id = h.section.id; h.panels.privacy.append(replacement); }
    if (change === 'moved') h.panels.data.append(h.section);
    if (change === 'hidden') h.section.hidden = true;
    const focus = h.document.activeElement, active = Object.keys(h.panels).filter(name => h.panels[name].classList.contains('active'));
    h.runTimers(); assert.equal(h.scrolls.length, 0); assert.equal(h.document.activeElement, focus);
    assert.deepEqual(Object.keys(h.panels).filter(name => h.panels[name].classList.contains('active')), active);
});
test('ordinary Settings opening still selects the first tab with no delayed return positioning', () => {
    const h = settings(''); assert(h.panels.appearance.classList.contains('active')); assert.equal(h.timers.length, 0);
});

// Actual page renderer + controller, with synthetic Chrome calls only. No fetch,
// storage, real account access, or actual permission request is available here.
function page() {
    const document = createDocument({ aggregateTextContent: true }), calls = [], listeners = new Map();
    for (const [id, tag] of [['enable', 'button'], ['close', 'button'], ['back', 'a'], ['result', 'section']]) {
        assert.match(pageHtml, new RegExp(`<${tag}\\b[^>]*id="${id}"`));
        const node = document.createElement(tag); node.id = id; document.body.append(node);
    }
    document.getElementById('back').setAttribute('href', returnHref);
    const result = document.getElementById('result');
    let respond = async kind => kind === 'permission' ? true : kind === 'organizations' ? { organizations } : { windows };
    const chrome = {
        permissions: { request: async () => { calls.push('permission'); return respond('permission'); }, contains: async () => true, onRemoved: event() },
        tabs: { query: async () => { calls.push('tabs'); return [{ id: 7, url: 'https://claude.ai/' }]; }, get: async id => ({ id, url: 'https://claude.ai/' }), onUpdated: event(), onRemoved: event() },
        scripting: { executeScript: async request => { const kind = request.args[0]; calls.push(kind); return [{ frameId: 0, documentId: 'synthetic-return-document', result: await respond(kind) }]; } }
    };
    let controller;
    const window = { addEventListener: (name, handler) => listeners.set(name, handler) };
    vm.runInNewContext(fs.readFileSync('claude-usage-experiment.js', 'utf8'), { document, window, chrome,
        ClaudeUsageSnapshot: { ...API, createController: (...args) => (controller = API.createController(...args)) } });
    const click = id => document.getElementById(id).dispatch('click');
    const choose = () => { const button = result.querySelector('button'); assert(button); button.dispatch('click'); return tick(); };
    return { document, controller, chrome, listeners, calls, result, click, choose, respond: fn => { respond = fn; }, text: () => result.textContent,
        async ready() { click('enable'); await tick(); await choose(); assert.equal(controller.getState().phase, 'organizations'); } };
}
function assertClosed(h) {
    assert.deepEqual(h.controller.getState(), { phase: 'disabled' });
    assert.equal(h.result.children.length, 1); assert.equal(h.text(), 'Closed. No snapshot has been saved.');
    assert.equal(h.result.querySelectorAll('button, details').length, 0);
}
for (const action of ['back', 'close']) for (const phase of ['organizations', 'snapshot']) test(`actual ${action} clears ${phase} state synchronously and repeated lifecycle cleanup is safe`, async () => {
    const h = page(); assert.deepEqual(h.calls, []); await h.ready();
    const staleSelection = h.result.querySelector('button');
    if (phase === 'snapshot') await h.choose();
    assert.equal(h.controller.getState().phase, phase); assert(h.text().includes(organizations[0].name));
    const before = [...h.calls], click = h.click(action); assert.equal(click.prevented, false); assertClosed(h);
    staleSelection.dispatch('click'); await tick(); assert.deepEqual(h.calls, before); assertClosed(h);
    h.listeners.get('pagehide')({ persisted: true }); h.listeners.get('pagehide')({ persisted: false }); assertClosed(h);
    h.listeners.get('unload')(); assertClosed(h);
    for (const source of [h.chrome.tabs.onUpdated, h.chrome.tabs.onRemoved, h.chrome.permissions.onRemoved]) assert.equal(source.count(), 0);
    if (action === 'back') { const destination = settings(); destination.runTimers(); assert.equal(destination.scrolls[0].target.id, 'claude-usage-settings'); }
});
for (const stage of ['permission', 'initial organizations', 'organization recheck', 'usage']) for (const outcome of ['resolve', 'reject']) test(`actual return ignores late ${stage} ${outcome} without starting another stage`, async () => {
    const h = page(), gate = deferred();
    if (stage !== 'permission') { h.click('enable'); await tick(); }
    if (stage === 'organization recheck' || stage === 'usage') await h.choose();
    h.respond(kind => {
        if (kind === 'permission' || kind === (stage === 'usage' ? 'usage' : 'organizations')) return gate.promise;
        return Promise.resolve({ organizations });
    });
    if (stage === 'permission') h.click('enable'); else h.result.querySelector('button').dispatch('click');
    await tick(); assert.equal(h.controller.getState().phase, stage === 'permission' ? 'enabling' : 'loading');
    const expectedCalls = { permission: ['permission'], 'initial organizations': ['permission', 'tabs', 'organizations'],
        'organization recheck': ['permission', 'tabs', 'organizations', 'organizations'], usage: ['permission', 'tabs', 'organizations', 'organizations', 'usage'] };
    assert.deepEqual(h.calls, expectedCalls[stage]);
    const before = [...h.calls]; assert.equal(h.click('back').prevented, false); assertClosed(h);
    if (outcome === 'reject') gate.reject(new Error('Synthetic late failure'));
    else gate.resolve(stage === 'permission' ? true : stage === 'usage' ? { windows } : { organizations });
    await tick(); assertClosed(h); assert.deepEqual(h.calls, before);
    const reopened = page(); assertClosed(reopened); assert.deepEqual(reopened.calls, []);
});
