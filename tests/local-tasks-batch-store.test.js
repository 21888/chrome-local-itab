const assert = require('node:assert/strict');
const test = require('node:test');
const api = require('../shared/local-tasks-store.js');
const { Controller } = require('../shared/local-tasks-controller.js');
const clone = value => value === undefined ? undefined : structuredClone(value);
const now = '2026-10-10T10:00:00.000Z';
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
// All pages share one serial lock. No native Chrome or provider is involved.
function fixture(raw) {
    let queue = Promise.resolve(), sequence = 0;
    const listeners = new Set();
    const b = {
        reads: 0, writes: 0, failRead: false, failWrite: false, throwWrite: false,
        failVerify: false, dropWrite: false, delay: null,
        lock(action) { const result = queue.then(action); queue = result.catch(() => {}); return result; },
        async read() { this.reads++; if (this.failRead) throw Error('PRIVATE_READ_DETAIL'); return clone(raw); },
        async write(next) {
            this.writes++;
            if (this.delay) await this.delay;
            if (this.failWrite) return false;
            if (this.throwWrite) throw Error('QUOTA_BYTES PRIVATE_BACKEND_DETAIL');
            if (this.dropWrite) return;
            raw = clone(next);
            if (this.failVerify) { this.failRead = true; this.failVerify = false; }
            listeners.forEach(listener => listener());
        },
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        raw: () => clone(raw), seed: value => { raw = clone(value); }
    };
    const options = { id: () => `batch_identity_${++sequence}`, now: () => now };
    return { b, a: new api.Store(b, options), c: new api.Store(b, options) };
}
const add = (store, text) => store.mutate(store.request('add', { text }));
const command = (store, kind, task, rest = {}) => store.request(kind, { id: task.id, version: task.version, ...rest });
function record(index, state = 'active', text = `original ${index}`) {
    return { id: `existing_task_${index}`, version: `existing_version_${index}`, text, state,
        removedFrom: state === 'removed' ? 'done' : null, createdAt: now, updatedAt: now };
}
function populated(count) {
    const value = api.initial();
    value.records = Array.from({ length: count }, (_, index) => record(index, ['active', 'done', 'removed'][index % 3]));
    if (count) value.pinnedId = value.records[0].id;
    return api.validate(value);
}
function almostFullBytes(headroom) {
    const value = populated(3);
    value.recovery = Array.from({ length: 8 }, (_, index) => ({ id: `recovery_${index}`, createdAt: now,
        content: { records: Array.from({ length: 250 }, (_, number) => record(number, 'active', 'x')), pinnedId: null } }));
    const target = api.LIMITS.bytes - 4096 - headroom;
    let remaining = target - bytes(value);
    assert(remaining > 0);
    for (const task of value.recovery.flatMap(item => item.content.records)) {
        const extra = Math.min(remaining, 999); task.text += 'x'.repeat(extra); remaining -= extra;
    }
    assert.equal(remaining, 0); assert.equal(bytes(value), target);
    return api.validate(value);
}

test('batch parsing splits only newline forms, preserves exact text/order/duplicates, and skips only blank lines', () => {
    const expected = ['  - keep this prefix  ', '\t1. keep numbering\t', '[ ] checklist', 'same', 'same',
        '中文 👩🏽‍💻', '<script>alert(1)</script>', 'https://example.test/path', 'one\u2028two\u2029three'];
    const source = `\r\n \t\r${expected[0]}\r\n${expected[1]}\n${expected[2]}\r${expected[3]}\n${expected[4]}\n\u3000\n${expected.slice(5).join('\r\n')}\n`;
    assert.deepEqual(api.parseBatch(source), expected);
    assert.deepEqual(api.parseBatch(' a\r\nb\rc\nd '), [' a', 'b', 'c', 'd ']);
});

test('batch parsing and direct requests enforce nonempty, control-character, Unicode codepoint and source limits', async () => {
    const { a, b } = fixture();
    const exact = '😀'.repeat(1000);
    assert.equal(exact.length, 2000);
    assert.deepEqual(api.parseBatch(exact), [exact]);
    const review = await a.reviewBatch(exact);
    assert.equal((await a.mutate(review.command)).records[0].text, exact);
    const before = b.raw(), writes = b.writes;
    for (const [source, code] of [[null, 'TEXT'], ['', 'TEXT'], ['\r\n \t\r\u3000', 'TEXT'],
        ['valid\n\u0000invalid', 'TEXT'], ['valid\n\u000binvalid', 'TEXT'], ['😀'.repeat(1001), 'TEXT_LIMIT'],
        [' '.repeat(api.LIMITS.bytes + 1), 'SIZE_LIMIT'], [Array(501).fill('task').join('\n'), 'CAPACITY']]) {
        assert.throws(() => api.parseBatch(source), { code });
        await assert.rejects(() => a.reviewBatch(source), { code });
        assert.deepEqual(b.raw(), before); assert.equal(b.writes, writes);
    }
    for (const texts of [null, [], ['good', ' '], ['good', '\u007f'], ['good', '😀'.repeat(1001)], Array(501).fill('x')]) {
        assert.throws(() => a.request('addBatch', { texts }));
        assert.deepEqual(b.raw(), before); assert.equal(b.writes, writes);
    }
});

test('review is read-only on both absent and populated storage and supplies immutable command identities', async () => {
    for (const seed of [undefined, populated(4)]) {
        const { a, b } = fixture(seed), before = b.raw();
        const preview = await a.reviewBatch('  first  \r\n\nsecond\nsame\nsame');
        assert.deepEqual(preview.texts, ['  first  ', 'second', 'same', 'same']);
        assert.equal(preview.count, 4); assert.equal(preview.currentTotal, seed?.records.length || 0);
        assert.equal(preview.remaining, 500 - preview.currentTotal); assert.equal(preview.revision, 0);
        assert.equal(preview.command.kind, 'addBatch'); assert.equal(preview.command.createdAt, now);
        assert.equal(new Set(preview.command.identities.map(item => item.id)).size, 4);
        assert(Object.isFrozen(preview.command)); assert(Object.isFrozen(preview.command.texts));
        assert(Object.isFrozen(preview.command.identities)); assert(preview.command.identities.every(Object.isFrozen));
        preview.texts[0] = 'changed preview display';
        assert.equal(preview.command.texts[0], '  first  ');
        assert.deepEqual(b.raw(), before); assert.equal(b.writes, 0);
    }
    const { a } = fixture(); const texts = ['original']; const request = a.request('addBatch', { texts }); texts[0] = 'editor changed';
    assert.equal(request.texts[0], 'original');
});

test('review validates the complete candidate revision and receipt budget without writing', async () => {
    const seed = populated(2); seed.revision = Number.MAX_SAFE_INTEGER;
    const { a, b } = fixture(seed), before = b.raw();
    await assert.rejects(() => a.reviewBatch('new'), { code: 'INVALID' });
    await assert.rejects(() => a.mutate(a.request('addBatch', { texts: ['new'] })), { code: 'INVALID' });
    assert.deepEqual(b.raw(), before); assert.equal(b.writes, 0);
});

test('one batch appends in order once and preserves every preexisting task, pin, enabled setting and all eight recovery copies', async () => {
    for (const enabled of [false, true]) {
        const seed = populated(6); seed.enabled = enabled; seed.revision = 7; seed.receipts = ['older_receipt'];
        seed.recovery = Array.from({ length: 8 }, (_, index) => ({ id: `recovery_${index}`, createdAt: now,
            content: { records: [record(index, ['active', 'done', 'removed'][index % 3])], pinnedId: null } }));
        const { a, b } = fixture(seed), preview = await a.reviewBatch('same\nsame\n  exact last  ');
        const result = await a.mutate(preview.command);
        assert.equal(b.writes, 1); assert.equal(result.revision, 8); assert.equal(result.enabled, enabled);
        assert.deepEqual(result.records.slice(0, 6), seed.records); assert.equal(result.pinnedId, seed.pinnedId);
        assert.deepEqual(result.recovery, seed.recovery);
        assert.deepEqual(result.receipts, ['older_receipt', preview.command.operationId]);
        assert.deepEqual(result.records.slice(6), preview.command.texts.map((text, index) => ({ ...preview.command.identities[index],
            text, state: 'active', removedFrom: null, createdAt: now, updatedAt: now })));
        assert.deepEqual(Object.keys(result).sort(), Object.keys(api.initial()).sort());
    }
});

test('batch capacity counts completed and removed records and rejects the entire batch before any write', async () => {
    for (const state of ['active', 'done', 'removed']) {
        const seed = populated(499); seed.records = seed.records.map(task => ({ ...task, state, removedFrom: state === 'removed' ? 'active' : null }));
        seed.pinnedId = state === 'active' ? seed.records[0].id : null;
        const { a, b } = fixture(seed), before = b.raw();
        await assert.rejects(() => a.reviewBatch('one\ntwo'), { code: 'CAPACITY' });
        await assert.rejects(() => a.mutate(a.request('addBatch', { texts: ['one', 'two'] })), { code: 'CAPACITY' });
        assert.deepEqual(b.raw(), before); assert.equal(b.writes, 0);
        const review = await a.reviewBatch('last'); assert.equal(review.currentTotal, 499); assert.equal(review.remaining, 1);
        const full = await a.mutate(review.command); assert.equal(full.records.length, 500);
        await assert.rejects(() => a.reviewBatch('no room'), { code: 'CAPACITY' });
        assert.equal(b.writes, 1);
    }
    const { a, b } = fixture(); const lines = Array(500).fill('duplicate');
    const state = await a.mutate((await a.reviewBatch(lines.join('\n'))).command);
    assert.equal(state.records.length, 500); assert.equal(b.writes, 1);
    assert.equal(new Set(state.records.map(task => task.id)).size, 500);
});

test('commit revalidates every task and identity and never writes a valid prefix of a malformed batch', async () => {
    const { a, b } = fixture(populated(3)), before = b.raw();
    const valid = a.request('addBatch', { texts: ['valid prefix', 'valid suffix'] });
    const invalid = [
        [{ texts: ['valid prefix', ''] }, 'TEXT'],
        [{ texts: ['valid prefix', '😀'.repeat(1001)] }, 'TEXT_LIMIT'],
        [{ texts: ['valid prefix', '\u0001'] }, 'TEXT'],
        [{ texts: ['valid prefix', 7] }, 'TEXT'],
        [{ identities: [valid.identities[0]] }, 'INVALID'],
        [{ identities: [valid.identities[0], { ...valid.identities[1], version: 'bad' }] }, 'INVALID'],
        [{ identities: [valid.identities[0], { ...valid.identities[1], id: valid.identities[0].id }] }, 'CONFLICT'],
        [{ identities: [valid.identities[0], { ...valid.identities[1], id: before.records[1].id }] }, 'CONFLICT'],
        [{ identities: [valid.identities[0], { ...valid.identities[1], extra: 'field' }] }, 'INVALID'],
        [{ createdAt: 'invalid date' }, 'INVALID']
    ];
    for (const [changes, code] of invalid) {
        await assert.rejects(() => a.mutate({ ...valid, ...changes }), { code });
        assert.deepEqual(b.raw(), before); assert.equal(b.writes, 0);
    }
    const colliding = new api.Store(b, { id: () => 'same_identity', now: () => now });
    await assert.rejects(() => colliding.reviewBatch('one\ntwo'), { code: 'CONFLICT' });
    assert.equal(b.writes, 0);
});

test('two competing reviewed batches append whole batches in serial order when both fit', async () => {
    const { a, c, b } = fixture(populated(2));
    const [first, second] = await Promise.all([a.reviewBatch('A1\nA2'), c.reviewBatch('B1\nB2')]);
    const [one, two] = await Promise.all([a.mutate(first.command), c.mutate(second.command)]);
    assert.equal(one.records.length, 4); assert.equal(two.records.length, 6);
    assert.deepEqual(two.records.slice(2).map(task => task.text), ['A1', 'A2', 'B1', 'B2']);
    assert.equal(two.revision, 2); assert.equal(b.writes, 2);
});

test('a batch waiting for the lock refetches capacity and refuses all rows after another page fills it', async () => {
    const { a, c, b } = fixture(populated(498));
    const preview = await a.reviewBatch('batch first\nbatch second');
    const entered = deferred(), release = deferred();
    const held = b.lock(async () => { entered.resolve(); await release.promise; }); await entered.promise;
    const concurrent = add(c, 'other page wins');
    const pending = a.mutate(preview.command);
    const refused = assert.rejects(() => pending, { code: 'CAPACITY' });
    release.resolve(); await held; const latest = await concurrent; await refused;
    assert.deepEqual(b.raw(), latest); assert.equal(b.writes, 1);
    assert.equal(latest.records.length, 499); assert.equal(latest.records.at(-1).text, 'other page wins');
});

test('append preserves newer edits, completion, removal, reordering, pin and enabled state', async () => {
    const { a, c, b } = fixture(populated(6)), preview = await a.reviewBatch('new one\nnew two');
    let latest = await c.read();
    latest = await c.mutate(command(c, 'edit', latest.records[0], { text: 'newer edit' }));
    latest = await c.mutate(command(c, 'complete', latest.records[0]));
    latest = await c.mutate(command(c, 'remove', latest.records[3]));
    latest = await c.mutate(command(c, 'reopen', latest.records[1]));
    latest = await c.mutate(command(c, 'reopen', latest.records[4]));
    latest = await c.mutate(command(c, 'move', latest.records[1], { order: latest.records.filter(task => task.state === 'active').map(task => task.id), direction: 1 }));
    latest = await c.mutate(command(c, 'pin', latest.records[1], { expectedPin: null }));
    latest = await c.mutate(c.request('enable', { enabled: true }));
    const result = await a.mutate(preview.command);
    assert.deepEqual(result.records.slice(0, 6), latest.records); assert.equal(result.pinnedId, latest.pinnedId);
    assert.equal(result.enabled, true); assert.deepEqual(result.recovery, latest.recovery);
    assert.equal(result.revision, latest.revision + 1); assert.equal(b.writes, 9);
});

test('review and commit enforce the unchanged full-state byte budget including recovery, receipts and metadata', async () => {
    const seed = almostFullBytes(0), { a, b } = fixture(seed), before = b.raw();
    await assert.rejects(() => a.reviewBatch('tiny'), { code: 'SIZE_LIMIT' });
    await assert.rejects(() => a.mutate(a.request('addBatch', { texts: ['tiny'] })), { code: 'SIZE_LIMIT' });
    assert.deepEqual(b.raw(), before); assert.equal(b.writes, 0);
    const fitting = fixture(almostFullBytes(1200));
    const review = await fitting.a.reviewBatch('😀'.repeat(200));
    assert.equal((await fitting.a.mutate(review.command)).records.at(-1).text, '😀'.repeat(200));
    assert.equal(fitting.b.writes, 1);
});

test('a byte-valid review is rechecked against newer full state with no partial write or dropped recovery', async () => {
    const { a, c, b } = fixture(almostFullBytes(1300));
    const review = await a.reviewBatch('x'.repeat(900));
    const latest = await add(c, 'x'.repeat(300)), writes = b.writes;
    await assert.rejects(() => a.mutate(review.command), { code: 'SIZE_LIMIT' });
    assert.deepEqual(b.raw(), latest); assert.equal(b.writes, writes); assert.equal(latest.recovery.length, 8);
});

test('batch identities, versions and creation times survive an uncertain readback and idempotent retries', async () => {
    const { a, b } = fixture(); const review = await a.reviewBatch('  exact  \nsame\nsame');
    b.failVerify = true;
    await assert.rejects(() => a.mutate(review.command), { code: 'READ' });
    b.failRead = false; const committed = b.raw(), writes = b.writes;
    a.now = () => '2027-01-01T00:00:00.000Z'; a.id = () => { throw Error('Retry must not generate identities'); };
    const retry = await a.mutate(review.command);
    assert.deepEqual(retry, committed); assert.equal(b.writes, writes);
    assert.deepEqual(retry.records.map(({ id, version }) => ({ id, version })), review.command.identities);
    assert(retry.records.every(task => task.createdAt === now && task.updatedAt === now));
    await a.mutate(review.command); assert.equal(b.writes, writes); assert.equal(retry.records.length, 3);
});

test('an older batch receipt conflicts after any later add, edit, hide, import or recovery', async () => {
    for (const later of ['add', 'edit', 'enable', 'replace', 'recover']) {
        const { a, c, b } = fixture(populated(3)); const file = await a.export();
        const request = (await a.reviewBatch('batch one\nbatch two')).command;
        b.failVerify = true; await assert.rejects(() => a.mutate(request), { code: 'READ' }); b.failRead = false;
        let latest = await c.read();
        if (later === 'add') latest = await add(c, 'other add');
        if (later === 'edit') latest = await c.mutate(command(c, 'edit', latest.records[0], { text: 'other edit' }));
        if (later === 'enable') latest = await c.mutate(c.request('enable', { enabled: true }));
        if (later === 'replace' || later === 'recover') latest = await c.mutate(c.request('replace', await c.review(file)));
        if (later === 'recover') latest = await c.mutate(c.request('recover', { id: latest.recovery[0].id, revision: latest.revision }));
        const writes = b.writes;
        await assert.rejects(() => a.mutate(request), { code: 'CONFLICT' });
        assert.deepEqual(b.raw(), latest); assert.equal(b.writes, writes);
    }
});

test('stable task identity collisions prevent duplicate batch append after its receipt is evicted', async () => {
    const { a, b } = fixture(), request = (await a.reviewBatch('one\ntwo')).command;
    let state = await a.mutate(request);
    state = await a.mutate(command(a, 'remove', state.records[0]));
    for (let index = 0; index < 128; index++) state = await a.mutate(a.request('enable', { enabled: index % 2 === 0 }));
    assert(!state.receipts.includes(request.operationId));
    const writes = b.writes;
    await assert.rejects(() => a.mutate(request), { code: 'CONFLICT' });
    assert.deepEqual(b.raw(), state); assert.equal(b.writes, writes); assert.equal(state.records.length, 2);
});

test('evicted receipts cannot replay a replaced batch whose identities are retained in recovery', async () => {
    const { a, b } = fixture(); const original = await a.export();
    const request = (await a.reviewBatch('one\ntwo')).command; await a.mutate(request);
    let state = await a.mutate(a.request('replace', await a.review(original)));
    for (let index = 0; index < 128; index++) state = await a.mutate(a.request('enable', { enabled: index % 2 === 0 }));
    assert(!state.receipts.includes(request.operationId)); assert.equal(state.records.length, 0);
    assert.deepEqual(state.recovery[0].content.records.map(task => task.id), request.identities.map(item => item.id));
    const writes = b.writes;
    await assert.rejects(() => a.mutate(request), { code: 'CONFLICT' });
    assert.deepEqual(b.raw(), state); assert.equal(b.writes, writes);
});

test('read, false write, quota/throw and dropped-write verification errors keep batches atomic and messages bounded', async () => {
    for (const [flag, code] of [['failRead', 'READ'], ['failWrite', 'WRITE'], ['throwWrite', 'WRITE'], ['dropWrite', 'VERIFY']]) {
        const { a, b } = fixture(populated(3)); const request = (await a.reviewBatch('PRIVATE_BATCH_ONE\nPRIVATE_BATCH_TWO')).command;
        const before = b.raw(); b[flag] = true;
        await assert.rejects(() => a.mutate(request), error => error.code === code && error.message === `Local tasks: ${code}`);
        assert.deepEqual(b.raw(), before); b[flag] = false;
        const result = await a.mutate(request);
        assert.deepEqual(result.records.slice(-2).map(task => task.text), request.texts);
        assert.deepEqual(result.records.slice(-2).map(({ id, version }) => ({ id, version })), request.identities);
    }
    const { a, b } = fixture(); b.failRead = true;
    await assert.rejects(() => a.reviewBatch('PRIVATE_PREVIEW'), { code: 'READ' }); assert.equal(b.writes, 0);
});

test('malformed storage rejects batch review and commit without repairing or overwriting it', async () => {
    for (const seed of [{ wrong: 'PRIVATE_STORAGE' }, { ...api.initial(), recovery: Array(9).fill({}) },
        { ...api.initial(), records: [record(0), record(0)] }]) {
        const { a, b } = fixture(seed), before = b.raw();
        await assert.rejects(() => a.reviewBatch('one\ntwo'));
        await assert.rejects(() => a.mutate(a.request('addBatch', { texts: ['one', 'two'] })));
        assert.deepEqual(b.raw(), before); assert.equal(b.writes, 0);
    }
});

test('controller coalesces rapid batch confirms and retries the same complete command after failures', async () => {
    const { a, b } = fixture(), controller = new Controller(a); await controller.refresh();
    const review = await a.reviewBatch('one\ntwo'), release = deferred(); b.delay = release.promise;
    const first = controller.run(review.command), repeated = controller.run(review.command);
    assert.equal(first, repeated); assert.equal(controller.retryCommand, review.command); assert.equal(controller.status, 'saving');
    release.resolve(); await first; b.delay = null;
    assert.equal(controller.status, 'saved'); assert.equal(controller.state.records.length, 2); assert.equal(b.writes, 1);
    const retry = (await a.reviewBatch('three\nfour')).command; b.failWrite = true;
    await assert.rejects(() => controller.run(retry), { code: 'WRITE' });
    assert.equal(controller.retryCommand, retry); assert.equal(controller.state.records.length, 2);
    b.failWrite = false; await controller.retry(); assert.equal(controller.state.records.length, 4);
    assert.equal(controller.retryCommand, null); controller.destroy();
});

test('batch export remains the exact v1 backup shape and roundtrips records plus all eight recovery copies', async () => {
    const seed = populated(3); seed.enabled = true;
    seed.recovery = Array.from({ length: 8 }, (_, index) => ({ id: `recovery_${index}`, createdAt: now,
        content: { records: [record(index)], pinnedId: null } }));
    const { a } = fixture(seed); const state = await a.mutate((await a.reviewBatch('  duplicate  \n  duplicate  \n中文 😀')).command);
    const source = await a.export(), file = api.parseBackup(source);
    assert.deepEqual(Object.keys(file).sort(), ['content', 'exportedAt', 'format', 'recovery', 'schemaVersion']);
    assert.equal(file.format, 'local-itab-tasks'); assert.equal(file.schemaVersion, 1);
    assert.deepEqual(file.content, { records: state.records, pinnedId: state.pinnedId }); assert.deepEqual(file.recovery, seed.recovery);
    assert(!Object.hasOwn(file, 'receipts')); assert(!Object.hasOwn(file, 'enabled')); assert(!Object.hasOwn(file, 'command'));
    const target = fixture(); const restored = await target.a.mutate(target.a.request('replace', await target.a.review(source)));
    const withoutVersion = task => { const { version, ...rest } = task; return rest; };
    assert.deepEqual(restored.records.map(withoutVersion), state.records.map(withoutVersion));
    assert.equal(restored.pinnedId, state.pinnedId); assert.equal(restored.enabled, false);
    assert.deepEqual(restored.recovery, seed.recovery); assert.equal(target.b.writes, 1);
});
