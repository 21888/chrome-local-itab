// Synthetic controller/store/DOM coverage. Native paste normalization and layout
// remain separate acceptance checks; no real service or personal data is used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { webcrypto } = require('node:crypto'); global.crypto ||= webcrypto;
const { createDocument, deferred } = require('./helpers/task-dom-model');
const Context = require('../shared/ai-context'), Tasks = require('../shared/local-tasks-store'), Collections = require('../shared/local-ai-collections-store');
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
async function idle(h) { for (let i = 0; i < 100 && h.view.pending; i++) await new Promise(resolve => setTimeout(resolve, 5)); await settle(); assert.equal(h.view.pending, Boolean(h.controller.saveCommand || h.controller.taskCommand)); }
function backend() {
    let raw, queue = Promise.resolve();
    return { reads: 0, writes: 0, fail: null, readFailure: false,
        seed(value) { raw = structuredClone(value); }, snapshot() { return structuredClone(raw); },
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
    const b = backend(), c = backend(), calls = { network: 0, permissions: 0, active: 0 };
    let active = true, gate = null;
    const ensureActive = async () => { calls.active++; if (gate) await gate.promise; if (!active) throw Context.fault('WORKSPACE_INVALIDATED'); };
    const legacyStore = new Collections.Store(c), store = new Tasks.Store(Context.guardedBackend(b, ensureActive));
    const controller = new Context.Controller({ taskStore: store, collectionStore: new Collections.Store(Context.guardedBackend(c, ensureActive)), ensureActive,
        readSources: async () => [{ id: 'collection:synthetic', label: 'Synthetic source', text: 'Synthetic excerpt', scope: 'library' }],
        transport: { review: input => ({ ...input, origin: 'https://synthetic.example', permission: 'https://synthetic.example:443/*' }),
            run: async () => { calls.network++; return { text: 'Synthetic provider answer' }; } },
        permissions: { request: async () => { calls.permissions++; return true; }, contains: async () => { calls.permissions++; return true; } } });
    return { controller, store, legacyStore, b, c, calls, deactivate: () => { active = false; },
        hold() { gate = deferred(); const ticket = gate; return () => { gate = null; ticket.resolve(); }; } };
}
const load = (h, text = 'Manually pasted synthetic answer', options = {}) => h.controller.loadExternalAnswer(text, { mode: 'answer', ...options });
async function ui({ safeReader = false, clipboard, normalizeOutput = false, ...options } = {}) {
    const h = setup(), document = createDocument(), host = document.createElement('main'); document.body.append(host);
    const events = new Map(), confirmations = []; let confirm = () => true;
    const window = { document, confirm: message => { confirmations.push(message); return confirm(); },
        addEventListener: (type, fn) => events.set(type, fn), removeEventListener: type => events.delete(type) };
    if (safeReader) { window.marked = require('../vendor/marked/marked.umd.js'); vm.runInNewContext(fs.readFileSync('shared/safe-answer-reader.js', 'utf8'), { window }); }
    vm.runInNewContext(fs.readFileSync('shared/ai-context-view.js', 'utf8'), { window });
    const view = window.LocalItabAIContextView.mount(host, { controller: h.controller, presetStore: null, clipboard, ...options }); await view.ready;
    const button = text => host.querySelectorAll('button').find(item => item.textContent.startsWith(text));
    const input = (node, value) => { node.value = value; node.dispatch('input'); };
    const mode = value => { const node = host.querySelector('.ai-context-mode'); node.value = value; node.dispatch('change'); };
    const output = host.querySelectorAll('textarea').find(item => item.rows === 8);
    // Explicitly simulate native textarea value normalization for the copy guard.
    // This does not establish native paste behavior or real clipboard permission.
    if (normalizeOutput) { let value = output.value; Object.defineProperty(output, 'value', { get: () => value, set: text => { value = text.replace(/\r\n?/g, '\n'); } }); }
    return { ...h, document, host, view, events, confirmations, button, input, mode, output, setConfirm: fn => { confirm = fn; },
        external: host.querySelector('.ai-context-external-input'), panel: host.querySelector('.ai-context-external-tasks'), title: host.querySelector('.ai-context-savetitle'),
        click(text) { const node = button(text); assert(node, text); assert(!node.disabled, `${text} enabled`); node.dispatch('click'); } };
}
async function loadedUI(text = 'Manual synthetic answer', options = {}) {
    const h = await ui(options); h.panel.open = true; h.input(h.external, text); h.click('Load answer'); await settle(); assert.equal(h.controller.result?.text, text); return h;
}
function noExternal(h) { assert.equal(h.calls.network, 0); assert.equal(h.calls.permissions, 0); assert.equal(h.b.writes, 0); }

const original = '  # 中文 😀\r\nLine\ttext\r\n<a href="javascript:bad">literal</a>\n![image](https://example.invalid/pixel)\n[link](https://example.invalid)  ';
test('manual answer is exact, immutable, offline and independent of question, sources and connection', async () => {
    const h = setup();
    await h.controller.reviewLocal({ question: 'Unrelated private question', selected: [{ id: 'source', label: 'Unrelated source', text: 'Unrelated excerpt' }], mode: 'answer' });
    const result = await load(h, original);
    assert.deepEqual(result, { text: original, mode: 'answer', provenance: 'external' }); assert(Object.isFrozen(result));
    assert.equal(h.controller.resultReview, null); assert.equal(h.controller.reviewed, null); assert.equal(h.controller.localReview, null);
    assert.equal(h.controller.taskSelection, null); assert.throws(() => h.controller.answerSnapshot(), { code: 'STALE' });
    assert.throws(() => h.controller.editResult('Different answer'), { code: 'READ_ONLY' }); assert.equal(h.controller.result, result);
    assert.equal(h.c.writes, 0); noExternal(h);
    await h.controller.saveAnswer('User chosen title');
    const state = await h.controller.collectionStore.read(), record = state.records[0];
    assert.equal(record.body, original); assert.equal(record.history[0].body, original); assert.equal(record.title, 'User chosen title');
    assert.equal(record.tool, ''); assert.equal(record.sourceUrl, ''); assert.equal(record.promptRef, null); assert.equal(record.type, 'answer');
    assert.match(record.notes, /Manually pasted.*not been verified/); assert.equal(Object.hasOwn(record, 'contextSnapshot'), false);
    assert.doesNotMatch(JSON.stringify(state), /Unrelated|synthetic\.example|"model"|"question"|"sources"|provenance/);
    const exported = JSON.parse(await h.controller.collectionStore.export()); assert.equal(exported.content.records[0].body, original); noExternal(h);
});

test('manual context opt-in rejects before workspace read, command creation or write, including retry', async () => {
    const h = setup(); await load(h); const calls = h.calls.active, reads = h.c.reads;
    await assert.rejects(h.controller.saveAnswer('Synthetic', { includeContext: true }), { code: 'CONTEXT_UNAVAILABLE' });
    assert.equal(h.calls.active, calls); assert.equal(h.c.reads, reads); assert.equal(h.c.writes, 0); assert.equal(h.controller.saveCommand, null);
    h.c.fail = 'after'; await assert.rejects(h.controller.saveAnswer('Original title')); const command = h.controller.saveCommand;
    const retryCalls = h.calls.active; await assert.rejects(h.controller.saveAnswer('Other title', { includeContext: true }), { code: 'CONTEXT_UNAVAILABLE' });
    assert.equal(h.calls.active, retryCalls); assert.equal(h.controller.saveCommand, command); assert.equal(h.c.writes, 1);
    await h.controller.saveAnswer('Ignored retry title'); assert.equal((await h.legacyStore.read()).records[0].title, 'Original title');
});

for (const [name, value] of [['empty', ''], ['whitespace', ' \n\t'], ['32001 UTF-16', 'x'.repeat(32001)], ['emoji overflow', '😀'.repeat(16000) + 'x'], ['high surrogate', '\ud800'], ['low surrogate', '\udc00'], ...Array.from({ length: 33 }, (_, i) => i).filter(i => ![9, 10, 13].includes(i) && i !== 32).concat(127).map(i => [`control ${i}`, `before${String.fromCharCode(i)}after`])]) {
    test(`manual ${name} rejected whole before replacing a previous response`, async () => {
        const h = setup(); await h.controller.loadExternalTasks('{"tasks":["keep","skip"]}', { mode: 'tasks' }); h.controller.selectTask(1, false, h.controller.result); await h.controller.reviewTasks();
        const before = [h.controller.result, h.controller.resultReview, h.controller.taskSelection, h.controller.taskReview, h.controller.generation];
        await assert.rejects(load(h, value, { replaceUnsaved: true }), { code: 'LIMIT' });
        assert.deepEqual([h.controller.result, h.controller.resultReview, h.controller.taskSelection, h.controller.taskReview, h.controller.generation], before);
        assert.equal(h.c.writes, 0); noExternal(h);
    });
}
test('manual 32000 UTF-16 answer including emoji is accepted exactly without JSON interpretation', async () => {
    for (const source of ['😀'.repeat(16000), 'x'.repeat(32000), '{"tasks":["This stays literal answer text"]}', ' \tline\nline\r\n中文\u2028\u2029 ']) {
        const h = setup(); await load(h, source); assert.equal(h.controller.result.text, source); assert.equal(h.controller.result.mode, 'answer'); assert.equal(h.controller.taskSelection, null);
        await h.controller.saveAnswer('Boundary answer'); assert.equal((await h.legacyStore.read()).records[0].body, source); noExternal(h);
    }
});
test('manual load mode and replacement permission fail closed, including partial answers', async () => {
    const h = setup(); await assert.rejects(load(h, 'wrong', { mode: 'tasks' }), { code: 'STALE' }); await load(h);
    const result = h.controller.result; await assert.rejects(load(h, 'replacement'), { code: 'UNSAVED_RESULT' }); assert.equal(h.controller.result, result);
    h.controller.clear(); h.controller.partial = Object.freeze({ text: 'incomplete', state: 'stopped' }); const partial = h.controller.partial;
    await assert.rejects(load(h), { code: 'UNSAVED_RESULT' }); assert.equal(h.controller.partial, partial);
    await load(h, 'Explicit replacement', { replaceUnsaved: true }); assert.equal(h.controller.partial, null); assert.equal(h.c.writes, 0);
});
for (const change of ['edit', 'clear', 'close', 'workspace', 'input', 'selection', 'partial']) test(`manual pending load rejects late ${change} changes`, async () => {
    const h = setup(); await h.controller.loadExternalTasks('{"tasks":["keep","second"]}', { mode: 'tasks' }); const before = h.controller.result;
    const release = h.hold(); let inputCurrent = true; const loading = load(h, 'late', { replaceUnsaved: true, isCurrent: () => inputCurrent });
    if (['edit', 'clear', 'close'].includes(change)) h.controller[change]();
    if (change === 'workspace') h.deactivate(); if (change === 'input') inputCurrent = false;
    if (change === 'selection') h.controller.selectTask(1, false, before);
    if (change === 'partial') h.controller.partial = { text: 'new incomplete', state: 'stopped' };
    release(); await assert.rejects(loading); assert.notEqual(h.controller.result?.text, 'late'); assert.equal(h.c.writes, 0); noExternal(h);
});

test('manual save preserves existing global records, answer versions, archived records and recovery byte-for-byte', async () => {
    const h = setup(), store = h.legacyStore;
    await store.mutate(store.request('add', { title: 'Existing global', body: 'Original old body', notes: 'Old private annotation' }));
    let record = (await store.read()).records[0]; const revision = await store.reviewRevision({ id: record.id, version: record.version, body: 'Current old body' });
    await store.mutate(store.request('revise', revision));
    await store.mutate(store.request('add', { title: 'Archived old', body: 'Archived exact body' })); record = (await store.read()).records[1];
    await store.mutate(store.request('remove', { id: record.id, version: record.version }));
    const seed = await store.read(); seed.receipts = []; seed.enabled = true;
    seed.recovery = [{ id: 'synthetic-recovery', createdAt: '2026-10-01T00:00:00.000Z', content: { records: structuredClone(seed.records) } }];
    h.c.seed(Collections.validate(seed)); const before = h.c.snapshot(), writes = h.c.writes;
    await load(h, original); await h.controller.saveAnswer('New manual answer'); const after = h.c.snapshot();
    assert.deepEqual(after.records.slice(0, 2), before.records); assert.deepEqual(after.recovery, before.recovery); assert.equal(after.enabled, before.enabled);
    assert.equal(after.records[2].body, original); assert.equal(h.c.writes, writes + 1); noExternal(h);
});
async function fill(h, count, body) {
    await h.legacyStore.mutate(h.legacyStore.request('add', { title: 'Synthetic seed', body })); const state = h.c.snapshot(), record = state.records[0]; state.receipts = [];
    state.records = Array.from({ length: count }, (_, i) => ({ ...structuredClone(record), id: `synthetic-record-${i}`, version: `synthetic-record-version-${i}`, currentVersionId: `synthetic-body-version-${i}`, history: [{ ...record.history[0], id: `synthetic-body-version-${i}` }] }));
    h.c.seed(Collections.validate(state));
}
for (const [kind, count, body, response] of [['CAPACITY', 200, 'small', 'New answer'], ['SIZE_LIMIT', 32, 'x'.repeat(32000), '😀'.repeat(16000)]]) test(`manual ${kind} refuses entire write with unchanged global state and retained draft`, async () => {
    const h = setup(); await fill(h, count, body); await load(h, response); const before = h.c.snapshot(), writes = h.c.writes, result = h.controller.result;
    await assert.rejects(h.controller.saveAnswer('Does not fit'), { code: kind }); assert.equal(h.c.writes, writes); assert.deepEqual(h.c.snapshot(), before);
    assert.equal(h.controller.result, result); assert.equal(h.controller.saveCommand, null); assert.equal(h.controller.saveUncertain, false); assert.equal(h.controller.saved, false);
    h.controller.edit(); assert.equal(h.controller.result, result); noExternal(h);
});
for (const fail of ['before', 'after', 'readback']) test(`manual ${fail} failure locks the exact operation and idempotent retry adds once`, async () => {
    const h = setup(); await load(h, original); h.c.fail = fail;
    await assert.rejects(h.controller.saveAnswer('Original title')); const command = h.controller.saveCommand, result = h.controller.result;
    assert(command); assert(Object.isFrozen(command)); assert.equal(h.controller.saveUncertain, true);
    assert.throws(() => h.controller.edit(), { code: 'BUSY' }); assert.throws(() => h.controller.clear(), { code: 'BUSY' });
    await assert.rejects(load(h, 'must not replace', { replaceUnsaved: true }), { code: 'STALE' });
    await assert.rejects(h.controller.loadExternalTasks('{"tasks":["must not replace"]}', { mode: 'tasks', replaceUnsaved: true }), { code: 'STALE' });
    assert.equal(h.controller.result, result); assert.equal(h.controller.saveCommand, command);
    await h.controller.saveAnswer('Ignored new title'); const state = await h.legacyStore.read(); assert.equal(state.records.length, 1); assert.equal(state.records[0].id, command.operationId);
    assert.equal(state.records[0].title, 'Original title'); assert.equal(state.records[0].body, original); assert.equal(h.c.writes, fail === 'before' ? 2 : 1);
    assert.equal(h.controller.saveCommand, null); assert.equal(h.controller.saveUncertain, false); noExternal(h);
});
for (const fail of ['before', 'after', 'readback']) test(`manual ${fail} receipt verification is read-only and missing evidence stays locked`, async () => {
    const h = setup(); await load(h); h.c.fail = fail; await assert.rejects(h.controller.saveAnswer('Manual')); const command = h.controller.saveCommand, writes = h.c.writes;
    if (fail === 'before') { await assert.rejects(h.controller.verifyAnswerSave(), { code: 'SAVE_UNCONFIRMED' }); assert.equal(h.controller.saveCommand, command); assert.equal(h.controller.saved, false); }
    else { await h.controller.verifyAnswerSave(); assert.equal(h.controller.saveCommand, null); assert.equal(h.controller.saved, true); }
    assert.equal(h.c.writes, writes); noExternal(h);
});
test('manual save read error preserves one command; later success and duplicate clicks never append twice', async () => {
    const h = setup(); await load(h); h.c.readFailure = true; await assert.rejects(h.controller.saveAnswer('Original'), { code: 'READ' }); const command = h.controller.saveCommand;
    assert.equal(h.controller.saveUncertain, true); assert.equal(h.c.writes, 0);
    const saving = h.controller.saveAnswer('Ignored'); await assert.rejects(h.controller.saveAnswer('Double click'), { code: 'STALE' }); await saving;
    assert.equal((await h.legacyStore.read()).records[0].id, command.operationId); assert.equal(h.c.writes, 1);
    await assert.rejects(h.controller.saveAnswer('Again'), { code: 'STALE' }); assert.equal(h.c.writes, 1);
});
for (const changed of ['workspace', 'close']) test(`manual save cannot enter a queued collection write after ${changed}`, async () => {
    const h = setup(); await load(h); const gate = deferred(), occupied = h.c.lock(() => gate.promise), saving = h.controller.saveAnswer('Late save'); await settle();
    if (changed === 'workspace') h.deactivate(); else h.controller.close(); gate.resolve(); await occupied; await assert.rejects(saving);
    assert.equal(h.c.writes, 0); noExternal(h);
});
test('new task/provider results cannot inherit manual answer provenance or invalid task-edit state', async () => {
    const h = setup(); await h.controller.loadExternalTasks('{"tasks":["before"]}', { mode: 'tasks' }); assert.throws(() => h.controller.editResult('x'.repeat(32001)));
    await load(h, 'Clean manual', { replaceUnsaved: true }); assert.equal(h.controller.invalidTaskEdit, null); assert.equal(h.controller.taskSelection, null);
    await h.controller.loadExternalTasks('{"tasks":["new task"]}', { mode: 'tasks', replaceUnsaved: true }); assert.equal(h.controller.result.mode, 'tasks'); assert.equal(h.controller.resultReview, null);
    assert.equal((await h.controller.reviewTasks()).count, 1); await h.controller.confirmTasks(); assert.equal(h.c.writes, 0);
    await load(h); await h.controller.review({ question: 'New provider request', selected: [], mode: 'answer', url: 'https://synthetic.example/v1/chat/completions', model: 'synthetic-model' });
    await h.controller.send('', { replaceUnsaved: true }); assert.equal(h.controller.result.provenance, undefined); assert(h.controller.resultReview); assert.equal(h.controller.answerSnapshot().model, 'synthetic-model');
});

test('UI blank Answer mode shares one paste box with Tasks; explicit Load then read-only review and Save', async () => {
    let reads = 0; const h = await ui({ clipboard: { readText: () => { reads++; } } });
    assert.equal(h.panel.hidden, false); assert.equal(h.panel.open, false); assert.equal(h.host.querySelectorAll('.ai-context-external-input').length, 1);
    assert.match(h.panel.querySelector('summary').textContent, /external answer/); assert.match(h.host.querySelector('.ai-context-external-help').textContent, /private information.*unencrypted local backups/);
    h.panel.open = true; h.input(h.external, original); assert.equal(h.controller.result, null); assert.equal(h.view.hasUncommittedWork(), true);
    h.mode('tasks'); assert.equal(h.external.value, original); assert.match(h.panel.querySelector('summary').textContent, /task JSON/);
    h.mode('answer'); h.click('Load answer'); await settle(); assert.equal(h.controller.result.text, original); assert.equal(h.output.readOnly, true); assert.equal(h.external.value, '');
    assert.equal(h.title.value, ''); assert.equal(h.host.querySelector('.ai-context-save-context').hidden, true); assert.equal(h.button('Review extracted').disabled, true);
    assert.match(h.host.querySelector('.ai-context-previous-result').textContent, /global AI collection and unencrypted local backups/);
    assert.equal(h.c.writes, 0); assert.equal(reads, 0); h.input(h.title, 'Chosen title'); h.click('Save loaded'); await idle(h);
    assert.equal(h.c.writes, 1); assert.equal((await h.legacyStore.read()).records[0].body, original); assert.equal(h.button('Save loaded').disabled, true); noExternal(h);
});
test('UI pasted replacement draft does not change loaded body; copy and save always use loaded original', async () => {
    const copied = [], h = await loadedUI(original, { clipboard: { writeText: async text => copied.push(text) }, normalizeOutput: true });
    assert.equal(h.output.value, original.replace(/\r\n?/g, '\n')); h.input(h.external, 'Unloaded replacement');
    h.click('Copy answer'); await settle(); assert.deepEqual(copied, [original]); assert.equal(h.controller.result.text, original);
    h.input(h.output, 'Synthetic attempted readonly edit'); assert.equal(h.output.value, original.replace(/\r\n?/g, '\n')); assert.equal(h.controller.result.text, original);
    h.input(h.title, 'Loaded answer title'); h.click('Save loaded'); await idle(h); assert.equal((await h.legacyStore.read()).records[0].body, original);
    assert.equal(h.external.value, 'Unloaded replacement'); noExternal(h);
});
for (const text of ['x'.repeat(32001) + 'END', '\ud800tail', 'bad\u0000text']) test('UI invalid paste keeps full DOM draft, old body, manual title and snapshot consent', async () => {
    const h = await ui(); h.input(h.host.querySelector('.ai-context-question'), 'Previous provider question'); h.input(h.host.querySelector('.ai-context-model'), 'synthetic-model'); h.input(h.host.querySelector('.ai-context-endpoint'), 'https://synthetic.example/v1/chat/completions');
    h.click('Review exact'); await settle(); h.click('Send reviewed'); await settle();
    h.input(h.title, 'Keep this title'); const option = h.host.querySelector('.ai-context-save-context').querySelector('input'); option.checked = true; option.dispatch('change');
    const before = [h.controller.result, h.controller.resultReview, h.title.value, option.checked, h.output.value]; h.input(h.external, text);
    assert.equal(h.external.maxLength, undefined); h.click('Load answer'); await settle();
    assert.deepEqual([h.controller.result, h.controller.resultReview, h.title.value, option.checked, h.output.value], before); assert.equal(h.external.value, text);
    assert.match(h.host.querySelector('.ai-context-status').textContent, /not loaded.*32,000/); assert.equal(h.c.writes, 0);
});
test('UI successful manual replacement clears automatic question title but preserves an explicit user title', async () => {
    for (const typed of [false, true]) {
        const h = await ui(); h.input(h.host.querySelector('.ai-context-question'), 'Unrelated provider question'); h.input(h.host.querySelector('.ai-context-model'), 'synthetic-model'); h.input(h.host.querySelector('.ai-context-endpoint'), 'https://synthetic.example/v1/chat/completions');
        h.click('Review exact'); await settle(); h.click('Send reviewed'); await settle(); assert.equal(h.title.value, 'Unrelated provider question');
        if (typed) h.input(h.title, 'My explicit title'); h.input(h.external, 'Manual replacement'); h.click('Load answer'); await settle();
        assert.equal(h.title.value, typed ? 'My explicit title' : ''); assert.equal(h.controller.resultReview, null);
    }
});
test('UI cancellation retains task result, selected subset, task review, manual title and pasted answer', async () => {
    const h = await ui(); h.mode('tasks'); h.input(h.external, '{"tasks":["keep","skip"]}'); h.click('Load task'); await settle();
    const choices = h.host.querySelector('.ai-context-task-choices').querySelectorAll('input'); choices[1].checked = false; choices[1].dispatch('change'); h.mode('answer');
    h.click('Review extracted'); await settle(); h.input(h.title, 'Keep title'); h.input(h.external, 'Candidate answer');
    const before = [h.controller.result, h.controller.taskSelection, h.controller.taskReview, h.title.value, h.output.value]; h.setConfirm(() => false); h.click('Load answer'); await settle();
    assert.deepEqual([h.controller.result, h.controller.taskSelection, h.controller.taskReview, h.title.value, h.output.value], before); assert.equal(h.external.value, 'Candidate answer'); assert.equal(h.c.writes, 0); noExternal(h);
});
for (const edited of ['input', 'question', 'mode', 'title', 'source']) test(`UI changes during replacement confirmation reject ${edited} without discarding current work`, async () => {
    const h = await loadedUI(); h.input(h.external, 'Candidate'); const before = h.controller.result;
    h.setConfirm(() => { if (edited === 'input') h.input(h.external, 'Newer paste'); if (edited === 'question') h.input(h.host.querySelector('.ai-context-question'), 'New question'); if (edited === 'mode') h.mode('tasks'); if (edited === 'title') h.input(h.title, 'New title'); if (edited === 'source') { const check = h.host.querySelector('.ai-context-source').querySelector('input'); check.checked = true; check.dispatch('change'); } return true; });
    h.click('Load answer'); await settle(); assert.equal(h.controller.result, before); assert.equal(h.external.value, edited === 'input' ? 'Newer paste' : 'Candidate'); assert.equal(h.c.writes, 0);
});
for (const edited of ['input', 'question', 'mode', 'title', 'source', 'connection', 'hidden', 'close', 'workspace']) test(`UI load workspace await fences late ${edited}`, async () => {
    const h = await ui(); h.input(h.external, 'Late manual answer'); const release = h.hold(); h.click('Load answer'); assert.equal(h.external.disabled, true);
    if (edited === 'input') h.input(h.external, 'New paste'); if (edited === 'question') h.input(h.host.querySelector('.ai-context-question'), 'New question'); if (edited === 'mode') h.mode('tasks'); if (edited === 'title') h.input(h.title, 'New title');
    if (edited === 'source') { const node = h.host.querySelector('.ai-context-source').querySelector('textarea'); h.input(node, 'Edited excerpt'); }
    if (edited === 'connection') h.input(h.host.querySelector('.ai-context-model'), 'other-model');
    if (edited === 'hidden') { h.document.visibilityState = 'hidden'; await h.document.listeners.get('visibilitychange')(); h.document.visibilityState = 'visible'; }
    if (edited === 'close') h.view.destroy(); if (edited === 'workspace') h.deactivate(); release(); await settle();
    assert.equal(h.controller.result, null); assert.equal(h.external.value, edited === 'close' ? '' : edited === 'input' ? 'New paste' : 'Late manual answer'); assert.equal(h.c.writes, 0); noExternal(h);
});
test('UI incomplete answer replacement asks, cancellation keeps partial; accepted load clears it', async () => {
    const h = await ui(); h.controller.partial = { text: 'Incomplete synthetic', state: 'stopped' }; h.input(h.external, 'Manual complete'); h.setConfirm(() => false);
    h.click('Load answer'); assert.equal(h.controller.partial.text, 'Incomplete synthetic'); assert.equal(h.controller.result, null); assert.equal(h.external.value, 'Manual complete');
    h.setConfirm(() => true); h.click('Load answer'); await settle(); assert.equal(h.controller.partial, null); assert.equal(h.controller.result.text, 'Manual complete'); assert.equal(h.c.writes, 0);
});
test('UI clear cancellation, changed confirmation and close retain or clear volatile input without writes', async () => {
    const h = await loadedUI(); h.input(h.external, 'Unloaded paste'); const capture = h.view.captureDraft(); h.input(h.external, 'New unloaded paste'); assert.equal(capture(), false);
    h.setConfirm(() => false); h.click('Cancel / clear'); assert.equal(h.external.value, 'New unloaded paste'); assert(h.controller.result);
    h.setConfirm(() => { h.input(h.external, 'Edited during clear'); return true; }); h.click('Cancel / clear'); assert.equal(h.external.value, 'Edited during clear'); assert(h.controller.result);
    h.setConfirm(() => true); h.click('Cancel / clear'); assert.equal(h.external.value, ''); assert.equal(h.controller.result, null); assert.equal(h.view.hasUncommittedWork(), false);
    h.input(h.external, 'Close volatile draft'); h.view.destroy(); assert.equal(h.external.value, ''); assert.equal(h.output.value, ''); assert.equal(h.controller.result, null); assert.equal(h.c.writes, 0);
});
for (const fail of ['before', 'after', 'readback']) test(`UI ${fail} uncertain save keeps load/reset/title locked and retry/verification explicit`, async () => {
    const h = await loadedUI(); h.input(h.title, 'Original manual title'); h.c.fail = fail; h.click('Save loaded'); await idle(h); const command = h.controller.saveCommand;
    assert(command); assert.equal(h.controller.saveUncertain, true); assert.equal(h.button('Load answer').disabled, true); assert.equal(h.external.disabled, true); assert.equal(h.title.disabled, true); assert.equal(h.button('Cancel / clear').disabled, true);
    h.input(h.external, 'Unloaded new answer'); h.button('Load answer').dispatch('click'); h.button('Cancel / clear').dispatch('click'); await settle(); assert.equal(h.controller.saveCommand, command);
    if (fail === 'before') { h.click('Check earlier save'); await idle(h); assert.equal(h.controller.saveCommand, command); h.click('Save loaded'); await idle(h); }
    else { h.click('Check earlier save'); await idle(h); }
    assert.equal((await h.legacyStore.read()).records.length, 1); assert.equal(h.controller.saveCommand, null); assert.equal(h.controller.saved, true); assert.equal(h.c.writes, fail === 'before' ? 2 : 1); noExternal(h);
});
test('UI read-only preview renders manual HTML, links and images safely without changing copy/save text', async () => {
    const copied = [], h = await loadedUI(original, { safeReader: true, clipboard: { writeText: async text => copied.push(text) } });
    assert(h.host.querySelector('.answer-reader')); assert.equal(h.host.querySelectorAll('a,img,script,iframe').length, 0); assert.equal(h.output.hidden, true);
    h.click('Original text'); assert(h.host.querySelectorAll('.answer-reader-source').some(item => item.textContent === original)); h.click('Copy answer'); await settle(); assert.deepEqual(copied, [original]);
    h.input(h.title, 'Literal manual preview'); h.click('Save loaded'); await idle(h); assert.equal((await h.legacyStore.read()).records[0].body, original); noExternal(h);
});
test('both locales provide all shared external-answer controls, privacy and honest origin labels', () => {
    for (const locale of ['en', 'zh_CN']) {
        const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        for (const suffix of ['ExternalAnswer', 'ExternalAnswerHelp', 'ExternalAnswerInput', 'ExternalAnswerResponse', 'ExternalAnswerProvenance', 'ExternalAnswerSave', 'ExternalAnswerLoad', 'ExternalAnswerReplace', 'ExternalAnswerLoaded', 'ExternalAnswerInvalid', 'ExternalAnswerContextUnavailable', 'ExternalAnswerCapacity', 'ExternalDraftDiscard']) assert(messages[`aiContext${suffix}`]?.message);
    }
});
test('manual invalid title refuses before command creation and leaves the valid loaded answer repairable', async () => {
    const h = setup(); await load(h); const result = h.controller.result, active = h.calls.active;
    const invalid = [
        ['', 'LIMIT'], [' \t', 'LIMIT'], ['x'.repeat(201), 'LIMIT'], ['\ud800', 'LIMIT'],
        ['bad\u0000title', 'ANSWER_TITLE'], ['tab\ttitle', 'ANSWER_TITLE'], ['new\nline', 'ANSWER_TITLE'],
        ['carriage\rreturn', 'ANSWER_TITLE'], ['delete\u007f', 'ANSWER_TITLE']
    ];
    for (const [title, code] of invalid) {
        await assert.rejects(h.controller.saveAnswer(title), { code }); assert.equal(h.controller.saveCommand, null); assert.equal(h.controller.saveUncertain, false); assert.equal(h.controller.result, result);
    }
    assert.equal(h.calls.active, active); assert.equal(h.c.writes, 0); await h.controller.saveAnswer('Repaired manual title'); assert.equal(h.c.writes, 1); noExternal(h);
});
test('UI capacity refusal retains full loaded body, title and unparsed draft without a locked command', async () => {
    const h = await loadedUI(original); await fill(h, 200, 'Existing synthetic'); const before = h.c.snapshot(), writes = h.c.writes;
    h.input(h.title, 'Capacity title'); h.input(h.external, 'Keep unparsed draft'); h.click('Save loaded'); await idle(h);
    assert.equal(h.controller.saveCommand, null); assert.equal(h.controller.saved, false); assert.equal(h.controller.result.text, original); assert.equal(h.title.value, 'Capacity title'); assert.equal(h.external.value, 'Keep unparsed draft');
    assert.deepEqual(h.c.snapshot(), before); assert.equal(h.c.writes, writes); assert.equal(h.external.disabled, false); assert.equal(h.button('Save loaded').disabled, false); assert.match(h.host.querySelector('.ai-context-status').textContent, /global AI collection.*Nothing was written/);
});
test('UI repeated manual Save shares pending operation and saved result prevents another append', async () => {
    const h = await loadedUI(); h.input(h.title, 'Once'); const release = h.hold(); h.click('Save loaded'); const save = h.button('Save loaded'); save.dispatch('click'); release(); await idle(h);
    assert.equal(h.c.writes, 1); save.dispatch('click'); await settle(); assert.equal(h.c.writes, 1); assert.equal((await h.legacyStore.read()).records.length, 1);
});
test('manual UI does not silently drop programmatic context opt-in', async () => {
    const h = await loadedUI(); h.input(h.title, 'Manual title'); const option = h.host.querySelector('.ai-context-save-context').querySelector('input');
    assert.equal(option.disabled, true); option.checked = true; option.dispatch('change'); h.click('Save loaded'); await idle(h);
    assert.match(h.host.querySelector('.ai-context-status').textContent, /cannot be saved with.*snapshot/); assert.equal(h.c.writes, 0); assert.equal(h.controller.saveCommand, null);
});
