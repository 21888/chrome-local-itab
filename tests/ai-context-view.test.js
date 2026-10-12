const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { webcrypto } = require('node:crypto'); global.crypto ||= webcrypto;
const { createDocument, deferred } = require('./helpers/task-dom-model');
const api = require('../shared/ai-context'), Tasks = require('../shared/local-tasks-store'), Collections = require('../shared/local-ai-collections-store');
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
function backend() { let raw; return { reads: 0, writes: 0, lock: fn => fn(), async read() { this.reads++; return structuredClone(raw); }, async write(value) { this.writes++; raw = structuredClone(value); }, subscribe: () => () => {} }; }
async function model(presetStore, { populate = true, sources, blurUnavailableFocus = false } = {}) {
    const document = createDocument({ blurUnavailableFocus }), host = document.createElement('main'); document.body.append(host);
    const events = new Map(), window = { document, addEventListener: (type, fn) => events.set(type, fn), removeEventListener: type => events.delete(type) };
    const b = backend(), c = backend(), calls = []; let active = true; let reply = '{"tasks":["<b>literal</b>","same","same"]}';
    const transport = { review: input => ({ ...input, origin: 'https://mock.example', permission: 'https://mock.example:443/*' }), run: async (input, options) => { calls.push({ input, options }); return { text: await reply }; } };
    const controller = new api.Controller({ transport, permissions: { request: async () => true, contains: async () => true }, ensureActive: async () => { if (!active) throw api.fault('WORKSPACE_INVALIDATED'); },
        readSources: async () => sources || [{ id: 'collection:synthetic', label: '<img src=x>', text: 'synthetic saved text', scope: 'library' }], taskStore: new Tasks.Store(b), collectionStore: new Collections.Store(c) });
    // The DOM model executes UI in a VM; real UI/controller share one realm.
    const review = controller.review.bind(controller);
    controller.review = input => review(JSON.parse(JSON.stringify(input)));
    vm.runInNewContext(fs.readFileSync('shared/ai-context-view.js', 'utf8'), { window });
    const view = window.LocalItabAIContextView.mount(host, { controller, presetStore }); await view.ready;
    const field = type => host.querySelectorAll('input').find(node => node.type === type);
    const byText = text => host.querySelectorAll('button').find(node => node.textContent.startsWith(text));
    const click = text => { const node = byText(text); assert(node); assert.equal(Boolean(node.disabled), false, `${text} enabled`); node.dispatch('click'); return node; };
    const input = (node, value) => { node.value = value; node.dispatch('input'); };
    if (populate) {
        input(field('url'), 'https://mock.example/v1/chat/completions'); input(field('text'), 'mock');
        const question = host.querySelectorAll('textarea')[0]; input(question, 'Create tasks');
    }
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

function unloadEvent(h) {
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    h.events.get('beforeunload')(event); return event;
}
test('unsent draft guard starts clean, ignores connection setup, and protects question without review', async () => {
    const h = await model(undefined, { populate: false });
    assert.equal(h.view.hasUncommittedWork(), false); assert.equal(unloadEvent(h).prevented, false);
    h.input(h.field('url'), 'https://mock.example/v1/chat/completions'); h.input(h.field('text'), 'mock');
    h.input(h.field('password'), 'synthetic-key');
    assert.equal(h.view.hasUncommittedWork(), false);
    h.input(questionField(h), 'Unsent synthetic question');
    assert.equal(h.controller.reviewed, null); assert.equal(h.view.hasUncommittedWork(), true);
    const event = unloadEvent(h); assert.equal(event.prevented, true); assert.equal(event.returnValue, '');
    assert.equal(questionField(h).value, 'Unsent synthetic question'); assert.equal(h.field('password').value, 'synthetic-key');
    h.input(questionField(h), ''); assert.equal(h.view.hasUncommittedWork(), false);
    h.input(questionField(h), 'Review only'); h.click('Review exact'); await settle();
    assert(h.controller.reviewed); assert.equal(h.view.hasUncommittedWork(), true); assert.equal(unloadEvent(h).prevented, true);
    h.click('Cancel / clear'); assert.equal(h.view.hasUncommittedWork(), false); assert.equal(unloadEvent(h).prevented, false);
    assert.equal(h.controller.reviewed, null); assert.equal(h.field('password').value, '');
    assert.equal(h.calls.length, 0); assert.equal(h.b.writes + h.c.writes, 0);
});
test('unsent source selections and edited hidden excerpts are guarded and clear restores their baseline', async () => {
    const h = await model(undefined, { populate: false }), row = h.host.querySelector('.ai-context-source');
    const check = row.querySelector('input'), excerpt = row.querySelector('textarea'), original = excerpt.value;
    check.checked = true; check.dispatch('change');
    assert.equal(h.view.hasUncommittedWork(), true); assert.equal(unloadEvent(h).prevented, true);
    check.checked = false; check.dispatch('change'); assert.equal(h.view.hasUncommittedWork(), false);
    check.checked = true; check.dispatch('change'); h.input(excerpt, 'Edited synthetic excerpt');
    check.checked = false; check.dispatch('change');
    assert.equal(excerpt.hidden, true); assert.equal(h.view.hasUncommittedWork(), true); assert.equal(unloadEvent(h).prevented, true);
    h.input(excerpt, original); assert.equal(h.view.hasUncommittedWork(), false);
    h.input(excerpt, 'Another edit'); h.click('Cancel / clear');
    assert.equal(excerpt.value, original); assert.equal(check.checked, false); assert.equal(excerpt.hidden, true);
    assert.equal(h.view.hasUncommittedWork(), false); assert.equal(unloadEvent(h).prevented, false);
    assert.equal(h.calls.length, 0); assert.equal(h.b.writes + h.c.writes, 0);
    h.view.destroy(); assert.equal(h.view.hasUncommittedWork(), false); assert.equal(h.events.has('beforeunload'), false);
});
test('actual view and wrapper protect unsent drafts on Close and Escape; cancel retains and discard reopens blank', async () => {
    for (const method of ['close', 'escape']) for (const reviewed of [false, true]) {
        const document = createDocument(), trigger = document.createElement('button'); trigger.id = 'ai-context-entry'; document.body.append(trigger);
        let controller, mounted, confirmations = 0, discard = false, requests = 0;
        const events = new Map(), b = backend(), c = backend();
        const window = { document, chrome: { permissions: {} }, addEventListener: (type, fn) => events.set(type, fn), removeEventListener: type => events.delete(type),
            confirm: text => { confirmations++; assert.match(text, /unsaved draft or response/); return discard; },
            LocalItabAIContext: { createController: () => {
                controller = new api.Controller({ transport: { review: input => ({ ...input, origin: 'https://mock.example', permission: 'https://mock.example:443/*' }), run: async () => { requests++; return { text: 'unused' }; } },
                    permissions: { request: async () => true, contains: async () => true }, ensureActive: async () => {},
                    readSources: async () => [{ id: 'collection:synthetic', label: 'Synthetic', text: 'Original synthetic excerpt', scope: 'library' }],
                    taskStore: new Tasks.Store(b), collectionStore: new Collections.Store(c) });
                const review = controller.review.bind(controller); controller.review = input => review(JSON.parse(JSON.stringify(input))); return controller;
            } } };
        const context = vm.createContext({ window });
        for (const file of ['shared/dialog-focus.js', 'shared/ai-context-view.js', 'ai-context.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
        const mount = window.LocalItabAIContextView.mount;
        window.LocalItabAIContextView.mount = (...args) => (mounted = mount(...args));
        trigger.focus(); trigger.dispatch('click'); await mounted.ready;
        const overlay = document.querySelector('.ai-context-overlay'), question = overlay.querySelectorAll('textarea')[0];
        const edit = (node, value) => { node.value = value; node.dispatch('input'); };
        edit(question, 'Unsent synthetic question');
        const source = overlay.querySelector('.ai-context-source'), check = source.querySelector('input'), excerpt = source.querySelector('textarea');
        check.checked = true; check.dispatch('change'); edit(excerpt, 'Edited synthetic excerpt');
        const key = overlay.querySelectorAll('input').find(node => node.type === 'password'); edit(key, 'synthetic-key');
        if (reviewed) {
            edit(overlay.querySelectorAll('input').find(node => node.type === 'url'), 'https://mock.example/v1/chat/completions');
            edit(overlay.querySelectorAll('input').find(node => node.type === 'text'), 'mock'); edit(key, 'synthetic-key');
            overlay.querySelectorAll('button').find(node => node.textContent === 'Review exact request').dispatch('click'); await settle(); assert(controller.reviewed);
        }
        const dismiss = () => method === 'close' ? overlay.querySelector('.ai-context-close').dispatch('click') : overlay.dispatch('keydown', { key: 'Escape' });
        const oldReviewed = controller.reviewed;
        dismiss(); assert.equal(confirmations, 1); assert.equal(overlay.isConnected, true); assert.equal(controller.closed, false);
        assert.equal(question.value, 'Unsent synthetic question'); assert.equal(check.checked, true); assert.equal(excerpt.value, 'Edited synthetic excerpt');
        assert.equal(key.value, 'synthetic-key'); assert.equal(controller.reviewed, oldReviewed);
        discard = true; dismiss(); assert.equal(confirmations, 2); assert.equal(overlay.isConnected, false); assert.equal(controller.closed, true);
        assert.equal(key.value, ''); assert.equal(controller.reviewed, null); assert.equal(events.has('beforeunload'), false); assert.equal(document.activeElement, trigger);
        trigger.focus(); trigger.dispatch('click'); await mounted.ready;
        const fresh = document.querySelector('.ai-context-overlay'); assert.equal(fresh.querySelectorAll('textarea')[0].value, '');
        assert.equal(fresh.querySelector('.ai-context-source').querySelector('input').checked, false);
        assert.equal(fresh.querySelector('.ai-context-source').querySelector('textarea').value, 'Original synthetic excerpt');
        assert.equal(mounted.hasUncommittedWork(), false);
        fresh.querySelector('.ai-context-close').dispatch('click'); assert.equal(confirmations, 2); assert.equal(fresh.isConnected, false);
        assert.equal(requests, 0); assert.equal(b.writes + c.writes, 0);
    }
});


test('a deliberate unsent answer title is guarded, but restoring or clearing it returns to clean', async () => {
    const h = await model(undefined, { populate: false }), title = answerTitle(h);
    title.value = 'Programmatic title';
    assert.equal(h.view.hasUncommittedWork(), false); assert.equal(unloadEvent(h).prevented, false);
    h.input(title, 'My unsent synthetic title');
    assert.equal(h.view.hasUncommittedWork(), true); assert.equal(unloadEvent(h).prevented, true);
    h.input(title, ''); assert.equal(h.view.hasUncommittedWork(), false); assert.equal(unloadEvent(h).prevented, false);
    h.input(title, 'Another synthetic title'); h.click('Cancel / clear');
    assert.equal(title.value, ''); assert.equal(h.view.hasUncommittedWork(), false); assert.equal(unloadEvent(h).prevented, false);
    title.value = 'Another programmatic title'; assert.equal(h.view.hasUncommittedWork(), false);
    assert.equal(h.calls.length, 0); assert.equal(h.b.writes + h.c.writes, 0);
});

test('actual view: live local input feedback excludes unselected long sources and updates edits/mode/clear', async () => {
    const sources = [{ id: 'long', label: '<img src=x> synthetic long', text: 'x'.repeat(16001), scope: 'library' }];
    const h = await model(undefined, { sources });
    const budget = h.host.querySelector('.ai-context-budget'), row = h.host.querySelector('.ai-context-source');
    const usage = row.querySelector('.ai-context-source-budget'), excerpt = row.querySelector('textarea'), check = row.querySelector('input');
    assert.match(budget.textContent, /Selected excerpts: 0 \/ 12/); assert.equal(usage.hidden, true);
    h.click('Review exact'); await settle(); assert.equal(h.controller.reviewed.packed.sources.length, 0);
    check.checked = true; check.dispatch('change'); assert.equal(h.controller.reviewed, null); assert.equal(h.byText('Send reviewed').disabled, true);
    assert.match(usage.textContent, /16001 \/ 16000 \(Over limit\)/); assert.equal(usage.hidden, false);
    assert.equal(excerpt.value.length, 16001); h.click('Review exact'); await settle(); assert.equal(h.controller.reviewed, null);
    h.input(excerpt, '"'.repeat(16000)); assert.match(usage.textContent, /16000 \/ 16000$/); assert.match(budget.textContent, /32000 \(Over limit\)/);
    h.input(excerpt, '😀'); assert.match(usage.textContent, /2 \/ 16000$/);
    h.click('Review exact'); await settle(); assert.match(budget.textContent, new RegExp(`Complete prompt: ${h.controller.reviewed.packed.prompt.length} / 32000`));
    const prior = budget.textContent, mode = h.host.querySelector('select'); mode.value = 'tasks'; mode.dispatch('change');
    assert.notEqual(prior, budget.textContent); assert.equal(h.controller.reviewed, null);
    h.input(h.host.querySelectorAll('textarea')[0], 'New question');
    const expected = api.inspectInput('New question', [{ ...sources[0], text: '😀' }], 'tasks'); assert.match(budget.textContent, new RegExp(`Complete prompt: ${expected.promptLength} / 32000`));
    check.checked = false; check.dispatch('change'); assert.equal(usage.hidden, true); assert.equal(excerpt.value, '😀');
    h.click('Cancel / clear'); assert.match(budget.textContent, /Selected excerpts: 0 \/ 12/); assert.match(budget.textContent, /Question: 0 \/ 4000/); assert.equal(excerpt.value.length, 16001);
    assert.equal(h.calls.length, 0); assert.equal(h.b.writes + h.c.writes, 0); assert.equal(h.host.querySelectorAll('img').length, 0);
});
test('actual view: selected count and exact two-excerpt total identify oversized and unavailable drafts', async () => {
    const sources = Array.from({ length: 13 }, (_, i) => ({ id: String(i), label: `Synthetic ${i}`, text: 'x'.repeat(16000), scope: 'library' }));
    const h = await model(undefined, { sources }), budget = h.host.querySelector('.ai-context-budget'), rows = h.host.querySelectorAll('.ai-context-source');
    for (const row of rows.slice(0, 2)) { const check = row.querySelector('input'); check.checked = true; check.dispatch('change'); }
    const expected = api.inspectInput('Create tasks', sources.slice(0, 2));
    assert.match(budget.textContent, new RegExp(`Complete prompt: ${expected.promptLength} / 32000 \\(Over limit\\)`));
    for (const row of rows.slice(2)) { const check = row.querySelector('input'); check.checked = true; check.dispatch('change'); }
    assert.match(budget.textContent, /13 \/ 12 \(Over limit\)/); assert.match(budget.textContent, /Not calculated/);
    h.click('Review exact'); await settle(); assert.equal(h.controller.reviewed, null); assert.equal(h.byText('Send reviewed').disabled, true);
    assert.equal(h.calls.length, 0); assert.equal(h.b.writes + h.c.writes, 0);
});

const sourceRows = h => h.host.querySelectorAll('.ai-context-source');
const visibleRows = h => sourceRows(h).filter(row => !row.hidden);
const sourceCount = h => h.host.querySelector('.ai-context-source-count').textContent;
const choose = (row, value = true) => { const check = row.querySelector('input'); check.checked = value; check.dispatch('change'); };
const syntheticSources = count => Array.from({ length: count }, (_, i) => ({
    id: `collection:synthetic-${i}`, label: `Synthetic title ${i}`, text: `Body-only needle ${i}`, scope: 'library'
}));
test('title search covers all 25/201 loaded sources in original order, with literal Chinese/case/HTML matching', async () => {
    for (const count of [25, 201]) {
        const sources = syntheticSources(count);
        sources[0].label = '<img src=x> Alpha 中文';
        sources[count - 1].label = 'ALPHA 中文 final';
        const h = await model(undefined, { populate: false, sources });
        const search = h.field('search'), rows = sourceRows(h);
        assert.equal(visibleRows(h).length, count);
        h.input(search, '  aLpHa 中文  ');
        assert.deepEqual(visibleRows(h), [rows[0], rows[count - 1]]);
        assert.match(sourceCount(h), new RegExp(`Showing: 2 / ${count}.*Selected: 0.*Selected but hidden: 0`));
        h.input(search, '<IMG SRC=X>');
        assert.deepEqual(visibleRows(h), [rows[0]]); assert.equal(h.host.querySelectorAll('img').length, 0);
        for (const value of ['Body-only needle', 'collection:synthetic-', 'Global collection', '.*']) {
            h.input(search, value); assert.equal(visibleRows(h).length, 0);
            assert.equal(h.host.querySelector('.ai-context-source-empty').hidden, false);
        }
        h.input(search, '   '); assert.equal(visibleRows(h).length, count);
        assert.equal(h.host.querySelector('.ai-context-source-empty').hidden, true);
        assert.equal(h.view.hasUncommittedWork(), false); assert.equal(unloadEvent(h).prevented, false);
        h.click('Clear title search'); assert.equal(search.value, '');
        assert.equal(h.document.activeElement, search); assert.equal(h.byText('Clear title search').disabled, true);
        assert.deepEqual(sourceRows(h), rows); assert.equal(h.calls.length, 0); assert.equal(h.b.writes + h.c.writes, 0);
    }
});
test('search is visibility-only: zero controller/storage/permission/network operations, budget and review preserved', async () => {
    const h = await model(undefined, { sources: syntheticSources(25) });
    choose(sourceRows(h)[0]); h.click('Review exact'); await settle();
    const reviewed = h.controller.reviewed, reviewText = h.host.querySelector('.ai-context-review');
    const prior = { budget: h.host.querySelector('.ai-context-budget').textContent, text: reviewText.textContent, generation: h.controller.generation,
        reads: h.b.reads + h.c.reads, writes: h.b.writes + h.c.writes };
    for (const method of ['loadSources', 'inspectInput', 'edit', 'review', 'send', 'allow']) h.controller[method] = () => { throw Error(`Search called ${method}`); };
    h.controller.permissions.request = h.controller.permissions.contains = () => { throw Error('Search checked permission'); };
    h.field('search').focus();
    for (const query of ['not found', 'title 0', '中文', '']) h.input(h.field('search'), query);
    assert.equal(h.controller.reviewed, reviewed); assert.equal(h.controller.generation, prior.generation);
    assert.equal(reviewText.textContent, prior.text); assert.equal(reviewText.hidden, false);
    assert.equal(h.host.querySelector('.ai-context-budget').textContent, prior.budget);
    assert.equal(h.document.activeElement, h.field('search'));
    assert.equal(h.b.reads + h.c.reads, prior.reads); assert.equal(h.b.writes + h.c.writes, prior.writes); assert.equal(h.calls.length, 0);
});
test('hidden selected edits stay in request, budget and saved snapshot; searching leaves result/save choice intact', async () => {
    const h = await model(undefined, { sources: syntheticSources(25) }), row = sourceRows(h)[0], excerpt = row.querySelector('textarea');
    choose(row); h.input(excerpt, 'Edited synthetic source');
    h.input(h.field('search'), 'title 24'); assert.equal(row.hidden, true); assert.equal(excerpt.hidden, false);
    assert.match(sourceCount(h), /Showing: 1 \/ 25.*Selected: 1.*Selected but hidden: 1/);
    assert.match(h.host.querySelector('.ai-context-budget').textContent, /Selected excerpts: 1 \/ 12/);
    assert.equal(h.view.hasUncommittedWork(), true);
    h.setReply('Synthetic answer'); await send(h, 'answer');
    assert.equal(h.controller.reviewed.packed.sources[0].text, 'Edited synthetic source');
    const result = h.controller.result, reviewed = h.controller.reviewed;
    const include = h.host.querySelector('.ai-context-save-context').querySelector('input');
    include.checked = true; include.dispatch('change');
    const snapshot = h.host.querySelector('.ai-context-save-context').querySelector('pre').textContent;
    for (const q of ['', 'no matches']) h.input(h.field('search'), q);
    assert.equal(h.controller.result, result); assert.equal(h.controller.reviewed, reviewed); assert.equal(include.checked, true);
    assert.equal(h.host.querySelector('.ai-context-save-context').querySelector('pre').textContent, snapshot);
    h.click('Save answer');
    for (let i = 0; i < 100 && h.controller.busy; i++) await new Promise(resolve => setTimeout(resolve, 5)); await settle();
    const saved = (await h.controller.collectionStore.read()).records[0];
    assert.match(JSON.stringify(saved), /Edited synthetic source/); assert.equal(h.c.writes, 1);
});
test('hidden selections cannot bypass 13-source limit; real edits invalidate; clear draft resets search and row states', async () => {
    const h = await model(undefined, { sources: syntheticSources(25) }), rows = sourceRows(h);
    for (const row of rows.slice(0, 13)) choose(row);
    h.input(h.field('search'), 'title 24');
    assert.match(sourceCount(h), /Selected: 13.*Selected but hidden: 13/);
    assert.match(h.host.querySelector('.ai-context-budget').textContent, /13 \/ 12 \(Over limit\)/);
    h.click('Review exact'); await settle(); assert.equal(h.controller.reviewed, null); assert.equal(h.byText('Send reviewed').disabled, true);
    choose(rows[12], false); h.click('Review exact'); await settle(); assert(h.controller.reviewed);
    const excerpt = rows[0].querySelector('textarea'); h.input(excerpt, 'Changed while hidden');
    assert.equal(h.controller.reviewed, null); assert.equal(h.view.hasUncommittedWork(), true);
    h.click('Cancel / clear');
    assert.equal(h.field('search').value, ''); assert.equal(visibleRows(h).length, 25);
    assert.equal(excerpt.value, 'Body-only needle 0');
    for (const row of rows) { assert.equal(row.querySelector('input').checked, false); assert.equal(row.querySelector('textarea').hidden, true); }
    assert.equal(h.view.hasUncommittedWork(), false); assert.match(sourceCount(h), /Showing: 25 \/ 25.*Selected: 0.*Selected but hidden: 0/);
    assert.equal(h.calls.length, 0); assert.equal(h.b.writes + h.c.writes, 0);
});
test('unselected edited rows stay dirty across search, and restored visibility preserves exact nodes and selection', async () => {
    const h = await model(undefined, { populate: false, sources: syntheticSources(25) }), row = sourceRows(h)[0];
    choose(row); const excerpt = row.querySelector('textarea'); h.input(excerpt, 'Unsent edit'); choose(row, false);
    h.input(h.field('search'), 'title 24'); assert.equal(row.hidden, true); assert.equal(h.view.hasUncommittedWork(), true);
    h.click('Clear title search'); assert.equal(sourceRows(h)[0], row); assert.equal(row.querySelector('textarea'), excerpt);
    assert.equal(excerpt.value, 'Unsent edit'); assert.equal(excerpt.hidden, true); assert.equal(row.querySelector('input').checked, false);
    h.click('Cancel / clear'); assert.equal(h.view.hasUncommittedWork(), false);
});

test('selected-only view covers 201/0/12 without changing search, order, rows or clean state', async () => {
    const h = await model(undefined, { populate: false, sources: syntheticSources(201) });
    const rows = sourceRows(h), toggle = h.byText('Show selected only');
    assert.equal(toggle.tagName, 'BUTTON'); assert.equal(toggle.type, 'button'); assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    h.click('Show selected only'); assert.equal(toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(visibleRows(h).length, 0); assert.equal(h.host.querySelector('.ai-context-source-empty').hidden, false);
    assert.match(sourceCount(h), /Showing: 0 \/ 201.*Selected: 0.*Selected but hidden: 0/);
    assert.equal(h.view.hasUncommittedWork(), false); assert.equal(unloadEvent(h).prevented, false);
    h.click('Show selected only');
    const selected = [...rows.slice(0, 11), rows[200]]; selected.forEach(row => choose(row));
    h.click('Show selected only'); assert.deepEqual(visibleRows(h), selected);
    assert.match(sourceCount(h), /Showing: 12 \/ 201.*Selected: 12.*Selected but hidden: 0/);
    h.input(h.field('search'), 'title 200'); assert.deepEqual(visibleRows(h), [rows[200]]);
    assert.match(sourceCount(h), /Showing: 1 \/ 201.*Selected: 12.*Selected but hidden: 11/);
    h.click('Show selected only'); assert.equal(h.field('search').value, 'title 200');
    h.click('Show selected only'); h.click('Clear title search');
    assert.equal(toggle.getAttribute('aria-pressed'), 'true'); assert.deepEqual(visibleRows(h), selected);
    assert.deepEqual(sourceRows(h), rows); assert.equal(h.calls.length, 0); assert.equal(h.b.writes + h.c.writes, 0);
});

test('selected-only view never calls controller, reads, writes or permission checks and preserves review and budget', async () => {
    const h = await model(undefined, { sources: syntheticSources(201) });
    sourceRows(h).slice(0, 12).forEach(row => choose(row)); h.click('Review exact'); await settle();
    const reviewed = h.controller.reviewed, preview = h.host.querySelector('.ai-context-review');
    const before = { generation: h.controller.generation, text: preview.textContent, budget: h.host.querySelector('.ai-context-budget').textContent, reads: h.b.reads + h.c.reads, writes: h.b.writes + h.c.writes };
    for (const name of ['readSources', 'loadSources', 'inspectInput', 'edit', 'review', 'send', 'allow']) h.controller[name] = () => { throw Error(`view called ${name}`); };
    h.controller.permissions.request = h.controller.permissions.contains = () => { throw Error('view checked permission'); };
    for (const query of ['title 200', '', 'no match']) { h.input(h.field('search'), query); h.click('Show selected only'); }
    assert.equal(h.controller.reviewed, reviewed); assert.equal(h.controller.generation, before.generation);
    assert.equal(preview.textContent, before.text); assert.equal(preview.hidden, false);
    assert.equal(h.host.querySelector('.ai-context-budget').textContent, before.budget);
    assert.equal(h.b.reads + h.c.reads, before.reads); assert.equal(h.b.writes + h.c.writes, before.writes); assert.equal(h.calls.length, 0);
});

test('deselecting in selected-only view moves focus to next, previous, then toggle despite native hidden blur', async () => {
    const h = await model(undefined, { populate: false, sources: syntheticSources(201), blurUnavailableFocus: true });
    const rows = sourceRows(h), selected = [rows[0], rows[100], rows[200]], toggle = h.byText('Show selected only');
    selected.forEach(row => choose(row)); h.click('Show selected only');
    const middle = rows[100].querySelector('input'); middle.focus(); choose(rows[100], false);
    assert.equal(h.document.activeElement, rows[200].querySelector('input')); assert.equal(rows[100].hidden, true);
    choose(rows[200], false); assert.equal(h.document.activeElement, rows[0].querySelector('input'));
    choose(rows[0], false); assert.equal(h.document.activeElement, toggle); assert.equal(visibleRows(h).length, 0);
    assert.equal(h.view.hasUncommittedWork(), false);
});

test('selected-only preserves hidden edits and dirty guard, 13 sources still block review, and clear resets both filters', async () => {
    const h = await model(undefined, { sources: syntheticSources(201) }), rows = sourceRows(h), excerpt = rows[0].querySelector('textarea');
    rows.slice(0, 13).forEach(row => choose(row)); h.input(excerpt, 'Synthetic hidden edit');
    h.click('Show selected only'); h.input(h.field('search'), 'title 200');
    assert.equal(visibleRows(h).length, 0); assert.match(sourceCount(h), /Selected: 13.*Selected but hidden: 13/);
    assert.match(h.host.querySelector('.ai-context-budget').textContent, /13 \/ 12 \(Over limit\)/);
    h.click('Review exact'); await settle(); assert.equal(h.controller.reviewed, null);
    choose(rows[12], false); h.click('Review exact'); await settle();
    assert.equal(h.controller.reviewed.packed.sources.length, 12); assert.equal(h.controller.reviewed.packed.sources[0].text, 'Synthetic hidden edit');
    rows.slice(0, 12).forEach(row => choose(row, false));
    assert.equal(h.view.hasUncommittedWork(), true); assert.equal(unloadEvent(h).prevented, true);
    h.click('Show selected only'); h.click('Show selected only'); assert.equal(rows[0].querySelector('textarea'), excerpt); assert.equal(excerpt.value, 'Synthetic hidden edit');
    h.click('Cancel / clear'); assert.equal(h.field('search').value, ''); assert.equal(h.byText('Show selected only').getAttribute('aria-pressed'), 'false');
    assert.equal(visibleRows(h).length, 201); assert.equal(excerpt.value, 'Body-only needle 0'); assert.equal(h.view.hasUncommittedWork(), false);
    assert.equal(h.calls.length, 0); assert.equal(h.b.writes + h.c.writes, 0);
});

test('selected-only remains view-only through pending request, answer, and snapshot consent', async () => {
    const h = await model(undefined, { sources: syntheticSources(201) }), rows = sourceRows(h), gate = deferred();
    choose(rows[200]); h.input(rows[200].querySelector('textarea'), 'Edited final synthetic source');
    h.setReply(gate.promise); await send(h, 'answer');
    const reviewed = h.controller.reviewed, generation = h.controller.generation;
    h.click('Show selected only'); h.input(h.field('search'), 'no match');
    assert.equal(rows[200].querySelector('input').disabled, true); assert.equal(Boolean(h.byText('Show selected only').disabled), false);
    assert.equal(h.controller.reviewed, reviewed); assert.equal(h.controller.generation, generation);
    assert.equal(h.calls.length, 1); assert.match(h.calls[0].input.prompt, /Edited final synthetic source/);
    gate.resolve('Synthetic answer'); await settle();
    const result = h.controller.result, section = h.host.querySelector('.ai-context-save-context'), include = section.querySelector('input');
    include.checked = true; include.dispatch('change'); const snapshot = section.querySelector('pre').textContent;
    h.click('Show selected only'); h.click('Show selected only'); h.click('Clear title search');
    assert.deepEqual(visibleRows(h), [rows[200]]); assert.equal(h.controller.result, result); assert.equal(h.controller.reviewed, reviewed);
    assert.equal(include.checked, true); assert.equal(section.querySelector('pre').textContent, snapshot);
    assert.equal(h.host.querySelectorAll('textarea').find(node => node.rows === 8).value, 'Synthetic answer');
    assert.equal(h.calls.length, 1); assert.equal(h.b.writes + h.c.writes, 0);
});

const batchSources = () => Array.from({ length: 25 }, (_, i) => ({ id: `collection:batch-${i}`, label: `${i < 10 ? 'Match' : 'Other'} ${i}`, text: `Synthetic excerpt ${i}`, scope: 'library' }));
const selectedRows = h => sourceRows(h).filter(row => row.querySelector('input').checked);
const batchSelect = h => h.byText('Select visible unselected');
const batchClear = h => h.byText('Clear all selections');
test('batch selection adds all ten visible to two hidden selections, invalidates exactly once, and never performs I/O', async () => {
    const h = await model(undefined, { sources: batchSources(), blurUnavailableFocus: true }), rows = sourceRows(h);
    choose(rows[20]); choose(rows[24]); h.input(h.field('search'), '  mAtCh  '); h.click('Review exact'); await settle();
    const generation = h.controller.generation, reads = h.b.reads + h.c.reads;
    for (const method of ['readSources', 'loadSources', 'review', 'send', 'allow']) h.controller[method] = () => { throw Error(`batch called ${method}`); };
    h.controller.permissions.request = h.controller.permissions.contains = () => { throw Error('batch requested permission'); };
    assert.match(batchSelect(h).textContent, /\(10\)/); batchSelect(h).focus(); h.click('Select visible unselected');
    assert.equal(selectedRows(h).length, 12); assert.deepEqual(selectedRows(h), [...rows.slice(0, 10), rows[20], rows[24]]);
    assert.equal(h.controller.generation, generation + 1); assert.equal(h.controller.reviewed, null);
    assert.equal(h.host.querySelector('.ai-context-review').hidden, true); assert.equal(h.byText('Send reviewed').disabled, true);
    assert.equal(h.document.activeElement, h.byText('Show selected only'));
    assert.match(batchClear(h).textContent, /12; including hidden: 2/);
    batchSelect(h).dispatch('click'); assert.equal(h.controller.generation, generation + 1);
    assert.equal(h.b.reads + h.c.reads, reads); assert.equal(h.b.writes + h.c.writes, 0); assert.equal(h.calls.length, 0);
});
test('over-limit batches are atomic: three hidden plus ten and thirteen visible select nothing, preserve review', async () => {
    for (const hidden of [0, 3]) {
        const sources = hidden ? batchSources() : batchSources().slice(0, 13).map(s => ({ ...s, label: 'Match' }));
        const h = await model(undefined, { sources }), rows = sourceRows(h);
        if (hidden) rows.slice(20, 23).forEach(row => choose(row));
        h.input(h.field('search'), 'Match'); h.click('Review exact'); await settle();
        const reviewed = h.controller.reviewed, generation = h.controller.generation;
        assert.equal(batchSelect(h).disabled, true); assert.match(h.host.querySelector('.ai-context-source-batch-help').textContent, /13 \/ 12.*Nothing will be partially selected/);
        batchSelect(h).dispatch('click'); assert.equal(selectedRows(h).length, hidden);
        assert.equal(h.controller.reviewed, reviewed); assert.equal(h.controller.generation, generation);
    }
});
test('empty/repeated and selected-only batch selection are no-ops preserving exact review', async () => {
    const h = await model(undefined, { sources: batchSources() });
    h.input(h.field('search'), 'no match'); h.click('Review exact'); await settle();
    const reviewed = h.controller.reviewed, generation = h.controller.generation;
    for (let i = 0; i < 2; i++) { batchSelect(h).dispatch('click'); batchClear(h).dispatch('click'); }
    assert.equal(h.controller.reviewed, reviewed); assert.equal(h.controller.generation, generation);
    h.click('Show selected only'); h.click('Clear title search');
    assert.match(batchSelect(h).textContent, /\(0\)/); batchSelect(h).dispatch('click');
    assert.equal(selectedRows(h).length, 0); assert.equal(h.controller.reviewed, reviewed);
});
test('clear all includes hidden selections and preserves draft fields, exact nodes, edits, dirty guard and focus', async () => {
    const h = await model(undefined, { populate: false, sources: batchSources(), blurUnavailableFocus: true }), rows = sourceRows(h);
    choose(rows[0]); choose(rows[24]); const excerpt = rows[24].querySelector('textarea'); h.input(excerpt, 'Edited and kept');
    h.input(h.field('url'), 'https://mock.example/v1/chat/completions'); h.input(h.field('text'), 'mock');
    h.input(h.host.querySelectorAll('textarea')[0], 'Keep my question');
    h.input(answerTitle(h), 'Local title'); h.input(h.field('password'), 'synthetic-only');
    h.input(h.field('search'), 'Match'); h.click('Show selected only'); const generation = h.controller.generation;
    batchClear(h).focus(); h.click('Clear all selections');
    assert.equal(selectedRows(h).length, 0); assert.equal(h.controller.generation, generation + 1);
    assert.equal(h.field('search').value, 'Match'); assert.equal(h.byText('Show selected only').getAttribute('aria-pressed'), 'true');
    assert.equal(visibleRows(h).length, 0); assert.equal(h.document.activeElement, h.byText('Show selected only'));
    assert.deepEqual(sourceRows(h), rows); assert.equal(rows[24].querySelector('textarea'), excerpt); assert.equal(excerpt.value, 'Edited and kept');
    for (const row of rows) assert.equal(row.querySelector('textarea').hidden, true);
    assert.equal(answerTitle(h).value, 'Local title'); assert.equal(h.field('password').value, 'synthetic-only'); assert.equal(h.field('url').value, 'https://mock.example/v1/chat/completions');
    assert.equal(h.view.hasUncommittedWork(), true); assert.equal(unloadEvent(h).prevented, true);
    assert.equal(h.host.querySelectorAll('textarea')[0].value, 'Keep my question');
    h.input(h.host.querySelectorAll('textarea')[0], ''); h.input(answerTitle(h), ''); assert.equal(h.view.hasUncommittedWork(), true);
    const beforeNoop = h.controller.generation; batchClear(h).dispatch('click'); assert.equal(h.controller.generation, beforeNoop);
});
test('controller rejection occurs before batch checkbox mutation and preserves reviewed UI', async () => {
    const h = await model(undefined, { sources: batchSources() }); choose(sourceRows(h)[24]); h.input(h.field('search'), 'Match');
    h.click('Review exact'); await settle(); const reviewed = h.controller.reviewed, preview = h.host.querySelector('.ai-context-review');
    h.controller.edit = () => { throw api.fault('BUSY'); };
    batchSelect(h).dispatch('click'); batchClear(h).dispatch('click');
    assert.equal(selectedRows(h).length, 1); assert.equal(sourceRows(h)[0].querySelector('textarea').hidden, true);
    assert.equal(h.controller.reviewed, reviewed); assert.equal(preview.hidden, false);
});
test('busy, task retry and save retry disable both batch actions and handler rechecks without an intervening render', async () => {
    for (const property of ['busy', 'taskCommand', 'saveCommand']) {
        const h = await model(undefined, { sources: batchSources() }); choose(sourceRows(h)[24]); h.input(h.field('search'), 'Match');
        const generation = h.controller.generation; h.controller[property] = true;
        batchSelect(h).dispatch('click'); batchClear(h).dispatch('click'); assert.equal(selectedRows(h).length, 1);
        h.input(h.field('search'), 'Match'); assert.equal(batchSelect(h).disabled, true); assert.equal(batchClear(h).disabled, true);
        assert.equal(h.controller.generation, generation); h.controller[property] = false;
        h.input(h.field('search'), 'Match'); assert.equal(batchSelect(h).disabled, false); assert.equal(batchClear(h).disabled, false);
    }
});
test('pending review, preset write and disposed panel reject direct batch events', async () => {
    const h = await model(undefined, { sources: batchSources() }); choose(sourceRows(h)[24]); h.input(h.field('search'), 'Match');
    const gate = deferred(); h.controller.ensureActive = () => gate.promise;
    h.click('Review exact'); const generation = h.controller.generation;
    assert.equal(h.controller.busy, false); assert.equal(batchSelect(h).disabled, true); assert.equal(batchClear(h).disabled, true);
    batchSelect(h).dispatch('click'); batchClear(h).dispatch('click'); assert.equal(selectedRows(h).length, 1); assert.equal(h.controller.generation, generation);
    gate.resolve(); await settle();
    const presetGate = deferred(), p = await model({ read: async () => ({ records: [] }), save: () => presetGate.promise }, { sources: batchSources() });
    choose(sourceRows(p)[24]); p.input(p.field('search'), 'Match'); p.click('Save connection preset'); const pg = p.controller.generation;
    assert.equal(batchSelect(p).disabled, true); assert.equal(batchClear(p).disabled, true);
    batchSelect(p).dispatch('click'); batchClear(p).dispatch('click'); assert.equal(selectedRows(p).length, 1); assert.equal(p.controller.generation, pg);
    presetGate.resolve({ records: [] }); await settle();
    const select = batchSelect(p), clear = batchClear(p), rows = sourceRows(p); p.view.destroy(); const dg = p.controller.generation;
    assert.equal(select.disabled, true); assert.equal(clear.disabled, true);
    select.dispatch('click'); clear.dispatch('click'); assert.equal(rows.filter(row => row.querySelector('input').checked).length, 1); assert.equal(p.controller.generation, dg);
});
test('batch selection does not waive excerpt or serialized prompt limits', async () => {
    for (const lengths of [[16001], [16000, 16000]]) {
        const h = await model(undefined, { sources: lengths.map((length, i) => ({ id: `collection:limit-${i}`, label: `Limit ${i}`, text: 'x'.repeat(length), scope: 'library' })) });
        h.click('Select visible unselected'); assert.equal(selectedRows(h).length, lengths.length);
        h.click('Review exact'); await settle(); assert.equal(h.controller.reviewed, null); assert.equal(h.byText('Send reviewed').disabled, true);
        assert.equal(h.calls.length, 0); assert.equal(h.b.writes + h.c.writes, 0);
    }
});

const restoreButton = row => row.querySelector('.ai-context-source-restore');
test('individual restore uses the opening baseline, preserves all other draft fields and invalidates exactly once without I/O', async () => {
    const sources = batchSources(), h = await model(undefined, { sources, blurUnavailableFocus: true }), rows = sourceRows(h);
    choose(rows[0]); choose(rows[24]);
    const excerpt = rows[0].querySelector('textarea'), other = rows[24].querySelector('textarea');
    h.input(excerpt, 'Changed first'); h.input(other, 'Keep other edited excerpt');
    h.input(answerTitle(h), 'Keep answer title'); h.input(h.field('password'), 'synthetic-key');
    h.input(h.field('search'), 'Match'); h.click('Show selected only');
    h.setReply('Synthetic answer'); await send(h, 'answer'); h.input(h.field('password'), 'synthetic-key');
    const include = h.host.querySelector('.ai-context-save-context').querySelector('input'); include.checked = true; include.dispatch('change');
    const before = { generation: h.controller.generation, reads: h.b.reads + h.c.reads, question: h.host.querySelector('textarea').value, url: h.field('url').value, model: h.field('text').value };
    for (const method of ['readSources', 'loadSources', 'review', 'send', 'allow']) h.controller[method] = () => { throw Error(`restore called ${method}`); };
    h.controller.permissions.request = h.controller.permissions.contains = () => { throw Error('restore requested permission'); };
    sources[0].text = 'Later underlying source change';
    restoreButton(rows[0]).focus(); restoreButton(rows[0]).dispatch('click');
    assert.equal(excerpt.value, 'Synthetic excerpt 0'); assert.equal(sources[0].text, 'Later underlying source change');
    assert.equal(other.value, 'Keep other edited excerpt'); assert.deepEqual(selectedRows(h), [rows[0], rows[24]]);
    assert.equal(h.field('search').value, 'Match'); assert.equal(h.byText('Show selected only').getAttribute('aria-pressed'), 'true'); assert.equal(rows[24].hidden, true);
    assert.equal(h.host.querySelector('textarea').value, before.question); assert.equal(answerTitle(h).value, 'Keep answer title');
    assert.equal(h.field('url').value, before.url); assert.equal(h.field('text').value, before.model); assert.equal(h.field('password').value, 'synthetic-key');
    assert.equal(h.controller.generation, before.generation + 1); assert.equal(h.controller.reviewed, null); assert.equal(h.controller.result, null);
    assert.equal(include.checked, false); assert.equal(h.host.querySelector('.ai-context-review').hidden, true); assert.equal(h.byText('Send reviewed').disabled, true);
    assert.equal(h.document.activeElement, excerpt); assert.equal(restoreButton(rows[0]).disabled, true);
    restoreButton(rows[0]).dispatch('click'); assert.equal(h.controller.generation, before.generation + 1);
    assert.equal(h.b.reads + h.c.reads, before.reads); assert.equal(h.b.writes + h.c.writes, 0); assert.equal(h.calls.length, 1);
});
test('restore is selected-only, title filtering preserves its state and hidden handlers are no-ops', async () => {
    const h = await model(undefined, { sources: batchSources() }), row = sourceRows(h)[0], restore = restoreButton(row), excerpt = row.querySelector('textarea');
    assert.equal(restore.hidden, true); assert.equal(restore.disabled, true);
    choose(row); assert.equal(restore.hidden, false); assert.equal(restore.disabled, true);
    h.input(excerpt, 'Edited'); assert.equal(restore.disabled, false);
    h.click('Review exact'); await settle(); const reviewed = h.controller.reviewed, generation = h.controller.generation;
    h.input(h.field('search'), 'no match'); restore.dispatch('click');
    assert.equal(row.hidden, true); assert.equal(excerpt.value, 'Edited'); assert.equal(h.controller.reviewed, reviewed); assert.equal(h.controller.generation, generation);
    h.click('Clear title search'); assert.equal(restoreButton(row), restore); assert.equal(restore.disabled, false);
    restore.dispatch('click'); assert.equal(excerpt.value, 'Synthetic excerpt 0');
    h.input(h.field('search'), 'no match'); h.click('Clear title search'); assert.equal(restore.disabled, true);
    h.input(excerpt, 'Changed again'); choose(row, false); assert.equal(restore.hidden, true); assert.equal(restore.disabled, true);
    const g = h.controller.generation; restore.dispatch('click'); assert.equal(excerpt.value, 'Changed again'); assert.equal(h.controller.generation, g);
});
test('restore returns excerpt dirtiness to baseline, retaining dirty selection or other edits until explicitly cleared', async () => {
    const h = await model(undefined, { populate: false, sources: batchSources() }), rows = sourceRows(h), excerpt = rows[0].querySelector('textarea');
    choose(rows[0]); h.input(excerpt, 'Edit'); restoreButton(rows[0]).dispatch('click');
    assert.equal(h.view.hasUncommittedWork(), true); choose(rows[0], false); assert.equal(h.view.hasUncommittedWork(), false); assert.equal(unloadEvent(h).prevented, false);
    choose(rows[0]); choose(rows[1]); h.input(excerpt, 'Edit'); h.input(rows[1].querySelector('textarea'), 'Other edit');
    restoreButton(rows[0]).dispatch('click'); choose(rows[0], false); choose(rows[1], false);
    assert.equal(h.view.hasUncommittedWork(), true); assert.equal(unloadEvent(h).prevented, true);
    choose(rows[1]); restoreButton(rows[1]).dispatch('click'); choose(rows[1], false); assert.equal(h.view.hasUncommittedWork(), false);
});
test('untouched or repeatedly restored excerpts do not invalidate the review or perform reads and writes', async () => {
    const h = await model(), row = sourceRows(h)[0]; choose(row); h.click('Review exact'); await settle();
    const review = h.controller.reviewed, generation = h.controller.generation, reads = h.b.reads + h.c.reads;
    h.controller.edit = () => { throw Error('No-op must not edit'); };
    restoreButton(row).dispatch('click'); restoreButton(row).dispatch('click');
    assert.equal(h.controller.reviewed, review); assert.equal(h.controller.generation, generation);
    assert.equal(h.b.reads + h.c.reads, reads); assert.equal(h.b.writes + h.c.writes, 0); assert.equal(h.calls.length, 0);
});
test('restoring a 32000-character opening excerpt never truncates it or bypasses the review limit', async () => {
    const original = 'x'.repeat(32000), h = await model(undefined, { sources: [{ id: 'collection:large', label: 'Large excerpt', text: original, scope: 'library' }] });
    const row = sourceRows(h)[0], excerpt = row.querySelector('textarea'); choose(row); h.input(excerpt, 'Shortened valid excerpt');
    h.click('Review exact'); await settle(); assert(h.controller.reviewed);
    restoreButton(row).dispatch('click'); assert.equal(excerpt.value, original); assert.equal(excerpt.maxLength, 16000);
    assert.match(row.querySelector('.ai-context-source-budget').textContent, /32000 \/ 16000 \(Over limit\)/);
    h.click('Review exact'); await settle(); assert.equal(h.controller.reviewed, null); assert.equal(h.byText('Send reviewed').disabled, true);
    assert.equal(h.b.writes + h.c.writes, 0); assert.equal(h.calls.length, 0);
});
test('restore authorizes controller edit before changing the editor, selection or review display', async () => {
    const h = await model(), row = sourceRows(h)[0], excerpt = row.querySelector('textarea'); choose(row); h.input(excerpt, 'Edited');
    h.click('Review exact'); await settle(); const reviewed = h.controller.reviewed;
    h.controller.edit = () => { throw api.fault('BUSY'); }; restoreButton(row).dispatch('click');
    assert.equal(excerpt.value, 'Edited'); assert.equal(row.querySelector('input').checked, true); assert.equal(h.controller.reviewed, reviewed);
    assert.equal(h.host.querySelector('.ai-context-review').hidden, false);
});
test('restore UI and handler reject busy, task retry and save retry, including stale enabled buttons', async () => {
    for (const property of ['busy', 'taskCommand', 'saveCommand']) {
        const h = await model(), row = sourceRows(h)[0], excerpt = row.querySelector('textarea'); choose(row); h.input(excerpt, 'Edited');
        const generation = h.controller.generation; h.controller[property] = true;
        restoreButton(row).dispatch('click'); assert.equal(excerpt.value, 'Edited'); assert.equal(h.controller.generation, generation);
        h.input(h.field('search'), ''); assert.equal(restoreButton(row).disabled, true);
        h.controller[property] = false; h.input(h.field('search'), ''); assert.equal(restoreButton(row).disabled, false);
    }
});
test('pending review, preset persistence and disposal disable restoration and prevent direct event mutations', async () => {
    const h = await model(), row = sourceRows(h)[0], excerpt = row.querySelector('textarea'); choose(row); h.input(excerpt, 'Edited');
    const gate = deferred(); h.controller.ensureActive = () => gate.promise; h.click('Review exact'); const generation = h.controller.generation;
    assert.equal(h.controller.busy, false); assert.equal(restoreButton(row).disabled, true); restoreButton(row).dispatch('click');
    assert.equal(excerpt.value, 'Edited'); assert.equal(h.controller.generation, generation); gate.resolve(); await settle();
    const presetGate = deferred(), p = await model({ read: async () => ({ records: [] }), save: () => presetGate.promise });
    const pr = sourceRows(p)[0], pe = pr.querySelector('textarea'); choose(pr); p.input(pe, 'Preset pending edit'); p.click('Save connection preset'); const pg = p.controller.generation;
    assert.equal(restoreButton(pr).disabled, true); restoreButton(pr).dispatch('click'); assert.equal(pe.value, 'Preset pending edit'); assert.equal(p.controller.generation, pg);
    presetGate.resolve({ records: [] }); await settle(); const restore = restoreButton(pr); p.view.destroy(); const dg = p.controller.generation;
    assert.equal(restore.disabled, true); restore.dispatch('click'); assert.equal(pe.value, 'Preset pending edit'); assert.equal(p.controller.generation, dg);
});
