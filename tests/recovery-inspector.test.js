const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const Inspector = require('../shared/recovery-inspector');
const Storage = require('../storage');
const clone = value => structuredClone(value);
const NOW = '2026-10-14T20:00:00.000Z';
const SECRET = 'SYNTHETIC_AUTH_MUST_NOT_APPEAR';
const id = 'l_' + 'a'.repeat(32), id2 = 'l_' + 'b'.repeat(32);
const KEYS = Inspector.KEYS;
const key = '__localItabWorkspaceV1:default:g1';
function registry() { return { schemaVersion: 1, revision: 0, defaultId: 'default', lastUsedId: 'default', migrationId: 'm1', workspaces: [
    { id: 'default', generation: 'g1', name: 'Default test', order: 0, createdAt: NOW, updatedAt: NOW, deletedAt: null }
] }; }
function config() { return { links: [
    { title: '  Original title  ', url: 'https://example.com', category: 'work' },
    { title: '', url: 'https://example.com/', category: 'hidden', icon: 'X' }
], quote: '保留原句 🌿\n  空白  ', categories: [{ id: 'work', name: '工作', icon: 'W' }],
layout: { autoArrange: false, positions: { 'all|https://example.com': { x: -11.25, y: 12.5 }, 'hidden|https://example.com': { x: 40, y: -2 }, 'all|https://example.com/': { x: 113, y: 25 } } } }; }
async function hash(value) { const m = new Storage(); const previous = Object.getOwnPropertyDescriptor(globalThis, 'crypto'); Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true }); try { return await m.fingerprint(value); } finally { if (previous) Object.defineProperty(globalThis, 'crypto', previous); else delete globalThis.crypto; } }
function fixture(seed = {}) {
    const raw = clone(seed), reads = [], writes = [], hooks = {};
    const local = { async get(keys) { reads.push([...keys]); assert(Array.isArray(keys)); assert(keys.every(k => Inspector.BASE_KEYS.includes(k) || /^__localItabWorkspaceV1:[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/.test(k))); if (hooks.get) return hooks.get(keys, raw, reads.length); return Object.fromEntries(keys.filter(k => Object.hasOwn(raw, k)).map(k => [k, clone(raw[k])])); },
        async set(value) { writes.push(value); throw Error('Forbidden write'); }, async remove(value) { writes.push(value); throw Error('Forbidden remove'); }, async clear() { writes.push('clear'); throw Error('Forbidden clear'); } };
    const api = Inspector.createInspector({ local, crypto: webcrypto, now: () => NOW });
    return { api, raw, reads, writes, hooks };
}
function migration(values) { return { schemaVersion: 1, id: 'm1', createdAt: NOW, values }; }
function bundle(values) { return { schemaVersion: 1, id: 'default', generation: 'g1', values }; }
function seed(values = config()) { return { [KEYS.registry]: registry(), [KEYS.activation]: { schemaVersion: 1, migrationId: 'm1', defaultId: 'default' }, [KEYS.migration]: migration(values), [key]: bundle({ links: [], quote: 'Newer current content' }), __auth: SECRET }; }

test('empty current workspace and nonempty preMigration remain separate read-only copies', async () => {
    const f = fixture(seed()), before = clone(f.raw), report = await f.api.inspect();
    assert.deepEqual(report.entries.map(e => [e.source.kind, e.siteCount]), [['preMigration', 2], ['workspace', 0]]);
    const old = report.entries[0], current = report.entries[1];
    assert.equal(old.integrity, 'unverified'); assert.equal(old.timeKind, 'migration'); assert.equal(old.recordedAt, NOW);
    assert.equal(current.recordedAt, null); assert.equal(current.timeKind, 'unknown'); assert.equal(current.source.identityStatus, 'verified');
    assert.deepEqual(f.api.preview(report, old.id).links, config().links);
    assert.deepEqual(JSON.parse(f.api.exportEntry(report, old.id)).configurationProjection, config());
    assert.equal(JSON.parse(f.api.exportEntry(report, current.id)).configurationProjection.quote, 'Newer current content');
    assert.deepEqual(f.raw, before); assert.deepEqual(f.writes, []); assert(f.reads.length > 3); assert(f.reads.every(keys => keys.length === 1));
    assert(!f.reads.some(keys => keys.includes('__auth')));
});

test('raw and portable recovery have separate checksums, counts, source and exact absence', async () => {
    const raw = config(), payload = { version: '1.0', schemaVersion: 1, createdAt: NOW, data: { ...raw, links: [{ title: 'Portable only', url: 'https://example.com/' }] } };
    const recovery = { reason: 'beforeCloudReplacement', rawConfiguration: raw, rawConfigurationChecksum: await hash(raw), payload, checksum: await hash(payload), providerState: { token: SECRET } };
    const f = fixture(seed({ ...config(), [KEYS.restore]: recovery })), report = await f.api.inspect();
    const rows = report.entries.filter(e => e.source.kind === 'beforeCloudReplacement'); assert.equal(rows.length, 2);
    assert.deepEqual(rows.map(e => [e.source.representation, e.siteCount, e.integrity]), [['raw', 2, 'verified'], ['portable', 1, 'verified']]);
    const exported = JSON.parse(f.api.exportEntry(report, rows[0].id)); assert.deepEqual(exported.configurationProjection, raw);
    assert(!Object.hasOwn(exported.configurationProjection.links[0], 'icon')); assert(!JSON.stringify(report).includes(SECRET));
    assert(!f.api.exportEntry(report, rows[0].id).includes(SECRET)); assert.deepEqual(f.writes, []);
});

test('cloud-clear and previous recovery retain origin and layer without pretending to be current local data', async () => {
    const payload = { data: config(), exportDate: NOW }, raw = config();
    const recovery = { reason: 'beforeCloudClear', payload, checksum: await hash(payload), previousRecovery: {
        reason: 'beforeCloudReplacement', rawConfiguration: raw, rawConfigurationChecksum: await hash(raw)
    } };
    const f = fixture({ [KEYS.restore]: recovery }), report = await f.api.inspect();
    const cloud = report.entries.find(e => e.source.kind === 'beforeCloudClear'); const prior = report.entries.find(e => e.source.kind === 'beforeCloudReplacement');
    assert.equal(cloud.source.depth, 0); assert.equal(prior.source.depth, 1); assert.equal(cloud.timeKind, 'backup'); assert.equal(prior.recordedAt, null);
    assert.equal(prior.timeKind, 'unknown'); assert.deepEqual(f.writes, []);
});

for (const bad of ['bad', null, 'a'.repeat(64)]) test(`present bad recovery checksum ${JSON.stringify(bad)} is failed, never verified`, async () => {
    const f = fixture({ [KEYS.restore]: { rawConfiguration: config(), rawConfigurationChecksum: bad } });
    const report = await f.api.inspect(), row = report.entries.find(e => e.source.representation === 'raw');
    assert.equal(row.integrity, 'failed'); assert(row.warnings.includes('CHECKSUM_FAILED')); assert(row.exportable);
    assert.equal(JSON.parse(f.api.exportEntry(report, row.id)).integrity, 'failed');
});

test('unknown nested fields, provider credentials and personal stores never enter previews or exports', async () => {
    const value = config(); value.auth = SECRET; value.sync = { enabled: true, accessToken: SECRET }; value.__localItabPersonalTasksV1 = { text: SECRET };
    value.links[0].password = SECRET; value.categories[0].token = SECRET; value.layout.auth = SECRET; value.layout.positions['all|https://example.com'].token = SECRET;
    value.appearance = { template: 'clarity', customization: { cardSpans: { 'weather-container': 1, secret: SECRET }, apiKey: SECRET } };
    const f = fixture({ [KEYS.migration]: migration(value) }), report = await f.api.inspect(), row = report.entries[0];
    const exported = f.api.exportEntry(report, row.id), preview = f.api.preview(report, row.id);
    assert(!exported.includes(SECRET)); assert(!JSON.stringify(preview).includes(SECRET)); assert(!JSON.stringify(report).includes(SECRET));
    assert.deepEqual(JSON.parse(exported).configurationProjection.links, config().links);
    assert(row.warnings.includes('PRIVATE_FIELDS_OMITTED')); assert.deepEqual(f.writes, []);
});

test('credential-bearing URLs are explicitly omitted without rewriting original storage', async () => {
    const value = config(); value.links[0].url = 'https://synthetic:password@example.com/path'; value.layout.positions['all|https://synthetic:password@example.com/path'] = { x: 1, y: 2 };
    const f = fixture({ [KEYS.migration]: migration(value) }), before = clone(f.raw), report = await f.api.inspect(), row = report.entries[0];
    const exported = f.api.exportEntry(report, row.id); assert(!exported.includes('synthetic:password')); assert(row.warnings.includes('CREDENTIAL_URL_OMITTED'));
    assert.deepEqual(f.raw, before); assert.equal(row.siteCount, 2); assert.equal(f.api.preview(report, row.id).links.length, 2);
});

test('duplicate schema2 identities, hidden views and old raw URL spelling are not normalized or regenerated', async () => {
    const value = config(); value.schemaVersion = 2; value.links[0].layoutId = id; value.links[1].layoutId = id2;
    value.layout.identityVersion = 1; value.layout.positionsById = { [id]: { all: { x: 1.25, y: -22 }, hidden: { x: 7, y: 3 } }, [id2]: { all: { x: 99, y: 55 } } };
    const f = fixture({ [KEYS.migration]: migration(value) }), report = await f.api.inspect();
    assert.deepEqual(JSON.parse(f.api.exportEntry(report, report.entries[0].id)).configurationProjection, value);
});

for (const links of [undefined, 'damaged', null, [null, 3, { title: '', url: 'javascript:alert(1)' }]]) test(`damaged or missing links are not silently replaced by an empty array: ${JSON.stringify(links)}`, async () => {
    const value = { quote: 'Still readable' }; if (links !== undefined) value.links = links;
    const f = fixture({ [KEYS.migration]: migration(value) }), report = await f.api.inspect(), row = report.entries[0];
    assert.equal(row.siteCount, Array.isArray(links) ? links.length : null);
    assert.equal(JSON.parse(f.api.exportEntry(report, row.id)).configurationProjection.quote, value.quote);
    if (Array.isArray(links)) assert.deepEqual(f.api.preview(report, row.id).links, [null, null, links[2]]);
    else assert.equal(f.api.preview(report, row.id).links, null);
});

test('broken registry, missing activation and missing bundle do not hide retained migration copies', async () => {
    const value = seed(); value[KEYS.registry].revision = 'bad'; delete value[KEYS.activation]; delete value[key];
    const f = fixture(value), report = await f.api.inspect(); assert.equal(report.entries[0].siteCount, 2); assert(report.warnings.includes('REGISTRY_INVALID'));
    const missing = report.entries.find(e => e.source.kind === 'workspace'); assert.equal(missing.siteCount, null); assert.equal(missing.exportable, false); assert(missing.warnings.includes('BUNDLE_MISSING'));
});

test('valid bundle under an unverified registry is not advertised as the current authoritative workspace', async () => {
    const value = seed(); delete value[KEYS.activation]; const f = fixture(value), report = await f.api.inspect();
    const current = report.entries.find(e => e.source.kind === 'workspace'); assert.equal(current.source.identityStatus, 'unverified'); assert(current.warnings.includes('UNVERIFIED_SOURCE'));
});

test('corrupt middle recovery node and chain limit leave other sources visible with incomplete warnings', async () => {
    let chain = { payload: { data: config() } }; for (let n = 0; n < Inspector.LIMITS.chain + 1; n++) chain = { payload: { data: { links: [] } }, previousRecovery: chain };
    const f = fixture({ [KEYS.migration]: migration(config()), [KEYS.restore]: chain }), report = await f.api.inspect();
    assert(report.warnings.includes('CHAIN_LIMIT')); assert.equal(report.entries[0].siteCount, 2);
    const bad = fixture({ [KEYS.restore]: { payload: { data: config() }, previousRecovery: false }, quote: 'Readable' });
    const other = await bad.api.inspect(); assert(other.warnings.includes('INVALID_SOURCE')); assert(other.entries.some(e => e.siteCount === 2));
});

test('getter and cyclic source never execute accessors and do not hide other readable keys', async () => {
    let called = 0; const suspicious = {}; Object.defineProperty(suspicious, 'values', { enumerable: true, get() { called++; return config(); } });
    const f = fixture({ quote: 'Readable' }); f.hooks.get = keys => Object.fromEntries(keys.filter(k => k === KEYS.migration || k === 'quote').map(k => [k, k === KEYS.migration ? suspicious : 'Readable']));
    const report = await f.api.inspect(); assert.equal(called, 0); assert(report.warnings.includes('INVALID_SOURCE')); assert(report.entries.some(e => e.source.kind === 'legacy' && e.exportable));
    const cycle = {}; cycle.values = cycle; f.hooks.get = keys => Object.fromEntries(keys.filter(k => k === KEYS.migration).map(k => [k, cycle]));
    assert((await f.api.inspect()).warnings.includes('INVALID_SOURCE'));
});

test('read failure and observed concurrent mutation reject without stale downloads or storage writes', async () => {
    const failed = fixture(seed()); failed.hooks.get = () => { throw Error(SECRET); }; await assert.rejects(failed.api.inspect(), e => e.code === 'READ_FAILED' && !e.message.includes(SECRET));
    const f = fixture(seed()); f.hooks.get = (keys, raw, count) => { const copy = Object.fromEntries(keys.filter(k => Object.hasOwn(raw, k)).map(k => [k, clone(raw[k])])); if (keys.includes(key) && raw[key].values.quote !== 'Changed during read') raw[key].values.quote = 'Changed during read'; return copy; };
    await assert.rejects(f.api.inspect(), e => e.code === 'CHANGED'); assert.deepEqual(f.writes, []);
});

test('download remains the exact inspected copy; caller mutation and foreign tickets cannot switch it', async () => {
    const f = fixture(seed()), report = await f.api.inspect(), row = report.entries[0], before = f.api.exportEntry(report, row.id);
    f.raw[KEYS.migration].values.quote = 'Later stored content'; assert(Object.isFrozen(report)); assert(Object.isFrozen(f.api.preview(report, row.id).links));
    assert.equal(f.api.exportEntry(report, row.id), before); assert.throws(() => f.api.exportEntry({ ...report }, row.id)); assert.throws(() => f.api.exportEntry(report, '__auth'));
    const second = fixture(seed()); assert.throws(() => second.api.exportEntry(report, row.id));
});

test('inspection export cannot be imported as an ordinary restorable backup', async () => {
    const f = fixture(seed()), report = await f.api.inspect(), exported = JSON.parse(f.api.exportEntry(report, report.entries[0].id));
    assert.equal(exported.type, 'local-itab-readonly-recovery'); assert.throws(() => new Storage().validateImportPayload(exported), /unrecognized backup type/);
    assert(!Object.hasOwn(exported, 'sync')); assert(!Object.hasOwn(exported, 'providerState')); assert.deepEqual(f.writes, []);
});

test('known credential query parameters and matching layout keys are omitted without altering ordinary URLs', async () => {
    const value = config(), url = 'https://example.com/?api_key=' + SECRET;
    value.links[0].url = url; value.layout.positions['all|' + url] = { x: 1, y: 2 };
    const f = fixture({ [KEYS.migration]: migration(value) }), report = await f.api.inspect(), row = report.entries[0];
    assert(!f.api.exportEntry(report, row.id).includes(SECRET)); assert(row.warnings.includes('CREDENTIAL_URL_OMITTED'));
    assert.equal(f.api.preview(report, row.id).links[1].url, 'https://example.com/'); assert.equal(f.raw[KEYS.migration].values.links[0].url, url);
});

test('oversized link fields are marked omitted while preserving a truthful count and other readable fields', async () => {
    const value = { links: Array.from({ length: Inspector.LIMITS.links + 1 }, () => ({ title: 'Synthetic', url: 'https://example.com' })), quote: 'Readable' };
    const f = fixture({ [KEYS.migration]: migration(value) }), report = await f.api.inspect(), row = report.entries[0];
    assert.equal(row.siteCount, Inspector.LIMITS.links + 1); assert(row.warnings.includes('SIZE_LIMIT')); assert.equal(f.api.preview(report, row.id).links, null);
    assert.equal(JSON.parse(f.api.exportEntry(report, row.id)).configurationProjection.quote, 'Readable'); assert.deepEqual(f.writes, []);
});

test('malformed and path-like registry identifiers cannot request arbitrary storage keys', async () => {
    const value = seed(); value[KEYS.registry].workspaces.push({ id: '../auth', generation: 'evil' }, { id: '__auth', generation: 'bad:secret' });
    const f = fixture(value), report = await f.api.inspect(); assert(report.warnings.includes('REGISTRY_INVALID'));
    assert(f.reads.every(keys => !keys.some(key => key.includes('../') || key.includes('bad:secret'))));
    assert.equal(report.entries[0].siteCount, 2);
});

test('privacy and Sync state remain excluded even when both raw recovery checksums are valid', async () => {
    const raw = { ...config(), privacy: { onlineFavicons: true, onlineWallpapers: false, token: SECRET }, sync: { enabled: true, token: SECRET } };
    const f = fixture({ [KEYS.restore]: { rawConfiguration: raw, rawConfigurationChecksum: await hash(raw) } }), report = await f.api.inspect();
    const row = report.entries.find(e => e.source.representation === 'raw'), output = JSON.parse(f.api.exportEntry(report, row.id));
    assert.equal(row.integrity, 'verified'); assert(!Object.hasOwn(output.configurationProjection, 'privacy')); assert(!Object.hasOwn(output.configurationProjection, 'sync'));
    assert(!JSON.stringify(output).includes(SECRET));
});

for (const url of ['https://synthetic:PRIVATE_PASS@bad host.example/', 'https:\\synthetic:PRIVATE_PASS@bad host.example/', 'synthetic:PRIVATE_PASS@bad host.example/', 'https://bad host.example/?access_token=PRIVATE_PASS', 'https://example.com/#access_token=PRIVATE_PASS']) {
    test(`malformed credential URL stays on device and cannot leak through either URL representation: ${url}`, async () => {
        const value = config(); value.links[0].url = url; value.layout.positions['all|' + url] = { x: 10, y: 20 };
        const f = fixture({ [KEYS.migration]: migration(value) }), report = await f.api.inspect(), row = report.entries[0];
        assert(!f.api.exportEntry(report, row.id).includes('PRIVATE_PASS')); assert(!JSON.stringify(f.api.preview(report, row.id)).includes('PRIVATE_PASS'));
        assert(row.warnings.includes('CREDENTIAL_URL_OMITTED')); assert.equal(f.raw[KEYS.migration].values.links[0].url, url);
    });
}
test('legitimate view names containing auth are preserved with all original coordinates', async () => {
    const value = config(); value.layout.positions['auth_notes|https://example.com'] = { x: 13.25, y: -7.5 };
    value.layout.identityVersion = 1; value.layout.positionsById = { [id]: { auth_notes: { x: 77, y: 88 } } };
    const f = fixture({ [KEYS.migration]: migration(value) }), report = await f.api.inspect();
    assert.deepEqual(JSON.parse(f.api.exportEntry(report, report.entries[0].id)).configurationProjection, value);
});
test('unrecognized portable envelopes are explicitly labeled investigation-only even with a valid checksum', async () => {
    const payload = { type: 'UNKNOWN_PROVIDER', version: 999, data: config() };
    const f = fixture({ [KEYS.restore]: { payload, checksum: await hash(payload) } }), report = await f.api.inspect(), row = report.entries.find(e => e.source.representation === 'portable');
    assert(row.warnings.includes('UNKNOWN_FORMAT')); assert(row.warnings.includes('UNKNOWN_VERSION'));
    assert.throws(() => new Storage().validateImportPayload(JSON.parse(f.api.exportEntry(report, row.id))), /unrecognized backup type/);
});

test('one cumulative byte/node budget rejects the next source without large allocations or partial budget mutation', () => {
    const budget = { bytes: Inspector.LIMITS.bytes - 100, nodes: Inspector.LIMITS.nodes - 3 };
    assert.deepEqual(Inspector.boundedCopy({ x: 1 }, budget), { x: 1 });
    const before = clone(budget);
    assert.throws(() => Inspector.boundedCopy({ x: 2 }, budget), e => e.code === 'SIZE_LIMIT');
    assert.deepEqual(budget, before, 'an omitted oversized source must not consume the remaining budget of smaller sources');
    const bytes = { bytes: Inspector.LIMITS.bytes - 5, nodes: 0 };
    assert.throws(() => Inspector.boundedCopy('中文', bytes), e => e.code === 'SIZE_LIMIT');
    assert.equal(bytes.nodes, 0); assert.equal(bytes.bytes, Inspector.LIMITS.bytes - 5);
});

test('pre-migration attribution requires matching validated migration identity, while unmatched copies remain inspectable', async () => {
    for (const kind of ['match', 'mismatch', 'orphan']) {
        const value = seed();
        if (kind === 'mismatch') value[KEYS.migration].id = 'OTHER';
        if (kind === 'orphan') { delete value[KEYS.registry]; delete value[KEYS.activation]; }
        const f = fixture(value), report = await f.api.inspect(), row = report.entries.find(e => e.source.kind === 'preMigration');
        assert.equal(row.source.identityStatus, kind === 'match' ? 'verified' : 'unverified');
        assert.equal(row.warnings.includes('UNVERIFIED_SOURCE'), kind !== 'match');
        assert.deepEqual(JSON.parse(f.api.exportEntry(report, row.id)).configurationProjection, config());
        assert.deepEqual(f.writes, []);
    }
});

test('invalid deletion metadata never implies that a saved workspace was in Trash', async () => {
    const value = seed(); value[KEYS.registry].workspaces[0].deletedAt = 'garbage';
    const f = fixture(value), report = await f.api.inspect(), row = report.entries.find(e => e.source.kind === 'workspace');
    assert.equal(row.source.deleted, false); assert.equal(row.source.identityStatus, 'unverified'); assert(report.warnings.includes('REGISTRY_INVALID'));
});

test('final UTF-8 export limit includes indentation and the investigation envelope', async () => {
    const fs = require('node:fs'), vm = require('node:vm'), sandbox = { module: { exports: {} }, TextEncoder, URL };
    // A tiny copy of the production constant tests the real boundary without a large allocation.
    vm.runInNewContext(fs.readFileSync(require.resolve('../shared/recovery-inspector'), 'utf8').replace('bytes: 32 * 1024 * 1024', 'bytes: 1800'), sandbox);
    const value = { links: [{ title: '保留'.repeat(220), url: 'https://example.com' }] };
    const api = sandbox.module.exports.createInspector({ crypto: webcrypto, now: () => NOW, local: { async get(keys) { return keys.includes('links') ? { links: value.links } : {}; } } });
    const report = await api.inspect(), row = report.entries[0];
    assert.equal(row.siteCount, 1); assert(row.exportable);
    assert.throws(() => api.exportEntry(report, row.id), e => e.code === 'SIZE_LIMIT');
});
