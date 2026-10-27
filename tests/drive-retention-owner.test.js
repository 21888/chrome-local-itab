'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Storage = require('../storage');
const Drive = require('../drive-backup');

async function fixture(t, { resumable = false, outcome = 'normal' } = {}) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
    const clone = value => structuredClone(value), raw = {}, calls = { deleted: [], uploads: [], lists: 0, auth: 0 };
    global.chrome = {
        runtime: { getManifest: () => ({ oauth2: { client_id: 'synthetic-not-an-account' } }) },
        identity: { getAuthToken: async () => { calls.auth++; throw Error('Real authorization forbidden'); } },
        storage: { local: {
            get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : Object.keys(raw)).filter(key => key in raw).map(key => [key, clone(raw[key])])),
            set: async values => Object.assign(raw, clone(values))
        } }
    };
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'chrome', descriptor); else delete global.chrome; });
    const storage = new Storage();
    // Isolate unrelated Sync initialization and scheduling; retain the actual
    // configuration backup reader/validator and all Drive state/retention methods.
    storage.ensureSyncInitialized = async () => {};
    storage.withLocalWriteLock = operation => operation();
    Object.assign(raw, storage.cloneDefaultConfig());
    const first = new Drive(storage), second = new Drive(storage);
    raw[first.stateKey] = first.normalizeState({ deviceId: 'device_a', activeDeviceId: 'device_a', deviceName: 'A',
        knownDevices: [{ id: 'device_a', name: 'A' }, { id: 'device_b', name: 'B' }] });
    if (resumable) first.warningSizeBytes = 0;
    const files = [];
    for (const group of ['a', 'b']) for (let index = 1; index <= 21; index++) files.push({
        id: `${group}_${index}`, name: `snapshot_${group}_${index}.json`, createdTime: `2026-01-${String(index).padStart(2, '0')}T00:00:00.000Z`,
        appProperties: { app: 'local-itab', type: 'backupSnapshot', deviceId: `device_${group}`, deviceName: group, snapshotId: `snapshot_${group}_${index}` }
    });
    let entered, release, metadata;
    const started = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
    const complete = async json => {
        calls.uploads.push({ metadata: clone(metadata), json }); entered(); await gate;
        const uploaded = { id: 'a_new', createdTime: '2026-10-27T00:00:00.000Z', appProperties: clone(metadata.appProperties) };
        files.push(clone(uploaded));
        if (outcome === 'lost-ack') throw Error('Synthetic lost upload acknowledgement');
        if (outcome === 'missing-properties') delete uploaded.appProperties;
        if (outcome === 'missing-id') delete uploaded.id;
        if (outcome === 'wrong-group') uploaded.appProperties.deviceId = 'device_b';
        if (outcome === 'wrong-snapshot') uploaded.appProperties.snapshotId = 'different';
        if (outcome === 'wrong-app') uploaded.appProperties.app = 'other';
        if (outcome === 'wrong-type') uploaded.appProperties.type = 'other';
        return { json: async () => uploaded };
    };
    first.driveRequest = async (url, init = {}) => {
        if (init.method === 'POST') {
            assert.match(url, /appProperties/); // Real upload explicitly requests ownership fields.
            if (resumable) {
                metadata = JSON.parse(init.body);
                entered(); await gate;
                return { headers: { get: name => name === 'Location' ? 'https://synthetic.invalid/session' : null } };
            }
            const body = await init.body.text();
            metadata = JSON.parse(body.split('\r\n\r\n')[1].split('\r\n--')[0]);
            return complete(body.split('\r\n\r\n')[2].split('\r\n--')[0]);
        }
        if (init.method === 'PUT') return complete(init.body);
        if (init.method === 'DELETE') { calls.deleted.push(url.split('/').at(-1)); return {}; }
        if (url.startsWith('/files?')) { calls.lists++; return { json: async () => ({ files: clone(files) }) }; }
        throw Error(`Unexpected synthetic route: ${url}`);
    };
    return { first, second, calls, raw, files, started, release, draft: await first.createSnapshotDraft() };
}

for (const resumable of [false, true]) for (const switchWhen of ['never', 'before-upload', 'during-upload']) {
    test(`${resumable ? 'resumable' : 'multipart'} retention uses reviewed group with selection change ${switchWhen}`, async t => {
        const h = await fixture(t, { resumable });
        if (switchWhen === 'before-upload') await h.second.selectDevice('device_b');
        const pending = h.first.uploadSnapshotDraft(h.draft); await h.started;
        if (switchWhen === 'during-upload') await h.second.selectDevice('device_b');
        h.release(); const result = await pending;
        assert.deepEqual(h.calls.deleted, ['a_2', 'a_1']);
        assert.equal(result.pruneError, null);
        assert.equal((await h.second.getState()).deviceId, switchWhen === 'never' ? 'device_a' : 'device_b');
        assert.equal(h.calls.uploads.length, 1); assert.equal(h.calls.auth, 0);
        assert.equal(JSON.parse(h.calls.uploads[0].json).device.id, 'device_a');
    });
}
for (const resumable of [false, true]) test(`caller mutation during ${resumable ? 'resumable' : 'multipart'} upload cannot change uploaded content or retention owner`, async t => {
    const h = await fixture(t, { resumable }); const original = h.draft.json;
    const pending = h.first.uploadSnapshotDraft(h.draft); await h.started;
    await h.second.selectDevice('device_b');
    h.draft.metadata.appProperties.deviceId = 'device_b'; h.draft.state.deviceId = 'device_b';
    h.draft.snapshotId = 'changed'; h.draft.json = '{"changed":true}';
    h.release(); await pending;
    assert.deepEqual(h.calls.deleted, ['a_2', 'a_1']);
    assert.equal(h.calls.uploads[0].metadata.appProperties.deviceId, 'device_a');
    assert.equal(h.calls.uploads[0].json, original);
});
for (const outcome of ['missing-properties', 'missing-id', 'wrong-group', 'wrong-snapshot', 'wrong-app', 'wrong-type']) test(`successful upload with ${outcome} preserves every old snapshot and reports skipped cleanup`, async t => {
    const h = await fixture(t, { outcome });
    const pending = h.first.uploadSnapshotDraft(h.draft); await h.started; h.release();
    const result = await pending;
    assert.match(result.pruneError.message, /cleanup was not run.*older snapshots were kept/);
    assert.equal(h.calls.lists, 0); assert.deepEqual(h.calls.deleted, []); assert.equal(h.calls.uploads.length, 1);
    assert.match(result.state.lastError, /Backup created/);
});
for (const invalid of ['missing', 'mismatched']) test(`${invalid} draft ownership never falls back to current device`, async t => {
    const h = await fixture(t); if (invalid === 'missing') delete h.draft.state; else h.draft.snapshotId = 'different';
    const pending = h.first.uploadSnapshotDraft(h.draft); await h.started; h.release(); const result = await pending;
    assert.match(result.pruneError.message, /ownership/); assert.equal(h.calls.lists, 0); assert.deepEqual(h.calls.deleted, []);
});
test('lost upload acknowledgement never lists or deletes prior snapshots', async t => {
    const h = await fixture(t, { outcome: 'lost-ack' });
    const pending = h.first.uploadSnapshotDraft(h.draft); await h.started;
    const rejected = assert.rejects(pending, /lost upload acknowledgement/); h.release(); await rejected;
    assert.equal(h.calls.lists, 0); assert.deepEqual(h.calls.deleted, []); assert.equal(h.first._uploadInProgress, false);
});
test('explicit prune:false retains all snapshots without treating omitted acknowledgement ownership as a cleanup failure', async t => {
    const h = await fixture(t, { outcome: 'missing-properties' });
    const pending = h.first.uploadSnapshotDraft(h.draft, { prune: false }); await h.started; h.release(); const result = await pending;
    assert.equal(result.pruneError, null); assert.equal(h.calls.lists, 0); assert.deepEqual(h.calls.deleted, []);
});
