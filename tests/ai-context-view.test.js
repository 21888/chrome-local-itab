const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { webcrypto } = require('node:crypto'); global.crypto ||= webcrypto;
const { createDocument, deferred } = require('./helpers/task-dom-model');
const api = require('../shared/ai-context'), Tasks = require('../shared/local-tasks-store'), Collections = require('../shared/local-ai-collections-store');
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
function backend() { let raw; return { reads: 0, writes: 0, lock: fn => fn(), async read() { this.reads++; return structuredClone(raw); }, async write(value) { this.writes++; raw = structuredClone(value); }, subscribe: () => () => {} }; }
async function model(presetStore, { populate = true, sources, blurUnavailableFocus = false, clipboard, t, frames, safeReader = false } = {}) {
    const document = createDocument({ blurUnavailableFocus }), host = document.createElement('main'); document.body.append(host);
    const confirmations = []; let confirmResult = true;
    const events = new Map(), window = { document, confirm: message => { confirmations.push(message); return confirmResult; }, addEventListener: (type, fn) => events.set(type, fn), removeEventListener: type => events.delete(type) };
    if (frames) { window.requestAnimationFrame = frames.request; window.cancelAnimationFrame = frames.cancel; }
    const b = backend(), c = backend(), calls = []; let active = true; let reply = '{"tasks":["<b>literal</b>","same","same"]}';
    const transport = { review: input => ({ ...input, origin: 'https://mock.example', permission: 'https://mock.example:443/*' }), run: async (input, options) => { calls.push({ input, options }); return { text: await reply }; } };
    const controller = new api.Controller({ transport, permissions: { request: async () => true, contains: async () => true }, ensureActive: async () => { if (!active) throw api.fault('WORKSPACE_INVALIDATED'); },
        readSources: async () => typeof sources === 'function' ? sources() : sources || [{ id: 'collection:synthetic', label: '<img src=x>', text: 'synthetic saved text', scope: 'library' }], taskStore: new Tasks.Store(b), collectionStore: new Collections.Store(c) });
    // The DOM model executes UI in a VM; real UI/controller share one realm.
    const review = controller.review.bind(controller);
    controller.review = input => review(JSON.parse(JSON.stringify(input)));
    let readerParses = 0;
    if (safeReader) { const Marked = require('../vendor/marked/marked.umd.js'); window.marked = { Lexer: class extends Marked.Lexer { lex(source) { readerParses++; return super.lex(source); } } }; vm.runInNewContext(fs.readFileSync('shared/safe-answer-reader.js', 'utf8'), { window }); }
    vm.runInNewContext(fs.readFileSync('shared/ai-context-view.js', 'utf8'), { window });
    const view = window.LocalItabAIContextView.mount(host, { controller, presetStore, clipboard, t }); await view.ready;
    const field = type => host.querySelectorAll('input').find(node => node.type === type);
    const byText = text => host.querySelectorAll('button').find(node => node.textContent.startsWith(text));
    const click = text => { const node = byText(text); assert(node); assert.equal(Boolean(node.disabled), false, `${text} enabled`); node.dispatch('click'); return node; };
    const input = (node, value) => { node.value = value; node.dispatch('input'); };
    if (populate) {
        input(field('url'), 'https://mock.example/v1/chat/completions'); input(field('text'), 'mock');
        const question = host.querySelector('.ai-context-question'); input(question, 'Create tasks');
    }
    return { get readerParses() { return readerParses; }, confirmations, setConfirm: value => { confirmResult = value; }, host, document, controller, b, c, calls, view, events, click, field, input, byText, deactivate: () => { active = false; }, setReply: value => { reply = value; } };
}
async function send(h, mode = 'tasks') {
    const select = h.host.querySelector('.ai-context-mode'); select.value = mode; select.dispatch('change'); h.click('Review exact'); await settle(); h.click('Send reviewed'); await settle();
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

test('editing a reviewed request preserves the old answer snapshot and consent', async () => {
    const h = await model(); h.setReply('Synthetic answer'); await send(h, 'answer');
    const section = h.host.querySelector('.ai-context-save-context'), option = section.querySelector('input');
    option.checked = true; option.dispatch('change');
    h.input(h.field('url'), 'https://other.example/v1/chat/completions');
    assert.equal(option.checked, true); assert.equal(section.hidden, false); assert.equal(JSON.parse(section.querySelector('pre').textContent).endpoint, 'https://mock.example/v1/chat/completions');
    assert.equal(h.c.writes, 0);
});


const answerTitle = h => h.host.querySelectorAll('input').find(node => node.maxLength === 200);
const questionField = h => h.host.querySelector('.ai-context-question');
test('answer title defaults to the exact reviewed question, truncates safely, and refreshes for a new request', async () => {
    const h = await model(); h.setReply('Synthetic answer');
    h.input(questionField(h), 'a'.repeat(199) + '😀 end');
    await send(h, 'answer'); assert.equal(answerTitle(h).value, 'a'.repeat(199));
    h.input(questionField(h), 'Second question'); assert.equal(answerTitle(h).value, 'a'.repeat(199));
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
        h.host.querySelector('.ai-context-mode').value = 'answer'; h.host.querySelector('.ai-context-mode').dispatch('change');
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
        const overlay = document.querySelector('.ai-context-overlay'), question = overlay.querySelector('.ai-context-question');
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
        const fresh = document.querySelector('.ai-context-overlay'); assert.equal(fresh.querySelector('.ai-context-question').value, '');
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
    const prior = budget.textContent, mode = h.host.querySelector('.ai-context-mode'); mode.value = 'tasks'; mode.dispatch('change');
    assert.notEqual(prior, budget.textContent); assert.equal(h.controller.reviewed, null);
    h.input(h.host.querySelector('.ai-context-question'), 'New question');
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
    choose(row); const excerpt = row.querySelector('textarea'); h.input(excerpt, 'Unsent edit'); row.querySelector('input').checked = false; row.querySelector('input').dispatch('change');
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
    h.input(h.host.querySelector('.ai-context-question'), 'Keep my question');
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
    assert.equal(h.host.querySelector('.ai-context-question').value, 'Keep my question');
    h.input(h.host.querySelector('.ai-context-question'), ''); h.input(answerTitle(h), ''); assert.equal(h.view.hasUncommittedWork(), true);
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
    const before = { generation: h.controller.generation, reads: h.b.reads + h.c.reads, question: h.host.querySelector('.ai-context-question').value, url: h.field('url').value, model: h.field('text').value };
    for (const method of ['readSources', 'loadSources', 'review', 'send', 'allow']) h.controller[method] = () => { throw Error(`restore called ${method}`); };
    h.controller.permissions.request = h.controller.permissions.contains = () => { throw Error('restore requested permission'); };
    sources[0].text = 'Later underlying source change';
    restoreButton(rows[0]).focus(); restoreButton(rows[0]).dispatch('click');
    assert.equal(excerpt.value, 'Synthetic excerpt 0'); assert.equal(sources[0].text, 'Later underlying source change');
    assert.equal(other.value, 'Keep other edited excerpt'); assert.deepEqual(selectedRows(h), [rows[0], rows[24]]);
    assert.equal(h.field('search').value, 'Match'); assert.equal(h.byText('Show selected only').getAttribute('aria-pressed'), 'true'); assert.equal(rows[24].hidden, true);
    assert.equal(h.host.querySelector('.ai-context-question').value, before.question); assert.equal(answerTitle(h).value, 'Keep answer title');
    assert.equal(h.field('url').value, before.url); assert.equal(h.field('text').value, before.model); assert.equal(h.field('password').value, 'synthetic-key');
    assert.equal(h.controller.generation, before.generation + 1); assert.equal(h.controller.reviewed, null); assert.equal(h.controller.result.text, 'Synthetic answer');
    assert.equal(include.checked, true); assert.equal(h.host.querySelector('.ai-context-review').hidden, true); assert.equal(h.byText('Send reviewed').disabled, true);
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
    h.input(excerpt, 'Changed again'); row.querySelector('input').checked = false; row.querySelector('input').dispatch('change'); assert.equal(restore.hidden, true); assert.equal(restore.disabled, true);
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

const scopeFilter = h => h.host.querySelector('.ai-context-source-scope');
function setScope(h, value) { const select = scopeFilter(h); select.value = value; select.dispatch('change'); }
function mixedSources(count) { const sources = syntheticSources(count); sources[count - 1] = { id: 'scratchpad:current', label: 'Synthetic current workspace note', text: 'Synthetic saved workspace note', scope: 'workspace' }; return sources; }
test('scope filter uses actual library/workspace scopes across 25/201 sources and ANDs title and selected-only filters', async () => {
    for (const count of [25, 201]) {
        const h = await model(undefined, { populate: false, sources: mixedSources(count) }), rows = sourceRows(h), scope = scopeFilter(h);
        assert.equal(scope.tagName, 'SELECT'); assert.equal(scope.parentElement.tagName, 'LABEL');
        assert.deepEqual(scope.querySelectorAll('option').map(option => option.value), ['all', 'workspace', 'library']);
        assert.equal(scope.getAttribute('aria-describedby'), 'ai-context-source-scope-help');
        scope.focus(); setScope(h, 'workspace'); assert.equal(h.document.activeElement, scope);
        assert.deepEqual(visibleRows(h), [rows[count - 1]]);
        assert.equal(h.view.hasUncommittedWork(), false); assert.equal(unloadEvent(h).prevented, false);
        h.input(h.field('search'), 'TITLE'); assert.equal(visibleRows(h).length, 0);
        h.click('Clear title search'); assert.equal(scope.value, 'workspace'); assert.deepEqual(visibleRows(h), [rows[count - 1]]);
        h.click('Show selected only'); assert.equal(visibleRows(h).length, 0);
        choose(rows[count - 1]); choose(rows[0]); assert.deepEqual(visibleRows(h), [rows[count - 1]]);
        setScope(h, 'library'); assert.deepEqual(visibleRows(h), [rows[0]]);
        assert.match(sourceCount(h), /Selected: 2.*Selected but hidden: 1/);
        h.click('Show selected only'); assert.deepEqual(visibleRows(h), rows.slice(0, -1));
        setScope(h, 'all'); assert.deepEqual(visibleRows(h), rows); assert.deepEqual(sourceRows(h), rows);
        assert.equal(h.calls.length, 0); assert.equal(h.b.writes + h.c.writes, 0);
    }
});
test('scope with zero workspace notes has a truthful empty state and never loads more sources', async () => {
    const h = await model(undefined, { populate: false, sources: syntheticSources(25) });
    h.controller.loadSources = h.controller.readSources = () => { throw Error('Must not reload'); };
    setScope(h, 'workspace'); assert.equal(visibleRows(h).length, 0);
    const empty = h.host.querySelector('.ai-context-source-empty'); assert.equal(empty.hidden, false); assert.match(empty.textContent, /Change the scope/);
    assert.match(sourceCount(h), /Showing: 0 \/ 25/); assert.equal(h.view.hasUncommittedWork(), false);
    setScope(h, 'library'); assert.equal(visibleRows(h).length, 25); assert.equal(empty.hidden, true);
});
test('scope-only changes preserve hidden edited excerpts, review, budget and result with zero controller or storage operations', async () => {
    const h = await model(undefined, { sources: mixedSources(25) }), rows = sourceRows(h);
    choose(rows[0]); h.input(rows[0].querySelector('textarea'), 'Synthetic edited outgoing excerpt');
    setScope(h, 'workspace'); h.setReply('Synthetic result'); await send(h, 'answer');
    assert.equal(h.controller.reviewed.packed.sources[0].text, 'Synthetic edited outgoing excerpt');
    const include = h.host.querySelector('.ai-context-save-context').querySelector('input'); include.checked = true; include.dispatch('change');
    const reviewed = h.controller.reviewed, result = h.controller.result;
    const prior = { generation: h.controller.generation, budget: h.host.querySelector('.ai-context-budget').textContent, review: h.host.querySelector('.ai-context-review').textContent, snapshot: h.host.querySelector('.ai-context-save-context').querySelector('pre').textContent, reads: h.b.reads + h.c.reads, writes: h.b.writes + h.c.writes, calls: h.calls.length };
    for (const method of ['loadSources', 'readSources', 'inspectInput', 'edit', 'review', 'send', 'allow']) h.controller[method] = () => { throw Error(`Scope called ${method}`); };
    h.controller.permissions.request = h.controller.permissions.contains = () => { throw Error('Scope checked permission'); };
    for (const scope of ['all', 'library', 'workspace']) setScope(h, scope);
    assert.equal(h.controller.reviewed, reviewed); assert.equal(h.controller.result, result); assert.equal(h.controller.generation, prior.generation);
    assert.equal(h.host.querySelector('.ai-context-budget').textContent, prior.budget); assert.equal(h.host.querySelector('.ai-context-review').textContent, prior.review);
    assert.equal(include.checked, true); assert.equal(h.host.querySelector('.ai-context-save-context').querySelector('pre').textContent, prior.snapshot);
    assert.equal(rows[0].hidden, true); assert.equal(rows[0].querySelector('textarea').value, 'Synthetic edited outgoing excerpt');
    assert.match(sourceCount(h), /Selected: 1.*Selected but hidden: 1/);
    assert.equal(h.b.reads + h.c.reads, prior.reads); assert.equal(h.b.writes + h.c.writes, prior.writes); assert.equal(h.calls.length, prior.calls);
});
test('scope batch selection honors all hidden selections and 12 total, clear draft resets scope while clear search does not', async () => {
    const h = await model(undefined, { sources: mixedSources(201) }), rows = sourceRows(h);
    rows.slice(0, 12).forEach(row => choose(row)); setScope(h, 'workspace');
    assert.match(h.byText('Select visible').textContent, /\(1\)/); assert.equal(h.byText('Select visible').disabled, true);
    h.byText('Select visible').dispatch('click'); assert.equal(rows[200].querySelector('input').checked, false);
    choose(rows[11], false); h.click('Select visible'); assert.equal(rows[200].querySelector('input').checked, true);
    assert.match(sourceCount(h), /Selected: 12.*Selected but hidden: 11/);
    assert.match(h.byText('Clear all selections').textContent, /including hidden: 11/);
    h.input(rows[0].querySelector('textarea'), 'Synthetic hidden edit');
    h.click('Clear all selections'); assert.equal(scopeFilter(h).value, 'workspace'); assert.equal(h.view.hasUncommittedWork(), true);
    h.click('Show selected only'); h.input(h.field('search'), 'note'); h.click('Clear title search'); assert.equal(scopeFilter(h).value, 'workspace');
    h.click('Cancel / clear'); assert.equal(scopeFilter(h).value, 'all'); assert.equal(visibleRows(h).length, 201);
    assert.equal(h.byText('Show selected only').getAttribute('aria-pressed'), 'false'); assert.equal(h.view.hasUncommittedWork(), false);
    assert.equal(rows[0].querySelector('textarea').value, 'Body-only needle 0');
});
test('scope remains keyboard-reachable during pending transport without reads, writes, selections or review changes', async () => {
    const h = await model(undefined, { sources: mixedSources(25), blurUnavailableFocus: true });
    choose(sourceRows(h)[0]); h.click('Review exact'); await settle();
    const pending = deferred(); h.setReply(pending.promise); h.click('Send reviewed'); await settle();
    const reviewed = h.controller.reviewed, scope = scopeFilter(h), reads = h.b.reads + h.c.reads;
    assert.equal(h.controller.busy, true); assert.equal(Boolean(scope.disabled), false);
    scope.focus(); setScope(h, 'workspace'); assert.equal(h.document.activeElement, scope);
    assert.equal(h.controller.reviewed, reviewed); assert.equal(h.byText('Select visible').disabled, true);
    h.byText('Select visible').dispatch('click'); assert.equal(sourceRows(h)[24].querySelector('input').checked, false);
    assert.equal(h.b.reads + h.c.reads, reads); assert.equal(h.b.writes + h.c.writes, 0); assert.equal(h.calls.length, 1);
    pending.resolve('Synthetic answer'); await settle(); assert.equal(h.controller.result.text, 'Synthetic answer');
    assert.equal(scope.value, 'workspace'); assert.equal(h.controller.reviewed, reviewed);
});

test('all request editing entries retain visible saveable answer and original context without confirmation or I/O', async () => {
    const edits = {
        question: h => h.input(questionField(h), 'Next question'),
        endpoint: h => h.input(h.field('url'), 'https://next.example/v1/chat/completions'),
        model: h => h.input(h.field('text'), 'next-model'),
        mode: h => { h.host.querySelector('.ai-context-mode').value = 'tasks'; h.host.querySelector('.ai-context-mode').dispatch('change'); },
        select: h => choose(sourceRows(h)[0], false),
        excerpt: h => h.input(sourceRows(h)[0].querySelector('textarea'), 'Next excerpt'),
        restore: h => restoreButton(sourceRows(h)[0]).dispatch('click'),
        batchAdd: h => h.click('Select visible unselected'),
        batchClear: h => h.click('Clear all selections'),
        presetSelect: h => { h.view.presetSelect.value = '0'; h.view.presetSelect.dispatch('change'); }
    };
    for (const [name, edit] of Object.entries(edits)) {
        const h = await model({ read: async () => ({ records: [{ name: 'Other', url: 'https://next.example/v1/chat/completions', model: 'next' }] }) }, { sources: syntheticSources(2) });
        choose(sourceRows(h)[0]); h.input(sourceRows(h)[0].querySelector('textarea'), 'Original edited excerpt');
        h.setReply('Original answer'); await send(h, 'answer');
        const original = h.controller.result, snapshot = h.controller.answerSnapshot(), title = answerTitle(h).value;
        const section = h.host.querySelector('.ai-context-save-context'), include = section.querySelector('input'); include.checked = true; include.dispatch('change');
        edit(h); await settle();
        assert.equal(h.controller.result, original, name); assert.deepEqual(h.controller.answerSnapshot(), snapshot, name);
        assert.equal(h.controller.reviewed, null, name); assert.equal(h.byText('Save answer').disabled, false, name);
        assert.equal(h.host.querySelectorAll('textarea').find(node => node.rows === 8).parentElement.hidden, false, name);
        assert.equal(h.host.querySelector('.ai-context-previous-result').hidden, false, name);
        assert.equal(answerTitle(h).value, title, name); assert.equal(include.checked, true, name);
        assert.deepEqual(JSON.parse(section.querySelector('pre').textContent), snapshot, name);
        assert.equal(h.confirmations.length, 0, name); assert.equal(h.calls.length, 1, name); assert.equal(h.b.writes + h.c.writes, 0, name);
        assert.equal(unloadEvent(h).prevented, true, name); h.view.destroy();
    }
});

test('declining clear or replacement preserves every result, review, title, snapshot consent and key; accepted stop keeps original', async () => {
    const h = await model(); h.setReply('Old answer'); await send(h, 'answer');
    const section = h.host.querySelector('.ai-context-save-context'), include = section.querySelector('input'); include.checked = true; include.dispatch('change');
    h.input(questionField(h), 'New question'); h.click('Review exact'); await settle(); h.input(h.field('password'), 'SYNTHETIC_KEY');
    const original = h.controller.result, reviewed = h.controller.reviewed, generation = h.controller.generation, snapshot = h.controller.answerSnapshot(), title = answerTitle(h).value;
    h.setConfirm(false);
    for (const action of ['Cancel / clear', 'Send reviewed']) {
        h.click(action); await settle();
        assert.equal(h.controller.result, original); assert.equal(h.controller.reviewed, reviewed); assert.equal(h.controller.generation, generation);
        assert.equal(include.checked, true); assert.equal(answerTitle(h).value, title); assert.equal(h.field('password').value, 'SYNTHETIC_KEY');
        assert.equal(questionField(h).value, 'New question'); assert.deepEqual(h.controller.answerSnapshot(), snapshot); assert.equal(h.calls.length, 1);
    }
    const gate = deferred(); h.setReply(gate.promise); h.setConfirm(true); h.click('Send reviewed'); await settle(); h.click('Stop request'); await settle();
    gate.resolve('Late replacement'); await settle(); assert.equal(h.controller.result, original); assert.equal(h.byText('Save answer').disabled, false);
    assert.equal(include.checked, true); assert.equal(answerTitle(h).value, title); assert.deepEqual(h.controller.answerSnapshot(), snapshot);
    h.click('Save answer'); for (let i = 0; i < 100 && h.controller.busy; i++) await new Promise(resolve => setTimeout(resolve, 5)); await settle();
    assert.deepEqual((await h.controller.collectionStore.read()).records[0].contextSnapshot, snapshot);
    const count = h.confirmations.length; h.setReply('New answer'); h.click('Send reviewed'); await settle();
    assert.equal(h.confirmations.length, count); assert.equal(h.controller.saved, false); assert.equal(h.controller.result.text, 'New answer');
    assert.equal(include.checked, false); assert.equal(h.host.querySelector('.ai-context-previous-result').hidden, true); assert.equal(answerTitle(h).value, 'New question');
});

test('old task JSON retains task controls across mode changes and cancelled clear keeps its reviewed batch', async () => {
    const h = await model(); await send(h, 'tasks');
    const select = h.host.querySelector('.ai-context-mode'); select.value = 'answer'; select.dispatch('change');
    assert.equal(h.controller.result.mode, 'tasks'); assert.equal(h.byText('Review extracted').disabled, false); assert.equal(h.byText('Save answer').disabled, true);
    h.click('Review extracted'); await settle(); const review = h.controller.taskReview;
    h.setConfirm(false); h.click('Cancel / clear'); assert.equal(h.controller.taskReview, review); assert.equal(h.byText('Add these').disabled, false);
    h.click('Add these'); await settle(); assert.equal(h.b.writes, 1); assert.equal(h.controller.result, null);
});

test('connection preset save/delete preserve old answer identity and saving an old answer freezes uncertain retry', async () => {
    let records = [{ name: 'Other', url: 'https://next.example/v1/chat/completions', model: 'next' }];
    const store = { read: async () => ({ records }), save: async value => ({ records: (records = [value]) }), remove: async () => ({ records: (records = []) }) };
    const h = await model(store); h.setReply('Original'); await send(h, 'answer');
    const old = h.controller.result, snapshot = h.controller.answerSnapshot();
    h.view.presetSelect.value = '0'; h.view.presetSelect.dispatch('change');
    h.click('Save connection preset'); await settle(); assert.equal(h.controller.result, old);
    h.click('Delete connection preset'); await settle(); assert.equal(h.controller.result, old); assert.deepEqual(h.controller.answerSnapshot(), snapshot);
    const section = h.host.querySelector('.ai-context-save-context'), include = section.querySelector('input'); include.checked = true; include.dispatch('change');
    const write = h.c.write.bind(h.c); h.c.write = async value => { await write(value); throw Error('Uncertain synthetic write'); };
    h.click('Save answer'); for (let i = 0; i < 100 && h.controller.busy; i++) await new Promise(resolve => setTimeout(resolve, 5)); await settle();
    assert.equal(h.controller.saveUncertain, true); const command = h.controller.saveCommand;
    assert.equal(h.byText('Cancel / clear').disabled, true); assert.equal(h.byText('Review exact').disabled, true); assert.equal(h.view.presetSelect.disabled, true);
    assert.equal(h.byText('Save answer').disabled, false); assert.equal(include.disabled, true);
    h.c.write = write; h.click('Save answer'); for (let i = 0; i < 100 && h.controller.busy; i++) await new Promise(resolve => setTimeout(resolve, 5)); await settle();
    assert.equal(h.controller.saved, true); assert.equal(h.controller.saveCommand, null);
    const saved = (await h.controller.collectionStore.read()).records; assert.equal(saved.length, 1); assert.equal(saved[0].title, command.title); assert.deepEqual(saved[0].contextSnapshot, snapshot);
});

test('response copy is explicit, exact and excludes request metadata without altering save/review state', async () => {
    const writes = [], h = await model(undefined, { clipboard: { writeText: async text => writes.push(text) } });
    const copy = h.byText('Copy answer'); assert.equal(copy.disabled, true); copy.dispatch('click'); await settle(); assert.deepEqual(writes, []);
    h.setReply('  Exact <script>literal</script>\nbody  '); await send(h, 'answer');
    const state = { result: h.controller.result, review: h.controller.reviewed, resultReview: h.controller.resultReview, saved: h.controller.saved, dirty: h.view.hasUncommittedWork(), calls: h.calls.length };
    assert.deepEqual(writes, []); h.click('Copy answer'); await settle();
    assert.deepEqual(writes, ['  Exact <script>literal</script>\nbody  ']);
    assert.equal(h.controller.result, state.result); assert.equal(h.controller.reviewed, state.review); assert.equal(h.controller.resultReview, state.resultReview);
    assert.equal(h.controller.saved, state.saved); assert.equal(h.view.hasUncommittedWork(), state.dirty); assert.equal(h.calls.length, state.calls); assert.equal(h.b.writes + h.c.writes, 0);
    assert.match(h.host.querySelector('.ai-context-copy-status').textContent, /Response copied/);
    h.input(h.host.querySelector('.ai-context-question'), 'different draft');
    assert.equal(h.host.querySelector('.ai-context-previous-result').hidden, false);
    h.click('Copy answer'); await settle(); assert.equal(writes.length, 2); assert.equal(h.controller.resultReview, state.resultReview);
    assert.equal(h.host.querySelector('.ai-context-previous-result').hidden, false);
    h.click('Save answer'); for (let i = 0; i < 100 && h.controller.busy; i++) await new Promise(resolve => setTimeout(resolve, 5)); await settle(); assert.equal(h.controller.saved, true); h.click('Copy answer'); await settle(); assert.equal(h.controller.saved, true); assert.equal(h.c.writes, 1);
});
test('task copy uses edited displayed JSON, preserves task review, and disables empty text', async () => {
    const writes = [], h = await model(undefined, { clipboard: { writeText: async text => writes.push(text) } }); await send(h);
    const output = h.host.querySelectorAll('textarea').find(node => node.rows === 8);
    h.input(output, '{"tasks":["edited"]}'); h.click('Review extracted'); await settle(); const reviewed = h.controller.taskReview;
    h.click('Copy task JSON'); await settle(); assert.deepEqual(writes, ['{"tasks":["edited"]}']); assert.equal(h.controller.taskReview, reviewed); assert.equal(h.byText('Add these').disabled, false);
    h.input(output, '   '); assert.equal(h.byText('Copy task JSON').disabled, true); h.byText('Copy task JSON').dispatch('click'); await settle(); assert.equal(writes.length, 1);
    h.click('Cancel / clear'); assert.equal(h.byText('Copy answer').disabled, true);
});
test('clipboard absence and rejection leave selectable output and independent manual-copy feedback', async () => {
    for (const clipboard of [undefined, { async writeText() { throw Error('blocked'); } }]) {
        const h = await model(undefined, { clipboard }); h.setReply('keep me'); await send(h, 'answer');
        const status = h.host.querySelector('.ai-context-status').textContent;
        h.click('Copy answer'); await settle(); assert.match(h.host.querySelector('.ai-context-copy-status').textContent, /Select the response text/);
        assert.equal(h.host.querySelectorAll('textarea').find(node => node.rows === 8).value, 'keep me');
        assert.equal(h.host.querySelector('.ai-context-status').textContent, status); assert.equal(h.byText('Copy answer').disabled, false);
    }
});
test('pending copy ignores repeat clicks and suppresses late feedback after edits, clear or destroy', async () => {
    for (const transition of ['edit', 'clear', 'destroy']) for (const reject of [false, true]) {
        let resolve, rejectCopy; const wait = { promise: new Promise((yes, no) => { resolve = yes; rejectCopy = no; }) }, writes = [], h = await model(undefined, { clipboard: { writeText(text) { writes.push(text); return wait.promise; } } });
        h.setReply('original'); await send(h, 'answer'); const copy = h.click('Copy answer'), feedback = h.host.querySelector('.ai-context-copy-status');
        copy.dispatch('click'); assert.equal(writes.length, 1); assert.equal(copy.disabled, true);
        if (transition === 'edit') h.input(h.host.querySelector('.ai-context-question'), 'new question');
        if (transition === 'clear') h.click('Cancel / clear');
        if (transition === 'destroy') h.view.destroy();
        if (reject) rejectCopy(Error('blocked')); else resolve(); await settle();
        assert.equal(feedback.textContent, ''); assert.equal(h.b.writes + h.c.writes, 0);
        if (transition === 'edit') { assert.equal(copy.disabled, false); assert.equal(h.host.querySelector('.ai-context-previous-result').hidden, false); }
        else assert.equal(copy.disabled, true);
    }
});
test('copy labels and feedback use runtime locale keys without new clipboard permission', async () => {
    for (const locale of ['en', 'zh_CN']) {
        const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));
        const h = await model(undefined, { clipboard: { writeText: async () => {} }, t: (key, fallback) => key.startsWith('aiContextCopy') || key === 'aiContextCopied' ? messages[key].message : fallback });
        h.setReply('synthetic answer'); await send(h, 'answer'); h.byText(messages.aiContextCopyAnswer.message).dispatch('click'); await settle();
        assert.equal(h.host.querySelector('.ai-context-copy-status').textContent, messages.aiContextCopied.message);
        h.view.destroy();
    }
    const manifest = JSON.parse(fs.readFileSync('manifest.json'));
    assert.deepEqual(manifest.permissions, ["storage", "unlimitedStorage", "identity", "contextMenus"]);
    assert(!manifest.permissions.some(value => /clipboard/i.test(value)));
    assert.doesNotMatch(fs.readFileSync('shared/ai-context-view.js', 'utf8'), /clipboard\.read/);
});

async function uncertainView(h) {
    h.setReply('Synthetic complete answer'); await send(h, 'answer');
    const read = h.c.read.bind(h.c); let fail = true;
    h.c.read = async () => { if (fail && h.c.writes) { fail = false; throw Error('synthetic readback failure'); } return read(); };
    h.click('Save answer');
    for (let i = 0; i < 100 && h.controller.busy; i++) await new Promise(resolve => setTimeout(resolve, 5)); await settle();
    assert.equal(h.controller.saveUncertain, true);
    return h.controller.saveCommand;
}
async function idle(h) { for (let i = 0; i < 100 && h.controller.busy; i++) await new Promise(resolve => setTimeout(resolve, 5)); await settle(); }
test('actual UI: explicit read-only receipt check unlocks earlier save after another write and reports only historical success', async () => {
    const h = await model(); assert.equal(h.byText('Check earlier save').hidden, true);
    const command = await uncertainView(h), store = h.controller.collectionStore;
    await store.mutate(store.request('add', { title: 'Concurrent synthetic', body: 'Other answer' }));
    const original = structuredClone(command), writes = h.c.writes, calls = h.calls.length;
    assert.equal(h.byText('Check earlier save').hidden, false); assert.equal(h.byText('Cancel / clear').disabled, true);
    const record = (await store.read()).records[0]; await store.mutate(store.request('remove', { id: record.id, version: record.version }));
    const state = await store.read();
    h.click('Check earlier save'); assert.equal(h.byText('Check earlier save').disabled, true); await idle(h);
    assert.equal(h.controller.saved, true); assert.equal(h.controller.saveCommand, null); assert.equal(h.byText('Check earlier save').hidden, true);
    assert.match(h.host.querySelector('.ai-context-status').textContent, /confirmed from its receipt.*does not guarantee.*still present/);
    assert.equal(h.byText('Cancel / clear').disabled, false); assert.equal(h.byText('Save answer').disabled, true);
    assert.equal(h.calls.length, calls); assert.equal(h.c.writes, writes + 1); assert.deepEqual(command, original); assert.deepEqual(await store.read(), state);
    h.click('Cancel / clear'); assert.equal(h.controller.result, null); assert.equal(h.c.writes, writes + 1); assert.equal(h.confirmations.length, 0);
});
test('actual UI: unknown or failed receipt check retains locked original metadata and allows another explicit check', async () => {
    for (const fail of [false, true]) {
        const h = await model(), command = await uncertainView(h);
        const title = h.host.querySelectorAll('input').find(node => node.maxLength === 200), checkbox = h.host.querySelector('.ai-context-save-context').querySelector('input');
        const titleValue = title.value, included = checkbox.checked, writes = h.c.writes, calls = h.calls.length;
        let inspections = 0; h.controller.collectionStore.inspectOperation = async original => { inspections++; assert.equal(original, command); if (fail) throw api.fault('READ'); return { committed: false }; };
        h.click('Check earlier save'); await idle(h);
        assert.equal(inspections, 1); assert.equal(h.controller.saveCommand, command); assert.equal(h.controller.saved, false);
        assert.equal(h.byText('Cancel / clear').disabled, true); assert.equal(h.byText('Check earlier save').disabled, false);
        assert.equal(title.disabled, true); assert.equal(checkbox.disabled, true); assert.equal(title.value, titleValue); assert.equal(checkbox.checked, included);
        assert.match(h.host.querySelector('.ai-context-status').textContent, /Missing or unreadable evidence keeps this draft locked/);
        assert.equal(h.c.writes, writes); assert.equal(h.calls.length, calls);
    }
});
test('actual UI: closing or workspace invalidation during receipt check cannot show success or unlock old operation', async () => {
    for (const close of [false, true]) {
        const h = await model(), command = await uncertainView(h), gate = deferred(), entered = deferred();
        const inspect = h.controller.collectionStore.inspectOperation.bind(h.controller.collectionStore);
        h.controller.collectionStore.inspectOperation = async value => { const result = await inspect(value); entered.resolve(); await gate.promise; return result; };
        const writes = h.c.writes; h.click('Check earlier save'); await entered.promise;
        if (close) h.view.destroy(); else h.deactivate(); gate.resolve(); await idle(h);
        assert.equal(h.controller.saveCommand, command); assert.equal(h.controller.saved, false); assert.equal(h.c.writes, writes);
        if (close) assert.equal(h.host.children.length, 0);
        else { assert.doesNotMatch(h.host.querySelector('.ai-context-status').textContent, /confirmed from its receipt/); assert.equal(h.byText('Cancel / clear').disabled, true); }
    }
});

async function uncertainTaskView(h) {
    await send(h); h.click('Review extracted'); await settle();
    const read = h.b.read.bind(h.b); let fail = true;
    h.b.read = async () => { if (fail && h.b.writes) { fail = false; throw Error('synthetic readback failure'); } return read(); };
    h.click('Add these'); await idle(h); assert.equal(h.controller.taskUncertain, true);
    return h.controller.taskCommand;
}
test('actual UI: explicit task check confirms only current complete unchanged batch and unlocks without writing or sending', async () => {
    const h = await model(); assert.equal(h.byText('Check existing task batch').hidden, true);
    const command = await uncertainTaskView(h), store = h.controller.taskStore;
    await store.mutate(store.request('add', { text: 'unrelated synthetic task' }));
    const writes = h.b.writes, calls = h.calls.length, before = await store.read(), question = h.host.querySelector('.ai-context-question').value;
    assert.equal(h.byText('Cancel / clear').disabled, true); assert.equal(h.byText('Check existing task batch').hidden, false);
    h.click('Check existing task batch'); assert.equal(h.byText('Check existing task batch').disabled, true); await idle(h);
    assert.equal(h.controller.taskCommand, null); assert.equal(h.controller.result, null); assert.equal(h.byText('Cancel / clear').disabled, false);
    assert.equal(h.byText('Check existing task batch').hidden, true); assert.equal(h.host.querySelector('.ai-context-tasks').hidden, true);
    assert.match(h.host.querySelector('.ai-context-status').textContent, /complete original task batch is currently present and unchanged/);
    assert.equal(h.b.writes, writes); assert.equal(h.calls.length, calls); assert.deepEqual(await store.read(), before);
    assert.equal(h.host.querySelector('.ai-context-question').value, question); assert.equal(command.texts.length, 3);
});
test('actual UI: changed or unreadable task batch stays frozen; close and workspace invalidation suppress late success', async () => {
    for (const outcome of ['changed', 'read', 'close', 'workspace']) {
        const h = await model(), command = await uncertainTaskView(h), store = h.controller.taskStore;
        if (outcome === 'changed') { const task = (await store.read()).records[0]; await store.mutate(store.request('complete', { id: task.id, version: task.version })); }
        if (outcome === 'read') h.b.read = async () => { throw Error('synthetic read failure'); };
        const gate = deferred(), entered = deferred(), verify = store.verifyBatch.bind(store);
        if (['close', 'workspace'].includes(outcome)) store.verifyBatch = async cmd => { const result = await verify(cmd); entered.resolve(); await gate.promise; return result; };
        const writes = h.b.writes, calls = h.calls.length; h.click('Check existing task batch');
        if (['close', 'workspace'].includes(outcome)) { await entered.promise; if (outcome === 'close') h.view.destroy(); else h.deactivate(); gate.resolve(); }
        await idle(h); assert.equal(h.controller.taskCommand, command); assert.equal(h.controller.taskUncertain, true);
        assert.equal(h.b.writes, writes); assert.equal(h.calls.length, calls);
        if (outcome !== 'close') { assert.equal(h.byText('Cancel / clear').disabled, true); assert.equal(h.byText('Check existing task batch').disabled, false); assert.match(h.host.querySelector('.ai-context-status').textContent, /keep this draft locked/); }
        else assert.equal(h.host.children.length, 0);
    }
});
test('task verification locale keys are complete and present in both runtime locales', () => {
    for (const locale of ['en', 'zh_CN']) {
        const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));
        for (const key of ['aiContextVerifyTasks', 'aiContextTasksVerified', 'aiContextUncertainTasks']) assert.equal(typeof messages[key].message, 'string');
    }
});


test('explicit source reload replaces saved sources atomically, keeps filters and old answer provenance without provider or writes', async () => {
    const h = await model(), oldRow = sourceRows(h)[0]; choose(oldRow); h.input(oldRow.querySelector('textarea'), 'Reviewed excerpt');
    h.setReply('Previous answer'); await send(h, 'answer');
    const result = h.controller.result, resultReview = h.controller.resultReview, snapshot = h.controller.answerSnapshot();
    const include = h.host.querySelector('.ai-context-save-context').querySelector('input'); include.checked = true; include.dispatch('change');
    h.input(answerTitle(h), 'Keep this answer title'); h.input(h.field('password'), 'synthetic-key');
    h.input(h.field('search'), 'latest'); h.host.querySelector('.ai-context-source-scope').value = 'library';
    h.host.querySelector('.ai-context-source-scope').dispatch('change'); h.click('Show selected only');
    const before = { generation: h.controller.generation, question: h.host.querySelector('.ai-context-question').value, endpoint: h.field('url').value, model: h.field('text').value };
    let reads = 0; const gate = deferred();
    h.controller.readSources = () => { reads++; return gate.promise; };
    h.controller.permissions.request = h.controller.permissions.contains = () => { throw Error('Reload requested permission'); };
    const reload = h.click('Reload saved'); reload.dispatch('click'); await settle();
    assert.equal(reads, 1); assert.equal(reload.disabled, true); assert.equal(sourceRows(h)[0], oldRow);
    assert.equal(h.controller.reviewed, resultReview); assert.equal(h.controller.generation, before.generation);
    gate.resolve([{ id: 'collection:new', label: '<img>latest', text: 'Latest <script>saved</script> text', scope: 'library' }]); await settle();
    assert.equal(h.confirmations.length, 1); assert.match(h.confirmations[0], /hidden and unselected/);
    const row = sourceRows(h)[0]; assert.notEqual(row, oldRow); assert.equal(oldRow.isConnected, false);
    assert.equal(row.querySelector('textarea').value, 'Latest <script>saved</script> text'); assert.equal(row.querySelector('input').checked, false);
    assert.equal(row.hidden, true); assert.equal(h.field('search').value, 'latest'); assert.equal(h.host.querySelector('.ai-context-source-scope').value, 'library');
    assert.equal(h.byText('Show selected only').getAttribute('aria-pressed'), 'true'); assert.equal(h.controller.generation, before.generation + 1);
    assert.equal(h.controller.reviewed, null); assert.equal(h.controller.result, result); assert.equal(h.controller.resultReview, resultReview);
    assert.deepEqual(h.controller.answerSnapshot(), snapshot); assert.equal(include.checked, true); assert.equal(answerTitle(h).value, 'Keep this answer title');
    assert.equal(h.host.querySelector('.ai-context-question').value, before.question); assert.equal(h.field('url').value, before.endpoint); assert.equal(h.field('text').value, before.model);
    assert.equal(h.field('password').value, 'synthetic-key'); assert.equal(h.calls.length, 1); assert.equal(h.b.writes + h.c.writes, 0);
    assert.equal(h.host.querySelectorAll('img, script').length, 0); assert.equal(h.host.querySelector('.ai-context-previous-result').hidden, false);
    h.click('Show selected only'); choose(row); h.input(row.querySelector('textarea'), 'edited latest'); restoreButton(row).dispatch('click');
    assert.equal(row.querySelector('textarea').value, 'Latest <script>saved</script> text');
    assert.match(restoreButton(row).title, /most recently loaded/); assert.equal(reads, 1);
    const generation = h.controller.generation; oldRow.querySelector('input').dispatch('change'); oldRow.querySelector('textarea').dispatch('input'); restoreButton(oldRow).dispatch('click');
    assert.equal(h.controller.generation, generation);
});

test('source reload cancellation catches hidden selections and hidden unselected edits with zero reads or state changes', async () => {
    for (const kind of ['selected', 'unselected-edit']) {
        const h = await model(), row = sourceRows(h)[0]; choose(row);
        if (kind === 'unselected-edit') { h.input(row.querySelector('textarea'), 'Keep unsent edit'); row.querySelector('input').checked = false; row.querySelector('input').dispatch('change'); }
        h.input(h.field('search'), 'hidden'); h.click('Review exact'); await settle();
        const review = h.controller.reviewed, generation = h.controller.generation, status = h.host.querySelector('.ai-context-status').textContent;
        let reads = 0; h.controller.readSources = async () => { reads++; return []; }; h.setConfirm(false);
        h.click('Reload saved'); await settle();
        assert.equal(reads, 0); assert.equal(h.controller.generation, generation); assert.equal(h.controller.reviewed, review);
        assert.equal(sourceRows(h)[0], row); assert.equal(h.host.querySelector('.ai-context-status').textContent, status); assert.equal(h.confirmations.length, 1);
        if (kind === 'unselected-edit') assert.equal(row.querySelector('textarea').value, 'Keep unsent edit');
    }
});

test('source reload clean or empty state does not confirm and always leaves newly loaded sources unselected', async () => {
    const h = await model(undefined, { sources: [] }); let reads = 0;
    h.controller.readSources = async () => { reads++; return [{ id: 'collection:new', label: 'New', text: 'saved', scope: 'library' }]; };
    h.click('Reload saved'); await settle(); assert.equal(h.confirmations.length, 0); assert.equal(reads, 1); assert.equal(selectedRows(h).length, 0);
    h.controller.readSources = async () => { reads++; return []; }; h.click('Reload saved'); await settle();
    assert.equal(h.confirmations.length, 0); assert.equal(reads, 2); assert.equal(sourceRows(h).length, 0);
});

test('source reload read or row-build failure preserves source edits, reviewed request and extracted task review', async () => {
    for (const failure of ['read', 'build']) {
        const h = await model(), row = sourceRows(h)[0]; choose(row); h.input(row.querySelector('textarea'), 'Keep edited excerpt');
        await send(h); h.click('Review extracted'); await settle();
        const reviewed = h.controller.reviewed, taskReview = h.controller.taskReview, result = h.controller.result, generation = h.controller.generation;
        h.controller.readSources = async () => {
            if (failure === 'read') throw Error('Synthetic read failure');
            return [{ id: 'collection:valid', label: 'Valid', text: 'Complete only', scope: 'library' }, { label: null, text: 'Invalid' }];
        };
        h.click('Reload saved'); await settle();
        assert.equal(sourceRows(h)[0], row); assert.equal(sourceRows(h).length, 1); assert.equal(row.querySelector('textarea').value, 'Keep edited excerpt');
        assert.equal(row.querySelector('input').checked, true); assert.equal(h.controller.reviewed, reviewed); assert.equal(h.controller.taskReview, taskReview);
        assert.equal(h.controller.result, result); assert.equal(h.controller.generation, generation); assert.equal(h.host.querySelector('.ai-context-tasks').hidden, false);
        assert.equal(h.byText('Add these').disabled, false); assert.match(h.host.querySelector('.ai-context-status').textContent, /current sources, excerpt edits and reviews are unchanged/);
        h.controller.readSources = async () => []; h.click('Reload saved'); await settle();
        assert.equal(sourceRows(h).length, 0); assert.equal(h.controller.taskReview, null); assert.equal(h.controller.result, result);
        assert.equal(h.byText('Add these').disabled, true); assert.equal(h.host.querySelector('.ai-context-tasks').hidden, true);
    }
});

test('initial source-read failure can explicitly retry in the same panel', async () => {
    let reads = 0;
    const h = await model(undefined, { sources: () => { reads++; throw Error('Synthetic initial failure'); } });
    assert.equal(sourceRows(h).length, 0); assert.equal(h.byText('Reload saved').disabled, false);
    h.controller.readSources = async () => { reads++; return [{ id: 'collection:recovered', label: 'Recovered', text: 'saved', scope: 'library' }]; };
    h.click('Reload saved'); await settle(); assert.equal(reads, 2); assert.equal(sourceRows(h).length, 1); assert.equal(h.confirmations.length, 0);
});

test('source reload locks while reading, permission, transport, preset persistence and uncertain persistence are pending', async () => {
    for (const kind of ['permission', 'transport', 'preset', 'save', 'tasks']) {
        const gate = deferred(), h = await model(kind === 'preset' ? { read: async () => ({ records: [] }), save: () => gate.promise } : undefined);
        let reads = 0; h.controller.readSources = async () => { reads++; return []; };
        if (kind === 'permission') { h.click('Review exact'); await settle(); h.controller.permissions.request = () => gate.promise; h.click('Allow this'); }
        if (kind === 'transport') { h.setReply(gate.promise); h.click('Review exact'); await settle(); h.click('Send reviewed'); }
        if (kind === 'preset') h.click('Save connection preset');
        if (kind === 'save') await uncertainView(h);
        if (kind === 'tasks') await uncertainTaskView(h);
        const reload = h.byText('Reload saved'), generation = h.controller.generation;
        assert.equal(reload.disabled, true, kind); reload.dispatch('click'); await settle();
        assert.equal(reads, 0, kind); assert.equal(h.controller.generation, generation, kind); assert.equal(h.confirmations.length, 0, kind);
        h.view.destroy(); gate.resolve(kind === 'preset' ? { records: [] } : true); await settle();
    }
});

test('source reload late results never replace rows after close, pagehide, generation change or workspace departure', async () => {
    for (const kind of ['close', 'pagehide', 'generation', 'workspace']) {
        const h = await model(), row = sourceRows(h)[0], gate = deferred();
        h.controller.readSources = () => gate.promise; h.click('Reload saved'); await settle();
        if (kind === 'close') h.view.destroy();
        if (kind === 'pagehide') h.events.get('pagehide')();
        if (kind === 'generation') h.controller.edit();
        if (kind === 'workspace') h.deactivate();
        gate.resolve([{ id: 'collection:late', label: 'Late', text: 'late', scope: 'library' }]); await settle();
        if (kind === 'close' || kind === 'pagehide') assert.equal(h.host.children.length, 0);
        else assert.equal(sourceRows(h)[0], row);
        assert.equal(h.calls.length, 0); assert.equal(h.b.writes + h.c.writes, 0);
    }
});

test('local prompt UI: empty connection, hidden selected excerpts included, unchecked excluded, explicit copy only', async () => {
    const copied = [], h = await model(undefined, { populate: false, clipboard: { writeText: async text => copied.push(text) }, sources: [
        { id: 'collection:selected', label: 'Alpha synthetic', text: 'selected content', scope: 'library' },
        { id: 'collection:excluded', label: 'Beta synthetic', text: 'excluded content', scope: 'library' }
    ] });
    h.input(h.host.querySelector('.ai-context-question'), 'Local question');
    const row = h.host.querySelectorAll('.ai-context-source')[0]; row.querySelector('input').checked = true; row.querySelector('input').dispatch('change');
    h.input(row.querySelector('textarea'), 'edited selected excerpt');
    h.input(h.field('search'), 'Beta'); assert.equal(row.hidden, true);
    h.click('Review prompt locally'); await settle();
    const ticket = h.controller.localReview, shown = h.host.querySelector('.ai-context-local-prompt');
    assert.equal(shown.value, ticket.packed.prompt); assert.equal(shown.readOnly, true);
    assert.match(shown.value, /collection:selected|edited selected excerpt/); assert.doesNotMatch(shown.value, /collection:excluded|excluded content/);
    assert.equal(copied.length, 0); assert.equal(h.controller.reviewed, null);
    assert.equal(h.byText('Allow this').disabled, true); assert.equal(h.byText('Send reviewed').disabled, true);
    h.click('Copy reviewed prompt'); await settle(); assert.deepEqual(copied, [ticket.packed.prompt]);
    assert.match(h.host.querySelector('.ai-context-local-status').textContent, /copied/);
    assert.equal(h.controller.saved, false); assert.equal(h.b.writes + h.c.writes + h.calls.length, 0);
});
test('local prompt UI: connection and key never enter copied prompt; local review clears remote authorization', async () => {
    const copied = [], h = await model(undefined, { clipboard: { writeText: async text => copied.push(text) } });
    h.input(h.field('password'), 'SYNTHETIC_KEY_SENTINEL'); h.click('Review exact'); await settle();
    h.click('Review prompt locally'); await settle(); h.click('Copy reviewed prompt'); await settle();
    assert.equal(h.controller.reviewed, null); assert.doesNotMatch(copied[0], /mock\.example|SYNTHETIC_KEY_SENTINEL|"model"|"url"/);
    assert.equal(h.byText('Allow this').disabled, true); assert.equal(h.byText('Send reviewed').disabled, true);
});
test('local prompt UI: all draft edits, mode, restoration, selection, reload and reset clear shown ticket', async () => {
    const operations = [h => h.input(h.host.querySelector('.ai-context-question'), 'changed'), h => h.input(h.field('url'), 'https://other.example/v1/chat/completions'),
        h => { const mode = h.host.querySelector('.ai-context-mode'); mode.value = 'tasks'; mode.dispatch('change'); },
        h => { const checkbox = h.field('checkbox'); checkbox.checked = true; checkbox.dispatch('change'); },
        h => h.click('Select visible unselected'), h => h.click('Reload saved sources'), h => h.click('Cancel / clear')];
    for (const operation of operations) {
        const h = await model(); h.click('Review prompt locally'); await settle(); operation(h); await settle();
        assert.equal(h.controller.localReview, null); assert.equal(h.host.querySelector('.ai-context-local-review').hidden, true);
        assert.equal(h.host.querySelector('.ai-context-local-prompt').value, ''); assert.equal(h.byText('Copy reviewed prompt').disabled, true);
    }
    const h = await model(); h.click('Select visible unselected');
    h.input(h.host.querySelector('.ai-context-source').querySelector('textarea'), 'edited');
    h.click('Review prompt locally'); await settle(); h.click('Restore original excerpt');
    assert.equal(h.controller.localReview, null); assert.equal(h.host.querySelector('.ai-context-local-prompt').value, '');
});
test('local prompt UI: blocked clipboard offers manual selection with no retries or writes', async () => {
    let calls = 0; const h = await model(undefined, { clipboard: { writeText: async () => { calls++; throw Error('blocked'); } } });
    h.click('Review prompt locally'); await settle(); h.click('Copy reviewed prompt'); await settle();
    assert.equal(calls, 1); assert.match(h.host.querySelector('.ai-context-local-status').textContent, /Select the complete prompt/);
    assert.equal(h.controller.saved, false); assert.equal(h.b.writes + h.c.writes, 0); assert.equal(h.byText('Copy reviewed prompt').disabled, false);
});
test('local prompt UI: late copy success or failure cannot overwrite newer review or copy status', async () => {
    for (const reject of [false, true]) {
        const first = {}; first.promise = new Promise((resolve, reject) => { first.resolve = resolve; first.reject = reject; }); const second = deferred(); let calls = 0;
        const h = await model(undefined, { clipboard: { writeText: () => (++calls === 1 ? first.promise : second.promise) } });
        h.click('Review prompt locally'); await settle(); h.click('Copy reviewed prompt'); await settle();
        h.input(h.host.querySelector('.ai-context-question'), 'newer question'); h.click('Review prompt locally'); await settle();
        h.click('Copy reviewed prompt'); await settle(); second.resolve(); await settle();
        const status = h.host.querySelector('.ai-context-local-status').textContent, prompt = h.host.querySelector('.ai-context-local-prompt').value;
        if (reject) first.reject(Error('late')); else first.resolve(); await settle();
        assert.equal(h.host.querySelector('.ai-context-local-status').textContent, status); assert.match(status, /copied/);
        assert.equal(h.host.querySelector('.ai-context-local-prompt').value, prompt); assert.match(prompt, /newer question/);
    }
});
test('local prompt UI: workspace loss and departure block copying and clear local data without late feedback', async () => {
    const copied = [], h = await model(undefined, { clipboard: { writeText: async text => copied.push(text) } });
    h.click('Review prompt locally'); await settle(); h.deactivate(); h.click('Copy reviewed prompt'); await settle();
    assert.equal(copied.length, 0); assert.equal(h.controller.localReview, null); assert.equal(h.host.querySelector('.ai-context-local-prompt').value, '');
    const gate = deferred(), next = await model(undefined, { clipboard: { writeText: () => gate.promise } });
    next.click('Review prompt locally'); await settle(); next.click('Copy reviewed prompt'); await settle();
    const prompt = next.host.querySelector('.ai-context-local-prompt'), status = next.host.querySelector('.ai-context-local-status');
    next.events.get('pagehide')(); gate.resolve(); await settle();
    assert.equal(next.controller.localReview, null); assert.equal(prompt.value, ''); assert.equal(status.textContent, ''); assert.equal(next.host.children.length, 0);
});
test('local prompt UI: pending and uncertain operation guards block review and copy handlers', async () => {
    for (const field of ['saveCommand', 'taskCommand']) {
        const h = await model(); h.click('Review prompt locally'); await settle(); const ticket = h.controller.localReview;
        h.controller[field] = { id: 'synthetic-pending' }; h.controller.saveUncertain = h.controller.taskUncertain = true;
        h.byText('Review prompt locally').dispatch('click'); h.byText('Copy reviewed prompt').dispatch('click'); await settle();
        assert.equal(h.controller.localReview, ticket); assert.equal(h.b.writes + h.c.writes + h.calls.length, 0);
    }
    const h = await model(), gate = deferred(); h.controller.ensureActive = () => gate.promise;
    h.click('Review prompt locally'); assert.equal(h.byText('Review prompt locally').disabled, true); assert.equal(h.byText('Copy reviewed prompt').disabled, true);
    h.view.destroy(); gate.resolve(); await settle(); assert.equal(h.controller.localReview, null);
});
test('local prompt UI has explicit English and Chinese privacy and manual-copy labels', () => {
    for (const locale of ['en', 'zh_CN']) {
        const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        for (const key of ['LocalPrompt', 'LocalPrivacy', 'ReviewLocal', 'CopyLocal', 'LocalReviewed', 'LocalCopied', 'LocalCopyBlocked']) assert(messages[`aiContext${key}`]?.message);
    }
});

const batchDeselect = h => h.byText('Deselect visible selected');
test('visible deselection snapshots the 201-source title/scope/selected intersection and preserves hidden selections and draft nodes', async () => {
    const sources = Array.from({ length: 201 }, (_, i) => ({ id: `collection:deselect-${i}`, label: i < 4 ? 'Match source' : 'Other source', text: `Excerpt ${i}`, scope: i === 0 ? 'workspace' : 'library' }));
    const h = await model(undefined, { sources, blurUnavailableFocus: true }), rows = sourceRows(h);
    [0, 1, 2, 200].forEach(i => choose(rows[i]));
    h.input(rows[1].querySelector('textarea'), 'Keep edited excerpt');
    h.input(answerTitle(h), 'Keep title'); h.input(h.field('password'), 'synthetic-key');
    h.input(h.field('search'), '  mAtCh  ');
    const scope = h.host.querySelector('.ai-context-source-scope'); scope.value = 'library'; scope.dispatch('change');
    h.click('Show selected only'); h.click('Review exact'); await settle();
    const generation = h.controller.generation, reads = h.b.reads + h.c.reads, question = questionField(h).value;
    for (const method of ['readSources', 'loadSources', 'review', 'send', 'allow']) h.controller[method] = () => { throw Error(`deselect called ${method}`); };
    h.controller.permissions.request = h.controller.permissions.contains = () => { throw Error('deselect permission'); };
    assert.match(batchDeselect(h).textContent, /\(2\)/); batchDeselect(h).focus(); h.click('Deselect visible selected');
    assert.deepEqual(selectedRows(h), [rows[0], rows[200]]); assert.deepEqual(sourceRows(h), rows);
    assert.equal(h.controller.generation, generation + 1); assert.equal(h.controller.reviewed, null);
    assert.equal(rows[1].querySelector('textarea').value, 'Keep edited excerpt'); assert.equal(rows[1].querySelector('textarea').hidden, true);
    assert.equal(h.document.activeElement, h.byText('Show selected only')); assert.equal(batchDeselect(h).disabled, true);
    assert.equal(questionField(h).value, question); assert.equal(answerTitle(h).value, 'Keep title');
    assert.equal(h.field('password').value, 'synthetic-key'); assert.equal(scope.value, 'library');
    assert.equal(h.field('search').value, '  mAtCh  '); assert.equal(h.view.hasUncommittedWork(), true);
    assert.match(h.host.querySelector('.ai-context-source-count').textContent, /Selected: 2.*hidden: 2/);
    assert.match(h.host.querySelector('.ai-context-budget').textContent, /2/);
    batchDeselect(h).dispatch('click'); assert.equal(h.controller.generation, generation + 1);
    assert.equal(h.b.reads + h.c.reads, reads); assert.equal(h.b.writes + h.c.writes + h.calls.length, 0);
});
test('visible deselection empty targets retain local and network reviews, while removal is never capped at twelve', async () => {
    const h = await model(undefined, { sources: batchSources() });
    for (const review of ['Review exact', 'Review prompt locally']) {
        h.click(review); await settle(); const generation = h.controller.generation, remote = h.controller.reviewed, local = h.controller.localReview;
        batchDeselect(h).dispatch('click'); assert.equal(h.controller.generation, generation);
        assert.equal(h.controller.reviewed, remote); assert.equal(h.controller.localReview, local);
    }
    sourceRows(h).slice(0, 15).forEach(row => choose(row));
    assert.equal(batchDeselect(h).disabled, false); h.click('Deselect visible selected'); assert.equal(selectedRows(h).length, 0);
});
test('visible deselection invalidates reviews once but retains previous answer provenance and snapshot consent', async () => {
    const h = await model(); choose(sourceRows(h)[0]); await send(h, 'answer');
    const result = h.controller.result, resultReview = h.controller.resultReview, snapshot = h.controller.answerSnapshot(), saved = h.controller.saved;
    const include = h.host.querySelector('.ai-context-save-context').querySelector('input'); include.checked = true; include.dispatch('change');
    h.input(answerTitle(h), 'Keep original answer');
    const generation = h.controller.generation;
    h.click('Deselect visible selected');
    assert.equal(h.controller.generation, generation + 1); assert.equal(h.controller.taskReview, null); assert.equal(h.controller.reviewed, null);
    assert.equal(h.controller.result, result); assert.equal(h.controller.resultReview, resultReview); assert.equal(h.controller.saved, saved);
    assert.deepEqual(h.controller.answerSnapshot(), snapshot); assert.equal(include.checked, true);
    assert.equal(answerTitle(h).value, 'Keep original answer'); assert.equal(h.host.querySelector('.ai-context-previous-result').hidden, false);
});
test('visible deselection rejects busy, uncertain task/save, closed, pending, preset and disposed events before mutation', async () => {
    for (const property of ['busy', 'taskCommand', 'saveCommand', 'closed']) {
        const h = await model(); choose(sourceRows(h)[0]); const generation = h.controller.generation;
        h.controller[property] = true; batchDeselect(h).dispatch('click'); h.input(h.field('search'), '');
        assert.equal(selectedRows(h).length, 1); assert.equal(h.controller.generation, generation); assert.equal(batchDeselect(h).disabled, true);
    }
    const h = await model(); choose(sourceRows(h)[0]); const gate = deferred(); h.controller.ensureActive = () => gate.promise;
    h.click('Review exact'); const generation = h.controller.generation; batchDeselect(h).dispatch('click');
    assert.equal(batchDeselect(h).disabled, true); assert.equal(selectedRows(h).length, 1); assert.equal(h.controller.generation, generation);
    gate.resolve(); await settle();
    const presetGate = deferred(), p = await model({ read: async () => ({ records: [] }), save: () => presetGate.promise });
    choose(sourceRows(p)[0]); p.click('Save connection preset'); const pg = p.controller.generation;
    batchDeselect(p).dispatch('click'); assert.equal(batchDeselect(p).disabled, true); assert.equal(selectedRows(p).length, 1); assert.equal(p.controller.generation, pg);
    presetGate.resolve({ records: [] }); await settle();
    const button = batchDeselect(p), row = sourceRows(p)[0]; p.view.destroy(); const dg = p.controller.generation;
    assert.equal(button.disabled, true); button.dispatch('click'); assert.equal(row.querySelector('input').checked, true); assert.equal(p.controller.generation, dg);
});
test('visible deselection edit rejection preserves checkbox and reviewed preview', async () => {
    const h = await model(); choose(sourceRows(h)[0]); h.click('Review exact'); await settle();
    const reviewed = h.controller.reviewed, generation = h.controller.generation;
    h.controller.edit = () => { throw api.fault('BUSY'); }; batchDeselect(h).dispatch('click');
    assert.equal(selectedRows(h).length, 1); assert.equal(h.controller.reviewed, reviewed); assert.equal(h.controller.generation, generation);
    assert.equal(h.host.querySelector('.ai-context-review').hidden, false);
});
test('visible deselection invalidates local prompt and late clipboard completions cannot replace a newer review', async () => {
    for (const fail of [false, true]) {
        let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; });
        const h = await model(undefined, { clipboard: { writeText: () => promise } }); choose(sourceRows(h)[0]);
        h.click('Review prompt locally'); await settle(); h.click('Copy reviewed prompt'); await settle();
        h.click('Deselect visible selected'); assert.equal(h.controller.localReview, null);
        assert.equal(h.host.querySelector('.ai-context-local-prompt').value, ''); assert.equal(h.byText('Copy reviewed prompt').disabled, true);
        h.click('Review prompt locally'); await settle();
        const prompt = h.host.querySelector('.ai-context-local-prompt').value, status = h.host.querySelector('.ai-context-local-status').textContent;
        if (fail) reject(Error('late')); else resolve(); await settle();
        assert.equal(h.host.querySelector('.ai-context-local-prompt').value, prompt); assert.equal(h.host.querySelector('.ai-context-local-status').textContent, status);
    }
});
test('visible deselection has explicit English and Chinese count labels and help', () => {
    for (const locale of ['en', 'zh_CN']) {
        const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        assert(messages.aiContextSourceDeselectVisible.message);
        assert.match(messages.aiContextSourceBatchHelp.message, locale === 'en' ? /Deselect visible keeps hidden selections/ : /取消可见已选会保留隐藏/);
    }
});

test('visible deselection also invalidates the extracted-task review', async () => {
    const h = await model(); choose(sourceRows(h)[0]); await send(h); h.click('Review extracted'); await settle();
    assert(h.controller.taskReview); const generation = h.controller.generation, result = h.controller.result;
    h.click('Deselect visible selected'); assert.equal(h.controller.taskReview, null);
    assert.equal(h.controller.generation, generation + 1); assert.equal(h.controller.result, result);
    assert.equal(h.byText('Add these').disabled, true);
});

test('workbench uses one labeled source pane, one question pane and optional connection disclosure', async () => {
    const h = await model(undefined, { populate: false });
    const sources = h.host.querySelector('.ai-context-sources-pane'), question = h.host.querySelector('.ai-context-question-pane');
    const connection = h.host.querySelector('.ai-context-connection');
    assert.equal(connection.tagName, 'DETAILS'); assert.equal(connection.open, false);
    assert.equal(connection.querySelector('summary').textContent, 'Optional: call a model in this extension');
    assert.equal(sources.getAttribute('aria-label'), 'Saved sources'); assert.equal(question.getAttribute('aria-label'), 'Question and review');
    for (const selector of ['.ai-context-source-search', '.ai-context-source-scope', '.ai-context-source-count', '.ai-context-source-reload', '.ai-context-sources']) assert(sources.querySelector(selector));
    for (const selector of ['.ai-context-question', '.ai-context-mode', '.ai-context-local-review', '.ai-context-result-pane']) assert(question.querySelector(selector));
    assert.equal(h.host.querySelectorAll('.ai-context-question').length, 1);
    assert.equal(h.host.querySelectorAll('.ai-context-endpoint').length, 1);
    assert.equal(connection.contains(h.byText('Review prompt locally')), false);
    assert.equal(h.byText('Review prompt locally').getClientRects().length, 1);
    assert.equal(h.field('url').getClientRects().length, 0);
    assert.equal(h.host.querySelector('.ai-context-result-pane').hidden, true);
});

test('workbench disclosure preserves local draft, edited sources, ticket and copied prompt with zero permissions, transport or writes', async () => {
    const copied = [], h = await model(undefined, { populate: false, clipboard: { writeText: async value => copied.push(value) } });
    let permissions = 0; h.controller.permissions = { request: async () => { permissions++; return true; }, contains: async () => { permissions++; return true; } };
    const connection = h.host.querySelector('.ai-context-connection'), question = questionField(h), row = sourceRows(h)[0];
    h.input(question, 'Synthetic offline question'); choose(row); h.input(row.querySelector('textarea'), 'Synthetic offline excerpt');
    h.click('Review prompt locally'); await settle();
    const ticket = h.controller.localReview, generation = h.controller.generation;
    for (const open of [true, false, true, false]) { connection.open = open; connection.dispatch('toggle'); }
    assert.equal(h.controller.localReview, ticket); assert.equal(h.controller.generation, generation);
    assert.equal(questionField(h), question); assert.equal(question.value, 'Synthetic offline question');
    assert.equal(sourceRows(h)[0], row); assert.equal(row.querySelector('textarea').value, 'Synthetic offline excerpt');
    h.click('Copy reviewed prompt'); await settle(); assert.deepEqual(copied, [ticket.packed.prompt]);
    assert.equal(permissions, 0); assert.equal(h.calls.length, 0); assert.equal(h.b.writes + h.c.writes, 0);
    h.input(question, 'Changed question'); assert.equal(h.controller.localReview, null); assert.equal(h.byText('Copy reviewed prompt').disabled, true);
});

test('workbench connection collapse preserves connection and result identity without restarting transport', async () => {
    const h = await model(); const connection = h.host.querySelector('.ai-context-connection'); connection.open = true;
    h.input(h.field('password'), 'SYNTHETIC_KEY'); h.click('Review exact'); await settle();
    const ticket = h.controller.reviewed;
    connection.open = false; connection.dispatch('toggle');
    assert.equal(h.field('password').value, 'SYNTHETIC_KEY'); assert.equal(h.controller.reviewed, ticket);
    connection.open = true; h.setReply('Synthetic response'); h.click('Send reviewed'); await settle();
    const result = h.controller.result, output = h.host.querySelectorAll('textarea').find(node => node.rows === 8);
    connection.open = false; connection.dispatch('toggle');
    assert.equal(h.controller.result, result); assert.equal(output.value, 'Synthetic response');
    assert.equal(output.getClientRects().length, 1); assert.equal(h.byText('Save answer').getClientRects().length, 1);
    assert.equal(h.field('url').value, 'https://mock.example/v1/chat/completions'); assert.equal(h.field('text').value, 'mock');
    assert.equal(h.calls.length, 1); assert.equal(h.b.writes + h.c.writes, 0); assert.equal(h.field('password').value, '');
});

test('workbench responsive rules and translated headings are present without claiming native viewport coverage', () => {
    const css = fs.readFileSync('ai-context.css', 'utf8');
    assert.match(css, /grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1\.25fr\)/);
    assert.match(css, /@media \(max-width: 900px\)/); assert.match(css, /grid-template-columns: minmax\(0, 1fr\);/);
    assert.match(css, /max-height: none; overflow: visible/);
    for (const locale of ['en', 'zh_CN']) {
        const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        for (const key of ['SourcesHeading', 'QuestionHeading', 'ConnectionHeading', 'ResultHeading', 'SourceHelpHeading']) assert(messages[`aiContext${key}`]?.message);
    }
});

test('actual workbench wrapper trap includes disclosure summaries at both Tab boundaries', async () => {
    const document = createDocument(), trigger = document.createElement('button'); trigger.id = 'ai-context-entry'; document.body.append(trigger);
    let mounted;
    const window = { document, chrome: { permissions: {} }, addEventListener() {}, removeEventListener() {}, confirm: () => true,
        LocalItabAIContext: { createController: () => new api.Controller({
            transport: { review: input => input, run: async () => { throw Error('Unexpected transport'); } },
            permissions: { request: async () => { throw Error('Unexpected permission'); }, contains: async () => false },
            ensureActive: async () => {}, readSources: async () => [], taskStore: new Tasks.Store(backend()), collectionStore: new Collections.Store(backend())
        }) } };
    const context = vm.createContext({ window });
    for (const file of ['shared/dialog-focus.js', 'shared/ai-context-view.js', 'ai-context.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    const mount = window.LocalItabAIContextView.mount;
    window.LocalItabAIContextView.mount = (...args) => (mounted = mount(...args));
    trigger.focus(); trigger.dispatch('click'); await mounted.ready;
    const overlay = document.querySelector('.ai-context-overlay'), close = overlay.querySelector('.ai-context-close');
    const connection = overlay.querySelector('.ai-context-connection'), summary = connection.querySelector('summary');
    const reset = overlay.querySelectorAll('button').find(node => node.textContent === 'Cancel / clear draft');
    const review = overlay.querySelectorAll('button').find(node => node.textContent === 'Review exact request');
    for (const node of overlay.querySelectorAll('summary')) assert.equal(node.getAttribute('tabindex'), '0');
    assert.equal(connection.open, false);
    reset.focus(); assert.equal(overlay.dispatch('keydown', { key: 'Tab' }).prevented, false, 'native Tab must continue from reset to summary');
    summary.focus(); assert.equal(overlay.dispatch('keydown', { key: 'Tab' }).prevented, true); assert.equal(document.activeElement, close);
    assert.equal(overlay.dispatch('keydown', { key: 'Tab', shiftKey: true }).prevented, true); assert.equal(document.activeElement, summary);
    // The model has no native disclosure activation or Tab traversal. Explicitly
    // change open state, then check the real shared trap's resulting boundaries.
    connection.open = true; connection.dispatch('toggle'); summary.focus();
    assert.equal(overlay.dispatch('keydown', { key: 'Tab' }).prevented, false);
    review.focus(); assert.equal(overlay.dispatch('keydown', { key: 'Tab' }).prevented, true); assert.equal(document.activeElement, close);
    connection.open = false; connection.dispatch('toggle'); close.focus();
    overlay.dispatch('keydown', { key: 'Tab', shiftKey: true }); assert.equal(document.activeElement, summary);
    overlay.dispatch('keydown', { key: 'Escape' }); assert.equal(overlay.isConnected, false); assert.equal(document.activeElement, trigger);
});

test('progressive option defaults off, local review names mode, mode changes clear key and invalidate reviews', async () => {
    const h = await model(), stream = h.host.querySelector('.ai-context-stream'), mode = h.host.querySelector('.ai-context-mode');
    assert.equal(stream.checked, false);
    stream.checked = true; stream.dispatch('change'); h.click('Review prompt locally'); await settle();
    assert.equal(h.controller.localReview.packed.stream, true); assert.match(h.host.querySelector('.ai-context-local-mode').textContent, /Progressive answer: on/);
    assert.equal(h.calls.length, 0); h.click('Review exact'); await settle();
    assert.match(h.host.querySelector('.ai-context-review').textContent, /Progressive answer: on/);
    h.input(h.field('password'), 'synthetic'); mode.value = 'tasks'; mode.dispatch('change');
    assert.equal(stream.checked, false); assert.equal(stream.disabled, true); assert.equal(h.field('password').value, '');
    assert.equal(h.controller.reviewed, null); assert.equal(h.controller.localReview, null);
    await send(h, 'tasks'); assert.equal(h.calls[0].options.stream, false);
});

test('progressive UI renders literal partial text separately, blocks save/copy and promotes only completion', async () => {
    const copies = [], h = await model(null, { clipboard: { writeText: async text => copies.push(text) } }), pending = deferred();
    h.setReply(pending.promise); const stream = h.host.querySelector('.ai-context-stream'); stream.checked = true; stream.dispatch('change');
    h.click('Review exact'); await settle(); h.click('Send reviewed'); await settle();
    const options = h.calls[0].options; assert.equal(options.stream, true);
    options.onText('<img src=x> synthetic partial');
    assert.equal(h.host.querySelector('.ai-context-partial').hidden, false);
    assert.match(h.host.querySelector('.ai-context-partial-text').textContent, /<img src=x>/);
    assert.equal(h.host.querySelectorAll('img').length, 0); assert.equal(h.controller.result, null);
    assert.equal(h.byText('Copy answer').disabled, true); assert.equal(h.byText('Save answer').disabled, true);
    assert.equal(h.c.writes, 0); assert.deepEqual(copies, []);
    pending.resolve('Synthetic complete'); await settle();
    assert.equal(h.host.querySelector('.ai-context-partial').hidden, true); assert.equal(h.byText('Copy answer').disabled, false);
    h.click('Copy answer'); await settle(); assert.deepEqual(copies, ['Synthetic complete']); assert.equal(h.c.writes, 0);
});

test('page visibility stops stream, clears key, keeps explicit incomplete text and ignores late chunks', async () => {
    const h = await model(), pending = deferred(); h.setReply(pending.promise);
    const stream = h.host.querySelector('.ai-context-stream'); stream.checked = true; stream.dispatch('change');
    h.input(h.field('password'), 'synthetic'); h.click('Review exact'); await settle(); h.click('Send reviewed'); await settle();
    const options = h.calls[0].options; options.onText('unfinished synthetic');
    h.document.visibilityState = 'hidden'; h.document.listeners.get('visibilitychange')(); await settle();
    assert.equal(options.signal.aborted, true); assert.equal(h.field('password').value, ''); assert.equal(h.controller.partial.state, 'stopped');
    assert.match(h.host.querySelector('.ai-context-partial-status').textContent, /Incomplete answer/);
    assert.equal(h.byText('Copy answer').disabled, true); assert.equal(h.byText('Save answer').disabled, true);
    assert.throws(() => options.onText('late')); pending.resolve('late'); await settle(); assert.equal(h.controller.result, null);
    h.click('Review exact'); await settle(); assert.equal(h.controller.partial, null);
    h.view.destroy(); assert.equal(h.document.listeners.has('visibilitychange'), false);
});

function manualFrames() {
    let next = 0; const pending = new Map(), callbacks = new Map(), cancelled = [];
    return {
        request(fn) { const id = ++next; pending.set(id, fn); callbacks.set(id, fn); return id; },
        cancel(id) { cancelled.push(id); pending.delete(id); },
        flush() { const batch = [...pending.values()]; pending.clear(); for (const fn of batch) fn(); },
        pending, callbacks, cancelled
    };
}
async function startProgressive(h) {
    const reply = deferred(); h.setReply(reply.promise);
    const stream = h.host.querySelector('.ai-context-stream'); stream.checked = true; stream.dispatch('change');
    h.click('Review exact'); await settle(); h.click('Send reviewed'); await settle();
    return { reply, options: h.calls.at(-1).options };
}
function countTextWrites(host) {
    const writes = [];
    for (const node of host.querySelectorAll('*')) {
        let text = node.textContent;
        Object.defineProperty(node, 'textContent', { configurable: true, get: () => text,
            set(value) { writes.push({ node, value, previous: text }); text = value; } });
    }
    return writes;
}
test('progressive bursts paint once per frame with zero budget recomputation or repeated status writes', async () => {
    const frames = manualFrames(), h = await model(null, { frames,
        sources: Array.from({ length: 201 }, (_, i) => ({ id: `collection:synthetic${i}`, label: `Synthetic ${i}`, text: 'x'.repeat(2000), scope: 'library' })) });
    for (const row of h.host.querySelectorAll('.ai-context-source').slice(0, 12)) { const check = row.querySelector('input'); check.checked = true; check.dispatch('change'); }
    const { reply, options } = await startProgressive(h);
    assert.equal(h.controller.reviewed.packed.prompt.length, 25050);
    const writes = countTextWrites(h.host); let budgets = 0;
    const inspect = h.controller.inspectInput.bind(h.controller); h.controller.inspectInput = (...args) => { budgets++; return inspect(...args); };
    const pane = h.host.querySelector('.ai-context-partial-text'), stop = h.byText('Stop request');
    stop.closest('details').open = true; stop.focus(); pane.scrollTop = 17;
    for (let i = 1; i <= 4000; i++) options.onText('a'.repeat(i));
    assert.equal(frames.pending.size, 1); assert.equal(writes.length, 0); assert.equal(budgets, 0);
    frames.flush(); assert.equal(writes.length, 1); assert.equal(writes[0].node, pane); assert.equal(pane.textContent, 'a'.repeat(4000));
    assert.equal(budgets, 0); assert.equal(h.document.activeElement, stop); assert.equal(pane.scrollTop, 17);
    assert.equal(pane.closest('[role="status"], [aria-live]'), null);
    options.onText('a'.repeat(4000)); frames.flush(); assert.equal(writes.length, 1);
    options.onText('last'); frames.flush(); assert.equal(writes.length, 2); assert.equal(budgets, 0);
    reply.resolve('last'); await settle(); assert.equal(h.controller.result.text, 'last'); h.view.destroy();
});
for (const terminal of ['stop', 'hidden', 'error', 'complete', 'destroy']) {
    test(`progressive pending frame is cancelled on ${terminal}; terminal text is immediate and late callback harmless`, async () => {
        const frames = manualFrames(), h = await model(null, { frames }), { reply, options } = await startProgressive(h);
        const pane = h.host.querySelector('.ai-context-partial-text'); options.onText('last unpainted text');
        const late = [...frames.callbacks.values()].at(-1); assert.equal(pane.textContent, '');
        const writes = countTextWrites(h.host), partialStatus = h.host.querySelector('.ai-context-partial-status');
        if (terminal === 'stop') h.click('Stop request');
        if (terminal === 'hidden') { h.document.visibilityState = 'hidden'; h.document.listeners.get('visibilitychange')(); }
        if (terminal === 'error') { reply.resolve(Promise.reject(new Error('synthetic failure'))); await settle(); }
        if (terminal === 'complete') { reply.resolve('validated complete'); await settle(); }
        if (terminal === 'destroy') h.view.destroy();
        assert.equal(frames.pending.size, 0); assert.equal(frames.cancelled.length, 1);
        if (['stop', 'hidden', 'error'].includes(terminal)) {
            assert.equal(pane.textContent, 'last unpainted text');
            assert.match(h.host.querySelector('.ai-context-partial-status').textContent, /Incomplete answer/);
            assert.equal(h.byText('Copy answer').disabled, true); assert.equal(h.byText('Save answer').disabled, true);
        }
        if (terminal === 'complete') {
            assert.equal(pane.textContent, ''); assert.equal(h.host.querySelector('.ai-context-partial').hidden, true);
            assert.equal(h.host.querySelectorAll('textarea').find(node => node.rows === 8).value, 'validated complete');
            assert.equal(h.byText('Copy answer').disabled, false);
        }
        const before = pane.textContent; late(); assert.equal(pane.textContent, before);
        assert.equal(writes.filter(write => write.node === partialStatus).length, terminal === 'destroy' ? 0 : 1);
        if (!['error', 'complete'].includes(terminal)) reply.resolve('late ignored');
        await settle(); if (terminal !== 'complete') assert.equal(h.controller.result, null);
        h.view.destroy();
    });
}
test('cancelled old frame cannot paint or cancel a newer request frame after explicit retry', async () => {
    const frames = manualFrames(), h = await model(null, { frames }), first = await startProgressive(h);
    first.options.onText('old partial'); const oldFrame = [...frames.callbacks.values()].at(-1);
    h.click('Stop request'); await settle();
    const second = await startProgressive(h); second.options.onText('new partial');
    assert.equal(frames.pending.size, 1); const pane = h.host.querySelector('.ai-context-partial-text');
    oldFrame(); assert.equal(pane.textContent, ''); assert.equal(frames.pending.size, 1);
    frames.flush(); assert.equal(pane.textContent, 'new partial');
    first.reply.resolve('old late completion'); second.reply.resolve('new complete'); await settle();
    assert.equal(h.controller.result.text, 'new complete'); h.view.destroy();
});

test('safe reading view only formats complete Answer once and keeps exact copy/save ownership', async () => {
    const copies = [], h = await model(undefined, { safeReader: true, clipboard: { writeText: async value => copies.push(value) } });
    const source = '  # Synthetic answer\r\n\n**body** 中文 🧪\t  '; h.setReply(source); await send(h, 'answer');
    assert.equal(h.readerParses, 1); assert(h.host.querySelector('.answer-reader-content').querySelector('h1'));
    const original = h.host.querySelector('.answer-reader-source'); assert.equal(original.textContent, source);
    h.byText('Original text').dispatch('click'); assert.equal(original.hidden, false);
    h.click('Copy answer'); await settle(); assert.deepEqual(copies, [source]); assert.equal(h.readerParses, 1);
    h.input(h.host.querySelector('.ai-context-question'), 'Changed question');
    assert.equal(h.host.querySelector('.ai-context-previous-result').hidden, false); assert.equal(h.readerParses, 1);
    h.click('Save answer'); for (let i = 0; i < 100 && h.controller.busy; i++) await new Promise(resolve => setTimeout(resolve, 5)); await settle(); const state = await h.controller.collectionStore.read();
    assert.equal(state.records[0].body, source); assert.equal(state.records[0].history[0].body, source); assert.equal(h.readerParses, 1);
    h.click('Cancel / clear'); assert.equal(h.host.querySelector('.answer-reader'), null);
    h.view.destroy();
});
test('task JSON, progressive chunks, stopped partial and late completion never enter reader', async () => {
    const h = await model(undefined, { safeReader: true }); await send(h, 'tasks'); assert.equal(h.readerParses, 0);
    h.click('Cancel / clear'); h.input(h.host.querySelector('.ai-context-question'), 'New answer'); h.host.querySelector('.ai-context-mode').value = 'answer'; h.host.querySelector('.ai-context-mode').dispatch('change');
    const run = await startProgressive(h);
    for (let i = 0; i < 100; i++) run.options.onText(`# partial ${i}`);
    assert.equal(h.readerParses, 0); h.click('Stop request'); assert.equal(h.readerParses, 0);
    run.reply.resolve('# Late completion'); await settle(); assert.equal(h.readerParses, 0);
    h.click('Cancel / clear'); h.input(h.host.querySelector('.ai-context-question'), 'Another answer');
    const next = await startProgressive(h); next.options.onText('# partial'); next.reply.resolve('# Complete answer'); await settle();
    assert.equal(h.readerParses, 1); assert(h.host.querySelector('.answer-reader-content').querySelector('h1'));
    const old = h.byText('Original text'); h.view.destroy(); old.dispatch('click'); assert.equal(h.host.querySelector('.answer-reader'), null);
});
