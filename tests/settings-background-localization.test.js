const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const {createDocument} = require('./helpers/task-dom-model');

// Real DOMContentLoaded initialization, i18n, Options event handlers/messages,
// file reader adapter, save queue and explicit CommonJS StorageManager. Only the DOM/events,
// browser catalogs, timers, image decoding, Web Locks and Chrome storage are
// deterministic models. This is not a native Chrome picker/codec/drag test.
const source = fs.readFileSync('options.html', 'utf8');
const catalogs = Object.fromEntries(['en', 'zh_CN'].map(locale =>
    [locale, JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'))]));
const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(setImmediate);
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return {promise, resolve, reject}; };
const OLD = 'data:image/png;base64,T0xE';
const GOOD = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB1kAAAAASUVORK5CYII=';
const BROKEN = 'data:image/png;base64,bm90LWFuLWltYWdl';
const file = (data = GOOD, name = 'Synthetic $& 中文.png') => ({name, type: 'image/png', size: 100, data});
const words = {
    en: {select: 'Click to select image or drag & drop', hint: 'JPEG, PNG, GIF, WebP (max 5MB)', remove: 'Remove Image',
        invalid: 'Please select a valid image file (JPEG, PNG, GIF, or WebP)',
        large: 'Image file is too large. Please select an image smaller than 5MB.',
        uploading: 'Uploading background image...', uploaded: 'Background image uploaded.', uploadError: 'Error uploading image:',
        confirm: 'Are you sure you want to remove the background image?', removed: 'Background image removed.', removeError: 'Error removing background image:'},
    zh_CN: {select: '点击选择图片，或拖放图片到此处', hint: 'JPEG、PNG、GIF、WebP（最大 5MB）', remove: '移除图片',
        invalid: '请选择有效的图片文件（JPEG、PNG、GIF 或 WebP）', large: '图片文件过大，请选择小于 5MB 的图片。',
        uploading: '正在上传背景图片...', uploaded: '背景图片已上传。', uploadError: '上传图片时出错：',
        confirm: '确定要移除背景图片吗？', removed: '背景图片已移除。', removeError: '移除背景图片时出错：'}
};
const keys = {settingsBackgroundImageSelect: 'select', settingsBackgroundImageHint: 'hint', settingsBackgroundImageRemove: 'remove',
    settingsBackgroundImageTypeInvalid: 'invalid', settingsBackgroundImageTooLarge: 'large', settingsBackgroundImageUploading: 'uploading',
    settingsBackgroundImageUploaded: 'uploaded', settingsBackgroundImageUploadErrorPrefix: 'uploadError',
    settingsBackgroundImageRemoveConfirm: 'confirm', settingsBackgroundImageRemoved: 'removed', settingsBackgroundImageRemoveErrorPrefix: 'removeError'};
const staticControls = [
    ['span', 'class="upload-text"', 'settingsBackgroundImageSelect', 'select'],
    ['small', 'class="upload-hint"', 'settingsBackgroundImageHint', 'hint'],
    ['button', 'id="remove-bg-image"', 'settingsBackgroundImageRemove', 'remove']
];

async function page({locale = 'en', api = 'normal', missingKey, sync = false} = {}) {
    const document = createDocument(), queues = new Map(), timers = new Map(), events = new Map();
    const state = {stored: {}, writes: [], reads: [], decodes: [], confirms: [], errors: [], trace: [], allowRemove: true, error: null,
        decode: async value => { if (value === BROKEN) throw new Error('Synthetic corrupt image'); }};
    let timerId = 0;
    document.body.prepend = (...nodes) => document.body.append(...nodes);
    for (const [id, tag] of [['bg-type', 'select'], ['bg-color', 'input'], ['bg-color-text', 'input'],
        ['bg-image-upload', 'input'], ['bg-image-preview', 'div'], ['bg-preview-img', 'img'], ['bg-color-section', 'div'],
        ['bg-image-section', 'div'], ['bg-upload-area', 'div'], ['quote-text', 'input'], ['toast-container', 'div'],
        ['category-manage-list', 'ul'], ['add-category', 'button'], ['hour12-format', 'input'], ['show-seconds', 'input']]) {
        const node = document.createElement(tag); node.id = id; document.body.append(node);
    }
    const field = id => document.getElementById(id);
    field('bg-color').value = field('bg-color-text').value = '#112233'; field('bg-image-upload').type = 'file';
    for (const [tag, className] of [['button', 'tab-button'], ['div', 'tab-panel']]) {
        const node = document.createElement(tag); node.className = className; node.dataset.tab = 'general'; document.body.append(node);
    }
    const outside = document.createElement('span'); outside.setAttribute('data-i18n', 'syntheticMissingOutsideScope');
    outside.dataset.i18n = 'syntheticMissingOutsideScope'; outside.textContent = 'Unrelated initial label'; document.body.append(outside);
    // Read the three real HTML elements, including their actual localization
    // attributes; do not fabricate the keys in the fixture.
    for (const [tag, marker] of staticControls) {
        const match = source.match(new RegExp(`<${tag}\\b([^>]*${marker}[^>]*)>([^<]*)<\\/${tag}>`));
        assert(match, marker);
        const node = document.createElement(tag); node.textContent = match[2];
        for (const [, name, value] of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) {
            node.setAttribute(name, value);
            if (name === 'id' || name === 'type') node[name] = value;
            if (name === 'class') node.className = value;
            if (name.startsWith('data-')) node.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
        }
        (tag === 'button' ? document.body : field('bg-upload-area')).append(node);
    }
    const chrome = {storage: {local: {
        async get(keys) { return clone(keys === null ? state.stored : Object.fromEntries(keys.filter(key => key in state.stored).map(key => [key, state.stored[key]]))); },
        async set(values) {
            if (state.error && !state.error.afterCommit) throw state.error;
            state.writes.push(clone(values)); Object.assign(state.stored, clone(values)); state.trace.push('local-write');
            if (state.error) throw state.error;
        },
        async getBytesInUse() { return JSON.stringify(state.stored).length; }
    }}, i18n: {
        getMessage(key) {
            if (api === 'throw') throw new Error('Synthetic catalog unavailable');
            if (api === 'missing' || key === missingKey) return '';
            if (api === 'key') return key;
            return (catalogs[locale] || catalogs.en)[key]?.message || '';
        }, getUILanguage: () => locale === 'zh_CN' ? 'en-US' : 'zh-CN'
    }};
    if (sync) chrome.storage.sync = {async getBytesInUse() { return 0; }};
    if (api === 'absent') delete chrome.i18n;
    const context = vm.createContext({document, chrome, URL, crypto: require('node:crypto').webcrypto,
        console: {log() {}, warn(...values) { state.errors.push(values.map(value => value?.stack || String(value)).join(' ')); }, error(...values) { state.errors.push(values.map(value => value?.stack || String(value)).join(' ')); }},
        navigator: {locks: {request(name, operation) { const result = (queues.get(name) || Promise.resolve()).then(operation); queues.set(name, result.catch(() => {})); return result; }}},
        confirm(text) { state.confirms.push(text); return state.allowRemove; },
        setTimeout(fn, delay) { timers.set(++timerId, {fn, delay}); if (delay === 900) state.trace.push('sync-scheduled'); return timerId; }, clearTimeout(id) { timers.delete(id); },
        addEventListener(type, fn) { events.set(type, fn); }, location: {reload() { throw new Error('Unexpected reload'); }},
        FileReader: class { readAsDataURL(value) { state.reads.push(value.name); Promise.resolve(value.data).then(data => { this.result = data; this.onload(); }, error => this.onerror(error)); } },
        Image: class { async decode() { state.decodes.push(this.src); state.trace.push('decode-start'); await state.decode(this.src); state.trace.push('decode-complete'); } }
    });
    context.window = context;
    for (const path of ['shared/layout-identity.js', 'shared/world-clocks.js', 'shared/stored-shortcut-url.js', 'shared/dashboard-template-registry.js', 'shared/configuration-codec.js', 'storage.js']) {
        path === 'storage.js' ? require('./helpers/standalone-storage-model')(context) : vm.runInContext(fs.readFileSync(path, 'utf8'), context);
    }
    Object.assign(state.stored, clone(context.storageManager.cloneDefaultConfig()), {bg: {type: 'image', value: OLD},
        quote: 'User $& quoted 中文', categories: [{id: 'synthetic', name: 'Saved $1 中文', icon: '★'}],
        links: [{title: 'Synthetic content', url: 'https://example.com', category: 'synthetic', icon: '🌐'}],
        __localItabPersonalTasksV1: {synthetic: 'private sentinel'}, __localItabRestoreRecovery: {synthetic: 'recovery sentinel'}});
    state.stored.sync.enabled = sync;
    context.storageManager._syncInitialized = true;
    if (api !== 'no-helper') vm.runInContext(fs.readFileSync('i18n.js', 'utf8'), context);
    context.LocalItabSettingsSearch = {mount() {
        state.searchLabels = [field('bg-upload-area').querySelector('span').textContent,
            field('bg-upload-area').querySelector('small').textContent, field('remove-bg-image').textContent];
    }};
    vm.runInContext(fs.readFileSync('options.js', 'utf8'), context);
    await document.listeners.get('DOMContentLoaded')();
    vm.runInContext(fs.readFileSync('shared/local-content-lifecycle.js', 'utf8'), context);
    const settle = () => vm.runInContext('settingsSaveQueue', context);
    const messages = () => field('toast-container').children.map(node => ({text: node.textContent,
        type: [...node._classes].find(value => value.startsWith('message-')).slice(8), role: node.getAttribute('role')}));
    assert.deepEqual(messages(), [], 'actual initialization finishes without an error message: ' + state.errors.join('\n'));
    assert(vm.runInContext('settingsBaseline && settingsFormBaseline', context), state.errors.join('\n'));
    assert.equal(state.writes.length, 0, 'initialization is read-only');
    return {state, context, document, field, messages, settle, outside,
        choose(value) { field('bg-image-upload').value = value?.name || ''; field('bg-image-upload').files = value ? [value] : []; field('bg-image-upload').dispatch('change'); return settle(); },
        drop(value) { field('bg-upload-area').dispatch('drop', {dataTransfer: {files: [value]}}); return settle(); },
        remove() { field('remove-bg-image').dispatch('click'); return settle(); },
        color() { field('bg-type').value = 'color'; field('bg-color').value = '#abcdef'; field('bg-type').dispatch('change'); return settle(); },
        beforeunload() { const event = {prevented: false, preventDefault() { this.prevented = true; }}; events.get('beforeunload')(event); return event; }};
}
const bounded = (name, fn) => test(name, {timeout: 8000}, fn);
const last = p => p.messages().at(-1);
function staticText(p, expected) {
    for (const [tag, , key, word] of staticControls) {
        const node = tag === 'button' ? p.field('remove-bg-image') : p.field('bg-upload-area').querySelector(tag);
        assert.equal(node.getAttribute('data-i18n'), key); assert.equal(node.textContent, expected[word]);
    }
    assert.equal(p.field('remove-bg-image').type, 'button');
    assert.deepEqual(p.state.searchLabels, [expected.select, expected.hint, expected.remove], 'search mounts after the final scoped control localization');
}
function untouched(p, before) { assert.deepEqual({...clone(p.state.stored), bg: before.bg}, before); }
function protectedDraft(p) {
    assert.equal(p.field('quote-text').value, 'Draft $& 中文');
    assert(p.context.settingsHasUncommittedWork()); assert(p.context.LocalItabContentLifecycle.hasUncommittedWork()); assert(p.beforeunload().prevented);
}
function preservedImage(p) {
    assert.equal(p.state.stored.bg.value, OLD); assert.equal(p.field('bg-preview-img').src, OLD);
    assert.equal(p.field('bg-image-preview').style.display, 'block');
}

for (const locale of ['en', 'zh_CN', 'fr-FR']) bounded(`${locale}: real page initialization, decode-first upload and confirmed removal use the selected catalog`, async () => {
    const p = await page({locale}), expected = words[locale] || words.en, before = clone(p.state.stored);
    staticText(p, expected); preservedImage(p); p.field('quote-text').value = 'Draft $& 中文';
    const decode = deferred(); p.state.decode = () => decode.promise;
    const pending = p.choose(file()); await tick();
    assert.deepEqual(last(p), {text: expected.uploading, type: 'info', role: 'status'});
    assert.equal(p.state.writes.length, 0); preservedImage(p); protectedDraft(p);
    decode.resolve(); await pending;
    assert.deepEqual(last(p), {text: expected.uploaded, type: 'success', role: 'status'});
    assert.deepEqual(p.state.stored.bg, {type: 'image', value: GOOD}); assert.equal(p.field('bg-preview-img').src, GOOD);
    assert.deepEqual(p.state.reads, [file().name]); assert.equal(p.field('bg-image-upload').value, ''); untouched(p, before); protectedDraft(p);
    await p.remove(); assert.deepEqual(p.state.confirms, [expected.confirm]);
    assert.deepEqual(last(p), {text: expected.removed, type: 'success', role: 'status'});
    assert.deepEqual(p.state.stored.bg, {type: 'gradient', value: ''}); assert.equal(p.field('bg-type').value, 'gradient');
    assert.equal(p.field('bg-image-preview').style.display, 'none'); assert.equal(p.state.writes.length, 2); untouched(p, before); protectedDraft(p);
});

for (const api of ['missing', 'throw', 'absent', 'key', 'no-helper']) bounded(`${api}: only the scoped controls and feedback use readable English fallbacks`, async () => {
    const p = await page({locale: 'zh_CN', api}); staticText(p, words.en);
    assert.equal(p.outside.textContent, api === 'no-helper' ? 'Unrelated initial label' : 'syntheticMissingOutsideScope', 'unrelated DOM localization behavior is unchanged');
    await p.choose({...file(), type: 'image/svg+xml'}); assert.equal(last(p).text, words.en.invalid);
    await p.choose({...file(), size: 5 * 1024 * 1024 + 1}); assert.equal(last(p).text, words.en.large);
    await p.choose(file()); assert.equal(last(p).text, words.en.uploaded);
    assert(p.messages().some(message => message.text === words.en.uploading));
    const detail = 'Synthetic $& $1 $$ $` $\'\n<b>raw detail</b>';
    p.state.error = Object.assign(new Error(detail), {code: 'WORKSPACE_TEST_FAILURE'});
    await p.choose(file()); assert.equal(last(p).text, words.en.uploadError + ' ' + detail);
    await p.remove(); assert.equal(p.state.confirms.at(-1), words.en.confirm); assert.equal(last(p).text, words.en.removeError + ' ' + detail);
    assert.equal(p.field('toast-container').querySelectorAll('b').length, 0);
    p.state.error = null; await p.remove(); assert.equal(last(p).text, words.en.removed);
});

for (const key of ['settingsBackgroundImageSelect', 'settingsBackgroundImageHint', 'settingsBackgroundImageRemove']) {
    bounded(`one missing ${key} keeps the other Chinese controls translated`, async () => {
        const p = await page({locale: 'zh_CN', missingKey: key}); staticText(p, {...words.zh_CN, [keys[key]]: words.en[keys[key]]});
        await p.choose(file()); assert.equal(last(p).text, words.zh_CN.uploaded);
    });
}

for (const locale of ['en', 'zh_CN']) {
    bounded(`${locale}: invalid selection and picker cancellation do not read, write or change the prior background`, async () => {
        const p = await page({locale}), before = clone(p.state.stored); p.field('quote-text').value = 'Draft $& 中文';
        for (const [value, expected] of [[{...file(), type: 'image/svg+xml'}, words[locale].invalid], [{...file(), size: 5 * 1024 * 1024 + 1}, words[locale].large]]) {
            await p.choose(value); assert.deepEqual(last(p), {text: expected, type: 'error', role: 'alert'});
            assert.equal(p.field('bg-image-upload').value, ''); preservedImage(p); protectedDraft(p);
        }
        const count = p.messages().length; await p.choose(null); p.field('bg-image-upload').dispatch('cancel');
        p.state.allowRemove = false; await p.remove(); assert.deepEqual(p.state.confirms, [words[locale].confirm]);
        assert.equal(p.messages().length, count); assert.deepEqual(p.state.reads, []); assert.deepEqual(p.state.decodes, []);
        assert.equal(p.state.writes.length, 0); assert.deepEqual(p.state.stored, before); preservedImage(p); protectedDraft(p);
    });
    for (const entry of ['choose', 'drop']) bounded(`${locale}/${entry}: decode rejection keeps its existing dedicated notice and permits a later retry`, async () => {
        const p = await page({locale}), before = clone(p.state.stored); p.field('quote-text').value = 'Draft $& 中文';
        await p[entry](file(BROKEN));
        assert.deepEqual(last(p), {text: catalogs[locale].settingsBackgroundImageInvalid.message, type: 'error', role: 'alert'});
        assert.equal(p.state.writes.length, 0); preservedImage(p); protectedDraft(p); assert.equal(p.field('bg-image-upload').value, '');
        await p[entry](file()); assert.equal(last(p).text, words[locale].uploaded); assert.equal(p.state.writes.length, 1); untouched(p, before); protectedDraft(p);
    });
    for (const operation of ['choose', 'remove']) for (const afterCommit of [false, true]) bounded(`${locale}/${operation}: raw error details survive ${afterCommit ? 'uncertain write acknowledgement' : 'write rejection'} without a rollback claim`, async () => {
        const p = await page({locale}), before = clone(p.state.stored), detail = 'Synthetic $& $1 $$ $` $\'\n<img src=x onerror=alert(1)> 中文';
        p.field('quote-text').value = 'Draft $& 中文';
        p.state.error = Object.assign(new Error(detail), {code: 'WORKSPACE_TEST_FAILURE', afterCommit});
        await p[operation](file());
        assert.deepEqual(last(p), {text: words[locale][operation === 'choose' ? 'uploadError' : 'removeError'] + ' ' + detail, type: 'error', role: 'alert'});
        assert.equal(p.field('toast-container').querySelectorAll('img').length, 0); assert.equal(p.state.writes.length, Number(afterCommit));
        assert.equal(p.field('bg-preview-img').src, OLD); assert.equal(p.field('bg-image-upload').value, '');
        assert(!p.messages().some(message => message.type === 'success')); untouched(p, before); protectedDraft(p);
        if (afterCommit) assert.deepEqual(p.state.stored.bg, {type: operation === 'choose' ? 'image' : 'gradient', value: operation === 'choose' ? GOOD : ''});
        else preservedImage(p);
    });
    for (const operation of ['choose', 'remove']) bounded(`${locale}/${operation}: real failed-save result is localized and a retry still works`, async () => {
        const p = await page({locale}); p.field('quote-text').value = 'Draft $& 中文'; p.state.error = new Error('Synthetic ordinary failure');
        await p[operation](file());
        assert.equal(last(p).text, words[locale][operation === 'choose' ? 'uploadError' : 'removeError'] + ' ' + catalogs[locale].failedToSave.message);
        assert.equal(p.state.writes.length, 0); preservedImage(p); protectedDraft(p);
        p.state.error = null; await p[operation](file()); assert.equal(last(p).type, 'success'); protectedDraft(p);
    });
    for (const operation of ['choose', 'remove']) for (const failure of ['conflict', 'baseline', 'lock']) bounded(`${locale}/${operation}: existing ${failure} refusal uses its dedicated notice and never overwrites saved state`, async () => {
        const p = await page({locale}); p.field('quote-text').value = 'Draft $& 中文';
        if (failure === 'conflict') p.state.stored.bg = {type: 'color', value: '#abcdef'};
        if (failure === 'baseline') vm.runInContext('settingsBaseline = null', p.context);
        if (failure === 'lock') delete p.context.navigator.locks;
        const before = clone(p.state.stored); await p[operation](file()); await p[operation](file());
        const key = operation === 'choose' ? 'settingsImageSaveConflict' : failure === 'conflict' ? 'settingsSaveConflict' : failure === 'baseline' ? 'settingsBaselineUnavailable' : 'settingsLockUnavailable';
        assert.deepEqual(last(p), {text: catalogs[locale][key].message, type: 'error', role: 'alert'});
        assert.deepEqual(p.state.stored, before); assert.equal(p.state.writes.length, 0); assert.equal(p.field('bg-preview-img').src, OLD); protectedDraft(p);
    });
}

for (const type of ['image/jpeg', 'image/png', 'image/gif', 'image/webp']) bounded(`Chinese ${type} at exactly 5 MiB still reads, decodes and saves`, async () => {
    const p = await page({locale: 'zh_CN'}); await p.choose({...file(), type, size: 5 * 1024 * 1024});
    assert.deepEqual(p.state.decodes, [GOOD]); assert.equal(p.state.writes.length, 1); assert.equal(last(p).text, words.zh_CN.uploaded);
});

for (const next of ['choose', 'remove', 'color']) for (const result of ['resolve', 'reject']) bounded(`Chinese newer ${next} owns the outcome of the older ${result} decode`, async () => {
    const p = await page({locale: 'zh_CN'}), decode = deferred(); let first = true;
    p.field('quote-text').value = 'Draft $& 中文'; p.state.decode = () => { if (first) { first = false; return decode.promise; } return Promise.resolve(); };
    const earlier = p.choose(file(GOOD, 'Earlier.png')); await tick(); const newer = p[next](file(GOOD, 'Newer.png')); const count = p.messages().length;
    decode[result](result === 'reject' ? new Error('Late synthetic decode error') : undefined); await Promise.all([earlier, newer]);
    assert.equal(p.state.writes.length, 1); assert.equal(p.state.stored.bg.type, next === 'choose' ? 'image' : next === 'remove' ? 'gradient' : 'color');
    assert(!p.messages().slice(count).some(message => message.type === 'error'));
    assert.equal(p.messages().filter(message => message.type === 'success').length, next === 'color' ? 0 : 1);
    if (next !== 'color') assert.equal(last(p).text, next === 'choose' ? words.zh_CN.uploaded : words.zh_CN.removed);
    assert.equal(p.field('bg-image-upload').value, ''); protectedDraft(p);
});

for (const cancellation of ['empty', 'native', 'remove']) bounded(`Chinese ${cancellation} cancellation retains an accepted pending upload`, async () => {
    const p = await page({locale: 'zh_CN'}), decode = deferred(); p.state.decode = () => decode.promise;
    const pending = p.choose(file()); await tick();
    if (cancellation === 'empty') p.choose(null);
    if (cancellation === 'native') p.field('bg-image-upload').dispatch('cancel');
    if (cancellation === 'remove') { p.state.allowRemove = false; p.remove(); }
    decode.resolve(); await pending;
    assert.equal(p.state.writes.length, 1); assert.equal(p.state.stored.bg.value, GOOD); assert.equal(last(p).text, words.zh_CN.uploaded);
});

for (const locale of ['en', 'zh_CN']) bounded(`${locale}: file-read rejection retains its raw detail and does not start decoding`, async () => {
    const p = await page({locale}), read = deferred(), detail = 'Synthetic read $& $1\n<b>failure</b>';
    p.field('quote-text').value = 'Draft $& 中文';
    const pending = p.choose(file(read.promise)); await tick(); read.reject(new Error(detail)); await pending;
    assert.deepEqual(last(p), {text: words[locale].uploadError + ' ' + detail, type: 'error', role: 'alert'});
    assert.deepEqual(p.state.decodes, []); assert.equal(p.state.writes.length, 0); assert.equal(p.field('bg-image-upload').value, '');
    assert.equal(p.field('toast-container').querySelectorAll('b').length, 0); preservedImage(p); protectedDraft(p);
});

for (const result of ['resolve', 'reject']) bounded(`Chinese newer unsaved color draft survives an older ${result} decode`, async () => {
    const p = await page({locale: 'zh_CN'}), decode = deferred(); p.state.decode = () => decode.promise;
    p.field('quote-text').value = 'Draft $& 中文'; const pending = p.choose(file()); await tick();
    p.field('bg-color-text').value = '#partial'; decode[result](result === 'reject' ? new Error('Synthetic decode rejection') : undefined); await pending;
    assert.equal(p.field('bg-color-text').value, '#partial'); assert.equal(p.field('bg-preview-img').src, OLD); protectedDraft(p);
    assert.equal(p.state.writes.length, result === 'resolve' ? 1 : 0);
    assert.equal(last(p).text, result === 'resolve' ? words.zh_CN.uploaded : catalogs.zh_CN.settingsBackgroundImageInvalid.message);
    assert.equal(p.state.stored.bg.value, result === 'resolve' ? GOOD : OLD, 'UI ownership does not imply rollback of a completed save');
});

for (const operation of ['choose', 'remove']) bounded(`Chinese ${operation} retains local-write-before-enabled-Sync scheduling`, async () => {
    const p = await page({locale: 'zh_CN', sync: true});
    if (operation === 'choose') {
        const decode = deferred(); p.state.decode = () => decode.promise;
        const pending = p.choose(file()); await tick(); assert.deepEqual(p.state.trace, ['decode-start']);
        decode.resolve(); await pending;
        assert.deepEqual(p.state.trace, ['decode-start', 'decode-complete', 'local-write', 'sync-scheduled']);
    } else {
        await p.remove(); assert.deepEqual(p.state.trace, ['local-write', 'sync-scheduled']);
    }
    assert.equal(last(p).type, 'success');
    assert.equal(p.state.stored.sync.enabled, true);
});

bounded('both catalogs have exactly the scoped messages without error-detail substitutions', () => {
    for (const [key, word] of Object.entries(keys)) for (const locale of ['en', 'zh_CN']) {
        assert.equal(catalogs[locale][key]?.message, words[locale][word], `${locale}/${key}`); assert(!catalogs[locale][key].placeholders);
    }
    assert.match(source, /id="bg-image-upload"[^>]*accept="image\/jpeg,image\/png,image\/gif,image\/webp"/);
});
