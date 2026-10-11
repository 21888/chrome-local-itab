const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { setup, add } = require('./helpers/collections-harness.js');
const { createDocument } = require('./helpers/task-dom-model.js');
const { Handoff } = require('../shared/collection-capture-page.js');
const Core = require('../shared/local-ai-collections-store.js');
const token = 'a'.repeat(32), payload = { body: '  <script>literal</script>\r\n中文 🧪\t ', sourceCandidate: 'https://example.com/private' };
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function handoff(c, send, extra = {}) { return new Handoff({ controller: c, search: '?capture=' + token, send, clearURL() {}, ...extra }); }
async function mount() {
    const h = setup(), doc = createDocument(), host = doc.createElement('div'); doc.body.append(host);
    const root = { LocalItabAICollections: Core, document: doc, addEventListener() {} };
    vm.runInNewContext(fs.readFileSync('shared/local-ai-collections-view.js', 'utf8'), { window: root });
    const view = new root.LocalItabCollectionsView.View({ host, controller: h.controller, confirm: async () => true });
    view.render(); await h.controller.start(); return { ...h, host, view, doc };
}
test('hydration preserves exact body, blank metadata and dirty baseline without durable write; normal Save persists', async () => {
    const h = setup(), c = h.controller; await c.start();
    assert.equal(c.hydrateCapture(payload, c.captureTicket()), true);
    assert.equal(c.draft().input.body, payload.body); assert.equal(c.draft().input.sourceUrl, ''); assert.equal(c.draft().input.title, '');
    assert.equal(c.draft().input.type, 'other'); assert.equal(c.dirty(), true); assert.equal(h.writes, 0);
    c.update('title', 'Reviewed'); assert.equal(await c.save(), true); assert.equal(c.record().body, payload.body); assert.equal(c.record().sourceUrl, ''); c.dispose();
});
test('hydration rejects existing pristine drafts, pending operations, loading/disposal, and malformed payload', async () => {
    for (const prepare of [c => c.create(), c => { c.pendingCommand = {}; }, c => { c.busy = true; }, c => { c.state = null; }, c => c.dispose()]) {
        const h = setup(), c = h.controller; await c.start(); const ticket = c.captureTicket(); prepare(c);
        assert.equal(c.hydrateCapture(payload, ticket), false); assert.equal(h.writes, 0); c.dispose();
    }
    const h = setup(); await h.controller.start(); assert.equal(h.controller.hydrateCapture({ ...payload, body: '\ud800' }, 0), false); h.controller.dispose();
});
test('delayed claim never overwrites newer work; explicit retry after discard hydrates once and acknowledges', async () => {
    const h = setup(), c = h.controller; await c.start(); const delayed = defer(), calls = [];
    const page = handoff(c, async message => { calls.push(message.type); return calls.length === 1 ? delayed.promise : message.type.endsWith('claim') ? { ok: true, payload } : { ok: true }; });
    const pending = page.run(); c.create(); c.update('body', 'my newer text'); delayed.resolve({ ok: true, payload });
    assert.equal(await pending, false); assert.equal(c.draft().input.body, 'my newer text'); assert.equal(c.capture.error, 'guarded'); assert.equal(calls.length, 1);
    c.discard(); assert.equal(await page.run(true), true); assert.equal(c.draft().input.body, payload.body); assert.equal(calls.filter(t => t.endsWith('ack')).length, 1); assert.equal(h.writes, 0); c.dispose();
});
test('create and discard during initial load still blocks late automatic hydration', async () => {
    const h = setup(), c = h.controller; await c.start(); const wait = defer(), page = handoff(c, () => wait.promise);
    const pending = page.run(); c.create(); c.discard(); wait.resolve({ ok: true, payload }); await pending;
    assert.equal(c.drafts.size, 0); assert.equal(c.capture.error, 'guarded'); c.dispose();
});
test('ack failure retries only cleanup, never replaces edited draft; token clears after confirmed ack', async () => {
    const h = setup(), c = h.controller; await c.start(); let calls = 0, cleared = 0;
    const page = handoff(c, async message => { calls++; if (calls === 2) throw new Error('lost response'); return message.type.endsWith('claim') ? { ok: true, payload } : { ok: true }; }, { clearURL: () => cleared++ });
    assert.equal(await page.run(), false); assert.equal(c.capture.state, 'ack'); assert.equal(cleared, 0);
    c.update('body', 'edited after hydration'); assert.equal(await page.run(true), true); assert.equal(c.draft().input.body, 'edited after hydration'); assert.equal(calls, 3); assert.equal(cleared, 1);
    assert.equal(await page.run(true), false); assert.equal(calls, 3); c.dispose();
});
test('closed/disposed page and pending view review do not consume payload', async () => {
    for (const disposed of [true, false]) {
        const h = setup(), c = h.controller; await c.start(); const delayed = defer(); let calls = 0;
        const page = handoff(c, () => { calls++; return delayed.promise; }, { blocked: () => !disposed });
        const pending = page.run(); if (disposed) c.dispose(); delayed.resolve({ ok: true, payload }); await pending;
        assert.equal(c.drafts.size, 0); assert.equal(calls, 1); c.dispose();
    }
});
test('invalid tokens and fixed error routes never call the worker or render supplied error text', async () => {
    const h = setup(); await h.controller.start(); let calls = 0;
    for (const search of ['?capture=secret', '?capture=' + token + '&capture=' + token, '?captureError=<script>secret</script>']) {
        const page = new Handoff({ controller: h.controller, search, send: () => calls++, clearURL() {} }); await page.run(); assert.equal(h.controller.capture.error, 'invalid');
    }
    assert.equal(calls, 0); h.controller.dispose();
});
test('model DOM capture source opt-in is unchecked, literal, and only persists after Save', async () => {
    const h = await mount(), c = h.controller; c.hydrateCapture(payload, c.captureTicket());
    assert.equal(h.view.editor.fields.body.value, payload.body); assert.equal(h.view.editor.captureCheck.checked, false); assert.equal(h.view.editor.fields.sourceUrl.value, '');
    h.view.editor.captureCheck.checked = true; h.view.editor.captureCheck.dispatch('change'); assert.equal(c.draft().input.sourceUrl, payload.sourceCandidate); assert.equal(h.writes, 0);
    h.view.editor.captureCheck.checked = false; h.view.editor.captureCheck.dispatch('change'); assert.equal(c.draft().input.sourceUrl, '');
    const input = h.view.editor.fields.sourceUrl; input.value = 'https://manual.example/source'; input.dispatch('input'); assert.equal(h.view.editor.captureCheck.checked, false);
    c.update('title', 'Reviewed'); await h.view.save(); assert.equal(c.record().sourceUrl, input.value); assert.equal(c.record().body, payload.body); assert.equal(h.host.querySelectorAll('script, iframe, img').length, 0); c.dispose();
});
test('captured duplicate still requires existing review; uncertain Save retries same operation', async () => {
    const h = await mount(), c = h.controller; await add(c, 'First', payload.body); c.hydrateCapture(payload, c.captureTicket()); c.update('title', 'Second');
    h.view.confirm = async () => false; await h.view.save(); assert.equal(c.state.records.length, 1); assert.ok(c.draft());
    h.view.confirm = async () => true; h.failOnce(); await h.view.save(); assert.ok(c.pendingCommand); const operation = c.pendingCommand.command.operationId;
    await c.retry(); assert.equal(c.state.records.length, 2); assert.equal(c.record().id, operation); c.dispose();
});
test('all capture UI keys localized; manifest permission change and packaged files bounded', () => {
    const en = JSON.parse(fs.readFileSync('_locales/en/messages.json')), zh = JSON.parse(fs.readFileSync('_locales/zh_CN/messages.json'));
    for (const key of Object.keys(en).filter(key => key.startsWith('collectionsCapture') || key === 'captureMenu')) { assert.ok(zh[key]?.message); assert.ok(en[key]?.message); }
    const manifest = JSON.parse(fs.readFileSync('manifest.json')); assert.deepEqual(manifest.permissions, ['storage', 'unlimitedStorage', 'identity', 'contextMenus']);
    assert.equal(manifest.background.service_worker, 'collection-capture-background.js'); assert.equal(manifest.content_scripts, undefined); assert.equal(manifest.web_accessible_resources, undefined);
    const pack = fs.readFileSync('tools/package_extension.py', 'utf8'); for (const path of ['collection-capture-background.js', 'shared/collection-capture.js', 'shared/collection-capture-page.js']) assert.ok(pack.includes('"' + path + '"'));
});
test('capture Save uses only the fenced Store and leaves draft intact when its backend refuses', async () => {
    const h = setup(), c = h.controller; await c.start(); c.hydrateCapture(payload, c.captureTicket()); c.update('title', 'Title');
    h.store.mutate = async () => { const error = new Error('fenced'); error.code = 'CONFLICT'; throw error; };
    assert.equal(await c.save(), false); assert.equal(h.writes, 0); assert.equal(c.draft().input.body, payload.body); assert.equal(c.draft().conflict, true); c.dispose();
});
test('pending cleanup acknowledgment tolerates discard without rehydration or a durable write', async () => {
    const h = setup(), c = h.controller; await c.start(); let n = 0;
    const page = handoff(c, async () => ++n === 1 ? { ok: true, payload } : n === 2 ? { ok: false } : { ok: true });
    await page.run(); c.discard(); await page.run(true); assert.equal(c.drafts.size, 0); assert.equal(n, 3); assert.equal(h.writes, 0); c.dispose();
});
