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
    const b = backend(), c = backend(), calls = []; let active = true; let reply = '{"tasks":["<b>literal</b>","same","same"]}';
    const transport = { review: input => ({ ...input, origin: 'https://mock.example', permission: 'https://mock.example:443/*' }), run: async (input, options) => { calls.push({ input, options }); return { text: await reply }; } };
    const controller = new api.Controller({ transport, permissions: { request: async () => true, contains: async () => true }, ensureActive: async () => { if (!active) throw api.fault('WORKSPACE_INVALIDATED'); },
        readSources: async () => [{ id: 'collection:synthetic', label: '<img src=x>', text: 'synthetic saved text', scope: 'library' }], taskStore: new Tasks.Store(b), collectionStore: new Collections.Store(c) });
    // The DOM model executes UI in a VM; real UI/controller share one realm.
    const review = controller.review.bind(controller);
    controller.review = input => review(JSON.parse(JSON.stringify(input)));
    vm.runInNewContext(fs.readFileSync('shared/ai-context-view.js', 'utf8'), { window });
    const view = window.LocalItabAIContextView.mount(host, { controller, presetStore }); await view.ready;
    const field = type => host.querySelectorAll('input').find(node => node.type === type);
    const byText = text => host.querySelectorAll('button').find(node => node.textContent.startsWith(text));
    const click = text => { const node = byText(text); assert(node); assert.equal(Boolean(node.disabled), false, `${text} enabled`); node.dispatch('click'); return node; };
    const input = (node, value) => { node.value = value; node.dispatch('input'); };
    input(field('url'), 'https://mock.example/v1/chat/completions'); input(field('text'), 'mock');
    const question = host.querySelectorAll('textarea')[0]; input(question, 'Create tasks');
    return { host, document, controller, b, c, calls, view, events, click, field, input, byText, deactivate: () => { active = false; }, setReply: value => { reply = value; } };
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

test('snapshot save UI defaults off, previews exact reviewed data, and persists only on explicit choice', async () => {
    const h = await model(); h.setReply('Synthetic answer');
    const source = h.host.querySelector('.ai-context-source'), check = source.querySelector('input');
    check.checked = true; check.dispatch('change'); h.input(source.querySelector('textarea'), '<script>edited evidence</script>');
    await send(h, 'answer');
    const section = h.host.querySelector('.ai-context-save-context'), option = section.querySelector('input'), preview = section.querySelector('pre');
    assert.equal(option.checked, false); assert.equal(preview.hidden, true); assert.equal(h.c.writes, 0);
    option.checked = true; option.dispatch('change');
    const snapshot = JSON.parse(preview.textContent);
    assert.equal(snapshot.sources[0].text, '<script>edited evidence</script>');
    assert.equal(snapshot.prompt, h.controller.reviewed.request.prompt);
    assert.equal(h.host.querySelectorAll('script').length, 0);
    assert.match(section.querySelector('p').textContent, /unencrypted backups/);
    h.click('Save answer');
    for (let i = 0; i < 100 && h.controller.busy; i++) await new Promise(resolve => setTimeout(resolve, 5)); await settle();
    assert.deepEqual((await h.controller.collectionStore.read()).records[0].contextSnapshot, snapshot);
    assert.equal(option.disabled, true);
});

test('changing or cancelling the reviewed request clears snapshot consent and preview', async () => {
    const h = await model(); h.setReply('Synthetic answer'); await send(h, 'answer');
    const section = h.host.querySelector('.ai-context-save-context'), option = section.querySelector('input');
    option.checked = true; option.dispatch('change');
    h.input(h.field('url'), 'https://other.example/v1/chat/completions');
    assert.equal(option.checked, false); assert.equal(section.hidden, true); assert.equal(section.querySelector('pre').textContent, '');
    assert.equal(h.c.writes, 0);
});


const answerTitle = h => h.host.querySelectorAll('input').find(node => node.maxLength === 200);
const questionField = h => h.host.querySelectorAll('textarea')[0];
test('answer title defaults to the exact reviewed question, truncates safely, and refreshes for a new request', async () => {
    const h = await model(); h.setReply('Synthetic answer');
    h.input(questionField(h), 'a'.repeat(199) + '😀 end');
    await send(h, 'answer'); assert.equal(answerTitle(h).value, 'a'.repeat(199));
    h.input(questionField(h), 'Second question'); assert.equal(answerTitle(h).value, '');
    h.click('Review exact'); await settle();
    // The completion must use the reviewed question even if the DOM value differs.
    questionField(h).value = 'Unreviewed DOM value';
    h.click('Send reviewed'); await settle();
    assert.equal(answerTitle(h).value, 'Second question'); assert.equal(h.c.writes, 0);
});
test('explicit pre-send and post-response answer titles survive review and save exactly', async () => {
    const h = await model(); h.setReply('Synthetic answer');
    h.input(answerTitle(h), 'My chosen title'); await send(h, 'answer');
    assert.equal(answerTitle(h).value, 'My chosen title');
    h.input(answerTitle(h), 'Final chosen title'); h.click('Save answer');
    for (let i = 0; i < 100 && h.controller.busy; i++) await new Promise(resolve => setTimeout(resolve, 5)); await settle();
    assert.equal((await h.controller.collectionStore.read()).records[0].title, 'Final chosen title');
    assert.equal(h.c.writes, 1);
});
test('answer title remains editable during the request and explicit blank is not replaced', async () => {
    for (const title of ['Edited while waiting', '']) {
        const h = await model(), pending = deferred(); h.setReply(pending.promise);
        h.input(answerTitle(h), 'Before sending'); await send(h, 'answer');
        assert.equal(answerTitle(h).disabled, false); assert.equal(questionField(h).disabled, true);
        h.input(answerTitle(h), title); pending.resolve('Synthetic answer'); await settle();
        assert.equal(answerTitle(h).value, title); assert.equal(h.c.writes, 0);
        if (!title) { h.click('Save answer'); await settle(); assert.equal(h.c.writes, 0); }
    }
});
test('clear resets explicit title intent; fresh requests retain only deliberate titles', async () => {
    const h = await model(); h.setReply('Synthetic answer'); h.input(answerTitle(h), 'Custom');
    await send(h, 'answer');
    h.input(questionField(h), 'Revised question'); await send(h, 'answer');
    assert.equal(answerTitle(h).value, 'Custom');
    h.click('Cancel / clear'); assert.equal(answerTitle(h).value, '');
    h.input(questionField(h), 'Fresh question'); await send(h, 'answer');
    assert.equal(answerTitle(h).value, 'Fresh question'); assert.equal(h.c.writes, 0);
});
test('late responses after stop, departure or workspace invalidation never overwrite answer titles', async () => {
    for (const kind of ['stop', 'pagehide', 'workspace']) {
        const h = await model(), pending = deferred(); h.setReply(pending.promise);
        h.input(answerTitle(h), 'Keep this title'); await send(h, 'answer');
        const title = answerTitle(h), output = h.host.querySelectorAll('textarea').find(node => node.rows === 8);
        if (kind === 'stop') h.click('Stop request');
        else if (kind === 'pagehide') h.events.get('pagehide')();
        else h.deactivate();
        pending.resolve('Late response'); await settle();
        assert.equal(title.value, 'Keep this title'); assert.equal(output.value || '', '');
        assert.equal(h.controller.result, null); assert.equal(h.c.writes, 0);
        if (kind === 'stop') {
            h.click('Cancel / clear'); h.input(questionField(h), 'After stopped request');
            h.setReply('Current response'); await send(h, 'answer');
            assert.equal(answerTitle(h).value, 'After stopped request');
        }
    }
});
test('completion already superseded at the view boundary cannot set the output or default title', async () => {
    const h = await model(); h.setReply('Superseded response');
    const original = h.controller.send.bind(h.controller);
    h.controller.send = async key => { const result = await original(key); h.controller.edit(); return result; };
    await send(h, 'answer');
    assert.equal(answerTitle(h).value || '', '');
    assert.equal(h.host.querySelectorAll('textarea').find(node => node.rows === 8).value || '', '');
    assert.equal(h.c.writes, 0);
});

test('UI Stop unlocks a hung send, preserves stopped status, and late callbacks cannot alter a fresh answer', { timeout: 5000 }, async () => {
    for (const stage of ['permission', 'workspace', 'transport']) {
        const h = await model(), gate = deferred();
        h.host.querySelector('select').value = 'answer'; h.host.querySelector('select').dispatch('change');
        h.click('Review exact'); await settle();
        const ensureActive = h.controller.ensureActive;
        if (stage === 'permission') h.controller.permissions.contains = () => gate.promise;
        if (stage === 'workspace') h.controller.ensureActive = () => gate.promise;
        if (stage === 'transport') h.setReply(gate.promise);
        h.input(h.field('password'), 'synthetic-old-key'); h.click('Send reviewed'); await settle(); h.click('Stop request'); await settle();
        assert.equal(h.controller.busy, false); assert.equal(h.byText('Review exact').disabled, false); assert.equal(h.byText('Cancel / clear').disabled, false);
        assert.equal(h.field('password').value, ''); assert.match(h.host.querySelector('.ai-context-status').textContent, /^Stopped\./);
        assert.equal(h.controller.result, null); assert.equal(h.b.writes + h.c.writes, 0);
        h.controller.ensureActive = ensureActive; h.controller.permissions.contains = async () => true;
        h.click('Cancel / clear'); h.input(questionField(h), 'Fresh question'); h.setReply('Fresh answer'); await send(h, 'answer');
        const status = h.host.querySelector('.ai-context-status').textContent, calls = h.calls.length;
        gate.resolve(stage === 'transport' ? 'Late old answer' : true); await settle();
        assert.equal(h.calls.length, calls); assert.equal(h.controller.result.text, 'Fresh answer'); assert.equal(answerTitle(h).value, 'Fresh question');
        assert.equal(h.host.querySelector('.ai-context-status').textContent, status); assert.equal(h.b.writes + h.c.writes, 0); h.view.destroy();
    }
});

test('pagehide settles an unresolved permission check without a late request or UI resurrection', async () => {
    const h = await model(), gate = deferred(); h.click('Review exact'); await settle();
    h.controller.permissions.contains = () => gate.promise; h.input(h.field('password'), 'synthetic-key');
    h.click('Send reviewed'); await settle(); h.events.get('pagehide')(); await settle();
    assert.equal(h.controller.busy, false); assert.equal(h.field('password'), undefined); assert.equal(h.host.children.length, 0);
    gate.resolve(true); await settle(); assert.equal(h.calls.length, 0); assert.equal(h.controller.result, null);
    assert.equal(h.host.children.length, 0); assert.equal(h.b.writes + h.c.writes, 0);
});
