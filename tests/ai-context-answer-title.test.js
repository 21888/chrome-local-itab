// Real controller, collection Store and view, with synthetic transport/storage/DOM.
// Text-input CR/LF sanitization is modeled below; this is not native Chrome QA.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { webcrypto } = require('node:crypto'); global.crypto ||= webcrypto;
const { createDocument, deferred } = require('./helpers/task-dom-model');
const Context = require('../shared/ai-context'), Collections = require('../shared/local-ai-collections-store');
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
const question = 'Compare\tthese synthetic excerpts';
const body = '  # Complete synthetic answer 🧪\r\nLine\twith literal spacing.\rLast line.\n<a>untrusted markup</a>  ';
const source = { id: 'manual:synthetic', label: 'Synthetic excerpt', text: 'Original\r\nsource\ttext', scope: 'manual' };
function setup() {
    let raw, queue = Promise.resolve(), readbackMismatch = false;
    const calls = { active: 0, sends: 0, permissions: 0 };
    const backend = { reads: 0, writes: 0, fail: null,
        lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() { this.reads++; if (readbackMismatch) { readbackMismatch = false; return undefined; } return structuredClone(raw); },
        async write(value) { this.writes++; raw = structuredClone(value); const fail = this.fail; this.fail = null;
            if (fail === 'after') throw Error('Synthetic write acknowledgement fault');
            if (fail === 'readback') readbackMismatch = true;
        }, subscribe: () => () => {} };
    const controller = new Context.Controller({ collectionStore: new Collections.Store(backend),
        ensureActive: async () => { calls.active++; }, readSources: async () => [source],
        transport: { review: input => ({ ...input, origin: 'https://synthetic.example', permission: 'https://synthetic.example:443/*' }),
            run: async () => { calls.sends++; return { text: body }; } },
        permissions: { request: async () => { calls.permissions++; return true; }, contains: async () => { calls.permissions++; return true; } } });
    return { controller, backend, calls };
}
async function receive(h, value = question) {
    await h.controller.review({ question: value, selected: [source], mode: 'answer', url: 'https://synthetic.example/v1/chat/completions', model: 'synthetic-model' });
    await h.controller.send();
}
async function ui(locale) {
    const h = setup(), document = createDocument(), make = document.createElement.bind(document);
    document.createElement = tag => {
        const node = make(tag);
        if (tag === 'input') {
            let value = '';
            // HTML text-input value sanitization removes CR/LF, but preserves TAB.
            Object.defineProperty(node, 'value', { get: () => value, set: text => { value = node.type === 'text' ? String(text).replace(/[\r\n]/g, '') : String(text); } });
        }
        return node;
    };
    const host = document.createElement('main'); document.body.append(host);
    const window = { document, confirm: () => true, addEventListener() {}, removeEventListener() {} };
    // Production view and controller share a realm; bridge only this VM boundary.
    const review = h.controller.review.bind(h.controller);
    h.controller.review = input => review(JSON.parse(JSON.stringify(input)));
    vm.runInNewContext(fs.readFileSync('shared/ai-context-view.js', 'utf8'), { window });
    const messages = locale && JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const t = (key, fallback) => key === 'aiContextAnswerTitleInvalid' ? messages?.[key]?.message || fallback : fallback;
    const view = window.LocalItabAIContextView.mount(host, { controller: h.controller, presetStore: null, t }); await view.ready;
    const input = (node, value) => { node.value = value; node.dispatch('input'); };
    const button = text => host.querySelectorAll('button').find(node => node.textContent.startsWith(text));
    const click = text => { const node = button(text); assert(node && !node.disabled, `${text} enabled`); node.dispatch('click'); };
    input(host.querySelector('.ai-context-question'), question);
    input(host.querySelector('.ai-context-endpoint'), 'https://synthetic.example/v1/chat/completions');
    input(host.querySelector('.ai-context-model'), 'synthetic-model');
    const selected = host.querySelector('.ai-context-source').querySelector('input'); selected.checked = true; selected.dispatch('change');
    click('Review exact'); await settle(); click('Send reviewed'); await settle();
    return { ...h, host, view, input, button, click, title: host.querySelector('.ai-context-savetitle'),
        option: host.querySelector('.ai-context-save-context').querySelector('input'), status: host.querySelector('.ai-context-status') };
}
async function idle(h) {
    for (let i = 0; i < 100 && (h.controller.busy || h.view.pending && !h.controller.saveCommand); i++) await new Promise(resolve => setTimeout(resolve, 5));
    await settle(); assert.equal(h.controller.busy, false);
}
function unlocked(h) {
    assert.equal(h.controller.saveCommand, null); assert.equal(h.controller.saveUncertain, false);
    assert.equal(h.title.disabled, false); assert.equal(h.button('Cancel / clear').disabled, false);
    assert.equal(h.button('Check earlier save').hidden, true); assert.equal(h.view.pending, false);
}

test('provider answer title rejects every C0/DEL before active check or command and preserves exact answer/snapshot', async () => {
    const h = setup(); await receive(h); const result = h.controller.result, snapshot = h.controller.answerSnapshot();
    const before = { ...h.calls }, reads = h.backend.reads;
    for (const code of [...Array(32).keys(), 127]) {
        await assert.rejects(h.controller.saveAnswer(`Synthetic${String.fromCharCode(code)}title`, { includeContext: true }), { code: 'ANSWER_TITLE' });
        assert.equal(h.controller.saveCommand, null); assert.equal(h.controller.saveUncertain, false);
        assert.equal(h.controller.result, result); assert.equal(h.controller.busy, false); assert.equal(h.controller.saved, false);
    }
    assert.deepEqual(h.calls, before); assert.equal(h.backend.reads, reads); assert.equal(h.backend.writes, 0);
    await h.controller.saveAnswer('  Corrected 🧪 title  ', { includeContext: true });
    const record = (await h.controller.collectionStore.read()).records[0];
    assert.equal(record.title, '  Corrected 🧪 title  '); assert.equal(record.body, body); assert.equal(record.history[0].body, body);
    assert.deepEqual(record.contextSnapshot, snapshot); assert.equal(record.contextSnapshot.question, question);
    assert.equal(record.contextSnapshot.sources[0].text, source.text); assert.equal(h.backend.writes, 1);
    assert.equal(h.calls.sends, before.sends); assert.equal(h.calls.permissions, before.permissions);
});

for (const locale of [undefined, 'en', 'zh_CN']) test(`provider answer title TAB default is repairable in UI with ${locale || 'fallback'} feedback`, async () => {
    const h = await ui(locale), result = h.controller.result, snapshot = h.controller.answerSnapshot(), calls = { ...h.calls };
    assert.equal(h.title.type, 'text'); assert.equal(h.title.value, question);
    h.option.checked = true; h.option.dispatch('change');
    h.click('Save answer'); h.button('Save answer').dispatch('click'); await idle(h);
    unlocked(h); assert.equal(h.title.value, question); assert.equal(h.option.checked, true); assert.equal(h.controller.result, result); assert.equal(h.backend.writes, 0);
    const expected = locale ? JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8')).aiContextAnswerTitleInvalid.message
        : 'The saved-answer title cannot contain tabs, line breaks or control characters. Edit the title and save again. Your answer and snapshot choice are kept; nothing was written.';
    assert.equal(h.status.textContent, expected); assert.deepEqual(h.calls, calls);
    h.input(h.title, 'Corrected synthetic title');
    const gate = deferred(), active = h.controller.ensureActive;
    h.controller.ensureActive = async () => { await gate.promise; await active(); };
    h.click('Save answer'); h.button('Save answer').dispatch('click'); gate.resolve(); await idle(h);
    assert.equal(h.backend.writes, 1); assert.equal(h.controller.saved, true);
    const record = (await h.controller.collectionStore.read()).records[0];
    assert.equal(record.title, 'Corrected synthetic title'); assert.equal(record.body, body); assert.deepEqual(record.contextSnapshot, snapshot);
    h.button('Save answer').dispatch('click'); await idle(h); assert.equal(h.backend.writes, 1);
    assert.equal(h.calls.sends, calls.sends); assert.equal(h.calls.permissions, calls.permissions);
});

test('provider answer title refusal leaves Cancel usable without a save or resend', async () => {
    const h = await ui(); h.click('Save answer'); await idle(h); unlocked(h);
    h.click('Cancel / clear'); assert.equal(h.controller.result, null); assert.equal(h.title.value, '');
    assert.equal(h.backend.writes, 0); assert.equal(h.calls.sends, 1);
});

test('provider answer title correction saves the earlier result and original snapshot after a new question review', async () => {
    const h = await ui(), result = h.controller.result, snapshot = h.controller.answerSnapshot();
    h.option.checked = true; h.option.dispatch('change'); h.click('Save answer'); await idle(h); unlocked(h);
    h.input(h.host.querySelector('.ai-context-question'), 'New unsubmitted question'); h.click('Review exact'); await settle();
    assert.equal(h.controller.result, result); assert.equal(h.title.value, question);
    h.input(h.title, 'Earlier answer'); h.click('Save answer'); await idle(h);
    const record = (await h.controller.collectionStore.read()).records[0];
    assert.equal(record.body, body); assert.deepEqual(record.contextSnapshot, snapshot); assert.equal(h.calls.sends, 1); assert.equal(h.backend.writes, 1);
});

for (const [failure, code] of [['after', 'WRITE'], ['readback', 'VERIFY']]) test(`provider answer title does not unlock or replace a genuine ${code} uncertain command`, async () => {
    const h = await ui(); h.input(h.title, 'Original valid title'); h.option.checked = true; h.option.dispatch('change');
    const snapshot = h.controller.answerSnapshot(); h.backend.fail = failure;
    const save = h.controller.saveAnswer.bind(h.controller); let failedCode;
    h.controller.saveAnswer = async (...args) => { try { return await save(...args); } catch (error) { failedCode = error.code; throw error; } };
    h.click('Save answer'); await idle(h); assert.equal(failedCode, code);
    const command = h.controller.saveCommand; assert(command); assert.equal(h.controller.saveUncertain, true);
    assert.equal(h.title.disabled, true); assert.equal(h.button('Cancel / clear').disabled, true);
    assert.equal(h.button('Check earlier save').hidden, false); assert.match(h.status.textContent, /earlier answer save is unconfirmed/);
    // Programmatic invalid retry is not an ordinary UI edit: the real title field is locked.
    await assert.rejects(h.controller.saveAnswer('Ignored\tretry title'), { code: 'ANSWER_TITLE' });
    assert.equal(h.controller.saveCommand, command); assert.equal(h.controller.saveUncertain, true);
    assert.equal(h.title.value, 'Original valid title'); assert.equal(h.title.disabled, true);
    // Route that API error through the view without pretending the locked field is editable.
    const retry = h.controller.saveAnswer; h.controller.saveAnswer = () => retry('Ignored\tretry title');
    h.click('Save answer'); await idle(h); h.controller.saveAnswer = retry;
    assert.equal(h.controller.saveCommand, command); assert.equal(h.controller.saveUncertain, true);
    assert.match(h.status.textContent, /earlier answer save is unconfirmed/);
    assert.doesNotMatch(h.status.textContent, /Edit the title|nothing was written/);
    assert.equal(h.backend.writes, 1); assert.throws(() => h.controller.clear(), { code: 'BUSY' });
    await h.controller.saveAnswer('Ignored valid retry title', { includeContext: false });
    assert.equal(h.controller.saved, true); assert.equal(h.controller.saveCommand, null); assert.equal(h.backend.writes, 1);
    const record = (await h.controller.collectionStore.read()).records[0];
    assert.equal(record.id, command.operationId); assert.equal(record.title, 'Original valid title'); assert.equal(record.body, body); assert.deepEqual(record.contextSnapshot, snapshot);
    assert.equal(h.calls.sends, 1);
});
