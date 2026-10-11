const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const Capture = require('../shared/collection-capture.js');
const Worker = require('../collection-capture-background.js');
const Core = require('../shared/local-ai-collections-store.js');
const copy = value => value === undefined ? undefined : structuredClone(value);
const tokenFor = number => number.toString(16).padStart(32, '0');
const info = (body = 'selected excerpt', rest = {}) => ({ menuItemId: Worker.MENU_ID, selectionText: body, editable: false,
    pageUrl: 'https://example.test/conversation?private=query#secret', ...rest });
const tab = { id: 3, incognito: false };
function fixture(shared) {
    const state = shared || { storage: {}, time: 1000, sequence: 0, nextTab: 50, events: [], opens: [], writes: [], fault: null };
    const listeners = { install: [], click: [], message: [] }, menus = [], removedMenus = [];
    const chrome = {
        runtime: { id: 'extension-id', getURL: value => `chrome-extension://extension-id/${value}`, lastError: undefined,
            onInstalled: { addListener: fn => listeners.install.push(fn) }, onMessage: { addListener: fn => listeners.message.push(fn) } },
        i18n: { getMessage: key => { assert.equal(key, 'captureMenu'); return 'Save selected text to collections'; } },
        contextMenus: { onClicked: { addListener: fn => listeners.click.push(fn) },
            create(value, done) { menus.push(value); done(); }, remove(value, done) { removedMenus.push(value); done(); } },
        storage: {
            session: {
                async get(keys) {
                    assert.deepEqual(keys, [Worker.KEY]); state.events.push('get');
                    if (state.fault === 'get') throw Error('private backend detail');
                    return copy(state.storage);
                },
                async set(value) {
                    state.events.push('set'); state.writes.push(copy(value));
                    if (state.pauseSet) { const wait = state.pauseSet; state.pauseSet = null; await wait; }
                    if (state.fault === 'set') throw Error('private backend detail');
                    if (state.fault === 'falseSet') return false;
                    if (state.fault === 'corruptSet') { state.storage = {}; return; }
                    state.storage = copy(value);
                    if (state.fault === 'verifyGet') state.fault = 'get';
                }
            }
        },
        tabs: { async create(value) {
            state.events.push('tab'); state.opens.push(copy(value));
            if (state.pauseTab) { const wait = state.pauseTab; state.pauseTab = null; await wait; }
            if (state.fault === 'tab') throw Error('private tab detail');
            if (state.onCreate) state.onCreate();
            return { id: state.nextTab++, incognito: false };
        } }
    };
    for (const key of ['local', 'sync']) Object.defineProperty(chrome.storage, key, { get() { throw Error(`Forbidden ${key} storage read`); } });
    const options = { now: () => state.time, token: () => tokenFor(++state.sequence) };
    const broker = Worker.createBroker(chrome, options);
    const sender = (number = state.sequence, id = 49 + number, rest = {}) => ({ id: chrome.runtime.id, frameId: 0,
        url: chrome.runtime.getURL(`collections.html?capture=${tokenFor(number)}`), tab: { id, incognito: false }, ...rest });
    const message = (type = Worker.CLAIM, number = state.sequence) => ({ type, token: tokenFor(number) });
    return { state, chrome, broker, sender, message, listeners, menus, removedMenus, options };
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const tick = () => new Promise(resolve => setImmediate(resolve));

test('pure capture preserves exact multilingual, multiline, code, emoji and hostile plain text', () => {
    const body = '  中文 👩🏽‍💻\r\n```js\n  <script>alert("x")</script>\n  const x = "😀";\n```\t  ';
    const result = Capture.validateSelection(info(body), tab);
    assert.deepEqual(result, { body, sourceCandidate: 'https://example.test/conversation' });
    assert.equal(result.body, body); assert.deepEqual(Capture.validatePayload(result), result);
    assert.throws(() => Capture.validateSelection(info(body, { pageUrl: undefined }), tab), { code: 'unsupported' });
});

test('pure body validation shares exact collection-store code point and Unicode rules without truncation', () => {
    for (const body of ['x'.repeat(Core.LIMITS.body), '😀'.repeat(Core.LIMITS.body), 'x\t\n\rtext'])
        assert.equal(Capture.validateSelection(info(body), tab).body, body);
    for (const body of ['', ' \t\r\n ', '\u0000secret', '\u0001', '\u000b', '\u000c', '\u001f', '\u007f', '\ud800', '\udc00', 'x\ud800y'])
        assert.throws(() => Capture.validateSelection(info(body), tab), { code: 'invalid' });
    for (const body of ['x'.repeat(Core.LIMITS.body + 1), '😀'.repeat(Core.LIMITS.body + 1), 'x'.repeat(Core.LIMITS.body * 3)])
        assert.throws(() => Capture.validateSelection(info(body), tab), { code: 'oversize' });
    for (const body of [null, undefined, 2, {}, ['text']]) assert.throws(() => Capture.validateSelection(info(body === undefined ? 'x' : body, { selectionText: body }), tab), { code: 'invalid' });
});

test('editable and incognito rejection happens before reading selected text', () => {
    let inspected = false;
    const selected = { menuItemId: Worker.MENU_ID, pageUrl: 'https://example.test/', editable: true, get selectionText() { inspected = true; throw Error('never'); } };
    assert.throws(() => Capture.validateSelection(selected, tab), { code: 'editable' });
    selected.editable = false;
    assert.throws(() => Capture.validateSelection(selected, { ...tab, incognito: true }), { code: 'incognito' });
    assert.equal(inspected, false);
    assert.throws(() => Capture.validateSelection(selected, tab), { code: 'invalid' }); assert.equal(inspected, false);
});

test('frame attribution owns the candidate; unsafe frames never fall back to top page or tab URL', () => {
    assert.equal(Capture.validateSelection(info('body', { frameUrl: 'HTTPS://例え.テスト:8443/frame?q=secret#private' }), tab).sourceCandidate,
        'https://xn--r8jz45g.xn--zckzah:8443/frame');
    for (const frameUrl of ['', null, undefined, 'javascript:alert(1)', 'file:///private', 'about:blank', 'https://user:pass@example.test/frame', 'https://example.test\\path',
        'https://example.test/frame?secret\nvalue', 'https://example.test/frame#\u202eunsafe']) {
        const result = Capture.validateSelection(info('body', { frameUrl }), { ...tab, url: 'https://fallback.test' });
        assert.deepEqual(result, { body: 'body', sourceCandidate: '' });
    }
});

test('URL safety validation precedes removal of query/fragment; source can be safely omitted', () => {
    for (const pageUrl of ['https://name:password@example.test/', 'https://@example.test/', 'https://example.test/?query\u0000secret',
        'https://example.test/?query\u202esecret', 'https://example.test/#fragment\u000bsecret', 'https://example.test/?' + 'x'.repeat(Core.LIMITS.url),
        'https:///example.test', 'https://example.test/has space', 'https://example.test/#\ud800'])
        assert.deepEqual(Capture.validateSelection(info('body', { pageUrl }), tab), { body: 'body', sourceCandidate: '' });
    assert.equal(Capture.validateSelection(info('body', { pageUrl: 'http://localhost:8080/path?x#y' }), tab).sourceCandidate, 'http://localhost:8080/path');
});

test('top-page HTTP(S) eligibility is independent of unsafe optional frame attribution', () => {
    for (const pageUrl of [undefined, null, '', ' https://example.test/', 'file:///private', 'data:text/plain,secret', 'chrome://newtab/', 'chrome-extension://id/collections.html'])
        assert.throws(() => Capture.validateSelection(info('body', { pageUrl, frameUrl: 'https://safe-frame.test/' }), tab), { code: 'unsupported' });
    assert.deepEqual(Capture.validateSelection(info('body', { frameUrl: 'about:blank' }), tab), { body: 'body', sourceCandidate: '' });
});

test('payload accepts only literal body and already-sanitized canonical source fields', () => {
    for (const value of [{ body: 'ok', sourceCandidate: '', title: 'injected' }, { body: 'ok' }, { body: 'ok', sourceCandidate: null },
        { body: 'ok', sourceCandidate: 'https://example.test/?q=secret' }, { body: 'ok', sourceCandidate: 'https://EXAMPLE.test/' },
        { body: 'ok', sourceCandidate: 'https://example.test/#secret' }, { body: 'ok', sourceCandidate: 'https://example.test/?' },
        { body: 'ok', sourceCandidate: 'https://user@example.test/' }, { body: 'ok', sourceCandidate: 'javascript:evil()' }])
        assert.throws(() => Capture.validatePayload(value), { code: 'invalid' });
    let ran = false;
    assert.throws(() => Capture.validatePayload({ get body() { ran = true; return 'not called'; }, sourceCandidate: '' }), { code: 'invalid' });
    assert.equal(ran, false);
    assert.equal(Capture.parseToken(tokenFor(1)), tokenFor(1));
    for (const invalid of [null, '1'.repeat(31), '1'.repeat(33), 'G'.repeat(32), '../secret', 'https://example.test']) assert.equal(Capture.parseToken(invalid), null);
});

test('worker stores bounded session payload before opening and binding one fresh review tab', async () => {
    const f = fixture(), body = '  secret excerpt\r\n<svg/onload=alert(1)> 😀\t';
    assert.deepEqual(await f.broker.handleClick(info(body), tab), { ok: true });
    assert.equal(f.state.opens.length, 1);
    assert.deepEqual(f.state.opens[0], { url: f.chrome.runtime.getURL(`collections.html?capture=${tokenFor(1)}`) });
    assert.deepEqual(f.state.events.slice(0, 7), ['get', 'set', 'get', 'tab', 'set', 'get']);
    const beforeOpen = f.state.writes[0][Worker.KEY].entries[0], final = f.state.storage[Worker.KEY].entries[0];
    assert.equal(beforeOpen.tabId, null); assert.equal(final.tabId, 50); assert.equal(final.status, 'pending');
    assert.deepEqual(final.payload, { body, sourceCandidate: 'https://example.test/conversation' });
    assert.equal(final.expiresAt - final.createdAt, Capture.LIMITS.ttlMs);
    assert.equal(JSON.stringify(f.state.opens).includes('secret'), false);
    assert.equal(JSON.stringify(f.state.storage).includes('private=query'), false);
});

test('claim is same-tab idempotent through worker recreation; hydration ack consumes payload and replay fails', async () => {
    const f = fixture(); await f.broker.handleClick(info(), tab);
    const original = await f.broker.handleMessage(f.message(), f.sender());
    assert.deepEqual(original, { ok: true, payload: { body: 'selected excerpt', sourceCandidate: 'https://example.test/conversation' } });
    original.payload.body = 'mutated returned object';
    const resumed = fixture(f.state);
    assert.equal((await resumed.broker.handleMessage(f.message(), f.sender())).payload.body, 'selected excerpt');
    assert.deepEqual(await resumed.broker.handleMessage(f.message(Worker.ACK), f.sender()), { ok: true });
    assert.deepEqual(await f.broker.handleMessage(f.message(Worker.ACK), f.sender()), { ok: true });
    assert.deepEqual(await f.broker.handleMessage(f.message(), f.sender()), { ok: false, error: 'expired' });
    const stored = f.state.storage[Worker.KEY].entries[0];
    assert.equal(stored.status, 'consumed'); assert.equal(Object.hasOwn(stored, 'payload'), false);
    assert.equal(JSON.stringify(f.state.storage).includes('selected excerpt'), false);
});

test('ack cannot consume an unclaimed payload', async () => {
    const f = fixture(); await f.broker.handleClick(info(), tab);
    assert.deepEqual(await f.broker.handleMessage(f.message(Worker.ACK), f.sender()), { ok: false, error: 'invalid' });
    assert.equal((await f.broker.handleMessage(f.message(), f.sender())).payload.body, 'selected excerpt');
});

test('only exact extension page, token, bound tab and top frame can claim or ack', async () => {
    const f = fixture(); await f.broker.handleClick(info('private body'), tab);
    const otherSenders = [f.sender(1, 500), f.sender(1, 50, { id: 'other-extension' }), f.sender(1, 50, { id: undefined }),
        f.sender(1, 50, { frameId: 1 }), f.sender(1, 50, { frameId: undefined }), f.sender(1, 50, { url: 'https://example.test/' }),
        f.sender(1, 50, { url: f.chrome.runtime.getURL(`options.html?capture=${tokenFor(1)}`) }),
        f.sender(1, 50, { url: f.chrome.runtime.getURL(`collections.html?capture=${tokenFor(1)}&extra=1`) }),
        f.sender(1, 50, { url: f.chrome.runtime.getURL(`collections.html?capture=${tokenFor(1)}#fragment`) }),
        f.sender(1, 50, { url: f.chrome.runtime.getURL(`collections.html?capture=${tokenFor(2)}`) }),
        f.sender(1, 50, { tab: { id: 50, incognito: true } }), f.sender(1, 50, { tab: undefined })];
    for (const sender of otherSenders) for (const type of [Worker.CLAIM, Worker.ACK])
        assert.deepEqual(await f.broker.handleMessage(f.message(type), sender), { ok: false, error: 'invalid' });
    assert.equal(f.state.storage[Worker.KEY].entries[0].status, 'pending');
    assert.equal((await f.broker.handleMessage(f.message(), f.sender())).payload.body, 'private body');
});

test('unknown or malformed messages never read session data', async () => {
    const f = fixture();
    for (const message of [{ type: Worker.CLAIM, token: 'guess' }, { type: Worker.CLAIM, token: tokenFor(1), extra: true },
        { type: 'other', token: tokenFor(1) }, {}, null])
        assert.deepEqual(await f.broker.handleMessage(message, f.sender()), { ok: false, error: 'invalid' });
    assert.deepEqual(f.state.events, []);
});

test('rejected inputs open only fixed error URLs and never retain selected text', async () => {
    const f = fixture(), values = [
        [info('editable secret', { editable: true }), tab, 'editable'],
        [info('incognito secret'), { ...tab, incognito: true }, 'incognito'],
        [info('invalid secret\ud800'), tab, 'invalid'],
        [info('x'.repeat(Core.LIMITS.body + 1)), tab, 'oversize']
    ];
    for (const [event, selectedTab, error] of values) {
        assert.deepEqual(await f.broker.handleClick(event, selectedTab), { ok: false, error });
        assert.equal(f.state.opens.at(-1).url, f.chrome.runtime.getURL(`collections.html?captureError=${error}`));
    }
    assert.deepEqual(f.state.storage, {}); assert.equal(f.state.writes.length, 0);
    assert.equal(JSON.stringify(f.state.opens).includes('secret'), false);
    assert.deepEqual(await f.broker.handleClick(info('ignored', { menuItemId: 'unrelated-menu' }), tab), { ok: false, error: 'invalid' });
    assert.equal(f.state.opens.length, 4);
});

test('missing storage.session fails explicitly without local/sync or memory fallback', async () => {
    const f = fixture(); delete f.chrome.storage.session;
    assert.deepEqual(await f.broker.handleClick(info(), tab), { ok: false, error: 'unsupported' });
    assert.deepEqual(f.state.opens, [{ url: f.chrome.runtime.getURL('collections.html?captureError=unsupported') }]);
    assert.deepEqual(await f.broker.handleMessage(f.message(Worker.CLAIM, 1), f.sender(1)), { ok: false, error: 'unsupported' });
});

test('session read/write/verification failures do not leak exceptions or open a review with missing payload', async () => {
    for (const fault of ['get', 'set', 'falseSet', 'corruptSet', 'verifyGet']) {
        const f = fixture(); f.state.fault = fault;
        assert.deepEqual(await f.broker.handleClick(info('private text'), tab), { ok: false, error: 'unavailable' });
        assert.deepEqual(f.state.opens, [{ url: f.chrome.runtime.getURL('collections.html?captureError=unavailable') }]);
        assert.equal(JSON.stringify(f.state.opens).includes('private'), false);
    }
});

test('tab creation failure is not retried; retained payload is unbound, bounded and expiring', async () => {
    const f = fixture(); f.state.fault = 'tab';
    assert.deepEqual(await f.broker.handleClick(info('private text'), tab), { ok: false, error: 'unavailable' });
    assert.equal(f.state.opens.length, 1); assert.equal(f.state.storage[Worker.KEY].entries[0].tabId, null);
    f.state.fault = null;
    const resumed = fixture(f.state);
    assert.deepEqual(await resumed.broker.handleMessage(f.message(), f.sender()), { ok: false, error: 'invalid' });
    f.state.time += Capture.LIMITS.ttlMs;
    assert.deepEqual(await resumed.broker.handleMessage(f.message(), f.sender()), { ok: false, error: 'expired' });
    assert.deepEqual(f.state.storage[Worker.KEY].entries, []);
});

test('crash before binding or failed binding cannot disclose to an unverified created tab', async () => {
    const f = fixture(); f.state.onCreate = () => { f.state.fault = 'set'; };
    assert.deepEqual(await f.broker.handleClick(info(), tab), { ok: false, error: 'unavailable' });
    assert.equal(f.state.opens.length, 1); assert.equal(f.state.storage[Worker.KEY].entries[0].tabId, null);
    f.state.fault = null;
    assert.deepEqual(await fixture(f.state).broker.handleMessage(f.message(), f.sender()), { ok: false, error: 'invalid' });
});

test('claim waits for delayed tab binding rather than losing the just-opened capture', async () => {
    const f = fixture(), gate = deferred(); f.state.pauseTab = gate.promise;
    const click = f.broker.handleClick(info('early claim'), tab); await tick();
    assert.equal(f.state.storage[Worker.KEY].entries[0].tabId, null);
    let settled = false;
    const claim = f.broker.handleMessage(f.message(), f.sender()).then(value => { settled = true; return value; });
    await tick(); assert.equal(settled, false); gate.resolve();
    assert.deepEqual(await click, { ok: true }); assert.equal((await claim).payload.body, 'early claim');
});

test('simultaneous captures are isolated and claims plus acks serialize in receipt order', async () => {
    const f = fixture();
    assert.deepEqual(await Promise.all([f.broker.handleClick(info('first'), tab), f.broker.handleClick(info('second'), tab)]), [{ ok: true }, { ok: true }]);
    const [first, second] = await Promise.all([f.broker.handleMessage(f.message(Worker.CLAIM, 1), f.sender(1)), f.broker.handleMessage(f.message(Worker.CLAIM, 2), f.sender(2))]);
    assert.equal(first.payload.body, 'first'); assert.equal(second.payload.body, 'second');
    assert.deepEqual(await f.broker.handleMessage(f.message(Worker.CLAIM, 1), f.sender(1, 51)), { ok: false, error: 'invalid' });
    const outcomes = await Promise.all([f.broker.handleMessage(f.message(Worker.ACK, 1), f.sender(1)),
        f.broker.handleMessage(f.message(Worker.CLAIM, 1), f.sender(1)), f.broker.handleMessage(f.message(Worker.CLAIM, 2), f.sender(2))]);
    assert.deepEqual(outcomes[0], { ok: true }); assert.deepEqual(outcomes[1], { ok: false, error: 'expired' }); assert.equal(outcomes[2].payload.body, 'second');
});

test('an event burst while session write is stalled retains at most the bounded pending captures', async () => {
    const f = fixture(), gate = deferred(); f.state.pauseSet = gate.promise;
    const operations = Array.from({ length: 30 }, (_, n) => f.broker.handleClick(info(`burst ${n}`), tab));
    await tick(); gate.resolve();
    const results = await Promise.all(operations);
    assert.equal(results.filter(result => result.ok).length, Capture.LIMITS.pending);
    assert.ok(results.slice(Capture.LIMITS.pending).every(result => result.error === 'full'));
    assert.equal(f.state.storage[Worker.KEY].entries.length, Capture.LIMITS.pending);
    assert.equal(JSON.stringify(f.state.storage).includes('burst 29'), false);
});

test('capacity rejects the ninth pending selection without evicting any unexpired capture', async () => {
    const f = fixture();
    for (let n = 0; n < Capture.LIMITS.pending; n++) assert.deepEqual(await f.broker.handleClick(info(`excerpt ${n}`), tab), { ok: true });
    const before = copy(f.state.storage);
    assert.deepEqual(await f.broker.handleClick(info('rejected ninth'), tab), { ok: false, error: 'full' });
    assert.deepEqual(f.state.storage, before);
    assert.equal(f.state.opens.at(-1).url, f.chrome.runtime.getURL('collections.html?captureError=full'));
    assert.equal((await f.broker.handleMessage(f.message(Worker.CLAIM, 1), f.sender(1))).payload.body, 'excerpt 0');
});

test('aggregate UTF-8 session byte budget rejects without truncation or unexpired eviction', async () => {
    const f = fixture(), body = '😀'.repeat(Core.LIMITS.body); let accepted = 0;
    while (accepted < Capture.LIMITS.pending) {
        const before = copy(f.state.storage), result = await f.broker.handleClick(info(body), tab);
        if (!result.ok) { assert.equal(result.error, 'full'); assert.deepEqual(f.state.storage, before); break; }
        accepted++;
    }
    assert.equal(accepted, 4);
    assert.ok(Buffer.byteLength(JSON.stringify(f.state.storage[Worker.KEY]), 'utf8') <= Capture.LIMITS.bytes);
    for (const entry of f.state.storage[Worker.KEY].entries) assert.equal(entry.payload.body, body);
});

test('expiry at the exact deadline denies payload and prunes expired session data before next capture', async () => {
    const f = fixture(); await f.broker.handleClick(info('expires'), tab);
    f.state.time += Capture.LIMITS.ttlMs - 1;
    assert.equal((await f.broker.handleMessage(f.message(), f.sender())).payload.body, 'expires');
    f.state.time++;
    assert.deepEqual(await f.broker.handleMessage(f.message(), f.sender()), { ok: false, error: 'expired' });
    assert.deepEqual(f.state.storage[Worker.KEY].entries, []);
    assert.deepEqual(await f.broker.handleClick(info('new body'), tab), { ok: true });
    assert.equal(f.state.storage[Worker.KEY].entries.length, 1);
});

test('clock regression fails closed instead of extending an existing payload lease', async () => {
    const f = fixture(); await f.broker.handleClick(info(), tab); f.state.time--;
    assert.deepEqual(await f.broker.handleMessage(f.message(), f.sender()), { ok: false, error: 'expired' });
    assert.deepEqual(f.state.storage[Worker.KEY].entries, []);
});

test('consumed receipts are payload-free and bounded independently from pending capacity', async () => {
    const f = fixture();
    for (let n = 1; n <= Capture.LIMITS.tombstones + 3; n++) {
        assert.deepEqual(await f.broker.handleClick(info(`private ${n}`), tab), { ok: true });
        assert.equal((await f.broker.handleMessage(f.message(), f.sender())).ok, true);
        assert.deepEqual(await f.broker.handleMessage(f.message(Worker.ACK), f.sender()), { ok: true });
    }
    const entries = f.state.storage[Worker.KEY].entries;
    assert.equal(entries.length, Capture.LIMITS.tombstones);
    assert.ok(entries.every(entry => entry.status === 'consumed' && !Object.hasOwn(entry, 'payload')));
    assert.equal(JSON.stringify(entries).includes('private'), false);
    assert.deepEqual(await f.broker.handleClick(info('still available'), tab), { ok: true });
});

test('failed claim or ack writes keep payload recoverable without claiming success', async () => {
    const f = fixture(); await f.broker.handleClick(info(), tab); f.state.fault = 'set';
    assert.deepEqual(await f.broker.handleMessage(f.message(), f.sender()), { ok: false, error: 'unavailable' });
    assert.equal(f.state.storage[Worker.KEY].entries[0].status, 'pending');
    f.state.fault = null; assert.equal((await f.broker.handleMessage(f.message(), f.sender())).ok, true);
    f.state.fault = 'set';
    assert.deepEqual(await f.broker.handleMessage(f.message(Worker.ACK), f.sender()), { ok: false, error: 'unavailable' });
    assert.equal(f.state.storage[Worker.KEY].entries[0].status, 'claimed');
    f.state.fault = null;
    assert.equal((await fixture(f.state).broker.handleMessage(f.message(), f.sender())).ok, true);
});

test('corrupted stored payload and mismatched schema fail closed', async () => {
    for (const change of [state => { state.version = 2; }, state => { state.entries[0].payload.sourceCandidate += '?leak'; },
        state => { state.entries[0].payload.body = '\ud800'; }, state => { state.entries[0].payload.extra = true; },
        state => { state.entries[0].expiresAt += 100; }, state => { state.entries.push(copy(state.entries[0])); }]) {
        const f = fixture(); await f.broker.handleClick(info(), tab); change(f.state.storage[Worker.KEY]);
        const result = await f.broker.handleMessage(f.message(), f.sender());
        assert.equal(result.ok, false); assert.equal(Object.hasOwn(result, 'payload'), false);
    }
});

test('listeners register synchronously and menu registration has only fixed selection HTTP(S) scope', async () => {
    const f = fixture(); Worker.register(f.chrome);
    assert.deepEqual(Object.fromEntries(Object.entries(f.listeners).map(([name, values]) => [name, values.length])), { install: 1, click: 1, message: 1 });
    assert.equal(f.menus.length, 0); f.listeners.install[0]();
    assert.deepEqual(f.removedMenus, [Worker.MENU_ID]);
    assert.deepEqual(f.menus, [{ id: Worker.MENU_ID, title: 'Save selected text to collections', contexts: ['selection'], documentUrlPatterns: ['http://*/*', 'https://*/*'] }]);
    assert.equal(f.menus[0].title.includes('%s'), false);
    assert.equal(f.listeners.message[0]({ type: 'unrelated' }, {}, () => { throw Error('not called'); }), false);
    let resolve; const response = new Promise(done => { resolve = done; });
    assert.equal(f.listeners.message[0]({ type: Worker.CLAIM, token: 'invalid' }, {}, resolve), true);
    assert.deepEqual(await response, { ok: false, error: 'invalid' });
});

test('service worker imports only packaged pure helpers and registers before asynchronous work', () => {
    const f = fixture(), imports = [], context = vm.createContext({ chrome: f.chrome, TextEncoder, URL, Uint8Array,
        LocalItabCollectionCapture: Capture, importScripts: (...paths) => imports.push(...paths) });
    vm.runInContext(fs.readFileSync('collection-capture-background.js', 'utf8'), context);
    assert.deepEqual(imports, ['shared/local-ai-collections-store.js', 'shared/collection-capture.js']);
    assert.equal(f.listeners.install.length, 1); assert.equal(f.listeners.click.length, 1); assert.equal(f.listeners.message.length, 1);
    assert.equal(f.state.events.length, 0);
});
