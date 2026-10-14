'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto, createHash } = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const Inspector = require('../shared/recovery-inspector');
const RecoveryFile = require('../shared/recovery-file');
const Codec = require('../shared/configuration-codec');
const Storage = require('../storage');
const NOW = '2026-10-14T22:00:00.000Z', THEN = '2026-10-13T20:00:00.000Z';
const clone = value => structuredClone(value);
const manager = new Storage();
const CONFIG_KEYS = Object.keys(manager.defaultConfig).filter(key => key !== 'sync');
const id = n => 'l_' + n.toString(16).padStart(32, '0');
const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
function configuration(schema = 1) {
    const c = manager.cloneDefaultConfig(); c.schemaVersion = schema;
    c.links = ['https://example.com', 'https://example.com/', 'example.com', 'https://example.com'].map((url, index) => ({ title: `Synthetic ${index}`, url, icon: 'S', category: index === 3 ? 'hidden-orphan' : 'work', ...(schema === 2 ? { layoutId: id(index + 1) } : {}) }));
    c.quote = 'Exact retained quote 中文';
    c.layout.positions = Object.fromEntries(c.links.flatMap((link, index) => ['all', 'auth_notes', '__proto__', 'constructor', 'hidden|view'].map((view, offset) => [view + '|' + link.url, { x: index * 100 + offset + 11.25, y: -index * 20 - offset - 7.5 }])));
    for (const key of ['opaque-orphan-key', '__proto__', 'constructor', 'auth_notes']) Object.defineProperty(c.layout.positions, key, { value: { x: 7.5, y: -9.25 }, enumerable: true, configurable: true, writable: true });
    if (schema === 2) {
        c.layout.identityVersion = 1;
        c.layout.positionsById = Object.fromEntries([...c.links, { layoutId: id(99) }].map((link, index) => [link.layoutId, Object.fromEntries(['all', '__proto__', 'constructor', 'auth_notes', 'hidden|view'].map((view, offset) => [view, { x: index * 100 + offset + 2.5, y: -index * 10 - offset - 0.25 }]))]));
    }
    return c;
}
function recovery(config = configuration(), options = {}) {
    const payload = manager.buildManualExportPayload(config, { exportDate: THEN });
    return { reason: 'beforeCloudReplacement', rawConfiguration: config, rawConfigurationChecksum: hash(config), payload, checksum: hash(payload), ...options };
}
function fixture(node = recovery(), options = {}) {
    const raw = options.raw || { [Inspector.KEYS.restore]: clone(node) }, original = clone(raw), reads = [], writes = [], hooks = {};
    const local = { async get(keys) {
        reads.push(keys); assert(Array.isArray(keys) && keys.length === 1); assert(keys[0] !== null);
        if (hooks.get) return hooks.get(keys, raw);
        return Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, clone(raw[key])]));
    } };
    for (const key of ['set', 'remove', 'clear', 'getAll', 'ready', 'ensureSyncInitialized']) local[key] = () => { writes.push(key); assert.fail(`Forbidden ${key}`); };
    const api = Inspector.createInspector({ local, crypto: options.crypto || webcrypto, now: options.now || (() => NOW) });
    return { api, raw, original, reads, writes, hooks };
}
async function inspect(f, representation = 'raw', depth = 0) {
    const report = await f.api.inspect();
    const row = report.entries.find(entry => entry.source.representation === representation && entry.source.depth === depth);
    assert(row); return { report, row };
}
async function review(f, representation = 'raw', depth = 0) { const result = await inspect(f, representation, depth); return { ...result, review: await f.api.reviewRecovery(result.report, result.row.id) }; }
function selected(node, representation = 'raw') {
    const raw = representation === 'raw';
    return { representation, value: node[raw ? 'rawConfiguration' : 'payload'], checksum: node[raw ? 'rawConfigurationChecksum' : 'checksum'], reason: node.reason, containerKeys: Object.keys(node) };
}
const gate = maxBytes => RecoveryFile.create({ copy: Inspector.boundedCopy, hash, maxBytes: maxBytes || Inspector.LIMITS.bytes });
for (const schema of [1, 2]) for (const representation of ['raw', 'portable']) test(`actual Manager importer preserves complete ${representation} schema ${schema} and every opaque coordinate/identity`, async () => {
    const source = configuration(schema), f = fixture(recovery(source)), { report, row, review: cap } = await review(f, representation);
    const text = f.api.exportRecovery(report, row.id, cap), output = JSON.parse(text), restored = manager.validateImportPayload(output);
    assert.equal(output.version, '2.0'); assert.equal(output.urlIdentityVersion, 1); assert.equal(output.schemaVersion, schema);
    assert.equal(output.type, 'backupSnapshot'); assert.equal(output.app, 'local-itab'); assert.equal(output.createdAt, NOW); assert.equal(output.exportDate, NOW);
    for (const key of CONFIG_KEYS) assert.deepEqual(restored[key], source[key], key);
    assert.deepEqual(restored.sync, manager.getDisabledSyncConfig()); assert.deepEqual(f.raw, f.original); assert.deepEqual(f.writes, []);
    assert.equal(cap.scope, 'configuration-only'); assert.equal(cap.siteCount, 4); assert.equal(cap.categoryCount, 5); assert.equal(cap.duplicateCount, 1);
    assert.equal(cap.positionCount, Object.keys(source.layout.positions).length + (schema === 2 ? 25 : 0));
    assert.equal(cap.schemaVersion, schema); assert.equal(cap.recordedAt, representation === 'portable' ? THEN : null); assert.equal(cap.timeVerified, representation === 'portable');
    assert.deepEqual(cap.links, source.links.map(({ title, url }) => ({ title, url })));
    assert.deepEqual(Object.keys(cap).sort(), ['scope', 'siteCount', 'categoryCount', 'duplicateCount', 'positionCount', 'schemaVersion', 'recordedAt', 'timeVerified', 'generatedAt', 'links', 'exclusions'].sort());
    assert(Object.isFrozen(cap) && Object.isFrozen(cap.links) && Object.isFrozen(cap.links[0]) && Object.isFrozen(cap.exclusions));
    assert.throws(() => { cap.links[0].url = 'https://changed.example/'; }, TypeError);
});
test('canonical and genuinely empty sources always produce v2, never invented defaults', async () => {
    for (const empty of [false, true]) {
        const c = manager.cloneDefaultConfig(); c.categories = empty ? [] : c.categories;
        c.links = empty ? [] : [{ title: 'Canonical', url: 'https://canonical.example/', icon: 'S', category: 'work' }];
        const f = fixture(recovery(c)), { report, row, review: cap } = await review(f);
        const output = JSON.parse(f.api.exportRecovery(report, row.id, cap));
        assert.equal(output.version, '2.0'); assert.equal(cap.siteCount, empty ? 0 : 1); assert.equal(cap.categoryCount, empty ? 0 : 5);
        assert.deepEqual(manager.validateImportPayload(output), c);
    }
});
const corruptions = {
    missingLinks: c => delete c.links, missingLayout: c => delete c.layout, missingPrivacy: c => delete c.privacy,
    missingNested: c => delete c.clock.worldClocks, missingCoordinates: c => delete c.layout.positions['opaque-orphan-key'].y,
    unknownRoot: c => c.futureSetting = 1, unknownLink: c => c.links[0].future = 1,
    unknownPosition: c => c.layout.positions['opaque-orphan-key'].credential = 'SYNTHETIC_PRIVATE',
    unknownPrivacy: c => c.privacy.secret = 'SYNTHETIC_PRIVATE', unknownCategory: c => c.categories[0].future = 1,
    unknownClock: c => c.clock.worldClocks = [{ timeZone: 'UTC', label: 'UTC', future: true }],
    unknownTopic: c => c.hot.baidu = [{ t: 'Synthetic', s: 1, secret: 'SYNTHETIC_PRIVATE' }],
    unknownPadding: c => c.ui.dashboardPadding = { top: 1, right: 2, bottom: 3, left: 4, secret: 'SYNTHETIC_PRIVATE' },
    wrongType: c => c.show.clock = 'yes', futureSchema: c => c.schemaVersion = 999, wrongSchema: c => c.schemaVersion = 2,
    missingCategoryId: c => c.categories[0].id = '', duplicateCategoryId: c => c.categories[1].id = c.categories[0].id,
    trimTitle: c => c.links[0].title = ' Title needs trimming ', clampLayout: c => c.layout.columns = 99,
    trimQuote: c => c.quote = ' Trimmed quote ', unknownTheme: c => c.themePreset = 'future', unsafeProtocol: c => c.links[0].url = 'javascript:alert(1)',
    credentialURL: c => c.links[0].url = 'https://synthetic:password@bad host.example/',
    credentialQuery: c => c.links[0].url = 'https://example.com/?access_token=SYNTHETIC_PRIVATE',
    credentialEncoded: c => c.links[0].url = 'https://example.com/?%74oken=SYNTHETIC_PRIVATE',
    credentialFragment: c => c.links[0].icon = 'https://example.com/#password=SYNTHETIC_PRIVATE',
    secondURL: c => c.layout.positions['view|https://safe.example/|https://user:SYNTHETIC_PRIVATE@private.example/'] = { x: 1, y: 2 },
    secondQuery: c => c.layout.positions['view|https://safe.example/|https://private.example/?token=SYNTHETIC_PRIVATE'] = { x: 1, y: 2 },
    malformedSync: c => c.sync.enabled = 'yes', unknownSync: c => c.sync.token = 'SYNTHETIC_PRIVATE',
    malformedGeneration: c => c.__localItabLayoutGeneration = { token: 'SYNTHETIC_PRIVATE' }, emptyGeneration: c => c.__localItabSettingsGeneration = ''
};
for (const [name, mutate] of Object.entries(corruptions)) test(`strict recovery refuses ${name} even with a matching selected checksum`, async () => {
    const node = recovery(); mutate(node.rawConfiguration); node.rawConfigurationChecksum = hash(node.rawConfiguration);
    const f = fixture(node), { report, row } = await inspect(f);
    await assert.rejects(() => f.api.reviewRecovery(report, row.id), failure => RecoveryFile.CODES.includes(failure.code) && !failure.message.includes('SYNTHETIC_PRIVATE'));
    assert.deepEqual(f.raw, f.original); assert.deepEqual(f.writes, []);
});
for (const mutate of [c => { c.links[1].layoutId = c.links[0].layoutId; }, c => { delete c.layout.positionsById[c.links[0].layoutId]; }, c => { delete c.links[3].layoutId; }, c => { c.layout.identityVersion = 2; }, c => { c.layout.positionsById[id(1)].all.secret = 'SYNTHETIC_PRIVATE'; }]) test('schema-2 corrupt identity/map is refused without ID allocation', async () => {
    const c = configuration(2); mutate(c); const n = recovery(); n.rawConfiguration = c; n.rawConfigurationChecksum = hash(c);
    await assert.rejects(() => gate().build(selected(n), NOW));
});
test('raw and portable own checksum are independent, including corrupt or incomplete siblings', async () => {
    for (const representation of ['raw', 'portable']) for (const checksum of [undefined, 'bad', 'a'.repeat(64)]) {
        const n = recovery(), key = representation === 'raw' ? 'rawConfigurationChecksum' : 'checksum';
        if (checksum === undefined) delete n[key]; else n[key] = checksum;
        const f = fixture(n), { report, row } = await inspect(f, representation);
        await assert.rejects(() => f.api.reviewRecovery(report, row.id), { code: 'RECOVERY_INTEGRITY' });
        const sibling = report.entries.find(entry => entry.source.representation === (representation === 'raw' ? 'portable' : 'raw'));
        const cap = await f.api.reviewRecovery(report, sibling.id); assert(f.api.exportRecovery(report, sibling.id, cap));
    }
    const n = recovery(); delete n.rawConfiguration.links; n.rawConfigurationChecksum = hash(n.rawConfiguration);
    const f = fixture(n), { report, row } = await inspect(f, 'portable');
    const cap = await f.api.reviewRecovery(report, row.id); assert.equal(cap.siteCount, 4);
});
for (const [name, mutate] of Object.entries({
    futureVersion: p => p.version = '999', wrongIdentity: p => p.urlIdentityVersion = 99, enabledSync: p => p.data.sync.enabled = true,
    unknownField: p => p.unknown = 1, missingCategories: p => delete p.data.categories, missingData: p => delete p.data,
    settings: p => { p.settings = p.data; delete p.data; }, wrongType: p => p.type = 'completeBackup', wrongApp: p => p.app = 'other',
    drive: p => p.metadata = { deviceId: 'synthetic' }, unknownItemCount: p => p.itemCounts.extra = 'SYNTHETIC_PRIVATE',
    wrongCountType: p => p.itemCounts.shortcuts = '4', malformedCreatedAt: p => p.createdAt = '2026-02-30T20:00:00.000Z',
    malformedExportDate: p => p.exportDate = 'not a date', missingCreatedAt: p => delete p.createdAt
})) test(`portable selected envelope refuses ${name}`, async () => {
    const n = recovery(); mutate(n.payload); n.checksum = hash(n.payload);
    const f = fixture(n), { report, row } = await inspect(f, 'portable'); await assert.rejects(() => f.api.reviewRecovery(report, row.id));
});
test('known reason/container inventory and well-formed exclusions are enforced before export', async () => {
    for (const mutate of [n => n.reason = 'future', n => delete n.reason, n => n.unknown = 'SYNTHETIC_PRIVATE']) {
        const n = recovery(); mutate(n); const f = fixture(n), { report, row } = await inspect(f); await assert.rejects(() => f.api.reviewRecovery(report, row.id));
    }
    for (const reason of ['beforeRestore', 'beforeIdentity', 'beforeCloudReplacement', 'beforeCloudClear']) {
        const n = recovery(); n.reason = reason; n.providerState = { token: 'SYNTHETIC_PROVIDER_TOKEN' };
        n.rawConfiguration.sync = { enabled: true, lastSync: 'SYNTHETIC_SYNC_TIME', lastError: 'SYNTHETIC_PROVIDER_ERROR', includeLargeAssets: true };
        n.rawConfiguration.__localItabLayoutGeneration = 'SYNTHETIC_GENERATION'; n.rawConfiguration.__localItabSettingsGeneration = 'SYNTHETIC_GENERATION';
        n.rawConfigurationChecksum = hash(n.rawConfiguration);
        const f = fixture(n), { report, row, review: cap } = await review(f), text = f.api.exportRecovery(report, row.id, cap);
        assert(!text.includes('SYNTHETIC_')); assert.deepEqual(cap.exclusions, RecoveryFile.EXCLUSIONS); assert.deepEqual(f.raw, f.original);
    }
});
test('direct configuration/preMigration remain investigation-only while nested checksummed recovery qualifies', async () => {
    const c = configuration(), n = recovery();
    const f = fixture(null, { raw: { [Inspector.KEYS.migration]: { schemaVersion: 1, id: 'synthetic', createdAt: THEN, values: { ...c, [Inspector.KEYS.restore]: n } } } });
    const { report, row } = await inspect(f); const direct = report.entries.find(entry => entry.source.representation === 'configuration');
    await assert.rejects(() => f.api.reviewRecovery(report, direct.id), { code: 'RECOVERY_INTEGRITY' });
    const cap = await f.api.reviewRecovery(report, row.id); assert(f.api.exportRecovery(report, row.id, cap));
});
test('retained depth chooses exact original source, never a projected or newest sibling', async () => {
    const previous = recovery(); previous.rawConfiguration.links[0].title = 'Previous exact source'; previous.rawConfigurationChecksum = hash(previous.rawConfiguration);
    const n = recovery(); n.previousRecovery = previous;
    const f = fixture(n), { report, row, review: cap } = await review(f, 'raw', 1);
    assert.equal(cap.links[0].title, 'Previous exact source'); assert.equal(JSON.parse(f.api.exportRecovery(report, row.id, cap)).data.links[0].title, 'Previous exact source');
    assert.equal(cap.recordedAt, null); assert.equal(cap.timeVerified, false);
});
test('review uses immutable inspected source when synthetic backing storage changes later', async () => {
    const f = fixture(), { report, row } = await inspect(f);
    f.raw[Inspector.KEYS.restore].rawConfiguration.links[0].title = 'Later changed storage';
    const cap = await f.api.reviewRecovery(report, row.id);
    assert.equal(cap.links[0].title, 'Synthetic 0'); assert.equal(JSON.parse(f.api.exportRecovery(report, row.id, cap)).data.links[0].title, 'Synthetic 0');
});
test('capabilities reject copied, stale, cross-owner, wrong source/report, absent and false handles', async () => {
    const f = fixture(), { report, row, review: cap } = await review(f), other = fixture(), otherResult = await review(other);
    const sibling = report.entries.find(entry => entry.source.representation === 'portable');
    for (const invalid of [undefined, false, null, {}, clone(cap), { ...cap }, otherResult.review]) assert.throws(() => f.api.exportRecovery(report, row.id, invalid), { code: 'RECOVERY_STALE' });
    assert.throws(() => f.api.exportRecovery(report, sibling.id, cap), { code: 'RECOVERY_STALE' });
    assert.throws(() => f.api.exportRecovery(otherResult.report, row.id, cap), { code: 'RECOVERY_STALE' });
    assert.throws(() => other.api.exportRecovery(otherResult.report, otherResult.row.id, cap), { code: 'RECOVERY_STALE' });
    assert.equal(f.api.exportRecovery(report, row.id, cap), f.api.exportRecovery(report, row.id, cap));
    const next = await f.api.reviewRecovery(report, sibling.id); assert.throws(() => f.api.exportRecovery(report, row.id, cap), { code: 'RECOVERY_STALE' });
    f.api.retireRecovery(cap); assert(f.api.exportRecovery(report, sibling.id, next));
    f.api.retireRecovery(next); assert.throws(() => f.api.exportRecovery(report, sibling.id, next), { code: 'RECOVERY_STALE' });
});
test('new failed inspect invalidates previous report/capability at start and never revives them', async () => {
    const f = fixture(), { report, row, review: cap } = await review(f);
    f.hooks.get = () => { throw Error('Synthetic read failure'); };
    const pending = f.api.inspect(); assert.throws(() => f.api.exportRecovery(report, row.id, cap), { code: 'RECOVERY_STALE' });
    await assert.rejects(pending, { code: 'READ_FAILED' });
    assert(f.api.preview(report, row.id)); assert(f.api.exportEntry(report, row.id)); await assert.rejects(() => f.api.reviewRecovery(report, row.id), { code: 'RECOVERY_STALE' });
});
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
test('late concurrent inspect cannot become current after newer inspect succeeds', async () => {
    const f = fixture(), held = deferred(), entered = deferred(); let first = true;
    f.hooks.get = async (keys, raw) => {
        if (first) { first = false; entered.resolve(); await held.promise; }
        return Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, clone(raw[key])]));
    };
    const old = f.api.inspect(); const rejected = assert.rejects(old, { code: 'RECOVERY_STALE' }); await entered.promise;
    const latest = await f.api.inspect(); held.resolve(); await rejected;
    const row = latest.entries.find(entry => entry.source.representation === 'raw'), cap = await f.api.reviewRecovery(latest, row.id);
    assert(f.api.exportRecovery(latest, row.id, cap));
});
for (const action of ['newReview', 'retire', 'inspect', 'failedInspect']) test(`review hash await is fenced against ${action}`, async () => {
    const held = deferred(), entered = deferred(); let block = false, once = true;
    const crypto = { subtle: { async digest(...args) { if (block && once) { once = false; entered.resolve(); await held.promise; } return webcrypto.subtle.digest(...args); } } };
    const f = fixture(recovery(), { crypto }), { report, row } = await inspect(f);
    block = true; const old = f.api.reviewRecovery(report, row.id), rejected = assert.rejects(old, { code: 'RECOVERY_STALE' }); await entered.promise;
    let newer;
    if (action === 'newReview') newer = await f.api.reviewRecovery(report, row.id);
    if (action === 'retire') f.api.retireRecovery();
    if (action === 'inspect') await f.api.inspect();
    if (action === 'failedInspect') { f.hooks.get = () => { throw Error('Synthetic failure'); }; await assert.rejects(() => f.api.inspect()); }
    held.resolve(); await rejected;
    if (newer) assert(f.api.exportRecovery(report, row.id, newer));
});
test('invalid new review also retires a valid previous capability immediately', async () => {
    const f = fixture(), { report, row, review: cap } = await review(f);
    const failed = f.api.reviewRecovery(report, 'missing-source'); assert.throws(() => f.api.exportRecovery(report, row.id, cap), { code: 'RECOVERY_STALE' });
    await assert.rejects(failed, { code: 'RECOVERY_STALE' });
});
test('plain JSON gate refuses getters, cycles, prototypes, functions, deep/oversized values before user code runs', async () => {
    let calls = 0;
    const inputs = [];
    const getter = selected(recovery()); Object.defineProperty(getter.value, 'links', { get() { calls++; return []; }, enumerable: true }); inputs.push(getter);
    const cycle = selected(recovery()); cycle.value.quote = cycle; inputs.push(cycle);
    const prototype = selected(recovery()); Object.setPrototypeOf(prototype.value, { quote: 'Inherited' }); inputs.push(prototype);
    const toJSON = selected(recovery()); toJSON.value.toJSON = () => { calls++; return {}; }; inputs.push(toJSON);
    const deep = selected(recovery()); let cursor = deep.value; for (let i = 0; i < Inspector.LIMITS.depth + 1; i++) cursor = cursor.deep = {}; inputs.push(deep);
    const oversized = selected(recovery()); oversized.value.quote = 'X'.repeat(Inspector.LIMITS.bytes + 1); inputs.push(oversized);
    for (const input of inputs) await assert.rejects(() => gate().build(input, NOW), failure => ['RECOVERY_FIELDS', 'SIZE_LIMIT'].includes(failure.code));
    assert.equal(calls, 0);
});
test('final UTF-8 pretty-JSON limit includes envelope and indentation, not just source bytes', async () => {
    const n = recovery(), result = await gate().build(selected(n), NOW), length = new TextEncoder().encode(result.text).length;
    assert.equal((await gate(length).build(selected(n), NOW)).text, result.text);
    await assert.rejects(() => gate(length - 1).build(selected(n), NOW), { code: 'SIZE_LIMIT' });
});
test('investigation second-URL credential regression omits key without broadening benign map policy', async () => {
    const n = recovery(); const key = 'view|https://safe.example/|https://user:SYNTHETIC_SECRET@private.example/';
    n.rawConfiguration.layout.positions[key] = { x: 1, y: 2 }; n.rawConfigurationChecksum = hash(n.rawConfiguration);
    const f = fixture(n), { report, row } = await inspect(f), text = f.api.exportEntry(report, row.id), output = JSON.parse(text);
    assert(!text.includes('SYNTHETIC_SECRET')); assert(row.warnings.includes('CREDENTIAL_URL_OMITTED'));
    assert(!Object.hasOwn(output.configurationProjection.layout.positions, 'opaque-orphan-key'));
    assert(!Object.hasOwn(output.configurationProjection.layout.positions, '__proto__|https://example.com'));
    assert(Object.hasOwn(output.configurationProjection.layout.positions, 'auth_notes|https://example.com'));
    await assert.rejects(() => f.api.reviewRecovery(report, row.id), { code: 'RECOVERY_CREDENTIAL' }); assert.deepEqual(f.raw, f.original);
});
test('investigation export still fails ordinary and Complete imports', async () => {
    const f = fixture(), { report, row } = await inspect(f), output = JSON.parse(f.api.exportEntry(report, row.id));
    assert.throws(() => manager.validateImportPayload(output)); assert.throws(() => manager.validateCompleteBackupConfig(output));
});
test('pure gate dependency closure never requires Storage, workspace bootstrap, providers or browser APIs', async () => {
    const allowed = new Set(['./configuration-codec.js']);
    const sandbox = { module: { exports: {} }, require(name) { assert(allowed.has(name), name); return Codec; }, TextEncoder, URL, Date, Object, Set, Map, Error };
    for (const key of ['chrome', 'localStorage', 'fetch', 'document', 'StorageManager', 'WorkspaceBootstrap']) Object.defineProperty(sandbox, key, { get() { assert.fail(`Forbidden ${key}`); } });
    vm.runInNewContext(fs.readFileSync(require.resolve('../shared/recovery-file'), 'utf8'), sandbox);
    const pure = sandbox.module.exports.create({ copy: Inspector.boundedCopy, hash, maxBytes: Inspector.LIMITS.bytes });
    assert((await pure.build(selected(recovery()), NOW)).text);
});

test('final serialized values cannot silently convert negative-zero coordinates', async () => {
    for (const schema of [1, 2]) {
        const c = configuration(schema);
        if (schema === 1) c.layout.positions['opaque-orphan-key'].x = -0;
        else c.layout.positionsById[id(1)].all.x = -0;
        const n = recovery(); n.rawConfiguration = c; n.rawConfigurationChecksum = hash(c);
        const before = clone(n);
        await assert.rejects(() => gate().build(selected(n), NOW), { code: 'RECOVERY_REWRITE' });
        assert.deepEqual(n, before);
    }
});
test('retiring/refreshing recovery capabilities preserves the immutable investigation API', async () => {
    const f = fixture(), { report, row, review: cap } = await review(f), original = f.api.exportEntry(report, row.id);
    f.api.retireRecovery(); await f.api.inspect();
    assert.equal(f.api.exportEntry(report, row.id), original); assert(f.api.preview(report, row.id));
    assert.throws(() => f.api.exportRecovery(report, row.id, cap), { code: 'RECOVERY_STALE' });
});

test('hidden own properties/getters and symbol fields cannot disappear before strict recovery inventory', async () => {
    let calls = 0;
    for (const location of ['raw', 'nested', 'container']) for (const kind of ['value', 'getter', 'symbol']) {
        const n = recovery(), target = location === 'raw' ? n.rawConfiguration : location === 'nested' ? n.rawConfiguration.layout.positions['opaque-orphan-key'] : n;
        if (kind === 'symbol') target[Symbol('hidden')] = 'SYNTHETIC_PRIVATE';
        else Object.defineProperty(target, 'hidden', kind === 'getter' ? { get() { calls++; return 'SYNTHETIC_PRIVATE'; } } : { value: 'SYNTHETIC_PRIVATE' });
        // The synthetic backend deliberately returns original object descriptors;
        // structuredClone would erase the counterexample before inspection.
        const f = fixture(); f.hooks.get = keys => keys.includes(Inspector.KEYS.restore) ? { [Inspector.KEYS.restore]: n } : {};
        const { report, row } = await inspect(f); assert(f.api.exportEntry(report, row.id));
        await assert.rejects(() => f.api.reviewRecovery(report, row.id), { code: 'RECOVERY_FIELDS' });
        if (location !== 'container') {
            const sibling = report.entries.find(entry => entry.source.representation === 'portable');
            assert(await f.api.reviewRecovery(report, sibling.id));
        }
        if (location !== 'container') await assert.rejects(() => gate().build(selected(n), NOW), { code: 'RECOVERY_FIELDS' });
    }
    assert.equal(calls, 0);
});
test('nonplain array prototypes are investigation text only, never strict recovery admission', async () => {
    class UnexpectedArray extends Array {}
    const n = recovery(); Object.setPrototypeOf(n.rawConfiguration.links, UnexpectedArray.prototype);
    const f = fixture(); f.hooks.get = keys => keys.includes(Inspector.KEYS.restore) ? { [Inspector.KEYS.restore]: n } : {};
    const { report, row } = await inspect(f); assert(f.api.exportEntry(report, row.id));
    await assert.rejects(() => f.api.reviewRecovery(report, row.id), { code: 'RECOVERY_FIELDS' });
});

for (const suffix of ['user%3ASECRET%40private', 'https%3A%2F%2Fuser%3ASECRET%40private', 'https://safe.example/|user%3ASECRET%40private', 'https://safe.example/|https%3A%2F%2Fuser%3ASECRET%40private']) test('credential authority encoding in any position segment cannot bypass review or investigation privacy', async () => {
    const n = recovery(), key = 'all|' + suffix;
    n.rawConfiguration.layout.positions[key] = { x: 1, y: 2 }; n.rawConfigurationChecksum = hash(n.rawConfiguration);
    const f = fixture(n), { report, row } = await inspect(f);
    assert(!f.api.exportEntry(report, row.id).includes('SECRET'));
    await assert.rejects(() => f.api.reviewRecovery(report, row.id), { code: 'RECOVERY_CREDENTIAL' });
    assert.deepEqual(f.raw, f.original);
});
test('hidden malformed sibling and previous chain do not poison independently safe selected raw representation', async () => {
    const n = recovery(); n.previousRecovery = recovery();
    Object.defineProperty(n.payload.data, 'hidden', { get() { assert.fail('Getter must not run'); } });
    Object.defineProperty(n.previousRecovery.rawConfiguration, 'hidden', { value: 'SYNTHETIC_PRIVATE' });
    const f = fixture(); f.hooks.get = keys => keys.includes(Inspector.KEYS.restore) ? { [Inspector.KEYS.restore]: n } : {};
    const { report, row } = await inspect(f), cap = await f.api.reviewRecovery(report, row.id);
    assert(f.api.exportRecovery(report, row.id, cap));
    assert(Object.getOwnPropertyDescriptor(n.payload.data, 'hidden').get);
    assert.equal(Object.getOwnPropertyDescriptor(n.previousRecovery.rawConfiguration, 'hidden').value, 'SYNTHETIC_PRIVATE');
});

test('absent raw schema marker derives only coherent saved identities without allocating IDs', async () => {
    for (const schema of [1, 2]) {
        const c = configuration(schema); delete c.schemaVersion;
        const n = recovery(c), f = fixture(n), { report, row, review: cap } = await review(f);
        assert.equal(cap.schemaVersion, schema); const output = JSON.parse(f.api.exportRecovery(report, row.id, cap));
        assert.equal(output.schemaVersion, schema); assert.deepEqual(output.data.links, c.links); assert.deepEqual(output.data.layout, c.layout);
    }
});
test('coherent schema-2 mixed independent identities are preserved, including orphan IDs and duplicate legacy maps', async () => {
    const c = configuration(2); delete c.links[1].layoutId; delete c.links[2].layoutId;
    const n = recovery(c), f = fixture(n), { report, row, review: cap } = await review(f);
    const output = JSON.parse(f.api.exportRecovery(report, row.id, cap)); assert.deepEqual(manager.validateImportPayload(output).links, c.links);
    assert.deepEqual(output.data.layout, c.layout);
});
test('unexpected review dependency failures surface only the fixed unavailable code', async () => {
    let fail = false;
    const f = fixture(recovery(), { now() { if (fail) throw null; return NOW; } });
    const { report, row } = await inspect(f); fail = true;
    await assert.rejects(() => f.api.reviewRecovery(report, row.id), { code: 'RECOVERY_UNAVAILABLE', message: 'Recovery inspection unavailable.' });
});
