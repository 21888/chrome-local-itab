const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const StorageManager = require('../storage.js');
const DriveBackupManager = require('../drive-backup.js');

// Exercise both real backup entry points without browser accounts or networking.
function harness(saved = {}) {
    const state = { blobs: [], feedback: [], clicks: 0, reads: [], writes: 0, failure: null };
    const manager = new StorageManager();
    manager.ensureSyncInitialized = async () => {};
    global.chrome = { storage: { local: {
        async get(keys) {
            state.reads.push(keys);
            if (state.failure === 'read') throw new Error('Synthetic read failure');
            if (state.failure === 'shape') return null;
            return Object.fromEntries(keys.filter(key => Object.hasOwn(saved, key)).map(key => [key, structuredClone(saved[key])]));
        },
        async set() { state.writes++; }
    } } };
    const lock = manager.withLocalWriteLock.bind(manager);
    manager.withLocalWriteLock = async (...args) => {
        if (state.failure === 'lock') throw new Error('Synthetic lock failure');
        return lock(...args);
    };
    const validate = manager.validateConfigObject.bind(manager);
    manager.validateConfigObject = (...args) => {
        if (state.failure === 'validation') throw new Error('Synthetic validation failure');
        return validate(...args);
    };
    const context = {
        storageManager: manager, Blob,
        URL: { createObjectURL(blob) { state.blobs.push(blob); return 'blob:synthetic'; }, revokeObjectURL() {} },
        document: {
            addEventListener() {}, getElementById() { return null; },
            createElement() { return { click() { state.clicks++; } }; },
            body: { appendChild() {}, removeChild() {} }
        },
        window: {}, console: { log() {}, warn() {}, error() {} }, confirm: () => true, setTimeout() {}
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(require.resolve('../options.js'), 'utf8'), context);
    context.showImportExportFeedback = (operation, status, message) => state.feedback.push({ operation, status, message });
    const drive = new DriveBackupManager(manager);
    drive.ensureState = async () => ({ deviceId: 'synthetic-device', deviceName: 'Test device' });
    return { state, manager, context, drive };
}

async function successfulBackups(h) {
    await h.context.exportSettings();
    assert.equal(h.state.feedback.at(-1).status, 'success');
    assert.equal(h.state.clicks, 1);
    const manual = JSON.parse(await h.state.blobs[0].text());
    const draft = await h.drive.createSnapshotDraft();
    assert.deepEqual(draft.payload.data, manual.data);
    assert.equal(h.state.writes, 0);
    return manual.data;
}

test('both actual backup entry points export successfully read fresh defaults', async () => {
    const h = harness();
    assert.deepEqual(await successfulBackups(h), h.manager.cloneDefaultConfig());
});

test('both backup entry points preserve sites, world clocks and assets without reading private keys', async () => {
    const saved = {
        quote: 'SAVED_QUOTE_SENTINEL',
        clock: { hour12: false, showSeconds: true, worldClocks: [{ timeZone: 'Asia/Tokyo', label: 'Tokyo' }] },
        links: [{ title: 'Saved site', url: 'https://example.com/', icon: 'X', category: 'all' }],
        bg: { type: 'image', value: 'data:image/png;base64,QUJD' },
        movie: { title: 'Movie', note: 'Saved note', poster: 'data:image/png;base64,REVG' }
    };
    for (const key of ['__localItabPersonalTasksV1', '__localItabFocusV1', '__localItabScratchpadV1', '__localItabCountdownV1']) {
        Object.defineProperty(saved, key, { enumerable: true, get() { throw new Error('Private content must not be read'); } });
    }
    const h = harness(saved);
    const data = await successfulBackups(h);
    for (const key of ['quote', 'clock', 'links', 'bg', 'movie']) assert.deepEqual(data[key], saved[key]);
    assert(!JSON.stringify(data).includes('__localItab'));
    for (const keys of h.state.reads) assert.deepEqual(keys, Object.keys(h.manager.defaultConfig));
});

for (const failure of ['read', 'lock', 'validation', 'shape']) {
    test(`${failure} failure never creates a successful download or Drive draft; retry preserves saved data`, async () => {
        const saved = { quote: 'SAVED_QUOTE_SENTINEL', links: [] };
        const before = structuredClone(saved);
        const h = harness(saved);
        h.state.failure = failure;
        await h.context.exportSettings();
        assert.equal(h.state.clicks, 0);
        assert.equal(h.state.blobs.length, 0);
        assert.equal(h.state.feedback.at(-1).status, 'error');
        assert(!h.state.feedback.some(item => item.status === 'success'));
        await assert.rejects(() => h.drive.createSnapshotDraft());
        assert.equal(h.state.writes, 0);
        assert.deepEqual(saved, before);
        h.state.failure = null;
        assert.equal((await successfulBackups(h)).quote, saved.quote);
    });
}

test('successful reads preserve existing legacy and tolerant normalization exactly', async () => {
    const saved = {
        themePreset: 'warm-studio',
        clock: { hour12: true },
        links: [{ title: '  Legacy site  ', url: 'example.com', category: 'work' }, { title: '', url: 'invalid' }],
        unknownFutureKey: { opaque: true }
    };
    const h = harness(saved);
    const expected = h.manager.buildManualExportPayload(h.manager.validateConfigObject(saved)).data;
    assert.deepEqual(await successfulBackups(h), expected);
});

test('existing identity validation errors fail closed at both backup boundaries', async () => {
    const h = harness({ links: [{ title: 'Invalid identity', url: 'https://example.com/', layoutId: 'malformed' }] });
    await h.context.exportSettings();
    assert.equal(h.state.clicks, 0);
    assert.equal(h.state.blobs.length, 0);
    assert.equal(h.state.feedback.at(-1).status, 'error');
    await assert.rejects(() => h.drive.createSnapshotDraft(), error => error.code === 'LAYOUT_IDENTITY_INVALID');
    assert.equal(h.state.writes, 0);
});
