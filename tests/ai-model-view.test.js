const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-prompts-store');
const Client = require('../shared/ai-model-client');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const { setup, add, tick } = require('./helpers/prompts-harness');
async function mount({ run, contains = async () => true, request = async () => true, mutate = async () => {}, presetStore } = {}) {
    const h = setup(); await h.controller.start(); await add(h.controller, 'Synthetic prompt', 'Synthetic input <script>text</script>');
    const doc = createDocument({ blurUnavailableFocus: true }), events = new Map(); let runs = 0, grants = 0, writes = 0, command;
    const root = { document: doc, LocalItabPrompts: Core, LocalItabAIModel: { ...Client, run: async (...args) => { runs++; return run ? run(...args) : { text: '<script>synthetic output</script>', model: 'fixture-model', origin: 'https://synthetic.test' }; } },
        chrome: { permissions: { contains, request: async (...args) => { grants++; return request(...args); } } }, confirm: () => true,
        addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name) };
    const context = vm.createContext({ window: root, AbortController });
    for (const file of ['shared/dialog-focus.js', 'shared/ai-model-view.js']) vm.runInContext(fs.readFileSync(`${__dirname}/../${file}`, 'utf8'), context);
    const view = { doc, controller: h.controller, t: (_, fallback) => fallback,
        el(tag, className, text) { const el = doc.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; },
        button(name, fallback, action) { const b = this.el('button', '', fallback); b.addEventListener('click', action); return b; } };
    const store = { request(kind, values) { return { kind, ...values, operationId: 'synthetic_operation' }; }, async mutate(value, validator) { writes++; command = value; assert.equal(validator(h.raw, value.promptRef), true); return mutate(value); } };
    const ui = root.LocalItabAIModelView.open({ view, collectionStore: store, presetStore });
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
    for (const file of ['shared/ai-model-client.js', 'shared/ai-model-presets.js', 'shared/ai-model-view.js', 'ai-model.css']) assert.ok(inventory.includes(`"${file}"`));
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
