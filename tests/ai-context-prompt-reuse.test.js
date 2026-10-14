const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { webcrypto } = require('node:crypto'); global.crypto ||= webcrypto;
const { createDocument, deferred } = require('./helpers/task-dom-model');
const Context = require('../shared/ai-context'), Prompts = require('../shared/local-prompts-store');
const Tasks = require('../shared/local-tasks-store'), Collections = require('../shared/local-ai-collections-store');
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
function backend() {
    let raw; const listeners = new Set();
    return { reads: 0, writes: 0, lock: fn => fn(), async read() { this.reads++; return structuredClone(raw); },
        async write(value) { this.writes++; raw = structuredClone(value); }, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, notify() { for (const fn of listeners) fn(); }, get listeners() { return [...listeners]; },
        get raw() { return structuredClone(raw); }, replace(value) { raw = structuredClone(value); } };
}
async function mount({ body = 'Ask {{topic}}', normalize = false, locale = 'en', empty = false, presetStore, lazy = false, waitReady = true } = {}) {
    const document = createDocument({ blurUnavailableFocus: true }), create = document.createElement;
    if (normalize) document.createElement = tag => {
        const node = create(tag); if (tag === 'textarea') {
            let value = ''; Object.defineProperty(node, 'value', { get: () => value, set: next => { value = String(next).replace(/\r\n?/g, '\n'); } });
        } return node;
    };
    const host = document.createElement('main'); document.body.append(host);
    const p = backend(), b = backend(), c = backend(), promptStore = new Prompts.Store(p); let record;
    if (!empty) { await promptStore.mutate(promptStore.request('add', { title: '<b>Synthetic template</b>', body })); record = (await promptStore.read()).records[0]; }
    p.reads = p.writes = 0;
    let active = true, reply = 'Synthetic previous answer', workCheck = async () => { if (!active) throw Error('Workspace unavailable'); };
    const calls = [], grants = [], copied = [], events = new Map();
    const transport = { review: input => ({ ...input, origin: 'https://mock.example', permission: 'https://mock.example:443/*' }),
        run: async (input, options) => { calls.push({ input, options }); return { text: await reply }; } };
    const controller = new Context.Controller({ transport, permissions: { request: async value => { grants.push(value); return true; }, contains: async () => true },
        ensureActive: () => workCheck(), readSources: async () => [{ id: 'collection:synthetic', label: 'Synthetic source', text: 'Saved source', scope: 'library' }],
        taskStore: new Tasks.Store(b), collectionStore: new Collections.Store(c) });
    const review = controller.review.bind(controller); controller.review = input => review(JSON.parse(JSON.stringify(input)));
    let creations = 0;
    const window = { document, LocalItabPrompts: Prompts,
        LocalItabWorkspaces: { manager: { createPromptBackend(api) { assert.equal(api, Prompts); creations++; return p; } } },
        confirm: () => true, addEventListener: (type, fn) => events.set(type, fn), removeEventListener: type => events.delete(type) };
    vm.runInNewContext(fs.readFileSync('shared/ai-context-view.js', 'utf8'), { window });
    const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const view = window.LocalItabAIContextView.mount(host, { controller, presetStore, promptStore: lazy ? undefined : promptStore,
        clipboard: { writeText: async text => copied.push(text) }, t: (key, fallback) => messages[key]?.message || fallback });
    if (waitReady) await view.ready;
    const q = selector => host.querySelector(selector), button = text => host.querySelectorAll('button').find(node => node.textContent === text || node.textContent.startsWith(text));
    const click = text => { const node = button(text); assert.ok(node, text); assert.equal(Boolean(node.disabled), false, `${text} enabled`); node.dispatch('click'); return node; };
    const input = (node, value) => { node.value = value; node.dispatch('input'); };
    const pick = id => { q('.ai-context-prompt-select').value = id || record.id; q('.ai-context-prompt-select').dispatch('change'); };
    const open = async () => { click(messages.aiContextPromptReuse?.message || 'Use a saved prompt'); await settle(); };
    const preview = async values => {
        await open(); pick(); const variables = q('.ai-context-prompt-variables').querySelectorAll('textarea');
        Object.values(values || {}).forEach((value, i) => input(variables[i], value));
        click(messages.aiContextPromptPreview?.message || 'Preview replacement question');
    };
    return { host, q, button, click, input, pick, open, preview, view, controller, p, b, c, promptStore, record, document, events, calls, grants, copied,
        get creations() { return creations; }, setActive: value => { active = value; }, setGuard: value => { workCheck = value; }, setReply: value => { reply = value; } };
}
async function review(h, local = false) {
    if (!local) { h.input(h.q('.ai-context-endpoint'), 'https://mock.example/v1/chat/completions'); h.input(h.q('.ai-context-model'), 'synthetic'); }
    h.click(local ? 'Review prompt locally' : 'Review exact request'); await settle();
}
const quiet = h => { assert.equal(h.p.writes + h.b.writes + h.c.writes, 0); assert.equal(h.calls.length + h.grants.length + h.copied.length, 0); };

test('prompt picker is opt-in, reads once when opened, has no default selection and lazily uses the fenced global store', async () => {
    const h = await mount({ lazy: true }); assert.equal(h.p.reads, 0); assert.equal(h.creations, 0);
    await h.open(); assert.equal(h.p.reads, 1); assert.equal(h.creations, 1);
    assert.equal(h.q('.ai-context-prompt-select').value, ''); assert.equal(h.q('.ai-context-question').value, '');
    assert.equal(h.button('Replace this question').disabled, true); assert.equal(h.button('Preview replacement').disabled, true);
    assert.equal(h.host.querySelectorAll('b').length, 0); quiet(h);
});

test('select, fill and preview are session-only; explicit apply rereads and clears both request reviews', async () => {
    const h = await mount(); h.input(h.q('.ai-context-question'), 'Original question'); await review(h);
    const reviewed = h.controller.reviewed; await h.preview({ topic: '<script>literal</script> {{not-recursive}}' });
    assert.equal(h.controller.reviewed, reviewed); assert.equal(h.q('.ai-context-question').value, 'Original question');
    assert.equal(h.q('.ai-context-prompt-preview').textContent, 'Ask <script>literal</script> {{not-recursive}}');
    assert.equal(h.host.querySelectorAll('script').length, 0); quiet(h);
    h.click('Replace this question'); h.button('Replace this question').dispatch('click'); await settle();
    assert.equal(h.p.reads, 2); assert.equal(h.q('.ai-context-question').value, 'Ask <script>literal</script> {{not-recursive}}');
    assert.equal(h.controller.reviewed, null); assert.equal(h.controller.localReview, null);
    assert.equal(h.button('Send reviewed').disabled, true); assert.equal(h.button('Allow this endpoint').disabled, true);
    assert.equal(h.q('.ai-context-prompt-picker').hidden, true); assert.equal(h.document.activeElement, h.q('.ai-context-question')); quiet(h);
});

for (const delayedSave of [false, true]) test(`apply preserves selected hidden source edits, filters, output/stream, connection/key, old response provenance and save metadata (delayed save: ${delayedSave})`, { timeout: 10000 }, async () => {
    const h = await mount({ body: 'New question' }); h.input(h.q('.ai-context-question'), 'Old question');
    const source = h.q('.ai-context-source'), check = source.querySelector('input'); check.checked = true; check.dispatch('change'); h.input(source.querySelector('textarea'), 'Edited excerpt');
    await review(h); h.click('Send reviewed request'); await settle();
    const result = h.controller.result, resultReview = h.controller.resultReview; assert.ok(result);
    h.input(h.q('.ai-context-savetitle'), 'Previous answer title'); const consent = h.q('.ai-context-save-context').querySelector('input'); consent.checked = true; consent.dispatch('change');
    const stream = h.q('.ai-context-stream'); stream.checked = true; stream.dispatch('change'); h.input(h.q('.ai-context-key'), 'synthetic secret');
    h.input(h.q('.ai-context-source-search'), 'nothing'); await h.preview(); h.click('Replace this question'); await settle();
    assert.equal(check.checked, true); assert.equal(source.hidden, true); assert.equal(source.querySelector('textarea').value, 'Edited excerpt');
    assert.equal(h.q('.ai-context-source-search').value, 'nothing'); assert.equal(h.q('.ai-context-mode').value, 'answer'); assert.equal(stream.checked, true);
    assert.equal(h.q('.ai-context-model').value, 'synthetic'); assert.equal(h.q('.ai-context-endpoint').value, 'https://mock.example/v1/chat/completions'); assert.equal(h.q('.ai-context-key').value, 'synthetic secret');
    assert.equal(h.controller.result, result); assert.equal(h.controller.resultReview, resultReview); assert.equal(h.q('.ai-context-savetitle').value, 'Previous answer title'); assert.equal(consent.checked, true);
    assert.equal(h.q('.ai-context-previous-result').hidden, false); assert.equal(h.controller.answerSnapshot().question, 'Old question');
    assert.equal(h.calls.length, 1); assert.equal(h.p.writes + h.b.writes + h.c.writes, 0); assert.equal(h.grants.length + h.copied.length, 0);
    const entered = deferred(), release = deferred(), write = h.c.write.bind(h.c);
    if (delayedSave) h.c.write = async value => { entered.resolve(); await release.promise; return write(value); };
    // Wait for the exact operation started by the UI. A fixed number of event
    // loop turns says nothing about WebCrypto or a backend write completing.
    let saving;
    const saveAnswer = h.controller.saveAnswer.bind(h.controller);
    h.controller.saveAnswer = (...args) => { saving = saveAnswer(...args); return saving; };
    h.click('Save answer'); assert.ok(saving instanceof Promise, 'the click started a real save operation');
    if (delayedSave) {
        try {
            await entered.promise; await settle();
            assert.equal(h.controller.busy, true); assert.equal(h.controller.saved, false); assert.equal(h.c.writes, 0);
        } finally { release.resolve(); }
    }
    await saving; await settle();
    assert.equal(h.controller.busy, false); assert.equal(h.controller.saved, true); assert.equal(h.c.writes, 1);
    const saved = (await h.controller.collectionStore.read()).records[0]; assert.equal(saved.promptRef, null); assert.equal(saved.contextSnapshot.question, 'Old question');
});

for (const normalize of [false, true]) test(`raw CRLF/CR, final newline, Unicode and escaping survive preview, apply, budgets and both review paths (normalized DOM ${normalize})`, async () => {
    const body = '  😀\r\n\\{{literal}}\r{{__proto__}}|{{constructor}}|{{__proto__}}\r\n';
    const h = await mount({ body, normalize }); await h.preview({ first: '{{constructor}}', second: '<b>plain</b>' });
    const expected = '  😀\r\n{{literal}}\r{{constructor}}|<b>plain</b>|{{constructor}}\r\n';
    assert.equal(h.q('.ai-context-prompt-preview').textContent, expected.replace(/\r\n?/g, '\n')); assert.match(h.q('.ai-context-prompt-count').textContent, new RegExp(`${expected.length} / 4000`));
    h.click('Replace this question'); await settle(); assert.equal(h.q('.ai-context-question').value, normalize ? expected.replace(/\r\n?/g, '\n') : expected);
    assert.match(h.q('.ai-context-budget').textContent, new RegExp(`Question: ${expected.length} / 4000`));
    await review(h, true); assert.equal(h.controller.localReview.packed.question, expected);
    const local = h.controller.localReview.packed.prompt; h.click('Copy reviewed prompt'); await settle(); assert.deepEqual(h.copied, [local]);
    await review(h); assert.equal(h.controller.reviewed.packed.question, expected); assert.equal(JSON.parse(h.controller.reviewed.request.prompt.split('\n').at(-1)).question, expected);
    // A genuine input event, even at unchanged display text, owns the new draft.
    h.input(h.q('.ai-context-question'), h.q('.ai-context-question').value); await review(h, true);
    assert.equal(h.controller.localReview.packed.question, normalize ? expected.replace(/\r\n?/g, '\n') : expected);
});

for (const [name, body, expected] of [['exact ascii', 'x'.repeat(4000), true], ['over ascii', 'x'.repeat(4001), false], ['exact emoji', '😀'.repeat(2000), true], ['over emoji', '😀'.repeat(2000) + 'x', false], ['raw CRLF over', 'x'.repeat(3999) + '\r\n', false]]) {
    test(`${name}: exact UTF-16 replacement bound without truncation`, async () => {
        const h = await mount({ body, normalize: true }); await h.preview();
        assert.equal(h.q('.ai-context-prompt-preview').textContent, body.replace(/\r\n?/g, '\n')); assert.equal(h.button('Replace this question').disabled, !expected);
        if (expected) { h.click('Replace this question'); await settle(); await review(h, true); assert.equal(h.controller.localReview.packed.question, body); }
        else { h.button('Replace this question').dispatch('click'); await settle(); assert.equal(h.q('.ai-context-question').value, ''); }
        quiet(h);
    });
}

test('lone CR preview displays separate lines while its raw budget and applied question stay exact', async () => {
    const raw = 'first\rsecond\r\nthird\n', display = 'first\nsecond\nthird\n', h = await mount({ body: raw, normalize: true });
    await h.preview(); assert.equal(h.q('.ai-context-prompt-preview').textContent, display);
    assert.deepEqual(h.q('.ai-context-prompt-preview').textContent.split('\n'), ['first', 'second', 'third', '']);
    assert.match(h.q('.ai-context-prompt-count').textContent, new RegExp(`${raw.length} / 4000`));
    h.click('Replace this question'); await settle(); assert.equal(h.q('.ai-context-question').value, display);
    await review(h, true); assert.equal(h.controller.localReview.packed.question, raw); quiet(h);
    // Replacing the display with raw CR text is an unreviewed DOM change, even
    // though the underlying raw question would look semantically similar.
    await h.preview(); h.q('.ai-context-prompt-preview').textContent = raw; h.button('Replace this question').dispatch('click'); await settle();
    assert.equal(h.button('Replace this question').disabled, true); assert.equal(h.p.reads, 3); quiet(h);
});

test('a complete but whitespace-only expansion cannot replace a question', async () => {
    const h = await mount({ body: '{{topic}}' }); await h.preview({ topic: ' \r\n' });
    assert.equal(h.button('Replace this question').disabled, true); assert.match(h.q('.ai-context-prompt-status').textContent, /must contain text/);
    h.button('Replace this question').dispatch('click'); await settle(); assert.equal(h.q('.ai-context-question').value, ''); quiet(h);
});

test('missing variables differ from explicitly empty values; latest input requires a new preview', async () => {
    const h = await mount({ body: '{{topic}} tail' }); await h.open(); h.pick(); h.click('Preview replacement');
    assert.match(h.q('.ai-context-prompt-status').textContent, /Fill every variable/); assert.equal(h.button('Replace this question').disabled, true);
    h.click('Use an empty value'); h.click('Preview replacement'); assert.equal(h.q('.ai-context-prompt-preview').textContent, ' tail'); assert.equal(h.button('Replace this question').disabled, false);
    h.input(h.q('.ai-context-prompt-variables').querySelector('textarea'), 'new'); assert.equal(h.button('Replace this question').disabled, true); assert.equal(h.q('.ai-context-prompt-preview').hidden, true); quiet(h);
});

for (const change of ['body', 'metadata', 'archive', 'remove', 'version-id', 'identity']) test(`apply rechecks exact saved template: reject ${change}`, async () => {
    const h = await mount({ body: 'Old template' }); h.input(h.q('.ai-context-question'), 'Keep'); await h.preview();
    const raw = h.p.raw, record = raw.records[0];
    if (change === 'remove') raw.records = [];
    if (change === 'archive') record.deletedAt = record.updatedAt;
    if (change === 'body') record.body = record.history.at(-1).body = 'Changed';
    if (change === 'metadata') record.version = 'changed-version-token';
    if (change === 'version-id') record.currentVersionId = record.history.at(-1).id = 'changed-version-token';
    if (change === 'identity') record.id = 'changed-record-token';
    h.p.replace(raw); h.click('Replace this question'); await settle();
    assert.equal(h.q('.ai-context-question').value, 'Keep'); assert.equal(h.button('Replace this question').disabled, true);
    assert.match(h.q('.ai-context-prompt-status').textContent, /could not be verified unchanged/); quiet(h);
});

for (const point of ['list', 'apply']) for (const cause of ['read failure', 'workspace before', 'workspace after']) test(`${point}: ${cause} leaves question and reviews intact`, async () => {
    const h = await mount({ body: 'Template' }); h.input(h.q('.ai-context-question'), 'Keep'); await review(h, true); const ticket = h.controller.localReview;
    if (point === 'apply') await h.preview();
    if (cause === 'read failure') h.p.read = async () => { throw Error('synthetic read failure'); };
    if (cause === 'workspace before') h.setActive(false);
    if (cause === 'workspace after') { const read = h.p.read.bind(h.p); h.p.read = async () => { const state = await read(); h.setActive(false); return state; }; }
    if (point === 'list') await h.open(); else { h.click('Replace this question'); await settle(); }
    assert.equal(h.q('.ai-context-question').value, 'Keep'); assert.equal(h.controller.localReview, ticket); assert.equal(h.button('Replace this question').disabled, true);
    assert.match(h.q('.ai-context-prompt-status').textContent, /Could not verify|could not be verified/); quiet(h);
});

for (const point of ['list', 'apply']) for (const change of ['question', 'question-revert', 'source', 'mode', 'local-review', 'close', 'reopen', 'clear', 'destroy', 'hidden', 'detach', 'busy', 'save-uncertain', 'task-uncertain']) test(`${point}: late read after ${change} cannot change the question or newer feedback`, async () => {
    const h = await mount({ body: 'Replacement' }); h.input(h.q('.ai-context-question'), 'Keep');
    if (point === 'apply') await h.preview();
    const wait = deferred(), read = h.p.read.bind(h.p); let started = 0;
    h.p.read = async () => { started++; await wait.promise; return read(); };
    if (point === 'list') h.click('Use a saved prompt'); else h.click('Replace this question'); await settle(); assert.equal(started, 1);
    if (change.startsWith('question')) { h.input(h.q('.ai-context-question'), 'Newer edit'); if (change === 'question-revert') h.input(h.q('.ai-context-question'), 'Keep'); }
    if (change === 'source') { const input = h.q('.ai-context-source').querySelector('input'); input.checked = true; input.dispatch('change'); }
    if (change === 'mode') { h.q('.ai-context-mode').value = 'tasks'; h.q('.ai-context-mode').dispatch('change'); }
    if (change === 'local-review') { h.click('Review prompt locally'); await settle(); }
    if (change === 'close' || change === 'reopen') h.click('Close prompt picker');
    if (change === 'reopen') { h.p.read = read; await h.open(); }
    if (change === 'clear') h.click('Cancel / clear');
    if (change === 'destroy') h.view.destroy();
    if (change === 'hidden') { h.document.visibilityState = 'hidden'; await h.document.listeners.get('visibilitychange')(); }
    if (change === 'detach') h.host.remove();
    if (change === 'busy') h.controller.busy = true;
    if (change === 'save-uncertain') { h.controller.saveCommand = { operationId: 'synthetic' }; h.controller.saveUncertain = true; }
    if (change === 'task-uncertain') { h.controller.taskCommand = { operationId: 'synthetic' }; h.controller.taskUncertain = true; }
    const question = h.q('.ai-context-question'), value = question?.value, promptStatus = h.q('.ai-context-prompt-status'), feedback = promptStatus?.textContent;
    wait.resolve(); await settle(); if (question) assert.equal(question.value, value); if (promptStatus && !['busy', 'save-uncertain', 'task-uncertain', 'detach'].includes(change)) assert.equal(promptStatus.textContent, feedback);
    quiet(h);
});

test('changing visible variables or preview without events refuses stale apply', async () => {
    for (const target of ['variable', 'preview', 'selection', 'question']) {
        const h = await mount(); await h.preview({ topic: 'kept' });
        if (target === 'variable') h.q('.ai-context-prompt-variables').querySelector('textarea').value = 'raw mutation';
        if (target === 'preview') h.q('.ai-context-prompt-preview').textContent = 'raw mutation';
        if (target === 'selection') h.q('.ai-context-prompt-select').value = '';
        if (target === 'question') h.q('.ai-context-question').value = 'raw mutation';
        h.button('Replace this question').dispatch('click'); await settle(); assert.notEqual(h.q('.ai-context-question').value, 'Ask kept'); assert.equal(h.p.reads, 1); quiet(h);
    }
});

test('empty/archived-only library has no implicit fallback and reload/close never clear the question', async () => {
    const h = await mount({ empty: true }); h.input(h.q('.ai-context-question'), 'Keep'); await h.open();
    assert.match(h.q('.ai-context-prompt-status').textContent, /No unarchived/); assert.equal(h.q('.ai-context-prompt-select').querySelectorAll('option').length, 1);
    await h.promptStore.mutate(h.promptStore.request('add', { title: 'Archived synthetic', body: 'archived' })); const saved = (await h.promptStore.read()).records[0];
    await h.promptStore.mutate(h.promptStore.request('remove', { id: saved.id, version: saved.version })); h.p.writes = 0;
    h.click('Reload saved prompts'); await settle(); assert.equal(h.q('.ai-context-prompt-select').querySelectorAll('option').length, 1);
    h.click('Close prompt picker'); assert.equal(h.q('.ai-context-question').value, 'Keep'); assert.equal(h.document.activeElement, h.button('Use a saved prompt')); quiet(h);
});

for (const lock of ['transport', 'save', 'tasks']) test(`${lock} blocks opening and applying templates without bypassing existing locks`, async () => {
    const h = await mount({ body: 'Template' }); await h.preview();
    if (lock === 'transport') h.controller.busy = true;
    if (lock === 'save') { h.controller.saveCommand = {}; h.controller.saveUncertain = true; }
    if (lock === 'tasks') { h.controller.taskCommand = {}; h.controller.taskUncertain = true; }
    h.button('Replace this question').dispatch('click'); h.button('Use a saved prompt').dispatch('click'); await settle(); assert.equal(h.q('.ai-context-question').value, ''); assert.equal(h.p.reads, 1); quiet(h);
});

test('pending connection-preset load and a restore fence block the picker without a fallback store', async () => {
    const wait = deferred(), h = await mount({ body: 'Template', waitReady: false, presetStore: { read: () => wait.promise } }); await settle();
    assert.equal(h.button('Use a saved prompt').disabled, true); h.button('Use a saved prompt').dispatch('click'); await settle(); assert.equal(h.p.reads, 0);
    wait.resolve({ records: [] }); await h.view.ready; await h.open(); h.pick(); h.click('Preview replacement');
    h.p.lock = () => { throw Error('Synthetic complete-restore fence'); }; h.click('Replace this question'); await settle();
    assert.equal(h.q('.ai-context-question').value, ''); assert.match(h.q('.ai-context-prompt-status').textContent, /could not be verified/); quiet(h);
});

for (const locale of ['en', 'zh_CN']) test(`${locale}: localized picker preserves native-focus recovery and labels`, async () => {
    const h = await mount({ locale, body: 'Synthetic template' }), messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const launch = h.button(messages.aiContextPromptReuse.message); launch.focus(); await h.open();
    assert.equal(h.document.activeElement, h.q('.ai-context-prompt-search')); assert.equal(launch.getAttribute('aria-expanded'), 'true');
    h.pick(); h.click(messages.aiContextPromptPreview.message);
    assert.equal(h.q('.ai-context-prompt-preview').getAttribute('tabindex'), '0'); assert.ok(h.q('.ai-context-prompt-preview').getAttribute('aria-label'));
    const apply = h.button(messages.aiContextPromptApply.message), wait = deferred(), read = h.p.read.bind(h.p); h.p.read = async () => { await wait.promise; return read(); };
    apply.focus(); apply.dispatch('click'); assert.equal(h.document.activeElement, h.q('.ai-context-prompt-status'));
    h.click(messages.aiContextPromptClose.message); assert.equal(h.document.activeElement, launch); assert.equal(launch.getAttribute('aria-expanded'), 'false');
    wait.resolve(); await settle(); assert.equal(h.document.activeElement, launch); assert.equal(h.q('.ai-context-question').value, ''); quiet(h);
});

for (const window of ['first-read', 'second-guard', 'preview-ready']) test(`saved-library notification during ${window} invalidates without automatic reads or writes`, async () => {
    const h = await mount({ body: 'Old body' }); h.input(h.q('.ai-context-question'), 'Keep'); const wait = deferred();
    if (window === 'first-read') { const read = h.p.read.bind(h.p); h.p.read = async () => { await wait.promise; return read(); }; h.click('Use a saved prompt'); await settle(); }
    else { await h.preview(); if (window === 'second-guard') { let checks = 0; h.setGuard(async () => { if (++checks === 2) await wait.promise; }); h.click('Replace this question'); await settle(); } }
    assert.equal(h.p.listeners.length, 1);
    const reads = h.p.reads, raw = h.p.raw; raw.records[0].body = raw.records[0].history.at(-1).body = 'New body'; raw.records[0].version = 'new-version-token'; h.p.replace(raw); h.p.notify();
    assert.equal(h.p.reads, reads); assert.equal(h.q('.ai-context-question').value, 'Keep'); assert.equal(h.button('Replace this question').disabled, true); assert.equal(h.button('Preview replacement').disabled, true);
    assert.match(h.q('.ai-context-prompt-status').textContent, /library changed/); wait.resolve(); await settle(); assert.equal(h.q('.ai-context-question').value, 'Keep');
    assert.match(h.q('.ai-context-prompt-status').textContent, /library changed/); quiet(h);
});

test('closing unsubscribes; late old notifications cannot clear a reopened picker', async () => {
    const h = await mount({ body: 'Body' }); await h.preview(); const old = h.p.listeners[0]; h.click('Close prompt picker'); assert.equal(h.p.listeners.length, 0);
    await h.preview(); const before = h.q('.ai-context-prompt-preview').textContent, status = h.q('.ai-context-prompt-status').textContent; old();
    assert.equal(h.q('.ai-context-prompt-preview').textContent, before); assert.equal(h.q('.ai-context-prompt-status').textContent, status); assert.equal(h.button('Replace this question').disabled, false);
    h.view.destroy(); assert.equal(h.p.listeners.length, 0); quiet(h);
});

test('all prompt-picker labels have matching English/Chinese keys, no new permission or runtime dependency', () => {
    const source = fs.readFileSync('shared/ai-context-view.js', 'utf8'), keys = new Set([...source.matchAll(/(?:label|button)\('(Prompt\w+)'/g)].map(match => `aiContext${match[1]}`));
    for (const locale of ['en', 'zh_CN']) { const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8')); for (const key of keys) assert.ok(messages[key]?.message, `${locale}: ${key}`); }
    assert.doesNotMatch(source, /clipboard\.read|innerHTML|fetch\(/); assert.deepEqual(JSON.parse(fs.readFileSync('manifest.json', 'utf8')).permissions, ['storage', 'unlimitedStorage', 'identity', 'contextMenus']);
});

// Full-capacity synthetic titles use the same validated schema, without 200 writes.
function seedTitles(h, titles) {
    const raw = h.p.raw, base = raw.records[0];
    raw.records = titles.map((title, index) => {
        const record = structuredClone(base); record.id = `search-record-${index}`; record.currentVersionId = `search-version-${index}`;
        record.history[0].id = record.currentVersionId; record.title = title;
        return record;
    });
    h.p.replace(Prompts.validate(raw)); return raw.records;
}
const choices = h => h.q('.ai-context-prompt-select').querySelectorAll('option').filter(node => node.value).map(node => node.textContent);

test('title-only filtering at 200 templates is local, literal and never picks the only match', async () => {
    const h = await mount({ body: 'body-only needle' }), records = seedTitles(h, Array.from({ length: 200 }, (_, i) => i === 199 ? '<b>Unique synthetic title</b>' : `Template ${i}`));
    await h.open(); const raw = h.p.raw; assert.equal(choices(h).length, 200); assert.match(h.q('.ai-context-prompt-matches').textContent, /200 \/ 200/);
    h.input(h.q('.ai-context-prompt-search'), 'unique synthetic');
    assert.deepEqual(choices(h), ['<b>Unique synthetic title</b>']); assert.equal(h.host.querySelectorAll('b').length, 0);
    assert.match(h.q('.ai-context-prompt-matches').textContent, /1 \/ 200/); assert.equal(h.q('.ai-context-prompt-select').value, '');
    assert.equal(h.button('Preview replacement').disabled, true); assert.equal(h.button('Replace this question').disabled, true);
    h.q('.ai-context-prompt-search').dispatch('keydown', { key: 'Enter' }); assert.equal(h.q('.ai-context-question').value, '');
    h.input(h.q('.ai-context-prompt-search'), 'body-only needle'); assert.deepEqual(choices(h), []);
    h.pick(records[199].id); assert.equal(h.button('Preview replacement').disabled, true, 'hidden/stale choices are refused');
    assert.equal(h.p.reads, 1); assert.deepEqual(h.p.raw, raw); quiet(h);
});

const titleCases = [
    ['中文', '日报 中文 摘要', ' 中文 '], ['case', 'MiXeD Title', 'mIXed tITle'],
    ['spaces', 'Weekly   Summary', ' \tWEEKLY\u00a0 \nSUMMARY  '], ['width', 'ＡＢＣ　１２３', 'abc 123'],
    ['canonical Unicode', 'Café notes', 'CAFE\u0301'], ['emoji', 'Launch 😀 report', '😀'],
    ['brackets', 'Array [a-z] draft', '[a-z]'], ['regex characters', 'Literal .* +?$', '.*'],
    ['backslash', 'Path \\draft', '\\draft'], ['percent', '100% summary', '100%'],
    ['blank', 'Any title', ' \t\u3000 ']
];
for (const [name, title, query] of titleCases) test(`title filtering supports ${name} without changing stored/displayed titles`, async () => {
    const h = await mount(); seedTitles(h, [title]); await h.open(); h.input(h.q('.ai-context-prompt-search'), query);
    assert.deepEqual(choices(h), [title]); assert.equal(h.q('.ai-context-prompt-select').value, ''); assert.equal(h.p.reads, 1); quiet(h);
});

test('search does not match body, tags, category, tool, archived or recovery-only titles', async () => {
    const h = await mount({ body: 'BodyNeedle' }), raw = h.p.raw, base = raw.records[0];
    base.tags = ['TagNeedle']; base.category = 'CategoryNeedle'; base.tool = 'ToolNeedle';
    const archived = structuredClone(base); archived.id = 'archived-search-record'; archived.currentVersionId = archived.history[0].id = 'archived-search-version'; archived.title = 'ArchivedNeedle'; archived.deletedAt = archived.updatedAt;
    raw.records.push(archived);
    const recovery = structuredClone(base); recovery.id = 'recovery-search-record'; recovery.currentVersionId = recovery.history[0].id = 'recovery-search-version'; recovery.title = 'RecoveryNeedle';
    raw.recovery.push({ id: 'search-recovery-copy', createdAt: base.createdAt, content: { records: [recovery] } });
    h.p.replace(Prompts.validate(raw)); await h.open();
    for (const query of ['BodyNeedle', 'TagNeedle', 'CategoryNeedle', 'ToolNeedle', 'ArchivedNeedle', 'RecoveryNeedle', '.*']) {
        h.input(h.q('.ai-context-prompt-search'), query); assert.deepEqual(choices(h), []); assert.match(h.q('.ai-context-prompt-status').textContent, /No template titles match/);
    }
    assert.equal(h.p.reads, 1); quiet(h);
});

test('filter changes and clear invalidate selection, variables and preview, retaining question and existing review', async () => {
    const h = await mount(); h.input(h.q('.ai-context-question'), 'Keep question'); await review(h, true); const ticket = h.controller.localReview;
    await h.preview({ topic: 'Previous value' }); assert.equal(h.button('Replace this question').disabled, false);
    h.q('.ai-context-prompt-search').focus(); h.input(h.q('.ai-context-prompt-search'), 'Synthetic');
    assert.equal(h.document.activeElement, h.q('.ai-context-prompt-search')); assert.equal(h.q('.ai-context-prompt-select').value, '');
    assert.equal(h.q('.ai-context-prompt-variables').children.length, 0); assert.equal(h.q('.ai-context-prompt-preview').hidden, true);
    h.button('Replace this question').dispatch('click'); await settle(); assert.equal(h.p.reads, 1);
    h.pick(); assert.equal(h.q('.ai-context-prompt-variables').querySelector('textarea').value, ''); h.click('Preview replacement');
    assert.match(h.q('.ai-context-prompt-status').textContent, /Fill every variable/);
    h.button('Clear template search').focus(); h.click('Clear template search');
    assert.equal(h.document.activeElement, h.q('.ai-context-prompt-search')); assert.equal(h.q('.ai-context-prompt-search').value, '');
    assert.equal(h.q('.ai-context-prompt-select').value, ''); assert.equal(h.button('Clear template search').disabled, true);
    assert.equal(h.q('.ai-context-question').value, 'Keep question'); assert.equal(h.controller.localReview, ticket); quiet(h);
});

for (const locale of ['en', 'zh_CN']) test(`${locale}: search labels, no-match feedback, clear/close/reopen focus and empty library`, async () => {
    const h = await mount({ locale }), messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    await h.open(); const search = h.q('.ai-context-prompt-search'); assert.equal(h.document.activeElement, search);
    assert.equal(search.type, 'text'); assert.equal(search.parentElement.tagName, 'LABEL'); assert.ok(search.parentElement.textContent.includes(messages.aiContextPromptSearch.message));
    assert.equal(search.getAttribute('aria-describedby'), 'ai-context-prompt-search-help');
    h.input(search, 'no match'); assert.equal(h.q('.ai-context-prompt-status').textContent, messages.aiContextPromptNoMatches.message);
    assert.match(h.q('.ai-context-prompt-matches').textContent, /0 \/ 1/); assert.equal(h.q('.ai-context-prompt-select').value, '');
    h.click(messages.aiContextPromptSearchReset.message); assert.equal(h.document.activeElement, search);
    h.input(search, 'Synthetic'); h.click(messages.aiContextPromptClose.message);
    assert.equal(h.document.activeElement, h.button(messages.aiContextPromptReuse.message)); assert.equal(search.value, '');
    await h.open(); assert.equal(search.value, ''); assert.equal(h.q('.ai-context-prompt-select').value, ''); quiet(h);
    const empty = await mount({ locale, empty: true }); await empty.open(); empty.input(empty.q('.ai-context-prompt-search'), 'anything');
    assert.equal(empty.q('.ai-context-prompt-status').textContent, messages.aiContextPromptEmpty.message); assert.match(empty.q('.ai-context-prompt-matches').textContent, /0 \/ 0/); quiet(empty);
});

test('search belongs to the host draft signature, including query-only changes without an input event', async () => {
    const h = await mount(); await h.open(); assert.equal(h.view.hasUncommittedWork(), true);
    const current = h.view.captureDraft(); assert.equal(current(), true);
    h.q('.ai-context-prompt-search').value = 'changed without event'; assert.equal(current(), false);
    h.input(h.q('.ai-context-prompt-search'), ''); assert.equal(current(), false, 'an edited/reverted search still owns a new picker epoch'); quiet(h);
});

for (const signal of ['tracked composition', 'isComposing', 'keyCode 229']) test(`${signal}: search Escape stays with the IME; ordinary Escape reaches the host`, async () => {
    const h = await mount(); await h.open(); const search = h.q('.ai-context-prompt-search'); h.input(search, '中文');
    let escapes = 0; h.host.addEventListener('keydown', event => { if (event.key === 'Escape') escapes++; });
    if (signal === 'tracked composition') search.dispatch('compositionstart');
    const event = search.dispatch('keydown', { key: 'Escape', isComposing: signal === 'isComposing', keyCode: signal === 'keyCode 229' ? 229 : 27 });
    assert.equal(event.stopped, true); assert.equal(event.prevented, false); assert.equal(escapes, 0); assert.equal(search.value, '中文');
    search.dispatch('compositionend'); const ordinary = search.dispatch('keydown', { key: 'Escape' });
    assert.equal(ordinary.stopped, false); assert.equal(escapes, 1); quiet(h);
});

for (const lock of ['busy', 'save uncertain', 'task uncertain']) for (const focused of ['search', 'reset']) test(`${lock}, focused ${focused}: search and reset cannot bypass the existing locks`, async () => {
    const h = await mount({ body: 'Keep template' }); await h.preview(); h.input(h.q('.ai-context-prompt-search'), 'Synthetic');
    (focused === 'search' ? h.q('.ai-context-prompt-search') : h.button('Clear template search')).focus();
    if (lock === 'busy') h.controller.busy = true;
    if (lock === 'save uncertain') { h.controller.saveCommand = {}; h.controller.saveUncertain = true; }
    if (lock === 'task uncertain') { h.controller.taskCommand = {}; h.controller.taskUncertain = true; }
    h.input(h.q('.ai-context-question'), 'Keep question'); // Existing update path paints the lock.
    assert.equal(h.q('.ai-context-prompt-search').disabled, true); assert.equal(h.button('Clear template search').disabled, true);
    assert.equal(h.document.activeElement, h.q('.ai-context-prompt-status'), 'focus leaves a disabled filter control safely');
    const oldChoices = choices(h), oldStatus = h.q('.ai-context-prompt-status').textContent;
    h.input(h.q('.ai-context-prompt-search'), 'No match'); h.button('Clear template search').dispatch('click');
    assert.equal(h.q('.ai-context-prompt-search').value, 'No match'); assert.deepEqual(choices(h), oldChoices); assert.equal(h.q('.ai-context-prompt-status').textContent, oldStatus);
    assert.equal(h.p.reads, 1); assert.equal(h.q('.ai-context-question').value, 'Keep question'); quiet(h);
});

for (const point of ['list', 'apply']) test(`${point}: programmatic query changes during a pending read invalidate the operation`, async () => {
    const h = await mount({ body: 'Replacement' }); h.input(h.q('.ai-context-question'), 'Keep');
    if (point === 'apply') await h.preview();
    const wait = deferred(), read = h.p.read.bind(h.p); h.p.read = async () => { await wait.promise; return read(); };
    h.click(point === 'list' ? 'Use a saved prompt' : 'Replace this question'); await settle();
    assert.equal(h.q('.ai-context-prompt-search').disabled, true); assert.equal(h.button('Clear template search').disabled, true);
    h.q('.ai-context-prompt-search').value = 'new raw query'; wait.resolve(); await settle();
    assert.equal(h.q('.ai-context-question').value, 'Keep'); assert.equal(h.button('Replace this question').disabled, true); quiet(h);
});

test('query-only DOM tampering cannot apply an earlier preview', async () => {
    const h = await mount({ body: 'Replacement' }); h.input(h.q('.ai-context-question'), 'Keep'); await h.preview();
    h.q('.ai-context-prompt-search').value = 'different filter'; h.button('Replace this question').dispatch('click'); await settle();
    assert.equal(h.q('.ai-context-question').value, 'Keep'); assert.equal(h.p.reads, 1); quiet(h);
});

test('library notification clears counts and preview, preserves filter, disables filter actions and requires explicit reload', async () => {
    const h = await mount(); await h.open(); h.input(h.q('.ai-context-prompt-search'), 'Synthetic'); h.pick();
    h.input(h.q('.ai-context-prompt-variables').querySelector('textarea'), 'Value'); h.click('Preview replacement');
    h.q('.ai-context-prompt-search').focus(); h.p.notify();
    assert.equal(h.document.activeElement, h.q('.ai-context-prompt-status')); assert.equal(h.q('.ai-context-prompt-search').value, 'Synthetic');
    assert.equal(h.q('.ai-context-prompt-search').disabled, true); assert.equal(h.button('Clear template search').disabled, true);
    assert.equal(h.q('.ai-context-prompt-matches').hidden, true); assert.equal(h.q('.ai-context-prompt-preview').hidden, true);
    h.q('.ai-context-prompt-search').dispatch('input'); h.button('Clear template search').dispatch('click');
    assert.match(h.q('.ai-context-prompt-status').textContent, /library changed/); assert.equal(h.p.reads, 1);
    h.click('Reload saved prompts'); await settle(); assert.equal(h.p.reads, 2); assert.equal(h.q('.ai-context-prompt-search').value, 'Synthetic');
    assert.equal(h.document.activeElement, h.q('.ai-context-prompt-search')); assert.equal(h.q('.ai-context-prompt-select').value, ''); assert.match(h.q('.ai-context-prompt-matches').textContent, /1 \/ 1/); quiet(h);
});

test('failed reload keeps the filter and readable diagnostic; retry and outside focus stay explicit', async () => {
    const h = await mount(); await h.open(); h.input(h.q('.ai-context-prompt-search'), 'Synthetic'); const read = h.p.read.bind(h.p);
    h.p.read = async () => { throw Error('Synthetic failure'); }; h.click('Reload saved prompts'); await settle();
    assert.equal(h.q('.ai-context-prompt-search').value, 'Synthetic'); assert.equal(h.q('.ai-context-prompt-search').disabled, true);
    assert.equal(h.document.activeElement, h.q('.ai-context-prompt-status')); assert.equal(h.q('.ai-context-prompt-matches').hidden, true);
    h.button('Clear template search').dispatch('click'); assert.match(h.q('.ai-context-prompt-status').textContent, /Could not verify/);
    const wait = deferred(); h.p.read = async () => { await wait.promise; return read(); }; h.click('Reload saved prompts'); await settle();
    h.q('.ai-context-question').focus(); wait.resolve(); await settle(); assert.equal(h.document.activeElement, h.q('.ai-context-question'));
    assert.equal(h.q('.ai-context-prompt-search').disabled, false); assert.deepEqual(choices(h), ['<b>Synthetic template</b>']); quiet(h);
});

test('leaving an interrupted search composition does not swallow a later ordinary Escape', async () => {
    const h = await mount(); await h.open(); const search = h.q('.ai-context-prompt-search');
    search.dispatch('compositionstart'); search.dispatch('focusout'); search.focus();
    let escapes = 0; h.host.addEventListener('keydown', event => { if (event.key === 'Escape') escapes++; });
    assert.equal(search.dispatch('keydown', { key: 'Escape' }).stopped, false); assert.equal(escapes, 1); quiet(h);
});
