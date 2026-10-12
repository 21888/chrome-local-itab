const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../shared/local-prompts-store.js');
const { setup, tick } = require('./helpers/prompts-harness.js');
const tags = ['alpha,beta', '中文，逗号', ' spaced '];

async function imported() {
    const h = setup(), c = h.controller;
    // Exercise the real write/export/import path, without modifying a backup fixture.
    await h.store.mutate(h.store.request('add', { title: 'Original', body: 'Explain {{topic}}', tags: [...tags] }));
    const source = await h.store.export();
    assert.deepEqual(Core.parseBackup(source).content.records[0].tags, tags);
    await h.store.mutate(h.store.request('replace', await h.store.review(source)));
    await c.start(); c.select(c.state.records[0].id);
    assert.deepEqual(c.record().tags, tags);
    return h;
}

for (const asCopy of [false, true]) {
    test(`imported exact tags survive title-only ${asCopy ? 'save-as-new' : 'save'} and repeated editing/export`, async () => {
        const h = await imported(), c = h.controller, original = c.record();
        const originalSnapshot = structuredClone(original);
        c.edit(); c.update('title', 'Renamed');
        assert.equal(await c.save(asCopy), true); await tick();
        assert.deepEqual(c.record().tags, tags);
        if (asCopy) {
            assert.notEqual(c.record().id, original.id);
            assert.notEqual(c.record().currentVersionId, original.currentVersionId);
            assert.deepEqual(c.state.records.find(record => record.id === original.id), originalSnapshot);
        } else {
            assert.equal(c.record().id, original.id);
            assert.deepEqual(c.record().history, original.history);
        }
        for (const [field, value] of [['category', 'Writing'], ['tool', 'Example'], ['favorite', true]]) {
            c.edit(); c.update(field, value); assert.equal(await c.save(), true); await tick();
            assert.deepEqual(c.record().tags, tags);
        }
        const exported = Core.parseBackup(await h.store.export());
        assert.ok(exported.content.records.every(record => JSON.stringify(record.tags) === JSON.stringify(tags)));
        c.dispose();
    });
}

test('same-value input, edit/revert, discard and reopening retain the exact original array', async () => {
    const h = await imported(), c = h.controller;
    c.edit(); const text = c.draft().input.tagsText;
    c.update('tagsText', text); assert.equal(c.dirty(), false);
    c.update('tagsText', 'temporary'); c.update('tagsText', text); assert.equal(c.dirty(), false);
    c.update('title', 'Reverted'); assert.equal(await c.save(), true); await tick();
    assert.deepEqual(c.record().tags, tags);
    c.edit(); c.update('tagsText', 'discard me'); assert.equal(c.discard(), true);
    c.edit(); c.update('title', 'After discard'); assert.equal(await c.save(), true); await tick();
    assert.deepEqual(c.record().tags, tags); c.dispose();
});

test('explicit tag edits, clearing and newly created prompts retain existing delimiter/trim semantics', async () => {
    const h = await imported(), c = h.controller;
    c.edit(); c.update('tagsText', ' one, two，三\nfour '); assert.equal(await c.save(), true); await tick();
    assert.deepEqual(c.record().tags, ['one', 'two', '三', 'four']);
    c.edit(); c.update('title', 'Repeat edit'); assert.equal(await c.save(), true); await tick();
    assert.deepEqual(c.record().tags, ['one', 'two', '三', 'four']);
    c.edit(); c.update('tagsText', ''); assert.equal(await c.save(), true); await tick();
    assert.deepEqual(c.record().tags, []);
    c.create(); c.update('title', 'New'); c.update('body', 'New body'); c.update('tagsText', ' one，two\nthree, four ');
    assert.equal(await c.save(), true); await tick();
    assert.deepEqual(c.record().tags, ['one', 'two', 'three', 'four']); c.dispose();
});

test('conflicted save-as-new preserves its draft tags instead of the newer saved tags', async () => {
    const h = await imported(), c = h.controller, original = c.record();
    c.edit(); c.update('title', 'Local title');
    await h.store.mutate(h.store.request('edit', { id: original.id, version: original.version, tags: ['remote'] })); await tick();
    assert.equal(c.draft().conflict, true); assert.equal(await c.save(), false);
    assert.equal(await c.save(true), true); await tick();
    assert.notEqual(c.record().id, original.id); assert.deepEqual(c.record().tags, tags);
    assert.deepEqual(c.state.records.find(record => record.id === original.id).tags, ['remote']); c.dispose();
});

for (const asCopy of [false, true]) {
    test(`uncertain ${asCopy ? 'copy' : 'edit'} retry reuses the exact command and tags without duplication`, async () => {
        const h = await imported(), c = h.controller;
        c.edit(); c.update('title', 'Retry title'); h.failOnce();
        assert.equal(await c.save(asCopy), false); await tick();
        const operation = c.pendingCommand; assert.deepEqual(operation.command.tags, tags);
        const writes = h.writes;
        c.update('tagsText', 'blocked'); assert.equal(c.draft().input.tagsText, tags.join(', '));
        await c.refresh(); assert.equal(await c.retry(), true); await tick();
        assert.equal(h.writes, writes); assert.equal(c.pendingCommand, null);
        assert.deepEqual(c.record().tags, tags); assert.equal(c.state.records.length, asCopy ? 2 : 1);
        c.dispose();
    });
}
