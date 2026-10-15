'use strict';
// Actual browser pure-codec/inspector/view script chain, synthetic storage only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { createDocument } = require('./helpers/task-dom-model');
const Closure = require('../shared/import-closure');
const Inspector = require('../shared/recovery-inspector');
const Storage = require('../storage');
const NOW = '2026-10-15T04:00:00.000Z';
const SECRET = 'SYNTHETIC_PROVIDER_SECRET', CURRENT = 'SYNTHETIC_DECISION_CURRENT_TEXT', ORIGINAL = 'SYNTHETIC_ORIGINAL_TEXT';
const clone = value => structuredClone(value);
const text = node => [node?.textContent || '', ...(node?.children || []).map(text)].join('\n');
const tick = () => new Promise(resolve => setImmediate(resolve));
const digest = value => Closure.digest(value, { crypto: webcrypto });
const BUNDLE = '__localItabWorkspaceV1:default:gen1';
async function seed() {
    const current = new Storage().cloneDefaultConfig(); delete current.sync;
    Object.assign(current, { schemaVersion: 1, quote: CURRENT, __localItabLayoutGeneration: 'layout1', __localItabSettingsGeneration: 'settings1' });
    current.links = [{ title: 'Synthetic saved site', url: 'https://synthetic.example.invalid/original', category: 'work', icon: 'S' }];
    const original = clone(current); original.quote = ORIGINAL;
    const recovery = { reason: 'beforeRestore', rawConfiguration: original, rawConfigurationChecksum: await digest(original), providerState: { secret: SECRET } };
    const receipt = { version: 1, status: 'pending', request: await digest('synthetic file'), target: await digest({ ...current, quote: 'intended' }), recovery: await digest(recovery) };
    const body = { action: Closure.ACTION, reviewedAt: NOW, decidedAt: NOW, owner: { migrationId: 'origin1', workspaceId: 'default', generation: 'gen1', label: 'Decision workspace' },
        receipt, current, recovery, receiptDigest: await digest(receipt), currentDigest: await digest(current), recoveryDigest: await digest(recovery) };
    const values = clone(current); delete values.privacy; values.__localItabRestoreReceiptV1 = clone(receipt); values[Inspector.KEYS.restore] = clone(recovery);
    return { [Closure.KEY]: { schemaVersion: 1, id: await digest(body), body }, privacy: clone(current.privacy),
        [Inspector.KEYS.registry]: { schemaVersion: 1, revision: 0, defaultId: 'default', lastUsedId: 'default', migrationId: 'origin1', workspaces: [
            { id: 'default', generation: 'gen1', name: 'Live workspace', order: 0, createdAt: NOW, updatedAt: NOW, deletedAt: null }] },
        [Inspector.KEYS.activation]: { schemaVersion: 1, migrationId: 'origin1', defaultId: 'default' },
        [BUNDLE]: { schemaVersion: 1, id: 'default', generation: 'gen1', values } };
}
function model(raw, { locale = 'en', search = '' } = {}) {
    const document = createDocument({ blurUnavailableFocus: true }); document.visibilityState = 'visible'; document.documentElement.lang = locale === 'zh_CN' ? 'zh-CN' : 'en';
    const forbidden = [], reads = [], calls = [], downloads = [], catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const no = key => { forbidden.push(key); assert.fail('Forbidden: ' + key); };
    const local = { async get(keys) { assert(Array.isArray(keys) && keys.length === 1); assert(keys.every(key => Inspector.BASE_KEYS.includes(key) || /^__localItabWorkspaceV1:[\w-]+:[\w-]+$/.test(key))); reads.push(keys[0]); return Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, clone(raw[key])])); }, set: () => no('set'), remove: () => no('remove'), clear: () => no('clear') };
    const window = { document, location: { search }, crypto: webcrypto, Blob, URL: { createObjectURL: () => no('automatic download') },
        chrome: { storage: { local, get sync() { return no('sync'); } }, get identity() { return no('identity'); } }, setTimeout() { return 1; }, clearTimeout() {}, addEventListener() {},
        i18n: { t: (key, substitutions = []) => (catalog[key]?.message || key).replace(/\$(\d+)/g, (_, n) => substitutions[Number(n) - 1] || '') } };
    const sandbox = { window, document, chrome: window.chrome, crypto: webcrypto, TextEncoder, URL, console };
    for (const key of ['LocalItabWorkspaces', 'storageManager', 'StorageManager', 'DriveBackup', 'fetch', 'XMLHttpRequest', 'Image']) {
        Object.defineProperty(window, key, { get: () => no(key) }); Object.defineProperty(sandbox, key, { get: () => no(key) });
    }
    const context = vm.createContext(sandbox);
    for (const [, path] of fs.readFileSync('recovery.html', 'utf8').matchAll(/<script src="([^"]+)"/g)) if (path !== 'i18n.js') vm.runInContext(fs.readFileSync(path, 'utf8'), context, { filename: path });
    const api = window.LocalItabRecovery.createInspector({ local, crypto: webcrypto, now: () => NOW });
    let report; const pending = {};
    const inspector = {};
    for (const key of ['inspect', 'preview', 'exportEntry', 'reviewRecovery', 'exportRecovery', 'retireRecovery']) inspector[key] = (...args) => { calls.push([key, ...args]); const result = api[key](...args); pending[key] = result; return key === 'inspect' ? result.then(value => { report = value; return value; }) : result; };
    const host = document.createElement('section'); document.body.append(host);
    const view = window.LocalItabRecoveryView.mount({ host, inspector, download: (json, filename) => downloads.push({ json, filename }) });
    const label = key => catalog['recovery' + key]?.message;
    const find = (key, scope = host) => scope.querySelectorAll('button').find(node => node.textContent === label(key));
    return { document, host, view, calls, downloads, reads, forbidden, pending, find, label, allText: () => text(host), get report() { return report; },
        section: () => host.querySelector('.recovery-closure'), imports: () => host.querySelector('.recovery-imports'),
        archiveRows: () => host.querySelectorAll('.recovery-entry').filter(row => text(row).includes(label('ClosureHistorical'))),
        async visibility(value) { document.visibilityState = value; await document.listeners.get('visibilitychange')?.({}); await tick(); } };
}
for (const locale of ['en', 'zh_CN']) test(`closure metadata is independent, localized, historical and read-only (${locale})`, async () => {
    const raw = await seed(), before = clone(raw), m = model(raw, { locale }); await m.view.ready;
    assert.equal(m.report.closure.status, 'valid'); assert.equal(m.report.closure.active, true);
    for (const key of ['ClosureTitle', 'ClosureValid', 'ClosureCapacity', 'ClosureActive', 'ClosureHistoricalHelp']) assert(text(m.section()).includes(m.label(key)), key);
    assert.equal(m.section().querySelectorAll('button,a,input,img').length, 0);
    assert(text(m.imports()).includes(m.label('ImportPending'))); assert(text(m.imports()).includes(m.label('ImportExplicitlyEnded')));
    assert(!text(m.imports()).includes(m.label('ImportVerified'))); assert(!text(m.imports()).includes(m.label('ImportMatchedHelp')));
    assert.equal(m.archiveRows().length, 2); assert(m.archiveRows().every(row => text(row).includes(m.label('AttributionClosure'))));
    for (const value of [SECRET, CURRENT, ORIGINAL]) assert(!m.allText().includes(value));
    assert.deepEqual(raw, before); assert.deepEqual(m.forbidden, []); assert.deepEqual(m.downloads, []); assert(m.reads.includes(Closure.KEY));
});
test('archive survives absent owner and invalid query; global decision summary does not masquerade as current', async () => {
    const raw = await seed(); delete raw[Inspector.KEYS.registry]; delete raw[Inspector.KEYS.activation]; delete raw[BUNDLE];
    const m = model(raw, { search: '?workspace=default&workspace=other' }); await m.view.ready;
    assert.equal(m.report.closure.currentRelation, 'unknown'); assert(text(m.section()).includes(m.label('ClosureRelationUnknown')));
    assert.equal(m.archiveRows().length, 0); m.find('ContextShowAll').dispatch('click');
    assert.equal(m.archiveRows().length, 2); assert(text(m.imports()).includes(m.label('ImportEmpty')));
    assert(m.archiveRows().every(row => !text(row).includes(m.label('AttributionVerified')))); assert.deepEqual(m.downloads, []);
});
for (const kind of ['receipt', 'lineage']) test(`different ${kind} keeps earlier evidence historical with no closed current label`, async () => {
    const raw = await seed();
    if (kind === 'receipt') raw[BUNDLE].values.__localItabRestoreReceiptV1.target = 'f'.repeat(64);
    else { raw[Inspector.KEYS.registry].migrationId = 'later'; raw[Inspector.KEYS.activation].migrationId = 'later'; }
    const m = model(raw); await m.view.ready;
    assert(text(m.section()).includes(m.label('ClosureDifferent'))); assert(!text(m.imports()).includes(m.label('ImportExplicitlyEnded')));
    assert.equal(m.archiveRows().length, 2); if (kind === 'lineage') assert(m.archiveRows().every(row => text(row).includes(m.label('RelationUnknown'))));
});
for (const kind of ['invalid', 'unsupported']) test(`occupied ${kind} archive is visible as blocked and exposes no historical contents`, async () => {
    const raw = await seed(); if (kind === 'invalid') raw[Closure.KEY].id = '0'.repeat(64); else raw[Closure.KEY].schemaVersion = 2;
    const m = model(raw); await m.view.ready;
    assert(text(m.section()).includes(m.label(kind === 'invalid' ? 'ClosureInvalid' : 'ClosureUnsupported')));
    assert.equal(m.archiveRows().length, 0); assert(!text(m.imports()).includes(m.label('ImportExplicitlyEnded'))); assert(!m.allText().includes(SECRET));
});
test('archived current is investigation-only; original recovery still needs separate strict file review and download', async () => {
    const raw = await seed(), before = clone(raw), m = model(raw); await m.view.ready;
    const [current, original] = m.archiveRows(); assert(m.find('ReviewCopy', current).disabled); assert(!m.find('ReviewCopy', original).disabled);
    m.find('ReviewCopy', current).dispatch('click'); await tick(); assert.equal(m.calls.filter(call => call[0] === 'reviewRecovery').length, 0);
    m.find('ReviewCopy', original).dispatch('click'); await m.pending.reviewRecovery.catch(() => {}); await tick();
    assert(m.find('DownloadRecovery', original), m.allText()); assert.deepEqual(m.downloads, []);
    assert(text(original).includes(m.label('ClosureHistoricalHelp'))); assert(!text(original).includes(m.label('HistoricalHelp')));
    m.find('DownloadRecovery', original).dispatch('click'); assert.equal(m.downloads.length, 1);
    assert.equal(m.downloads[0].filename, 'local-itab-reviewed-configuration.json'); assert(!m.downloads[0].json.includes(SECRET));
    assert(m.downloads[0].json.includes(ORIGINAL)); assert(!m.downloads[0].json.includes(CURRENT)); assert(!m.downloads[0].json.includes(Closure.KEY)); assert.deepEqual(raw, before);
});
test('archive hash never makes a credential-bearing original configuration downloadable', async () => {
    const raw = await seed(), body = raw[Closure.KEY].body;
    body.recovery.rawConfiguration.links[0].url = 'https://synthetic.example.invalid/?token=SYNTHETIC_REJECTED_TOKEN';
    body.recovery.rawConfigurationChecksum = await digest(body.recovery.rawConfiguration);
    body.recoveryDigest = body.receipt.recovery = await digest(body.recovery); body.receiptDigest = await digest(body.receipt); raw[Closure.KEY].id = await digest(body);
    const m = model(raw); await m.view.ready; const original = m.archiveRows()[1];
    m.find('ReviewCopy', original).dispatch('click'); await m.pending.reviewRecovery.catch(() => {}); await tick(); assert(!m.find('DownloadRecovery', original)); assert.deepEqual(m.downloads, []);
    assert(!m.allText().includes('SYNTHETIC_REJECTED_TOKEN')); assert(!m.allText().includes(SECRET));
});
test('page visibility retirement clears the historical metadata and any old review', async () => {
    const m = model(await seed()); await m.view.ready; assert(m.section().children.length > 0);
    await m.visibility('hidden'); assert.equal(m.section().children.length, 0); assert.equal(m.archiveRows().length, 0); assert.deepEqual(m.downloads, []);
});
