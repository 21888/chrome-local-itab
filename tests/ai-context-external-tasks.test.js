const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { webcrypto } = require('node:crypto'); global.crypto ||= webcrypto;
const { createDocument, deferred } = require('./helpers/task-dom-model');
const Context = require('../shared/ai-context'), Tasks = require('../shared/local-tasks-store'), Collections = require('../shared/local-ai-collections-store');
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
const json = values => JSON.stringify({ tasks: values });
function backend() {
    let raw, queue = Promise.resolve();
    return { reads: 0, writes: 0, fail: null, readFailure: false,
        lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() { this.reads++; if (this.readFailure) { this.readFailure = false; throw Error('synthetic read'); } return structuredClone(raw); },
        async write(value) {
            this.writes++; const fail = this.fail; this.fail = null;
            if (fail === 'before') throw Error('synthetic before write');
            raw = structuredClone(value);
            if (fail === 'after') throw Error('synthetic after write');
            if (fail === 'readback') this.readFailure = true;
        }, subscribe: () => () => {} };
}
function setup() {
    const b = backend(), c = backend(), calls = { network: 0, permissions: 0 };
    let active = true, gate = null;
    const ensureActive = async () => { if (gate) await gate.promise; if (!active) throw Context.fault('WORKSPACE_INVALIDATED'); };
    const store = new Tasks.Store(Context.guardedBackend(b, ensureActive));
    const controller = new Context.Controller({ taskStore: store, collectionStore: new Collections.Store(Context.guardedBackend(c, ensureActive)), ensureActive,
        readSources: async () => [{ id: 'collection:synthetic', label: 'Synthetic source', text: 'Synthetic excerpt', scope: 'library' }],
        transport: { review: input => ({ ...input, origin: 'https://synthetic.example', permission: 'https://synthetic.example:443/*' }),
            run: async () => { calls.network++; return { text: json(['Provider task']) }; } },
        permissions: { request: async () => { calls.permissions++; return true; }, contains: async () => { calls.permissions++; return true; } } });
    return { controller, store, b, c, calls, deactivate: () => { active = false; },
        hold() { gate = deferred(); const ticket = gate; return () => { gate = null; ticket.resolve(); }; } };
}
const load = (h, text = json(['first', 'second']), options = {}) => h.controller.loadExternalTasks(text, { mode: 'tasks', ...options });
async function ui(options = {}) {
    const h = setup(), document = createDocument(), host = document.createElement('main'); document.body.append(host);
    const events = new Map(), confirmations = []; let confirm = () => true;
    const window = { document, confirm: message => { confirmations.push(message); return confirm(); },
        addEventListener: (type, fn) => events.set(type, fn), removeEventListener: type => events.delete(type) };
    vm.runInNewContext(fs.readFileSync('shared/ai-context-view.js', 'utf8'), { window });
    const view = window.LocalItabAIContextView.mount(host, { controller: h.controller, presetStore: null, ...options }); await view.ready;
    const button = text => host.querySelectorAll('button').find(item => item.textContent.startsWith(text));
    const input = (node, value) => { node.value = value; node.dispatch('input'); };
    const mode = value => { const node = host.querySelector('.ai-context-mode'); node.value = value; node.dispatch('change'); };
    return { ...h, document, host, view, events, confirmations, button, input, mode, setConfirm: fn => { confirm = fn; },
        external: host.querySelector('.ai-context-external-input'), panel: host.querySelector('.ai-context-external-tasks'),
        output: host.querySelectorAll('textarea').find(item => item.rows === 8),
        click(text) { const node = button(text); assert(node, text); assert(!node.disabled, `${text} enabled`); node.dispatch('click'); } };
}
async function loadedUI(text = json(['first', 'second'])) {
    const h = await ui(); h.mode('tasks'); h.panel.open = true; h.input(h.external, text); h.click('Load task'); await settle(); return h;
}

test('external task JSON uses the existing parser, stays volatile and has no fabricated model provenance', async () => {
    const h = setup(), source = json([' 😀 中文 ', '<a href="javascript:alert(1)">literal</a>', 'https://example.invalid', 'same', 'same']);
    const result = await load(h, source);
    assert.deepEqual(result, { text: source, mode: 'tasks', provenance: 'external' });
    assert.equal(h.controller.resultReview, null); assert.equal(h.controller.reviewed, null); assert.equal(h.controller.localReview, null);
    assert.deepEqual(h.controller.taskCandidates().texts, JSON.parse(source).tasks);
    assert.throws(() => h.controller.answerSnapshot(), { code: 'STALE' });
    await assert.rejects(h.controller.saveAnswer('Never saved', { includeContext: true }), { code: 'STALE' });
    assert.deepEqual(h.calls, { network: 0, permissions: 0 }); assert.equal(h.b.writes + h.c.writes, 0);
    await h.controller.reviewLocal({ question: 'Unrelated next draft', selected: [], mode: 'answer' });
    assert.equal(h.controller.result, result); assert.equal(h.controller.resultReview, null);
});
test('external parser rejects malformed, dangerous extra keys, nesting, empty, multiline, invalid Unicode and all bounds without replacing a draft', async () => {
    const invalid = ['', 'null', '[]', '{', '```json\n{"tasks":["x"]}\n```', '{"tasks":["x"],"__proto__":{}}',
        '{"tasks":["x"],"constructor":{}}', '{"tasks":["x"],"prototype":{}}', '{"tasks":[],"execute":true}', json([]), json([null]), json([1]), json([{}]),
        json(['']), json(['  ']), json(['a\nb']), json(['a\rb']), json(['a\u2028b']), json(['a\u2029b']), json(['\ud800']), json(['\udc00']),
        json(['x'.repeat(1001)]), json(['😀'.repeat(501)]), json(Array(51).fill('x')), ' '.repeat(32000) + json(['x'])];
    for (const source of invalid) {
        const h = setup(); await load(h); h.controller.selectTask(1, false, h.controller.result); await h.controller.reviewTasks();
        const before = [h.controller.result, h.controller.taskSelection, h.controller.taskReview, h.controller.generation];
        await assert.rejects(load(h, source, { replaceUnsaved: true }));
        assert.deepEqual([h.controller.result, h.controller.taskSelection, h.controller.taskReview, h.controller.generation], before);
        assert.equal(h.b.writes + h.c.writes, 0);
    }
    const h = setup(); await load(h, json(Array(50).fill('😀'.repeat(300)))) ;
    assert.equal(h.controller.taskCandidates().texts.length, 50);
});
test('external load requires tasks mode and explicit replacement; existing review is unchanged on refusal', async () => {
    const h = setup(); await assert.rejects(h.controller.loadExternalTasks(json(['x']), { mode: 'answer' }), { code: 'STALE' });
    await load(h); const result = h.controller.result; await h.controller.reviewTasks(); const review = h.controller.taskReview;
    await assert.rejects(load(h, json(['replacement'])), { code: 'UNSAVED_RESULT' });
    assert.equal(h.controller.result, result); assert.equal(h.controller.taskReview, review);
    await load(h, json(['replacement']), { replaceUnsaved: true }); assert.equal(h.controller.taskReview, null);
});
test('late external load rejects changed ownership and concurrent loads cannot replace each other', async () => {
    for (const kind of ['edit', 'close', 'workspace', 'selection', 'superseded', 'caller']) {
        const h = setup(); await load(h); const old = h.controller.result, release = h.hold(); let current = true;
        const loading = load(h, json(['late']), { replaceUnsaved: true, isCurrent: () => current });
        let newer;
        if (kind === 'edit') h.controller.edit();
        if (kind === 'close') h.controller.close();
        if (kind === 'workspace') h.deactivate();
        if (kind === 'selection') h.controller.selectTask(1, false, old);
        if (kind === 'caller') current = false;
        if (kind === 'superseded') newer = load(h, json(['newer']), { replaceUnsaved: true });
        release();
        if (newer) { await loading; await assert.rejects(newer, { code: 'STALE' }); }
        else { await assert.rejects(loading); assert.equal(h.controller.result, kind === 'close' ? null : old); }
        assert.equal(h.b.writes + h.c.writes, 0);
    }
});
test('selected external tasks append through real store with active, done, removed, recovery and pin preserved', async () => {
    const h = setup(), store = h.store;
    let state = await store.mutate(store.request('addBatch', { texts: ['Existing active', 'Existing done', 'Existing removed'] }));
    for (const [index, kind] of [[1, 'complete'], [2, 'remove']]) state = await store.mutate(store.request(kind, { id: state.records[index].id, version: state.records[index].version }));
    state = await store.mutate(store.request('pin', { id: state.records[0].id, version: state.records[0].version, expectedPin: null }));
    state = await store.mutate(store.request('replace', await store.review(await store.export())));
    assert.equal(state.recovery.length, 1); const writes = h.b.writes;
    await load(h, json(['same', 'unselected', 'same', ' 😀 ', 'javascript:literal']));
    h.controller.selectTask(1, false, h.controller.result);
    const review = await h.controller.reviewTasks(); assert.deepEqual(review.texts, ['same', 'same', ' 😀 ', 'javascript:literal']);
    assert.equal(h.b.writes, writes);
    const saving = h.controller.confirmTasks(); await assert.rejects(h.controller.confirmTasks(), { code: 'STALE' }); await saving;
    const after = await store.read(); assert.equal(h.b.writes, writes + 1); assert.deepEqual(after.records.slice(0, 3), state.records);
    assert.deepEqual(after.recovery, state.recovery); assert.equal(after.pinnedId, state.pinnedId); assert.equal(after.enabled, state.enabled);
    assert.deepEqual(after.records.slice(3).map(item => item.text), review.texts);
    for (const record of after.records) assert.deepEqual(Object.keys(record).sort(), ['createdAt', 'id', 'removedFrom', 'state', 'text', 'updatedAt', 'version']);
    assert.doesNotMatch(await store.export(), /provenance|contextSnapshot|resultReview|synthetic\.example/);
    assert.equal(h.c.writes, 0); assert.deepEqual(h.calls, { network: 0, permissions: 0 });
});
test('manual control characters and capacity are checked by the existing store without writes', async () => {
    const h = setup(); await load(h, json(['bad\u0000line'])); await assert.rejects(h.controller.reviewTasks()); assert.equal(h.b.writes, 0);
    await h.store.mutate(h.store.request('addBatch', { texts: Array(500).fill('Existing') }));
    await load(h, json(['Overflow']), { replaceUnsaved: true }); await assert.rejects(h.controller.reviewTasks(), { code: 'CAPACITY' });
    assert.equal(h.b.writes, 1); assert.equal((await h.store.read()).records.length, 500);
});
test('manual review fences newer task revision and workspace invalidation before a write', async () => {
    for (const kind of ['revision', 'workspace']) {
        const h = setup(); await load(h); await h.controller.reviewTasks();
        if (kind === 'revision') await h.store.mutate(h.store.request('add', { text: 'Other tab' })); else h.deactivate();
        const writes = h.b.writes;
        await assert.rejects(h.controller.confirmTasks(), { code: kind === 'revision' ? 'CONFLICT' : 'WORKSPACE_INVALIDATED' });
        assert.equal(h.b.writes, writes);
    }
});
test('manual final confirmation rechecks workspace inside a queued store lock', async () => {
    const h = setup(); await load(h); await h.controller.reviewTasks();
    const gate = deferred(), occupied = h.b.lock(() => gate.promise), saving = h.controller.confirmTasks();
    h.deactivate(); gate.resolve(); await occupied;
    await assert.rejects(saving, { code: 'WORKSPACE_INVALIDATED' }); assert.equal(h.b.writes, 0);
});
for (const fail of ['before', 'after', 'readback']) test(`manual ${fail} failure retains operation identity and blocks replacement before idempotent retry`, async () => {
    const h = setup(); await load(h); await h.controller.reviewTasks(); const command = h.controller.taskReview.command;
    h.b.fail = fail; await assert.rejects(h.controller.confirmTasks()); assert.equal(h.controller.taskUncertain, true);
    assert.equal(h.controller.taskCommand, command); const result = h.controller.result;
    await assert.rejects(load(h, json(['Never replace']), { replaceUnsaved: true }), { code: 'STALE' });
    assert.equal(h.controller.result, result); assert.equal(h.controller.taskCommand, command);
    await h.controller.confirmTasks(); assert.equal((await h.store.read()).records.length, 2);
    assert.equal(h.b.writes, fail === 'before' ? 2 : 1); assert.equal(h.controller.taskCommand, null);
});
test('manual committed-write verification preserves the identical selected batch with no new writes', async () => {
    const h = setup(); await load(h); h.controller.selectTask(0, false, h.controller.result); await h.controller.reviewTasks();
    h.b.fail = 'after'; await assert.rejects(h.controller.confirmTasks());
    await h.controller.verifyTaskBatch(); assert.equal(h.b.writes, 1);
    assert.deepEqual((await h.store.read()).records.map(item => item.text), ['second']); assert.equal(h.controller.result, null);
});

test('UI manual paste works with blank connection/question and never parses until explicit load', async () => {
    const h = await ui(); assert.equal(h.panel.hidden, false); h.mode('tasks'); h.panel.open = true;
    h.input(h.external, json(['<b>literal</b>', 'https://example.invalid', 'same', 'same']));
    assert.equal(h.controller.result, null); assert.equal(h.host.querySelector('.ai-context-task-selection').hidden, true);
    assert.equal(h.view.hasUncommittedWork(), true); assert.equal(h.b.writes + h.c.writes, 0);
    h.click('Load task'); await settle(); assert.equal(h.external.value, ''); assert.equal(h.controller.result.provenance, 'external');
    assert.equal(h.controller.resultReview, null); assert.match(h.host.querySelector('.ai-context-previous-result').textContent, /not linked/);
    assert.equal(h.host.querySelector('.ai-context-previous-result').hidden, false);
    assert.equal(h.host.querySelector('.ai-context-save-context').hidden, true); assert.equal(h.button('Save answer').hidden, true);
    assert.equal(h.host.querySelectorAll('a,b,script').length, 0);
    const choices = h.host.querySelector('.ai-context-task-choices').querySelectorAll('input'); choices[2].checked = false; choices[2].dispatch('change');
    h.click('Review extracted'); await settle(); assert.equal(h.b.writes, 0);
    h.click('Add these'); await settle(); assert.equal(h.b.writes, 1);
    assert.deepEqual((await h.store.read()).records.map(item => item.text), ['<b>literal</b>', 'https://example.invalid', 'same']);
    assert.deepEqual(h.calls, { network: 0, permissions: 0 });
});
test('UI invalid external JSON keeps pasted input and previous response/selection/review intact', async () => {
    const h = await loadedUI(); h.click('Review extracted'); await settle();
    const before = [h.controller.result, h.controller.taskSelection, h.controller.taskReview, h.output.value];
    h.input(h.external, '{"tasks":[]}'); h.click('Load task'); await settle();
    assert.equal(h.external.value, '{"tasks":[]}'); assert.deepEqual([h.controller.result, h.controller.taskSelection, h.controller.taskReview, h.output.value], before);
    assert.equal(h.b.writes + h.c.writes, 0);
});
test('UI oversized JSON is never truncated into valid input and remains available for repair', async () => {
    const h = await ui(); h.mode('tasks');
    assert.equal(h.external.maxLength, undefined);
    const source = json(['short task']) + ' '.repeat(32000); h.input(h.external, source); h.click('Load task'); await settle();
    assert.equal(h.external.value, source); assert.equal(h.controller.result, null);
    assert.match(h.host.querySelector('.ai-context-status').textContent, /32,000 total/); assert.equal(h.b.writes + h.c.writes, 0);
});
test('UI replacing a provider answer is explicit and canceled loading preserves original snapshot consent and title', async () => {
    const h = await ui(); h.input(h.host.querySelector('.ai-context-question'), 'Original provider question');
    h.input(h.host.querySelector('.ai-context-endpoint'), 'https://synthetic.example/v1/chat/completions');
    h.input(h.host.querySelector('.ai-context-model'), 'synthetic-model');
    h.click('Review exact'); await settle(); h.click('Send reviewed'); await settle();
    const snapshot = h.controller.answerSnapshot(), original = h.controller.result, originalReview = h.controller.resultReview;
    const option = h.host.querySelector('.ai-context-save-context').querySelector('input'); option.checked = true; option.dispatch('change');
    const title = h.host.querySelector('.ai-context-savetitle'); h.input(title, 'My original title');
    h.mode('tasks'); h.input(h.external, json(['external replacement'])); h.setConfirm(() => false);
    h.click('Load task'); await settle(); assert.equal(h.controller.result, original); assert.equal(h.controller.resultReview, originalReview);
    assert.equal(option.checked, true); assert.equal(title.value, 'My original title'); assert.deepEqual(h.controller.answerSnapshot(), snapshot);
    h.setConfirm(() => true); h.click('Load task'); await settle();
    assert.equal(h.controller.result.provenance, 'external'); assert.equal(h.controller.resultReview, null); assert.equal(option.checked, false);
    assert.equal(h.b.writes + h.c.writes, 0); assert.equal(h.calls.network, 1);
});
test('UI external replacement cancellation preserves selected result, request review and newly edited drafts', async () => {
    for (const accepted of [false, true]) {
        const h = await loadedUI(); h.click('Review extracted'); await settle();
        const before = [h.controller.result, h.controller.taskSelection, h.controller.taskReview, h.output.value];
        h.input(h.external, json(['replacement']));
        h.setConfirm(() => { h.input(h.external, json(['newer while confirming'])); return accepted; });
        h.click('Load task'); await settle();
        assert.deepEqual([h.controller.result, h.controller.taskSelection, h.controller.taskReview, h.output.value], before);
        assert.equal(h.external.value, json(['newer while confirming'])); assert.equal(h.b.writes + h.c.writes, 0);
    }
});
test('UI unloaded external draft participates in close capture and guarded clear', async () => {
    const h = await ui(); h.mode('tasks'); h.input(h.external, json(['draft']));
    const current = h.view.captureDraft(); h.input(h.external, json(['new draft'])); assert.equal(current(), false);
    h.setConfirm(() => false); h.click('Cancel / clear'); assert.equal(h.external.value, json(['new draft']));
    h.setConfirm(() => { h.input(h.external, json(['edited during clear'])); return true; });
    h.click('Cancel / clear'); assert.equal(h.external.value, json(['edited during clear']));
    h.setConfirm(() => true); h.click('Cancel / clear'); assert.equal(h.external.value, ''); assert.equal(h.view.hasUncommittedWork(), false);
    h.input(h.external, json(['close'])); h.view.destroy(); assert.equal(h.external.value, ''); assert.equal(h.controller.result, null);
    assert.equal(h.b.writes + h.c.writes, 0);
});
test('UI mode, question, connection, source, hidden, input and close changes fence pending manual loads', async () => {
    for (const kind of ['mode', 'question', 'connection', 'source', 'hidden', 'input', 'close', 'workspace']) {
        const h = await ui(); h.mode('tasks'); h.panel.open = true; h.input(h.external, json(['late']));
        const release = h.hold(); h.click('Load task'); assert.equal(h.external.disabled, true);
        if (kind === 'mode') h.mode('answer');
        if (kind === 'question') h.input(h.host.querySelector('.ai-context-question'), 'new question');
        if (kind === 'connection') h.input(h.host.querySelector('.ai-context-endpoint'), 'https://other.invalid/v1/chat/completions');
        if (kind === 'source') h.controller.edit();
        if (kind === 'input') h.input(h.external, json(['new draft']));
        if (kind === 'hidden') { h.document.visibilityState = 'hidden'; await h.document.listeners.get('visibilitychange')(); h.document.visibilityState = 'visible'; }
        if (kind === 'close') h.view.destroy();
        if (kind === 'workspace') h.deactivate();
        release(); await settle(); assert.equal(h.controller.result, null); assert.equal(h.b.writes + h.c.writes, 0);
        if (kind !== 'close') assert.equal(h.external.value, json([kind === 'input' ? 'new draft' : 'late']));
    }
});
test('UI close and reopen discards external text and rejects the earlier load', async () => {
    const h = await ui(); h.mode('tasks'); h.input(h.external, json(['old panel']));
    const release = h.hold(); h.click('Load task'); h.view.destroy();
    const next = await ui(); release(); await settle();
    assert.equal(h.external.value, ''); assert.equal(h.controller.result, null);
    assert.equal(next.external.value, ''); assert.equal(next.controller.result, null); assert.equal(next.view.hasUncommittedWork(), false);
    assert.equal(h.b.writes + next.b.writes + h.c.writes + next.c.writes, 0);
});
test('UI edits after manual load invalidate final review but retain honest external provenance', async () => {
    for (const kind of ['mode', 'question', 'connection', 'source', 'reload']) {
        const h = await loadedUI(); h.click('Review extracted'); await settle(); assert(h.controller.taskReview);
        if (kind === 'mode') h.mode('answer');
        if (kind === 'question') h.input(h.host.querySelector('.ai-context-question'), 'new question');
        if (kind === 'connection') h.input(h.host.querySelector('.ai-context-model'), 'new model');
        if (kind === 'source') { const node = h.host.querySelector('.ai-context-source').querySelector('input'); node.checked = true; node.dispatch('change'); }
        if (kind === 'reload') { h.click('Reload saved sources'); await settle(); }
        assert.equal(h.controller.taskReview, null); assert.equal(h.button('Add these').disabled, true);
        assert.equal(h.controller.result.provenance, 'external'); assert.equal(h.controller.resultReview, null);
        assert.match(h.host.querySelector('.ai-context-previous-result').textContent, /Manually pasted/); assert.equal(h.b.writes + h.c.writes, 0);
    }
});
test('UI manual uncertain batch locks pasted replacement and explicit verification is read-only', async () => {
    const h = await loadedUI(); h.click('Review extracted'); await settle(); h.b.fail = 'after'; h.click('Add these'); await settle();
    assert.equal(h.controller.taskUncertain, true); h.input(h.external, json(['replacement']));
    assert.equal(h.button('Load task').disabled, true); assert.equal(h.external.disabled, true);
    const command = h.controller.taskCommand; h.button('Load task').dispatch('click'); await settle(); assert.equal(h.controller.taskCommand, command);
    h.click('Check existing task batch'); await settle(); assert.equal(h.b.writes, 1); assert.equal(h.controller.result, null);
});
test('both locales provide all external-task controls and truthful provenance', () => {
    for (const locale of ['en', 'zh_CN']) {
        const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        for (const suffix of ['ExternalTasks', 'ExternalTasksHelp', 'ExternalTasksInput', 'ExternalTasksResponse', 'ExternalTasksProvenance', 'ExternalTasksLoad', 'ExternalTasksReplace', 'ExternalTasksLoaded', 'ExternalTasksDiscard', 'ExternalTasksInvalid']) assert(messages[`aiContext${suffix}`]?.message);
    }
});
