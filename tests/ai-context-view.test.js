const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { webcrypto } = require('node:crypto'); global.crypto ||= webcrypto;
const { createDocument, deferred } = require('./helpers/task-dom-model');
const api = require('../shared/ai-context'), Tasks = require('../shared/local-tasks-store'), Collections = require('../shared/local-ai-collections-store');
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
function backend() { let raw; return { writes: 0, lock: fn => fn(), read: async () => structuredClone(raw), async write(value) { this.writes++; raw = structuredClone(value); }, subscribe: () => () => {} }; }
async function model(presetStore) {
    const document = createDocument(), host = document.createElement('main'); document.body.append(host);
    const events = new Map(), window = { document, addEventListener: (type, fn) => events.set(type, fn), removeEventListener: type => events.delete(type) };
    const b = backend(), c = backend(), calls = []; let reply = '{"tasks":["<b>literal</b>","same","same"]}';
    const transport = { review: input => ({ ...input, origin: 'https://mock.example', permission: 'https://mock.example:443/*' }), run: async (input, options) => { calls.push({ input, options }); return { text: await reply }; } };
    const controller = new api.Controller({ transport, permissions: { request: async () => true, contains: async () => true }, ensureActive: async () => {},
        readSources: async () => [{ id: 'collection:synthetic', label: '<img src=x>', text: 'synthetic saved text', scope: 'library' }], taskStore: new Tasks.Store(b), collectionStore: new Collections.Store(c) });
    vm.runInNewContext(fs.readFileSync('shared/ai-context-view.js', 'utf8'), { window });
    const view = window.LocalItabAIContextView.mount(host, { controller, presetStore }); await view.ready;
    const field = type => host.querySelectorAll('input').find(node => node.type === type);
    const byText = text => host.querySelectorAll('button').find(node => node.textContent.startsWith(text));
    const click = text => { const node = byText(text); assert(node); assert.equal(Boolean(node.disabled), false, `${text} enabled`); node.dispatch('click'); return node; };
    const input = (node, value) => { node.value = value; node.dispatch('input'); };
    input(field('url'), 'https://mock.example/v1/chat/completions'); input(field('text'), 'mock');
    const question = host.querySelectorAll('textarea')[0]; input(question, 'Create tasks');
    return { host, document, controller, b, c, calls, view, events, click, field, input, byText, setReply: value => { reply = value; } };
}
async function send(h, mode = 'tasks') {
    const select = h.host.querySelector('select'); select.value = mode; select.dispatch('change'); h.click('Review exact'); await settle(); h.click('Send reviewed'); await settle();
}
test('actual UI: no default selected source and text-safe exact edited context preview', async () => {
    const h = await model(), checkbox = h.field('checkbox'); assert.equal(checkbox.checked, false);
    h.click('Review exact'); await settle(); assert.equal(h.calls.length, 0);
    let outgoing = h.controller.reviewed.packed; assert.equal(outgoing.sources.length, 0);
    checkbox.checked = true; checkbox.dispatch('change');
    const excerpt = h.host.querySelector('.ai-context-source').querySelector('textarea'); h.input(excerpt, 'edited <script>literal</script>');
    h.click('Review exact'); await settle(); outgoing = h.controller.reviewed.packed;
    assert.equal(outgoing.sources[0].text, 'edited <script>literal</script>');
    assert.equal(h.host.querySelectorAll('script').length, 0); assert.equal(h.host.querySelectorAll('img').length, 0);
    assert.equal(h.b.writes + h.c.writes, 0);
    h.click('Allow this'); await settle(); assert.equal(h.calls.length, 0);
});
test('actual UI: extracted tasks need separate review and confirmation, repeat text preserved', async () => {
    const h = await model(); h.input(h.field('password'), 'synthetic-key'); await send(h);
    assert.equal(h.field('password').value, ''); assert.equal(h.b.writes, 0); assert.equal(h.byText('Add these').disabled, true);
    h.click('Review extracted'); await settle(); assert.equal(h.b.writes, 0);
    assert.deepEqual(h.host.querySelectorAll('li').map(node => node.textContent), ['<b>literal</b>', 'same', 'same']);
    assert.equal(h.host.querySelectorAll('b').length, 0);
    h.click('Add these'); await settle(); assert.equal(h.b.writes, 1); assert.equal(h.c.writes, 0);
});
test('actual UI: changing task JSON invalidates its review; Cancel clears private draft without writes', async () => {
    const h = await model(); await send(h); h.click('Review extracted'); await settle();
    const output = h.host.querySelectorAll('textarea').find(node => node.rows === 8); h.input(output, '{"tasks":["new"]}');
    assert.equal(h.byText('Add these').disabled, true); h.click('Cancel / clear');
    assert.equal(h.controller.result, null); assert.equal(output.value, ''); assert.equal(h.b.writes + h.c.writes, 0);
});
test('actual UI: endpoint edit clears key and review; pagehide clears key and cancels late result', async () => {
    const h = await model(); h.input(h.field('password'), 'synthetic'); h.click('Review exact'); await settle();
    h.input(h.field('url'), 'https://other.example/chat/completions'); assert.equal(h.field('password').value, ''); assert.equal(h.controller.reviewed, null);
    const pending = deferred(); h.setReply(pending.promise); h.click('Review exact'); await settle(); h.click('Send reviewed');
    assert.equal(h.byText('Stop request').disabled, false); h.events.get('pagehide')(); pending.resolve('late'); await settle();
    assert.equal(h.controller.result, null); assert.equal(h.host.children.length, 0); assert.equal(h.b.writes + h.c.writes, 0);
});
test('actual UI: answer is not saved until explicit save; empty sources remain empty on output', async () => {
    const h = await model(); h.setReply('<a href="javascript:bad">untrusted</a>'); await send(h, 'answer');
    assert.equal(h.c.writes, 0); assert.equal(h.host.querySelectorAll('a').length, 0);
    h.click('Save answer'); for (let i = 0; i < 100 && h.controller.busy; i++) await new Promise(resolve => setTimeout(resolve, 5)); await settle(); assert.equal(h.c.writes, 1); assert.equal(h.byText('Save answer').disabled, true);
});
test('new-tab wrapper uses dialog focus trap, IME-safe Escape, lifecycle guard and restores trigger focus', () => {
    const document = createDocument(), trigger = document.createElement('button'); trigger.id = 'ai-context-entry'; document.body.append(trigger); trigger.focus();
    const events = new Map(), controller = { busy: false }, window = { document, chrome: { permissions: {} },
        addEventListener: (type, fn) => events.set(type, fn), removeEventListener: type => events.delete(type), confirm: () => true,
        LocalItabAIContext: { createController: () => controller }, LocalItabAIContextView: { mount: () => ({ hasUncommittedWork: () => false, destroy() {} }) } };
    const context = vm.createContext({ window });
    vm.runInContext(fs.readFileSync('shared/dialog-focus.js', 'utf8'), context); vm.runInContext(fs.readFileSync('ai-context.js', 'utf8'), context);
    trigger.dispatch('click'); trigger.dispatch('click');
    const overlay = document.querySelector('.ai-context-overlay'); assert.equal(document.querySelectorAll('.ai-context-overlay').length, 1);
    assert.equal(document.querySelector('.ai-context-dialog').getAttribute('role'), 'dialog'); assert.equal(window.aiContextView.hasUncommittedWork(), true);
    overlay.dispatch('keydown', { key: 'Escape', isComposing: true }); assert.equal(overlay.isConnected, true);
    overlay.dispatch('keydown', { key: 'Escape' }); assert.equal(overlay.isConnected, false); assert.equal(document.activeElement === trigger, true); assert.equal(window.aiContextView, null);
});
test('new-tab wrapper blocks closing a pending write and honors response-discard cancellation', () => {
    const document = createDocument(), trigger = document.createElement('button'); trigger.id = 'ai-context-entry'; document.body.append(trigger);
    const controller = { busy: true }, window = { document, chrome: { permissions: {} }, addEventListener() {}, removeEventListener() {}, confirm: () => false,
        LocalItabAIContext: { createController: () => controller }, LocalItabAIContextView: { mount: () => ({ hasUncommittedWork: () => true, destroy() {} }) } };
    const context = vm.createContext({ window }); vm.runInContext(fs.readFileSync('shared/dialog-focus.js', 'utf8'), context); vm.runInContext(fs.readFileSync('ai-context.js', 'utf8'), context);
    trigger.dispatch('click'); const overlay = document.querySelector('.ai-context-overlay'); overlay.dispatch('keydown', { key: 'Escape' }); assert.equal(overlay.isConnected, true);
    controller.busy = false; overlay.dispatch('keydown', { key: 'Escape' }); assert.equal(overlay.isConnected, true);
    window.confirm = () => true; overlay.dispatch('keydown', { key: 'Escape' }); assert.equal(overlay.isConnected, false);
});
test('source integration and runtime inventory include context without a new persistence key', () => {
    const html = fs.readFileSync('newtab.html', 'utf8'), inventory = fs.readFileSync('tools/package_extension.py', 'utf8');
    for (const file of ['shared/ai-model-client.js', 'shared/ai-context.js', 'shared/ai-context-view.js', 'ai-context.js', 'ai-context.css']) { assert(html.includes(file)); assert(inventory.includes(`"${file}"`)); }
    const lifecycle = fs.readFileSync('shared/local-content-lifecycle.js', 'utf8'); assert(lifecycle.includes('root.aiContextView?.pending')); assert(lifecycle.includes('root.aiContextView?.hasUncommittedWork?.()'));
    for (const file of ['shared/ai-context.js', 'shared/ai-context-view.js', 'ai-context.js']) assert(!/storage\.(local|sync)|localStorage|innerHTML|eval\(/.test(fs.readFileSync(file, 'utf8')));
});

test('Q&A reuses saved metadata without sources, grants or automatic requests', async () => {
    const Presets = require('../shared/ai-model-presets');
    let state = { version: 1, records: [{ name: 'Synthetic', url: 'https://mock.example/v1/chat/completions', model: 'mock' }] }, writes = 0;
    const presetStore = Presets.createStore({ chromeApi: { storage: { local: { get: async () => ({ [Presets.KEY]: state }), set: async value => { writes++; state = structuredClone(value[Presets.KEY]); } } } }, locks: { request: (_, fn) => fn() } });
    const h = await model(presetStore); h.click('Review exact'); await settle(); h.input(h.field('password'), 'synthetic-secret');
    h.view.presetSelect.value = '0'; h.view.presetSelect.dispatch('change');
    assert.equal(h.field('password').value, ''); assert.equal(h.controller.reviewed, null); assert.equal(h.field('checkbox').checked, false); assert.equal(writes, 0);
    h.view.presetName.value = 'Renamed'; h.view.presetSave.dispatch('click'); await settle(); assert.equal(writes, 1); assert.equal(state.records[0].name, 'Renamed');
    h.click('Review exact'); await settle(); assert.equal(h.controller.reviewed.request.url, state.records[0].url);
    h.view.presetDelete.dispatch('click'); await settle(); assert.equal(writes, 2); assert.equal(h.controller.reviewed, null); assert.equal(h.field('url').value, ''); assert.equal(h.calls.length, 0); h.view.destroy();
});
