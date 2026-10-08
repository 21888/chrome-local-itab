const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/dashboard-harness');
const clone = value => JSON.parse(JSON.stringify(value));
const watchdog = setTimeout(() => { console.error('Identity model did not settle.'); process.exit(1); }, 10000);
(async () => {
    const document = createDocument();
    const ids = ['cloud-sync-status', 'cloud-sync-enabled', 'sync-upload-now', 'sync-download-now', 'sync-clear-cloud', 'sync-replace-local', 'layout-recovery-controls', 'recovery-original', 'recovery-latest'];
    for (const id of ids) { const el = document.createElement(id.includes('status') || id.includes('controls') ? 'div' : 'button'); el.id = id; document.body.appendChild(el); }
    let allowed = false, reloads = 0, calls = [], downloads = 0, pulls = 0;
    const events = [], messages = [];
    let preview = { fingerprint: 'hash', revision: 'r1', schema: 1, shortcuts: 2 };
    const status = { available: true, enabled: true, local: { lastSync: '2026-10-08T00:00:00Z' }, remote: {}, compatibilityBlocked: { reason: '<img src=x>' }, storage: { available: true, bytesInUse: 12, quota: 100 } };
    const storageManager = {
        syncMetaKey: 'meta', syncChunkPrefix: 'chunk_', syncIdentityStateKey: 'guard',
        getSyncStatus: async () => status, getRecoveryAvailability: async () => ({ latest: true, original: true }),
        previewCloudReplacement: async () => preview,
        pullFromSync: async value => { if (value) calls.push(clone(value)); else pulls++; return { applied: Boolean(value), status }; },
        getRecoveryBackup: async () => ({ version: '1.0', schemaVersion: 2, data: { links: [] } }),
        shouldIgnoreRemoteSyncChange: async changes => changes.meta?.newValue?.own === true
    };
    const context = { document, storageManager, window: { storageManager, location: { reload() { reloads++; } } },
        chrome: { storage: { onChanged: { addListener(fn) { events.push(fn); } } } },
        URL: { createObjectURL(blob) { assert(blob.size > 0); downloads++; return 'blob:test'; }, revokeObjectURL() {} }, Blob,
        confirm(text) { assert(text.includes('2')); return allowed; }, console: { warn() {}, error() {} }, setTimeout() {}, clearTimeout() {} };
    const create = document.createElement;
    document.createElement = tag => { const el = create(tag); el.click = () => {}; return el; };
    vm.createContext(context); vm.runInContext(fs.readFileSync('options.js', 'utf8'), context);
    context.showMessage = (message, type) => messages.push({ message, type });
    await context.renderSyncStatus();
    assert.equal(document.getElementById('cloud-sync-enabled').checked, true);
    assert.equal(document.getElementById('sync-replace-local').hidden, false);
    const note = document.getElementById('cloud-sync-status').children.find(el => el.textContent?.includes('<img'));
    assert(note); assert.equal(note.children.length, 0, 'untrusted reason is plain text');
    assert.equal(document.getElementById('layout-recovery-controls').hidden, false);
    await context.replaceLocalFromCloud(); assert.equal(calls.length, 0); assert.equal(reloads, 0, 'Cancel preserves local data');
    allowed = true; await context.replaceLocalFromCloud();
    assert.equal(calls.length, 1); assert.deepEqual(calls[0], { confirmedReplacement: true, expectedRemote: preview }); assert.equal(reloads, 1);
    const pending = deferred(); storageManager.previewCloudReplacement = () => pending.promise;
    const first = context.replaceLocalFromCloud(); await context.replaceLocalFromCloud(); assert.equal(document.getElementById('sync-replace-local').disabled, true);
    pending.resolve(preview); await first; assert.equal(calls.length, 2, 'repeat activation owns only one replacement');
    storageManager.pullFromSync = async value => { if (!value) { pulls++; return { applied: false, status }; } throw new Error('Recovery write failed'); };
    await context.replaceLocalFromCloud(); assert.equal(reloads, 2, 'failure never reloads as success'); assert(messages.some(m => m.type === 'error' && m.message.includes('Recovery write failed')));
    await context.downloadRecoveryBackup('latest'); assert.equal(downloads, 1); assert(messages.some(m => m.type === 'success'));
    storageManager.getRecoveryBackup = async () => { throw new Error('Integrity check failed'); };
    await context.downloadRecoveryBackup('original'); assert.equal(downloads, 1, 'corrupt recovery is not exported');
    context.setupCloudSyncChangeListener(); assert.equal(events.length, 1);
    await events[0]({ meta: { newValue: { own: true } } }, 'sync'); assert.equal(pulls, 0);
    await events[0]({ meta: { newValue: { own: false } } }, 'sync'); assert.equal(pulls, 1, 'async false must not suppress remote changes');
    await events[0]({ chunk_0: { newValue: 'complete' } }, 'sync'); assert.equal(pulls, 2, 'completed chunk-only notification can retry');
    status.compatibilityBlocked = null; await context.renderSyncStatus(); assert.equal(document.getElementById('sync-replace-local').hidden, true);
    for (const locale of ['en', 'zh_CN']) {
        const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        for (const key of ['syncCompatibilityNotice', 'syncCompatibilityDetails', 'syncReplaceLocal', 'syncReplaceLocalConfirm', 'layoutRecoveryOriginal', 'layoutRecoveryLatest', 'identityExported']) assert(messages[key]?.message);
    }
    const html = fs.readFileSync('options.html', 'utf8');
    assert(html.indexOf('shared/layout-identity.js') < html.indexOf('storage.js'));
    assert(fs.readFileSync('appearance.css', 'utf8').includes('#sync-replace-local[hidden]'));
    console.log('identity recovery UI tests ok (actual options functions, confirmation, async listener and download models)');
})().then(() => clearTimeout(watchdog), error => { clearTimeout(watchdog); console.error(error); process.exitCode = 1; });
