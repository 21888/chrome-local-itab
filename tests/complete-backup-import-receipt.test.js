'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Backup, clone, code, fixture, withGlobals, seed, storageFor, backupFor, boot, values, restoreOptions, uncertainImport } = require('./helpers/complete-import-receipt-fixture');
const RECEIPT = '__localItabRestoreReceiptV1';
const valid = (status = 'verified') => ({ version: 1, status, request: 'a'.repeat(64), target: 'b'.repeat(64), recovery: 'c'.repeat(64) });
const bounded = (name, action) => test(name, { timeout: 10000 }, action);
const unchanged = async (f, action, expected) => {
    const before = clone(f.raw), writes = f.writes.length;
    await assert.rejects(action(), code(expected));
    assert.equal(f.writes.length, writes, 'no recovery, staging, receipt, sync or registry writes');
    assert.deepEqual(f.raw, before, 'all storage remains byte-equivalent');
    assert.deepEqual(f.providers, []);
};
async function target(f, b, named) {
    const session = named ? b.manager.capture((await b.manager.create('Synthetic target')).id) : b.session;
    await session.ready(); return { session, storage: storageFor(f, session) };
}
async function legacySource(b) { return b.store.snapshot((await b.manager.exportSnapshot()).bundles.find(x => x.id === 'default').values).source; }

for (const named of [false, true]) for (const edited of [false, true]) bounded(`same exported config refuses a real pending import, named=${named}, edited=${edited}, including restart`, async () => {
    const f = fixture(seed());
    await withGlobals(f, async () => {
        const b = await boot(f), t = await target(f, b, named), incoming = { ...t.storage.cloneDefaultConfig(), quote: 'Synthetic uncertain import' };
        await uncertainImport(f, t.storage, t.session, incoming);
        if (edited) await t.session.local.set({ quote: 'Synthetic newer saved edit' });
        const source = await b.store.export(['config']);
        for (let n = 0; n < 2; n++) {
            const store = n ? backupFor(f, storageFor(f), f.manager()) : b.store;
            await unchanged(f, () => store.review(source), 'CONFIG_IMPORT_PENDING');
        }
        assert.equal(values(f, t.session.id)[RECEIPT].status, 'pending');
    });
});

const malformed = [null, false, 0, [], {}, { ...valid(), version: 2 }, { ...valid(), status: 'future' },
    { ...valid(), futureField: true }, { ...valid(), request: 'a'.repeat(63) }, { ...valid(), recovery: 'C'.repeat(64) },
    { version: 1, status: 'pending', request: 'a'.repeat(64), target: 'b'.repeat(64) }];
for (const [index, receipt] of malformed.entries()) bounded(`malformed or unknown future receipt ${index} refuses preview without writes`, async () => {
    const f = fixture(seed());
    await withGlobals(f, async () => {
        const b = await boot(f), source = await b.store.export(['config']); values(f)[RECEIPT] = clone(receipt);
        await unchanged(f, () => b.store.review(source), 'CONFIG_IMPORT_RECEIPT_INVALID');
    });
});

bounded('legacy single destination refuses only its target and keeps undecided preview read-only', async () => {
    const f = fixture(seed());
    await withGlobals(f, async () => {
        const b = await boot(f), t = await target(f, b, true), source = await legacySource(b);
        values(f, t.session.id)[RECEIPT] = valid('pending');
        const undecided = await b.store.review(source, ['config']); assert(undecided.requiresTarget);
        assert.throws(() => b.store.restore(undecided, { confirmed: true }), code('CONFLICT'));
        await unchanged(f, () => b.store.review(source, ['config'], { targetWorkspaceId: t.session.id }), 'CONFIG_IMPORT_PENDING');
        const untouched = clone(values(f, t.session.id));
        await b.store.restore(await b.store.review(source, ['config'], { targetWorkspaceId: 'default' }), { confirmed: true });
        assert.deepEqual(values(f, t.session.id), untouched);
        assert.deepEqual(f.providers, []);
    });
});

for (const trashed of [false, true]) for (const receipt of [valid('pending'), { ...valid(), version: 99 }]) bounded(`all-scoped topology replacement cannot remove a blocked workspace, trash=${trashed}, receipt=${receipt.version}/${receipt.status}`, async () => {
    const f = fixture(seed());
    await withGlobals(f, async () => {
        const b = await boot(f), source = await b.store.export(Backup.SCOPED_MODULES), t = await target(f, b, true);
        values(f, t.session.id)[RECEIPT] = clone(receipt);
        if (trashed) await b.manager.trash(t.session.id);
        await unchanged(f, () => b.store.review(source), receipt.version === 1 ? 'CONFIG_IMPORT_PENDING' : 'CONFIG_IMPORT_RECEIPT_INVALID');
    });
});

for (const receipt of [valid('pending'), { ...valid(), version: 999 }]) for (const modules of [['scratchpad'], ['prompts', 'collections']]) bounded(`unselected configuration receipt does not block ${modules.join('/')} (${receipt.version}/${receipt.status})`, async () => {
    const f = fixture(seed());
    await withGlobals(f, async () => {
        const b = await boot(f); values(f)[RECEIPT] = clone(receipt);
        const before = clone(values(f)), source = await b.store.export(modules), options = modules.includes('prompts') ? { promptTarget: 'global-library', collectionTarget: 'global-collections' } : {};
        await b.store.restore(await b.store.review(source, modules, options), { confirmed: true });
        assert.deepEqual(values(f)[RECEIPT], receipt);
        assert.deepEqual(b.storage.restoreReceiptState(values(f)), b.storage.restoreReceiptState(before));
        assert.deepEqual(f.providers, []);
    });
});

for (const mutation of ['pending', 'invalid']) for (const named of [false, true]) bounded(`preview followed by ${mutation} import state refuses commit before any write, named=${named}`, async () => {
    const f = fixture(seed());
    await withGlobals(f, async () => {
        const b = await boot(f), t = await target(f, b, named), source = await b.store.export(['config']);
        const preview = await b.store.review(source);
        if (mutation === 'pending') await uncertainImport(f, t.storage, t.session, { ...t.storage.cloneDefaultConfig(), quote: 'Synthetic concurrent import' });
        else values(f, t.session.id)[RECEIPT] = { ...valid(), version: 99 };
        await unchanged(f, () => b.store.restore(preview, { confirmed: true }), mutation === 'pending' ? 'CONFIG_IMPORT_PENDING' : 'CONFIG_IMPORT_RECEIPT_INVALID');
        assert.throws(() => b.store.restore(preview, { confirmed: true }), code('CONFLICT'), 'stale approval is consumed');
    });
});

for (const edited of [false, true]) bounded(`a real verified receipt permits replacement but ordinary same-file retry needs reconfirmation, edited=${edited}`, async () => {
    const f = fixture(seed());
    await withGlobals(f, async () => {
        const b = await boot(f), incoming = { ...b.storage.cloneDefaultConfig(), quote: 'Synthetic verified import' };
        await b.storage.setAll(incoming, restoreOptions); assert.equal(values(f)[RECEIPT].status, 'verified');
        if (edited) await b.session.local.set({ quote: 'Synthetic saved edit after verification' });
        const before = clone(values(f)[RECEIPT]);
        await b.store.restore(await b.store.review(await b.store.export(['config'])), { confirmed: true });
        assert.deepEqual(values(f)[RECEIPT], before, 'no auto-settlement or receipt rewriting');
        const fresh = f.manager().capture('default'); await fresh.ready();
        const storage = storageFor(f, fresh), raw = clone(f.raw), writes = f.writes.length;
        await assert.rejects(storage.setAll(incoming, restoreOptions), e => e.code === 'RESTORE_RETRY_CONFLICT' && e.canStartNewRestore === true);
        assert.equal(f.writes.length, writes); assert.deepEqual(f.raw, raw); assert.deepEqual(f.providers, []);
    });
});

bounded('normal same-file verification can settle pending first, then complete config restore succeeds', async () => {
    const f = fixture(seed());
    await withGlobals(f, async () => {
        const b = await boot(f), incoming = { ...b.storage.cloneDefaultConfig(), quote: 'Synthetic exact import' };
        await uncertainImport(f, b.storage, b.session, incoming);
        const pendingSource = await b.store.export(['config']);
        await unchanged(f, () => b.store.review(pendingSource), 'CONFIG_IMPORT_PENDING');
        assert.equal(await b.storage.setAll(incoming, restoreOptions), true);
        assert.equal(values(f)[RECEIPT].status, 'verified');
        const result = await b.store.restore(await b.store.review(await b.store.export(['config'])), { confirmed: true });
        assert.equal(result.changed, true); assert.deepEqual(f.providers, []);
    });
});

for (const receipt of [valid('pending'), { ...valid(), version: 99 }]) bounded(`legacy non-workspace complete Store reads and blocks receipt ${receipt.version}/${receipt.status}`, async () => {
    const f = fixture(seed());
    await withGlobals(f, async () => {
        const storage = storageFor(f), store = backupFor(f, storage), source = await store.export(['config']);
        f.raw[RECEIPT] = clone(receipt);
        await unchanged(f, () => store.review(source), receipt.version === 1 ? 'CONFIG_IMPORT_PENDING' : 'CONFIG_IMPORT_RECEIPT_INVALID');
        delete f.raw[RECEIPT]; const preview = await store.review(source); f.raw[RECEIPT] = clone(receipt);
        await unchanged(f, () => store.restore(preview, { confirmed: true }), receipt.version === 1 ? 'CONFIG_IMPORT_PENDING' : 'CONFIG_IMPORT_RECEIPT_INVALID');
    });
});

for (const workspace of [false, true]) for (const receipt of [valid('pending'), { ...valid(), version: 99 }]) bounded(`receipt appearing during awaited recovery preparation is rejected before any write, workspace=${workspace}, version=${receipt.version}`, async () => {
    const f = fixture(seed());
    await withGlobals(f, async () => {
        const b = workspace ? await boot(f) : (() => { const storage = storageFor(f); return { storage, store: backupFor(f, storage) }; })();
        const preview = await b.store.review(await b.store.export(['config'])), fingerprint = b.storage.fingerprint.bind(b.storage), writes = f.writes.length;
        let changed;
        b.storage.fingerprint = async data => {
            if (!changed) { (workspace ? values(f) : f.raw)[RECEIPT] = clone(receipt); changed = clone(f.raw); }
            return fingerprint(data);
        };
        await assert.rejects(b.store.restore(preview, { confirmed: true }), code(receipt.version === 1 ? 'CONFIG_IMPORT_PENDING' : 'CONFIG_IMPORT_RECEIPT_INVALID'));
        assert(changed); assert.equal(f.writes.length, writes); assert.deepEqual(f.raw, changed); assert.deepEqual(f.providers, []);
    });
});
