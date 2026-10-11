/* Selection broker: temporary session data only; never writes collection content. */
(function (root, factory) {
    const commonJS = typeof module === 'object' && module.exports;
    if (!commonJS) root.importScripts('shared/local-ai-collections-store.js', 'shared/collection-capture.js');
    const api = factory(commonJS ? require('./shared/collection-capture.js') : root.LocalItabCollectionCapture);
    if (commonJS) module.exports = api;
    else api.register(root.chrome);
})(globalThis, function (Capture) {
    'use strict';
    const KEY = '__localItabCollectionCaptureSessionV1';
    const MENU_ID = 'local-itab-save-selection';
    const CLAIM = 'collection-capture-claim', ACK = 'collection-capture-ack';
    const { LIMITS } = Capture;
    const failure = error => ({ ok: false, error });
    const byteSize = value => new TextEncoder().encode(JSON.stringify(value)).length;
    function check(ok, code = 'unavailable') { if (!ok) throw Capture.fault(code); }
    function data(value, keys) {
        check(value && typeof value === 'object' && !Array.isArray(value));
        const prototype = Object.getPrototypeOf(value);
        check(prototype === null || prototype === Object.prototype);
        const descriptors = Object.getOwnPropertyDescriptors(value), names = Reflect.ownKeys(descriptors);
        check(names.length === keys.length && keys.every(key => Object.hasOwn(descriptors, key)));
        for (const key of names) check(typeof key === 'string' && descriptors[key].enumerable && Object.hasOwn(descriptors[key], 'value'));
        return Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
    }
    function readState(raw) {
        if (raw === undefined) return { version: 1, entries: [] };
        const state = data(raw, ['version', 'entries']);
        check(state.version === 1 && Array.isArray(state.entries) && state.entries.length <= LIMITS.pending + LIMITS.tombstones);
        const arrayKeys = Reflect.ownKeys(state.entries);
        check(arrayKeys.length === state.entries.length + 1 && arrayKeys.every(key => key === 'length' ||
            (typeof key === 'string' && /^(0|[1-9][0-9]*)$/.test(key) && Number(key) < state.entries.length &&
                Object.hasOwn(Object.getOwnPropertyDescriptor(state.entries, key), 'value'))));
        const seen = new Set(); let pending = 0, consumed = 0;
        const entries = state.entries.map(item => {
            const status = Object.getOwnPropertyDescriptor(item || {}, 'status')?.value;
            const entry = data(item, ['token', 'createdAt', 'expiresAt', 'tabId', 'status', ...(status === 'consumed' ? [] : ['payload'])]);
            check(Capture.parseToken(entry.token) && !seen.has(entry.token)); seen.add(entry.token);
            check(Number.isSafeInteger(entry.createdAt) && entry.createdAt >= 0 && Number.isSafeInteger(entry.expiresAt) && entry.expiresAt === entry.createdAt + LIMITS.ttlMs);
            check(entry.tabId === null || (Number.isSafeInteger(entry.tabId) && entry.tabId >= 0));
            check(['pending', 'claimed', 'consumed'].includes(entry.status));
            if (entry.status === 'consumed') { consumed++; check(entry.tabId !== null); }
            else { pending++; entry.payload = Capture.validatePayload(entry.payload); }
            if (entry.status === 'claimed') check(entry.tabId !== null);
            return entry;
        });
        const result = { version: 1, entries };
        check(pending <= LIMITS.pending && consumed <= LIMITS.tombstones && byteSize(result) <= LIMITS.bytes);
        return result;
    }
    function randomToken() {
        check(globalThis.crypto?.getRandomValues);
        return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
    }
    function createBroker(chromeApi, options = {}) {
        const now = options.now || Date.now, token = options.token || randomToken;
        let queue = Promise.resolve(), queuedCount = 0, queuedBytes = 0;
        const serial = action => {
            const next = queue.then(action).catch(error => failure(Capture.errorCode(error)));
            queue = next.then(() => undefined); return next;
        };
        function clock() { const value = now(); check(Number.isSafeInteger(value) && value >= 0); return value; }
        function session() {
            const area = chromeApi?.storage?.session;
            check(area && typeof area.get === 'function' && typeof area.set === 'function', 'unsupported'); return area;
        }
        function reviewURL(value) {
            check(typeof chromeApi?.runtime?.getURL === 'function');
            return chromeApi.runtime.getURL(`collections.html?capture=${value}`);
        }
        async function read() {
            const result = await session().get([KEY]);
            check(result && typeof result === 'object');
            const descriptor = Object.getOwnPropertyDescriptor(result, KEY);
            check(!descriptor || Object.hasOwn(descriptor, 'value'));
            return readState(descriptor?.value);
        }
        async function write(state) {
            check(byteSize(state) <= LIMITS.bytes, 'full');
            check(await session().set({ [KEY]: state }) !== false);
            // A tab is never opened or a claim returned before read-back verifies
            // that its corresponding session state is durable across worker restarts.
            check(JSON.stringify(await read()) === JSON.stringify(state));
        }
        async function liveState() {
            const state = await read(), time = clock();
            const entries = state.entries.filter(entry => entry.expiresAt > time && entry.createdAt <= time);
            if (entries.length !== state.entries.length) { state.entries = entries; await write(state); }
            return state;
        }
        async function errorTab(code) {
            // This URL carries a fixed local code only, never rejected text or source.
            try { await chromeApi.tabs.create({ url: chromeApi.runtime.getURL(`collections.html?captureError=${code}`) }); } catch (_) { /* No retry after an ambiguous tab creation. */ }
            return failure(code);
        }
        async function capture(payload) {
            let opened = false;
            try {
                const state = await liveState();
                check(state.entries.filter(entry => entry.status !== 'consumed').length < LIMITS.pending, 'full');
                const id = token(); check(Capture.parseToken(id) && !state.entries.some(entry => entry.token === id));
                const createdAt = clock(), entry = { token: id, createdAt, expiresAt: createdAt + LIMITS.ttlMs, tabId: null, status: 'pending', payload };
                state.entries.push(entry); check(byteSize(state) <= LIMITS.bytes, 'full'); await write(state);
                // Set before calling: a failed/uncertain create must not open a
                // second tab. An unbound payload is inaccessible and expires.
                opened = true;
                const tab = await chromeApi.tabs.create({ url: reviewURL(id) });
                check(Number.isSafeInteger(tab?.id) && tab.id >= 0 && tab.incognito !== true);
                entry.tabId = tab.id; await write(state);
                return { ok: true };
            } catch (error) {
                const code = Capture.errorCode(error);
                return opened ? failure(code) : errorTab(code);
            }
        }
        function handleClick(info, tab) {
            let payload;
            try {
                if (Object.getOwnPropertyDescriptor(info || {}, 'menuItemId')?.value !== MENU_ID) return Promise.resolve(failure('invalid'));
                payload = Capture.validateSelection(info, tab);
            } catch (error) { const code = Capture.errorCode(error); return serial(() => errorTab(code)); }
            // Bound accepted in-flight bodies synchronously as well as persistent
            // state: a stalled API call cannot accumulate an unbounded event queue.
            const bytes = byteSize(payload);
            if (queuedCount >= LIMITS.pending || queuedBytes + bytes > LIMITS.bytes) {
                payload = null; return serial(() => errorTab('full'));
            }
            queuedCount++; queuedBytes += bytes;
            // Only the accepted, bounded payload enters the queue, not raw info/tab.
            return serial(() => capture(payload)).finally(() => { queuedCount--; queuedBytes -= bytes; });
        }
        function verifiedRequest(message, sender) {
            const request = data(message, ['type', 'token']);
            check([CLAIM, ACK].includes(request.type) && Capture.parseToken(request.token), 'invalid');
            check(sender?.id === chromeApi?.runtime?.id && typeof sender.id === 'string' && sender.frameId === 0 &&
                Number.isSafeInteger(sender.tab?.id) && sender.tab.id >= 0 && sender.tab.incognito !== true &&
                sender.url === reviewURL(request.token), 'invalid');
            return { type: request.type, token: request.token, tabId: sender.tab.id };
        }
        function handleMessage(message, sender) {
            let request;
            try { request = verifiedRequest(message, sender); }
            catch (_) { return Promise.resolve(failure('invalid')); }
            return serial(async () => {
                const state = await liveState(), entry = state.entries.find(item => item.token === request.token);
                check(entry, 'expired'); check(entry.tabId !== null && entry.tabId === request.tabId, 'invalid');
                if (request.type === CLAIM) {
                    check(entry.status !== 'consumed', 'expired');
                    if (entry.status !== 'claimed') { entry.status = 'claimed'; await write(state); }
                    return { ok: true, payload: Capture.validatePayload(entry.payload) };
                }
                check(entry.status === 'claimed' || entry.status === 'consumed', 'invalid');
                if (entry.status === 'claimed') {
                    entry.status = 'consumed'; delete entry.payload;
                    // Payload-free receipts are bounded separately; never evict
                    // an unexpired selection to make room for another selection.
                    const receipts = state.entries.filter(item => item.status === 'consumed');
                    const remove = new Set(receipts.slice(0, Math.max(0, receipts.length - LIMITS.tombstones)).map(item => item.token));
                    state.entries = state.entries.filter(item => !remove.has(item.token)); await write(state);
                }
                return { ok: true };
            });
        }
        return { handleClick, handleMessage };
    }
    function register(chromeApi) {
        const broker = createBroker(chromeApi);
        // Register all event listeners synchronously on every worker evaluation.
        chromeApi.runtime.onInstalled.addListener(() => {
            const create = () => {
                chromeApi.contextMenus.create({ id: MENU_ID, title: chromeApi.i18n.getMessage('captureMenu'),
                    contexts: ['selection'], documentUrlPatterns: ['http://*/*', 'https://*/*'] }, () => { void chromeApi.runtime.lastError; });
            };
            chromeApi.contextMenus.remove(MENU_ID, () => { void chromeApi.runtime.lastError; create(); });
        });
        chromeApi.contextMenus.onClicked.addListener((info, tab) => { void broker.handleClick(info, tab); });
        chromeApi.runtime.onMessage.addListener((message, sender, respond) => {
            const type = Object.getOwnPropertyDescriptor(message || {}, 'type')?.value;
            if (![CLAIM, ACK].includes(type)) return false;
            void broker.handleMessage(message, sender).then(respond); return true;
        });
        return broker;
    }
    return { KEY, MENU_ID, CLAIM, ACK, LIMITS, createBroker, register };
});
