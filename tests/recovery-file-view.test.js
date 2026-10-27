'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const source = fs.readFileSync('recovery.js', 'utf8');
const text = node => [node.textContent || '', ...node.children.map(text)].join('\n');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const NOW = '2026-10-14T22:00:00.000Z';
const row = (id = 'copy_1', extra = {}) => ({ id, source: { kind: 'beforeCloudReplacement', identityStatus: 'unverified', depth: 0, representation: 'raw' }, integrity: 'verified', siteCount: 2, recordedAt: NOW, timeKind: 'backup', warnings: [], exportable: true, ...extra });
const report = (entries = [row()]) => ({ inspectedAt: NOW, warnings: [], entries });
const review = (extra = {}) => Object.freeze({ scope: 'configuration-only', siteCount: 2, categoryCount: 1, duplicateCount: 0, positionCount: 4, schemaVersion: 1, recordedAt: null, timeVerified: false, generatedAt: NOW,
    links: Object.freeze([{ title: 'Exact raw first', url: 'https://example.test' }, { title: 'Exact raw second', url: 'example.test' }]), exclusions: [], ...extra });
function model(options = {}) {
    const document = createDocument({ blurUnavailableFocus: true }), calls = [], downloads = [], blobs = [], revoked = [], timers = new Map();
    document.visibilityState = 'visible'; let timerId = 0, nextReport = options.report || report(), active = null;
    let inspector = {
        inspect: async () => { calls.push(['inspect']); return nextReport; },
        preview: (r, id) => { calls.push(['preview', r, id]); return { links: [{ title: 'Investigation projection only', url: 'https://projection.test/' }], omissions: [] }; },
        exportEntry: (r, id) => { calls.push(['exportEntry', r, id]); return JSON.stringify({ type: 'local-itab-readonly-recovery', id }); },
        reviewRecovery: async (r, id) => { calls.push(['review', r, id]); active = options.review || review(); return active; },
        exportRecovery: (r, id, ticket) => { calls.push(['export', r, id, ticket]); assert.equal(ticket, active); return JSON.stringify({ version: '2.0', type: 'backupSnapshot', id }); },
        retireRecovery: ticket => { calls.push(['retire', ticket]); if (!ticket || ticket === active) active = null; }
    };
    if (options.inspector) inspector = options.inspector;
    if (options.inspect) inspector.inspect = options.inspect;
    if (options.reviewRecovery) inspector.reviewRecovery = options.reviewRecovery;
    if (options.exportRecovery) inspector.exportRecovery = options.exportRecovery;
    const window = { document, location: { search: options.search || '' }, Blob, URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:synthetic-' + blobs.length; }, revokeObjectURL(url) { revoked.push(url); } },
        setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); }, addEventListener() {} };
    const create = document.createElement;
    document.createElement = tag => { const node = create(tag); node.click = () => { if (node.tagName === 'A') { downloads.push({ filename: node.download, href: node.href }); if (options.clickError) throw Error('PRIVATE_CLICK_ERROR'); } node.dispatch('click'); }; return node; };
    if (options.locale) { const messages = JSON.parse(fs.readFileSync(`_locales/${options.locale}/messages.json`, 'utf8')); window.i18n = { t(key, values = []) { return (messages[key]?.message || key).replace(/\$(\d+)/g, (_, n) => values[Number(n) - 1] || ''); } }; document.documentElement.lang = options.locale === 'zh_CN' ? 'zh-CN' : 'en'; }
    for (const name of ['LocalItabWorkspaces', 'storageManager', 'fetch', 'XMLHttpRequest', 'Image']) Object.defineProperty(window, name, { get() { assert.fail('Forbidden dependency: ' + name); } });
    vm.runInNewContext(source, { window });
    const host = document.createElement('section'); document.body.append(host);
    const view = window.LocalItabRecoveryView.mount({ host, inspector, ...(options.defaultDownload ? {} : { download(json, filename) { if (options.downloadError) throw Error('PRIVATE_DOWNLOAD_ERROR'); downloads.push({ json, filename }); } }) });
    const find = (label, scope = host) => scope.querySelectorAll('button').find(node => node.textContent === label);
    return { document, host, view, inspector, calls, downloads, blobs, revoked, timers, find, allText: () => text(host),
        setReport(value) { nextReport = value; }, cooldown() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } },
        async visibility(value) { document.visibilityState = value; await document.listeners.get('visibilitychange')?.({}); await tick(); } };
}
async function open(m) { await m.view.ready; m.find('Review configuration file').dispatch('click'); await tick(); }

test('review and file download are distinct explicit actions; exact source links rather than investigation projection are rendered', async () => {
    const m = model(); await m.view.ready;
    assert.equal(m.calls.filter(x => x[0] === 'review').length, 0); assert.equal(m.downloads.length, 0); assert(!m.find('Download reviewed configuration'));
    await open(m); assert.equal(m.calls.filter(x => x[0] === 'review').length, 1); assert.equal(m.calls.filter(x => x[0] === 'preview').length, 0);
    const panel = m.host.querySelector('.recovery-file-review'); assert(!panel.hidden); assert(text(panel).includes('Exact raw first')); assert(text(panel).includes('example.test')); assert(!text(panel).includes('projection.test'));
    for (const phrase of ['Configuration only', 'not a Complete backup', 'may not contain your most recent edits', 'Sync and provider preferences', 'private', 'raw checksum does not cover']) assert(text(panel).includes(phrase), phrase);
    assert.equal(m.downloads.length, 0); m.find('Download reviewed configuration').dispatch('click');
    assert.equal(m.calls.filter(x => x[0] === 'export').length, 1); assert.equal(m.downloads[0].filename, 'local-itab-reviewed-configuration.json');
    assert(m.allText().includes('Nothing has been imported or overwritten'));
});
test('unverified/direct configuration copies have no enabled importable-file action', async () => {
    const m = model({ report: report([row('copy_1', { integrity: 'unverified', source: { kind: 'preMigration', representation: 'configuration' } })]) }); await m.view.ready;
    const b = m.find('Review configuration file'); assert(b.disabled); b.dispatch('click'); await tick(); assert.equal(m.calls.filter(x => x[0] === 'review').length, 0); assert(m.allText().includes('independently checksummed'));
    assert(!m.find('Download investigation JSON').disabled);
});
test('raw and portable times are not confused and empty site arrays are explicitly shown', async () => {
    const m = model({ review: review({ siteCount: 0, links: [], categoryCount: 0, duplicateCount: 0, positionCount: 0, recordedAt: NOW, timeVerified: true }) }); await open(m);
    const panel = m.host.querySelector('.recovery-file-review'); assert(text(panel).includes('empty site-record array')); assert(!text(panel).includes('raw checksum does not cover')); assert(text(panel).includes('New file generated at'));
});
test('unknown source names and site text stay inert, exact, and contain no navigation/image controls', async () => {
    const hostile = '<img src="https://never.test/" onerror="alert(1)">';
    const m = model({ report: report([row('copy_1', { source: { kind: 'workspace', representation: 'raw', workspaceName: hostile } })]), review: review({ links: [{ title: hostile, url: 'example.test/<script>' }, { title: '', url: 'https://example.test/' }] }) }); await open(m);
    const panel = m.host.querySelector('.recovery-file-review'); assert(text(panel).includes(hostile)); assert.equal(panel.querySelectorAll('img,a,iframe,script').length, 0);
});
test('exact review site lists paginate without reading another source or normalizing URL text', async () => {
    const links = Array.from({ length: 101 }, (_, i) => ({ title: 'Original ' + i, url: 'example.test/' + i }));
    const m = model({ review: review({ links, siteCount: 101 }) }); await open(m);
    const panel = m.host.querySelector('.recovery-file-review'); assert.equal(panel.querySelectorAll('.recovery-site-url').length, 100);
    m.find('Next sites', panel).dispatch('click'); assert(text(panel).includes('example.test/100')); assert.equal(panel.querySelectorAll('.recovery-site-url').length, 1); assert.equal(m.calls.filter(x => x[0] === 'review').length, 1);
});
test('review text truncation is labelled without altering the capability or output', async () => {
    const original = '長'.repeat(4500), ticket = review({ siteCount: 1, links: [{ title: original, url: 'example.test/' }] });
    const m = model({ review: ticket }); await open(m); const panel = m.host.querySelector('.recovery-file-review');
    assert.equal(panel.querySelector('.recovery-site-title').textContent.length, 4000); assert(text(panel).includes('preserves the checked value in full')); assert.equal(ticket.links[0].title.length, 4500);
    m.find('Download reviewed configuration').dispatch('click'); assert.equal(m.calls.find(x => x[0] === 'export')[3], ticket);
});
for (const code of ['RECOVERY_INTEGRITY', 'RECOVERY_FIELDS', 'RECOVERY_FORMAT', 'RECOVERY_CREDENTIAL', 'RECOVERY_REWRITE', 'SIZE_LIMIT', 'PRIVATE_UNKNOWN']) test('failed review is fixed text and never offers download: ' + code, async () => {
    const m = model({ reviewRecovery: async () => { throw { code, message: 'PRIVATE_EXCEPTION_MUST_NOT_APPEAR' }; } }); await open(m);
    assert(!m.find('Download reviewed configuration')); assert(!m.allText().includes('PRIVATE_EXCEPTION')); assert(!m.allText().includes('PRIVATE_UNKNOWN')); assert.equal(m.downloads.length, 0); assert(!m.find('Review configuration file').disabled);
});
test('an unfinished async review cannot download and refreshing retires its late result', async () => {
    const pending = deferred(), ticket = review(); const m = model({ reviewRecovery: () => pending.promise }); await m.view.ready;
    m.find('Review configuration file').dispatch('click'); assert(!m.find('Download reviewed configuration'));
    await m.view.refresh(); pending.resolve(ticket); await tick(); assert(!m.find('Download reviewed configuration')); assert.equal(m.downloads.length, 0);
    assert(m.calls.some(x => x[0] === 'retire' && x[1] === ticket));
});
test('a new source cancels prior pending review; late old result cannot hide the newer rendered review', async () => {
    const old = deferred(), first = review(), second = review({ links: [{ title: 'Second copy', url: 'second.example' }], siteCount: 1 }); let n = 0;
    const m = model({ report: report([row(), row('copy_2')]), reviewRecovery: () => ++n === 1 ? old.promise : Promise.resolve(second) }); await m.view.ready;
    const buttons = m.host.querySelectorAll('button').filter(x => x.textContent === 'Review configuration file'); buttons[0].dispatch('click'); buttons[1].dispatch('click'); await tick();
    assert(m.allText().includes('Second copy')); old.resolve(first); await tick(); assert(m.allText().includes('Second copy')); assert.equal(m.host.querySelectorAll('.recovery-file-review').filter(x => !x.hidden).length, 1);
});
test('a failed new review retires a previous rendered download and cannot resurrect it', async () => {
    const m = model(); await open(m); const old = m.find('Download reviewed configuration');
    m.inspector.reviewRecovery = async () => { throw Error('failed'); }; m.find('Review configuration file').dispatch('click'); await tick(); old.dispatch('click');
    assert.equal(m.downloads.length, 0); assert(!m.find('Download reviewed configuration'));
});
test('closing the review retires download and repairs only focus owned by that panel', async () => {
    const m = model(); await open(m); const old = m.find('Download reviewed configuration'), close = m.find('Close file review'); close.focus(); close.dispatch('click');
    assert.equal(m.document.activeElement, m.find('Review configuration file')); old.dispatch('click'); assert.equal(m.downloads.length, 0);
    await open(m); const outside = m.document.createElement('textarea'); m.document.body.append(outside); outside.focus(); m.find('Close file review').dispatch('click'); assert.equal(m.document.activeElement, outside);
});
test('stale detached close buttons cannot retire a later source review', async () => {
    const m = model({ report: report([row(), row('copy_2')]) }); await open(m); const oldClose = m.find('Close file review');
    m.host.querySelectorAll('button').filter(x => x.textContent === 'Review configuration file')[1].dispatch('click'); await tick(); oldClose.dispatch('click');
    assert.equal(m.host.querySelectorAll('.recovery-file-review').filter(x => !x.hidden).length, 1); assert(m.find('Download reviewed configuration'));
});
test('investigation preview and download explicitly retire a configuration review', async () => {
    const m = model(); await open(m); const old = m.find('Download reviewed configuration'); m.find('Preview site text').dispatch('click'); old.dispatch('click'); assert.equal(m.downloads.length, 0);
    await open(m); m.find('Download investigation JSON').dispatch('click'); assert.equal(m.downloads.length, 1); assert.equal(m.downloads[0].filename, undefined); assert(!m.find('Download reviewed configuration'));
});
test('all file types share download cooldown and repeated keyboard events are suppressed', async () => {
    const m = model(); await open(m); const b = m.find('Download reviewed configuration'); assert(b.dispatch('keydown', { key: 'Enter', repeat: true }).prevented); assert(b.dispatch('keydown', { key: ' ', repeat: true }).prevented);
    b.dispatch('click'); b.dispatch('click'); m.find('Download investigation JSON').dispatch('click'); assert.equal(m.downloads.length, 1); m.cooldown(); b.dispatch('click'); assert.equal(m.downloads.length, 2);
});
test('failed file download revokes the review, keeps the original data path read-only, and exposes no exception', async () => {
    const m = model({ downloadError: true }); await open(m); const old = m.find('Download reviewed configuration'); old.dispatch('click'); assert(!m.find('Download reviewed configuration')); assert(!m.allText().includes('PRIVATE_DOWNLOAD_ERROR')); assert(m.allText().includes('No saved data was changed')); m.cooldown(); old.dispatch('click'); assert.equal(m.downloads.length, 0);
});
test('native download uses fixed configuration filename and revokes the object URL on click failure too', async () => {
    for (const clickError of [false, true]) { const m = model({ defaultDownload: true, clickError }); await open(m); m.find('Download reviewed configuration').dispatch('click'); assert.equal(m.downloads[0].filename, 'local-itab-reviewed-configuration.json'); assert.deepEqual(m.revoked, ['blob:synthetic-1']); assert.equal(m.host.querySelectorAll('a').length, 0); }
});
test('pending review cannot steal newer unrelated focus and focused request reaches rendered heading', async () => {
    const pending = deferred(); const m = model({ reviewRecovery: () => pending.promise }); await m.view.ready;
    const b = m.find('Review configuration file'); b.focus(); b.dispatch('click'); const outside = m.document.createElement('textarea'); m.document.body.append(outside); outside.focus(); pending.resolve(review()); await tick(); assert.equal(m.document.activeElement, outside);
    const focused = model(); await focused.view.ready; focused.find('Review configuration file').focus(); focused.find('Review configuration file').dispatch('click'); await tick(); assert.equal(focused.document.activeElement.textContent, 'Configuration file review');
});
test('visibility, suspension and destroy retire active and pending reviews with no stale download or late focus', async () => {
    const m = model(); await open(m); const old = m.find('Download reviewed configuration'); await m.visibility('hidden'); old.dispatch('click'); assert.equal(m.downloads.length, 0); assert.equal(m.host.querySelectorAll('.recovery-entry').length, 0);
    await m.visibility('visible'); assert(m.find('Review configuration file')); assert(!m.find('Download reviewed configuration')); await open(m); const latest = m.find('Download reviewed configuration'); m.view.suspend(); latest.dispatch('click'); assert.equal(m.downloads.length, 0); await m.view.resume(); await open(m); m.view.destroy(); assert(!m.document.listeners.has('visibilitychange')); assert.equal(m.host.querySelectorAll('.recovery-entry').length, 0);
});
test('raw and portable bilingual review labels, warnings and filenames remain explicit', async () => {
    for (const locale of ['en', 'zh_CN']) {
        const m = model({ locale }); await m.view.ready; const label = locale === 'en' ? 'Review configuration file' : '检查可导入配置文件'; m.find(label).dispatch('click'); await tick();
        const panel = m.host.querySelector('.recovery-file-review'); assert(!panel.hidden); assert(!text(panel).includes('recoveryReview')); assert(text(panel).includes(locale === 'en' ? 'may not contain your most recent edits' : '可能不包含最近的编辑'));
        m.find(locale === 'en' ? 'Download reviewed configuration' : '下载已审阅配置').dispatch('click'); assert.equal(m.downloads[0].filename, 'local-itab-reviewed-configuration.json');
    }
});

test('actual inspector and pure codec feed the rendered review and v2 file without additional reads or any writer bootstrap', async () => {
    const { webcrypto, createHash } = require('node:crypto'), Inspector = require('../shared/recovery-inspector'), Codec = require('../shared/configuration-codec');
    const config = Codec.createDefaultConfig(); config.schemaVersion = 2;
    config.links = ['https://example.test', 'https://example.test/', 'example.test'].map((url, i) => ({ title: 'Exact source ' + i, url, icon: 'S', category: 'work', layoutId: 'l_' + String(i + 1).repeat(32) }));
    config.layout.identityVersion = 1; config.layout.positions = Object.fromEntries(config.links.flatMap((link, i) => ['auth_notes', '__proto__', 'hidden|view'].map((view, j) => [view + '|' + link.url, { x: i * 100 + j + 0.25, y: -10 - i - j }])));
    config.layout.positionsById = Object.fromEntries(config.links.map((link, i) => [link.layoutId, Object.fromEntries([['__proto__', { x: i + 3.25, y: -9 }], ['auth_notes', { x: i + 20.5, y: -2 }]])]));
    const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
    const checksum = createHash('sha256').update(JSON.stringify(stable(config))).digest('hex');
    const raw = { quote: 'Current quote must remain', [Inspector.KEYS.restore]: { reason: 'beforeCloudReplacement', rawConfiguration: config, rawConfigurationChecksum: checksum }, auth: 'SYNTHETIC_GLOBAL_SECRET' }, before = structuredClone(raw), reads = [];
    const local = { async get(keys) { reads.push([...keys]); assert(!keys.includes('auth')); return Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, structuredClone(raw[key])])); }, async set() { assert.fail('Forbidden set'); }, async remove() { assert.fail('Forbidden remove'); }, async clear() { assert.fail('Forbidden clear'); } };
    const inspector = Inspector.createInspector({ local, crypto: webcrypto, now: () => NOW }), m = model({ inspector }); await m.view.ready;
    const readCount = reads.length;
    const reviewButton = m.host.querySelectorAll('button').find(node => node.textContent === 'Review configuration file' && !node.disabled); assert(reviewButton);
    const row = reviewButton.parentElement.parentElement;
    m.find('Preview site text', row).dispatch('click');
    const filter = row.querySelector('.recovery-site-filter'); assert(filter); filter.value = 'Exact source 2';
    m.find('Find site text', row).dispatch('click');
    assert.equal(row.querySelectorAll('.recovery-preview .recovery-site-url').length, 1);
    assert.equal(row.querySelector('.recovery-preview .recovery-site-list li').getAttribute('value'), '3');
    reviewButton.dispatch('click');
    for (let i = 0; i < 10 && !m.find('Download reviewed configuration'); i++) await tick();
    const panel = m.host.querySelectorAll('.recovery-file-review').find(node => !node.hidden); assert(panel); assert.equal(panel.querySelector('.recovery-site-filter'), null); assert.deepEqual(panel.querySelectorAll('.recovery-site-url').map(node => node.textContent), config.links.map(link => link.url));
    m.find('Download reviewed configuration').dispatch('click'); assert.equal(m.downloads.length, 1); const file = JSON.parse(m.downloads[0].json), imported = Codec.create().validateImportPayload(file);
    assert.equal(file.version, '2.0'); assert.deepEqual(imported.links, config.links); assert.deepEqual(imported.layout, config.layout); assert(!m.downloads[0].json.includes('SYNTHETIC_GLOBAL_SECRET')); assert.equal(reads.length, readCount); assert.deepEqual(raw, before);
});

test('failed refresh cannot keep the former reviewed file available', async () => {
    const m = model(); await open(m); const old = m.find('Download reviewed configuration');
    m.inspector.inspect = async () => { throw { code: 'READ_FAILED', message: 'PRIVATE_RELOAD_ERROR' }; };
    await m.view.refresh(); old.dispatch('click'); assert.equal(m.downloads.length, 0); assert.equal(m.host.querySelectorAll('.recovery-entry').length, 0); assert(!m.allText().includes('PRIVATE_RELOAD_ERROR')); assert(m.allText().includes('could not be read'));
});
test('hidden or destroyed pending review never renders a late success or enables a download', async () => {
    for (const mode of ['hidden', 'destroy']) {
        const pending = deferred(), ticket = review(); const m = model({ reviewRecovery: () => pending.promise }); await m.view.ready;
        m.find('Review configuration file').focus(); m.find('Review configuration file').dispatch('click');
        if (mode === 'hidden') await m.visibility('hidden'); else m.view.destroy();
        pending.resolve(ticket); await tick(); assert(!m.find('Download reviewed configuration')); assert.equal(m.host.querySelectorAll('.recovery-file-review').length, 0); assert.equal(m.downloads.length, 0);
        assert(m.calls.some(call => call[0] === 'retire' && call[1] === ticket));
    }
});
test('late failed review does not replace the newer source status or focus', async () => {
    const pending = deferred(); let n = 0;
    const m = model({ report: report([row(), row('copy_2')]), reviewRecovery: () => ++n === 1 ? pending.promise : Promise.resolve(review()) }); await m.view.ready;
    const choices = m.host.querySelectorAll('button').filter(node => node.textContent === 'Review configuration file'); choices[0].dispatch('click'); choices[1].dispatch('click'); await tick();
    const download = m.find('Download reviewed configuration'); download.focus(); pending.reject({ code: 'RECOVERY_FIELDS', message: 'PRIVATE_LATE_ERROR' }); await tick();
    assert.equal(m.document.activeElement, download); assert(m.allText().includes('selected copy passed')); assert(!m.allText().includes('PRIVATE_LATE_ERROR')); assert(!download.disabled);
});

test('changing workspace visibility retires rendered review and refuses stale download controls', async () => {
    const m = model({ search: '?workspace=named', report: report([row('named-copy', { source: { kind: 'beforeCloudReplacement', workspaceId: 'named', identityStatus: 'verified', representation: 'raw' } }), row('other-copy')]) });
    await open(m); const download = m.find('Download reviewed configuration'); assert(download && !download.disabled);
    m.find('Show all saved copies').dispatch('click'); download.dispatch('click');
    assert.equal(m.downloads.length, 0); assert(!m.find('Download reviewed configuration'));
    assert.equal(m.host.querySelectorAll('.recovery-entry').length, 2);
    m.find('Show requested workspace only').dispatch('click');
    assert.equal(m.host.querySelectorAll('.recovery-entry').length, 1); assert.equal(m.downloads.length, 0);
});

test('workspace visibility change retires an in-flight review result without rendering it', async () => {
    const wait = deferred(); const m = model({ search: '?workspace=named', report: report([row('named-copy', { source: { kind: 'beforeCloudReplacement', workspaceId: 'named', identityStatus: 'verified', representation: 'raw' } })]) });
    await m.view.ready; m.inspector.reviewRecovery = () => wait.promise;
    m.find('Review configuration file').dispatch('click'); m.find('Show all saved copies').dispatch('click');
    wait.resolve(review()); await tick();
    assert(!m.find('Download reviewed configuration')); assert.equal(m.downloads.length, 0);
});
