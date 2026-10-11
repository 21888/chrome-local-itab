const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../shared/local-prompts-store.js');
const { Controller } = require('../shared/local-prompts-controller.js');
const { setup, add, tick } = require('./helpers/prompts-harness.js');
test('create validates required fields, persists metadata and finds multilingual text', async () => {
    const h = setup(), c = h.controller; await c.start(); c.create();
    assert.equal(await c.save(), false); assert.equal(h.writes, 0);
    c.update('title', 'Draft Review'); c.update('body', '整理中文正文\ncode <script>'); c.update('tagsText', '工作, Review'); c.update('category', 'Writing'); c.update('tool', 'Any tool'); c.update('favorite', true);
    assert.equal(await c.save(), true); await tick(); assert.equal(c.record().body, '整理中文正文\ncode <script>'); assert.deepEqual(c.record().tags, ['工作', 'Review']);
    c.filter({ query: '中文 REVIEW', mode: 'favorites', category: 'Writing' }); assert.equal(c.results().length, 1);
    assert.equal(c.draftCount(), 0); assert.equal(c.hasUncommittedWork(), false); c.dispose();
});
test('drafts survive navigation and filters without being persisted', async () => {
    const h = setup(), c = h.controller; await c.start(); const a = await add(c, 'A', 'one'), b = await add(c, 'B', 'two');
    c.select(a.id); c.edit(); c.update('body', 'unsaved 中文'); c.select(b.id); c.filter({ query: 'two' }); c.select(a.id);
    assert.equal(c.draft().input.body, 'unsaved 中文'); assert.equal(c.draftCount(), 1); assert.equal(h.raw.records.find(r => r.id === a.id).body, 'one');
    c.create(); c.update('title', 'new draft'); c.select(b.id); c.create(); assert.equal(c.draft().input.title, 'new draft'); c.dispose();
});
test('metadata edit keeps body version; body edit and restore preserve history', async () => {
    const h = setup(), c = h.controller; await c.start(); const record = await add(c, 'A', 'one');
    c.edit(); c.update('category', 'Notes'); await c.save(); await tick(); assert.equal(c.record().history.length, 1);
    c.edit(); c.update('body', 'two'); await c.save(); await tick(); assert.equal(c.record().history.length, 2);
    await c.action('restoreVersion', record.currentVersionId); await tick(); assert.equal(c.record().body, 'one'); assert.equal(c.record().history.length, 3); c.dispose();
});
test('soft delete and restore keep ID and exclude trash from normal results', async () => {
    const h = setup(), c = h.controller; await c.start(); const record = await add(c);
    await c.action('remove'); await tick(); assert.equal(c.results().length, 0); c.filter({ mode: 'trash' }); assert.equal(c.results()[0].record.id, record.id);
    await c.action('restore'); await tick(); c.filter({ mode: 'all' }); assert.equal(c.results().length, 1); assert.equal(c.record().history.length, 1); c.dispose();
});
test('variables replace repeats, require explicit values, and never enter saved state', async () => {
    const h = setup(), c = h.controller; await c.start(); await add(c); const saved = h.raw;
    assert.equal(c.preview().complete, false); c.setVariable('topic', '<img>'); assert.deepEqual(c.preview().missing, ['reader']);
    c.setVariable('reader', ''); assert.equal(c.preview().text, 'Explain <img> to . Again <img>.'); assert.equal(c.preview().complete, true);
    c.setLiteral(true); assert.equal(c.preview().text, c.record().body); assert.deepEqual(h.raw, saved); assert.equal(c.hasUncommittedWork(), true);
    c.clearVariables(); assert.equal(c.hasUncommittedWork(), false); c.dispose();
});
test('variable values and their original body survive browsing and saved body updates', async () => {
    const h = setup(), c = h.controller; await c.start(); const a = await add(c), b = await add(c, 'B', 'No variables');
    c.select(a.id); c.setVariable('topic', 'original input'); c.select(b.id); c.select(a.id); assert.equal(c.session().values.topic, 'original input');
    c.edit(); c.update('body', 'Now {{topic}}'); await c.save(); await tick(); assert.equal(c.session().values.topic, 'original input'); assert.ok(c.preview().text.startsWith('Explain')); assert.equal(c.hasUncommittedWork(), true); c.clearVariables(); assert.equal(c.session().values.topic, undefined); assert.ok(c.preview().text.startsWith('Now')); c.dispose();
});
test('same-record external edits retain draft, block stale save and allow independent copy', async () => {
    const h = setup(), c = h.controller; await c.start(); const record = await add(c, 'A', 'one');
    c.edit(); c.update('body', 'my draft'); await h.store.mutate(h.store.request('edit', { id: record.id, version: record.version, body: 'other tab' })); await tick();
    assert.equal(c.draft().conflict, true); assert.equal(c.draft().input.body, 'my draft'); const writes = h.writes; assert.equal(await c.save(), false); assert.equal(h.writes, writes);
    assert.equal(await c.save(true), true); await tick(); assert.equal(h.raw.records.length, 2); assert.ok(h.raw.records.some(r => r.id === record.id && r.body === 'other tab')); assert.equal(c.record().body, 'my draft'); c.dispose();
});
test('a metadata conflict in an untouched editor refreshes safely', async () => {
    const h = setup(), c = h.controller; await c.start(); const record = await add(c); c.edit();
    await h.store.mutate(h.store.request('edit', { id: record.id, version: record.version, title: 'New title' })); await tick();
    assert.equal(c.draft().input.title, 'New title'); assert.equal(c.draft().conflict, false); c.dispose();
});
test('duplicate submit is guarded before first async write and replay uses same command', async () => {
    const h = setup(), c = h.controller; await c.start(); c.create(); c.update('title', 'A'); c.update('body', 'B');
    const first = c.save(); assert.equal(await c.save(), false); await first; await tick(); assert.equal(h.raw.records.length, 1); assert.equal(h.writes, 1); c.dispose();
});
test('uncertain write keeps draft, freezes further edits and retries exact operation', async () => {
    const h = setup(), c = h.controller; await c.start(); c.create(); c.update('title', 'A'); c.update('body', 'B'); h.failOnce();
    assert.equal(await c.save(), false); await tick(); const operation = c.pendingCommand; assert.ok(operation); assert.equal(c.draft().input.body, 'B');
    c.update('body', 'newer'); assert.equal(c.draft().input.body, 'B'); assert.equal(await c.save(), false);
    assert.equal(await c.retry(), true); await tick(); assert.equal(c.pendingCommand, null); assert.equal(h.raw.records.length, 1); assert.equal(h.writes, 1); assert.equal(c.draftCount(), 0); assert.equal(c.record().id, operation.command.operationId); c.dispose();
});
test('20-version limit retains draft and save-as-new keeps old history intact', async () => {
    const h = setup(), c = h.controller; await c.start(); const record = await add(c, 'A', 'v1');
    for (let n = 2; n <= 20; n++) { c.edit(); c.update('body', `v${n}`); await c.save(); await tick(); }
    c.edit(); c.update('body', 'v21'); assert.equal(await c.save(), false); await tick(); assert.equal(c.error.code, 'HISTORY_LIMIT'); assert.equal(c.draft().input.body, 'v21');
    assert.equal(await c.save(true), true); await tick(); assert.equal(h.raw.records.find(r => r.id === record.id).history.length, 20); assert.equal(c.record().history.length, 1); assert.equal(c.record().body, 'v21'); c.dispose();
});
test('read failure keeps existing draft and does not initialize over saved content', async () => {
    const h = setup(), c = h.controller; await c.start(); await add(c); c.edit(); c.update('title', 'keep me');
    const before = h.writes; h.backend.read = async () => { throw new Error('read failed'); }; await c.refresh();
    assert.equal(c.draft().input.title, 'keep me'); assert.equal(c.error.code, 'READ'); assert.equal(h.writes, before); c.dispose();
});
test('an oversized variable form can switch to literal without executing template content', async () => {
    const h = setup(), c = h.controller; await c.start(); await add(c, 'many', Array.from({ length: 101 }, (_, i) => `{{var${i}}}`).join(' '));
    assert.deepEqual(c.variables(), []); assert.equal(c.preview().error, 'VARIABLE_LIMIT'); c.setLiteral(true); assert.equal(c.preview().complete, true); c.dispose();
});
test('confirmed actions carry the reviewed record fence rather than a newer hidden edit', async () => {
    const h = setup(), c = h.controller; await c.start(); const record = await add(c, 'A', 'before review');
    await h.store.mutate(h.store.request('edit', { id: record.id, version: record.version, body: 'new external text' })); await tick();
    assert.equal(await c.action('remove', undefined, record.version), false); await tick(); assert.equal(c.error.code, 'CONFLICT'); assert.equal(c.record().deletedAt, null); assert.equal(c.record().body, 'new external text'); c.dispose();
});
test('history-limit restore offers the requested historical body as an unsaved draft', async () => {
    const h = setup(), c = h.controller; await c.start(); const record = await add(c, 'A', 'v1');
    for (let n = 2; n <= 20; n++) { c.edit(); c.update('body', `v${n}`); await c.save(); await tick(); }
    assert.equal(await c.action('restoreVersion', record.currentVersionId), false); await tick(); assert.equal(c.error.code, 'HISTORY_LIMIT'); assert.equal(c.draft().input.body, 'v1'); assert.equal(c.record().body, 'v20');
    await c.save(true); await tick(); assert.equal(c.record().body, 'v1'); assert.equal(h.raw.records.find(r => r.id === record.id).history.length, 20); c.dispose();
});

test('normal save-as-new copies every draft field with fresh history, never historical preview or filled values', async () => {
    const h = setup(), c = h.controller; await c.start();
    const original = await add(c, 'Original', 'Historical {{topic}}');
    c.edit(); c.update('body', 'Current {{topic}}'); await c.save(); await tick();
    c.setVariable('topic', 'TEMPORARY CURRENT VALUE');
    c.useVersion(original.currentVersionId); c.setVariable('topic', 'TEMPORARY HISTORICAL VALUE');
    const before = JSON.stringify(h.raw.records[0]);
    c.edit(); assert.equal(c.draft().input.body, 'Current {{topic}}');
    const fields = { title: 'Variant 中文', body: 'Draft {{topic}}\r\n  exact\n', category: 'Writing', tagsText: '中文, Review', tool: 'Any tool', favorite: true };
    for (const [name, value] of Object.entries(fields)) c.update(name, value);
    assert.equal(await c.save(true), true); await tick();
    const saved = c.record();
    assert.notEqual(saved.id, original.id); assert.notEqual(saved.currentVersionId, original.currentVersionId);
    assert.equal(JSON.stringify(h.raw.records.find(record => record.id === original.id)), before);
    for (const name of ['title', 'body', 'category', 'tool', 'favorite']) assert.equal(saved[name], fields[name]);
    assert.deepEqual(saved.tags, ['中文', 'Review']); assert.equal(saved.history.length, 1);
    assert.equal(saved.history[0].body, fields.body); assert.equal(saved.currentVersionId, saved.history[0].id);
    assert.deepEqual(Object.keys(c.session().values), []); assert.equal(c.draft(), undefined);
    assert.doesNotMatch(JSON.stringify(h.raw), /TEMPORARY/);
    c.select(original.id); assert.equal(c.session().values.topic, 'TEMPORARY HISTORICAL VALUE'); c.dispose();
});

test('save-as-new permits an unchanged template and normal Save still edits its original ID', async () => {
    const h = setup(), c = h.controller; await c.start(); const original = await add(c);
    const before = JSON.stringify(original); c.edit(); assert.equal(c.dirty(), false);
    assert.equal(await c.save(true), true); await tick();
    assert.notEqual(c.record().id, original.id); assert.equal(c.record().body, original.body);
    assert.equal(JSON.stringify(h.raw.records[0]), before);
    const id = c.record().id; c.edit(); c.update('title', 'Renamed copy'); await c.save(); await tick();
    assert.equal(c.record().id, id); assert.equal(h.raw.records.length, 2); c.dispose();
});

test('save-as-new validation failures preserve all draft fields and saved bytes', async () => {
    const h = setup(), c = h.controller; await c.start(); await add(c);
    for (const [field, value] of [['title', ' '], ['title', 'x'.repeat(Core.LIMITS.title + 1)], ['body', ''], ['tagsText', 'same, same']]) {
        c.discard(); c.edit(); c.update(field, value);
        const draft = JSON.stringify(c.draft()), before = JSON.stringify(h.raw), writes = h.writes;
        assert.equal(await c.save(true), false); await tick();
        assert.equal(JSON.stringify(c.draft()), draft); assert.equal(JSON.stringify(h.raw), before);
        assert.equal(h.writes, writes); assert.equal(c.pendingCommand, null);
    }
    c.dispose();
});

test('save-as-new at record capacity preserves the draft and every saved record', async () => {
    const h = setup(), c = h.controller; await c.start(); const original = await add(c, 'Original', 'Body');
    const full = h.raw;
    for (let n = 1; n < Core.LIMITS.records; n++) {
        const id = `capacity_record_${n}`, version = `capacity_version_${n}`;
        full.records.push({ ...original, id, version, currentVersionId: version, history: [{ ...original.history[0], id: version }] });
    }
    full.revision++; await h.backend.write(Core.validate(full)); await tick();
    c.edit(); c.update('title', 'Retained variant'); c.update('body', 'Unsaved {{topic}}');
    const draft = JSON.stringify(c.draft()), before = JSON.stringify(h.raw), writes = h.writes;
    assert.equal(await c.save(true), false); await tick();
    assert.equal(c.error.code, 'CAPACITY'); assert.equal(JSON.stringify(c.draft()), draft);
    assert.equal(JSON.stringify(h.raw), before); assert.equal(h.writes, writes); assert.equal(c.pendingCommand, null); c.dispose();
});

test('uncertain save-as-new retries the exact add once without changing the original', async () => {
    const h = setup(), c = h.controller; await c.start(); const original = await add(c);
    const before = JSON.stringify(original); c.edit(); c.update('body', 'Variant {{topic}}');
    const draft = JSON.stringify(c.draft()), writes = h.writes; h.failOnce();
    const pending = c.save(true); assert.equal(await c.save(true), false);
    assert.equal(await pending, false); await tick();
    const operation = c.pendingCommand; assert.equal(operation.command.kind, 'add');
    assert.equal(JSON.stringify(c.draft()), draft); c.update('body', 'blocked'); assert.equal(JSON.stringify(c.draft()), draft);
    assert.equal(await c.save(true), false); assert.equal(c.pendingCommand, operation);
    const retry = c.retry(); assert.equal(await c.retry(), false); assert.equal(await retry, true); await tick();
    assert.equal(h.writes, writes + 1); assert.equal(h.raw.records.length, 2);
    assert.equal(c.record().id, operation.command.operationId); assert.equal(c.record().history.length, 1);
    assert.equal(JSON.stringify(h.raw.records.find(record => record.id === original.id)), before);
    assert.equal(c.pendingCommand, null); assert.equal(c.draft(), undefined); c.dispose();
});

test('lost copy acknowledgement plus other-tab write retains operation until read-only receipt proof', async () => {
    const h = setup(), c = h.controller; await c.start(); const original = await add(c, 'Original', 'Template');
    c.edit(); c.update('body', 'Variant'); h.failOnce();
    assert.equal(await c.save(true), false); await tick(); const operation = c.pendingCommand;
    assert.ok(Object.isFrozen(operation.command));
    await h.store.mutate(h.store.request('edit', { id: original.id, version: original.version, title: 'Other tab title' })); await tick();
    const before = JSON.stringify(h.raw), writes = h.writes;
    assert.equal(await c.retry(), false); await tick();
    assert.equal(c.error.code, 'OUTCOME_UNCERTAIN'); assert.equal(c.pendingCommand, operation);
    assert.equal(c.pendingInspection, true); assert.equal(await c.save(true), false);
    c.update('body', 'blocked'); assert.equal(c.draft().input.body, 'Variant'); assert.equal(c.discard(), false);
    assert.equal(await c.retry(), true); await tick();
    assert.equal(c.notice, 'reconciled'); assert.equal(c.pendingCommand, null);
    assert.equal(c.record().id, operation.command.operationId); assert.equal(c.record().history.length, 1);
    assert.equal(c.draft(), undefined); assert.equal(JSON.stringify(h.raw), before); assert.equal(h.writes, writes);
    assert.equal(h.raw.records.length, 2); c.dispose();
});

test('missing or mismatched receipt cannot unlock an uncertain copy or start another add', async () => {
    for (const mismatch of [false, true]) {
        const h = setup(), c = h.controller; await c.start(); await add(c); c.edit(); c.update('body', 'Variant');
        h.failOnce(); await c.save(true); await tick(); const operation = c.pendingCommand;
        const state = h.raw;
        state.receipts = mismatch ? state.receipts.map(r => r.id === operation.command.operationId ? { ...r, digest: '0'.repeat(64) } : r) : [];
        await h.backend.write(state); await tick(); const writes = h.writes;
        assert.equal(await c.retry(), false); await tick(); assert.equal(c.pendingInspection, true);
        for (let n = 0; n < 3; n++) {
            assert.equal(await c.retry(), false); await tick(); assert.equal(c.pendingCommand, operation);
            assert.equal(await c.save(true), false); assert.equal(c.create(), false); assert.equal(c.discard(), false);
        }
        assert.equal(h.raw.records.length, 2); assert.equal(h.writes, writes); c.dispose();
    }
});

test('delayed copy acknowledgement blocks repeated activations and preserves the original', async () => {
    const h = setup(), c = h.controller; await c.start(); const original = await add(c); c.edit(); c.update('body', 'Variant');
    const write = h.backend.write; let release; const wait = new Promise(resolve => { release = resolve; });
    h.backend.write = async value => { await wait; return write(value); };
    const pending = c.save(true); assert.equal(await c.save(true), false); assert.equal(await c.retry(), false);
    assert.equal(c.discard(), false); release(); assert.equal(await pending, true); await tick();
    assert.equal(h.raw.records.length, 2); assert.deepEqual(h.raw.records[0], original); c.dispose();
});

test('receipt proof preserves subsequent changes to the saved copy', async () => {
    const h = setup(), c = h.controller; await c.start(); await add(c); c.edit(); c.update('body', 'Variant');
    h.failOnce(); await c.save(true); await tick(); const operation = c.pendingCommand;
    const saved = h.raw.records.find(record => record.id === operation.command.operationId);
    await h.store.mutate(h.store.request('edit', { id: saved.id, version: saved.version, body: 'Later external edit' })); await tick();
    const before = JSON.stringify(h.raw), writes = h.writes;
    assert.equal(await c.retry(), false); await tick(); assert.equal(await c.retry(), true); await tick();
    assert.equal(c.record().body, 'Later external edit'); assert.equal(c.record().history.length, 2);
    assert.equal(JSON.stringify(h.raw), before); assert.equal(h.writes, writes); c.dispose();
});

test('bounded receipt eviction leaves an uncertain copy frozen instead of creating a new ID', async () => {
    const h = setup(), c = h.controller; await c.start(); await add(c); c.edit(); c.update('body', 'Variant');
    h.failOnce(); await c.save(true); await tick(); const operation = c.pendingCommand;
    for (let n = 0; n < 128; n++) await h.store.mutate(h.store.request('add', { title: `Other ${n}`, body: 'Synthetic' }));
    await tick(); assert.equal(h.raw.receipts.some(r => r.id === operation.command.operationId), false);
    const writes = h.writes; assert.equal(await c.retry(), false); await tick();
    assert.equal(await c.retry(), false); await tick(); assert.equal(c.pendingCommand, operation);
    assert.equal(c.draft().input.body, 'Variant'); assert.equal(await c.save(true), false);
    assert.equal(h.writes, writes); assert.equal(h.raw.records.length, 130); c.dispose();
});
