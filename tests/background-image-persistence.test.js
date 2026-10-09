const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };
const tick = () => new Promise(setImmediate);

function createHarness() {
    const fields = new Map([
        ['bg-type', { value: 'image' }], ['bg-color', { value: '#112233' }], ['bg-color-text', { value: '#112233' }], ['bg-image-upload', { value: 'same-image.png' }],
        ['bg-image-preview', { style: { display: 'block' } }], ['bg-preview-img', { src: 'data:image/png;base64,T0xE' }],
        ['bg-color-section', { style: { display: 'none' } }], ['bg-image-section', { style: { display: 'block' } }]
    ]);
    const state = { stored: { type: 'image', value: 'data:image/png;base64,T0xE' }, writes: [], messages: [], reads: [], allowRemove: true, save: async () => true };
    const context = {
        document: { addEventListener() {}, getElementById(id) { return fields.get(id) || null; } },
        window: {}, console: { error() {}, log() {}, warn() {} },
        confirm() { return state.allowRemove; },
        chrome: { storage: { local: { async get() {
            if (state.readError) throw new Error('storage read unavailable');
            return state.missingBackground ? {} : { bg: JSON.parse(JSON.stringify(state.stored)) };
        } } } }
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('shared/layout-identity.js', 'utf8'), context);
    vm.runInContext(fs.readFileSync('shared/world-clocks.js', 'utf8'), context);
    vm.runInContext(fs.readFileSync('storage.js', 'utf8'), context);
    // Use the real strict StorageManager read path, not a throw-only getAll stub.
    context.window.storageManager.set = async (key, value) => {
        state.writes.push({ key, value });
        const result = await state.save(value);
        if (result) { state.stored = JSON.parse(JSON.stringify(value)); state.missingBackground = false; }
        return result;
    };
    vm.runInContext(fs.readFileSync('options.js', 'utf8'), context);
    context.showMessage = (text, status) => state.messages.push({ text, status });
    context.fileToDataURL = async file => { state.reads.push(file.name); return file.data ? await file.data : 'data:image/png;base64,TkVX'; };
    const file = { name: 'same-image.png', type: 'image/png', size: 100 };
    const visualState = () => JSON.stringify([...fields].filter(([id]) => id !== 'bg-image-upload'));
    return { context, state, fields, file, visualState };
}

(async () => {
    {
        const h = createHarness();
        h.state.missingBackground = true;
        await h.context.handleBackgroundImageUpload(h.file);
        assert.equal(h.state.stored.value, 'data:image/png;base64,TkVX', 'a missing first-install setting still permits an upload');
        assert.equal(h.state.messages.at(-1).status, 'success');
    }
    for (const failure of ['false', 'throw', 'read', 'storage-read']) {
        const h = createHarness();
        const previousVisual = h.visualState();
        if (failure === 'false') h.state.save = async () => false;
        if (failure === 'throw') h.state.save = async () => { throw new Error('storage unavailable'); };
        if (failure === 'storage-read') h.state.readError = true;
        if (failure === 'read') h.context.fileToDataURL = async () => { throw new Error('file unreadable'); };
        await h.context.handleBackgroundImageUpload(h.file);
        assert.equal(h.visualState(), previousVisual, `${failure} must preserve committed UI`);
        assert.equal(h.state.stored.value, 'data:image/png;base64,T0xE');
        assert.equal(h.state.messages.some(message => message.status === 'success'), false);
        assert.equal(h.state.messages.at(-1).status, 'error');
        assert.equal(h.fields.get('bg-image-upload').value, '', 'same image can be selected again');
        h.state.readError = false;
        h.state.save = async () => true;
        h.context.fileToDataURL = async () => 'data:image/png;base64,TkVX';
        await h.context.handleBackgroundImageUpload(h.file);
        assert.equal(h.state.stored.value, 'data:image/png;base64,TkVX');
        assert.equal(h.fields.get('bg-preview-img').src, h.state.stored.value);
        assert.equal(h.state.messages.at(-1).status, 'success');
    }
    for (const file of [null, { name: 'bad.svg', type: 'image/svg+xml', size: 10 }, { name: 'large.png', type: 'image/png', size: 5 * 1024 * 1024 + 1 }]) {
        const h = createHarness();
        const previousVisual = h.visualState();
        await h.context.handleBackgroundImageUpload(file);
        assert.equal(h.state.reads.length, 0);
        assert.equal(h.state.writes.length, 0);
        assert.equal(h.visualState(), previousVisual);
        assert.equal(h.fields.get('bg-image-upload').value, '');
    }
    for (const result of ['false', 'throw', 'cancel', 'success']) {
        const h = createHarness();
        const previousVisual = h.visualState();
        if (result === 'false') h.state.save = async () => false;
        if (result === 'throw') h.state.save = async () => { throw new Error('storage unavailable'); };
        if (result === 'cancel') h.state.allowRemove = false;
        await h.context.removeBackgroundImage();
        if (result === 'success') {
            assert.equal(h.fields.get('bg-type').value, 'gradient');
            assert.equal(h.fields.get('bg-image-preview').style.display, 'none');
            assert.equal(h.state.stored.type, 'gradient');
            assert.equal(h.state.messages.at(-1).status, 'success');
        } else {
            assert.equal(h.visualState(), previousVisual);
            assert.equal(h.state.stored.value, 'data:image/png;base64,T0xE');
            assert.equal(h.state.messages.some(message => message.status === 'success'), false);
        }
        if (result === 'cancel') assert.equal(h.state.writes.length, 0);
    }
    for (const invalid of [null, { name: 'bad.svg', type: 'image/svg+xml', size: 10 }, { name: 'large.png', type: 'image/png', size: 5 * 1024 * 1024 + 1 }]) {
        const h = createHarness();
        const write = deferred();
        h.state.save = async () => write.promise;
        const accepted = h.context.handleBackgroundImageUpload(h.file);
        await tick();
        await h.context.handleBackgroundImageUpload(invalid);
        write.resolve(true);
        await accepted;
        assert.equal(h.state.writes.length, 1);
        assert.equal(h.fields.get('bg-preview-img').src, h.state.stored.value, 'invalid/non-action cannot orphan an accepted pending write');
        assert.equal(h.state.messages.at(-1).status, 'success');
    }
    // Newer uploads/removals/type choices own the UI. Older reads are discarded;
    // already-started writes finish before a newer action reads committed state.
    for (const phase of ['read', 'write']) {
        for (const next of ['upload', 'remove', 'color']) {
            const h = createHarness();
            const firstRead = deferred();
            const firstWrite = deferred();
            const secondWrite = deferred();
            h.state.save = async value => value.value.endsWith('QQ==') ? firstWrite.promise : secondWrite.promise;
            const first = h.context.handleBackgroundImageUpload({ ...h.file, name: 'A.png', data: firstRead.promise });
            await tick();
            if (phase === 'write') { firstRead.resolve('data:image/png;base64,QQ=='); await tick(); }
            let second;
            if (next === 'upload') second = h.context.handleBackgroundImageUpload({ ...h.file, name: 'B.png', data: Promise.resolve('data:image/png;base64,Qg==') });
            if (next === 'remove') second = h.context.removeBackgroundImage();
            if (next === 'color') {
                h.fields.get('bg-type').value = 'color';
                h.fields.get('bg-color').value = '#abcdef';
                h.context.updateBackgroundSections();
                second = h.context.saveBackgroundSettings();
            }
            await tick();
            assert.deepEqual(h.state.reads, ['A.png']);
            assert.equal(h.state.writes.length, phase === 'write' ? 1 : 0);
            if (phase === 'read') firstRead.resolve('data:image/png;base64,QQ==');
            else firstWrite.resolve(true);
            await tick();
            assert.equal(h.fields.get('bg-preview-img').src, 'data:image/png;base64,T0xE', 'superseded completion cannot replace the preview');
            if (next === 'color') assert.equal(h.fields.get('bg-type').value, 'color', 'old upload must not undo a newer type choice');
            secondWrite.resolve(true);
            await Promise.all([first, second]);
            assert.equal(h.state.writes.length, phase === 'write' ? 2 : 1);
            if (next === 'upload') {
                assert.equal(h.state.stored.value, 'data:image/png;base64,Qg==');
                assert.equal(h.fields.get('bg-preview-img').src, h.state.stored.value);
            } else {
                assert.equal(h.state.stored.type, next === 'remove' ? 'gradient' : 'color');
                assert.equal(h.fields.get('bg-image-preview').style.display, 'none');
                if (next === 'color') assert.equal(h.state.stored.value, '#abcdef');
            }
            assert.equal(h.fields.get('bg-image-upload').value, '');
        }
    }
    {
        const h = createHarness();
        const firstWrite = deferred();
        h.state.save = async value => value.type === 'image' ? firstWrite.promise : false;
        const first = h.context.handleBackgroundImageUpload(h.file);
        await tick();
        h.fields.get('bg-type').value = 'color';
        h.fields.get('bg-color').value = '#abcdef';
        const second = h.context.saveBackgroundSettings();
        firstWrite.resolve(true);
        await Promise.all([first, second]);
        assert.equal(h.state.stored.type, 'image');
        assert.equal(h.fields.get('bg-type').value, 'image');
        assert.equal(h.fields.get('bg-preview-img').src, h.state.stored.value, 'latest failure restores the actual preceding committed image');
        assert.equal(h.state.messages.some(message => message.status === 'success'), false);
        assert.equal(h.state.messages.at(-1).status, 'error');
    }
    {
        const h = createHarness();
        h.state.stored = { type: 'color', value: '#112233' };
        h.fields.get('bg-type').value = 'color';
        h.fields.get('bg-color').value = '#abcdef';
        h.state.save = async () => false;
        await h.context.saveBackgroundSettings();
        assert.equal(h.fields.get('bg-color').value, '#112233');
        assert.equal(h.fields.get('bg-color-text').value, '#112233');
        assert.equal(h.state.messages.at(-1).status, 'error');
    }
    console.log('background image persistence tests ok (DOM/storage model)');
})().catch(error => { console.error(error); process.exitCode = 1; });
