const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
const OLD = 'data:image/png;base64,T0xE';
const GOOD = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=';
const BROKEN = 'data:image/png;base64,bm90LWFuLWltYWdl';
const file = (data = GOOD, name = 'synthetic.png') => ({ name, type: 'image/png', size: 100, data });

// Actual Options event handlers/FileReader adapter plus a deterministic image
// decoder and storage model. This does not run a browser image codec or picker.
function harness() {
    const document = createDocument();
    for (const [id, tag] of [['bg-type', 'select'], ['bg-color', 'input'], ['bg-color-text', 'input'],
        ['bg-image-upload', 'input'], ['bg-image-preview', 'div'], ['bg-preview-img', 'img'],
        ['bg-color-section', 'div'], ['bg-image-section', 'div'], ['bg-upload-area', 'div'], ['remove-bg-image', 'button']]) {
        const element = document.createElement(tag); element.id = id; document.body.append(element);
    }
    const field = id => document.getElementById(id);
    field('bg-type').value = 'image'; field('bg-color').value = field('bg-color-text').value = '#112233';
    field('bg-image-upload').type = 'file'; field('bg-image-preview').style.display = 'block';
    field('bg-preview-img').src = OLD; field('bg-color-section').style.display = 'none'; field('bg-image-section').style.display = 'block';
    const state = { stored: { type: 'image', value: OLD }, writes: [], messages: [], reads: [], decodes: [],
        decode: async data => { if (data === BROKEN) throw new Error('synthetic corrupt image'); }, save: async () => true };
    const chrome = { storage: { local: { async get() { return { bg: { ...state.stored } }; } } } };
    const context = vm.createContext({ document, window: { document }, chrome, console: { log() {}, warn() {}, error() {} },
        confirm: () => true, setTimeout, clearTimeout,
        FileReader: class {
            readAsDataURL(value) {
                state.reads.push(value.name);
                Promise.resolve(value.data).then(data => { this.result = data; this.onload(); }, error => this.onerror(error));
            }
        },
        Image: class { async decode() { state.decodes.push(this.src); await state.decode(this.src); } }
    });
    for (const path of ['shared/layout-identity.js', 'shared/world-clocks.js', 'shared/configuration-codec.js', 'storage.js', 'options.js']) {
        vm.runInContext(fs.readFileSync(path, 'utf8'), context);
    }
    context.window.storageManager._syncInitialized = true;
    context.window.storageManager.setAll = async settings => {
        state.writes.push({ ...settings.bg });
        const saved = await state.save(settings.bg);
        if (saved) state.stored = { ...settings.bg };
        return saved;
    };
    context.initialBackground = { ...state.stored };
    vm.runInContext('settingsBaseline = {generation: null, values: {bg: initialBackground}}; settingsFormConfig = {bg: initialBackground}; settingsFormBaseline = {bg: initialBackground};', context);
    context.showMessage = (text, status) => state.messages.push({ text, status });
    context.setupEventListeners();
    const settle = () => vm.runInContext('settingsSaveQueue', context);
    return { context, state, field, document, settle,
        choose(value) { field('bg-image-upload').value = value?.name || ''; field('bg-image-upload').files = value ? [value] : []; field('bg-image-upload').dispatch('change'); return settle(); },
        drop(value) { field('bg-upload-area').dispatch('drop', { dataTransfer: { files: [value] } }); return settle(); },
        remove() { field('remove-bg-image').dispatch('click'); return settle(); },
        color() { field('bg-type').value = 'color'; field('bg-color').value = '#abcdef'; field('bg-type').dispatch('change'); return settle(); }
    };
}

for (const entry of ['choose', 'drop']) test(`${entry}: corrupt allowed-MIME image cannot replace the saved preview; retry works`, async () => {
    const h = harness();
    await h[entry](file(BROKEN, 'broken.png'));
    assert.equal(h.state.writes.length, 0);
    assert.equal(h.state.stored.value, OLD); assert.equal(h.field('bg-preview-img').src, OLD);
    assert.equal(h.state.messages.at(-1).status, 'error'); assert.equal(h.field('bg-image-upload').value, '');
    assert.equal(h.state.messages.some(message => message.status === 'success'), false);
    await h.choose(file());
    assert.deepEqual(h.state.decodes, [BROKEN, GOOD]);
    assert.equal(h.state.stored.value, GOOD); assert.equal(h.field('bg-preview-img').src, GOOD);
    assert.equal(h.state.messages.at(-1).status, 'success');
});

test('a selected image is decoded before any write or preview update', async () => {
    const h = harness(), decode = deferred(); h.state.decode = () => decode.promise;
    const pending = h.choose(file()); await tick();
    assert.deepEqual(h.state.decodes, [GOOD]); assert.equal(h.state.writes.length, 0);
    assert.equal(h.field('bg-preview-img').src, OLD);
    decode.resolve(); await pending;
    assert.equal(h.state.writes.length, 1); assert.equal(h.field('bg-preview-img').src, GOOD);
});

for (const next of ['upload', 'remove', 'color']) for (const result of ['resolve', 'reject']) {
    test(`newer ${next} owns the outcome of an older ${result === 'resolve' ? 'successful' : 'failed'} decode`, async () => {
        const h = harness(), decode = deferred(); let first = true;
        h.state.decode = () => { if (first) { first = false; return decode.promise; } return Promise.resolve(); };
        const old = h.choose(file(GOOD, 'older.png')); await tick();
        const latest = next === 'upload' ? h.choose(file(GOOD, 'newer.png')) : h[next]();
        const count = h.state.messages.length;
        if (result === 'resolve') decode.resolve(); else decode.reject(new Error('late decode failure'));
        await Promise.all([old, latest]);
        assert.equal(h.state.writes.length, 1, 'superseded decode never reaches the writer');
        assert.equal(h.state.messages.slice(count).some(message => message.status === 'error'), false);
        assert.equal(h.state.stored.type, next === 'upload' ? 'image' : next === 'remove' ? 'gradient' : 'color');
        assert.equal(h.field('bg-type').value, h.state.stored.type);
        assert.equal(h.field('bg-image-preview').style.display, next === 'upload' ? 'block' : 'none');
    });
}

for (const invalid of [null, { name: 'bad.svg', type: 'image/svg+xml', size: 10 }, { name: 'large.png', type: 'image/png', size: 5 * 1024 * 1024 + 1 }]) {
    test(`picker ${invalid?.name || 'cancel'} keeps an accepted pending image decode`, async () => {
        const h = harness(), decode = deferred(); h.state.decode = () => decode.promise;
        const pending = h.choose(file()); await tick(); h.choose(invalid); decode.resolve(); await pending;
        assert.equal(h.state.writes.length, 1); assert.equal(h.state.stored.value, GOOD);
        assert.equal(h.field('bg-preview-img').src, GOOD); assert.equal(h.state.messages.at(-1).status, 'success');
    });
}

test('a newer unsaved color text draft remains visible after decode fails', async () => {
    const h = harness(), decode = deferred(); h.state.decode = () => decode.promise;
    const pending = h.choose(file()); await tick(); h.field('bg-color-text').value = '#partial';
    decode.reject(new Error('bad image')); await pending;
    assert.equal(h.state.writes.length, 0); assert.equal(h.field('bg-color-text').value, '#partial');
    assert.equal(h.field('bg-preview-img').src, OLD);
});

test('confirmed same-page replacement retires an image still decoding without write or success', async () => {
    const h = harness(), decode = deferred(); h.state.decode = () => decode.promise;
    const pending = h.choose(file()); await tick();
    // Exercise the actual reset/import ownership wrapper. Its storage replacement
    // callback is synthetic; no restore protocol is changed or accepted here.
    const replacement = h.context.replaceSettings(async () => true);
    decode.resolve(); await Promise.all([pending, replacement]);
    assert.equal(h.state.writes.length, 0); assert.equal(h.field('bg-preview-img').src, OLD);
    assert.equal(h.state.messages.some(message => message.status === 'success'), false);
});

test('decoder failure cannot roll back an earlier image write that already committed', async () => {
    const h = harness(), write = deferred(); h.state.save = () => write.promise;
    const earlier = h.choose(file()); await tick(); assert.equal(h.state.writes.length, 1);
    const rejected = h.choose(file(BROKEN, 'broken.png'));
    write.resolve(true); await Promise.all([earlier, rejected]);
    assert.equal(h.state.writes.length, 1); assert.equal(h.state.stored.value, GOOD);
    assert.equal(h.field('bg-preview-img').src, OLD, 'superseded presentation is not a rollback of the earlier write');
    assert.equal(h.state.messages.at(-1).status, 'error');
    assert.match(h.state.messages.at(-1).text, /This file.*not saved/);
    assert.equal(h.state.messages.some(message => message.status === 'success'), false);
});

test('native-picker cancel event leaves a pending decode owned by its accepted selection', async () => {
    const h = harness(), decode = deferred(); h.state.decode = () => decode.promise;
    const pending = h.choose(file()); await tick(); h.field('bg-image-upload').dispatch('cancel');
    decode.resolve(); await pending;
    assert.equal(h.state.writes.length, 1); assert.equal(h.field('bg-preview-img').src, GOOD);
});

for (const type of ['image/jpeg', 'image/png', 'image/gif', 'image/webp']) test(`existing ${type} and exactly 5 MiB remain accepted after successful decoding`, async () => {
    const h = harness(); await h.choose({ ...file(), type, size: 5 * 1024 * 1024 });
    assert.equal(h.state.decodes.length, 1); assert.equal(h.state.writes.length, 1);
    assert.equal(h.state.messages.at(-1).status, 'success');
});

test('a failed file read does not decode or overwrite the current preview', async () => {
    const h = harness(); await h.choose(file(Promise.reject(new Error('synthetic read failure'))));
    assert.equal(h.state.decodes.length, 0); assert.equal(h.state.writes.length, 0);
    assert.equal(h.field('bg-preview-img').src, OLD); assert.equal(h.state.messages.at(-1).status, 'error');
});

test('a late read discarded by a newer choice never starts image decoding', async () => {
    const h = harness(), read = deferred(); const earlier = h.choose(file(read.promise, 'older.png')); await tick();
    const latest = h.color(); read.resolve(GOOD); await Promise.all([earlier, latest]);
    assert.equal(h.state.decodes.length, 0); assert.equal(h.state.writes.length, 1);
    assert.equal(h.state.stored.type, 'color'); assert.equal(h.field('bg-color').value, '#abcdef');
});

test('workspace write rejection after decoding keeps the preview and reports no success', async () => {
    const h = harness(), decode = deferred(); h.state.decode = () => decode.promise;
    const pending = h.choose(file()); await tick();
    h.context.window.storageManager.setAll = async () => { throw Object.assign(new Error('Workspace is no longer available.'), { code: 'WORKSPACE_INVALIDATED' }); };
    decode.resolve(); await pending;
    assert.equal(h.state.writes.length, 0); assert.equal(h.field('bg-preview-img').src, OLD);
    assert.equal(h.state.messages.at(-1).status, 'error'); assert.equal(h.field('bg-image-upload').value, '');
    assert.equal(h.state.messages.some(message => message.status === 'success'), false);
});

test('new invalid-image guidance is localized and only promises that rejected file was not saved', () => {
    for (const locale of ['en', 'zh_CN']) {
        const message = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8')).settingsBackgroundImageInvalid.message;
        assert(message); assert.match(message, /JPEG.*PNG.*GIF.*WebP/);
    }
});
