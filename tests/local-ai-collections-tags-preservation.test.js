const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../shared/local-ai-collections-store.js');
const { setup, add, tick } = require('./helpers/collections-harness.js');
const tags = ['Research, planning', '保留，原始标签'];

async function imported() {
    const h = setup(), c = h.controller;
    await c.start(); await add(c);
    const backup = JSON.parse(await h.store.export());
    backup.content.records[0].tags = [...tags];
    const json = JSON.stringify(backup);
    assert.deepEqual(Core.parseBackup(json).content.records[0].tags, tags);
    await h.store.mutate(h.store.request('replace', await h.store.review(json)));
    await c.refresh();
    c.select(c.state.records[0].id);
    return h;
}

test('imported delimiter-bearing tags survive repeated metadata edits, export and body history restoration', async () => {
    const h = await imported(), c = h.controller, original = c.record();
    for (const [field, value] of [['title', 'Renamed'], ['notes', 'Annotation'], ['tool', 'Example']]) {
        assert.equal(c.edit(), true); c.update(field, value);
        assert.equal(await c.save(), true);
        assert.deepEqual(c.record().tags, tags);
        assert.deepEqual(c.record().history, original.history);
        assert.equal(c.record().currentVersionId, original.currentVersionId);
    }
    await tick(); assert.equal(await c.acceptRevision(await c.reviewBody('New excerpt')), true);
    await tick(); assert.equal(await c.acceptRevision(await c.reviewBody(null, original.currentVersionId)), true);
    assert.deepEqual(c.record().tags, tags);
    assert.equal(c.record().body, original.body);
    assert.equal(c.record().history.length, 3);
    const exported = Core.parseBackup(await h.store.export());
    assert.deepEqual(exported.content.records[0].tags, tags);
    c.dispose();
});

test('same-value tag input and text edit/revert preserve the original array, discard resets it', async () => {
    const h = await imported(), c = h.controller;
    c.edit(); const text = c.draft().input.tagsText;
    c.update('tagsText', text); assert.equal(c.dirty(), false);
    c.update('tagsText', 'temporary'); c.update('tagsText', text); assert.equal(c.dirty(), false);
    c.update('title', 'Reverted tags'); assert.equal(await c.save(), true);
    assert.deepEqual(c.record().tags, tags);
    c.edit(); c.update('tagsText', 'discard me'); c.discard(); c.edit();
    c.update('notes', 'After discard'); assert.equal(await c.save(), true);
    assert.deepEqual(c.record().tags, tags); c.dispose();
});

test('intentional tag edits and new collections retain comma, Chinese comma and newline input semantics', async () => {
    const h = await imported(), c = h.controller;
    c.edit(); c.update('tagsText', ' one, two，三\nfour '); assert.equal(await c.save(), true);
    assert.deepEqual(c.record().tags, ['one', 'two', '三', 'four']);
    c.edit(); c.update('notes', 'Repeat edit'); assert.equal(await c.save(), true);
    assert.deepEqual(c.record().tags, ['one', 'two', '三', 'four']);
    c.edit(); c.update('tagsText', ''); assert.equal(await c.save(), true); assert.deepEqual(c.record().tags, []);
    c.create(); c.update('title', 'New'); c.update('body', 'New excerpt');
    c.update('tagsText', ' one，two\nthree, four '); assert.equal(await c.save(), true);
    assert.deepEqual(c.record().tags, ['one', 'two', 'three', 'four']); c.dispose();
});

test('stale draft save-as-copy preserves its own original tags rather than newer persisted tags', async () => {
    const h = await imported(), c = h.controller, record = c.record();
    c.edit(); c.update('notes', 'Local draft');
    await h.store.mutate(h.store.request('edit', { id: record.id, version: record.version, tags: ['remote'] }));
    await tick(); assert.equal(c.draft().conflict, true);
    assert.equal(await c.save(), false); assert.equal(await c.save(true), true);
    assert.notEqual(c.record().id, record.id); assert.deepEqual(c.record().tags, tags);
    assert.deepEqual(c.state.records.find(item => item.id === record.id).tags, ['remote']); c.dispose();
});

test('uncertain metadata write retains exact tags through operation retry', async () => {
    const h = await imported(), c = h.controller;
    c.edit(); c.update('title', 'Retry title'); h.failOnce();
    assert.equal(await c.save(), false); assert.deepEqual(c.pendingCommand.command.tags, tags);
    await c.refresh(); assert.equal(await c.retry(), true);
    assert.deepEqual(c.record().tags, tags); assert.equal(c.state.records.length, 1); c.dispose();
});
