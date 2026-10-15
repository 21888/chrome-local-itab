'use strict';
// Production Options functions + production StorageManager/Workspace/closure
// service. Only the DOM, Web Locks and Chrome backend are synthetic RAM models.
// No provider account, user profile, browser persistence or native painting.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const C = require('../shared/import-closure');
const { createDocument } = require('./helpers/task-dom-model');
const { Workspaces: W, DEFER, clone, code, fixture, withGlobals, seed, storageFor, boot, values, uncertainImport } = require('./helpers/complete-import-receipt-fixture');
const source = fs.readFileSync('options.js', 'utf8');
const optionsFunctions = source.slice(source.indexOf('function setupImportClosure('), source.indexOf('async function createBeforeRestoreSafetyBackup('));
const tick = () => new Promise(resolve => setImmediate(resolve));
const text = node => [node.textContent || '', ...node.children.map(text)].join('\n');
const bounded = (name, run) => test(name, { timeout: 10000 }, run);
const BEFORE = 'SYNTHETIC_BEFORE_IMPORT_PRIVATE_TEXT';
const IMPORTED = 'SYNTHETIC_IMPORTED_PRIVATE_TEXT';
const CHOSEN = 'SYNTHETIC_CHOSEN_SAVED_PRIVATE_TEXT';
function page(storage, locale = 'en') {
    const document = createDocument({ blurUnavailableFocus: true }); document.visibilityState = 'visible';
    const events = new Map(), calls = [], pending = {}, catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    // Match Chrome's argument contract: missing message names throw instead of
    // silently taking the English fallback in this real-service UI path.
    storage.chromeApi.i18n = { getMessage(key) { assert.equal(typeof key, 'string'); assert(key.length > 0); return catalog[key]?.message || ''; } };
    const window = { document, addEventListener(key, handler) { if (!events.has(key)) events.set(key, new Set()); events.get(key).add(handler); }, removeEventListener(key, handler) { events.get(key)?.delete(handler); } };
    const host = document.createElement('section'); host.id = 'import-closure-controls'; document.body.append(host);
    const notice = document.createElement('section'); notice.id = 'restore-conflict-notice'; document.body.append(notice);
    const draft = document.createElement('textarea'); draft.value = 'SYNTHETIC_UNSAVED_DRAFT'; document.body.append(draft);
    const prompts = []; let consent = false;
    // Transparent tracing calls the actual methods unchanged. Capabilities and
    // validations are still owned by the production service, never by a stub.
    const originals = new Map();
    for (const method of ['reviewImportClosure', 'commitImportClosure', 'cancelImportClosure', 'recheckImportClosure', 'confirmClosedRestore', 'cancelClosedRestore', 'setAll']) {
        const original = storage[method]; assert.equal(typeof original, 'function', method); originals.set(method, original);
        storage[method] = function (...args) { calls.push({ method, args }); const result = Reflect.apply(original, this, args); pending[method] = result; return result; };
    }
    const context = vm.createContext({ document, window, encodeURIComponent,
        t: (key, fallback, substitutions = []) => (catalog[key]?.message || fallback).replace(/\$(\d+)/g, (_, n) => substitutions[Number(n) - 1] || ''),
        confirm(message) { prompts.push(message); return consent; } });
    vm.runInContext(optionsFunctions, context, { filename: 'options.js:selected-production-functions' });
    const view = context.setupImportClosure(storage);
    const label = key => catalog[key].message;
    const find = key => host.querySelectorAll('button').find(button => button.textContent === label(key));
    async function click(key, operation) {
        const button = find(key); assert(button, key); assert(!button.disabled, key + ' enabled'); button.focus(); button.dispatch('click');
        if (operation) { assert(pending[operation], operation + ' entered'); await Promise.resolve(pending[operation]).catch(() => {}); }
        await tick();
    }
    return { document, window, host, draft, notice, view, calls, pending, prompts, label, find, click, allText: () => text(host),
        consent(value) { consent = value; }, save(settings) { return context.saveConfirmedRestore(storage, settings); },
        dispose() { view.destroy(); for (const [method, original] of originals) storage[method] = original; } };
}
async function conflict(f, existing = null) {
    const b = existing || await boot(f), imported = { ...b.storage.cloneDefaultConfig(), quote: IMPORTED };
    await uncertainImport(f, b.storage, b.session, imported);
    await b.session.local.set({ quote: CHOSEN });
    return { ...b, imported };
}
function assertPrivate(m) {
    for (const privateText of [BEFORE, IMPORTED, CHOSEN, m.draft.value]) assert(!m.allText().includes(privateText), privateText + ' must not be summarized');
    assert.equal(m.draft.value, 'SYNTHETIC_UNSAVED_DRAFT');
}
async function record(m, f) {
    const before = clone(f.raw), writeCount = f.writes.length;
    await m.click('importClosureReview', 'reviewImportClosure'); assert(m.find('importClosureConfirm'));
    assert.equal(f.writes.length, writeCount); assertPrivate(m);
    await m.click('importClosureConfirm', 'commitImportClosure');
    assert.equal(f.writes.length, writeCount + 1); assert.deepEqual(Object.keys(f.writes[writeCount]), [C.KEY]);
    const stripped = clone(f.raw); delete stripped[C.KEY]; assert.deepEqual(stripped, before);
    assert(m.allText().includes(m.label('importClosureRecorded'))); assert(!m.find('importClosureConfirm')); assertPrivate(m);
    return clone(f.raw[C.KEY]);
}
for (const locale of ['en', 'zh_CN']) for (const sameFile of [true, false]) bounded(`real Options closure and shared Manual/Drive reconfirm complete end-to-end: ${locale}, same file=${sameFile}`, async () => {
    const f = fixture({ ...seed(), quote: BEFORE });
    await withGlobals(f, async () => {
        const b = await conflict(f), m = page(b.storage, locale);
        try {
            const originalReceipt = clone(values(f)[b.storage.restoreReceiptKey]);
            const originalRecovery = clone(values(f)[b.storage.restoreRecoveryKey]);
            const beforeCancel = clone(f.raw), beforeWrites = f.writes.length;
            await m.click('importClosureReview', 'reviewImportClosure'); const cancelledReview = await m.pending.reviewImportClosure;
            await m.click('importClosureCancel'); assert(!m.find('importClosureConfirm'));
            await assert.rejects(b.storage.commitImportClosure(cancelledReview, { confirmed: true }), code('IMPORT_CLOSURE_REVIEW_REQUIRED'));
            assert.equal(f.writes.length, beforeWrites); assert.deepEqual(f.raw, beforeCancel); assertPrivate(m);
            const archive = await record(m, f);
            assert.equal(archive.body.receipt.status, 'pending'); assert.deepEqual(archive.body.receipt, originalReceipt);
            assert.deepEqual(archive.body.recovery, originalRecovery); assert.equal(archive.body.current.quote, CHOSEN);
            assert.deepEqual(values(f)[b.storage.restoreReceiptKey], originalReceipt); assert.deepEqual(values(f)[b.storage.restoreRecoveryKey], originalRecovery);
            const beforeRecheck = f.writes.length; await m.click('importClosureRecheck', 'recheckImportClosure'); assert.equal(f.writes.length, beforeRecheck);
            assert(m.allText().includes(m.label('importClosureRecheckedActive')));
            const selected = sameFile ? clone(b.imported) : { ...b.storage.cloneDefaultConfig(), quote: 'SYNTHETIC_SEPARATE_NEW_FILE' };
            m.consent(false); const beforeDecline = clone(f.raw), declinedWrites = f.writes.length;
            await assert.rejects(m.save(selected), code('RESTORE_CLOSED_RECONFIRM'));
            assert.equal(f.writes.length, declinedWrites); assert.deepEqual(f.raw, beforeDecline);
            assert.equal(m.calls.filter(call => call.method === 'confirmClosedRestore').length, 0);
            assert.equal(m.prompts.length, 1); assert(m.prompts[0].includes(m.label('restoreClosedReconfirm')));
            assertPrivate(m);
            const setStart = m.calls.filter(call => call.method === 'setAll').length;
            m.consent(true); assert.equal(await m.save(selected), true);
            const current = values(f), freshReceipt = current[b.storage.restoreReceiptKey];
            assert.equal(current.quote, selected.quote); assert.equal(freshReceipt.status, 'verified'); assert.notDeepEqual(freshReceipt, originalReceipt);
            if (sameFile) assert.equal(freshReceipt.request, originalReceipt.request); else assert.notEqual(freshReceipt.request, originalReceipt.request);
            assert.equal(current[b.storage.restoreRecoveryKey].reason, 'beforeRestore');
            assert.equal(current[b.storage.restoreRecoveryKey].payload.data.quote, CHOSEN);
            assert.deepEqual(f.raw[C.KEY], archive); assert.equal(f.raw[C.KEY].body.receipt.status, 'pending');
            const setCalls = m.calls.filter(call => call.method === 'setAll').slice(setStart); assert.equal(setCalls.length, 2);
            assert(!setCalls.some(call => call.args[1].newRestoreOperation));
            const capability = setCalls[1].args[1].closedRestoreTicket; assert(capability && Object.isFrozen(capability)); assert.deepEqual(Object.keys(capability), []);
            assert.equal(m.calls.filter(call => call.method === 'confirmClosedRestore').length, 1);
            assert.equal(m.prompts.length, 2); assertPrivate(m); assert.deepEqual(f.providers, []);
            const writesAfter = f.writes.length; await m.click('importClosureRecheck', 'recheckImportClosure');
            assert.equal(f.writes.length, writesAfter); assert(m.allText().includes(m.label('importClosureRecheckedHistorical')));
        } finally { m.dispose(); }
    });
});
for (const mutate of ['saved configuration', 'root privacy']) bounded(`real Options rejects ${mutate} changed after review without a closure write`, async () => {
    const f = fixture(seed()); await withGlobals(f, async () => {
        const b = await conflict(f), m = page(b.storage);
        try {
            await m.click('importClosureReview', 'reviewImportClosure');
            await b.session.local.set(mutate === 'root privacy' ? { privacy: { onlineFavicons: true } } : { quote: 'SYNTHETIC_NEWER_EDIT' });
            const before = clone(f.raw), n = f.writes.length;
            await m.click('importClosureConfirm', 'commitImportClosure');
            assert.equal(f.writes.length, n); assert.deepEqual(f.raw, before); assert(!Object.hasOwn(f.raw, C.KEY));
            assert(m.allText().includes(m.label('importClosureFailed'))); assert(!m.find('importClosureConfirm')); assertPrivate(m); assert.deepEqual(f.providers, []);
        } finally { m.dispose(); }
    });
});
for (const mismatch of ['missing', 'changed']) bounded(`real Options original recovery ${mismatch} blocks review with no confirmation control`, async () => {
    const f = fixture(seed()); await withGlobals(f, async () => {
        const b = await conflict(f), raw = values(f);
        // Simulate external historical loss/corruption before the production read.
        if (mismatch === 'missing') delete raw[b.storage.restoreRecoveryKey];
        else raw[b.storage.restoreRecoveryKey].providerState.syntheticChangedBookkeeping = true;
        const m = page(b.storage), before = clone(f.raw), n = f.writes.length;
        try {
            await m.click('importClosureReview', 'reviewImportClosure');
            assert(m.allText().includes(m.label('importClosureRecoveryUnavailable'))); assert(!m.find('importClosureConfirm'));
            assert.equal(f.writes.length, n); assert.deepEqual(f.raw, before); assertPrivate(m); assert.deepEqual(f.providers, []);
        } finally { m.dispose(); }
    });
});
bounded('real Options refuses a second workspace conflict in the installation-wide occupied slot', async () => {
    const f = fixture(seed()); await withGlobals(f, async () => {
        const first = await conflict(f), a = page(first.storage); let b;
        try {
            const archive = await record(a, f);
            const id = (await first.manager.create('Synthetic second workspace')).id;
            const session = first.manager.capture(id); await session.ready();
            const second = await conflict(f, { manager: first.manager, session, storage: storageFor(f, session) }); b = page(second.storage);
            const before = clone(f.raw), n = f.writes.length;
            await b.click('importClosureReview', 'reviewImportClosure');
            assert(b.allText().includes(b.label('importClosureOccupied'))); assert(!b.find('importClosureConfirm'));
            assert.equal(f.writes.length, n); assert.deepEqual(f.raw, before); assert.deepEqual(f.raw[C.KEY], archive);
            assert.equal(values(f, id)[second.storage.restoreReceiptKey].status, 'pending');
            await b.click('importClosureRecheck', 'recheckImportClosure');
            assert(b.allText().includes(b.label('importClosureRecheckedHistorical'))); assert.equal(f.writes.length, n);
            assertPrivate(a); assertPrivate(b); assert.deepEqual(f.providers, []);
        } finally { a.dispose(); b?.dispose(); }
    });
});
bounded('real Options uncertain closure acknowledgment exposes only read-only recheck, with no repeated installation', async () => {
    const f = fixture(seed()); await withGlobals(f, async () => {
        const b = await conflict(f), m = page(b.storage);
        try {
            await m.click('importClosureReview', 'reviewImportClosure'); const before = clone(f.raw), n = f.writes.length; let submitted = false;
            f.hooks.set = (written, _raw, apply) => { if (!Object.hasOwn(written, C.KEY)) return DEFER; submitted = true; apply(written); throw Error('Synthetic uncertain archive acknowledgment'); };
            f.hooks.get = keys => { if (submitted && keys?.includes(C.KEY)) throw Error('Synthetic temporary readback failure'); return DEFER; };
            await m.click('importClosureConfirm', 'commitImportClosure');
            assert(m.allText().includes(m.label('importClosureUncertain'))); assert(!m.find('importClosureConfirm')); assert.equal(f.writes.length, n + 1);
            f.hooks.set = f.hooks.get = null; const recorded = clone(f.raw[C.KEY]); assert(recorded);
            await m.click('importClosureRecheck', 'recheckImportClosure');
            assert(m.allText().includes(m.label('importClosureRecheckedActive'))); assert.equal(f.writes.length, n + 1); assert.deepEqual(f.raw[C.KEY], recorded);
            const stripped = clone(f.raw); delete stripped[C.KEY]; assert.deepEqual(stripped, before); assertPrivate(m); assert.deepEqual(f.providers, []);
        } finally { f.hooks.set = f.hooks.get = null; m.dispose(); }
    });
});
