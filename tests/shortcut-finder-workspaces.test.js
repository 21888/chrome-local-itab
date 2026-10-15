'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { fixture, W, F, clone, id } = require('./helpers/finder-workspaces-fixture');
const Prompts = require('../shared/local-prompts-store');
const Collections = require('../shared/local-ai-collections-store');
function resolved(f) {
    f.raw[W.LEGACY_CONFLICT_KEY] = { schemaVersion: 1, id: 'reviewed', detectedAt: '2026-10-15T00:00:00.000Z', keys: ['links'],
        resolvedAt: '2026-10-15T00:01:00.000Z', baseline: Object.fromEntries(W.SCOPED_KEYS.filter(key => Object.hasOwn(f.raw, key)).map(key => [key, clone(f.raw[key])])), recoveryKey: W.LEGACY_RECOVERY_PREFIX + 'recovery' };
}
function journal(f, status = 'verified') {
    f.raw[W.RESTORE_TRANSACTION_KEY] = { schemaVersion: 1, id: 'restore', createdAt: '2026-10-15T00:00:00.000Z', status,
        prior: { [W.REGISTRY_KEY]: clone(f.raw[W.REGISTRY_KEY]), [W.PROMPTS_KEY]: Prompts.initial(), [W.COLLECTIONS_KEY]: Collections.initial() },
        next: { [W.REGISTRY_KEY]: clone(f.raw[W.REGISTRY_KEY]), [W.PROMPTS_KEY]: Prompts.initial(), [W.COLLECTIONS_KEY]: Collections.initial() },
        recoveryKey: '__localItabCompleteRecoveryV2', recoveryChecksum: 'a'.repeat(64), priorWorkspaceDigest: 'b'.repeat(64) };
}
async function rejects(change, direct = false) {
    const f = await fixture(); if (direct) f.directReads(); change(f);
    await assert.rejects(f.reader.scan(), error => error.message === 'Finder workspaces: UNAVAILABLE');
    assert.equal(f.calls.writers + f.calls.manager, 0); f.reader.stop();
}
test('production-created normal session, named and genuinely empty workspace scan fixed keys only without writes', async () => {
    const f = await fixture(), before = JSON.stringify(f.raw);
    assert.equal(f.listeners.size, 0, 'reader construction does not subscribe');
    const snapshot = await f.reader.scan();
    assert.equal(snapshot.workspaces, 3); assert.equal(snapshot.links.length, 2);
    assert.equal(f.listeners.size, 1); assert.equal(new Set(F.CONTROL_KEYS).size, 30); assert.equal(F.LEGACY_KEYS.length, 27);
    const allowed = new Set([...F.CONTROL_KEYS, ...f.raw[W.REGISTRY_KEY].workspaces.map(W.bundleKey)]);
    for (const keys of [...f.calls.get, ...f.calls.bytes]) { assert(keys.length); assert(keys.every(key => allowed.has(key))); }
    assert.deepEqual(f.calls.get.filter(keys => keys.length === 30), [[...F.CONTROL_KEYS], [...F.CONTROL_KEYS]]);
    assert.deepEqual(f.calls.locks, F.LOCKS.map(name => [name, 'exclusive']));
    assert.equal(JSON.stringify(f.raw), before); assert.equal(f.calls.writers + f.calls.manager, 0); f.reader.stop(); assert.equal(f.listeners.size, 0);
});
test('active named/default bundles, no Trash/orphan/prior bundle scans and no legacy-root fallback', async () => {
    const f = await fixture();
    const entry = { ...f.empty, id: 'trash', generation: 'old', order: 3, deletedAt: '2026-10-15T00:00:00.000Z' };
    f.raw[W.REGISTRY_KEY].workspaces.push(entry); f.raw[W.bundleKey(entry)] = { private: 'SYNTHETIC_PRIVATE_TRASH' };
    f.raw[W.PREFIX + 'orphan:old'] = { private: 'SYNTHETIC_PRIVATE_ORPHAN' };
    f.defaultValues().links[0].title = 'Bundle title';
    const snapshot = await f.reader.scan();
    assert.equal(snapshot.links[0].title, 'Bundle title'); assert(!f.calls.get.flat().includes(W.bundleKey(entry))); assert(!JSON.stringify(snapshot).includes('SYNTHETIC_PRIVATE'));
    f.reader.stop();
});
test('privacy projection strips all incidental private fields, errors, icons and serialized tokens', async () => {
    const f = await fixture();
    f.defaultValues().__localItabScratchpadV1 = { content: 'SYNTHETIC_PRIVATE_NOTE' };
    f.defaultValues().__localItabRestoreRecovery = { data: 'SYNTHETIC_PRIVATE_RECOVERY' };
    f.defaultValues().links[0].icon = 'SYNTHETIC_PRIVATE_ICON';
    f.raw[W.SNAPSHOT_KEY].values.extraPrivate = { private: 'SYNTHETIC_PRIVATE_SNAPSHOT' };
    journal(f); // The journal can contain global prompt/collection bodies, only headers/validation are used.
    f.raw[W.RESTORE_TRANSACTION_KEY].prior[W.REGISTRY_KEY].workspaces[0].name = 'SYNTHETIC_PRIVATE_JOURNAL';
    const before = JSON.stringify(f.raw), snapshot = await f.reader.scan();
    assert(!JSON.stringify(snapshot).includes('SYNTHETIC_PRIVATE')); assert.deepEqual(Object.keys(snapshot.links[0].finderToken), []);
    let opened; assert.equal(await f.reader.activate(snapshot.links[0].finderToken, record => { opened = record; return true; }), 'opened');
    assert.deepEqual(Object.keys(opened), ['url']); assert.equal(JSON.stringify(f.raw), before); assert.equal(f.calls.writers + f.calls.manager, 0);
    f.reader.stop();
});
test('legitimate resolved conflict and terminal verified/recovered journal are admitted; exact production legacy comparison still rejects edits', async () => {
    for (const status of ['verified', 'recovered']) {
        const f = await fixture(); resolved(f); journal(f, status);
        assert.equal((await f.reader.scan()).links.length, 2);
        f.raw.links[0].title = 'Silent old-page write'; await assert.rejects(f.reader.scan()); f.reader.stop();
    }
});
test('four independently reproduced permissive baseline acceptances now fail closed before permissive validators', async () => {
    await rejects(f => { f.raw[W.LEGACY_CONFLICT_KEY] = { schemaVersion: 99, resolvedAt: true, baseline: clone(f.raw[W.SNAPSHOT_KEY].values) }; });
    await rejects(f => { f.raw[W.SNAPSHOT_KEY] = { schemaVersion: 1, values: clone(f.raw[W.SNAPSHOT_KEY].values) }; });
    await rejects(f => { Object.defineProperty(f.raw[W.SNAPSHOT_KEY], 'future', { value: 1, enumerable: false }); }, true);
    await rejects(f => { f.raw[W.RESTORE_TRANSACTION_KEY] = { schemaVersion: 1, id: 'journal', status: 'verified', future: true }; });
});
test('strict raw descriptors, hidden/symbol/prototype keys, sparse/cyclic/deep values and unknown headers never invoke accessors', async () => {
    let getter = 0;
    const mutations = [
        f => Object.defineProperty(f.raw[W.SNAPSHOT_KEY], 'values', { enumerable: true, get() { getter++; throw Error('SYNTHETIC_PRIVATE_GETTER'); } }),
        f => Object.defineProperty(f.defaultValues().links[0], 'hidden', { value: 1 }),
        f => { f.defaultValues().links[0][Symbol('private')] = 1; },
        f => Object.defineProperty(f.defaultValues().links[0], '__proto__', { value: {}, enumerable: true }),
        f => { f.defaultValues().links[0].constructor = 'pollution'; },
        f => { Object.setPrototypeOf(f.defaultValues().links[0], { inherited: 'bad' }); },
        f => { f.defaultValues().links.length = 3; },
        f => { f.defaultValues().links[0].cycle = f.defaultValues(); },
        f => { let value = {}; for (let i = 0; i < 45; i++) value = { value }; f.defaultValues().quote = value; },
        f => { f.raw[W.REGISTRY_KEY].future = 1; },
        f => { f.raw[W.ACTIVATION_KEY].future = 1; },
        f => { f.raw[W.SNAPSHOT_KEY].future = 1; },
        f => { resolved(f); f.raw[W.LEGACY_CONFLICT_KEY].future = 1; },
        f => { journal(f); f.raw[W.RESTORE_TRANSACTION_KEY].future = 1; },
        f => { f.raw[W.bundleKey(f.named)].future = 1; },
        f => { f.namedValues().future = 1; }
    ];
    for (const mutate of mutations) await rejects(mutate, true);
    assert.equal(getter, 0);
});
test('schema, identity, missing data, conflicting/pending/future markers and malformed known headers fail closed', async () => {
    const mutations = [
        f => delete f.raw[W.REGISTRY_KEY], f => delete f.raw[W.ACTIVATION_KEY], f => delete f.raw[W.SNAPSHOT_KEY],
        f => { f.raw[W.SNAPSHOT_KEY].id = 'different_lineage'; }, f => { f.raw[W.SNAPSHOT_KEY].createdAt = 'invalid'; },
        f => { f.raw[W.REGISTRY_KEY].workspaces.push(clone(f.named)); },
        f => { f.raw[W.ACTIVATION_KEY].schemaVersion = 2; }, f => { f.raw[W.SNAPSHOT_KEY].schemaVersion = 2; },
        f => { f.raw[W.LEGACY_CONFLICT_KEY] = { schemaVersion: 1, id: 'pending', detectedAt: '2026-10-15T00:00:00Z', keys: ['links'] }; },
        f => { resolved(f); f.raw[W.LEGACY_CONFLICT_KEY].keys = ['sync']; },
        f => { resolved(f); f.raw[W.LEGACY_CONFLICT_KEY].resolvedAt = true; },
        f => { resolved(f); f.raw[W.LEGACY_CONFLICT_KEY].baseline = null; },
        f => { journal(f, 'prepared'); }, f => { journal(f, 'submitted'); }, f => { journal(f, 'future'); },
        f => { journal(f); f.raw[W.RESTORE_TRANSACTION_KEY].schemaVersion = 2; },
        f => { journal(f); f.raw[W.RESTORE_TRANSACTION_KEY].next.future = {}; },
        f => delete f.raw[W.bundleKey(f.named)], f => { f.namedValues().links = null; }, f => { f.namedValues().categories = null; },
        f => { f.raw[W.bundleKey(f.named)].generation = 'wrong'; }, f => { f.raw[W.bundleKey(f.named)].schemaVersion = 2; },
        f => { f.namedValues().schemaVersion = 3; }, f => { f.namedValues().schemaVersion = null; }, f => { f.namedValues().schemaVersion = '2'; },
        f => { f.namedValues().__localItabLayoutGeneration = null; }, f => { f.namedValues().__localItabSettingsGeneration = ''; },
        f => { f.namedValues().links.push({ ...f.namedValues().links[0], layoutId: id(1) }); f.namedValues().links[0].layoutId = id(1); }
    ];
    for (const mutate of mutations) await rejects(mutate);
    for (const version of [undefined, 1, 2]) { const f = await fixture(); if (version !== undefined) f.namedValues().schemaVersion = version; assert.equal((await f.reader.scan()).links.length, 2); f.reader.stop(); }
});
test('copied layout IDs and category IDs across workspaces remain distinct, strict saved destination opens under all locks', async () => {
    const f = await fixture(); f.defaultValues().links[0].layoutId = f.namedValues().links[0].layoutId = id(1);
    f.defaultValues().links[0].url = 'https://default.test/'; f.namedValues().links[0].url = 'https://named.test/';
    const snapshot = await f.reader.scan(); assert.notEqual(snapshot.links[0].category, snapshot.links[1].category);
    assert(snapshot.categories.every(cat => cat.label.includes(' · ')));
    for (const row of snapshot.links) {
        let opened = 0;
        assert.equal(await f.reader.activate(row.finderToken, record => { assert.deepEqual(f.calls.held, [...F.LOCKS]); assert.equal(record.url, row.url); opened++; return true; }), 'opened'); assert.equal(opened, 1);
    }
    assert.equal(f.calls.writers + f.calls.manager, 0); f.reader.stop();
});
test('every opening repeats full admission and refuses silent target/lineage/fence/source changes', async () => {
    const mutations = [
        f => { f.namedValues().links[0].title = 'Edited'; }, f => { f.namedValues().links[0].url = 'https://changed.test/'; },
        f => { f.namedValues().links = []; }, f => { f.namedValues().categories[0].name = 'Changed'; },
        f => { f.namedValues().__localItabLayoutGeneration = 'layout'; }, f => { f.namedValues().__localItabSettingsGeneration = 'settings'; },
        f => { f.raw[W.REGISTRY_KEY].workspaces.find(entry => entry.id === f.named.id).deletedAt = '2026-10-15T00:00:00Z'; },
        f => { f.raw[W.REGISTRY_KEY].workspaces.find(entry => entry.id === f.named.id).generation = 'other'; },
        f => { f.raw.links[0].title = 'Silent root change'; }, f => { delete f.raw.categories; },
        f => { journal(f, 'submitted'); },
        f => { for (const key of [W.REGISTRY_KEY, W.ACTIVATION_KEY]) f.raw[key].migrationId = 'replacement_lineage'; f.raw[W.SNAPSHOT_KEY].id = 'replacement_lineage'; },
        f => { f.session.invalidated = true; }
    ];
    for (const mutate of mutations) {
        const f = await fixture(); f.namedValues().links[0].layoutId = id(1); const snapshot = await f.reader.scan(); mutate(f);
        let opened = 0; assert.notEqual(await f.reader.activate(snapshot.links[1].finderToken, () => { opened++; return true; }), 'opened'); assert.equal(opened, 0); f.reader.stop();
    }
});
test('legacy tokens require the unchanged per-workspace sequence; duplicate URLs are refused only inside their workspace', async () => {
    const f = await fixture(); f.namedValues().links[0].url = f.defaultValues().links[0].url;
    let snapshot = await f.reader.scan(); assert.equal(await f.reader.activate(snapshot.links[1].finderToken, () => true), 'opened');
    f.namedValues().links.push({ ...f.namedValues().links[0] }); snapshot = await f.reader.scan();
    assert.equal(await f.reader.activate(snapshot.links[1].finderToken, () => true), 'stale');
    f.namedValues().links[1].url = 'https://unique.test/'; snapshot = await f.reader.scan(); f.namedValues().links.reverse();
    assert.equal(await f.reader.activate(snapshot.links[1].finderToken, () => true), 'stale'); f.reader.stop();
});
test('unsafe raw saved spellings never open or get repaired', async () => {
    for (const url of [' javascript:alert(1)', 'https://x.test/\\path', 'https://x.test/\npath', 'https://x.test/%zz', '//example.test/', 'HTTPS://EXAMPLE.TEST']) {
        const f = await fixture(); f.namedValues().links[0].url = url; const snapshot = await f.reader.scan();
        let opened = 0; assert.equal(await f.reader.activate(snapshot.links[1].finderToken, () => { opened++; return true; }), 'stale'); assert.equal(opened, 0); assert.equal(f.namedValues().links[0].url, url); f.reader.stop();
    }
});
test('every native await injection sees silent legacy edits, retired session/metadata and prepared restore before opening', async () => {
    const base = await fixture(); const snap = await base.reader.scan(); const trace = []; base.hook((type, keys) => trace.push({ type, keys: [...keys] }));
    assert.equal(await base.reader.activate(snap.links[1].finderToken, () => true), 'opened'); base.reader.stop();
    const mutations = [
        f => { f.raw.links[0].title = 'Silent mutation'; },
        f => { f.raw[W.ACTIVATION_KEY].migrationId = 'retired'; },
        f => { f.raw[W.REGISTRY_KEY].workspaces.find(entry => entry.id === f.named.id).deletedAt = '2026-10-15T00:00:00Z'; },
        f => { f.raw[W.REGISTRY_KEY].workspaces.find(entry => entry.id === f.named.id).generation = 'replaced'; },
        f => { journal(f, 'prepared'); }
    ];
    for (let at = 0; at < trace.length; at++) for (const mutate of mutations) {
        const f = await fixture(); const snapshot = await f.reader.scan(); let count = 0, opened = 0;
        f.hook(() => { if (count++ === at) mutate(f); });
        assert.notEqual(await f.reader.activate(snapshot.links[1].finderToken, () => { opened++; return true; }), 'opened', `await ${at} ${trace[at].type}`);
        assert.equal(opened, 0); assert.equal(f.calls.writers + f.calls.manager, 0); f.reader.stop();
    }
});
test('late events, relevant Stage/control/bundle changes, cancellation and hidden page retire ownership', async () => {
    for (const key of [...F.CONTROL_KEYS, W.STAGE_KEY, W.bundleKey((await fixture()).named)]) {
        const f = await fixture(); const snapshot = await f.reader.scan(); f.emit(key);
        assert.equal(f.reader.isCurrent(snapshot), false); assert.equal(await f.reader.activate(snapshot.links[0].finderToken, () => true), 'stale'); f.reader.stop();
    }
    const f = await fixture(); const snapshot = await f.reader.scan(); f.emit('sync'); f.emit('links', 'sync'); assert(f.reader.isCurrent(snapshot));
    let active = true, opened = 0; f.hook(() => { active = false; });
    assert.equal(await f.reader.activate(snapshot.links[0].finderToken, () => { opened++; return true; }, () => active), 'cancelled'); assert.equal(opened, 0);
    f.hook(null); f.visible(false); await assert.rejects(f.reader.scan()); f.reader.stop();
});
test('missing locks/session, readyExisting-only session and read/preflight failures are unavailable with no fallback', async () => {
    for (const change of [f => { f.locks.request = null; }, f => { f.session._identity = null; }, f => { f.session._existingOnly = true; },
        f => { f.local.get = async () => { throw Error('SYNTHETIC_PRIVATE_IO'); }; }, f => { f.local.getBytesInUse = async () => { throw Error('SYNTHETIC_PRIVATE_BYTES'); }; },
        f => { f.local.getBytesInUse = undefined; }]) await rejects(change);
});
test('raw and projected limits are explicit; oversize after a cheap preflight still refuses; ordinary image-heavy bundles stay usable', async () => {
    await rejects(f => { f.local.getBytesInUse = async () => F.LIMITS.rawBytes + 1; });
    await rejects(f => { f.namedValues().quote = 'x'.repeat(F.LIMITS.rawBytes + 1); });
    await rejects(f => { f.namedValues().links = Array.from({ length: F.LIMITS.links + 1 }, (_, i) => ({ title: `${i}`, url: `https://e.test/${i}` })); });
    await rejects(f => { f.namedValues().categories = Array.from({ length: F.LIMITS.categories + 1 }, (_, i) => ({ id: `${i}`, name: `${i}` })); });
    await rejects(f => { f.namedValues().links = Array.from({ length: 1200 }, (_, i) => ({ title: 'x'.repeat(8192), url: `https://e.test/${i}` })); });
    const f = await fixture(); f.namedValues().bg = { data: 'data:image/png;base64,' + 'A'.repeat(10 * 1024 * 1024) };
    const before = JSON.stringify(f.raw), snapshot = await f.reader.scan(); assert.equal(snapshot.links.length, 2); assert(JSON.stringify(snapshot).length < 5000); assert.equal(JSON.stringify(f.raw), before); f.reader.stop();
});
test('open callback is synchronous and never assimilates an unknown thenable', async () => {
    const f = await fixture(), snapshot = await f.reader.scan(); let then = 0;
    const value = Object.defineProperty({}, 'then', { get() { then++; throw Error('Unexpected thenable'); } });
    assert.equal(await f.reader.activate(snapshot.links[0].finderToken, () => value), 'blocked'); assert.equal(then, 0); f.reader.stop();
});
test('credential-bearing or disguised authorities refuse the entire All snapshot without reflecting secrets; ordinary query parameters stay literal', async () => {
    for (const url of [
        'https://SYNTHETIC_PRIVATE_USER:SYNTHETIC_PRIVATE_PASSWORD@example.test/', 'https://SYNTHETIC_PRIVATE_USER@example.test/',
        'https://%53YNTHETIC_PRIVATE_USER:%70assword@example.test/', 'https://SYNTHETIC_PRIVATE_USER%3Apass%40example.test/',
        'HTTPS://SYNTHETIC_PRIVATE_USER:pass@example.test/', 'https:\\SYNTHETIC_PRIVATE_USER:pass@example.test/',
        'h\tttps://SYNTHETIC_PRIVATE_USER:pass@example.test/', 'https%3A%2F%2FSYNTHETIC_PRIVATE_USER%3Apass%40example.test/'
    ]) {
        const f = await fixture(); f.namedValues().links[0].url = url; const before = JSON.stringify(f.raw);
        await assert.rejects(f.reader.scan(), error => !String(error).includes('SYNTHETIC_PRIVATE') && error.code === 'FINDER_UNAVAILABLE');
        assert.equal(JSON.stringify(f.raw), before); f.reader.stop();
    }
    const f = await fixture(); f.namedValues().links[0].url = 'https://example.test/path@name?token=ordinary&email=a%40b.test';
    const snapshot = await f.reader.scan(); assert.equal(snapshot.links[1].url, f.namedValues().links[0].url); f.reader.stop();
});
test('scan result identity is rechecked synchronously before host adoption after a silent session retirement', async () => {
    const f = await fixture(), snapshot = await f.reader.scan(); assert(f.reader.isCurrent(snapshot));
    f.session.invalidated = true; assert.equal(f.reader.isCurrent(snapshot), false); f.reader.stop();
});
test('Current ignores an unrelated saved category label exactly as before; All explicitly uses composite labels', () => {
    const { Controller } = require('../shared/shortcut-finder');
    const source = { links: [{ title: 'Site', url: 'https://example.test/', category: 'work' }], categories: [{ id: 'work', name: 'Work', label: 'Unrelated private label' }] };
    const controller = new Controller({ getSnapshot: () => source });
    assert.equal(controller.search('Site').categoryOptions[0].name, 'Work');
    source.scope = 'all'; assert.equal(controller.search('Site').categoryOptions[0].name, 'Unrelated private label');
});
test('maximum supported 100 workspaces, 20,000 links and 10,000 categories are complete and paged without truncation', async () => {
    const f = await fixture(); f.defaultValues().links = []; f.defaultValues().categories = [];
    f.namedValues().links = Array.from({ length: F.LIMITS.links }, (_, i) => ({ title: `Synthetic site ${i}`, url: `https://example.test/${i}`, category: 'work', layoutId: id(i + 1) }));
    f.namedValues().categories = Array.from({ length: F.LIMITS.categories }, (_, i) => ({ id: i ? `cat_${i}` : 'work', name: `Category ${i}` }));
    for (let i = 3; i < 100; i++) {
        const entry = { ...f.empty, id: `cap_${i}`, generation: `cap_generation_${i}`, order: i, name: `Empty ${i}` };
        f.raw[W.REGISTRY_KEY].workspaces.push(entry);
        f.raw[W.bundleKey(entry)] = { schemaVersion: 1, id: entry.id, generation: entry.generation, values: {} };
    }
    const snapshot = await f.reader.scan(); assert.equal(snapshot.workspaces, 100); assert.equal(snapshot.links.length, 20000); assert.equal(snapshot.categories.length, 10000);
    const { Controller } = require('../shared/shortcut-finder'); const controller = new Controller({ getSnapshot: () => snapshot });
    const page = controller.search('Synthetic site', 399); assert.equal(page.total, 20000); assert.equal(page.rows.length, 50); assert.equal(page.rows.at(-1).title, 'Synthetic site 19999'); assert.equal(page.hasNext, false);
    assert.equal(await f.reader.activate(snapshot.links.at(-1).finderToken, record => record.url === 'https://example.test/19999'), 'opened');
    assert.equal(f.calls.writers + f.calls.manager, 0); f.reader.stop();
});
test('raw 64 MiB budget is cumulative across live bundles, not just a per-value limit', async () => {
    await rejects(f => { const half = 'A'.repeat(32 * 1024 * 1024); f.defaultValues().quote = half; f.namedValues().quote = half; });
});
test('activation-only visibility proof never widens scan or snapshot adoption visibility', async () => {
    const f = await fixture(); let sourceVisible = true, ownedBlankVisible = false;
    const reader = F.createReader({ local: f.local, locks: f.locks, changes: f.changes, getSession: () => f.session,
        isVisible: () => sourceVisible, isActivationVisible: () => sourceVisible || ownedBlankVisible });
    const snapshot = await reader.scan(); sourceVisible = false; ownedBlankVisible = true;
    assert.equal(reader.isCurrent(snapshot), false); assert.equal(await reader.activate(snapshot.links[0].finderToken, () => true), 'opened');
    await assert.rejects(reader.scan()); ownedBlankVisible = false;
    assert.equal(await reader.activate(snapshot.links[0].finderToken, () => true), 'cancelled'); reader.stop();
});
