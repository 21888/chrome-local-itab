const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const source = fs.readFileSync('recovery.js', 'utf8');
const html = fs.readFileSync('recovery.html', 'utf8');
const text = node => [node.textContent || '', ...node.children.map(text)].join('\n');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const entry = extra => ({ id: 'copy_1', source: { kind: 'legacy', identityStatus: 'unverified', depth: 0, representation: 'configuration' }, recordedAt: null, timeKind: 'unknown', siteCount: 2, integrity: 'unverified', warnings: [], exportable: true, ...extra });
const report = (entries = [entry()], extra = {}) => ({ inspectedAt: '2026-10-14T10:20:30.000Z', entries, warnings: [], ...extra });
function model(options = {}) {
    const document = createDocument({ blurUnavailableFocus: true }), calls = [], downloads = [], blobs = [], revoked = [], timers = new Map(), events = new Map();
    let timerId = 0, nextReport = options.report || report(), links = options.links === undefined ? [{ title: 'Alpha', url: 'https://alpha.example.test' }, { title: 'Beta', url: 'https://beta.example.test' }] : options.links;
    const inspector = { inspect: async () => { calls.push(['inspect']); return nextReport; },
        preview: (r, id) => { calls.push(['preview', r, id]); return { links, omissions: options.omissions || [] }; },
        exportEntry: (r, id) => { calls.push(['exportEntry', r, id]); return JSON.stringify({ privateInvestigation: true, id }); } };
    if (options.inspect) inspector.inspect = options.inspect;
    const window = { document, location: { search: options.search || '' }, Blob, crypto: require('node:crypto').webcrypto,
        URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:synthetic-' + blobs.length; }, revokeObjectURL(url) { revoked.push(url); } },
        setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); },
        addEventListener(name, fn) { const list = events.get(name) || []; list.push(fn); events.set(name, list); },
        i18n: options.locale ? { t(key, substitutions = []) { const value = JSON.parse(fs.readFileSync(`_locales/${options.locale}/messages.json`, 'utf8'))[key]?.message || key; return value.replace(/\$(\d+)/g, (_, n) => substitutions[Number(n) - 1] || ''); }, localizeDocument() { document.documentElement.lang = options.locale === 'zh_CN' ? 'zh-CN' : 'en'; } } : undefined
    };
    const create = document.createElement;
    document.createElement = tag => { const node = create(tag); node.click = () => { if (node.tagName === 'A') { downloads.push({ filename: node.download, href: node.href }); if (options.clickError) throw Error('PRIVATE_CLICK_ERROR'); } node.dispatch('click'); }; return node; };
    // These dependencies would be dangerous bootstraps in a recovery surface.
    for (const name of ['LocalItabWorkspaces', 'storageManager', 'fetch', 'XMLHttpRequest', 'Image']) Object.defineProperty(window, name, { get() { throw Error('Forbidden dependency: ' + name); } });
    vm.runInNewContext(source, { window });
    const host = document.createElement('section'); document.body.append(host);
    if (options.locale) window.i18n.localizeDocument(document);
    const view = window.LocalItabRecoveryView.mount({ host, inspector: options.missingInspector ? undefined : inspector, ...(options.defaultDownload ? {} : { download: json => { if (options.downloadError) throw Error('PRIVATE_DOWNLOAD_ERROR'); downloads.push(json); } }) });
    const find = (label, scope = host) => scope.querySelectorAll('button').find(node => node.textContent === label);
    return { document, window, host, view, inspector, calls, downloads, blobs, revoked, timers, events, find,
        allText: () => text(host), setReport: value => { nextReport = value; }, setLinks: value => { links = value; },
        cooldown() { for (const [id, timer] of [...timers]) { timers.delete(id); timer.fn(); } }
    };
}

test('independent page loads only pure codecs, inspector, i18n and UI; CSP blocks networking and all images', () => {
    assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]), ['i18n.js', 'shared/layout-identity.js', 'shared/dashboard-template-registry.js', 'shared/world-clocks.js', 'shared/stored-shortcut-url.js', 'shared/configuration-codec.js', 'shared/recovery-file.js', 'shared/import-closure.js', 'shared/recovery-inspector.js', 'recovery.js']);
    for (const directive of ["default-src 'none'", "connect-src 'none'", "img-src 'none'", "object-src 'none'", "form-action 'none'", "base-uri 'none'"]) assert(html.includes(directive));
    assert(!/<(?:img|iframe|object|embed)\b/i.test(html));
    assert(!/innerHTML|outerHTML|insertAdjacentHTML|\.getAll\(|\.ready\(|storageManager|LocalItabWorkspaces|\.sync\b|fetch\(/.test(source));
    assert(!/\.storage\.local\.(?:set|remove|clear)\b/.test(source));
    assert(!html.includes('drive-backup'));
});

test('both static entry points are available without workspace initialization and preserve the old page', () => {
    for (const file of ['newtab.html', 'options.html']) {
        const page = fs.readFileSync(file, 'utf8');
        const anchor = [...page.matchAll(/<a\b[^>]*href="recovery\.html"[^>]*>/g)]; assert.equal(anchor.length, 1, file);
        assert(anchor[0][0].includes('target="_blank"')); assert(anchor[0][0].includes('rel="noopener"'));
        assert(page.indexOf(anchor[0][0]) < page.indexOf('<script '));
        assert(page.slice(page.indexOf('id="workspace-switcher"'), page.indexOf(anchor[0][0])).length < 150);
    }
    const workspace = fs.readFileSync('shared/workspaces-view.js', 'utf8');
    assert(workspace.includes('inspectionLink(loadBanner)')); assert(workspace.includes('inspectionLink(legacyBanner)'));
    assert(workspace.includes("link.target = '_blank'; link.rel = 'noopener'"));
});

test('runtime package explicitly includes every recovery dependency', () => {
    const packageSource = fs.readFileSync('tools/package_extension.py', 'utf8');
    for (const file of ['recovery.html', 'recovery.css', 'recovery.js', 'shared/recovery-inspector.js', 'shared/recovery-file.js']) assert(packageSource.includes('"' + file + '"'));
});

test('first inspection shows metadata only; site preview and export require explicit clicks', async () => {
    const m = model(); await m.view.ready;
    assert.deepEqual(m.calls.map(call => call[0]), ['inspect']); assert.equal(m.downloads.length, 0);
    assert(!m.allText().includes('alpha.example.test')); assert.equal(m.host.querySelectorAll('.recovery-site-url').length, 0);
    assert(m.allText().includes('Unknown')); assert(m.allText().includes('Not verified')); assert(m.allText().includes('Configuration copy'));
    assert.equal(m.find('Preview site text').getAttribute('aria-expanded'), 'false');
    m.find('Preview site text').dispatch('click');
    assert(m.allText().includes('https://alpha.example.test')); assert.equal(m.calls.filter(call => call[0] === 'preview').length, 1);
    assert.equal(m.downloads.length, 0); assert.equal(m.find('Hide site text').getAttribute('aria-expanded'), 'true');
    m.find('Hide site text').dispatch('click'); assert.equal(m.host.querySelectorAll('.recovery-site-url').length, 0);
});

test('untrusted names, titles, URLs, missing fields, blanks and duplicate records are literal text only', async () => {
    const hostile = '<img src="https://private.example.test" onerror="alert(1)">';
    const links = [{ title: hostile, url: 'javascript:alert(1)', icon: 'https://icon.example.test/x.png' }, { title: '', url: '' }, {}, { title: hostile, url: 'javascript:alert(1)' }];
    const m = model({ report: report([entry({ source: { kind: 'workspace', workspaceName: hostile, workspaceId: '<script>', identityStatus: 'unverified' }, siteCount: 4 })]), links }); await m.view.ready;
    m.find('Preview site text').dispatch('click');
    assert.equal(m.host.querySelectorAll('.recovery-site-list li').length, 4);
    assert.equal(m.host.querySelectorAll('.recovery-site-title')[0].textContent, hostile);
    assert.equal(m.host.querySelectorAll('.recovery-site-title')[1].textContent, '');
    assert.equal(m.host.querySelectorAll('.recovery-site-title')[2].textContent, '[Title field missing]');
    assert.equal(m.host.querySelectorAll('.recovery-site-url')[2].textContent, '[URL field missing]');
    assert.equal(m.host.querySelectorAll('a, img, iframe, script, object').length, 0);
    assert(!m.allText().includes('icon.example.test')); assert(m.allText().includes(hostile));
    for (const element of m.host.querySelectorAll('.recovery-site-title, .recovery-site-url')) assert.equal(element.children.length, 0);
});

test('unknown or invalid counts never become zero; an actual empty array remains explicit', async () => {
    const m = model({ report: report([entry({ siteCount: null }), entry({ id: 'missing', siteCount: undefined }), entry({ id: 'empty', siteCount: 0 })]), links: null }); await m.view.ready;
    const rows = m.host.querySelectorAll('.recovery-entry');
    assert(text(rows[0]).includes('Unknown · missing or unreadable')); assert(text(rows[1]).includes('Unknown · missing or unreadable'));
    assert(rows[2].querySelectorAll('dd').some(node => node.textContent === '0'));
    m.find('Preview site text', rows[0]).dispatch('click'); assert(text(rows[0]).includes('That is not a count of zero'));
    m.setLinks([]); m.find('Preview site text', rows[2]).dispatch('click'); assert(text(rows[2]).includes('empty site-record array'));
});

test('all supported source kinds, format, Trash attribution and genuine timestamps have explicit labels', async () => {
    const kinds = ['preMigration', 'legacy', 'workspace', 'beforeCloudReplacement', 'beforeCloudClear', 'identityRecovery', 'recovery'];
    const m = model({ report: report(kinds.map((kind, i) => entry({ id: 'row' + i, source: { kind, workspaceId: 'synthetic', workspaceName: 'Work', identityStatus: i ? 'unverified' : 'verified', depth: i, representation: i ? 'raw' : 'portable', deleted: true }, recordedAt: '2026-10-14T00:00:00.000Z', timeKind: i ? 'backup' : 'migration', integrity: i ? 'failed' : 'verified' }))) }); await m.view.ready;
    const words = m.allText();
    for (const label of ['Before workspace migration', 'Previous local storage format', 'Workspace copy', 'Before cloud replacement', 'Cloud copy retained before clearing', 'Layout identity recovery copy', 'Retained recovery copy', 'Listed in Trash in this saved record', 'Verified against the inspected registry', 'Migration time', 'Backup time', 'Checks passed', 'Checks failed', 'Portable copy', 'Retained raw copy']) assert(words.includes(label), label);
});

test('warnings and omissions use a fixed vocabulary and never echo unknown codes', async () => {
    const codes = ['INVALID_SOURCE', 'UNKNOWN_FIELDS_OMITTED', 'INVALID_FIELDS_OMITTED', 'PRIVATE_FIELDS_OMITTED', 'SIZE_LIMIT', 'CHAIN_LIMIT', 'REGISTRY_INVALID', 'BUNDLE_MISSING', 'UNVERIFIED_SOURCE', 'CHECKSUM_MISSING', 'CHECKSUM_FAILED', 'RECORD_TIME_UNKNOWN', 'CONTENT_DIFFERS', 'CREDENTIAL_URL_OMITTED', 'PRIVATE_SECRET_CODE', '__proto__', 'constructor'];
    const m = model({ report: report([entry({ warnings: codes })], { warnings: codes }), omissions: codes }); await m.view.ready;
    m.find('Preview site text').dispatch('click');
    assert(!m.allText().includes('PRIVATE_SECRET_CODE')); assert(!m.allText().includes('__proto__')); assert(!m.allText().includes('constructor'));
    assert(m.allText().includes('URLs containing recognized credentials are omitted'));
    assert.equal(m.host.querySelectorAll('.recovery-warnings').length, 3);
    for (const list of m.host.querySelectorAll('.recovery-warnings')) assert.equal(list.children.length, 15);
});

test('download uses exactly the current report and re-previews before export without an implicit refresh', async () => {
    const snapshot = report(), m = model({ report: snapshot }); await m.view.ready;
    m.find('Download investigation JSON').dispatch('click');
    assert.deepEqual(m.calls.map(call => call[0]), ['inspect', 'preview', 'exportEntry']);
    assert.equal(m.calls[1][1], snapshot); assert.equal(m.calls[2][1], snapshot); assert.equal(m.calls[1][2], snapshot.entries[0].id);
    assert.equal(m.downloads.length, 1); assert(m.allText().includes('cannot be imported directly'));
    assert.equal(m.host.querySelectorAll('.recovery-site-url').length, 0);
});

test('preview failure blocks export; raw exception contents are never shown', async () => {
    const m = model(); await m.view.ready; m.inspector.preview = () => { throw Error('PRIVATE_PREVIEW_ERROR'); };
    m.find('Preview site text').dispatch('click'); assert(m.allText().includes('Could not preview'));
    m.find('Download investigation JSON').dispatch('click');
    assert.equal(m.downloads.length, 0); assert(!m.calls.some(call => call[0] === 'exportEntry')); assert(!m.allText().includes('PRIVATE_PREVIEW_ERROR'));
    assert(m.allText().includes('Could not prepare'));
});

test('nonexportable rows remain inspectable but cannot download even on repeated activation', async () => {
    const m = model({ report: report([entry({ exportable: false })]) }); await m.view.ready;
    const button = m.find('Download investigation JSON'); assert(button.disabled); button.dispatch('click'); button.dispatch('click');
    assert.equal(m.downloads.length, 0); assert(m.allText().includes('unavailable for this record'));
    m.find('Preview site text').dispatch('click'); assert(m.allText().includes('alpha.example.test'));
});

test('all download buttons share a throttle; repeated keyboard events are suppressed', async () => {
    const m = model({ report: report([entry(), entry({ id: 'second' })]) }); await m.view.ready;
    const buttons = m.host.querySelectorAll('[data-recovery-download]');
    assert(buttons[0].dispatch('keydown', { key: 'Enter', repeat: true }).prevented);
    assert(buttons[0].dispatch('keydown', { key: ' ', repeat: true }).prevented);
    buttons[0].dispatch('click'); buttons[0].dispatch('click'); buttons[1].dispatch('click');
    assert.equal(m.downloads.length, 1); assert(buttons.every(button => button.disabled));
    assert.equal([...m.timers.values()][0].delay, 1200);
    m.cooldown(); buttons[1].dispatch('click'); assert.equal(m.downloads.length, 2);
});

test('the actual browser download uses a fixed filename and immediately revokes its URL and removes the anchor', async () => {
    const m = model({ defaultDownload: true, report: report([entry({ source: { kind: 'workspace', workspaceName: '../../PRIVATE_NAME' } })]) }); await m.view.ready;
    m.find('Download investigation JSON').dispatch('click');
    assert.equal(m.downloads.length, 1); assert.equal(m.downloads[0].filename, 'local-itab-readonly-investigation.json');
    assert.deepEqual(m.revoked, ['blob:synthetic-1']); assert.equal(m.document.querySelectorAll('a').length, 0);
    assert.equal(m.blobs[0].type, 'application/json;charset=utf-8'); assert.equal(JSON.parse(await m.blobs[0].text()).privateInvestigation, true);
});

test('download cleanup also runs when native anchor click throws', async () => {
    const m = model({ defaultDownload: true, clickError: true }); await m.view.ready;
    m.find('Download investigation JSON').dispatch('click'); assert.deepEqual(m.revoked, ['blob:synthetic-1']);
    assert.equal(m.document.querySelectorAll('a').length, 0); assert(m.allText().includes('Could not prepare'));
    assert(!m.allText().includes('PRIVATE_CLICK_ERROR'));
});

test('a new refresh invalidates all old preview/export closures immediately', async () => {
    const m = model(); await m.view.ready;
    const oldPreview = m.find('Preview site text'), oldDownload = m.find('Download investigation JSON');
    const wait = deferred(); m.inspector.inspect = () => wait.promise; const pending = m.view.refresh();
    oldPreview.dispatch('click'); oldDownload.dispatch('click');
    assert.equal(m.host.querySelectorAll('.recovery-entry').length, 0); assert.equal(m.calls.filter(call => call[0] === 'preview').length, 0);
    wait.resolve(report([entry({ id: 'new' })])); await pending;
    oldDownload.dispatch('click'); assert.equal(m.downloads.length, 0);
});

test('older inspection successes and errors cannot replace a newer refresh result', async () => {
    const first = deferred(), second = deferred(); let call = 0;
    const m = model({ inspect: () => (++call === 1 ? first.promise : second.promise) });
    const newer = m.view.refresh(); second.resolve(report([entry({ source: { kind: 'workspace', workspaceName: 'New snapshot' } })])); await newer;
    first.resolve(report([entry({ source: { kind: 'workspace', workspaceName: 'Old snapshot' } })])); await m.view.ready;
    assert(m.allText().includes('New snapshot')); assert(!m.allText().includes('Old snapshot'));
    const oldError = deferred(), fresh = deferred(); call = 0; m.inspector.inspect = () => (++call === 1 ? oldError.promise : fresh.promise);
    const stalePending = m.view.refresh(), freshPending = m.view.refresh(); fresh.resolve(report([entry({ source: { kind: 'workspace', workspaceName: 'Latest snapshot' } })])); await freshPending;
    oldError.reject({ code: 'READ_FAILED', message: 'PRIVATE_OLD_ERROR' }); await stalePending;
    assert(m.allText().includes('Latest snapshot')); assert(!m.allText().includes('READ_FAILED')); assert(!m.allText().includes('PRIVATE_OLD_ERROR'));
});

for (const code of ['READ_FAILED', 'CHANGED', 'SIZE_LIMIT', 'INVALID', 'PRIVATE_SECRET_ERROR', 'constructor']) test(`inspection failure ${code} exposes fixed messages only and permits a retry`, async () => {
    const m = model({ inspect: async () => { throw { code, message: 'PRIVATE_ERROR_MESSAGE' }; } }); await m.view.ready;
    assert.equal(m.host.querySelectorAll('.recovery-entry').length, 0); assert.equal(m.downloads.length, 0);
    assert(!m.allText().includes('PRIVATE_')); assert(!m.allText().includes('constructor'));
    assert(!m.find('Refresh inspection').disabled); assert.equal(m.host.getAttribute('aria-busy'), 'false');
    m.inspector.inspect = async () => report(); await m.view.refresh(); assert.equal(m.host.querySelectorAll('.recovery-entry').length, 1);
});

test('unavailable inspector and empty storage make no deletion or recovery promise', async () => {
    const unavailable = model({ missingInspector: true }); await unavailable.view.ready; assert(unavailable.allText().includes('inspection is unavailable'));
    const empty = model({ report: report([]) }); await empty.view.ready;
    assert(empty.allText().includes('does not prove that your content was deleted')); assert.equal(empty.host.querySelectorAll('[data-recovery-download]').length, 0);
    assert(html.includes('Unverified records do not guarantee recovery')); assert(html.includes('not recovery backups that can be imported directly'));
});

test('large previews paginate without mutating the order or dropping blank records', async () => {
    const links = Array.from({ length: 205 }, (_, i) => i === 103 ? {} : { title: 'Synthetic ' + i, url: 'https://example.test/' + i });
    const before = JSON.stringify(links), m = model({ links }); await m.view.ready; m.find('Preview site text').dispatch('click');
    assert.equal(m.host.querySelectorAll('.recovery-site-list li').length, 100); assert(m.find('Previous sites').disabled);
    m.find('Next sites').dispatch('click'); assert.equal(m.host.querySelector('.recovery-site-list').getAttribute('start'), '101');
    assert.equal(m.host.querySelectorAll('.recovery-site-title')[3].textContent, '[Title field missing]');
    const next = m.find('Next sites'); next.focus(); next.dispatch('click'); assert.equal(m.host.querySelectorAll('.recovery-site-list li').length, 5);
    assert(next.disabled); assert.equal(m.document.activeElement, m.find('Previous sites')); assert.equal(m.host.querySelectorAll('.recovery-site-title')[4].textContent, 'Synthetic 204');
    m.find('Previous sites').dispatch('click'); assert.equal(m.host.querySelectorAll('.recovery-site-title')[0].textContent, 'Synthetic 100');
    assert.equal(JSON.stringify(links), before);
});

test('refresh and download preserve owned keyboard focus without stealing later user focus', async () => {
    const m = model(); await m.view.ready; const refresh = m.find('Refresh inspection'); refresh.focus();
    const wait = deferred(); m.inspector.inspect = () => wait.promise; const pending = m.view.refresh();
    assert.equal(m.document.activeElement, m.host.querySelector('.recovery-status')); wait.resolve(report()); await pending;
    assert.equal(m.document.activeElement, refresh);
    const download = m.find('Download investigation JSON'); download.focus(); download.dispatch('click'); assert.equal(m.document.activeElement, m.host.querySelector('.recovery-status'));
    m.cooldown(); assert.equal(m.document.activeElement, download);
    download.dispatch('click'); refresh.focus(); m.cooldown(); assert.equal(m.document.activeElement, refresh);
});

test('suspend/destroy invalidates in-flight results, old controls and download timers', async () => {
    const m = model(); await m.view.ready; const oldDownload = m.find('Download investigation JSON'); oldDownload.dispatch('click'); assert.equal(m.timers.size, 1);
    const wait = deferred(); m.inspector.inspect = () => wait.promise; const pending = m.view.refresh(); m.view.suspend();
    assert.equal(m.timers.size, 0); wait.resolve(report()); await pending; assert.equal(m.host.querySelectorAll('.recovery-entry').length, 0);
    oldDownload.dispatch('click'); assert.equal(m.downloads.length, 1);
    m.inspector.inspect = async () => report(); await m.view.resume(); assert.equal(m.host.querySelectorAll('.recovery-entry').length, 1);
    const current = m.find('Download investigation JSON'); m.view.destroy(); current.dispatch('click'); await m.view.refresh(); assert.equal(m.downloads.length, 1);
});

test('both locale catalogs cover every static/dynamic recovery string, warnings and entry point', async () => {
    const en = JSON.parse(fs.readFileSync('_locales/en/messages.json', 'utf8')), zh = JSON.parse(fs.readFileSync('_locales/zh_CN/messages.json', 'utf8'));
    const dynamic = vm.runInNewContext('(' + source.slice(source.indexOf('const copy = ') + 13, source.indexOf('\n    const sources')).trim().replace(/;$/, '') + ')');
    const required = [...Object.keys(dynamic).map(key => 'recovery' + key), ...[...html.matchAll(/data-i18n(?:-aria-label)?="([^"]+)"/g)].map(match => match[1]), 'recoveryEntry', 'spacesInspectRecovery'];
    for (const key of required) { assert(en[key]?.message, key); assert(zh[key]?.message, key); assert(zh[key].message !== en[key].message, key); }
    const m = model({ locale: 'zh_CN', omissions: ['CREDENTIAL_URL_OMITTED'] }); await m.view.ready;
    assert(m.allText().includes('已保存的本地副本')); assert(m.allText().includes('记录时间（此设备时间）'));
    m.find('预览站点文字').dispatch('click'); assert(m.allText().includes('包含可识别凭据的网址')); m.find('下载调查 JSON').dispatch('click'); assert(m.allText().includes('此文件不能直接作为恢复备份导入'));
});

test('responsive, keyboard and high-contrast styles remain local and have no image URL or animation dependency', () => {
    const css = fs.readFileSync('recovery.css', 'utf8');
    for (const rule of [':focus-visible', 'min-height: 44px', 'overflow-wrap: anywhere', 'max-width: 600px', 'prefers-color-scheme: dark', 'forced-colors: active', '[hidden]']) assert(css.includes(rule), rule);
    assert(!/url\(|@import|animation:|transition:/.test(css));
    assert(html.includes('class="recovery-skip"')); assert(html.includes('id="recovery-main"'));
});

test('real inspector bootstrap reads synthetic local records with no writer, workspace, Sync or cloud dependencies', async () => {
    const document = createDocument(), events = new Map(), keysRead = [], writes = [], fakeData = { links: [{ title: 'Synthetic saved site', url: 'https://example.test/retained', icon: 'https://example.test/icon.png' }] };
    const host = document.createElement('section'); host.id = 'recovery-inspection'; document.body.append(host);
    const reject = label => { writes.push(label); throw Error('Forbidden ' + label); };
    const local = { async get(keys) { keysRead.push(keys); return structuredClone(Object.fromEntries(keys.filter(key => Object.hasOwn(fakeData, key)).map(key => [key, fakeData[key]]))); }, set: () => reject('set'), clear: () => reject('clear'), remove: () => reject('remove') };
    let inspection;
    const core = require('../shared/recovery-inspector');
    const window = { document, crypto: require('node:crypto').webcrypto, LocalItabRecovery: { createInspector(options) { const api = core.createInspector(options); return { ...api, inspect() { inspection = api.inspect(); return inspection; } }; } },
        chrome: { storage: { local, get sync() { return reject('sync'); } } }, setTimeout, clearTimeout,
        addEventListener(name, fn) { events.set(name, fn); } };
    for (const name of ['LocalItabWorkspaces', 'storageManager', 'fetch', 'XMLHttpRequest']) Object.defineProperty(window, name, { get() { return reject(name); } });
    vm.runInNewContext(source, { window });
    await inspection; await tick();
    assert(host.querySelector('.recovery-entry')); assert(keysRead.length >= 2); assert.deepEqual(writes, []);
    assert(!text(host).includes('example.test/retained'));
    host.querySelectorAll('button').find(node => node.textContent === 'Preview site text').dispatch('click');
    assert(text(host).includes('https://example.test/retained')); assert.equal(host.querySelectorAll('img, a').length, 0);
    events.get('pagehide')({ persisted: true }); assert.equal(host.querySelectorAll('.recovery-entry').length, 0);
    events.get('pageshow')({ persisted: true });
    await inspection; await tick();
    assert(host.querySelector('.recovery-entry')); assert.deepEqual(writes, []);
    events.get('pagehide')({ persisted: false });
});

test('huge preview fields are visibly truncated without changing exported values or dropping malformed rows', async () => {
    const longTitle = 'T'.repeat(3999) + '🌿' + 'X'.repeat(10000), longUrl = 'https://example.test/' + 'q'.repeat(20000);
    const links = [{ title: longTitle, url: longUrl }, null];
    const m = model({ links, report: report([entry({ siteCount: 2 })]) }); await m.view.ready;
    m.inspector.exportEntry = () => JSON.stringify({ links });
    m.find('Preview site text').dispatch('click');
    assert.equal(m.host.querySelectorAll('.recovery-site-title')[0].textContent, 'T'.repeat(3999));
    assert.equal(m.host.querySelectorAll('.recovery-site-url')[0].textContent.length, 4000);
    assert.equal(m.host.querySelectorAll('.recovery-site-title')[1].textContent, '[Title field missing]');
    assert(m.allText().includes('first 4,000 characters')); assert.equal(m.host.querySelectorAll('.recovery-site-list li').length, 2);
    m.find('Download investigation JSON').dispatch('click');
    assert.equal(JSON.parse(m.downloads[0]).links[0].title, longTitle); assert.equal(JSON.parse(m.downloads[0]).links[0].url, longUrl);
});

const scopedEntry = (id, workspaceId, extra = {}) => entry({ id, source: { kind: 'workspace', workspaceId, workspaceName: 'Synthetic ' + workspaceId, identityStatus: 'verified', representation: 'configuration', ...extra } });
const scopedReport = () => report([entry({ id: 'unattributed' }), scopedEntry('default-row', 'default'), scopedEntry('named-row', 'named'), scopedEntry('trash-row', 'trash', { deleted: true }), scopedEntry('uncertain-row', 'named', { identityStatus: 'unverified' })]);

test('direct Recovery entry explicitly shows the global inventory without selecting or exporting', async () => {
    const m = model({ report: scopedReport() }); await m.view.ready;
    assert.equal(m.host.querySelectorAll('.recovery-entry').length, 5);
    assert(m.allText().includes('all workspaces, including unattributed records'));
    assert.equal(m.find('Show all saved copies').hidden, true);
    assert.deepEqual(m.calls.map(c => c[0]), ['inspect']); assert.equal(m.downloads.length, 0);
});

for (const id of ['default', 'named', 'trash']) test(`workspace query ${id} scopes only verified-attribution rows and preserves labels`, async () => {
    const m = model({ search: '?workspace=' + id, report: scopedReport() }); await m.view.ready;
    const rows = m.host.querySelectorAll('.recovery-entry'); assert.equal(rows.length, 1);
    assert(text(rows[0]).includes(id)); assert(m.allText().includes('4 other or unattributed copies are hidden'));
    if (id === 'trash') assert(text(rows[0]).includes('Listed in Trash'));
    assert.deepEqual(m.calls.map(c => c[0]), ['inspect']); assert.equal(m.downloads.length, 0);
    m.find('Show all saved copies').focus(); m.find('Show all saved copies').dispatch('click');
    assert.equal(m.host.querySelectorAll('.recovery-entry').length, 5);
    assert(m.allText().includes('All 5 saved copies')); assert.equal(m.document.activeElement, m.find('Show requested workspace only'));
    m.find('Show requested workspace only').dispatch('click');
    assert.equal(m.host.querySelectorAll('.recovery-entry').length, 1);
    m.find('Preview site text').dispatch('click');
    assert.equal(m.calls.find(c => c[0] === 'preview')[2], id + '-row');
});

for (const query of ['?workspace=', '?workspace', '?workspace=named&workspace=default', '?workspace=named&workspace=named', '?workspace=%E0%A4%A', '?workspace=%3Cimg%3E', '?workspace=' + 'a'.repeat(101), '?' + 'x'.repeat(8193)]) test(`ambiguous or invalid workspace query is never a silent fallback (${query.slice(0, 70)})`, async () => {
    const m = model({ search: query, report: scopedReport() }); await m.view.ready;
    assert.equal(m.host.querySelectorAll('.recovery-entry').length, 0);
    assert(m.allText().includes('invalid or ambiguous')); assert(m.allText().includes('No workspace has been selected'));
    assert.equal(m.host.querySelectorAll('img, script').length, 0); assert.equal(m.downloads.length, 0);
    m.find('Show all saved copies').dispatch('click');
    assert.equal(m.host.querySelectorAll('.recovery-entry').length, 5);
    assert(m.allText().includes('invalid or ambiguous'));
    m.find('Return to workspace warning').dispatch('click'); assert.equal(m.host.querySelectorAll('.recovery-entry').length, 0);
});

test('unknown and unverified-only workspaces never claim a match, but preserve explicit global access', async () => {
    for (const id of ['missing', 'named']) {
        const r = report([scopedEntry('uncertain', 'named', { identityStatus: 'unverified' }), scopedEntry('other', 'default')]);
        const m = model({ search: '?workspace=' + id, report: r }); await m.view.ready;
        assert.equal(m.host.querySelectorAll('.recovery-entry').length, 0);
        assert(m.allText().includes('No copies with verified attribution'));
        m.find('Show all saved copies').dispatch('click');
        assert.equal(m.host.querySelectorAll('.recovery-entry').length, 2);
        assert(m.allText().includes('No copies with verified attribution'));
    }
});

test('refresh and resume recompute workspace matching without keeping stale rows or exports', async () => {
    const m = model({ search: '?workspace=named', report: scopedReport() }); await m.view.ready;
    m.setReport(report([scopedEntry('default-only', 'default')])); await m.view.refresh();
    assert.equal(m.host.querySelectorAll('.recovery-entry').length, 0); assert(m.allText().includes('No copies with verified attribution'));
    m.setReport(scopedReport()); m.view.suspend(); await m.view.resume();
    assert.equal(m.host.querySelectorAll('.recovery-entry').length, 1); assert.equal(m.downloads.length, 0);
});

test('percent-encoded workspace parameter is decoded once, with no generated markup', async () => {
    const m = model({ search: '?%77orkspace=%6eamed', report: scopedReport() }); await m.view.ready;
    assert.equal(m.host.querySelectorAll('.recovery-entry').length, 1); assert(m.allText().includes('Requested workspace ID: named'));
});

test('Chinese workspace context includes hidden-copy disclosure and an explicit global choice', async () => {
    const m = model({ search: '?workspace=named', report: scopedReport(), locale: 'zh_CN' }); await m.view.ready;
    assert(m.allText().includes('请求的工作区 ID：named')); assert(m.allText().includes('另有 4 份'));
    m.find('查看全部本地副本').dispatch('click'); assert(m.allText().includes('全部 5 份')); assert(m.find('仅查看请求的工作区'));
});

test('actual automatic bootstrap scopes the real inspector snapshot and never boots a writer', async () => {
    const core = require('../shared/recovery-inspector'), now = '2026-10-15T00:00:00.000Z';
    const raw = { [core.KEYS.registry]: { schemaVersion: 1, revision: 0, defaultId: 'default', lastUsedId: 'default', migrationId: 'm1', workspaces: ['default', 'named'].map((id, order) => ({ id, generation: 'g1', name: 'Synthetic ' + id, order, createdAt: now, updatedAt: now, deletedAt: null })) }, [core.KEYS.activation]: { schemaVersion: 1, defaultId: 'default', migrationId: 'm1' } };
    for (const id of ['default', 'named']) raw['__localItabWorkspaceV1:' + id + ':g1'] = { schemaVersion: 1, id, generation: 'g1', values: { links: [{ title: 'Synthetic ' + id, url: 'https://example.invalid/' + id }] } };
    for (const search of ['?workspace=named', '?workspace=missing', '?workspace=named&workspace=default']) {
        const document = createDocument(), host = document.createElement('section'), forbidden = []; host.id = 'recovery-inspection'; document.body.append(host);
        let inspection;
        const reject = label => { forbidden.push(label); throw Error(label); };
        const local = { async get(keys) { return structuredClone(Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]]))); }, set: () => reject('set'), remove: () => reject('remove'), clear: () => reject('clear') };
        const window = { document, location: { search }, crypto: require('node:crypto').webcrypto, chrome: { storage: { local, get sync() { return reject('sync'); } } }, setTimeout, clearTimeout, addEventListener() {}, LocalItabRecovery: { createInspector(options) { const api = core.createInspector(options); return { ...api, inspect() { inspection = api.inspect(); return inspection; } }; } } };
        for (const key of ['storageManager', 'LocalItabWorkspaces', 'fetch', 'XMLHttpRequest']) Object.defineProperty(window, key, { get() { return reject(key); } });
        vm.runInNewContext(source, { window }); await inspection; await tick();
        assert.equal(host.querySelectorAll('.recovery-entry').length, search === '?workspace=named' ? 1 : 0);
        if (search === '?workspace=named') assert(text(host.querySelector('.recovery-entry')).includes('named'));
        host.querySelectorAll('button').find(b => b.textContent === 'Show all saved copies').dispatch('click');
        assert.equal(host.querySelectorAll('.recovery-entry').length, 2); assert.deepEqual(forbidden, []);
    }
});

const historicalEntry = (id, workspaceId, extra = {}) => entry({ id, source: { kind: 'historicalWorkspace', workspaceId, workspaceName: 'Historical synthetic workspace',
    identityStatus: 'historical', historical: true, workspaceGeneration: 'old_generation', snapshotAt: '2026-10-12T10:00:00.000Z', currentRelation: 'absent',
    representation: 'configuration', ...extra }, timeKind: 'snapshot', recordedAt: '2026-10-12T10:00:00.000Z' });

test('historical-only query matches disclose earlier attribution, generation and absent current membership', async () => {
    const m = model({ search: '?workspace=retired', report: report([scopedEntry('current', 'default'), historicalEntry('old', 'retired', { deleted: true })]) });
    await m.view.ready;
    assert.equal(m.host.querySelectorAll('.recovery-entry').length, 1);
    assert(m.allText().includes('0 current-registry copies and 1 historical-registry copies'));
    assert(m.allText().includes('Historical matches do not mean this workspace is currently present'));
    assert(m.allText().includes('retained historical registry')); assert(m.allText().includes('old_generation'));
    assert(m.allText().includes('not listed in the current registry')); assert(m.allText().includes('Listed in Trash'));
    assert(!m.allText().includes('No copies with verified attribution'));
    assert.deepEqual(m.calls.map(call => call[0]), ['inspect']); assert.equal(m.downloads.length, 0);
    const stale = m.find('Download investigation JSON');
    m.find('Show all saved copies').dispatch('click'); stale.dispatch('click');
    assert.equal(m.downloads.length, 0); assert.equal(m.host.querySelectorAll('.recovery-entry').length, 2);
    assert(m.allText().includes('0 current-registry copies and 1 historical-registry copies'));
});

for (const locale of ['en', 'zh_CN']) test(`mixed current and historical query remains distinct and refresh removes old rows (${locale})`, async () => {
    const m = model({ locale, search: '?workspace=default', report: report([scopedEntry('now', 'default'), historicalEntry('old', 'default', { currentRelation: 'differentGeneration' })]) });
    await m.view.ready;
    assert.equal(m.host.querySelectorAll('.recovery-entry').length, 2);
    assert(m.allText().includes(locale === 'en' ? '1 current-registry copies and 1 historical-registry copies' : '1 份当前登记归属的副本和 1 份历史登记归属的副本'));
    assert(m.allText().includes(locale === 'en' ? 'different generation' : '代际不同'));
    assert(m.allText().includes('old_generation'));
    const stale = m.find(locale === 'en' ? 'Download investigation JSON' : '下载调查 JSON');
    m.setReport(report([scopedEntry('fresh', 'default')])); await m.view.refresh();
    if (stale) stale.dispatch('click');
    assert.equal(m.host.querySelectorAll('.recovery-entry').length, 1); assert(!m.allText().includes('old_generation')); assert.equal(m.downloads.length, 0);
});

test('invalid query does not silently expose historical rows before explicit all choice', async () => {
    const m = model({ search: '?workspace=retired&workspace=retired', report: report([historicalEntry('old', 'retired')]) });
    await m.view.ready; assert.equal(m.host.querySelectorAll('.recovery-entry').length, 0);
    m.find('Show all saved copies').dispatch('click'); assert.equal(m.host.querySelectorAll('.recovery-entry').length, 1);
    assert(m.allText().includes('invalid or ambiguous')); assert.equal(m.downloads.length, 0);
});

test('preview can find a later-page site without changing its original number or export source', async () => {
    const links = Array.from({ length: 205 }, (_, index) => ({ title: `Site ${index + 1}`, url: `https://example.test/${index + 1}` }));
    links[204] = { title: 'Needle 中文', url: 'https://example.test/last' };
    const m = model({ links }); await m.view.ready;
    m.find('Preview site text').dispatch('click');
    assert.equal(m.host.querySelectorAll('.recovery-site-title').length, 100);
    const input = m.host.querySelector('.recovery-site-filter');
    assert(input, 'a local search must reach records not rendered on the first page');
    input.value = 'needle'; m.find('Find site text').dispatch('click');
    assert.deepEqual(m.host.querySelectorAll('.recovery-site-title').map(node => node.textContent), ['Needle 中文']);
    assert.equal(m.host.querySelector('.recovery-site-list li').getAttribute('value'), '205');
    assert.equal(m.host.querySelector('.recovery-filter-count').textContent, 'Matching site records: 1 of 205. Original record numbers are retained.');
    m.find('Download investigation JSON').dispatch('click');
    assert.equal(m.downloads.length, 1);
    assert.deepEqual(m.calls.filter(call => call[0] === 'exportEntry').map(call => call[2]), ['copy_1']);
    assert.deepEqual(links[204], { title: 'Needle 中文', url: 'https://example.test/last' });
});

for (const locale of ['en', 'zh_CN']) test(`preview search keeps duplicate indices, literal Unicode and clear semantics (${locale})`, async () => {
    const links = [{ title: 'duplicate', url: 'https://example.test/a' }, { title: 'duplicate', url: 'https://example.test/a' },
        { title: '中文 👩‍💻 <img> .*', url: 'https://example.test/Encoded%20Path' }, {}, { title: '', url: '' },
        { title: 'x'.repeat(4001) + 'TAILMARK', url: 'https://example.test/long' }];
    const m = model({ links, locale }); await m.view.ready;
    m.find(locale === 'en' ? 'Preview site text' : '预览站点文字').dispatch('click');
    const input = m.host.querySelector('.recovery-site-filter');
    const apply = m.find(locale === 'en' ? 'Find site text' : '查找站点文字');
    const clear = m.find(locale === 'en' ? 'Clear site search' : '清除站点查找');
    const indices = () => m.host.querySelectorAll('.recovery-site-list li').map(node => node.getAttribute('value'));
    input.value = 'DUPLICATE'; input.dispatch('input'); assert.equal(indices().length, 6, 'typing alone does not rebuild');
    apply.dispatch('click'); assert.deepEqual(indices(), ['1', '2']);
    input.value = '.*'; apply.dispatch('click'); assert.deepEqual(indices(), ['3'], 'not a regular expression');
    input.value = '中文 👩‍💻'; apply.dispatch('click'); assert.deepEqual(indices(), ['3']);
    input.value = 'encoded%20path'; apply.dispatch('click'); assert.deepEqual(indices(), ['3'], 'literal URL text, not decoded or visited');
    input.value = 'tailmark'; apply.dispatch('click'); assert.deepEqual(indices(), ['6'], 'match full inspected text even when display is truncated');
    input.value = 'absent'; apply.dispatch('click'); assert.deepEqual(indices(), []);
    assert(m.allText().includes(locale === 'en' ? 'does not prove that a site was deleted' : '不代表站点已被删除'));
    clear.focus(); clear.dispatch('click'); assert.equal(input.value, ''); assert.equal(m.document.activeElement, input);
    assert.deepEqual(indices(), ['1', '2', '3', '4', '5', '6']);
    input.value = '  '; apply.dispatch('click'); assert.equal(indices().length, 6);
    assert.equal(m.host.querySelectorAll('a, img, iframe').length, 0);
    assert.equal(m.calls.filter(call => call[0] === 'preview').length, 1);
});

test('explicit search handles keyboard composition guards and bounded matching pages', async () => {
    const links = Array.from({ length: 305 }, (_, i) => ({ title: i % 2 ? 'other' : 'match', url: `https://example.test/${i}` }));
    const m = model({ links }); await m.view.ready; m.find('Preview site text').dispatch('click');
    const input = m.host.querySelector('.recovery-site-filter'); input.value = 'match'; input.focus();
    for (const extra of [{ isComposing: true }, { keyCode: 229 }, { repeat: true }]) input.dispatch('keydown', { key: 'Enter', ...extra });
    assert.equal(m.host.querySelectorAll('.recovery-site-title')[1].textContent, 'other');
    input.dispatch('keydown', { key: 'Enter' }); assert.equal(m.document.activeElement, input);
    assert.equal(m.host.querySelectorAll('.recovery-site-title').length, 100);
    m.find('Next sites').dispatch('click'); assert.equal(m.host.querySelectorAll('.recovery-site-title').length, 53);
    assert.equal(m.host.querySelector('.recovery-site-list li').getAttribute('value'), '201');
    m.find('Clear site search').dispatch('click');
    assert.equal(m.host.querySelector('.recovery-site-list li').getAttribute('value'), '1');
    assert.equal(m.host.querySelectorAll('.recovery-site-title').length, 100);
});

test('old search controls cannot affect reopened previews, refreshed copies or hidden pages', async () => {
    const m = model(); await m.view.ready; m.find('Preview site text').dispatch('click');
    const oldInput = m.host.querySelector('.recovery-site-filter'), oldApply = m.find('Find site text');
    m.find('Hide site text').dispatch('click'); m.find('Preview site text').dispatch('click');
    oldInput.value = 'none'; oldApply.dispatch('click');
    assert.equal(m.host.querySelectorAll('.recovery-site-title').length, 2);
    const currentInput = m.host.querySelector('.recovery-site-filter'), currentApply = m.find('Find site text');
    currentInput.value = 'none'; m.document.visibilityState = 'hidden'; currentApply.dispatch('click');
    assert.equal(m.host.querySelectorAll('.recovery-site-title').length, 2);
    m.document.visibilityState = 'visible'; m.find('Refresh inspection').dispatch('click'); await tick();
    currentApply.dispatch('click'); assert.equal(m.host.querySelector('.recovery-site-filter'), null);
    m.find('Preview site text').dispatch('click'); assert.equal(m.host.querySelector('.recovery-site-filter').value, '');
    m.view.destroy(); oldApply.dispatch('click'); currentApply.dispatch('click'); assert.equal(m.downloads.length, 0);
});
