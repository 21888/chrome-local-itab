const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const Inspector = require('../shared/recovery-inspector');
const Storage = require('../storage');
const Workspaces = require('../shared/workspaces');
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const storage = new Storage();
const NOW = '2026-10-15T04:00:00.000Z';
const RECEIPT = '__localItabRestoreReceiptV1', RESTORE = Inspector.KEYS.restore;
const LG = '__localItabLayoutGeneration', SG = '__localItabSettingsGeneration';
const SECRET = 'SYNTHETIC_PRIVATE_MUST_NOT_LEAVE_INSPECTOR';
const clone = structuredClone, own = (o, k) => Object.hasOwn(o, k);
const bundleKey = entry => `__localItabWorkspaceV1:${entry.id}:${entry.generation}`;
const entry = (id = 'default', generation = 'g1', order = 0) => ({ id, generation, order, name: `Synthetic ${id}`, createdAt: NOW, updatedAt: NOW, deletedAt: null });
const registry = entries => ({ schemaVersion: 1, revision: 0, defaultId: 'default', lastUsedId: 'default', migrationId: 'm1', workspaces: entries });
const activation = { schemaVersion: 1, migrationId: 'm1', defaultId: 'default' };
const recovery = () => ({ reason: 'beforeManualImport', payload: { data: { links: [] }, createdAt: NOW }, providerState: { token: SECRET }, previousRecovery: { payload: { data: { quote: SECRET } } } });
const values = () => ({ schemaVersion: 2, links: [{ title: SECRET, url: 'https://EXAMPLE.test' }, { title: '', url: 'https://EXAMPLE.test/' }], quote: '保留\n  空白🌿', layout: { positions: { 'hidden|https://EXAMPLE.test': { x: -1.25, y: 42 } } }, [LG]: 'layout-before', [SG]: 'settings-before', [RESTORE]: recovery() });
async function saved(v = values(), privacy = { enabled: false }, current = entry()) {
    const target = { ...v, ...(privacy !== undefined ? { privacy } : {}) };
    const receipt = { version: 1, status: 'pending', request: await storage.fingerprint({ links: [] }), target: await storage.fingerprint(storage.restoreReceiptState(target)), recovery: await storage.fingerprint(v[RESTORE]) };
    const entries = current.id === 'default' ? [current] : [entry(), current];
    const result = { [Inspector.KEYS.registry]: registry(entries), [Inspector.KEYS.activation]: clone(activation),
        [bundleKey(current)]: { schemaVersion: 1, id: current.id, generation: current.generation, values: { ...v, [RECEIPT]: receipt } }, unrelatedAuth: SECRET, sync: { auth: SECRET } };
    if (current.id !== 'default') result[bundleKey(entries[0])] = { schemaVersion: 1, id: 'default', generation: 'g1', values: {} };
    if (privacy !== undefined) result.privacy = privacy;
    return result;
}
function fixture(raw, options = {}) {
    const reads = [], writes = [];
    const local = { async get(keys) {
        assert(Array.isArray(keys)); assert.equal(keys.length, 1); reads.push([...keys]);
        assert(keys.every(key => Inspector.BASE_KEYS.includes(key) || /^__localItabWorkspaceV1:[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/.test(key)));
        if (options.onRead) await options.onRead(keys[0], reads.length, raw);
        return Object.fromEntries(keys.filter(k => own(raw, k)).map(k => [k, options.references ? raw[k] : clone(raw[k])]));
    }, set() { writes.push('set'); throw Error('Forbidden write'); }, remove() { writes.push('remove'); throw Error('Forbidden remove'); }, clear() { writes.push('clear'); throw Error('Forbidden clear'); } };
    return { raw, reads, writes, api: Inspector.createInspector({ local, crypto: options.crypto || webcrypto, now: () => NOW }) };
}
const currentValues = (raw, id = 'default') => raw[bundleKey(raw[Inspector.KEYS.registry].workspaces.find(e => e.id === id))].values;
const summary = (report, id = 'default') => report.imports.find(row => row.source.workspaceId === id);
const compare = row => [row.target.comparison, row.recovery.comparison];

test('explicit target and scoped inventories stay in parity with production ownership', () => {
    const expected = [...Object.keys(storage.defaultConfig).filter(k => k !== 'sync'), 'schemaVersion', storage.layoutGenerationKey, storage.settingsGenerationKey];
    assert.deepEqual([...Inspector.TARGET_KEYS].sort(), [...expected].sort());
    assert.deepEqual([...Inspector.SCOPED_KEYS].sort(), [...Workspaces.SCOPED_KEYS].sort());
    assert(!Inspector.BASE_KEYS.includes('sync')); assert(!Inspector.BASE_KEYS.includes(RECEIPT));
});

for (const variant of ['full', 'absent-fields', 'no-privacy', 'null-fields', 'numeric-keys', 'exact-urls', 'hidden-layout', 'named', 'trash']) test(`production fingerprint parity and private frozen summary: ${variant}`, async () => {
    let v = values(), privacy = { nested: { z: 1, a: false } }, e = entry();
    if (variant === 'absent-fields') v = { [RESTORE]: recovery() };
    if (variant === 'no-privacy') privacy = undefined;
    if (variant === 'null-fields') { v.quote = null; v.layout = null; }
    if (variant === 'numeric-keys') v.ui = { '10': { '2': '二', '1': '一' }, '2': 'é', a: 'e\u0301' };
    if (variant === 'named' || variant === 'trash') e = entry('named', 'named-generation', 1);
    if (variant === 'trash') e.deletedAt = NOW;
    const raw = await saved(v, privacy, e);
    // Pass an absent privacy explicitly: the helper's default parameter is otherwise meaningful.
    if (variant === 'no-privacy') { delete raw.privacy; currentValues(raw, e.id)[RECEIPT].target = await storage.fingerprint(storage.restoreReceiptState(v)); }
    const before = clone(raw), f = fixture(raw), report = await f.api.inspect(), row = summary(report, e.id);
    assert.equal(row.status, 'pending'); assert.equal(row.version, 1); assert.deepEqual(compare(row), ['match', 'match']);
    const original = { ...currentValues(raw, e.id), ...(own(raw, 'privacy') ? { privacy: raw.privacy } : {}) };
    assert.equal(row.target.current, await storage.fingerprint(storage.restoreReceiptState(original)));
    assert.equal(row.recovery.current, await storage.fingerprint(v[RESTORE]));
    assert.equal(row.source.workspaceGeneration, e.generation); assert.equal(row.source.deleted, Boolean(e.deletedAt));
    assert(Object.isFrozen(report.imports)); assert(Object.isFrozen(row.target)); assert(!JSON.stringify(row).includes(SECRET));
    assert.deepEqual(raw, before); assert.deepEqual(f.writes, []); assert(!f.reads.flat().includes('unrelatedAuth')); assert(!f.reads.flat().includes('sync'));
});

for (const [name, mutate, expected] of [
    ['config', raw => { currentValues(raw).quote += ' edited'; }, ['mismatch', 'match']],
    ['privacy', raw => { raw.privacy.enabled = true; }, ['mismatch', 'match']],
    ['layout fence', raw => { currentValues(raw)[LG] = 'next-layout'; }, ['mismatch', 'match']],
    ['settings fence', raw => { currentValues(raw)[SG] = 'next-settings'; }, ['mismatch', 'match']],
    ['schema', raw => { currentValues(raw).schemaVersion = 1; }, ['mismatch', 'match']],
    ['array order', raw => { currentValues(raw).links.reverse(); }, ['mismatch', 'match']],
    ['provider metadata', raw => { currentValues(raw)[RESTORE].providerState.token += ' changed'; }, ['match', 'mismatch']],
    ['ancestry', raw => { currentValues(raw)[RESTORE].previousRecovery.payload.data.quote += ' changed'; }, ['match', 'mismatch']],
    ['reason', raw => { currentValues(raw)[RESTORE].reason = 'another reason'; }, ['match', 'mismatch']],
    ['missing recovery', raw => { delete currentValues(raw)[RESTORE]; }, ['match', 'missing']],
    ['null recovery', raw => { currentValues(raw)[RESTORE] = null; }, ['match', 'unavailable']],
    ['root sync irrelevant', raw => { raw.sync.auth = 'new secret'; }, ['match', 'match']],
    ['mixed', raw => { currentValues(raw).quote = 'changed'; delete currentValues(raw)[RESTORE]; }, ['mismatch', 'missing']]
]) test(`receipt comparison distinguishes ${name}`, async () => {
    const raw = await saved(); mutate(raw); const f = fixture(raw), row = summary(await f.api.inspect());
    assert.deepEqual(compare(row), expected); assert.equal(row.status, 'pending'); assert.deepEqual(f.writes, []);
});

test('recorded verified stays a saved status and no receipt stays missing', async () => {
    const raw = await saved(); currentValues(raw)[RECEIPT].status = 'verified'; const f = fixture(raw);
    assert.equal(summary(await f.api.inspect()).status, 'verified');
    delete currentValues(raw)[RECEIPT]; const absent = summary(await f.api.inspect());
    assert.equal(absent.status, 'missing'); assert.equal(absent.request, null); assert.deepEqual(compare(absent), ['unavailable', 'unavailable']);
});

for (const [name, mutate, status] of [
    ['null', () => null, 'invalid'], ['primitive', () => SECRET, 'invalid'], ['array', () => [], 'invalid'],
    ['future', r => ({ ...r, version: 2 }), 'unsupported'], ['unknown status', r => ({ ...r, status: SECRET }), 'invalid'],
    ['extra', r => ({ ...r, secret: SECRET }), 'invalid'], ['uppercase', r => ({ ...r, target: r.target.toUpperCase() }), 'invalid'],
    ['short', r => ({ ...r, request: 'a'.repeat(63) }), 'invalid'], ['malicious', r => ({ ...r, recovery: '<img src=x>' + SECRET }), 'invalid'],
    ['missing member', r => { delete r.target; return r; }, 'invalid'],
    ['pollution', r => Object.defineProperty(r, '__proto__', { enumerable: true, value: SECRET }), 'invalid'],
    ['symbol', r => Object.assign(r, { [Symbol('private')]: SECRET }), 'invalid'],
    ['hidden', r => Object.defineProperty(r, 'secret', { value: SECRET }), 'invalid']
]) test(`strict receipt structure rejects ${name} without rendering its values`, async () => {
    const raw = await saved(); currentValues(raw)[RECEIPT] = mutate(currentValues(raw)[RECEIPT]);
    const row = summary(await fixture(raw, { references: true }).api.inspect());
    assert.equal(row.status, status); assert.equal(row.request, null); assert.equal(row.target.expected, null); assert(!JSON.stringify(row).includes(SECRET));
});

for (const location of ['target', 'privacy', 'recovery']) for (const unsafe of ['hidden', 'symbol', 'pollution', 'accessor']) test(`strict ${location} inventory never matches after ${unsafe} projection`, async () => {
    const raw = await saved(); let invoked = 0;
    const value = location === 'target' ? currentValues(raw).layout : location === 'privacy' ? raw.privacy : currentValues(raw)[RESTORE];
    if (unsafe === 'hidden') Object.defineProperty(value, 'secret', { value: SECRET });
    if (unsafe === 'symbol') value[Symbol('private')] = SECRET;
    if (unsafe === 'pollution') Object.defineProperty(value, '__proto__', { value: SECRET, enumerable: true });
    if (unsafe === 'accessor') Object.defineProperty(value, 'secret', { enumerable: true, get() { invoked++; return SECRET; } });
    const row = summary(await fixture(raw, { references: true }).api.inspect());
    assert.equal(row[location === 'recovery' ? 'recovery' : 'target'].comparison, 'unavailable'); assert.equal(invoked, 0); assert(!JSON.stringify(row).includes(SECRET));
});

test('unsafe receipt accessor, oversized and overly deep sources are unavailable without invoking or projecting', async () => {
    for (const kind of ['accessor', 'oversized', 'deep']) {
        const raw = await saved(); let invoked = 0;
        if (kind === 'accessor') Object.defineProperty(currentValues(raw)[RECEIPT], 'secret', { enumerable: true, get() { invoked++; return SECRET; } });
        if (kind === 'oversized') raw.privacy = 'x'.repeat(Inspector.LIMITS.bytes + 1);
        if (kind === 'deep') { let node = {}; for (let i = 0; i < Inspector.LIMITS.depth + 2; i++) node = { next: node }; currentValues(raw)[RESTORE] = node; }
        const row = summary(await fixture(raw, { references: true }).api.inspect());
        assert.equal(row.target.comparison, 'unavailable'); assert.equal(row.recovery.comparison, kind === 'oversized' ? 'match' : 'unavailable'); assert.equal(invoked, 0);
    }
});

for (const key of ['privacy', 'sync', 'unknownBundleKey']) test(`illegal bundle ${key} cannot shadow global or create attributed verification`, async () => {
    const raw = await saved(); currentValues(raw)[key] = { enabled: true };
    const row = summary(await fixture(raw).api.inspect()); assert.equal(row.status, 'unavailable'); assert.equal(row.source.identityStatus, 'unverified'); assert.deepEqual(compare(row), ['unavailable', 'unavailable']);
});

for (const kind of ['activation', 'duplicate ID', 'duplicate generation', 'bundle generation', 'hidden registry']) test(`invalid current identity fails closed: ${kind}`, async () => {
    const raw = await saved();
    if (kind === 'activation') raw[Inspector.KEYS.activation].migrationId = 'other';
    if (kind === 'duplicate ID') raw[Inspector.KEYS.registry].workspaces.push(entry('default', 'g2', 1));
    if (kind === 'duplicate generation') raw[Inspector.KEYS.registry].workspaces.push(entry('named', 'g1', 1));
    if (kind === 'bundle generation') raw[bundleKey(entry())].generation = 'other';
    if (kind === 'hidden registry') Object.defineProperty(raw[Inspector.KEYS.registry], 'secret', { value: SECRET });
    const rows = (await fixture(raw, { references: true }).api.inspect()).imports;
    assert(!rows.some(row => row.target.comparison === 'match' || row.source.identityStatus === 'verified'));
});

test('historical same ID/different generation and historical-only sources never generate current import summaries', async () => {
    const raw = await saved();
    const oldRegistry = registry([entry('default', 'before')]);
    raw[Inspector.KEYS.prior] = { schemaVersion: 1, createdAt: NOW, snapshot: { registry: oldRegistry, bundles: [{ id: 'default', generation: 'before', values: clone(currentValues(raw)) }] } };
    const report = await fixture(raw).api.inspect(); assert.equal(report.imports.length, 1); assert.equal(report.imports[0].source.workspaceGeneration, 'g1');
    assert(report.entries.some(row => row.source.historical && row.source.workspaceGeneration === 'before'));
    delete raw[Inspector.KEYS.registry]; delete raw[Inspector.KEYS.activation]; assert.equal((await fixture(raw).api.inspect()).imports.length, 0);
});

test('failed read and absent crypto never produce a misleading comparison', async () => {
    const raw = await saved();
    await assert.rejects(fixture(raw, { onRead(key) { if (key === 'privacy') throw Error(SECRET); } }).api.inspect(), { code: 'READ_FAILED' });
    await assert.rejects(fixture(raw, { crypto: {} }).api.inspect(), { code: 'UNAVAILABLE' });
});

for (const location of ['privacy', 'target', 'receipt', 'recovery', 'registry', 'activation']) test(`mutation during target hashing retires all summaries: ${location}`, async () => {
    const raw = await saved(); let changed = false;
    const crypto = { subtle: { async digest(algorithm, bytes) {
        const item = JSON.parse(new TextDecoder().decode(bytes));
        if (!changed && item && own(item, SG)) {
            changed = true;
            if (location === 'privacy') raw.privacy.enabled = true;
            if (location === 'target') currentValues(raw).quote = 'later';
            if (location === 'receipt') currentValues(raw)[RECEIPT].request = '0'.repeat(64);
            if (location === 'recovery') currentValues(raw)[RESTORE].reason = 'later';
            if (location === 'registry') raw[Inspector.KEYS.registry].revision++;
            if (location === 'activation') raw[Inspector.KEYS.activation].migrationId = 'later';
        }
        return webcrypto.subtle.digest(algorithm, bytes);
    } } };
    const f = fixture(raw, { crypto }); await assert.rejects(f.api.inspect(), { code: 'CHANGED' }); assert(changed); assert.deepEqual(f.writes, []);
});

test('a later inspection supersedes a receipt hash already in flight', async () => {
    const raw = await saved(); let release, entered; const waiting = new Promise(r => { entered = r; }); let hold = true;
    const crypto = { subtle: { async digest(algorithm, bytes) { const item = JSON.parse(new TextDecoder().decode(bytes)); if (hold && item && own(item, SG)) { hold = false; entered(); await new Promise(r => { release = r; }); } return webcrypto.subtle.digest(algorithm, bytes); } } };
    const f = fixture(raw, { crypto }), first = f.api.inspect(); await waiting;
    const next = await f.api.inspect(); assert.deepEqual(compare(summary(next)), ['match', 'match']);
    release(); await assert.rejects(first, { code: 'RECOVERY_STALE' }); assert.deepEqual(f.writes, []);
});


test('a current receipt can be compared without any exportable configuration copy', async () => {
    const raw = await saved({ [RESTORE]: { providerState: { token: SECRET } } });
    const f = fixture(raw), report = await f.api.inspect();
    assert.deepEqual(compare(summary(report)), ['match', 'match']);
    assert(report.entries.every(row => !row.exportable)); assert.deepEqual(f.writes, []);
});

test('changing receipt-only content leaves investigation export bytes and stricter file eligibility unchanged', async () => {
    const raw = await saved(), f = fixture(raw), first = await f.api.inspect();
    const exports = first.entries.filter(row => row.exportable).map(row => f.api.exportEntry(first, row.id));
    const failures = new Map();
    for (const row of first.entries.filter(row => row.source.representation !== 'configuration')) {
        await assert.rejects(f.api.reviewRecovery(first, row.id), error => { failures.set(row.id, error.code); return /^RECOVERY_/.test(error.code); });
    }
    currentValues(raw)[RECEIPT].status = 'verified'; currentValues(raw)[RECEIPT].target = '0'.repeat(64);
    const next = await f.api.inspect();
    assert.deepEqual(next.entries.filter(row => row.exportable).map(row => f.api.exportEntry(next, row.id)), exports);
    assert(exports.every(text => !text.includes(RECEIPT) && !text.includes('providerState')));
    for (const row of next.entries.filter(row => row.source.representation !== 'configuration')) {
        await assert.rejects(f.api.reviewRecovery(next, row.id), { code: failures.get(row.id) });
    }
    assert.deepEqual(f.writes, []);
});


for (const location of ['target', 'privacy', 'receipt', 'recovery']) test(`hidden-only mutation during hashing changes read provenance: ${location}`, async () => {
    const raw = await saved(); let changed = false;
    const crypto = { subtle: { async digest(algorithm, bytes) {
        const item = JSON.parse(new TextDecoder().decode(bytes));
        if (!changed && item && own(item, SG)) {
            changed = true;
            const target = location === 'privacy' ? raw.privacy : location === 'target' ? currentValues(raw).layout : currentValues(raw)[location === 'receipt' ? RECEIPT : RESTORE];
            Object.defineProperty(target, 'hidden', { value: SECRET });
        }
        return webcrypto.subtle.digest(algorithm, bytes);
    } } };
    await assert.rejects(fixture(raw, { crypto, references: true }).api.inspect(), { code: 'CHANGED' }); assert(changed);
});
