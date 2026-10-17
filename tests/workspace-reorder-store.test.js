/* Synthetic local storage and serialized locks; no real profile or providers. */
const test = require('node:test');
const assert = require('node:assert/strict');
const Workspaces = require('../shared/workspaces.js');

test('workspace reorder: exposes an adjacent move operation', () => {
    assert.equal(typeof Workspaces.createManager({}).move, 'function');
});

const Focus = require('../shared/local-focus-store.js');
const REGISTRY = '__localItabWorkspaceRegistryV1', PREFIX = '__localItabWorkspaceV1:';
const RESTORE = '__localItabCombinedRestoreV1';
const OLD = '2026-10-10T12:00:00.000Z', NOW = '2026-10-17T11:00:00.000Z';
const clone = value => structuredClone(value);
const rejects = code => error => error?.code === 'WORKSPACE_' + code;
const entry = (id, order, deletedAt = null) => ({ id, name: id === 'default' ? 'Default' : 'Twin 🧭', order, generation: 'g-' + id, createdAt: OLD, updatedAt: OLD, deletedAt });
function fixture({ solo = false } = {}) {
    const entries = [entry('b', 90), entry('trash', 40, OLD), entry('default', 10), entry('a', 60)];
    const workspaces = solo ? entries.filter(item => ['trash', 'default'].includes(item.id)) : entries;
    const raw = {
        [REGISTRY]: { schemaVersion: 1, revision: 7, defaultId: 'default', lastUsedId: solo ? 'default' : 'a', migrationId: 'migration-1', workspaces },
        __localItabWorkspaceActivationV1: { schemaVersion: 1, migrationId: 'migration-1', defaultId: 'default' },
        __localItabWorkspacePreMigrationV1: { schemaVersion: 1, id: 'migration-1', createdAt: OLD, values: {} },
        privacy: { synthetic: true }, __localItabPersonalPromptsV1: { synthetic: 'unchanged global' }
    };
    for (const item of workspaces) {
        const focus = Focus.initial();
        if (!item.deletedAt) focus.session = { id: 'synthetic-running', phase: 'focus', status: 'running', remainingMs: 1500000, startedAt: Date.parse(OLD), deadline: Date.parse(OLD) + 1500000 };
        raw[PREFIX + item.id + ':' + item.generation] = { schemaVersion: 1, id: item.id, generation: item.generation, values: {
            [Focus.KEY]: focus, __localItabScratchpadV1: { schemaVersion: 1, revision: 0, enabled: true, content: 'Synthetic saved note ' + item.id },
            __localItabRestoreRecovery: { synthetic: ['retained', item.id] }
        } };
    }
    const writes = [], reads = [], lockNames = [], providers = [], hooks = {}, queues = new Map(), listeners = new Set();
    const extract = keys => clone(keys == null ? raw : Object.fromEntries((typeof keys === 'string' ? [keys] : keys).filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]])));
    const local = {
        async get(keys) { reads.push(clone(keys)); if (hooks.get) { const value = await hooks.get(keys); if (value !== undefined) return value; } return extract(keys); },
        async set(values) { writes.push(clone(values)); if (hooks.set) return hooks.set(values); Object.assign(raw, clone(values)); },
        async remove() { throw new Error('Unexpected storage removal'); }
    };
    const locks = { request(name, options, action) {
        action ||= options; lockNames.push(name);
        const next = (queues.get(name) || Promise.resolve()).then(action); queues.set(name, next.catch(() => {})); return next;
    } };
    const forbidden = name => () => { providers.push(name); throw new Error('Unexpected provider: ' + name); };
    const chrome = { storage: { local, sync: { get: forbidden('sync.get'), set: forbidden('sync.set') }, onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) } }, identity: { getAuthToken: forbidden('identity') }, permissions: { request: forbidden('permissions') } };
    let serial = 0, clocks = 0;
    const manager = () => Workspaces.createManager({ chrome, locks, now: () => { clocks++; return NOW; }, id: () => 'new-' + ++serial });
    return { raw, writes, reads, hooks, providers, lockNames, extract, manager, clocks: () => clocks, registry: () => raw[REGISTRY],
        notify(changes) { for (const listener of listeners) listener(clone(changes), 'local'); },
        reset() { writes.length = reads.length = lockNames.length = 0; clocks = 0; } };
}
const activeIds = registry => registry.workspaces.filter(item => item.deletedAt === null).sort((a, b) => a.order - b.order).map(item => item.id);
function expectOnlySwap(before, after, first, second) {
    const expected = clone(before), registry = expected[REGISTRY];
    const a = registry.workspaces.find(item => item.id === first), b = registry.workspaces.find(item => item.id === second);
    [a.order, b.order] = [b.order, a.order]; a.updatedAt = b.updatedAt = NOW; registry.revision++;
    assert.deepEqual(after, expected);
}

for (const [id, direction, neighbor, order] of [
    ['a', 'up', 'default', ['a', 'default', 'b']], ['a', 'down', 'b', ['default', 'b', 'a']],
    ['default', 'down', 'a', ['a', 'default', 'b']], ['b', 'up', 'a', ['default', 'b', 'a']]
]) test(`workspace reorder: ${id} ${direction} swaps only active neighbor ${neighbor}`, async () => {
    const f = fixture(), manager = f.manager(); await manager.ready(); const before = clone(f.raw); f.reset();
    const result = await manager.move(id, direction, { expectedRevision: 7 });
    expectOnlySwap(before, f.raw, id, neighbor);
    assert.deepEqual(activeIds(f.registry()), order); assert.equal(result.id, id);
    assert.equal(f.writes.length, 1); assert.deepEqual(Object.keys(f.writes[0]), [REGISTRY]); assert.equal(f.clocks(), 1);
    result.name = 'detached'; assert.notEqual(f.registry().workspaces.find(item => item.id === id).name, 'detached');
    assert.deepEqual(f.providers, []); assert(f.lockNames.every(name => name === 'local-itab-workspaces-v1'));
});

for (const [solo, id, direction] of [[false, 'default', 'up'], [false, 'b', 'down'], [true, 'default', 'up'], [true, 'default', 'down']]) test(`workspace reorder: ${solo ? 'single' : 'boundary'} ${id} ${direction} is a true no-op`, async () => {
    const f = fixture({ solo }), manager = f.manager(); await manager.ready(); const before = clone(f.raw); f.reset();
    const result = await manager.move(id, direction, { expectedRevision: 7 });
    assert.equal(result.id, id); assert.deepEqual(f.raw, before); assert.equal(f.writes.length, 0); assert.equal(f.clocks(), 0);
});

test('workspace reorder: invalid IDs and directions fail before any storage read', async () => {
    const f = fixture(), manager = f.manager();
    for (const id of [undefined, null, '', 3, {}, ['a'], '../a', 'a b', 'a'.repeat(101)]) await assert.rejects(manager.move(id, 'up'), rejects('INVALID'));
    for (const direction of [undefined, null, '', 1, -1, true, 'UP', 'Down', {}, ['up']]) await assert.rejects(manager.move('a', direction), rejects('INVALID'));
    assert.deepEqual(f.reads, []); assert.deepEqual(f.writes, []);
});

test('workspace reorder: missing and trashed identities reject without writes', async () => {
    const f = fixture(), manager = f.manager(); await manager.ready(); f.reset();
    await assert.rejects(manager.move('missing', 'up', { expectedRevision: 7 }), rejects('NOT_FOUND'));
    await assert.rejects(manager.move('trash', 'up', { expectedRevision: 7 }), rejects('DELETED'));
    assert.deepEqual(f.writes, []);
});

test('workspace reorder: stale revision rejects even at a boundary; two concurrent moves cannot both apply', async () => {
    const f = fixture(), first = f.manager(), second = f.manager(); await Promise.all([first.ready(), second.ready()]); f.reset();
    await assert.rejects(first.move('default', 'up', { expectedRevision: 6 }), rejects('CONFLICT'));
    const results = await Promise.allSettled([first.move('a', 'up', { expectedRevision: 7 }), second.move('a', 'down', { expectedRevision: 7 })]);
    assert.deepEqual(results.map(result => result.status), ['fulfilled', 'rejected']); assert.equal(results[1].reason.code, 'WORKSPACE_CONFLICT');
    assert.equal(f.writes.length, 1); assert.deepEqual(activeIds(f.registry()), ['a', 'default', 'b']);
});

for (const operation of ['create', 'trash', 'restore', 'move']) test(`workspace reorder: a concurrent ${operation} invalidates the rendered revision`, async () => {
    const f = fixture(), manager = f.manager(), other = f.manager(); await Promise.all([manager.ready(), other.ready()]);
    if (operation === 'create') await other.create('Fresh');
    if (operation === 'trash') await other.trash('b');
    if (operation === 'restore') await other.restore('trash');
    if (operation === 'move') await other.move('b', 'up');
    const before = clone(f.raw); f.reset();
    await assert.rejects(manager.move('a', 'up', { expectedRevision: 7 }), rejects('CONFLICT'));
    assert.deepEqual(f.raw, before); assert.deepEqual(f.writes, []);
});

for (const status of ['prepared', 'submitted']) test(`workspace reorder: ${status} restore fence blocks moves and no-ops`, async () => {
    const f = fixture(), manager = f.manager(); await manager.ready();
    f.raw[RESTORE] = { schemaVersion: 1, id: 'restore-test', status }; f.reset(); const before = clone(f.raw);
    await assert.rejects(manager.move('a', 'up', { expectedRevision: 7 }), rejects('RESTORE_PENDING'));
    await assert.rejects(manager.move('default', 'up', { expectedRevision: 7 }), rejects('RESTORE_PENDING'));
    assert.deepEqual(f.raw, before); assert.deepEqual(f.writes, []);
});

test('workspace reorder: commit rechecks a restore fence that appeared after the transaction check', async () => {
    const f = fixture(), manager = f.manager(); await manager.ready(); f.reset(); let checks = 0;
    f.hooks.get = keys => { if (keys.length === 1 && keys[0] === RESTORE && ++checks === 2) f.raw[RESTORE] = { schemaVersion: 1, id: 'restore-test', status: 'prepared' }; };
    await assert.rejects(manager.move('a', 'up', { expectedRevision: 7 }), rejects('RESTORE_PENDING'));
    assert.equal(f.registry().revision, 7); assert.deepEqual(f.writes, []);
});

for (const mode of ['throw-before', 'false', 'drop', 'throw-after', 'verify-read', 'verify-mismatch']) test(`workspace reorder: ${mode} fails closed and never repeats a relative move`, async () => {
    const f = fixture(), manager = f.manager(); await manager.ready(); f.reset(); const before = clone(f.raw); let submitted = false;
    f.hooks.set = values => {
        if (mode === 'throw-before') throw new Error('Synthetic write failure');
        if (mode === 'false') return false;
        if (mode === 'drop') return;
        Object.assign(f.raw, clone(values)); submitted = true;
        if (mode === 'throw-after') throw new Error('Synthetic lost acknowledgement');
    };
    f.hooks.get = keys => {
        if (submitted && keys.length === 1 && keys[0] === REGISTRY) {
            if (mode === 'verify-read') throw new Error('Synthetic read failure');
            if (mode === 'verify-mismatch') return { [REGISTRY]: clone(before[REGISTRY]) };
        }
    };
    await assert.rejects(manager.move('a', 'up', { expectedRevision: 7 }));
    assert.equal(f.writes.length, 1);
    if (submitted) expectOnlySwap(before, f.raw, 'a', 'default'); else assert.deepEqual(f.raw, before);
    f.hooks.get = f.hooks.set = null;
    if (submitted) { await assert.rejects(manager.move('a', 'up', { expectedRevision: 7 }), rejects('CONFLICT')); assert.equal(f.writes.length, 1); }
});

test('workspace reorder: sessions, running Focus, drafts, snapshots and later append retain their semantics', async () => {
    const f = fixture(), manager = f.manager(); await manager.ready(); const session = manager.capture('a'); await session.ready();
    const identity = [session.id, session.generation], before = await manager.exportSnapshot();
    const draft = { text: 'Synthetic unsaved field', focus: 'editor' }; const savedDraft = clone(draft);
    await manager.move('a', 'up', { expectedRevision: 7 });
    const after = await manager.exportSnapshot(); assert.deepEqual(after.bundles, before.bundles); assert.deepEqual(draft, savedDraft);
    await session.ready(); assert.deepEqual([session.id, session.generation], identity); assert.equal(session.invalidated, false);
    const fresh = f.manager(); assert.deepEqual(activeIds(await fresh.list()), ['a', 'default', 'b']);
    const added = await manager.create('Added'); assert.equal(added.order, 91);
    const duplicate = await manager.duplicate('default', 'Copied'); assert.equal(duplicate.order, 92);
    await manager.restore('trash'); assert.equal(f.registry().workspaces.find(item => item.id === 'trash').order, 40);
    assert.deepEqual(f.providers, []);
});


test('workspace reorder: late legacy-conflict notification before submission blocks the new move', async () => {
    const f = fixture(), manager = f.manager(); await manager.ready(); f.reset(); let checks = 0;
    const before = clone(f.raw);
    f.hooks.get = keys => {
        if (keys.length === 1 && keys[0] === RESTORE && ++checks === 2) {
            f.notify({ __localItabWorkspaceLegacyConflictV1: { newValue: { schemaVersion: 1, id: 'late-legacy', detectedAt: NOW, keys: ['links'] } } });
        }
    };
    await assert.rejects(manager.move('a', 'up', { expectedRevision: 7 }), rejects('LEGACY_CONFLICT'));
    assert.deepEqual(f.raw, before); assert.deepEqual(f.writes, []);
});


test('workspace reorder: already-known legacy conflict prevents all writes', async () => {
    const f = fixture(), manager = f.manager(); await manager.ready(); f.reset();
    f.notify({ __localItabWorkspaceLegacyConflictV1: { newValue: { id: 'legacy-conflict' } } });
    await assert.rejects(manager.move('a', 'up', { expectedRevision: 7 }), rejects('LEGACY_CONFLICT'));
    assert.deepEqual(f.writes, []);
});

test('workspace reorder: a revision changed while waiting for the lifecycle lock is checked inside it', async () => {
    const f = fixture(), manager = f.manager(); await manager.ready(); f.reset();
    let release; const gate = new Promise(resolve => { release = resolve; });
    const blocked = manager.transaction(async registry => { await gate; registry.revision++; await manager.commit(registry); });
    const pending = manager.move('a', 'up', { expectedRevision: 7 });
    release(); await blocked; const before = clone(f.raw);
    await assert.rejects(pending, rejects('CONFLICT')); assert.deepEqual(f.raw, before); assert.equal(f.writes.length, 1);
});
