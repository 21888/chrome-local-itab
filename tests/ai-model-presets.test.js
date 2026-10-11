const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../shared/ai-model-presets');
const connection = () => ({ name: 'Synthetic connection', url: 'https://synthetic.test/v1/chat/completions', model: 'fixture' });
function fixture() {
    let raw; const writes = []; let queue = Promise.resolve();
    const chromeApi = { storage: { local: { get: async () => ({ [api.KEY]: structuredClone(raw) }), set: async value => { raw = structuredClone(value[api.KEY]); writes.push(value); } } } };
    const locks = { request: (_, fn) => { const result = queue.then(fn); queue = result.catch(() => {}); return result; } };
    return { store: api.createStore({ chromeApi, locks }), writes, set: value => { raw = value; } };
}
test('strict schema validates exact metadata only and uses existing endpoint rules', () => {
    assert.deepEqual(api.preset(connection()), connection());
    for (const patch of [{ key: 'synthetic-secret' }, { apiKey: 'synthetic-secret' }, { prompt: 'private' }, { permission: '*' }]) assert.throws(() => api.preset({ ...connection(), ...patch }));
    for (const url of ['http://synthetic.test/chat/completions', 'https://user:pass@synthetic.test/chat/completions', 'https://synthetic.test/chat/completions?key=x', 'https://synthetic.test/chat/completions#secret']) assert.throws(() => api.preset({ ...connection(), url }));
    for (const value of [null, {}, { version: 2, records: [] }, { version: 1, records: [], key: 'secret' }, { version: 1, records: [connection(), connection()] }]) assert.throws(() => api.validate(value));
    assert.throws(() => api.preset({ ...connection(), name: '\u202eunsafe' }));
});
test('explicit save, edit, rename, delete remain metadata-only and local', async () => {
    const f = fixture(); assert.deepEqual(await f.store.read(), { version: 1, records: [] }); assert.equal(f.writes.length, 0);
    let state = await f.store.save(connection());
    const prior = state.records[0]; state = await f.store.save({ ...prior, name: 'Renamed', model: 'other' }, prior);
    assert.deepEqual(state.records, [{ ...connection(), name: 'Renamed', model: 'other' }]);
    assert.deepEqual((await f.store.remove(state.records[0])).records, []);
    assert.equal(f.writes.length, 3); assert.deepEqual(Object.keys(f.writes[0]), [api.KEY]);
});
test('serialized saves preserve other tabs and reject stale edits/deletes and duplicate names', async () => {
    const f = fixture(); await Promise.all([f.store.save(connection()), f.store.save({ ...connection(), name: 'Second' })]);
    assert.equal((await f.store.read()).records.length, 2);
    await assert.rejects(f.store.save(connection()), { code: 'DUPLICATE' });
    await f.store.save({ ...connection(), model: 'changed' }, connection());
    await assert.rejects(f.store.remove(connection()), { code: 'CONFLICT' });
    await assert.rejects(f.store.save(connection(), connection()), { code: 'CONFLICT' });
    assert.equal(f.writes.length, 3);
});
test('corrupt storage and unavailable locks fail closed without overwriting data', async () => {
    const f = fixture(); f.set({ version: 1, records: [{ ...connection(), key: 'synthetic-secret' }] });
    await assert.rejects(f.store.read()); await assert.rejects(f.store.save(connection())); assert.equal(f.writes.length, 0);
    await assert.rejects(api.createStore({ chromeApi: {}, locks: null }).save(connection()), { code: 'UNAVAILABLE' });
});
test('preset size is bounded', async () => {
    const f = fixture(); f.set({ version: 1, records: Array.from({ length: api.LIMITS.records }, (_, i) => ({ ...connection(), name: `Synthetic ${i}` })) });
    await assert.rejects(f.store.save(connection())); assert.equal(f.writes.length, 0);
});
test('data-only validation rejects accessors, symbols, inherited records, sparse arrays and directional model IDs', () => {
    let reads = 0; const accessor = { ...connection() }; Object.defineProperty(accessor, 'name', { enumerable: true, get() { reads++; return 'unsafe'; } });
    assert.throws(() => api.preset(accessor)); assert.equal(reads, 0);
    assert.throws(() => api.preset({ ...connection(), [Symbol('secret')]: 'secret' }));
    assert.throws(() => api.preset(Object.assign(Object.create({ inherited: true }), connection())));
    assert.throws(() => api.preset({ ...connection(), model: 'model\u202esecret' }));
    assert.throws(() => api.validate({ version: 1, records: new Array(1) }));
    const records = []; Object.defineProperty(records, '0', { enumerable: true, get() { reads++; return connection(); } });
    assert.throws(() => api.validate({ version: 1, records })); assert.equal(reads, 0);
});
