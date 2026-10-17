const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-prompts-store');
const Collections = require('../shared/local-ai-collections-store');
const Client = require('../shared/ai-model-client');
const { setup, add, tick } = require('./helpers/prompts-harness');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const ANSWER = 'Synthetic completed answer\r\n  Keep exact text.';
const click = async button => { button.dispatch('click'); await tick(); };
async function until(predicate, message) {
    const deadline = Date.now() + 2000;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(predicate(), message);
}

// Full View and real prompt/collection stores: only local backend IO and the
// provider's byte stream are synthetic. Never contact a provider or use a key.
async function mount({ uncertain = false, writeGate, body = 'Synthetic source body' } = {}) {
    const h = setup(), doc = createDocument({ blurUnavailableFocus: true }), handlers = new Map();
    let raw, writes = 0, ids = 0, requests = 0, runs = 0, queue = Promise.resolve();
    const listeners = new Set(), operations = [];
    const backend = {
        lock(fn) { const result = queue.then(fn); queue = result.catch(() => {}); return result; },
        async read() { return structuredClone(raw); },
        async readPromptState() { return h.raw; },
        async write(value) {
            writes++; raw = structuredClone(value); for (const listener of listeners) listener();
            if (writeGate) await writeGate.promise;
            if (uncertain) { uncertain = false; throw Error('Synthetic uncertainty after committed write'); }
        },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
    };
    const collectionStore = new Collections.Store(backend, { id: () => `receipt_test_${String(++ids).padStart(8, '0')}`, now: () => '2026-10-17T00:00:00.000Z' });
    const request = collectionStore.request.bind(collectionStore), mutate = collectionStore.mutate.bind(collectionStore);
    // Bridge VM literals into the Node Store realm without changing production validation.
    collectionStore.request = (kind, values) => { requests++; return request(kind, structuredClone(values)); };
    collectionStore.mutate = (command, validator) => { operations.push(command); return mutate(command, validator); };
    h.controller.collectionStore = collectionStore;
    const root = {
        document: doc, LocalItabPrompts: Core,
        LocalItabAIModel: { ...Client, run: (reviewed, options) => {
            runs++;
            return Client.run(reviewed, { ...options, fetcher: async () => new Response(new ReadableStream({ start(controller) {
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: ANSWER }, finish_reason: null }] })}\n\n`));
                controller.enqueue(new TextEncoder().encode('data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
                controller.close();
            } }), { headers: { 'content-type': 'text/event-stream' } }) });
        } },
        chrome: { permissions: { contains: async () => true, request: async () => { assert.fail('No permission grant expected'); } } },
        confirm: () => true, location: { assign() { assert.fail('No navigation expected'); } },
        addEventListener(name, fn) { if (!handlers.has(name)) handlers.set(name, new Set()); handlers.get(name).add(fn); },
        removeEventListener(name, fn) { handlers.get(name)?.delete(fn); }
    };
    const context = vm.createContext({ window: root, AbortController, setTimeout, clearTimeout, Intl, Date, Object, Array, Boolean, String, Promise });
    for (const file of ['shared/dialog-focus.js', 'shared/local-prompts-view.js', 'shared/ai-model-view.js']) vm.runInContext(fs.readFileSync(`${__dirname}/../${file}`, 'utf8'), context);
    const catalog = JSON.parse(fs.readFileSync(`${__dirname}/../_locales/en/messages.json`, 'utf8'));
    const host = doc.createElement('div'); doc.body.append(host);
    const view = new root.LocalItabPromptsView.View({ host, controller: h.controller, translate: (key, fallback) => catalog[`prompts${key}`]?.message || fallback });
    view.modelCollectionStore = collectionStore; view.render(); await h.controller.start();
    await add(h.controller, 'Source synthetic prompt', body); const sourceId = h.controller.record().id;
    await add(h.controller, 'Other synthetic prompt', 'Unrelated synthetic body'); const otherId = h.controller.record().id;
    h.controller.select(sourceId); if (body.includes('{{topic}}')) h.controller.setVariable('topic', 'original synthetic value'); await tick();
    let ui; const open = root.LocalItabAIModelView.open; root.LocalItabAIModelView.open = args => (ui = open(args));
    const button = Array.from(view.main.querySelectorAll('button')).find(node => node.textContent === 'Run with your model');
    assert.ok(button); await click(button); assert.ok(ui);
    ui.url.value = 'https://synthetic.test/v1/chat/completions'; ui.model.value = 'synthetic-model';
    ui.streaming.checked = true; ui.streaming.dispatch('change'); await click(ui.review); await click(ui.send);
    await until(() => !ui.save.disabled, 'real synthetic SSE completed');
    assert.equal(ui.output.value, ANSWER); assert.equal(runs, 1); assert.equal(writes, 0);
    return { h, ui, view, collectionStore, operations, otherId, sourceId,
        get raw() { return structuredClone(raw); }, get writes() { return writes; }, get requests() { return requests; }, get runs() { return runs; },
        pagehide() { for (const handler of [...handlers.get('pagehide')]) handler({ persisted: true }); },
        async renameOther() {
            const record = h.controller.record(otherId);
            await h.store.mutate(h.store.request('edit', { id: record.id, version: record.version, title: `${record.title} renamed` }));
            await until(() => h.controller.pendingReadGeneration === null && h.controller.record(otherId).title.endsWith(' renamed'), 'subscribed prompt refresh completed');
        },
        async save() { ui.save.dispatch('click'); await until(() => !ui.close.disabled, 'save outcome settled'); },
        dispose() { h.controller.dispose(); }
    };
}

async function assertCommittedOnce(fixture) {
    const result = await fixture.collectionStore.inspectOperation(fixture.operations[0]);
    assert.equal(result.committed, true); assert.equal(result.state.records.length, 1);
    assert.equal(result.state.records[0].body, ANSWER); assert.equal(fixture.writes, 1);
}

test('stream receipt: unrelated subscribed prompt edit preserves completed uncertain save and exact receipt retry', async t => {
    const f = await mount({ uncertain: true }); t.after(() => f.dispose());
    await f.save(); assert.match(f.ui.status.textContent, /Could not confirm the save/); assert.equal(f.ui.save.disabled, false);
    const source = JSON.stringify(f.h.controller.record()), feedback = f.ui.status.textContent;
    await f.renameOther();
    assert.equal(JSON.stringify(f.h.controller.record()), source);
    assert.equal(f.ui.output.value, ANSWER); assert.equal(f.ui.output.hidden, false); assert.equal(f.ui.status.textContent, feedback);
    assert.equal(f.ui.save.disabled, false); assert.equal(f.runs, 1); assert.equal(f.operations.length, 1);
    await assertCommittedOnce(f); await f.save();
    assert.equal(f.operations.length, 2); assert.equal(f.operations[0], f.operations[1]); assert.equal(f.requests, 1);
    assert.match(f.ui.status.textContent, /Saved to your AI collection/); assert.equal(f.ui.save.disabled, true); await assertCommittedOnce(f);
});

for (const existingCommand of [false, true]) test(`stream receipt: pending and failed reads preserve ${existingCommand ? 'uncertain command' : 'unsaved answer'} until same-source recovery`, async t => {
    const f = await mount({ uncertain: existingCommand }); t.after(() => f.dispose());
    if (existingCommand) await f.save();
    const operations = f.operations.length, writes = f.writes, feedback = f.ui.status.textContent;
    const pending = deferred(), read = f.h.backend.read; f.h.backend.read = () => pending.promise;
    const refreshing = f.h.controller.refresh();
    assert.equal(f.ui.output.value, ANSWER); assert.equal(f.ui.save.disabled, true); assert.equal(f.ui.close.disabled, false);
    assert.match(f.ui.sourceStatus.textContent, /Checking.*source/i); assert.equal(f.ui.status.textContent, feedback);
    await click(f.ui.save); assert.equal(f.operations.length, operations); assert.equal(f.writes, writes);
    pending.resolve(f.h.raw); await refreshing;
    assert.equal(f.ui.output.value, ANSWER); assert.equal(f.ui.save.disabled, false); assert.equal(f.ui.sourceStatus.hidden, true);
    assert.equal(f.operations.length, operations); assert.equal(f.runs, 1);
    f.h.backend.read = async () => { throw Error('Synthetic private read failure'); }; await f.h.controller.refresh();
    assert.equal(f.ui.output.value, ANSWER); assert.equal(f.ui.save.disabled, true);
    assert.match(f.ui.sourceStatus.textContent, /Could not verify.*source/i); assert.doesNotMatch(f.ui.sourceStatus.textContent, /Synthetic private/);
    await click(f.ui.save); assert.equal(f.operations.length, operations);
    const retry = Array.from(f.ui.overlay.querySelectorAll('button')).find(button => button.textContent === 'Retry source check');
    assert.ok(retry?.isConnected); assert.equal(retry.hidden, false); assert.equal(retry.disabled, false);
    assert.equal(f.view.host.inert, true, 'the background reload action cannot be used through the modal');
    await click(retry);
    await until(() => f.h.controller.pendingReadGeneration === null, 'explicit source retry failure settled');
    assert.equal(f.ui.output.value, ANSWER); assert.equal(f.ui.status.textContent, feedback);
    assert.equal(retry.hidden, false); assert.equal(retry.disabled, false);
    const retryRead = deferred(); let reads = 0; f.h.backend.read = () => { reads++; return retryRead.promise; };
    retry.focus(); retry.dispatch('click'); retry.dispatch('click'); await tick();
    assert.equal(reads, 1); assert.equal(retry.disabled, true); assert.equal(f.ui.save.disabled, true);
    assert.equal(f.view.doc.activeElement, f.ui.sourceStatus);
    if (existingCommand) f.ui.close.focus();
    retryRead.resolve(f.h.raw); await until(() => f.h.controller.pendingReadGeneration === null, 'explicit same-source retry recovered');
    f.h.backend.read = read;
    assert.equal(f.view.doc.activeElement, existingCommand ? f.ui.close : f.ui.status);
    assert.equal(retry.hidden, true); assert.equal(f.ui.save.disabled, false); assert.equal(f.ui.sourceStatus.hidden, true); assert.equal(f.ui.status.textContent, feedback);
    assert.equal(f.operations.length, operations); assert.equal(f.writes, writes); assert.equal(f.runs, 1);
    await f.save(); assert.equal(f.requests, 1); assert.match(f.ui.status.textContent, /Saved to your AI collection/);
    if (existingCommand) assert.equal(f.operations[0], f.operations[1]);
    await assertCommittedOnce(f);
});

test('stream receipt: source refresh during pending committed save keeps answer and blocks duplicate or early retry', async t => {
    const writeGate = deferred(), f = await mount({ uncertain: true, writeGate }); t.after(() => f.dispose());
    f.ui.save.dispatch('click'); await until(() => f.writes === 1, 'write reached backend');
    await f.renameOther();
    assert.equal(f.ui.output.value, ANSWER); assert.equal(f.ui.save.disabled, true); assert.equal(f.ui.close.disabled, true);
    await click(f.ui.save); await click(f.ui.close); assert.equal(f.operations.length, 1); assert.equal(f.view.openDialog, true);
    writeGate.resolve(); await until(() => !f.ui.close.disabled, 'uncertain write settled');
    assert.equal(f.ui.output.value, ANSWER); assert.equal(f.ui.save.disabled, false); assert.match(f.ui.status.textContent, /Could not confirm/);
    await f.save(); assert.equal(f.operations[0], f.operations[1]); assert.equal(f.requests, 1); assert.equal(f.runs, 1); await assertCommittedOnce(f);
});

for (const change of ['metadata', 'body', 'deletion', 'selection', 'preview', 'session', 'pagehide']) test(`stream receipt: real ${change} change retains the existing completed-answer interruption boundary`, async t => {
    const f = await mount({ uncertain: true, body: change === 'preview' ? 'Synthetic {{topic}}' : undefined }); t.after(() => f.dispose());
    await f.save(); const record = f.h.controller.record();
    if (change === 'metadata') {
        await f.h.store.mutate(f.h.store.request('edit', { id: record.id, version: record.version, title: 'Actually renamed source' }));
        await until(() => f.h.controller.pendingReadGeneration === null && f.h.controller.record().version !== record.version, 'changed source metadata loaded');
        assert.equal(f.h.controller.record().body, record.body);
    }
    if (change === 'body' || change === 'deletion') {
        await f.h.store.mutate(f.h.store.request(change === 'body' ? 'edit' : 'remove', { id: record.id, version: record.version, ...(change === 'body' ? { body: 'Actually changed source' } : {}) }));
        await until(() => f.h.controller.pendingReadGeneration === null && (change === 'body' ? f.h.controller.record().body !== record.body : f.h.controller.record().deletedAt), 'changed source loaded');
    }
    if (change === 'selection') f.h.controller.select(f.otherId);
    if (change === 'preview') f.h.controller.setVariable('topic', 'changed synthetic value');
    if (change === 'session') f.h.controller.clearPreviewSessions();
    if (change === 'pagehide') f.pagehide();
    assert.equal(f.ui.output.value, ''); assert.equal(f.ui.output.hidden, true); assert.equal(f.ui.save.disabled, true);
    assert.match(f.ui.status.textContent, /source changed or.*interrupted/);
    await click(f.ui.save); assert.equal(f.operations.length, 1); assert.equal(f.requests, 1); assert.equal(f.runs, 1); await assertCommittedOnce(f);
});

test('stream receipt: pending read does not mask a real local session change', async t => {
    const f = await mount({ uncertain: true }); t.after(() => f.dispose()); await f.save();
    const pending = deferred(), read = f.h.backend.read; f.h.backend.read = () => pending.promise;
    const refreshing = f.h.controller.refresh(); f.h.controller.clearPreviewSessions();
    assert.equal(f.ui.output.value, ''); assert.equal(f.ui.save.disabled, true);
    pending.resolve(f.h.raw); await refreshing; f.h.backend.read = read;
    assert.equal(f.ui.output.value, ''); assert.equal(f.ui.save.disabled, true);
    await click(f.ui.save); assert.equal(f.operations.length, 1); assert.equal(f.runs, 1); await assertCommittedOnce(f);
});
