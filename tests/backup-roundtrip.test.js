const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { File } = require('node:buffer');
const StorageManager = require('../storage.js');
const MiB = 1024 * 1024;

function createHarness(config) {
    const manager = new StorageManager();
    const provider = { sync: { enabled: true, lastSync: 'current-device-marker', lastError: '', includeLargeAssets: false } };
    const state = { blobs: [], decisions: [], prompts: [], feedback: [], writes: [], timers: [], reloads: 0, reads: 0, saveResult: true, saveError: null };
    const input = { value: 'backup.json' };
    manager.getAll = async () => config;
    manager.getLocalProviderState = async () => provider;
    manager.setAll = async (settings, options) => {
        state.writes.push({ settings, options });
        if (state.saveError) throw state.saveError;
        return state.saveResult;
    };
    class BlobURL extends URL {
        static createObjectURL(blob) { state.blobs.push(blob); return `blob:local-backup-${state.blobs.length}`; }
        static revokeObjectURL() {}
    }
    const context = {
        storageManager: manager, URL: BlobURL, Blob,
        document: {
            addEventListener() {},
            getElementById(id) { return id === 'import-settings' ? input : null; },
            createElement() { return { click() {} }; },
            body: { appendChild() {}, removeChild() {} }
        },
        window: { location: { reload() { state.reloads++; } } },
        console: { log() {}, error() {}, warn() {} },
        confirm(message) { state.prompts.push(message); return state.decisions.length ? state.decisions.shift() : true; },
        setTimeout(callback) { state.timers.push(callback); }
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('shared/local-content-lifecycle.js', 'utf8'), context);
    vm.runInContext(fs.readFileSync('options.js', 'utf8'), context);
    context.showImportExportFeedback = (operation, status, message) => state.feedback.push({ operation, status, message });
    const reset = () => {
        state.decisions = []; state.prompts = []; state.feedback = []; state.writes = []; state.timers = [];
        state.reads = 0; state.reloads = 0; state.saveResult = true; state.saveError = null; input.value = 'backup.json';
    };
    const readFile = blob => {
        const file = new File([blob], 'local-itab-settings.json', { type: 'application/json' });
        file.text = async () => { state.reads++; return File.prototype.text.call(file); };
        return file;
    };
    return { manager, provider, state, input, context, reset, readFile };
}

(async () => {
    let largeBlob;
    // Two data-URL-shaped synthetic payloads representing separately supported
    // local assets. This tests exact backup bytes, not image decoding/rendering.
    for (const imageMiB of [4, 5]) {
        const manager = new StorageManager();
        const config = manager.cloneDefaultConfig();
        const base64 = Buffer.alloc(imageMiB * MiB, 65).toString('base64');
        config.bg = { type: 'image', value: `data:image/png;base64,${base64}` };
        config.movie = { title: 'Local poster', note: 'Retain every byte', poster: `data:image/jpeg;base64,${base64}` };
        config.links = [{ title: '本地资料', url: 'https://example.com/', icon: '📚', category: 'study' }];
        config.categories = [{ id: 'study', name: '学习', icon: '📚' }];
        config.layout = { ...config.layout, autoArrange: false, alignToGrid: false, positions: { 'all|https://example.com/': { x: 37.5, y: 53.25 } } };
        config.sync = { enabled: true, lastSync: 'backup-device-marker', lastError: '', includeLargeAssets: false };
        const h = createHarness(config);
        await h.context.exportSettings();
        assert.equal(h.state.feedback.at(-1).status, 'success');
        assert.equal(h.state.blobs.length, 1);
        const blob = h.state.blobs[0];
        assert(blob.size > 10 * MiB, 'real export must reproduce the old import cutoff');
        h.reset();
        await h.context.importSettings(h.readFile(blob));
        assert.equal(h.state.prompts.length, 2, 'resource warning precedes replacement confirmation');
        assert.match(h.state.prompts[0], /memory/);
        assert.match(h.state.prompts[1], /replace all settings/);
        assert.equal(h.state.writes.length, 1);
        const restored = h.state.writes[0].settings;
        for (const key of ['bg', 'movie']) assert.deepEqual(restored[key], config[key], `${key} at ${imageMiB} MiB`);
        for (const key of ['links', 'categories', 'layout']) assert.deepEqual(JSON.parse(JSON.stringify(restored[key])), config[key], `${key} at ${imageMiB} MiB`);
        assert.deepEqual(restored.sync, h.provider.sync);
        assert.equal(h.state.writes[0].options.skipSyncSideEffects, true);
        assert.equal(h.state.writes[0].options.skipSyncInitialization, true);
        assert.equal(h.state.feedback.at(-1).status, 'success');
        assert.equal(h.input.value, '');
        assert.equal(h.state.timers.length, 1);
        h.state.timers[0]();
        assert.equal(h.state.reloads, 1);
        largeBlob = blob;
    }

    const h = createHarness(new StorageManager().cloneDefaultConfig());
    h.state.decisions = [false];
    const sameFile = h.readFile(largeBlob);
    await h.context.importSettings(sameFile);
    assert.equal(h.state.reads, 0, 'cancel the resource warning before allocating file text');
    assert.equal(h.state.writes.length, 0);
    assert.equal(h.state.timers.length, 0);
    assert.equal(h.input.value, '', 'same file can be selected again after cancellation');

    h.reset();
    h.state.decisions = [true, false];
    await h.context.importSettings(sameFile);
    assert.equal(h.state.reads, 1);
    assert.equal(h.state.prompts.length, 2);
    assert.equal(h.state.writes.length, 0);
    assert.equal(h.state.timers.length, 0);
    assert.equal(h.input.value, '');

    for (const text of ['{"unrelated":true}', '{malformed JSON']) {
        h.reset();
        const invalidLarge = new Blob([text, ' '.repeat(10 * MiB)]);
        await h.context.importSettings(h.readFile(invalidLarge));
        assert.equal(h.state.prompts.length, 1, 'malformed large file may show resource warning, never replacement confirmation');
        assert.equal(h.state.writes.length, 0);
        assert.equal(h.state.timers.length, 0);
        assert.equal(h.state.feedback.at(-1).status, 'error');
        assert.equal(h.input.value, '');
    }
    h.reset();
    const unreadable = h.readFile(largeBlob);
    unreadable.text = async () => { throw new Error('File read unavailable'); };
    await h.context.importSettings(unreadable);
    assert.equal(h.state.writes.length, 0);
    assert.equal(h.state.timers.length, 0);
    assert.equal(h.state.feedback.at(-1).status, 'error');
    assert.equal(h.input.value, '');

    for (const failure of ['false', 'throw']) {
        h.reset();
        if (failure === 'false') h.state.saveResult = false;
        else h.state.saveError = new Error('Storage unavailable');
        await h.context.importSettings(h.readFile(largeBlob));
        assert.equal(h.state.writes.length, 1);
        assert.equal(h.state.timers.length, 0);
        assert.equal(h.state.reloads, 0);
        assert.equal(h.state.feedback.some(item => item.status === 'success'), false);
        assert.equal(h.input.value, '');
        h.reset();
        await h.context.importSettings(h.readFile(largeBlob));
        assert.equal(h.state.feedback.at(-1).status, 'success', 'retry after storage failure');
    }
    h.reset();
    const small = new Blob(['{"links":[]}']);
    await h.context.importSettings(h.readFile(small));
    assert.equal(h.state.prompts.length, 1, 'small backups retain only the replacement confirmation');
    assert.match(h.state.prompts[0], /replace all settings/);
    for (const size of [10 * MiB - 1, 10 * MiB, 10 * MiB + 1]) {
        h.reset();
        const text = '{"links":[]}';
        const boundary = new Blob([text, ' '.repeat(size - Buffer.byteLength(text))]);
        await h.context.importSettings(h.readFile(boundary));
        assert.equal(h.state.prompts.length, size > 10 * MiB ? 2 : 1);
        assert.equal(h.state.feedback.at(-1).status, 'success');
    }
    h.reset();
    await h.context.importSettings(new File([small], 'not-a-backup.txt'));
    assert.equal(h.state.prompts.length, 0);
    assert.equal(h.state.writes.length, 0);
    assert.equal(h.input.value, '');
    console.log('backup roundtrip tests ok (actual exported Blobs, synthetic image bytes)');
})().catch(error => { console.error(error); process.exitCode = 1; });
