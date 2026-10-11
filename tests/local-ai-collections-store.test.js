const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../shared/local-ai-collections-store.js');
const copy = value => value === undefined ? undefined : structuredClone(value);
function backend() {
    let raw, queue = Promise.resolve(); const listeners = new Set();
    return {
        writes: 0, failRead: false, failWrite: false, throwWrite: false, failVerify: false, corruptWrite: false, delay: null,
        lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() { if (this.failRead) throw Error('private detail'); return copy(raw); },
        async write(value) {
            this.writes++; if (this.delay) await this.delay;
            if (this.throwWrite) throw Error('private detail'); if (this.failWrite) return false;
            raw = copy(value); if (this.corruptWrite) raw.enabled = !raw.enabled;
            if (this.failVerify) { this.failVerify = false; this.failRead = true; }
            listeners.forEach(fn => fn());
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        raw() { return copy(raw); }, corrupt(value) { raw = copy(value); }
    };
}
let fixtureId = 0;
function fixture() {
    const b = backend(), prefix = ++fixtureId; let sequence = 0, time = '2026-10-10T20:00:00.000Z';
    const options = { id: () => `identity_${prefix}_${++sequence}`, now: () => time };
    return { b, a: new api.Store(b, options), c: new api.Store(b, options), setTime(value) { time = value; } };
}
const add = (store, body = 'A useful answer', rest = {}) => store.mutate(store.request('add', { title: 'Result', body, ...rest }));
const command = (store, kind, record, rest = {}) => store.request(kind, { id: record.id, version: record.version, ...rest });
const revise = async (store, record, body) => store.mutate(store.request('revise', await store.reviewRevision({ id: record.id, version: record.version, body })));
const replace = async (store, source) => store.mutate(store.request('replace', await store.review(source)));
const promptRef = { promptId: 'prompt_identity', bodyVersionId: 'version_identity' };

test('title and exact plain body alone suffice; Unicode, CRLF, code and hostile markup survive refresh', async () => {
    const { a, c } = fixture(), body = '  中文 👩🏽‍💻\r\n```js\n  <script>alert(1)</script>\n  const x = "😀";\n```  ';
    const saved = (await add(a, body)).records[0];
    assert.equal(saved.body, body); assert.equal(saved.type, 'answer'); assert.equal(saved.sourceUrl, ''); assert.equal(saved.notes, '');
    assert.deepEqual(saved.history, [{ id: saved.currentVersionId, body, createdAt: saved.createdAt }]);
    assert.deepEqual((await c.read()).records[0], saved);
    saved.body = 'not persisted'; saved.tags.push('not persisted');
    assert.equal((await c.read()).records[0].body, body); assert.deepEqual((await c.read()).records[0].tags, []);
    assert.deepEqual(api.sourceMetadata(''), { provided: false, attribution: 'not-provided', href: null, host: null, hostname: null, protocol: null });
});

test('metadata and notes edits preserve original excerpt, version and prompt reference', async () => {
    const { a, b } = fixture(), original = (await add(a, 'Original excerpt', { promptRef })).records[0];
    let record = (await a.mutate(command(a, 'edit', original, { title: 'Renamed', notes: 'Personal interpretation', type: 'code', tags: ['Code'], tool: 'ChatGPT' }))).records[0];
    assert.equal(record.body, original.body); assert.equal(record.currentVersionId, original.currentVersionId); assert.deepEqual(record.history, original.history);
    assert.deepEqual(record.promptRef, promptRef); assert.equal(record.notes, 'Personal interpretation');
    const writes = b.writes; await a.mutate(a.request('edit', api.createDraft(record))); assert.equal(b.writes, writes);
    await assert.rejects(() => a.mutate(command(a, 'edit', record, { body: 'Silently changed' })), { code: 'REVIEW_REQUIRED' });
    assert.equal(b.writes, writes);
});

test('explicit reviewed excerpt changes append immutable versions; unreviewed or altered plans fail', async () => {
    const { a, c, b } = fixture(), original = (await add(a, 'First body')).records[0];
    const plan = await a.reviewRevision({ id: original.id, version: original.version, body: 'Second body' });
    assert.ok(Object.isFrozen(plan)); assert.equal(b.writes, 1); assert.equal(plan.previousVersionId, original.currentVersionId);
    await assert.rejects(() => c.mutate(c.request('revise', plan)), { code: 'REVIEW_REQUIRED' });
    await assert.rejects(() => a.mutate(a.request('revise', { ...plan, body: 'Tampered' })), { code: 'REVIEW_REQUIRED' });
    const record = (await a.mutate(a.request('revise', plan))).records[0];
    assert.deepEqual(record.history.map(entry => entry.body), ['First body', 'Second body']); assert.equal(record.id, original.id);
    assert.deepEqual(api.getVersion(await a.read(), original.id, original.currentVersionId), { recordId: original.id, ...original.history[0] });
    assert.notEqual(record.version, original.version); assert.notEqual(record.currentVersionId, original.currentVersionId);
});

test('restoring an old excerpt is reviewed and appends instead of deleting subsequent history', async () => {
    const { a } = fixture(), original = (await add(a, 'First')).records[0];
    let record = (await revise(a, original, 'Second')).records[0]; const secondId = record.currentVersionId;
    const plan = await a.reviewVersionRestore({ id: record.id, version: record.version, versionId: original.currentVersionId });
    assert.equal(plan.restoredFromVersionId, original.currentVersionId);
    record = (await a.mutate(a.request('revise', plan))).records[0];
    assert.deepEqual(record.history.map(entry => entry.body), ['First', 'Second', 'First']); assert.equal(record.history[1].id, secondId);
    assert.notEqual(record.currentVersionId, original.currentVersionId);
});

test('archive and restore retain stable IDs, notes, prompt links and all versions', async () => {
    const { a, c, setTime } = fixture(), first = (await add(a, 'Original', { notes: 'Private notes', promptRef })).records[0];
    setTime('2026-10-11T20:00:00.000Z'); let record = (await a.mutate(command(a, 'remove', first))).records[0];
    assert.equal(record.deletedAt, '2026-10-11T20:00:00.000Z'); assert.equal(api.search(await c.read()).length, 0);
    assert.equal(api.search(await c.read(), '', { removed: true }).length, 1);
    await assert.rejects(() => a.mutate(command(a, 'edit', record, { title: 'cannot edit trash' })), { code: 'CONFLICT' });
    record = (await c.mutate(command(c, 'restore', record))).records[0];
    assert.equal(record.deletedAt, null); assert.equal(record.id, first.id); assert.deepEqual(record.history, first.history);
    assert.deepEqual(record.promptRef, promptRef); assert.equal(record.notes, 'Private notes'); assert.equal(api.search(await a.read()).length, 1);
});

test('independent tabs merge different records and preserve caller drafts on same-record conflicts', async () => {
    const { a, c } = fixture(); await add(a, 'One'); const [one, two] = (await add(a, 'Two')).records;
    const draft = api.createDraft(one); draft.notes = 'My unsaved notes';
    await Promise.all([a.mutate(command(a, 'edit', one, { notes: 'New notes one' })), c.mutate(command(c, 'edit', two, { notes: 'New notes two' }))]);
    await assert.rejects(() => c.mutate(c.request('edit', draft)), { code: 'CONFLICT' }); assert.equal(draft.notes, 'My unsaved notes');
    assert.deepEqual((await a.read()).records.map(record => record.notes), ['New notes one', 'New notes two']);
});

test('stale body reviews cannot overwrite a more recent metadata or excerpt save', async () => {
    const { a, c } = fixture(), first = (await add(a)).records[0];
    const plan = await a.reviewRevision({ id: first.id, version: first.version, body: 'Pending draft' });
    await c.mutate(command(c, 'edit', first, { notes: 'Another page' }));
    await assert.rejects(() => a.mutate(a.request('revise', plan)), { code: 'CONFLICT' }); assert.equal(plan.body, 'Pending draft');
});

test('request owns frozen values before lock waits; direct commands are copied before awaiting hash', async () => {
    const { a } = fixture(), input = { title: 'Own draft', body: 'Saved', tags: ['One'], promptRef };
    const request = a.request('add', input); input.body = 'Tampered'; input.tags.push('Two');
    assert.ok(Object.isFrozen(request) && Object.isFrozen(request.tags) && Object.isFrozen(request.promptRef));
    assert.equal((await a.mutate(request)).records[0].body, 'Saved');
    const direct = { kind: 'add', operationId: 'direct_operation', title: 'Direct', body: 'Captured' };
    const promise = a.mutate(direct); direct.body = 'Changed after queue';
    assert.equal((await promise).records[1].body, 'Captured');
});

test('same operation retries are idempotent; altered payload or older committed operation conflicts', async () => {
    const { a, c, b } = fixture(), request = a.request('add', { title: 'Original', body: 'Payload' });
    let state = await a.mutate(request); await c.mutate(request); assert.equal(b.writes, 1); assert.equal(state.records.length, 1);
    await assert.rejects(() => c.mutate({ ...request, body: 'Different payload' }), { code: 'CONFLICT' });
    await assert.rejects(() => c.mutate({ ...request, notes: 'Extra data' }), { code: 'CONFLICT' });
    state = await add(a, 'Another'); await assert.rejects(() => c.mutate(request), { code: 'CONFLICT' }); assert.equal(state.records.length, 2);
    const edit = command(a, 'edit', state.records[0], { notes: 'Once' }); await a.mutate(edit); await c.mutate(edit); assert.equal(b.writes, 3);
    await assert.rejects(() => c.mutate({ ...edit, notes: 'Twice' }), { code: 'CONFLICT' });
});

test('uncertain post-write read failure retains draft and same command safely establishes saved state', async () => {
    const { a, b } = fixture(), request = a.request('add', { title: 'Draft', body: 'Do not duplicate' });
    b.failVerify = true; await assert.rejects(() => a.mutate(request), { code: 'READ' }); assert.equal(request.body, 'Do not duplicate');
    b.failRead = false; const state = await a.mutate(request); assert.equal(state.records.length, 1); assert.equal(b.writes, 1);
    const other = fixture(); other.b.corruptWrite = true;
    const corruptRequest = other.a.request('add', { title: 'Title', body: 'Body' });
    await assert.rejects(() => other.a.mutate(corruptRequest), { code: 'VERIFY' });
    await assert.rejects(() => other.a.mutate(corruptRequest), { code: 'CONFLICT' });
});

test('false and thrown writes do not report success or leak backend messages', async () => {
    for (const flag of ['failWrite', 'throwWrite']) {
        const { a, b } = fixture(); b[flag] = true;
        await assert.rejects(() => add(a), error => error.code === 'WRITE' && !error.message.includes('private detail'));
        assert.equal((await a.read()).records.length, 0);
    }
});

test('URLs remain user-provided and parse actual ASCII host without fetching or opening', () => {
    const value = api.sourceMetadata('HTTPS://例え.テスト:8443/conversation?q=one#part');
    assert.equal(value.host, 'xn--r8jz45g.xn--zckzah:8443'); assert.equal(value.attribution, 'user-provided');
    assert.equal(value.href, 'https://xn--r8jz45g.xn--zckzah:8443/conversation?q=one#part');
    assert.equal(api.sourceMetadata('http://localhost:8080/a').host, 'localhost:8080');
    for (const url of ['javascript:alert(1)', 'file:///tmp/private', 'data:text/html,test', '//example.com', 'https://user:pass@example.com',
        'https://user@example.com', 'https://@example.com', 'https://example.com@evil.test', 'https:///evil.test', 'https://example.com\\@evil.test',
        'https://example.com\n/path', ' https://example.com', 'https://exam\u202eple.com']) {
        assert.throws(() => api.sourceMetadata(url), error => ['SOURCE_URL', 'TEXT'].includes(error.code), url);
    }
    assert.throws(() => api.sourceMetadata('https://example.com/' + 'x'.repeat(api.LIMITS.url)), { code: 'TEXT_LIMIT' });
});

test('duplicates are suggestions, canonical same-source/body only; add never silently merges', async () => {
    const { a } = fixture(); let state = await add(a, 'Identical', { sourceUrl: 'https://EXAMPLE.com:443/a', title: 'First' });
    let matches = api.findDuplicates(state, { body: 'Identical', sourceUrl: 'https://example.com/a' });
    assert.equal(matches.length, 1); assert.equal(matches[0].reason, 'same-source-and-body');
    assert.equal(api.findDuplicates(state, { body: 'Identical ', sourceUrl: 'https://example.com/a' }).length, 0);
    assert.equal(api.findDuplicates(state, { body: 'Identical', sourceUrl: 'https://example.com/b' }).length, 0);
    state = await add(a, 'Identical', { sourceUrl: 'https://example.com/a', title: 'Second' }); assert.equal(state.records.length, 2);
    state = await a.mutate(command(a, 'remove', state.records[0]));
    matches = api.findDuplicates(state, { body: 'Identical', sourceUrl: 'https://example.com/a' }); assert.ok(matches[0].deletedAt);
    state = await add(a, 'No source'); assert.equal(api.findDuplicates(state, { body: 'No source', sourceUrl: '' })[0].reason, 'same-body-no-source');
});

test('local AND search covers Chinese/case-insensitive title/body/tags and filters without notes or URLs', async () => {
    const { a } = fixture(); await add(a, '纯本地 SEARCH code', { title: '结果', tags: ['Coding'], type: 'code', notes: 'private notes keyword', sourceUrl: 'https://example.com/urlkeyword' });
    let state = await add(a, 'Other', { type: 'plan' }); const one = state.records[0];
    let results = api.search(state, '本地 search coding'); assert.equal(results.length, 1); assert.deepEqual(results[0].matchedFields, ['body', 'tags']);
    assert.equal(api.search(state, 'keyword').length, 0); assert.equal(api.search(state, 'urlkeyword').length, 0);
    assert.equal(api.search(state, '', { type: 'plan' }).length, 1); assert.equal(api.search(state, '', { ids: [] }).length, 0);
    assert.equal(api.search(state, '', { ids: [one.id] }).length, 1); assert.equal(api.search(state, 'missing').length, 0);
    state = await revise(a, one, 'New replacement'); assert.equal(api.search(state, 'search').length, 0); assert.equal(api.search(state, 'replacement').length, 1);
    results = api.search(state); results[0].record.body = 'Mutated result'; assert.notEqual(api.search(state)[0].record.body, 'Mutated result');
    assert.throws(() => api.search(state, 'x'.repeat(api.LIMITS.query + 1)), { code: 'TEXT_LIMIT' });
});

test('search snippets are bounded plain text, do not split surrogate pairs and are rebuilt from content', async () => {
    const { a } = fixture(), body = '😀'.repeat(100) + '<img src="https://evil.test/tracker"> needle ' + '中'.repeat(300);
    const state = await add(a, body), result = api.search(state, 'needle')[0];
    assert.ok(result.snippet.includes('needle')); assert.ok(Array.from(result.snippet).length <= 182);
    assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(result.snippet));
    assert.deepEqual(api.search(api.validate(copy(state)), 'needle'), api.search(state, 'needle'));
});

test('prompt references remain exact and visibly unresolved, never rebound to current prompt body', async () => {
    const { a } = fixture(), record = (await add(a, 'Linked', { promptRef })).records[0];
    assert.deepEqual(api.resolvePromptReference(record), { status: 'unresolved', reference: promptRef, version: null });
    const original = { recordId: promptRef.promptId, id: promptRef.bodyVersionId, body: 'Immutable prompt body', createdAt: record.createdAt };
    const resolved = api.resolvePromptReference(record, (id, version) => { assert.equal(id, promptRef.promptId); assert.equal(version, promptRef.bodyVersionId); return original; });
    assert.equal(resolved.status, 'resolved'); assert.deepEqual(resolved.version, original);
    assert.throws(() => api.resolvePromptReference(record, () => ({ ...original, id: 'newer_version_id' })), { code: 'PROMPT_REFERENCE' });
    assert.equal(api.resolvePromptReference({ ...record, promptRef: null }).status, 'unlinked');
    const file = await a.export(); const destination = fixture(); const plan = await destination.a.review(file);
    assert.deepEqual(plan.promptReferences, [{ location: 'live', recoveryId: null, recordId: record.id, ...promptRef, status: 'unresolved' }]);
    const imported = (await destination.a.mutate(destination.a.request('replace', plan))).records[0];
    assert.deepEqual(imported.promptRef, promptRef); assert.equal(api.resolvePromptReference(imported).status, 'unresolved');
});

test('export/import roundtrip preserves every excerpt byte, notes, archived records and immutable references', async () => {
    const { a } = fixture(), body = '\tconst résumé = "😀";\r\n  中文\n\n```\n';
    let first = (await add(a, body, { title: '代码', notes: '个人备注\r\n  Two', sourceUrl: 'https://example.com/c?private=1', promptRef })).records[0];
    first = (await revise(a, first, body + '// v2')).records[0]; await a.mutate(command(a, 'remove', first));
    const source = await a.export(), file = api.parseBackup(source); assert.ok(!source.includes('receipts')); assert.ok(!source.includes('enabled'));
    const destination = fixture(); const state = await replace(destination.a, source), restored = state.records[0];
    for (const field of ['id', 'body', 'notes', 'title', 'tags', 'type', 'sourceUrl', 'promptRef', 'history', 'currentVersionId', 'createdAt', 'updatedAt', 'deletedAt'])
        assert.deepEqual(restored[field], file.content.records[0][field], field);
    assert.notEqual(restored.version, first.version); assert.equal(state.recovery.length, 0); assert.equal(restored.history[0].body, body);
});

test('source-redacted export is explicit, covers recovery and leaves local source/body/notes untouched', async () => {
    const { a } = fixture(); await add(a, 'Original', { sourceUrl: 'https://example.com/private', notes: 'Keep exact notes' });
    const other = fixture(); await add(other.a, 'Incoming', { sourceUrl: 'https://elsewhere.test/private' }); await replace(a, await other.a.export());
    const before = await a.read(), file = api.parseBackup(await a.export({ omitSourceUrls: true }));
    assert.equal(file.content.records[0].sourceUrl, ''); assert.equal(file.recovery[0].content.records[0].sourceUrl, '');
    assert.deepEqual(await a.read(), before); assert.equal(file.recovery[0].content.records[0].notes, 'Keep exact notes');
});

test('replacement is reviewed, state-fenced, preflighted and keeps displaced records for recovery', async () => {
    const { a, c, b } = fixture(); const original = (await add(a, 'Current')).records[0]; const incoming = fixture(); await add(incoming.a, 'Incoming');
    const source = await incoming.a.export(), plan = await a.review(source); assert.equal(b.writes, 1); assert.equal(plan.current.active, 1); assert.equal(plan.incoming.active, 1);
    await assert.rejects(() => c.mutate(c.request('replace', plan)), { code: 'REVIEW_REQUIRED' });
    await assert.rejects(() => a.mutate(a.request('replace', { ...plan, source: source + ' ' })), { code: 'REVIEW_REQUIRED' });
    await a.mutate(command(a, 'edit', original, { notes: 'Another edit' }));
    await assert.rejects(() => a.mutate(a.request('replace', plan)), { code: 'CONFLICT' });
    let state = await replace(a, source); assert.equal(state.records[0].body, 'Incoming'); assert.equal(state.recovery[0].content.records[0].body, 'Current');
    const snapshot = state.recovery[0], recover = a.request('recover', { id: snapshot.id, revision: state.revision });
    state = await a.mutate(recover); assert.equal(state.records[0].id, original.id); assert.equal(state.records[0].notes, 'Another edit');
    assert.equal(state.recovery[0].content.records[0].body, 'Incoming'); assert.equal(api.getVersion(state, original.id, original.currentVersionId).body, 'Current');
    assert.deepEqual(await c.mutate(recover), state);
});

test('immutable body-version identities cannot be reused for changed content or other records', async () => {
    const { a } = fixture(); await add(a, 'Original'); const file = api.parseBackup(await a.export());
    const changed = copy(file); changed.content.records[0].body = 'Forgery'; changed.content.records[0].history[0].body = 'Forgery';
    await assert.rejects(() => a.review(JSON.stringify(changed)), { code: 'IDENTITY_CONFLICT' });
    const moved = copy(file); moved.content.records[0].id = 'another_record_identity';
    await assert.rejects(() => a.review(JSON.stringify(moved)), { code: 'IDENTITY_CONFLICT' });
});

test('strict backup parsing rejects future/old formats, missing or extra fields and broken records', async () => {
    const { a } = fixture(); await add(a); const file = api.parseBackup(await a.export());
    for (const change of [value => { value.schemaVersion = 2; }, value => { value.schemaVersion = 0; }, value => { value.unknown = 1; },
        value => { delete value.recovery; }, value => { value.content.records.push(copy(value.content.records[0])); },
        value => { value.content.records[0].history[0].body = 'Mismatch'; }, value => { value.content.records[0].updatedAt = 'not-a-date'; },
        value => { value.content.records[0].sourceUrl = 'javascript:alert(1)'; }, value => { value.content.records[0].promptRef = { promptId: 'only_prompt' }; }]) {
        const changed = copy(file); change(changed); assert.throws(() => api.parseBackup(JSON.stringify(changed)));
    }
    assert.throws(() => api.parseBackup('{broken')); assert.throws(() => api.parseBackup('x'.repeat(api.LIMITS.bytes + 1)), { code: 'SIZE_LIMIT' });
    assert.equal((await a.read()).records.length, 1);
});

test('hostile getters, inherited data, toJSON, symbols, sparse arrays and cycles reject without evaluation', async () => {
    const { a, b } = fixture(); let executed = 0;
    const ownGetter = {}; Object.defineProperty(ownGetter, 'title', { enumerable: true, get() { executed++; return 'Getter'; } });
    const inherited = Object.create({ title: 'Inherited' }); inherited.body = 'Body';
    const toJSON = { title: 'Title', body: 'Body', toJSON() { executed++; return { title: 'JSON', body: 'Body' }; } };
    const arrayGetter = []; Object.defineProperty(arrayGetter, '0', { enumerable: true, get() { executed++; return 'tag'; } });
    const hidden = { title: 'Title', body: 'Body' }; Object.defineProperty(hidden, 'hidden', { get() { executed++; } });
    const symbol = { title: 'Title', body: 'Body', [Symbol('hidden')]: 1 }, cycle = {}; cycle.self = cycle;
    for (const value of [ownGetter, inherited, toJSON, hidden, symbol, cycle, { title: 'Title', body: 'Body', tags: arrayGetter },
        { title: 'Title', body: 'Body', tags: new Array(2) }, JSON.parse('{"__proto__":{"polluted":true}}'), new Date()]) {
        assert.throws(() => a.request('add', value));
    }
    await assert.rejects(() => a.mutate(Object.defineProperty({}, 'operationId', { enumerable: true, get() { executed++; return 'operation_id'; } })));
    assert.equal(executed, 0); assert.equal(b.writes, 0); assert.equal({}.polluted, undefined);
    const rawGetter = Object.defineProperty(api.initial(), 'records', { enumerable: true, get() { executed++; return []; } });
    const rawStore = new api.Store({ ...b, read: async () => rawGetter }); await assert.rejects(() => rawStore.read()); assert.equal(executed, 0);
});

test('input depth, node/string budgets and strict textual limits fail before writing or truncating', async () => {
    const { a, b } = fixture(); let deep = {}; for (let i = 0; i < 20; i++) deep = { child: deep };
    assert.throws(() => a.request('add', deep), { code: 'INPUT_LIMIT' });
    assert.throws(() => a.request('add', { title: 'Title', body: 'x'.repeat(api.LIMITS.bytes + 65537) }), { code: 'INPUT_LIMIT' });
    for (const fields of [{ title: ' ' }, { body: '' }, { body: '\ud800' }, { body: 'a\u0000b' }, { title: 'x'.repeat(201) },
        { body: 'x'.repeat(32001) }, { notes: 'x'.repeat(16001) }, { tags: ['Same', 'same'] }, { tags: Array.from({ length: 21 }, (_, i) => String(i)) },
        { type: 'unknown' }, { tool: 'x'.repeat(201) }]) {
        await assert.rejects(() => add(a, 'Valid body', fields));
    }
    assert.equal(b.writes, 0); assert.equal((await a.read()).records.length, 0);
});

test('record/history/recovery capacity rejects explicitly without evicting original content', async () => {
    const { a, b } = fixture(); let record = (await add(a, 'Version 1')).records[0];
    for (let i = 2; i <= api.LIMITS.versions; i++) record = (await revise(a, record, `Version ${i}`)).records[0];
    const before = await a.read(), writes = b.writes;
    await assert.rejects(() => a.reviewRevision({ id: record.id, version: record.version, body: 'Overflow' }), { code: 'HISTORY_LIMIT' });
    assert.deepEqual(await a.read(), before); assert.equal(b.writes, writes);
    record = (await a.mutate(command(a, 'edit', record, { notes: 'Metadata still editable' }))).records[0]; assert.equal(record.history.length, 20);
    const seed = copy(before.records[0]), full = api.initial();
    full.records = Array.from({ length: api.LIMITS.records }, (_, index) => {
        const item = copy(seed); item.id = `record_${index}_identity`; item.history = [{ ...item.history[0], id: `body_${index}_identity` }];
        item.body = item.history[0].body; item.currentVersionId = item.history[0].id; return item;
    });
    b.corrupt(full); await assert.rejects(() => add(a, 'Overflow'), { code: 'CAPACITY' }); assert.equal((await a.read()).records.length, api.LIMITS.records);
    const limited = fixture(), incoming = fixture(); await add(incoming.a, 'Incoming'); await add(limited.a, 'Initial');
    const source = await incoming.a.export(); for (let i = 0; i < api.LIMITS.recovery; i++) await replace(limited.a, source);
    const saved = await limited.a.read(); await assert.rejects(() => limited.a.review(source), { code: 'RECOVERY_LIMIT' }); assert.deepEqual(await limited.a.read(), saved);
});

test('serialized storage budget preflights before any reviewed destructive replacement', async () => {
    const { a, b } = fixture(); let record = (await add(a, 'x'.repeat(32000))).records[0];
    for (let i = 1; i < 20; i++) record = (await revise(a, record, `${i}` + 'x'.repeat(31990))).records[0];
    const source = await a.export(); await replace(a, source); await replace(a, source); const saved = await a.read(), writes = b.writes;
    await assert.rejects(() => a.review(source), error => ['SIZE_LIMIT', 'INPUT_LIMIT'].includes(error.code));
    assert.deepEqual(await a.read(), saved); assert.equal(b.writes, writes); assert.equal(saved.records[0].history.length, 20);
});

test('clock rollback keeps record/history times monotonic and corrupt storage fails closed', async () => {
    const { a, b, setTime } = fixture(), record = (await add(a)).records[0]; setTime('2020-01-01T00:00:00.000Z');
    const newer = (await revise(a, record, 'Changed')).records[0]; assert.equal(newer.updatedAt, record.updatedAt); assert.equal(newer.history[1].createdAt, record.updatedAt);
    const writes = b.writes; b.corrupt({ ...api.initial(), schemaVersion: 999 });
    await assert.rejects(() => a.read(), { code: 'VERSION' }); await assert.rejects(() => add(a), { code: 'VERSION' }); assert.equal(b.writes, writes);
});

test('Chrome-shaped backend uses only local key/shared Web Lock and observes matching local changes', async () => {
    const calls = [], handlers = new Set(); let value;
    const chrome = { storage: { local: {
        async get(keys) { calls.push(['get', keys]); return value === undefined ? {} : { [api.KEY]: copy(value) }; },
        async set(values) { calls.push(['set', Object.keys(values)]); value = copy(values[api.KEY]); }
    }, onChanged: { addListener(fn) { handlers.add(fn); }, removeListener(fn) { handlers.delete(fn); } } } };
    const locks = { request(name, options, action) { calls.push(['lock', name, options.mode]); return action(); } };
    const a = new api.Store(api.createChromeBackend(chrome, locks)); await add(a);
    assert.deepEqual(calls[0], ['lock', api.LOCK, 'exclusive']); assert.ok(calls.filter(call => call[0] === 'get').every(call => [api.KEY, '__localItabCombinedRestoreV1'].includes(call[1][0])));
    assert.deepEqual(calls.find(call => call[0] === 'set')[1], [api.KEY]);
    let changes = 0; const unsubscribe = a.subscribe(() => changes++);
    for (const handler of handlers) { handler({ other: {} }, 'local'); handler({ [api.KEY]: {} }, 'sync'); handler({ [api.KEY]: {} }, 'local'); }
    assert.equal(changes, 1); unsubscribe(); assert.equal(handlers.size, 0);
    assert.throws(() => api.createChromeBackend(chrome, null), { code: 'UNAVAILABLE' });
});

test('browser entry loads without network/page/HTML/clipboard capabilities and exports correct namespace', () => {
    const source = fs.readFileSync(require.resolve('../shared/local-ai-collections-store.js'), 'utf8'), context = { TextEncoder, URL };
    vm.createContext(context); vm.runInContext(source, context); assert.ok(context.LocalItabAICollections.Store);
    assert.equal(context.LocalItabAICollections.initial().records.length, 0);
    assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|eval)\s*\(|innerHTML\s*=|window\.open\s*\(|navigator\.clipboard/.test(source));
});


test('JSON duplicate keys including escaped spellings are rejected instead of silently overwritten', async () => {
    const { a } = fixture(); await add(a); const source = await a.export();
    assert.throws(() => api.parseBackup(source.replace('"schemaVersion":1', '"schemaVersion":0,"schemaVersion":1')), { code: 'DUPLICATE_KEY' });
    assert.throws(() => api.parseBackup(source.replace('"title":"Result"', '"title":"Lost","ti\\u0074le":"Result"')), { code: 'DUPLICATE_KEY' });
    assert.equal(api.parseBackup(source).content.records[0].title, 'Result');
});


test('source URLs reject every Unicode Bidi_Control code point, including directional marks', () => {
    for (const codePoint of [0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]) {
        assert.throws(() => api.sourceMetadata(`https://example.com/${String.fromCodePoint(codePoint)}file`), { code: 'SOURCE_URL' });
    }
});

test('synchronous and asynchronous backend lock failures are bounded across all lock-taking operations', async () => {
    const source = await fixture().a.export();
    for (const lock of [() => { throw Error('secret backend detail'); }, async () => { throw Error('secret backend detail'); }]) {
        const { a } = fixture(); a.backend.lock = lock;
        const request = a.request('add', { title: 'Title', body: 'Body' });
        for (const action of [() => a.read(), () => a.mutate(request), () => a.export(), () => a.review(source),
            () => a.reviewRevision({ id: 'record_identity', version: 'version_identity', body: 'Body' }),
            () => a.reviewVersionRestore({ id: 'record_identity', version: 'version_identity', versionId: 'body_identity' })]) {
            await assert.rejects(action, error => error.code === 'LOCK' && error.message === 'Local AI collections: LOCK');
        }
    }
    const { a } = fixture();
    a.backend.lock = () => { throw api.fault('RESTORE_PENDING'); };
    await assert.rejects(() => a.read(), { code: 'RESTORE_PENDING' });
});


test('unexpected post-callback lock failure remains uncertain and exact retry does not duplicate a committed save', async () => {
    const { a, b } = fixture(), originalLock = b.lock.bind(b); let rejectAfter = true, getterCalls = 0;
    const hostile = Object.defineProperty({}, 'code', { get() { getterCalls++; return 'CONFLICT'; } });
    b.lock = action => originalLock(async () => { const result = await action(); if (rejectAfter) throw hostile; return result; });
    const request = a.request('add', { title: 'Title', body: 'Body' });
    await assert.rejects(() => a.mutate(request), { code: 'VERIFY' }); assert.equal(b.writes, 1); assert.equal(getterCalls, 0);
    rejectAfter = false; const state = await a.mutate(request); assert.equal(state.records.length, 1); assert.equal(b.writes, 1);
    b.lock = () => { throw hostile; }; await assert.rejects(() => a.read(), { code: 'LOCK' }); assert.equal(getterCalls, 0);
});

test('snapshot near-capacity refusal is atomic and never truncates the selected input', async () => {
    const { a, b } = fixture(); await add(a, 'x'.repeat(32000));
    const state = await a.read(), base = state.records[0];
    state.records = Array.from({ length: 31 }, (_, i) => ({ ...copy(base), id: `synthetic_record_${i}`, version: `synthetic_version_${i}`,
        currentVersionId: `synthetic_body_${i}`, history: [{ ...base.history[0], id: `synthetic_body_${i}` }] }));
    state.receipts = [];
    const size = () => new TextEncoder().encode(JSON.stringify(state)).length;
    const target = api.LIMITS.bytes - 16384 - 2000;
    for (const record of state.records) { const extra = Math.min(16000, target - size()); if (extra > 0) record.notes = 'x'.repeat(extra); }
    api.validate(state); b.corrupt(state); const writes = b.writes;
    const packed = require('../shared/ai-context').pack('Question', [{ id: 'synthetic', label: 'Synthetic', text: 'x'.repeat(4000) }]);
    const contextSnapshot = { schemaVersion: 1, question: packed.question, sources: packed.sources, prompt: packed.prompt, endpoint: 'https://model.example/v1/chat/completions', model: 'mock' };
    await assert.rejects(add(a, 'answer', { contextSnapshot }), { code: 'SIZE_LIMIT' });
    assert.equal(b.writes, writes); assert.deepEqual(await a.read(), state);
    await add(a, 'answer'); assert.equal(b.writes, writes + 1);
});

test('historical operation inspection confirms exact command read-only without weakening latest CAS', async () => {
    const { a, c, b } = fixture();
    const first = a.request('add', { title: 'Synthetic A', body: 'Synthetic answer A' });
    b.failVerify = true; await assert.rejects(() => a.mutate(first), { code: 'READ' }); b.failRead = false;
    await add(c, 'Synthetic B'); const writes = b.writes;
    await assert.rejects(() => a.mutate(first), { code: 'CONFLICT' });
    assert.equal((await a.inspectOperation(first)).committed, true);
    assert.equal((await a.inspectOperation({ ...first, body: 'Different answer' })).committed, false);
    assert.equal(b.writes, writes); assert.equal((await a.read()).records.length, 2);
    const state = b.raw(); state.enabled = !state.enabled; b.corrupt(state);
    assert.equal((await a.inspectOperation(first)).committed, false);
});
test('bounded receipts accept legacy schema, reject duplicate evidence and expire without guessing', async () => {
    const { a, b } = fixture();
    const first = a.request('add', { title: 'Synthetic', body: 'Synthetic answer' });
    await a.mutate(first); assert.equal(api.validate(b.raw()).receipts.length, 1);
    for (let i = 0; i < api.LIMITS.receipts; i++) {
        const state = await a.read(); await a.mutate(a.request('enable', { revision: state.revision, enabled: !state.enabled }));
    }
    assert.equal(b.raw().receipts.length, api.LIMITS.receipts);
    assert.equal((await a.inspectOperation(first)).committed, false);
    const duplicate = b.raw(); duplicate.receipts[1] = duplicate.receipts[0]; assert.throws(() => api.validate(duplicate));
    const exported = JSON.parse(await a.export()); assert.equal(Object.hasOwn(exported, 'receipts'), false);
});
test('replacement and recovery invalidate historical acknowledgements even for unchanged content', async () => {
    const { a, b } = fixture();
    const first = a.request('add', { title: 'Synthetic', body: 'Same content' }); await a.mutate(first);
    const backup = await a.export(); await replace(a, backup);
    assert.equal((await a.inspectOperation(first)).committed, false); assert.equal(b.raw().receipts.length, 1);
    const second = a.request('add', { title: 'Synthetic B', body: 'New content' }); await a.mutate(second);
    let state = await a.read(); await a.mutate(a.request('recover', { id: state.recovery[0].id, revision: state.revision }));
    assert.equal((await a.inspectOperation(second)).committed, false); assert.equal(b.raw().receipts.length, 1);
});
