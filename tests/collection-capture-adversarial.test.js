const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Worker = require('../collection-capture-background.js');
const { Handoff } = require('../shared/collection-capture-page.js');
const { setup, tick } = require('./helpers/collections-harness.js');
const token = 'd'.repeat(32);
const payload = { body: '  literal <svg/onload=bad()>\r\n中文 👩🏽‍💻\t', sourceCandidate: 'https://example.test/private/path' };
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function brokerFixture() {
    let raw = {}, rejectAfterWrite = false;
    const runtime = { id: 'audit-extension', getURL: path => 'chrome-extension://audit-extension/' + path };
    const chrome = { runtime, tabs: { create: async () => ({ id: 88 }) }, storage: { session: {
        get: async () => structuredClone(raw),
        set: async value => { raw = structuredClone(value); if (rejectAfterWrite) { rejectAfterWrite = false; throw Error('uncertain completion'); } }
    } } };
    const options = { now: () => 1000, token: () => token };
    const sender = { id: runtime.id, frameId: 0, url: runtime.getURL('collections.html?capture=' + token), tab: { id: 88 } };
    return { create: () => Worker.createBroker(chrome, options), sender, message: type => ({ type, token }),
        ambiguousWrite() { rejectAfterWrite = true; }, get raw() { return structuredClone(raw); } };
}
async function seed(f, broker) {
    assert.equal((await broker.handleClick({ menuItemId: Worker.MENU_ID, editable: false,
        selectionText: payload.body, pageUrl: payload.sourceCandidate }, { id: 7, incognito: false })).ok, true);
}
test('adversarial: committed-but-rejected claim survives worker restart without disclosing prematurely', async () => {
    const f = brokerFixture(), broker = f.create(); await seed(f, broker); f.ambiguousWrite();
    const failed = await broker.handleMessage(f.message(Worker.CLAIM), f.sender);
    assert.equal(failed.ok, false); assert.equal(Object.hasOwn(failed, 'payload'), false);
    assert.equal(f.raw[Worker.KEY].entries[0].status, 'claimed');
    assert.deepEqual((await f.create().handleMessage(f.message(Worker.CLAIM), f.sender)).payload, payload);
});
test('adversarial: committed-but-rejected ack is idempotent after restart and cannot replay content', async () => {
    const f = brokerFixture(), broker = f.create(); await seed(f, broker);
    assert.equal((await broker.handleMessage(f.message(Worker.CLAIM), f.sender)).ok, true); f.ambiguousWrite();
    assert.equal((await broker.handleMessage(f.message(Worker.ACK), f.sender)).ok, false);
    assert.equal(Object.hasOwn(f.raw[Worker.KEY].entries[0], 'payload'), false);
    assert.equal(JSON.stringify(f.raw).includes('literal'), false);
    const restarted = f.create();
    assert.deepEqual(await restarted.handleMessage(f.message(Worker.ACK), f.sender), { ok: true });
    assert.deepEqual(await restarted.handleMessage(f.message(Worker.CLAIM), f.sender), { ok: false, error: 'expired' });
});
test('adversarial: concurrent retry buttons make one claim and one cleanup without persistent writes', async () => {
    const h = setup(); await h.controller.start(); const gate = defer(); let calls = 0;
    const page = new Handoff({ controller: h.controller, search: '?capture=' + token, clearURL() {},
        send: async () => ++calls === 1 ? gate.promise : { ok: true } });
    const first = page.run();
    assert.deepEqual(await Promise.all([page.run(true), page.run(true), page.run()]), [false, false, false]);
    gate.resolve({ ok: true, payload }); assert.equal(await first, true);
    assert.equal(calls, 2); assert.equal(h.controller.drafts.size, 1); assert.equal(h.writes, 0); h.controller.dispose();
});
test('adversarial: a hidden dirty draft blocks capture even when another saved item is selected', async () => {
    const h = setup(); await h.controller.start(); const c = h.controller;
    c.create(); c.update('body', 'Keep this hidden draft'); c.select(null);
    assert.equal(c.hydrateCapture(payload, c.captureTicket()), false);
    assert.equal(c.drafts.get('new').input.body, 'Keep this hidden draft'); assert.equal(h.writes, 0); c.dispose();
});
function bootstrap({ startGate, claimGate }) {
    const h = setup(), c = h.controller, events = new Map(), sent = [];
    const originalStart = c.start.bind(c);
    c.start = async () => { if (startGate) await startGate.promise; await originalStart(); };
    const window = {
        document: { getElementById: () => ({}) }, location: { search: '?capture=' + token, pathname: '/collections.html' },
        history: { replaceState() {} }, addEventListener: (name, fn) => events.set(name, fn),
        LocalItabAICollections: { Store: function () { return h.store; } },
        LocalItabPrompts: { Store: function () { return { read() {}, subscribe() {} }; } },
        LocalItabWorkspaces: { manager: { createCollectionBackend() {}, createPromptBackend() {} } },
        LocalItabCollectionsController: { Controller: function () { return c; } },
        LocalItabAISearch: { prepareTarget() {} }, LocalItabCapturePage: { Handoff },
        LocalItabCollectionsView: { View: class { constructor() { this.proposals = new Map(); this.revisionDraft = null; this.openDialog = false; } attachDepartureGuard() {} render() {} } },
        chrome: { storage: { local: { get: async () => { throw Error('appearance unavailable'); } }, onChanged: { addListener() {} } },
            runtime: { sendMessage: async message => { sent.push(message.type); return claimGate.promise; } } }
    };
    vm.runInNewContext(fs.readFileSync('collections.js', 'utf8'), { window });
    return { ...h, events, sent };
}
test('adversarial: bootstrap installs departure disposal before initial asynchronous loading', async () => {
    const startGate = defer(), claimGate = defer(), h = bootstrap({ startGate, claimGate });
    assert.equal(typeof h.events.get('pagehide'), 'function', 'pagehide must be registered before awaiting start');
    h.events.get('pagehide')({ persisted: false }); startGate.resolve(); claimGate.resolve({ ok: true, payload }); await tick();
    assert.equal(h.controller.disposed, true); assert.equal(h.sent.length, 0); assert.equal(h.controller.drafts.size, 0);
});
test('adversarial: departure while claim waits cannot hydrate or acknowledge after its late response', async () => {
    const claimGate = defer(), h = bootstrap({ claimGate }); await tick();
    assert.deepEqual(h.sent, [Worker.CLAIM]);
    assert.equal(typeof h.events.get('pagehide'), 'function', 'pagehide must be registered before awaiting claim');
    h.events.get('pagehide')({ persisted: false }); claimGate.resolve({ ok: true, payload }); await tick();
    assert.equal(h.controller.drafts.size, 0); assert.deepEqual(h.sent, [Worker.CLAIM]); assert.equal(h.writes, 0);
});
test('adversarial: only the intended contextMenus permission is added to the pre-existing manifest', () => {
    const candidate = JSON.parse(fs.readFileSync('manifest.json'));
    // Pre-capture manifest values verified against the integrated search candidate.
    const baseline = { permissions: ['storage', 'unlimitedStorage', 'identity'],
        host_permissions: ['https://www.googleapis.com/*'], optional_host_permissions: ['https://www.google.com/*'] };
    assert.deepEqual(candidate.permissions.filter(value => !baseline.permissions.includes(value)), ['contextMenus']);
    assert.deepEqual(candidate.host_permissions, baseline.host_permissions);
    assert.deepEqual(candidate.optional_host_permissions, baseline.optional_host_permissions);
    for (const field of ['content_scripts', 'web_accessible_resources', 'externally_connectable']) assert.deepEqual(candidate[field], baseline[field]);
});
