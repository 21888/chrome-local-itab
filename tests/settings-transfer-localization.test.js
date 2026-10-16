'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const {fixture, withGlobals, storageFor, seed, DEFER, clone} = require('./helpers/complete-import-receipt-fixture');

// Memory-only integration: actual Options DOM-ready, bound transfer buttons,
// i18n, feedback/toasts, StorageManager validation/recovery/receipt and reload
// guard. Native file pickers, confirm UI and download completion are not modeled.
const source = fs.readFileSync('options.js', 'utf8');
const html = fs.readFileSync('options.html', 'utf8');
const catalogs = Object.fromEntries(['en', 'zh_CN'].map(locale => [locale,
    JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'))]));
const MiB = 1024 * 1024;
const literal = 'Exact $& $1 $$ $` $\'\n<img src=x onerror=alert(1)> 中文';
const words = {
    en: {
        settingsTransferExportLabel: 'EXPORT',
        settingsTransferImportLabel: 'IMPORT',
        settingsTransferFileSizeLabel: 'File size:',
        settingsTransferItemsLabel: 'items',
        settingsExportPreparing: 'Preparing export...',
        settingsExportLargeConfirm: 'Export file is large ($1 KB). This may be due to images. Continue?',
        settingsExportCancelled: 'Export cancelled by user',
        settingsExportFailed: 'Export failed',
        settingsExportQuotaExceeded: 'Export failed: Storage quota exceeded',
        settingsExportMemoryInsufficient: 'Export failed: Not enough memory (try removing large images)',
        settingsExportFailedPrefix: 'Export failed:',
        settingsImportNoFile: 'No file selected for import',
        settingsImportJSONRequired: 'Please select a valid JSON file',
        settingsImportProcessingPrefix: 'Processing file:',
        settingsImportReplacePreview: 'Import will replace all settings with:',
        settingsImportShortcutsPreview: '• $1 shortcuts',
        settingsImportHotTopicsPreview: '• $1 hot topics',
        settingsImportBackgroundPreview: '• Background image',
        settingsImportMoviePreview: '• Movie poster',
        settingsImportCancelled: 'Import cancelled by user',
        settingsImportSucceeded: 'Settings imported. Reloading page...',
        settingsImportFailed: 'Import failed',
        settingsImportFailedPrefix: 'Import failed:',
        settingsImportStorageInsufficient: 'Import failed: Not enough storage space',
        settingsImportFormatUnrecognized: 'Import failed: File format not recognized'
    },
    zh_CN: {
        settingsTransferExportLabel: '导出',
        settingsTransferImportLabel: '导入',
        settingsTransferFileSizeLabel: '文件大小：',
        settingsTransferItemsLabel: '项',
        settingsExportPreparing: '正在准备导出…',
        settingsExportLargeConfirm: '导出文件较大（$1 KB），可能包含较多图片。是否继续？',
        settingsExportCancelled: '已取消导出',
        settingsExportFailed: '导出失败',
        settingsExportQuotaExceeded: '导出失败：存储配额已超出',
        settingsExportMemoryInsufficient: '导出失败：内存不足（请尝试移除较大的图片）',
        settingsExportFailedPrefix: '导出失败：',
        settingsImportNoFile: '未选择要导入的文件',
        settingsImportJSONRequired: '请选择有效的 JSON 文件',
        settingsImportProcessingPrefix: '正在处理文件：',
        settingsImportReplacePreview: '导入将替换所有设置，包含：',
        settingsImportShortcutsPreview: '• $1 个快捷方式',
        settingsImportHotTopicsPreview: '• $1 条热榜条目',
        settingsImportBackgroundPreview: '• 背景图片',
        settingsImportMoviePreview: '• 电影海报',
        settingsImportCancelled: '已取消导入',
        settingsImportSucceeded: '设置已导入，正在重新加载页面…',
        settingsImportFailed: '导入失败',
        settingsImportFailedPrefix: '导入失败：',
        settingsImportStorageInsufficient: '导入失败：存储空间不足',
        settingsImportFormatUnrecognized: '导入失败：无法识别文件格式'
    }
};
const expected = (locale, key, values = []) => (words[locale] || words.en)[key].replace(/\$(\d+)/g, (_, n) => String(values[n - 1]));
const message = (locale, key, values = []) => {
    const entry = (catalogs[locale] || catalogs.en)[key];
    return entry?.message.replace(/\$([A-Z_]+)\$/gi, (_, name) => {
        const position = entry.placeholders[name.toLowerCase()].content.match(/^\$(\d+)$/)[1];
        return String(values[position - 1]);
    });
};
const last = p => p.state.feedback.at(-1);
const inputValue = 'C:\\synthetic\\backup.json';
function initial() {
    const raw = seed();
    raw.quote = 'Saved synthetic quote';
    raw.links = [{title: 'Saved synthetic site', url: 'https://example.com/', icon: '🌐', category: 'work'}];
    for (const key of ['__localItabPersonalTasksV1', '__localItabFocusV1', '__localItabScratchpadV1', '__localItabCountdownV1', '__syntheticGlobalAILibrary']) raw[key] = {synthetic: key};
    return raw;
}
async function page(f, {locale = 'en', api = 'normal', missingKey} = {}) {
    const document = createDocument(), timers = new Map(), events = new Map();
    const state = {feedback: [], confirms: [], decisions: [], blobs: [], clicks: [], revoked: [], errors: [],
        reads: 0, pickers: 0, reloads: 0, downloadFailure: null, confirmHook: null};
    let timerId = 0;
    document.body.prepend = (...nodes) => document.body.append(...nodes);
    const field = id => document.getElementById(id);
    for (const id of ['quote-text', 'hour12-format', 'show-seconds', 'bg-type', 'bg-color', 'bg-color-text',
        'movie-title', 'movie-note', 'hot-topics-tab', 'show-clock', 'show-search', 'show-shortcuts', 'show-weather', 'show-hot', 'show-movie']) {
        const node = document.createElement('input'); node.id = id; document.body.append(node);
    }
    for (const [id, tag] of [['toast-container', 'div'], ['category-manage-list', 'ul'], ['add-category', 'button'],
        ['baidu-list', 'div'], ['weibo-list', 'div'], ['zhihu-list', 'div']]) {
        const node = document.createElement(tag); node.id = id; document.body.append(node);
    }
    // Use the actual entry tags and attributes from options.html, not substitute
    // controller entry points. Options initializes and binds these elements.
    for (const id of ['export-settings', 'import-settings', 'import-settings-btn']) {
        const match = html.match(new RegExp(`<([a-z]+)\\b([^>]*\\bid="${id}"[^>]*)>`));
        assert(match, `actual transfer entry ${id}`);
        const node = document.createElement(match[1]);
        for (const [, key, value] of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) {
            node.setAttribute(key, value);
            if (['id', 'type', 'class'].includes(key)) node[key === 'class' ? 'className' : key] = value;
        }
        document.body.append(node);
    }
    field('import-settings').click = () => { state.pickers++; };
    const create = document.createElement.bind(document);
    document.createElement = tag => {
        if (tag === 'a' && state.downloadFailure === 'create') throw new Error(literal);
        const node = create(tag);
        if (tag === 'a') node.click = () => {
            if (state.downloadFailure === 'click') throw new Error(literal);
            state.clicks.push({href: node.href, filename: node.download});
        };
        return node;
    };
    f.chrome.i18n = {
        getMessage(key, values = []) {
            if (api === 'throw') throw new Error('Synthetic catalog failure');
            if (api === 'missing' || key === missingKey) return '';
            if (api === 'key') return key;
            return message(locale, key, values) || '';
        },
        getUILanguage: () => locale === 'zh_CN' ? 'en-US' : 'zh-CN'
    };
    if (api === 'absent') delete f.chrome.i18n;
    f.chrome.storage.sync.getBytesInUse = async () => 0;
    const storage = storageFor(f);
    const context = vm.createContext({document, storageManager: storage, chrome: f.chrome, Blob,
        URL: class extends URL {
            static createObjectURL(blob) {
                if (state.downloadFailure === 'url') throw new Error(literal);
                state.blobs.push(blob); return `blob:synthetic-${state.blobs.length}`;
            }
            static revokeObjectURL(url) { state.revoked.push(url); }
        },
        console: {
            log(label, text, details) { const match = String(label).match(/^(import|export) (info|error|success):$/); if (match) state.feedback.push({operation: match[1], status: match[2], text, details: clone(details)}); },
            error(...values) { state.errors.push(values); }, warn() {}
        },
        confirm(text) {
            state.confirms.push(text); state.confirmHook?.(text);
            return state.decisions.length ? state.decisions.shift() : true;
        },
        setTimeout(fn, delay) { timers.set(++timerId, {fn, delay}); return timerId; }, clearTimeout(id) { timers.delete(id); },
        addEventListener(type, fn) { events.set(type, fn); }, removeEventListener(type) { events.delete(type); },
        location: {reload() { state.reloads++; }}
    });
    context.window = context;
    if (api !== 'no-helper') vm.runInContext(fs.readFileSync('i18n.js', 'utf8'), context);
    vm.runInContext(source, context);
    await document.listeners.get('DOMContentLoaded')();
    vm.runInContext(fs.readFileSync('shared/local-content-lifecycle.js', 'utf8'), context);
    assert.equal(field('toast-container').children.length, 0, 'actual initialization: ' + state.errors.map(String));
    assert(vm.runInContext('settingsBaseline && settingsFormBaseline', context));
    assert.equal(f.writes.length, 0, 'initialization never rewrites saved configuration');
    const fire = async (id, type, fields = {}) => {
        const node = field(id), handlers = node.listeners.get(type);
        assert(handlers?.length, `actual bound ${id}/${type}`);
        for (const handler of handlers) await handler({target: node, ...fields});
    };
    const file = (value, {name = literal + '.JSON', size, error, gate} = {}) => {
        const text = typeof value === 'string' ? value : JSON.stringify(value);
        return {name, size: size ?? Buffer.byteLength(text), async text() {
            state.reads++; if (gate) { gate.entered.resolve(); await gate.resume.promise; } if (error) throw new Error(error); return text;
        }};
    };
    return {f, storage, context, state, timers, document, field, fire, file,
        async export() { await fire('export-settings', 'click'); },
        async import(file) { field('import-settings').files = file ? [file] : []; field('import-settings').value = inputValue; await fire('import-settings', 'change'); },
        runTimers(delay) { for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.fn(); } },
        timerCount: delay => [...timers.values()].filter(timer => timer.delay === delay).length,
        toast: () => field('toast-container').children.at(-1)
    };
}
function check(name, options, action) {
    test(name, {timeout: 10000}, async () => {
        const f = fixture(initial());
        await withGlobals(f, async () => {
            const p = await page(f, options); await action(p);
            assert.deepEqual(f.providers, [], 'no provider/network/permission access');
        });
    });
}
function incoming(p, {assets = true} = {}) {
    const data = p.storage.cloneDefaultConfig();
    data.quote = 'Incoming $& $1 中文';
    data.links = [{title: literal, url: 'https://example.test/', icon: '★', category: 'work'}];
    data.hot = {tab: 'baidu', baidu: [{t: 'Synthetic 1', s: 1}], weibo: [{t: 'Synthetic 2', s: 2}], zhihu: [{t: 'Synthetic 3', s: 3}]};
    if (assets) { data.bg = {type: 'image', value: 'data:image/png;base64,QUJD'}; data.movie.poster = 'data:image/png;base64,REVG'; }
    return p.storage.buildManualExportPayload(data, {exportDate: '2026-10-16T00:00:00.000Z'});
}
function preview(locale, assets = true, count = 1) {
    return [expected(locale, 'settingsImportReplacePreview'), expected(locale, 'settingsImportShortcutsPreview', [count]),
        expected(locale, 'settingsImportHotTopicsPreview', [3]), ...(assets ? [expected(locale, 'settingsImportBackgroundPreview'), expected(locale, 'settingsImportMoviePreview')] : []),
        '', message(locale, 'restoreRecoveryConfirm')].join('\n');
}
function noImport(p, before) {
    assert.deepEqual(p.f.raw, before); assert.equal(p.f.writes.length, 0);
    assert.equal(p.timerCount(1500), 0); assert.equal(p.state.reloads, 0);
    assert.equal(p.field('import-settings').value, '');
    assert(!p.state.feedback.some(item => item.status === 'success'));
}
test.describe('Settings JSON transfer localization (RAM integration)', () => {
for (const locale of ['en', 'zh_CN', 'fr-FR']) check(`${locale}: actual transfer controls, raw filename and ordered preview localize without saving on cancellation`, {locale}, async p => {
    const before = clone(p.f.raw);
    await p.fire('import-settings-btn', 'click', {detail: 1}); assert.equal(p.state.pickers, 1); assert.equal(p.state.reads, 0);
    p.state.decisions = [false]; await p.import(p.file(incoming(p)));
    assert.equal(p.state.feedback[0].text, expected(locale, 'settingsImportProcessingPrefix') + ' ' + literal + '.JSON');
    assert.equal(p.state.confirms[0], preview(locale));
    assert.equal(last(p).text, expected(locale, 'settingsImportCancelled'));
    assert.equal(p.document.querySelectorAll('img').length, 0); noImport(p, before);
    await p.export(); assert.equal(p.state.feedback.at(-2).text, expected(locale, 'settingsExportPreparing'));
    assert.equal(last(p).text, message(locale, 'settingsExportRequested')); assert.equal(last(p).status, 'info');
    assert.match(p.state.clicks[0].filename, /^local-itab-settings-\d{4}-\d\d-\d\d\.json$/);
    assert.equal(p.timerCount(60000), 1); assert.equal(p.state.revoked.length, 0);
    const feedback = clone(p.state.feedback); p.runTimers(60000); assert.deepEqual(p.state.revoked, ['blob:synthetic-1']);
    assert.deepEqual(p.state.feedback, feedback, 'URL cleanup must not claim download completion');
    assert.deepEqual(p.f.raw, before);
});

async function wordingFlow(p, locale) {
    const before = clone(p.f.raw);
    await p.import(); assert.equal(last(p).text, expected(locale, 'settingsImportNoFile'));
    await p.import(p.file('{}', {name: 'synthetic.txt'})); assert.equal(last(p).text, expected(locale, 'settingsImportJSONRequired'));
    assert.equal(p.state.reads, 0);
    for (const [detail, key] of [[literal, null], ['JSON quota ' + literal, null], ['quota ' + literal, 'settingsImportStorageInsufficient'], ['Invalid settings ' + literal, 'settingsImportFormatUnrecognized']]) {
        await p.import(p.file('{}', {error: detail}));
        assert.equal(last(p).text, key ? expected(locale, key) : expected(locale, 'settingsImportFailedPrefix') + ' ' + detail);
        assert.equal(p.toast().getAttribute('role'), 'alert');
    }
    for (const [detail, key] of [[literal, null], ['quota ' + literal, 'settingsExportQuotaExceeded'], ['memory ' + literal, 'settingsExportMemoryInsufficient']]) {
        p.f.hooks.get = () => { throw new Error(detail); };
        await p.export();
        assert.equal(p.state.feedback.at(-2).text, expected(locale, 'settingsExportPreparing'));
        assert.equal(last(p).text, key ? expected(locale, key) : expected(locale, 'settingsExportFailedPrefix') + ' ' + detail);
        p.f.hooks.get = null;
    }
    p.f.raw.bg = {type: 'image', value: 'data:image/png;base64,' + 'A'.repeat(5 * MiB)};
    const exportSize = new Blob([JSON.stringify(p.storage.buildManualExportPayload(await p.storage.getAllForBackup()), null, 2)]).size;
    p.state.decisions = [false]; await p.export();
    assert.equal(p.state.confirms.at(-1), expected(locale, 'settingsExportLargeConfirm', [(exportSize / 1024).toFixed(1)]));
    assert.equal(last(p).text, expected(locale, 'settingsExportCancelled'));
    assert.equal(p.state.clicks.length, 0); assert.equal(p.state.blobs.length, 0); assert.equal(p.timerCount(60000), 0);
    p.f.raw.bg = clone(before.bg);
    p.state.decisions = [false]; await p.import(p.file(incoming(p)));
    assert.equal(p.state.confirms.at(-1), preview(locale)); assert.equal(last(p).text, expected(locale, 'settingsImportCancelled'));
    noImport(p, before);
    await p.import(p.file(incoming(p)));
    assert.equal(last(p).text, expected(locale, 'settingsImportSucceeded'));
    assert.equal(last(p).status, 'success'); assert.equal(p.toast().getAttribute('role'), 'status');
    assert.equal(p.state.feedback.find(item => item.text.endsWith(literal + '.JSON')).text, expected(locale, 'settingsImportProcessingPrefix') + ' ' + literal + '.JSON');
    assert.equal(p.f.writes.length, 2); assert.equal(p.timerCount(1500), 1);
    assert.equal(p.f.raw[p.storage.restoreReceiptKey].status, 'verified');
    assert.equal(p.document.querySelectorAll('img').length, 0, 'filenames and failure details stay plain text');
}
for (const locale of ['en', 'zh_CN', 'fr-FR']) check(`${locale}: every user-facing transfer branch uses catalog wording and keeps raw diagnostic details`, {locale}, p => wordingFlow(p, locale));
for (const api of ['missing', 'throw', 'absent', 'key', 'no-helper']) check(`${api}: actual transfer flow falls back to English without corrupting raw filename or details`, {locale: 'zh_CN', api}, p => wordingFlow(p, 'en'));
for (const missingKey of Object.keys(words.en)) check(`missing ${missingKey}: isolated fallback preserves all other Chinese catalog entries`, {locale: 'zh_CN', missingKey}, p => {
    for (const key of Object.keys(words.en)) assert.equal(p.context.t(key, words.en[key], ['7']), expected(key === missingKey ? 'en' : 'zh_CN', key, ['7']));
});

for (const locale of ['en', 'zh_CN']) {
    for (const size of [10 * MiB - 1, 10 * MiB, 10 * MiB + 1]) check(`${locale}: import read-warning threshold ${size} keeps pre-read and pre-write cancellation ordering`, {locale}, async p => {
        const before = clone(p.f.raw), oversized = size > 10 * MiB;
        p.state.decisions = [false];
        p.state.confirmHook = () => { assert.equal(p.state.reads, Number(!oversized)); assert.equal(p.f.writes.length, 0); assert.deepEqual(p.f.raw, before); };
        await p.import(p.file(incoming(p), {size}));
        assert.equal(p.state.reads, Number(!oversized)); assert.equal(p.state.confirms.length, 1);
        assert.equal(p.state.confirms[0], oversized ? message(locale, 'largeLocalImportConfirm', ['10.0']) : preview(locale));
        assert.equal(last(p).text, oversized ? message(locale, 'localImportReadCancelled') : expected(locale, 'settingsImportCancelled'));
        noImport(p, before);
        if (oversized) {
            p.state.confirmHook = () => { assert.equal(p.state.reads, p.state.confirms.length === 2 ? 0 : 1); assert.equal(p.f.writes.length, 0); };
            p.state.decisions = [true, false]; await p.import(p.file(incoming(p), {size}));
            assert.deepEqual(p.state.confirms.slice(1), [message(locale, 'largeLocalImportConfirm', ['10.0']), preview(locale)]);
            assert.equal(p.state.reads, 1); noImport(p, before);
        }
    });
    for (const assets of [false, true]) check(`${locale}: successful ${assets ? 'asset' : 'plain'} import retains recovery, receipt, provider state and independent modules`, {locale}, async p => {
        const before = clone(p.f.raw), payload = incoming(p, {assets}), original = JSON.stringify(payload);
        const provider = {...before.sync, enabled: true, lastSync: 'Synthetic local provider marker'};
        p.state.confirmHook = text => {
            assert.equal(text, preview(locale, assets)); assert.equal(p.state.reads, 1); assert.equal(p.f.writes.length, 0);
            p.f.raw.sync = clone(provider); // A provider change between preview and commit belongs to this device.
        };
        await p.import(p.file(payload));
        assert.equal(JSON.stringify(payload), original); assert.equal(p.state.confirms.length, 1);
        for (const [key, value] of Object.entries(payload.data)) if (key !== 'sync') assert.deepEqual(p.f.raw[key], value, key);
        assert.deepEqual(p.f.raw.sync, provider);
        for (const key of Object.keys(before).filter(key => key.startsWith('__'))) assert.deepEqual(p.f.raw[key], before[key], key);
        const recovery = p.f.raw[p.storage.restoreRecoveryKey];
        assert.equal(recovery.reason, 'beforeRestore'); assert.deepEqual(recovery.payload.data.links, before.links); assert.deepEqual(recovery.payload.data.bg, before.bg);
        assert.deepEqual(recovery.providerState, provider); assert.equal(recovery.checksum, await p.storage.fingerprint(recovery.payload));
        assert.equal(p.f.writes.length, 2); assert.equal(p.f.writes[0][p.storage.restoreReceiptKey].status, 'pending');
        assert.deepEqual(Object.keys(p.f.writes[1]), [p.storage.restoreReceiptKey]); assert.equal(p.f.raw[p.storage.restoreReceiptKey].status, 'verified');
        await p.storage.verifyRestoreReceipt(p.f.raw, p.f.raw[p.storage.restoreReceiptKey]);
        assert.equal(last(p).text, expected(locale, 'settingsImportSucceeded')); assert.deepEqual(last(p).details, {recordCount: assets ? 6 : 4});
        assert.equal(p.field('import-settings').value, ''); assert.equal(p.timerCount(1500), 1); assert.equal(p.state.reloads, 0);
        p.runTimers(1500); assert.equal(p.state.reloads, 1);
    });
    check(`${locale}: successful import's delayed reload still protects a newly opened local draft`, {locale}, async p => {
        await p.import(p.file(incoming(p)));
        p.context.localScratchpadSettingsView = {hasUncommittedWork: () => true, controller: {pending: false}};
        p.runTimers(1500); assert.equal(p.state.reloads, 0);
        assert.equal(p.field('local-content-reload-notice').getAttribute('role'), 'status');
        assert.equal(p.state.confirms.length, 1, 'no automatic second prompt');
        assert.equal(p.f.raw[p.storage.restoreReceiptKey].status, 'verified');
    });
    check(`${locale}: malformed JSON, unsupported data and corrupt identities never reach replacement confirmation`, {locale}, async p => {
        const before = clone(p.f.raw);
        for (const value of ['{malformed JSON', {unrelated: true}, {version: '1.0', schemaVersion: 2, data: {links: [{title: 'Bad identity', url: 'https://example.test/', layoutId: 'invalid'}]}}]) {
            await p.import(p.file(value)); assert.equal(last(p).status, 'error'); assert.equal(p.state.confirms.length, 0); noImport(p, before);
        }
        assert(p.state.feedback.some(item => item.text.startsWith(expected(locale, 'settingsImportFailedPrefix') + ' Invalid JSON format:')));
    });
    check(`${locale}: error classification preserves case, JSON precedence, quota precedence and literal generic details`, {locale}, async p => {
        const before = clone(p.f.raw);
        for (const [detail, key] of [
            ['JSON quota Invalid settings ' + literal, null], ['quota Invalid settings ' + literal, 'settingsImportStorageInsufficient'],
            ['json QUOTA invalid settings ' + literal, null], ['memory ' + literal, null]
        ]) {
            await p.import(p.file('{}', {error: detail}));
            assert.equal(last(p).text, key ? expected(locale, key) : expected(locale, 'settingsImportFailedPrefix') + ' ' + detail); noImport(p, before);
        }
        for (const [detail, key] of [['quota memory ' + literal, 'settingsExportQuotaExceeded'], ['QUOTA MEMORY ' + literal, null]]) {
            p.f.hooks.get = () => { throw new Error(detail); }; await p.export(); p.f.hooks.get = null;
            assert.equal(last(p).text, key ? expected(locale, key) : expected(locale, 'settingsExportFailedPrefix') + ' ' + detail);
            assert.equal(p.state.clicks.length, 0); assert.equal(p.state.blobs.length, 0); assert.deepEqual(p.f.raw, before);
        }
    });
    check(`${locale}: rejected replacement keeps the original internal save-error text and never schedules reload`, {locale}, async p => {
        const before = clone(p.f.raw);
        p.f.hooks.get = keys => { if (keys === null) throw new Error('Synthetic pre-write read failure'); return DEFER; };
        await p.import(p.file(incoming(p))); p.f.hooks.get = null;
        assert.equal(last(p).text, expected(locale, 'settingsImportFailedPrefix') + ' Failed to save imported settings to storage');
        assert.equal(p.state.confirms.length, 1); noImport(p, before);
    });
    check(`${locale}: committed but unverified import retains pending receipt/recovery; same-file retry verifies without a second replacement`, {locale}, async p => {
        const before = clone(p.f.raw), payload = incoming(p); let submitted = false;
        p.f.hooks.set = values => { if (values[p.storage.restoreReceiptKey]?.status === 'pending') submitted = true; return DEFER; };
        p.f.hooks.get = keys => { if (submitted && (keys === null || keys?.includes(p.storage.restoreReceiptKey))) throw new Error(literal); return DEFER; };
        await p.import(p.file(payload)); p.f.hooks.get = p.f.hooks.set = null;
        assert.equal(last(p).status, 'error'); assert(last(p).text.startsWith(expected(locale, 'settingsImportFailedPrefix') + ' '));
        assert(last(p).text.endsWith(literal)); assert.equal(p.f.raw[p.storage.restoreReceiptKey].status, 'pending');
        assert.equal(p.f.raw.quote, payload.data.quote); assert.equal(p.timerCount(1500), 0);
        const recovery = clone(p.f.raw[p.storage.restoreRecoveryKey]); assert.deepEqual(recovery.payload.data.links, before.links);
        assert.equal(p.f.writes.length, 1);
        await p.import(p.file(payload)); assert.equal(last(p).text, expected(locale, 'settingsImportSucceeded'));
        assert.equal(p.f.writes.length, 2); assert.deepEqual(Object.keys(p.f.writes[1]), [p.storage.restoreReceiptKey]);
        assert.equal(p.f.raw[p.storage.restoreReceiptKey].status, 'verified'); assert.deepEqual(p.f.raw[p.storage.restoreRecoveryKey], recovery);
    });
    check(`${locale}: unverified import followed by newer changes remains blocked and preserves exact original evidence`, {locale}, async p => {
        const payload = incoming(p); let submitted = false;
        p.f.hooks.set = values => { if (values[p.storage.restoreReceiptKey]?.status === 'pending') submitted = true; return DEFER; };
        p.f.hooks.get = keys => { if (submitted && (keys === null || keys?.includes(p.storage.restoreReceiptKey))) throw new Error('Synthetic readback unavailable'); return DEFER; };
        await p.import(p.file(payload)); p.f.hooks.get = p.f.hooks.set = null;
        p.f.raw.quote = 'Newer synthetic edit'; const beforeRetry = clone(p.f.raw), writes = p.f.writes.length;
        await p.import(p.file(payload)); assert.equal(last(p).status, 'error');
        assert.equal(last(p).text, expected(locale, 'settingsImportFailedPrefix') + ' ' + p.storage.restoreReceiptError('RESTORE_PENDING_CONFLICT').message);
        assert.equal(p.f.writes.length, writes); assert.deepEqual(p.f.raw, beforeRetry); assert.equal(p.timerCount(1500), 0);
    });
}

for (const locale of ['en', 'zh_CN']) for (const variant of ['schema1', 'schema2', 'stored-url']) check(`${locale}/${variant}: real export payload, record metadata and existing format guidance stay intact`, {locale}, async p => {
    if (variant !== 'schema1') {
        const id = 'l_00000000000000000000000000000001';
        p.f.raw.schemaVersion = 2; p.f.raw.links[0].layoutId = id;
        p.f.raw.layout.identityVersion = 1; p.f.raw.layout.positionsById = {[id]: {all: {x: 11.25, y: -3.5}}};
        if (variant === 'stored-url') { p.f.raw.links[0].url = 'example.com'; p.f.raw.layout.positions = {'all|example.com': {x: 9.25, y: 8.75}}; }
    }
    const before = clone(p.f.raw); await p.export();
    const data = JSON.parse(await p.state.blobs[0].text()), expectedPayload = p.storage.buildManualExportPayload(await p.storage.getAllForBackup(), {exportDate: data.exportDate});
    assert.deepEqual(data, expectedPayload); assert.deepEqual(data.itemCounts, {shortcuts: 1, categories: 5, hotTopics: 0, dataUrlIcons: 0, hasBackgroundImage: false, hasMoviePoster: false, localImagesIncluded: false});
    assert.deepEqual(last(p).details, {fileSize: p.state.blobs[0].size, recordCount: 1});
    const key = variant === 'stored-url' ? 'storedURLExported' : variant === 'schema2' ? 'identityExported' : 'settingsExportRequested';
    assert.equal(last(p).text, message(locale, key)); assert.equal(last(p).status, 'info');
    assert.equal(data.schemaVersion, variant === 'schema1' ? 1 : 2); assert.equal(data.version, variant === 'stored-url' ? '2.0' : '1.0');
    assert(!Object.keys(data.data).some(key => key.startsWith('__'))); assert.deepEqual(p.f.raw, before); assert.equal(p.f.writes.length, 0);
});
for (const locale of ['en', 'zh_CN']) for (const failure of ['url', 'create', 'click']) check(`${locale}/${failure}: failed download preparation reports literal details, cleans URLs and remains retryable`, {locale}, async p => {
    const before = clone(p.f.raw); p.state.downloadFailure = failure; await p.export();
    assert.equal(last(p).text, expected(locale, 'settingsExportFailedPrefix') + ' ' + literal);
    assert.equal(p.state.clicks.length, 0); assert.equal(p.timerCount(60000), 0);
    assert.deepEqual(p.state.revoked, failure === 'url' ? [] : ['blob:synthetic-1']);
    assert.equal(p.document.querySelectorAll('a').length, 0); assert.deepEqual(p.f.raw, before);
    p.state.downloadFailure = null; await p.export(); assert.equal(last(p).text, message(locale, 'settingsExportRequested'));
    assert.equal(p.state.clicks.length, 1); assert.equal(p.timerCount(60000), 1); assert.equal(p.f.writes.length, 0);
});
for (const bytes of [5000 * 1024 - 1, 5000 * 1024, 5000 * 1024 + 1]) check(`large export threshold ${bytes} is unchanged and still based on serialized bytes`, {locale: 'zh_CN'}, async p => {
    p.f.raw.bg = {type: 'image', value: 'data:image/png;base64,AAAA'};
    const size = new Blob([JSON.stringify(p.storage.buildManualExportPayload(await p.storage.getAllForBackup()), null, 2)]).size;
    p.f.raw.bg.value += 'A'.repeat(bytes - size);
    p.state.decisions = [false]; await p.export();
    if (bytes > 5000 * 1024) {
        assert.deepEqual(p.state.confirms, [expected('zh_CN', 'settingsExportLargeConfirm', ['5000.0'])]);
        assert.equal(last(p).text, expected('zh_CN', 'settingsExportCancelled')); assert.equal(p.state.clicks.length, 0);
    } else { assert.equal(p.state.confirms.length, 0); assert.equal(p.state.blobs[0].size, bytes); assert.equal(p.state.clicks.length, 1); }
    assert.equal(p.f.writes.length, 0);
});
check('pending file read cannot prematurely confirm/write; clear-input, count and success order remain unchanged', {locale: 'zh_CN'}, async p => {
    const gate = {entered: deferred(), resume: deferred()}, before = clone(p.f.raw);
    const pending = p.import(p.file(incoming(p), {gate})); await gate.entered.promise;
    assert.equal(last(p).text, expected('zh_CN', 'settingsImportProcessingPrefix') + ' ' + literal + '.JSON');
    assert.equal(p.state.confirms.length, 0); assert.equal(p.f.writes.length, 0); assert.deepEqual(p.f.raw, before);
    assert.equal(p.field('import-settings').value, inputValue);
    gate.resume.resolve(); await pending; assert.equal(p.field('import-settings').value, '');
    assert.equal(last(p).text, expected('zh_CN', 'settingsImportSucceeded')); assert.equal(p.timerCount(1500), 1);
});

test('catalog shape and production source restrict substitutions to numeric size/count and retain original diagnostic classification', () => {
    for (const locale of ['en', 'zh_CN']) for (const [key, value] of Object.entries(words[locale])) {
        assert.equal(message(locale, key, ['7']), value.replace('$1', '7'));
        if (value.includes('$1')) assert.deepEqual(Object.values(catalogs[locale][key].placeholders).map(item => item.content), ['$1']);
        else assert.equal(catalogs[locale][key].placeholders, undefined, `${key}: no raw content substitution`);
    }
    const transfer = source.slice(source.indexOf('async function exportSettings()'), source.indexOf('// Keep these background controls'));
    for (const text of ["error.message.includes('JSON')", "error.message.includes('quota')", "error.message.includes('memory')", "error.message.includes('Invalid settings')",
        "throw new Error(`Invalid JSON format: ${parseError.message}`)", "throw new Error('Invalid settings format. Please check your export file.')", "throw new Error('Failed to save imported settings to storage')"])
        assert(transfer.includes(text), text);
    assert(!/t\([^\n]*\[(?:file\.name|error\.message)\]/.test(transfer));
});

for (const locale of ['en', 'zh_CN']) for (const variant of ['schema2', 'stored-url']) check(`${locale}/${variant}: imported independent positions and original URL spelling survive actual save/re-export`, {locale}, async p => {
    const source = incoming(p), data = source.data;
    const ids = ['l_00000000000000000000000000000001', 'l_00000000000000000000000000000002'];
    data.links = ids.map((layoutId, index) => ({title: literal + index, url: variant === 'stored-url' && index === 0 ? 'example.com' : 'https://example.com/', category: 'work', icon: '★', layoutId}));
    data.layout = {...data.layout, identityVersion: 1,
        positions: {'all|example.com': {x: 11.25, y: -12.5}, 'all|https://example.com/': {x: 55.75, y: 66.25}},
        positionsById: Object.fromEntries(ids.map((id, index) => [id, {all: {x: 22.5 + index, y: -33.25 - index}}]))};
    const payload = p.storage.buildManualExportPayload(data), original = JSON.stringify(payload), before = clone(p.f.raw);
    p.state.confirmHook = () => { assert.equal(p.f.writes.length, 0); assert.deepEqual(p.f.raw, before); };
    await p.import(p.file(payload));
    assert.equal(JSON.stringify(payload), original); assert.equal(p.state.confirms[0], preview(locale, true, 2));
    assert.equal(last(p).text, expected(locale, 'settingsImportSucceeded')); assert.deepEqual(last(p).details, {recordCount: 7});
    assert.deepEqual(p.f.raw.links, data.links); assert.deepEqual(p.f.raw.layout, data.layout); assert.equal(p.f.raw.schemaVersion, 2);
    assert.deepEqual(p.f.raw[p.storage.restoreRecoveryKey].payload.data.links, before.links);
    await p.storage.verifyRestoreReceipt(p.f.raw, p.f.raw[p.storage.restoreReceiptKey]);
    await p.export(); const saved = JSON.parse(await p.state.blobs[0].text());
    assert.deepEqual(saved.data.links, data.links); assert.deepEqual(saved.data.layout, data.layout);
    assert.equal(saved.version, variant === 'stored-url' ? '2.0' : '1.0');
    assert.equal(last(p).text, message(locale, variant === 'stored-url' ? 'storedURLExported' : 'identityExported'));
});
for (const locale of ['en', 'zh_CN']) check(`${locale}: real quota rejection preserves pre-import content and remains retryable without changing error classification`, {locale}, async p => {
    const before = clone(p.f.raw), payload = incoming(p);
    p.f.hooks.set = () => { throw new Error('Synthetic quota ' + literal); };
    await p.import(p.file(payload)); p.f.hooks.set = null;
    assert.equal(last(p).text, expected(locale, 'settingsImportStorageInsufficient'));
    assert.equal(p.f.writes.length, 1, 'one attempted atomic submission, not a verified commit');
    assert.deepEqual(p.f.raw, before); assert.equal(p.timerCount(1500), 0); assert.equal(p.field('import-settings').value, '');
    await p.import(p.file(payload)); assert.equal(last(p).text, expected(locale, 'settingsImportSucceeded'));
    assert.equal(p.f.raw[p.storage.restoreReceiptKey].status, 'verified'); assert.equal(p.f.writes.length, 3);
});

for (const [locale, api] of [['en', 'normal'], ['zh_CN', 'normal'], ['fr-FR', 'normal'], ['zh_CN', 'missing'], ['zh_CN', 'throw'], ['zh_CN', 'absent'], ['zh_CN', 'key'], ['zh_CN', 'no-helper']]) {
    check(`${locale}/${api}: actual final feedback shell localizes operation and metadata without touching raw content or zero-value behavior`, {locale, api}, async p => {
        const language = api === 'normal' ? locale : 'en', instant = '2026-10-16T01:02:03.000Z';
        p.context.Date = class extends Date { constructor(...values) { super(...(values.length ? values : [instant])); } };
        const timestamp = new Date(instant).toLocaleTimeString();
        for (const operation of ['import', 'export', 'synthetic-other']) for (const status of ['info', 'success', 'error']) {
            const label = operation === 'import' ? expected(language, 'settingsTransferImportLabel') : operation === 'export' ? expected(language, 'settingsTransferExportLabel') : 'SYNTHETIC-OTHER';
            const base = '[' + timestamp + '] ' + label + ': ' + literal;
            for (const details of [null, {}, {fileSize: 0, recordCount: 0}, {fileSize: 1, recordCount: 1}, {fileSize: 1536, recordCount: 7}]) {
                p.context.showImportExportFeedback(operation, status, literal, details);
                const suffix = (details?.fileSize ? ' (' + expected(language, 'settingsTransferFileSizeLabel') + ' ' + (details.fileSize / 1024).toFixed(1) + ' KB)' : '') +
                    (details?.recordCount ? ' (' + details.recordCount + ' ' + expected(language, 'settingsTransferItemsLabel') + ')' : '');
                assert.equal(p.toast().textContent, base + suffix);
                assert.equal(p.toast().getAttribute('role'), status === 'error' ? 'alert' : 'status');
                assert(p.toast().classList.contains('message-' + status));
                if (operation !== 'synthetic-other') assert.deepEqual(last(p), {operation, status, text: literal, details});
            }
        }
        await p.import(p.file('{}', {error: literal}));
        const feedback = p.state.feedback.slice(-2);
        const processing = '[' + timestamp + '] ' + expected(language, 'settingsTransferImportLabel') + ': ' + expected(language, 'settingsImportProcessingPrefix') + ' ' + literal + '.JSON' +
            ' (' + expected(language, 'settingsTransferFileSizeLabel') + ' 0.0 KB)';
        assert.equal(p.field('toast-container').children.at(-2).textContent, processing);
        assert.equal(p.toast().textContent, '[' + timestamp + '] ' + expected(language, 'settingsTransferImportLabel') + ': ' + expected(language, 'settingsImportFailedPrefix') + ' ' + literal);
        assert.deepEqual(feedback.map(item => item.operation), ['import', 'import']);
        assert.equal(p.document.querySelectorAll('img').length, 0); assert.equal(p.f.writes.length, 0);
    });
}

});
