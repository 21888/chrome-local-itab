const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-prompts-store');
const Client = require('../shared/ai-model-client');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const { setup, add, tick } = require('./helpers/prompts-harness');
const click = async button => { button.dispatch('click'); await tick(); };
async function mount({ trial = null, run, contains = async () => true, request = async () => true, mutate = async () => {} } = {}) {
    const h = setup(); await h.controller.start(); await add(h.controller, 'Synthetic comparison', 'Same synthetic input');
    const doc = createDocument({ blurUnavailableFocus: true }), events = new Map();
    const profiles = [{ name: 'Synthetic A', url: 'https://a.synthetic.test/v1/chat/completions', model: 'model-a' }, { name: 'Synthetic B', url: 'https://b.synthetic.test/v1/chat/completions', model: 'model-b' }];
    const runs = [], grants = [], writes = []; let listener;
    const root = { document: doc, LocalItabPrompts: Core, LocalItabAIPromptRefinement: require('../shared/ai-prompt-refinement'), LocalItabAIModel: { ...Client, run: async (input, options) => { runs.push({ input, options }); return run ? run(input, options) : { text: `<script>${input.model}</script>`, model: input.model, origin: input.origin }; } },
        chrome: { permissions: { contains, request: async arg => { grants.push(arg); return request(arg); } }, storage: { onChanged: { addListener: fn => { listener = fn; }, removeListener: () => { listener = null; } } } }, confirm: () => true,
        addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key) };
    const context = vm.createContext({ window: root, AbortController });
    for (const path of ['shared/dialog-focus.js', 'shared/ai-model-comparison.js']) vm.runInContext(fs.readFileSync(`${__dirname}/../${path}`, 'utf8'), context);
    const view = { doc, controller: h.controller, t: (_, fallback) => fallback,
        el(tag, className, text) { const element = doc.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; },
        button(_, fallback, action) { const b = this.el('button', '', fallback); b.addEventListener('click', action); return b; } };
    const store = { request(kind, values) { return { kind, ...values, operationId: `synthetic_${values.tool}` }; }, async mutate(command, validator) { writes.push(command); if (!validator(h.raw, command.promptRef)) throw Error('STALE'); return mutate(command); } };
    const ui = root.LocalItabAIModelComparison.open({ view, trial, collectionStore: store, presetStore: { read: async () => ({ records: profiles.map(item => ({ ...item })) }) } });
    await tick();
    const choose = (index, value) => { ui.targets[index].select.value = value; ui.targets[index].select.dispatch('change'); };
    const selectBoth = () => { choose(0, '0'); choose(1, '1'); };
    const done = async () => { await click(ui.close); h.controller.dispose(); };
    return { h, ui, view, root, runs, grants, writes, profiles, events, choose, selectBoth, done, change: (changes, area = 'local') => listener?.(changes, area) };
}
test('same exact prompt, two labeled reviews, independent keys and explicit send/save only', async () => {
    const h = await mount(); h.selectBoth(); await click(h.ui.review);
    assert.equal(h.runs.length, 0); assert.equal(h.grants.length, 0); assert.match(h.ui.status.textContent, /requests: 2/);
    const [a, b] = h.ui.targets;
    assert.match(a.reviewText.textContent, /https:\/\/a.synthetic.test\/v1\/chat\/completions/);
    assert.match(b.reviewText.textContent, /model-b/); assert.equal(h.ui.prompt.readOnly, true);
    await click(a.allow); await click(b.allow); assert.equal(h.runs.length, 0); assert.equal(h.grants.length, 2);
    a.key.value = 'temporary-a'; b.key.value = 'temporary-b'; await click(h.ui.send); await click(h.ui.send);
    assert.equal(h.runs.length, 2); assert.equal(h.runs[0].input.prompt, h.runs[1].input.prompt);
    assert.deepEqual(h.runs.map(item => item.options.key), ['temporary-a', 'temporary-b']);
    assert.equal(a.key.value, ''); assert.equal(b.key.value, ''); assert.equal(h.writes.length, 0);
    assert.equal(h.view.doc.querySelectorAll('script').length, 0); assert.match(a.output.value, /model-a/); assert.match(b.output.value, /model-b/);
    await click(a.save); await click(a.save); await click(b.save); assert.equal(h.writes.length, 2);
    assert.deepEqual(h.writes.map(item => item.tool), ['model-a', 'model-b']);
    for (const write of h.writes) { assert.equal(write.promptRef.promptId, h.h.controller.record().id); assert.equal(write.promptRef.bodyVersionId, h.h.controller.session().versionId); assert.doesNotMatch(JSON.stringify(write), /temporary-/); }
    await h.done();
});
test('one denied permission does not prevent other target success or explicit save', async () => {
    const h = await mount({ contains: async arg => !arg.origins[0].includes('a.synthetic') }); h.selectBoth(); await click(h.ui.review); await click(h.ui.send);
    assert.equal(h.runs.length, 1); assert.match(h.ui.targets[0].message.textContent, /not granted/); assert.equal(h.ui.targets[0].output.hidden, true);
    assert.equal(h.ui.targets[1].output.hidden, false); await click(h.ui.targets[1].save); assert.equal(h.writes.length, 1); await h.done();
});
test('one provider failure retains the other result', async () => {
    const h = await mount({ run: async input => { if (input.model === 'model-a') throw { code: 'AUTH' }; return { text: 'success B', model: input.model, origin: input.origin }; } });
    h.selectBoth(); await click(h.ui.review); await click(h.ui.send); assert.equal(h.runs.length, 2); assert.equal(h.ui.targets[1].output.value, 'success B'); assert.match(h.ui.targets[0].message.textContent, /failed/); await h.done();
});
test('duplicate endpoint/model is rejected and one selected connection makes only one request', async () => {
    const h = await mount(); h.choose(0, '0'); h.choose(1, '0'); await click(h.ui.review); assert.equal(h.ui.send.disabled, true); await click(h.ui.send); assert.equal(h.runs.length, 0);
    h.choose(1, ''); await click(h.ui.review); assert.match(h.ui.status.textContent, /requests: 1/); await click(h.ui.send); assert.equal(h.runs.length, 1); await h.done();
});
test('connection selection clears both keys and both reviews without granting or sending', async () => {
    const h = await mount(); h.selectBoth(); await click(h.ui.review); h.ui.targets.forEach(target => { target.key.value = 'secret'; }); h.choose(1, '');
    assert.equal(h.ui.targets[1].heading.textContent, 'Target 2');
    assert.equal(h.ui.send.disabled, true); for (const target of h.ui.targets) { assert.equal(target.key.value, ''); assert.equal(target.reviewText.hidden, true); }
    assert.equal(h.grants.length, 0); assert.equal(h.runs.length, 0); await h.done();
});
test('profile mutation after review fails closed at send revalidation', async () => {
    const h = await mount(); h.selectBoth(); await click(h.ui.review); h.profiles[0].model = 'changed-after-review'; await click(h.ui.send);
    assert.equal(h.runs.length, 0); assert.equal(h.ui.send.disabled, true); assert.match(h.ui.status.textContent, /connection changed/); await h.done();
});
test('target cancellation ignores late result while other result survives', async () => {
    const pending = deferred(); const h = await mount({ run: async input => input.model === 'model-a' ? pending.promise : { text: 'B survives', model: input.model, origin: input.origin } });
    h.selectBoth(); await click(h.ui.review); h.ui.send.dispatch('click'); await tick(); await click(h.ui.targets[0].stop);
    assert.equal(h.runs[0].options.signal.aborted, true); pending.resolve({ text: 'late A', model: 'model-a', origin: 'https://a.synthetic.test' }); await tick();
    assert.equal(h.ui.targets[0].output.hidden, true); assert.equal(h.ui.targets[1].output.value, 'B survives'); await h.done();
});
test('workspace switch while awaiting permission invalidates batch, clears keys and sends nothing', async () => {
    const pending = deferred(), h = await mount({ contains: () => pending.promise }); h.selectBoth(); await click(h.ui.review); h.ui.targets[0].key.value = 'secret';
    h.ui.send.dispatch('click'); await tick(); h.change({ __localItabWorkspaceRegistryV1: {} }); pending.resolve(true); await tick();
    assert.equal(h.runs.length, 0); assert.equal(h.ui.send.disabled, true); assert.equal(h.ui.targets[0].key.value, ''); await h.done();
});
test('source edits, even edit-back epoch changes, invalidate both reviews', async () => {
    const h = await mount(); h.selectBoth(); await click(h.ui.review); h.h.controller.excerptEpoch++; h.ui.checkSource();
    assert.equal(h.ui.send.disabled, true); assert.equal(h.ui.targets.every(target => target.reviewText.hidden), true); await click(h.ui.send); assert.equal(h.runs.length, 0); await h.done();
});
test('pagehide and close discard late results and clear transient keys', async () => {
    const pending = deferred(), h = await mount({ run: () => pending.promise }); h.selectBoth(); await click(h.ui.review); h.ui.send.dispatch('click'); await tick(); h.events.get('pagehide')();
    pending.resolve({ text: 'late', model: 'fixture', origin: 'https://synthetic.test' }); await tick(); assert.equal(h.ui.targets.every(target => target.output.hidden), true); assert.equal(h.ui.send.disabled, true); await h.done(); assert.equal(h.view.openDialog, false);
});
test('uncertain result save retries same operation and cannot close while save is pending', async () => {
    let count = 0; const pending = deferred(); const h = await mount({ mutate: async () => { if (++count === 1) throw Error('uncertain'); return pending.promise; } });
    h.choose(0, '0'); await click(h.ui.review); await click(h.ui.send); await click(h.ui.targets[0].save); h.ui.targets[0].save.dispatch('click'); await tick(); await click(h.ui.close);
    assert.equal(h.view.openDialog, true); assert.equal(h.writes.length, 2); assert.equal(h.writes[0] === h.writes[1], true);
    pending.resolve(); await tick(); await click(h.ui.targets[0].save); assert.equal(h.writes.length, 2); await h.done();
});
test('model comparison locales and explicit package inventory are complete', () => {
    const source = fs.readFileSync(`${__dirname}/../shared/ai-model-comparison.js`, 'utf8');
    const keys = new Set([...source.matchAll(/\b(?:t|button)\('([A-Za-z]+)', /g)].map(match => `promptsCompare${match[1]}`));
    for (const locale of ['en', 'zh_CN']) { const catalog = JSON.parse(fs.readFileSync(`${__dirname}/../_locales/${locale}/messages.json`, 'utf8')); for (const key of keys) assert.ok(catalog[key]?.message, `${locale}: ${key}`); }
    const inventory = fs.readFileSync(`${__dirname}/../tools/package_extension.py`, 'utf8'); for (const file of ['shared/ai-model-comparison.js', 'ai-model-comparison.css']) assert.equal(inventory.includes(`"${file}"`), true);
});
test('actual prompt-view entry is gated and source edits invalidate the mounted dialog without replacing it', async () => {
    const h = setup(), doc = createDocument({ blurUnavailableFocus: true }), host = doc.createElement('div'); doc.body.append(host);
    const profile = { name: 'Synthetic', url: 'https://synthetic.test/v1/chat/completions', model: 'fixture' };
    const root = { document: doc, LocalItabPrompts: Core, LocalItabAIModel: Client, LocalItabAIModelPresets: { createStore: () => ({ read: async () => ({ records: [profile] }) }) },
        addEventListener() {}, removeEventListener() {}, confirm: () => true, navigator: {}, location: {} };
    const context = vm.createContext({ window: root, AbortController, Intl, Date, Object, Array, Boolean, String, Promise });
    for (const file of ['shared/dialog-focus.js', 'shared/local-prompts-view.js', 'shared/ai-model-comparison.js']) vm.runInContext(fs.readFileSync(`${__dirname}/../${file}`, 'utf8'), context);
    const view = new root.LocalItabPromptsView.View({ host, controller: h.controller, translate: (_, fallback) => fallback }); await h.controller.start(); await add(h.controller, 'Synthetic entry', 'Prompt {{value}}');
    assert.equal(view.previewElements.compare.disabled, true); h.controller.setVariable('value', 'first'); assert.equal(view.previewElements.compare.disabled, false);
    await click(view.previewElements.compare); const overlay = doc.querySelector('.prompt-dialog-overlay'); assert.equal(Boolean(overlay), true);
    const select = overlay.querySelector('select'); select.value = '0'; select.dispatch('change');
    const buttons = overlay.querySelectorAll('button'); const review = buttons.find(button => button.textContent === 'Review comparison requests'), send = buttons.find(button => button.textContent === 'Send reviewed comparison (up to 2 requests)');
    await click(review); assert.equal(send.disabled, false); h.controller.setVariable('value', 'second');
    assert.equal(send.disabled, true); assert.equal(doc.querySelector('.prompt-dialog-overlay') === overlay, true);
    await click(buttons.find(button => button.textContent === 'Close')); h.controller.dispose();
});
test('pending grant is guarded and restore invalidation prevents its late completion enabling Send', async () => {
    const pending = deferred(), h = await mount({ request: () => pending.promise }); h.selectBoth(); await click(h.ui.review);
    h.ui.targets[0].allow.dispatch('click'); h.ui.targets[0].allow.dispatch('click'); await tick(); assert.equal(h.grants.length, 1);
    h.change({ __localItabCombinedRestoreV1: {} }); pending.resolve(true); await tick(); assert.equal(h.ui.send.disabled, true); assert.equal(h.runs.length, 0); await h.done();
});
test('source change after transport starts suppresses both late results and saves', async () => {
    const pending = deferred(), h = await mount({ run: () => pending.promise }); h.selectBoth(); await click(h.ui.review); h.ui.send.dispatch('click'); await tick();
    h.h.controller.excerptEpoch++; h.ui.checkSource(); pending.resolve({ text: 'stale output', model: 'fixture', origin: 'https://synthetic.test' }); await tick();
    assert.equal(h.ui.targets.every(target => target.output.hidden && target.save.disabled), true); assert.equal(h.writes.length, 0); await h.done();
});
test('profile change while send awaits permission aborts both targets before transport', async () => {
    const pending = deferred(), h = await mount({ contains: () => pending.promise }); h.selectBoth(); await click(h.ui.review); h.ui.send.dispatch('click'); await tick();
    h.change({ __localItabAIModelPresetsV1: {} }); pending.resolve(true); await tick();
    assert.equal(h.runs.length, 0); assert.equal(h.ui.send.disabled, true); assert.equal(h.ui.targets.every(target => target.reviewText.hidden && target.key.value === ''), true); await h.done();
});
test('profile change during transport suppresses late results and prevents stale saves', async () => {
    const pending = deferred(), h = await mount({ run: () => pending.promise }); h.selectBoth(); await click(h.ui.review); h.ui.send.dispatch('click'); await tick();
    h.change({ __localItabAIModelPresetsV1: {} }); pending.resolve({ text: 'late profile result', model: 'fixture', origin: 'https://synthetic.test' }); await tick();
    assert.equal(h.runs.length, 2); assert.equal(h.runs.every(item => item.options.signal.aborted), true);
    assert.equal(h.ui.targets.every(target => target.output.hidden && target.save.disabled), true); assert.equal(h.writes.length, 0); await h.done();
});

test('explicit failed-target retry requires fresh review/key and preserves successful save receipt', async () => {
    let attempts = 0;
    const h = await mount({ run: async input => {
        if (input.model === 'model-a' && ++attempts === 1) throw { code: 'AUTH' };
        return { text: `answer ${input.model}`, model: input.model, origin: input.origin };
    } });
    h.selectBoth(); await click(h.ui.review); const [a, b] = h.ui.targets;
    a.key.value = 'old-fixture-key'; await click(h.ui.send); await click(b.save);
    const receipt = b.command, peerReview = b.reviewed;
    assert.equal(a.retrySend.disabled, true); assert.equal(b.retryReview.disabled, true);
    await click(a.retrySend); await click(b.retryReview); assert.equal(h.runs.length, 2);
    a.key.value = 'discarded-fixture-key'; await click(a.retryReview);
    assert.equal(a.key.value, ''); assert.match(a.message.textContent, /one additional request.*cost money/);
    assert.match(a.reviewText.textContent, /a.synthetic.test.*\nModel ID: model-a\n\nSame synthetic input/);
    await click(a.allow); assert.equal(h.runs.length, 2);
    a.key.value = 'fresh-fixture-key'; await click(a.retrySend); await click(a.retrySend);
    assert.equal(h.runs.length, 3); assert.equal(h.runs[2].options.key, 'fresh-fixture-key');
    assert.equal(h.runs[2].input.prompt, h.runs[0].input.prompt);
    assert.equal(a.key.value, ''); assert.equal(b.command, receipt); assert.equal(b.reviewed, peerReview);
    assert.equal(b.saved, true); assert.equal(b.output.value, 'answer model-b');
    await click(b.save); assert.equal(h.writes.length, 1);
    assert.equal(a.retryReview.disabled, true); await h.done();
});
test('permission failure can retry after a separate grant without resending successful peer', async () => {
    let permitted = false;
    const h = await mount({ contains: async arg => permitted || arg.origins[0].includes('b.synthetic'), request: async () => { permitted = true; return true; } });
    h.selectBoth(); await click(h.ui.review); await click(h.ui.send);
    const a = h.ui.targets[0]; assert.equal(h.runs.length, 1);
    await click(a.retryReview); await click(a.allow); assert.equal(h.runs.length, 1);
    await click(a.retrySend); assert.equal(h.runs.length, 2); assert.equal(h.runs[1].input.model, 'model-a'); await h.done();
});
test('Stopped hung target retries while late first transport cannot replace fresh result', async () => {
    const old = deferred(); let attempts = 0;
    const h = await mount({ run: async input => input.model === 'model-a' && ++attempts === 1 ? old.promise : { text: 'fresh result', model: input.model, origin: input.origin } });
    h.selectBoth(); await click(h.ui.review); h.ui.send.dispatch('click'); await tick();
    const a = h.ui.targets[0]; await click(a.stop); assert.equal(a.running, false);
    await click(a.retryReview); assert.equal(a.retrySend.disabled, false);
    await click(a.retrySend); assert.equal(a.output.value, 'fresh result');
    old.resolve({ text: 'late obsolete answer' }); await tick(); assert.equal(a.output.value, 'fresh result');
    assert.equal(h.runs.length, 3); await h.done();
});
test('retry fails closed on unannounced preset edits and source edit-back', async () => {
    for (const kind of ['preset', 'source']) {
        const h = await mount({ run: async () => { throw { code: 'AUTH' }; } });
        h.choose(0, '0'); await click(h.ui.review); await click(h.ui.send); const a = h.ui.targets[0];
        await click(a.retryReview); a.key.value = 'fixture-key';
        if (kind === 'preset') h.profiles[0].model = 'different'; else h.h.controller.excerptEpoch++;
        await click(a.retrySend); assert.equal(h.runs.length, 1); assert.equal(a.key.value, ''); assert.equal(a.retrySend.disabled, true); await h.done();
    }
});
test('pending or uncertain successful-peer save retains command and blocks destructive retry races', async () => {
    let saves = 0; const pending = deferred();
    const h = await mount({ run: async input => { if (input.model === 'model-a') throw { code: 'AUTH' }; return { text: 'B', model: input.model, origin: input.origin }; }, mutate: async () => { if (++saves === 1) throw Error('uncertain'); return pending.promise; } });
    h.selectBoth(); await click(h.ui.review); await click(h.ui.send); const [a, b] = h.ui.targets;
    await click(b.save); const command = b.command;
    await click(a.retryReview); await click(a.retrySend); assert.equal(b.command, command);
    b.save.dispatch('click'); await tick(); assert.equal(a.retryReview.disabled, true); await click(a.retryReview); await click(h.ui.close); assert.equal(h.view.openDialog, true);
    pending.resolve(); await tick(); assert.equal(b.saved, true); assert.equal(h.writes[0], h.writes[1]); await h.done();
});
test('stop while permission is pending fences its late grant and allows explicit fresh retry', async () => {
    const permission = deferred(); let checks = 0;
    const h = await mount({ contains: async () => ++checks === 1 ? permission.promise : true });
    h.choose(0, '0'); await click(h.ui.review); h.ui.send.dispatch('click'); await tick(); const a = h.ui.targets[0];
    await click(a.stop); await click(a.retryReview); await click(a.retrySend); assert.equal(h.runs.length, 1);
    permission.resolve(true); await tick(); assert.equal(h.runs.length, 1); await h.done();
});
test('refinement trial never exposes or accepts failed-target retry controls', async () => {
    const h = await mount({ trial: { source: { body: 'Original synthetic prompt' }, proposal: 'Refined synthetic prompt', current: () => true, onClose() {} }, run: async () => { throw { code: 'AUTH' }; } });
    await click(h.ui.review); await click(h.ui.send); assert.equal(h.runs.length, 2);
    for (const target of h.ui.targets) {
        assert.equal(target.retryReview.hidden, true); assert.equal(target.retrySend.hidden, true);
        assert.equal(target.retryReview.disabled, true); assert.equal(target.retrySend.disabled, true);
        target.retryReview.disabled = target.retrySend.disabled = false;
        await click(target.retryReview); await click(target.retrySend);
    }
    assert.equal(h.runs.length, 2); await h.done();
});
test('close during retry aborts request and late result never restores closed dialog', async () => {
    const pending = deferred(); let attempts = 0;
    const h = await mount({ run: async () => { if (++attempts === 1) throw { code: 'AUTH' }; return pending.promise; } });
    h.choose(0, '0'); await click(h.ui.review); await click(h.ui.send); const a = h.ui.targets[0];
    await click(a.retryReview); a.retrySend.dispatch('click'); await tick(); await click(h.ui.close);
    assert.equal(h.view.openDialog, false); assert.equal(h.runs[1].options.signal.aborted, true);
    pending.resolve({ text: 'late retry' }); await tick(); assert.equal(a.response, null); assert.equal(a.output.value, ''); assert.equal(a.snapshot, null); h.h.controller.dispose();
});
test('stale successful results retain original target labels but cannot save or retry', async () => {
    const h = await mount(); h.selectBoth(); await click(h.ui.review); await click(h.ui.send);
    const labels = h.ui.targets.map(target => target.heading.textContent);
    h.change({ __localItabAIModelPresetsV1: {} });
    assert.deepEqual(h.ui.targets.map(target => target.heading.textContent), labels);
    for (const target of h.ui.targets) { assert.equal(target.save.disabled, true); assert.equal(target.retryReview.disabled, true); assert.match(target.output.value, /model-/); }
    await h.done();
});
