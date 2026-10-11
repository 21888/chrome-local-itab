const test = require('node:test');
const assert = require('node:assert/strict');
const Prompts = require('../shared/local-prompts-store.js');
const { Controller } = require('../shared/local-ai-collections-controller.js');
const { setup, tick } = require('./helpers/collections-harness.js');
const clone = value => value === undefined ? undefined : structuredClone(value);
async function fixture() {
    let raw, seq = 0;
    const ps = new Prompts.Store({ lock: fn => fn(), read: async () => clone(raw), write: async next => { raw = clone(next); }, subscribe: () => () => {} }, { id: () => `audit_prompt_${++seq}`, now: () => '2026-10-10T12:00:00.000Z' });
    const a = (await ps.mutate(ps.request('add', { title: 'Original', body: 'Exact A' }))).records[0];
    await ps.mutate(ps.request('add', { title: 'Second', body: 'Exact B' }));
    const h = setup(), c = new Controller({ store: h.store, promptStore: { read: () => ps.read(), subscribe: () => () => {} } });
    await c.start(); c.create(); c.update('title', 'Collection'); c.update('body', 'Kept excerpt');
    return { h, c, ps, a, get raw() { return clone(raw); }, set raw(next) { raw = clone(next); } };
}
const ref = a => ({ promptId: a.id, bodyVersionId: a.currentVersionId });

test('audit: unresolved saved link survives ordinary edit and uncertain exact retry', async () => {
    const f = await fixture(), { c, a, h } = f;
    c.choosePrompt(a.id, a.currentVersionId); assert.equal(await c.applyPrompt(), true); assert.equal(await c.save(), true); await tick();
    f.raw = Prompts.initial(); await c.refreshPrompts(); assert.equal(c.promptResolution(ref(a)).status, 'unresolved');
    c.edit(); c.update('notes', 'Annotations updated while prompt is absent');
    h.failOnce(); assert.equal(await c.save(), false); const command = clone(c.pendingCommand.command);
    await tick(); assert.deepEqual(c.pendingCommand.command, command); assert.equal(c.unlinkPrompt(), false);
    assert.equal(await c.retry(), true); await tick(); assert.deepEqual(c.record().promptRef, ref(a));
    assert.equal(c.record().notes, 'Annotations updated while prompt is absent'); assert.equal(c.record().body, 'Kept excerpt');
    assert.equal(h.raw.records.length, 1); c.dispose();
});

test('audit: a version belonging to another prompt cannot be applied or resolved', async () => {
    const f = await fixture(), { c, a } = f, other = f.raw.records[1];
    c.choosePrompt(a.id, other.currentVersionId); assert.equal(await c.applyPrompt(), false);
    assert.equal(c.promptResolution({ promptId: a.id, bodyVersionId: other.currentVersionId }).status, 'unresolved');
    assert.equal(c.draft().input.promptId, ''); assert.equal(c.draft().input.bodyVersionId, ''); c.dispose();
});

test('audit: live metadata wins duplicate recovery identity; recovery-only old versions keep snapshot provenance', async () => {
    const f = await fixture(), { c, a } = f, snapshot = clone(a);
    await f.ps.mutate(f.ps.request('edit', { id: a.id, version: a.version, title: 'Renamed live', body: 'New A' }));
    const state = f.raw; state.recovery = [{ id: 'audit_recovery', createdAt: '2026-10-10T12:00:00.000Z', content: { records: [snapshot] } }]; f.raw = state;
    await c.refreshPrompts(); let resolution = c.promptResolution(ref(a));
    assert.equal(resolution.version.body, 'Exact A'); assert.equal(resolution.provenance.title, 'Renamed live'); assert.equal(resolution.provenance.recoveryId, null);
    assert.equal(c.promptOptions().filter(item => item.bodyVersionId === a.currentVersionId).length, 1);
    state.records = state.records.filter(item => item.id !== a.id); f.raw = state; await c.refreshPrompts(); resolution = c.promptResolution(ref(a));
    assert.equal(resolution.version.body, 'Exact A'); assert.equal(resolution.provenance.title, 'Original'); assert.equal(resolution.provenance.recoveryId, 'audit_recovery'); c.dispose();
});

test('audit: corrupt prompt read hides cached versions without changing applied link', async () => {
    const f = await fixture(), { c, a } = f; c.choosePrompt(a.id, a.currentVersionId); assert.equal(await c.applyPrompt(), true);
    const prior = clone(c.draft().input), corrupt = f.raw; corrupt.records[0].history[0].body = 'Forged mismatch'; f.raw = corrupt;
    assert.equal(await c.refreshPrompts(), null); assert.equal(c.promptResolution(ref(a)).status, 'unavailable'); assert.deepEqual(c.promptOptions(), []);
    assert.equal(await c.applyPrompt(), false); assert.deepEqual(c.draft().input, prior); assert.equal(await c.save(), true); await tick(); assert.deepEqual(c.record().promptRef, ref(a)); c.dispose();
});

test('audit: pending Apply cannot revive discarded draft or change its replacement', async () => {
    const f = await fixture(), { c, a } = f; c.choosePrompt(a.id, a.currentVersionId);
    let resolve; c.promptStore.read = () => new Promise(done => { resolve = done; }); const applying = c.applyPrompt();
    assert.equal(c.discard(), true); c.create(); c.update('title', 'Replacement'); c.update('body', 'Replacement excerpt');
    resolve(f.raw); assert.equal(await applying, false); assert.equal(c.draft().input.promptId, ''); assert.equal(c.draft().input.title, 'Replacement'); c.dispose();
});
