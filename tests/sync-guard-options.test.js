'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Storage = require('../storage');
const { createDocument } = require('./helpers/task-dom-model');
const source = fs.readFileSync('options.js', 'utf8');
function storedURLError() {
    const storage = new Storage();
    const config = storage.cloneDefaultConfig();
    config.links = [{title: 'Synthetic', url: 'https://example.com', icon: 'S', category: 'work'}];
    try { storage.assertSyncURLCompatibility(config); } catch (error) { return error; }
    assert.fail('The real stored URL guard must reject the synthetic record');
}
function harness(locale, error = storedURLError(), statusOverrides = {}) {
    const document = createDocument({aggregateTextContent: true});
    for (const [tag, id] of [['input', 'cloud-sync-enabled'], ['button', 'sync-upload-now'], ['button', 'sync-download-now'], ['button', 'sync-replace-local'], ['div', 'cloud-sync-status'], ['div', 'toast-container']]) {
        const element = document.createElement(tag); element.id = id; document.body.append(element);
    }
    const catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const translate = (key, values = []) => values.reduce((message, value, index) => message.replaceAll(`$${index + 1}`, value), catalog[key]?.message || key);
    const raw = {available: true, enabled: false, local: {lastError: error.message}, compatibilityBlocked: {kind: 'stored-url', reason: error.message}, ...statusOverrides};
    const before = JSON.stringify(raw), errorBefore = {message: error.message, code: error.code, kind: error.kind};
    const calls = [], state = {previewFails: false, reloads: 0};
    const reject = async (method, ...args) => { calls.push({method, args}); throw error; };
    const window = {addEventListener() {}, i18n: {t: translate}, LocalItabContentLifecycle: {reload() { state.reloads++; }}};
    const context = {window, document, i18n: window.i18n, console: {log() {}, warn() {}, error() {}}, setTimeout() {}, clearTimeout() {}, confirm: () => true,
        storageManager: {
            validateSyncConfig: value => new Storage().validateSyncConfig(value),
            async getSyncStatus() { return raw; },
            setSyncEnabled: (...args) => reject('enable', ...args),
            pushToSync: (...args) => reject('upload', ...args),
            pullFromSync: (...args) => reject('download', ...args),
            async previewCloudReplacement() { calls.push({method: 'preview'}); if (state.previewFails) throw error; return {shortcuts: 1, revision: 'synthetic'}; }
        }};
    vm.createContext(context); vm.runInContext(source, context); context.setupEventListeners();
    const get = id => document.getElementById(id);
    return {context, get, raw, error, calls, state, translate,
        async act(action) {
            const id = {enable: 'cloud-sync-enabled', upload: 'sync-upload-now', download: 'sync-download-now', replace: 'sync-replace-local'}[action];
            if (action === 'enable') get(id).checked = true;
            await get(id).listeners.get(action === 'enable' ? 'change' : 'click')[0]();
        },
        assertUnchanged() { assert.equal(JSON.stringify(raw), before); assert.deepEqual({message: error.message, code: error.code, kind: error.kind}, errorBefore); }
    };
}
for (const locale of ['zh_CN', 'en']) {
    for (const action of ['enable', 'upload', 'download', 'replace', 'preview']) {
        test(`${locale}: actual options ${action} failure localizes the typed stored URL guard without changing data`, async () => {
            const h = harness(locale); h.state.previewFails = action === 'preview';
            await h.act(action === 'preview' ? 'replace' : action);
            const errors = h.get('toast-container').children.filter(element => element.classList.contains('message-error'));
            assert.equal(errors.length, 1);
            const key = action === 'enable' ? 'syncFailed' : action === 'upload' ? 'syncUploadFailed' : 'syncDownloadFailed';
            assert.equal(errors[0].textContent, h.translate(key, [h.translate('syncStoredURLPaused')]));
            assert.equal(errors[0].getAttribute('role'), 'alert');
            const notes = h.get('cloud-sync-status').children.filter(element => element.classList.contains('is-error'));
            assert.equal(notes.length, 1); assert.equal(notes[0].textContent, h.translate('syncStoredURLPaused'));
            assert(!h.get('cloud-sync-status').textContent.includes(h.error.message));
            assert.equal(h.state.reloads, 0); assert.equal(h.get('cloud-sync-enabled').checked, false);
            if (action === 'enable') assert.deepEqual(h.calls[0], {method: 'enable', args: [true]});
            if (action === 'replace') {
                assert.equal(h.calls[1].method, 'download');
                assert.equal(h.calls[1].args[0].confirmedReplacement, true);
                assert.equal(h.calls[1].args[0].expectedRemote.revision, 'synthetic');
            }
            h.assertUnchanged();
        });
    }
    test(`${locale}: status preserves distinct real errors and only deduplicates an exact active stored URL reason`, async () => {
        for (const overrides of [
            {local: {lastError: 'QUOTA_BYTES exceeded'}},
            {local: {lastError: storedURLError().message.slice(0, 239)}},
            {local: {lastError: 'X' + storedURLError().message.slice(1, 240)}},
            {compatibilityBlocked: {kind: 'stored-url', reason: 'Another older stored URL reason'}},
            {local: {lastError: storedURLError().message.slice(0, 240) + ' Other failure'}},
            {local: {lastError: storedURLError().message + ' Extra diagnostic.'}},
            {compatibilityBlocked: null},
            {compatibilityBlocked: {kind: 'review', reason: storedURLError().message}},
            {compatibilityBlocked: {kind: 'stored-url'}}
        ]) {
            const h = harness(locale, storedURLError(), overrides);
            await h.context.renderSyncStatus();
            assert(h.get('cloud-sync-status').children.some(element => element.textContent === h.raw.local.lastError));
            h.assertUnchanged();
        }
    });
    for (const action of ['enable', 'upload', 'download', 'replace']) {
        test(`${locale}: ${action} leaves untyped and unrelated errors intact`, async () => {
            for (const error of [new Error('QUOTA_BYTES exceeded'), Object.assign(new Error('Other compatibility detail'), {code: 'SYNC_IDENTITY_COMPATIBILITY', kind: 'review'}), Object.assign(new Error('Different error code'), {code: 'OTHER', kind: 'stored-url'}), new Error(storedURLError().message)]) {
                const h = harness(locale, error, {compatibilityBlocked: null}); await h.act(action);
                const toast = h.get('toast-container').children.at(-1);
                const key = action === 'enable' ? 'syncFailed' : action === 'upload' ? 'syncUploadFailed' : 'syncDownloadFailed';
                assert.equal(toast.textContent, h.translate(key, [error.message]));
                assert(h.get('cloud-sync-status').children.some(element => element.textContent === error.message));
                h.assertUnchanged();
            }
        });
    }
}

// Exercise the real setSyncEnabled -> pushToSync -> blockSync ->
// updateLocalSyncState -> validateSyncConfig -> getSyncStatus pipeline.
for (const locale of ['zh_CN', 'en']) test(`${locale}: real persisted enable failure renders one localized guard after 240-character truncation`, async () => {
    const Workspaces = require('../shared/workspaces');
    const {webcrypto} = require('node:crypto');
    const cryptoBefore = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', {value: webcrypto, configurable: true});
    const raw = new Storage().cloneDefaultConfig();
    raw.sync.enabled = false;
    raw.links = [{title: 'Synthetic', url: 'https://example.com', icon: 'S', category: 'work'}];
    raw.layout.positions = {'all|https://example.com': {x: 12, y: 24}};
    const clone = value => structuredClone(value), cloudWrites = [], queues = new Map();
    const local = {
        async get(keys) { return keys == null ? clone(raw) : Object.fromEntries((typeof keys === 'string' ? [keys] : keys).filter(key => Object.hasOwn(raw, key)).map(key => [key, clone(raw[key])])); },
        async set(values) { Object.assign(raw, clone(values)); },
        async getBytesInUse() { return 0; }, async remove() { assert.fail('No deletion expected'); }
    };
    const chrome = {storage: {local, sync: {async get() { return {}; }, async getBytesInUse() { return 0; }, async set(values) { cloudWrites.push(values); }, async remove(keys) { cloudWrites.push(keys); }}, onChanged: {addListener() {}, removeListener() {}}}};
    const locks = {request(name, options, fn) { const action = fn || options, prior = queues.get(name) || Promise.resolve(); const next = prior.catch(() => {}).then(action); queues.set(name, next); return next; }};
    const manager = Workspaces.createManager({chrome, locks});
    const session = manager.capture(); await session.ready();
    const storage = new Storage({workspace: session});
    try {
        const before = await session.local.get(null);
        const h = harness(locale); h.context.storageManager = storage;
        await h.act('enable');
        const status = await storage.getSyncStatus();
        assert.equal(status.compatibilityBlocked.kind, 'stored-url');
        assert(status.compatibilityBlocked.reason.length > 240);
        assert.equal(status.local.lastError.length, 240);
        assert.equal(status.local.lastError, storage.validateSyncConfig({lastError: status.compatibilityBlocked.reason}).lastError);
        assert.equal(h.get('toast-container').children.at(-1).textContent, h.translate('syncFailed', [h.translate('syncStoredURLPaused')]));
        const notes = h.get('cloud-sync-status').children.filter(element => element.classList.contains('is-error'));
        assert.equal(notes.length, 1); assert.equal(notes[0].textContent, h.translate('syncStoredURLPaused'));
        const persisted = await session.local.get(null);
        assert.deepEqual(persisted.links, before.links); assert.deepEqual(persisted.layout, before.layout);
        assert.equal(persisted.sync.enabled, false); assert.equal(persisted.sync.lastError, status.local.lastError);
        assert.deepEqual(cloudWrites, []);
        // A different persisted error remains visible even while the same guard is active.
        await storage.updateLocalSyncState({lastError: 'QUOTA_BYTES exceeded'});
        await h.context.renderSyncStatus();
        assert(h.get('cloud-sync-status').children.some(element => element.textContent === 'QUOTA_BYTES exceeded'));
    } finally {
        storage.cancelSyncPush(); manager.destroy?.();
        if (cryptoBefore) Object.defineProperty(globalThis, 'crypto', cryptoBefore); else delete globalThis.crypto;
    }
});
