const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Context = require('../shared/ai-context');
const Client = require('../shared/ai-model-client');
const { createDocument } = require('./helpers/task-dom-model');

// Use the production host -> context View -> catalog path. All data is synthetic.
// Opening settings must not select a preset, alter fields, grant, send, or write.
const controls = [
    ['PresetName', 'Connection preset name', '连接预设名称', view => view.presetName.parentElement.textContent],
    ['PresetSave', 'Save connection preset', '保存连接预设', view => view.presetSave.textContent],
    ['PresetDelete', 'Delete connection preset', '删除连接预设', view => view.presetDelete.textContent]
];

async function mount(t, locale) {
    const document = createDocument({ blurUnavailableFocus: true });
    const trigger = document.createElement('button'); trigger.id = 'ai-context-entry'; document.body.append(trigger);
    const catalog = locale ? JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${locale}/messages.json`, 'utf8')) : null;
    const lookups = [], calls = { provider: 0, network: 0, permission: 0, writes: 0 };
    const forbidden = name => () => { calls[name]++; throw new Error(`Unexpected ${name}`); };
    const presets = { version: 1, records: [{ name: 'Synthetic saved connection', url: 'https://synthetic.test/v1/chat/completions', model: 'synthetic-model' }] };
    const presetStore = { read: async () => structuredClone(presets), save: forbidden('writes'), remove: forbidden('writes') };
    const backend = { read: async () => undefined, write: forbidden('writes'), lock: action => action(), subscribe: () => () => {} };
    const permissions = { contains: forbidden('permission'), request: forbidden('permission') };
    const transport = { ...Client, run: forbidden('provider') };
    const controller = new Context.Controller({ transport, permissions, ensureActive: async () => {}, readSources: async () => [],
        taskStore: { backend }, collectionStore: { backend } });
    const root = { document, chrome: { permissions }, confirm: () => true,
        addEventListener() {}, removeEventListener() {}, fetch: forbidden('network'),
        LocalItabAIModel: transport, LocalItabAIModelPresets: { createStore: () => presetStore },
        LocalItabAIContext: { ...Context, createController: () => controller } };
    if (catalog) root.i18n = { t: key => { lookups.push(key); return catalog[key]?.message || key; } };
    const context = vm.createContext({ window: root, fetch: root.fetch, AbortController });
    const load = file => vm.runInContext(fs.readFileSync(`${__dirname}/../${file}`, 'utf8'), context, { filename: file });
    load('shared/dialog-focus.js'); load('shared/ai-context-view.js');
    let view;
    const realMount = root.LocalItabAIContextView.mount;
    // Capture the real return value; do not replace its translation function.
    root.LocalItabAIContextView.mount = (...args) => { view = realMount(...args); return view; };
    load('ai-context.js');
    trigger.dispatch('click'); assert.ok(view, 'production host mounted the actual context UI');
    t.after(() => { document.querySelector('.ai-context-close')?.dispatch('click'); controller.close(); });
    const fields = () => ({ preset: view.presetSelect.value, name: view.presetName.value,
        endpoint: document.querySelector('.ai-context-endpoint').value, model: document.querySelector('.ai-context-model').value,
        key: document.querySelector('.ai-context-key').value, question: document.querySelector('.ai-context-question').value });
    const original = fields(), saved = structuredClone(presets);
    await view.ready;
    const connection = document.querySelector('.ai-context-connection');
    connection.open = true;
    assert.deepEqual(fields(), original, 'loading/opening settings does not apply a connection or alter existing fields');
    assert.deepEqual(presets, saved, 'saved connection metadata is unchanged');
    assert.equal(view.presetSelect.value, '', 'saved connection remains unselected');
    assert.equal(controller.reviewed, null); assert.equal(controller.localReview, null); assert.equal(controller.result, null);
    assert.deepEqual(calls, { provider: 0, network: 0, permission: 0, writes: 0 });
    return { view, catalog, lookups, calls, fields: fields() };
}

for (const locale of ['en', 'zh_CN', null]) for (const [name, english, chinese, text] of controls) {
    test(`${locale || 'no catalog'}: actual context host localizes ${name} without side effects`, async t => {
        const h = await mount(t, locale), actual = text(h.view), expected = locale === 'zh_CN' ? chinese : english;
        if (h.catalog) {
            assert.ok(h.lookups.includes(`aiContext${name}`), 'actual production lookup uses the context namespace');
            assert.equal(h.catalog[`promptsModel${name}`].message, expected, 'the established shared preset wording is the expected literal');
        }
        t.diagnostic(JSON.stringify({ locale: locale || 'no catalog', key: `aiContext${name}`, actual, expected, fields: h.fields, calls: h.calls }));
        assert.equal(actual, expected);
    });
}
