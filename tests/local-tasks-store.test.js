const assert = require('node:assert/strict');
const test = require('node:test');
const api = require('../shared/local-tasks-store.js');
const { Controller } = require('../shared/local-tasks-controller.js');
const copy = value => value === undefined ? undefined : structuredClone(value);
// Deliberate backend model, not native Chrome. It serializes all pages' locks.
function backend() {
    let raw, queue = Promise.resolve(); const listeners = new Set();
    return {
        writes: 0, failRead: false, failWrite: false, throwWrite: false, failVerify: false, delay: null,
        lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() { if (this.failRead) throw Error('private backend detail'); return copy(raw); },
        async write(value) {
            this.writes++; if (this.delay) await this.delay;
            if (this.throwWrite) throw Error('secret'); if (this.failWrite) return false;
            raw = copy(value); if (this.failVerify) { this.failVerify = false; this.failRead = true; }
            listeners.forEach(fn => fn());
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        raw() { return copy(raw); }, corrupt(value) { raw = value; }
    };
}
function fixture() { const b = backend(); let sequence = 0; const options = { id: () => `identity_${++sequence}`, now: () => '2026-10-08T18:00:00.000Z' }; return { b, a: new api.Store(b, options), c: new api.Store(b, options) }; }
const add = (store, text) => store.mutate(store.request('add', { text }));
const command = (store, kind, task, rest = {}) => store.request(kind, { id: task.id, version: task.version, ...rest });

test('plain text, stable identity, one pin, completion, reopen and order', async () => {
    const { a } = fixture(); let state = await add(a, '  中文 👩🏽‍💻 <script>alert(1)</script>  ');
    const first = state.records[0]; state = await add(a, first.text); const second = state.records[1];
    assert.notEqual(first.id, second.id); assert.equal(first.text, '  中文 👩🏽‍💻 <script>alert(1)</script>  ');
    state = await a.mutate(command(a, 'pin', first, { expectedPin: null })); assert.equal(state.pinnedId, first.id);
    state = await a.mutate(command(a, 'pin', second, { expectedPin: first.id })); assert.equal(state.pinnedId, second.id);
    state = await a.mutate(command(a, 'complete', second)); assert.equal(state.pinnedId, null);
    state = await a.mutate(command(a, 'reopen', state.records[1]));
    state = await a.mutate(command(a, 'move', first, { order: state.records.map(t => t.id), direction: 1 }));
    assert.deepEqual(state.records.map(t => t.id), [second.id, first.id]);
    await assert.rejects(() => add(a, ' '), { code: 'TEXT' });
    await assert.rejects(() => add(a, '中'.repeat(1001)), { code: 'TEXT_LIMIT' });
    assert.equal((await a.read()).records.length, 2);
});

test('independent pages merge independent task edits; same-record and order conflicts fail closed', async () => {
    const { a, c } = fixture(); await add(a, 'A'); let state = await add(a, 'B'); const [one, two] = state.records;
    await Promise.all([a.mutate(command(a, 'edit', one, { text: 'A updated' })), c.mutate(command(c, 'edit', two, { text: 'B updated' }))]);
    state = await a.read(); assert.deepEqual(state.records.map(t => t.text), ['A updated', 'B updated']);
    await assert.rejects(() => c.mutate(command(c, 'edit', one, { text: 'stale' })), { code: 'CONFLICT' });
    const oldOrder = state.records.map(t => t.id); await add(c, 'C');
    await assert.rejects(() => a.mutate(command(a, 'move', state.records[0], { order: oldOrder, direction: 1 })), { code: 'CONFLICT' });
    assert.deepEqual((await a.read()).records.map(t => t.text), ['A updated', 'B updated', 'C']);
});

test('removed records survive reload, exact identity restores, hiding retains data', async () => {
    const { a, c } = fixture(); let state = await add(a, 'same'); state = await add(a, 'same');
    const first = state.records[0]; state = await a.mutate(command(a, 'remove', first));
    const removed = state.records[0]; assert.equal(removed.state, 'removed');
    state = await c.mutate(command(c, 'restore', (await c.read()).records[0]));
    assert.equal(state.records[0].id, first.id); assert.equal(state.records[1].state, 'active');
    await c.mutate(c.request('enable', { enabled: true })); const records = (await c.read()).records;
    await a.mutate(a.request('enable', { enabled: false })); assert.deepEqual((await c.read()).records, records);
});

test('false, throw, read and uncertain verification failures retain coherent committed state and idempotent retry', async () => {
    const { a, b } = fixture(); await add(a, 'committed'); const before = b.raw(), request = a.request('add', { text: 'draft' });
    for (const flag of ['failWrite', 'throwWrite', 'failRead']) {
        b[flag] = true; await assert.rejects(() => a.mutate(request)); b[flag] = false; assert.deepEqual(b.raw(), before);
    }
    b.failVerify = true; await assert.rejects(() => a.mutate(request), { code: 'READ' }); b.failRead = false;
    const writes = b.writes; const state = await a.mutate(request);
    assert.equal(b.writes, writes); assert.deepEqual(state.records.map(t => t.text), ['committed', 'draft']);
    await a.mutate(request); assert.equal((await a.read()).records.length, 2);
});

test('malformed storage fails closed without seeding/erasing records', async () => {
    const { a, b } = fixture(); b.corrupt({ secret: 'not a supported schema' });
    await assert.rejects(() => a.read(), { code: 'INVALID' });
    await assert.rejects(() => add(a, 'new'), { code: 'INVALID' }); assert.equal(b.writes, 0);
});

test('separate backup roundtrip/review/checked replace/recovery with strict validation', async () => {
    const { a, c, b } = fixture(); let state = await add(a, 'old local'); state = await a.mutate(command(a, 'pin', state.records[0], { expectedPin: null }));
    const original = await a.export(); await add(a, 'new local'); const before = b.raw();
    const review = await a.review(original); assert.deepEqual(b.raw(), before, 'review/cancel does not write');
    b.failWrite = true; await assert.rejects(() => a.mutate(a.request('replace', review)), { code: 'WRITE' }); b.failWrite = false;
    assert.deepEqual(b.raw(), before);
    state = await a.mutate(a.request('replace', review)); assert.equal(state.records.length, 1); assert.equal(state.recovery.length, 1);
    assert.equal(state.recovery[0].content.records.length, 2); assert.equal(state.pinnedId, state.records[0].id);
    const snapshot = state.recovery[0]; state = await c.mutate(c.request('recover', { id: snapshot.id, revision: state.revision }));
    assert.equal(state.records.length, 2); assert.equal(state.recovery.length, 1); assert.equal(state.recovery[0].content.records.length, 1);
    assert.equal(api.parseBackup(await a.export()).recovery.length, 1);
    const freshReview = await a.review(original); await add(c, 'concurrent');
    await assert.rejects(() => a.mutate(a.request('replace', freshReview)), { code: 'CONFLICT' });
    for (const invalid of ['{', '{}', original.replace('"schemaVersion":1', '"schemaVersion":2'), original.replace('"format":"local-itab-tasks"', '"format":"settings"')]) await assert.rejects(() => a.review(invalid));
});

test('imports invalidate stale per-record editors even for identical imported IDs and versions', async () => {
    const { a } = fixture(); const before = (await add(a, 'before')).records[0]; const file = await a.export();
    await a.mutate(a.request('replace', await a.review(file)));
    await assert.rejects(() => a.mutate(command(a, 'edit', before, { text: 'stale' })), { code: 'CONFLICT' });
});

test('recovery capacity refuses instead of purging any previous copy', async () => {
    const { a, b } = fixture(); await add(a, 'preserve'); const file = await a.export();
    for (let i = 0; i < api.LIMITS.recovery; i++) await a.mutate(a.request('replace', await a.review(file)));
    const before = b.raw(); await assert.rejects(async () => a.mutate(a.request('replace', await a.review(file))), { code: 'RECOVERY_LIMIT' });
    assert.deepEqual(b.raw(), before);
    const state = await a.mutate(a.request('recover', { id: before.recovery[0].id, revision: before.revision })); assert.equal(state.recovery.length, api.LIMITS.recovery);
});

test('controller coalesces rapid activation and late success remains confirmed, retry stays usable', async () => {
    const { a, b } = fixture(); const controller = new Controller(a); await controller.refresh();
    let release; b.delay = new Promise(resolve => { release = resolve; }); const request = a.request('add', { text: 'one' });
    const one = controller.run(request), two = controller.run(request); assert.equal(one, two); assert.equal(controller.status, 'saving');
    release(); await one; assert.equal(controller.status, 'saved'); assert.equal(controller.state.records.length, 1);
    b.delay = null; b.failWrite = true; await assert.rejects(() => controller.action('add', { text: 'retry' }));
    assert.equal(controller.status, 'error'); assert.equal(controller.state.records.length, 1); b.failWrite = false;
    await controller.retry(); assert.equal(controller.state.records.length, 2); controller.destroy();
});

test('export errors contain only bounded codes, never user content or backend detail', async () => {
    const { a, b } = fixture(); await add(a, 'PRIVATE_SENTINEL'); b.throwWrite = true;
    try { await add(a, 'PRIVATE_SENTINEL_2'); assert.fail(); } catch (error) { assert.equal(error.message, 'Local tasks: WRITE'); }
});

test('uncertain receipt cannot report success after newer edit, import, or unrelated commit', async () => {
    for (const later of ['edit', 'replace', 'add']) {
        const { a, c, b } = fixture(); const task = (await add(a, 'original')).records[0]; const backup = await a.export();
        const request = command(a, 'edit', task, { text: 'uncertain editor draft' });
        b.failVerify = true; await assert.rejects(() => a.mutate(request)); b.failRead = false;
        if (later === 'edit') await c.mutate(command(c, 'edit', (await c.read()).records[0], { text: 'newest other edit' }));
        if (later === 'replace') await c.mutate(c.request('replace', await c.review(backup)));
        if (later === 'add') await add(c, 'unrelated');
        const before = b.raw(); await assert.rejects(() => a.mutate(request), { code: 'CONFLICT' }); assert.deepEqual(b.raw(), before);
    }
});

test('Chrome-style object key reordering preserves save verification and recovery equality', async () => {
    const { a, b } = fixture();
    const reorderKeys = value => Array.isArray(value) ? value.map(reorderKeys) : value && typeof value === 'object' ?
        Object.fromEntries(Object.keys(value).sort().map(key => [key, reorderKeys(value[key])])) : value;
    const write = b.write.bind(b);
    b.write = value => write(reorderKeys(value));
    let state = await add(a, 'verified despite key order');
    assert.equal(state.records[0].text, 'verified despite key order');
    const file = await a.export();
    state = await a.mutate(a.request('replace', await a.review(file)));
    const backup = JSON.parse(await a.export());
    // A local backup can encode existing recovery properties in another order.
    const copy = backup.recovery[0];
    backup.recovery[0] = { content: copy.content, createdAt: copy.createdAt, id: copy.id };
    state = await a.mutate(a.request('replace', await a.review(JSON.stringify(backup))));
    assert.equal(state.recovery.length, 2);
    assert.equal(state.records[0].text, 'verified despite key order');
    // Actual value/array-order corruption must still fail verification.
    b.write = value => write({ ...value, records: value.records.map(task => ({ ...task, text: 'changed by backend' })) });
    await assert.rejects(() => add(a, 'must not report success'), { code: 'VERIFY' });
});


async function fullMigrationArchive() {
    const { a } = fixture();
    let state = await add(a, 'migration task');
    state = await a.mutate(command(a, 'pin', state.records[0], { expectedPin: null }));
    const original = await a.export();
    for (let i = 0; i < api.LIMITS.recovery; i++) await a.mutate(a.request('replace', await a.review(original)));
    const source = await a.export();
    assert.equal(api.parseBackup(source).recovery.length, 8);
    return source;
}

test('full exported archive migrates into an empty destination without losing recovery history', async () => {
    const source = await fullMigrationArchive(), file = api.parseBackup(source);
    for (const enabled of [null, true, false]) {
        const { a, b } = fixture();
        if (enabled !== null) {
            await a.mutate(a.request('enable', { enabled: !enabled }));
            await a.mutate(a.request('enable', { enabled }));
        }
        const before = b.raw(), writes = b.writes, review = await a.review(source);
        assert.deepEqual(b.raw(), before); assert.equal(b.writes, writes);
        const state = await a.mutate(a.request('replace', review));
        assert.equal(state.enabled, enabled ?? false);
        assert.equal(state.pinnedId, file.content.pinnedId);
        assert.deepEqual(state.records.map(({ version, ...record }) => record), file.content.records.map(({ version, ...record }) => record));
        assert.notEqual(state.records[0].version, file.content.records[0].version);
        assert.deepEqual(state.recovery, file.recovery);
        const reexport = api.parseBackup(await a.export());
        assert.deepEqual(reexport.recovery, file.recovery);
        assert.deepEqual(reexport.content, { records: state.records, pinnedId: state.pinnedId });
        assert.equal(b.writes, writes + 1);
    }
});

test('full archive refuses every meaningful destination without writing or dropping history', async () => {
    const source = await fullMigrationArchive();
    for (const status of ['active', 'done', 'removed']) {
        const { a, b } = fixture(); let state = await add(a, 'keep this local task');
        if (status === 'done') state = await a.mutate(command(a, 'complete', state.records[0]));
        if (status === 'removed') state = await a.mutate(command(a, 'remove', state.records[0]));
        const before = b.raw(), writes = b.writes;
        await assert.rejects(() => a.mutate(a.request('replace', { source, revision: state.revision })), { code: 'RECOVERY_LIMIT' });
        assert.deepEqual(b.raw(), before); assert.equal(b.writes, writes);
    }
    // Even an empty list with existing history remains under the old strict policy.
    const { a, b } = fixture(); const state = api.initial(); state.recovery = api.parseBackup(source).recovery;
    b.corrupt(state); const before = b.raw();
    await assert.rejects(() => a.mutate(a.request('replace', { source, revision: 0 })), { code: 'RECOVERY_LIMIT' });
    assert.deepEqual(b.raw(), before); assert.equal(b.writes, 0);
});

test('migration keeps duplicate recovery ID validation and conflict protection', async () => {
    const source = await fullMigrationArchive();
    const { a, b } = fixture(); const duplicated = api.parseBackup(source);
    duplicated.recovery[1] = structuredClone(duplicated.recovery[0]);
    await assert.rejects(() => a.review(JSON.stringify(duplicated)), { code: 'INVALID' });
    const state = api.initial(); state.recovery = [structuredClone(api.parseBackup(source).recovery[0])];
    state.recovery[0].content.records[0].text = 'different destination history'; b.corrupt(state);
    const before = b.raw();
    await assert.rejects(() => a.mutate(a.request('replace', { source, revision: 0 })), { code: 'CONFLICT' });
    assert.deepEqual(b.raw(), before); assert.equal(b.writes, 0);
});

test('empty migration retains stale review, invalid file and storage-failure protections', async () => {
    const source = await fullMigrationArchive();
    const stale = fixture(); const review = await stale.a.review(source);
    await stale.a.mutate(stale.a.request('enable', { enabled: true }));
    const before = stale.b.raw(), writes = stale.b.writes;
    await assert.rejects(() => stale.a.mutate(stale.a.request('replace', review)), { code: 'CONFLICT' });
    assert.deepEqual(stale.b.raw(), before); assert.equal(stale.b.writes, writes);
    for (const invalid of ['{', '{}', ' '.repeat(api.LIMITS.bytes + 1)]) {
        const { a, b } = fixture(); await assert.rejects(() => a.review(invalid)); assert.equal(b.writes, 0);
    }
    for (const flag of ['failRead', 'failWrite', 'throwWrite']) {
        const { a, b } = fixture(); const request = a.request('replace', await a.review(source)); b[flag] = true;
        await assert.rejects(() => a.mutate(request), { code: flag === 'failRead' ? 'READ' : 'WRITE' });
        assert.equal(b.raw(), undefined);
    }
    const { a, b } = fixture(); const request = a.request('replace', await a.review(source)); b.failVerify = true;
    await assert.rejects(() => a.mutate(request), { code: 'READ' }); b.failRead = false;
    assert.deepEqual(b.raw().recovery, api.parseBackup(source).recovery);
    const savedWrites = b.writes; await a.mutate(request); assert.equal(b.writes, savedWrites);
});


test('empty destinations still retain their preceding empty copy when the archive has room', async () => {
    const file = api.parseBackup(await fullMigrationArchive()); file.recovery.pop();
    const { a } = fixture();
    const state = await a.mutate(a.request('replace', await a.review(JSON.stringify(file))));
    assert.equal(state.recovery.length, 8);
    assert.deepEqual(state.recovery.slice(0, 7), file.recovery);
    assert.deepEqual(state.recovery[7].content, { records: [], pinnedId: null });
});

test('empty migration never confirms a dropped storage write', async () => {
    const source = await fullMigrationArchive(), b = backend();
    b.write = async () => { b.writes++; };
    const a = new api.Store(b, { id: () => 'operation_migration', now: () => '2026-10-08T18:00:00.000Z' });
    const review = await a.review(source);
    await assert.rejects(() => a.mutate(a.request('replace', review)), { code: 'VERIFY' });
    assert.equal(b.raw(), undefined); assert.equal(b.writes, 1);
});
