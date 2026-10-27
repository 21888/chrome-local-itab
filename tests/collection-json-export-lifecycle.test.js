const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { setup, add, tick } = require('./helpers/collections-harness');
const { createDocument, deferred } = require('./helpers/task-dom-model');

async function mount() {
    const h = setup(), c = h.controller;
    await c.start(); await add(c, 'Synthetic excerpt', 'Exact original 🧩\r\n{{literal}}');
    const doc = createDocument({ blurUnavailableFocus: true }), host = doc.createElement('main'); doc.body.append(host);
    const events = new Map(), downloads = { blobs: [], clicks: [], revoked: [], timers: [] };
    const create = doc.createElement;
    doc.createElement = tag => {
        const node = create(tag);
        if (tag === 'a') node.click = () => downloads.clicks.push({ name: node.download, connected: node.isConnected });
        return node;
    };
    const root = { document: doc, LocalItabAICollections: require('../shared/local-ai-collections-store'), Blob,
        setTimeout: fn => downloads.timers.push(fn),
        URL: { createObjectURL(blob) { downloads.blobs.push(blob); return `blob:synthetic-${downloads.blobs.length}`; }, revokeObjectURL: url => downloads.revoked.push(url) },
        addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key), getComputedStyle: node => node.style };
    const context = vm.createContext({ window: root });
    for (const file of ['dialog-focus', 'local-ai-collections-view']) vm.runInContext(fs.readFileSync(`shared/${file}.js`, 'utf8'), context);
    const view = new root.LocalItabCollectionsView.View({ host, controller: c }); view.render();
    // The real Store and model View occupy different realms, unlike the browser.
    // Preserve the same explicit JSON boundary used by existing collection UI tests.
    const originalExport = h.store.export.bind(h.store);
    h.store.export = options => originalExport(JSON.parse(JSON.stringify(options)));
    const original = JSON.stringify(h.raw), writes = h.writes;
    const unchanged = () => { assert.equal(JSON.stringify(h.raw), original); assert.equal(h.writes, writes); };
    const begin = () => { const pending = view.exportFile(); const overlay = doc.body.querySelector('.prompt-dialog-overlay'); assert.ok(overlay); return { pending, overlay }; };
    const accept = operation => operation.overlay.querySelector('.prompt-primary').dispatch('click');
    const hold = () => { const gate = deferred(), read = h.backend.read; h.backend.read = async () => { await gate.promise; return read(); }; return gate; };
    return { ...h, h, c, doc, host, root, events, view, downloads, unchanged, begin, accept, hold };
}

for (const [name, retire] of [
    ['destroy', f => f.view.destroy()],
    ['controller disposal', f => f.c.dispose()],
    ['page departure', f => f.events.get('pagehide')({ persisted: false })],
    ['BFCache departure and return', f => { f.events.get('pagehide')({ persisted: true }); f.events.get('pageshow')({ persisted: true }); }],
    ['hidden then visible', f => { f.doc.visibilityState = 'hidden'; f.doc.listeners.get('visibilitychange')({}); f.doc.visibilityState = 'visible'; f.doc.listeners.get('visibilitychange')({}); }],
    ['detached host', f => f.host.remove()],
    ['new callback owner', f => { f.c.onChange = () => {}; }],
    ['new store', f => { f.c.store = { export() { throw Error('must not read replacement'); } }; }]
]) test(`confirmed JSON export cannot submit after ${name} during its real Store read`, async () => {
    const f = await mount(), gate = f.hold(), op = f.begin(); f.accept(op); await tick(); retire(f); gate.resolve(); await op.pending;
    assert.equal(f.downloads.clicks.length, 0); assert.equal(f.downloads.blobs.length, 0); f.unchanged(); f.c.dispose();
});

test('normal complete JSON is serialized once and original content remains unchanged', async () => {
    const f = await mount(), expected = JSON.parse(await f.store.export({ omitSourceUrls: false }));
    const op = f.begin(); f.accept(op); await op.pending;
    assert.equal(f.downloads.clicks.length, 1); assert.equal(f.downloads.clicks[0].name, 'local-itab-ai-collection.json');
    assert.equal(f.downloads.clicks[0].connected, true); assert.equal(f.downloads.blobs[0].type, 'application/json');
    assert.deepEqual(JSON.parse(await f.downloads.blobs[0].text()), expected);
    assert.equal(f.downloads.timers.length, 1); f.downloads.timers[0](); assert.equal(f.downloads.revoked.length, 1);
    assert.equal(f.doc.querySelector('a[download]'), null); assert.equal(f.view.exportButton.disabled, false); f.unchanged(); f.c.dispose();
});

test('Cancel before accepting reads no backup and makes no file', async () => {
    const f = await mount(); let reads = 0; const read = f.backend.read; f.backend.read = async () => { reads++; return read(); };
    const op = f.begin(); op.overlay.querySelector('button').dispatch('click'); await op.pending;
    assert.equal(reads, 0); assert.equal(f.downloads.clicks.length, 0); assert.equal(f.view.exportButton.disabled, false); f.unchanged(); f.c.dispose();
});

test('departure closes unaccepted JSON privacy review and old accept is inert', async () => {
    const f = await mount(), op = f.begin(), accept = op.overlay.querySelector('.prompt-primary');
    f.events.get('pagehide')({ persisted: true }); await op.pending; accept.dispatch('click'); await tick();
    assert.equal(op.overlay.isConnected, false); assert.equal(f.view.openDialog, false); assert.equal(f.downloads.clicks.length, 0); f.unchanged(); f.c.dispose();
});

test('duplicate entry while read is held creates only one read and download', async () => {
    const f = await mount(), gate = f.hold(); let reads = 0; const read = f.backend.read; f.backend.read = () => { reads++; return read(); };
    const op = f.begin(); f.accept(op); await tick(); f.view.render(); assert.equal(f.view.exportButton.disabled, false); assert.equal(f.view.exportButton.getAttribute('aria-disabled'), 'true');
    f.view.exportButton.dispatch('click'); await f.view.exportFile(); assert.equal(reads, 1); assert.equal(f.view.openDialog, false);
    gate.resolve(); await op.pending; assert.equal(f.downloads.clicks.length, 1); f.unchanged(); f.c.dispose();
});

test('old cancelled read settlement cannot unlock or download for a newer export', async () => {
    const f = await mount(), first = deferred(), second = deferred(), read = f.backend.read; let reads = 0;
    f.backend.read = async () => { await (++reads === 1 ? first.promise : second.promise); return read(); };
    const old = f.begin(); f.accept(old); await tick();
    f.events.get('pagehide')({ persisted: true }); f.events.get('pageshow')({ persisted: true });
    const fresh = f.begin(); f.accept(fresh); await tick(); first.resolve(); await old.pending;
    assert.equal(f.view.exportButton.disabled, false); assert.equal(f.view.exportButton.getAttribute('aria-disabled'), 'true'); assert.equal(f.downloads.clicks.length, 0);
    second.resolve(); await fresh.pending; assert.equal(f.downloads.clicks.length, 1); assert.equal(f.view.exportButton.disabled, false); f.unchanged(); f.c.dispose();
});

for (const retired of [false, true]) test(`read rejection ${retired ? 'after retirement stays silent' : 'keeps current error and allows explicit retry'}`, async () => {
    const f = await mount(), read = f.backend.read; let reject; const pending = new Promise((_, no) => { reject = no; }); f.backend.read = () => pending;
    const op = f.begin(); f.accept(op); await tick();
    if (retired) f.view.destroy(); reject(Error('synthetic read refusal')); await op.pending;
    assert.equal(f.downloads.clicks.length, 0);
    if (retired) assert.equal(f.view.jsonExportStatus.textContent, '');
    else { assert.match(f.view.jsonExportStatus.textContent, /Export could not be created/); f.backend.read = read; const retry = f.begin(); f.accept(retry); await retry.pending; assert.equal(f.downloads.clicks.length, 1); }
    f.unchanged(); f.c.dispose();
});

test('retirement during object URL creation revokes unsubmitted bytes and cleans DOM', async () => {
    const f = await mount(); f.root.URL.createObjectURL = blob => { f.downloads.blobs.push(blob); f.view.destroy(); return 'blob:retired'; };
    const op = f.begin(); f.accept(op); await op.pending;
    assert.equal(f.downloads.clicks.length, 0); assert.deepEqual(f.downloads.revoked, ['blob:retired']); f.unchanged(); f.c.dispose();
});

for (const accept of [false, true]) test(`JSON ${accept ? 'confirmation' : 'Cancel'} preserves the focused opener without allowing duplicate entry`, async () => {
    const f = await mount(); f.view.exportButton.focus();
    const op = f.begin();
    if (accept) f.accept(op); else op.overlay.querySelector('button').dispatch('click');
    await op.pending;
    assert.equal(f.doc.activeElement === f.view.exportButton, true);
    assert.equal(f.view.exportButton.disabled, false);
    assert.equal(f.view.exportButton.getAttribute('aria-disabled'), 'false');
    assert.equal(f.downloads.clicks.length, accept ? 1 : 0); f.unchanged(); f.c.dispose();
});

test('pending export settlement does not steal a newer focused control', async () => {
    const f = await mount(), gate = f.hold(); f.view.exportButton.focus();
    const op = f.begin(); f.accept(op); await tick(); f.view.newButton.focus();
    gate.resolve(); await op.pending;
    assert.equal(f.doc.activeElement === f.view.newButton, true);
    assert.equal(f.view.exportButton.getAttribute('aria-disabled'), 'false');
    assert.equal(f.downloads.clicks.length, 1); f.unchanged(); f.c.dispose();
});

test('failed current read releases busy semantics without changing newer focus', async () => {
    const f = await mount(); let reject; f.backend.read = () => new Promise((_, no) => { reject = no; });
    f.view.exportButton.focus(); const op = f.begin(); f.accept(op); await tick(); f.view.newButton.focus();
    reject(Error('synthetic refusal')); await op.pending;
    assert.equal(f.view.exportButton.getAttribute('aria-disabled'), 'false');
    assert.equal(f.doc.activeElement === f.view.newButton, true);
    assert.equal(f.downloads.clicks.length, 0); f.unchanged(); f.c.dispose();
});

test('retiring an open review never restores the opener into a new focus owner', async () => {
    const f = await mount(); f.view.exportButton.focus(); const op = f.begin();
    const other = f.doc.createElement('button'); f.doc.body.append(other); other.focus();
    f.events.get('pagehide')({ persisted: true }); await op.pending;
    assert.equal(f.doc.activeElement === other, true);
    assert.equal(f.view.exportButton.getAttribute('aria-disabled'), 'false');
    assert.equal(f.downloads.clicks.length, 0); f.unchanged(); f.c.dispose();
});

test('explicit successful retry replaces export failure feedback without claiming disk completion', async () => {
    const f = await mount(), read = f.backend.read; f.backend.read = async () => { throw Error('synthetic refusal'); };
    let op = f.begin(); f.accept(op); await op.pending;
    assert.match([f.view.status.textContent, f.view.jsonExportStatus?.textContent].join(' '), /Export could not be created/);
    f.backend.read = read; op = f.begin(); f.accept(op); await op.pending;
    assert.equal(f.downloads.clicks.length, 1);
    assert.doesNotMatch([f.view.status.textContent, f.view.jsonExportStatus?.textContent].join(' '), /Export could not be created/);
    assert.match([f.view.status.textContent, f.view.jsonExportStatus?.textContent].join(' '), /JSON download requested/);
    f.unchanged(); f.c.dispose();
});

test('cancelled retry retains last export outcome and never reads another copy', async () => {
    const f = await mount(); let reads = 0; f.backend.read = async () => { reads++; throw Error('refused'); };
    const failed = f.begin(); f.accept(failed); await failed.pending;
    const message = f.view.jsonExportStatus.textContent;
    const cancel = f.begin(); cancel.overlay.querySelector('button').dispatch('click'); await cancel.pending;
    assert.equal(reads, 1); assert.equal(f.view.jsonExportStatus.textContent, message);
    assert.equal(f.view.jsonExportStatus.classList.contains('error'), true); f.unchanged(); f.c.dispose();
});

for (const fail of [false, true]) test(`export ${fail ? 'failure' : 'success'} cannot overwrite Controller save warning and controls`, async () => {
    const f = await mount(), gate = f.hold();
    if (fail) { const read = f.backend.read; f.backend.read = async () => { await read(); throw Error('refused'); }; }
    const op = f.begin(); f.accept(op); await tick();
    assert.match(f.view.jsonExportStatus.textContent, /Preparing the complete JSON/);
    f.c.error = { code: 'READ', scope: 'read' }; f.view.render();
    const warning = f.view.status.textContent, refresh = f.view.status.querySelector('button'); assert.ok(refresh);
    gate.resolve(); await op.pending;
    assert.equal(f.view.status.textContent, warning); assert.equal(f.view.status.querySelector('button') === refresh, true);
    assert.match(f.view.jsonExportStatus.textContent, fail ? /Export could not/ : /JSON download requested/);
    assert.equal(f.view.jsonExportStatus.classList.contains('error'), fail); f.unchanged(); f.c.dispose();
});

for (const rejectRead of [false, true]) test(`source replacement during ${rejectRead ? 'failed' : 'successful'} read clears only retired progress`, async () => {
    const f = await mount(), read = f.backend.read; let resolve, reject;
    f.backend.read = () => new Promise((yes, no) => { resolve = yes; reject = no; });
    const op = f.begin(); f.accept(op); await tick(); f.c.onChange = () => {};
    f.view.status.textContent = 'New owner warning';
    if (rejectRead) reject(Error('old refusal')); else resolve(await read()); await op.pending;
    assert.equal(f.view.jsonExportStatus.textContent, ''); assert.equal(f.view.status.textContent, 'New owner warning');
    assert.equal(f.downloads.clicks.length, 0); f.unchanged(); f.c.dispose();
});

test('late retired failure cannot overwrite the newer export progress or success', async () => {
    const f = await mount(), read = f.backend.read, second = deferred(); let rejectFirst, reads = 0;
    f.backend.read = async () => { if (++reads === 1) await new Promise((_, no) => { rejectFirst = no; }); else await second.promise; return read(); };
    const old = f.begin(); f.accept(old); await tick();
    f.events.get('pagehide')({ persisted: true }); f.events.get('pageshow')({ persisted: true });
    const fresh = f.begin(); f.accept(fresh); await tick(); rejectFirst(Error('old refusal')); await old.pending;
    assert.match(f.view.jsonExportStatus.textContent, /Preparing the complete JSON/);
    second.resolve(); await fresh.pending; assert.match(f.view.jsonExportStatus.textContent, /JSON download requested/);
    assert.equal(f.downloads.clicks.length, 1); f.unchanged(); f.c.dispose();
});

for (const language of ['en', 'zh_CN']) test(`JSON export progress and requested feedback have ${language} translations`, () => {
    const messages = JSON.parse(fs.readFileSync(`_locales/${language}/messages.json`, 'utf8'));
    for (const name of ['ExportPreparing', 'ExportRequested', 'ExportFailed']) assert.ok(messages[`collections${name}`]?.message);
});
