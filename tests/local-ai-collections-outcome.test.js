const test = require('node:test');
const assert = require('node:assert/strict');
const { setup, add, tick } = require('./helpers/collections-harness.js');
const Core = require('../shared/local-ai-collections-store.js');
const Workspaces = require('../shared/workspaces.js');
const { Controller } = require('../shared/local-ai-collections-controller.js');

function loseReadback(h) {
    const read = h.backend.read, write = h.backend.write; let fail = false;
    h.backend.read = async () => { if (fail) { fail = false; throw Error('lost readback'); } return read(); };
    h.backend.write = async value => { h.backend.write = write; await write(value); fail = true; };
}
async function uncertain(h, kind) {
    const c = h.controller;
    await c.start(); const original = await add(c, 'Original', '  e\u0301\r\n\t{{text}} ');
    if (kind === 'restore') await c.action('remove');
    let plan;
    if (kind === 'revise') plan = await c.reviewBody('  revised\r\n\t');
    if (['add', 'edit', 'copy'].includes(kind)) {
        if (kind === 'add') c.create(); else c.edit();
        c.update('title', 'Submitted'); c.update('notes', '  exact annotation\r\n');
        if (kind === 'add') c.update('body', '  new body\r\n');
    }
    loseReadback(h);
    const ok = kind === 'revise' ? await c.acceptRevision(plan) : ['remove', 'restore'].includes(kind) ? await c.action(kind) : await c.save(kind === 'copy');
    assert.equal(ok, false); await tick(); assert.ok(c.pendingCommand); return original;
}
for (const kind of ['add', 'copy', 'edit', 'revise', 'remove', 'restore']) test(`real Store: ${kind} readback loss, later write, conflict and read-only historical proof`, async () => {
    const h = setup(), c = h.controller; await uncertain(h, kind);
    const operation = c.pendingCommand, draft = c.draft() && JSON.stringify(c.draft().input);
    assert.equal(Object.isFrozen(operation.command), true);
    const targetId = ['add', 'copy'].includes(kind) ? operation.command.operationId : operation.command.id;
    let target = h.raw.records.find(r => r.id === targetId);
    if (target.deletedAt) await h.store.mutate(h.store.request('restore', { id: target.id, version: target.version }));
    target = h.raw.records.find(r => r.id === targetId);
    await h.store.mutate(h.store.request('edit', { id: target.id, version: target.version, notes: 'later external annotation' })); await tick();
    const before = JSON.stringify(h.raw), writes = h.writes;
    assert.equal(await c.retry(), false); await tick();
    assert.equal(c.pendingInspection, true); assert.equal(c.pendingCommand, operation);
    assert.equal(await c.save(true), false); assert.equal(c.create(), false); assert.equal(c.discard(), false);
    if (draft) assert.equal(JSON.stringify(c.draft().input), draft);
    assert.equal(await c.verify(), true); await tick();
    assert.equal(c.pendingCommand, null); assert.equal(c.pendingInspection, false); assert.equal(c.notice, 'reconciled');
    assert.equal(c.state.records.find(r => r.id === targetId).notes, 'later external annotation');
    assert.equal(JSON.stringify(h.raw), before); assert.equal(h.writes, writes); c.dispose();
});
test('direct inspection acknowledges latest receipt with no retry write', async () => {
    const h = setup(), c = h.controller; await uncertain(h, 'copy'); const before = JSON.stringify(h.raw), writes = h.writes;
    assert.equal(await c.verify(), true); await tick(); assert.equal(c.notice, 'reconciled');
    assert.equal(h.writes, writes); assert.equal(JSON.stringify(h.raw), before); c.dispose();
});
for (const mode of ['missing', 'digest', 'state', 'read']) test(`uncertain operation stays locked without receipt proof: ${mode}`, async () => {
    const h = setup(), c = h.controller; await uncertain(h, 'copy'); const operation = c.pendingCommand, input = JSON.stringify(c.draft().input);
    const raw = h.raw;
    if (mode === 'missing') raw.receipts = [];
    if (mode === 'digest') raw.receipts[0].digest = '0'.repeat(64);
    if (mode === 'state') raw.records[0].notes = 'unreceipted change';
    if (mode === 'read') h.backend.read = async () => { throw Error('offline'); }; else await h.backend.write(raw);
    await tick(); const writes = h.writes;
    for (let i = 0; i < 2; i++) {
        assert.equal(await c.verify(), false); await tick(); assert.equal(c.pendingCommand, operation);
        assert.equal(c.pendingInspection, true); assert.equal(await c.retry(), false); await tick();
        assert.equal(await c.save(true), false); assert.equal(c.discard(), false); c.update('notes', 'blocked');
        assert.equal(JSON.stringify(c.draft().input), input); assert.equal(c.hasUncommittedWork(), true);
    }
    assert.equal(h.writes, writes); c.dispose();
});
test('initial definite conflict stays recoverable as ordinary draft conflict', async () => {
    const h = setup(), c = h.controller; await c.start(); const original = await add(c); c.edit(); c.update('notes', 'unsaved');
    // Suppress notifications to leave the editor on its original version.
    c.unsubscribe(); await h.store.mutate(h.store.request('edit', { id: original.id, version: original.version, notes: 'other' }));
    assert.equal(await c.save(), false); await tick(); assert.equal(c.error.code, 'CONFLICT');
    assert.equal(c.pendingCommand, null); assert.equal(c.pendingInspection, false); assert.equal(c.draft().conflict, true);
    assert.equal(await c.save(true), true); await tick(); assert.equal(h.raw.records.length, 2); c.dispose();
});
for (const mode of ['close', 'generation', 'truthy']) test(`late or invalid inspection cannot clear pending operation: ${mode}`, async () => {
    const h = setup(), c = h.controller; await uncertain(h, 'copy'); const operation = c.pendingCommand, draft = JSON.stringify(c.draft());
    const inspect = h.store.inspectOperation.bind(h.store); let release, entered;
    const ready = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
    h.store.inspectOperation = async command => { const result = await inspect(command); entered(); await gate; return mode === 'truthy' ? { ...result, committed: 'true' } : result; };
    const writes = h.writes, pending = c.verify(); await ready;
    assert.equal(await c.verify(), false); assert.equal(await c.retry(), false);
    if (mode === 'close') c.dispose(); if (mode === 'generation') c.readGeneration++;
    release(); assert.equal(await pending, false); await tick();
    assert.equal(c.pendingCommand, operation); assert.equal(JSON.stringify(c.draft()), draft); assert.equal(h.writes, writes); c.dispose();
});
test('real workspace restore fence blocks inspection until settled and never writes', async () => {
    const h = setup(), c = h.controller; await uncertain(h, 'copy'); const operation = c.pendingCommand;
    let marker = { schemaVersion: 1, id: 'restore_identity', status: 'prepared' }, writes = 0;
    const chrome = { storage: { local: { async get() { return { [Core.KEY]: h.raw, [Workspaces.RESTORE_TRANSACTION_KEY]: marker }; }, async set() { writes++; } }, onChanged: { addListener() {}, removeListener() {} } } };
    const locks = { request(name, options, action) { return action(); } };
    const manager = new Workspaces.Manager({ chrome, locks });
    c.store = new Core.Store(manager.createCollectionBackend(Core));
    assert.equal(await c.verify(), false); await tick(); assert.equal(c.pendingCommand, operation); assert.equal(c.pendingInspection, true);
    marker = { ...marker, status: 'verified' };
    assert.equal(await c.verify(), true); await tick(); assert.equal(c.pendingCommand, null); assert.equal(writes, 0); c.dispose();
});

test('receipt eviction cannot turn uncertain copy into a new write', async () => {
    const h = setup(), c = h.controller; await uncertain(h, 'copy'); const operation = c.pendingCommand;
    for (let i = 0; i < 128; i++) await h.store.mutate(h.store.request('add', { title: `Synthetic ${i}`, body: 'Synthetic receipt eviction' }));
    await tick(); assert.equal(h.raw.receipts.some(r => r.id === operation.command.operationId), false);
    const writes = h.writes, before = JSON.stringify(h.raw);
    assert.equal(await c.retry(), false); await tick(); assert.equal(await c.verify(), false); await tick();
    assert.equal(c.pendingCommand, operation); assert.equal(await c.save(true), false);
    assert.equal(h.writes, writes); assert.equal(JSON.stringify(h.raw), before); c.dispose();
});
