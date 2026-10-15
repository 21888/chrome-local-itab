'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const source = fs.readFileSync('options.js', 'utf8');
const mountSource = source.slice(source.indexOf('function setupImportClosure('), source.indexOf('function showPendingRestoreRecovery('));
const restoreSource = source.slice(source.indexOf('function showPendingRestoreRecovery('), source.indexOf('async function createBeforeRestoreSafetyBackup('));
const tick = () => new Promise(resolve => setImmediate(resolve));
const text = node => [node.textContent || '', ...node.children.map(text)].join('\n');
const secret = 'SYNTHETIC_PRIVATE_PROVIDER_OR_RAW_VALUE';
const ready = () => Object.freeze({ eligible: true, status: 'READY', workspace: { id: 'default', generation: 'generation1', migrationId: 'lineage1', name: 'Saved workspace' }, reviewedAt: '2026-10-15T04:00:00.000Z', bytes: 2500, capacity: 1, raw: secret });
function model({ locale = 'en', result = ready(), observe = false } = {}) {
    const document = createDocument({ blurUnavailableFocus: true }); document.visibilityState = 'visible';
    const events = new Map(), calls = [], catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const window = { document, addEventListener(key, fn) { events.set(key, fn); }, removeEventListener(key, fn) { if (events.get(key) === fn) events.delete(key); } };
    if (observe) window.MutationObserver = class {
        constructor(callback) { this.callback = callback; this.records = []; window.observer = this; events.set('mutation', callback); }
        observe() {} takeRecords() { const records = this.records; this.records = []; return records; }
        enqueue(record) { this.records.push(record); if (this.scheduled) return; this.scheduled = true; queueMicrotask(() => { this.scheduled = false; const records = this.takeRecords(); if (records.length) this.callback(records); }); }
        disconnect() { events.delete('mutation'); this.records = []; }
    };
    const host = document.createElement('section'); host.id = 'import-closure-controls'; document.body.append(host);
    const draft = document.createElement('input'); draft.value = 'Unsaved draft'; document.body.append(draft);
    const manager = { workspace: { id: 'default' },
        async reviewImportClosure(options) { calls.push(['review', options]); return result; },
        async commitImportClosure(review, options) { calls.push(['commit', review, options]); assert.equal(options.confirmed, true); assert(options.isCurrent()); return { status: 'RECORDED' }; },
        cancelImportClosure(review) { calls.push(['cancel', review]); },
        async recheckImportClosure() { calls.push(['recheck']); return { status: 'RECORDED', relation: 'active' }; }
    };
    const context = vm.createContext({ window, document, encodeURIComponent, t: (key, fallback, substitutions = []) => (catalog[key]?.message || fallback).replace(/\$(\d+)/g, (_, n) => substitutions[Number(n) - 1] || '') });
    vm.runInContext(mountSource, context);
    const view = context.setupImportClosure(manager);
    const label = key => catalog[key].message;
    const find = key => host.querySelectorAll('button').find(button => button.textContent === label(key));
    async function click(key) { const button = find(key); assert(button, key); button.focus(); button.dispatch('click'); await tick(); return button; }
    return { window, document, events, host, draft, manager, view, calls, context, label, find, click, allText: () => text(host),
        async visibility(value) { document.visibilityState = value; await document.listeners.get('visibilitychange')?.({}); await tick(); } };
}
for (const locale of ['en', 'zh_CN']) test(`closure requires separate review and explicit confirmation; saved content stays private (${locale})`, async () => {
    const m = model({ locale }); assert.equal(m.calls.length, 0); assert(!m.find('importClosureConfirm'));
    await m.click('importClosureReview');
    assert.equal(m.calls.filter(call => call[0] === 'commit').length, 0);
    assert(m.allText().includes(m.label('importClosureCapacity'))); assert(m.allText().includes(m.label('importClosureConfirmHelp')));
    assert(!m.allText().includes(secret)); assert.equal(m.draft.value, 'Unsaved draft');
    await m.click('importClosureConfirm');
    assert.equal(m.calls.filter(call => call[0] === 'commit').length, 1); assert(!m.find('importClosureConfirm'));
    assert(m.allText().includes(m.label('importClosureRecorded'))); assert.equal(m.draft.value, 'Unsaved draft');
    assert(m.host.querySelectorAll('a').every(link => link.target === '_blank' && link.rel === 'noopener'));
});
for (const kind of ['cancel', 'hidden', 'pagehide', 'new review', 'recheck', 'destroy']) test(`closure ${kind} retires the old private review with no commit`, async () => {
    const m = model(); await m.click('importClosureReview'); const oldButton = m.find('importClosureConfirm');
    const prepared = m.calls.find(call => call[0] === 'review')[1]; assert(prepared.isCurrent());
    if (kind === 'cancel') await m.click('importClosureCancel');
    if (kind === 'hidden') { await m.visibility('hidden'); await m.visibility('visible'); }
    if (kind === 'pagehide') m.events.get('pagehide')({ persisted: true });
    if (kind === 'new review') await m.click('importClosureReview');
    if (kind === 'recheck') await m.click('importClosureRecheck');
    if (kind === 'destroy') m.view.destroy();
    assert(!prepared.isCurrent()); oldButton.dispatch('click'); await tick();
    assert.equal(m.calls.filter(call => call[0] === 'commit').length, 0); assert.equal(m.draft.value, 'Unsaved draft');
    assert(m.calls.some(call => call[0] === 'cancel' && call[1]?.status === 'READY'));
});
for (const status of ['NORMAL_VERIFICATION_REQUIRED', 'ORIGINAL_RECOVERY_UNAVAILABLE', 'NO_PENDING_IMPORT', 'SLOT_OCCUPIED', 'SLOT_INVALID', 'SLOT_UNSUPPORTED', 'ALREADY_CLOSED', 'ALREADY_CLOSED_HISTORY_ONLY', 'unknown ' + secret]) test(`closure ${status.split(' ')[0]} never offers a write`, async () => {
    const m = model({ result: { eligible: false, status, raw: secret } }); await m.click('importClosureReview');
    assert(!m.find('importClosureConfirm')); assert(!m.allText().includes(secret)); assert.equal(m.calls.filter(call => call[0] === 'commit').length, 0);
});
for (const value of [undefined, { eligible: true, status: 'READY' }, { ...ready(), capacity: 2 }, { ...ready(), bytes: Infinity }]) test('malformed review metadata fails closed without exposing arbitrary fields', async () => {
    const m = model(); m.manager.reviewImportClosure = async () => value; await m.click('importClosureReview'); assert(!m.find('importClosureConfirm')); assert(!m.allText().includes(secret));
});
test('late review after hide is cancelled and cannot repopulate controls', async () => {
    const m = model(), waiting = deferred(); m.manager.reviewImportClosure = () => waiting.promise;
    m.find('importClosureReview').dispatch('click'); await tick(); await m.visibility('hidden'); await m.visibility('visible');
    const result = ready(); waiting.resolve(result); await tick();
    assert(!m.find('importClosureConfirm')); assert(m.calls.some(call => call[0] === 'cancel' && call[1] === result));
});
test('uncertain commit has no retry path; recheck remains read-only and requires new review if empty', async () => {
    const m = model(); m.manager.commitImportClosure = async (...args) => { m.calls.push(['commit', ...args]); return { status: 'UNCERTAIN' }; };
    await m.click('importClosureReview'); const old = m.find('importClosureConfirm'); await m.click('importClosureConfirm');
    assert(m.allText().includes(m.label('importClosureUncertain'))); old.dispatch('click'); await tick();
    m.manager.recheckImportClosure = async () => { m.calls.push(['recheck']); return { status: 'EMPTY' }; };
    await m.click('importClosureRecheck'); assert(m.allText().includes(m.label('importClosureEmpty'))); assert(!m.find('importClosureConfirm'));
    assert.equal(m.calls.filter(call => call[0] === 'commit').length, 1);
});
test('read-only recheck labels later live changes as historical and never overwrites open drafts', async () => {
    const m = model(); m.manager.recheckImportClosure = async () => ({ status: 'RECORDED', relation: 'historical' });
    await m.click('importClosureRecheck'); assert(m.allText().includes(m.label('importClosureRecheckedHistorical')));
    assert.equal(m.draft.value, 'Unsaved draft'); assert.equal(m.calls.filter(call => call[0] === 'commit').length, 0);
});
test('repeat/hidden controls cannot submit and tab navigation explicitly retires review', async () => {
    const m = model(); await m.click('importClosureReview'); const button = m.find('importClosureConfirm');
    button.dispatch('click', { detail: 2 }); await tick(); assert.equal(m.calls.filter(call => call[0] === 'commit').length, 0);
    m.host.hidden = true; button.dispatch('click'); await tick(); assert.equal(m.calls.filter(call => call[0] === 'commit').length, 0);
    assert(source.slice(source.indexOf('const activateTab ='), source.indexOf('// The sidebar')).includes('window.importClosureView?.cancel()'));
});
function restoreModel({ proceed = true } = {}) {
    const document = createDocument(); document.visibilityState = 'visible'; const events = new Map(), calls = [], prompts = [];
    const window = { addEventListener(key, fn) { events.set(key, fn); }, removeEventListener(key, fn) { if (events.get(key) === fn) events.delete(key); } };
    const review = Object.freeze({}), ticket = Object.freeze({}), error = Object.assign(Error(secret), { code: 'RESTORE_CLOSED_RECONFIRM', closureReview: review, canStartNewRestore: true });
    const manager = { async setAll(settings, options) { calls.push(['setAll', settings, options]); if (options.closedRestoreTicket === ticket) return true; throw error; },
        async confirmClosedRestore(value, options) { calls.push(['confirm', value, options]); assert.equal(value, review); assert(options.isCurrent()); return ticket; },
        cancelClosedRestore(value) { calls.push(['cancel', value]); } };
    const context = vm.createContext({ document, window, t: (_key, fallback) => fallback, confirm: value => { prompts.push(value); return proceed; } }); vm.runInContext(restoreSource, context);
    return { document, window, events, calls, prompts, review, ticket, error, manager, run: () => context.saveConfirmedRestore(manager, { quote: 'selected file' }) };
}
for (const proceed of [false, true]) test(`same shared Manual/Drive helper requires a private closure confirmation; proceed=${proceed}`, async () => {
    const m = restoreModel({ proceed });
    if (proceed) assert.equal(await m.run(), true); else await assert.rejects(m.run(), error => error === m.error);
    const writes = m.calls.filter(call => call[0] === 'setAll'); assert.equal(writes.length, proceed ? 2 : 1);
    assert.equal(m.prompts.length, 1); assert(!m.prompts[0].includes(secret)); assert(!writes.some(call => call[2].newRestoreOperation));
    assert.equal(m.calls.filter(call => call[0] === 'confirm').length, proceed ? 1 : 0);
    assert(m.calls.some(call => call[0] === 'cancel' && call[1] === (proceed ? m.ticket : m.review)));
    assert(source.includes('saveConfirmedRestore(providerStorage, validatedSettings)')); assert(source.includes('saveConfirmedRestore(storageManager, validatedSettings)'));
});
for (const kind of ['pagehide', 'hidden']) test(`closed import ticket cannot submit after ${kind} during confirmation preparation`, async () => {
    const m = restoreModel(), waiting = deferred(); m.manager.confirmClosedRestore = async () => waiting.promise;
    const pending = m.run(); await tick();
    if (kind === 'pagehide') m.events.get('pagehide')({}); else { m.document.visibilityState = 'hidden'; await m.document.listeners.get('visibilitychange')({}); m.document.visibilityState = 'visible'; }
    waiting.resolve(m.ticket); await assert.rejects(pending, error => error === m.error);
    assert.equal(m.calls.filter(call => call[0] === 'setAll').length, 1); assert(m.calls.some(call => call[0] === 'cancel' && call[1] === m.ticket));
});
test('a malformed closure reconfirm exception cannot fall back to generic Boolean authority', async () => {
    const m = restoreModel(); delete m.error.closureReview;
    await assert.rejects(m.run(), error => error === m.error); assert.equal(m.prompts.length, 0); assert.equal(m.calls.filter(call => call[0] === 'setAll').length, 1);
});
test('Options and dashboard load the pure codec before workspace authority; Recovery never loads the service', () => {
    for (const file of ['options.html', 'newtab.html']) { const html = fs.readFileSync(file, 'utf8'); assert(html.indexOf('shared/import-closure.js') < html.indexOf('shared/workspaces.js')); }
    const recovery = fs.readFileSync('recovery.html', 'utf8'); assert(recovery.includes('shared/import-closure.js')); assert(!recovery.includes('import-closure-service'));
});

test('a hidden/shown ancestry round trip invalidates review rather than reviving the old button', async () => {
    const m = model({ observe: true }); await m.click('importClosureReview'); const old = m.find('importClosureConfirm');
    const owned = m.calls.find(call => call[0] === 'review')[1];
    m.host.hidden = true; m.host.hidden = false; m.events.get('mutation')([{ target: m.host, attributeName: 'hidden' }]);
    assert(!owned.isCurrent()); old.dispatch('click'); await tick(); assert.equal(m.calls.filter(call => call[0] === 'commit').length, 0);
    m.view.destroy(); assert(!m.events.has('mutation'));
});

test('pending-conflict notice exposes a separate explicit review without auto-committing or losing drafts', async () => {
    const m = model(), notice = m.document.createElement('section'); notice.id = 'restore-conflict-notice'; m.document.body.append(notice);
    vm.runInContext(restoreSource, m.context);
    m.context.showPendingRestoreRecovery(m.manager, { code: 'RESTORE_PENDING_CONFLICT', message: 'Synthetic conflict' });
    assert.equal(m.calls.filter(call => call[0] === 'review').length, 0); assert.equal(notice.children.length, 3);
    notice.children[2].dispatch('click'); await tick(); assert.equal(m.calls.filter(call => call[0] === 'review').length, 1);
    assert.equal(m.calls.filter(call => call[0] === 'commit').length, 0); assert.equal(m.draft.value, 'Unsaved draft');
});

test('a newer import invocation invalidates older in-flight private consent', async () => {
    const m = restoreModel(), waiting = deferred(); m.manager.confirmClosedRestore = async () => waiting.promise;
    const older = m.run(); await tick(); m.manager.confirmClosedRestore = async () => m.ticket;
    assert.equal(await m.run(), true); waiting.resolve(m.ticket); await assert.rejects(older, error => error === m.error);
    assert.equal(m.calls.filter(call => call[0] === 'setAll').length, 3);
    assert.equal(m.calls.filter(call => call[0] === 'setAll' && call[2].closedRestoreTicket).length, 1);
});
test('hiding during commit revokes freshness and does not claim that a submitted decision was absent', async () => {
    const m = model(), waiting = deferred(); let options;
    m.manager.commitImportClosure = async (_review, value) => { options = value; return waiting.promise; };
    await m.click('importClosureReview'); m.find('importClosureConfirm').dispatch('click'); await tick(); assert(options.isCurrent());
    await m.visibility('hidden'); await m.visibility('visible'); assert(!options.isCurrent());
    waiting.resolve({ status: 'RECORDED' }); await tick();
    assert(m.allText().includes(m.label('importClosureExpired'))); assert(!m.allText().includes(m.label('importClosureCancelled')));
    assert(!m.allText().includes(m.label('importClosureRecorded'))); assert(!m.find('importClosureConfirm'));
});

test('notice navigation drains only pre-review ancestor mutations before beginning a live review', async () => {
    const m = model({ observe: true }), panel = m.document.createElement('section'), tab = m.document.createElement('button');
    panel.className = 'tab-panel'; panel.dataset.tab = 'data'; m.host.remove(); panel.append(m.host); m.document.body.append(panel);
    tab.className = 'tab-button'; tab.dataset.tab = 'data'; m.document.body.append(tab);
    tab.click = () => { m.view.cancel(); panel.classList.add('active'); m.window.observer.enqueue({ target: panel, attributeName: 'class' }); };
    m.view.openReview(); await tick();
    assert(m.find('importClosureConfirm')); assert.equal(m.calls.filter(call => call[0] === 'review').length, 1);
    const guard = m.calls.find(call => call[0] === 'review')[1]; assert(guard.isCurrent());
    m.events.get('mutation')([]); assert(guard.isCurrent(), 'empty observer delivery is inert');
    panel.classList.remove('active'); panel.classList.add('active'); m.window.observer.enqueue({ target: panel, attributeName: 'class' }); await tick();
    assert(!guard.isCurrent()); assert(!m.find('importClosureConfirm'));
});
test('later navigation before the deferred notice review prevents a stale opening', async () => {
    const m = model({ observe: true }); m.view.openReview(); m.view.cancel(); await tick();
    assert.equal(m.calls.filter(call => call[0] === 'review').length, 0); assert(!m.find('importClosureConfirm'));
});
test('recheck shows the archived owner rather than implying a different page workspace is closed', async () => {
    const m = model(); m.manager.recheckImportClosure = async () => ({ status: 'RECORDED', relation: 'historical', workspace: { id: 'other', name: 'Other saved workspace', raw: secret } });
    await m.click('importClosureRecheck'); assert(m.allText().includes('Other saved workspace')); assert(m.allText().includes('ID: other'));
    assert(m.allText().includes(m.label('importClosureRecheckedHistorical'))); assert(!m.allText().includes(secret));
});
