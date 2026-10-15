// Executes the actual controller, stores and view event handlers with synthetic data.
// DOM-model coverage is separate from native paste/browser acceptance.
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

const oversized = () => json(Array.from({ length: 40 }, (_, index) => `${index}:` + 'x'.repeat(880) + ':END'));
const invalidEdits = [
    ['32001 UTF-16 units', () => ' '.repeat(32001)],
    ['oversized otherwise valid JSON', oversized],
    ['unpaired high surrogate', () => '{"tasks":["broken\ud800"]}'],
    ['unpaired low surrogate', () => '{"tasks":["broken\udc00"]}']
];
for (const [name, draft] of invalidEdits) test(`controller rejects ${name} and revokes old authorization before validation`, async () => {
    const h = setup(); await load(h); h.controller.selectTask(1, false, h.controller.result);
    const prior = h.controller.result, oldReview = await h.controller.reviewTasks(), generation = h.controller.generation;
    assert.throws(() => h.controller.editResult(draft()), { code: 'LIMIT' });
    assert.equal(h.controller.result, prior); assert.equal(h.controller.invalidTaskEdit, prior);
    assert.equal(h.controller.generation, generation + 1); assert.equal(h.controller.taskSelection, null); assert.equal(h.controller.taskReview, null);
    assert.throws(() => h.controller.taskCandidates(), { code: 'TASK_EDIT_INVALID' });
    assert.throws(() => h.controller.selectTask(0, true, prior), { code: 'TASK_EDIT_INVALID' });
    await assert.rejects(h.controller.reviewTasks(), { code: 'TASK_EDIT_INVALID' });
    await assert.rejects(h.controller.confirmTasks(), { code: 'STALE' });
    h.controller.edit(); // Unrelated question/source edits cannot reauthorize the old result.
    assert.throws(() => h.controller.taskCandidates(), { code: 'TASK_EDIT_INVALID' });
    assert.equal(h.b.writes + h.c.writes, 0);
    h.controller.editResult(json(['repaired one', 'repaired two']));
    assert.equal(h.controller.invalidTaskEdit, null); assert.notEqual(h.controller.result, prior);
    assert.deepEqual(h.controller.taskCandidates().selected, [true, true]);
    await assert.rejects(h.controller.confirmTasks(), { code: 'STALE' });
    const fresh = await h.controller.reviewTasks(); assert.notEqual(fresh.command, oldReview.command);
    await h.controller.confirmTasks(); assert.deepEqual((await h.store.read()).records.map(row => row.text), ['repaired one', 'repaired two']);
    assert.equal(h.b.writes, 1); assert.deepEqual(h.calls, { network: 0, permissions: 0 });
});

test('oversized edits never reach JSON parsing, candidate review or controller storage', async () => {
    const h = setup(); await load(h); await h.controller.reviewTasks(); const prior = h.controller.result, draft = oversized();
    assert(draft.length > 32000); assert.equal(JSON.parse(draft).tasks.length, 40);
    let parses = 0, reviews = 0; const parse = JSON.parse, review = h.store.reviewBatch;
    JSON.parse = (...args) => { parses++; return parse(...args); };
    h.store.reviewBatch = (...args) => { reviews++; return review.apply(h.store, args); };
    try {
        assert.throws(() => h.controller.editResult(draft), { code: 'LIMIT' });
        assert.throws(() => h.controller.taskCandidates(), { code: 'TASK_EDIT_INVALID' });
        await assert.rejects(h.controller.reviewTasks(), { code: 'TASK_EDIT_INVALID' });
        assert.equal(parses, 0); assert.equal(reviews, 0);
    } finally { JSON.parse = parse; h.store.reviewBatch = review; }
    assert.equal(h.controller.result, prior); assert.equal(h.controller.result.text, json(['first', 'second']));
    assert.equal(Object.values(h.controller).includes(draft), false); assert.equal(h.b.writes + h.c.writes, 0);
});

test('32000 UTF-16 units remain valid; task count and per-task limits are unchanged', async () => {
    const h = setup(); await load(h); const value = json(['😀 boundary']);
    h.controller.editResult(value + ' '.repeat(32000 - value.length));
    assert.equal(h.controller.result.text.length, 32000); assert.deepEqual((await h.controller.reviewTasks()).texts, ['😀 boundary']);
    for (const value of [json(Array(51).fill('too many')), json(['x'.repeat(1001)])]) {
        h.controller.editResult(value); assert.equal(h.controller.taskReview, null);
        await assert.rejects(h.controller.reviewTasks()); assert.equal(h.b.writes + h.c.writes, 0);
    }
});

for (const point of ['workspace preflight', 'store review']) test(`late task review after ${point} cannot restore rejected-edit authorization`, async () => {
    const h = setup(); await load(h); await h.controller.reviewTasks();
    let release;
    if (point === 'workspace preflight') release = h.hold();
    else {
        const gate = deferred(), review = h.store.reviewBatch.bind(h.store);
        h.store.reviewBatch = async value => { const result = await review(value); await gate.promise; return result; };
        release = gate.resolve;
    }
    const reviewing = h.controller.reviewTasks(); await settle();
    assert.throws(() => h.controller.editResult(oversized()), { code: 'LIMIT' });
    release(); await assert.rejects(reviewing, { code: 'STALE' });
    assert.equal(h.controller.taskReview, null); assert.equal(h.controller.taskSelection, null);
    await assert.rejects(h.controller.confirmTasks(), { code: 'STALE' }); assert.equal(h.b.writes + h.c.writes, 0);
});

test('a late external load cannot replace a rejected editable response', async () => {
    const h = setup(); await load(h); await h.controller.reviewTasks(); const prior = h.controller.result, release = h.hold();
    const loading = load(h, json(['late replacement']), { replaceUnsaved: true });
    assert.throws(() => h.controller.editResult(oversized()), { code: 'LIMIT' });
    release(); await assert.rejects(loading, { code: 'STALE' });
    assert.equal(h.controller.result, prior); assert.equal(h.controller.invalidTaskEdit, prior);
    await assert.rejects(h.controller.reviewTasks(), { code: 'TASK_EDIT_INVALID' }); assert.equal(h.b.writes + h.c.writes, 0);
});

for (const replacement of ['external', 'provider tasks', 'provider answer', 'clear', 'close']) test(`invalid-edit state does not retain or contaminate a new result after ${replacement}`, async () => {
    const h = setup(); await load(h); assert.throws(() => h.controller.editResult(oversized()), { code: 'LIMIT' });
    if (replacement === 'clear' || replacement === 'close') {
        h.controller[replacement](); assert.equal(h.controller.result, null); assert.equal(h.controller.invalidTaskEdit, null); return;
    }
    if (replacement === 'external') await load(h, json(['fresh external']), { replaceUnsaved: true });
    else {
        const mode = replacement.endsWith('answer') ? 'answer' : 'tasks';
        await h.controller.review({ url: 'https://synthetic.example/v1/chat/completions', model: 'synthetic', question: 'Fresh', selected: [], mode });
        await h.controller.send('', { replaceUnsaved: true });
    }
    assert.equal(h.controller.invalidTaskEdit, null);
    if (h.controller.result.mode === 'tasks') assert.equal((await h.controller.reviewTasks()).count, 1);
    else assert.equal(h.controller.answerSnapshot().question, 'Fresh');
    assert.equal(h.b.writes + h.c.writes, 0);
});

test('invalid external-input Load still keeps the previous response, selection and authorization exactly', async () => {
    const h = setup(); await load(h); h.controller.selectTask(1, false, h.controller.result); await h.controller.reviewTasks();
    const before = [h.controller.result, h.controller.taskSelection, h.controller.taskReview, h.controller.generation, h.controller.invalidTaskEdit];
    for (const value of [oversized(), '{"tasks":["bad\ud800"]}', json([])]) {
        await assert.rejects(load(h, value, { replaceUnsaved: true }));
        assert.deepEqual([h.controller.result, h.controller.taskSelection, h.controller.taskReview, h.controller.generation, h.controller.invalidTaskEdit], before);
    }
    await h.controller.confirmTasks(); assert.deepEqual((await h.store.read()).records.map(row => row.text), ['first']);
});

for (const state of ['pending', 'before', 'after', 'readback']) test(`${state} task write owns its original review and retry before any edit invalidation`, async () => {
    const h = setup(); await load(h); h.controller.selectTask(1, false, h.controller.result); await h.controller.reviewTasks();
    let saving, release;
    if (state === 'pending') {
        const gate = deferred(), occupied = h.b.lock(() => gate.promise); release = async () => { gate.resolve(); await occupied; };
        saving = h.controller.confirmTasks();
    } else { h.b.fail = state; await assert.rejects(h.controller.confirmTasks()); }
    const before = [h.controller.result, h.controller.taskReview, h.controller.taskSelection, h.controller.taskCommand, h.controller.generation, h.controller.invalidTaskEdit];
    for (const value of [oversized(), '{"tasks":["bad\ud800"]}', json(['unauthorized replacement'])]) {
        assert.throws(() => h.controller.editResult(value), { code: 'BUSY' });
        assert.deepEqual([h.controller.result, h.controller.taskReview, h.controller.taskSelection, h.controller.taskCommand, h.controller.generation, h.controller.invalidTaskEdit], before);
    }
    if (state === 'pending') { await release(); await saving; } else await h.controller.confirmTasks();
    assert.deepEqual((await h.store.read()).records.map(row => row.text), ['first']);
    assert.equal(h.b.writes, state === 'before' ? 2 : 1); assert.equal(h.controller.taskCommand, null);
});

for (const [name, draft] of invalidEdits) test(`actual view DOM-model retains ${name}, hides old tasks and permits repair only after new review`, async () => {
    const h = await loadedUI(); h.click('Review extracted'); await settle();
    const oldChoice = h.host.querySelector('.ai-context-task-choices').querySelector('input');
    const source = draft(), prior = h.controller.result;
    assert.equal(h.output.maxLength, undefined); h.input(h.output, source);
    assert.equal(h.output.value, source); assert.equal(h.controller.result, prior); assert.equal(h.controller.taskReview, null);
    assert.equal(h.host.querySelector('.ai-context-tasks').hidden, true); assert.equal(h.host.querySelector('.ai-context-task-selection').hidden, true);
    const feedback = h.host.querySelector('.ai-context-task-edit-status'); assert.equal(feedback.hidden, false); assert.match(feedback.textContent, /32,000 UTF-16.*previous task review is canceled/);
    assert.equal(h.output.getAttribute('aria-invalid'), 'true'); assert.equal(h.button('Review extracted').disabled, true); assert.equal(h.button('Add these').disabled, true);
    oldChoice.checked = false; oldChoice.dispatch('change'); assert.equal(h.controller.taskSelection, null);
    h.button('Review extracted').dispatch('click'); await settle(); h.button('Add these').dispatch('click'); await settle();
    assert.equal(h.controller.taskReview, null); assert.equal(h.output.value, source); assert.equal(h.b.writes + h.c.writes, 0);
    h.input(h.host.querySelector('.ai-context-question'), 'Unrelated next draft');
    assert.equal(feedback.hidden, false); assert.equal(h.button('Review extracted').disabled, true); assert.equal(h.output.value, source);
    h.input(h.output, json(['new first', 'new second']));
    assert.equal(feedback.hidden, true); assert.equal(h.output.getAttribute('aria-invalid'), 'false'); assert.equal(h.button('Review extracted').disabled, false); assert.equal(h.button('Add these').disabled, true);
    assert.match(h.host.querySelector('.ai-context-status').textContent, /Review the edited tasks again/);
    h.click('Review extracted'); await settle(); h.click('Add these'); await settle();
    assert.deepEqual((await h.store.read()).records.map(row => row.text), ['new first', 'new second']); assert.equal(h.b.writes, 1);
    assert.deepEqual(h.calls, { network: 0, permissions: 0 }); h.view.destroy();
});

test('actual view DOM-model preserves invalid external Load authorization, then fences the same text edited in output', async () => {
    const h = await loadedUI(); h.click('Review extracted'); await settle();
    const before = [h.controller.result, h.controller.taskSelection, h.controller.taskReview, h.output.value], source = oversized();
    h.input(h.external, source); h.click('Load task'); await settle();
    assert.equal(h.external.value, source); assert.deepEqual([h.controller.result, h.controller.taskSelection, h.controller.taskReview, h.output.value], before);
    assert.equal(h.button('Add these').disabled, false); assert.equal(h.host.querySelector('.ai-context-task-edit-status').hidden, true);
    h.input(h.output, source); assert.equal(h.button('Add these').disabled, true); assert.equal(h.controller.taskReview, null);
    h.input(h.external, json(['fresh replacement'])); h.click('Load task'); await settle();
    assert.equal(h.output.value, json(['fresh replacement'])); assert.equal(h.host.querySelector('.ai-context-task-edit-status').hidden, true);
    h.click('Review extracted'); await settle(); h.click('Add these'); await settle();
    assert.deepEqual((await h.store.read()).records.map(row => row.text), ['fresh replacement']); h.view.destroy();
});

test('actual view DOM-model late review cannot reveal its stale task list after rejected editing', async () => {
    const h = await loadedUI(), release = h.hold(); h.click('Review extracted');
    assert.equal(h.output.disabled, true); h.input(h.output, oversized()); release(); await settle();
    assert.equal(h.controller.taskReview, null); assert.equal(h.host.querySelector('.ai-context-tasks').hidden, true);
    assert.equal(h.button('Review extracted').disabled, true); assert.equal(h.button('Add these').disabled, true); assert.equal(h.b.writes + h.c.writes, 0); h.view.destroy();
});

test('actual view DOM-model uncertain write keeps the original command and accessible retry after a synthetic input event', async () => {
    const h = await loadedUI(); h.click('Review extracted'); await settle(); h.b.fail = 'after'; h.click('Add these'); await settle();
    const before = [h.controller.taskReview, h.controller.taskCommand, h.controller.generation]; assert.equal(h.output.disabled, true);
    h.input(h.output, oversized());
    assert.deepEqual([h.controller.taskReview, h.controller.taskCommand, h.controller.generation], before);
    assert.equal(h.host.querySelector('.ai-context-task-edit-status').hidden, true); assert.equal(h.button('Add these').disabled, false);
    assert.match(h.host.querySelector('.ai-context-status').textContent, /earlier task add is unconfirmed/);
    h.click('Add these'); await settle(); assert.equal(h.b.writes, 1); assert.equal((await h.store.read()).records.length, 2); h.view.destroy();
});

test('English and Chinese invalid-edit messages explain intact drafts and fresh review without changing existing limits', () => {
    for (const locale of ['en', 'zh_CN']) {
        const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        const invalid = messages.aiContextTaskEditInvalid.message;
        assert.match(invalid, /32,000/); assert.match(invalid, /UTF-16/); assert.match(invalid, /Unicode/);
        assert(messages.aiContextTaskEditChanged.message.length > 0);
        if (locale === 'en') assert.match(invalid, /full draft is kept.*previous task review is canceled.*review it again/);
        else assert.match(invalid, /完整草稿.*之前的待办审阅已取消.*重新审阅/);
    }
});

test('rejected edit is zero-write and repaired append preserves active/done/removed tasks, pin and recovery byte-for-byte', async () => {
    const h = setup(), store = h.store;
    let state = await store.mutate(store.request('addBatch', { texts: ['Existing active', 'Existing done', 'Existing removed'] }));
    for (const [index, kind] of [[1, 'complete'], [2, 'remove']]) {
        state = await store.mutate(store.request(kind, { id: state.records[index].id, version: state.records[index].version }));
    }
    state = await store.mutate(store.request('pin', { id: state.records[0].id, version: state.records[0].version, expectedPin: null }));
    state = await store.mutate(store.request('replace', await store.review(await store.export())));
    assert.equal(state.recovery.length, 1);
    const before = JSON.stringify(state), writes = h.b.writes;
    await load(h, json(['Never append this old batch'])); await h.controller.reviewTasks();
    assert.throws(() => h.controller.editResult(oversized()), { code: 'LIMIT' });
    await assert.rejects(h.controller.reviewTasks(), { code: 'TASK_EDIT_INVALID' });
    await assert.rejects(h.controller.confirmTasks(), { code: 'STALE' });
    assert.equal(h.b.writes, writes); assert.equal(JSON.stringify(await store.read()), before);
    h.controller.editResult(json(['Repaired first', 'Repaired second'])); await h.controller.reviewTasks(); await h.controller.confirmTasks();
    const after = await store.read(); assert.equal(h.b.writes, writes + 1);
    assert.equal(JSON.stringify(after.records.slice(0, state.records.length)), JSON.stringify(state.records));
    assert.equal(JSON.stringify(after.recovery), JSON.stringify(state.recovery));
    assert.equal(after.pinnedId, state.pinnedId); assert.equal(after.enabled, state.enabled);
    assert.deepEqual(after.records.slice(state.records.length).map(row => row.text), ['Repaired first', 'Repaired second']);
    assert.equal(h.c.writes, 0); assert.deepEqual(h.calls, { network: 0, permissions: 0 });
});

test('undoing a rejected edit to the original JSON still requires a new review identity', async () => {
    const h = setup(); await load(h); const original = h.controller.result, prior = await h.controller.reviewTasks();
    assert.throws(() => h.controller.editResult(oversized()), { code: 'LIMIT' });
    h.controller.editResult(original.text); assert.notEqual(h.controller.result, original);
    assert.equal(h.controller.taskReview, null); await assert.rejects(h.controller.confirmTasks(), { code: 'STALE' });
    const fresh = await h.controller.reviewTasks(); assert.notEqual(fresh.command, prior.command); assert(fresh.generation > prior.generation);
    assert.equal(h.b.writes + h.c.writes, 0);
});
