'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const source = fs.readFileSync('options.js', 'utf8');

// Synthetic DOM/download-request model only. An anchor gives the page no event
// for a later save-dialog cancellation, browser rejection or completed file.
function harness({ locale, version = '1.0', schemaVersion } = {}) {
    const document = createDocument();
    const draft = document.createElement('textarea'); draft.value = 'Unsaved synthetic draft';
    const selection = document.createElement('select'); selection.value = 'synthetic-selection';
    document.body.append(draft, selection);
    const state = { failure: '', gate: null, consent: true, prompts: [], messages: [],
        blobs: [], clicks: [], revoked: [], timers: [], reads: [], errors: [],
        payload: { version, ...(schemaVersion ? { schemaVersion } : {}),
            itemCounts: { shortcuts: 1, hotTopics: 0, hasBackgroundImage: false, hasMoviePoster: false },
            data: { links: [{ title: 'Synthetic site', url: 'https://example.test/' }] } } };
    const fail = stage => { if (state.failure === stage) throw new Error('Synthetic ' + stage + ' failure'); };
    const create = document.createElement.bind(document);
    document.createElement = tag => {
        fail('create');
        const element = create(tag);
        if (tag === 'a') element.click = () => {
            fail('click');
            state.clicks.push({ href: element.href, filename: element.download });
        };
        return element;
    };
    const append = document.body.appendChild.bind(document.body);
    document.body.appendChild = element => { fail('append'); append(element); };
    // The baseline used removeChild; keep both native removal methods available.
    document.body.removeChild = element => element.remove();
    const read = async kind => {
        state.reads.push(kind);
        if (state.gate) await state.gate;
        fail('read');
        return state.payload;
    };
    const storageManager = {
        getAllForBackup: () => read('settings'), buildManualExportPayload: value => value,
        getRecoveryBackup: kind => read('recovery-' + kind),
        setAll() { assert.fail('Download must not write saved content'); }
    };
    const manager = {
        downloadSnapshotPayload: () => read('drive'),
        async setLastError(error) { state.errors.push(error); }
    };
    const catalog = locale && JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const i18n = catalog && { t: key => catalog[key]?.message || key };
    const context = { document, window: i18n ? { i18n } : {}, i18n, storageManager, Blob,
        URL: {
            createObjectURL(blob) { fail('url'); state.blobs.push(blob); return `blob:synthetic-${state.blobs.length}`; },
            revokeObjectURL(url) { state.revoked.push(url); }
        },
        confirm(message) { state.prompts.push(message); return state.consent; },
        setTimeout(callback, delay) { state.timers.push({ callback, delay }); },
        console: { log() {}, error() {}, warn() {} }
    };
    vm.createContext(context); vm.runInContext(source, context);
    context.showMessage = (message, status) => state.messages.push({ message, status });
    context.showImportExportFeedback = (operation, status, message, details) => state.messages.push({ operation, message, status, details });
    context.getDriveBackupManager = () => manager;
    context.renderDriveBackupPanel = async () => context.setDriveActionsDisabled(false);
    const run = kind => kind === 'settings' ? context.exportSettings()
        : kind === 'recovery' ? context.downloadRecoveryBackup('latest')
        : context.downloadDriveSnapshot({ id: 'synthetic-snapshot', name: 'synthetic-drive-backup.json' });
    const unchanged = () => {
        assert.equal(draft.value, 'Unsaved synthetic draft');
        assert.equal(selection.value, 'synthetic-selection');
    };
    return { document, state, run, unchanged, catalog };
}

for (const kind of ['settings', 'recovery', 'drive']) {
    test(`${kind}: requesting a file never claims save completion, changes JSON or loses unrelated form edits`, async () => {
        const h = harness(), original = JSON.stringify(h.state.payload, null, 2);
        await h.run(kind);
        const feedback = h.state.messages.at(-1);
        assert.equal(feedback.status, 'info');
        assert.match(feedback.message, /download requested.*Confirm the file was saved.*cannot verify completion/);
        assert(!h.state.messages.some(item => item.status === 'success'));
        assert.equal(h.state.clicks.length, 1);
        assert.equal(h.state.blobs[0].type, 'application/json');
        assert.equal(await h.state.blobs[0].text(), original);
        assert.equal(JSON.stringify(h.state.payload, null, 2), original);
        assert.equal(h.document.querySelectorAll('a').length, 0);
        assert.deepEqual(h.state.revoked, []);
        assert.equal(h.state.timers.length, 1);
        assert.equal(h.state.timers[0].delay, 60000);
        const messages = JSON.stringify(h.state.messages);
        h.state.timers[0].callback();
        assert.deepEqual(h.state.revoked, ['blob:synthetic-1']);
        assert.equal(JSON.stringify(h.state.messages), messages, 'URL cleanup is not a download completion signal');
        const expectedName = kind === 'drive' ? /^synthetic-drive-backup\.json$/
            : new RegExp(`^local-itab-${kind === 'settings' ? 'settings' : 'recovery-latest'}-\\d{4}-\\d\\d-\\d\\d\\.json$`);
        assert.match(h.state.clicks[0].filename, expectedName);
        h.unchanged();
    });

    for (const failure of ['url', 'create', 'append', 'click']) test(`${kind}: ${failure} failure cleans up, reports failure and allows retry`, async () => {
        const h = harness(); h.state.failure = failure;
        await h.run(kind);
        assert.equal(h.state.messages.at(-1).status, 'error');
        assert.equal(h.state.clicks.length, 0);
        assert.equal(h.document.querySelectorAll('a').length, 0);
        assert.deepEqual(h.state.revoked, failure === 'url' ? [] : ['blob:synthetic-1']);
        assert.equal(h.state.timers.length, 0);
        assert(!h.state.messages.some(item => item.status === 'success' || /download requested/.test(item.message)));
        h.unchanged();
        h.state.failure = '';
        await h.run(kind);
        assert.equal(h.state.clicks.length, 1);
        assert.equal(h.state.messages.at(-1).status, 'info');
        assert.match(h.state.messages.at(-1).message, /download requested/);
        h.unchanged();
    });

    test(`${kind}: delayed source rejection cannot become a requested or completed download`, async () => {
        const h = harness(); let reject;
        h.state.gate = new Promise((resolve, fail) => { reject = fail; });
        const pending = h.run(kind);
        assert.equal(h.state.clicks.length, 0);
        assert(!h.state.messages.some(item => item.status === 'success' || /download requested/.test(item.message)));
        reject(new Error('Synthetic delayed read failure'));
        await pending;
        assert.equal(h.state.messages.at(-1).status, 'error');
        assert.equal(h.state.blobs.length, 0);
        assert.equal(h.state.clicks.length, 0);
        h.unchanged();
        h.state.gate = null;
        await h.run(kind);
        assert.equal(h.state.clicks.length, 1);
        assert.equal(h.state.messages.at(-1).status, 'info');
    });
}

test('settings: cancelling the existing large-export warning creates no download and keeps edits for retry', async () => {
    const h = harness(); h.state.payload.data.syntheticImage = 'A'.repeat(5 * 1024 * 1024);
    const original = JSON.stringify(h.state.payload);
    h.state.consent = false;
    await h.run('settings');
    assert.equal(h.state.prompts.length, 1);
    assert.equal(h.state.messages.at(-1).status, 'info');
    assert.match(h.state.messages.at(-1).message, /cancelled/);
    assert.equal(h.state.blobs.length, 0);
    assert.equal(h.state.clicks.length, 0);
    assert.equal(h.state.timers.length, 0);
    assert.equal(JSON.stringify(h.state.payload), original);
    h.unchanged();
    h.state.consent = true;
    await h.run('settings');
    assert.equal(h.state.clicks.length, 1);
    assert.match(h.state.messages.at(-1).message, /download requested/);
    h.unchanged();
});

for (const locale of ['en', 'zh_CN']) for (const kind of ['settings', 'recovery', 'drive']) {
    const variants = kind === 'settings' ? [{}, { schemaVersion: 2 }, { version: '2.0' }] : [{}];
    for (const variant of variants) test(`${kind}: ${locale} ${JSON.stringify(variant)} feedback keeps format guidance and the download boundary`, async () => {
        const h = harness({ locale, ...variant });
        await h.run(kind);
        const key = kind === 'drive' ? 'driveBackupJsonDownloaded' : kind === 'recovery' ? 'recoveryDownloaded'
            : variant.version === '2.0' ? 'storedURLExported' : variant.schemaVersion === 2 ? 'identityExported' : 'settingsExportRequested';
        assert.equal(h.state.messages.at(-1).status, 'info');
        assert.equal(h.state.messages.at(-1).message, h.catalog[key].message);
        assert.match(h.state.messages.at(-1).message, locale === 'en' ? /Confirm the file was saved.*cannot verify completion/ : /确认文件已保存.*无法核验下载是否完成/);
        if (variant.version === '2.0') assert.match(h.state.messages.at(-1).message, locale === 'en' ? /supports stored URL identity backups/ : /支持原网址身份备份/);
        if (variant.schemaVersion === 2) assert.match(h.state.messages.at(-1).message, locale === 'en' ? /supports independent positions/ : /支持独立位置/);
        h.unchanged();
    });
}
