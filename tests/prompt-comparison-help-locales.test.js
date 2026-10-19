const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-prompts-store.js');
const Client = require('../shared/ai-model-client.js');
const { setup, add, settle, tick } = require('./helpers/prompts-harness.js');
const { createDocument } = require('./helpers/task-dom-model.js');

// Exercise the real View translation path and both actual comparison UIs.
// Fixtures are synthetic; opening or closing either UI must stay read-only.
const savedBodies = ['Synthetic before {{topic}}\r\n<literal>', 'Synthetic after {{topic}}\n<literal>'];
const bodyFallback = 'Read-only comparison of saved bodies. Variables are not filled in. From → To determines removed and added text.';
const modelFallback = 'Select up to two saved connections. Review the same completed prompt for each target, then explicitly Send. This makes up to two provider requests; each provider may charge you. Keys are temporary and separate for each target. No automatic retries.';
const modelChinese = '选择最多两个已保存的连接。核对各目标将收到的同一份完整提示词，再明确点击发送。最多会发起两次服务商请求，各服务商都可能收费。每个目标的密钥独立且仅临时使用；不会自动重试。';

async function mount(t, locale) {
    const h = setup(), c = h.controller;
    const doc = createDocument({ blurUnavailableFocus: true }), host = doc.createElement('div'); doc.body.append(host);
    const catalog = locale ? JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${locale}/messages.json`, 'utf8')) : null;
    const calls = { provider: 0, network: 0, permissionCheck: 0, permissionRequest: 0, collectionWrite: 0 };
    const forbidden = name => () => { calls[name]++; throw Error(`Unexpected ${name}`); };
    const root = {
        document: doc, LocalItabPrompts: Core, LocalItabAIModel: { ...Client, run: forbidden('provider') },
        chrome: { permissions: { contains: forbidden('permissionCheck'), request: forbidden('permissionRequest') },
            storage: { onChanged: { addListener() {}, removeListener() {} } } },
        addEventListener() {}, removeEventListener() {}, fetch: forbidden('network')
    };
    // No translate override: the production View must resolve the actual catalog.
    if (catalog) root.i18n = { t: key => catalog[key]?.message || key };
    const context = vm.createContext({ window: root, AbortController, fetch: root.fetch });
    for (const file of ['dialog-focus', 'local-prompts-view', 'ai-model-comparison']) {
        vm.runInContext(fs.readFileSync(`${__dirname}/../shared/${file}.js`, 'utf8'), context);
    }
    const view = new root.LocalItabPromptsView.View({ host, controller: c });
    await c.start(); await add(c, 'Synthetic comparison help', savedBodies[0]);
    c.edit(); c.update('body', savedBodies[1]); await c.save(); await settle(c);
    c.setVariable('topic', 'Synthetic completed value');
    view.main.querySelector('.prompt-history-list').children[0].dispatch('click');
    t.after(() => { doc.querySelector('.ai-compare-dialog') && view.cancelModelDialog?.(); c.dispose(); });
    return { h, c, doc, view, root, catalog, calls, forbidden };
}

function footprint(h) {
    return { raw: h.h.raw, writes: h.h.writes, session: JSON.stringify(h.c.session()), historyId: h.view.historyId };
}
function assertReadOnly(h, before) {
    assert.deepEqual(footprint(h), before, 'opening and closing preserves saved data, preview values and history selection');
    assert.deepEqual(h.calls, { provider: 0, network: 0, permissionCheck: 0, permissionRequest: 0, collectionWrite: 0 });
}

for (const locale of ['en', 'zh_CN', null]) {
    const name = locale || 'no catalog';
    test(`${name}: saved-body comparison explains literal variables and From/To without model warnings`, async t => {
        const h = await mount(t, locale), before = footprint(h);
        h.view.main.querySelector('.prompt-history').open = true;
        h.view.main.querySelector('[data-prompt-focus="compare-open"]').dispatch('click');
        const panel = h.view.main.querySelector('.prompt-comparison'); assert.equal(panel.hidden, false);
        const help = panel.querySelector('.prompt-help').textContent;
        assert.deepEqual(panel.querySelector('.prompt-compare-originals').querySelectorAll('pre').map(node => node.textContent), savedBodies);
        const labels = panel.querySelector('.prompt-compare-grid').querySelectorAll('span').map(node => node.textContent);
        assert.deepEqual(labels, locale === 'zh_CN' ? ['原版本', '新版本'] : ['From', 'To']);
        // Reversing the actual selectors reverses only the compared originals.
        const history = h.c.record().history;
        const from = panel.querySelector('[data-prompt-focus="compare-from"]'); from.value = history[1].id; from.dispatch('change');
        const to = panel.querySelector('[data-prompt-focus="compare-to"]'); to.value = history[0].id; to.dispatch('change');
        assert.deepEqual(panel.querySelector('.prompt-compare-originals').querySelectorAll('pre').map(node => node.textContent), [...savedBodies].reverse());
        panel.querySelector('[data-prompt-focus="compare-close"]').dispatch('click'); assert.equal(panel.hidden, true);
        assertReadOnly(h, before);
        t.diagnostic(JSON.stringify({ locale: name, actualHelp: help, calls: h.calls, storageWriteDelta: h.h.writes - before.writes }));
        if (locale === 'zh_CN') {
            for (const expected of [/只读/, /已保存.*正文/, /变量/, /(?:不|未|不会).*填/, /原版本.*→.*新版本/, /删除/, /新增/]) assert.match(help, expected);
        } else {
            assert.equal(help, bodyFallback);
        }
        assert.doesNotMatch(help, /provider|request|charge|cost|keys?|retries|服务商|请求|收费|密钥|重试/i);
        if (locale) assert.equal(help, h.catalog.promptsSavedBodyCompareHelp?.message, 'saved-body help has its own actual locale entry');
    });

    test(`${name}: model dialog keeps two-request, cost, temporary-key and no-auto-retry warnings`, async t => {
        const h = await mount(t, locale), before = footprint(h);
        const ui = h.root.LocalItabAIModelComparison.open({ view: h.view,
            presetStore: { read: async () => ({ records: [] }) },
            collectionStore: { mutate: h.forbidden('collectionWrite') } });
        assert.ok(ui, 'actual model comparison opens with the real View.t'); await tick();
        const help = ui.overlay.querySelector('.prompt-help').textContent;
        assert.equal(help, h.catalog?.promptsCompareHelp?.message || modelFallback);
        assert.equal(help, locale === 'zh_CN' ? modelChinese : modelFallback, 'original model warning copy remains unchanged');
        if (locale === 'zh_CN') {
            for (const expected of [/最多.*两次.*请求/, /收费/, /密钥.*独立.*临时/, /不会自动重试/]) assert.match(help, expected);
        } else {
            for (const expected of [/up to two provider requests/, /each provider may charge/, /Keys are temporary and separate/, /No automatic retries/]) assert.match(help, expected);
        }
        assert.doesNotMatch(help, /Read-only comparison of saved bodies|只读比较已保存/);
        assert.equal(ui.send.disabled, true); ui.close.dispatch('click'); await tick();
        assert.equal(h.view.openDialog, false); assertReadOnly(h, before);
        t.diagnostic(JSON.stringify({ locale: name, actualHelp: help, calls: h.calls, storageWriteDelta: h.h.writes - before.writes }));
    });
}
