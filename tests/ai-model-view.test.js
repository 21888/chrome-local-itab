const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-prompts-store');
const Client = require('../shared/ai-model-client');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const { setup, add, tick, settle } = require('./helpers/prompts-harness');
async function mount({ run, contains = async () => true, request = async () => true, mutate = async () => {}, presetStore, mode = 'run', body = 'Synthetic input <script>text</script>' } = {}) {
    const h = setup(); await h.controller.start(); await add(h.controller, 'Synthetic prompt', body);
    const doc = createDocument({ blurUnavailableFocus: true }), events = new Map(); let runs = 0, grants = 0, writes = 0, command;
    const root = { document: doc, LocalItabPrompts: Core, LocalItabAIPromptRefinement: require('../shared/ai-prompt-refinement'), LocalItabAIModel: { ...Client, run: async (...args) => { runs++; return run ? run(...args) : { text: '<script>synthetic output</script>', model: 'fixture-model', origin: 'https://synthetic.test' }; } },
        chrome: { permissions: { contains, request: async (...args) => { grants++; return request(...args); } } }, confirm: () => true,
        addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
    const context = vm.createContext({ window: root, AbortController });
    for (const file of ['shared/dialog-focus.js', 'shared/ai-model-comparison.js', 'shared/ai-model-view.js']) vm.runInContext(fs.readFileSync(`${__dirname}/../${file}`, 'utf8'), context);
    const view = { doc, controller: h.controller, t: (_, fallback) => fallback,
        el(tag, className, text) { const el = doc.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; },
        button(name, fallback, action) { const b = this.el('button', '', fallback); b.addEventListener('click', action); return b; } };
    const store = { request(kind, values) { return { kind, ...values, operationId: 'synthetic_operation' }; }, async mutate(value, validator) { writes++; command = value; assert.equal(validator(h.raw, value.promptRef), true); return mutate(value); } };
    const ui = root.LocalItabAIModelView.open({ view, collectionStore: store, presetStore, mode });
    ui.url.value = 'https://synthetic.test/v1/chat/completions'; ui.model.value = 'fixture-model';
    return { h, ui, root, events, doc, view, get runs() { return runs; }, get grants() { return grants; }, get writes() { return writes; }, get command() { return command; } };
}
const click = async button => { button.dispatch('click'); await tick(); };
test('open, edit, review and exact-origin grant do not send; explicit send/save are separate', async () => {
    const h = await mount({ request: async options => { assert.deepEqual(Array.from(options.origins), ['https://synthetic.test:443/*']); return true; } });
    assert.equal(h.runs, 0); assert.equal(h.writes, 0); assert.equal(h.ui.send.disabled, true);
    await click(h.ui.review); assert.equal(h.runs, 0); await click(h.ui.allow); assert.equal(h.runs, 0); assert.equal(h.grants, 1);
    h.ui.key.value = 'synthetic-key'; await click(h.ui.send); assert.equal(h.runs, 1); assert.equal(h.writes, 0); assert.equal(h.ui.key.value, '');
    assert.equal(h.ui.output.value, '<script>synthetic output</script>'); assert.equal(h.doc.querySelectorAll('script, iframe, img').length, 0);
    await click(h.ui.save); await click(h.ui.save); assert.equal(h.writes, 1); assert.equal(h.command.promptRef.promptId, h.h.controller.record().id); assert.doesNotMatch(JSON.stringify(h.command), /synthetic-key/);
    await click(h.ui.close); h.h.controller.dispose();
});
test('URL edit invalidates review and clears credential; denied access sends nothing', async () => {
    const h = await mount({ contains: async () => false }); await click(h.ui.review); h.ui.key.value = 'synthetic-key'; h.ui.url.dispatch('input');
    assert.equal(h.ui.key.value, ''); assert.equal(h.ui.send.disabled, true); await click(h.ui.send); assert.equal(h.runs, 0);
    await click(h.ui.review); await click(h.ui.send); assert.equal(h.runs, 0); assert.match(h.ui.status.textContent, /not granted/); await click(h.ui.close); h.h.controller.dispose();
});
test('duplicate send and grant are guarded; cancelling ignores late successful response', async () => {
    const permission = deferred(), run = deferred(); const h = await mount({ request: () => permission.promise, run: () => run.promise });
    await click(h.ui.review); h.ui.allow.dispatch('click'); h.ui.allow.dispatch('click'); assert.equal(h.grants, 1); h.ui.send.dispatch('click'); assert.equal(h.runs, 0);
    permission.resolve(true); await tick(); h.ui.send.dispatch('click'); h.ui.send.dispatch('click'); await tick(); assert.equal(h.runs, 1);
    await click(h.ui.cancel); run.resolve({ text: 'late', model: 'fixture', origin: 'https://synthetic.test' }); await tick();
    assert.equal(h.ui.output.hidden, true); assert.equal(h.writes, 0); assert.equal(h.ui.save.disabled, true); await click(h.ui.close); h.h.controller.dispose();
});
test('pagehide clears key, invalidates review and suppresses late output; fresh review required', async () => {
    const pending = deferred(); const h = await mount({ run: () => pending.promise }); await click(h.ui.review); h.ui.key.value = 'synthetic-key'; await click(h.ui.send);
    h.events.get('pagehide')(); pending.resolve({ text: 'late', model: 'fixture', origin: 'https://synthetic.test' }); await tick();
    assert.equal(h.ui.key.value, ''); assert.equal(h.ui.send.disabled, true); assert.equal(h.ui.output.hidden, true); await click(h.ui.send); assert.equal(h.runs, 1);
    await click(h.ui.review); assert.equal(h.ui.send.disabled, false); await click(h.ui.close); h.h.controller.dispose();
});
test('uncertain save retries exact operation and closing while save pending is prevented', async () => {
    const pending = deferred(); let count = 0; const values = [];
    const h = await mount({ mutate: async value => { values.push(value); if (++count === 1) throw new Error('private error'); return pending.promise; } });
    await click(h.ui.review); await click(h.ui.send); await click(h.ui.save); assert.match(h.ui.status.textContent, /Could not confirm/);
    h.ui.save.dispatch('click'); await tick(); await click(h.ui.close); assert.equal(h.view.openDialog, true); assert.equal(values[0], values[1]);
    pending.resolve(); await tick(); await click(h.ui.close); assert.equal(h.view.openDialog, false); h.h.controller.dispose();
});
test('disposed prompt controller cannot send, grant or save a stale dialog', async () => {
    const h = await mount(); await click(h.ui.review); h.h.controller.dispose();
    await click(h.ui.allow); await click(h.ui.send); await click(h.ui.save); assert.equal(h.grants, 0); assert.equal(h.runs, 0); assert.equal(h.writes, 0);
    await click(h.ui.close);
});
test('all model labels and errors have both locales and packaged runtime is declared', () => {
    const source = fs.readFileSync(`${__dirname}/../shared/ai-model-view.js`, 'utf8');
    const keys = new Set([...source.matchAll(/\b(?:t|button|field)\('([A-Za-z]+)', /g), ...source.matchAll(/\['([A-Za-z]+)', '[^']*'\]/g)].map(match => `promptsModel${match[1]}`));
    for (const language of ['en', 'zh_CN']) { const catalog = JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${language}/messages.json`, 'utf8')); for (const key of keys) assert.ok(catalog[key]?.message, `${language} ${key}`); }
    const inventory = fs.readFileSync(`${__dirname}/../tools/package_extension.py`, 'utf8');
    for (const file of ['shared/ai-model-client.js', 'shared/ai-model-presets.js', 'shared/ai-model-view.js', 'shared/ai-prompt-refinement.js', 'ai-model.css']) assert.ok(inventory.includes(`"${file}"`));
});

const Presets = require('../shared/ai-model-presets');
function presetFixture() {
    let state = { version: 1, records: [{ name: '<b>Synthetic</b>', url: 'https://synthetic.test/v1/chat/completions', model: 'fixture-model' }] };
    let writes = 0;
    const store = Presets.createStore({ chromeApi: { storage: { local: { get: async () => ({ [Presets.KEY]: state }), set: async value => { writes++; state = structuredClone(value[Presets.KEY]); } } } }, locks: { request: (_, fn) => fn() } });
    return { store, get writes() { return writes; }, get state() { return state; } };
}
test('preset selection, edit, explicit save and delete never grant or send and clear credentials/review', async () => {
    const f = presetFixture(), h = await mount({ presetStore: f.store }); await tick();
    assert.equal(h.ui.presetSelect.value, ''); assert.equal(f.writes, 0);
    await click(h.ui.review); h.ui.key.value = 'synthetic-secret';
    h.ui.presetSelect.value = '0'; h.ui.presetSelect.dispatch('change');
    assert.equal(h.ui.key.value, ''); assert.equal(h.ui.send.disabled, true); assert.equal(h.ui.presetName.value, '<b>Synthetic</b>');
    assert.equal(h.doc.querySelectorAll('b').length, 0);
    h.ui.presetName.value = 'Renamed'; h.ui.model.value = 'other'; h.ui.model.dispatch('input'); assert.equal(f.writes, 0);
    await click(h.ui.presetSave); assert.equal(f.writes, 1); assert.equal(f.state.records[0].model, 'other');
    assert.deepEqual(Object.keys(f.state.records[0]), ['name', 'url', 'model']);
    await click(h.ui.review); await click(h.ui.presetDelete); assert.equal(f.writes, 2); assert.equal(h.ui.url.value, ''); assert.equal(h.ui.send.disabled, true);
    assert.equal(h.grants, 0); assert.equal(h.runs, 0); await click(h.ui.close); h.h.controller.dispose();
});
test('preset async read failure preserves manual mode and late read cannot reopen a closed dialog', async () => {
    const h = await mount({ presetStore: { read: async () => { throw Error('private'); } } }); await tick();
    assert.equal(h.ui.url.disabled, false); assert.equal(h.ui.presetSave.disabled, true); assert.doesNotMatch(h.ui.status.textContent, /private/);
    await click(h.ui.review); assert.equal(h.ui.send.disabled, false); await click(h.ui.close); h.h.controller.dispose();
    const pending = deferred(), late = await mount({ presetStore: { read: () => pending.promise } });
    await click(late.ui.close); pending.resolve({ version: 1, records: [] }); await tick(); assert.equal(late.view.openDialog, false); late.h.controller.dispose();
});
test('preset write pending blocks review and sends; closing ignores late completion and clears key', async () => {
    const pending = deferred(); const f = presetFixture();
    const h = await mount({ presetStore: { read: () => f.store.read(), save: () => pending.promise } }); await tick();
    h.ui.key.value = 'synthetic-secret'; h.ui.presetName.value = 'Saved'; h.ui.presetSave.dispatch('click');
    assert.equal(h.ui.key.value, ''); assert.equal(h.ui.review.disabled, true); await click(h.ui.review); await click(h.ui.send); assert.equal(h.runs, 0);
    await click(h.ui.close); pending.resolve({ version: 1, records: [{ name: 'Saved', url: h.ui.url.value, model: h.ui.model.value }] }); await tick(); assert.equal(h.view.openDialog, false); h.h.controller.dispose();
});

test('refinement sends only reviewed current stored template and instruction; explicit accept preserves history', async () => {
    let sent;
    const h = await mount({ mode: 'refine', body: 'Explain {{topic}}.', run: async request => { sent = request; return { text: 'Explain {{topic}} clearly.', model: 'fixture', origin: 'https://synthetic.test' }; } });
    h.h.controller.setVariable('topic', 'PRIVATE FILLED VALUE');
    h.ui.instruction.value = 'Be clearer'; await click(h.ui.review);
    assert.match(h.ui.reviewText.textContent, /synthetic.test/); assert.match(h.ui.prompt.value, /Be clearer/);
    assert.match(h.ui.prompt.value, /Explain \{\{topic\}\}\./); assert.doesNotMatch(h.ui.prompt.value, /PRIVATE FILLED VALUE/);
    const beforeWrites = h.h.writes; await click(h.ui.send);
    assert.equal(h.h.writes, beforeWrites); assert.equal(sent.prompt, h.ui.prompt.value);
    assert.equal(h.ui.before.value, 'Explain {{topic}}.'); assert.equal(h.ui.output.value, 'Explain {{topic}} clearly.');
    await click(h.ui.save); await settle(h.h.controller); await click(h.ui.save);
    assert.equal(h.h.writes, beforeWrites + 1, h.ui.status.textContent + JSON.stringify(h.h.controller.error)); assert.equal(h.h.controller.record().body, 'Explain {{topic}} clearly.');
    assert.equal(h.h.controller.record().history[0].body, 'Explain {{topic}}.');
    assert.equal(h.h.controller.record().history.length, 2); await click(h.ui.close); h.h.controller.dispose();
});
test('refinement instruction edits invalidate review and missing or semantically changed placeholders cannot be accepted', async () => {
    for (const proposal of ['Explain topic.', 'Explain \\{{topic}}.']) {
        const h = await mount({ mode: 'refine', body: 'Explain {{topic}}.', run: async () => ({ text: proposal }) });
        h.ui.instruction.value = 'Be clearer'; await click(h.ui.review); h.ui.key.value = 'synthetic-key';
        h.ui.instruction.dispatch('input'); assert.equal(h.ui.send.disabled, true); assert.equal(h.ui.key.value, '');
        await click(h.ui.review); const writes = h.h.writes; await click(h.ui.send); await click(h.ui.save);
        assert.equal(h.h.writes, writes); assert.match(h.ui.status.textContent, /placeholders/);
        await click(h.ui.close); h.h.controller.dispose();
    }
});
test('refinement rejects source edits before send and before accept; uncertain save reuses receipt', async () => {
    const stale = await mount({ mode: 'refine', run: async () => ({ text: 'New proposal' }) });
    stale.ui.instruction.value = 'Improve'; await click(stale.ui.review);
    await stale.h.store.mutate(stale.h.store.request('edit', { id: stale.h.controller.record().id, version: stale.h.controller.record().version, body: 'Changed elsewhere' })); await tick();
    await click(stale.ui.send); assert.equal(stale.runs, 0); assert.match(stale.ui.status.textContent, /source or workspace changed/);
    await click(stale.ui.close); stale.h.controller.dispose();
    const h = await mount({ mode: 'refine', run: async () => ({ text: 'New proposal' }) });
    h.ui.instruction.value = 'Improve'; await click(h.ui.review); await click(h.ui.send);
    h.h.failOnce(); const writes = h.h.writes; await click(h.ui.save); await settle(h.h.controller);
    assert.ok(h.h.controller.pendingCommand, h.ui.status.textContent + JSON.stringify(h.h.controller.error)); const operation = h.h.controller.pendingCommand;
    await click(h.ui.save); await settle(h.h.controller); assert.equal(h.h.writes, writes + 1); assert.equal(h.h.controller.pendingCommand, null);
    assert.equal(h.h.controller.record().history.length, 2); assert.equal(operation.command.body, 'New proposal');
    await click(h.ui.close); h.h.controller.dispose();
});
test('proposal acceptance rejects changed/deleted sources and history capacity without bypass', async () => {
    for (const kind of ['edit', 'remove', 'history']) {
        const h = await mount({ mode: 'refine', run: async () => ({ text: 'New proposal' }) });
        if (kind === 'history') {
            const raw = h.h.raw, record = raw.records[0];
            record.history = Array.from({ length: Core.LIMITS.versions }, (_, i) => ({ id: `synthetic_history_${i}`, body: record.body, createdAt: record.createdAt }));
            record.currentVersionId = record.history.at(-1).id;
            await h.h.backend.write(raw); await tick(); h.h.controller.clearPreviewSessions(); await click(h.ui.close);
            h.ui = h.root.LocalItabAIModelView.open({ view: h.view, mode: 'refine' }); h.ui.url.value = 'https://synthetic.test/v1/chat/completions'; h.ui.model.value = 'fixture-model';
        }
        h.ui.instruction.value = 'Improve'; await click(h.ui.review); await click(h.ui.send);
        if (kind !== 'history') {
            const record = h.h.controller.record();
            await h.h.store.mutate(h.h.store.request(kind, { id: record.id, version: record.version, ...(kind === 'edit' ? { body: 'External change' } : {}) })); await tick();
        }
        const writes = h.h.writes; await click(h.ui.save); await settle(h.h.controller);
        assert.equal(h.h.writes, writes); assert.match(h.ui.status.textContent, kind === 'history' ? /history limit/ : /source or workspace changed/);
        await click(h.ui.close); h.h.controller.dispose();
    }
});
test('refinement uses current saved body when historical preview is selected and never filled variables', async () => {
    const h = await mount({ mode: 'refine', body: 'Old {{topic}}' }); await click(h.ui.close);
    const record = h.h.controller.record(), original = record.currentVersionId;
    await h.h.store.mutate(h.h.store.request('edit', { id: record.id, version: record.version, body: 'Current {{topic}}' })); await tick();
    h.h.controller.useVersion(original, 'Old {{topic}}'); h.h.controller.setVariable('topic', 'PRIVATE');
    h.ui = h.root.LocalItabAIModelView.open({ view: h.view, mode: 'refine' }); h.ui.url.value = 'https://synthetic.test/v1/chat/completions'; h.ui.model.value = 'fixture-model';
    h.ui.instruction.value = 'Improve'; await click(h.ui.review);
    assert.equal(h.ui.before.value, 'Current {{topic}}'); assert.match(h.ui.prompt.value, /Current/); assert.doesNotMatch(h.ui.prompt.value, /Old|PRIVATE/);
    await click(h.ui.close); h.h.controller.dispose();
});
test('pagehide and close invalidate received refinement proposals and pending late responses', async () => {
    for (const action of ['pagehide', 'close', 'stop']) {
        const pending = deferred(), h = await mount({ mode: 'refine', run: () => pending.promise });
        h.ui.instruction.value = 'Improve'; await click(h.ui.review); await click(h.ui.send);
        if (action === 'pagehide') h.events.get('pagehide')(); else await click(action === 'close' ? h.ui.close : h.ui.cancel);
        pending.resolve({ text: 'Late proposal' }); await tick(); const writes = h.h.writes;
        await click(h.ui.save); assert.equal(h.h.writes, writes); assert.equal(h.ui.output.hidden, true);
        await click(h.ui.close); h.h.controller.dispose();
    }
    for (const action of ['pagehide', 'close']) {
        const h = await mount({ mode: 'refine', run: async () => ({ text: 'Received proposal' }) });
        h.ui.instruction.value = 'Improve'; await click(h.ui.review); await click(h.ui.send); const writes = h.h.writes;
        if (action === 'pagehide') h.events.get('pagehide')(); else await click(h.ui.close);
        await click(h.ui.save); assert.equal(h.h.writes, writes);
        if (action === 'pagehide') { assert.equal(h.ui.output.hidden, true); await click(h.ui.review); await click(h.ui.save); assert.equal(h.h.writes, writes); }
        await click(h.ui.close); h.h.controller.dispose();
    }
});


test('refinement trial reviews two exact prompts with shared temporary mapping/model/key and never saves or accepts', async () => {
    const requests = [];
    const h = await mount({ mode: 'refine', body: 'Original {{topic}} / {{topic}} for {{reader}}', run: async (input, options) => {
        requests.push({ input, key: options.key });
        return { text: requests.length === 1 ? 'Improved {{topic}} / {{topic}} for {{reader}}' : `Answer ${requests.length}: ${input.prompt}`, model: input.model, origin: input.origin };
    } });
    h.h.controller.setVariable('topic', 'previous private input');
    h.ui.instruction.value = 'Make clearer'; await click(h.ui.review); await click(h.ui.send);
    const originalVersion = h.h.controller.record().currentVersionId;
    await click(h.ui.trialButton); const trial = h.ui.trial; await tick();
    assert.ok(trial); assert.equal(h.ui.overlay.hidden, true); assert.equal(h.runs, 1);
    assert.equal(trial.variables[0].input.value, ''); await click(trial.review);
    assert.equal(trial.send.disabled, true); assert.match(trial.status.textContent, /every test value/);
    for (const { name, input } of trial.variables) { input.value = name === 'topic' ? 'synthetic topic' : 'synthetic reader'; input.dispatch('input'); }
    await click(trial.review);
    assert.equal(h.runs, 1); assert.equal(h.grants, 0); assert.match(trial.status.textContent, /requests: 2/);
    assert.match(trial.status.textContent, /cost money/);
    assert.match(trial.targets[0].reviewText.textContent, /Original synthetic topic \/ synthetic topic for synthetic reader/);
    assert.match(trial.targets[1].reviewText.textContent, /Improved synthetic topic \/ synthetic topic for synthetic reader/);
    for (const target of trial.targets) { assert.match(target.reviewText.textContent, /https:\/\/synthetic.test\/v1\/chat\/completions/); assert.match(target.reviewText.textContent, /fixture-model/); assert.doesNotMatch(target.reviewText.textContent, /previous private input/); }
    trial.targets[0].key.value = 'synthetic-trial-key'; await click(trial.send); await click(trial.send);
    assert.equal(h.runs, 3); assert.equal(requests[1].key, 'synthetic-trial-key'); assert.equal(requests[2].key, 'synthetic-trial-key');
    assert.equal(Object.hasOwn(requests[2].input, 'promptRef'), false); assert.equal(Object.hasOwn(requests[2].input, 'bodyVersionId'), false);
    assert.equal(requests[1].input.model, requests[2].input.model); assert.equal(requests[1].input.url, requests[2].input.url);
    assert.match(trial.targets[0].heading.textContent, /Original saved template/); assert.match(trial.targets[1].heading.textContent, /Unsaved proposal/);
    for (const target of trial.targets) { assert.equal(target.key.value, ''); assert.equal(target.save.hidden, true); await click(target.save); assert.equal(target.output.hidden, false); }
    await click(h.ui.save); assert.equal(h.h.controller.record().currentVersionId, originalVersion); assert.equal(h.writes, 0);
    await click(trial.close); assert.equal(h.ui.trial, null); assert.equal(h.ui.overlay.hidden, false); assert.equal(h.view.openDialog, true);
    assert.equal(h.doc.activeElement === h.ui.trialButton, true); assert.equal(h.ui.output.value, 'Improved {{topic}} / {{topic}} for {{reader}}');
    for (const { input } of trial.variables) assert.equal(input.value, '');
    await click(h.ui.save); await settle(h.h.controller); assert.notEqual(h.h.controller.record().currentVersionId, originalVersion, h.ui.status.textContent + JSON.stringify(h.h.controller.error));
    assert.equal(h.h.controller.record().history.length, 2); assert.equal(h.writes, 0);
    await click(h.ui.close); h.h.controller.dispose();
});
test('trial value edits invalidate prior review and answers; new review never sends automatically', async () => {
    let count = 0; const h = await mount({ mode: 'refine', body: 'Original {{topic}}', run: async input => ({ text: ++count === 1 ? 'Improved {{topic}}' : input.prompt, model: input.model, origin: input.origin }) });
    h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send); await click(h.ui.trialButton); await tick();
    const trial = h.ui.trial, input = trial.variables[0].input; input.value = 'first'; input.dispatch('input'); await click(trial.review); await click(trial.send);
    assert.equal(h.runs, 3); input.value = 'second'; input.dispatch('input'); assert.equal(trial.send.disabled, true);
    for (const target of trial.targets) { assert.equal(target.output.value, ''); assert.equal(target.output.hidden, true); assert.equal(target.reviewText.textContent, ''); }
    await click(trial.send); assert.equal(h.runs, 3); await click(trial.review); assert.equal(h.runs, 3); assert.match(trial.targets[1].reviewText.textContent, /Improved second/);
    await click(trial.close); await click(h.ui.close); h.h.controller.dispose();
});
test('incompatible refinement proposal cannot enter trial and changed proposal invalidates pending trial', async () => {
    const h = await mount({ mode: 'refine', body: 'Original {{topic}}', run: async () => ({ text: 'Missing placeholders', model: 'fixture-model', origin: 'https://synthetic.test' }) });
    h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send); assert.equal(h.ui.trialButton.disabled, true); await click(h.ui.trialButton); assert.equal(h.ui.trial, null);
    await click(h.ui.close); h.h.controller.dispose();
    let count = 0; const pending = deferred(); const next = await mount({ mode: 'refine', body: 'Original', run: async input => ++count === 1 ? { text: 'Improved', model: input.model, origin: input.origin } : pending.promise });
    next.ui.instruction.value = 'Clarify'; await click(next.ui.review); await click(next.ui.send); await click(next.ui.trialButton); await tick(); const trial = next.ui.trial;
    await click(trial.review); trial.send.dispatch('click'); await tick(); next.ui.output.value = 'Changed proposal'; trial.checkSource();
    pending.resolve({ text: 'late unsafe answer', model: 'fixture-model', origin: 'https://synthetic.test' }); await tick();
    for (const target of trial.targets) { assert.equal(target.output.hidden, true); assert.equal(target.output.value, ''); }
    assert.equal(trial.send.disabled, true); await click(trial.close); await click(next.ui.close); next.h.controller.dispose();
});
test('trial permission wait is fenced against source refresh', async () => {
    const permission = deferred(); let checks = 0;
    const h = await mount({ mode: 'refine', body: 'Original', contains: async () => ++checks === 1 ? true : permission.promise, run: async input => ({ text: 'Improved', model: input.model, origin: input.origin }) });
    h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send); await click(h.ui.trialButton); await tick(); const trial = h.ui.trial;
    await click(trial.review); trial.targets[0].key.value = 'temporary'; trial.send.dispatch('click'); await tick(); await h.h.controller.refresh(); permission.resolve(true); await tick();
    assert.equal(h.runs, 1); assert.equal(trial.send.disabled, true); assert.equal(trial.targets[0].key.value, ''); await click(trial.close); assert.equal(h.ui.trialButton.disabled, true);
    await click(h.ui.save); assert.equal(h.h.controller.record().history.length, 1); await click(h.ui.close); h.h.controller.dispose();
});

test('trial close aborts both transports and preserves the separate proposal without late answers', async () => {
    const pending = deferred(), signals = []; let count = 0;
    const h = await mount({ mode: 'refine', body: 'Original', run: async (input, options) => {
        if (++count === 1) return { text: 'Improved', model: input.model, origin: input.origin };
        signals.push(options.signal); return pending.promise;
    } });
    h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send); await click(h.ui.trialButton); await tick(); const trial = h.ui.trial;
    assert.equal(h.doc.activeElement === trial.close, true);
    await click(trial.review); trial.send.dispatch('click'); await tick(); assert.equal(signals.length, 2);
    await click(trial.close); assert.equal(signals.every(signal => signal.aborted), true); assert.equal(h.ui.trial, null);
    pending.resolve({ text: 'late', model: 'fixture-model', origin: 'https://synthetic.test' }); await tick();
    for (const target of trial.targets) assert.equal(target.output.value, '');
    assert.equal(h.ui.output.value, 'Improved'); assert.equal(h.h.controller.record().history.length, 1); assert.equal(h.writes, 0);
    await click(h.ui.close); h.h.controller.dispose();
});
test('trial preserves one successful answer when the other fails and never retries automatically', async () => {
    let count = 0; const h = await mount({ mode: 'refine', body: 'Original', run: async input => {
        if (++count === 1) return { text: 'Improved', model: input.model, origin: input.origin };
        if (input.prompt === 'Original') throw { code: 'AUTH' };
        return { text: '<script>synthetic proposal answer</script>', model: input.model, origin: input.origin };
    } });
    h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send); await click(h.ui.trialButton); await tick(); const trial = h.ui.trial;
    await click(trial.review); await click(trial.send); await click(trial.send);
    assert.equal(h.runs, 3); assert.match(trial.targets[0].message.textContent, /failed/); assert.equal(trial.targets[0].output.hidden, true);
    assert.equal(trial.targets[1].output.value, '<script>synthetic proposal answer</script>'); assert.equal(h.doc.querySelectorAll('script').length, 0);
    assert.equal(h.h.controller.record().history.length, 1); await click(trial.close); await click(h.ui.close); h.h.controller.dispose();
});
test('trial rechecks chosen saved connection before sending either request', async () => {
    const f = presetFixture(); const h = await mount({ mode: 'refine', body: 'Original', presetStore: f.store, run: async input => ({ text: 'Improved', model: input.model, origin: input.origin }) }); await tick();
    h.ui.presetSelect.value = '0'; h.ui.presetSelect.dispatch('change'); h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send);
    await click(h.ui.trialButton); await tick(); const trial = h.ui.trial; await click(trial.review);
    f.state.records[0].model = 'changed model'; await click(trial.send); assert.equal(h.runs, 1); assert.equal(trial.send.disabled, true); assert.match(trial.status.textContent, /connection changed/);
    await click(trial.close); await click(h.ui.close); h.h.controller.dispose();
});

test('trial rejects divergent target selection and edited temporary values during async permission wait', async () => {
    const permission = deferred(); let checks = 0;
    const h = await mount({ mode: 'refine', body: 'Original {{topic}}', contains: async () => ++checks === 1 ? true : permission.promise, run: async input => ({ text: 'Improved {{topic}}', model: input.model, origin: input.origin }) });
    h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send); await click(h.ui.trialButton); await tick(); const trial = h.ui.trial;
    const input = trial.variables[0].input; input.value = 'first'; input.dispatch('input');
    trial.targets[1].select.value = ''; await click(trial.review); assert.equal(trial.send.disabled, true);
    trial.targets[1].select.value = '0'; await click(trial.review); trial.send.dispatch('click'); await tick();
    assert.equal(input.disabled, true); input.value = 'changed while waiting'; permission.resolve(true); await tick();
    assert.equal(h.runs, 1); assert.equal(trial.send.disabled, true); assert.equal(trial.targets[0].reviewText.hidden, true);
    await click(trial.close); await click(h.ui.close); h.h.controller.dispose();
});
test('trial rejects temporary variable edits during transport and ignores both late answers', async () => {
    const pending = deferred(); let calls = 0;
    const h = await mount({ mode: 'refine', body: 'Original {{topic}}', run: async input => ++calls === 1 ? { text: 'Improved {{topic}}', model: input.model, origin: input.origin } : pending.promise });
    h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send); await click(h.ui.trialButton); await tick(); const trial = h.ui.trial;
    trial.variables[0].input.value = 'first'; await click(trial.review); trial.send.dispatch('click'); await tick(); assert.equal(h.runs, 3);
    trial.variables[0].input.value = 'changed'; pending.resolve({ text: 'late', model: 'fixture-model', origin: 'https://synthetic.test' }); await tick();
    for (const target of trial.targets) assert.equal(target.output.value, ''); assert.equal(trial.send.disabled, true);
    await click(trial.close); await click(h.ui.close); h.h.controller.dispose();
});
test('closing parent while trial is active does not discard proposal; later uncertain acceptance reuses its operation', async () => {
    const h = await mount({ mode: 'refine', body: 'Original', run: async input => ({ text: 'Improved', model: input.model, origin: input.origin }) });
    h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send); await click(h.ui.trialButton); await tick(); const trial = h.ui.trial;
    await click(h.ui.close); assert.equal(h.ui.trial === trial, true); assert.equal(trial.overlay.isConnected, true); assert.equal(h.ui.overlay.isConnected, true);
    await click(trial.close); h.h.failOnce(); const writes = h.h.writes;
    await click(h.ui.save); await settle(h.h.controller); const operation = h.h.controller.pendingCommand; assert.ok(operation);
    await click(h.ui.save); await settle(h.h.controller); assert.equal(h.h.controller.pendingCommand, null); assert.equal(h.h.writes, writes + 1);
    assert.equal(h.h.controller.record().history.length, 2); assert.equal(operation.command.body, 'Improved'); assert.equal(h.writes, 0);
    await click(h.ui.close); h.h.controller.dispose();
});
test('trial source and proposal changes fence both permission waits and transport replies', async () => {
    for (const change of ['source', 'proposal']) for (const phase of ['permission', 'transport']) {
        const pending = deferred(); let calls = 0, checks = 0;
        const h = await mount({ mode: 'refine', body: 'Original',
            contains: async () => ++checks > 1 && phase === 'permission' ? pending.promise : true,
            run: async input => ++calls === 1 ? { text: 'Improved', model: input.model, origin: input.origin } : pending.promise });
        h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send); await click(h.ui.trialButton); await tick(); const trial = h.ui.trial;
        await click(trial.review); trial.send.dispatch('click'); await tick();
        if (change === 'source') await h.h.controller.refresh(); else h.ui.output.value = 'Different proposal';
        pending.resolve(phase === 'permission' ? true : { text: 'late', model: 'fixture-model', origin: 'https://synthetic.test' }); await tick();
        assert.equal(h.runs, phase === 'permission' ? 1 : 3); assert.equal(trial.send.disabled, true);
        for (const target of trial.targets) { assert.equal(target.output.hidden, true); assert.equal(target.output.value, ''); }
        assert.equal(h.h.controller.record().history.length, 1); assert.equal(h.writes, 0);
        await click(trial.close); assert.equal(h.ui.output.value, ''); assert.equal(h.ui.save.disabled, true);
        await click(h.ui.save); assert.equal(h.h.controller.record().history.length, 1);
        await click(h.ui.close); h.h.controller.dispose();
    }
});

test('workspace or restore interruption of trial also invalidates its retained parent proposal', async () => {
    const h = await mount({ mode: 'refine', body: 'Original', run: async input => ({ text: 'Improved', model: input.model, origin: input.origin }) });
    h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send); await click(h.ui.trialButton); await tick(); const trial = h.ui.trial;
    await click(trial.review); h.view.cancelModelDialog(); assert.equal(trial.send.disabled, true);
    await click(trial.close); assert.equal(h.ui.output.hidden, true); assert.equal(h.ui.output.value, ''); assert.equal(h.ui.save.disabled, true);
    await click(h.ui.save); assert.equal(h.h.controller.record().history.length, 1); assert.equal(h.writes, 0);
    await click(h.ui.close); h.h.controller.dispose();
});

test('editable proposal stays local, preserves model reply and accepts exactly the edited draft', async () => {
    const h = await mount({ mode: 'refine', body: 'Original {{topic}}', run: async () => ({ text: 'Generated {{topic}}' }) });
    h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send);
    const writes = h.h.writes, originalVersion = h.h.controller.record().currentVersionId;
    assert.equal(h.ui.output.readOnly, false); assert.equal(h.ui.before.readOnly, true); assert.equal(h.ui.originalOutput.readOnly, true);
    h.ui.output.value = 'Locally edited {{topic}}'; h.ui.output.dispatch('input');
    assert.equal(h.ui.originalOutput.value, 'Generated {{topic}}'); assert.equal(h.ui.before.value, 'Original {{topic}}');
    assert.equal(h.runs, 1); assert.equal(h.grants, 0); assert.equal(h.h.writes, writes);
    assert.equal(h.h.controller.record().currentVersionId, originalVersion); assert.equal(h.ui.save.disabled, false);
    await click(h.ui.save); await settle(h.h.controller);
    assert.equal(h.h.controller.record().body, 'Locally edited {{topic}}'); assert.equal(h.h.controller.record().history[0].body, 'Original {{topic}}');
    assert.equal(h.ui.output.readOnly, true); await click(h.ui.close); h.h.controller.dispose();
});
test('placeholder errors can be repaired locally, including counts and escaped active variables', async () => {
    const h = await mount({ mode: 'refine', body: 'Original {{topic}} / {{topic}}', run: async () => ({ text: 'Broken model output' }) });
    h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send); const writes = h.h.writes;
    assert.equal(h.ui.output.readOnly, false); assert.equal(h.ui.save.disabled, true);
    for (const invalid of ['', 'Changed {{topic}}', 'Changed \\{{topic}} / {{topic}}', 'Changed {{topic}} / {{topic}} / {{extra}}', 'Original {{topic}} / {{topic}}', 'x'.repeat(Core.LIMITS.body + 1)]) {
        h.ui.output.value = invalid; h.ui.output.dispatch('input');
        assert.equal(h.ui.save.disabled, true); assert.equal(h.ui.trialButton.disabled, true); await click(h.ui.save);
        assert.equal(h.h.writes, writes);
    }
    h.ui.output.value = 'Repaired {{topic}} / {{topic}}'; h.ui.output.dispatch('input');
    assert.equal(h.ui.save.disabled, false); assert.equal(h.ui.trialButton.disabled, false); assert.equal(h.runs, 1); assert.equal(h.grants, 0);
    await click(h.ui.save); await settle(h.h.controller); assert.equal(h.h.controller.record().body, 'Repaired {{topic}} / {{topic}}');
    await click(h.ui.close); h.h.controller.dispose();
});
test('each trial and acceptance use the same edited proposal, and editing after a trial cannot retain old results', async () => {
    const requests = []; const h = await mount({ mode: 'refine', body: 'Original {{topic}}', run: async input => { requests.push(input.prompt); return { text: requests.length === 1 ? 'Generated {{topic}}' : 'Synthetic answer', model: input.model, origin: input.origin }; } });
    h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send);
    h.ui.output.value = 'Edited once {{topic}}'; h.ui.output.dispatch('input'); await click(h.ui.trialButton); await tick();
    const first = h.ui.trial; assert.equal(h.ui.output.readOnly, true);
    first.variables[0].input.value = 'test value'; first.variables[0].input.dispatch('input'); await click(first.review); await click(first.send);
    assert.equal(requests[2], 'Edited once test value'); await click(first.close);
    assert.equal(h.ui.output.readOnly, false); for (const target of first.targets) assert.equal(target.output.value, '');
    h.ui.output.value = 'Edited twice {{topic}}'; h.ui.output.dispatch('input'); assert.equal(h.runs, 3);
    await click(h.ui.trialButton); await tick(); const second = h.ui.trial;
    assert.notEqual(second, first); assert.equal(second.variables[0].input.value, '');
    for (const target of second.targets) assert.equal(target.output.value, '');
    second.variables[0].input.value = 'new value'; second.variables[0].input.dispatch('input'); await click(second.review); await click(second.send);
    assert.equal(requests[4], 'Edited twice new value'); await click(second.close);
    await click(h.ui.save); await settle(h.h.controller); assert.equal(h.h.controller.record().body, 'Edited twice {{topic}}'); assert.equal(h.runs, 5);
    await click(h.ui.close); h.h.controller.dispose();
});
test('in-flight trial freezes local proposal input and keeps the exact tested proposal', async () => {
    const pending = deferred(); let calls = 0;
    const h = await mount({ mode: 'refine', body: 'Original', run: async input => ++calls === 1 ? { text: 'Generated', model: input.model, origin: input.origin } : pending.promise });
    h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send);
    h.ui.output.value = 'Edited draft'; h.ui.output.dispatch('input'); await click(h.ui.trialButton); await tick(); const trial = h.ui.trial;
    await click(trial.review); trial.send.dispatch('click'); await tick(); assert.equal(h.runs, 3); assert.equal(h.ui.output.readOnly, true);
    h.ui.output.value = 'Attempted edit during trial'; h.ui.output.dispatch('input'); assert.equal(h.ui.output.value, 'Edited draft');
    pending.resolve({ text: 'Synthetic answer', model: 'fixture-model', origin: 'https://synthetic.test' }); await tick();
    assert.equal(trial.targets[1].output.value, 'Synthetic answer'); await click(trial.close);
    await click(h.ui.save); await settle(h.h.controller); assert.equal(h.h.controller.record().body, 'Edited draft');
    await click(h.ui.close); h.h.controller.dispose();
});
test('stale saved source cannot be overwritten by locally repairing the proposal', async () => {
    const h = await mount({ mode: 'refine', body: 'Original', run: async () => ({ text: 'Generated' }) });
    h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send);
    const record = h.h.controller.record(); await h.h.store.mutate(h.h.store.request('edit', { id: record.id, version: record.version, body: 'External change' })); await tick();
    h.ui.output.value = 'Locally edited'; h.ui.output.dispatch('input'); const writes = h.h.writes;
    assert.equal(h.ui.save.disabled, true); assert.equal(h.ui.trialButton.disabled, true); assert.match(h.ui.status.textContent, /source or workspace changed/);
    await click(h.ui.save); assert.equal(h.h.writes, writes); assert.equal(h.h.controller.record().body, 'External change');
    await click(h.ui.close); h.h.controller.dispose();
});
test('uncertain acceptance freezes the exact edited draft and retry keeps its operation', async () => {
    const h = await mount({ mode: 'refine', body: 'Original', run: async () => ({ text: 'Generated' }) });
    h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send);
    h.ui.output.value = 'Exact submitted edit'; h.ui.output.dispatch('input'); h.h.failOnce(); const writes = h.h.writes;
    await click(h.ui.save); await settle(h.h.controller); const operation = h.h.controller.pendingCommand; assert.ok(operation);
    assert.equal(operation.command.body, 'Exact submitted edit'); assert.equal(h.ui.output.readOnly, true); assert.equal(h.ui.trialButton.disabled, true); assert.match(h.ui.status.textContent, /locked/);
    h.ui.output.value = 'Attempted changed retry'; h.ui.output.dispatch('input'); assert.equal(h.ui.output.value, 'Exact submitted edit');
    await click(h.ui.save); await settle(h.h.controller); assert.equal(h.h.controller.pendingCommand, null); assert.equal(h.h.writes, writes + 1);
    assert.equal(h.h.controller.record().body, 'Exact submitted edit'); assert.equal(h.h.controller.record().history.length, 2); assert.equal(h.runs, 1);
    await click(h.ui.close); h.h.controller.dispose();
});

test('declining Close keeps edited proposal; confirmed Close or pagehide discards without saving', async () => {
    for (const ending of ['close', 'pagehide']) {
        const h = await mount({ mode: 'refine', body: 'Original', run: async () => ({ text: 'Generated' }) });
        h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send); const writes = h.h.writes;
        h.ui.output.value = 'Unsaved local edit'; h.ui.output.dispatch('input'); h.root.confirm = () => false;
        await click(h.ui.close); assert.equal(h.ui.overlay.isConnected, true); assert.equal(h.ui.output.value, 'Unsaved local edit');
        if (ending === 'pagehide') { h.events.get('pagehide')(); assert.equal(h.ui.output.value, ''); assert.equal(h.ui.originalOutput.value, ''); assert.equal(h.ui.save.disabled, true); }
        h.root.confirm = () => true; await click(h.ui.close); assert.equal(h.ui.overlay.isConnected, false);
        assert.equal(h.h.writes, writes); assert.equal(h.h.controller.record().body, 'Original'); assert.equal(h.runs, 1); h.h.controller.dispose();
    }
});
