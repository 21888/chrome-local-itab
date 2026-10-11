const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../shared/local-prompts-store.js');
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
    const b = backend(), prefix = ++fixtureId; let sequence = 0, time = '2026-10-10T19:00:00.000Z';
    const options = { id: () => `identity_${prefix}_${++sequence}`, now: () => time };
    return { b, a: new api.Store(b, options), c: new api.Store(b, options), setTime(value) { time = value; } };
}
const add = (store, body = 'Write about {{topic}}', rest = {}) => store.mutate(store.request('add', { title: 'Prompt', body, ...rest }));
const command = (store, kind, record, rest = {}) => store.request(kind, { id: record.id, version: record.version, ...rest });
const replace = async (store, source) => store.mutate(store.request('replace', await store.review(source)));

test('creates plain text with stable IDs, refreshes offline, and never mutates returned records', async () => {
    const { a, c } = fixture(), body = '  中文 👩🏽‍💻\r\n```js\n  <script>alert(1)</script>\n```  ';
    let state = await add(a, body, { tags: ['中文', 'Code'], category: 'Writing', tool: 'Manually chosen' });
    const first = copy(state.records[0]);
    assert.equal(first.body, body); assert.equal(first.type, 'prompt'); assert.equal(first.revision, 1);
    assert.deepEqual(first.history, [{ id: first.currentVersionId, body, createdAt: first.createdAt }]);
    state.records[0].body = 'tampered'; state.records[0].tags.push('mutated');
    assert.deepEqual((await c.read()).records[0], first);
    state = await add(a, body); assert.notEqual(first.id, state.records[1].id);
    assert.equal(state.records[0].id, first.id);
});

test('explicit body saves record history, metadata and no-op saves do not', async () => {
    const { a, b, setTime } = fixture(); const original = (await add(a, 'First body')).records[0];
    setTime('2026-10-10T19:00:01.000Z');
    let state = await a.mutate(command(a, 'edit', original, { title: 'Renamed', favorite: true, category: 'Code', tags: ['A'] }));
    let record = state.records[0]; assert.equal(record.history.length, 1); assert.equal(record.currentVersionId, original.currentVersionId);
    assert.notEqual(record.version, original.version); assert.equal(record.revision, 2);
    const writes = b.writes; state = await a.mutate(command(a, 'edit', record, api.createDraft(record)));
    assert.equal(b.writes, writes); assert.equal(state.revision, 2);
    setTime('2026-10-10T19:00:02.000Z'); state = await a.mutate(command(a, 'edit', record, { body: 'Second body' }));
    record = state.records[0]; assert.equal(record.history.length, 2); assert.equal(record.id, original.id);
    assert.equal(record.createdAt, original.createdAt); assert.notEqual(record.currentVersionId, original.currentVersionId);
    assert.equal(record.history[1].createdAt, record.updatedAt);
    assert.deepEqual(api.getVersion(state, original.id, original.currentVersionId), { recordId: original.id, ...original.history[0] });
});

test('restoring an old body appends a version and keeps later history and metadata', async () => {
    const { a } = fixture(); const first = (await add(a, 'Version one', { favorite: true })).records[0];
    let record = (await a.mutate(command(a, 'edit', first, { body: 'Version two', title: 'Latest title' }))).records[0];
    const secondId = record.currentVersionId;
    record = (await a.mutate(command(a, 'restoreVersion', record, { versionId: first.currentVersionId }))).records[0];
    assert.deepEqual(record.history.map(item => item.body), ['Version one', 'Version two', 'Version one']);
    assert.equal(record.history[1].id, secondId); assert.notEqual(record.currentVersionId, first.currentVersionId);
    assert.equal(record.title, 'Latest title'); assert.equal(record.favorite, true);
});

test('archive and recovery retain identity, versions, and creation date without auto-purge', async () => {
    const { a, c, setTime } = fixture(); const first = (await add(a)).records[0];
    setTime('2026-10-11T19:00:00.000Z'); let record = (await a.mutate(command(a, 'remove', first))).records[0];
    assert.equal(record.deletedAt, '2026-10-11T19:00:00.000Z');
    assert.deepEqual(record.history, first.history); assert.equal(api.search(await c.read()).length, 0);
    assert.equal(api.search(await c.read(), '', { removed: true }).length, 1);
    await assert.rejects(() => a.mutate(command(a, 'edit', record, { body: 'cannot edit trash' })), { code: 'CONFLICT' });
    record = (await c.mutate(command(c, 'restore', record))).records[0];
    assert.equal(record.deletedAt, null); assert.equal(record.id, first.id); assert.equal(record.createdAt, first.createdAt);
    assert.deepEqual(record.history, first.history); assert.equal(api.search(await a.read()).length, 1);
});

test('independent tabs merge unrelated changes but retain same-record drafts on conflict', async () => {
    const { a, c } = fixture(); await add(a, 'One'); const state = await add(a, 'Two'); const [one, two] = state.records;
    const draft = api.createDraft(one); draft.body = 'My unsaved draft';
    await Promise.all([a.mutate(command(a, 'edit', one, { body: 'One newer' })), c.mutate(command(c, 'edit', two, { body: 'Two newer' }))]);
    await assert.rejects(() => c.mutate(c.request('edit', draft)), { code: 'CONFLICT' });
    assert.equal(draft.body, 'My unsaved draft'); assert.deepEqual((await a.read()).records.map(item => item.body), ['One newer', 'Two newer']);
    await assert.rejects(() => a.mutate(command(a, 'remove', one)), { code: 'CONFLICT' });
});

test('queued commands own draft values and returned previews are independent', async () => {
    const { a, b } = fixture(); const draft = api.createDraft(); draft.title = 'Draft'; draft.body = 'Hi {{name}}'; draft.tags.push('Tag');
    const request = a.request('add', draft); draft.body = 'changed'; draft.tags.push('Other');
    assert.ok(Object.isFrozen(request) && Object.isFrozen(request.tags));
    const state = await a.mutate(request); assert.equal(state.records[0].body, 'Hi {{name}}'); assert.deepEqual(state.records[0].tags, ['Tag']);
    const saved = b.raw(), preview = api.previewTemplate(state.records[0].body, { name: 'TEMPORARY_PRIVATE_VALUE' });
    assert.equal(preview.text, 'Hi TEMPORARY_PRIVATE_VALUE'); assert.deepEqual(b.raw(), saved);
    assert.ok(!(await a.export()).includes('TEMPORARY_PRIVATE_VALUE'));
});

test('variables replace repeated names once, preserve literal text, and distinguish empty from absent', () => {
    const body = '{{主题}} / {{ 主题 }} / {{recipient}}';
    assert.deepEqual(api.previewTemplate(body, { '主题': '机器学习' }), {
        text: '机器学习 / 机器学习 / {{recipient}}', variables: ['主题', 'recipient'], missing: ['recipient'], complete: false
    });
    assert.throws(() => api.renderTemplate(body, { '主题': '机器学习' }), { code: 'MISSING_VALUES' });
    assert.equal(api.renderTemplate(body, { '主题': '机器学习', recipient: '' }), '机器学习 / 机器学习 / ');
    assert.equal(api.renderTemplate('{{name}}', { name: '{{other}} $& \\n<script>x</script>' }), '{{other}} $& \\n<script>x</script>');
    assert.equal(api.renderTemplate('Literal \\{{name}} and {{name}}', { name: 'value' }), 'Literal {{name}} and value');
    assert.equal(api.renderTemplate('{{name}}', {}, { literal: true }), '{{name}}');
    assert.throws(() => api.previewTemplate('{{name}}', { misspelled: 'A' }), { code: 'VARIABLE' });
    assert.throws(() => api.previewTemplate('{{name}}', { name: null }), { code: 'TEXT' });
});

test('expressions, nested braces and unsafe-looking content remain text and never execute', () => {
    const body = '{{process.exit()}} {{a.b}} {{x + 1}} {{{name}}} {{outer {{inner}}}} {{outer {{inner}} trailing}} {{a\nb}}';
    assert.equal(api.renderTemplate(body), body);
    assert.equal(api.renderTemplate('unmatched {{outer {{inner}}'), 'unmatched {{outer {{inner}}');
    assert.equal(api.renderTemplate('nested {{outer {{inner}} trailing}} then {{name}}', { name: 'OK' }), 'nested {{outer {{inner}} trailing}} then OK');
    assert.equal(api.renderTemplate('{{constructor}} {{__proto__}}', JSON.parse('{"constructor":"literal","__proto__":"also literal"}')), 'literal also literal');
    assert.equal(api.renderTemplate('\\{{constructor}}'), '{{constructor}}');
});

test('variable counts, expanded text size and invalid Unicode fail without truncation', () => {
    assert.throws(() => api.previewTemplate(Array.from({ length: api.LIMITS.variables + 1 }, (_, i) => `{{v${i}}}`).join(' ')), { code: 'VARIABLE_LIMIT' });
    assert.throws(() => api.previewTemplate('{{x}}'.repeat(10), { x: 'a'.repeat(api.LIMITS.value) }), { code: 'PREVIEW_LIMIT' });
    assert.throws(() => api.previewTemplate('{{x}}', { x: '\ud800' }), { code: 'TEXT' });
    assert.throws(() => api.previewTemplate('{{x}}', { x: 'a'.repeat(api.LIMITS.value + 1) }), { code: 'TEXT_LIMIT' });
});

test('search is local, case-insensitive, Chinese-aware, filtered and rebuilt after edits/removal', async () => {
    const { a } = fixture(); let record = (await add(a, 'Research 中国城市\nNext line', { title: 'PLAN', tags: ['资料'], category: 'Work', favorite: true })).records[0];
    await add(a, 'Another item', { title: 'Other', category: 'Home' }); let state = await a.read();
    for (const query of ['plan', 'RESEARCH', '中国', '资料', 'work', 'Plan 城市']) assert.equal(api.search(state, query).length, 1);
    const hit = api.search(state, '中国')[0]; assert.deepEqual(hit.matchedFields, ['body']); assert.ok(hit.snippet.includes('中国'));
    assert.equal(api.search(state, '', { favorite: true }).length, 1);
    assert.equal(api.search(state, '', { category: 'Home' }).length, 1);
    assert.equal(api.search(state, '', { ids: [record.id] }).length, 1); assert.equal(api.search(state, '', { ids: [] }).length, 0);
    record = (await a.mutate(command(a, 'edit', record, { body: 'New keyword', tags: [] }))).records[0]; state = await a.read();
    assert.equal(api.search(state, '中国').length, 0); assert.equal(api.search(state, 'keyword').length, 1);
    record = (await a.mutate(command(a, 'remove', record))).records[0]; state = await a.read();
    assert.equal(api.search(state, 'keyword').length, 0); assert.equal(api.search(state, 'keyword', { removed: true }).length, 1);
    await a.mutate(command(a, 'restore', record)); assert.equal(api.search(await a.read(), 'keyword').length, 1);
    hit.record.title = 'Not saved'; assert.equal((await a.read()).records[0].title, 'PLAN');
});

test('required fields, strict boundaries and Unicode preserve original valid text', async () => {
    const { a, b } = fixture();
    const cases = [{ title: '' }, { title: '  ' }, { body: '' }, { body: ' \n ' }, { title: 'A\nB' }, { body: 'A\0B' },
        { body: '\ud800' }, { body: '\udc00' }, { title: 'a'.repeat(api.LIMITS.title + 1) },
        { body: '中'.repeat(api.LIMITS.body + 1) }, { tags: ['x', 'X'] }, { tags: Array(21).fill('tag') }, { favorite: 1 }, { unknown: 'field' }];
    for (const rest of cases) await assert.rejects(() => add(a, rest.body ?? 'valid', rest));
    assert.equal(b.writes, 0);
    const body = '中'.repeat(api.LIMITS.body), title = '😀'.repeat(api.LIMITS.title);
    const record = (await add(a, body, { title })).records[0]; assert.equal(record.title, title); assert.equal(record.body, body);
});

test('history capacity blocks body changes but allows metadata and never evicts old versions', async () => {
    const { a, b } = fixture(); let record = (await add(a, 'body 0')).records[0];
    for (let i = 1; i < api.LIMITS.versions; i++) record = (await a.mutate(command(a, 'edit', record, { body: `body ${i}` }))).records[0];
    const before = b.raw(), draft = api.createDraft(record); draft.body = 'keep this draft';
    await assert.rejects(() => a.mutate(a.request('edit', draft)), { code: 'HISTORY_LIMIT' }); assert.deepEqual(b.raw(), before);
    await assert.rejects(() => a.mutate(command(a, 'restoreVersion', record, { versionId: record.history[0].id })), { code: 'HISTORY_LIMIT' });
    record = (await a.mutate(command(a, 'edit', record, { favorite: true }))).records[0];
    assert.equal(record.history.length, api.LIMITS.versions); assert.equal(record.history[0].body, 'body 0'); assert.equal(draft.body, 'keep this draft');
});

test('record and total byte limits count archived content and block without dropping data', async () => {
    const { a, b } = fixture(); let record = (await add(a, 'one')).records[0];
    const state = b.raw(); state.records = Array.from({ length: api.LIMITS.records }, (_, i) => ({ ...copy(record),
        id: `prompt_${i}_identity`, version: `fence_${i}_identity`, currentVersionId: `body_${i}_identity`,
        history: [{ ...record.history[0], id: `body_${i}_identity` }] })); b.corrupt(state);
    record = (await a.mutate(command(a, 'remove', state.records[0]))).records[0]; const full = b.raw();
    await assert.rejects(() => add(a), { code: 'CAPACITY' }); assert.deepEqual(b.raw(), full);
    const large = fixture(); let inserted = 0;
    for (;;) {
        const before = large.b.raw();
        try { await add(large.a, '中'.repeat(api.LIMITS.body)); inserted++; }
        catch (error) { assert.equal(error.code, 'SIZE_LIMIT'); assert.deepEqual(large.b.raw(), before); break; }
        assert.ok(inserted < api.LIMITS.records);
    }
    assert.ok(inserted >= 1); assert.equal((await large.a.read()).records.length, inserted);
});

test('write/read/verification failures never claim success or leak private backend details', async () => {
    const { a, b } = fixture(); await add(a, 'saved'); const before = b.raw(), request = a.request('add', { title: 'Draft', body: 'PRIVATE_DRAFT' });
    for (const [flag, code] of [['failRead', 'READ'], ['failWrite', 'WRITE'], ['throwWrite', 'WRITE']]) {
        b[flag] = true; await assert.rejects(() => a.mutate(request), error => error.code === code && error.message === `Local prompts: ${code}`);
        b[flag] = false; assert.deepEqual(b.raw(), before);
    }
    b.failVerify = true; await assert.rejects(() => a.mutate(request), { code: 'READ' }); b.failRead = false;
    const writes = b.writes; assert.equal((await a.mutate(request)).records.length, 2); assert.equal(b.writes, writes);
    b.corruptWrite = true; await assert.rejects(() => add(a, 'uncertain'), { code: 'VERIFY' });
});

test('acknowledged retry after any later mutation fails closed and preserves newer state', async () => {
    const { a, c, b } = fixture(); const original = (await add(a, 'original')).records[0];
    const request = command(a, 'edit', original, { body: 'uncertain result' });
    b.failVerify = true; await assert.rejects(() => a.mutate(request), { code: 'READ' }); b.failRead = false;
    await add(c, 'unrelated newer record'); const before = b.raw();
    await assert.rejects(() => a.mutate(request), { code: 'CONFLICT' }); assert.deepEqual(b.raw(), before);
});

test('malformed storage and unknown versions fail closed without initialization writes', async () => {
    const { a, b } = fixture();
    for (const corrupt of [{}, { ...api.initial(), schemaVersion: 2 }, { ...api.initial(), extra: 'data' }]) {
        b.corrupt(corrupt); await assert.rejects(() => a.read()); await assert.rejects(() => add(a)); assert.deepEqual(b.raw(), corrupt);
    }
    assert.equal(b.writes, 0);
});

test('full export roundtrip requires issued reviewed plan and invalidates old editor fences', async () => {
    const { a, b } = fixture(); const original = (await add(a, 'Original', { tags: ['原文'], favorite: true })).records[0]; const file = await a.export();
    await a.mutate(command(a, 'edit', original, { body: 'Later version' })); const later = (await a.read()).records[0];
    const before = b.raw(), plan = await a.review(file); assert.deepEqual(b.raw(), before);
    assert.equal(plan.incoming.active, 1); assert.equal(plan.current.versions, 2); assert.equal(plan.conflicts.length, 1);
    await assert.rejects(() => a.mutate(a.request('replace', { source: file, revision: before.revision })), { code: 'INVALID' });
    await assert.rejects(() => a.mutate(a.request('replace', { ...plan, reviewId: 'forged_plan_id' })), { code: 'REVIEW_REQUIRED' });
    await assert.rejects(() => a.mutate(a.request('replace', { ...plan, source: file + ' ' })), { code: 'REVIEW_REQUIRED' });
    const state = await a.mutate(a.request('replace', plan)); assert.equal(state.records[0].body, original.body);
    assert.equal(state.records[0].id, original.id); assert.equal(state.records[0].currentVersionId, original.currentVersionId);
    assert.ok(state.records[0].revision > later.revision, 'record revision must not go backwards on older imports');
    assert.equal(state.recovery.length, 1); assert.equal(state.recovery[0].content.records[0].body, later.body);
    assert.equal(api.getVersion(state, later.id, later.currentVersionId).body, later.body);
    await assert.rejects(() => a.mutate(command(a, 'edit', original, { body: 'stale' })), { code: 'CONFLICT' });
    const destination = fixture(); const migrated = await replace(destination.a, await a.export());
    assert.deepEqual(api.content(migrated).records.map(({ version, revision, ...rest }) => rest), api.content(state).records.map(({ version, revision, ...rest }) => rest));
    assert.deepEqual(migrated.recovery, state.recovery);
});

test('review is revision fenced and both failed imports and cancellation leave data intact', async () => {
    const { a, c, b } = fixture(); await add(a); const source = await a.export(), plan = await a.review(source);
    const before = b.raw(); b.failWrite = true;
    await assert.rejects(() => a.mutate(a.request('replace', plan)), { code: 'WRITE' }); b.failWrite = false; assert.deepEqual(b.raw(), before);
    await add(c, 'newer'); const newer = b.raw();
    await assert.rejects(() => a.mutate(a.request('replace', plan)), { code: 'CONFLICT' }); assert.deepEqual(b.raw(), newer);
});

test('recovery swaps preserve displaced state and full history refuses rather than evicts', async () => {
    const { a, b } = fixture(); await add(a, 'original'); const source = await a.export();
    for (let i = 0; i < api.LIMITS.recovery; i++) await replace(a, source);
    const before = b.raw(); await assert.rejects(() => a.review(source), { code: 'RECOVERY_LIMIT' }); assert.deepEqual(b.raw(), before);
    const state = await a.mutate(a.request('recover', { id: before.recovery[0].id, revision: before.revision }));
    assert.equal(state.recovery.length, api.LIMITS.recovery); assert.equal(state.records[0].body, 'original');
    const destination = fixture(); const migrated = await replace(destination.a, await a.export());
    assert.equal(migrated.recovery.length, api.LIMITS.recovery, 'full archive enters empty destination without an empty recovery snapshot');
});

test('backup import rejects unsupported versions, extra/missing keys, duplicates and invalid content', async () => {
    const { a, b } = fixture(); await add(a); const valid = JSON.parse(await a.export()), before = b.raw();
    const changes = [file => { file.schemaVersion = 2; }, file => { file.format = 'different-format'; }, file => { file.extra = 1; },
        file => { delete file.content.records[0].title; }, file => { file.content.records[0].unexpected = 'x'; },
        file => { file.content.records.push(copy(file.content.records[0])); }, file => { file.content.records[0].history[0].body = 'different'; },
        file => { file.content.records[0].createdAt = '2026-02-30T00:00:00.000Z'; }, file => { file.content.records[0].revision = Number.MAX_SAFE_INTEGER + 1; },
        file => { file.content.records[0].tags = ['a', 'A']; }, file => { file.content.records[0].history[0].extra = 'x'; }];
    for (const change of changes) { const file = copy(valid); change(file); await assert.rejects(() => a.review(JSON.stringify(file))); }
    await assert.rejects(() => a.review('{')); assert.deepEqual(b.raw(), before);
});

test('body-version identities cannot be rewritten through import or assigned to another prompt', async () => {
    const { a, b } = fixture(); await add(a, 'immutable version'); const source = JSON.parse(await a.export()), before = b.raw();
    source.content.records[0].body = 'forged rewrite'; source.content.records[0].history[0].body = 'forged rewrite';
    await assert.rejects(() => a.review(JSON.stringify(source)), { code: 'IDENTITY_CONFLICT' });
    source.content.records[0].id = 'other_prompt_identity';
    await assert.rejects(() => a.review(JSON.stringify(source)), { code: 'IDENTITY_CONFLICT' }); assert.deepEqual(b.raw(), before);
});

test('Chrome object-key reordering is accepted but changed values fail verification', async () => {
    const { a, b } = fixture(); const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object' ?
        Object.fromEntries(Object.keys(value).sort().map(key => [key, reorder(value[key])])) : value;
    const write = b.write.bind(b); b.write = value => write(reorder(value));
    await add(a); await replace(a, await a.export()); const file = reorder(JSON.parse(await a.export()));
    const state = await replace(a, JSON.stringify(file)); assert.equal(state.recovery.length, 2);
});

test('clock regressions preserve monotonic record/version timestamps', async () => {
    const { a, setTime } = fixture(); const first = (await add(a, 'old')).records[0]; setTime('2025-01-01T00:00:00.000Z');
    const record = (await a.mutate(command(a, 'edit', first, { body: 'new' }))).records[0];
    assert.equal(record.updatedAt, first.updatedAt); assert.equal(record.history[1].createdAt, first.updatedAt);
});

test('visibility is a revision-fenced local preference and never deletes content', async () => {
    const { a, c } = fixture(); const before = await add(a);
    await a.mutate(a.request('enable', { enabled: true, revision: before.revision }));
    await assert.rejects(() => c.mutate(c.request('enable', { enabled: false, revision: before.revision })), { code: 'CONFLICT' });
    const state = await a.read(); await a.mutate(a.request('enable', { enabled: false, revision: state.revision }));
    assert.deepEqual((await a.read()).records, before.records);
});

test('Chrome backend reads only its content and combined-restore fence, writes/subscribes only to content', async () => {
    const calls = [], listeners = new Set(); let current;
    const chrome = { storage: { local: { async get(keys) { calls.push(['get', keys]); return { [api.KEY]: current }; },
        async set(value) { calls.push(['set', value]); current = value[api.KEY]; } },
        sync: new Proxy({}, { get() { throw Error('sync must not be used'); } }),
        onChanged: { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); } } } };
    const locks = { request(name, options, action) { calls.push(['lock', name, options]); return action(); } };
    const store = new api.Store(api.createChromeBackend(chrome, locks), { id: (() => { let i = 0; return () => `chrome_id_${++i}`; })(), now: () => '2026-10-10T19:00:00.000Z' });
    let changes = 0; const unsubscribe = store.subscribe(() => changes++); await add(store);
    for (const listener of listeners) { listener({ unrelated: {} }, 'local'); listener({ [api.KEY]: {} }, 'sync'); listener({ [api.KEY]: {} }, 'local'); }
    assert.equal(changes, 1); unsubscribe(); assert.equal(listeners.size, 0);
    assert.ok(calls.filter(item => item[0] === 'get').every(item => item[1].length === 1 && [api.KEY, '__localItabCombinedRestoreV1'].includes(item[1][0])));
    assert.ok(calls.filter(item => item[0] === 'set').every(item => Object.keys(item[1]).join() === api.KEY));
    assert.throws(() => api.createChromeBackend(chrome, null), { code: 'UNAVAILABLE' });
});

test('browser global loads without accessing providers, pages, model APIs or network', () => {
    const fail = () => { throw Error('external API used'); };
    const context = { TextEncoder, fetch: fail, XMLHttpRequest: fail, eval: fail, Function: fail,
        navigator: { get clipboard() { return fail(); } }, get document() { return fail(); }, get StorageManager() { return fail(); } };
    vm.runInNewContext(fs.readFileSync(require.resolve('../shared/local-prompts-store.js'), 'utf8'), context);
    assert.ok(context.LocalItabPrompts); assert.equal(context.LocalItabPrompts.renderTemplate('static text'), 'static text');
});
