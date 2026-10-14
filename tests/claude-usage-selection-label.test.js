const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const API = require('../shared/claude-usage-snapshot');
const { createDocument } = require('./helpers/task-dom-model');
const tick = () => new Promise(setImmediate);
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222', C = '11111111-2222-2222-2222-111111111111';
const twins = [{ id: A, name: 'Synthetic team' }, { id: B, name: 'Synthetic team' }];
const windows = { five_hour: { usedPercent: 4, resetAt: null }, seven_day: { usedPercent: 29, resetAt: null } };
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function event() { const handlers = new Set(); return { addListener: fn => handlers.add(fn), removeListener: fn => handlers.delete(fn), fire: (...args) => [...handlers].forEach(fn => fn(...args)), count: () => handlers.size }; }
// Actual controller and entry renderer. Synthetic in-memory Chrome transport;
// never reads an account, requests a real permission, or contacts a provider.
function harness(organizations = twins) {
    const document = createDocument({ blurUnavailableFocus: true }), calls = [], listeners = new Map();
    for (const [id, tag] of [['enable', 'button'], ['close', 'button'], ['back', 'a'], ['result', 'section']]) { const node = document.createElement(tag); node.id = id; document.body.append(node); }
    const result = document.getElementById('result'); result.tabIndex = -1;
    let respond = async kind => kind === 'organizations' ? { organizations: structuredClone(organizations) } : { windows: structuredClone(windows) };
    const chrome = {
        permissions: { request: async () => { calls.push(['permission']); return true; }, contains: async () => true, onRemoved: event() },
        tabs: { query: async () => [{ id: 7, url: 'https://claude.ai/' }], get: async id => ({ id, url: 'https://claude.ai/' }), onUpdated: event(), onRemoved: event() },
        scripting: { executeScript: async request => { calls.push(['script', request.args]); return [{ frameId: 0, documentId: 'synthetic-document', result: await respond(...request.args) }]; } }
    };
    let controller;
    chrome.i18n = { getMessage: key => require('../_locales/zh_CN/messages.json')[key]?.message || '' };
    const window = { addEventListener: (type, fn) => listeners.set(type, fn) };
    vm.runInNewContext(fs.readFileSync('i18n.js', 'utf8'), { document, window, chrome });
    vm.runInNewContext(fs.readFileSync('claude-usage-experiment.js', 'utf8'), { document, chrome, window,
        ClaudeUsageSnapshot: { validTimestamp: require('../shared/claude-usage-snapshot').validTimestamp, createController: (transport, publish, options) => (controller = API.createController(transport, publish, options)) } });
    const text = () => result.children.map(node => node.textContent).join('\n');
    const scripts = () => calls.filter(call => call[0] === 'script').map(call => call[1]);
    const ready = async () => { await controller.enable(); await controller.selectTab(7); };
    return { document, result, chrome, controller, calls, listeners, text, scripts, ready, respond: fn => { respond = fn; } };
}
const cases = [
    ['same names', twins],
    ['unnamed', twins.map(org => ({ ...org, name: '' }))],
    ['fragment collision', [{ id: A, name: 'Synthetic team' }, { id: C, name: 'Synthetic team' }]]
];
for (const [name, organizations] of cases) for (let index = 0; index < organizations.length; index++) test(`selected ${name} organization ${index + 1} has the identical visible label in its actual snapshot`, async () => {
    const h = harness(organizations); await h.ready();
    const buttons = h.result.querySelectorAll('button'), selected = buttons[index].textContent;
    assert.notEqual(selected, buttons[1 - index].textContent); assert.equal(h.scripts().length, 1);
    buttons[index].focus(); buttons[index].dispatch('click'); buttons[index].dispatch('click'); await tick();
    const state = h.controller.getState(); assert.equal(state.phase, 'snapshot');
    assert.equal(state.organizationLabel, selected); assert(h.result.children[0].textContent.includes(selected));
    assert.equal(h.document.activeElement, h.result);
    assert.deepEqual(h.scripts(), [['organizations', null], ['organizations', null], ['usage', organizations[index].id]]);
    assert.equal(h.calls.filter(call => call[0] === 'permission').length, 1);
    if (name === 'fragment collision') assert(selected.includes(organizations[index].id));
    else assert(!JSON.stringify(state).includes(organizations[index].id));
    assert.deepEqual(Object.keys(state).sort(), ['fetchedAt', 'name', 'organizationLabel', 'phase', 'tabId', 'unavailable', 'windows']);
});

test('labels remain plain text and are generated locally, ignoring extra incoming metadata', async () => {
    const organizations = twins.map(org => ({ ...org, name: '<img src=x onerror=alert(1)>', displayLabel: 'untrusted replacement', credential: 'do not retain' }));
    const h = harness(organizations); await h.ready(); const label = h.result.querySelectorAll('button')[1].textContent;
    await h.controller.selectOrganization(B);
    assert.equal(h.controller.getState().organizationLabel, label); assert(label.includes('<img')); assert.equal(h.result.querySelectorAll('img').length, 0);
    assert(!JSON.stringify(h.controller.getState()).includes('untrusted replacement')); assert(!JSON.stringify(h.controller.getState()).includes('do not retain'));
});

test('a reordered organization recheck retains the original explicit label, including absent windows', async () => {
    const organizations = [{ id: A, name: 'Synthetic team' }, { id: C, name: 'Synthetic team' }], h = harness(organizations); await h.ready();
    const label = h.result.querySelectorAll('button')[1].textContent;
    h.respond(async kind => kind === 'organizations' ? { organizations: [...organizations].reverse() } : { windows: { five_hour: null, seven_day: null } });
    await h.controller.selectOrganization(C);
    assert.equal(h.controller.getState().organizationLabel, label); assert(h.result.children[0].textContent.includes(label)); assert.match(h.text(), /未提供订阅窗口/);
    assert.equal(h.scripts().length, 3);
});

for (const change of ['rename', 'remove', 'add collision']) test(`organization ${change} during the mandatory recheck cannot publish the old label or request usage`, async () => {
    const h = harness(); await h.ready(); const oldLabel = h.result.querySelectorAll('button')[0].textContent;
    const changed = change === 'rename' ? [{ ...twins[0], name: 'Changed' }, twins[1]] : change === 'remove' ? [twins[1]] : [...twins, { id: C, name: 'Synthetic team' }];
    h.respond(async () => ({ organizations: changed })); await h.controller.selectOrganization(A);
    assert.deepEqual(h.controller.getState(), { phase: 'error', error: 'organizations_changed' }); assert(!h.text().includes(oldLabel)); assert.equal(h.scripts().length, 2);
});

const clearWith = (h, action) => {
    if (['close', 'back'].includes(action)) h.document.getElementById(action).dispatch('click');
    else if (['pagehide', 'unload'].includes(action)) h.listeners.get(action)();
    else if (action === 'navigation') h.chrome.tabs.onUpdated.fire(7, { status: 'loading' });
    else if (action === 'tab removal') h.chrome.tabs.onRemoved.fire(7);
    else h.chrome.permissions.onRemoved.fire({ permissions: ['scripting'] });
};
for (const action of ['close', 'back', 'pagehide', 'unload', 'navigation', 'tab removal', 'revocation']) test(`${action} clears the completed label and prevents a pending usage label from returning`, async () => {
    for (const pending of [false, true]) {
        const h = harness(); await h.ready(); const oldLabel = h.result.querySelectorAll('button')[1].textContent, gate = deferred();
        if (pending) h.respond(async kind => kind === 'organizations' ? { organizations: twins } : gate.promise);
        const reading = h.controller.selectOrganization(B); await tick();
        if (!pending) assert(h.text().includes(oldLabel));
        clearWith(h, action); const after = h.text(), state = h.controller.getState();
        assert(!after.includes(oldLabel)); assert.equal(Object.hasOwn(state, 'organizationLabel'), false);
        gate.resolve({ windows }); await reading; assert.equal(h.text(), after); assert.deepEqual(h.controller.getState(), state);
        if (action === 'unload') for (const source of [h.chrome.tabs.onUpdated, h.chrome.tabs.onRemoved, h.chrome.permissions.onRemoved]) assert.equal(source.count(), 0);
    }
});

for (const pendingStage of ['organizations', 'usage']) test(`a new session keeps its own label when an old ${pendingStage} response finishes late`, async () => {
    const h = harness(); await h.ready(); const oldLabel = h.result.querySelectorAll('button')[0].textContent, gate = deferred();
    h.respond(async kind => kind === pendingStage ? gate.promise : { organizations: twins });
    const previous = h.controller.selectOrganization(A); await tick(); h.controller.close();
    const fresh = [{ id: B, name: 'New synthetic selection' }];
    h.respond(async kind => kind === 'organizations' ? { organizations: fresh } : { windows });
    await h.ready(); const label = h.result.querySelector('button').textContent; await h.controller.selectOrganization(B);
    const current = h.text(); assert(current.includes(label)); assert(!current.includes(oldLabel));
    gate.resolve(pendingStage === 'organizations' ? { organizations: twins } : { windows }); await previous;
    assert.equal(h.text(), current); assert.equal(h.controller.getState().organizationLabel, label);
    assert.deepEqual(h.scripts().filter(args => args[0] === 'usage'), pendingStage === 'usage' ? [['usage', A], ['usage', B]] : [['usage', B]]);
});

test('failed usage clears selection metadata rather than labeling an invalid snapshot', async () => {
    const h = harness(); await h.ready(); const label = h.result.querySelectorAll('button')[0].textContent;
    h.respond(async kind => kind === 'organizations' ? { organizations: twins } : { windows: { five_hour: { usedPercent: 101, resetAt: null }, seven_day: null } });
    await h.controller.selectOrganization(A); assert.deepEqual(h.controller.getState(), { phase: 'error', error: 'schema_changed' }); assert(!h.text().includes(label));
});
