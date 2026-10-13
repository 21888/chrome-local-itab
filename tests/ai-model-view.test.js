const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-prompts-store');
const Client = require('../shared/ai-model-client');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const { setup, add, tick, settle } = require('./helpers/prompts-harness');
async function mount({ safeReader = false, normalizeTextareas = false, locale, clipboard, run, contains = async () => true, request = async () => true, mutate = async () => {}, presetStore, mode = 'run', body = 'Synthetic input <script>text</script>' } = {}) {
    const h = setup(); await h.controller.start(); await add(h.controller, 'Synthetic prompt', body);
    const doc = createDocument({ blurUnavailableFocus: true }), events = new Map(), eventHandlers = new Map(); let runs = 0, grants = 0, writes = 0, command;
    if (normalizeTextareas) {
        const create = doc.createElement;
        doc.createElement = tag => {
            const element = create(tag);
            if (tag.toLowerCase() === 'textarea') { let value = ''; Object.defineProperty(element, 'value', { get: () => value, set: text => { value = String(text).replace(/\r\n?/g, '\n'); } }); }
            return element;
        };
    }
    const root = { document: doc, LocalItabPrompts: Core, LocalItabAIPromptRefinement: require('../shared/ai-prompt-refinement'), LocalItabAIModel: { ...Client, run: async (...args) => { runs++; return run ? run(...args) : { text: '<script>synthetic output</script>', model: 'fixture-model', origin: 'https://synthetic.test' }; } },
        chrome: { permissions: { contains, request: async (...args) => { grants++; return request(...args); } } }, confirm: () => true,
        addEventListener(name, fn) { const handlers = eventHandlers.get(name) || new Set(); handlers.add(fn); eventHandlers.set(name, handlers); events.set(name, event => { for (const handler of [...handlers]) handler(event); }); },
        removeEventListener(name, fn) { const handlers = eventHandlers.get(name); handlers?.delete(fn); if (!handlers?.size) { eventHandlers.delete(name); events.delete(name); } } };
    let readerParses = 0;
    const context = vm.createContext({ window: root, AbortController, setTimeout, clearTimeout });
    if (safeReader) {
        const Marked = require('../vendor/marked/marked.umd.js');
        root.marked = { Lexer: class extends Marked.Lexer { lex(source) { readerParses++; return super.lex(source); } } };
        vm.runInContext(fs.readFileSync(`${__dirname}/../shared/safe-answer-reader.js`, 'utf8'), context);
    }
    for (const file of ['shared/dialog-focus.js', 'shared/local-prompts-view.js', 'shared/ai-model-comparison.js', 'shared/ai-model-view.js']) vm.runInContext(fs.readFileSync(`${__dirname}/../${file}`, 'utf8'), context);
    const catalog = locale ? JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${locale}/messages.json`, 'utf8')) : {};
    root.i18n = { t: key => catalog[key]?.message || key };
    const view = { doc, clipboard, controller: h.controller, t: (key, fallback) => catalog[`prompts${key}`]?.message || fallback,
        el(tag, className, text) { const el = doc.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; },
        button(name, fallback, action) { const b = this.el('button', '', this.t(name, fallback)); b.addEventListener('click', action); return b; } };
    const store = { request(kind, values) { return { kind, ...values, operationId: 'synthetic_operation' }; }, async mutate(value, validator) { writes++; command = value; assert.equal(validator(h.raw, value.promptRef), true); return mutate(value); } };
    const ui = root.LocalItabAIModelView.open({ view, collectionStore: store, presetStore, mode });
    ui.url.value = 'https://synthetic.test/v1/chat/completions'; ui.model.value = 'fixture-model';
    return { h, ui, root, events, doc, view, get readerParses() { return readerParses; }, get runs() { return runs; }, get grants() { return grants; }, get writes() { return writes; }, get command() { return command; } };
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

function rejectableDeferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

for (const mode of ['run', 'refine']) {
    for (const phase of ['permission', 'transport']) for (const ending of ['resolve', 'reject']) {
        test(`${mode}: Stop releases pending ${phase}; late ${ending} cannot touch a replacement request`, async () => {
            const old = rejectableDeferred(), next = rejectableDeferred(), answer = rejectableDeferred(); let checks = 0, transports = 0;
            const h = await mount({ mode, body: 'Synthetic original',
                contains: () => ++checks === 1 && phase === 'permission' ? old.promise : next.promise,
                run: () => ++transports === 1 && phase === 'transport' ? old.promise : answer.promise });
            if (h.ui.instruction) h.ui.instruction.value = 'Clarify';
            await click(h.ui.review); h.ui.key.value = 'synthetic-old-key'; h.ui.send.dispatch('click');
            if (phase === 'transport') { next.resolve(true); await tick(); }
            assert.equal(h.ui.review.disabled, true); assert.equal(h.ui.send.disabled, true);
            h.ui.cancel.dispatch('click');
            // Recovery is synchronous even when the API never settles.
            assert.equal(h.ui.key.value, ''); assert.equal(h.ui.review.disabled, false);
            assert.equal(h.ui.send.disabled, false); assert.equal(h.ui.cancel.disabled, true);
            assert.match(h.ui.status.textContent, /stopped/); assert.equal(h.ui.save.disabled, true);
            h.ui.key.value = 'synthetic-new-key'; h.ui.send.dispatch('click');
            await tick(); // The old cancellation's finally must not unlock or clear the new request.
            assert.equal(h.ui.review.disabled, true); assert.equal(h.ui.send.disabled, true);
            assert.equal(h.ui.key.value, 'synthetic-new-key');
            const status = h.ui.status.textContent, runs = h.runs;
            if (ending === 'reject') old.reject({ code: 'AUTH' });
            else old.resolve(phase === 'permission' ? true : { text: 'Old synthetic reply' });
            await tick();
            assert.equal(h.runs, runs); assert.equal(h.ui.status.textContent, status);
            assert.equal(h.ui.output.hidden, true); assert.equal(h.ui.save.disabled, true);
            assert.equal(h.ui.review.disabled, true); assert.equal(h.ui.key.value, 'synthetic-new-key');
            next.resolve(true); await tick(); answer.resolve({ text: 'Fresh synthetic reply' }); await tick();
            assert.equal(h.ui.output.value, 'Fresh synthetic reply'); assert.equal(h.ui.key.value, '');
            assert.equal(h.ui.review.disabled, false); assert.equal(h.ui.save.disabled, false);
            assert.equal(h.writes, 0); assert.equal(h.h.controller.record().body, 'Synthetic original');
            await click(h.ui.close); h.h.controller.dispose();
        });
    }
    for (const action of ['pagehide', 'close', 'interrupt']) for (const ending of ['resolve', 'reject']) {
        test(`${mode}: ${action} settles pending precheck and fences late ${ending}`, async () => {
            const pending = rejectableDeferred(); const h = await mount({ mode, contains: () => pending.promise });
            if (h.ui.instruction) h.ui.instruction.value = 'Clarify';
            await click(h.ui.review); h.ui.key.value = 'synthetic-key'; h.ui.send.dispatch('click');
            if (action === 'pagehide') h.events.get('pagehide')();
            else if (action === 'interrupt') h.view.cancelModelDialog();
            else h.ui.close.dispatch('click');
            assert.equal(h.ui.key.value, '');
            if (action !== 'close') { assert.equal(h.ui.review.disabled, false); assert.equal(h.ui.send.disabled, true); }
            else { assert.equal(h.view.openDialog, false); assert.equal(h.ui.overlay.isConnected, false); }
            const status = h.ui.status.textContent;
            if (ending === 'reject') pending.reject({ code: 'AUTH' }); else pending.resolve(true);
            await tick(); assert.equal(h.runs, 0); assert.equal(h.ui.status.textContent, status);
            assert.equal(h.ui.output.hidden, true); assert.equal(h.writes, 0);
            if (action !== 'close') { await click(h.ui.review); assert.equal(h.ui.send.disabled, false); await click(h.ui.close); }
            h.h.controller.dispose();
        });
    }
}


for (const locale of ['en', 'zh_CN']) {
    const messages = JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${locale}/messages.json`, 'utf8'));
    const assertProposalLabel = (h, key) => {
        const expected = messages[`promptsModel${key}`].message;
        assert.equal(h.ui.output.getAttribute('aria-label'), expected);
        assert.equal(h.ui.overlay.querySelector('h3').textContent, expected);
        assert.equal(h.ui.originalOutput.readOnly, true);
        assert.equal(h.ui.originalOutput.getAttribute('aria-label'), messages.promptsModelRefineModelOriginal.message);
        assert.equal(h.ui.originalOutput.value, 'Generated');
    };
    async function proposal() {
        const h = await mount({ locale, mode: 'refine', body: 'Original', run: async () => ({ text: 'Generated' }) });
        h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send);
        assertProposalLabel(h, 'RefineAfter'); return h;
    }
    test(`${locale}: proposal heading and accessible name follow pending and confirmed acceptance`, async () => {
        const h = await proposal(), pending = deferred(), mutate = h.h.store.mutate.bind(h.h.store);
        const writes = h.h.writes;
        h.h.store.mutate = async command => { await pending.promise; return mutate(command); };
        h.ui.save.dispatch('click'); await tick();
        assertProposalLabel(h, 'RefineAfterSaving'); assert.equal(h.ui.output.readOnly, true); assert.equal(h.h.writes, writes);
        pending.resolve(); await settle(h.h.controller);
        assertProposalLabel(h, 'RefineAfterSaved'); assert.equal(h.ui.output.readOnly, true);
        assert.equal(h.h.controller.record().history[0].body, 'Original'); assert.equal(h.h.writes, writes + 1);
        await click(h.ui.close); h.h.controller.dispose();
    });
    for (const inspect of [false, true]) test(`${locale}: uncertain acceptance labels stay unconfirmed until ${inspect ? 'read-only reconciliation' : 'same-operation retry'} succeeds`, async () => {
        const h = await proposal(), writes = h.h.writes; h.h.failOnce();
        await click(h.ui.save); await settle(h.h.controller);
        const operation = h.h.controller.pendingCommand; assert.ok(operation);
        assertProposalLabel(h, 'RefineAfterUncertain'); assert.equal(h.ui.output.readOnly, true);
        if (inspect) {
            h.h.store.mutate = async () => { throw { code: 'CONFLICT' }; };
            await click(h.ui.save); await settle(h.h.controller);
            assert.equal(h.h.controller.pendingInspection, true); assert.equal(h.h.controller.pendingCommand, operation);
            assertProposalLabel(h, 'RefineAfterUncertain');
        }
        await click(h.ui.save); await settle(h.h.controller);
        assertProposalLabel(h, 'RefineAfterSaved'); assert.equal(h.h.controller.pendingCommand, null);
        assert.equal(h.h.writes, writes + 1); assert.equal(h.h.controller.record().history.length, 2);
        assert.equal(h.h.controller.record().history[0].body, 'Original'); assert.equal(h.runs, 1);
        if (inspect) assert.equal(h.h.controller.notice, 'reconciled');
        await click(h.ui.close); h.h.controller.dispose();
    });
    for (const reason of ['CONFLICT', 'STALE']) test(`${locale}: ${reason} acceptance leaves proposal explicitly unsaved`, async () => {
        const h = await proposal(), writes = h.h.writes;
        if (reason === 'CONFLICT') h.h.store.mutate = async () => { throw { code: 'CONFLICT' }; };
        else await h.h.controller.refresh();
        await click(h.ui.save); await settle(h.h.controller);
        assertProposalLabel(h, 'RefineAfter'); assert.equal(h.h.writes, writes); assert.equal(h.h.controller.record().body, 'Original');
        assert.equal(h.h.controller.record().history.length, 1); assert.equal(h.ui.status.textContent, messages.promptsModelRefineStale.message);
        await click(h.ui.close); h.h.controller.dispose();
    });
    test(`${locale}: trial freezes unsaved proposal labels and restores editable draft on close`, async () => {
        const h = await proposal(); await click(h.ui.trialButton); await tick();
        assertProposalLabel(h, 'RefineAfterReadonly');
        await click(h.ui.trial.close); assertProposalLabel(h, 'RefineAfter');
        assert.equal(h.h.controller.record().body, 'Original'); await click(h.ui.close); h.h.controller.dispose();
    });
}

const pausePaint = () => new Promise(resolve => setTimeout(resolve, 120));
async function enableStream(h) { h.ui.streaming.checked = true; h.ui.streaming.dispatch('change'); await click(h.ui.review); }
test('stream: default off, explicit mode review invalidation and send uses the captured mode', async () => {
    let options;
    const h = await mount({ run: async (_, value) => { options = value; return { text: 'complete', model: 'fixture-model', origin: 'https://synthetic.test' }; } });
    assert.equal(h.ui.streaming.checked, false); await click(h.ui.review); assert.match(h.ui.reviewText.textContent, /complete response/);
    h.ui.key.value = 'synthetic'; h.ui.streaming.checked = true; h.ui.streaming.dispatch('change');
    assert.equal(h.ui.send.disabled, true); assert.equal(h.ui.key.value, ''); assert.equal(h.runs, 0);
    await click(h.ui.review); assert.match(h.ui.reviewText.textContent, /mode: streaming/);
    h.ui.streaming.checked = false; // Even a programmatic silent property change cannot alter the reviewed request.
    await click(h.ui.send); assert.equal(options.stream, true); assert.equal(h.runs, 1); assert.equal(h.ui.partialLabel.hidden, true); assert.equal(h.ui.save.disabled, false);
    await click(h.ui.save); assert.equal(h.writes, 1); assert.equal(h.command.body, 'complete'); await click(h.ui.close); h.h.controller.dispose();
    const refinement = await mount({ mode: 'refine' }); assert.equal(refinement.ui.streaming, null); await click(refinement.ui.close); refinement.h.controller.dispose();
});
test('stream: partial safe text is throttled, never saved, and stopped late chunks cannot touch a replacement', async () => {
    const requests = [], options = [];
    const h = await mount({ run: (_, value) => { const pending = deferred(); requests.push(pending); options.push(value); return pending.promise; } });
    await enableStream(h); h.ui.key.value = 'synthetic-key'; await click(h.ui.send);
    let value = '', paints = 0; Object.defineProperty(h.ui.output, 'value', { configurable: true, get: () => value, set: next => { value = next; paints++; } });
    for (let i = 0; i < 500; i++) options[0].onText(`<script>partial ${i}</script>`);
    assert.equal(paints, 0); await pausePaint(); assert.equal(paints, 1); assert.equal(h.ui.output.value, '<script>partial 499</script>');
    assert.equal(h.doc.querySelectorAll('script, img, iframe').length, 0); assert.equal(h.ui.partialLabel.hidden, false); assert.equal(h.ui.save.disabled, true);
    await click(h.ui.save); assert.equal(h.writes, 0); await click(h.ui.cancel); assert.equal(options[0].signal.aborted, true); assert.equal(h.ui.key.value, ''); assert.equal(h.ui.save.disabled, true);
    assert.match(h.ui.status.textContent, /stopped/); assert.equal(h.ui.partialLabel.hidden, false);
    await click(h.ui.send); assert.equal(h.runs, 2); options[1].onText('replacement'); options[0].onText('old late chunk'); requests[0].resolve({ text: 'old complete' });
    await pausePaint(); assert.equal(h.ui.output.value, 'replacement'); assert.equal(h.ui.cancel.disabled, false); assert.equal(h.ui.save.disabled, true);
    requests[1].resolve({ text: 'replacement complete', model: 'fixture-model', origin: 'https://synthetic.test' }); await tick();
    assert.equal(h.ui.output.value, 'replacement complete'); assert.equal(h.ui.partialLabel.hidden, true); assert.equal(h.ui.save.disabled, false); await click(h.ui.close); h.h.controller.dispose();
});
test('stream: truncated, filtered and oversized runs retain an explicit partial label but never become saveable', async () => {
    for (const code of ['INCOMPLETE', 'LIMIT', 'FORMAT', 'NETWORK', 'TIMEOUT', 'PROVIDER']) {
        const h = await mount({ run: async (_, options) => { options.onText('synthetic partial'); throw { code }; } });
        await enableStream(h); h.ui.key.value = 'synthetic-key'; await click(h.ui.send);
        assert.equal(h.ui.output.value, 'synthetic partial'); assert.equal(h.ui.partialLabel.hidden, false); assert.equal(h.ui.save.disabled, true); assert.equal(h.ui.key.value, '');
        await click(h.ui.save); assert.equal(h.writes, 0); assert.equal(h.runs, 1); await click(h.ui.close); h.h.controller.dispose();
    }
});
for (const interruption of ['close', 'pagehide', 'source', 'dispose']) test(`stream: ${interruption} fences scheduled paints and all late chunks`, async () => {
    const pending = deferred(); let options;
    const h = await mount({ run: (_, value) => { options = value; return pending.promise; } }); await enableStream(h); await click(h.ui.send);
    options.onText('queued partial');
    if (interruption === 'close') await click(h.ui.close);
    if (interruption === 'pagehide') h.events.get('pagehide')();
    if (interruption === 'source') { h.h.controller.selected = null; h.view.checkModelRun(); }
    if (interruption === 'dispose') { h.h.controller.dispose(); h.view.checkModelRun(); }
    assert.equal(options.signal.aborted, true); options.onText('late partial'); pending.resolve({ text: 'late complete' }); await pausePaint();
    assert.equal(h.ui.output.value.includes('late'), false); assert.equal(h.ui.save.disabled, true); assert.equal(h.ui.key.value, ''); assert.equal(h.writes, 0);
    if (interruption !== 'close') { assert.equal(h.ui.output.hidden, true); assert.equal(h.ui.send.disabled, true); await click(h.ui.close); }
    h.h.controller.dispose();
});
test('stream: a source change just before final result cannot produce a saveable answer even without a render', async () => {
    const pending = deferred(); let options;
    const h = await mount({ run: (_, value) => { options = value; return pending.promise; } }); await enableStream(h); await click(h.ui.send);
    options.onText('partial'); h.h.controller.selected = null; pending.resolve({ text: 'complete', model: 'fixture-model', origin: 'https://synthetic.test' }); await tick();
    assert.equal(h.ui.save.disabled, true); assert.equal(h.ui.output.hidden, true); assert.equal(h.ui.send.disabled, true); assert.equal(h.writes, 0); await click(h.ui.close); h.h.controller.dispose();
});
test('stream: real client synthetic ReadableStream completes before explicit collection save', async () => {
    const h = await mount({ run: (reviewed, options) => Client.run(reviewed, { ...options, fetcher: async () => new Response(new ReadableStream({ start(c) {
        for (const content of ['safe ', '<b>literal</b>']) c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`));
        c.enqueue(new TextEncoder().encode('data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n')); c.close();
    } }), { headers: { 'content-type': 'text/event-stream' } }) }) });
    await enableStream(h); await click(h.ui.send); assert.equal(h.ui.output.value, 'safe <b>literal</b>'); assert.equal(h.writes, 0); assert.equal(h.ui.partialLabel.hidden, true);
    await click(h.ui.save); assert.equal(h.writes, 1); assert.equal(h.command.body, 'safe <b>literal</b>'); assert.equal(h.doc.querySelectorAll('b').length, 0); await click(h.ui.close); h.h.controller.dispose();
});
test('stream: reopening resets the toggle and a fresh reviewed send after pagehide has its own save', async () => {
    const h = await mount(); await enableStream(h); await click(h.ui.send); await click(h.ui.save); assert.equal(h.writes, 1);
    h.events.get('pagehide')(); await click(h.ui.review); await click(h.ui.send); assert.equal(h.ui.save.disabled, false); await click(h.ui.save); assert.equal(h.writes, 2);
    await click(h.ui.close); const reopened = h.root.LocalItabAIModelView.open({ view: h.view }); assert.equal(reopened.streaming.checked, false); await click(reopened.close); h.h.controller.dispose();
});

for (const mode of ['run', 'refine']) for (const ending of ['success', 'stop', 'failure']) test(`${mode} ${ending} keeps keyboard focus inside the dialog`, async () => {
    const pending = deferred(); const h = await mount({ mode, run: () => pending.promise });
    if (mode === 'refine') h.ui.instruction.value = 'Clarify';
    await click(h.ui.review); h.ui.send.focus(); await click(h.ui.send);
    assert.ok(h.doc.activeElement === h.ui.cancel);
    if (ending === 'stop') await click(h.ui.cancel);
    else { pending.resolve(ending === 'failure' ? Promise.reject({ code: 'NETWORK' }) : { text: 'Revised synthetic template', model: 'fixture', origin: 'https://synthetic.test' }); await tick(); }
    assert.ok(h.doc.activeElement === h.ui.status);
    assert.equal(h.ui.status.tabIndex, -1);
    assert.equal(h.ui.status.getAttribute('role'), 'status');
    assert.equal(h.ui.status.getAttribute('aria-live'), 'polite');
    h.doc.activeElement.dispatch('keydown', { key: 'Escape', isComposing: true }); assert.equal(h.view.openDialog, true);
    const escape = h.doc.activeElement.dispatch('keydown', { key: 'Escape' });
    assert.equal(escape.prevented, true); assert.equal(h.view.openDialog, false);
    pending.resolve({ text: 'Late synthetic result', model: 'fixture', origin: 'https://synthetic.test' }); await tick(); h.h.controller.dispose();
});
for (const granted of [true, false]) test(`permission ${granted} and save transitions preserve focus scope`, async () => {
    const permission = deferred(), saving = deferred();
    const h = await mount({ request: () => permission.promise, mutate: () => saving.promise });
    await click(h.ui.review); h.ui.allow.focus(); h.ui.allow.dispatch('click');
    assert.ok(h.doc.activeElement === h.ui.status);
    h.ui.close.focus(); permission.resolve(granted); await tick();
    assert.ok(h.doc.activeElement === h.ui.close, 'permission result does not steal a valid focus');
    await click(h.ui.send); h.ui.save.focus(); h.ui.save.dispatch('click'); await tick();
    assert.ok(h.doc.activeElement === h.ui.status);
    saving.resolve(); await tick(); assert.ok(h.doc.activeElement === h.ui.status);
    h.doc.activeElement.dispatch('keydown', { key: 'Escape' }); assert.equal(h.view.openDialog, false); h.h.controller.dispose();
});
test('preset loading, review invalidation and hidden refinement draft retain focus only when necessary', async () => {
    const presets = deferred(); const h = await mount({ presetStore: { read: () => presets.promise } });
    assert.ok(h.doc.activeElement === h.ui.status, 'initial URL becomes disabled while presets load');
    h.ui.close.focus(); presets.resolve({ records: [] }); await tick(); assert.ok(h.doc.activeElement === h.ui.close);
    await click(h.ui.review); h.ui.url.focus(); h.ui.url.dispatch('input'); assert.ok(h.doc.activeElement === h.ui.url);
    await click(h.ui.close); h.h.controller.dispose();
    const r = await mount({ mode: 'refine', run: async () => ({ text: 'Revised template', model: 'fixture', origin: 'https://synthetic.test' }) });
    r.ui.instruction.value = 'Clarify'; await click(r.ui.review); await click(r.ui.send); r.ui.output.focus(); r.events.get('pagehide')();
    assert.equal(r.ui.output.hidden, true); assert.ok(r.doc.activeElement === r.ui.status);
    r.doc.activeElement.dispatch('keydown', { key: 'Escape' }); assert.equal(r.view.openDialog, false); r.h.controller.dispose();
});
test('late results preserve valid targets and cannot steal focus after close or trial opening', async () => {
    const pending = deferred(); const h = await mount({ run: () => pending.promise });
    await click(h.ui.review); await click(h.ui.send); h.ui.close.focus();
    pending.resolve({ text: 'Synthetic response', model: 'fixture', origin: 'https://synthetic.test' }); await tick();
    assert.ok(h.doc.activeElement === h.ui.close); await click(h.ui.close);
    const outside = h.doc.createElement('button'); h.doc.body.append(outside); outside.focus(); await tick(); assert.ok(h.doc.activeElement === outside); h.h.controller.dispose();
    const late = deferred(); const closed = await mount({ request: () => late.promise });
    await click(closed.ui.review); closed.ui.allow.focus(); closed.ui.allow.dispatch('click'); await click(closed.ui.close);
    const newer = closed.doc.createElement('button'); closed.doc.body.append(newer); newer.focus(); late.resolve(false); await tick(); assert.ok(closed.doc.activeElement === newer); closed.h.controller.dispose();
    const r = await mount({ mode: 'refine', run: async () => ({ text: 'Revised template', model: 'fixture', origin: 'https://synthetic.test' }) });
    r.ui.instruction.value = 'Clarify'; await click(r.ui.review); await click(r.ui.send); r.ui.trialButton.focus(); await click(r.ui.trialButton);
    assert.ok(r.doc.activeElement === r.ui.trial.close); assert.equal(r.ui.overlay.hidden, true);
    await click(r.ui.trial.close); await click(r.ui.close); r.h.controller.dispose();
});
for (const mode of ['run', 'refine']) test(`${mode} uncertain save keeps Escape reachable without changing draft selection`, async () => {
    const h = await mount({ mode, mutate: async () => { throw Error('Synthetic save failure'); }, run: async () => ({ text: 'Revised synthetic template', model: 'fixture', origin: 'https://synthetic.test' }) });
    if (mode === 'refine') h.ui.instruction.value = 'Clarify';
    await click(h.ui.review); await click(h.ui.send); h.ui.output.focus(); h.ui.output.selectionStart = 2; h.ui.output.selectionEnd = 5;
    if (mode === 'refine') h.h.failOnce();
    // A programmatic save while the still-valid output is focused must not move it.
    await click(h.ui.save); await settle(h.h.controller);
    assert.ok(h.doc.activeElement === h.ui.output); assert.equal(h.ui.output.selectionStart, 2); assert.equal(h.ui.output.selectionEnd, 5);
    h.ui.save.focus(); await click(h.ui.save); await settle(h.h.controller); assert.ok(h.doc.activeElement === h.ui.status);
    h.doc.activeElement.dispatch('keydown', { key: 'Escape' }); assert.equal(h.view.openDialog, false); h.h.controller.dispose();
});
test('trial interruption transfers hidden output focus inside the active trial only', async () => {
    const h = await mount({ mode: 'refine', run: async () => ({ text: 'Revised synthetic template', model: 'fixture', origin: 'https://synthetic.test' }) });
    h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send); await click(h.ui.trialButton);
    const trial = h.ui.trial; await click(trial.review); await click(trial.send); trial.targets[0].output.focus(); trial.hide();
    assert.ok(h.doc.activeElement === trial.status); assert.equal(h.ui.overlay.hidden, true);
    h.doc.activeElement.dispatch('keydown', { key: 'Escape' }); assert.equal(h.ui.trial, null); assert.equal(h.ui.overlay.hidden, false);
    await click(h.ui.close); h.h.controller.dispose();
});

for (const locale of ['en', 'zh_CN']) test(`reader: complete answer has localized shared controls and exact original/save (${locale})`, async () => {
    const text = '  # Synthetic heading\r\n\n**Original** 中文 🧪\t  \n\n![pixel](https://invalid.example/pixel)\n\n<svg onload="bad()">literal</svg>';
    const h = await mount({ safeReader: true, locale, run: async () => ({ text, model: 'fixture-model', origin: 'https://synthetic.test' }) });
    await click(h.ui.review); assert.equal(h.readerParses, 0); await click(h.ui.send);
    assert.equal(h.readerParses, 1); assert.equal(h.ui.output.value, text); assert.equal(h.ui.output.hidden, true);
    const reader = h.ui.readerHost.querySelector('.answer-reader'), [read, raw] = reader.querySelectorAll('button');
    const catalog = JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${locale}/messages.json`));
    assert.equal(read.textContent, catalog.answerReaderReading.message); assert.equal(raw.textContent, catalog.answerReaderOriginal.message);
    assert.equal(reader.getAttribute('aria-label'), h.ui.output.getAttribute('aria-label'));
    await click(raw); assert.equal(reader.querySelector('.answer-reader-source').textContent, text);
    await click(read); await click(h.ui.save); assert.equal(h.command.body, text); assert.equal(h.readerParses, 1);
    assert.equal(reader.querySelectorAll('a,img,script,iframe,svg,style').length, 0);
    for (const node of reader.querySelectorAll('*')) { assert.equal(node.src, undefined); assert.equal(node.href, undefined); }
    await click(h.ui.close); assert.equal(reader.children.length, 0); assert.equal(reader.isConnected, false); h.h.controller.dispose();
});

test('reader: streaming parses only successful final text; partial, failed and stopped attempts remain literal', async () => {
    let options; const pending = deferred();
    const h = await mount({ safeReader: true, run: (_, o) => { options = o; return pending.promise; } });
    await enableStream(h); await click(h.ui.send); options.onText('# partial'); await pausePaint();
    assert.equal(h.readerParses, 0); assert.equal(h.ui.output.hidden, false); assert.equal(h.ui.output.value, '# partial');
    pending.resolve({ text: '# Final\r\n\n**exact**', model: 'fixture-model', origin: 'https://synthetic.test' }); await tick();
    assert.equal(h.readerParses, 1); assert.equal(h.ui.output.hidden, true); assert.equal(h.ui.partialLabel.hidden, true);
    const oldReader = h.ui.readerHost.querySelector('.answer-reader'); h.events.get('pagehide')();
    assert.equal(oldReader.children.length, 0); assert.equal(h.ui.output.value, ''); assert.equal(h.ui.readerHost.hidden, true);
    await click(h.ui.close); h.h.controller.dispose();
    for (const ending of ['failure', 'stop']) {
        const next = deferred(); let current;
        const h = await mount({ safeReader: true, run: (_, o) => { current = o; return next.promise; } });
        await enableStream(h); await click(h.ui.send); current.onText('**incomplete**'); await pausePaint();
        if (ending === 'failure') { next.resolve(Promise.reject({ code: 'INCOMPLETE' })); await tick(); }
        else { await click(h.ui.cancel); next.resolve({ text: 'late full' }); await tick(); }
        assert.equal(h.readerParses, 0); assert.equal(h.ui.output.value, '**incomplete**'); assert.equal(h.ui.output.hidden, false);
        assert.equal(h.ui.save.disabled, true); assert.equal(h.ui.readerHost.children.length, 0);
        await click(h.ui.close); h.h.controller.dispose();
    }
});

test('reader: failed old stream cannot render over successful reviewed retry', async () => {
    let count = 0, oldOptions; const pending = deferred();
    const h = await mount({ safeReader: true, run: (_, options) => ++count === 1 ? (oldOptions = options, pending.promise) : Promise.resolve({ text: '# New exact answer', model: 'fixture-model', origin: 'https://synthetic.test' }) });
    await enableStream(h); await click(h.ui.send); oldOptions.onText('# Old partial'); await click(h.ui.cancel);
    await click(h.ui.review); await click(h.ui.send); assert.equal(h.readerParses, 1);
    oldOptions.onText('old late'); pending.resolve({ text: '# Old complete' }); await pausePaint();
    assert.equal(h.ui.output.value, '# New exact answer'); assert.equal(h.readerParses, 1);
    await click(h.ui.save); assert.equal(h.command.body, '# New exact answer'); await click(h.ui.close); h.h.controller.dispose();
});

for (const end of ['cancel', 'accept']) test(`reader: refinement editable draft and original stay literal on ${end}`, async () => {
    const h = await mount({ safeReader: true, mode: 'refine', body: 'Original {{topic}}', run: async () => ({ text: '**Revised** {{topic}}' }) });
    h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send);
    assert.equal(h.readerParses, 0); assert.equal(h.ui.output.hidden, false); assert.equal(h.ui.output.readOnly, false);
    assert.equal(h.ui.originalOutput.value, '**Revised** {{topic}}');
    h.ui.output.value = '# Edited {{topic}}'; h.ui.output.dispatch('input');
    if (end === 'accept') { await click(h.ui.save); await settle(h.h.controller); assert.equal(h.h.controller.record().body, '# Edited {{topic}}'); }
    else assert.equal(h.h.controller.record().body, 'Original {{topic}}');
    assert.equal(h.readerParses, 0); await click(h.ui.close); h.h.controller.dispose();
});

test('reader: hiding discards formatted DOM without losing original or reparsing on return', async () => {
    const h = await mount({ safeReader: true }); await click(h.ui.review); await click(h.ui.send);
    const reader = h.ui.readerHost.querySelector('.answer-reader'), raw = h.ui.output.value;
    h.doc.hidden = true; h.doc.listeners.get('visibilitychange')();
    assert.equal(reader.children.length, 0); assert.equal(h.ui.output.value, raw); assert.equal(h.ui.output.hidden, false);
    h.doc.hidden = false; h.doc.listeners.get('visibilitychange')(); assert.equal(h.readerParses, 1);
    await click(h.ui.save); assert.equal(h.command.body, raw); await click(h.ui.close); h.h.controller.dispose();
});

test('reader: trial answers are read-only; close destroys both before edited proposal can be tested or accepted', async () => {
    let runs = 0;
    const h = await mount({ safeReader: true, mode: 'refine', body: 'Original {{topic}}', run: async input => ({ text: ++runs === 1 ? 'Improved {{topic}}' : `# Answer ${runs}\n\n${input.prompt}`, model: input.model, origin: input.origin }) });
    h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send); assert.equal(h.readerParses, 0);
    await click(h.ui.trialButton); await tick(); const first = h.ui.trial;
    first.variables[0].input.value = 'synthetic value'; first.variables[0].input.dispatch('input');
    await click(first.review); await click(first.send); assert.equal(h.readerParses, 2);
    const old = first.targets.map(t => t.readerHost.querySelector('.answer-reader'));
    assert(first.targets.every(t => t.save.hidden && t.output.hidden));
    assert.match(first.targets[0].heading.textContent, /Original/); assert.match(first.targets[1].heading.textContent, /proposal/);
    await click(first.close); for (const r of old) assert.equal(r.children.length, 0);
    assert.equal(h.ui.output.readOnly, false); assert.equal(h.ui.originalOutput.value, 'Improved {{topic}}');
    h.ui.output.value = 'Edited {{topic}}'; h.ui.output.dispatch('input'); await click(h.ui.trialButton); await tick();
    const second = h.ui.trial; assert(second.targets.every(t => t.readerHost.children.length === 0 && t.output.value === ''));
    assert.equal(h.readerParses, 2); await click(second.close); await click(h.ui.save); await settle(h.h.controller);
    assert.equal(h.h.controller.record().body, 'Edited {{topic}}'); assert.equal(h.readerParses, 2);
    await click(h.ui.close); h.h.controller.dispose();
});

test('reader: controller teardown hook clears a completed reader and never reparses', async () => {
    const h = await mount({ safeReader: true }); await click(h.ui.review); await click(h.ui.send);
    const reader = h.ui.readerHost.querySelector('.answer-reader');
    h.h.controller.dispose(); h.view.cancelModelDialog();
    assert.equal(reader.children.length, 0); assert.equal(h.ui.readerHost.children.length, 0); assert.equal(h.readerParses, 1);
    await click(h.ui.close); assert.equal(h.doc.listeners.has('visibilitychange'), false);
});

test('code copy: model writes exact displayed code synchronously and serializes blocks without changing save text', async () => {
    const pending = deferred(), copied = [];
    const text = 'Before\r\n\r\n```js\r\n  let π = "中文 🧪";\r\n\t// <script>literal</script>  \r\n```\r\n\r\n    indented second\r\n\r\nAfter';
    const h = await mount({ safeReader: true, clipboard: { writeText(value) { copied.push(value); return copied.length === 1 ? pending.promise : Promise.resolve(); } }, run: async () => ({ text, model: 'fixture-model', origin: 'https://synthetic.test' }) });
    await click(h.ui.review); await click(h.ui.send);
    const reader = h.ui.readerHost.querySelector('.answer-reader'), buttons = reader.querySelectorAll('.answer-reader-copy-code');
    const code = reader.querySelectorAll('pre code'), status = reader.querySelector('.answer-reader-copy-status');
    assert.equal(buttons.length, 2); assert.equal(status.getAttribute('role'), 'status');
    const hostMessage = h.ui.status.textContent; buttons[0].focus(); buttons[0].dispatch('click');
    assert.deepEqual(copied, [code[0].textContent]); assert.equal(h.view.copying, true);
    assert(buttons.every(button => button.disabled)); assert.equal(h.doc.activeElement, code[0].parentElement);
    buttons[0].dispatch('click'); buttons[1].dispatch('click'); assert.equal(copied.length, 1);
    h.ui.close.focus(); pending.resolve(); await tick();
    assert.equal(h.doc.activeElement, h.ui.close); assert.equal(h.view.copying, false);
    assert(buttons.every(button => !button.disabled)); assert.equal(status.textContent, 'Code copied.');
    await click(buttons[1]); assert.deepEqual(copied, code.map(node => node.textContent));
    assert.equal(h.ui.status.textContent, hostMessage); assert.equal(h.ui.output.value, text); assert.equal(h.runs, 1);
    await click(h.ui.save); assert.equal(h.command.body, text); assert.equal(h.writes, 1);
    await click(h.ui.close); h.h.controller.dispose();
});

for (const failure of ['missing', 'throw', 'reject']) test(`code copy: model ${failure} gives isolated manual-copy feedback without retries`, async () => {
    let copies = 0;
    const clipboard = failure === 'missing' ? undefined : { writeText() { copies++; if (failure === 'throw') throw Error('private clipboard failure'); return Promise.reject(Error('private clipboard failure')); } };
    const h = await mount({ safeReader: true, clipboard, run: async () => ({ text: '```\nconst safe = "synthetic";\n```' }) });
    await click(h.ui.review); await click(h.ui.send);
    const reader = h.ui.readerHost.querySelector('.answer-reader'), button = reader.querySelector('.answer-reader-copy-code');
    const hostMessage = h.ui.status.textContent; await click(button);
    assert.equal(reader.querySelector('.answer-reader-copy-status').textContent, 'Copy was blocked. Select this code and copy it manually.');
    assert.equal(h.ui.status.textContent, hostMessage); assert.equal(h.view.copying, false); assert.equal(button.disabled, false);
    assert.equal(copies, failure === 'missing' ? 0 : 1); assert.equal(h.runs, 1); assert.equal(h.writes, 0);
    await click(h.ui.close); h.h.controller.dispose();
});

for (const action of ['original', 'hide', 'pagehide', 'close', 'source', 'dispose', 'overlay']) test(`code copy: model ${action} suppresses late feedback and keeps the write locked until settle`, async () => {
    const pending = deferred(); let copies = 0;
    const h = await mount({ safeReader: true, clipboard: { writeText() { copies++; return pending.promise; } }, run: async () => ({ text: '```\nsynthetic code\n```' }) });
    await click(h.ui.review); await click(h.ui.send);
    const reader = h.ui.readerHost.querySelector('.answer-reader'), button = reader.querySelector('.answer-reader-copy-code'), status = reader.querySelector('.answer-reader-copy-status');
    button.dispatch('click'); assert.equal(copies, 1);
    if (action === 'original') { await click(reader.querySelectorAll('button')[1]); await click(reader.querySelectorAll('button')[0]); }
    if (action === 'hide') { h.doc.hidden = true; h.doc.listeners.get('visibilitychange')(); h.doc.hidden = false; }
    if (action === 'pagehide') h.events.get('pagehide')();
    if (action === 'close') await click(h.ui.close);
    if (action === 'source') { h.h.controller.excerptEpoch++; h.view.checkModelRun(); }
    if (action === 'dispose') h.h.controller.dispose();
    if (action === 'overlay') h.ui.overlay.hidden = true;
    const statusAfter = status.textContent, hostAfter = h.ui.status.textContent;
    assert.equal(h.view.copying, true); button.dispatch('click'); assert.equal(copies, 1);
    pending.resolve(); await tick(); assert.equal(h.view.copying, false);
    assert.equal(status.textContent, statusAfter); assert.equal(h.ui.status.textContent, hostAfter); assert.equal(copies, 1);
    await click(h.ui.close); h.h.controller.dispose();
});

test('code copy: pending single-model write blocks a reopened comparison until the original promise settles', async () => {
    const pending = deferred(), copies = [];
    const h = await mount({ safeReader: true, clipboard: { writeText(text) { copies.push(text); return copies.length === 1 ? pending.promise : Promise.resolve(); } }, run: async request => ({ text: `\`\`\`\n${request.model} synthetic code\n\`\`\`` }) });
    await click(h.ui.review); await click(h.ui.send);
    const oldReader = h.ui.readerHost.querySelector('.answer-reader'), oldStatus = oldReader.querySelector('.answer-reader-copy-status');
    oldReader.querySelector('.answer-reader-copy-code').dispatch('click'); await click(h.ui.close);
    assert.equal(h.view.copying, true);
    const next = h.root.LocalItabAIModelComparison.open({ view: h.view, presetStore: { read: async () => ({ records: [{ name: 'Synthetic', url: 'https://synthetic.test/v1/chat/completions', model: 'new-model' }] }) } });
    await tick(); next.targets[0].select.value = '0'; next.targets[0].select.dispatch('change'); await click(next.review); await click(next.send);
    const reader = next.targets[0].readerHost.querySelector('.answer-reader'), button = reader.querySelector('.answer-reader-copy-code');
    assert.equal(button.disabled, true); button.dispatch('click'); assert.equal(copies.length, 1);
    pending.resolve(); await tick(); assert.equal(button.disabled, false); assert.equal(h.view.copying, false);
    assert.equal(oldStatus.textContent, ''); assert.equal(reader.querySelector('.answer-reader-copy-status').textContent, '');
    await click(button); assert.deepEqual(copies, ['fixture-model synthetic code', 'new-model synthetic code']);
    await click(next.close); h.h.controller.dispose();
});

async function refinedDifference(options = {}) {
    const h = await mount({ mode: 'refine', body: 'Original {{topic}}\nShared line\n', run: async () => ({ text: 'Revised {{topic}}\nShared line\n' }), ...options });
    h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send); return h;
}
function differenceBodies(ui) {
    const groups = ui.difference.querySelector('.prompt-compare-changes').children;
    return {
        before: groups.filter(group => !group.classList.contains('prompt-compare-added')).map(group => group.querySelector('pre').textContent).join(''),
        after: groups.filter(group => !group.classList.contains('prompt-compare-removed')).map(group => group.querySelector('pre').textContent).join('')
    };
}
for (const locale of ['en', 'zh_CN']) test(`refinement differences: explicit, localized, literal and never a save (${locale})`, async () => {
    const body = '<script>Original {{topic}}</script>\r\nShared 中文 🧪\n';
    const proposed = '<img src="https://synthetic.test/pixel">Revised {{topic}}\r\nShared 中文 🧪\n';
    const h = await refinedDifference({ locale, body, run: async () => ({ text: proposed }) });
    const catalog = JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${locale}/messages.json`));
    const writes = h.h.writes, version = h.h.controller.record().currentVersionId;
    assert.equal(h.ui.compareText.textContent, catalog.promptsModelRefineDiffOpen.message);
    assert.equal(h.ui.difference.hidden, true); assert.equal(h.ui.difference.children.length, 0);
    assert.equal(h.ui.compareText.getAttribute('aria-expanded'), 'false');
    assert.equal(h.ui.compareText.getAttribute('aria-controls'), h.ui.difference.id);
    h.ui.compareText.focus(); await click(h.ui.compareText);
    assert.equal(h.ui.difference.hidden, false); assert.equal(h.ui.compareText.getAttribute('aria-expanded'), 'true');
    assert.deepEqual(differenceBodies(h.ui), { before: body, after: proposed });
    assert.equal(h.ui.difference.querySelector('h3').textContent, catalog.promptsModelRefineDiffTitle.message);
    assert.ok(h.ui.difference.querySelectorAll('p').some(node => node.textContent === catalog.promptsModelRefineDiffHelp.message));
    assert.equal(h.ui.difference.querySelectorAll('script,img,iframe,a,svg,style').length, 0);
    assert.equal(h.runs, 1); assert.equal(h.grants, 0); assert.equal(h.h.writes, writes);
    assert.equal(h.h.controller.record().currentVersionId, version);
    const close = h.ui.difference.querySelector('button'); close.focus(); await click(close);
    assert.equal(h.ui.difference.children.length, 0); assert.equal(h.ui.difference.hidden, true); assert.equal(h.doc.activeElement, h.ui.compareText);
    await click(h.ui.compareText); await click(h.ui.compareText); assert.equal(h.ui.difference.hidden, true);
    await click(h.ui.close); h.h.controller.dispose();
});
test('refinement differences: CRLF/CR remain exact despite native textarea display normalization', async () => {
    const body = 'Original {{topic}}\r\nShared\rFinal\n', proposal = 'Revised {{topic}}\r\nShared\rFinal';
    const h = await refinedDifference({ normalizeTextareas: true, body, run: async () => ({ text: proposal }) });
    assert.equal(h.ui.before.value, body.replace(/\r\n?/g, '\n')); assert.equal(h.ui.output.value, proposal.replace(/\r\n?/g, '\n'));
    await click(h.ui.compareText); assert.deepEqual(differenceBodies(h.ui), { before: body, after: proposal });
    const paragraphs = h.ui.difference.querySelectorAll('p').map(node => node.textContent).join('\n');
    assert.match(paragraphs, /Saved template · Line endings: CRLF 1 · LF 1 · CR 1 · Ends with newline: Yes/);
    assert.match(paragraphs, /Unsaved draft · Line endings: CRLF 1 · LF 0 · CR 1 · Ends with newline: No/);
    await click(h.ui.trialButton); await tick(); assert.ok(h.ui.trial, 'native-normalized display still owns the exact proposal');
    assert.equal(h.ui.difference.children.length, 0); await click(h.ui.trial.close);
    assert.equal(h.ui.difference.hidden, true); assert.equal(h.ui.compareText.disabled, false);
    await click(h.ui.save); await settle(h.h.controller);
    assert.equal(h.h.controller.record().body, proposal); assert.equal(h.h.controller.record().history[0].body, body);
    assert.equal(h.ui.difference.hidden, true); assert.equal(h.ui.compareText.disabled, true); await click(h.ui.close); h.h.controller.dispose();
});
test('refinement differences: edits clear old snapshots and a fresh explicit click uses only the current draft', async () => {
    const h = await refinedDifference(); let calls = 0;
    const compare = h.root.LocalItabPromptsView.compareBodies;
    h.root.LocalItabPromptsView.compareBodies = (...args) => { calls++; return compare(...args); };
    await click(h.ui.compareText); assert.equal(calls, 1);
    h.ui.output.focus(); h.ui.output.value = 'Locally edited {{topic}}\r\n'; h.ui.output.dispatch('input');
    assert.equal(h.ui.difference.children.length, 0); assert.equal(h.ui.difference.hidden, true); assert.equal(h.doc.activeElement, h.ui.output);
    assert.equal(calls, 1); await click(h.ui.compareText); assert.equal(calls, 2);
    assert.equal(differenceBodies(h.ui).after, 'Locally edited {{topic}}\r\n');
    assert.equal(h.ui.originalOutput.value, 'Revised {{topic}}\nShared line\n');
    h.ui.output.value = 'Revised {{topic}}\nShared line\n'; h.ui.output.dispatch('input');
    assert.equal(h.ui.difference.hidden, true); assert.equal(calls, 2);
    await click(h.ui.save); await settle(h.h.controller); assert.equal(h.h.controller.record().body, 'Revised {{topic}}\nShared line\n');
    assert.equal(h.ui.difference.hidden, true); assert.equal(h.runs, 1); await click(h.ui.close); h.h.controller.dispose();
});
test('refinement differences: invalid, empty and unchanged drafts remain inspectable but cannot be accepted', async () => {
    const h = await refinedDifference({ run: async () => ({ text: 'Missing variables' }) }); const writes = h.h.writes;
    for (const draft of ['Missing variables', '', 'Original {{topic}}\nShared line\n']) {
        h.ui.output.value = draft; h.ui.output.dispatch('input');
        assert.equal(h.ui.save.disabled, true); assert.equal(h.ui.trialButton.disabled, true); assert.equal(h.ui.compareText.disabled, false);
        await click(h.ui.compareText); assert.equal(differenceBodies(h.ui).after, draft);
        if (draft === h.ui.before.value) assert.ok(h.ui.difference.querySelectorAll('p').some(node => /exactly identical/.test(node.textContent)));
        await click(h.ui.save); assert.equal(h.h.writes, writes);
    }
    h.ui.output.value = 'x'.repeat(Core.LIMITS.body + 1); h.ui.output.dispatch('input');
    assert.equal(h.ui.compareText.disabled, true); await click(h.ui.compareText); assert.equal(h.ui.difference.hidden, true);
    h.ui.output.value = 'Repaired {{topic}}'; h.ui.output.dispatch('input'); assert.equal(h.ui.compareText.disabled, false); assert.equal(h.ui.save.disabled, false);
    await click(h.ui.close); h.h.controller.dispose();
});
test('refinement differences: bounded large-change fallback reconstructs both maximum draft and exact source', async () => {
    const body = 'a\r\n'.repeat(600), draft = 'b\n'.repeat(16000);
    const h = await refinedDifference({ body, run: async () => ({ text: draft }) });
    await click(h.ui.compareText); assert.deepEqual(differenceBodies(h.ui), { before: body, after: draft });
    assert.ok(h.ui.difference.querySelectorAll('p').some(node => /Large change/.test(node.textContent)));
    assert.equal(h.ui.difference.querySelector('.prompt-compare-changes').children.length, 2);
    assert.equal(h.ui.output.value.length, Core.LIMITS.body); assert.equal(h.runs, 1); await click(h.ui.close); h.h.controller.dispose();
});
for (const action of ['refresh', 'metadata', 'remove', 'edit', 'read-failure', 'dispose']) test(`refinement differences: ${action} clears the captured source without replacing proposal`, async () => {
    const h = await refinedDifference(); await click(h.ui.compareText); const proposal = h.ui.output.value;
    const record = h.h.controller.record();
    if (action === 'refresh') await h.h.controller.refresh();
    if (action === 'metadata') { await h.h.store.mutate(h.h.store.request('edit', { id: record.id, version: record.version, title: 'Changed title' })); await tick(); }
    if (action === 'remove') { await h.h.store.mutate(h.h.store.request('remove', { id: record.id, version: record.version })); await tick(); }
    if (action === 'edit') h.h.controller.edit();
    if (action === 'read-failure') { h.h.backend.read = async () => { throw Error('Synthetic read failure'); }; await h.h.controller.refresh(); }
    if (action === 'dispose') h.h.controller.dispose();
    h.view.checkModelRun(); assert.equal(h.ui.difference.hidden, true); assert.equal(h.ui.difference.children.length, 0); assert.equal(h.ui.compareText.disabled, true);
    await click(h.ui.compareText); assert.equal(h.ui.difference.hidden, true); assert.equal(h.ui.output.value, proposal);
    await click(h.ui.close); h.h.controller.dispose();
});
test('refinement differences: hidden tab, trial and reentry require a new explicit comparison', async () => {
    const h = await refinedDifference(); await click(h.ui.compareText);
    h.ui.difference.querySelector('pre').focus();
    h.doc.hidden = true; await h.doc.listeners.get('visibilitychange')();
    assert.equal(h.ui.difference.children.length, 0); assert.equal(h.ui.compareText.disabled, true);
    await click(h.ui.compareText); assert.equal(h.ui.difference.hidden, true);
    h.doc.hidden = false; await h.doc.listeners.get('visibilitychange')();
    assert.equal(h.doc.activeElement, h.ui.status);
    assert.equal(h.ui.compareText.disabled, false); assert.equal(h.ui.difference.hidden, true);
    await click(h.ui.compareText); await click(h.ui.trialButton); await tick();
    assert.ok(h.ui.trial); assert.equal(h.ui.difference.children.length, 0); assert.equal(h.ui.compareText.disabled, true);
    await click(h.ui.compareText); assert.equal(h.ui.difference.hidden, true); await click(h.ui.trial.close);
    assert.equal(h.ui.compareText.disabled, false); assert.equal(h.ui.difference.hidden, true);
    await click(h.ui.compareText); h.events.get('pagehide')(); assert.equal(h.ui.difference.children.length, 0); assert.equal(h.ui.compareText.disabled, true);
    await click(h.ui.close); const reopened = h.root.LocalItabAIModelView.open({ view: h.view, mode: 'refine' });
    assert.equal(reopened.compareText.disabled, true); assert.equal(reopened.difference.hidden, true);
    await click(reopened.close); h.h.controller.dispose();
});
test('refinement differences: declined Close keeps it; confirmed Close clears it without taking newer focus', async () => {
    const h = await refinedDifference(); await click(h.ui.compareText); h.root.confirm = () => false;
    await click(h.ui.close); assert.equal(h.ui.difference.hidden, false);
    h.root.confirm = () => true; await click(h.ui.close); assert.equal(h.ui.difference.children.length, 0);
    const outside = h.doc.createElement('button'); h.doc.body.append(outside); outside.focus();
    await click(h.ui.compareText); assert.equal(h.ui.difference.hidden, true); assert.equal(h.doc.activeElement, outside); h.h.controller.dispose();
});
test('refinement differences: pending and uncertain acceptance clear differences and preserve exact retry', async () => {
    const h = await refinedDifference(), pending = deferred(), mutate = h.h.store.mutate.bind(h.h.store);
    await click(h.ui.compareText); h.h.failOnce(); h.h.store.mutate = async command => { await pending.promise; return mutate(command); };
    h.ui.save.dispatch('click'); await tick(); assert.equal(h.ui.compareText.disabled, true); assert.equal(h.ui.difference.children.length, 0);
    pending.resolve(); await settle(h.h.controller); const operation = h.h.controller.pendingCommand; assert.ok(operation);
    assert.equal(h.ui.compareText.disabled, true); await click(h.ui.compareText); assert.equal(h.ui.difference.hidden, true);
    h.ui.output.value = 'Attempted edit'; h.ui.output.dispatch('input'); assert.equal(h.ui.output.value, operation.command.body);
    const writes = h.h.writes; await click(h.ui.save); await settle(h.h.controller); assert.equal(h.h.writes, writes); assert.equal(h.h.controller.pendingCommand, null);
    assert.equal(h.h.controller.record().body, operation.command.body); assert.equal(h.ui.compareText.disabled, true); await click(h.ui.close); h.h.controller.dispose();
});
for (const action of ['failure', 'stop', 'close']) test(`refinement differences: ${action} and late result cannot compare incomplete output`, async () => {
    const pending = rejectableDeferred(); const h = await mount({ mode: 'refine', run: () => pending.promise });
    assert.equal(h.ui.compareText.disabled, true); h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send);
    await click(h.ui.compareText); assert.equal(h.ui.difference.hidden, true);
    if (action === 'failure') pending.reject({ code: 'INCOMPLETE' });
    if (action === 'stop') await click(h.ui.cancel);
    if (action === 'close') await click(h.ui.close);
    pending.resolve({ text: 'Late draft' }); await tick();
    assert.equal(h.ui.compareText.disabled, true); assert.equal(h.ui.difference.children.length, 0); assert.equal(h.ui.save.disabled, true);
    await click(h.ui.compareText); assert.equal(h.ui.difference.hidden, true); if (action !== 'close') await click(h.ui.close); h.h.controller.dispose();
});
test('refinement differences: unowned textarea edits fail closed and non-refinement mode has no difference controls', async () => {
    const h = await refinedDifference(); await click(h.ui.compareText); const exact = h.ui.output.value;
    h.ui.output.value = 'Unowned DOM change'; h.view.checkModelRun();
    assert.equal(h.ui.difference.children.length, 0); assert.equal(h.ui.compareText.disabled, true); await click(h.ui.compareText); assert.equal(h.ui.difference.hidden, true);
    h.ui.output.value = exact; h.view.checkModelRun(); assert.equal(h.ui.compareText.disabled, false); assert.equal(h.ui.difference.hidden, true);
    await click(h.ui.close); h.h.controller.dispose();
    const run = await mount(); assert.equal(run.ui.compareText, null); assert.equal(run.ui.difference, null); await click(run.ui.close); run.h.controller.dispose();
});
test('refinement differences: historical preview and filled variables never replace the current saved template', async () => {
    const h = await mount({ mode: 'refine', body: 'Historical {{topic}}', run: async () => ({ text: 'Proposed {{topic}}' }) });
    await click(h.ui.close); const record = h.h.controller.record(), historyId = record.currentVersionId;
    await h.h.store.mutate(h.h.store.request('edit', { id: record.id, version: record.version, body: 'Current {{topic}}' })); await tick();
    h.h.controller.useVersion(historyId, 'Historical {{topic}}'); h.h.controller.setVariable('topic', 'Synthetic private value');
    const session = h.h.controller.session(), writes = h.h.writes;
    h.ui = h.root.LocalItabAIModelView.open({ view: h.view, mode: 'refine' });
    h.ui.url.value = 'https://synthetic.test/v1/chat/completions'; h.ui.model.value = 'fixture-model'; h.ui.instruction.value = 'Clarify';
    await click(h.ui.review); await click(h.ui.send); await click(h.ui.compareText);
    assert.deepEqual(differenceBodies(h.ui), { before: 'Current {{topic}}', after: 'Proposed {{topic}}' });
    assert.equal(h.h.controller.session(), session); assert.equal(session.versionId, historyId);
    assert.equal(h.h.controller.preview().text, 'Historical Synthetic private value'); assert.equal(h.h.writes, writes);
    await click(h.ui.close); h.h.controller.dispose();
});
test('refinement differences: a source change during transport cannot turn a late completed proposal into a current comparison', async () => {
    const pending = deferred(), h = await mount({ mode: 'refine', run: () => pending.promise });
    h.ui.instruction.value = 'Clarify'; await click(h.ui.review); await click(h.ui.send);
    await h.h.controller.refresh(); pending.resolve({ text: 'Late source proposal' }); await tick();
    assert.equal(h.ui.compareText.disabled, true); await click(h.ui.compareText); assert.equal(h.ui.difference.hidden, true);
    assert.equal(h.ui.save.disabled, true); const writes = h.h.writes; await click(h.ui.save); assert.equal(h.h.writes, writes);
    await click(h.ui.close); h.h.controller.dispose();
});
test('refinement differences: source invalidation and hidden return keep a disabled opener inside the keyboard scope', async () => {
    const h = await refinedDifference(); h.ui.compareText.focus();
    h.doc.hidden = true; await h.doc.listeners.get('visibilitychange')(); assert.equal(h.ui.compareText.disabled, true);
    h.doc.hidden = false; await h.doc.listeners.get('visibilitychange')(); assert.equal(h.doc.activeElement, h.ui.status);
    h.ui.compareText.focus(); await h.h.controller.refresh(); h.view.checkModelRun();
    assert.equal(h.ui.compareText.disabled, true); assert.equal(h.doc.activeElement, h.ui.status);
    h.doc.activeElement.dispatch('keydown', { key: 'Escape', isComposing: true }); assert.equal(h.view.openDialog, true);
    h.doc.activeElement.dispatch('keydown', { key: 'Escape' }); assert.equal(h.view.openDialog, false); h.h.controller.dispose();
});
