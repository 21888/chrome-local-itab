'use strict';
// Real browser inspector + Recovery view, with synthetic memory storage only.
// Storage is a Node-only fixture oracle. The browser never loads a writer.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const Storage = require('../storage');
const Inspector = require('../shared/recovery-inspector');
const { createDocument } = require('./helpers/task-dom-model');

const NOW = '2026-10-15T02:00:00.000Z';
const RECEIPT = '__localItabRestoreReceiptV1', RECOVERY = '__localItabRestoreRecovery';
const LAYOUT = '__localItabLayoutGeneration', SETTINGS = '__localItabSettingsGeneration';
const PRIVATE = 'SYNTHETIC_PRIVATE_RECEIPT_TEST_SECRET';
const TITLE = 'SYNTHETIC_CONFIG_SITE_TITLE', URL_TEXT = 'https://synthetic.example.invalid/retained';
const QUOTE = 'SYNTHETIC_CONFIG_QUOTE';
const clone = value => structuredClone(value);
const text = node => node ? [node.textContent || '', ...node.children.map(text)].join('\n') : '';
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const bundleKey = (id = 'default', generation = 'g_' + id) => `__localItabWorkspaceV1:${id}:${generation}`;
const catalog = locale => JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));

async function productionHash(value) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
    try { return await new Storage().fingerprint(value); }
    finally { if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor); else delete globalThis.crypto; }
}
function registry(ids = ['default'], prefix = 'g_') {
    return { schemaVersion: 1, revision: 0, defaultId: 'default', lastUsedId: 'default', migrationId: 'migration_1',
        workspaces: ids.map((id, order) => ({ id, generation: prefix + id, name: 'Synthetic workspace ' + id, order,
            createdAt: NOW, updatedAt: NOW, deletedAt: id === 'trash' ? NOW : null })) };
}
function values(raw, id = 'default') { const entry = raw[Inspector.KEYS.registry].workspaces.find(item => item.id === id); return raw[bundleKey(id, entry.generation)].values; }
function targetState(raw, id = 'default') {
    const target = { ...values(raw, id) };
    if (Object.hasOwn(raw, 'privacy')) target.privacy = raw.privacy;
    else delete target.privacy;
    return new Storage().restoreReceiptState(target);
}
async function seed(ids = ['default']) {
    const base = new Storage().cloneDefaultConfig();
    base.schemaVersion = 1; base.quote = QUOTE;
    base.links = [{ title: TITLE, url: URL_TEXT, category: 'work', icon: 'S' }];
    const raw = { [Inspector.KEYS.registry]: registry(ids), [Inspector.KEYS.activation]: { schemaVersion: 1, defaultId: 'default', migrationId: 'migration_1' },
        privacy: clone(base.privacy), sync: { enabled: false, accessToken: PRIVATE }, __privateAuth: PRIVATE };
    for (const id of ids) {
        const current = clone(base); delete current.privacy; delete current.sync;
        current[LAYOUT] = 'layout_fence_' + id; current[SETTINGS] = 'settings_fence_' + id;
        current[RECOVERY] = { reason: 'beforeRestore', rawConfiguration: clone(base), rawConfigurationChecksum: await productionHash(base), providerState: { token: PRIVATE } };
        raw[bundleKey(id)] = { schemaVersion: 1, id, generation: 'g_' + id, values: current };
        current[RECEIPT] = { version: 1, status: 'pending', request: await productionHash({ syntheticImportFile: id }),
            target: await productionHash(targetState(raw, id)), recovery: await productionHash(current[RECOVERY]) };
    }
    return raw;
}
async function withHistory(raw) {
    const previous = registry(['default', 'retired'], 'historical_');
    const oldValues = clone(values(raw));
    oldValues[RECEIPT].request = 'f'.repeat(64);
    raw[Inspector.KEYS.prior] = { schemaVersion: 1, createdAt: NOW, snapshot: { registry: previous,
        bundles: previous.workspaces.map(entry => ({ id: entry.id, generation: entry.generation, values: clone(oldValues) })) } };
    return raw;
}
function model(raw, { locale = 'en', search = '' } = {}) {
    const document = createDocument({ blurUnavailableFocus: true }); document.visibilityState = 'visible';
    const reads = [], forbidden = [], calls = [], downloads = [], timers = new Map(), pending = {};
    const messages = catalog(locale); let serial = 0, lastReport;
    const reject = key => { forbidden.push(key); throw Error('Forbidden dependency: ' + key); };
    const local = { async get(keys) {
        assert(Array.isArray(keys), 'inspection must never enumerate all local storage'); assert.equal(keys.length, 1);
        assert(keys.every(key => Inspector.BASE_KEYS.includes(key) || key === 'privacy' || /^__localItabWorkspaceV1:[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/.test(key)));
        reads.push([...keys]); return Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, clone(raw[key])]));
    }, set: () => reject('local.set'), remove: () => reject('local.remove'), clear: () => reject('local.clear') };
    const window = { document, location: { search }, crypto: webcrypto, Blob,
        chrome: { storage: { local, get sync() { return reject('chrome.storage.sync'); } }, get identity() { return reject('chrome.identity'); } },
        URL: { createObjectURL: () => reject('automatic Blob download'), revokeObjectURL() {} },
        setTimeout(fn) { timers.set(++serial, fn); return serial; }, clearTimeout(id) { timers.delete(id); }, addEventListener() {},
        i18n: { t(key, substitutions = []) { const value = messages[key]?.message || key; return value.replace(/\$(\d+)/g, (_, n) => substitutions[Number(n) - 1] || ''); } } };
    document.documentElement.lang = locale === 'zh_CN' ? 'zh-CN' : 'en';
    for (const key of ['LocalItabWorkspaces', 'storageManager', 'StorageManager', 'DriveBackup', 'fetch', 'XMLHttpRequest', 'Image']) {
        Object.defineProperty(window, key, { get() { return reject(key); } });
    }
    const sandbox = { window, document, chrome: window.chrome, crypto: webcrypto, TextEncoder, URL, console };
    for (const key of ['LocalItabWorkspaces', 'storageManager', 'StorageManager', 'DriveBackup', 'fetch', 'XMLHttpRequest', 'Image']) {
        Object.defineProperty(sandbox, key, { get() { return reject(key); } });
    }
    const context = vm.createContext(sandbox);
    const scripts = [...fs.readFileSync('recovery.html', 'utf8').matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
    assert(!scripts.some(path => /(?:^storage\.js$|workspaces\.js$|drive-backup|complete-backup)/.test(path)), 'Recovery may load pure codecs, never writers or providers');
    for (const script of scripts.filter(path => path !== 'i18n.js')) vm.runInContext(fs.readFileSync(script, 'utf8'), context, { filename: script });
    const api = window.LocalItabRecovery.createInspector({ local, crypto: webcrypto, now: () => NOW });
    const inspector = {};
    for (const key of ['inspect', 'preview', 'exportEntry', 'reviewRecovery', 'exportRecovery', 'retireRecovery']) inspector[key] = (...args) => {
        calls.push([key, ...args]); const result = api[key](...args);
        if (key === 'inspect') return pending[key] = Promise.resolve(result).then(report => { lastReport = report; return report; });
        if (key === 'reviewRecovery') pending[key] = result;
        return result;
    };
    const host = document.createElement('section'); document.body.append(host);
    const view = window.LocalItabRecoveryView.mount({ host, inspector, download: (json, filename) => downloads.push({ json, filename }) });
    const find = (label, scope = host) => scope.querySelectorAll('button').find(node => node.textContent === label);
    return { raw, document, host, view, inspector, api, reads, forbidden, calls, downloads, pending, find,
        get report() { return lastReport; }, section: () => host.querySelector('.recovery-imports'), rows: () => host.querySelectorAll('.recovery-import-entry'),
        allText: () => text(host), label: key => messages['recovery' + key]?.message,
        async visibility(value) { document.visibilityState = value; await document.listeners.get('visibilitychange')?.({}); if (value !== 'hidden') await pending.inspect; await tick(); } };
}
function assertPassive(m, before) {
    assert.deepEqual(m.raw, before, 'inspection must not settle receipts, clear recovery, rewrite fences, or change privacy');
    assert.deepEqual(m.forbidden, []); assert.deepEqual(m.downloads, []);
    assert.equal(m.calls.filter(call => ['preview', 'exportEntry', 'reviewRecovery', 'exportRecovery'].includes(call[0])).length, 0);
    assert(!m.reads.some(keys => keys.includes('sync') || keys.includes('__privateAuth')));
    assert.equal(m.host.querySelectorAll('.recovery-site-url').length, 0);
}
function assertPrivateSection(m) {
    const section = m.section(); assert(section, 'dedicated import-status section exists');
    const visible = text(section);
    for (const value of [PRIVATE, TITLE, URL_TEXT, QUOTE, 'layout_fence_', 'settings_fence_', 'providerState', '__privateAuth']) assert(!visible.includes(value), 'must not render stored value: ' + value);
    assert.equal(section.querySelectorAll('a,img,iframe,script,input,button').length, 0, 'status is metadata, not an import or download surface');
}
function onlyImport(m) { assert.equal(m.report.imports.length, 1); assert.equal(m.rows().length, 1); return m.report.imports[0]; }

for (const locale of ['en', 'zh_CN']) test(`real pending receipt matches production target/recovery fingerprints without claiming completion (${locale})`, async () => {
    const raw = await seed(), before = clone(raw), m = model(raw, { locale }); await m.view.ready;
    const row = onlyImport(m), receipt = values(raw)[RECEIPT];
    assert.equal(row.status, 'pending'); assert.equal(row.version, 1); assert.equal(row.request, receipt.request);
    assert.equal(row.target.expected, receipt.target); assert.equal(row.target.current, await productionHash(targetState(raw))); assert.equal(row.target.comparison, 'match');
    assert.equal(row.recovery.expected, receipt.recovery); assert.equal(row.recovery.current, await productionHash(values(raw)[RECOVERY])); assert.equal(row.recovery.comparison, 'match');
    assert.equal(row.source.workspaceGeneration, 'g_default'); assert.equal(row.source.identityStatus, 'verified');
    assert(Object.isFrozen(m.report.imports)); assert(Object.isFrozen(row)); assert(Object.isFrozen(row.target));
    const section = text(m.section());
    for (const key of ['ImportTitle', 'ImportPending', 'ImportMatchedHelp', 'ImportFileUnchecked', 'ImportRecordedHelp']) {
        assert(m.label(key), key); assert(section.includes(m.label(key)), 'localized receipt text: ' + key);
    }
    assert.equal(m.rows()[0].querySelectorAll('dd').filter(node => node.textContent === m.label('ImportMatch')).length, 2);
    assert.equal(m.section().getAttribute('aria-labelledby'), m.section().querySelector('h2').id);
    assert.equal(m.section().querySelector('details').open, false, 'fingerprint detail starts collapsed');
    if (locale === 'en') {
        assert(section.includes('Current workspace import status')); assert(section.includes('Recorded as pending')); assert(section.includes('Match'));
        assert(section.includes('Original import file not supplied; file identity has not been checked.'));
        assert(!section.includes('Import verified')); assert(!section.includes('Import complete')); assert(!section.includes('Recorded as verified'));
    } else { assert(/[\u4e00-\u9fff]/.test(section)); assert(!section.includes('recoveryImport')); assert(!section.includes('Current workspace import status')); }
    assertPrivateSection(m); assertPassive(m, before);
});

for (const change of ['content', 'privacy', 'layout fence', 'settings fence']) test(`edited ${change} produces target mismatch without changing a pending receipt`, async () => {
    const raw = await seed();
    if (change === 'content') values(raw).quote += ' changed';
    if (change === 'privacy') raw.privacy.onlineFavicons = true;
    if (change === 'layout fence') values(raw)[LAYOUT] += '_later';
    if (change === 'settings fence') values(raw)[SETTINGS] += '_later';
    const before = clone(raw), m = model(raw); await m.view.ready;
    const row = onlyImport(m); assert.equal(row.status, 'pending'); assert.equal(row.target.comparison, 'mismatch'); assert.equal(row.recovery.comparison, 'match');
    assert.equal(row.target.current, await productionHash(targetState(raw))); assert(text(m.section()).includes('Mismatch'));
    assertPrivateSection(m); assertPassive(m, before);
});

test('provider preferences are excluded from target fingerprint, but the entire retained recovery is compared privately', async () => {
    const raw = await seed(); raw.sync = { enabled: true, accessToken: PRIVATE + '_new' };
    let before = clone(raw), m = model(raw); await m.view.ready;
    assert.equal(onlyImport(m).target.comparison, 'match'); assertPrivateSection(m); assertPassive(m, before);
    values(raw)[RECOVERY].providerState.token += '_changed'; before = clone(raw); await m.view.refresh();
    assert.equal(onlyImport(m).target.comparison, 'match'); assert.equal(onlyImport(m).recovery.comparison, 'mismatch');
    assertPrivateSection(m); assertPassive(m, before);
});

for (const [kind, receipt, expected] of [
    ['absent', undefined, 'missing'], ['null', null, 'invalid'], ['unknown status', { status: 'unexpected_' + PRIVATE }, 'invalid'],
    ['future version', { version: 2 }, 'unsupported'], ['additional field', { extraPrivateField: PRIVATE }, 'invalid'],
    ['invalid fingerprint', { target: PRIVATE }, 'invalid']
]) test(`current ${kind} receipt is explicit and cannot expose raw fields or enable a file action`, async () => {
    const raw = await seed(); if (receipt === undefined) delete values(raw)[RECEIPT];
    else if (receipt === null) values(raw)[RECEIPT] = null;
    else Object.assign(values(raw)[RECEIPT], receipt);
    const before = clone(raw), m = model(raw); await m.view.ready;
    const row = onlyImport(m); assert.equal(row.status, expected);
    assert.equal(row.target.comparison, 'unavailable'); assert.equal(row.recovery.comparison, 'unavailable');
    assertPrivateSection(m); assertPassive(m, before);
});

test('missing retained recovery stays explicit even when the target fingerprint still matches', async () => {
    const raw = await seed(); delete values(raw)[RECOVERY]; const before = clone(raw), m = model(raw); await m.view.ready;
    const row = onlyImport(m); assert.equal(row.status, 'pending'); assert.equal(row.target.comparison, 'match'); assert.equal(row.recovery.comparison, 'missing');
    assert.equal(row.recovery.current, null); assert(text(m.section()).includes('Missing')); assertPrivateSection(m); assertPassive(m, before);
});

for (const locale of ['en', 'zh_CN']) test(`current receipts and historical copies stay distinct under workspace query and explicit show-all (${locale})`, async () => {
    const raw = await withHistory(await seed(['default', 'named', 'trash']));
    raw[Inspector.KEYS.registry].workspaces[1].name = '<img src="https://synthetic.invalid/no-image" onerror="alert(1)">';
    const before = clone(raw), m = model(raw, { locale, search: '?workspace=named' }); await m.view.ready;
    assert.equal(m.report.imports.length, 3); assert(m.report.imports.every(row => row.source.kind === 'workspace'));
    assert(!m.report.imports.some(row => row.source.workspaceId === 'retired' || row.request === 'f'.repeat(64)));
    assert.equal(m.rows().length, 1); assert(text(m.rows()[0]).includes('named')); assert.equal(m.section().querySelectorAll('img,script,a').length, 0);
    const show = m.find(locale === 'en' ? 'Show all saved copies' : '查看全部本地副本'); assert(show); show.dispatch('click');
    assert.equal(m.rows().length, 3); assert(text(m.section()).includes('trash'));
    assert(text(m.rows().find(row => text(row).includes('g_trash'))).includes(m.label('ImportTrash')));
    assert(m.report.entries.some(row => row.source.kind === 'historicalWorkspace' && row.source.workspaceId === 'retired'));
    m.find(locale === 'en' ? 'Show requested workspace only' : '仅查看请求的工作区').dispatch('click');
    assert.equal(m.rows().length, 1); assert(!text(m.section()).includes('retired'));
    assertPrivateSection(m); assertPassive(m, before);
});

for (const query of ['?workspace=named&workspace=named', '?workspace=named&workspace=default', '?workspace=%E0%A4%A', '?workspace=%3Cimg%3E']) test(`invalid or repeated query keeps receipt statuses hidden until explicit global choice: ${query}`, async () => {
    const raw = await seed(['default', 'named']), before = clone(raw), m = model(raw, { search: query }); await m.view.ready;
    assert.equal(m.rows().length, 0); assert(m.allText().includes('invalid or ambiguous'));
    m.find('Show all saved copies').dispatch('click'); assert.equal(m.rows().length, 2); assert(m.allText().includes('invalid or ambiguous'));
    m.find('Return to workspace warning').dispatch('click'); assert.equal(m.rows().length, 0);
    assertPassive(m, before);
});

test('historical-only query never promotes an earlier receipt into current import status', async () => {
    const raw = await withHistory(await seed()), before = clone(raw), m = model(raw, { search: '?workspace=retired' }); await m.view.ready;
    assert(m.host.querySelectorAll('.recovery-entry').length > 0); assert.equal(m.rows().length, 0); assert(!text(m.section()).includes('f'.repeat(64)));
    m.find('Show all saved copies').dispatch('click'); assert.equal(m.rows().length, 1); assert(text(m.rows()[0]).includes('default'));
    assertPassive(m, before);
});

test('invalid current registry never manufactures current import rows from salvageable or historical data', async () => {
    const raw = await withHistory(await seed()); raw[Inspector.KEYS.registry].revision = 'invalid';
    const before = clone(raw), m = model(raw); await m.view.ready;
    assert.equal(m.report.imports.length, 0); assert.equal(m.rows().length, 0); assert(m.report.entries.length > 0);
    assertPassive(m, before);
});

test('refresh clears receipt rows immediately and discards a late older real inspection', async () => {
    const raw = await seed(), m = model(raw); await m.view.ready;
    const original = m.inspector.inspect, entered = deferred(), release = deferred();
    m.inspector.inspect = async () => { const report = await original(); entered.resolve(); await release.promise; return report; };
    const older = m.view.refresh(); assert.equal(m.rows().length, 0); await entered.promise;
    values(raw).quote += '_newer'; const before = clone(raw); m.inspector.inspect = original;
    await m.view.refresh(); assert.equal(onlyImport(m).target.comparison, 'mismatch'); assert(text(m.section()).includes('Mismatch'));
    release.resolve(); await older; assert(text(m.section()).includes('Mismatch')); assert.equal(m.rows().length, 1);
    assertPassive(m, before);
});

test('inspection errors remove old receipt statuses and never expose backend exception contents', async () => {
    const raw = await seed(), before = clone(raw), m = model(raw); await m.view.ready;
    const original = m.inspector.inspect;
    m.inspector.inspect = async () => { throw { code: 'READ_FAILED', message: PRIVATE }; };
    await m.view.refresh(); assert.equal(m.rows().length, 0); assert(!m.allText().includes(PRIVATE));
    m.inspector.inspect = original; await m.view.refresh(); assert.equal(m.rows().length, 1);
    assertPassive(m, before);
});

test('visibility, suspension and destroy clear import statuses and do not resurrect stale async inspections', async () => {
    const raw = await seed(), before = clone(raw), m = model(raw); await m.view.ready;
    await m.visibility('hidden'); assert.equal(m.rows().length, 0); assert(!text(m.section()).includes('Recorded as pending'));
    await m.visibility('visible'); assert.equal(m.rows().length, 1);
    const original = m.inspector.inspect, entered = deferred(), release = deferred();
    m.inspector.inspect = async () => { const report = await original(); entered.resolve(); await release.promise; return report; };
    const inFlight = m.view.refresh(); await entered.promise; m.view.suspend(); release.resolve(); await inFlight;
    assert.equal(m.rows().length, 0); m.inspector.inspect = original; await m.view.resume(); assert.equal(m.rows().length, 1);
    m.view.destroy(); assert.equal(m.rows().length, 0); await m.view.refresh(); assert.equal(m.rows().length, 0);
    assertPassive(m, before);
});

test('matching import receipt remains separate from strict source review and explicit downloads', async () => {
    const raw = await seed(), before = clone(raw), m = model(raw); await m.view.ready;
    assert.equal(onlyImport(m).recovery.comparison, 'match'); assertPrivateSection(m); assertPassive(m, before);
    const direct = m.host.querySelectorAll('.recovery-entry').find(row => text(row).includes('Configuration copy'));
    assert(direct); const directReview = m.find('Review configuration file', direct); assert(directReview.disabled);
    directReview.dispatch('click'); assert.equal(m.calls.filter(call => call[0] === 'reviewRecovery').length, 0);
    const eligible = m.host.querySelectorAll('.recovery-entry').find(row => m.find('Review configuration file', row)?.disabled === false);
    assert(eligible); const reads = m.reads.length; m.find('Review configuration file', eligible).dispatch('click');
    await m.pending.reviewRecovery; await tick();
    assert.equal(m.calls.filter(call => call[0] === 'reviewRecovery').length, 1); assert.equal(m.reads.length, reads);
    assert(m.find('Download reviewed configuration')); assert.equal(m.downloads.length, 0); assertPrivateSection(m);
    assert.deepEqual(raw, before); assert.deepEqual(m.forbidden, []);
});

test('a matching receipt cannot bypass strict recovery field admission', async () => {
    const raw = await seed(), recovery = values(raw)[RECOVERY];
    recovery.rawConfiguration.unknownPrivateField = PRIVATE;
    recovery.rawConfigurationChecksum = await productionHash(recovery.rawConfiguration);
    values(raw)[RECEIPT].recovery = await productionHash(recovery);
    const before = clone(raw), m = model(raw); await m.view.ready;
    assert.equal(onlyImport(m).recovery.comparison, 'match'); assertPrivateSection(m); assertPassive(m, before);
    const eligible = m.host.querySelectorAll('.recovery-entry').find(row => m.find('Review configuration file', row)?.disabled === false);
    assert(eligible); m.find('Review configuration file', eligible).dispatch('click');
    await assert.rejects(m.pending.reviewRecovery, error => error.code === 'RECOVERY_FIELDS'); await tick();
    assert(!m.find('Download reviewed configuration')); assert(!m.allText().includes(PRIVATE));
    assert.equal(m.downloads.length, 0); assert.deepEqual(raw, before); assert.deepEqual(m.forbidden, []);
});

for (const locale of ['en', 'zh_CN']) test(`recorded verified status remains distinct from a later target mismatch (${locale})`, async () => {
    const raw = await seed(); values(raw)[RECEIPT].status = 'verified'; values(raw).quote += '_later';
    const before = clone(raw), m = model(raw, { locale }); await m.view.ready;
    const row = onlyImport(m); assert.equal(row.status, 'verified'); assert.equal(row.target.comparison, 'mismatch');
    for (const key of ['ImportVerified', 'ImportMismatch', 'ImportMismatchHelp', 'ImportRecordedHelp', 'ImportFileUnchecked']) {
        assert(m.label(key), key); assert(text(m.section()).includes(m.label(key)), 'localized mismatch text: ' + key);
    }
    assertPrivateSection(m); assertPassive(m, before);
});

for (const locale of ['en', 'zh_CN']) for (const kind of ['missing', 'forged privacy']) test(`unavailable ${kind} bundle is explicit globally and cannot match a workspace query (${locale})`, async () => {
    const raw = await seed(['default', 'named']);
    if (kind === 'missing') delete raw[bundleKey('named')];
    else values(raw, 'named').privacy = { onlineFavicons: true, privateValue: PRIVATE };
    const before = clone(raw), m = model(raw, { locale, search: '?workspace=named' }); await m.view.ready;
    const reportRow = m.report.imports.find(row => row.source.workspaceId === 'named');
    assert(reportRow); assert.equal(reportRow.status, 'unavailable'); assert.equal(reportRow.source.identityStatus, 'unverified');
    assert.equal(reportRow.target.comparison, 'unavailable'); assert.equal(reportRow.recovery.comparison, 'unavailable');
    assert.equal(m.rows().length, 0);
    m.find(locale === 'en' ? 'Show all saved copies' : '查看全部本地副本').dispatch('click');
    assert.equal(m.rows().length, 2);
    const row = m.rows().find(item => text(item).includes('g_named'));
    assert(text(row).includes(m.label('ImportUnavailable'))); assert(!row.querySelector('details'));
    assertPrivateSection(m); assertPassive(m, before);
});
